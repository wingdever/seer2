// tools/build-unity-data.mjs —— 把 Seer2-Restart-Lite 的内容表搬成 game/data/*.json
//
// 职责是**不改变语义地搬运**: 转换逐行对照 Unity 侧的
//   ResourceManager.cs(GetCSV/GetEffectLists/Get*Info) + 各 *Info 构造函数。
// 不用 RFC4180 解析器: 实测 16 张表零引号、零空字段(见 hazard 扫描), 而 Unity 用的是
//   text.Split([',','\n'], RemoveEmptyEntries) + 固定 DATA_COL 跨步。上严格解析器只会让两边分叉。
//
// 三条"照搬"的硬规矩:
//   1) C# 的 To*/字典取值一律 `.Get(key, 默认值)` ⇒ 拼错的 token **静默降级成 None**。
//      这类静默失败必须在构建期暴露, 所以枚举词表命中 = 硬门禁。
//   2) GetSkill/GetBuffInfo/GetItemInfo 的 try 包在**整个循环外** ⇒ 单行抛错会丢掉其后所有行。
//      这里如实模拟中断, 并把中断当作门禁失败(而不是悄悄少一批内容)。
//   3) Skills/Buffs/Items 的 effects 是按 **effect.csv 的行序**配对的, 不是按 id。
//      所以断言两表行数相等且 owner id 逐行相等 —— 只在一张表插行会静默错配整表。
//
// 已知上游 quirk(照搬不修): Pets/basic.csv 的 13 行 "0[9]/1[1]" 因 PetBasicInfo.cs:92
// 的 TrimEnd(string) 绑到 **char[] 重载**(字符集裁剪)而解析失败, 性别分布退化成 [0]/[9]。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseOptions, parseMultipleOptions } from '../game/core/parser/parser.ts'
import { toIntList, parseIntOrThrow } from '../game/core/strutil.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'projects/Seer2-Restart-Lite-main/Assets/Resources/Data')
// 输出命名空间: game/data/unity/ —— **绝不能**写进 game/data/ 根目录。
// 那里放的是官方 AS3/改服血统的 app 运行时表 (pets.json/items.json 由 tools/build-data.mjs
// 与 tools/build-items.mjs 产出, mapScene.js / legacy/battle.html 直接 fetch)。
// 两套 schema 不同 (重启是 PetInfo 组件表, app 要的是 {monsters:{id,swfId}}), 同名覆盖会让页面当场白屏:
// 重启内容宇宙要等 S2/S6 明确切换数据源后才接管。
const OUT = join(ROOT, 'game/data/unity')

// ── C# 搬运原语 ────────────────────────────────────────────────────────────────
const getCSV = (text) => text.split(/[,\n]/).filter((x) => x !== '')       // ResourceManager.cs:525-531
const trimEndSet = (s, set) => { let e = s.length; while (e > 0 && set.has(s[e - 1])) e--; return s.slice(0, e) }
const tryParseIntCs = (s) => (/^\s*[+-]?\d+\s*$/.test(s) ? Number(s.trim()) : null)

const intParse = parseIntOrThrow                                            // 失败即抛, 与 int.Parse 同
const floatParse = (s) => {
  const n = tryParseFloatCs(s)
  if (n === null) throw new Error(`float.Parse: "${s}"`)
  return n
}
function tryParseFloatCs(s) {
  return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(s) ? Number(s.trim()) : null
}
const boolParse = (s) => {                                                  // 只认 true/false, 其它抛
  const v = String(s).trim().toLowerCase()
  if (v === 'true') return true
  if (v === 'false') return false
  throw new Error(`bool.Parse: "${s}"`)
}
const optGet = (opts, key, def) => (opts.has(key) ? opts.get(key) : def)
const optBool = (opts, key, def) => boolParse(optGet(opts, key, def))
const optInt = (opts, key, def) => intParse(optGet(opts, key, def))
const optFloat = (opts, key, def) => floatParse(optGet(opts, key, def))
// option 一律落成**有序 pair 数组**, 不是 JSON 对象: 表里有 "2"/"5" 这种数字串键 (如 `buff=3&2=4&5=6`),
// 而 JS/JSON 的整型串键会被重排到最前 —— 上游 `GetRawAbilityOptionString`/`GetRawCondtionOptionString`
// 按 Dictionary 的**插入序**拼串, 顺序即语义 (回合末回读、对拍逐字节比较都靠它)。
// 需要对象形状的消费者自己 Object.fromEntries, 别在产物里塌缩。
const optPairs = (s) => { const m = new Map(); parseOptions(m, s); return [...m] }

const parseCsv = (rel) => {
  const text = readFileSync(join(DATA, rel), 'utf8')
  return { rel, text, flat: getCSV(text) }
}

// for (i = 1; i < flat.length / COL; i++) → cur = COL*i; 表头被当作第 0 行消耗掉
function stride(flat, col) {
  const dataRow = Math.floor(flat.length / col)
  const rows = []
  for (let i = 1; i < dataRow; i++) rows.push({ i, cur: col * i, cells: flat.slice(col * i, col * i + col) })
  return { col, dataRow, remainder: flat.length % col, rows }
}

