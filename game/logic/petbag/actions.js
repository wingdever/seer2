// L1 · 九件背包 + 仓库四件的目标行为。见 docs/view/panel/petbag-impl.md §3.3、
// docs/view/panel/view-panels-pet.md §6.1。每个动作 = 一个纯函数，就地改 source 交出的 bag/storage 引用（S4），
// 返回 { ok, write:'bag'|null, hint? }。
//   · write 由 source.canPersist() 单点决定（解 A1：非 normal 宿主一律 null）。
//   · hint = {key,args,level}，**文案不在这里拼**（取词归 View / R5）；需要二次确认的动作（放生/满位换宠）
//     的确认在装配层 askHint 之后才 dispatch 本函数，故本函数只管"改 + 报结果"。
// 表数据（hpMax）经 source.describePet 注入；收藏 = 内存宠上的一个布尔字段 `elite`
// （落盘形状 = recordDict 的 elite 字符串键，归 Save/会话线，见 app/session.js 的 setRecordElite）。

import { BAG_SIZE, TEAM_SIZE, EMPTY } from './constants.js'

const writeOf = (src) => (src.canPersist() ? 'bag' : null)
const maxHpOf = (src, pet) => {
  const d = src.describePet?.(pet)
  return (d && d.hpMax) || 1
}
const isElite = (pet) => !!(pet && pet.elite === true)
const petCount = (bag) => bag.reduce((n, p) => n + (p == null ? 0 : 1), 0)

// 1 换位（拖或点）：a、b 为槽下标；两端非空才可（G7 在 grid 里也守，这里复用 grid.swap）。
export function swapCells(src, grid, { a, b }) {
  if (src.readOnly()) return { ok: false, write: null }
  const done = grid.swap(a, b)
  return { ok: done, write: done ? writeOf(src) : null, hint: done ? null : { key: 'bag.swapEmpty', args: [], level: 'info' } }
}

