// 属性/等级纯函数 (与内核 pet.system.ts calcMaxHp/calcStatWithoutHp 严格同式; iv=31,ev=0, Hardy)
export const DEFAULT_IV = 31
export const DEFAULT_EV = 0

export function calcMaxHp(baseStat, level, iv = DEFAULT_IV, ev = DEFAULT_EV) {
  return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
}

export function calcStat(baseStat, level, iv = DEFAULT_IV, ev = DEFAULT_EV) {
  return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100 + 5)
}

// 经验曲线 (rules.json expCurve; PetExpSystem.cs TypeA/TypeB)
export function levelExp(curve, type, level) {
  const c = curve[type] ?? curve.A
  let e = c.a * level * level + c.b * level + c.c
  if (level % c.parityMod > 0) e += c.parityAdd
  if (level === 1 && c.lv1Extra) e += c.lv1Extra
  return Math.floor(e)
}

// 升到 level 所需累计经验 = Σ_{k=1}^{level-1} levelExp(k)
const totalExpCache = new Map()
export function totalExpToLevel(curve, type, level) {
  const key = `${type}:${level}`
  if (totalExpCache.has(key)) return totalExpCache.get(key)
  let sum = 0
  for (let k = 1; k < level; k++) sum += levelExp(curve, type, k)
  totalExpCache.set(key, sum)
  return sum
}

export function levelFromTotalExp(curve, type, exp, maxLevel = 100) {
  let lv = 1
  while (lv < maxLevel && totalExpToLevel(curve, type, lv + 1) <= exp) lv++
  return lv
}