const audit = { vocabMiss: [], hazard: [], dupId: [], rowMismatch: [], hashSkipped: [], effectPairMiss: [], unknownSkillType: [], quirks: [], dropped: [] }

// 上游表里已存在的拼错 token: C# 的 To* 一律 `.Get(key, None)` ⇒ 静默降级成"无效果"。
// 移植必须**复现同一降级**(否则网页端比参考实现多做了事), 但绝不能让新增的拼错悄悄溜过去,
// 所以把观测到的分布写死成配额: 出现次数与这里不等就卡门禁。实测 20 处 (本表逐条列名)。
const KNOWN_SILENT_FALLBACK = {
  'timing:on_remove_buf': 1,      // Effects/effect.csv 预制, 少一个 f → timing=None
  'target:heal': 1,               // Skill#13736, 把 ability 名写进了 target 位 → target=None
  'condition:noen': 2,            // Skill#14168/14169, none 拼反 → condition=None(= 恒真)
  'condition:state': 1,           // Buff, state 是 target 的 token, 放在 condition 位无效
  'ability:poewrup': 2,           // Skill#15178/15179, powerup 拼错 → ability=None(整条效果空转)
  'ability:set_effect': 7,        // Skill 1 处 + Buff 6 处, 枚举里根本没有这个算子
  // Buffs/info 的两个相邻列互相漏 token (BuffDatabase.cs:52-77):
  // BuffType 无 new / CopyHandleType 无 none·chance·repalce, 全部落 None(0) / New(0)。
  'copyHandleType:none': 2,       // id -7 最大体力锁定, id -3090 模仿反击
  'copyHandleType:chance': 2,     // id 3624 再生复苏, id -3127 蓄势 (chance 是 BuffType 的 token)
  'copyHandleType:repalce': 1,    // id 200298 水性, replace 拼错 → New
  'buffType:new': 1,              // id 3591 漩涡风(天气), new 是 CopyHandleType 的 token → BuffType.None
  // Activities/info.csv 的 type 列 (ActivityInfo.cs:69 ToActivityType `.Get(type, None)`):
  'activityType:resdient': 1,     // id 11005 冰封的九尾冰狐, resident 拼错 → ActivityType.None (面板照 None 处理)
}
const silentCount = {}

// 词表命中检查: 未命中仍按 C# 降级成 None(不改搬运结果), 但记进 manifest 并卡门禁
function vocab(kind, raw, where, fallback) {
  const table = VOCAB[kind]
  if (Object.prototype.hasOwnProperty.call(table, raw)) return table[raw]
  const key = `${kind}:${raw}`
  silentCount[key] = (silentCount[key] || 0) + 1
  audit.vocabMiss.push({ kind, raw, where, fallback })
  return fallback
}

// ── 枚举词表 (EffectDatabase.cs / BuffDatabase.cs / ItemDatabase.cs / Skill.cs) ──
// 数值取 C# enum 声明原值, **不是**字典插入序: IsAttackPhase 依赖 6<timing<16 的数值区间
// (EffectDatabase.cs:196-201), 换错数值会让整条攻击阶段判定悄悄跑偏。
const VOCAB = {
  statusNames: ['atk', 'mat', 'def', 'mdf', 'spd', 'hp'],                   // Status.cs:12, HP 末位
  statusNamesChinese: ['物攻', '特攻', '物防', '特防', '速度', '体力'],
  timing: {
    all: -999, none: 0, resident: 1, on_battle_start: 2, on_turn_start: 3, on_turn_ready: 4,
    on_decide_pri: 5, on_before_attack: 6, on_attack_start: 7, on_dmg_param_cal: 8,
    on_before_dmg_cal: 9, on_dmg_cal: 10, on_after_dmg_cal: 11, on_final_dmg_cal: 12,
    on_attack_ready: 13, on_attack: 14, on_after_attack: 15, on_attack_end: 16,
    on_turn_end: 17, on_after_turn_end: 18, on_battle_end: 999,
    on_passive_pet_change: -1, on_select_target: -2, on_add_buff: -3, on_remove_buff: -4,
    on_before_pet_change: -5, on_after_pet_change: -6, on_round_start: -7, on_round_end: -8,
    on_before_effect: -9, on_effect: -10, on_after_effect: -11,
  },
  target: { none: 0, state: 1, item: 2, skill: 3, buff: 4, pet: 5, pet_bag: 6, token: 7 },
  condition: { none: 0, unit: 1, pet: 2, token: 3, status: 4, skill: 5, buff: 6, last_skill: 7, poker: 8 },
  ability: {
    none: 0, win: 1, escape: 2, capture: 3, pet_change: 4, heal: 5, rage: 6, powerup: 7,
    add_status: 8, block_buff: 9, add_buff: 10, remove_buff: 11, copy_buff: 12, set_buff: 13,
    set_damage: 14, set_skill: 15, set_pet: 16, set_weather: 17, set_player: 18, poker: 19,
    set_pet_bag: 20, card: 21,
  },
  buffType: {
    'powerup.neg': -4, 'powerup.pos': -3, powerup: -2, all: -1, none: 0, feature: 1, emblem: 2,
    mark: 3, unhealthy: 4, abnormal: 5, turn: 6, chance: 7, shield: 8, weather: 9, item: 10,
  },
  copyHandleType: { new: 0, block: 1, replace: 2, stack: 3, min: 4, max: 5 },
  itemType: {
    none: 0, currency: 1, hp_potion: 2, capture: 3, evolve: 4, emblem: 5, exp: 6, ev: 7, iv: 8,
    personality: 9, skill: 10, buff: 11, mine: 12, recipe: 13, stuff: 14, package: 15, plant: 16,
    seed: 17, fertilizer: 18, animal_child: 19, animal: 20, animal_action: 21, animal_product: 22,
    achievement: 23, shoot: 24, equipment: 25,
  },
  // Skill.cs:727-731 + Skills/info.csv 的 type 列是**数值**, 这里存数值→名字
  // Skill.cs:729-730 声明过的值; 表里出现的 -7 未声明 → 落进 audit.unknownSkillType (不是解析失败)
  skillType: { '-5': '被动', '-4': '逃跑', '-3': '換场', '-2': '道具', '-1': '空过', '0': '属性', '1': '物理', '2': '特殊', '3': '连携', '100': '必杀' },
  // ActivityInfo.cs:62-72 ActivityDatabase.typeConvDict —— none/resident/daily → 0/1/2, 未命中静默落 None(0)。
  activityType: { none: 0, resident: 1, daily: 2 },
}
const ENUM_KINDS = ['timing', 'target', 'condition', 'ability', 'buffType', 'copyHandleType', 'itemType', 'activityType']
const COIN_ID = 1, DIAMOND_ID = 2                                             // Item.cs:12

