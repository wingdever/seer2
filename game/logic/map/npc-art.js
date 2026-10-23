// L1 · NPC **真美术上屏**所需的**纯换算**（施工批 **B3** / `docs/view/scene/room/view-scene-map-content-impl.md`）。
//
// 只做三件事：① `resId`→取图 URL 的**三类映射**（B3 §3）；② Unity `size`→舞台像素的**尺寸换算**（B3 §5）；
// ③ sprite 贴到 `pos` 的**锚点常量**（B3 §5，与 `flipY` 同族、靠人眼校）。
// **无 DOM、无 fetch、无 import app**（`M-5`：`logic/**` 不 import `app/**`）；画布、装载、点击、走位循环全在 L4 `app/scenes/mapScene.js`。
//
// 真值：`AGENTS.md §4` 路线 A（参考画布 960×540、`fx=ux/960`、`fy=uy/540`，**误差靠人眼校**）
//       `docs/view/scene/room/view-scene-map-content-impl.md §3`（三类映射 = path 346 / npcId 238 / none 20，npcs 合计 604）
//       `game/core/map/map-table.ts:parseAssetRef`（`resIdKind` 六形状分类；本件只吃 `npcId`/`path` 两形，其余 ⇒ `null` 走占位）
//       上游 `Resources/` 布局【样本】：`Npc/<id>.png`（地图 NPC sprite）· `Pets/pet/<id>.png`·`Maps/mine/*`·`Items/*`…（全身/物件立绘）
// ⚠️ **不伪造内容**（B3 §0 铁律 4）：`none`（无图源）或取图 **404**（URL 出了、盘上没那张）⇒ L4 画**占位橙点**（沿用 MB6 增补），
//    本件只出 URL/尺寸/锚点，**不判"在不在"**（存在判据 = L4 的 `Image.onload/onerror`，与 `portalImg`/`bgc` 同规）。

import { parseAssetRef } from '../../core/map/map-table.js'   // ★A2：头像 resId 与 NPC 共用同一套形状分类（一份实现、两处不漂移）

const REF_W = 960                                      // 重启参考画布宽（同 `js-view.js`，两套换算共用一图）
const REF_H = 540                                      // 重启参考画布高
const ART_ROOT = '/projects/Seer2-Restart-Lite-main/Resources'   // 浏览器直接 fetch（dev server 服务仓库根；同 `js-view.js` 的 `BG_DIR` 父目录）
// 野怪**对话气泡表情**的基址（MDB10）：素材住在 Unity 工程的 `Assets/StaticResources/Sprites/Map/talk bubble/`
// （台账 `docs/asset-inventory.md` **AS42** = 24 png `emoji/toon/*` + 7 jpg `emoji/meme/*`，实测**全在盘**）。
// ⚠️ 目录名**带空格** ⇒ URL 里必须写成 `%20`（`tools/serve.mjs` 服务端 `decodeURIComponent` 后落到真实目录）；
//    id 那一侧被 `talkImageUrl` 的白名单限死成 `[a-z0-9_/]` ⇒ **不再需要编码**（口径同 `view/hud/restartHudView.js` 的 `ASSETS` 前缀）。
const TALK_BUBBLE_DIR = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map/talk%20bubble'

/**
 * 一条 NPC（`entity.buildEntities` 的产物，含 `resId`/`resIdKind`）→ **可 fetch 的绝对 URL**；
 * 无图源（`none`/`builtin`/`mod`/`expr`/畸形）⇒ `null`（L4 走占位橙点，**不瞎猜路径**）。
 * 实测 604 只 npcs 只落 `npcId`/`path`/`none` 三类 ⇒ 只接前两形（B3 §3）。
 */
export function npcArtUrl(npc) {
  const k = npc?.resIdKind
  const raw = npc?.resId
  if (k == null || raw == null) return null
  if (k === 'npcId') return `${ART_ROOT}/Npc/${raw}.png`                                   // 238 条：地图 NPC sprite
  if (k === 'path') return `${ART_ROOT}/${/\.png$/i.test(String(raw)) ? raw : raw + '.png'}`   // 346 条：全身立绘/物件（含 `.png` 原样、缺则补）
  return null                                                                              // none(20) / builtin / mod / expr ⇒ 无真图
}

/** 这只 NPC 有没有真图源（`null` ⇒ L4 画占位，不等 fetch 就已知）。 */
export function npcHasArt(npc) { return npcArtUrl(npc) != null }

