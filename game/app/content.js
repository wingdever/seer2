// 内容宇宙桥 —— 把「阿卡迪亚：重启」的数据表喂给页面, 官方表只保留一个用途: 动画 id (swfId)。
// 为什么需要这一层: 网页端今天读的是官方 pets.json/rules.json (10001 拍打 命中 100),
// 而规则权威已换成重启表 (10001 拍打 命中 95)。两张表**共用数字 id 空间** (实测:
// 重启 Pets/basic.csv 第 1 行 = 迪兰, 与官方 monsters[1] 对齐), 所以桥是纯字段改名, 不需要拼音 key。
// 列序换算实测自 Status.cs 的 float[6] 顺序 (atk/mat/def/mdf/spd/hp) 对官方
// (atk/spa/def/spd/spe/hp) —— 注意官方的 spd 装的是魔抗、spe 装的才是速度, 这个命名坑照搬不改。
import { Status, getPetNormalStatus, getPersonalityBuff, getPersonalityBuffDescription, STATUS_TYPE_NAMES_CN } from '/game/core/pet/status.js'
import { ELEMENT_NAMES, ELEMENT_NUM, getAttackRelation, getDefenseRelation } from '/game/core/pet/element.js'
import { PERSONALITY } from '/game/core/pet/basic.js'
import { SkillType } from '/game/core/pet/skill.js'
// 地图权威（方案 C）：进图时现场取那一条 Unity XML、现场解析。解析器与 node 审计共用一份。
import { parseMapXml, as3ResourceNameOf, as3InitOf, swfCandidatesFor, pickSwf } from '/game/logic/map/parse-map.js'
// exp→level 曲线**形状**从官方纯函数借用 (rules.json expCurve 喂参数); 系数仍缺 (内核 S6 未搬 ProcessResult/SetExp)。
import { levelExp, levelFromTotalExp } from '/game/logic/stats.js'
import { setPetEnv } from '/game/core/pet/env.js'
import { petInfoFromUnity } from '/game/core/pet/pet-info.js'
import { getSkill } from '/game/core/battle/views.js'
import { getLevelExp, getTotalExp } from '/game/core/pet/exp-system.js'
import { createRng } from '/game/core/rng.js'

// 宠物形象 id → swf 序号 映射表（CSV，单一真值：game/data/pet_appearance_swf.csv）。
// swf 是 Flash 客户端产物，重启（Unity）表没有它，故用这张表把重启的宠物形象 id 桥到 swf 序号；
// 某形象若显式置空（无 swf）⇒ 上层回退重启 png（idleStage 等），见 swfIdOf / parseSwfMap。
const PET_SWF_MAP_CSV = '/game/data/pet_appearance_swf.csv'
// 地图 id → swf 文件名 映射表（CSV，单一真值：game/data/map_swf.csv）。有 swf 映射 ⇒ 走 SWF 地图；否则回退 Unity PNG。
const MAP_SWF_CSV = '/game/data/map_swf.csv'

const R = { pets: null, skills: null, buffs: null, effects: null, growth: null, items: null, activities: null, features: null, official: null, swfSeqById: null, mapSwfById: null, petById: new Map(), skillById: new Map(), buffById: new Map(), growthById: new Map(), itemById: new Map(), activityById: new Map(), featureById: new Map(), ready: null }

// 官方 element 是英文枚举名, 重启只有 elementId。CN→EN 从官方表反查, 不手写第二张表。
let CN2EN = null

export function loadContent() {
  if (!R.ready) R.ready = boot()
  return R.ready
}

async function boot() {
  const j = async (u) => (await (await fetch(u)).json())
  // 暴击贴图配置（DB-C）：上游是 Resources/Data/Battle/critical_effect.csv，走 spritePath="Sprites/"。
  // 故意用容错取（失败当空表）：这张表不是战斗能不能跑的前提，不能让它把整个 boot 拖挂。
  const critCsv = await fetch(CRITICAL_EFFECT_CSV).then((r) => (r.ok ? r.text() : '')).catch(() => '')
  const [pets, skills, buffs, effects, growth, items, activities, features, official] = await Promise.all([
    j('/game/data/unity/pets.json'), j('/game/data/unity/skills.json'),
    j('/game/data/unity/buffs.json'), j('/game/data/unity/effects.json'),
    j('/game/data/unity/growth.json'), j('/game/data/unity/items.json'),
    j('/game/data/unity/activities.json'), j('/game/data/unity/features.json'),
    j('/game/data/pets.json'),
  ])
  R.pets = pets; R.skills = skills; R.buffs = buffs; R.effects = effects; R.growth = growth; R.items = items; R.activities = activities; R.features = features; R.official = official
  // 形象id→swf序号 映射（单一真值 CSV）。取数失败当空表，swfIdOf 退回官方表/ id 兜底，不阻塞 boot。
  const swfMapCsv = await fetch(PET_SWF_MAP_CSV).then(r => r.ok ? r.text() : '').catch(() => '')
  R.swfSeqById = parseSwfMap(swfMapCsv)
  // 地图 id → swf 文件名 映射（单一真值 CSV）。取数失败当空表，mapSwfIdOf 退回动态探测兜底，不阻塞 boot。
  const mapSwfCsv = await fetch(MAP_SWF_CSV).then(r => r.ok ? r.text() : '').catch(() => '')
  R.mapSwfById = parseMapSwfMap(mapSwfCsv)
  R.petById = new Map(Object.values(pets.pets).map(p => [p.id, p]))
  R.skillById = new Map(Object.values(skills.skills).map(s => [s.id, s]))
  R.buffById = new Map((buffs.buffs || []).map(b => [b.id, b]))
  R.growthById = new Map((growth.growth || []).map(g => [g.id, g]))
  R.itemById = new Map((items.items || []).map(it => [it.id, it]))
  R.activityById = new Map((activities.activities || []).map(a => [a.id, a]))
  // 特性/纹章表（featureInfoDict，键 = baseId〔宠 id〕）：上游 PetFeature.cs:15-16 的
  //   featureId/emblemId === 0 ⇒ 取种族默认（键回落 petId），非 0 ⇒ 按该 id 查（= 用别只宠的特性/纹章）。
  R.featureById = new Map((features.features || []).map(f => [f.baseId, f]))
  R.criticalEffects = parseCriticalEffects(critCsv)
  CN2EN = new Map(Object.values(official.monsters).map(m => [m.type, m.element]))
  wirePetEnv()
  wireSkinTables()
  return R
}


