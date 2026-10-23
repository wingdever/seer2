// 第五段·步骤4 的单测 —— 对拍的 effectcond/effectapply 一族比的是**整串签名** (cond=/apply= 布尔 +
// SigState + SigEffectShape), 它锁得住"判定成不成立 / 效果被改写成哪样", 锁不住下面这些只有形状可讲的东西:
//   · **相位门**的两支放行 (state==null 只认 Resident; 战斗内 phase>Resident 时 All(-999) 也放行);
//   · 前置检查的**短路顺序** (whosTurn==0 / weather=all / whos_attack=all 都在解引用 unit 之前返回);
//   · on_fail 那段后置块会**永久改写**共享 Effect 的 target/ability/abilityOptionDict 并抹掉 on_fail
//     —— 值由 oracle 坐实, 但"改写发生在共享对象上、且 on_fail 被删"这个副作用只有单测锁得住;
//   · apply 的 repeat 两支 (state==null 走 int.Parse 会抛; state!=null 走 (int) 截断) 与未移植算子的**抛点**。
// 数值一律不写死在这里, 由 tools/difftest.mjs 的 effectcond/effectapply 一族负责。
//
// 末尾另起一块 **第六段·批一步骤1** (`set_damage` / `add_status`): 那两族的向量比的是
// `apply=` + 整串 `SigState`, 但上游有两处"读哪一个 state"的不整齐 (:1251 的 `who=="me"` 支、
// :1244 的 `state` 键名) 只有在"哪个对象被改写"这一层才可讲清, 加上 `ToIntList` 的失败语义与
// `MultInitStatus` 的整表乘, 四条形状都由这里的哨兵锁住 —— 依然不写任何上游数值。

// 末尾再续一块 **第六段·批一步骤3** (`add_buff` / `remove_buff`): 印记袋的落点、摘除集合、增幅清零
// 都在整串签名里比, 这里只锁签名比不出的三样 —— **抛点** (硬索引 vs ElementAtOrDefault、两条掷骰缝)、
// **短路顺序** (unique 的 key 检查先于候选检查)、以及**触发链把谁当 sourcePet** 这条只有"落到哪只宠"
// 才可观测的链路。合成印记 (HOLD/INNER) 是为搭链路造的, 不代表任何上游配置; 真表行只用来占 id。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { Effect, PrefabTable, effectFromRow, setEffectTable, type Options } from './effect.ts'
import {
  EffectAbility, EffectCondition, EffectTarget, EffectTiming,
} from './effect-database.ts'
import { createRng } from '../rng.ts'
import type { Rng } from '../rng.ts'
import type { IdentifierHost } from '../parser/identifier.ts'
import { setEffectIdentHost } from '../parser/identifier-effect.ts'
import type { BattlePetView } from '../battle/views.ts'
import type { BattleState } from '../battle/state.ts'
import { Unit, petPowerUp } from '../battle/state.ts'
import { BattleSettings } from '../battle/settings.ts'
import {
  condition, apply, defaultAbility, tryGetPostProcessEffects,
  isCorrectTurn, isCorrectWeather,
} from './effect-judge.ts'
import { setDamage, addStatus } from './ops-basic.ts'
import { addBuff, removeBuff, setOpsBuffRng } from './ops-buff.ts'
import { powerup, setOpsPowerupRng } from './ops-powerup.ts'
import { heal } from './ops-heal.ts'
import { capture } from './ops-capture.ts'
import { petChange, setOpsPetRng } from './ops-pet.ts'
import { win, escape, setWeather } from './ops-state.ts'
import { blockOrCopyBuff } from './ops-block.ts'
import { BattleResultState } from '../battle/result.ts'
import { Buff } from '../buff/buff.ts'
import { BuffType, CopyHandleType } from '../buff/buff-database.ts'
import { BuffInfo, setBuffTables, type BuffInfoTable } from '../buff/buff-info.ts'
import { PetBuffController } from '../pet/buff-controller.ts'
import { Element } from '../pet/element.ts'
import { tryParseFloat } from '../strutil.ts'
import { UnitSkillSystem } from '../battle/unit-skill-system.ts'
import { StatusController } from '../pet/status-controller.ts'
import { Status } from '../pet/status.ts'

const EFFECT_TABLE = new PrefabTable(JSON.parse(readFileSync(new URL('../../data/unity/effects.json', import.meta.url), 'utf8')).prefabs)
setEffectTable(EFFECT_TABLE)

const host: IdentifierHost = {
  rng: createRng(1),
  getPlayerRandom: () => 0, setPlayerRandom: () => {}, getDate: () => 0, getPlayerData: () => null,
}
setEffectIdentHost(host)

const OPT = (o: Record<string, string>): Options => new Map(Object.entries(o))
// 只带相位门与前置检查会读的几列 (phase/turn/whosTurn/weather)。getUnitById 一律不设 ——
// 凡是走到它之前就必须短路返回, 否则测试会炸在缺列上, 而这正是"短路顺序"要锁的东西。
const ST = (over: Record<string, unknown>): BattleState =>
  ({ phase: EffectTiming.OnTurnStart, turn: 3, whosTurn: 0, weather: 0, ...over } as unknown as BattleState)
const eff = (timing: EffectTiming, condOpts: Record<string, string>[], ability: EffectAbility = EffectAbility.None,
  abOpts: Record<string, string> = {}): Effect =>
  new Effect(timing, -1, EffectTarget.None, EffectCondition.None,
    condOpts.map((o) => new Map(Object.entries(o))), ability, new Map(Object.entries(abOpts)))

// ── 相位门 (Effect.cs:226-227) ──────────────────────────────────────────

test('相位门: state==null 只放行 Resident, 其余 timing 落 false (不碰 invokeUnit)', () => {
  assert.equal(condition(eff(EffectTiming.Resident, [{}]), null, null, true, true), true)
  assert.equal(condition(eff(EffectTiming.None, [{}]), null, null, true, true), false,
    '常驻世界里的非 Resident 效果直接判负 (Effect.cs:226)')
})

test('相位门: 战斗内 timing==phase 放行; phase>Resident 时 All(-999) 也放行; 不匹配落 false', () => {
  const st = ST({ phase: EffectTiming.OnTurnStart })
  assert.equal(condition(eff(EffectTiming.OnTurnStart, [{ whos_attack: 'all' }]), null, st, true, true), true,
    'timing 命中当前相位')
  assert.equal(condition(eff(EffectTiming.All, [{ whos_attack: 'all' }]), null, st, true, true), true,
    'phase(3)>Resident(1) 时 All(-999) 命中 (Effect.cs:227)')
  assert.equal(condition(eff(EffectTiming.OnTurnEnd, [{}]), null, st, true, true), false,
    'timing 与 phase 不符, 门就关死')
})

test('checkPhase=false 绕开门: 相位不符照样往下走', () => {
  const st = ST({ phase: EffectTiming.OnTurnStart })
  // timing=None 与 phase(3) 不符, 但 checkPhase=false ⇒ 门不开, 走前置 (全部 all ⇒ 真)。
  assert.equal(condition(eff(EffectTiming.None, [{ whos_attack: 'all' }]), null, st, false, true), true)
})

// ── 前置检查的短路 (EffectConditionHandler.cs:13-79) ─────────────────────

test('isCorrectTurn: state==null 恒真; turn_num=odd/even 按 state.turn; whosTurn==0 只看 turn_num', () => {
  assert.equal(isCorrectTurn(eff(EffectTiming.None, [{}]), null, OPT({ turn_num: 'odd' })), true)
  const st = ST({ turn: 3, whosTurn: 0 })   // 奇数回合, 且没有攻方 (0)
  assert.equal(isCorrectTurn(eff(EffectTiming.None, [{}]), st, OPT({ turn_num: 'odd' })), true, 'turn=3 是 odd')
  assert.equal(isCorrectTurn(eff(EffectTiming.None, [{}]), st, OPT({ turn_num: 'even' })), false, 'turn=3 不是 even')
  // whosTurn==0 ⇒ 即便 whos_turn=me 也不解引用 invokeUnit.id, 只回 turn_num 的真值。
  assert.equal(isCorrectTurn(eff(EffectTiming.None, [{}]), st, OPT({ turn_num: 'all', whos_turn: 'me' })), true,
    'whosTurn=0 时不读 invokeUnit (短路在 unit 解引用之前)')
})

test('isCorrectWeather: state==null/all 放行; 非整数串判 false 不抛; op 生效', () => {
  assert.equal(isCorrectWeather(eff(EffectTiming.None, [{}]), null, OPT({ weather: '5' })), true)
  const st = ST({ weather: 3 })
  assert.equal(isCorrectWeather(eff(EffectTiming.None, [{}]), st, OPT({ weather: 'all' })), true)
  assert.equal(isCorrectWeather(eff(EffectTiming.None, [{}]), st, OPT({ weather: 'abc' })), false,
    'int.TryParse 失败 ⇒ false, 不抛 (EffectConditionHandler.cs:39)')
  assert.equal(isCorrectWeather(eff(EffectTiming.None, [{}]), st, OPT({ weather: '3' })), true)
  assert.equal(isCorrectWeather(eff(EffectTiming.None, [{}]), st, OPT({ weather: '2', weather_op: '>' })), true)
})

test('whos_attack=all 在解引用 unit 之前放行 (isAttackAndHit 短路)', () => {
  const st = ST({ phase: EffectTiming.OnAttack })   // 攻击相位本会去读 lhsUnit.skillSystem.isHit
  assert.equal(condition(eff(EffectTiming.OnAttack, [{ whos_attack: 'all' }]), null, st, true, true), true,
    'invokeUnit 传 null 也不炸 —— 因为 all 支在解引用前返回')
})

// ── on_fail 后置块改写共享 Effect (Effect.cs:275-290) ────────────────────

test('on_fail: 条件落空 ⇒ 用预制体回写**同一条**效果的 target/ability/abilityOptionDict 并抹掉 on_fail', () => {
  // 字典过得了回合门 (turn_num 缺省 all, whosTurn=0), 但 isCorrectWeather(3 vs 5) 判负 ⇒ some=false ⇒ result=false。
  // 注意: 只有**进到 result 那段**才轮到 on_fail; correctList 被 checkTurn 清空是提前 return false, 不触发 on_fail。
  const e = eff(EffectTiming.None, [{ on_fail: '(1002)', weather: '5' }])
  const before = { target: e.target, ability: e.ability }

  const ok = condition(e, null, ST({ weather: 3, whosTurn: 0 }), false, true)

  assert.equal(ok, true, 'on_fail 命中 ⇒ condition 改口返回 true (Effect.cs:289)')
  assert.notEqual(e.target, before.target, 'target 被预制体 1002 覆盖')
  assert.notEqual(e.ability, before.ability, 'ability 被预制体 1002 覆盖')
  assert.equal(e.condOptionDictList[0].get('on_fail'), undefined, 'on_fail 已从条件字典里删除 (不再二次触发)')
})

test('tryGetPostProcessEffects: 空/null ⇒ ok=false; (…) 形状直接给解析出的效果', () => {
  const e = eff(EffectTiming.None, [{}])
  assert.deepEqual(tryGetPostProcessEffects(e, null, null), { ok: false, effects: [] })
  assert.deepEqual(tryGetPostProcessEffects(e, '', null), { ok: false, effects: [] })
  const got = tryGetPostProcessEffects(e, '(1002)', null)
  assert.equal(got.ok, true)
  assert.equal(got.effects.length, 1)
})

// ── apply 的 repeat 两支与未移植算子的抛点 (Effect.cs:295-343) ────────────

