// M5 回归总链 (SPA: #/map ⇄ #/battle): 地图 → 点野怪 → 战斗(抓捕) → 自动回图 → 存档/图鉴落盘 → reload 仍在;
//              再遇一只 → 技能打赢 → 经验入档。全链一条命令。
// 用法: node tools/verify-loop.mjs
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8090'
const MAP = process.env.MAP || '2'
const PETS = JSON.parse(readFileSync(new URL('../game/data/pets.json', import.meta.url)))
const calcMaxHp = (b, lv) => Math.floor(((2 * b + 31) * lv) / 100) + lv + 10
let failures = 0
const ok = (name, pass, info = '') => { console.log(`${pass ? '✔' : '✖'} ${name}  ${info}`); if (!pass) failures++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const V1 = { name: '闭环训练家', level: 1, coins: 1000, diamonds: 0, petLevel: 40, bag: [1], items: [{ id: 200006, count: 1 }, { id: 200011, count: 2 }] }

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const pageErrs = []
page.on('pageerror', e => pageErrs.push(e.message))

// 一次性种子: 只在还没有 v2 存档的那次导航注入 (v2 建立后不覆盖页面写回的存档)
await page.evaluateOnNewDocument(v1 => {
  // 显式钉 as3 宇宙: 默认已是重启, 本测走原版 地图→点野怪→#/battle→回图 闭环, 必须锁 v2/AS3
  if (!localStorage.getItem('roco.battle.engine')) localStorage.setItem('roco.battle.engine', 'as3')
  if (!localStorage.getItem('rocoshowdown.save.v2')) {
    localStorage.removeItem('rocoshowdown.save.v1')
    localStorage.setItem('rocoshowdown.save.v1', JSON.stringify(v1))
  }
}, V1)

const waitMapReady = () => page.waitForFunction(() => (document.getElementById('hint').textContent || '').includes('地图就绪'), { timeout: 60000, polling: 500 })

// 点一只野怪 → 等路由切到 #/battle (复用 verify-wild.mjs 的点击链); excludeNames 用于换一种怪
async function clickWild(excludeNames = []) {
  const wrap = await page.$('#wrap')
  const box = await wrap.boundingBox()
  await page.mouse.click(box.x + 600, box.y + 620)
  await sleep(500)
  const fresh = await page.evaluate(() => (M.player?.petPositions?.() || []).map(s => {
    const f = s.split('|')
    return { idx: f[0] | 0, level: f[3] | 0, name: f[4], sx: M.cam.x + (f[1] | 0), sy: M.cam.y + (f[2] | 0) }
  }))
  if (!fresh.length) throw new Error('图上没有野怪')
  const cx = box.width / 2, cy = box.height / 2
  const inView = fresh.filter(p => p.sx > 20 && p.sx < box.width - 20 && p.sy > 20 && p.sy < box.height - 20)
  const pool = inView.filter(p => !excludeNames.includes(p.name))
  const t = (pool.length ? pool : inView).sort((a, b) => Math.hypot(a.sx - cx, b.sy - cy) - Math.hypot(b.sx - cx, b.sy - cy))[0] || fresh[0]
  await page.mouse.click(box.x + t.sx, box.y + t.sy - 18)
  await page.waitForFunction(() => location.hash.startsWith('#/battle'), { timeout: 45000, polling: 400 })
  return t
}
async function waitBattleWildReady() {
  await page.waitForFunction(() => (document.getElementById('hint').textContent || '').includes('野外遭遇') && window.battleApp?.battle?.armed,
    { timeout: 90000, polling: 500 })
  const q = new URLSearchParams(page.url().split('?')[1] || '')
  return { petId: Number(q.get('wild')), level: Number(q.get('level')) }
}

// ================= ENC1: 抓捕闭环 =================
await page.goto(`${BASE}/game/index.html#/map?map=${MAP}`, { waitUntil: 'domcontentloaded' })
await waitMapReady()
const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem('rocoshowdown.save.v2') || 'null'))
ok('L1 地图首开: v1→v2 迁移落盘', !!migrated && migrated.team.length === 1 && migrated.team[0].level === 40, JSON.stringify(migrated?.team?.[0] || null))

const w1 = await clickWild()
const enc1 = await waitBattleWildReady()
ok('L2 点野怪 → #/battle 野战就绪', enc1.petId > 0, `槽位${w1.idx} wild=${enc1.petId}(${w1.name}) Lv${enc1.level}`)

