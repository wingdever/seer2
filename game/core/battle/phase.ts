// MVC/Model/Battle/BattlePhase.cs 的逐行移植 —— S3 第四段「驱动序」的地基。
//
// ── 本文件的范围 (docs/engine/port-map.md 第四段口径) ──
// 只搬**驱动序**: phase 时机写入、GetNextPhase 推进、GetEffectHandler 的队列组装。
// Effect.Condition/Apply 仍是围栏 (effect-handler.ts 的 JUDGE 默认抛 NOT_PORTED), 所以向量口径是:
//   · 组装形状 (kind `phaseq`) 允许带真表效果 —— 两边只比队列拼装, 不进入判定;
//   · 会走 CheckAndApply 的 DoWork 向量只发「两侧都抛」的 throw-only 形状 (实测: 拼装队列恒非空,
//     oracle 的真实 Condition/Apply 在注入世界撞 ECall/systemView 围栏 —— 生成器注释有逐条口径)。
//
// ── 与 BattleState.cs:287-320 那版同名拼装**刻意不同**的四处 ──
//   1. :62-63 null 分支不向下传 addSkillEffect ⇒ ApplyBuffs(null,false) 时每个 unit 仍按**含技能效果**拼装
//      (BattleState.cs 版转发该参数 —— 这不是笔误, 是对拍要钉死的上游怪癖);
//   2. :65 的 Card 判定读 battle.settings (= currentState?.settings, Battle.cs:13 是算属性),
//      而 :67 传给 IsSkillCostEnough 的是 state.settings —— 上游混用, 照搬;
//   3. :73 有 `state != null` 卫包住天气+场上印记 (BattleState.cs 版没有这层, 它自己就是 state);
//   4. :66-67 被动筛选是 LINQ **延迟执行** ⇒ IsSkillCostEnough 的抛点在 :84 foreach
//      (天气/技能效果已入队之后), 移植体用同一循环位置复现。
//
// ── 围栏与接缝 ──
//   · battle => Player.instance.currentBattle (BattlePhase.cs:10) 走 setPhaseBattle 注入;
//   · UI.SetState (BattleManager.cs:76-81) 上游只往 queue 里 Enqueue, 无 Unity 也能跑 —— 接缝注实现,
//     phaseq 这一批不经过它, 驱动序向量段再接 queue 形状;
//   · hudSystem (:116-123) 只写 UnitHudSystem 的展示字段 (CurHealInfo/CurCaptureInfo/petAnimType),
//     不进快照签名 ⇒ 移植体按零副作用处理, 每处 no-op 就地标注; 若分支向量实测暴露 NRE, 升级为抛建模。
//
// headless 纪律: 本文件不出现 Player.instance / UnityEngine / Photon。

import { EffectTiming } from '../effect/effect-database.ts'
import { atIndex, dictGet } from '../collections.ts'
import { f, floorToInt, max as MathfMax, sign as MathfSign } from '../mathf.ts'
import { parseIntOrThrow, replaceColorAndNewline } from '../strutil.ts'
import { SkillType } from '../pet/skill.ts'
import { BattleMode } from './settings.ts'
import type { BattleSettings } from './settings.ts'
import { BattleState, Unit } from './state.ts'
import { BattleResultState } from './result.ts'
import { EffectHandler } from './effect-handler.ts'
import { getSkillIdentifier, isAttackSkill, isNullOrEmptySkill, noOpSkill, type BattlePetView, type SkillRecord } from './views.ts'

/** BattleManager 在 phase 眼中的面 (BattleManager.cs:76-97)。 */
export interface PhaseUI {
  setState(last: BattleState | null, current: BattleState | null): void
  processQuery(processOne?: boolean): void
  stopTimer(): void
  // PassivePetChangePhase.cs:81-90 —— 上游是 HUD 条的展示开关, 不进快照; 本段按 no-op 口径为可选方法。
  setBottomBarInteractable?(interactable: boolean): void
  setOptionActive?(index: number, active: boolean): void
}

/** Battle.cs:11-19 在 phase 眼中的面 —— settings 是 currentState?.settings 的算属性, 可以为 null。 */
export interface PhaseBattle {
  readonly settings: BattleSettings | null
  currentState: BattleState | null
  lastState: BattleState | null
  readonly autoSkillOrder: number[] | null
  readonly ui: PhaseUI
  // Battle.cs:16 —— 驱动序 (battleNextPhase) 读写; 其余 phase 不碰。
  currentPhase: BattlePhase | null
}

let PHASE_BATTLE: (() => PhaseBattle) | null = null
export const setPhaseBattle = (get: () => PhaseBattle): void => { PHASE_BATTLE = get }

export class BattlePhase {
  // :20-21 —— 上游两个都是 public 字段; resultState 在 phase 层无人读写 (驱动层预备), 照搬默认值。
  state: BattleState | null = null
  resultState: BattleResultState = BattleResultState.Fighting

  get battle(): PhaseBattle {
    if (PHASE_BATTLE === null) throw new Error('phase battle 接缝未注入 (currentBattle 的围栏) —— BattlePhase.cs:10')
    return PHASE_BATTLE()
  }

  // :11 `UI => battle.UI` (Battle.cs:11 => BattleManager.instance)
  get UI(): PhaseUI { return this.battle.ui }

  // :13-19 —— getter 在 state==null 时兜 None; setter 在 state==null 时**静默不写也不抛**。
  get phase(): EffectTiming { return this.state === null ? EffectTiming.None : this.state.phase }
  set phase(value: EffectTiming) { if (this.state !== null) this.state.phase = value }

  // battle.settings 的解引用点 (Battle.cs:13 算属性, currentState null ⇒ null 透传进来被 :65/:150 炸)。
  protected get battleSettings(): BattleSettings {
    const s = this.battle.settings
    if (s === null) throw new TypeError('NullReferenceException: battle.settings (= currentState?.settings) 为 null 时被解引用 —— BattlePhase.cs:65/150')
    return s
  }

  // :23-26 —— 基类 DoWork 只有两步; 子类各自插自己的序列。
  doWork(): void {
    this.applySkillsAndBuffs()
    this.setUIState(this.battle.currentState)
  }

  // :28-30
  getNextPhase(): BattlePhase | null { return null }

  // :32-34 —— UI.SetState(lastState, state); 上游 lastState 缺省 null ⇒ BattleManager 会**先塞一个 null 哨兵**。
  protected setUIState(lastState: BattleState | null = null): void {
    this.UI.setState(lastState, this.state)
  }