test('apply repeat (state==null): 非整数串走 int.Parse ⇒ 抛; 整数串按轮数跑', () => {
  assert.throws(() => apply(eff(EffectTiming.None, [{}], EffectAbility.None, { repeat: '1.5' }), null, null),
    /FormatException|null|Parse/i, 'int.Parse("1.5") 直接抛 (Effect.cs:300)')
  // repeat=3 + ability=None ⇒ DefaultAbility 恒真, 跑 3 轮仍 true。
  assert.equal(apply(eff(EffectTiming.None, [{}], EffectAbility.None, { repeat: '3' }), null, null), true)
})

test('apply: 未移植算子 (Heal) 在这里显式抛, 保住抛点与 phasedrive 一致', () => {
  assert.throws(() => apply(eff(EffectTiming.None, [{}], EffectAbility.Heal), null, null), /NOT_PORTED/)
})

test('defaultAbility: condition 缺省/空/none ⇒ 恒真 (不建子效果)', () => {
  for (const cond of [undefined, '', 'none']) {
    const e = new Effect(EffectTiming.Resident, -1, EffectTarget.None, EffectCondition.None,
      null, EffectAbility.None, new Map(cond === undefined ? [] : [['condition', cond]]))
    assert.equal(defaultAbility(e, null), true, `condition=${JSON.stringify(cond)} ⇒ 真`)
  }
})

// ── 第六段·批一步骤1: set_damage / add_status 的四条形状 ────────────────────
// 哨兵值 -1 只是"这块账本没被动过"的本地标记, 不是上游可观测值。

const ME = 1
const OTHER = 2

const mkUnit = (id: number, sc: StatusController | null = null): Unit => {
  const ss = new UnitSkillSystem()
  ss.skillDamage = -1
  const pet = sc === null ? null : { id: id * 1000, isDead: false, statusController: sc }
  return {
    id, pet, token: null, skillSystem: ss, randomSource: createRng(2),
    petSystem: { pet, petBag: [pet], cursor: 0 },
  } as unknown as Unit
}

// 四个出手位账本 (当前回合 me/other + 上一回合 me/other) 与读它们的那份 state 骨架。
// getEffectHandler/getEffectsByTiming 给空 ⇒ target 解析落到 fromDefault 的「只给当前宠」支。
const mkWorld = (withLast: boolean) => {
  const cur = { me: mkUnit(ME, new StatusController(Status.one(), 100)), other: mkUnit(OTHER) }
  const prev = { me: mkUnit(ME), other: mkUnit(OTHER) }
  const mk = (w: typeof cur) => ({
    phase: EffectTiming.OnTurnStart, turn: 3, whosTurn: 1, weather: 0,
    getUnitById: (id: number) => (id === ME ? w.me : null),
    getRhsUnitById: (id: number) => (id === ME ? w.other : id === OTHER ? w.me : null),
    getEffectHandler: () => null,
    getEffectsByTiming: () => [],
    lastTurnState: null as unknown,
  })
  const st = mk(cur)
  st.lastTurnState = withLast ? mk(prev) : null
  return { st: st as unknown as BattleState, cur, prev, ledgers: [cur.me, cur.other, prev.me, prev.other] }
}

const OP = (ability: EffectAbility, options: Record<string, string>, invoke: Unit | null,
  target: EffectTarget = EffectTarget.None): Effect => {
  const e = new Effect(EffectTiming.None, -1, target, EffectCondition.None,
    null, ability, new Map(Object.entries(options)))
  e.invokeUnit = invoke as never
  return e
}

// 谁被改写了 (按 [cur.me, cur.other, prev.me, prev.other] 的顺序给出 动/没动)。
const touched = (ledgers: Unit[]): boolean[] => ledgers.map((u) => (u.skillSystem as UnitSkillSystem).skillDamage !== -1)

test('set_damage: 时机键名是 `state` 而不是 `target_state` (:1238) —— 后者是哑键', () => {
  const a = mkWorld(true)
  setDamage(OP(EffectAbility.SetDamage, { who: 'other', state: 'last', op: '=' }, a.cur.me), a.st)
  assert.deepEqual(touched(a.ledgers), [false, false, false, true], '`state:"last"` ⇒ 记账到**上一回合**的对方账本')

  const b = mkWorld(true)
  setDamage(OP(EffectAbility.SetDamage, { who: 'other', target_state: 'last', op: '=' }, b.cur.me), b.st)
  assert.deepEqual(touched(b.ledgers), [false, true, false, false], '`target_state` 没人读 ⇒ 按缺省 "current" 走')
})

test('set_damage: `who=="me"` 支读的是**参数 state** 的账本, 不是换出来的 damageState (:1251)', () => {
  const w = mkWorld(true)
  setDamage(OP(EffectAbility.SetDamage, { who: 'me', state: 'last', op: '=' }, w.cur.me), w.st)
  assert.deepEqual(touched(w.ledgers), [true, false, false, false],
    'state:"last" + who:"me" ⇒ 数值取自上一回合, 账本却写在**当前回合**的我方 (上游不整齐, 别顺手修)')
})

test('set_damage: damageState 为 null ⇒ 跳过取数值 (账本吃 0), 但 `who!="me"` 支照旧抛', () => {
  const a = mkWorld(false)   // lastTurnState = null
  setDamage(OP(EffectAbility.SetDamage, { who: 'me', state: 'last', op: '=', value: '7' }, a.cur.me), a.st)
  assert.equal((a.cur.me.skillSystem as UnitSkillSystem).skillDamage, 0,
    ':1255-1260 —— damageState 为 null 时不解析 value, damage 保持 0 ⇒ "=" 写进去的是 0 而非 7')

  const b = mkWorld(false)
  assert.throws(() => setDamage(OP(EffectAbility.SetDamage, { who: 'other', state: 'last' }, b.cur.me), b.st),
    TypeError, 'damageState! 解引用 ⇒ 与上游同样的 NRE 面 (不兜底)')
})

test('add_status: type 走 ToFloatList 兜底 ⇒ 畸形串是「整条不算」(false), 不是抛 (Helper.cs:177-218)', () => {
  for (const type of ['', 'none', 'abc', '1/abc']) {
    const w = mkWorld(false)
    const sc = (w.cur.me.pet as unknown as { statusController: StatusController }).statusController
    const before = sc._initStatus.toString(',')
    assert.equal(addStatus(OP(EffectAbility.AddStatus, { type }, w.cur.me), w.st), false, `type=${JSON.stringify(type)}`)
    assert.equal(sc._initStatus.toString(','), before, '返回 false 时**一只宠都不碰** (在解引用 unit 之前就回了)')
  }
})

test('add_status: type 里的 random 叶落进 native 面 ⇒ 抛 (所以向量必须避开它)', () => {
  const w = mkWorld(false)
  const live = { ...host }
  setEffectIdentHost({ ...host, rng: { ...host.rng, nextInt: () => { throw new Error('native UnityEngine.Random') } } })
  try {
    assert.throws(() => addStatus(OP(EffectAbility.AddStatus, { type: 'random' }, w.cur.me), w.st), /native/)
  } finally {
    setEffectIdentHost(live)
  }
})

test('add_status: key=="init" 的 mult 是**整表乘**且不看 type, key=="current" 才逐维 (:655-665)', () => {
  const dims = (s: Status) => [0, 1, 2, 3, 4, 5].map((i) => s.at(i))

  const init = mkWorld(false)
  const initSc = (init.cur.me.pet as unknown as { statusController: StatusController }).statusController
  initSc._initStatus = Status.of6(1, 1, 1, 1, 1, 1)
  assert.equal(addStatus(OP(EffectAbility.AddStatus, { key: 'init', type: '0', mult: '2', add: '0' }, init.cur.me), init.st), true)
  assert.deepEqual(dims(initSc._initStatus), [2, 2, 2, 2, 2, 2], 'type=0 但六维全乘 —— MultInitStatus 的 type 收而不读')

  const cur = mkWorld(false)
  const curSc = (cur.cur.me.pet as unknown as { statusController: StatusController }).statusController
  curSc._multStatus = Status.of6(1, 1, 1, 1, 1, 1)
  assert.equal(addStatus(OP(EffectAbility.AddStatus, { key: 'current', type: '0', mult: '2', add: '0' }, cur.cur.me), cur.st), true)
  assert.deepEqual(dims(curSc._multStatus), [2, 1, 1, 1, 1, 1], 'MultCurrentStatus 是逐维 —— 同一个动词, 两种作用域')
})

test('add_status: 缺省 mult ("0/1") ⇒ 只做加; 先乘后加的顺序在 add 上留痕 (:667-671)', () => {
  const w = mkWorld(false)
  const sc = (w.cur.me.pet as unknown as { statusController: StatusController }).statusController
  sc._addStatus = Status.of6(1, 1, 1, 1, 1, 1)
  assert.equal(addStatus(OP(EffectAbility.AddStatus, { type: '0', add: '5' }, w.cur.me), w.st), true)
  assert.equal(sc._addStatus.at(0), 6, 'mult=0 ⇒ 乘支整个跳过, 只 += (注释掉的那行没有捡回来)')
})

// ── 第六段·批一步骤3: add_buff / remove_buff ────────────────────────────────
// 印记表用**真表 2121 行** (和 tools/difftest.mjs 同一份装载顺序) 加两条合成行:
// 真行只为让 id 查得到 (18/21/31/1008/1/2/3/-9/-10/-2003), 合成行负责把触发链搭出来。
const BUFF_ROWS = JSON.parse(readFileSync(new URL('../../data/unity/buffs.json', import.meta.url), 'utf8')).buffs

const HOLD = 700101    // 挂一条 on_add_buff ⇒ 会被 OnAddBuff 放出去
const INNER = 700102   // 那条 on_add 要加的那只, 自己不再挂效果 ( recursion 到此为止)

class TestBuffInfos implements BuffInfoTable {
  byId = new Map<number, BuffInfo>()
  ofType = new Map<number, number[]>()

  constructor() {
    for (const r of BUFF_ROWS) {
      const info = new BuffInfo([String(r.id), r.name, r.typeRaw, r.copyHandleRaw, String(r.turn),
        r.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), r.description])
      info.setEffects(r.effects.map(effectFromRow))
      this.byId.set(info.id, info)
    }
    this.byId.set(INNER, BuffInfo.fromFields(INNER, '测试: 被触发的印记', BuffType.Mark, CopyHandleType.New, 2, '', ''))
    const holder = BuffInfo.fromFields(HOLD, '测试: 带 on_add 的印记', BuffType.Mark, CopyHandleType.New, 2, '', '')
    holder.setEffects([new Effect(EffectTiming.OnAddBuff, -1, EffectTarget.CurrentPetBag, EffectCondition.None,
      [new Map([['whos_attack', 'all']])], EffectAbility.AddBuff,
      new Map([['id', String(INNER)], ['target_type', 'other']]), -7)])
    this.byId.set(HOLD, holder)
  }

  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : this.byId.get(id) ?? null }
  // 「按类型枚举印记 id」在这一族里唯一可比的是**候选集空不空**, 所以这张表由测试自己发 (不代表上游表)。
  buffIdsOfType(type: BuffType): number[] { return this.ofType.get(type) ?? [] }
}
const BUFF_TABLE = new TestBuffInfos()
setBuffTables(BUFF_TABLE, EFFECT_TABLE, (id) => tryParseFloat(id!) ?? 0)

type TPet = BattlePetView & { buffController: PetBuffController; statusController: StatusController }

