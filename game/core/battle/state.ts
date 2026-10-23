// Scene Specific/Battle/{Unit.cs, UnitComponent/UnitPetSystem.cs, BattleState.cs} 的逐行移植 ——
// S3 的**快照接缝**: 战斗状态 = 一帧全部可变数据的闭包, 「拷贝构造逐成员」就是回放/存档的语义本身。
//
// ── 为什么这一份能脱离宠表跑 ──
// BattleState 只*读*宠的几个成员 (name/isDead/isMovable/isToken/stayTurn/anger/三个 controller),
// 所以宠从 views.ts 的 BattlePetView 进来, 技能从 SkillRecord 进来。等 S6 把宠表接进 oracle,
// 换掉的只是**提供方**, 这里的判据一个字不用动 —— 这是当初切片的约定 (docs/engine/port-map.md 的 S3)。
//
// ── 拷贝构造的三档深浅, 上游是刻意的, 别统一 ──
//   · BattleState(rhs): lastTurnState / stateBuffs / settings / result / 两个 Unit **全深拷**,
//     reports/options/actionOrder 是**新容器**;
//   · Unit(rhs): petSystem 深拷 (每只宠 new BattlePet), parallelSkillSystems 深拷, unitBuffs 深拷;
//   · UnitPetSystem(原袋) 那个构造只 Array.Copy ⇒ **引用浅拷**, 而 UnitPetSystem(rhs) 逐只深拷。
//     同一个类两个构造一个浅一个深, 是「初始袋共享外部数据、快照各自独立」的实现方式。
//
// ── 围栏 (按 docs/engine/port-map.md, 不移植但显式留缝) ──
//   · hudSystem / cardSystem: Unit 的构造里 new, 拷贝构造里也 new —— 移植体不带这两个字段,
//     它们不参与 identifier 读取, 也不进存档。Card 模式下 GetEffectHandler / IsSkillCostEnough
//     会读 cardSystem.hand ⇒ 到那儿**抛**, 不静默降级成普通技能表。
//   · Photon: Unit.IsMyUnit 的 `PhotonNetwork.IsConnected ? … : IsMasterUnit()` 在离线时就是
//     IsMasterUnit(), 所以默认接缝答「未连接」⇒ 语义完整退化, 不抛;
//     BattleState.myUnit/opUnit 只在 mode==PVP 时才要 IsMasterClient ⇒ 那一支抛。
//   · UnityEngine.Random: Unit.random / RNG() 三处 Rolling 全部走注入的 Rng (rng.ts)。
//     random 是**存档字段** (拷贝构造逐字抄), 而 rng 是环境, 所以 Unit 带一份 randomSource。
//
// headless 纪律: 本文件不出现 Database.instance / Player.instance / UnityEngine / Photon。

import { Buff } from '../buff/buff.ts'
import { CopyHandleType } from '../buff/buff-database.ts'
import { EffectTiming } from '../effect/effect-database.ts'
import { abs as MathfAbs, f, min as MathfMin, sign as MathfSign, toInt } from '../mathf.ts'
import { isInRange } from '../numutil.ts'
import { Status } from '../pet/status.ts'
import { numIdentifier } from '../buff/buff-info.ts'
import { atIndex, dictGet } from '../collections.ts'
import { parseIntOrThrow, trimStartStr, tryTrimParentheses, tryTrimStart } from '../strutil.ts'
import type { Rng } from '../rng.ts'
import type { Effect } from '../effect/effect.ts'
import { SkillType } from '../pet/skill.ts'
import {
  calculateAccuracy as damageCalculateAccuracy, calculateDamage as damageCalculateDamage,
  prepareDamageParam as damagePrepareDamageParam, type DamageParam,
} from './damage.ts'
import { BattleRule, BattleSettings, BattleMode } from './settings.ts'
import { BattleResult } from './result.ts'
import { EffectHandler, type EffectStateView } from './effect-handler.ts'
import { UnitSkillSystem } from './unit-skill-system.ts'
import { cloneSkill, isSelectReady, skillPP, type BattlePetView, type SkillRecord } from './views.ts'

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue

/** Unit.cs:115-118 / BattleState.cs:32-33 的联机身份接缝。默认「未连接」⇒ 全部走 master。 */
export interface NetFence {
  isConnected(): boolean
  isMasterClient(): boolean
}

let NET: NetFence = {
  isConnected: () => false,
  isMasterClient: () => { throw new Error('房管侧 NetworkManager.IsMasterClient 不可用 (围栏内不做 PVP)') },
}
export const setNetFence = (p: Partial<NetFence>): void => { NET = { ...NET, ...p } }

// ───────────────────────────────────────────── UnitPetSystem.cs

/** petBag 的元素在 C# 是 BattlePet[], 而**数组本身**是定长的 (new BattlePet[6] / Array.Resize)。 */
export type PetBag = (BattlePetView | null)[]

export class UnitPetSystem {
  petBag: PetBag
  backupPetBag: PetBag
  tokenPetBag: PetBag
  cursor = 0
  specialChance = 1

  // UnitPetSystem.cs:20-27 —— Array.Copy ⇒ **引用**浅拷; 两个备用袋是新数组 (全 null), 不是原袋的副本。
  constructor(originalPetBag: PetBag) {
    this.petBag = [...originalPetBag]
    this.backupPetBag = new Array(originalPetBag.length).fill(null)
    this.tokenPetBag = new Array(originalPetBag.length).fill(null)
  }

