// Hintbox —— 重启里最常用的通用提示框，也是 UI 线第一个手写样板（docs/view/ui-handoff.md §7 U0）。
// 上游权威：Panels/Hintbox/Panel.prefab（遮罩）+ "Panel Without Background".prefab（盒体）+ Scripts/Hintbox.cs。
// 几何与色值照 prefab 抄（单位 = 960x540 逻辑像素，样式在 game/app/ui.css 的 Hintbox 段）；
// 素材照 Sprites/Game/Hint Box/*.png 就地引（docs/view/ui-handoff.md §10：先别下载）。
import { openPanel } from './host.js'

const SPRITE = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Hint%20Box'
const url = (file) => `url("${SPRITE}/${file}")`

// 三态精灵 = prefab 的 SpriteState：normal / Highlighted / Pressed
const SKINS = {
  confirm: ['confirm.png', 'confirm_hover.png', 'confirm_click.png'],
  cancel: ['cancel.png', 'cancel_hover.png', 'cancel_click.png'],
}

const mk = (cls, img) => {
  const el = document.createElement('div')
  el.className = cls
  if (img) el.style.backgroundImage = url(img)
  return el
}

function mkButton(skin, mod, onClick) {
  const b = document.createElement('button')
  b.className = `rb-btn ${mod}`
  b.style.setProperty('--n', url(SKINS[skin][0]))
  b.style.setProperty('--h', url(SKINS[skin][1]))
  b.style.setProperty('--p', url(SKINS[skin][2]))
  b.onclick = onClick
  return b
}

// Hintbox.OpenHintboxWithContent 的对应物：标题「提示」、1 个确认键、正文 14px。
// 其余字段留给调用方，全给默认值时就是 prefab 的原样（optionNum 默认 2 是 prefab 序列化值，
// 代码里 HintboxModel.optionNum 初值是 1 —— 两个都真实存在，这里跟 prefab 走）。
export function openHintbox({
  title = '提示',
  content = '',
  contentHtml = null,        // 富文本口：上游 Hintbox 正文走 TMP `<color=#hex>`；调用方**必须已转义**（只放白名单标签）
  contentSize = 20,
  optionNum = 2,
  withBackground = true,   // Panel.prefab 把 isWithBackground 覆写成 1，所以实例化的 Hintbox 带遮罩
  onConfirm,
  onCancel,
} = {}) {
  return openPanel('Hintbox', (root, api) => {
    const done = (cb) => { api.close(); cb?.() }

    if (withBackground) root.append(mk('rb-scrim'))

    const box = mk('rb-box')
    root.append(box)

    // View（全拉伸）> [Bottom Decorate / Corner Decorate / Position Adjust]；
    // Position Adjust 是全拉伸的纯过路节点，拍平不建。
    const view = mk('rb-view')
    box.append(view)
    view.append(
      mk('rb-bottom-decorate', 'Hint Box Bottom Decorate.png'),
      mk('rb-corner-decorate', 'Hint Box Corner Decorate.png'),
    )

    const t = mk('rb-title')
    t.textContent = title
    const c = mk('rb-content')
    if (contentHtml != null) c.innerHTML = contentHtml
    else c.textContent = content
    c.style.fontSize = `${contentSize}px`
    const opts = mk('rb-options')
    view.append(t, c, opts)

    // One Option 容器下 Confirm 在 x=0；Two Options 容器下 Confirm/Cancel 在 x=∓60。
    // 两个容器都是全拉伸的过路节点，拍平成按钮的定位修饰类。
    if (optionNum <= 1) {
      opts.append(mkButton('confirm', 'rb-btn--single', () => done(onConfirm)))
    } else {
      opts.append(
        mkButton('confirm', 'rb-btn--confirm', () => done(onConfirm)),
        mkButton('cancel', 'rb-btn--cancel', () => done(onCancel)),
      )
    }
  }, { scrim: false })
}