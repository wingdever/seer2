// S3 快照层的 **TS 侧镜像** —— 把 tools/oracle-cs 那一侧 Build*/Sig*/<Kind>Vector 逐条对着写一遍,
// 让 difftest 能在同一批向量上跑 game/core/battle/state.ts 的移植体。
//
// 两边必须**逐字对齐**的东西有三类, 少一样对拍就是假绿:
//   · spec 的缺省值 (oracle 的 Iv/Bv/Sv/Fv 第二参), 一律取上游字段初始化器的那个数;
//   · 签名的**文本形状** (C# 的 bool.ToString 是 True/False、null 经 Str 是 "-", float 经 (double) 展开);
//   · 每个 op 走的**调用序列** (谁先读谁后写, 越界在哪一步抛)。
//
// 宠这一侧用 FakePet: 它只实现 views.ts 的 BattlePetView 面, statusController 用**真**的
// PetBattleStatusController 移植体, 所以 hp/anger 的夹紧是上游代码在算。oracle 那边同理 ——
// 两边的宠表都没装载, 签名里因此不含 level/name/normalStatus (口径同 Boot.cs 的合成 PetInfo)。

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Buff } from '../game/core/buff/buff.ts'
import { BattleState, Unit, UnitPetSystem, petPowerUp } from '../game/core/battle/state.ts'
import { UnitSkillSystem } from '../game/core/battle/unit-skill-system.ts'
import { BattleSettings } from '../game/core/battle/settings.ts'
import { BattleResult } from '../game/core/battle/result.ts'
import {
  BattlePhase, setPhaseBattle, BattleStartPhase, RoundStartPhase, TurnStartPhase, TurnReadyPhase,
  DecidePriorityPhase, BeforeAttackPhase, DamageCalculatePhase, AttackPhase, AfterAttackPhase,
  TurnEndPhase, AttackEndPhase, BattleEndPhase, PassivePetChangePhase, battleNextPhase,
} from '../game/core/battle/phase.ts'
import { noOpSkill, isActionSkill, cloneSkill, skillPP, setSkillIdentifier, getSkillIdentifier } from '../game/core/battle/views.ts'
import { JsonSkillTable, getSkillRawInfoStringArray, powerupIgnored, powerdownIgnored } from '../game/core/battle/skill-table.ts'
import { Effect, PrefabTable } from '../game/core/effect/effect.ts'
import { tryParseFloat } from '../game/core/strutil.ts'
import { toEffectTiming, toEffectTarget, toEffectCondition, toEffectAbility } from '../game/core/effect/effect-database.ts'
import { getBattlePetTargetList } from '../game/core/battle/target.ts'
import { getAvailableSkills } from '../game/core/pet/skill-controller.ts'
import { getIdentifierInEffectContext, parseEffectOperation, setIdentifierBattle, setEffectIdentHost } from '../game/core/parser/identifier-effect.ts'
import { condition as judgeCondition, apply as judgeApply } from '../game/core/effect/effect-judge.ts'
import { setEffectJudgement } from '../game/core/battle/effect-handler.ts'
import { createRng } from '../game/core/rng.ts'
import { Status } from '../game/core/pet/status.ts'
import { StatusController } from '../game/core/pet/status-controller.ts'
import { PetBuffController } from '../game/core/pet/buff-controller.ts'
import { f } from '../game/core/mathf.ts'

export const SNAP_KINDS = new Set(['statecopy', 'stateid', 'stateset', 'stateflag', 'giveturn', 'gofirst',
  'petbag', 'skillsys', 'settings', 'result', 'effectq', 'phaseq', 'phasedrive', 'statedrive', 'effectident', 'target',
  'effectcond', 'effectapply', 'statusctrl', 'petmut', 'skilltable'])

// ── C# 文本形状 ──────────────────────────────────────────────────────────
// cs() 对应"装箱 object 再 ToString": bool ⇒ True/False, int/float ⇒ 常规十进制。
const cs = x => typeof x === 'boolean' ? (x ? 'True' : 'False') : String(x)
const STR = x => (x === null || x === undefined) ? '-' : cs(x)
// oracle 的 Fs 把 float **展宽成 double** 再 ToString; JS 里 Math.fround(x) 再 String 是同一件事
// (两边都是"能唯一还原该 double 的最短十进制")。
const FS = x => String(Math.fround(Number(x)))
const EI = x => String(Math.trunc(Number(x)))
const LEN = xs => xs.length

// ── spec 读取 (与 oracle 的 Has/Iv/Bv/Sv/Fv/Sub 同一条规则) ──────────────
const has = (v, n) => v !== null && v !== undefined && typeof v === 'object' && v[n] !== undefined && v[n] !== null
const iv = (v, n, d) => (has(v, n) ? Math.trunc(v[n]) : d)
const bv = (v, n, d) => (has(v, n) ? Boolean(v[n]) : d)
const sv = (v, n, d = null) => (has(v, n) ? v[n] : d)
const sub = (v, n) => (has(v, n) ? v[n] : null)
const f32v = x => typeof x === 'string'
  ? (x === 'NaN' ? NaN : x === 'Inf' ? Infinity : x === '-Inf' ? -Infinity : f(parseFloat(x)))
  : f(Number(x))
const fv = (v, n, d) => (has(v, n) ? f32v(v[n]) : d)
// 与 oracle 的 Fail/Norm 对称: 非有限数在 JSON 里活不下来, 用同一组哨兵字符串过界。
const norm = x => Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Inf' : x === -Infinity ? '-Inf' : x
const dictSS = (v, n) => new Map(has(v, n) ? Object.entries(v[n]).map(([k, x]) => [k, String(x)]) : [])
const dictSI = (v, n) => new Map(has(v, n) ? Object.entries(v[n]).map(([k, x]) => [k, Math.trunc(x)]) : [])
const intsOf = (v, n) => (has(v, n) ? v[n].map(x => Math.trunc(x)) : [])
const buffsOf = (v, n) => (has(v, n) ? v[n].map(buffOf) : [])

// oracle 的 BuffOf: id 必填, turn 缺省 -1, value 缺省 null(⇒ 0), sets 按**书写序**应用。
function buffOf(v) {
  if (v === null || v === undefined) return null
  const b = new Buff(Math.trunc(v.id), has(v, 'turn') ? Math.trunc(v.turn) : -1, has(v, 'value') ? Math.trunc(v.value) : null)
  if (has(v, 'sets')) for (const [k, x] of Object.entries(v.sets)) b.setBuffIdentifier(k, f32v(x))
  return b
}

// ── 宠层替身: BattlePet 与它的两个 controller ────────────────────────────
// PetBattleSkillController.cs 在快照层的可用面 —— 与 oracle BuildPet 的那个 controller 构造逐笔对齐:
// 无 skill 键时四个容器全 null (上游字段无初值), allSkills 于是是空表, FindSkill 恒 null。
class FakeSkillController {
  constructor(spec) {
    // `new Skill(x, false)` (拷贝构造的第二参 = copyPP=false ⇒ pp 回到 maxPP)。
    const bag = n => (has(spec, n) ? spec[n].map(x => ((x === null || x === undefined) ? null : cloneSkill(blankSkill(x), false))) : null)
    this.cursor = 0
    this.headerSkills = bag('headerSkills')
    this.loopSkills = bag('loopSkills')
    this.normalSkills = bag('normalSkills')
    this.superSkill = has(spec, 'superSkill') ? cloneSkill(blankSkill(spec.superSkill), false) : null
  }

  // :15-18 —— 每次访问都新拼一份, 且 null 容器当成空表。
  get allSkills() {
    return [...(this.headerSkills ?? []), ...(this.loopSkills ?? []),
      ...(this.normalSkills ?? []), ...(this.superSkill === null ? [] : [this.superSkill])]
  }

  // :83-106 —— 四段搜索全被注释掉了, 实际生效的是 `allSkills.Find(x => (x?.id ?? 0) == id)`:
  // **洞 (null) 的 id 算 0**, 所以 FindSkill(0) 会命中第一个洞。
  findSkill(id) { return this.allSkills.find(x => ((x === null || x === undefined) ? 0 : x.id) === id) ?? null }

  // PetBattleSkillController.cs:69-79 —— 规则在 core 的 getAvailableSkills 里, 这里只做宿主转发
  // (与 oracle 那边"controller 上的真方法"同位: 对拍比的是 core 的规则, 不是镜像的胶水)。
  getAvailableSkills(anger, withSuper = true) { return getAvailableSkills(this, anger, withSuper) }

  // :40-45 拷贝构造 —— header/loop/super 的 Select 没有 null 守卫 (上游真会 NRE),
  // 只有 normalSkills 有 `(x == null) ? null : new Skill(x)`。洞的位置差异是语义, 别"顺手统一"。
  clone() {
    const out = new FakeSkillController({})
    // header/loop **没有** null 守卫 ⇒ 洞在这里就抛 (上游 `new Skill(null)` 读字段 NRE);
    // normalSkills 有守卫 ⇒ 洞原样带过去。两种形状必须分开, 别统一。
    const raw = xs => (xs === null ? null : xs.map(x => cloneSkill(x, true)))
    const guard = xs => (xs === null ? null : xs.map(x => (x === null ? null : cloneSkill(x, true))))
    out.cursor = this.cursor
    out.headerSkills = raw(this.headerSkills)
    out.loopSkills = raw(this.loopSkills)
    out.normalSkills = guard(this.normalSkills)
    out.superSkill = this.superSkill === null ? null : cloneSkill(this.superSkill, true)
    return out
  }
}

// 对齐 oracle BuildPet 的每一笔: 先 (Pet)null 构造 (构造体整段跳过, 只剩字段初始化器 ⇒ deadCondition 是活的),
// 再挂 statusController (真构造) 与两个 controller (真构造, 容器给了才装), 最后写 stayTurn/chain 与"给了才写"的 anger。
class FakePet {
  constructor(spec) {
    const id = iv(spec, 'id', 10001)
    const maxHp = iv(spec, 'maxHp', 100)
    const hp = iv(spec, 'hp', maxHp)
    const anger = iv(spec, 'anger', 20)
    this.id = id
    // Capture (:95) 读 baseId==10 短路; 与 oracle 的 EnsurePetInfo(id).basic.baseId 同一条接缝 (缺省 0)。
    this._baseId = iv(spec, 'baseId', 0)
    this.statusController = new StatusController(Status.of6(0, 0, 0, 0, 0, maxHp), hp, anger)
    // 与 oracle 同一个公开方法做铺垫: 给 PowerUp 一个非零增幅起点, isSet 的 Set/Add 两支才分得开。
    if (has(spec, 'powerup')) this.statusController.setPowerUp(new Status(spec.powerup))
    // 与 oracle 同一条构造: element/subElement 取规格 (缺省 0), 印记给了才装 (给 null 走上游的静默分支)。
    this.buffController = new PetBuffController(iv(spec, 'el', 0), iv(spec, 'sel', 0), has(spec, 'buffs') ? buffsOf(spec, 'buffs') : null)
    // BattlePet.cs:61/75 —— 上游在构造后立刻 `{ parent = this }`, 于是 OnAddBuff/OnRemoveBuff 触发链把
    // `parent` 当 `CheckAndApply` 的第 5 参 (那是 **sourcePet**, 不是宿主实体) 端给效果,
    // `GetBattlePetTargetList` 的 `effect.sourcePet ?? lhsUnit.pet` 就落在**持有印记的那只宠**上。
    this.buffController.parent = this
    // 与 oracle 同一条方法、同一个时机 (构造**之后**): 已装袋的印记不会被追加的免疫表滤掉。
    if (has(spec, 'blockIds')) this.buffController.blockBuff(spec.blockIds.map((x) => Math.trunc(x)))
    // 第八段·批四: 另外四张表也走**真方法**铺垫 (与 oracle 逐条同序), 否则 block_buff 的
    // unblock*/uncopy* 四支没有起点可摘 —— 它们只做"摘除", 观测不到"摘对了没有"。
    if (has(spec, 'blockTypes')) this.buffController.blockBuffWithType(spec.blockTypes.map((x) => Math.trunc(x)))
    if (has(spec, 'sps')) for (const x of spec.sps) this.buffController.blockBuffWithString(x)
    if (has(spec, 'copyIds')) this.buffController.copyBuff(spec.copyIds.map((x) => Math.trunc(x)))
    if (has(spec, 'copyTypes')) this.buffController.copyBuffWithType(spec.copyTypes.map((x) => Math.trunc(x)))
    this.skillController = new FakeSkillController(spec)
    this.stayTurn = iv(spec, 'stayTurn', 0)
    this.chain = iv(spec, 'chain', 0)
    if (has(spec, 'anger')) this.statusController.anger = anger
  }

  // BattlePet.cs:25-27 —— 三个判定都转发到 controller; 空印记表 ⇒ mov=True, token=False。
  get isDead() { return this.battleStatus.hp <= 0 }      // deadCondition 的默认谓词
  get isMovable() { return this.buffController.isMovable }
  get isToken() { return this.buffController.getBuff(-21) !== null }

  get battleStatus() { return this.statusController.battleStatus }
  get buffs() { return this.buffController.buffs }
  get hp() { return this.statusController.hp }
  set hp(v) { this.statusController.hp = v }
  get maxHp() { return this.statusController.maxHp }
  set maxHp(v) { this.statusController.maxHp = v }
  get anger() { return this.statusController.anger }
  set anger(v) { this.statusController.anger = v }

  // BattlePet.cs:18-21 —— 元素**不是**宠的固有属性, 是 buffController 的两个字段 (场上印记会改它)。
  get battleElement() { return this.buffController.element }
  get subBattleElement() { return this.buffController.subElement }

  // 不进签名的表读值: 一律给常量, 谁把它们写进签名谁就是在拿假数据当 golden。
  get name() { return null }
  get level() { return 0 }
  get star() { return 0 }
  // baseId 不进签名 (SigPet 只打 #id), 但 Capture (:95) 要读它走短路; 由 spec 填, 缺省 0 (对齐 oracle 默认)。
  get baseId() { return this._baseId }

  // BattlePet.cs:357-368 —— chain 归零 → 替身直接回 → turn>1 才累加 stayTurn → buffController 倒数。
  // 最后一支 (`ReduceBuffTurn`) 是 state != null 的战斗路径, 移植体里还没接 (计划步骤 2/4),
  // 所以宠侧印记的倒数在这里是**有意缺省** —— 别让向量把 pet.buffs 交给 statedrive, 那会拍不出上游的倒数。
  onTurnStart(_thisUnit, state) {
    this.chain = 0
    if (this.isToken) return
    if (state.turn > 1) this.stayTurn += 1
  }

  // BattlePet.cs:333-354 —— 同 FakeSkillController: 规则在 core 的 petPowerUp 里, 这里只是宿主转发。
  powerUp(status, lhsUnit, state, isSet = false) { petPowerUp(this, status, lhsUnit, state, isSet) }

  // new BattlePet(rhs) (BattlePet.cs:82-94) —— 三个 controller 各新建一份, stayTurn/chain 直抄,
  // deadCondition 换一个**新委托** (指向同一个谓词)。
  clone() {
    const out = Object.create(FakePet.prototype)
    out.id = this.id
    out._baseId = this._baseId
    out.stayTurn = this.stayTurn
    out.chain = this.chain
    out.statusController = StatusController.fromCopy(this.statusController)
    out.buffController = PetBuffController.fromCopy(this.buffController)
    out.buffController.parent = out      // BattlePet.cs:92 —— 拷贝构造里 `{ parent = this }` 照样写
    out.skillController = this.skillController.clone()
    return out
  }
}

const buildPet = spec => new FakePet(spec ?? {})

// ── 六个 Build* ──────────────────────────────────────────────────────────
const petBagOf = (v, name, dfltLen) => (has(v, name) ? v[name].map(x => (x === null ? null : buildPet(x))) : new Array(dfltLen).fill(null))

function buildPetSystem(spec) {
  const bag = petBagOf(spec, 'petBag', 0)
  const sys = new UnitPetSystem(bag)
  // 三只袋子**同长**是上游不变式 (构造里一起 new, AddNewPet 一起扩容), oracle 的 Fit 同一条规则。
  const fit = name => {
    const src = petBagOf(spec, name, bag.length)
    if (src.length === bag.length) return src
    const out = new Array(bag.length).fill(null)
    for (let i = 0; i < Math.min(src.length, bag.length); i++) out[i] = src[i]
    return out
  }
  sys.backupPetBag = fit('backupPetBag')
  sys.tokenPetBag = fit('tokenPetBag')
  sys.cursor = iv(spec, 'cursor', 0)
  sys.specialChance = iv(spec, 'specialChance', 1)
  return sys
}

// 上游 UnitSkillSystem 的字段初始化器就是这里的缺省值 (weatherBuff/sameElementBuff/elementRelation 是 1,
// isHit 是 true); TS 侧的 ctor 先跑 onTurnStart() 归零, 与 oracle 的 Activator.CreateInstance 同一条路。
function buildSkillSystem(spec) {
  const k = new UnitSkillSystem()
  if (has(spec, 'damageDict')) k.damageDict = dictSI(spec, 'damageDict')
  if (has(spec, 'healDict')) k.healDict = dictSI(spec, 'healDict')
  if (has(spec, 'combo')) k.comboDamageInfoList = spec.combo.map(x => ({ damage: Math.trunc(x.damage), critical: Boolean(x.critical) }))
  for (const n of ['level', 'atk', 'def', 'weatherBuff', 'sameElementBuff', 'elementRelation'])
    if (has(spec, n)) k[n] = fv(spec, n, 0)
  for (const n of ['isCounter', 'isHit', 'isCritical'])
    if (has(spec, n)) k[n] = bv(spec, n, false)
  for (const n of ['skillDamage', 'skillHeal', 'skillOverHeal', 'itemDamage', 'itemHeal', 'itemOverHeal', 'buffDamage', 'buffHeal'])
    if (has(spec, n)) k[n] = iv(spec, n, 0)
  if (has(spec, 'skill')) k.skill = blankSkill(spec.skill)
  return k
}

// Skill.cs:84 `public Skill() { }` —— 空构造只剩字段初始化器: 数值全 0、串全 null,
// effects/options/referBuffList 是三个空容器, powerup/powerdown 是 Linear(one, zero)。
// 底用 noOpSkill 只为拿它那份**完整形状** (复合字段不必在这里重抄), 随后逐条复位成 ctor 默认;
// 规格给了才覆盖 —— 与 oracle 的 BlankSkill 同一条规则, 没给的字段两边都是上游默认。
// `buildSkillSystem` 的技能 stub 也走这里: 它以前拿 noOp 的 5/1/100 当底, 在 `sk=` 只打 X/- 的年代
// 看不出来, 一打出这四个字段就与上游 ctor 的 0 撞了个正着 —— 而它们正是 onChainStart 会回写的字段。
// id 默认 0 而非 noOp 的 -1: 上游那边是 `Activator.CreateInstance(Skill)`; getSkill(0) 两边都查不到
// (Database.cs:132 的 `id == 0` 短路), 所以"表没接"与"接到一张空表"在这里同形 —— 真有 id 的向量另外发。
function blankSkill(sp) {
  const s = noOpSkill(-1)
  for (const n of ['id', 'elementId', 'type', 'power', 'anger', 'pp', 'maxPP', 'accuracy', 'combo', 'chain', 'priority', 'vipriority']) s[n] = 0
  s.critical = 0
  for (const n of ['name', 'rawDescription', 'rawCostString']) s[n] = null
  s.options = new Map(); s.effects = []; s.referBuffList = []
  s.isSecondSuper = false; s.ignoreShield = false
  s.isAction = isActionSkill(s.type)
  for (const n of ['id', 'elementId', 'power', 'anger', 'pp', 'maxPP', 'accuracy', 'combo', 'chain', 'priority', 'vipriority'])
    if (has(sp, n)) s[n] = Math.trunc(sp[n])
  if (has(sp, 'type')) { s.type = Math.trunc(sp.type); s.isAction = isActionSkill(s.type) }
  if (has(sp, 'critical')) s.critical = f(sp.critical)
  if (has(sp, 'name')) s.name = sp.name
  if (bv(sp, 'isSecondSuper', false)) s.isSecondSuper = true
  if (bv(sp, 'optionsNull', false)) s.options = null
  else {
    if (has(sp, 'sourceIndex')) s.options.set('source_index', String(sp.sourceIndex))
    if (has(sp, 'options')) for (const [k, v] of Object.entries(sp.options)) s.options.set(k, String(v))
  }
  return s
}

function buildUnit(spec) {
  const u = Object.create(Unit.prototype)
  u.id = iv(spec, 'id', 1)
  u.random = iv(spec, 'random', 0)
  u.parallelCount = iv(spec, 'parallelCount', 1)
  u.isDone = bv(spec, 'isDone', false)
  u.petSystem = buildPetSystem(sub(spec, 'petSystem'))
  u.parallelSkillSystems = has(spec, 'skillSystems')
    ? spec.skillSystems.map(buildSkillSystem)
    : [new UnitSkillSystem()]
  // hudSystem/cardSystem 是围栏 (移植体不带这两个字段), 所以 Mutate/签名都不碰它们。
  u.unitBuffs = buffsOf(spec, 'unitBuffs')
  u.randomSource = { nextInt: (a, b) => a, next: () => 0 }
  return u
}

function buildSettings(spec) {
  // 缺省值取 BattleSettings.cs 字段初始化器那一列, 与 oracle BuildSettings 逐条同。
  const s = new BattleSettings()
  s.seed = iv(spec, 'seed', 0)
  s.isMod = bv(spec, 'isMod', false)
  s.isSimulate = bv(spec, 'isSimulate', false)
  s.isEscapeOK = bv(spec, 'isEscapeOK', true)
  s.isCaptureOK = bv(spec, 'isCaptureOK', false)
  s.isItemOK = bv(spec, 'isItemOK', true)
  s.captureLevel = iv(spec, 'captureLevel', 1)
  s.petCount = iv(spec, 'petCount', 6)
  s.parallelCount = iv(spec, 'parallelCount', 1)
  s.starLimit = iv(spec, 'starLimit', 0)
  s.filterLimit = sv(spec, 'filterLimit')
  s.filterLimitDesc = sv(spec, 'filterLimitDesc')
  s.time = iv(spec, 'time', 10)
  s.bgm = sv(spec, 'bgm')
  s.modeId = iv(spec, 'modeId', 0)
  s.ruleId = iv(spec, 'ruleId', 0)
  s.weather = iv(spec, 'weather', 0)
  s.initBuffExpr = sv(spec, 'initBuffExpr')
  return s
}

function buildResult(spec, settings) {
  const r = new BattleResult(settings)
  if (has(spec, 'state')) r.state = Math.trunc(spec.state)
  if (has(spec, 'cursors')) r.fightPetCursors = new Set(spec.cursors.map(x => Math.trunc(x)))
  return r
}

function buildState(spec) {
  const s = Object.create(BattleState.prototype)
  s.turn = iv(spec, 'turn', 0)
  s.parallelTurn = iv(spec, 'parallelTurn', 0)
  s.whosTurn = iv(spec, 'whosTurn', 0)
  s.phase = iv(spec, 'phase', 0)
  s.weather = iv(spec, 'weather', 0)
  s.options = dictSS(spec, 'options')
  s.reports = has(spec, 'reports') ? [...spec.reports] : []
  s.stateBuffs = has(spec, 'stateBuffs') ? spec.stateBuffs.map(x => [x.key, buffOf(x.buff)]) : []
  s.actionOrder = intsOf(spec, 'actionOrder')
  s.actionCursor = iv(spec, 'actionCursor', -1)
  s.settings = buildSettings(sub(spec, 'settings'))
  s.result = buildResult(sub(spec, 'result'), s.settings)
  s.masterUnit = buildUnit(sub(spec, 'master'))
  s.clientUnit = buildUnit(sub(spec, 'client'))
  s.lastTurnState = has(spec, 'last') ? buildState(spec.last) : null
  return s
}

// ── 签名 (与 oracle 的 Sig* 逐字符同) ────────────────────────────────────
const sigBuff = b => b === null || b === undefined ? '-'
  : `b${STR(b.id)}:${STR(b.turn)}:${STR(b.value)}:${[...b.options].map(([k, x]) => `${k}=${x}`).join('&')}`

// 尾巴的 init/add/mult/pw/cur/bf 六段 = 算子本体的落点 (与 oracle SigPet 逐字符同, 见那侧注释)。
const sigPet = p => p === null || p === undefined ? '_'
  : `p${cs(p.stayTurn)}|${cs(p.chain)}|#${cs(p.id)}|hp${p.hp}/${p.maxHp}` +
    `|ang${p.anger}(${p.statusController.minAnger}~${p.statusController.maxAnger})` +
    `|dead=${cs(p.isDead)}|mov=${cs(p.isMovable)}|token=${cs(p.isToken)}|n=${LEN(p.buffController.buffs)}` +
    `|init=${SS(p.statusController.initStatus)}|add=${SS(p.statusController.addStatus)}|mult=${SS(p.statusController.multStatus)}` +
    `|hid=${SS(p.statusController.hiddenStatus)}|pw=${SS(p.statusController.powerup)}|cur=${SS(p.statusController.currentStatus)}` +
    `|bf[${p.buffController.buffs.map(sigBuff).join('&')}]` +
    // 第八段·批四: 五个免疫/复制表 —— 与 oracle SigPet 的 `|B[..]|BT[..]|C[..]|CT[..]|S<..>` 逐字符同形
    // (BuffType 在 JS 是数字、Convert.ToInt32(BuffType) 也是数字 ⇒ 直接 join('/') 就对得上)。
    `|B[${p.buffController.blockBuffIds.join('/')}]|BT[${p.buffController.blockBuffTypes.join('/')}]` +
    `|C[${p.buffController.copyBuffIds.join('/')}]|CT[${p.buffController.copyBuffTypes.join('/')}]` +
    `|S<${[...p.buffController.blockBuffSps].map(([k, v]) => `${k}=${v}`).join('&')}>`

const sigPetSys = sys => sys === null || sys === undefined ? 'Y-'
  : `Y|cur=${cs(sys.cursor)}|chance=${cs(sys.specialChance)}` +
    `|bag[${sys.petBag.map(sigPet).join(',')}]|bak[${sys.backupPetBag.map(sigPet).join(',')}]|tok[${sys.tokenPetBag.map(sigPet).join(',')}]` +
    `|num=${cs(sys.petNum)}|alive=${cs(sys.alivePetNum)}|dead=${cs(sys.deadPetNum)}`

const sigSkillSys = k => k === null || k === undefined ? 'K-'
  : `K|${FS(k.level)}|${FS(k.atk)}|${FS(k.def)}|${FS(k.weatherBuff)}|${FS(k.sameElementBuff)}|${FS(k.elementRelation)}` +
    `|${cs(k.isCounter)}/${cs(k.isHit)}/${cs(k.isCritical)}` +
    `|d<${[...k.damageDict].map(([a, b]) => `${a}=${b}`).join('&')}>|h<${[...k.healDict].map(([a, b]) => `${a}=${b}`).join('&')}>` +
    `|${k.skillDamage}/${k.skillHeal}/${k.skillOverHeal}` +
    `|${k.itemDamage}/${k.itemHeal}/${k.itemOverHeal}` +
    `|${k.buffDamage}/${k.buffHeal}|combo${LEN(k.comboDamageInfoList)}` +
    // sk= 的四列是 ChainStart 从**技能表**回写的值 (views.ts 的 getSkill 接缝) ⇒ 表接没接、
    // 接的是不是同一行, 全在这四列上。与 oracle 的 SkillFields 逐字同形。
    `|sk=${(k.skill === null || k.skill === undefined) ? '-' : skillFields(k.skill)}` +
    `|ct=${k.counterSkill === null || k.counterSkill === undefined ? '-' : 'X'}`
// 与 oracle 的 SkillFields 逐字符同形 (批二起从"四列"扩成"整只技能"): 写侧证据 (`wsk:`) 要读回的
// 名字/怒气/PP 夹紧/优先级/element/三个 ignore/效果条数与 source 回指/options 全在这一行。
// ⚠ options 的值走 OPTV 按 float **读回**再打, 不能比原始串 —— 上游落 C# `float.ToString()`、
//   镜像落 JS `String(fround(v))`, 同一个 32 位值可以有 "1E+07" 与 "10000000" 两种文本 (.NET 的
//   指数写法是 E+07/E-07, JS 是 e+7/e-7, 切换阈值也不同)。比原始串会把写入正确的向量拍成红。
const OPTV = (v) => { const x = tryParseFloat(v); return x === null ? v : FS(x) }
const skillFields = (s) => {
  const srcSelf = s.effects.filter((x) => x !== null && x !== undefined && x.source === s).length
  const opts = s.options === null || s.options === undefined ? '-'
    : [...s.options].map(([k, v]) => `${k}=${OPTV(v)}`).join('&')
  return `#${cs(s.id)}:${cs(s.type)}/${FS(s.critical)}/${cs(s.combo)}/${cs(s.accuracy)}/${cs(s.power)}`
    + `|nm=${STR(s.name)}|rd=${STR(s.rawDescription)}`
    + `|a${cs(s.anger)}|pp${cs(s.pp)}/${cs(skillPP(s))}/${cs(s.maxPP)}`
    + `|pr${cs(s.priority)}/${cs(s.vipriority)}|el${cs(s.elementId)}`
    + `|ig${cs(s.ignoreShield)}/${cs(powerupIgnored(s))}/${cs(powerdownIgnored(s))}`
    + `|pu=${LIN(s.powerup)}|pd=${LIN(s.powerdown)}`
    + `|ef${s.effects.length}/${srcSelf}`
    + `|o<${opts}>`
}

