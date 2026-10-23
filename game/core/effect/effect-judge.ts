// Effect.cs:224-389 (Condition / Apply / CheckAndApply / PostProcess / TryGetPostProcessEffects) 与
// EffectConditionHandler.cs (四个前置检查 + 六个判定族, 共 414 行)、EffectAbilityHandler.cs:13-36
// (DefaultAbility) 的逐行移植 —— S3 第五段步骤 4「判定/执行外壳」。
//
// ── 为什么 Condition 与 Apply 必须同一份文件、同一个增量 ──
// 上游 Apply 的未移植算子 (Heal/SetDamage/…) 落进 `DefaultAbility` 之前是先列在 switch 里的 (Effect.cs:314-338),
// 而 `DefaultAbility` (EffectAbilityHandler.cs:13) 本身是**完整可跑**的一条 (它只做「条件成不成立」的递归判定,
// 不改状态)。如果这一轮只搬 Condition 不搬 Apply: 现成的 phasedrive/effectq 那批「抛在 apply」的向量会**改抛点**
// (从 JUDGE.apply 的 NOT_PORTED 挪到 condition→apply 里的真外壳), 一片本来绿的条子当场翻红。
// 所以两处外壳一起立, 未移植算子在**这里**显式抛, 保持抛点语义不变。
//
// ── 这条缝默认不接 (见 battle/effect-handler.ts 的 NOT_PORTED) ──
// 生产 JUDGE 仍是 NOT_PORTED; 本文件的 condition/apply 只在 judge 自己的单测与对拍 harness 里经
// setEffectJudgement 注入。这样 phase 家族 (phaseq/phasedrive) 的行为一字不变, 只有新 kinds 与补回的
// target 向量吃到真判定 —— 这是计划里「不能全局注入」那条纪律。
//
// ── headless 纪律 ──
// 无 UnityEngine / Player.instance / 直接读盘。`Player.instance.random` 走 identifier-effect 的存档侧接缝
// (getPlayerRandom / effectIdentHost().setPlayerRandom), `Random.Range(0,100)` 走同一个注入的 Rng。
// 未建模的 Pet 实例 (base Pet.cs) 在 state==null 的 PetCondition/StatusCondition 两支显式抛 —— 对拍向量
// 不生成那两种形状 (oracle 用真 Pet 会算出来, 移植体没有 ⇒ 发了就是假不一致), 与 native RNG 一支同口径。

import { Effect, currentEffectTable } from './effect.ts'
import {
  EffectAbility, EffectCondition, EffectTiming, isAttackPhase,
} from './effect-database.ts'
import type { Options } from './effect.ts'
import type { EffectStateView } from '../battle/effect-handler.ts'
import { EffectHandler } from '../battle/effect-handler.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView, SkillRecord } from '../battle/views.ts'
import { getSkill } from '../battle/views.ts'
import { SkillType } from '../pet/skill.ts'
import type { Buff } from '../buff/buff.ts'
import { toBuffType, BuffType } from '../buff/buff-database.ts'
import { dictGet, dictTryGet, isEmpty } from '../collections.ts'
import { toInt } from '../mathf.ts'
import { isWithin } from '../numutil.ts'
import {
  boolParse, boolTryParse, parseIntOrThrow, parseFloatOrThrow, toIntList,
  tryTrimStart, tryTrimParentheses, tryParseInt,
} from '../strutil.ts'
// 本文件导出的 `condition` 是判定外壳, 与 operator.ts 那个三参比较算子同名 —— 起了别名才不撞。
import { condition as opCondition, conditionOf, type DataType } from '../parser/operator.ts'
import { parseConditionFilter, parseDataType, parseOperation } from '../parser/parser.ts'
import {
  effectIdentHost, getPlayerRandom, getPetIdentifier, getSkillIdentifier,
  parseEffectOperation,
} from '../parser/identifier-effect.ts'
import { getNumIdentifier, getIdentifier } from '../parser/identifier.ts'
import { linqMax } from '../pet/status.ts'
import { setBuffEffectTrigger } from '../pet/buff-controller.ts'
import { addStatus, setDamage } from './ops-basic.ts'
import { addBuff, removeBuff } from './ops-buff.ts'
import { powerup } from './ops-powerup.ts'
import { heal } from './ops-heal.ts'
import { capture } from './ops-capture.ts'
import { petChange } from './ops-pet.ts'
import { setSkill } from './ops-skill.ts'
import { win, escape, setWeather } from './ops-state.ts'
import { blockOrCopyBuff } from './ops-block.ts'
import { setBuff } from './ops-set-buff.ts'
import { copyBuff } from './ops-copy-buff.ts'
import { rage } from './ops-rage.ts'
import { poker } from './ops-poker.ts'
import { setPetBag } from './ops-set-pet-bag.ts'

const nre = (where: string): never => { throw new TypeError(`NullReferenceException: ${where}`) }
const notPorted = (what: string): never => { throw new Error(`NOT_PORTED: ${what} —— 见 docs/engine/port-map.md 第五段步骤 4`) }

