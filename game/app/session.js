// 会话 = 进程单例（编排线 L4 · **XML 单一血统**）
//
// 真值：`docs/orchestration/orchestration-design.md`（OR1/OR4/OR5/OR8）· `docs/orchestration/orchestration-impl.md §2.2/§3.2`
// 人类 2026-10-18 拍板（编排线 ORP3）：**v2/v3 两套 JSON 档直接废弃**，档只认 `saves/save{gid}.xml`（Save 线 `repository`）。
// ORP7 = A：**内存模型**复用 `game/logic/restartSession.js` 的**纯函数**（findPet/addPet/settleRestart/…），
//           但**绝不**调它的 `loadRestartSession`/`saveRestartSession`（旧档读写彻底退场）。
//
// 为什么内存里还要一份 `state`：三个场景（地图/背包/战斗）今天都按 v3 形（trainer/team/box/items）读写；
// 本批**只换数据来源**（GameData ⇄ state 双向投影），渲染与战斗逻辑一行不改（impl §3.2 ①④）。
import * as repository from '../logic/save/repository.js'
import * as RST from '../logic/restartSession.js'
import { unityTables, makeRefPet } from '../logic/save/newgame.js'
import * as CONTENT from './content.js'
import * as skillOps from '../logic/petbag/skill-ops.js'
import { getPetNormalStatus, Status } from '../core/pet/status.js'
import { createRng } from '../core/rng.js'
import { personalityIndex, personalityName } from '../logic/save/codec.js'
import { getTotalExp } from '../core/pet/exp-system.js'

/** 货币 = 道具（`GameData.cs:15-39` 的 `[XmlIgnore]` 属性，实存 `itemStorage`）。 */
export const COIN_ID = 1
export const DIAMOND_ID = 2
const PET_BAG_SIZE = 12
const TEAM_SIZE = 6

export const session = {
  // ── 活跃档（XML 唯一血统）
  gid: null,        // 0..2｜null（null = 未载入）
  storage: null,    // Save 线适配器（**只**由 runtime/bootstrap.js 创建）
  data: null,       // GameData（Save 线 schema）
  state: null,      // 内存模型（v3 形；ORP7=A）
  active: null,     // 视图适配器（形状 = 今天的 `A`）

  // ── 进程级 KV（上游 Player.cs:37 的 private static sceneData ⇒ **不入档**）
  random: null,
  isShootMode: false,

  // ── 导航 / 战斗 / 模态
  // ★MB10「记录最后所在的房间」：这两个格是**房间号**的单一真值（上游 `Player.cs:23-24` 的同名字段）。
  //   **唯一写者 = 地图场景的 `renderMap`** —— 取到该图 Unity 记录才换（照搬 `NormalLoadingScreen.cs:41`
  //   「成功则 lastMapId←当前、currentMapId←新；失败则换图中止」）。战后回图靠它回原房间，别再落回出生点。
  //   ⚠️ 场景态、**不入档**（同上游 Player 单例）：重开浏览器仍从 `currentMapId` 的初值起。
  currentMapId: 70,
  lastMapId: 70,
  // lastPos = 「开工那一刻的房间 + 舞台坐标」，只在切战斗场景前写一笔；rbattle 回图若命中同一房间 ⇒ 读它
  //   把落点原样送回（`#/map?…&spawn=x,y`，复用既有的「一次性落点」口 `TPQ5`）⇒ 回图不再站房间入口（出生点）。
  lastPos: null,      // {mapId, x, y} | null
  mapQuery: null,
  lastResult: null,
  overlay: null,

  // ── 角色外观（M8 · 会话态；`MDB8-g` 起 `mergeBack` 写回根级 `<equip>`，空 = null ⇒ 整段省略）
  //   equipVec = 玩家自定义装备的**物品 ID**（默认装由 L1 `mergeDefaultEquip` 按槽补齐，不混进来）；
  //   mountEquipId = 坐骑**装备物品 ID**（不是 chipBackId）；0 = 未骑乘。
  equipVec: [],
  mountEquipId: 0,
  ridingPetInfo: null,  // 上游骑乘宠物形状（网络态留位；第一版只读 mountEquipId）
  // null = 跟随 DOM `#avSel`（保持 A2b 旧行为）；`APP.actorLook.color(n)` 后固定为 0..11（M8-I6）。
  actorColor: null,
  actorSex: 0,          // 从 `data.gender` 派生；只作兼容输入，计划不消费（ALC6）
  groundMode: 'shadow', // 'shadow' | 'halo'（ALQ9；b3 手测钩子，c 起并入会话态）

  // ── 战后链（MB7 · R-1 / BTI9）
  // battleOrigin = 「为什么开的这一场」：开工门过 ⇒ 写；回图命中同图 ⇒ 读它跑 win/loseHandler、用完清（一次性）。
  battleOrigin: null,   // {mapId, npcId, branchId} | null
  // lastBattle = 上一场的**只读窗口**（取代上游"忘了清空 currentBattle"的承重墙）：rbattleScene 回图前落一笔，
  //               保到下次开工才覆盖（BTI10）；回图后填进 `env.battleState` 供 `battle.` 条件/插值读。
  lastBattle: null,     // {outcome, state, settings, capturePetId?} | null
}

