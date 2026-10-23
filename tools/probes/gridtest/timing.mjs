import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (let trial = 0; trial < 3; trial++) {
  const p = await b.newPage(); await p.setViewport({ width: 1260, height: 1000 })
  const t0 = Date.now()
  await p.goto('http://127.0.0.1:8090/game/index.html#/map', { waitUntil: 'domcontentloaded' })
  let done = -1
  for (let i = 0; i < 75; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const log = await p.$eval('#log', e => e.textContent).catch(() => '')
    if (/mapReady|地图就绪|栅格/.test(log)) { done = Date.now() - t0; break }
  }
  console.log(`trial${trial}: ${done < 0 ? '>75s 未完成' : (done / 1000).toFixed(1) + 's 就绪'}`)
  await p.close()
}
await b.close()