/** state 在本层的真实类型 —— EffectStateView 是 handler 的最小视图, 判定族要的是整个 BattleState。 */
const asBattle = (state: EffectStateView | null): BattleState | null => state as BattleState | null

// 存档侧 random 的**写**入口 (RandomNumber 的 `Player.instance.random = Random.Range(0,100)`),
// 与读同一个 host, 保证 harness 注入的 cell 读写一致。
const setPlayerRandom = (v: number): void => effectIdentHost().setPlayerRandom(v)
const nativeRange0100 = (): number => effectIdentHost().rng.nextInt(0, 100)   // Unity Random.Range(int,int) = 闭区间

// numId = 链尾的 Identifier.GetNumIdentifier —— 判定族里 state==null 的兜底解析要它 (无战斗上下文)。
const numId = (id: string): number => getNumIdentifier(id, effectIdentHost())
// Parser.ParseOperation(string) 重载 (Parser.cs:106) 用的是**无上下文** GetIdentifier。
// 直接交给 identifier.ts 的 getIdentifier —— 它才是逐行照搬 Identifier.cs:35-188 的那版 (date./player.
// 前缀 + host.resolve 兜底 + 链尾 getNumIdentifier); 自己手搓 resolve→numId 会漏掉 date./player. 两支。
const noCtxResolve = (id: string): number => getIdentifier(id, effectIdentHost())

// ─────────────────────────── Effect.cs:224-293 Condition ───────────────────────────

export function condition(
  effect: Effect,
  invokeUnit: unknown,
  state: EffectStateView | null,
  checkPhase: boolean,
  checkTurn: boolean,
): boolean {
  const st = asBattle(state)

  // Effect.cs:226-227 —— 常驻 (state==null) 只在 timing==Resident 时放行; 战斗内 phase>Resident 时 All(-999) 也放行。
  const isCorrectPhase = (st === null && effect.timing === EffectTiming.Resident) ||
    (st !== null && (effect.timing === st.phase || (st.phase > EffectTiming.Resident && effect.timing === EffectTiming.All)))

  if (checkPhase && !isCorrectPhase)
    return false

  // Effect.cs:232 —— 六个判定族读的是**这个** invokeUnit (存进 effect 供扩展方法用)。
  effect.invokeUnit = invokeUnit

  let correctCondOptionDictList = effect.condOptionDictList
  if (checkTurn) {
    correctCondOptionDictList = effect.condOptionDictList.filter((x) => isCorrectTurn(effect, st, x))
    if (isEmpty(correctCondOptionDictList))
      return false
  }

  const condFunc = conditionFunc(effect.condition)

  // Effect.cs:256-272 —— Exists = some; 四支前置 + 族判定, 短路顺序照抄 (weather → hit → rng → cond)。
  const result = correctCondOptionDictList.some((x) =>
    isCorrectWeather(effect, st, x) && isAttackAndHit(effect, st, x) &&
    randomNumber(effect, st, x) && condFunc(effect, st, x))

  // Effect.cs:275-290 —— 未触发则**永久改写**这条效果 (target/ability/abilityOptionDict), 并抹掉 on_fail。
  if (!result) {
    // `condOptionDictList.Select(x => x?.Get("on_fail")).FirstOrDefault(x => x != null)` —— 取**第一个非 null** 值,
    // 用的是原表 (不是 correctCondOptionDictList)。
    let postExpr: string | null = null
    for (const x of effect.condOptionDictList) {
      const v = x === null ? null : dictGet(x, 'on_fail')
      if (v !== null) { postExpr = v; break }
    }

    const post = tryGetPostProcessEffects(effect, postExpr, st)
    if (!post.ok || isEmpty(post.effects))
      return result

    const fallback = post.effects.length ? post.effects[0] : null
    if (fallback === null)
      return result

    effect.target = fallback.target
    effect.condOptionDictList.forEach((x) => { if (x !== null) x.delete('on_fail') })
    effect.ability = fallback.ability
    effect.abilityOptionDict = fallback.abilityOptionDict
    return true
  }

  return result
}

// Effect.cs:243-254 —— condition 枚举 → 判定族。LastSkill 与 CurrentSkill 同族, CurrentToken 走 PetCondition,
// 未知 (None 等) 恒真。
function conditionFunc(cond: EffectCondition): (effect: Effect, state: BattleState | null, opt: Options) => boolean {
  switch (cond) {
    case EffectCondition.CurrentUnit: return unitCondition
    case EffectCondition.CurrentPet: return petCondition
    case EffectCondition.CurrentToken: return petCondition
    case EffectCondition.CurrentStatus: return statusCondition
    case EffectCondition.CurrentBuff: return buffCondition
    case EffectCondition.CurrentSkill: return skillCondition
    case EffectCondition.LastSkill: return skillCondition
    case EffectCondition.Poker: return pokerCondition
    default: return () => true
  }
}

// ──────────────────────── EffectConditionHandler.cs:13-131 四个前置检查 ────────────────────────

