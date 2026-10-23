// HUD 局部放大: 检查地图名/角色面板/精灵背包格的字形墨迹, 并抓出 404 的 URL
//   node tools/probes/tmp-hud-crop.mjs
import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
const bad = []
p.on('requestfailed', r => bad.push(r.url()))
p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()) })
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
const box = await (await p.$('#wrap')).boundingBox()
const clip = (x, y, w, h) => ({ x: box.x + x, y: box.y + y, width: w, height: h })
const at = (x, y) => [box.x + x, box.y + y]
// 悬停展开按钮 → 背包列表 (原版 PetAvatarPanel.onPetListShow): 面板 (169,100) + petListSp (180,31)
// + showPetBtn (-248,2) → 舞台 (101,133)
await p.mouse.move(...at(101, 133))
await new Promise(r => setTimeout(r, 400))
await p.mouse.move(...at(104, 136))
await new Promise(r => setTimeout(r, 1600))
await p.screenshot({ path: '/tmp/hud-petbag.png', clip: clip(0, 90, 320, 420) })
await p.screenshot({ path: '/tmp/hud-title.png', clip: clip(430, 590, 340, 70) })
await p.screenshot({ path: '/tmp/hud-actor.png', clip: clip(0, 0, 320, 90) })
await p.mouse.move(...at(600, 300))                    // 移开 → 收起
await new Promise(r => setTimeout(r, 600))
await p.screenshot({ path: '/tmp/hud-full.png', clip: clip(0, 0, 1200, 660) })
// 点几个底栏按钮 + 活动栏收起箭头, 看 hudClick 上报
for (const [nm, x, y] of [['背包', 340, 620], ['图鉴', 490, 620], ['精灵', 420, 620], ['活动收起', 802, 40]]) {
  await p.mouse.click(...at(x, y))
  await new Promise(r => setTimeout(r, 350))
  console.log(`点 ${nm} (${x},${y}) →`, await p.evaluate(() => document.getElementById('log').textContent.split('\n')[0]))
}
await p.screenshot({ path: '/tmp/hud-minor.png', clip: clip(600, 0, 600, 120) })
const texts = await p.evaluate(() => ({
  t: M.hudTexts,
  s: (() => { try { return M.player.hudStatus() } catch (e) { return 'err ' + e } })(),
  log: document.getElementById('log').textContent.split('\n').slice(0, 12),
}))
await b.close()
console.log('status:', texts.s)
console.log('hudTexts:', JSON.stringify(texts.t))
console.log('--- log ---\n' + texts.log.join('\n'))
console.log('404/失败:', bad.length ? [...new Set(bad)].join('\n  ') : '无')
