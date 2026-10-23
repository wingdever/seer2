// 疑难指引面板 L4 渲染（View 线 C3·GuideLine · DOM 自绘最小 UI，形状照 view/dex + view/godpet）。
// 真值 = 上游 Assets/Resources/Panels/GuideLine/Panel.prefab（空壳脚本 GuideLinePanel.cs，逻辑全在复用 MVC）。
// 几何逐条抄 RectTransform（960×540 逻辑像素、左上原点）：窗 570×400@(195,70)、页签 100×30@y130、
// 属性格 40×40（x=208+44c, y=200+44r）、关系区 120/120/50×190@y220、脚注 y420、性格视口 510×230@(227,220)。
// 纪律：零 import game/logic/** / session；查表算术全在 L0（element.ts/status.ts），本文件只排 DOM。
import { el, text, mountImg, panelSprite, elementIcon } from '../panels/battle/_kit.js'
import {
  ELEMENT_COUNT, elementNameOf, elementRelationLists,
  PERSONALITY_STAT_NAMES, personalityRows, personalityBuffDescription,
} from '../../content.js'

// Green Esc 在 Assets/Resources/Sprites/Game/Hint Box/（不在 panelSprite 的 Panels/ 根下），同 dex/minimap 做法。
const HINTBOX = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Hint%20Box'

const PAGES = ['属性攻击', '属性防守', '性格查询']
const SECTIONS = ['weak', 'resist', 'zero']

// 关系区文案：攻击页问"我打谁"，防守页问"谁打我"（PetElementView.cs:39-42 的两套谓词）。
const COPY = {
  attack: { weak: '克制', resist: '微弱', zero: '无效', verb: '伤害' },
  defense: { weak: '被克制', resist: '被微弱', zero: '被无效', verb: '受到伤害' },
}

// buildGuidePanel(ctx) → { render }。ctx = { root, onClose, onNoob }。
// onNoob = 「新手指引」跳转钮（上游 = 关本面板开 Noob；Noob 未建 ⇒ 装配层弹诚实提示，本面板不关）。
export function buildGuidePanel(ctx) {
  const { root, onClose, onNoob } = ctx

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => { if (onClose) onClose() })

  const box = el('rb-guide-box')

  const titleLine = el('rb-guide-titleline')
  mountImg(titleLine, panelSprite('ItemShop/Sprites/title line.png'))   // Panels/ItemShop/Sprites/title line.png
  const title = text('rb-guide-title', '疑难指引')

  const closeBtn = el('rb-guide-close')
  mountImg(closeBtn, `${HINTBOX}/Green%20Esc.png`)                      // 35×35，缺图自陈、不伪造
  closeBtn.title = '关闭'
  closeBtn.addEventListener('click', () => { if (onClose) onClose() })

  // ── 页签：4 颗钮，游标只跟 3 颗可切页签（对位 optionRects 只有 3 项）──
  const tabs = el('rb-guide-tabs')
  const cursor = el('rb-guide-cursor')
  mountImg(cursor, panelSprite('OldPetBag/Sprites/269.png'))            // [370,129,100,32] ⇒ 页签 0 在 x=120
  tabs.append(cursor)

  const noobTab = text('rb-guide-tab', '新手指引')
  noobTab.style.left = '0px'
  noobTab.title = '新手指引（Noob 面板，独立线待建）'
  noobTab.addEventListener('click', () => { if (onNoob) onNoob() })
  tabs.append(noobTab)

  const tabEls = PAGES.map((label, i) => {
    const t = text('rb-guide-tab', label)
    t.style.left = `${120 + i * 120}px`
    t.dataset.on = '0'
    t.addEventListener('click', () => showPage(i))
    tabs.append(t)
    return t
  })

  // ── 三页内容 ──
  const body = el('rb-guide-body')
  const pageViews = [
    buildElementPage('attack'),
    buildElementPage('defense'),
    buildPersonalityPage(),
  ]
  body.append(...pageViews.map((p) => p.page))

  let pageIndex = 0
  function showPage(i) {
    pageIndex = i
    cursor.style.left = `${120 + pageIndex * 120}px`
    tabEls.forEach((t, k) => { t.dataset.on = k === pageIndex ? '1' : '0' })
    pageViews.forEach((p, k) => { p.page.dataset.on = k === pageIndex ? '1' : '0' })
  }

  box.append(titleLine, title, closeBtn, tabs, body)
  root.append(scrim, box)
  showPage(0)                        // 上游 defaultSelect:1 ⇒ Select(0) = 属性攻击

  // 数据是静态表，update() 只需保持当前页（重开走宿主同名去重）。
  return { render: () => showPage(pageIndex) }
}

