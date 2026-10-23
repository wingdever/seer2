// EffectAbilityHandler.cs 里耦合最低的两支算子 —— SetDamage (:1235-1289) 与 AddStatus (:627-676)。
// 本文件是「算子本体」批一的第一块, 目的除了搬规则, 还有一条: 把
//   oracle 白名单 → Apply 外壳 → 真算子 → 扩过的签名 这条管道整个跑通,
// 所以两支都**不掷骰、不碰印记触发链**, 一次就能把形状钉住。
//
// 三处必须照搬的上游形状 (逐条有向量/单测锁):
//   · SetDamage 的时机键名是 **`state`** (:1238), 不是 `target_state`; 值 `"last"` ⇒ 换到 `state.lastTurnState`。
//   · SetDamage :1251 的 `who=="me"` 支读的是**参数 state**, 而不是刚换出来的 damageState ——
//     于是 `state:"last" + who:"me"` 时, 记账本的是**当前回合**的 skillSystem, 而伤害数值取的是**上一回合**的。
//     这是上游事实, 别"顺手修一致"。
//   · AddStatus :635 的 `ToIntList('/')` 走的是 Helper.cs:177-202 的 ToFloatList ⇒ 每段先 float.TryParse,
//     失败再 `Identifier.GetNumIdentifier` (无上下文), 解析回 0 视为失败并**整表 null** ⇒
//     `IsNullOrEmpty(null)` ⇒ `return false`。**没有 int.Parse**, 畸形串多半是"整条不算"而不是抛。
//
// headless: 无 UnityEngine / Player.instance / Database.instance。表达式求值一律走
// parser/identifier-effect.ts 的 parseEffectOperation; 无上下文标识符走 identifier.ts#getNumIdentifier
// (与判定层 numId 同一个 host)。

import type { Effect } from './effect.ts'
import { EffectTiming } from './effect-database.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import { UnitSkillSystem } from '../battle/unit-skill-system.ts'
import { getBattlePetTargetList } from '../battle/target.ts'
import { dictGet } from '../collections.ts'
import { toInt } from '../mathf.ts'
import { toIntList } from '../strutil.ts'
import { operate } from '../parser/operator.ts'
import { parseEffectOperation, effectIdentHost } from '../parser/identifier-effect.ts'
import { getNumIdentifier } from '../parser/identifier.ts'

// Effect.cs 里的相位是 int 枚举; `state.phase` 与 `EffectTiming.OnTurnEnd` 比的是当前**参数 state** 的相位
// (上游 :1262 用的就是 state 而不是 damageState —— 与 :1251 那条同源的不整齐)。

