// `Entities/Npc/NpcActionHandler.cs`（481 行，18 动作）的**动作决议**（L0 · **只出决议、不执行**）。
// 施工批 **MB4**（`MDB2-b…e`）—— 地图线"点 NPC 有反应"的第一层；门序 = **模式门 → 条件 → 动作**（`MNI3`）。
//
// 真值：`docs/map/map-npc.md §2.6`（18 动作的 `param` 合同，逐条）· `§3.2`（本件形状）· `§5`（`MNI1–MNI8`）
//       `docs/map/map-impl.md §3.4`（MB4 蓝图）· `docs/map/map-code-map.md §2.2/§5.2`
// 纪律：**MP2**（纯函数：不写盘 / 不弹窗 / 不改状态）· **MQ4**（只出决议；执行 = `logic/map/action-runner.js`）
//       **MP7**（未知键静默兜底，但**加一头登记**）· **MNI3**（门序不许倒）· **MNI4**（`shoot` 两条入口）
//       **MNI6**（畸形参数 ⇒ `unimplemented` + 登记，**不抛**）· **MC8**（未知动作同样登记）· 决议 ②（声明 + 不照搬）
//
// ⚠️ 本件**不认识**会话的**射击态标志**（`session.js` 上那个同名布尔；`docs/map/map-code-map.md §8` 第 8 条 grep 门禁）——
//    模式是**抽象位**（`MapMode`），由调用方（L4）把会话态映射进来。
// ⚠️ 本件**不做**的事：渲染（`MP4`：中文只进 DOM）· 写盘（**MNI8**：执行器收口一次）· 弹窗（决议 ③）。

import { evalCondition, parseConditions } from './condition.ts'
import type { ConditionExpr, MapEnv } from './condition.ts'
import type { ButtonSpec } from './button.ts'
import { toIntList, tryParseFloat, tryParseInt } from '../strutil.ts'

// ───────────────────────────── 模式门（`MNI4` 的两条入口） ─────────────────────────────

/**
 * `shoot` 按钮的**原串**（`MC2`/`MNI4`：它**不进词表** ⇒ 派生 `type === 'None'`，只能靠 `typeId` 原串认领）。
 * 「`shoot` 有两条入口」共用的一个常量：
 *   ① **模式 XOR 门**（`modeGateOk`，`NpcHandler.cs:104`）；
 *   ② **`Where(typeId=="shoot")` 过滤**（`NpcController.Shoot()`，`isShootButton`）。
 */
export const SHOOT_TYPE_ID = 'shoot'

/**
 * **显式模式门**（`MC3` 的目标形状）：`'shoot'` = 射击模式。
 * ⚠️ 内核**不读**会话的射击态标志；这里只收一个**抽象位**（谁填见 `docs/map/map-impl.md §6`）。
 */
export type MapMode = 'normal' | 'shoot'

/** 这条按钮是不是"射击按钮"（= 第二条入口 `Where(typeId=="shoot")`，供 L4 用）。 */
export function isShootButton(b: ButtonSpec | null | undefined): boolean {
  return b?.typeId === SHOOT_TYPE_ID
}

/**
 * 模式 XOR 门（`NpcHandler.cs:104`：**射击态 ⊕"这条是不是 `shoot` 按钮"** ⇒ **拦下**）。
 * 返还 `true` = **放行**：目标模式与按钮种类**一致**（射击模式只放行 `shoot`；普通模式只放行其余）。
 */
export function modeGateOk(b: ButtonSpec | null | undefined, mode: MapMode): boolean {
  const shootBtn = isShootButton(b)
  return mode === 'shoot' ? shootBtn : !shootBtn
}

// ───────────────────────────── 决议（`MQ4`：纯数据、可序列化、可日志） ─────────────────────────────

/** `setNpcParam` 的目标：**另一只 NPC 的 id**，或 `'animal'`（⇒ 动物面板 = **A 组出局**，`docs/map/map-npc.md §2.6` 第 1 行）。 */
export type NpcParamTarget = 'animal' | number