// ─────────────────────── 暴击贴图配置（DB-C）───────────────────────
// 上游 BattleCriticalEffectConfig.cs 逐字照搬：Resources/Data/Battle/critical_effect.csv，11 列一_stride。
// ⚠️ 上游把整份文件当**无表头**的定长数组扫，靠 `int.TryParse(data[i+1])` 把表头那一_stride 甩掉 —— 本表实测
//   带表头 1 行 + 数据 **1 行**（anim/990/critical/poster/JoseCritical）。照搬这个「靠列 1 能否解析成整数筛行」的判据。
const CRITICAL_EFFECT_CSV = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Battle/critical_effect.csv'
const CRIT_COLUMNS = 11
const normKey = (v) => String(v ?? '').trim().toLowerCase()
const floatOf = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const normOwner = (v) => {
  switch (normKey(v)) {
    case 'animation': case 'animid': return 'anim'
    case 'baseid': case 'petbase': case 'petbaseid': return 'base'
    default: return normKey(v)
  }
}
// assetKey 无 "/" 且效果类型是 poster ⇒ 补 'Battle/CriticalEffects/' 前缀（ResolveAssetKey）。
const resolveAssetKey = (effectType, assetKey) =>
  (!assetKey || assetKey.includes('/')) ? assetKey : (effectType === 'poster' ? 'Battle/CriticalEffects/' + assetKey : assetKey)

function parseCriticalEffects(csv) {
  const out = new Map()
  if (!csv) return out
  const cells = csv.split(/[\r\n]+/).map((l) => l.split(',')).flat().map((c) => c.trim())
  for (let i = 0; i + CRIT_COLUMNS <= cells.length; i += CRIT_COLUMNS) {
    if (!Number.isInteger(Number(cells[i + 1]))) continue          // 表头那一_stride 靠这句甩掉
    const ownerType = normOwner(cells[i])
    const ownerId = Number(cells[i + 1])
    const eventType = normKey(cells[i + 2])
    const effectType = normKey(cells[i + 3])
    const rawAsset = cells[i + 4] ?? ''
    const isMod = rawAsset.toLowerCase().startsWith('mod:');
    const assetKey = isMod ? rawAsset.slice(4).trim() : rawAsset
    if (!ownerType || !eventType || !effectType || !assetKey) continue
    out.set(`${ownerType}:${ownerId}:${eventType}:${effectType}`, {
      assetKey: resolveAssetKey(effectType, assetKey),
      x: floatOf(cells[i + 5], 0), y: floatOf(cells[i + 6], 0),
      scale: floatOf(cells[i + 7], 1), duration: floatOf(cells[i + 8], 0.75),
      moveX: floatOf(cells[i + 9], 0), moveY: floatOf(cells[i + 10], 0),
    })
  }
  return out
}

// GetCriticalPoster：先按动画 id 找，找不到再按种族 baseId 找；ownerId===0 一律没有（上游 Get 的第一句）。
export function criticalPosterOf(animId, baseId) {
  const m = R.criticalEffects
  if (!m || m.size === 0) return null
  const pick = (ownerType, id, eventType, effectType) =>
    (!Number.isFinite(Number(id)) || Number(id) === 0) ? null : m.get(`${ownerType}:${Number(id)}:${eventType}:${effectType}`) ?? null
  return pick('anim', animId, 'critical', 'poster') ?? pick('base', baseId, 'critical', 'poster')
}

// 贴图落盘路径：ResourceManager.spritePath = "Sprites/"（ResourceManager.cs:27）⇒ Sprites/<resolvedAssetKey>.png
export const criticalPosterUrl = (cfg) =>
  `/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/${cfg.assetKey}.png`
export const contentVersion = () => R.pets?._version || 'lite_4.9.2'
export const hasPet = (id) => R.petById.has(Number(id))

