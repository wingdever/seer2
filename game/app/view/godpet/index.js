// 灵兽面板装配口（L4 · C1·godpet）。对外只暴露 create(container, opts)，
// opts = { state(), onFight(type), onShop, onGetKing, onClose }（同 view/spt 的注入口径）。
import { buildGodpetPanel } from './godpetPanel.js'

export function create(container, opts = {}) {
  const ctrl = buildGodpetPanel({ root: container, ...opts })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