// :13-29 —— state==null 恒真。turn_num 先判 (odd/even/all); whosTurn==0 或 turn_num 不过就**只看** turn_num。
export function isCorrectTurn(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  if (state === null) return true

  const turn = dictGet(condOptions, 'turn_num', 'all')!
  const isTurnNumCorrect = (turn === 'all') || ((turn === 'odd') && (state.turn % 2 === 1)) || ((turn === 'even') && (state.turn % 2 === 0))

  if ((state.whosTurn === 0) || !isTurnNumCorrect)
    return isTurnNumCorrect

  const who = dictGet(condOptions, 'whos_turn', 'me')!
  const invokeUnit = effect.invokeUnit as Unit

  const isWhosTurnCorrect = (who === 'all') || (invokeUnit.id === ((who === 'me') ? state.atkUnit!.id : state.defUnit!.id))
  return isWhosTurnCorrect && isTurnNumCorrect
}

// :31-45 —— weather=="all" 放行; 否则 int.TryParse (失败即 false, 不抛), 再 Operator.Condition。
export function isCorrectWeather(_effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  if (state === null) return true

  const weatherOp = dictGet(condOptions, 'weather_op', '=')!
  const weather = dictGet(condOptions, 'weather', 'all')!
  if (weather === 'all') return true

  const value = tryParseInt(weather)
  if (value === null) return false

  return opCondition(weatherOp, state.weather, value)
}

// :47-79 —— whos_attack 换左右手; 换场时机看的是「那一手是不是换场技」; 攻击时机才查 is_hit/is_move。
export function isAttackAndHit(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  if (state === null) return true

  const who = dictGet(condOptions, 'whos_attack', 'me')!
  if (who === 'all') return true

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? state.getUnitById(invokeUnit.id)! : state.getRhsUnitById(invokeUnit.id)!

  const isAttackPhaseNow = isAttackPhase(state.phase)
  const isPetChangePhase = (state.phase === EffectTiming.OnBeforePetChange) || (state.phase === EffectTiming.OnAfterPetChange)
  if (isPetChangePhase)
    return (lhsUnit.skill !== null) && (lhsUnit.skill.type === SkillType.換场)

  if (!isAttackPhaseNow) return true

  const hit = dictGet(condOptions, 'is_hit', 'true')!
  const move = dictGet(condOptions, 'is_move', 'true')!
  let isHit = true, isMove = true

  if (hit !== 'all') { const t = boolTryParse(hit); if (!t.ok) return false; isHit = t.value }
  if (move !== 'all') { const t = boolTryParse(move); if (!t.ok) return false; isMove = t.value }

  // :78 —— isHit 读的是 skillSystem.isHit (这一手算没算中), isMove 读的是 pet.isMovable。任一处 null ⇒ NRE, 照炸。
  return ((hit === 'all') || (lhsUnit.skillSystem!.isHit === isHit)) && ((move === 'all') || (lhsUnit.pet!.isMovable === isMove))
}

// :81-131 —— random_op / random_cmp 都没配 ⇒ 无随机判定放行。state==null 用存档侧 random (type=="rng" 才写);
// state!=null 用 lhsUnit.random 或 native Range, 再叠 67/68/75/76 印记与 600014 场印修正。
// ⚠ `random_type=="rng"` 那两支的 native Random.Range(0,100) 与 oracle 的随机流对齐太脆 ⇒ 对拍生成阶段过滤
//    (与 parser/identifier.ts 的 ListHelper.Random 同口径); 移植体仍**如实**调注入的 Rng, 只是不拿它出向量。
export function randomNumber(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const type = dictGet(condOptions, 'random_type', 'rng')!
  const opT = dictTryGet<string>(condOptions, 'random_op', 'LTE')
  const cmpT = dictTryGet<string>(condOptions, 'random_cmp', '100')
  const isOpExist = opT.ok
  const isValueExist = cmpT.ok
  const op = opT.value!
  const cmpValue = cmpT.value!

  if (!isOpExist && !isValueExist) return true

  let random = getPlayerRandom()
  let value: number

  let lhsUnit: Unit | null = null
  let rhsUnit: Unit | null = null

  if (state === null) {
    if (type === 'rng')
      setPlayerRandom(nativeRange0100())   // 写了也不影响下面的读 (random 已取过), 但保序照搬
  } else {
    const invokeUnitId = (effect.invokeUnit as Unit).id
    lhsUnit = state.getUnitById(invokeUnitId)!
    rhsUnit = state.getRhsUnitById(lhsUnit.id)!

    random = (type === 'rng') ? nativeRange0100() : lhsUnit.random
    // :109-113 —— 印记链, 每一步都在 float 上做; GetBuff(id)?.value ?? 默认。value 是 int (Buff.value)。
    const b75 = lhsUnit.pet!.buffController.getBuff(75)
    random = random * ((b75?.value ?? 100) / 100)
    const b67 = lhsUnit.pet!.buffController.getBuff(67)
    random = random + (b67?.value ?? 0)
    const b76 = lhsUnit.pet!.buffController.getBuff(76)
    random = random * ((b76?.value ?? 100) / 100)
    random = random - state.stateBuffs.filter((x) => x[1].id === 600014).length * 15
    const b68 = lhsUnit.pet!.buffController.getBuff(68)
    random = b68?.value ?? random
  }

  if (op === 'IN') {
    const middleIndex = cmpValue.indexOf('~')
    if (middleIndex === -1) return false

    const startExpr = cmpValue.substring(0, middleIndex)
    const endExpr = cmpValue.substring(middleIndex + 1)
    const startRange = parseIntOrThrow(startExpr)
    const endRange = parseIntOrThrow(endExpr)
    return isWithin(random, startRange, endRange)
  }

  value = (state === null) ? parseFloatOrThrow(cmpValue) : parseEffectOperation(cmpValue, effect, lhsUnit as Unit, rhsUnit as Unit)
  return opCondition(op, random, value)
}

