// EffectAbilityHandler.cs:108-163 (PetChange) —— 第七段·批三: 换宠算子搬进内核 (多宠模型早已就位)。
//
// 上游那条**守卫顺序**是承重的, 逐条钉住 (三条 return false 都在**取随机源与 applyBuffs 之前**, 于是可比):
//   · :110 `state==null` → false;
//   · :122 `target=="random" && randomIndexList.Count==0` → false (单宠袋 ⇒ 没得换);
//   · :126 `targetIndex < 0` → false (字面 target_index 解析成负 ⇒ 不落地, 例如缺省的 "-1");
// 三条都不碰 `state.ApplyBuffs()`、不掷骰 ⇒ oracle 可发可比向量。
//
// 只有**换场成功支** (target_index 解析成 ≥0) 才走后面一整串突变:
//   OnBeforePetChange→ApplyBuffs / 记 isDead+anger / 卸 !keep 印记 / cursor 移动 / RefreshStayTurn /
//   按 isDead 继承 inherit|legacy / 收场 anger = FloorToInt(anger × 63档/100 × 64档/100) /
//   myUnit 记 fightPetCursor / OnAfterPetChange→ApplyBuffs。这些全在 sigState 面里
//   (sigPetSys `cur=`、整只 bag 的 id/hp/anger/stayTurn/buffs、sigResult `fightPetCursors`) ⇒ 可比。
//
// 两处 native RNG 缝 (照 ops-buff 的口径, oracle **不发**这两支、本仓 node --test 注入锁形状):
//   · :125 `target=="random"` 那支的 `randomIndexList.Random()` (ListHelper.Random 是 native ECall)。
//   · 换场成功支本身**不掷**, 只有 `target=="random" 且袋里有备选` 才掷 ⇒ 那条生成阶段不发。
//
// 数值纪律: 三个 float 比值 (:139/:149 的 `?? 80/100f` 与 `?? 100/100f`) 与 :150 的
// `FloorToInt(anger × send × receive)` 都按 C# 的 float 左结合逐步 f() 收窄 (两次乘法各 round 一次),
// 别合并成一次 —— 与 damage.ts 的 captureValue 血线同款口径。

import type { Effect } from './effect.ts'
import { EffectTiming } from './effect-database.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import type { Buff } from '../buff/buff.ts'
import type { Rng } from '../rng.ts'
import { dictGet } from '../collections.ts'
import { f, floorToInt, toInt } from '../mathf.ts'
import { parseEffectOperation } from '../parser/identifier-effect.ts'

// native ListHelper.Random 的注入缝 (未注入即抛, 与 ops-buff 同一条纪律)。
let OPS_RNG: Rng | null = null
export const setOpsPetRng = (r: Rng | null): void => { OPS_RNG = r }
const randomOne = (list: number[]): number => {
  if (OPS_RNG === null) throw new Error('NOT_PORTED: PetChange 的 random 支要 native ListHelper.Random ⇒ 不可比, 用 setOpsPetRng 注入')
  return OPS_RNG.pick(list) as number
}

/** EffectAbilityHandler.cs:108-163 —— 换下一只宠: 守卫三支可比, 成功支整串突变可比, random 掷点支不可比。 */
export function petChange(effect: Effect, state: BattleState | null): boolean {
  // :110 —— 常驻壳直接不算。
  if (state === null) return false
  const st = state

  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const target = dictGet(effect.abilityOptionDict, 'target_index', '-1')!

  // :116-118 —— 取单位 (与 capture 一样: 解引用 invokeUnit.id 之前没有别的守卫)。
  const invokeUnit = effect.invokeUnit as Unit
  const rhsUnit = st.getRhsUnitById(invokeUnit.id) as Unit
  const petChangeUnit = (who === 'me' ? st.getUnitById(invokeUnit.id) : rhsUnit) as Unit

  // :121 —— 候选下标 = 袋里 (非 null && 非当前宠 && 未死)。只在 random 支才真正用它掷点。
  const petBag = petChangeUnit.petSystem.petBag
  const current = petChangeUnit.pet
  const randomIndexList: number[] = []
  for (let i = 0; i < petBag.length; i++) {
    const x = petBag[i]
    if (x !== null && x !== undefined && x !== current && !x.isDead) randomIndexList.push(i)
  }

  // :122-123 —— random 且没得换 → false (取随机源之前)。
  if (target === 'random' && randomIndexList.length === 0) return false

  // :125 —— random 掷点 (native, oracle 不发) vs 字面/表达式 target_index。
  const targetIndex = (target === 'random')
    ? randomOne(randomIndexList)
    : toInt(parseEffectOperation(target, effect, invokeUnit, rhsUnit))

  // :126-127 —— 负下标 → false (同样在 applyBuffs 之前)。
  if (targetIndex < 0) return false

  // :130-133 —— OnBeforePetChange 借相位跑一次印记 (空袋无印记即无副作用, 两侧同代码)。
  const tmpPhase = st.phase
  st.phase = EffectTiming.OnBeforePetChange
  st.applyBuffs()
  st.phase = tmpPhase

  // :137-141 —— 离场宠 (旧 cursor) 的 isDead / anger / 63 档 / 继承集, 全在移动 cursor **之前**读。
  const outPet = petChangeUnit.pet as BattlePetView
  const isDead = outPet.isDead
  const anger = outPet.anger
  const petSendAngerRatio = f((outPet.buffController.getBuff(63)?.value ?? 80) / 100)
  const inheritBuffs: Buff[] = outPet.buffs.filter((x) => x.info.inherit)
  const legacyBuffs: Buff[] = outPet.buffs.filter((x) => x.info.legacy)

  // :144-146 —— 卸掉不 keep 的印记; cursor 移动; 全体 stayTurn 归零。
  outPet.buffController.removeRangeBuff((buff: Buff) => !buff.info.keep, petChangeUnit, st)
  petChangeUnit.petSystem.cursor = targetIndex
  petChangeUnit.petSystem.refreshStayTurn()

  // :149-151 —— 64 档读的是**上场宠** (cursor 已移); anger = FloorToInt(anger × send × receive) 两步 f() 收窄。
  const inPet = petChangeUnit.pet as BattlePetView
  const petReceiveAngerRatio = f((inPet.buffController.getBuff(64)?.value ?? 100) / 100)
  inPet.anger = floorToInt(f(f(anger * petSendAngerRatio) * petReceiveAngerRatio))
  inPet.buffController.addRangeBuff(isDead ? legacyBuffs : inheritBuffs, petChangeUnit, st)

  // :154-155 —— 我方换场才记进 fightPetCursors (对手换场不记)。
  if (petChangeUnit.id === st.myUnit.id) st.result.addFightPetCursor(targetIndex)

  // :158-160 —— OnAfterPetChange 再借相位跑一次印记。
  st.phase = EffectTiming.OnAfterPetChange
  st.applyBuffs()
  st.phase = tmpPhase

  return true
}
