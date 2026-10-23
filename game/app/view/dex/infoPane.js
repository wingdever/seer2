// L3 · 图鉴右信息区（docs/view/panel/dex/dex-design.md DX9/DX12；施工 dex-impl.md §3 c1–c3/c6）。
// 六行读数 + 六维种族值 + 动作钮。**只画注入的行与读数**：⚠️ 唯一的算术 = 身高/体重的 `base+5` 区间上界
// （dex-impl.md §3 c1 明示允许在 L3 现拼这一串，值本身来自表字段），其余不在 DOM 里算数（V-2）。
import { el, text, mountImg, panelSprite, mapSprite, elementIcon } from '../panels/battle/_kit.js'

// 六维顺序正本 = 上游 Status.cs:12-24；读的是**种族基值** baseStatus，⚠️ 不是 Lv100 计算值（DX9 末行）。
const STATUS_ROWS = [['atk', '物攻'], ['mat', '魔攻'], ['def', '物防'], ['mdf', '魔防'], ['spd', '速度'], ['hp', '体力']]

const row2 = (label, valueNode) => {
  const r = el('rb-dex-row')
  r.append(text('rb-dex-row-label', label))
  const v = el('rb-dex-row-value')
  v.append(valueNode)
  r.append(v)
  return r
}
const dash = () => text('rb-dex-dash', '—')     // 未选中 / 无值 ⇒ 一律 —，**绝不出现预制烘焙的假默认值**（DX9 末条）

export function buildInfoPane(host, { row, read, ctx }) {
  host.textContent = ''
  if (!row) {
    host.append(
      text('rb-dex-d-name', '（未选中）'),
      row2('序号：', dash()), row2('身高：', dash()), row2('体重：', dash()),
      row2('分布：', dash()), row2('特性：', dash()), row2('简介：', dash()),
    )
    const st = el('rb-dex-status')
    for (const [, label] of STATUS_ROWS) st.append(rowStat(label, '—'))
    host.append(st)
    return
  }

  const ui = row.ui || {}
  // 名字 + 主/副属性（副属性为 0 = 无 ⇒ 不画第二颗，不伪造）
  const nameLine = el('rb-dex-d-name')
  nameLine.append(
    text('rb-dex-d-name-text', read.nameOf(row)),
    (() => { const e = el('rb-dex-d-elem'); mountImg(e, elementIcon(row.elementId)); e.title = read.elementName(row.elementId); return e })(),
  )
  if (row.subElementId) {
    const e = el('rb-dex-d-elem')
    mountImg(e, elementIcon(row.subElementId))
    e.title = '副：' + read.elementName(row.subElementId)
    nameLine.append(e)
  }
  if (read.haveOf(row)) nameLine.append(text('rb-dex-d-have', '已获得'))
  host.append(nameLine)

  // 序号：`{defaultId}` +（`subId>0 ⇒ "-{subId}"`）+ ` (★{star})`；star 是 float（含 5.5）⇒ **小数原样**
  const no = text('rb-dex-row-text', `${read.noOf(row)} (★${ui.star})`)
  host.append(row2('序号：', no))

  host.append(row2('身高：', text('rb-dex-row-text', `${row.baseHeight} – ${row.baseHeight + 5} cm`)))
  host.append(row2('体重：', text('rb-dex-row-text', `${row.baseWeight} – ${row.baseWeight + 5} kg`)))

  // 分布：linkId = none/空 ⇒ habitat 文本；否则 ⇒ go.png 跳转钮（悬停 = habitat）
  const link = String(row.linkId || '')
  if (!link || link === 'none') {
    host.append(row2('分布：', text('rb-dex-row-text', String(row.habitat || '').trim() || '—')))
  } else {
    const btn = el('rb-dex-go')
    mountImg(btn, mapSprite('go.png'))
    btn.title = String(row.habitat || '').trim() || link
    btn.addEventListener('click', () => ctx.onLink(row))
    host.append(row2('分布：', btn))
  }

  // 特性：**完整** feature.name（修 restart-dex-panel.md §13 A11 的"截 2 字"）
  host.append(row2('特性：', text('rb-dex-row-text', row.feature && row.feature.name ? row.feature.name : '—')))
  host.append(row2('简介：', text('rb-dex-desc', String(row.description || '').trim() || '—')))

  const six = el('rb-dex-status')
  for (const [k, label] of STATUS_ROWS) six.append(rowStat(label, (row.baseStatus || {})[k] ?? '—'))
  host.append(six)

  // 动作钮：叫声（DXQ6=A ⇒ 做）+ 测（画出来但只弹提示）；**「改」不画**（工坊档 = A 组，修 A14）
  const acts = el('rb-dex-acts')
  const cry = el('rb-dex-cry')
  mountImg(cry, mapSprite('sound.png'))
  cry.title = '叫声'
  cry.addEventListener('click', () => ctx.playCry(row.id))
  const test = el('rb-dex-test')
  mountImg(test, panelSprite('PetStorage/Sprites/163.png'))
  test.title = '测试对战'
  test.addEventListener('click', () => ctx.onTest())
  acts.append(cry, test)
  host.append(acts)
}

function rowStat(label, value) {
  const c = el('rb-dex-status-cell')
  c.append(text('rb-dex-status-label', String(label)), text('rb-dex-status-value', String(value)))
  return c
}
