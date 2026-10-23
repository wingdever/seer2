// 第五段·步骤0 的单测 —— 对拍能吃到的形状已经全部进了 golden, 这里只锁三件 golden 锁不住的东西:
//   · **两边的抛** (difftest 只比"抛不抛", 不比抛在哪) ⇒ 围栏的进入条件必须在这里断言清楚;
//   · **native 不可比的路径** (random 吃 UnityEngine.Random ⇒ 生成阶段就被挡, 向量里根本没有它);
//   · **上游自身的怪癖** (last. 换帧只影响 me./op., 末端兜底仍打在当前帧)。
// 断言用的是**形状**, 不是"我算出来等于几"; 值本身由 tools/difftest.mjs 的 effectident 一族负责。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { Buff } from '../buff/buff.ts'
import { tryParseFloat } from '../strutil.ts'
import { PetBuffController } from '../pet/buff-controller.ts'
import { StatusController } from '../pet/status-controller.ts'
import { Status } from '../pet/status.ts'
import { Element, getElementRelationSub } from '../pet/element.ts'
import {
  classifyIdSource, getBattleIdentifier, getBattlePetIdentifier, getBuffIdentifier,
  getIdentifierInEffectContext, getPetIdentifierBase, setIdentifierBattle, setEffectIdentHost,
  tryGetBattlePetIdentifier,
} from './identifier-effect.ts'
import type { IdentifierHost } from './identifier.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView, SkillRecord } from '../battle/views.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
// Buff 的构造器每次现查表 (Buff.cs:26-30), 所以测试也得先把真表装上 —— 与 buff.test.ts 同法 (先效果后印记)。
setEffectTable(EFFECTS)
class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo([String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn), b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}
setBuffTables(new LoadedBuffInfos(), EFFECTS, (id) => tryParseFloat(id!) ?? 0)

const FLOAT_MIN_VALUE = -3.4028234663852886e38

const thrower = (): never => { throw new Error('NOT_PORTED: 测试里的 native 面') }
const deadHost: IdentifierHost = {
  rng: { next01: thrower, nextInt: thrower, nextFloat: thrower, pick: thrower, seed: thrower },
  getPlayerRandom: thrower, setPlayerRandom: thrower, getDate: thrower, getPlayerData: thrower,
}

// 一个**最小**的 BattlePet 视图: 只带标识符链会读的三件 (statusController / buffController / skillController)。
const fakePet = (over: Record<string, unknown> = {}): BattlePetView => ({
  statusController: new StatusController(Status.of6(10, 10, 10, 10, 10, 100), 70, 30),
  buffController: new PetBuffController(Element.普通, Element.普通, null),
  skillController: { cursor: 0, headerSkills: null, loopSkills: null, normalSkills: null, superSkill: null, allSkills: [] },
  stayTurn: 2, chain: 1, isDead: false, isMovable: true, isToken: false,
  battleElement: Element.普通, subBattleElement: Element.普通,
  ...over,
} as unknown as BattlePetView)

const fakeUnit = (pet: BattlePetView, over: Record<string, unknown> = {}): Unit => ({
  id: 1, pet, random: 42,
  petSystem: { pet, petBag: [pet], cursor: 0, tryGetPetSystemIdentifier: () => ({ ok: false, num: 0 }) },
  skillSystem: { tryGetSkillSystemIdentifier: () => ({ ok: false, num: 0 }), getSkillByKey: () => null },
  ...over,
} as unknown as Unit)

const noEffect = { source: null, sourcePet: null } as never

test('classifyIdSource 认得四种 source, 且**不会**把 Unit 认成 BattlePet', () => {
  assert.equal(classifyIdSource(null), 'other')
  assert.equal(classifyIdSource(undefined), 'other')
  assert.equal(classifyIdSource(new Buff(1001, 2, 5)), 'buff')
  assert.equal(classifyIdSource(fakePet()), 'battlePet')
  // Unit 身上没有三个 controller ⇒ 落 `_` 支 (上游的 switch 同理)。这条是回归锁:
  // 哪天 Unit 上加了个 buffController 字段, 这里会先红, 而不是让对拍去猜。
  assert.equal(classifyIdSource({ id: 1, pet: fakePet(), petSystem: {} }), 'other')
  assert.equal(classifyIdSource({ options: new Map(), effects: [] }), 'skill')
})

