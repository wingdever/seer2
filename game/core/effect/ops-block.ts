// EffectAbilityHandler.cs:678-736 (BlockOrCopyBuff) —— 第八段·批四「A 档」第四支。
//
// 这支只做「往四个免疫表里加/减」这一件事: 全是 `List<int>` / `List<BuffType>` 的纯列表运算,
// 一次骰都不掷、不碰内容表、不碰存档 ⇒ 整支可比 (配 bond 已在 pet/buff-controller.ts 补上九个方法)。
//
// 四处必须照搬的形状:
//   · 三个函数由 `op` 选: `+`=block / `-`=unblock / `*`=copy / `/`=uncopy, **其余 (含畸形 op) = 空动作**
//     (:700/:710/:718) —— 空动作不是 return false, 最后照样 `return true`。
//   · ⚠️ **`sp_list` 只有 `+`/`-` 两支有函数** (:714-720): `*`/`/` 时 spFunc 是空动作 ⇒
//     复制 / 取消复制**不碰** `blockBuffSps`。抄成"四支都调 spFunc"会多写一个计数。
//   · ⚠️ **Power 族三型先"移出 type 表"再展开成 id** (:722-730): `List.Remove(Power)` 命中 ⇒ 并入
//     powerup+powerdown 全集。三个 Remove 都只摘**首个**匹配且**各判一次** ⇒ 传 ["powerup","powerup"]
//     只摘掉一个, 另一个留在 type 表里走 typeFunc。
//   · `id_list` 走 `ToIntList('/')` ⇒ 非数字 token 落 `Identifier.GetNumIdentifier`; **解析失败整表 null**
//     (Helper.cs:177-202 的 ToFloatList 返回 null 那条) ⇒ 后续 `AddRange(null)` / `List.Remove(default)`
//     在 .NET 里抛 NRE/ArgumentException。移植体让 null 自然流下去抛 TypeError, 不额外兜底。
//
// headless: state==null 时上游**不判** ⇒ `state.GetUnitById` NRE (与 set_weather 同, 与 win/escape 反)。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import { BuffType, toBuffType } from '../buff/buff-database.ts'
import { powerupBuffIds, powerdownBuffIds } from '../buff/buff.ts'
import { dictGet } from '../collections.ts'
import { toIntList } from '../strutil.ts'
import { effectIdentHost } from '../parser/identifier-effect.ts'
import { getNumIdentifier } from '../parser/identifier.ts'

// `List<T>.Remove(item)` —— 返回**是否摘到了**, 且只删第一个匹配。上游拿它当条件用 (:722/:725/:728)。
const removeFirst = <T>(list: T[], item: T): boolean => {
  const at = list.indexOf(item)
  if (at === -1) return false
  list.splice(at, 1)
  return true
}

/** EffectAbilityHandler.cs:678-736 —— 印记的阻断 / 复制开关 (九支控制器方法的一次性入口)。 */
export function blockOrCopyBuff(effect: Effect, state: BattleState | null): boolean {
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const op = dictGet(effect.abilityOptionDict, 'op', '+')!
  const spList = dictGet(effect.abilityOptionDict, 'sp_list', 'none')!
  const idList = dictGet(effect.abilityOptionDict, 'id_list', '0')!
  const typeList = dictGet(effect.abilityOptionDict, 'type_list', 'none')!

  // :686-687 —— id 表走 ToIntList('/') (会解析标识符; 失败整表 null); type 表按 '/' 切逐个 ToBuffType
  // (查不到 ⇒ BuffType.None, 不抛)。
  const idBlockList = toIntList(idList, '/', (id) => getNumIdentifier(id, effectIdentHost())) as number[]
  const typeBlockList = typeList.split('/').map((x) => toBuffType(x))

  // :689-692 —— ⚠️ 本支**不判 state == null** (与 win/escape 相反); lhsUnit 由 who 选。
  const st = state as BattleState
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const buffController = (lhsUnit as Unit).pet!.buffController

  // :694-721 —— 三个函数各自按 op 选实现, 未认的 op 落空动作 (照旧 return true, 别改成 false)。
  const idFunc = (list: number[]): void => {
    switch (op) {
      case '+': return buffController.blockBuff(list)
      case '-': return buffController.unblockBuff(list)
      case '*': return buffController.copyBuff(list)
      case '/': return buffController.uncopyBuff(list)
      default: return
    }
  }
  const typeFunc = (list: BuffType[]): void => {
    switch (op) {
      case '+': return buffController.blockBuffWithType(list)
      case '-': return buffController.unblockBuffWithType(list)
      case '*': return buffController.copyBuffWithType(list)
      case '/': return buffController.uncopyBuffWithType(list)
      default: return
    }
  }
  const spFunc = (str: string): void => {
    switch (op) {
      case '+': return buffController.blockBuffWithString(str)
      case '-': return buffController.unblockBuffWithString(str)
      default: return
    }
  }

  // :722-730 —— "Switch special type": Power 族三型移出 type 表并展开成 id 表 (追加到**末尾**)。
  if (removeFirst(typeBlockList, BuffType.Power))
    idBlockList.push(...powerupBuffIds(), ...powerdownBuffIds())
  if (removeFirst(typeBlockList, BuffType.Powerup))
    idBlockList.push(...powerupBuffIds())
  if (removeFirst(typeBlockList, BuffType.Powerdown))
    idBlockList.push(...powerdownBuffIds())

  // :732-734 —— 调用次序同样是语义: id 先、type 次、sp 最后 (三处都改各自的表)。
  idFunc(idBlockList)
  typeFunc(typeBlockList)
  spFunc(spList)
  return true
}
