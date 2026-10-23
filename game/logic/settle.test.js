import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { freshState, makePet, resetUidSeq, petHpMax, addItem, countItem } from './session.js'
import { levelExp, totalExpToLevel, levelFromTotalExp, calcMaxHp } from './stats.js'
import { makeRng } from './rng.js'
import {
  computeExp, awardExp, captureProb, captureRoll, hpBandMult, escapeRoll, applyEvolution,
} from './settle.js'
import { dispatch } from './phases/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const pets = JSON.parse(readFileSync(join(here, '../data/pets.json'), 'utf8'))
const rules = JSON.parse(readFileSync(join(here, '../data/rules.json'), 'utf8'))

test('经验曲线: 手算值与级进一致, levelFromTotalExp 是逆函数', () => {
  assert.equal(levelExp(rules.expCurve, 'A', 1), Math.floor(3.75 + 3.75 + 1 + 1 + 1))  // parity+lv1Extra
  assert.equal(levelExp(rules.expCurve, 'A', 2), Math.floor(3.75 * 4 + 3.75 * 2 + 1))    // 偶数不加
  assert.equal(totalExpToLevel(rules.expCurve, 'A', 3), levelExp(rules.expCurve, 'A', 1) + levelExp(rules.expCurve, 'A', 2))
  const e = totalExpToLevel(rules.expCurve, 'A', 20)
  assert.equal(levelFromTotalExp(rules.expCurve, 'A', e), 20)
  assert.equal(levelFromTotalExp(rules.expCurve, 'A', e - 1), 19)
})

test('computeExp = Σ (beatExpParam/255) × levelExp(敌方等级)', () => {
  const g1 = pets.growth['1']
  const expected = Math.floor((g1.beatExpParam / 255) * levelExp(rules.expCurve, g1.expType, 10))
  assert.equal(computeExp(rules, pets, [{ petId: 1, level: 10 }]), expected)
})

test('awardExp: 均分给参战宠, 升级+hp上限补差, Lv20 触发迪兰特进化入队', () => {
  resetUidSeq(0)
  const st = freshState()
  const a = makePet(pets, 1, 1)
  const b = makePet(pets, 1, 1)
  st.team.push(a, b)
  const need = totalExpToLevel(rules.expCurve, pets.growth['1'].expType, 20)
  // 敌人足够肥: 让 total/2 ≥ need
  const enemies = [{ petId: 1, level: 100 }]
  const r = awardExp(rules, pets, st, [a.uid], enemies)
  assert.ok(r.total > 0)
  assert.equal(a.exp, r.share)
  assert.equal(a.level, levelFromTotalExp(rules.expCurve, 'A', a.exp))
  assert.equal(b.level, 1, '未参战不分享')
  assert.equal(a.hp, petHpMax(pets, a), '满血宠升级后仍满血')
  if (a.level < 20) { // 若一级不够, 再喂到 20
    awardExp(rules, pets, st, [a.uid], [{ petId: 1, level: 100 }, { petId: 1, level: 100 }, { petId: 1, level: 100 }])
  }
  assert.ok(a.level >= 20, `应升到 ≥20, 实际 ${a.level} (need=${need})`)
  assert.equal(st.evolve.pending.length, 1)
  assert.deepEqual(st.evolve.pending[0], { uid: a.uid, from: 1, to: 2, at: 20 })
  const done = applyEvolution(rules, pets, st, a.uid)
  assert.equal(done.to, 2)
  assert.equal(a.petId, 2)
  assert.equal(a.name, pets.monsters[2].name)
  assert.equal(st.evolve.pending.length, 0)
})

test('captureProb: 血量档 × 球率, 等级门槛, alwaysByIds 与大师球保底', () => {
  const ball = rules.items.captureBalls[0]   // 25, ≤30级
  const mk = (hp, hpMax, level = 10, petId = 1) => ({ petId, level, hp, hpMax })
  const full = mk(100, 100)
  const low = mk(1, 100)
  assert.equal(captureProb(rules, ball, full), 25 * hpBandMult(rules, 0))
  assert.equal(hpBandMult(rules, 1), 2)
  assert.equal(captureProb(rules, ball, low), 50)          // lost>0.75 → ×2
  assert.equal(captureProb(rules, ball, { ...full, level: 31 }), 0)  // 超胶囊等级
  const master = rules.items.captureBalls[3]               // prob100
  assert.equal(captureProb(rules, master, full), 100)
  assert.equal(captureProb(rules, ball, { petId: 10, level: 99, hp: 100, hpMax: 100 }), 100) // alwaysByIds
  assert.ok(captureProb(rules, ball, low, true) < captureProb(rules, ball, low))              // 异常状态÷3
})