/**
 * ★`MDB12`：一只 NPC 的 `resId` → **宠物形象 id**（帧包桥的入参）；不是宠物立绘形状 ⇒ `null`。
 * 形状判据 = `kind === 'path'` 且形如 `Pets/pet/<数字>`，**扩展名可有可无**（实测 `visual="animation"` 那 14 条写作
 * `Pets/pet/10022`、**不带 `.png`**，其余带）⇒ 两条都认。
 * ⚠️ **本件不判"有没有 swf"**：形象 id → `swf` 序号是**取数侧**的事，由 L2 `content.swfIdOf()`（桥 =
 *   `game/data/pet_appearance_swf.csv`）答，`null` ⇒ L4 回退重启 PNG（`AGENTS §4.19`：不伪造）。
 * ⚠️ **只对野怪问这一步**（判据在 L4：`n.wild` 为真）⇒ 普通 NPC 一律不碰帧包通路。
 */
export function petAppearanceId(npc) {
  if (npc?.resIdKind !== 'path') return null
  const m = /^Pets\/pet\/(\d+)(?:\.png)?$/i.exec(String(npc.resId ?? '').trim())
  return m ? Number(m[1]) : null
}

/**
 * ★A2：一条**对话头像** resId 原串（`<branch @icon>`，如 `Pets/pet/407`）→ 可 fetch 的绝对 URL。
 * 复用 `parseAssetRef` 的同一套形状分类（`MDI4`：一份实现、两处不漂移）⇒
 *   · `npcId`（纯数字）⇒ `Npc/<id>.png`；`path`（带路径）⇒ 补 `.png`；
 *   · 其余（`none`/`builtin`/`mod`/`expr`/空/畸形）⇒ `null`（L4 **不伪造**、对话框只显名字）。
 */
export function iconUrl(raw) {
  const { kind } = parseAssetRef(raw)
  const s = String(raw ?? '').trim()
  if (kind === 'npcId') return `${ART_ROOT}/Npc/${s}.png`
  if (kind === 'path') return `${ART_ROOT}/${/\.png$/i.test(s) ? s : s + '.png'}`
  return null
}

/**
 * 一条**对话气泡表情** id（`<wild><talk><self image="emoji/toon/angry">`，实测**一律不带扩展名**）
 * → 可 fetch 的**绝对 URL**（MDB10 / `docs/map/map-impl.md §7.3.32`）。
 *
 * 路径口径 = 上游 `GetTalkImage` + `NormalizeImageId`（正本 `docs/map/map-move.md §2.7`）：
 * 基址 `Sprites/Map/talk bubble/{id}` ⇒ **去尾部扩展名**、**禁 `..`**。
 * 扩展名 = **`toon ⇒ .png` / `meme ⇒ .jpg`**（31 个 distinct id 实测**完美二分**，不需要"先试 png 再试 jpg"）。
 * ⚠️ **不伪造**：id 畸形（含 `..` / 以 `/` 开头 / 不在 `emoji/{toon,meme}/` 下 / 字符集外）⇒ **`null`**
 *   ⇒ L4 **不出泡 + 一行日志**（照上游"取不到图 ⇒ LogWarning、不退回文本"，`AGENTS §2` 决议 ② 同口径）。
 */
export function talkImageUrl(id) {
  const s = String(id ?? '').trim()
  if (!s) return null
  const bare = s.replace(/\.[A-Za-z0-9]+$/, '')              // 上游 NormalizeImageId：去扩展名
  if (bare.includes('..') || bare.startsWith('/')) return null
  const m = /^emoji\/(toon|meme)\/([a-z0-9_]+)$/.exec(bare)  // 白名单 = 盘上那 31 张所在的两个目录
  if (!m) return null
  return `${TALK_BUBBLE_DIR}/${m[0]}.${m[1] === 'toon' ? 'png' : 'jpg'}`
}

/**
 * Unity `size`（`<npc size="x,y">`，单位 = 参考画布 960×540）→ **舞台像素**（与 `unityToStage` 同比例，各自等比）。
 * 缺 `size` / `(0,0)` ⇒ `null`（L4 兜底 = 图自身 naturalSize × `NPC_FALLBACK_SCALE`）。
 * @param {{dx:number, dy:number, dw:number, dh:number}} rect  bg 绘制矩形（= `M.jsView.rect`，与光口/占位标记同一张）
 */
export function npcSizeInStage(npc, rect) {
  const sx = npc?.size?.x
  const sy = npc?.size?.y
  if (!(sx > 0 && sy > 0)) return null
  return { w: (sx / REF_W) * rect.dw, h: (sy / REF_H) * rect.dh }
}

// sprite 贴到 `pos` 的**锚点**（B3 §5，第二条靠人眼校的常量，接 `flipY` 先例）：
// `{ax:0, ay:1}` = **左下角**贴 `pos`（对齐上游 `Npc.prefab` 的 RectTransform pivot=(0,0)，
// `NpcView.SetPosition` 把 `pos` 钉在 NPC 包围盒左下角；原点画布左下、y 向上）；
// L4 `drawImage` 左上 = `(x - ax*w, y - ay*h)`。锚点方向若反 ⇒ 人测指出即调这里。
export const NPC_ANCHOR = { ax: 0, ay: 1 }

export { ART_ROOT, REF_W, REF_H }
