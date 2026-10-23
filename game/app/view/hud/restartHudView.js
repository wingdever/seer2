// 重启原生主场景 HUD 常驻层 (UI 线 U3)。只在引擎开关=重启时接管: 宿主给 mapRunner 传 hud=0
// 让 SWF 整块常驻 HUD 不建, 由本层 (DOM, 挂 host 的 #rv) 顶替。
// 视觉权威 = Assets/Scenes/Map.unity 的 RectTransform (本文件 GEO/ICONS/MENU 三张表逐条抄自场景),
//            参考截图 mainHud.png 只用来核对语义; 施工图 = docs/view/scene/room/view-scene-hud-impl.md。
// 纪律: 面板零算数 —— 名字/上限/等级/元素一律现读 A.* 与 content getter;
//       无后端按钮一律诚实「待建」(onTodo), 绝不伪造子面板; 青边圆角盒是 CSS 近似 (上游用内建白图染色)。
import { el, text, bar } from '../panels/battle/_kit.js'
import * as CONTENT from '../../content.js'
import { createPortrait } from './restartPortrait.js'

const ASSETS = '/projects/Seer2-Restart-Lite-main/Assets/'
const art = (p) => `url("${ASSETS}${p.replace(/ /g, '%20')}")`

// 精灵表: [文件, 画布, 内容子矩形 [x,y,w,h] (Unity .meta spriteSheet.rect, y 由底翻到顶)]。
// Map/ 里画布尺寸和内容差一个量级 (news.png 画布 150×128, 内容只有 51×36) —— 上游是把「内容子矩形」
// 拉伸进 RectTransform 的。直接 background-size:contain 会把留白一起缩进格子里 ⇒ 图标糊成 10px。
// 所以按子矩形排版: 元素 = RectTransform 盒, background-size = 画布 × (盒/内容), background-position = -偏移 × 缩放。
const SPR = {
  news: ['StaticResources/Sprites/Map/menu/news.png', [150, 128], [49, 44, 51, 36]],
  event: ['StaticResources/Sprites/Map/menu/event.png', [209, 179], [77, 64, 52, 45]],
  mission: ['StaticResources/Sprites/Map/challenge/mission.png', [150, 128], [56, 49, 43, 32]],
  station: ['StaticResources/Sprites/Map/challenge/station.png', [150, 128], [51, 46, 45, 34]],
  spt: ['StaticResources/Sprites/Map/challenge/spt.png', [150, 128], [49, 45, 52, 35]],
  godpet: ['StaticResources/Sprites/Map/challenge/god pet.png', [150, 128], [53, 46, 41, 33]],
  hell: ['StaticResources/Sprites/Map/challenge/hell.png', [150, 128], [54, 44, 41, 36]],
  info: ['StaticResources/Sprites/Map/menu/info.png', [20, 22]],
  dict: ['StaticResources/Sprites/Map/menu/dict.png', [32, 27]],
  guide: ['StaticResources/Sprites/Map/menu/guide.png', [33, 31]],
  mail: ['StaticResources/Sprites/Map/menu/mail.png', [39, 32]],
  home: ['StaticResources/Sprites/Map/menu/home.png', [512, 512]],
  shop: ['StaticResources/Sprites/Map/menu/guild.png', [41, 37]],
  settings: ['StaticResources/Sprites/Map/menu/settings.png', [29, 29]],
  new: ['StaticResources/Sprites/Map/menu/1141.png', [30, 11]],
  recover: ['StaticResources/Sprites/Map/recover.png', [21, 20]],
  daynight: ['StaticResources/Sprites/Map/flip.png', [54, 54]],
  weather: ['Resources/Sprites/Fight/Weather Test.png', [31, 31]],
  globe: ['StaticResources/Sprites/Map/world button.png', [512, 512]],
  compass: ['StaticResources/Sprites/Map/compass.png', [15, 18]],
  maptitle: ['StaticResources/Sprites/Map/map title.png', [151, 36]],
  portrait: ['Resources/Panels/OldPetBag/Sprites/87.png', [89, 89]],
  hplabel: ['Resources/Sprites/Fight/hp indicator.png', [27, 17]],
  arrow: ['StaticResources/Sprites/Map/arrow.png', [24, 24]],
}

