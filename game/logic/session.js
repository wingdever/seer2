// 训练家本地会话态 (纯函数层, 零 DOM)。storage 由调用方注入 (浏览器 localStorage / 测试内存)。
import { calcMaxHp } from './stats.js'

export const SAVE_KEY_V2 = 'rocoshowdown.save.v2'
export const SAVE_KEY_V1 = 'rocoshowdown.save.v1'
export const TEAM_MAX = 6
export const BOX_MAX = 240

// pet 实例: { uid, petId, name, swfId, level, exp, hp }  (hpMax 一律现算, 不落盘)
export function petHpMax(pets, pet) {
  const m = pets.monsters[pet.petId]
  if (!m) return 1
  return calcMaxHp(m.stats.hp, pet.level)
}

let uidSeq = 0
export function resetUidSeq(n = 0) { uidSeq = n }
// 载入已有档后把计数器抬到 max(uid), 防止新抓宠与在队宠 uid 撞号
export function syncUidSeq(state) {
  let m = 0
  for (const p of [...(state.team || []), ...(state.box || [])]) {
    const n = Number(String(p.uid).replace(/^p/, ''))
    if (n > m) m = n
  }
  resetUidSeq(m)
}
export function makePet(pets, petId, level = 10) {
  const m = pets.monsters[petId]
  if (!m) throw new Error(`未知精灵 ${petId}`)
  const hpMax = calcMaxHp(m.stats.hp, level)
  return { uid: `p${++uidSeq}`, petId: Number(petId), name: String(m.name), swfId: m.swfId ?? Number(petId), level, exp: 0, hp: hpMax }
}

export function freshState() {
  return {
    v: 2,
    trainer: { name: '小赛尔', level: 1, coins: 5000, diamonds: 0 },
    team: [], box: [], items: [],
    dex: {},
    evolve: { pending: [] },
    battle: null,
  }
}

// v1: {name,level,coins,diamonds,bag:[petId],items:[{id,count}],petLevel}
export function migrateV1(v1, pets) {
  const s = freshState()
  s.trainer.name = v1.name ?? s.trainer.name
  s.trainer.level = v1.level ?? 1
  s.trainer.coins = v1.coins ?? 0
  s.trainer.diamonds = v1.diamonds ?? 0
  s.items = (v1.items ?? []).map(r => ({ id: r.id, count: r.count }))
  const lv = v1.petLevel || 10
  resetUidSeq(0)
  for (const id of v1.bag ?? []) {
    if (!pets.monsters[id]) continue
    const pet = makePet(pets, id, lv)
    if (s.team.length < TEAM_MAX) s.team.push(pet)
    else if (s.box.length < BOX_MAX) s.box.push(pet)
    s.dex[String(id)] = { seen: true, caught: true }
  }
  return s
}

export function loadSession(storage, pets, rules) {
  void rules
  const raw2 = storage.getItem(SAVE_KEY_V2)
  if (raw2) {
    try {
      const s = JSON.parse(raw2)
      if (s && s.v === 2) { syncUidSeq(s); return s }
    } catch (e) { /* 坏档当作无档重建 */ }
  }
  const raw1 = storage.getItem(SAVE_KEY_V1)
  if (raw1) {
    try {
      const v1 = JSON.parse(raw1)
      const s = migrateV1(v1, pets)
      saveSession(storage, s)
      return s
    } catch (e) { /* fallthrough */ }
  }
  const s = freshState()
  const starter = pets.monsters[1] ? 1 : Number(Object.keys(pets.monsters)[0])
  s.team.push(makePet(pets, starter, 10))
  s.dex[String(starter)] = { seen: true, caught: true }
  saveSession(storage, s)
  return s
}

export function saveSession(storage, state) {
  storage.setItem(SAVE_KEY_V2, JSON.stringify(state))
}

export function findPet(state, uid) {
  return state.team.find(p => p.uid === uid) || state.box.find(p => p.uid === uid) || null
}

// 收宠: 队伍有空先入队, 否则进仓库; 满则拒绝
export function addPet(state, pet) {
  if (state.team.length < TEAM_MAX) { state.team.push(pet); return 'team' }
  if (state.box.length < BOX_MAX) { state.box.push(pet); return 'box' }
  return 'full'
}

export function swapTeamBox(state, uid, toTeam) {
  const from = toTeam ? state.box : state.team
  const to = toTeam ? state.team : state.box
  if (to.length >= (toTeam ? TEAM_MAX : BOX_MAX)) return false
  const i = from.findIndex(p => p.uid === uid)
  if (i < 0) return false
  to.push(from.splice(i, 1)[0])
  return true
}

export function releasePet(state, uid) {
  for (const list of [state.team, state.box]) {
    const i = list.findIndex(p => p.uid === uid)
    if (i >= 0) { list.splice(i, 1); return true }
  }
  return false
}

export function countItem(state, itemId) {
  const r = state.items.find(x => x.id === itemId)
  return r ? r.count : 0
}

export function addItem(state, itemId, n = 1) {
  const r = state.items.find(x => x.id === itemId)
  if (r) r.count += n
  else state.items.push({ id: itemId, count: n })
}

export function consumeItem(state, itemId, n = 1) {
  const r = state.items.find(x => x.id === itemId)
  if (!r || r.count < n) return false
  r.count -= n
  if (r.count === 0) state.items = state.items.filter(x => x.id !== itemId)
  return true
}

// 战斗页离开前(如逃跑)回写内核 hp; 逃跑不结算经验
export function syncHp(state, pets, leftHp) {
  for (const pet of [...state.team, ...state.box]) {
    if (leftHp[pet.uid] != null) pet.hp = Math.max(0, Math.min(petHpMax(pets, pet), Math.round(leftHp[pet.uid])))
  }
}

export function dexSee(state, petId) {  const k = String(petId)
  state.dex[k] = { seen: true, caught: !!(state.dex[k] && state.dex[k].caught) }
}

export function dexCatch(state, petId) {
  state.dex[String(petId)] = { seen: true, caught: true }
}
