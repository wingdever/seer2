// U5 重启战斗舞台 —— 地图背景 SWF + 左右 fight SWF 精灵的**纯表现层**。
// 数值一律不碰（全在 game/core/** 经 coreBattleDriver）；这里只做两件事：装载原版 Flash、按语义切 clip。
// 装载/桥接口复用 AS3 battleScene 已验证口径：petContainer.root.swf?url=/swf/fight/{swfId}.swf
//   + getAvailableStates()/setState() + postMessage 'petRenderCallbacksReady' 就绪握手。
// 素材桥：swfId 由调用方经 CONTENT.swfIdOf 解析（与 icon 桥同一既定例外，官方表只贡献"动画 id 指针"、不贡献数值）。
// 缺素材/无 Ruffle ⇒ 该容器留空、不抛、写一行提示；战斗照常可打（DOM-only 兜底 = 今天的行为）。
// 取数纪律：暴击贴图配置经 content.js（DB-C）取，本文件只管画。
import { criticalPosterOf, criticalPosterUrl } from '../../content.js'
import { mountImg, petBattleUrl } from '../panels/battle/_kit.js'
import { hitDelayMsForShow, preloadHitInfo } from '../../../logic/battle-hit-info.js'

const W = 1200, H = 660
const PET_X_MY = 120, PET_X_OP = W - 120        // 左右宠在舞台空间里的 x（与 create() 里喂 SWF 的那两个值同源）
const FIGHT = '/swf/fight'
const MAP_BG = '/swf/map'
const STEP_MS = 650                 // **兜底**节奏：只在拿不到真信号时用（无出伤帧数据 / clip 不存在 / 停末帧段）

// 语义 → fight SWF 的 clip **有序候选链**（先命中先赢；整链走空 ⇒ 保持当前 clip + 记一行）。
// 词表是**封闭**的：vendor/seer2-pet-animator/actionscript/Fight.as 的 getAvailableStates() 只回
// FighterActionType.ALL_TYPES 里、且该 SWF 真有的 label，一共 15 个：
//   待机 / 物理攻击 / 属性攻击 / 特殊攻击 / 被打 / 被暴击 / 胜利 / 失败 / 闪避 / 必杀 / 濒死 / 个性出场 / 合体攻击 / 变身效果 / 空
// ⇒ 匹配只在白名单里做**精确相等**，不再对着一堆不存在的词做子串试探。
// ⚠️ 旧表是**一档扁平词表 + 子串匹配**，两处都是错的：
//   ① `attack: ['攻击', …]` 里 `'攻击'` 是 `物理攻击/属性攻击/特殊攻击/合体攻击` 的**共同子串** ⇒
//      物攻/属性/特殊打出的是哪一段全看 `getAvailableStates()` 的数组顺序，**等于随机**；
//   ② 表里 `魔法/技/被击/死亡/倒下/win/idle/stand/die/death/登场/出场/专属/大招` **一个都不在白名单里**，永远匹配不到。
// 语义与候选链的对应照上游 PetAnimationType（Skill.cs:513-526 + BattlePetAnimView.PlayDefaultAnim 的 trigger）：
//   物理→physic / 特殊→special / 属性→property / 必杀·连携→super / 挨打→hit / 挨暴击→crit / 闪避→miss
const CHAIN = {
  physic:  ['物理攻击', '特殊攻击'],
  special: ['特殊攻击', '物理攻击'],
  property: ['属性攻击', '特殊攻击', '物理攻击'],
  // 人类 2026-10-19 给的候选是「必杀 / 专属 / 大招 → 特殊攻击 → 物理攻击」；但 `专属`/`大招` 不在白名单里，
  // getAvailableStates() 永远不会返回它们 ⇒ 这里只留能命中的三档，意图记在 docs 里。
  super:   ['必杀', '特殊攻击', '物理攻击'],
  hit:     ['被打', '被暴击'],
  crit:    ['被暴击', '被打'],
  miss:    ['闪避', '被打'],
  ko:      ['失败', '濒死', '被打'],
  // 濒死：上游 AS3 FighterAnimation.adjustCurrentLabel 明写「没有『濒死』标签就退回『失败』」。
  // 触发 = 活着且 hp/maxHp < 0.2（UnitHudSystem.OnTurnStart / Fighter.playDefAction，两侧同口径）。
  dying:   ['濒死', '失败'],
  // 合体攻击 = 上游 `PetAnimationType.SecondSuper`（Unity）≡ AS3 clip `合体攻击`。判据 = 技能 `isSecondSuper`
  //   （我们表里 11 条：迪休拉之怒 / 雷鸣炎破斩 / 联盟的审判 / 伊特大乱斗 / 特鬼异星劫 …）。依据：两条血统的出伤帧表
  //   都把 SecondSuper 绑在 **fit 列**（`PetHitInfo.fit`、`AnimiationHitInfo.fit => INTERCOURSE`）。
  //   ⚠️ AS3 侧「合体」本体是**双精灵合体玩法**（服务端下合并、ErrorMap 有"合体失败，精灵身上星魂未移除"、
  //   UI 有"双精灵对战情况下无法完成合体！"）—— 我们是单打、也没有星魂，所以**只能借 SecondSuper 这批技触到 clip**。
  intercourse: ['合体攻击', '必杀', '特殊攻击', '物理攻击'],
  // 变身效果：**本血统完全没有触发器**，链留着 + 调试直调口（stage.showChange）。上游两条血统都取不到：
  //   AS3 = 服务端 `Command(19, "变身精灵")` 推 ⇒ `Processor_19` 置 `isChangeStatus=1` ⇒ `Fighter.disappear` 播 CHANGE_STATUS；
  //   Unity = `PetAnimationType.Morph` **从没被任何一处赋值**（死枚举），数据/脚本/option 里都搜不到 morph·change_status。
  change:  ['变身效果', '被打'],
  victory: ['胜利'],
  present: ['个性出场', '待机'],   // 上游 adjustCurrentLabel：没有『个性出场』标签就退回『待机』
  idle:    ['待机', '空'],
}

