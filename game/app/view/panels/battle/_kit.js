// U1 战斗面板共享小工具：素材 URL、DOM 构造、元素读数。面板一律只读 game/core/** 的数字（§6/D2），
// 这里只负责「把内核给的数画出来」，不在面板里重算任何战斗数值。
import { ELEMENT_NAMES, ELEMENT_COLORS } from '/game/core/pet/element.js'

const FIGHT = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Fight'
const MAP = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map'
// 空格要 %20 编码才能命中文件（照 hintbox.js 的口径）。
export const sprite = (file) => `${FIGHT}/${file.replace(/ /g, '%20')}`
export const bg = (file) => `url("${sprite(file)}")`
export const mapSprite = (file) => `${MAP}/${file.replace(/ /g, '%20')}`
export const mapUrl = (file) => `url("${mapSprite(file)}")`

export const el = (cls, style) => {
  const e = document.createElement('div')
  if (cls) e.className = cls
  if (style) Object.assign(e.style, style)
  return e
}
export const text = (cls, s, style) => { const e = el(cls, style); e.textContent = s; return e }

export const elementName = (id) => ELEMENT_NAMES[Number(id)] || ELEMENT_NAMES[0]
export const elementColor = (id) => ELEMENT_COLORS[Number(id)] || '#ccc'

// 血条/怒条：固定 barW 宽的精灵，按分数从右往左抽干（内核给 hp/maxHp，这里只算宽度比，不改数值）。
// 注意：这张是**旧 U1** 的两层条，只服务地图线/背包（.rbh-hp/.rbp-hp）；战斗新 HUD 用下面的 fitBar()（单层 mask，§2.4）。
export function bar(cls, barW, barH) {
  const track = el(cls, { width: barW + 'px', height: barH + 'px' })
  const fill = el('rbb-bar-fill')
  fill.style.backgroundSize = barW + 'px 100%'
  track.append(fill)
  return { track, fill, set(frac) { fill.style.width = Math.max(0, Math.min(1, frac)) * barW + 'px' } }
}

// ── 战斗 HUD 复刻（docs/view/scene/battle/view-scene-battle-impl.md §4 F2）───────────────────────────
const BUFF = '/projects/Seer2-Restart-Lite-main/Resources/Buffs'
const EMBLEM = '/projects/Seer2-Restart-Lite-main/Resources/Emblems'
const PETIC = '/projects/Seer2-Restart-Lite-main/Resources/Pets/icon'
const PETBT = '/projects/Seer2-Restart-Lite-main/Resources/Pets/battle'
const CRY = '/projects/Seer2-Restart-Lite-main/Resources/BGM/pet'
const ELEM = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Elements'
// buff 格 / 物品格的底件在 Panels/OldPetBag/Sprites 下（85.png 86×86、87.png 89×89），不在 Sprites/Fight。
const PANEL = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Panels'
export const panelSprite = (file) => `${PANEL}/${file.replace(/ /g, '%20')}`

// buff 图标路由 = Resources/Buffs/{resId}.png（§2.1 关掉了设计 §10 #3；resId 读 core 的 BuffInfo.resId）。
export const buffIconUrl = (resId) => `${BUFF}/${Number(resId)}.png`
// 纹章图标路由 = Resources/Emblems/{baseId}.png。上游 BuffInfo.GetIcon：纹章 buff 先试 Buffs/{resId}（实测盘上全缺）⇒ 回落 Emblems/{id%100000=baseId}（PetFeatureInfo.Emblem.GetSprite → PetUISystem.GetEmblemIcon）。
export const emblemIconUrl = (baseId) => `${EMBLEM}/${Number(baseId)}.png`
// 头像键：pet.id ?? pet.baseId —— icon/ 那 990 张是 **petId** 命名（设计 §4.1 表写 baseId 是笔误，§14 ①）。
export const petIconUrl = (petId) => `${PETIC}/${Number(petId)}.png`
// 重启战斗形象：Resources/Pets/battle/{petId}.png（与 icon 同源同根；战斗舞台缺 swf 时回退用它）。
export const petBattleUrl = (petId) => `${PETBT}/${Number(petId)}.png`
// 属性图标：Elements/0..25.png（场景里那个 GUID 是丢失资产，走运行时路由，同 PetUISystem.cs:80）。
export const elementIcon = (elemId) => `${ELEM}/${Number(elemId)}.png`
// 图鉴叫声 = Resources/BGM/pet/{petId}.mp3（⚠️ **按 petId、不是 skinId**；根 = `Resources/` 镜像，与头像同根，
// 不是 `Assets/Resources/`）。覆盖率 667/788【实测】⇒ 缺音由调用处一行日志交代，绝不播别人的声音。
export const petCryUrl = (petId) => `${CRY}/${Number(petId)}.mp3`

// 挂图并自陈缺失：拿不到就把节点摘掉、在容器上留痕，**绝不静默换成别的图**（铁律 5）。
export function mountImg(host, url, cls = '') {
  const img = document.createElement('img')
  if (cls) img.className = cls
  img.alt = ''
  img.draggable = false
  img.src = url
  img.onerror = () => {
    img.remove()
    host.dataset.assetMissing = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
  }
  host.append(img)
  return img
}

// Unity 的 m_Color × sprite 在 DOM 侧的等价物：**一层** —— 遮罩图定形，background-color 定色，
// 条宽 = 轨长 × 比例（BattlePetStatusView.cs:55-62 改的就是持有 mask 的那张 Image 自己，没有独立轨道）。
// 遮罩 PNG 比轨长宽（282 vs 260 / 261 vs 246）是两端的斜切帽，上游满血也压到轨长 ⇒ 这里同样按 100% 100% 拉。
export function fitBar({ trackCls, fillCls, maskUrl, box }) {
  const track = anch(trackCls, box)
  const fill = el(fillCls)
  const m = `url("${maskUrl}") 0 0 / 100% 100% no-repeat`
  fill.style.webkitMask = m
  fill.style.mask = m
  track.append(fill)
  const [,, trackLen] = box
  return {
    track,
    fill,
    set(frac, colorCss) {
      const p = Math.max(0, Math.min(1, frac))
      fill.style.width = `${Math.round(p * trackLen)}px`
      if (colorCss) fill.style.backgroundColor = colorCss
    },
  }
}

// 锚定盒：960×540 设计像素、左上原点（同设计文档口径）。
// edge='bottom' ⇒ 用 CSS bottom，且**基准恒为参考高 540**（= Unity 底锚 offset），
// 这样 match 画布模式下逻辑高随窗口变时，贴底的那批（底栏/页签簇/把手/圆钮）仍贴屏幕底，
// 而顶带贴 top:0 ⇒ 两头都不被裁（这正是 §3.1 要解决的问题）。
const REF_H = 540
export function anch(cls, box, edge = 'top') {
  const [l, t, w, h] = box
  const e = el(cls, { position: 'absolute', left: `${l}px`, width: `${w}px`, height: `${h}px` })
  if (edge === 'bottom') { e.style.top = 'auto'; e.style.bottom = `${REF_H - (t + h)}px` }
  else e.style.top = `${t}px`
  return e
}
