// Turn 阶段: 回合记账 + 参战者登记 (回合判定在内核, 这里只管元数据)
export function recordTurn(deps, state, action) {
  if (!state.battle) return []
  state.battle.turns++
  for (const uid of action.actorUids || []) {
    if (!state.battle.participants.includes(uid)) state.battle.participants.push(uid)
  }
  return [{ type: 'battle.turn', n: state.battle.turns }]
}
