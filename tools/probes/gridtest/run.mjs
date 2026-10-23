import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (const renderer of ['canvas', 'wgpu', 'webgl']) {
  const p = await b.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  await p.goto(`http://127.0.0.1:8090/tools/probes/gridtest/gridtest.html?renderer=${renderer}`, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 14000))
  console.log('### renderer=' + renderer)
  console.log((await p.evaluate(() => window.__gt || [])).map(s => '    ' + s).join('\n'))
  const st = await p.evaluate(() => { try { return window.__player.getStatus() } catch (e) { return 'no status: ' + e } })
  console.log('    status=' + st + (errs.length ? '  pageerrors=' + errs.slice(0,2).join(' | ') : ''))
  await p.close()
}
await b.close()
