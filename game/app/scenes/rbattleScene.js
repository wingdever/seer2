// #/rbattle —— 重启血统战斗场景 (U1)。读 game/core/** 内核 + 重启 unity 表 + 手写 DOM。
// ⚠️ **单血统（编排线 ORP3，人类 2026-10-18）**：v2 官方线 / AS3 战斗线废弃 ⇒ 主流程（地图遇怪）**恒**路由到这里，
//    活跃档 = `saves/save{gid}.xml`（会话 `game/app/session.js`）。`#/battle`（AS3/v2）仍在但已无路由入口（见 impl §7 偏差 1）。
//
// 两种模式 (同一场景, 靠 query 分流, 各自独立整页加载 → 不共享内核单例, 无跨战斗污染):
//   #/rbattle?selftest=1  —— STEP0/1 回归台: 无头跑两局内核战斗, 判据写 #log, 留 window.__rbattle 给 puppeteer。
//   #/rbattle             —— U1 交互 HUD: 手写面板挂 driver.onRender, 数字全读内核, window.__battle 供驱动/测。
import { createCoreBattle } from '../battle/driver/coreBattleDriver.js'
import { loadContent } from '../content.js'
import * as CONTENT from '../content.js'
import { APP } from '../state.js'
// ⚠️ **只用点名 import**（2026-10-18 踩过两次）：`session` 对象只装**字段**，动作全是**并列的模块导出函数**。
//    `import * as session` 在这里**读不到对象字段** —— 命名空间的 `session.active` 是那个**同名导出函数**
//    `export const active = () => session.active`（已删），于是 `session.active.state` 恒 `undefined` ⇒
//    "Cannot read properties of undefined (reading 'team')" 黑屏。规矩：字段走 `session.*`（点名 import 对象），
//    动作走点名的函数（`ensureLoaded`/`adopt`/…）。
import { session, ensureLoaded } from '../session.js'
import { openPanel, closePanel, setCanvasMode, getCanvasInfo } from '../view/panels/host.js'
import { openHintbox } from '../view/panels/hintbox.js'
import { el, anch } from '../view/panels/battle/_kit.js'
import * as RESTART_STAGE from '../view/battle/restartFighterStage.js'
// 战斗 HUD 复刻（docs/view/scene/battle/view-scene-battle-design.md 版式 + docs/view/scene/battle/view-scene-battle-impl.md 施工图）：
// 顶带（血牌/回合板/buff 网格）+ 底栏（页签簇 + 互斥内容页）+ 记录面板。旧的六槽近似布局已退役。
import * as FIGHT_PLATE from '../view/panels/battle/fightPlateView.js'
import * as ROUND_PLATE from '../view/panels/battle/roundPlateView.js'
import * as BUFF_GRID from '../view/panels/battle/buffGridView.js'
import * as BOTTOM_BAR from '../view/panels/battle/bottomBarView.js'
import * as SKILL_CARD from '../view/panels/battle/skillCardView.js'
import * as PET_CHANGE from '../view/panels/battle/petChangeView.js'
import * as ITEM_BOARD from '../view/panels/battle/itemBoardView.js'
import * as RECORD_PANEL from '../view/panels/battle/recordPanelView.js'
import * as resultView from '../view/panels/battle/resultView.js'

let panelEntry = null
let offRender = null
let STAGE = null
// 回图时要带的 hash 参数（`{slot, map?, spawn?}`）——由 `mountHud` 按本次战斗的上下文填；`null` ⇒ 裸 `#/map`（demo/自测分支）。
let retParams = null

// ───────────────────────── selftest 模式 (STEP 0/1) ─────────────────────────
function mkTrace() {
  const trace = []
  const ok = (name, cond, detail) => { trace.push({ name, pass: !!cond, detail: detail ?? '' }); return !!cond }
  return { trace, ok }
}

async function selfTestNoop() {
  const { trace, ok } = mkTrace()
  let threw = null, d
  try { d = await createCoreBattle({ masterPetId: 1, clientPetId: 2, level: 100, seed: 7 }) } catch (e) { threw = e }
  ok('开局不抛', threw === null, threw ? String(threw.message).slice(0, 200) : '')
  if (threw) return { trace, threw }
  const hp0M = d.myPet().hp, hp0C = d.opPet().hp, turn0 = d.turn()
  try { d.nextRound(); d.nextRound() } catch (e) { threw = e }
  ok('两回合无 NOT_PORTED', threw === null, threw ? String(threw.message).slice(0, 200) : '')
  const rep = d.reports().join('\n')
  ok('两条登场战报各一次', (rep.match(/我方.*登场了/g) || []).length === 1 && (rep.match(/敌方.*登场了/g) || []).length === 1, '')
  // ⚠️ 敌方会自己出招（Battle.cs:361-380 的默认技）, 所以「我方无操作」只该保证**敌方不掉血**,
  //   我方掉血才是正确表现 —— 旧断言写的是「双方都不变」, 那是在敌方恒不出招时的事实, 已随本批失效。
  ok('我方无操作 ⇒ 敌方不掉血', d.opPet().hp === hp0C, `${hp0C}→${d.opPet().hp}`)
  ok('敌方自动出招 ⇒ 我方掉血', d.myPet().hp < hp0M, `${hp0M}→${d.myPet().hp}`)
  ok('turn 单调增', d.turn() > turn0, `${turn0}→${d.turn()}`)
  ok('未结束', !d.isOver(), '')
  return { trace, threw }
}