  // :36-54 —— 并行且 whosTurn==0 时**逐位**应用 (master 整串先于 client), 结束后 cursor 回位;
  // 否则整局一次性应用。CheckAndApply 走到 JUDGE 围栏 ⇒ 只有队列为空的规格能安全通过 (文件头口径)。
  protected applySkillsAndBuffs(): void {
    const st = this.state
    if (st === null) throw new TypeError('NullReferenceException: BattlePhase.cs:37 在 state 为 null 时就解引用 state.settings')

    const parallelCount = st.settings.parallelCount
    if (parallelCount > 1 && st.whosTurn === 0) {
      // :44 `petBagCursor[0]` —— 空表 ⇒ 上游 List 下标越界抛, 用 atIndex 复现同一抛点。
      const parallelApply = (unit: Unit, petBagCursor: number[]) => {
        for (let i = 0; i < petBagCursor.length; i++) {
          unit.petSystem.cursor = petBagCursor[i]!
          this.getEffectHandler(unit).checkAndApply(st)
        }
        unit.petSystem.cursor = atIndex(petBagCursor, 0, 'BattlePhase.ParallelApply')
      }
      const masterPetBagCursor = st.masterUnit.petSystem.getParallelPetBagCursor(parallelCount)
      const clientPetBagCursor = st.clientUnit.petSystem.getParallelPetBagCursor(parallelCount)
      parallelApply(st.masterUnit, masterPetBagCursor)
      parallelApply(st.clientUnit, clientPetBagCursor)
      return
    }

    this.getEffectHandler(null).checkAndApply(st)
  }

  // :56-58 —— 怪癖 1: 走 null 分支后 addSkillEffect=false **不会传下去**, 每个 unit 仍带技能效果拼装。
  protected applyBuffs(): void {
    this.getEffectHandler(null, false).checkAndApply(this.state)
  }

  // :60-94 —— 队列拼装。六段顺序 = 同 priority 效果的执行序, 一段不能换。
  protected getEffectHandler(invokeUnit: Unit | null, addSkillEffect = true): EffectHandler {
    const st = this.state
    // :62-63 —— null ⇒ 两边 Concat, master 在前; 子调用**不带** addSkillEffect (默认 true)。
    if (invokeUnit === null) {
      if (st === null) throw new TypeError('NullReferenceException: BattlePhase.cs:63 在 state 为 null 时解引用 state.masterUnit')
      return this.getEffectHandler(st.masterUnit).concat(this.getEffectHandler(st.clientUnit))
    }

    // :65 怪癖 2: Card 判定读 battle.settings; 非 Card 分支直接解引用 pet。
    const bs = this.battleSettings
    let passiveSkills: (SkillRecord | null)[]
    if (bs.mode === BattleMode.Card && invokeUnit.isMyUnit()) {
      // 上游在此读 invokeUnit.cardSystem.hand —— cardSystem 是围栏 (state.ts 文件头口径), 抛不静默。
      throw new Error('cardSystem.hand 在围栏外 (docs/engine/port-map.md: 卡牌模式不移植) —— BattlePhase.cs:65')
    }
    const pet = invokeUnit.pet
    if (pet === null) throw new TypeError('NullReferenceException: BattlePhase.cs:65 在 pet 为 null 时解引用 pet.skillController.allSkills')
    passiveSkills = pet.skillController.allSkills

    // :69-70 —— 属性链 eager, 但 Where/Select 是延迟执行 (见 :84 处的复现循环)。
    const unitEffects = invokeUnit.unitBuffs.filter((x) => !x.ignore).map((x) => x.effects)
    const buffEffects = pet.buffs.filter((x) => !x.ignore).map((x) => x.effects)

    const handler = new EffectHandler()

    // :73-79 怪癖 3: `state != null` 卫包住天气与场上印记 (BattleState.cs 版没有这层卫)。
    if (st !== null) {
      handler.addEffects(invokeUnit, st.weatherBuff.effects)
      for (const e of st.stateBuffs.filter((x) => !x[1].ignore).map((x) => x[1].effects))
        handler.addEffects(invokeUnit, e)
    }

    // :81-82
    if (addSkillEffect && invokeUnit.skill !== null)
      handler.addEffects(invokeUnit, invokeUnit.skill!.effects)

    // :84-85 怪癖 4: 被动筛选在此**实际**执行; 代价判读的是 state.settings (不是 battle.settings)。
    for (const x of passiveSkills) {
      if (x !== null && x.type === SkillType.被动 && invokeUnit.isSkillCostEnough(x.id, st!.settings))
        handler.addEffects(invokeUnit, x.effects)
    }

    for (const e of unitEffects) handler.addEffects(invokeUnit, e)
    for (const e of buffEffects) handler.addEffects(invokeUnit, e)

    return handler
  }

  // :96-160 —— 出招合法性。三处要点:
  //   · :97-100 上游拿 whosTurn==0 的 null atkUnit 直接 `.pet` ⇒ :106 那段判 whosTurn==0 的分支是**死代码**,
  //     移植体在同一位置同样先炸; 死分支保留原样, 不删不改 (删了它就等于悄悄改了上游形状)。
  //   · :116-123 的 hud 调用只写展示字段 (文件头口径), 分支其余副作用 (Apply/isDone/UI/state 重拷) 全部建模;
  //   · :144/:153 的 SetSkill 上游属性内部取 Player.instance.currentBattle.settings ⇒ 接缝取 battle.settings。
  protected isAttackLegal(): boolean {
    const st = this.state
    if (st === null) throw new TypeError('NullReferenceException: BattlePhase.cs:97 在 state 为 null 时解引用 state.atkUnit')
    const atkUnit = st.atkUnit
    const defUnit = st.defUnit
    if (atkUnit === null || defUnit === null) {
      throw new TypeError('NullReferenceException: BattlePhase.cs:100 —— whosTurn 使 atkUnit/defUnit 为 null 时上游直接解引用 .pet (它从没判过这个 null)')
    }

    if (atkUnit.pet === null || defUnit.pet === null) {
      atkUnit.isDone = true
      defUnit.isDone = true
      this.setUIState(null)
      return false
    }

    // :106-111 死分支 (上面先到)。保留上游形状:
    if (st.whosTurn === 0) {
      this.applySkillsAndBuffs()
      st.myUnit.isDone = true
      st.opUnit.isDone = true
      this.setUIState(null)
      return false
    }

    const atkSkill = atkUnit.skill
    if (atkSkill === null) throw new TypeError('NullReferenceException: BattlePhase.cs:113 在 skill 为 null 时解引用 skill.type')
    if (atkSkill.type === SkillType.道具) {
      this.applySkillsAndBuffs()
      atkUnit.isDone = true
      // hud OnUseItem×2 (:116-117) —— 只写 CurHealInfo/CurCaptureInfo, 不进签名。
      this.setUIState(this.battle.currentState)
      // :121 —— 换的是**本 phase 的** state (拷贝构造), Battle.cs:260 下一拍就用新帧。
      this.state = BattleState.from(this.state!)
      // hud OnUseItemUndo×2 (:122-123) —— 纯清展示字段。
      return false
    }

    if (atkSkill.isAction) {
      this.applySkillsAndBuffs()
      atkUnit.isDone = true
      this.setUIState(null)
      return false
    }

    if (defUnit.pet.isDead) {
      if (st.settings.parallelCount > 1 && this.phase === EffectTiming.OnBeforeAttack) {
        const nextAlive = defUnit.petSystem.getNextCursorCircular()
        if (nextAlive !== defUnit.petSystem.cursor) {
          defUnit.petSystem.cursor = nextAlive
          this.setUIState(null)
          return true
        }
      }
      atkUnit.setSkill(noOpSkill(), this.battleSettings)
      st.atkUnit!.isDone = true   // :145 上游重新读了一遍 state.atkUnit (同一对象, 状态没换过)
      this.setUIState(null)
      return false
    }

    if (atkUnit.pet.isDead || !atkUnit.isMovable || !atkUnit.isSkillCostEnoughForRule(this.battleSettings.rule) || atkUnit.skill!.chain <= 0) {
      atkUnit.setSkill(noOpSkill(), this.battleSettings)
      atkUnit.isDone = true
      this.setUIState(null)
      return false
    }

    return true
  }
}

