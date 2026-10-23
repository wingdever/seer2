// 重启线个人信息面板 L3 渲染（DOM only，零算术、零查表）。
// 纪律：不 import game/logic/**（arch-code 规则 #3）；视图只发信号（ctx.on*），读写/落盘全在 L4 装配点（PI2）。
// 真值：docs/view/panel/playerinfo/restart-playerinfo-panel.md（A1–A15）+ playerinfo-design.md（PI1–PI9 + §3.8 两栏，PIQ1–8 已拍板；右栏分页网格 = PI-g）。
// 上游对位：PlayerInfoPanel/Controller/View + ChangeName*（昵称两拍 / 称号三族下拉 / 货币同源 / Shoot 不落盘）；
//   ⚠️ 上游立绘三态 + Change 钮已随 **PIQ7** 退役（2026-10-20 PI-equip）⇒ 中部 = 装备/坐骑两栏（design §3.8），非上游形。
// 形状范本：同族 activity/activityPanel.js（buildXxxPanel(ctx) → { update }；scrim 点关 + ✕）。
import { el, text } from '../panels/battle/_kit.js'
import { makeItemIcon } from '../item-art.js'

// 素材双树照抄（不挪树，报告 §3）：本面板自有 2 张 = `Assets/Resources/` 树（Edit/Mark）；
// 称号/货币图标 = item-art 的 `Resources/` 树（makeItemIcon 内部 ART_ROOT）。
const PI_SPR = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Panels/PlayerInfo/Sprites'
const EDIT_PNG = PI_SPR + '/Edit.png'
const MARK_PNG = PI_SPR + '/Mark.png'

// 装备/坐骑图标 = **离线静图优先**（PI-static · 人类 2026-10-20 点名「应当改为调用相应的 svg 或 png」）：
//   item-art 的兜底链 = ① /png/item/equip/icon/<id>.png（tools/swf2svg.mjs 产物，与 swf 同路径）→ ② Ruffle 播 swf（缺件才走）
//   → ③ Unity Resources PNG → ④ 色块 tile + assetMissing 自陈（不摆假图）。静图缺的效果（发光/掩膜）人类已拍板「都不补」。
// 在册播放器钉死 ≤36 的原口径（PI-g）在静图路下**天然为 0**：只有静图缺件的格子才会去挂 Ruffle。
const PAGE_SIZE = 36   // 6 列 × 6 行（design §3.8）

// 阴影两态（PIQ6：非装备物品 = `session.groundMode` 开关，正本 design §3.8 表末行）
const GROUND_MODES = [{ mode: 'shadow', label: '阴影' }, { mode: 'halo', label: '光轮' }]

// ★PI-j 颜色组（ALQ11 · 人类 2026-10-21）：12 色钮的**瓦片底色** —— 只按 L4 递来的**色名**上一点显示色，
//   不是素材真值（真画面在预览 canvas 上）；查不到该色名 ⇒ 中性灰、不伪造。色表本体只在 L1 `DEFAULT_COLORS`，视图不 import。
const COLOR_SWATCH = {
  蓝: '#3b6fd4', 绿: '#3ea25a', 紫: '#7a4bc8', 黄: '#e2c02f', 紫罗兰: '#9a63d6', 橙: '#e2892f',
  红: '#d1414a', 粉: '#e58fb6', 白: '#e9e9e9', 黑: '#2b2b2b', 深蓝: '#1e3a75', 咖啡: '#6b4a33',
}

// 道具/货币图标 = item-art 的四级兜底装载器（静图 → Ruffle → Unity PNG → 色块；本处 useRuffle=false 跳过②，
// 内部已建 size×size 方块 tile + object-fit:contain；缺图在其宿主上自陈 dataset.assetMissing）。本层只给个等高宿主、不另算宽。
function iconEl(resId, h, typeRawHint) {
  const host = el('rb-pif-ico')
  host.style.height = h + 'px'
  host.append(makeItemIcon(resId, h, false, typeRawHint))
  return host
}

