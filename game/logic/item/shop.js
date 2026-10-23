// 重启线商店交易逻辑（L1）。纯对 state 的变更，**不 import content**——
// 物品记录(item)由视图层从 content 取出后传入，保持 game/logic 不依赖 app 层（与 game/logic 其他件一致）。
// 视图层通过 opts.logic 注入本模块（arch-code 3 规则 #3：L3 不直连 game/logic/**）。
import { addItem, consumeItem, countItem } from '../restartSession.js'

const COIN = 1, DIAMOND = 2

// 价格信息：currencyType 1=赛尔豆 / 2=星钻 / >2=某道具 id（用该道具当钱，忠实上游多货币 CB4）
export function priceInfo(item) {
  return { currency: Number(item.currencyType), amount: Number(item.price) || 0 }
}

// 限购余量（Activity.Shop 等价物 CB3）：limit<0 表示不限
export function remaining(state, itemId, limit) {
  if (limit == null || limit < 0) return Infinity
  const bought = (state.shop && state.shop.bought) || {}
  return Math.max(0, limit - (bought[itemId] || 0))
}

function balanceOf(state, currency) {
  if (currency === COIN) return state.trainer?.coins || 0
  if (currency === DIAMOND) return state.trainer?.diamonds || 0
  return countItem(state, currency) // 用某道具当钱
}

function deduct(state, currency, amount) {
  if (currency === COIN) state.trainer.coins -= amount
  else if (currency === DIAMOND) state.trainer.diamonds -= amount
  else consumeItem(state, currency, amount)
}

function grant(state, currency, amount) {
  if (currency === COIN) state.trainer.coins += amount
  else if (currency === DIAMOND) state.trainer.diamonds += amount
  else addItem(state, currency, amount)
}

// 购买可行性：先查限购，再查货币
export function afford(state, item, qty, limit) {
  const { currency, amount } = priceInfo(item)
  const rem = remaining(state, item.id, limit)
  if (rem !== Infinity && qty > rem) return { ok: false, reason: 'limit' }
  if (balanceOf(state, currency) < amount * qty) return { ok: false, reason: 'balance' }
  return { ok: true, reason: null }
}

// 购买：加背包 + 扣货币 + 写限购计数；成功返回 write:true（视图据此发落盘信号）
export function buy(state, item, qty, opts = {}) {
  qty = Math.max(1, Math.floor(qty || 1))
  const af = afford(state, item, qty, opts.limit)
  if (!af.ok) return { ok: false, reason: af.reason, write: false }
  const { currency, amount } = priceInfo(item)
  addItem(state, item.id, qty)
  deduct(state, currency, amount * qty)
  if (!state.shop) state.shop = { bought: {} }
  if (!state.shop.bought) state.shop.bought = {}
  state.shop.bought[item.id] = (state.shop.bought[item.id] || 0) + qty
  return { ok: true, reason: null, write: true }
}

// 出售（CB2 声明：售价 = item.price 全价回购，等人类手测确认是否折扣）
export function sell(state, item, qty) {
  qty = Math.max(1, Math.floor(qty || 1))
  if (countItem(state, item.id) < qty) return { ok: false, reason: 'empty', write: false }
  const { currency, amount } = priceInfo(item)
  consumeItem(state, item.id, qty)
  grant(state, currency, amount * qty)
  return { ok: true, reason: null, write: true }
}