// ── 属性攻击 / 属性防守页 ──────────────────────────────────────────────────
function buildElementPage(mode) {
  const copy = COPY[mode]
  const page = el('rb-guide-page')

  // 左格：23 格 = 5×4 + 末行 3（id 行主序）；格位照预制 x=208+44c、y=200+44r（页内减窗偏移）。
  const grid = el('rb-guide-grid')
  const cells = []
  for (let id = 0; id < ELEMENT_COUNT; id++) {
    const c = el('rb-guide-cell')
    c.style.left = `${8 + 44 * (id % 5)}px`
    c.style.top = `${44 * Math.floor(id / 5)}px`
    c.title = elementNameOf(id)
    mountImg(c, elementIcon(id))
    c.addEventListener('click', () => select(id))
    grid.append(c)
    cells.push(c)
  }

  // 选中属性抬头：图标 + 「普通系」（预制占位带「系」；上游运行期 GetElementName 丢「系」，本面板取可读目标）。
  const head = el('rb-guide-elemhead')
  const headIcon = el('rb-guide-elemicon')
  const headName = text('rb-guide-elemname', '')
  head.append(headIcon, headName)

  // 三关系区：几何照预制 [435/565/695,220,120/120/50,190] ⇒ 页内 left 240/370/500、top 50。
  const secs = {}
  const secEls = []
  for (const key of SECTIONS) {
    const sec = el(`rb-guide-sec rb-guide-sec--${key}`)
    sec.style.left = key === 'weak' ? '240px' : key === 'resist' ? '370px' : '500px'
    sec.style.width = key === 'zero' ? '50px' : '120px'
    const secHead = el('rb-guide-sech')
    const count = text('rb-guide-sech-count', '0')
    secHead.append(text('rb-guide-sech-name', copy[key]), count)
    const slots = el('rb-guide-slots')
    sec.append(secHead, slots)
    secEls.push(sec)
    secs[key] = { count, slots }
  }

  // 脚注：防守页不复用攻击页原句（上游复制粘贴致语义错位，报告 A6）。
  const note = el('rb-guide-note')
  note.append(
    text('rb-guide-red', copy.weak),
    document.createTextNode(`表示${copy.verb}2倍　`),
    text('rb-guide-red', copy.resist),
    document.createTextNode(`表示${copy.verb}0.5倍`),
  )

  page.append(grid, head, ...secEls, note)

  let selected = 0

  function renderSection(key, list) {
    const { count, slots } = secs[key]
    count.textContent = String(list.length)
    slots.textContent = ''
    if (!list.length) { slots.append(text('rb-guide-empty', '—')); return }
    for (const id of list) {
      const b = el('rb-guide-ebtn')
      b.title = elementNameOf(id)
      mountImg(b, elementIcon(id))
      slots.append(b)
    }
  }

  function select(id) {
    selected = id
    cells.forEach((c, i) => { c.dataset.on = i === selected ? '1' : '0' })
    headIcon.textContent = ''
    mountImg(headIcon, elementIcon(selected))
    headName.textContent = `${elementNameOf(selected)}系`
    const rel = elementRelationLists(selected, mode)
    for (const key of SECTIONS) renderSection(key, rel[key])
  }

  select(0)                          // 预制占位 = 普通系
  return { page, select }
}

// ── 性格查询页：55 行列表（发行版唯一激活块）+ 自补表头 / 选中 / 底部说明 ─────────
function buildPersonalityPage() {
  const page = el('rb-guide-page')

  const head = el('rb-guide-phead')
  head.append(text('rb-guide-pname', '性格'))
  for (const name of PERSONALITY_STAT_NAMES) head.append(text('rb-guide-pcell', name))

  const list = el('rb-guide-plist')
  const desc = el('rb-guide-pdesc')

  const rows = personalityRows()
  const rowEls = rows.map((r) => {
    const row = el('rb-guide-prow')
    row.dataset.id = String(r.id)
    row.append(text('rb-guide-pname', r.name))
    for (const cell of r.cells) {
      const c = text('rb-guide-pcell', cell.text)
      c.dataset.tone = cell.tone
      row.append(c)
    }
    row.addEventListener('click', () => select(r.id))
    list.append(row)
    return row
  })

  let selected = 0
  function select(id) {
    selected = id
    for (const row of rowEls) row.dataset.on = Number(row.dataset.id) === selected ? '1' : '0'
    desc.textContent = personalityBuffDescription(selected)
  }

  page.append(head, list, desc)
  select(0)
  return { page, select }
}
