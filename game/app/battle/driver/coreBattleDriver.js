// U1 薄内核战斗驱动 —— 浏览器里跑真·重启战斗内核（game/core/**）的唯一入口。
// 镜像差分 harness（tools/snap-mirror.mjs makeDriveHost + minePhaseDrive + INJECT_JUDGE）的端到端跑法，
// 差别只在：载入生成的 .js、用 content 真宠造 BattlePetView、PhaseUI 用于渲染（见 phaseUi.js）。
// 纪律：本文件不碰 game/core/**；它对 core 单例（JUDGE/PHASE_BATTLE/表）的写只发生在浏览器这份模块实例里，
// 与 difftest.mjs（独立 node 进程、import .ts）进程隔离，基线不受影响。见 docs 计划 rough-meadow-swallow.md。
import { ensureTables } from './tables.js'
import { Pet } from '/game/core/pet/pet.js'
import { BattlePet } from '/game/core/battle/battle-pet.js'
import { createPhaseUi } from './phaseUi.js'


import { setEffectJudgement } from '/game/core/battle/effect-handler.js'
import { condition as judgeCondition, apply as judgeApply, checkAndApply } from '/game/core/effect/effect-judge.js'
import { setPhaseBattle, battleNextPhase, TurnStartPhase, TurnReadyPhase } from '/game/core/battle/phase.js'
import { setIdentifierBattle, setEffectIdentHost } from '/game/core/parser/identifier-effect.js'
import { BattleState, Unit } from '/game/core/battle/state.js'
import { BattleSettings } from '/game/core/battle/settings.js'
import { noOpSkill, escapeSkill, petChangeSkill, isAttackSkill } from '/game/core/battle/views.js'
import { Effect, effectFromRow } from '/game/core/effect/effect.js'
import { EffectTiming } from '/game/core/effect/effect-database.js'
import { createRng } from '/game/core/rng.js'
import { SkillType } from '/game/core/pet/skill.js'
// S4 同种子重放：把各算子/控制器的 native-Random 注入缝接到**同一个**种子流（= 上游那只 UnityEngine.Random）。
// 少接任意一个，对应随机臂就会在浏览器里抛 NOT_PORTED 被 nextRound 的围栏吞成无操作。
import { setOpsSkillRng } from '/game/core/effect/ops-skill.js'
import { setOpsRageRng } from '/game/core/effect/ops-rage.js'
import { setOpsPokerRng } from '/game/core/effect/ops-poker.js'
import { setOpsPowerupRng } from '/game/core/effect/ops-powerup.js'
import { setOpsPetRng } from '/game/core/effect/ops-pet.js'
import { setOpsCopyBuffRng } from '/game/core/effect/ops-copy-buff.js'
import { setOpsBuffRng } from '/game/core/effect/ops-buff.js'
import { setBuffResistRng, setBuffRemoveRng } from '/game/core/pet/buff-controller.js'
import { readRandom, writeRandom } from '../../session.js'

const END_SENTINEL = 'NOT_PORTED: BattleEndPhase'   // BattleEndPhase.doWork 的抛（唯一被当作 over 吞掉的抛）

// ───────────────────────── DB1 伤害飘字信号层（只读投影，不改内核） ─────────────────────────
// 上游这两个对象是 AttackPhase 在 UI 帧上调 atkUnit.hudSystem.OnHit(...) 造出来的
// （AttackPhase.cs:101-102 → UnitHudSystem.cs:101-127/186-233）。我们的 Unit 不建 hudSystem
// （game/core/battle/state.ts 文件头围栏），所以在驱动层照**同一套算法**重算一遍：
//   一次出手 = 内核 (turn, actionCursor, whosTurn) 三元组唯一确定 ⇒ 用它做去重键，同键后到的帧覆盖先到的
//   （skillSystem 在这次出手结束前不会被重置，取最后一份与 AttackPhase 那几帧同源同值）。
// ⚠️ 只覆盖**技能伤害/治疗**这一路。回合末的 buff 掉血/回血（上游 UnitHudSystem.OnTurnEnd）在我们的
//   TurnEndPhase 里 whosTurn 已被置 0、无法归位到出手方 ⇒ 本批不做，见 view-scene-battle-stage.md §9.7。
const MAX_COMBO_DISPLAY = 30                       // UnitHudSystem.cs:134 的 const

// 连击均摊：把原始每段伤害按段数均摊成 ≤30 段整数，余数给前几段各 +1；
// 某段 isCritical = 它覆盖的原始段里任一段暴击即真（UnitHudSystem.cs:137-160 逐字照搬）。
function evenComboDamage(list, finalDamage) {
  const src = list.length
  const n = Math.min(src, MAX_COMBO_DISPLAY)
  const total = Math.max(finalDamage, 0)
  const base = Math.trunc(total / n)
  const rest = total % n
  const out = []
  for (let i = 0; i < n; i++) {
    const start = Math.trunc((i * src) / n)
    const end = Math.trunc(((i + 1) * src) / n)
    let isCritical = false
    for (let s = start; s < end; s++) if (list[s].isCritical) { isCritical = true; break }
    out.push({ damage: base + (i < rest ? 1 : 0), isCritical })
  }
  return out
}

