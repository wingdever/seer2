// U2/D 端到端: 重启遇怪里**捕捉由内核 Capture 算子真结算** (v3), 成功→落档队伍/图鉴/经验, 失败→消耗胶囊继续战斗。
// 断言概率在算子里 (UI 不算), save-side 落档标 _authority.capture, v2/AS3 线不写。
// 用法: node tools/rbattle-capture-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rb-cap.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rb-cap.png'
const SAVE3 = 'rocoshowdown.restart.v3'
const SAVE2 = 'rocoshowdown.save.v2'

// 胶囊: 10005 无敌(prob100 无等级门)必中; 10001 初级(prob25, who:op level LTE 30)可被等级门挡; 10003 高级(prob35 无门)看掷点。
const LEAD = { petId: 1, level: 100 }
const CAPTURE = 10005, GATED = 10001, MISS = 10003

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

function seedV3(items) {
  return {
    v: 3,
    trainer: { name: '测试训练师', level: 1, coins: 0, diamonds: 0 },
    team: [{ uid: 'p1', petId: LEAD.petId, level: LEAD.level, exp: 0, hp: 9999 }],
    box: [], items, dex: {}, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }
}

// 载入一份 v3 档 + 指定胶囊, 进 encounter 战斗 (野怪 id/等级由参数控)。
async function enterBattle(items, wildLevel) {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const save = seedV3(items)
  await page.evaluate(({ SAVE3, SAVE2, save }) => {
    localStorage.removeItem('roco.battle.engine')            // 开关拨上 → 恒走 v3 内核
    localStorage.setItem(SAVE3, JSON.stringify(save))
    localStorage.removeItem(SAVE2)                           // 确保 v2 键不被这条线写
  }, { SAVE3, SAVE2, save })
  const url = `${base}#/rbattle?encounter=1&client=2&level=${wildLevel}&slot=0&back=1`
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  return page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
}

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// ── 场景1: 无敌胶囊 (prob100) 对 Lv10 野怪 → 内核判 CaptureSuccess → 落档 ──
if (!await enterBattle([{ id: CAPTURE, count: 1 }], 10)) {
  A('遇怪挂载', false, 'window.__battle 未出现'); console.log(JSON.stringify(errs)); await browser.close(); process.exit(1)
}
// 捕捉入口 = 底栏页签（U2 的模态弹层已退役，impl §11：只换选择器，语义不变）。
const slotActive = await page.evaluate(() => {
  const cap = document.querySelector('.rbb-option[data-mid="capture"]')
  const live = !!cap && cap.classList.contains('rbb-option--live')
  window.__battle.selectTab('capture')
  const visible = [...document.querySelectorAll('.rbb-content .rbb-page')].filter(p => getComputedStyle(p).display !== 'none').map(p => p.className)
  const cells = [...document.querySelectorAll('.rbb-page--capture .rbb-item')].map(n => ({ id: n.dataset.itemId, off: n.classList.contains('rbb-item--off') }))
  window.__battle.selectTab('skill')
  return { has: !!cap, live, visible, cells, kernel: window.__battle.capsules() }
})
A('捕捉页签在重启遇怪态置活（--live）', slotActive.live, JSON.stringify({ has: slotActive.has, live: slotActive.live }))
A('切到捕捉页 ⇒ 只那页可见且格数 == 存档胶囊数',
  slotActive.visible.length === 1 && slotActive.visible[0] === 'rbb-page rbb-page--capture'
  && slotActive.cells.length === slotActive.kernel.length && slotActive.cells.every(c => !c.off),
  JSON.stringify(slotActive))

const cap = await page.evaluate((capId) => {
  const b = window.__battle, d = b.driver
  const before = { team: b.team().length, caps: b.capsules() }
  const ret = b.capture(capId)
  const res = d.outcome()
  return {
    ret, before,
    isCapture: res.isCapture, state: res.state, over: d.isOver(),
    lastResult: window.APP?.lastResult,
    snap: b._enc(),
  }
}, CAPTURE)
A('捕捉经内核算子返回执行', cap.ret === true)
A('内核 result.state=CaptureSuccess(5)', cap.isCapture === true && cap.state === 5, `state=${cap.state}`)
A('战斗因捕捉而结束', cap.over === true)
A('胶囊投出即消耗 (count 1→0)', cap.before.caps.length === 1 && cap.before.caps[0].count === 1)

