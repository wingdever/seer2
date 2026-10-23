// 地图战斗**触发**的**纯逻辑**（施工批 **MB7** / `MDB6-b/c`；真值 = `docs/map/map-battle-trigger.md §3.1–§3.4`）。
//
// L0（`MP3` 纯）：把一条 `<battle><branch>` 配方（`parse-map.js` 的 `battles[]` 产物）翻成一份 **`BattleSpec` 决议**，
//   并判**开工三门**（`§3.3`，纯函数）。**不碰时钟/随机/渲染、不切场景、不写盘**（`MP2`/`MP4`/决议 ③）——
//   `seed==null ⇒ 时钟由编排层向 R2 取`（**BTI5**，内核不产时间戳）；三门任一失败 ⇒ 出**一条 `hint`**、不发 `battle`。
//
// 纪律：**BTI2**（`@count` 不裁敌方）· **BTI3**（branch id 作用域 = 一个 NPC，绝不建全局表）· **BTI5**（seed 缺省 null）·
//       **BTC4 修法**（② 的校验对象 = **上场对象**：`side.kind==='bag'` 查队首、`'data'` 查数据阵容队首）·
//       **BTC8 修法**（① 配方不存在 ⇒ **必须给文案**、不静默）· **AGENTS §2 / 决议 ②**（★**不照搬 `debugMode` 旁路**）。

/** 敌方宠 `BossInfo`（≠ 玩家宠；进场才 `GetBattlePet` ⇒ 接缝归 E3/D6）。`parse-map.js` 的 `bossOf` 产物。 */
export interface BossInfo {
  id: number | null
  level: number | null
  status: Record<string, number> | null
  emblem: boolean
  initBuff: number[]
  headerSkill: number[]
  loopSkill: number[]
  normalSkill: number[]
  superSkill: number
}

/** 战斗设置 18 列（缺省方向 = "宽松"，`§2.3`；键名对齐 `parse-map.js` 的 `settingsOf`）。 */
export interface BattleSettings {
  count: number; parallel: number; star: number; time: number
  mode: number; rule: number; weather: number; captureLevel: number
  mod: boolean; simulate: boolean; escape: boolean; item: boolean; capture: boolean
  bgm: string | null; limit: string | null; limitDesc: string | null
  initBuff: string | number[]
  seed: number | null
}

/** 一条 `<battle><branch>`（`battles[]` 的一项；win/lose 处理器 = 原始按钮片段串，语义归 M2）。 */
export interface BattleBranch {
  id: string
  settings: BattleSettings
  player: BossInfo[] | null
  enemy: BossInfo[]
  winHandler: string[]
  loseHandler: string[]
}

/** 上场方：**数据阵容**（32 条写了 `<player>`）或 **真背包前 `count` 只**（648 条）。 */
export type BattleSide = { kind: 'data'; pets: BossInfo[] } | { kind: 'bag'; take: number }

/**
 * 战斗**决议**（内核只出这条，交 E6；形状正本 = `§3.2`）。★`enemy` **不裁到 `count`**（**BTI2**）。
 */
export interface BattleSpec {
  mapId: number | null
  npcId: number | null
  branchId: string
  settings: BattleSettings
  side: BattleSide
  enemy: BossInfo[]
  onWin: string[]
  onLose: string[]
}

/** 一条 NPC 的 recipe 面（`entity.js` 的一条运行时实体，含 `battles`）。 */
export interface NpcRecipes { id: number | null; battles?: BattleBranch[] }

/**
 * 按 `branchId` 在本 NPC 的配方里选一支 → `BattleSpec`（`§3.2`）。★**只在同一 NPC 内解引用**（**BTI3**）。
 * @returns 找不到该分支 ⇒ `null`（调用方据此走**门 ①**：给文案、不静默，**BTC8** 的修法）
 */