/** `setItem` 的五个 op（`NpcActionHandler.cs:207-215`；未知 op ⇒ 上游 `itemFunc = null` ⇒ 整批静默不执行）。 */
export type SetItemOp = 'add' | 'add_with_hint' | 'remove' | 'add_to_yite' | 'remove_from_yite'
export const SET_ITEM_OPS: readonly SetItemOp[] = ['add', 'add_with_hint', 'remove', 'add_to_yite', 'remove_from_yite']

/** `openHintbox` 的三种盒（实测 `type[]`：`Item` 851 / `PetSelect` 87 / 其余（`Default` 3）⇒ `plain`）。 */
export type HintboxKind = 'Item' | 'PetSelect' | 'plain'

/**
 * `getPet` 的一条（**顺序有意义**：上游 `key=value` 是"改**上一个**刚造出来的宠"）。
 * ⚠️ 上游首条就是 `key=value` 时 `pet` 还是 `null` ⇒ NRE（`MNC`）⇒ 我们**解析期**判成畸形（`MNI6`）。
 */
export type GetPetOp =
  | { kind: 'new'; id: number; level: number; emblem: boolean }
  | { kind: 'identifier'; key: string; value: number }

/**
 * 一条**决议**（`MQ4`；形状正本 = `docs/map/map-npc.md §3.2`）。
 *
 * ⚠️ **本批（MB4）不发**的两种（§3.2 列了、`MNQ4` 未列 ⇒ 形状留位、`resolve` 出 `unimplemented`）：
 *   ① `removePet`（实测 **0** 命中）· ② `player`（`data.<key>=<表达式>` 要 `Parser.ParseOperation`，归编排线键袋）。
 */
export type ActionIntent =
  | { action: 'setNpcParam'; target: NpcParamTarget; writes: Array<[string, string]> }
  | { action: 'openHintbox'; kind: HintboxKind; fields: Array<[string, string]>; callbackTag?: string }
  | { action: 'openPanel'; panel: string; args: Array<[string, string]> }
  | { action: 'openDialog'; branch: 'close' | string }
  // ★`teleport` 的决议正本 = M5 `docs/map/map-teleport.md §3.2`：`mapId===0` ⇒ **在 M5 出 `notOpen`**（本条照发，转换归 M5）。
  //   `spawn` 实测 **0 命中**（106 条全 1 个 `param`，§2.6 第 5 行）⇒ 保留形状、数据永不填。
  | { action: 'teleport'; mapId: number; spawn?: [number, number] }
  | { action: 'setItem'; op: SetItemOp; items: Array<[number, number]> }
  // ★**A 组的唯一例外**（人类 2026-10-18 拍板 ①）：**只写袋**（= 存档既有的 `<activityStorage>`）+ 日志，
  //   仍**不做活动玩法**（无开放时间 / 无奖励 / 无 UI）⇒ `docs/map/map-npc.md §7.2 MNQ2`。
  | { action: 'setActivity'; id: string; entries: Array<[string, string]> }
  | { action: 'getPet'; ops: GetPetOp[] }
  | { action: 'setPet'; index: number; writes: Array<[string, number]> }
  | { action: 'evolvePet'; index: number; evolveId: number }
  | { action: 'battle'; branch: string; hintIfMissing?: string }
  // ★链式再入（`MNC9`）：执行器按标签去 `callbackHandler` 找 `typeId` 相等的按钮再跑一遍，**深度上限 = 16**（`MNQ3`）。
  | { action: 'callback'; tags: string[] }
  // ★**登记口**（`MP7` + `MNI6` + `MC8`）：上游"数据不合格就抛"的十四处 + 未知动作 + A 组出局，全落这里。
  //   `reason` 是 `name` 之外的**机器可读**因由（22 个名字可 grep，见 `docs/map/map-impl.md §7.3.5`）。
  | { action: 'unimplemented'; name: string; params: string[]; reason: string }

