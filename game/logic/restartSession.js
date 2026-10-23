// 重启原生存档 (v3) —— 纯函数层 (零 DOM)。storage 由调用方注入 (浏览器 localStorage / 测试 memStorage)。
// 与官方 session.js 的关系: 形状相近但**独立一份** —— 官方 v2 逐字节不动, 两宇宙各存各档、互不覆盖。
// 数值权威全部经 `auth` 注入 (场景用 content.buildRestartAuth(rules) 组装):
//   auth = { hpMax(petId,level), nameOf(petId), swfIdOf(petId),
//            exp:{ beatExpParamOf, expTypeOf, levelExpAt, levelFromTotalExp, evolveOf, settleDivisor, _source } }
// pet 形状精简: {uid, petId, level, exp, hp}; name/swfId/hpMax 一律现算 (auth.*), **不落盘** —— 宇宙换表不过期。
export const SAVE_KEY_V3 = 'rocoshowdown.restart.v3'
export const TEAM_MAX = 6
export const BOX_MAX = 240

let uidSeq = 0
export function resetUidSeq(n = 0) { uidSeq = n }
// 载入已有档后把计数器抬到 max(uid), 防止新造宠与在队宠 uid 撞号
export function syncUidSeq(state) {
  let m = 0
  for (const p of [...(state.team || []), ...(state.box || [])]) {
    const n = Number(String(p.uid).replace(/^p/, ''))
    if (n > m) m = n
  }
  resetUidSeq(m)
}

export function freshState() {
  return {
    v: 3,
    trainer: { name: '小赛尔', level: 1, coins: 0, diamonds: 0 },
    team: [], box: [], items: [],
    shop: { bought: {} },
    dex: {},
    evolve: { pending: [] },
    battle: null,
    // 溯源戳: HP/进化=重启权威; exp 曲线**系数**仍借官方 A/B 形状 (待内核 S6)
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }
}

// 新宠: hp 直接取重启 iv=0 上限 (满血入场)
export function makeRestartPet(auth, petId, level = 10) {
  const hp = Math.max(1, Math.round(auth.hpMax(petId, level)))
  return { uid: `p${++uidSeq}`, petId: Number(petId), level, exp: 0, hp }
}

export const restartHpMax = (auth, pet) => Math.max(1, Math.round(auth.hpMax(pet.petId, pet.level)))

export function loadRestartSession(storage, auth, { starterId = 1, starterLevel = 10 } = {}) {
  const raw = storage.getItem(SAVE_KEY_V3)
  if (raw) {
    try {
      const s = JSON.parse(raw)
      if (s && s.v === 3) { syncUidSeq(s); return s }
    } catch (e) { /* 坏档当作无档重建 */ }
  }
  const s = freshState()
  resetUidSeq(0)
  s.team.push(makeRestartPet(auth, starterId, starterLevel))
  s.dex[String(starterId)] = { seen: true, caught: true }
  saveRestartSession(storage, s)
  return s
}

export function saveRestartSession(storage, state) {
  storage.setItem(SAVE_KEY_V3, JSON.stringify(state))
}

// ── 结构操作 (与 session.js 同逻辑, 独立一份, 不动官方) ──
export function findPet(state, uid) {
  return state.team.find(p => p.uid === uid) || state.box.find(p => p.uid === uid) || null
}
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
export function dexSee(state, petId) {
  const k = String(petId)
  state.dex[k] = { seen: true, caught: !!(state.dex[k] && state.dex[k].caught) }
}
export function dexCatch(state, petId) {
  state.dex[String(petId)] = { seen: true, caught: true }
}

