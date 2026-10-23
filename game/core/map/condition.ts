// 地图**条件 DSL**：串 → 可序列化 AST → 三值真值。
//
// 真值：`docs/map/map-condition.md`（M3）§2.4（14 臂逐条文法）/ §3（目标契约 / `MapEnv`）/
//       §5（不变量 `CSI1–CSI8`）· `docs/map/map-design.md`（父：`MP1–MP8` / `MC1–MC8` / `MQ1–MQ8`）
//       施工批 `MDB3-a…e`（impl `docs/map/map-impl.md §3.3`）
// 上游：`Scene Specific/Map/Entities/Npc/NpcConditionHandler.cs`（显式 9 臂）
//       + `System/Parser/Identifier.cs:81-153`（兜底臂的 `data.` / `petBag` —— 上游**写了两份**，见 M3 §2.5）
//
// 四条纪律（`grep` 可复核）：
//   · `MP3` / 规则 `M-1`：**零上层 import** —— 只吃 L0 兄弟（`./map-table.ts`）与解析器底座，不碰逻辑/接线层；
//   · `CSI3` / 规则 `M-4`：**一份分派表** —— 前缀分派只住在本文件（战斗侧不再抄一份）；
//   · `D4`：6 个比较算子**复用** `core/parser/operator.ts`（不新建 `core/map/operator.ts`）；
//   · `CSI4` / `CSI7`：求值 = 纯函数 + **三值** `boolean | 'unknown'`；`'unknown'` 的臂**不执行副作用**。
//
// 五处**有意改判**（上游 bug ⇒ 声明 + 不照搬，`AGENTS.md §2`；逐条见 M3 §7.1）：
//   ① `CSC1` 全角算子：地图侧也走全角→半角（上游地图侧 `toHalf:false`；数据里 0 次 ⇒ 零代价）；
//   ② `CSC3` `activity` **纯读**：不照搬 `Activity.Find` 的「顺手建档」（读条件不再往存档加空活动）；
//   ③ `CSC6` 兜底裸键：不再**静默 0**（上游 `active=false` ⇒ `0=0` **恒真**）⇒ 解析期登记 + `'unknown'`；
//   ④ `CSC7` `activity` 的 `bool` 臂：**也用 `op`**（上游无视算子；`LTE` 写在 bool 上会被静默当相等）；
//   ⑤ `CSC12` `petBag` 空集：`count` ⇒ 真 `0`（上游给 `float.MinValue` —— 一个"看起来像数字"的哨兵）。
//
// ⚠️ 与 M3 §7.1 **`CSC8` 的目标有一条修正**（数据反证，见 as-built `docs/map/map-impl.md §7.3.4`）：
//     `activity` 的**平键**里带 `[...]` 是**常态**（`done[north][2][default]` 等 —— 动作侧 `setActivity`
//     就按这个形状**写**进存档，实测 578 次写入 / 479 条条件读），⇒ **照录平键、不判"多级下标"**；
//     只有**值**里的分隔标记不是 `[default]`（实测 2 处 `[skin]`）才登记为畸形。

import { condition as cond6, splitCondition } from '../parser/operator.ts'
import { MAP_IDENTIFIER_KEYS } from './map-table.ts'
import { boolTryParse, toIntList, trimParentheses, tryParseFloat, tryParseInt } from '../strutil.ts'

/**
 * 6 算子切分（显式「最左最先」；`CSI1` / `MC1`）。
 * ⚠️ **复用** `core/parser/operator.ts` 的那一份（`D4`：**不新建** `core/map/operator.ts`，"一份分派表"）——
 * 这里只是把地图侧要用的名字**再导出**，供 `parseConditions` 之外的消费方（审计/工具）用同一份语义。
 */
export { splitCondition }

/** 三值真值（`CSI4`）：`'unknown'` = 上游那四种"状态不存在"编码（`op != "="` / `MinValue` / `0` / NRE）的统一改判。 */
export type Truth = boolean | 'unknown'

// ───────────────────────────── 注入面（`MapEnv` · `MQ3` 的条件侧切片） ─────────────────────────────

/**
 * 宠的**只读切片**（`Pet.GetPetIdentifier` 的等价物；实现归 **D6**，本件只点名键）。
 * ⚠️ 不认识的键 ⇒ `'unknown'`（上游给 `float.MinValue` —— 会**静默参与比较**，M3 §2.8）。
 */
export interface PetView {
  identifier(key: string): number | 'unknown'
}

/** 战斗状态的只读切片（`BattleState` 的子集；实现归 **E1/E5**）。A7 只读它，不自己算战斗。 */
export interface BattleView {
  identifier(key: string): number | 'unknown'
}