// HealInfo 的取色/取字（UnitHudSystem.cs:200-233 逐字照搬）
const healColor = (type, value) =>
  type === 'element' ? '#ed780e' : type === 'pink' ? '#ff40ff' : type === 'white' ? '#ffffff'
    : (value >= 0 ? '#77e20c' : '#ff0000')
const healText = (value) => (value >= 0 ? '+' : '') + value

// Skill.GetPetAnimationType 的语义版（Skill.cs:513-526）：只出「该播哪一段」，不出 PetAnimationType 枚举本身
// （枚举那侧还分 SecondSuper，展示层要单独拿 —— 见下面合体那条）。
// null = 上游那条链走完返回 PetAnimationType.None ⇒ 不播攻击动画。
const petAnimKindOf = (skill) => {
  if (!skill) return null
  const t = skill.type
  if (t === SkillType.物理) return 'physic'
  if (t === SkillType.特殊) return 'special'
  if (t === SkillType.属性) return 'property'
  if (t === SkillType.必杀 || t === SkillType.连携) return skill.isSecondSuper ? 'intercourse' : 'super'
  return null
}

// ── 攻击语义信号（DB-S）──
// 上游是**两条互不相干**的通道（BattleAnimView）：
//   SetPet(currentUnit)  —— 动画 + 技能气泡，来自 currentUnit.skill / hudSystem.petAnimType，**与有没有伤害无关**；
//   SetDamage(currentUnit) —— 伤害气泡，来自 hudSystem.CurDamageInfo，**可能整个不存在**。
// 我们此前把两条并成一条（从伤害事件上取技能类型），于是「零伤害的攻击技」拿不到信号 ——
//   实例（人类 2026-10-19 报障）：迪兰用「洒水」播的是物攻。该技能 type=0（属性）、power=0，
//   唯一效果是 powerup/who=op/mat=-1（纯减魔攻）⇒ totalSkillDamage=0 ⇒ addReport 的
//   `skill.type > 属性 || totalSkillDamage > 0` 两个条件都不成立 ⇒ 战报里**没有**「對…造成了…」那一行
//   ⇒ 没有「被击」动作 ⇒ zip 挂不上 ⇒ 出手动作停在默认的物攻。
// 本函数就是补回第一条通道：只要这一手是攻击技（属性/物理/特殊/必杀/连携），就发一条，与伤害无关。
function attackEventOf(st) {
  const atk = st.atkUnit
  const sys = atk ? atk.skillSystem : null
  const skill = sys ? sys.skill : null
  if (!atk || !sys || !skill) return null
  const kind = petAnimKindOf(skill)
  if (kind === null) return null                      // 空过/道具/换场/逃跑/被动 ⇒ 上游也不播攻击动画
  return {
    atkSide: atk.isMyUnit() ? 'my' : 'op',
    skillKind: kind,
    // BattleSkillBubbleAnimView.SetSkill 的文案：技能名 +（combo != 1 时「（N连击）」）
    skillName: skill.name ?? null,
    skillCombo: skill.combo ?? 1,
    // PetAnimationType.Super / SecondSuper 的判据（Skill.cs:513-526）；上游 BattlePetAnimView.ScreenShake
    // 只在这两种上震一下。宠物身份也跟着走 —— 暴击贴图要按攻击者的 animId/baseId 查配置。
    // ⚠️ **合体攻击在这里分流**：`isSecondSuper` 的那批技（我们表里 **11 条**：迪休拉之怒 / 雷鸣炎破斩 /
    //   联盟的审判 / 伊特大乱斗 / 特鬼异星劫 …，全部 anger=100）在 Unity 侧是 `PetAnimationType.SecondSuper`，
    //   在 AS3 侧对应 clip `合体攻击`。**两条血统的出伤帧表都把 SecondSuper 绑在 `fit` 列**
    //   （`PetHitInfo.fit => GetHitFrameByType(SecondSuper)`、`AnimiationHitInfo.fit => INTERCOURSE`）
    //   ⇒ SecondSuper ≡ 合体攻击 有据可依，故走 `intercourse` 语义（链首 `合体攻击`，没有该 clip 的宠退回必杀）。
    //   注：`type=3 连携` 那 12 条 **全部 isSecondSuper=false** ⇒ 仍走普通 `super`，不是合体。
    isSuperSkill: skill.type === SkillType.必杀 || skill.type === SkillType.连携,
    isSecondSuper: skill.isSecondSuper === true,
    // 这一手打完之后**对方**的 hp/anger —— 血牌要在出伤帧那一拍跟着掉，不能等整回合结束（上游靠同一个
    // SetCurrentUIState 帧原子同步：BattlePetAnimView.OnPetHit → UI.ProcessQuery(true) → SetCurrentUIState，
    // 血牌 statusView.SetPet 与伤害气泡 SetDamage 在同一次调用里）。
    defSide: st.defUnit ? (st.defUnit.isMyUnit() ? 'my' : 'op') : null,
    defHp: st.defUnit && st.defUnit.pet ? st.defUnit.pet.hp : null,
    defAnger: st.defUnit && st.defUnit.pet ? st.defUnit.pet.anger : null,
    // **行动方自己**在同一帧的 hp/anger。内核是回合粒度 ⇒ `nextRound()` 返回时两边都已是回合末的血；
    //   若打击帧只给被打方写覆盖，行动方那一格会读到真身（回合末值）⇒ **第一次打击帧两边一起掉**（人类 2026-10-19 报障）。
    //   行动方在自己这一手开打时的 hp 正是「它此刻该显示的血」：先手方 = 本回合起始值，后手方 = 已吃过对方那下的值。
    atkHp: atk.pet ? atk.pet.hp : null,
    atkAnger: atk.pet ? atk.pet.anger : null,
    attackBaseId: atk.pet ? atk.pet.baseId : 0,
    attackAnimId: (atk.pet && atk.pet.info && atk.pet.info.ui) ? (atk.pet.info.ui.defaultAnimId ?? 0) : 0,
  }
}

