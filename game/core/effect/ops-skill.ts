// EffectAbilityHandler.cs:1291-1392 (SetSkill) —— 内核批二: 「改写一个出手位的技能」的算子本体。
//
// 这支算子是**元算子**: 它不产生伤害, 而是改技能对象 (id/effect/任意 identifier), 所以它把
// Skill.cs 的整条写侧 (SetSkillIdentifier)、四支特殊技工厂、ListHelper.Random 与 UnitSkillSystem.
// PrepareDamageParam 全串在一起 —— 这也是它排在批二而不是长尾的原因。
//
// 六处只有照搬才对得上的形状:
//   · :1293-1297 五把键的**缺省** (me/null/none/'+/"0") 决定了后面所有分支的走向 ——
//     type 缺省 "none" 意味着一张不写 type 的效果卡会走到末尾的通用支, 而不是被拒绝。
//   · **没有** `state == null` 守卫 (对比 Capture :68 / PetChange :110): 常驻壳在这里是 NRE,
//     而 NRE 发生在 `invokeUnit.id` 上 —— 五把键已经读完了。
//   · :1312 `new Skill(value switch {...})` —— switch 的结果**再过一次拷贝构造**。所以 "-3" 拿到
//     null (当前技能不是換场技) 时炸的是拷贝构造的 `rhs.id`, 而 "-1"/"-4" 那两支虽然工厂已经 new 过
//     一只, 落进技能位的仍是**它的副本**; GetPetChangeSkillWithTiming 的"非換场返回同一个对象"也在这里被拷开。
//   · :1322 `if (!isSetAnger) newSkill.anger = lhsUnit.skill.anger` —— 读的是**当前**技能 (可能是 null ⇒ NRE),
//     而且在装填**之前**; 于是"换技能"默认继承旧技能的怒气, 只有 set_anger=true 才用新技能自己的。
//   · :1364 `Identifier.GetSkillIdentifier(type, lhsSystem, key)` 排在 order.direction 分支**之前** ——
//     所以 `type="effect"` 掷出空表穿透到通用支时, 先解一次 "effect" 这个键 (查不到 ⇒ float.MinValue ⇒
//     落 GetNumIdentifier 的兜底链), 而不是直接放弃。
//   · :1382 的 `battle.settings.parallelCount` 读的是宿主存档里的 currentBattle, 与 `state.settings` 是
//     **同一个对象** (Battle.cs:13 把 settings 转给 BattleState), 所以移植体取 state.settings;
//     这条转发的等价性由 §门禁的 parallelCount>1 向量组拍 (par=1 与 par=2 的游标写入差就是它)。
//
// native 三支 (生成阶段不发向量, 口径同 powerup/capture/pet_change):
//   · "random" ⇒ Skill.GetRandomSkill 的 UnityEngine.Random.Range;
//   · "random[available]" ⇒ ListHelper.Random + GetAvailableSkills 的怒气管线;
//   · type="parallelTargetIndex" 且 value=="random" ⇒ FindAllIndex(...).Random()。
// 两支托管短路**可比**: type="effect" 的 `!repeat && count > 列表长度` (整表拷贝) 与 count=0 (空表 ⇒ 穿透),
// 都在掷点之前 return。

import type { Effect } from './effect.ts'
import { EffectTiming } from './effect-database.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import type { Rng } from '../rng.ts'
import { dictGet, isEmpty, listGet, listRandom } from '../collections.ts'
import { boolParse, boolTryParse } from '../strutil.ts'
import { toInt } from '../mathf.ts'
import { operate } from '../parser/operator.ts'
import { getSkillIdentifier as parseIdentifierSkill, parseEffectOperation } from '../parser/identifier-effect.ts'
import {
  addSkillEffects, cloneSkill, escapeSkill, getSkill, getSkillIdentifier, noOpSkill, petChangeSkillWithTiming,
  randomSkill, setSkillEffects, type SkillRecord,
} from '../battle/views.ts'