/**
 * 随机源（`R1`；决议 ①：**不追求与上游逐值一致**，只复刻规则）。
 * ⚠️ `read()` 必须返回**原始**会话值 —— 「纹章除 4」由本文件**一处**做（`CSI8`：上游把它拆在 getter 与范围臂两处）。
 */
export interface MapRng {
  /** A1 `random[old]`：读会话值（**不摇**）。 */
  read(): number
  /** A1 `random[new]`/`consume`：推进序列（写回会话），返回新值 —— **判定不用它**（`CSC9` 照录）。 */
  consume(): number
  /** A1 `random[a~b]`：闭区间现场摇（Unity `Random.Range(int,int)` 语义；不碰会话）。 */
  roll(min: number, max: number): number
  /** 队伍里是否有纹章 `20_0051`（`[old]` 与 `[a~b]` 共用的**一条**规则）；未实现 ⇒ 省略 ⇒ 不除。 */
  emblem?(): boolean
}

/** 会话/存档级**平键**键袋（`activities` 的正本 = 存档既有的 `<activityStorage>`，`CSQ4` / `D9`）。 */
export interface KeyValueBag<V> {
  get(id: string, key: string): V | undefined
}

/**
 * 条件求值的**唯一**外部依赖面（一件一缝；装配点 = 编排线 + 运行时线 `R3/R7`，M3 §3.4）。
 * ⚠️ 只读**会话态 + 结构化选择**，**永不**读 UI / 资源句柄 / 面板对象实例（`CSI5`）。
 */
export interface MapEnv {
  rng: MapRng
  /** A2 `map.<k>`：`identifierOf(record, k)` 的包装（8 键白名单在本文件校验）。 */
  map: { identifier(key: string): number | 'unknown' }
  /** A3 `npc[id].color`：L1 维护的**逻辑色**（`setNpcParam color=` 写入的），不是 UI。 */
  npcRuntime?: { tint(id: number): string | 'unknown' }
  /** A4 `firstPet.` / A14 `petBag…`：`petBag[0]` 即"首发"。 */
  petBag: Array<PetView | null>
  /** A5 `activity[id].<键>`。 */
  activities: KeyValueBag<string>
  /** A6 `mission[id].<键>`（形状占位；任务 = A 组出局 ⇒ 一律 `'unknown'`）。 */
  missions?: KeyValueBag<number>
  /** A7 `battle.<k>`；`null`/缺省 = "战斗未就绪"。 */
  battleState?: BattleView | null
  /** A8 `item[id].num` / `item_yite[id].num`（`'unknown'` = 道具线未接，**不是 0**）。 */
  items: { count(id: number, bag?: 'yite'): number | 'unknown' }
  /** A13 `data.<面板>` 的会话态半边（`PetSelect` 走 `selection`，见 `CSI5`）。 */
  sceneData: { get(key: string): unknown }
  /** A13 的 `PetSelect` 拆分件（面板回填的**结构化**选择，不是活对象）。 */
  selection?: { pet?: PetView }
  /** A11 `player.shoot` / `player.achievement`（`'unknown'` = 会话没给这两个数）。 */
  player: { shoot: number | 'unknown'; achievement: number | 'unknown' }
  /** `CSI4` 的登记出口（R5 sink 的降级形态：只记日志，不弹窗）。 */
  log: { unknown(why: string): void }
}

// ───────────────────────────── AST（语法与求值分离，`CSI6`） ─────────────────────────────

/** 14 臂 + 兜底（`unknown` = 上游的裸键兜底；`CSI3` 的一份分派表就住在这里）。 */
export type Arm =
  | 'random' | 'map' | 'npc' | 'firstPet' | 'activity' | 'mission' | 'battle' | 'item'
  | 'yiteRogue' | 'date' | 'player' | 'plantAnimal' | 'data' | 'petBag' | 'unknown'

/** A1 的三条子臂：`[old]` 读不摇 / `[new]`(`consume`) 同判定+推进 / `[a~b]` 现场摇。 */
export interface RandomSpec { mode: 'old' | 'new' | 'range'; lo?: number; hi?: number }
/** A5 的值文法 `[类型]条件值[default]缺省值`（M3 §2.4 的分解，照录）。 */
export interface ActivityValue { type: string; cond: string; def: string }
/** A14 的过滤项（`petBag(键:值)`；先试 `:`，切不出两段再回退算子切分 —— 照录 `Identifier.cs:110-115`）。 */
export interface PetFilter { op: string; key: string; value: string }
/** A3 的切分产物（`npc[<id>].<键>`）。 */
export interface NpcSpec { id: number; dataKey: string }
/** A13 的切分产物（`data.<面板>[.<键>]`）。 */
export interface DataSpec { panel: string; sub: string | null }

