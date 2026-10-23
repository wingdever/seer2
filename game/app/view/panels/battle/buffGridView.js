// R3/R2 buff 网格（docs/view/scene/battle/view-scene-battle-impl.md §6.3）。一个模块两种用法：
//   宠侧印记 = .rbb-buffs（我方左起 / 敌方右起）；全局 + 天气 = .rbb-statebuffs（顶中，左起）。
// 上游只有一份逻辑（BattlePetBuffView.cs），所以这里也只有一份：过滤 hide + 按 sortPriority **升序**（:53 `OrderBy`），
// 这两条是**上游 view 自己的行为**、读的是 core 字段（hide / info.sortPriority），不是本地业务规则（§0.2 允许项）。
// 天气 = 首格：上游 BattleSystemView.cs:123-137 `if (weather != 0) stateBuffs.Insert(0, weatherBuff)` ⇒
// 「无天气」这四个字在本 HUD 里不存在，那一格不产出节点（铁律 6）。
import { el, text, mountImg, buffIconUrl } from './_kit.js'

const PITCH = 32      // buffBlockSize —— 格尺寸同值，写在 CSS（§7 那行「格 32×32」）
const PER_ROW = 7     // numInOneRow
const LIMIT = 7       // numLimitExtend —— B3 先不接「展开」虚拟格 ⇒ 超过就裁掉并留 data-truncated（§6.3）

// 一格：`.rbb-buff` 的底件是 CSS 里的 85.png（缺省图标位，HelperUI.cs:200），图标另叠一层 <img>。
function cell(b, index, layout) {
  const c = el('rbb-buff')
  c.dataset.buffId = String(b.id ?? 0)
  const col = Math.floor(index / PER_ROW), row = index % PER_ROW
  const off = `${row * PITCH}px`
  c.style.left = layout === 'right' ? 'auto' : off
  c.style.right = layout === 'right' ? off : 'auto'
  c.style.top = `${col * PITCH}px`

  const icon = el('rbb-buff-icon')
  mountImg(icon, buffIconUrl(b.info?.resId ?? b.id), 'rbb-buff-img')   // 缺图 ⇒ data-asset-missing，不换图（铁律 5）
  c.append(icon)

  // BattlePetBuffBlockView.cs:33-37 —— value 为 0 时那个数字节点根本不建。
  const v = b.value ?? 0
  if (v !== 0) c.append(text('rbb-buff-val', String(v)))

  // 回合数直读 core 的 buff.turn（内核未接 RoundStart 倒数 ⇒ 静态初值口径，同旧 buffView 头注那句）。
  c.title = `${b.name || '?'}\n持续 ${b.turn} 回合`
  return c
}

// create(container, { layout }) → update(buffs)
// buffs = core 的 Buff[]（driver.buffsOf / driver.stateBuffs 原样转发 + weatherBuff 打头），不改字段、不投影。
export function create(container, { layout = 'left' } = {}) {
  return function update(buffs) {
    container.textContent = ''
    const list = (buffs ?? []).filter((b) => b && !b.hide)
      .slice().sort((a, b) => (a.info?.sortPriority ?? 0) - (b.info?.sortPriority ?? 0))
    if (list.length > LIMIT) container.dataset.truncated = String(list.length - LIMIT)
    else delete container.dataset.truncated
    list.slice(0, LIMIT).forEach((b, i) => container.append(cell(b, i, layout)))
  }
}
