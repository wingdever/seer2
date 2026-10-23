// L3 · 精灵背包面板外壳（VP4 三层 IA · 正本 = docs/view/panel/petbag/petbag-panel-desc.md）。
//   ① 标题层（标题居中 + ❌ 靠右）
//   ② 内容层（左右：显示区 ｜ 信息区〔操作列 + 信息面板〕）
//   ③ 队伍区（左箭头 + 6 只 + 右箭头 + 刷新）
// 只画 DOM、只发意图（八件操作 + 刷新 + 页签/显示切换），动作 dispatch 交回 index.run（落在那里落 R4/R5）。
// 视图零算数、零写盘（V-2/V-5）。**只画存在实现的钮**（上游的锁定/跟随/训练等死钮标识符一个都不建，V-4）。
import { el, text } from '../panels/battle/_kit.js'
import { renderGrid } from './gridView.js'
import { renderDisplay } from './displayPane.js'
import { renderInfo } from './detailPane.js'
import { renderItemPane } from './itemPane.js'
import { cycleIdleState } from './idleStage.js'

export function buildBagPanel(ctx) {
  const scrim = el('rb-scrim'); scrim.addEventListener('click', () => ctx.onClose())
  const box = el('rbp-box')

  // ① 标题层
  const head = el('rbp-head')
  const money = text('rbp-money', '')
  const close = el('rbp-close'); close.textContent = '✕'
  close.addEventListener('click', () => ctx.onClose())
  head.append(money, text('rbp-title', '精灵背包'), close)   // 标题居中（两侧各一列撑住）

  // ② 内容层：左显示区 ｜ 右信息区（操作列 + 信息面板）
  const main = el('rbp-main')
  const displayHost = el('rbp-display')
  const info = el('rbp-info')
  const acts = el('rbp-acts')
  const ipanel = el('rbp-ipanel')
  info.append(acts, ipanel)
  main.append(displayHost, info)

  // ③ 队伍区：左箭头 + 6 只 + 右箭头 + 刷新
  const team = el('rbp-team')
  const refresh = el('rbp-team-refresh'); refresh.textContent = '刷新'
  refresh.addEventListener('click', () => act('swapTeam', {}))

  const note = el('rbp-note')
  box.append(head, main, team, note)
  ctx.root.append(scrim, box)

  // 视图态（切换类，不是数据）：显示区内容 / 信息面板内容 / 信息页签 / 道具标签
  let displayMode = 'demo'   // 'demo' | 'buff'
  let infoMode = 'info'      // 'info' | 'item'
  let infoTab = 'basic'      // 'basic' | 'skill' | 'resist'
  let itemTab = 'all'
  // 盖板开着时点队伍格换宠 ⇒ 通知装配层让盖板跟着重画（design §4.2/SPQ8：盖板是背包的子层，外部仍可点）
  let lastPet = undefined
  const resetSkillState = () => { ctx.onPetChange?.() }  // 换宠 ⇒ 盖板清选中/页码并重画

  ctx.onTab = (id) => { infoTab = id; render() }
  ctx.onItemTab = (id) => { itemTab = id; render() }
  ctx.onPersonality = () => {
    const sel = selected()
    if (!sel) return
    ctx.openPersonality({
      pet: sel, label: ctx.nameOf(sel),
      onPick: (v) => { ctx.run('setPersonality', { slot: selSlot, personality: v }); render() },
      onCancel: () => {},
    })
  }
  ctx.onHudAct = (kind, pet) => {
    const key = kind === 'skin' ? 'bag.skinPending' : 'bag.battleTestPending'
    ctx.notify({ key, args: [ctx.nameOf(pet)] })
  }
  // 「隐藏技能」钮：目标面板归 D7 / 秘技分析报告（design §2.3）⇒ 仍是提示，不建死按钮
  ctx.onSkillAct = (kind, pet) => { ctx.notify({ key: 'bag.secretSkillPending', args: [ctx.nameOf(pet)] }) }
  ctx.rerender = () => render()

  let selSlot = ctx.bagGrid.selectedSlot()
  if (selSlot < 0) selSlot = 0

  const metaOf = (slot, pet) => {
    if (pet == null) return { slot, empty: true, selected: slot === selSlot }
    const cfg = ctx.cfg(pet) || {}
    const pd = ctx.describePet(pet) || {}
    return {
      slot, empty: false, selected: slot === selSlot, mark: slot === 0 ? '首发' : null,
      petId: pet.petId, elementId: cfg.elementId ?? 0, name: pd.name || ctx.nameOf(pet),
      level: pet.level | 0, hpFrac: pd.hpFrac ?? 0, hpLabel: pd.hpLabel || '', off: pd.off,
    }
  }

  const btn = (label, fn, enabled = true) => {
    const b = el('rbp-act' + (enabled ? '' : ' rbp-act--off'))
    b.textContent = label
    if (enabled) b.addEventListener('click', fn)
    return b
  }

  const selected = () => (selSlot >= 0 ? ctx.src.bag()[selSlot] : null)
  const hasSel = () => selected() != null

  // 操作列 8 钮（顺序照 desc 1.2.2.1）：首发、出战、恢复、动画、加成、入库、仓库、道具
  function renderActs() {
    acts.textContent = ''
    const ok = hasSel()
    acts.append(
      btn('首发', () => act('setFirst', { slot: selSlot }), ok && selSlot > 0),
      btn('出战', () => act('deploy', { slot: selSlot }), ok && selSlot >= 6),
      btn('恢复', () => act('heal', {}), true),
      btn('动画', () => {
        const st = cycleIdleState()
        ctx.notify(st ? { key: 'bag.animOn', args: [st] } : { key: 'bag.animPending' })
      }, ok),
      btn('加成', () => { displayMode = displayMode === 'buff' ? 'demo' : 'buff'; render() }, ok),
      btn('入库', () => act('store', { slot: selSlot }), ok),
      btn('仓库', () => ctx.openStorage(), true),
      btn('道具', () => { infoMode = infoMode === 'item' ? 'info' : 'item'; render() }, true),
      btn('皮肤', () => ctx.onHudAct('skin', selected()), ok),
      btn('测试对战', () => ctx.onHudAct('battleTest', selected()), ok),
    )
  }

  function act(name, args) {
    ctx.run(name, args)
    selSlot = Math.max(0, Math.min(selSlot, ctx.src.bag().length - 1))
    render()
  }

  function render() {
    const pet = selected()
    ctx.selSlot = selSlot   // 让 detailPane 的精灵能力子区域知道当前操作槽（学习力分配/重置/快速）
    const m = ctx.money()
    money.textContent = `◈ ${m.coins}  ✦ ${m.diamonds}`
    // 换宠 ⇒ 技能面板的选中/页码/展开态清零（design §7.1；第一次渲染不算换宠）
    if (pet !== lastPet) { if (lastPet !== undefined) resetSkillState(); lastPet = pet }
    renderGrid(team, {
      grid: ctx.bagGrid, metaOf,
      onPick: (slot) => { selSlot = slot; render() },
      onPage: (a) => {
        if (a === 'first') ctx.bagGrid.setPage(0)
        else if (a === 'prev') ctx.bagGrid.prev()
        else if (a === 'next') ctx.bagGrid.next()
        render()
      },
    })
    team.append(refresh)   // 刷新钮贴在队伍区右端（desc 1.3）

    renderDisplay(displayHost, ctx, pet, displayMode)
    if (infoMode === 'item') renderItemPane(ipanel, ctx, itemTab)
    else renderInfo(ipanel, ctx, pet, infoTab)
    renderActs()
  }

  return {
    render,
    setNote: (s) => { note.textContent = s || '' },
    sel: () => selSlot,
    setSel: (s) => { selSlot = s },
  }
}