// 停在哪一帧不自动回待机的三种（上游 isStopLastFrame = [ABOUT_TO_DIE, DEAD, WIN]；
// AS3 侧同样把它们算作 MODE_STOP_LAST_FRAME）。回合尾部复位待机时要跳过它们，
// 否则濒死/阵亡/胜利的姿态会被下一条 idle 立刻抹掉。
const STICKY = new Set(['dying', 'ko', 'victory'])
const STICKY_MS = 900                 // 停末帧那三样的收尾节拍（它们不发 animationComplete，只能猜；旋钮）
const ANIM_DONE_FALLBACK_MS = 6000    // 首轮还不知道各 clip 真实长度时的兜底超时

// 演出以「一次行动」为单位（impl §17.18）：行动方动画 → 等出伤帧 → 对方的效果（受击动画 + 飘字 + 血牌，同一帧）
// → 等双方演完。各次行动**互不携带状态**。

// —— 演出时序的信号源 ——
// Fight.as 播完一段「非待机、非停末帧」的 clip 会 postMessage {type:'animationComplete', state, duration, instanceId}；
// duration = totalFrames / stage.frameRate（**秒**）。这才是「这一下演完了」的真信号 ——
// 我们此前用固定 STEP_MS=650 猜，而实测**打击帧**就有 1047~3364ms（出伤帧表）⇒ 两侧动画交叠，看着像「一起出手」。
const animWaiters = { my: [], op: [] }
const animDur = { my: new Map(), op: new Map() }          // 学到的 clip 真实秒数，用来给后续等待定超时
if (typeof addEventListener === 'function') {
  addEventListener('message', (e) => {
    const d = e.data
    if (!d || d.type !== 'animationComplete') return
    const list = animWaiters[d.instanceId]
    if (!list) return
    if (Number.isFinite(d.duration)) animDur[d.instanceId].set(d.state, d.duration)
    const i = list.findIndex((w) => w.state === d.state)
    if (i < 0) return
    list.splice(i, 1)[0].resolve(d.duration)
  })
}

function waitAnimDone(side, state) {
  const known = animDur[side].get(state)
  const budget = (Number.isFinite(known) ? known * 1000 : ANIM_DONE_FALLBACK_MS) + 400
  return new Promise((resolve) => {
    const w = { state, resolve }
    animWaiters[side].push(w)
    setTimeout(() => {
      const list = animWaiters[side]
      const i = list.indexOf(w)
      if (i >= 0) list.splice(i, 1)
      resolve(0)
    }, budget)
  })
}

// 拿不到真技能类型时的兜底（见 rbattleScene 的说明）：物理攻击是出现率最高的一段，拿它顶最不容易出戏。
export const DEFAULT_ATTACK_KIND = 'physic'

function pickState(list, chain) {
  for (const name of chain) if (list.includes(name)) return name
  return null
}

const mkPlayer = () => {
  try {
    const R = window.RufflePlayer
    if (!R || !R.newest) return null
    return R.newest().createPlayer()
  } catch { return null }
}

// 宠容器就绪握手（SWF 经 ExternalInterface postMessage 通知回调挂好）。
function waitCallback(instanceId, timeout = 20000) {
  return new Promise(resolve => {
    const h = e => { if (e.data?.instanceId === instanceId && e.data?.type === 'petRenderCallbacksReady') { removeEventListener('message', h); resolve() } }
    addEventListener('message', h)
    setTimeout(() => { removeEventListener('message', h); resolve() }, timeout)
  })
}

const mkBox = (id) => {
  const b = document.createElement('div')
  b.id = id
  b.className = 'rb-stage-box'
  return b
}

// ───────────────────────── DB2–DB5 伤害飘字层（上游真值见 docs/view/scene/battle/view-scene-battle-stage.md §9） ─────────────────────────
// 素材是上游 Unity 的松散 PNG（沿用开始场景 STI4 那条口径）：/projects/…/Assets/Resources/Sprites/…
const SPR = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites'
const dmgNumUrl = (ch) => `${SPR}/Numbers/Damage/${encodeURIComponent(ch)}.png`
const dmgBgUrl = (kind) => `${SPR}/Fight/damage ${kind}.png`
const dmgCritUrl = `${SPR}/Fight/critical.png`

