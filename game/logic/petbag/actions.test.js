import test from 'node:test'
import assert from 'node:assert/strict'
import { createPetBagSource } from './source.js'
import { createGrid } from './grid.js'
import * as A from './actions.js'

const describePet = (p) => (p ? { name: p.uid, hpMax: 100 } : null)
const mkPet = (uid, extra = {}) => ({ uid, hp: 7, ...extra })
const bagOf = (list) => { const a = new Array(12).fill(null); list.forEach((p, i) => { a[i] = p }); return a }

// 装配一对 source+grid（背包宿主默认 normal=可写盘；storage 传数组）
function ctx(bagList, { host = 'normal', storage = [] } = {}) {
  const src = createPetBagSource({ host, bag: bagOf(bagList), describePet })
  src.setStorage(storage)
  const grid = createGrid({ capacity: 12, items: src.bag() })
  return { src, grid }
}

test('A2 heal 覆盖整个 petBag[12]，不是当前页', () => {
  const { src, grid } = ctx([mkPet('a'), mkPet('b'), null, null, null, null, mkPet('c')])
  grid.setPage(0)
  const r = A.heal(src, grid)
  assert.equal(r.ok, true)
  assert.equal(r.write, 'bag')
  assert.equal(r.hint.key, 'bag.healAll')
  // 全 12 槽里每个非空宠都满血（含第 7 格 c —— 不在首页 6 格里）
  for (const p of src.bag()) if (p != null) assert.equal(p.hp, 100, `${p.uid} 未恢复`)
})

test('A3 store 保护判据 = 真实宠袋 >1（即便本页筛选只剩 1 只）', () => {
  const { src, grid } = ctx([mkPet('keep'), mkPet('move')], { storage: [] })
  grid.setFilter(p => p.uid === 'move')          // 视图只显示 1 只
  const r = A.store(src, grid, { slot: 1 })
  assert.equal(r.ok, true)
  assert.equal(src.bag()[1], null)               // 该槽空
  assert.equal(src.storage().length, 1)          // 入仓
})

test('A3 只剩 1 只 ⇒ 拒绝入库（needOneProtect）', () => {
  const { src, grid } = ctx([mkPet('solo')])
  const r = A.store(src, grid, { slot: 0 })
  assert.equal(r.ok, false)
  assert.equal(r.hint.key, 'bag.needOneProtect')
})

test('A13 release 门在 L1：elite===true 即便绕过 UI 也拒绝', () => {
  const fav = mkPet('fav', { elite: true })
  const { src, grid } = ctx([mkPet('x')], { storage: [fav] })
  const r = A.release(src, grid, { index: 0 })
  assert.equal(r.ok, false)
  assert.equal(r.hint.key, 'storage.releaseFavorited')
  assert.equal(src.storage().length, 1)          // 未被放生
})

test('release：非 normal 宿主一律只读拒绝', () => {
  const { src, grid } = ctx([mkPet('x')], { host: 'pvp', storage: [mkPet('r')] })
  const r = A.release(src, grid, { index: 0 })
  assert.equal(r.ok, false)
  assert.equal(r.hint.key, 'storage.releaseReadOnly')
})

test('release：普通未收藏宠可放生', () => {
  const { src, grid } = ctx([mkPet('x')], { storage: [mkPet('doomed')] })
  const r = A.release(src, grid, { index: 0 })
  assert.equal(r.ok, true)
  assert.equal(src.storage().length, 0)
})

test('deploy 满位 ⇒ pickReplace 提示，不静默失败', () => {
  const six = [mkPet('t0'), mkPet('t1'), mkPet('t2'), mkPet('t3'), mkPet('t4'), mkPet('t5'), mkPet('cand')]
  const { src, grid } = ctx(six)                 // 前 6 全满
  const r = A.deploy(src, grid, { slot: 6 })
  assert.equal(r.ok, false)
  assert.equal(r.hint.key, 'bag.pickReplace')
})

