// state.ts 需要的**战斗侧视图接缝** —— 上游那半边是 Skill.cs(732) / BattlePet.cs(369) + 三个 controller,
// 它们的**表装载**要等宠表进 oracle 那一批 (docs/engine/port-map.md: 「这条口径要在 S6 把宠表接进 oracle 时一起换掉」)。
// 这里先把 state.ts 真正读到的那几样钉成类型, 并把**不依赖表的纯判定**搬进来 (isAction/isSelectReady/PP/拷贝构造),
// 这样 S3 的快照语义能先跑, 而后一批只要提供数据、不必重新决定语义。
//
// 为什么纯判定放这边而不是留成接口方法: 每个实现各写一遍 `type < 属性 && type != 被动`
// 就是四个可能分叉的地方。damage.ts 已按同一口径处理过 SkillView 的 power/accuracy, 这里延续。
// 于是 SkillRecord.isAction 是一条**契约字段**: 实现方必须用 isActionSkill(type) 填, 且改 type 时改它。
//
// 四处形状要点 (都会在对拍里咬人):
//   · `PP` 是 pp 与 maxPP 之间的 **int 夹紧** (Skill.cs:27-31), 读写两侧都夹 ——
//     `s.pp = 999` 之后读回来是 maxPP, 所以拷贝构造拷的是 `skillPP(rhs)` 而不是 `rhs.pp`。
//   · 拷贝构造 (Skill.cs:152-176) 走 `SetEffects`, 而 SetEffects = **Effect.SetEffects 展开常驻壳** +
//     逐个把 source 指回新 skill。所以「克隆一个技能」可能**改变**它的效果条数, 不是纯复制。
//   · `IsSelectReady` 是 `All(!IsSelect || target_index != "-1")` —— 空 effects 列表返回**真**。
//   · `IsNullOrEmpty(skill)` 判的是 `type == 空过`, **不是** null (Skill.cs:727-731, 见 damage.ts 注释)。

import { Effect, currentEffectTable } from '../effect/effect.ts'
import { dictGet, dictSet } from '../collections.ts'
import { clampInt, f, max as MathfMax, toInt } from '../mathf.ts'
import { Linear } from '../pet/linear.ts'
import { Status } from '../pet/status.ts'
import type { BattleStatus, LinearStatus, StatusController } from '../pet/status-controller.ts'
import type { Buff } from '../buff/buff.ts'
import type { BuffType } from '../buff/buff-database.ts'
import { EffectAbility, EffectTiming, toEffectAbility } from '../effect/effect-database.ts'
import { csBool, parseIntOrThrow, trimParentheses, trimParenthesesLoop, trimStartStr, tryTrimParentheses, tryTrimStart } from '../strutil.ts'
import { getNumIdentifier, type IdentifierHost } from '../parser/identifier.ts'
import { SkillType } from '../pet/skill.ts'
import { type SkillView } from './damage.ts'
import type { Rng } from '../rng.ts'

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— "这个键我不认"的哨兵

/**
 * Skill.cs 的 option 求值要走 `Identifier.GetNumIdentifier(string)` (Identifier.cs:10-33) ——
 * 那条静态重载只有两种落点: float 字面量, 和 random 前缀 (native Random / 存档里的 random[old/new])。
 * 前者纯, 后者在无战斗上下文处不可得 —— 默认在每个触点抛, 与 oracle 注入世界里
 * 「native Random 是 ECall, 一碰就抛」同形状; 上层要接真存档时用 setSkillNumHost 换掉。
 */
const noNumContext = (what: string): never => {
  throw new Error(`Skill.GetSkillIdentifier: ${what} 前缀需要随机/存档上下文注入 —— headless 默认抛 (oracle: native Random ECall 同形状)`)
}
let SKILL_NUM_HOST: IdentifierHost = {
  rng: {
    next01: () => noNumContext('random'),
    nextInt: () => noNumContext('random'),
    nextFloat: () => noNumContext('random'),
    pick: () => noNumContext('random'),
    seed: () => noNumContext('random'),
  },
  getPlayerRandom: () => noNumContext('random[old]'),
  setPlayerRandom: () => noNumContext('random[new]'),
  getDate: () => noNumContext('date'),
  getPlayerData: () => noNumContext('player'),
}
export const setSkillNumHost = (host: IdentifierHost): void => { SKILL_NUM_HOST = host }

/**
 * Skill.cs:14-58 里 state.ts 与算子层都要读的那批成员。
 * options/effects 是**有序**容器 (插入序即回写序), 所以 options 用 Map 而不是对象。
 */
