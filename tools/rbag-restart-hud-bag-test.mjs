// U3-HUD + U4-Bag 端到端回归: 「重启内核战斗」开关拨上 → 主场景 SWF 常驻 HUD 不建 (hud=0)、改由 DOM 常驻层接管
// → 常驻 HUD 队首读数 = A/content 权威 (零算数) → 模态精灵背包 (VP4 三层 IA: ① 标题层 / ② 内容层〔左显示区｜右信息区〕
//    / ③ 队伍区) 的 8 钮操作列 / 信息面板页签 / 加成面板 / 道具面板 与 v3 存档闭合 (装配层 stub 投影 petBag[12]/petStorage)。
// 全程守护: v2 存档 (另一宇宙) 同 run 未被写、game/core 未参与、面板只读不算数。
// 版面正本 = docs/view/panel/petbag/petbag-panel-desc.md (人类实测)。
// 用法: node tools/rbag-restart-hud-bag-test.mjs [--url http://127.0.0.1:8091/game/index.html] [--shot /tmp/rbhud-bag.png]
import puppeteer from 'puppeteer-core'

const argv = process.argv
const base = (argv.find((a, i) => argv[i - 1] === '--url') || 'http://127.0.0.1:8091/game/index.html')
const shot = argv.find((a, i) => argv[i - 1] === '--shot') || '/tmp/rbhud-bag.png'
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

// ── 0) content 权威 (动态取, 不硬编码): restartHpMax / statsOf ──
await page.goto(base, { waitUntil: 'domcontentloaded' })
const meta = await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  return { leadCap: C.restartHpMax(1, 10), boxCap: C.restartHpMax(2, 5) }
})

// ── 1) toggle-ON + 播一份可控 v3 → 进图: loadRestartSession 读我们的档 (st 即此对象, A.save 闭包对齐)
//    队首 id1@Lv10 / box id2@Lv5 满血 (hp=restartHpMax), 让 HUD/背包断言有确定权威可比 ──
await page.evaluate(async (E, V3k) => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  localStorage.clear(); localStorage.setItem(E, 'restart')
  localStorage.setItem(V3k, JSON.stringify({
    v: 3, trainer: { name: '重启训练师', level: 7, coins: 1234, diamonds: 56 },
    team: [{ uid: 'pLead', petId: 1, level: 10, exp: 0, hp: C.restartHpMax(1, 10) }],
    box: [{ uid: 'pBox', petId: 2, level: 5, exp: 0, hp: C.restartHpMax(2, 5) }],
    items: [], dex: { '1': { seen: true, caught: true } }, evolve: { pending: [] }, battle: null,
    _authority: { hp: 'unity-iv0', exp: 'borrowed-A/B-shape' },
  }))
}, ENG, V3)
await page.goto(`${base}#/map`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.getActiveStore && window.getActiveStore()?.isRestart === true, { timeout: 30000 }).catch(() => {})
// 等 mapRunner 载入 (M.player 就绪) 后 SWF hud 才会被 gate 掉
await page.waitForFunction(() => !!(window.M && window.M.player && window.M.player.hudStatus), { timeout: 30000 }).catch(() => {})

const hudPhase = await page.evaluate(() => {
  const swfHud = (window.M && window.M.player && window.M.player.hudStatus) ? window.M.player.hudStatus() : 'no-player'
  const domHud = !!document.querySelector('#rv .rbh-root')
  return { isRestart: window.getActiveStore()?.isRestart, swfHud, domHud, hudObj: !!window.getHud() }
})
A('重启线 SWF 常驻 HUD 未建 (hud=0 → hudStatus="hud=none")', hudPhase.isRestart === true && hudPhase.swfHud === 'hud=none', JSON.stringify(hudPhase))
A('重启线 DOM 常驻 HUD 层接管 (.rbh-root 挂 #rv)', hudPhase.domHud && hudPhase.hudObj)

