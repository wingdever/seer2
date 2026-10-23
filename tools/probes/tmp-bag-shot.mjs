// 背包面板端到端检查: 点底栏"背包" → 面板开 → 悬停格子出说明 → 切页签 → 关。顺带收 4xx。
//   node tools/probes/tmp-bag-shot.mjs
import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
const bad = []
p.on('requestfailed', r => bad.push(r.url()))
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()) })
p.on('pageerror', e => console.log('PAGEERROR', e.message))
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
const box = await (await p.$('#wrap')).boundingBox()
const at = (x, y) => [box.x + x, box.y + y]
const clip = (x, y, w, h) => ({ x: box.x + x, y: box.y + y, width: w, height: h })
const wait = ms => new Promise(r => setTimeout(r, ms))

const bagState = () => p.evaluate(() => { try { return M.player.bagStatus() } catch (e) { return 'err ' + e } })
await p.mouse.click(...at(340, 620))                  // 底栏 背包 (原版 actorBag)
await wait(3000)
// HUD 是异步绑定的, 偶尔第一下点空 —— 没开就再点一次
if ((await bagState()).indexOf('bag=none') == 0) { await p.mouse.click(...at(340, 620)); await wait(3000) }
await p.screenshot({ path: '/tmp/bag-open.png', clip: clip(0, 0, 1200, 660) })
console.log('开面板后 status:', await bagState())

// 面板居中 (203,67); 格子0 在面板内 (360,106) → 舞台中心约 (596,206)
await p.mouse.move(...at(596, 206))
await wait(700)
const tip = await p.evaluate(() => { const t = document.getElementById('bagtip'); return { disp: getComputedStyle(t).display, txt: t.textContent } })
console.log('说明气泡:', JSON.stringify(tip))
await p.screenshot({ path: '/tmp/bag-tip.png', clip: clip(180, 40, 840, 580) })

// 六个页签挨个点。坐标 = 面板原点(203,67) + TAB_X/TAB_Y(330,53) + 各页签**美术包围盒**中心
// (ItemBagRunner 的 "页签层" debug: 实例 x/y 是注册点, 真正的绘制在负偏移上, 例如 equip 盒 -37,-50)
for (const [nm, sx, sy] of [['equip', 563, 133], ['petRelate', 630, 140], ['collection', 700, 141], ['vip', 768, 141], ['element', 837, 141], ['petSpirtTrain', 908, 142]]) {
  await p.mouse.click(...at(sx, sy))
  await wait(500)
  console.log(`页签 ${nm} →`, await p.evaluate(() => document.getElementById('log').textContent.split('\n')[0]))
}
await p.mouse.click(...at(959, 101))                  // closeBtn (面板内 745.7+10, 24+10)
await wait(500)
console.log('关面板后 status:', await p.evaluate(() => { try { return M.player.bagStatus() } catch (e) { return 'err ' + e } }))
console.log('--- log ---\n' + await p.evaluate(() => document.getElementById('log').textContent.split('\n').slice(0, 14).join('\n')))
await b.close()
console.log('4xx/失败:', bad.length ? [...new Set(bad)].join('\n  ') : '无')
