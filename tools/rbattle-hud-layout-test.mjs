// U3 主场景 HUD 复刻 · 布局/保真 harness (docs/view/scene/room/view-scene-hud-impl.md §9)。
// 视觉权威 = 用户截图 mainHud.png (960×540 设计空间)。断 8 区 DOM 齐、底栏 13 钮逐个可点不崩、
// A 族整图钮不叠 DOM 标签 (防重影)、队首卡读数零算数、头像走原版 PNG 路由、地图名接 maps.json、
// 顶栏 profile 条已退役、两宇宙隔离。全程只读 A.*, 不碰 game/core。
// 用法: node tools/rbattle-hud-layout-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rbhud-layout.png]
import puppeteer from 'puppeteer-core'
import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rbhud-layout.png'
const V2 = 'rocoshowdown.save.v2', V3 = 'rocoshowdown.restart.v3', ENG = 'roco.battle.engine'

// 底栏 13 钮 (与 restartHudView.MENU 同序): mid / 中文标签 / 美术族 / 场景 RectTransform 绝对盒
// A 族标签烘在 PNG 里 (news/event/mission/station/spt/god pet/hell 六张 150×128 或 209×179 合成图),
// G 族只有小图标 ⇒ DOM 补标签。标签文本 = 场景 SetInfoPromptText 埋点 (home 的中文是「基地」不是「家园」)。
const MENU = [
  ['news', '新闻', 'art', [95, 496.5, 55, 40]],
  ['event', '活动', 'art', [165, 499.5, 42, 36]],
  ['mission', '任务', 'art', [225, 503.5, 43, 32]],
  ['station', '要塞', 'art', [285, 500.5, 45, 34]],
  ['spt', 'SPT', 'art', [340, 500, 52, 35]],
  ['godpet', '灵兽', 'art', [410, 502.5, 40, 30]],
  ['hell', '炼狱', 'art', [470, 500, 40, 35]],
  ['info', '信息', 'glyph', [550, 505, 23, 25]],
  ['dict', '图鉴', 'glyph', [605, 505, 30, 25]],
  ['guide', '指引', 'glyph', [665, 505, 30, 25]],
  ['mail', '信箱', 'glyph', [730, 507.5, 25, 20]],
  ['home', '基地', 'glyph', [770, 487.5, 55, 60]],
  ['shop', '商店', 'glyph', [840, 501.5, 36, 32]],
]

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--test-type'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 1000 })   // 舞台 1200×660 落在页面 y≈254, 视口矮了会截不到底栏
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// ── 0) content 权威 (动态取, 不硬编码) ──
await page.goto(base, { waitUntil: 'domcontentloaded' })
const meta = await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  return { leadCap: C.restartHpMax(1, 10) }
})

// ── 1) 引擎拨重启 + 播一份可控 v3 (队首 id1@Lv10 半血 + 5 只队伍) → 进 #/map ──
await page.evaluate(async (E, V3k, cap) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  localStorage.clear(); localStorage.setItem(E, 'restart')
  const mk = (uid, petId, level, hp) => ({ uid, petId, level, exp: 0, hp })
  localStorage.setItem(V3k, JSON.stringify({
    v: 3, trainer: { name: '重启训练师', level: 7, coins: 1234, diamonds: 56 },
    team: [
      mk('p1', 1, 10, Math.floor(cap / 2)),            // 队首故意半血, 让分数比 1 更能抓算数越界
      mk('p2', 2, 5, 12), mk('p3', 3, 7, 20), mk('p4', 4, 3, 8), mk('p5', 5, 9, 30), mk('p6', 6, 12, 25),
    ],
    box: [], items: [], dex: { '1': { seen: true, caught: true } }, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
}, ENG, V3, meta.leadCap)
await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 30000 }).catch(() => {})
await page.waitForFunction(() => !!document.querySelector('#rv .rbh-root'), { timeout: 30000 }).catch(() => {})
await page.waitForFunction(() => {
  const H = window.getHud?.()
  return !!(H && document.querySelector('#rv .rbh-maptitle')?.textContent)
}, { timeout: 30000 }).catch(() => {})