/** 各臂在**解析期**切好的东西（求值期不再切串）。 */
export type TermSpec = RandomSpec | ActivityValue | NpcSpec | DataSpec

export interface ConditionTerm {
  /** 子条件原串（登记/日志用）。 */
  raw: string
  /** 6 算子之一（`<` `>` `=` `LTE` `GTE` `NOT`；`MC1` 的"最左最先"由 `splitCondition` 决定）。 */
  op: string
  key: string
  value: string
  arm: Arm
  /** 解析期登记的问题；**有值 ⇒ 求值恒 `'unknown'`**（`CSI6`：畸形在加载期就看得见）。 */
  issue: string | null
  /** 臂内切分产物（只对需要预切的臂填；其余臂求值时从 `key` 现取）。 */
  spec?: TermSpec
}

/** 一个 `<condition>` 元素 = 一个 **OR 串**（`ConditionTerm[]`）；元素之间 **AND**（`CSI2`）。 */
export interface ConditionExpr {
  and: ConditionTerm[][]
  issues: ConditionIssue[]
}

export interface ConditionIssue {
  raw: string
  reason: string
}

// ───────────────────────────── 切层（`MDB3-a`） ─────────────────────────────

/**
 * `|` 的括号感知切分（`CSI2`）。
 * 上游是朴素 `Split('|')` —— 实测 `[...]` 内出现 `|` **0 次**（M3 §2.1），所以"没被踩到"；
 * 但 `random[a|b~c]` 那种**池**文法在 `Identifier` 侧是存在的 ⇒ 照目标实现深度感知，**未来出现也不会切坏**。
 * 深度对 `[]` 与 `()` **都**计（方括号是下标/过滤标记，圆括号是过滤式）。
 */
export function splitOrClause(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth = depth > 0 ? depth - 1 : 0
    else if (c === '|' && depth === 0) { out.push(s.slice(start, i)); start = i + 1 }
  }
  out.push(s.slice(start))
  return out
}

/** 前缀分派（**照录上游的判定顺序**：显式 9 臂在前，兜底臂在后）。 */
function armOf(key: string): { arm: Arm; rest: string } {
  if (key.startsWith('random')) return { arm: 'random', rest: key.slice(6) }
  if (key.startsWith('map.')) return { arm: 'map', rest: key.slice(4) }
  if (key.startsWith('npc')) return { arm: 'npc', rest: key.slice(3) }
  if (key.startsWith('firstPet.')) return { arm: 'firstPet', rest: key.slice(9) }
  if (key.startsWith('activity')) return { arm: 'activity', rest: key.slice(8) }
  if (key.startsWith('mission')) return { arm: 'mission', rest: key.slice(7) }
  if (key.startsWith('battle.')) return { arm: 'battle', rest: key.slice(7) }
  if (key.startsWith('item')) return { arm: 'item', rest: key.slice(4) }
  if (key.startsWith('yite_rogue.')) return { arm: 'yiteRogue', rest: key.slice(11) }
  // ── 以下 = 上游**兜底臂**（`Identifier.GetIdentifier`）的分支；`plant.`/`animal.` 只是形状照录 ──
  if (key.startsWith('date.')) return { arm: 'date', rest: key.slice(5) }
  if (key.startsWith('player.')) return { arm: 'player', rest: key.slice(7) }
  if (key.startsWith('plant.') || key.startsWith('animal.')) return { arm: 'plantAnimal', rest: key }
  if (key.startsWith('data.')) return { arm: 'data', rest: key.slice(5) }
  if (key.startsWith('petBag')) return { arm: 'petBag', rest: key.slice(6) }
  return { arm: 'unknown', rest: key }
}

/** A5 的值文法：`[类型]条件值[default]缺省值`。类型缺省 = `string`（上游 `:104-108` 照录）。 */
function parseActivityValue(value: string): { parsed: ActivityValue; issue: string | null } {
  let type = 'string'
  let rest = value
  if (value.startsWith('[')) {
    type = trimParentheses(value).toLowerCase()
    rest = value.slice(type.length + 2)   // `[type]` 恰好占 2+len 个字符（上游假定）
  }
  const i = rest.indexOf('[')
  const j = rest.indexOf(']')
  if (i < 0 || j < i) return { parsed: { type, cond: '', def: rest }, issue: 'activity-value-grammar' }
  const parsed: ActivityValue = { type, cond: rest.slice(0, i), def: rest.slice(j + 1) }
  // 分隔标记必须是 `[default]`：上游靠 `IndexOf(']')` 的**位置巧合**切值（数据里 2 处 `[skin]`）⇒ 不照搬。
  return rest.slice(i, j + 1) === '[default]' ? { parsed, issue: null } : { parsed, issue: 'activity-value-marker' }
}

