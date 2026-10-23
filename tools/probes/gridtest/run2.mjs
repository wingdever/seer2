import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
for (const onStage of ['0','1']) {
  const p = await b.newPage()
  await p.goto(`http://127.0.0.1:8090/tools/probes/gridtest/gridtest.html?renderer=canvas&onStage=${onStage}`, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 10000))
  console.log('### onStage=' + onStage + ' → ' + JSON.stringify(await p.evaluate(() => window.__gt || [])))
  await p.close()
}
await b.close()