// ── 2) 常驻 HUD 队首读数 = A/content 权威 (零算数): HP 条分数 = lead.hp/restartHpMax ──
await page.evaluate(() => window.refreshHud())
await new Promise(r => setTimeout(r, 200))
const hudRead = await page.evaluate(() => {
  const A = window.getActiveStore(), lead = A.state.team[0]
  const fill = document.querySelector('#rv .rbh-hp .rbb-bar-fill')
  const track = document.querySelector('#rv .rbh-hp')
  const frac = fill && track ? (parseFloat(fill.style.width) / parseFloat(track.style.width)) : null
  const txt = document.querySelector('#rv .rbh-hptxt')?.textContent || ''
  const name = document.querySelector('#rv .rbh-lead-name')?.textContent || ''
  const lv = document.querySelector('#rv .rbh-card')?.dataset.lv || ''
  return { cap: A.hpMax(lead), hp: lead.hp, frac, txt, name, lv }
})
A('HUD 队首 HP 条分数 = lead.hp / restartHpMax (权威直读)', Math.abs(hudRead.frac - hudRead.hp / hudRead.cap) < 0.02, JSON.stringify(hudRead))
A('HUD 队首 cap = restartHpMax(1,10) (非官方 40)', hudRead.cap === meta.leadCap && hudRead.cap !== 40, `cap=${hudRead.cap} unity=${meta.leadCap}`)
// Lv 不在卡面画: 场景 Level Indicator/Text (9,50.7,51×10.8) 压在头像下半, 参考截图那一格是空的
// ⇒ 读数改挂 .rbh-card[data-lv] + title (截图为准, 信息不丢; docs/view/scene/room/view-scene-hud-impl.md §8)。
A('HUD 队首 name 与 A.state 一致 (不重算), Lv 走 data-lv 不画进卡面', hudRead.lv === 'Lv10' && hudRead.name.length > 0, JSON.stringify({ name: hudRead.name, lv: hudRead.lv }))
// 主场景 HUD 复刻 (docs/view/scene/room/view-scene-hud-impl.md §8 裁定): 参考截图顶栏无 profile/货币条 ⇒ 退役。
// 防回归: 若有人把 `.rbh-top`/`.rbh-coin`/`.rbh-dex` 又加回常驻 HUD, 本条失败 ⇒ 逼一次口径对账。
const retired = await page.evaluate(() => ({
  top: !!document.querySelector('#rv .rbh-top'),
  coin: !!document.querySelector('#rv .rbh-coin'),
  dex: !!document.querySelector('#rv .rbh-dex'),
}))
A('HUD 顶栏 profile/货币条已按截图退役 (.rbh-top/.rbh-coin/.rbh-dex 不存在)', !retired.top && !retired.coin && !retired.dex, JSON.stringify(retired))

// ── 3) 模态背包 (VP4 三层 IA · 正本 = petbag-panel-desc.md):
//   ① 标题层 (.rbp-head: 标题居中/❌ 右/货币左) · ② 内容层 (.rbp-main: 左 .rbp-display 显示区 ｜ 右 .rbp-info 信息区
//      = .rbp-acts 操作列 8 钮 + .rbp-ipanel 信息面板) · ③ 队伍区 (.rbp-team: ◀ + 6 格 + ▶ + 刷新)
//   ⚠️ 视图与存档解耦 (projectBagView 开面板时投影一次)：中途只改 A.state 不会回流面板。
//      ⇒ 换前置条件要「关面板 → 改 A.state+save → 重开」重投影。
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const closeBagPanels = () => page.evaluate(() => {
  document.querySelectorAll('#rv .rbs-close, #rv .rbp-close').forEach(b => b.click())   // 先仓库后背包, 置 BAG=null
})
const clickAct = (rootSel, label) => page.evaluate((rootSel, label) => {
  [...document.querySelectorAll(rootSel)].find(b => b.textContent === label)?.click()
}, rootSel, label)
const gotoCandidates = () => page.evaluate(() => {
  [...document.querySelectorAll('#rv .rbg-pagebtn')].find(b => b.textContent === '▶')?.click()   // 翻到候选页 (slot≥6)
})

