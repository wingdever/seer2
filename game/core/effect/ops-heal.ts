// EffectAbilityHandler.cs:165-352 (Heal) —— 第六段·批一第五步。
// 回血是这批里**下游最宽**的一支: 它既写 hp/maxHp, 又写四本治疗账本 (skillHeal/itemHeal/buffHeal/healDict
// 以及两本 overHeal), 中间还插一段 OnEffect 修正链 —— 那段会把别人挂上来的 resident 印记效果读出来、
// 按 priority 排序、逐条改写本条效果的四个本地变量。
//
// 十条必须照搬的上游形状 (逐条有向量或单测锁):
//   · :174-183 的 `state == null` 支要 `(Pet)effect.invokeUnit` 强转 ⇒ core 里没有 base Pet 模型,
//     这里**显式抛** (与 effect-judge 的 PetCondition/StatusCondition 同口径), 不兜底、不猜。
//   · :200-246 的 OnEffect 过滤器是用 `x`(候选效果) 的 `condition` 建出来的, 但**判的是外层的 effect**
//     (`...(effect)` 而不是 `...(x)`) ⇒ switch 里的 `e` 一直是这条 heal 自己。
//   · 同一个 switch 的 `key[skill]`/`key[buff]`/`key[item]` 比的是 `type.Split("_").First()` ⇒
//     `type:"skill_3"` 也算 skill; default 支先 `TryGetEffectIdentifier` 再落**无上下文**的 GetNumIdentifier。
//   · 修正循环里 `effectLhsUnit.id != lhsUnit.id ⇒ return` ⇒ 别人 unit 上的印记**不作用**在本条上;
//     而 `type` 为空/null 时**连 PostProcess 都不跑** (return 在 switch 之前)。
//   · 同一个 switch 里 `ParseEffectOperation(value, …)` 写在**每个 case 体内** ⇒ `type` 是其它词 (真表里
//     就有 `type:"unhealthy"` 这种) 时 value 压根不解析 (表达式的抛点与副作用都不发生) ⇒ 不能提前算。
//   · `set` 与 `max` 两支各有一个"阻止归零"的印记检查 (99 / -8), 命中时是 `continue` (整条这一维不做),
//     而 `max` 还多一条「降上限要被 -7 / -8 拦住」(:273) —— 两个检查的印记集合不同, 别合并。
//   · `hp <= 0 ⇒ continue` (:282, 死了不奶) 排在 set/max **之后** —— 所以濒死宠照样能被 set_hp 拉起来。
//   · 印记 100 把 rec 抬到至少 100 (:285); `healAdd = (int)(heal * (heal > 0 ? rec/100f : 1))` (:288) ⇒
//     **负治疗不打折** (直接按原值扣)。
//   · `isHealCurrentPet = (who=="me") && (target == lhsUnit.pet)` (:289) —— item/skill 两支只认**当前上场宠**,
//     而 buff 支不看这条 (`buffHeal +=` 且把 healAdd 归零 ⇒ 不扣血)。
//   · 兜底支的 `keys` 是**惰性** LINQ: `foreach` 之后再 `keys.Any(...)` 会把查询重跑一遍。这里 materialize 成
//     数组是等价的 —— Where 的键本来就来自 healDict.Keys, 循环里的赋值只会改**已有键的值** (不增不删 ⇒
//     不会二次枚举出不一样的东西); `_` 支则是一支固定单元素表。
//
// hp / maxHp 的写入走 BattlePetView 的转发 (statusController 的 clamp), overHeal 用**写入前**的 hp 算。
// `postProcess` 从 effect-judge 借 (两边都是函数声明 ⇒ 这个 import 环在 ESM 里是安全的: 用到时双方都已初始化)。
//
// headless: 无 UnityEngine / Player.instance / Database.instance。本支**一次骰都不掷**。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import { UnitSkillSystem } from '../battle/unit-skill-system.ts'
import { EffectTiming } from './effect-database.ts'
import { dictGet, isEmpty } from '../collections.ts'
import { f, max as MathfMax, toInt } from '../mathf.ts'
import { getBattlePetTargetList } from '../battle/target.ts'
import { operate } from '../parser/operator.ts'
import { parseConditionFilter } from '../parser/parser.ts'
import { parseEffectOperation, effectIdentHost } from '../parser/identifier-effect.ts'
import { getNumIdentifier } from '../parser/identifier.ts'
import { postProcess } from './effect-judge.ts'