// ───────────────────────────── 参数解析（逐动作） ─────────────────────────────

/** 「不抛」的统一出口（`MNI6`）。 */
function unimpl(name: string, params: string[], reason: string): ActionIntent {
  return { action: 'unimplemented', name, params, reason }
}

/**
 * `key=value` **只切第一个** `=`（**MNC5**：上游 `setNpcParam`/`player`/`setPet`/`setActivity`/`mail` 五处用
 * 无限制 `Split('=')` ⇒ **值里的 `=` 被截断**；`openHintbox` 用 `Split('=',2)`。目标 = 统一）。
 * 切不出 `=` ⇒ `null`（调用方据此登记畸形；上游是 `option[1]` **越界抛**，`MNI6`）。
 */
function splitKeyValue(s: string): [string, string] | null {
  const i = s.indexOf('=')
  return i < 0 ? null : [s.slice(0, i), s.slice(i + 1)]
}

/** `"x,y"` → `[x,y]`（上游 `ToVector2`；`spawn` 实测 0 命中 ⇒ 只在畸形面出现）。 */
function parseVec2(s: string): [number, number] | null {
  const parts = s.split(',')
  if (parts.length < 2) return null
  const x = tryParseFloat(parts[0])
  const y = tryParseFloat(parts[1])
  return x === null || y === null ? null : [x, y]
}

/** 动作 1 `setNpcParam`（`NpcActionHandler.cs:9-74`）：`param[0]` = 目标 id 或 `animal`；`param[1..]` = `key=value`。 */
function parseSetNpcParam(p: string[]): ActionIntent {
  if (p.length < 2) return unimpl('setNpcParam', p, 'param-count-lt-2') // 上游 `Count < 2` 直接 return（点了没反应）
  if (p[0] === 'animal') return { action: 'setNpcParam', target: 'animal', writes: [] }
  const id = tryParseInt(p[0])
  if (id === null) return unimpl('setNpcParam', p, 'bad-target-id') // 上游 `int.Parse` 非数即抛
  const writes: Array<[string, string]> = []
  for (let i = 1; i < p.length; i++) {
    const kv = splitKeyValue(p[i])
    if (!kv) return unimpl('setNpcParam', p, 'bad-write') // 上游 `option[1]` 越界（`MNC` 全表通用）
    writes.push(kv)
  }
  return { action: 'setNpcParam', target: id, writes }
}

/** 动作 2 `openHintbox`（`:103-144`）：`param[0]` **必须** `type=<X>`；`callback=<标签>` 是特例。 */
function parseOpenHintbox(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('openHintbox', p, 'no-param')
  const head = splitKeyValue(p[0])
  if (!head) return unimpl('openHintbox', p, 'bad-type') // 上游 `type[1]` 越界（:110）
  const kind: HintboxKind = head[1] === 'Item' ? 'Item' : head[1] === 'PetSelect' ? 'PetSelect' : 'plain'
  const fields: Array<[string, string]> = []
  let callbackTag: string | undefined
  for (let i = 1; i < p.length; i++) {
    const kv = splitKeyValue(p[i])
    if (!kv) return unimpl('openHintbox', p, 'bad-field')
    if (kv[0] === 'callback') {
      // ⚠️ 上游支持 `[expr]` 先求值成整数串（:129-130）；实测 **0** 命中 ⇒ 未接求值器 ⇒ 登记（见 §7.3.5）。
      if (kv[1].startsWith('[expr]')) return unimpl('openHintbox', p, 'expr-unsupported')
      callbackTag = kv[1] // 多条只留最后一条（上游 `SetOptionCallback` 每遇一次就覆盖）
    } else {
      fields.push(kv)
    }
  }
  return callbackTag === undefined
    ? { action: 'openHintbox', kind, fields }
    : { action: 'openHintbox', kind, fields, callbackTag }
}

