// 逻辑层唯一对外入口: dispatch(deps, state, action) → events[] (同步纯函数, state 就地可变)
// deps = { rules, pets, rng }  — rng 来自 rng.js makeRng(seed), 测试可播种。
import { startEncounter } from './encounter.js'
import { recordTurn } from './turn.js'
import { attemptCapture } from './capture.js'
import { usePotion } from './item.js'
import { endBattle } from './settle.js'
import { escapeRoll } from '../settle.js'
import { findPet } from '../session.js'

const ROUTES = {
  'encounter.start': startEncounter,
  'battle.turn': recordTurn,
  'capture.attempt': attemptCapture,
  'item.use': usePotion,
  'battle.end': endBattle,
}

export function escapeAttempt(deps, state, action) {
  const { rules, pets, rng } = deps
  if (!state.battle) throw new Error('不在战斗中, 无法逃跑')
  const me = findPet(state, action.uid) || state.team[0]
  const wild = state.battle.wild
  const r = escapeRoll(rules, rng, pets, me, wild)
  state.battle.turns++
  if (r.success) {
    state.battle = null
    return [
      { type: 'escape.result', ...r },
      { type: 'escape.ok', wild },
    ]
  }
  return [{ type: 'escape.result', ...r }]
}
ROUTES['escape.attempt'] = escapeAttempt

export function dispatch(deps, state, action) {
  const fn = ROUTES[action.type]
  if (!fn) throw new Error(`logic: 未知 action ${action.type}`)
  return fn(deps, state, action)
}
