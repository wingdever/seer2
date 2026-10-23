import puppeteer from 'puppeteer-core'
const base = 'http://127.0.0.1:8091/game/index.html'
const ENG = 'roco.battle.engine', V3 = 'rocoshowdown.restart.v3'
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(async (E, V3k) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  localStorage.clear(); localStorage.setItem(E, 'restart')
  localStorage.setItem(V3k, JSON.stringify({
    v: 3, trainer: { name: 't', level: 7, coins: 1234, diamonds: 56 },
    team: [{ uid: 'pLead', petId: 1, level: 10, exp: 0, hp: C.restartHpMax(1, 10) }],
    box: [{ uid: 'pBox', petId: 2, level: 5, exp: 0, hp: C.restartHpMax(2, 5) }],
    items: [], dex: {}, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
}, ENG, V3)
await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 30000 }).catch(() => {})
await page.waitForFunction(() => !!(window.M && window.M.player), { timeout: 30000 }).catch(() => {})
await page.evaluate(() => window.openRestartPetBag())
await new Promise(r => setTimeout(r, 500))
const out = await page.evaluate(() => {
  const q = (s) => document.querySelector(s)
  return {
    box: !!q('#rv .rbp-box'),
    title: q('#rv .rbp-title')?.textContent,
    layers: { head: !!q('#rv .rbp-head'), main: !!q('#rv .rbp-main'), team: !!q('#rv .rbp-team') },
    display: !!q('#rv .rbp-display'), info: !!q('#rv .rbp-info'), acts: !!q('#rv .rbp-acts'), ipanel: !!q('#rv .rbp-ipanel'),
    actsLabels: [...document.querySelectorAll('#rv .rbp-act')].map(b => b.textContent),
    tabs: [...document.querySelectorAll('#rv .rbp-tab')].map(b => b.textContent),
    cells: document.querySelectorAll('#rv .rbg-cells .rbg-cell').length,
    refresh: q('#rv .rbp-team-refresh')?.textContent,
    hudItems: [...document.querySelectorAll('#rv .rbp-hud-item')].map(n => n.textContent),
    stats: [...document.querySelectorAll('#rv .rbp-stat')].map(r => r.textContent),
    binfo: [...document.querySelectorAll('#rv .rbp-brow')].map(r => r.textContent),
    stage: !!q('#rv .rbp-stage'),
  }
})
console.log(JSON.stringify(out, null, 2))
console.log('ERRORS:', errs.length ? errs.join('\n') : '(none)')
await page.screenshot({ path: '/tmp/petbag-new.png' })
await browser.close()
