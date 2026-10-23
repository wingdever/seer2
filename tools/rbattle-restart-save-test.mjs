// S5-v3 端到端回归: 「重启内核战斗」开关拨上 → 地图首入自动写 v3、同 run 不碰 v2 → 遇怪进 #/rbattle (v3 队首 vs 野怪)
// → 跑真内核战斗到 KO → settleRestart 回写 (unity iv0 HP + unity/growth 进化·beatExpParam; exp 借 A/B 形状) → 回图。
// 另含两条独立探针: (1) 宇宙差为真 restartHpMax(1,100) ≠ 官方 calcMaxHp; (2) lose 支全愈到 restartCap。
// 用法: node tools/rbattle-restart-save-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rb-v3.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rb-v3.png'
const V2 = 'rocoshowdown.save.v2', V3 = 'rocoshowdown.restart.v3', ENG = 'roco.battle.engine'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1200, height: 720 })
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// ── 0) 宇宙差为真 + 进化/beatExpParam 取 unity 权威 (动态读取, 不硬编码) ──
await page.goto(base, { waitUntil: 'domcontentloaded' })
const meta = await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const pets = await (await fetch('/game/data/pets.json')).json()
  const st = await import('/game/logic/stats.js')
  const ev = C.restartEvolveOf(1)                 // 迪兰 → 期望 [{to:2,at:20}]
  return {
    restartHp: C.restartHpMax(1, 100),
    officialHp: pets.monsters[1] ? st.calcMaxHp(pets.monsters[1].stats.hp, 100) : null,
    evolve1: ev, beat1: C.restartBeatExpParam(1), expType1: C.restartExpTypeOf(1),
    toName: ev.length ? C.restartNameOf(ev[0].to) : null,
  }
})
A('宇宙差为真: restartHpMax(1,100) ≠ 官方 calcMaxHp', meta.restartHp !== meta.officialHp, `restart=${meta.restartHp} official=${meta.officialHp}`)
A('unity/growth 进化阈值命中 (id1 → at>0 有目标)', meta.evolve1?.length > 0 && meta.evolve1[0].at > 0 && meta.evolve1[0].to > 0, JSON.stringify(meta.evolve1))
A('beatExpParam/expType 来自 unity 表', Number.isFinite(meta.beat1) && meta.beat1 > 0 && (meta.expType1 === 0 || meta.expType1 === 1), `beat=${meta.beat1} expType=${meta.expType1}`)

// ── 1) toggle-ON 首入地图: 自动写 v3、同 run v2 未被写 ──
await page.evaluate((E) => { localStorage.clear(); localStorage.setItem(E, 'restart') }, ENG)
await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 25000 }).catch(() => {})
const mapPhase = await page.evaluate((V2k, V3k) => {
  const A = window.getActiveStore()
  const raw = localStorage.getItem(V3k)
  const st = raw ? JSON.parse(raw) : null
  return { isRestart: A?.isRestart, hasV3: !!raw, v2Written: localStorage.getItem(V2k) !== null, authority: st?._authority, teamLen: st?.team?.length }
}, V2, V3)
A('开关拨上首入地图 → 自动写 v3', mapPhase.isRestart === true && mapPhase.hasV3, JSON.stringify(mapPhase))
A('同 run v2 存档未被写 (两宇宙隔离)', mapPhase.v2Written === false)
A('v3 溯源戳: hp=unity-iv0, exp=borrowed-A/B-shape', mapPhase.authority?.hp === 'unity-iv0' && mapPhase.authority?.exp === 'borrowed-A/B-shape', JSON.stringify(mapPhase.authority))
A('v3 全新开始 (自动生成 1 只初始宠)', mapPhase.teamLen === 1, `team=${mapPhase.teamLen}`)

