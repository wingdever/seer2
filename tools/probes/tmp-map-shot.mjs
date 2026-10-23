import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] })
const p = await b.newPage(); await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 40000 })
await p.evaluate(() => document.getElementById('gridBtn')?.click())
await new Promise(r => setTimeout(r, 900))
await p.screenshot({ path: '/tmp/map-grid.png' })
await b.close()
