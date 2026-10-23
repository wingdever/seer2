// L1 · **初始档生成 + 版本迁移修饰**（零 DOM / 零 IO / 零 app import）。
//
// 真值：`docs/save/save-design.md §5`（`GameData.GetDefaultData` + `GameManager.GameLogin` 的修饰）
//       `docs/save/save-design.md §6`（版本比较与各 `*.VersionUpdate()`）
//       `docs/save/save-code-map.md §2.4`（接口）
//
// ⚠️ **本文件里有一条「临时件」**：`makeRefPet` = 上游 `new Pet(id, level)` 的**参考实现**（结构同形）。
//    它的**正式归属是域线 D6**（`Pet` + 8 组件的对象化，`docs/domain/domain-pet.md`，今天 0 个对象）。
//    留在这里的唯一理由：让"造默认档"当下可跑、可人手测（人类 2026-10-18 批 A 的要求）。
//    D6 落地后 ⇒ **由 app 注入真工厂**（`defaultGameData({ petFactory })`），本函数随之删除。
//    见 `docs/save/save-impl.md §9` 的偏差登记。

import {
  PET_BAG_SIZE,
  STARTER_PET_IDS,
  STARTER_ITEM_ID,
  COIN_ID,
  DIAMOND_ID,
  DEFAULT_VERSION,
  defaultPetFeature,
  defaultPetRecord,
  defaultPetResist,
  zeroStatus,
  fresh,
  formatDateTime,
  parseDateTime,
} from './schema.js'
import { totalExpToLevel } from '../stats.js'
import { getPetNormalStatus, Status } from '../../core/pet/status.js'
import { makeRng } from '../rng.js'

// ─────────────────────────── 内容表注入 ───────────────────────────

/**
 * 把 L2 内容桥（`game/data/unity/*.json`）的**原始 JSON** 收成一个查表对象，交给本模块用。
 * ⚠️ 谁去做这层"取数"是**调用方**的事（app 侧 = `content.js`；手测 = 一条 node 命令）——
 * 本模块不 fetch、不 import `game/data/**`（`docs/save/save-code-map.md §5`）。
 *
 * @param {{pets?: any, growth?: any, rules?: any}} json 三个文件的原样对象
 */
export function unityTables(json = {}) {
  const petList = Array.isArray(json.pets?.pets) ? json.pets.pets : (Array.isArray(json.pets) ? json.pets : [])
  const growthList = Array.isArray(json.growth?.growth) ? json.growth.growth : (Array.isArray(json.growth) ? json.growth : [])
  const petById = new Map(petList.map((p) => [Number(p.id), p]))
  const growthById = new Map(growthList.map((g) => [Number(g.id), g]))
  return {
    version: json.pets?._version || DEFAULT_VERSION,
    curve: json.rules?.expCurve || null,
    pet: (id) => petById.get(Number(id)) || null,
    growth: (id) => growthById.get(Number(id)) || null,
  }
}

// ─────────────────────────── 初始 6 宠（临时参考工厂） ───────────────────────────

// Unity `Random.Range(0, n)`（int 重载）**上界开区间** ⇒ 取 0..n-1。
const rngBelow = (rng, n) => Math.min(n - 1, Math.floor(rng() * n))

/** 上游 `List.Random(weights)`：按权重抽。权重缺失/长度不符 ⇒ 等概率。 */
function pickWeighted(list, weights, rng) {
  if (!Array.isArray(list) || list.length === 0) return 0
  const ok = Array.isArray(weights) && weights.length === list.length
  if (!ok) return list[rngBelow(rng, list.length)]
  const total = weights.reduce((a, b) => a + Number(b || 0), 0)
  if (!(total > 0)) return list[rngBelow(rng, list.length)]
  let r = rng() * total
  for (let i = 0; i < list.length; i++) {
    r -= Number(weights[i] || 0)
    if (r < 0) return list[i]
  }
  return list[list.length - 1]
}

