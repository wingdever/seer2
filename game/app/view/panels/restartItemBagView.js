// 重启原生道具背包面板 (UI 线 U4 道具支)。模态面板, 挂 host 的 #rv; 只在引擎开关=重启时由 mapScene 打开
// (顶替 maprunner/ItemBagRunner.as 的 SWF 面板)。
// 纪律 (1a+2a): **只读** —— 内容来自 content.restartItemOf (unity/items.json), 数量来自 A.state.items。
//   本轮不做「使用」执行 (effects[] 属内核/NOT_PORTED, 见 U2/S6), 不伪造; 获取路径 (捕捉/商店/战利品) 也未接 → 默认如实显示空包。
import { el, text } from './battle/_kit.js'
import * as CONTENT from '../../content.js'
import { makeItemIcon, typeColor } from '../item-art.js'

// create(container, A, { onClose }) → { update(), destroy() }
export function create(container, A, opts = {}) {
  const onClose = opts.onClose || (() => {})
  let sel = null   // 选中道具 id

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', onClose)
  const box = el('rbi-box')

  const head = el('rbi-head')
  const money = text('rbi-money', '')
  const closeBtn = el('rbi-close'); closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', onClose)
  head.append(text('rbi-title', '道具背包'), el('rbh-spacer'), money, closeBtn)

  const body = el('rbi-body')
  const lists = el('rbi-lists')
  const detail = el('rbi-detail')
  body.append(lists, detail)

  const note = el('rbi-note')
  box.append(head, body, note)
  container.append(scrim, box)

  const setNote = (s) => { note.textContent = s || '' }
  const section = (label) => text('rbi-sect', label)
  const countOf = (id) => (A.state.items || []).find(x => x.id === id)?.count || 0

  function cell(it) {
    const raw = CONTENT.restartItemTypeOf(it.id)?.raw ?? ''
    const c = el('rbi-cell' + (sel === it.id ? ' rbi-cell--on' : ''))
    c.style.borderColor = typeColor(raw)
    c.append(
      makeItemIcon(it.resId || it.id, 26, false, it.typeRaw),
      text('rbi-cell-name', String(it.name || ('id' + it.id))),
      text('rbi-cell-count', '×' + countOf(it.id)),
    )
    c.addEventListener('click', () => { sel = it.id; render() })
    return c
  }

  function renderDetail() {
    detail.textContent = ''
    const it = CONTENT.restartItemOf(sel)
    if (!it) { detail.append(text('rbi-detail-empty', '点左侧道具查看详情')); return }
    const type = CONTENT.restartItemTypeOf(it.id) || { raw: '', cn: '' }

    const dh = el('rbi-dh')
    dh.append(
      text('rbi-dh-name', String(it.name || '')),
      text('rbi-dh-type', type.cn, { color: typeColor(type.raw) }),
      text('rbi-dh-count', '持有 ×' + countOf(it.id)),
    )
    detail.append(dh)

    detail.append(section('说明'))
    detail.append(text('rbi-desc', String(it.itemDescription || '').trim() || '（无说明）'))

    detail.append(section('效果'))
    detail.append(text('rbi-eff', String(it.effectDescription || '').trim() || '（无效果描述）'))
    const effs = it.effects || []
    if (effs.length) {
      const rows = el('rbi-efflist')
      for (const e of effs) rows.append(text('rbi-effrow', `效果 #${e.id} · ${e.timingRaw || '?'} → ${e.abilityRaw || '?'} (${e.targetRaw || '?'})`))
      detail.append(rows)
      detail.append(text('rbi-effnote', `共 ${effs.length} 条效果 · 使用/结算属内核 U2/S6（本轮不执行）`))
    } else {
      detail.append(text('rbi-efflist-empty', '无效果条目'))
    }

    // 只读: 使用/丢弃本轮都不接 (使用属 U2/S6; 丢弃无权威且改档需谨慎)
    const acts = el('rbi-acts')
    const useBtn = el('rbi-act rbi-act--off'); useBtn.textContent = '使用'
    useBtn.title = '使用逻辑属 U2/S6（effects 未移植, 面板不伪造执行）'
    acts.append(useBtn)
    detail.append(acts)
  }

  function render() {
    money.textContent = `◈ ${A.state.trainer?.coins || 0}  ✦ ${A.state.trainer?.diamonds || 0}`
    lists.textContent = ''
    const items = (A.state.items || [])
      .map(x => { const it = CONTENT.restartItemOf(x.id); return it ? { ...it, _count: x.count } : null })
      .filter(Boolean)
      .sort((a, b) => String(a.typeRaw).localeCompare(String(b.typeRaw)) || a.id - b.id)
    const col = el('rbi-col')
    col.append(text('rbi-col-title', `道具 (${items.length})`))
    const grid = el('rbi-cells')
    if (!items.length) grid.append(text('rbi-col-empty', '背包是空的 —— 捕捉 / 商店 / 战利品 获取道具属 U2'))
    for (const it of items) grid.append(cell(it))
    col.append(grid)
    lists.append(col)
    if (sel !== null && !items.some(x => x.id === sel)) sel = items[0]?.id ?? null
    else if (sel === null && items.length) sel = items[0].id
    renderDetail()
  }

  render()
  return { update: render, destroy() { scrim.remove(); box.remove() } }
}
