// petbag 新面板冒烟探针: 引擎=重启 → 播一份可控 v3 → 进图 → 开背包 → 截图 + 走查 (点击/切页/开仓库)。
// 只诊断"能不能跑起来 + 有没有 pageerror + DOM 结构对不对", 不做完工断言。
// 用法: node /tmp/petbag-probe.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/petbag.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/petbag.png'
const V3 = 'rocoshowdown.restart.v3', ENG = 'roco.battle.engine'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const out = []
const say = (k, v) => { out.push(`${k}: ${v}`) }

// 0) 取 content 权威 (restartHpMax), 动态播一份 team6+box6 的 v3
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(async (E, V3k) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const mk = (uid, petId, level) => ({ uid, petId, level, exp: 0, hp: C.restartHpMax(petId, level) })
  localStorage.clear(); localStorage.setItem(E, 'restart')
  localStorage.setItem(V3k, JSON.stringify({
    v: 3, trainer: { name: '重启训练师', level: 7, coins: 1234, diamonds: 56 },
    team: [mk('t1', 1, 10), mk('t2', 2, 12), mk('t3', 3, 8), mk('t4', 4, 20), mk('t5', 5, 15), mk('t6', 6, 30)],
    box: [mk('b1', 7, 5), mk('b2', 8, 6), mk('b3', 10001, 9), mk('b4', 10002, 11), mk('b5', 10003, 13), mk('b6', 10004, 7),
          mk('s1', 10005, 4), mk('s2', 10006, 4)],   // 前6进候选区, 后2进仓库
    items: [], dex: { '1': { seen: true, caught: true } }, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed' },
  }))
}, ENG, V3)

await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })

// 1a) 直接静态检查新模块能否在浏览器里 import (把语法/路径错误精确定位出来)
const imp = await page.evaluate(async () => {
  const files = [
    '/game/logic/petbag/constants.js', '/game/logic/petbag/source.js', '/game/logic/petbag/grid.js', '/game/logic/petbag/actions.js',
    '/game/app/view/petbag/cellView.js', '/game/app/view/petbag/gridView.js', '/game/app/view/petbag/filterBar.js',
    '/game/app/view/petbag/sortBar.js', '/game/app/view/petbag/detailPane.js', '/game/app/view/petbag/personalityPane.js',
    '/game/app/view/petbag/itemPane.js', '/game/app/view/petbag/displayPane.js', '/game/app/view/petbag/bagPanel.js', '/game/app/view/petbag/storagePanel.js',
    '/game/app/view/petbag/index.js', '/game/app/view/panels/host.js', '/game/app/scenes/mapScene.js',
  ]
  const bad = []
  for (const p of files) { try { await import(p) } catch (e) { bad.push(p + ' => ' + String(e && e.message || e)) } }
  return bad.length ? bad : ['all-import-ok']
})
say('import-check', JSON.stringify(imp, null, 0))
say('fn?', await page.evaluate(() => ({ openBag: typeof window.openRestartPetBag, wrap: !!document.getElementById('wrap'), bar: !!document.getElementById('bar') })))

await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 30000 }).catch(() => {})
await page.waitForFunction(() => !!(window.M && window.M.player), { timeout: 30000 }).catch(() => {})

const store = await page.evaluate(() => {
  const A = window.getActiveStore?.()
  return { isRestart: A?.isRestart, team: A?.state?.team?.length, box: A?.state?.box?.length }
})
say('store', JSON.stringify(store))

// 1) 开背包
say('open?', await page.evaluate(() => (typeof window.openRestartPetBag === 'function' ? (window.openRestartPetBag(), 'called') : 'NO-FN')))
await page.waitForFunction(() => !!document.querySelector('#rv .rbp-box'), { timeout: 8000 }).catch(() => {})

const dom = await page.evaluate(() => {
  const box = document.querySelector('#rv .rbp-box')
  const cells = [...document.querySelectorAll('#rv .rbg-cell')]
  const acts = [...document.querySelectorAll('#rv .rbp-acts .rbp-act')].map(b => b.textContent)
  const miss = [...document.querySelectorAll('#rv [data-asset-missing]')].map(n => n.dataset.assetMissing)
  return {
    hasBox: !!box,
    cellCount: cells.length,
    emptyCells: cells.filter(c => c.classList.contains('rbg-cell--empty')).length,
    leadMark: !!document.querySelector('#rv .rbg-mark'),
    pageno: document.querySelector('#rv .rbg-pageno')?.textContent,
    acts,
    missingAssets: miss,
  }
})
say('bag-dom', JSON.stringify(dom))
await page.screenshot({ path: '/tmp/petbag-bag.png' })   // 主背包面板单独一张

// 2) 选中候选区一只 (第7格 slot6) 点"上阵" → 应落到第一空位或 teamEmpty? team满(6) ⇒ pickReplace 提示
await page.evaluate(() => {
  const cells = [...document.querySelectorAll('#rv .rbg-cell')]
  const c = cells.find(x => x.dataset.slot === '6')
  if (c) c.click()
})
const afterPick = await page.evaluate(() => document.querySelector('#rv .rbp-note')?.textContent || '')
say('after-select-slot6', afterPick)

// 点恢复 (heal 全队) → note 应显示文案
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#rv .rbp-acts .rbp-act')].find(x => x.textContent === '恢复')
  if (b) b.click()
})
await new Promise(r => setTimeout(r, 200))
const afterHeal = await page.evaluate(() => ({
  note: document.querySelector('#rv .rbp-note')?.textContent || '',
  // 存档 team 首只 hp 应回满 (describePet 在装配算 hpMax)
  firstHp: window.getActiveStore?.()?.state?.team?.[0]?.hp,
}))
say('after-heal', JSON.stringify(afterHeal))

// 3) 开仓库 (模态, rbs-box)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#rv .rbp-acts .rbp-act')].find(x => x.textContent === '仓库')
  if (b) b.click()
})
await page.waitForFunction(() => !!document.querySelector('#rv .rbs-box'), { timeout: 5000 }).catch(() => {})
const storage = await page.evaluate(() => ({
  hasBox: !!document.querySelector('#rv .rbs-box'),
  cellCount: document.querySelectorAll('#rv .rbs-box .rbg-cell').length,
  acts: [...document.querySelectorAll('#rv .rbs-acts .rbs-act')].map(b => b.textContent),
}))
say('storage-dom', JSON.stringify(storage))

await page.screenshot({ path: shot })
say('shot', shot)

console.log(out.join('\n'))
console.log(errs.length ? '\n--- ERRORS (' + errs.length + ') ---\n' + errs.join('\n') : '\n--- no page/console errors ---')
await browser.close()
