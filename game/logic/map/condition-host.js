// `MapEnv` 的 **L1 装配**：把"真状态"接成 `core/map/condition.ts` 要的注入面（施工批 **MB3** / `MDB3-b`）。
//
// 真值：`docs/map/map-condition.md §3.4`（`MapEnv` 轮廓）+ `docs/map/map-code-map.md §2.3/§5.4`
//
// ⚠️ **本件只做适配、不取数**（依赖规则 `M-5`：`logic/**` 不许 import `app/**`）：
//    来源由 **L4 传进来**（`MapEnvSource`），本件不认识会话 / 存档 / 路由 / 面板。
//    谁把真状态填成 `MapEnvSource`：**`game/app/scenes/mapScene.js`**（MB5 接线；本线只提接缝请求 R-4/R-8）。
//
// ⚠️ **两处数值缝加宽成三值**（与 design §3.4 的写法不同 ⇒ 已在 as-built 登记）：
//    `items.count` 与 `player.shoot`/`player.achievement` 允许返回 `'unknown'` —— 因为这条线的原则是
//    **"取不到就说不知道"**（`CSI4`：上游正是把"不知道"说成了 `0`）。缺来源时给 `undefined` 即可。

import { identifierOf } from '../../core/map/map-table.js'
import { evalCondition, parseConditions } from '../../core/map/condition.js'

/**
 * @typedef {object} MapEnvSource  来源面（L4 填）—— 每项对应 `MapEnv` 上的一缝；
 *   缺省兜底见 `createMapEnv`（保守：能说 `'unknown'` 的绝不说 `0`）。
 * @property {{identifier(key: string): number|'unknown'}} [map]
 * @property {(id: number) => (string|'unknown')} [npcTint]
 * @property {Array<{identifier(key: string): number|'unknown'}|null>} [petBag]
 * @property {{get(id: string, key: string): (string|undefined)}} [activities]
 * @property {{get(id: string, key: string): (number|undefined)}} [missions]
 * @property {{identifier(key: string): number|'unknown'}|null} [battleState]
 * @property {{count(id: number, bag?: 'yite'): number|'unknown'}} [items]
 * @property {{get(key: string): unknown}} [sceneData]
 * @property {{pet?: {identifier(key: string): number|'unknown'}}} [selection]
 * @property {{shoot: number|'unknown', achievement: number|'unknown'}} [player]
 * @property {{read(): number, consume(): number, roll(min: number, max: number): number, emblem?(): boolean}} [rng]
 * @property {{unknown(why: string): void}} [log]
 */

/** 落不到实现的宠切片：一切键 `'unknown'`（**D6 落地前的占位**；MB5 可以先拿它接起来）。 */
export const UNIMPLEMENTED_PET = { identifier: () => 'unknown' }

/** 空袋（`activities`/`missions` 的兜底）：任何键都取不到 ⇒ 条件走值里的 `[default]`。 */
export const EMPTY_BAG = { get: () => undefined }

/**
 * A2 的图视图：`record` = `content.loadMap(id)` 现场解析出的一条（方案 C）⇒ 直接走 L0 `identifierOf`
 * （8 键白名单由 L0 在解析期校验，这里不再判一遍）。
 */
export function mapViewOf(record) {
  return { identifier: (key) => identifierOf(record, key) }
}

/**
 * `MapEnvSource` → `MapEnv`（纯适配；不取数、不落盘、不弹窗）。
 *
 * 缺省策略（保守，`CSI4`）：
 *   · `map` / `items` / `player` 缺 ⇒ 恒 `'unknown'`（**不是 `0`**）；
 *   · `petBag` 缺 ⇒ `[UNIMPLEMENTED_PET]`；`activities`/`missions` 缺 ⇒ 空袋；`battleState` 缺 ⇒ `null`；
 *   · `rng` 缺 ⇒ **不摇也不推进**（`read`/`consume` 给 `0`、`roll` 给区间下限）并记一条日志；
 *   · `log` 缺 ⇒ `console.warn`（D8：运行时登记走 `MapEnv.log`，默认不许静默）。
 */
export function createMapEnv(src = {}) {
  const log = src.log ?? { unknown: (why) => console.warn('[map/condition]', why) }
  const rng = src.rng ?? {
    read: () => { log.unknown('missing-source: rng.read'); return 0 },
    consume: () => { log.unknown('missing-source: rng.consume'); return 0 },
    roll: (min) => { log.unknown('missing-source: rng.roll'); return min },
  }
  return {
    rng,
    map: src.map ?? { identifier: () => 'unknown' },
    npcRuntime: src.npcTint ? { tint: src.npcTint } : undefined,
    petBag: src.petBag ?? [UNIMPLEMENTED_PET],
    activities: src.activities ?? EMPTY_BAG,
    missions: src.missions,
    battleState: src.battleState ?? null,
    items: src.items ?? { count: () => 'unknown' },
    sceneData: src.sceneData ?? { get: () => undefined },
    selection: src.selection,
    player: src.player ?? { shoot: 'unknown', achievement: 'unknown' },
    log,
  }
}

/**
 * 便捷入口：条件**文本数组** → 三值真值（`parseConditions` + `evalCondition`）。
 * ⚠️ **每次调用都重新解析** —— 只给"点一下算一次"的路径用；按钮**构造期**应当
 * `parseConditions(texts)` 一次、之后只 `evalCondition(expr, env)`（`CSI6`/`CSI7`）。
 */
export function evalConditionTexts(texts, src) {
  return evalCondition(parseConditions(texts), createMapEnv(src))
}