// 尺寸逐项照上游（Damage Number.prefab 的 36×39 + localScale 1.5、BattleDamageBackgroundView 的字距 45、
// HelperUI.SetDamageBackgroundSprite 的框尺寸、Damage Background.prefab 的 Critical 框 37.2361×21.5647 + scale 2.7），
// 统一乘一个 DMG_SCALE —— 舞台 1200 宽 ≠ 上游 1920 画布，逐项换算没意义，一个旋钮靠人眼校（同 §4.10 路线 A）。
const DMG_SCALE = 0.9
const DIGIT_W = 36 * 1.5, DIGIT_H = 39 * 1.5, DIGIT_PITCH = 45
const CRIT_W = 37.2361 * 2.7, CRIT_H = 21.5647 * 2.7, CRIT_DX = -140.8, CRIT_DY = 3.5
const BUBBLE_BOX = { normal: [225, 158], weak: [225, 158], resist: [225, 158], miss: [128, 43], absorb: [116, 60] }
// 锚点分两套，**别混**：
//   气泡（伤害）—— 打在**被打方**身上。上游由出手方那侧的视图持有并触发，但作者把摆放挪到了对方一侧
//   （BattleAnimView.cs:9「Note that the damage view is on enemy's side.」），两支 clip 位移也都朝对方
//   （Me +170 / Op −30，1920 画布）。⚠️ 上游的**绝对**落点钉不死：CanvasScaler 参考 960×540、match=width，
//   而装气泡的 unit view 盒子只有 100×100（= 屏幕宽 1/9.6），prefab 里的 anchoredPosition.x 却写着 380~550
//   （自己盒子宽的 4~5 倍）—— 这两个数自相矛盾，说明 prefab 实例层级还原有断。**所以我们不抄绝对坐标，
//   只保留「落在被打方 + 朝被打方再飘一点」这个方向**，偏多偏少由 DMG_BIAS 这个旋钮定，靠人眼校。
//   数字的意义就是「这一下打在这儿」，落在挨打那只身上才读得对（人类 2026-10-19 拍板）。
const DMG_BIAS = 0.62
const DMG_DRIFT = 170 * (W / 1920)                 // Me 向右的位移（Op 用它的 30/170 比例）
const DMG_SPAN = PET_X_OP - PET_X_MY
const DMG_ANCHOR = {
  my: { x: PET_X_MY + DMG_SPAN * DMG_BIAS, dx: DMG_DRIFT, y: 210 },
  op: { x: PET_X_OP - DMG_SPAN * DMG_BIAS, dx: -DMG_DRIFT * (30 / 170), y: 210 },
}
// 该单位**自己**身上的数字（治疗 / 属性三色伤害）—— 上游 HealInfo 记在哪个 unit 上就画在哪个 unit 上，
//   不该跟着伤害气泡跑到对面去，所以单独一套（bias=0 = 就在那只宠正上方）。
const UNIT_ANCHOR = {
  my: { x: PET_X_MY, dx: 0, y: 210 },
  op: { x: PET_X_OP, dx: 0, y: 210 },
}
const COMBO_GAP_MS = 180                                  // BattleDamageAnimView.comboDamagePreviewInterval
const SPECIAL_DELAY_MS = 320

// 气泡底三档：elementRelation > 1 → weak、< 1 → resist（上游 HelperUI.cs:317，名字与直觉相反，照搬不改）。
const bgKindOf = (ev) => (ev.isHit ? (ev.damage === 0 ? 'absorb'
  : ev.elementRelation > 1 ? 'weak' : ev.elementRelation < 1 ? 'resist' : 'normal') : 'miss')

// 造一个气泡：底图 + 「%」与十进制数字逐字拼图 + 暴击角标（逐字照搬 BattleDamageBackgroundView.InstantiateDamageNum）。
function spawnBubble(layer, side, seg, ev, isFinal, delayMs) {
  const a = DMG_ANCHOR[side] ?? DMG_ANCHOR.my
  const kind = bgKindOf({ ...ev, damage: seg.damage })
  const box = BUBBLE_BOX[kind]
  const isDamage = ev.isHit && seg.damage !== 0

  const root = document.createElement('div')
  root.className = 'rb-dmg' + (kind === 'absorb' ? ' rb-dmg--absorb' : '')
  root.style.setProperty('--x0', a.x + 'px')
  root.style.setProperty('--x1', (a.x + a.dx) + 'px')
  root.style.setProperty('--y', a.y + 'px')
  root.style.animationDelay = delayMs + 'ms'
  // 终击的 1.2 放大（BattleDamageAnimView.SetFinalDamageEffects：暴击或伤害 > 500）
  root.style.setProperty('--peak', (isFinal && isDamage && (seg.isCritical || seg.damage > 500) ? 1.2 : 1).toFixed(2))

  const inner = document.createElement('div')
  inner.className = 'rb-dmg-in'
  const bg = document.createElement('img')
  bg.className = 'rb-dmg-bg'
  bg.src = dmgBgUrl(kind)
  bg.style.width = box[0] * DMG_SCALE + 'px'
  bg.style.height = box[1] * DMG_SCALE + 'px'
  inner.append(bg)

  if (isDamage) {
    const chars = ('%' + seg.damage).split('')
    const half = Math.trunc(chars.length / 2)
    const shift = chars.length % 2 === 1 ? 0 : 22.5      // 偶数位数整体右移半格才居中
    chars.forEach((ch, i) => {
      const img = document.createElement('img')
      img.className = 'rb-dmg-num'
      img.src = dmgNumUrl(ch)
      img.style.width = DIGIT_W * DMG_SCALE + 'px'
      img.style.height = DIGIT_H * DMG_SCALE + 'px'
      img.style.left = 'calc(50% + ' + (DIGIT_PITCH * (i - half) + shift) * DMG_SCALE + 'px)'
      inner.append(img)
    })
    if (seg.isCritical) {
      const crit = document.createElement('img')
      crit.className = 'rb-dmg-crit'
      crit.src = dmgCritUrl
      crit.style.width = CRIT_W * DMG_SCALE + 'px'
      crit.style.height = CRIT_H * DMG_SCALE + 'px'
      crit.style.left = 'calc(50% + ' + (CRIT_DX - 25 * (chars.length - 4)) * DMG_SCALE + 'px)'
      crit.style.top = 'calc(50% + ' + CRIT_DY * DMG_SCALE + 'px)'
      inner.append(crit)
    }
  }

  root.append(inner)
  layer.append(root)
  const life = kind === 'absorb' ? 500 : 920
  setTimeout(() => root.remove(), delayMs + life + 60)
}