// ──────────────────────── EffectConditionHandler.cs:133-413 六个判定族 ────────────────────────

// :133-166 —— type 按 '/' 切多子条件, 每个子条件读 `type[i].op` / `type[i].cmp`。
// state==null 两支用**无上下文** Parser.ParseOperation; 否则两侧都走 ParseEffectOperation。
export function unitCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const who = dictGet(condOptions, 'who', 'me')!
  const type = dictGet(condOptions, 'type', 'none')!
  const typeList = type.split('/')

  if (state === null) {
    for (let i = 0; i < typeList.length; i++) {
      const op = dictGet(condOptions, `type[${i}].op`, '=')!
      const cmpValue = dictGet(condOptions, `type[${i}].cmp`, '0')!
      if (!opCondition(op, parseOperation(typeList[i], noCtxResolve), parseOperation(cmpValue, noCtxResolve)))
        return false
    }
    return true
  }

  const invokeUnitId = (effect.invokeUnit as Unit).id
  const lhsUnit = (who === 'me') ? state.getUnitById(invokeUnitId)! : state.getRhsUnitById(invokeUnitId)!
  const rhsUnit = state.getRhsUnitById(lhsUnit.id)!

  for (let i = 0; i < typeList.length; i++) {
    const op = dictGet(condOptions, `type[${i}].op`, '=')!
    const cmpValue = dictGet(condOptions, `type[${i}].cmp`, '0')!
    if (!opCondition(op,
      parseEffectOperation(typeList[i], effect, lhsUnit, rhsUnit),
      parseEffectOperation(cmpValue, effect, lhsUnit, rhsUnit)))
      return false
  }
  return true
}

// :168-220 —— state==null 要 base Pet 实例 (core 没有) ⇒ 抛, 对拍不生成该形状。state!=null 走 battlePet 视图。
export function petCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const who = dictGet(condOptions, 'who', 'me')!
  const type = dictGet(condOptions, 'type', 'none')!
  const own = dictGet(condOptions, 'own', 'true')!
  const typeList = type.split('/')

  if (state === null) {
    if (type === 'none') return true
    return notPorted('PetCondition 的 state==null 支需要 base Pet 实例 (Pet.cs) —— 本轮 core 无 Pet 模型')
  }

  const invokeUnitId = (effect.invokeUnit as Unit).id
  const lhsUnit = (who === 'me') ? state.getUnitById(invokeUnitId)! : state.getRhsUnitById(invokeUnitId)!
  const rhsUnit = state.getRhsUnitById(lhsUnit.id)!

  // :197-201 —— token 族读 lhsUnit.token; 其余: who==me 时**优先** effect.sourcePet, 否则 lhsUnit.pet。
  const battlePet: BattlePetView | null = effect.condition === EffectCondition.CurrentToken
    ? lhsUnit.token
    : ((who === 'me') ? ((effect.sourcePet as BattlePetView) ?? lhsUnit.pet) : lhsUnit.pet)

  const ownParse = boolTryParse(own)
  if (!ownParse.ok) return false
  const ownPet = ownParse.value

  const isOwnCorrect = (ownPet === (battlePet !== null))
  if ((!ownPet) || (!isOwnCorrect) || (type === 'none'))
    return isOwnCorrect

  for (let i = 0; i < typeList.length; i++) {
    const op = dictGet(condOptions, `${typeList[i]}_op`, '=')!
    const cmpValue = dictGet(condOptions, `${typeList[i]}_cmp`, '0')!
    const value = parseEffectOperation(cmpValue, effect, lhsUnit, rhsUnit)
    if (!opCondition(op, getPetIdentifier(typeList[i], lhsUnit.petSystem, battlePet), value))
      return false
  }
  return true
}

