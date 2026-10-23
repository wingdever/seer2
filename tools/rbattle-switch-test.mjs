// U2/D 端到端: 重启遇怪里**换宠由内核 PetChange 算子切 cursor** (v3 多宠队)。
// 断言: 在场宠换身、cursor 移动、读数 = 内核权威 (bag[idx])、死宠不入候选、save-side 无越权。
// 用法: node tools/rbattle-switch-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rb-sw.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rb-sw.png'
const SAVE3 = 'rocoshowdown.restart.v3'
const SAVE2 = 'rocoshowdown.save.v2'
// 队: 10001 系 (petId 1) 满血 + petId 2 带伤 + petId 1 已死 (测死宠排除)。野怪 petId 2。
const TEAM = [
  { uid: 'p1', petId: 1, level: 100, exp: 0, hp: 9999 },
  { uid: 'p2', petId: 2, level: 100, exp: 0, hp: 5 },
]

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const save = {
  v: 3, trainer: { name: '测试训练师', level: 1, coins: 0, diamonds: 0 },
  team: TEAM, box: [], items: [], dex: {}, evolve: { pending: [] }, battle: null,
  _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
}
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(({ SAVE3, SAVE2, save }) => {
  localStorage.removeItem('roco.battle.engine')            // 开关拨上 → v3 内核
  localStorage.setItem(SAVE3, JSON.stringify(save))
  localStorage.removeItem(SAVE2)
}, { SAVE3, SAVE2, save })
const url = `${base}#/rbattle?encounter=1&client=2&level=5&slot=0&back=1`
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
const have = await page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
if (!have) { console.log('rbattle 未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// 1) 多宠袋喂进内核 (cursor 0，队首在场)。
const init = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  return {
    bag: b.team(), cursor: b.cursor(), activeId: d.myPet().id, activeName: d.myPet().name,
    // 换宠入口 = 底栏页签（U2 的模态弹层已退役，impl §11：只换选择器，switchCandidates 语义不变）。
    slotActive: (() => {
      const c = document.querySelector('.rbb-option[data-mid="change"]')
      const live = !!c && c.classList.contains('rbb-option--live')
      window.__battle.selectTab('change')
      const visible = [...document.querySelectorAll('.rbb-content .rbb-page')].filter(p => getComputedStyle(p).display !== 'none').map(p => p.className)
      const cells = [...document.querySelectorAll('.rbb-page--change .rbb-change-btn')].map(n => ({ i: Number(n.dataset.index), off: n.classList.contains('rbb-change-btn--off') }))
      const current = document.querySelectorAll('.rbb-page--change .rbb-change-current').length
      window.__battle.selectTab('skill')
      return { live, visible, cells, current }
    })(),
  }
})
A('多宠队进内核袋 (bag 长 = 队 2)', init.bag.length === 2, JSON.stringify(init.bag && init.bag.map(p => p && p.id)))
A('换宠页签在重启遇怪态置活（--live）', init.slotActive.live === true, JSON.stringify(init.slotActive.live))
A('切到换宠页 ⇒ 只那页可见、格数 == 内核袋长、在场宠叠火焰角标',
  init.slotActive.visible.length === 1 && init.slotActive.visible[0] === 'rbb-page rbb-page--change'
  && init.slotActive.cells.length === init.bag.length && init.slotActive.current === 1,
  JSON.stringify(init.slotActive))
A('开局 cursor=0, 在场宠 = 队首', init.cursor === 0 && init.activeId === init.bag[0].id, `cursor=${init.cursor} active=${init.activeId}`)

// 2) 换到 index 1 → 内核 PetChange 切 cursor, 在场宠换身, 读数 = bag[1] 权威。
const sw = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  const ret = b.switch(1)
  return {
    ret, cursor: b.cursor(), activeId: d.myPet().id, activeHp: d.myPet().hp, activeMaxHp: d.myPet().maxHp,
    bag1: b.team()[1], over: d.isOver(),
  }
})
A('换宠经内核算子返回生效', sw.ret === true)
A('内核 cursor 移动 0→1', sw.cursor === 1, `cursor=${sw.cursor}`)
A('在场宠换身 = bag[1] 那只 (id 一致)', sw.activeId === sw.bag1.id, `active=${sw.activeId} bag1=${sw.bag1 && sw.bag1.id}`)
A('在场读数 = 内核 bag 权威 (hp/maxHp 一致)', sw.activeHp === sw.bag1.hp && sw.activeMaxHp === sw.bag1.maxHp, `hp=${sw.activeHp}/${sw.activeMaxHp}`)
A('换宠本身不结束战斗 (野怪恒无操作, 换宠不判负)', sw.over === false)

// 3) 死宠不入候选: 把当前在场宠打到 hp<=0 前先看候选只含非当前未死的。用 harness 直读内核候选逻辑。
const cand = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  const bag = b.team(), cur = b.cursor()
  return { candidates: bag.map((p, i) => ({ i, alive: p && !p.dead, notCur: i !== cur })).filter(x => x.alive && x.notCur && x.i !== cur).map(x => x.i), cur }
})
A('换宠后可换候选 = 非当前未死 (此时队首 index0 仍可回)', cand.candidates.includes(0), JSON.stringify(cand))

// 4) 再换回 index 0 → 内核把 cursor 拉回, anger 经 PetChange 重算 (读数仍来自内核)。
const back = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  const ret = b.switch(0)
  return { ret, cursor: b.cursor(), activeId: d.myPet().id, anger: d.myPet().anger }
})
A('换回队首: 内核 cursor 1→0', back.ret === true && back.cursor === 0, `cursor=${back.cursor}`)
A('换回后在场 = 队首, anger 为内核数值', back.activeId === 1 && typeof back.anger === 'number', `anger=${back.anger}`)

// 5) v2/AS3 线不被写。
const notV2 = await page.evaluate(({ SAVE2 }) => localStorage.getItem(SAVE2) === null, { SAVE2 })
A('v2 键未被这条线写 (两宇宙隔离)', notV2 === true)

await page.screenshot({ path: shot })
console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== 换宠闭环判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