const BLOCK_ZERO = (id: number): boolean => id === 99 || id === -8
const BLOCK_LOWER_MAX = (id: number): boolean => id === -7 || id === -8

/** EffectAbilityHandler.cs:165-352 —— 回血 / 置血 / 改上限, 外加四本治疗账本与 OnEffect 修正链。 */
export function heal(effect: Effect, state: BattleState | null): boolean {
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const type = dictGet(effect.abilityOptionDict, 'type', 'skill')!
  const add = dictGet(effect.abilityOptionDict, 'add', '0')!
  const set = dictGet(effect.abilityOptionDict, 'set', 'none')!
  const max = dictGet(effect.abilityOptionDict, 'max', 'none')!
  const option = dictGet(effect.abilityOptionDict, 'option', null)

  if (state === null)
    throw new Error('NOT_PORTED: Heal 的 state==null 支需要 base Pet 实例 ((Pet)effect.invokeUnit, Pet.cs) —— 本轮 core 无 Pet 模型')

  const st = state
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = ((who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)) as Unit
  const rhsUnit = st.getRhsUnitById(lhsUnit.id) as Unit
  const targetList = getBattlePetTargetList(st, effect, lhsUnit, rhsUnit)

  let isSuccess = false

  for (let i = 0; i < targetList.length; i++) {
    const pet = targetList[i] as BattlePetView
    let healValue = parseEffectOperation(add, effect, lhsUnit, rhsUnit, pet)
    let rec = pet.battleStatus.rec
    let setHp = (set === 'none') ? 0 : toInt(parseEffectOperation(set, effect, lhsUnit, rhsUnit, pet))
    let maxHp = (max === 'none') ? 0 : toInt(parseEffectOperation(max, effect, lhsUnit, rhsUnit, pet))

    // :200-218 —— 「效果触发时结算」: 先把 OnEffect 时机的效果按 filter 收出来, 再按 priority 排。
    // 注意 filter 的**建**用 x.condition、**判**用外层 effect (`…)(effect)`) —— 上游就是这么写的。
    const handler = st.getEffectHandler(null, false)
    const onEffect = st.getEffectsByTiming(EffectTiming.OnEffect, handler, (x) =>
      parseConditionFilter<Effect>(dictGet(x.abilityOptionDict, 'condition'), (exprs, e) => exprs.map((expr) => {
        switch (expr) {
          case 'add': return healValue
          case 'rec': return rec
          case 'set': return setHp
          case 'max': return maxHp
          case 'key[skill]': return (type.split('_')[0] === 'skill') ? 1 : 0
          case 'key[buff]': return (type.split('_')[0] === 'buff') ? 1 : 0
          case 'key[item]': return (type.split('_')[0] === 'item') ? 1 : 0
          default: {
            const got = e.tryGetEffectIdentifier(expr, (s) => getNumIdentifier(s, effectIdentHost()))
            return got.ok ? got.value : getNumIdentifier(expr, effectIdentHost())
          }
        }
      }))(effect as Effect)).slice().sort((a, b) => a.priority - b.priority)

    // :220-246 —— 逐条改写那四个本地变量。C# 的 OrderBy 与 JS 的 sort 都是**稳定**排序 (LINQ 与 ES2019 各自保证)。
    for (const x of onEffect) {
      const xWho = dictGet(x.abilityOptionDict, 'who', 'me')!
      const xType = dictGet(x.abilityOptionDict, 'type')
      const xOp = dictGet(x.abilityOptionDict, 'op')
      const xValue = dictGet(x.abilityOptionDict, 'value')
      if (xType === null || xType === '') continue    // return —— 连 PostProcess 都不跑

      const effectInvokeUnit = x.invokeUnit as Unit
      const effectLhsUnit = ((xWho === 'me') ? st.getUnitById(effectInvokeUnit.id) : st.getRhsUnitById(effectInvokeUnit.id)) as Unit
      if (effectLhsUnit.id !== lhsUnit.id) continue   // 修正只作用同 unit

      // 上游的 `ParseEffectOperation(value, …)` 写在**每个 case 体内** ⇒ `type` 是别的词时 value 根本不解析
      // (表达式自身的副作用与抛点都不发生)。所以这里也把它放进逐支的实参第三位, 不提前算。
      switch (xType) {
        case 'add': healValue = operate(xOp!, healValue, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit, pet)); break
        case 'rec': rec = operate(xOp!, rec, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit, pet)); break
        case 'set': setHp = toInt(operate(xOp!, setHp, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit, pet))); break
        case 'max': maxHp = toInt(operate(xOp!, maxHp, parseEffectOperation(xValue!, x, lhsUnit, rhsUnit, pet))); break
        default: break
      }
      postProcess(x, true, st)
    }

    // :248-260 —— set 支: 归零可被 99/-8 拦住, 然后**直接落 hp** (不走 rec, 也不记账)。
    if (set !== 'none') {
      if (setHp <= 0) {
        const petBlock = !isEmpty(pet.buffController.getRangeBuff((b: { id: number }) => BLOCK_ZERO(b.id)))
        const unitBlock = lhsUnit.unitBuffs.some((b) => BLOCK_ZERO(b.id))
        if (petBlock || unitBlock) continue
      }
      pet.hp = setHp
      isSuccess = true
      continue
    }

    // :262-278 —— max 支: 除了 99/-8 那道归零闸, 还多一道「降上限要 -7/-8 才拦」(:273)。
    if (max !== 'none') {
      if (maxHp <= 0) {
        const petBlock = !isEmpty(pet.buffController.getRangeBuff((b: { id: number }) => BLOCK_ZERO(b.id)))
        const unitBlock = lhsUnit.unitBuffs.some((b) => BLOCK_ZERO(b.id))
        if (petBlock || unitBlock) continue
      }
      if (maxHp < pet.maxHp && !isEmpty(pet.buffController.getRangeBuff((b: { id: number }) => BLOCK_LOWER_MAX(b.id))))
        continue
      pet.maxHp = maxHp
      isSuccess = true
      continue
    }

    if (pet.hp <= 0) continue                         // :282 —— 死了不奶

    if (pet.buffController.getBuff(100) !== null) rec = MathfMax(rec, 100)
    let healAdd = toInt(f(healValue * (healValue > 0 ? f(rec / 100) : 1)))

    const isHealCurrentPet = (who === 'me') && (pet === lhsUnit.pet)
    const overHeal = MathfMax(0, healAdd - (pet.maxHp - pet.hp))
    const ss = lhsUnit.skillSystem as UnitSkillSystem

    if (type === 'item') {
      if (isHealCurrentPet) {
        ss.itemHeal += healAdd
        if (healAdd > 0) ss.itemOverHeal += overHeal
      }
    } else if (type === 'skill') {
      if (isHealCurrentPet) {
        ss.skillHeal += healAdd
        if (healAdd > 0) ss.skillOverHeal += overHeal
      }
    } else if (type === 'buff') {
      ss.buffHeal += healAdd
      healAdd = 0                                     // :310-314 —— buff 治疗只记账, 不扣血
    } else {
      let keys: string[]
      if (option === 'start') keys = [...ss.healDict.keys()].filter((x) => x.startsWith(type))
      else if (option === 'end') keys = [...ss.healDict.keys()].filter((x) => x.endsWith(type))
      else if (option === 'contain') keys = [...ss.healDict.keys()].filter((x) => x.split('_').includes(type))
      else keys = [type]

      for (const key of keys) {
        if (key.startsWith('buff') || isHealCurrentPet) {
          const keyType = key.split('_')[0]
          ss.healDict.set(key, dictGet(ss.healDict, key, 0)! + healAdd)
          if (isHealCurrentPet && healAdd > 0) {
            if (keyType === 'skill') ss.skillOverHeal += overHeal
            else if (keyType === 'item') ss.itemOverHeal += overHeal
          }
        }
      }
      if (keys.some((x) => x.startsWith('buff'))) healAdd = 0
    }

    pet.hp = pet.hp + healAdd
    isSuccess = true
  }

  return isSuccess
}
