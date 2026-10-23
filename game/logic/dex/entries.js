// L1 · 图鉴行集构建（docs/view/panel/dex/dex-design.md DX3/DX6；施工 dex-impl.md §1.3）。
// 纯：无 DOM、不取数、不读表（838 行原始记录与 topicIds 由装配层注入）。
// 行对象**原样透传** ⇒ 视图零算数的前提（V-2）。

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// 一页 9 格（正本 = 报告 restart-dex-panel.md §6 的 capacity:9；与背包的 PAGE_SIZE=6 不同）。
export const DEX_PAGE_SIZE = 9

// 两档可见集合 + 各自默认序。
//   All   = 可见 788，`ui.defaultId` 升 → 同值再 `ui.subId` 升（= 上游 PositiveId 的正确读法）
//   Topic = version.xml 的 topicPetIds，**保持 XML 原序、不排**（上游 `Select(GetExamplePet)` 不排序）
// 两档**都**滤 hide（修 restart-dex-panel.md §13 A6：上游只 All 档滤）。
export function buildDexEntries(rows, { mode = 'All', topicIds = [] } = {}) {
  const visible = (rows || []).filter((r) => r && r.ui && r.ui.hide !== true)
  if (mode === 'Topic') {
    const byId = new Map(visible.map((r) => [Number(r.id), r]))
    return (topicIds || []).map((id) => byId.get(Number(id))).filter(Boolean)
  }
  return [...visible].sort((a, b) => (num(a.ui.defaultId) - num(b.ui.defaultId)) || (num(a.ui.subId) - num(b.ui.subId)))
}