/** 一个子条件 → `ConditionTerm`（**只切分、不求值**；畸形在这里登记，`CSI6`）。 */
function parseTerm(raw: string): ConditionTerm {
  const t: ConditionTerm = { raw, op: '=', key: raw, value: '', arm: 'unknown', issue: null }
  try {
    const s = splitCondition(raw)   // ⚠️ `CSC1`：默认 `toHalf: true`（上游地图侧传了 `false`）
    t.op = s.op
    t.key = s.key
    t.value = s.value
  } catch {
    t.issue = 'no-operator'   // 上游在 `Substring(0,-1)` 处**抛**（实测发行数据不可达）
    return t
  }
  const { arm, rest } = armOf(t.key)
  t.arm = arm
  t.issue = t.issue ?? validateArm(t, rest)
  return t
}

/** 各臂的**解析期**校验（只登记真正畸形/越界的形状；返回 `null` = 没问题）。 */
function validateArm(t: ConditionTerm, rest: string): string | null {
  const num = (): boolean => tryParseFloat(t.value) === null
  switch (t.arm) {
    case 'random': {
      if (rest === '[old]') { t.spec = { mode: 'old' }; return num() ? 'bad-value-number' : null }
      if (rest === '[new]' || rest === '[consume]') { t.spec = { mode: 'new' }; return num() ? 'bad-value-number' : null }
      const parts = toIntList(trimParentheses(rest), '~')
      if (!parts || parts.length !== 2) return 'random-arm'   // 裸 `random` / 畸形区间（上游 `range[1]` 越界抛）
      t.spec = { mode: 'range', lo: parts[0], hi: parts[1] }
      return num() ? 'bad-value-number' : null
    }
    case 'map':
      if (!MAP_IDENTIFIER_KEYS.includes(rest)) return 'map-unknown-key'   // 上游给 `0`（会把"不知道"变成"答案"）
      return num() ? 'bad-value-number' : null
    case 'npc': {
      const id = tryParseInt(trimParentheses(rest))
      const dot = rest.indexOf('.')
      if (id === null || dot < 0) return 'npc-key-shape'
      t.spec = { id, dataKey: rest.slice(dot + 1) }   // 上游只认 `color`，其余键求值给 **false**（照录）
      return null
    }
    case 'firstPet':
      return num() ? 'bad-value-number' : null
    case 'activity': {
      const id = trimParentheses(rest)
      const dot = rest.indexOf('.')
      if (id === '' || dot < 0) return 'activity-key-shape'
      const { parsed, issue } = parseActivityValue(t.value)
      t.spec = parsed
      if (issue) return issue
      if (parsed.type === 'bool' && t.op !== '=' && t.op !== 'NOT') return 'activity-bool-op'   // `CSC7`
      if ((parsed.type === 'int' || parsed.type === 'uint' || parsed.type === 'float') && tryParseFloat(parsed.cond) === null) {
        return 'bad-value-number'
      }
      return null
    }
    case 'mission':
      if (tryParseInt(trimParentheses(rest)) === null || !rest.includes('.')) return 'mission-key-shape'
      return null
    case 'battle':
      return num() ? 'bad-value-number' : null
    case 'item': {
      if (tryParseInt(trimParentheses(rest)) === null) return 'item-key-shape'
      return tryParseInt(t.value) === null ? 'bad-value-int' : null   // 上游 `int.Parse(value)` 运行期抛
    }
    case 'yiteRogue':
    case 'date':
    case 'plantAnimal':
      return null   // 形状照录、执行一律 `'unknown'`（A 组出局 / R2 未建，M3 §3.2 A9–A12）
    case 'player':
      return null   // 子键在求值时判（`shoot`/`achievement` 两键可用，其余 `'unknown'`）
    case 'data': {
      const dot = rest.indexOf('.')
      t.spec = { panel: dot < 0 ? rest : rest.slice(0, dot), sub: dot < 0 ? null : rest.slice(dot + 1) }
      return num() ? 'bad-value-number' : null
    }
    case 'petBag': {
      if (!rest.startsWith('[') && !rest.startsWith('(')) return 'petBag-shape'
      return null
    }
    default:
      return 'unknown-key'   // `CSC6`：上游把未知键当 `0`（`active=false` 因此恒真）
  }
}

