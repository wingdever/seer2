// EffectAbilityHandler.cs:2075-2211 (SetPetBag) —— 批五算子长尾。
// 直接操 lhsUnit 的宠袋（petBag / tokenPetBag / cursor / backupPetBag）—— 增/换/删宠。
//
// 分支全景（type 分 default(空) 与 "token"；op 分 + / - / SET）：
//   · default·"-"：对 targetList 里每只宠，按在 lhs/rhs 袋里的下标删（alivePetNum>1 ⇒ 置 null，否则 hp=0）。
//   · default·"SET"：SwapBackupPet((int)newValue)；若 petBag[target_index] 非空则 cursor=target_index。
//   · default·"+"：从宠表造一只新宠塞进袋（Pet.GetExamplePet / BattlePet.GetBattlePet / GetFeatureBuff…）
//     ⇒ **依赖 S6 宠表**，本轮显式抛 NOT_PORTED（留 S6 落码后补）。
//   · token·"-"：tokenPetBag[petSystem.cursor]=null，**直接 return true**（跳过下面的 cursor 补位）。
//   · token·"SET"：SwapTokenPet((int)newValue)。
//   · token·"+"：造替身宠塞 tokenPetBag ⇒ 同样 S6-blocked，抛 NOT_PORTED。
//   · 收尾 cursor 补位（default 与 token·SET 都跑；token·+/- 因提前 return 不跑）：
//     lhs.pet==null 时 cursor=(petBag[target_index]==null ? GetNextCursorCircular() : target_index)；rhs 同理但不用 target_index。
//     ⚠ 上游那个 `if (cursor < 0)` 兜底是**死支**（GetNextCursorCircular 找不到也返回 start≥0），照搬不删。
//
// 数值/边界：target_index 缺省 "-1" ⇒ cursor 局部 = -1 ⇒ ElementAtOrDefault(-1)=null ⇒ 补位走 GetNextCursorCircular。
// newValue 走 ParseEffectOperation；(int) 截断。
//
// headless：可搬支**一次骰都不掷**（无 native）；S6-blocked 的 + 支显式抛。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import { getBattlePetTargetList } from '../battle/target.ts'
import { dictGet } from '../collections.ts'
import { toInt } from '../mathf.ts'
import { parseEffectOperation } from '../parser/identifier-effect.ts'

// C# List.ElementAtOrDefault(i)：i 在 [0,len) 取该元素，否则 null（含负下标）。
const elementAtOrDefault = (arr: (BattlePetView | null)[], i: number): BattlePetView | null =>
  (i >= 0 && i < arr.length) ? arr[i]! : null

/** EffectAbilityHandler.cs:2075-2211 —— 宠袋增/换/删（+ 支 S6-blocked）。 */
export function setPetBag(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const type = dictGet(effect.abilityOptionDict, 'type', '')!
  const op = dictGet(effect.abilityOptionDict, 'op', 'SET')!
  const value = dictGet(effect.abilityOptionDict, 'value', '0')!
  const targetIndexExpr = dictGet(effect.abilityOptionDict, 'target_index', '-1')!

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = ((who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)) as Unit
  const rhsUnit = st.getRhsUnitById(lhsUnit.id) as Unit

  const targetList = getBattlePetTargetList(st, effect, lhsUnit, rhsUnit)
  const newValue = parseEffectOperation(value, effect, lhsUnit, rhsUnit)
  const cursor = toInt(parseEffectOperation(targetIndexExpr, effect, lhsUnit, rhsUnit))
  let isSuccess = false

  // 收尾 cursor 补位（lhs 用 target_index 局部、rhs 不用）。上游同形，`if (cursor < 0)` 是死支也照抄。
  const fixupCursor = (unit: Unit, isLhs: boolean): void => {
    if (unit.pet !== null) return
    const ps = unit.petSystem
    ps.cursor = isLhs
      ? ((elementAtOrDefault(ps.petBag, cursor) === null) ? ps.getNextCursorCircular() : cursor)
      : ps.getNextCursorCircular()
    if (ps.cursor < 0) ps.cursor = ps.getNextCursorCircular(-1, () => true)
  }

  // 上游 switch(type) 只有 default: 与 case "token": 两支 ⇒ type=="" 与任何未认值都落 default。
  if (type === 'token') {
    if (op === '+') {
      throw new Error('NOT_PORTED: SetPetBag 的 token·"+" 支要造替身宠塞 tokenPetBag (BattlePet.GetBattlePet) —— 依赖 S6 宠表, 留 S6 落码后补')
    }
    if (op === '-') {
      lhsUnit.petSystem.tokenPetBag[lhsUnit.petSystem.cursor] = null
      return true
    }
    if (op === 'SET') {
      isSuccess = lhsUnit.petSystem.swapTokenPet(toInt(newValue))
    }
    fixupCursor(lhsUnit, true)
    fixupCursor(rhsUnit, false)
  } else {
    if (op === '+') {
      throw new Error('NOT_PORTED: SetPetBag 的 default·"+" 支要从宠表造新宠 (Pet.GetExamplePet/BattlePet.GetBattlePet) —— 依赖 S6 宠表, 留 S6 落码后补')
    } else if (op === '-') {
      for (const pet of targetList) {
        if (pet === null || pet === undefined) continue
        const myIndex = lhsUnit.petSystem.petBag.indexOf(pet)
        const opIndex = rhsUnit.petSystem.petBag.indexOf(pet)
        const unit = (myIndex >= 0) ? lhsUnit : rhsUnit
        const index = (myIndex >= 0) ? myIndex : opIndex
        if (unit.petSystem.alivePetNum > 1) unit.petSystem.petBag[index] = null
        else unit.petSystem.petBag[index]!.hp = 0
        if (index >= 0) isSuccess = true
      }
    } else if (op === 'SET') {
      isSuccess = lhsUnit.petSystem.swapBackupPet(toInt(newValue))
      if (elementAtOrDefault(lhsUnit.petSystem.petBag, cursor) !== null)
        lhsUnit.petSystem.cursor = cursor
    }
    fixupCursor(lhsUnit, true)
    fixupCursor(rhsUnit, false)
  }

  return isSuccess
}
