// 跑 bagProbe: 载入注入后的背包 SWF, 收几何报告
import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
await page.goto('http://127.0.0.1:8090/tools/probes/bagtest/bagtest.html?renderer=' + (process.argv[2] || 'canvas'), { waitUntil: 'networkidle2' })
const got = await page.waitForFunction(() => (window.__bag || []).some(l => l === 'done' || l === 'IO_ERROR' || /根不是/.test(l)), { timeout: 30000 }).catch(() => null)
console.log(await page.evaluate(() => (window.__bag || []).join('\n')) || '(空)')
console.log(got ? 'OK' : 'TIMEOUT')
await browser.close()
