// 重启线商店面板装配入口（L3）。把 L1（shop.js 交易）与视图构件接起来。
// 对外只暴露 create(container, A, opts)，沿用 mapScene 的 openPanel 接线口径（同 petbag/index.js）。
// 纪律：不 import game/logic/**（L1 经 opts.logic 注入，arch-code 3 规则 #3）；只 import content（arch-code 3 例外）。
import { buildShopPanel } from './shopPanel.js'

export function create(container, A, opts = {}) {
  const L = opts.logic
  if (!L || typeof L.buy !== 'function' || typeof L.sell !== 'function'
      || typeof L.afford !== 'function' || typeof L.remaining !== 'function') {
    throw new Error('shop 视图缺少逻辑件：装配层须传 opts.logic = { buy, sell, afford, remaining }（L3 不直连 game/logic/**，见 docs/arch-code.md 3）')
  }
  const open = opts.open || {}
  const ctx = {
    root: container, A, L, open,
    onClose: () => (opts.onClose ? opts.onClose() : {}),
    onWrite: (w) => { if (w) opts.onWrite && opts.onWrite(w) },
  }
  const ctrl = buildShopPanel(ctx)
  return { update: () => ctrl.render(), destroy: () => { container.textContent = '' } }
}
