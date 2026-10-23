// L1 · 地图**传送 / 昼夜 / 落点**的**纯决议**（施工批 **MB5** / `docs/map/map-code-map.md §2.3`）。
//
// 内核只**出决议**，执行（切图 / 走位 / 弹窗）归编排层（`docs/map/map-teleport.md §3.2`、**TPI7**、决议 ③）。
// ⚠️ **过渡期口径（`map-impl.md D5`）**：两步走**继续用现有消息链**（`mapScene.js` 的 `mapWalk`/`mapEnter`），
//    **不碰 `MapRunner.as`**；所以这里**没有** `walkTo`/`onArrive`/`enterMap` 的**副作用实现**，
//    只有"该不该传 / 传到哪 / 落在哪"的**判断**。走位与真正切图仍由 `mapScene` + SWF 完成。
//
// 真值：`docs/map/map-teleport.md §3.2`（决议族）· `§3.3`（落点唯一一条）· `§3.4`（昼夜镜像）· `§3.5`（与 M2 的接缝）
//       `docs/map/map-impl.md §3.5`（MB5 蓝图）· `docs/map/map-code-map.md §5.4`
// 纪律：**TPQ4**（`mapId==0` ⇒ `notOpen`，内核不弹窗）· **TPC5/§3.4**（`switch ∉ {±1}` ⇒ 不传送）·
//       **TPI2/§3.3**（落点 = `spawn ?? 目标图 init`，**照搬**"光口不带落点"）·
//       **TPC1/TPC8**（畸形光口 ⇒ 登记 + 该条不产出、**不抛**）· **D3**（光口位置/名 = AS3、目标图 = Unity，**不混算**）
//
// ⚠️ 本件**不取数**（`M-5`）：目标图**存不存在**由调用方注入 `targetExists`（它才有 `content.loadMap`/探针）。

/** `"x,y"`（AS3 光口 pos 是字符串形）→ `{x,y}`；畸形 ⇒ `null`（TPC8：登记、不产出该条）。 */
function parsePos(s) {
  if (s == null) return null
  if (typeof s === 'object') return Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(String(s))
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}

/**
 * `teleport` 决议的分诊（`map-teleport.md §3.2`）：**`mapId === 0` ⇒ `notOpen`**，其余 ⇒ `teleport`。
 * ⚠️ 内核**不弹窗**、**不查活动**（**TPC6** / `TPQ4`）；"暂未开放"文案归 A3/R5。
 * @param {number} mapId  已解析的目标图 id（`resolve` 出的 `teleport.mapId`）
 * @returns {{kind:'notOpen', mapId:number} | {kind:'teleport', mapId:number}}
 */
export function decideTeleport(mapId) {
  const id = Number(mapId)
  if (!Number.isFinite(id)) return { kind: 'notOpen', mapId: 0 }   // 非数 ⇒ 当作未开放（上游本会抛，这里登记式降级）
  return id === 0 ? { kind: 'notOpen', mapId: 0 } : { kind: 'teleport', mapId: id }
}

/**
 * 昼夜镜像决议（`map-teleport.md §3.4`）。
 * @param {{id:number|string, switch:number}} record  当前图的 Unity 记录（`switch` 已解析期收窄 `0|±1`）
 * @param {(mapId:number)=>boolean} targetExists      调用方注入的"目标孪生图在不在"判据
 * @returns {{kind:'invalidSwitch'} | {kind:'missingMirror', wanted:number} | {kind:'mirror', dir:number, targetMapId:number}}
 */
export function decideMirror(record, targetExists) {
  const sw = record?.switch
  if (sw !== 1 && sw !== -1) return { kind: 'invalidSwitch' }        // TPC5：非 ±1 ⇒ 按钮不该出现、也不传送
  const cur = Number(record.id)
  const wanted = -cur                                                // 目标 = -currentMapId（§3.4；sign 不参与其它推导，TPI4）
  if (typeof targetExists === 'function' && !targetExists(wanted)) return { kind: 'missingMirror', wanted }
  return { kind: 'mirror', dir: sw, targetMapId: wanted }
}

/**
 * 落点规则（`map-teleport.md §3.3`，**唯一一条**）：`spawn ?? 目标图 init`。
 * ⚠️ `spawn` 只能来自 `changeScene('map',{mapId,spawn})` 的入参（**TPQ5** / OR4），**不是**键袋；生产侧实测 0 命中 ⇒ 恒走 `init`。
 * @param {{init?:{x:number,y:number}|null}} targetRecord  目标图 Unity 记录
 * @param {[number,number]|null} [spawn]                    一次性落点（消费即清）
 * @returns {{x:number,y:number}|null}
 */