// ─────────────────────────────────── Phase/*.cs 子类 ───────────────────────────────────
// 构造序固定两步: `state = new BattleState(battle.currentState)` 然后 `phase = <timing>`。
// 拷贝构造在 currentState 为 null 时**先 NRE** (BattleState.cs:60 直接解引用 rhs.lastTurnState),
// 移植体由 BattleState.from(null) 的 TypeError 复现同一抛点 ⇒ 每个子类都要有 null-状态的抛错向量。
// 段4 分工: 直线组 6 类 (本段) 的 DoWork 全量; DamageCalculate 进段3; 分支组 5 类进段4;
// PassivePetChange 进段5 —— 未开工的子类以 NOT_PORTED 显式抛, 绝不静默继承基类 DoWork。

export class BattleStartPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnBattleStart
  }

  doWork(): void {
    this.setInitBuffs()
    this.applySkillsAndBuffs()
    this.setUIState(null)
  }

  getNextPhase(): BattlePhase { return new TurnStartPhase() }

  // :30-96 —— SetInitBuffs 整链是 buffController/算子围栏: RemoveRangeBuff/AddRangeBuff 不在
  // BattlePetView 面上, GetFeatureBuff/GetEmblemBuff 要真宠表, 末尾 OnAddBuff 判定撞 JUDGE 围栏;
  // SetAchievement 摸 Player.instance.gameData (无头纪律禁止)。段4 只拍构造与推进。
  private setInitBuffs(): void {
    throw new Error('NOT_PORTED: BattleStartPhase.SetInitBuffs (buffController/成就/OnAddBuff 围栏) —— S3 段4')
  }
}

export class RoundStartPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnRoundStart
  }

  doWork(): void {
    const st = this.state as BattleState   // 构造后 state 恒非 null (null 早在构造抛掉)
    st.whosTurn = 0
    st.myUnit.pet!.anger += 15
    // :15-20 —— pet.buffController.ReduceBuffTurn 与 cardSystem.OnRoundStart (UnitCardSystem.cs:155
    // 无条件 Draw(4)) 都是围栏 ⇒ RoundStart 的 DoWork 段4 不进对拍, 抛点保持显式。
    throw new Error('NOT_PORTED: RoundStartPhase.DoWork (pet.buffController.ReduceBuffTurn / cardSystem 围栏) —— S3 段4')
  }

  getNextPhase(): BattlePhase | null { return null }
}

export class TurnStartPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnTurnStart
  }

  // 全可移植: OnTurnStart 已在 state.ts, 基类 DoWork 在空队规格下 no-op,
  // UI.ProcessQuery 走接缝 (注入口径下队列非空 ⇒ 与 oracle 的 systemView-NRE 同抛)。
  doWork(): void {
    (this.state as BattleState).onTurnStart()
    super.doWork()
    this.UI.processQuery()
  }

  getNextPhase(): BattlePhase | null { return null }
}

export class TurnReadyPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnTurnReady
  }

  doWork(): void {
    if (this.battle.autoSkillOrder === null || this.battle.autoSkillOrder.length === 0)
      this.UI.stopTimer()   // BattleManager.cs:60 => systemView.StopTimer() (注入世界里 systemView 为 null ⇒ 抛)

    super.doWork()
  }

  getNextPhase(): BattlePhase { return new DecidePriorityPhase() }
}

/**
 * LINQ 的 OrderByDescending/ThenByDescending 链 = **每级一次稳定排序**, 且每级的键在
 * 「该级输入序」上逐个物化一次 —— 抛点(键选择器里的 NRE/Random)就落在本级物化到那个元素时。
 * dir=-1 降序、1 升序; 比较器与 Comparer<float>.Default 一致 (NaN 形状上游也不定义, 不留特例)。
 */
function linqSortBy<T>(input: T[], keySel: (x: T) => number, dir: 1 | -1): T[] {
  const items = input.map((x, i) => ({ k: keySel(x), i, x }))
  items.sort((a, b) => (a.k < b.k ? -dir : a.k > b.k ? dir : a.i - b.i))
  return items.map((it) => it.x)
}

/** DecidePriorityPhase 的排序元组 (Unit, Skill, BattlePet, cursor) —— null 留在类型里, 排序自己判。 */
interface PriorityUnit { unit: Unit; skill: SkillRecord | null; pet: BattlePetView | null; cursor: number }