/**
 * ⚠️ **临时参考实现**（正式归属 = 域线 D6，见文件头）。逐项照 `Pet.cs` 的 `Pet(int petId, int initLevel, bool hasEmblem = true)`：
 *   `basic`(PetBasic.cs:27-35) · `feature` · `exp`(PetExp.cs:31-35) · `talent`(iv=rand32) · `skills`(按学习等级)
 *   · `record` · `ui`(defaultSkinId/baseId) · `resist`(PetResist.cs:27-36) · `currentStatus` = `normalStatus`。
 *
 * ⚠️ 已知**未忠实**处（都因缺域侧数据，D6 落地时一并解决）：
 *   ① `Personality` 取 `Random.Range(0,25)` ⇒ **只落在 0..24**（上游同款写法；前 5 行 = 单属性增减性格）。
 *      上界是开是闭仍归 D6 本族待拍板①——本函数照源码重载语义（开）。
 *   ② `normalSkillId` = 前 4 个已学技能（上游还会滤掉 `必杀`，那需要技能表 ⇒ 本函数不滤）。
 *   ③ `superSkillId` 恒 0（上游取「第一个已学必杀技」，同样需要技能表）。
 *   ④ `exp.totalExp` 用 `game/logic/stats.js` 的曲线（已实证：lv10 → 1250，与夹具一致）。
 */
export function makeRefPet(id, level = 10, opts = {}) {
  const { tables, rng = Math.random, now = new Date() } = opts
  const info = tables?.pet ? tables.pet(id) : null
  if (!info) throw new Error(`makeRefPet 拿不到物种数据 id=${id}（需要 opts.tables = unityTables({pets,growth,rules})）`)
  if (!tables.curve) throw new Error('makeRefPet 需要 tables.curve（= rules.json 的 expCurve）来算 totalExp')

  const expType = Number(tables.growth?.(id)?.expType ?? 0)
  const personality = rngBelow(rng, 25) // ①
  const base = info.baseStatus || {}
  const iv = rngBelow(rng, 32)

  const learnLevels = info.skills?.learnLevelList || []
  const skillIds = info.skills?.skillIdList || []
  const own = skillIds.filter((_, i) => Number(learnLevels[i] ?? 1) <= level) // ②
  const status = getPetNormalStatus(
    Math.trunc(level),
    new Status([base.atk, base.mat, base.def, base.mdf, base.spd, base.hp]),
    iv,
    Status.zero(),
    personality,
  )

  return {
    id: Math.trunc(id),
    basic: {
      id: Math.trunc(id),
      name: null, // null ⇒ 省略该元素（真档亦然）
      gender: pickWeighted(info.genderList, info.genderDistribution, rng),
      personality,
      height: Number(info.baseHeight || 0) + rngBelow(rng, 6),
      weight: Number(info.baseWeight || 0) + rngBelow(rng, 6),
      getPetDate: formatDateTime(now),
    },
    feature: defaultPetFeature(id),
    exp: {
      id: Math.trunc(id),
      level: Math.trunc(level),
      fixedMaxLevel: 0,
      totalExp: totalExpToLevel(tables.curve, expType, Math.trunc(level)),
    },
    talent: { id: Math.trunc(id), iv, ev: zeroStatus(), evStorage: 0 },
    resist: defaultPetResist(id, Number(info.ui?.star ?? info.star ?? 0)),
    skills: {
      id: Math.trunc(id),
      ownSkillId: own,
      normalSkillId: own.slice(0, 4), // ③ 未滤「必杀」
      superSkillId: 0, // ③
    },
    record: defaultPetRecord(),
    ui: {
      id: Number(info.ui?.defaultSkinId ?? info.ui?.defaultId ?? id),
      baseId: Number(info.ui?.baseId ?? id),
      specialSkinList: [],
    },
    currentStatus: { atk: status.atk, mat: status.mat, def: status.def, mdf: status.mdf, spd: status.spd, hp: status.hp },
  }
}

// ─────────────────────────── 初始档 ───────────────────────────

/**
 * 上游 `GameData.GetDefaultData(initCoin = 2000, initDiamond = 0)`：空档 + 6 只 10 级初始宠
 * + `Item(1,coin)` / `Item(2,diamond)` / `Item(10237,1)` + `Mission(1)`。
 *
 * ⚠️ 相对 `docs/save/save-code-map.md §2.4` 的**追加**参数（原签名只有 `{coin, diamond, rng}`）：
 * `tables`（内容表，见 `unityTables`）/ `petFactory`（域线 D6 的真工厂）/ `now` / `version`。
 * `tables` 与 `petFactory` 二者必居其一 —— 缺则**抛错**（绝不静默造一份没有宠的假默认档）。见 §9 偏差登记。
 *
 * @param {{coin?: number, diamond?: number, rng?: () => number, tables?: any, petFactory?: (id: number, level: number) => any, now?: Date|string}} opts
 */
