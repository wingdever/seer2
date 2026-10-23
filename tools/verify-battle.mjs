// M3 回归: 战斗场景 (SPA #/battle) 全动作链 (headless Chromium)
// A 沙盒对战(原有) · B 抓捕链 · C 打赢升级 · D 战败全愈 · E 逃跑跨页回传 · F 道具
// 用法: node tools/verify-battle.mjs 
import puppeteer from 'puppeteer-core'

const EXE = '/usr/bin/chromium'
const BASE = 'http://127.0.0.1:8090/game/index.html#/battle'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let failures = 0
const ok = (cond, name, extra = '') => {
  console.log((cond ? '✔ ' : '✖ ') + name + (extra ? '  ' + extra : ''))
  if (!cond) failures++
}

const b = await puppeteer.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })

async function newPage(saveV1) {
  const page = await b.newPage()
  await page.setViewport({ width: 1260, height: 940 })
  page.errors = []
  page.on('pageerror', e => page.errors.push(String(e.message)))
  // 隔离: 进战斗场景那次 document 创建时清掉旧档再种 v1 (地图场景不清, 保住战果)
  await page.evaluateOnNewDocument(s => {
    if (location.hash.startsWith('#/battle')) {
      localStorage.clear(); sessionStorage.clear()
      // 显式钉 as3 宇宙 (v2/v1 线): 默认已是重启, 本测全程走原版 #/battle + v2 存档
      localStorage.setItem('roco.battle.engine', 'as3')
      if (s) localStorage.setItem('rocoshowdown.save.v1', s)
    }
  }, saveV1 ? JSON.stringify(saveV1) : null)
  return page
}

// ============ A. 沙盒模式 (无 ?wild): 原有冒烟 ============
{
  const page = await newPage(null)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('hint')?.textContent?.includes('内核就绪'), { timeout: 45000 }).catch(() => {})
  const ready = await page.evaluate(() => ({ hint: document.getElementById('hint').textContent, hasK: !!window.BattleKernel }))
  ok(ready.hint.includes('内核就绪') && ready.hasK, 'A1 沙盒内核就绪', ready.hint)
  for (let t = 0; t < 6; t++) { await page.evaluate(i => window.takeTurn && window.takeTurn(i), t % 5); await sleep(900) }
  const st = await page.evaluate(async () => {
    const s = await window.BattleKernel.snapshot()
    return { status: s.status, players: s.players.map(p => { const pet = p.team.find(x => x.id === p.activePet) || p.team[0]; return { hp: pet.currentHp + '/' + pet.maxHp, rage: p.rage } }) }
  })
  ok(!!st.players[0]?.hp.includes('/'), 'A2 六回合后快照可读', JSON.stringify(st))
  // A3 = 计划 S2 判据: 战斗页的技能数值必须来自**重启表**。10001 拍打 重启命中 95 / 官方 100,
  //      所以判据落在「第一张卡是拍打且命中写着 95」。注意 10003 脱力 在两代表里都是 100,
  //      不能用「页面上不出现命中100」当判据 —— 那是假阳性陷阱。
  const cards = await page.evaluate(() => [...(document.getElementById('cards')?.children || [])].map(e => e.textContent).join(' | '))
  ok(/拍打 威力40 命中95/.test(cards), 'A3 技能读数=重启表 (拍打 命中95)', cards.slice(0, 120))
  ok(cards.includes('lite_4.9.2') && cards.includes('"hp":280') && cards.includes('"atk":237'), 'A4 六维=移植公式 (atk237/hp280)', cards.slice(-90))
  await page.screenshot({ path: '/tmp/verify-battle-sandbox.png' })
  await page.close()
}

