// 同一动作(连续重载)分别跑 老 map.html 与 SPA #/map, 对比 HUD 喂数据失败 的出现率,
// 并数 SPA 新加的两条诊断行 (mapReady 25s 超时 / HUD 暂缓) 验证「超时兜底抢在回调挂载前」这条机理。
import puppeteer from 'puppeteer-core'
const URLS = { old: 'http://127.0.0.1:8090/game/legacy/map.html?map=1', spa: 'http://127.0.0.1:8090/game/index.html#/map' }
const N = Number(process.env.N || 3), GAP = Number(process.env.GAP || 8000)
// ONLY=spa / ONLY=old / ONLY=spa,old —— 先跑谁会影响缓存热度, 结论要靠换序复现
const ORDER = (process.env.ONLY || 'old,spa').split(',').map(s => s.trim()).filter(Boolean)
const br = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
for (const tag of ORDER) {
  const url = URLS[tag]
  const pg = await br.newPage()
  await pg.setViewport({ width: 1260, height: 1000 })
  await pg.goto(url, { waitUntil: 'domcontentloaded' })
  await pg.waitForFunction(() => document.getElementById('hint').textContent.includes('地图就绪'), { timeout: 60000, polling: 500 }).catch(() => console.log(tag + ' RT'))
  const hist = []
  const snap = async label => {
    // #log 只留 40 行 —— 每次挂载后各读一次, 否则上一轮的失败行会被截掉
    const log = await pg.$eval('#log', el => el.textContent)
    const c = re => (log.match(re) || []).length
    hist.push(`${label}:fail${c(/HUD 喂数据失败/g)}/暂缓${c(/HUD 暂缓/g)}/超时${c(/mapReady 25s 未回/g)}/ok${c(/HUD ✓/g)}`)
  }
  await snap('boot')
  for (let i = 0; i < N; i++) {
    await pg.evaluate(() => document.getElementById('reloadBtn').click())
    await new Promise(r => setTimeout(r, GAP))
    await snap('r' + i)
  }
  await new Promise(r => setTimeout(r, GAP + 12000))   // 最后一轮的 25s 超时路径要等它走完
  await snap('tail')
  console.log(tag + ' x' + N + ' gap' + GAP + 'ms  ' + hist.join('  '))
  await pg.close()
}
await br.close()
