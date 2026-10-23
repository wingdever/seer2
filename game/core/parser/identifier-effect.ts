// Identifier.cs:190-542 的移植 —— **带 effect 上下文**的那一条标识符链, 也就是战斗里所有
// `ParseEffectOperation` / `target_filter` / condition 表达式真正走的入口。
// S1b 搬的是无上下文版 (parser/identifier.ts: 只有 random/date/player + host.resolve), 它兜底恒 0;
// 战斗侧的操作数 (`me.pet.status.maxHp`、`random[2~3]`、`elementRelation[atk:2][def:0]`、`target.status.maxHp`)
// 全都要吃这条链, 否则 target 解析与 condition 只能拿假 golden 糊 —— 那是禁区。
//
// 移植纪律 (与全仓一致):
//   · **headless**。上游的 `Player.instance.currentBattle` / `Battle.GetBattleIdentifier` 在这里是注入的
//     battle 接缝 (setIdentifierBattle), `UnityEngine.Random` 是注入的 Rng (host), 不出现任何 UnityEngine。
//   · **接缝默认抛, 不静默给 0**。`setPhaseBattle` 同形状: 没注入就说没注入。
//   · 宠表 (petInfoDict) 与 Pet 实例组件 (basic/talent/record/ui/feature/kizuna) 本轮**不接** ——
//     `Pet.GetPetIdentifier` 的臂一律显式 NOT_PORTED, 只有「这个键我不认」的终末 `_ => float.MinValue`
//     是真搬的 (它不读表, 而且正是 `me.pet.name` 这类向量的观测值)。
//
// 四条会咬人的形状 (都在对拍里量过或将被量):
//   1. `isOtherSourceAvailable` 的 C# `&&`/`||` **短路会决定是否削前缀**: useOtherSourceOnlyWhenTarget=false 时
//      `id.TryTrimStart("target.", out id)` **根本不求值** ⇒ `target.x` 原样进后面的链。写成
//      `otherSource !== null && (!use || trim())` 才是同形; 先 trim 再判 use 会多削一次。
//   2. `random` 的括号区间只在**这条链**里做, 而且 `TryTrimParentheses` 的默认括号是 **`[`/`]`** ——
//      真表里就是 `random[2~3]`/`random[3~5]`。无上下文版那条 (`random`/`random[old]`/`random[new]`) 在下面
//      GetBattleIdentifier 的 :286 支之后才轮到, 两支的入参形状不同 (`id` 已被上面削过或没削)。
//   3. `GetBattleIdentifier` 的 `random` 支**只在 trimId 为 '' 或 '[new]' 时 return**, 其余 (`random[old]`、
//      `random[2~3]` 走到这儿的情形) 一律**穿透**到末尾的 `GetIdentifier(id)` —— 注意传的是 `id`, 不是 trimId。
//   4. `Pet.GetPetIdentifier` 的 `status`/`powerup` 两支用 `StartsWith` 而非 TryTrimStart, 所以裸 `status`
//      也会进 GetPetStatusIdentifier (那里再 TryTrimStart("status.") 失败 ⇒ 兜到 GetNumIdentifier(**原串**))。

import type { Effect } from '../effect/effect.ts'
import { isEmpty, listGet } from '../collections.ts'
import { toInt } from '../mathf.ts'
import { trimParentheses, trimParenthesesLoop, trimStartStr, tryTrimParentheses, tryTrimStart, toIntRange, tryParseInt, concatToString } from '../strutil.ts'
import { condition, splitCondition } from './operator.ts'
import { parseConditionFilter, parseOperation } from './parser.ts'
import { getIdentifier, getNumIdentifier, type IdentifierHost } from './identifier.ts'
import { Buff, powerBuffIds, powerdownBuffIds, powerupBuffIds } from '../buff/buff.ts'
import { getBuffInfo } from '../buff/buff-info.ts'
import { toBuffType, BuffType } from '../buff/buff-database.ts'
import { getElementGroup, getElementRelationSub, type ElementGroups } from '../pet/element.ts'
import { linqMax, linqMin, linqSum } from '../pet/status.ts'
import type { StatusController } from '../pet/status-controller.ts'
import { unitBuffController } from '../pet/buff-controller.ts'
import type { UnitSkillSystem } from '../battle/unit-skill-system.ts'
// `skillGetIdentifier` 是 **Skill.cs 的实例版** (上游写 `x.GetSkillIdentifier(id)`);
// 本文件自己那个 getSkillIdentifier 是 Identifier.cs:425 收 skillSystem 的静态重载 —— 同名不同物, 起了别名才不撞。
import { tryGetSkillIdentifier, getSkillIdentifier as skillGetIdentifier, type BattlePetView, type PetBuffControllerView, type SkillRecord } from '../battle/views.ts'
import type { Unit, UnitPetSystem, BattleState } from '../battle/state.ts'

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— "这个键我不认"的哨兵

const nre = (where: string): never => { throw new TypeError(`NullReferenceException: ${where}`) }
const notPorted = (what: string): never => { throw new Error(`NOT_PORTED: ${what} —— 见 docs/engine/port-map.md 计划第五段`) }

