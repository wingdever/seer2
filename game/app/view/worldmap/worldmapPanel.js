// 世界地图面板 L4 渲染（C3·WorldMap · DOM 自绘最小 UI，design WM4/§3.2；形状照 view/shop 先例）。
// 纪律：零 import game/logic/**；传送/提示一律经 opts 注入口（onGo/onLocked/onClose）。
import { el, text } from '../panels/battle/_kit.js'
import { WORLD_MAP_PAGES, WORLD_MAP_GROUPS, WORLD_MAP_PAGE_GROUPS, WORLD_MAP_BLOCKS } from './blocks.js'

// buildWorldMapPanel(ctx) → { render }。ctx = { root, currentMapId, worldId, onGo, onLocked, onClose }
export function buildWorldMapPanel(ctx) {
  const { root, currentMapId, worldId, onGo, onLocked, onClose } = ctx
  const st = { page: (Number(worldId) === 1 ? 1 : 0) }

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => { if (onClose) onClose() })

  const box = el('rb-wmap-box')
  const head = el('rb-wmap-head')
  const titleEl = text('rb-wmap-title', '')
  const prevBtn = text('rb-wmap-nav', '上一页')
  const nextBtn = text('rb-wmap-nav', '下一页')
  const closeBtn = text('rb-wmap-nav rb-wmap-close', '✕')
  prevBtn.addEventListener('click', () => { st.page = (st.page - 1 + WORLD_MAP_PAGES.length) % WORLD_MAP_PAGES.length; render() })
  nextBtn.addEventListener('click', () => { st.page = (st.page + 1) % WORLD_MAP_PAGES.length; render() })
  closeBtn.addEventListener('click', () => { if (onClose) onClose() })
  head.append(titleEl, el('rb-wmap-spacer'), prevBtn, nextBtn, closeBtn)

  const body = el('rb-wmap-body')
  box.append(head, body)
  root.append(scrim, box)

  function render() {
    titleEl.textContent = '世界地图 · ' + WORLD_MAP_PAGES[st.page]
    body.textContent = ''
    for (const g of WORLD_MAP_PAGE_GROUPS[st.page]) {
      const blocks = WORLD_MAP_BLOCKS.filter(b => b.page === st.page && b.group === g)
      if (!blocks.length) continue
      const group = el('rb-wmap-group')
      group.append(text('rb-wmap-gname', WORLD_MAP_GROUPS[g]))
      const grid = el('rb-wmap-grid')
      for (const b of blocks) grid.append(blockEl(b))
      group.append(grid)
      body.append(group)
    }
  }

  function blockEl(b) {
    const locked = b.mapId === 0
    const here = !locked && Number(b.mapId) === Number(currentMapId)
    const e = el('rb-wmap-block' + (locked ? ' rb-wmap-locked' : ''))
    e.append(text('rb-wmap-bname', b.name + (here ? '（在此）' : '')))
    e.append(text('rb-wmap-blabel', locked ? b.label : b.mapId + ' · ' + b.label))
    e.addEventListener('click', () => { if (locked) { if (onLocked) onLocked(b.mapId) } else if (onGo) onGo(b.mapId) })
    return e
  }

  render()
  return { render }
}