/** EffectAbilityHandler.cs:1235-1289 —— 只写账本, **不扣血** (伤害落账在 AttackPhase/DamageCalculatePhase)。 */
export function setDamage(effect: Effect, state: BattleState | null): boolean {
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const turn = dictGet(effect.abilityOptionDict, 'state', 'current')!
  const type = dictGet(effect.abilityOptionDict, 'type', 'skill')!
  const op = dictGet(effect.abilityOptionDict, 'op', '+')!
  const value = dictGet(effect.abilityOptionDict, 'value', '0')!
  const option = dictGet(effect.abilityOptionDict, 'option', null)

  // :1244-1248 —— state==null 且 turn=="last" 时上游读 state.lastTurnState 就是 NRE, 这里同样抛
  // (`state` 声明成可空但**不兜底**)。
  const damageState = (turn === 'last') ? (state as BattleState).lastTurnState : state

  // :1250-1252 —— `(Unit)effect.invokeUnit` 为 null 时上游 NRE; 这里读 .id 同样抛。
  const invokeUnit = effect.invokeUnit as Unit
  const damageUnit = (who === 'me') ? state!.getUnitById(invokeUnit.id) : damageState!.getRhsUnitById(invokeUnit.id)
  const skillSystem = damageUnit!.skillSystem
  let damage = 0

  // :1255-1260 —— damageState 为 null (last 且无上一回合) 时**不解析数值**, damage 保持 0。
  if (damageState !== null) {
    const lhsUnit = damageState.getUnitById(invokeUnit.id)
    const rhsUnit = damageState.getRhsUnitById(lhsUnit!.id)
    damage = parseEffectOperation(value, effect, lhsUnit!, rhsUnit!)
  }

  // :1262 —— 这一支在 `type=="skill"` **之前**, 所以 OnTurnEnd 时 `type:"skill"` 落的是 buffDamage。
  if ((state!.phase === EffectTiming.OnTurnEnd) && UnitSkillSystem.NORMAL_HP_TYPE.includes(type)) {
    skillSystem!.buffDamage = toInt(operate(op, skillSystem!.buffDamage, damage))
    return true
  }
  if (type === 'skill') {
    skillSystem!.skillDamage = toInt(operate(op, skillSystem!.skillDamage, damage))
    return true
  }
  if (type === 'item') {
    skillSystem!.itemDamage = toInt(operate(op, skillSystem!.itemDamage, damage))
    return true
  }

  // :1276-1285 —— 三个 option 词都是**在既有键里筛**, 筛不到就什么都不写 (不新建键)。
  // 逐项赋值改的是已存在的键 ⇒ .NET 的 enumerator 不失效, 所以「边枚举边改」在上游合法;
  // 这里先把匹配键物化, 行为等价 (没有插入/删除)。
  let keys: string[]
  switch (option) {
    case 'start': keys = [...skillSystem!.damageDict.keys()].filter((x) => x.startsWith(type)); break
    case 'end': keys = [...skillSystem!.damageDict.keys()].filter((x) => x.endsWith(type)); break
    case 'contain': keys = [...skillSystem!.damageDict.keys()].filter((x) => x.split('_').includes(type)); break
    default: keys = [type]
  }
  for (const key of keys)
    skillSystem!.damageDict.set(key, toInt(operate(op, dictGet(skillSystem!.damageDict, key, 0)!, damage)))

  return true
}

/** EffectAbilityHandler.cs:627-676 —— 先乘后加 (:667-671), 注释掉的那行 (:670) 没有捡回来。 */
export function addStatus(effect: Effect, state: BattleState | null): boolean {
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const key = dictGet(effect.abilityOptionDict, 'key', 'current')!
  const type = dictGet(effect.abilityOptionDict, 'type', '5')!
  const mult = dictGet(effect.abilityOptionDict, 'mult', '0/1')!
  const add = dictGet(effect.abilityOptionDict, 'add', '0')!

  // Helper.cs:212-218 —— 无上下文 GetNumIdentifier 兜底; 解析回 0 ⇒ 整表 null ⇒ 等价「没配 type」。
  const typeList = toIntList(type, '/', (id) => getNumIdentifier(id, effectIdentHost()))
  if (typeList === null || typeList.length === 0) return false

  const st = state as BattleState
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = st.getRhsUnitById(lhsUnit!.id)
  const targetList = getBattlePetTargetList(st, effect, lhsUnit!, rhsUnit!)

  for (let j = 0; j < targetList.length; j++) {
    // :646 —— defaultPet 可以是 null (袋子洞 / 无上场宠), 上游照样解引用 ⇒ NRE; 这里同样抛。
    const statusController = targetList[j]!.statusController

    for (let i = 0; i < typeList.length; i++) {
      const statusType = typeList[i]
      // :652-653 —— 两个表达式**每只宠、每一维都重算一遍** (表达式若读可变状态, 结果会随循环漂移)。
      const statusMult = parseEffectOperation(mult, effect, lhsUnit!, rhsUnit!)
      const statusAdd = toInt(parseEffectOperation(add, effect, lhsUnit!, rhsUnit!))

      // :655-665 —— MultInitStatus 的 `int type` **收而不读** (整条 init 表一起乘),
      // MultCurrentStatus 则逐维; 这条不对称在 status-controller.ts:241 已登记。
      if (statusMult !== 0) {
        if (key === 'init') statusController.multInitStatus(statusType, statusMult)
        else statusController.multCurrentStatus(statusType, statusMult)
      }

      if (key === 'init') statusController.addInitStatusType(statusType, statusAdd)
      else statusController.addBattleStatus(statusType, statusAdd)
    }
  }

  return true
}