export class DecidePriorityPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnDecidePriority
  }

  // :16-28 —— 首步 ApplySkillsAndBuffs 在 TS 侧必抛 (拼装队列恒非空 ⇒ JUDGE 围栏, 文件头口径);
  // oracle 走真 Apply (注入世界判 condition false 放行) 后撞 SetActionOrder 里的 native Random
  // (ECall) 或排序键的 NRE ⇒ 本类 DoWork 向量只发 throw-only 形状。
  doWork(): void {
    this.applySkillsAndBuffs()
    this.setActionOrder()
    ;(this.state as BattleState).giveTurnToNextUnit()
    this.setUIState(this.battle.currentState)
  }

  getNextPhase(): BattlePhase { return new BeforeAttackPhase() }

  // :38-57 —— 六级稳定排序链。第 1 级把 null 键兜成 -1, 第 2 级**直接解引用** ⇒ 带 null-skill 的
  // 输入在 oracle 里于第 2 级物化时 NRE; 第 6 级 tiebreak 是 UnityEngine.Random.Range(0,100) 的
  // 全局骰子 —— 无头体借 masterUnit.randomSource 作接缝 (对拍向量到不了这里: TS 先在第 1 步 Apply
  // 的 JUDGE 围栏抛, 口径进围栏登记)。
  private getActionOrder(priorityUnits: PriorityUnit[]): number[] {
    const st = this.state as BattleState
    const negSpeed = st.stateBuffs.some(([, b]) => b.id === 600013) ? -1 : 1
    let seq = linqSortBy(priorityUnits, (p) => (p.skill === null || p.pet === null ? -1 : 0), -1)
    seq = linqSortBy(seq, (p) => (p.skill!.isAction ? 1 : 0), -1)
    seq = linqSortBy(seq, (p) => p.skill!.vipriority, -1)
    seq = linqSortBy(seq, (p) => p.skill!.priority, -1)
    seq = linqSortBy(seq, (p) => negSpeed * p.pet!.statusController.getCurrentStatus(p.skill!.powerup, p.skill!.powerdown).spd, -1)
    const rng = st.masterUnit.randomSource
    seq = linqSortBy(seq, () => rng.nextInt(0, 100), 1)
    const order = seq.map((p) => Math.trunc(MathfSign(p.unit.id) * (p.cursor + 1)))
    if (st.getStateIdentifier('order.direction') < 0) order.reverse()
    return order
  }

  // :59-89 —— ≤1 人一路不过滤 (null 洞留给排序链去炸); >1 人先 Where 再排。
  private setActionOrder(): void {
    const st = this.state as BattleState
    const parallelCount = st.settings.parallelCount
    const masterUnit = st.masterUnit
    const clientUnit = st.clientUnit
    const masterPetSystem = masterUnit.petSystem
    const clientPetSystem = clientUnit.petSystem
    const masterPetBag = masterPetSystem.getParallelPetBag(parallelCount)
    const clientPetBag = clientPetSystem.getParallelPetBag(parallelCount)

    if (parallelCount <= 1) {
      const master: PriorityUnit = { unit: masterUnit, skill: masterUnit.skill, pet: masterUnit.pet, cursor: masterPetSystem.cursor }
      const client: PriorityUnit = { unit: clientUnit, skill: clientUnit.skill, pet: clientUnit.pet, cursor: clientPetSystem.cursor }
      st.actionOrder = this.getActionOrder([master, client])
      return
    }

    const masterPetCursor = masterPetSystem.getParallelPetBagCursor(parallelCount)
    const clientPetCursor = clientPetSystem.getParallelPetBagCursor(parallelCount)
    // Select 延迟 ⇒ parallelSkillSystems[cur] 在 Concat().ToList() 这一刻按 master→client 序物化,
    // 越界 (含 null cursor 不在 [0,len) 的情形) 由 atIndex 复现上游 AOORE 抛点。
    const skill = [
      ...masterPetCursor.map((cur) => atIndex(masterUnit.parallelSkillSystems, cur, 'DecidePriority.masterSkill')?.skill ?? null),
      ...clientPetCursor.map((cur) => atIndex(clientUnit.parallelSkillSystems, cur, 'DecidePriority.clientSkill')?.skill ?? null),
    ]
    const petBag = [...masterPetBag, ...clientPetBag]
    const cursor = [...masterPetCursor, ...clientPetCursor]
    const priorityUnits: PriorityUnit[] = []
    for (let i = 0; i < petBag.length; i++) {
      const sk = skill[i]!
      const pet = petBag[i]!
      if (sk === null || pet === null) continue
      if (sk.type === SkillType.空过) continue
      if (pet.isDead && !sk.isAction) continue
      priorityUnits.push({ unit: i < masterPetBag.length ? masterUnit : clientUnit, skill: sk, pet, cursor: cursor[i]! })
    }
    st.actionOrder = this.getActionOrder(priorityUnits)
  }
}

export class BeforeAttackPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnBeforeAttack
  }

  // :13-29 —— 早退形状 (isAllUnitDone) 是本类唯一两侧都**完成**的向量;
  // 其余形状 TS 在 :24 的 base.DoWork (或 IsAttackLegal 内部的 Apply) 撞 JUDGE 围栏,
  // oracle 放行 Apply 后在 CheckAccuracy (CalculateAccuracy 摸 native Random ⇒ ECall) 抛 ⇒ throw-only。
  doWork(): void {
    const st = this.state as BattleState
    if (st.isAllUnitDone) return

    this.addReport()

    if (!this.isAttackLegal()) return

    st.atkUnit!.onChainStart()
    super.doWork()
    st.atkUnit!.calculateAccuracy(st.defUnit!)

    this.phase = EffectTiming.OnAttackStart
    this.applySkillsAndBuffs()
  }

  // :52-82 —— 四支战报。skill/pet 为 null ⇒ 上游在 :56/:58 解引用 NRE, 同点抛;
  // 道具支摸 Item 表 (围栏外, 与 RoundStartPhase 同口径) 显式抛; atkUnit 为 null (whosTurn==0)
  // 上游在 :55 的 IsMyUnit 先炸。
  private addReport(): void {
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const atkColor = atkUnit.isMyUnit() ? '#ffbb33' : '#ff0080'
    const skill = atkUnit.skill!
    let report = `<color=${atkColor}>【${atkUnit.pet!.name}】</color>`

    if (skill.type === SkillType.空过)
      report += `空过了本次行动，动弹不得！`
    else if (skill.type === SkillType.換场) {
      const targetIndex = Math.trunc(getSkillIdentifier(skill, 'option[target_index]'))
      const bag = atkUnit.petSystem.petBag
      const newPet = targetIndex >= 0 && targetIndex < bag.length ? bag[targetIndex] : null
      report += `主动更换出战精灵为<color=${atkColor}>【${(newPet === null || newPet === undefined ? '神秘精灵' : newPet.name)}】</color>`
    } else if (skill.type === SkillType.道具) {
      throw new Error('NOT_PORTED: BeforeAttackPhase.AddReport 道具支 —— Item.GetItemInfo 表在围栏外 —— S3 段4')
    } else if (skill.type === SkillType.逃跑)
      report += `逃跑了，战斗结束！`
    else
      report = ''

    if (report !== '') st.addReport(report)
  }

  // :28-36 —— 三分支。atkUnit 为 null (whosTurn==0) 时 :34 的 skill 解引用直接抛, 上游同样。
  getNextPhase(): BattlePhase {
    const st = this.state as BattleState
    if (st.isAllUnitDone) return new AttackEndPhase()
    if (isAttackSkill(st.atkUnit!.skill!.type) && st.atkUnit!.skillSystem.isHit) return new DamageCalculatePhase()
    return new AttackPhase()
  }
}