const mkPet = (id: number): TPet => {
  const pet = {
    id, isDead: false, stayTurn: 0,
    statusController: new StatusController(Status.of6(10, 10, 10, 10, 10, 100), 100),
  } as unknown as TPet
  pet.buffController = new PetBuffController(Element.普通, Element.普通, null)
  // BattlePet.cs:61/75/92 —— 构造与拷贝构造都写 `{ parent = this }`。这条 parent 就是
  // OnAddBuff/OnRemoveBuff 递给 CheckAndApply 的**第 5 参 sourcePet**, 少写它整条触发链会落错宠。
  pet.buffController.parent = pet
  return pet
}

const mkBuffWorld = () => {
  const settings = new BattleSettings()
  const a = mkPet(10001)
  const b = mkPet(10002)
  // 真 Unit (不是替身): key=="unit" 那两支要的是 Unit.AddBuff/RemoveBuff 的**平行实现**。
  const lhs = new Unit([a, b], 1, settings, createRng(1))
  const rhs = new Unit([mkPet(20001)], -1, settings, createRng(2))
  const st = {
    phase: EffectTiming.OnTurnStart, turn: 4, whosTurn: 1, weather: 0,
    stateBuffs: [] as [string, Buff][],
    lastTurnState: null,
    getUnitById: (id: number) => (id > 0 ? lhs : id < 0 ? rhs : null),
    getRhsUnitById: (id: number) => (id > 0 ? rhs : id < 0 ? lhs : null),
    getEffectHandler: () => null,
    getEffectsByTiming: () => [],
  } as unknown as BattleState
  return { st, lhs, rhs, a, b }
}

// 直接铺袋 (不走控制器 ⇒ 不触发), 只用来摆场面。
const seed = (pet: TPet, ids: number[]): void => {
  for (const id of ids) pet.buffController.buffs.push(new Buff(id, 2, 1))
}
const bagIds = (pet: TPet): number[] => pet.buffController.buffs.map((x) => x.id)

test('add_buff: turn/value 是**硬索引**, option 走 ElementAtOrDefault —— 长度不齐一边抛一边静默', () => {
  // 只有 `![a/b]` 那种列表形态才会切出多段 (裸串里的 `/` 是**除法表达式**), 所以这里全用列表形态。
  const w = mkBuffWorld()
  assert.throws(() => addBuff(OP(EffectAbility.AddBuff, { id: '![31/1008]', turn: '![2]', value: '![1]' }, w.lhs), w.st),
    /IndexOutOfRangeException/, ':767-768 —— turnExpr 只有一段, k=1 越界即抛 (不是"这段没有就不给回合")')

  const v = mkBuffWorld()
  assert.equal(addBuff(OP(EffectAbility.AddBuff, { id: '![31/1008]', turn: '![2/2]', value: '![1/1]', option: '(k:1)' }, v.lhs), v.st), true)
  assert.deepEqual(bagIds(v.a), [31, 1008], ':825 —— option 少一截 ⇒ 第二只拿到 null ⇒ 当成没配, 照样加')
  assert.deepEqual([...v.a.buffController.buffs[0]!.options], [['k', '1']], 'option 段要带 (…) 壳 (TrimParenthesesLoop 剥不掉就是空表 ⇒ 一个键都不写)')
  assert.deepEqual([...v.a.buffController.buffs[1]!.options], [])
})

test('add_buff: unique[…] 的三支 —— key 先赢、候选空 ⇒ false、有候选没骰子 ⇒ 抛', () => {
  BUFF_TABLE.ofType.set(BuffType.Unhealthy, [])
  BUFF_TABLE.ofType.set(BuffType.Abnormal, [INNER])

  const keyed = mkBuffWorld()
  assert.equal(addBuff(OP(EffectAbility.AddBuff, { id: 'unique[abnormal]', key: 'x' }, keyed.lhs), keyed.st), false)
  assert.deepEqual(keyed.st.stateBuffs, [],
    ':788 —— key 非空时 unique **整条 return false**, 且它排在候选检查之前 (这一支一次骰都没掷)')

  const empty = mkBuffWorld()
  assert.equal(addBuff(OP(EffectAbility.AddBuff, { id: 'unique[unhealthy]' }, empty.lhs), empty.st), false)
  assert.deepEqual(bagIds(empty.a), [], ':792 —— 候选筛空是 return false, 一只都不加')

  const hit = mkBuffWorld()
  assert.throws(() => addBuff(OP(EffectAbility.AddBuff, { id: 'unique[abnormal]' }, hit.lhs), hit.st), /NOT_PORTED/)
  assert.deepEqual(bagIds(hit.a), [], '没骰子就**抛** —— 静默取候选第一项会把 native 面伪装成确定性结果')

  const roll: Rng = { ...createRng(1), nextInt: (min: number) => min }
  setOpsBuffRng(roll)
  try {
    assert.equal(addBuff(OP(EffectAbility.AddBuff, { id: 'unique[abnormal]' }, hit.lhs), hit.st), true)
    assert.deepEqual(bagIds(hit.a), [INNER])
  } finally {
    setOpsBuffRng(null)
    BUFF_TABLE.ofType.clear()
  }
})

test('触发链的 sourcePet 是**持有印记的那只宠** (BattlePet.parent 经 CheckAndApply 第 5 参), 不是当前宠', () => {
  const w = mkBuffWorld()
  // 外层: target=pet_bag + target_type=other ⇒ defaultPet = 当前宠 A 被摘掉 ⇒ HOLD 落在 B 身上。
  // 内层: HOLD 的 on_add 同样带 other —— 只有当 defaultPet 落到**持印的 B** 时, INNER 才会去 A。
  // 若触发链把 sourcePet 丢了 (parent 没接), 内层的 defaultPet 退回 lhsUnit.pet = A ⇒ INNER 会落在 B。
  assert.equal(addBuff(OP(EffectAbility.AddBuff, { id: String(HOLD), target_type: 'other' }, w.lhs, EffectTarget.CurrentPetBag), w.st), true)
  assert.deepEqual(bagIds(w.b), [HOLD])
  assert.deepEqual(bagIds(w.a), [INNER], 'Parser.cs:155 的 `effect.sourcePet ?? lhsUnit.pet` 吃的是控制器 parent')
})

test('remove_buff 的 :965 XOR 四格真值表 + powerId 映射 ((id-1)/2 向零截断, -9/-10 打第 5 维)', () => {
  const cell = (id: number, dim: number, v: number): number => {
    const w = mkBuffWorld()
    seed(w.a, [id])
    w.a.statusController.setPowerUpType(dim, v)
    assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { id: String(id) }, w.lhs), w.st), true)
    return w.a.statusController.powerup.at(dim)
  }
  assert.equal(cell(1, 0, 3), 0, '奇·正 ⇒ true ^ false ⇒ 清')
  assert.equal(cell(1, 0, -3), -3, '奇·负 ⇒ true ^ true ⇒ 不清')
  assert.equal(cell(2, 0, -3), 0, '偶·负 ⇒ false ^ true ⇒ 清')
  assert.equal(cell(2, 0, 3), 3, '偶·正 ⇒ false ^ false ⇒ 不清')
  assert.equal(cell(3, 1, 3), 0, '3 号 ⇒ (3-1)/2 = 第 1 维')
  assert.equal(cell(-9, 5, 3), 0, '-9 ⇒ 第 5 维, 奇·正 ⇒ 清')
  assert.equal(cell(-10, 5, -3), 0, '-10 ⇒ 第 5 维, 偶·负 ⇒ 清 (IsWithin 把 -9/-10 两个都算)')
  assert.equal(cell(-10, 5, 3), 3, '-10 ⇒ 偶·正 ⇒ 不清')
})

test('remove_buff 的保护印记 -2003: 既不清增幅, 也从后面那次摘除里被摘掉', () => {
  const w = mkBuffWorld()
  seed(w.a, [1, -2003])
  w.a.statusController.setPowerUpType(0, 3)
  assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { id: '1' }, w.lhs), w.st), false)
  assert.equal(w.a.statusController.powerup.at(0), 3, ':956 —— id 同时从 idPowerResult 里删掉 ⇒ 增幅一位都不动')
  assert.deepEqual(bagIds(w.a), [1, -2003], ':968 的那次 RemoveRangeBuff 拿到的是空集合 ⇒ 印记留在袋里')
})

test('remove_buff **不走** target 列表: target_type 在这里是哑键, 只按 who 换 unit', () => {
  const w = mkBuffWorld()
  seed(w.a, [18])
  seed(w.b, [18])
  assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { id: '18', target_type: 'other' }, w.lhs, EffectTarget.CurrentPetBag), w.st), true)
  assert.deepEqual(bagIds(w.a), [], '摘的是 lhsUnit.pet (当前宠), 哪怕 target_type 写着 "other"')
  assert.deepEqual(bagIds(w.b), [18])
})

test('key=="unit" 两支都走 Unit 的平行实现: 动 unitBuffs, 不碰宠的袋子, 也不触发印记', () => {
  const r = mkBuffWorld()
  seed(r.a, [18])
  r.lhs.unitBuffs.push(new Buff(18, 2, 1))
  assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { key: 'unit', id: '18' }, r.lhs), r.st), true)
  assert.deepEqual(r.lhs.unitBuffs.map((x) => x.id), [])
  assert.deepEqual(bagIds(r.a), [18], 'Unit.RemoveBuff 摘的是 unitBuffs (与印记袋那套是平行实现)')

  const a = mkBuffWorld()
  assert.equal(addBuff(OP(EffectAbility.AddBuff, { key: 'unit', id: String(HOLD), turn: '2', value: '1' }, a.lhs), a.st), true)
  assert.deepEqual(a.lhs.unitBuffs.map((x) => x.id), [HOLD])
  assert.deepEqual(bagIds(a.a), [], 'HOLD 带着 on_add 效果, 但 Unit.AddBuff 不跑 OnAddBuff ⇒ INNER 一次都不该出现')
  assert.deepEqual(bagIds(a.b), [])
})

test('remove_buff 的两条掷骰缝: 缺省 -1 靠**掷骰前短路**给确定性整表, 落进 [0, 候选数] 才抛', () => {
  const all = mkBuffWorld()
  seed(all.a, [18, 21])
  assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { type: 'mark' }, all.lhs), all.st), true)
  assert.deepEqual(bagIds(all.a), [], 'random_count 缺省 -1 ⇒ int.MaxValue ⇒ 整表摘除, 一次骰都不取')

  const typeRoll = mkBuffWorld()
  seed(typeRoll.a, [18])
  assert.throws(() => removeBuff(OP(EffectAbility.RemoveBuff, { type: 'mark', random_count: '1' }, typeRoll.lhs), typeRoll.st),
    /RemoveRangeBuff/, '缝一: buff-controller 的 RemoveRangeBuff(pred, randomCount) 要 native 骰')

  const idRoll = mkBuffWorld()
  seed(idRoll.a, [1])
  assert.throws(() => removeBuff(OP(EffectAbility.RemoveBuff, { id: '1', random_count: '1' }, idRoll.lhs), idRoll.st),
    /random_count/, '缝二: 算子自己那支 .Random (:909) 是另一个接缝, 消息与缝一不同')

  const over = mkBuffWorld()
  seed(over.a, [1])
  assert.equal(removeBuff(OP(EffectAbility.RemoveBuff, { id: '1', random_count: '9' }, over.lhs), over.st), true)
  assert.deepEqual(bagIds(over.a), [], '9 > 候选数 ⇒ 同样在取骰子之前短路')
})

