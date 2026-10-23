// 重启线活动面板 L3 渲染（DOM only，零算术）。
// 纪律：不 import game/logic/**（arch-code 3 规则 #3）；只 import content（例外允许，读活动表）。
// 真值：docs/view/panel/activity/restart-activity-panel.md + activity-design.md。
// 上游对位：ActivityPanel.Init(=!hide 列表) / ActivityController(SetStorage·Select·Filter·Link·Prev/NextPage)
//          / ActivityListView(名字列表) / ActivityContentView(背景·名·描述·时间·3 奖励)。
import { el, text, mountImg } from '../panels/battle/_kit.js'
import * as CONTENT from '../../content.js'

const RES = '/projects/Seer2-Restart-Lite-main/Resources/'
const PAGE_SIZE = 9   // = 上游 Panel.prefab:1880 ActivityModel.capacity: 9

// 背景 URL = resId → Resources（数值 resId 上游按 "Activities/<resId>" addressables 取，见 ActivityInfo.GetBackground）。
// 拿不到由 mountImg 自陈 asset-missing、绝不静默换图（铁律 5）。
function bgUrl(resId) {
  let p = String(resId || '').trim()
  if (!p) return null
  if (/^\d+$/.test(p)) p = 'Activities/' + p
  if (!/\.png$/i.test(p)) p += '.png'
  return RES + p.split('/').map(encodeURIComponent).join('/')
}

// 奖励格 = 文本（美术未搬，同技能格口径）。数值 token → 道具名；其余原样（路径/字面量），'none'/空 → 不画。
function rewardChip(token) {
  const t = String(token || '').trim()
  if (!t || t === 'none') return null
  const label = /^\d+$/.test(t) ? (CONTENT.restartItemNameOf(Number(t)) || ('道具#' + t)) : t
  return text('rb-act-reward', label)
}

export function buildActivityPanel(ctx) {
  const { onClose, onLink } = ctx
  const all = CONTENT.restartAllActivities().filter((x) => !x.hide)   // 上游 ActivityPanel.cs:16 同口径
  const st = { sel: all[0] ? all[0].id : null, page: 0, query: '' }

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => onClose && onClose())
  const box = el('rb-act-box')

  const head = el('rb-act-head')
  head.append(
    text('rb-act-title', '活动'),
    el('rbh-spacer'),
    (() => { const b = el('rb-act-close'); b.textContent = '✕'; b.addEventListener('click', () => onClose && onClose()); return b })(),
  )

  // 搜索框（上游 ActivityFilterModel = name.Contains(input)）
  const toolbar = el('rb-act-toolbar')
  const input = document.createElement('input')
  input.className = 'rb-act-search'
  input.placeholder = '按名称搜索…'
  input.addEventListener('input', () => { st.query = input.value; st.page = 0; st.sel = filtered()[0] ? filtered()[0].id : null; render() })
  toolbar.append(input)

  const body = el('rb-act-body')
  const lists = el('rb-act-lists')
  const detail = el('rb-act-detail')
  body.append(lists, detail)
  box.append(head, toolbar, body)
  ctx.root.append(scrim, box)

  function filtered() {
    const q = st.query.trim()
    return q ? all.filter((x) => String(x.name).includes(q)) : all
  }

  function renderList() {
    lists.textContent = ''
    const items = filtered()
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
    st.page = Math.min(Math.max(st.page, 0), pages - 1)
    const pageItems = items.slice(st.page * PAGE_SIZE, st.page * PAGE_SIZE + PAGE_SIZE)

    const col = el('rb-act-col')
    col.append(text('rb-act-col-title', '活动 (' + items.length + ')'))
    const list = el('rb-act-list')
    if (!pageItems.length) list.append(text('rb-act-col-empty', items.length ? '（本页无）' : '无匹配活动'))
    for (const info of pageItems) {
      const row = el('rb-act-row' + (st.sel === info.id ? ' rb-act-row--on' : ''))
      row.append(
        text('rb-act-row-name', String(info.name || info.id)),
        text('rb-act-row-type', info.typeId === 2 ? '每日' : info.typeId === 1 ? '常驻' : '—'),
      )
      row.addEventListener('click', () => { st.sel = info.id; render() })
      list.append(row)
    }
    col.append(list)

    const pager = el('rb-act-pager')
    const prev = el('rb-act-pagebtn'); prev.textContent = '‹'; prev.title = '上一页'
    const next = el('rb-act-pagebtn'); next.textContent = '›'; next.title = '下一页'
    prev.addEventListener('click', () => { if (st.page > 0) { st.page--; render() } })
    next.addEventListener('click', () => { if (st.page < pages - 1) { st.page++; render() } })
    if (st.page === 0) prev.classList.add('rb-act-pagebtn--off')
    if (st.page === pages - 1) next.classList.add('rb-act-pagebtn--off')
    pager.append(prev, text('rb-act-pageno', (st.page + 1) + ' / ' + pages), next)
    col.append(pager)
    lists.append(col)
  }

  function renderDetail() {
    detail.textContent = ''
    const info = CONTENT.restartActivityOf(st.sel)
    if (!info) { detail.append(text('rb-act-detail-empty', '点左侧活动查看详情')); return }

    const bg = el('rb-act-bg')
    const u = bgUrl(info.resId)
    if (u) mountImg(bg, u, 'rb-act-bg-img')   // 缺图 → 自陈 asset-missing，不留假图
    detail.append(bg)

    detail.append(text('rb-act-d-name', String(info.name || info.id)))
    detail.append(text('rb-act-d-time', String(info.time || '') + (info.releaseDate ? '  ·  ' + info.releaseDate : '')))

    detail.append(text('rb-act-d-sect', '说明'))
    detail.append(text('rb-act-d-desc', String(info.description || '').trim() || '（无说明）'))

    const rewards = el('rb-act-rewards')
    rewards.append(text('rb-act-d-sect', '奖励'))
    const rrow = el('rb-act-reward-row')
    const chips = (info.rewardIcons || []).map(rewardChip).filter(Boolean)
    if (chips.length) chips.forEach((c) => rrow.append(c)); else rrow.append(text('rb-act-reward', '（无）'))
    rewards.append(rrow)
    detail.append(rewards)

    const act = el('rb-act-acts')
    const go = el('rb-act-go')
    const noLink = !info.linkId || info.linkId === 'none'
    go.textContent = noLink ? '此活动无入口' : '去参加'
    if (noLink) go.classList.add('rb-act-go--off')
    else go.addEventListener('click', () => { if (onLink) onLink(info) })
    act.append(go)
    detail.append(act)
  }

  function render() {
    // 选中项若被搜索过滤掉，回落到当前筛选首项
    const items = filtered()
    if (st.sel != null && !items.some((x) => x.id === st.sel)) st.sel = items[0] ? items[0].id : null
    renderList()
    renderDetail()
  }

  render()
  return { render, get selected() { return st.sel } }
}
