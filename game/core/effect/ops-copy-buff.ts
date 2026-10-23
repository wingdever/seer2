// EffectAbilityHandler.cs:975-1150 —— CopyBuff：把 lhsUnit 宠的印记（或增幅）搬到 rhsUnit 宠。
// add_buff/remove_buff 之后印记家族的第三支；与 BlockOrCopyBuff(:678, block_buff 算子) 不同 ——
// 这里真把印记搬到对侧，并支持 transfer(搬完摘源) / reverse(增幅取反) / exchange(两侧互换)。
//
// 分支全景（isId 与 isType 各自又分 exchange / 非 exchange）：
//   · 非 exchange·isId：lhs 侧按 idRange+filter 取；普通印记 clone() 后 AddBuff 到 rhs；power 类印记
//     不走 AddBuff，而是算一个 Status[type] 增幅再 rhsUnit.pet.PowerUp；transfer||reverse 时先判保护印记，
//     命中则把该 buff 从 buffs 摘掉。
//   · 非 exchange·isType：逐 type 先判保护印记(命中 continue)；否则把 lhs 该型印记 clone() 后 AddRangeBuff 到 rhs。
//   · exchange·isId：两侧都按 idRange+filter 取；power 类做增幅互换(各自 SetPowerUp 0 后对侧 PowerUp)，
//     普通印记 RemoveRangeBuff 各摘自己、AddRangeBuff 收对方的。
//   · exchange·isType：同 exchange·isId，但取印记用 IsType(type)。
//   · 末尾 isTransfer：lhsBuffController.RemoveRangeBuff(buffs)。返回 !IsNullOrEmpty(buffs)。
//   · idList=="random"/"unique[random]" 走 GetRandomBuff(native .Random(1)) ⇒ 不可比，走 OPS_RNG 注入缝。
//
// headless：无 UnityEngine / Player.instance / Database.instance。GetRandomBuff 的 .Random(1) 走本文件
// OPS_RNG 注入缝（未注入显式抛），其余纯逻辑。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { Rng } from '../rng.ts'
import { Buff, powerupBuffIds, powerdownBuffIds, powerBuffIds, BUFFID_PROTECT_POWERUP, BUFFID_PROTECT_POWERDOWN } from '../buff/buff.ts'
import { BuffType, toBuffType } from '../buff/buff-database.ts'
import { Status } from '../pet/status.ts'
import { dictGet, listRandom } from '../collections.ts'
import { toInt } from '../mathf.ts'
import { isWithin } from '../numutil.ts'
import { parseConditionFilter } from '../parser/parser.ts'
import { parseEffectOperation } from '../parser/identifier-effect.ts'
import { toIntList } from '../strutil.ts'

// native UnityEngine.Random 的注入点（GetRandomBuff 的 .Random(1)）。与 ops-buff 的缝分开：那条管算子筛候选。
let OPS_RNG: Rng | null = null
export const setOpsCopyBuffRng = (r: Rng | null): void => { OPS_RNG = r }

const noRng = (where: string): never => {
  throw new Error('NOT_PORTED: ' + where + ' 要 native ListHelper.Random ⇒ 不可比, 用 setOpsCopyBuffRng 注入')
}

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— filter 对 null buff 的哨兵（与 ops-buff 同形）

// bool.TryParse：只认大小写不敏感的 "true"/"false"，否则失败（返回 null 表示不可解析 ⇒ 整条 return false）。
const tryParseBool = (s: string): boolean | null => {
  const t = s.toLowerCase()
  return t === 'true' ? true : (t === 'false' ? false : null)
}