// ── 效果列解码 (effect.csv: 第 0 列 owner id + 7 列, 每列用 '\' 切子效果) ──────────
// ResourceManager.cs:653-690 GetEffectLists —— 逐条照搬, 包括"循环上界取第 0 列长度"
// 造成的隐式 IndexOutOfRange(这里显式判等长并记 rowMismatch, 因为静默丢效果比抛错更难查)。
const EFFECT_COLS = 7
function decodeEffectRow(flat, cur, where, hist) {
  const effectId = intParse(flat[cur])
  const cols = []
  for (let j = 1; j <= EFFECT_COLS; j++) cols.push(flat[cur + j].split('\\').filter((x) => x !== ''))
  const lens = cols.map((c) => c.length)
  // C# 的循环上界只取第 0 列长度 (ResourceManager.cs:680):
  //   · 某列比它长 ⇒ 多出来的子效果**静默忽略**(不报错)
  //   · 某列比它短 ⇒ j 越界 IndexOutOfRange ⇒ 外层 catch ⇒ 整行效果丢弃
  // 我第一版判"七列必须等长", 那比原版严: 实测 14 行属于"有超额列", Unity 侧根本不丢,
  // 若照我那规则丢效果反而**偏离**参照实现。
  const bound = lens[0]
  if (Math.min(...lens) < bound) {
    audit.rowMismatch.push({ where, effectId, lens, bound, outcome: 'dropped' })
    throw new Error(`某列子效果数 ${Math.min(...lens)} < 上界 ${bound}`)
  }
  if (Math.max(...lens) > bound) audit.rowMismatch.push({ where, effectId, lens, bound, outcome: 'extras ignored' })
  hist[bound] = (hist[bound] || 0) + 1
  const effects = []
  for (let j = 0; j < bound; j++) {
    const [rawTiming, rawPriority, rawTarget, rawCondition, rawCondOption, rawAbility, rawAbilityOption] = cols.map((c) => c[j])
    const tag = `${where}#${effectId}`
    effects.push({
      id: effectId,
      timingRaw: rawTiming, timingId: vocab('timing', rawTiming, tag, 0),
      priority: intParse(rawPriority),
      targetRaw: rawTarget, targetId: vocab('target', rawTarget, tag, 0),
      conditionRaw: rawCondition, conditionId: vocab('condition', rawCondition, tag, 0),
      condOptions: parseMultipleOptions(rawCondOption).map((m) => [...m]),
      abilityRaw: rawAbility, abilityId: vocab('ability', rawAbility, tag, 0),
      options: optPairs(rawAbilityOption),
    })
  }
  return { effectId, effects }
}

// 一张 info 表 + 一张 effect 表 → 按行序配对, 同时断言 owner id 逐行相等
function pairEffects(infoStride, effectCsv, effectCol, label) {
  const effStride = stride(effectCsv.flat, effectCol)
  const hist = {}
  const lists = []
  for (const row of effStride.rows) {
    try {
      const { effectId, effects } = decodeEffectRow(effectCsv.flat, row.cur, `${label}行${row.i}`, hist)
      lists.push({ effectId, effects })
    } catch (e) {
      audit.dropped.push({ table: effectCsv.rel, at: row.i, msg: String(e.message) })
      lists.push({ effectId: intParse(effectCsv.flat[row.cur]), effects: [] })
    }
  }
  if (lists.length !== infoStride.rows.length)
    audit.effectPairMiss.push({ label, why: `行数不等 info=${infoStride.rows.length} effect=${lists.length}` })
  infoStride.rows.forEach((r, k) => {
    const id = intParse(r.cells[0])
    if (lists[k] && lists[k].effectId !== id)
      audit.effectPairMiss.push({ label, at: k, infoId: id, effectId: lists[k].effectId })
  })
  return { lists, hist, stride: effStride }
}

