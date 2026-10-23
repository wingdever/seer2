// L3 · 信息面板（② 内容层右侧「信息区」里的可换面板，desc 1.2.2.2）。
// 页签：基础 / 技能 / 抗性；另有「精灵道具面板」由道具钮切出（itemPane.js）。
// 名字/元素/六维/技能一律现读 content（铁律6）；血量读数用 describePet 交出的比例（装配层算，视图零算数 V-2）。
// 数据面（2026-10-20 P2 批）：身高/体重/相遇时间/好感度/性格/升级所需经验 = 装配层经 ctx 注入的档里真值
//   （session petReadoutOf/petExpInfoOf 读 __xml）；特性/性别/纹章/个体值在显示区 HUD（ctx.hudOf）。
//   注入缺失才画「—」（不伪造）；[隐藏技能] 仍是面板入口（目标面板归 D7 / 秘技分析报告）。
import { el, text, elementName, elementColor } from '../panels/battle/_kit.js'
import * as CONTENT from '../../content.js'
// 技能页签 = 精灵技能面板的**入口页**（只读当前技能 + 两颗钮）；点「调整技能」⇒ ctx.openSkillPanel 盖起盖板。
// 真值 docs/view/panel/petbag/skill-panel-design.md §4.1 / §2.4。
import { renderSkillTab } from './skillPane.js'

// 右侧「精灵能力」六行：key=显示键（cfg.stats）、label=中文、evIdx=学习力数组下标、stIdx=Status 性格索引
//   ev 顺序 [atk,mat,def,mdf,spd,hp]（petReadout.ev）；Status 顺序 [物攻,特攻,物防,特防,速度,体力]
const CAP_ROWS = [
  { key: 'hp', label: 'HP', evIdx: 5, stIdx: 5 },
  { key: 'atk', label: '物攻', evIdx: 0, stIdx: 0 },
  { key: 'def', label: '物防', evIdx: 2, stIdx: 2 },
  { key: 'spa', label: '魔攻', evIdx: 1, stIdx: 1 },
  { key: 'spd', label: '魔防', evIdx: 3, stIdx: 3 },
  { key: 'spe', label: '速度', evIdx: 4, stIdx: 4 },
]

export function renderInfo(host, ctx, pet, tab = 'basic') {
  host.textContent = ''

  const tabs = el('rbp-tabs')
  for (const [id, label] of [['basic', '基础'], ['skill', '技能'], ['resist', '抗性']]) {
    const t = el('rbp-tab' + (id === tab ? ' rbp-tab--on' : ''))
    t.textContent = label
    t.addEventListener('click', () => ctx.onTab(id))
    tabs.append(t)
  }
  host.append(tabs)

  const body = el('rbp-tabbody')
  host.append(body)
  if (!pet) { body.append(text('rbp-detail-empty', '选一只精灵查看信息')); return }

  if (tab === 'skill') renderSkillTab(body, ctx, pet)
  else if (tab === 'resist') renderResist(body, ctx, pet)
  else renderBasic(body, ctx, pet)
}

