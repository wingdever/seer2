// phase.ts 的行为锁 —— 拍的是**驱动序形状**: 每个子类的构造 timing、GetNextPhase 分支、
// DamageCalculate 的 5 连 timing、PassivePetChange 的三 clone 与双 chance 预求值怪癖、
// battleNextPhase 主循环的 null 终止/死循环保护/链子保护。
// 与对拍的分工: 对拍钉"上游是不是这样" (oracle 真二进制), 这里钉"TS 侧别自作主张" ——
// 例: GetNextPhase 的 C# `||` 两侧都求值 (PassivePetChangePhase.cs:29-30), JS 的 || 会短路,
// 该怪癖只有单测能长期按住 (对拍里它是 throw-only 向量)。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { EffectTiming } from '../effect/effect-database.ts'
import { Status } from '../pet/status.ts'
import { StatusController, type BattleStatus } from '../pet/status-controller.ts'
import { createRng } from '../rng.ts'
import { tryParseFloat } from '../strutil.ts'
import { BattleSettings } from './settings.ts'
import { setEffectJudgement } from './effect-handler.ts'
import { BattleState, Unit, type PetBag } from './state.ts'
import { cloneSkill, noOpSkill, isActionSkill, type BattlePetView, type PetBuffControllerView, type PetSkillControllerView, type SkillRecord } from './views.ts'
import { SkillType } from '../pet/skill.ts'
import { BattleResultState } from './result.ts'
import {
  BattlePhase, setPhaseBattle, battleNextPhase,
  BattleStartPhase, RoundStartPhase, TurnStartPhase, TurnReadyPhase, DecidePriorityPhase,
  BeforeAttackPhase, DamageCalculatePhase, AttackPhase, AfterAttackPhase, TurnEndPhase,
  AttackEndPhase, BattleEndPhase, PassivePetChangePhase, type PhaseBattle, type PhaseUI,
} from './phase.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
const rowOf = (b: any) => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
  b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]
class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo(rowOf(b)); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}
setEffectTable(EFFECTS)
setBuffTables(new LoadedBuffInfos(), EFFECTS, (s) => tryParseFloat(s) ?? 0)

class FakePet implements BattlePetView {
  stayTurn = 0
  isDead = false
  isMovable = true
  isToken = false
  battleElement = 0
  subBattleElement = 0
  chain = 0
  buffs = []
  statusController: StatusController
  buffController: PetBuffControllerView
  skillController: PetSkillControllerView
  name: string
  level = 10
  star = 1

  constructor(name: string, hp = 100) {
    this.name = name
    this.statusController = new StatusController(Status.of6(10, 10, 10, 10, 10, hp), hp)
    this.buffController = {
      buffs: this.buffs,
      getBuff: (id: number) => this.buffs.find((x) => x.id === id) ?? null,
    }
    this.skillController = { allSkills: [], findSkill: () => null }
  }

  get battleStatus(): BattleStatus { return this.statusController.battleStatus }
  get anger(): number { return this.statusController.anger }
  set anger(v: number) { this.statusController.anger = v }
  get hp(): number { return this.statusController.hp }
  set hp(v: number) { this.statusController.hp = v }
  get maxHp(): number { return this.statusController.maxHp }

  onTurnStart(): void {}

  clone(): BattlePetView {
    const p = new FakePet(this.name, this.maxHp)
    p.stayTurn = this.stayTurn
    p.anger = this.anger
    p.isDead = this.isDead
    p.isToken = this.isToken
    p.chain = this.chain
    p.buffs = this.buffs.map((x) => x.clone())
    p.buffController = { buffs: p.buffs, getBuff: (id: number) => p.buffs.find((x) => x.id === id) ?? null }
    p.skillController = this.skillController
    return p
  }
}

const bag = (...pets: (FakePet | null)[]): PetBag => pets

/** 战斗世界的最小可用态: 两边各一袋活宠、pc=1、PVE 缺省 settings。 */
const mkState = (mPets = bag(new FakePet('m')), cPets = bag(new FakePet('o')), settings = new BattleSettings()): BattleState =>
  new BattleState(settings, new Unit(mPets, 1, settings, createRng(1)), new Unit(cPets, -1, settings, createRng(2)))

