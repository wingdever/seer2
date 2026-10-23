// L1 · 图鉴「已获得」角标（docs/view/panel/dex/dex-design.md DX4；施工 dex-impl.md §1.3）。
// 纯：不读表、不碰 DOM —— 进化链经注入的 evolveTargetsOf(petId) => number[] 给出。

// 背包 12 槽 + 仓库 ⇒ Set<petId>（null 槽跳过；重复槽位由 Set 天然去重）。
export function buildOwnedIds(petBag, petStorage) {
  const owned = new Set()
  for (const list of [petBag, petStorage]) {
    for (const pet of (list || [])) {
      const id = Number(pet && pet.petId)
      if (Number.isFinite(id)) owned.add(id)
    }
  }
  return owned
}

// 条目 D 亮 ⇔ 拥有 D 本身，**或**沿 evolvePetIds 递归走到某只已拥有的形态。
// ⚠️ 方向不对称 = 上游原样（restart-dex-panel.md §13 A8）：拥有进化形 ⇒ 祖先一起亮；反之不亮。
// ⚠️ 链**不看进化等级** ⇒ 目标必须来自原始 evolvePetIds（含 at=0 的道具/特殊进化），
//   不许复用 L2 里那个"只留 at>0"的升级进化 getter（谓词不同 = dex-design DX4 第 2 条）。
// 链上目标不在表里 ⇒ evolveTargetsOf 回空数组 = **链断、不抛**（上游 Pet.GetPetInfo 无空判断会 NRE，本发行数据悬空 0 条）。
export function isOwned(entry, ownedIds, evolveTargetsOf) {
  const start = Number(entry && entry.id)
  if (!Number.isFinite(start) || !ownedIds || ownedIds.size === 0) return false
  const seen = new Set([start])
  const stack = [start]
  while (stack.length) {
    const cur = stack.pop()
    if (ownedIds.has(cur)) return true                 // 拥有条目本身
    for (const to of (evolveTargetsOf ? evolveTargetsOf(cur) : [])) {
      const next = Number(to)
      if (!Number.isFinite(next) || seen.has(next)) continue   // 回边（2→1）靠 seen 挡住
      seen.add(next)
      stack.push(next)
    }
  }
  return false
}
