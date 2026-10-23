// L1 · **缺 SWF 画面的图**用 JS 回退渲染所需的**纯数学**（施工批 **A2** / `docs/map/map-impl.md §7.3.7`）。
//
// 只做"Unity 960×540 逻辑坐标 → 舞台像素"这一条换算，外加 bg 取图键/路径。**无 DOM、无 fetch、无 import app**
// （`M-5`：`logic/**` 不 import `app/**`）；画布、取图、点击、走位循环全在 L4 `app/scenes/mapScene.js`。
//
// 真值：`AGENTS.md §4` 路线 A（`fx = ux/960`、`fy = uy/540`，参考画布 960×540，**误差靠人眼校**）
//       `docs/map/map-data.md §3`（Unity `pos` 值域 x∈[25,880] y∈[45,455]，**左下角锚定**）
//       `docs/map/map-code-map.md MDI3`（两套坐标系**不混算**：Unity 用这套、AS3 舞台那套另走）
//       上游 `ResourceManager.cs:601/631`（底图键 = `resId==0 ? id : resId`，路径 `Maps/bg/{key}`）
// ⚠️ `unityToStage` 的 **Y 翻转**（Unity 左下 vs 舞台左上）是本批唯一需人眼校的常量 ⇒ `flipY` 做成开关，颠倒就翻。

const REF_W = 960                                      // 重启参考画布宽（MapSceneView.ReferenceCanvasSize）
const REF_H = 540                                      // 重启参考画布高
const STAGE_W = 1200                                   // 舞台（= 现有 overlay 画布缓冲尺寸）
const STAGE_H = 660
const BG_DIR = '/projects/Seer2-Restart-Lite-main/Resources/Maps/bg'   // 浏览器直接 fetch（dev server 服务仓库根）

/** 底图取图键 = `rec.resId ?? rec.id`（对齐 `ResourceManager.cs:601`；`resId` 为 `0` 时 parse 已置 `null` ⇒ 退回 id）。 */
export function bgKeyOf(rec) { return String(rec?.resId ?? rec?.id ?? '') }

/** 底图 URL（`.png`；实测 272/272 覆盖，个别超大/比例不一 ⇒ 用 `fitBg` 适配）。 */
export function bgUrlOf(rec) { return `${BG_DIR}/${bgKeyOf(rec)}.png` }

/**
 * contain 适配：整张 bg **完整**放进舞台（不裁、不变形），letterbox 留边（由 L4 铺底色）。
 * @returns {{dx:number, dy:number, dw:number, dh:number}}  bg 在舞台上实际绘制的矩形
 */
export function fitBg(bgW, bgH, stageW = STAGE_W, stageH = STAGE_H) {
  if (!(bgW > 0 && bgH > 0)) return { dx: 0, dy: 0, dw: stageW, dh: stageH }   // 图没到/坏 ⇒ 退成整舞台（不 NaN）
  const s = Math.min(stageW / bgW, stageH / bgH)
  const dw = bgW * s, dh = bgH * s
  return { dx: (stageW - dw) / 2, dy: (stageH - dh) / 2, dw, dh }
}

/**
 * 路线 A 的一条换算：Unity 逻辑坐标（960×540、左下锚定）→ 某矩形内的舞台像素。
 * ⚠️ `flipY` = `true` 时按"Unity 左下、舞台左上"翻转 Y（本批默认）；若人眼看到光口上下颠倒 ⇒ 传 `false`。
 * @param {{dx:number, dy:number, dw:number, dh:number}} rect  目标矩形（JS 路 = bg 绘制矩形；SWF 路 = 整舞台）
 */
export function unityToStage(ux, uy, rect, flipY = true) {
  const ny = flipY ? (1 - uy / REF_H) : (uy / REF_H)
  return { x: rect.dx + (ux / REF_W) * rect.dw, y: rect.dy + ny * rect.dh }
}

/**
 * 一条 Unity 记录 + 一个绘制矩形 → JS 视图的**光口表 + 起点**（本件只出数据，不上屏）。
 * 光口取 `rec.entities.teleports`（Unity `pos` 归一化进 `rect`、目标 = `targetMapId`、名 = `@name`）；
 * 起点 = `rec.init`（`landingSpot` 的另一半在 L4，spawn 优先）归一化；缺 init ⇒ `start=null`（L4 兜底）。
 * @param {{dx:number, dy:number, dw:number, dh:number}} rect  bg 的 `fitBg` 矩形
 * @param {{flipY?:boolean}} [opt]
 * @returns {{ spots:Array<{x:number, y:number, target:string, label:string}>, start:{x:number,y:number}|null, name:string|null }}
 */
export function buildJsView(rec, rect, opt = {}) {
  const flipY = opt.flipY !== false
  const spots = []
  for (const t of rec?.entities?.teleports || []) {
    const p = t && t.pos
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue          // 畸形 pos ⇒ 跳过该条（TPC8 口径）
    const s = unityToStage(p.x, p.y, rect, flipY)
    spots.push({ x: s.x, y: s.y, target: t.targetMapId != null ? String(t.targetMapId) : '', label: String(t.name ?? '') })
  }
  const init = rec && rec.init
  const start = init && Number.isFinite(init.x) && Number.isFinite(init.y)
    ? (() => { const s = unityToStage(init.x, init.y, rect, flipY); return { x: s.x, y: s.y } })()
    : null
  return { spots, start, name: (rec && rec.name) ?? null }
}
