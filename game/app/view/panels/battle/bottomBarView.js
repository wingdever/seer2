// R4 底栏（docs/view/scene/battle/view-scene-battle-impl.md §6.4）—— 本轮最重的一个模块。
// 上游 IA = 底图 + 必杀槽 + **一块会整块换掉的内容区** + 右侧页签簇，外加浮在底栏上沿的自动战斗与绿圆钮。
// 旧实现的两条结构错在这里收：S2「技能卡在右侧浮窗」⇒ 卡回到内容区；S3「7 个平铺按钮」⇒ 页签簇 + 互斥
// （BattleOptionView.Select 的 `options[i].SetActive(i == index)` ⇒ 同屏只有一页有内容）。
import { el, text, anch, sprite, mapSprite } from './_kit.js'

// 绝对设计盒（权威 = 设计 §4.4 表；anch 的 bottom 基准恒 540 ⇒ match 画布模式下逻辑高变了也仍贴屏幕底）。
const BAR = [0, 425, 960, 115]
const SUPER = [1, 431, 70, 105]
const CONTENT = [71.5, 437.5, 700, 100]
const OPTIONS = [773, 429.5, 185, 110]
const AUTO = [788, 390, 110, 30]
const NOOP = [908, 382.5, 40, 40]

// 页签簇 5 张字标，盒写**簇内局部坐标**（= 绝对 − OPTIONS 左上）。字标是烤好的 PNG，不用 DOM 文本（字体对不上）。
const TABS = [
  { mid: 'skill', idx: 0, box: [2.5, 3, 180, 103], normal: 'battle normal.png' },
  { mid: 'change', idx: 1, box: [4, 1, 84, 32], normal: 'pet normal.png', chosen: 'pet chosen.png' },
  { mid: 'capture', idx: 2, box: [96, 1, 84, 32], normal: 'catch normal.png', chosen: 'catch chosen.png' },
  { mid: 'item', idx: 3, box: [4, 75.5, 84, 32], normal: 'Item normal.png', chosen: 'Item chosen.png' },
  { mid: 'escape', idx: 4, box: [96, 75.5, 84, 32], normal: 'escape normal.png', chosen: 'escape chosen.png' },
]

// 可点判据：ok 一律来自内核投影（settingsView / bagCounts），why 是诚实文案。
// restart 是**场景**才知道的条件（非遇怪态没有胶囊、也没有多宠袋），不是本地业务规则。
// ⚠️ **换宠门禁不看 aliveNum，看 canChangePet()**（有没有「非当前且没死」的宠可换上）：
//   旧口径 `aliveNum > 1` 恰好把**最需要换的场景挡死** —— 一只刚阵亡时 aliveNum 掉到 1 ⇒ 页签变灰。
//   判据与上游 UI 同源（BattlePetChangeBlockView.SetPet → SetInteractable(!pet.isDead)）。
// ⚠️ **阵亡强制换宠**（上游 Battle.cs:348-359 → PassivePetChangePhase：myUnit.pet.isDead 时
//   setOptionActive 关掉 战斗(0)/捕捉(2)/道具(3)）：我方在场宠倒下且还有活宠 ⇒ 除「精灵」页外全锁。
const MUST_WHY = '我方精灵已阵亡 —— 请先在「精灵」页换一只上场'
const GATES = {
  skill: (d) => (d.mustChangePet() ? { ok: false, why: MUST_WHY } : { ok: true, why: '' }),
  change: (d) => ({ ok: d.canChangePet(), why: '没有可换上的活宠（其余精灵都已阵亡）' }),
  capture: (d, s, ctx) => (d.mustChangePet() ? { ok: false, why: MUST_WHY } : { ok: !!s.isCaptureOK && ctx.restart, why: ctx.restart ? '当前不开放捕捉' : '非遇怪态不开放（demo 对局没有胶囊）' }),
  item: (d, s) => (d.mustChangePet() ? { ok: false, why: MUST_WHY } : { ok: !!s.isItemOK, why: '道具支未接（BeforeAttack.addReport 含未移植算子）' }),
  // 逃跑**不**参与锁死：上游被动换宠只 SetOptionActive 关 战斗(0)/捕捉(2)/道具(3)，逃跑(4) 按钮照亮。
  //   真拦截发生在 Battle.SetSkill —— 逃跑技同样先撞 `isAnyPetDead` 那道旁路（Battle.cs:348）。
  //   本仓对应物 = driver.nextRound() 的 mustChangePet 闸门：点了会弹换宠页 + 提示，而不是死按钮。
  escape: (d, s) => ({ ok: !!s.isEscapeOK, why: '本局设置不允许逃跑' }),
}