// ── 第六段·批一步骤4: powerup ────────────────────────────────────────────────
// 这一族**没有 effectapply 对拍**: 上游 `EffectAbilityHandler.Powerup` 的 IL 里直接 `call UnityEngine.Random.Range`,
// 在 dotnet 宿主下**方法入口**就抛 SecurityException (与分支无关) ⇒ oracle 侧永久调不动, 白名单里 7 也故意不放。
// 于是计划里"形状由单测锁"这一条在这儿是**唯一**的证据面, 八条上游形状逐条拍死。
// 印记表沿用上面的真表 (1~10 / -9 / -10 / 45 / 46 / 94 都是真行, 触发时机只有 none ⇒ 补印记不会递归进未移植算子)。

const puPet = (id: number): TPet => {
  const pet = {
    id, isDead: false, stayTurn: 0,
    statusController: new StatusController(Status.of6(10, 10, 10, 10, 10, 100), 100),
  } as unknown as TPet
  pet.buffController = new PetBuffController(Element.普通, Element.普通, null)
  pet.buffController.parent = pet
  // BattlePet.cs:333-354 —— core 里没有 BattlePet 具体类, 规则在 state.ts:petPowerUp, 视图只留转发。
  pet.powerUp = (status: Status, lhsUnit: unknown, state: unknown, isSet?: boolean): void =>
    petPowerUp(pet, status, lhsUnit, state, isSet === true)
  return pet
}

const puWorld = () => {
  const settings = new BattleSettings()
  const a = puPet(10001)
  const b = puPet(10002)   // 主侧袋子放两只, 才拍得出"循环外那份 status 是最后一只攒下的"
  const opp = puPet(20001)
  const lhs = new Unit([a, b], 1, settings, createRng(1))
  const rhs = new Unit([opp], -1, settings, createRng(2))
  const st = {
    phase: EffectTiming.OnTurnStart, turn: 4, whosTurn: 1, weather: 0,
    stateBuffs: [] as [string, Buff][], lastTurnState: null,
    getUnitById: (id: number) => (id > 0 ? lhs : id < 0 ? rhs : null),
    getRhsUnitById: (id: number) => (id > 0 ? rhs : id < 0 ? lhs : null),
    getEffectHandler: () => null,
    getEffectsByTiming: () => [],
  } as unknown as BattleState
  return { st, lhs, rhs, a, b, opp }
}

// 六维读回走 `get powerup` (clamp + FloorToInt 的那条属性), 与上游读法同形。
const pwOf = (pet: TPet): number[] => Status.powerupNames.map((_, i) => pet.statusController.powerup.at(i))
const PUP = (w: ReturnType<typeof puWorld>, options: Record<string, string>,
  target: EffectTarget = EffectTarget.None): boolean =>
  powerup(OP(EffectAbility.Powerup, options, w.lhs, target), w.st)
const preset = (pet: TPet, v: number[]): void => { pet.statusController.setPowerUp(new Status(v)) }

test('powerup: 两个 bool.TryParse 的**求值次序**就是语义, 且解析失败排在整个突变之前', () => {
  const bad = puWorld()
  assert.equal(PUP(bad, { atk: '3', random: 'maybe' }), false)
  assert.deepEqual(pwOf(bad.a), [0, 0, 0, 0, 0, 0], ':487 —— return false 时一个字段都没动 (连 min/max 都没写)')
  assert.deepEqual(bagIds(bad.a), [])

  const order = puWorld()
  assert.equal(PUP(order, { atk: '3', random: 'maybe', copy: 'reverse' }), false,
    'random 那一枪先响 ⇒ copy 是不是 reverse 根本没看到')
  assert.deepEqual(pwOf(order.opp), [0, 0, 0, 0, 0, 0])

  // C# 的 bool.TryParse("1") 是**假** (只认 true/false), 所以这是"解析失败"而不是"非零即真"。
  for (const bad2 of ['1', 'yes']) {
    const t = puWorld()
    assert.equal(PUP(t, { atk: '3', copy: bad2 }), false, `copy="${bad2}"`)
    assert.deepEqual(pwOf(t.a), [0, 0, 0, 0, 0, 0])
  }

  const rev = puWorld()
  assert.equal(PUP(rev, { atk: '3', copy: 'reverse' }), true,
    ':488 —— opCopy=="reverse" 让第二个 TryParse **不求值** (否则 "reverse" 解析失败会 return false)')
  assert.deepEqual(pwOf(rev.a), [3, 0, 0, 0, 0, 0])
  assert.deepEqual(pwOf(rev.opp), [-3, 0, 0, 0, 0, 0], ':610 —— reverse 先 timesF(-1) 再写进 rhsUnit.pet')
})

test('powerup: 六维键名、(int) 向零截断, 而 min/max 在同一个算子里**先于写值**生效', () => {
  const six = puWorld()
  assert.equal(PUP(six, { atk: '3', mat: '-3', def: '2', mdf: '-2', spd: '1', hit: '-1' }), true)
  assert.deepEqual(pwOf(six.a), [3, -3, 2, -2, 1, -1])
  assert.deepEqual(bagIds(six.a), [1, 4, 5, 8, 9, -10],
    'getPowerUpBuffId: 2*type + (正?1:2), 第 5 维写死 -9/-10 —— 袋子里的顺序就是维序')

  const nope = puWorld()
  assert.equal(PUP(nope, { atk: '3', zzz: '9' }), true)
  assert.deepEqual(pwOf(nope.a), [3, 0, 0, 0, 0, 0], '不认的键整个不参与 (六维键名是硬枚举)')

  const hard = puWorld()
  PUP(hard, { atk: '7.9' })
  assert.equal(pwOf(hard.a)[0], 6, '缺省 max=6 ⇒ 7.9 先截成 7 再被钳到 6')
  const low = puWorld()
  PUP(low, { atk: '-7.9' })
  assert.equal(pwOf(low.a)[0], -6)

  const wide = puWorld()
  PUP(wide, { min: '-20', max: '20', atk: '7.9' })
  assert.deepEqual(pwOf(wide.a), [7, 0, 0, 0, 0, 0], ':578-588 的边界写在 :606 之前 ⇒ 同一条向量里就看得出截断')
  const wideNeg = puWorld()
  PUP(wideNeg, { min: '-20', max: '20', atk: '-7.9' })
  assert.equal(pwOf(wideNeg.a)[0], -7, '向零截断是 -7, 不是 -8')
  const zeroAdd = puWorld()
  PUP(zeroAdd, { min: '-20', max: '20', mat: '2/3' })
  assert.deepEqual(pwOf(zeroAdd.a), [0, 0, 0, 0, 0, 0])
  assert.deepEqual(bagIds(zeroAdd.a), [], '0.666 → 0 ⇒ getPowerUpBuffId 给 0 ⇒ continue, 连印记都不补')

  const flipped = puWorld()
  PUP(flipped, { min: '3', max: '1', atk: '5' })
  assert.deepEqual(pwOf(flipped.a), [3, 3, 3, 3, 3, 3],
    'min>max 不钳也不查次序地写进去, 读的时候 Unity Clamp 给 min ⇒ 全维被下限抹成 3')
  assert.deepEqual(bagIds(flipped.a), [1, 3, 5, 7, 9, -9], '补印记读的是**钳后**的既有值 ⇒ 六维全成正向')
})

test('powerup: set 的三态 (null / "true" / 表达式) 与免疫检查的第四参是**两个不同判据**', () => {
  const t1 = puWorld()
  preset(t1.a, [3, -3, 0, 0, 0, 0])
  assert.equal(PUP(t1, { set: 'true', atk: '5' }), true)
  assert.deepEqual(pwOf(t1.a), [5, -3, 0, 0, 0, 0], 'setValue 取回 5, 写的是差值 5-3=2 ⇒ 3+2=5')

  const t2 = puWorld()
  preset(t2.a, [3, -3, 0, 0, 0, 0])
  PUP(t2, { set: 'true' })
  assert.deepEqual(pwOf(t2.a), [3, -3, 0, 0, 0, 0], '每维 add=既有值、set 再减回来 ⇒ 净零, 但 isSet 已经是 true')

  const t3 = puWorld()
  preset(t3.a, [3, -3, 0, 0, 0, 0])
  PUP(t3, { min: '-20', max: '20', set: '7' })
  assert.deepEqual(pwOf(t3.a), [7, 7, 7, 7, 7, 7],
    '表达式形态的 set 是**逐维目标式**: 六维全被拉到 7 (dim1 的差值是 7-(-3)=10)')

  const immune = puWorld()
  preset(immune.a, [3, -3, 0, 0, 0, 0])
  immune.a.buffController.blockBuffIds.push(1)
  PUP(immune, { atk: '3' })
  assert.deepEqual(pwOf(immune.a), [3, -3, 0, 0, 0, 0], 'atk 维被免疫 ⇒ 一点不写')
  assert.deepEqual(bagIds(immune.a), [1, 4],
    ':606 循环下半段照旧跑, 读的是**既有值** ⇒ atk 维按 3 补一枚 id 1 (这不是笔误, 别加 continue); ' +
    'mat 维没被免疫, 写完 -3 后同样补 id 4')

  const bypass = puWorld()
  preset(bypass.a, [3, -3, 0, 0, 0, 0])
  bypass.a.buffController.blockBuffIds.push(1)
  PUP(bypass, { atk: '3', set: '' })
  assert.deepEqual(pwOf(bypass.a), [6, -3, 0, 0, 0, 0],
    ':617 的实参是 `set != null` ⇒ **空串也算存在**, 于是拿到「跳过免疫, 但不做差值改写」这个组合')

  const emptyNet = puWorld()
  preset(emptyNet.a, [3, -3, 0, 0, 0, 0])
  PUP(emptyNet, { set: '' })
  assert.deepEqual(pwOf(emptyNet.a), [3, -3, 0, 0, 0, 0], '空串不进差值改写支 (`!(set===null || set==="")`), add 缺省 0 ⇒ 净零')
})

test('powerup: all / pos / neg 是**按键存在性**依次覆盖同一个 add (顺序 all→pos→neg)', () => {
  const all = puWorld()
  preset(all.a, [3, -3, 0, 0, 0, 0])
  PUP(all, { atk: '5', all: '1' })
  assert.deepEqual(pwOf(all.a), [4, -2, 1, 1, 1, 1],
    '显式维 atk 被 all 覆盖 ⇒ 六维统一加 1 (pos/neg 没给 ⇒ 不参与)')

  const pos = puWorld()
  preset(pos.a, [3, -3, 0, 0, 0, 0])
  PUP(pos, { min: '-20', max: '20', pos: '9' })
  assert.deepEqual(pwOf(pos.a), [12, -3, 0, 0, 0, 0], '只有既有值 > 0 的维吃 pos; 缺省 add (=0) 让其余维原样')

  const neg = puWorld()
  preset(neg.a, [3, -3, 0, 0, 0, 0])
  PUP(neg, { neg: '9' })
  assert.deepEqual(pwOf(neg.a), [3, 6, 0, 0, 0, 0])

  const triple = puWorld()
  preset(triple.a, [3, -3, 0, 0, 0, 0])
  PUP(triple, { min: '-20', max: '20', all: '1', pos: '2', neg: '3' })
  assert.deepEqual(pwOf(triple.a), [5, 0, 1, 1, 1, 1], 'pos/neg 各自覆盖 all, 但**只覆盖符号对得上的那一维**')

  const quiet = puWorld()
  PUP(quiet, { pos: '2' })
  assert.deepEqual(pwOf(quiet.a), [0, 0, 0, 0, 0, 0])
  assert.deepEqual(bagIds(quiet.a), [], '起点全零 ⇒ pos 一维都不落 ⇒ 连印记都不补')
})

