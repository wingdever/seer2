// 疑难指引面板装配口（L4 · C3·GuideLine）。对外只暴露 create(container, opts)，
// opts = { onClose, onNoob }（同 view/godpet 的注入口径；面板只读，无写动作可注入）。
import { buildGuidePanel } from './guidePanel.js'

export function create(container, opts = {}) {
  const ctrl = buildGuidePanel({ root: container, ...opts })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
