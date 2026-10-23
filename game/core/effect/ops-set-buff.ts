// EffectAbilityHandler.cs:1162-1197 —— SetBuff：按 key 选出一批印记，对每条印记的某标识符做 op 运算。
// 与 AddBuff/RemoveBuff（ops-buff.ts）同属印记家族，但 SetBuff 只改「标识符数值」，不增删印记本体
// （除了 type=="id" 换 id 的 OnAddBuff，以及 autoRemove 触发的摘除）。
//
// 三条必须照搬的上游形状：
//   - key==""（默认）：从 lhsUnit.pet.buffController 取印记（buffId==0 整袋按 filter 筛；否则按 id 单取）；
//     type=="id" 换完 id 后调 OnAddBuff，autoRemove 且 value<=0 时调 controller.removeBuff。
//   - key=="unit"：直接在 lhsUnit.unitBuffs 上筛（filter && id 匹配）；摘除走 unitBuffs RemoveAll。
//   - key 为其它：在 state.stateBuffs（[key, Buff] 表）里按 key 筛出 value 列表；摘除走 stateBuffs RemoveAll。
//   - value 表达式不带 buff 上下文（只 lhs/rhs）；filter 表达式才带 buff（otherSource）。
//
// headless：无 UnityEngine / Player.instance / Database.instance；表达式一律走 parseEffectOperation。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { Buff } from '../buff/buff.ts'
import { dictGet } from '../collections.ts'
import { operate } from '../parser/operator.ts'
import { parseEffectOperation } from '../parser/identifier-effect.ts'
import { parseConditionFilter } from '../parser/parser.ts'

// C# filter 选择器对 null buff 回 float.MinValue => 任意比较都不成立（与 ops-buff.ts 同形；golden 不会喂 null buff）。
const FILTER_NULL = -3.4028234663852886e38  // float.MinValue

/** EffectAbilityHandler.cs:1162-1197 —— 设置印记的某个标识符。 */
export function setBuff(effect: Effect, state: BattleState | null): boolean {
  const key = dictGet(effect.abilityOptionDict, 'key', '')!
  const filterList = dictGet(effect.abilityOptionDict, 'filter', 'none')!
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const id = dictGet(effect.abilityOptionDict, 'id', '0')!
  const type = dictGet(effect.abilityOptionDict, 'type', 'value')!
  const op = dictGet(effect.abilityOptionDict, 'op', '+')!
  const value = dictGet(effect.abilityOptionDict, 'value', '0')!

  const st = state as BattleState
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = st.getRhsUnitById(lhsUnit!.id)

  const buffId = parseEffectOperation(id, effect, lhsUnit!, rhsUnit!)
  const filter = parseConditionFilter<Buff>(filterList, (ids, buff) =>
    ids.map((expr) => (buff === null
      ? FILTER_NULL
      : parseEffectOperation(expr, effect, lhsUnit!, rhsUnit!, buff, false))),
  )

  let buffList: Buff[]
  if (key === '') {
    if (buffId === 0) buffList = lhsUnit!.pet!.buffController.getRangeBuff((x) => filter(x))
    else {
      const b = lhsUnit!.pet!.buffController.getBuff(buffId)
      buffList = b === null ? [] : [b]
    }
  } else if (key === 'unit') {
    buffList = lhsUnit!.unitBuffs.filter((x) => filter(x) && x.id === buffId)
  } else {
    buffList = st.stateBuffs.filter((x) => x[0] === key).map((x) => x[1])
  }

  const newValue = parseEffectOperation(value, effect, lhsUnit!, rhsUnit!)
  let success = false
  for (const buff of buffList) {
    if (buff === null) continue

    const oldValue = buff.getBuffIdentifier(type)
    buff.setBuffIdentifier(type, operate(op, oldValue, newValue))

    if (type === 'id') {
      if (key === '') lhsUnit!.pet!.buffController.onAddBuff(buff, lhsUnit!, st)
    }

    if (buff.info.autoRemove && buff.value <= 0) {
      if (key === '') lhsUnit!.pet!.buffController.removeBuff(buff, lhsUnit!, st)
      else if (key === 'unit') lhsUnit!.unitBuffs = lhsUnit!.unitBuffs.filter((x) => x !== buff)
      else st.stateBuffs = st.stateBuffs.filter((x) => x[1] !== buff)
    }
    success = true
  }
  return success
}