// ── Pets/basic.csv (PetBasicInfo.cs, DATA_COL=10, 唯一带 '#' 注释跳过的表) ────────
const basicCsv = parseCsv('Pets/basic.csv')
const basicStride = stride(basicCsv.flat, 10)
const pets = []
for (const { cells } of basicStride.rows) {
  if (cells[0].startsWith('#')) { audit.hashSkipped.push({ table: 'Pets/basic', row: cells[0] }); continue }
  const elementList = toIntList(cells[3], '/') ?? []
  const baseStatus = toIntList(cells[4], '/')
  if (baseStatus === null || baseStatus.length !== 6)
    throw new Error(`Pets/basic#${cells[0]}: baseStatus 需要 6 段, 实得 ${JSON.stringify(cells[4])}`)
  const height = toIntList(cells[6], '/')
  const gender = parseGender(cells[5])
  pets.push({
    id: intParse(cells[0]),
    baseId: intParse(cells[1]),
    name: cells[2],
    elementId: elementList[0],
    subElementId: elementList.length > 1 ? elementList[1] : 0,
    baseStatus: Object.fromEntries(VOCAB.statusNames.map((k, i) => [k, baseStatus[i]])),
    rawGender: cells[5],
    gender: gender.list.length ? gender.list[0] : 0,            // genderList.FirstOrDefault()
    genderList: gender.list,
    genderDistribution: gender.dist,
    genderParseFailed: gender.ok === false,
    baseHeight: height[0],
    baseWeight: height[1],
    description: cells[7],
    habitat: cells[8],
    linkId: cells[9].replace(/\s+$/, ''),                        // TrimEnd() 无参 = 剥尾随空白
  })
}

// PetBasicInfo.cs:83-103 TryParseGender —— 逐句照搬, 含两处反直觉:
//   · TrimEnd("[" + p + "]") 绑到 **char[] 重载** ⇒ 按字符集从尾部裁剪, 会把性别数字本身也吃掉
//     (piece "1[1]" → 集 {[,1,]} → 裁成 "" → TryParse 失败)
//   · 失败时 out 参数保留**已填入的前缀**, 不是清空 ⇒ 上游 quirk 原样进表
function parseGender(expr) {
  const list = [], dist = []
  const uniq = tryParseIntCs(expr)
  if (uniq !== null) return { list: [uniq], dist: [1], ok: true }
  for (const piece of expr.split('/')) {
    const p = tryParseIntCs(piece.slice(piece.indexOf('[') + 1, piece.lastIndexOf(']')))
    if (p === null) return { list, dist, ok: false, bad: piece }
    const g = tryParseIntCs(trimEndSet(piece, new Set(`[${p}]`)))
    if (g === null) return { list, dist, ok: false, bad: piece }
    list.push(g); dist.push(p)
  }
  return { list, dist, ok: true }
}
const genderQuirk = pets.filter((x) => x.genderParseFailed)
if (genderQuirk.length) audit.quirks.push({
  name: 'PetBasicInfo.TrimEnd(char[]) 性别分布退化',
  count: genderQuirk.length,
  rows: genderQuirk.map((x) => `${x.id}:${x.rawGender}→[${x.genderList}]`),
  policy: '照搬不修 (行为与 Unity 一致优先), 已在 docs/engine/port-map.md 记档',
})

// ── Pets/feature(5) / exp(5) / skill(3) / card(3) / ui(4) ───────────────────────
const featureStride = stride(parseCsv('Pets/feature.csv').flat, 5)
const features = featureStride.rows.map(({ cells }) => ({
  baseId: intParse(cells[0]),
  feature: { baseId: intParse(cells[0]), name: cells[1], rawDescription: cells[2] },
  emblem: cells[3] === 'none' ? null : { baseId: intParse(cells[0]), name: cells[3], rawDescription: cells[4] },
}))

const expStride = stride(parseCsv('Pets/exp.csv').flat, 5)
const growth = expStride.rows.map(({ cells }) => ({
  id: intParse(cells[0]),
  expType: intParse(cells[1]),
  evolvePetIds: toIntList(cells[2], '/') ?? [],
  evolveLevels: toIntList(cells[3], '/') ?? [],
  beatExpParam: intParse(cells[4]),
}))

const learnOf = (rel) => stride(parseCsv(rel).flat, 3).rows.map(({ cells }) => ({
  id: intParse(cells[0]),
  skillIdList: toIntList(cells[1], '/') ?? [],
  learnLevelList: toIntList(cells[2], '/') ?? [],
}))
const petSkills = learnOf('Pets/skill.csv')
const petCards = learnOf('Pets/card.csv')

