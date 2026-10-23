// L1 出伤帧表（战斗舞台**纯表现层**用，不碰任何数值；数值全在 game/core/** 经 coreBattleDriver）。
//
// 真值 = 上游内嵌 `HitInfoConfig__hitData.xml`（键 = swfId/id，1711 行，vendor 只读参考）。
// 设计 / as-built = docs/view/scene/battle/view-scene-battle-impl.md §17.10（等打击帧） / §17.16（异步加载） / §17.17（0 列中位数代理）。
//
// 列映射（skillKind → 表列）：
//   physic      → physics  （物理攻击）
//   special     → special  （特殊攻击）
//   property    → attribute（属性攻击）
//   super       → critical （必杀攻击）
//   intercourse → fit      （合体攻击）
// 公式：ms = 表值 / 1.07 × 40（40 = ClientConfig.timeRate，即 25fps 的 ms/帧；/1.07 是表按旧 28fps 配的折算，见 xml 头注释）。
// 列为 0（= 该宠该列未配，AS3/Unity 两套一致、非缺失）：取同行其它「非 0 列」的中位数当代理（§17.17，有意偏离上游"立即"）。
// 整行缺失 / 无可用代理：返回 { ms: null, proxy: false }（调用方改等动画演完 / STEP_MS）。

const XML_URL = '/vendor/seer2-origin-as3/src/_assets/3_com.taomee.seer2.app.arena.util.HitInfoConfig__hitData.xml'

const KIND_TO_COL = {
  physic: 'physics',
  special: 'special',
  property: 'attribute',
  super: 'critical',
  intercourse: 'fit',
}

const MS_PER_FRAME = 40   // ClientConfig.timeRate：25fps → 40ms/帧
const FPS_SCALE = 1.07    // 表按旧 28fps 配，真实帧 = 表值 / 1.07

let table = null          // Map<id, {physics,attribute,special,critical,fit}>（值 = 原始帧数，未折算 ms）
let loading = null        // Promise<table>，并发调用共享同一趟 fetch

function msOf(rawValue) {
  if (rawValue == null) return null
  return (rawValue / FPS_SCALE) * MS_PER_FRAME
}

// 解析 XML：用浏览器原生 DOMParser，不引入三方依赖（vendor 为只读参考、静态服务直服，见 README/tools 分层）。
function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const map = new Map()
  const nodes = doc.getElementsByTagName('fighter')
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i]
    const id = el.getAttribute('id')
    if (id == null) continue
    map.set(id, {
      physics: Number(el.getAttribute('physics')) || 0,
      attribute: Number(el.getAttribute('attribute')) || 0,
      special: Number(el.getAttribute('special')) || 0,
      critical: Number(el.getAttribute('critical')) || 0,
      fit: Number(el.getAttribute('fit')) || 0,
    })
  }
  return map
}

// 懒加载：首次触发 fetch，之后复用缓存；失败不抛死（调用方退兜底）。loading 在失败时置回 null ⇒ 下一场可重试一次。
export function ensure() {
  if (table !== null) return Promise.resolve(table)
  if (loading) return loading
  loading = (async () => {
    try {
      const res = await fetch(XML_URL)
      if (!res.ok) throw new Error('hit-info http ' + res.status)
      const text = await res.text()
      table = parseXml(text)
      return table
    } catch (e) {
      console.warn('[hit-info] 出伤帧表加载失败，演出将退回兜底节奏：', e && e.message)
      loading = null   // 允许重试
      throw e
    }
  })()
  return loading
}

// 预热（restartFighterStage.create() 里调）：触发加载、失败不阻塞。
export function preloadHitInfo() {
  ensure().catch(() => {})
}

// 取中位数（偶数个取中间偏下那一枚）。
function median(values) {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : s[mid - 1]
}

// 查表：返回 { ms, proxy }。ms === null 表示"等动画演完"（调用方逻辑），proxy=true 标"中位数代理"。
export async function hitDelayMsForShow(swfId, kind) {
  let t
  try {
    t = await ensure()
  } catch {
    return { ms: null, proxy: false }
  }
  if (!t) return { ms: null, proxy: false }

  const row = t.get(String(swfId))
  if (!row) return { ms: null, proxy: false }   // 整行缺失 → 兜底

  const col = KIND_TO_COL[kind]
  if (!col) return { ms: null, proxy: false }    // 未知 kind → 兜底

  const raw = row[col]
  if (raw && raw > 0) {
    return { ms: msOf(raw), proxy: false }
  }

  // 该列配 0（含缺失）：取同行其它非 0 列的中位数当代理（§17.17）。
  const others = Object.values(row).filter((v) => v && v > 0)
  const proxyRaw = median(others)
  if (proxyRaw == null) return { ms: null, proxy: false }  // 全 0 → 兜底
  return { ms: msOf(proxyRaw), proxy: true }
}
