// 世界地图面板装配口（L4 · C3·WorldMap）。对外只暴露 create(container, opts)，
// opts = { currentMapId, worldId, onGo(mapId), onLocked(mapId), onClose }（同 view/shop 的注入口径）。
import { buildWorldMapPanel } from './worldmapPanel.js'

export function create(container, opts = {}) {
  const ctrl = buildWorldMapPanel({ root: container, ...opts })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