export class DamageCalculatePhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    // :7 —— 构造写的是 OnBeforeDamageCalculate, 5 连 timing 在 DoWork 里。
    this.phase = EffectTiming.OnBeforeDamageCalculate
  }

  // :12-27 —— 序列本身是对拍主角: Param 计算夹在两段 timing 之间, Before→Calculate 与 After→Final
  // 各是**背靠背两次** ApplySkillsAndBuffs (中间不插单位动作)。whosTurn==0 时 :16/:21 的
  // atkUnit null 解引用两边同炸 (C# NRE / TS TypeError)。
  doWork(): void {
    const st = this.state as BattleState
    this.setDamagePhase(EffectTiming.OnDamageParamCalculate)
    st.atkUnit!.prepareDamageParam(st.defUnit!)
    this.setDamagePhase(EffectTiming.OnBeforeDamageCalculate)
    this.setDamagePhase(EffectTiming.OnDamageCalculate)
    st.atkUnit!.calculateDamage(st.defUnit!)
    this.setDamagePhase(EffectTiming.OnAfterDamageCalculate)
    this.setDamagePhase(EffectTiming.OnFinalDamageCalculate)
    this.setUIState(this.battle.currentState)
  }

  // :30-33 —— phase 先写, 再整串 Apply (每段 timing 各触发一次完整拼装+判定)。
  protected setDamagePhase(damagePhase: EffectTiming): void {
    this.phase = damagePhase
    this.applySkillsAndBuffs()
  }

  getNextPhase(): BattlePhase { return new AttackPhase() }
}

export class AttackPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnAttackReady
  }

  // :14-30 —— 早退形状 (atkUnit.isDone) 两侧都**完成**;
  // 其余形状 TS 在 :22 的 Apply 撞 JUDGE 围栏, oracle 在 CheckAccuracy 之后无处抛时**会走完整串**
  // ⇒ 只有实测两侧都抛的形状才进向量 (生成器口径)。whosTurn==0 ⇒ :16 的 null 解引用两边同炸。
  doWork(): void {
    const st = this.state as BattleState
    if (st.atkUnit!.isDone) return

    if (!this.isAttackLegal()) return

    this.applySkillsAndBuffs()

    this.phase = EffectTiming.OnAttack
    this.applySkillsAndBuffs()

    this.consumeAnger()
    this.addReport()
    this.onHit()
  }

  getNextPhase(): BattlePhase {
    const st = this.state as BattleState
    if (st.isAllUnitDone) return new AttackEndPhase()
    return new AfterAttackPhase()
  }

  // :40-61 —— lastState 在**函数入口**就拷好 (拿的是上一帧 currentState, 不是本 phase 的 state)。
  // hud OnAttack(atk/def) (:53-54) 与 OnAttackUndo (:59-60) 只写展示字段 (文件头口径) ⇒ 零副作用。
  private consumeAnger(): void {
    const lastState = BattleState.from(this.battle.currentState as BattleState)
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const hpToAngerBuff = atkUnit.pet!.buffController.getBuff(61)
    const angerDiff = atkUnit.skill!.anger - atkUnit.pet!.anger

    if (hpToAngerBuff !== null && angerDiff > 0) {
      atkUnit.pet!.hp -= hpToAngerBuff.value * angerDiff
      atkUnit.pet!.anger += angerDiff
    }

    atkUnit.pet!.anger -= atkUnit.skill!.anger
    this.setUIState(lastState)

    this.state = BattleState.from(this.state!)
  }

  // :63-84 —— 三色伤害/回复各**先聚合再整串进** ApplyAttackDamage, 然后三色 ApplySpecialHit 依次走;
  // 每步之后重读 atkUnit/defUnit (state 已再拷, 引用换帧)。
  private onHit(): void {
    const sys = (this.state as BattleState).atkUnit!.skillSystem!
    const elementDamage = sys.getTypeDamage((k) => k.startsWith('skill_element'))
    const pinkDamage = sys.getTypeDamage((k) => k === 'skill_fix' || k === 'skill_per')
    const whiteDamage = sys.getTypeDamage((k) => k === 'skill_act')

    const elementHeal = sys.getTypeHeal((k) => k === 'skill_elementBuff' || k === 'skill_elementAtk')
    const pinkHeal = sys.getTypeHeal((k) => k === 'skill_fix' || k === 'skill_per')
    const whiteHeal = sys.getTypeHeal((k) => k === 'skill_act')

    this.applyAttackDamage(elementDamage + pinkDamage + whiteDamage, elementHeal + pinkHeal + whiteHeal)

    // 上游 :78-79 在这里重读 state.atkUnit/defUnit —— state 已被 ApplyAttackDamage 再拷,
    // 后续 ApplySpecialHit 各自从 this.state 现取现用, 引用换帧是同一效果。
    this.applySpecialHit('element', elementDamage, elementHeal)
    this.applySpecialHit('pink', pinkDamage, pinkHeal)
    this.applySpecialHit('white', whiteDamage, whiteHeal)
  }

  // :86-112 —— 红伤/红血 = 总量减三色。isHit 才落到 defUnit 的 hp/anger。hud OnHit×2 (:101-102)
  // 与 OnHitUndo (:110-111) 零副作用。
  private applyAttackDamage(exceptDamage: number, exceptHeal: number): void {
    const lastState = BattleState.from(this.state!)
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const defUnit = st.defUnit!
    const sys = atkUnit.skillSystem!

    const redDamage = sys.totalSkillDamage - exceptDamage
    const redHeal = sys.heal - exceptHeal

    if (sys.isHit) {
      defUnit.pet!.hp -= redDamage
      defUnit.pet!.anger += AttackPhase.angerGain(defUnit, redDamage)
    }

    this.setUIState(lastState)

    this.state = BattleState.from(this.state!)
  }

  // :114-140 —— damage<=0 且 heal==0 直接跳过。CurHealInfo (:126/:130) 是 hud 展示字段 ⇒ 零副作用。
  private applySpecialHit(colorType: string, damage: number, heal: number): void {
    if (damage <= 0 && heal === 0) return

    const st = this.state as BattleState
    const defUnit = st.defUnit!

    if (damage > 0) {
      defUnit.pet!.hp -= damage
      defUnit.pet!.anger += AttackPhase.angerGain(defUnit, damage)
    }

    this.setUIState(BattleState.from(this.state!))

    this.state = BattleState.from(this.state!)
  }

  // :98/:125 的挨打回怒公式 —— `maxAnger / 2 - 1` 在 C# 是 **int 整除** (向零截断),
  // 之后的连乘全链 float32 逐步收窄, FloorToInt 落回 int。
  private static angerGain(defUnit: Unit, damage: number): number {
    const pet = defUnit.pet!
    const term = Math.trunc(pet.maxAnger / 2) - 1
    const dmgRatio = f(damage / pet.maxHp)
    const angrecRatio = f(pet.battleStatus.angrec / 100)
    return floorToInt(f(f(term * dmgRatio) * angrecRatio))
  }

  // :142-198 —— evolve 走 getSkillIdentifier; 伤害明细按上游字典序 (固定→百分比→真实);
  // 报告里的 totalSkillDamage 用**当帧**的 skillSystem (state 再拷后可能换引用)。
  private addReport(): void {
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const defUnit = st.defUnit!
    const skill = atkUnit.skill!
    const sys = atkUnit.skillSystem!
    const atkColor = atkUnit.isMyUnit() ? '#ffbb33' : '#ff0080'
    const defColor = atkUnit.isMyUnit() ? '#ff0080' : '#ffbb33'
    let report = ''

    if (getSkillIdentifier(skill, 'evolve') !== 0)
      st.addReport(`<color=${atkColor}>【${atkUnit.pet!.name}】</color>激活了专属动作！`)

    if (skill.type >= SkillType.属性)
      report += `<color=${atkColor}>【${atkUnit.pet!.name}】</color>使用了<color=#00ffff>${skill.name}</color>，`

    if (skill.type === SkillType.属性)
      report += '是属性技能！'

    if (sys.isHit) {
      if (isAttackSkill(skill.type) && sys.isCritical)
        report += '打出了致命一击，'
    } else {
      report += `但是没有命中<color=${defColor}>【${defUnit.pet!.name}】</color>！`
    }

    if (skill.type > SkillType.属性 || sys.totalSkillDamage > 0) {
      report += `對<color=${defColor}>【${defUnit.pet!.name}】</color>总共造成了 <color=#ff4444><size=13>${sys.totalSkillDamage}</size></color> 點傷害！`

      const elementDamage = sys.getTypeDamage((k) => k.startsWith('skill_element'))
      if (elementDamage > 0)
        report += `<color=#ed780e>【属性伤害】<size=13>${elementDamage}</size=13></color>`

      const damageTypes: [string, string][] = [['skill_fix', '固定'], ['skill_per', '百分比'], ['skill_act', '真实']]
      for (const [key, label] of damageTypes) {
        const damage = sys.damageDict.get(key)
        if (damage !== undefined && damage > 0)
          report += `<color=#ff8cff>【${label}伤害】<size=13>${damage}</size=13></color>`
      }
    }

    const customReport = skill.options.get('battle_report')
    if (customReport !== undefined)
      report += '  ' + replaceColorAndNewline(
        customReport
          .replaceAll('[atk_pet]', `<color=${atkColor}>【${atkUnit.pet!.name}】</color>`)
          .replaceAll('[def_pet]', `<color=${defColor}>【${defUnit.pet!.name}】</color>`))

    st.addReport(report)
  }
}

