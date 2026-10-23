// L3 · 仓库面板（.rbs-*）：复用 .rbg-* 网格构件渲染 petStorage（变长、无空槽），
// 取出/交换/放生/收藏 走 R1–R4 actions；**放生二次确认**在 dispatch 前经 ctx.confirm（askHint）。
// 关闭回调里让背包 refresh()（重算视图，不重灌数组）。视图零算数、零写盘。
// ⚠️ 收藏 = 内存宠的 elite 布尔（落盘 = recordDict 的 elite 字符串键，归会话线）；仓库列表**不按 elite 分流**
//   （上游 Normal 视图排除收藏、另有「精英」页签）⇒ 收藏宠仍列在此、带「收藏」角标 —— 已登记为待办。
// ⚠️ 筛选/排序**长在仓库里**（C1 §6.3：desc 的背包面板没有筛选/排序，上游那两条路径也在 Storage 下）。
import { el, text } from '../panels/battle/_kit.js'
import { renderGrid } from './gridView.js'
import { renderInfo } from './detailPane.js'
import { renderFilter } from './filterBar.js'
import { renderSort } from './sortBar.js'

export function buildStoragePanel(ctx) {
  const scrim = el('rb-scrim'); scrim.addEventListener('click', () => ctx.onClose())
  const box = el('rbs-box')

  const head = el('rbs-head')
  const money = text('rbs-money', '')
  const close = el('rbs-close'); close.textContent = '✕'
  close.addEventListener('click', () => ctx.onClose())
  head.append(text('rbs-title', '精灵仓库'), el('rbh-spacer'), money, close)

  const filterHost = el('rbs-filter')
  const sortHost = el('rbs-sort')
  const gridHost = el('rbg-grid')
  const detailHost = el('rbs-detail')
  const acts = el('rbs-acts')
  const note = el('rbs-note')
  box.append(head, filterHost, sortHost, gridHost, detailHost, acts, note)
  ctx.root.append(scrim, box)

  let selIndex = 0
  let tab = 'basic'
  ctx.onTab = (id) => { tab = id; render() }
  ctx.onPersonality = () => {}          // 改性格只在背包含义里（仓库里不提供）

  const storage = () => ctx.src.storage() || []
  const selected = () => storage()[selIndex] ?? null

  const metaOf = (slot, pet) => {
    if (pet == null) return { slot, empty: true, selected: slot === selIndex }
    const cfg = ctx.cfg(pet) || {}
    const pd = ctx.describePet(pet) || {}
    return {
      slot, empty: false, selected: slot === selIndex, mark: pet.elite === true ? '收藏' : null,
      petId: pet.petId, elementId: cfg.elementId ?? 0, name: pd.name || ctx.nameOf(pet),
      level: pet.level | 0, hpFrac: pd.hpFrac ?? 0, off: pd.off,
    }
  }

  const btn = (label, fn, enabled = true) => {
    const b = el('rbs-act' + (enabled ? '' : ' rbs-act--off'))
    b.textContent = label
    if (enabled) b.addEventListener('click', fn)
    return b
  }

  async function doRelease() {
    const r = await ctx.confirm({ key: 'storage.releaseConfirm', level: 'warn' })
    if (r !== 'ok') { ctx.setNote('已取消放生'); return }
    ctx.run('release', { index: selIndex })
    selIndex = Math.max(0, Math.min(selIndex, storage().length - 1))
    render()
  }

  function renderActs() {
    acts.textContent = ''
    const ok = selected() != null
    // 收藏态：钮文案翻「取消收藏」；放生置灰（上游 PetStorageView 同款三选一灰化；真门在 L1 release，A13）
    const fav = ok && selected().elite === true
    acts.append(
      btn('取出', () => { ctx.run('takeOut', { index: selIndex }); render() }, ok),
      btn(fav ? '取消收藏' : '收藏', () => { ctx.run('favorite', { index: selIndex }); render() }, ok),
      btn('放生', () => { doRelease() }, ok && !fav),
    )
  }

  function render() {
    const m = ctx.money()
    money.textContent = `◈ ${m.coins}  ✦ ${m.diamonds}`
    renderFilter(filterHost, {
      allPets: () => storage().filter(p => p != null), cfg: ctx.cfg, nameOf: ctx.nameOf,
      elementName: ctx.elementName,
      setPredicate: (fn) => { ctx.storageGrid.setFilter(fn); render() },
      reset: () => { ctx.storageGrid.resetFilters(); render() },
    })
    renderSort(sortHost, {
      statsOf: ctx.statsOf,
      setSorter: (fn) => { ctx.storageGrid.setSorter(fn); render() },
    })
    renderGrid(gridHost, {
      grid: ctx.storageGrid, metaOf,
      onPick: (slot) => { selIndex = slot; render() },
      onPage: (a) => {
        if (a === 'first') ctx.storageGrid.setPage(0)
        else if (a === 'prev') ctx.storageGrid.prev()
        else if (a === 'next') ctx.storageGrid.next()
        render()
      },
    })
    renderInfo(detailHost, ctx, selected(), tab)
    renderActs()
  }

  render()
  return { render, setNote: (s) => { note.textContent = s || '' } }
}