// ─────────────────────────── 读档 / 交档 ───────────────────────────

let meta = null
/** 内容表 + 规则（建默认档、新宠构造都要）。只读一次。 */
async function ensureMeta() {
  if (meta) return meta
  const content = await CONTENT.loadContent()
  const rules = await (await fetch('/game/data/rules.json')).json()
  meta = { tables: unityTables({ pets: content.pets, growth: content.growth, rules }), rules }
  return meta
}

let loading = null, loadingGid = null

/**
 * 内容表（Save 线造默认档 / 构造新宠都要；`newgame.unityTables(...)` 的产物）。
 * **批 C 用**：登录场景投影 3 格时，缺档会让 Save 线**造默认档**（STI11）⇒ 必须把 tables 交下去。
 * @returns {Promise<any>}
 */
export async function ensureTables() { return (await ensureMeta()).tables }

/**
 * 幂等读档。槽位由**场景**给（地图场景取路由 `#/map?slot=N`，无参 ⇒ `0`）；
 * 已载入同一槽 ⇒ 直接复用（战斗刚改过的是同一份内存态）；槽号变了 ⇒ 重读那一槽。
 * 批 C 到位后由 `#/login` 选定槽位 ⇒ 同一条路（或直接 `adopt({gid, data})`）。
 * @returns {Promise<object>} `session.active`
 */
export async function ensureLoaded({ gid = 0 } = {}) {
  const want = Number(gid)
  // 幂等：**同一个槽**已载入就直接复用（战斗刚改过的是同一份内存态）；
  // 槽号变了（`#/map?slot=2`、批 C 换槽）⇒ 重新读那一槽。
  if (session.active && session.gid === want) return session.active
  if (!session.storage) {
    throw new Error('会话未就绪：storage 尚未装配（runtime/bootstrap.js 必须早于读档，见 impl D8）')
  }
  if (loading && loadingGid === want) return loading
  loadingGid = want
  loading = (async () => {
    const { tables } = await ensureMeta()
    // login:true = 上游 GameManager.GameLogin 的收尾（版本迁移 / petBag resize / 跨天）；
    // “进图那一刻”才传（批 C 同样只在进图那次传 true）。
    const data = await repository.load(session.storage, { gid: want, login: true, tables })
    return adopt({ gid: want, data })
  })()
  try {
    return await loading
  } finally {
    if (loadingGid === want) { loading = null; loadingGid = null }
  }
}

/**
 * 交档给会话（批 C 的登录/建号/导入之后调用）。
 * @param {{gid:number, data:object}} p
 * @returns {object} `session.active`
 */
export function adopt({ gid = 0, data }) {
  session.gid = Number(gid)
  session.data = data
  // 外观会话态（`<equip>` 的读侧；`MDB8-g` 前真实档里还没有该块 ⇒ 恒走缺省）。
  const equip = data && data.equip
  session.equipVec = Array.isArray(equip && equip.items)
    ? equip.items.map((v) => Math.trunc(Number(v)) || 0).filter((v) => v > 0)
    : []
  session.mountEquipId = Math.max(0, Math.trunc(Number(equip && equip.mountEquipId) || 0))
  session.ridingPetInfo = null
  session.actorColor = null                 // 新档/换槽 ⇒ 颜色重新跟随 #avSel
  session.actorSex = data && data.gender ? 1 : 0
  session.groundMode = 'shadow'
  session.state = stateFromData(data)
  // 内容表/规则也备好（写回新抓的宠要用 `makeRefPet`）——不 await：`adopt` 由视图同步调用
  if (!meta) ensureMeta().catch((e) => console.error('[session] 内容表加载失败（新宠写回会报错）', e))
  // ⚠️ 关键：不复位 uid 计数器的话，新抓的宠会从 p1 起号，与已载入队伍撞号
  RST.syncUidSeq(session.state)
  session.active = makeActive()
  return session.active
}

/** 未载入态（**不**触碰磁盘）。 */
export function reset() {
  session.gid = null
  session.data = null
  session.state = null
  session.active = null
  session.lastResult = null
  session.overlay = null
  session.random = null
  session.battleOrigin = null
  session.lastBattle = null
  session.lastPos = null          // ★MB10：换档/重登 ⇒ 「回原房间+原位置」的那笔作废（房间号 currentMapId 保持，同上游 Player 单例）
  session.equipVec = []
  session.mountEquipId = 0
  session.ridingPetInfo = null
  session.actorColor = null
  session.actorSex = 0
  session.groundMode = 'shadow'
}