// ── 结算 (v3 重启权威回写; 镜像 phases/settle.js:endBattle, 但全程走 auth) ──
// action = { outcome:'win'|'lose'|'capture', leftHp:{uid→hp}, uids:[参战 uid], wild:{petId,level}, enemies? }
export function settleRestart(auth, state, action) {
  const events = []
  const { outcome, leftHp = {} } = action
  const enemies = action.enemies || (action.wild ? [action.wild] : [])
  if (action.wild) dexSee(state, action.wild.petId)  // 图鉴「见过」记重启 id

  // hp 回写: 夹到重启 iv=0 上限
  for (const pet of [...state.team, ...state.box]) {
    if (leftHp[pet.uid] != null) {
      pet.hp = Math.max(0, Math.min(Math.round(auth.hpMax(pet.petId, pet.level)), Math.round(leftHp[pet.uid])))
    }
  }

  if (outcome === 'win' || outcome === 'capture') {
    events.push(...awardExpRestart(auth, state, action.uids || [], enemies))
    if (outcome === 'capture') dexCatch(state, action.wild.petId)
  }
  if (outcome === 'lose') {
    for (const pet of state.team) pet.hp = restartHpMax(auth, pet)
    events.push({ type: 'team.healed', authority: 'unity-iv0' })
  }

  // 进化入队后统一 apply (结算尾, 与官方 auto-evolve 同口径)
  for (const job of [...state.evolve.pending]) {
    const done = applyEvolutionRestart(auth, state, job.uid)
    if (done) events.push(done)
  }

  const result = {
    ts: Date.now(),
    wild: action.wild || null,
    outcome,
    captured: outcome === 'capture' ? (action.captured || action.wild) : null,
    turns: state.battle?.turns || 0,
  }
  state.battle = null
  events.push({ type: 'battle.settled', outcome, result })
  return { events, result }
}

// 均分给参战宠; exp 曲线借官方 A/B 形状 (auth.exp._source), beatExpParam/expType 取重启权威
function awardExpRestart(auth, state, uids, enemies) {
  const events = []
  const act = uids.filter(uid => state.team.some(p => p.uid === uid))
  if (!act.length || !enemies.length) return events
  const div = auth.exp.settleDivisor
  let total = 0
  for (const e of enemies) {
    total += (auth.exp.beatExpParamOf(e.petId) / div) * auth.exp.levelExpAt(auth.exp.expTypeOf(e.petId), e.level)
  }
  total = Math.floor(total)
  if (total <= 0) return events
  const share = Math.floor(total / act.length)
  for (const uid of act) {
    const pet = findPet(state, uid)
    if (!pet) continue
    const oldLv = pet.level
    pet.exp += share
    const newLv = auth.exp.levelFromTotalExp(auth.exp.expTypeOf(pet.petId), pet.exp)
    if (newLv > oldLv) {
      const oldMax = Math.round(auth.hpMax(pet.petId, pet.level))
      pet.level = newLv
      pet.hp += Math.max(0, Math.round(auth.hpMax(pet.petId, pet.level)) - oldMax)  // 升级只补上限差, 不清伤
      events.push({ type: 'pet.levelup', uid, from: oldLv, to: newLv, hpMax: restartHpMax(auth, pet) })
      detectEvolveRestart(auth, state, pet)
    }
  }
  events.push({ type: 'exp.awarded', total, share, uids: [...act], curve: auth.exp._source })
  return events
}

function detectEvolveRestart(auth, state, pet) {
  const list = auth.exp.evolveOf(pet.petId)
  for (const e of list) {
    if (pet.level >= e.at && !state.evolve.pending.some(x => x.uid === pet.uid)) {
      state.evolve.pending.push({ uid: pet.uid, from: pet.petId, to: e.to, at: e.at })
      return { type: 'evolve.pending', uid: pet.uid, from: pet.petId, to: e.to }
    }
  }
  return null
}

function applyEvolutionRestart(auth, state, uid) {
  const i = state.evolve.pending.findIndex(x => x.uid === uid)
  if (i < 0) return null
  const job = state.evolve.pending[i]
  const pet = findPet(state, uid)
  if (!pet || pet.petId !== job.from) { state.evolve.pending.splice(i, 1); return null }
  const oldMax = Math.round(auth.hpMax(pet.petId, pet.level))
  pet.petId = job.to
  const newMax = Math.round(auth.hpMax(pet.petId, pet.level))
  pet.hp = Math.min(newMax, pet.hp + Math.max(0, newMax - oldMax))
  state.evolve.pending.splice(i, 1)
  return { type: 'evolve.done', uid, from: job.from, to: job.to, name: auth.nameOf(job.to) }
}
