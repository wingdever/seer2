// L3 · 图鉴面板装配口（docs/view/panel/dex/dex-impl.md §2.1 / §3；正本设计 = dex-design.md DX1–DX12）。
// 对外只暴露 create(container, opts) ⇒ { update, destroy }。
// ⚠️ **L3 纪律**：本目录**不 import** `game/logic/**`（`docs/arch-code.md §3` 规则 #3）⇒ 全部 L1 件经
//    `opts.logic` 由装配层 `mapScene.js` 注入（先例 = `view/petbag/index.js:49-56` 的大声报错口径）。
import * as CONTENT from '../../content.js'
import { mountIdle, clearIdle } from '../petbag/idleStage.js'
import { petCryUrl, petIconUrl, petBattleUrl } from '../panels/battle/_kit.js'
import { buildDexPanel } from './dexPanel.js'
import { buildInfoPane } from './infoPane.js'

const ELEMENT_PAGES = 2        // 23 颗属性钮 / 20 颗一页 ⇒ 2 页（上游 elementNumInOnePage:20）

export function create(container, opts = {}) {
  const L = opts.logic
  if (!L || typeof L.buildDexEntries !== 'function' || typeof L.isOwned !== 'function'
      || typeof L.buildOwnedIds !== 'function' || typeof L.createGrid !== 'function'
      || typeof L.elementPredicate !== 'function' || typeof L.nameOrIdPredicate !== 'function'
      || typeof L.sorterOf !== 'function' || typeof L.combineAnd !== 'function'
      || !Number.isFinite(L.DEX_PAGE_SIZE)) {
    throw new Error('dex 视图缺少逻辑件：装配层须传 opts.logic = { buildDexEntries, buildOwnedIds, isOwned, createGrid, elementPredicate, nameOrIdPredicate, sorterOf, combineAnd, DEX_PAGE_SIZE }（L3 不许直接 import game/logic/**，见 docs/arch-code.md §3）')
  }

  // 视图态（切换类，不是数据）。默认档 = 精灵列表（**显式定死**，修 restart-dex-panel.md §13 A1 的"靠 Start 顺序抢"）。
  const st = { mode: 'All', elemId: -1, elemPage: 0, elemOpen: true, query: '', sort: 'normal' }
  let entries = L.buildDexEntries(opts.rows, { mode: st.mode, topicIds: opts.topicIds })
  let grid = L.createGrid({ items: entries, pageSize: L.DEX_PAGE_SIZE })   // ⚠️ 不传 capacity（G1 定长校验会抛）
  let haveCache = null                                                    // DX4.5：角标只在换页 / 换筛选 / 换档时重算
  let hosts = null                                                        // 右栏两个常驻壳（由 panel.render 交出）

  // opts.ownedIds = **取集合的函数**（装配层每次现算 ⇒ 换宠后重开图鉴/翻页，角标跟着变 = design §5 第 5 条）
  const ownedIds = () => opts.ownedIds()
  const invalidate = () => { haveCache = null }
  const predicate = () => L.combineAnd(L.elementPredicate(st.elemId), L.nameOrIdPredicate(st.query))

  // 序号串在这里拼，视图只画（V-2）：`{defaultId}` +（`subId>0 ⇒ "-{subId}"`）
  const noOf = (row) => (row.ui.subId > 0 ? `${row.ui.defaultId}-${row.ui.subId}` : `${row.ui.defaultId}`)
  const haveOf = (row) => {
    if (!haveCache) haveCache = new Map()
    if (!haveCache.has(row.id)) haveCache.set(row.id, L.isOwned(row, ownedIds(), opts.evolveTargetsOf))
    return haveCache.get(row.id)
  }

  // 交给视图构件的读数（表字段 + L2 桥；DOM 侧零算数、零筛数据）
  const read = {
    nameOf: (row) => row.name || CONTENT.restartNameOf(row.id) || ('#' + row.id),
    iconUrl: (id) => petIconUrl(id),
    battleUrl: (id) => petBattleUrl(id),
    elementName: (id) => CONTENT.elementNameOf(id),
    swfIdOf: (id) => CONTENT.swfIdOf(id),
    haveOf,
    noOf,
  }

  const ctx = {
    root: container,
    state: st,
    read,
    cells: () => {
      const sel = grid.cursor()
      return grid.cells().map((c, i) => ({ id: c.pet.id, name: read.nameOf(c.pet), no: noOf(c.pet), have: haveOf(c.pet), selected: i === sel }))
    },
    page: () => grid.page(),
    pageCount: () => grid.pageCount(),
    countText: () => {
      const pred = predicate()
      const n = pred ? entries.filter(pred).length : entries.length
      return pred ? `筛出 ${n} 只` : `共 ${n} 只`        // 修 restart-dex-panel.md §13 A4：上游那行文本没接线
    },
    onMode: (mode) => {
      if (st.mode === mode) return
      st.mode = mode
      st.elemId = -1; st.query = ''; st.sort = 'normal'; st.elemPage = 0
      // 换档 = 重建行集 + 重建 grid ⇒ 筛选 / 排序 / 页码 / 游标一次清光（DX6，修 A5 的"漏星级"）
      entries = L.buildDexEntries(opts.rows, { mode, topicIds: opts.topicIds })
      grid = L.createGrid({ items: entries, pageSize: L.DEX_PAGE_SIZE })
      render()
    },
    onElement: (id) => { st.elemId = id; apply() },                     // 再点同一颗 = 不换筛选（照上游）
    onToggleElement: () => { st.elemOpen = !st.elemOpen; if (!st.elemOpen) st.elemId = -1; apply() },
    onElementPage: (d) => { st.elemPage = Math.max(0, Math.min(ELEMENT_PAGES - 1, st.elemPage + d)); render() },
    onSearch: (v) => { st.query = v; apply() },
    onSort: (v) => { st.sort = v; grid.setSorter(L.sorterOf(v)); invalidate(); render() },
    onPage: (dir) => { if (dir === 'next') grid.next(); else grid.prev(); invalidate(); render() },
    // 跳页：空 / 非数字 ⇒ **什么都不动**（上游语义，反直觉但照搬）；合法 ⇒ 1 基转 0 基，grid 自己夹到末页
    onJump: (raw) => {
      const n = Number.parseInt(String(raw == null ? '' : raw).trim(), 10)
      if (!Number.isFinite(n)) return
      grid.setPage(n - 1); invalidate(); render()
    },
    onPick: (i) => { grid.select(i); render() },                         // DX9：点一格刷右栏 + 格内选中框（台子 mountIdle 自去重）
    onClose: () => { if (opts.onClose) opts.onClose() },
    onLink: (row) => { if (opts.onLink) opts.onLink(String(row.linkId || '')) },   // 交**裸 linkId** 给共用分派器（DXI3）
    renderSide: (given) => { if (given) hosts = given; renderSide() },
  }

  // 叫声（**DXQ6 = A**）：就地一个 `<audio>`，**按 petId 不是 skinId**；缺素材 ⇒ 不响 + 一行日志，绝不播别人的声音。
  // TODO（dex-impl.md §3 c5 / §8 R6）：编排线音频服务 `game/app/services/audio.js`（ORB4-b）落地时替换这一处。
  let cry = null
  function playCry(petId) {
    if (!cry) cry = document.createElement('audio')
    cry.onerror = () => opts.onNote?.(`图鉴叫声缺失：${petId}.mp3`)
    cry.src = petCryUrl(petId)
    const p = cry.play()
    if (p && p.catch) p.catch(() => opts.onNote?.(`图鉴叫声未能播放：${petId}.mp3`))
  }
  ctx.playCry = playCry
  ctx.onTest = () => opts.showHint?.({ key: 'bag.battleTestPending' })  // 「测」画出来但只弹提示（DX12，修 A10/A14）

  function apply() { grid.setFilter(predicate()); invalidate(); render() }

  const panel = buildDexPanel(ctx)

  function renderSide() {
    if (!hosts) return
    const row = grid.selectedItem()
    buildInfoPane(hosts.infoHost, { row, read, ctx })
    // 展示台 = 常驻壳里换素材（缺 swf ⇒ idleStage 自动退静态头像 + 一行提示，不伪造动画 = DX10）
    // 展示台 = 形象（有 swf 播 idle；无 swf 降级用重启战斗形象 png，非头像）。
    if (row) mountIdle(hosts.stageHost, { petId: row.id, swfId: read.swfIdOf(row.id), fallbackUrl: read.battleUrl(row.id) })
    else hosts.stageHost.textContent = ''
  }

  function render() { panel.render() }

  apply()
  return {
    update: () => { invalidate(); render() },   // 重开 = 角标按当前袋子重算（design §5 第 5 条）
    destroy: () => { clearIdle(); container.textContent = '' },
  }
}
