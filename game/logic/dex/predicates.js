// L1 · 图鉴谓词与比较器工厂（docs/view/panel/dex/dex-impl.md §4 表 + DXB3）。
// 纯：只产函数、不碰 DOM、不读表（L3 纪律：视图经 opts.logic 注入，本件不进视图目录）。
//
// 约定（与装配口 game/app/view/dex/index.js 配套）：
//   - 各工厂在「无筛选」时返回 null（不是匹配一切的谓词），
//     由 combineAnd 把 null 集折叠成 null ⇒ grid.setFilter(null) = 全部语义。
//   - combineAnd 为**变参**：combineAnd(elementPredicate(st.elemId), nameOrIdPredicate(st.query))。
//   - 条目（entry）字段：id / name / elementId / subElementId 顶层；ui.{defaultId,subId,star,hide} 在 ui 下。

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// 元素谓词：entry.elementId===E || (subElementId===E && subElementId!==0)。
// E 为「未选」（-1 / 0 / 空 / null）⇒ 返回 null（不过滤）。
export function elementPredicate(E) {
  if (E == null || E === -1 || E === 0 || E === '') return null
  const e = Number(E)
  return (entry) => num(entry.elementId) === e || (num(entry.subElementId) === e && num(entry.subElementId) !== 0)
}

// 查询谓词：纯数字 ⇒ 行 id 精确匹配；否则 name 子串（区分大小写）。
// 空查询 ⇒ 返回 null（不过滤）。
export function nameOrIdPredicate(query) {
  const q = (query == null ? '' : String(query)).trim()
  if (q === '') return null
  if (/^\d+$/.test(q)) {
    const id = Number(q)
    return (entry) => num(entry.id) === id
  }
  return (entry) => String(entry.name || '').includes(q)
}

// 比较器工厂：
//   'star'    = 按 ui.star 降序、同星按 ui.defaultId 升（修 A3）
//   'reverse' = 默认序（defaultId 升 / subId 升）的逆序 = 逆向
//   'normal'  = null（不挂比较器，保留 buildDexEntries 的默认序；DXB3：Topic 档原序不能重排）
// 其余未知 ⇒ null。
export function sorterOf(option) {
  if (option === 'star') {
    return (a, b) => (num(b.ui && b.ui.star) - num(a.ui && a.ui.star))
      || (num(a.ui && a.ui.defaultId) - num(b.ui && b.ui.defaultId))
  }
  if (option === 'reverse') {
    return (a, b) => (num(b.ui && b.ui.defaultId) - num(a.ui && a.ui.defaultId))
      || (num(b.ui && b.ui.subId) - num(a.ui && a.ui.subId))
  }
  return null   // 'normal' 及未知：不排序
}

// 谓词 AND 叠加（变参）。任一为 null/假 ⇒ 忽略；全部忽略 ⇒ 返回 null（= 全部）。
export function combineAnd(...fns) {
  const real = fns.filter(Boolean)
  if (real.length === 0) return null
  return (entry) => real.every((fn) => fn(entry))
}
