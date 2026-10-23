// U1/F16 交互 HUD 端到端: 载入 #/rbattle, 验证手写面板挂上真内核战斗 —— 数字只从内核读、点招过回合掉血、KO 出结算。
// 版式权威 = docs/view/scene/battle/view-scene-battle-design.md §4 + docs/view/scene/battle/view-scene-battle-impl.md §5 契约表：
// 旧断言里的 .rbb-hud--player/enemy、.rbb-slot-*、7 平铺槽、常驻「无操作」卡都是**旧 IA**（设计 §1 的 S1/S2/S3 三条硬伤），
// 不能当护栏复用 ⇒ 按 impl §11 迁移表整件重写，并把「条宽随伤害下降」这种相对判据换成 `frac×260` 的绝对判据。
// 用法: node tools/rbattle-hudtest.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rb-hud.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const url = `${base}#/rbattle`
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rb-hud.png'

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable', headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })   // ⇒ scale 2、match 逻辑高恰 540（impl §12：布局类断言一律这个视口）
const errs = []
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message))
page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()) })

// U5 起 #/rbattle 会流式装载战斗舞台 SWF (背景 + 两宠)，networkidle 不再稳定收敛；
// 与所有 Ruffle 战斗台一致改用 domcontentloaded，真正的就绪门是下面的 waitForFunction('!!window.__battle')。
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
const have = await page.waitForFunction('!!window.__battle', { timeout: 30000 }).then(() => true).catch(() => false)
if (!have) { console.log('HUD 未挂载:', JSON.stringify(errs)); await browser.close(); process.exit(1) }
await page.waitForFunction(() => document.querySelector('.rbb-plate--my .rbb-hp-fill'), { timeout: 20000 }).catch(() => {})

const results = []
const A = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' })

// ── 面板结构 + 首帧读数（选择器 = impl §5 契约表）──
const init = await page.evaluate(() => {
  const d = window.__battle.driver
  const q = (s) => document.querySelector(s)
  const qa = (s) => [...document.querySelectorAll(s)]
  return {
    hasMyPlate: !!q('.rbb-plate--my'), hasOpPlate: !!q('.rbb-plate--op'),
    hasBar: !!q('.rbb-bottombar'), hasOptions: !!q('.rbb-options'), hasSkills: !!q('.rbb-skills'),
    hasRound: !!q('.rbb-round'), hasRecord: !!q('.rbb-record'), hasStateBuffs: !!q('.rbb-statebuffs'),
    legacy: qa('.rbb-hud, .rbb-slot-weather, .rbb-slot-record, .rbb-slot-skill, .rbb-slot-option, .rbb-weather, .rbb-picker').length,
    skillCards: qa('.rbb-skill[data-skill-id]').length,
    kernelCards: d.skillList().normals.filter(Boolean).length,
    noOpText: /无操作/.test(q('.rbb-skills')?.textContent ?? ''),
    tabs: qa('.rbb-option[data-mid]').length,
    enemyName: d.opPet().name, myName: d.myPet().name,
    enemyHp0: d.opPet().hp, myHp0: d.myPet().hp,
    recordLines: d.reports().length,
    hasEntrance: d.reports().some(r => /登场了/.test(r)),
  }
})
A('顶带两块血牌 + 底栏 + 页签簇 + 技能区就位',
  init.hasMyPlate && init.hasOpPlate && init.hasBar && init.hasOptions && init.hasSkills)
A('回合板 / 记录面板 / 全局 buff 区就位', init.hasRound && init.hasRecord && init.hasStateBuffs)
A('旧 IA 节点已绝迹（.rbb-hud/.rbb-slot-*/.rbb-weather/.rbb-picker）', init.legacy === 0, `n=${init.legacy}`)
A('技能卡数 == 内核 normals 非空槽数', init.skillCards === init.kernelCards && init.skillCards >= 1, `dom=${init.skillCards} kernel=${init.kernelCards}`)
A('「无操作」不再是技能卡（已搬家成绿圆钮）', !init.noOpText)
A('页签簇恰 5 张字标', init.tabs === 5, `n=${init.tabs}`)
A('首帧含登场战报', init.hasEntrance)

