import puppeteer from 'puppeteer-core'
const base = 'http://127.0.0.1:8091/game/index.html'
const ENG = 'roco.battle.engine', V3 = 'rocoshowdown.restart.v3'
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--disable-dev-shm-usage'] })
const page = await b.newPage()
await page.setViewport({ width: 1100, height: 700 })
await page.goto(base, { waitUntil: 'domcontentloaded' })
await page.evaluate(async (E, V3k) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  localStorage.clear(); localStorage.setItem(E, 'restart')
  localStorage.setItem(V3k, JSON.stringify({ v:3, trainer:{name:'t',level:7,coins:1234,diamonds:56},
    team: Array.from({length:6},(_,i)=>({uid:'t'+i,petId:[1,4,7,10001,10004,10007][i],level:10,exp:0,hp:C.restartHpMax([1,4,7,10001,10004,10007][i],10)})),
    box: [{uid:'pB',petId:2,level:5,exp:0,hp:C.restartHpMax(2,5)}],
    items:[], dex:{}, evolve:{pending:[]}, battle:null, _authority:{hp:'unity-iv0',exp:'borrowed-A/B-shape'} }))
}, ENG, V3)
await page.goto(`${base}#/map`, { waitUntil:'domcontentloaded', timeout:60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, {timeout:30000}).catch(()=>{})
await page.waitForFunction(() => !!(window.M && window.M.player), {timeout:30000}).catch(()=>{})
await page.evaluate(() => window.openRestartPetBag())
await new Promise(r=>setTimeout(r,500))
const box = await (await page.$('#wrap')).boundingBox()
await page.screenshot({ path: '/tmp/petbag-wrap.png', clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
await b.close()