export function buildPlayerInfoPanel(ctx) {
  const { onClose } = ctx

  // 分页/页码 = L3 局部纯显示态（design §3.8：不进 ctx）；built/cellRefs = 当前页格子缓存（翻页才重建、穿卸只翻高亮）
  const st = { editing: false, group: null, page: 0, pages: 1, built: '', cellRefs: new Map() }

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => onClose && onClose())
  const box = el('rb-pif-box')

  // 头：标题 + ✕（活动范本同形）
  const head = el('rb-pif-head')
  head.append(
    text('rb-pif-title', '个人信息'),
    el('rb-pif-spacer'),
    (() => { const b = el('rb-pif-close'); b.textContent = '✕'; b.addEventListener('click', () => onClose && onClose()); return b })(),
  )

  // 名字行：显示文本 ⇄ 输入框（两拍：第 1 拍进编辑、第 2 拍提交；空名提示且不退出编辑 = PI4）
  const nameRow = el('rb-pif-namerow')
  const nameText = text('rb-pif-name', '')
  const nameInput = document.createElement('input')
  nameInput.className = 'rb-pif-name-input'
  nameInput.spellcheck = false
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSubmit() })
  const editBtn = el('rb-pif-edit')
  nameRow.append(nameText, nameInput, editBtn)

  // 称号/装备下拉：原生 <select>（选项 0 = 「无」；只列**拥有**的三族道具 = ctx.listAchievements()）
  // ⚠️ PIQ7 起选定**不再驱动形象**（三态立绘退役 ⇒ 23/24/25 行为一致 = 只落 `achievement` 字段）。
  const achRow = el('rb-pif-achrow')
  const achSel = document.createElement('select')
  achSel.className = 'rb-pif-ach'
  achSel.addEventListener('change', () => {
    if (ctx.onPickAchievement) ctx.onPickAchievement(Number(achSel.value) || 0)
    render()
  })
  achRow.append(text('rb-pif-achlabel', '称号'), achSel)

  // ★PI-f 两栏（design §3.8）：左 = canvas 实时形象预览 + 已装配条；右 = 组标签 + 分页图标网格（PI-g）/ 阴影两态钮
  const split = el('rb-pif-split')
  const left = el('rb-pif-left')
  const canvas = document.createElement('canvas')
  canvas.className = 'rb-pif-canvas'
  const equippedStrip = el('rb-pif-equipped')
  left.append(canvas, equippedStrip)
  const right = el('rb-pif-right')
  const tabsRow = el('rb-pif-tabs')
  const bodyBox = el('rb-pif-rbody')
  const pager = el('rb-pif-pager')
  const pagePrev = el('rb-pif-pagebtn'); pagePrev.textContent = '‹'
  const pageInfo = text('rb-pif-pageinfo', '')
  const pageNext = el('rb-pif-pagebtn'); pageNext.textContent = '›'
  pager.append(pagePrev, pageInfo, pageNext)
  right.append(tabsRow, bodyBox, pager)
  split.append(left, right)
  pagePrev.addEventListener('click', () => { if (st.page > 0) { st.page--; renderEquip() } })
  pageNext.addEventListener('click', () => { if (st.page + 1 < st.pages) { st.page++; renderEquip() } })
  // 画布交给 L4 登记（预览由 L4 的 renderPreviewTo 喂帧 = 与地图同一 LOOK/同时钟；L3 不画）
  if (ctx.setPreviewCanvas) ctx.setPreviewCanvas(canvas)

  // 货币活读数（图标 = makeItemIcon(1/2)，同 shop currencyChip 惯例，不用预制 Coin/Diamond.png = A5）
  const coinRow = el('rb-pif-currow')
  const coinIco = iconEl(1, 18)
  const coinNum = text('rb-pif-cur', '0')
  const diaIco = iconEl(2, 18)
  const diaNum = text('rb-pif-cur', '0')
  coinRow.append(
    el('rb-pif-spacer'),
    (() => { const c = el('rb-pif-curcell'); c.append(coinIco, coinNum); return c })(),
    (() => { const c = el('rb-pif-curcell'); c.append(diaIco, diaNum); return c })(),
    el('rb-pif-spacer'),
  )

  // 四功能钮（PI9 = PIQ1/2/3 全 A；**Change 已随 PIQ7 退役** ⇒ 立绘三态 ⇄ canvas 预览）
  const btnRow = el('rb-pif-btnrow')
  const mkBtn = (cls, label, tip, fn) => {
    const b = el('rb-pif-btn ' + cls); b.textContent = label; b.title = tip
    b.addEventListener('click', fn)
    return b
  }
  const shootBtn = mkBtn('rb-pif-btn--shoot', '射击', '射击模式（下次进入地图适用，不落盘）', () => {
    if (ctx.onToggleShoot) ctx.onToggleShoot()
    render()
  })
  btnRow.append(
    shootBtn,
    mkBtn('rb-pif-btn', 'Bag', '物品背包', () => { if (ctx.onOpenItemBag) ctx.onOpenItemBag() }),
    mkBtn('rb-pif-btn', 'Follow', '选择跟随的精灵', () => { if (ctx.onFollow) ctx.onFollow() }),
    mkBtn('rb-pif-btn', 'Home', '使精灵或动物取消跟随', () => { if (ctx.onHome) ctx.onHome() }),
    el('rb-pif-spacer'),
  )

  box.append(head, nameRow, achRow, split, coinRow, btnRow)
  ctx.root.append(scrim, box)

  // 第 2 拍：空 ⇒ 提示且不退出编辑；非空 ⇒ 提交（L4 写档 + 落盘）+ 翻回显示态。
  function doSubmit() {
    const v = nameInput.value.trim()
    if (!v) { if (ctx.showHint) ctx.showHint('昵称不能空白'); return }
    if (ctx.onSubmitName) ctx.onSubmitName(v)
    st.editing = false
    nameInput.value = ''
    render()
  }
  editBtn.addEventListener('click', () => {
    if (!st.editing) { st.editing = true; render(); nameInput.focus() }
    else doSubmit()
  })

  // 左栏已装配条 + 右栏（标签/网格/翻页条）：数据全 ctx 递现值，L3 零查表 = PI2；分页/页码 = L3 显示态（PI-g）
  function renderEquip() {
    const eq = (ctx.getEquippedSummary && ctx.getEquippedSummary()) || []
    const equippedId = new Map(eq.filter((g) => g.itemId).map((g) => [g.slot, g.itemId]))

    equippedStrip.textContent = ''
    for (const g of eq) {
      const cell = el('rb-pif-eqcell')
      if (g.itemId) cell.append(makeItemIcon(g.itemId, 22, true, '装备'))   // 已装配小图标（PI-g #16 · PI-static 后走静图优先链）
      cell.append(text('rb-pif-eqslot', g.label), text('rb-pif-eqname', g.name || '—'))
      if (g.itemId && ctx.onUnequipSlot) {
        const off = el('rb-pif-eqoff')
        off.textContent = '卸下'
        off.addEventListener('click', () => { ctx.onUnequipSlot(g.slot); render() })
        cell.append(off)
      }
      equippedStrip.append(cell)
    }

    const cats = (ctx.listCatalog && ctx.listCatalog()) || []
    const active = cats.find((g) => g.key === st.group) || cats[0]
    if (active) st.group = active.key

    tabsRow.textContent = ''
    for (const g of cats) {
      const t = el('rb-pif-tab')
      t.textContent = g.label
      if (g.key === st.group) t.classList.add('rb-pif-tab--on')
      t.addEventListener('click', () => { st.group = g.key; st.page = 0; renderEquip() })
      tabsRow.append(t)
    }

    if (!active) { bodyBox.textContent = ''; pager.style.display = 'none'; return }

    // 阴影组 = 两态互斥按钮（PIQ6；不落盘 = 同 MDB8-b3 口径），不分页
    if (active.ground) {
      pager.style.display = 'none'
      bodyBox.textContent = ''
      const btns = el('rb-pif-groupcells')
      const mode = ctx.getGroundMode ? ctx.getGroundMode() : 'shadow'
      for (const m of GROUND_MODES) {
        const b = el('rb-pif-groundbtn')
        b.textContent = m.label
        if (m.mode === mode) b.classList.add('rb-pif-groundbtn--on')
        b.addEventListener('click', () => { if (ctx.onPickGround) ctx.onPickGround(m.mode); renderEquip() })
        btns.append(b)
      }
      bodyBox.append(btns)
      return
    }

    // ★PI-j 颜色组 = 12 色钮（ALQ11：换色是独立功能、不进部件表；**不落盘** = 与阴影同口径），不分页
    if (active.color) {
      pager.style.display = 'none'
      bodyBox.textContent = ''
      const btns = el('rb-pif-groupcells')
      const cur = ctx.getColorMode ? ctx.getColorMode() : -1
      for (const c of (ctx.listColors ? ctx.listColors() : [])) {
        const b = el('rb-pif-colorbtn')
        b.style.setProperty('--pif-color', COLOR_SWATCH[c.name] || '#767f8f')
        b.append(el('rb-pif-colorchip'))
        b.append(text('rb-pif-colorname', c.name))
        if (c.n === cur) b.classList.add('rb-pif-colorbtn--on')
        b.addEventListener('click', () => { if (ctx.onPickColor) ctx.onPickColor(c.n); renderEquip() })
        btns.append(b)
      }
      bodyBox.append(btns)
      return
    }

    const items = active.items || []
    st.pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
    if (st.page > st.pages - 1) st.page = st.pages - 1
    pager.style.display = ''
    pageInfo.textContent = '页 ' + (st.page + 1) + '/' + st.pages
    pagePrev.classList.toggle('rb-pif-pagebtn--off', st.page <= 0)
    pageNext.classList.toggle('rb-pif-pagebtn--off', st.page >= st.pages - 1)

    // 仅换组/换页/目录到位才重建当前页（36 个播放器随 DOM 移除）；穿/卸后的 update() 只翻高亮 = PI-g 性能钉
    const sig = active.key + '|' + st.page + '|' + items.length + '|' + (items[0] ? items[0].id : 0)
    if (sig !== st.built) {
      st.built = sig
      st.cellRefs = new Map()
      bodyBox.textContent = ''
      if (!items.length) { bodyBox.append(text('rb-pif-grouphint', active.assetReady === false ? '素材清单还没到位，这组暂时列不出' : '目录里这组是空的')); return }
      const grid = el('rb-pif-grid')
      for (const it of items.slice(st.page * PAGE_SIZE, st.page * PAGE_SIZE + PAGE_SIZE)) {
        const c = el('rb-pif-cell')
        c.append(makeItemIcon(it.id, 44, true, '装备'))   // 真图标 = 静图优先链（PIQ8=B + PI-static；四级兜底末位才退色块 + assetMissing）
        c.title = (it.name || '') + '（id ' + it.id + '）'
        c.addEventListener('click', () => { if (ctx.onPickEquip) ctx.onPickEquip(it.id, active.slot); render() })
        st.cellRefs.set(it.id, c)
        grid.append(c)
      }
      bodyBox.append(grid)
    }
    const cur = equippedId.get(active.slot) || 0
    for (const [id, c] of st.cellRefs) c.classList.toggle('rb-pif-cell--on', id === cur)
  }

  function render() {
    // 昵称
    const name = String(ctx.getNickname ? ctx.getNickname() : '')
    nameText.textContent = name
    nameInput.placeholder = name
    nameInput.style.display = st.editing ? '' : 'none'
    nameText.style.display = st.editing ? 'none' : ''
    editBtn.style.backgroundImage = `url("${st.editing ? MARK_PNG : EDIT_PNG}")`
    editBtn.title = st.editing ? '确认新昵称' : '修改昵称'

    // 称号下拉（重建选项；回填：当前值在选项里则选中、查无 = 显「无」只动显示 = A1 行为照搬）
    const list = (ctx.listAchievements && ctx.listAchievements()) || []
    const byId = new Map(list.map((x) => [x.id, x]))
    const cur = Number(ctx.getAchievement ? ctx.getAchievement() : 0) || 0
    achSel.textContent = ''
    const o0 = document.createElement('option')
    o0.value = '0'; o0.textContent = '无'
    achSel.append(o0)
    for (const it of list) {
      const o = document.createElement('option')
      o.value = String(it.id); o.textContent = it.name || ('#' + it.id)
      achSel.append(o)
    }
    achSel.value = byId.has(cur) ? String(cur) : '0'

    // ★PI-f 两栏（活读数：每次 render 重拉 已装配/目录/阴影态）
    renderEquip()

    // 货币活读数
    coinNum.textContent = String(ctx.getCoins ? ctx.getCoins() : 0)
    diaNum.textContent = String(ctx.getDiamonds ? ctx.getDiamonds() : 0)

    // Shoot 视觉态自陈（不落盘 = PIQ3）
    const on = ctx.getShootMode ? !!ctx.getShootMode() : false
    shootBtn.classList.toggle('rb-pif-btn--on', on)
    shootBtn.title = '射击模式（' + (on ? '已开' : '已关') + ' · 下次进入地图适用，不落盘）'
  }

  render()
  return { update: render }
}