export interface SkillRecord extends SkillView {
  id: number
  /** Skill.cs:15 `public string name` —— `protected Skill(SkillType)` (:180-187) **不写它**,
   *  四支特殊技在工厂里各自补; 表技由 ctor :92/:113 补。留 null 才是上游的形状。 */
  name: string | null
  rawCostString: string | null
  rawDescription: string | null
  anger: number          // int
  pp: number             // int —— 原始值, 读 PP 才夹紧
  maxPP: number          // int
  effects: Effect[]
  options: Map<string, string>
  isSecondSuper: boolean
  referBuffList: string[] | null
  critical: number       // float —— 字段就是 float, 写入过 f()
  powerup: LinearStatus
  powerdown: LinearStatus
  /** Skill.cs:46 —— 真字段 (装载时 bool.Parse options["ignore_shield"]); 缺省按 false 读。
   *  :47-55 的 ignorePowerup/ignorePowerdown **不是字段**, 是 powerup/powerdown.mult 的派生属性, 别存。 */
  ignoreShield?: boolean
}

/** Skill.cs:27-31 —— Mathf.Clamp 的 int 版 (不是 float 版, 见 docs/engine/port-map.md 的「Mathf.Clamp 必须是 int 版」)。 */
export const skillPP = (s: SkillRecord): number => clampInt(s.pp, 0, s.maxPP)
export const setSkillPP = (s: SkillRecord, v: number): void => { s.pp = clampInt(v, 0, s.maxPP) }

// Skill.cs:460-465 IsAction —— `type < 属性(0) && type != 被动(-5)`。
// 注意这**不是**「不是攻击技」: 空过/道具/换场/逃跑 才是 action, 属性技(0)不是。
export const isActionSkill = (type: number): boolean => type < SkillType.属性 && type !== SkillType.被动
// Skill.cs:467-471 —— isAttack 是**算属性** (不是契约字段): `type > 属性` (注释掉的三条件旧版不算数)。
export const isAttackSkill = (type: number): boolean => type > SkillType.属性

// Skill.cs:727-731 IsNullOrEmpty(Skill) —— 判的是 type == 空过。名字是坑, 照搬不改。
export const isNullOrEmptySkill = (s: SkillRecord | null): boolean => s === null || s.type === SkillType.空过

// Skill.cs:473-476 IsSelect —— effects.Exists(x => x.IsSelect()); isSelect 在 Effect 上是 getter。
export const isSelectSkill = (s: SkillRecord): boolean => s.effects.some((x) => x.isSelect)

// Skill.cs:478-482 IsSelectReady。空 effects ⇒ All() 恒真。
export const isSelectReady = (s: SkillRecord): boolean =>
  s.effects.every((x) => (!x.isSelect || dictGet(x.abilityOptionDict, 'target_index', '-1') !== '-1'))

/**
 * Skill.cs:539-626 GetSkillIdentifier —— 分支顺序本身就是语义 (BeforeAttackPhase.cs:62/68 与
 * AttackPhase.cs:150 都直接吃它)。三处上游形状要如实建模:
 *   · `description` 支的 rawDescription 若是 null, 上游 NRE —— 这里同样在 .includes 处抛, 不兜底;
 *   · `powerup.` 支的 split[1] 越界在上游是 IndexOutOfRange (switch 表达式先求值), JS 原生会
 *     静默走 default ⇒ 显式补边界;
 *   · `effect.` 与 `element.` 两支的内层子分支不匹配时**穿透**到后面的支继续, 不是 return 0。
 */