// ── 两处注入 ────────────────────────────────────────────────────────────
// host 喂的是 GetNumIdentifier 的 random/存档面 (链的终点); battle 喂的是 GetBattleIdentifier 的
// `state.` 支 (上游 Player.instance.currentBattle.currentState)。
// 默认全抛: 「没接」必须比对拍可见, 静默给 0 会把接缝缺失伪装成「这条标识符就是 0」。
let HOST: IdentifierHost = {
  rng: {
    next01: () => notPorted('Identifier.GetNumIdentifier 的 random 需要注入 Rng'),
    nextInt: () => notPorted('Identifier.GetNumIdentifier 的 random 需要注入 Rng'),
    nextFloat: () => notPorted('Identifier.GetNumIdentifier 的 random 需要注入 Rng'),
    pick: () => notPorted('Identifier.GetNumIdentifier 的 random 需要注入 Rng'),
    seed: () => notPorted('Identifier.GetNumIdentifier 的 random 需要注入 Rng'),
  },
  // 下面三支读的是**宿主/存档**侧: 上游分别是 Player.instance.random、Player.instance.random 的写入、
  // Player.instance.gameData。名字只出现在注释里 —— 无头门禁 (docs/engine/oracle-playbook.md「门禁」) 连字符串
  // 一起 grep, 所以抛出消息里用「存档侧」描述, 精确的上游出处看这里。
  getPlayerRandom: () => notPorted('random[old] 要读存档侧的 player random'),
  setPlayerRandom: () => notPorted('random[new] 要写存档侧的 player random'),
  getDate: () => notPorted('date. 要 DateTime.Now'),
  getPlayerData: () => notPorted('player. 要读存档侧的 gameData'),
}
export const setEffectIdentHost = (host: IdentifierHost): void => { HOST = host }

// effect-judge 的 RandomNumber 读 `Player.instance.random` (EffectConditionHandler.cs:92) —— 与这条标识符
// 链共用同一个存档侧接缝。effectIdentHost() 把当前 host 暴露给判定层 (只读), setEffectIdentPlayerRandom
// 让 harness 把存档侧 random 换成**可变 cell** (读的是 cell、写也进 cell), 与 oracle 的 JudgeWorld 注入 PhasePlayer.random 同形。
export const effectIdentHost = (): IdentifierHost => HOST
export const getPlayerRandom = (): number => HOST.getPlayerRandom()
export const setEffectIdentPlayerRandom = (get: () => number, set: (v: number) => void): void => {
  HOST = { ...HOST, getPlayerRandom: get, setPlayerRandom: set }
}

/** Battle.cs:13/394 —— `battle.currentState` 与 `battle.GetBattleIdentifier(id) = currentState.GetStateIdentifier(id)`。 */
export interface EffectIdentBattle { readonly currentState: BattleState | null }
let BATTLE: (() => EffectIdentBattle) | null = null
export const setIdentifierBattle = (get: (() => EffectIdentBattle) | null): void => { BATTLE = get }
const currentBattle = (): EffectIdentBattle => {
  if (BATTLE === null) throw new Error('NOT_PORTED: Identifier 的 battle 接缝未注入 (上游是宿主存档里的 currentBattle) —— 计划第五段')
  return BATTLE()
}

const numId = (id: string): number => getNumIdentifier(id, HOST)

/**
 * Parser.cs:85-104 ParseEffectOperation —— 与无上下文版 ParseOperation **逐行同构**,
 * 唯一差别是每个操作数走带 effect 的 GetIdentifier。所以这里只做一件事: 把 resolve 换成它。
 * (负号前置、按 Operator.opDict 的键集切分、`expr.IndexOf(id[i], opStartIdx)` 的下标定位、
 *  以及末尾的 `sign * value` 都在 parseOperation 里, 已在 S1b 的 `parse` kind 拍过。)
 */
export function parseEffectOperation(
  expr: string,
  effect: Effect,
  lhsUnit: Unit,
  rhsUnit: Unit,
  otherSource: unknown = null,
  useOtherSourceOnlyWhenTarget = true,
): number {
  return parseOperation(expr, (id) => getIdentifierInEffectContext(id, effect, lhsUnit, rhsUnit, otherSource, useOtherSourceOnlyWhenTarget))
}

// ───────────────────────────────────── Identifier.cs:190-226 GetIdentifier (effect 版)

/**
 * 上游 `object idSource switch` 的结构判别。C# 靠运行时类型 (BattlePet 先于 Pet), 移植体里
 * BattlePet/Skill 都是**接口** (views.ts), 没有类可 instanceof, 所以按成员形状分派:
 *   · `instanceof Buff` —— Buff 是真 class, 与上游同形;
 *   · 三个 controller 齐备 ⇒ BattlePet (`Pet` 只有 normalStatus/组件, 没有这三样);
 *   · options(Map)+effects(Array) ⇒ Skill。
 * **普通 Pet 在 core/ 里没有模型**, 所以它落 `other` 支 (上游那条臂在移植体里暂无居民, 已在此登记)。
 */
export type IdSourceKind = 'battlePet' | 'buff' | 'skill' | 'other'
export function classifyIdSource(src: unknown): IdSourceKind {
  if (src === null || src === undefined) return 'other'
  if (src instanceof Buff) return 'buff'
  if (typeof src === 'object') {
    const o = src as Record<string, unknown>
    if ('statusController' in o && 'buffController' in o && 'skillController' in o) return 'battlePet'
    if (o.options instanceof Map && Array.isArray(o.effects)) return 'skill'
  }
  return 'other'
}

