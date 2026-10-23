import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
await p.setViewport({ width: 1260, height: 1000, deviceScaleFactor: 3 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
const box = await (await p.$('#wrap')).boundingBox()
await p.mouse.click(box.x + 340, box.y + 620)
await new Promise(r => setTimeout(r, 3500))
// 只截网格左下角那几格
await p.screenshot({ path: '/tmp/bag-cell-zoom.png', clip: { x: 555, y: 455, width: 130, height: 110 } })
console.log(await p.evaluate(() => { try { return M.player.bagStatus() } catch (e) { return 'err ' + e } }))
await b.close()
