// 战后结算纯函数: 经验分配 / 升级 / 进化检测 / 抓捕掷点 / 逃跑概率。全部走 rules.json 参数, 掷点注入 rng 保可测。
import { levelExp, levelFromTotalExp, calcStat } from './stats.js'
import { petHpMax, makePet } from './session.js'

// totalExp = Σ_敌方 (beatExpParam/divisor) * levelExp(敌方等级)   (BattleResult.cs:174)
export function computeExp(rules, pets, enemies) {
  const div = rules.expSettle.divisor
  let total = 0
  for (const e of enemies) {
    const g = pets.growth[String(e.petId)] || pets.growth[e.petId]
    const param = g ? g.beatExpParam : 65
    total += (param / div) * levelExp(rules.expCurve, g ? g.expType : 'A', e.level)
  }
  return Math.floor(total)
}

// 均分给参战(出手过)的宠; 返回升级事件与待进化队列
export function awardExp(rules, pets, state, uids, enemies) {
  const events = []
  const total = computeExp(rules, pets, enemies)
  if (!uids.length || total <= 0) return { total: 0, share: 0, events }
  const share = Math.floor(total / uids.length)
  for (const uid of uids) {
    const pet = findAny(state, uid)
    if (!pet) continue
    const oldLv = pet.level
    pet.exp += share
    const g = pets.growth[String(pet.petId)] || pets.growth[pet.petId] || { expType: 'A' }
    const maxLv = rules.expCurve.maxLevel || 100
    const newLv = levelFromTotalExp(rules.expCurve, g.expType, pet.exp, maxLv)
    if (newLv > oldLv) {
      const oldMax = petHpMax(pets, pet)
      pet.level = newLv
      pet.hp += petHpMax(pets, pet) - oldMax   // 升级只补上限差, 不清伤
      events.push({ type: 'pet.levelup', uid: pet.uid, from: oldLv, to: newLv, hpMax: petHpMax(pets, pet) })
      detectEvolve(rules, pets, state, pet, g)
    }
  }
  events.push({ type: 'exp.awarded', total, share, uids: [...uids] })
  return { total, share, events }
}

// 进化检测: 非 ambiguous 且命中阈值 → 挂 pending 队列 (面板动画后置, 入队即算)
export function detectEvolve(rules, pets, state, pet, growth) {
  const g = growth || pets.growth[String(pet.petId)] || pets.growth[pet.petId]
  if (!g || g.ambiguous || !Array.isArray(g.evolve)) return null
  for (const e of g.evolve) {
    if (pet.level >= e.level && !state.evolve.pending.some(x => x.uid === pet.uid)) {
      state.evolve.pending.push({ uid: pet.uid, from: pet.petId, to: e.to, at: e.level })
      return { type: 'evolve.pending', uid: pet.uid, from: pet.petId, to: e.to }
    }
  }
  return null
}

// 手动/自动执行队首进化: 换 petId, 血量按新上限补差
export function applyEvolution(rules, pets, state, uid) {
  const i = state.evolve.pending.findIndex(x => x.uid === uid)
  if (i < 0) return null
  const job = state.evolve.pending[i]
  const pet = findAny(state, uid)
  if (!pet || pet.petId !== job.from) { state.evolve.pending.splice(i, 1); return null }
  const oldMax = petHpMax(pets, pet)
  pet.petId = job.to
  pet.name = String(pets.monsters[job.to]?.name ?? pet.name)
  pet.swfId = pets.monsters[job.to]?.swfId ?? pet.swfId
  pet.hp = Math.min(petHpMax(pets, pet), pet.hp + (petHpMax(pets, pet) - oldMax))
  state.evolve.pending.splice(i, 1)
  return { type: 'evolve.done', uid, from: job.from, to: job.to, name: pet.name }
}

// 血量损失档 (EffectAbilityHandler.cs Capture): lost = 1 - hp/max
export function hpBandMult(rules, lost) {
  for (const [edge, mult] of rules.capture.hpBands) if (lost <= edge + 1e-9) return mult
  return rules.capture.hpBands.at(-1)[1]
}

// 捕获概率 0-100: ballProb * hpBand; status 时 ÷statusDivisor; alwaysByIds / prob100 保底; maxWildLevel 门槛
export function captureProb(rules, ball, wild, statused = false) {
  if (rules.capture.alwaysByIds.includes(Number(wild.petId))) return 100
  if (ball.prob >= 100) return 100                      // 大师球无视血量档
  if (ball.maxWildLevel != null && wild.level > ball.maxWildLevel) return 0
  const lost = 1 - Math.max(0, wild.hp) / Math.max(1, wild.hpMax)
  let p = ball.prob * hpBandMult(rules, lost)
  if (statused) p = p / rules.capture.statusDivisor
  return Math.min(100, p)
}

export function captureRoll(rules, rng, ball, wild, statused = false) {
  const prob = captureProb(rules, ball, wild, statused)
  const roll = rng() * 100
  const success = roll < prob
  return { success, prob, roll }
}

// 逃跑: p = base + (我方spe/敌方spe - 1)*speWeight, clamp
export function escapeChance(rules, pets, myPet, wildPet) {
  const e = rules.escape || { base: 0.7, speWeight: 0.2, pMin: 0.3, pMax: 0.95 }
  const mm = pets.monsters[myPet.petId], wm = pets.monsters[wildPet.petId ?? wildPet.speciesId]
  const ms = mm ? calcStat(mm.stats.spe, myPet.level) : 1
  const ws = wm ? calcStat(wm.stats.spe, wildPet.level) : 1
  const p = e.base + (ms / Math.max(1, ws) - 1) * e.speWeight
  return Math.max(e.pMin, Math.min(e.pMax, p))
}

export function escapeRoll(rules, rng, pets, myPet, wildPet) {
  const chance = escapeChance(rules, pets, myPet, wildPet)
  return { success: rng() < chance, chance }
}

// 战斗中造野怪实例 (仅结算/掷点用; 内核宠由 glue 造)
export function wildInstance(pets, petId, level) {
  return makePet(pets, petId, level)
}

function findAny(state, uid) {
  return state.team.find(p => p.uid === uid) || state.box.find(p => p.uid === uid) || null
}
