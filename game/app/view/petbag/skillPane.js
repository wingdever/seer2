// L3 · 精灵技能的两块 DOM：① 只读技能页签（入口）② 技能调整**盖板**（第二层面板）。
// 真值 = docs/view/panel/petbag/skill-panel-design.md（§4 DOM 契约 · §7 交互 · §2.4 盖板形态证据）。
// 纪律：只画 DOM、只发意图；过滤/守卫/分页全在 L1 skill-ops（视图零算数，铁律 1）；不碰 _kit.js 新导出。
import { el, text } from '../panels/battle/_kit.js'

const PAGE = 4 // 一页 4 个备用普通技能（上游 PetBackupSkillView 的四个 normalSkillBlockViews）
const TIP = '点击上方和下方技能各一个进行交换，点击右方按钮返回' // 上游盖板底部的提示语原文（Pet Swap Skill.prefab 的 Text Legacy）

// ── 悬浮详情框（InfoPrompt 的等价物 · 人类 2026-10-19：跟随鼠标，不是嵌在面板里）──────
// 挂在 body 上、position:fixed ⇒ **不被面板的 overflow 裁剪**；鼠标移开即隐藏。
let tipEl = null
function ensureTip() {
  if (!tipEl) {
    tipEl = document.createElement('div')
    tipEl.className = 'rb-skilltip'
    tipEl.style.display = 'none'
    document.body.appendChild(tipEl)
  }
  return tipEl
}
function showTip(content, ev) {
  const t = ensureTip()
  t.textContent = content
  t.style.display = 'block'
  moveTip(ev)
}
function moveTip(ev) {
  if (!tipEl || !ev) return
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight
  let x = ev.clientX + pad, y = ev.clientY + pad
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad   // 靠右翻面
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad // 靠下翻面
  tipEl.style.left = x + 'px'
  tipEl.style.top = y + 'px'
}
function hideTip() { if (tipEl) tipEl.style.display = 'none' }

// ── ① 入口页：只读的当前技能（4 普 + 1 必杀，**同一行**）+ 两颗钮 ────────────────
export function renderSkillTab(host, ctx, pet) {
  host.textContent = ''
  if (!pet) { host.append(text('rbp-col-empty', '选一只精灵查看技能')); return }

  const model = ctx.skillModelOf(pet)
  const box = el('rbp-sk')
  const hd = el('rbp-sk-hd')
  hd.append(text('rbp-sk-hd-t', '当前技能'))
  box.append(hd)

  // 4 个普通格 + 1 个必杀格 = **同一行**
  const row = el('rbp-sk-slots')
  for (const id of model.normal) row.append(cell({ id, info: infoOf(model, id), ro: true, cls: 'rbp-sk-cell' }))
  row.append(cell({ id: model.super, info: infoOf(model, model.super), super: true, ro: true, cls: 'rbp-sk-cell' }))
  box.append(row)

  const acts = el('rbp-skill-acts')
  const adj = el('rbp-skill-btn')
  adj.textContent = '调整技能'
  adj.addEventListener('click', () => ctx.openSkillPanel(pet))
  const sec = el('rbp-skill-btn')
  sec.textContent = '隐藏技能'
  sec.addEventListener('click', () => ctx.onSkillAct('secret', pet))
  acts.append(adj, sec)
  box.append(acts)

  host.append(box)
}

