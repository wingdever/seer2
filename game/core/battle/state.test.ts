// state.ts 的行为锁 —— 拍的是**快照形状**: 拷贝构造逐成员、三档深浅、以及 identifier 那几条
// 「读出来不像它读的东西」的分支。chunk D 的对拍覆盖取值本身, 这里锁 TS 侧最容易自作主张的四处:
//   · BattleState.from 漏拷某个成员 ⇒ 快照与本体共享, 回放时改一处动两帧;
//   · UnitPetSystem 的「原袋浅拷 / 快照深拷」被统一成一样;
//   · GetStateIdentifier 的 trimId 落到 switch 那条怪路 (id="buffturn" 读出 turn);
//   · OnTurnStart 先斩 lastTurnState.lastTurnState、再挂 phase=OnTurnEnd 快照的顺序。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable, Effect } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { Buff } from '../buff/buff.ts'
import { EffectAbility, EffectCondition, EffectTarget, EffectTiming } from '../effect/effect-database.ts'
import { Status } from '../pet/status.ts'
import { BattleStatus, StatusController } from '../pet/status-controller.ts'
import { createRng } from '../rng.ts'
import { tryParseFloat } from '../strutil.ts'
import { BattleSettings, BattleMode } from './settings.ts'
import { EffectHandler, setEffectJudgement } from './effect-handler.ts'
import { Unit, UnitPetSystem, BattleState, type PetBag } from './state.ts'
import { UnitSkillSystem } from './unit-skill-system.ts'
import { cloneSkill, noOpSkill, setSkillEffects, isActionSkill, type BattlePetView, type PetBuffControllerView, type PetSkillControllerView, type SkillRecord } from './views.ts'
import { SkillType } from '../pet/skill.ts'

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

const FLOAT_MIN = -3.4028234663852886e38

/** 表里按 copyHandle 原始串挑一个印记 id, 让 addBuff 的分支测试打在**真**类型上。
 *  表里每条印记都自带效果 (没有空效果的行), 而 addBuff 只看 copyHandleType 与 turn ⇒ 不挑效果。 */
const buffIdOf = (copyHandleRaw: string): number => {
  const row = BUFFS.find((b: any) => b.copyHandleRaw === copyHandleRaw)
  if (row === undefined) throw new Error(`表里没有 copyHandle=${copyHandleRaw} 的印记`)
  return row.id
}

class FakePet implements BattlePetView {
  stayTurn = 0
  isDead = false
  isMovable = true
  isToken = false
  battleElement = 0
  subBattleElement = 0
  buffs: Buff[] = []
  turnStartCalls = 0
  statusController: StatusController
  buffController: PetBuffControllerView
  skillController: PetSkillControllerView
  name: string
  level: number
  star: number

  constructor(name: string, level = 10, star = 1, hp = 100) {
    this.name = name
    this.level = level
    this.star = star
    this.statusController = new StatusController(Status.of6(10, 10, 10, 10, 10, hp), hp)
    this.buffController = {
      buffs: this.buffs,
      getBuff: (id: number) => this.buffs.find((x) => x.id === id) ?? null,
    }
    this.skillController = { allSkills: [], findSkill: () => null }
  }

  // 上游 BattlePet.battleStatus 就是 statusController.battleStatus 的转发属性 (每次现算一个新对象)
  get battleStatus(): BattleStatus { return this.statusController.battleStatus }
  get anger(): number { return this.statusController.anger }
  set anger(v: number) { this.statusController.anger = v }
  get hp(): number { return this.statusController.hp }
  set hp(v: number) { this.statusController.hp = v }

  onTurnStart(): void { this.turnStartCalls++ }

  clone(): BattlePetView {
    const p = new FakePet(this.name, this.level, this.star, this.hp)
    p.stayTurn = this.stayTurn
    p.anger = this.anger
    p.isDead = this.isDead
    p.isToken = this.isToken
    p.buffs = this.buffs.map((x) => x.clone())
    p.buffController = {
      buffs: p.buffs,
      getBuff: (id: number) => p.buffs.find((x) => x.id === id) ?? null,
    }
    p.skillController = this.skillController
    return p
  }
}