test('powerup: add=="op" 读的是 rhsUnit 上场宠的那一维, 与 who 换位后仍然如此', () => {
  const w = puWorld()
  preset(w.opp, [2, 0, 0, 0, 0, 0])
  PUP(w, { atk: 'op', mat: 'op' })
  assert.deepEqual(pwOf(w.a), [2, 0, 0, 0, 0, 0], 'op 不是表达式, 也不看 lhsUnit —— 它固定读 rhsUnit.pet')

  const none = puWorld()
  PUP(none, { def: 'op' })
  assert.deepEqual(pwOf(none.a), [0, 0, 0, 0, 0, 0], '对侧没增幅 ⇒ 0')

  const flip = puWorld()
  preset(flip.a, [4, 0, 0, 0, 0, 0])
  PUP(flip, { who: 'other', atk: 'op' })
  assert.deepEqual(pwOf(flip.a), [4, 0, 0, 0, 0, 0], 'who=other 后 a 变成"对侧", 自己不该被写')
  assert.deepEqual(pwOf(flip.opp), [4, 0, 0, 0, 0, 0], '反向 ⇒ 落笔在对侧宠, op 读的是主侧那一维')
})

test('powerup: 45 / 46 / 94 三个修饰只在 set==null 时生效, 而且是**换对象**不是就地改', () => {
  const cases: [number[], number[]][] = [
    [[45], [6, -3, 0, 0, 0, 0]],     // 正值翻倍
    [[46], [3, -6, 0, 0, 0, 0]],     // 负值翻倍
    [[94], [-3, 3, 0, 0, 0, 0]],     // 整表取反
    [[45, 46, 94], [-6, 6, 0, 0, 0, 0]],   // 三条按 45→46→94 依次串起来
  ]
  for (const [bag, want] of cases) {
    const w = puWorld()
    seed(w.a, bag)
    assert.equal(PUP(w, { atk: '3', mat: '-3' }), true)
    assert.deepEqual(pwOf(w.a), want, `印记 ${bag.join('/')} 的修饰`)
  }

  const gated = puWorld()
  seed(gated.a, [45])
  PUP(gated, { atk: '3', set: 'true' })
  assert.deepEqual(pwOf(gated.a), [3, 0, 0, 0, 0, 0],
    ':591 的判据是 `set == null` (键的存在性) ⇒ 给了 set 三支全跳过; 差值改写又把 3 减成 0 再加回来')

  const survives = puWorld()
  seed(survives.a, [45, 1])
  PUP(survives, { atk: '2' })
  assert.deepEqual(bagIds(survives.a), [45, 1],
    'petPowerUp 开头摘的是 isPower() (id 1~10 / -9~-10) ⇒ 45 不在摘除面, 旧的那枚 1 被摘掉后按新值补回来')
})

test('powerup: random 的确定面 —— pdf 缺省不掷, uniform 只在掷骰前短路时才可比', () => {
  const skipped = puWorld()
  assert.equal(PUP(skipped, { atk: '3', random: 'true' }), true)
  assert.deepEqual(pwOf(skipped.a), [3, 0, 0, 0, 0, 0],
    'random_pdf 缺省 "none" ⇒ 两段抽样都跳过, 但 :536 那句 random_count 表达式照样求值 (在 if/else 之前)')

  const over = puWorld()
  assert.equal(PUP(over, { atk: '2', mat: '3', random: 'true', random_pdf: 'uniform', random_count: '5' }), true)
  assert.deepEqual(pwOf(over.a), [2, 3, 0, 0, 0, 0], '5 > 非零维数 2 ⇒ ListHelper.Random 返回整表 ⇒ 两维都留下')

  const empty = puWorld()
  assert.equal(PUP(empty, { random: 'true', random_pdf: 'uniform', random_count: '1' }), true)
  assert.deepEqual(pwOf(empty.a), [0, 0, 0, 0, 0, 0], '候选表空 (全零) ⇒ 一次骰都不取')

  const zeroCount = puWorld()
  assert.equal(PUP(zeroCount, { atk: '3', random: 'true', random_pdf: 'uniform', random_count: '0' }), true)
  assert.deepEqual(pwOf(zeroCount.a), [0, 0, 0, 0, 0, 0], 'count=0 ⇒ while 立即收 ⇒ 抽到空集, 六维全被清掉')

  const roll = puWorld()
  assert.throws(() => PUP(roll, { atk: '3', mat: '3', random: 'true', random_pdf: 'uniform', random_count: '1' }),
    /NOT_PORTED/, '落进 [1, 非零维数] 才真要掷 native 骰 ⇒ 显式抛, 绝不静默取第一项')
  assert.deepEqual(pwOf(roll.a), [0, 0, 0, 0, 0, 0], '抛点在 :606 之前 ⇒ 一个字段都没写')

  const pdf = puWorld()
  assert.throws(() => PUP(pdf, { atk: '3', random: 'true', random_pdf: '1' }), /NOT_PORTED/,
    ':561 的 Random.Range(0f, sum) 是**另一条**native 缝, 必掷')
  assert.deepEqual(pwOf(pdf.a), [0, 0, 0, 0, 0, 0])
})

test('powerup: uniform 清理走满六维, 自定义 pdf 那段的上界却是**字面量 5** —— 第六维永不被它清零', () => {
  const SIX = { atk: '1', mat: '1', def: '1', mdf: '1', spd: '1', hit: '1' }

  const uni = puWorld()
  const pickLast: Rng = { ...createRng(1), nextInt: (_min: number, _max: number) => 5 }
  setOpsPowerupRng(pickLast)
  try {
    assert.equal(PUP(uni, { ...SIX, random: 'true', random_pdf: 'uniform', random_count: '1' }), true)
    assert.deepEqual(pwOf(uni.a), [0, 0, 0, 0, 0, 1],
      ':546-553 的上界是 typeNames.Length=6 ⇒ 抽中 index 5 时 hit 维活下来')
  } finally {
    setOpsPowerupRng(null)
  }

  const pdf = puWorld()
  const roll09: Rng = { ...createRng(1), nextFloat: (_min: number, _max: number) => 0.9 }
  setOpsPowerupRng(roll09)
  try {
    assert.equal(PUP(pdf, { ...SIX, random: 'true', random_pdf: '0/1' }), true)
    assert.deepEqual(pwOf(pdf.a), [0, 1, 0, 0, 0, 1],
      ':570 写死 `i < 5` ⇒ index 1 活、0/2/3/4 清, 而第 5 维**根本不在循环里** (上游 quirk, 别"顺手修正")')
  } finally {
    setOpsPowerupRng(null)
  }
})

test('powerup: copy / reverse 在 target 循环**外**, 用的是最后一只 target 攒下的那份 status', () => {
  const mk = () => {
    const w = puWorld()
    preset(w.a, [3, 0, 0, 0, 0, 0])
    preset(w.b, [0, -3, 0, 0, 0, 0])
    return w
  }
  const opts = { all: '1', pos: '2', neg: '3' }

  const copy = mk()
  assert.equal(PUP(copy, { ...opts, copy: 'true' }, EffectTarget.CurrentPetBag), true)
  assert.deepEqual(pwOf(copy.a), [5, 1, 1, 1, 1, 1], 'target A: 第一维走 pos ⇒ 2, 其余走 all ⇒ 1')
  assert.deepEqual(pwOf(copy.b), [1, 0, 1, 1, 1, 1], 'target B: 第二维走 neg ⇒ 3')
  assert.deepEqual(pwOf(copy.opp), [1, 3, 1, 1, 1, 1],
    ':610-617 落在循环外 ⇒ 对侧拿到的是**最后一只** (B) 那份, 不是 A 的, 也不是两者的合成')

  const rev = mk()
  assert.equal(PUP(rev, { ...opts, copy: 'reverse' }, EffectTarget.CurrentPetBag), true)
  assert.deepEqual(pwOf(rev.opp), [-1, -3, -1, -1, -1, -1], 'reverse 先把最后那份 timesF(-1) 再写')

  const plain = mk()
  assert.equal(PUP(plain, opts, EffectTarget.CurrentPetBag), true)
  assert.deepEqual(pwOf(plain.opp), [0, 0, 0, 0, 0, 0], '没给 copy ⇒ 对侧一点不沾 (这一段整个跳过)')
})

// ── 第六段·批一步骤5: heal —— 真表喂不到的那几支 ────────────────────────────
// heal 的 effectapply 一族把**可达**的面全拍了 (真表能驱动 OnEffect 修正链的只有 6 行, 见
// tools/snap-mirror.mjs 的 heal 段注释), 这里补的是那批向量结构上到不了的四支:
//   · `state == null` 的强转抛点 (计划口径: heal 的向量一律带 spec, 所以那条同抛不进 golden);
//   · 修正链的 `type:"set"` / `type:"max"` 两支 (真表没有这两种 on_effect 行);
//   · filter 里的 `key[skill|buff|item]` 三词 (同样没有驱动源);
//   · 「候选的 value 只在四个 case 体内解析」这条求值纪律。
// 候选效果用手搭 (不经 handler), 但 filter、priority 排序、同 unit 检查、PostProcess 走的都是真代码。
// `Effect.GetEffectIdentifier` 那条 (ability 支只剥**方括号**) 记在 effect.test.ts —— 它是 Effect 自己的形状,
// 不是 heal 的分支, 两处各写一遍只会漂移。

const hlPet = (id: number, hp: number): TPet => {
  const sc = new StatusController(Status.of6(10, 10, 10, 10, 10, 100), hp)
  const pet = {
    id, isDead: false, stayTurn: 0, chain: 0,
    statusController: sc,
    // hp/maxHp 必须是**属性** (BattlePet.cs:32-41 转发给 statusController), heal 末尾那句
    // `pet.hp = pet.hp + healAdd` 靠 setter 落进控制器、再靠 getter 的 clamp 收到 [0, maxHp]。
    get hp(): number { return sc.hp },
    set hp(v: number) { sc.hp = v },
    get maxHp(): number { return sc.maxHp },
    set maxHp(v: number) { sc.maxHp = v },
    get battleStatus() { return sc.battleStatus },
    get buffs(): Buff[] { return pet.buffController.buffs },
    powerUp: (): void => {},
  } as unknown as TPet
  pet.buffController = new PetBuffController(Element.普通, Element.普通, null)
  pet.buffController.parent = pet
  return pet
}

// 候选效果由 `specs` 现场拼 (invokeUnit 决定 :224 的同 unit 检查, 默认挂本侧; 不给 condition 就恒进表)。
// 只把 OnEffect 那一族交出去 —— 别的 timing 照旧空表: fromDefault 也调 getEffectsByTiming
// (OnSelectTarget), 一并返回候选会把 target 列表整个带跑。
type HlCand = { o: Record<string, string>, ivk?: 'lhs' | 'rhs' }
const hlWorld = (cands: HlCand[] = [], hp = 70) => {
  const settings = new BattleSettings()
  const a = hlPet(10001, hp)
  const lhs = new Unit([a], 1, settings, createRng(1))
  const rhs = new Unit([hlPet(20001, 40)], -1, settings, createRng(2))
  const list = cands.map((c) => OP(EffectAbility.None, c.o, c.ivk === 'rhs' ? rhs : lhs))
  const st = {
    phase: EffectTiming.OnTurnStart, turn: 4, whosTurn: 1, weather: 0,
    stateBuffs: [] as [string, Buff][], lastTurnState: null,
    getUnitById: (id: number) => (id > 0 ? lhs : id < 0 ? rhs : null),
    getRhsUnitById: (id: number) => (id > 0 ? rhs : id < 0 ? lhs : null),
    getEffectHandler: () => null,
    getEffectsByTiming: (t: EffectTiming, _h: unknown, filter: (e: Effect) => boolean): Effect[] =>
      t === EffectTiming.OnEffect ? list.filter(filter) : [],
  } as unknown as BattleState
  return { st, lhs, rhs, a, opp: rhs.pet as TPet }
}
const H = (w: ReturnType<typeof hlWorld>, options: Record<string, string>): boolean =>
  heal(OP(EffectAbility.Heal, options, w.lhs), w.st)

