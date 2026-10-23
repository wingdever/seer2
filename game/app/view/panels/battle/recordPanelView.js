// R5 战斗记录面板（docs/view/scene/battle/view-scene-battle-impl.md §6.7）。上游 Bottom Bar/Record Scroll View：
// 盒 (280,245,360,180) 坐在底栏上沿、水平居中（中心 x=460）；正文 TMP 12px 白、SIMSUN SDF ⇒ Web 侧系统 CJK 降级。
// BattleOptionView.cs:39-43 在 Awake 里默认 Toggle ⇒ **默认收起**（截图那一格是空的 ⇒ 不画，铁律 6）。
// 把手不是固定件，是骑在面板沿上、随折叠位移 ±180 的沿贴件（:46-61 是代码权威）。
import { el, text, anch, mapSprite } from './_kit.js'

const PANEL = [280, 245, 360, 180]
const HANDLE = [552, 421, 56, 15]   // 收起态贴面板下沿（截图量测 552..608 / 421..436）
const STEP = 180                     // :48 那句 anchoredPosition.y += ±180

// 战报是内核 addReport 塞进来的富文本行（<color>/<size>），剥标签属表现层，不动数值（同旧 recordView 那句）。
const strip = (s) => String(s).replace(/<[^>]*>/g, '')

// create(parent) → { update(driver), toggle() }
export function create(parent) {
  const panel = anch('rbb-record', PANEL, 'bottom')     // 底锚：面板下沿恒贴底栏上沿（y=425），往上长 180
  panel.style.display = 'none'                          // 默认收起（§6.7）
  const body = el('rbb-record-body')
  panel.append(body)
  parent.append(panel)

  const COLLAPSED_BOTTOM = 540 - (HANDLE[1] + HANDLE[3])         // 收起态贴面板**下沿**（截图 552..608 / 421..436）
  const handle = anch('rbb-extend', HANDLE, 'bottom')
  parent.append(handle)

  let open = false
  function paint() {
    panel.style.display = open ? '' : 'none'            // harness 判据「收起态 display:none」
    // :48 那句 anchoredPosition.y += (isOn ? −1 : +1) × 180 ⇒ 把手是**骑在面板沿上跟着走**的沿贴件，不是固定件。
    handle.style.bottom = `${COLLAPSED_BOTTOM + (open ? STEP : 0)}px`
    handle.classList.toggle('rbb-extend--up', !open)
    handle.classList.toggle('rbb-extend--down', open)
    handle.style.backgroundImage = `url("${mapSprite(open ? 'down.png' : 'up.png')}")`
    // 唯一残留待核（§2.3）：ExtendButton 的 open/close GUID 在 Fight.unity 里没直读到 ⇒ 先按 收起=up/展开=down 实现并留痕。
    handle.dataset.tbd = 'handle-sprite'
    handle.title = open ? '收起战斗记录' : '展开战斗记录'
  }
  paint()

  function scrollToEnd() { body.scrollTop = body.scrollHeight }   // 上游 verticalNormalizedPosition = 0
  function toggle() { open = !open; paint(); if (open) scrollToEnd() }
  handle.addEventListener('click', toggle)

  return {
    toggle,
    get isOpen() { return open },
    update(driver) {
      body.textContent = ''
      for (const r of driver.reports()) body.append(text('rbb-line', strip(r)))
      if (open) scrollToEnd()
    },
  }
}