// ============ B. 野战抓捕链: 技能×N → 残血 → 扔球 → 抓到 → 结算 ============
{
  const page = await newPage({ name: '小赛尔', level: 1, coins: 5000, diamonds: 0, petLevel: 12, bag: [3, 1], items: [{ id: 200001, count: 3 }, { id: 200003, count: 1 }] })
  await page.goto(BASE + '?wild=2&level=20&slot=1&map=100002&back=1', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('hint')?.textContent?.includes('野外遭遇'), { timeout: 45000 }).catch(() => {})
  ok(await page.evaluate(() => window.battleApp?.wild.on === true), 'B1 野战模式启动(存档迁移+多宠队)')

  // 打 1 个技能回合 (Lv12 vs Lv20 野怪扛得住)
  const evSeq = []
  for (let t = 0; t < 1; t++) {
    await page.evaluate(() => window.takeTurn(0))
    await sleep(1500)
    evSeq.push(await page.evaluate(() => window.battleApp.wild.S?.battle?.turns))
  }
  ok(evSeq.every(v => typeof v === 'number'), 'B2 技能回合推进', 'turns=' + JSON.stringify(evSeq))

  const whp = await page.evaluate(() => {
    const R = window.battleApp.battle.lastSt.players[1]
    return window.BattleKernel.hp(R.activePet)
  })
  // 掷点必成
  await page.evaluate(() => { window.battleApp.wild.deps.rng = () => 0 })
  await page.evaluate(() => window.postMessage({ type: 'hubClick', hub: 'catch' }, '*'))
  await sleep(400)
  const panelTxt = await page.evaluate(() => document.getElementById('panel').textContent)
  ok(panelTxt.includes('胶囊') && panelTxt.includes('×'), 'B3 抓捕面板列出持有胶囊', panelTxt.slice(0, 60))
  await page.evaluate(() => [...document.querySelectorAll('#panel button')].find(x => x.textContent.includes('普通精灵胶囊') && !x.disabled)?.click())
  await sleep(1200)
  const post = await page.evaluate(() => ({
    log: document.getElementById('log').textContent,
    settle: document.getElementById('settle').style.display,
    result: window.APP.lastResult,
    S: window.battleApp.wild.S,
    ballLeft: window.battleApp.wild.S.items.find(i => i.id === 200001)?.count ?? 0,
    wildHpNow: (() => { const R = window.battleApp.battle.lastSt.players[1]; return window.BattleKernel.hp(R.activePet).current })(),
  }))
  ok(whp.current > 0, 'B4 抓捕前野怪存活', `hp=${whp.current}/${whp.max}`)
  ok(post.log.includes('抓到!'), 'B5 抓捕成功(掷点事件)', post.log.split('\n')[0])
  ok(post.result?.outcome === 'capture' && post.result?.captured?.petId === 2, 'B6 战果 handoff outcome=capture')
  ok(post.S.team.some(p => p.petId === 2), 'B7 抓到入队')
  ok(post.S.dex['2']?.caught === true, 'B8 图鉴 caught 点亮')
  ok(post.ballLeft === 2, 'B9 胶囊消耗 3→2', String(post.ballLeft))
  ok(post.result.left.hp.length === post.result.left.pets.length && post.result.left.hp.length >= 2, 'B10 战果带我方 hp 快照')
  ok(await page.evaluate(() => document.getElementById('settle').textContent.includes('经验')), 'B11 结算浮层含经验')
  await page.screenshot({ path: '/tmp/verify-battle-capture.png' })
  ok(page.errors.length === 0, 'B12 无页面 JS 异常', page.errors.slice(0, 2).join('|'))
  await page.close()
}

// ============ C. 打赢: BATTLE_END(win) → 经验升级 → 战果 win ============
{
  const page = await newPage({ name: '小赛尔', level: 1, coins: 5000, diamonds: 0, petLevel: 60, bag: [3], items: [] })
  await page.goto(BASE + '?wild=2&level=5&slot=1&map=100002&back=1', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('hint')?.textContent?.includes('野外遭遇'), { timeout: 45000 }).catch(() => {})
  let result = null
  // 出手选「第一张有威力的卡」: 重启表里 迪兰特 的 0 号位是 10009 水流护体 (属性技, 威力 0),
  // 固定 takeTurn(0) 会永远打不掉血 —— 那是测试的假设, 不是上游语义。
  const hit = await page.evaluate(() => {
    const lp = window.battleApp.battle.lastSt?.players?.[0]
    const pet = lp?.team?.find(t => t.id === lp.activePet) || lp?.team?.[0]
    const cfg = window.battleApp.battle.cfgByPet?.get(String(lp?.activePet))
    const skills = cfg?.skills || pet?.skills || []
    return Math.max(0, skills.findIndex(s => (s.power || 0) > 0))
  })
  for (let t = 0; t < 40 && !result; t++) {
    await page.evaluate(i => window.takeTurn(i), hit)
    await sleep(1100)
    result = await page.evaluate(() => window.APP.lastResult)
  }
  ok(result?.outcome === 'win', 'C1 打赢 → 战果 outcome=win', result ? '' : '40 回合未结束 (出手位=' + hit + ')')
  const S = await page.evaluate(() => window.battleApp.wild.S)
  ok((S.team[0].exp ?? 0) > 0, 'C2 参战宠获得经验', 'exp=' + S.team[0].exp)
  ok(S.dex['2']?.seen === true && S.dex['2']?.caught === false, 'C3 打赢只点亮 seen')
  ok(S.battle === null, 'C4 战斗上下文已清空')
  ok(await page.evaluate(() => document.getElementById('settle').textContent.includes('战斗胜利')), 'C5 结算浮层=战斗胜利')
  await page.screenshot({ path: '/tmp/verify-battle-win.png' })
  ok(page.errors.length === 0, 'C6 无页面 JS 异常', page.errors.slice(0, 2).join('|'))
  await page.close()
}