// 1.2.2.2.1.1 基础信息子面板 = 左信息区 + 右精灵能力区
function renderBasic(host, ctx, pet) {
  const wrap = el('rbp-basic')
  const cfg = ctx.cfg(pet) || {}
  const elemId = cfg.elementId ?? 0
  const ro = ctx.petReadout ? ctx.petReadout(pet) : {}

  // 左：信息区（Pet Data 8 行 + 好感度图标）。血条/数值已移到底部队伍格（见 cellView）。
  const info = el('rbp-binfo')
  // 序号带星级（上游 PetInfoView.SetID：`{id} (★star)`）；身高/体重/相遇时间 = 注入读数（上游同款单位/格式）
  const rows = [
    ['序号', cfg.star != null ? `${pet.petId} (★${cfg.star})` : String(pet.petId)],
    ['等级', pet.level | 0],
    ['升级所需经验', ctx.expToNext ? ctx.expToNext(pet) : '—'],
    ['进化等级', ctx.evolveLevel ? (ctx.evolveLevel(pet) ?? '—') : '—'],
    ['性格', ctx.personalityName ? ctx.personalityName(pet) : String(pet.personality ?? 0)],
    ['身高', ro.height ? ro.height + ' cm' : '—'],
    ['体重', ro.weight ? ro.weight + ' kg' : '—'],
    ['相遇时间', ro.getPetDate || '—'],
  ]
  const data = el('rbp-bdata')
  for (const [k, v] of rows) {
    const r = el('rbp-brow')
    r.append(text('rbp-bk', k), text('rbp-bv', String(v)))
    if (k === '性格') { r.classList.add('rbp-brow--act'); r.addEventListener('click', () => ctx.onPersonality()) }
    data.append(r)
  }
  info.append(data)

  const kizuna = el('rbp-kizuna')
  kizuna.append(text('rbp-kizuna-icon', '♥'), text('rbp-kizuna-v', ctx.kizunaLabel ? ctx.kizunaLabel(pet) : '—'))
  kizuna.title = '好感度（鼠标悬浮显示当前值）'
  info.append(kizuna)
  wrap.append(info)

  // 右：精灵能力区（顶部「精灵能力 剩余:xx」+ 6 行属性 + 底部 分配/重置/快速）
  const evArr = Array.isArray(ro.ev) ? ro.ev : [0, 0, 0, 0, 0, 0]
  const remain = Math.max(0, Math.trunc(Number(ro.evStorage) || 0))
  const hasEv = evArr.some((n) => n > 0)
  const doEv = (stat, delta) => { ctx.run('adjustEv', { slot: ctx.selSlot, stat, delta }); ctx.rerender() }
  const doEvOp = (op) => { ctx.run(op, { slot: ctx.selSlot }); ctx.rerender() }

  const cap = el('rbp-cap')
  const hd = el('rbp-cap-hd')
  hd.append(text('rbp-cap-title', '精灵能力'), text('rbp-cap-remain', `剩余:${remain}`))
  cap.append(hd)

  const rowsWrap = el('rbp-cap-rows')
  const s = cfg.stats || {}
  for (const r of CAP_ROWS) {
    const row = el('rbp-cap-row')
    const tone = CONTENT.personalityStatTone(pet.personality ?? 0, r.stIdx)
    const arrow = text('rbp-cap-arrow rbp-cap-arrow--' + tone, tone === 'up' ? '▲' : tone === 'down' ? '▼' : '·')
    const name = text('rbp-cap-name', r.label)
    const val = text('rbp-cap-val', String(s[r.key] ?? '—'))
    const evCell = el('rbp-cap-ev')
    if (ctx.evEdit) {
      const minus = el('rbp-cap-step'); minus.textContent = '−'
      minus.addEventListener('click', () => doEv(r.evIdx, -1))
      const plus = el('rbp-cap-step'); plus.textContent = '+'
      plus.addEventListener('click', () => doEv(r.evIdx, 1))
      evCell.append(minus, text('rbp-cap-evn', String(evArr[r.evIdx])), plus)
    } else {
      evCell.append(text('rbp-cap-evn', String(evArr[r.evIdx])))
    }
    row.append(arrow, name, val, evCell)
    rowsWrap.append(row)
  }
  cap.append(rowsWrap)

  const acts = el('rbp-cap-acts')
  const mkBtn = (label, fn, enabled) => {
    const b = el('rbp-cap-btn' + (enabled ? '' : ' rbp-cap-btn--off'))
    b.textContent = label
    if (enabled) b.addEventListener('click', fn)
    return b
  }
  acts.append(
    mkBtn('分配', () => { ctx.evEdit = !ctx.evEdit; ctx.rerender() }, true),
    mkBtn('重置', () => doEvOp('resetEv'), hasEv),
    mkBtn('快速', () => doEvOp('quickEv'), remain > 0),
  )
  cap.append(acts)
  wrap.append(cap)

  host.append(wrap)
}

// 1.2.2.2.1.2 技能信息子面板 —— **已退役**，整块改由 skillPane.js 承担
// （精灵技能面板：当前技能区 + 备用技能区 + 换位；真值 docs/view/panel/petbag/skill-panel-design.md）。
// ⚠️ 旧实现的两处口径一并退役：① 技能来自 petConfig 的「表算前 4 + 必杀」，不是这只宠档里真正带的；
//   ② 两颗钮只弹提示。旧类名 rbp-skill / rbp-skillrow / rbp-skill-name 等的 CSS 段已从 ui.css 删除。

// 1.2.2.2.1.3 抗性信息子面板 —— 暂空置（人类：目前无内容）
function renderResist(host, pet) {
  const box = el('rbp-resist')
  box.append(text('rbp-resist-empty', '抗性信息：目前空置（上游三态 空置/可用/内容 尚无内容）'))
  host.append(box)
}