test('Pet 基类围栏按**上游守卫**决定进不进臂: 括号里不是 int 就不算进臂', () => {
  // 合取守卫不成立 ⇒ 上游继续往下试到 `_ => float.MinValue`, 移植体必须给 MinValue 而不是抛。
  assert.equal(getPetIdentifierBase('normalSkill[me.skill.id].power'), FLOAT_MIN_VALUE)
  assert.equal(getPetIdentifierBase('skill[note]int'), FLOAT_MIN_VALUE)
  assert.equal(getPetIdentifierBase('buffturn'), FLOAT_MIN_VALUE)      // buff 支: 括号不成立 ⇒ 上游**显式** return MinValue
  // 守卫成立 ⇒ 真会读组件/表, 显式抛。
  assert.throws(() => getPetIdentifierBase('normalSkill[3].id'), /NOT_PORTED/)
  assert.throws(() => getPetIdentifierBase('buff[1]'), /NOT_PORTED/)
  assert.throws(() => getPetIdentifierBase('status.maxHp'), /NOT_PORTED/)
  assert.throws(() => getPetIdentifierBase('id'), /NOT_PORTED/)          // 平键 id 读的是 info.ui.defaultId (宠表)
  // 谁都不认的键 ⇒ MinValue (调用方据此回落 GetBattleIdentifier)。
  assert.equal(getPetIdentifierBase('totallyUnknown'), FLOAT_MIN_VALUE)
})

test('target. 前缀削不削, 由 otherSource 与 useOtherSourceOnlyWhenTarget 的**短路**决定', () => {
  setEffectIdentHost(deadHost)
  setIdentifierBattle(null)
  const pet = fakePet()
  const lhs = fakeUnit(pet)
  // otherSource 非 null 且限定 target ⇒ 前缀被削掉, 串按 `status.maxHp` 进 BattlePet/Status 链。
  assert.equal(getIdentifierInEffectContext('target.status.maxHp', noEffect, lhs, lhs, pet, true), 100)
  // useOther=false: `&&` 短路掉了 TrimStart ⇒ 串**原样**进链, 谁都不认 ⇒ 兜到 GetNumIdentifier 的 0。
  assert.equal(getIdentifierInEffectContext('target.status.maxHp', noEffect, lhs, lhs, pet, false), 0)
  // otherSource 为 null 时即便 useOther=true 也不换源 —— 前缀不削, 走 effect.source (这里没有)。
  assert.equal(getIdentifierInEffectContext('target.status.maxHp', { source: pet } as never, lhs, lhs, null, true),
    getIdentifierInEffectContext('target.status.maxHp', { source: pet } as never, lhs, lhs, null, false))
})

test('elementRelation 的括号组数不足两支时**穿透**, 不 return', () => {
  setEffectIdentHost(deadHost)
  setIdentifierBattle(null)
  const pet = fakePet()
  const lhs = fakeUnit(pet)
  const at = (id: string): number => getIdentifierInEffectContext(id, noEffect, lhs, lhs, null, true)
  // 两支 ⇒ 真查相克表, 与直接调 getElementRelationSub 同值。
  assert.equal(at('elementRelation[atk:2][def:3]'), getElementRelationSub(2, 3, 0))
  assert.equal(at('elementRelation[atk:2][def:3][def.sub:1]'), getElementRelationSub(2, 3, 1))
  // 一支 / 空 ⇒ 穿透到 idSource 分派, 这里最终落到 GetNumIdentifier ⇒ 未知串是 0。
  assert.equal(at('elementRelation[atk:2]'), 0)
  assert.equal(at('elementRelation'), 0)
})