/** 动作 3 `openPanel`（`:146-161`）：`param[0]` = 面板名（**自己就可能带 `[...]`**）；`param[1..]` = `key=value`。 */
function parseOpenPanel(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('openPanel', p, 'no-param')
  const args: Array<[string, string]> = []
  for (let i = 1; i < p.length; i++) {
    const kv = splitKeyValue(p[i])
    if (!kv) return unimpl('openPanel', p, 'bad-arg')
    args.push(kv)
  }
  return { action: 'openPanel', panel: p[0], args }
}

/** 动作 4 `openDialog`（`:163-186`）：`param[0]` = `<dialog>` 分支 id，或字面量 `"null"` ⇒ **关对话**。 */
function parseOpenDialog(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('openDialog', p, 'no-param') // 实测 2 项（上游直接 return）
  return { action: 'openDialog', branch: p[0] === 'null' ? 'close' : p[0] }
}

/** 动作 5 `teleport`（`:188-200`；正本 = M5 §2.2/§3.5）：`param[0]` = 目标图 id；`param[1]` = `"x,y"`（实测 0 命中）。 */
function parseTeleport(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('teleport', p, 'no-param') // TPC2 目标：登记畸形（上游点了没反应）
  const mapId = tryParseInt(p[0])
  if (mapId === null) return unimpl('teleport', p, 'bad-map-id') // TPC2：上游 `int.Parse` 无 try，整条动作抛
  if (p.length === 1) return { action: 'teleport', mapId }
  const spawn = parseVec2(p[1])
  if (!spawn) return unimpl('teleport', p, 'bad-spawn')
  return { action: 'teleport', mapId, spawn }
}

/** 动作 6 `setItem`（`:202-223`）：`param[0]` ∈ 五 op；`param[1..]` = `"id,num"`。 */
function parseSetItem(p: string[]): ActionIntent {
  if (p.length < 2) return unimpl('setItem', p, 'param-count-lt-2')
  const op = p[0]
  if (!(SET_ITEM_OPS as readonly string[]).includes(op)) return unimpl('setItem', p, 'unknown-op') // 上游 `itemFunc=null` ⇒ 静默不执行
  const items: Array<[number, number]> = []
  for (let i = 1; i < p.length; i++) {
    const nums = toIntList(p[i])
    if (!nums || nums.length < 2) return unimpl('setItem', p, 'bad-item') // 上游 `itemInfo[1]` 越界
    items.push([nums[0], nums[1]])
  }
  return { action: 'setItem', op: op as SetItemOp, items }
}

/** 动作 7 `getPet`（`:225-251`）：`param[i]` = `"id[,level[,emblem]]"`（造宠）或 `key=value`（改上一只）。 */
function parseGetPet(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('getPet', p, 'no-param')
  const ops: GetPetOp[] = []
  for (const raw of p) {
    const kv = splitKeyValue(raw)
    if (!kv) {
      const nums = toIntList(raw)
      if (!nums || nums.length === 0) return unimpl('getPet', p, 'bad-grant')
      const id = nums[0]
      const level = nums.length < 2 ? 1 : nums[1]
      const emblem = nums.length < 3 ? true : nums[2] !== 0
      ops.push({ kind: 'new', id, level, emblem })
    } else {
      const value = tryParseFloat(kv[1])
      if (value === null) return unimpl('getPet', p, 'bad-identifier')
      ops.push({ kind: 'identifier', key: kv[0], value })
    }
  }
  // 上游首条是 `key=value` 时 `pet === null` ⇒ NRE（`:247`）；我们解析期就判畸形（`MNI6`）。
  if (ops[0].kind === 'identifier') return unimpl('getPet', p, 'identifier-without-pet')
  return { action: 'getPet', ops }
}