// ─────────────────────────── 投影：GameData → 内存 state ───────────────────────────

function memPet(xml, n) {
  if (!xml) return null
  const id = Number(xml.id)
  const level = Math.max(1, Math.trunc(Number(xml.exp?.level ?? 1)) || 1)
  const rawHp = Number(xml.currentStatus?.hp)
  const m = {
    uid: 'p' + n,
    petId: id,
    level,
    // v3 的 exp = **累计经验**（`awardExpRestart` 里 `pet.exp += share` 后按 totalExp 算等级）⇒ 直接对 XML `totalExp`
    exp: Math.max(0, Math.trunc(Number(xml.exp?.totalExp ?? 0)) || 0),
    hp: Number.isFinite(rawHp) ? Math.max(0, Math.trunc(rawHp)) : Math.round(CONTENT.restartHpMax(id, level)),
    // 性格：**内存 GameData 里已是索引 0..54**（codec 的 'per' 类型读侧转过）⇒ 直接取用，别再转。
    //   改性格（petbag 操作列）写这个字段，落盘由 petXmlOf 同步回 `basic.personality`（写侧由 codec 转回中文名）。
    personality: persIndex(xml.basic?.personality),
    // 收藏（上游 Pet.cs:43 `record.GetRecord("elite", false)`：recordDict 里的一个字符串键，不是容器）。
    elite: recordEliteOf(xml),
  }
  // 保留对 XML 子树的引用 ⇒ 写回时覆盖 level/totalExp/hp（+ 改过的性格/收藏），其余（技能/天赋/皮肤…）原样不动（保真优先）
  Object.defineProperty(m, '__xml', { value: xml, enumerable: false, writable: true, configurable: true })
  return m
}

/** 性格索引钳位（内存 GameData 的 `basic.personality` 是 0..54 索引；越界/缺省按 0 = 实干）。 */
function persIndex(v) {
  const n = Math.trunc(Number(v) || 0)
  return n >= 0 && n <= 54 ? n : 0
}
/** `record.recordDict` 的 `elite` 键（上游 C# `bool.ToString()` = "True"/"False"；读侧宽容大小写/1）。 */
function recordEliteOf(xml) {
  const dict = xml && xml.record && Array.isArray(xml.record.recordDict) ? xml.record.recordDict : []
  const e = dict.find((x) => x && x.key === 'elite')
  if (!e) return false
  const v = String(e.value ?? '').trim().toLowerCase()
  return v === 'true' || v === '1'
}
/** 收藏写入（上游 `PetRecord.SetRecord(key, value)` ⇒ `value.ToString()`）：只动 elite 一个键。 */
function setRecordElite(xml, on) {
  const rec = xml.record || (xml.record = {})
  const dict = Array.isArray(rec.recordDict) ? rec.recordDict : (rec.recordDict = [])
  const entry = { key: 'elite', value: on ? 'True' : 'False' }
  const i = dict.findIndex((e) => e && e.key === 'elite')
  if (i >= 0) dict[i] = entry
  else dict.push(entry)
}

/**
 * 后备槽（`petBag[6..11]`）的原位记录 —— **保真用**：上游 `petBag` 是 12 格，前 6 格出战、
 * 后 6 格是「待命」，其余在 `petStorage`。不记原位的话，一存就会把 `petStorage` 的前 6 只**搬进** `petBag[6..11]`
 * （形状变了、非逐字节保真）。抓到的/换过位的新宠没有原位 ⇒ 先补空的后备槽，剩下的进 `petStorage`。
 */
function markBagSlot(m, i) {
  if (i >= TEAM_SIZE) {
    if (Object.prototype.hasOwnProperty.call(m, '__bagSlot')) m.__bagSlot = i
    else Object.defineProperty(m, '__bagSlot', { value: i, enumerable: false, writable: true, configurable: true })
  }
  return m
}

function itemNum(data, id) {
  const it = (data.itemStorage || []).find((x) => Number(x.id) === id)
  return it ? Math.max(0, Math.trunc(Number(it.num) || 0)) : 0
}