export function getSkillIdentifier(s: SkillRecord, id: string): number {
  const d = tryTrimStart(id, 'description')
  if (d.ok) {
    const p = tryTrimParentheses(d.trim)
    if (p.ok) return s.rawDescription!.includes(p.trim) ? 1 : 0
  }

  const o = tryTrimStart(id, 'option')
  if (o.ok) return getNumIdentifier(dictGet(s.options, trimParentheses(o.trim), '0')!, SKILL_NUM_HOST)

  const pu = tryTrimStart(id, 'powerup.')
  if (pu.ok) {
    const split = pu.trim.split('.')
    if (split.length < 2) throw new Error(`IndexOutOfRangeException: powerup.${id}`)
    const power = split[0] === 'pos' ? s.powerup : split[0] === 'neg' ? s.powerdown : new Linear(Status.one(), Status.zero())
    const status = split[1] === 'mult' ? power.mult : split[1] === 'add' ? power.add : Status.zero()
    return status.get(split.length > 2 ? split[2] : 'all')
  }

  const ef = tryTrimStart(id, 'effect.')
  if (ef.ok) {
    const ab = tryTrimStart(ef.trim, 'ability')
    if (ab.ok) {
      let trimExpr = ab.trim
      const trimAbility = trimParenthesesLoop(trimExpr, '(', ')')
      if (trimAbility === null) throw new Error(`NullReferenceException: TrimParenthesesLoop 对 "${ef.trim}" 给 null`)
      let okEffects = [...s.effects]
      for (let i = 0; i < trimAbility.length; i++) {
        const split = trimAbility[i].split(':')
        if (split.length === 1) okEffects = okEffects.filter((x) => x.ability === toEffectAbility(split[0]))
        // 上游 Get(key) 无默认 ⇒ 键不存在取 null, `null != split[1]` 为真被移除; dictGet 缺省 null 同形。
        else okEffects = okEffects.filter((x) => dictGet(x.abilityOptionDict, split[0]) === split[1])
        trimExpr = trimStartStr(trimExpr, '(' + trimAbility[i] + ')')
      }
      trimExpr = trimStartStr(trimExpr, '.')
      // :586-590 —— "count" 与 default 两支返回**同一个值**, 上游就是这个形状, 别"顺手"改成 else 0。
      return okEffects.length
    }
  }

  const el = tryTrimStart(id, 'element.')
  if (el.ok) {
    if (tryTrimStart(el.trim, 'group').ok)
      throw new Error('NOT_PORTED: Skill.GetSkillIdentifier element.group —— PetElementSystem.GetElementGroup 未移植 (S6 表批次)')
    // element.xxx 其余子分支在上游不落 return, 穿透到末尾 switch。
  }

  switch (id) {
    case 'id': return s.id
    case 'element': return s.elementId
    case 'type': return s.type
    case 'power': return s.power
    case 'anger': return s.anger
    case 'pp': return skillPP(s)
    case 'maxPP': return s.maxPP
    case 'lostPP': return s.maxPP - skillPP(s)
    case 'accuracy': return s.accuracy
    case 'priority': return s.priority
    case 'vipriority': return s.vipriority
    case 'critical': return s.critical
    case 'combo': return s.combo
    case 'chain': return s.chain
    case 'ignoreShield': return s.ignoreShield ? 1 : 0
    // :47-55 —— ignorePowerup/ignorePowerdown 是**派生属性**: mult.def*mult.mdf == 0 (powerdown 用 atk*mat)。
    case 'ignorePowerup': return s.powerup.mult.def * s.powerup.mult.mdf === 0 ? 1 : 0
    case 'ignorePowerdown': return s.powerdown.mult.atk * s.powerdown.mult.mat === 0 ? 1 : 0
    case 'effect': return s.effects.length
    case 'parallelTargetIndex': return getSkillIdentifier(s, 'option[parallel_target_index]')
    case 'isSelect': return isSelectSkill(s) ? 1 : 0
    case 'evolve': return getSkillIdentifier(s, 'option[evolve]')
    default: return FLOAT_MIN_VALUE
  }
}

// Skill.cs:628-631 TryGetSkillIdentifier —— out 写回后按哨兵判成败。
export function tryGetSkillIdentifier(s: SkillRecord, id: string): { ok: boolean; num: number } {
  const num = getSkillIdentifier(s, id)
  return { ok: num !== FLOAT_MIN_VALUE, num }
}

// Skill.cs:432-437 SetEffects(List<Effect>) —— 先过 Effect.SetEffects (把常驻的 set_skill 壳展开成
// 它引用的效果, 见 effect.ts), 再把每条的 source 指回**这个** skill。source 指错对象会让下游算子
// 把效果写回别人的技能表, 是快照语义的一部分, 不是装饰。
export const setSkillEffects = (owner: SkillRecord, effects: Effect[]): void => {
  owner.effects = Effect.setEffects(effects)
  for (const e of owner.effects) e.source = owner
}

// Skill.cs:426-430 SetEffects(**单数**重载) —— 与复数重载唯一的差别就是它**不跑** Effect.SetEffects
// 常驻壳展开, 也不逐条回指前表: `effects = new List<Effect>(){ _effect }`。逃跑技 (:307) 走的就是这一支,
// 所以"逃跑技只有一条效果、且没被展开"是两条重载的差, 不是表里那行恰好只有一条。
export const setSkillEffect = (owner: SkillRecord, effect: Effect): void => {
  effect.source = owner
  owner.effects = [effect]
}

// Skill.cs:439-446 AddEffects —— 「追加」的其实是**展开后**的条数: 先过 Effect.SetEffects 再 AddRange,
// 所以一条常驻壳可能落成 N 条, 而 op="SET" 与 op="+" 两支因此不是同一种计数。
export const addSkillEffects = (owner: SkillRecord, effects: Effect[]): void => {
  const addEffects = Effect.setEffects(effects)
  for (const e of addEffects) e.source = owner
  owner.effects.push(...addEffects)
}

// Skill.cs:448-457 SetParallelIndex —— options 两个键 + **逐效果**的 abilityOptionDict 两个键。
// `x?.abilityOptionDict?.Set(...)` 的两道 null 条件要留着: effects 里允许有 null 洞 (上游 List<Effect>)。
export const setSkillParallelIndex = (s: SkillRecord, parallelSourceIndex = 0, parallelTargetIndex = 0): void => {
  const src = String(parallelSourceIndex)
  const tgt = String(parallelTargetIndex)
  dictSet(s.options, 'parallel_source_index', src)
  dictSet(s.options, 'parallel_target_index', tgt)
  for (const x of s.effects) {
    if (x === null || x === undefined) continue
    dictSet(x.abilityOptionDict, 'parallel_source_index', src)
    dictSet(x.abilityOptionDict, 'parallel_target_index', tgt)
  }
}