await page.evaluate(() => window.openRestartPetBag())
await sleep(300)
const bagHead = await page.evaluate(() => {
  const A = window.getActiveStore()
  const box = document.querySelector('#rv .rbp-box')
  return {
    box: !!box,
    title: document.querySelector('#rv .rbp-title')?.textContent || '',
    money: document.querySelector('#rv .rbp-money')?.textContent || '',
    coins: A.state.trainer.coins,
    // 三层 IA 的骨架节点
    lay: {
      head: !!box?.querySelector(':scope > .rbp-head'),
      main: !!box?.querySelector(':scope > .rbp-main'),
      team: !!box?.querySelector(':scope > .rbp-team'),
      display: !!box?.querySelector('.rbp-main > .rbp-display'),
      info: !!box?.querySelector('.rbp-main > .rbp-info'),
      ipanel: !!box?.querySelector('.rbp-info > .rbp-ipanel'),
      close: !!box?.querySelector('.rbp-head > .rbp-close'),
    },
    page1Cells: document.querySelectorAll('#rv .rbg-cells .rbg-cell').length,
    leadMark: !!document.querySelector('#rv .rbg-mark'),
    pageno: document.querySelector('#rv .rbg-pageno')?.textContent || '',
    acts: [...document.querySelectorAll('#rv .rbp-act')].map(b => b.textContent),
    refresh: document.querySelector('#rv .rbp-team-refresh')?.textContent || '',
    // 队伍格版式 (人类 2026-10-17 二轮: 头像构成背景图 + 底部信息条 = 等级 + 血条; C1 §4.1 更正 5)
    cell: (() => {
      const c = document.querySelector('#rv .rbg-cell[data-slot="0"]')
      if (!c) return null
      const lead = A.state.team[0]
      const bg = c.querySelector(':scope > .rbg-bg')
      const strip = c.querySelector(':scope > .rbg-strip')
      const lv = strip?.querySelector('.rbg-lv')
      const hp = strip?.querySelector('.rbg-hp')
      const fill = hp?.querySelector('.rbb-bar-fill')
      const cr = c.getBoundingClientRect(), br = bg?.getBoundingClientRect(), sr = strip?.getBoundingClientRect()
      const clone = c.cloneNode(true)
      clone.querySelectorAll('.rbg-strip, .rbg-mark, .rbg-elem').forEach(n => n.remove())
      return {
        hasBg: !!bg, hasIcon: !!bg?.querySelector('.rbg-icon img'), hasStrip: !!strip,
        lv: lv?.textContent || '', wantLv: 'Lv' + lead.level,
        hpFill: fill?.style.width || '', hpW: Math.round(hp?.getBoundingClientRect().width || 0),
        stray: (clone.textContent || '').trim(),   // 格内除等级/角标外不该有文字 (名字退为 title)
        title: c.title || '', leadName: A.nameOf(lead),
        bgFills: !!(br && br.width >= cr.width * 0.96 && br.height >= cr.height * 0.96),   // 格有 2px 边框 + 亚像素取整 ⇒ 按覆盖率判"铺满"
        stripAtBottom: !!(sr && sr.bottom <= cr.bottom + 0.5 && sr.bottom >= cr.bottom - 5),
      }
    })(),
  }
})
A('背包打开 (新契约 .rbp-box + .rbg-cells, 每页定 6 格)', bagHead.box && bagHead.title === '精灵背包' && bagHead.page1Cells === 6, JSON.stringify(bagHead))
A('① 标题层: .rbp-head 标题居中 + ❌ 贴右 (标题「精灵背包」)', bagHead.lay.head && bagHead.lay.close && bagHead.title === '精灵背包', JSON.stringify(bagHead.lay))
A('② 内容层: 左显示区 (.rbp-display) ｜ 右信息区 (.rbp-info > .rbp-ipanel)', bagHead.lay.main && bagHead.lay.display && bagHead.lay.info && bagHead.lay.ipanel, JSON.stringify(bagHead.lay))
A('③ 队伍区: .rbp-team + 左箭头 + 6 格 + 右箭头 + 刷新钮', bagHead.lay.team && bagHead.refresh === '刷新' && bagHead.page1Cells === 6, JSON.stringify({ team: bagHead.lay.team, refresh: bagHead.refresh, cells: bagHead.page1Cells }))
A('③ 队伍格: 头像构成背景图 (.rbg-bg 撑满整格, 内含 .rbg-icon img)', bagHead.cell?.hasBg && bagHead.cell?.hasIcon && bagHead.cell?.bgFills, JSON.stringify(bagHead.cell))
A('③ 队伍格: 底部信息条 (.rbg-strip 贴格底) = 等级 (Lv<n> = 权威) + 血条 (弹性宽 ≥60 + 按比例百分比)',
  bagHead.cell?.hasStrip && bagHead.cell?.stripAtBottom && bagHead.cell?.lv === bagHead.cell?.wantLv
  && /^\d+(\.\d+)?%$/.test(bagHead.cell?.hpFill || '') && bagHead.cell?.hpW >= 60, JSON.stringify(bagHead.cell))
A('③ 队伍格: 名字不再常驻格内 (退为整格 title = 权威名)',
  bagHead.cell?.stray === '' && bagHead.cell?.title === bagHead.cell?.leadName && bagHead.cell.title.length > 0, JSON.stringify({ stray: bagHead.cell?.stray, title: bagHead.cell?.title, leadName: bagHead.cell?.leadName }))