// :222-260 —— status_type 三支: hp / anger / 其余按 battleStatus 索引。cmp_value 是 DataType (分数走 ConditionOf)。
export function statusCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const who = dictGet(condOptions, 'who', 'me')!
  const statusType = dictGet(condOptions, 'status_type', 'hp')!
  const op = dictGet(condOptions, 'op', '=')!
  const cmpValue = dictGet(condOptions, 'cmp_value', '1/1')!
  const data = parseDataType(cmpValue) as { type: DataType; value: unknown }

  const invokeUnit = effect.invokeUnit

  let currentValue = 0, maxValue = 0

  if (state === null) {
    return notPorted('StatusCondition 的 state==null 支需要 base Pet.currentStatus/normalStatus —— 本轮 core 无 Pet 模型')
  }

  const invokeUnitId = (invokeUnit as Unit).id
  const statusUnit = (who === 'me') ? state.getUnitById(invokeUnitId)! : state.getRhsUnitById(invokeUnitId)!

  if (statusType === 'hp') {
    currentValue = statusUnit.pet!.hp
    maxValue = statusUnit.pet!.maxHp
  } else if (statusType === 'anger') {
    currentValue = statusUnit.pet!.anger
    maxValue = statusUnit.pet!.maxAnger
  } else {
    currentValue = statusUnit.pet!.battleStatus.get(statusType)
    maxValue = statusUnit.pet!.initStatus.get(statusType)
  }

  return conditionOf(op, currentValue, maxValue, data)
}

// :262-322 —— id 三种形状: 括号过滤器 / BuffType 名 / 纯数字; key 分流 unit/state/pet 三张印记表。
export function buffCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const key = dictGet(condOptions, 'key', '')!
  const who = dictGet(condOptions, 'who', 'me')!
  let id = dictGet(condOptions, 'id', '0')!
  const own = dictGet(condOptions, 'own', 'true')!
  const type = dictGet(condOptions, 'type', 'none')!
  const typeList = type.split('/')

  // 上游无条件把 invokeUnit 当 Unit 解引用, 且紧接着 state.GetUnitById ⇒ 无 state 分支 (state==null 会 NRE, 不生成)。
  const st = state as BattleState
  if (!boolTryParse(own).ok) return false
  const ownBuff = boolTryParse(own).value

  const invokeUnitId = (effect.invokeUnit as Unit).id
  const buffUnit = (who === 'me') ? st.getUnitById(invokeUnitId)! : st.getRhsUnitById(invokeUnitId)!
  const rhsUnit = st.getRhsUnitById(buffUnit.id)!
  const pet = buffUnit.pet!

  let buff: Buff | null = null
  if (!tryTrimParentheses(id, '(', ')').ok) {
    const buffId = tryParseInt(id)
    if (buffId === null) {
      const buffType = toBuffType(id)
      if (buffType !== BuffType.None)
        return ownBuff !== isEmpty(pet.buffController.getRangeBuff((x) => x.isType(buffType)))
    } else {
      if ((key === '' || key === null) && (buffId === 0))
        return true
      id = ((key === '' || key === null) || (key === 'unit')) ? `(id:${buffId})` : null!
    }
  }

  const buffFilter = parseConditionFilter<Buff>(id, (exprs, b) => exprs.map((expr) => {
    const r = b.tryGetBuffIdentifier(expr)
    return r.ok ? r.num : numId(expr)
  }))

  if (key === 'unit')
    buff = buffUnit.unitBuffs.find((x) => buffFilter(x)) ?? null
  else if (key !== '' && key !== null)
    buff = st.stateBuffs.filter((x) => (x[0] === key) && buffFilter(x[1])).map((x) => x[1])[0] ?? null
  else
    buff = pet.buffController.getRangeBuff((x) => buffFilter(x))[0] ?? null

  const isOwnCorrect = (ownBuff === (buff !== null))
  if ((!ownBuff) || (!isOwnCorrect) || (type === 'none'))
    return isOwnCorrect

  for (let i = 0; i < typeList.length; i++) {
    const op = dictGet(condOptions, `${typeList[i]}_op`, '=')!
    const cmpValue = dictGet(condOptions, `${typeList[i]}_cmp`, '0')!
    const value = parseEffectOperation(cmpValue, effect, buffUnit, rhsUnit)
    if (!opCondition(op, (buff as Buff).getBuffIdentifier(typeList[i]), value))
      return false
  }
  return true
}

// :325-354 —— LastSkill 换到上一帧快照; 快照为 null ⇒ bool.Parse(default) (**会抛** 的 Parse, 非 TryParse)。
export function skillCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const who = dictGet(condOptions, 'who', 'me')!
  const type = dictGet(condOptions, 'type', 'none')!
  const typeList = type.split('/')

  const invokeUnitId = (effect.invokeUnit as Unit).id
  // :332 —— state==null 且非 LastSkill ⇒ skillState=null ⇒ 落 default (可拍); LastSkill 且 state==null ⇒ NRE (不生成)。
  if (effect.condition === EffectCondition.LastSkill && state === null)
    nre('SkillCondition 的 LastSkill 支在 state==null 时读 state.lastTurnState (EffectConditionHandler.cs:332)')
  const skillState = (effect.condition === EffectCondition.LastSkill) ? (state as BattleState).lastTurnState : state

  if (skillState === null)
    return boolParse(dictGet(condOptions, 'default', 'false')!)

  const skillUnit = (who === 'me') ? skillState.getUnitById(invokeUnitId)! : skillState.getRhsUnitById(invokeUnitId)!
  const rhsUnit = skillState.getRhsUnitById(skillUnit.id)!
  const skillSystem = skillUnit.skillSystem!

  if (type === 'none') return true

  for (let i = 0; i < typeList.length; i++) {
    const op = dictGet(condOptions, `${typeList[i]}_op`, '=')!
    const cmpValue = dictGet(condOptions, `${typeList[i]}_cmp`, '0')!
    const value = parseEffectOperation(cmpValue, effect, skillUnit, rhsUnit)
    if (!opCondition(op, getSkillIdentifier(typeList[i], skillSystem), value))
      return false
  }
  return true
}