  // :29-35 拷贝构造 —— 三只袋子逐只 new BattlePet, cursor/specialChance 直接抄。
  static from(rhs: UnitPetSystem): UnitPetSystem {
    const out = Object.create(UnitPetSystem.prototype) as UnitPetSystem
    out.petBag = rhs.petBag.map((x) => (x === null ? null : x.clone()))
    out.backupPetBag = rhs.backupPetBag.map((x) => (x === null ? null : x.clone()))
    out.tokenPetBag = rhs.tokenPetBag.map((x) => (x === null ? null : x.clone()))
    out.cursor = rhs.cursor
    out.specialChance = rhs.specialChance
    return out
  }

  // :14-15 —— petBag[cursor]: cursor 越界在 C# 是 IndexOutOfRangeException, 这里显式建模。
  // GiveTurnToNextUnit 会把 cursor 写成 Abs(actionOrder[i]) - 1, 于是 **-1 是可达的**。
  get pet(): BattlePetView | null { return atIndex(this.petBag, this.cursor, 'UnitPetSystem.pet') }
  get token(): BattlePetView | null { return atIndex(this.tokenPetBag, this.cursor, 'UnitPetSystem.token') }

  get petNum(): number { return this.petBag.filter((x) => x !== null).length }
  get alivePetNum(): number { return this.petBag.filter((x) => x !== null && !x.isDead).length }
  get deadPetNum(): number { return this.petBag.filter((x) => x !== null && x.isDead).length }

  // :37-53 —— 越界先判 (IsInRange 上界开), 然后**两只袋子都**把 stayTurn 归零再换。
  swapBackupPet(index: number): boolean {
    if (!isInRange(index, 0, this.petBag.length)) return false

    if (this.petBag[index] !== null) this.petBag[index]!.stayTurn = 0
    if (this.backupPetBag[index] !== null) this.backupPetBag[index]!.stayTurn = 0

    const pet = this.backupPetBag[index]!
    this.backupPetBag[index] = this.petBag[index]!
    this.petBag[index] = pet
    return true
  }

  // :55-72 —— 换替身: 替身死了/没有就 false; 换完把**原位的怒气**塞给新上场的替身
  // (`petBag[index]?.anger ?? 0` 是旧宠的怒气, 旧宠此时已经在 tokenPetBag[index])。
  swapTokenPet(index: number): boolean {
    if (!isInRange(index, 0, this.petBag.length)) return false

    const token = this.tokenPetBag[index]
    if (token === null || token.isDead) return false

    token.stayTurn = 0

    const anger = this.petBag[index] === null ? 0 : this.petBag[index]!.anger
    this.tokenPetBag[index] = this.petBag[index]!
    this.petBag[index] = token
    this.petBag[index]!.anger = anger
    return true
  }

  // :74-99 —— 找第一个**三袋全空**的格子; 没有就把三只袋子一起扩容到 (len/6+1)*6 (整数除法)。
  addNewPet(pet: BattlePetView): void {
    let newPetCursor
    for (newPetCursor = 0; newPetCursor < this.petBag.length; newPetCursor++) {
      if (this.petBag[newPetCursor] !== null) continue
      if (this.backupPetBag[newPetCursor] !== null) continue
      if (this.tokenPetBag[newPetCursor] !== null) continue
      break
    }

    if (newPetCursor >= this.petBag.length) {
      const next = (Math.trunc(this.petBag.length / 6) + 1) * 6
      const resize = (bag: PetBag): PetBag => {
        const grown: PetBag = new Array(next).fill(null)
        for (let i = 0; i < Math.min(bag.length, next); i++) grown[i] = bag[i]!
        return grown
      }
      this.petBag = resize(this.petBag)
      this.backupPetBag = resize(this.backupPetBag)
      this.tokenPetBag = resize(this.tokenPetBag)
    }

    this.petBag[newPetCursor] = pet
  }

  // :101-129 —— 回合首: 先按并行数让出战袋, 再把**已死的上阵宠置 null 并尝试补位 (替顶上)**,
  // 没替身的那格则推进替身宠的回合数。最后 parallelCount>1 且当前宠死了才自动换 cursor。
  onTurnStart(thisUnit: Unit, state: BattleState): void {
    const parallelCount = MathfMin(state.settings.parallelCount, this.alivePetNum)

    // 上游 :104 的 `var parallelCursor = cursor;` 没人读 (GetParallelPetBag 自己再取一次), 不搬。
    this.getParallelPetBag(parallelCount).forEach((x) => x.onTurnStart(thisUnit, state))

    for (let i = 0; i < this.petBag.length; i++) {
      const p = this.petBag[i]
      // `petBag[i]?.isToken ?? true` —— null 走 true 那一支 (空位也要参与补位判定)。
      if (p === null ? true : p.isToken) {
        if (p === null ? true : p.isDead) this.petBag[i] = null
        if (this.swapTokenPet(i)) this.petBag[i]!.onTurnStart(thisUnit, state)
      } else {
        const t = this.tokenPetBag[i]
        if (t === null ? true : t.isDead) this.tokenPetBag[i] = null
        else t.onTurnStart(thisUnit, state)
      }
    }

    const cur = this.pet
    if (state.settings.parallelCount > 1 && (cur === null ? true : cur.isDead))
      this.cursor = this.getNextCursorCircular()
  }

  refreshStayTurn(): void {
    for (const p of this.petBag) if (p !== null) p.stayTurn = 0
  }