// ============ D. 战败: 全灭 → 队伍全愈 → 战果 lose ============
{
  const page = await newPage({ name: '小赛尔', level: 1, coins: 5000, diamonds: 0, petLevel: 1, bag: [1], items: [] })
  await page.goto(BASE + '?wild=6&level=80&slot=1&map=100002&back=1', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('hint')?.textContent?.includes('野外遭遇'), { timeout: 45000 }).catch(() => {})
  let result = null
  for (let t = 0; t < 40 && !result; t++) {
    await page.evaluate(() => window.takeTurn(0))
    await sleep(1100)
    result = await page.evaluate(() => window.APP.lastResult)
  }
  ok(result?.outcome === 'lose', 'D1 全灭 → 战果 outcome=lose', result ? '' : '未判负')
  const S = await page.evaluate(() => window.battleApp.wild.S)
  ok(S.team[0].hp > 0, 'D2 战败队伍全愈', 'hp=' + S.team[0].hp)
  ok(page.errors.length === 0, 'D3 无页面 JS 异常', page.errors.slice(0, 2).join('|'))
  await page.close()
}

// ============ E. 逃跑: 失败留下 → 成功跨页回图 + 战果 escape ============
{
  const page = await newPage({ name: '小赛尔', level: 1, coins: 5000, diamonds: 0, petLevel: 40, bag: [3, 1], items: [{ id: 200011, count: 2 }] })
  await page.goto(BASE + '?wild=2&level=10&slot=1&map=100002&back=1', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.getElementById('hint')?.textContent?.includes('野外遭遇'), { timeout: 45000 }).catch(() => {})
  await page.evaluate(() => window.takeTurn(0)); await sleep(2400)
  // F. 道具: 体力药剂加血且耗道具
  const before = await page.evaluate(() => window.BattleKernel.hp(window.battleApp.battle.lastSt.players[0].activePet))
  await page.evaluate(() => window.postMessage({ type: 'hubClick', hub: 'item' }, '*')); await sleep(300)
  ok(await page.evaluate(() => document.getElementById('panel').textContent.includes('体力药剂')), 'F1 道具面板列出药剂')
  await page.evaluate(() => [...document.querySelectorAll('#panel button')].find(x => x.textContent.includes('体力药剂') && !x.disabled)?.click())
  await sleep(1800)
  const after = await page.evaluate(() => window.BattleKernel.hp(window.battleApp.battle.lastSt.players[0].activePet))
  const potionLeft = await page.evaluate(() => window.battleApp.wild.S.items.find(i => i.id === 200011)?.count ?? 0)
  const potionLog = await page.evaluate(() => document.getElementById('log').textContent)
  ok(potionLog.includes('使用 初级体力药剂'), 'F2 药剂生效日志', `${before.current}→${after.current}`)
  ok(potionLeft === 1, 'F3 药剂消耗 2→1', String(potionLeft))
  // 换宠面板 (仅断言可打开/列出, 换宠内核行为已由 verify-kernel-ops 覆盖)
  await page.evaluate(() => window.postMessage({ type: 'hubClick', hub: 'pet' }, '*')); await sleep(300)
  ok(await page.evaluate(() => document.getElementById('panel').textContent.includes('出战')), 'F4 换宠面板列出队伍')
  await page.evaluate(() => window.battleApp.hubClick('fight')); await sleep(200)
  // 逃跑失败
  await page.evaluate(() => { window.battleApp.wild.deps.rng = () => 0.9999 })
  await page.evaluate(() => window.postMessage({ type: 'hubClick', hub: 'escape' }, '*')); await sleep(1200)
  ok(await page.evaluate(() => !!window.battleApp.wild.S.battle), 'E1 逃跑失败留在战斗')
  // 逃跑成功 → 导航
  await page.evaluate(() => { window.battleApp.wild.deps.rng = () => 0 })
  await page.evaluate(() => window.postMessage({ type: 'hubClick', hub: 'escape' }, '*'))
  await page.waitForFunction(() => location.hash.startsWith('#/map'), { timeout: 20000 }).catch(() => {})
  // 战果由地图场景挂载时消费一次并写进日志 (= 原 sessionStorage 跨页契约的等价物)
  await page.waitForFunction(() => document.getElementById('log').textContent.includes('✦ 战果: 逃脱'), { timeout: 45000, polling: 400 }).catch(() => {})
  const hand = await page.evaluate(() => ({ hash: location.hash, consumed: window.APP.lastResult, log: document.getElementById('log').textContent, v2: !!localStorage.getItem('rocoshowdown.save.v2') }))
  ok(hand.hash.startsWith('#/map') && hand.consumed === null && hand.log.includes('✦ 战果: 逃脱') && hand.v2, 'E2 逃跑成功 → 回图 + escape 战果已被消费 + v2 存档已落')
  ok(page.errors.length === 0, 'E3 无页面 JS 异常', page.errors.slice(0, 2).join('|'))
  await page.close()
}

await b.close()
console.log(failures === 0 ? '\nM3 verify-battle ALL PASS' : `\nM3 verify-battle FAIL ×${failures}`)
process.exit(failures ? 1 : 0)
