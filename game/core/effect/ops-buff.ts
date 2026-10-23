// EffectAbilityHandler.cs:737-863 (AddBuff) 与 :865-973 (RemoveBuff) —— 第六段·批一步骤3。
// 这两支是印记袋唯一的一对通用写入口, 也是本批第一次让算子**走进** buff-controller 的 state!=null 路径
// (OnAddBuff/OnRemoveBuff 触发链 ⇒ 递归回判定层), 所以文件头把两边都会咬到的形状先列全。
//
// AddBuff 的七条 quirk:
//   · :746-749 的 `x.TryTrimStart("!", out var v) ? v.Substring(1, v.Length-2).Split('/') : new[]{x}` ——
//     剥掉 `!` 之后还要**再砍首尾各一字符**, 所以列表形态是 `![a/b/c]` (真表实测 `id=![3458/3459]`)。
//     `v.Length-2 < 0` 时 C# 在 Substring 抛 ArgumentOutOfRangeException ⇒ 这里同形显式抛。
//   · `turnExpr` / `valueExpr` 的下标是**硬索引** (:767-768), 与 `idExpr` 长度不齐就抛;
//     而 `option` 走 `ElementAtOrDefault(k)` (:825) ⇒ 越界是 null ⇒ 「没配 option」。两种容错不一样, 别统一。
//   · :772/:797 的 `TryTrimParentheses` 用的是**默认方括号** (Helper.cs:85), 所以认的是 `unique[unhealthy]`
//     而不是 `unique(unhealthy)`; 写成圆括号 ⇒ ok=false ⇒ 整段落到 else 当**表达式**去解析。
//   · :788 `unique[...]` 且 `key` 非空 ⇒ **整条 return false** (不是 continue), 且它先于候选筛空那条。
//   · :854 `stateBuffs` 那一支写的是 `isSuccess = true`, **不是 `|=`** —— 而 :846/:859 两处是 `|=`,
//     两边都要求值 (JS 的 `||` 会短路掉后面的 AddBuff 调用)。
//   · :859 传给控制器的第二个实参是 **lhsUnit** (不是 target 那只宠的主人, 也不是 buffUnit) ⇒
//     多目标 / unique / random 时, 触发链里的 `me.` 仍然指向发起方。
//   · :824 `new Buff(buffId, buffTurn, isValeuExist ? buffValue : null)` —— 没配 `value` 键时传 **null**
//     (⇒ Buff 构造里 `?? 0`), 配了但算出 0 也是 0, 区别只在**键的存在性** (TryGet 的 ok)。
//
// RemoveBuff 的五条 quirk:
//   · 它**不走** target 列表, 只动 `lhsUnit.pet.buffController` (以及 key=="unit" 时的 unitBuffs)。
//   · :909 的 `.Random(randomCount >= 0 ? randomCount : int.MaxValue, false)` 与 :968 写死的 int.MaxValue,
//     都靠 ListHelper.Random 在**掷骰之前**的 `count > 候选长度 ⇒ 返回整表浅拷` 而变成确定性整表摘除;
//     只有显式给了落在 [0, 候选数] 的 random_count 才真的掷 native 骰 ⇒ 对拍向量在生成阶段挡掉。
//   · :953-957 的保护印记 (-2003/-2004) 命中时**同时把 id 从 idPowerResult 摘掉** ⇒ 它既不参与增幅清零,
//     也不进 :968 那次 RemoveRangeBuff。
//   · :960 `id.IsWithin(-9, -10) ? 5 : (id-1)/2` —— IsWithin 会交换上下界 (-9/-10 两个都算), 而 (id-1)/2 是
//     **C# 向零截断**的整除 (1⇒0, 2⇒0, 3⇒1, 10⇒4), 所以 -9/-10 之外最大下标是 4。
//   · :965 `(Mathf.Abs(id) % 2 == 1) ^ (powerup[powerId] < 0)` —— XOR **两边都要求值** (先各算完再比)。
//
// headless: 无 UnityEngine / Player.instance / Database.instance。按类型枚举印记走 buff-info 的
// buffIdsOfType 接缝; 两处 `.Random()` 与 :909 的掷骰走本文件的 OPS_RNG 接缝 (未注入显式抛)。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import { Buff, BUFFID_PROTECT_POWERDOWN, BUFFID_PROTECT_POWERUP, powerdownBuffIds, powerupBuffIds } from '../buff/buff.ts'
// `BuffType` 是 `as const` 值对象 (既是类型又是值) ⇒ 一个具名 import 两种身份都带上。
import { BuffType, toBuffType } from '../buff/buff-database.ts'
import { buffIdsOfType, getBuffInfo, INT_MAX } from '../buff/buff-info.ts'
import { atIndex, dictGet, dictTryGet, isEmpty, listGet, listPickRandom, listRandom } from '../collections.ts'
import { getBattlePetTargetList } from '../battle/target.ts'
import { f, toInt } from '../mathf.ts'
import { isWithin } from '../numutil.ts'
import { parseConditionFilter } from '../parser/parser.ts'
import { parseEffectOperation } from '../parser/identifier-effect.ts'
import { tryTrimParentheses, tryTrimStart, toIntRange, trimParenthesesLoop } from '../strutil.ts'
import type { Rng } from '../rng.ts'

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— 「这个键我不认」的哨兵

