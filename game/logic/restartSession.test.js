import test from 'node:test'
import assert from 'node:assert/strict'

import {
  loadRestartSession, saveRestartSession, freshState, makeRestartPet, resetUidSeq, syncUidSeq,
  addPet, swapTeamBox, releasePet, consumeItem, addItem, countItem, dexCatch, dexSee,
  restartHpMax, settleRestart, SAVE_KEY_V3, TEAM_MAX,
} from './restartSession.js'

// stub auth —— 纯逻辑单测用; 真值 (宇宙差 311 vs 360) 在浏览器 harness 用 CONTENT.buildRestartAuth 验。
function makeStubAuth() {
  const base = { 1: 100, 2: 130, 3: 200 }
  return {
    hpMax: (petId, level) => (base[petId] ?? 50) + level * 2,
    nameOf: (petId) => `R${petId}`,
    swfIdOf: (petId) => petId + 1000,
    exp: {
      beatExpParamOf: (id) => (id === 1 ? 95 : 65),
      expTypeOf: () => 0,
      levelExpAt: (t, lv) => lv * 5,
      levelFromTotalExp: (t, exp) => Math.max(1, Math.floor(Math.sqrt(exp))),
      evolveOf: (id) => (id === 1 ? [{ to: 2, at: 20 }] : []),
      settleDivisor: 100,
      _source: 'borrowed-A/B-shape',
    },
  }
}
const A = makeStubAuth()

function memStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }
}

test('loadRestartSession 无档: 造重启初始宠 (id1, Lv10) 满血 + 写 v3 + 溯源戳', () => {
  const st0 = memStorage()
  resetUidSeq(0)
  const st = loadRestartSession(st0, A)
  assert.equal(st.v, 3)
  assert.equal(st.team.length, 1)
  assert.equal(st.team[0].petId, 1)
  assert.equal(st.team[0].level, 10)
  assert.equal(st.team[0].exp, 0)
  assert.equal(st.team[0].hp, A.hpMax(1, 10))          // 满血入场 (iv=0 权威)
  assert.equal(st.dex['1'].caught, true)
  assert.deepEqual(st._authority, { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' })
  assert.ok(st0._m.has(SAVE_KEY_V3))
  assert.ok(![...st0._m.keys()].some(k => k.includes('save.v2')), 'v3 不得碰 v2 键')
})

test('存档 round-trip 幂等 + uid 计数器抬高不撞号', () => {
  const st0 = memStorage()
  resetUidSeq(0)
  const s1 = loadRestartSession(st0, A)
  const p2 = makeRestartPet(A, 3, 10)
  addPet(s1, p2)
  saveRestartSession(st0, s1)
  const s2 = loadRestartSession(st0, A)
  assert.deepEqual(s2, s1)
  const p3 = makeRestartPet(A, 5, 5)                    // 载入后新造, uid 必须 > 已存的 p2
  assert.ok(Number(p3.uid.replace('p', '')) > Number(p2.uid.replace('p', '')))
})

test('settleRestart win: exp 记借用戳 → 升级 → 进化到 unity 目标 → hp 全程重启 cap', () => {
  resetUidSeq(0)
  const st = freshState()
  const lead = makeRestartPet(A, 1, 10)               // level10 exp0 hp=120
  st.team.push(lead)
  lead.exp = 399                                       // 逼近 sqrt→20+
  const { events } = settleRestart(A, st, {
    outcome: 'win',
    leftHp: { [lead.uid]: 999999 },                     // 远超 cap → 必须被重启 cap 夹 (120)
    uids: [lead.uid],
    wild: { petId: 1, level: 40 },                      // beatExpParam 95, levelExpAt(0,40)=200 → total=190
  })
  assert.equal(lead.petId, 2, '进化到 unity 目标 id2')
  assert.ok(lead.level >= 20, `等级 ${lead.level} 应 ≥ 进化阈值 20`)
  assert.equal(lead.hp, 178)                            // clamp 120 → 升级+28 → 进化+30 = 178
  assert.ok(lead.hp <= A.hpMax(2, lead.level), '不得越重启 cap')
  const expEv = events.find(e => e.type === 'exp.awarded')
  assert.equal(expEv.curve, 'borrowed-A/B-shape', 'exp 曲线必须标借用')
  assert.ok(events.some(e => e.type === 'evolve.done' && e.to === 2 && e.name === 'R2'))
  assert.ok(events.some(e => e.type === 'pet.levelup'))
  assert.equal(st.evolve.pending.length, 0)             // 结算尾已 apply
})

test('settleRestart lose: 全愈到重启 cap (iv=0), 不发 exp', () => {
  resetUidSeq(0)
  const st = freshState()
  const lead = makeRestartPet(A, 1, 10)                // hp=120
  st.team.push(lead)
  const { events } = settleRestart(A, st, { outcome: 'lose', leftHp: { [lead.uid]: 50 }, uids: [lead.uid], wild: { petId: 1, level: 5 } })
  assert.equal(lead.hp, restartHpMax(A, lead))          // 满血送回
  assert.ok(!events.some(e => e.type === 'exp.awarded'))
  assert.ok(events.some(e => e.type === 'team.healed' && e.authority === 'unity-iv0'))
})

test('dex: win 点亮 seen (重启 id), 捕捉点亮 caught', () => {
  resetUidSeq(0)
  const st = freshState()
  st.team.push(makeRestartPet(A, 1, 10))
  settleRestart(A, st, { outcome: 'win', leftHp: {}, uids: [], wild: { petId: 3, level: 5 } })
  assert.equal(st.dex['3'].seen, true)
  assert.equal(st.dex['3'].caught, false)
  settleRestart(A, st, { outcome: 'capture', leftHp: {}, uids: [], wild: { petId: 3, level: 5 } })
  assert.equal(st.dex['3'].caught, true)
})

test('结构操作: addPet 满队入仓库, swapTeamBox, releasePet, consumeItem', () => {
  resetUidSeq(0)
  const st = freshState()
  for (let i = 0; i < TEAM_MAX; i++) st.team.push(makeRestartPet(A, i + 1, 10))
  assert.equal(addPet(st, makeRestartPet(A, 99, 10)), 'box')     // 队满 → 入仓库
  assert.equal(st.box.length, 1)
  assert.equal(swapTeamBox(st, 'p7', false), false)              // p7 在仓库, 非队伍 → 找不到
  assert.equal(swapTeamBox(st, 'p7', true), false)              // 队满 → 无法从仓库回队
  const st2 = freshState()
  resetUidSeq(0)
  st2.team.push(makeRestartPet(A, 1, 10))
  assert.equal(releasePet(st2, 'p1'), true)
  assert.equal(st2.team.length, 0)
  addItem(st2, 200001, 3)
  assert.equal(countItem(st2, 200001), 3)
  assert.equal(consumeItem(st2, 200001, 4), false)
  assert.equal(consumeItem(st2, 200001, 2), true)
  assert.equal(countItem(st2, 200001), 1)
})
