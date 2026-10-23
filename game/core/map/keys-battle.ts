// `battle.` 条件命名空间的**键表**（施工批 **MB7** / `MDB6-e`；真值 = `docs/map/map-battle-trigger.md §2.12`）。
//
// L0（`MP3` 纯）：不碰战斗内核、不取时钟/随机，只把**一份战斗快照**（`lastBattle = { settings, result }`）
//   翻成 `MapEnv.battleState.identifier(key)`（`condition.ts` A7 在 `battle.` 臂的调用点，`condition.ts:466`）。
//   ⇒ 43 条含 `battle.` 的 `<condition>`（含 `50004` 战斗外那 2 条）可算（**BTI9** / **BTQ1** 的读窗口）。
//
// 两半（M3 §命名空间表里 `battle.` 那一臂的正本）：
//   · `BattleSettings.GetSettingsIdentifier`（`BattleSettings.cs:99-119`）= **14 键** + 两条特殊臂（`mode` 把 `Record(-1)` 报 `PVP(2)`、`captureLevel` 在 `!capture` 报 `-1`）
//   · `BattleResult.GetResultIdentifier`（`BattleResult.cs:35-51`）= **8 键** + `capturePet.<x>` 透传（`capturePet==null ⇒ -1`）
//   两者未知键 ⇒ **`float.MinValue`**（`_ => float.MinValue`）。
//
// ⚠️ **BTC11 的修法（统一两条失败模式）**：上游条件层 `battle==null ⇒ op!="="`、表达式层**无条件解引用**（NRE）。
//    本件一律 ⇒ **无数据 ⇒ `FLOAT_MIN`**（`condition.ts` 用数值比较 ⇒ `=x` 假、`≠x` 真，正合上游条件层语义），**不再有 NRE 面**。
// ⚠️ **本快照只含 `settings` + `result`**：`battle.turn` / `battle.me.*` / `battle.op.*` 等要**活战斗态**（归 **E1/E5**），
//    快照里没有 ⇒ 一律 `FLOAT_MIN`（速通/暴击/伤害挑战那批 winHandler 条件当前恒不满足 ⇒ 已登记为等 E1/E5，不瞎猜）。

/** C# `float.MinValue` 的 JS 等价（比较哨兵，非业务值）。 */
export const FLOAT_MIN = -3.4028235e38

const b01 = (v: unknown): number => (v ? 1 : 0)

/** 快照里 `settings` 的形状（= `parse-map.js` 的 `settingsOf` 产物；本件只读、不重解析）。 */
export interface BattleSettingsSnapshot {
  count?: number; parallel?: number; star?: number; time?: number
  mode?: number; rule?: number; weather?: number; captureLevel?: number
  mod?: boolean; simulate?: boolean; escape?: boolean; item?: boolean; capture?: boolean
  [k: string]: unknown
}
/** 快照里 `result` 的形状（`BattleResult.cs:19-51` 的谓词 + `capturePet`；E6/编排层填）。 */
export interface BattleResultSnapshot {
  state?: number; fightPetCount?: number
  isEnd?: boolean; isKO?: boolean; isEscape?: boolean; isCapture?: boolean
  isMyWin?: boolean; isOpWin?: boolean
  capturePet?: { id?: number; level?: number; baseId?: number; [k: string]: unknown } | null
  [k: string]: unknown
}
export interface BattleSnapshot {
  settings?: BattleSettingsSnapshot | null
  result?: BattleResultSnapshot | null
}