const bag = (...pets: (FakePet | null)[]): PetBag => pets
const mkUnit = (id: number, pets: PetBag, settings = new BattleSettings(), rng = createRng(1)): Unit =>
  new Unit(pets, id, settings, rng)
const mkState = (pets: PetBag, opPets: PetBag, settings = new BattleSettings()): BattleState =>
  new BattleState(settings, mkUnit(1, pets, settings), mkUnit(-1, opPets, settings))

const mkEffect = (id: number, priority: number): Effect =>
  new Effect(EffectTiming.Resident, priority, EffectTarget.None, EffectCondition.None, null, EffectAbility.None, null, id)

/** 一条被动技: 空过壳改 type, 再把效果塞进去 (setSkillEffects 会跑常驻壳展开, 这里给的是裸效果)。 */
const passiveSkill = (id: number, effects: Effect[]): SkillRecord => {
  const s = noOpSkill()
  s.id = id
  s.type = SkillType.被动
  s.isAction = isActionSkill(s.type)
  setSkillEffects(s, effects)
  return s
}

test('Unit 构造: parallelCount<=1 只给一本账, >1 按 petBag 长度给 (不是 parallelCount)', () => {
  const one = mkUnit(1, bag(new FakePet('a'), new FakePet('b')))
  assert.equal(one.parallelSkillSystems.length, 1)

  const multi = mkUnit(1, bag(new FakePet('a'), new FakePet('b'), new FakePet('c')), new BattleSettings({ parallelCount: 2 }))
  assert.equal(multi.parallelSkillSystems.length, 3)
})

test('UnitPetSystem: 原袋构造是引用浅拷, from 才是逐只深拷', () => {
  const a = new FakePet('a')
  const original = new UnitPetSystem(bag(a))
  assert.equal(original.pet, a)                                  // Array.Copy ⇒ 同一个对象

  const snap = UnitPetSystem.from(original)
  assert.notEqual(snap.pet, a)
  assert.equal(snap.pet!.name, 'a')
  a.stayTurn = 5
  assert.equal(snap.pet!.stayTurn, 0)
})

test('UnitPetSystem.pet 的 cursor 越界是异常, 不是 undefined (GiveTurnToNextUnit 能写出 -1)', () => {
  const sys = new UnitPetSystem(bag(new FakePet('a')))
  sys.cursor = -1
  assert.throws(() => sys.pet, /IndexOutOfRangeException/)
})

test('getNextCursorCircular: 从 start+1 找起, 找不到返回 start, 当前宠自己不会被返回', () => {
  const sys = new UnitPetSystem(bag(new FakePet('a'), new FakePet('b')))
  sys.cursor = 0
  assert.equal(sys.getNextCursorCircular(), 1)                   // 默认谓词 !isDead ⇒ 跳过自己
  assert.equal(sys.getNextCursorCircular(0, () => false), 0)     // 全被滤掉 ⇒ 返回 start
})

test('swapTokenPet: 替身顶上后接管原位的怒气, 死替身直接 false', () => {
  const sys = new UnitPetSystem(bag(new FakePet('main')))
  const token = new FakePet('token')
  token.anger = 17
  sys.tokenPetBag[0] = token
  sys.petBag[0]!.anger = 33

  assert.equal(sys.swapTokenPet(0), true)
  assert.equal(sys.pet!.name, 'token')
  assert.equal(sys.pet!.anger, 33)                               // 怒气跟着**格子**走, 不跟着宠走
  assert.equal(sys.tokenPetBag[0]!.anger, 33)                     // 替身自己的 17 被格子值覆盖掉, 换下来那只也读 33

  sys.petBag[0]!.isDead = true
  sys.tokenPetBag[0]!.isDead = true
  assert.equal(sys.swapTokenPet(0), false)
})