const uiStride = stride(parseCsv('Pets/ui.csv').flat, 4)
const petUI = uiStride.rows.map(({ cells }) => {
  const id = intParse(cells[0]), baseId = intParse(cells[1])
  const options = new Map(); parseOptions(options, cells[3])
  // PetUIInfo.cs:70-115: default_id 形如 "220.1" = 精灵 id.子 id (ParseDefaultId 按 '.' 切成 defaultId/subId);
  // rawSkins(第 3 列)是 Linear<int> DSL, 与 S2 的 personality/ev 表共用同一套解析, 本期原样保留不拆。
  const [defaultId, subId] = optGet(options, 'default_id', String(id)).split('.').map(intParse)
  const defaultSkinId = optInt(options, 'default_skin', String(id))
  return {
    id, baseId, rawSkins: cells[2], options: [...options],
    defaultId, subId: subId ?? 0,
    defaultSkinId,
    defaultAnimId: optInt(options, 'default_anim', String(defaultSkinId)),
    defaultFeatureList: toIntList(optGet(options, 'default_feature', String(baseId)), '/') ?? [],
    defaultBuffIds: toIntList(optGet(options, 'default_buff', 'none'), '/') ?? [],
    hide: optBool(options, 'hide', 'false'),
    star: optFloat(options, 'star', '0'),
  }
})

// ── Skills (info 9 列 + effect), Buffs (7 + effect), Items (7 + effect) ──────────
const skillInfoCsv = parseCsv('Skills/info.csv')
const skillStride = stride(skillInfoCsv.flat, 9)
const skillEff = pairEffects(skillStride, parseCsv('Skills/effect.csv'), EFFECT_COLS + 1, 'Skill')
const skills = []
for (let k = 0; k < skillStride.rows.length; k++) {
  const { cells } = skillStride.rows[k]
  const id = intParse(cells[0])
  const options = new Map(); parseOptions(options, cells[7])
  const costList = toIntList(cells[5], '/') ?? []
  const anger = costList[0] ?? 0
  const maxPP = (costList[1] ?? 0) > 0 ? costList[1] : Math.max(5, 40 - anger)   // Skill.InitCost:129-137
  const type = intParse(cells[3])
  // Skill.cs:95 是 (SkillType)int.Parse(...) —— C# 的整数转枚举**不做成员校验**, -7 这类未声明值
  // 会原样带进运行时, 所以这不是"解析失败", 只记成事实供 S2 判断有没有分支认得它。
  if (!(String(type) in VOCAB.skillType)) audit.unknownSkillType.push({ id, type })
  skills.push({
    id, name: cells[1], elementId: intParse(cells[2]), type, power: intParse(cells[4]),
    rawCostString: cells[5], anger, maxPP, accuracy: intParse(cells[6]),
    options: [...options],
    referBuffList: optGet(options, 'ref_buff', null)?.split('/') ?? null,
    isSecondSuper: optBool(options, 'second_super', 'false'),
    critical: optFloat(options, 'critical', '5'),
    priority: optInt(options, 'priority', '0'),
    vipriority: optInt(options, 'vipriority', '0'),
    ignoreShield: optBool(options, 'ignore_shield', 'false'),
    ignorePowerup: optBool(options, 'ignore_powerup', 'false'),
    ignorePowerdown: optBool(options, 'ignore_powerdown', 'false'),
    rawDescription: cells[8],
    effects: skillEff.lists[k]?.effects ?? [],
  })
}

const buffInfoCsv = parseCsv('Buffs/info.csv')
const buffStride = stride(buffInfoCsv.flat, 7)
const buffEff = pairEffects(buffStride, parseCsv('Buffs/effect.csv'), EFFECT_COLS + 1, 'Buff')
const buffs = []
for (let k = 0; k < buffStride.rows.length; k++) {
  const { cells } = buffStride.rows[k]
  const id = intParse(cells[0])
  const options = new Map(); parseOptions(options, cells[5])
  const typeId = vocab('buffType', cells[2], `Buff#${id}`, VOCAB.buffType.none)
  const copyId = vocab('copyHandleType', cells[3], `Buff#${id}`, VOCAB.copyHandleType.new)
  // BuffInfo.InitOptionsProperty:73-85 —— 若干默认值本身依赖 type, 顺序照抄
  const isUnhealthyOrAbnormal = typeId === VOCAB.buffType.unhealthy || typeId === VOCAB.buffType.abnormal
  buffs.push({
    id, name: cells[1], typeRaw: cells[2], typeId, copyHandleRaw: cells[3], copyHandleId: copyId,
    turn: intParse(cells[4]), options: [...options], description: cells[6].trim(),
    resId: optInt(options, 'res', String(id)),
    itemId: optInt(options, 'item', '0'),
    keep: optBool(options, 'keep', String(!isUnhealthyOrAbnormal)),
    inherit: optBool(options, 'inherit', 'false'),
    legacy: optBool(options, 'legacy', 'false'),
    hide: optBool(options, 'hide', 'false'),
    removable: optBool(options, 'removable', 'true'),
    autoRemove: optBool(options, 'auto_remove', 'false'),
    minValue: optInt(options, 'min_val', '-2147483648'),
    maxValue: optInt(options, 'max_val', '2147483647'),
    movable: optBool(options, 'movable', String(typeId !== VOCAB.buffType.abnormal)),
    addPriority: optInt(options, 'priority', '0'),
    position: optGet(options, 'position', 'none'),
    effects: buffEff.lists[k]?.effects ?? [],
  })
}

