// U5-Battle 重启战斗舞台回归 (地图背景 SWF + 左右 fight SWF 精灵 + 战报增量→clip)。
// 判据 (docs/view/ui-handoff.md U5-Battle / 计划 rough-meadow-swallow.md 验收):
//   A) #rb-bg/#rb-fL/#rb-fR 三个 ruffle-player 存在; 逐层隔离截图→2D 采样非全黑 (证明确实画出画面, 不是黑屏)。
//      注: Ruffle 用 WebGL canvas, 直接 getImageData 读回全黑 (preserveDrawingBuffer=false 的已知坑),
//          所以这里用「裁剪截图 → 光栅 PNG 过 2D canvas → getImageData」采样真实渲染输出。
//   B) 两宠 getAvailableStates() 非空, 含可匹配的 待机/攻击 语义标签。
//   C) 装载后 present 触发 (setStateCalls ≥ 4: 双方登场 + 双方待机)。
//   D) 打真回合 → setStateCalls 出现 攻击族 与 被族 状态各 ≥1, 且攻击先于受击 (战报增量→clip 生效)。
//   E) 纯映射 __clipActions 复核: 全量战报里含 attack + hit 语义。
//   F) 降级: 缺 fight swf / 缺背景 → 容器留 note、不抛、另一侧照常装载、setState 不炸。
//   G) 遇怪闭环: 舞台挂载下 runUntilOver → v3 回写正确、全程 v2 未被写。
//   H) 全程 console/pageerror 0。
// 用法: node tools/rbattle-stage-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rbstage.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rbstage.png'
const V2 = 'rocoshowdown.save.v2', V3 = 'rocoshowdown.restart.v3', ENG = 'roco.battle.engine'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// 采样当前可见的舞台层: 裁剪到 #rb-bg 矩形截图 → 光栅 PNG 过 2D canvas → 统计非黑像素/色相分布。
async function sampleStage(clipRect) {
  const b64 = await page.screenshot({ encoding: 'base64', clip: clipRect })
  return page.evaluate(async (data) => {
    const img = new Image()
    const loaded = await new Promise(res => { img.onload = () => res(true); img.onerror = () => res(false); img.src = 'data:image/png;base64,' + data })
    if (!loaded) return { err: 'img load fail' }
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let nonBlack = 0, sum = 0; const bins = new Set()
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (r > 16 || g > 16 || b > 16) nonBlack++
      sum += r + g + b
      bins.add((r >> 4) + ',' + (g >> 4) + ',' + (b >> 4))
    }
    return { w: c.width, h: c.height, nonBlackPct: +(nonBlack / n * 100).toFixed(1), distinctBins: bins.size, avg: Math.round(sum / n / 3) }
  }, b64)
}
// 只留某一层可见 (其余舞台盒 + DOM 面板 #rv 隐藏), 采样后恢复。
async function sampleLayer(boxId, clipRect) {
  await page.evaluate((sid) => {
    document.querySelectorAll('.rb-stage-box').forEach(b => { b.dataset._d = b.style.display; b.style.display = (b.id === sid ? '' : 'none') })
    const rv = document.getElementById('rv'); if (rv) rv.style.display = 'none'
  }, boxId)
  await sleep(500)
  const s = await sampleStage(clipRect)
  await page.evaluate(() => {
    document.querySelectorAll('.rb-stage-box').forEach(b => { b.style.display = b.dataset._d || ''; delete b.dataset._d })
    const rv = document.getElementById('rv'); if (rv) rv.style.display = ''
  })
  return s
}