// native UnityEngine.Random 的注入点 (:795/:807 的 `.Random()` 与 :909 的 `.Random(count, false)`)。
// 与 buff-controller 的 RESIST/REMOVE 两条缝分开: 那两条管控制器内部, 这条管算子自己筛候选。
let OPS_RNG: Rng | null = null
export const setOpsBuffRng = (r: Rng | null): void => { OPS_RNG = r }

const noRng = (where: string): never => {
  throw new Error(`NOT_PORTED: ${where} 要 native ListHelper.Random ⇒ 那条 ECall —— 不可比, 用 setOpsBuffRng 注入`)
}

// `values.Random()` 无参重载 —— 空表时上游是 `values.Get(0)` ⇒ default(int) = 0, 不是抛。
const pickOne = (values: number[]): number => {
  if (OPS_RNG === null) noRng('AddBuff 的 unique/random 候选集取值 (:795/:807)')
  return listPickRandom(values, OPS_RNG as Rng) ?? 0
}

// `values.Random(count, repeat=false)` —— `count > 候选长度` 那支在掷骰**之前**短路, 不需要随机源。
const randomSubset = <T>(values: T[], count: number, where: string): T[] => {
  if (count > 0 && count <= values.length && OPS_RNG === null) noRng(where)
  return listRandom(values, count, false, OPS_RNG as Rng)
}

// :746-749 —— `!` 前缀 + 再砍首尾各一字符 ⇒ `![a/b/c]`; count<0 时 C# 在 Substring 抛。
const exprList = (s: string, where: string): string[] => {
  const t = tryTrimStart(s, '!')
  if (!t.ok) return [s]
  const count = t.trim.length - 2
  if (count < 0) throw new RangeError(`ArgumentOutOfRangeException: ${where}.Substring(1, ${count})`)
  return t.trim.substring(1, 1 + count).split('/')
}

// List.RemoveAll 是**就地**删除 (不换引用) ⇒ state.stateBuffs 的其它持有者看到的还是同一张表。
const removeAllInPlace = <T>(list: T[], predicate: (x: T) => boolean): number => {
  const keep: T[] = []
  for (const x of list) if (!predicate(x)) keep.push(x)
  const removed = list.length - keep.length
  list.length = 0
  list.push(...keep)
  return removed
}