/**
 * Skill.cs:635-723 SetSkillIdentifier —— **写侧**, 与读侧 getSkillIdentifier 是两套分支顺序, 别互相"对齐"。
 * 四处只有照搬才对得上的形状:
 *   · `option[..]` 支要求**真的有方括号** (`TryTrimStart("option") && TrimParentheses(..)`, :637),
 *     而读侧 :545 是不要求括号的 `TrimParentheses` —— 于是 `optionX` 在读侧查键 "X"、在写侧
 *     **穿透**到末尾 switch 的 default 静默不写。写侧的 powerup 支反而是无条件穿透的下一段。
 *   · `powerup.` 支的 `split[1]` 越界在 C# 是 IndexOutOfRange (switch 先求值), JS 会静默走 default ⇒ 补边界;
 *     而 `split[0]` 既非 pos 又非 neg 时上游 new 一份**临时** `Linear(one, zero)` 再写进去 ⇒ 静默丢弃,
 *     `split[1]` 既非 mult 又非 add 时同理 (写进一只 `Status.zero()` 临时对象)。这不是 bug 可抄, 是行为。
 *   · `option[...]` 落的是 `value.ToString()` —— C# 的 float ToString 是"最短可回写 f32 十进制"
 *     ("0.33333334"), JS 的 `String(Math.fround(x))` 是"展宽 double 的最短形式" ("0.3333333432674408")。
 *     这是**文本表示差**、不是上游行为 (docs/engine/kernel-handoff.md 的 float 纪律), 所以这里写 String(f(x)),
 *     而对拍签名把 option 的值按 float 读回来比 ⇒ 两边比的是同一个 32 位值。
 *   · `default: return;` 是**静默不写** (上游 switch 的第一条就是 default), 未知键不抛也不回滚。
 */
export function setSkillIdentifier(s: SkillRecord, id: string, value: number): void {
  const o = tryTrimStart(id, 'option')
  if (o.ok) {
    const p = tryTrimParentheses(o.trim)
    if (p.ok) { dictSet(s.options, p.trim, String(f(value))); return }
  }

  const pu = tryTrimStart(id, 'powerup.')
  if (pu.ok) {
    const split = pu.trim.split('.')
    if (split.length < 2) throw new Error(`IndexOutOfRangeException: powerup.${id}`)
    const power = split[0] === 'pos' ? s.powerup : split[0] === 'neg' ? s.powerdown : new Linear(Status.one(), Status.zero())
    const status = split[1] === 'mult' ? power.mult : split[1] === 'add' ? power.add : Status.zero()
    status.setByName(split.length > 2 ? split[2] : 'all', value)
    return
  }

  switch (id) {
    default: return
    case 'element': s.elementId = toInt(value); return
    case 'type': s.type = toInt(value); s.isAction = isActionSkill(s.type); return
    case 'power': s.power = MathfMax(toInt(value), 0); return
    case 'anger': s.anger = MathfMax(toInt(value), 0); return
    case 'pp': setSkillPP(s, toInt(value)); return
    case 'maxPP': s.maxPP = MathfMax(toInt(value), 0); return
    case 'accuracy': s.accuracy = toInt(value); return
    case 'priority': s.priority = toInt(value); return
    case 'vipriority': s.vipriority = toInt(value); return
    case 'critical': s.critical = value; return
    case 'combo': s.combo = MathfMax(toInt(value), 0); return
    case 'chain': s.chain = toInt(value); return
    case 'ignoreShield': s.ignoreShield = value !== 0; return
    // :707-712 —— ignorePowerup/ignorePowerdown **没有字段** (:47-56 是派生属性), 写它们等于把
    // powerup/powerdown 的 mult 上 def·mdf / atk·mat 两格打成 0 或 1; 读侧 = 那两格**乘积**为 0。
    // 注意乘积不是"且": 上游先 f() 存 float, 0.5*0 也是 0 ⇒ 只有一格为 0 就算 ignore。
    case 'ignorePowerup': s.powerup.mult.def = value !== 0 ? 0 : 1; s.powerup.mult.mdf = value !== 0 ? 0 : 1; return
    case 'ignorePowerdown': s.powerdown.mult.atk = value !== 0 ? 0 : 1; s.powerdown.mult.mat = value !== 0 ? 0 : 1; return
    // :714 —— value==0 给**空表**; 查不到 (avoidNull=false ⇒ null) 也给空表, 但那是 `?? new List` 那条;
    // 两条路都过 SetEffects(复数) ⇒ 常驻壳在这里会被展开。
    case 'effect':
      setSkillEffects(s, value === 0 ? [] : (getSkill(toInt(value), false)?.effects.map((x) => x.clone()) ?? []))
      return
    case 'evolve': setSkillIdentifier(s, 'option[evolve]', value); return
    // :720 —— 源下标是从**自己的 options** 里 int.Parse 出来的 ("1.5"/"" 都会抛 FormatException),
    // 不是入参; 而 parallel_target_index 写的是 (int)value。
    case 'parallelTargetIndex':
      setSkillParallelIndex(s, parseIntOrThrow(dictGet(s.options, 'parallel_source_index', '0')!), toInt(value))
      return
  }
}

