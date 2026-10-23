import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (const name of process.argv.slice(2)) {
  const p = await b.newPage()
  await p.goto(`http://127.0.0.1:8090/tools/probes/gridtest/gridtest.html?packUrl=${encodeURIComponent('/game/data/actor/' + name + '.bin')}`, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 6000))
  console.log('=== ' + name)
  for (const l of await p.evaluate(() => window.__gt || [])) console.log('   ' + l)
  await p.close()
}
await b.close()