/** EffectAbilityHandler.cs:737-863 —— 往目标宠的印记袋 (或 stateBuffs / unitBuffs) 里加印记。 */
export function addBuff(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const key = dictGet(effect.abilityOptionDict, 'key', '')!
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const id = dictGet(effect.abilityOptionDict, 'id', '0')!
  const turn = dictGet(effect.abilityOptionDict, 'turn', '-1')!
  const option = dictGet(effect.abilityOptionDict, 'option', '')!
  // :744 —— TryGet 的 ok 是「`value` 这个键**存不存在**」; 缺省时 out 写回 "0" 但 ok=false。
  const valueGet = dictTryGet(effect.abilityOptionDict, 'value', '0')

  const idExpr = exprList(id, 'id')
  const turnExpr = exprList(turn, 'turn')
  const valueExpr = exprList(valueGet.value as string, 'value')
  const optionExpr = exprList(option, 'option')
  const buffCount = idExpr.length

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = st.getRhsUnitById((lhsUnit as Unit).id)
  const targetList = getBattlePetTargetList(st, effect, lhsUnit as Unit, rhsUnit as Unit)
  const isFieldLocked = (lhsUnit as Unit).pet!.buffController.getBuff(92) !== null ||
    (rhsUnit as Unit).pet!.buffController.getBuff(92) !== null

  let isSuccess = false

  for (let j = 0; j < targetList.length; j++) {
    const buffController = (targetList[j] as BattlePetView).buffController

    for (let k = 0; k < buffCount; k++) {
      const buffTurn = toInt(parseEffectOperation(atIndex(turnExpr, k, 'turnExpr'), effect, lhsUnit as Unit, rhsUnit as Unit))
      const buffValue = toInt(parseEffectOperation(atIndex(valueExpr, k, 'valueExpr'), effect, lhsUnit as Unit, rhsUnit as Unit))
      let buffId = 0
      let buffIdList: number[] = []
      const idK = idExpr[k]

      // 两个候选族分支都用**默认方括号** (Helper.cs:85 的 TryTrimParentheses)。
      const unique = tryTrimStart(idK, 'unique')
      const uniqueParen = unique.ok ? tryTrimParentheses(unique.trim) : null
      const random = tryTrimStart(idK, 'random')
      const randomParen = random.ok ? tryTrimParentheses(random.trim) : null

      if (uniqueParen !== null && uniqueParen.ok) {
        const buffTypeExpr = uniqueParen.trim
        const types = buffTypeExpr.split('|').map(toBuffType)
        if (types.every((x) => x !== BuffType.None)) {
          for (const t of types) buffIdList = buffIdList.concat(buffIdsOfType(t))
        } else {
          // :785 的 ToIntRange 用**默认 parseFunc = int.Parse** ⇒ 畸形段直接抛, 不走表达式求值。
          buffIdList = toIntRange(buffTypeExpr)
        }
        // :788 —— key 非空时 unique 整条不算 (是 return, 不是 continue)。
        if (key !== '' || buffIdList.some((x) => getBuffInfo(x) === null)) return false
        buffIdList = buffIdList.filter((x) => !buffController.buffs.some((y) => y.id === x))
        if (isEmpty(buffIdList)) return false
        buffId = pickOne(buffIdList)
      } else if (randomParen !== null && randomParen.ok) {
        const buffTypeExpr = randomParen.trim
        const types = buffTypeExpr.split('|').map(toBuffType)
        if (types.every((x) => x !== BuffType.None)) {
          for (const t of types) buffIdList = buffIdList.concat(buffIdsOfType(t))
          // :807 —— 这一支**没有**「筛掉已装袋」也没有「空表检查」: 空表时 Get(0) ⇒ 0 ⇒ 后面按 id=0 处理。
          buffId = pickOne(buffIdList)
        } else {
          // :811 解析的是**整段** idExpr[k] (带 "random[...]" 那个壳), 不是剥完的内容。
          buffId = toInt(parseEffectOperation(idK, effect, lhsUnit as Unit, rhsUnit as Unit))
        }
      } else {
        buffId = toInt(parseEffectOperation(idK, effect, lhsUnit as Unit, rhsUnit as Unit))
      }

      const newBuffInfo = getBuffInfo(buffId)
      // :820 —— key 空且表里没这条 ⇒ 整条算失败; key 非空时允许 newBuff 是 null (下面据此不写 stateBuffs)。
      if (key === '' && newBuffInfo === null) return false

      const newBuff: Buff | null = newBuffInfo === null ? null : new Buff(buffId, buffTurn, valueGet.ok ? buffValue : null)

      // :825 ElementAtOrDefault ⇒ 越界是 null ⇒ 「没配 option」; 表内项才继续。
      const optionExprK = listGet(optionExpr, k)
      if (optionExprK !== null && optionExprK !== '') {
        const optionList = trimParenthesesLoop(optionExprK, '(', ')')
        if (!isEmpty(optionList)) {
          for (const op of optionList as string[]) {
            const split = op.split(':', 2)
            const num = parseEffectOperation(split[1], effect, lhsUnit as Unit, rhsUnit as Unit)
            // :834 —— 算出 float.MinValue (「这个键我不认」) 时写**原文**, 否则写取值的 ToString。
            ;(newBuff as Buff).options.set(split[0], num === FLOAT_MIN_VALUE ? split[1] : `${f(num)}`)
          }
        }
      }

      if (key !== '') {
        if ((isFieldLocked && key === 'field') || key.startsWith('rule')) continue

        if (key === 'unit') {
          // :846 的 `|=` 不短路 ⇒ 这只 unit 的 unitBuffs 真的被加过 (Unit.AddBuff 是**平行实现**, 不触发印记)。
          const ret = (lhsUnit as Unit).addBuff(newBuff)
          isSuccess = isSuccess || ret
          continue
        }

        // :850-855 —— 先按 key 清空, 再放新的那只; `isSuccess = true` 不是 `|=` (加了才算, null 不算)。
        removeAllInPlace(st.stateBuffs, (x) => x[0] === key)
        if (newBuff !== null) {
          st.stateBuffs.push([key, newBuff])
          isSuccess = true
        }
        continue
      }

      // :859 —— 第二实参是 **lhsUnit** (不是 targetList[j] 的主人), 第三是 invokeUnit。`|=` 要求值。
      const ret = buffController.addBuff(newBuff, lhsUnit, invokeUnit, st)
      isSuccess = isSuccess || ret
    }
  }

  return isSuccess
}

