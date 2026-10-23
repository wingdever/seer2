// EffectAbilityHandler.cs:474-623 (Powerup) —— 第六段·批一步骤4。
// 增幅/减益 (六维 powerup) 的唯一通用写入口, 也是本批**耦合最重**的一支: 它同时吃
// target 列表、状态控制器 (powerup / min-max 边界)、印记袋 (45/46/94 三个修饰 + PowerUp 自己补的印记)
// 以及 rhsUnit 的镜像写入 (copy / reverse)。
//
// 八条必须照搬的上游形状 (逐条有向量或单测锁):
//   · :487 那个合取是 `(!TryParse(random)) || ((opCopy != "reverse") && (!TryParse(opCopy)))` ——
//     `opCopy=="reverse"` 时**第二个 TryParse 根本不求值**, 于是 `isOpCopy` 保持初始的 false;
//     而 random 解析失败 ⇒ `return false` 发生在所有状态突变之前 (一个字段都不动)。
//   · :505 `defaultValue` 是 **float** (三元里的 0 被提升), 所以缺省字符串走 `float.ToString()` ——
//     powerup 恒为整值 float ⇒ 形如 "0"/"3"/"-2"; 用 `${f(x)}` 拼 (与 ops-buff 同一条已知边界)。
//   · :507-514 的 `all` / `pos` / `neg` 是**依次覆盖**同一个 `add`, 且后两条要 `powerup > 0` / `< 0`;
//     三条都是 `TryGet` ⇒ 看的是**键的存在性**, 值为空串也算数。
//   · :517 `add=="op"` 读的是 **rhsUnit** 的 powerup (不是表达式, 也不看 lhsUnit)。
//   · :519-528 的 `set` 是**三态**: null (缺省, 走加值) / "true" (先原值再减回来 ⇒ 净零) / 其它 (表达式)。
//     写回的是差值 `setValue - powerup`; 而 :617 的 `isSet` 实参是 `set != null` —— **空串也算存在**,
//     于是 `set=""` 得到「跳过免疫检查, 但不做差值改写」这个组合 (上游就是两个判据不同形, 别统一)。
//   · :570 custom pdf 那段清理循环的上界是**字面量 5** (uniform 那段却是 `typeNames.Length`=6) ——
//     第六维 (hit) 在 pdf 支永远不会被清零。这是上游 quirk, 实测过就照抄, 不"顺手修正"。
//   · :597-604 三个印记修饰 (45 加倍正值 / 46 加倍负值 / 94 整体取反) 只在 `set == null` 时生效,
//     且 `status.Select(...)` 是**换对象** (Status 的方法返回新表), 而 random 那段是 `status[i]=` **就地改**。
//   · :610-613 的 copy/reverse 落在**循环外**, 用的是最后一只 target 攒下的那份 `status`
//     (含 random 清理与印记修饰) —— 只有多 target 且各次结果不同才可观测。
//
// 末尾 `pet.PowerUp(...)` 走已移植的 `BattlePetView.powerUp` → `state.ts:petPowerUp`
// (摘旧增幅印记 → 逐维写 powerup → 按新值补印记), 所以这一支会**走进**印记触发链;
// 对拍向量的候选印记必须落在「触发效果只含已移植算子」的白名单里 (见 docs/engine/oracle-playbook.md)。
//
// native RNG 两处 (:550 的 `.Random(count, false)` 与 :561 的 `Random.Range(0f, sum)`) 走本文件接缝,
// 未注入显式抛 ⇒ 值不进 golden, 形状由单测锁。`count > 候选长度` 那条短路在掷骰**之前**, 所以
// 「非零维数少于 random_count」是可比的整表保留。
//
// headless: 无 UnityEngine / Player.instance / Database.instance。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import { Status, linqSum } from '../pet/status.ts'
import { dictGet, dictTryGet, listRandom } from '../collections.ts'
import { getBattlePetTargetList } from '../battle/target.ts'
import { f, toInt } from '../mathf.ts'
import { boolTryParse, toFloatList } from '../strutil.ts'
import { parseEffectOperation, effectIdentHost } from '../parser/identifier-effect.ts'
import { getNumIdentifier } from '../parser/identifier.ts'
import type { Rng } from '../rng.ts'

