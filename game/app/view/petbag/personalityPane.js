// L3 · 改性格选择层（基础信息「性格」行触达）。上游 Pet Personality 600×360：
//   全屏遮罩 + 滚动列表（55 个性格格 = 名字 + 五维加成格）+ 当前选中说明 + ESC。
// 性格命名/五维加成全在 L2 content（personalityRows / personalityBuffDescription）—— 视图零算数。
// 点一格 = 立即选定（上游 PersonalityController.Select ⇒ ToPersonalityPet：关层 + 刷新 + 落盘，
//   本层经 ctx.run('setPersonality') 走同一台机）；悬停只预览说明、不改选。
import { el, text } from '../panels/battle/_kit.js'
import { openPanel } from '../panels/host.js'
import * as CONTENT from '../../content.js'

export function openPersonality({ pet, label, onPick, onCancel }) {
  openPanel('rb-personality', (root, api) => {
    const done = (cb) => { api.close(); cb?.() }
    const mask = el('rbp-pers-mask')
    mask.addEventListener('click', () => done(onCancel))
    const box = el('rbp-pers-box')
    box.append(text('rbp-pers-title', '性格 · ' + (label || '')))

    // 当前值（内存宠上的 live 索引；注入缺失按 0 = 实干）
    const cur = pet && Number.isFinite(pet.personality) ? pet.personality : 0
    const rows = CONTENT.personalityRows()          // 55 行：{id, name, cells:[5×{text,tone}]}

    const note = text('rbp-pers-note', '')
    const paintNote = (id) => { note.textContent = CONTENT.personalityBuffDescription(id, ' ') }

    const list = el('rbp-pers-list')
    for (const r of rows) {
      const row = el('rbp-pers-item' + (r.id === cur ? ' rbp-pers-item--on' : ''))
      row.append(text('rbp-pers-n', r.name))
      const cells = el('rbp-pers-cells')
      for (const c of r.cells) cells.append(text('rbp-pers-cell rbp-pers-cell--' + c.tone, c.text))
      row.append(cells)
      row.addEventListener('mouseenter', () => paintNote(r.id))       // 悬停预览（不落选）
      row.addEventListener('mouseleave', () => paintNote(cur))
      row.addEventListener('click', () => { done(() => onPick(r.id)) })
      list.append(row)
    }
    paintNote(cur)

    const esc = el('rbp-pers-esc'); esc.textContent = '✕'
    esc.addEventListener('click', () => done(onCancel))
    box.append(list, note, esc)
    root.append(mask, box)
  })
}