// 解析 pet_appearance_swf.csv（appearance_id,swf_seq,name）。只取前两列；swf_seq 空 / 0 ⇒ 记 0（= 该形象无 swf）。
// name 列仅作人工核对（形象id/ swf序号 通过形象名串联），不参与解析。
function parseSwfMap(csv) {
  const map = new Map()
  if (!csv) return map
  for (const line of csv.split(String.fromCharCode(10))) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(',')
    const id = Number(parts[0])
    if (!Number.isFinite(id)) continue              // 跳过表头等非法行
    const seq = Number(parts[1])
    map.set(id, Number.isFinite(seq) && seq > 0 ? seq : 0)
  }
  return map
}

// 动画 id 桥: 重启（Unity）表没有 swfId（它不是 Flash 客户端），用 pet_appearance_swf.csv（单一真值表）
// 把宠物形象 id 桥到 swf 序号。CSV 是完整映射：在表里的形象，swf_seq>0 取该序号、显式置空(0/空) 返回 null；
// **不在表里 = 无 swf**（如重启独占宠 10001、或尚未移植的形象），直接返回 null ⇒ 上层回退重启 png，
// 绝不拿 id 去乱查一个不存在的 swf。只有 CSV 本身没加载成功（极罕）才退回官方表 / id 兜底，演出不阻塞。
export function swfIdOf(id) {
  const key = Number(id)
  if (!Number.isFinite(key)) return null
  const map = R.swfSeqById
  if (map) {
    if (!map.has(key)) return null          // 不在映射表 = 无 swf ⇒ 重启 png（icon / battle）
    const seq = map.get(key)
    return seq > 0 ? seq : null            // 显式置空 = 无 swf ⇒ 上层用 png
  }
  const m = R.official?.monsters?.[key]
  return m ? m.swfId : key                 // 兜底仅当 CSV 未加载
}

// 解析 map_swf.csv（map_id,name,png_seq,swf_seq）。只取第 0 列（map_id，可为负数，以字符串为键）与第 3 列（swf_seq = swf 文件名，空 = 无 swf）；
// name / png_seq 列仅作人工核对，不参与解析。
function parseMapSwfMap(csv) {
  const map = new Map()
  if (!csv) return map
  for (const line of csv.split(String.fromCharCode(10))) {
    const t = line.trim()
    if (!t) continue
    const parts = t.split(',')
    if (!parts[0] || parts[0] === 'map_id') continue   // 跳过表头 / 非法行
    const swf = (parts[3] || '').trim()
    map.set(parts[0], swf || '')                         // '' = 该图无 swf
  }
  return map
}

// 地图 swf 桥：用 map_swf.csv（单一真值表）把地图 id 桥到 swf 文件名（含 .swf，如 10001.swf）。
// 在表里且 swf_seq 非空 ⇒ 返回该文件名（上层走 SWF 地图渲染）；否则返回 null ⇒ 上层回退 Unity PNG 背景。
// CSV 未加载（极罕）⇒ 返回 null，由 loadMap 退回动态探测兜底。
export function mapSwfIdOf(id) {
  const key = String(id)
  const map = R.mapSwfById
  if (!map) return null
  if (!map.has(key)) return null          // 不在映射表 = 无 swf ⇒ PNG
  const swf = map.get(key)
  return swf ? swf : null
}

export const elementNameOf = (id) => ELEMENT_NAMES[Number(id)] || ELEMENT_NAMES[0]
export const elementEnOf = (id) => CN2EN.get(elementNameOf(id)) || 'Normal'

// ── 指引面板（C3·GuideLine）查表出口 ──────────────────────────────────────
// 23×23 谁克谁 / 55 性格加成的**判断与算术全在 L0**（element.ts / status.ts）；L2 只整理成视图能直接画的行/区。
// mode = 'attack'（我打谁，取表列）| 'defense'（谁打我，取表行）；三区谓词照 PetElementView.cs:39-42。
export function elementRelationLists(elementId, mode = 'attack') {
  const byMode = mode === 'defense' ? getDefenseRelation : getAttackRelation
  return {
    weak: byMode(elementId, (v) => v > 1),
    resist: byMode(elementId, (v) => v > 0 && v < 1),
    zero: byMode(elementId, (v) => v === 0),
  }
}

// 属性总数（23）= PetElementSystem.elementNum；视图画 23 格时用它，不另写常量。
export const ELEMENT_COUNT = ELEMENT_NUM

// 性格页五列 = 物攻/特攻/物防/特防/速度；体力永不加成（getPersonalityBuff 的加减索引只落 0..4），不画。
export const PERSONALITY_STAT_NAMES = STATUS_TYPE_NAMES_CN.slice(0, 5)

// PERSONALITY 是 name→id；视图要 id→name，就地反查，不手写第二张表。
const PERSONALITY_NAMES = Object.fromEntries(Object.entries(PERSONALITY).map(([name, id]) => [id, name]))

function personalityCellOf(v) {
  if (v > 1) return { text: '+10%', tone: 'up' }
  if (v < 1) return { text: '-10%', tone: 'down' }
  return { text: '-', tone: 'flat' }
}

// 55 行（0..54），列数与 PERSONALITY_STAT_NAMES 对齐；tone 给视图上色，视图不再碰数值。
export function personalityRows() {
  return Object.keys(PERSONALITY_NAMES).map(Number).sort((a, b) => a - b).map((id) => {
    const buff = getPersonalityBuff(id)
    return {
      id,
      name: PERSONALITY_NAMES[id],
      cells: PERSONALITY_STAT_NAMES.map((_, i) => personalityCellOf(buff.at(i))),
    }
  })
}

