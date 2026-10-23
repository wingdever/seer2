// 第五段·步骤1 的单测 —— 对拍的 target 一族比的是**整串签名** (n=…|[unitId/petId/hp/maxHp]),
// 它锁得住"选了谁", 锁不住下面这四类"只有形状可讲"的东西:
//   · **native 不可比**的两条随机支 (UnityEngine.Random ⇒ 向量在生成阶段就被挡, golden 里根本没有它);
//   · **上游的死循环** (target_num 缺省 + random) —— 只能拿一个"数到第 N 次就炸"的假骰子断它不终止;
//   · **List.Remove 只删第一个引用相等的项**这种与 JS `filter` 直觉相反的行为 (签名的 bag 里没有重复宠);
//   · **null 槽**: index 支绕过筛与死判、直接把洞交出去 (真表数据里没有洞的袋型)。
// 值本身由 tools/difftest.mjs 的 target 一族负责, 这里一条值都不写。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { listGet, listPickRandom, listRandom } from '../collections.ts'
import { Effect } from '../effect/effect.ts'
import { EffectAbility, EffectCondition, EffectTarget, EffectTiming } from '../effect/effect-database.ts'
import { createRng } from '../rng.ts'
import type { Rng } from '../rng.ts'
import { setEffectIdentHost } from '../parser/identifier-effect.ts'
import type { IdentifierHost } from '../parser/identifier.ts'
import { getBattlePetTargetList, getBattlePetTargetListFromDefault, getBattlePetTargetListFromPetBag } from './target.ts'
import type { BattleState, Unit } from './state.ts'
import type { BattlePetView } from './views.ts'

const thrower = (): never => { throw new Error('NOT_PORTED: 测试里的 native 面') }
const deadHost: IdentifierHost = {
  rng: { next01: thrower, nextInt: thrower, nextFloat: thrower, pick: thrower, seed: thrower },
  getPlayerRandom: thrower, setPlayerRandom: thrower, getDate: thrower, getPlayerData: thrower,
}
setEffectIdentHost(deadHost)

const pet = (id: number, over: Record<string, unknown> = {}): BattlePetView =>
  ({ id, isDead: false, ...over } as unknown as BattlePetView)

// 一个只带 target 解析会读的三件 (id / pet / petSystem.petBag / randomSource / token) 的 Unit。
const unit = (petBag: (BattlePetView | null)[], over: Record<string, unknown> = {}): Unit => {
  const current = petBag[0] ?? null
  return {
    id: 1, pet: current, token: null, randomSource: createRng(7),
    petSystem: { petBag, pet: current, cursor: 0 },
    ...over,
  } as unknown as Unit
}

const eff = (target: EffectTarget, options: Record<string, string> = {}, invoke: Unit | null = null): Effect => {
  const e = new Effect(EffectTiming.None, -1, target, EffectCondition.None, null, EffectAbility.AddBuff, new Map(Object.entries(options)))
  // invokeUnit 在 C# 是 Effect 的第 5 参 (构造里给 null), 只有 CheckAndApply 的第 5 会写它 ——
  // 而 target 解析**第一件事**就是读 `((Unit)effect.invokeUnit).id`, 所以测试必须自己挂上 (挂 null 就是上游的 NRE)。
  e.invokeUnit = invoke as never
  return e
}

// fromDefault 的队列在 golden 里永远非空 (天气印记恒带一条效果), 所以这里给一个**空队列**的桩,
// 只为锁 Parser.cs:170 那条 `lastEffect == null ⇒ new List{defaultPet}` 的代码形状, 不是"上游实测值"。
const emptyState = { getEffectHandler: () => null, getEffectsByTiming: () => [] } as unknown as BattleState

const ids = (list: (BattlePetView | null)[]): (number | null)[] => list.map((x) => (x === null ? null : x.id))

// ── HelperCollections.cs:108-138 的四条形状 ────────────────────────────

test('listPickRandom 的上界**取得到** ⇒ 空表与满标都落到 Get 的默认 null', () => {
  // Range(0, Count) 是闭区间: Count 本身会被取到, 于是 list[Count] 越界 ⇒ Get 的默认值 null。
  const a = pet(1), b = pet(2)
  const alwaysMax: Rng = { ...createRng(1), nextInt: (_min, max) => max }
  assert.equal(listPickRandom([a, b], alwaysMax), null)
  assert.equal(listPickRandom([], alwaysMax), null)
  const alwaysMin: Rng = { ...createRng(1), nextInt: (min) => min }
  assert.equal(listPickRandom([a, b], alwaysMin), a)
  assert.equal(listPickRandom([], alwaysMin), null)
  // 带权重的兜底: 权重全 0 ⇒ 循环里一次都不命中 ⇒ 给**最后一项** (HelperCollections.cs:120 的 return),
  // 而空表那条 return 的是 default(T) = null。
  const alwaysBig: Rng = { ...createRng(1), nextInt: () => 9 }
  assert.equal(listPickRandom([a, b], alwaysBig, [0, 0]), b)
  assert.equal(listPickRandom([], alwaysBig, []), null)
})

