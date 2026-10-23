import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (const renderer of ['canvas', 'webgl']) {
  const p = await b.newPage()
  await p.goto(`http://127.0.0.1:8090/game/index.html#/map?renderer=${renderer}`, { waitUntil: 'domcontentloaded' })
  const t0 = Date.now()
  let seen = null
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const log = await p.$eval('#log', e => e.textContent)
    if (/T4|as3grid|栅格/.test(log)) { seen = log.split('\n').slice(0, 4).join(' | '); break }
  }
  console.log(renderer, seen ? `${((Date.now()-t0)/1000).toFixed(0)}s  ${seen}` : 'TIMEOUT 120s')
  await p.close()
}
await b.close()
