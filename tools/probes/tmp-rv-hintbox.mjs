// 一次性探针: 验 UI 线 U0 的 Hintbox 样板（弹出 / 几何 / 素材 / 关闭 / 内核数据），并留截图。
//   node tools/probes/tmp-rv-hintbox.mjs     需要 8090 上的静态服务
import puppeteer from 'puppeteer-core'

const SHOT = (n) => `/tmp/rv-hintbox-${n}.png`
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1400, height: 1000 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })
await page.goto('http://127.0.0.1:8090/game/index.html', { waitUntil: 'domcontentloaded' })

const shot = async (n) => { await page.screenshot({ path: SHOT(n) }); return SHOT(n) }

// ---- 1. 弹出（Two Options）----
await page.waitForSelector('#rvDemo')
await page.click('#rvDemo')
await page.waitForSelector('.rv-panel', { timeout: 8000 })
await new Promise(r => setTimeout(r, 600))

const readPanel = () => page.evaluate(() => {
  const wrap = document.getElementById('wrap').getBoundingClientRect()
  const q = (s) => document.querySelector(s)
  const g = (s) => { const el = q(s); if (!el) return null; const r = el.getBoundingClientRect()
    return { x: +(r.left - wrap.left).toFixed(2), y: +(r.top - wrap.top).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }
  const bg = (s) => { const el = q(s); return el ? getComputedStyle(el).backgroundImage.replace(/^url\(".*\//, '').replace(/"\)$/, '') : null }
  return {
    panels: document.querySelectorAll('.rv-panel').length,
    scale: q('.rv-scale')?.style.transform,
    box: g('.rb-box'), scrim: g('.rb-scrim'),
    bottomDecorate: g('.rb-bottom-decorate'), cornerDecorate: g('.rb-corner-decorate'),
    title: { text: q('.rb-title')?.textContent, ...g('.rb-title'), color: getComputedStyle(q('.rb-title')).color },
    content: { text: q('.rb-content')?.textContent, ...g('.rb-content'), size: getComputedStyle(q('.rb-content')).fontSize },
    options: g('.rb-options'),
    btns: [...document.querySelectorAll('.rb-btn')].map(b => ({ cls: b.className, ...g('.' + b.classList[1]), img: bg('.' + b.classList[1]) })),
    imgsLoaded: [...document.querySelectorAll('.rv-panel *')].map(e => getComputedStyle(e).backgroundImage)
      .filter(s => s && s !== 'none').map(s => s.slice(5, -2)),
  }
})
const p1 = await readPanel()
// 素材是否真取到了（浏览器里能否解出图）
const spriteOk = await page.evaluate(async (urls) => {
  const out = {}
  for (const u of urls) out[u] = await new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('FAIL'); i.src = u })
  return out
}, p1.imgsLoaded)
console.log('== 1. Two Options ==')
console.log(JSON.stringify({ ...p1, imgsLoaded: undefined }, null, 1))
console.log('sprite:', JSON.stringify(spriteOk))
console.log('shot:', await shot(1))
// 像素证据: 面板真画出来了（盒体黑 / Outline 白 / 文字青），不是空盒子
const px = await page.evaluate(() => {
  const r = document.getElementById('wrap').getBoundingClientRect()
  return { left: r.left, top: r.top }
})
const { PNG } = await import('pngjs')
const png = PNG.sync.read((await import('node:fs')).readFileSync(SHOT(1)))
const at = (x, y) => { const i = (Math.round(y) * png.width + Math.round(x)) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]] }
const near = (c, t, tol = 40) => c.every((v, i) => Math.abs(v - t[i]) <= tol)
// 舞台坐标 → 截图坐标（截图 = 视口, 舞台在其内偏移 px.left/px.top）
const S = (x, y) => at(px.left + x, px.top + y)
console.log('== 像素 ==')
console.log('盒体中心(应近黑或装饰图色):', S(600, 330))
console.log('盒体左边缘外 2px(应白 Outline):', S(398, 330), S(402, 330))
console.log('标题带里是否有青色字:', [...Array(200)].some((_, i) => near(S(500 + i * 1, 217.5), [0, 250, 255], 60)))
console.log('盒体左下角外(应看到地图/舞台底色, 不是全黑):', S(300, 500))

// ---- 2. Cancel → 关闭 ----
await page.click('.rb-btn--cancel')
await new Promise(r => setTimeout(r, 200))
console.log('== 2. 点 Cancel 后 remaining panels =', await page.evaluate(() => document.querySelectorAll('.rv-panel').length))

// ---- 3. Confirm → 第二个面板（One Option）----
await page.click('#rvDemo')
await page.waitForSelector('.rv-panel')
await page.click('.rb-btn--confirm')
await new Promise(r => setTimeout(r, 500))
const p2 = await readPanel()
console.log('== 3. One Option ==')
console.log(JSON.stringify({ ...p2, imgsLoaded: undefined }, null, 1))
console.log('shot:', await shot(3))

// ---- 4. 单确认键 → 关闭；再测面板不挡舞台点击 ----
await page.click('.rb-btn--single')
await new Promise(r => setTimeout(r, 200))
console.log('== 4. 点单确认键后 remaining panels =', await page.evaluate(() => document.querySelectorAll('.rv-panel').length))
const pass = await page.evaluate(() => {
  const el = document.elementFromPoint(200, 400)   // 舞台左中部，面板弹开时也该是下层
  const wrap = document.getElementById('wrap')
  return { hit: el?.id || el?.className || el?.tagName, insideWrap: wrap.contains(el) }
})
console.log('== 5. 舞台左中部 elementFromPoint =', JSON.stringify(pass))
console.log('errors:', errs.length ? errs : 'none')
await browser.close()