export function getIdentifierInEffectContext(
  rawId: string,
  effect: Effect,
  lhsUnit: Unit,
  rhsUnit: Unit,
  otherSource: unknown = null,
  useOtherSourceOnlyWhenTarget = true,
): number {
  let id = rawId.replaceAll('－', '-')
  let num = 0

  // :196 —— 短路顺序就是语义 (见文件头 1)。otherSource 为 null 时**绝不**削 target. 前缀。
  let isOtherSourceAvailable = false
  if (otherSource !== null && otherSource !== undefined) {
    if (!useOtherSourceOnlyWhenTarget) {
      isOtherSourceAvailable = true
    } else {
      const t = tryTrimStart(id, 'target.')
      if (t.ok) { id = t.trim; isOtherSourceAvailable = true }
    }
  }
  const idSource = isOtherSourceAvailable ? otherSource : effect.source

  // :199-200 —— `random[...]` 区间。ToIntRange 的 parseFunc 结果要 **(int) 截断**; 取哪一项是 native Random,
  // 不可比 ⇒ 归 native不可比 (口径与 parser/identifier.ts:39 的同一个 ListHelper.Random() 一致)。
  const rnd = tryTrimStart(id, 'random')
  if (rnd.ok) {
    const p = tryTrimParentheses(rnd.trim)
    if (p.ok) {
      const list = toIntRange(p.trim, (x) => toInt(parseEffectOperation(x, effect, lhsUnit, rhsUnit, otherSource, useOtherSourceOnlyWhenTarget)))
      // values.Random() = Range(0, Count) 后 values.Get(index) —— 空表时 index 0 越界给 default(int)=0。
      return listGet(list, Math.floor(HOST.rng.next01() * list.length), 0) ?? 0
    }
  }

  // :202-215 —— 至少两组才成立; 键缺省 ⇒ Dictionary.Get 给 default(int)=0 (atk/def/def.sub)。
  const er = tryTrimStart(id, 'elementRelation')
  if (er.ok) {
    const elements = trimParenthesesLoop(er.trim)
    if (!isEmpty(elements) && (elements as string[]).length >= 2) {
      const dict = new Map<string, number>()
      for (const e of elements as string[]) {
        const split = e.split(':')
        dict.set(split[0], toInt(parseEffectOperation(split[1], effect, lhsUnit, rhsUnit, otherSource, useOtherSourceOnlyWhenTarget)))
      }
      return getElementRelationSub(dict.get('atk') ?? 0, dict.get('def') ?? 0, dict.get('def.sub') ?? 0)
    }
    // 不足两组 ⇒ **不 return**, 继续往下走 idSource 分派 (上游就是这个穿透)。
  }

  switch (classifyIdSource(idSource)) {
    case 'battlePet': {
      const battlePet = idSource as BattlePetView
      // :219-220 —— 两条路差一个 TryGet: 拿 otherSource 时**强制**走 Identifier 版 (它会再落到 base),
      // 拿 effect.source 时先问 BattlePet 自己的 override。
      if (isOtherSourceAvailable) return getPetIdentifier(id, lhsUnit.petSystem, battlePet)
      const r = tryGetBattlePetIdentifier(battlePet, id)
      return r.ok ? r.num : getBattleIdentifier(id, effect, lhsUnit, rhsUnit)
    }
    case 'buff': {
      const buff = idSource as Buff
      const r = buff.tryGetBuffIdentifier(id)
      return r.ok ? r.num : getBattleIdentifier(id, effect, lhsUnit, rhsUnit)
    }
    case 'skill': {
      const skill = idSource as SkillRecord
      const r = tryGetSkillIdentifier(skill, id)
      return r.ok ? r.num : getBattleIdentifier(id, effect, lhsUnit, rhsUnit)
    }
    default:
      return getBattleIdentifier(id, effect, lhsUnit, rhsUnit)
  }
}

// ───────────────────────────────────── Identifier.cs:228-296 GetBattleIdentifier