// 回合开始的「状态」信号（UnitHudSystem.OnTurnStart 的 petAnimType 三档）：死了→Lose / 活着且血量 <20%→Dying / 其余→Idle。
// 死了那一档场景已有（回合末 hp<=0 ⇒ ko 动作），这里只出「濒死」；血量口径与上游那句 `(float)pet.hp / pet.maxHp < 0.2f` 同。
function turnStartStatesOf(st) {
  const out = []
  for (const side of ['my', 'op']) {
    const pet = (side === 'op' ? st.clientUnit : st.masterUnit)?.pet
    if (!pet || pet.isDead) continue
    if (pet.maxHp > 0 && pet.hp / pet.maxHp < 0.2) out.push({ side, kind: 'dying', turnStart: true })
  }
  return out
}

// 从某一帧的 skillSystem 造一条飘字事件；返回 null = 这一帧不产泡（照 OnHit 的建条件 + ApplySpecialHit 的早退）。
function damageEventOf(st) {
  const atk = st.atkUnit
  const sys = atk ? atk.skillSystem : null
  const skill = sys ? sys.skill : null
  if (!atk || !sys || !skill) return null

  // AttackPhase.onHit 的三色切分（phase.ts:574-585 与上游 AttackPhase.cs:63-79 同口径）
  const elementDamage = sys.getTypeDamage((k) => k.startsWith('skill_element'))
  const pinkDamage = sys.getTypeDamage((k) => k === 'skill_fix' || k === 'skill_per')
  const whiteDamage = sys.getTypeDamage((k) => k === 'skill_act')
  const elementHeal = sys.getTypeHeal((k) => k === 'skill_elementBuff' || k === 'skill_elementAtk')
  const pinkHeal = sys.getTypeHeal((k) => k === 'skill_fix' || k === 'skill_per')
  const whiteHeal = sys.getTypeHeal((k) => k === 'skill_act')

  const redDamage = sys.totalSkillDamage - (elementDamage + pinkDamage + whiteDamage)
  const redHeal = sys.heal - (elementHeal + pinkHeal + whiteHeal)
  const def = st.defUnit
  const atkSide = atk.isMyUnit() ? 'my' : 'op'
  const defSide = def ? (def.isMyUnit() ? 'my' : 'op') : (atkSide === 'my' ? 'op' : 'my')

  // OnHit 的建条件：攻击技 / 没命中 / 真掉血，三者之一才挂气泡。
  // OnHit 建 DamageInfo 的三个条件（UnitHudSystem.cs:104）。**它同时决定对方播不播受击/闪避动作** ——
  // CurOtherSidePetReactionInfo 是在同一个 if 里建的（:106）。
  // ⚠️ 属性技（SkillType.属性 = 0）三条全不成立：`Skill.IsAttack()` 是 `type > 属性` ⇒ false；属性技不进
  //   DamageCalculatePhase ⇒ 不掷命中、isHit 恒 true；纯属性技的伤害全在 element 桶里 ⇒ redDamage = 0。
  //   ⇒ 上游**不给对方播受击/闪避**，只走 specials 那条彩色数字通道。AS3 同口径：
  //   FightTurnResultParser.as:102 的 `skillInfo.categoryId != SkillCategoryValue.BUF_VALUE(4)` 才调 sectionSkill()。
  const showBubble = isAttackSkill(skill.type) || !sys.isHit || redDamage > 0
  // HealInfo 是**单槽**：OnHit 先写红血，之后每跑一次 ApplySpecialHit 就被 OnHitUndo 两侧清空，
  // 只有最后一次跑的赋值活下来（AttackPhase.cs:114-140）。这里照抄这个「后写覆盖」形状。
  let defHeal = null
  let atkHeal = redHeal !== 0 ? { value: redHeal, type: '' } : null
  for (const [type, d, h] of [['element', elementDamage, elementHeal], ['pink', pinkDamage, pinkHeal], ['white', whiteDamage, whiteHeal]]) {
    if (d <= 0 && h === 0) continue                    // ApplySpecialHit 早退，不清场
    defHeal = null; atkHeal = null                     // OnHitUndo：两侧 CurHealInfo 清空
    if (d > 0) defHeal = { value: -d, type }           // 特殊色伤害记在**挨打方**
    if (h !== 0) atkHeal = { value: h, type }          // 治疗记在**出手方**
  }
  // dir = SetHealAnim 的 dir 实参：无 type（普通治疗）或 item ⇒ 向下沉；element/pink/white ⇒ 先沉再上浮。
  const dirOf = (type) => (type === '' || type === 'item' ? 'down' : 'up')
  const specials = []
  if (defHeal) specials.push({ side: defSide, text: healText(defHeal.value), color: healColor(defHeal.type, defHeal.value), dir: dirOf(defHeal.type) })
  if (atkHeal) specials.push({ side: atkSide, text: healText(atkHeal.value), color: healColor(atkHeal.type, atkHeal.value), dir: dirOf(atkHeal.type) })
  if (!showBubble && specials.length === 0) return null

  return {
    atkSide, defSide,
    damage: redDamage,
    isHit: sys.isHit,
    isCritical: sys.isCritical,
    elementRelation: sys.elementRelation,
    combo: sys.comboDamageInfoList.length > 1 ? evenComboDamage(sys.comboDamageInfoList, redDamage) : [],
    specials,
    // 上游 DamageInfo 的其余字段：DamageType 只在回合末 buff 伤那条为 false（这里恒 true）。
    damageType: true,
    showBubble,                                // 上游会不会给这一手出「伤害气泡 + 对方受击/闪避动作」
    // 宠物身份：暴击贴图要按**攻击者**的 animId/baseId 查配置（DamageInfo.AttackPetBaseId/AnimId）。
    attackBaseId: atk.pet ? atk.pet.baseId : 0,
    // 上游取的是 pet.ui.animId；我们没有那个字段，用重启表 ui.default_anim（build-unity-data.mjs:312）顶上。
    attackAnimId: (atk.pet && atk.pet.info && atk.pet.info.ui) ? (atk.pet.info.ui.defaultAnimId ?? 0) : 0,
  }
}

