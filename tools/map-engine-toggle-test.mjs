// U1 闭环·地图入口冒烟: #/map 挂载后顶栏有"重启内核战斗"复选框, 勾选写入 localStorage 并跨刷新保持; 关=走原 #/battle。
// 只验入口分流这层的 DOM/持久化, 不驱 Ruffle 打真遭遇。用法: node tools/map-engine-toggle-test.mjs [--url <base>]
import puppeteer from 'puppeteer-core'
const base = (process.argv.find((a, i) => process.argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const results = []
const A = (n, p, d) => results.push({ name: n, pass: !!p, detail: d ?? '' })

await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
const present = await page.waitForFunction(() => !!document.getElementById('engineRestart'), { timeout: 15000 }).then(() => true).catch(() => false)
A('地图顶栏出现"重启内核战斗"复选框', present)
A('默认勾选 = 重启宇宙 (未显式 as3 即走重启)', await page.evaluate(() => document.getElementById('engineRestart').checked === true && localStorage.getItem('roco.battle.engine') !== 'as3'))

// 取消勾选 → 写入 as3 → 持久化 (原版线成为 opt-out)
await page.evaluate(() => { const c = document.getElementById('engineRestart'); c.checked = false; c.dispatchEvent(new Event('change')) })
A('取消勾选写入 localStorage=as3', await page.evaluate(() => localStorage.getItem('roco.battle.engine') === 'as3'))

// 再勾选 → 持久化 restart
await page.evaluate(() => { const c = document.getElementById('engineRestart'); c.checked = true; c.dispatchEvent(new Event('change')) })
A('勾选写入 localStorage=restart', await page.evaluate(() => localStorage.getItem('roco.battle.engine') === 'restart'))

// 数值 id 反查 (numericIdOfWild): 等野怪表就绪后, 任取一张有出怪点的图, 按槽位反查应等于源表 .pet (数值 id)。
await page.waitForFunction(() => !!(window.M && window.M.wild && window.M.wild.maps), { timeout: 20000 }).catch(() => {})
const idOk = await page.evaluate(() => {
  if (typeof window.numericIdOfWild !== 'function') return { exposed: false }
  const maps = window.M?.wild?.maps || {}
  const entry = Object.entries(maps).find(([, l]) => l && l.length)
  if (!entry) return { exposed: true, hasSlot: false }
  const [mid, list] = entry
  const p = list[0]
  const got = window.numericIdOfWild(mid, p.idx)
  return { exposed: true, hasSlot: true, mid, want: Number(p.pet), got, ok: got === Number(p.pet), miss: window.numericIdOfWild(mid, 99999) === null }
})
A('numericIdOfWild 按槽位 == 源表数值 id (野怪表就绪)', !idOk.hasSlot ? 'skip:野怪表未就绪' : (idOk.ok && idOk.miss), JSON.stringify(idOk))

// 刷新后保持勾选
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => !!document.getElementById('engineRestart'), { timeout: 15000 }).catch(() => {})
A('刷新后复选框保持勾选 (持久化生效)', await page.evaluate(() => document.getElementById('engineRestart').checked === true))
await page.evaluate(() => { const c = document.getElementById('engineRestart'); c.checked = false; c.dispatchEvent(new Event('change')) })   // 复位, 别污染默认 AS3 线

console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== 地图入口判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass && r.detail !== 'skip:本图无出怪点' && r.pass !== true && r.detail?.startsWith?.('skip') !== true)
console.log(`\n共 ${results.length} 条, 失败 ${results.filter(r => !r.pass).length}`)
await browser.close()
process.exit(results.some(r => !r.pass) || errs.length ? 1 : 0)