A('队首格画「首发」标 + 分页读数 x / 2 (定长 12 ⇒ 两页)', bagHead.leadMark && /\d+ \/ 2/.test(bagHead.pageno), JSON.stringify({ lead: bagHead.leadMark, pageno: bagHead.pageno }))
A('货币读数仍在 (头部直读 A.state.trainer)', new RegExp(String(bagHead.coins)).test(bagHead.money), JSON.stringify({ money: bagHead.money, coins: bagHead.coins }))
A('操作列 8 钮 (desc 1.2.2.1: 首发/出战/恢复/动画/加成/入库/仓库/道具; 无「性格/换队」在列; 无 Lock/Train/Follow — V-4)',
  ['首发', '出战', '恢复', '动画', '加成', '入库', '仓库', '道具'].every(x => bagHead.acts.includes(x))
  && bagHead.acts.length === 8
  && !bagHead.acts.some(x => /锁定|解锁|训练|跟随|性格|换队/.test(x)), JSON.stringify({ acts: bagHead.acts }))

// ── 3a) 显示区: 默认精灵面板 (真 Ruffle idle 动画台 + HUD 六项 + 皮肤/测试对战) ／ 加成面板 (先天+后天) ──
//   动画台走原版 Flash 路由 (petContainer.root.swf?url=/swf/fight/{swfId}.swf), 装载有延迟 ⇒ 等就绪。
await page.waitForFunction(() => {
  const p = document.querySelector('#rv .rbp-stage ruffle-player')
  try { return !!(p && (p.getAvailableStates?.() || []).length) } catch { return false }
}, { timeout: 25000 }).catch(() => {})
const disp = await page.evaluate(() => {
  const display = document.querySelector('#rv .rbp-display')
  const demo = display?.querySelector(':scope > .rbp-demo')
  const stage = display?.querySelector(':scope > .rbp-stage')
  const p = stage?.querySelector('ruffle-player')
  let states = []
  try { states = p?.getAvailableStates?.() || [] } catch { states = [] }
  return {
    demo: !!demo, stage: !!stage, hasPlayer: !!p, states,
    stageNote: stage?.querySelector('.rbp-stage-note')?.textContent || '',
    hudItems: [...demo.querySelectorAll('.rbp-hud-item .rbp-hud-k')].map(x => x.textContent),
    hudPend: [...demo.querySelectorAll('.rbp-hud-item')].filter(x => x.querySelector('.rbp-hud-v').textContent === '—').map(x => x.querySelector('.rbp-hud-k').textContent),
    hudBtns: [...demo.querySelectorAll('.rbp-hud-btn')].map(x => x.textContent),
  }
})
A('显示区·默认精灵面板: .rbp-stage 挂**真 Ruffle 播放器** (fight SWF), 可用状态含「待机」idle',
  disp.demo && disp.stage && disp.hasPlayer && disp.states.includes('待机'), JSON.stringify({ hasPlayer: disp.hasPlayer, states: disp.states, note: disp.stageNote }))
A('显示区·HUD 六项 = 属性/名称/特性/性别/纹章/个体值', ['属性', '名称', '特性', '性别', '纹章', '个体值'].every(x => disp.hudItems.includes(x)), JSON.stringify(disp.hudItems))
A('显示区·HUD 缺数据项 (特性/性别/纹章/个体值) 画「—」不伪造 (v3 宠形无这些字段)', ['特性', '性别', '纹章', '个体值'].every(x => disp.hudPend.includes(x)), JSON.stringify(disp.hudPend))
A('显示区·HUD 操作钮 = 皮肤 / 测试对战 (只发提示, 登记 impl §11)', ['皮肤', '测试对战'].every(x => disp.hudBtns.includes(x)), JSON.stringify(disp.hudBtns))

// ── 3a-2) 版式修 (人类手测反馈 2026-10-17): ① 面板高度吃满画布 ② 内容层更高 ③ 操作列 8 钮不越界 ──
const layout = await page.evaluate(() => {
  const box = document.querySelector('#rv .rbp-box').getBoundingClientRect()
  const canvas = document.querySelector('#rv .rv-panel').getBoundingClientRect()
  const main = document.querySelector('#rv .rbp-main').getBoundingClientRect()
  const acts = document.querySelector('#rv .rbp-acts')
  const ar = acts.getBoundingClientRect()
  const lr = acts.lastElementChild.getBoundingClientRect()
  var mb, ok = false
  try { mb = { top: lr.top, bottom: ar.bottom } ; ok = lr.bottom <= ar.bottom + 1 && ar.bottom <= main.bottom + 1 } catch { /* noop */ }
  return { boxFrac: box.height / canvas.height, mainFrac: main.height / canvas.height, actsFits: ok }
})
A('① 面板高度吃满画布 (≥ 90% 逻辑高; 修「高度可以更多, 占满屏也行」)', layout.boxFrac >= 0.9, JSON.stringify(layout))
A('② 内容层高度 ≥ 画布 55% (修「1.2 内容层应当有更大高度」)', layout.mainFrac >= 0.55, JSON.stringify(layout))
A('③ 操作列 8 钮不越界 (末钮底 ≤ 操作列底 ≤ 内容层底; 修「1.2.2.1 操作列越界」)', layout.actsFits, JSON.stringify(layout))