// ── ② 盖板：当前技能区 + 分隔线 + 备用技能区 + 底部条 ────────────────────
// 自带视图态（盖板一关就丢）：sel / page / superIdx（design §7.1）
export function createSkillOverlay(root, ctx) {
  const box = el('rbx-box')
  root.append(box)
  const st = { sel: null, page: 0, superIdx: 0 }

  const render = () => {
    box.textContent = ''
    // 标题层：与背包面板同一版式；这颗 ✕ = 关掉**整个精灵背包面板**（上游 Close Button Cover 同义）
    const top = el('rbx-top')
    top.append(el('rbx-top-gap'), text('rbx-title', '技能调整'))
    const x = el('rbx-x')
    x.textContent = '✕'
    x.title = '关闭精灵背包面板'
    x.addEventListener('click', () => ctx.onCloseBag())
    top.append(x)
    box.append(top)

    const pet = ctx.getPet()
    if (!pet) {
      box.append(text('rbp-col-empty', '没有选中精灵'))
      box.append(footBar(TIP))
      return
    }
    const model = ctx.skillModelOf(pet)

    // 当前技能区：4 普 + 1 必杀 = **同一行**（人类 2026-10-19）
    box.append(head('当前技能'))
    const cur = el('rbx-slots')
    model.normal.forEach((id, i) => cur.append(cell({
      id, info: infoOf(model, id),
      on: st.sel && st.sel.kind === 'normal' && st.sel.slot === i,
      onClick: () => { st.sel = (st.sel && st.sel.kind === 'normal' && st.sel.slot === i) ? null : { kind: 'normal', slot: i }; render() },
    })))
    cur.append(cell({
      id: model.super, info: infoOf(model, model.super), super: true,
      on: st.sel && st.sel.kind === 'super',
      onClick: () => { st.sel = (st.sel && st.sel.kind === 'super') ? null : { kind: 'super' }; render() },
    }))
    box.append(cur)

    box.append(el('rbx-div'))

    // 备用技能区：**已习得未带（可点可换）+ 未习得（灰色、点不动）同区**（人类 2026-10-19 三轮）
    const pool = model.backup || []
    const total = pool.length
    const pages = Math.max(1, Math.ceil(total / PAGE))
    const page = Math.max(0, Math.min(st.page, pages - 1))
    st.page = page
    // 翻页：普通格走标题栏的「‹ n/m ›」；必杀格的环形轮换另放在标题栏右侧（不占格位 ⇒ 五个格一样大）
    const supers = model.ownSupers || []
    const supIdx = supers.length ? st.superIdx % supers.length : 0
    const shown = supers.length ? supers[supIdx] : 0

    const bakHd = head('备用技能（含未习得）', total ? (page + 1) + '/' + pages : '')
    if (pages > 1) {
      bakHd.append(pager('‹', () => { st.page = (page - 1 + pages) % pages; render() }),
        pager('›', () => { st.page = (page + 1) % pages; render() }))
    }
    if (supers.length > 1) {
      bakHd.append(text('rbx-page', '必杀 ' + (supIdx + 1) + '/' + supers.length),
        pager('‹', () => { st.superIdx = (supIdx - 1 + supers.length) % supers.length; render() }),
        pager('›', () => { st.superIdx = (supIdx + 1) % supers.length; render() }))
    }
    box.append(bakHd)

    // 与当前技能**同一行版式**：左边 4 个普通格（已习得未带可换 / 未习得灰格）+ 最右边 1 个备用必杀格
    const bak = el('rbx-slots')
    for (let i = 0; i < PAGE; i++) {
      const item = pool[page * PAGE + i]
      if (!item) { bak.append(cell({ id: 0, info: null })); continue }      // 空位也占格，保持 4+1 版式
      if (!item.learned) { bak.append(ghostCell(model, item)); continue }   // 灰色未习得：点不动
      bak.append(cell({
        id: item.id, info: infoOf(model, item.id),
        onClick: () => {
          // 先点当前 ⇒ 换那一格；没选 ⇒ 落进第一个空格（design §7.2 SPQ5）
          const slot = st.sel && st.sel.kind === 'normal' ? st.sel.slot : firstEmpty(model)
          if (slot < 0) { ctx.notify({ key: 'skill.pickFirst', args: [], level: 'warn' }); return }
          ctx.runSkill('swapNormal', pet, { slot, skillId: item.id })
          st.sel = null
          render()
        },
      }))
    }
    // 最右一列 = 备用必杀（点它直接换；照搬 GetBackupSuperSkill 的环形语义）
    bak.append(cell({
      id: shown, info: infoOf(model, shown), super: true,
      on: shown === model.super,
      onClick: () => { ctx.runSkill('swapSuper', pet, { skillId: shown }); st.sel = null; render() },
    }))
    box.append(bak)

    box.append(text('rbx-note', '灰色 = 未习得（学习条件见每格第二行左侧；点它无效）——已按当前等级习得的技能排在前面，可点可换'))

    box.append(footBar(TIP))
  }

  // 底部条：上游那句提示语 + 返回（**不再承载悬浮详情** —— 详情已改成跟随鼠标的悬浮框）
  function footBar(tip) {
    const f = el('rbx-foot')
    f.append(text('rbx-tip', tip))
    const back = el('rbx-back')
    back.textContent = '返回'
    back.addEventListener('click', () => ctx.onClose())
    f.append(back)
    return f
  }

  render()
  return { render, close: () => ctx.onClose() }
}

// ── 构件 ────────────────────────────────────────────────────────────────
const infoOf = (model, id) => (id ? (model.meta.get(id) || null) : null)

function head(title, pageLabel = '') {
  const hd = el('rbx-hd')
  hd.append(text('rbx-hd-t', title))
  if (pageLabel) hd.append(text('rbx-page', pageLabel))
  return hd
}