// ── 判据 1: 8 区 DOM 齐 (截图 R1..R8) ──
const regions = await page.evaluate(() => ({
  card: !!document.querySelector('#rv .rbh-card'),
  railCells: document.querySelectorAll('#rv .rbh-rail-cell').length,
  teamLen: window.getActiveStore()?.state.team.length ?? -1,
  daynight: !!document.querySelector('#rv .rbh-daynight'),
  weather: !!document.querySelector('#rv .rbh-weather'),
  recover: !!document.querySelector('#rv .rbh-recover'),
  title: !!document.querySelector('#rv .rbh-title'),
  corner: !!document.querySelector('#rv .rbh-corner'),
  globe: !!document.querySelector('#rv .rbh-globe'),
  mini: !!document.querySelector('#rv .rbh-minimap'),
  compass: !!document.querySelector('#rv .rbh-compass'),
  menuBtns: document.querySelectorAll('#rv .rbh-menu-btn').length,
  gear: !!document.querySelector('#rv .rbh-gear'),
}))
A('判据1 八区 DOM 齐 (R1 队首卡+恢复 / R2 队伍栏=队首之外 / R3 切换地图+天气 / R4 标题 / R5 角标地球+小地图+罗盘 / R6+R7 底栏 13 钮 / R8 设定)',
  regions.card && regions.recover && regions.daynight && regions.weather && regions.title
  && regions.corner && regions.globe && regions.mini && regions.compass && regions.gear
  && regions.menuBtns === MENU.length && regions.railCells === regions.teamLen - 1 && regions.teamLen === 6,
  JSON.stringify(regions))

// ── 判据 2: 底栏 13 钮逐个可点, 有后端的接 handler、无后端的诚实「待建」, 全程不崩 / 不脏面板栈 ──
const stackNow = () => page.evaluate(() => import('/game/app/view/panels/host.js').then(m => m.panelStack()))
const clickLog = []
for (const [mid, label, kind] of MENU) {
  const before = await page.$eval('#log', el => el.textContent)
  const errBefore = errs.length
  const stackBefore = await stackNow()
  await page.click(`#rv .rbh-menu-btn[data-mid="${mid}"]`)
  await new Promise(r => setTimeout(r, 80))
  const after = await page.$eval('#log', el => el.textContent)
  const stackAfter = await stackNow()
  clickLog.push({ mid, label, kind, fired: after !== before && after.split('\n')[0].includes(label), crashed: errs.length > errBefore, dirty: JSON.stringify(stackAfter) !== JSON.stringify(stackBefore) })
}
A('判据2a 底栏 13 钮逐个点击 → 都打出含本钮标签的诚实「待建」/占位日志',
  clickLog.every(c => c.fired), JSON.stringify(clickLog.filter(c => !c.fired).map(c => c.mid)))
A('判据2b 点击 13 钮零 pageerror/console 错', clickLog.every(c => !c.crashed), JSON.stringify(errs))
A('判据2c 13 钮点击不推任何子面板 (不伪造内容), 面板栈不脏', clickLog.every(c => !c.dirty), JSON.stringify(clickLog.filter(c => c.dirty).map(c => c.mid)))
A('判据2d 点完全程面板栈仍在 [' + (await stackNow()).join(',') + ']', (await stackNow()).join() === 'rb-hud')

// ── 判据 3: A 族 (150×128/209×179) 标签已烘进 PNG ⇒ 不得再叠 DOM 文字 (防重影) ──
const artDup = await page.evaluate(() => ({
  artWithDomLabel: document.querySelectorAll('#rv .rbh-menu-btn--art .rbh-menu-label').length,
  artWithDomBadge: document.querySelectorAll('#rv .rbh-menu-btn--art .rbh-menu-new').length,
  artN: document.querySelectorAll('#rv .rbh-menu-btn--art').length,
  glyphN: document.querySelectorAll('#rv .rbh-menu-btn--glyph').length,
  glyphAllLabelled: [...document.querySelectorAll('#rv .rbh-menu-btn--glyph')].every(b => b.querySelector('.rbh-menu-label')),
}))
A('判据3 A 族 7 钮不叠 DOM 标签/角标 (已烘进 PNG), G 族 6 钮都有 DOM 标签',
  artDup.artN === 7 && artDup.glyphN === 6 && artDup.artWithDomLabel === 0 && artDup.artWithDomBadge === 0 && artDup.glyphAllLabelled,
  JSON.stringify(artDup))