// 底部说明。默认空格分隔 = 单行放下；上游默认 '\n' 保留在 L0。
export const personalityBuffDescription = (id, delim = ' ') => getPersonalityBuffDescription(Number(id), delim)

// 单属性性格加成方向（视图上箭头用）：up = +10% / down = -10% / flat = 无加成。
// i 取 Status 内部索引（0..4 = 物攻/特攻/物防/特防/速度，5 = 体力恒 flat）。
export const personalityStatTone = (id, i) => {
  const v = getPersonalityBuff(Number(id)).at(i)
  return v > 1 ? 'up' : v < 1 ? 'down' : 'flat'
}

const TYPE_CN = { [SkillType.物理]: '物理', [SkillType.特殊]: '魔法', [SkillType.属性]: '属性', [SkillType.必杀]: '必杀', [SkillType.连携]: '连携' }
export const categoryOf = (type) => TYPE_CN[type] || '属性'

// 重启 SkillView → 内核/表现层要的技能卡。字段一个不删: type/combo/critical/priority/effects
// 是 S3 效果派发直接吃的, accuracy/power 是今天判据要看的数据。
export function skillView(id) {
  const s = R.skillById.get(Number(id))
  if (!s) return null
  return {
    baseId: s.id,
    name: s.name,
    power: s.power,
    accuracy: s.accuracy,
    rage: s.anger,
    category: categoryOf(s.type),
    type: s.type,
    critical: s.critical,
    // Skill.cs:103/123/186 把 combo/chain 起手设为 1, 只有 options["combo"] 会改写 (Skill.cs:698-702)。
    // 实测整张 5340 技表里 options.combo **一条都没有** (0/5340), 所以恒为 1 是表驱动的事实, 不是偷懒。
    combo: s.combo ?? 1,
    chain: s.chain ?? 1,
    priority: s.priority,
    vipriority: s.vipriority,
    maxPP: s.maxPP,
    element: elementEnOf(s.elementId),
    elementId: s.elementId,
    desc: s.rawDescription || '',
    // 产物里的 options 是**有序 pair 数组** (见 build-unity-data.mjs 的 optPairs 注释);
    // 这里只是把它交给即将退役的内核当查表用, 顺序对它无所谓, 所以显式塌回对象。
    options: Object.fromEntries(s.options || []),
    effects: s.effects || [],
    referBuffList: s.referBuffList || null,
    isSecondSuper: s.isSecondSuper,
  }
}

// 能力值走**移植后的公式** (Status.cs:385-391), 不再用官方 rules 的曲线。
// iv/ev/personality 缺省取中性 (性格 0 = 实干 → buff 全 1; iv 0; ev 全 0)。
export function normalStatusOf(petId, level = 100, { iv = 0, ev = null, personality = 0 } = {}) {
  const p = R.petById.get(Number(petId))
  if (!p) return null
  const b = p.baseStatus
  const base = new Status([b.atk, b.mat, b.def, b.mdf, b.spd, b.hp])
  return getPetNormalStatus(Math.trunc(level), base, iv, ev ? new Status(ev) : Status.zero(), personality)
}

// 内核/stats 层的六维形状 (官方命名)
export function statsOf(petId, level = 100, opts) {
  const s = normalStatusOf(petId, level, opts)
  if (!s) return null
  return { hp: s.hp, atk: s.atk, def: s.def, spa: s.mat, spd: s.mdf, spe: s.spd }
}

export const maxHpOf = (petId, level = 100, opts) => statsOf(petId, level, opts)?.hp || 1

// 宠 → 内核 petConfig。learnLevelList 是重启表自己的「技能学习等级」,
// 用它过滤出战技能 (替代官方 rules.skillUnlock 的 1+i*20 猜测)。
export function petConfig(petId, level = 100, { unlockedOnly = false, iv, ev, personality } = {}) {
  const p = R.petById.get(Number(petId))
  if (!p) return null
  const ids = p.skills?.skillIdList || []
  const lvs = p.skills?.learnLevelList || []
  let list = ids.map((id, i) => { const sk = skillView(id); return sk ? { ...sk, unlockLv: lvs[i] ?? 1 } : null }).filter(Boolean)
  if (unlockedOnly) {
    const ok = list.filter(s => s.unlockLv <= level)
    list = ok.length ? ok : list.slice(0, 1)
  }
  const super1 = list.find(s => s.category === '必杀')
  const normals = list.filter(s => s.category !== '必杀').slice(0, 4)
  const picked = super1 ? [...normals, super1] : normals
  return {
    name: p.name,
    swfId: swfIdOf(p.id),
    level: Math.trunc(level),
    element: elementEnOf(p.elementId),
    elementId: p.elementId,
    subElementId: p.subElementId,
    star: p.ui?.star ?? 0,
    stats: statsOf(p.id, level, { iv, ev, personality }),
    skills: picked,
  }
}

