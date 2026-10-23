// 小地图面板装配口（L4 · C3·MiniMap）。对外只暴露 has(category) + create(container, opts)，
// opts = { category, currentMapId, onGo(mapId), onLocked(mapId), onClose }（同 view/worldmap 的注入口径）。
// 「预制不存在的类目 ⇒ 不弹面板、只提示」= MM1，落点在这里（has），上游那条"一律回退飞船图"的 bug 不照搬（报告 A1 / 决议 ②）。
import { buildMiniMapPanel } from './minimapPanel.js'
import { MINI_MAP_PANELS } from './blocks.js'

export const MINI_MAP_CATEGORIES = Object.keys(MINI_MAP_PANELS).map(Number)

export function has(category) {
  return !!MINI_MAP_PANELS[Number(category)]
}

export function create(container, opts = {}) {
  const ctrl = buildMiniMapPanel({ root: container, panel: MINI_MAP_PANELS[Number(opts.category)], ...opts })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
