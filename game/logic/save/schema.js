// L1 · 存档文档的**数据形状与常量**（零 XML 知识 / 零 DOM / 零 app import）。
//
// 真值：
//   · 节点树/字段表 —— `docs/save/save-xml-spec.md` §1/§2（本文的模型 = 该表的 1:1 镜像）
//   · 接口契约     —— `docs/save/save-code-map.md` §2.2（`PET_BAG_SIZE`/`fresh`/`clone`/`validate`/`keyOf`）
//   · 初始档配方   —— `docs/save/save-design.md` §5（= 上游 `GameData.GetDefaultData`）
//   · 默认值来源   —— 上游 `SettingsData.cs` 构造器 / `YiTeRogueData.cs` 字段初始化器（逐项同源）
//
// 纪律（`docs/save/save-code-map.md` §5）：本文件**不** import 本目录其余文件、不 import app/view。
// 本文只回答「一份存档里有什么、默认是什么、什么时候算坏」；**字节口径归 `codec.js`**。

// ─────────────────────────── 常量 ───────────────────────────

/** `petBag` 定长。前 6 = 应战编队、后 6 = 候选编队（换队 = swap `[i]`↔`[6+i]`）。 */
export const PET_BAG_SIZE = 12

/** 存档槽数：`saves/save{0,1,2}.xml`（人类 2026-10-18 拍板「XML `saves/save{id}.xml`」+ 3 槽）。 */
export const MAX_SAVE_COUNT = 3

/** 货币 = 道具：`GameData.coin`/`diamond` 是 `[XmlIgnore]`，实存 `itemStorage` 的 id 1/2。 */
export const COIN_ID = 1
export const DIAMOND_ID = 2

/** `<version>` 的目标值。真值以**内容表** `_version` 为准（`newgame.js` 允许覆盖）。 */
export const DEFAULT_VERSION = 'lite_4.9.2'

/** `Status` 列序 = 存档列序（**hp 在末位**，与官方 AS3 的 `atk/spa/def/spd/spe/hp` 不同）。 */
export const STATUS_COLS = ['atk', 'mat', 'def', 'mdf', 'spd', 'hp']

/** 初始 6 宠（`GetDefaultData` 的 `new Pet(id, 10)`，id = **物种 id**）。 */
export const STARTER_PET_IDS = [1, 4, 7, 10001, 10004, 10007]

/** 初始道具（`GetDefaultData(initCoin, initDiamond)`；coin/diamond 可配，见 `newgame.defaultGameData`）。 */
export const STARTER_ITEM_ID = 10237

/** `GameData.petBag` 初始即定长 12（不是 resize 痕迹；resize 只对历史短档，见 `docs/save/save-xml-spec.md §6.5`）。 */

/**
 * `Personality` 中文枚举 —— **顺序 = 上游 `PetBasic.cs` 的枚举声明序**，序列化成中文名。
 * ⚠️ 分配规律（`(Personality)Random.Range(0,25)` ⇒ 只落在前 5 行）：归域线 D6 待拍板①，
 * 本文件只忠实照抄表，不替它拍板。
 */
export const PERSONALITIES = [
  '实干', '固执', '孤独', '调皮', '勇敢', // 物攻+
  '保守', '害羞', '稳重', '马虎', '冷静', // 特攻+
  '大胆', '顽皮', '坦率', '无虑', '悠闲', // 物防+
  '沉着', '慎重', '温顺', '浮躁', '狂妄', // 特防+
  '胆小', '开朗', '急躁', '天真', '认真', // 速度+
  '豪放', '含蓄', '直率', '叛逆', '谦逊', '孤傲',
  '机灵', '古板', '古怪', '狂野', '残忍', '暴虐',
  '严肃', '随和', '清纯', '自私', '大方', '仁慈',
  '忧郁', '颓废', '元气', '狡猾', '憨厚', '温柔',
  '热情', '冷淡', '活泼', '高雅', '粗俗', '可爱',
]

// 55 项是**表的完整性**（写少一项 ⇒ 序号整体错位 ⇒ 存档语义错），故在模块载入时自检。
if (PERSONALITIES.length !== 55) {
  throw new Error(`PERSONALITIES 应为 55 项（上游 Personality 枚举），实为 ${PERSONALITIES.length}`)
}