/**
 * `<condition>` 元素文本 → AST（`MDB3-a`）。
 * ⚠️ **元素之间 AND、串内 OR、无条件（空表）恒真**（`CSI2`；空表 ⇒ `and: []` ⇒ 求值 `true`）。
 * ⚠️ 这里只切分：**求值期不再解析字符串**（`CSI6`），所以 `parseConditions` 在按钮构造时跑一次即可。
 */
export function parseConditions(texts: Array<string | null | undefined> | null | undefined): ConditionExpr {
  const and: ConditionTerm[][] = []
  const issues: ConditionIssue[] = []
  for (const text of texts || []) {
    const clause: ConditionTerm[] = []
    for (const sub of splitOrClause(String(text))) {
      const term = parseTerm(sub)
      clause.push(term)
      if (term.issue) issues.push({ raw: term.raw, reason: term.issue })
    }
    and.push(clause)
  }
  return { and, issues }
}

// ───────────────────────────── 三值逻辑（`CSI4`） ─────────────────────────────

/** `unknown AND true = unknown` / `unknown AND false = false`。 */
export function and3(a: Truth, b: Truth): Truth {
  if (a === false || b === false) return false
  return (a === 'unknown' || b === 'unknown') ? 'unknown' : true
}

/** `unknown OR true = true` / `unknown OR false = unknown`。 */
export function or3(a: Truth, b: Truth): Truth {
  if (a === true || b === true) return true
  return (a === 'unknown' || b === 'unknown') ? 'unknown' : false
}

// ───────────────────────────── 求值（`MDB3-b…e`） ─────────────────────────────

/** `CSI4`：`'unknown'` ⇒ 不触发 + **登记**（键名 + 原因）。 */
function unknownOf(env: MapEnv, why: string): Truth {
  try { env.log?.unknown(why) } catch { /* 日志出口自己抛不该带崩求值 */ }
  return 'unknown'
}

/**
 * 求值（`boolean | 'unknown'`）。
 * ⚠️ **短路照录**（`CSC4`）：`AND` 见 `false` 即停、`OR` 见 `true` 即停 ⇒ `random[new]` 是否被推进
 * **取决于前面的臂**（副作用次数 = 数据决定）；这是**行为照录**，不是漏写。
 */
export function evalCondition(expr: ConditionExpr, env: MapEnv): Truth {
  let acc: Truth = true
  for (const clause of expr.and) {
    acc = and3(acc, evalClause(clause, env))
    if (acc === false) return false
  }
  return acc
}

function evalClause(clause: ConditionTerm[], env: MapEnv): Truth {
  let acc: Truth = false
  for (const t of clause) {
    acc = or3(acc, evalTerm(t, env))
    if (acc === true) return true
  }
  return acc
}

function evalTerm(t: ConditionTerm, env: MapEnv): Truth {
  if (t.issue) return unknownOf(env, `${t.issue}: ${t.raw}`)
  switch (t.arm) {
    case 'random': return evalRandom(t, env)
    case 'map': return evalMap(t, env)
    case 'npc': return evalNpc(t, env)
    case 'firstPet': return evalFirstPet(t, env)
    case 'activity': return evalActivity(t, env)
    case 'mission': return unknownOf(env, `mission-not-implemented: ${t.raw}`)
    case 'battle': return evalBattle(t, env)
    case 'item': return evalItem(t, env)
    case 'yiteRogue': return unknownOf(env, `yite-rogue-not-implemented: ${t.raw}`)
    case 'date': return unknownOf(env, `date-not-implemented: ${t.raw}`)
    case 'player': return evalPlayer(t, env)
    case 'plantAnimal': return unknownOf(env, `farm-animal-not-implemented: ${t.raw}`)
    case 'data': return evalData(t, env)
    case 'petBag': return evalPetBag(t, env)
    default: return unknownOf(env, `unknown-key: ${t.raw}`)
  }
}

/** `R1` 的纹章规则：**一处**（`[old]`/`[new]` 的读值与 `[a~b]` 的摇值共用，`CSI8`）。 */
function emblemDiv(n: number, env: MapEnv): number {
  return env.rng.emblem?.() ? Math.trunc(n / 4) : n
}

/** A1 `random`：`[old]` 读不摇 / `[new]` 同判定 + **推进** / `[a~b]` 现场摇（闭区间）。 */
function evalRandom(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const spec = t.spec as RandomSpec
  if (spec.mode === 'range') return cond6(t.op, emblemDiv(env.rng.roll(spec.lo as number, spec.hi as number), env), rhs)
  const lhs = emblemDiv(env.rng.read(), env)
  const result = cond6(t.op, lhs, rhs)
  if (spec.mode === 'new') env.rng.consume()   // ★判定用旧值，这里只推进序列（`CSC9` 照录）
  return result
}

