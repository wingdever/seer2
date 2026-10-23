import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader'] })
const p = await b.newPage()
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
// #log 只留 40 行 (map.html:58), 73 层的清单会被截掉 —— 先劫持 logLine 全量落数组
await p.evaluate(() => { window.__all = []; const o = logLine; window.__origLogLine = o; logLine = s => { window.__all.push(s); o(s) } })
const st = () => p.evaluate(() => { try { return M.player.petBagStatus() } catch (e) { return 'err ' + e } })
await p.evaluate(() => togglePetBag())
await new Promise(r => setTimeout(r, 3000))
// HUD 异步绑定, 第一下常点空 —— 和 tmp-petbag-shot.mjs 一样补一次
if ((await st()).indexOf('petBag=none') == 0) { await p.evaluate(() => togglePetBag()); await new Promise(r => setTimeout(r, 3000)) }
await new Promise(r => setTimeout(r, 2000))
console.log('petBagStatus:', await st())
console.log('log 总行数:', await p.evaluate(() => document.getElementById('log').textContent.split('\n').length))
const census = await p.evaluate(() => window.__all.filter(l => /层\d+ /.test(l)).join('\n'))
const tabUI = await p.evaluate(() => window.__all.filter(l => /页签层/.test(l)).join('\n'))
fs.writeFileSync('/tmp/petbag-tabui.txt', tabUI)
console.log('TabUI 子清单:\n' + tabUI)
const evs = await p.evaluate(() => window.__all.filter(l => /页签切换|悬停|翻页|缺页签|点击/.test(l)).join('\n'))
console.log('事件回显:\n' + (evs || '无'))
const ptsline = await p.evaluate(() => window.__all.find(l => l.indexOf('点击点(面板内)') >= 0) || '')
console.log(ptsline)
// 交互探针: 按面板原点 + 自报点依次点页签/翻页/关闭
const M = await p.evaluate(() => { const s = M.player.petBagStatus(); const m = s.match(/面板=(\d+),(\d+)/); return m ? { x: +m[1], y: +m[2] } : null })
const box = await (await p.$('#wrap')).boundingBox()
const wait = ms => new Promise(r => setTimeout(r, ms))
const pts2 = {}
for (const m of ptsline.matchAll(/(\w+)=(\d+),(\d+)/g)) pts2[m[1]] = [+m[2], +m[3]]
for (const nm of ['infoTabBtn', 'magicTabBtn', 'abilityTabBtn', 'skillTabBtn', 'itemTabBtn', 'pageDown', 'closeBtn']) {
  const xy = pts2[nm]
  if (!xy) { console.log(nm, '→ 没自报坐标'); continue }
  await p.mouse.click(box.x + M.x + xy[0], box.y + M.y + xy[1])
  await wait(500)
  console.log(nm, '→', await p.evaluate(() => window.__all.filter(l => l.indexOf('页签切换') >= 0 || l.indexOf('翻页') >= 0).slice(-1)[0] || '-'))
}
console.log('最终 status:', await st())
fs.writeFileSync('/tmp/petbag-census.txt', census)
await b.close()