// ── 宠的可学技能表（精灵技能面板 · L2 出口）─────────────────────────────
// 真值：docs/view/panel/petbag/skill-panel-design.md §5.2；解码照上游
// Scripts/MVC/Model/Basic/Skill/SecretSkillDatabase.cs:20-23（负数 = 整个数就是 secretType；
// 正数 = 高位类型 * 10000 + value）。原始 learnLevelList **原样保留**（实测 6693 条里 536 条为负）。
// 卡片字段从 skillView(id) 取（名/类别/威力/命中/元素/描述/type）—— 面板与 L1 都只经这一份。
// `isAutoLearned` 照上游 `LearnSkillInfo.isAutoLearned`（SecretSkillDatabase.cs:11）= `(secretType == Auto) || (value == 0)`，
//    **两个分支都要** —— 只判 `secretType === -2` 会漏掉 `value == 0` 那一类（实测 6693 条里 5 条）。
// ⚠️ **本字段目前 app 侧零消费者**（`skillPane.js` 的 `learnLabel` 只读 `unlockRaw`，`skill-ops.learnableAt` 也只读 `unlockRaw`）⇒ 本次只是**字段口径校正**、当前零可见效果；
//    真正会误判的是**判据本身**，见 L1 `skill-ops.js` 的 `learnableAt`（docs/status.md 已登记为待修项）。
export function skillLearnOf(petId) {
  const p = R.petById.get(Number(petId))
  if (!p) return []
  const ids = p.skills?.skillIdList || []
  const lvs = p.skills?.learnLevelList || []
  return ids.map((id, i) => {
    const sk = skillView(id)
    if (!sk) return null
    const raw = Number(lvs[i] ?? 0)
    const secretType = raw < 0 ? raw : Math.floor(raw / 10000)
    const value = raw < 0 ? raw : raw % 10000
    return {
      id: sk.baseId, name: sk.name, type: sk.type, category: sk.category,
      power: sk.power, accuracy: sk.accuracy, element: sk.element, desc: sk.desc,
      unlockRaw: raw, secretType, value, isAutoLearned: secretType === -2 || value === 0,
    }
  }).filter(Boolean)
}

// ★MDB11（人类 2026-10-21）：`pruneWildPool()` **已随合成野怪表退役删除** —— 它唯一的消费者是
//   `mapScene.js` 读 `game/data/wild.json` 那一段（我方合成、非真值）；野怪分布现在**单一来源** = 地图 XML 的
//   `<npc><wild>`（经 `loadMap` → `parse-map.js` 的 `wild` 列 ⇒ `entity.buildEntities`）。`hasPet()` 仍要留（战斗侧在用）。

// ── 重启原生存档 (v3) 权威 ───────────────────────────────────────────────
// 与官方 session/petHpMax (iv=31 + 官方基值) 是**两套曲线**: 实测 id1 迪兰 官方上限 311,
// 重启 iv=0 上限约 360 且名字是「迪迪兰」—— 宇宙差为真, 不是表面差异。v3 全程只读这里的重启权威。

// HP/六维: 走 getPetNormalStatus + 重启 unity/pets.json 基值, iv 固定 0 (与驱动 seedPet→petConfig 同口径)。
export const restartHpMax = (petId, level = 100) => maxHpOf(petId, level, { iv: 0, ev: null, personality: 0 })
export const restartNameOf = (petId) => R.petById?.get(Number(petId))?.name ?? null
export const restartExpTypeOf = (petId) => R.growthById?.get(Number(petId))?.expType ?? 0
export const restartBeatExpParam = (petId) => R.growthById?.get(Number(petId))?.beatExpParam ?? 65

// 等级进化: 只取 evolveLevels>0 且 evolvePetIds>0 的档 (evolveLevels:[0] = 道具/特殊进化, 本轮跳过), 按 at 升序。
export function restartEvolveOf(petId) {
  const g = R.growthById?.get(Number(petId))
  if (!g) return []
  const ids = g.evolvePetIds || [], lvs = g.evolveLevels || []
  return ids.map((to, i) => ({ to: Number(to), at: Number(lvs[i] || 0) }))
    .filter(e => e.at > 0 && e.to > 0)
    .sort((a, b) => a.at - b.at)
}

// ── ★图鉴（C1 第三份 · docs/view/panel/dex/dex-design.md DX3/DX4/DX6）───────────────────────────
// **VP5 反转的唯一数据面代价**（人类 2026-10-19 点名"实现精灵图鉴面板" ⇒ 当年"不加全量枚举"作废；正本 = dex-design §8 DX0-a + §9）。
// 三只都是**读表、零算数**（V-2：过滤 / 排序 / 谓词在 L1，视图不重算）。
export const restartAllPets = () => (R.pets?.pets || []).slice()             // 原始 838 行（不滤 hide、不排序）
export const restartTopicPetIds = () => (R.pets?.topicPetIds || []).slice()  // 生成物新字段（桥从 version.xml `<topicPetId>` 带出；缺 ⇒ 空数组）
// 进化链**原始目标**（含 `evolveLevels=0` 的道具/特殊进化）⇒ 图鉴"已获得"谓词专用。
// ⚠️ **不许**复用上面的 `restartEvolveOf()`：它 `filter(at > 0)`（升级进化专用），谓词不同 = dex-design DX4 第 2 条。
export const restartEvolveTargetsOf = (petId) => (R.growthById?.get(Number(petId))?.evolvePetIds || []).map(Number)

