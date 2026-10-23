// U1 闭环端到端: 模拟地图遇怪进入重启内核战斗 (#/rbattle?encounter=1) —— 真存档队首 vs 野怪 →
// 跑到 KO → game/logic 结算写回 (经验/图鉴/hp) → 递 APP.lastResult。断言数字来自内核、元游戏落档。
// 用法: node tools/rbattle-encounter-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rb-enc.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rb-enc.png'
const SAVE2 = 'rocoshowdown.save.v2'
const LEAD = { petId: 1, level: 100 }      // 迪兰 Lv100 —— 我方队首（重启表 id 空间）
const WILD = { petId: 2, level: 2 }        // 敌方野怪低等级 —— driver 里 client 恒无操作，我方必可推进到 KO

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

// 1) 先开基页, 显式钉 as3 宇宙 (v2 线), 播一份可控存档 (v2) —— 队伍仅一只队首, dex 空 (便于断言"新见")。
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(({ SAVE2, LEAD }) => {
  localStorage.setItem('roco.battle.engine', 'as3')
  const save = {
    v: 2,
    trainer: { name: '测试训练师', level: 1, coins: 0, diamonds: 0 },
    team: [{ uid: 'p1', petId: LEAD.petId, name: '迪兰', swfId: LEAD.petId, level: LEAD.level, exp: 0, hp: 9999 }],
    box: [], items: [], dex: {}, evolve: { pending: [] }, battle: null,
  }
  localStorage.setItem(SAVE2, JSON.stringify(save))
}, { SAVE2, LEAD })

// 2) 载入 encounter URL (整页加载 → route() 挂 rbattle encounter 模式)。
const encUrl = `${base}#/rbattle?encounter=1&client=${WILD.petId}&level=${WILD.level}&slot=0&back=1`
await page.goto(encUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
const have = await page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
if (!have) { console.log('rbattle encounter 未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// 3) 开局: 我方读真存档队首, 敌方是那野怪, 数字全走内核。
const init = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  return {
    enc: b.enc,
    myName: d.myPet().name, myLevel: d.myPet().level,
    opName: d.opPet().name, opLevel: d.opPet().level,
    myHp: d.myPet().hp, myMaxHp: d.myPet().maxHp,
    hasEntrance: d.reports().some(r => /登场了/.test(r)),
    panels: document.querySelectorAll('.rbb-plate').length,   // 版式重写后：两块血牌同在顶带（旧 .rbb-hud 已退役）
    encSnapshot: b._enc(),
  }
})
A('encounter 模式已启用', init.enc === true)
A('我方宠名/等级来自真存档队首', init.myName === '迪兰' && init.myLevel === LEAD.level, `${init.myName} Lv${init.myLevel}`)
A('敌方是那只野怪 (内核读)', init.opLevel === WILD.level, `${init.opName} Lv${init.opLevel}`)
A('我方带伤入场 hp ∈ [1, maxHp]', init.myHp >= 1 && init.myHp <= init.myMaxHp, `${init.myHp}/${init.myMaxHp}`)
A('首帧含登场战报', init.hasEntrance)
A('战斗面板就位', init.panels >= 2, `n=${init.panels}`)

// 4) 推到真 KO (跑真内核回合), 出结算并回写元游戏。
const fin = await page.evaluate(() => window.__battle.runUntilOver(80))
A('战斗真结束 (isOver)', fin.over, `rounds=${fin.rounds} outcome=${fin.outcome}`)
A('内核判胜 (outcome.state=1 Win)', fin.outcome === 1, `state=${fin.outcome}`)

const after = await page.evaluate(() => {
  const b = window.__battle
  const R = window.APP?.lastResult
  return { resultShown: !!document.querySelector('.rbb-result') || !!document.querySelector('.rb-box'), R, enc: b._enc() }
})
A('结算视图弹出', after.resultShown)
A('APP.lastResult 已写 (outcome=win, wild 数值 id)', after.R && after.R.outcome === 'win' && after.R.wild.petId === WILD.petId, JSON.stringify(after.R && { outcome: after.R.outcome, wild: after.R.wild.petId }))
A('元游戏: 经验已入账 (exp 增长)', after.enc && after.enc.exp > 0, `exp=${after.enc && after.enc.exp}`)
A('元游戏: 图鉴"见过"点亮野怪', after.enc && after.enc.dexCaught === true, `seen=${after.enc && after.enc.dexCaught}`)
A('元游戏: 队首 hp 已写回存档 (>0)', after.enc && after.enc.teamLeadHp > 0, `hp=${after.enc && after.enc.teamLeadHp}`)

// 5) 存档落盘核验 (localStorage 里那一份真被更新)。
const persisted = await page.evaluate(({ SAVE2, wildId }) => {
  const s = JSON.parse(localStorage.getItem(SAVE2) || 'null')
  return s && { exp: s.team[0]?.exp, hp: s.team[0]?.hp, dex: !!s.dex?.[String(wildId)]?.seen, battleCleared: s.battle === null }
}, { SAVE2, wildId: WILD.petId })
A('存档已落盘 (battle 归 null + dex 持久)', persisted && persisted.battleCleared && persisted.dex, JSON.stringify(persisted))

await page.screenshot({ path: shot })
console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== 闭环判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