const itemInfoCsv = parseCsv('Items/info.csv')
const itemStride = stride(itemInfoCsv.flat, 7)
const itemEff = pairEffects(itemStride, parseCsv('Items/effect.csv'), EFFECT_COLS + 1, 'Item')
const items = itemStride.rows.map(({ cells }, k) => {
  const id = intParse(cells[0])
  const options = new Map(); parseOptions(options, cells[4])
  // ItemInfo.cs:73-87 SetCurrencyTypeAndPrice: 形如 "100" 或 "100[D]" —— **价格在前, 货币在括号里**
  const priceTag = cells[3]
  const open = priceTag.indexOf('['), close = priceTag.indexOf(']')
  const noCurrency = open === -1 || close === -1
  const currencyRaw = noCurrency ? null : priceTag.substring(open + 1, close)
  const currencyType = noCurrency ? COIN_ID : (currencyRaw === 'D' ? DIAMOND_ID : intParse(currencyRaw))
  const price = intParse(noCurrency ? priceTag : priceTag.substring(0, open))
  return {
    id, name: cells[1], typeRaw: cells[2], typeId: vocab('itemType', cells[2], `Item#${id}`, VOCAB.itemType.none),
    rawPrice: priceTag, currencyType, price,
    options: [...options],
    resId: optGet(options, 'resId', String(id)),
    getId: optInt(options, 'getId', String(id)),
    removable: optBool(options, 'removable', 'true'),
    itemDescription: cells[5] === 'none' ? '' : cells[5],
    effectDescription: cells[6].trim(),
    effects: itemEff.lists[k]?.effects ?? [],
  }
})

// ── Activities/info.csv (ActivityInfo.cs, DATA_COL=10) ──────────────────────────
// 列序 id,resId,name,type,time,linkId,reward,release_date,options,description —— 逐列照搬 ActivityInfo 构造:
//   · type 经 ToActivityType `.Get(type, None)` ⇒ 拼错(resdient)静默落 None, 已在 KNOWN_SILENT_FALLBACK 记配额
//   · reward 是 '&'-切分、不足 3 个补 'none' (ActivityInfo.cs:39-41)
//   · hide = bool.Parse(options.Get('hide','false')) (ActivityInfo.cs:47)
// 面板 Init 只列 !hide (ActivityPanel.cs:16); 本层**如实全表搬运**(含 hide), 显示与否交给 content/面板。
const activityCsv = parseCsv('Activities/info.csv')
const activityStride = stride(activityCsv.flat, 10)
const activities = activityStride.rows.map(({ cells }) => {
  const options = new Map(); parseOptions(options, cells[8])
  const rewardIcons = cells[6].split('&')
  while (rewardIcons.length < 3) rewardIcons.push('none')
  return {
    id: cells[0],
    resId: cells[1],
    name: cells[2],
    typeRaw: cells[3],
    typeId: vocab('activityType', cells[3], `Activity#${cells[0]}`, VOCAB.activityType.none),
    time: cells[4],
    linkId: cells[5],
    rewardIcons,
    releaseDate: cells[7],
    options: [...options],
    hide: optBool(options, 'hide', 'false'),
    description: cells[9],
  }
})

// ── Effects/effect.csv = 预制效果 (LoadEffects:709-734) ─────────────────────────
// 副作用照搬: id ∈ [0,10000] 的预制会被复制一份 **+10000 并把 timing 改成 none**。
const prefabCsv = parseCsv('Effects/effect.csv')
const prefabStride = stride(prefabCsv.flat, EFFECT_COLS + 1)
const pfHist = {}
const prefabs = []
for (const { cur } of prefabStride.rows) {
  const rawId = prefabCsv.flat[cur]
  let entry
  try {
    entry = decodeEffectRow(prefabCsv.flat, cur, `Prefab#${rawId}`, pfHist)
  } catch (e) { audit.dropped.push({ table: 'Effects/effect.csv', at: cur, msg: String(e.message) }); continue }
  const first = entry.effects[0]
  if (!first) continue                                                       // C#: FirstOrDefault() == null → 不入库
  prefabs.push(first)
  if (entry.effectId >= 0 && entry.effectId <= 10000)
    prefabs.push({ ...first, id: entry.effectId + 10000, timingRaw: 'none', timingId: VOCAB.timing.none })
}

// ── pets.json = PetInfo 组装 (GetPetInfo:850-862) ──────────────────────────────
const byKey = (arr, k) => { const m = new Map(); for (const x of arr) m.set(x[k], x); return m }
const featureByBase = byKey(features, 'baseId')
const growthById = byKey(growth, 'id')
const learnById = byKey(petSkills, 'id')
const cardById = byKey(petCards, 'id')
const uiById = byKey(petUI, 'id')
const petInfos = pets.map((basic) => {
  const ui = uiById.get(basic.id) ?? null
  const featureId = ui?.defaultFeatureList[0] ?? basic.baseId
  return {
    ...basic,
    ui,
    feature: featureByBase.get(featureId)?.feature ?? null,
    emblem: featureByBase.get(featureId)?.emblem ?? null,
    growth: growthById.get(basic.id) ?? null,
    skills: learnById.get(basic.id) ?? null,
    cards: cardById.get(basic.id) ?? learnById.get(basic.id) ?? null,      // card.csv 缺失时回退
  }
})