// 商店限购 = 上游正本 `Activity("shop")` 键值袋（activityStorage[id='shop']，key=itemId、value=已买数）。
// 这笔账此前由商店线自建在 `state.shop.bought`、**不落盘**（读档归零，见 docs/view/panel/shop CB3）。
// 收编口径：**袋 = 唯一真源** —— 读档把该袋投影进 `state.shop.bought`（数），存盘把 `state.shop.bought` 写回该袋（串）；
// `game/logic/item/shop.js` 一行不改（它照旧读写 `state.shop.bought`），落盘/读盘只经本投影层。⚠️ 只动 'shop' 一只袋，**别的活动袋不碰**（地图线 setActivity 写的袋原样保留）。
function shopFromData(data) {
  const bag = (data.activityStorage || []).find((x) => x && x.id === 'shop')
  const bought = {}
  for (const e of (bag && bag.data) || []) {
    if (!e || e.key == null) continue
    const n = Math.trunc(Number(e.value))
    if (Number.isFinite(n) && n > 0) bought[e.key] = n
  }
  return { bought }
}
function writeShopToData(data, st) {
  const bought = (st.shop && st.shop.bought) || {}
  const list = data.activityStorage || (data.activityStorage = [])
  let bag = list.find((x) => x && x.id === 'shop')
  if (!bag) { bag = { id: 'shop', data: [] }; list.push(bag) }
  // 值恒 string（否则 schema walk 拒整棵 SAVE_INVALID，同 mapScene setActivity 口径）；0/负 = 未买，不落。
  bag.data = Object.entries(bought)
    .map(([key, n]) => ({ key: String(key), value: String(Math.max(0, Math.trunc(Number(n) || 0))) }))
    .filter((e) => Number(e.value) > 0)
}

/** `GameData` → 内存 `state`（v3 形：trainer / team / box / items / dex / evolve / battle）。 */
function stateFromData(data) {
  const team = []
  const box = []
  let n = 0
  const bag = data.petBag || []
  for (let i = 0; i < bag.length; i++) {
    if (!bag[i]) continue
    const m = memPet(bag[i], ++n)
    if (i < TEAM_SIZE) team.push(m)
    else box.push(markBagSlot(m, i))
  }
  for (const p of data.petStorage || []) {
    if (!p) continue
    box.push(memPet(p, ++n))
  }
  const items = (data.itemStorage || [])
    .filter((x) => Number(x.id) !== COIN_ID && Number(x.id) !== DIAMOND_ID)
    .map((x) => ({ id: Number(x.id), count: Math.max(0, Math.trunc(Number(x.num) || 0)) }))
  return {
    v: 3,
    trainer: {
      name: String(data.nickname || ''),
      // XML 没有“训练家等级” ⇒ 取队首宠等级（impl §3.2 ① 的**推断件**，已登记偏差）
      level: team[0]?.level ?? 1,
      coins: itemNum(data, COIN_ID),
      diamonds: itemNum(data, DIAMOND_ID),
    },
    team,
    box,
    items,
    // 限购计数 = 从 `Activity("shop")` 袋投影（见 shopFromData；上游正本、现落盘）
    shop: shopFromData(data),
    // XML 无图鉴（人类 2026-10-18：dex 直接丢）⇒ 恒空；HUD 的“图鉴 N 抓到”片段因此不显示
    dex: {},
    // 进化未接（同轮拍板 evolve.pending 丢）⇒ 结算里的 applyEvolutionRestart 恒 no-op
    evolve: { pending: [] },
    battle: null,
  }
}

// ─────────────────────────── 写回：内存 state → GameData ───────────────────────────

// ── 进化落盘（人类 2026-10-19 拍板：照上游 `new Pet(evolveId, original)` 写全）──
// `applyEvolutionRestart` 只改内存 `pet.petId`；档里 `<id>` 还是旧形态 ⇒ 读档 `memPet` 读回旧形态，
// 进化只活一局。这里在**写回时**比对：内存 petId ≠ 档里 `<id>` = 这只宠进化过 ⇒ 把整棵 Pet 子树搬到新形态。
// 收口在 `petXmlOf` 这一个 choke point：不论进化来自结算升级还是将来的地图 `evolvePet`，都走这一条。
// 写哪几个值（上游 `Pet.cs:212-233` 逐行对应）：
//   `<id>` + `basic@id`/`feature@id`/`exp@id`/`talent@id`/`skills@id`/`resist.id` = 新形态 id
//   （上游每个子结构都用 `new Xxx(evolvePetId, …)` 重建）；`ui@id` = 新形态皮肤、`ui@baseId` = 种族。
// ⚠️ 幂等：搬完 `x.id === m.petId`，下次写回不再进本分支。
// `currentStatus` 的**六维按新形态重算**（上游 `new Status(normalStatus)`：新形态 baseStatus + 个体值 iv/ev/性格）。
// `basic` 的 **height/weight 按新形态重掷**（上游 `new PetBasic(evolvePetId, …)`：`base + Random.Range(0,6)`，闭区间）。
// ⚠️ 上游**不写** `backupPet`（`Pet.cs:212-233` 逐行可查；真机档 0 命中）⇒ 本函数也不写，退化链走 `GetEvolveChain` 现算。
/** uid（`p<序号>`）→ 稳定数值，只用于给进化重掷派生种子（要的是**同一条宠每次都一样**，不是随机）。 */
const uidHash = (uid) => {
  const n = Number(String(uid ?? '').replace(/^p/, ''))
  return Number.isFinite(n) ? n : 0
}