  // :138-148 —— 从**当前 cursor** 起按环形取 parallelCount 只 (谓词恒真 ⇒ 含死宠与 null)。
  // while 的先取后比: 循环条件本身就是「取到的下一个 != cursor」, 所以 bag 至少含 pet 一项。
  // 别把它"修"成有界循环: cursor 落在 [0, parallelCount) 之外时上游就是**不自终止** (实测 C# 数到数组
  // 上限抛 OutOfMemoryException), 这是被 oracle 量过的行为, 不是笔误。
  getParallelPetBag(parallelCount: number): (BattlePetView | null)[] {
    const bag: (BattlePetView | null)[] = [this.pet]
    if (parallelCount === 1) return bag

    let parallelCursor = this.cursor
    for (;;) {
      const next = this.getNextCursorCircular(parallelCursor, () => true, (i) => i < parallelCount)
      if (next === this.cursor) break
      parallelCursor = next
      bag.push(this.petBag[parallelCursor]!)
    }
    return bag
  }

  getParallelPetBagCursor(parallelCount: number): number[] {
    return this.getParallelPetBag(parallelCount).map((p) => this.petBag.indexOf(p))
  }

  // :163-177 —— 环形找下一个满足条件的下标。三条别改: start<0 ⇒ 以 cursor 为起点; 找不到 ⇒ **返回 start**;
  // 搜索从 start+1 开始 ⇒ **当前宠自己永远不会被返回** (除非它转一圈又回来)。
  getNextCursorCircular(
    start = -1,
    petFilter: ((pet: BattlePetView) => boolean) | null = null,
    indexFilter: ((index: number) => boolean) | null = null,
  ): number {
    const from = start < 0 ? this.cursor : start
    const filter = petFilter ?? ((pet: BattlePetView) => !pet.isDead)
    const indexOk = indexFilter ?? (() => true)
    for (let i = 0; i < this.petBag.length; i++) {
      const index = (from + i + 1) % this.petBag.length
      if (!indexOk(index)) continue

      const pet = this.petBag[index]
      if (pet !== null && filter(pet)) return index
    }
    return from
  }

  // :179-192
  getPetSystemIdentifier(id: string): number {
    switch (id) {
      case 'cursor': return this.cursor
      case 'aliveNum': return this.alivePetNum
      case 'deadNum': return this.deadPetNum
      case 'specialChance': return this.specialChance
      default: return FLOAT_MIN_VALUE
    }
  }

  tryGetPetSystemIdentifier(id: string): { ok: boolean; num: number } {
    const num = this.getPetSystemIdentifier(id)
    return { ok: num !== FLOAT_MIN_VALUE, num }
  }
}

// ───────────────────────────────────────────── Unit.cs

export class Unit {
  // Unit.cs:11 `{ get; protected set; }` —— 只有子类构造能改, 移植体当只读用。
  id: number
  random: number
  parallelCount: number
  petSystem: UnitPetSystem
  parallelSkillSystems: (UnitSkillSystem | null)[]
  unitBuffs: Buff[]
  isDone = false

  // UnityEngine.Random 的进程内替身。**不进拷贝构造** (rhs.random 才是被抄的那个存档字段)。
  randomSource: Rng

  // Unit.cs:38-49 构造。两处按上游形状留着:
  //   · parallelSkillSystems 的**条数**: parallelCount<=1 ⇒ 1 条, 否则 = petBag.Length (不是 parallelCount);
  //   · hudSystem/cardSystem 不建 (围栏, 见文件头)。
  constructor(petBag: PetBag, idNum: number, settings: BattleSettings, rng: Rng) {
    this.id = idNum
    this.randomSource = rng
    this.random = rng.nextInt(0, 100)
    this.parallelCount = settings.parallelCount
    this.petSystem = new UnitPetSystem(petBag)
    this.parallelSkillSystems = Array.from({ length: this.parallelCount <= 1 ? 1 : petBag.length }, () => new UnitSkillSystem())
    this.unitBuffs = []
  }

  // :51-63 拷贝构造 —— random 逐字抄 (不再 roll), 三个容器各自新建。
  static from(rhs: Unit): Unit {
    const out = Object.create(Unit.prototype) as Unit
    out.id = rhs.id
    out.random = rhs.random
    out.parallelCount = rhs.parallelCount
    out.isDone = rhs.isDone
    out.petSystem = UnitPetSystem.from(rhs.petSystem)
    out.parallelSkillSystems = rhs.parallelSkillSystems.map((x) => UnitSkillSystem.from(x!))
    out.unitBuffs = rhs.unitBuffs.map((x) => x.clone())
    out.randomSource = rhs.randomSource
    return out
  }

  // :16-19 —— get 与 set 都读当前 skillSystem, 于是 set 是「把**当前那一本**换成新对象」。
  // List.Update 用 IndexOf(oldItem) 找位置: 找不到 (旧对象已被换掉) ⇒ IndexOf 给 -1 ⇒ **静默不写**。
  get skillSystem(): UnitSkillSystem | null {
    if (this.parallelCount <= 1) return this.parallelSkillSystems.length ? this.parallelSkillSystems[0]! : null
    return atIndex(this.parallelSkillSystems, this.petSystem.cursor, 'Unit.skillSystem')
  }
  set skillSystem(value: UnitSkillSystem | null) {
    const index = this.parallelSkillSystems.indexOf(this.skillSystem)
    if (isInRange(index, 0, this.parallelSkillSystems.length)) this.parallelSkillSystems[index] = value
  }

  get pet(): BattlePetView | null { return this.petSystem.pet }
  get token(): BattlePetView | null { return this.petSystem.token }
  get skill(): SkillRecord | null { return this.skillSystem?.skill ?? null }

  // :125-129 —— 上游是 `set skill` 属性, 代价从 Player.instance.currentBattle.settings 拿。
  // 移植体**只留方法形态** (settings 显式入参, 同 damage.ts 的口径), 不留一个不扣代价的 setter:
  // 那种"看着一样但静默少扣一次 PP"的接缝, 对拍里表现为只有 TS 侧的 PP 永远不减。
  setSkill(_skill: SkillRecord | null, settings: BattleSettings): void {
    const sys = this.skillSystem
    if (sys !== null) sys.skill = _skill === null ? null : cloneSkill(_skill)
    this.takeSkillCost(this.skill, settings)
  }