async function selfTestDamage() {
  const { trace, ok } = mkTrace()
  let threw = null, d
  try { d = await createCoreBattle({ masterPetId: 1, clientPetId: 2, level: 100, seed: 7 }) } catch (e) { threw = e }
  ok('开局不抛', threw === null, threw ? String(threw.message).slice(0, 200) : '')
  if (threw) return { trace, threw }
  const skills = d.availableSkills()
  ok('availableSkills ≥ 1', skills.length >= 1, `n=${skills.length}`)
  const dmg = skills.find(s => (s.power ?? 0) > 0) || null
  ok('存在威力>0 的普攻', dmg !== null, dmg ? `${dmg.name}(id=${dmg.id}) power=${dmg.power}` : '')
  if (!dmg) return { trace, threw }
  let prev = d.opPet().hp, strictDrop = true, dropRounds = 0
  for (let i = 0; i < 6 && !d.isOver(); i++) {
    d.selectSkill(dmg.id)
    try { d.nextRound() } catch (e) { threw = e; break }
    const now = d.opPet().hp
    if (now < prev) { dropRounds++ } else if (now > prev) { strictDrop = false }
    prev = now
  }
  ok('回合内无非真伤抛', threw === null, threw ? String(threw.message).slice(0, 200) : '')
  ok('敌方 hp 有下降回合', dropRounds >= 1, `dropRounds=${dropRounds}`)
  ok('敌方 hp 从未回升', strictDrop, '')
  ok('战报出现伤害行', /[伤傷]害/.test(d.reports().join('\n')), '')
  return { trace, threw }
}

async function mountSelftest() {
  await loadContent()
  const w = window
  w.__rbattle = { ready: false, noop: null, damage: null, error: null }
  try {
    w.__rbattle.noop = await selfTestNoop()
    w.__rbattle.damage = await selfTestDamage()
  } catch (e) { w.__rbattle.error = String(e && e.message || e) }
  w.__rbattle.ready = true
  // 打印台已取消（需求：改用浏览器 console），selftest 战报改走 console.log
  {
    const dump = (t) => (t ? t.trace.map(a => `  ${a.pass ? '✓' : '✗'} ${a.name}${a.detail ? ' [' + a.detail + ']' : ''}`).join('\n') : '  (未跑)')
    console.log(`==== STEP0 no-op ====\n${dump(w.__rbattle.noop)}\n==== STEP1 damage ====\n${dump(w.__rbattle.damage)}\n`)
  }
}

// ───────────────────────── 交互 HUD 模式 (STEP 2-8) ─────────────────────────
// 版式 = Fight.unity 那套全屏场景：顶带 (0..110) + 底栏 (425..540) + 中间留给舞台精灵。
// 几何一律走各 view 模块的设计盒（anch() 内联），场景只叠层与接线，不摆第二个坐标。