// ── 判据 4: 队首卡 HP 分数 == lead.hp / A.hpMax(lead), 文本 == "hp / round(hpMax)" (上游 SetHp 口径) ──
const lead = await page.evaluate(() => {
  const A = window.getActiveStore(), p = A.state.team[0]
  const fill = document.querySelector('#rv .rbh-hp .rbb-bar-fill')
  const track = document.querySelector('#rv .rbh-hp')
  return {
    hp: p.hp, cap: A.hpMax(p),
    frac: fill && track ? parseFloat(fill.style.width) / parseFloat(track.style.width) : null,
    txt: document.querySelector('#rv .rbh-hptxt')?.textContent || '',
    name: document.querySelector('#rv .rbh-lead-name')?.textContent || '',
    lv: document.querySelector('#rv .rbh-card')?.dataset.lv || '',
    lvDom: !!document.querySelector('#rv .rbh-lead-lv'),
    railLvDom: !!document.querySelector('#rv .rbh-rail-lv'),
    railLv: [...document.querySelectorAll('#rv .rbh-rail-cell')].map(c => c.dataset.lv),
    hpLabelArt: !!document.querySelector('#rv .rbh-hplabel'),
  }
})
A('判据4a 队首 HP 条宽 = lead.hp / A.hpMax(lead) (唯一算数 = 比值)',
  Math.abs(lead.frac - lead.hp / lead.cap) < 0.02 && lead.hp / lead.cap < 0.99, JSON.stringify(lead))
A('判据4b 队首 HP 文本 = "hp / round(hpMax)" (上游 PetSelectBlockView.SetHp 口径, 不自己攒)',
  lead.txt === `${lead.hp} / ${Math.round(lead.cap)}`, JSON.stringify({ txt: lead.txt, want: `${lead.hp} / ${Math.round(lead.cap)}` }))
A('判据4c 「HP」标签用美术 (hp indicator.png), DOM 不写 HP 字样', lead.hpLabelArt && !/HP/i.test(lead.txt), JSON.stringify({ txt: lead.txt }))
A('判据4d 卡面不画 Lv (场景 Level Indicator 压在头像下半、截图里是空的) ⇒ 读数走 .rbh-card[data-lv]',
  lead.lv === 'Lv10' && lead.lvDom === false, JSON.stringify({ lv: lead.lv, lvDom: lead.lvDom }))
A('判据4e 队伍栏格同样不画 Lv (参考截图栏格只有脸、无角标) ⇒ 读数走 .rbh-rail-cell[data-lv]',
  lead.railLvDom === false && lead.railLv.length === 5 && lead.railLv.every(v => /^Lv\d+$/.test(v)),
  JSON.stringify({ lvDom: lead.railLvDom, dataLv: lead.railLv }))

// ── 判据 5: 头像走原版 PNG 路由 (PetUISystem.GetPetIcon → Resources/Pets/icon/{petId}.png), 缺位才降级色块 ──
const portraits = await page.evaluate(() => {
  const slots = [...document.querySelectorAll('#rv .rbh-portrait')]
  return {
    n: slots.length,
    states: slots.map(s => s.dataset.portrait),
    allLoaded: slots.every(s => s.dataset.portrait === 'png'),
    imgN: slots.filter(s => s.querySelector('img')).length,
    fbN: slots.filter(s => s.querySelector('.rbh-portrait-fb')).length,
    sources: [...document.querySelectorAll('#rv .rbh-portrait img')].map(i => i.getAttribute('src')),
  }
})
A('判据5a 头像槽 6 个 (1 队首 + 5 栏) 全挂真 PNG, 无空图 (无 img 且无降级块)',
  portraits.n === 6 && portraits.imgN + portraits.fbN === 6 && portraits.states.every(s => s && s !== 'loading'),
  JSON.stringify({ n: portraits.n, states: portraits.states, imgN: portraits.imgN, fbN: portraits.fbN }))
A('判据5b 头像 src = /Resources/Pets/icon/{petId}.png (重启客户端自己的权威, 不是 res/pet/icon SWF 容器)',
  portraits.sources.length === 6 && portraits.sources.every((s, i) => s.endsWith(`/Pets/icon/${i + 1}.png`)),
  JSON.stringify(portraits.sources))