// R9 箭头钮的收起态是**模块级**的：换图会 destroy+重建 HUD (mapScene.mountRestartHud)，
// 若把状态存在实例上，收起 HUD 后传一次送 HUD 就自己弹回来了。
let hudHidden = false

// 把精灵 SPR[key] 按 RectTransform 盒 [l,t,w,h] 画进 node (node 自身即该盒)。
function paint(node, key, box) {
  const [path, canvas, rect] = SPR[key]
  const [rx, ry, rw, rh] = rect || [0, 0, canvas[0], canvas[1]]
  const sx = box[2] / rw, sy = box[3] / rh
  Object.assign(node.style, {
    position: 'absolute',
    left: box[0] + 'px', top: box[1] + 'px', width: box[2] + 'px', height: box[3] + 'px',
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${(canvas[0] * sx).toFixed(1)}px ${(canvas[1] * sy).toFixed(1)}px`,
    backgroundPosition: `${(-rx * sx).toFixed(1)}px ${(-ry * sy).toFixed(1)}px`,
    backgroundImage: art(path),
  })
}

// 底栏 13 钮 —— 节点名 / RectTransform 盒 / 上游 onClick 目标 (MapMenuController.OpenPanel 参数) 全抄场景。
// A 族 (Challenge Bar) 的中文标签**烘在 PNG 里** ⇒ DOM 不再叠字 (叠了会重影); G 族 (Menu Area) 有 Text (Legacy) 子节点。
// G 族 label = [文字, left, top] = Text (Legacy) 30×30 盒**相对图标盒**的左上角:
//   场景那六个节点的 anchorMin/Max=(1,0) + pivot=(1,0) ⇒ 盒的**右下角**钉在图标盒右下角 +anchoredPosition,
//   m_Alignment=8 (LowerRight) ⇒ 字贴盒右下。
//   ⇒ left = 盒宽30 - ... 反解: left = 图标宽 + ap.x - 30, top = 图标高 - ap.y - 30 (ap.y 是 Unity 向上坐标)。
//   代入场景实测的 ap ⇒ 六个盒的绝对顶边**全等于 502.5** (同一条基线), 右缘全 = 图标右缘 +15。
//   ⚠️ 基地/商店 的 ap 是 (5,15)/(7.5,1) —— 与其余四个的 (15,-2.5)/(15,-5) 不同, 别照抄邻座的数。
const MENU = [
  { id: 'news',    panel: 'News',        tip: '新闻', box: [95, 496.5, 55, 40], fam: 'art' },
  { id: 'event',   panel: 'Activity',    tip: '活动', box: [165, 499.5, 42, 36], fam: 'art', handler: 'onEvent' },
  { id: 'mission', panel: 'Mission',     tip: '任务', box: [225, 503.5, 43, 32], fam: 'art' },
  { id: 'station', panel: 'Station',     tip: '要塞', box: [285, 500.5, 45, 34], fam: 'art', handler: 'onStation' },
  { id: 'spt',     panel: 'SPTBoss',     tip: 'SPT',  box: [340, 500, 52, 35], fam: 'art', handler: 'onSpt' },
  { id: 'godpet',  panel: 'SoulPet',     tip: '灵兽', box: [410, 502.5, 40, 30], fam: 'art', handler: 'onGodpet' },
  { id: 'hell',    panel: 'Hell',        tip: '炼狱', box: [470, 500, 40, 35], fam: 'art', handler: 'onHell' },
  { id: 'info',    panel: 'PlayerInfo',  tip: '信息', box: [550, 505, 23, 25], fam: 'glyph', label: ['信息', 8, -2.5], handler: 'onInfo' },
  { id: 'dict',    panel: 'PetDictionary', tip: '图鉴', box: [605, 505, 30, 25], fam: 'glyph', label: ['图鉴', 15, -2.5], handler: 'onDex' },
  { id: 'guide',   panel: 'GuideLine',   tip: '指引', box: [665, 505, 30, 25], fam: 'glyph', label: ['指引', 15, -2.5], handler: 'onGuide' },
  // 信箱钮按人类 2026-10-19 要求改接道具背包 (图标/盒几何/NEW 角标不变, 信箱面板本身仍是待建)。as-built = view-scene-hud-impl.md §12.10
  { id: 'mail',    panel: 'Mailbox',     tip: '信箱', box: [730, 507.5, 25, 20], fam: 'glyph', label: ['信箱', 10, -5], badge: [-15, 0], handler: 'onItemBag', title: '道具背包 (人类 2026-10-19: 信箱钮改开道具背包; 上游 Mailbox 面板仍待建)' },
  { id: 'home',    panel: 'Base',        tip: '基地', box: [770, 487.5, 55, 60], fam: 'glyph', label: ['基地', 30, 15], handler: 'onHome' },
  { id: 'shop',    panel: 'ItemShop',    tip: '商店', box: [840, 501.5, 36, 32], fam: 'glyph', label: ['商店', 13.5, 1], handler: 'onShop' },
]

// create(container, A, handlers) → { update(), setMapTitle(name, weatherId), toggleHud(), isHudHidden(), destroy() }
//   handlers: { onPetBag, onItemBag, onDex, onMap, onSystem, onTodo(label) }
export function create(container, A, handlers = {}) {
  const todo = (label) => {
    if (handlers.onTodo) handlers.onTodo(label)
    else { try { window.logLine && window.logLine(`${label}：面板待建`) } catch { /* noop */ } }
  }
  const root = el('rbh-root')
  // b = 场景算出的 960×540 绝对盒 [l,t,w,h]。
  //   box  = 盒内子节点, 坐标相对父盒 ⇒ 原样落 left/top, 不做补偿。
  //   rbox = 根层节点, 按场景里那个节点**贴哪条边** (Top Bar 一族贴顶 / Bottom Bar 一族贴底)。
  //     宿主把 960×540 画布按舞台宽缩放后居中 (host.js:22) ⇒ 舞台只看得见设计 y∈[6,534], 上下各溢 6px;
  //     Unity 侧贴边节点永远看得见 (锚点跟着画布边走), 所以这里同样按锚点补偿 6px。
  const EDGE = 6
  const box = (cls, b) => {
    const n = el(cls)
    Object.assign(n.style, { position: 'absolute', left: b[0] + 'px', top: b[1] + 'px', width: b[2] + 'px', height: b[3] + 'px' })
    return n
  }
  const rbox = (cls, b, anchor = 'top') => {
    const n = el(cls)
    const st = { position: 'absolute', left: b[0] + 'px', width: b[2] + 'px', height: b[3] + 'px' }
    if (anchor === 'top') st.top = (b[1] + EDGE) + 'px'
    else st.bottom = (540 - b[1] - b[3] + EDGE) + 'px'
    Object.assign(n.style, st)
    return n
  }

  // ── R1 队首卡 (场景 PetCorner 150×70@0,2 + PetSelectBlock 预制体 0.6 缩放) ──
  // 卡内子节点坐标 = 场景绝对盒 − 卡原点 (0,2) (场景: 头像 7.5,10.5 / 名 66,15.6 / HP 标 72,36.6
  // / 血条+血字 72,48 / 恢复 127.2,44.4)。
  const card = rbox('rbh-card', [0, 2, 150, 70])
  const leadSlot = box('rbh-portrait rbh-portrait--lead', [7.5, 8.5, 54, 54])
  const leadPortrait = createPortrait(leadSlot)
  const leadName = text('rbh-lead-name', '')
  Object.assign(leadName.style, { left: '66px', top: '13.6px', width: '69px', height: '18px' })
  const hpBar = bar('rbh-hp', 51, 9)
  Object.assign(hpBar.track.style, { left: '72px', top: '46px' })
  const hpTxt = text('rbh-hptxt', '')
  Object.assign(hpTxt.style, { left: '72px', top: '46px', width: '51px', height: '9px' })
  const hpLabel = el('rbh-hplabel')
  paint(hpLabel, 'hplabel', [72, 34.6, 16.2, 10.2])
  const recover = el('rbh-recover')
  recover.dataset.mid = 'recover'
  paint(recover, 'recover', [127.2, 42.4, 15, 15])
  recover.title = '恢复：上游 PetCorner.Heal()，重启线待建'
  recover.addEventListener('click', (e) => { e.stopPropagation(); todo('恢复') })
  card.append(leadSlot, leadName, hpLabel, hpBar.track, hpTxt, recover)
  card.addEventListener('click', () => handlers.onPetBag && handlers.onPetBag())

  // ── R9 收起/唤出 HUD 的箭头 —— 钉在「精灵背包」卡 (R1) 右缘外侧、垂直居中 ──
  // 上游 Map.unity 没有这一钮 (它的收起逻辑 `MapPetCornerView.Extend()` 只滑 PetCorner、且场景里无人调用)，
  // 本钮按人类 2026-10-19 要求 = 收起/唤出**整块 HUD**。素材用原版 `Map/arrow.png` (青三角)，
  // 方向靠 CSS 旋转：指左 = 点一下收走、指右 = 点一下唤回。详见 docs/view/scene/room/view-scene-hud-impl.md §12.6。
  const toggle = rbox('rbh-toggle', [154, 25, 24, 24])
  toggle.dataset.mid = 'hudToggle'
  const toggleIcon = el('rbh-toggle-icon')
  paint(toggleIcon, 'arrow', [0, 0, 24, 24])
  toggle.append(toggleIcon)
  function setHudHidden(v) {
    hudHidden = !!v
    root.classList.toggle('rbh-root--hidden', hudHidden)
    toggle.dataset.state = hudHidden ? 'hidden' : 'shown'
    toggle.title = hudHidden ? '唤出 HUD' : '隐藏 HUD'
  }
  toggle.addEventListener('click', (e) => { e.stopPropagation(); setHudHidden(!hudHidden) })

  // ── R2 队伍栏 (截图量测: 5 格 60×50 @ left 6.5, 顶 97.5 起, 间距 69.5) ──
  // 栏底曾有一格「道具」额外入口 (§3.5) —— 人类 2026-10-19 信箱钮改开道具背包后, 该入口已由信箱钮承担, 此格摘除。见 impl §12.10。
  const rail = el('rbh-rail')

  // ── R3 地图名横幅两侧: 左=切换地图 (Day Night), 右=天气 (Weather) ──
  const daynight = rbox('rbh-daynight', [345, 0, 50, 35])
  const daynightIcon = el('rbh-daynight-icon')
  paint(daynightIcon, 'daynight', [12.5, 5, 25, 25])
  daynight.append(daynightIcon)
  daynight.dataset.mid = 'daynight'
  daynight.title = '切换地图：上游 MapInfo.SwitchDayNight()，重启线待建'
  daynight.addEventListener('click', () => todo('切换地图'))
  const weather = rbox('rbh-weather', [565, 0, 50, 35])
  const weatherIcon = el('rbh-weather-icon')
  paint(weatherIcon, 'weather', [10, 2.5, 30, 30])
  weather.append(weatherIcon)
  weather.dataset.mid = 'weather'
  // 上游 MapInfoView.SetWeather: weather == 0 ⇒ weatherBackground.SetActive(false) ⇒ 默认不画。
  // 参考截图那张 (新手任务传送室, maps.json weather=null) 正是这一态 ⇒ 天气钮只在有天气时出现。
  weather.style.display = 'none'
  weather.title = '天气：上游无点击目标，重启线待建'
  weather.addEventListener('click', () => todo('天气'))

  // ── R4 地图名横幅 (Map Name Background 160×40@400,-5) ──
  const title = rbox('rbh-title', [400, -5, 160, 40])
  const titleArt = el('rbh-title-art')
  paint(titleArt, 'maptitle', [0, 0, 160, 40])
  const mapTitle = text('rbh-maptitle', '')
  title.append(titleArt, mapTitle)

  // ── R5 地图角标 (Map Corner 70×70@5,470: 大地图钮 + 小地图钮 + 罗盘) ──
  const corner = rbox('rbh-corner', [5, 470, 70, 70], 'bottom')
  const globe = el('rbh-globe'); globe.dataset.mid = 'globe'
  paint(globe, 'globe', [10, 11, 50, 50])
  globe.style.opacity = '0.816'
  globe.title = '大地图：上游 MapCorner.OpenWorldMapPanel()，重启线待建'
  globe.addEventListener('click', () => { if (handlers.onMap) handlers.onMap(); else todo('大地图') })
  const mini = box('rbh-minimap', [55, -10, 25, 25]); mini.dataset.mid = 'minimap'
  const compass = el('rbh-compass')
  paint(compass, 'compass', [6.5, 5, 12, 15])
  mini.append(compass)
  mini.title = '小地图：上游 MapCorner.OpenMiniMapPanel() → MiniMap{categoryId}'
  mini.addEventListener('click', (e) => { e.stopPropagation(); if (handlers.onMiniMap) handlers.onMiniMap(); else todo('小地图') })
  corner.append(globe, mini)

  // ── R6+R7 底栏两条黑带 + 13 钮 ──
  const chalBar = rbox('rbh-bar', [85, 495, 440, 45], 'bottom')
  const menuBar = rbox('rbh-bar', [530, 495, 360, 45], 'bottom')
  const menuBtns = MENU.map((m) => {
    const b = rbox(`rbh-menu-btn rbh-menu-btn--${m.fam}`, m.box, 'bottom')
    b.dataset.mid = m.id
    const icon = el('rbh-menu-icon')
    paint(icon, m.id, [0, 0, m.box[2], m.box[3]])
    b.append(icon)
    if (m.label) {
      const lb = text('rbh-menu-label', m.label[0])
      Object.assign(lb.style, { left: m.label[1] + 'px', top: m.label[2] + 'px' })
      b.append(lb)
    }
    if (m.badge) {
      const bd = el('rbh-menu-new')
      paint(bd, 'new', [m.badge[0], m.badge[1], 30, 11])
      b.append(bd)
    }
    b.title = m.title || (m.handler ? m.tip : `${m.tip}：面板待建`)
    b.addEventListener('click', () => {
      if (m.handler && handlers[m.handler]) handlers[m.handler]()
      else todo(m.tip)
    })
    return b
  })

  // ── R8 设定 (Settings Area 60×60@895,480: 齿轮 + 下方「设 定」) ──
  const gear = rbox('rbh-gear', [895, 480, 60, 60], 'bottom'); gear.dataset.mid = 'settings'
  const gearIcon = el('rbh-gear-icon')
  paint(gearIcon, 'settings', [15, 9, 30, 30])
  const gearLabel = text('rbh-gear-label', '设 定')
  gear.append(gearIcon, gearLabel)
  gear.title = '设定：上游 BottomBar.OpenPanel(Settings)，重启线待建'
  gear.addEventListener('click', () => { if (handlers.onSystem) handlers.onSystem(); else todo('设定') })

  root.append(chalBar, menuBar, card, toggle, rail, daynight, weather, title, corner, ...menuBtns, gear)
  container.append(root)

  const elemIdOf = (p) => CONTENT.petConfig?.(p.petId, p.level)?.elementId ?? 0
  let cells = []                                  // 常驻格池 (换宠只重设图, 不摘 DOM)

  function syncCell(i, pet) {
    let c = cells[i]
    if (!c) {
      const slot = el('rbh-portrait')
      const cell = box('rbh-rail-cell', [6.5, 97.5 + i * 69.5, 60, 50])
      cell.append(slot)
      cell.addEventListener('click', (e) => { e.stopPropagation(); handlers.onPetBag && handlers.onPetBag() })
      rail.append(cell)
      c = { box: cell, slot, portrait: createPortrait(slot), uid: null }
      cells[i] = c
    }
    if (!pet) { c.box.remove(); cells.splice(i, 1); return }
    if (c.uid === pet.uid) return
    c.uid = pet.uid
    // 参考截图的栏格只有脸、没有 Lv ⇒ 与队首卡同一口径: 不画, 读数走 data-lv + tooltip。
    c.box.dataset.lv = 'Lv' + pet.level
    c.box.title = `${A.nameOf(pet)} Lv${pet.level} · 精灵背包`
    c.portrait.set(pet.petId, { elemId: elemIdOf(pet), name: A.nameOf(pet) })
  }

  function renderLead() {
    const team = A.state.team || []
    const lead = team[0]
    if (!lead) {
      leadName.textContent = ''
      hpTxt.textContent = '队伍为空'
      hpBar.set(0)
      leadPortrait.set(null, null)
      card.dataset.lv = ''
      card.title = '队伍为空'
      return
    }
    const e = elemIdOf(lead)
    leadName.textContent = String(A.nameOf(lead) || '')
    const max = Math.max(1, A.hpMax(lead))       // 唯一算数 = 条宽比值 (不改任何数值)
    hpBar.set(Math.max(0, lead.hp) / max)
    leadPortrait.set(lead.petId, { elemId: e, name: A.nameOf(lead) })
    // 上游 PetSelectBlockView.SetHp(): "current / normal"
    hpTxt.textContent = Math.max(0, lead.hp) + ' / ' + Math.round(A.hpMax(lead))
    // 场景里 Level Indicator/Text (9,50.7,51×10.8) 压在头像下半, 但参考截图那一格是空的 (运行时没显示)
    // ⇒ 卡面不画 Lv, 只挂 tooltip, 读数不丢 (docs/view/scene/room/view-scene-hud-impl.md §8)。
    card.dataset.lv = 'Lv' + lead.level
    card.title = `精灵背包 · ${A.nameOf(lead)} Lv${lead.level}`
  }

  function update() {
    renderLead()
    const team = A.state.team || []
    const rest = team.slice(1, A.RST?.TEAM_MAX || team.length)
    for (let i = 0; i < Math.max(rest.length, cells.length); i++) syncCell(i, rest[i])
  }

  // 地图就绪时喂一次: 名 = maps.json.name, 天气 = maps.json.weather (0/null ⇒ 隐藏, 上游口径)。
  function setMapTitle(name, weatherId) {
    mapTitle.textContent = String(name || '')
    const w = CONTENT.restartWeatherOf?.(weatherId) ?? null
    weather.style.display = w ? '' : 'none'
    weather.title = w ? `天气：${w.name} —— ${w.description}（上游无点击目标，重启线待建）` : '无天气'
  }

  update()
  setHudHidden(hudHidden)                 // 重建 (换图) 后沿用上次收起态，不自己弹回
  return {
    update, setMapTitle,
    toggleHud: () => setHudHidden(!hudHidden),
    isHudHidden: () => hudHidden,
    destroy() {
      for (const c of cells) { c.portrait.destroy() }
      cells = []
      leadPortrait.destroy()
      root.remove()
    },
  }
}