// ── 特性 / 纹章 / 性别 / 个体值评级 / 等级上限（精灵背包 HUD + 基础信息 · 上游逐条照搬）──────────
// 特性/纹章（上游 PetFeature.cs:15-16）：featureId/emblemId === 0 ⇒ 种族默认（键回落 petId），
//   非 0 ⇒ 按该 id 查表（= 换用别只宠的特性/纹章，工坊/Mod 场景）。「佩不戴纹章」是另一层（hasEmblem，调用方判）。
export const restartFeatureOf = (petId, featureId = 0) => {
  const key = (Number(featureId) || 0) === 0 ? Number(petId) : Number(featureId)
  const info = R.featureById.get(key)
  return info ? info.feature : null
}
export const restartEmblemOf = (petId, emblemId = 0) => {
  const key = (Number(emblemId) || 0) === 0 ? Number(petId) : Number(emblemId)
  const info = R.featureById.get(key)
  return info ? info.emblem : null
}
// 性别名（上游 PetIVSystem.genderNameDict：-1 无性 / 0 雄性 / 1 雌性 / 2 双性；未知 ⇒ 未知性别）。
const GENDER_NAMES = { [-1]: '无性', 0: '雄性', 1: '雌性', 2: '双性' }
export const restartGenderName = (gender) => GENDER_NAMES[Number(gender)] ?? '未知性别'
// 个体值评级（上游 PetIVSystem.GetIVRank + IVRanking 枚举）：<11 一般 / <21 良 / <28 优 / <31 稀 / ==31 极。
// 越界（<0 = Bad / >31 = Cheat）⇒ null：调用方画裸值，不造评级词。
export const restartIvRankOf = (iv) => {
  const v = Math.trunc(Number(iv) || 0)
  if (v < 0 || v > 31) return null
  if (v < 11) return '一般'
  if (v < 21) return '良'
  if (v < 28) return '优'
  if (v < 31) return '稀'
  return '极'
}
// 等级上限（上游 PetExp.GetMaxLevel 表侧臂）：20001..30000 神兽段 ⇒ 105，其余 100。
// ⚠️ 档里的 exp.fixedMaxLevel（>0 时优先）是**存档侧**的，归会话层读，不在这张表里。
export const restartMaxLevelOf = (petId) => (Number(petId) >= 20001 && Number(petId) <= 30000 ? 105 : 100)

// 进化落盘要写的两个皮肤/种族 id（上游 `new Pet(evolveId, original)` 的 `ui = new PetUI(
// info.ui.defaultSkinId, info.ui.baseId, …)` —— 两个都取**新形态**的 info）。
//   skinId = `<ui id>`：新形态自己的皮肤（实测 unity 表 defaultSkinId 恒等于该形态 id）。
//   baseId = `<ui baseId>`：**种族**，进化链上恒定不变（实测 838 形态里只有 320 个 baseId===id，
//   迪兰→迪迪兰→迪兰特→迪兰特斯 全是 baseId=1）—— 它是「退化/同链」的锚，不是形态 id。
// 缺形态（表里查不到）⇒ null，调用方保留档里原值不动，绝不写 0。
export function restartUiOf(petId) {
  const ui = R.petById?.get(Number(petId))?.ui
  if (!ui) return null
  return {
    skinId: Number.isFinite(Number(ui.defaultSkinId)) ? Number(ui.defaultSkinId) : Number(petId),
    baseId: Number.isFinite(Number(ui.baseId)) ? Number(ui.baseId) : Number(petId),
  }
}