// :356-413 —— 扑克族。cards 取 group=="poker" 的印记; 四个 code + straight(N) 区间判定。
// `GroupBy().Max()` 在 cards 空时**抛** EmptyEnumerable ⇒ 与 linqMax 的空表抛同形 (发向量时如实留)。
export function pokerCondition(effect: Effect, state: BattleState | null, condOptions: Options): boolean {
  const who = dictGet(condOptions, 'who', 'me')!
  const type = dictGet(condOptions, 'type', 'none')!
  const typeList = type.split('/')
  const st = state as BattleState
  const invokeUnitId = (effect.invokeUnit as Unit).id

  const pokerUnit = (who === 'me') ? st.getUnitById(invokeUnitId)! : st.getRhsUnitById(invokeUnitId)!
  const rhsUnit = st.getRhsUnitById(pokerUnit.id)!
  const cards = pokerUnit.pet!.buffController.getRangeBuff((x) => dictGet(x.info.options, 'group') === 'poker')

  if (type === 'none') return true

  const getPokerIdentifier = (code: string): number => {
    const ts = tryTrimStart(code, 'straight')
    const paren = ts.ok ? tryTrimParentheses(ts.trim) : { ok: false, trim: '' }
    const count = paren.ok ? tryParseInt(paren.trim) : null
    if (ts.ok && paren.ok && count !== null) {
      const seen = new Set<number>()
      const sortByPoint: number[] = []
      for (const x of cards) { if (!seen.has(x.value)) { seen.add(x.value); sortByPoint.push(x.value) } }
      sortByPoint.sort((a, b) => a - b)   // Distinct 保序后 OrderBy(x=>x) —— 数值升序, 稳定。
      let goal = 1
      for (let i = 1; i < sortByPoint.length; i++) {
        if (sortByPoint[i] - sortByPoint[i - 1] === 1) goal++
        else goal = 1
        if (goal >= count) return 1
      }
      return 0
    }

    switch (code) {
      default: return 0
      case 'count': return cards.length
      case 'color.same.max.count': return linqMax(groupCounts(cards.map((x) => x.id)))
      case 'point.same.max.count': return linqMax(groupCounts(cards.map((x) => x.value)))
    }
  }

  for (let i = 0; i < typeList.length; i++) {
    const op = dictGet(condOptions, `${typeList[i]}_op`, '=')!
    const cmpValue = dictGet(condOptions, `${typeList[i]}_cmp`, '0')!
    const value = parseEffectOperation(cmpValue, effect, pokerUnit, rhsUnit)
    if (!opCondition(op, getPokerIdentifier(typeList[i]), value))
      return false
  }
  return true
}

// GroupBy(key).Select(g => g.Count()) —— 按 key 首现顺序聚簇 (与 LINQ GroupBy 的迭代序一致), 返回各簇大小。
function groupCounts(keys: number[]): number[] {
  const order: number[] = []
  const byKey = new Map<number, number>()
  for (const k of keys) {
    if (!byKey.has(k)) { byKey.set(k, 0); order.push(k) }
    byKey.set(k, byKey.get(k)! + 1)
  }
  return order.map((k) => byKey.get(k)!)
}

// ─────────────────────────── Effect.cs:295-343 Apply ───────────────────────────

export function apply(effect: Effect, invokeUnit: unknown, state: EffectStateView | null): boolean {
  effect.invokeUnit = invokeUnit
  const st = asBattle(state)

  const repeatExpr = dictGet(effect.abilityOptionDict, 'repeat', '1')!
  let repeat = 1

  if (st === null)
    repeat = parseIntOrThrow(repeatExpr)   // state==null: int.Parse ⇒ 非整数串即抛 (不认表达式)
  else {
    const lhsUnit = invokeUnit as Unit
    const rhsUnit = st.getRhsUnitById(lhsUnit.id)!
    repeat = toInt(parseEffectOperation(repeatExpr, effect, lhsUnit, rhsUnit))   // (int) 截断
  }

  // Effect.cs:310-339 —— C# 的 `result &= (type switch …)` 是**逐次求值**再与 (bool 的 &= 不短路),
  // 于是 repeat 次每一轮都会真的跑一次算子 (哪怕上一轮已 false, 副作用照样落)。JS 的 `&&` 会短路掉
  // 后面的调用 ⇒ 必须先算出这一轮再 AND, 否则 repeat>1 时少跑几轮。
  let result = true
  for (let i = 0; i < repeat; i++) {
    const one = applyAbility(effect, st)
    result = result && one
  }

  postProcess(effect, result, st)
  return result
}