  // :34 —— 「能不能动」= 自己没有不可动印记 && 当前宠在 && 当前宠能动
  get isMovable(): boolean {
    return !this.unitBuffs.some((x) => x.isUnmovable()) && this.pet !== null && this.pet.isMovable
  }

  get isReady(): boolean { return this.ready() }

  // :90-108 —— 并行时: 任一位选了逃跑 ⇒ 立刻 ready; 否则逐个**活宠**位都得选好了技 (死位与空位跳过)。
  ready(): boolean {
    if (this.parallelCount <= 1) {
      const skill = this.skill
      return skill !== null && isSelectReady(skill)
    }

    // 列表项可能是 null: `set skillSystem` 那条 UpdateAt 允许写进 null (上游类型允许)。
    if (this.parallelSkillSystems.some((x) => x !== null && x.skill !== null && x.skill.type === SkillType.逃跑))
      return true

    for (let i = 0; i < this.parallelSkillSystems.length; i++) {
      const pet = this.petSystem.petBag[i]
      if (pet === null || pet.isDead) continue

      const skill = this.parallelSkillSystems[i]?.skill ?? null
      if (skill === null || !isSelectReady(skill)) return false
    }
    return true
  }

  isMasterUnit(): boolean { return this.id === 1 }

  // :115-118 —— 离线时 (默认接缝) 就是 IsMasterUnit()。
  isMyUnit(): boolean {
    return NET.isConnected() ? (NET.isMasterClient() === this.isMasterUnit()) : this.isMasterUnit()
  }

  // :120-123 —— 注意它**写回** random 并返回 (这一位的先手随机数)。
  roll(): number { return (this.random = this.randomSource.nextInt(0, 100)) }

  // :65-74 —— 顺序即语义: isDone 归零 → roll → 宠系统 → 各本账 → (hud 围栏) → 印记倒数。
  onTurnStart(state: BattleState): void {
    this.isDone = false
    this.roll()
    this.petSystem.onTurnStart(this, state)
    this.parallelSkillSystems.forEach((x) => x?.onTurnStart())
    this.reduceBuffTurn()
  }

  // :76-88 —— 两轮扫描, 且第二轮**重新读** turn:
  // 第一轮把 >0 的都 -1 并记进 candidates; 删除时只删「在 candidates 里且现在 ==0」的。
  // 于是 SetBuffIdentifier 里那条夹紧/改写规则 (buff.ts) 会直接决定谁被删掉。
  reduceBuffTurn(turnIdentifier = 'turn'): void {
    const candidates: Buff[] = []
    for (let i = 0; i < this.unitBuffs.length; i++) {
      const turn = this.unitBuffs[i]!.getBuffIdentifier(turnIdentifier)
      if (turn > 0) {
        this.unitBuffs[i]!.setBuffIdentifier(turnIdentifier, turn - 1)
        candidates.push(this.unitBuffs[i]!)
      }
    }
    // List.RemoveAll 保序; candidates.Contains 是引用相等 (Buff 没重写 Equals)。
    this.unitBuffs = this.unitBuffs.filter((x) => !(candidates.includes(x) && x.getBuffIdentifier(turnIdentifier) === 0))
  }

  // :131-139 —— BattleRule 版 (读**当前**技能与宠的怒气)。上游两个同名重载, 这里分开命名,
  // 因为 TS 的分派按参数形状走, 混成一个会读错技能。
  isSkillCostEnoughForRule(rule: BattleRule): boolean {
    const skill = this.skill!
    const pet = this.pet!
    switch (rule) {
      case BattleRule.Anger: return skill.anger <= pet.anger || pet.buffController.getBuff(61) !== null
      default: return true
    }
  }

  // :141-195 —— 六个 copyHandle 分支 + default 落 New。Replace 那条把 -1 当**无限久**参与比较,
  // 于是「永久」旧印记永远压得过有期限的新印记 (而不是反过来)。Stack/Max/Min 都只比 value。
  addBuff(newBuff: Buff | null): boolean {
    if (newBuff === null) return false

    const oldBuff = this.unitBuffs.find((x) => x.id === newBuff.id) ?? null
    if (oldBuff === null) {
      this.unitBuffs.push(newBuff)
      return true
    }

    switch (newBuff.info.copyHandleType) {
      default:
      case CopyHandleType.New:
        this.unitBuffs.push(newBuff)
        return true
      case CopyHandleType.Block:
        return false
      case CopyHandleType.Replace: {
        const oldBuffTurn = oldBuff.turn === -1 ? Number.MAX_SAFE_INTEGER : oldBuff.turn
        const newBuffTurn = newBuff.turn === -1 ? Number.MAX_SAFE_INTEGER : newBuff.turn
        if (oldBuffTurn <= newBuffTurn) {
          this.unitBuffs = this.unitBuffs.filter((x) => x !== oldBuff)
          this.unitBuffs.push(newBuff)
          return true
        }
        return false
      }
      case CopyHandleType.Stack:
        if (oldBuff.value < oldBuff.info.maxValue) {
          oldBuff.value = oldBuff.value + newBuff.value
          return true
        }
        return false
      case CopyHandleType.Max:
        if (newBuff.value > oldBuff.value) {
          this.unitBuffs = this.unitBuffs.filter((x) => x !== oldBuff)
          this.unitBuffs.push(newBuff)
          return true
        }
        return false
      case CopyHandleType.Min:
        if (newBuff.value < oldBuff.value) {
          this.unitBuffs = this.unitBuffs.filter((x) => x !== oldBuff)
          this.unitBuffs.push(newBuff)
          return true
        }
        return false
    }
  }