test('state.last. 换帧只作用于 me./op. 两支, 末端兜底仍读**当前帧**', () => {
  setEffectIdentHost(deadHost)
  const frame = (turn: number): unknown => ({
    getStateIdentifier: (id: string) => (id === 'turn' ? turn : FLOAT_MIN_VALUE),
    getUnitById: () => null,
    lastTurnState: null,
  })
  const last = frame(1)
  const cur = { ...frame(4), lastTurnState: last }
  setIdentifierBattle(() => ({ currentState: cur as unknown as BattleState }))
  const lhs = fakeUnit(fakePet())
  // 上游: last. 之后是 `battle.GetBattleIdentifier(trimId)` —— 读的是 currentState, 不是换掉的局部 state。
  assert.equal(getBattleIdentifier('state.last.turn', noEffect, lhs, lhs), 4)
  assert.equal(getBattleIdentifier('state.turn', noEffect, lhs, lhs), 4)
  // lastTurnState 为 null ⇒ 上游 `return 0` (不是 MinValue)。
  setIdentifierBattle(() => ({ currentState: frame(4) as unknown as BattleState }))
  assert.equal(getBattleIdentifier('state.last.turn', noEffect, lhs, lhs), 0)
  setIdentifierBattle(null)
})

test('battle 接缝没注入就抛 —— 「没接」不能伪装成 0', () => {
  setEffectIdentHost(deadHost)
  setIdentifierBattle(null)
  const lhs = fakeUnit(fakePet())
  assert.throws(() => getBattleIdentifier('state.turn', noEffect, lhs, lhs), /NOT_PORTED/)
})

test('random 一族: 裸串读 unit.random, 带括号的才吃 native Random (所以向量生成阶段必须挡掉)', () => {
  setEffectIdentHost(deadHost)
  setIdentifierBattle(null)
  const lhs = fakeUnit(fakePet())
  // Identifier.cs:286-293 —— 裸 `random` 在这一条链上读的是 **unit.random** (存档里那个数), 不是 native。
  assert.equal(getIdentifierInEffectContext('random', noEffect, lhs, lhs, null, true), 42)
  // :199-200 的区间支与 GetNumIdentifier 的 [old]/[new] 都最终要 host.rng ⇒ 默认显式抛。
  assert.throws(() => getIdentifierInEffectContext('random[2~3]', noEffect, lhs, lhs, null, true), /NOT_PORTED|native/)
  assert.throws(() => getIdentifierInEffectContext('random[old]', noEffect, lhs, lhs, null, true), /NOT_PORTED|native/)
  assert.throws(() => getIdentifierInEffectContext('random[new]', noEffect, lhs, lhs, null, true), /NOT_PORTED|native/)
})

test('GetBuffIdentifier 的三条括号语义互不相同', () => {
  const buffs = [new Buff(1001, 2, 5), new Buff(1008, 4, 7)]
  const ctrl = new PetBuffController(Element.普通, Element.普通, buffs)
  assert.equal(getBuffIdentifier('.count', ctrl), buffs.length)
  // 表里真有这个 id ⇒ 用 GetBuffInfo 造的 testBuff 判免疫; 没有 ⇒ testBuff=null ⇒ IsBuffBlocked(null)=false。
  assert.equal(getBuffIdentifier('[1001].own', ctrl), 1)
  assert.equal(getBuffIdentifier('[9999].block', ctrl), 0)
  assert.equal(getBuffIdentifier('[9999].count', ctrl), 0)
  // 括号里不是 int ⇒ 当类型名 (查不到 ⇒ BuffType.None), 而不是抛。
  assert.equal(getBuffIdentifier('[totallyUnknown].count', ctrl), 0)
  // `(...)` 过滤器支与 `[..]` 支是两套: 前者取 First 再读键。
  assert.equal(getBuffIdentifier('(turn:2).value', ctrl), 5)
  assert.equal(getBuffIdentifier('(turnNOT2).turn', ctrl), 4)
})