/** A2 `map.<k>`：8 键白名单已在解析期校验；`identifier` 返回 `'unknown'` ⇒ 三值。 */
function evalMap(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const n = env.map.identifier(t.key.slice(4))
  if (n === 'unknown') return unknownOf(env, `map-unknown-key: ${t.raw}`)
  return cond6(t.op, n, rhs)
}

/** A3 `npc[id].color`：只读 `env.npcRuntime` 的逻辑色（**不读 UI**，`CSQ3`）；键只认 `color`，其余 `false` 照录。 */
function evalNpc(t: ConditionTerm, env: MapEnv): Truth {
  const spec = t.spec as NpcSpec
  if (spec.dataKey !== 'color') return false
  const tint = env.npcRuntime?.tint(spec.id) ?? 'unknown'
  const eq = colorEq(tint, t.value)
  if (eq === 'unknown') return unknownOf(env, `npc-color-unknown: ${t.raw}`)
  // 上游是 `(op == "=") ^ (color != want)` ⇒ 非 `=` 一律当"不等"（照录）。
  return t.op === '=' ? eq : !eq
}

/** `ToColor(Helper.cs:270-275)` = 取 4 个 int 再逐个 `(byte)` ⇒ 逐字节比。解析不出 4 段 ⇒ 上游 NRE。 */
function colorEq(a: string, b: string): boolean | 'unknown' {
  const pa = toIntList(a, ',')
  const pb = toIntList(b, ',')
  if (!pa || !pb || pa.length !== 4 || pb.length !== 4) return 'unknown'
  for (let i = 0; i < 4; i++) if ((pa[i] & 0xff) !== (pb[i] & 0xff)) return false
  return true
}

/** A4 `firstPet.<键>`：背包空 ⇒ `'unknown'`（上游 NRE，`CSC5`）；键集归 **D6**。 */
function evalFirstPet(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const pet = env.petBag[0] ?? null
  if (!pet) return unknownOf(env, `firstPet-empty-bag: ${t.raw}`)
  const n = pet.identifier(t.key.slice(9))
  if (n === 'unknown') return unknownOf(env, `pet-identifier-unknown: ${t.raw}`)
  return cond6(t.op, n, rhs)
}