export class AfterAttackPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnAfterAttack
  }

  // :12-18 —— TS 首步 Apply 必抛 (JUDGE 围栏); oracle 放行后 GiveTurnToNextUnit 里的 Insert/AOORE
  // 或 state.GiveTurnToNextUnit 的游标炸点决定它抛不抛 ⇒ 逐形状实测, 只留两侧都抛与两侧都完成的。
  doWork(): void {
    this.applySkillsAndBuffs()
    this.raiseAnger()
    this.giveTurnToNextUnit()
    this.setUIState(this.battle.currentState)
  }

  getNextPhase(): BattlePhase {
    const st = this.state as BattleState
    if (st.isAllUnitDone) return new AttackEndPhase()
    return new BeforeAttackPhase()
  }

  // :28-36 —— Card 早退; isAttack 是**算属性** (type>属性), 与 skill.isAction 不同判。
  private raiseAnger(): void {
    if (this.battleSettings.mode === BattleMode.Card) return
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const skill = atkUnit.skill!
    if (isAttackSkill(skill.type) && atkUnit.skillSystem!.isHit)
      atkUnit.pet!.anger += 15
  }

  // :38-66 —— 三支互斥。要点四处:
  //   · chain-- 写的是 **skill 实例** (state 拷贝链上的对象), pet.chain++ 走 petSystem.pet 同一引用;
  //   · List.Insert 越界 (actionCursor+1 ∉ [0,Count]) 上游 AOORE ⇒ 显式边界复现;
  //   · 反击插入的符号是 Mathf.Sign(defUnit.id) **截断**成 int;
  //   · 最后无条件 state.GiveTurnToNextUnit() (游标推进, 与上面三支改的 cursor 叠加)。
  private giveTurnToNextUnit(): void {
    const st = this.state as BattleState
    const atkUnit = st.atkUnit!
    const defUnit = st.defUnit!
    const skill = atkUnit.skill!

    skill.chain--
    atkUnit.petSystem.pet!.chain++
    if (atkUnit.petSystem.token !== null)
      atkUnit.petSystem.token.chain++

    atkUnit.isDone = true

    const defSys = defUnit.skillSystem!
    const counterType = defSys.counterSkill?.type ?? SkillType.空过
    if (counterType !== SkillType.空过) {
      const idx = st.actionCursor + 1
      if (idx < 0 || idx > st.actionOrder.length)
        throw new Error(`ArgumentOutOfRangeException: actionOrder.Insert(${idx}) —— AfterAttackPhase.cs:50`)
      st.actionOrder.splice(idx, 0, Math.trunc(MathfSign(defUnit.id) * (defUnit.petSystem.cursor + 1)))
      defSys.swapCounterSkill(true)
    } else if (skill.chain > 0 && !isNullOrEmptySkill(skill) && !atkUnit.pet!.isDead && !defUnit.pet!.isDead) {
      st.actionCursor--
    } else if (atkUnit.skillSystem!.isCounter) {
      atkUnit.skillSystem!.swapCounterSkill(false)
    }

    st.giveTurnToNextUnit()
  }
}