// 点第一颗可用普攻 → 过一回合 → 敌方内核 hp 变小、条宽按 frac×260 跟随
const click = await page.evaluate(() => {
  const d = window.__battle.driver
  const rv = document.getElementById('rv'), sc = rv.getBoundingClientRect().width / 960
  const wOf = () => { const f = document.querySelector('.rbb-plate--op .rbb-hp-fill'); return f ? Math.round(f.getBoundingClientRect().width / sc) : -1 }
  const before = d.opPet().hp, maxHp = d.opPet().maxHp, widthBefore = wOf()
  const btn = [...document.querySelectorAll('.rbb-skill[data-skill-id]')].find(b => !b.classList.contains('rbb-skill--off'))
  const id = btn?.dataset.skillId
  btn?.click()
  const after = d.opPet().hp
  return { before, after, maxHp, widthBefore, widthAfter: wOf(), wantAfter: Math.round(after / maxHp * 260), clicked: !!btn, id }
})
A('点击技能卡触发回合', click.clicked, `skillId=${click.id}`)
A('内核敌方 hp 下降', click.after < click.before, `${click.before}→${click.after}`)
A('敌方血条宽 == round(hp/maxHp×260)（掉血后仍是绝对判据）',
  Math.abs(click.widthAfter - click.wantAfter) <= 1 && click.widthAfter < click.widthBefore,
  `${click.widthBefore}px→${click.widthAfter}px (want ${click.wantAfter})`)

// 面板不自己算数：条宽 == round(hp/maxHp×260) ±1，两边同验。
const geom = await page.evaluate(() => {
  window.__battle.render()
  const d = window.__battle.driver
  const rv = document.getElementById('rv'), sc = rv.getBoundingClientRect().width / 960
  const px = (n) => Math.round(n.getBoundingClientRect().width / sc)
  const read = (side) => {
    const pet = side === 'my' ? d.myPet() : d.opPet()
    const f = document.querySelector(`.rbb-plate--${side} .rbb-hp-fill`)
    const a = document.querySelector(`.rbb-plate--${side} .rbb-anger-fill`)
    return {
      hp: pet.hp, maxHp: pet.maxHp, w: f ? px(f) : -1, want: Math.round(pet.hp / pet.maxHp * 260),
      anger: pet.anger, maxAnger: pet.maxAnger, aw: a ? px(a) : -1, awant: Math.round(pet.anger / pet.maxAnger * 246),
    }
  }
  return { my: read('my'), op: read('op') }
})
const close = (g) => Math.abs(g.w - g.want) <= 1 && Math.abs(g.aw - g.awant) <= 1
A('我方 HP 条宽 == round(hp/maxHp×260)（零算数复核）', close(geom.my), JSON.stringify(geom.my))
A('敌方 HP 条宽 == round(hp/maxHp×260)（掉血后仍成立）', close(geom.op), JSON.stringify(geom.op))
A('怒条宽 == round(anger/maxAnger×246)', close(geom.my) && close(geom.op), JSON.stringify([geom.my.aw, geom.my.awant, geom.op.aw, geom.op.awant]))
A('血条未越界（fill ≤ 轨长 260）', geom.my.w <= 260 && geom.op.w <= 260, `${geom.my.w}/${geom.op.w}`)

// Buff 网格：用会加印记的技能（脱力→物攻弱化），断言 DOM 的 buff 格数 == 内核 opPet().buffs 数。
const buff = await page.evaluate(() => {
  const d = window.__battle.driver
  const s = d.skillList().normals.map(n => n.skill).find(x => x.name === '脱力')
  if (!s) return { skipped: true, why: 'no 脱力' }
  window.__battle.act(s.id)
  const cells = document.querySelectorAll('.rbb-plate--op .rbb-buffs .rbb-buff').length
  return { cells, kernel: d.opPet().buffs.filter(b => !b.hide).length, names: d.opPet().buffs.map(b => b.name) }
})
A('Buff 网格随内核印记出现 (脱力→弱化)', buff.skipped ? false : (buff.cells >= 1 && buff.cells === buff.kernel), JSON.stringify(buff))

// 推到真 KO（跑真内核回合，不伪造 result），出结算
const fin = await page.evaluate(() => window.__battle.runUntilOver(60))
A('战斗能真结束 (isOver)', fin.over, `rounds=${fin.rounds} outcome=${fin.outcome}`)
const resultShown = await page.evaluate(() => !!document.querySelector('.rbb-result') || !!document.querySelector('.rb-box'))
A('结算视图弹出', resultShown)

await page.screenshot({ path: shot })
console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== HUD 判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