// Effect.cs:345-352 CheckAndApply —— 印记的 on_add/on_remove 触发链 (PetBattleBuffController.cs:119-129 /
// :277-289) 用的就是这一支: **先把第五参 sourcePet 写进效果** (在 Condition 之前, 于是判定落空也留下痕迹),
// 再 Condition ⇒ Apply。CheckAndApply 自己**不**跑 PostProcess (那是 Apply 的事)。
export function checkAndApply(
  effect: Effect,
  invokeUnit: unknown,
  state: BattleState | null,
  checkPhase = true,
  checkTurn = true,
  sourcePet: unknown = null,
): boolean {
  effect.sourcePet = sourcePet
  if (!condition(effect, invokeUnit, state, checkPhase, checkTurn)) return false
  return apply(effect, invokeUnit, state)
}

// Effect.cs:314-338 —— 算子本体按真表**频次**分批搬: 批一 (第六段) 已落
// SetDamage (:1235) / AddStatus (:627) → ops-basic.ts, AddBuff (:737) / RemoveBuff (:865) → ops-buff.ts,
// Powerup (:474) → ops-powerup.ts, Heal (:165) → ops-heal.ts (见 docs/engine/kernel-handoff.md 第六段);
// 批二 落**元算子 SetSkill (:1291) → ops-skill.ts** (观测面有两处);
// 批三 (第七段) 落 Capture (:66) → ops-capture.ts / PetChange (:108) → ops-pet.ts (用户点名反转围栏);
// 批四 (第八段) 落 A 档四支 —— Win (:38) / Escape (:54) / SetWeather (:1969) → ops-state.ts
// 与 BlockOrCopyBuff (:678) → ops-block.ts (配 bond: pet/buff-controller.ts 补的九个方法)。
// 其余 (长尾 set_pet / rage / copy_buff / set_buff / set_player / poker / card) 仍逐个显式抛 ——
// 兜底支 (含 None) 落 DefaultAbility。
// ⚠ oracle 侧的 PortedAbilities 白名单必须与这里的「已搬」集合**逐值同步**: 白名单越界仍然抛
//    MissingMemberException ⇒ 归 infra, 于是「忘了搬」不会假绿。
// ⚠ 例外一 · **Powerup**: TS 搬了, oracle 白名单里却**故意不放 7** —— 上游 `Powerup` 的 IL 直接
//    `call UnityEngine.Random.Range`, 在 dotnet 宿主下**方法入口**就抛 SecurityException (与分支无关),
//    放进来只会把向量洗成"两边同抛"的假绿。⇒ 该算子只有单测锁形状, 没有 effectapply 真值对拍;
//    它的下游 (BattlePet.PowerUp) 由 petmut 的 powerUp 族拍过。细节见 port-map 第六段。
// ⚠ 例外二 · **Win / Escape**: 白名单里**放了 1/2**, 但只许发"问得出答案的形状" —— 两支的**结果面**
//    都过 `Unit.IsMyUnit()` ⇒ `PhotonNetwork.IsConnected` ⇒ Photon 静态构造的 ECall
//    (`ECall methods must be packaged into a system module`, 与 Powerup 同根因) ⇒ 单向闸门,
//    那些形状**根本不生成**。golden 只剩 `state==null ⇒ false` 与 Escape 在 `:60` 的 `atkUnit==null` NRE;
//    结果面由单测用真 `Unit` 锁。细节见 oracle-playbook §6 与该两支的 ops-state.ts 文件头。
function applyAbility(effect: Effect, state: BattleState | null): boolean {
  switch (effect.type) {
    case EffectAbility.Win: return win(effect, state)
    case EffectAbility.Escape: return escape(effect, state)
    case EffectAbility.Capture: return capture(effect, state)
    case EffectAbility.PetChange: return petChange(effect, state)
    case EffectAbility.Heal: return heal(effect, state)
    case EffectAbility.Rage: return rage(effect, state)
    case EffectAbility.Powerup: return powerup(effect, state)
    case EffectAbility.AddStatus: return addStatus(effect, state)
    case EffectAbility.BlockBuff: return blockOrCopyBuff(effect, state)
    case EffectAbility.AddBuff: return addBuff(effect, state)
    case EffectAbility.RemoveBuff: return removeBuff(effect, state)
    case EffectAbility.CopyBuff: return copyBuff(effect, state)
    case EffectAbility.SetBuff: return setBuff(effect, state)
    case EffectAbility.SetDamage: return setDamage(effect, state)
    case EffectAbility.SetSkill: return setSkill(effect, state)
    case EffectAbility.SetPet: return notPorted('算子 SetPet')
    case EffectAbility.SetWeather: return setWeather(effect, state)
    case EffectAbility.SetPlayer: return notPorted('算子 SetPlayer')
    case EffectAbility.Poker: return poker(effect, state)
    case EffectAbility.SetPetBag: return setPetBag(effect, state)
    case EffectAbility.Card: return notPorted('算子 Card')
    default: return defaultAbility(effect, state)
  }
}