function applyEvolutionXml(x, m) {
  const from = Math.trunc(Number(x.id))
  const to = Math.trunc(Number(m.petId))
  x.id = to
  for (const k of ['basic', 'feature', 'exp', 'talent', 'skills']) {
    if (x[k] && typeof x[k] === 'object') x[k].id = to
  }
  if (x.resist && typeof x.resist === 'object') x.resist.id = to // resist 的 id 是**元素**不是属性
  // 六维 + 身高体重 = 按新形态重算（人类 2026-10-19 拍板：照上游，搬旧值 = 进化后数值偏旧）。
  // iv/ev/personality 是**个体值**，从档里原样取（不属于表侧）—— 与 restartHpMax 硬写的 iv:0 是两套口径；
  // 这里用档里的真值，已用真机档 6/6 只宠精确复现 currentStatus。
  const base = CONTENT.restartBaseOf(to)
  if (base) {
    const t = x.talent || {}
    const ev = t.ev || {}
    const iv = Math.trunc(Number(t.iv) || 0)
    const per = personalityIndex(x.basic && x.basic.personality)
    const st = getPetNormalStatus(
      m.level | 0,
      Status.of6(base.baseStatus.atk, base.baseStatus.mat, base.baseStatus.def, base.baseStatus.mdf, base.baseStatus.spd, base.baseStatus.hp),
      iv,
      Status.of6(Number(ev.atk) || 0, Number(ev.mat) || 0, Number(ev.def) || 0, Number(ev.mdf) || 0, Number(ev.spd) || 0, Number(ev.hp) || 0),
      per,
    )
    // 上游是 `new Status(normalStatus)` = 满状态；但战斗后 hp 是**已损耗**的 ⇒ 夹到上限内保留战果
    x.currentStatus = {
      ...(x.currentStatus || {}),
      atk: st.atk, mat: st.mat, def: st.def, mdf: st.mdf, spd: st.spd,
      hp: Math.min(st.hp, Math.max(0, Math.trunc(m.hp))),
    }
    // 身高体重 = 新形态基值 + rand(0,5)（上游 `Random.Range(0, 6)` 是**闭区间** ⇒ 上界 +5）
    // 种子由 (新形态, 旧形态, uid) 派生 ⇒ **幂等**：同一只宠反复落盘掷出同一个身高体重，不抖动。
    const rng = createRng((to * 2654435761 + from * 40503 + uidHash(m.uid)) | 0)
    if (x.basic && typeof x.basic === 'object') {
      x.basic.height = base.baseHeight + rng.nextInt(0, 5)
      x.basic.weight = base.baseWeight + rng.nextInt(0, 5)
    }
  }
  const ui = CONTENT.restartUiOf(to)
  if (x.ui && typeof x.ui === 'object' && ui) {
    x.ui.id = ui.skinId
    x.ui.baseId = ui.baseId
  }
  // 技能（人类 2026-10-19 拍板：保留旧招 + 补学新形态该学的 = 照上游 `new PetSkill(evolvePetId, level, original)`）：
  // 旧招全留在 `own`，再按**新形态**的技能表和当前等级补学；`normal` 沿用旧的（滤必杀/去重/补空到 4）；
  // `super` 走 buildModel 的「档里非 0 才用，否则取已学必杀里第一个」—— 与技能面板同一台机器，两处口径不会打架。
  const model = skillOps.buildModel(petSkillsOf(m), m.level | 0, CONTENT.skillLearnOf(to), CONTENT.skillView)
  x.skills = {
    ...(x.skills || {}),
    id: to,
    ownSkillId: model.own,
    normalSkillId: model.normal,
    superSkillId: model.super,
  }
}