/** A5 `activity[id].<平键>`：值文法照录、**纯读**（`CSC3`）、`bool` 也用 `op`（`CSC7`）。 */
function evalActivity(t: ConditionTerm, env: MapEnv): Truth {
  const rest = t.key.slice(8)
  const id = trimParentheses(rest)
  const dataKey = rest.slice(rest.indexOf('.') + 1)
  const av = t.spec as ActivityValue
  const raw = env.activities.get(id, dataKey)
  const val = raw === undefined ? av.def : raw
  if (av.type === 'bool') {
    const a = boolTryParse(val)
    const b = boolTryParse(av.cond)
    if (!a.ok || !b.ok) return unknownOf(env, `activity-bool-bad-value: ${t.raw}`)
    return t.op === '=' ? a.value === b.value : a.value !== b.value   // ★`CSC7`：不再无视 `op`
  }
  if (av.type === 'int' || av.type === 'uint' || av.type === 'float') {
    const a = tryParseFloat(val)
    const b = tryParseFloat(av.cond)
    if (a === null || b === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
    return cond6(t.op, a, b)
  }
  return t.op === '=' ? val === av.cond : val !== av.cond   // 默认 `string`（照录上游 `:114`）
}

/** A7 `battle.<k>`：战斗未就绪 ⇒ `'unknown'`（上游 `op != "="`）；键值归 **E1/E5**。 */
function evalBattle(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const bv = env.battleState
  if (!bv) return unknownOf(env, `battle-not-ready: ${t.raw}`)
  const n = bv.identifier(t.key.slice(7))
  if (n === 'unknown') return unknownOf(env, `battle-key-unknown: ${t.raw}`)
  return cond6(t.op, n, rhs)
}

/** A8 `item[id].<键>`：`<键>` **照录忽略**（数据里 100% 是 `num`）；缺道具 ⇒ `0`。 */
function evalItem(t: ConditionTerm, env: MapEnv): Truth {
  const rest = t.key.slice(4)
  const bag = rest.startsWith('_yite') ? 'yite' : undefined
  const id = tryParseInt(trimParentheses(rest))
  const rhs = tryParseInt(t.value)
  if (id === null || rhs === null) return unknownOf(env, `item-key-shape: ${t.raw}`)
  const have = env.items.count(id, bag)
  if (have === 'unknown') return unknownOf(env, `item-source-unknown: ${t.raw}`)
  return cond6(t.op, have, rhs)
}

/** A11 `player.`：只有 `shoot` / `achievement` 两个真键（`Identifier.cs:67-74`），其余 `'unknown'`。 */
function evalPlayer(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const sub = t.key.slice(7)
  const v = sub === 'shoot' ? env.player.shoot : sub === 'achievement' ? env.player.achievement : 'unknown'
  if (v === 'unknown') return unknownOf(env, `player-key-unknown: ${t.raw}`)
  return cond6(t.op, v, rhs)
}

/** A13 `data.<面板>[.<键>]`：只读会话态 + `selection`（`CSI5`）；键不存在 ⇒ `'unknown'`（上游 `0`）。 */
function evalData(t: ConditionTerm, env: MapEnv): Truth {
  const rhs = tryParseFloat(t.value)
  if (rhs === null) return unknownOf(env, `bad-value-number: ${t.raw}`)
  const spec = t.spec as { panel?: string; sub?: string | null }
  if (spec.panel === 'PetSelect') {
    const pet = env.selection?.pet
    if (!pet || spec.sub == null) return unknownOf(env, `selection-unknown: ${t.raw}`)
    const n = pet.identifier(spec.sub)
    if (n === 'unknown') return unknownOf(env, `pet-identifier-unknown: ${t.raw}`)
    return cond6(t.op, n, rhs)
  }
  const v = env.sceneData.get(spec.panel as string)
  if (typeof v === 'number' && Number.isFinite(v)) return cond6(t.op, v, rhs)
  if (typeof v === 'string') {
    const n = tryParseFloat(v)
    if (n !== null) return cond6(t.op, n, rhs)
  }
  return unknownOf(env, `scene-data-unknown: ${t.raw}`)
}

/** A14 `petBag…`：下标式 + 过滤式；`count` 空集 ⇒ **真 `0`**（`CSC12`），裸键空集 ⇒ `'unknown'`。 */
function evalPetBag(t: ConditionTerm, env: MapEnv): Truth {
  const rest = t.key.slice(6)
  const num = tryParseFloat(t.value)
  if (num === null) return unknownOf(env, `bad-value-number: ${t.raw}`)

  // ── 下标式 `petBag[i].<键>` ──
  if (rest.startsWith('[')) {
    const idxStr = trimParentheses(rest)
    const pet = env.petBag[tryParseInt(idxStr) ?? -1] ?? null
    const agg = rest.slice(rest.indexOf('[') + idxStr.length + 2).replace(/^\./, '')
    if (!pet) return unknownOf(env, `pet-bag-index-empty: ${t.raw}`)
    const n = pet.identifier(agg)
    if (n === 'unknown') return unknownOf(env, `pet-identifier-unknown: ${t.raw}`)
    return cond6(t.op, n, num)
  }

  // ── 过滤式 `petBag(键:值)[(…)].<聚合>` ──
  let expr = rest
  let sel: PetView[] = env.petBag.filter((p): p is PetView => p != null)
  let filterUnknown = false
  for (let guard = 0; guard < 8; guard++) {
    const cut = trimParentheses(expr, '(', ')')
    if (cut === expr) break
    const filters = parsePetFilters(cut)
    if (!filters) return unknownOf(env, `petBag-shape: ${t.raw}`)
    sel = sel.filter((p) => petMatches(p, filters, () => { filterUnknown = true }))
    expr = expr.slice(expr.indexOf('(') + cut.length + 2)
  }
  if (filterUnknown) return unknownOf(env, `pet-filter-unknown: ${t.raw}`)
  expr = expr.replace(/^\./, '')
  const count = sel.length
  if (expr === 'count') return cond6(t.op, count, num)   // ★空集 ⇒ 0（不是 `float.MinValue`）
  if (count <= 0) return unknownOf(env, `pet-bag-empty: ${t.raw}`)
  const dot = expr.indexOf('.')
  const func = dot < 0 ? expr : expr.slice(0, dot)
  const funcId = dot < 0 ? '' : expr.slice(dot + 1)
  const vals: number[] = []
  for (const p of sel) {
    const n = p.identifier(funcId === '' ? expr : funcId)
    if (n === 'unknown') return unknownOf(env, `pet-identifier-unknown: ${t.raw}`)
    vals.push(n)
  }
  if (func === 'sum') return cond6(t.op, vals.reduce((a, b) => a + b, 0), num)
  if (func === 'max') return cond6(t.op, Math.max(...vals), num)
  if (func === 'min') return cond6(t.op, Math.min(...vals), num)
  return cond6(t.op, vals[0], num)   // 裸键 = 取**第一只**
}

/** 过滤式的一项：先试 `:`（切出两段即 `=`），切不出再回退 `SplitCondition`（`Identifier.cs:110-115` 照录）。 */
function parsePetFilters(expr: string): PetFilter[] | null {
  const opts = expr.split(':')
  if (opts.length === 2) return [{ op: '=', key: opts[0], value: opts[1] }]
  try {
    const s = splitCondition(expr)
    return [{ op: s.op, key: s.key, value: s.value }]
  } catch {
    return null
  }
}

/** 过滤谓词（`Operator.Condition`）；键/值取不到 ⇒ 该宠**不入选** + 登记一次（上游这里回退 `GetNumIdentifier` ⇒ 0）。 */
function petMatches(p: PetView, filters: PetFilter[], onUnknown: () => void): boolean {
  for (const f of filters) {
    const lhs = p.identifier(f.key)
    const rhs = tryParseFloat(f.value)
    if (lhs === 'unknown' || rhs === null) { onUnknown(); return false }
    if (!cond6(f.op, lhs, rhs)) return false
  }
  return true
}

// ───────────────────────────── 共享前缀**求值面**（`DLI7` · `CSI3`） ─────────────────────────────

/**
 * 一条键串 → 其**左侧数值**（`number`）；取不到 / 不认识 / 副作用臂 ⇒ **`null`**（⇒ 调用方保留字面、不瞎猜 0）。
 *
 * ⚠️ 这是 `{expr:}`（对话插值 `dialog-host.makeExprResolver`）与 `[expr]`（动作 `setActivity` 写回）
 *   **共用的同一张前缀表** —— 前缀分派复用上面的 `armOf`（`CSI3`：只住本文件，不写第四份文法），
 *   各臂的**左侧读值**切片口径**逐字对齐**上面的 `eval*`（同一段 `slice`、同一个 `trimParentheses`）。
 * ★**只读、无副作用**（`DLI6`）：`random` ⇒ `null`（上游每次读值都重摇 ⇒ 内容会"抖"）。
 * ★**非数值面 ⇒ `null`**：`npc[id].color`（字符串）、`activity` 取到非数字串、`petBag` 过滤式（不在这个值面里算）。
 */
export function readMapValue(key: string, env: MapEnv): number | null {
  const k = String(key ?? '').trim().replaceAll('－', '-')
  if (!k) return null
  const { arm, rest } = armOf(k)
  switch (arm) {
    case 'map': {
      if (!MAP_IDENTIFIER_KEYS.includes(rest)) return null
      const n = env.map.identifier(rest)
      return n === 'unknown' ? null : n
    }
    case 'firstPet': {
      const pet = env.petBag[0] ?? null
      if (!pet) return null
      const n = pet.identifier(rest)
      return n === 'unknown' ? null : n
    }
    case 'battle': {
      const bv = env.battleState
      if (!bv) return null
      const n = bv.identifier(rest)
      return n === 'unknown' ? null : n
    }
    case 'item': {
      const bag = rest.startsWith('_yite') ? 'yite' : undefined
      const id = tryParseInt(trimParentheses(rest))
      if (id === null) return null
      const have = env.items.count(id, bag)
      return have === 'unknown' ? null : have
    }
    case 'activity': {
      const id = trimParentheses(rest)
      const dot = rest.indexOf('.')
      if (id === '' || dot < 0) return null
      const raw = env.activities.get(id, rest.slice(dot + 1))
      return raw === undefined ? null : tryParseFloat(raw)   // 非数字串 ⇒ null
    }
    case 'player': {
      const v = rest === 'shoot' ? env.player.shoot : rest === 'achievement' ? env.player.achievement : 'unknown'
      return v === 'unknown' ? null : v
    }
    case 'data': {
      const dot = rest.indexOf('.')
      const panel = dot < 0 ? rest : rest.slice(0, dot)
      const sub = dot < 0 ? null : rest.slice(dot + 1)
      if (panel === 'PetSelect') {
        const pet = env.selection?.pet
        if (!pet || sub == null) return null
        const n = pet.identifier(sub)
        return n === 'unknown' ? null : n
      }
      const v = env.sceneData.get(panel)
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string') { const n = tryParseFloat(v); if (n !== null) return n }
      return null
    }
    // ── 以下臂在"数值面"上取不到数（副作用 / 字符串 / 过滤式 / 未接）⇒ 一律 null ──
    case 'random':    // DLI6 副作用臂
    case 'npc':       // npc[id].color = 字符串
    case 'petBag':    // 过滤式聚合，不属这个单值面
    case 'mission':   // A 组出局 ⇒ 'unknown'
    case 'yiteRogue':
    case 'date':      // R2 未建
    case 'plantAnimal':
    default:
      return null
  }
}