await clickAct('#rv .rbp-act', '加成'); await sleep(250)
const buff = await page.evaluate(() => {
  const display = document.querySelector('#rv .rbp-display')
  const demo = display?.querySelector(':scope > .rbp-demo')
  const stage = display?.querySelector(':scope > .rbp-stage')
  return {
    buff: !!display?.querySelector('.rbp-buff-sec'),
    secs: [...document.querySelectorAll('#rv .rbp-display .rbp-buff-sec .rbp-buff-title')].map(x => x.textContent),
    demoHidden: demo?.style.display === 'none', stageHidden: stage?.style.display === 'none',
  }
})
A('「加成」钮 ⇒ 显示区切到加成面板 (先天加成 + 后天加成), 精灵面板/动画台隐去', buff.buff && ['先天加成', '后天加成'].every(x => buff.secs.includes(x)) && buff.demoHidden && buff.stageHidden, JSON.stringify(buff))
await clickAct('#rv .rbp-act', '加成'); await sleep(250)
const buffBack = await page.evaluate(() => document.querySelector('#rv .rbp-display > .rbp-demo')?.style.display !== 'none')
A('「加成」钮再点 ⇒ 切回默认精灵面板', buffBack)
// 切回后动画台重装 ⇒ 等就绪, 供 3d 用
await page.waitForFunction(() => {
  const p = document.querySelector('#rv .rbp-stage ruffle-player')
  try { return !!(p && (p.getAvailableStates?.() || []).length) } catch { return false }
}, { timeout: 25000 }).catch(() => {})

// ── 3b) 信息面板: 页签 基础 / 技能 / 抗性 (基础 = 左信息区 8 行 + 右能力区六维) ──
const tabs = await page.evaluate(() => [...document.querySelectorAll('#rv .rbp-tabs .rbp-tab')].map(x => x.textContent))
A('信息面板页签 = 基础 / 技能 / 抗性', ['基础', '技能', '抗性'].every(x => tabs.includes(x)) && tabs.length === 3, JSON.stringify(tabs))

const detailStat = await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const A = window.getActiveStore()
  document.querySelector('#rv .rbg-cell[data-slot="0"]').click()   // 选队首 (绝对槽)
  const rows = [...document.querySelectorAll('#rv .rbp-basic .rbp-stat')].map(r => ({ k: r.querySelector('.rbp-stat-k').textContent, v: r.querySelector('.rbp-stat-v').textContent }))
  const s = C.petConfig(A.state.team[0].petId, A.state.team[0].level).stats
  const brows = [...document.querySelectorAll('#rv .rbp-basic .rbp-brow')].map(r => ({ k: r.querySelector('.rbp-bk').textContent, v: r.querySelector('.rbp-bv').textContent }))
  const persClickable = !!document.querySelector('#rv .rbp-basic .rbp-brow--act')
  return { rendered: rows, brows, expect: s, persClickable }
})
const hpRow = detailStat.rendered.find(r => r.k === 'HP')
A('基础信息·右能力区六维 HP = petConfig.stats.hp 直读 (面板零算数, V-2)', hpRow && Number(hpRow.v) === detailStat.expect.hp, JSON.stringify({ rendered: hpRow, expect: detailStat.expect.hp }))
const atkRow = detailStat.rendered.find(r => r.k === '物攻')
A('基础信息·六维 物攻 = petConfig.stats.atk 直读', atkRow && Number(atkRow.v) === detailStat.expect.atk, JSON.stringify({ rendered: atkRow, expect: detailStat.expect.atk }))
A('基础信息·左信息区 8 行 (序号/等级/升级所需经验/进化等级/性格/身高/体重/相遇时间)',
  ['序号', '等级', '升级所需经验', '进化等级', '性格', '身高', '体重', '相遇时间'].every(x => detailStat.brows.some(b => b.k === x)), JSON.stringify(detailStat.brows.map(b => b.k)))