/** `BattleSettings.GetSettingsIdentifier`（14 键，含两条特殊臂）。 */
function settingsIdentifier(s: BattleSettingsSnapshot | null | undefined, sub: string): number {
  if (!s) return FLOAT_MIN
  switch (sub) {
    case 'mode': return s.mode === -1 ? 2 : (s.mode ?? 0)                 // ★`Record(-1)` 报成 `PVP(2)`（:103）
    case 'rule': return s.rule ?? 0
    case 'petCount': return s.count ?? 6
    case 'parallelCount': return s.parallel ?? 1
    case 'starLimit': return s.star ?? 0
    case 'time': return s.time ?? 10
    case 'weather': return s.weather ?? 0
    case 'mod': return b01(s.mod)
    case 'simulate': return b01(s.simulate)
    case 'escape': return b01(s.escape)
    case 'item': return b01(s.item)
    case 'capture': return b01(s.capture)
    case 'captureLevel': return s.capture ? (s.captureLevel ?? 1) : -1    // ★`!isCaptureOK ⇒ -1` 哨兵（:115）
    case 'reveal': return 0                                              // `isReveal` 依赖 Photon ⇒ 联机出局，恒 0
    default: return FLOAT_MIN
  }
}

/** `BattleResult.GetResultIdentifier`（8 键 + `capturePet.<x>` 透传）。 */
function resultIdentifier(r: BattleResultSnapshot | null | undefined, sub: string): number {
  if (!r) return FLOAT_MIN
  if (sub === 'capturePet' || sub.startsWith('capturePet.')) {
    const cp = r.capturePet
    if (!cp) return -1                                                    // `capturePet==null ⇒ -1`（:38-39）
    const key = sub === 'capturePet' ? 'id' : sub.slice('capturePet.'.length)
    const v = (cp as Record<string, unknown>)[key]
    return typeof v === 'number' && Number.isFinite(v) ? v : FLOAT_MIN
  }
  switch (sub) {
    case 'state': return r.state ?? FLOAT_MIN
    case 'fightPetCount': return r.fightPetCount ?? FLOAT_MIN
    case 'isEnd': return b01(r.isEnd)
    case 'isKO': return b01(r.isKO)
    case 'isEscape': return b01(r.isEscape)
    case 'isCapture': return b01(r.isCapture)
    case 'isMyWin': return b01(r.isMyWin)
    case 'isOpWin': return b01(r.isOpWin)
    default: return FLOAT_MIN
  }
}

/**
 * 一条 `battle.` 键（**已剥前缀** `battle.`，即 `condition.ts` 传进来的 `key`）→ 数值。
 *
 * ★**路由**（§2.12：`battle.<x>` 被补成 `state.<x>` 再分派 ⇒ `result.` / `settings.` 两条前缀等价、裸键按 settings）：
 *   · `result.<sub>`（或 `state.result.<sub>`）⇒ 结果表
 *   · `settings.<sub>`（或裸 `mode`/`rule`/…）⇒ 设置表
 *   · 其余（`turn` / `me.` / `op.` / `last.` / `pet.buff` / `status` / `skill` …）⇒ 活战斗态，快照没有 ⇒ `FLOAT_MIN`
 */
export function battleIdentifier(snapshot: BattleSnapshot | null | undefined, key: string): number {
  if (!snapshot) return FLOAT_MIN
  let k = key
  if (k.startsWith('state.')) k = k.slice(6)                              // 路由夹层（`battle.`→补 `state.`）剥掉
  if (k.startsWith('result.')) return resultIdentifier(snapshot.result, k.slice(7))
  if (k.startsWith('settings.')) return settingsIdentifier(snapshot.settings, k.slice(9))
  // 裸设置键（`mode`/`captureLevel`/…）；结果谓词在数据里总是带 `result.`，故裸键一律按设置表
  const v = settingsIdentifier(snapshot.settings, k)
  return v
}

/**
 * 把一份战斗快照包成 `MapEnv.battleState`（`{identifier(key): number|'unknown'}`）。
 * L4 在回图/战斗外**总是**注入它（即便 `lastBattle` 为空 ⇒ 一切键 `FLOAT_MIN`）⇒ 统一 BTC11 的两条失败模式。
 */
export function makeBattleView(snapshot: BattleSnapshot | null) {
  return { identifier: (key: string) => battleIdentifier(snapshot, key) as number | 'unknown' }
}