// 彩色文字通道（三色属性伤害 + 治疗）：上游走 HealInfo 那条 Text 通道，不是气泡。
// 无 type（普通治疗）与 item ⇒ 向下沉；element/pink/white ⇒ 先沉 50 再上浮（BattleDamageAnimView.SetHealAnim）。
function spawnSpecial(layer, sp, delayMs) {
  const a = UNIT_ANCHOR[sp.side] ?? UNIT_ANCHOR.my
  const n = document.createElement('div')
  n.className = 'rb-heal rb-heal--' + (sp.dir === 'up' ? 'up' : 'down')
  n.textContent = sp.text
  n.style.color = sp.color
  n.style.left = a.x + 'px'
  n.style.top = (a.y + 70) + 'px'
  n.style.animationDelay = delayMs + 'ms'
  layer.append(n)
  setTimeout(() => n.remove(), delayMs + 1400)
}


// ───────────────────────── DB-B 相机屏震 / 闪白 · DB-S 技能气泡 · DB-C 暴击贴图 ─────────────────────────
// 上游 FightCamaraController.cs:5-44 / BattleSkillBubbleAnimView.cs / BattleCriticalEffectView.cs + BattleCriticalEffectConfig.cs。

// —— 屏震（ScreenShake）——
// 上游是一个协程：每 Interval(0.1s) 一步、共 ScreenShakeInitTime(1.8s)=18 步，每步 e = -e * declineExtent
// （**负号 ⇒ 逐帧左右交替**，幅度按 |0.6| 衰减），同时挪两样东西：
//   相机 position = (e, -e/3, -5) —— 正交 size=5 ⇒ 满屏 10 单位 = 1080 参考像素 ⇒ 1 单位 = 108 px；
//   UI 层 anchoredPosition = (e*30, -e*10) px。
// 相机右移 ⇒ 画面左移，故玩家看到的净位移 = (-108e + 30e, +36e - 10e) = (-78e, +26e) px（1920 画布）。
// 我们的舞台是 1200 宽 ⇒ 再乘 STAGE_K。HUD 那层（uiLayerRect）我们并进同一层一起晃，不单独动 #rv。
const SHAKE_STEP_MS = 100, SHAKE_STEPS = 18, SHAKE_DECAY = 0.6, SHAKE_AMP = 0.75
const SHAKE_UNIT_PX = 108 * (W / 1920)   // 相机 1 单位在 1200 舞台上的像素
const SHAKE_UI_X = 30 * (W / 1920), SHAKE_UI_Y = 10 * (W / 1920)
const SHAKE_X = -(SHAKE_UNIT_PX - SHAKE_UI_X), SHAKE_Y = SHAKE_UNIT_PX / 3 - SHAKE_UI_Y
const BIG_DAMAGE_SHAKE = 400, BIG_DAMAGE_FLASH = 500   // shakeWhenBigDamage / flashWhenBigDamage（C# 缺省皆 true，我们无设置面板）

// —— 闪白（ScreenFlash）—— Animation/Fight/Flash/Flash.anim：0.12s，r 恒 1，g 0→1，b 0→1→0.5→0，a 恒 1。
const FLASH_MS = 120

// —— 技能气泡（BattleSkillBubbleAnimView）—— 底图 Sprites/Fight/Skill name bar.png（实测 292×26）、
//   字号 14、字色 (0,1,0.96)=#00fff5、居中（m_Alignment:4）、显示 2.5 秒后隐藏（源码注释「2.5秒后自动消失」）。
const SKILL_BAR_W = 292, SKILL_BAR_H = 26, SKILL_BAR_MS = 2500, SKILL_TEXT_COLOR = '#00fff5'
const SKILL_BAR_ANCHOR = { my: { x: 16, y: 26 }, op: { x: 620, y: 26 } }   // 上游锚在各自 unit view 的左上角

// —— 暴击贴图（BattleCriticalEffectView.Play）—— EaseOut 从 center-offset 滑到 center+offset，
//   alpha 三段：0→18% 淡入、62% 后淡出；localScale=(dir,1,1)（出手方是敌方 ⇒ 左右翻转）。
const CRIT_EASE = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)   // EaseOut
const critAlpha = (t) => (t < 0.18 ? Math.max(0, t / 0.18) : 1 - Math.max(0, Math.min(1, (t - 0.62) / 0.38)))


