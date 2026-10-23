// MVC/Model/Basic/Pet/Battle/PetBattleBuffController.cs 的移植 —— 本批搬到位的是**标识符链要读的那一面**
// (buffs / element / subElement / block / copy / getBuff / getRangeBuff)、构造期必经的
// `AddRangeBuff(…, state = null)` 静默装载路径, 以及 `state != null` 的**战斗路径** (第六段·批一步骤2:
// OnAddBuff/OnRemoveBuff 触发 + NewBuff + copyHandleType 六支 + RemoveBuff 的「先触发后摘除」)。
// 触发链的判定本体在 effect/effect-judge.ts (它 import 本文件 ⇒ 直接反向引用会成环),
// 所以 Effect.CheckAndApply 做成**注入接缝** `setBuffEffectTrigger` (口径同 battle/effect-handler.ts 的
// setEffectJudgement): 没注入时显式抛, 不静默放行 —— 静默 true 会把「接缝没接」伪装成「印记触发过了」。
//
// 四条会被对拍咬到的形状:
//   · **构造即 SetElement**: `blockBuffIds` 不是空表 —— `SetElement` 先 `Remove(GetElementBlockId(旧))`
//     再 `Add(GetElementBlockId(新))`, 而旧值此刻还是字段默认的 0(普通) ⇒ Remove(0) 空操作, Add 落一个
//     块 id。所以 `Unit.buffController` (Element.全部 ⇒ 0) 恒有 `blockBuffIds = [0]`, 于是
//     `buff[0].block` 读回 **1**。这不是 bug, 是每条印记免疫判定的起点。
//   · **List.Remove 只删第一个匹配**, `UnblockBuff`(RemoveRange) 是另一个语义 —— 本批没搬后者, 别用
//     `filter(x => !ids.includes(x))` 顶替。
//   · 抗性免疫那支 (`Buff.BUFFID_RESIST_BUFF` 在场时) 吃 `UnityEngine.Random.Range(0, 100)`, 是 native
//     不可比路径 ⇒ 默认抛, 由注入的 Rng 决定; 没带 -2005 号印记时这条支根本走不到, 构造路径与它无关。
//   · **RemoveBuff 先 OnRemoveBuff 再 buffs.Remove** (:291-298 就这个顺序) ⇒ 被触发的效果看到的是
//     「这条印记还在袋里」。抄成先摘后触发, 连锁反应里那条效果就读不到自己了。

import type { BattleState, Unit } from '../battle/state.ts'
import type { Effect } from '../effect/effect.ts'
import { EffectTiming } from '../effect/effect-database.ts'
import { BUFFID_RESIST_BUFF } from '../buff/buff.ts'
import type { Buff } from '../buff/buff.ts'
import { buffTypeToRaw, BuffType, CopyHandleType } from '../buff/buff-database.ts'
import { INT_MAX, INT_MIN } from '../buff/buff-info.ts'
import { dictGet, listRandom } from '../collections.ts'
import type { Rng } from '../rng.ts'
import { Element } from './element.ts'
import type { ElementId } from './element.ts'

// Effect.CheckAndApply (Effect.cs:345-352) 的注入点 —— 印记的 on_add/on_remove 触发链走它。
export type BuffEffectTrigger = (
  effect: Effect, invokeUnit: Unit | null, state: BattleState,
  checkPhase: boolean, checkTurn: boolean, sourcePet: unknown,
) => boolean

const NOT_PORTED_TRIGGER: BuffEffectTrigger = () => {
  throw new Error('NOT_PORTED: PetBuffController 的触发链要 Effect.CheckAndApply —— 用 setBuffEffectTrigger 注入 (未注入时判定层没进图)')
}

let TRIGGER: BuffEffectTrigger = NOT_PORTED_TRIGGER
export const setBuffEffectTrigger = (t: BuffEffectTrigger | null): void => { TRIGGER = t ?? NOT_PORTED_TRIGGER }


// 抗性免疫那一次 Random.Range 的注入点。null = 不可得 ⇒ 抛, 与「native Random 在 headless 里是 ECall」同形。
let RESIST_RNG: Rng | null = null
export const setBuffResistRng = (r: Rng | null): void => { RESIST_RNG = r }