function petXmlOf(m) {
  if (m.__xml) {
    const x = m.__xml
    // 改性格同步（索引直写；中文名由 codec 写侧 'per' 转）**先于**进化分支：进化重算六维要读新性格。
    //   **只在真改过时写**（保真：不给每只宠平白多一次写入）。
    if (Number.isFinite(m.personality) && x.basic && typeof x.basic === 'object') {
      const cur = Math.trunc(Number(x.basic.personality) || 0)
      if (cur !== m.personality) x.basic.personality = m.personality
    }
    // 进化过（内存 petId ≠ 档里 `<id>`）⇒ 先把形态与技能搬到新形态，再写常规三字段
    if (Number(x.id) !== Number(m.petId)) applyEvolutionXml(x, m)
    x.exp = x.exp || {}
    x.exp.level = Math.trunc(m.level)
    x.exp.totalExp = Math.max(0, Math.trunc(m.exp))
    x.currentStatus = { ...(x.currentStatus || {}), hp: Math.max(0, Math.trunc(m.hp)) }
    // 收藏同步（内存 elite → recordDict 的 elite 键；只在翻转过时写，未收藏的宠不添键）
    if (typeof m.elite === 'boolean' && m.elite !== recordEliteOf(x)) setRecordElite(x, m.elite)
    return x
  }
  // 新抓的宠（`makeRestartPet` 只有 5 个字段）⇒ 造一棵真 XML Pet 子树
  if (!meta) throw new Error('会话未就绪：写回新宠需要内容表（ensureMeta）')
  const x = makeRefPet(m.petId, m.level, { tables: meta.tables, now: new Date() })
  x.exp.level = Math.trunc(m.level)
  x.exp.totalExp = Math.max(0, Math.trunc(m.exp))
  x.currentStatus = { ...(x.currentStatus || {}), hp: Math.max(0, Math.trunc(m.hp)) }
  Object.defineProperty(m, '__xml', { value: x, enumerable: false, writable: true, configurable: true })
  return x
}

// ── 宠的技能（精灵技能面板 · 换位读写；真值 docs/view/panel/petbag/skill-panel-design.md §5.1/§5.3）──
// 档里 PetSkill 的三个字段就在 __xml 子树上（save-xml-spec.md §2.7）⇒ 只读三字段、只写三字段，保真优先。
export function petSkillsOf(pet) {
  const s = pet && pet.__xml ? pet.__xml.skills : null
  return {
    own: Array.isArray(s?.ownSkillId) ? s.ownSkillId.map((x) => Number(x) | 0) : [],
    normal: Array.isArray(s?.normalSkillId) ? s.normalSkillId.map((x) => Number(x) | 0) : [],
    super: Number(s?.superSkillId || 0) | 0,
  }
}

export function applyPetSkills(pet, { own, normal, super: superId }) {
  if (!pet) return
  const x = petXmlOf(pet)          // 新抓的宠也在这里造出子树
  x.skills = {
    ...(x.skills || {}),
    id: x.skills?.id ?? pet.petId, // <skills id="…"> 是属性，丢了写回就变形
    ownSkillId: (own || []).map((v) => Number(v) | 0),
    normalSkillId: (normal || []).map((v) => Number(v) | 0),  // 声明 int[4]，写满 4 个（含 0）
    superSkillId: Number(superId || 0) | 0,
  }
}

// ── 个体值 / 经验档案（精灵背包「能力区六维」「升级所需经验」的读数；上游读 pet.talent/pet.basic/pet.exp）──
// 六维/血条上限必须吃**档里真值**：petConfig/restartHpMax 的默认口径是中性（iv0/ev0/性格0），
// 而真机档 6/6 只宠的 currentStatus 就是用真 iv/ev/性格算的（见 applyEvolutionXml 同款公式）⇒ 显示中性值 = 显示错数。
export function petProfileOf(pet) {
  const x = pet && pet.__xml
  const t = (x && x.talent) || {}
  const e = t.ev || {}
  return {
    iv: Math.trunc(Number(t.iv) || 0),
    evStorage: Math.trunc(Number(t.evStorage) || 0),
    // Status 构造吃 6 元数组（atk/mat/def/mdf/spd/hp，= Status.cs 列序）
    ev: [Number(e.atk) || 0, Number(e.mat) || 0, Number(e.def) || 0, Number(e.mdf) || 0, Number(e.spd) || 0, Number(e.hp) || 0],
    // 性格取**内存索引**（改性格后即时生效，不等存盘）；新抓的宠（无 __xml）回落档里值（同样是索引）
    personality: pet && Number.isFinite(pet.personality) ? pet.personality : persIndex(x?.basic?.personality),
  }
}

// 升级所需经验（上游 PetExp.levelUpExp = GetTotalExp(lv+1) − clamp(totalExp, 0, GetTotalExp(lv+1)−1)；
// PetInfoView 在 level>=maxLevel 时传 0 ⇒ 视图画 "--"）。maxLevel：档里 fixedMaxLevel 优先，表侧 20001..30000⇒105。
export function petExpInfoOf(pet) {
  const x = pet && pet.__xml
  const level = Math.max(1, Math.trunc(Number(pet?.level ?? 1)) || 1)
  const totalExp = Math.max(0, Math.trunc(Number(pet?.exp ?? 0)) || 0)
  const fixedMax = x && x.exp ? Math.trunc(Number(x.exp.fixedMaxLevel) || 0) : 0
  const expType = CONTENT.restartExpTypeOf(pet?.petId)
  const maxLevel = fixedMax > 0 ? fixedMax : CONTENT.restartMaxLevelOf(pet?.petId)
  const atNext = getTotalExp(level + 1, expType)
  const expToNext = level >= maxLevel ? 0 : atNext - Math.max(0, Math.min(totalExp, atNext - 1))
  const evo = CONTENT.restartEvolveOf(pet?.petId) || []
  return { level, totalExp, expType, maxLevel, expToNext, evolveLevel: evo.length ? evo[0].at : 0 }
}