/** 接缝 host: ui 记录调用与队列; currentPhase 给驱动序用。 */
const makeHost = (st: BattleState | null, opts: { autoOrder?: number[] | null } = {}): PhaseBattle & { log: string[]; queue: (BattleState | null)[] } => {
  const log: string[] = []
  const queue: (BattleState | null)[] = []
  const ui: PhaseUI = {
    setState(last, current) { log.push('setState'); queue.push(last); if (current !== undefined) queue.push(current) },
    processQuery(one) { log.push(`query:${one === true ? 1 : 0}`); if (queue.length > 0) throw new TypeError('NRE: systemView is null (ProcessQuery)') },
    stopTimer() { log.push('stopTimer'); throw new TypeError('NRE: systemView is null (StopTimer)') },
  }
  const host = {
    get settings() { return host.currentState === null ? null : host.currentState.settings },
    currentState: st,
    lastState: null as BattleState | null,
    autoSkillOrder: opts.autoOrder ?? null,
    ui,
    currentPhase: null as BattlePhase | null,
    log,
    queue,
  }
  setPhaseBattle(() => host)
  return host
}

const FENCE_J = {
  condition: () => { throw new Error('JUDGE fence') },
  apply: () => { throw new Error('JUDGE fence') },
}
const withOpenJudge = (body: (phases: number[]) => void): number[] => {
  const seen: number[] = []
  setEffectJudgement({
    condition: (_e, _u, state) => { seen.push(((state as unknown as BattleState | null)?.phase) ?? -999); return false },
    apply: () => true,
  })
  try { body(seen) } finally { setEffectJudgement(FENCE_J) }
  return seen
}

const mkSkill = (type: number, opts?: [string, string][] | null): SkillRecord => {
  const s = noOpSkill()
  s.type = type
  s.isAction = isActionSkill(type)
  s.options = opts === undefined ? new Map() : (opts === null ? (null as unknown as Map<string, string>) : new Map(opts))
  return s
}

// ── 基类与构造 ──

test('BattlePhase.phase 属性: state null ⇒ getter 兜 None, setter 静默不写 (BattlePhase.cs:13-19)', () => {
  makeHost(null)
  const p = new BattlePhase()
  assert.equal(p.phase, EffectTiming.None)
  p.phase = EffectTiming.OnAttack // 不写、不抛
  assert.equal(p.phase, EffectTiming.None)
})

test('子类构造三连: 每个都从 currentState 深拷 + 写自己的 timing', () => {
  const expect: [new () => BattlePhase, EffectTiming][] = [
    [BattleStartPhase, EffectTiming.OnBattleStart],
    [RoundStartPhase, EffectTiming.OnRoundStart],
    [TurnStartPhase, EffectTiming.OnTurnStart],
    [TurnReadyPhase, EffectTiming.OnTurnReady],
    [DecidePriorityPhase, EffectTiming.OnDecidePriority],
    [BeforeAttackPhase, EffectTiming.OnBeforeAttack],
    [DamageCalculatePhase, EffectTiming.OnBeforeDamageCalculate],
    [AttackPhase, EffectTiming.OnAttackReady],
    [AfterAttackPhase, EffectTiming.OnAfterAttack],
    [TurnEndPhase, EffectTiming.OnTurnEnd],
    [AttackEndPhase, EffectTiming.OnAttackEnd],
    [BattleEndPhase, EffectTiming.OnBattleEnd],
    [PassivePetChangePhase, EffectTiming.OnPassivePetChange],
  ]
  for (const [Cls, timing] of expect) {
    const st = mkState()
    makeHost(st)
    const p = new Cls()
    assert.equal(p.phase, timing, Cls.name)
    assert.notEqual(p.state, st, `${Cls.name}: state 必须是拷贝不是引用`)
  }
})