/** Skill.cs:152-176 拷贝构造。`copyPP=false` 那一支是「按满 PP 重建」(升级/换宠), 不是笔误。 */
export function cloneSkill(rhs: SkillRecord, copyPP = true): SkillRecord {
  // Skill.cs:159 —— `rhs.options.ToDictionary(...)`: null options 在**拷贝当下**就抛 (ArgumentNullException),
  // 而 JS 的 `new Map(null)` 是静默空表 —— 这个语义差必须在这里补抛, 否则 null options 的 skill
  // 能活着穿过 BattleState 深拷, 把本该在构造期就炸的形状推迟到别处。
  if ((rhs.options as Map<string, string> | null) === null)
    throw new TypeError("ArgumentNullException: Value cannot be null. (Parameter 'source') —— Skill.cs:159 ToDictionary 吃 null options")
  const out: Omit<SkillRecord, 'isAction'> = {
    id: rhs.id,
    name: rhs.name,
    elementId: rhs.elementId,
    type: rhs.type,
    power: rhs.power,
    rawCostString: rhs.rawCostString,
    anger: rhs.anger,
    maxPP: rhs.maxPP,
    pp: copyPP ? skillPP(rhs) : rhs.maxPP,
    accuracy: rhs.accuracy,
    rawDescription: rhs.rawDescription,
    options: new Map(rhs.options),
    effects: [],
    isSecondSuper: rhs.isSecondSuper,
    referBuffList: rhs.referBuffList === null ? null : [...rhs.referBuffList],
    critical: rhs.critical,
    combo: rhs.combo,
    chain: rhs.chain,
    priority: rhs.priority,
    vipriority: rhs.vipriority,
    // 上游 powerup/powerdown 是 Linear<Status>, 两头各 new Status(...) 深拷 (Status.cs 的 float[] 字段)
    powerup: new Linear(Status.copy(rhs.powerup.mult), Status.copy(rhs.powerup.add)),
    powerdown: new Linear(Status.copy(rhs.powerdown.mult), Status.copy(rhs.powerdown.add)),
    ignoreShield: rhs.ignoreShield ?? false,
  }
  const skill = { ...out, isAction: isActionSkill(out.type) } as SkillRecord
  setSkillEffects(skill, rhs.effects.map((x) => x.clone()))
  return skill
}

/**
 * Skill.cs:180-187 `protected Skill(SkillType specialType)` —— 四支特殊技 (空过/道具/換场/逃跑) 共用的底:
 * `id = (int)type`、power/anger 归 0、accuracy **100**、combo/chain **1**。
 * 三个"没写"的位置才是重点: `critical` 保持字段默认 **0** (只有 GetNoOpSkill 自己补成 5)、
 * `pp/maxPP/rawCostString/name/rawDescription` 全是默认 ⇒ rawDescription 为 null, 于是
 * `GetSkillIdentifier("description[..]")` 在逃跑/換场技上会 NRE (与表里那行的技不一样)。
 */
function specialSkill(type: number): SkillRecord {
  const base: Omit<SkillRecord, 'isAction'> = {
    id: type,
    name: null,
    elementId: 0,
    type,
    power: 0,
    rawCostString: null,
    anger: 0,
    pp: 0,
    maxPP: 0,
    accuracy: 100,
    rawDescription: null,
    options: new Map(),
    effects: [],
    isSecondSuper: false,
    referBuffList: [],
    critical: 0,
    combo: 1,
    chain: 1,
    priority: 0,
    vipriority: 0,
    powerup: new Linear(Status.one(), Status.zero()),
    powerdown: new Linear(Status.one(), Status.zero()),
  }
  const skill = { ...base, isAction: isActionSkill(base.type) } as SkillRecord
  // 上游的 `effects = new List<Effect>()` 是字段初始化器, 不走 SetEffects ⇒ 这里也别过常驻壳展开。
  return skill
}

// Skill.cs:291-299 —— 空过技。critical/名称/描述是它自己补的 (protected ctor 不管), pp/maxPP 保持 0
// ⇒ PP 恒 0 (但它 isAction, 不扣)。parallel_source_index 落的是**入参**的 ToString, 缺省 -1。
export const noOpSkill = (parallelSourceIndex = -1): SkillRecord => {
  const skill = specialSkill(SkillType.空过)
  skill.name = '空过'
  skill.rawDescription = '跳过自己的回合'
  skill.critical = f(5)
  skill.accuracy = 100
  dictSet(skill.options, 'parallel_source_index', String(parallelSourceIndex))
  return skill
}

// Skill.cs:302-309 逃跑技 —— priority **6** (行动序里压过一切), 且效果走 SetEffects 的**单数**重载
// ⇒ 不过常驻壳展开。GetEscapeEffect() = Effect.GetEffect(-4), 表没接时上游在 `effect.source = this` 处 NRE。
export const escapeSkill = (): SkillRecord => {
  const skill = specialSkill(SkillType.逃跑)
  skill.name = '逃跑'
  skill.priority = 6
  const escape = Effect.getEscapeEffect(currentEffectTable())
  if (escape === null) throw new TypeError('NullReferenceException: Effect.GetEscapeEffect() 给 null (效果 -4 查不到) —— Skill.cs:307')
  setSkillEffect(skill, escape)
  return skill
}