export class TurnEndPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnTurnEnd
  }

  // :13-30 —— 早退形状 (result.isBattleEnd) 在 whosTurn=0 与 CheckBattleEnd 的 result 写之后两侧都**完成**;
  // 其余形状 TS 在 :22 的 Apply 撞 JUDGE 围栏, oracle 走完 Apply 后 RaiseAnger/OnBuffEffected 的
  // getParallelPetBag 越界/null 洞决定抛点 ⇒ 逐形状实测再发向量。
  doWork(): void {
    const st = this.state as BattleState
    st.whosTurn = 0

    this.checkBattleEnd()

    if (st.result.isBattleEnd) return

    this.applySkillsAndBuffs()
    this.raiseAnger()
    this.onBuffEffected()

    const lastState = BattleState.from(this.state!)
    // :27 —— 上游每次 `state.Phase = …` 都是**现取字段**; 而上面的 OnBuffEffected 末尾 (:103) 已经把
    // this.state 换成新一帧, 所以这里绝不能复用 doWork 开头那个 st —— 那会把时机写进**孤儿帧**,
    // 打印出来停在 OnTurnEnd(17) 而上游是 OnAfterTurnEnd(18)。驱动向量实测坐实 (第六段·批一步骤 6)。
    ;(this.state as BattleState).phase = EffectTiming.OnAfterTurnEnd
    this.applySkillsAndBuffs()
    this.setUIState(lastState)
  }

  // :33-41 —— 推进**前先** CheckBattleEnd (对 state.result 有写副作用, 拍两条输出)。
  getNextPhase(): BattlePhase {
    this.checkBattleEnd()
    const st = this.state as BattleState
    if (st.result.isBattleEnd) return new BattleEndPhase()
    return new TurnStartPhase()
  }

  // :42-51 —— myUnit 先判 ⇒ 双方全灭记 Lose。
  private checkBattleEnd(): void {
    const st = this.state as BattleState
    if (st.myUnit.petSystem.alivePetNum === 0) {
      st.result.state = BattleResultState.Lose
      return
    }
    if (st.opUnit.petSystem.alivePetNum === 0) {
      st.result.state = BattleResultState.Win
      return
    }
  }

  // :53-64 —— Card 只免 master 那份 (+15), client **无条件** +15 —— 上游就是这个不对称。
  private raiseAnger(): void {
    const st = this.state as BattleState
    const parallelCount = st.settings.parallelCount
    const masterPetBag = st.masterUnit.petSystem.getParallelPetBag(parallelCount)
    const clientPetBag = st.clientUnit.petSystem.getParallelPetBag(parallelCount)

    if (this.battleSettings.mode !== BattleMode.Card)
      for (const x of masterPetBag) x!.anger += 15

    for (const x of clientPetBag) x!.anger += 15
  }

  // :66-106 —— 逐袋结算 buff 掉血: 护盾 (2000) 先挡、挡完的盾**继续扣**负值再按 autoRemove 摘除;
  // hp 写的是袋子宠本体 (拷贝链上), SetUIState 后 state 再拷一帧。
  // hud OnTurnEnd×2 (:98-99) / OnTurnEndUndo×2 (:104-105) 零副作用 (文件头口径)。
  private onBuffEffected(): void {
    const lastState = BattleState.from(this.battle.currentState as BattleState)
    const st = this.state as BattleState
    const parallelCount = st.settings.parallelCount
    const masterUnit = st.masterUnit
    const clientUnit = st.clientUnit
    const masterPetBag = masterUnit.petSystem.getParallelPetBag(parallelCount)
    const clientPetBag = clientUnit.petSystem.getParallelPetBag(parallelCount)

    const parallelBuffEffected = (unit: Unit, petBag: (BattlePetView | null)[]): void => {
      for (let i = 0; i < petBag.length; i++) {
        const cursor = parallelCount <= 1 ? 0 : unit.petSystem.petBag.indexOf(petBag[i]!)
        const skillSystem = atIndex(unit.parallelSkillSystems, cursor, 'TurnEnd.parallelSkillSystems')!
        const pet = petBag[i]!
        const buffDamageShield = pet.buffController.getBuff(2000)
        const reducedBuffDamage = MathfMax(skillSystem.totalBuffDamage - (buffDamageShield?.value ?? 0), 0)
        pet.hp += skillSystem.totalBuffHeal - reducedBuffDamage

        if (buffDamageShield !== null) {
          buffDamageShield.value -= skillSystem.totalBuffDamage
          if (buffDamageShield.info.autoRemove && buffDamageShield.value <= 0)
            pet.buffController.removeBuff(buffDamageShield, unit, this.state)
        }
      }
    }

    parallelBuffEffected(masterUnit, masterPetBag)
    parallelBuffEffected(clientUnit, clientPetBag)

    this.setUIState(lastState)

    this.state = BattleState.from(this.state!)
  }
}

export class AttackEndPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnAttackEnd
  }

  doWork(): void {
    ;(this.state as BattleState).whosTurn = 0
    super.doWork()
  }

  getNextPhase(): BattlePhase { return new TurnEndPhase() }
}

export class BattleEndPhase extends BattlePhase {
  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnBattleEnd
  }

  // ProcessResult 首行就是 Random.InitState(DateTime.Now.Ticks) (BattleResult.cs:62) ⇒ 本段不进对拍;
  // hud/SetUIState 尾序留给算子段。
  doWork(): void {
    throw new Error('NOT_PORTED: BattleEndPhase.DoWork (ProcessResult 摸 native Random/存档) —— S3 段4 口径')
  }

  getNextPhase(): BattlePhase | null { return null }
}

export class PassivePetChangePhase extends BattlePhase {
  // :11-12 —— 两个都是 public 字段; 上游构造三连 clone, 每次**重新读** battle.currentState。
  UIState: BattleState | null = null
  recordState: BattleState | null = null

  constructor() {
    super()
    this.state = BattleState.from(this.battle.currentState as BattleState)
    this.phase = EffectTiming.OnPassivePetChange
    this.recordState = BattleState.from(this.battle.currentState as BattleState)
    this.UIState = BattleState.from(this.battle.currentState as BattleState)
  }

  // :23-25 —— 全场唯一 DoWork 为空、不借 timing 的 phase。
  doWork(): void {}

