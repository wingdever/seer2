// L1 · 网格机器（分页/游标/筛选/排序/单选/换位/删格退页）。见 docs/view/panel/petbag-impl.md §3.2、
// docs/view/panel/view-panels-pet.md §5.2（不变量 G1–G8）。纯逻辑，无 DOM、无表读取（谓词/比较器由上层注入）。
//
// 模型：grid 包一个**槽数组** items（背包是定长 12 含 null；仓库是变长、无 null）。
// 它只回答"第几页该显示哪几格、当前选中谁"，数据本体仍由装配层/actions 就地改 items 引用（S4）。
import { PAGE_SIZE } from './constants.js'

export function createGrid({ capacity = null, items, pageSize = PAGE_SIZE, pageMode = 'NewPage' } = {}) {
  if (!Array.isArray(items)) throw new Error('grid: items 必须是数组')
  if (pageMode !== 'NewPage') throw new Error('grid: 本代只实现 pageMode=NewPage（背包只用它，其余两档不建分支）')
  // G1 单一容量真值：给了 capacity 就钉死长度，灌入长度不符 ⇒ 抛（不 Array.Resize，解 A7）。
  if (capacity != null && items.length !== capacity) {
    throw new Error(`grid G1: items.length(${items.length}) != capacity(${capacity})，拒绝 resize`)
  }

  let page = 0
  let cursor = 0            // G2：游标是**页内下标**（相对"视图序列"），对外不露全局数
  let filter = null         // 谓词 pet -> bool
  let sorter = null         // 比较器 (a,b) -> number

  // 视图序列 = 槽位映射 [{slot, pet}]；G3：sorter 先、filter 后（顺序不可换，否则分页边界抖）。
  function view() {
    let list = items.map((pet, slot) => ({ slot, pet }))
    if (filter) list = list.filter(x => x.pet != null && filter(x.pet))
    if (sorter) {
      list = [...list].sort((a, b) => {
        if (a.pet == null && b.pet == null) return a.slot - b.slot
        if (a.pet == null) return 1          // null 沉底（不参与比较器，解 C1 §5 死分支）
        if (b.pet == null) return -1
        return sorter(a.pet, b.pet) || (a.slot - b.slot)
      })
    }
    return list
  }

  const pageCount = () => Math.max(1, Math.ceil(view().length / pageSize))
  const clampPage = () => { if (page > pageCount() - 1) page = pageCount() - 1; if (page < 0) page = 0 }
  const pageIndex = () => page * pageSize + cursor   // 视图序列里的绝对下标

  const api = {
    items: () => items,
    page: () => page,
    pageCount,
    cursor: () => cursor,
    // G2：只交出**对象**，不对外露全局下标。
    selectedItem: () => { const v = view()[pageIndex()]; return v ? v.pet : null },
    selectedSlot: () => { const v = view()[pageIndex()]; return v ? v.slot : -1 },

    // 当前页要画的格子：[{slot, pet}]（G8：无 filter 时空槽照画，不压缩）。
    cells: () => { clampPage(); return view().slice(page * pageSize, page * pageSize + pageSize) },

    // G4 单选不可取消：再点同一格不取消；越界夹到本页尾格。
    select(i) { const n = api.cells().length; cursor = Math.max(0, Math.min(n - 1, i | 0)); return api },

    setPage(n) { page = n | 0; clampPage(); cursor = 0; return api },
    next() { if (page < pageCount() - 1) { page++; cursor = 0 } return api },
    prev() { if (page > 0) { page--; cursor = 0 } return api },

    setFilter(fn) { filter = fn; clampPage(); if (!view().some(x => x.slot === api.selectedSlot())) cursor = 0; return api },  // G5：被筛掉才回落
    setSorter(fn) { sorter = fn; clampPage(); return api },
    // A8：Reset = 三项全清（filter + sorter 一起复位；星级由上层再清它自己的钮）。
    resetFilters() { filter = null; sorter = null; page = 0; cursor = 0; return api },

    // G7 拖拽/换位两端非空；空格不许拖。a、b 是**槽下标**（由点击格子的 slot 交出）。
    swap(a, b) {
      if (a === b) return false
      if (a < 0 || b < 0 || a >= items.length || b >= items.length) return false
      if (items[a] == null || items[b] == null) return false     // 两端都必须有宠
      const t = items[a]; items[a] = items[b]; items[b] = t
      return true
    },

    removeAtSlot(slot) {
      if (slot < 0 || slot >= items.length || items[slot] == null) return false
      // 定长背包：空槽就置 null（不 splice，否则破坏 capacity 真值）。变长仓库由装配层重排。
      items[slot] = null
      api.refresh()
      return true
    },

    // G6 删格退页：删除导致视图只剩"count % pageSize == 1"时，回上一页。
    refresh() {
      const n = view().length
      clampPage()
      if (n > 0 && n % pageSize === 1 && page > 0) { page--; }
      if (!view().some(x => x.slot === api.selectedSlot())) cursor = 0
      return api
    },
  }
  return api
}