const sigUnit = u => u === null || u === undefined ? 'U-'
  : `U|${cs(u.id)}|${cs(u.random)}|pc=${cs(u.parallelCount)}|done=${cs(u.isDone)}` +
    `|${sigPetSys(u.petSystem)}` +
    `|K[${u.parallelSkillSystems.map(sigSkillSys).join(',')}]` +
    `|B[${u.unitBuffs.map(sigBuff).join('~')}]`

const sigSettings = s => `T|${s.seed}|${cs(s.isMod)}|${cs(s.isSimulate)}|${cs(s.isEscapeOK)}|${cs(s.isCaptureOK)}|${cs(s.isItemOK)}` +
  `|cap${s.captureLevel}|pet${s.petCount}|par${s.parallelCount}|star${s.starLimit}` +
  `|f=${STR(s.filterLimit)}|fd=${STR(s.filterLimitDesc)}|t=${s.time}|bgm=${STR(s.bgm)}` +
  `|mode=${s.modeId}|rule=${s.ruleId}|weather=${s.weather}|init=${STR(s.initBuffExpr)}`

// C# 那边是 HashSet<int> 的枚举序, 这里刻意用 JS Set 的**插入序**去撞它 —— 撞得上说明
// 这一层的顺序不依赖桶, 撞不上就把它记成"不能依赖"。两边都是原样打, 不做排序。
const sigResult = r => `R|${EI(r.state)}|[${[...r.fightPetCursors].join(',')}]|cap=${r.capturePet === null ? '-' : 'X'}`

const sigState = s => s === null || s === undefined ? 'S-'
  : `S|${s.turn}|${s.parallelTurn}|${s.whosTurn}|${EI(s.phase)}|${s.weather}` +
    `|o<${[...s.options].map(([k, x]) => `${k}=${x}`).join('&')}>` +
    `|B<${s.stateBuffs.map(([k, b]) => `${k}=${sigBuff(b)}`).join('~')}>|r[${s.reports.join('~')}]` +
    `|ord[${s.actionOrder.join(',')}]|ac=${cs(s.actionCursor)}` +
    `|${sigSettings(s.settings)}|${sigResult(s.result)}` +
    `|M${sigUnit(s.masterUnit)}|C${sigUnit(s.clientUnit)}|L${sigState(s.lastTurnState)}`

// EffectHandler.queue 是 private, 运行时照常可读; pair[0] 是 invokeUnit (Unit 或 null)。
const sigHandler = h => h.queue.map(([unit, effect]) =>
  `${unit === null || unit === undefined ? '-' : STR(unit.id)}=${effect.getRawEffectStringArray().join('|')}`).join(';')

const buffsSig = unit => unit.unitBuffs.map(sigBuff).join('~')

// ── Mutate: 只改副本, 原帧与副本一起打 ⇒ 任何一档深浅拷漏了都会露出来 ──────
function mutate(s) {
  s.turn = 9991; s.parallelTurn = 7; s.whosTurn = -1
  s.phase = 1; s.weather = 3; s.actionCursor = 5
  s.options.set('mk', '1')
  s.actionOrder.push(-2)
  s.reports.push('RX')
  if (s.stateBuffs.length > 0) s.stateBuffs[0][1].turn = 42
  for (const unit of [s.masterUnit, s.clientUnit]) {
    if (unit === null || unit === undefined) continue
    unit.random = 111; unit.isDone = true
    const ps = unit.petSystem
    ps.cursor = 2; ps.specialChance = 9
    const p = ps.petBag.length > 0 ? ps.petBag[0] : null
    if (p !== null && p !== undefined) {
      p.stayTurn = 42
      p.anger = 57
      const buffs = p.buffController.buffs
      if (buffs.length > 0) buffs[0].turn = 33
      ps.tokenPetBag[0] = null
    }
    const sk = unit.parallelSkillSystems
    if (sk.length > 0 && sk[0] !== null && sk[0] !== undefined) {
      const k = sk[0]
      k.level = f(1.5); k.skillDamage = 11; k.isHit = false
      k.damageDict.set('mkd', 7)
      k.comboDamageInfoList.push({ damage: 3, critical: true })
    }
    if (unit.unitBuffs.length > 0) unit.unitBuffs[0].turn = 66
  }
  s.settings.time = 99
  s.result.state = 1
  s.result.fightPetCursors.add(9)
}

const unitId = u => (u === null || u === undefined) ? '-' : STR(u.id)

// ── 每个 kind 的镜像求值 (与 oracle 的 <Kind>Vector 一一对应) ──────────────
function mineStatecopy(v) {
  const sp = v.spec
  const st = buildState(sp)
  switch (v.op) {
    case 'sig': return sigState(st)
    case 'copy': return [sigState(st), sigState(BattleState.from(st))]
    case 'mutate': {
      const cp = BattleState.from(st)
      mutate(cp)
      return [sigState(st), sigState(cp)]
    }
    // 真构造那条路: BattleState(settings, master, client) —— 两个 Unit 走拷贝构造, result 现建。
    case 'ctor': return sigState(new BattleState(buildSettings(sub(sp, 'settings')), buildUnit(sub(sp, 'master')), buildUnit(sub(sp, 'client'))))
    default: throw new Error('未知 statecopy op: ' + v.op)
  }
}

const mineStateid = v => {
  const st = buildState(v.spec)
  return v.ids.map(id => norm(st.getStateIdentifier(id)))
}

function mineStateset(v) {
  const st = buildState(v.spec)
  const log = v.writes.map(([id, val]) => { st.setStateIdentifier(id, f32v(val)); return sigState(st) })
  return [log, v.ids.map(id => norm(st.getStateIdentifier(id))), sigState(st)]
}

function mineStateflag(v) {
  const st = buildState(v.spec)
  const outp = [
    `done=${cs(st.isAllUnitDone)}`, `ready=${cs(st.isAllUnitReady)}`,
    `atk=${unitId(st.atkUnit)}`, `def=${unitId(st.defUnit)}`,
    `my=${unitId(st.myUnit)}`, `op=${unitId(st.opUnit)}`,
    `wb=${sigBuff(st.weatherBuff)}`,
  ]
  if (has(v, 'ids')) for (const id of v.ids) outp.push(`g${id}=${unitId(st.getUnitById(id))}`)
  if (has(v, 'rhs')) for (const id of v.rhs) outp.push(`r${id}=${unitId(st.getRhsUnitById(id))}`)
  const names = ['masterUnit', 'clientUnit']
  for (let i = 0; i < names.length; i++) {
    const unit = [st.masterUnit, st.clientUnit][i]
    if (unit === null || unit === undefined) continue
    outp.push(`${names[i]}:master=${cs(unit.isMasterUnit())}|ready=${cs(unit.isReady)}|mov=${cs(unit.isMovable)}` +
      `|pet=${sigPet(unit.pet)}|token=${sigPet(unit.token)}|sys=${sigSkillSys(unit.skillSystem)}`)
  }
  return outp
}

function mineGiveturn(v) {
  const st = buildState(v.spec)
  const outp = []
  const C = u => (u === null || u === undefined) ? '-' : `${u.petSystem.cursor}:${cs(u.isDone)}`
  for (let i = 0; i < v.n; i++) {
    st.giveTurnToNextUnit()
    outp.push(`${st.whosTurn}|${st.actionCursor}|m${C(st.masterUnit)}|c${C(st.clientUnit)}`)
  }
  outp.push(sigState(st))
  return outp
}

function mineGofirst(v) {
  const st = buildState(v.spec)
  return [
    `mf=${cs(st.isGoFirst(st.masterUnit))}`, `ml=${cs(st.isGoLast(st.masterUnit))}`,
    `cf=${cs(st.isGoFirst(st.clientUnit))}`, `cl=${cs(st.isGoLast(st.clientUnit))}`,
  ]
}

function minePetbag(v) {
  const sp = v.spec
  const op = v.op
  if (op === 'shallow') {
    const bag = petBagOf(sp, 'petBag', 0)
    const sys = new UnitPetSystem(bag)
    const inner = sys.petBag
    if (bag.length > 0 && bag[0] !== null) bag[0].stayTurn = 42
    const same0 = bag.length > 0 && bag[0] === inner[0]
    const bakSame = sys.backupPetBag === bag
    if (bag.length > 0) bag[0] = null
    const after = inner.length > 0 && inner[0] !== null ? STR(inner[0].stayTurn) : '-'
    return `arrSame=${cs(bag === inner)}|petSame=${cs(same0)}|bakSame=${cs(bakSame)}|afterNull=${after}|len=${inner.length}|${sigPetSys(sys)}`
  }
  if (op === 'deep') {
    const sys = buildPetSystem(sp)
    const cp = UnitPetSystem.from(sys)
    const ob = sys.petBag, cb = cp.petBag
    if (ob.length > 0 && ob[0] !== null) ob[0].stayTurn = 5
    if (cb.length > 0 && cb[0] !== null) cb[0].stayTurn = 42
    return `arrSame=${cs(ob === cb)}|petSame=${cs(ob.length > 0 && ob[0] === cb[0])}|orig=${sigPetSys(sys)}|copy=${sigPetSys(cp)}`
  }
  const s = buildPetSystem(sp)
  if (op.startsWith('swapBackup:')) { const i = parseInt(op.slice(11), 10); return `${cs(s.swapBackupPet(i))}|${sigPetSys(s)}` }
  if (op.startsWith('swapToken:')) { const i = parseInt(op.slice(10), 10); return `${cs(s.swapTokenPet(i))}|${sigPetSys(s)}` }
  if (op.startsWith('nextCursor:')) return STR(s.getNextCursorCircular(parseInt(op.slice(11), 10), null, null))
  if (op.startsWith('parallel:')) {
    const n = parseInt(op.slice(9), 10)
    return `${s.getParallelPetBag(n).map(sigPet).join(',')}#${s.getParallelPetBagCursor(n).join(',')}`
  }
  if (op.startsWith('ident:')) return norm(s.getPetSystemIdentifier(op.slice(6)))
  if (op.startsWith('tryident:')) { const r = s.tryGetPetSystemIdentifier(op.slice(9)); return { ok: r.ok, num: norm(r.num) } }
  if (op.startsWith('cursor:')) { s.cursor = parseInt(op.slice(7), 10); return sigPetSys(s) }
  if (op.startsWith('setsc:')) { s.specialChance = parseInt(op.slice(6), 10); return sigPetSys(s) }
  switch (op) {
    case 'sig': return sigPetSys(s)
    case 'pet': return sigPet(s.pet)
    case 'token': return sigPet(s.token)
    case 'refresh': s.refreshStayTurn(); return sigPetSys(s)
    case 'addNewPet': s.addNewPet(buildPet(v.pet)); return sigPetSys(s)
    default: throw new Error('未知 petbag op: ' + op)
  }
}

function mineSkillsys(v) {
  const sp = v.spec, op = v.op
  if (op === 'copy') {
    const k = buildSkillSystem(sp)
    const cp = UnitSkillSystem.from(k)
    cp.damageDict.set('mkd', 7)
    cp.comboDamageInfoList.length = 0
    cp.skillDamage = 123
    return `${sigSkillSys(k)}||${sigSkillSys(cp)}`
  }
  const sys = buildSkillSystem(sp)
  if (op.startsWith('ident:')) return norm(sys.getSkillSystemIdentifier(op.slice(6)))
  if (op.startsWith('tryident:')) { const r = sys.tryGetSkillSystemIdentifier(op.slice(9)); return { ok: r.ok, num: norm(r.num) } }
  if (op.startsWith('set:')) {
    const body = op.slice(4), i = body.indexOf('=')
    const key = body.slice(0, i)
    const n = body.slice(i + 1).includes(':') ? body.slice(i + 1).split(':') : [body.slice(i + 1), null]
    sys.setSkillSystemIdentifier(key, f(parseFloat(n[0])), n[1])
    return `${norm(sys.getSkillSystemIdentifier(key))}|${sigSkillSys(sys)}`
  }
  // 批二: 直接对着 spec.skill 这只技能写一把键、再从读侧链与整只签名两处取回 (与 oracle 的 wsk: 同一条调用序列)。
  if (op.startsWith('wsk:')) {
    const body = op.slice(4), i = body.indexOf('=')
    const key = body.slice(0, i)
    const val = f(parseFloat(body.slice(i + 1)))
    const sk = sys.skill
    if (sk === null || sk === undefined) throw new Error('wsk 向量必须给 spec.skill (技能位为空 ⇒ 没有写对象)')
    setSkillIdentifier(sk, key, val)
    // 结构化两格 (与 oracle 同形): `v` 可能是 float.MinValue, 拼字符串会把 Single.ToString 的
    // "…E+38" 与 JS 的 "…e+38" 这种**文本差**当成分歧 (口径同 tryident 的 NumOut)。
    return { sig: skillFields(sk), v: getSkillIdentifier(sk, key) }
  }
  switch (op) {
    case 'sig': return sigSkillSys(sys)
    case 'onTurnStart': sys.onTurnStart(); return sigSkillSys(sys)
    case 'onChainStart': sys.onChainStart(); return sigSkillSys(sys)
    case 'swap:true': sys.swapCounterSkill(true); return sigSkillSys(sys)
    case 'swap:false': sys.swapCounterSkill(false); return sigSkillSys(sys)
    case 'totals': return [sys.totalSkillDamage, sys.totalItemDamage, sys.totalBuffDamage,
      sys.totalSkillHeal, sys.totalItemHeal, sys.totalBuffHeal, sys.damage, sys.heal,
      sys.skillDamageClamped, sys.itemDamageClamped, sys.buffDamageClamped]
    case 'typeDamage': return [sys.getTypeDamage(k => k.startsWith('skill')), sys.getTypeHeal(k => k.startsWith('item'))]
    default: throw new Error('未知 skillsys op: ' + op)
  }
}

function mineSettings(v) {
  const op = v.op
  const s = buildSettings(v.spec)
  const initSig = () => s.initBuffs.map(([k, b]) => `${k}=${sigBuff(b)}`).join('~')
  if (op === 'copy') {
    const cp = BattleSettings.from(s)
    cp.time = 77
    return `${sigSettings(s)}||${sigSettings(cp)}`
  }
  if (op.startsWith('ident:')) return norm(s.getSettingsIdentifier(op.slice(6)))
  if (op.startsWith('setmode:')) { s.modeId = parseInt(op.slice(8), 10); return `${sigSettings(s)}|${cs(s.isPVP)}|${cs(s.isAutoOK)}|${cs(s.isLimited)}` }
  if (op.startsWith('setrule:')) { s.ruleId = parseInt(op.slice(8), 10); return sigSettings(s) }
  if (op.startsWith('setweather:')) { s.weather = parseInt(op.slice(11), 10); return sigSettings(s) }
  if (op.startsWith('setinit:')) { s.initBuffExpr = op.slice(8); return `${initSig()}|${sigSettings(s)}` }
  switch (op) {
    case 'sig': return sigSettings(s)
    case 'flags': return `${cs(s.isPVP)}|${cs(s.isAutoOK)}|${cs(s.isLimited)}`
    case 'initBuffs': return initSig()
    default: throw new Error('未知 settings op: ' + op)
  }
}

function mineResult(v) {
  const op = v.op
  const settings = buildSettings(sub(v.spec, 'settings'))
  const r = buildResult(v.spec, settings)
  if (op === 'copy') {
    const cp = BattleResult.from(r)
    cp.fightPetCursors.add(9)
    return `${sigResult(r)}||${sigResult(cp)}`
  }
  if (op.startsWith('ident:')) return norm(r.getResultIdentifier(op.slice(6)))
  if (op.startsWith('state:')) {
    const st = parseInt(op.slice(6), 10)
    r.setState(st)
    return `${sigResult(r)}|end=${cs(r.isBattleEnd)}|ko=${cs(r.isKO)}|esc=${cs(r.isEscape)}|cap=${cs(r.isCapture)}|mywin=${cs(r.isMyWin)}|opwin=${cs(r.isOpWin)}`
  }
  if (op.startsWith('addcursor:')) {
    // 上游是 `public void AddFightPetCursor(int)` ⇒ oracle 那个位置恒为 null 的打印 "-"。
    // 加没加进去由后面的 sigResult 兜住, 不需要 (也不该) 在这里补一个 HashSet.Add 的 bool。
    r.addFightPetCursor(parseInt(op.slice(10), 10))
    return `-|${sigResult(r)}`
  }
  switch (op) {
    case 'sig': return sigResult(r)
    case 'flags': return `${cs(r.isBattleEnd)}|${cs(r.isKO)}|${cs(r.isEscape)}|${cs(r.isCapture)}|${cs(r.isMyWin)}|${cs(r.isOpWin)}`
    default: throw new Error('未知 result op: ' + op)
  }
}

function mineEffectq(v) {
  const st = buildState(v.spec)
  const addSkill = has(v, 'addSkill') ? Boolean(v.addSkill) : true
  switch (v.op) {
    case 'all': return sigHandler(st.getEffectHandler(null, true))
    case 'allNoskill': return sigHandler(st.getEffectHandler(null, false))
    case 'master': return sigHandler(st.getEffectHandler(st.masterUnit, addSkill))
    case 'client': return sigHandler(st.getEffectHandler(st.clientUnit, addSkill))
    default: throw new Error('未知 effectq op: ' + v.op)
  }
}

// oracle 的 Phase(): Uninit Player/Battle/BattleManager 注进两个单例, battle.currentState 指向本向量的 st。
// Battle.settings 是算属性 (Battle.cs:13 currentState?.settings) ⇒ 镜像同形状; ui 三条回调在
// phaseq 的调用链里不可达 (GetEffectHandler 不碰 UI), 空实现只为让接缝类型闭合。
let PHASE_HOST = null
setPhaseBattle(() => PHASE_HOST)
const makePhaseHost = (st) => ({
  get settings() { return this.currentState === null ? null : this.currentState.settings },
  currentState: st,
  lastState: null,
  autoSkillOrder: null,
  ui: { setState: () => {}, processQuery: () => {}, stopTimer: () => {} },
})

function minePhaseq(v) {
  const op = v.op
  // 裸 base 实例 (无 state): getter 兜 None、setter 静默 —— oracle 那边 Activator.CreateInstance 同形状。
  if (op === 'getphN' || op === 'setphN') {
    const q = new BattlePhase()
    if (op === 'setphN') q.phase = iv(v, 'n', 5)
    return EI(q.phase)
  }
  const st = buildState(v.spec)
  PHASE_HOST = makePhaseHost(st)
  const p = new BattlePhase()
  p.state = st
  const addSkill = has(v, 'addSkill') ? Boolean(v.addSkill) : true
  // Out 在调用**之后**才读 phase (oracle 的参数求值序如此), 模板串的求值序与 C# 一致。
  const Out = (h) => `ph=${EI(p.phase)}|${sigHandler(h)}|${sigState(st)}`
  switch (op) {
    case 'all': return Out(p.getEffectHandler(null, addSkill))
    case 'master': return Out(p.getEffectHandler(st.masterUnit, addSkill))
    case 'client': return Out(p.getEffectHandler(st.clientUnit, addSkill))
    case 'getph': return EI(p.phase)
    case 'setph': { p.phase = iv(v, 'n', 0); return `${EI(p.phase)}#${EI(st.phase)}` }
    default: throw new Error('未知 phaseq op: ' + op)
  }
}

const PHASE_CLASSES = {
  BattleStartPhase, RoundStartPhase, TurnStartPhase, TurnReadyPhase, DecidePriorityPhase,
  BeforeAttackPhase, DamageCalculatePhase, AttackPhase, AfterAttackPhase, TurnEndPhase,
  AttackEndPhase, BattleEndPhase, PassivePetChangePhase,
}

// oracle 的 PhaseDriveVector 世界: BattleManager 是 Uninit ⇒ systemView 为 null,
// ProcessQuery 队列非空时 Dequeue 后第一句 systemView.SetState 必 NRE, StopTimer 直接 NRE。
// 空队且 currentUIState==null ⇒ 静默 return (注入世界里 currentUIState 永远进不了非 null:
// SetCurrentUIState 的赋值点在抛错之后)。
function makeDriveHost(st, autoOrder) {
  const ui = {
    queue: [],
    setState(last, cur) { if (last === null) this.queue.push(null); this.queue.push(cur) },
    processQuery() {
      if (ui.queue.length <= 0) return
      ui.queue.shift()   // 上游确实 Dequeue 了才抛; 抛向量的输出被丢, 后续条目不可见
      throw new TypeError('NRE: systemView is null (BattleManager.ProcessQuery → SetCurrentUIState)')
    },
    stopTimer() { throw new TypeError('NRE: systemView is null (BattleManager.StopTimer)') },
  }
  return {
    get settings() { return this.currentState === null ? null : this.currentState.settings },
    currentState: st,
    lastState: null,
    autoSkillOrder: autoOrder,
    ui,
    currentPhase: null,
  }
}

function minePhaseDrive(v) {
  const [verb, clsName] = String(v.op).split(':')
  const isDriveN = verb === 'drive' && clsName === 'N'
  const Cls = PHASE_CLASSES[clsName]
  if (!Cls && !isDriveN) throw new Error('未知 phase 类: ' + clsName)
  const st = has(v, 'spec') ? buildState(v.spec) : null
  const host = makeDriveHost(st, has(v, 'autoOrder') ? v.autoOrder.map(x => Math.trunc(x)) : null)
  PHASE_HOST = host
  const Ps = (ph) => sigState(ph.state)
  // recordState/UIState 只有 PassivePetChangePhase 有 —— 其余类打 '-' (字段不存在, 不是 null)。
  const recUi = (ph) => `|rec=${'recordState' in ph ? sigState(ph.recordState) : '-'}|ui=${'UIState' in ph ? sigState(ph.UIState) : '-'}`
  const qs = (stNow) => host.ui.queue.map(e => (e === null ? 'N' : e === stNow ? 'p' : e === host.currentState ? 'c' : 'o')).join(',')

  // drive: Battle.NextPhase() 真循环 (Battle.cs:249-277)
  if (verb === 'drive') {
    host.currentPhase = isDriveN ? null : new Cls()
    battleNextPhase(host)
    const fin = host.currentPhase
    return `ph=${fin === null ? 'N' : fin.constructor.name}|last=${sigState(host.lastState)}|cur=${sigState(host.currentState)}`
  }

  const p = new Cls()
  if (verb === 'ctor') return `ph=${EI(p.phase)}|pstate=${Ps(p)}|cur=${sigState(host.currentState)}${recUi(p)}`
  if (verb === 'next') {
    const n = p.getNextPhase()
    const tail = `|last=${sigState(host.lastState)}|cur=${sigState(host.currentState)}|Q=[${qs(p.state)}]${recUi(p)}`
    if (n === null) return `ph0=${EI(p.phase)}|pstate0=${Ps(p)}|n=N${tail}`
    return `ph0=${EI(p.phase)}|pstate0=${Ps(p)}|n=${n.constructor.name}|ph=${EI(n.phase)}|pstate=${Ps(n)}${tail}`
  }
  if (verb === 'dowork') {
    p.doWork()
    return `ph=${EI(p.phase)}|pstate=${Ps(p)}|Q=[${qs(p.state)}]|cur=${sigState(host.currentState)}${recUi(p)}`
  }
  throw new Error('未知 phasedrive verb: ' + verb)
}

function mineStatedrive(v) {
  const st = buildState(v.spec)
  const op = v.op
  const n = has(v, 'n') ? Math.trunc(v.n) : 1
  const outp = []
  if (op === 'petturn') {
    for (let i = 0; i < n; i++) {
      for (const unit of [st.masterUnit, st.clientUnit]) unit.petSystem.onTurnStart(unit, st)
      st.turn += 1
      outp.push(`t${st.turn}|m${sigPetSys(st.masterUnit.petSystem)}|c${sigPetSys(st.clientUnit.petSystem)}`)
    }
    return outp
  }
  if (op === 'unitturn') {
    for (let i = 0; i < n; i++) {
      for (const unit of [st.masterUnit, st.clientUnit]) unit.reduceBuffTurn(has(v, 'identifier') ? v.identifier : 'turn')
      outp.push(`m[${buffsSig(st.masterUnit)}]|c[${buffsSig(st.clientUnit)}]`)
    }
    return outp
  }
  if (op === 'addbuff') {
    for (const b of v.buffs) {
      const ret = st.masterUnit.addBuff(buffOf(b))
      outp.push(`add=${cs(ret)}|${buffsSig(st.masterUnit)}`)
    }
    return outp
  }
  if (op === 'chainstart') {
    for (let i = 0; i < n; i++) {
      st.masterUnit.onChainStart()
      outp.push(sigSkillSys(st.masterUnit.skillSystem))
    }
    return outp
  }
  throw new Error('未知 statedrive op: ' + op)
}

