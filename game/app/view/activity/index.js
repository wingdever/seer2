// 活动面板装配口（L4 · C4·Activity）。对外只暴露 create(container, opts)，
// opts = { onClose, onLink(info) }（同 view/worldmap 的注入口径；跳转决议归装配层 mapScene，视图不判）。
// 视图件不 import game/logic/**（arch-code 3 规则 #3）：本面板纯展示 + 发 onLink 信号，无 L1 交易件注入。
import { buildActivityPanel } from './activityPanel.js'

export function create(container, opts = {}) {
  const ctrl = buildActivityPanel({ root: container, onClose: opts.onClose, onLink: opts.onLink })
  return { update: ctrl.render, destroy: () => { container.textContent = '' } }
}