test('listRandom: !repeat 且 count > 长度 ⇒ **整表拷贝** (不是补齐, 也不是抛)', () => {
  const bag = [pet(1), pet(2)]
  const out = listRandom(bag, 5, false, createRng(3))
  assert.deepEqual(out, bag)
  assert.notEqual(out, bag, '上游是 new List(source) —— 返回的必须是另一份表')
})

test('listRandom: random 而 target_num 缺省 (-1) ⇒ 上游**死循环**, 移植体同样不终止', () => {
  // 不能真跑 (会挂住测试进程), 所以换一个"被问到第 200 次就抛"的骰子: 循环若终止, 抛点不会到。
  let calls = 0
  const looping: Rng = {
    ...createRng(1),
    nextInt: (min, max) => { if (++calls > 200) throw new Error('LOOP: 仍在抽, 说明 count 永远追不上 -1'); return min + (calls % Math.max(1, max - min + 1)) },
  }
  assert.throws(() => listRandom([pet(1), pet(2)], -1, false, looping), /LOOP/)
  // repeat=true 时同一个 -1 也永不成立 ⇒ 同样不终止; 而 count=0 是**立刻**结束 (result.Count 一开始就等于 0)。
  assert.deepEqual(listRandom([pet(1)], 0, true, looping), [])
})

test('listRandom: !repeat 不放回, 但闭区间抽出的**越界 null 也占一个名额**', () => {
  const a = pet(1), b = pet(2), c = pet(3)
  // 固定骰子序列: 每次抽一个下标 (listPickRandom 每抽一次只问一次 nextInt)。
  const seq = (vals: number[]): Rng => { let i = 0; return { ...createRng(1), nextInt: () => vals[i++] ?? 0 } }
  // 0→a, 3→越界(=Count)⇒null, 1→b。null 不是"抽过的宠", 于是它进了表并占掉一个名额。
  assert.deepEqual(listRandom([a, b, c], 3, false, seq([0, 3, 1])), [a, null, b])
  // 同一个宠抽第二次会被 includes 挡掉 ⇒ 不放回; null 抽第二次同样挡掉 (它已经是"抽过的值")。
  assert.deepEqual(listRandom([a, b, c], 2, false, seq([0, 0, 1])), [a, b])
  assert.deepEqual(listRandom([a, b, c], 2, false, seq([3, 3, 0])), [null, a])
})

// ── Parser.cs:153-200 的分派与四条陷阱 ─────────────────────────────────

test('陷阱 1: 除 pet_bag / token 之外的一切 target 都静默走 fromDefault', () => {
  const p = pet(10001)
  const lhs = unit([p, pet(10002)])
  // 队列空 ⇒ fromDefault 交出 [defaultPet] (Parser.cs:170), 那条 target_type: 'other' 根本不参与。
  for (const t of [EffectTarget.None, EffectTarget.CurrentPet, EffectTarget.CurrentState, EffectTarget.CurrentSkill,
    EffectTarget.CurrentBuff, EffectTarget.CurrentStatus, EffectTarget.LastSkill, EffectTarget.Poker]) {
    assert.deepEqual(ids(getBattlePetTargetList(emptyState, eff(t, { target_type: 'other' }, lhs), lhs, lhs)), [10001],
      `target=${t} 不该走进 pet_bag 的筛选`)
  }
  // 反过来: pet_bag 走的必须是**筛过**的那条路 (袋里两只都活, 但 other 把 defaultPet 摘掉)。
  assert.deepEqual(ids(getBattlePetTargetList(emptyState, eff(EffectTarget.CurrentPetBag, { target_type: 'other' }, lhs), lhs, lhs)), [10002])
})

test('invokeUnit 为 null 时上游第一件事就 NRE (移植体同样抛, 不静默回落)', () => {
  const lhs = unit([pet(10001)])
  assert.throws(() => getBattlePetTargetList(emptyState, eff(EffectTarget.CurrentPetBag), lhs, lhs), TypeError)
})

test('陷阱 2: defaultPet 可以是 null, fromDefault 照样给**长度为 1 的含 null 表**', () => {
  const lhs = unit([null, pet(10002)])
  const out = getBattlePetTargetListFromDefault(emptyState, eff(EffectTarget.CurrentPet), lhs, lhs, lhs.pet)
  assert.equal(out.length, 1)
  assert.equal(out[0], null)
})

test('token 支: 有替身给单元素表, 没有给**空表** (而不是含 null 的表)', () => {
  const t = pet(20001, { isToken: true })
  const lhs = unit([pet(10001)], { token: t })
  assert.deepEqual(ids(getBattlePetTargetList(emptyState, eff(EffectTarget.CurrentToken, {}, lhs), lhs, lhs)), [20001])
  const noToken = unit([pet(10001)], { token: null })
  assert.deepEqual(getBattlePetTargetList(emptyState, eff(EffectTarget.CurrentToken, {}, noToken), noToken, noToken), [])
})

