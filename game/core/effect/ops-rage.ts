// EffectAbilityHandler.cs:354-471 (Rage) —— 批五算子长尾。
// 怒气（anger）与技能 PP（pp）两支共用的算子：先按 add/set/min/max 算出目标怒气/PP，中间插一段
// OnEffect 修正链（把别人挂上来的 OnEffect 时机效果读出来、按 priority 逐条改写本地变量），最后落值。
//
// 必须照搬的上游形状：
//   · OnEffect 过滤器用**候选效果 x** 的 condition 建、却**判外层 effect**（`…(effect)`，与 heal 同形）；
//     switch 映射 add/rec/set/max/min/type[anger]/type[pp]，default 走 e.TryGetEffectIdentifier 再落无上下文 GetNumIdentifier。
//   · 修正循环里 `effectLhsUnit.id != lhsUnit.id ⇒ return`（别人 unit 上的效果不作用本条）；
//     `type` 为空/null 时**连 PostProcess 都不跑**（return 在 switch 之前）。
//   · 每个 case 体里现算 ParseEffectOperation(value,…) ⇒ type 是别的词时 value 不解析（抛点/副作用都不发生）。
//   · anger 支：先写 statusController.minAnger/maxAnger，**再** anger += angerAdd（顺序决定 clamp 用新上下限）；
//     `angerAdd = (int)(rage * (rage>0 ? rec/100f : 1))` ⇒ 负怒气不打折；set!="none" 时直接 anger=setAnger。
//   · rec 取 `lhsUnit.pet.battleStatus.angrec`（battleStatus 每次现算，取一次快照）。
//   · pp 支：skillController.allSkills 滤掉 null 再按 filter 筛；isRandom 时 .Random(count)；
//     set=="none" 时 PP += (int)rage，否则 PP = setAnger（PP 读写都 int 夹紧 [0,maxPP]）。
//   · isRandom = bool.Parse(random) ⇒ 非 true/false 串**抛**（不是 TryParse 兜 false）。
//   · 上游那个 `mult` 局部量**从头到尾没用**（死变量）⇒ 不搬。
//
// headless：无 UnityEngine / Player.instance / Database.instance。pp 支的 .Random 走本文件 OPS_RNG 注入缝
// （未注入显式抛 ⇒ 不可比, 留给 R1 + 手测）。postProcess 从 effect-judge 借（ESM 循环依赖安全，同 heal）。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { SkillRecord } from '../battle/views.ts'
import type { Rng } from '../rng.ts'
import { EffectTiming } from './effect-database.ts'
import { dictGet } from '../collections.ts'
import { f, toInt } from '../mathf.ts'
import { operate } from '../parser/operator.ts'
import { parseConditionFilter } from '../parser/parser.ts'
import { parseEffectOperation, effectIdentHost } from '../parser/identifier-effect.ts'
import { getNumIdentifier } from '../parser/identifier.ts'
import { tryGetSkillIdentifier, skillPP, setSkillPP } from '../battle/views.ts'
import { postProcess } from './effect-judge.ts'
import { listRandom } from '../collections.ts'

// native UnityEngine.Random 的注入点（pp 支 isRandom 时的 .Random(count)）。
let OPS_RNG: Rng | null = null
export const setOpsRageRng = (r: Rng | null): void => { OPS_RNG = r }

const noRng = (where: string): never => {
  throw new Error('NOT_PORTED: ' + where + ' 要 native ListHelper.Random ⇒ 不可比, 用 setOpsRageRng 注入')
}

// bool.Parse：只认大小写不敏感的 true/false，否则抛（与 C# bool.Parse 同形，不是 TryParse）。
const boolParse = (s: string): boolean => {
  const t = s.toLowerCase()
  if (t === 'true') return true
  if (t === 'false') return false
  throw new Error('FormatException: bool.Parse 不认 ' + JSON.stringify(s))
}