const pager = (label, fn) => {
  const b = el('rbx-pagebtn')
  b.textContent = label
  b.addEventListener('click', fn)
  return b
}

const firstEmpty = (model) => {
  for (let i = 0; i < model.normal.length; i++) if (!model.normal[i]) return i
  return -1
}

// 一颗技能格（**两种皮同构**：rbx-cell / rbp-sk-cell 靠 cls 传）：
// 格内只画「技能名（完整显示，可换行）+ 类别 + 威力」三项（人类 2026-10-19：命中率与学习等级挪进悬浮框）；
// **悬浮 = 跟随鼠标的详情框**（含命中率 / 学习等级 / 元素 / 类别 / 威力 / 技能说明）。
function cell({ id, info, super: isSuper, on, ro, onClick, cls = 'rbx-cell' }) {
  const c = el(cls + (isSuper ? ' ' + cls + '--super' : '') + (on ? ' ' + cls + '--on' : '') + (ro ? ' ' + cls + '--ro' : ''))
  const n = cls === 'rbx-cell' ? 'rbx-' : 'rbp-sk-'
  if (!id) {
    // 空槽也占位可见（4 普 + 1 必杀恒为 5 格）
    c.append(text(n + 'name', isSuper ? '空（必杀技）' : '空'))
    return c
  }
  // ⚠️ **不设 c.title**（人类 2026-10-19：浏览器原生的「名称悬浮框」与我们的详情浮框重复 ⇒ 取消）
  // 版式 = **上下两行**：第一行技能名独占整格宽（可换行、完整显示），第二行才是 类别 + 威力
  c.append(text(n + 'name', info?.name || ('#' + id)))
  const sub = el(n + 'sub')
  sub.append(text(n + 'cat', info?.category || '—'), text(n + 'pow', info?.power ? '威' + info.power : '—'))
  c.append(sub)
  if (!ro) c.addEventListener('click', onClick)
  c.addEventListener('mouseenter', (ev) => showTip(tipText(info, isSuper), ev))
  c.addEventListener('mousemove', moveTip)
  c.addEventListener('mouseleave', hideTip)
  return c
}

// 灰色格 = **未学习**（人类 2026-10-19 点名）：不可点，只报学习条件；**第二行左侧 = 学习等级**
function ghostCell(model, item) {
  const info = model.meta.get(item.id) || null
  const c = el('rbx-cell rbx-cell--ghost')
  c.title = ''
  c.append(text('rbx-name', info?.name || ('#' + item.id)))
  const sub = el('rbx-sub')
  sub.append(text('rbx-lv', learnLabel(item)), text('rbx-cat', info?.category || '—'), text('rbx-pow', info?.power ? '威' + info.power : '—'))
  c.append(sub)
  c.addEventListener('mouseenter', (ev) => showTip('未学习 · ' + tipText(info, false), ev))
  c.addEventListener('mousemove', moveTip)
  c.addEventListener('mouseleave', hideTip)
  return c
}

// 学习条件标签：等级到就学 → Lv n；60 级自动 → Lv60；其它途径 → 秘技；其余条件型 → 条件名
// （SecretType 枚举照上游 SecretSkillDatabase.cs:68-82）
const SECRET_NAMES = { 1: '胜场', 2: '败场', 3: '我方Buff', 4: '对方Buff', 5: '残血', 6: '回合数', 7: '天气', 8: '使用技能', 9: '造成伤害', 10: '专属宠' }
function learnLabel(item) {
  const raw = Number(item.unlockRaw ?? 0)
  const secretType = raw < 0 ? raw : Math.floor(raw / 10000)
  const value = raw < 0 ? raw : raw % 10000
  // isAutoLearned 两个分支（SecretSkillDatabase.cs:11）：Auto(-2) **或 value==0** ⇒ 60 级自动；与 L1 learnableAt 同一判据
  if (secretType === -2 || value === 0) return 'Lv60'
  if (secretType === -1) return '秘技'
  if (secretType === 0) return 'Lv' + value
  return SECRET_NAMES[secretType] || '条件' + (secretType ?? '?')
}

// 悬浮详情文案；描述原样出，不解析方括号标记（解析 = 战斗引擎 E4 的事）
function tipText(info, isSuper) {
  if (!info) return '没有可显示的技能信息'
  const head = [info.name, info.element, isSuper ? '必杀' : info.category].filter(Boolean).join(' · ')
  const num = [
    info.power ? '威力 ' + info.power : '',
    info.accuracy ? '命中 ' + info.accuracy : '',
    '学习等级 Lv' + (info.value ?? 1),
  ].filter(Boolean).join('　')
  return [head, num, info.desc || '（无描述）'].join('\n')
}
