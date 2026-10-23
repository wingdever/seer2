// Item 阶段: 药剂判定 (原版恢复量=固定点数)。hp 落点由内核侧执行 (页面拿事件后 K.setHp/K.setRage), 这里只消耗与算量。
import { consumeItem, petHpMax, findPet } from '../session.js'

export function findPotion(rules, action) {
  const pools = [rules.items.heals, rules.items.rage, rules.items.combo || []]
  if (action.itemId != null) {
    for (const pool of pools) {
      const it = pool.find(x => x.itemId === action.itemId)
      if (it) return it
    }
    return null
  }
  if (action.potionIndex != null) {
    const flat = [...rules.items.heals, ...(rules.items.rage || [])]
    return flat[action.potionIndex] || null
  }
  return null
}

export function usePotion(deps, state, action) {
  const { rules, pets } = deps
  if (!state.battle) throw new Error('不在战斗中, 无法使用道具')
  const pot = findPotion(rules, action)
  if (!pot) throw new Error(`未知的药剂 ${JSON.stringify(action)}`)
  if (!consumeItem(state, pot.itemId)) throw new Error('道具数量不足')
  const pet = findPet(state, action.uid)
  if (!pet) throw new Error(`找不到我方宠 ${action.uid}`)
  const max = petHpMax(pets, pet)
  const cur = action.currentHp != null ? Math.max(0, Math.min(max, action.currentHp)) : pet.hp
  let heal = 0
  if (pot.healAmount != null) heal = Math.min(max - cur, pot.healAmount)
  state.battle.turns++   // 道具消耗回合
  return [{
    type: 'item.potion', uid: pet.uid, item: pot.name,
    heal, targetHp: cur + heal, rage: pot.rageAmount || 0,
  }]
}