// native ListHelper.Random 的注入缝 (未注入即抛, 与 ops-pet / ops-buff 同一条纪律)。
// 注意这是个**惰性**缝: 三只掷点里只有走到掷点那一步才碰它, 短路支 (type="effect" 那两支) 不碰。
let OPS_RNG: Rng | null = null
export const setOpsSkillRng = (r: Rng | null): void => { OPS_RNG = r }
const notInjected = (): never => { throw new Error('NOT_PORTED: SetSkill 的 random 支要 native ListHelper.Random ⇒ 不可比, 用 setOpsSkillRng 注入') }
const LAZY_RNG: Rng = {
  next01: notInjected, nextInt: notInjected, nextFloat: notInjected, pick: notInjected, seed: notInjected,
}
// ListHelper.Random() 单取: 越界落到 `values.Get(index)` 的 default(T)。T 是 int 时 default 是 **0**
// (空表也返回 0, 不抛), 所以这里把 listPickRandom 的 null 收成 0 才是上游。
const randomIntOne = (values: number[]): number => {
  if (OPS_RNG === null) notInjected()
  return listGet(values, OPS_RNG!.nextInt(0, values.length)) ?? 0
}

/** "random[available]" 支 (:1318) —— 怒气管线 + native 掷点; 抽到 null 也要交给拷贝构造去炸。 */
const availableRandomSkill = (lhsUnit: Unit): SkillRecord | null => {
  const pet = lhsUnit.pet as BattlePetView
  const pool = pet.skillController.getAvailableSkills(pet.anger)
  if (OPS_RNG === null) notInjected()
  return OPS_RNG!.pick(pool) as SkillRecord | null
}