/** EffectAbilityHandler.cs:354-471 —— 怒气/PP 结算 + OnEffect 修正链。 */
export function rage(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const type = dictGet(effect.abilityOptionDict, 'type', 'anger')!
  const add = dictGet(effect.abilityOptionDict, 'add', '0')!
  const set = dictGet(effect.abilityOptionDict, 'set', 'none')!
  const min = dictGet(effect.abilityOptionDict, 'min', 'none')!
  const max = dictGet(effect.abilityOptionDict, 'max', 'none')!
  const filterList = dictGet(effect.abilityOptionDict, 'filter', 'none')!
  const random = dictGet(effect.abilityOptionDict, 'random', 'false')!
  const randomTypeCountExpr = dictGet(effect.abilityOptionDict, 'random_count', '-1')!

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = ((who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)) as Unit
  const rhsUnit = st.getRhsUnitById(lhsUnit.id) as Unit

  const statusController = lhsUnit.pet!.statusController
  const skillController = lhsUnit.pet!.skillController

  const isRandom = boolParse(random)
  const randomTypeCount = toInt(parseEffectOperation(randomTypeCountExpr, effect, lhsUnit, rhsUnit))
  // pp 支的技能筛（anger 支不调它；ParseConditionFilter 惰性建闭包，不会提前触发转换器）。
  const filter = parseConditionFilter<SkillRecord>(filterList, (exprs, skill) =>
    exprs.map((expr) => {
      const r = tryGetSkillIdentifier(skill, expr)
      return r.ok ? r.num : getNumIdentifier(expr, effectIdentHost())
    }))

  let rageValue = parseEffectOperation(add, effect, lhsUnit, rhsUnit)
  let rec = lhsUnit.pet!.battleStatus.angrec
  let setAnger = toInt(parseEffectOperation(set, effect, lhsUnit, rhsUnit))
  let maxAnger = (max === 'none') ? statusController.maxAnger : toInt(parseEffectOperation(max, effect, lhsUnit, rhsUnit))
  let minAnger = (min === 'none') ? statusController.minAnger : toInt(parseEffectOperation(min, effect, lhsUnit, rhsUnit))

  // :392-408 —— OnEffect 修正链：过滤器用 x.condition 建、判外层 effect（与 heal 逐字同形）。
  const handler = st.getEffectHandler(null, false)
  const onEffect = st.getEffectsByTiming(EffectTiming.OnEffect, handler, (x) =>
    parseConditionFilter<Effect>(dictGet(x.abilityOptionDict, 'condition'), (exprs, e) => exprs.map((expr) => {
      switch (expr) {
        case 'add': return rageValue
        case 'rec': return rec
        case 'set': return (set === 'none') ? -1 : setAnger
        case 'max': return (max === 'none') ? -1 : maxAnger
        case 'min': return (min === 'none') ? -1 : minAnger
        case 'type[anger]': return (type === 'anger') ? 1 : 0
        case 'type[pp]': return (type === 'pp') ? 1 : 0
        default: {
          const got = e.tryGetEffectIdentifier(expr.replaceAll('：', ':'), (s) => getNumIdentifier(s, effectIdentHost()))
          return got.ok ? got.value : getNumIdentifier(expr, effectIdentHost())
        }
      }
    }))(effect as Effect)).slice().sort((a, b) => a.priority - b.priority)

  // :410-439 —— 逐条改写那五个本地变量；type 空/null 连 PostProcess 都不跑；不同 unit 不作用。
  for (const x of onEffect) {
    const xWho = dictGet(x.abilityOptionDict, 'who', 'me')!
    const xType = dictGet(x.abilityOptionDict, 'type')
    const xOp = dictGet(x.abilityOptionDict, 'op')
    const xValue = dictGet(x.abilityOptionDict, 'value')
    if (xType === null || xType === '') continue    // return —— 连 PostProcess 都不跑

    const effectInvokeUnit = x.invokeUnit as Unit
    const effectLhsUnit = ((xWho === 'me') ? st.getUnitById(effectInvokeUnit.id) : st.getRhsUnitById(effectInvokeUnit.id)) as Unit
    if (effectLhsUnit.id !== lhsUnit.id) continue    // 修正只作用同 unit

    switch (xType) {
      case 'add': rageValue = operate(xOp!, rageValue, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit)); break
      case 'rec': rec = operate(xOp!, rec, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit)); break
      case 'set': setAnger = toInt(operate(xOp!, setAnger, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit))); break
      case 'max': maxAnger = toInt(operate(xOp!, maxAnger, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit))); break
      case 'min': minAnger = toInt(operate(xOp!, minAnger, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit))); break
      default: break
    }
    postProcess(x, true, st)
  }

  // :441-465 —— 落值。先写 min/max 再动 anger（clamp 用新上下限）。
  if (type === 'anger') {
    statusController.minAnger = minAnger
    statusController.maxAnger = maxAnger
    if (set === 'none') {
      const angerAdd = toInt(f(rageValue * (rageValue > 0 ? f(rec / 100) : 1)))
      lhsUnit.pet!.anger = lhsUnit.pet!.anger + angerAdd
    } else {
      lhsUnit.pet!.anger = setAnger
    }
  } else if (type === 'pp') {
    let ppSkills = skillController.allSkills.filter((x): x is SkillRecord => x !== null).filter((x) => filter(x))
    if (isRandom) {
      if (OPS_RNG === null) noRng('Rage pp 支的 .Random(random_count)')
      ppSkills = listRandom(ppSkills, randomTypeCount, false, OPS_RNG as Rng)
    }
    if (set === 'none') {
      for (const x of ppSkills) setSkillPP(x, skillPP(x) + toInt(rageValue))
    } else {
      for (const x of ppSkills) setSkillPP(x, setAnger)
    }
  }
  return true
}
