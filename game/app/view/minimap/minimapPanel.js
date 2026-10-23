// 小地图面板 L4 渲染（C3·MiniMap · DOM 自绘 + 上游 PNG 摆位，minimap-design MM2；形状照 view/worldmap 先例）。
// 纪律：零 import game/logic/**；传送/提示一律经 opts 注入口（onGo/onLocked/onClose）。
// 坐标口径：blocks.js 里全是「面板框绝对像素」（原点 = 框左上、y 向下），本文件只做两件事 ——
// 框在 960×540 逻辑画布内居中（MM2 摆位）、标签框夹回框内（⚠️ 偏差 ①），其余不重算。
import { el, text, mountImg } from '../panels/battle/_kit.js'
import { MINI_MAP_LABEL_W, MINI_MAP_LABEL_H } from './blocks.js'

const ASSETS = '/projects/Seer2-Restart-Lite-main/Assets/'
const assetUrl = (p) => ASSETS + String(p).replace(/ /g, '%20')
const CANVAS_W = 960
const CANVAS_H = 540
const TITLE_LAYER = 'StaticResources/Sprites/Map/map title.png'

// place：把节点摆成 [x,y,w,h]（绝对、不保持宽高比 = 与上游 Image 同做法）。
function place(node, x, y, w, h) {
  Object.assign(node.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' })
  return node
}

// buildMiniMapPanel(ctx) → { render }。ctx = { root, panel, currentMapId, onGo, onLocked, onClose }
// panel = blocks.js 里那一块（MINI_MAP_PANELS[category]），查找与"缺类目不弹面板"由 index.js/mapScene 负责。
export function buildMiniMapPanel(ctx) {
  const { root, panel, currentMapId, onGo, onLocked, onClose } = ctx
  const { w, h, title, close, layers, blocks } = panel

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => { if (onClose) onClose() })

  const box = el('rb-mmap-box', { left: ((CANVAS_W - w) / 2) + 'px', top: ((CANVAS_H - h) / 2) + 'px', width: w + 'px', height: h + 'px' })

  // ── 图层（底图 / 路径线 / 装饰点）：数组顺序 = 渲染顺序，后摆盖先摆 ──
  let titleRect = null
  for (const [src, x, y, lw, lh] of layers) {
    place(mountImg(box, assetUrl(src), 'rb-mmap-img'), x, y, lw, lh)
    if (src === TITLE_LAYER) titleRect = [x, y, lw, lh]
  }
  // 页标题 = 上游 TMP 文字，压在标题条图正中（title=null ⇒ 不画，不伪造）。
  if (title && titleRect) {
    const t = text('rb-mmap-title', title)
    place(t, titleRect[0], titleRect[1] + 6, titleRect[2], titleRect[3] - 6)
    box.append(t)
  }

  // ── 悬停气泡：内容 = 上游 SetInfoPromptText 那串；无文案 ⇒ 不显示（MM5，不伪造）──
  const tip = el('rb-mmap-tip')
  function showTip(b, ev) {
    const hover = b[10]
    if (!hover) { hideTip(); return }
    tip.textContent = hover
    tip.style.display = 'block'
    const r = box.getBoundingClientRect()
    const k = r.width / w                       // 宿主 scale（DOM 像素 / 逻辑像素）
    const px = (ev.clientX - r.left) / k
    const py = (ev.clientY - r.top) / k
    let left = px + 10                           // 上游偏移 +(10,2)
    let top = py + 2
    const tw = tip.offsetWidth
    if (left + tw > CANVAS_W - 4) left = px - tw - 10   // 贴右缘 ⇒ 翻到指针左侧，不被画布裁
    tip.style.left = (Number(box.style.left.replace('px', '')) + left) + 'px'
    tip.style.top = (Number(box.style.top.replace('px', '')) + top) + 'px'
  }
  function hideTip() { tip.style.display = 'none' }

  // ── 热区方块：图标铺满 + 点击 = 传送 / mapId=0 = 置灰提示（照上游"能点的才点"）──
  for (const b of blocks) {
    const [, label, mapId, icon, x, y, bw, bh] = b
    const locked = Number(mapId) === 0
    const here = !locked && Number(mapId) === Number(currentMapId)
    const cell = place(el('rb-mmap-block' + (locked ? ' rb-mmap-block--locked' : '') + (here ? ' rb-mmap-block--here' : '')), x, y, bw, bh)
    cell.dataset.mid = 'mmap:' + mapId
    if (icon) place(mountImg(cell, assetUrl(icon), 'rb-mmap-icon'), 0, 0, bw, bh)
    if (here) cell.append(text('rb-mmap-here', '在此'))
    cell.title = (label || b[0]) + ' → 地图 ' + mapId + (locked ? '（未开放）' : '')
    cell.addEventListener('click', () => { if (locked) { if (onLocked) onLocked(mapId) } else if (onGo) onGo(mapId) })
    cell.addEventListener('pointerenter', (ev) => showTip(b, ev))
    cell.addEventListener('pointermove', (ev) => showTip(b, ev))
    cell.addEventListener('pointerleave', hideTip)
    box.append(cell)
  }

  // ── 区名标签：120×25 文字框，出框的夹回框内（实测仅 MiniMap4/6/11 各 1 条轻微出框）
  //    摆在热区之后 = 压在图标之上（上游 TMP 与 Image 的层级同理）；
  //    `lx/ly = null` ⇒ 上游根本没有 Title 节点（`MiniMap100` 的 9 个内联钮）⇒ **不画**（名字本就烘在底图里）──
  for (const b of blocks) {
    const label = b[1]
    if (!label || b[8] === null || b[9] === null) continue
    const lx = Math.max(0, Math.min(b[8], w - MINI_MAP_LABEL_W))
    const ly = Math.max(0, Math.min(b[9], h - MINI_MAP_LABEL_H))
    box.append(place(text('rb-mmap-label', label), lx, ly, MINI_MAP_LABEL_W, MINI_MAP_LABEL_H))
  }

  // ── 关闭钮：三种形状照上游（cancel.png 底居中 / Green Esc 右上 / 40×40）──
  if (close) {
    const [src, x, y, cw, ch] = close
    const btn = place(el('rb-mmap-close'), x, y, cw, ch)
    place(mountImg(btn, assetUrl(src), 'rb-mmap-img'), 0, 0, cw, ch)
    btn.addEventListener('click', () => { if (onClose) onClose() })
    box.append(btn)
  }

  root.append(scrim, box, tip)
  return { render: () => {} }
}