// create(parent, { pages, onAuto, onNoop, onSuper, onLocked, onEscape, restart }) → { update(driver), select(mid) }
// pages = { mid: (hostEl) => updater } —— 场景给工厂，本模块不认识任何页面实现（同 docs/view/scene/room/view-scene-hud-impl.md §3.1 的口径）。
export function create(parent, { pages = {}, onAuto, onNoop, onSuper, onLocked, onEscape, restart = false } = {}) {
  const bar = anch('rbb-bottombar', BAR, 'bottom')
  bar.style.backgroundImage = `url("${sprite('Bottom bar.png')}")`
  parent.append(bar)

  // ── 必杀槽：三层叠同一张徽章；够怒 ⇒ 第 0 层发光（上游是 ParticleAfterburner.mat，CSS 近似并记 §14）。──
  // BattlePetSkillView.SetSuperSkillInteractable：按钮**永远可点**，clickable 为假时点击直接 return ⇒ 不灰化。
  const sup = anch('rbb-superskill', SUPER, 'bottom')
  const layers = [0, 1, 2].map(() => {
    const l = el('rbb-super-layer')
    l.style.backgroundImage = `url("${sprite('Super skill indicator.png')}")`
    sup.append(l)
    return l
  })
  bar.append(sup)

  // ── 内容区：一次只显示一页（S3 的钉子由这条互斥钉死）──
  const content = anch('rbb-content', CONTENT, 'bottom')
  bar.append(content)
  const host = {}, upd = {}
  for (const t of TABS) {
    const h = el(`rbb-page rbb-page--${t.mid}`)
    h.style.display = 'none'
    content.append(h)
    host[t.mid] = h
    upd[t.mid] = pages[t.mid] ? pages[t.mid](h) : null
  }

  // ── 页签簇 ──
  const options = anch('rbb-options', OPTIONS, 'bottom')
  bar.append(options)
  const tabEl = {}, tabArt = {}, tabRing = {}, tabLine = {}
  const lastGates = {}     // 缓存最近一次门禁，点击锁住的页签时把 why 递给 onLocked
  for (const t of TABS) {
    const tab = el('rbb-option')
    tab.dataset.mid = t.mid
    tab.dataset.index = String(t.idx)
    Object.assign(tab.style, { left: `${t.box[0]}px`, top: `${t.box[1]}px`, width: `${t.box[2]}px`, height: `${t.box[3]}px` })
    // 「战斗」没有 chosen 图（实测不存在）⇒ 选中态 = normal + battle outline.png 外框 + 一道 split line。
    // 叠序权威 = Fight.unity 里那个页签节点的 m_Children：[split line, outline, normal] —— **后建的盖在上面**，
    // 所以字标 normal 压在 outline 之上（outline 是 182×105 的青边+暗底，盖上去会把「战斗」两字糊掉）。
    // split line 的 SizeDelta 是 (110,4) 但 m_LocalRotation z=.7071 ⇒ 它是道**竖线**（4×110 居中），不是横线。
    const ring = t.mid === 'skill' ? el('rbb-option-outline') : null
    const line = t.mid === 'skill' ? el('rbb-option-split') : null
    const art = el('rbb-option-art')
    if (line) tab.append(line)
    if (ring) tab.append(ring)
    tab.append(art)
    if (ring) { tabRing[t.mid] = ring; tabLine[t.mid] = line }
    tab.addEventListener('click', () => select(t.mid))
    options.append(tab)
    tabEl[t.mid] = tab
    tabArt[t.mid] = art
  }

  // ── 浮在底栏上沿的两枚：自动战斗（仅 settings.isAutoOK 才建，见 update）、绿圆钮（无操作）──
  // 两枚都**底锚在画布上**（AUTO/NOOP 的盒在设计 y=390/382.5，在底栏 y=425 之上）⇒ 挂 parent 而不是 bar，
  // 否则 top 会被 bar 当自身坐标用，整枚跑到画布外。
  const auto = anch('rbb-auto', AUTO, 'bottom')
  const check = el('rbb-auto-check')
  auto.append(check, text('rbb-auto-label', '自动战斗'))
  auto.addEventListener('click', () => {
    if (busy) return
    autoOn = !autoOn
    check.classList.toggle('rbb-auto-check--on', autoOn)
    if (onAuto) onAuto(autoOn)
  })

  const noop = anch('rbb-noop', NOOP, 'bottom')
  noop.style.backgroundImage = `url("${mapSprite('flip.png')}")`
  noop.title = '无操作：本回合不出招'
  noop.addEventListener('click', () => { if (!busy && onNoop) onNoop() })
  bar.append(noop)   // bar 的底边 = 画布底边 ⇒ 'bottom' 基准在 bar 里与在画布里同值

  let selected = 'skill', autoOn = false
  // 演出期锁（人类 2026-10-19「本回合动画播放时间里 HUD 应当不可操作」）。
  // 上游同义接缝 = `UI.SetBottomBarInteractable`（PassivePetChangePhase.cs:81），我们此前把它留成了 no-op。
  // 这不只是手感问题：内核 nextRound() 同步推进、舞台 playRound 异步播，锁不住就等于允许玩家在演出中途再推进一回合
  // ⇒ 两条演出序列交叠（=「双方一起出手」那类毛病的自伤版），且点击落在已推进过的状态上。
  // 双保险：CSS `pointer-events:none` 挡鼠标，setBusy + 各 handler 的 busy 判据挡程序化调用。
  let busy = false
  function setBusy(on) {
    if (busy === !!on) return
    busy = !!on
    bar.classList.toggle('rbb-bottombar--busy', busy)
    bar.dataset.busy = busy ? '1' : '0'
    bar.title = busy ? '本回合演出中…' : ''
  }

  function paint() {
    for (const t of TABS) {
      const on = t.mid === selected, tab = tabEl[t.mid]
      tab.classList.toggle('rbb-option--on', on)
      tabArt[t.mid].style.backgroundImage = `url("${sprite(t.chosen && on ? t.chosen : t.normal)}")`
      if (tabRing[t.mid]) { tabRing[t.mid].style.display = on ? '' : 'none'; tabLine[t.mid].style.display = on ? '' : 'none' }
      host[t.mid].style.display = on ? '' : 'none'
    }
  }

  function select(mid) {
    if (busy) return          // 演出中：换页/开逃跑确认都不响应
    if (!tabEl[mid]?.classList.contains('rbb-option--live')) {
      if (onLocked) onLocked(mid, lastGates[mid]?.why || '')
      return
    }
    if (mid === 'escape') {   // 逃跑不是「一页内容」，是二次确认（§6.8）⇒ 交给场景开确认框
      if (onEscape) onEscape()
      return
    }
    selected = mid
    paint()
  }

  return {
    select,
    setBusy,
    get busy() { return busy },
    get selected() { return selected },
    update(driver) {
      const s = driver.settingsView(), ctx = { restart }
      for (const t of TABS) {
        const g = (GATES[t.mid] ?? (() => ({ ok: false, why: '未接' })))(driver, s, ctx)
        lastGates[t.mid] = g
        tabEl[t.mid].classList.toggle('rbb-option--live', !!g.ok)
        tabEl[t.mid].classList.toggle('rbb-option--off', !g.ok)
        tabEl[t.mid].title = g.ok ? '' : g.why
      }

      const supCard = driver.skillList().super
      sup.dataset.ready = supCard?.usable ? '1' : '0'
      layers[0].classList.toggle('rbb-super-layer--shine', !!supCard?.usable)
      sup.onclick = () => { if (!busy && supCard?.usable && onSuper) onSuper(supCard.skill.id) }

      // 阵亡强制换宠期间「无操作」也不能推进回合（同 setOptionActive(0,false) 的口径：这一手必须先换宠）
      noop.disabled = driver.mustChangePet() || driver.hasUsableSkill()   // 上游反向逻辑：有可用技能时这枚不该抢主路径
      noop.classList.toggle('rbb-noop--off', noop.disabled)

      if (s.isAutoOK && !auto.isConnected) bar.append(auto)
      else if (!s.isAutoOK && auto.isConnected) auto.remove()

      for (const t of TABS) upd[t.mid]?.(driver)
      paint()
    },
  }
}
