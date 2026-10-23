// 一次性诊断: Ruffle 各设备字体能否落出中文字形 (只读本地页面, 无外网)
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR', e.message))
page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200)))
page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()) })
await page.goto('http://127.0.0.1:8090/tools/probes/fonttest/fonttest.html', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 4000))
for (let i = 0; i < 6; i++) {
  const out = await page.evaluate(async () => {
    const el = document.querySelector('ruffle-player')
    try {
      const ruffle = await el.ruffle().ready
      if (typeof el.runEmbed !== "function") return "NO-EXPORT r=" + document.getElementById("r").textContent.slice(0,40) + " object=" + typeof el.object
      return JSON.stringify(el.runEmbed())
    } catch (e) { return 'THROW ' + e }
  })
  console.log(out)
  if (!out.startsWith('NO-EXPORT')) break
  await new Promise(r => setTimeout(r, 2000))
}
await browser.close()