test('currentState 为 null ⇒ 所有子类构造同点抛 (BattleState.cs:60 先解引用 rhs)', () => {
  makeHost(null)
  assert.throws(() => new BattleStartPhase())
  assert.throws(() => new PassivePetChangePhase())
  assert.throws(() => new BattleEndPhase())
})

// ── GetNextPhase 推进序 ──

test('直线组推进: BattleStart→TurnStart, RoundStart/TurnStart→null, TurnReady→DecidePriority, AttackEnd→TurnEnd, BattleEnd→null', () => {
  const st = mkState()
  makeHost(st)
  assert.ok(new BattleStartPhase().getNextPhase() instanceof TurnStartPhase)
  assert.equal(new RoundStartPhase().getNextPhase(), null)
  assert.equal(new TurnStartPhase().getNextPhase(), null)
  assert.ok(new TurnReadyPhase().getNextPhase() instanceof DecidePriorityPhase)
  assert.ok(new AttackEndPhase().getNextPhase() instanceof TurnEndPhase)
  assert.equal(new BattleEndPhase().getNextPhase(), null)
})

test('BeforeAttack.GetNextPhase 三分支: allDone⇒AttackEnd; 攻击技+isHit⇒DamageCalc; 其余⇒Attack; whosTurn=0 ⇒ atkUnit 空解引用抛', () => {
  const done = mkState()
  done.actionOrder = [1]
  done.actionCursor = 1
  makeHost(done)
  assert.ok(new BeforeAttackPhase().getNextPhase() instanceof AttackEndPhase)

  const hit = mkState()
  hit.whosTurn = 1
  hit.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  hit.masterUnit.skillSystem!.isHit = true
  makeHost(hit)
  assert.ok(new BeforeAttackPhase().getNextPhase() instanceof DamageCalculatePhase)

  const miss = mkState()
  miss.whosTurn = 1
  miss.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  miss.masterUnit.skillSystem!.isHit = false  // 上游 UnitSkillSystem.isHit 缺省 true (UnitSkillSystem.cs) ⇒ 想走 Attack 支必须显式打 false
  makeHost(miss)
  assert.ok(new BeforeAttackPhase().getNextPhase() instanceof AttackPhase)

  // whosTurn==0 ⇒ AtkUnit 为 null, C# 同点 NRE (BeforeAttackPhase.cs:34)
  const zero = mkState()
  makeHost(zero)
  assert.throws(() => new BeforeAttackPhase().getNextPhase(), /null|Cannot read/i)
})

test('Attack/AfterAttack 的 allDone 分岔与 DamageCalculate→Attack', () => {
  const st = mkState()
  st.actionOrder = [1]
  st.actionCursor = 1
  makeHost(st)
  assert.ok(new AttackPhase().getNextPhase() instanceof AttackEndPhase)
  assert.ok(new AfterAttackPhase().getNextPhase() instanceof AttackEndPhase)
  st.actionCursor = 0
  assert.ok(new AttackPhase().getNextPhase() instanceof AfterAttackPhase)
  assert.ok(new AfterAttackPhase().getNextPhase() instanceof BeforeAttackPhase)
  assert.ok(new DamageCalculatePhase().getNextPhase() instanceof AttackPhase)
  assert.ok(new DecidePriorityPhase().getNextPhase() instanceof BeforeAttackPhase)
})

test('TurnEnd.GetNextPhase: 对面全灭 ⇒ 先记 Win 再进 BattleEnd; 都活着 ⇒ TurnStart', () => {
  const alive = mkState()
  makeHost(alive)
  assert.ok(new TurnEndPhase().getNextPhase() instanceof TurnStartPhase)

  const dead = mkState(bag(new FakePet('m')), bag(new FakePet('o'), new FakePet('o2')))
  dead.clientUnit.petSystem.petBag.forEach((p) => { if (p !== null) p.isDead = true }) // alivePetNum 是计算属性
  makeHost(dead)
  const p = new TurnEndPhase()
  assert.ok(p.getNextPhase() instanceof BattleEndPhase)
  assert.equal((p.state as BattleState).result.state, BattleResultState.Win)
})

// ── DoWork 的顺序与副作用 (判定走 open-judge 录音带) ──