// 进化落盘要重算的两组基值（上游 `Pet(int evolvePetId, Pet originalPet)`（Pet.cs:212-233））：
//   · `currentStatus = new Status(normalStatus)` ⇒ **六维按新形态重算**（不是搬旧值）
//   · `new PetBasic(evolvePetId, …)` ⇒ `height/weight = base + Random.Range(0,6)` **重掷**
// 本出口只给**表侧基值**（baseStatus 六维基值 + 身高/体重基值）；iv/ev/personality 由调用方从档里取（那是个体值，不在表里）。
// 实测：真机档 6/6 只宠的 `currentStatus` 与本公式逐字节吻合 ⇒ 公式与字段口径已对拍。
export function restartBaseOf(petId) {
  const p = R.petById.get(Number(petId))
  if (!p) return null
  const b = p.baseStatus || {}
  return {
    baseStatus: { atk: Number(b.atk) || 0, mat: Number(b.mat) || 0, def: Number(b.def) || 0, mdf: Number(b.mdf) || 0, spd: Number(b.spd) || 0, hp: Number(b.hp) || 0 },
    baseHeight: Number.isFinite(Number(p.baseHeight)) ? Number(p.baseHeight) : 0,
    baseWeight: Number.isFinite(Number(p.baseWeight)) ? Number(p.baseWeight) : 0,
  }
}
// ── 道具权威 (重启 items.json 表驱动, 面板只读不算) ──────────────────────
// 权威源 = unity/items.json (与官方 game/data/items.json 是两个宇宙, 不得混)。数量来自 A.state.items, 这里只给「是什么」。
export const restartItemOf = (id) => R.itemById?.get(Number(id)) || null
export const restartAllItems = () => Array.from(R.itemById?.values() || [])
export const restartItemNameOf = (id) => R.itemById?.get(Number(id))?.name ?? null
// ── 活动权威 (unity/activities.json; ActivityInfo 逐行搬运) ──────────────────────
// 面板只读不算 (V-2)：可见活动 = 全表里 !hide 者 (上游 ActivityPanel.Init 同口径)。
// 单条按 id 查（id 是字符串，如 "noob"/"2609"）。数据面归本层，跳转/袋读写归装配层 (mapScene)。
export const restartAllActivities = () => R.activities?.activities || []
export const restartActivityOf = (id) => R.activityById?.get(String(id)) || null
// 地图天气读数 —— 上游 Buff.GetWeatherBuff(id): buffId = 50_0000 + weather, 查不到退回 50_0000「无」;
// MapInfoView.SetWeather 再判 weather == 0 隐藏钮。这里只按上游口径查表, 面板不自己攒名字。
export const restartWeatherOf = (weather) => {
  const w = Number(weather) || 0
  return w === 0 ? null : (R.buffById?.get(500000 + w) || R.buffById?.get(500000) || null)
}
// 捕捉胶囊效果行 (unity items.json 内嵌, abilityId:3) —— 只如实从表里取, 概率/门槛都在内核 Capture 算子里判, 面板不算数。
export const restartCaptureEffectOf = (id) => (R.itemById?.get(Number(id))?.effects || []).find(e => e.abilityId === 3) || null
// typeRaw 显示名 (纯表现映射, 非数值权威; 未知键回落原英文, 不臆造)
const ITEM_TYPE_CN = {
  currency: '货币', package: '礼包', mine: '矿物', stuff: '材料', equipment: '装备', shoot: '射击',
  exp: '经验', iv: '个体值', ev: '努力值', capture: '捕捉', personality: '性格', hp_potion: '体力药剂',
  buff: '增益', achievement: '成就', skill: '技能', recipe: '配方', emblem: '徽章', evolve: '进化',
  animal_product: '畜产品', seed: '种子', plant: '植物', fertilizer: '肥料', animal_child: '幼崽',
  animal: '动物', animal_action: '动作',
}
export const restartItemTypeOf = (id) => {
  const it = R.itemById?.get(Number(id))
  if (!it) return null
  return { raw: it.typeRaw, cn: ITEM_TYPE_CN[it.typeRaw] || it.typeRaw }
}

// 组装注入 restartSession 的 auth (纯存档模块不 import content, 权威由场景经此注入)。
// exp 的曲线**系数**仍缺 → 借 rules.json 的 A/B 形状 (levelExp/levelFromTotalExp 官方纯函数), expType 0→A / 1→B
// 是观测到的两桶映射 (growth 全表仅 0|1); 待内核 S6 搬 ProcessResult/SetExp 后只换 exp.levelExpAt/levelFromTotalExp。
export function buildRestartAuth(rules) {
  const CURVE = ['A', 'B']
  const expCurve = rules.expCurve
  return {
    hpMax: (id, lv) => restartHpMax(id, lv),
    nameOf: (id) => restartNameOf(id),
    swfIdOf: (id) => swfIdOf(id),
    exp: {
      beatExpParamOf: (id) => restartBeatExpParam(id),
      expTypeOf: (id) => restartExpTypeOf(id),
      levelExpAt: (expType, lv) => levelExp(expCurve, CURVE[expType] ?? 'A', lv),
      levelFromTotalExp: (expType, exp) => levelFromTotalExp(expCurve, CURVE[expType] ?? 'A', exp, expCurve?.maxLevel || 100),
      evolveOf: (id) => restartEvolveOf(id),
      settleDivisor: rules.expSettle?.divisor ?? 255,
      _source: 'borrowed-A/B-shape',
    },
  }
}

// ── 地图权威（**方案 C**：进图时现场取那一条 Unity XML、现场解析）────────────────
// 取数入口 = 这里（L2 单一出口，`docs/arch-code.md §3` 规则 4 / 地图线 **M-6**）：
//   app 侧只经 `loadMap(id)` 拿地图数据；**纯解析器**在 `game/logic/map/parse-map.js`
//   （node 侧 `tools/map-audit.mjs` 用**同一份**跑全库对账 ⇒ 两边不漂移）。
// ⚠️ 与 `game/data/maps.json`（**AS3 血统**，259 张，仍供 B3 画面与光口坐标）是**两套血统**：
//   本出口服务**规则与实体**（Unity 272 张，MQ1）；两份**各自独立**、不许交叉覆盖（M-8 / D2/D3）。
// ⚠️ 记录里的四张处理器表是**原始 XML 片段串**，语义解析归 L0（`docs/map/map-data.md §3.2 MDI10`）——
//   本层**不做** condition/action 判断。
// ⚠️ **不缓存**（人类 2026-10-18：进过的图不要缓存）—— 每次进图都重新取、重新解析。
//   dev 期**直接吃上游**（路径写成常量；`tools/serve.mjs` 服务仓库根 ⇒ 今天就能取）。
const MAPS_XML_DIR = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps'
const MAPS_AS3_DIR = '/swf/map/config'                 // AS3 只读适配器（并存列 + swf 回退第 ② 级）
const MAP_SWF_DIR = '/swf/map'                         // 本地已有的地图 SWF（判"在不在"）

const getText = async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null } catch { return null } }
const headOk = async (url) => { try { return (await fetch(url, { method: 'HEAD' })).ok } catch { return false } }

