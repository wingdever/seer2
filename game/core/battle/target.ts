// Parser.cs:153-200 的移植 —— 效果的目标宠列表怎么选。第七段 (按频次搬算子) 的七个算子都调它,
// 所以它必须比算子先到, 而且**不能拿假实现糊**: 它的三个输入 (target_type / target_filter / target_num)
// 全是走第五段·步骤0 那条带 effect 上下文的标识符链算出来的。
//
// 四条会咬人的形状 (逐条在对拍/单测里锁住, 收口时登记进 docs/engine/oracle-playbook.md §7):
//   1. `_ => fromDefault` 是**静默**兜底: 除 pet_bag / token 之外的一切 target (含真表里 7910 行的
//      `pet`) 都走它, 于是"非 pet_bag 的目标解析结果 = 当前上场宠"。
//   2. `defaultPet` **可以是 null** (petBag 的洞、或 cursor 越界前留下的 null), 上游照样返回
//      长度为 1 的含 null 列表 (UnitPetSystem.cs:14 的 petBag[cursor] 就是可空槽位)。
//   3. `index` 支直接 `petBag[targetIndex]`: 上界用 **petBag.Length** (IsInRange 还是**开区间**),
//      于是它同时**绕过** targetFilter 与 dead 过滤, 还能把一个 null 取出来。
//   4. `target_type` 含 `random` 时调 `ListHelper.Random(targetNum, repeat=false)`:
//      `target_num` 没配 (缺省 -1) ⇒ `while (result.Count != count)` **永不成立** ⇒ 上游死循环;
//      `count > 列表长度` ⇒ 静默返回整表。随机本身是 native ⇒ 对拍向量在生成阶段挡掉 (同 parallelApplyOOM)。

import { dictGet, listRandom } from '../collections.ts'
import { EffectTiming, EffectTarget } from '../effect/effect-database.ts'
import type { Effect } from '../effect/effect.ts'
import { toInt } from '../mathf.ts'
import { isInRange } from '../numutil.ts'
import { getPetIdentifier, parseEffectOperation } from '../parser/identifier-effect.ts'
import { parseConditionFilter } from '../parser/parser.ts'
import type { BattleState, Unit } from './state.ts'
import type { BattlePetView } from './views.ts'

export type TargetList = (BattlePetView | null)[]

/** Parser.cs:153-163 —— `defaultPet` 的三条来源与 target 的分派。 */
export function getBattlePetTargetList(state: BattleState, effect: Effect, lhsUnit: Unit, rhsUnit: Unit): TargetList {
  // :155 —— `((Unit)effect.invokeUnit).id`: invokeUnit 为 null 时上游是 NullReferenceException,
  // 这里读属性同样抛 (JS 的 TypeError), difftest 只比"抛不抛"。
  const invoke = effect.invokeUnit as Unit
  // sourcePet 在 C# 是 `BattlePet` (Effect.cs:13), 只有 CheckAndApply 的第 5 参会写它。
  const defaultPet: BattlePetView | null =
    invoke.id === lhsUnit.id ? (effect.sourcePet as BattlePetView | null) ?? lhsUnit.pet : lhsUnit.pet

  switch (effect.target) {
    case EffectTarget.CurrentPetBag: return getBattlePetTargetListFromPetBag(effect, lhsUnit, rhsUnit, defaultPet)
    case EffectTarget.CurrentToken: {
      // :158 —— `lhsUnit.token?.SingleToList() ?? new List<BattlePet>()`: 没有替身给**空表** (不是含 null 的表)。
      const token = lhsUnit.token
      return token === null ? [] : [token]
    }
    default: return getBattlePetTargetListFromDefault(state, effect, lhsUnit, rhsUnit, defaultPet)
  }
}

/** Parser.cs:165-173 —— 有 OnSelectTarget 效果就先按它的那份 options 选, 没有就"只给当前宠"。 */
export function getBattlePetTargetListFromDefault(
  state: BattleState,
  effect: Effect,
  lhsUnit: Unit,
  rhsUnit: Unit,
  defaultPet: BattlePetView | null,
): TargetList {
  const handler = state.getEffectHandler(lhsUnit, false)
  const queue = state.getEffectsByTiming(EffectTiming.OnSelectTarget, handler, (e) => e.ability === effect.ability)
  const last = queue.length > 0 ? queue[queue.length - 1] : null

  // 上游 `(lastEffect == null) ? new List<BattlePet>() { defaultPet } : …` —— 空表给的是**含一个可空槽**的表。
  return last === null ? [defaultPet] : getBattlePetTargetListFromPetBag(last, lhsUnit, rhsUnit, defaultPet)
}

/** Parser.cs:175-200 —— 袋子里筛: filter → 去自己 → 死/活 → (random | index | Take(num))。 */
export function getBattlePetTargetListFromPetBag(
  effect: Effect,
  lhsUnit: Unit,
  rhsUnit: Unit,
  defaultPet: BattlePetView | null,
): TargetList {
  const targetType = effect.targetType
  const targetFilter = parseConditionFilter<BattlePetView>(
    effect.targetFilter,
    (ids, pet) => ids.map((id) => getPetIdentifier(id, lhsUnit.petSystem, pet)),
  )
  const numOpt = (key: string): number =>
    toInt(parseEffectOperation(dictGet(effect.abilityOptionDict, key, '-1')!, effect, lhsUnit, rhsUnit))
  const targetNum = numOpt('target_num')
  const targetIndex = numOpt('target_index')

  // :183-185 —— `petUnit` 写死 lhsUnit (上游留着一个从没改过的局部变量), petBag 是**定长数组** ⇒ 有洞。
  const petBag = lhsUnit.petSystem.petBag
  const targetList = petBag.filter((x) => x !== null).filter(targetFilter)

  // :187-188 —— List.Remove 只删**第一个**引用相等的项 (JS 的 filter 会把重复的都删掉, 那不是同一个行为)。
  if (targetType.includes('other')) {
    const at = targetList.indexOf(defaultPet)
    if (at >= 0) targetList.splice(at, 1)
  }

  // :190-192 —— 两条支是 `RemoveAll(!isDead)` / `RemoveAll(isDead)`: 配了 dead 才**只留死的**。
  const keep = targetType.includes('dead') ? (x: BattlePetView): boolean => x.isDead : (x: BattlePetView): boolean => !x.isDead
  const alive = targetList.filter(keep)

  if (targetType.includes('random')) {
    // 全局骰子: 上游是 UnityEngine.Random, 无头体借 lhsUnit.randomSource 作接缝 (口径同 phase.ts:387)。
    return listRandom(alive, targetNum, false, lhsUnit.randomSource)
  }
  // :194-195 —— 上界是 petBag.Length (**开**), 且直接取下标: 既不筛死也不套 filter, 还可能取到 null 洞。
  if (targetType.includes('index') && isInRange(targetIndex, 0, petBag.length)) return [petBag[targetIndex]]
  // :196-197 —— `target_num >= 0` 才截 (缺省 -1 就是"不截"), Take(0) 给**空表**。
  if (targetNum >= 0) return alive.slice(0, targetNum)
  return alive
}