/** `SettingsData` 字段序 = 声明序（`docs/save/save-xml-spec.md §2.16`）。 */
export const SETTINGS_FIELDS = [
  'useRobotAsPlayer', 'BGMVolume', 'UIVolume',
  'battleBGMVolume', 'battleSEVolume', 'battleAnimSpeed',
  'shakeWhenBigDamage', 'flashWhenBigDamage', 'autoHealAfterBattle',
  'initMapId', 'ruleId', 'comboDamageDisplayMode', 'wildNpcBubbleStyle',
]

// ─────────────────────────── 日期值的文本口径 ───────────────────────────
//
// ⚠️ 口径归属：`docs/save/save-code-map.md §2.3` 把 `formatDateTime`/`parseDateTime` 记在 `codec.js` 名下；
// 这里挪进 `schema.js` 的唯一理由是——**日期是「字段的形状」而不是「XML 的写法」**，且 `fresh()` 自己就要造日期，
// 而 schema **不许** import 本目录其余文件。`codec.js` 原样**再导出**这两个函数 ⇒ 文档记的对外面没有变。
//
// .NET 口径：`XmlSerializer` 写 `DateTime` 用 round-trip 格式 `yyyy-MM-ddTHH:mm:ss.fffffffK`
// （**7 位小数** + 本地偏移）。JS 的 `Date` 只有毫秒 ⇒ 我们造的新时间戳 = 3 位真值 + 4 个 0，
// 长度/形状与真档一致；**读**时一律保留原文本（见 `codec.js` 的 `dt` 标量），故 round-trip 不丢精度。