// ── 2) 播一份可控 v3 (id1@Lv(at-1) + 巨额 exp 使下一局升级跨过进化阈值) → 遇怪 → KO → 回图 ──
const at = meta.evolve1[0].at, to = meta.evolve1[0].to
const seed = await page.evaluate(({ V3k, at }) => {
  const leadLevel = Math.max(1, at - 1)
  const lead = { uid: 'p1', petId: 1, level: leadLevel, exp: 0, hp: 0 }
  return { V3k, at, leadLevel, lead }
}, { V3k: V3, at })
const capInfo = await page.evaluate(async (s) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const lead = { ...s.lead, hp: C.restartHpMax(1, s.leadLevel), exp: 1e7 }
  localStorage.setItem(s.V3k, JSON.stringify({
    v: 3, trainer: { name: '重启训练师', level: 1, coins: 0, diamonds: 0 },
    team: [lead], box: [], items: [], dex: {}, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
  return { startHp: lead.hp, cap: C.restartHpMax(1, s.leadLevel) }
}, seed)
const WILD = { petId: 2, level: 10 }   // 足够高的 beatExpParam×levelExpAt 保证 share>0 → 触发升级→进化链
const encUrl = `${base}#/rbattle?encounter=1&client=${WILD.petId}&level=${WILD.level}&slot=0&back=1`
await page.goto(encUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
const have = await page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
if (!have) { console.log('rbattle v3 encounter 未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }

const init = await page.evaluate(() => {
  const b = window.__battle, d = b.driver
  return { enc: b.enc, isRestart: b._enc()?.isRestart, myName: d.myPet().name, myLevel: d.myPet().level, opLevel: d.opPet().level, myHp: d.myPet().hp, myMax: d.myPet().maxHp }
})
A('v3 encounter 模式启用 (isRestart)', init.enc === true && init.isRestart === true, JSON.stringify(init))
A('我方队首来自 v3 (内核读等级=at-1)', init.myLevel === seed.leadLevel, `Lv${init.myLevel}`)
A('我方带伤入场 hp ∈ [1, 重启 cap]', init.myHp >= 1 && init.myHp <= init.myMax, `${init.myHp}/${init.myMax}`)

const fin = await page.evaluate(() => window.__battle.runUntilOver(80))
A('真内核战斗结束且判胜', fin.over && fin.outcome === 1, `rounds=${fin.rounds} state=${fin.outcome}`)

const after = await page.evaluate(({ V3k, wildId, to }) => {
  const R = window.APP?.lastResult
  const e = window.__battle._enc()
  const s = JSON.parse(localStorage.getItem(V3k) || 'null')
  const p = s?.team?.[0]
  return {
    lastWin: R && R.outcome === 'win' && R.wild?.petId === wildId,
    resultShown: !!document.querySelector('.rbb-result') || !!document.querySelector('.rb-box'),
    expUp: (p?.exp ?? 0) > 1e7, ledHp: p?.hp, levelUp: (p?.level ?? 0) > 0,
    evolved: p?.petId === to, fromPetId: p?.petId, dexSeen: !!s?.dex?.[String(wildId)]?.seen,
    v3Authority: s?._authority, v2Written: localStorage.getItem('rocoshowdown.save.v2') !== null,
    battleCleared: s?.battle === null, encExp: e?.exp, evo: e,
  }
}, { V3k: V3, wildId: WILD.petId, to })
A('结算视图弹出', after.resultShown)
A('APP.lastResult: outcome=win + wild 数值 id', after.lastWin, JSON.stringify(after.lastWin))
A('v3 经验入账 (exp 增长)', after.expUp && after.encExp > 1e7, `exp=${after.encExp}`)
A('v3 升级触发 (level 越过)', after.levelUp, `level-up 跨过 Lv${at}`)
A('v3 进化触发: 目标 petId 来自 unity growth 表 (1→' + to + ')', after.evolved, `now petId=${after.fromPetId}`)
A('v3 图鉴「见过」点亮野怪 (重启 id)', after.dexSeen)
A('v3 battle 槽归 null (结算收尾)', after.battleCleared)
A('全程 v2 存档始终未被写', after.v2Written === false)
A('v3 溯源戳仍为 borrowed-A/B-shape (exp 未谎称换血)', after.v3Authority?.exp === 'borrowed-A/B-shape', JSON.stringify(after.v3Authority))

await page.screenshot({ path: shot })

// ── 3) lose 支全愈探针 (驱动敌方无操作 → 打不出战败, 直接以场景 auth 走 settleRestart(lose)) ──
const loseProbe = await page.evaluate(async ({ V3k }) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const RST = await import('/game/logic/restartSession.js')
  const rules = await (await fetch('/game/data/rules.json')).json()
  const auth = C.buildRestartAuth(rules)
  const st = RST.loadRestartSession(localStorage, auth)
  const p = st.team[0]
  p.hp = 5                                       // 濒死
  const r = RST.settleRestart(auth, st, { outcome: 'lose', leftHp: { [p.uid]: 5 }, uids: [p.uid], wild: { petId: 2, level: 3 } })
  const cap = C.restartHpMax(p.petId, p.level)
  return { healed: p.hp === cap, hp: p.hp, cap, healedEvent: r.events.some(x => x.type === 'team.healed' && x.authority === 'unity-iv0') }
}, { V3k: V3 })
A('lose 支: 队首全愈到 restartCap (unity iv0)', loseProbe.healed && loseProbe.healedEvent, `hp=${loseProbe.hp}/${loseProbe.cap}`)

console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== S5-v3 判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