export function landingSpot(targetRecord, spawn) {
  if (Array.isArray(spawn) && spawn.length >= 2) {
    const x = Number(spawn[0]), y = Number(spawn[1])
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  }
  return targetRecord?.init ?? null
}

/**
 * **两张边表**里的光口合并（`map-teleport.md §3.1` TPI9 + `map-impl.md D3` + **A2 obs-3**）：
 *   **位置 / 出口名 = AS3**（B3 已落的舞台坐标，两套坐标系**不可嫁接** ⇒ 不拿 Unity pos）；
 *   **目标图 = Unity `targetMapId`**（按光口 `id` 在同图内匹配；Unity 缺该 id ⇒ 保留 AS3 `target` 并登记一条）。
 *
 * ⚠️ 只做"取哪一列"的**归一**，不做落点/切图（那是别的决议）。畸形 pos 的条目**不产出**（TPC8）；重复 id **都保留**（TPC1 目标 = 不抛、两个都画）。
 *
 * ★**A2 / obs-3**：本件**只遍历 AS3** 会漏掉"AS3 无、Unity 有"的光口（实测 `990` 的 AS3 `teleports=[]`、Unity 有 3 条 ⇒ 图上一个光口都不出）。
 *   故新增可选入参 `unityNormalized` —— **L4 已按当前显示矩形把 Unity `pos` 归一化成舞台像素**的那批（**本件仍坐标无关、不 import app、不换算**，`M-5`），
 *   对**任何 AS3 侧没有同 id 的 Unity 光口**追加一条（位置/名取归一化值、目标取 `targetMapId`），并登记 `portal-unity-only`（不静默，仿 TPC8）。
 *   ⚠️ AS3 命中的 id 一律**沿用 AS3 位置**（D3，不混算）；本件对"目标图能不能进"**无判断**（那是 `decideTeleport` + L4 的事）。
 * @param {Array<{id:string, name?:string, pos:string, target:string}>} as3Teleports   `maps.json` 的光口（画面侧，舞台坐标）
 * @param {Array<{id:number, targetMapId:number|null}>} unityTeleports                 `loadMap` 记录的光口（规则侧，只用来按 id 取 `targetMapId`）
 * @param {(reason:string, raw:object)=>void} [log]                                    登记出口（解析/装配期）
 * @param {Array<{id:number|string, x:number, y:number, name?:string, targetMapId:number|null}>} [unityNormalized]  L4 归一化后的 Unity 光口（舞台像素），补 AS3∪Unity 并集
 * @returns {Array<{id:string, x:number, y:number, name:string, target:string, noUnity:boolean}>}
 */
export function mergePortals(as3Teleports, unityTeleports, log, unityNormalized) {
  const uById = new Map((unityTeleports || []).map((t) => [String(t.id), t]))
  const out = []
  const seen = new Set()                                             // AS3 已产出的光口 id（并集时不重复加 Unity 版）
  for (const a of as3Teleports || []) {
    const xy = parsePos(a.pos)
    if (!xy) { if (log) log('bad-portal-pos', a); continue }        // TPC8：畸形 ⇒ 该条不产出 + 登记
    const u = uById.get(String(a.id))
    const useUnity = u && u.targetMapId != null && Number.isFinite(Number(u.targetMapId))
    if (!u && log) log('portal-no-unity', a)                        // Unity 缺该 id ⇒ 保留 AS3 target（登记，不静默）
    seen.add(String(a.id))
    out.push({
      id: String(a.id),
      x: xy.x,
      y: xy.y,
      name: String(a.name ?? ''),                                     // 出口名 = AS3（MP8/D3）
      target: useUnity ? String(u.targetMapId) : String(a.target ?? ''), // 目标图 = Unity（缺则退回 AS3）
      noUnity: !useUnity,
    })
  }
  for (const un of unityNormalized || []) {                         // ★A2 并集：AS3 无同 id 的 Unity 光口 ⇒ 补一条（位置/名 = 归一化值）
    const id = String(un.id)
    if (seen.has(id)) continue                                      // AS3 已有 ⇒ 沿用 AS3 位置（D3，不覆盖）
    if (!Number.isFinite(un.x) || !Number.isFinite(un.y)) { if (log) log('bad-portal-pos', un); continue }  // 畸形不产出（TPC8）
    if (log) log('portal-unity-only', un)
    const t = un.targetMapId
    out.push({ id, x: un.x, y: un.y, name: String(un.name ?? ''), target: t != null && Number.isFinite(Number(t)) ? String(t) : '', noUnity: !(t != null && Number.isFinite(Number(t))) })
  }
  return out
}