export function getBattleIdentifier(id: string, effect: Effect | null, lhsUnit: Unit, rhsUnit: Unit): number {
  let trimId = id

  const st = tryTrimStart(id, 'state.')
  if (st.ok) {
    trimId = st.trim
    const battle = currentBattle()
    let state: BattleState | null = battle.currentState
    // :237-245 —— last. 换到上一帧快照; null ⇒ 直接 0 (不是 MinValue)。两个 unit 都按 id 重新取,
    // 取不到就是 null ⇒ 后面 IsGoFirst(null) 的抛点由上游决定 (移植体同样把 null 传下去)。
    const last = tryTrimStart(trimId, 'last.')
    if (last.ok) {
      trimId = last.trim
      state = state === null ? nre('battle.currentState 为 null 时读 lastTurnState —— Identifier.cs:239') : state.lastTurnState
      if (state === null) return 0
      lhsUnit = state.getUnitById(lhsUnit.id) as Unit
      rhsUnit = state.getUnitById(rhsUnit.id) as Unit
    }

    const me = tryTrimStart(trimId, 'me.')
    if (me.ok) {
      trimId = me.trim
      if (trimId === 'order') return isEmpty(state === null ? nre('state.actionOrder (state 为 null)') : state!.actionOrder)
        ? 0 : (state!.isGoFirst(lhsUnit) ? 1 : 2)
      return getBattleIdentifier('me.' + trimId, effect, lhsUnit, rhsUnit)
    }

    const op = tryTrimStart(trimId, 'op.')
    if (op.ok) {
      trimId = op.trim
      if (trimId === 'order') return isEmpty(state === null ? nre('state.actionOrder (state 为 null)') : state!.actionOrder)
        ? 0 : (state!.isGoFirst(rhsUnit) ? 1 : 2)
      return getBattleIdentifier('op.' + trimId, effect, lhsUnit, rhsUnit)
    }

    // :265 —— 这一行读的是 **battle.GetBattleIdentifier(trimId)**, 也就是 `battle.currentState`,
    // **不是**上面 last. 换过的那个局部 state —— 上游的换帧只影响 me./op. 两支 (actionOrder 与
    // 递归时传下去的两个 unit), 末端兜底照样打在当前帧。实测: `state.last.turn` 返回当前 turn。
    // (局部 state 在这里唯一的作用是上面那两处 null 短路; 兜底仍然要重取一次。)
    const cur = battle.currentState
    return (cur === null ? nre('battle.currentState 为 null 时 battle.GetBattleIdentifier') : cur).getStateIdentifier(trimId)
  }

  const me = tryTrimStart(id, 'me.')
  if (me.ok) {
    trimId = me.trim
    // :269-275 —— 三个硬编码整串先判 (它们的键里带方括号, 走不进后面的通用链)。
    // 上游是 `PetElementSystem.GetElementRelation(int elementId, BattlePet rhs)`, 那个重载展开就是
    // `(elementId, rhs.battleElement, rhs.subBattleElement)` —— 第二/三参读的是**防御方**的两个属性。
    if (trimId === 'pet.defElementRelation[op.pet.element]')
      return getElementRelationSub(rhsUnit.pet!.battleElement, lhsUnit.pet!.battleElement, lhsUnit.pet!.subBattleElement)
    if (trimId === 'pet.defElementRelation[op.pet.subElement]')
      return getElementRelationSub(rhsUnit.pet!.subBattleElement, lhsUnit.pet!.battleElement, lhsUnit.pet!.subBattleElement)
    if (trimId === 'pet.normalSkill[me.skill.id].position')
      return getUnitIdentifier(`pet.normalSkill[${lhsUnit.skill?.id ?? 0}].position`, lhsUnit, (effect?.sourcePet as BattlePetView) ?? null)
    return getUnitIdentifier(trimId, lhsUnit, (effect?.sourcePet as BattlePetView) ?? null)
  }

  const op = tryTrimStart(id, 'op.')
  if (op.ok) {
    trimId = op.trim
    if (trimId === 'pet.defElementRelation[me.pet.element]')
      return getElementRelationSub(lhsUnit.pet!.battleElement, rhsUnit.pet!.battleElement, rhsUnit.pet!.subBattleElement)
    if (trimId === 'pet.defElementRelation[me.pet.subElement]')
      return getElementRelationSub(lhsUnit.pet!.subBattleElement, rhsUnit.pet!.battleElement, rhsUnit.pet!.subBattleElement)
    // :282 —— op 支的 normalSkill **不传 otherSource** (me 支传 effect?.sourcePet)。上游就不对称。
    if (trimId === 'pet.normalSkill[op.skill.id].position')
      return getUnitIdentifier(`pet.normalSkill[${rhsUnit.skill?.id ?? 0}].position`, rhsUnit)
    return getUnitIdentifier(trimId, rhsUnit)
  }

  // :286-293 —— 只认 '' 与 '[new]', 其余**穿透**到 GetIdentifier(原 id)。
  const rnd = tryTrimStart(id, 'random')
  if (rnd.ok) {
    if (rnd.trim === '') return lhsUnit.random
    if (rnd.trim === '[new]') return lhsUnit.roll()
  }

  return getIdentifier(id, HOST)
}

// ───────────────────────────────────── Identifier.cs:298-314 GetUnitIdentifier

export function getUnitIdentifier(id: string, unit: Unit, otherSource: BattlePetView | null = null): number {
  const t = tryTrimStart(id, 'pet.')
  if (t.ok) return getPetIdentifier(t.trim, unit.petSystem, otherSource)

  const sk = tryTrimStart(id, 'skill.')
  if (sk.ok) return getSkillIdentifier(sk.trim, unit.skillSystem!)

  const cd = tryTrimStart(id, 'card.')
  if (cd.ok) return getCardIdentifier(cd.trim)

  // :310 —— 前缀是 "buff" 而不是 "buff.", 所以 `buff[1].own` 与 `buffturn` 都进这里。
  // Unit.buffController (Unit.cs:31) 每次访问**新建**一个 (Element.全部 + unitBuffs 原引用)。
  const bf = tryTrimStart(id, 'buff')
  if (bf.ok) return getBuffIdentifier(bf.trim, unitBuffController(unit))

  return numId(id)
}

/** Unit.cs:38-49 cardSystem 整块是围栏 (S7); 只有 `card.` 前缀真的出现才会走到这里。 */
export function getCardIdentifier(_id: string): number {
  return notPorted('Identifier.GetCardIdentifier —— UnitCardSystem 未移植 (docs/engine/port-map.md 围栏表)')
}

// ───────────────────────────────────── Identifier.cs:316-400 GetPetIdentifier (静态版)