// 回合末 buff 结算的两条信号（UnitHudSystem.OnTurnEnd(thisUnit, rhsUnit)，上游 TurnEndPhase 对**双方各调一次**）：
//   rhsResult < 0 ⇒ 在 thisUnit 这侧冒一个「buff 伤害」气泡（DamageType=false ⇒ 不震屏/不闪白/不放大/无暴击角标）
//   thisResult > 0 ⇒ 在 thisUnit 这侧冒一个 buff 治疗数字
// 注意数字取的是**对方**的净 buff 伤害、自己这边取自己的净 buff 治疗 —— 这是上游的原样（照搬，不换边）。
function turnEndEventsOf(st) {
  const master = st.masterUnit, client = st.clientUnit
  if (!master || !client) return []
  const net = (u) => {
    const s = u.skillSystem
    return s ? (s.totalBuffHeal - s.totalBuffDamage) : 0
  }
  const build = (self, other) => {
    const thisResult = net(self), rhsResult = net(other)
    const side = self.isMyUnit() ? 'my' : 'op'
    const ev = {
      atkSide: side, defSide: side,
      damage: rhsResult < 0 ? Math.abs(rhsResult) : 0,
      isHit: true, isCritical: false, elementRelation: 1, combo: [],
      specials: [], damageType: false, attackBaseId: 0, attackAnimId: 0,
      skillName: null, skillCombo: 1, isSuperSkill: false, skillKind: null,
      turnEnd: true,
    }
    if (thisResult > 0) {
      const text = (thisResult >= 0 ? '+' : '') + thisResult
      ev.specials.push({ side, text, color: thisResult >= 0 ? '#77e20c' : '#ff0000', dir: thisResult >= 0 ? 'down' : 'up' })
    }
    return ev.damage !== 0 || ev.specials.length ? ev : null
  }
  return [build(master, client), build(client, master)].filter(Boolean)
}

// content 的宠配置 → 驱动侧宠种子（真六维 Status + 真 name/level/star + 出战技卡）。

// 缺省随机种子：不显式给 seed 时每局战斗各抽一个，让末级随机 tiebreak（出手顺序判定）
// 真正由随机决定，而非写死成同一序列。显式 seed（如 ?seed=N 或黄金回归测试）仍逐位复现。
function randomBattleSeed() {
  const buf = new Uint32Array(1)
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(buf)
  } else {
    buf[0] = Math.floor(Math.random() * 0x100000000)
  }
  return buf[0] >>> 0
}

