// SPT Boss 面板 L4 渲染（C3·SPT · DOM 自绘最小 UI，spt-design SP1–SP3 / spt-impl §3；形状照 view/worldmap + view/dex 先例）。
// 纪律：零 import game/logic/**；传送/关闭一律经 opts 注入口（onGo/onClose）。零写档。
// 坐标系：真值表按 800×500 面板量得；宿主 shell 宽恒 960 但逻辑高随画布模式变（match 下 ≠ 540），
//   ⇒ 按钮位置**运行时按 map 区实测尺寸换算**（横 scale=zoneW/800、纵 sy=zoneH/500），不硬编 500px 盒高（位置误差人眼校，§4.10）。
import { el, text, petIconUrl, panelSprite, mountImg } from '../panels/battle/_kit.js'
import { SPT_PAGES, SPT_BOSSES, SPT_BOX_BG } from './bosses.js'

// buildSptPanel(ctx) → { render }。ctx = { root, page, onGo(mapId, boss), onHover(boss|null), onClose }
export function buildSptPanel(ctx) {
  const { root, onGo, onClose } = ctx
  const st = { page: Math.max(0, Math.min(SPT_PAGES.length - 1, Number(ctx.page) || 0)) }

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => { if (onClose) onClose() })

  const box = el('rb-spt-box')
  mountImg(box, panelSprite(SPT_BOX_BG), 'rb-spt-boxbg')

  const head = el('rb-spt-head')
  const titleEl = text('rb-spt-title', '')
  head.append(titleEl)
  const tabs = SPT_PAGES.map((p, i) => {
    const t = text('rb-spt-tab', p.name)
    t.addEventListener('click', () => { st.page = i; render() })
    head.append(t)
    return t
  })
  head.append(el('rb-spt-spacer'))
  const closeBtn = text('rb-spt-nav rb-spt-close', '✕')
  closeBtn.addEventListener('click', () => { if (onClose) onClose() })
  head.append(closeBtn)

  // map = 定位父（position:relative）：页 bg + 18 按钮 + 悬停气泡都挂这里，共用一套 offset 坐标。
  const map = el('rb-spt-map')
  box.append(head, map)
  root.append(scrim, box)

  const tip = el('rb-spt-tip')
  let bgEl = null
  const buttons = []   // { b, e }

  function layout() {
    const w = map.clientWidth, h = map.clientHeight
    if (!w || !h) return
    const s = w / 800
    const sy = h / 500   // 竖距按 zone 高/500 比例（zone 实测高 ≈ 450，非恒 500）
    if (bgEl) { bgEl.style.width = SPT_BG_W[st.page] * s + 'px'; bgEl.style.height = SPT_BG_H[st.page] * s + 'px' }
    for (const { b, e } of buttons) {
      const cx = 400 + b.parent[0] + b.btn[0]
      const cy = 250 - (SPT_PAGES[st.page].offset + b.parent[1] + b.btn[1])
      e.style.left = (w / 2 + (cx - 400) * s - b.size[0] * s / 2) + 'px'
      e.style.top = (h / 2 + (cy - 250) * sy - b.size[1] * s / 2) + 'px'
      e.style.width = b.size[0] * s + 'px'
      e.style.height = b.size[1] * s + 'px'
    }
  }

  function render() {
    titleEl.textContent = 'SPT 老大 · ' + SPT_PAGES[st.page].name
    tabs.forEach((t, i) => t.classList.toggle('rb-spt-on', i === st.page))
    hideTip()
    map.textContent = ''
    map.append(tip)
    buttons.length = 0
    bgEl = el('rb-spt-bg')
    mountImg(bgEl, panelSprite(SPT_PAGES[st.page].bg))
    map.append(bgEl)
    for (const b of SPT_BOSSES.filter(x => x.page === st.page)) map.append(bossEl(b))
    layout()
  }

  function bossEl(b) {
    const e = el('rb-spt-boss')
    mountImg(e, petIconUrl(b.bossId))
    e.append(text('rb-spt-bname', b.name))
    e.addEventListener('mouseenter', () => { showTip(b, e); if (ctx.onHover) ctx.onHover(b) })
    e.addEventListener('mouseleave', () => { hideTip(); if (ctx.onHover) ctx.onHover(null) })
    e.addEventListener('click', () => { if (onGo) onGo(b.mapId, b) })
    buttons.push({ b, e })
    return e
  }

  // 悬停气泡（SPQ6=A：宠名 → 目标图名；同 dex `rb-dex-tip` 口径，非模态、移开即散）。
  function showTip(b, host) {
    tip.textContent = b.name + ' → ' + b.mapId + ' ' + b.label
    tip.style.display = 'block'
    let left = host.offsetLeft + host.offsetWidth + 6
    if (left + tip.offsetWidth > map.clientWidth - 4) left = host.offsetLeft - tip.offsetWidth - 6   // 贴右缘 ⇒ 翻到左侧
    tip.style.left = Math.max(2, left) + 'px'
    tip.style.top = (host.offsetTop + 2) + 'px'
  }
  function hideTip() { tip.style.display = 'none' }

  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(map)
  render()
  return { render }
}

// 页 bg 的原生尺寸（实测【样本】Assets/Resources/Panels/SPTBoss/Sprites/*.png），按 scale 等比缩放。
const SPT_BG_W = [559, 544, 1469]
const SPT_BG_H = [259, 255, 510]