export function defaultGameData(opts = {}) {
  const {
    coin = 2000,
    diamond = 0,
    rng = makeRng(),
    tables = null,
    petFactory = null,
    now = new Date(),
  } = opts

  if (typeof petFactory !== 'function' && !tables) {
    throw new Error('defaultGameData 需要 opts.tables（unityTables(...)）或 opts.petFactory —— 6 只初始宠的构造归域侧（D6）；见 docs/save/save-impl.md §9')
  }
  const make = (typeof petFactory === 'function')
    ? petFactory
    : (id, level) => makeRefPet(id, level, { tables, rng, now })

  const g = fresh(now)
  STARTER_PET_IDS.forEach((id, i) => { g.petBag[i] = make(id, 10) })
  g.itemStorage.push({ id: COIN_ID, num: Math.trunc(coin) }, { id: DIAMOND_ID, num: Math.trunc(diamond) }, { id: STARTER_ITEM_ID, num: 1 })
  g.missionStorage.push({ id: 1, checkpoint: 'default', done: false })
  return g
}

// ─────────────────────────── 版本比较与迁移 ───────────────────────────

const VERSION_KINDS = ['alpha', 'beta', 'lite']

/**
 * 上游 `VersionData.Compare`：先比**前缀序**（alpha < beta < lite），同前缀再按 `_` 后 `a.b.c` 逐段数字比（缺段 = -1）。
 * 前缀认不出来 ⇒ 返回 0（上游同款：`-1` 分支直接 `return 0`）。
 */
export function compareVersion(lhs, rhs, compareBits = Number.MAX_SAFE_INTEGER) {
  const a = String(lhs ?? ''), b = String(rhs ?? '')
  const ia = VERSION_KINDS.findIndex((k) => a.startsWith(k))
  const ib = VERSION_KINDS.findIndex((k) => b.startsWith(k))
  if (ia === -1 || ib === -1) return 0
  if (ia !== ib) return ia < ib ? -1 : 1
  const kind = VERSION_KINDS[ia]
  const pa = a.startsWith(kind + '_') ? a.slice(kind.length + 1).split('.') : []
  const pb = b.startsWith(kind + '_') ? b.slice(kind.length + 1).split('.') : []
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    if (i >= compareBits) break
    const x = (i < pa.length) ? Number.parseInt(pa[i], 10) : -1
    const y = (i < pb.length) ? Number.parseInt(pb[i], 10) : -1
    const nx = Number.isFinite(x) ? x : -1
    const ny = Number.isFinite(y) ? y : -1
    if (nx !== ny) return nx < ny ? -1 : 1
  }
  return 0
}

const LITE_3_4_5 = 'lite_3.4.5'
const LITE_3_6_1 = 'lite_3.6.1'
const LITE_3_7_1 = 'lite_3.7.1'

/**
 * 上游 `GameManager.GameLogin()` 的五个 `*.VersionUpdate()`（`docs/save/save-design.md §6`）。
 * **突变 `g`**，返回 `Event[]`（做了什么 / 跳过了什么 —— 跳过项**必须**有 `reason`，不许静默）。
 *
 * 能纯逻辑做完的已做；**需要内容表的**（邮件模板 / 任务表 / 技能学习表）登记为 `skipped`：
 *   · `Mail.VersionUpdate`（版本更新邮件）· `Mission.VersionUpdate`（补支线/日常任务）
 *   · `Pet.VersionUpdate` 的 `lite_3.7.1` 性别修正（需 `GetPetIdentifier("baseId[704]")` 的标识符路由，属 D 线）
 *   · `Pet.VersionUpdate` 末尾的 `CheckNewSkill`（需 `learnInfoList`/秘籍表）
 */
