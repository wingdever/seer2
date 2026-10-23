// M4 验收: 地图场景消费 SAVE v2 + 战果 handoff + 图鉴/队伍显示, reload 后仍在。
// 用法: node tools/verify-save-dex.mjs
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'

const BASE = 'http://127.0.0.1:8090'
let failures = 0
const ok = (name, pass, info = '') => { console.log(`${pass ? '✔' : '✖'} ${name}  ${info}`); if (!pass) failures++ }

const PETS = JSON.parse(readFileSync(new URL('../game/data/pets.json', import.meta.url)))
const calcMaxHp = (b, lv) => Math.floor(((2 * b + 31) * lv) / 100) + lv + 10
const p1 = PETS.monsters[1], p2 = PETS.monsters[2]
const hpMax1 = calcMaxHp(p1.stats.hp, 12), hpMax2 = calcMaxHp(p2.stats.hp, 30)

// 手工构造一份 v2 存档 (队伍2只, 仓库1只, 道具, 图鉴含未见/见过/抓到) + 一个已抓到的战果回传
const SAVE_V2 = {
  v: 2,
  trainer: { name: '测试训练家', level: 3, coins: 1234, diamonds: 5 },
  team: [
    { uid: 'p1', petId: 1, name: String(p1.name), swfId: p1.swfId ?? 1, level: 12, exp: 100, hp: Math.round(hpMax1 * 0.5) },
    { uid: 'p2', petId: 2, name: String(p2.name), swfId: p2.swfId ?? 2, level: 30, exp: 0, hp: hpMax2 },
  ],
  box: [
    { uid: 'p3', petId: 3, name: String(PETS.monsters[3].name), swfId: PETS.monsters[3].swfId ?? 3, level: 8, exp: 0, hp: calcMaxHp(PETS.monsters[3].stats.hp, 8) },
  ],
  items: [{ id: 200001, count: 9 }, { id: 200011, count: 3 }],
  dex: { '1': { seen: true, caught: true }, '2': { seen: true, caught: true }, '3': { seen: true, caught: true }, '9': { seen: true, caught: false } },
  evolve: { pending: [] },
  battle: null,
}
const RESULT = {
  ts: Date.now(),
  wild: { petId: 2, level: 30, slot: 1, back: '1', map: '100002' },
  outcome: 'capture',
  captured: { petId: 2, level: 30, uid: 'p2', where: 'team' },
  left: { hp: [60, 200], pets: [1, 2] },
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage()
await page.setViewport({ width: 1260, height: 1000 })
const pageErrs = []
page.on('pageerror', e => pageErrs.push(e.message))

await page.evaluateOnNewDocument(save => {
  // 显式钉 as3 宇宙 (v2 线): 默认已是重启, 本测验证的是原版存档/背包/图鉴, 必须锁 v2
  if (!localStorage.getItem('roco.battle.engine')) localStorage.setItem('roco.battle.engine', 'as3')
  // 只种一次: reload 后不能覆盖已被页面改动的存档 (M4-9/11 才能验证真实持久化)
  if (!localStorage.getItem('rocoshowdown.save.v2')) localStorage.setItem('rocoshowdown.save.v2', JSON.stringify(save))
}, SAVE_V2)

const waitReady = () => page.waitForFunction(() => {
  const s = document.getElementById('mapSel').value
  return typeof nameOf === 'function' && document.getElementById('hint').textContent.includes(nameOf(s) + ' · 地图就绪')
}, { timeout: 60000, polling: 500 })

await page.goto(`${BASE}/game/index.html#/map?map=1`, { waitUntil: 'domcontentloaded' })
try { await waitReady() } catch (e) { console.log('READY-TIMEOUT') }
// 战果 handoff 现在只是内存里的一份对象: 投放后调用地图场景的消费函数 (路由切换时的自动消费由 verify-loop 端到端覆盖)
await page.evaluate(r => { window.APP.lastResult = r; window.applyBattleResult() }, RESULT)

const logTxt = await page.$eval('#log', el => el.textContent)
const hint = await page.$eval('#hint', el => el.textContent)

ok('M4-1 战果消费日志', logTxt.includes('✦ 战果: 抓到') && logTxt.includes('新成员入队伍'), '')
ok('M4-2 图鉴统计日志', /图鉴: 见过 4 · 抓到 3 · 队伍 2 只 \/ 仓库 1 只/.test(logTxt), '')
ok('M4-3 提示栏含抓到数', hint.includes('图鉴 3 抓到'), hint.slice(-60))

const rows = await page.evaluate(() => window.petRows())
ok('M4-4 精灵背包行= v2 队伍+仓库', rows.length === 3 && rows[0].level === 12 && rows[1].level === 30 && rows[2].level === 8,
  JSON.stringify(rows.map(r => [r.name, r.level, r.hp + '/' + r.hpMax])))
ok('M4-5 每宠等级/血量独立(不再全局 petLevel/满血)', rows[0].hp === Math.round(hpMax1 * 0.5), `${rows[0].hp} vs ${hpMax1}`)

const bag = await page.evaluate(() => window.bagRecords())
ok('M4-6 HUD 袋=前8出战宠', bag.length === 2 && bag[0].split('|')[2] === '12', bag.join(';'))

const items = await page.evaluate(() => window.itemRows())
const ball = items.find(r => r.id === 200001)
ok('M4-7 物品背包读 v2 (胶囊×9)', ball && ball.count === 9, JSON.stringify(items.map(r => [r.id, r.count])))

const profile = await page.evaluate(() => [SAVE.name, SAVE.coins])
ok('M4-8 训练家资料取自 v2 trainer', profile[0] === '测试训练家' && profile[1] === 1234, JSON.stringify(profile))

// 用掉一个道具 → 写回 v2 → reload 数量仍在
await page.evaluate(() => window.useItem(200001, '普通精灵胶囊'))
const afterUse = await page.evaluate(() => JSON.parse(localStorage.getItem('rocoshowdown.save.v2')).items.find(x => x.id === 200001).count)
ok('M4-9 地图使用胶囊扣 v2 数量', afterUse === 8, String(afterUse))

await page.reload({ waitUntil: 'domcontentloaded' })
try { await waitReady() } catch (e) { console.log('READY-TIMEOUT2') }
const log2 = await page.$eval('#log', el => el.textContent)
const hint2 = await page.$eval('#hint', el => el.textContent)
const persisted = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('rocoshowdown.save.v2'))
  return { ball: s.items.find(x => x.id === 200001)?.count, caught: Object.values(s.dex).filter(d => d.caught).length, team: s.team.length }
})
ok('M4-10 reload 后战果不重复消费', !log2.includes('✦ 战果'), '')
ok('M4-11 reload 后存档/图鉴仍在', persisted.ball === 8 && persisted.caught === 3 && persisted.team === 2, JSON.stringify(persisted))
ok('M4-12 reload 后提示栏图鉴仍显示', hint2.includes('图鉴 3 抓到'), '')
ok('M4-13 无页面 JS 异常', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '))

await browser.close()
console.log(failures ? `M4 verify-save-dex FAIL (${failures})` : 'M4 verify-save-dex ALL PASS')
process.exit(failures ? 1 : 0)