// Skill.cs:311-320 換场技 —— options 三把键 (source_index/target_index/passive) 与那条 99999 优先级的
// pet_change 效果**各写一遍**: 键是给 UI/存档回写用的, 效果里的 dict 才是算子读的。
// `passive.ToString()` 在 C# 是 "True"/"False" (csBool), 不是 JSON 的 true/false。
export const petChangeSkill = (sourceIndex: number, targetIndex: number, passive = false): SkillRecord => {
  const skill = specialSkill(SkillType.換场)
  skill.name = '換场'
  dictSet(skill.options, 'source_index', String(sourceIndex))
  dictSet(skill.options, 'target_index', String(targetIndex))
  dictSet(skill.options, 'passive', csBool(passive))
  // GetPetChangeEffect 返回**单个** Effect ⇒ 同样走单数重载 (不展开常驻壳)。
  setSkillEffect(skill, Effect.getPetChangeEffect(sourceIndex, targetIndex, passive))
  return skill
}

// Skill.cs:322-336 —— 給換场技**换时机**: null 原样返回 null; type 不是換场则**原样返回同一个对象**
// (不是副本! 调用方拿到的还是那只共享引用); 只有真的換场技才 new Skill(rhs) 深拷一份, 再把
// ability==PetChange 的效果 SetTiming。上游 :331 的 `x != null` 是防 effects 里的洞。
export const petChangeSkillWithTiming = (petChangeSkill: SkillRecord | null, timing: EffectTiming): SkillRecord | null => {
  if (petChangeSkill === null) return null
  if (petChangeSkill.type !== SkillType.換场) return petChangeSkill
  const skill = cloneSkill(petChangeSkill)
  for (const e of skill.effects)
    if (e !== null && e.ability === EffectAbility.PetChange) e.setTiming(timing)
  return skill
}

/**
 * Skill.cs:277-289 GetRandomSkill —— `while(true) { Random.Range(minSkillId, maxSkillId+1) … }` 直到
 * 抽中一条**非必杀且非选技**。两处不可比: ① `UnityEngine.Random.Range` 是 native ECall (dotnet 宿主
 * 在方法入口就抛 SecurityException, 与 powerup 同一道墙); ② minSkillId/maxSkillId 读的是
 * `GameManager.versionData.skillData`, 在围栏外。⇒ 默认抛 NOT_PORTED, oracle 侧**不发**这条支的向量
 * (port-map 第六段的 powerup 口径: 放进来只会把向量洗成"两边同抛"的假绿), 形状由单测注入骰子锁。
 */
let RANDOM_SKILL_SOURCE: { rng: Rng; minSkillId: number; maxSkillId: number } | null = null
export const setRandomSkillSource = (src: { rng: Rng; minSkillId: number; maxSkillId: number } | null): void => { RANDOM_SKILL_SOURCE = src }

export function randomSkill(): SkillRecord {
  const src = RANDOM_SKILL_SOURCE
  if (src === null)
    throw new Error('NOT_PORTED: Skill.GetRandomSkill 要原生 Random.Range 与 skillData 的 id 上下界 —— 不可比, 用 setRandomSkillSource 注入')
  for (;;) {
    // 上游 GetSkill(skillId) 的 avoidNull 缺省 true ⇒ 查不到落 noOp, 所以这里不会是 null。
    const skill = getSkill(src.rng.nextInt(src.minSkillId, src.maxSkillId + 1))!
    if (skill.type !== SkillType.必杀 && !isSelectSkill(skill)) return skill
  }
}

// ── 技能表接缝 (Skill.cs:209-213) ────────────────────────────────
// 上游 Database.instance.GetSkill(id) + `avoidNull ? skill ?? GetNoOpSkill() : skill`。
// 默认查不到 —— headless 的 `game/core/**` 里不建表 (core/ 的门禁也不许它读资源); 表由装载方
// (`game/core/battle/skill-table.ts` 的 JsonSkillTable) 在 harness/上游侧注入, 与那份进程里
// Boot.cs:95 先 LoadSkill 再 LoadBuffInfo 的顺序一致。**id 0 永远查不到** (Database.cs:132 的短路)。
export interface SkillTable {
  getSkill(id: number): SkillRecord | null
}

let CURRENT_SKILL_TABLE: SkillTable = { getSkill: () => null }
export const setSkillTable = (table: SkillTable): void => { CURRENT_SKILL_TABLE = table }

export const getSkill = (id: number, avoidNull = true): SkillRecord | null => {
  const skill = CURRENT_SKILL_TABLE.getSkill(id)
  return avoidNull ? (skill ?? noOpSkill()) : skill
}