// ── 危险扫描: 空字段/引号/CRLF 会让扁平切分静默错位, 必须为 0 ────────────────────
const allTables = {
  'Pets/basic': basicCsv, 'Pets/feature': parseCsv('Pets/feature.csv'), 'Pets/exp': parseCsv('Pets/exp.csv'),
  'Pets/skill': parseCsv('Pets/skill.csv'), 'Pets/card': parseCsv('Pets/card.csv'), 'Pets/ui': parseCsv('Pets/ui.csv'),
  'Skills/info': skillInfoCsv, 'Skills/effect': parseCsv('Skills/effect.csv'),
  'Buffs/info': buffInfoCsv, 'Buffs/effect': parseCsv('Buffs/effect.csv'),
  'Items/info': itemInfoCsv, 'Items/effect': parseCsv('Items/effect.csv'),
  'Activities/info': activityCsv,
  'Effects/effect': prefabCsv, 'Effects/info': parseCsv('Effects/info.csv'),
}
// 危险扫描: 空字段/引号/CRLF 会让扁平切分静默错位。逐行精确检测三类空单元格:
//   首列空 ",xxx" / 中间空 ",," / 末列空 "xxx,"(逗号紧接行尾)。"逗号+空格"不算空字段
//   (分隔符只有 , 和换行), 第一版用 /,[\n ]/ 误报了 Buffs/info —— 实测该表 0 行以逗号结尾。
for (const [name, { text }] of Object.entries(allTables)) {
  const hits = { CRLF: 0, 引号: 0, 空首列: 0, 中间空: 0, 空尾列: 0 }
  if (text.includes('\r')) hits.CRLF = text.split('\r').length - 1
  if (text.includes('"')) hits.引号 = text.split('"').length - 1
  for (const line of text.split('\n')) {
    if (line.startsWith(',')) hits.空首列++
    if (line.includes(',,')) hits.中间空++
    if (line.endsWith(',')) hits.空尾列++
  }
  const bad = Object.entries(hits).filter(([, v]) => v > 0)
  if (bad.length) audit.hazard.push({ table: name, hits: Object.fromEntries(bad) })
}

// 重复 id: Dictionary.Add 抛(GetSkill/GetEffectDict) vs ListHelper.Set 覆盖(宠物各表/印记/道具)
function dupCheck(arr, key, where, mode) {
  const seen = new Set(), dups = []
  for (const x of arr) { if (seen.has(x[key])) dups.push(x[key]); seen.add(x[key]) }
  if (dups.length) audit.dupId.push({ where, key, mode, count: dups.length, ids: dups.slice(0, 10) })
}
dupCheck(petInfos, 'id', 'Pets', 'Set')
dupCheck(skills, 'id', 'Skills', 'Add')
dupCheck(buffs, 'id', 'Buffs', 'Set')
dupCheck(items, 'id', 'Items', 'Set')
dupCheck(prefabs, 'id', 'Effects', 'Add')

// 效果算子频次: S3 要按频次决定移植顺序(前 6 个覆盖 >60% 行次), 这份统计直接进 manifest
const allEffects = [...skills.flatMap((s) => s.effects), ...buffs.flatMap((b) => b.effects),
  ...items.flatMap((i) => i.effects), ...prefabs]
const freq = (pick) => allEffects.reduce((a, e) => { const k = pick(e); a[k] = (a[k] || 0) + 1; return a }, {})
const top = (obj, n = 30) => Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n))
const abilityFreq = top(freq((e) => e.abilityRaw))
const totalAbility = allEffects.length
const top6Cover = Object.values(Object.fromEntries(Object.entries(abilityFreq).slice(0, 6))).reduce((a, b) => a + b, 0)

// ── 落盘 ───────────────────────────────────────────────────────────────────────
const versionXml = readFileSync(join(DATA, 'System/version.xml'), 'utf8')
const version = versionXml.match(/<gameVersion>([^<]+)</)[1]
const releaseDate = versionXml.match(/<releaseDate>([^<]+)</)[1].trim()
// ★图鉴（docs/view/panel/dex/dex-design.md DX6 · DXQ2=A）：`version.xml` 的 **`<topicPetId>`（单数元素、
//   一行逗号分隔）** = 上游 `PetDictionaryController.petTopic` 的唯一真值（原脚本根本不读这行）。
//   缺行/空 ⇒ 空数组（V2「发行数据水印静默兜底、不抛」同口径）。
const topicPetIds = (versionXml.match(/<topicPetId>([^<]*)</)?.[1] || '')
  .split(',').map((s) => Number(s.trim())).filter(Number.isFinite)

