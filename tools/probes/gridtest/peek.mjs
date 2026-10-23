import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox','--disable-gpu','--use-gl=swiftshader','--enable-unsafe-swiftshader'] })
const p = await b.newPage()
const con = []
p.on('console', m => con.push(m.type() + ': ' + m.text().slice(0, 300)))
p.on('pageerror', e => con.push('PAGEERROR: ' + String(e).slice(0, 300)))
await p.goto('http://127.0.0.1:8090/game/index.html#/map', { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 14000))
const shadow = await p.evaluate(() => {
  const out = []
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) { const t = el.shadowRoot.textContent || ''; if (t.length < 4000) out.push(t.replace(/\s+/g, ' ').slice(0, 800)) ; walk(el.shadowRoot) }
    }
  }
  walk(document)
  return out
})
console.log('SHADOW:\n' + shadow.join('\n---\n'))
console.log('CONSOLE:\n' + con.filter(s => !/webgl|wgpu|gpu|WebGPU|404/.test(s)).slice(0, 15).join('\n'))
await b.close()
