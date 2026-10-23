// Map.cs 的图模型（`Assets/Scripts/Scene Specific/Map/Map.cs`，210 行）的**纯函数面**。
// 本件只落四样（地图线施工批 **MB2** / `MDB2-a` 的 L0 半边）：
//   1) **类型** —— `MapRecord`（L1 现场解析出的一条；字段正本 = `docs/map/map-data.md §3.2`）/ `EntityKind` / `AssetRef`
//   2) **图标识** `identifierOf`（`Map.GetMapIdentifier`，`Map.cs:189-201`）—— 八个可读键 + `_ => 0` 兜底
//   3) **两种 id 判据** —— `isModId`（`Map.IsMod`，`Map.cs:47`）与 `isMirrorId`（新命名，**与 mod 分开**，MC4）
//   4) **`resId` 六形状分类** `parseAssetRef`（MDI4 / MDI5：**只分类、不拼接、不求值**）
//
// 纪律（地图线 L0）：零第三方依赖 / 不读 JSON / 不碰时钟·随机·渲染（**MP1–MP3**）。
// ⚠️ L0 **不产出** `MapRecord` —— 产出它的是 L1 `game/logic/map/parse-map.js`（**方案 C**：运行时现场解析）。
//    本件只声明**形状**，供 L0 的 `condition.ts` / `action.ts` 消费。
//
// 真值：`docs/map/map-data.md §2.5`（resId 六形状）· `§3.2`（字段清单）· `§3.3`（本件轮廓）
//       `docs/map/map-code-map.md §2.2`（本件导出）· `§5.2`（接口）
//       `docs/map/map-design.md §6 MC4`（两类 id 判据分开命名）

/** 七类实体（`MapEntities`，`docs/map/map-data.md §2.3`）。 */
export type EntityKind = 'teleport' | 'npc' | 'farm' | 'animal' | 'pond' | 'insect' | 'nest'

/** 七类实体的**运行时顺序**（照录上游 `MapEntities` 的容器顺序；排期只按 `npc` + `teleport`，MDI6）。 */
export const ENTITY_KINDS: readonly EntityKind[] = ['teleport', 'npc', 'farm', 'animal', 'pond', 'insect', 'nest']

/**
 * `resId` 的**六形状**分类（`docs/map/map-data.md §2.5`）。
 * ⚠️ `expr`（`[expr]` 段）只是"**该求值**"的标记 —— **求值本身不在这里**（MDI5：L0 零运行时求值）。
 */
export type AssetKind = 'none' | 'npcId' | 'path' | 'builtin' | 'mod' | 'expr'

/** `parseAssetRef` 的返回值：**原串 + 分类**（原串是合同的一部分，MDI4）。 */
export interface AssetRef {
  raw: string
  kind: AssetKind
}

/**
 * L1 `game/logic/map/parse-map.js` 现场解析出的**一条图记录**。
 * 字段正本 = `docs/map/map-data.md §3.2`（此处只声明本件与 L0 消费方用得到的列；
 * 其余列（`music` / `geometry` / 实体数组的细分…）以 §3.2 为准，走 `[k: string]` 兜底）。
 */
export interface MapRecord {
  id: number
  name: string | null
  category: number
  worldId: number
  /** `category ∈ {1,2,100}`（上游 `MapCategory` 三值）才为 `true`；MDC5。 */
  worldIdKnown?: boolean
  weather: number
  /** 收窄后的昼夜开关（`0 | 1 | -1`）；畸形值已被解析器收到 `0`（M5 §3.4 / TPC5）。 */
  switch: 0 | 1 | -1
  /** 畸形原值；**只为审计**（内核不许读，M5 §3.4）。 */
  switchRaw?: number
  dream: boolean
  bgColor?: string
  resId: number | null
  pathId: number | null
  fightMap?: number | null
  fightMapColor?: string | null
  init?: { x: number; y: number } | null
  /** Unity 坐标系（主列；消费方只用它，MDI3）。 */
  initUnity?: { x: number; y: number } | null
  /** AS3 坐标系（并存列；**内核不许读**，M5 TPQ1）。 */
  initAs3?: { x: number; y: number } | null
  anim?: Record<string, string> | null
  swf?: string | null
  swfOk?: boolean
  entities?: Record<string, unknown>
  _source?: string
  [k: string]: unknown
}

