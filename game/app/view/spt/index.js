// SPT Boss 面板装配口（L4 · C3·SPT）。对外只暴露 create(container, opts)，
// opts = { page, onGo(mapId, boss), onHover(boss|null), onClose }（同 view/worldmap 的注入口径）。
import { buildSptPanel } from './sptPanel.js'

export function create(container, opts = {}) {
  const ctrl = buildSptPanel({ root: container, ...opts })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