// ── effectident (第五段·步骤0): 带 effect 上下文的标识符链 ────────────────
// 镜像世界与 oracle EffectIdentVector 逐笔同: BuildState 拼的 state 既当 lhs/rhs 的来源, 也经
// setIdentifierBattle 当成 `state.` 支的 battle.currentState (oracle 那边是 PhaseBattle.currentState)。
// idSource 的 switch 五支由 effect.source 驱动 ⇒ src 决定塞进去的对象; src=petmodel(裸 Pet) 不发,
// 因为它的 TryGetPetIdentifier 读宠表, 而两边的宠表都是空的 (口径同 Boot.cs:99 的合成 PetInfo)。
// 效果表用**同一份** effects.json (上游 effectDict 的镜像), 与 difftest 的 S3 段同源。
const MIRROR_EFFECTS = new PrefabTable(JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/effects.json'), 'utf8')).prefabs)

// 技能表**懒建**: JsonSkillTable 的构造会走 setSkillEffects ⇒ 要等 difftest 把效果表注进来 (setEffectTable)
// 之后再装, 否则常驻壳展开时查不到预制体。模块顶层比 difftest 的 body 先跑, 所以不能在这里 new。
const SKILL_ROWS = JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/skills.json'), 'utf8')).skills
let SKILL_TABLE = null
export const skillTable = () => (SKILL_TABLE ??= new JsonSkillTable(SKILL_ROWS))

const identSource = (st, name, v) => name === 'pet' ? st.masterUnit.pet
  : name === 'unit' ? st.masterUnit
  : name === 'buff' ? buffOf(v.buff)
  : name === 'skill' ? blankSkill(v.skill)
  : name === 'none' ? null
  : (() => { throw new Error(`MissingMemberException: 镜像不认的 effectident src ${name}`) })()

function mineEffectident(v) {
  const st = buildState(v.spec)
  setIdentifierBattle(() => ({ currentState: st }))
  const eff = has(v, 'dsl') ? Effect.parse(v.dsl, MIRROR_EFFECTS)[iv(v, 'ei', 0)] : null
  const src = identSource(st, sv(v, 'src', 'none'), v)
  if (eff !== null) {
    eff.source = src
    // `me.` 支的 otherSource 读的是 effect.sourcePet (CheckAndApply 的第 5 参), 与 source 是两个字段。
    if (has(v, 'sp')) eff.sourcePet = identSource(st, v.sp, v)
  }
  const osrc = has(v, 'osrc') ? identSource(st, v.osrc, v) : null
  const useOther = bv(v, 'useOther', true)
  const xs = v.op === 'expr' ? v.exprs : v.ids
  return xs.map(x => v.op === 'expr'
    ? parseEffectOperation(x, eff, st.masterUnit, st.clientUnit, osrc, useOther)
    : getIdentifierInEffectContext(x, eff, st.masterUnit, st.clientUnit, osrc, useOther))
}

// ── target (第五段·步骤1): Parser.GetBattlePetTargetList ───────────────────
// 与 oracle 的 BuildEffect 逐笔同: Effect 用**七参构造**拼 (真表里带 target_type 的 32 条是技能内联行,
// 不是预制体, Effect.Parse 拿不到), 四个枚举走**各自那一侧**的 raw 词表 (上游 EffectDatabase.ToEffect*)。
const buildEffect = (sp) => new Effect(
  toEffectTiming(sv(sp, 'timing', 'none')), iv(sp, 'priority', -1), toEffectTarget(sv(sp, 'target', 'none')),
  toEffectCondition(sv(sp, 'condition', 'none')),
  // condOptions 不传 ⇒ null ⇒ 构造压一个空字典 (Effect.cs:49-52); 传了 ⇒ 整表换成传进来的那份数组。
  // 每条字典的值: 字符串原样, 数字取 raw text (与 oracle BuildEffect 的 `GetRawText` 同口径)。
  has(sp, 'condOptions')
    ? sp.condOptions.map((d) => new Map(Object.entries(d).map(([k, x]) => [k, typeof x === 'string' ? x : String(x)])))
    : null,
  toEffectAbility(sv(sp, 'ability', 'none')),
  new Map(has(sp, 'options') ? Object.entries(sp.options).map(([k, x]) => [k, String(x)]) : []),
)
const sigPetList = (list) => `n=${list.length}|[${list.map(sigPet).join(';')}]`

function mineTarget(v) {
  const st = buildState(v.spec)
  // 补回的 fromDefault 向量会经 handler.condition → JUDGE → 判定族的 parseEffectOperation,
  // 后者读 battle/host 接缝。对**没注 judge 的旧向量**这两行是惰性的 (它们压根不进 JUDGE), 不设也无害;
  // 统一设上, 让同一 kind 的两条路径共用一个世界。
  setIdentifierBattle(() => ({ currentState: st }))
  setEffectIdentHost(JUDGE_HOST)
  JUDGE_RND = fv(v, 'rnd', 0)
  const eff = buildEffect(v.effect)
  const isClient = sv(v, 'side', 'master') === 'client'
  const lhs = isClient ? st.clientUnit : st.masterUnit
  const rhs = isClient ? st.masterUnit : st.clientUnit
  eff.invokeUnit = sv(v, 'ivk', 'lhs') === 'rhs' ? rhs : lhs
  if (has(v, 'sp')) eff.sourcePet = v.sp === 'none' ? null : v.sp === 'lhs' ? lhs.pet : rhs.pet
  return sigPetList(getBattlePetTargetList(st, eff, lhs, rhs))
}

// ── effectcond / effectapply (第五段·步骤4): 判定/执行外壳 ────────────────
// oracle 的 JudgeWorld 用反射拼 effect + 设 PhaseBattle.currentState + PhasePlayer.random; 镜像逐笔对齐:
//   · buildState(spec) 给 state (缺省 spec ⇒ null ⇒ 常驻路径), 并 setIdentifierBattle 把 `state.` 支接上;
//   · setEffectIdentHost 给一条**可注入**的 HOST (rng 用 seed=1 的确定流, 存档 random 用 cell), 与判定层
//     的 numId / noCtxResolve / RandomNumber 读的同一个接缝 ⇒ random_type=rng 的 native 支由生成阶段挡掉;
//   · invokeUnit / source / sourcePet 的写入顺序照 oracle (先建世界写一次 invokeUnit, 再让 Condition 自己在
//     相位预检之后覆盖)。
// 存档侧 random 是一个 cell: oracle JudgeWorld 把 PhasePlayer.random 写成 v.rnd, 判定里的读/写都落在这格。
let JUDGE_RND = 0
const JUDGE_HOST = {
  rng: createRng(1),
  getPlayerRandom: () => JUDGE_RND,
  setPlayerRandom: (v) => { JUDGE_RND = v },
  getDate: () => 0,
  getPlayerData: () => null,
}

const sigEffectShape = (eff) =>
  `id${eff.id}|${eff.getRawEffectStringArray().join('|')}|C=${eff.getRawConditionOptionString()}`

const judgeIvk = (st, name) =>
  name === 'lhs' ? (st === null ? null : st.masterUnit)
    : name === 'rhs' ? (st === null ? null : st.clientUnit)
      : name === 'null' ? null
        : (() => { throw new Error(`MissingMemberException: 镜像不认的 judge ivk ${name}`) })()

// 与 oracle JudgeWorld 一一对齐的世界拼装 (spec/effect/ivk/src/sp/rnd)。target 的补回向量也复用它。
function judgeWorld(v) {
  const st = has(v, 'spec') ? buildState(v.spec) : null
  setIdentifierBattle(() => ({ currentState: st }))
  setEffectIdentHost(JUDGE_HOST)
  JUDGE_RND = fv(v, 'rnd', 0)
  const eff = buildEffect(v.effect)
  const invoke = judgeIvk(st, sv(v, 'ivk', 'lhs'))
  eff.invokeUnit = invoke
  if (has(v, 'src')) eff.source = identSource(st, sv(v, 'src', 'none'), v)
  if (has(v, 'sp')) {
    const n = sv(v, 'sp', 'lhs')
    eff.sourcePet = n === 'none' ? null : (judgeIvk(st, n)?.pet ?? null)
  }
  return { st, eff, invoke }
}

function mineEffectCond(v) {
  const { st, eff, invoke } = judgeWorld(v)
  const ok = judgeCondition(eff, invoke, st, bv(v, 'checkPhase', true), bv(v, 'checkTurn', true))
  return `cond=${cs(ok)}|${sigState(st)}|E=${sigEffectShape(eff)}`
}

function mineEffectApply(v) {
  const { st, eff, invoke } = judgeWorld(v)
  // oracle 侧按 PortedAbilities 白名单放行 (白名单外抛 MissingMemberException ⇒ 归 infra), 这里对**没搬**
  // 的算子抛 NOT_PORTED ⇒ 漏同步的向量会显成 "TS 抛 / oracle 不抛" 的红, 而不是静默 (与生产 JUDGE 的接缝纪律同一条)。
  const ok = judgeApply(eff, invoke, st)
  return `apply=${cs(ok)}|${sigState(st)}|E=${sigEffectShape(eff)}`
}

// ── statusctrl / petmut (第五段·步骤2): 突变器 ────────────────────────────
// SS 对应 oracle 的 `Ss`: Status 的六列各走 Fs (展宽 double 的十进制)。签名里的整数一律裸 String,
// 因为 C# 那边是装箱 int 的 ToString —— 两边都没有格式化的余地, 这才算"比的是行为"。
const SS = (st) => st.toArray().map(FS).join(',')

const sigStatusCtrl = sc =>
  `SC|init=${SS(sc.initStatus)}|add=${SS(sc.addStatus)}|mult=${SS(sc.multStatus)}` +
  `|hid=${SS(sc.hiddenStatus)}|pw=${SS(sc.powerup)}|min=${SS(sc.minPowerUp)}|max=${SS(sc.maxPowerUp)}` +
  `|cur=${SS(sc.currentStatus)}` +
  `|hp${sc.hp}/${sc.maxHp}|ang${sc.anger}(${sc.minAnger}~${sc.maxAnger})`

// sigPet 现在自带 init/pw/cur/bf 四段 ⇒ 这里不再重复追加 (与 oracle SigPetMut 同形)。
const sigPetMut = pet => sigPet(pet)

function mineStatusctrl(v) {
  const sc = new StatusController(new Status(v.init), fv(v, 'hp', 0), iv(v, 'anger', 20))
  const op = sv(v, 'op', 'noop')
  const ty = iv(v, 'type', 0)
  const amt = iv(v, 'amount', 0)
  const val = fv(v, 'value', 0)
  const st = () => new Status(v.status)
  // 与 oracle 同一对**公开方法**做铺垫 (不是直写 _minPowerUp/_maxPowerUp)。
  if (has(v, 'minPu')) sc.setMinPowerUp(new Status(v.minPu))
  if (has(v, 'maxPu')) sc.setMaxPowerUp(new Status(v.maxPu))
  let ret = '-'
  switch (op) {
    case 'noop': break
    case 'multInit': sc.multInitStatus(ty, val); break
    case 'multCurrent': sc.multCurrentStatus(ty, val); break
    case 'addInit': sc.addInitStatus(st()); break
    case 'addInitType': sc.addInitStatusType(ty, amt); break
    case 'addCurrent': sc.addCurrentStatus(ty, amt); break
    case 'addHidden': sc.addHiddenStatus(ty, amt); break
    case 'addBattle': sc.addBattleStatus(ty, amt); break
    case 'setPowerUp': sc.setPowerUp(st()); break
    case 'setPowerUpType': sc.setPowerUpType(ty, amt); break
    case 'setMin': sc.setMinPowerUp(st()); break
    case 'setMinType': sc.setMinPowerUpType(ty, amt); break
    case 'setMax': sc.setMaxPowerUp(st()); break
    case 'setMaxType': sc.setMaxPowerUpType(ty, amt); break
    case 'addPowerUp': sc.addPowerUp(ty, amt); break
    case 'getPowerUp': ret = String(sc.getPowerUpType(ty)); break
    case 'ident': ret = FS(sc.getStatusIdentifier(sv(v, 'id', ''))); break
    case 'names': return `${Status.typeNames.join(',')}|${Status.typeNamesChinese.join(',')}|${Status.powerupNames.join(',')}|${Status.powerupNamesChinese.join(',')}`
    default: throw new Error('未知 statusctrl op: ' + op)
  }
  return `${sigStatusCtrl(sc)}|ret=${ret}`
}

function minePetmut(v) {
  const pet = buildPet(v.pet)
  const op = sv(v, 'op', 'powerUp')
  if (op === 'powerUp') { pet.powerUp(new Status(v.status), null, null, bv(v, 'isSet', false)); return sigPetMut(pet) }
  if (op === 'addBuff') {
    const ok = pet.buffController.addBuff(buffOf(sub(v, 'buff')), null, null, null, bv(v, 'trig', true))
    return `${sigPetMut(pet)}|ret=${cs(ok)}`
  }
  if (op === 'available')
    return pet.skillController.getAvailableSkills(iv(v, 'anger', 20), bv(v, 'withSuper', true))
      .map(x => `${x === null ? 'null' : `#${x.id}:${x.type}`}`).join(',')
  throw new Error('未知 petmut op: ' + op)
}

// ── skilltable: 逐列签名的镜像 (oracle 的 SkillTableVector) ──
// 表由 game/core/battle/skill-table.ts 的 **ctor** 装, 不是把 JSON 字段抄一遍 ——
// 这一族拍的就是「走上游那条 ctor, 我的装载器和上游差几列」。
const LIN = (l) => `${SS(l.mult)}+${SS(l.add)}`
function mineSkilltable(v) {
  const s = skillTable().getSkill(Math.trunc(v.id))
  if (s === null) return `MISS#${Math.trunc(v.id)}`
  return `#${Math.trunc(v.id)}`
    + `|nm=${STR(s.name)}|el=${s.elementId}|ty=${s.type}|pw=${s.power}|cost=${STR(s.rawCostString)}`
    + `|ang=${s.anger}|pp=${s.pp}|PP=${skillPP(s)}|mpp=${s.maxPP}`
    + `|acc=${s.accuracy}|pri=${s.priority}|vpri=${s.vipriority}|crit=${FS(s.critical)}`
    + `|cmb=${s.combo}|chn=${s.chain}|2sp=${cs(s.isSecondSuper)}|igS=${cs(s.ignoreShield)}`
    + `|igU=${cs(powerupIgnored(s))}|igD=${cs(powerdownIgnored(s))}`
    + `|rb=${s.referBuffList === null ? '-' : s.referBuffList.join('/')}`
    + `|pum=${LIN(s.powerup)}|pdm=${LIN(s.powerdown)}`
    + `|opt[${[...s.options].map(([k, x]) => `${k}=${x}`).join('&')}]`
    + `|ef[${s.effects.map(e => e.getRawEffectStringArray().join('|')).join(';')}]`
    + `|row=${getSkillRawInfoStringArray(s).map(STR).join('~')}`
}

const INJECT_JUDGE = () => setEffectJudgement({ condition: judgeCondition, apply: judgeApply })
const RESTORE_NOT_PORTED = () => setEffectJudgement({
  condition: () => { throw new Error('Effect.Condition 未移植') },
  apply: () => { throw new Error('Effect.Apply 未移植') },
})
// 吃到真判定的族: `effectcond` / `effectapply` (整族) 与 `target` / 驱动族 (逐向量 `judge:true` 才开)。
// 没打标的驱动族向量 (giveturn/gofirst/effectq/phaseq/phasedrive) 照旧吃生产 JUDGE 的 NOT_PORTED ⇒
// 抛点与本轮开工前逐条一致; 打标的那几条第一次把算子跑完后的**真状态**拍进 `cur=` 签名。
// 为什么按向量而不是整族放开: 驱动族里有一批向量的价值就是「两边同抛」那道接缝证据 (下面 DoWork 一族),
// 无条件注入会把它们洗成"跑通了"的假绿。
// 批一步骤 6 实测更正: **只有 `phasedrive` 这条门真的会跑到算子** —— `mineGiveturn` 走
// state.giveTurnToNextUnit、`mineGofirst` 读 isGoFirst/isGoLast, 两条都不经 Effect.Condition/Apply
// (state.ts:720-744), `effectq`/`phaseq` 只拼装 handler 不 CheckAndApply ⇒ 它们的 `judge` 标是**惰性门**
// (留着是为了形状对称与以后接入, 现在发出去也不会改变抛点)。可比性的增量全在 phasedrive 一族。
const withJudge = (on, fn) => { if (!on) return fn(); INJECT_JUDGE(); try { return fn() } finally { RESTORE_NOT_PORTED() } }

export function mineSnap(v) {
  switch (v.kind) {
    case 'statecopy': return mineStatecopy(v)
    case 'stateid': return mineStateid(v)
    case 'stateset': return mineStateset(v)
    case 'stateflag': return mineStateflag(v)
    case 'giveturn': return withJudge(bv(v, 'judge', false), () => mineGiveturn(v))
    case 'gofirst': return withJudge(bv(v, 'judge', false), () => mineGofirst(v))
    case 'petbag': return minePetbag(v)
    case 'skillsys': return mineSkillsys(v)
    case 'settings': return mineSettings(v)
    case 'result': return mineResult(v)
    case 'effectq': return mineEffectq(v)
    case 'phaseq': return minePhaseq(v)
    case 'phasedrive': return withJudge(bv(v, 'judge', false), () => minePhaseDrive(v))
    case 'statedrive': return mineStatedrive(v)
    case 'effectident': return mineEffectident(v)
    case 'target': return withJudge(bv(v, 'judge', false), () => mineTarget(v))
    case 'effectcond': return withJudge(true, () => mineEffectCond(v))
    case 'effectapply': return withJudge(true, () => mineEffectApply(v))
    case 'statusctrl': return mineStatusctrl(v)
    case 'petmut': return minePetmut(v)
    case 'skilltable': return mineSkilltable(v)
    default: throw new Error('镜像不认的 kind: ' + v.kind)
  }
}

// ── 向量生成 ────────────────────────────────────────────────────────────
// 规格表 = 一份**手工**基准 (每个 op 都要有一条能走到值的向量) + 由 rnd() 派生的变体。
// 变体只动数值与袋子形状, 不动结构种类 —— 结构种类由 BASE 覆盖。
const BASE = {
  turn: 4, parallelTurn: 2, whosTurn: 1, phase: 3, weather: 5,
  options: { order_direction: '-1', mk: '2' },
  reports: ['r1', 'r2'],
  stateBuffs: [{ key: 'sb', buff: { id: 1008, turn: 2, value: 3, sets: { saturn: 1 } } }],
  actionOrder: [1, -1, 2, -2], actionCursor: 0,
  settings: { seed: 7, petCount: 3, parallelCount: 2, starLimit: 6, ruleId: 1, weather: 5, time: 9,
    initBuffExpr: '(a:1008)(b:1001)', captureLevel: 2, isCaptureOK: true },
  result: { state: 0, cursors: [0, 1, 2] },
  master: {
    id: 1, random: 11, parallelCount: 2, isDone: false,
    petSystem: {
      petBag: [{ id: 10001, hp: 70, maxHp: 100, anger: 33, stayTurn: 2 }, { id: 10002, hp: 0, maxHp: 80, anger: 120 },
        null, { id: 10003, hp: 50, maxHp: 50, anger: 0 }],
      backupPetBag: [{ id: 10004, hp: 10 }, { id: 10005 }, null, { id: 10007 }],
      tokenPetBag: [{ id: 10006, anger: 88 }, null, null, { id: 10008, hp: 1, maxHp: 9 }],
      cursor: 1, specialChance: 3,
    },
    skillSystems: [
      { level: 1.5, atk: 2, def: 3, weatherBuff: 0.1, sameElementBuff: 1.25, elementRelation: 2,
        isCounter: true, isHit: true, isCritical: false,
        damageDict: { skill: 10, other: 5 }, healDict: { skill: 1, item: 2 },
        skillDamage: 7, skillHeal: 3, skillOverHeal: 1, itemDamage: 2, itemHeal: 1, itemOverHeal: 0,
        buffDamage: 4, buffHeal: 2, combo: [{ damage: 10, critical: true }, { damage: 5, critical: false }] },
      { level: 1, atk: 1, def: 1, skillDamage: 3 },
    ],
    unitBuffs: [{ id: 1001, turn: 2, value: 1 }],
  },
  client: {
    id: -1, random: 5, parallelCount: 1,
    petSystem: { petBag: [{ id: 20001, hp: 0, maxHp: 60 }, { id: 20002, hp: 40, maxHp: 40 }, { id: 20003, hp: 5, maxHp: 5 }, null], cursor: 0 },
    skillSystems: [{ level: 1 }], unitBuffs: [],
  },
  last: { turn: 1, whosTurn: -1, master: { id: 1, petSystem: { petBag: [{ id: 10001 }] } } },
}

const cl = o => JSON.parse(JSON.stringify(o))
const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1))
const pickOf = (rnd, a) => a[Math.floor(rnd() * a.length) % a.length]

// 变体: 数值抖动 + 袋子长度/洞位/并行数变化。**不动** id 种类与 controller 形状。
function variant(rnd, seedSpec) {
  const s = cl(seedSpec ?? BASE)
  s.turn = ri(rnd, 0, 9); s.parallelTurn = ri(rnd, 0, 3); s.whosTurn = pickOf(rnd, [-1, 0, 1])
  s.phase = ri(rnd, 0, 12); s.weather = pickOf(rnd, [0, 1, 3, 5, 9])
  s.actionCursor = ri(rnd, -1, 4)
  s.options = { order_direction: String(ri(rnd, -1, 1)), mk: String(ri(rnd, 0, 5)) }
  s.reports = ['r1', 'r2', 'r3'].slice(0, ri(rnd, 0, 3))
  s.actionOrder = Array.from({ length: ri(rnd, 0, 5) }, () => pickOf(rnd, [-2, -1, 1, 2]))
  s.settings = { ...s.settings, parallelCount: pickOf(rnd, [1, 1, 2, 3]), petCount: ri(rnd, 1, 6),
    starLimit: ri(rnd, 0, 7), time: ri(rnd, 0, 20), modeId: pickOf(rnd, [0, 0, 1, 3]), ruleId: pickOf(rnd, [0, 1]),
    weather: s.weather, captureLevel: ri(rnd, 0, 5), isCaptureOK: rnd() < 0.5, isEscapeOK: rnd() < 0.5 }
  s.result = { state: pickOf(rnd, [0, 1, 2, 3, 4, 5]), cursors: Array.from({ length: ri(rnd, 0, 4) }, () => ri(rnd, 0, 9)) }
  const mkBag = n => Array.from({ length: n }, () => (rnd() < 0.2 ? null : { id: ri(rnd, 10001, 10008), hp: pickOf(rnd, [0, 1, 40, 70, 100]), maxHp: pickOf(rnd, [9, 50, 80, 100]), anger: pickOf(rnd, [0, 20, 55, 130]) }))
  for (const name of ['master', 'client']) {
    const n = ri(rnd, 1, 4)
    const u = s[name]
    u.parallelCount = s.settings.parallelCount
    u.random = ri(rnd, 0, 100)
    u.isDone = rnd() < 0.3
    u.petSystem.petBag = mkBag(n)
    u.petSystem.backupPetBag = mkBag(ri(rnd, 1, n))
    u.petSystem.tokenPetBag = mkBag(ri(rnd, 1, n))
    u.petSystem.cursor = ri(rnd, 0, n - 1)
    u.petSystem.specialChance = ri(rnd, 0, 4)
    u.skillSystems = Array.from({ length: ri(rnd, 1, n) }, () => ({
      level: pickOf(rnd, [0, 1, 1.5, 2]), atk: ri(rnd, 0, 9), def: ri(rnd, 0, 9),
      weatherBuff: pickOf(rnd, [1, 0.5, 2]), sameElementBuff: pickOf(rnd, [1, 1.25, 1.5]),
      isHit: rnd() < 0.7, isCounter: rnd() < 0.3, isCritical: rnd() < 0.3,
      skillDamage: ri(rnd, 0, 99), buffHeal: ri(rnd, 0, 9),
      damageDict: { skill: ri(rnd, 0, 9) }, healDict: { item: ri(rnd, 0, 9) },
      combo: Array.from({ length: ri(rnd, 0, 2) }, () => ({ damage: ri(rnd, 0, 30), critical: rnd() < 0.5 })),
    }))
    u.unitBuffs = Array.from({ length: ri(rnd, 0, 3) }, () => ({ id: pickOf(rnd, [1001, 1008, 3, 11, 31, -6]), turn: pickOf(rnd, [-1, 0, 1, 3]), value: pickOf(rnd, [0, 1, -3, 7]) }))
  }
  s.stateBuffs = Array.from({ length: ri(rnd, 0, 2) }, (_, i) => ({ key: `sb${i}`, buff: { id: pickOf(rnd, [1001, 1008, 500005]), turn: pickOf(rnd, [-1, 1, 3]), value: ri(rnd, 0, 9) } }))
  s.last = rnd() < 0.5 ? { turn: 1, whosTurn: -1, master: { id: 1, petSystem: { petBag: [{ id: 10001 }] } } } : null
  return s
}

// petturn 只在**会终止**的规格上跑: GetParallelPetBag 的 while 一旦 cursor 落在窗口 [0,parallelCount)
// 之外就永不回环 (上游 OOM, 移植体同理), 所以这些规格手工固定。
function petturnSpecs(rnd) {
  const out = []
  for (const pc of [1, 2]) {
    for (const len of pc === 1 ? [3] : [pc]) {
      const s = cl(BASE)
      s.settings.parallelCount = pc
      for (const name of ['master', 'client']) {
        const u = s[name]
        u.parallelCount = pc
        u.petSystem.petBag = Array.from({ length: len }, (_, i) => ({ id: 10001 + i, hp: pickOf(rnd, [0, 40, 100]), maxHp: 100, stayTurn: i }))
        u.petSystem.backupPetBag = [{ id: 10901, hp: 10 }]
        u.petSystem.tokenPetBag = [null, { id: 10906, anger: 66 }, { id: 10908, hp: 0 }]
        u.petSystem.cursor = 0
        u.petSystem.specialChance = 2
      }
      out.push(s)
    }
  }
  // turn 从 0 起: BattlePet.OnTurnStart 的 stayTurn 累加要求 state.turn>1, 头两拍必须不动
  const t0 = cl(BASE); t0.turn = 0; t0.settings.parallelCount = 1; t0.master.parallelCount = 1; t0.client.parallelCount = 1
  t0.master.petSystem.cursor = 0; t0.client.petSystem.cursor = 0
  out.push(t0)
  return out
}

const STATE_IDS = ['turn', 'actionCursor', 'order.direction', 'phase', 'weather', 'whosTurn', 'buffturn', 'buff',
  'option', 'option[]', 'option[mk]', 'option[order_direction]', 'option[nope]', 'settings.time', 'settings.seed',
  'settings.parallelCount', 'settings.capture', 'settings.captureLevel', 'settings.mode', 'settings.nope',
  'result.state', 'result.fightPetCount', 'result.isEnd', 'result.capturePet.hp', 'last.turn', 'last.whosTurn',
  'last.nope', 'buff[sb]', 'buff[sb].turn', 'buff[sb].value', 'buff[sb].option[round]', 'buff[sb].nope',
  'buff[nope]', 'nope', '']
const SETTINGS_IDS = ['mode', 'rule', 'petCount', 'parallelCount', 'starLimit', 'time', 'weather', 'mod',
  'simulate', 'escape', 'item', 'capture', 'captureLevel', 'reveal', 'nope', '']
const RESULT_IDS = ['state', 'fightPetCount', 'isEnd', 'isKO', 'isEscape', 'isCapture', 'isMyWin', 'isOpWin',
  'capturePet.hp', 'nope', '']
const PETSYS_IDS = ['cursor', 'aliveNum', 'deadNum', 'specialChance', 'nope', '']
const SKILLSYS_IDS = ['level', 'atk', 'def', 'weatherBuff', 'sameElementBuff', 'elementRelation', 'isCounter',
  'isHit', 'isCritical', 'damage', 'heal', 'damage[skill]', 'heal[skill]', 'SkillDamage', 'nope', '']
const SKILLSYS_SETS = ['level=2', 'atk=3.5:1', 'def=-2', 'weatherBuff=1.25', 'sameElementBuff=0.5',
  'elementRelation=2', 'isHit=0', 'isCritical=1', 'skillDamage=9', 'buffHeal=-4', 'nope=1']