// ── 判据 6: 地图名 == maps.json 当前图名 (M.map.name), 不是硬编码 ──
const titleRead = await page.evaluate(() => ({ dom: document.querySelector('#rv .rbh-maptitle')?.textContent || '', mapName: window.M?.map?.name }))
A('判据6 地图名横幅 = M.map.name (maps.json 权威直读)', !!titleRead.mapName && titleRead.dom === String(titleRead.mapName), JSON.stringify(titleRead))

// ── 判据 7: 顶栏 profile/货币条已按截图退役 ──
const retired = await page.evaluate(() => ({
  top: !!document.querySelector('#rv .rbh-top'), coin: !!document.querySelector('#rv .rbh-coin'), dex: !!document.querySelector('#rv .rbh-dex'),
}))
A('判据7 顶栏 profile/货币条退役 (.rbh-top/.rbh-coin/.rbh-dex 均不存在)', !retired.top && !retired.coin && !retired.dex, JSON.stringify(retired))

// ── 判据 8: 两宇宙隔离 —— SWF 常驻 HUD 未建 + v2 存档全程未写 ──
const iso = await page.evaluate((V2k) => ({
  swfHud: window.M?.player?.hudStatus?.() ?? 'no-player',
  v2Written: localStorage.getItem(V2k) !== null,
}), V2)
A('判据8 重启线 SWF 常驻 HUD 未建 (hud=0) 且 v2 存档零写入', iso.swfHud === 'hud=none' && iso.v2Written === false, JSON.stringify(iso))

// ── 判据 9: 几何 == Map.unity RectTransform 绝对盒 (设计空间 960×540, 容差 1.5px) ──
// 期望值逐条抄自场景 (PetSelectBlock 子树含 0.6 m_LocalScale; 底栏 = 容器原点 + anchoredPos),
// 队伍栏 5 格与「道具」额外格不在场景里 (运行时预制体), 期望值取截图量测。
// 第 5 位 = 该节点在场景里贴哪条边: Top Bar 一族 'top' (期望 top = 6 + 场景 top),
// Bottom Bar 一族 'bottom' (期望 bottom = 6 + (540 − 场景 top − 场景 h))。6 = 宿主居中补偿 (host.js:22)。
const GEO = {
  '.rbh-card': [0, 2, 150, 70, 'top'],
  '.rbh-portrait--lead': [7.5, 10.5, 54, 54, 'top'],
  '.rbh-lead-name': [66, 15.6, 69, 18, 'top'],
  '.rbh-hplabel': [72, 36.6, 16.2, 10.2, 'top'],
  '.rbh-hp': [72, 48, 51, 9, 'top'],
  '.rbh-recover': [127.2, 44.4, 15, 15, 'top'],
  '.rbh-daynight': [345, 0, 50, 35, 'top'],
  // .rbh-weather 不在这里: 无天气时它按上游口径隐藏 (display:none ⇒ 零尺寸盒), 几何由判据11 在「有天气」态量。
  '.rbh-title': [400, -5, 160, 40, 'top'],
  '.rbh-corner': [5, 470, 70, 70, 'bottom'],
  '.rbh-globe': [15, 481, 50, 50, 'bottom'],
  '.rbh-minimap': [60, 460, 25, 25, 'bottom'],
  '.rbh-compass': [66.5, 465, 12, 15, 'bottom'],
  '.rbh-gear': [895, 480, 60, 60, 'bottom'],
  '.rbh-rail-item': [6.5, 445, 60, 20, 'top'],
}
for (const m of MENU) GEO[`.rbh-menu-btn[data-mid="${m[0]}"]`] = [...m[3], 'bottom']
const geo = await page.evaluate((G) => {
  const root = document.querySelector('#rv .rbh-root')
  const rr = root.getBoundingClientRect(), sc = rr.width / 960
  const r1 = (v) => Math.round(v * 10) / 10
  const out = {}
  for (const sel in G) {
    const n = root.querySelector(sel)
    if (!n) { out[sel] = 'MISSING'; continue }
    const b = n.getBoundingClientRect()
    out[sel] = [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc),
                r1((rr.bottom - b.bottom) / sc)]
  }
  return { sc, out }
}, GEO)
const geoBad = Object.entries(GEO).filter(([sel, w]) => {
  const got = geo.out[sel]
  if (got === 'MISSING') return true
  const v = got[0] - w[0], hh = got[3] - w[3]
  const edge = w[4] === 'top' ? got[1] - (6 + w[1]) : got[4] - (6 + (540 - w[1] - w[3]))
  return Math.abs(v) > 1.5 || Math.abs(hh) > 1.5 || Math.abs(got[2] - w[2]) > 1.5 || Math.abs(edge) > 1.5
}).map(([sel, w]) => `${sel} got=${JSON.stringify(geo.out[sel])} want=${JSON.stringify(w)}`)
const railBad = await page.evaluate(() => {
  const root = document.querySelector('#rv .rbh-root'), rr = root.getBoundingClientRect(), sc = rr.width / 960
  return [...root.querySelectorAll('#rv .rbh-rail-cell')].map((n, i) => {
    const b = n.getBoundingClientRect()
    const box = [Math.round(((b.left - rr.left) / sc) * 10) / 10, Math.round(((b.top - rr.top) / sc) * 10) / 10,
                 Math.round((b.width / sc) * 10) / 10, Math.round((b.height / sc) * 10) / 10]
    const want = [6.5, 6 + 97.5 + i * 69.5, 60, 50]
    return box.every((v, k) => Math.abs(v - want[k]) <= 1.5) ? null : `cell${i} got=${JSON.stringify(box)} want=${JSON.stringify(want)}`
  }).filter(Boolean)
})
A('判据9a 场景几何一致 (15 个锚点盒 == Map.unity RectTransform, 容差 1.5 设计px; 缩放 ' + geo.sc + ')',
  geoBad.length === 0, geoBad.join(' | '))
