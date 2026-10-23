import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] })
const p = await b.newPage(); await p.setViewport({ width: 1260, height: 900 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('行走'), { timeout: 40000 })
const opts = await p.$$eval('#mapSel option', os => os.map(o => o.value))
const pick = ['100002', '10007', '10013_1', '1000000']
for (const m of pick) {
  const v = opts.find(o => o.startsWith(m))
  if (!v) { console.log(m, 'NOT-IN-LIST'); continue }
  await p.select('#mapSel', v)
  await p.evaluate(() => document.getElementById('reloadBtn').click())
  await new Promise(r => setTimeout(r, 7000))
  await p.evaluate(() => document.getElementById('walkBtn').click())
  await new Promise(r => setTimeout(r, 3000))
  const hint = await p.$eval('#hint', e => e.textContent)
  const stat = await p.evaluate(() => { document.getElementById('statusBtn').click(); return document.getElementById('stat').textContent })
  console.log('==', v, '\n   ', hint, '\n   ', stat)
}
await b.close()