test('BattleState 构造: 两个 Unit 走拷贝构造 ⇒ 与外部袋脱钩; stateBuffs 是 initBuffs 现解析的新对象', () => {
  const a = new FakePet('a')
  const settings = new BattleSettings({ initBuffExpr: '(x:100)' })
  const state = new BattleState(settings, mkUnit(1, bag(a)), mkUnit(-1, bag(new FakePet('b'))))

  a.stayTurn = 9
  assert.equal(state.masterUnit.pet!.stayTurn, 0)
  assert.deepEqual(state.stateBuffs.map((x) => x[0]), ['x'])
  assert.equal(state.settings.initBuffExpr, '(x:100)')
})

test('BattleState.from 逐成员独立: 改快照不动本体, lastTurnState 递归深拷', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  state.turn = 3
  state.options.set('k', '1')
  state.reports.push('r')
  state.actionOrder = [1, -1]
  state.actionCursor = 0
  state.masterUnit.unitBuffs.push(new Buff(100))
  state.masterUnit.pet!.anger = 40

  const snap = BattleState.from(state)
  snap.options.set('k', '2')
  snap.reports.push('r2')
  snap.actionCursor = 1
  snap.masterUnit.unitBuffs[0]!.turn = 0
  snap.masterUnit.pet!.anger = 1

  assert.equal(state.options.get('k'), '1')
  assert.deepEqual(state.reports, ['r'])
  assert.equal(state.actionCursor, 0)
  assert.equal(state.masterUnit.unitBuffs[0]!.turn, BUFFS.find((b: any) => b.id === 100).turn)
  assert.equal(state.masterUnit.pet!.anger, 40)

  state.lastTurnState = snap
  const snap2 = BattleState.from(state)
  assert.notEqual(snap2.lastTurnState, snap)
  assert.equal(snap2.lastTurnState!.turn, 3)
})

test('onTurnStart: 首回合只补战报; 之后先斩上上帧、再挂 phase=OnTurnEnd 的快照', () => {
  const state = mkState(bag(new FakePet('主')), bag(new FakePet('敌')))
  state.onTurnStart()
  assert.equal(state.turn, 1)
  assert.deepEqual(state.reports, [
    '我方<color=#ffbb33>【主】</color>登场了！',
    '敌方<color=#ff0080>【敌】</color>登场了！',
    '<size=16><color=#00ff00>==== 第 1 回合 ====</color></size>',
  ])
  assert.equal(state.lastTurnState, null)

  state.onTurnStart()
  assert.equal(state.turn, 2)
  assert.equal(state.lastTurnState!.turn, 1)                    // 快照拍在 turn++ **之前**
  assert.equal(state.lastTurnState!.phase, EffectTiming.OnTurnEnd)
  assert.equal(state.lastTurnState!.lastTurnState, null)
})

test('onTurnStart 把 stateBuffs 倒数一层, turn 归零的那条被删掉', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  const keep = new Buff(100)
  const gone = new Buff(101)
  keep.turn = 2
  gone.turn = 1
  state.stateBuffs = [['a', keep], ['b', gone]]

  state.onTurnStart()
  assert.deepEqual(state.stateBuffs.map((x) => x[0]), ['a'])
  assert.equal(state.stateBuffs[0]![1].turn, 1)
})

test('addReport 满 30 丢最旧的一条 (上限由它自己维护, 与容器的 30 无关)', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  for (let i = 0; i < 35; i++) state.addReport(String(i))
  assert.equal(state.reports.length, 30)
  assert.equal(state.reports[0], '5')
  assert.equal(state.reports[29], '34')
})

test('getStateIdentifier: option 缺键读成 0, order.direction 缺键读成 1, settings./result. 各自转发', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  assert.equal(state.getStateIdentifier('option[zzz]'), 0)
  assert.equal(state.getStateIdentifier('order.direction'), 1)
  state.setStateIdentifier('order.direction', -1)
  assert.equal(state.options.get('order_direction'), '-1')
  assert.equal(state.getStateIdentifier('order.direction'), -1)
  assert.equal(state.getStateIdentifier('settings.mode'), BattleMode.Normal)
  assert.equal(state.getStateIdentifier('turn'), 0)
  assert.equal(state.getStateIdentifier('zzz'), FLOAT_MIN)
})