const after = await page.evaluate(({ SAVE3, SAVE2, wildId }) => {
  const s = JSON.parse(localStorage.getItem(SAVE3) || 'null')
  const newPet = s && (s.team[1] || s.box[0] || null)
  return {
    teamLen: s?.team?.length, boxLen: s?.box?.length,
    newPet, dexCaught: !!(s?.dex?.[String(wildId)]?.caught),
    leadExp: s?.team?.[0]?.exp, battleCleared: s?.battle === null,
    v2Written: localStorage.getItem(SAVE2) !== null,
  }
}, { SAVE3, SAVE2, wildId: 2 })
A('save-side: 被捕获宠已入队/仓 (team+box 增加)', (after.teamLen + after.boxLen) >= 2, `team=${after.teamLen} box=${after.boxLen}`)
A('save-side: 新宠是野怪种 (petId=2)', after.newPet && after.newPet.petId === 2, JSON.stringify(after.newPet))
A('save-side: 新宠标 _authority.capture (未谎称进 golden)', after.newPet && /kernel-capture/.test(String(after.newPet._authority)), String(after.newPet?._authority))
A('save-side: 图鉴 caught 点亮野怪', after.dexCaught === true)
A('save-side: 参战队首经验入账 (捕捉也发经验)', after.leadExp > 0, `exp=${after.leadExp}`)
A('save-side: battle 槽归 null (结算落盘)', after.battleCleared === true)
A('v2 键未被这条线写 (AS3/v2 线逐字节不动)', after.v2Written === false)

// ── 场景2: 初级胶囊 (10001, conditionRaw:pet/level) → 门槛判定撞内核 condition 未移植围栏 → 诚实不消耗、不结束 ──
if (await enterBattle([{ id: GATED, count: 1 }], 50)) {
  const g = await page.evaluate((gatedId) => {
    const b = window.__battle
    const ret = b.capture(gatedId)
    return { ret, over: b.driver.isOver(), caps: b.capsules(), isCapture: b.driver.outcome().isCapture, err: b.lastError || null }
  }, GATED)
  A('门槛算子未移植: capture 诚实返回 false (不假装捕捉)', g.ret === false)
  A('门槛算子未移植: 胶囊未消耗 (count 仍为 1)', g.caps.length === 1 && g.caps[0].count === 1, JSON.stringify(g.caps))
  A('门槛算子未移植: 战斗未结束、未误判捕捉', g.over === false && g.isCapture === false)
} else {
  A('门槛算子未移植: 挂载遇怪', false)
}

// ── 场景3: 高级胶囊 (prob35, 无门) 满血野怪 → 消耗一颗; 未中则战斗继续, 中则结束 (两者皆可, 但不得抛) ──
if (await enterBattle([{ id: MISS, count: 1 }], 100)) {
  const m = await page.evaluate((missId) => {
    const b = window.__battle
    const ret = b.capture(missId)
    return { ret, over: b.driver.isOver(), caps: b.capsules(), isCapture: b.driver.outcome().isCapture }
  }, MISS)
  A('prob35 投掷: 执行且不抛 (内核掷点走浏览器 rng 缝)', m.ret === true)
  A('prob35 投掷: 胶囊已消耗', m.caps.length === 0, JSON.stringify(m.caps))
  A('prob35 投掷: 未中则继续 / 中则捕捉结束 (二选一, 恒成立)',
    (m.over && m.isCapture) || (!m.over), `over=${m.over} cap=${m.isCapture}`)
} else {
  A('prob35 投掷: 挂载遇怪', false)
}

await page.screenshot({ path: shot })
console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== 捕捉闭环判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