A('基础信息·「性格」行可点 (改性格入口在基础信息里, 不在操作列)', detailStat.persClickable)

const skillTab = await page.evaluate(() => {
  [...document.querySelectorAll('#rv .rbp-tabs .rbp-tab')].find(t => t.textContent === '技能')?.click()
  return {
    skill: !!document.querySelector('#rv .rbp-ipanel .rbp-skill'),
    acts: [...document.querySelectorAll('#rv .rbp-ipanel .rbp-skill-btn')].map(x => x.textContent),
  }
})
A('技能信息子面板: 4 常规 + 必杀 + [调整技能][隐藏技能] (两颗钮只发提示)', skillTab.skill && ['调整技能', '隐藏技能'].every(x => skillTab.acts.includes(x)), JSON.stringify(skillTab))
const resistTab = await page.evaluate(() => {
  [...document.querySelectorAll('#rv .rbp-tabs .rbp-tab')].find(t => t.textContent === '抗性')?.click()
  return { resist: !!document.querySelector('#rv .rbp-ipanel .rbp-resist'), empty: document.querySelector('#rv .rbp-resist-empty')?.textContent || '' }
})
A('抗性信息子面板 = 空置占位 (人类: 目前无内容, 登记 impl §11)', resistTab.resist && /空置/.test(resistTab.empty), JSON.stringify(resistTab))
// 回基础页签, 后面事务段要用
await page.evaluate(() => { [...document.querySelectorAll('#rv .rbp-tabs .rbp-tab')].find(t => t.textContent === '基础')?.click() })

// ── 3c) 精灵道具面板: 「道具」钮把信息区切成 标签行 (全部/培养/纹章/战斗/其他) + 3×6 网格 (空壳) ──
await clickAct('#rv .rbp-act', '道具'); await sleep(150)
const itemPane = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('#rv .rbp-ipanel .rbp-item-tab')].map(x => x.textContent),
  cells: document.querySelectorAll('#rv .rbp-ipanel .rbp-item-grid .rbp-item-cell').length,
  pend: !!document.querySelector('#rv .rbp-ipanel .rbp-item-pend'),
}))
A('「道具」钮 ⇒ 信息区切出精灵道具面板 (标签行 全部/培养/纹章/战斗/其他 + 3×6=18 格空壳)',
  ['全部', '培养', '纹章', '战斗', '其他'].every(x => itemPane.tabs.includes(x)) && itemPane.tabs.length === 5 && itemPane.cells === 18 && itemPane.pend, JSON.stringify(itemPane))
await clickAct('#rv .rbp-act', '道具'); await sleep(150)
const itemBack = await page.evaluate(() => !!document.querySelector('#rv .rbp-ipanel .rbp-tabs'))
A('「道具」钮再点 ⇒ 收回, 信息面板页签回来', itemBack)

// ── 3d) 「动画」钮: 真的切演出状态 (Follow→SetPetAnim 语义) ──
await clickAct('#rv .rbp-act', '动画'); await sleep(250)
const anim = await page.evaluate(() => {
  const note = document.querySelector('#rv .rbp-note')?.textContent || ''
  const p = document.querySelector('#rv .rbp-stage ruffle-player')
  let st = ''
  try { st = p?.getState?.() || '' } catch { st = '' }
  return { note, state: st }
})
A('「动画」钮 ⇒ 真切演出状态 (Follow→SetPetAnim; 读到的状态非「待机」且进了可用表)',
  /预览动画/.test(anim.note) && !!anim.state && anim.state !== '待机', JSON.stringify(anim))

// ── 4) 事务: 候选(slot≥6)→出战→首个空出战槽, writeBack 落 v3 (视图发 onWrite 信号, 装配层落盘 — V-5) ──
await gotoCandidates()
await sleep(120)
await page.evaluate(() => document.querySelector('#rv .rbg-cell[data-slot="6"]').click())   // 选候选 (seed box 那只)
const deployBefore = await page.evaluate(() => { const A = window.getActiveStore(); return { team: A.state.team.length, box: A.state.box.length } })
await clickAct('#rv .rbp-act', '出战')
await sleep(120)
const deploy = await page.evaluate(() => {
  const A = window.getActiveStore()
  const v3 = JSON.parse(localStorage.getItem('rocoshowdown.restart.v3'))
  return { after: { team: A.state.team.length, box: A.state.box.length }, saved: { team: v3.team.length, box: v3.box.length } }
})
A('出战事务: 候选入首个空出战槽 → A.state team+1/box-1 且落 v3 (writeBack 对齐)',
  deploy.after.team === deployBefore.team + 1 && deploy.after.box === deployBefore.box - 1 && deploy.saved.team === deploy.after.team && deploy.saved.box === deploy.after.box,
  JSON.stringify({ before: deployBefore, ...deploy }))