/** 动作 9 `setPet`（`:274-298`）：`param[i]` = `index=N` 或 `key=value`（**写入 `index` 那一格**）。 */
function parseSetPet(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('setPet', p, 'no-param')
  let index = 0
  const writes: Array<[string, number]> = []
  for (const raw of p) {
    const kv = splitKeyValue(raw)
    if (!kv) continue // 上游 `petInfo.Length < 2` ⇒ continue（无 `=` 的直接跳过，不算畸形）
    if (kv[0].toLowerCase() === 'index') {
      const v = tryParseInt(kv[1]) // 上游 `Parser.ParseOperation`（表达式面未接，见 §7.3.5）
      if (v === null) return unimpl('setPet', p, 'bad-index')
      index = v
      continue
    }
    const value = tryParseFloat(kv[1])
    if (value === null) return unimpl('setPet', p, 'bad-value')
    writes.push([kv[0], value])
  }
  return { action: 'setPet', index, writes }
}

/** 动作 10 `evolvePet`（`:300-318`）：`param[0]` 可选 `index=N`；其后第一条 = `evolveId`。 */
function parseEvolvePet(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('evolvePet', p, 'no-param')
  let index = 0
  let offset = 0
  const head = splitKeyValue(p[0])
  if (head && head[0].toLowerCase() === 'index') {
    const v = tryParseInt(head[1])
    if (v === null) return unimpl('evolvePet', p, 'bad-index')
    index = v
    offset = 1
  }
  const rawId = p[offset]
  if (rawId === undefined) return unimpl('evolvePet', p, 'missing-evolve-id') // 上游 `param[paramOffset]` 越界
  const evolveId = tryParseInt(rawId) // 上游 `Identifier.GetNumIdentifier`（表达式面未接，见 §7.3.5）
  if (evolveId === null) return unimpl('evolvePet', p, 'bad-evolve-id')
  return { action: 'evolvePet', index, evolveId }
}

/** 动作 12 `setActivity`（`:341-353`，人类 2026-10-18 拍板 ① ⇒ **只写袋**）：`param[0]` = 活动 id；`param[1..]` = `key=value`。 */
function parseSetActivity(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('setActivity', p, 'no-param')
  const entries: Array<[string, string]> = []
  for (let i = 1; i < p.length; i++) {
    const kv = splitKeyValue(p[i])
    if (!kv) return unimpl('setActivity', p, 'bad-entry') // 上游 `option[1]` 越界
    // ★B4（人类 2026-10-19）：上游写活动键值时**先求值** `[expr]…`（实测 **11** 条）。解析期**无 env** ⇒
    //    不再整条 `unimpl` 丢弃，而是**原样保留** `key=value`（含 `[expr]` 前缀串）交给 **sink 在写回期求值**
    //    （`readMapValue`，`DLI7` 同一张前缀表）。求值取不到 ⇒ sink 跳过该条 + 登记（不写半条错的）。
    entries.push(kv)
  }
  return { action: 'setActivity', id: p[0], entries }
}

/** 动作 13 `battle`（`:355-377`）：`param[0]` = `<battle>` 分支 id；`param[1]`（可选）= 找不到分支时的提示文案。 */
function parseBattle(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('battle', p, 'no-param')
  return p.length > 1
    ? { action: 'battle', branch: p[0], hintIfMissing: p[1] }
    : { action: 'battle', branch: p[0] }
}

/** 动作 18 `callback`（`:458-480`）：`param[]` = 一组标签（`typeId` 匹配 `callbackHandler`）。 */
function parseCallback(p: string[]): ActionIntent {
  if (p.length === 0) return unimpl('callback', p, 'no-param')
  for (const raw of p) {
    // 上游 `[expr]` 先求值成整数串（:469-470）；实测 **0** 命中 ⇒ 未接求值器 ⇒ 登记（见 §7.3.5）。
    if (raw.startsWith('[expr]')) return unimpl('callback', p, 'expr-unsupported')
  }
  return { action: 'callback', tags: [...p] }
}