test('getStateIdentifier 的 trimId 落到 switch: id="buffturn" 读出来是 turn (上游形状)', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  state.turn = 7
  assert.equal(state.getStateIdentifier('buffturn'), 7)                  // 削掉 buff 前缀、括号不匹配 ⇒ 带 "turn" 进 switch
  assert.equal(state.getStateIdentifier('buff[nope].turn'), FLOAT_MIN)   // 括号匹配但这一 key 不在场 ⇒ MinValue
})

test('getStateIdentifier 的 buff[...] 转发: 已知键读印记自己的 identifier, 未知键回落 GetNumIdentifier', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  const b = new Buff(100)
  b.turn = 4
  state.stateBuffs = [['场', b]]
  assert.equal(state.getStateIdentifier('buff[场].turn'), 4)
  assert.equal(state.getStateIdentifier('buff[场].zzz'), 0)               // 回落 GetNumIdentifier("zzz") ⇒ 0
})

test('last.<id> 只在一帧之内可读, 没有上一帧给 MinValue', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  assert.equal(state.getStateIdentifier('last.turn'), FLOAT_MIN)
  state.turn = 2
  state.lastTurnState = BattleState.from(state)
  assert.equal(state.getStateIdentifier('last.turn'), 2)
  assert.equal(state.getStateIdentifier('last.last.turn'), FLOAT_MIN)
})

test('giveTurnToNextUnit: 出界归 whosTurn=0; 当前宠为 null 的那格递归推过去', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  state.actionOrder = [1, -1]
  state.giveTurnToNextUnit()
  assert.equal(state.actionCursor, 0)
  assert.equal(state.whosTurn, 1)
  state.giveTurnToNextUnit()
  assert.equal(state.whosTurn, -1)
  state.giveTurnToNextUnit()
  assert.equal(state.whosTurn, 0)
  assert.equal(state.actionCursor, 2)
  assert.equal(state.isAllUnitDone, true)

  const empty = mkState(bag(null), bag(new FakePet('c')))
  empty.actionOrder = [1, -1]
  empty.giveTurnToNextUnit()
  // master 空 ⇒ 递归到 -1 那格, 那一格又发现 rhs 空 ⇒ 再递归到出界 ⇒ 最终 whosTurn 归 0
  assert.equal(empty.whosTurn, 0)
  assert.equal(empty.actionCursor, 2)
})

test('isGoFirst: actionOrder 空 ⇒ FirstOrDefault()=0 ⇒ Sign=1 ⇒ 恒等 master 先手', () => {
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  assert.equal(state.isGoFirst(state.masterUnit), true)
  assert.equal(state.isGoFirst(state.clientUnit), false)
  assert.equal(state.isGoLast(state.masterUnit), false)
})

test('getEffectHandler(null) 是 master Concat client, 单位内六段顺序固定', () => {
  // BattleState 构造把两个 Unit 拷贝了一份 ⇒ 宠上的印记/技能必须在 mkState **之前**挂好。
  const wire = (p: FakePet): FakePet => {
    p.buffController = { buffs: p.buffs, getBuff: (id: number) => p.buffs.find((x) => x.id === id) ?? null }
    p.skillController = {
      allSkills: p.skillController.allSkills,
      findSkill: (id: number) => p.skillController.allSkills.find((s) => s?.id === id) ?? null,
    }
    return p
  }
  const m = new FakePet('m')
  const c = new FakePet('c')

  const stateBuff = new Buff(100)
  stateBuff.effects = [mkEffect(1001, 1)]
  const unitBuff = new Buff(101)
  unitBuff.effects = [mkEffect(1004, 1)]
  const petBuff = new Buff(102)
  petBuff.effects = [mkEffect(1005, 1)]
  m.buffs = [petBuff]
  m.skillController = { allSkills: [passiveSkill(500, [mkEffect(1003, 1)]), null], findSkill: () => null }
  c.skillController = { allSkills: [passiveSkill(501, [mkEffect(2003, 1)])], findSkill: () => null }
  wire(m)
  wire(c)

  const state = mkState(bag(m), bag(c))
  const weatherIds = state.weatherBuff.effects.map((x) => x.id)
  state.stateBuffs = [['场', stateBuff]]
  state.masterUnit.unitBuffs = [unitBuff]

  const ids = state.getEffectHandler(null).getEffects(() => true).map((x) => x.id)

  // 天气段最先且两边各取一次, 然后 master 的 [state, skill?, passive, unit, pet], 再是 client 的同款。
  assert.deepEqual(ids, [...weatherIds, 1001, 1003, 1004, 1005, ...weatherIds, 1001, 2003])
})