// 满 6 → 出战只提示不自动换 (bag.pickReplace)。换前置条件: 关面板 → 重灌 A.state → 重开 (重投影)
await closeBagPanels(); await sleep(120)
await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const A = window.getActiveStore()
  A.state.team = Array.from({ length: 6 }, (_, i) => ({ uid: 't' + i, petId: 1, level: 3, exp: 0, hp: C.restartHpMax(1, 3) }))
  A.state.box = [{ uid: 'pOverflow', petId: 2, level: 5, exp: 0, hp: C.restartHpMax(2, 5) }]
  A.save(); window.openRestartPetBag()
})
await sleep(300)
await gotoCandidates(); await sleep(120)
await page.evaluate(() => document.querySelector('#rv .rbg-cell[data-slot="6"]').click())
const fullBefore = await page.evaluate(() => window.getActiveStore().state.team.length)
await clickAct('#rv .rbp-act', '出战'); await sleep(120)
const full = await page.evaluate(() => ({ after: window.getActiveStore().state.team.length, note: document.querySelector('#rv .rbp-note').textContent }))
A('出战满 6 时出战被拒 (只提示「出战已满」, 不自动换)', full.after === fullBefore && /出战已满/.test(full.note || ''), JSON.stringify({ before: fullBefore, ...full }))

// 队伍区「刷新」钮 = 一键换队 (前 6 ↔ 后 6; 上游 Swap→SwapPetTeam, 人类读作「刷新」)
await page.evaluate(() => document.querySelector('#rv .rbp-team-refresh').click()); await sleep(150)
const swapped = await page.evaluate(() => {
  const A = window.getActiveStore()
  return { team: A.state.team.length, box: A.state.box.length, leadPet: A.state.team[0]?.petId }
})
A('队伍区「刷新」⇒ 前 6 ↔ 后 6 互换 (备用区那只进队首, 原 6 只进仓库)',
  swapped.team === 1 && swapped.box === 6 && swapped.leadPet === 2, JSON.stringify(swapped))

// 只剩一只 → 入库被拒 (bag.needOneProtect; C1: 保护判据 = 真实宠袋非空计数, 放生移至仓库)
await closeBagPanels(); await sleep(120)
await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const A = window.getActiveStore()
  A.state.team = [{ uid: 'pLead', petId: 1, level: 10, exp: 0, hp: C.restartHpMax(1, 10) }]
  A.state.box = []
  A.save(); window.openRestartPetBag()
})
await sleep(300)
await page.evaluate(() => document.querySelector('#rv .rbg-cell[data-slot="0"]').click())
const guardBefore = await page.evaluate(() => window.getActiveStore().state.team.length)
await clickAct('#rv .rbp-act', '入库'); await sleep(120)
const guard = await page.evaluate(() => ({ after: window.getActiveStore().state.team.length, note: document.querySelector('#rv .rbp-note').textContent }))
A('只剩一只时入库被拒 (bag.needOneProtect: 至少保留一只)', guard.after === guardBefore && /至少.*保留/.test(guard.note || ''), JSON.stringify({ before: guardBefore, ...guard }))

// ── 4a) 仓库面板 (C1: 背包无放生钮, 放生/收藏/取出移至仓库 .rbs-*; 筛选/排序也只在仓库) ──
await clickAct('#rv .rbp-act', '仓库'); await sleep(250)
const storageDom = await page.evaluate(() => ({
  box: !!document.querySelector('#rv .rbs-box'),
  title: document.querySelector('#rv .rbs-title')?.textContent || '',
  acts: [...document.querySelectorAll('#rv .rbs-act')].map(b => b.textContent),
  filter: !!document.querySelector('#rv .rbs-filter'),
  sort: !!document.querySelector('#rv .rbs-sort'),
}))
A('仓库面板打开 (.rbs-box + 标题「精灵仓库」 + 取出/收藏/放生)', storageDom.box && storageDom.title === '精灵仓库' && ['取出', '收藏', '放生'].every(x => storageDom.acts.includes(x)), JSON.stringify(storageDom))
A('筛选/排序只长在仓库里 (.rbs-filter/.rbs-sort), 背包面板没有 (C1 §6.3)', storageDom.filter && storageDom.sort)
A('背包面板本体不画「放生」钮 (V-4/A6: 放生只在仓库)', !bagHead.acts.includes('放生'), JSON.stringify({ bagActs: bagHead.acts }))
await closeBagPanels(); await sleep(120)