// ── 载入 demo 战斗 (master=1 迪兰 vs client=2 迪迪兰) ──
await page.goto(`${base}#/rbattle?master=1&client=2`, { waitUntil: 'domcontentloaded', timeout: 60000 })
const mounted = await page.waitForFunction(() => window.__battle && window.__battle.stage, { timeout: 30000 }).then(() => true).catch(() => false)
if (!mounted) { console.log('rbattle 舞台未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }
await page.evaluate(async () => { try { await window.__battle.stage.ready } catch (e) {} })
await sleep(3500)   // 让背景 + 两宠 SWF 出帧、present 播完

const rect = await page.evaluate(() => { const r = document.getElementById('rb-bg').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })

// A) 三层 ruffle-player 存在
const dom = await page.evaluate(() => {
  const q = (id) => { const el = document.getElementById(id); return { exists: !!el, player: !!(el && el.querySelector('ruffle-player')) } }
  return { bg: q('rb-bg'), my: q('rb-fL'), op: q('rb-fR') }
})
A('A1 背景层 #rb-bg 有 ruffle-player', dom.bg.exists && dom.bg.player, JSON.stringify(dom.bg))
A('A2 我宠层 #rb-fL 有 ruffle-player', dom.my.exists && dom.my.player, JSON.stringify(dom.my))
A('A3 敌宠层 #rb-fR 有 ruffle-player', dom.op.exists && dom.op.player, JSON.stringify(dom.op))

// A') 逐层隔离采样非全黑 (证明确实画出画面)
const sBg = await sampleLayer('rb-bg', rect)
const sMy = await sampleLayer('rb-fL', rect)
const sOp = await sampleLayer('rb-fR', rect)
A('A4 背景层渲染非全黑 (非黑像素>20% 且色相分布>8)', sBg.nonBlackPct > 20 && sBg.distinctBins > 8, JSON.stringify(sBg))
A('A5 我宠层渲染非全黑 (有非黑像素)', sMy.nonBlackPct > 0.5 && sMy.distinctBins > 4, JSON.stringify(sMy))
A('A6 敌宠层渲染非全黑 (有非黑像素)', sOp.nonBlackPct > 0.5 && sOp.distinctBins > 4, JSON.stringify(sOp))

// B) 两宠可用状态含 待机/攻击 语义
const states = await page.evaluate(() => ({ my: window.__battle.stage.availableStates('my'), op: window.__battle.stage.availableStates('op') }))
const hasIdle = (l) => l.some(s => /待机/.test(s)), hasAtk = (l) => l.some(s => /攻击/.test(s))
A('B1 我宠 getAvailableStates 非空含 待机/攻击', states.my.length > 0 && hasIdle(states.my) && hasAtk(states.my), states.my.join('/'))
A('B2 敌宠 getAvailableStates 非空含 待机/攻击', states.op.length > 0 && hasIdle(states.op) && hasAtk(states.op), states.op.join('/'))

// C) present 已播 (setStateCalls ≥ 4)
const afterPresent = await page.evaluate(() => window.__battle.stage.setStateCalls.slice())
A('C1 装载后 present 触发 (setStateCalls ≥ 4)', afterPresent.length >= 4, JSON.stringify(afterPresent))

// D) 打真回合 → 攻击族 + 被族各≥1, 攻击先于受击
await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  const list = d.availableSkills(), dmg = list.find(s => (s.power ?? 0) > 0)
  window.__dmgId = dmg ? dmg.id : (list[0] && list[0].id)
})
for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__battle.act(window.__dmgId)); await sleep(4200) }
const calls = await page.evaluate(() => window.__battle.stage.setStateCalls.map(c => c.state))
const atkIdx = calls.findIndex(s => /攻击/.test(s)), hitIdx = calls.findIndex(s => /被/.test(s))
A('D1 打回合后 setStateCalls 增长 (含攻击/被族)', calls.length > afterPresent.length && atkIdx >= 0 && hitIdx >= 0, `n=${calls.length} atk=${atkIdx} hit=${hitIdx}`)
A('D2 出手先于受击 (战报增量→clip 时序)', atkIdx >= 0 && hitIdx >= 0 && atkIdx < hitIdx, `atk@${atkIdx} hit@${hitIdx}`)

// E) 纯映射复核
const mapped = await page.evaluate(() => window.__battle.__clipActions([]).map(a => a.kind))
A('E1 __clipActions 全量含 attack + hit 语义', mapped.includes('attack') && mapped.includes('hit'), JSON.stringify(mapped))