test('heal: state==null 那一支要 base Pet 强转 ⇒ core 显式抛, 战斗支照跑', () => {
  const w = hlWorld()
  assert.throws(() => heal(OP(EffectAbility.Heal, { add: '10' }, w.lhs), null), /NOT_PORTED/)
  assert.equal(H(w, { add: '10' }), true, '同一份选项带上 state 就走战斗支 —— 抛点只在那一支')
  assert.equal(w.a.hp, 80)
})

test('heal: 修正链的 set / max 两支改写的是**本地变量**, 且 set 支不记账也不看 rec', () => {
  const setCand: HlCand = { o: { type: 'set', op: '+', value: '5' } }

  const setW = hlWorld([setCand])
  assert.equal(H(setW, { set: '10' }), true)
  assert.equal(setW.a.hp, 15, ':238 —— setHp 先由候选 +5 再整条落 hp')

  // 候选写着 set, 外层却没有 set 选项 ⇒ 改的是**没人读**的那个局部变量 (set=='none' 直接跳过整支)。
  const idle = hlWorld([setCand])
  assert.equal(H(idle, { add: '10' }), true)
  assert.equal(idle.a.hp, 80, 'add 一路照旧 —— setHp 那份修正被丢掉')

  const maxW = hlWorld([{ o: { type: 'max', op: '*', value: '2' } }])
  assert.equal(H(maxW, { max: '30' }), true)
  assert.equal(maxW.a.maxHp, 60, ':241 —— maxHp 也是先修正再写 (30×2)')
  assert.equal(maxW.a.hp, 60, 'hp 的 clamp 跟着上限走')
})

test('heal: filter 里的 key[skill|buff|item] 比的是 type 的**第一段** (Split("_").First())', () => {
  // 候选把 rec 抬到 200 ⇒ healAdd = (int)(10 × 2.0) = 20 ⇒ hp 70→90; 不进表则是 80。
  const cand = (key: string): HlCand =>
    ({ o: { condition: `(key[${key}]:1)`, type: 'rec', op: '+', value: '100' } })

  const hit = hlWorld([cand('skill')])
  assert.equal(H(hit, { add: '10' }), true)
  assert.equal(hit.a.hp, 90, 'type 缺省 skill ⇒ key[skill] 真 ⇒ 修正进得来')

  const miss = hlWorld([cand('skill')])
  assert.equal(H(miss, { add: '10', type: 'item' }), true)
  assert.equal(miss.a.hp, 80, 'type=item 时 key[skill] 假 ⇒ 候选被 filter 拦下')

  const seg = hlWorld([cand('item')])
  assert.equal(H(seg, { add: '10', type: 'item_x' }), true)
  assert.equal(seg.a.hp, 90, '"item_x" 的第一段仍是 item —— 别整串比对')
})

test('heal: 候选的 value 只在四个 case **体内**解析 ⇒ 别的 type 连表达式都不碰', () => {
  // 探针用 `random[2~3]`: 这一支 (identifier-effect.ts:162-164) 解析即取 `HOST.rng.next01()`,
  // 于是「有没有解析」在注入的 rng 上留痕。**不能写裸 `random`** —— 那支落 GetBattleIdentifier:283
  // 读的是 unit 上那个**存档字段**, 一次骰都不取, 毒不动。
  const boom = (): number => { throw new Error('native UnityEngine.Random') }
  const poison = { ...host, rng: { ...host.rng, next01: boom, nextInt: boom } }
  setEffectIdentHost(poison)
  try {
    // 真表里就有 `type:"unhealthy"` 这种行 (它进链、跑 PostProcess, 但一个数值都不改)。
    const quiet = hlWorld([{ o: { type: 'unhealthy', op: '+', value: 'random[2~3]' } }])
    assert.equal(H(quiet, { add: '10' }), true, ':229 `default: break` ⇒ type 不认就连 value 都不解析')
    assert.equal(quiet.a.hp, 80, '修正一个数没改, 治疗照原样落地')

    const loud = hlWorld([{ o: { type: 'add', op: '+', value: 'random[2~3]' } }])
    assert.throws(() => H(loud, { add: '10' }), /native/, 'type=add 才走进 case 体 ⇒ 那个 value 真被解析')
  } finally {
    setEffectIdentHost(host)
  }
})

test('heal: 候选挂在**对侧 unit** ⇒ :224 的同 unit 检查把它挡掉 (修正与 PostProcess 都不做)', () => {
  const w = hlWorld([{ o: { type: 'add', op: '*', value: '-1' }, ivk: 'rhs' }])
  assert.equal(H(w, { add: '10' }), true)
  assert.equal(w.a.hp, 80, 'filter 判的是外层 effect ⇒ 候选照样进表, 但同 unit 检查先 return')
  assert.equal(w.opp.hp, 40, '对侧那只也没被修正碰 (修正只写外层这条的局部变量)')
})

// ── 第七段·批三: capture —— 掷点支的数值/短路形状 (oracle 拍不到 native 掷) ────────────
// 三条 oracle 已发的可比支 (state==null / prob 字面解析失败 / baseId==10 短路成功) 在 effectapply 族里
// 比的是整串签名, 结构上到不了的是**baseId≠10 的掷点那半** —— 血线分档 ×0.25/1/1.5/2、buff(-2)÷3、
// `value >= rng` 的比较, 以及那条**承重的惰性 `||`** (baseId==10 绝不能碰随机源, 否则与 oracle 那支没掷的
// `random=` 分叉)。数值口径全走 battle/damage.ts 的 captureValue, 这里只锁装配与短路。

const capPet = (id: number, hp: number, maxHp: number, baseId = 0): TPet => {
  const sc = new StatusController(Status.of6(10, 10, 10, 10, 10, 100), 100)
  sc.maxHp = maxHp
  sc.hp = hp
  const pet = {
    id, isDead: false, stayTurn: 0, chain: 0, baseId,
    statusController: sc,
    get hp(): number { return sc.hp },
    set hp(v: number) { sc.hp = v },
    get maxHp(): number { return sc.maxHp },
    set maxHp(v: number) { sc.maxHp = v },
    // pet_change :140/:141 读 outPet.buffs, :144/:151 读写 buffController ⇒ 这三样都得挂上 (与 hlPet 同形)。
    get buffs(): Buff[] { return pet.buffController.buffs },
    get anger(): number { return sc.anger },
    set anger(v: number) { sc.anger = v },
  } as unknown as TPet
  pet.buffController = new PetBuffController(Element.普通, Element.普通, null)
  pet.buffController.parent = pet
  return pet
}

// rollFixed 给定 ⇒ 把**发起方**的随机源换成定值: 每次 roll() 都返回它 ⇒ 掷点比较可判,
// 不依赖 mulberry32 的流 (只锁形状, 不锁序列)。未给 ⇒ 保留构造期的 createRng, 由测试自己再缝。
const capWorld = (target: TPet, rollFixed?: number) => {
  const settings = new BattleSettings()
  const lhs = new Unit([capPet(10001, 100, 100)], 1, settings, createRng(1))
  const rhs = new Unit([target], -1, settings, createRng(2))
  // capture :96 往**发起方当前技能**的 options 写 capture_result ⇒ 得先给它一本能落字的账。
  lhs.skillSystem!.skill = { options: new Map<string, string>() } as never
  if (rollFixed !== undefined) {
    lhs.randomSource = {
      next01: () => 0, nextInt: () => rollFixed, nextFloat: () => 0, pick: () => undefined, seed: () => 0,
    }
  }
  const st = {
    phase: EffectTiming.OnTurnStart, turn: 4, whosTurn: 1, weather: 0,
    stateBuffs: [] as [string, Buff][], lastTurnState: null,
    myUnit: lhs, opUnit: rhs, result: { state: -1 }, actionOrder: [1, -1], actionCursor: 0,
    getUnitById: (id: number) => (id > 0 ? lhs : id < 0 ? rhs : null),
    getRhsUnitById: (id: number) => (id > 0 ? rhs : id < 0 ? lhs : null),
    getEffectHandler: () => null,
    getEffectsByTiming: (): Effect[] => [],
  } as unknown as BattleState
  const capResult = (): string | undefined => (lhs.skill as unknown as { options: Map<string, string> }).options.get('capture_result')
  return { st, lhs, rhs, target, capResult }
}
const CAP = (options: Record<string, string>, w: ReturnType<typeof capWorld>): boolean =>
  capture(OP(EffectAbility.Capture, options, w.lhs), w.st)
// 掷点缝一碰就抛 —— 用来证明某支**没**取随机源。
const noRoll: Rng = {
  next01: (): number => { throw new Error('native UnityEngine.Random') },
  nextInt: (): number => { throw new Error('native UnityEngine.Random') },
  nextFloat: (): number => 0, pick: () => undefined, seed: () => 0,
}

test('capture: state==null 与 prob 字面解析失败 ⇒ 都干净 return false (且在解引用 invokeUnit 之前)', () => {
  const w = capWorld(capPet(20001, 50, 100))
  assert.equal(capture(OP(EffectAbility.Capture, { prob: '50' }, w.lhs), null), false)

  // :72 的字面 float.TryParse 排在 :74 的 `(Unit)effect.invokeUnit` **之前** ⇒ 空发起方也只落 false,
  // 不会被移植体自己造出一个上游没有的 NRE。对照组: prob 合法时才会去解引用 ⇒ 这时才抛。
  w.lhs.randomSource = noRoll
  assert.equal(capture(OP(EffectAbility.Capture, { prob: 'abc' }, null), w.st), false,
    'prob 解析失败那支在取 unit 之前 ⇒ invokeUnit 为空也不抛、也不掷')
  assert.throws(() => capture(OP(EffectAbility.Capture, { prob: '50' }, null), w.st),
    'prob 合法 ⇒ 才走到解引用空发起方 ⇒ 抛, 坐实两条的先后')
})

test('capture: baseId==10 短路 ⇒ 整条不碰随机源, 成功后四处突变全落', () => {
  const w = capWorld(capPet(20001, 100, 100, 10))   // baseId=10
  const before = w.lhs.random
  w.lhs.randomSource = noRoll
  assert.equal(CAP({ prob: '1' }, w), true)
  assert.equal(w.lhs.random, before, ':95 惰性 || —— baseId==10  ⇒ `Unit.RNG()` 根本不取')
  assert.equal(w.capResult(), 'true')
  assert.equal(w.st.phase, EffectTiming.OnBattleEnd)
  assert.equal(w.st.result.state, BattleResultState.CaptureSuccess)
  assert.equal(w.st.myUnit.isDone, true)
  assert.equal(w.st.opUnit.isDone, true)
  assert.equal(w.st.actionCursor, w.st.actionOrder.length, ':104 行动游标推到队尾')
})