export async function createCoreBattle(opts) {
  await ensureTables()
  const seed = opts.seed ?? randomBattleSeed()
  const level = opts.level ?? 100
  const masterLevel = opts.masterLevel ?? level   // 闭环里我方队首宠用存档等级，敌方野怪用遭遇等级
  const clientLevel = opts.clientLevel ?? level

  const settings = new BattleSettings({
    seed, modeId: 0, ruleId: opts.ruleId ?? 0, weather: opts.weather ?? 0,
    // isEscapeOK 缺省 = true（BattleSettings.ts:63 / 上游缺省即「宽松」，全部遭遇可逃，map-battle-trigger §缺省方向）。
    parallelCount: 1, petCount: 6, isEscapeOK: opts.isEscapeOK ?? true, isCaptureOK: true, isItemOK: false, time: 10,
  })

  const renderListeners = []
  let pendingRender = null

  // DB1：一次出手一条飘字事件，按 (turn, actionCursor, whosTurn) 去重（见文件头注释）。
  // 每次 attempt 前清空 —— NOT_PORTED 围栏重试时上一次半途产生的账必须整段丢掉。
  const damageByKey = new Map()
  const attackByKey = new Map()
  const harvestFrame = (cur) => {
    if (!cur) return
    if (!cur.whosTurn) { harvestTurnEnd(cur); harvestTurnStart(cur); return }
    // ⚠️ **只采 AttackPhase 的帧**（相位 OnAttack）。
    //   AfterAttackPhase.doWork 是 `applySkillsAndBuffs → raiseAnger → giveTurnToNextUnit → setUIState`，
    //   也就是说它那一帧的 `whosTurn`/`actionCursor` **已经推进到下一个行动者**了（AttackPhase.cs:15-19 同形状）。
    //   不设这道门，它会以「下一个行动」的键写一条**占位**事件（atkUnit 已是对方、账全零、defHp 是对方当前血），
    //   万一那个行动自己没产出事件（非法出手/非攻击技），占位就会被 zip 认领 ⇒ **把上一手的结果安到下一头上**。
    //   （这正是人类 2026-10-19「血条结算时刻不对」的第二个根因；同一门的另一侧收益是少画一个 absorb 空泡。）
    if (cur.phase !== EffectTiming.OnAttack) return
    const key = `${cur.turn}|${cur.actionCursor}|${cur.whosTurn}`
    const ev = damageEventOf(cur)
    // null 也要**删键**：出手被判非法时（目标已死 / 自己不能动 / PP 不够），AttackPhase 在 applyAttackDamage
    // 之前就早退，那一帧之前留下的「攻击技 ⇒ 先记一条 0 伤」占位必须被抹掉，否则会冒一个 absorb 空泡。
    if (ev === null) damageByKey.delete(key)
    else damageByKey.set(key, ev)
    // 攻击语义是**另一条**通道（键相同、内容不同）：它只看「这一手是不是攻击技」，不看伤害。
    // 同样删键 —— 非法出手会被换成空过技（type=-1 ⇒ 不是攻击技 ⇒ null），占位必须一起抹掉。
    const atkEv = attackEventOf(cur)
    if (atkEv === null) attackByKey.delete(key)
    else attackByKey.set(key, atkEv)
  }
  // 回合末：TurnEndPhase.doWork 开头就把 whosTurn 置 0，所以这一路的帧一律走 whosTurn===0 分支。
  // 两侧的 buff 账在那一帧上同时可读（不用归位到出手方），键 = `${turn}|end`；同回合的出手键都在它前面 ⇒ 出场顺序天然正确。
  const turnEndKey = (st) => `${st.turn}|end`
  const harvestTurnEnd = (st) => {
    const events = turnEndEventsOf(st)
    if (events.length === 0) damageByKey.delete(turnEndKey(st))
    else for (const ev of events) damageByKey.set(turnEndKey(st) + `|${ev.atkSide}`, ev)
  }
  // 回合开始帧：whosTurn 也是 0，靠 state.phase 认（TurnStartPhase 把相位设成 OnTurnStart，见 phase.ts:307-311）。
  // 键 `${turn}|start|${side}` ⇒ 天然排在同回合出手与回合末之后。
  const harvestTurnStart = (st) => {
    if (st.phase !== EffectTiming.OnTurnStart) return
    for (const ev of turnStartStatesOf(st)) damageByKey.set(`${st.turn}|start|${ev.side}`, ev)
  }

  const ui = createPhaseUi((last, cur) => { pendingRender = { last, cur } }, harvestFrame)

  // PhaseBattle 宿主：settings 是 currentState 的算属性（Battle.cs:13）；currentState/lastState 由 battleNextPhase 写。
  const battle = {
    get settings() { return this.currentState === null ? null : this.currentState.settings },
    currentState: null, lastState: null, autoSkillOrder: null, ui, currentPhase: null,
  }

  // ── 接缝注入（对齐 snap-mirror 的驱动世界）──
  setEffectJudgement({ condition: judgeCondition, apply: judgeApply })   // 开 judge ⇒ 算子真结算
  setPhaseBattle(() => battle)
  setIdentifierBattle(() => ({ currentState: battle.currentState }))
  // R3 的「值」归会话（编排线 ORB4-a / ORP4 订正③）：random 是**进程级**的，不随每局战斗归 0，也不入档。
  // S4：这一个种子流同时喂 random_type=rng 标识符与所有算子的 native-Random 注入缝（上游同是一只 UnityEngine.Random）。
  // 每局战斗按 seed 新建 ⇒ 同 seed 重放逐位复现；Unit.randomSource 仍各自独立（上游 Unit.random 与 UnityEngine.Random 是两套）。
  const hostRng = createRng(seed)
  setEffectIdentHost({ rng: hostRng, getPlayerRandom: () => readRandom() ?? 0, setPlayerRandom: (v) => writeRandom(v) })
  setOpsSkillRng(hostRng)
  setOpsRageRng(hostRng)
  setOpsPokerRng(hostRng)
  setOpsPowerupRng(hostRng)
  setOpsPetRng(hostRng)
  setOpsCopyBuffRng(hostRng)
  setOpsBuffRng(hostRng)
  setBuffResistRng(hostRng)
  setBuffRemoveRng(hostRng)

  // ── 构造 BattleState（跳过 BattleStartPhase，其 setInitBuffs 抛 NOT_PORTED）──
  // 我方袋: opts.masterTeam 给了就多宠（换宠经内核 PetChange 切 cursor）；否则退化为单宠（U1 demo / selftest 原样）。
  const team = opts.masterTeam && opts.masterTeam.length
    ? opts.masterTeam
    : [{ petId: opts.masterPetId, level: masterLevel }]
  const masterBag = team.map((t) => { const pet = new Pet(t.petId, t.level ?? masterLevel); if (pet.skills && Array.isArray(t.ownSkillId) && t.ownSkillId.length > 0) pet.skills.ownSkillId = t.ownSkillId.map((x) => Number(x) | 0).filter((x) => x !== 0); return new BattlePet(pet) })
  const clientPet = new BattlePet(new Pet(opts.clientPetId, clientLevel))
  const masterTurn = new Unit(masterBag, 1, settings, createRng(seed))
  const clientTurn = new Unit([clientPet], -1, settings, createRng(seed))
  battle.currentState = new BattleState(settings, masterTurn, clientTurn)

  // 开局：跑一帧 TurnStart 补两条登场战报（turn 0→1），getNextPhase→null 自然收尾。
  battle.currentPhase = new TurnStartPhase()
  battleNextPhase(battle)

  let pendingMasterSkillId = null   // 玩家本回合意图（null ⇒ 无操作）

  const driver = {
    battle,
    get state() { return battle.currentState },
    get lastState() { return battle.lastState },
    onRender(cb) { renderListeners.push(cb); return () => { const i = renderListeners.indexOf(cb); if (i >= 0) renderListeners.splice(i, 1) } },
    emitRender() {
      const p = pendingRender; pendingRender = null
      // DB1：Map 的插入序 = 出手先后（whosTurn 逐个推进）⇒ 场景按序把事件挂到同序的「被击」动作上。
      const dmg = [...damageByKey.values()]; damageByKey.clear()
      const atk = [...attackByKey.values()]; attackByKey.clear()
      for (const cb of renderListeners) cb(battle.lastState, battle.currentState, { ...p, damage: dmg, attack: atk })
    },

    myUnit() { return battle.currentState.myUnit },
    opUnit() { return battle.currentState.opUnit },
    myPet() { return battle.currentState.myUnit.pet },
    opPet() { return battle.currentState.opUnit.pet },

    availableSkills(pet) {
      const p = pet ?? driver.myPet()
      const anger = p.buffController.getBuff(61) !== null ? Number.MAX_SAFE_INTEGER : p.anger   // 无限怒气 hack
      return p.skillController.getAvailableSkills(anger, true)
    },
    // 全技能池 + 可用性标记：可用集合来自内核 getAvailableSkills，面板不自己判怒气/PP。
    skillList(pet) {
      const p = pet ?? driver.myPet()
      const sc = p.skillController
      const availIds = new Set(driver.availableSkills(p).map(s => s.id))
      const tag = (s) => (s ? { skill: s, usable: availIds.has(s.id) } : null)
      const normals = (sc.normalSkills ?? []).filter(Boolean).map(tag)
      const superCard = sc.superSkill ? tag(sc.superSkill) : null
      return { normals, super: superCard }
    },
    rule() { return battle.currentState.settings.rule },   // BattleRule: Anger:0 / PP:1
    isAngerInfinite(pet) { return (pet ?? driver.myPet()).buffController.getBuff(61) !== null },
    reports() { return battle.currentState.reports },
    buffsOf(side) { return (side === 'op' ? driver.opPet() : driver.myPet()).buffs },
    // 天气读数：settings.weather 是数字 id (base 50_0000)；0 = 无天气，其余取天气 buff 名。
    weatherInfo() {
      const id = battle.currentState.weather
      if (!id) return { id: 0, name: null, turn: 0 }
      const wb = battle.currentState.weatherBuff
      return { id, name: wb ? wb.name : String(id), turn: wb ? wb.turn : 0 }
    },
    weatherText() { return driver.weatherInfo().name },

    // ── 战斗 HUD 复刻的只读投影（docs/view/scene/battle/view-scene-battle-impl.md §9）：全是转发，无一条本地判定。──
    // 一律走 masterUnit/clientUnit（与 myBag()/setBagStartHp 同源），不碰 myUnit/opUnit 那对 PVP 感知 getter。
    settingsView() {
      const s = battle.currentState.settings
      return {
        mode: s.mode, rule: s.rule, isReveal: s.isReveal, isAutoOK: s.isAutoOK,
        isCaptureOK: s.isCaptureOK, isItemOK: s.isItemOK, isEscapeOK: s.isEscapeOK,
        parallelCount: s.parallelCount, petCount: s.petCount,
      }
    },
    // 全局/场地 buff（上游 BattleSystemView.cs:123-137 的 stateBuffs）。
    stateBuffs() { return battle.currentState.stateBuffs.map(([, b]) => b) },
    // 天气即网格首格：weather===0 ⇒ null（getWeatherBuff 会回落成通用天气 50_0000，故必须按 id 门）。
    weatherBuff() { return battle.currentState.weather ? battle.currentState.weatherBuff : null },
    opBag() { return battle.currentState.clientUnit.petSystem.petBag },
    opCursor() { return battle.currentState.clientUnit.petSystem.cursor },
    // 六珠口径 = BattlePetNumView.SetPetBag 的两条 petBag 计数（petNum / alivePetNum）。
    bagCounts(side) { const ps = side === 'op' ? battle.currentState.clientUnit.petSystem : battle.currentState.masterUnit.petSystem; return { petNum: ps.petNum, aliveNum: ps.alivePetNum } },
    // 绿圆钮（无操作）可用性判据：上游 interactable = (mode==Card) || 没有任何可用技能。
    hasUsableSkill(pet) { return driver.availableSkills(pet).length > 0 },

    isOver() { return battle.currentState.result.isBattleEnd },
    outcome() { return battle.currentState.result },
    turn() { return battle.currentState.turn },

    selectSkill(skillId) { pendingMasterSkillId = skillId },
    pass() { pendingMasterSkillId = null },

    // 开局带伤入场（闭环里我方队首宠按存档 hp）：直接改在场宠的当前 hp，钳到 [1, maxHp]。
    // 不改 maxHp/公式，只设一个已算好的起始值；下一回合 BattleState.from 快照会带上它。
    setStartHp(side, hp) {
      const pet = side === 'op' ? driver.opPet() : driver.myPet()
      pet.hp = Math.max(1, Math.min(pet.maxHp, Math.trunc(hp)))
      return pet.hp
    },

    // 按袋下标设起始 hp（多宠入场：队首带伤、后备满血各按存档）。
    setBagStartHp(index, hp) {
      const pet = battle.currentState.masterUnit.petSystem.petBag[index]
      if (!pet) return null
      pet.hp = Math.max(1, Math.min(pet.maxHp, Math.trunc(hp)))
      return pet.hp
    },
    myBag() { return battle.currentState.masterUnit.petSystem.petBag },
    myCursor() { return battle.currentState.masterUnit.petSystem.cursor },

    // 捕捉：经内核 Capture 算子真结算（概率在算子里，UI 不算）。胶囊效果行来自 unity items.json（数据驱动）。
    // checkAndApply 走内核 condition（等级门槛）→ apply → Capture 本体（掷点走浏览器 rng 缝，非 native）。
    // 返回 {ok, captured, gated}：captured=result.isCapture；gated=condition 判 false（等级不够，未掷点）。
    useCapture(itemEffectRow) {
      const st = battle.currentState
      const myUnit = st.masterUnit
      if (myUnit.skill === null) myUnit.setSkill(noOpSkill(), battle.settings)   // capture_result 要落在当前技的 options
      const effect = effectFromRow(itemEffectRow)
      const applied = checkAndApply(effect, myUnit, st, false, false, null)
      const captured = st.result.isCapture
      return { ok: true, captured, gated: !applied && !captured, result: st.result }
    },

    // 换宠：经内核 PetChange 算子切 cursor（字面 target_index，非 random 掷点支）。
    // 成功后 myPet() 即新在场宠；舞台 SWF 由调用方 reload（表现层，不影响内核判定）。
    // ⚠️ `passive` = 上游同句的 `battle.currentState.isAnyPetDead`（BattlePetChangeView.SelectPet 末行）：
    //   本仓是回合粒度驱动、换宠由 UI 直接递交下标（不走 SetSkill 旁路），passive 只影响效果的 timing
    //   标记（OnPassivePetChange / OnBeforeAttack），算子本体 petChange() 两支走同一串突变 ⇒ 恒 false。
    switchPet(index) {
      const st = battle.currentState
      const myUnit = st.masterUnit
      const target = Number(index)
      const ps = myUnit.petSystem
      const pet = ps.petBag[target] ?? null
      // 只认「袋里、不是当前、没死」的宠 —— 上游 UI 同口径：BattlePetChangeBlockView.SetPet
      //   → SetInteractable(!pet.isDead)，换宠技的 GetSelectableTarget 也是 isTarget = !isDead。
      //   内核 petChange() 的字面 target_index 支**不**校验目标死活（只有 random 支才滤）⇒ 守在这里。
      if (pet === null || target === ps.cursor || pet.isDead)
        return { switched: false, reason: 'dead-or-absent', cursor: ps.cursor, pet: myUnit.pet }
      const effect = Effect.getPetChangeEffect(ps.cursor, target, false)
      const done = judgeApply(effect, myUnit, st)
      driver.emitRender()
      return { switched: !!done && ps.cursor === target, cursor: ps.cursor, pet: myUnit.pet }
    },

    // 阵亡强制换宠（上游 Battle.cs:348-359 + PassivePetChangePhase）：
    //   我方在场宠已死 ⇒ 这一手不许出招/道具/捕捉/逃跑，必须先把活宠换上来；
    //   袋里一只活的都没有 ⇒ 无需换（回合末 checkBattleEnd 直接判 Lose，见 phase.ts TurnEndPhase）。
    mustChangePet() {
      const ps = battle.currentState.masterUnit.petSystem
      const pet = battle.currentState.myUnit.pet
      return (pet !== null && pet.isDead) && ps.alivePetNum > 0
    },

    // 有没有「非当前且没死」的宠可换（空 ⇒ 换不了：单宠袋 / 全灭）。
    canChangePet() {
      const ps = battle.currentState.masterUnit.petSystem
      for (let i = 0; i < ps.petBag.length; i++) {
        const p = ps.petBag[i]
        if (p !== null && i !== ps.cursor && !p.isDead) return true
      }
      return false
    },

    // 推进一回合：应用意图（缺省无操作）+ 对手 AI，跑 battleNextPhase，触发渲染。
    // 围栏策略：BattleEndPhase 的 NOT_PORTED 当 over 吞掉；其它 NOT_PORTED（未移植算子如 Rage）⇒ 回退到回合前、
    // 双方改无操作重试一次（保证回合仍能推进），并回报 rejected 让 UI 诚实提示；非 NOT_PORTED 的真抛仍上抛。
    nextRound() {
      // 强制换宠没做完就不推进回合（上游同一入口：Battle.SetSkill 遇 isAnyPetDead 先插
      //   PassivePetChangePhase、return false，主相位链压根不走）。UI 各页签也已锁，这里是最后一道闸。
      if (driver.mustChangePet()) {
        pendingMasterSkillId = null          // 这一手不成立，别把选好的招留到换完宠之后白打出去
        return { over: false, rejected: false, fence: null, needSwitch: true }
      }
      const snapshot = BattleState.from(battle.currentState)
      // ⚠️ 入参是「从**还原后**的 state 上取技」的函数, 不是已挑好的技能: 敌方 GetDefaultSkill 会推进
      //   skillController.cursor / 消费 headerSkills, 若在快照之前挑, 那次推进会被下面 from(snapshot) 丢掉。
      const attempt = (pickMaster, pickClient) => {
        damageByKey.clear()                           // DB1/DB-S：重试前把上一次半途的账整段丢掉
        attackByKey.clear()
        battle.currentState = BattleState.from(snapshot)
        battle.currentState.masterUnit.setSkill(pickMaster(battle.currentState), battle.settings)
        battle.currentState.clientUnit.setSkill(pickClient(battle.currentState), battle.settings)
        battle.lastState = null
        battle.currentPhase = new TurnReadyPhase()
        battleNextPhase(battle)
      }
      const run = (pickMaster, pickClient) => {   // 返回 {over, fence} —— fence=非 BattleEnd 的 NOT_PORTED 消息
        try { attempt(pickMaster, pickClient); return { over: false, fence: null } }
        catch (e) {
          const msg = String(e && e.message)
          if (msg.startsWith(END_SENTINEL)) { battle.currentPhase = null; return { over: true, fence: null } }
          if (msg.startsWith('NOT_PORTED:')) return { over: false, fence: msg }
          throw e
        }
      }
      const pickMaster = (st) => pickSkill(st.masterUnit.pet, pendingMasterSkillId)
      const pickClient = (st) => pickClientSkill(st.clientUnit)
      const noop = () => noOpSkill()
      let { over, fence } = run(pickMaster, pickClient)
      let rejected = false
      if (fence) {
        rejected = true
        const retry = run(noop, noop)   // 无操作不出招 ⇒ 不触发技能算子，回合仍能走
        over = retry.over
        if (retry.fence) { battle.currentState = BattleState.from(snapshot); throw new Error(retry.fence) }
      }
      pendingMasterSkillId = null
      driver.emitRender()
      // 打完这一回合我方在场宠可能刚好阵亡 ⇒ 同样要逼玩家换宠（上游是下一回合选招时由
      //   Battle.SetSkill 插旁路；本仓回合粒度 ⇒ 在回合末就把 needSwitch 报给场景跳页）。
      return { over: over || driver.isOver(), rejected, fence, needSwitch: driver.mustChangePet(), outcome: driver.outcome() }
    },
  }
  return driver
}