export function buildSpec(npc: NpcRecipes | null | undefined, branchId: string, mapId: number | null): BattleSpec | null {
  const branch = (npc?.battles ?? []).find((b) => String(b.id) === String(branchId))
  if (!branch) return null
  const side: BattleSide = branch.player
    ? { kind: 'data', pets: branch.player }
    : { kind: 'bag', take: branch.settings.count }
  return {
    mapId,
    npcId: npc?.id ?? null,
    branchId: String(branch.id),
    settings: branch.settings,
    side,
    enemy: branch.enemy,                              // ★不裁（`@count` 只管己方上场数）
    onWin: branch.winHandler,
    onLose: branch.loseHandler,
  }
}

/** `canStartBattle` 的**外部注入面**（`M-5`：内核不读会话/战斗；宠数据未落地 ⇒ 各判可返回 `'unknown'` ⇒ **放行**）。 */
export interface GateProbe {
  /** 上场队首是否可用（`'bag'` ⇒ 真背包首只；`'data'` ⇒ 数据阵容首只）。**未知 ⇒ 视为可用**（D6 未接）。 */
  firstPetAlive(side: BattleSide): boolean | 'unknown'
  /** 首只是否为 Mod 宠（`!settings.mod` 时用于拦 Mod 宠）。未知 ⇒ 视为非 Mod。 */
  isFirstPetMod?(): boolean | 'unknown'
  /** 首只的星级（`starLimit>0` 时用于拦）。未知 ⇒ 视为 0（不超）。 */
  firstPetStar?(): number | 'unknown'
}

/** 开工三门的结果：过 ⇒ `ok`；不过 ⇒ `hint`（发一条提示决议、**不切场景**，`§3.3` / **R5**）。 */
export type GateResult = { ok: true } | { ok: false; hint: string }

const HINT_NO_RECIPE = '战斗配置不存在。'                       // ①（上游 `Battle.cs:236`，实测对 `hell` 静默 ⇒ 这里给文案）
const HINT_FIRST_DEAD = '首发精灵血量耗尽，快去恢复精灵吧！'      // ②

/**
 * 开工三门（`§3.3`）——**上游三门，修掉两处不一致**（② 校验对象 = 上场对象 = **BTC4**；无 `debugMode` 旁路 = **决议 ②**）。
 * 三门任一失败 ⇒ `{ok:false, hint}`（调用方发 `hint`、不发 `battle`）；全过 ⇒ `{ok:true}`。
 *
 * ⚠️ **MB7 边界（诚实登记）**：门 ①（配方不存在）已可观测；门 ②③ 依赖 **D6** 的宠血量 / Mod 标 / 星级，
 *   今天 `probe` 一律回 `'unknown'` ⇒ **放行**（取不到 ⇒ 不拦，与 M3 §3.3 同口径；接 D6 后自动生效）。
 *   `settings.limit` 表达式过滤（`GetBattleLimit` = `Parser.ParseConditionFilter`，**M3 算子**）同属 D6 结账 ⇒ 本批不拦。
 */
export function canStartBattle(spec: BattleSpec, probe: GateProbe): GateResult {
  // ① 配方存在：`buildSpec` 已保证（spec 非 null 即存在）；此处保留显式判，防调用方绕过。
  if (!spec.enemy || spec.enemy.length === 0) return { ok: false, hint: HINT_NO_RECIPE }   // ★空敌 = 无效配方（`BTC5`）
  // ② 首发可用（**校验对象 = 上场对象**，BTC4 修法）：未知 ⇒ 放行。
  if (probe.firstPetAlive(spec.side) === false) return { ok: false, hint: HINT_FIRST_DEAD }
  // ③ settings 准入：Mod 宠拦（当 `!mod`）；星级超 `starLimit` 拦。未知 ⇒ 放行。
  if (!spec.settings.mod && probe.isFirstPetMod?.() === true) {
    return { ok: false, hint: '无法使用Mod精灵进行本体关卡的挑战哦\n<color=#ffbb33>橘色名字</color>的是Mod精灵' }
  }
  if (spec.settings.star > 0) {
    const star = probe.firstPetStar?.() ?? 'unknown'
    if (star !== 'unknown' && star > spec.settings.star) {
      return { ok: false, hint: spec.settings.limitDesc ?? `不能携带超过<color=#ffbb33>${spec.settings.star}星</color>的精灵进行挑战哦` }
    }
  }
  return { ok: true }
}
