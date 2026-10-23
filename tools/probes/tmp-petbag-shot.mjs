// 精灵背包面板端到端检查: 开面板 → 层清单/状态 → 截图 → 悬停/页签/翻页/关闭。顺带收 4xx 与 console 报错。
//   node tools/probes/tmp-petbag-shot.mjs [--click]   (--click = 走 HUD 真点击而不是 JS 直调)
import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
const bad = []
p.on('requestfailed', r => bad.push(r.url()))
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()) })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
p.on('console', m => { const t = m.text(); if (/error|Error|RustError/.test(t) && !t.includes('favicon')) console.log('CONSOLE', t.slice(0, 200)) })
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
const box = await (await p.$('#wrap')).boundingBox()
const at = (x, y) => [box.x + x, box.y + y]
const clip = (x, y, w, h) => ({ x: box.x + x, y: box.y + y, width: w, height: h })
const wait = ms => new Promise(r => setTimeout(r, ms))
const petState = () => p.evaluate(() => { try { return M.player.petBagStatus() } catch (e) { return 'err ' + e } })

if (process.argv.includes('--click')) { await p.mouse.click(...at(400, 620)); await wait(3000); console.log('HUD 真点击后 status:', await petState()) }
else { await p.evaluate(() => togglePetBag()); await wait(3000) }
if (!process.argv.includes('--click') && (await petState()).indexOf('petBag=none') == 0) { await p.evaluate(() => togglePetBag()); await wait(3000) }
console.log('开面板后 status:', await petState())
await p.screenshot({ path: '/tmp/petbag-open.png', clip: clip(0, 0, 1200, 660) })

// #log 是倒序 (最新在上), 层清单/喂数日志都在前头
console.log('--- log(最新40行) ---\n' + await p.evaluate(() => document.getElementById('log').textContent.split('\n').slice(0, 40).join('\n')))

// runner 自报的"面板内点击点" (精灵背包点击点(面板内): infoTabBtn=x,y ...)
const ptsSrc = await p.evaluate(() => {
  const line = document.getElementById('log').textContent.split('\n').find(l => l.includes('精灵背包点击点'))
  return line || ''
})
const pts = {}
for (const kv of ptsSrc.replace(/.*面板内\):?\s*/, '').trim().split(/\s+/)) {
  const [k, v] = kv.split('=')
  const m2 = /^(-?\d+),(-?\d+)$/.exec(v || '')
  if (m2) pts[k] = [Number(m2[1]), Number(m2[2])]
}
console.log('runner 自报点击点:', JSON.stringify(pts))

const st = await petState()
const m = /面板=(-?\d+),(-?\d+)/.exec(st)
if (m && Object.keys(pts).length) {
  const px = Number(m[1]), py = Number(m[2])
  const clickPt = async nm => { await p.mouse.click(...at(px + pts[nm][0], py + pts[nm][1])); await wait(400); return p.evaluate(() => document.getElementById('log').textContent.split('\n')[0]) }
  await p.mouse.move(...at(px + pts.bag0[0], py + pts.bag0[1]))
  await wait(700)
  const tip = await p.evaluate(() => { const t = document.getElementById('bagtip'); return { disp: getComputedStyle(t).display, txt: t.textContent } })
  console.log('悬停 bag0 说明气泡:', JSON.stringify(tip))
  await p.screenshot({ path: '/tmp/petbag-tip.png', clip: clip(Math.max(0, px), Math.max(0, py), 1000, 560) })
  console.log('点击 bag0 →', await clickPt('bag0'))
  for (const nm of ['infoTabBtn', 'magicTabBtn', 'abilityTabBtn', 'skillTabBtn', 'itemTabBtn'])
    if (pts[nm]) console.log(`页签 ${nm} →`, await clickPt(nm))
  if (pts.pageDown) { await clickPt('pageDown'); console.log('翻页后 status:', await petState()) }
  await p.screenshot({ path: '/tmp/petbag-page2.png', clip: clip(Math.max(0, px), Math.max(0, py), 1000, 560) })
  if (pts.closeBtn) { await clickPt('closeBtn'); console.log('关面板后 status:', await petState()) }
}
await b.close()
console.log('4xx/失败:', bad.length ? [...new Set(bad)].join('\n  ') : '无')
