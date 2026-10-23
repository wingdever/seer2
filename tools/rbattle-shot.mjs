// U1 HUD 截图台: 载入 #/rbattle, 用真内核推 N 回合 (默认 8), 截图留档。
// 用法: node tools/rbattle-shot.mjs [rounds] [out.png]
import puppeteer from 'puppeteer-core'
const rounds = Number(process.argv[2] || 8)
const out = process.argv[3] || '/tmp/rb-hud-play.png'
const url = 'http://127.0.0.1:8091/game/index.html#/rbattle'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
page.on('pageerror', e => console.log('PAGEERROR', e.message))
// U5 起 #/rbattle 流式装载战斗舞台 SWF，改 domcontentloaded + waitForFunction 就绪门 (同 hudtest)。
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction('!!window.__battle', { timeout: 30000 })
const info = await page.evaluate((n) => {
  const b = window.__battle, d = b.driver
  const list = d.availableSkills()
  const dmg = list.find(s => (s.power ?? 0) > 0)
  for (let i = 0; i < n && !d.isOver(); i++) { d.selectSkill(dmg ? dmg.id : null); d.nextRound() }
  b.render()
  return { myHp: [d.myPet().hp, d.myPet().maxHp], opHp: [d.opPet().hp, d.opPet().maxHp], over: d.isOver(), turn: d.turn() }
}, rounds)
console.log(JSON.stringify(info))
await page.screenshot({ path: out })
await browser.close()
console.log('shot ->', out)