export function getPetIdentifier(id: string, petSystem: UnitPetSystem, otherSource: BattlePetView | null = null): number {
  const sys = petSystem.tryGetPetSystemIdentifier(id)
  if (sys.ok) return sys.num

  const pet = otherSource ?? petSystem.pet

  const bag = tryTrimStart(id, 'bag')
  if (bag.ok) {
    let trimId = bag.trim
    let candidates = petSystem.petBag.filter((x) => x !== null) as BattlePetView[]
    // :328-342 —— 逐段 (k:v) 过滤。两处与 ParseConditionFilter **不同**: 这里 Split(':') 不限段数,
    // 也不做全角 '：' 归一; 且左右两侧都递归 GetPetIdentifier(…, x) (所以 `bag(idNOT10012)` 的
    // 右值会被当标识符再解析一次)。
    for (;;) {
      const p = tryTrimParentheses(trimId, '(', ')')
      if (!p.ok) break
      const trimExpr = p.trim
      let op = '='
      let options = trimExpr.split(':')
      if (options.length !== 2) {
        const sp = splitCondition(trimExpr)
        options = [sp.key, sp.value]
        op = sp.op
      }
      const l = options[0], r = options[1]
      candidates = candidates.filter((x) => condition(op, getPetIdentifier(l, petSystem, x), getPetIdentifier(r, petSystem, x)))
      trimId = trimStartStr(trimId, '(' + trimExpr + ')')
    }

    trimId = trimStartStr(trimId, '.')
    const count = candidates.length
    if (trimId === 'count') return count
    if (count <= 0) return FLOAT_MIN_VALUE

    const func = trimId.split('.')[0]
    const funcId = trimId.startsWith(func + '.') ? trimId.slice(func.length + 1) : trimId
    const xs = () => candidates.map((x) => getPetIdentifier(funcId, petSystem, x))
    switch (func) {
      case 'sum': return linqSum(xs())
      case 'max': return linqMax(xs())
      case 'min': return linqMin(xs())
      default: return getPetIdentifier(trimId, petSystem, candidates[0])
    }
  }

  // :365-370 —— 方括号里必须是 **int** (int.TryParse), 否则整支不成立往下穿透。
  const der = tryTrimStart(id, 'defElementRelation')
  if (der.ok) {
    const p = tryTrimParentheses(der.trim)
    if (p.ok) {
      const elementId = tryParseInt(p.trim)
      if (elementId !== null) {
        if (pet === null) nre('PetElementSystem.GetElementRelation(elementId, null pet) —— Identifier.cs:368')
        return getElementRelationSub(elementId, pet.battleElement, pet.subBattleElement)
      }
    }
  }

  if (id === 'position') return petSystem.petBag.indexOf(pet as BattlePetView)

  if (id.startsWith('status') || id.startsWith('powerup'))
    return getPetStatusIdentifier(id, (pet === null ? nre('pet.statusController (pet 为 null)') : pet).statusController)

  const bf = tryTrimStart(id, 'buff')
  if (bf.ok) return getBuffIdentifier(bf.trim, pet === null ? nre('pet.buffController (pet 为 null)') : pet.buffController)

  if (tryTrimStart(id, 'personality.').ok) return notPorted('Identifier.GetPetIdentifier 的 personality. 臂要 pet.basic.personality (宠表批次)')
  if (tryTrimStart(id, 'ev.').ok) return notPorted('Identifier.GetPetIdentifier 的 ev. 臂要 pet.talent.ev (宠表批次)')

  const tk = tryTrimStart(id, 'token.')
  if (tk.ok) {
    // :392 —— ListHelper.Get 越界给 null ⇒ 0。
    const token = listGet(petSystem.tokenPetBag, petSystem.petBag.indexOf(pet as BattlePetView), null)
    if (token === null) return 0
    return getPetIdentifier(tk.trim, petSystem, token)
  }

  const r = tryGetBattlePetIdentifier(pet === null ? nre('pet.TryGetPetIdentifier (pet 为 null)') : pet, id)
  return r.ok ? r.num : numId(id)
}

// ───────────────────────────────────── Identifier.cs:402-423 GetPetStatusIdentifier

export function getPetStatusIdentifier(id: string, statusController: StatusController): number {
  const st = tryTrimStart(id, 'status.')
  if (st.ok) {
    const trimId = st.trim
    switch (trimId) {
      case 'maxHp': return statusController.maxHp
      case 'lostHp': return statusController.maxHp - statusController.battleStatus.get('hp')
      case 'anger': return statusController.anger
      case 'minAnger': return statusController.minAnger
      case 'maxAnger': return statusController.maxAnger
      case 'lostAnger': return statusController.maxAnger - statusController.anger
      default: return statusController.getStatusIdentifier(trimId)
    }
  }

  const pu = tryTrimStart(id, 'powerup.')
  if (pu.ok) return statusController.powerup.get(pu.trim)

  // :422 —— 兜底吃的是**原 id** (上游整条链都这样, 别顺手改成 trimId)。
  return numId(id)
}

// ───────────────────────────────────── Identifier.cs:425-433 GetSkillIdentifier (skillSystem 版)

export function getSkillIdentifier(id: string, skillSystem: UnitSkillSystem, key: string | null = null): number {
  const sys = skillSystem.tryGetSkillSystemIdentifier(id)
  if (sys.ok) return sys.num

  const skill = skillSystem.getSkillByKey(key)
  // :432 —— GetSkillByKey 可以是 null (Unit.skillSystem 里没选技), 上游在 .TryGetSkillIdentifier 上 NRE。
  if (skill === null) nre('Skill.TryGetSkillIdentifier (skillSystem.GetSkillByKey 返回 null) —— Identifier.cs:432')
  const r = tryGetSkillIdentifier(skill, id)
  return r.ok ? r.num : numId(id)
}

// ───────────────────────────────────── Identifier.cs:435-542 GetBuffIdentifier

