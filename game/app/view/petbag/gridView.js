// L3 · 网格构件（背包/仓库共用 .rbg-*）。画「当前页格子 + 左/右箭头分页」。
// 背包里它就是底部「队伍区」的一行 6 格（desc 1.3：左箭头 + 6 只 + 右箭头 + 刷新；刷新钮由 bagPanel 另加）。
// 分页/选中/换页全部走 L1 grid（这里零算数、零分页数学，铁律1）。
import { el, text } from '../panels/battle/_kit.js'
import { renderCell } from './cellView.js'

// host: 容器；grid: L1 grid；metaOf(slot, pet)->m；onPick(slot)；onPage(delta)
export function renderGrid(host, { grid, metaOf, onPick, onPage }) {
  host.textContent = ''

  const prev = el('rbg-pagebtn')
  prev.textContent = '◀'
  const cur = grid.page(), total = grid.pageCount()
  if (cur === 0) prev.classList.add('rbg-pagebtn--off')
  else prev.addEventListener('click', () => onPage('prev'))

  const cells = el('rbg-cells')
  for (const cell of grid.cells()) {
    const slot = cell.slot
    cells.append(renderCell(metaOf(slot, cell.pet), () => onPick(slot)))
  }

  const next = el('rbg-pagebtn')
  next.textContent = '▶'
  if (cur >= total - 1) next.classList.add('rbg-pagebtn--off')
  else next.addEventListener('click', () => onPage('next'))

  host.append(prev, cells, text('rbg-pageno', `${cur + 1} / ${total}`), next)
}