/** EffectAbilityHandler.cs:975-1150 —— 把印记/增幅从源宠搬到目标宠。 */
export function copyBuff(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const idList = dictGet(effect.abilityOptionDict, 'id', '0')!
  const typeList = dictGet(effect.abilityOptionDict, 'type', 'none')!
  const filterList = dictGet(effect.abilityOptionDict, 'filter', 'none')!
  const source = dictGet(effect.abilityOptionDict, 'source', 'op')!
  const target = dictGet(effect.abilityOptionDict, 'target', 'me')!
  const transfer = dictGet(effect.abilityOptionDict, 'transfer', 'false')!
  const reverse = dictGet(effect.abilityOptionDict, 'reverse', 'false')!
  const exchange = dictGet(effect.abilityOptionDict, 'exchange', 'false')!
  const mult = dictGet(effect.abilityOptionDict, 'mult', '1')!

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (source === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = (target === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const lhsBuffController = (lhsUnit as Unit).pet!.buffController
  const rhsBuffController = (rhsUnit as Unit).pet!.buffController
  const filter = parseConditionFilter<Buff>(filterList, (ids, buff) =>
    ids.map((expr) => (buff === null ? FLOAT_MIN_VALUE : parseEffectOperation(expr, effect, lhsUnit as Unit, rhsUnit as Unit, buff, false))))

  const getRandomBuff = (unique = false): number[] => {
    const all = lhsBuffController.getRangeBuff((x) =>
      (!x.hide) && (!x.isUneffectable()) && (!x.isPower()) && (!x.isType(BuffType.Item)) && filter(x)).map((x) => x.id)
    const kept = unique ? all.filter((id) => rhsBuffController.getBuff(id) === null) : all
    if (kept.length === 0) return []
    if (OPS_RNG === null) noRng('CopyBuff GetRandomBuff 的 .Random(1)')
    return listRandom(kept, 1, false, OPS_RNG as Rng)
  }

  let idRange: number[]
  if (idList === 'random') idRange = getRandomBuff(false)
  else if (idList === 'unique[random]') idRange = getRandomBuff(true)
  else idRange = (toIntList(idList, '/') ?? []).filter((x) => x !== 0)

  const typeRange = typeList.split('/').map(toBuffType).filter((x) => x !== BuffType.None)

  // 特殊型展开成 idRange（上游 typeRange.Remove 后再 idRange.AddRange）。
  const pullType = (t: BuffType): boolean => {
    const i = typeRange.indexOf(t)
    if (i === -1) return false
    typeRange.splice(i, 1)
    return true
  }
  if (pullType(BuffType.Power)) idRange.push(...powerupBuffIds(), ...powerdownBuffIds())
  if (pullType(BuffType.Powerup)) idRange.push(...powerupBuffIds())
  if (pullType(BuffType.Powerdown)) idRange.push(...powerdownBuffIds())

  const isId = idRange.length > 0 && !idRange.every((x) => x === 0)
  const isType = typeRange.length > 0
  if (!isId && !isType) return false

  const isTransfer = tryParseBool(transfer)
  const isReverse = tryParseBool(reverse)
  const isExchange = tryParseBool(exchange)
  if (isTransfer === null || isReverse === null || isExchange === null) return false

  // Buff.GetPowerUpBuffId(type, sign)：sign>0 取 powerup id，否则 powerdown id（按 powerup type 下标）。
  const getPowerUpBuffId = (type: number, sign: number): number => (sign > 0 ? powerupBuffIds() : powerdownBuffIds())[type]

  let buffs: Buff[] = []

  if (isId) {
    if (isExchange) {
      const lhsBuffs = lhsBuffController.getRangeBuff((x) => idRange.includes(x.id) && filter(x))
      const rhsBuffs = rhsBuffController.getRangeBuff((x) => idRange.includes(x.id) && filter(x))
      buffs = [...lhsBuffs, ...rhsBuffs]

      const lhsPowerup = (lhsUnit as Unit).pet!.statusController.powerup
      const rhsPowerup = (rhsUnit as Unit).pet!.statusController.powerup
      const lhsStatus = new Status()
      const rhsStatus = new Status()
      for (let type = 0; type < Status.powerupNames.length; type++) {
        const powerupBuffId = getPowerUpBuffId(type, 1)
        const powerdownBuffId = getPowerUpBuffId(type, -1)
        if (!idRange.includes(powerupBuffId) && !idRange.includes(powerdownBuffId)) continue
        if ((idRange.includes(powerupBuffId) && (lhsPowerup.at(type) > 0 || rhsPowerup.at(type) > 0)) ||
            (idRange.includes(powerdownBuffId) && (lhsPowerup.at(type) < 0 || rhsPowerup.at(type) < 0))) {
          lhsStatus.setAt(type, rhsPowerup.at(type))
          rhsStatus.setAt(type, lhsPowerup.at(type))
          ;(lhsUnit as Unit).pet!.statusController.setPowerUpType(type, 0)
          ;(rhsUnit as Unit).pet!.statusController.setPowerUpType(type, 0)
        }
      }
      ;(lhsUnit as Unit).pet!.powerUp(lhsStatus, lhsUnit, st, true)
      ;(rhsUnit as Unit).pet!.powerUp(rhsStatus, rhsUnit, st, true)

      const lhsNotPowerBuffs = lhsBuffs.filter((x) => !powerBuffIds().includes(x.id))
      const rhsNotPowerBuffs = rhsBuffs.filter((x) => !powerBuffIds().includes(x.id))
      lhsBuffController.removeRangeBuff(lhsNotPowerBuffs, lhsUnit, st)
      rhsBuffController.removeRangeBuff(rhsNotPowerBuffs, rhsUnit, st)
      lhsBuffController.addRangeBuff(rhsNotPowerBuffs, lhsUnit, st)
      rhsBuffController.addRangeBuff(lhsNotPowerBuffs, rhsUnit, st)
    } else {
      buffs = lhsBuffController.getRangeBuff((x) => idRange.includes(x.id) && filter(x))
      const powerup = (lhsUnit as Unit).pet!.statusController.powerup
      const status = new Status()
      for (const buff of buffs.map((x) => x.clone())) {
        if (!buff.isPower()) {
          rhsBuffController.addBuff(buff, rhsUnit, invokeUnit, st)
          continue
        }
        if (isTransfer || isReverse) {
          if ((buff.isPowerUp() && lhsBuffController.getBuff(BUFFID_PROTECT_POWERUP) !== null) ||
              (buff.isPowerDown() && lhsBuffController.getBuff(BUFFID_PROTECT_POWERDOWN) !== null)) {
            buffs = buffs.filter((x) => x.id !== buff.id)
            continue
          }
        }
        const type = isWithin(buff.id, -9, -10) ? 5 : Math.trunc((buff.id - 1) / 2)
        const statusMult = toInt(parseEffectOperation(mult, effect, lhsUnit as Unit, rhsUnit as Unit))
        status.setAt(type, (isReverse ? -1 : 1) * statusMult * powerup.at(type))
        if (isTransfer || isReverse) (lhsUnit as Unit).pet!.statusController.setPowerUpType(type, 0)
      }
      ;(rhsUnit as Unit).pet!.powerUp(status, rhsUnit, st)
    }
  }

  if (isType) {
    if (isExchange) {
      const lhsBuffs: Buff[] = []
      const rhsBuffs: Buff[] = []
      for (const type of typeRange) {
        for (const x of lhsBuffController.getRangeBuff((b) => (!b.isUneffectable()) && b.isType(type) && filter(b))) lhsBuffs.push(x)
        for (const x of rhsBuffController.getRangeBuff((b) => (!b.isUneffectable()) && b.isType(type) && filter(b))) rhsBuffs.push(x)
      }
      buffs = [...lhsBuffs, ...rhsBuffs]
      lhsBuffController.removeRangeBuff(lhsBuffs, lhsUnit, st)
      rhsBuffController.removeRangeBuff(rhsBuffs, rhsUnit, st)
      lhsBuffController.addRangeBuff(rhsBuffs, lhsUnit, st)
      rhsBuffController.addRangeBuff(lhsBuffs, rhsUnit, st)
    } else {
      for (const type of typeRange) {
        if (lhsBuffController.getBuff(Buff.getProtectBuffTypeId(type)) !== null) continue
        buffs = buffs.concat(lhsBuffController.getRangeBuff((x) => (!x.isUneffectable()) && x.isType(type) && filter(x)))
      }
      rhsBuffController.addRangeBuff(buffs.map((x) => x.clone()), rhsUnit, st, invokeUnit)
    }
  }

  if (isTransfer) lhsBuffController.removeRangeBuff(buffs, lhsUnit, st)
  return buffs.length > 0
}
