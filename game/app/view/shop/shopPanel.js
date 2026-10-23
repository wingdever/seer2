// 重启线商店面板 L3 渲染（DOM only，零算术）。
// 纪律：不 import game/logic/**；L1 交易经 ctx.L 注入；物品数据经 CONTENT（arch-code 3 例外允许）。
import { el, text } from '../panels/battle/_kit.js'
import * as CONTENT from '../../content.js'
import { makeItemIcon, typeColor } from '../item-art.js'

// 源码权威：分析 restart-shop-panel.md 1.2 逐字抄（PetPotion/Honor/Sign/YiTe）
const SHOP_IDS = {
  pet_potion: [10101,10111,10221,10238,10239,10240,20001,10018,20002,10211,10242,21006,21007,21008,21009,21010,10011,10012,10013,10014,10015,10016,10001,10002,10003,10004,10005,320000,700000,110050],
  honor: [8001,8002,8003,8004,8005,8006,8007,8008,300048,300058,300077,300133,300174,300176],
  sign: [500000,500178,500436,500959,500826,500761,500280,500307,500809,500179,500538,501261,501262,510499,510370,501001,500385,500389,500492,500808,500347,500459,500797,501003,500222,500697,501005,500703,500911,500752],
  yite: [500091,24000,320757,320092,320093,320094,320095,320096,320097,320098,320099,320100,320101,320102,320103,320104,105,320106,320107,320108,320741,320810,320967,320968,320969],
}

export const SHOP_TABS = [
  { key: 'all', name: '道具' },
  { key: 'pet_potion', name: '精灵道具' },
  { key: 'mine', name: '矿石' },
  { key: 'honor', name: '荣誉' },
  { key: 'sign', name: '签到' },
  { key: 'yite', name: '伊特' },
  { key: 'farm', name: '农牧' },
  { key: 'achievement', name: '称号' },
]

// 类型 -> id 清单（Mine/Farm/Achievement 按 typeRaw 过滤全库，忠实上游 LINQ 语义）
export function catalogOf(type) {
  if (SHOP_IDS[type]) return SHOP_IDS[type].slice()
  const all = (CONTENT.restartAllItems ? CONTENT.restartAllItems() : [])
  switch (type) {
    case 'all': return all.filter(it => Number(it.price) > 0 && [1,2].includes(Number(it.currencyType))).map(it => it.id)
    case 'mine': return all.filter(it => it.typeRaw === 'mine').map(it => it.id)
    case 'farm': return all.filter(it => ['plant','animal','animal_product','seed','animal_child','animal_action','fertilizer'].includes(it.typeRaw)).map(it => it.id)
    case 'achievement': return all.filter(it => it.typeRaw === 'achievement' && Number(it.price) > 0).map(it => it.id)
    default: return []
  }
}

// 货币本身就是道具（unity/items.json：id 1 = 赛尔豆、id 2 = 星钻、400016 = 希望之光…，两颗货币 PNG 在盘），
// 所以顶栏/价格一律画**道具图标 + 数额**，不再用 '◈'/'✦' 两个看不出是啥的纯文本符号。
// 任意 id 的货币都走同一条：字典有项 且 Resources/Items/{resId}.png 实测在盘（1/2/400016 命中；
// 8001 荣誉点等 PNG 缺盘 ⇒ 留 '×N 名字' 文本态，不伪造图标）。
const CURRENCY_PNG_OK = new Set([1, 2, 400016])
function currencyChip(currency, amount, size = 14) {
  const c = Number(currency), a = Number(amount) || 0
  const chip = el('rb-shop-cur')
  const cur = CURRENCY_PNG_OK.has(c) ? CONTENT.restartItemOf(c) : null
  if (cur) {
    chip.append(
      makeItemIcon(cur.resId || c, size, false, cur.typeRaw),
      text('rb-shop-cur-num', String(a)),
    )
  } else {
    // 拿道具当钱（上游多货币 CB4），画不出专属图标就如实写名字。
    const nm = CONTENT.restartItemNameOf(c) || ('#' + c)
    chip.append(text('rb-shop-cur-num', '×' + a + ' ' + nm))
  }
  return chip
}