test('BattlePet 的 skill 臂把 [id] 改写成 (id:N).key, 未命中给 MinValue 哨兵', () => {
  const skill = (n: number, power: number): SkillRecord => ({ id: n, power, type: 1, anger: 0 } as unknown as SkillRecord)
  const pet = fakePet({
    skillController: {
      cursor: 0, headerSkills: null, loopSkills: null,
      normalSkills: [skill(100, 40), null, skill(101, 55)],
      superSkill: null,
      allSkills: [skill(100, 40), null, skill(101, 55)],
    },
  })
  assert.equal(getBattlePetIdentifier(pet, 'skill.count'), 2)   // Where(x => x != null) 先把洞滤掉
  assert.equal(getBattlePetIdentifier(pet, 'skill[101].power'), 55)
  assert.equal(getBattlePetIdentifier(pet, 'skill[999].count'), 0)
  // 未命中的键在**这一层**是 MinValue (哨兵), 到调用方才回落成 0 —— 两层要分开锁:
  // 整链的那条是 golden 里的 `skill[999].power` (oracle 给 0)。
  assert.equal(getBattlePetIdentifier(pet, 'skill[999].power'), FLOAT_MIN_VALUE)
  // `skill.sum(power)` / `skill(100).count` 这一类**聚合式过滤器**上游也抛, 但抛点是
  // Operator.SplitCondition 里那次 `Substring(…, IndexOf(op) = -1)` ⇒ ArgumentOutOfRangeException。
  // 移植体在同一个位置抛 (splitCondition 找不到算子) —— difftest 只比"抛不抛", 所以两边同形即合格;
  // 这条断言锁的是**抛出点没挪到过滤器之后**。
  assert.throws(() => getBattlePetIdentifier(pet, 'skill.sum(power)'), /SplitCondition/)
  assert.throws(() => getBattlePetIdentifier(pet, 'skill(100).count'), /SplitCondition/)
  // 未知键 ⇒ MinValue ⇒ ok=false ⇒ 调用方继续走 GetBattleIdentifier。
  assert.equal(tryGetBattlePetIdentifier(pet, 'totallyUnknown').ok, false)
})

test('normalSkill 读的是 loopSkills 优先的那只袋子, 越界给 0 而 position 给 -1', () => {
  const pet = fakePet({
    skillController: {
      cursor: 0, headerSkills: null,
      loopSkills: [{ id: 7, power: 1 } as unknown as SkillRecord],
      normalSkills: [{ id: 9, power: 2 } as unknown as SkillRecord],
      superSkill: null, allSkills: [],
    },
  })
  // IsNullOrEmpty(loopSkills) 为假 ⇒ 用 loopSkills: 下标 0 是 id 7, 下标 3 越界给 0。
  assert.equal(getBattlePetIdentifier(pet, 'normalSkill[0].id'), 7)
  assert.equal(getBattlePetIdentifier(pet, 'normalSkill[3].id'), 0)
  // position 是 FindIndex(按 id 找), 不是"取第 N 个的位置"。
  assert.equal(getBattlePetIdentifier(pet, 'normalSkill[7].position'), 0)
  assert.equal(getBattlePetIdentifier(pet, 'normalSkill[9].position'), -1)
  // 括号里不是 int ⇒ 整支不成立 (上游的 && 合取), 落到基类围栏的守卫失败 ⇒ MinValue 由调用方兜底。
  assert.equal(getBattlePetIdentifier(pet, 'normalSkill[me.skill.id].power'), FLOAT_MIN_VALUE)
})

test('element.group 用默认方括号; 没有括号时上游的 TrimParenthesesLoop 给 null ⇒ 抛', () => {
  const pet = fakePet({ battleElement: Element.水, buffController: new PetBuffController(Element.水, Element.冰, null) })
  assert.equal(tryGetBattlePetIdentifier(pet, 'element.group[2]').num, 1)
  assert.equal(tryGetBattlePetIdentifier(pet, 'element.group[3]').num, 0)
  assert.equal(tryGetBattlePetIdentifier(pet, 'subElement.group[9]').num, 1)
  assert.throws(() => tryGetBattlePetIdentifier(pet, 'element.group'), /NullReferenceException/)
})