// 2 设为首发：目标 = 全局第 0 位（挪队首，非页内 0；解 C1 §6.1② 对上游手感的偏离）。
export function setFirst(src, grid, { slot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  if (slot <= 0 || slot >= BAG_SIZE || bag[slot] == null) return { ok: false, write: null }
  const p = bag[slot]
  bag[slot] = bag[0]          // 允许与空槽换（这不是"拖拽换位"，是"置队首"）
  bag[0] = p
  grid.refresh()
  return { ok: true, write: writeOf(src), hint: { key: 'bag.setFirst', args: [src.describePet?.(p)?.name ?? ''], level: 'info' } }
}

// 3 上阵 / 入队：候选（slot>=TEAM_SIZE）填出战区第一空位；满 ⇒ 交回 pickReplace（装配层 askHint 选一只换）。
export function deploy(src, grid, { slot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  if (bag[slot] == null) return { ok: false, write: null }
  let empty = -1
  for (let i = 0; i < TEAM_SIZE; i++) if (bag[i] === EMPTY) { empty = i; break }
  if (empty < 0) return { ok: false, write: null, hint: { key: 'bag.pickReplace', args: [], level: 'warn' } }  // 满位，不静默失败（操作 3）
  const ok = grid.swap(slot, empty) || (() => { const t = bag[slot]; bag[slot] = bag[empty]; bag[empty] = t; return true })()
  grid.refresh()
  return { ok, write: ok ? writeOf(src) : null }
}

// 3b 满位换宠：把候选 slot 与出战区 teamSlot 直接换（用户经 pickReplace 选定后）。
export function deploySwap(src, grid, { slot, teamSlot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  if (bag[slot] == null || teamSlot < 0 || teamSlot >= TEAM_SIZE) return { ok: false, write: null }
  const t = bag[slot]; bag[slot] = bag[teamSlot]; bag[teamSlot] = t
  grid.refresh()
  return { ok: true, write: writeOf(src) }
}

// 4 一键换队：前 6 ↔ 后 6（规模取 constants，不写死；解 A12）。备用区全空 ⇒ teamEmpty 提示。
export function swapTeam(src, grid) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  const cand = bag.slice(TEAM_SIZE, BAG_SIZE)
  if (cand.every(p => p == null)) return { ok: false, write: null, hint: { key: 'bag.teamEmpty', args: [], level: 'info' } }
  for (let i = 0; i < TEAM_SIZE; i++) { const t = bag[i]; bag[i] = bag[TEAM_SIZE + i]; bag[TEAM_SIZE + i] = t }
  grid.refresh()
  return { ok: true, write: writeOf(src) }
}

// 5 恢复体力：整个 petBag[12]（解 A2：不是当前页）；文案随范围（healAll）。
export function heal(src, grid) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  for (const p of bag) if (p != null) p.hp = maxHpOf(src, p)
  return { ok: true, write: writeOf(src), hint: { key: 'bag.healAll', args: [], level: 'info' } }
}

// 7 入库：当前选中候选挪进仓库；保护判据 = **真实宠袋非空计数 > 1**（解 A3：不是本页筛选后计数）。
export function store(src, grid, { slot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag()
  if (bag[slot] == null) return { ok: false, write: null }
  if (petCount(bag) <= 1) return { ok: false, write: null, hint: { key: 'bag.needOneProtect', args: [], level: 'warn' } }
  const storage = src.storage()
  storage.push(bag[slot])
  bag[slot] = EMPTY
  grid.refresh()
  return { ok: true, write: writeOf(src), hint: { key: 'bag.stored', args: [src.describePet?.(storage[storage.length - 1])?.name ?? ''], level: 'info' } }
}

// 8 改性格：规则在 L1（这里只落一个值）；host∈{pvp,dictionary} 不写盘（照搬上游，它是对的）。
export function setPersonality(src, grid, { slot, personality }) {
  if (src.readOnly()) return { ok: false, write: null }
  const p = src.bag()[slot]
  if (p == null) return { ok: false, write: null }
  p.personality = personality
  return { ok: true, write: writeOf(src) }
}


// ── 学习力（精灵能力子区域编辑；data 面 = pet.__xml.talent）──
// 顺序与 docs 的 petReadout.ev 一致：[atk, mat, def, mdf, spd, hp]（索引 0..5）。
const EV_KEYS = ['atk', 'mat', 'def', 'mdf', 'spd', 'hp']
const EV_MAX_PER = 255     // 单属性学习力上限（上游 Pet.talent.ev 上限）

function evSnapshot(p) {
  const t = (p && p.__xml && p.__xml.talent) || {}
  const ev = [0, 0, 0, 0, 0, 0]
  const e = t.ev || {}
  EV_KEYS.forEach((k, i) => { ev[i] = Math.max(0, Math.trunc(Number(e[k]) || 0)) })
  const storage = Math.max(0, Math.trunc(Number(t.evStorage) || 0))
  return { ev, storage }
}
function evCommit(p, ev, storage) {
  if (!p.__xml) p.__xml = {}
  if (!p.__xml.talent) p.__xml.talent = {}
  const e = {}
  EV_KEYS.forEach((k, i) => { e[k] = ev[i] })
  p.__xml.talent.ev = e
  p.__xml.talent.evStorage = storage
}

// 调整单属性学习力：delta 为步长（+1/-1）；受「剩余余量」与「单属性上限」双重约束。
export function adjustEv(src, grid, { slot, stat, delta }) {
  if (src.readOnly()) return { ok: false, write: null }
  const p = src.bag()[slot]
  if (p == null || !Number.isInteger(stat) || stat < 0 || stat >= EV_KEYS.length) return { ok: false, write: null }
  const { ev, storage } = evSnapshot(p)
  if (delta > 0) {
    const room = Math.min(delta, storage, EV_MAX_PER - ev[stat])
    if (room <= 0) return { ok: false, write: null }
    ev[stat] += room
    evCommit(p, ev, storage - room)
  } else {
    const cut = Math.min(-delta, ev[stat])
    if (cut <= 0) return { ok: false, write: null }
    ev[stat] -= cut
    evCommit(p, ev, storage + cut)
  }
  return { ok: true, write: writeOf(src) }
}

// 重置：清空全部已分配学习力，退回剩余余量。
export function resetEv(src, grid, { slot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const p = src.bag()[slot]
  if (p == null) return { ok: false, write: null }
  const { ev, storage } = evSnapshot(p)
  const total = ev.reduce((a, b) => a + b, 0)
  evCommit(p, [0, 0, 0, 0, 0, 0], storage + total)
  return { ok: true, write: writeOf(src) }
}

// 快速：把剩余余量尽量平均分配到六属性（单属性上限封顶），除不尽的回落剩余。
export function quickEv(src, grid, { slot }) {
  if (src.readOnly()) return { ok: false, write: null }
  const p = src.bag()[slot]
  if (p == null) return { ok: false, write: null }
  const { ev, storage } = evSnapshot(p)
  let left = storage
  while (left > 0) {
    let progressed = false
    for (let i = 0; i < ev.length; i++) {
      if (ev[i] < EV_MAX_PER) { ev[i]++; left--; progressed = true }
      if (left <= 0) break
    }
    if (!progressed) break
  }
  evCommit(p, ev, left)
  return { ok: true, write: writeOf(src) }
}
// ── 仓库四件 ──
// R1 取出（仓库→背包）：门 = petBag 有任意空槽（看全 12，与"上阵只看前 6"是两条规则，照搬）。
export function takeOut(src, grid, { index }) {
  if (src.readOnly()) return { ok: false, write: null }
  const bag = src.bag(), storage = src.storage()
  if (storage[index] == null) return { ok: false, write: null }
  let empty = -1
  for (let i = 0; i < BAG_SIZE; i++) if (bag[i] === EMPTY) { empty = i; break }
  if (empty < 0) return { ok: false, write: null, hint: { key: 'storage.pickReplace', args: [], level: 'warn' } }  // R2 前置
  bag[empty] = storage[index]
  storage.splice(index, 1)
  grid.refresh()
  return { ok: true, write: writeOf(src) }
}

// R3 放生：门在 L1（解 A13）—— host=normal 且 record.elite !== true 才可；View 灰化只是表现。
export function release(src, grid, { index }) {
  if (src.host() !== 'normal') return { ok: false, write: null, hint: { key: 'storage.releaseReadOnly', args: [], level: 'warn' } }
  const storage = src.storage()
  const pet = storage[index]
  if (pet == null) return { ok: false, write: null }
  if (isElite(pet)) return { ok: false, write: null, hint: { key: 'storage.releaseFavorited', args: [], level: 'warn' } }
  storage.splice(index, 1)
  grid.refresh()
  return { ok: true, write: writeOf(src), hint: { key: 'storage.released', args: [src.describePet?.(pet)?.name ?? ''], level: 'info' } }
}

// R4 收藏 / 取消收藏：写 record 的一个键 elite（不是容器）。
export function favorite(src, grid, { index }) {
  if (src.readOnly()) return { ok: false, write: null }
  const pet = src.storage()[index]
  if (pet == null) return { ok: false, write: null }
  pet.elite = !(pet.elite === true)
  return { ok: true, write: writeOf(src), hint: { key: pet.elite ? 'storage.favorited' : 'storage.unfavorited', args: [src.describePet?.(pet)?.name ?? ''], level: 'info' } }
}