// RemoveRangeBuff(pred, randomCount ≥ 0) 那一支的注入点。上游两处吃的都是**同一个全局** native Random
// (游戏里共享一条流), 这里分成两个接缝是为了让「只注入了抗性骰」的测试不会误放出随机摘除那支。
let REMOVE_RNG: Rng | null = null
export const setBuffRemoveRng = (r: Rng | null): void => { REMOVE_RNG = r }

// PetBattleBuffController.cs:42-53 —— 五个属性各有专属免疫印记 id, 其余元素 ⇒ 0。
const getElementBlockId = (element: ElementId): number => {
  switch (element) {
    case Element.水: return 1000
    case Element.火: return 1001
    case Element.草: return 1007
    case Element.风: return 1014
    case Element.冰: return 1002
    default: return 0
  }
}

// Enumerable.OrderBy 是**稳定**排序, Array.prototype.sort 自 ES2019 起同样稳定 ⇒ 两者同形。
const sortByPriority = (list: Effect[]): Effect[] => [...list].sort((a, b) => a.priority - b.priority)

// HelperCollections.cs:192-196 `RemoveRange<T>(this IList<T> lhs, IList<T> rhs)` —— **逐项 `List.Remove`**
// (只删第一个匹配), 不是集合差、也不换引用。摘不到不报错。`UnblockBuff`/`UncopyBuff` 那四支走的就是它。
const removeRange = <T>(lhs: T[], rhs: T[]): void => {
  for (const item of rhs) {
    const at = lhs.indexOf(item)
    if (at !== -1) lhs.splice(at, 1)
  }
}

export class PetBuffController {
  parent: unknown = null
  // 字段初值是**语义**的一部分 (见文件头): 构造里第一次 SetElement 读的就是这个 0。
  element: ElementId = Element.普通
  subElement: ElementId = Element.普通

  blockBuffSps = new Map<string, number>()
  blockBuffIds: number[] = []
  copyBuffIds: number[] = []
  blockBuffTypes: BuffType[] = []
  copyBuffTypes: BuffType[] = []

  buffs: Buff[] = []

  constructor(element: ElementId, subElement: ElementId = Element.普通, buffs: Buff[] | null = null) {
    this.setElement(element)
    this.setSubElement(subElement)
    // :27 `AddRangeBuff(buffs, null, null)` —— 命中的是三参重载 (range, buffUnit, state), 两个 null。
    this.addRangeBuff(buffs, null, null)
  }

  // :28-36 拷贝构造 —— **不走 SetElement**, element/subElement 直抄, 五个免疫表各 new 一份浅拷贝,
  // buffs 逐个 `new Buff(x)` (⇒ 新 body, 与 rhs 完全脱钩)。`parent` 上游根本不复制 ⇒ 留 null。
  static fromCopy(rhs: PetBuffController): PetBuffController {
    const out = Object.create(PetBuffController.prototype) as PetBuffController
    // 字段初始化器在 C# 里先于 ctor 体跑 ⇒ parent 回到默认 null (上游拷贝构造同样不复制它)。
    out.parent = null
    out.element = rhs.element
    out.subElement = rhs.subElement
    out.blockBuffSps = new Map(rhs.blockBuffSps)
    out.blockBuffIds = [...rhs.blockBuffIds]
    out.copyBuffIds = [...rhs.copyBuffIds]
    out.blockBuffTypes = [...rhs.blockBuffTypes]
    out.copyBuffTypes = [...rhs.copyBuffTypes]
    out.buffs = rhs.buffs.map((x) => x.clone())
    return out
  }

  setElement(newElement: ElementId): void {
    const old = getElementBlockId(this.element)
    const at = this.blockBuffIds.indexOf(old)
    if (at !== -1) this.blockBuffIds.splice(at, 1)      // List.Remove: 只删第一个匹配
    this.blockBuffIds.push(getElementBlockId(newElement))
    this.element = newElement
  }

  setSubElement(newElement: ElementId): void { this.subElement = newElement }