/** EffectAbilityHandler.cs:1291-1392 —— 改一个出手位的技能: 换整只技能 / 换效果表 / 写任意 identifier。 */
export function setSkill(effect: Effect, state: BattleState | null): boolean {
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const key = dictGet(effect.abilityOptionDict, 'key', null)
  const type = dictGet(effect.abilityOptionDict, 'type', 'none')!
  const op = dictGet(effect.abilityOptionDict, 'op', '+')!
  const value = dictGet(effect.abilityOptionDict, 'value', '0')!

  // :1299-1303 —— 五把键读完才碰 state。上游没有 state==null 守卫 ⇒ 这里让它自然地炸在
  // getUnitById 上 (与 Capture 的 :68 早退是两支不同的算子, 别"顺手统一")。
  const st = state as BattleState
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me' ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)) as Unit
  const rhsUnit = st.getRhsUnitById(lhsUnit.id) as Unit
  const lhsSystem = lhsUnit.skillSystem as NonNullable<Unit['skillSystem']>
  const lhsSkill = lhsSystem.getSkillByKey(key)

  if (type === 'id') {
    const setAnger = dictGet(effect.abilityOptionDict, 'set_anger', 'false')!
    const resetParam = dictGet(effect.abilityOptionDict, 'reset_param', 'false')!
    // :1309 —— 双 TryParse 任一失败整条 return false (C# 的 || 短路只省第二次解析, 两次都无副作用)。
    const a = boolTryParse(setAnger)
    if (!a.ok) return false
    const b = boolTryParse(resetParam)
    if (!b.ok) return false
    const isSetAnger = a.value
    const isResetParam = b.value

    // :1312-1320 —— switch 的结果再走一次拷贝构造。"-3" 用的是**当前** key 对应的那只技能
    // (lhsSkill 不是換场技时 GetPetChangeSkillWithTiming 原样返回它 ⇒ 换上的仍是它的副本)。
    let sourceSkill: SkillRecord | null
    switch (value) {
      case '-1': sourceSkill = noOpSkill(); break
      case '-3': sourceSkill = petChangeSkillWithTiming(lhsSkill, EffectTiming.OnTurnEnd); break
      case '-4': sourceSkill = escapeSkill(); break
      // GetRandomSkill 的 while(true)+native Range: 默认即抛, 向量生成阶段不发。
      case 'random': sourceSkill = randomSkill(); break
      case 'random[available]': sourceSkill = availableRandomSkill(lhsUnit); break
      default: sourceSkill = getSkill(toInt(parseEffectOperation(value, effect, lhsUnit, rhsUnit)))
    }
    const newSkill = cloneSkill(sourceSkill as SkillRecord)

    // :1322-1323 —— 怒气从**旧**技能继承 (旧技能为 null ⇒ NRE, 上游在装填前就解引用它)。
    if (!isSetAnger) newSkill.anger = lhsUnit.skill!.anger

    // :1325-1333 —— 只有 "counter" 这一个具名键; 其余 (含 null) 一律换当前技能位。
    if (key === 'counter') lhsSystem.counterSkill = newSkill
    else lhsSystem.skill = newSkill

    // :1335-1336 —— reset_param 用**当前回合**的攻防宠重算参数。实参在进函数之前就求值:
    // whosTurn==0 时 state.atkUnit 为 null, 炸的是取 .pet, 而不是 PrepareDamageParam 里的守卫。
    if (isResetParam) lhsSystem.prepareDamageParam(st.atkUnit!.pet, st.defUnit!.pet)
    return true
  }

  if (type === 'effect') {
    const randomTypeCountExpr = dictGet(effect.abilityOptionDict, 'random_count', '1')!
    const randomRepeatExpr = dictGet(effect.abilityOptionDict, 'random_repeat', 'false')!
    const randomTypeCount = toInt(parseEffectOperation(randomTypeCountExpr, effect, lhsUnit, rhsUnit))

    // :1347-1348 —— value 按 '/' 切成技能 id 列表, 再抽 randomTypeCount 个。
    // `bool.Parse` (不是 TryParse) ⇒ random_repeat 写错在这里抛 FormatException。
    const skillIdList = value.split('/').map((x) => toInt(parseEffectOperation(x, effect, lhsUnit, rhsUnit)))
    const picked = listRandom(skillIdList, randomTypeCount, boolParse(randomRepeatExpr), LAZY_RNG)

    if (!isEmpty(picked)) {
      // :1352-1353 —— 逐个技能取 effects 并**逐条 new Effect(x)** (深拷, 共享 source 会串账)。
      // GetSkill(id, false) 是 avoidNull=false ⇒ 查不到给 null ⇒ `?? new List` 那条兜空。
      const effectList: Effect[] = []
      for (const skillId of picked) {
        const s = getSkill(skillId, false)
        if (s === null) continue
        for (const x of s.effects) effectList.push(x.clone())
      }
      // :1355-1358 —— 装填走 `GetSkillByKey(key)?.…`, 所以技能位为空时**静不写**但仍 return true;
      // 而 op 既不是 "SET" 也不是 "+" 时同样 return true 什么都不做 (穿透只属于空表那一支)。
      const target = lhsSystem.getSkillByKey(key)
      if (target !== null) {
        if (op === 'SET') setSkillEffects(target, effectList)
        else if (op === '+') addSkillEffects(target, effectList)
      }
      return true
    }
    // 空表 ⇒ **穿透**到通用支 (type 仍是 "effect")。
  }

  // :1364-1365 —— 通用支: 先读旧值 (走 Identifier 的 skillSystem 版链, 含 GetNumIdentifier 兜底),
  // 再解析新值。两支都在 order.direction 分支之前求值, 这是顺序语义而不是冗余。
  const oldValue = parseIdentifierSkill(type, lhsSystem, key)
  let newValue = parseEffectOperation(value, effect, lhsUnit, rhsUnit)

  if (type === 'order.direction') {
    // :1369-1371 —— 行动序方向写在**状态**上 (state.options 的 order_direction), 与 lhsSystem 无关。
    const oldOrderDir = st.getStateIdentifier('order.direction')
    st.setStateIdentifier('order.direction', operate(op, oldOrderDir, newValue))
    return true
  } else if (type === 'parallelTargetIndex' && value === 'random') {
    // :1377 —— 袋里所有 (非 null && 未死) 的下标取一个; newValue 在前面那行已经解析过一次,
    // 这里整个**覆盖**掉它 ("random" 走 GetNumIdentifier 的兜底值被丢弃, 上游就是这么写的)。
    const bag = rhsUnit.petSystem.petBag
    const idx: number[] = []
    for (let i = 0; i < bag.length; i++) {
      const x = bag[i]
      if (x !== null && x !== undefined && !x.isDead) idx.push(i)
    }
    newValue = randomIntOne(idx)
  }

  // :1380 —— 写回: default 支落到 Skill.SetSkillIdentifier, 具名支落 UnitSkillSystem 自己的字段。
  lhsSystem.setSkillSystemIdentifier(type, operate(op, oldValue, newValue), key)

  // :1382-1389 —— 并行战斗还要把**对面**的游标搬到那一只上; 越界或空位 ⇒ return false (但技能已经写过了)。
  if (st.settings.parallelCount > 1 && type === 'parallelTargetIndex') {
    const target = lhsSystem.getSkillByKey(key)
    // :1384 是 `?.GetSkillIdentifier(...) ?? 0` —— 与 :1364 那条 Identifier 链**不是同一个函数**,
    // 技能位为空时这里给 0, 而上面那条会 NRE。
    const cursor = toInt(target === null ? 0 : getSkillIdentifier(target, 'parallelTargetIndex'))
    if (listGet(rhsUnit.petSystem.petBag, cursor) === null) return false
    rhsUnit.petSystem.cursor = cursor
  }

  return true
}