test('captureRoll 种子确定性: 同 seed 同结果', () => {
  const ball = rules.items.captureBalls[1]
  const w = { petId: 5, level: 10, hp: 1, hpMax: 100 }
  const r1 = captureRoll(rules, makeRng('seed-x'), ball, w)
  const r2 = captureRoll(rules, makeRng('seed-x'), ball, w)
  assert.deepEqual(r1, r2)
  assert.equal(r1.success, r1.roll < r1.prob)
})

test('escapeRoll 种子确定性且在 clamp 区间', () => {
  resetUidSeq(0)
  const st = freshState()
  const me = makePet(pets, 1, 30)
  const wild = makePet(pets, 5, 10)
  const e = rules.escape
  const r = escapeRoll(rules, makeRng('s'), pets, me, wild)
  assert.ok(r.chance >= e.pMin && r.chance <= e.pMax)
  assert.equal(escapeRoll(rules, makeRng('s'), pets, me, wild).success, r.success)
})

test('dispatch 全链: encounter→turn→capture(掷点失败后成功)→end, 事件序与落库', () => {
  resetUidSeq(0)
  const st = freshState()
  const me = makePet(pets, 1, 20)
  st.team.push(me)
  const deps = { rules, pets, rng: makeRng('loop') }
  let ev = dispatch(deps, st, { type: 'encounter.start', wild: { petId: 12, level: 8, slot: 3, back: 1, map: 'x' } })
  assert.equal(ev[0].type, 'encounter.start')
  assert.equal(st.dex['12'].seen, true)
  assert.equal(st.dex['12'].caught, false)
  ev = dispatch(deps, st, { type: 'battle.turn', actorUids: [me.uid] })
  assert.equal(st.battle.participants[0], me.uid)
  // 满血扔普通球概率低, 打到残血
  const hpMax = calcMaxHp(pets.monsters[12].stats.hp, 8)
  st.battle.wild.hp = 1  // 仅为语义, 掷点用 action 传值
  ev = dispatch(deps, st, { type: 'battle.end', outcome: 'win', leftHp: { [me.uid]: 50 }, enemies: [{ petId: 12, level: 8 }] })
  assert.equal(st.battle, null)
  assert.ok(ev.some(x => x.type === 'exp.awarded'))
  assert.equal(me.hp, 50)
  assert.equal(st.dex['12'].caught, false, '打赢不点亮 caught')
  // 再开一场, 抓捕成功链 (无敌胶囊=prob100 必成)
  addItem(st, 200006, 1)
  dispatch(deps, st, { type: 'encounter.start', wild: { petId: 13, level: 5 } })
  dispatch(deps, st, { type: 'battle.turn', actorUids: [me.uid] })
  const wMax = calcMaxHp(pets.monsters[13].stats.hp, 5)
  ev = dispatch(deps, st, { type: 'capture.attempt', itemId: 200006, wildHp: Math.round(wMax / 2), wildHpMax: wMax })
  const ok = ev.find(x => x.type === 'capture.success')
  assert.ok(ok, '无敌胶囊应必成')
  assert.equal(countItem(st, 200006), 0, '胶囊消耗')
  assert.equal(st.dex['13'].caught, true)
  assert.ok(st.team.some(p => p.petId === 13))
  assert.ok(ev.some(x => x.type === 'battle.end'))   // 信号: 页面随后 dispatch battle.end 收尾
  assert.ok(st.battle && st.battle.captured, '结算前 battle 上下文保留 captured')
  ev = dispatch(deps, st, { type: 'battle.end', outcome: 'capture', leftHp: {} })
  assert.equal(st.battle, null)
  assert.ok(ev.some(x => x.type === 'exp.awarded'), '抓捕也给参战经验')
  // 逃跑链
  dispatch(deps, st, { type: 'encounter.start', wild: { petId: 14, level: 3 } })
  ev = dispatch(deps, st, { type: 'escape.attempt', uid: me.uid })
  assert.equal(ev[0].type, 'escape.result')
})

test('item.use: 原版固定恢复量, 消耗回合与道具', () => {
  resetUidSeq(0)
  const st = freshState()
  const me = makePet(pets, 1, 10)
  st.team.push(me)
  addItem(st, 200011, 2)
  const deps = { rules, pets, rng: makeRng('h') }
  dispatch(deps, st, { type: 'encounter.start', wild: { petId: 2, level: 10 } })
  const max = petHpMax(pets, me)
  const cur = Math.max(0, max - 30)
  const ev = dispatch(deps, st, { type: 'item.use', uid: me.uid, itemId: 200011, currentHp: cur })
  const h = ev[0]
  assert.equal(h.type, 'item.potion')
  assert.equal(h.heal, 20)                 // 初级体力药剂 = 20 点
  assert.equal(h.targetHp, cur + 20)
  assert.equal(countItem(st, 200011), 1)   // 消耗一个
  assert.equal(st.battle.turns, 1)         // 消耗回合
})