test('deploy 有空的出战位 ⇒ 候选填入第一空位', () => {
  const list = [mkPet('t0'), mkPet('t1'), null, null, null, null, mkPet('cand')]
  const { src, grid } = ctx(list)
  const r = A.deploy(src, grid, { slot: 6 })
  assert.equal(r.ok, true)
  assert.equal(r.write, 'bag')
  assert.equal(src.bag()[2].uid, 'cand')         // 填进 slot2（第一个空位）
})

test('setFirst 挪到全局 slot0（允许与空槽换）', () => {
  const { src, grid } = ctx([mkPet('a'), mkPet('b'), mkPet('c')])
  const r = A.setFirst(src, grid, { slot: 2 })
  assert.equal(r.ok, true)
  assert.equal(src.bag()[0].uid, 'c')
})

test('swapTeam 前 6 ↔ 后 6；备用全空 ⇒ teamEmpty', () => {
  const front = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'].map(u => mkPet(u))
  const back = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5'].map(u => mkPet(u))
  const { src, grid } = ctx([...front, ...back])
  const r = A.swapTeam(src, grid)
  assert.equal(r.ok, true)
  assert.equal(src.bag()[0].uid, 'b0')           // 后 6 换到前 6
  assert.equal(src.bag()[6].uid, 'f0')

  const only6 = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5'].map(u => mkPet(u))
  const c2 = ctx(only6)
  const r2 = A.swapTeam(c2.src, c2.grid)
  assert.equal(r2.ok, false)
  assert.equal(r2.hint.key, 'bag.teamEmpty')
})

test('takeOut 门：petBag 全满 ⇒ pickReplace；有空槽 ⇒ 落位', () => {
  const full = Array.from({ length: 12 }, (_, i) => mkPet('p' + i))
  const c1 = ctx(full, { storage: [mkPet('r0')] })
  const r1 = A.takeOut(c1.src, c1.grid, { index: 0 })
  assert.equal(r1.ok, false)
  assert.equal(r1.hint.key, 'storage.pickReplace')

  const notFull = Array.from({ length: 11 }, (_, i) => mkPet('p' + i))  // slot11 空
  const c2 = ctx(notFull, { storage: [mkPet('r0')] })
  const r2 = A.takeOut(c2.src, c2.grid, { index: 0 })
  assert.equal(r2.ok, true)
  assert.equal(c2.src.bag()[11].uid, 'r0')
  assert.equal(c2.src.storage().length, 0)
})

test('favorite 翻 elite 键（写一个键、非容器）', () => {
  const { src, grid } = ctx([mkPet('x')], { storage: [mkPet('pet')] })
  const r1 = A.favorite(src, grid, { index: 0 })
  assert.equal(src.storage()[0].elite, true)
  assert.equal(r1.hint.key, 'storage.favorited')
  const r2 = A.favorite(src, grid, { index: 0 })
  assert.equal(src.storage()[0].elite, false)
  assert.equal(r2.hint.key, 'storage.unfavorited')
})

test('write 单点跟 canPersist：只读宿主成功也不给 write', () => {
  // pvp：可就地改，但 persist='none' ⇒ canPersist false ⇒ write null
  const src = createPetBagSource({ host: 'pvp', bag: bagOf([mkPet('a'), mkPet('b'), null, null, null, null, mkPet('c')]), describePet })
  src.setStorage([])
  const grid = createGrid({ capacity: 12, items: src.bag() })
  const r = A.heal(src, grid)
  assert.equal(r.ok, true)                       // 改成功了
  assert.equal(r.write, null)                    // 但不落盘（解 A1）

  // door：readOnly ⇒ 动作直接拒绝、不改数据
  const src2 = createPetBagSource({ host: 'door', bag: bagOf([mkPet('a')]), describePet })
  src2.setStorage([])
  const grid2 = createGrid({ capacity: 12, items: src2.bag() })
  const r2 = A.heal(src2, grid2)
  assert.equal(r2.ok, false)
  assert.equal(r2.write, null)
})
