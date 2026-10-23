// L1 · petBagSource —— "背包指哪个数组 + 谁能写盘"的**单一真值**（解 A5：上游同一段 mode switch 抄三遍）。
// View / grid / actions **全部**从这里取，禁止自己 switch(host)。见 docs/view/panel/petbag-impl.md §3.1、
// docs/view/panel/view-panels-pet.md §5.1（S1–S5）。
// 纯对象：零 DOM、零 fetch、不 import content（表数据经注入的 describePet，L1 不碰 L2）。

// host id → 该宿主的写盘政策（persist）。C1 §1.2 的六宿主。
const POLICY = {
  normal: 'repository',   // 地图角落宠 → 落存档（经 R4）
  pvp: 'none',            // 房间给的候选数组，非存档 ⇒ 不写盘（照搬上游"这两路不落盘"，它是对的）
  yiterogue: 'host',      // 肉鸽自带 petBag[6]，由肉鸽线自己落盘
  door: 'none',           // 只读前 N
  story: 'none',          // 剧情只读
  dictionary: 'none',     // 全量只读（图鉴**面板**已立项，但走独立只读面板、不走本机 ⇒ 见下 throw）
}

export function createPetBagSource({ host, bag, storage = null, describePet = null } = {}) {
  if (!(host in POLICY)) throw new Error(`petbag source: 未知 host '${host}'`)
  // S5：接口位保留。**VP5（2026-10-17 "本代不做图鉴宿主"）已于 2026-10-19 反转**，但反转的是**图鉴面板**本身
  // ⇒ 正本 = docs/view/panel/dex/dex-design.md（§8 DX0-d：不内嵌背包 ⇒ 示例宠背包 / 测试对战仍不做）。
  // 因此 host='dictionary' 这条路**照旧构造即抛**（事后灌数据也不行）。
  if (host === 'dictionary') throw new Error("petbag source: host='dictionary' 未实现（图鉴 = 独立面板，见 dex-design.md DX0-d）")
  if (!Array.isArray(bag)) throw new Error('petbag source: bag 必须是数组引用')
  const persist = POLICY[host]
  const readOnlyHosts = new Set(['door', 'story', 'dictionary'])

  return {
    host: () => host,
    bag: () => bag,
    storage: () => storage,
    // S2：能否写盘**只在这里决定**；actions 一律据它给 write 字段（解 A1"开面板即写盘"）。
    canPersist: () => persist === 'repository',
    persist: () => persist,
    readOnly: () => readOnlyHosts.has(host),
    // S3：无 SetMode；构造必须给 host，事后只能换数组内容（如 PVP 灌候选）。
    setBag: (next) => { if (!Array.isArray(next)) throw new Error('setBag: 需要数组'); bag = next },
    setStorage: (next) => { storage = next },
    describePet,   // 注入的取表器（L1 若需要属性走它，不 import content）
  }
}