/**
 * BattlePet 的六个 skill 容器入口 (PetBattleSkillController.cs) —— 第七个成员 `getAvailableSkills`
 * 不是容器而是规则算法, 挂在下面那个接口的末尾。
 * allSkills 允许 null 项 —— 上游的 List<Skill> 里确实有洞 (空技能槽), BattleState.GetEffectHandler
 * 第一件事就是 `x != null` 过滤; 移植体把洞留在类型里, 免得实现方拿 undefined 填。
 *
 * 后四个是 `BattlePet.GetPetIdentifier` 的四个臂各自要的容器 (BattlePet.cs:213-267):
 *   · `skill[..]` 读 allSkills;
 *   · `normalSkill[N].x` 读的是 `IsNullOrEmpty(loopSkills) ? normalSkills : loopSkills` —— 即**环击表优先**,
 *     而它一旦非空就完全不看 normalSkills;
 *   · `superSkill.x` 读单个大技;
 *   · 三者都可能整体为 null (上游的 `List<Skill> headerSkills` 等是无初值字段), 所以这里留 null 类型。
 */
export interface PetSkillControllerView {
  allSkills: (SkillRecord | null)[]
  findSkill(id: number): SkillRecord | null
  headerSkills: (SkillRecord | null)[] | null
  loopSkills: (SkillRecord | null)[] | null
  normalSkills: (SkillRecord | null)[] | null
  superSkill: SkillRecord | null
  /**
   * PetBattleSkillController.cursor —— 开场表/环击表的走位。**可写**: GetDefaultSkill 走它,
   * 而且走完开场表会把 headerSkills 写成 null (一次性开场序列, 见 pet/skill-controller.ts)。
   */
  cursor: number
  /**
   * PetBattleSkillController.GetAvailableSkills(anger, withSuper=true) —— 主动技表的筛法。
   * 实现在 pet/skill-controller.ts (core 里的规则算法, 宿主只做转发), 因为这一支要**同时**读
   * normalSkills 与 loopSkills, 而它的优先级与 `normalSkill[N].x` 标识符臂正好相反 (见那文件的头)。
   */
  getAvailableSkills(anger: number, withSuper?: boolean): SkillRecord[]
  /**
   * PetBattleSkillController.GetDefaultSkill(anger) (:43-67) —— 「这一回合默认出什么」。
   * 规则在 pet/skill-controller.ts; **它会改写 cursor / headerSkills**, 所以只能对**将要出招的那只宠**调。
   */
  getDefaultSkill(anger: number): SkillRecord
}

/**
 * BattlePet.buffController 在 state.ts 里的最小面 (PetBattleBuffController.cs)。
 * `buffs` 与 `getBuff` 都从这里读 —— 上游 BattlePet.buffs 就是 `buffController.buffs` 的转发属性。
 *
 * 后面那批是 `Identifier.GetBuffIdentifier` 的臂要读的 (Identifier.cs:435-542):
 *   · `element`/`subElement` —— `me.pet.element` 读的就是 `(int)buffController.element`, 它是**会被场上
 *     印记改写的**属性, 不是宠的固有属性;
 *   · 六个 block/copy —— `buff[..].block` / `.copy` 的全部数据来源, 注意构造期就落了一个元素块 id
 *     (见 pet/buff-controller.ts 文件头), 所以「空控制器」的 `buff[0].block` 也是 1;
 *   · `getRangeBuff` —— 泛型类型的 `"id"` 臂 (`buff(<type>).id` 那类) 靠它取第一条。
 * 真实现是 pet/buff-controller.ts 的 `PetBuffController`; 这里留成接口是给测试替身与视图注入用的。
 */
export interface PetBuffControllerView {
  buffs: Buff[]
  getBuff(id: number): Buff | null
  /** PetBattleBuffController.RemoveBuff(buff, unit, state) —— TurnEndPhase.cs:88 的护盾耗尽摘除。 */
  removeBuff(buff: Buff, unit: unknown, state: unknown): void
  readonly element: number
  readonly subElement: number
  readonly isMovable: boolean
  isBuffBlocked(buff: Buff | null): boolean
  isBuffIdBlocked(id: number): boolean
  isBuffTypeBlocked(type: BuffType): boolean
  isBuffCopied(buff: Buff | null): boolean
  isBuffIdCopied(id: number): boolean
  isBuffTypeCopied(type: BuffType): boolean
  getRangeBuff(predicate: (buff: Buff) => boolean): Buff[]
  /** PetBattleBuffController.OnAddBuff(newBuff, buffUnit, state) —— SetBuff 的 type=="id" 分支换完 id 后显式重触发 (EffectAbilityHandler.cs:1218)。 */
  onAddBuff(newBuff: Buff | null, buffUnit: unknown, state: unknown): void
  /** PetBattleBuffController.AddBuff(newBuff, buffUnit, invokeUnit, state, triggerCopy=true)。 */
  addBuff(newBuff: Buff | null, buffUnit: unknown, invokeUnit: unknown, state: unknown, triggerCopy?: boolean): boolean
  /**
   * PetBattleBuffController.RemoveRangeBuff —— 上游的**两个同元数重载** (IEnumerable<Buff> 与
   * Predicate<Buff> + randomCount=-1) 在这里合成一个入口, 靠首参是不是函数分派。
   * `BattlePet.PowerUp` 用的就是谓词臂且**不给 randomCount** ⇒ 走 `count=int.MaxValue` 那条静默整表浅拷,
   * 一次随机都不取 (真实现见 pet/buff-controller.ts)。
   */
  removeRangeBuff(target: Buff[] | ((buff: Buff) => boolean) | null, buffUnit: unknown, state: unknown, randomCount?: number): boolean
  /**
   * PetBattleBuffController.AddRangeBuff(buffRange, buffUnit, state) —— 换场继承 (PetChange.cs:151) 用的那一条:
   * 稳定排序后逐项 `AddBuff` 且 `isSuccess |=` 不短路 (真实现见 pet/buff-controller.ts)。
   */
  addRangeBuff(buffRange: Buff[] | null, buffUnit: unknown, state: unknown, invokeUnit?: unknown): boolean
}