A('判据9b 队伍栏 5 格 == 截图量测 (6.5 / 97.5+69.5k / 60×50)', railBad.length === 0, railBad.join(' | '))
// 舞台 #wrap 是 overflow:hidden ⇒ 任何贴边节点被挤出可见带就是静默截掉 (曾经底栏/设定被削掉 6px)。
// 舞台 #wrap 是 overflow:hidden ⇒ 宿主居中一旦跑偏, 贴边节点就被静默多裁 (实测踩过一次: 建层那一次
// 量到 #wrap 有横向滚动条, translateY 缓存成 -16.5 而不是 -7.5, 底栏整排被削掉 9px)。
// 判据 9a 是「相对 .rbh-root」的量法, 宿主跑偏时它跟着一起偏 ⇒ 抓不到; 这里改成「相对 #wrap 可见带」:
// 每个节点贴自己锚点那条边的距离必须 == 场景里贴画布边的距离。多出来的负数就是原版本就出画布的量
// (地图名横幅顶 -5、基地钮底 -7.5), 那是忠实复刻, 不算截。
const clipBad = await page.evaluate((G) => {
  const wrap = document.getElementById('wrap')
  // puppeteer 的 click 会对目标 scrollIntoViewIfNeeded, 而 #wrap 是 overflow:hidden 容器 ——
  // 浏览器照样能改它的 scrollTop (实测被滚了 9px), 于是"贴顶"节点看着像被裁。量之前先归零。
  const scrolled = wrap.scrollTop
  wrap.scrollTop = 0; wrap.scrollLeft = 0; scrollTo(0, 0)
  const w = wrap.getBoundingClientRect()
  const root = document.querySelector('#rv .rbh-root'), rr = root.getBoundingClientRect(), sc = rr.width / 960
  const r1 = (v) => Math.round(v * 10) / 10
  const bad = []
  for (const sel in G) {
    const n = root.querySelector(sel), [l, t, hh, h, a] = G[sel]
    if (!n) { bad.push(`${sel} MISSING`); continue }
    const r = n.getBoundingClientRect()
    const got = a === 'top' ? r1((r.top - w.top) / sc) : r1((w.bottom - r.bottom) / sc)
    const want = a === 'top' ? t : 540 - t - h
    if (Math.abs(got - want) > 1.5) bad.push(`${sel} 贴${a}边=${got} 应为 ${want}`)
  }
  return { bad, diag: `wrap=[${Math.round(w.top)}..${Math.round(w.bottom)}] rv=[${Math.round(rr.top)}..${Math.round(rr.bottom)}] 曾被滚 scrollTop=${scrolled}` }
}, GEO)
A('判据9c 每个节点贴边距离 == 场景贴画布边距离 (相对 #wrap 可见带 ⇒ 宿主居中没跑偏、没多裁)',
  clipBad.bad.length === 0, clipBad.diag + ' ' + clipBad.bad.slice(0, 8).join(' | '))

