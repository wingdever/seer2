// Identifier.cs 的可注入部分 —— core/ 必须 headless, 所以凡是要碰 Player.instance / BattleState /
// Pet / Buff / Skill 的分支都走 IdentifierHost 由外部实现; 这里只把「与运行时无关」的骨架
// (random 系列 + 前缀分派 + 兜底 GetNumIdentifier) 逐行照搬。
// 依据: Assets/Scripts/System/Parser/Identifier.cs:10-33 (GetNumIdentifier), 35-188 (GetIdentifier 无上下文版)

import type { Rng } from '../rng.ts'
import { toIntRange, trimParentheses, tryParseFloat, tryTrimStart } from '../strutil.ts'

export interface IdentifierHost {
  rng: Rng
  /** Player.instance.random —— 进程级场景 KV, **不落盘**(上游 Player.cs:37 的 private static sceneData; Identifier.cs:15-26 的 random[old]/random[new]) */
  getPlayerRandom(): number
  setPlayerRandom(v: number): void
  /** date.year / date.month / … —— 按 C# 用本地时区的 DateTime.Now */
  getDate(part: string): number
  /** player.<x> 里 gameData 暴露的那两个 (shoot / achievement), 其余回落 host.numIdentifier */
  getPlayerData(key: string): number | null
  /** 其它一切前缀 (pet./battle./buff[..]/item[..].num/…) 由战斗侧实现; 返回 null = 不认识 */
  resolve?(id: string): number | null
}

/**
 * Identifier.GetNumIdentifier —— 唯一没有上下文的标识符解析, 也是所有链路的兜底终点。
 * C# 原文只有 random 一个前缀 + `float.TryParse ? num : 0`, 注意「失败返回 0」这条被
 * Helper.ToFloatList 用来判定整表解析失败, 不能改成 NaN。
 */
export function getNumIdentifier(id: string, host: IdentifierHost): number {
  const t = tryTrimStart(id, 'random')
  if (t.ok) {
    const trimId = t.trim
    if (trimId === '') return host.rng.nextInt(0, 100)          // Random.Range(0, 100) —— int 重载 = 闭区间
    if (trimId === '[old]') return host.getPlayerRandom()
    if (trimId === '[new]') {
      const v = host.rng.nextInt(0, 100)
      host.setPlayerRandom(v)
      return v
    }
    const list = toIntRange(trimParentheses(trimId))
    return list.length ? list[Math.floor(host.rng.next01() * list.length)] : 0   // ListHelper.Random()
  }
  const n = tryParseFloat(id)
  return n === null ? 0 : n
}

/**
 * Identifier.GetIdentifier (无 effect 版, Identifier.cs:35-188)。
 * 分支顺序照抄 —— 顺序本身就是语义: 'random' 不在这里处理 (它只在带 effect 的那版里做括号区间),
 * 而 'player.' 必须在 'data.' 之前, 否则 "player.data.x" 会被截错。
 */
export function getIdentifier(id: string, host: IdentifierHost): number {
  id = id.replaceAll('－', '-')

  let t = tryTrimStart(id, 'date.')
  if (t.ok) {
    const k = t.trim
    switch (k) {
      case 'year': case 'month': case 'day': case 'hour': case 'minute':
      case 'second': case 'millisecond': case 'dayOfWeek':
        return host.getDate(k)
      default:
        return getNumIdentifier(k, host)
    }
  }

  t = tryTrimStart(id, 'player.')
  if (t.ok) {
    const k = t.trim
    const v = host.getPlayerData(k)
    if (v !== null) return v
    return getNumIdentifier(k, host)
  }

  if (host.resolve) {
    const v = host.resolve(id)
    if (v !== null) return v
  }
  return getNumIdentifier(id, host)
}