  // :68-71 —— 注意是 `!Exists(IsUnmovable)`, 空表 ⇒ true。
  isUnmovableEffected(): boolean { return this.buffs.some((x) => x.isUnmovable()) }
  get isMovable(): boolean { return !this.isUnmovableEffected() }

  // :73-107 —— null 一律「没被屏蔽/没被复制」; testBuff 为 null 时同样 false (调用方靠这点)。
  isBuffBlocked(buff: Buff | null): boolean {
    if (buff === null) return false
    return this.isBuffIdBlocked(buff.id) || this.blockBuffTypes.some((t) => buff.isType(t))
  }
  isBuffIdBlocked(id: number): boolean { return this.blockBuffIds.includes(id) }
  isBuffTypeBlocked(type: BuffType): boolean { return this.blockBuffTypes.includes(type) }

  // :323-326 BlockBuff —— 只有 `AddRange`, **不会**回去滤掉已经装在袋里的印记
  // (构造期的 AddRangeBuff 早在它之前跑完), 所以「先装后屏蔽」的形状只能靠调用时的检查生效。
  blockBuff(idList: number[]): void { this.blockBuffIds.push(...idList) }

  // :328-388 —— `BlockOrCopyBuff` (EffectAbilityHandler.cs:678) 的九个落点, 第八段·批四补。
  // 三条必须照搬的形状:
  //   · `Unblock*`/`Uncopy*` 走 removeRange(HelperCollections.cs:192) —— 逐项 `List.Remove` (首匹配),
  //     `["1","1"]` 摘两个 1; **不是**集合差, 也别用 `filter(x => !ids.includes(x))` 顶替。
  //   · `BlockBuffWithString` 的 switch **只有 default** ⇒ 任何非空串都 +1 (默认 sp_list="none" 也照样 +1)。
  //   · `UnblockBuffWithString` 的 switch **只有 case "op"**、没有 default ⇒ 除 "op" 外一律什么都不做。
  blockBuffWithType(typeList: BuffType[]): void { this.blockBuffTypes.push(...typeList) }
  blockBuffWithString(str: string): void {
    if (str === null || str === '') return
    this.blockBuffSps.set(str, (this.blockBuffSps.get(str) ?? 0) + 1)
  }
  unblockBuff(idList: number[]): void { removeRange(this.blockBuffIds, idList) }
  unblockBuffWithType(typeList: BuffType[]): void { removeRange(this.blockBuffTypes, typeList) }
  unblockBuffWithString(str: string): void {
    if (str === null || str === '') return
    if (str === 'op') this.blockBuffSps.set(str, (this.blockBuffSps.get(str) ?? 0) - 1)
  }
  copyBuff(idList: number[]): void { this.copyBuffIds.push(...idList) }
  copyBuffWithType(typeList: BuffType[]): void { this.copyBuffTypes.push(...typeList) }
  uncopyBuff(idList: number[]): void { removeRange(this.copyBuffIds, idList) }
  uncopyBuffWithType(typeList: BuffType[]): void { removeRange(this.copyBuffTypes, typeList) }

  isBuffCopied(buff: Buff | null): boolean {
    if (buff === null) return false
    return this.isBuffIdCopied(buff.id) || this.copyBuffTypes.some((t) => buff.isType(t))
  }
  isBuffIdCopied(id: number): boolean { return this.copyBuffIds.includes(id) }
  isBuffTypeCopied(type: BuffType): boolean { return this.copyBuffTypes.includes(type) }

  // :109-117 —— Find/FindAll 都是**引用**语义, 返回的表与 buffs 共享 Buff 对象 (不是拷贝)。
  getBuff(id: number): Buff | null { return this.buffs.find((x) => x.id === id) ?? null }
  getRangeBuff(predicate: (buff: Buff) => boolean): Buff[] { return this.buffs.filter(predicate) }