test('defaultPet 三条来源: 同侧有 sourcePet 用它, 同侧没有回落 lhs.pet, 异侧只看 lhs.pet', () => {
  const p = pet(10001), sp = pet(30001), other = pet(99999)
  const lhs = unit([p], { id: 1 })
  const rhs = unit([other], { id: 2 })
  const e = eff(EffectTarget.CurrentPet, {}, lhs)
  e.sourcePet = sp as never
  assert.equal(getBattlePetTargetList(emptyState, e, lhs, rhs)[0], sp)
  e.sourcePet = null
  assert.equal(getBattlePetTargetList(emptyState, e, lhs, rhs)[0], p)
  e.sourcePet = sp as never
  e.invokeUnit = rhs as never
  assert.equal(getBattlePetTargetList(emptyState, e, lhs, rhs)[0], p, 'invokeUnit 异侧 ⇒ sourcePet 被完全忽略')
})

test('other 只删**第一个**引用相等的项 (List.Remove ≠ filter)', () => {
  const a = pet(10001), b = pet(10002)
  const lhs = unit([a, a, b])
  const out = getBattlePetTargetListFromPetBag(eff(EffectTarget.CurrentPetBag, { target_type: 'other' }), lhs, lhs, a)
  assert.deepEqual(ids(out), [10001, 10002], '袋里两只同引用 ⇒ 删一只, 不是一网打尽')
})

test('陷阱 3: index 支绕过 target_filter 与 dead 过滤, 上界开区间, 还能把洞交出去', () => {
  const dead = pet(10001, { isDead: true })
  const hole = null
  const live = pet(10003)
  const lhs = unit([dead, hole, live])
  const idx = (targetIndex: string) => getBattlePetTargetListFromPetBag(
    eff(EffectTarget.CurrentPetBag, { target_type: 'index', target_index: targetIndex }), lhs, lhs, live)
  assert.deepEqual(ids(idx('0')), [10001], '死的照样给')
  assert.deepEqual(idx('1'), [null], '洞照样给 (长度为 1 的含 null 表)')
  // 上界**不含** ⇒ index=3 落空 ⇒ 往下走到 target_num (-1) ⇒ 返回筛过死活的表 (只剩 10003)。
  assert.deepEqual(ids(idx('3')), [10003])
  assert.deepEqual(ids(idx('-1')), [10003], '负数同样落空, 不越界抛')
  // index_other: 先删 defaultPet 再取下标 ⇒ 下标读的是**原袋**, 不是删过之后的表。
  const out = getBattlePetTargetListFromPetBag(
    eff(EffectTarget.CurrentPetBag, { target_type: 'index_other', target_index: '2' }), lhs, lhs, live)
  assert.deepEqual(ids(out), [10003])
})

test('dead / target_num 的截断口径: 缺省 -1 不截, 0 给空表, 超长给全部', () => {
  const a = pet(10001), b = pet(10002, { isDead: true }), c = pet(10003)
  const lhs = unit([a, b, c, null])
  const bag = (opts: Record<string, string>) => getBattlePetTargetListFromPetBag(eff(EffectTarget.CurrentPetBag, opts), lhs, lhs, a)
  assert.deepEqual(ids(bag({})), [10001, 10003], '默认只留活的, 且 -1 不截')
  assert.deepEqual(ids(bag({ target_type: 'dead' })), [10002])
  assert.deepEqual(ids(bag({ target_num: '0' })), [])
  assert.deepEqual(ids(bag({ target_num: '1' })), [10001])
  assert.deepEqual(ids(bag({ target_num: '99' })), [10001, 10003], 'Take(99) 对短表是**静默**给全部')
  assert.deepEqual(ids(bag({ target_type: 'dead', target_num: '99' })), [10002])
  // target_num 写成标识符串时按表达式算 (真表就是这么配的): 非数字 ⇒ toInt 给 0 ⇒ 空表。
  assert.deepEqual(ids(bag({ target_num: 'nonexistent_key' })), [])
})

test('从空袋出发的三种兜底: 别的、死的、随机都只给空', () => {
  const lhs = unit([])
  const bag = (opts: Record<string, string>) => getBattlePetTargetListFromPetBag(eff(EffectTarget.CurrentPetBag, opts), lhs, lhs, null)
  assert.deepEqual(bag({}), [])
  assert.deepEqual(bag({ target_type: 'other' }), [])
  assert.deepEqual(bag({ target_type: 'dead' }), [])
  assert.deepEqual(bag({ target_type: 'index', target_index: '0' }), [])
  assert.deepEqual(bag({ target_type: 'random', target_num: '2' }), [])
})

test('listGet 的上界开区间与 atIndex 的越界抛是两回事 (别混用)', () => {
  const bag = [pet(1), pet(2)]
  assert.equal(listGet(bag, 2), null)
  assert.equal(listGet(bag, -1), null)
  assert.equal(listGet(bag, 1), bag[1])
})