test('DamageCalculate.DoWork: 5 连 timing 按 Param→Before→Calculate→After→Final 逐段写入 (DamageCalculatePhase.cs:12-27)', () => {
  const st = mkState()
  st.whosTurn = 1
  st.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  st.clientUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  const host = makeHost(st)
  const p = new DamageCalculatePhase()
  p.state!.atkUnit!.prepareDamageParam = () => null
  p.state!.atkUnit!.calculateDamage = () => 0
  const seen = withOpenJudge(() => { p.doWork() })
  // 天气效果在每次 apply 时各判一轮 ⇒ 取去重后的时序骨架
  const uniq: number[] = []
  for (const x of seen) if (uniq.length === 0 || uniq[uniq.length - 1] !== x) uniq.push(x)
  assert.deepEqual(uniq, [
    EffectTiming.OnDamageParamCalculate, EffectTiming.OnBeforeDamageCalculate,
    EffectTiming.OnDamageCalculate, EffectTiming.OnAfterDamageCalculate, EffectTiming.OnFinalDamageCalculate,
  ])
  assert.equal(p.phase, EffectTiming.OnFinalDamageCalculate)
  // 收尾是 setUIState(battle.currentState) ⇒ setState(last=current, state=本 phase 拷贝)
  assert.equal(host.queue.length, 2)
  assert.equal(host.queue[0], host.currentState)
  assert.equal(host.queue[1], p.state)
})

test('TurnEnd.DoWork: 两段 timing 落在**现取的 this.state** 上 —— OnBuffEffected 换帧后不能再写旧帧 (TurnEndPhase.cs:22-27)', () => {
  const host = makeHost(mkState())
  const p = new TurnEndPhase()
  const oldFrame = p.state as BattleState
  const seen = withOpenJudge(() => { p.doWork() })
  const uniq: number[] = []
  for (const x of seen) if (uniq.length === 0 || uniq[uniq.length - 1] !== x) uniq.push(x)
  assert.deepEqual(uniq, [EffectTiming.OnTurnEnd, EffectTiming.OnAfterTurnEnd])
  // :103 的 `state = new BattleState(state)` 之后, 上游 :27 的 `state.Phase = OnAfterTurnEnd` 打的是**新帧**;
  // 旧帧停在 17 是上游的形状 (驱动向量的 pstate 列实测坐实, 第六段·批一步骤 6)。
  assert.notEqual(p.state, oldFrame)
  assert.equal((p.state as BattleState).phase, EffectTiming.OnAfterTurnEnd)
  assert.equal(oldFrame.phase, EffectTiming.OnTurnEnd)
  // battle.currentState 全程不被 phase 碰 (拷贝链在构造时切断) ⇒ 它还停在 BattleState 构造的 OnBattleStart。
  assert.equal(host.currentState!.phase, EffectTiming.OnBattleStart)
})

test('TurnReady.DoWork: autoSkillOrder null/[] ⇒ 先 StopTimer 再 base.DoWork (TurnReadyPhase.cs:13-14)', () => {
  for (const autoOrder of [null, []]) {
    const host = makeHost(mkState(), { autoOrder })
    const p = new TurnReadyPhase()
    assert.throws(() => p.doWork(), /systemView/) // StopTimer 就抛, JUDGE 围栏还没轮到
    assert.equal(host.log[0], 'stopTimer')
  }
})

test('TurnStart.DoWork: onTurnStart 先落地 (turn+1), 再 base, 再 ProcessQuery (state.GiveTurn 之后队列消费)', () => {
  const st = mkState()
  const host = makeHost(st)
  const p = new TurnStartPhase()
  // 基类 DoWork 先入队 (setState), ProcessQuery 在注入世界里见到非空队列 ⇒ 与 oracle 同抛 systemView-NRE
  assert.throws(() => withOpenJudge(() => { p.doWork() }), /systemView/)
  assert.equal((p.state as BattleState).turn, st.turn + 1)
  assert.deepEqual(host.log, ['setState', 'query:0'])
})