  // :119-129 OnAddBuff —— 改相位 → 按 priority 逐条 CheckAndApply → **恢复**相位。
  // 三点要紧: (a) `state.phase` 是被**就地改写**的 (同一份 BattleState, 不是拷贝), 于是嵌套触发期间
  // 所有相位门看到的都是 OnAddBuff; (b) Where 先物化 ⇒ 触发期间往 bag 里加新印记不会影响本轮迭代;
  // (c) OrderBy 是**稳定**排序 (Enumerable.OrderBy), priority 相同的两条保持 effects 的原序。
  onAddBuff(newBuff: Buff | null, buffUnit: Unit | null, state: BattleState): void {
    if (newBuff === null) return
    const tmpPhase = state.phase
    state.phase = EffectTiming.OnAddBuff
    for (const x of sortByPriority(newBuff.effects.filter((e) => e.timing === EffectTiming.OnAddBuff)))
      TRIGGER(x, buffUnit, state, true, false, this.parent)
    state.phase = tmpPhase
  }

  // :130-139 NewBuff —— 先入袋再触发 (所以触发的那条效果看得到自己)。
  private newBuff(newBuff: Buff | null, buffUnit: Unit | null, state: BattleState): void {
    if (newBuff === null) return
    this.buffs.push(newBuff)
    this.onAddBuff(newBuff, buffUnit, state)
  }

  // :141-245 AddBuff。state==null 是「静默装载」(构造 / 存档回读), state!=null 走重复判定 + copyHandleType 六支。
  addBuff(newBuff: Buff | null, buffUnit: Unit | null, invokeUnit: Unit | null, state: BattleState | null, triggerCopy = true): boolean {
    if (newBuff === null) return false

    // :147-151 —— `state?.GetRhsUnitById(buffUnit.id)`: C# 的 null 条件**连实参一起短路**,
    // 所以 state 为 null 时 buffUnit 是 null 也不炸。写成 `state !== null && …` 才是同形。
    if (triggerCopy && this.isBuffCopied(newBuff) && newBuff.isCopyable()) {
      if (state !== null) {
        const rhsUnit = state.getRhsUnitById((buffUnit as Unit).id)
        if (rhsUnit !== null) rhsUnit.pet!.buffController.addBuff(newBuff, rhsUnit, buffUnit, state, false)
      }
    }

    // :154 特殊免疫 —— blockBuffSps 只有 "op" 一个键会被读 (UnblockBuffWithString 也只认它)。
    if (invokeUnit !== null && invokeUnit.id !== (buffUnit as Unit).id && (dictGet(this.blockBuffSps, 'op', 0) as number) > 0) return false

    // :158 正常免疫: 能力增减类**免疫不了** (`&& !IsPower()`)。
    if (this.isBuffBlocked(newBuff) && !newBuff.isPower()) return false

    let isResisted = false

    // :164-183 抗性 —— 需要 -2005 号印记在场, 且它的 option[<type>Id] 正好等于新印记 id。
    const resistBuff = this.getBuff(BUFFID_RESIST_BUFF)
    if (resistBuff !== null) {
      const rawType = buffTypeToRaw(newBuff.info.type)
      const r = resistBuff.tryGetBuffIdentifier(`option[${rawType}Id]`)
      if (r.ok && r.num === newBuff.id) {
        if (RESIST_RNG === null)
          throw new Error('NOT_PORTED: PetBattleBuffController.AddBuff 的抗性分支要 native Random.Range(0,100) —— 不可比, 用 setBuffResistRng 注入')
        if (RESIST_RNG.nextInt(0, 100) < resistBuff.getBuffIdentifier(`option[${rawType}Value]`)) {
          const newId = newBuff.info.type === BuffType.Unhealthy ? 1999 : newBuff.info.type === BuffType.Abnormal ? 199 : newBuff.id
          newBuff.setBuffIdentifier('id', newId)
          newBuff.setBuffIdentifier('turn', 1)
          newBuff.setBuffIdentifier('value', r.num)
          isResisted = true
        }
      }
    }

    if (state === null) { this.buffs.push(newBuff); return !isResisted }

    // :189 —— 重复判定读的是**抗性改写之后**的 id (被改写成 1999/199 的那支因此几乎不可能撞车)。
    const oldBuff = this.getBuff(newBuff.id)
    if (oldBuff === null) { this.newBuff(newBuff, buffUnit, state); return !isResisted }

    switch (newBuff.info.copyHandleType) {
      // :200 default 与 New 同一支 —— C# 的 `default:` 写在最前面, 认不出来的值**照样**当 New 处理。
      default:
      case CopyHandleType.New:
        this.newBuff(newBuff, buffUnit, state)
        return !isResisted
      case CopyHandleType.Block:
        return false
      case CopyHandleType.Replace: {
        // -1 是「永久」⇒ 比时长时当**无限久**; 相等时 old <= new 成立 ⇒ 旧的被换掉。
        const oldTurn = oldBuff.turn === -1 ? INT_MAX : oldBuff.turn
        const newTurn = newBuff.turn === -1 ? INT_MAX : newBuff.turn
        if (oldTurn <= newTurn) {
          this.removeBuff(oldBuff, buffUnit, state)
          this.newBuff(newBuff, buffUnit, state)
          return !isResisted
        }
        return false
      }
      case CopyHandleType.Stack:
        // 累加读的是 oldBuff 的**夹紧视图** (value 属性), 写回也走夹紧 setter。
        // OnAddBuff 触发的是**新来的那条** (不是被累加的旧印记) —— 上游就这个形状。
        if (oldBuff.value < oldBuff.info.maxValue) {
          oldBuff.value += newBuff.value
          this.onAddBuff(newBuff, buffUnit, state)
          return !isResisted
        }
        return false
      case CopyHandleType.Max:
        if (newBuff.value > oldBuff.value) {
          this.removeBuff(oldBuff, buffUnit, state)
          this.newBuff(newBuff, buffUnit, state)
          return !isResisted
        }
        return false
      case CopyHandleType.Min:
        if (newBuff.value < oldBuff.value) {
          this.removeBuff(oldBuff, buffUnit, state)
          this.newBuff(newBuff, buffUnit, state)
          return !isResisted
        }
        return false
    }
  }