test('getEffectsByTiming 借 phase 判完就**复原**, 效果按 filter 挑出来', () => {
  setEffectJudgement({ condition: (_e, _u, st) => (st as BattleState).phase === EffectTiming.OnTurnEnd })
  const state = mkState(bag(new FakePet('m')), bag(new FakePet('c')))
  const handler = new EffectHandler()
  handler.addEffects(state.masterUnit, [mkEffect(7, 0)])

  const before = state.phase
  const picked = state.getEffectsByTiming(EffectTiming.OnTurnEnd, handler, (e) => e.id === 7)
  assert.equal(state.phase, before)
  assert.deepEqual(picked.map((x) => x.id), [7])
  assert.deepEqual(state.getEffectsByTiming(EffectTiming.OnBattleStart, handler, () => true), [])
})

test('UnitSkillSystem 拷贝构造: 账本字段全抄, skill 深拷 (改快照不动本体)', () => {
  const sys = new UnitSkillSystem()
  const s = noOpSkill()
  s.name = '打'
  sys.skill = s
  sys.skillDamage = 5
  sys.damageDict.set('buff-1003', 7)
  sys.level = 0.12

  const snap = UnitSkillSystem.from(sys)
  snap.skill!.name = '改'
  snap.skillDamage = 9
  snap.damageDict.set('buff-1003', 100)

  assert.equal(sys.skill!.name, '打')
  assert.equal(sys.skillDamage, 5)
  assert.equal(sys.damageDict.get('buff-1003'), 7)
  assert.equal(snap.level, sys.level)
})

test('onChainStart 只清 skill 那族, 保留 buff/item 的账', () => {
  const sys = new UnitSkillSystem()
  sys.damageDict.set('skill', 10)
  sys.damageDict.set('buff-1', 20)
  sys.skillDamage = 30
  sys.buffDamage = 40
  sys.onChainStart()
  assert.deepEqual([...sys.damageDict.keys()], ['buff-1'])
  assert.equal(sys.skillDamage, 0)
  assert.equal(sys.buffDamage, 40)
  assert.equal(sys.totalBuffDamage, 60)
})

test('伤害与治疗的合计不对称: GetTypeDamage 每条取 max(v,0), GetTypeHeal 原样加', () => {
  const sys = new UnitSkillSystem()
  // 键**不能**叫 "skill"/"item"/"buff" —— 那三个走 damage[skill]⇒skillDamage 字段这条路, 读不到字典。
  sys.damageDict.set('skillx', -50)
  sys.healDict.set('skillx', -50)
  assert.equal(sys.totalSkillDamage, 0)                          // 求和前逐条夹到 0
  assert.equal(sys.totalSkillHeal, -50)                           // 治疗原样加
  assert.equal(sys.getSkillSystemIdentifier('damage[skillx]'), -50)  // identifier 这条路**不夹**
  assert.equal(sys.getSkillSystemIdentifier('heal[skillx]'), -50)
  assert.equal(sys.getSkillSystemIdentifier('damage[skill]'), 0)     // 精确名读的是字段, 不是字典
  assert.equal(sys.getSkillSystemIdentifier('heal[skill]'), 0)
})