await page.evaluate(() => window.battleApp.doCapture(200006))   // 无敌胶囊 prob=100 → 必抓
await page.waitForFunction(() => window.battleApp?.battle?.over, { timeout: 20000, polling: 400 })
const capEv = await page.evaluate(() => document.getElementById('log').textContent.split('\n').find(l => l.includes('扔出')) || '')
ok('L3 抓捕掷点成功', capEv.includes('抓到!'), capEv)
await page.waitForFunction(() => location.hash.startsWith('#/map'), { timeout: 30000, polling: 500 })
await waitMapReady()

const S2 = await page.evaluate(() => JSON.parse(localStorage.getItem('rocoshowdown.save.v2')))
const caughtPet = S2.team.find(p => p.petId === enc1.petId) || S2.box.find(p => p.petId === enc1.petId)
const log2 = await page.$eval('#log', el => el.textContent)
ok('L4 回图消费战果(抓到)', log2.includes('✦ 战果: 抓到'), log2.split('\n').find(l => l.includes('战果')) || '')
ok('L5 抓到入队/仓 + hp=捕获现值', !!caughtPet && caughtPet.level === enc1.level && caughtPet.hp >= 1 && caughtPet.hp <= calcMaxHp(PETS.monsters[enc1.petId].stats.hp, enc1.level),
  JSON.stringify(caughtPet || null))
ok('L6 图鉴 caught 点亮', S2.dex[String(enc1.petId)]?.caught === true && Object.values(S2.dex).filter(d => d.caught).length >= 2, JSON.stringify(S2.dex))
ok('L7 无敌胶囊已消耗', !S2.items.find(x => x.id === 200006), JSON.stringify(S2.items))

await page.reload({ waitUntil: 'domcontentloaded' })
await waitMapReady()
const log3 = await page.$eval('#log', el => el.textContent)
const S3 = await page.evaluate(() => JSON.parse(localStorage.getItem('rocoshowdown.save.v2')))
ok('L8 reload: 战果不重复消费', !log3.includes('✦ 战果'), '')
ok('L9 reload: 队伍/图鉴仍在', S3.team.length + S3.box.length >= 2 && S3.dex[String(enc1.petId)]?.caught === true, `team=${S3.team.length} box=${S3.box.length}`)

// ================= ENC2: 打赢闭环 (经验, 换一种怪) =================
const w2 = await clickWild([w1.name])
const enc2 = await waitBattleWildReady()
let res = null
for (let t = 0; t < 40 && !res; t++) {
  await page.evaluate(() => window.takeTurn(0))
  await sleep(1200)
  res = await page.evaluate(() => window.APP.lastResult || null)
}
ok('L10 技能链打赢 → 战果 win', res && res.outcome === 'win', res ? res.outcome : '40回合未结束')
await page.waitForFunction(() => location.hash.startsWith('#/map'), { timeout: 30000, polling: 500 })
await waitMapReady()
const S4 = await page.evaluate(() => JSON.parse(localStorage.getItem('rocoshowdown.save.v2')))
const log4 = await page.$eval('#log', el => el.textContent)
const lvPet = S4.team.find(p => p.uid === res.left?.uids?.[0]) || S4.team[0]
ok('L11 打赢: 参战宠经验入档', lvPet && (lvPet.exp > 0 || lvPet.level > 40), JSON.stringify(lvPet && [lvPet.name, lvPet.level, lvPet.exp]))
if (enc2.petId === enc1.petId) {
  ok('L12 打赢: 敌方仅 seen 不入队', false, `图 ${MAP} 上点到的还是同一种 wild=${enc2.petId}, 已被 ENC1 抓到 — 换 MAP 或加怪表`)
} else {
  ok('L12 打赢: 敌方仅 seen 不入队', S4.dex[String(enc2.petId)]?.seen === true && S4.dex[String(enc2.petId)]?.caught === false
    && !S4.team.find(p => p.petId === enc2.petId) && !S4.box.find(p => p.petId === enc2.petId), `dex=${JSON.stringify(S4.dex[String(enc2.petId)] || null)}`)
}
ok('L13 回图日志含打赢战果', log4.includes('✦ 战果: 打赢'), '')

ok('L14 全程无页面 JS 异常', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '))
await page.screenshot({ path: '/tmp/loop-final.png' })
await browser.close()
console.log(failures ? `M5 verify-loop FAIL (${failures})` : 'M5 verify-loop ALL PASS')
process.exit(failures ? 1 : 0)