  // :197-200 —— RemoveAll 返回**删掉的条数**, 所以空表/没匹配都 false。
  removeBuff(predicate: (buff: Buff) => boolean): boolean {
    const before = this.unitBuffs.length
    this.unitBuffs = this.unitBuffs.filter((x) => !predicate(x))
    return this.unitBuffs.length < before
  }

  onChainStart(): void { this.skillSystem?.onChainStart() }

  // :207-220 —— 三个数值方法把 S2 的纯函数接到自己的账本上。
  // UnitSkillSystem.cs:161/174/201 的 CalculateAccuracy/PrepareDamageParam/CalculateDamage 在 damage.ts,
  // 差别只有一个: 上游把结果**写进实例字段** (isHit/level/atk/def/…/skillDamage/isCritical), 这里照做。
  calculateAccuracy(rhs: Unit): boolean {
    const sys = this.skillSystem!
    const r = damageCalculateAccuracy(sys.skill!, this.pet!, rhs.pet!, this.randomSource)
    sys.isHit = r.isHit
    return sys.isHit
  }

  prepareDamageParam(rhs: Unit): DamageParam | null {
    const sys = this.skillSystem!
    const p = damagePrepareDamageParam(sys.skill, this.pet, rhs.pet, sys.weatherBuff)
    if (p !== null) {
      sys.level = p.level
      sys.atk = p.atk
      sys.def = p.def
      sys.elementRelation = p.elementRelation
      sys.sameElementBuff = p.sameElementBuff
    }
    return p
  }

  // 上游的 skillDamage 是**实例字段**且在循环里累加, 所以第二次调用接着上一次的数走;
  // damage.ts 的返回值只是「这一次算出来的和」⇒ 这里 += 到字段上再返回字段。
  calculateDamage(rhs: Unit): number {
    const sys = this.skillSystem!
    const param: DamageParam = {
      level: sys.level, atk: sys.atk, def: sys.def,
      elementRelation: sys.elementRelation, sameElementBuff: sys.sameElementBuff, weatherBuff: sys.weatherBuff,
    }
    const r = damageCalculateDamage(sys.skill!, param, this.pet!, rhs.pet!, this.randomSource, sys.comboDamageInfoList)
    sys.skillDamage += r.skillDamage
    sys.isCritical ||= r.isCritical
    return sys.skillDamage
  }

  // :222-242 —— 按 settings.rule 判**这一次**能不能出招 (GetEffectHandler 用它筛被动技)。
  // Card 模式的 hand 查表在围栏外, 到那一支抛。
  isSkillCostEnough(skillId: number, settings: BattleSettings): boolean {
    if (settings.mode === BattleMode.Card && this.isMyUnit())
      throw new Error('cardSystem.hand 在围栏外 (docs/engine/port-map.md: 卡牌模式不移植) —— Unit.cs:224')

    const pet = this.pet
    if (pet === null) throw new TypeError('NullReferenceException: Unit.pet 为 null 时 IsSkillCostEnough 直接解引用它 (Unit.cs:226)')
    const skill = pet.skillController.findSkill(skillId)
    if (skill === null) return false

    switch (settings.rule) {
      default: return true
      case BattleRule.Anger:
        return pet.statusController.anger >= skill.anger || pet.buffController.getBuff(61) !== null
      case BattleRule.PP:
        return skillPP(skill) > 0
    }
  }

  // :244-267 —— 只有**非 action** 技才扣代价 (所以空过/道具不扣); Card 模式整条不扣。
  // 扣的是 petBag[cursor] 技能表里的那一份, 不是 skillSystem.skill 的副本 —— 这正是深拷副本的用途:
  // 账上的技能是「这一手要打的那张」, 表里的才是「还剩几次」。
  takeSkillCost(skill: SkillRecord | null, settings: BattleSettings, cursor = -1): void {
    if (skill === null || skill.isAction) return
    if (settings.mode === BattleMode.Card) return

    if (cursor < 0) cursor = this.petSystem.cursor

    switch (settings.rule) {
      case BattleRule.Anger:
        break
      case BattleRule.PP: {
        const realSkill = this.petSystem.petBag[cursor]?.skillController.findSkill(skill.id) ?? null
        if (realSkill !== null) realSkill.pp = realSkill.pp - 1
        break
      }
    }
  }
}

// ───────────────────────────────────────────── BattleState.cs

export class BattleState implements EffectStateView {
  lastTurnState: BattleState | null = null

  turn = 0
  parallelTurn = 0
  whosTurn = 0
  phase: EffectTiming = EffectTiming.None
  weather = 0
  stateBuffs: [string, Buff][] = []
  // Queue<string>(30): 容量只影响内部数组, 条数上限由 AddReport 自己维持 (>=30 先出队)。
  reports: string[] = []
  options = new Map<string, string>()

  masterUnit!: Unit
  clientUnit!: Unit
  actionOrder: number[] = []
  actionCursor = -1

  settings!: BattleSettings
  result!: BattleResult

  // BattleState.cs:37-56 —— 两个 Unit 走**拷贝构造** (外部袋里的宠与这一局脱钩),
  // stateBuffs 取 settings.initBuffs 的 getter ⇒ 每次现解析出的**新对象**。
  constructor(settings: BattleSettings, masterTurn: Unit, clientTurn: Unit) {
    this.lastTurnState = null

    this.turn = 0
    this.whosTurn = 0
    this.phase = EffectTiming.OnBattleStart
    this.weather = settings.weather
    this.stateBuffs = settings.initBuffs
    this.reports = []
    this.options = new Map()

    this.masterUnit = Unit.from(masterTurn)
    this.clientUnit = Unit.from(clientTurn)
    this.actionOrder = []
    this.actionCursor = -1

    this.settings = BattleSettings.from(settings)
    this.result = new BattleResult(settings)
  }

