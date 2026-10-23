// L1 · 精灵背包常量（无 DOM、无存档知识）
// 权威 = docs/save/save-design.md §7（petBag 定长 12：前 6 应战 / 后 6 候选）。
// 见 docs/view/panel/petbag-impl.md §3.1 / docs/view/panel/view-panels-pet.md §5.3。
// ⚠️ 这些是**目标态**常量；今天装配层用 v3 A.state 造 petBag 的 stub（见 mapScene），不在此文件。

export const BAG_SIZE = 12      // petBag 定长
export const TEAM_SIZE = 6      // 前 6 = 应战编队
export const PAGE_SIZE = 6      // 网格条一行 6 格 = grid.pageSize（上游 Pets 948×124 / 6）
export const CANDIDATE_FROM = 6 // petBag[6..11] = 候选区
export const EMPTY = null       // 空槽是 null（存档里 xsi:nil），不是省略