// ── 判据 10: 卡内/栏底/角标/两侧小钮都可点; 无后端的各自打自己的诚实日志, 有后端的 (道具) 真开面板 ──
// 天气钮不在这里: 当前图 (监狱 weather=0) 按上游口径它是隐藏的, 点击与几何由判据11 在「有天气」态验。
const EXTRA = [
  ['recover', '恢复'], ['daynight', '切换地图'], ['globe', '大地图'],
  ['minimap', '小地图'], ['gear', '设定'], ['rail-item', '道具'],
]
const extraLog = []
for (const [cls, label] of EXTRA) {
  const before = await page.$eval('#log', el => el.textContent)
  const errBefore = errs.length
  const stackBefore = await stackNow()
  const clickable = await page.evaluate((c) => {
    const n = document.querySelector(`#rv .rbh-${c}`)
    if (!n) return 'missing'
    const pe = getComputedStyle(n).pointerEvents
    const r = n.getBoundingClientRect()
    return { pe, hit: !!document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest(`.rbh-${c}`) }
  }, cls)
  if (clickable === 'missing') { extraLog.push({ label, missing: true }); continue }
  await page.click(`#rv .rbh-${cls}`)
  await new Promise(r => setTimeout(r, 80))
  const after = await page.$eval('#log', el => el.textContent)
  const stackAfter = await stackNow()
  const panel = cls === 'rail-item'          // 道具 = U4 已落的真面板, 走栈不走日志
  extraLog.push({
    label, pe: clickable.pe, hit: clickable.hit, crashed: errs.length > errBefore,
    fired: panel ? stackAfter.length > stackBefore.length && stackAfter[stackAfter.length - 1] === 'rb-itembag'
                 : after !== before && after.split('\n')[0].includes(label) && JSON.stringify(stackAfter) === JSON.stringify(stackBefore),
  })
  if (panel) {                                 // 关掉, 别把面板栈留给后面的判据/截图
    await page.evaluate(() => import('/game/app/view/panels/host.js')
      .then(m => { if (m.panelStack().at(-1) === 'rb-itembag') m.closePanel() }))
    await new Promise(r => setTimeout(r, 120))
  }
}
A('判据10a 恢复/切换地图/大地图/小地图/设定 各打自己的诚实「待建」日志, 道具 真开 rb-itembag',
  extraLog.length === EXTRA.length && extraLog.every(c => c.fired), JSON.stringify(extraLog.filter(c => !c.fired)))
A('判据10b 6 钮 pointer-events 生效且中心命中自己 (不被父盒吞掉)',
  extraLog.every(c => c.pe !== 'none' && c.hit !== false), JSON.stringify(extraLog.filter(c => c.pe === 'none' || c.hit === false)))
A('判据10c 点 6 钮零 pageerror/console 错', extraLog.every(c => !c.crashed), JSON.stringify(errs))
A('判据10d 点完全程面板栈回到 [' + (await stackNow()).join(',') + ']', (await stackNow()).join() === 'rb-hud')

