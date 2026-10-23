// Encounter 阶段: 开一场野怪遭遇战, 立 state.battle 上下文
import { dexSee } from '../session.js'

export function startEncounter(deps, state, action) {
  const { pets } = deps
  const { petId, level, slot, back, map } = action.wild
  const m = pets.monsters[petId]
  if (!m) throw new Error(`遭遇未知精灵 ${petId}`)
  state.battle = {
    kind: 'wild',
    wild: { petId: Number(petId), level: Number(level), slot, back, map },
    participants: [],   // 出手过的我方 uid
    turns: 0,
    startedAt: Date.now(),
  }
  dexSee(state, petId)
  return [{ type: 'encounter.start', wild: state.battle.wild, name: String(m.name) }]
}