export function applyVersionUpdates(g, from = g?.version ?? '', to = DEFAULT_VERSION) {
  const events = []
  if (!g || typeof g !== 'object') return events
  if (String(from) === String(to)) return events // 上游外层闸门：版本一致 ⇒ 一条都不跑

  // BattleRecord.VersionUpdate —— 直接清空（上游 BattleRecord.cs:26-28）
  if (Array.isArray(g.battleRecordStorage) && g.battleRecordStorage.length) {
    events.push({ kind: 'clearBattleRecord', count: g.battleRecordStorage.length })
  }
  g.battleRecordStorage = []

  // Activity.VersionUpdate —— lite_3.4.5 起不再要 noob_reward（上游 Activity.cs:63-72）
  let actVersion = from
  if (compareVersion(actVersion, LITE_3_4_5) < 0) {
    const before = (g.activityStorage || []).length
    g.activityStorage = (g.activityStorage || []).filter((a) => a.id !== 'noob_reward')
    if (g.activityStorage.length !== before) events.push({ kind: 'dropActivity', id: 'noob_reward' })
    actVersion = LITE_3_4_5
  }

  // Pet.VersionUpdate（上游 Pet.cs:678-706）
  let petVersion = from
  if (compareVersion(petVersion, LITE_3_6_1) < 0) {
    const pets = allPets(g)
    for (const pet of pets) {
      pet.resist = defaultPetResist(pet.id, 0)
      if (pet.backupPet) pet.backupPet.resist = defaultPetResist(pet.backupPet.id, 0)
    }
    if (pets.length) events.push({ kind: 'rebuildResist', count: pets.length })
    petVersion = LITE_3_6_1
  }
  if (compareVersion(petVersion, LITE_3_7_1) < 0) {
    // 上游：`pet.GetPetIdentifier("baseId[704]") > 0 ⇒ basic.gender = 1`（mod 宠专属的数据修正）
    events.push({ kind: 'skipGenderFix704', skipped: true, reason: '需要标识符路由（GetPetIdentifier），归域线 D6/D7' })
    petVersion = LITE_3_7_1
  }
  events.push({ kind: 'skipCheckNewSkill', skipped: true, reason: '需要技能学习表（learnInfoList）；技能补齐归域线 D5/D6' })

  events.push({ kind: 'skipMailVersionUpdate', skipped: true, reason: '需要版本更新邮件模板（内容线）' })
  events.push({ kind: 'skipMissionVersionUpdate', skipped: true, reason: '需要任务表（内容线）' })
  return events
}

/**
 * 上游 `GameLogin` 的跨天分支：`(Now.Date - lastLoginDate.Date).Days > 0` ⇒
 * `Mail/Mission/Activity.DailyLogin()`（登入奖励邮件、日常任务、活动刷新）。
 * ⇒ **跨天判定是本函数的**；三条 `DailyLogin()` 的内容**不在本线**（无内容表）⇒ 只发事件。
 */
export function maybeDailyLogin(g, now = new Date()) {
  const events = []
  const last = parseDateTime(g?.lastLoginDate)
  if (!last) {
    events.push({ kind: 'skipDailyLogin', skipped: true, reason: `lastLoginDate 解析不了（${JSON.stringify(g?.lastLoginDate)}）` })
    return events
  }
  const days = Math.round((startOfLocalDay(now) - startOfLocalDay(last)) / 86400000)
  if (days > 0) {
    events.push({
      kind: 'dailyLogin',
      days,
      applied: true,
      content: false, // 邮件/任务/活动的登入奖励由内容线补（本线无内容表）
      note: 'Mail/Mission/Activity.DailyLogin 的内容待内容线',
    })
  }
  return events
}

const startOfLocalDay = (d) => {
  const x = (d instanceof Date) ? d : new Date(d)
  return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
}

/**
 * 上游 `GameLogin()` 的落盘前收尾：版本迁移 → 写 `version` → `petBag` resize 12 → 跨天 → 刷 `lastLoginDate`。
 * **突变并返回 `g`**（契约见 `docs/save/save-code-map.md §2.4`）。
 * `opts.events`（**追加**）：传一个数组即把 `Event[]` 带出（`repository` 用来报"存档已升级/跨天"）。
 */
export function finishNewGame(g, opts = {}) {
  const { version = DEFAULT_VERSION, now = new Date(), events = null } = opts
  const out = events || []
  out.push(...applyVersionUpdates(g, g?.version ?? '', version))
  g.version = version

  if (!Array.isArray(g.petBag) || g.petBag.length !== PET_BAG_SIZE) {
    const before = Array.isArray(g.petBag) ? g.petBag.length : 0
    const bag = new Array(PET_BAG_SIZE).fill(null)
    for (let i = 0; i < Math.min(before, PET_BAG_SIZE); i++) bag[i] = g.petBag[i]
    g.petBag = bag
    out.push({ kind: 'resizePetBag', from: before, to: PET_BAG_SIZE })
  }

  out.push(...maybeDailyLogin(g, now))
  g.lastLoginDate = formatDateTime(now)
  return g
}

const allPets = (g) => [...(g.petBag || []), ...(g.petStorage || [])].filter((p) => p != null)