// 背包面板的**显示读数**（HUD 六项 + 基础信息行；上游 PetDemoView/PetInfoView 读的全是这些字段）。
// 特性/纹章的**表 lookup 归 L2**（装配层拿 id 来问 content）；这里只交档里的原始 id/值。
export function petReadoutOf(pet) {
  const x = pet && pet.__xml
  const b = (x && x.basic) || {}
  const f = (x && x.feature) || {}
  const t = (x && x.talent) || {}
  return {
    nickname: typeof b.name === 'string' ? b.name : '',   // 昵称（空 = 用种族名，上游 Pet.name 同口径）
    gender: Math.trunc(Number(b.gender) || 0),
    height: Math.trunc(Number(b.height) || 0),
    weight: Math.trunc(Number(b.weight) || 0),
    // 相遇时间直接给**显示格式**（上游 PetInfoView.SetGetPetDate = yyyy/MM/dd）—— 格式化归读数层，视图只画
    getPetDate: b.getPetDate ? String(b.getPetDate).slice(0, 10).replace(/-/g, '/') : '',
    featureId: Math.trunc(Number(f.featureId) || 0),
    emblemId: Math.trunc(Number(f.emblemId) || 0),
    hasEmblem: f.hasEmblem !== false,                      // 上游 PetFeature 字段初值 = true
    iv: Math.trunc(Number(t.iv) || 0),
    ev: [Number(t.ev?.atk) || 0, Number(t.ev?.mat) || 0, Number(t.ev?.def) || 0, Number(t.ev?.mdf) || 0, Number(t.ev?.spd) || 0, Number(t.ev?.hp) || 0],
    evStorage: Math.trunc(Number(t.evStorage) || 0),
    kizuna: recordKizunaOf(x),                            // 好感度（上游 Pet.cs:43 record 键，默认 0）
  }
}

/** `record.recordDict` 的 `kizuna` 键（上游 Pet.kizuna = record.GetRecord("kizuna", 0) 夹到 min/max）。 */
function recordKizunaOf(xml) {
  const dict = xml && xml.record && Array.isArray(xml.record.recordDict) ? xml.record.recordDict : []
  const e = dict.find((x) => x && x.key === 'kizuna')
  const n = Math.trunc(Number(e && e.value))
  return Number.isFinite(n) ? n : 0
}

function mergeBack() {
  const st = session.state
  const data = session.data
  const bag = new Array(PET_BAG_SIZE).fill(null)
  st.team.slice(0, TEAM_SIZE).forEach((p, i) => { bag[i] = petXmlOf(p) })
  // 后备槽：**先回原位**（`__bagSlot`），没原位的（新抓的/换过位的）再补空槽；余下的进 `petStorage`
  const rest = []
  for (const p of st.box) {
    const i = p.__bagSlot
    if (i != null && i >= TEAM_SIZE && i < PET_BAG_SIZE && bag[i] === null) {
      bag[i] = petXmlOf(p)
    } else if (bag.indexOf(null, TEAM_SIZE) >= 0) {
      const j = bag.indexOf(null, TEAM_SIZE)
      bag[j] = petXmlOf(p)
      markBagSlot(p, j)
    } else {
      rest.push(p)
    }
  }
  data.petBag = bag
  data.petStorage = rest.map(petXmlOf)

  // 货币 = 道具 id 1/2；其余道具按内存顺序写回（`{id, count}` → `{id, num}`）
  const coinOf = (id, fallback) => {
    const hit = (st.items || []).find((x) => Number(x.id) === id)
    return hit ? Math.max(0, Math.trunc(Number(hit.count) || 0)) : fallback
  }
  const coins = coinOf(COIN_ID, st.trainer?.coins ?? 0)
  const diamonds = coinOf(DIAMOND_ID, st.trainer?.diamonds ?? 0)
  data.itemStorage = [
    { id: COIN_ID, num: coins },
    { id: DIAMOND_ID, num: diamonds },
    ...(st.items || [])
      .filter((x) => Number(x.id) !== COIN_ID && Number(x.id) !== DIAMOND_ID)
      .map((x) => ({ id: Number(x.id), num: Math.max(0, Math.trunc(Number(x.count) || 0)) })),
  ]
  st.trainer = { ...(st.trainer || {}), coins, diamonds }

  // 限购计数写回 `Activity("shop")` 袋（只动这一只袋；别的活动袋由地图线 setActivity 直接维护，此处不碰）
  writeShopToData(data, st)

  // ★M8-g：外观（我方扩展 `<equip>`，`docs/save/save-xml-spec.md §2.22`）
  // 空 = null ⇒ codec 的 `omitNull` 整段省略（旧档 round-trip 不会凭空多出 `<equip>`）。
  data.equip = (session.equipVec.length || session.mountEquipId)
    ? { items: session.equipVec.slice(), mountEquipId: session.mountEquipId }
    : null
}

