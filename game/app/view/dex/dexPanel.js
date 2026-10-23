// L3 · 图鉴面板外壳（docs/view/panel/dex/dex-design.md DX2/DX5/DX6/DX7/DX8；施工 dex-impl.md §2）。
// 只画 DOM、只发信号：分页/筛选/排序的**数学**全在注入的 L1（grid + predicates），本文件零算数（V-2）、零写盘（DXI1）。
// 版式 = 760×480 正居中；左元素栏(100) | 中 9 格列表(360) | 右信息区(300)。
// ⚠️ L3 纪律：不 import game/logic/**（arch-code §3 规则 #3），逻辑件由装配层经 opts.logic 注入。
import { el, text, mountImg, panelSprite, elementIcon, petIconUrl, elementName } from '../panels/battle/_kit.js'
import { DEX_CELL_SLOTS, DEX_CELL_W, DEX_CELL_H, DEX_HAVE_W, DEX_HAVE_H } from './cells.js'

const PAGE_OF_ELEMENTS = 20     // 上游 elementNumInOnePage: 20（23 种属性 ⇒ 2 页，第 2 页只画 3 颗）
const ELEMENT_TOTAL = 23
// ✕ 那颗 `Green Esc.png` 住在 `Assets/Resources/Sprites/Game/Hint Box/`（= `hintbox.js:7` 同一目录，
// 不在 panelSprite 的 `Panels/` 根下）⇒ 本面板自带这一条根，与 minimapPanel 的 `assetUrl` 同做法。
const HINTBOX = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Hint%20Box'

