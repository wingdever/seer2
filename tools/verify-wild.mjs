// 野怪链路验收: 地图上有怪 → 点怪 → 角色跑过去 → 路由切到 #/battle 打这只怪
//   node tools/verify-wild.mjs           默认图 2
//   MAP=100 node tools/verify-wild.mjs   指定图 (须 wild.json 里有该图)
import puppeteer from 'puppeteer-core'

const MAP = process.env.MAP || '2'
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()) })

await page.goto(`http://127.0.0.1:8090/game/index.html#/map?map=${MAP}&renderer=canvas`, { waitUntil: 'domcontentloaded' })
try {
  await page.waitForFunction(() => (document.getElementById('hint').textContent || '').includes('地图就绪'),
    { timeout: 45000, polling: 400 })
} catch { console.log('READY-TIMEOUT ' + (await page.$eval('#hint', el => el.textContent))) }

const HINT = await page.$eval('#hint', el => el.textContent)
console.log('HINT ' + HINT)
console.log('LOG  ' + (await page.$eval('#log', el => el.textContent)).split('\n').slice(0, 6).join(' | '))

// 野怪实时位置 (MapRunner.petPositions) → 舞台屏幕坐标 = 相机偏移 + 世界坐标
const pets = await page.evaluate(() => (M.player?.petPositions?.() || []).map(s => {
  const f = s.split('|')
  return { idx: f[0] | 0, x: f[1] | 0, y: f[2] | 0, level: f[3] | 0, name: f[4], sx: M.cam.x + (f[1] | 0), sy: M.cam.y + (f[2] | 0) }
}))
console.log('PETS ' + JSON.stringify(pets))
await page.screenshot({ path: '/tmp/wild-map.png' })
if (!pets.length) { console.log('图上没有野怪, 终止'); await browser.close(); process.exit(1) }

const wrap = await page.$('#wrap')
const box = await wrap.boundingBox()
// 野怪会闲走: 截图之后再读一次坐标, 立刻点 (读→点之间只隔一次 CDP 往返)
await page.mouse.click(box.x + 600, box.y + 620)          // 地面标定点: 应出现「地面点击」日志
await new Promise(r => setTimeout(r, 500))
const fresh = await page.evaluate(() => (M.player?.petPositions?.() || []).map(s => {
  const f = s.split('|')
  return { idx: f[0] | 0, x: f[1] | 0, y: f[2] | 0, level: f[3] | 0, name: f[4], sx: M.cam.x + (f[1] | 0), sy: M.cam.y + (f[2] | 0) }
}))
const cx = box.width / 2, cy = box.height / 2
const target = fresh.filter(p => p.sx > 20 && p.sx < box.width - 20 && p.sy > 20 && p.sy < box.height - 20)
  .sort((a, b) => Math.hypot(a.sx - cx, a.sy - cy) - Math.hypot(b.sx - cx, b.sy - cy))[0] || fresh[0]
console.log(`CLICK 槽位${target.idx} ${target.name} Lv${target.level} 世界(${target.x},${target.y}) → 页面(${Math.round(box.x + target.sx)},${Math.round(box.y + target.sy - 18)})`)
await page.mouse.click(box.x + target.sx, box.y + target.sy - 18)
await new Promise(r => setTimeout(r, 900))
console.log('AFTER-CLICK-LOG ' + (await page.$eval('#log', el => el.textContent)).split('\n').slice(0, 4).join(' | '))
await page.screenshot({ path: '/tmp/wild-click.png' })

try {
  await page.waitForFunction(() => location.hash.startsWith('#/battle'), { timeout: 40000, polling: 400 })
} catch { console.log('NO-NAVIGATE ' + (await page.$eval('#log', el => el.textContent)).split('\n').slice(0, 6).join(' | ')); await browser.close(); process.exit(1) }
console.log('NAVIGATED ' + page.url())
try {
  await page.waitForFunction(() => (document.getElementById('hint').textContent || '').includes('野外遭遇'),
    { timeout: 60000, polling: 500 })
} catch { console.log('BATTLE-TIMEOUT ' + (await page.$eval('#hint', el => el.textContent))) }
await new Promise(r => setTimeout(r, 1500))
console.log('BATTLE-HINT ' + (await page.$eval('#hint', el => el.textContent)))
console.log('BATTLE-LOG ' + (await page.$eval('#log', el => el.textContent)).split('\n').slice(0, 8).join(' | '))
console.log('SIDES ' + JSON.stringify(await page.evaluate(() => { const c = window.battleApp.battle.cfg; return { left: c.left?.name + '/' + c.left?.level, right: c.right?.name + '/' + c.right?.level } })))
await page.screenshot({ path: '/tmp/wild-battle.png' })

// 返程: 战斗场景的「↩ 返回地图」应带回原图, 且野怪组成与去时一致
const back = await page.$('a[href^="#/map"]')
if (!back) console.log('NO-BACK-LINK')
else {
  await back.click()
  await page.waitForFunction(() => location.hash.startsWith('#/map'), { timeout: 30000, polling: 400 })
  try {
    await page.waitForFunction(() => (document.getElementById('hint').textContent || '').includes('地图就绪'),
      { timeout: 45000, polling: 400 })
  } catch { console.log('BACK-READY-TIMEOUT ' + (await page.$eval('#hint', el => el.textContent))) }
  console.log('BACK-URL ' + page.url())
  console.log('BACK-HINT ' + (await page.$eval('#hint', el => el.textContent)))
  await page.screenshot({ path: '/tmp/wild-back.png' })
}
console.log('ERRORS ' + errs.filter(s => !/webgl|wgpu|gpu|WebGPU|Failed to load resource/i.test(s)).slice(0, 15).join('\n'))
await browser.close()