test('AttackEnd.DoWork: whosTurn=0 写在 state 上, 之后才走 base (AttackEndPhase.cs)', () => {
  const st = mkState()
  st.whosTurn = 1
  makeHost(st)
  const p = new AttackEndPhase()
  withOpenJudge(() => { p.doWork() })
  assert.equal((p.state as BattleState).whosTurn, 0)
})

test('BeforeAttack.DoWork: isAllUnitDone 早退 ⇒ 什么都不发生 (不判、不入队)', () => {
  const st = mkState()
  st.actionOrder = [1]
  st.actionCursor = 1
  const host = makeHost(st)
  const seen = withOpenJudge(() => { new BeforeAttackPhase().doWork() })
  assert.deepEqual(seen, [])
  assert.deepEqual(host.log, [])
})

test('BattleEnd.DoWork: 显式 NOT_PORTED (ProcessResult 摸 native Random/存档), 不静默继承基类', () => {
  makeHost(mkState())
  assert.throws(() => new BattleEndPhase().doWork(), /NOT_PORTED/)
})

test('RoundStart.DoWork: whosTurn=0 与 +15 怒气在抛点之前落地', () => {
  const st = mkState()
  st.whosTurn = 1
  makeHost(st)
  const p = new RoundStartPhase()
  const angerBefore = (p.state as BattleState).myUnit.pet!.anger
  assert.throws(() => p.doWork(), /NOT_PORTED/)
  assert.equal((p.state as BattleState).whosTurn, 0)
  assert.equal((p.state as BattleState).myUnit.pet!.anger, angerBefore + 15)
})

// ── PassivePetChangePhase ──

test('PPC 构造: 三连拷贝互相独立 (state/recordState/UIState 各一份)', () => {
  const host = makeHost(mkState())
  const p = new PassivePetChangePhase()
  assert.notEqual(p.state, p.recordState)
  assert.notEqual(p.state, p.UIState)
  assert.notEqual(p.recordState, p.UIState)
  p.state!.turn = 42
  assert.equal((p.recordState as BattleState).turn, (host.currentState as BattleState).turn)
})

test('PPC.DoWork 是全场唯一空实现: 不写 timing、不入队、不判 (PassivePetChangePhase.cs:23-25)', () => {
  const host = makeHost(mkState())
  const p = new PassivePetChangePhase()
  const seen = withOpenJudge(() => { p.doWork() })
  assert.deepEqual(seen, [])
  assert.deepEqual(host.log, [])
  assert.equal(p.phase, EffectTiming.OnPassivePetChange)
})

test('PPC.GetNextPhase 自环: 没选技 (chance 2) ⇒ return this, battle 世界字段不动', () => {
  const host = makeHost(mkState())
  const p = new PassivePetChangePhase()
  assert.equal(p.getNextPhase(), p)
  assert.equal(host.lastState, null)
  assert.deepEqual(host.log, [])
})

test('PPC.GetNextPhase 的 C# || 怪癖: master chance=2 也照样求值 client 的 chance (双物理才对, 一边炸即整炸)', () => {
  const st = mkState()
  // master 没选技 (chance 2, 本可短路), client 挂着 source_index='abc' 的換场 ⇒ int.Parse 抛
  st.clientUnit.skillSystem!.skill = mkSkill(SkillType.換场, [['source_index', 'abc']])
  makeHost(st)
  const p = new PassivePetChangePhase()
  assert.throws(() => p.getNextPhase(), /FormatException|abc|not a number|invalid/i)
})