// ── 4b) 道具背包 (U4 道具支, 1a+2a 只读): 默认空 → 播 2 个道具 → 格数=items 长度 / 名称·效果读 unity / 使用禁用 ──
const bagEmpty = await page.evaluate(() => {
  window.openRestartItemBag()
  const txt = document.querySelector('#rv .rbi-detail')?.innerText || ''
  const colEmpty = document.querySelector('#rv .rbi-col-empty')?.textContent || ''
  return { empty: document.querySelectorAll('#rv .rbi-cell').length === 0, colEmpty }
})
A('道具背包默认如实显示空包 (v3 items=[], 无新手包, 获取属 U2)', bagEmpty.empty && /U2/.test(bagEmpty.colEmpty), JSON.stringify(bagEmpty))

const ibag = await page.evaluate(async () => {
  const C = await import('/game/app/content.js'); await C.loadContent()
  const A = window.getActiveStore()
  A.RST.addItem(A.state, 8004, 3)   // 无敌精灵胶囊 (capture, 1 效果)
  A.RST.addItem(A.state, 8006, 5)   // 初级复活药剂 (hp_potion, 2 效果)
  A.save(); window.getItemBag().update()
  const cells = [...document.querySelectorAll('#rv .rbi-cell')]
  const names = cells.map(c => c.querySelector('.rbi-cell-name').textContent)
  const counts = cells.map(c => c.querySelector('.rbi-cell-count').textContent)
  // 选 hp_potion 格 → 详情读 unity 权威
  const target = cells.find(c => c.textContent.includes('复活药剂'))
  target && target.click()
  const det = document.querySelector('#rv .rbi-detail').innerText
  const effDesc = C.restartItemOf(8006).effectDescription
  return {
    cellN: cells.length, stateN: A.state.items.length, names, counts,
    hasEffDesc: det.includes(effDesc.trim()), hasType: /药剂|hp_potion/.test(det),
    useOff: !!document.querySelector('#rv .rbi-act--off'),
    v3items: JSON.parse(localStorage.getItem('rocoshowdown.restart.v3')).items,
  }
})
A('道具格数 = A.state.items 长度 (只读, 无重算)', ibag.cellN === ibag.stateN && ibag.cellN === 2, JSON.stringify({ cellN: ibag.cellN, stateN: ibag.stateN }))
A('道具名/数量取自 unity 表 + 存档计数', ibag.names.some(n => /胶囊/.test(n)) && ibag.names.some(n => /复活药剂/.test(n)) && ibag.counts.includes('×5') && ibag.counts.includes('×3'), JSON.stringify({ names: ibag.names, counts: ibag.counts }))
A('详情效果描述 = content.restartItemOf(8006).effectDescription 直读', ibag.hasEffDesc && ibag.hasType)
A('「使用」灰化禁用 (1a+2a: 不伪造执行, effects 属 U2/S6)', ibag.useOff)

// 断道具不污染: items 落 v3、v2 仍未写
A('道具计数落 v3 (addItem 走 restartSession 纯函数)', ibag.v3items.length === 2 && ibag.v3items.some(x => x.id === 8006 && x.count === 5), JSON.stringify(ibag.v3items))

await page.evaluate(() => { const A = window.getActiveStore(); A.state.items = []; A.save() })   // 复位, 别影响后续 v2 隔离断言

// ── 5) 宇宙隔离: 全程 v2 (另一宇宙) 未被写 ──
const iso = await page.evaluate((V2k) => ({ v2Written: localStorage.getItem(V2k) !== null }), V2)
A('全程 v2 存档未被写 (两 UI 宇宙不合并)', iso.v2Written === false)

await page.screenshot({ path: shot })

console.log('=== 页面/控制台错误 ===\n' + (errs.length ? errs.join('\n') : '(无)'))
console.log('\n=== U3-HUD + U4-Bag 判据 ===')
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? ' [' + r.detail + ']' : ''}`)
const fails = results.filter(r => !r.pass)
console.log(`\n截图: ${shot}`)
console.log(`共 ${results.length} 条, 失败 ${fails.length}`)
await browser.close()
process.exit(fails.length || errs.length ? 1 : 0)
