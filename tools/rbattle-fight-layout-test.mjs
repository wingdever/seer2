// F15 战斗版式回归（docs/view/scene/battle/view-scene-battle-design.md §11 判据 + docs/view/scene/battle/view-scene-battle-impl.md §5 契约表）。
// 与 rbattle-hud-layout-test.mjs 同构：逐盒断言 getBoundingClientRect ÷ scale == §4 设计盒（容差 ±2px）。
// viewport 1920×1080 ⇒ scale=2、match 模式逻辑高恰 540 ⇒ 所有盒可直接按绝对值比，绕开变量高度（impl §12）。
// 三条结构钉子各有一判据守着，回退即红：S1 血牌同在顶带 / S2 技能卡在底栏内 / S3 页签互斥。
// 全程只读 window.__battle 与 DOM，不碰 game/core。
// 跑在**重启遇怪态**（不是 demo 对局）：只有这条路径才有多宠袋 ⇒ 换宠页可点、六珠 6 颗实心，
// 页签互斥与门禁才有真行为可验；demo 态只有「战斗」一枚可点，切页判据会退化成空断言。
// 用法: node tools/rbattle-fight-layout-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rbfight-layout.png]
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const url = `${base}#/rbattle?encounter=1&client=2&level=5&slot=0&back=1`
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rbfight-layout.png'
const TOL = 2
const V3 = 'rocoshowdown.restart.v3', V2 = 'rocoshowdown.save.v2', ENG = 'roco.battle.engine'
// 六宠满血队：把六珠推到 petNum=6、换宠页推到 6 格，且 petId 1..6 的头像 PNG 都在盘上（不触发降级）。
const TEAM = [1, 2, 3, 4, 5, 6].map((petId, i) => ({ uid: `p${i + 1}`, petId, level: 100, exp: 0, hp: 9999 }))

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--test-type'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