test('PPC.GetNextPhase 非自环: UIState 换 opUnit 拷贝 + battle 直写 last/current + 队列 (null,UIState) ⇒ TurnReady', () => {
  const st = mkState()
  st.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  st.clientUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  const host = makeHost(st)
  const p = new PassivePetChangePhase()
  const ui = p.UIState as BattleState
  const uiClientBefore = ui.clientUnit
  const uiMasterBefore = ui.masterUnit
  const n = p.getNextPhase()
  assert.ok(n instanceof TurnReadyPhase)
  assert.deepEqual(host.queue, [null, p.UIState], 'setState(null, UIState) 走 ui 接缝')
  assert.deepEqual(host.log, ['setState'])
  // UIState 的 client (=opUnit) 位被换成新拷贝, master 位原样 (三 clone 各自独立, 判据只能在 UIState 内部比)
  assert.notEqual(ui.clientUnit, uiClientBefore)
  assert.equal(ui.clientUnit.id, -1)
  assert.equal(ui.masterUnit, uiMasterBefore)
  // battle.lastState = clone(recordState), battle.currentState = clone(state) —— 都是新对象
  assert.notEqual(host.lastState, p.recordState)
  assert.notEqual(host.currentState, p.state)
  assert.equal((host.currentState as BattleState).turn, (p.state as BattleState).turn)
})

test('PPC.GetNextPhase 的 master 分支: opUnit.id==1 ⇒ 写 UIState.masterUnit (client 位不动)', () => {
  const st = mkState()
  st.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  st.clientUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  st.clientUnit.id = 1
  makeHost(st)
  const p = new PassivePetChangePhase()
  const ui = p.UIState as BattleState
  const uiClientBefore = ui.clientUnit
  const uiMasterBefore = ui.masterUnit
  p.getNextPhase()
  assert.notEqual(ui.masterUnit, uiMasterBefore)
  assert.equal(ui.clientUnit, uiClientBefore)
})

test('GetPassiveChance 六支: null⇒2, 非換场⇒0, cursor==source_index⇒1, 错位⇒0, 垃圾⇒抛, options null⇒抛', () => {
  const probe = (unitSkill: SkillRecord | null, cursor = 0): number | string => {
    const st = mkState()
    st.masterUnit.petSystem.cursor = cursor
    if (unitSkill !== null) st.masterUnit.skillSystem!.skill = unitSkill
    makeHost(st)
    try { const p = new PassivePetChangePhase(); return p.getPassiveChance(1) } catch (e) { return String(e) }
  }
  assert.equal(probe(null), 2)
  assert.equal(probe(mkSkill(SkillType.物理)), 0)
  assert.equal(probe(mkSkill(SkillType.換场, [['source_index', '0']])), 1)
  assert.equal(probe(mkSkill(SkillType.換场, [['source_index', '0']]), 2), 0)
  assert.match(String(probe(mkSkill(SkillType.換场, [['source_index', 'abc']]))), /FormatException|invalid|abc|not (a|be parsed)/i)
  assert.match(String(probe(mkSkill(SkillType.換场, null))), /TypeError|null/i)
})

test('PPC.SetSkill: chance==0 早退, 技能原样不动', () => {
  const st = mkState()
  st.masterUnit.skillSystem!.skill = mkSkill(SkillType.物理)
  makeHost(st)
  const p = new PassivePetChangePhase()
  p.setSkill(mkSkill(SkillType.換场, [['source_index', '0']]), true)
  assert.equal((p.state as BattleState).myUnit.skill!.type, SkillType.物理)
})

test('PPC.SetSkill: 换上新技后才撞 JUDGE 围栏 (換场支的 CheckAndApply 在 SetSkill 之后)', () => {
  const st = mkState()
  st.clientUnit.petSystem.cursor = 0
  st.clientUnit.skillSystem!.skill = mkSkill(SkillType.換场, [['source_index', '0']])
  makeHost(st)
  const p = new PassivePetChangePhase()
  // 新技必须也是 換场 才走 CheckAndApply 支 (PassivePetChangePhase.cs:66)
  assert.throws(() => p.setSkill(mkSkill(SkillType.換场, [['source_index', '0']]), false), /fence|NOT_PORTED/)
  assert.equal((p.state as BattleState).opUnit.skill!.type, SkillType.換场)
})

test('PPC.SetSkill 尾块摸 S6 表 ⇒ 显式 NOT_PORTED (技能此时已装上)', () => {
  const st = mkState()
  makeHost(st)
  const p = new PassivePetChangePhase()
  assert.throws(() => p.setSkill(mkSkill(SkillType.物理), true), /NOT_PORTED/)
  assert.equal((p.state as BattleState).myUnit.skill!.type, SkillType.物理)
})

