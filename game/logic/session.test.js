import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  loadSession, saveSession, migrateV1, freshState, makePet, resetUidSeq,
  addPet, swapTeamBox, releasePet, consumeItem, addItem, countItem, dexCatch, dexSee,
  petHpMax, SAVE_KEY_V1, SAVE_KEY_V2, TEAM_MAX,
} from './session.js'
import { calcMaxHp } from './stats.js'

const here = dirname(fileURLToPath(import.meta.url))
const pets = JSON.parse(readFileSync(join(here, '../data/pets.json'), 'utf8'))
const rules = JSON.parse(readFileSync(join(here, '../data/rules.json'), 'utf8'))

function memStorage(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m }
}

test('v1 存档迁移: bag→team/box, items, dex 点亮, 等级取 petLevel', () => {
  resetUidSeq(0)
  const v1 = { name: '阿赛', level: 3, coins: 1234, diamonds: 5, petLevel: 12, items: [{ id: 200001, count: 4 }], bag: [1, 2, 3] }
  const st = migrateV1(v1, pets)
  assert.equal(st.v, 2)
  assert.equal(st.trainer.name, '阿赛')
  assert.equal(st.trainer.coins, 1234)
  assert.equal(st.team.length, 3)
  assert.equal(st.team[0].level, 12)
  assert.deepEqual(st.items, [{ id: 200001, count: 4 }])
  assert.equal(st.dex['1'].caught, true)
  assert.equal(st.dex['2'].seen, true)
  // 超队伍上限进仓库
  const big = { bag: Array.from({ length: TEAM_MAX + 2 }, () => 5) }
  const st2 = migrateV1(big, pets)
  assert.equal(st2.team.length, TEAM_MAX)
  assert.equal(st2.box.length, 2)
})

test('loadSession: v2 优先, 无档新建送新手宠, save→reload 幂等', () => {
  const store = memStorage()
  const s1 = loadSession(store, pets, rules)
  assert.equal(s1.team.length, 1)
  assert.ok(s1.team[0].petId)
  assert.equal(s1.dex[String(s1.team[0].petId)].caught, true)   // 新手宠即已抓到
  const s2 = loadSession(store, pets, rules)
  assert.equal(JSON.stringify(s1), JSON.stringify(s2))
  const nextUid = 'p' + (Number(String(s2.team[0].uid).slice(1)) + 1)
  assert.equal(makePet(pets, 2, 5).uid, nextUid)   // 载入 v2 后 uid 计数器抬到在队最大值
  s2.trainer.coins = 999
  saveSession(store, s2)
  assert.equal(loadSession(store, pets, rules).trainer.coins, 999)
  // v1 迁移只在无 v2 时发生, 迁移后立刻落 v2
  const store1 = memStorage({ [SAVE_KEY_V1]: JSON.stringify({ bag: [7], coins: 10 }) })
  const sm = loadSession(store1, pets, rules)
  assert.equal(sm.trainer.coins, 10)
  assert.ok(store1.getItem(SAVE_KEY_V2))
  assert.equal(loadSession(memStorage({ [SAVE_KEY_V2]: '{bad json', [SAVE_KEY_V1]: JSON.stringify({ bag: [7] }) }), pets, rules).team.length, 1)
})

test('pet 实例: hpMax 与内核同式, 满血出厂', () => {
  resetUidSeq(0)
  const p = makePet(pets, 1, 50)
  assert.equal(p.hp, calcMaxHp(pets.monsters[1].stats.hp, 50))
  assert.equal(p.hp, petHpMax(pets, p))
  assert.equal(p.name, pets.monsters[1].name)
})

test('队伍/仓库搬运与放生, 道具增减', () => {
  resetUidSeq(0)
  const st = freshState()
  for (let i = 0; i < TEAM_MAX; i++) addPet(st, makePet(pets, 1, 5))
  const extra = makePet(pets, 2, 5)
  assert.equal(addPet(st, extra), 'box')
  assert.ok(!swapTeamBox(st, extra.uid, true))          // 队满, 换不进
  const last = st.team[TEAM_MAX - 1]
  assert.ok(swapTeamBox(st, last.uid, false))           // 腾一个位
  assert.ok(swapTeamBox(st, extra.uid, true))
  assert.equal(st.team.length, TEAM_MAX)
  assert.ok(st.team.some(p => p.uid === extra.uid))
  assert.ok(swapTeamBox(st, extra.uid, false))
  assert.ok(releasePet(st, extra.uid))
  assert.ok(!releasePet(st, extra.uid))
  assert.ok(releasePet(st, last.uid))
  addItem(st, 200001, 3)
  assert.equal(countItem(st, 200001), 3)
  assert.ok(consumeItem(st, 200001, 3))
  assert.equal(countItem(st, 200001), 0)
  assert.ok(!consumeItem(st, 200001, 1))
})

test('图鉴: seen 不覆盖 caught, catch 双亮', () => {
  const st = freshState()
  dexSee(st, 9)
  assert.deepEqual(st.dex['9'], { seen: true, caught: false })
  dexCatch(st, 9)
  dexSee(st, 9)
  assert.equal(st.dex['9'].caught, true)
})