/** 落盘（粒度 = 变更点同步写、不节流；人类 2026-10-18 ⇒ ORP5）。 */
export async function save() {
  if (!session.active) return
  await ensureMeta()
  mergeBack()
  await repository.save(session.storage, session.gid, session.data)
}

// ─────────────────────────── 视图适配器（形状 = 今天的 `A`） ───────────────────────────

function makeActive() {
  const st = session.state
  return {
    isRestart: true,               // XML = 重启血统
    state: st,
    // 场景同步调用；失败**不许静默**，但也不许把 UI 打断（写盘是副作用）
    save: () => { save().catch((e) => console.error('[session] 落盘失败', e)) },
    hpMax: (p) => CONTENT.restartHpMax(p.petId, p.level),
    // 名字（上游 Pet.name：昵称 basic.name 优先，空则种族名）—— 空串/缺省都回落种族名
    nameOf: (p) => (p && p.__xml && typeof p.__xml.basic?.name === 'string' && p.__xml.basic.name)
      || CONTENT.restartNameOf(p.petId) || ('id' + p.petId),
    swfIdOf: (p) => CONTENT.swfIdOf(p.petId),
    // 精灵技能面板的读写接缝（只碰 __xml.skills 的三个字段，落盘仍走 save()）
    petSkillsOf: (p) => petSkillsOf(p),
    applyPetSkills: (p, s) => applyPetSkills(p, s),
    // 背包面板的个体值/经验读数（真值在 __xml.talent/basic/exp；性格读内存索引，改完即时生效）
    petProfile: (p) => petProfileOf(p),
    petExpInfo: (p) => petExpInfoOf(p),
    // 背包面板的显示读数（HUD 六项 + 基础信息行；表 lookup 归装配层问 content）
    petReadout: (p) => petReadoutOf(p),
    consumeItem: (id, n = 1) => RST.consumeItem(st, id, n),
    addItem: (id, n = 1) => RST.addItem(st, id, n),
  }
}

// ─────────────────────────── 会话 API（R3 的值 / OR4 / OR8） ───────────────────────────

/** `APP.lastResult` 的一次性消费（OR4）。 */
export function takeResult() {
  const r = session.lastResult
  session.lastResult = null
  return r
}

/** R3：`player.random[old]`（上游 `Identifier.cs:15-26`）。 */
export function readRandom() { return session.random }

/** R3：`player.random[new]`（先掷再写，调用方负责掷点；今天由内核的 `setPlayerRandom` 给值）。 */
export function writeRandom(v) { session.random = Number(v) | 0 }

/** R3：`player.<key>`（只有 `shoot`/`achievement` 两个真键，`Identifier.cs:66-74`）。 */
export function readPlayerData(key) {
  if (!session.data) return null
  if (key === 'shoot') return session.isShootMode ? 1 : 0
  if (key === 'achievement') return Math.trunc(Number(session.data.achievement) || 0)
  return null
}

const overlaySubs = new Set()

/** OR8：单值模态；置值/归零**只**经这里。本批只立字段、不接消费者（ORP6）。 */
export function setOverlay(v) {
  session.overlay = v == null ? null : String(v)
  for (const fn of overlaySubs) {
    try { fn(session.overlay) } catch (e) { console.error('[session] overlay 订阅者抛错', e) }
  }
}

/** @returns {() => void} 取消订阅 */
export function subscribeOverlay(fn) {
  overlaySubs.add(fn)
  return () => overlaySubs.delete(fn)
}

// ⚠️ **这里曾有 `export const active = () => session.active`（2026-10-18 删除）** —— 它是本轮两次
//    "黑屏 / TypeError"的元凶：这个**导出函数**与 `session` 对象上的**字段** `active` **同名**，
//    于是任何 `import * as session` 的地方，`session.active` 读到的是**这个函数**（永远为真、且没有 `.state`），
//    `rbattleScene` 因此跳过读档并 `session.active.state.team` 抛 `undefined`。**不再提供这种别名**：
//    ⚠️ **用法纪律（写新代码请照此）**：
//      ① 要读写**字段** ⇒ `import { session } from './session.js'`，用 `session.gid` / `session.active` / `session.storage`…
//      ② 要调**动作** ⇒ 点名 import 函数：`import { ensureLoaded, adopt, save } from './session.js'`。
//      ③ **不要** `import * as session` 再读字段（命名空间里只有导出名，没有对象字段，且容易与同名函数撞车）。