test('capture: baseId≠10 走掷点 —— 血线分档 ×2/×0.25 与 value>=rng 的比较, 失败不终结', () => {
  // 残血 (lost=0.9 > 0.75) ⇒ ×2: prob 30 → value 60 ≥ rng 50 → 真 ⇒ 终结。
  const hit = capWorld(capPet(20001, 10, 100), 50)
  assert.equal(CAP({ prob: '30' }, hit), true)
  assert.equal(hit.capResult(), 'true')
  assert.equal(hit.st.phase, EffectTiming.OnBattleEnd)
  assert.equal(hit.st.result.state, BattleResultState.CaptureSuccess)

  // 满血 (lost=0.1 ≤ 0.25) ⇒ ×0.25: prob 30 → value 7.5 < rng 50 → 假 ⇒ 算子仍返回 true, 但**不跳相位**。
  const miss = capWorld(capPet(20001, 90, 100), 50)
  assert.equal(CAP({ prob: '30' }, miss), true, '算子返回"执行了", 成不成只写进 capture_result')
  assert.equal(miss.capResult(), 'false')
  assert.equal(miss.st.phase, EffectTiming.OnTurnStart, '失败 ⇒ 不跳 OnBattleEnd')
  assert.equal(miss.st.result.state, -1, '失败 ⇒ 不动 result.state')

  // buff(-2) ⇒ 先 ÷3 再分档: 同残血 ×2, 但 value = 30/3 ×2 = 20 < 50 → 翻成假。
  const debuffed = capPet(20001, 10, 100)
  debuffed.buffController.buffs.push(new Buff(-2, 2, 1))
  const dw = capWorld(debuffed, 50)
  assert.equal(CAP({ prob: '30' }, dw), true)
  assert.equal(dw.capResult(), 'false', ':82 异常状态印记 ⇒ value/3, 把本来会中的 60 打成 20')
})

// ── 第七段·批三: pet_change —— 换场的 cursor/anger/RefreshStayTurn 与 random 缝 ──────────
// 五条 oracle 向量 (三支守卫 + 两支无印记成功支) 比的是整串 sigState; 这里补三条它对不上的面:
//   · **native random 支** (:125 `randomIndexList.Random()` ⇒ oracle 不发) —— 未注入显式抛、注入后落到某个候选下标;
//   · **anger 比值**走 buff(63)/buff(64) 的非常缺省那半 (成功向量两侧都没印记 ⇒ 只拍了 `?? 80/100` `?? 100/100`);
//   · **RefreshStayTurn 打全体** 与 fightPetCursor 的 who 分流 (myUnit 记、other 不记)。
// applyBuffs 在这里挂**空函数** —— 真天气印记那条两侧同代码, 已由 effectapply 向量拍过, 这里只锁算子自身的突变。

const pcWorld = (masterBag: Array<{ id: number, hp: number, maxHp: number, stayTurn?: number, anger?: number }>) => {
  const settings = new BattleSettings()
  const mk = (s: { id: number, hp: number, maxHp: number, stayTurn?: number, anger?: number }): TPet => {
    const p = capPet(s.id, s.hp, s.maxHp)
    p.stayTurn = s.stayTurn ?? 0
    // capPet 把 isDead 写死成 false; 换场的候选集要按 hp 判死 ⇒ 这里覆盖回真值 (:121 的 !x.isDead)。
    ;(p as unknown as { isDead: boolean }).isDead = s.hp <= 0
    if (s.anger !== undefined) p.anger = s.anger
    return p
  }
  const lhs = new Unit(masterBag.map(mk), 1, settings, createRng(1))
  const rhs = new Unit([mk({ id: 20001, hp: 30, maxHp: 60, anger: 10 }), mk({ id: 20002, hp: 40, maxHp: 40, anger: 5 })],
    -1, settings, createRng(2))
  const cursors = new Set<number>()
  const st = {
    phase: EffectTiming.OnTurnStart, turn: 5, whosTurn: 1, weather: 0,
    stateBuffs: [] as [string, Buff][], lastTurnState: null,
    myUnit: lhs, opUnit: rhs, actionOrder: [1, -1], actionCursor: 0,
    result: { state: 0, fightPetCursors: cursors, addFightPetCursor: (c: number): void => { cursors.add(c) } },
    applyBuffs: (): void => {},
    getUnitById: (id: number) => (id > 0 ? lhs : id < 0 ? rhs : null),
    getRhsUnitById: (id: number) => (id > 0 ? rhs : id < 0 ? lhs : null),
  } as unknown as BattleState
  return { st, lhs, rhs, cursors }
}
const PC = (options: Record<string, string>, w: ReturnType<typeof pcWorld>, ivk: 'lhs' | 'rhs' = 'lhs'): boolean => {
  const e = OP(EffectAbility.PetChange, options, ivk === 'rhs' ? w.rhs : w.lhs)
  return petChange(e, w.st)
}

test('pet_change: 三支守卫 (state==null / 负下标 / random 无备选) 都在 applyBuffs 与掷点之前 return false', () => {
  assert.equal(petChange(OP(EffectAbility.PetChange, {}, null), null), false)

  const neg = pcWorld([{ id: 10001, hp: 70, maxHp: 100 }, { id: 10002, hp: 50, maxHp: 50 }])
  assert.equal(PC({ target_index: '-1' }, neg), false)
  assert.equal(neg.lhs.petSystem.cursor, 0, ':126 负下标 ⇒ 没落 cursor')

  // 只有当前宠活着 (10002 死、10003 洞) ⇒ randomIndexList 空 ⇒ :122 false, 且**不碰随机源** (未注入也不抛)。
  const noAlt = pcWorld([{ id: 10001, hp: 70, maxHp: 100 }, { id: 10002, hp: 0, maxHp: 50 }])
  assert.equal(PC({ target_index: 'random' }, noAlt), false)
  assert.equal(noAlt.lhs.petSystem.cursor, 0)
})

test('pet_change: random 支的 native 缝 —— 未注入显式抛, 注入后落到唯一候选下标', () => {
  setOpsPetRng(null)
  const w = pcWorld([{ id: 10001, hp: 70, maxHp: 100 }, { id: 10002, hp: 50, maxHp: 50 }])
  assert.throws(() => PC({ target_index: 'random' }, w), /NOT_PORTED/,
    ':125 randomIndexList.Random() 是 native ECall ⇒ 无注入即抛 (oracle 从不发这支)')

  setOpsPetRng(createRng(3))
  try {
    const w2 = pcWorld([{ id: 10001, hp: 70, maxHp: 100 }, { id: 10002, hp: 50, maxHp: 50 }])
    assert.equal(PC({ target_index: 'random' }, w2), true)
    assert.equal(w2.lhs.petSystem.cursor, 1, '唯一候选 = index1 ⇒ 必然落到它')
  } finally {
    setOpsPetRng(null)
  }
})

test('pet_change: 换场成功支 —— cursor 移动、anger = floor(out × 0.8 × 1.0)、RefreshStayTurn 打全体、myUnit 记 fightPetCursor', () => {
  const w = pcWorld([
    { id: 10001, hp: 70, maxHp: 100, stayTurn: 3, anger: 50 },
    { id: 10002, hp: 50, maxHp: 50, stayTurn: 2, anger: 20 },
    { id: 10003, hp: 9, maxHp: 9, stayTurn: 1, anger: 7 },
  ])
  assert.equal(PC({ target_index: '2' }, w), true)
  assert.equal(w.lhs.petSystem.cursor, 2)
  // :138 读的是**离场宠** (10001) 的 anger=50; :150 写到**上场宠** (10003): floor(50 × 80/100 × 100/100) = 40。
  assert.equal(w.lhs.pet!.anger, 40, '新场上宠接过 floor(离场 anger × 0.8)')
  assert.equal(w.lhs.petSystem.petBag[0]!.anger, 50, '离场宠自己的 anger 没被动 (那只读只写新宠)')
  // :146 RefreshStayTurn —— 全体 stayTurn 归零。
  for (const p of w.lhs.petSystem.petBag) assert.equal(p?.stayTurn ?? 0, 0, '换场把每一只 stayTurn 清 0')
  // :154 myUnit 换场 ⇒ 记进 fightPetCursors。
  assert.ok(w.cursors.has(2), '我方换场记 fightPetCursor(2)')
})

test('pet_change: who=="other" ⇒ 换 rhs 那只, 且 petChangeUnit.id ≠ myUnit.id ⇒ **不记** fightPetCursor', () => {
  const w = pcWorld([{ id: 10001, hp: 70, maxHp: 100, anger: 100 }])
  assert.equal(PC({ who: 'other', target_index: '1' }, w), true)
  assert.equal(w.rhs.petSystem.cursor, 1)
  assert.equal(w.rhs.pet!.anger, 8, 'rhs 离场宠 (20001) anger 10 ⇒ floor(10×0.8) = 8 落到 20002')
  assert.equal(w.cursors.size, 0, '对手换场不进 fightPetCursors (:154 的 id==myUnit.id 守卫)')
})

// ── 第八段·批四: win / escape / set_weather / block_buff ─────────────────────
// oracle 面见 snap-mirror 的「第八段·批四」段: win/escape **只发了 state==null 与 atkUnit==null 两条**,
// 因为结果面会走到 `Unit.IsMyUnit()` ⇒ `PhotonNetwork.IsConnected` ⇒ Photon 静态构造里的 ECall
// (`SecurityException: ECall methods must be packaged into a system module`, 与 `Powerup` 同根因) ——
// 按 oracle-playbook §6 的**单向闸门**规矩, 那类向量"根本不生成"。
// 所以结果面在这里锁: 世界里的 unit 用**真 `Unit`**, `isMyUnit` 也就是真方法 (离线 ⇒ `isMasterUnit`,
// state.ts:343 —— 生产路径读的正是这个退化值; 它此前没有任何测试覆盖)。

/** 一只只带 `buffController` 的宠: 这四支只碰印记控制器与 unit 身份, 不碰 status/skill。 */
const bwPet = (id: number): BattlePetView =>
  ({ id, hp: 50, maxHp: 100, anger: 20, isDead: false, stayTurn: 0, chain: 0,
    buffController: new PetBuffController(Element.普通) }) as unknown as BattlePetView

const BW = (opts: { whosTurn?: number; weather?: number; blockWeather?: 'me' | 'other' } = {}) => {
  const settings = new BattleSettings()
  const my = new Unit([bwPet(10001)], 1, settings, createRng(1))
  const op = new Unit([bwPet(20001)], -1, settings, createRng(1))
  if (opts.blockWeather === 'me') my.pet!.buffController.blockBuffWithType([BuffType.Weather])
  if (opts.blockWeather === 'other') op.pet!.buffController.blockBuffWithType([BuffType.Weather])
  const whosTurn = opts.whosTurn ?? 1
  const st = {
    phase: EffectTiming.None, weather: opts.weather ?? 0, whosTurn,
    actionOrder: [1, -1, 2, -2], actionCursor: 0,
    result: { state: BattleResultState.Fighting, fightPetCursors: new Set<number>(), capturePet: null },
    // 真类里这四个是 getter; 这里给出与离线口径一致的同一组对象。
    masterUnit: my, clientUnit: op, myUnit: my, opUnit: op,
    getUnitById: (id: number) => (id > 0 ? my : id < 0 ? op : null),
    getRhsUnitById: (id: number) => (id > 0 ? op : id < 0 ? my : null),
    get atkUnit() { return whosTurn === 0 ? null : (whosTurn > 0 ? my : op) },
  }
  return { st: st as unknown as BattleState, my, op }
}

