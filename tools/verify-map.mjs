// 地图交互验证: 无头 Chromium + Ruffle 打开 SPA 的 #/map 场景,
// 等 mapReady → 调用 walkTo → 采样角色坐标/镜头位移 → 截图 → 沿 teleport 出口跳图。
// 环境变量: MAP=地图id  ACTOR=BLUE/RED  TP=出口目标id  TPCHAIN=a,b,c 连跳多图  BASE=站点根
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://127.0.0.1:8090'
const MAP = process.env.MAP || ''
const ACTOR = process.env.ACTOR || ''
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1260, height: 1000 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)) })
page.on('response', r => { if (r.status() === 404) errs.push('404 ' + r.url()) })

await page.goto(`${BASE}/game/index.html#/map`, { waitUntil: 'domcontentloaded' })
// polling:'raf' 会被 Ruffle 的渲染循环饿死, 这里用定时轮询; 地图名出现在提示里 = 该图已完成载入
const waitReady = () => page.waitForFunction(() => {
  const s = document.getElementById('mapSel').value
  return typeof nameOf === 'function' && document.getElementById('hint').textContent.includes(nameOf(s) + ' · 地图就绪')
}, { timeout: 40000, polling: 500 })
try {
  await waitReady()   // polling:'raf' 会被 Ruffle 的渲染循环饿死, 这里用定时轮询
  if (MAP || ACTOR) {
    await page.evaluate((map, actor) => {
      if (actor) document.getElementById('avSel').value = actor
      if (map) { const s = document.getElementById('mapSel'); if ([...s.options].some(o => o.value === map)) s.value = map }
      document.getElementById('reloadBtn').click()
    }, MAP, ACTOR)
    await waitReady()
  }
} catch (e) {
  console.log('READY-TIMEOUT')
}
console.log('READY ' + (await page.$eval('#hint', el => el.textContent)))
console.log('LOG\n' + (await page.$eval('#log', el => el.textContent)))
await page.screenshot({ path: '/tmp/map-0.png' })

const stat = async () => page.evaluate(() => document.getElementById('statusBtn').click() || document.getElementById('stat').textContent)
console.log('AFTER-LOAD ' + await stat())

// 走 3 段: 左下 → 右上 → 左上 (跨镜头边界)
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => document.getElementById('walkBtn').click())
  await new Promise(r => setTimeout(r, 2600))
  console.log(`WALK-${i} ` + await stat())
  await page.screenshot({ path: `/tmp/map-w${i}.png` })
}
console.log('SPOTS ' + JSON.stringify(await page.evaluate(() => M.spots)))
console.log('MAPINFO ' + JSON.stringify(await page.evaluate(() => ({ id: M.map && M.map.id, name: M.map && M.map.name, url: M.mapUrl }))))

// 传送: 点击 teleport 的坐标 → 寻路抵达 → 自动切到目标图
// TP=<目标图id> 指定走哪个出口; TPCHAIN=a,b,c 依次连跳多图 (验证世界图可通行)
const WANT = process.env.TP || ''
const chain = (process.env.TPCHAIN || '').split(',').map(s => s.trim()).filter(Boolean)
const hops = chain.length ? chain : [WANT]
for (const [i, want] of hops.entries()) {
  const tp = await page.evaluate(w => {
    const s = M.spots.find(x => !w || x.target === w)
    if (!s) return null
    const from = { id: M.map && M.map.id, name: M.map && M.map.name }
    M.player.walkTo(s.x, s.y)
    return { spot: { x: s.x, y: s.y, target: s.target, label: s.label }, from }
  }, want)
  if (!tp) { console.log(`HOP-${i} 当前图无出口「${want || '?'}」 spots=` + JSON.stringify(await page.evaluate(() => M.spots.map(s => s.target)))); break }
  try {
    await page.waitForFunction((t, lg) => (M.map && M.map.id === t) || document.getElementById('log').textContent.includes(lg),
      { timeout: 30000, polling: 400 }, tp.spot.target, '场景资源缺失')
  } catch { console.log(`HOP-${i} TELEPORT-TIMEOUT`) }
  await new Promise(r => setTimeout(r, 1200))
  console.log(`HOP-${i} ${tp.from.id}(${tp.from.name}) → ${tp.spot.target} ` +
    JSON.stringify(await page.evaluate(() => ({ id: M.map && M.map.id, name: M.map && M.map.name, url: M.mapUrl, spots: M.spots.length, hist: M.hist }))) +
    ' ' + await stat())
  await page.screenshot({ path: `/tmp/map-tp${i}.png` })
}
if (hops.length) {
  // 单向图 (如冰室无出口) 用返回栈兜底
  await page.evaluate(() => { if (!document.getElementById('backBtn').disabled) document.getElementById('backBtn').click() })
  try {
    await page.waitForFunction(() => M.spots.length > 0 || M.hist.length === 0, { timeout: 20000, polling: 400 })
  } catch { console.log('BACK-TIMEOUT') }
  console.log('BACK ' + JSON.stringify(await page.evaluate(() => ({ id: M.map && M.map.id, name: M.map && M.map.name, hist: M.hist, spots: M.spots.length }))))
}
console.log('LOG-FINAL\n' + (await page.$eval('#log', el => el.textContent)))
await browser.close()
console.log('ERRORS\n' + errs.filter(s => !/webgl|wgpu|gpu|WebGPU/i.test(s)).slice(0, 25).join('\n'))
