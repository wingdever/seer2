// L3 · 图鉴 9 格位表（docs/view/panel/dex/dex-impl.md §2.3；正本 = 上游 Panel.prefab 的 `Pets` 330×340）。
// **数据表、不是散在各处的魔法数**（同 view/minimap/blocks.js 的做法）：视图里不许现算坐标（V-2）。
// 抄自 `PetDictionary/Panel.prefab` 里 9 个 `DictPetSelectButton` 实例的 m_AnchoredPosition override
// （上游 = 左上原点、y 向下为负）⇒ 换算成 DOM：`x = 20 + 105·col`、`y = 15 + 110·row`。
export const DEX_CELL_W = 75      // DictPetSelectButton 根 m_SizeDelta {75,75}
export const DEX_CELL_H = 75
export const DEX_HAVE_W = 50      // `have` 角标 {50,32}
export const DEX_HAVE_H = 32
export const DEX_LIST_W = 330     // `Pets` 容器
export const DEX_LIST_H = 340

// 9 格（下标 = 页内格序，与 grid.cells() 顺序一致）。
export const DEX_CELL_SLOTS = [
  { x: 20, y: 15 }, { x: 125, y: 15 }, { x: 230, y: 15 },
  { x: 20, y: 125 }, { x: 125, y: 125 }, { x: 230, y: 125 },
  { x: 20, y: 235 }, { x: 125, y: 235 }, { x: 230, y: 235 },
]