test('win: state==null ⇒ false; 否则 phase/result/两个 isDone/actionCursor 一起落, 胜负由 who 选出的 unit 定', () => {
  assert.equal(win(OP(EffectAbility.Win, {}, null), null), false, ':41 常驻壳直接不算')

  const a = BW()
  assert.equal(win(OP(EffectAbility.Win, {}, a.my), a.st), true)
  assert.equal(a.st.phase, EffectTiming.OnBattleEnd, ':46')
  assert.equal(a.st.result.state, BattleResultState.Win, "who 缺省 'me' ⇒ getUnitById(1)=master ⇒ isMyUnit ⇒ Win (:48)")
  assert.equal(a.my.isDone, true)
  assert.equal(a.op.isDone, true, ':49 是链式赋值 ⇒ 两个 unit 都置位')
  assert.equal(a.st.actionCursor, 4, ':50 取 actionOrder.Count (队尾), 不是 whosTurn')

  const b = BW()
  assert.equal(win(OP(EffectAbility.Win, { who: 'other' }, b.my), b.st), true)
  assert.equal(b.st.result.state, BattleResultState.Lose, "who != 'me' ⇒ getRhsUnitById(1)=client ⇒ 不是 myUnit")

  const c = BW()
  assert.equal(win(OP(EffectAbility.Win, { who: 'other' }, c.op), c.st), true)
  assert.equal(c.st.result.state, BattleResultState.Win, 'ivk 是 client ⇒ getRhsUnitById(-1)=master ⇒ Win')
})

test('escape: state==null ⇒ false; 否则判的是 atkUnit (与 invokeUnit/who 无关), whosTurn==0 ⇒ 解引用 null', () => {
  assert.equal(escape(OP(EffectAbility.Escape, {}, null), null), false, ':57')

  const a = BW()
  assert.equal(escape(OP(EffectAbility.Escape, {}, a.my), a.st), true)
  assert.equal(a.st.phase, EffectTiming.OnBattleEnd)
  assert.equal(a.st.result.state, BattleResultState.MyEscape, 'whosTurn=1 ⇒ atkUnit=master ⇒ MyEscape')
  assert.deepEqual([a.my.isDone, a.op.isDone], [true, true])
  assert.equal(a.st.actionCursor, 4)

  const b = BW({ whosTurn: -1 })
  assert.equal(escape(OP(EffectAbility.Escape, {}, b.my), b.st), true)
  assert.equal(b.st.result.state, BattleResultState.OpEscape, ':60 按 atkUnit 判, 发起方是哪一侧都一样')

  const c = BW({ whosTurn: 0 })
  assert.throws(() => escape(OP(EffectAbility.Escape, {}, c.my), c.st), TypeError, ':60 atkUnit=null ⇒ 直接解引用')
})

test('set_weather: 字面 int.TryParse 早于解引用 state; 两侧任一屏蔽 weather 型即拒', () => {
  assert.equal(setWeather(OP(EffectAbility.SetWeather, { weather: 'abc' }, null), null), false,
    ':1973-1974 不认表达式/标识符 ⇒ 干净 false (连 state 都没碰)')
  assert.throws(() => setWeather(OP(EffectAbility.SetWeather, { weather: '3' }, null), null), TypeError,
    ':1969 本支**不判** state==null (与 win/escape 相反)')

  const a = BW()
  assert.equal(setWeather(OP(EffectAbility.SetWeather, { weather: '3' }, a.my), a.st), true)
  assert.equal(a.st.weather, 3)

  const b = BW()
  assert.equal(setWeather(OP(EffectAbility.SetWeather, { weather: '-1' }, b.my), b.st), true)
  assert.equal(b.st.weather, -1, '天气是 int, 不钳不截')

  const c = BW()
  assert.equal(setWeather(OP(EffectAbility.SetWeather, {}, c.my), c.st), true)
  assert.equal(c.st.weather, 0, "键缺省 '0' ⇒ 也能落 0")

  const d = BW({ weather: 5 })
  assert.equal(setWeather(OP(EffectAbility.SetWeather, { weather: '2.0' }, d.my), d.st), false,
    'int.TryParse 不认小数点 (与 ToIntList 那条 float 路径是两回事)')
  assert.equal(d.st.weather, 5, '失败即原值保留')

  for (const who of ['me', 'other'] as const) {
    const e = BW({ weather: 5, blockWeather: who })
    assert.equal(setWeather(OP(EffectAbility.SetWeather, { weather: '3' }, e.my), e.st), false,
      `:1981 ${who} 侧挂了 weather 型印记 ⇒ || 命中 ⇒ false`)
    assert.equal(e.st.weather, 5)
  }
})

test('block_buff: 四个动作按 op 选; Power 族三型先移出 type 表再展开进 id 表; sp 只有 +/- 有函数', () => {
  const bb = (options: Record<string, string>, world = BW()) =>
    { blockOrCopyBuff(OP(EffectAbility.BlockBuff, options, world.my), world.st); return { bc: world.my.pet!.buffController, world } }

  // 构造期 SetElement 已经落了一个元素块 id, 所以 id 表只比**追加的那一段**。
  const added = (bc: PetBuffController, start: number) => bc.blockBuffIds.slice(start)

  const a = bb({ op: '+', id_list: '1/2/3' })
  assert.deepEqual(a.bc.blockBuffIds, [0, 1, 2, 3], ':323 AddRange ⇒ 元素块 id(0) 后面接 1/2/3')
  assert.deepEqual(a.bc.blockBuffTypes, [BuffType.None], ":687 type_list 缺省 'none' ⇒ 查不到 ⇒ None(0) 照样进表")

  assert.deepEqual(bb({ op: '+', type_list: 'weather' }).bc.blockBuffTypes, [BuffType.Weather])
  assert.deepEqual(bb({ op: '+', id_list: 'none', type_list: 'powerup' }).bc.blockBuffTypes, [],
    ':722 Power(-2) 被**移出** type 表')
  assert.deepEqual(added(bb({ op: '+', id_list: 'none', type_list: 'powerup' }).bc, 1),
    [...[1, 3, 5, 7, 9, -9], ...[2, 4, 6, 8, 10, -10]], '展开成 powerup ∪ powerdown 的全集')
  assert.deepEqual(added(bb({ op: '+', id_list: 'none', type_list: 'powerup.pos' }).bc, 1), [1, 3, 5, 7, 9, -9],
    "'powerup.pos' ⇒ Powerup(-3) ⇒ 只展开 powerup ids")
  assert.deepEqual(added(bb({ op: '+', id_list: 'none', type_list: 'powerup.neg' }).bc, 1), [2, 4, 6, 8, 10, -10],
    "⚠ Powerdown 的原始串是 'powerup.neg' 而不是 'powerdown.neg'")
  assert.deepEqual(bb({ op: '+', type_list: 'powerup/weather' }).bc.blockBuffTypes, [BuffType.Weather],
    '只摘掉命中的 Power, weather 留在 type 表里')
  assert.deepEqual(bb({ op: '+', type_list: 'powerup/powerup' }).bc.blockBuffTypes, [BuffType.Power],
    ':722 的 List.Remove 只摘**首个**匹配 ⇒ 另一个 powerup 仍留在表里')

  const z = bb({ op: 'zzz', id_list: '1', type_list: 'weather', sp_list: 'op' })
  assert.deepEqual(z.bc.blockBuffIds, [0], '未认的 op ⇒ 三个函数都是空动作 (但仍 return true)')
  assert.deepEqual(z.bc.blockBuffTypes, [])
  assert.equal(z.bc.blockBuffSps.size, 0)

  const st = bb({ op: '*' })
  assert.deepEqual(st.bc.copyBuffIds, [0], ':369 CopyBuff')
  assert.deepEqual(st.bc.copyBuffTypes, [BuffType.None], '缺省 type_list 同样进 * 的 type 表')
  assert.equal(st.bc.blockBuffSps.size, 0, "⚠ ':687 sp_list 缺省 'none' 但 op='*' ⇒ spFunc 是空动作")
  assert.deepEqual(bb({ op: '*', sp_list: 'op' }).bc.blockBuffSps.size, 0,
    "⚠ :714-720 只给 '+'/'-' 配了 spFunc ⇒ 复制/取消复制**不碰** sps")

  assert.deepEqual([...bb({ op: '+', sp_list: 'op' }).bc.blockBuffSps], [['op', 1]], 'BlockBuffWithString 走 default 支')
  assert.deepEqual([...bb({ op: '+', sp_list: 'zzz' }).bc.blockBuffSps], [['zzz', 1]],
    ':339 switch 只有 default ⇒ 任何非空串都 +1')

  // 摘除面: 逐项 `List.Remove` (首匹配, 摘不到不报错)。
  const seed = (over: { blockIds?: number[]; blockTypes?: BuffType[]; sps?: string[]; copyIds?: number[]; copyTypes?: BuffType[] }) => {
    const w = BW()
    const bc = w.my.pet!.buffController
    if (over.blockIds) bc.blockBuff(over.blockIds)
    if (over.blockTypes) bc.blockBuffWithType(over.blockTypes)
    for (const s of over.sps ?? []) bc.blockBuffWithString(s)
    if (over.copyIds) bc.copyBuff(over.copyIds)
    if (over.copyTypes) bc.copyBuffWithType(over.copyTypes)
    return w
  }
  assert.deepEqual(bb({ op: '-', id_list: '1' }, seed({ blockIds: [1, 1, 2] })).bc.blockBuffIds, [0, 1, 2],
    '摘一个 1 (首匹配)')
  assert.deepEqual(bb({ op: '-', id_list: '1/1' }, seed({ blockIds: [1, 1, 2] })).bc.blockBuffIds, [0, 2],
    '逐项摘 ⇒ 两个 1 都摘掉 (不是集合差也无所谓)')
  assert.deepEqual(bb({ op: '-', id_list: '9' }, seed({ blockIds: [1, 2] })).bc.blockBuffIds, [0, 1, 2],
    '摘不到 ⇒ 静默不变')
  assert.deepEqual(bb({ op: '-', type_list: 'weather' }, seed({ blockTypes: [BuffType.Weather, BuffType.Feature] })).bc.blockBuffTypes,
    [BuffType.Feature])
  assert.deepEqual([...bb({ op: '-', sp_list: 'op' }, seed({ sps: ['op'] })).bc.blockBuffSps], [['op', 0]], ':358 ⇒ 减 1')
  assert.deepEqual([...bb({ op: '-', sp_list: 'zzz' }, seed({ sps: ['op'] })).bc.blockBuffSps], [['op', 1]],
    ':356-359 只有 case "op"、没有 default ⇒ 别的串什么都不做')
  assert.deepEqual(bb({ op: '/', id_list: '5' }, seed({ copyIds: [5, 5, 6] })).bc.copyBuffIds, [5, 6])
  assert.deepEqual(bb({ op: '/', id_list: '5/5' }, seed({ copyIds: [5, 5, 6] })).bc.copyBuffIds, [6])
  assert.deepEqual(bb({ op: '/', type_list: 'weather' }, seed({ copyTypes: [BuffType.Weather] })).bc.copyBuffTypes, [])

  // who 选宿主: who='me' 落 master, 其余落 client (:689-692)。
  const who = bb({ op: '+', who: 'other', id_list: '4' })
  assert.deepEqual(who.bc.blockBuffIds, [0], 'master 的表没被动')
  assert.deepEqual(who.world.op.pet!.buffController.blockBuffIds, [0, 4], 'client 的宠挨了')
})

