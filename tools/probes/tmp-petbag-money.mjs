import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] })
const p = await b.newPage()
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
console.log('SAVE:', await p.evaluate(() => JSON.stringify({ coins: SAVE.coins, diamonds: SAVE.diamonds })))
const st = () => p.evaluate(() => { try { return M.player.petBagStatus() } catch (e) { return 'err ' + e } })
await p.evaluate(() => togglePetBag())
await new Promise(r => setTimeout(r, 3000))
if ((await st()).indexOf('petBag=none') == 0) { await p.evaluate(() => togglePetBag()); await new Promise(r => setTimeout(r, 3000)) }
if ((await st()).indexOf('可见=true') < 0) { await p.evaluate(() => togglePetBag()); await new Promise(r => setTimeout(r, 3000)) }
console.log('status:', await st())
const box = await (await p.$('#wrap')).boundingBox()
await p.screenshot({ path: '/tmp/petbag-money.png', clip: { x: box.x + 145, y: box.y + 89, width: 910, height: 60 } })
await b.close()