export function getBuffIdentifier(rawId: string, buffController: PetBuffControllerView): number {
  let id = rawId
  let buffs: Buff[] = buffController.buffs
  let buff: Buff | null = null
  let testBuff: Buff | null = null

  if (id === '.count') return buffs.length

  if (id.startsWith('[')) {
    const buffIdExpr = trimParentheses(id)
    id = trimStartStr(id, '[' + buffIdExpr + '].')

    const buffId = tryParseInt(buffIdExpr)
    if (buffId === null) {
      // :454-494 —— 解析失败就当 BuffType 名 (查不到 ⇒ BuffType.None, 不抛)。
      const buffType = toBuffType(buffIdExpr)
      if (buffType === BuffType.Powerup) {
        switch (id) {
          case 'count': return buffs.filter((x) => x.isPowerUp()).length
          case 'own': return buffs.some((x) => x.isPowerUp()) ? 1 : 0
          case 'block': return powerupBuffIds().every((x) => buffController.isBuffIdBlocked(x)) ? 1 : 0
          case 'copy': return powerupBuffIds().every((x) => buffController.isBuffIdCopied(x)) ? 1 : 0
          default: return 0
        }
      }
      if (buffType === BuffType.Powerdown) {
        switch (id) {
          case 'count': return buffs.filter((x) => x.isPowerDown()).length
          case 'own': return buffs.some((x) => x.isPowerDown()) ? 1 : 0
          case 'block': return powerdownBuffIds().every((x) => buffController.isBuffIdBlocked(x)) ? 1 : 0
          case 'copy': return powerdownBuffIds().every((x) => buffController.isBuffIdCopied(x)) ? 1 : 0
          default: return 0
        }
      }
      if (buffType === BuffType.Power) {
        switch (id) {
          case 'count': return buffs.filter((x) => x.isPower()).length
          case 'own': return buffs.some((x) => x.isPower()) ? 1 : 0
          case 'block': return powerBuffIds().every((x) => buffController.isBuffIdBlocked(x)) ? 1 : 0
          case 'copy': return powerBuffIds().every((x) => buffController.isBuffIdCopied(x)) ? 1 : 0
          default: return 0
        }
      }
      switch (id) {
        case 'count': return buffs.filter((x) => x.isType(buffType)).length
        case 'own': return buffs.some((x) => x.isType(buffType)) ? 1 : 0
        case 'block': return buffController.isBuffTypeBlocked(buffType) ? 1 : 0
        case 'copy': return buffController.isBuffTypeCopied(buffType) ? 1 : 0
        // :492 —— 泛型类型的 "id" 走 GetRangeBuff().FirstOrDefault() ?? 0。
        case 'id': return listGet(buffController.getRangeBuff((x) => x.isType(buffType)), 0, null)?.id ?? 0
        default: return 0
      }
    }

    buff = buffs.find((x) => x.id === buffId) ?? null
    // :499 —— testBuff 只在**表里真有这个 id** 时才存在 (GetBuffInfo(0) 恒 null, 所以 buff[0].block 靠
    // IsBuffBlocked(null)=false 走通, 而构造期的元素块 id 恰恰是 0 —— 见 pet/buff-controller.ts 文件头)。
    testBuff = getBuffInfo(buffId) === null ? null : new Buff(buffId)

    switch (id) {
      case 'count': return buffs.filter((x) => x.id === buffId).length
      case 'own': return buffs.some((x) => x.id === buffId) ? 1 : 0
      case 'block': return buffController.isBuffBlocked(testBuff) ? 1 : 0
      case 'copy': return buffController.isBuffCopied(testBuff) ? 1 : 0
      default: {
        if (buff === null) return numId(id)
        const r = buff.tryGetBuffIdentifier(id)
        return r.ok ? r.num : numId(id)
      }
    }
  }

  if (id.startsWith('(')) {
    const filter = parseConditionFilter<Buff>(id, (x, b) => x.map((expr) => {
      const r = b.tryGetBuffIdentifier(expr)
      return r.ok ? r.num : numId(expr)
    }))
    buffs = buffs.filter(filter)
    buff = buffs.length ? buffs[0] : null
    const buffId = buff?.id ?? 0
    testBuff = getBuffInfo(buffId) === null ? null : new Buff(buffId)

    const loop = trimParenthesesLoop(id, '(', ')')
    // :519-520 —— `"(" + null + ")"` 在 C# 插值里是 `"()"`; filterList 为 null 时这条 TrimStart 基本不命中。
    const subStr = loop === null ? null : concatToString(loop, ')(')
    id = trimStartStr(trimStartStr(id, '(' + (subStr ?? '') + ')'), '.')

    const split = id.split('.')
    if (split.length <= 1) {
      switch (split[0]) {
        case 'count': return buffs.length
        case 'own': return buffs.length > 0 ? 1 : 0
        default: {
          if (buff === null) return numId(split[0])
          const r = buff.tryGetBuffIdentifier(split[0])
          return r.ok ? r.num : numId(split[0])
        }
      }
    }

    const xs = () => buffs.map((x) => x.getBuffIdentifier(split[0]))
    switch (split[1]) {
      case 'sum': return linqSum(xs())
      case 'max': return linqMax(xs())
      case 'min': return linqMin(xs())
      default: {
        if (buff === null) return numId(id)
        const r = buff.tryGetBuffIdentifier(id)
        return r.ok ? r.num : numId(id)
      }
    }
  }

  return numId(id)
}

