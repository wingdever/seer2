// 一次性诊断: Ruffle 能不能按导出类名实例化 UI.swf 里的符号 (原版 UIManager 的取法)
//   node tools/uitest.mjs      需要 8090 上的静态服务
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) console.log('CONSOLE', m.text()) })
await page.goto('http://127.0.0.1:8090/tools/uitest/uitest.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 6000))
const out = await page.evaluate(async () => {
  const el = document.querySelector('ruffle-player')
  await el.ruffle().ready
  const st = el.state()
  if (!st.includes('loaded')) return { state: st }
  return { state: st, probe: el.probe() }
})
console.log(JSON.stringify(out, null, 1))
await page.screenshot({ path: '/tmp/uitest.png' })
await browser.close()