  // :58-78 拷贝构造 —— 见文件头「三档深浅」。lastTurnState 递归深拷 (只有一层, 因为 OnTurnStart 先斩后奏)。
  static from(rhs: BattleState): BattleState {
    const out = Object.create(BattleState.prototype) as BattleState
    out.lastTurnState = rhs.lastTurnState === null ? null : BattleState.from(rhs.lastTurnState)

    out.turn = rhs.turn
    out.parallelTurn = rhs.parallelTurn
    out.whosTurn = rhs.whosTurn
    out.phase = rhs.phase
    out.weather = rhs.weather
    out.stateBuffs = rhs.stateBuffs.map((x) => [x[0], x[1].clone()])
    out.reports = [...rhs.reports]
    out.options = new Map(rhs.options)

    out.masterUnit = Unit.from(rhs.masterUnit)
    out.clientUnit = Unit.from(rhs.clientUnit)
    out.actionOrder = [...rhs.actionOrder]
    out.actionCursor = rhs.actionCursor

    out.settings = BattleSettings.from(rhs.settings)
    out.result = BattleResult.from(rhs.result)
    return out
  }

  // EffectStateView —— EffectHandler.Condition 在 whosTurn==0 时要用「改过 whosTurn 的快照」跑两遍。
  snapshot(): BattleState { return BattleState.from(this) }

  get weatherBuff(): Buff { return Buff.getWeatherBuff(this.weather) }

  get isAllUnitDone(): boolean { return this.allUnitDone() }
  get isAllUnitReady(): boolean { return this.allUnitReady() }
  get isAnyPetDead(): boolean { return this.anyPetDead() }

  // :32-35 —— PVP 才问 master client (会抛, 见围栏); 其余模式恒 master/client。
  get myUnit(): Unit { return this.settings.mode === BattleMode.PVP ? (NET.isMasterClient() ? this.masterUnit : this.clientUnit) : this.masterUnit }
  get opUnit(): Unit { return this.settings.mode === BattleMode.PVP ? (NET.isMasterClient() ? this.clientUnit : this.masterUnit) : this.clientUnit }
  get atkUnit(): Unit | null { return this.whosTurn === 0 ? null : this.getUnitById(this.whosTurn) }
  get defUnit(): Unit | null { return this.whosTurn === 0 ? null : this.getUnitById(-this.whosTurn) }

  // :80-118 —— 前缀顺序即语义。两处必须照搬的怪处:
  //   · C# 的 TryTrimStart **每次都会重写 trimId** (前缀不匹配时原样返回), 所以只有最后一个
  //     前缀分支 ("buff") 能在括号匹配失败时把 trimId 留在**削过**的状态 ⇒ id="buffturn"
  //     会带着 trimId="turn" 落到 switch, 读出 turn 的值。这不是 bug 能修, 是语义。
  //   · buff 查不到 ⇒ float.MinValue; 查到但键不认识 ⇒ 回落 Identifier.GetNumIdentifier (它兜 0)。
  getStateIdentifier(id: string): number {
    let trimId = id

    const last = tryTrimStart(id, 'last.')
    if (last.ok) return this.lastTurnState === null ? FLOAT_MIN_VALUE : this.lastTurnState.getStateIdentifier(last.trim)

    const opt = tryTrimStart(id, 'option')
    trimId = opt.trim
    if (opt.ok) {
      const p = tryTrimParentheses(trimId)
      trimId = p.trim
      if (p.ok) return numIdentifier(dictGet(this.options, trimId, '0')!)
    }

    const st = tryTrimStart(id, 'settings.')
    trimId = st.trim
    if (st.ok) return this.settings.getSettingsIdentifier(st.trim)

    const rs = tryTrimStart(id, 'result.')
    trimId = rs.trim
    if (rs.ok) return this.result.getResultIdentifier(rs.trim)

    const bf = tryTrimStart(id, 'buff')
    trimId = bf.trim
    if (bf.ok) {
      const p = tryTrimParentheses(bf.trim)
      if (p.ok) {
        const buffKey = p.trim
        const pair = this.stateBuffs.find((x) => x[0] === buffKey)
        const buff = pair === undefined ? null : pair[1]
        if (buff === null) return FLOAT_MIN_VALUE

        const buffExpr = trimStartStr(bf.trim, `[${buffKey}].`)
        const r = buff.tryGetBuffIdentifier(buffExpr)
        return r.ok ? r.num : numIdentifier(buffExpr)
      }
      // 括号不匹配 ⇒ 带着**削过 buff 前缀的** trimId 落到下面的 switch (上游形状, 见注释)
    }

    switch (trimId) {
      case 'turn': return this.turn
      case 'actionCursor': return this.actionCursor
      case 'order.direction': return numIdentifier(dictGet(this.options, 'order_direction', '1')!)
      case 'phase': return f(this.phase)
      case 'weather': return this.weather
      case 'whosTurn': return this.whosTurn
      default: return FLOAT_MIN_VALUE
    }
  }

  // :120-136 —— 写 option[...] 与 switch 是**两条独立的路**: 前者落在削过前缀的 trimId 上,
  // switch 认的是原 id。于是 SetStateIdentifier("order.direction") 先什么也不写, 再递归写 option。
  setStateIdentifier(id: string, value: number): void {
    const opt = tryTrimStart(id, 'option')
    if (opt.ok) {
      const p = tryTrimParentheses(opt.trim)
      if (p.ok) this.options.set(p.trim, String(value))
    }

    switch (id) {
      default: return
      case 'order.direction':
        this.setStateIdentifier('option[order_direction]', value)
        return
    }
  }