// ───────────────────────────────────── BattlePet.cs:187-291 override 链 + Pet.cs 基类 (围栏)

/**
 * BattlePet.GetPetIdentifier —— 六个前置臂 + 七个平键, 其余落到 base (Pet.GetPetIdentifier)。
 * 两处必须照抄的形状:
 *   · `skill` 臂把 `skill[N]` **改写**成 `(id:N).x` 再走过滤器, 且 `"(" + filterList + ")"` 里的 null
 *     在 C# 插值中是空串 ⇒ `"()"`;
 *   · `normalSkill[N]` 读的是 `IsNullOrEmpty(loopSkills) ? normalSkills : loopSkills` —— **环击表优先**。
 */
export function getBattlePetIdentifier(pet: BattlePetView, id: string): number {
  const el = tryTrimStart(id, 'element.')
  if (el.ok) {
    const g = tryTrimStart(el.trim, 'group')
    if (g.ok) return elementGroupAll(getElementGroupForTest(pet.buffController.element), g.trim)
  }
  const sel = tryTrimStart(id, 'subElement.')
  if (sel.ok) {
    const g = tryTrimStart(sel.trim, 'group')
    if (g.ok) return elementGroupAll(getElementGroupForTest(pet.buffController.subElement), g.trim)
  }

  const sk = tryTrimStart(id, 'skill')
  if (sk.ok) {
    let trimSkill = sk.trim
    const p = tryTrimParentheses(trimSkill)
    if (p.ok) {
      const skillIdExpr = p.trim
      const skillId = tryParseInt(skillIdExpr)
      if (skillId !== null) {
        trimSkill = trimStartStr(trimStartStr(trimSkill, '[' + skillIdExpr + ']'), '.')
        trimSkill = trimSkill === '' ? 'id' : trimSkill
        // 插值里用的是**解析后的 int** (不是原串) —— `skill[ 5 ]` 重写出来是 `(id:5).…`。
        trimSkill = `(id:${skillId}).${trimSkill}`
      }
    }

    const filterList = trimParenthesesLoop(trimSkill, '(', ')')
    const filter = parseConditionFilter<SkillRecord | null>(trimSkill, (exprs, s) => exprs.map((expr) => {
      if (s === null) return numId(expr)
      const r = tryGetSkillIdentifier(s, expr)
      return r.ok ? r.num : numId(expr)
    }))
    const allSkills = pet.skillController.allSkills.filter((x) => x !== null) as SkillRecord[]
    const okSkills = allSkills.filter(filter)

    trimSkill = trimStartStr(trimSkill, '(' + (filterList === null ? '' : concatToString(filterList, ')(')) + ')')
    trimSkill = trimStartStr(trimSkill, '.')
    const split = trimSkill.split('.')

    const first = (): SkillRecord | null => (okSkills.length ? okSkills[0] : null)
    const ident = (s: SkillRecord | null, key: string): number => (s === null ? FLOAT_MIN_VALUE : skillGetIdentifier(s, key))
    if (split.length <= 1) {
      if (split[0] === 'count') return okSkills.length
      return ident(first(), split[0])
    }
    const xs = () => okSkills.map((x) => skillGetIdentifier(x, split[0]))
    switch (split[1]) {
      case 'sum': return linqSum(xs())
      case 'max': return linqMax(xs())
      case 'min': return linqMin(xs())
      default: return ident(first(), split[0])
    }
  }

  const ns = tryTrimStart(id, 'normalSkill')
  if (ns.ok) {
    const p = tryTrimParentheses(ns.trim)
    if (p.ok) {
      const skillIndexExpr = p.trim
      const skillIndex = tryParseInt(skillIndexExpr)
      if (skillIndex !== null) {
        let trimId = trimStartStr(trimStartStr(ns.trim, '[' + skillIndexExpr + ']'), '.')
        if (trimId === '') trimId = 'id'

        const ctrl = pet.skillController
        // IsNullOrEmpty(List) 在 ListHelper 里判的是 null 或 0 条 ⇒ loopSkills 空表也回落 normalSkills。
        const allSkills: (SkillRecord | null)[] | null = isEmpty(ctrl.loopSkills) ? ctrl.normalSkills : ctrl.loopSkills
        if (trimId === 'position') {
          if (allSkills === null) nre('List.FindIndex on null (BattlePet.cs:260)')
          return allSkills.findIndex((x) => x !== null && x.id === skillIndex)
        }
        // `allSkills?.Get(skillIndex)?.GetSkillIdentifier(trimId) ?? 0` —— 空表、越界、洞 一律 0, 不抛。
        const skill = allSkills === null ? null : listGet(allSkills, skillIndex, null)
        if (skill === null) return 0
        return skillGetIdentifier(skill, trimId)
      }
    }
  }

  const ss = tryTrimStart(id, 'superSkill')
  if (ss.ok) {
    let trimId = trimStartStr(ss.trim, '.')
    if (trimId === '') trimId = 'id'
    const superSkill = pet.skillController.superSkill
    return superSkill === null ? 0 : skillGetIdentifier(superSkill, trimId)
  }

  switch (id) {
    case 'stayTurn': return pet.stayTurn
    case 'chain': return pet.chain
    case 'element': return toInt(pet.buffController.element)
    case 'subElement': return toInt(pet.buffController.subElement)
    case 'movable': return pet.isMovable ? 1 : 0
    case 'dead': return pet.isDead ? 1 : 0
    case 'token': return pet.isToken ? 1 : 0
    default: return getPetIdentifierBase(id)
  }
}