const manifest = {
  _version: version, _releaseDate: releaseDate, _generated: new Date().toISOString().slice(0, 10),
  _source: 'projects/Seer2-Restart-Lite-main/Assets/Resources/Data',
  counts: {
    pets: petInfos.length, features: features.length, growth: growth.length, petSkills: petSkills.length,
    petCards: petCards.length, petUI: petUI.length, skills: skills.length, buffs: buffs.length,
    items: items.length, prefabEffects: prefabs.length, effectInstances: totalAbility,
    activities: activities.length,
  },
  strides: Object.fromEntries(Object.entries({
    'Pets/basic': basicStride, 'Pets/feature': featureStride, 'Pets/exp': expStride,
    'Pets/skill': stride(parseCsv('Pets/skill.csv').flat, 3), 'Pets/ui': uiStride,
    'Skills/info': skillStride, 'Skills/effect': skillEff.stride, 'Buffs/info': buffStride,
    'Buffs/effect': buffEff.stride, 'Items/info': itemStride, 'Items/effect': itemEff.stride,
    'Activities/info': activityStride,
    'Effects/effect': prefabStride,
  }).map(([k, s]) => [k, { rows: s.dataRow, remainder: s.remainder }])),
  subEffectHistogram: { Skills: top(skillEff.hist, 25), Buffs: top(buffEff.hist, 25), Items: top(itemEff.hist, 25), Effects: top(pfHist, 25) },
  abilityFrequency: abilityFreq,
  abilityTop6Coverage: `${((top6Cover / totalAbility) * 100).toFixed(1)}%`,
  timingFrequency: top(freq((e) => e.timingRaw), 20),
  targetFrequency: top(freq((e) => e.targetRaw), 10),
  conditionFrequency: top(freq((e) => e.conditionRaw), 12),
  skillTypeFrequency: skills.reduce((a, s) => { a[VOCAB.skillType[String(s.type)] ?? s.type] = (a[VOCAB.skillType[String(s.type)] ?? s.type] || 0) + 1; return a }, {}),
  buffTypeFrequency: buffs.reduce((a, b) => { a[b.typeRaw] = (a[b.typeRaw] || 0) + 1; return a }, {}),
  silentFallbackQuota: KNOWN_SILENT_FALLBACK,
  audit,
}

mkdirSync(OUT, { recursive: true })
const emit = (name, obj) => {
  const body = JSON.stringify({ _version: version, _table: name, ...obj })
  writeFileSync(join(OUT, name), body)
  console.log(`  ${name.padEnd(15)} ${(body.length / 1024).toFixed(0).padStart(5)} KB`)
}
console.log(`build-unity-data ← ${version} (${releaseDate})`)
emit('vocab.json', { kinds: ENUM_KINDS, values: VOCAB, skillTypeNames: VOCAB.skillType, currencyIds: { COIN_ID, DIAMOND_ID } })
emit('pets.json', { pets: petInfos, topicPetIds })
emit('features.json', { features })
emit('growth.json', { growth, petSkills, petCards, petUI })
emit('skills.json', { skills })
emit('buffs.json', { buffs })
emit('items.json', { items })
emit('activities.json', { activities })
emit('effects.json', { prefabs })
emit('manifest.json', manifest)

// ── 门禁 ───────────────────────────────────────────────────────────────────────
const bad = []
for (const [t, s] of Object.entries(manifest.strides)) if (s.remainder !== 0) bad.push(`跨步余数 != 0: ${t} (${s.remainder})`)
if (audit.hazard.length) bad.push(`空字段/引号/CRLF 危险: ${JSON.stringify(audit.hazard)}`)
// 词表: 允许"已记账"的上游拼错原样降级, 但**数量必须与配额一致** —— 多一个或少一个都说明表变了
const quotaDiff = []
for (const [key, want] of Object.entries(KNOWN_SILENT_FALLBACK))
  if ((silentCount[key] || 0) !== want) quotaDiff.push(`${key} 期望 ${want} 实得 ${silentCount[key] || 0}`)
for (const key of Object.keys(silentCount))
  if (!(key in KNOWN_SILENT_FALLBACK)) quotaDiff.push(`新增未记账的静默降级 ${key} ×${silentCount[key]}`)
if (quotaDiff.length) bad.push(`静默降级与配额不符: ${JSON.stringify(quotaDiff)}`)
const droppedRows = audit.rowMismatch.filter((r) => r.outcome === 'dropped')
if (droppedRows.length) bad.push(`效果行因短列被整行丢弃 ${droppedRows.length} 行: ${JSON.stringify(droppedRows.slice(0, 5))}`)
if (audit.dupId.length) bad.push(`重复 id: ${JSON.stringify(audit.dupId)}`)
if (audit.dropped.length) bad.push(`效果行解码异常 ${audit.dropped.length} 行: ${JSON.stringify(audit.dropped.slice(0, 5))}`)
if (bad.length) { console.error('❌ 门禁未过:\n' + bad.map((x) => '  · ' + x).join('\n')); process.exit(1) }
console.log(`✅ 门禁全过: 跨步 / 危险字符 / 词表 / 子效果等长 / info-effect 配对 / 重复 id / 无丢行`)
console.log(`   效果算子前 6 覆盖 ${manifest.abilityTop6Coverage} (共 ${totalAbility} 条效果实例)`)