  // :138-172 —— 唯一一处**改写上一帧快照**的地方: 先斩掉 lastTurnState 的 last (只留一层历史),
  // 再把当前帧拷成 phase=OnTurnEnd 的快照挂上。然后才 turn++。
  // turn==0 (首回合) 不建快照, 而是补两条登场战报 —— 那两条文案是战报队列的前两项。
  onTurnStart(): void {
    if (this.turn > 0) {
      if (this.lastTurnState !== null) this.lastTurnState.lastTurnState = null
      const snap = BattleState.from(this)
      snap.phase = EffectTiming.OnTurnEnd
      this.lastTurnState = snap
    } else {
      this.addReport(`我方<color=#ffbb33>【${this.myUnit.pet!.name}】</color>登场了！`)
      this.addReport(`敌方<color=#ff0080>【${this.opUnit.pet!.name}】</color>登场了！`)
    }

    this.turn++
    this.whosTurn = 0
    this.actionOrder = []
    this.actionCursor = -1
    this.setStateIdentifier('order.direction', 1)

    for (let i = 0; i < this.stateBuffs.length; i++) {
      if (this.stateBuffs[i]![1].turn > 0) this.stateBuffs[i]![1].turn--
    }
    this.stateBuffs = this.stateBuffs.filter((x) => x[1].turn !== 0)

    this.addReport(`<size=16><color=#00ff00>==== 第 ${this.turn} 回合 ====</color></size>`)

    this.masterUnit.onTurnStart(this)
    this.clientUnit.onTurnStart(this)
  }

  // :174-188
  allUnitDone(): boolean { return this.actionCursor >= this.actionOrder.length }
  allUnitReady(): boolean { return this.masterUnit.isReady && this.clientUnit.isReady }
  anyPetDead(): boolean { return this.masterUnit.pet!.isDead || this.clientUnit.pet!.isDead }

  // :190-239 —— 游标推进。三处按上游留着:
  //   · 出界先置 whosTurn=0 **再 return**, parallelTurn 根本不在这条路上累加 (它是死字段, 只有快照拷它);
  //   · parallelCount>1 时 rhs 的 cursor 取的是 lhs 技能的 parallel_target_index, 非数字 ⇒ int.Parse 抛;
  //   · 任一方当前宠为 null ⇒ 递归再推一格 (isDone 已经被写成 false 了, 递归不还原它)。
  giveTurnToNextUnit(): void {
    this.actionCursor++
    if (this.actionCursor >= this.actionOrder.length) {
      this.whosTurn = 0
      return
    }

    this.whosTurn = this.actionOrder[this.actionCursor]! > 0 ? 1 : -1

    const actionUnit = this.getUnitById(this.whosTurn)
    const rhsUnit = this.getRhsUnitById(actionUnit!.id)
    actionUnit!.isDone = false

    if (this.settings.parallelCount > 1) {
      actionUnit!.petSystem.cursor = MathfAbs(this.actionOrder[this.actionCursor]!) - 1
      const target = actionUnit!.skill
      const raw = target === null ? '0' : dictGet(target.options, 'parallel_target_index', '0')!
      rhsUnit!.petSystem.cursor = parseIntOrThrow(raw)
    }

    if (actionUnit!.pet === null || rhsUnit!.pet === null) {
      this.giveTurnToNextUnit()
      return
    }
  }

  // :241-255 —— 只看符号, 0 ⇒ null。
  getUnitById(id: number): Unit | null {
    if (id > 0) return this.masterUnit
    if (id < 0) return this.clientUnit
    return null
  }

  getRhsUnitById(lhsId: number): Unit | null { return this.getUnitById(-lhsId) }

  // :257-270 —— 单人: 看 actionOrder **首元素**的符号是不是自己的 id
  // (空表 ⇒ FirstOrDefault()=0 ⇒ Sign(0)=1 ⇒ 恒等 master 先手)。
  // 并行: 比两只 (sign*(cursor+1)) 在 actionOrder 里的**下标**, 找不到 ⇒ MaxValue ⇒ 排到最后。
  isGoFirst(lhsUnit: Unit): boolean {
    const unitId = lhsUnit.id
    if (this.settings.parallelCount <= 1) return MathfSign(this.actionOrder.length ? this.actionOrder[0]! : 0) === unitId

    const rhsUnit = this.getRhsUnitById(unitId)!
    let lhsCursor = this.actionOrder.indexOf(MathfSign(lhsUnit.id) * (lhsUnit.petSystem.cursor + 1))
    let rhsCursor = this.actionOrder.indexOf(MathfSign(rhsUnit.id) * (rhsUnit.petSystem.cursor + 1))

    lhsCursor = lhsCursor < 0 ? Number.MAX_SAFE_INTEGER : lhsCursor
    rhsCursor = rhsCursor < 0 ? Number.MAX_SAFE_INTEGER : rhsCursor
    return lhsCursor < rhsCursor
  }

  isGoLast(lhsUnit: Unit): boolean { return !this.isGoFirst(lhsUnit) }

  // :277-285 —— 两个入口只差 addSkillEffect 一个参数: 技能自带的那批效果进不进队列。
  applySkillsAndBuffs(): void { this.getEffectHandler(null).checkAndApply(this) }
  applyBuffs(): void { this.getEffectHandler(null, false).checkAndApply(this) }