  // :247-259 AddRangeBuff(range, buffUnit, state) —— **稳定**排序 (Enumerable.OrderBy 是稳定排序,
  // Array.prototype.sort 在 ES2019 起也保证稳定), 键 `x?.info.addPriority ?? int.MinValue`: null 项排在最前,
  // 然后被 AddBuff(null, …) 收下并 return false。`isSuccess |=` 是**或 accumulate**, 不是「最后一项说了算」。
  addRangeBuff(buffRange: Buff[] | null, buffUnit: Unit | null, state: BattleState | null, invokeUnit: Unit | null = null): boolean {
    if (buffRange === null) return false
    // null 项的键是 int.MinValue ⇒ 排最前, 随后被 addBuff(null, …) 收下返回 false。
    const keyOf = (x: Buff | null): number => (x === null || x === undefined ? INT_MIN : x.info.addPriority)
    const sorted = [...buffRange].sort((a, b) => keyOf(a) - keyOf(b))
    let isSuccess = false
    for (const buff of sorted) {
      // 上游是 `isSuccess |= AddBuff(...)`: C# 的 `|=` **不短路**, 每一项都会被加。
      // 写成 `isSuccess = isSuccess || addBuff(...)` 会在第一次成功后就跳过后续调用 (实测: 四只袋子
      // 只剩一只), 所以先算再或。
      // :261 的四参重载把 invokeUnit 单独传 (CopyBuff 的 type 支用它), 三参重载则 invokeUnit=buffUnit。
      const ret = this.addBuff(buff, buffUnit, invokeUnit ?? buffUnit, state)
      isSuccess = isSuccess || ret
    }
    return isSuccess
  }

  // :277-289 OnRemoveBuff —— 与 OnAddBuff 同形, 但**多一道 state==null 的早退** (OnAddBuff 没有,
  // 因为它的两个调用点都在 state!=null 的路径上)。
  onRemoveBuff(buff: Buff | null, buffUnit: Unit | null, state: BattleState | null): void {
    if (buff === null) return
    if (state === null) return

    const tmpPhase = state.phase
    state.phase = EffectTiming.OnRemoveBuff
    for (const x of sortByPriority(buff.effects.filter((e) => e.timing === EffectTiming.OnRemoveBuff)))
      TRIGGER(x, buffUnit, state, true, false, this.parent)
    state.phase = tmpPhase
  }