export function buildDexPanel(ctx) {
  const st = ctx.state       // { mode, elemId, elemPage, elemOpen, query, sort }
  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => ctx.onClose())

  const box = el('rb-dex')

  // ── ① 标题层 ────────────────────────────────────────────────────────────
  const head = el('rb-dex-head')
  head.append(text('rb-dex-title', '精灵图鉴'))
  const close = el('rb-dex-close')
  mountImg(close, `${HINTBOX}/Green%20Esc.png`)   // 35×35，缺图自陈、不伪造
  close.addEventListener('click', () => ctx.onClose())
  head.append(close)

  // ── ② 页签两颗（左 = 最新精灵、右 = 精灵列表；左右序照搬上游）───────────
  const tabs = el('rb-dex-tabs')
  const tabTopic = text('rb-dex-tab', '最新精灵')
  const tabAll = text('rb-dex-tab', '精灵列表')
  tabTopic.addEventListener('click', () => ctx.onMode('Topic'))
  tabAll.addEventListener('click', () => ctx.onMode('All'))
  tabs.append(tabTopic, tabAll)

  // ── ③ 顶部筛选栏：排序下拉 + 名字/ID + Search + 计数 ────────────────────
  const filter = el('rb-dex-filter')
  const sort = document.createElement('select')
  sort.className = 'rb-dex-sort'
  for (const [v, label] of [['normal', '一般'], ['reverse', '特殊'], ['star', '星级']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = label; sort.append(o)
  }
  sort.value = st.sort
  sort.addEventListener('change', () => ctx.onSort(sort.value))

  const search = document.createElement('input')
  search.className = 'rb-dex-search'
  search.placeholder = '搜索名字或ID'
  search.value = st.query
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctx.onSearch(search.value) })

  const go = el('rb-dex-search-btn')
  mountImg(go, panelSprite('PetStorage/Sprites/31.png'))
  go.title = '搜索'
  go.addEventListener('click', () => ctx.onSearch(search.value))

  const count = text('rb-dex-count', '')
  filter.append(text('rb-dex-flabel', '排序'), sort, search, go, count)

  // ── ④ 主体三栏 ──────────────────────────────────────────────────────────
  const body = el('rb-dex-body')

  // 左：元素栏（23 颗真图标 · 20 颗/页 · 控制钮收起 = 谓词复位"全部"）
  const element = el('rb-dex-element')
  const elemToggler = el('rb-dex-element-toggle')
  mountImg(elemToggler, panelSprite('PetStorage/Sprites/36.png'))
  elemToggler.title = '收起 / 展开属性栏（收起 = 全部）'
  elemToggler.addEventListener('click', () => ctx.onToggleElement())
  const elemPage = el('rb-dex-element-page')
  const elemPrev = el('rb-dex-pagebtn'); elemPrev.textContent = '◀'
  const elemNext = el('rb-dex-pagebtn'); elemNext.textContent = '▶'
  elemPrev.addEventListener('click', () => ctx.onElementPage(-1))
  elemNext.addEventListener('click', () => ctx.onElementPage(1))
  const elemPageno = text('rb-dex-element-pageno', '')
  elemPage.append(elemPrev, elemPageno, elemNext)
  const elemGrid = el('rb-dex-element-grid')
  element.append(elemToggler, elemGrid, elemPage)

  // 中：9 格 + 分页条
  const mid = el('rb-dex-mid')
  const list = el('rb-dex-list')
  const pager = el('rb-dex-pager')
  const prev = el('rb-dex-pagebtn'); prev.textContent = '◀'
  const next = el('rb-dex-pagebtn'); next.textContent = '▶'
  prev.addEventListener('click', () => ctx.onPage('prev'))
  next.addEventListener('click', () => ctx.onPage('next'))
  const pageno = text('rb-dex-page', '')
  const jump = document.createElement('input')
  jump.className = 'rb-dex-jump'
  jump.placeholder = '页码'
  jump.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctx.onJump(jump.value) })
  const jumpGo = text('rb-dex-jumpbtn', 'GO')
  jumpGo.addEventListener('click', () => ctx.onJump(jump.value))
  pager.append(prev, pageno, next, jump, jumpGo)
  mid.append(list, pager)

  // 右：信息区（六行 + 六维 + 钮）+ 展示台壳（**常驻、只建一次** —— Ruffle 播放器一脱离 DOM 即销毁）
  const side = el('rb-dex-side')
  const stage = el('rb-dex-stage')
  const info = el('rb-dex-info')
  side.append(info, stage)

  body.append(element, mid, side)
  box.append(head, tabs, filter, body)

  // 悬停小气泡（属性名 / 分布 habitat；同 minimap MM5 口径，不用原生 title 长延迟）
  const tip = el('rb-dex-tip')
  box.append(tip)
  ctx.root.append(scrim, box)

  const showTip = (msg, host) => {
    if (!msg) { tip.style.display = 'none'; return }
    tip.textContent = msg
    tip.style.display = 'block'
    tip.style.left = (host.offsetLeft + host.offsetWidth + 6) + 'px'
    tip.style.top = (host.offsetTop + 2) + 'px'
  }

  // ── 渲染 ────────────────────────────────────────────────────────────────
  function renderElements() {
    elemGrid.textContent = ''
    elemToggler.classList.toggle('rb-dex-element-toggle--off', !st.elemOpen)
    element.classList.toggle('rb-dex-element--closed', !st.elemOpen)
    if (!st.elemOpen) { elemPage.style.display = 'none'; return }
    elemPage.style.display = ''
    const from = st.elemPage * PAGE_OF_ELEMENTS
    const total = Math.min(ELEMENT_TOTAL, from + PAGE_OF_ELEMENTS)
    for (let id = from; id < total; id++) {           // 第 2 页只有 3 颗 ⇒ 其余**不画**（照上游 SetActive(false)）
      const b = el('rb-dex-element-btn' + (st.elemId === id ? ' rb-dex-element-btn--on' : ''))
      mountImg(b, elementIcon(id))
      b.addEventListener('mouseenter', () => showTip(elementName(id), b))
      b.addEventListener('mouseleave', () => showTip('', b))
      b.addEventListener('click', () => ctx.onElement(id))   // 再点同一颗 = 不换筛选（照上游，取消走控制钮）
      elemGrid.append(b)
    }
    const pages = Math.ceil(ELEMENT_TOTAL / PAGE_OF_ELEMENTS)
    elemPageno.textContent = `${st.elemPage + 1}/${pages}`
    elemPrev.classList.toggle('rb-dex-pagebtn--off', st.elemPage <= 0)
    elemNext.classList.toggle('rb-dex-pagebtn--off', st.elemPage >= pages - 1)
  }

  function renderCells() {
    list.textContent = ''
    const cells = ctx.cells()                 // [{ id, name, no, have, selected }]（读数在装配层算好，视图零算数）
    cells.forEach((c, i) => {
      const slot = DEX_CELL_SLOTS[i]
      if (!slot) return
      const cell = el('rb-dex-cell' + (c.selected ? ' rb-dex-cell--on' : ''), {
        left: slot.x + 'px', top: slot.y + 'px', width: DEX_CELL_W + 'px', height: DEX_CELL_H + 'px',
      })
      // 选中态 = **换框**（design DX5 第 3 条：87.png 选中 / 85.png 未选，两张盘上都有）
      cell.style.backgroundImage = `url("${panelSprite(c.selected ? 'OldPetBag/Sprites/87.png' : 'OldPetBag/Sprites/85.png')}")`
      mountImg(cell, petIconUrl(c.id), 'rb-dex-cell-icon')
      cell.append(text('rb-dex-cell-no', c.no))
      if (c.have) {                            // 已获得角标（50×32 摆 (-10,5) → DOM 左上偏移）
        const mark = el('rb-dex-cell-have', { width: DEX_HAVE_W + 'px', height: DEX_HAVE_H + 'px' })
        mountImg(mark, panelSprite('TwelveRound/Sprites/have.png'))
        cell.append(mark)
      }
      cell.addEventListener('click', () => ctx.onPick(i))
      cell.title = `${c.name} (${c.no})`        // 名字退 hover（格内只画头像 + 序号，同 C1 背包口径）
      list.append(cell)
    })
  }

  function renderPager() {
    const p = ctx.page(), n = ctx.pageCount()
    pageno.textContent = `${p + 1}/${n}`       // **1 基显示**
    prev.classList.toggle('rb-dex-pagebtn--off', p <= 0)
    next.classList.toggle('rb-dex-pagebtn--off', p >= n - 1)
    count.textContent = ctx.countText()
    tabAll.classList.toggle('rb-dex-tab--on', st.mode === 'All')
    tabTopic.classList.toggle('rb-dex-tab--on', st.mode === 'Topic')
    sort.value = st.sort
    if (search.value !== st.query) search.value = st.query
  }

  function render() {
    renderElements()
    renderCells()
    renderPager()
    // ⚠️ 只交出**常驻**的两个壳：info 每次重画、stage 绝不重建（Ruffle 播放器一脱离 DOM 即销毁 = DX10）
    ctx.renderSide({ infoHost: info, stageHost: stage, showTip })
  }

  return { render }
}