/** 一格分派（`CSI3` 的"一份分派表"精神；**动作**侧的那张）。 */
function resolveAction(h: ButtonSpec): ActionIntent {
  const p = h.param ?? []
  switch (h.action) {
    case 'SetNpcParam': return parseSetNpcParam(p)
    case 'OpenHintbox': return parseOpenHintbox(p)
    case 'OpenPanel': return parseOpenPanel(p)
    case 'OpenDialog': return parseOpenDialog(p)
    case 'Teleport': return parseTeleport(p)
    case 'SetItem': return parseSetItem(p)
    case 'GetPet': return parseGetPet(p)
    case 'SetPet': return parseSetPet(p)
    case 'EvolvePet': return parseEvolvePet(p)
    case 'SetActivity': return parseSetActivity(p)
    case 'Battle': return parseBattle(p)
    case 'Callback': return parseCallback(p)
    // ── 以下：**MB4 不发**（`MNQ4` 未列）⇒ 一律登记、不动状态（`MQ6` + `MP7`） ──
    case 'SetMission': return unimpl('setMission', p, 'a-group')
    case 'Fish': return unimpl('fish', p, 'a-group')
    case 'MiniGame': return unimpl('miniGame', p, 'a-group')
    case 'SetMail': return unimpl('mail', p, 'a-group') // 死枚举（实测 0 次调用）
    case 'Player': return unimpl('player', p, 'not-implemented') // 编排线键袋（§3.3），MB5+
    case 'RemovePet': return unimpl('removePet', p, 'not-implemented') // 实测 0 命中
    // `None` = 未登记（含拼错的 `action`、`none` 2 次）⇒ `MC8`：保留不抛，但**加一头登记**。
    default: return unimpl(h.actionType ?? 'none', p, 'unknown-action')
  }
}

// ───────────────────────────── 入口：门序（`MNI3`） ─────────────────────────────

/** `resolve` 的入参（**可缺省**；`docs/map/map-impl.md §6` 的调用点是两参形态）。 */
export interface ResolveOptions {
  /** 模式门（`MNI4` 的 `Where`/XOR 等价物）；缺省 = 普通模式。 */
  mode?: MapMode
  /**
   * **构造期**解析好的条件（`CSI6`：构造期解析一次、点击期只求值）。
   * 缺省 ⇒ 每次点击现 `parseConditions(handler.condition)`（只给"点一下算一次"的兜底路径用）。
   */
  conditions?: ConditionExpr
}

/**
 * 一条已登记的按钮 → **一条决议**，**只过动作分派、不过模式门/条件门**（纯函数，`MQ4`）。
 * 对话选项（`func`/`reply`）的物化用它：可见性/点击的**条件门由调用侧按阶段求值**（`dialog.ts` §3.3），
 * 本函数只把 `<action>/<param>` 翻成 `ActionIntent`（畸形 ⇒ `unimplemented`，**绝不抛**）。
 */
export function buildIntent(handler: ButtonSpec): ActionIntent {
  return resolveAction(handler)
}

/**
 * 一条按钮 → **一条决议**（`MQ4`）。三步，**顺序不许倒**（`MNI3`）：
 *   ① **模式门**（`modeGateOk`；`MC3`）⇒ 不过 ⇒ `null`；
 *   ② **条件门**（`M3`；`CSI4`：`'unknown'` 亦 ⇒ **不触发**）⇒ 不过 ⇒ `null`（登记由条件侧 `env.log` 做）；
 *   ③ **动作**（`resolveAction`）⇒ `ActionIntent`（畸形/未实现 ⇒ `unimplemented`，**绝不抛**）。
 *
 * ⚠️ `handler` 允许为 `null`（上游 `YiTeRogueChoice.cs:223` 拿 `npc=null` 走同一条链的先例，`MNI7`）⇒ 一步即 `null`。
 */
export function resolve(
  handler: ButtonSpec | null | undefined,
  env: MapEnv,
  opts: ResolveOptions = {},
): ActionIntent | null {
  if (!handler) return null
  if (!modeGateOk(handler, opts.mode ?? 'normal')) return null
  const conditions = opts.conditions ?? parseConditions(handler.condition)
  if (evalCondition(conditions, env) !== true) return null
  return resolveAction(handler)
}
