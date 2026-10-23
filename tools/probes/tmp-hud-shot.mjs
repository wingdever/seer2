// HUD 挂载验证: 读 hudBind/hudTexts, 截图主界面, 检查中文字形有没有墨迹
//   node tools/probes/tmp-hud-shot.mjs [地图id]
import puppeteer from 'puppeteer-core'
const id = process.argv[2] || ''
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
p.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 300)))
p.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 400)))
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
try {
  await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 60000 })
} catch (e) {
  const dump = await p.evaluate(() => ({ hint: document.getElementById('hint').textContent, log: document.getElementById('log').textContent.split('\n').slice(0, 25) }))
  console.log('超时未就绪\nhint:', dump.hint, '\n--- log ---\n' + dump.log.join('\n'))
  throw e
}
if (id) {
  await p.evaluate((v) => { document.getElementById('mapSel').value = v; loadMapRunner() }, id)
  await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 60000 })
}
await new Promise(r => setTimeout(r, 2500))
const info = await p.evaluate(() => ({
  log: document.getElementById('log').textContent.split('\n').slice(0, 14),
  hint: document.getElementById('hint').textContent,
  texts: (typeof M !== 'undefined' && M.hudTexts) || null,
  save: typeof SAVE !== 'undefined' ? { name: SAVE.name, bag: SAVE.bag } : null,
  status: (() => { try { return M.player?.hudStatus?.() } catch (e) { return 'err ' + e } })(),
}))
console.log('hint:', info.hint)
console.log('save:', JSON.stringify(info.save))
console.log('status:', info.status)
console.log('hudTexts:', JSON.stringify(info.texts, null, 1))
console.log('--- log ---\n' + info.log.join('\n'))
const el = await p.$('#wrap')
await el.screenshot({ path: '/tmp/hud-map.png' })
await b.close()
console.log('截图 /tmp/hud-map.png')
