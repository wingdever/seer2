// EffectHandler 的队列语义锁 —— 这是 S3 后面每批算子的执行序, 所以拍的是「谁在谁前面」而不是判定结果。
// 顺序即语义 (concat 的拼接序、condition 的原地重排、checkList 与 queue 的位对齐) 都在这份文件里锁住;
// Effect.Condition/Apply 本体的取值由 chunk D 的对拍接管。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Effect } from '../effect/effect.ts'
import { EffectTiming, EffectTarget, EffectCondition, EffectAbility } from '../effect/effect-database.ts'
import { EffectHandler, setEffectJudgement, type EffectStateView } from './effect-handler.ts'

const mkEffect = (id: number, priority: number): Effect =>
  new Effect(EffectTiming.None, priority, EffectTarget.None, EffectCondition.None, null, EffectAbility.None, null, id)

const mkState = (whosTurn: number): EffectStateView => ({ whosTurn, snapshot: () => mkState(whosTurn) })

// 默认接缝没接: 判定与执行都显式抛 (放在最前面测, 因为后面的用例会覆盖 JUDGE)
test('JUDGE 未注入时显式抛, 不静默放行', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0)])
  assert.throws(() => h.condition(mkState(1)), /未移植/)
  assert.throws(() => h.apply(mkState(1), [true]), /未移植/)
})

/** 只记 condition 的调用序, 便于断言「谁先被问」。 */
function byCondition(fn?: (e: Effect, unit: unknown, state: EffectStateView | null) => boolean) {
  const calls: { id: number; unit: unknown; whosTurn: number | null; phase: boolean }[] = []
  setEffectJudgement({
    condition: (e, unit, state, phase) => {
      calls.push({ id: e.id, unit, whosTurn: state === null ? null : state.whosTurn, phase })
      return fn ? fn(e, unit, state) : true
    },
  })
  return calls
}

function byApply() {
  const applied: number[] = []
  setEffectJudgement({ apply: (e) => { applied.push(e.id); return true } })
  return applied
}

test('addEffects: effects 为 null 直接放行 (技能没配效果是常态, 不是异常)', () => {
  const h = new EffectHandler()
  h.addEffects('u', null)
  assert.deepEqual(byCondition(), [])
  assert.deepEqual(h.condition(mkState(1)), [])
})

test('concat 是 [master…, client…] 的插入序, 且返回自身', () => {
  const a = new EffectHandler(); a.addEffects('m', [mkEffect(1, 0)])
  const b = new EffectHandler(); b.addEffects('c', [mkEffect(2, 0)])
  const calls = byCondition()
  assert.equal(a.concat(b), a)
  a.condition(mkState(1))
  assert.deepEqual(calls.map((x) => x.id), [1, 2])
  assert.deepEqual(calls.map((x) => x.unit), ['m', 'c'])
})

test('condition 原地按 priority 稳定重排 queue, Apply 用同一份序', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(10, 5), mkEffect(11, 1), mkEffect(12, 5), mkEffect(13, 0)])
  const calls = byCondition()
  h.condition(mkState(1))
  assert.deepEqual(calls.map((x) => x.id), [13, 11, 10, 12])   // 0,1,5,5 —— 并列的 10/12 保持插入序

  const applied = byApply()
  h.apply(mkState(1), [true, true, true, true])
  assert.deepEqual(applied, [13, 11, 10, 12])
})

test('checkList 短于 queue 时整体不执行 (上游那条 Count< 的短路)', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0), mkEffect(2, 0)])
  byCondition()
  const applied = byApply()
  h.apply(mkState(1), [true])
  assert.deepEqual(applied, [])
})

test('apply 不带 checkList 时抛 —— 上游把 null 检查写在解引用之后', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0)])
  assert.throws(() => h.apply(mkState(1)), TypeError)
})

// Apply 与 checkList 的对齐靠的是 queue 的**当前**序, 而排序是 Condition 的副作用 (EffectHandler.cs:54)。
// 跳过 Condition 直接 Apply 的调用点在战前预处理那几条链路上存在, 顺序不同就是不同的效果在跑。
test('没跑过 condition 时 apply 按插入序对齐 checkList', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 9), mkEffect(2, 1)])
  const applied = byApply()
  h.apply(mkState(1), [false, true])                            // 插入序 = [1, 2] ⇒ false 落在 id1 上
  assert.deepEqual(applied, [2])
})

test('跑过 condition 之后 queue 已被原地重排, apply 跟着新序走', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 9), mkEffect(2, 1)])
  byCondition()
  h.condition(mkState(1))                                       // ⇒ queue = [2(p1), 1(p9)]
  const applied = byApply()
  h.apply(mkState(1), [false, true])
  assert.deepEqual(applied, [1])
})

test('whosTurn==0 时 condition 先按 -1 再按 1 各跑一遍, 结果逐位 OR', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0), mkEffect(2, 0)])
  // id1 只在 master 侧真、id2 只在 client 侧真 ⇒ 两侧各出一条, OR 之后两条都该是 true
  const calls = byCondition((e, _u, state) => (e.id === 1 ? state?.whosTurn === 1 : state?.whosTurn === -1))
  assert.deepEqual(h.condition(mkState(0)), [true, true])
  assert.deepEqual(calls.map((x) => x.whosTurn), [-1, -1, 1, 1])
})

test('state 为 null (常驻) 时不走双回合分支', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0)])
  const calls = byCondition()
  h.condition(null)
  assert.deepEqual(calls.map((x) => x.whosTurn), [null])
})

test('checkPhase 透传给判定', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0)])
  const calls = byCondition()
  h.condition(mkState(1), false)
  assert.equal(calls[0].phase, false)
})

test('getEffects 的下标是 queue 位置 (与 checkList 对齐靠它)', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0), mkEffect(2, 0), mkEffect(3, 0)])
  assert.deepEqual(h.getEffects((_e, i) => i !== 1).map((x) => x.id), [1, 3])
})

test('removeEffects 只按 Effect 滤, 其余顺序不变', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0), mkEffect(2, 0), mkEffect(3, 0)])
  h.removeEffects((e) => e.id === 2)
  const calls = byCondition()
  h.condition(mkState(1))
  assert.deepEqual(calls.map((x) => x.id), [1, 3])
})

test('clear 清空队列', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0)])
  h.clear()
  byCondition()
  assert.deepEqual(h.condition(mkState(1)), [])
})

test('checkAndApply = condition 的结果原样喂给 apply', () => {
  const h = new EffectHandler()
  h.addEffects('u', [mkEffect(1, 0), mkEffect(2, 0)])
  setEffectJudgement({ condition: (e) => e.id === 1 })
  const applied = byApply()
  h.checkAndApply(mkState(1))
  assert.deepEqual(applied, [1])
})