/** `Map.GetMapIdentifier`（`Map.cs:189-201`）的八个可读键（顺序照上游 switch）。 */
export const MAP_IDENTIFIER_KEYS: readonly string[] = ['id', 'resId', 'weather', 'category', 'world', 'switch', 'dream', 'anim']

/**
 * `Map.GetMapIdentifier`（`Map.cs:189-201`）—— 条件的 `map.<key>` 臂读它。
 * 八个键 + **`_ => 0` 兜底**（未登记的键 ⇒ `0`，不抛；MP7）。
 *
 * ⚠️ `"anim"`：上游读的是 `resources?.anim`（**运行时资源**，不是数据，`Map.cs:198`）。
 *    我们没有"资源已加载"这一面 ⇒ 目标行为 = **读"数据里有没有 `<anim>`"**（0/1）—— 与上游**不同**，**MDQ3**。
 * ⚠️ `"switch"`：读**收窄后**的 `map.switch`（不是 `switchRaw`）—— `71` 那张图在解析期已收成 `0`（M5 §3.4）。
 */
export function identifierOf(map: MapRecord | null | undefined, key: string): number {
  if (!map) return 0
  switch (key) {
    case 'id': return map.id ?? 0
    case 'resId': return map.resId ?? 0
    case 'weather': return map.weather ?? 0
    case 'category': return map.category ?? 0
    case 'world': return map.worldId ?? 0
    case 'switch': return map.switch ?? 0
    case 'dream': return map.dream ? 1 : 0
    case 'anim': return map.anim == null ? 0 : 1
    default: return 0
  }
}

/**
 * `Map.IsMod(int)`（`Map.cs:47`）：`id < -50000 || id === 0`。
 * ⚠️ 阈值是 **-50000** —— 与 `NpcInfo.IsMod(string)` 的 **-5000100**（`resId` 那条）**不是同一个数**，别混。
 */
export function isModId(id: number): boolean {
  return id < -50000 || id === 0
}

/**
 * **镜像图**判据（新命名；`id < 0 && !isModId(id)`）。
 * ⚠️ 上游**没有**这个名字 —— 它把"负 id"与"mod"混在一个 `IsMod` 里；我们要 **MC4：两类分开命名**，
 * 因为镜像图（M5 的昼夜镜像）与 mod 图（`< -50000`）是**两种东西**，消费方要能区分。
 */
export function isMirrorId(id: number): boolean {
  return id < 0 && !isModId(id)
}

/** `NpcInfo.IsMod(string)`（`NpcInfo.cs:58-63`）的阈值 —— 注意与 `isModId` 的 `-50000` **不同**。 */
const RES_MOD_ID_MAX = -5000100

/**
 * `resId` 六形状分类（`NpcInfo.GetIcon`，`NpcInfo.cs:65-78`；正本 = `docs/map/map-data.md §2.5`）。
 *
 * 由 L1 `game/logic/map/parse-map.js` 的 `resIdKind` **搬来这里**（一份实现，两处不漂移）——
 * 分类顺序**照抄上游**，**不做拼接、不做运行时求值**（MDI4 / MDI5）：
 *   ① 哨兵串四件套（`""` / `"0"` / `"null"` / `"none"`）⇒ `none`
 *   ② 纯数字 ⇒ `npcId`（**素材层**才拼 `Npc/` 前缀）
 *   ③ 带路径的图片名 ⇒ `path`（**原样保留**，含 `.png`）
 *   ④ `Builtin/` ⇒ `builtin`
 *   ⑤ `Mod/` 或 `<= -5000100` 的数 ⇒ `mod`
 *   ⑥ 分段里带 `[expr]` ⇒ `expr`（只标记"要求值"）
 */
export function parseAssetRef(raw: unknown): AssetRef {
  const s = raw == null ? '' : String(raw).trim()
  let kind: AssetKind
  if (s === '' || s === '0' || s === 'null' || s === 'none') kind = 'none'            // ① 哨兵串四件套
  else if (s.startsWith('Mod/')) kind = 'mod'                                        // ⑤（前缀形态）
  else if (/^-?\d+$/.test(s) && Number(s) <= RES_MOD_ID_MAX) kind = 'mod'            // ⑤（数字形态）
  else if (s.startsWith('Builtin/')) kind = 'builtin'                               // ④
  else if (s.includes('[')) kind = 'expr'                                           // ⑥
  else if (/^\d+$/.test(s)) kind = 'npcId'                                          // ②（素材层拼 `Npc/`）
  else kind = 'path'                                                                // ③ 原样保留
  return { raw: s, kind }
}