// 播种走 **未知场景** 地址（`#/seed` 在 SCENES 里没有 ⇒ router 直接 return，一帧地图 HUD 都不挂）。
// 为什么不在 #/map 上播完再跳：router 的 route() 不串接 mount —— mapScene.mount 是异步的，
// 立刻改 hash 会让它在 rbattle.unmount 之后才把 HUD 追加进 #rv，两张 chrome 叠一起（已登记 impl §14 待办）。
await page.goto(`${base}#/seed`, { waitUntil: 'domcontentloaded' })
await page.evaluate(({ V3, V2, ENG, team }) => {
  localStorage.clear()
  localStorage.setItem(ENG, 'restart')
  localStorage.setItem(V3, JSON.stringify({
    v: 3, trainer: { name: '版式测试训练师', level: 10, coins: 0, diamonds: 0 },
    team, box: [], items: [], dex: {}, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
  localStorage.removeItem(V2)
}, { V3, V2, ENG, team: TEAM })
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
const mounted = await page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
if (!mounted) { console.log('战斗 HUD 未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }
await page.waitForFunction(() => document.querySelector('.rbb-plate--my .rbb-hp-fill'), { timeout: 20000 }).catch(() => {})

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

const boot = await page.evaluate(() => { const b = window.__battle.debug(); return { ...b, bag: window.__battle.driver.myBag().length } })
A('挂在重启遇怪态（v3 多宠袋）', boot.engine === 'restart' && boot.enc && boot.isRestart && boot.bag === 6, JSON.stringify(boot))
// 结构护栏：战斗页上不许叠着地图 HUD（router 的 mount 竞态一旦咬人，这条先红，别让盒量到混合层上）。
// 判据只管「不该在的东西」：地图 HUD 节点 (.rbh-*) 一个都不许出现；Ruffle 播放器只能待在 #rb-stage 里
// ——背景+两侧宠本来就是 3 个 ruffle-player（stage 的合法产物，不是残留）。
const alone = await page.evaluate(() => ({
  hud: document.querySelectorAll('.rbh-root, .rbh-menu-btn, [class^="rbh-"]').length,
  strayPlayers: [...document.querySelectorAll('ruffle-player')].filter(n => !n.closest('#rb-stage')).length,
}))
A('战斗 HUD 独占画布（无地图 HUD 叠层、无 #rb-stage 外的 Ruffle 残留）',
  alone.hud === 0 && alone.strayPlayers === 0, JSON.stringify(alone))

// ── 画布模式：match + 逻辑高 540（否则下面所有绝对盒断言都要带变量高）──
const canvas = await page.evaluate(() => window.__battle.debug().canvas)
A('画布 = match 模式', canvas.mode === 'match', JSON.stringify(canvas))
A('逻辑高 == 540（1920×1080 ⇒ scale 2）', Math.abs(canvas.refH - 540) < 0.01 && Math.abs(canvas.scale - 2) < 0.01,
  `scale=${canvas.scale} refH=${canvas.refH}`)

// 逐盒读数：相对 #rv 左上，除以 scale ⇒ 直接落回 960×540 设计空间。
const boxes = await page.evaluate((SELS) => {
  const rv = document.getElementById('rv'), rr = rv.getBoundingClientRect(), sc = rr.width / 960
  const r1 = (v) => Math.round(v * 10) / 10
  const out = {}
  for (const [key, sel] of Object.entries(SELS)) {
    const n = document.querySelector(sel)
    if (!n) { out[key] = 'MISSING'; continue }
    const b = n.getBoundingClientRect()
    out[key] = [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc)]
  }
  return out
}, {
  topband: '.rbb-topband', plateMy: '.rbb-plate--my', plateOp: '.rbb-plate--op',
  round: '.rbb-round', statebuffs: '.rbb-statebuffs',
  bar: '.rbb-bottombar', content: '.rbb-content', options: '.rbb-options',
  super: '.rbb-superskill', noop: '.rbb-noop', extend: '.rbb-extend',
  hpMy: '.rbb-plate--my .rbb-hp', angerMy: '.rbb-plate--my .rbb-anger',
  hpOp: '.rbb-plate--op .rbb-hp', angerOp: '.rbb-plate--op .rbb-anger',
  petnumMy: '.rbb-plate--my .rbb-petnum', nameMy: '.rbb-plate--my .rbb-name',
})

// 期望盒（权威 = 设计 §4）。'bottom' 标记的盒贴底 ⇒ 断言底边距画布底 = 540−(y+h)。
const WANT = {
  topband: [0, 0, 960, 110], plateMy: [0, 0, 400, 110], plateOp: [560, 0, 400, 110],
  round: [430, 10, 100, 50], statebuffs: [432, 65, 100, 110],
  bar: [0, 425, 960, 115], content: [71.5, 437.5, 700, 100], options: [773, 429.5, 185, 110],
  super: [1, 431, 70, 105], noop: [908, 382.5, 40, 40],
  extend: [552, 421, 56, 15],
  hpMy: [111, 10, 260, 18], angerMy: [111, 32, 246, 12],
  hpOp: [29, 10, 260, 18], angerOp: [43, 32, 246, 12],   // 镜像盒 x' = 400−(x+w)，相对 plate--op(560) 再加 560
}
for (const k of Object.keys(WANT)) WANT[k] = WANT[k].map((v, i) => i === 0 && (k === 'hpOp' || k === 'angerOp') ? v + 560 : v)

const geoBad = []
for (const [k, w] of Object.entries(WANT)) {
  const got = boxes[k]
  if (got === 'MISSING') { geoBad.push(`${k} MISSING`); continue }
  const d = got.map((v, i) => Math.abs(v - w[i]))
  if (Math.max(...d) > TOL) geoBad.push(`${k} got=${JSON.stringify(got)} want=${JSON.stringify(w)}`)
}
A(`12 个区盒 == 设计 §4 盒（±${TOL}px）`, geoBad.length === 0, geoBad.join(' | '))

// ── S1：双方血牌同在顶带，且不存在 y>200 的状态类盒 ──
A('S1 两块血牌同在 y[0..110]', boxes.plateMy !== 'MISSING' && boxes.plateOp !== 'MISSING'
  && boxes.plateMy[1] <= TOL && boxes.plateOp[1] <= TOL
  && boxes.plateMy[0] <= TOL && boxes.plateOp[0] >= 560 - TOL,
  `my x=${boxes.plateMy?.[0]} op x=${boxes.plateOp?.[0]}`)
const stray = await page.evaluate(() => {
  const rv = document.getElementById('rv'), rr = rv.getBoundingClientRect(), sc = rr.width / 960
  const bad = []
  for (const n of document.querySelectorAll('.rbb-plate, .rbb-round, .rbb-statebuffs, .rbb-buffs, .rbb-petnum')) {
    const b = n.getBoundingClientRect()
    if ((b.top - rr.top) / sc > 200) bad.push(`${n.className} y=${Math.round((b.top - rr.top) / sc)}`)
  }
  if (document.querySelector('.rbb-hud, .rbb-slot-skill, .rbb-slot-option, .rbb-weather')) bad.push('旧 IA 节点复活')
  return bad
})
A('S1 无任何 y>200 的血牌/回合/buff 盒（旧斜对角不回来）', stray.length === 0, stray.join(' | '))

// ── S2：技能卡在底栏内容区，4 槽 pitch 175、卡 155×82、空槽不建节点 ──
const skills = await page.evaluate(() => {
  const rv = document.getElementById('rv'), rr = rv.getBoundingClientRect(), sc = rr.width / 960
  const d = window.__battle.driver
  const cards = [...document.querySelectorAll('.rbb-skills .rbb-skill')]
  const r1 = (v) => Math.round(v * 10) / 10
  return {
    boxes: cards.map((n) => { const b = n.getBoundingClientRect(); return [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc)] }),
    ids: cards.map((n) => n.dataset.skillId),
    text: document.querySelector('.rbb-skills')?.textContent ?? '',
    expect: d.skillList().normals.filter(Boolean).length,
    inBar: !!document.querySelector('.rbb-bottombar .rbb-content .rbb-skills'),
  }
})
A('S2 技能区在底栏 Content 内', skills.inBar)
A('S2 卡数 == 内核 normals 非空槽数（空槽不建节点）', skills.boxes.length === skills.expect && skills.boxes.length <= 4,
  `dom=${skills.boxes.length} kernel=${skills.expect}`)
const cardBad = skills.boxes.map((b, i) => {
  const want = [80 + 175 * i, 447, 155, 82]
  return b.every((v, k) => Math.abs(v - want[k]) <= TOL) ? null : `卡${i} got=${JSON.stringify(b)} want=${JSON.stringify(want)}`
}).filter(Boolean)
A('S2 卡盒 x=80+175i、155×82', cardBad.length === 0, cardBad.join(' | '))
A('S2 技能区无「无操作」文本（无操作已搬家成绿圆钮）', !/无操作/.test(skills.text))

// ── S3：页签簇 5 张字标 + 同屏只有一页可见 ──
const tabs = await page.evaluate(() => {
  const rv = document.getElementById('rv'), rr = rv.getBoundingClientRect(), sc = rr.width / 960
  const r1 = (v) => Math.round(v * 10) / 10
  const nodes = [...document.querySelectorAll('.rbb-options .rbb-option')]
  return {
    n: nodes.length,
    boxes: nodes.map((n) => { const b = n.getBoundingClientRect(); return { mid: n.dataset.mid, box: [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc)] } }),
    hasText: nodes.map((n) => `${n.dataset.mid}:${n.textContent.trim()}`).filter(s => s.endsWith(':') === false),
    artBg: nodes.map((n) => `${n.dataset.mid}=${/url\(/.test(getComputedStyle(n.querySelector('.rbb-option-art')).backgroundImage)}`),
    pagesVisible: [...document.querySelectorAll('.rbb-content .rbb-page')].filter(p => getComputedStyle(p).display !== 'none').map(p => p.className),
    live: nodes.filter(n => n.classList.contains('rbb-option--live')).map(n => n.dataset.mid),
    on: nodes.filter(n => n.classList.contains('rbb-option--on')).map(n => n.dataset.mid),
  }
})
A('S3 页签簇恰 5 张', tabs.n === 5, `n=${tabs.n}`)
const TAB_WANT = { change: [777, 430.5, 84, 32], capture: [869, 430.5, 84, 32], skill: [775.5, 432.5, 180, 103], item: [777, 505, 84, 32], escape: [869, 505, 84, 32] }
const tabBad = tabs.boxes.map((t) => {
  const w = TAB_WANT[t.mid]; if (!w) return `${t.mid} 不在契约表`
  return t.box.every((v, k) => Math.abs(v - w[k]) <= TOL) ? null : `${t.mid} got=${JSON.stringify(t.box)} want=${JSON.stringify(w)}`
}).filter(Boolean)
A('S3 5 张字标盒 == 设计 §4.4 表', tabBad.length === 0, tabBad.join(' | '))
A('S3 字标是 PNG、无 DOM 文本', tabs.hasText.length === 0 && tabs.artBg.every(s => s.endsWith('=true')), tabs.artBg.join(' '))
A('S3 同屏只有一个内容页可见', tabs.pagesVisible.length === 1, tabs.pagesVisible.join(','))
A('S3 默认选中「战斗」且恒可点', tabs.on.length === 1 && tabs.on[0] === 'skill' && tabs.live.includes('skill'),
  `on=${tabs.on} live=${tabs.live.join(',')}`)

// ── 条与色（impl §5 + §6.2）：宽度是绝对判据，不是「变小」这类相对判据 ──
const bars = await page.evaluate(() => {
  const d = window.__battle.driver
  const rv = document.getElementById('rv'), sc = rv.getBoundingClientRect().width / 960
  const px = (v) => Math.round(v / sc)
  const read = (side) => {
    const pet = side === 'my' ? d.myPet() : d.opPet()
    const fill = document.querySelector(`.rbb-plate--${side} .rbb-hp-fill`), af = document.querySelector(`.rbb-plate--${side} .rbb-anger-fill`)
    const cs = fill && getComputedStyle(fill), acs = af && getComputedStyle(af)
    return {
      hp: pet.hp, maxHp: pet.maxHp, anger: pet.anger, maxAnger: pet.maxAnger,
      hpW: fill ? px(fill.getBoundingClientRect().width) : -1,
      angerW: af ? px(af.getBoundingClientRect().width) : -1,
      hpColor: cs?.backgroundColor, angerColor: acs?.backgroundColor,
      hpMask: /url\(/.test(cs?.maskImage || cs?.webkitMaskImage || ''),
      trio: ['cur', 'sep', 'max'].map(k => document.querySelector(`.rbb-plate--${side} .rbb-hp-${k}`)?.textContent),
      atrio: ['cur', 'sep', 'max'].map(k => document.querySelector(`.rbb-plate--${side} .rbb-anger-${k}`)?.textContent),
    }
  }
  return { my: read('my'), op: read('op') }
})
for (const side of ['my', 'op']) {
  const b = bars[side]
  A(`${side} HP 条宽 == round(hp/maxHp×260) ±1`, Math.abs(b.hpW - Math.round(b.hp / b.maxHp * 260)) <= 1, `${b.hp}/${b.maxHp} → ${b.hpW}px`)
  A(`${side} 怒条宽 == round(anger/maxAnger×246) ±1`, Math.abs(b.angerW - Math.round(b.anger / b.maxAnger * 246)) <= 1, `${b.anger}/${b.maxAnger} → ${b.angerW}px`)
  A(`${side} 条是「一层」：mask 定形 + background-color 定色`, b.hpMask, `color=${b.hpColor}`)
  A(`${side} 数字三段压在条上且 == 内核读数`, b.trio[0] === String(b.hp) && b.trio[1] === '/' && b.trio[2] === String(b.maxHp), b.trio.join(''))
  A(`${side} 怒数字三段 == 内核读数`, b.atrio[0] === String(b.anger) && b.atrio[1] === '/' && b.atrio[2] === String(b.maxAnger), b.atrio.join(''))
}
A('满血 HP 色 == rgb(119,226,12)（上游 lerp 端点）', bars.my.hp === bars.my.maxHp ? bars.my.hpColor === 'rgb(119, 226, 12)' : true,
  `${bars.my.hpColor} @${bars.my.hp}/${bars.my.maxHp}`)
A('怒条固定红 == 场景 m_Color rgb(204,0,0)', bars.my.angerColor === 'rgb(204, 0, 0)', bars.my.angerColor)
// 起算方向读**声明**而非计算值：绝对定位的 left/right 计算值是 used value（两边都会报具体 px），
// 拿不到 'auto'；而血量满时两端空隙都是 0，几何也量不出方向 ⇒ 只能按 CSS 契约判（impl §7 那两行）。
const anchoring = await page.evaluate(() => {
  const out = {}
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    for (const r of rules) {
      if (!r.selectorText || !r.style) continue
      for (const sel of r.selectorText.split(',')) {
        const s = sel.trim().replace(/^#rv\s+/, '')
        if (!/\.(rbb-hp-fill|rbb-anger-fill)$/.test(s)) continue
        out[s] = { left: r.style.left, right: r.style.right }
      }
    }
  }
  return out
})
const wantAnchor = {
  '.rbb-hp-fill': { left: '0px', right: 'auto' }, '.rbb-anger-fill': { left: '0px', right: 'auto' },
  '.rbb-plate--op .rbb-hp-fill': { left: 'auto', right: '0px' }, '.rbb-plate--op .rbb-anger-fill': { left: 'auto', right: '0px' },
}
const anchorBad = Object.entries(wantAnchor).filter(([sel, w]) => {
  const g = anchoring[sel]
  // 基线规则不写 right（CSS 缺省即 auto）⇒ ''与'auto' 同义，都算「不锚右边」。
  const norm = (v) => (v === '' ? 'auto' : v)
  return !g || norm(g.left) !== w.left || norm(g.right) !== w.right
}).map(([sel, w]) => `${sel} got=${JSON.stringify(anchoring[sel])} want=${JSON.stringify(w)}`)
A('我方条从左起算、敌方条从右起算（截图坐实的镜像口径）', anchorBad.length === 0, anchorBad.join(' | '))

// 分段端点：只验 hpColor() 这条呈现函数本身（同 fightPlateView 的导出），不动内核数值。
const colors = await page.evaluate(async () => {
  const m = await import('/game/app/view/panels/battle/fightPlateView.js')
  const rgb = (s) => s.replace(/\s+/g, '').match(/\d+/g).map(Number)
  return { full: rgb(m.hpColor(1)), half: rgb(m.hpColor(0.5)), zero: rgb(m.hpColor(0)), mid: rgb(m.hpColor(0.75)), low: rgb(m.hpColor(0.25)) }
})
const between = (v, a, b) => v.every((c, i) => c >= Math.min(a[i], b[i]) && c <= Math.max(a[i], b[i]))
  && String(v) !== String(a) && String(v) !== String(b)
A('HP 色三段端点：满=绿 50%=黄 0=红（§6.2 逐字搬的 lerp）',
  String(colors.full) === '119,226,12' && String(colors.half) === '255,255,0' && String(colors.zero) === '255,0,0', JSON.stringify(colors))
A('HP 色单调（75% 落在绿↔黄之间、25% 落在黄↔红之间）',
  between(colors.mid, colors.full, colors.half) && between(colors.low, colors.half, colors.zero), JSON.stringify(colors))

// CSS 侧：hp color.png 必须绝迹（场景零引用，impl §7 那两条删除）
const cssText = readFileSync(new URL('../game/app/ui.css', import.meta.url))
A('ui.css 不再引用 hp color.png', !/hp%20color|hp color\.png/.test(cssText))
A('ui.css 声明 has-dead 六珠灰化', /\.rbb-bead\[data-state="has-dead"\][^{]*\{[^}]*grayscale/.test(cssText))

// ── 六珠：6 节点、pitch 13、data-state 三态 ──
const beads = await page.evaluate(() => {
  const d = window.__battle.driver
  const rv = document.getElementById('rv'), sc = rv.getBoundingClientRect().width / 960
  const row = document.querySelector('.rbb-plate--my .rbb-petnum')
  const nodes = [...row.querySelectorAll('.rbb-bead')]
  const lefts = nodes.map(n => n.getBoundingClientRect().left / sc)
  const { petNum, aliveNum } = d.bagCounts('my')
  return {
    n: nodes.length, pitch: lefts.slice(1).map((v, i) => Math.round((v - lefts[i]) * 10) / 10),
    states: nodes.map(n => n.dataset.state), petNum, aliveNum,
    box: (() => { const b = row.getBoundingClientRect(), rv = document.getElementById('rv').getBoundingClientRect(), sc = rv.width / 960
      return [Math.round(b.width / sc), Math.round(b.height / sc)] })(),
  }
})
A('六珠恰 6 节点、盒 85×20', beads.n === 6 && beads.box[0] <= 92, `n=${beads.n} box=${JSON.stringify(beads.box)}`)
A('六珠 pitch 13', beads.pitch.every(v => Math.abs(v - 13) <= 1), beads.pitch.join(','))
A('六珠 data-state ∈ {has,has-dead,no} 且与内核 petNum/aliveNum 一致',
  beads.states.every(s => ['has', 'has-dead', 'no'].includes(s))
  && beads.states.filter(s => s !== 'no').length === beads.petNum
  && beads.states.filter(s => s === 'has').length === beads.aliveNum,
  `${beads.states.join('')} petNum=${beads.petNum} aliveNum=${beads.aliveNum}`)

// ── 回合板 ──
const round = await page.evaluate(() => {
  const n = document.querySelector('.rbb-round-txt')
  return { text: n?.textContent ?? '', fontSize: n && getComputedStyle(n).fontSize, color: n && getComputedStyle(n).color }
})
A('回合板文本 == /回合\\n\\d+/', /^回合\n\d+$/.test(round.text), JSON.stringify(round.text))
A('回合板 16px #52E5F9', round.fontSize === '16px' && round.color === 'rgb(82, 229, 249)', `${round.fontSize} ${round.color}`)

// ── buff 网格：无天气 ⇒ 不产出节点（铁律 6），有天气 ⇒ 首格是天气 ──
const buffs = await page.evaluate(() => {
  const d = window.__battle.driver
  const w = d.weatherBuff()
  const cells = [...document.querySelectorAll('.rbb-statebuffs .rbb-buff')]
  const petCells = [...document.querySelectorAll('.rbb-plate--my .rbb-buffs .rbb-buff')]
  return {
    weather: w ? { id: w.id, name: w.name } : null,
    stateN: cells.length, stateIds: cells.map(c => c.dataset.buffId),
    stateKernel: d.stateBuffs().length,
    petN: petCells.length, petKernel: d.buffsOf('my').filter(b => !b.hide).length,
    cellBox: (() => { const c = cells[0] || petCells[0]; if (!c) return null
      const b = c.getBoundingClientRect(), rv = document.getElementById('rv').getBoundingClientRect(), sc = rv.width / 960
      return [Math.round(b.width / sc), Math.round(b.height / sc)] })(),
    valN: document.querySelectorAll('.rbb-buff-val').length,
    zeroVal: [...document.querySelectorAll('.rbb-buff')].filter(c => c.dataset.buffId).map(c => ({ id: c.dataset.buffId, hasVal: !!c.querySelector('.rbb-buff-val') })),
  }
})
if (buffs.weather) A('有天气 ⇒ .rbb-statebuffs 首格 == weatherBuff.id', buffs.stateIds[0] === String(buffs.weather.id), JSON.stringify(buffs.stateIds))
else A('无天气 ⇒ .rbb-statebuffs 子节点数 == stateBuffs 数（「无天气」四字不存在）',
  buffs.stateN === buffs.stateKernel, JSON.stringify({ dom: buffs.stateN, kernel: buffs.stateKernel }))
A('宠侧 buff 格数 == 内核未 hide 的印记数', buffs.petN === buffs.petKernel, `dom=${buffs.petN} kernel=${buffs.petKernel}`)
A('buff 格 32×32', buffs.cellBox === null || (buffs.cellBox[0] === 32 && buffs.cellBox[1] === 32), JSON.stringify(buffs.cellBox))

// ── 绿圆钮 / 自动战斗 / 必杀槽 / 记录面板 ──
const chrome = await page.evaluate(() => {
  const d = window.__battle.driver, s = d.settingsView()
  const noop = document.querySelector('.rbb-noop'), sup = document.querySelector('.rbb-superskill')
  const rec = document.querySelector('.rbb-record'), ext = document.querySelector('.rbb-extend')
  return {
    noop: !!noop, noopDisabled: noop?.disabled, hasUsable: d.hasUsableSkill(),
    noopBg: /url\(/.test(noop && getComputedStyle(noop).backgroundImage),
    autoExists: !!document.querySelector('.rbb-auto'), isAutoOK: !!s.isAutoOK,
    superLayers: document.querySelectorAll('.rbb-superskill .rbb-super-layer').length,
    superReady: sup?.dataset.ready, shine: !!document.querySelector('.rbb-super-layer--shine'),
    superUsable: !!d.skillList().super?.usable,
    recDisplay: rec && getComputedStyle(rec).display, recOpen: !!window.__battle.record?.isOpen,
    extend: !!ext, extendCls: ext ? [...ext.classList].filter(c => c.startsWith('rbb-extend--')).join(',') : '',
    missing: document.querySelectorAll('[data-asset-missing]').length,
  }
})
A('绿圆钮存在且用 flip.png', chrome.noop && chrome.noopBg)
A('绿圆钮 disabled == 有可用技能（互斥，不双主路径）', chrome.noopDisabled === chrome.hasUsable, `disabled=${chrome.noopDisabled} usable=${chrome.hasUsable}`)
A('自动战斗仅 settings.isAutoOK 才建', chrome.autoExists === chrome.isAutoOK, `dom=${chrome.autoExists} isAutoOK=${chrome.isAutoOK}`)
A('必杀槽 3 层 + data-ready 与内核 usable 同值', chrome.superLayers === 3 && chrome.superReady === (chrome.superUsable ? '1' : '0')
  && chrome.shine === chrome.superUsable, `ready=${chrome.superReady} shine=${chrome.shine} usable=${chrome.superUsable}`)
A('记录面板默认收起（截图那一格是空的 ⇒ 不画）', chrome.recDisplay === 'none' && !chrome.recOpen, `display=${chrome.recDisplay}`)
A('把手存在且收起态 = --up', chrome.extend && chrome.extendCls === 'rbb-extend--up', chrome.extendCls)
A('无 data-asset-missing（缺图即红，不静默换图）', chrome.missing === 0, `n=${chrome.missing}`)

// ── 记录面板展开态：走公开 toggle()，量完还原（面板盒 + 把手骑沿 ±180 + 行序 == reports()）──
const rec = await page.evaluate(() => {
  const rv = document.getElementById('rv'), rr = rv.getBoundingClientRect(), sc = rr.width / 960
  const r1 = (v) => Math.round(v * 10) / 10
  const boxOf = (sel) => { const n = document.querySelector(sel); if (!n) return null; const b = n.getBoundingClientRect()
    return [r1((b.left - rr.left) / sc), r1((b.top - rr.top) / sc), r1(b.width / sc), r1(b.height / sc)] }
  window.__battle.record.toggle()
  const panel = boxOf('.rbb-record'), handle = boxOf('.rbb-extend')
  const lines = [...document.querySelectorAll('.rbb-record .rbb-line')].map(n => n.textContent)
  const reports = window.__battle.driver.reports().map(s => String(s).replace(/<[^>]*>/g, ''))
  const atEnd = (() => { const b = document.querySelector('.rbb-record-body'); return b.scrollHeight - b.clientHeight - b.scrollTop })()
  window.__battle.record.toggle()
  return { panel, handle, lines, reports, atEnd, closed: getComputedStyle(document.querySelector('.rbb-record')).display,
    handleBack: boxOf('.rbb-extend') }
})
A('记录面板盒 == (280,245,360,180)', rec.panel && rec.panel.every((v, i) => Math.abs(v - [280, 245, 360, 180][i]) <= TOL), JSON.stringify(rec.panel))
A('把手骑面板沿：展开态上移 180（y 421 → 241）', rec.handle && Math.abs(rec.handle[1] - 241) <= TOL, JSON.stringify(rec.handle))
A('把手收起后回到 y≈421', rec.handleBack && Math.abs(rec.handleBack[1] - 421) <= TOL, JSON.stringify(rec.handleBack))
A('展开行序 == 内核 reports()（逐行、剥富文本标签）', rec.lines.length === rec.reports.length && rec.lines.every((l, i) => l === rec.reports[i]),
  `dom=${rec.lines.length} kernel=${rec.reports.length}`)
A('展开后滚到底（上游 verticalNormalizedPosition = 0）', Math.abs(rec.atEnd) <= 1, `Δ=${rec.atEnd}`)
A('收起还原（默认态没被测试留在展开）', rec.closed === 'none', rec.closed)

// ── 页签互斥的行为面：切到「精灵」⇒ 只有那页可见；切到锁住的页签 ⇒ 不切页且弹诚实提示 ──
const switchTest = await page.evaluate(() => {
  const live = [...document.querySelectorAll('.rbb-option--live')].map(n => n.dataset.mid)
  const locked = [...document.querySelectorAll('.rbb-option')].filter(n => !n.classList.contains('rbb-option--live')).map(n => n.dataset.mid)
  const before = window.__battle.debug().tab
  window.__battle.selectTab('change')
  const visible = () => [...document.querySelectorAll('.rbb-content .rbb-page')].filter(p => getComputedStyle(p).display !== 'none').map(p => p.className.replace('rbb-page rbb-page--', ''))
  const mid = visible()
  const on = [...document.querySelectorAll('.rbb-option--on')].map(n => n.dataset.mid)
  const changeCells = document.querySelectorAll('.rbb-page--change .rbb-change-btn').length
  const currentMark = document.querySelectorAll('.rbb-page--change .rbb-change-current').length
  const pick = locked[0] ?? null
  let after = null, notice = null
  if (pick) {
    window.__battle.selectTab(pick)
    after = { tab: window.__battle.debug().tab, visible: visible() }
    notice = document.querySelector('.rbb-notice')?.textContent ?? ''
  }
  window.__battle.selectTab('skill')
  return { live, locked, before, mid, on, changeCells, currentMark, pick, after, notice, back: window.__battle.debug().tab, backVisible: visible() }
})
A('遇怪态门禁：换宠/捕捉随多宠袋与 isCaptureOK 置活', switchTest.live.includes('change') && switchTest.live.includes('capture'),
  `live=${switchTest.live.join(',')} locked=${switchTest.locked.join(',')}`)
A('切页签 ⇒ 只有一页可见且 --on 同步（S3 的行为面）', switchTest.mid.length === 1 && switchTest.mid[0] === 'change'
  && switchTest.on.length === 1 && switchTest.on[0] === 'change', JSON.stringify(switchTest.mid) + ' / ' + JSON.stringify(switchTest.on))
A('换宠页在页内产出 6 格 + 在场宠火焰角标', switchTest.changeCells === 6 && switchTest.currentMark === 1,
  `cells=${switchTest.changeCells} current=${switchTest.currentMark}`)
A('锁住的页签不切页、只弹诚实提示', switchTest.pick === null || (switchTest.after.tab === 'change'
  && switchTest.after.visible.length === 1 && switchTest.after.visible[0] === 'change' && /未接|不开放/.test(switchTest.notice)),
  `pick=${switchTest.pick} after=${JSON.stringify(switchTest.after)} notice=${switchTest.notice}`)
A('切回「战斗」还原（测试不留脏态）', switchTest.back === 'skill' && switchTest.backVisible.join() === 'skill', switchTest.backVisible.join(','))

// 截图留档（与 battle.png 并排目测用）。等两侧 fight SWF 真出画面再拍 ——
// 舞台装载是异步的（petContainer 外层 200 → 内层 {swfId}.swf → 首帧），不等就拍会留一张**没有宠**的存档图。
// 只影响留档，不影响上面任何一条判据（判据量的是 DOM chrome，与形象层无关）。
await page.waitForFunction(() => ['#rb-fL', '#rb-fR'].every(id => {
  const p = document.getElementById(id)?.querySelector('ruffle-player')
  return !!p?.shadowRoot?.querySelector('canvas')
}), { timeout: 20000 }).catch(() => {})
await new Promise(r => setTimeout(r, 1500))
await page.screenshot({ path: shot })
try {
  const stage = await page.evaluate(() => { const r = document.getElementById('rv').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } })
  execFileSync('magick', [shot, '-crop', `${stage.width}x${stage.height}+${stage.x}+${stage.y}`, '+repage', shot])
} catch { /* 没装 magick 就留整屏图 */ }

console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== 战斗版式判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