/** `Date` → `2026-08-28T16:39:11.9750000+08:00`（7 位小数 + 本地偏移）。 */
export function formatDateTime(d) {
  const dt = (d instanceof Date) ? d : new Date(d)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const off = -dt.getTimezoneOffset() // 分钟；东八区 = 480
  const sign = off < 0 ? '-' : '+'
  const oh = pad(Math.floor(Math.abs(off) / 60))
  const om = pad(Math.abs(off) % 60)
  const date = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`
  return `${date}T${time}.${pad(dt.getMilliseconds(), 3)}0000${sign}${oh}:${om}`
}

/** ISO 文本 → `Date`（毫秒精度）；解析不了返回 `null`（**不抛** —— 读侧要宽容）。 */
export function parseDateTime(s) {
  const t = Date.parse(String(s))
  return Number.isNaN(t) ? null : new Date(t)
}

// ─────────────────────────── 默认值工厂 ───────────────────────────

/** 六维零值（`Status.zero`）。 */
export function zeroStatus() {
  return { atk: 0, mat: 0, def: 0, mdf: 0, spd: 0, hp: 0 }
}

/** `SettingsData` 构造器逐项（上游 `SettingsData.cs:20-31`）。 */
export function defaultSettingsData() {
  return {
    useRobotAsPlayer: true,
    BGMVolume: 10,
    UIVolume: 10,
    battleBGMVolume: 10,
    battleSEVolume: 10,
    battleAnimSpeed: 1,
    shakeWhenBigDamage: true,
    flashWhenBigDamage: true,
    autoHealAfterBattle: false,
    initMapId: -70,
    ruleId: 0,
    comboDamageDisplayMode: 0,
    wildNpcBubbleStyle: 'white',
  }
}

/** 易宠塔（`YiTeRogueData`）字段初始化器逐项（上游 `YiTeRogueData.cs:23-33`）。 */
export function defaultYiteRogueData() {
  return {
    mode: 0,
    isEnd: false,
    petBag: new Array(6).fill(null),
    buffStatus: zeroStatus(),
    buffIds: [],
    itemBag: [],
    floor: 0,
    nextPos: 2147483647, // int.MaxValue（= 未定）
    trace: [],
    eventMap: [],
  }
}

/** 宠的 `record` 初值（上游 `PetRecord()`）。 */
export function defaultPetRecord() {
  return { winFightNum: 0, loseFightNum: 0, recordDict: [] }
}

/** 宠的 `feature` 初值（上游 `PetFeature(id, hasEmblem=true)`）。 */
export function defaultPetFeature(id) {
  return { id, hasEmblem: true, featureId: 0, emblemId: 0, afterwardBuffIds: [] }
}

/** 宠的 `resist` 初值（上游 `PetResist(id)`；`lockState` 依星级 ⇒ 6★ 起为 0，其余 -1）。 */
export function defaultPetResist(id, star = 0) {
  return {
    id,
    lockState: Number(star) < 6 ? -1 : 0,
    criResist: 0,
    fixResist: 0,
    perResist: 0,
    abnormalResist: { key: 0, value: 0 },
    unhealthyResist: { key: 0, value: 0 },
  }
}

/**
 * 「空档」（`InitGameData()` 原样，**无宠无道具**）：`GameData.GetDefaultData` 的第一步。
 * ⚠️ 与 `newgame.defaultGameData` 不同 —— 后者在此之上放 6 宠 + 初始道具 + Mission(1)。
 */
export function fresh(now = new Date()) {
  const stamp = formatDateTime(now)
  return {
    version: '',
    gender: false,
    nickname: '',
    firstLoginDate: stamp,
    lastLoginDate: stamp,
    achievement: 0,
    petBag: new Array(PET_BAG_SIZE).fill(null),
    petStorage: [],
    pvpPetTeam: [],
    itemStorage: [],
    mailStorage: [],
    missionStorage: [],
    activityStorage: [],
    battleRecordStorage: [],
    settingsData: defaultSettingsData(),
    yiteRogueData: defaultYiteRogueData(),
  }
}

/** 深拷贝。模型里全是 JSON-safe 值（number/string/boolean/null/数组/对象）⇒ JSON 往返即够。 */
export function clone(g) {
  return JSON.parse(JSON.stringify(g))
}

/** 存档「空」判据 = 上游 `GameData.IsEmpty()` = 昵称为空（未登录）。View B5 的「空档」即此。 */
export function isEmpty(g) {
  return !g || typeof g.nickname !== 'string' || g.nickname.length === 0
}

/** 工程内落点（相对仓库根）：`saves/save{id}.xml`（与上游文件名一致）。 */
export function keyOf(gid) {
  return `saves/save${Number(gid)}.xml`
}

// ─────────────────────────── 校验 ───────────────────────────

const PET_SUBOBJECTS = ['basic', 'feature', 'exp', 'talent', 'resist', 'skills', 'record', 'ui']

/**
 * 写侧形状体检（`{ok, errors}`）。**只查形状，不查游戏语义**：
 *   · 顶层字段类型 / 数组；
 *   · `petBag` 定长 12（历史短档由 `newgame.finishNewGame` resize，不由 parse 静默补）；
 *   · 每个非空 `Pet` 的 8 个子结构 + `currentStatus` 六列；
 *   · 全树无 `undefined`/`NaN`/`Infinity`（会把 writer 写成 `undefined` 的隐形坑）。
 * 校验失败不静默放行 —— 调用方（`repository`）负责报错。
 */
export function validate(g) {
  const errors = []
  const bad = (m) => errors.push(m)

  if (!g || typeof g !== 'object' || Array.isArray(g)) {
    return { ok: false, errors: ['gameData 不是对象'] }
  }

  if (typeof g.version !== 'string') bad('version 应为 string')
  if (typeof g.nickname !== 'string') bad('nickname 应为 string')
  if (typeof g.gender !== 'boolean') bad('gender 应为 boolean')
  if (typeof g.firstLoginDate !== 'string') bad('firstLoginDate 应为 string（ISO 文本）')
  if (typeof g.lastLoginDate !== 'string') bad('lastLoginDate 应为 string（ISO 文本）')
  if (!Number.isInteger(g.achievement)) bad('achievement 应为整数')

  if (!Array.isArray(g.petBag)) bad('petBag 应为数组')
  else if (g.petBag.length !== PET_BAG_SIZE) bad(`petBag 长度应为 ${PET_BAG_SIZE}，实为 ${g.petBag.length}`)

  for (const k of ['petStorage', 'pvpPetTeam', 'itemStorage', 'mailStorage', 'missionStorage', 'activityStorage', 'battleRecordStorage']) {
    if (!Array.isArray(g[k])) bad(`${k} 应为数组`)
  }

  if (!g.settingsData || typeof g.settingsData !== 'object') bad('settingsData 缺失')
  else for (const f of SETTINGS_FIELDS) {
    if (!(f in g.settingsData)) bad(`settingsData.${f} 缺失`)
  }
  if (!g.yiteRogueData || typeof g.yiteRogueData !== 'object') bad('yiteRogueData 缺失')

  // 宠槽
  const checkPet = (pet, where) => {
    if (pet == null) return
    if (typeof pet !== 'object') { bad(`${where} 应为对象或 null`); return }
    if (!Number.isInteger(pet.id)) bad(`${where}.id 应为整数`)
    for (const sub of PET_SUBOBJECTS) {
      if (!pet[sub] || typeof pet[sub] !== 'object') bad(`${where}.${sub} 缺失`)
    }
    if (pet.skills) {
      if (!Array.isArray(pet.skills.ownSkillId)) bad(`${where}.skills.ownSkillId 应为数组`)
      if (!Array.isArray(pet.skills.normalSkillId)) bad(`${where}.skills.normalSkillId 应为数组`)
      if (!Number.isInteger(pet.skills.superSkillId)) bad(`${where}.skills.superSkillId 应为整数`)
    }
    if (pet.talent && (!pet.talent.ev || typeof pet.talent.ev !== 'object')) bad(`${where}.talent.ev 缺失`)
    if (pet.currentStatus) {
      for (const c of STATUS_COLS) {
        if (!Number.isFinite(pet.currentStatus[c])) bad(`${where}.currentStatus.${c} 应为有限数`)
      }
    } else bad(`${where}.currentStatus 缺失`)
  }

  for (const [k, list] of [['petBag', g.petBag], ['petStorage', g.petStorage]]) {
    if (!Array.isArray(list)) continue
    list.forEach((p, i) => checkPet(p, `${k}[${i}]`))
  }

  for (const [i, it] of (g.itemStorage || []).entries()) {
    if (!it || !Number.isInteger(it.id) || !Number.isInteger(it.num)) bad(`itemStorage[${i}] 应为 {id:int, num:int}`)
  }
  for (const [i, m] of (g.mailStorage || []).entries()) {
    if (!m || typeof m.sender !== 'string' || typeof m.title !== 'string' || typeof m.content !== 'string') bad(`mailStorage[${i}] 缺 sender/title/content`)
    else if (!Array.isArray(m.gift)) bad(`mailStorage[${i}].gift 应为数组`)
  }
  for (const [i, m] of (g.missionStorage || []).entries()) {
    if (!m || !Number.isInteger(m.id) || typeof m.checkpoint !== 'string' || typeof m.done !== 'boolean') bad(`missionStorage[${i}] 应为 {id,checkpoint,done}`)
  }
  for (const [i, a] of (g.activityStorage || []).entries()) {
    if (!a || typeof a.id !== 'string' || !Array.isArray(a.data)) bad(`activityStorage[${i}] 应为 {id:string, data:[]}`)
  }

  // 全树数值健康（catch NaN/undefined —— 它们不会抛，只会把存档写坏）
  walkScalars(g, 'gameData', (path, v) => {
    if (v === undefined) bad(`${path} 是 undefined`)
    else if (typeof v === 'number' && !Number.isFinite(v)) bad(`${path} 不是有限数（${v}）`)
  })

  return { ok: errors.length === 0, errors }
}

// 只走「数据」，不把 Date 当对象（模型里日期一律 ISO 文本）
function walkScalars(node, path, visit) {
  if (node === null) return
  const t = typeof node
  if (t === 'number' || t === 'string' || t === 'boolean') { visit(path, node); return }
  if (t !== 'object') { visit(path, node); return }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkScalars(v, `${path}[${i}]`, visit))
    return
  }
  for (const [k, v] of Object.entries(node)) walkScalars(v, `${path}.${k}`, visit)
}