// ── 判据 11: 天气钮可见性 == 上游 MapInfoView.SetWeather (weatherBackground.SetActive(weather != 0)) ──
// 参考截图那张 (新手任务传送室) 天气位是空的, 而 Map.unity 里 Weather 节点确实在 ⇒ 场景有、运行时不画。
// 名字/描述取 unity/buffs.json 的 50_0000+weather (上游 Buff.GetWeatherBuff 的 id 口径), 面板不攒文案。
const weatherState = await page.evaluate(async () => {
  const maps = await (await fetch('/game/data/maps.json')).json()
  const buffs = await (await fetch('/game/data/unity/buffs.json')).json()
  const name = document.querySelector('#rv .rbh-maptitle')?.textContent || ''
  const cur = (Array.isArray(maps) ? maps : maps.maps || []).find(m => String(m.name) === name) || null
  const shown = () => { const n = document.querySelector('#rv .rbh-weather'); return !!n && getComputedStyle(n).display !== 'none' }
  const out = { mapName: name, mapWeather: cur ? cur.weather : 'MAP-NOT-FOUND', hiddenAtZero: !shown() }
  const w = buffs.buffs.find(b => b.id === 500001)
  window.__rbHud.setMapTitle(name, '1')                       // 拨到有天气 (晴天)
  out.visibleAtOne = shown()
  out.tipHasName = (document.querySelector('#rv .rbh-weather').title || '').includes(w.name)
  out.tipHasDesc = (document.querySelector('#rv .rbh-weather').title || '').includes(w.description)
  const root = document.querySelector('#rv .rbh-root'), rr = root.getBoundingClientRect(), sc = rr.width / 960
  const b = document.querySelector('#rv .rbh-weather').getBoundingClientRect()
  const r1 = (v) => Math.round(v * 10) / 10
  out.box = [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc)]
  window.__rbHud.setMapTitle(name, cur && cur.weather)        // 还原成当前图的真实天气态
  out.restored = !shown()
  return out
})
A('判据11a 无天气 (weather=0/null) 时天气钮隐藏 —— 与参考截图一致 (场景有节点但运行时不画)',
  weatherState.hiddenAtZero && weatherState.restored, JSON.stringify(weatherState))
A('判据11b 有天气时出现, 名字/描述直读 unity/buffs.json 的 500001 (面板不攒文案)',
  weatherState.visibleAtOne && weatherState.tipHasName && weatherState.tipHasDesc, JSON.stringify(weatherState))
A('判据11c 天气钮几何 == 场景盒 [565, 0, 50, 35]',
  weatherState.box.every((v, i) => Math.abs(v - [565, 6, 50, 35][i]) <= 1.5), JSON.stringify(weatherState.box))
const wErrBefore = errs.length
const wLogBefore = await page.$eval('#log', el => el.textContent)
await page.evaluate(() => window.__rbHud.setMapTitle(document.querySelector('#rv .rbh-maptitle').textContent, '1'))
await page.click('#rv .rbh-weather')
await new Promise(r => setTimeout(r, 80))
const wLogAfter = await page.$eval('#log', el => el.textContent)
await page.evaluate(() => window.__rbHud.setMapTitle(document.querySelector('#rv .rbh-maptitle').textContent, null))
A('判据11d 有天气态下点天气钮 → 打自己的诚实「待建」日志且不崩',
  wLogAfter !== wLogBefore && wLogAfter.split('\n')[0].includes('天气') && errs.length === wErrBefore,
  JSON.stringify({ fired: wLogAfter.split('\n')[0], errs: errs.slice(wErrBefore) }))

// 只截 1200×660 舞台, 方便和 mainHud.png 并排比。
// 两条坑: (1) elementHandle.screenshot 会 scrollIntoView, clip 坐标跟着漂;
//         (2) clip + captureBeyondViewport 会把 Chrome 窗口顶部那条「硬件加速已停用」infobar
//             烘进图 (盖住 HUD 顶排, 事后抠不掉) —— 它是窗口浮层, 不在 DOM 里, 关不掉也删不掉。
// ⇒ 整屏截图 (这条路径实测无 infobar) + 按 #wrap 的页面盒裁出来。
const stage = await page.evaluate(() => {
  const w = document.getElementById('wrap')
  w.scrollTop = 0; w.scrollLeft = 0; scrollTo(0, 0)
  const r = w.getBoundingClientRect()
  return { x: Math.round(r.x + scrollX), y: Math.round(r.y + scrollY), width: Math.round(r.width), height: Math.round(r.height) }
})
await page.screenshot({ path: '/tmp/rbhud-full.png' })
try {
  execFileSync('magick', ['/tmp/rbhud-full.png', '-crop', `${stage.width}x${stage.height}+${stage.x}+${stage.y}`,
    '+repage', shot])
} catch { copyFileSync('/tmp/rbhud-full.png', shot) }   // 没装 ImageMagick 就留整屏图, 不影响判据
console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log(`\n=== U3 主场景 HUD 复刻判据 (并排比: ${shot} ↔ mainHud.png) ===`)
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
