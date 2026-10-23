// L3 - 一格（cellView.js）= 背包「队伍区」/ 仓库共用的一枚格子渲染。
// 真值 / 版式 = docs/view/panel/petbag-impl.md §4（C1 §4.1 更正 5，人类 2026-10-17 二轮实测 desc 1.3）。
// 调用方 = gridView.renderGrid（import { renderCell }）。
//
// DOM 结构（与 ui.css 的 .rbg-* 一一对应）：
//   .rbg-cell
//     .rbg-bg（铺满）            -> .rbg-frame（头像框层） / .rbg-mask（遮罩层） / .rbg-icon>img（本地 PNG）
//     .rbg-elem（元素点，内联底色）
//     .rbg-mark（首发 / 收藏，条件）
//     .rbg-strip（底部信息条）    -> .rbg-lv（Lv<n>） + .rbg-hp（弹性百分比，.rbb-bar-fill + 可选 .rbg-hptxt）
//   空槽 = .rbg-cell--empty（只画边框，不画上面这些；名字退为整格 title）。
//   名字不再常驻格内（旧 .rbg-name 已删）。血条分母 0 => width:0（不出现 NaN）。
// 注：.rbg-hp 的弹性百分比用本文件局部 hpBar()，刻意不往共享 _kit.js 加导出（§12.3 缓存坑）。
// frame/mask 偏移读百分比（m.off.frame/icon，1.0=原尺寸；v3 stub 不产出 off => 不缩放）。

import { el, petIconUrl, elementColor } from '../panels/battle/_kit.js'

// 局部血条：fill 宽度走百分比（与 _kit.bar() 的 px 口径互不影响，地图 HUD / 详情血条逐像素不变）。
function hpBar(frac, label) {
  const hp = el('rbg-hp')
  const f = Math.max(0, Math.min(1, Number(frac) || 0))
  const fill = el('rbb-bar-fill')
  fill.style.width = (f * 100).toFixed(2) + '%'
  hp.append(fill)
  if (label) {
    const t = el('rbg-hptxt')
    t.textContent = label
    hp.append(t)
  }
  return hp
}

// meta = metaOf(slot, pet) 产出：{ slot, empty, selected, mark?, petId?, elementId?, name?, level?, hpFrac?, hpLabel?, off? }
// onPick = 零参回调（gridView 已包成 () => onPick(slot)）。
export function renderCell(meta, onPick) {
  const cell = el('rbg-cell')
  if (meta.empty) {
    cell.classList.add('rbg-cell--empty')
    return cell   // 空格照画：只画虚线边框，不可点
  }

  cell.title = meta.name || ''
  if (meta.selected) cell.classList.add('rbg-cell--on')

  // 背景三层：frame（头像框）→ mask（遮罩）→ icon（本地 PNG）。
  const bg = el('rbg-bg')
  const frame = el('rbg-frame')
  const mask = el('rbg-mask')
  const icon = el('rbg-icon')
  const img = document.createElement('img')
  img.src = petIconUrl(meta.petId)
  img.alt = meta.name || ''
  icon.append(img)

  const off = meta.off || {}
  if (off.icon != null) icon.style.transform = 'scale(' + Number(off.icon) + ')'
  if (off.frame != null) frame.style.transform = 'scale(' + Number(off.frame) + ')'

  bg.append(frame, mask, icon)

  // 角标：元素点（内联底色，无 CSS 颜色）+ 标记（首发 / 收藏）。
  const elem = el('rbg-elem')
  elem.style.background = elementColor(meta.elementId)
  const corner = [elem]
  if (meta.mark) {
    const mk = el('rbg-mark')
    mk.textContent = meta.mark
    corner.push(mk)
  }

  // 底部信息条：等级 + 血条。
  const strip = el('rbg-strip')
  const lv = el('rbg-lv')
  lv.textContent = 'Lv' + (meta.level | 0)
  strip.append(lv, hpBar(meta.hpFrac, meta.hpLabel))

  cell.append(bg)
  for (const c of corner) cell.append(c)
  cell.append(strip)
  if (typeof onPick === 'function') cell.addEventListener('click', onPick)
  return cell
}