// 屏震：把上游那个协程原样搬成定时器。overscan = 位移越大放大越多，保证震动时舞台边缘不露黑边。
// shakeToken：同一次伤害里可能连着触发两次（暴击 + 大伤害）—— 上游是两个协程互抢 transform，
// 这里改成「后一次顶掉前一次」，视觉上就是重新起振，不会两路位移打架。
let shakeToken = 0
function screenShake(shakeEl, declineExtent = SHAKE_DECAY, shakeExtent = SHAKE_AMP) {
  const token = ++shakeToken
  let e = shakeExtent
  let n = 0
  const tick = () => {
    if (token !== shakeToken) return
    e = -e * declineExtent
    const dx = SHAKE_X * e, dy = SHAKE_Y * e
    const over = 1 + Math.max(Math.abs(dx) / W, Math.abs(dy) / H)
    shakeEl.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${over.toFixed(4)})`
    if (++n >= SHAKE_STEPS) { shakeEl.style.transform = ''; return }
    setTimeout(tick, SHAKE_STEP_MS)
  };
  tick()
}

// 闪白：上游是 Animator.SetTrigger("Flash")，颜色曲线在 CSS 里（Flash.anim 逐点照搬），这里只负责起一次。
function screenFlash(flashEl) {
  if (!flashEl) return
  flashEl.classList.remove('is-on');
  void flashEl.offsetWidth;                                  // 强制重排，让同一次伤害里的重复触发能重放
  flashEl.classList.add('is-on');
  setTimeout(() => flashEl.classList.remove('is-on'), FLASH_MS + 40);
}

// 技能气泡：底图 + 居中技能名，显示 2.5s（同一次出手重名就重画，别叠）。
function spawnSkillBubble(layer, side, ev) {
  if (!ev || !ev.skillName) return
  const a = SKILL_BAR_ANCHOR[side] ?? SKILL_BAR_ANCHOR.my
  const box = document.createElement('div')
  box.className = 'rb-skillbar'
  box.style.left = a.x + 'px';
  box.style.top = a.y + 'px';
  box.style.width = SKILL_BAR_W + 'px';
  box.style.height = SKILL_BAR_H + 'px';
  box.style.backgroundImage = `url(${SPR}/Fight/Skill%20name%20bar.png)`;
  const t = document.createElement('span');
  t.className = 'rb-skillbar-t';
  t.style.color = SKILL_TEXT_COLOR;
  t.textContent = ev.skillCombo !== 1 ? `${ev.skillName}（${ev.skillCombo}连击）` : ev.skillName;
  box.append(t);
  layer.append(box);
  setTimeout(() => box.remove(), SKILL_BAR_MS);
}

// 暴击贴图：BattleCriticalEffectView.Play 的逐条搬（EaseOut 位移 + 三段 alpha + 出手方是敌方则水平翻转）。
// 配置查不到（默认表的 animId/baseId 都没配）⇒ 什么都不画，这是上游的静默返回，不报错。
function spawnCriticalPoster(layer, side, ev) {
  if (!ev || !ev.isCritical || ev.damage === 0 || ev.damageType === false) return
  const cfg = criticalPosterOf(ev.attackAnimId, ev.attackBaseId)
  if (!cfg) return
  const dir = side === 'my' ? 1 : -1                                   // isMe ? +1 : -1
  const a = DMG_ANCHOR[side] ?? DMG_ANCHOR.my
  const cx = a.x + cfg.x * dir, cy = a.y + cfg.y;                     // centerPosition + AnchoredPosition
  const img = document.createElement('img');
  img.className = 'rb-crit';
  img.src = criticalPosterUrl(cfg);
  img.style.left = cx + 'px';
  img.style.top = cy + 'px';
  img.style.transform = `translate(-50%, -50%) scaleX(${dir}) scale(${cfg.scale * DMG_SCALE})`;
  layer.append(img);
  const durMs = Math.max(0, cfg.duration) * 1000;
  if (!(durMs > 0)) { img.remove(); return }                           // config.Duration <= 0 ⇒ 上游立刻 Destroy
  const ox = cfg.moveX * dir, oy = cfg.moveY;
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / durMs);
    const k = CRIT_EASE(t);
    img.style.left = (cx - ox + 2 * ox * k) + 'px';
    img.style.top = (cy - oy + 2 * oy * k) + 'px';
    img.style.opacity = String(critAlpha(t));
    if (t < 1) requestAnimationFrame(step); else img.remove();
  };
  requestAnimationFrame(step);
}

// F14（施工图 §3.4）：三层包进 #rb-stage，只按视口宽缩放（transform-origin:0 0）。
// #wrap 宽 1200 时 scale=1 ⇒ rbattle-stage-test 的几何判据逐字节同今天；full 模式由 screen.js 经 transform 缩放整个 #wrap，画面铺满靠 screen.js 而不是本层。
// 演出逻辑、offsetX/offsetY、clip 候选链一律不动；STEP_MS 已从「固定节奏」降为「兜底节奏」（见 playRound）。
function mountStage(wrap) {
  const host = document.createElement('div')
  host.id = 'rb-stage'
  wrap.append(host)
  const fit = () => { host.style.transform = `scale(${(wrap.clientWidth || W) / W})` }
  fit()
  let ro = null
  if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(wrap) }
  return { host, destroy() { try { ro?.disconnect() } catch { /* noop */ } host.remove() } }
}

// stage: 装载地图背景 + 两侧宠 fight SWF，供场景按战报增量播 clip。
export function create({ mySwfId, opSwfId, myPetId, opPetId, fightMap = '100002', log = () => {} }) {
  const wrap = document.getElementById('wrap')
  if (!wrap) throw new Error('战斗舞台：找不到 #wrap')

  const bgBox = mkBox('rb-bg')
  const myBox = mkBox('rb-fL')
  const opBox = mkBox('rb-fR')
  const dmgBox = mkBox('rb-dmg')
  const shakeBox = mkBox('rb-shake')                    // DB-B：屏震/闪白/技能气泡/暴击贴图都落在这层（震屏只晃它）
  const stageHost = mountStage(wrap)
  // #rv(z60) 由 host 之后 append，DOM 序 + z-index 双重压在舞台上
  stageHost.host.append(shakeBox)
  shakeBox.append(bgBox, myBox, opBox, dmgBox)
  const dmgLayer = dmgBox
  const shakeLayer = shakeBox
  // 闪白要盖住**整个窗口**（#rb-stage 只按宽缩放，高度未必铺满（full 模式下 #wrap 被 screen.js 缩放后也可能仍非满高）⇒ 单独挂 #wrap。
  const flashBox = document.createElement('div')
  flashBox.id = 'rb-flash'
  wrap.append(flashBox)

  const sides = {
    my: { box: myBox, x: PET_X_MY, mirror: false, player: null, states: [] },
    op: { box: opBox, x: PET_X_OP, mirror: true, player: null, states: [] },
  }
  const setStateCalls = []            // 演出探针（harness 记录 setState 序列）
  let seqToken = 0                    // 防过期的 idle 复位覆盖新序列

  async function loadBg() {
    bgBox.innerHTML = ''
    const p = mkPlayer()
    if (!p) { bgNote('（无 Ruffle：背景降级为纯色）'); return }
    bgBox.append(p)
    await p.ruffle().load({
      url: `${MAP_BG}/${fightMap}.swf`, autoplay: 'on', unmuteOverlay: 'hidden',
      scale: 'showAll', menu: false, warnOnUnsupportedContent: false,
    }).catch(() => { bgNote(`（背景缺失: ${fightMap}）`) })
  }
  function bgNote(t) { const n = document.createElement('div'); n.className = 'rb-stage-note'; n.textContent = t; bgBox.append(n) }

  async function loadFighter(side, swfId, petId) {
    const s = sides[side]
    s.swfId = swfId                    // 出伤帧表的键（上游 HitInfoConfig.getHitData 收的就是这个动画资源 id）
    s.box.innerHTML = ''
    if (swfId == null) { showFallback(s.box, petId, '（无动画素材，显示重启战斗形象）'); return }
    const p = mkPlayer()
    if (!p) { stageNote(s.box, '（无 Ruffle）'); return }
    s.box.append(p)
    const params = new URLSearchParams({
      url: `${FIGHT}/${swfId}.swf`, instanceId: side, scale: 'noScale',
      offsetX: String(s.x), offsetY: '50', scaleX: s.mirror ? '-1' : '1', scaleY: '1',
    })
    const cb = waitCallback(side)
    await p.ruffle().load({
      url: '/game/petContainer.root.swf?' + params, allowScriptAccess: true, wmode: 'transparent',
      autoplay: 'on', unmuteOverlay: 'hidden', scale: 'noScale', menu: false,
    }).catch(() => { stageNote(s.box, `（精灵动画缺失: ${swfId}）`) })
    await cb
    s.player = p
    try { s.states = (await p.getAvailableStates?.()) || [] } catch { s.states = [] }
    // petContainer 外层装载恒成功 (它自己 200)，真正的缺素材是内层 {swfId}.swf 404 → 无回调 → 状态表空。
    // 故以「状态表为空」为缺素材判据 (成功装载的 fight SWF 必有状态)，而不是外层 load 是否 reject。
    if (!s.states.length) { showFallback(s.box, petId, '（精灵动画缺失，显示重启战斗形象）') }
    log(`[stage] ${side} 动画状态: ${s.states.join(' / ') || '(无)'}`)
  }
  function stageNote(box, t) { const n = document.createElement('div'); n.className = 'rb-stage-note'; n.textContent = t; box.append(n) }
  // 缺 swf（无映射 / 文件缺失）=> 显示重启战斗形象 png，不抛、不阻塞战斗。
  function showFallback(box, petId, msg) { try { mountImg(box, petBattleUrl(petId)) } catch {} stageNote(box, msg) }

  // 把某侧切到最匹配 kinds 的状态；命中才算一次演出（供探针）。
  function applyChosen(side, name) {
  try { Promise.resolve(sides[side].player.setState?.(name)).catch(() => {}) } catch { /* noop */ }
  setStateCalls.push({ side, state: name })
}

function applyState(side, chain) {
  const s = sides[side]
  if (!s.player) return null
  const name = pickState(s.states, chain)
  if (!name) { log(`[stage] ${side} 无匹配动画（候选 ${chain.join('/')}）⇒ 保持当前 clip`); return null }
  applyChosen(side, name)
  return name
}

// 切 clip 并**等它演完**。先注册等待再 setState —— 极短 clip 有可能在注册之前就播完，那样会漏掉事件。
function playClip(side, chain) {
  const s = sides[side]
  if (!s.player) return { name: null, done: Promise.resolve(0) }
  const name = pickState(s.states, chain)
  if (!name) { log(`[stage] ${side} 无匹配动画（候选 ${chain.join('/')}）⇒ 保持当前 clip`); return { name: null, done: Promise.resolve(0) } }
  const done = waitAnimDone(side, name)
  applyChosen(side, name)
  return { name, done }
}

  const ready = (async () => {
    await Promise.all([loadBg(), loadFighter('my', mySwfId, myPetId), loadFighter('op', opSwfId, opPetId)])
    return stage
  })()
  preloadHitInfo()          // 出伤帧表预热（失败不阻塞；没加载完时首次攻击回退 STEP_MS）

  // 伤害飘字入口（DB2–DB5）：连击逐段冒泡（= 上游缺省 AllComboOnly，不出总数），随后冒彩色文字。
  // 非阻塞 —— 连击的段间间隔用 animation-delay 表达，不占 playRound 的 STEP_MS 节奏。
  function showDamage(ev) {
    if (!ev || !dmgLayer) return
    const isFinal = !ev.combo || ev.combo.length === 0
    const segs = isFinal ? [{ damage: ev.damage, isCritical: ev.isCritical }] : ev.combo
    // ⚠️ `showBubble === false` = 上游 OnHit 的三个条件（攻击技 / 没命中 / 真掉血）全不成立 ⇒ 上游**根本不建**
    //   DamageInfo，于是既没有气泡、对方也不播受击/闪避，只有 specials 那条彩色数字通道。
    //   典型：属性技（不掷命中、红伤为 0）。AS3 同口径：FightTurnResultParser.as:102 的 `categoryId != BUF(4)`。
    if (ev.showBubble !== false) {
      segs.forEach((seg, i) => spawnBubble(dmgLayer, ev.atkSide, seg, ev, isFinal, i * COMBO_GAP_MS))
    }
    ;(ev.specials || []).forEach((sp, i) => spawnSpecial(dmgLayer, sp, SPECIAL_DELAY_MS + i * 140))
    // DB-B：屏震 / 闪白 / 暴击贴图。⚠️ DamageType=false（回合末 buff 伤）这一路 upstream 在
    //   SetFinalDamageEffects 里那句 `if (!info.DamageType || !isDamage) return` 就早退了 ⇒ 这里同样整段跳过。
    if (ev.damageType !== false && ev.isHit) {
      // 连击：逐段暴击都震一下，幅度更小（BattleDamageAnimView.SetComboDamageObject 的 camara.ScreenShake(0.4f)）
      for (const seg of segs) if (seg.damage !== 0 && seg.isCritical) screenShake(shakeLayer, 0.4)
      const last = segs[segs.length - 1]
      if (last.damage !== 0 && last.isCritical) spawnCriticalPoster(dmgLayer, ev.atkSide, ev)
      if (last.damage !== 0 && (last.isCritical || last.damage > BIG_DAMAGE_SHAKE)) screenShake(shakeLayer)
      if (last.damage > BIG_DAMAGE_FLASH) screenFlash(flashBox)
    }
  }

  // 技能气泡独立出口：上游是在「出手」那一刻出的（BattleAnimView.SetPet → skillBubbleView.SetSkill），
  // 落在出手方那侧；场景把这条挂到 attack/super 动作上，而不是等「被击」。
  function showSkill(ev) {
    if (!ev) return
    spawnSkillBubble(dmgLayer, ev.atkSide, ev)
    // 必杀 / 连携出招那一刻额外震一下 —— 上游 BattlePetAnimView.ScreenShake(type)：
    //   type ∈ {Super, SecondSuper} 时 camara.ScreenShake(0.4f)（与伤害那条屏震同一个机，参数也是 0.4）。
    if (ev.isSuperSkill) screenShake(shakeLayer, 0.4)
  }

  // 登场 → 双方入待机。
  async function present() {
    applyState('my', CHAIN.present)
    applyState('op', CHAIN.present)
    await sleep(STEP_MS)
    applyState('my', CHAIN.idle)
    applyState('op', CHAIN.idle)
  }

  // 逐回合动作序列：[{side, kind, dmg?, skill?}]（kind ∈ CHAIN 键）。
  //
  // **时序是这一段的主体**（人类 2026-10-19 报障「双方一起出手」）：内核一整个回合是同步跑完的，
  // 表现层只能靠「等真信号」把节奏排对 —— 此前一律 sleep(STEP_MS=650)，而出伤帧表实测 1047~3364ms，
  // ⇒ 我方还在挥击，对方的挨打与还手已经叠上来了。三类动作各等各的：
  //   攻击类：切 clip 后只等到**打击帧**（出伤帧表；没有数据才回退 STEP_MS）就往下走；
  //   受击类：与飘字同帧出，然后等这段受击演完 **并等挥击那段也收尾** ⇒ 严格一方打完另一方再动；
  //   其它  ：播完即止；STICKY 三种停末帧不发 animationComplete，只等一个短兜底。
  // playRound 是 fire-and-forget（onRender 不 await 它），所以把「当前这一轮演到哪儿了」记下来，
  // 供战斗结束时等演出收尾再弹结算（人类 2026-10-19「结算应当在本回合动画播完后再弹」）。
  let playing = Promise.resolve()
  const timing = []                 // 每次行动实际用了哪档出伤帧（调试直读：__battle.stage.timing）
  function playRound(steps, opts = {}) {
    playing = runRound(steps, opts)
    return playing
  }

  // 一次「行动」：① 行动方动画 → ② 等出伤帧 → ③ 对方的效果（受击动画 + 飘字 + 血牌，**同一帧**）→ ④ 等双方演完。
  // **自包含**：不跨行动携带任何状态，上一次行动演完下一次才独立开始（人类 2026-10-19）。
  async function runAction(st, opts) {
    // ① 行动方动画。段位优先用内核给的 skillKind（物理/特殊/属性/必杀各播各的），拿不到才按物攻兜底。
    const chain = CHAIN[st.kind] ?? (st.attack ? CHAIN[DEFAULT_ATTACK_KIND] : null)
    const atk = chain ? playClip(st.side, chain) : { name: null, done: Promise.resolve(0) }
    if (st.skill) showSkill(st.skill)              // 技能气泡在出手那一刻出（上游 BattleAnimView.SetPet）
    if (!st.attack) { await sleep(STEP_MS); return }   // 空过/换宠/逃跑：不播攻击动画、对方无反应

    // ② 等出伤帧。⚠️ 必须用 **await 版** 查表（表异步取，同步查会 miss → 退回过短的兜底 ⇒ 提前结算，
    //   人类 2026-10-19 报障）。该宠该列配 0 时走「同行动已配列中位数」代理，说明见 battle-hit-info.js。
    const hit = st.skill && st.skill.skillKind
      ? await hitDelayMsForShow(sides[st.side].swfId, st.skill.skillKind)
      : { ms: null, proxy: false }
    const waited = hit.ms == null ? '等动画演完' : hit.ms + 'ms' + (hit.proxy ? '（代理：该宠该列未配，取同行动已配列中位数）' : '');
    timing.push({ side: st.side, kind: st.skill ? st.skill.skillKind : null, swfId: sides[st.side].swfId,
      ms: hit.ms, proxy: hit.proxy, fallback: hit.ms === null });
    log(`[stage] ${st.side} ${st.skill ? st.skill.skillKind : '?'} 出伤帧 ${waited}`);
    if (hit.ms != null) await sleep(hit.ms);
    else if (atk.name) await atk.done;
    else await sleep(STEP_MS);

    // ③ 到点了：对方的效果与血牌**同一帧**出（上游 = 同一个 SetCurrentUIState，见 coreBattleDriver 的 defHp 注释）
    let def = null
    if (st.dmg) {
      const rk = CHAIN[st.reaction] ?? CHAIN.hit
      def = playClip(st.defSide, rk)
      showDamage(st.dmg)
    }
    // 血牌快照挂在**攻击事件**上：一次打击帧要把**两侧**都定住（atkHp/defHp），否则行动方那格会读到
    // 「回合末」的真身血、跟着被打方一起掉（人类 2026-10-19 报障）。零伤害的行动（洒水）同样要刷。
    if (st.skill && st.skill.defHp != null) {
      log(`[stage] 打击帧 ${st.side} 出手 ⇒ ${st.skill.atkSide} hp=${st.skill.atkHp} / ${st.skill.defSide} hp=${st.skill.defHp}`)
      opts.onContact?.(st.skill)
    } else {
      opts.onContact?.(null)
    }
    // ④ 等这一段双方都演完 ⇒ 下一条行动独立开始
    if (def && def.name) await def.done;
    if (atk.name) await atk.done;
  }

  // 非行动条目（登场 / 回合末 buff / 濒死 / 阵亡 / 胜利）
  async function runFx(st, opts) {
    if (st.dmg) showDamage(st.dmg);
    const { name, done } = playClip(st.side, CHAIN[st.kind] ?? []);
    // 停末帧的三种**不发** animationComplete（Fight.as 的 isStopLastFrame 分支直接 stop）⇒ 只能给固定节拍。
    if (name && !STICKY.has(st.kind)) await done;
    else await sleep(STICKY.has(st.kind) ? STICKY_MS : STEP_MS);
  }

  async function runRound(steps, opts) {
    const my = ++seqToken
    for (const st of (steps || [])) {
      if (my !== seqToken) return      // 已被更新的回合取代
      if (st.type === 'act') await runAction(st, opts);
      else await runFx(st, opts);
    }
    if (my !== seqToken) return              // 已被更新的回合取代 ⇒ 不再复位（新序列自己会管）
    // 复位待机要跳过「停最后一帧」的三种（濒死/阵亡/胜利）：它们是刻意保持的姿态，
    // 被下一条 idle 抹掉就等于没播（这也是此前 ko/victory 播了等于没播的原因）。
    const lastOf = { my: null, op: null };
    for (const st of (steps || [])) if (st.type === 'act' && STICKY.has(st.kind)) lastOf[st.side] = st;
    for (const st of (steps || [])) if (st.type === 'fx' && STICKY.has(st.kind)) lastOf[st.side] = st;
    for (const side of ['my', 'op']) {
      if (lastOf[side]) continue;
      applyState(side, CHAIN.idle);
    }
  }
  const stage = {
    ready,
    present,
    playRound,
    reloadFighter: (side, swfId) => loadFighter(side, swfId),   // 换宠后重装卸新在场宠的 fight SWF（纯表现，缺素材不抛）
    setState: (side, kind) => applyState(side, CHAIN[kind] || []),   // 供单步驱动/测
    chains: CHAIN,                                    // 调试直读：看一条语义到底会选哪个 clip
    availableStates: (side) => sides[side]?.states || [],
    hasRuffle: () => !!mkPlayer(),
    whenIdle: () => playing,                          // 等当前这一轮演出收尾（战斗结束弹结算前用）
    timing,                                            // [{side, kind, swfId, ms, fallback}] 本场每次攻击实际用的节奏
    showDamage,
    showSkill,
    // ── 调试直调面：三条「有素材/有链但正常流程打不到」的演出（人类 2026-10-19 要「处理一下」时加的）──
    //   showCriticalPoster(side, swfId) —— 暴击大贴图。全盘**只有 1 条配置**（anim/990 约瑟 JoseCritical），
    //     不打约瑟就看不到 ⇒ 这个口直接按 swfId 查表播。
    //   showIntercourse(side) / showChange(side) —— 合体攻击 / 变身效果。**本血统没有触发器**（见下），链留着，
    //     这两个口让素材能被看到、能被验收。
    showCriticalPoster: (side, swfId) => spawnCriticalPoster(dmgLayer, side, {
      damage: 1, isHit: true, isCritical: true, damageType: true,
      attackAnimId: Number(swfId), attackBaseId: Number(swfId), specials: [], combo: [],
    }),
    showIntercourse: (side) => applyState(side, CHAIN.intercourse),
    showChange: (side) => applyState(side, CHAIN.change),
    swfIdOf: (side) => sides[side]?.swfId ?? null,
    criticalPosterFor: (swfId) => criticalPosterOf(Number(swfId), Number(swfId)),
    screenShake: (decline, amp) => screenShake(shakeLayer, decline, amp),   // 调试直调面
    screenFlash: () => screenFlash(flashBox),
    boxes: { bg: bgBox, my: myBox, op: opBox, dmg: dmgBox },
    setStateCalls,
    destroy() {
      seqToken++
      flashBox.remove()
      stageHost.destroy()
    },
  }
  return stage
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