// 两处 native 掷骰的注入点 (:550 的 ListHelper.Random 与 :561 的 Random.Range(float,float))。
// 默认 null ⇒ 真要掷才抛, 短路那条路不需要随机源。
let OPS_RNG: Rng | null = null
export const setOpsPowerupRng = (r: Rng | null): void => { OPS_RNG = r }

const noRng = (where: string): never => {
  throw new Error(`NOT_PORTED: ${where} 要 native 随机源 (ListHelper.Random / Range(float,float)) —— 不可比, 用 setOpsPowerupRng 注入`)
}

// HelperCollections.cs:108-138 —— `!repeat && count > 候选长度` 在掷骰**之前**返回整表浅拷。
// count < 0 时上游那个 `while (result.Count != count)` 永远不等的 ⇒ 死循环, 向量一律不发。
const randomSubset = (values: number[], count: number, where: string): number[] => {
  if (count > 0 && count <= values.length && OPS_RNG === null) noRng(where)
  return listRandom(values, count, false, OPS_RNG as Rng)
}

/** EffectAbilityHandler.cs:474-623 —— 六维增幅的加 / 置 / 随机筛 / 镜像复制。 */
export function powerup(effect: Effect, state: BattleState | null): boolean {
  // :476 —— 一张**全零**的表, 在 j 循环**外面** (上游把它放在循环外是有意义的: 每只宠都会把六维
  // 全写一遍, 所以没有跨宠残留; 但 45/46/94 那三条是**换对象**, 于是循环结束后指向的可能是
  // select 出来的新表 —— copy/reverse 分支读的就是这最后一个对象)。
  let status = new Status()
  const typeNames = Status.powerupNames

  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const random = dictGet(effect.abilityOptionDict, 'random', 'false')!
  const opCopy = dictGet(effect.abilityOptionDict, 'copy', 'false')!
  const min = dictGet(effect.abilityOptionDict, 'min', 'none')!
  const max = dictGet(effect.abilityOptionDict, 'max', 'none')!
  const set = dictGet(effect.abilityOptionDict, 'set', null)

  // :486-488 —— 两个 TryParse 的**求值次序**就是语义 (reverse 让第二个不跑)。
  let isRandom = false
  let isOpCopy = false
  const randomGet = boolTryParse(random)
  if (!randomGet.ok) return false
  isRandom = randomGet.value
  if (opCopy !== 'reverse') {
    const copyGet = boolTryParse(opCopy)
    if (!copyGet.ok) return false
    isOpCopy = copyGet.value
  }

  const st = state as BattleState
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)
  const rhsUnit = st.getRhsUnitById((lhsUnit as Unit).id)
  const targetList = getBattlePetTargetList(st, effect, lhsUnit as Unit, rhsUnit as Unit)

  for (let j = 0; j < targetList.length; j++) {
    // :496-498 —— 立刻解引用 targetList[j] ⇒ 袋子洞在这里同形抛 (不兜底)。
    const pet = targetList[j] as BattlePetView
    // :497-498 —— 上游留了 statusController 这个别名却仍写 `pet.statusController.…`; 两者是同一个引用
    // (core 里 pet.statusController 是字段), 这里统一走别名, 少一次属性寻址。
    const statusController = pet.statusController
    const buffController = pet.buffController

    // :501-529 —— 六维逐维重算: `powerup` 每次访问都过一遍 Clamp+FloorToInt, 所以读的是**当前值**。
    for (let type = 0; type < typeNames.length; type++) {
      const powerupCur = statusController.powerup.at(type)
      const defaultValue = (set === 'true') ? powerupCur : 0
      let add = dictGet(effect.abilityOptionDict, typeNames[type], `${f(defaultValue)}`)!

      const allGet = dictTryGet(effect.abilityOptionDict, 'all')
      if (allGet.ok) add = allGet.value as string

      const posGet = dictTryGet(effect.abilityOptionDict, 'pos')
      if (posGet.ok && (powerupCur > 0)) add = posGet.value as string

      const negGet = dictTryGet(effect.abilityOptionDict, 'neg')
      if (negGet.ok && (powerupCur < 0)) add = negGet.value as string

      status.setAt(type, (add === 'op') ? (rhsUnit as Unit).pet!.statusController.powerup.at(type)
        : parseEffectOperation(add, effect, lhsUnit as Unit, rhsUnit as Unit, pet))

      if (!(set === null || set === '')) {
        const setValue = (set === 'true') ? status.at(type)
          : parseEffectOperation(set, effect, lhsUnit as Unit, rhsUnit as Unit, pet)
        status.setAt(type, setValue - powerupCur)
      }
    }

    if (isRandom) {
      const pdf = dictGet(effect.abilityOptionDict, 'random_pdf', 'none')!
      const randomTypeCountExpr = dictGet(effect.abilityOptionDict, 'random_count', '1')!
      const count = status.count((x) => x !== 0)
      // :536 这两行在 if/else **之前** ⇒ 即使 pdf=="none" 什么都不做, random_count 表达式照样求值 (副作用可见)。
      const randomTypeCount = toInt(parseEffectOperation(randomTypeCountExpr, effect, lhsUnit as Unit, rhsUnit as Unit, pet))

      // 三支的判序与上游一致 (none ⇒ 只剩那句 `// pass.` 注释)。
      if (pdf === 'none') {
        // pass.
      } else if (pdf === 'uniform') {
        const indices: number[] = []
        for (let i = 0; i < count; i++) indices.push(i)
        const typeList = randomSubset(indices, randomTypeCount, 'Powerup 的 uniform 抽样 (:550)')
        for (let i = 0, index = 0; i < typeNames.length; i++) {
          if (status.at(i) === 0) continue
          status.setAt(i, typeList.includes(index) ? status.at(i) : 0)
          index++
        }
      } else {
        // :557-575 —— 自定义概率表: ToFloatList 的兜底解析是**无上下文** GetNumIdentifier。
        const probList = toFloatList(pdf, '/', (id) => getNumIdentifier(id, effectIdentHost()))
        const sum = linqSum(probList as number[])
        if (OPS_RNG === null) noRng('Powerup 的 custom pdf (:561)')
        let rng = (OPS_RNG as Rng).nextFloat(0, sum)
        let type = 0
        for (type = 0; type < (probList as number[]).length; type++) {
          if ((probList as number[])[type] >= rng) break
          rng = f(rng - (probList as number[])[type])
        }
        // :570 —— 上界写死 5 ⇒ 第六维不参与清理 (与 uniform 那段的 typeNames.Length 不对称, 上游原样)。
        for (let i = 0, index = 0; i < 5; i++) {
          if (status.at(i) === 0) continue
          status.setAt(i, index === type ? status.at(i) : 0)
          index++
        }
      }
    }

    // :578-588 —— min/max 边界**不钳也不检查次序**, 直接 (int) 逐维写进 _minPowerUp/_maxPowerUp。
    if (min !== 'none') {
      const minPowerup = toInt(parseEffectOperation(min, effect, lhsUnit as Unit, rhsUnit as Unit, pet))
      statusController.setMinPowerUp(Status.one().timesF(minPowerup))
    }
    if (max !== 'none') {
      const maxPowerup = toInt(parseEffectOperation(max, effect, lhsUnit as Unit, rhsUnit as Unit, pet))
      statusController.setMaxPowerUp(Status.one().timesF(maxPowerup))
    }

    // :591-604 —— 判据是 `set == null` (键的存在性), 与上面 IsNullOrEmpty 的差值改写不是同一个条件。
    if (set === null) {
      if (buffController.getBuff(45) !== null) status = status.select((x) => x * (x > 0 ? 2 : 1))
      if (buffController.getBuff(46) !== null) status = status.select((x) => x * (x < 0 ? 2 : 1))
      if (buffController.getBuff(94) !== null) status = status.timesF(-1)
    }

    // :606 —— 第四参 `set != null` ⇒ `set=""` 也会跳过免疫检查 (见文件头)。
    pet.powerUp(status, lhsUnit, st, set !== null)
  }

  // :610-617 —— copy/reverse 用的是**最后一只 target** 的那份 status; reverse 先取反再写进对手。
  if (opCopy === 'reverse') {
    ;(rhsUnit as Unit).pet!.powerUp(status.timesF(-1), rhsUnit, st)
    return true
  }
  if (isOpCopy) {
    ;(rhsUnit as Unit).pet!.powerUp(status, rhsUnit, st)
    return true
  }
  return true
}
