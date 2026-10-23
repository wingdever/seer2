// Settle 阶段: 战斗结束 → 经验/升级/进化入队, hp 回写, 失败全愈
import { awardExp } from '../settle.js'
import { petHpMax } from '../session.js'

export function endBattle(deps, state, action) {
  if (!state.battle) throw new Error('不在战斗中')
  const { rules, pets } = deps
  const outcome = action.outcome
  const events = []
  const enemies = action.enemies || [state.battle.wild]

  // hp 回写: 内核战斗宠 uid→hp 由页面传入 (leftHp)
  const leftHp = action.leftHp || {}
  for (const pet of [...state.team, ...state.box]) {
    if (leftHp[pet.uid] != null) pet.hp = Math.max(0, Math.min(petHpMax(pets, pet), Math.round(leftHp[pet.uid])))
  }

  if (outcome === 'win' || outcome === 'capture') {
    const uids = (action.uids && action.uids.length ? action.uids : state.battle.participants)
      .filter(uid => state.team.some(p => p.uid === uid))
    const r = awardExp(rules, pets, state, uids, enemies)
    events.push(...r.events)
    // caught 只由抓捕点亮 (dexCatch in capture phase); 打赢仅 seen
  }
  if (outcome === 'lose') {
    for (const pet of state.team) pet.hp = petHpMax(pets, pet)
    events.push({ type: 'team.healed' })
  }
  const result = {
    ts: Date.now(),
    wild: state.battle.wild,
    outcome,
    captured: outcome === 'capture' ? state.battle.captured : null,
    turns: state.battle.turns,
  }
  state.battle = null
  events.push({ type: 'battle.settled', outcome, result })
  return events
}