// 进一张图：取 XML → 现场解析 → 补齐 AS3 并存列与 swf 回退链 ⇒ `MapRecord`（字段清单 = `docs/map/map-data.md §3.2`）。
// 图不存在（404）/ 解析失败 ⇒ `null`（调用方走 B3 的"缺图"路径，不抛）。
export async function loadMap(id) {
  const key = String(id)
  const [raw, as3Xml] = await Promise.all([
    getText(`${MAPS_XML_DIR}/${key}.xml`),
    getText(`${MAPS_AS3_DIR}/${key}.xml`),
  ])
  if (raw == null) return null
  const rec = parseMapXml(raw, { file: `${key}.xml`, id: key })
  if (!rec) return null
  rec.initAs3 = as3InitOf(as3Xml)
  const cands = swfCandidatesFor(rec, { id: key, as3Resource: as3ResourceNameOf(as3Xml) })
  const { swf, swfOk } = await pickSwf(cands, (name) => headOk(`${MAP_SWF_DIR}/${name}`))
  rec.swf = swf; rec.swfOk = swfOk
  // 单一真值 CSV（map_swf.csv）优先覆盖：有 swf 映射 ⇒ 用 swf 文件名，否则 null ⇒ 回退 Unity PNG。
  if (R.mapSwfById) { const csv = mapSwfIdOf(key); rec.swf = csv; rec.swfOk = csv ? true : false }
  rec.fightMapOk = rec.fightMap != null && await headOk(`${MAP_SWF_DIR}/${rec.fightMap}.swf`)
  return rec
}

// 七类实体的空表（`loadMap` 拿到的记录里总有七类；这里是"没有记录"时的占位，MP7 静默兜底）。
export const emptyEntities = () => ({ teleports: [], npcs: [], farms: [], animals: [], ponds: [], insects: [], nests: [] })
// 从已有记录取实体表（**不再自己取数**；记录由 `loadMap(id)` 给）。
export const entitiesOf = (record) => record?.entities || emptyEntities()

// ── M8 外观数据桥（懒加载；只取一次，不违反 §4.9“地图不缓存”）────────────────
// 失败 ⇒ null / 空清单 + 一行日志；L1 退“仅默认裸装”，不阻塞进图（map-impl §3.10.1）。
const LOOK = { index: null, indexReady: null, manifest: null, manifestReady: null }
const EMPTY_MANIFEST = { packs: {}, missing: [] }

export function loadEquipIndex() {
  if (!LOOK.indexReady) {
    LOOK.indexReady = fetch('/game/data/equip-index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { LOOK.index = j; return j })
      .catch((e) => { console.warn('[content] loadEquipIndex 失败，外观退默认裸装:', e); LOOK.index = null; return null })
  }
  return LOOK.indexReady
}

export function loadActorManifest() {
  if (!LOOK.manifestReady) {
    LOOK.manifestReady = fetch('/game/data/actor/equip/manifest.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { LOOK.manifest = j || EMPTY_MANIFEST; return LOOK.manifest })
      .catch((e) => { console.warn('[content] loadActorManifest 失败，装备包按缺件处理:', e); LOOK.manifest = EMPTY_MANIFEST; return LOOK.manifest })
  }
  return LOOK.manifestReady
}

// D6 B7: 把已加载的 D7 数据桥接进 PetEnv 接缝, 让运行时造宠走域模型 Pet 而非 content.petConfig。
function wireSkinTables() {
  // 决议④ skin 三表桥：Web 运行时无 Mod CSV（persistentDataPath/PetAnimation/pet/*.csv），
  // 故三表恒空——任意 skinId 查不到返 null（0 哨兵默认）。真实行待工坊/Mod 落盘目录接入（未来）。
  const miss = () => null
  setPetEnv({ hitInfo: miss, soundInfo: miss, transformInfo: miss })
}

function wirePetEnv() {
  setPetEnv({
    petInfo: (id) => { const raw = R.petById.get(Number(id)); return raw ? petInfoFromUnity(raw) : null },
    getSkill: (id) => getSkill(id, false),
    getLevelExp: (level, expType) => getLevelExp(level, expType),
    getTotalExp: (level, expType) => getTotalExp(level, expType),
    evolveChain: (baseId, id) => {
      const chain = []
      const seen = new Set()
      let cur = R.petById.get(Number(id))
      while (cur && cur.id !== baseId && !seen.has(cur.id)) {
        seen.add(cur.id)
        const ev = cur.growth && Array.isArray(cur.growth.evolvePetIds) ? (cur.growth.evolvePetIds[0] ?? 0) : 0
        if (ev === 0) break
        const next = R.petById.get(Number(ev))
        if (!next) break
        chain.push(ev)
        cur = next
      }
      return chain
    },
    petInfoIds: () => [...R.petById.keys()],
    buffIdsOfGroup: (group) => {
      const out = []
      const list = (R.buffs && R.buffs.buffs) || []
      for (const b of list) {
        const opts = b.options || (b.info && b.info.options)
        let g = null
        if (opts && typeof opts.get === 'function') g = opts.get(group)
        else if (opts && typeof opts === 'object') g = opts[group]
        if (g === group) out.push(b.id)
      }
      return out
    },
    rng: createRng(Date.now() >>> 0),
    now: () => Date.now(),
  })
}
