// U1 rbattle 场景 STEP0/1 回归: 载入 #/rbattle?selftest=1, 等 window.__rbattle.ready, 打印判据 + 页面错误。
// 用法:  node tools/rbattle-selftest.mjs [--url http://127.0.0.1:8091/game/index.html#/rbattle?selftest=1]
// 只读浏览器这份模块实例, 不碰 game/core/**, 与差分 oracle 进程隔离 —— 见计划 rough-meadow-swallow.md。
import puppeteer from 'puppeteer-core'

const url = (process.argv.find((a, i) => process.argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html#/rbattle?selftest=1')

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

await page.goto(url, { waitUntil: 'networkidle2' })
const ok = await page.waitForFunction('window.__rbattle && window.__rbattle.ready === true', { timeout: 30000 }).then(() => true).catch(() => false)

const snap = await page.evaluate(() => {
  const r = window.__rbattle
  if (!r) return { missing: true }
  const clean = (t) => t ? t.trace.map(a => ({ pass: a.pass, name: a.name, detail: a.detail })) : null
  return { ready: r.ready, error: r.error, noop: clean(r.noop), damage: clean(r.damage), log: document.getElementById('log')?.textContent || '' }
})

console.log('=== 页面/控制台错误 ===')
console.log(errs.length ? errs.join('\n') : '(无)')
console.log('\n=== __rbattle ===')
console.log(JSON.stringify(snap, null, 1))

const flat = [...(snap.noop || []), ...(snap.damage || [])]
const fails = flat.filter(a => !a.pass)
console.log('\n=== 判据汇总 ===')
console.log(`共 ${flat.length} 条, 通过 ${flat.length - fails.length}, 失败 ${fails.length}`)
for (const f of fails) console.log(`  ✗ ${f.name}${f.detail ? ' [' + f.detail + ']' : ''}`)
console.log(snap.error ? `\n挂载抛出: ${snap.error}` : '')
await browser.close()
process.exit(fails.length || errs.length || snap.missing ? 1 : 0)