// 战报增量 → clip 动作序列 (重启内核整回合同步、无逐动作事件流, 故从 reports 新行反推; 措辞见 core/phase.ts)。
// 返回 [{side:'my'|'op', kind}], kind ∈ stage 的 CHAIN 键。登场行进 present, 不入序列; 倒/胜走 state 数值判定。
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '')
// damages = 驱动层给的伤害飘字事件（docs/view/scene/battle/view-scene-battle-stage.md §9.6 DB1）。
// 一次出手在内核里产**恰好一条**事件，战报里也产**恰好一行**（命中⇒「對…造成了…」／没命中⇒「但是没有命中…」），
// 且两者都按出手先后排列 ⇒ 同序 zip 即可把飘字挂到对应的「被击」动作上。
// 演出序列 = **一次行动一条**（人类 2026-10-19「一次行动一次行动地演出，每次行动之间独立」）。
//
// 一次行动的演出（自包含，不跨条目携带任何状态）：
//   ① 播**行动方**动画（段位由内核 skillKind 定：物理/特殊/属性/必杀各播各的）；
//   ② 等到**出伤帧**；
//   ③ **对方**在同一帧开始播效果：受击/闪避动画 + 伤害飘字 + 血牌掉落（三者同帧 = 上游那个 SetCurrentUIState）；
//   ④ 等这一段双方都演完，回到待机 ⇒ 下一条行动独立开始。
//
// 非行动条目（登场 / 回合末 buff / 濒死 / 阵亡 / 胜利）走 type:'fx'，与行动互不干扰。
function clipActions(driver, prevLines, events) {
  const cur = driver.reports()
  let newLines
  if (cur.length >= prevLines.length) newLines = cur.slice(prevLines.length)
  else { const seen = new Set(prevLines); newLines = cur.filter(l => !seen.has(l)) }
  const myName = driver.myPet()?.name, opName = driver.opPet()?.name
  const sideOf = (nm) => (nm && nm === myName) ? 'my' : (nm && nm === opName) ? 'op' : null

  // ① 战报行 → 行动骨架。一行 = 一次行动（AttackPhase.addReport 把「使用了…對…造成了…」写进同一行）。
  const steps = []
  for (const raw of newLines) {
    const t = stripTags(raw)
    if (t.includes('登场了')) continue
    if (/激活了专属动作/.test(t)) continue          // 只是文案，上游不为它单独出动画（见 impl §17.11）
    const use = t.match(/【([^】]+)】使用了/)
    if (use) {
      const side = sideOf(use[1]); if (!side) continue
      const def = t.match(/對【([^】]+)】/)
      const defMiss = /但是没有命中/.test(t) ? t.match(/【([^】]+)】/) : null
      steps.push({
        type: 'act', side, attack: true,
        defSide: sideOf((def || defMiss)?.[1]) ?? (side === 'my' ? 'op' : 'my'),
        reaction: defMiss ? 'miss' : (/打出了致命一击/.test(t) ? 'crit' : 'hit'),
        hasDamageLine: !!(def || defMiss),
      })
      continue
    }
    // 非攻击行动（空过 / 换宠 / 逃跑）：也要占一拍，但**不播攻击动画、对方无反应**
    const idle = t.match(/【([^】]+)】(空过了本次行动|主动更换出战精灵)/)
    if (idle) { const side = sideOf(idle[1]); if (side) steps.push({ type: 'act', side, attack: false }) }
  }

  // ② 两条内核信号按序 zip 进来（**互不依赖**：攻击语义不依赖有没有伤害，伤害也不依赖攻击语义）。
  const damages = events?.damage ?? []
  const attacks = events?.attack ?? []
  const acts = steps.filter((s) => s.type === 'act' && s.attack)
  const hitDmg = damages.filter((d) => !d.turnEnd && !d.turnStart)
  let ai = 0, di = 0
  for (const st of acts) {
    if (ai < attacks.length) { const ev = attacks[ai++]; st.skill = ev; if (ev.skillKind) st.kind = ev.skillKind }
    // 只有战报里真出现「造成了/没命中」那一段时才挂伤害事件（零伤害的属性技没有那段 ⇒ 对方不反应，见 stage §9 属性技）
    if (st.hasDamageLine && di < hitDmg.length) st.dmg = hitDmg[di++]
    else if (!st.hasDamageLine) { /* 无伤害行 ⇒ 不消耗 */ }
  }

  // ③ 非行动条目接在后面（顺序与内核相位一致：回合末 buff → 回合开始濒死 → 阵亡 → 胜利）
  for (const ev of damages) if (ev.turnEnd) steps.push({ type: 'fx', kind: 'buff', side: ev.atkSide, dmg: ev });
  for (const ev of damages) if (ev.turnStart) steps.push({ type: 'fx', kind: ev.kind, side: ev.side });
  if (driver.myPet()?.hp <= 0) steps.push({ type: 'fx', kind: 'ko', side: 'my' });
  if (driver.opPet()?.hp <= 0) steps.push({ type: 'fx', kind: 'ko', side: 'op' });
  if (driver.isOver()) steps.push({ type: 'fx', kind: 'victory', side: driver.outcome()?.isMyWin ? 'my' : 'op' });
  return steps
}
async function mountHud(query) {
  // 屏幕大小（1200x660 / 尽可能大）由全局配置 screen.js 统一驱动，所有场景共用同一个游戏屏幕；
  // 战斗不再私自决定尺寸。这里只保留战斗 HUD 自己的画布模式（match：逻辑高随舞台，血牌/底栏不被裁）。
  setCanvasMode('match')
  await loadContent()
  const enc = query.get('encounter') === '1' && !!query.get('client')
  // **单血统（编排线 ORP3）**：v2 官方线 / AS3 战斗线废弃 ⇒ 恒走「XML 档 + 重启内核」（不再读 roco.battle.engine）
  const restart = true
  retParams = null                                // 本次挂载从零开始记"回图要带什么"（demo/自测分支保持 null）

  let driver = null
  let encCtx = null   // 闭环上下文 (活跃宇宙存档 + 元游戏 deps)；非 enc 模式为 null → 维持 U1 demo 原样
  let myPetId = null, opPetId = null   // 舞台 fight SWF 装载用 (swfId 另经 CONTENT.swfIdOf 解析)
  const hint = () => document.getElementById('hint')
  if (enc) {
    const clientPetId = Number(query.get('client'))
    const clientLevel = Math.min(100, Math.max(1, Number(query.get('level') || 100)))
    const slot = Number(query.get('slot') || 0)     // ⚠️ 这是**野怪在地图里那格的序号**（传回结算用），**不是**存档槽
    const gid = Number(query.get('gid') || 0)       // 存档槽（地图侧带过来；F5 直进同一 URL 也对得上）
    const back = query.get('back') || ''
    // 活跃档 = **会话**（XML 单一血统）：本场景**不碰 localStorage**；元游戏改动点直接写会话的内存态，
    // 再经 `save()` 合并回 `GameData` 并落 `saves/save{gid}.xml`（粒度 = 变更点同步写，ORP5）。
    const RULES = await (await fetch('/game/data/rules.json')).json()
    const auth = CONTENT.buildRestartAuth(RULES)
    const RST = await import('/game/logic/restartSession.js')   // ORP7=A：只用纯函数（不含 load/saveRestartSession）
    const isRestart = true
    // 槽位不符才重读（地图→战斗是同槽 ⇒ 复用同一份内存态；F5 直进战斗 ⇒ 按 URL 的 gid 读回来）
    if (!session.active || session.gid !== gid) await ensureLoaded({ gid })
    const act = session.active
    const state = act.state
    const save = () => act.save()
    retParams = { slot: String(gid) }               // 回图：**槽位随路由**（不带的话地图会退回 0 号档）
    if (back) retParams.map = back
    const lead = state.team[0]
    if (!lead) {
      if (hint()) hint().textContent = '队伍是空的 — 回地图恢复或清除存档'
      exitToMap(); return
    }
    // 多宠袋（换宠经内核 PetChange 切 cursor）
    const teamPets = state.team.slice(0, 6).map((p) => ({ petId: p.petId, level: p.level, ownSkillId: (p.__xml && p.__xml.skills && Array.isArray(p.__xml.skills.ownSkillId)) ? p.__xml.skills.ownSkillId.map((x) => Number(x) | 0) : [] }))
    driver = await createCoreBattle({
      masterPetId: lead.petId, clientPetId, masterLevel: lead.level, clientLevel,
      masterTeam: teamPets || undefined,
      // 不带 ?seed= 时传 undefined ⇒ 驱动层抽随机种子（出手顺序末级 tiebreak 真正随机）；
      // 带 ?seed=N 仍逐位复现，便于手测/调试复现同一场。
      seed: query.get('seed') != null ? Number(query.get('seed')) : undefined,
    })
    // 带伤入场：上限走重启权威 (unity iv0)，当前值取存档 hp 钳到 [1, cap]。
    state.team.slice(0, 6).forEach((p, i) => {
      const c = CONTENT.restartHpMax(p.petId, p.level) || (driver.myBag()[i] ? driver.myBag()[i].maxHp : 1)
      driver.setBagStartHp(i, p.hp > 0 ? Math.min(p.hp, c) : 1)
    })
    encCtx = { state, lead, save, isRestart, auth, RST, RULES, clientPetId, clientLevel, slot, back }
    myPetId = lead.petId; opPetId = clientPetId
  } else {
    const master = Number(query.get('master') || 1)
    const client = Number(query.get('client') || 2)
    const level = Number(query.get('level') || 100)
    driver = await createCoreBattle({ masterPetId: master, clientPetId: client, level, seed: query.get('seed') != null ? Number(query.get('seed')) : undefined })
    myPetId = master; opPetId = client
  }

  // U5 舞台：地图背景 + 左右 fight SWF 精灵 (纯表现; swfId 走既定动画桥, 不引官方数值)。
  const fightMap = query.get('map') || '100002'
  // #log 全屏后隐藏 ⇒ 舞台自陈搬家：`[stage] <side> 动画状态: …` 落到对应血牌的 data-anim-states（§8.4）。
  const stageLog = (t) => {
    console.log(t)
    const m = /^\[stage\] (my|op) 动画状态: (.*)$/.exec(t)
    if (m) { const plate = document.querySelector(`.rbb-plate--${m[1]}`); if (plate) plate.dataset.animStates = m[2] }
  }
  STAGE = RESTART_STAGE.create({
    myPetId, opPetId,
    mySwfId: CONTENT.swfIdOf(myPetId), opSwfId: CONTENT.swfIdOf(opPetId),
    fightMap, log: stageLog,
  })

  panelEntry = openPanel('rbattle', (root) => {
    // 层序 = 设计 §3 的节点树：顶带(0..110) → 记录面板(坐底栏上沿) → 底栏(425..540)。
    // 血牌/回合板/底栏/记录面板各自的盒在模块里，场景只建 .rbb-topband 与 .rbb-statebuffs 两块容器。
    const band = anch('rbb-topband', [0, 0, 960, 110]); root.append(band)
    const updMyPlate = FIGHT_PLATE.create(band, 'my')
    const updOpPlate = FIGHT_PLATE.create(band, 'op')
    const updRound = ROUND_PLATE.create(band)
    // 全局 buff 网格 = 天气占首格（BattleSystemView.cs:123-137 那句 Insert(0, weatherBuff) 的 DOM 等价）；
    // weather===0 ⇒ 不插 ⇒ 截图里那块是空的，这里就不产出节点（铁律 6）。
    const stateBox = anch('rbb-statebuffs', [432, 65, 100, 110]); band.append(stateBox)
    const updState = BUFF_GRID.create(stateBox, { layout: 'left' })
    const rec = RECORD_PANEL.create(root)

    // 页签内容用回调表注入（同 docs/view/scene/room/view-scene-hud-impl.md §3.1）：底栏不认识任何页面实现，页面也只认 driver。
    const restart = !!(encCtx && encCtx.isRestart)
    const bar = BOTTOM_BAR.create(root, {
      restart,
      pages: {
        skill: (host) => { const u = SKILL_CARD.create(host, { onSelect: (id) => act(id) }); return () => u(driver) },
        change: (host) => { const u = PET_CHANGE.create(host, { onSwitch: (i) => doSwitch(i) }); return () => u(driver) },
        capture: (host) => { const u = ITEM_BOARD.create(host, { kind: 'capture', onPick: (it) => doCapture(it.id) }); return () => u(ownedCapsules()) },
        item: (host) => { const u = ITEM_BOARD.create(host, { kind: 'item' }); return () => u(null) },
      },
      // 自动战斗：本轮只做开关态呈现，出招顺序输入推到 B6（不假装会自动出招）。
      onAuto: (on) => { autoOn = on; flashNotice(on ? '自动战斗：出招顺序输入未接（B6）' : '自动战斗已关') },
      onNoop: () => { if (!over && !busy) { driver.pass(); const r = advanceRound(() => driver.nextRound()); if (r.over) { over = true; settleAndExit(); return } if (r.needSwitch) { forceChangePet(); return } if (r.rejected) flashNotice('本回合含未移植算子，已跳过') } },
      onSuper: (id) => act(id),
      onLocked: (mid, why) => flashNotice(why || `「${mid}」当前不可用`),
      // 逃跑 = 二次确认（§6.8）；确认后经内核逃跑技（效果 -4 → Escape 算子）真结算。
      onEscape: () => openHintbox({
        title: '逃跑', content: '确定要逃跑离开战斗吗？', optionNum: 2,
        onConfirm: () => doEscape(),
      }),
    })

    // 血牌要在**出伤帧**跟着掉（人类 2026-10-19）。上游是同一个 SetCurrentUIState 帧原子同步：
  //   BattlePetAnimView.OnPetHit → UI.ProcessQuery(true) → SetCurrentUIState ⇒ statusView.SetPet（血牌）与
  //   SetDamage（伤害气泡）在同一次调用里。我们内核是回合粒度 ⇒ 用驱动层给的**逐拍 hp 快照**在演出里补回来。
    //   hpOv 只在演出期间生效；本回合演完即清空并按权威状态重画一次（覆盖回合末 buff 掉血/阵亡/胜利等没有逐拍快照的部分）。
    const hpOv = { my: null, op: null }
    const petOf = (side) => {
      const p = side === 'op' ? driver.opPet() : driver.myPet()
      const ov = hpOv[side]
      if (!ov || !p) return p
      // ⚠️⚠️ 必须用 Object.create + **defineProperty**，不能是 `{...p}` 也不能是 `v.hp = …`：
      //   maxHp/name/battleElement 是原型 getter，浅拷贝会丢 ⇒ 要 Object.create 继承原型；
      //   而 hp/anger 在 BattlePet 上是**原型 accessor**（get/set 都转发到 statusController），
      //   `v.hp = x` 会**沿原型链命中那个 setter、把真身的血改了**（人类 2026-10-19 报障「血条结算时刻不对」的
      //   根因之一：覆盖视图根本不隔离，改的是活对象）。defineProperty 才是「自有数据属性遮蔽原型 accessor」。
      const v = Object.create(p)
      for (const k of ['hp', 'anger']) {
        Object.defineProperty(v, k, { value: ov[k], enumerable: true, writable: true, configurable: true })
      }
      return v
    }
    const renderAll = () => {
      updMyPlate(driver, petOf('my'))
      updOpPlate(driver, petOf('op'))
      updRound(driver)
      const w = driver.weatherBuff()
      updState(w ? [w, ...driver.stateBuffs()] : driver.stateBuffs())
      rec.update(driver)
      bar.update(driver)
    }

    let over = false
    let busy = false            // 演出期锁（人类 2026-10-19）；见 advanceRound 的说明
    let busySeq = 0             // 锁的世代号：解锁回调必须确认自己仍是最新的一代，否则会误解锁下一回合
    function setBusy(on) {
      if (busy === !!on) return
      busy = !!on
      bar.setBusy(busy)
      root.classList.toggle('rbb-busy', busy)
    }
    // 强制解锁并作废所有在途的解锁回调（流程跳转用，例：阵亡强制换宠要立刻把玩家放到「精灵」页）。
    function forceUnlock() { busySeq++; setBusy(false) }
    // 推进一回合的统一入口：**先上锁，再推进，等本轮演出收尾才解锁**。
    // 上游同义做法 = PassivePetChangePhase 的 `UI.SetBottomBarInteractable(...)`（演出期间不接受新输入）。
    // 不锁的后果不是「手贱」那么轻：内核同步推进、舞台异步播出，锁不住就等于允许中途再推进一回合
    // ⇒ 两条演出序列交叠（=「双方一起出手」那类毛病的自伤版），且点击落在已推进过的状态上。
    function advanceRound(run) {
      setBusy(true)
      const mine = ++busySeq
      let r
      try { r = run() } catch (e) { busySeq++; setBusy(false); throw e }
      const unlock = () => { if (mine === busySeq && !over) setBusy(false) }
      if (STAGE) STAGE.whenIdle().then(unlock, unlock)
      else unlock()
      return r
    }
    let autoOn = false
    function flashNotice(msg) {
      let n = root.querySelector('.rbb-notice')
      if (!n) { n = el('rbb-notice'); root.append(n) }
      n.textContent = msg
      n.style.opacity = 1
      clearTimeout(flashNotice._t)
      flashNotice._t = setTimeout(() => { n.style.opacity = 0 }, 2600)
    }

    // 闭环收尾：读内核 result 判胜/负/捕捉 → 按活跃宇宙写回元游戏 → 递战果 → 回图。
    //   v3 (restart): restartSession.settleRestart (unity iv0 HP + unity/growth 进化·beatExpParam; exp 借 A/B)。
    //   v2 (engine off 手搓): game/logic 官方结算 (逐字节同 U1)。
    // 捕捉由内核 Capture 算子真结算（result.state=CaptureSuccess）；落进队伍是 save-side 副作用（上游 ProcessResult 等价，标 _authority.capture）。
    async function settleAndExit() {
      // ⚠️ **先等本轮演出收尾再弹结算**（人类 2026-10-19）：内核 nextRound() 是同步跑完整回合的，返回时
      // 舞台还在播动画；此前这里同步弹框 ⇒ 结算框压在死亡/胜利动画上，且玩家还没看清谁赢就打在了脸上。
      if (STAGE) { try { await STAGE.whenIdle() } catch { /* 舞台已卸载等不到演出，按无演出处理 */ } }
      if (!encCtx) { resultView.showResult(root, driver, { onExit: exitToMap }); return }
      const { state, lead, save, auth, RST, clientPetId, clientLevel, slot, back } = encCtx
      const res = driver.outcome()
      const outcome = res.isCapture ? 'capture' : (res.isMyWin ? 'win' : 'lose')
      // 多宠袋: 每只上场过的宠按各自内核 bag hp 回写; 单宠/v2 只写队首。
      const leftHp = {}
      state.team.slice(0, 6).forEach((p, i) => { const bp = driver.myBag()[i]; leftHp[p.uid] = bp ? bp.hp : p.hp })
      let events = [], capturedPet = null
      try {
        if (outcome === 'capture') {   // save-side: 内核已判 CaptureSuccess，这里只落档（不谎称进 golden）
          capturedPet = RST.makeRestartPet(auth, clientPetId, clientLevel)
          capturedPet._authority = 'kernel-capture+save-side'
          const where = RST.addPet(state, capturedPet)
          events.push({ type: 'capture.saved', petId: clientPetId, level: clientLevel, where, uid: capturedPet.uid })
        }
        const r = RST.settleRestart(auth, state, { outcome, leftHp, uids: [lead.uid], wild: { petId: clientPetId, level: clientLevel }, captured: capturedPet })
        events = events.concat(r.events)
      } catch (e) { flashNotice('结算异常: ' + e) }
      save()
      // ★MB7 战后链（BTI9）：把这一场的**结果快照**写进会话只读窗口 → 回图后 win/loseHandler 里的 `battle.` 条件据此分流。
      //   · `settings` 半 = 本场实际跑的遭遇设置（沿用 `#/rbattle` 默认；多宠带 `<settings>` 的正式规格归 E6）；
      //   · `result` 半 = 内核 `BattleResult` 的谓词（`isMyWin`/`isOpWin`/`state`…正是 **BTI8** 的硬胜/逃-win 口径）；
      //   · `capturePet` 仅在捕获成功时给（未捕 ⇒ `null` ⇒ `battle.result.capturePet.id` 读作 `-1`，与上游一致，服务 `50004`）。
      try {
        const s = driver.state.settings
        session.lastBattle = {
          outcome,
          state: res.state,
          settings: {
            mode: s.mode, rule: s.rule, count: s.petCount, parallel: s.parallelCount, star: s.starLimit,
            time: s.time, weather: s.weather, mod: s.isMod, simulate: s.isSimulate,
            escape: s.isEscapeOK, item: s.isItemOK, capture: s.isCaptureOK, captureLevel: s.captureLevel,
          },
          result: {
            state: res.state, fightPetCount: (res.fightPetCursors && res.fightPetCursors.size) || 0,
            isEnd: res.isBattleEnd, isKO: res.isKO, isEscape: res.isEscape, isCapture: res.isCapture,
            isMyWin: res.isMyWin, isOpWin: res.isOpWin,
            capturePet: outcome === 'capture' ? { id: clientPetId, level: clientLevel } : null,
          },
        }
      } catch (e) { flashNotice('战后快照写会话失败: ' + e) }
      APP.lastResult = {
        ts: Date.now(),
        wild: { petId: clientPetId, level: clientLevel, slot, back, map: '' },
        outcome, captured: outcome === 'capture' ? { petId: clientPetId, level: clientLevel, uid: capturedPet?.uid ?? null } : null,
        left: { hp: [driver.myPet().hp], pets: [CONTENT.swfIdOf(lead.petId)] },
      }
      resultView.showResult(root, driver, { meta: events, onExit: () => exitToMap() })
    }

    function act(id) {
      if (over || busy) return
      driver.selectSkill(id)
      const r = advanceRound(() => driver.nextRound())   // 触发 emitRender → onRender → renderAll，并锁到演出收尾
      if (r.over) { over = true; settleAndExit(); return }
      if (r.needSwitch) { forceChangePet(); return }
      if (r.rejected) flashNotice('该技能含未移植算子，本回合已跳过（内核围栏，非 UI 故障）')
    }

    // 阵亡强制换宠（上游 BattleManager.ProcessQuery 的 `SelectOption(myUnit.pet.isDead ? 1 : 0)`
    //   + Battle.cs:348-359 插 PassivePetChangePhase）：我方在场宠倒下且袋里还有活宠 ⇒
    //   **自动跳到「精灵」页**并锁死战斗/捕捉/道具/逃跑，直到换上来一只活宠。
    //   袋里一只活的都没有 ⇒ mustChangePet() 为 false，走内核回合末 checkBattleEnd 判 Lose。
    function forceChangePet() {
      if (over || !driver.mustChangePet()) return
      // 阵亡强制换宠要立刻把玩家放到「精灵」页 —— 这是**流程跳转**不是操作，先解锁再跳，
      // 否则 CSS 的 pointer-events:none 会让玩家看着提示却点不动（锁是给「演出中」用的，不是给流程用的）。
      // forceUnlock 会作废在途的解锁回调，免得它回头把下一回合的锁也一起解掉。
      forceUnlock()
      bar.select('change')
      flashNotice('我方精灵已阵亡 —— 请换一只上场')
    }

    // 逃跑：选工厂技 -4（priority 6 压过一切 ⇒ 我方先手直接结算 Escape），成功无掷点（上游同口径）。
    // 内核落 result.state=MyEscape ⇒ isMyWin=false ⇒ settleAndExit 按「输」回写（map-battle-trigger：我方逃跑算输）并回图。
    function doEscape() {
      if (over || busy) return
      act(-4)
    }

    // ── U2 捕捉/换宠: 动作经内核算子真结算, save-side 落档 (重启 enc 态才有这两槽) ──
    function ownedCapsules() {
      const out = []
      for (const it of (encCtx?.state.items || [])) {
        const row = CONTENT.restartCaptureEffectOf(it.id)
        if (row && it.count > 0) out.push({ id: it.id, name: CONTENT.restartItemNameOf(it.id), count: it.count, effectRow: row })
      }
      return out
    }
    function advanceNoAction() {   // 捕捉未中/换宠占一个回合: 我方无操作, 敌方仍出招
      driver.selectSkill(null)
      const r = advanceRound(() => driver.nextRound())
      if (r.over) { over = true; settleAndExit(); return }
      if (r.needSwitch) { forceChangePet(); return }
    }
    function doCapture(itemId) {
      if (over || busy || !encCtx?.isRestart) return false
      const row = CONTENT.restartCaptureEffectOf(itemId)
      if (!row) { flashNotice('该道具不是捕捉胶囊'); return false }
      let r
      // 带等级门 (conditionRaw:pet/level) 的胶囊会撞内核 condition 未移植围栏 → 诚实提示、不消耗、不结束。
      try { r = driver.useCapture(row) }
      catch (e) {
        const m = String(e && e.message)
        if (m.startsWith('NOT_PORTED')) { flashNotice('该胶囊的门槛判定含未移植算子 (内核 condition 围栏)，本回合未捕捉'); return false }
        throw e
      }
      if (r.gated) { flashNotice('等级门槛: 内核 condition 判定未通过，此胶囊无效'); return false }
      encCtx.RST.consumeItem(encCtx.state, itemId, 1)   // save-side: 一次投掷消耗一颗
      if (r.captured) { over = true; settleAndExit(); return true }
      flashNotice('未抓中, 胶囊已消耗')
      advanceNoAction()
      return true
    }
    function doSwitch(index) {
      if (over || busy || !encCtx?.isRestart) return false
      // 先记「这是不是被强制的那次」：上游里换宠是玩家**这一手**选的东西（PassivePetChangePhase 把
      //   选好的招存着、换完宠再照打），所以阵亡强制换宠**不额外吃掉一个回合**；玩家主动点「精灵」页
      //   换宠才占一回合（换宠技是 skill type=换场，本就该交这一手）。
      const forced = driver.mustChangePet()
      const r = driver.switchPet(index)
      if (!r.switched) { flashNotice(r.reason === 'dead-or-absent' ? '换不上：那只精灵已阵亡或不在队里' : '换宠未生效 (内核 PetChange 未落)'); return false }
      if (STAGE) { const swf = CONTENT.swfIdOf(r.pet.id); STAGE.reloadFighter('my', swf).then(() => STAGE.setState('my', 'idle')).catch(() => {}) }
      if (forced) { bar.select('skill'); return true }   // 换完回「战斗」页（上游 ProcessQuery 的 SelectOption(0)）
      advanceNoAction()
      return true
    }
    // 捕捉/换宠的入口现在是底栏页签（.rbb-option[data-mid=capture|change]）—— U2 那两枚模态弹层已退役。
    // harness 仍走 __battle.capture/switch 直调内核真结算，语义不变（F17 只搬家选择器）。

    offRender = driver.onRender((last, cur, p) => {
      const acts = clipActions(driver, prevReports, p)
      prevReports = driver.reports().slice()
      if (!STAGE) { renderAll(); return }        // 无舞台（无 Ruffle / demo）没有演出，直接按权威状态画
      // ⚠️ **不在这里 renderAll** —— 内核回合粒度，此刻画 = 血牌在动画开演前就掉了（与伤害飘字错开 1~2.4 秒）。
      //   改成由舞台在**每个打击帧**回调 onContact 逐拍刷；演完再按权威状态收一次（回合末 buff 掉血/阵亡/胜利等
      //   没有逐拍快照的部分由那次收尾覆盖）。
      STAGE.playRound(acts, {
        onContact: (ev) => {
          // ⚠️ **两侧都要写**（人类 2026-10-19 报障「第一个出伤帧双方血条同时结算」）：内核是回合粒度，
          //   `nextRound()` 返回时两边都已是回合末的血；只给被打方写覆盖 ⇒ 行动方那格读到真身 ⇒ 跟着一起掉。
          //   行动方在自己这一手开打时的 hp 正是它此刻该显示的值（先手=本回合起始值，后手=已吃过对方那下）。
          if (ev && ev.atkHp != null) hpOv[ev.atkSide] = { hp: ev.atkHp, anger: ev.atkAnger }
          if (ev && ev.defHp != null) hpOv[ev.defSide] = { hp: ev.defHp, anger: ev.defAnger }
          renderAll()
        },
      }).then(() => {
        hpOv.my = null; hpOv.op = null
        renderAll()                                   // 收尾：贴回权威状态
      }, () => { hpOv.my = null; hpOv.op = null })
    })
    let prevReports = driver.reports().slice()    // 基线: 装载时的两条登场不进回合动作序列 (登场由 stage.present 播)
    renderAll()                                // 首帧 (含两条登场) 立刻画出来
    let stageReady = false
    STAGE.ready.then(() => { stageReady = true; return STAGE.present() }).catch(() => {})   // 舞台装载完成 → 双方登场 → 待机 (缺素材则空容器, 不抛)
    window.__battle = {
      driver, render: renderAll, act, enc: !!encCtx, stage: STAGE,
      bar, record: rec, selectTab: (mid) => bar.select(mid),
      // §8.4 调试读数搬家：#log 隐藏后不删读数，改走这个快照（外加血牌的 data-anim-states）。
      debug: () => ({
        engine: 'restart',   // 单血统（ORP3）：不再有 as3/v2 分支
        enc: !!encCtx, isRestart: !!(encCtx && encCtx.isRestart), stageReady,
        turn: driver.turn(), over: driver.isOver(), autoOn, tab: bar.selected,
        canvas: getCanvasInfo(),
        // 本场每次攻击实际用的节奏（ms / 是否兜底）—— 排查「飘字早于出伤帧」先看这个（as-built §17.16）
        timing: STAGE && STAGE.timing ? STAGE.timing.slice() : [],
      }),
      // U2 内核真结算动作 (供 harness 直接驱动, 不经 DOM): capture 走内核 Capture, switch 走内核 PetChange。
      capture: (itemId) => doCapture(itemId),
      switch: (index) => doSwitch(index),
      escape: () => doEscape(),   // 逃跑同样经内核真结算（调试/harness 直调面）
      capsules: () => ownedCapsules().map((c) => ({ id: c.id, name: c.name, count: c.count })),
      team: () => driver.myBag().map((p) => (p ? { id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, dead: p.isDead } : null)),
      cursor: () => driver.myCursor(),
      __clipActions: (prev) => clipActions(driver, prev ?? []),   // 供 harness 直读映射 (不驱动演出)
      reports: () => driver.reports().slice(),
      // 让 puppeteer 能直接把战斗推到结束（跑真内核回合，不伪造 result）。
      runUntilOver(maxRounds = 40) {
        let i = 0
        const list = driver.availableSkills()
        const dmg = list.find(s => (s.power ?? 0) > 0) || null
        while (!driver.isOver() && i < maxRounds) {
          driver.selectSkill(dmg ? dmg.id : null)
          const rr = driver.nextRound()
          if (rr.needSwitch) {   // 强制换宠：随手挑第一只活宠顶上，模拟玩家点一下
            const bag = driver.myBag()
            const at = bag.findIndex((p, k) => p && !p.isDead && k !== driver.myCursor())
            if (at < 0) break
            driver.switchPet(at)
          }
          i++
        }
        renderAll()
        if (driver.isOver() && !over) { over = true; settleAndExit() }
        return { over: driver.isOver(), rounds: i, outcome: driver.outcome().state }
      },
      // 测试直读闭环上下文（不改内核数值，仅暴露元游戏快照给断言用）。
      _enc: () => encCtx && {
        isRestart: encCtx.isRestart, leadUid: encCtx.lead.uid,
        teamLeadHp: encCtx.state.team[0]?.hp, exp: encCtx.state.team[0]?.exp,
        leadPetId: encCtx.state.team[0]?.petId,
        authority: encCtx.state._authority || null,
        dexSeen: !!encCtx.state.dex?.[String(encCtx.clientPetId)]?.seen,
        // 兼容旧 v2 harness 的键名
        dexCaught: !!encCtx.state.dex?.[String(encCtx.clientPetId)]?.seen,
      },
    }
  }, { scrim: false })
}