// 敌方选招 —— Battle.cs:361-380 (非 PVP 且 opUnit.skill == null ⇒ 对面自动选默认技)。
// 逐字照上游那四条: 默认技 = pet.GetDefaultSkill(); 宠已死 ⇒ 单打换成换场技 (双打才给 null);
// parallelCount 在本仓恒 1 (settings 固定), 所以「双打推进 cursor / SetParallelIndex」两支走不到, 不移植。
// ⚠️ 换场技那支要内核算子 (PetChange), 未移植时会抛 NOT_PORTED —— 由 nextRound 的围栏接住并诚实回报。
function pickClientSkill(unit) {
  const pet = unit.pet
  if (pet === null) return noOpSkill()
  if (pet.isDead) return petChangeSkill(unit.petSystem.cursor, unit.petSystem.getNextCursorCircular(), true)
  return pet.getDefaultSkill()
}

// 按 id 从宠的可用技里挑一条（玩家意图）；id 为空或找不到 ⇒ 无操作（保证回合总能推进）。
// -4 = 逃跑技：它是工厂技（Skill.cs:302-309，不在宠的技能表里），经内核 escapeSkill() 构造，
//      挂效果 -4（escape 算子，无 condition ⇒ 成功无掷点，与上游一致）。
function pickSkill(pet, skillId) {
  if (skillId === null || skillId === undefined) return noOpSkill()
  if (Number(skillId) === -4) return escapeSkill()
  const all = [...(pet.skillController.normalSkills ?? []), pet.skillController.superSkill].filter(Boolean)
  const found = all.find((s) => s.id === Number(skillId))
  return found ?? noOpSkill()
}
