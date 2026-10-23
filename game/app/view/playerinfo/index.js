// 个人信息面板装配口（L4 · C4·PlayerInfo）。对外只暴露 create(container, ctx)，
// ctx = 读写信号袋（design §4 契约表）：三字段读写/落盘/开背包/提示全由 L4 装配点闭包实现，
// 视图件只发信号、零查表零写档（PI2；同 view/godpet 的注入口径）。
import { buildPlayerInfoPanel } from './playerInfoPanel.js'

export function create(container, ctx = {}) {
  const ctrl = buildPlayerInfoPanel({ root: container, ...ctx })
  return { update: ctrl.update, destroy: () => { container.textContent = '' } }
}