test('setSkillSystemIdentifier 的 damage/heal 写专用字段 (int 强转), 读 damage 读的是 total', () => {
  const sys = new UnitSkillSystem()
  sys.damageDict.set('skill', 5)
  sys.setSkillSystemIdentifier('damage', 12.9)
  assert.equal(sys.skillDamage, 12)
  assert.equal(sys.getSkillSystemIdentifier('damage'), 17)
})

test('Unit.setSkill 存的是副本, 扣 PP 扣的是**表里那一份**', () => {
  const settings = new BattleSettings({ ruleId: 1 })
  const pet = new FakePet('m')
  const real = noOpSkill()
  real.id = 1001
  real.type = SkillType.物理
  real.isAction = false
  real.pp = 3
  real.maxPP = 5
  pet.skillController = { allSkills: [real], findSkill: (id: number) => (id === 1001 ? real : null) }

  const unit = mkUnit(1, bag(pet), settings)
  const played = cloneSkill(real)
  played.pp = 99                                                 // 越界值: 读回来夹到 maxPP
  unit.setSkill(played, settings)

  assert.equal(real.pp, 2)
  assert.equal(unit.skill!.pp, 5)
  assert.notEqual(unit.skill, played)
})

test('Unit.addBuff: null 不进, 新 id 追加, Replace 把 -1 当无限久压得过有期限的新印记', () => {
  const replaceId = buffIdOf('replace')
  const unit = mkUnit(1, bag(new FakePet('m')))
  assert.equal(unit.addBuff(null), false)

  const mk = (id: number, turn: number, value = 1): Buff => {
    const b = new Buff(id)
    b.turn = turn
    b.value = value
    return b
  }
  assert.equal(unit.addBuff(mk(replaceId, -1)), true)            // 永久
  assert.equal(unit.addBuff(mk(replaceId, 2)), false)            // 旧的 -1 记成 int.MaxValue ⇒ 换不掉
  assert.equal(unit.unitBuffs.length, 1)
  unit.unitBuffs[0]!.turn = 3                                    // 换成有限, 才走得到「有限 vs 有限」
  assert.equal(unit.addBuff(mk(replaceId, 99)), true)
  assert.equal(unit.unitBuffs.length, 1)
  assert.equal(unit.unitBuffs[0]!.turn, 99)
})

test('Unit.reduceBuffTurn 两轮扫描: 第二轮重新读 turn, 归零的才被删', () => {
  const unit = mkUnit(1, bag(new FakePet('m')))
  const one = new Buff(100)
  const two = new Buff(101)
  one.turn = 1
  two.turn = 2
  unit.unitBuffs = [one, two]

  unit.reduceBuffTurn()
  assert.deepEqual(unit.unitBuffs, [two])
  assert.equal(two.turn, 1)
})

test('Unit.isMovable 三条与: 自己没有不可动印记、当前宠在、宠能动', () => {
  const pet = new FakePet('m')
  const unit = mkUnit(1, bag(pet))
  assert.equal(unit.isMovable, true)
  pet.isMovable = false
  assert.equal(unit.isMovable, false)
  assert.equal(mkUnit(1, bag(null)).isMovable, false)
})

test('Unit.isReady: 单人看当前那本账, 并行时任一位逃跑即 ready', () => {
  const settings = new BattleSettings({ parallelCount: 2 })
  const unit = mkUnit(1, bag(new FakePet('a'), new FakePet('b')), settings)
  assert.equal(unit.isReady, false)                              // 两本账都没选技

  unit.parallelSkillSystems[0]!.skill = noOpSkill()
  unit.parallelSkillSystems[1]!.skill = noOpSkill()
  assert.equal(unit.isReady, true)

  const escape = noOpSkill()
  escape.type = SkillType.逃跑
  unit.parallelSkillSystems[1]!.skill = escape
  assert.equal(unit.isReady, true)

  // 死位不参与判定
  const half = mkUnit(1, bag(new FakePet('a'), new FakePet('b', 10, 1, 0)), settings)
  half.petSystem.petBag[1]!.isDead = true
  half.parallelSkillSystems[0]!.skill = noOpSkill()
  assert.equal(half.isReady, true)
})