/** EffectAbilityHandler.cs:865-973 —— 从 lhsUnit 的印记袋 (或 stateBuffs / unitBuffs) 里摘印记。 */
export function removeBuff(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const keyList = dictGet(effect.abilityOptionDict, 'key', '')!
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const idList = dictGet(effect.abilityOptionDict, 'id', '0')!
  const typeList = dictGet(effect.abilityOptionDict, 'type', 'none')!
  const filterList = dictGet(effect.abilityOptionDict, 'filter', 'none')!
  const randomCountExpr = dictGet(effect.abilityOptionDict, 'random_count', '-1')!

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = st.getRhsUnitById((lhsUnit as Unit).id)
  const buffController = (lhsUnit as Unit).pet!.buffController
  const statusController = (lhsUnit as Unit).pet!.statusController

  const keyRange = keyList.split('/').filter((x) => !x.startsWith('rule'))
  // :882 每段都是**表达式**, 算完再按「表里有没有」筛掉 (⇒ 畸形段先抛, 查不到才丢)。
  const idRange = idList.split('/')
    .map((x) => toInt(parseEffectOperation(x, effect, lhsUnit as Unit, rhsUnit as Unit)))
    .filter((x) => getBuffInfo(x) !== null)
  const typeRange = typeList.split('/').map(toBuffType).filter((x) => x !== BuffType.None)

  // 特殊型的展开: Power = 增+减两批, Powerup / Powerdown 各加自己那批。
  if (typeRange.includes(BuffType.Power)) idRange.push(...powerupBuffIds(), ...powerdownBuffIds())
  if (typeRange.includes(BuffType.Powerup)) idRange.push(...powerupBuffIds())
  if (typeRange.includes(BuffType.Powerdown)) idRange.push(...powerdownBuffIds())

  const isKey = keyList !== ''
  const isId = idRange.length > 0 && !idRange.every((x) => x === 0)
  const isType = typeRange.length > 0

  // :899-905 —— 上游绑的是**单 id** 重载 (`Func<string, T, float>`): buff 为 null 时两个 id 都算 MinValue。
  const filter = parseConditionFilter<Buff | null>(filterList, (ids, b) =>
    ids.map((expr) => (b === null ? FLOAT_MIN_VALUE : parseEffectOperation(expr, effect, lhsUnit as Unit, rhsUnit as Unit, b, false))))
  const randomCount = toInt(parseEffectOperation(randomCountExpr, effect, lhsUnit as Unit, rhsUnit as Unit))

  const idRangeResult = [...new Set(buffController.getRangeBuff((x) => idRange.includes(x.id) && !x.isPower()).map((x) => x.id))]
  const powerCandidates = buffController.getRangeBuff((x) => idRange.includes(x.id) && x.isPower())
  const buffPowerResult = randomSubset(powerCandidates, randomCount >= 0 ? randomCount : INT_MAX,
    'RemoveBuff 的 .Random(random_count) (:909)')
  const idPowerResult = [...new Set(buffPowerResult.map((x) => x.id))]

  let isSuccess = false

  if (isKey) {
    if (keyList === 'unit') {
      // Unit.RemoveBuff(pred) 摘的是 **unitBuffs** (与印记袋那套是平行实现, 不触发 on_remove)。
      for (const type of typeRange) {
        const ret = (lhsUnit as Unit).removeBuff((x) => (!x.isUneffectable()) && x.isType(type) && filter(x))
        isSuccess = isSuccess || ret
      }
      if (isId) {
        const ret = (lhsUnit as Unit).removeBuff((x) => idRange.includes(x.id) && filter(x))
        isSuccess = isSuccess || ret
      }
    } else {
      const isFieldLocked = buffController.getBuff(92) !== null || (rhsUnit as Unit).pet!.buffController.getBuff(92) !== null
      // :932 —— 三个条件**都**过才删 (filter 收 x.Value, 键锁只认 "field")。返回删掉的条数 > 0。
      const removed = removeAllInPlace(st.stateBuffs,
        (x) => keyRange.includes(x[0]) && filter(x[1]) && !(isFieldLocked && x[0] === 'field'))
      isSuccess = isSuccess || removed > 0
    }
    return isSuccess
  }

  if (isType) {
    for (const type of typeRange) {
      // :941 该型的保护印记在袋 ⇒ 这一型**整个跳过** (连摘除都不做)。
      if (buffController.getBuff(Buff.getProtectBuffTypeId(type)) !== null) continue
      const ret = buffController.removeRangeBuff(
        (x: Buff) => (!x.isUneffectable()) && x.isType(type) && filter(x), lhsUnit, st, randomCount)
      isSuccess = isSuccess || ret
    }
  }

  if (isId) {
    for (const buff of buffPowerResult) {
      const id = buff.id
      if ((buff.isPowerUp() && buffController.getBuff(BUFFID_PROTECT_POWERUP) !== null) ||
        (buff.isPowerDown() && buffController.getBuff(BUFFID_PROTECT_POWERDOWN) !== null)) {
        // :956 —— 被保护的这只**同时从 idPowerResult 摘掉** ⇒ 后面那次 RemoveRangeBuff 也不动它。
        const at = idPowerResult.indexOf(id)
        if (at !== -1) idPowerResult.splice(at, 1)
        continue
      }

      const powerId = isWithin(id, -9, -10) ? 5 : Math.trunc((id - 1) / 2)
      // :965 的 XOR: 两侧都先算完再比 (奇 ⇒ 想清增幅; 当前增幅为负 ⇒ 想清减幅)。
      const odd = Math.abs(id) % 2 === 1
      const negative = statusController.powerup.at(powerId) < 0
      if (odd !== negative) statusController.setPowerUpType(powerId, 0)
    }

    // :968 的 randomCount 是**写死的 int.MaxValue** ⇒ 静默整表摘除, 一次骰都不取。
    const a = buffController.removeRangeBuff((x: Buff) => idPowerResult.includes(x.id), lhsUnit, st, INT_MAX)
    isSuccess = isSuccess || a
    const b = buffController.removeRangeBuff((x: Buff) => idRangeResult.includes(x.id) && filter(x), lhsUnit, st, randomCount)
    isSuccess = isSuccess || b
  }

  return isSuccess
}