export function tryGetBattlePetIdentifier(pet: BattlePetView, id: string): { ok: boolean; num: number } {
  const num = getBattlePetIdentifier(pet, id)
  return { ok: num !== FLOAT_MIN_VALUE, num }
}

// BattlePet.cs:193-195/203-205 —— TrimParenthesesLoop 用的是**默认方括号**, 且 null ⇒ 上游 .Select NRE。
// 分组表在没有玩家导入的元素表时恒为「自己」(pet/element.ts:96-103 已量), 所以这里沿用注入入口。
function elementGroupAll(group: number[], expr: string): number {
  const loop = trimParenthesesLoop(expr)
  if (loop === null) nre('TrimParenthesesLoop() 给 null 后 .Select —— BattlePet.cs:194')
  return loop.every((x) => group.includes(toInt(numId(x)))) ? 1 : 0
}

// 分组字典是**注入**的 (发行数据里没有那份文件, 见 pet/element.ts 注释); 这里给一个可换入口,
// 与 getElementGroup 同语义。core/ 不读盘 ⇒ 默认「自己」。
let ELEMENT_GROUPS: ElementGroups | null = null
export const setElementGroups = (g: ElementGroups | null): void => { ELEMENT_GROUPS = g }
const getElementGroupForTest = (element: number): number[] => getElementGroup(element, ELEMENT_GROUPS)

/**
 * Pet.cs:253-437 的基类链 —— 本轮**只搬终末的 `_ => float.MinValue`** (它不读表, 而且是
 * `me.pet.name` 这类向量的真实观测值)。
 * 围栏的**进入条件必须与上游的守卫同形**: 上游每支臂都是 `TryTrimStart(前缀) && TryTrimParentheses && int.TryParse`
 * 这一串**合取**, 守卫不成立时**不算进臂**, 会继续往下试直到 flat switch 的 `_ => float.MinValue`。
 * 若只按前缀就抛, `normalSkill[me.skill.id].power` 这种"括号里不是 int"的形状会抛在围栏里,
 * 而上游给的是 0 —— 那是围栏过宽造成的假不一致 (实测咬到过)。
 * 两条上游自身的 bug 也一并登记在围栏里: `superSkill` 支读的是上一条的 trimNormalSkill,
 * `gender` 支读的是 trimSkin —— 接宠表那批时要在**这里**照抄, 不是"顺手修好"。
 */
export function getPetIdentifierBase(id: string): number {
  // 纯前缀守卫 (进臂即读组件/表) —— 这三条没有额外的括号条件, 前缀命中就是上游真的会算的一支。
  for (const prefix of ['backup', 'status.', 'ev.', 'superSkill', 'kizuna', 'gender', 'own'])
    if (id.startsWith(prefix)) return notPorted(`Pet.GetPetIdentifier 的 "${prefix}" 臂要宠表/实例组件 (docs/engine/port-map.md 宠表批次)`)

  // 合取守卫的三支: 括号 + int 才算进 (`Pet.cs:286/309/353/361/369`)。
  const intParen = (prefix: string): boolean => {
    const t = tryTrimStart(id, prefix)
    if (!t.ok) return false
    const p = tryTrimParentheses(t.trim)
    return p.ok && tryParseInt(p.trim) !== null
  }
  for (const prefix of ['normalSkill', 'skill', 'record', 'skin', 'baseId'])
    if (intParen(prefix)) return notPorted(`Pet.GetPetIdentifier 的 "${prefix}[...]" 臂要宠表/实例组件 (docs/engine/port-map.md 宠表批次)`)

  // `buff[..]` 支 (Pet.cs:316-326): 括号不成立时上游是**显式 return float.MinValue** (不是往下穿透),
  // 括号成立才读 initBuffs。两者都不需要宠表 ⇒ 前者照抄, 后者围。
  const bf = tryTrimStart(id, 'buff')
  if (bf.ok) {
    if (!tryTrimParentheses(bf.trim).ok) return FLOAT_MIN_VALUE
    return notPorted('Pet.GetPetIdentifier 的 "buff[..]" 臂要 pet.initBuffs (docs/engine/port-map.md 宠表批次)')
  }

  // `element.` / `subElement.` 的基类支读 Pet.elementId —— BattlePet 的 override 先命中, 到这儿只剩裸 Pet。
  for (const prefix of ['element.', 'subElement.']) {
    const e = tryTrimStart(id, prefix)
    if (e.ok && tryTrimStart(e.trim, 'group').ok)
      return notPorted(`Pet.GetPetIdentifier 的 "${prefix}group" 臂要 Pet.elementId (裸 Pet 才有, 本轮 src 不发裸 Pet)`)
  }

  switch (id) {
    case 'uid': case 'id': case 'subId': case 'baseId': case 'star': case 'generation':
    case 'minKizuna': case 'maxKizuna': case 'skinId': case 'element': case 'subElement':
    case 'gender': case 'personality': case 'trait': case 'height': case 'weight':
    case 'level': case 'maxLevel': case 'exp': case 'levelExp': case 'iv': case 'evStorage':
    case 'emblem': case 'featureId': case 'featureType': case 'emblemId': case 'emblemType': case 'resistLock':
      return notPorted(`Pet.GetPetIdentifier 的平键 "${id}" 要宠表/实例组件 (docs/engine/port-map.md 宠表批次)`)
    default: return FLOAT_MIN_VALUE
  }
}