// F) 降级 (同页内直接建舞台: 缺 fight swf + 缺背景 → note、不抛、另一侧仍装载)
const degrade = await page.evaluate(async () => {
  const S = await import('/game/app/view/battle/restartFighterStage.js')
  let threw = null, st = null
  try { st = S.create({ mySwfId: 1, opSwfId: 999999, fightMap: 'zzz_missing_map', log: () => {} }); await st.ready } catch (e) { threw = e }
  const out = {
    threw: threw ? String(threw.message).slice(0, 120) : null,
    opNote: st ? (st.boxes.op.querySelector('.rb-stage-note')?.textContent || '') : null,
    bgNote: st ? (st.boxes.bg.querySelector('.rb-stage-note')?.textContent || '') : null,
    bgAlive: !!(st && st.boxes.bg && st.boxes.bg.isConnected),
    myOk: st ? st.availableStates('my').length > 0 : false,
    setStateNoThrow: (() => { try { st.setState('op', 'attack'); st.setState('op', 'hit'); return true } catch (e) { return false } })(),
  }
  try { st.destroy() } catch (e) {}
  return out
})
A('F1 缺素材不抛', degrade.threw === null, degrade.threw || '')
A('F2 缺 fight swf → 敌宠容器留提示 note (状态表空判据)', /缺失|无动画|无 Ruffle/.test(degrade.opNote || ''), JSON.stringify(degrade.opNote))
A('F3 缺背景不抛、背景层容器仍在 (Ruffle 吞 404 属预期)', degrade.bgAlive === true, JSON.stringify(degrade.bgNote))
A('F4 一侧缺素材、另一侧仍装载', degrade.myOk === true)
A('F5 缺状态侧 setState 不炸', degrade.setStateNoThrow === true)

await page.screenshot({ path: shot })

// ── G) 遇怪闭环 (舞台挂载下 runUntilOver → v3 回写、v2 未写) ──
await page.evaluate((E) => { localStorage.clear(); localStorage.setItem(E, 'restart') }, ENG)
await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 25000 }).catch(() => {})
await page.evaluate(async ({ V3k }) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const lead = { uid: 'p1', petId: 1, level: 100, exp: 0, hp: C.restartHpMax(1, 100) }
  localStorage.setItem(V3k, JSON.stringify({
    v: 3, trainer: { name: '重启训练师', level: 1, coins: 0, diamonds: 0 },
    team: [lead], box: [], items: [], dex: {}, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
}, { V3k: V3 })
const WILD = { petId: 2, level: 12 }
await page.goto(`${base}#/rbattle?encounter=1&client=${WILD.petId}&level=${WILD.level}&slot=0&back=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
const encOk = await page.waitForFunction(() => window.__battle && window.__battle.stage, { timeout: 30000 }).then(() => true).catch(() => false)
A('G1 遇怪模式舞台仍挂载', encOk)
if (encOk) {
  await page.evaluate(async () => { try { await window.__battle.stage.ready } catch (e) {} })
  await sleep(1600)   // 让 present 播完 (登场→650ms→待机)，再打会一击 KO 的遇怪回合
  const fin = await page.evaluate(() => window.__battle.runUntilOver(80))
  A('G2 真内核战斗结束判胜', fin.over && fin.outcome === 1, `rounds=${fin.rounds} state=${fin.outcome}`)
  await sleep(1600)   // 等 KO/胜利 clip 的 playRound 链播完
  const after = await page.evaluate(({ V3k, V2k, wildId }) => {
    const s = JSON.parse(localStorage.getItem(V3k) || 'null')
    const calls = (window.__battle.stage.setStateCalls || []).map(c => c.state)
    return {
      win: window.APP?.lastResult?.outcome === 'win' && window.APP?.lastResult?.wild?.petId === wildId,
      dexSeen: !!s?.dex?.[String(wildId)]?.seen, battleCleared: s?.battle === null,
      v2Written: localStorage.getItem(V2k) !== null,
      stageKicked: calls.length >= 4 && calls.some(x => /胜利|失败|濒死/.test(x)),
    }
  }, { V3k: V3, V2k: V2, wildId: WILD.petId })
  A('G3 结算回图: APP.lastResult win + 野怪 id', after.win, JSON.stringify(after.win))
  A('G4 v3 图鉴点亮 + battle 槽归 null', after.dexSeen && after.battleCleared, JSON.stringify(after))
  A('G5 闭环全程 v2 未被写 (两宇宙隔离)', after.v2Written === false)
  A('G6 遇怪战斗里舞台 clip 有触发 (含 KO/胜利)', after.stageKicked)
}

console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== U5-Battle 舞台判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