  // :287-320 —— 空 handler 的**拼装顺序** (即同 priority 效果的执行序), 六段一段不能换:
  //   天气 → 场上印记 → (本手技能) → 被动技能 → Unit 印记 → 宠印记
  // invokeUnit==null 是「两边的 handler Concat」—— master 在前。
  // 上游 `pet.skillController` 在 pet 为 null 时 NRE, 这里同样直接解引用 (atUnitPet)。
  getEffectHandler(invokeUnit: Unit | null, addSkillEffect = true): EffectHandler {
    if (invokeUnit === null)
      return this.getEffectHandler(this.masterUnit, addSkillEffect).concat(this.getEffectHandler(this.clientUnit, addSkillEffect))

    const pet = invokeUnit.pet
    if (pet === null) throw new TypeError('NullReferenceException: Unit.pet 为 null 时 GetEffectHandler 就解引用了它 (BattleState.cs:295)')

    const unitEffects = invokeUnit.unitBuffs.filter((x) => !x.ignore).map((x) => x.effects)

    if (this.settings.mode === BattleMode.Card && invokeUnit.isMyUnit())
      throw new Error('cardSystem.hand 在围栏外 (docs/engine/port-map.md: 卡牌模式不移植) —— BattleState.cs:295')
    const passiveSkills = pet.skillController.allSkills

    // 上游是两段 Where + 一段 Select; 合成一个循环, 但**短路顺序**保持 (先判 null/type, 再问代价)。
    const skillEffects: Effect[][] = []
    for (const x of passiveSkills) {
      if (x !== null && x.type === SkillType.被动 && invokeUnit.isSkillCostEnough(x.id, this.settings))
        skillEffects.push(x.effects)
    }
    const buffEffects = pet.buffs.filter((x) => !x.ignore).map((x) => x.effects)

    const handler = new EffectHandler()

    handler.addEffects(invokeUnit, this.weatherBuff.effects)

    for (const e of this.stateBuffs.filter((x) => !x[1].ignore).map((x) => x[1].effects))
      handler.addEffects(invokeUnit, e)

    if (addSkillEffect && invokeUnit.skill !== null)
      handler.addEffects(invokeUnit, invokeUnit.skill!.effects)

    for (const e of skillEffects) handler.addEffects(invokeUnit, e)
    for (const e of unitEffects) handler.addEffects(invokeUnit, e)
    for (const e of buffEffects) handler.addEffects(invokeUnit, e)

    return handler
  }

  // :322-334 —— **借** phase 一用: 临时把时机改成 timing, 让 handler.Condition 去判, 再改回来。
  // 所以这一步不产生任何状态变化 (phase 复原), 但它会**原地重排 handler.queue** (见 effect-handler.ts)。
  getEffectsByTiming(timing: EffectTiming, handler: EffectHandler, filter: ((e: Effect) => boolean) | null = null): Effect[] {
    const ok = filter ?? (() => true)

    const tmpPhase = this.phase
    this.phase = timing

    const condition = handler.condition(this)
    const effects = handler.getEffects((e, i) => atIndex(condition, i, 'BattleState.GetEffectsByTiming') && ok(e))

    this.phase = tmpPhase
    return effects
  }

  // :336-342 —— 到 30 条先出队一条再进 ⇒ 队列**恒定不超过 30**, 且丢的是最旧的。
  addReport(report: string): void {
    if (this.reports.length >= 30) this.reports.shift()
    this.reports.push(report)
  }
}

// ── BattlePet.PowerUp (BattlePet.cs:333-354) ────────────────────────────
// core 里没有 BattlePet 的具体类 (宠宿主在镜像/游戏侧), 所以这条规则先落成自由函数, 由
// `BattlePetView.powerUp` 转发过来。四条必须照抄的地方:
//   · **先整表摘增幅/减益印记** (`RemoveRangeBuff(x => x.IsPower(), …)`) 再逐维算。摘的是 id 1..10 与
//     ±9/±10 那一批, 与 `GetPowerUpBuffId` 生成的正是同一批 ⇒ 上一轮的增幅不会残到这一轮;
//   · `isSet` 决定**免疫检查**跳不跳过 (`isSet || !IsBuffIdBlocked(id)`): 被免疫时增幅**不写**,
//     但循环下半段**照样跑** —— 它读的是 `GetPowerUp(type)` 的**既有值**, 于是"被免疫的这一维"仍会按
//     它当前(未变)的增幅补一枚印记。这不是笔误, 别顺手加 continue;
//   · `id` 在循环里被算了**两次**, 第二次用的是写回之后的 powerup ⇒ 免疫与否两条路都落到一个
//     "与控制器一致"的印记上; 而 `powerup=0` 时 `GetPowerUpBuffId` 给 0 ⇒ `continue`, 不补印记;
//   · 印记的 value 是 `Mathf.Abs(powerup)`, turn 恒为 -1 (永不过期)。
// `state != null` 的两处 (removeBuff/addBuff 的 OnRemoveBuff / OnAddBuff 触发) 由控制器自己抛 NOT_PORTED,
// 与上游的差别只在"没接的接缝会响", 不在规则本身。
export function petPowerUp(pet: BattlePetView, status: Status, lhsUnit: unknown, state: unknown, isSet = false): void {
  pet.buffController.removeRangeBuff((buff: Buff) => buff.isPower(), lhsUnit, state)

  for (let type = 0; type < Status.typeNames.length; type++) {
    let powerup = toInt(status.at(type))
    const wantId = Buff.getPowerUpBuffId(type, powerup)
    if (isSet || !pet.buffController.isBuffIdBlocked(wantId)) pet.statusController.addPowerUp(type, powerup)

    powerup = pet.statusController.getPowerUpType(type)
    const id = Buff.getPowerUpBuffId(type, powerup)
    if (id === 0) continue
    pet.buffController.addBuff(new Buff(id, -1, MathfAbs(powerup)), lhsUnit, null, state)
  }
}