  // :27-49 —— 自环条件; 注意 :29-30 C# 先各自求值**两个** GetPassiveChance 再比 ||,
  // TS 的 || 会短路 ⇒ 必须提前算完两个, 否则抛点错位 (master=2 而 client 规格含 FormatException 时,
  // 上游照样跑 client 那次并抛, 短路版会安静返回)。
  getNextPhase(): BattlePhase {
    const st = this.state as BattleState
    const masterChance = this.getPassiveChance(st.masterUnit.id)
    const clientChance = this.getPassiveChance(st.clientUnit.id)
    if ((masterChance > 0) || (clientChance > 0)) return this

    const ui = this.UIState as BattleState
    // :34-41 —— 判的是 opUnit 是不是 master 位; 赋的是**新 Unit 拷贝** (非 PVP 下 opUnit=clientUnit)。
    if (st.opUnit.isMasterUnit()) ui.masterUnit = Unit.from(st.opUnit)
    else ui.clientUnit = Unit.from(st.opUnit)

    this.UI.setState(null, ui)

    // :45-46 —— 直写 battle 的两个世界字段 (各自再 clone 一层); 这是驱动序里少见的副作用回写。
    this.battle.lastState = BattleState.from(this.recordState as BattleState)
    this.battle.currentState = BattleState.from(st)

    return new TurnReadyPhase()
  }

  // :51-104 —— 由 Battle.SetSkill 插入点调用 (Battle.cs:347-357 的 cast 怪癖在驱动层, 本段 TS 面已建模)。
  // 口径: 换宠物技能表 GetPetChangeSkill/GetDefaultSkill 属 S6 真表 ⇒ 尾块 NOT_PORTED 抛;
  //       換场分支的 CheckAndApply 走 JUDGE 围栏 (本方法不进对拍向量, 见 port-map 登记)。
  setSkill(skill: SkillRecord, isMe: boolean): void {
    const st = this.state as BattleState
    const myUnit = st.myUnit
    const opUnit = st.opUnit
    const changeUnit = isMe ? myUnit : opUnit

    if (this.getPassiveChance(changeUnit.id) === 0) return

    // :60 —— 上游 Unit.SetSkill 内部吃 Player.instance.currentBattle.settings; 注入世界 settings 恒非 null,
    // battleSettings 接缝的抛点与上游 TakeSkillCost 内的 NRE 在向量世界里同侧。
    changeUnit.setSkill(skill, this.battleSettings)

    if (skill.type === SkillType.換场) {
      this.getEffectHandler(changeUnit).checkAndApply(st)

      if (isMe) {
        this.UIState = BattleState.from(st)
        const ui = this.UIState
        if (ui.opUnit.isMasterUnit()) ui.masterUnit = Unit.from((this.recordState as BattleState).opUnit)
        else ui.clientUnit = Unit.from((this.recordState as BattleState).opUnit)

        // :78 —— hudSystem.OnPassivePetChange 只写展示字段 ⇒ 文件头 no-op 口径。
        this.UI.setState(null, ui)
        this.UI.processQuery(true)
        this.UI.setBottomBarInteractable?.(this.getPassiveChance(myUnit.id) > 0)
        this.UI.setOptionActive?.(2, ui.settings.isCaptureOK)

        if ((!ui.settings.isItemOK) || (ui.myUnit.pet!.isDead)) {
          if (ui.myUnit.pet!.isDead) this.UI.setOptionActive?.(0, false)
          this.UI.setOptionActive?.(2, false)
          this.UI.setOptionActive?.(3, false)
        }
      }
    }

    // :95-103 —— 非 PVP 且对面还要换宠 ⇒ 递归给对面装默认技。默认技要查 S6 表 ⇒ 围栏。
    if ((this.battleSettings.mode !== BattleMode.PVP) && (this.getPassiveChance(opUnit.id) !== 0)) {
      throw new Error('NOT_PORTED: PassivePetChangePhase.SetSkill 尾块 GetPetChangeSkill/GetDefaultSkill 摸 S6 真表 —— PassivePetChangePhase.cs:95-103')
    }
  }

  // :106-121 —— 0=不换, 1=正是这张位, 2=还没选技 (默认给换)。
  // :117 —— options.Get 缺省 '-1' 再 int.Parse: options null ⇒ NRE (dictGet 的 TypeError 配对),
  // 'abc' 之类 ⇒ FormatException (parseIntOrThrow 配对)。
  getPassiveChance(unitId: number): number {
    const currentUnit = (this.recordState as BattleState).getUnitById(unitId)
    const changeUnit = (this.state as BattleState).getUnitById(unitId)

    if (changeUnit!.skill === null) return 2
    const skill = changeUnit!.skill!
    if (skill.type !== SkillType.換场) return 0
    if (currentUnit!.petSystem.cursor !== parseIntOrThrow(dictGet(skill.options, 'source_index', '-1')!)) return 0
    return 1
  }
}

// Battle.cs:249-277 —— NextPhase 主循环的无头版 (本段只拍循环骨架: 入口、null 终止、死循环保护)。
// 死循环分支上游是 currentPhase=new BattleEndPhase(); result.state=Error; result.ProcessResult(...); Hintbox...; return;
// ProcessResult 首行摸 native Random/存档 (BattleResult.cs:62-64), Error 早退之后的 Hintbox 是 View 静态
// ⇒ oracle 抛在本段之外, TS 在同位置 NOT_PORTED 围栏 —— throw-only 配对 (drive: 向量口径)。
export function battleNextPhase(battle: PhaseBattle): void {
  const maxChain = 100
  let round = 0
  while (battle.currentPhase !== null) {
    battle.currentPhase.doWork()
    // :254-255 —— DoWork 期间把 currentPhase 置 null 的口子 (上游静态检查允许, 注入世界走不到), 照搬。
    if (battle.currentPhase === null) break

    battle.lastState = BattleState.from(battle.currentState as BattleState)
    battle.currentState = battle.currentPhase.state
    battle.currentPhase = battle.currentPhase.getNextPhase()

    round += 1
    const st = battle.currentState as BattleState
    if ((round > (maxChain * (EffectTiming.OnAfterAttack - EffectTiming.OnBeforeAttack + 1))) ||
        (st.myUnit.pet!.chain > maxChain) || (st.opUnit.pet!.chain > maxChain)) {
      battle.currentPhase = new BattleEndPhase()
      st.result.state = BattleResultState.Error
      throw new Error('NOT_PORTED: Battle.NextPhase 死循环分支 ProcessResult 摸 native Random/存档 + Hintbox 是 View 静态 —— Battle.cs:263-268')
    }
  }
}