function exitToMap() {
  // 回地图交给 router 的 hash；这里只清自己的战斗态。
  // ⚠️ **必须带上存档槽**（`slot=<gid>`）：地图场景按路由槽位取会话（`#/map?slot=N`），
  //    不带就退回 0 号档 —— 打了一场却发现"进度没了"就是这么来的（2026-10-18 修）。
  // ★MB10「回原房间 + 原位置」：`retParams.map` 就是**开战那一刻的房间**（地图侧 `renderMap` 写的
  //    `session.currentMapId` 经 `back` 带过来）；它与 `session.lastPos.mapId` 对得上 ⇒ 再把开工时的舞台坐标
  //    补成 `spawn=x,y`（地图侧既有的一次性落点口，TPQ5）⇒ 回图落回原地，而不是房间入口（出生点）。
  //   对不上（战后链把人传送走了、或换了房间）⇒ 不补 ⇒ 地图侧按 `spawn ?? init` 走原口径。
  if (retParams && !retParams.spawn && retParams.map && session.lastPos
      && String(session.lastPos.mapId) === String(retParams.map)) {
    retParams.spawn = `${session.lastPos.x},${session.lastPos.y}`
  }
  const q = retParams ? new URLSearchParams(retParams).toString() : ''
  location.hash = '#/map' + (q ? '?' + q : '')
}

export async function mount(query) {
  if (query.get('selftest')) return mountSelftest()
  return mountHud(query)
}

export function unmount() {
  if (offRender) { try { offRender() } catch { /* noop */ } offRender = null }
  if (STAGE) { try { STAGE.destroy() } catch { /* noop */ } STAGE = null }
  if (panelEntry) { try { closePanel(panelEntry) } catch { /* noop */ } panelEntry = null }
  // 画布模式（fixed/match）由当前场景决定；战斗卸载时把 HUD 逻辑高还给地图 HUD 的 fixed 口径。
  // 屏幕大小归全局配置 screen.js，不再由战斗私自加减 body class。
  setCanvasMode('fixed')
  delete window.__battle
  delete window.__rbattle
}