/**
 * BattlePet.cs 在战斗状态机眼里的样子 —— 只列 Unit/UnitPetSystem/BattleState 真正读到的成员。
 * 三处必须是**属性**而不是快照字段:
 *   · `anger` 是 statusController.anger 的读写转发 (BattlePet.cs:43-47), 所以 UnitPetSystem
 *     换场时那句 `petBag[index].anger = anger` 改写的是**控制器里的** 值;
 *   · `battleElement` / `subBattleElement` 读的是 buffController.element, 会被场上印记改掉;
 *   · `isDead` 走 deadCondition (默认 battleStatus.hp <= 0), `isToken` 是「有没有 -21 号印记」。
 *
 * `clone()` 对应 `new BattlePet(rhs)` (BattlePet.cs:82-94), 是拷贝构造快照的**唯一**深拷贝入口:
 * UnitPetSystem 的拷贝构造对每个非 null 宠调它 (三个 controller 各新建一份, 不共享引用)。
 * 反过来 `UnitPetSystem(原袋)` 那个构造只做 Array.Copy (**引用**浅拷), 两者不能混。
 */
export interface BattlePetView {
  readonly name: string
  readonly level: number          // int (Pet.cs)
  readonly star: number           // info.star —— 同系加成 1.5/1.25 的分界用它 (>5)
  // BattlePet.cs:205 `"baseId" => basic.baseId` —— Capture 算子 (:95) 读的正是它 (baseId==10 无条件捕获短路)。
  // 它是**表读值** (进 petInfoDict 那条), 不进签名; 移植体留成可缺省, 宿主/FakePet 填真值, 缺省按上游的 0。
  readonly baseId?: number
  readonly isDead: boolean
  readonly isMovable: boolean
  readonly isToken: boolean
  readonly battleElement: number
  readonly subBattleElement: number
  readonly statusController: StatusController
  readonly battleStatus: BattleStatus
  // BattlePet.cs:27 —— initStatus 是 statusController.initStatus 的只读转发 (StatusCondition 的
  // maxValue 读的就是 `pet.initStatus[statusType]`, 与 battleStatus[statusType] 成对)。
  readonly initStatus: Status
  stayTurn: number
  anger: number
  // BattlePet.cs:32-41 —— hp/maxHp 也是 statusController 的读写转发 (与 anger 同一条注释的道理:
  // AttackPhase.ConsumeAnger/ApplyAttackDamage 写的就是控制器里的值, 拷贝构造之后仍然一致)。
  hp: number
  maxHp: number
  // BattlePet.cs:49 —— maxAnger 也是 statusController 的只读转发 (AttackPhase.ApplyAttackDamage 的怒气公式)。
  readonly maxAnger: number
  chain: number          // BattlePet.cs:10 —— int 字段, AfterAttack 里 `pet.chain++` 与 token.chain++
  readonly buffs: Buff[]
  readonly skillController: PetSkillControllerView
  readonly buffController: PetBuffControllerView
  onTurnStart(thisUnit: unknown, state: unknown): void
  /**
   * BattlePet.PowerUp(status, lhsUnit, state, isSet=false) —— 增幅写入的唯一入口 (BattlePet.cs:333-354)。
   * 规则在 state.ts 的 `petPowerUp` 里, 宿主转发过去; 视图留成成员是因为 `powerup` 算子下一段要调的就是
   * `pet.PowerUp(...)`, 让调用点与上游逐字同形。
   */
  powerUp(status: Status, lhsUnit: unknown, state: unknown, isSet?: boolean): void
  /**
   * BattlePet.GetDefaultSkill() (BattlePet.cs:327-331) —— 敌方自动出招的入口。
   * 比控制器的多一步: 无限怒气印记 (buff 61) ⇒ petAnger 取 int.MaxValue (否则读真实 anger)。
   */
  getDefaultSkill(): SkillRecord
  clone(): BattlePetView
}
