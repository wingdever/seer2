// Capture 阶段: 扔球判定。ball 用 index(rules.items.captureBalls 序) 或 itemId 指定。
// 成功 → 收宠入队/仓库 + 图鉴点亮 + 战斗以 capture 结束; 失败 → 消耗道具与回合, 战斗继续。
import { captureRoll } from '../settle.js'
import { makePet, addPet, dexCatch, consumeItem } from '../session.js'

export function findBall(rules, action) {
  const balls = rules.items.captureBalls
  if (action.ballIndex != null) return balls[action.ballIndex] || null
  if (action.itemId != null) {
    const hi = balls.findIndex(b => b.itemId != null && b.itemId === action.itemId)
    if (hi >= 0) return balls[hi]
    return null
  }
  return balls[0] || null
}

export function attemptCapture(deps, state, action) {
  const { rules, pets, rng } = deps
  if (!state.battle) throw new Error('不在战斗中, 无法抓捕')
  const ball = findBall(rules, action)
  if (!ball) throw new Error(`未知的胶囊 ${JSON.stringify(action)}`)
  if (ball.itemId != null && !consumeItem(state, ball.itemId)) throw new Error('胶囊数量不足')
  const wild = state.battle.wild
  const roll = captureRoll(rules, rng, ball, {
    petId: wild.petId, level: wild.level, hp: action.wildHp, hpMax: action.wildHpMax,
  }, !!action.statused)
  const events = [{ type: 'capture.roll', ball: ball.name, ...roll, turns: state.battle.turns + 1 }]
  state.battle.turns++   // 扔球消耗回合
  if (!roll.success) return events
  const pet = makePet(pets, wild.petId, wild.level)
  pet.hp = Math.max(1, Math.min(pet.hp, action.wildHp || pet.hp))
  const where = addPet(state, pet)
  if (where === 'full') {
    events.push({ type: 'capture.full', pet })
    return events
  }
  dexCatch(state, wild.petId)
  state.battle.captured = { petId: wild.petId, level: wild.level, uid: pet.uid, where }
  events.push({ type: 'capture.success', petId: wild.petId, level: wild.level, where, uid: pet.uid })
  events.push({ type: 'battle.end', outcome: 'capture', wild })
  return events
}