  // :291-298 RemoveBuff —— **先触发后摘除**: 被 OnRemoveBuff 放出去的那条效果看到的袋里还有这条印记。
  // 摘除是 List.Remove(item) ⇒ 只删第一个引用相等的项, 找不到返回 false (不抛)。
  removeBuff(buff: Buff | null, buffUnit: Unit | null, state: BattleState | null): boolean {
    if (buff === null) return false
    this.onRemoveBuff(buff, buffUnit, state)
    const at = this.buffs.indexOf(buff)
    if (at === -1) return false
    this.buffs.splice(at, 1)
    return true
  }

  // :300-315 RemoveRangeBuff(IEnumerable<Buff>, …) —— `isSuccess |=` 同样**不短路**: 表里每一项都会被摘除,
  // 包括 null 项 (RemoveBuff(null) 给 false, 但**不**中止循环)。
  private removeRange(list: Buff[] | null, buffUnit: Unit | null, state: BattleState | null): boolean {
    if (list === null) return false
    let isSuccess = false
    for (const buff of list) {
      // 先算再或: 写成 `isSuccess = isSuccess || this.removeBuff(…)` 会在第一次成功后**短路**掉后续摘除
      // (与 addRangeBuff 上面那条同一条陷阱, 这里曾经就这么错过 b-9)。
      const ret = this.removeBuff(buff, buffUnit, state)
      isSuccess = isSuccess || ret
    }
    return isSuccess
  }

  // :317-321 RemoveRangeBuff(Predicate<Buff>, …, int randomCount = -1)。四个必须照搬的点:
  //   · 两个 `RemoveRangeBuff` **元数可以相同** (randomCount 有默认值), C# 靠首参类型静态分派 ⇒
  //     TS 只能在运行时看首参是不是函数, 别按元数挑 (同 Effect 构造那条陷阱);
  //   · `buffs.FindAll(pred)?.Random(…)` 的 `?.` 是**死代码** —— FindAll 从不返回 null;
  //   · `count = randomCount < 0 ? int.MaxValue : randomCount`, 而 `Random(count, repeat=false)` 在
  //     `count > 候选长度` 时**静默返回整表浅拷** ⇒ 默认那支(-1)是**确定性**的「摘掉所有匹配项」,
  //     一次随机都不取 ⇒ 这条路径今天就能进对拍;
  //   · 只有显式给了非负且不超过候选数的 count 才会真的掷骰 (native Random ⇒ 需要注入)。
  //     count=0 不进循环 ⇒ 什么都不摘, 返回 false。
  removeRangeBuff(target: Buff[] | ((buff: Buff) => boolean) | null, buffUnit: Unit | null, state: BattleState | null, randomCount = -1): boolean {
    if (typeof target !== 'function') return this.removeRange(target, buffUnit, state)
    const candidates = this.buffs.filter(target)
    const count = randomCount < 0 ? INT_MAX : randomCount
    // 上游 `!repeat && count > values.Count` 的短路在取骰子**之前**, 所以这一支不需要随机源。
    if (count > 0 && count <= candidates.length && REMOVE_RNG === null)
      throw new Error('NOT_PORTED: PetBattleBuffController.RemoveRangeBuff(pred, randomCount ≥ 0) 要 native ListHelper.Random —— 不可比, 用 setBuffRemoveRng 注入')
    return this.removeRange(listRandom(candidates, count, false, REMOVE_RNG as Rng), buffUnit, state)
  }
}

// Unit.cs:31 —— `buffController => new PetBattleBuffController(Element.全部, buffs: unitBuffs)`。
// 每次**属性访问都新建一个控制器**, 且 `buffs` 里是 unitBuffs 的**同一批引用**。
// 两个后果: (a) 往返回的 buffs 里 push 不会改到 unit.unitBuffs; (b) 元素块 id 恒为 [0],
// 而 unitBuffs 里若有 id 命中 getElementBlockId 的印记会被 IsBuffBlocked 滤掉 (构造期就滤)。
export const unitBuffController = (unit: Unit): PetBuffController =>
  new PetBuffController(Element.全部, Element.普通, unit.unitBuffs)