const TITLE_OF = {
  all: '道具商店', pet_potion: '精灵道具商店', mine: '矿石回收商店', honor: '荣誉商店',
  sign: '签到商店', yite: '伊特商店', farm: '农牧产品出售', achievement: '称号商店',
}

// buildShopPanel(ctx) → { render, setNote }。ctx = { root, A, L, open, onClose }
export function buildShopPanel(ctx) {
  const { A, L, open, onClose } = ctx
  const isYite = (open.mode === 'buy_yite' || open.mode === 'sell_yite')
  const st = { type: open.type || 'all', mode: (open.mode === 'sell' || open.mode === 'sell_yite') ? 'sell' : 'buy', sel: null, qty: 1, page: 0 }
  // 翻页粒度：列表列 300px 内放 3 个 84px 格（3*84+2*6=264），一页 3 行 = 9 个。
  const PAGE_SIZE = 9

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => onClose && onClose())
  const box = el('rb-shop-box')

  const head = el('rb-shop-head')
  const money = el('rb-shop-money')
  const closeBtn = el('rb-shop-close'); closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', () => onClose && onClose())
  const titleEl = text('rb-shop-title', open.title || TITLE_OF[st.type] || '道具商店')
  head.append(titleEl, el('rbh-spacer'), money, closeBtn)

  // 标签按钮建成一次、引用留到 st 里；高亮由 render() 统一回写（否则切页高亮永远钉在初始那一张）。
  const tabs = el('rb-shop-tabs')
  const tabBtns = SHOP_TABS.map((t) => {
    const b = el('rb-shop-tab')
    b.textContent = t.name
    b.addEventListener('click', () => {
      if (st.type === t.key) return
      st.type = t.key; st.sel = null; st.page = 0; st.qty = 1
      titleEl.textContent = TITLE_OF[t.key] || '道具商店'
      render()
    })
    tabs.append(b)
    return { b, key: t.key }
  })

  const modebar = el('rb-shop-mode')
  const buyBtn = el('rb-shop-modebtn')
  buyBtn.textContent = '购买'
  const sellBtn = el('rb-shop-modebtn')
  sellBtn.textContent = '出售'
  buyBtn.addEventListener('click', () => { st.mode = 'buy'; st.sel = null; st.page = 0; st.qty = 1; render() })
  sellBtn.addEventListener('click', () => { st.mode = 'sell'; st.sel = null; st.page = 0; st.qty = 1; render() })
  modebar.append(buyBtn, sellBtn)

  const body = el('rb-shop-body')
  const lists = el('rb-shop-lists')
  const detail = el('rb-shop-detail')
  body.append(lists, detail)

  const note = el('rb-shop-note')
  box.append(head, tabs, modebar, body, note)
  ctx.root.append(scrim, box)

  const setNote = (s) => { note.textContent = s || '' }
  if (isYite) setNote('伊特商店：肉鸽背包未接入（待建），以下按普通背包结算')

  function visibleIds() {
    if (st.mode === 'sell') return (A.state.items || []).map(x => x.id)
    if (open.itemIds && open.itemIds.length) return open.itemIds
    return catalogOf(st.type)
  }

  // 限购口径：limit<0 或缺失 = 不限；数组 = 按当前目录顺序逐商品（忠实 Unity itemNumLimit 索引）
  function limitFor(id) {
    const lim = open.limit
    if (lim == null) return -1
    if (Array.isArray(lim)) {
      const ids = (open.itemIds && open.itemIds.length) ? open.itemIds : catalogOf(st.type)
      const i = ids.indexOf(id)
      return i >= 0 ? (lim[i] == null ? -1 : lim[i]) : -1
    }
    return lim
  }

  function cell(id) {
    const it = CONTENT.restartItemOf(id)
    if (!it) return null
    const owned = (A.state.items || []).find(x => x.id === id)?.count || 0
    const c = el('rb-shop-cell' + (st.sel === id ? ' rb-shop-cell--on' : ''))
    c.append(
      // 一律走 PNG（useRuffle=false）：/swf/item/**/icon/ 下只躺着 1.swf，Ruffle 兜不到别的图，
      // 反倒给每个格子挂一个注定失败的 Flash 播放器。
      makeItemIcon(it.resId || it.id, 26, false, it.typeRaw),
      text('rb-shop-cell-name', String(it.name || ('id' + id))),
      st.mode === 'buy'
        ? currencyChip(it.currencyType, it.price, 11)
        : text('rb-shop-cell-sub', '持有 ×' + owned),
    )
    c.addEventListener('click', () => { st.sel = id; st.qty = 1; render() })
    return c
  }

  function renderDetail() {
    detail.textContent = ''
    const id = st.sel
    if (id == null) { detail.append(text('rb-shop-detail-empty', '点左侧商品查看详情')); return }
    const it = CONTENT.restartItemOf(id)
    if (!it) return
    const type = CONTENT.restartItemTypeOf(id) || { raw: '', cn: '' }
    const owned = (A.state.items || []).find(x => x.id === id)?.count || 0
    const rem = L.remaining(A.state, id, limitFor(id))
    const remTxt = (rem !== Infinity) ? ('限购余量 ' + rem) : ''

    // 详情图示：加框放大到 56px（列表格只有 26px，这里是唯一能看清道具长相的地方）。
    const bigIco = el('rb-shop-bigico')
    bigIco.append(makeItemIcon(it.resId || it.id, 56, false, it.typeRaw))

    const priceEl = el('rb-shop-dh-price')
    priceEl.append(
      text('rb-shop-dh-price-lbl', st.mode === 'buy' ? '价 ' : '售价 '),
      currencyChip(it.currencyType, it.price, 14),
    )

    const dh = el('rb-shop-dh')
    dh.append(
      bigIco,
      text('rb-shop-dh-name', String(it.name || '')),
      text('rb-shop-dh-type', type.cn, { color: typeColor(type.raw) }),
      priceEl,
      text('rb-shop-dh-owned', '持有 ×' + owned + (remTxt ? '  ' + remTxt : '')),
    )
    detail.append(dh)

    const sect1 = el('rb-shop-sect'); sect1.textContent = '说明'
    detail.append(sect1)
    detail.append(text('rb-shop-desc', String(it.itemDescription || '').trim() || '（无说明）'))

    const sect2 = el('rb-shop-sect'); sect2.textContent = '效果'
    detail.append(sect2)
    detail.append(text('rb-shop-eff', String(it.effectDescription || '').trim() || '（无效果描述）'))

    // 数量步进器
    const qtyRow = el('rb-shop-qty')
    const dec = el('rb-shop-qtybtn'); dec.textContent = '−'
    const qtyTxt = text('rb-shop-qtynum', String(st.qty))
    const inc = el('rb-shop-qtybtn'); inc.textContent = '+'
    const maxQty = (st.mode === 'buy')
      ? (rem !== Infinity ? rem : 99)
      : Math.max(1, owned)
    dec.addEventListener('click', () => { st.qty = Math.max(1, st.qty - 1); qtyTxt.textContent = String(st.qty) })
    inc.addEventListener('click', () => { st.qty = Math.min(maxQty, st.qty + 1); qtyTxt.textContent = String(st.qty) })
    qtyRow.append(dec, qtyTxt, inc)
    detail.append(qtyRow)

    const act = el('rb-shop-acts')
    const doBtn = el(st.mode === 'sell' ? 'rb-shop-sell' : 'rb-shop-buy')
    doBtn.textContent = (st.mode === 'buy') ? '购买' : '出售'
    const canDo = (st.mode === 'buy')
      ? (L.afford(A.state, it, st.qty, limitFor(id)).ok)
      : (owned >= st.qty)
    if (!canDo) doBtn.classList.add(st.mode === 'buy' ? 'rb-shop-buy--off' : 'rb-shop-sell--off')
    doBtn.addEventListener('click', () => {
      const r = (st.mode === 'buy')
        ? L.buy(A.state, it, st.qty, { limit: limitFor(id) })
        : L.sell(A.state, it, st.qty)
      if (!r.ok) {
        const msg = r.reason === 'limit' ? '已达限购上限'
          : r.reason === 'balance' ? '货币不足'
          : r.reason === 'empty' ? '持有不足' : '操作失败'
        setNote(msg)
        return
      }
      ctx.onWrite && ctx.onWrite(true)
      setNote((st.mode === 'buy' ? '已购买 ' : '已出售 ') + st.qty + ' 个 ' + (it.name || id))
      render()
    })
    act.append(doBtn)
    detail.append(act)
  }

  function render() {
    // 顶栏货币 = 两颗货币道具的图标 + 数额；注入「道具当钱」的商店（open.currency.coin>2，
    // 如精灵王兑换 = 希望之光 400016）再补第三颗，余额现读 state.items（零算数，只查持有数）。
    money.textContent = ''
    const altCur = Number(open.currency?.coin) || 0
    const altOwned = altCur > 2
      ? ((A.state.items || []).find((x) => Number(x.id) === altCur)?.count) || 0
      : 0
    money.append(
      currencyChip(1, A.state.trainer?.coins || 0, 15),
      currencyChip(2, A.state.trainer?.diamonds || 0, 15),
    )
    if (altCur > 2) money.append(currencyChip(altCur, altOwned, 15))

    // 标签/模式高亮统一在这里回写（切页、切买卖都走同一条路）
    for (const { b, key } of tabBtns) b.classList.toggle('rb-shop-tab--on', key === st.type)
    buyBtn.classList.toggle('rb-shop-modebtn--on', st.mode === 'buy')
    sellBtn.classList.toggle('rb-shop-modebtn--on', st.mode === 'sell')

    lists.textContent = ''
    const ids = visibleIds()
    const pages = Math.max(1, Math.ceil(ids.length / PAGE_SIZE))
    st.page = Math.min(Math.max(st.page, 0), pages - 1)
    const pageIds = ids.slice(st.page * PAGE_SIZE, st.page * PAGE_SIZE + PAGE_SIZE)

    const col = el('rb-shop-col')
    col.append(text('rb-shop-col-title', (st.mode === 'buy' ? '商品' : '我的道具') + ' (' + ids.length + ')'))

    const grid = el('rb-shop-grid')
    if (!ids.length) grid.append(text('rb-shop-col-empty', st.mode === 'buy' ? '该分类暂无商品' : '背包是空的'))
    for (const id of pageIds) { const c = cell(id); if (c) grid.append(c) }
    col.append(grid)

    // 左右箭头翻页（不再整列滑动）：首页/末页的箭头置灰
    const pager = el('rb-shop-pager')
    const prev = el('rb-shop-pagebtn'); prev.textContent = '‹'; prev.title = '上一页'
    const next = el('rb-shop-pagebtn'); next.textContent = '›'; next.title = '下一页'
    prev.addEventListener('click', () => { if (st.page > 0) { st.page--; render() } })
    next.addEventListener('click', () => { if (st.page < pages - 1) { st.page++; render() } })
    if (st.page === 0) prev.classList.add('rb-shop-pagebtn--off')
    if (st.page === pages - 1) next.classList.add('rb-shop-pagebtn--off')
    pager.append(prev, text('rb-shop-pageno', (st.page + 1) + ' / ' + pages), next)
    col.append(pager)

    lists.append(col)
    if (st.sel != null && !ids.includes(st.sel)) st.sel = ids[0] ?? null
    else if (st.sel == null && ids.length) st.sel = ids[0]
    renderDetail()
  }

  render()
  return { render, setNote, get selected() { return st.sel } }
}