export function snapVectors(rnd) {
  const V = []
  const push = v => V.push(v)
  const specs = [BASE, ...Array.from({ length: 7 }, () => variant(rnd))]

  for (const spec of specs) {
    for (const op of ['sig', 'copy', 'mutate', 'ctor']) push({ kind: 'statecopy', op, spec })
    push({ kind: 'stateid', ids: STATE_IDS, spec })
    push({ kind: 'stateid', ids: ['last.turn', 'last.option[mk]', 'last.result.state'], spec })
    const writes = [['option[mk]', 5], ['order.direction', -1], ['nope', 1], ['option[nd]', 2], ['turn', 8]]
    push({ kind: 'stateset', writes, ids: ['option[mk]', 'order.direction', 'turn', 'nope'], spec })
    push({ kind: 'stateset', writes: writes.slice(0, 2).reverse(), ids: ['option[nd]', 'option[mk]'], spec })
    push({ kind: 'stateflag', spec, ids: [-2, -1, 0, 1, 2, 9], rhs: [-1, 1, 0, 2] })
    push({ kind: 'stateflag', spec })
    for (const n of [0, 1, 2, 3, 6]) push({ kind: 'giveturn', n, spec })
    push({ kind: 'gofirst', spec })
    for (const op of ['sig', 'pet', 'token', 'refresh', 'shallow', 'deep', 'addNewPet']) push({ kind: 'petbag', op, spec, pet: { id: 10999, hp: 30, maxHp: 60 } })
    for (const op of ['swapBackup:0', 'swapBackup:-1', 'swapBackup:4', 'swapToken:0', 'swapToken:3', 'swapToken:9',
      'nextCursor:-1', 'nextCursor:0', 'nextCursor:2', 'nextCursor:5', 'cursor:0', 'cursor:2', 'cursor:5', 'setsc:0', 'setsc:7'])
      push({ kind: 'petbag', op, spec })
    for (const n of [1, 2, 3, 6]) push({ kind: 'petbag', op: `parallel:${n}`, spec })
    for (const id of PETSYS_IDS) { push({ kind: 'petbag', op: `ident:${id}`, spec }); push({ kind: 'petbag', op: `tryident:${id}`, spec }) }
    for (const op of ['sig', 'copy', 'onTurnStart', 'onChainStart', 'swap:true', 'swap:false', 'totals', 'typeDamage'])
      push({ kind: 'skillsys', op, spec })
    // 接缝证明: onChainStart 的 `TestSkill = GetSkill(skill.id)` 把 critical/combo/accuracy/power
    // 从**技能表**盖回技能上, 而 sk= 现在打这四列。三个真 id (物理/属性/必杀) + 一个表里没有的,
    // 加上 stub 默认的 id=0 (Database.cs:132 的 `id == 0` 短路 ⇒ 两边都落 noOp) 一起把四支分全。
    for (const id of [10001, 10005, -1002, 999999])
      push({ kind: 'skillsys', op: 'onChainStart', spec: { ...spec, skill: { id, type: 1 } } })
    for (const id of SKILLSYS_IDS) { push({ kind: 'skillsys', op: `ident:${id}`, spec }); push({ kind: 'skillsys', op: `tryident:${id}`, spec }) }
    for (const set of SKILLSYS_SETS) push({ kind: 'skillsys', op: `set:${set}`, spec })
    for (const s of specs.slice(0, 3)) for (const op of ['sig', 'copy', 'flags', 'initBuffs']) push({ kind: 'settings', op, spec: s.settings })
    for (const id of SETTINGS_IDS) push({ kind: 'settings', op: `ident:${id}`, spec: spec.settings })
    for (const m of [-1, 0, 2, 6, 9]) push({ kind: 'settings', op: `setmode:${m}`, spec: spec.settings })
    for (const r of [0, 1, 2]) push({ kind: 'settings', op: `setrule:${r}`, spec: spec.settings })
    for (const e of ['', '(a:1008)', '(a:1008)(b:1001)', '(x:0)']) push({ kind: 'settings', op: `setinit:${e}`, spec: spec.settings })
    push({ kind: 'settings', op: 'setweather:7', spec: spec.settings })
    for (const op of ['sig', 'copy', 'flags']) push({ kind: 'result', op, spec: { ...spec.result, settings: spec.settings } })
    for (const id of RESULT_IDS) push({ kind: 'result', op: `ident:${id}`, spec: { ...spec.result, settings: spec.settings } })
    for (const st of [0, 1, 2, 3, 4, 5, 9]) push({ kind: 'result', op: `state:${st}`, spec: { ...spec.result, settings: spec.settings } })
    for (const c of [-1, 0, 1, 4, 9]) push({ kind: 'result', op: `addcursor:${c}`, spec: { ...spec.result, settings: spec.settings } })
    for (const op of ['all', 'allNoskill', 'master', 'client']) { push({ kind: 'effectq', op, spec }); push({ kind: 'effectq', op, addSkill: false, spec }) }
    // phaseq: BattlePhase 的队列组装 (all 走 :62-63 怪癖 —— 子调用不转传 addSkill) + phase 属性两读两写。
    for (const addSkill of [true, false]) for (const op of ['all', 'master', 'client']) push({ kind: 'phaseq', op, addSkill, spec })
    push({ kind: 'phaseq', op: 'getph', spec })
    push({ kind: 'phaseq', op: 'setph', n: 5, spec })
    push({ kind: 'phaseq', op: 'setph', n: -1, spec })
    push({ kind: 'phaseq', op: 'getphN' })
    push({ kind: 'phaseq', op: 'setphN', n: 5 })
  }

  for (const spec of petturnSpecs(rnd)) {
    for (const n of [1, 3, 5]) push({ kind: 'statedrive', op: 'petturn', n, spec })
    for (const id of ['turn', 'value', 'nope', 'option[round]', '']) push({ kind: 'statedrive', op: 'unitturn', identifier: id, n: 4, spec })
    // 多只袋子的 addbuff 里有**两条必须都装上**的形状: 上游 `isSuccess |= AddBuff(...)` 不短路,
    // 而 JS 的 `isSuccess = isSuccess || addBuff(...)` 会在第一次成功后不再调用 —— 只有
    // 「前一只成功 + 后面还有」的向量能拍到它 (原先那四组要么单只, 要么首只返回 false)。
    for (const b of [[{ id: 1001, turn: 2, value: 5 }], [{ id: 1 }, { id: 1, value: 3 }], [], [null, { id: 11 }],
      [{ id: 1001, turn: 2, value: 5 }, { id: 11, turn: 1, value: 2 }],
      [{ id: 1001, turn: 2, value: 5 }, { id: 1008, turn: 4, value: 7 }],
      [{ id: 3, turn: -1, value: 1 }, { id: 1001, turn: 2, value: 5 }, { id: 11 }]])
      push({ kind: 'statedrive', op: 'addbuff', buffs: b, spec })
    for (const n of [1, 2]) push({ kind: 'statedrive', op: 'chainstart', n, spec })
  }

  // ── phasedrive (S3 段4 任务#2/#4): 直线组 6 类 + TurnEnd/DamageCalculate + 分支组 4 类的构造/推进 ──
  const DRIVE13 = ['BattleStartPhase', 'RoundStartPhase', 'TurnStartPhase', 'TurnReadyPhase',
    'TurnEndPhase', 'AttackEndPhase', 'BattleEndPhase', 'DamageCalculatePhase',
    'DecidePriorityPhase', 'BeforeAttackPhase', 'AttackPhase', 'AfterAttackPhase', 'PassivePetChangePhase']
  for (const spec of specs) {
    for (const clsName of DRIVE13) {
      push({ kind: 'phasedrive', op: `ctor:${clsName}`, spec })
      push({ kind: 'phasedrive', op: `next:${clsName}`, spec })
    }
  }
  push({ kind: 'phasedrive', op: 'ctor:TurnStartPhase' })   // 无 spec ⇒ currentState null, 两边同抛在构造
  push({ kind: 'phasedrive', op: 'next:BattleStartPhase' })
  push({ kind: 'phasedrive', op: 'ctor:PassivePetChangePhase' })  // 三连 clone 同样在 currentState null 上抛 (构造里, 先于任何方法)

  // DoWork 轨迹口径 (实测坐实 2026-10-14): 剥掉 stateBuffs/unitBuffs 后拼装队列**恒非空** ——
  // weatherBuff (500000+w) 对 0..9 每一档都带效果, 查不到还回落 500000 (也带效果), 不存在空队列规格;
  // 而 oracle 的真实 Effect.Condition 在注入世界把这些时序不匹配的效果判 false 走完 DoWork
  // (对照实验: dowork:AttackEndPhase oracle 完成 / TS 在 JUDGE 围栏抛 ⇒ 该形状不能进对拍)。
  // 所以本段 DoWork 只发**两侧都在 Apply 之前/之外抛**的两族:
  //   · TurnReady + autoSkillOrder null/[] ⇒ 两边同点抛在 UI.StopTimer (systemView null),
  //     这条还坐实"StopTimer 先于 base.DoWork"的顺序 (TurnReadyPhase.cs:13-14);
  //   · TurnStart ⇒ oracle 走完 apply(condition false)+SetState 后抛在 ProcessQuery 的 systemView null,
  //     TS 抛在 apply 的 JUDGE 围栏 —— throw-only 口径 (差分只比抛/不抛), 围栏登记已注明。
  for (const spec of petturnSpecs(rnd)) {
    for (const autoOrder of [null, []])
      push({ kind: 'phasedrive', op: 'dowork:TurnReadyPhase', autoOrder, spec })
    push({ kind: 'phasedrive', op: 'dowork:TurnStartPhase', autoOrder: [1], spec })
  }

  // DamageCalculate 的 5-timing (DamageCalculatePhase.cs:12-27): oracle 在**第一段** apply 里就抛
  // (base 规格抛 ECall 围栏 1 条 + NRE 2 条, timing 8 有真实效果进 Condition/Apply), TS 同向量抛在
  // JUDGE 围栏 —— throw-only 口径, 序列顺序本身由 phase.test.ts 的接缝轨迹负责 (围栏登记已注明)。
  for (const spec of specs.slice(0, 3))
    push({ kind: 'phasedrive', op: 'dowork:DamageCalculatePhase', autoOrder: [1], spec })

  // ── 分支组 DoWork (任务#4) ──
  // null-skill 规格下 BeforeAttack/AfterAttack 走过早退后必达 applySkillsAndBuffs 或 skill.type:
  // TS 抛在 JUDGE 围栏 / oracle 抛在 ECall、排序键 null 或 battle.settings null —— throw-only 口径。
  // DecidePriority **只发 parallelCount<=1**: >1 时过滤链把 null-skill 全滤光 ⇒ priorityUnits 空 ⇒
  // oracle 空 actionOrder 一路走完 GiveTurnToNextUnit+SetUIState **完成整串**, TS 却抛在首步 JUDGE ⇒ 不发。
  // 不自终止护栏 (BattlePhase.cs:36-49 实测坐实): pc>1 且 whosTurn==0 的 ApplySkillsAndBuffs 走
  // GetParallelPetBagCursor —— 任一 unit 的 cursor 落出 [0,pc) 就永不回环, oracle 数到 int 上限抛
  // OutOfMemoryException (29012 号向量实锤: pc=3, master.cursor=3)。生成阶段挡掉, 不留不可比。
  const parallelApplyOOM = s => {
    const pc = s.settings.parallelCount
    if (s.whosTurn !== 0 || pc <= 1) return false
    const bad = u => u.petSystem.cursor < 0 || u.petSystem.cursor >= pc
    return bad(s.master) || bad(s.client)
  }
  for (const spec of specs) {
    if (parallelApplyOOM(spec)) continue
    if (spec.settings.parallelCount <= 1)
      push({ kind: 'phasedrive', op: 'dowork:DecidePriorityPhase', autoOrder: [1], spec })
    push({ kind: 'phasedrive', op: 'dowork:BeforeAttackPhase', autoOrder: [1], spec })
    push({ kind: 'phasedrive', op: 'dowork:AttackPhase', autoOrder: [1], spec })
    push({ kind: 'phasedrive', op: 'dowork:AfterAttackPhase', autoOrder: [1], spec })
  }

  // 早退完成族 (确定性构造, 不碰表不碰 UI 副作用):
  //   · BeforeAttack: actionCursor 抬到 order.length ⇒ isAllUnitDone 首句 return (AddReport 之前);
  //   · Attack: whosTurn=1 且 master.isDone ⇒ 首句 return (IsAttackLegal 之前, atkUnit 非 null);
  //   · TurnEnd: result.state=3 (非 Fighting) ⇒ whosTurn=0 后 CheckBattleEnd 即 return,
  //     不达 RaiseAnger 的 battle.settings / Apply 围栏 (next:TurnEndPhase 全 8 规格已绿, CheckBattleEnd 两侧可走通)。
  for (const base of [specs[0], specs[3], specs[6]]) {
    const done = cl(base)
    done.actionCursor = Math.max(done.actionCursor, (done.actionOrder ?? []).length)
    push({ kind: 'phasedrive', op: 'dowork:BeforeAttackPhase', autoOrder: [1], spec: done })
    const atkDone = cl(base)
    atkDone.whosTurn = 1
    atkDone.master.isDone = true
    push({ kind: 'phasedrive', op: 'dowork:AttackPhase', autoOrder: [1], spec: atkDone })
    const ended = cl(base)
    ended.result = { ...ended.result, state: 3 }
    push({ kind: 'phasedrive', op: 'dowork:TurnEndPhase', autoOrder: [1], spec: ended })
  }

  // TurnEnd 一般形状 = probe: oracle 在注入世界的 buffController/hudSystem 走通与否未实测,
  // 若出现 oracle 完成 / TS 抛 JUDGE 的不一致即剪 (同 AttackEnd 对照实验处置)。
  for (const spec of specs)
    push({ kind: 'phasedrive', op: 'dowork:TurnEndPhase', autoOrder: [1], spec })

  // ── PPC + 驱动序 (任务#5/#6) ──
  // PassivePetChangePhase 的 DoWork 是全场唯一空实现 (PassivePetChangePhase.cs:23-25) ⇒ 任何规格都安全。
  for (const spec of specs)
    push({ kind: 'phasedrive', op: 'dowork:PassivePetChangePhase', spec })

  // 技能 stub 规格 (只在 pc=1 下注入: unit.skillSystem 的 pc>1 分支要按 cursor 取本, 与 stub 位对不齐
  // 会引入与 PPC 无关的 AOORE 形状)。type: 1=物理, -3=換场; source_index/optionsNull 专打 GetPassiveChance
  // 的 :117 三叉 (匹配⇒1, 错位⇒0, 'abc'⇒FormatException 对, options null⇒NRE 对)。
  const ppc1 = () => {
    const sp = cl(BASE)
    sp.settings.parallelCount = 1
    sp.master.parallelCount = 1
    sp.client.parallelCount = 1
    sp.master.petSystem.cursor = 0
    sp.client.petSystem.cursor = 0
    sp.master.skillSystems = [{ level: 1 }]
    return sp
  }
  const withSkills = (mSkill, cSkill, mPatch = {}, cPatch = {}) => {
    const sp = ppc1()
    sp.master.skillSystems = [{ skill: mSkill }]
    sp.client.skillSystems = [{ skill: cSkill }]
    Object.assign(sp.master, mPatch)
    Object.assign(sp.client, cPatch)
    return sp
  }
  const PHYS = { type: 1 }
  const CHG = (si) => ({ type: -3, sourceIndex: si })
  const stubSpecs = [
    withSkills(PHYS, PHYS),                             // A: 0/0 ⇒ 非自环分支 + battle 直写 + TurnReady
    withSkills(PHYS, PHYS, {}, { id: 1 }),              // B: opUnit.IsMasterUnit ⇒ UIState.masterUnit 分支
    withSkills(CHG('0'), PHYS),                         // C: cursor==source_index ⇒ chance 1 ⇒ 自环
    withSkills(CHG('2'), PHYS),                         // D: 错位 ⇒ 0 ⇒ 非自环
    withSkills(CHG('abc'), PHYS),                       // E: masterChance 抛 FormatException 对
    withSkills({ type: -3, optionsNull: true }, PHYS),  // F: options null ⇒ NRE/TypeError 对
  ]
  for (const spec of stubSpecs) {
    push({ kind: 'phasedrive', op: 'ctor:PassivePetChangePhase', spec })
    push({ kind: 'phasedrive', op: 'next:PassivePetChangePhase', spec })
    push({ kind: 'phasedrive', op: 'dowork:PassivePetChangePhase', spec })
  }

  // 驱动序主循环 (Battle.cs:249-277) 的五个家族:
  //   · drive:N ⇒ 循环不进, 完成 (ph=N|last=S-|cur=S-);
  //   · drive:BattleEndPhase ⇒ oracle 走真 ProcessResult (native Random/Player 字段/Hintbox), TS 抛在
  //     BattleEndPhase.doWork 围栏 —— throw-only 对;
  //   · drive:PassivePetChangePhase + 无技规格 ⇒ chance 2 自环, round 数到 1001 撞死循环保护 ——
  //     oracle 抛在 ProcessResult/Hintbox, TS 抛在 battleNextPhase 的 NOT_PORTED 尾 (先设 BattleEndPhase+Error) —— throw-only 对;
  //   · chain>100 ⇒ round 1 就走死循环分支 (链子 1000 轮 clone 的快检版);
  //   · drive:PPC + 双物理 stub ⇒ 非自环 ⇒ TurnReady.doWork 抛在 StopTimer 对 (TurnReadyPhase.cs:13-14 顺序)。
  push({ kind: 'phasedrive', op: 'drive:N' })
  push({ kind: 'phasedrive', op: 'drive:BattleEndPhase', spec: BASE })
  push({ kind: 'phasedrive', op: 'drive:PassivePetChangePhase', spec: BASE })
  const c101 = ppc1()
  c101.master.petSystem.petBag[0].chain = 101
  push({ kind: 'phasedrive', op: 'drive:PassivePetChangePhase', spec: c101 })
  push({ kind: 'phasedrive', op: 'drive:PassivePetChangePhase', spec: stubSpecs[0] })

  // ── 第六段·批一 步骤 6: 算子**真跑**的驱动向量 (judge:true ⇒ 镜像侧把 JUDGE 围栏换成批一的判定器) ──
  // 三条实测纪律 (原型台 tools/drv-proto.mjs, 逐列比两边的 pstate/cur 签名, 2026-10-15):
  //   · **TurnEnd 的可比性被 hud 卡死**: 上游 TurnEndPhase.cs:98-99 调 UnitHudSystem.OnTurnEnd, 那里
  //     `Unit.IsMyUnit()` (Unit.cs:115-118) 第一句就读 `PhotonNetwork.IsConnected` ⇒ 无头 oracle 抛
  //     TypeInitializationException。进那支的条件是**任一只 unit 的 totalBuffHeal − totalBuffDamage ≠ 0**
  //     (UnitSkillSystem.cs:40/44 把 buff / buff_per / buff_fix / buff_percentage_unhealthy 全算进去),
  //     所以 17 时机只发「账本中性」的算子 (add_buff / remove_buff / add_status / none) 或**净额为 0 的
  //     成对印记** (TE-B: 2024 流血 value=25 + 2023 恢复 maxHp/4=25 ⇒ 真写了两侧账本却不进 hud)。
  //     移植体**不建模**这次抛错 —— hud 在真机是纯表现层, 让生产代码因为对拍而抛才是错的。
  //     (2016「吸取体力」看着成对, 实则会抛: 它的伤害落在 op、治疗落在 self ⇒ 两只 unit 各自净额非 0。)
  //   · **18 时机 (OnAfterTurnEnd) 排在 hud 之后** ⇒ heal / add_buff / set_damage 不受上一条约束 (TE-A1/A2/A3)。
  //   · **AfterAttackPhase 没有 hud 调用** (AfterAttackPhase.cs:12-18 = Apply→RaiseAnger→GiveTurn→SetUIState)
  //     ⇒ 15 时机是 heal / add_status / add_buff 的富宿主 (AA 组), hp·账本·anger·actionOrder 全在签名里。
  //   · 技能 stub **只给 id/type**: oracle 的 BuildSkillSystem 技能支只认 id/type/sourceIndex/optionsNull,
  //     而镜像的 blankSkill 认整套字段 —— 多写的 power/accuracy 两边不对称 (原型台 sk= 列撞车实测)。
  //   · **不发** 的条件: 976「火海」/968「瞬杀」的 cond 读 `random[old]` ⇒ TS 抛在 NOT_PORTED 围栏、
  //     oracle 抛在真 NRE, 两边同抛却不同类, 拍不到算子本体 (批一口径: 只发真跑到算子或真跑到上游炸点的形状)。
  // native RNG 闸门照旧: 这 22 条的表达式里没有 random 叶, 印记 id 全是字面量, 无 unique/random 候选。
  const opClean = (over = {}) => {
    const s = {
      turn: 4, parallelTurn: 2, whosTurn: 1, phase: 3, weather: 0,
      options: { order_direction: '-1', mk: '2' },
      reports: ['r1'],
      stateBuffs: [],
      actionOrder: [1, -1], actionCursor: 0,
      settings: { seed: 7, petCount: 3, parallelCount: 1, starLimit: 6, ruleId: 1, weather: 0, time: 9, captureLevel: 2, isCaptureOK: true },
      result: { state: 0, cursors: [0, 1, 2] },
      master: {
        id: 1, random: 11, parallelCount: 1,
        petSystem: {
          cursor: 0, specialChance: 1,
          petBag: [{ id: 10001, hp: 70, maxHp: 100, stayTurn: 2 }, { id: 10002, hp: 0, maxHp: 80, stayTurn: 1 }],
          backupPetBag: [{ id: 10004, hp: 10 }, null],
          tokenPetBag: [{ id: 10006, anger: 88 }, null],
        },
        skillSystems: [{ level: 1 }],
        unitBuffs: [],
      },
      client: {
        id: -1, random: 5, parallelCount: 1,
        petSystem: {
          cursor: 0, specialChance: 1,
          petBag: [{ id: 20001, hp: 30, maxHp: 60, stayTurn: 1 }, { id: 20002, hp: 40, maxHp: 40 }],
          backupPetBag: [{ id: 20004 }, null],
          tokenPetBag: [null, { id: 20006 }],
        },
        skillSystems: [{ level: 1 }],
        unitBuffs: [],
      },
      last: null,
    }
    for (const [k, v] of Object.entries(over)) {
      if (k === 'masterPet') s.master.petSystem.petBag[0].buffs = v
      else if (k === 'clientPet') s.client.petSystem.petBag[0].buffs = v
      else if (k === 'unit') s.master.unitBuffs = v
      else if (k === 'state') s.stateBuffs = v
      else if (k === 'settings') Object.assign(s.settings, v)
      else s[k] = v
    }
    return s
  }
  // 出手后的宿主: whosTurn=1 + 攻击技 + isHit=true ⇒ RaiseAnger 的 +15 也进签名 (pet.anger 列)。
  const opAtk = (over = {}) => {
    const s = opClean(over)
    s.whosTurn = 1
    s.actionOrder = [1, -1]
    s.actionCursor = 0
    s.master.skillSystems[0] = { level: 1, isHit: true, skillDamage: 400, skill: { id: 5001, type: 1 } }
    return s
  }
  const opSb = (id, turn, value) => [{ key: 'sb', buff: { id, turn, value } }]
  const TE = (spec) => push({ kind: 'phasedrive', judge: true, op: 'dowork:TurnEndPhase', autoOrder: [1], spec })
  const AA = (spec) => push({ kind: 'phasedrive', judge: true, op: 'dowork:AfterAttackPhase', autoOrder: [1], spec })

  // TurnEnd 17: 中性算子 (空 = 只有天气 500000 的 none) / 自摘 / 挂印记
  TE(opClean())
  TE(opClean({ masterPet: [{ id: 2059, turn: -1 }] }))
  TE(opClean({ unit: [{ id: 3171, turn: 2, value: 1 }] }))
  // TurnEnd 18: hud 之后, heal(负值打对手) / add_buff+remove / add_buff(who=op)
  TE(opClean({ state: opSb(3636, -1, 2) }))
  TE(opClean({ masterPet: [{ id: 3617, turn: -1 }] }))
  TE(opClean({ masterPet: [{ id: 200968, turn: -1 }] }))
  // TurnEnd 17: set_damage + heal 成对且净额 0 ⇒ 账本进签名却不进 hud
  TE(opClean({ masterPet: [{ id: 2023, turn: -1, value: 4 }, { id: 2024, turn: -1, value: 25 }] }))
  // TurnEnd 17: 死宠的 heal 走 `hp <= 0 ⇒ continue` (:282) ⇒ 账本不动 ⇒ 仍可比
  TE((() => {
    const s = opClean()
    s.master.petSystem.petBag[0].hp = 0
    s.master.petSystem.petBag[1].hp = 40
    s.master.petSystem.petBag[0].buffs = [{ id: 19, turn: -1 }]
    return s
  })())

  // AfterAttack 15: 空手 / set 满血(951) / add=200+自摘(3035) / add=skillDamage/4(3118)
  AA(opAtk())
  AA(opAtk({ masterPet: [{ id: 951, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 3035, turn: 3 }] }))
  AA(opAtk({ masterPet: [{ id: 3118, turn: 3 }] }))
  // add_buff(自己挂 1001 + 自摘, 1017) / 自摘条件印记 (33) / heal(who=op, 负治疗 -90, 3128)
  AA(opAtk({ masterPet: [{ id: 1017, turn: 3 }] }))
  AA(opAtk({ masterPet: [{ id: 33, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 3128, turn: -1 }] }))
  // add_status(who=op, type=0/1/2/3/4, add=-100) ⇒ st= 列真动 / heal(maxHp/16) / none+on_success
  AA(opAtk({ masterPet: [{ id: -3021, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 3141, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 2031, turn: -1 }] }))
  // heal(set=maxHp 触 block 印记那一支) / add_buff(turn 表达式 value+1) / add_buff×2 (不短路的 |=)
  AA(opAtk({ masterPet: [{ id: 3102, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 2052, turn: -1 }] }))
  AA(opAtk({ masterPet: [{ id: 970, turn: -1 }] }))
  // 同优先级两条印记 (3014 自摘 + 974 add_buff(who=op)) ⇒ 队列次序进签名
  AA(opAtk({ masterPet: [{ id: 3014, turn: -1 }, { id: 974, turn: -1 }] }))

  // ── effectident (第五段·步骤0): 带 effect 上下文的标识符链 ──────────────
  // 规格把**四只技能袋 + 元素块 + 印记袋**都喂满, 因为本 kind 的主顾就是 BattlePet 的六个臂与
  // bag/buff 过滤器。BASE 那份宠物的 skillController 是空容器, 拍不出 skill[..] 一族。
  // 两条生成期纪律 (与 playbook §6 同口径):
  //   · **不发** `random` 任何形状 —— 它吃 native Random, 而本 kind 不在 difftest 的自动 native 归类名单里;
  //   · **不发** 读宠表的臂 (`id`/`uid`/`baseId`/`star`/`gender`/`personality`/`trait`/`level`/`exp`/
  //     `skin`/`record`/`ev`/`own`/`status.init|extra|battle|personality` 与裸 `normalSkill`/`superSkill`/
  //     `skill` 无括号形与 src=pet 的 `buff[..]`) —— 移植体在那些位置是**显式 NOT_PORTED**,
  //     上游给的却是表读值, 拍出来是"围栏 vs 上游"的假不一致, 属宠表批次 (S6) 的账。
  const IS = (() => {
    const s = cl(BASE)
    s.settings.parallelCount = 1
    s.master.parallelCount = 1
    s.client.parallelCount = 1
    s.master.skillSystems = [s.master.skillSystems[0]]
    s.master.petSystem = {
      cursor: 0, specialChance: 3,
      petBag: [
        { id: 10001, hp: 70, maxHp: 100, anger: 33, stayTurn: 2, chain: 1, el: 2, sel: 9,
          buffs: [{ id: 1000, turn: 2, value: 5 }, { id: 1001, turn: 1, value: 3 },
            { id: 1008, turn: 4, value: 7, sets: { saturn: 1 } }, { id: 3, turn: 0, value: 0 }],
          normalSkills: [{ id: 100, type: 1, power: 40, anger: 0, accuracy: 95, maxPP: 10, pp: 3, priority: 1, critical: 6.25 },
            null, { id: 101, type: 1, power: 55, anger: 10, accuracy: 90, maxPP: 5, priority: -1, elementId: 3 }],
          loopSkills: [{ id: 200, type: 2, power: 20, anger: 0, accuracy: 100, maxPP: 1, pp: 1 },
            { id: 201, type: 2, power: 25, anger: 5, accuracy: 85 }],
          headerSkills: [{ id: 300, type: 3, power: 1, anger: 0 }],
          superSkill: { id: 400, type: 4, power: 150, anger: 50, accuracy: 100, maxPP: 1, pp: 1, isSecondSuper: true } },
        { id: 10002, hp: 0, maxHp: 80, anger: 120, el: 3 },
        null,
        { id: 10003, hp: 50, maxHp: 50, anger: 0, chain: 2, el: 1, sel: 2,
          buffs: [{ id: 1001, turn: -1, value: 2 }] },
      ],
      backupPetBag: [{ id: 10004, hp: 10 }, { id: 10005 }, null, { id: 10007 }],
      tokenPetBag: [{ id: 10006, anger: 88, el: 4, stayTurn: 3 }, null, null, { id: 10008, hp: 1, maxHp: 9 }],
    }
    s.client.petSystem = {
      cursor: 0, specialChance: 1,
      petBag: [
        { id: 20001, hp: 30, maxHp: 60, anger: 20, el: 13, sel: 5, stayTurn: 1,
          buffs: [{ id: 1001, turn: 3, value: 9 }],
          normalSkills: [{ id: 500, type: 1, power: 35, anger: 0, accuracy: 80, maxPP: 8, pp: 2 }] },
        { id: 20002, hp: 40, maxHp: 40 }, { id: 20003, hp: 5, maxHp: 5 }, null,
      ],
      backupPetBag: [{ id: 20004 }], tokenPetBag: [null, { id: 20006 }],
    }
    return s
  })()

  const ID = (ids, x) => push({ kind: 'effectident', op: 'ident', ids, spec: IS, dsl: '(1002)', ...x })
  const EX = (exprs, x) => push({ kind: 'effectident', op: 'expr', exprs, spec: IS, dsl: '(1002)', ...x })

  // state. 面 (含 last. 换帧与 me.order/op.order 的 actionOrder 短路)。
  ID(['state.turn', 'state.whosTurn', 'state.phase', 'state.weather'])
  ID(['state.parallelTurn', 'state.options[mk]', 'state.options[order_direction]', 'state.options[nope]'])
  ID(['state.buff[1008].turn', 'state.buff[1008].value', 'state.buff[sb].turn', 'state.buff[nope].turn'])
  ID(['state.last.turn', 'state.last.whosTurn', 'state.last.pet.status.maxHp', 'state.nope'])
  ID(['nope', '', '1234', '-7'])

  // elementRelation: 两支 (>=2 组 ⇒ 相克; <2 组 ⇒ **穿透**到 idSource 分派)。
  ID(['elementRelation[atk:2][def:3]', 'elementRelation[atk:1][def:1]', 'elementRelation[atk:3][def:13][def.sub:5]',
    'elementRelation[atk:99][def:99]'])
  ID(['elementRelation', 'elementRelation[atk:1]', 'elementRelation[xx:1][yy:2]', 'elementRelation[atk:me.pet.element][def:op.pet.element]'])

  // me./op. 的单位面 (status 六键 + powerup + 兜底)。
  ID(['me.pet.status.maxHp', 'me.pet.status.hp', 'me.pet.status.lostHp', 'me.pet.status.anger'])
  ID(['me.pet.status.minAnger', 'me.pet.status.maxAnger', 'me.pet.status.lostAnger', 'me.pet.status.nope'])
  ID(['me.pet.powerup.atk', 'me.pet.powerup.hit', 'me.pet.powerup.nope', 'me.pet.powerup'])
  ID(['op.pet.status.maxHp', 'op.pet.status.hp', 'op.pet.element', 'op.pet.subElement'])
  ID(['me.pet.element', 'me.pet.subElement', 'me.pet.stayTurn', 'me.pet.chain'])
  ID(['me.pet.dead', 'me.pet.movable', 'me.pet.token', 'me.pet.position'])
  ID(['me.order', 'op.order', 'me.turn', 'me.nope'])

  // bag 过滤器 (左键递归 getPetIdentifier; 比较符走 splitCondition)。
  ID(['me.pet.bag.count', 'me.pet.bag(hp:0).count', 'me.pet.bag(dead:1).count', 'me.pet.bag(element:3).count'])
  ID(['me.pet.bag(hpNOT0).count', 'me.pet.bag(hp>0).count', 'me.pet.bag(hp<50).count', 'me.pet.bag(stayTurn:2).count'])
  ID(['me.pet.bag(hp:0).max(hp)', 'me.pet.bag(hp:0).sum(hp)', 'me.pet.bag(hp:0).min(hp)', 'me.pet.bag(hp:0).count.dead'])
  ID(['me.pet.bag(chain:2).position', 'me.pet.bag(element:1).element', 'me.pet.bag(subElement:2).subElement',
    'me.pet.bag(movable:1).count'])
  ID(['me.pet.defElementRelation[3]', 'me.pet.defElementRelation[2]', 'me.pet.defElementRelation[abc]',
    'me.pet.defElementRelation[]'])
  ID(['me.pet.token.stayTurn', 'me.pet.token.element', 'me.pet.token.dead', 'me.pet.token.anger'])
  ID(['op.pet.bag.count', 'op.pet.bag(hp:0).count', 'op.pet.defElementRelation[3]', 'op.pet.token'])

  // buff 面: 单位控制器 (每次访问新建 ⇒ block 恒 [0]) 与类型名/过滤器两种括号。
  ID(['me.buff.count', 'me.buff.own', 'me.buff[1001].turn', 'me.buff[1001].value'])
  ID(['me.buff[1001].block', 'me.buff[1001].copy', 'me.buff[0].block', 'me.buff[1000].own'])
  ID(['me.buff[powerup].count', 'me.buff[powerup].own', 'me.buff[power].block', 'me.buff[Abnormal].own'])
  ID(['me.buff[1008].option[saturn]', 'me.buff[abc].count', 'me.buff(turnNOT0).count', 'me.buff(turn:2).max(turn)'])
  ID(['op.buff.count', 'op.buff[1001].turn', 'op.buff[powerdown].own', 'op.buff[buff].id'])

  // 宠侧控制器 (IS 那位装了四只印记, 元素 水 ⇒ 块 id 1000 被构造期滤掉, 袋子该剩 **3** 只)。
  // `.count` 这一条同时锁 `AddRangeBuff` 的 `isSuccess |= AddBuff(...)`: C# 的 `|=` 不短路,
  // 写成 JS 的 `isSuccess || addBuff(...)` 会在首个成功后停止添加 (实测只剩 1 只)。
  ID(['me.pet.buff.count', 'me.pet.buff[1001].own', 'me.pet.buff[1000].own', 'me.pet.buff[3].own'])
  ID(['me.pet.buff[9999].block', 'me.pet.buff[9999].count', 'me.pet.buff[totallyUnknown].count', 'me.pet.buff.turn'])
  ID(['me.pet.buff(turn:2).value', 'me.pet.buff(turnNOT2).turn', 'me.pet.buff(turn:4).max(turn)', 'me.pet.buff(valueNOT0).count'])
  ID(['op.pet.buff.count', 'op.pet.buff[1001].value', 'op.pet.buff(mark:1).count', 'op.pet.buff[1001].type'])

  // 硬编码三连 (me 支传 sourcePet 作 otherSource, op 支**不传** —— 上游就不对称)。
  ID(['me.pet.normalSkill[me.skill.id].position', 'op.pet.normalSkill[op.skill.id].position',
    'me.pet.defElementRelation[op.pet.element]', 'op.pet.defElementRelation[me.pet.element]'])
  ID(['me.pet.normalSkill[me.skill.id].power', 'op.pet.normalSkill[op.skill.id].power', 'me.skill.level', 'op.skill.level'])

  // skill 袋 + 单位技能系统 (getSkillByKey(null) 的 NRE 形状单独一条, 别混进批次)。
  ID(['me.pet.normalSkill[0].position', 'me.pet.normalSkill[0].power', 'me.pet.normalSkill[1].id', 'me.pet.normalSkill[3].power'])
  ID(['me.pet.superSkill.power', 'me.pet.superSkill.id', 'me.pet.skill.count', 'me.pet.skill[type:1].count'])
  // `me.skill.power`: tryGetSkillSystemIdentifier miss 后 `GetSkillByKey(null)` ⇒ 上游 NRE / 移植体同抛。
  // 单独一条, 别和能出值的批次混在一起 (throw-only 向量的信息量本来就只到"两边都抛")。
  ID(['me.skill.power'])
  ID(['me.superSkill.nope', 'me.buff[1001].nope', 'me.buff(turn:2).turn', 'me.buff[abc].nope'])

  // src=pet: BattlePet 实例 override 的六个臂 + 七个平键 (无 me. 前缀, 直接喂给 tryGetBattlePetIdentifier)。
  ID(['stayTurn', 'chain', 'element', 'subElement'], { src: 'pet' })
  ID(['movable', 'dead', 'token', 'position'], { src: 'pet' })
  ID(['element.group[2]', 'element.group[3][4]', 'subElement.group[9]', 'skill.count'], { src: 'pet' })
  ID(['skill[100].power', 'skill[type:1].count', 'skill.sum(power)', 'skill.max(power)'], { src: 'pet' })
  ID(['skill[ 101 ].power', 'skill[abc].count', 'skill.min(priority)', 'skill.id'], { src: 'pet' })
  ID(['normalSkill[0].position', 'normalSkill[0].power', 'normalSkill[1].id', 'normalSkill[3].power'], { src: 'pet' })
  ID(['normalSkill[2].id', 'normalSkill[0].id', 'superSkill.power', 'superSkill.anger'], { src: 'pet' })
  // `status.maxHp` / `bag(id:…)` 这类**基类臂真会算**的串本轮不发 (移植体在那里是显式围栏) —— 见上面的纪律。
  ID(['superSkill.id', 'superSkill.isSecondSuper', 'bag.count', 'bag(hp:0).count'], { src: 'pet' })
  ID(['element.group'], { src: 'pet' })

  // src=unit / src=buff / src=skill: idSource switch 的其余三支 (unit 必须落 `_` 支, 与 none 同值)。
  ID(['state.turn', 'me.pet.status.hp', 'nope', 'stayTurn'], { src: 'unit' })
  ID(['id', 'turn', 'value', 'option[saturn]'], { src: 'buff', buff: { id: 1008, turn: 4, value: 7, sets: { saturn: 1 } } })
  ID(['nope', '', 'type', 'count'], { src: 'buff', buff: { id: 1001, turn: 2, value: 5 } })
  ID(['id', 'power', 'type', 'anger'], { src: 'skill', skill: { id: 400, type: 4, power: 150, anger: 50, accuracy: 100, maxPP: 1, pp: 1, isSecondSuper: true } })
  ID(['accuracy', 'priority', 'critical', 'elementId'], { src: 'skill', skill: { id: 100, type: 1, power: 40, accuracy: 95, maxPP: 10, pp: 3, priority: 1, critical: 6.25 } })
  ID(['vipriority', 'combo', 'chain', 'nope'], { src: 'skill', skill: { id: 101, type: 1, power: 55, anger: 10, accuracy: 90, maxPP: 5, priority: -1, elementId: 3 } })
  ID(['option[source_index]', 'source_index', 'name'], { src: 'skill', skill: { id: 200, type: 2, sourceIndex: 7 } })

  // effect.sourcePet (me. 支的 otherSource) 与 effect.source 分开的字段。
  ID(['me.pet.position', 'me.pet.stayTurn', 'me.pet.bag.count', 'me.pet.element'], { sp: 'pet' })
  ID(['me.pet.status.hp', 'me.pet.dead', 'me.pet.token', 'me.pet.chain'], { sp: 'pet', src: 'unit' })

  // target. 前缀与 otherSource 的四种组合 —— trap #1 (短路决定削不削前缀)。
  ID(['target.status.maxHp', 'target.pet.status.maxHp', 'target.turn', 'target.nope'], { osrc: 'pet' })
  ID(['target.status.maxHp', 'target.pet.status.maxHp', 'target.turn', 'target.nope'], { osrc: 'pet', useOther: false })
  ID(['target.status.maxHp', 'target.pet.status.maxHp', 'target.turn', 'target.nope'], { osrc: 'unit', useOther: false })
  ID(['target.status.maxHp', 'target.pet.status.maxHp', 'target.turn', 'target.nope'], {})
  ID(['target.status.maxHp', 'target.element', 'target.value'], { osrc: 'buff', buff: { id: 1008, turn: 4, value: 7 } })
  ID(['target.powerup.atk', 'target.status.hp'], { osrc: 'pet', src: 'pet' })

  // parseEffectOperation: 负号前置 / 全角 '－' / 括号 / 操作符表切分。
  EX(['1+2*3', 'me.pet.status.maxHp-10', '－me.pet.status.hp', '-5+2'])
  EX(['state.turn*2+1', '(1+2)*3', 'me.pet.element+op.pet.element', 'elementRelation[atk:2][def:3]*2'])
  EX(['target.status.maxHp*2', 'target.status.hp+1'], { osrc: 'pet' })
  EX(['target.status.maxHp*2', 'target.status.hp+1'], { osrc: 'pet', useOther: false })
  EX(['skill[100].power+1', 'normalSkill[0].power*2'], { src: 'pet' })
  EX(['me.pet.bag(hp>0).count+1', 'me.buff.count*2'])

  // 无 dsl (effect=null) 的形状: 上游在 `effect.source` 上 NRE, 移植体同样抛 ⇒ throw-only 对。
  push({ kind: 'effectident', op: 'ident', ids: ['state.turn', 'me.pet.status.hp'], spec: IS })
  push({ kind: 'effectident', op: 'expr', exprs: ['1+me.pet.status.hp'], spec: IS })

  // 数值抖动版 (口径与 variant 一致: 只动数值与元素, 不动结构种类)。元素一改, 构造期的
  // blockBuffIds 就跟着改 ⇒ 同一份印记袋会被 AddRangeBuff 滤掉不同的印记, 这正是两边必须
  // 各自跑自己那份构造的证据。
  const isVar = (k) => {
    const s = cl(IS)
    const p = s.master.petSystem.petBag[0]
    p.hp = 70 - k * 7; p.maxHp = 100 + k * 5; p.anger = 33 + k * 9; p.el = k; p.sel = 9 - k
    p.stayTurn = 2 + k; p.chain = 1 + (k % 2)
    s.master.petSystem.petBag[1].hp = k
    s.master.petSystem.petBag[3].stayTurn = k
    for (const sk of p.normalSkills) if (sk) sk.power = sk.power + k
    p.loopSkills[0].anger = k; p.superSkill.power = 150 - k * 10
    s.client.petSystem.petBag[0].hp = 30 + k; s.client.petSystem.petBag[1].maxHp = 40 - k
    s.turn = 4 + k; s.whosTurn = (k % 3) - 1; s.phase = k; s.weather = [0, 2, 5][k % 3]
    return s
  }
  const IDV = (k, ids, x) => push({ kind: 'effectident', op: 'ident', ids, spec: isVar(k), dsl: '(1002)', ...x })
  for (const k of [0, 1, 2, 3]) {
    IDV(k, ['me.pet.status.maxHp', 'me.pet.status.hp', 'me.pet.status.lostHp', 'me.pet.status.anger'])
    IDV(k, ['me.pet.element', 'me.pet.subElement', 'me.pet.dead', 'me.pet.movable'])
    IDV(k, ['me.pet.bag(hp:0).count', 'me.pet.bag(element:3).count', 'me.pet.bag(dead:1).count', 'me.pet.bag(hpNOT0).count'])
    IDV(k, ['me.buff.count', 'me.buff[1000].own', 'me.buff[1001].own', 'me.buff[1008].turn'])
    IDV(k, ['elementRelation[atk:2][def:3]', 'elementRelation[atk:me.pet.element][def:op.pet.element]',
      'me.pet.defElementRelation[3]', 'me.pet.element.group[3]'], { src: 'pet' })
    IDV(k, ['skill.count', 'skill[type:1].count', 'skill.sum(power)', 'normalSkill[0].position'], { src: 'pet' })
    IDV(k, ['stayTurn', 'chain', 'superSkill.power', 'token'], { src: 'pet' })
    IDV(k, ['target.status.maxHp', 'target.status.hp', 'target.pet.status.maxHp'], { osrc: 'pet' })
  }
  for (const k of [0, 1, 2]) push({ kind: 'effectident', op: 'expr', exprs: ['me.pet.status.maxHp-10', 'state.turn*2+1', '－me.pet.status.hp'], spec: isVar(k), dsl: '(1002)' })

  // ── target (第五段·步骤1): Parser.GetBattlePetTargetList ────────────────
  // 规格把**能清的都清掉** (stateBuffs / unitBuffs / 宠的 buffs / 被动技能袋), 因为 fromDefault 要跑
  // `GetEffectsByTiming(OnSelectTarget, handler, …)` ⇒ handler.condition 对队列里**每一条**调一次判定
  // (effect-handler.ts:85), 而生产 JUDGE 到步骤 4 才是真的。**清不干净的那一条是天气**: `GetEffectHandler`
  // 无条件 addEffects(WeatherBuff.effects) (state.ts:803), 而真表 500000..500014 每个天气印记都带一条效果
  // ⇒ 队列恒 ≥1 ⇒ fromDefault 那八条今天不可比, 见下面陷阱 1 的说明。
  // 本轮 fromDefault 只发 cursor 落在洞上那条: 它在进队列之前就被 `Unit.pet` 的解引用拦下, 两边同抛。
  const TSPEC = (() => {
    const s = cl(BASE)
    s.settings.parallelCount = 1
    s.weather = 0; s.settings.weather = 0
    s.stateBuffs = []
    s.master.parallelCount = 1; s.client.parallelCount = 1
    s.master.skillSystems = [s.master.skillSystems[0]]
    s.master.unitBuffs = []; s.client.unitBuffs = []
    // 四格袋: 0=活(70/100) 1=死(0/80) 2=**洞** 3=满血活(50/50)。cursor 0 ⇒ defaultPet = 10001。
    s.master.petSystem = {
      cursor: 0, specialChance: 1,
      petBag: [{ id: 10001, hp: 70, maxHp: 100, stayTurn: 2, chain: 1, el: 2 },
        { id: 10002, hp: 0, maxHp: 80, el: 3 }, null,
        { id: 10003, hp: 50, maxHp: 50, chain: 2, el: 1 }],
      backupPetBag: [{ id: 10004, hp: 10 }, { id: 10005 }, null, { id: 10007 }],
      tokenPetBag: [{ id: 10006, anger: 88, el: 4, stayTurn: 3 }, null, null, { id: 10008, hp: 1, maxHp: 9 }],
    }
    s.client.petSystem = {
      cursor: 0, specialChance: 1,
      petBag: [{ id: 20001, hp: 30, maxHp: 60, el: 13, sel: 5, stayTurn: 1 },
        { id: 20002, hp: 40, maxHp: 40 }, { id: 20003, hp: 5, maxHp: 5 }, null],
      backupPetBag: [{ id: 20004 }], tokenPetBag: [null, { id: 20006 }],
    }
    return s
  })()
  const varC = (k) => {
    const s = cl(TSPEC)
    const p = s.master.petSystem.petBag
    p[0].hp = 70 - k * 7; p[0].maxHp = 100 + k * 5; p[0].stayTurn = 2 + k; p[0].el = k
    p[1].hp = k; p[3].maxHp = 50 - k; p[3].chain = k
    s.master.petSystem.tokenPetBag[0].el = k
    s.master.random = 11 + k
    return s
  }
  // 真表实测的 target_type 全集 (other 13 / index_other 6 / index_dead_other 5 / random_other 4 /
  // index 3 / random 1) 与 target_filter、target_num、target_index 的真值; 随机两支不发 (native),
  // 死循环形状 (random 且 target_num 缺省) 同 parallelApplyOOM 的先例在生成阶段挡掉。
  const TG = (opts, x = {}) => push({ kind: 'target', spec: TSPEC, effect: { target: 'pet_bag', ability: 'heal', options: opts }, ...x })

  TG({})
  TG({ target_type: 'other' })
  TG({ target_type: 'index_other', target_index: '0' })
  TG({ target_type: 'index', target_num: '1', target_index: '0' })
  TG({ target_type: 'index_dead_other', target_num: '1' })
  TG({ target_type: 'dead', target_num: '1' })
  TG({ target_num: '0' })
  TG({ target_num: '1' })
  TG({ target_type: 'other', target_num: '1' })
  // 洞: index 支绕过 filter/dead, 直接把 petBag[2] 的 null 端出来 (陷阱 2+3 同框)。
  TG({ target_type: 'index', target_index: '2' })
  TG({ target_type: 'index', target_index: '3' })
  // IsInRange 上界**不含** ⇒ index=4 掉回 target_num 支 (陷阱 3 的边界)。
  TG({ target_type: 'index', target_index: '4' })
  TG({ target_type: 'index', target_index: '-1' })
  // target_index 的两个真值字面量: `random` 读 unit.random (不是 native), `value` 走 GetNumIdentifier。
  TG({ target_type: 'index', target_index: 'random' })
  TG({ target_type: 'index', target_index: 'value' })
  TG({ target_num: 'random' })
  // 真表里唯一一条带 filter 的可比形状 (on_select_target heal 的那份 options)。
  TG({ target_type: 'other', target_filter: '(dead:0)(status.hp<status.maxHp)', target_num: '1' })
  TG({ target_filter: '(dead:0)' })
  TG({ target_filter: '(chain:2)' })
  TG({ target_filter: '(stayTurn:2)(dead:0)' })
  TG({ target_filter: 'none' })
  // 陷阱 1: 除 pet_bag/token 之外的一切 target 都静默走 fromDefault ⇒ "当前上场宠"。
  // 计划里"fromDefault 无判定 ⇒ 不需要 JUDGE"这个前提被实测推翻了: `GetEffectHandler` 无条件把
  // `WeatherBuff.effects` 塞进队列 (state.ts:803), 而真表 500000..500014 **每个天气印记都有一条效果** ⇒
  // 队列恒 ≥1 ⇒ `GetEffectsByTiming` 的 `handler.condition` 必调 JUDGE (effect-handler.ts:85)。
  // 步骤 4 把真判定移植进 effect-judge 后, harness 用 `judge:true` 只在**这一批**注入真 JUDGE (与
  // `effectcond` 同批), oracle 侧 TargetVector 也照 JudgeWorld 注上 currentState ⇒ 这八条今天可比了。
  // 八种词全部落到 default 支 (pet/skill/state/buff/item/none 是被认的枚举词, heal/未知词 不在词表 ⇒
  // toEffectTarget 兜 None); 观测的是"跑完 condition 后 fromDefault 交出哪只宠", 结果由 oracle 坐实。
  const TF = (target, x = {}) => push({ kind: 'target', judge: true, spec: TSPEC, effect: { target, ability: 'heal', options: {} }, ...x })
  for (const t of ['pet', 'skill', 'state', 'buff', 'item', 'none', 'heal', 'zzz_unknown']) TF(t)
  // 兜底分支本身有一条**不需要 JUDGE** 的证据: cursor 落在洞上 ⇒ `Unit.pet` 为 null,
  // `GetEffectHandler` 在解引用处就抛 ⇒ 两边同抛, 抛出点由 oracle 的 NRE 坐实 (见下面 cursor=2)。
  // token 支: 有替身给单元素表, 没有给**空表** (不是含 null 的表)。
  push({ kind: 'target', spec: TSPEC, effect: { target: 'token', ability: 'powerup' } })
  push({ kind: 'target', spec: (() => { const s = cl(TSPEC); s.master.petSystem.cursor = 1; return s })(), effect: { target: 'token', ability: 'powerup' } })
  // defaultPet 的两条来源: invokeUnit 不同侧 ⇒ 只看 lhsUnit.pet; 同侧且有 sourcePet ⇒ 用它。
  TG({}, { ivk: 'rhs' })
  TG({ target_type: 'other' }, { ivk: 'rhs', sp: 'lhs' })
  TG({ target_type: 'other' }, { sp: 'rhs' })
  TG({}, { sp: 'none' })
  // cursor 落在洞上 ⇒ lhsUnit.pet 是 null, 而 fromDefault 的 handler 拼装先解引用 pet ⇒ 两边同抛。
  push({ kind: 'target', spec: (() => { const s = cl(TSPEC); s.master.petSystem.cursor = 2; return s })(), effect: { target: 'pet', ability: 'heal' } })
  // 袋子里全是死的 / 全被 filter 掉 ⇒ 空表与"含 null 的一格"必须能分开。
  TG({ target_type: 'dead' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].hp = 0; s.master.petSystem.petBag[3].hp = 0; return s })() })
  TG({ target_type: 'index', target_index: '1' })
  for (const k of [0, 1, 2, 3]) {
    TG({ target_type: 'other', target_num: String(k) }, { spec: varC(k) })
    TG({ target_type: 'index_other', target_index: String(k) }, { spec: varC(k) })
    TG({ target_filter: '(dead:0)(status.hp<status.maxHp)' }, { spec: varC(k) })
    TG({ target_type: 'index_dead_other' }, { spec: varC(k) })
  }

  // ── effectcond / effectapply (第五段·步骤4): 判定/执行外壳 ───────────────
  // 可比性纪律 (生成阶段挡住, 不发出去当假分歧):
  //   · 不发 random_type=rng 的形状 (native Random.Range(0,100)), 也不发表达式里含 `random` 的 cmp (native);
  //   · 不发 state==null 的 Pet/Status/Buff 家族 (裸 invokeUnit 在核心里没有 base Pet 模型 ⇒ 移植体 NOT_PORTED);
  //   · SkillCondition 的 LastSkill 在 state==null 读 state.lastTurnState 会 NRE ⇒ 那支不发;
  //   · Apply 上一轮只发 ability=none (⇒ `_ => DefaultAbility`, 不改状态); 第六段批一起按 oracle 的
  //     PortedAbilities 白名单逐支放量 (见下面 set_damage / add_status 那一段)。白名单外的 ability
  //     在 oracle 侧抛 MissingMemberException ⇒ 归 infra, 所以「镜像写了、oracle 没放行」不会假绿。
  // 值全部由 oracle 算, 这里只保证**分支形状**覆盖到, 不猜 golden。
  const EC = (x) => push({ kind: 'effectcond', ...x })
  const EA = (x) => push({ kind: 'effectapply', ...x })
  const CS = TSPEC   // master 上场宠活着 (cursor 0)、有对侧 clientUnit; 天气/状态印记袋已清 ⇒ 判定读的都是确定值

  // ① 相位门 + 常驻放行 (state==null): resident 过关, 非 resident 被 checkPhase 拦下, checkPhase=false 再放行。
  EC({ effect: { timing: 'resident', condition: 'none' } })
  EC({ effect: { timing: 'resident', condition: 'none' }, checkPhase: false })
  EC({ effect: { condition: 'none' } })                                  // timing=none ≠ resident, state null ⇒ 相位不过 ⇒ false
  EC({ effect: { condition: 'none' }, checkPhase: false })               // 绕过相位门 ⇒ 家族 none 恒真 ⇒ true
  EC({ effect: { timing: 'resident', condition: 'none' }, checkTurn: false })
  // ② Unit 家族 (state==null ⇒ 无上下文 ParseOperation, 纯字面量可比; 含"无优先级"那条 (1+2)=3)。
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '5', 'type[0].op': '=', 'type[0].cmp': '5' }] } })
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '5', 'type[0].op': '=', 'type[0].cmp': '6' }] } })
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '1+2', 'type[0].op': '=', 'type[0].cmp': '3' }] } })
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '1/2', 'type[0].op': '=', 'type[0].cmp': '3', 'type[1].op': '>', 'type[1].cmp': '0' }] } })
  // ③ on_fail 改写块 (条件不成立 ⇒ 永久改写 target/ability/abilityOptionDict, 抹掉 on_fail)。E= 签名把改写后的形状拍下来。
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '1', 'type[0].op': '=', 'type[0].cmp': '2', on_fail: '(1002)' }] } })
  EC({ effect: { timing: 'resident', condition: 'unit', condOptions: [{ type: '1', 'type[0].op': '=', 'type[0].cmp': '2' }] } })  // 无 on_fail ⇒ 原样 false
  // ④ Apply: ability=none ⇒ DefaultAbility。condition 缺省 ⇒ 恒真 (不改状态)。
  EA({ effect: { timing: 'resident', ability: 'none' } })
  EA({ effect: { timing: 'resident', ability: 'none', options: { condition: '(1002)' } } })   // 子效果走预制体表解析
  EA({ effect: { timing: 'resident', ability: 'none', options: { condition: 'none' } } })      // 'none' ⇒ 恒真
  EA({ spec: CS, effect: { ability: 'none', options: { repeat: '2' } } })                        // state!=null: repeat 走表达式 (int) 截断
  EA({ effect: { timing: 'resident', ability: 'none', options: { repeat: '3' } } })              // state==null: int.Parse('3')=3 ⇒ 跑 3 轮恒真

  // ⑤ state!=null 的前置检查与六个家族 (全部 checkPhase:false 绕开相位门, 只测家族/预检本身; 一律不带 random 键,
  //    因为 RandomNumber 首行读 Player.instance.random (解引用空 petBag ⇒ NRE), 带 random 的形状天生不可比)。
  // 回合门: CS.turn=4 (even)、whosTurn=1 ⇒ turn_num=odd 判 false, =even 判 true。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ turn_num: 'odd' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ turn_num: 'even' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ turn_num: 'all', whos_turn: 'me' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ turn_num: 'all', whos_turn: 'all' }] } })
  // 天气门: CS.weather=0。weather=0 命中, weather=5 不命中, weather=all 放行, weather=abc 非整数 ⇒ false。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ weather: '0' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ weather: '5' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ weather: 'all' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ weather: 'abc' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ weather: '2', weather_op: '>' }] } })
  // 攻击/命中门: whos_attack=all 放行; 其余按当前相位分支 (值由 oracle 算, 两边同)。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ whos_attack: 'all' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ whos_attack: 'me', is_hit: 'all', is_move: 'all' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ whos_attack: 'me', is_hit: 'true', is_move: 'all' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'none', condOptions: [{ whos_attack: 'me', is_hit: 'maybe' }] } })  // TryParse 失败 ⇒ false
  // Unit 家族 (state!=null): me./state 标识符走 ParseEffectOperation。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'unit', condOptions: [{ type: 'state.turn', 'type[0].op': '=', 'type[0].cmp': '4' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'unit', condOptions: [{ type: 'state.turn', 'type[0].op': '>', 'type[0].cmp': '3' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'unit', condOptions: [{ type: 'me.pet.hp', 'type[0].op': '>', 'type[0].cmp': 'state.turn+7' }] } })
  // Pet 家族: own true/false 的两支 + hp 比较 (CS master 上场宠 hp 70/maxHp 100)。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'pet', condOptions: [{ own: 'true', type: 'hp', 'hp_op': '=', 'hp_cmp': '70' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'pet', condOptions: [{ own: 'false', type: 'none' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'pet', condOptions: [{ own: 'maybe' }] } })  // TryParse 失败 ⇒ false
  // CurrentToken 走同一支 (battlePet=lhsUnit.token)。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'token', condOptions: [{ own: 'false', type: 'none' }] } })
  // Status 家族: hp 走 70/100, anger 走 33/?, 分数比较用 DataType。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'status', condOptions: [{ status_type: 'hp', op: '=', cmp_value: '7/10' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'status', condOptions: [{ status_type: 'hp', op: '>', cmp_value: '1/2' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'status', condOptions: [{ status_type: 'anger', op: '=', cmp_value: '1/1' }] } })
  // Buff 家族: id=0 & key 空 ⇒ 早真; BuffType 名走 GetRangeBuff; 数字 id 走过滤器 (CS 宠无印记 ⇒ buff null)。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'buff', condOptions: [{ own: 'true', id: '0', key: '' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'buff', condOptions: [{ own: 'true', id: 'powerup', type: 'none' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'buff', condOptions: [{ own: 'false', id: '1008', type: 'none' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'buff', condOptions: [{ own: 'maybe' }] } })
  // Skill 家族 (CurrentSkill): type none ⇒ true; 非 none 走 GetSkillIdentifier。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'skill', condOptions: [{ type: 'none' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'skill', condOptions: [{ type: 'count', 'count_op': '>', 'count_cmp': '0' }] } })
  // Poker: CS 无 poker 组印记 ⇒ cards 空; count=0; 空组上 .Max() 会抛 (单测锁形状, 这里不发 point/color.max)。
  EC({ spec: CS, checkPhase: false, effect: { condition: 'poker', condOptions: [{ type: 'none' }] } })
  EC({ spec: CS, checkPhase: false, effect: { condition: 'poker', condOptions: [{ type: 'count', 'count_op': '=', 'count_cmp': '0' }] } })
  // DefaultAbility 的子效果递归: condition 指向一条 resident 预制体 (1002), 子效果再判一次相位/家族。
  EA({ effect: { timing: 'resident', ability: 'none', options: { condition: '(1002)' } }, ivk: 'null' })

  // ── 第六段·批一步骤1: 算子本体 set_damage / add_status ──────────────────
  // oracle 侧的 PortedAbilities 白名单 ({0,8,14} → 逐步扩) 与这里的形状**一一对应**: 越界形状在 oracle
  // 抛 MissingMemberException 归 infra, 所以忘了同步不会假绿。签名这轮已经带上 init/add/mult/hid/pw/cur/bf
  // 七段 (步骤 0), add_status 与后续 powerup 的落点今天才可见。
  // 不发形状: 表达式里含 `random` 叶 (native); `value` 读 rhs 而 rhsUnit 为 null 的 last 组合另说。
  const SD = (spec, options, eff = {}, x = {}) =>
    EA({ ...(spec === null ? {} : { spec }), effect: { ability: 'set_damage', options, ...eff }, ...x })
  const AS = (spec, options, eff = {}, x = {}) =>
    EA({ ...(spec === null ? {} : { spec }), effect: { ability: 'add_status', options, ...eff }, ...x })
  // CS 的 skillSystem 账本是空的 ⇒ 先喂四把键, 才拍得到 damageDict 的 start/end/contain 三支。
  const CS_DICT = (() => {
    const s = cl(TSPEC)
    s.master.skillSystems[0].damageDict = { skill_a: 1, buff_x: 2, endskill: 4, plain: 3 }
    return s
  })()
  // OnTurnEnd (=17): normalHpType 的三支 (skill/item/buff) 全落 buffDamage, 优先级在 type=="skill" 之前。
  const CS_END = (() => { const s = cl(TSPEC); s.phase = 17; return s })()
  // lastTurnState 有/无两支都要拍: "last" 且缺 last ⇒ damageState=null (数值不解析) 或
  // who=other 直接 NRE; 带 last ⇒ 数值取**上一帧**的宠, 账本却记在**当前帧** (上游 :1251 的 quirk)。
  const CS_LAST = (() => {
    const s = cl(TSPEC)
    s.last = { turn: 2, master: { id: 1, petSystem: { cursor: 0, petBag: [{ id: 10001, hp: 12, maxHp: 90 }] } } }
    return s
  })()

  // ① 三支账本字段 + damageDict 兜底 (无 option ⇒ 直接拿 type 当键, 键不存在也**会**新建)。
  SD(CS, { type: 'skill', op: '+', value: '10' })
  SD(CS, { type: 'item', op: '+', value: '7' })
  SD(CS, { type: 'buff', op: '+', value: '3' })          // phase≠OnTurnEnd ⇒ 落 damageDict["buff"]
  SD(CS, { op: '+', value: '5' })                        // type 缺省 "skill"
  SD(CS_DICT, { type: 'plain', op: '=', value: '9' })
  SD(CS_DICT, { type: 'plain', op: '-', value: '9' })
  SD(CS_DICT, { type: 'plain', op: 'zzz', value: '9' })  // 未知 op ⇒ Operator.Operate 给 0 ⇒ 写 0
  // ② (int) 截断: float / 分数 / 负数三形。
  SD(CS, { type: 'skill', value: '7.9' })
  SD(CS, { type: 'skill', value: '1/3' })                // DSL: 1/3 = 0.333… ⇒ (int) 0
  SD(CS, { type: 'skill', value: '-5' })
  // ③ OnTurnEnd 优先支 (skill/item/buff 三支都改道 buffDamage) 与它之外的 type。
  SD(CS_END, { type: 'skill', value: '10' })
  SD(CS_END, { type: 'item', value: '10' })
  SD(CS_END, { type: 'buff', value: '10' })
  SD(CS_END, { type: 'plain', value: '10' })
  // ④ damageDict 的三个 option 词 (真表实测三词都在) + 一个不认的词 (⇒ 退回 [type])。
  SD(CS_DICT, { option: 'start', type: 'skill', value: '4' })
  SD(CS_DICT, { option: 'end', type: 'skill', value: '4' })
  SD(CS_DICT, { option: 'contain', type: 'skill', value: '4' })
  SD(CS_DICT, { option: 'zzz', type: 'plain', value: '4' })
  // ⑤ who=other: 记账本的是**对侧** unit (CS 的 client 上场宠 30/60)。
  SD(CS, { who: 'other', type: 'skill', value: '6' })
  SD(CS, { who: 'other', type: 'me.pet.hp', value: '6' })   // type 是任意串 ⇒ damageDict[那把键]
  // ⑥ state="last" 的四格矩阵: last 有无 × who me/other。who=other 且 last 缺 ⇒ damageState null ⇒ 两边同抛。
  SD(CS, { state: 'last', type: 'skill', value: '8' })              // damageState=null ⇒ 数值不解析, damage 保持 0
  SD(CS, { state: 'last', who: 'other', type: 'skill', value: '8' })
  SD(CS_LAST, { state: 'last', type: 'skill', value: '8' })
  SD(CS_LAST, { state: 'last', who: 'me', value: 'me.pet.hp' })      // 数值读**上一帧**的 12, 账本记当前帧
  SD(CS_LAST, { state: 'last', who: 'other', value: '2' })
  // ⑦ repeat=2 ⇒ Apply 的 `result &=` 不短路, 两支都真跑 (副作用落两次: 10+10)。
  SD(CS, { type: 'skill', value: '10', repeat: '2' })
  // ⑧ state==null 的抛出点: 上游 (Unit)effect.invokeUnit 之后立刻 state.GetUnitById ⇒ NRE。
  SD(null, { type: 'skill', value: '1' })
  SD(null, { state: 'last', type: 'skill', value: '1' })

  // add_status: 先乘后加, 六维/隐藏维/init 表三条落点分开拍。
  AS(CS, {})                                        // 全缺省: type"5"(hp) mult"0/1"⇒0 add"0" ⇒ 只加 0
  AS(CS, { mult: '2', add: '5' })                   // multCurrentStatus(5,2) + addBattleStatus(5,5)
  AS(CS, { mult: '0', add: '5' })                   // mult 为 0 ⇒ 乘那步整个跳过
  AS(CS, { key: 'init', mult: '2', add: '3', type: '0' })  // MultInitStatus 忽略 type ⇒ **整表** ×2
  AS(CS, { key: 'init', add: '3', type: '1' })
  AS(CS, { type: '0/1', mult: '2' })                // 两段 type ⇒ 逐维乘
  AS(CS, { type: '12', add: '4' })                  // ≥6 ⇒ 减 6 落隐藏段 (rec)
  AS(CS, { type: '6', add: '4' })                   // 隐藏段第一位 (hit)
  AS(CS, { type: '' })                              // ToIntList("") ⇒ 空表 ⇒ return false
  AS(CS, { type: 'none' })                          // "none" ⇒ 同上
  AS(CS, { type: 'abc' })                           // float 解析失败 ⇒ GetNumIdentifier("abc") ⇒ 值由 oracle 定
  AS(CS, { mult: 'me.pet.hp', add: 'state.turn' })  // 两个表达式每宠每维**重算**
  AS(CS, { mult: '2', add: '1', repeat: '2' })      // ×2 两次 ⇒ mult 段可观测
  // 目标列表: fromDefault (当前上场宠) 之外, 打 pet_bag 的 other (四格袋里活着的三只)。
  AS(CS_DICT, { target_type: 'other', add: '2', type: '0' }, { target: 'pet_bag' })
  AS(CS_DICT, { target_type: 'dead', add: '2', type: '0' }, { target: 'pet_bag' })
  // 洞: index 支把 petBag[2] 的 null 直接端出来 ⇒ `pet.statusController` 两边同抛。
  AS(CS_DICT, { target_type: 'index', target_index: '2', add: '1' }, { target: 'pet_bag' })
  AS(CS_DICT, { who: 'other', add: '2', type: '0' })
  AS(null, { add: '1' })                             // state==null ⇒ 上游 state.GetUnitById NRE

  // ── 第六段·批一步骤3: 算子本体 add_buff / remove_buff ────────────────────
  // **印记候选白名单** (本批唯一防「触发递归踩到未移植算子」的闸门; 复算 = `node tools/buff-whitelist.mjs`):
  //   buffs.json 的 2121 行里, 挑每条的 **on_add_buff(-3) / on_remove_buff(-4) / all(-999)** 三个时机上的
  //   效果, 要求算子 ⊆ oracle 的 PortedAbilities ⇒ 白名单 {0, 8, 14, 10, 11} 时 **1904 安全 / 217 脏**,
  //   加上 heal(5) 后 **1954 安全 / 167 脏**; 批三/批四再扩 (现值 13 个 id:
  //   `{0,8,14,10,11,5,3,4,15,1,2,17,9}`) 复算 = **2029 安全 / 92 脏**, 脏分布
  //   `rage=56 set_buff=37 set_pet=32 powerup=27 poker=1 set_pet_bag=1`。
  //   ⚠ 下面的"安全样本"是**手工挑死的**, 白名单扩大**不会**自动放量 —— 想加样本得手工挑 + 重跑全量。
  //   ⚠ 要不要把 **on_effect(-10)** 算进扫描集, 对这两个数字**没有影响** —— 全表只有 6 行挂 on_effect
  //   (93 / 1020 / 2102 / 3668 / 100993 / 200471), 它们的算子全是 `set_effect` (baked abilityId=0),
  //   本来就在白名单里。下面 heal 一节要的就是这 6 行。
  //   脏的典型是 -8 / 11 / 12 / 13 / 14 / 69 / 70 / 87 (on_add_buff 挂 block_buff|rage), 以及所有挂
  //   set_buff / copy_buff / set_skill 触发的行 —— 那些算子还没搬, 一旦进了递归就是
  //   「oracle 真跑、TS 抛 NOT_PORTED」的翻红。
  //   ⚠ **7=Powerup 不算进白名单**, 尽管 TS 侧已经把算子搬了: 那 15 条"只挂 powerup"的行 (95 / 3218 /
  //   3383 / 3458-3461 / 3675 / 214798 / -3000 / -3032~-3036) 走 TS 不抛、走 oracle 却撞 Powerup 的
  //   **方法入口** SecurityException (本文件末尾 powerup 一节的说明) ⇒ 照旧归脏, 别当安全样本用。
  // 这里用到的安全样本: 18/21/22/29/41/57/58/81 (mark|replace, 两个时机都是 add_status)、
  //   1~10 与 -9/-10 (mark|stack, 效果只有 none)、31(shield|max) / 32(shield|min) / 85(chance|block) /
  //   2108(mark|new)、92 (field 锁) / -2001~-2004 (保护) / 3591 (全表唯一一行 type=new) / 101 (abnormal|replace|turn2)。
  // native RNG 闸门 (生成阶段挡掉, 函数体由 node --test 锁形状):
  //   · `unique[...]` / `random[...]` 筛出**非空**候选后那句 `.Random()` (:795/:807) ⇒ 只发「筛空 ⇒ return false」;
  //   · 抗性支要袋里带 -2005 且它的 `option[<型>Id]` 正好等于新印记 id ⇒ 本批一律不带 -2005;
  //   · remove_buff 的 `random_count ∈ [0, 候选数]` (:909) ⇒ 只发缺省 -1 (⇒ int.MaxValue ⇒ 掷骰前短路的整表);
  //   · 表达式里含 random / me.random 叶。
  const AB = (spec, options, eff = {}, x = {}) =>
    EA({ ...(spec === null ? {} : { spec }), effect: { ability: 'add_buff', options, ...eff }, ...x })
  const RB = (spec, options, eff = {}, x = {}) =>
    EA({ ...(spec === null ? {} : { spec }), effect: { ability: 'remove_buff', options, ...eff }, ...x })
  // 往袋子里塞印记: master 上场宠的 buffController.buffs (oracle 的 BattlePet 吃同一个规格),
  // 顺带给 stateBuffs / unitBuffs / 增幅起点三个落点留口子。
  const bagged = (buffs, over = {}) => {
    const s = cl(TSPEC)
    s.master.petSystem.petBag[0].buffs = buffs
    if (has(over, 'client')) s.client.petSystem.petBag[0].buffs = over.client
    if (has(over, 'state')) s.stateBuffs = over.state
    if (has(over, 'unit')) s.master.unitBuffs = over.unit
    if (has(over, 'powerup')) s.master.petSystem.petBag[0].powerup = over.powerup
    return s
  }

  // ① id 的第一形态 (普通表达式) 与 18 号那条**递归**: on_add_buff = add_status(type 8, +100) ⇒
  //    签名里宠的 `add=` 段跟着动。这是本批第一次拍到算子跑进控制器再回判定层。
  AB(CS, { id: '18' })
  AB(CS, { id: '18', turn: '3' })
  AB(CS, { id: '18', value: '7' })
  AB(CS, { id: '18', turn: 'me.pet.hp/10', value: 'state.turn' })   // 两个表达式都是整值 (70/10、4)
  AB(CS, {})                          // id 缺省 "0" ⇒ GetBuffInfo(0)=null 且 key 空 ⇒ :820 return false
  AB(CS, { id: '999999' })             // 表里没有 ⇒ 同上
  AB(CS, { id: '18/21' })              // 没带 `!` ⇒ 整串当**一个**表达式 ⇒ 解析不出 18 ⇒ false
  // ② 列表形态 `![a/b]` —— 剥掉 `!` 后再砍首尾各一字符, 所以外层必须是 `[...]` (真表实测同形)。
  AB(CS, { id: '![18/21]', turn: '![3/4]', value: '![7/8]' })         // 三支等长 ⇒ 两条印记
  AB(CS, { id: '![18/21]', turn: '![3/4]' })                          // valueExpr 只有 1 项 ⇒ k=1 硬索引抛
  AB(CS, { id: '![18/21]', turn: '3', value: '![7/8]' })              // turnExpr 短 ⇒ 同抛
  // ③ `unique[...]`: 只发「候选筛空 ⇒ :792 return false」的确定支 (非空候选要掷骰)。
  AB(CS, { id: 'unique[all]' })                                       // 全表没有一行是 all 型 ⇒ 空表
  AB(bagged([{ id: 1 }, { id: 2 }]), { id: 'unique[1|2]' })           // ToIntRange 的 `|` 枚举 + 已在袋被筛光
  AB(bagged([{ id: 1 }, { id: 2 }]), { id: 'unique[1~2]' })           // 同一支的区间写法
  AB(bagged([{ id: 3591 }]), { id: 'unique[new]' })                   // 走 buffIdsOfType (按类型枚举真表)
  AB(CS, { id: 'unique[all]', key: 'state' })                         // :788 的 key 非空检查**先**于筛空
  AB(CS, { id: 'unique[zzz]' })                                       // 既不是型名也不是数字 ⇒ ToIntRange int.Parse 抛
  AB(CS, { id: 'unique[(1]' })                                        // 括号形状不对 ⇒ 落 else 当表达式解析
  // ④ option=(k:v) 与它的列表形态; ElementAtOrDefault 的容错是 turn/value 两支**没有**的。
  AB(CS, { id: '18', option: '(value:50)' })
  AB(CS, { id: '18', option: '(hide:true)(removable:false)' })
  AB(CS, { id: '18', option: '(zzz:nope)' })                          // 未知叶 ⇒ 0 ⇒ 写 "0"
  AB(CS, { id: '18', option: '()' })                                  // 空括号 ⇒ 解析出空表 ⇒ 整段跳过
  AB(CS, { id: '![18/21]', turn: '![3/4]', value: '![7/8]', option: '(value:50)' })   // k=1 越界 ⇒ 第二条没 option
  AB(CS, { id: '![18/21]', turn: '![3/4]', value: '![7/8]', option: '![(value:50)/(nope:1)]' })
  // ⑤ key 的四支: state 袋 / unit 袋 / field (被 92 锁) / rule* (留给 pvp)。
  AB(CS, { id: '18', key: 'state' })
  AB(bagged([], { state: [{ key: 'state', buff: { id: 21, turn: 2 } }] }), { id: '18', key: 'state' })
  AB(bagged([], { unit: [{ id: 21, turn: 2 }] }), { id: '18', key: 'unit' })       // Unit.AddBuff 是平行实现, 不触发印记
  AB(CS, { id: '18', key: 'field' })
  AB(bagged([{ id: 92 }]), { id: '18', key: 'field' })               // isFieldLocked ⇒ continue ⇒ false
  AB(bagged([], { client: [{ id: 92 }] }), { id: '18', key: 'field' })  // 对侧的 92 一样算锁
  AB(CS, { id: '18', key: 'rule_a' })
  AB(bagged([], { state: [{ key: 'state', buff: { id: 21, turn: 2 } }] }), { id: '999999', key: 'state' })
  //   ↑ newBuff 是 null, 但 :850 的 RemoveAll **已经跑过** ⇒ 旧那条被摘走而 apply 仍 false。
  // ⑥ copyHandleType 六支 (同 id 二次入场才走到): 1=stack / 85=block / 101=replace / 31=max / 32=min / 2108=new。
  AB(bagged([{ id: 1, value: 2 }]), { id: '1', value: '3' })
  AB(bagged([{ id: 1, value: 2 }]), { id: '1', value: '3', turn: '2' })   // stack 支同时改时长
  AB(bagged([{ id: 85 }]), { id: '85' })
  AB(bagged([{ id: 101, turn: 2, value: 5 }]), { id: '101', value: '7' })
  AB(bagged([{ id: 31, value: 5 }]), { id: '31', value: '4' })
  AB(bagged([{ id: 32, value: 5 }]), { id: '32', value: '4' })
  AB(bagged([{ id: 2108 }]), { id: '2108' })
  // ⑦ 目标列表与 who: 整袋 (四格里活着的三只都进袋) / 死的那格 / who=other 让发起方走到对侧。
  AB(CS, { id: '18', target_type: 'other' }, { target: 'pet_bag' })
  AB(CS, { id: '18', target_type: 'dead' }, { target: 'pet_bag' })
  AB(bagged([{ id: 1 }]), { who: 'other', id: '21' })
  // ⑧ repeat=2 + block 印记: 第一轮装进袋, 第二轮落 false ⇒ Apply 的 `result &=` 不短路 (副作用留在签名里)。
  AB(CS, { id: '85', repeat: '2' })
  // ⑨ state==null ⇒ 上游 state.GetUnitById 立刻 NRE (与 set_damage / add_status 同形)。
  AB(null, { id: '18' })

  // ── remove_buff ────────────────────────────────────────────────────────
  // 它**不走** target 列表, 只动 lhsUnit 的印记袋 (key=="unit" 时动 unitBuffs, 否则动 stateBuffs)。
  // 与 add_buff 不一样的一条: `id` 在这里是 `Split('/')` 后**每段当表达式**, 没有 `![…]` 列表形态。
  // ① 按 id 摘 (18 号的 on_remove_buff 是 add_status ⇒ 与上面 ① 那条递归成对)。
  RB(bagged([{ id: 18 }]), { id: '18' })
  RB(CS, { id: '18' })                               // 袋里没有 ⇒ false
  RB(bagged([{ id: 18 }, { id: 21 }]), { id: '18/21' })   // '/' 直接切段, 每段一条表达式
  RB(bagged([{ id: 18 }, { id: 21 }]), { id: '![18/21]' })
  //   ↑ 真表里 add_buff 有 `![…]` 形态, remove_buff **没有**: 段变成 `![18` / `21]`, 两边同一处理 (未知叶 ⇒ 0 ⇒ 被表筛掉)。
  RB(bagged([{ id: 18 }]), { id: 'state.turn' })    // 表达式 ⇒ TSPEC 的 turn=4, 4 号不在袋 ⇒ false
  RB(bagged([{ id: 4 }]), { id: 'state.turn' })     // 同一个表达式命中袋里那只
  RB(CS, {})                                         // 全缺省: id "0" 被表筛掉、type none、key 空 ⇒ 三支都不进
  RB(CS, { id: 'zzz' })                              // 未知叶 ⇒ 0 ⇒ 同上
  // ② filter 谓词 (每段都是表达式; 袋里的真印记走 ParseEffectOperation(id, …, buff, false))。
  RB(bagged([{ id: 18, turn: 3 }]), { id: '18', filter: '(turn>0)' })
  RB(bagged([{ id: 18, turn: -1 }]), { id: '18', filter: '(turn>0)' })   // 谓词落空 ⇒ 不摘
  RB(bagged([{ id: 18 }]), { id: '18', filter: 'none' })
  // ③ 按 type 摘。TurnBased 认的是**实例的 turn>0** (不是表里的 typeRaw), Mark 才走 info.type;
  //    保护印记只在 turn/chance/powerup/powerdown 四型上有值 (getProtectBuffTypeId 其余 ⇒ 0)。
  RB(bagged([{ id: 18 }]), { type: 'mark' })
  RB(bagged([{ id: 18 }, { id: 1000, turn: 3 }]), { type: 'mark/unhealthy' })  // 第二段: 1000 是 unhealthy 型
  RB(bagged([{ id: 39, turn: 2 }]), { type: 'turn' })                     // turn>0 ⇒ TurnBased 命中
  RB(bagged([{ id: 39, turn: -1 }]), { type: 'turn' })                    // 表里 typeRaw 是 turn, 实例 turn≤0 ⇒ 不命中
  RB(bagged([{ id: 39, turn: 2 }, { id: -2001 }]), { type: 'turn' })      // -2001 ⇒ 这一型**整个** continue
  RB(bagged([{ id: 85 }, { id: -2002 }]), { type: 'chance' })             // -2002 ⇒ 同上
  RB(bagged([{ id: 18 }]), { type: 'none' })                              // "none" 被筛掉 ⇒ isType false
  RB(bagged([{ id: 18 }]), { type: 'zzz' })                               // 未知词同样筛掉
  // ④ 增幅族: `powerup`=Power (增+减全要)、`powerup.pos`/`powerup.neg` 各一批; 它们把 id 塞进 idRange,
  //    于是 :953 的保护、:960 的 powerId 映射与 :965 的 XOR 全都走同一条。
  RB(bagged([{ id: 1 }, { id: 2 }], { powerup: [3, -3, 0, 0, 0, 0] }), { type: 'powerup' })
  RB(bagged([{ id: 1 }, { id: 2 }], { powerup: [3, 3, 0, 0, 0, 0] }), { type: 'powerup.pos' })
  RB(bagged([{ id: 1 }, { id: 2 }], { powerup: [3, 3, 0, 0, 0, 0] }), { type: 'powerup.neg' })
  RB(bagged([{ id: 1 }, { id: -2003 }], { powerup: [3, 0, 0, 0, 0, 0] }), { id: '1' })
  RB(bagged([{ id: 2 }, { id: -2004 }], { powerup: [-3, 0, 0, 0, 0, 0] }), { id: '2' })
  //    ↑ 被保护的那只**同时从 idPowerResult 摘掉** ⇒ 既不清增幅, 也不进 :968 那次 RemoveRangeBuff。
  // :960 的 powerId: -9/-10 写死 5, 其余 (id-1)/2 向零截断 ⇒ 1/2 同落 0, 3/4 同落 1。
  RB(bagged([{ id: -9 }], { powerup: [0, 0, 0, 0, 0, 5] }), { id: '-9' })
  RB(bagged([{ id: -10 }], { powerup: [0, 0, 0, 0, 0, -5] }), { id: '-10' })
  RB(bagged([{ id: -10 }], { powerup: [0, 0, 0, 0, 0, 5] }), { id: '-10' })
  // :965 的 XOR 四格真值表 (奇偶 × 当前正负), 全部走 id 支以免 type 支先把袋子改了。
  RB(bagged([{ id: 1 }], { powerup: [3, 0, 0, 0, 0, 0] }), { id: '1' })    // 奇·正 ⇒ 清
  RB(bagged([{ id: 1 }], { powerup: [-3, 0, 0, 0, 0, 0] }), { id: '1' })   // 奇·负 ⇒ 不清
  RB(bagged([{ id: 2 }], { powerup: [-3, 0, 0, 0, 0, 0] }), { id: '2' })   // 偶·负 ⇒ 清
  RB(bagged([{ id: 2 }], { powerup: [3, 0, 0, 0, 0, 0] }), { id: '2' })    // 偶·正 ⇒ 不清
  RB(bagged([{ id: 4 }], { powerup: [0, -7, 0, 0, 0, 0] }), { id: '4' })   // 偶·负 ⇒ 清 index 1
  RB(bagged([{ id: 3 }], { powerup: [0, 7, 0, 0, 0, 0] }), { id: '3' })    // 奇·正 ⇒ 清 index 1
  // ⑤ key 支: unit 袋 (Unit.RemoveBuff 是平行实现, 不走控制器也不触发印记) / state 袋 / rule* / field 锁。
  RB(bagged([], { unit: [{ id: 18, turn: 2 }] }), { key: 'unit', id: '18' })
  RB(bagged([], { unit: [{ id: 18, turn: 2 }] }), { key: 'unit', type: 'mark' })
  RB(bagged([], { unit: [{ id: 18, turn: 2 }, { id: 39, turn: -1 }] }), { key: 'unit', type: 'mark', id: '18' })
  //   ↑ 型支先把 18 摘走, id 支随后落空 ⇒ 观测 `|=` 的先后顺序 (整串仍 true)。
  RB(bagged([], { unit: [{ id: 18, turn: 2 }] }), { key: 'unit', id: '21' })
  RB(bagged([], { state: [{ key: 'state', buff: { id: 18, turn: 2 } }] }), { key: 'state' })
  RB(bagged([], { state: [{ key: 'other', buff: { id: 18, turn: 2 } }] }), { key: 'state' })
  RB(bagged([], { state: [{ key: 'state', buff: { id: 18, turn: 2 } }] }), { key: 'rule_a' })
  RB(bagged([], { state: [{ key: 'state', buff: { id: 18, turn: 2 } }] }), { key: 'state', filter: '(turn>0)' })
  RB(bagged([], { state: [{ key: 'state', buff: { id: 18, turn: -2 } }] }), { key: 'state', filter: '(turn>0)' })
  RB(bagged([{ id: 92 }], { state: [{ key: 'field', buff: { id: 18, turn: 2 } }] }), { key: 'field' })
  RB(bagged([], { state: [{ key: 'field', buff: { id: 18, turn: 2 } }] }), { key: 'field' })
  RB(bagged([], { client: [{ id: 92 }], state: [{ key: 'field', buff: { id: 18, turn: 2 } }] }), { key: 'field' })
  //   ↑ 对侧的 92 一样算锁 (:929 的 rhsUnit 那半)。
  // ⑥ who=other 动对侧袋子; random_count 只发**越界**的数 (落在 [0,候选数] 才真掷 native 骰 ⇒ 闸门挡住)。
  RB(bagged([], { client: [{ id: 18 }] }), { who: 'other', id: '18' })
  RB(bagged([{ id: 18 }, { id: 21 }]), { type: 'mark', random_count: '99' })
  RB(bagged([{ id: 1 }], { powerup: [3, 0, 0, 0, 0, 0] }), { id: '1', random_count: 'state.turn' })
  RB(bagged([{ id: 1000, turn: 3 }]), { id: '1000' })
  //   ↑ 1000 在 on_add/on_remove 时机上没挂效果 ⇒ 摘它不递归, 是与 18 对照的「安静」样本。
  RB(null, { id: '18' })

  // ── 第六段·批一步骤4: 算子本体 powerup —— 这一族**不发 effectapply 向量**, 一条都不发 ────────
  // 理由不是"形状没吃透", 而是 oracle 侧**根本调不动这个方法**: 上游 `EffectAbilityHandler.Powerup`
  // 的 IL 里**直接** `call UnityEngine.Random.Range` (自定义 pdf 那一支, :561)。dotnet 宿主在**方法入口**
  // 解析 native 签名 ⇒ 一进去就 `SecurityException: ECall methods must be packaged into a system module.`,
  // 与走哪条分支无关 —— 实测 68 条全抛, 连 `{}` / `{random:'maybe'}` (上游第一句 TryParse 就 return false)
  // 以及 `spec:null` 那两条也一样抛 (后者本该是 NRE, 抛点却在方法体之前)。
  // ⇒ oracle 白名单 `PortedAbilities` 里 **7 故意不放**: 放了只会把误生成的向量洗成"两边同抛"的假绿。
  // 对照: AddBuff/RemoveBuff/Rage 只碰**托管**的 `ListHelper.Random` (它在掷骰前按 count 短路) ⇒ 那几家可比;
  //       Heal/AddStatus/SetDamage/DefaultAbility 的 IL 里没有任何 Random 引用。
  // 算子本体**照搬** (game/core/effect/ops-powerup.ts), 形状与抛出点由 game/core/effect/effect-judge.test.ts 锁;
  // 它的下游 (`BattlePet.PowerUp` 的「先摘增幅印记 / 被免疫仍按既有值补印」+ min/max 钳) 已由 `petmut`
  // 的 powerUp 族真值对拍过 ⇒ 这一层的规则并不缺证据, 缺的只是"整条 handler 跑一遍"的那口气。
  // 同理, 第六步的驱动族向量也**不许挂 ability:'powerup'** —— 撞的是同一道入口墙。

  // ── 第六段·批一步骤5: 算子本体 heal ─────────────────────────────────────
  // oracle 白名单 += 5 (实测 Heal 的 IL 里没有任何 Random 引用 ⇒ 整支可比); 本支自己**一次骰都不掷**。
  // 不发 `spec:null`: 上游 state==null 那一支要 `(Pet)effect.invokeUnit` 强转 (base Pet 模型), 移植体在那里
  // 显式抛 NOT_PORTED ⇒ 计划定的口径是"heal 一律带 spec", 那条同抛由单测锁 (不靠"两边都抛"充数)。
  // **OnEffect 修正链的真实驱动源只有真表那 6 行** (扫 `timingRaw ∈ {on_effect, all}` 且 options 带
  // type=add|rec|set|max; 复算脚本见 docs/engine/oracle-playbook.md):
  //   · 93 流失反噬 (add<0) / 1020 恢复反噬 (add>0) / 2102 药剂反噬 (add>0 且 ability[type：item]) ——
  //     三支都是 `type=add, op='*', value=-1`; 2102 那条的条件里是**全角冒号**, 靠 :210 的
  //     `expr.Replace('：', ':')` 与 ParseConditionFilter 的段内归一两处都做才解析得出。
  //   · 3668 尼斯湖 (who=op + ability(rage)) 与 100993 神幻 ([MAX] rec + ability(rage)) ⇒ heal 进不了它们的
  //     filter ⇒ 观测「候选被 filter 拦下」那一面; 对侧袋里的 1020 才是「同 unit 检查 return」那一条 (见下)。
  //     拦下它们的正是 `GetEffectIdentifier` 的 **ability 支只剥方括号** (Effect.cs:412 不带字符实参 ⇒
  //     Helper 缺省 '[' ']'), 于是 `ability(rage)` 剥不动、落到末尾 `return 0`。这一条本轮就是从这对
  //     向量的不一致里挖出来的 (写成圆括号会把整族判定反过来, 连 2102 那条的 `ability[type：item]` 一起错)。
  //   · 200471 幻针 (type=rec, op=+, value=15) 是唯一能把 rec 抬离 100 的真实行 —— 它自己的 Condition 是
  //     `buff(id 1003)` ⇒ 袋里要同时有 1003。真表**没有**往下压 rec 的行, 所以 `Mathf.Max(rec,100)`
  //     (印记 100) 与 "rec<100 打折" 只能拍到"跑到了这条闸", 拍不出数值差。
  // ⇒ 修正链的 `type:"set"` / `type:"max"` 两支与 filter 里的 `key[skill|buff|item]` 三个词**没有真实驱动源**,
  //   只由 game/core/effect/effect-judge.test.ts 锁形状 (本批唯一一处向量拍不到的算子分支)。
  //   同一条测试还锁着「候选的 `value` 只在四个 case **体内**才 ParseEffectOperation」—— 真表那 6 行的 value
  //   全是字面量, 拿不出「解析与否」的观测, 只能靠注入的 rng 当探针。
  const HL = (spec, options, eff = {}, x = {}) =>
    EA({ ...(spec === null ? {} : { spec }), effect: { ability: 'heal', options, ...eff }, ...x })
  // healDict 先喂四把键, 兜底支的 start/end/contain 才有东西可匹配 (与 set_damage 的 CS_DICT 同一条理由)。
  const CS_HDICT = (() => {
    const s = cl(TSPEC)
    s.master.skillSystems[0].healDict = { skill_a: 1, buff_x: 2, endskill: 4, plain: 3 }
    return s
  })()
  // 死宠 (petBag[1] = 0/80) 当目标: `hp<=0 ⇒ continue` 排在 set/max **之后**, 两种路都要拍。
  // target_type 是 **abilityOption** (Effect.targetType 读 abilityOptionDict), 必须走 options 那一位;
  // eff 那一位 buildEffect 只认 timing/priority/target/condition/condOptions/ability/options, 塞错了
  // 会被**静默丢掉** (向量照旧绿, 但筛的根本不是死袋)。与 AB/AS 那两族同写法。
  const HL_DEAD = (options, eff = {}) => HL(CS, { ...options, target_type: 'dead' }, { target: 'pet_bag', ...eff })

  // ① 四支账本: type 的 skill(缺省)/item/buff/兜底键。rec 起值 100 ⇒ healAdd 与 add 同值。
  HL(CS, { add: '10' })                         // 缺省 type=skill ⇒ skillHeal+=10, hp 70→80
  HL(CS, {})                                    // add 缺省 "0" ⇒ healAdd 0, isSuccess 仍 true
  HL(CS, { add: '10', type: 'item' })
  HL(CS, { add: '10', type: 'buff' })           // :310-314 buffHeal+=10 且 healAdd **归零** ⇒ 血不动
  HL(CS, { add: '10', type: 'zzz' })            // 兜底支 ⇒ healDict["zzz"] 新建一把键
  // ② (int) 截断 / overHeal / 负治疗不打折。
  HL(CS, { add: '1/3' })                        // 0.333… ⇒ (int) 0
  HL(CS, { add: '999' })                        // hp 钳到上限, skillOverHeal 记 999-(100-70)
  HL(CS, { add: '-30' })                        // heal<=0 ⇒ 乘 1 (rec 不参与), hp 70→40
  HL(CS, { add: 'me.pet.status.maxHp/4' })      // 真表 100413 的写法: 25 ⇒ 整值
  // ③ set 支: 直接落 hp, 不走 rec 也不记账。
  HL(CS, { set: '5' })
  HL(CS, { set: '999' })                        // hp setter 的钳位
  HL(CS, { set: '0' })                          // 归零: 袋里没 99/-8 ⇒ 落得下去
  HL(bagged([{ id: 99 }]), { set: '0' })        // pet 侧拦下 ⇒ hp 不动且 isSuccess false
  HL(bagged([], { unit: [{ id: -8 }] }), { set: '0' })   // unit 侧那只也算 (Exist 走 unitBuffs)
  HL(CS, { set: 'me.pet.status.maxHp/4' })      // 真表 220009 的 set 写法
  // ④ max 支: 除 99/-8 的归零闸, 还多一道「降上限要 -7/-8」(:273) —— 两个检查的印记集合**不同**。
  HL(CS, { max: '150' })
  HL(CS, { max: '50' })                         // 降上限 (hp 70 跟着被钳) —— 无 -7/-8 ⇒ 落得下去
  HL(CS, { max: '0' })
  HL(bagged([{ id: -8 }]), { max: '0' })        // 归零闸
  HL(bagged([{ id: -7 }]), { max: '50' })       // 降上限闸
  HL(bagged([{ id: 99 }]), { max: '50' })       // 99 不在降上限的集合里 ⇒ 照样降 (别把两道闸合并)
  HL(CS, { set: '5', max: '150' })              // set 先 continue ⇒ max 整支不生效
  HL(CS, { max: '150', add: '10' })             // max 先 continue ⇒ add 算出来的 healAdd 白丢
  // ⑤ 死亡闸: add 路跳过 (hp<=0 ⇒ continue), set/max 路在它**前面** ⇒ 濒死宠能被拉起来。
  HL_DEAD({ add: '10' })
  HL_DEAD({ set: '50' })
  HL_DEAD({ max: '120' })
  // ⑥ who=other ⇒ lhsUnit 走到对侧, isHealCurrentPet 恒 false ⇒ 账不记, 血照加。
  HL(CS, { add: '10', who: 'other' })
  HL(CS, { add: '10', who: 'other', type: 'item' })
  HL(CS, { add: '10', who: 'other', type: 'zzz' })   // 兜底支的 `key.StartsWith("buff") || isHealCurrentPet` 全 false
  // ⑦ 兜底支的三个 option 词 + 「命中的键里有 buff 开头 ⇒ 循环后 healAdd 归零」。
  HL(CS_HDICT, { add: '10', type: 'skill', option: 'start' })     // 命中 skill_a ⇒ 记它并补 skillOverHeal
  HL(CS_HDICT, { add: '10', type: 'skill', option: 'end' })       // 命中 endskill
  HL(CS_HDICT, { add: '10', type: 'skill', option: 'contain' })   // Split("_") 段匹配 ⇒ skill_a
  HL(CS_HDICT, { add: '10', type: 'buff', option: 'start' })      // 命中 buff_x ⇒ healAdd 归零 (不扣血)
  HL(CS_HDICT, { add: '10', type: 'zzz' })                        // 不认的词 ⇒ [type] 单元素 ⇒ 新建键
  HL(CS_HDICT, { add: '10', type: 'zzz', option: 'zzz' })         // option 不认 ⇒ 同样 [type]
  // ⑧ rec 的两条闸: 印记 100 抬到至少 100 (起值就是 100 ⇒ 拍到"跑过这条"), 200471 把 rec 抬到 115 (打折支)。
  HL(bagged([{ id: 100 }]), { add: '10' })
  HL(bagged([{ id: 1003 }, { id: 200471 }]), { add: '100' })      // rec=115 ⇒ healAdd=(int)(100×1.15)
  HL(bagged([{ id: 200471 }]), { add: '100' })                    // 袋里没 1003 ⇒ 这条候选的 Condition 落空
  // ⑨ OnEffect 修正链 (真表六行的可达面)。
  HL(bagged([{ id: 1020 }]), { add: '10' })                      // filter 真 ⇒ heal×(-1) ⇒ 反向扣血
  HL(bagged([{ id: 93 }]), { add: '10' })                         // (add<0) 假 ⇒ 候选不进表 ⇒ 原样加
  HL(bagged([{ id: 93 }]), { add: '-10' })                        // 真 ⇒ ×(-1) ⇒ 反向变 +10
  HL(bagged([{ id: 2102 }]), { add: '10' })                       // type=skill ⇒ ability[type:item] 假
  HL(bagged([{ id: 2102 }]), { add: '10', type: 'item' })         // 真 ⇒ 反向 (全角冒号那条条件)
  HL(bagged([{ id: 3668 }]), { add: '10' })                       // ability(rage) 假 + who=op ⇒ 都不进
  HL(bagged([{ id: 100993 }]), { add: '10' })                     // 同上 ([MAX] rec 那一支)
  HL(bagged([], { client: [{ id: 1020 }] }), { add: '10' })       // 对侧袋: 候选进了表, 但 :224 的同 unit 检查 return
  HL(bagged([{ id: 93 }, { id: 1020 }]), { add: '10' })           // 两行同 prio(-1) ⇒ 稳定序, ×(-1) 两次回到 +10
  HL(bagged([{ id: 200471 }, { id: 1003 }, { id: 1020 }]), { add: '100' })  // rec 与 add 两支修正同框 (prio 都是 -1)
  HL(bagged([{ id: 3631 }]), { add: '10' })                       // type 选项为空 ⇒ 连 PostProcess 都不跑
  HL(bagged([{ id: 100413 }]), { add: '10' })                     // 同上 ('all' 时机的 heal 行, 条件是 unit)
  HL(bagged([{ id: 220009 }]), { set: '50' })                     // 它的 options 里有 set,**没有** type ⇒ 早退
  // ⑩ 多目标与 repeat: 整袋活着的都进 (overHeal 按每只自己算), repeat=2 两轮都真跑。
  HL(CS, { add: '10', target_type: 'other' }, { target: 'pet_bag' })
  HL(CS, { add: '10' }, { target: 'pet_bag' })
  HL(CS, { add: '10', repeat: '2' })
  HL(CS, { add: '10', who: 'other', target_type: 'other' }, { target: 'pet_bag' }, { ivk: 'rhs' })
  // ⑪ sourcePet 会影响 defaultPet 的选取 (target=none ⇒ fromDefault)。
  HL(CS, { add: '10' }, {}, { sp: 'lhs' })
  HL(CS, { add: '10', target_type: 'other' }, { target: 'pet_bag' }, { sp: 'rhs' })

  // ── 第七段·批三: capture (EffectAbilityHandler.cs:66-106) ─────────────────
  // 只发三支**不碰 native** 的分支: ① state==null (:68); ② prob 解析失败 (:72, 早于解引用 invokeUnit);
  // ③ baseId==10 短路成功 (:95 左侧)。成功支的四处突变 (phase / result.state / 双方 isDone / actionCursor)
  //   全在 SigState/SigResult 面里 ⇒ 可比。baseId≠10 的掷点支 (:95 右侧 Unit.RNG()→native) **生成阶段不发**
  //   (powerup 同族口径: 一取就 SecurityException, 放了只会把误生成的向量洗成"两边同抛"的假绿)。
  // CAPSPEC 给 master 一条当前技能 (:96 往 lhsUnit.skill.options 写 capture_result, 该键不进签名);
  // CAP10 把目标 (rhsUnit=client 上场宠) 的 baseId 设成 10 ⇒ :95 短路, 一支骰都不取。
  const CAPSPEC = (() => { const s = cl(TSPEC); s.master.skillSystems = [{ level: 1, skill: { id: 5001, type: 1 } }]; return s })()
  const CAP10 = (() => { const s = cl(CAPSPEC); s.client.petSystem.petBag[0].baseId = 10; return s })()
  EA({ effect: { ability: 'capture', options: { prob: '50' } } })                   // ① state==null → false
  EA({ spec: CAPSPEC, effect: { ability: 'capture', options: { prob: 'abc' } } })   // ② prob 解析失败 → false
  EA({ spec: CAP10, effect: { ability: 'capture', options: { prob: '50' } } })      // ③ baseId==10 短路成功

  // pet_change (id 4) —— 三支**取随机源与 ApplyBuffs 之前**就 return false 的守卫, 全可比、无副作用。
  // 换场成功支 (target_index ≥0) 是**第一支会调 state.ApplyBuffs() 的向量**, 单独一轮验 (见下方 PCSWITCH)。
  // PC0 把 master 袋里除当前宠外的活备选清空 (10002 已死、10003 抹掉) ⇒ randomIndexList 空 ⇒ random 支 :122 false。
  const PC0 = (() => { const s = cl(TSPEC); s.master.petSystem.petBag[3] = null; return s })()
  EA({ effect: { ability: 'pet_change', options: {} } })                              // :110 state==null → false
  EA({ spec: cl(TSPEC), effect: { ability: 'pet_change', options: { target_index: '-1' } } })  // :126 负下标 → false
  EA({ spec: PC0, effect: { ability: 'pet_change', options: { target_index: 'random' } } })    // :122 random 无备选 → false

  // 换场成功支: master cursor 0→3 (10003 活着), 全串突变 (cur/anger/RefreshStayTurn/fightPetCursor)
  //  + 两次 ApplyBuffs 都进签名。weather=0 那条天气印记两侧同代码 ⇒ 只要 TS 不在其上抛 NOT_PORTED 就可比。
  EA({ spec: cl(TSPEC), effect: { ability: 'pet_change', options: { target_index: '3' } } })
  // who=="other" ⇒ 换的是 rhs (client) 那只, cursor 0→1; petChangeUnit.id(-1) ≠ myUnit.id(1) ⇒ **不记** fightPetCursor。
  EA({ spec: cl(TSPEC), effect: { ability: 'pet_change', options: { who: 'other', target_index: '1' } } })

  // ── 第七段·批二: set_skill (EffectAbilityHandler.cs:1291-1392) ────────────
  // oracle 白名单 += 15。这支算子是**元算子** (改技能对象), 所以它的观测面有两处:
  //   ① `wsk:` 一族 (skillsys kind) —— 绕开 handler, 直接对着 spec.skill 打 Skill.SetSkillIdentifier,
  //      写完从**读侧链** (`v=`) 与**整只签名** (SkillFields) 两处取回。写侧与读侧是两套分支顺序,
  //      同键回读把"写了但读不回来"那种形状 (optionX: 写侧穿透不写 / 读侧查键 "X") 直接钉死。
  //   ② `effectapply` 一族 —— 整条算子跑完, 技能改动经 SigState 的 `K[…]|sk=` 落进签名。
  // ⚠ `wsk:` 的 value 走两侧**各自的 parse**: oracle `float.Parse(text, Invariant)` **失败即抛**,
  //   镜像 `f(parseFloat(text))` 对畸形文本给 NaN 且**不抛** ⇒ 这一族的值一律写**纯十进制**字面量
  //   ("1/3" 这种表达式只能出现在 value 走 ParseEffectOperation 的 effectapply 族里)。
  const WSK_SKILL = { id: 5001, type: 1, anger: 6, pp: 2, maxPP: 4, power: 40, accuracy: 95, priority: 1, vipriority: 0, elementId: 2, critical: 6, combo: 2, name: 'WSK' }
  const WK = (key, value, skill = {}) => push({ kind: 'skillsys', op: `wsk:${key}=${value}`, spec: { skill: { ...WSK_SKILL, ...skill } } })
  // ① option 支: 写侧要求**真有方括号**, 读侧不要求 ⇒ 两条路都要; 值按 float 读回比 (OptValOut)。
  WK('option[hide]', '0.5')
  WK('option[hide]', '-3')
  WK('optionX', '1')                       // 穿透到 default ⇒ 静默不写, 但 optionX 仍读得出键 "X" 的兜底
  WK('option[]', '2')                      // 空键名也照样落一格
  WK('evolve', '1')                        // :717 递归成 option[evolve]
  WK('parallelTargetIndex', '2', { sourceIndex: '1' })   // 两个 option 键 + 逐效果 abilityOptionDict
  WK('parallelTargetIndex', '2', { sourceIndex: '1.5' }) // 源下标是从**自己的 options** int.Parse ⇒ 抛
  // ② powerup 支: pos/neg × mult/add × 六维 + 两处"写进临时对象 ⇒ 静默丢弃"。
  WK('powerup.pos.mult.def', '0')          // 只有一格为 0 ⇒ ig 的**乘积**判据翻 True (不是"且")
  WK('powerup.pos.mult.def', '0.5')        // 0.5*1 ≠ 0 ⇒ ig 仍 False
  WK('powerup.neg.add.atk', '1.5')
  WK('powerup.pos.mult.all', '3')          // split 只有两段 ⇒ 缺省 "all" ⇒ 六维同写
  WK('powerup.bog.mult', '2')              // split[0] 不是 pos/neg ⇒ 临时 Linear, 丢
  WK('powerup.pos.bog', '2')               // split[1] 不是 mult/add ⇒ 临时 Status.zero, 丢
  // ③ 末尾 switch 的十个具名写入口 (含四处 Mathf.Max 钳与 (int) 截断)。
  for (const [k, v] of [['id', '999'], ['nope', '1'], ['element', '4'], ['type', '-3'], ['power', '-5'],
    ['anger', '1.7'], ['pp', '999'], ['pp', '-2'], ['maxPP', '-3'], ['accuracy', '120'], ['critical', '7.5'],
    ['combo', '-2'], ['chain', '2.9'], ['priority', '-1'], ['vipriority', '3'], ['ignoreShield', '1'],
    ['ignoreShield', '0'], ['ignorePowerup', '1'], ['ignorePowerup', '0'], ['ignorePowerdown', '2']]) WK(k, v)
  // ④ effect 支: 0 ⇒ 空表; 真 id ⇒ 逐条 new Effect + **常驻壳展开** + source 回指 (ef{count}/{srcSelf});
  //    表里没有 ⇒ `?? new List` 也是空表, 但与 value==0 那条同形 (这一格分不开是**已知**的口径)。
  for (const v of ['0', '10001', '999999']) WK('effect', v)
  // 基线的另一面: 一只**没名字**与一只 options 为 null 的技能 (nm=- / o<-), optionsNull 那只写 option 会 NRE。
  push({ kind: 'skillsys', op: 'sig', spec: { skill: { ...WSK_SKILL, name: null } } })
  push({ kind: 'skillsys', op: 'sig', spec: { skill: { ...WSK_SKILL, optionsNull: true } } })
  WK('option[hide]', '1', { optionsNull: true })
  WK('powerup.pos.mult.hp', '2', { optionsNull: true })   // 不碰 options 的写入口在 null options 下仍走得通

  // ⑤ effectapply 族 —— SSK 给 master 一条**非空**当前技能 (value="-1" 且 set_anger 缺省 false 时
  //    要读 lhsUnit.skill.anger, TSPEC 那位的技能位是 null ⇒ 那是"两边同抛"的另外一条, 见下)。
  const SSK = (() => {
    const s = cl(TSPEC)
    s.master.skillSystems = [{ level: 1, skill: { ...WSK_SKILL } }]
    return s
  })()
  const SSKPC = (() => {   // 当前技能是換场 (type -3) ⇒ value="-3" 走 WithTiming 的真改那一支
    const s = cl(TSPEC)
    s.master.skillSystems = [{ level: 1, skill: { ...WSK_SKILL, type: -3 } }]
    return s
  })()
  // options 那一位里**任何**非算子键都会落进 abilityOptionDict (上游 `Get("spec",…)` 读不到, 但
  // SigEffectShape 会把它原样打出来), 所以换 spec 用的那个键在这里被剥出来当向量自己的 spec。
  const SKW = ({ spec = SSK, ...options }, x = {}) => EA({ spec, effect: { ability: 'set_skill', options }, ...x })
  // type=="id": 五支工厂 + 拷贝构造 (副本而非引用: "-3" 那支 WithTiming 返回同一个对象, 也在这里被拷开)。
  SKW({ type: 'id', value: '-1' })                                        // anger 从**旧**技能继承 (6)
  SKW({ type: 'id', value: '-1', set_anger: 'true' })                     // 用新技能自己的 anger
  SKW({ type: 'id', value: '-4' })                                        // 逃跑技: 单数 SetEffects ⇒ ef1/1
  SKW({ type: 'id', value: '-3' })                                        // 不是換场 ⇒ 原样返回再拷
  SKW({ type: 'id', value: '-3', spec: SSKPC })                           // 是換场 ⇒ 换 timing 后拷
  SKW({ type: 'id', value: '10001' })                                     // 真表那行 (copyPP=true)
  SKW({ type: 'id', value: '999999' })                                    // 查不到 + avoidNull=true ⇒ NoOp 兜底
  SKW({ type: 'id', value: '10001', key: 'counter' })                     // counterSkill 位 (ct=X)
  SKW({ type: 'id', value: '-1', set_anger: 'abc' })                      // 双 TryParse 任一失败 ⇒ false 且不写
  SKW({ type: 'id', value: '-1', reset_param: 'garbage' })                // 同上, 且第二次解析被 || 省掉
  SKW({ type: 'id', value: '10001', set_anger: 'true', reset_param: 'true' })  // PrepareDamageParam 重算参数
  SKW({ type: 'id', value: '-1', spec: cl(TSPEC) })                       // 技能位 null ⇒ lhsUnit.skill.anger NRE
  // type=="effect": 只发**掷点之前**的托管短路 (count>列表长度 且 repeat=false ⇒ 整表拷贝; count=0 ⇒ 空表穿透)。
  // 缺省 random_count="1" 落在 [1, 长度] 里就是要真掷 native 骰 ⇒ 一条都不发。
  SKW({ type: 'effect', value: '10001/10005', random_count: '5', op: 'SET' })
  SKW({ type: 'effect', value: '10001/10005', random_count: '5', op: '+' })          // 追加的是**展开后**的条数
  SKW({ type: 'effect', value: '10001/10005', random_count: '5', op: 'zzz' })        // 两个具名 op 都不是 ⇒ true 不写
  SKW({ type: 'effect', value: '10001/10005', random_count: '5', key: 'counter' })   // GetSkillByKey null ⇒ ?. 静默
  SKW({ type: 'effect', value: '999999/10001', random_count: '3', op: 'SET' })       // 查不到那支 `?? new List`
  SKW({ type: 'effect', value: '10001/10005', random_count: '5', random_repeat: 'abc' })  // bool.Parse 抛
  SKW({ type: 'effect', value: '10001', random_count: '0' })               // 空表 ⇒ 穿透到通用支 ("effect" 这把键自写)
  SKW({ type: 'effect', value: '10001', random_count: 'me.pet.isDead' })   // 表达式 ⇒ (int) 截断后仍 0 ⇒ 穿透
  // 通用支: oldValue 走 Identifier 的 skillSystem 链 (sys 先、技能后、GetNumIdentifier 兜底), newValue 走表达式。
  for (const [type, op, value] of [['power', '+', '10'], ['power', '*', '2'], ['power', 'SET', '7'],
    ['power', '[MIN]', '20'], ['anger', '+', 'me.pet.status.maxHp/50'], ['level', '+', '3'],
    ['critical', '+', '1/3'], ['nope', '+', '1'], ['option[hide]', '+', '0.5'], ['accuracy', '-', '5'],
    ['pp', '-', '1'], ['maxPP', 'SET', 'me.pet.status.maxHp/20']]) SKW({ type, op, value })
  // order.direction 写在**状态**的 options 上 (与 lhsSystem 无关) ⇒ SigState 的 o<> 那一格是唯一读数。
  SKW({ type: 'order.direction', value: '2' })
  SKW({ type: 'order.direction', op: '*', value: '2' })
  // who=="other" ⇒ lhs 是对侧 (client) 那只, 它的技能位是 null ⇒ 先 NRE 在 lhsSystem 之后的读旧值上。
  SKW({ who: 'other', type: 'power', value: '5' })
  SKW({ who: 'other', type: 'power', value: '5', spec: (() => {
    const s = cl(SSK); s.client.skillSystems = [{ level: 1, skill: { ...WSK_SKILL, power: 10 } }]; return s
  })() })
  // 并行游标两支: par=1 时那道闸整个跳过; par=2 才把**对面**的 cursor 搬过去 (越界/洞 ⇒ return false 但技能已写)。
  const PAR2 = (() => {
    const s = cl(SSK)
    s.settings.parallelCount = 2; s.master.parallelCount = 2; s.client.parallelCount = 2
    return s
  })()
  SKW({ type: 'parallelTargetIndex', value: '1', spec: PAR2 })   // client bag[1] 活着 ⇒ cursor 0→1
  SKW({ type: 'parallelTargetIndex', value: '2', spec: PAR2 })   // bag[2] 是洞 ⇒ return false
  SKW({ type: 'parallelTargetIndex', value: '9', spec: PAR2 })   // 越界 ⇒ return false
  SKW({ type: 'parallelTargetIndex', value: '1' })               // par=1 ⇒ 那道闸不进, cursor 不动
  // ⚠ 三支 native **生成阶段不发** (口径同 powerup/capture/pet_change):
  //   value=="random" (GetRandomSkill 的 while(true)+Range)、value=="random[available]" (GetAvailableSkills
  //   之后 `.Random()`)、type=="parallelTargetIndex" 且 value=="random" (:1377 的 FindAllIndex(...).Random());
  //   以及一切 random_repeat=true 或 count 落在 [1,长度] 的 type=="effect" 形状 (while 第一轮就掷骰)。

  // ── 第八段·批四: 算子本体 win (:38) / escape (:54) / set_weather (:1969) / block_buff (:678) ──────────
  // oracle 白名单这轮加 {1, 2, 17, 9}; 签名这轮扩了印记控制器的五张表 (SigPet 的 `|B[..]|BT[..]|C[..]|CT[..]|S<..>`),
  // 否则 block_buff 补的那九个方法全是"改了但看不见" —— 光靠 return true 证明不了任何一个方法被调对。
  // 两条**不发**: (a) id_list 解析失败 ⇒ 整表 null (两端都在 AddRange 上抛, 但那是我喂错了数据, 不是证据);
  //   (b) `who` 选出 id==0 的兜底 null —— 与本批语义无关的 NRE, 别混进来。
  const SWX = (options, x = {}) => EA({ effect: { ability: 'set_weather', options }, ...x })
  const BBX = (options, x = {}) => EA({ spec: CS, effect: { ability: 'block_buff', options }, ...x })

  // ① Win (:38-53) / ② Escape (:54-65) —— ⚠ **半可比**, 只发 oracle 问得出来的形状。
  //    两支都要过 `IsMyUnit()` (`:48` 的 lhsUnit / `:60` 的 state.atkUnit), 它读 `PhotonNetwork.IsConnected`,
  //    而 Photon 的静态构造在无头宿主里必抛 —— 我以为只是"缺个程序集", 实测是 `StaticReset()` 里的
  //    **ECall**: `TypeInitializationException → SecurityException: ECall methods must be packaged into a
  //    system module` (与 `Powerup` 的 `Random.Range` 同一个根因)。⇒ 归 oracle-playbook §6 的
  //    **单向闸门「oracle 抛、移植体不该抛」**, 那类向量的正确形态就是**根本不生成**。
  //    于是这里只留两支 oracle 答得出的:
  //      · state==null 的早退 (:41 / :57 ⇒ false) —— 这是 E4 不变量 A3 的一条, 值得进 golden;
  //      · whosTurn==0 ⇒ atkUnit==null 在**进入 IsMyUnit 之前**就 NRE (:60), 两端同抛, 是 A3 的另一条。
  //    结果面 (phase / result.state / 两个 isDone / actionCursor) 由 effect-judge.test.ts 用默认 NET 缝
  //    (「未连接」⇒ isMyUnit 完整退化成 isMasterUnit) 锁形状 —— 生产路径读的也是这个退化值。
  EA({ effect: { ability: 'win' } })                                            // state==null ⇒ false (不碰 invokeUnit)
  EA({ effect: { ability: 'escape' } })                                         // 同上, 且 atkUnit 也没被读过
  EA({ spec: (() => { const s = cl(TSPEC); s.whosTurn = 0; return s })(), effect: { ability: 'escape' } })  // atkUnit=null ⇒ NRE
  // 反面样本: `who` 选出的 unit 为 null 要**另外**建 spec (getUnitById(0)), 与本批语义无关, 不发。

  // ③ SetWeather —— int.TryParse 是**字面**解析且早于解引用 state; 两处 IsBuffTypeBlocked 是 ||。
  //    屏蔽支靠 spec 的 blockTypes 铺垫 (真方法 BlockBuffWithType, 见 FakePet), Weather = 9。
  const CS_WBLK = (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].blockTypes = [9]; return s })()
  const CS_WCLK = (() => { const s = cl(TSPEC); s.client.petSystem.petBag[0].blockTypes = [9]; return s })()
  SWX({ weather: 'abc' })                                                      // state==null 且 parse 失败 ⇒ 干净 false
  SWX({ weather: '3' })                                                        // state==null 但 parse 成功 ⇒ NullReferenceException
  SWX({ weather: '3' }, { spec: CS })                                          // ⇒ weather=3
  SWX({ weather: '-1' }, { spec: CS })                                         // 负值照收 (天气是 int, 不钳)
  SWX({}, { spec: CS })                                                        // weather 缺省 '0' ⇒ 落 0
  SWX({ weather: '2.0' }, { spec: CS })                                        // 小数 ⇒ TryParse false ⇒ 不改 (仍 0)
  SWX({ weather: '3' }, { spec: CS_WBLK })                                     // 己方屏蔽 weather 型 ⇒ false, 仍 0
  SWX({ weather: '3' }, { spec: CS_WCLK })                                     // 对方屏蔽 ⇒ false (|| 的右支)

  // ④ BlockOrCopyBuff —— 四个动作按 op 选; Power 族三型先"移出 type 表"再展开进 id 表;
  //    sp 只有 +/- 有函数 (*、/ 与未认的 op 都是空动作)。五张表全在签名 `|B[..]|BT[..]|C[..]|CT[..]|S<..>` 上。
  EA({ effect: { ability: 'block_buff' } })                                    // state==null ⇒ NRE (A3: 本支**不判** null)
  BBX({ op: '+', id_list: '1/2/3' })                                           // blockBuffIds: [元素块id] + [1,2,3]
  BBX({ op: '+', id_list: '0' })                                               // 缺省 type_list='none' ⇒ [None] 也进 type 表
  BBX({ op: '+', type_list: 'weather' })                                       // type 表 += [Weather]
  BBX({ op: '+', type_list: 'powerup' })                                       // Power(-2) ⇒ 移出 + 展开 powerup∪powerdown
  BBX({ op: '+', type_list: 'powerup.pos' })                                   // Powerup(-3) ⇒ 移出 + 展开 powerup ids
  BBX({ op: '+', type_list: 'powerup.neg' })                                  // Powerdown(-4) ⇒ 移出 + 展开 powerdown ids
  // ⚠ 词表里 Powerdown 的原始串是 **'powerup.neg'** (不是 'powerdown.neg'!) —— BuffDatabase.cs:8-33 的三行是
  //   powerup.neg / powerup.pos / powerup 分别指 Powerdown / Powerup / Power。写反了就静默兜 None(0)。
  BBX({ op: '+', type_list: 'powerup/weather' })                               // 只摘掉命中的那个, weather 留在 type 表
  BBX({ op: '+', type_list: 'powerup/powerup' })                               // List.Remove 只摘首个 ⇒ 一个展开、一个留在表里
  BBX({ op: 'zzz', id_list: '1', type_list: 'weather', sp_list: 'op' })        // 未认的 op ⇒ 三张表都不动, 但仍 return true

  // ── 批五: 算子本体 set_buff (id=13) —— EffectAbilityHandler.cs:1162-1197 ──
  // oracle 白名单已加 13; 这里补 effectapply 向量。三条分支: key=''(默认, 走 pet.buffController) /
  // key='unit'(直读 unitBuffs) / 其它(走 state.stateBuffs); type 取值标识符或 'id'(换 id 触发 OnAddBuff);
  // autoRemove 且 value<=0 触发摘除。⚠ type=='id' 的语义是 id = Operate(op, oldId, value), 不是"设为 value"。
  // ⚠ 规格里的印记一律写**纯对象** (buffOf/buffsOf 在 buildState 阶段转成真 Buff), 绝不手写 new Buff —— 否则
  //    向量数组带循环引用 (Buff.effects[].source→Buff), JSON.stringify 直接炸。
  // ⚠ 印记 id 必须取自 buffs.json 真实存在的行 (buff.info 才查得到 autoRemove; type=='id' 换到的目标 id 也要存在,
  //    否则 SetBuffIdentifier 的 getBuffInfo 哨兵会静默不换); 换 id 触发的 OnAddBuff 会改相位跑新 id 的 on_add 效果,
  //    故目标 id 的 on_add 必须无(或已搬) ⇒ 这里 18→19(19 无 on_add)。18/11 取自 safe 扫描, 31 取自 autoRemove-safe。
  const SB = (options, x = {}) => EA({ effect: { ability: 'set_buff', options }, ...x })
  // 默认(who=me) 走 master 上场宠的 buffController; who=op 时改读 client 上场宠。
  const SB_PET = (() => {
    const s = cl(TSPEC)
    s.master.petSystem.petBag[0].buffs = [{ id: 18, turn: -1, value: 5 }, { id: 11, turn: -1, value: 3 }]
    s.client.petSystem.petBag[0].buffs = [{ id: 18, turn: -1, value: 1 }]
    return s
  })()
  const SB_UNIT = (() => {
    const s = cl(TSPEC)
    s.master.unitBuffs = [{ id: 18, turn: -1, value: 5 }, { id: 11, turn: -1, value: 3 }]
    return s
  })()
  const SB_ST = (() => {
    const s = cl(TSPEC)
    s.stateBuffs = [{ key: 'mine', buff: { id: 18, turn: -1, value: 5 } }]
    return s
  })()
  const SB_AR = (() => {
    const s = cl(TSPEC)
    // 31 是 autoRemove=true 且 on_remove 干净的印记; 初始 value=5, 压到负 ⇒ 走 controller.removeBuff。
    s.master.petSystem.petBag[0].buffs = [{ id: 31, turn: -1, value: 5 }]
    return s
  })()
  SB({ id: '18', type: 'value', op: '+', value: '5' }, { spec: SB_PET })                  // getBuff(18) → value 5+5=10
  SB({ id: '0', type: 'value', value: '9' }, { spec: SB_PET })                            // id=0 ⇒ 整袋按 filter 筛(默认 none ⇒ 全中) → 各自 +9
  SB({ id: '9999', type: 'value', value: '1' }, { spec: SB_PET })                          // 无此印记 ⇒ getBuff 返回 null ⇒ success=false
  SB({ id: '18', type: 'id', op: '+', value: '1' }, { spec: SB_PET })                      // id 18→19 (GET 命中 ⇒ 真换) + OnAddBuff(buff19 无 on_add ⇒ 净 no-op)
  SB({ key: 'unit', id: '18', type: 'value', op: '-', value: '2' }, { spec: SB_UNIT })     // 直读 unitBuffs, 按 id==18 筛 → 5-2=3
  SB({ key: 'mine', type: 'value', value: '7' }, { spec: SB_ST })                          // stateBuffs 按 key='mine' 取 → 5+7=12
  SB({ who: 'op', id: '18', type: 'value', op: '*', value: '2' }, { spec: SB_PET })        // who=op ⇒ 读 client 上场宠的 getBuff(18): 1*2=2
  SB({ id: '0', type: 'value', op: '+', value: '1', filter: '(value>0)' }, { spec: SB_PET })  // 整袋 + filter 筛 value>0 (两条都中) → 各 +1
  SB({ id: '31', type: 'value', op: '-', value: '999' }, { spec: SB_AR })                  // 31 压到 ≤0 且 autoRemove=true ⇒ controller.removeBuff 摘除
  SB({ id: '18', type: 'value', value: '5' })                                              // state==null 不判 ⇒ NRE (与上游同形)

  // ── 批五: 算子本体 copy_buff (id=12) —— EffectAbilityHandler.cs:975-1150 ──
  // oracle 白名单已加 12。默认 source='op'(lhs=client 上场宠) → target='me'(rhs=master 上场宠): buff 从 client 搬到 master。
  // 覆盖: 非 exchange·isId(普通印记 AddBuff) / transfer(搬完摘源) / 非 exchange·isType / exchange·isType /
  //   filter / bool.TryParse 失败 return false / id 空 return false / source·target 反向 / state==null NRE。
  // ⚠ random / unique[random] 走 native .Random ⇒ 不可比, 不发 (留给 R1 注入 + 手测)。power 印记与 power·exchange
  //   分支要动增幅, 另行挑向量, 先发普通/type 两支坐实主干。
  const CB = (options, x = {}) => EA({ effect: { ability: 'copy_buff', options }, ...x })
  const CB_SRC = (() => {
    const s = cl(TSPEC)
    s.client.petSystem.petBag[0].buffs = [{ id: 18, turn: -1, value: 5 }, { id: 11, turn: 2, value: 3 }]
    return s
  })()
  CB({ id: '18' }, { spec: CB_SRC })                                          // 非 exchange·isId 普通印记: master +buff18 (client 不动)
  CB({ id: '18', transfer: 'true' }, { spec: CB_SRC })                        // transfer: master +buff18, client -buff18
  CB({ id: '18/11' }, { spec: CB_SRC })                                       // id 列表: 两条都搬
  CB({ id: '9999' }, { spec: CB_SRC })                                        // 无此印记 ⇒ buffs 空 ⇒ return false
  CB({ id: '0' }, { spec: CB_SRC })                                           // id 全 0 ⇒ isId=false, isType=false ⇒ return false
  CB({ id: '18', transfer: 'notabool' }, { spec: CB_SRC })                    // transfer 非 bool ⇒ bool.TryParse 失败 ⇒ return false
  CB({ type: 'mark' }, { spec: CB_SRC })                                      // 非 exchange·isType: 18/11 都是 mark ⇒ 两条都搬
  CB({ type: 'mark', filter: '(value>4)' }, { spec: CB_SRC })                 // filter value>4 ⇒ 只 18 (value 5) 命中
  CB({ type: 'mark', exchange: 'true' }, { spec: CB_SRC })                    // exchange·isType: client 的 mark 全搬到 master, client 清空
  CB({ id: '18', source: 'me', target: 'op' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].buffs = [{ id: 18, turn: -1, value: 5 }]; return s })() })  // source='me'/target='op' ⇒ master→client
  CB({ id: '18' })                                                            // state==null 不判 ⇒ NRE (与上游同形)

  // ── 批五: 算子本体 rage (id=6) —— EffectAbilityHandler.cs:354-471 ──
  // oracle 白名单已加 6。默认 who='me' ⇒ 改 master 上场宠的怒气。angerAdd = rage*(rage>0 ? rec/100 : 1);
  // rec 取 battleStatus.angrec (TSPEC 缺省 100 ⇒ angerAdd=rage)。落值前先写 min/max ⇒ clamp 用新上下限。
  // 覆盖: add(正/负) / set / min+max+clamp / 仅 max 触顶 / who=op / pp 支(无技能 no-op) / state==null NRE。
  // ⚠ rec!=100 的折扣支、pp 支的 PP 实改、isRandom 都要额外铺垫(hidden/技能表/native 随机) ⇒ 本轮不发, 留手测。
  const RG = (options, x = {}) => EA({ effect: { ability: 'rage', options }, ...x })
  // master/client 上场宠 anger 显式写 20 (去掉 StatusController 缺省的歧义); angrec 走缺省 100 ⇒ angerAdd=rage。
  const RG_SPEC = (() => {
    const s = cl(TSPEC)
    s.master.petSystem.petBag[0].anger = 20
    s.client.petSystem.petBag[0].anger = 20
    return s
  })()
  RG({ add: '30' }, { spec: RG_SPEC })                    // master anger: 20 + 30*1 (rec=100) = 50
  RG({ add: '-10' }, { spec: RG_SPEC })                   // 负怒气不打折: 20 + (-10) = 10
  RG({ set: '77' }, { spec: RG_SPEC })                    // anger = 77 (set 支)
  RG({ min: '5', max: '90', add: '100' }, { spec: RG_SPEC })  // min=5/max=90 ⇒ anger=clamp(20+100,5,90)=90
  RG({ add: '30', max: '10' }, { spec: RG_SPEC })         // 仅 max=10 ⇒ anger=clamp(50,0,10)=10
  RG({ who: 'op', add: '30' }, { spec: RG_SPEC })         // who=op ⇒ 改 client 上场宠: 20+30=50
  RG({ type: 'pp', add: '5' }, { spec: RG_SPEC })         // pp 支但上场宠无技能 ⇒ no-op (仍 return true)
  RG({ add: '30' })                                       // state==null 不判 ⇒ NRE (与上游同形)

  // ── 批五: 算子本体 poker (id=19) —— EffectAbilityHandler.cs:2031-2073 ──
  // oracle 白名单已加 19。扑克小游戏用**印记**当牌 (3200~3204 花色 + value 点数, group==poker & turn<0 才是手牌)。
  // 只发**确定性**支: type 未认 ⇒ return false; refresh 但手里没牌 ⇒ 摘空(false)+count=0 ⇒ return false; state==null NRE。
  // ⚠ get / refresh-有牌 的补牌走 native Random.Range(0,4)/(1,14) ⇒ 不可比, 不发 (R1 注入 + 手测)。
  const PK = (options, x = {}) => EA({ effect: { ability: 'poker', options }, ...x })
  PK({ type: 'xyz' }, { spec: CS })                              // 未认 type ⇒ return false (袋子不动)
  PK({ type: 'refresh' }, { spec: CS })                          // 手里无牌 ⇒ 摘空(false) + count=0 ⇒ return false
  PK({ type: 'xyz', who: 'op' }, { spec: CS })                   // who=op 也走同一条 default ⇒ return false
  PK({ type: 'xyz' })                                             // state==null 不判 ⇒ NRE (与上游同形)

  // ── 批五: 算子本体 set_pet_bag (id=20) —— EffectAbilityHandler.cs:2075-2211 ──
  // oracle 白名单已加 20。只发**可搬支**（不碰 S6 宠表、不掷骰）：default·SET / token·- / token·SET /
  //   default·-（多活宠走置空+补位，单活宠走 hp=0）/ 未认 type no-op / state==null NRE。
  // ⚠ default·"+" 与 token·"+" 要从宠表造宠（Pet.GetExamplePet/BattlePet.GetBattlePet）⇒ S6-blocked，TS 抛 NOT_PORTED，不发向量。
  const SPB = (options, x = {}) => EA({ effect: { ability: 'set_pet_bag', options }, ...x })
  // 单活宠袋：只 cursor(0) 活，其余三格全空 ⇒ default·"-" 走 alivePetNum==1 的 hp=0 支（不补位）。
  const SPB_ONE = (() => {
    const s = cl(TSPEC)
    s.master.petSystem.petBag = [{ id: 10001, hp: 70, maxHp: 100 }, null, null, null]
    s.master.petSystem.backupPetBag = [null, null, null, null]
    s.master.petSystem.tokenPetBag = [null, null, null, null]
    return s
  })()
  SPB({ op: 'SET', value: '1' }, { spec: CS })                 // default·SET: SwapBackupPet(1) — petBag[1]↔backupPetBag[1]
  SPB({ type: 'token', op: '-' }, { spec: CS })                // token·-: tokenPetBag[cursor=0]=null, return true
  SPB({ type: 'token', op: 'SET', value: '3' }, { spec: CS })  // token·SET: SwapTokenPet(3) — petBag[3]↔tokenPetBag[3] + 怒气继承
  SPB({ op: '-' }, { spec: CS })                               // default·- 多活宠: petBag[0]=null, cursor→3 (补位)
  SPB({ op: '-' }, { spec: SPB_ONE })                          // default·- 单活宠: petBag[0].hp=0 (alivePetNum==1, 不补位)
  SPB({ type: 'xyz', op: 'SET', value: '1' }, { spec: CS })    // 未认 type 也落 default 支 ⇒ 同 SET: SwapBackupPet(1)
  SPB({ op: '-' })                                             // state==null 不判 ⇒ NRE (与上游同形)
  BBX({ op: '*' })                                                             // copyBuffIds += [0]; 缺省 type_list='none' 进 type 表
  BBX({ op: '*', sp_list: 'op' })                                              // ⚠ spFunc 在 '*' 是空动作 ⇒ sps **不动**
  BBX({ op: '+', sp_list: 'op' })                                              // ⇒ blockBuffSps{op:1}
  BBX({ op: '+', sp_list: 'zzz' })                                             // BlockBuffWithString 只有 default ⇒ 任何非空串都 +1
  BBX({ op: '+', who: 'other', id_list: '4' })                                 // who≠'me' ⇒ 落到 **client** 的表上
  BBX({ op: '-', id_list: '1' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].blockIds = [1, 1, 2]; return s })() })
  BBX({ op: '-', id_list: '1/1' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].blockIds = [1, 1, 2]; return s })() })  // 逐项首匹配 ⇒ 两个 1 都摘
  BBX({ op: '-', id_list: '9' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].blockIds = [1, 1, 2]; return s })() })  // 摘不到 ⇒ 不变
  BBX({ op: '-', type_list: 'weather' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].blockTypes = [9, 1]; return s })() })
  BBX({ op: '-', sp_list: 'op' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].sps = ['op']; return s })() })          // ⇒ 0
  BBX({ op: '-', sp_list: 'zzz' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].sps = ['op']; return s })() })         // 没有那个 case ⇒ 不动
  BBX({ op: '/', id_list: '5' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].copyIds = [5, 5, 6]; return s })() })
  BBX({ op: '/', id_list: '5/5' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].copyIds = [5, 5, 6]; return s })() })  // 两个 5 都摘
  BBX({ op: '/', type_list: 'weather' }, { spec: (() => { const s = cl(TSPEC); s.master.petSystem.petBag[0].copyTypes = [9]; return s })() })

  // ── statusctrl / petmut (第五段·步骤2): 突变器 ──────────────────────────
  // 计划里"七个缺失突变器"的**可观测面**全在这两个 kind 里: 六个写入口 (multInit/multCurrent/
  // addInit(两种 arity)/addCurrent/addHidden/addBattle) + 四个增幅入口 (setPowerUp/setMin/setMax/
  // addPowerUp, 各带 Status 与 (int,int) 两支) + 两条读回 (getPowerUp/ident) + 四条静态名字表。
  // 一条纪律: 值全部取**有限** float —— FS 会把 Infinity 写成 "Infinity", 而 C# 的 (double)float.PositiveInfinity
  // ToString 是 "∞", 那纯是文本表示差, 拍进去只会制造假分歧 (非有限数由 Norm 的哨兵走 statusop 那一族)。
  const INIT6 = [[10, 20, 30, 40, 50, 100], [0, 0, 0, 0, 0, 100], [1, 1, 1, 1, 1, 1], [-3, 7, 0, 12.5, -8, 100]]
  const S6 = [1, 1, 1, 1, 1, 1]
  const SCV = (op, x = {}) => push({
    kind: 'statusctrl', op, init: x.init ?? INIT6[0], hp: x.hp ?? 60, anger: x.anger ?? 20,
    type: x.type ?? 0, amount: x.amount ?? 0, value: x.value ?? 0, status: x.status ?? S6,
    id: x.id, minPu: x.minPu, maxPu: x.maxPu,
  })
  SCV('noop')
  SCV('noop', { minPu: [-2, -2, -2, -2, -2, -2] })
  SCV('noop', { maxPu: [2, 2, 2, 2, 2, 2] })
  // multInit 是**整条乘** (收而不读 type), multCurrent 是**逐维乘** —— 同一个 type 参数两种作用域。
  for (const type of [0, 3, 5]) for (const value of [2, 0.5, -1, 0]) SCV('multInit', { type, value })
  for (const type of [0, 3, 5]) for (const value of [2, 0.5, -1, 0]) SCV('multCurrent', { type, value })
  // addInit(Status) 换引用、addInitType 就地改 —— 签名看不到引用差别, 但**越界索引**能看出 Set 的守卫。
  for (const status of [[1, 2, 3, 4, 5, 6], [-1, -1, -1, -1, -1, -1], [0, 0, 0, 0, 0, 1e7]]) SCV('addInit', { status })
  for (const [type, amount] of [[0, 5], [5, -30], [6, 7], [-1, 9]]) SCV('addInitType', { type, amount })
  for (const [type, amount] of [[0, 5], [5, -30], [6, 7]]) SCV('addCurrent', { type, amount })
  // addHidden 的 type≥6 落在 Status.Set 的守卫外 ⇒ 静默不写 (与 addBattleStatus 的分界一起拍)。
  for (const [type, amount] of [[0, 3], [3, -1], [4, 50], [5, -150], [6, 2]]) SCV('addHidden', { type, amount })
  for (const [type, amount] of [[0, 5], [5, 5], [6, 5], [11, -150], [12, 5], [-1, 5]]) SCV('addBattle', { type, amount })
  // 增幅三条边界: 默认 ±6、setMin/setMax **不钳不截**、min>max 时 Mathf.Clamp 给鬼值。
  for (const [type, amount] of [[0, 3], [0, 9], [0, -9], [5, -2]]) SCV('setPowerUpType', { type, amount })
  for (const status of [[1, -1, 2, -2, 3, -3], [6, 6, 6, 6, 6, 6], [7, 7, 7, 7, 7, 7], [1.9, 1.9, 1.9, 1.9, 1.9, 1.9]]) SCV('setPowerUp', { status })
  SCV('addPowerUp', { type: 0, amount: 3 })
  SCV('addPowerUp', { type: 0, amount: 9 })
  SCV('addPowerUp', { type: 5, amount: -4 })
  SCV('setMin', { status: [-3, -3, -3, -3, -3, -3] })
  SCV('setMinType', { type: 2, amount: -9 })
  SCV('setMax', { status: [3, 3, 3, 3, 3, 3] })
  SCV('setMaxType', { type: 2, amount: 9 })
  // 反序钳: min 盖过 max 之后 GetCurrentPowerup 的 Clamp(x, 9, 3) 在 Unity 里返回 9 —— 鬼值也要拍下来。
  SCV('getPowerUp', { type: 2, minPu: [0, 0, 9, 0, 0, 0], maxPu: [6, 6, 3, 6, 6, 6], amount: 5 })
  SCV('setPowerUpType', { type: 2, amount: 5, minPu: [0, 0, 9, 0, 0, 0], maxPu: [6, 6, 3, 6, 6, 6] })
  SCV('getPowerUp', { type: 0 })
  SCV('getPowerUp', { type: 5, amount: 4 })
  // GetStatusIdentifier 的三段前缀链: init 走**副本属性**、base 在 parent==null 时恒 0、其余落 battleStatus。
  for (const id of ['init', 'initatk', 'inithp', 'baseatk', 'base', 'atk', 'hp', 'hit', 'cri', 'rec', 'status.hp', 'unknown']) SCV('ident', { id })
  SCV('ident', { id: 'initrec', init: [0, 0, 0, 0, 0, 50], hp: 30 })
  // 四条静态名字表 (每次访问 new 一份): powerupNames 是 typeNames 把 hp 换成 hit 的那张。
  SCV('names')
  push({ kind: 'statusctrl', op: 'names', init: INIT6[1], hp: 1, anger: 0 })
  for (const type of [0, 1, 2, 3, 4, 5]) SCV('multInit', { type, value: 1.5, init: INIT6[3] })
  for (const type of [0, 1, 2, 3, 4, 5]) SCV('addBattle', { type, amount: 2, init: INIT6[2], hp: 3 })

  // petmut: BattlePet.PowerUp / BuffController.AddBuff(state=null) / SkillController.GetAvailableSkills。
  const PM = (op, pet = {}, x = {}) => push({ kind: 'petmut', op, pet: { id: 30001, maxHp: 100, hp: 80, ...pet }, ...x })
  // 先一条"什么都不写"的基线, 让后面每条 diff 都只有一处变化。
  PM('powerUp', {}, { status: S6 })
  // 上一轮的增幅印记必须被 RemoveRangeBuff(x.IsPower()) 摘掉 —— 给一张带 id=1/-9 的袋子才看得见。
  PM('powerUp', { buffs: [{ id: 1, turn: 2, value: 3 }, { id: -9, turn: -1, value: 2 }, { id: 1008, turn: 1, value: 4 }] }, { status: [2, 0, 0, 0, 0, 0] })
  for (const status of [[1, 0, 0, 0, 0, 0], [-1, -2, -3, -4, -5, -6], [0, 0, 0, 0, 0, 0], [7, 7, 7, 7, 7, 7], [1.9, -1.9, 6.5, -6.5, 0, 0], [0, 0, 0, 0, 0, 3]]) PM('powerUp', {}, { status })
  // isSet=true 跳过免疫检查 —— 与 blockIds 配上才看得出这一支的差别 (id 1/3 被免役 ⇒ 增幅不写,
  // 但下半段照旧给**既有**增幅补印记, 这是上游没写 continue 的那条怪癖)。
  PM('powerUp', { blockIds: [1, 3] }, { status: [3, 0, 3, 0, 0, 0] })
  PM('powerUp', { blockIds: [1, 3] }, { status: [3, 0, 3, 0, 0, 0], isSet: true })
  PM('powerUp', { blockIds: [-9] }, { status: [0, 0, 0, 0, 0, 4] })
  PM('powerUp', { el: 2 }, { status: [-2, 0, 0, 0, 0, 0] })
  // isSet 到底是「覆盖」还是「跳过免疫后照样累加」—— 非零起点 + 不撞 ±6 钳才分得开 (1+3: Set 给 3, Add 给 4)。
  PM('powerUp', { powerup: [1, 0, 0, 0, 0, 0] }, { status: [3, 0, 0, 0, 0, 0] })
  PM('powerUp', { powerup: [1, 0, 0, 0, 0, 0] }, { status: [3, 0, 0, 0, 0, 0], isSet: true })
  PM('powerUp', { powerup: [0, 0, -2, 0, 0, 0], blockIds: [1] }, { status: [3, 0, 0, 0, 0, 0], isSet: true })
  PM('powerUp', { powerup: [0, 0, -2, 0, 0, 0], blockIds: [1] }, { status: [3, 0, 0, 0, 0, 0] })
  // AddBuff 的 state=null 静默装载: null 项 / 被免疫的 id / 能力增减类**免疫不了**那条 (IsPower 例外)。
  PM('addBuff', {}, { buff: { id: 1008, turn: 3, value: 2 } })
  PM('addBuff', {}, { buff: null })
  PM('addBuff', { blockIds: [1008] }, { buff: { id: 1008, turn: 3, value: 2 } })
  PM('addBuff', { blockIds: [1] }, { buff: { id: 1, turn: -1, value: 2 } })
  PM('addBuff', {}, { buff: { id: -21, turn: -1, value: 1 } })
  PM('addBuff', {}, { buff: { id: 999999, turn: 1, value: 1 }, trig: false })
  // GetAvailableSkills: 筛子是 `type>=属性 && anger<=入参 && !isSelect`, 袋子的**优先级**是 normalSkills 先。
  const SK = (id, type, anger) => ({ id, type, anger })
  PM('available', {}, { anger: 20 })
  PM('available', { normalSkills: [SK(101, 1, 5), null, SK(102, 1, 50)] }, { anger: 20 })
  PM('available', { loopSkills: [SK(103, 1, 5), SK(104, 0, 0)] }, { anger: 20 })
  // 两袋都给 ⇒ normalSkills 赢 (与 `normalSkill[N].x` 标识符臂的环击优先**正好相反**)。
  PM('available', { normalSkills: [SK(105, 1, 1)], loopSkills: [SK(106, 1, 1)] }, { anger: 20 })
  PM('available', { normalSkills: [null, null] }, { anger: 20 })
  PM('available', { normalSkills: [SK(107, 1, 5)], superSkill: SK(108, 6, 5) }, { anger: 20 })
  PM('available', { normalSkills: [SK(107, 1, 5)], superSkill: SK(108, 6, 5) }, { anger: 20, withSuper: false })
  PM('available', { superSkill: SK(109, 6, 99) }, { anger: 20 })
  PM('available', { normalSkills: [SK(110, 1, 99)] }, { anger: 100 })
  PM('available', { normalSkills: [SK(111, 1, 0), SK(112, 2, 0), SK(113, 3, 0)] }, { anger: 0 })

  // ── skilltable (第五段·步骤3): 真技能表的**只读**逐列比对 ──
  // 素材是"表里真的长成这样的行", 不是合成形状 —— 这一族的目的就是把 JSON 少的那几列
  // (pp/combo/chain/powerup/powerdown 与 build 的回写) 指名道姓量出来, 所以抽样按**形状**分层:
  //   · 稀有 type 全取 (连携 12 / 被动 18 / 特殊 5 条: -1 -4 -7), 常见 type 按定步长抽 (可复现, 不吃 rnd);
  //   · 每条非默认 option 键 (group/groupd/anim_speed/battle_report/position/token/keep/first) 至少一行 ——
  //     GetRawInfoStringArray 的第八列按插入序重拼, 默认键与非默认键的**拼接顺序**是比的内容本身;
  //   · 六个回写键各取其真假两支 (second_super / ignore_shield / ignore_powerup / ignore_powerdown /
  //     ref_buff / critical≠5), 以及两段费用 (`maxPP = list[1] > 0 ? list[1] : Max(5, 40 - anger)`);
  //   · accuracy/anger/power 的极值各一行 (钳与越界在这张表里都靠真值拍)。
  // MISS 那两支是**表本身**的形状 (0 号一律查不到 + 不存在的 id), 不是行为分支。
  const ST = (id) => push({ kind: 'skilltable', id })
  const byShape = (p, n = Infinity) => SKILL_ROWS.filter(p).slice(0, n).map(x => x.id)
  const ST_DEFAULT_KEYS = ['critical', 'priority', 'second_super', 'ignore_shield', 'ignore_powerup', 'ignore_powerdown', 'ref_buff']
  for (const ty of [3, -1, -4, -7, -5, 100]) for (const id of byShape(x => x.type === ty)) ST(id)
  for (const ty of [0, 1, 2]) for (let i = 0; i < SKILL_ROWS.length; i += 161)
    if (SKILL_ROWS[i].type === ty) ST(SKILL_ROWS[i].id)
  for (const id of byShape(x => x.options.some(([k]) => !ST_DEFAULT_KEYS.includes(k)), 40)) ST(id)
  for (const id of [
    ...byShape(x => x.referBuffList !== null, 6), ...byShape(x => x.isSecondSuper, 6),
    ...byShape(x => x.ignoreShield, 6), ...byShape(x => x.ignorePowerup, 6), ...byShape(x => x.ignorePowerdown, 6),
    ...byShape(x => x.critical !== 5, 6), ...byShape(x => String(x.rawCostString).includes('/'), 6),
    ...byShape(x => x.options.some(([k]) => k === 'priority'), 6), ...byShape(x => x.options.some(([k]) => k === 'critical'), 6),
  ]) ST(id)
  for (const id of [
    SKILL_ROWS.reduce((a, x) => (x.accuracy > a.accuracy ? x : a)).id,
    SKILL_ROWS.reduce((a, x) => (x.accuracy < a.accuracy ? x : a)).id,
    SKILL_ROWS.reduce((a, x) => (x.anger > a.anger ? x : a)).id,
    SKILL_ROWS.reduce((a, x) => (x.power > a.power ? x : a)).id,
    SKILL_ROWS.reduce((a, x) => (x.maxPP > a.maxPP ? x : a)).id,
    SKILL_ROWS.reduce((a, x) => (x.effects.length > a.effects.length ? x : a)).id,
  ]) ST(id)
  for (const id of [0, 999999, -999999, 30001]) ST(id)

  return V
}