// ── battleNextPhase (Battle.cs:249-277 主循环) ──

class MockPhase extends BattlePhase {
  label: string
  seq: (MockPhase | null)[]
  trace: string[]
  constructor(label: string, seq: (MockPhase | null)[], trace: string[]) {
    super()
    this.label = label
    this.seq = seq
    this.trace = trace
  }
  doWork(): void { this.trace.push(this.label) }
  getNextPhase(): BattlePhase | null { const n = this.seq.shift(); return n ?? null }
}

test('battleNextPhase: currentPhase null ⇒ 循环不进, 什么都不动', () => {
  const host = makeHost(mkState())
  const trace: string[] = []
  battleNextPhase(host)
  assert.deepEqual(trace, [])
  assert.equal(host.lastState, null)
})

test('battleNextPhase: 推进链上每拍先 lastState=clone(currentState) 再 currentState=phase.state', () => {
  const st = mkState()
  st.turn = 9
  const host = makeHost(st)
  const trace: string[] = []
  const b = new MockPhase('b', [], trace)
  b.state = st
  const a = new MockPhase('a', [b], trace)
  a.state = st
  host.currentPhase = a
  battleNextPhase(host)
  assert.deepEqual(trace, ['a', 'b'])
  assert.equal(host.currentPhase, null)
  assert.equal((host.lastState as BattleState).turn, 9)
  assert.notEqual(host.lastState, st)
  assert.equal(host.currentState, st, 'currentState 是 phase.state 的**引用**交接 (Battle.cs:260)')
})

test('battleNextPhase: DoWork 期间把 currentPhase 置 null ⇒ 当场 break, 不写 lastState', () => {
  const st = mkState()
  const host = makeHost(st)
  class Vanish extends BattlePhase {
    trace: string[]
    constructor(trace: string[]) { super(); this.trace = trace }
    doWork(): void { this.trace.push('work'); host.currentPhase = null }
  }
  const trace: string[] = []
  const p = new Vanish(trace)
  p.state = st
  host.currentPhase = p
  battleNextPhase(host)
  assert.deepEqual(trace, ['work'])
  assert.equal(host.lastState, null)
})

test('battleNextPhase: 自环撞 round 上限 ⇒ BattleEndPhase + result=Error, 然后 NOT_PORTED 抛 (Battle.cs:263-268)', () => {
  const st = mkState()
  const host = makeHost(st)
  class SelfLoop extends BattlePhase {
    rounds = 0
    doWork(): void { this.rounds += 1 }
    getNextPhase(): BattlePhase { return this }
  }
  const p = new SelfLoop()
  p.state = st
  host.currentPhase = p
  assert.throws(() => battleNextPhase(host), /NOT_PORTED/)
  assert.equal(p.rounds, 1001, 'round>1000 的第 1001 拍触发')
  assert.ok(host.currentPhase instanceof BattleEndPhase)
  assert.equal((host.currentState as BattleState).result.state, BattleResultState.Error)
})

test('battleNextPhase: chain>100 的保护在第 1 拍就触发, 不用等 round 上限', () => {
  const pet = new FakePet('m')
  pet.chain = 101
  const st = mkState(bag(pet))
  const host = makeHost(st)
  const trace: string[] = []
  const b = new MockPhase('b', [], trace)
  b.state = st
  const a = new MockPhase('a', [b], trace)
  a.state = st
  host.currentPhase = a
  assert.throws(() => battleNextPhase(host), /NOT_PORTED/)
  assert.deepEqual(trace, ['a'], '保护在换 phase **之后**查 ⇒ b 从未 doWork')
  assert.equal(host.currentState, st)
})

test('cloneSkill: null options 在拷贝当下抛 (Skill.cs:159 ToDictionary), 不放行静默空表', () => {
  assert.throws(() => cloneSkill(mkSkill(SkillType.物理, null)), /ArgumentNullException|source/)
  assert.doesNotThrow(() => cloneSkill(mkSkill(SkillType.物理)))
})