// EffectAbilityHandler.cs:13-36 —— 只做「condition 里那些子效果是否成立」的递归判定, 不改状态。
// 未移植算子在这里递归进 condition 仍会抛 (若子效果带那些算子) —— 但对拍向量的子效果只带 none, 可比。
export function defaultAbility(effect: Effect, state: BattleState | null): boolean {
  const condExpr = dictGet(effect.abilityOptionDict, 'condition')
  if (condExpr === null || condExpr === '' || condExpr === 'none')
    return true

  let condEffects: Effect[]
  const tp = Effect.tryParse(condExpr, currentEffectTable())
  if (!tp.ok) {
    // :21-25 —— 不是 (…) 形状 ⇒ 按 '/' 切, 每段解析成技能 id, 展开其 effects。state==null 时 GetRhsUnitById NRE (不生成)。
    const lhsUnit = effect.invokeUnit as Unit
    const rhsUnit = (state as BattleState).getRhsUnitById(lhsUnit.id)!
    const ids = condExpr.split('/').map((x) => toInt(parseEffectOperation(x, effect, lhsUnit, rhsUnit)))
    condEffects = expandSkillEffectIds(ids)
  } else {
    condEffects = tp.effects as Effect[]
  }

  // :29-33 —— Fix timing: 子效果 timing==None 时借父效果的 timing。
  for (const e of condEffects)
    if (e.timing === EffectTiming.None) e.setTiming(effect.timing)

  // :35 —— 递归 Condition (checkPhase/checkTurn 默认 true)。
  return condEffects.some((x) => condition(x, effect.invokeUnit, state, true, true))
}

// ─────────────────────────── Effect.cs:354-389 PostProcess / TryGetPostProcessEffects ───────────────────────────

export function postProcess(effect: Effect, result: boolean, state: BattleState | null): void {
  const postExpr = dictGet(effect.abilityOptionDict, 'on_' + (result ? 'success' : 'fail'))
  const post = tryGetPostProcessEffects(effect, postExpr, state)
  if (!post.ok) return

  const effectHandler = new EffectHandler()
  effectHandler.addEffects(effect.invokeUnit, post.effects)
  effectHandler.checkAndApply(state)
}

// Effect.cs:365-389 —— 空串 ⇒ false; (…) 形状 ⇒ 直接用解析出的效果; 否则按 '/' 切展开成技能引用。
export function tryGetPostProcessEffects(
  effect: Effect,
  postExpr: string | null,
  state: BattleState | null,
): { ok: boolean; effects: Effect[] } {
  let postEffects: Effect[] = []
  if (postExpr === null || postExpr === '')
    return { ok: false, effects: postEffects }

  const tp = Effect.tryParse(postExpr, currentEffectTable())
  if (!tp.ok) {
    let effectIdList: number[] | null
    if (state === null) {
      effectIdList = toIntList(postExpr, '/')
    } else {
      const uid = (effect.invokeUnit as Unit).id
      effectIdList = postExpr.split('/').map((x) =>
        toInt(parseEffectOperation(x, effect, state.getUnitById(uid)!, state.getRhsUnitById(uid)!)))
    }
    // `effectIdList?.Select(...).SelectMany(...)` —— null ⇒ postEffects 赋成 null, 下面 foreach NRE。
    postEffects = effectIdList === null ? (null as unknown as Effect[]) : expandSkillEffectIds(effectIdList)
  } else {
    postEffects = tp.effects as Effect[]
  }

  // :382-386 —— foreach over null ⇒ NRE (上游形状, postEffects 悬空时不兜底)。
  if (postEffects === null)
    nre('TryGetPostProcessEffects 的 postEffects 为 null 后 foreach (Effect.cs:382)')
  for (const e of postEffects)
    if (e.timing === EffectTiming.None) e.setTiming(effect.timing)

  return { ok: true, effects: postEffects }
}

// `Skill.GetSkill(id,false)?.effects?.Select(x=>new Effect(x)).ToList()` 然后 SelectMany ——
// 技能查不到 (含 id 0) ⇒ 内层 null ⇒ SelectMany NRE。移植体在**第一条** null 上抛, 与上游一致。
function expandSkillEffectIds(ids: number[]): Effect[] {
  const out: Effect[] = []
  for (const id of ids) {
    const skill: SkillRecord | null = getSkill(id, false)
    // 直接 throw 而不是 nre(): TS 需要 sees never 返回才能把 skill 收窄成非 null。
    if (skill === null)
      throw new TypeError(`NullReferenceException: SelectMany 的内层序列为 null —— Skill.GetSkill(${id}, false) 查不到 (Effect.cs:376)`)
    for (const e of skill.effects) out.push(e.clone())
  }
  return out
}

// ─────────────────────────── 印记触发链的接缝 ───────────────────────────
// pet/buff-controller.ts 的 OnAddBuff/OnRemoveBuff 要 Effect.CheckAndApply, 而它反过来也 import 本文件里的
// 判定 ⇒ 反向 import 会成环 (模块初始化顺序在 node 的 type-stripping 下尤其脆)。这里单向 import 控制器、
// 把 checkAndApply **注册**进去 (口径同 battle/effect-handler.ts 的 setEffectJudgement): 只要判定层进了图,
// 触发链就是真的; 没进图的场合接缝保持抛。
setBuffEffectTrigger(checkAndApply)
