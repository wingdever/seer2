// L1 · 地图 XML → MapRecord 的**纯解析器**（零 DOM / 零 IO / 零 fetch）。
//
// 为什么独立成模块（人类 2026-10-18 拍板 = 方案 C「运行时现场解析」）：
//   读侧权威 = 重启（Unity）件 `Assets/Resources/Data/Maps/*.xml`（272 张，MQ1）。
//   进某一张图时**现场取那一条 XML、现场解析** —— 不再有构建期的大表产物（`maps.json` 退役）。
//   解析器**一份两用**：浏览器由 `game/app/content.js` 的 `loadMap(id)` 调；node 侧由
//   `tools/map-audit.mjs` 读全库跑**同一份代码**出对账数字 ⇒ 两边不会漂移。
//   ⚠️ **取数入口在 `content.js`（fetch 在那里）**，本模块**只吃字符串**（MDI10：只做结构、不做语义）。
//
// 真值：`docs/map/map-data.md §2/§3.2`（字段清单与归一化规则）· `§2.9/§3.2`（注释直接忽略，D11）
//       `docs/map/map-code-map.md §5.1`（MapRecord 的消费方）
// 纪律：MDI4（resId 存原串 + 只分类）· MDI5（零运行时求值）· MDI7（先剥注释再解析）· MDI10（不解析 condition/action）
//       MDI2（图 id：Unity `@id` 优先、文件名兜底）· MDI3（双坐标系：init/initAs3 并存）
//
// ⚠️ 本模块**不算 swf**（那要问"文件在不在"）—— 候选链在这里出（`swfCandidatesFor`），
//    由取数方注入"存不存在"的判据（浏览器 = HEAD 探针；node = `fs.existsSync`）后 `pickSwf`。

import { XMLParser } from 'fast-xml-parser'

// resId 六形状的分类**已下沉 L0**（`game/core/map/map-table.ts` 的 `parseAssetRef`，MB2 落码）——
// 本模块**搬用**它，不重写（一份实现、两处不漂移）。L1 → L0 是允许的下行依赖。
import { parseAssetRef } from '../../core/map/map-table.js'

// ── XML：真解析（D1 = fast-xml-parser）+ preserveOrder 保住原文顺序与文本节点 ──────
const PARSER = new XMLParser({
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@',
  trimValues: false, parseTagValue: false, parseAttributeValue: false,
  cdataPropName: '#cdata', commentPropName: '#comment',
  ignoreDeclaration: true, allowBooleanAttributes: true,
})

/** MDI7：先剥 `<!-- -->` 再解析；剥掉的内容一律丢弃（无例外，人类 2026-10-18 / D11）。 */
export const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '')

const META = new Set([':@', '#text', '#cdata', '#comment'])
const elName = (n) => Object.keys(n).find((k) => !META.has(k))
const isEl = (n) => elName(n) !== undefined
const isText = (n) => '#text' in n || '#cdata' in n
const cdataOf = (n) => (n['#cdata'] || []).map((x) => x['#text'] ?? '').join('')
const textOf = (n) => ('#cdata' in n ? cdataOf(n) : n['#text'] ?? '')

const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s) => escText(s).replace(/"/g, '&quot;')

// 片段串 = 由 preserveOrder 树重建：CDATA 仍作 CDATA、文本与属性重新转义
// （语义 = 上游原文；空白与自闭合形态归一。fast-xml-parser 不给原文偏移，故不是逐字节切片）
function xmlOf(n) {
  if (isText(n)) return '#cdata' in n ? `<![CDATA[${cdataOf(n)}]]>` : escText(n['#text'] ?? '')
  const name = elName(n)
  if (!name) return ''                                   // 注释：顺手丢弃（D11）
  const attrs = Object.entries(n[':@'] || {})
    .map(([k, v]) => ` ${k.replace(/^@/, '')}="${escAttr(String(v))}"`).join('')
  return `<${name}${attrs}>${(n[name] || []).map(xmlOf).join('')}</${name}>`
}

const els = (list, name) => (list || []).filter((n) => isEl(n) && elName(n) === name)
const el = (list, name) => els(list, name)[0] || null
const kids = (e) => (e ? e[elName(e)] || [] : [])
const at = (e, k) => { const a = e && e[':@']; return a && ('@' + k) in a ? String(a['@' + k]) : null }
const text = (e) => (e ? kids(e).filter(isText).map(textOf).join('').trim() : null)
const rawAttrs = (e) => {
  if (!e) return null
  const a = e[':@'] || {}
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k.replace(/^@/, ''), String(v)]))
}

const numOrNull = (s) => { if (s == null || s === '') return null; const n = Number(s); return Number.isFinite(n) ? n : null }
const idOf = (s) => (s != null && /^-?\d+$/.test(s) ? Number(s) : s)     // 数字 id 存数、非数存原串
const vec2 = (s) => {
  const m = s == null ? null : /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(s)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}
const boolOf = (s, dflt) => (s == null ? dflt : /^(true|1)$/i.test(s))

// ── resId 六形状：**只分类、不拼接、不求值**（MDI4/MDI5）────────────────────────
// ⚠️ 实现已下沉 L0 ⇒ `game/core/map/map-table.ts` 的 `parseAssetRef`（MB2）。此处只留一行指针。

// ── `<wild>`（形状归 M7 §3.1；缺省 = NpcInfo.cs 的类缺省【源码】）────────────────
const WILD_MOVE_DEFAULT = {
  mode: 'stationary', radius: 120, speed: 35, idle: '2,6', step: '14,30',
  moveTick: 0.08, snap: 1, bob: 0, bobSpeed: 2, flip: true, debug: false, originalFacesRight: false,
}
function wildOf(wildEl) {
  if (!wildEl) return null
  const movement = { ...WILD_MOVE_DEFAULT }
  const mv = el(kids(wildEl), 'movement')
  if (mv) {
    const a = rawAttrs(mv) || {}
    for (const [k, d] of Object.entries(WILD_MOVE_DEFAULT)) {
      if (a[k] === undefined) continue
      movement[k] = typeof d === 'number' ? (numOrNull(a[k]) ?? d)
        : typeof d === 'boolean' ? a[k] === 'true' : a[k]
    }
  }
  let talk = null
  const talkEl = el(kids(wildEl), 'talk')
  if (talkEl) {
    talk = {
      chance: numOrNull(at(talkEl, 'chance')) ?? 0.35,
      duration: numOrNull(at(talkEl, 'duration')) ?? 1.8,
      interval: at(talkEl, 'interval') ?? '5,10',
      self: els(kids(talkEl), 'self').map((s) => (at(s, 'image') != null
        ? { image: at(s, 'image') } : { text: text(s) ?? '' })),
    }
    // `<scene>` / `<player>` 两张表实测 0 条 ⇒ 不建列（MWQ5）
  }
  return { visual: at(wildEl, 'visual') ?? 'auto', movement, talk }
}

// ── `<battle>` 的 `battles[]` 列（施工批 **MB7** / `MDB6-a`；形状正本 = `docs/map/map-battle-trigger.md §3.1`）──
// ⚠️ **桥只做结构**（`MDI10`）：settings / BossInfo 是**战斗数据列**（不是 condition/action）⇒ 这里解析；
//    但 `winHandler`/`loseHandler` 里的按钮**存成原始片段串**（与四张 handler 容器同规），语义解析交 M2（`resolve→run`）。
//    `content` 列**不建**（双重死列，§2.2）；★`@count` **不裁敌方**（`BTI2`：上游只对己方 `Take`，敌方无 `Take`）。

const csvInts = (s) => (s == null || s === '' ? [] : String(s).split(',').map((x) => Number(x.trim())).filter(Number.isFinite))

/** `<pet>`（敌方 `BossInfo`；与玩家宠**不是同一个类**，进场才 `GetBattlePet` ⇒ 接缝归 E3/D6）。§2.5 九列。 */
function bossOf(petEl) {
  const c = kids(petEl)
  const statusEl = el(c, 'status')
  const status = statusEl
    ? Object.fromEntries(kids(statusEl).filter(isEl).map((f) => [elName(f), numOrNull(text(f)) ?? 0]))
    : null
  return {
    id: numOrNull(at(petEl, 'id')),
    level: numOrNull(at(petEl, 'level')),
    status,                                                        // null ⇒ 按等级算常规数值
    emblem: boolOf(at(petEl, 'emblem'), true),                     // ★缺省 true（实测 5 条全 false ⇒ 只写例外）
    initBuff: csvInts(text(el(c, 'initBuff'))),
    headerSkill: csvInts(text(el(c, 'headerSkill'))),
    loopSkill: csvInts(text(el(c, 'loopSkill'))),
    normalSkill: csvInts(text(el(c, 'normalSkill'))),
    superSkill: numOrNull(text(el(c, 'superSkill'))) ?? 0,         // ★单个 int（不是串）
  }
}

/** `<settings>` 18 列（缺省方向 = "宽松"，§2.3 要点 2；键名对齐 `map-battle-trigger.md §3.1` 的 JSONC）。 */
function settingsOf(boxEl) {
  const c = boxEl ? kids(boxEl) : []
  const num = (attrOrEl, dflt) => {
    const a = boxEl ? at(boxEl, attrOrEl) : null
    const t = a != null ? a : text(el(c, attrOrEl))
    const n = numOrNull(t)
    return n === null ? dflt : n
  }
  const bool = (attr, dflt) => (boxEl ? boolOf(at(boxEl, attr), dflt) : dflt)
  return {
    count: num('count', 6),
    capture: bool('capture', false),
    escape: bool('escape', true),
    item: bool('item', true),
    simulate: bool('simulate', false),
    parallel: num('parallel', 1),
    star: num('star', 0),
    time: num('time', 10),
    mod: bool('mod', false),
    mode: num('mode', 0),
    rule: num('rule', 0),
    weather: num('weather', 0),
    bgm: text(el(c, 'bgm')) ?? null,
    captureLevel: num('captureLevel', 1),
    limit: text(el(c, 'limit')) ?? null,
    limitDesc: text(el(c, 'limitDesc')) ?? null,
    initBuff: (() => { const t = text(el(c, 'initBuff')); return t == null || t === '' ? [] : t })(),   // 形如 `(rule:12)(k:id)` ⇒ 原样留串（E 线解析）
    seed: null,                                        // ★缺省 null ⇒ 运行时按 R2 取时钟（不写进数据，`BTI5`）
  }
}

/** 某处理器容器（`winHandler`/`loseHandler`）的 `<button>` → **原始片段串数组**（语义归 M2，`MDI10`）。 */
function fragsOf(containerKids, name) {
  const box = el(containerKids, name)
  return box ? kids(box).filter(isEl).map(xmlOf) : []
}

/** 一条 `<battle><branch>` → 结构化战斗配方（`map-battle-trigger.md §3.1`）。id = **字符串**、作用域 = 本 NPC（`BTI3`）。 */
function battleBranchOf(branchEl) {
  const c = kids(branchEl)
  const enemyBox = el(c, 'enemy')
  const playerBox = el(c, 'player')
  return {
    id: at(branchEl, 'id') ?? '',
    settings: settingsOf(el(c, 'settings')),
    player: playerBox ? kids(playerBox).filter(isEl).map(bossOf) : null,   // null ⇒ 用玩家真背包（`BTI5`）
    enemy: enemyBox ? kids(enemyBox).filter(isEl).map(bossOf) : [],        // ★不裁到 count（`BTI2`）
    winHandler: fragsOf(c, 'winHandler'),
    loseHandler: fragsOf(c, 'loseHandler'),
  }
}

function buildNpc(node, kind, audit) {
  const rec = { kind, id: idOf(at(node, 'id')) }
  const resId = at(node, 'resId')
  rec.resId = resId                                    // 原串（MDI4）
  rec.resIdKind = parseAssetRef(resId).kind            // L0 `parseAssetRef`（MB2 下沉）
  rec.name = at(node, 'name')
  const c = kids(node)
  const desc = el(c, 'description')
  rec.description = desc ? (text(desc) ?? '') : null
  rec.active = boolOf(at(node, 'active'), true)        // 缺省可见（252 里 94% 不写）
  rec.target = boolOf(at(node, 'target'), true)
  rec.color = at(node, 'color')                        // 原串；默认 "255,255,255,255"
  const size = vec2(at(node, 'size'))
  if (!size && audit) audit.npcMissingSize.push(`${rec.id}@${kind}`)   // MDC7：缺 size ⇒ 显式 (0,0) + 登记
  rec.size = size ?? { x: 0, y: 0 }
  rec.pos = vec2(at(node, 'pos'))
  rec.rotation = at(node, 'rotation') ?? '0,0,0'
  rec.namePos = at(node, 'namePos') ?? '0,5'
  rec.nameSize = numOrNull(at(node, 'nameSize')) ?? 0
  rec.nameColor = at(node, 'nameColor') ?? '0,64,255,255'
  rec.nameFont = at(node, 'nameFont')
  rec.anim = rawAttrs(el(c, 'anim'))
  rec.gif = rawAttrs(el(c, 'gif'))
  const transport = el(c, 'transport')
  rec.transport = transport ? text(transport) : null
  const wild = el(c, 'wild')
  rec.wild = wildOf(wild)
  // ── 四张处理器表：**原始片段串**（每元素一段；语义归 M2/M3/M4/M6，MDI10）
  const handlers = {}
  for (const [key, container] of [['dialog', 'dialog'], ['battle', 'battle'],
    ['eventHandler', 'eventHandler'], ['callbackHandler', 'callbackHandler']]) {
    const box = el(c, container)
    const frags = box ? kids(box).filter(isEl).map(xmlOf) : []
    if (frags.length) handlers[key] = frags
  }
  rec.handlers = handlers
  // ★MB7（`MDB6-a`）：`<battle>` 容器 → **结构化 `battles[]`**（settings/player/enemy/winHandler/loseHandler）；
  //   同 NPC 内**重号** ⇒ 登记 `battle-branch-dup`（实测 0；唯一性作用域恰 = 一个 NPC，`BTI3`，不建全局表）。
  const battleBox = el(c, 'battle')
  if (battleBox) {
    const branches = kids(battleBox).filter(isEl).filter((n) => elName(n) === 'branch').map(battleBranchOf)
    const seenB = new Set()
    for (const b of branches) {
      if (seenB.has(b.id) && audit) (audit.battleBranchDup ??= []).push(`${rec.id}@${b.id}`)
      if (b.enemy.length === 0 && audit) (audit.battleBranchNoEnemy ??= []).push(`${rec.id}@${b.id}`)   // ★`BTC5` 目标：配方应≥1敌（只登记）
      seenB.add(b.id)
    }
    if (branches.length) rec.battles = branches
  }
  return rec
}

/**
 * 解析**一张**图的 Unity XML → `MapRecord`（字段清单正本 = `docs/map/map-data.md §3.2`）。
 *
 * @param {string} rawXml  上游 `<id>.xml` 的原文（本函数内部先剥注释，MDI7）
 * @param {object} [opts]
 * @param {string} [opts.file]   源文件名（`_source` 用；缺省按 `id` 推）
 * @param {number|string} [opts.id]  期望的图 id（文件名侧；`@id` 优先，MDI2）
 * @param {object} [opts.audit]  可选**审计收集器**（node 侧用；只增 `npcMissingSize` 一项，见 `tools/map-audit.mjs`）
 * @returns {object|null}  解析失败（无有效 `<map>`）⇒ `null`（不抛）
 */
export function parseMapXml(rawXml, { file, id: idHint, audit } = {}) {
  const body = stripComments(rawXml)
  let root = null
  try {
    root = el(PARSER.parse(body), 'map')
  } catch {
    return null
  }
  if (!root) return null

  const c = kids(root)
  const resId = numOrNull(at(root, 'resId'))
  const pathId = numOrNull(at(root, 'pathId'))
  const category = numOrNull(at(root, 'category')) ?? 0
  const mapId = idOf(at(root, 'id') ?? (idHint != null ? idHint : null))   // MDI2：@id 优先、文件名兜底
  const switchRaw = numOrNull(at(root, 'switch')) ?? 0
  const switchNarrow = [-1, 0, 1].includes(switchRaw) ? switchRaw : 0

  const ipEl = el(c, 'initialPoint')
  const initUnity = ipEl ? vec2(text(ipEl)) : null

  const fightMapEl = el(c, 'fightMap')
  const fightMap = fightMapEl ? numOrNull(text(fightMapEl)) : null
  const fmcEl = el(c, 'fightMapColor')

  // 七类实体（MDI6：照录七类；排期只按 npc+teleport）
  const ent = el(c, 'entities')
  const ec = kids(ent)
  const entities = { teleports: [], npcs: [], farms: [], animals: [], ponds: [], insects: [], nests: [] }
  const kinds = { npc: 'npcs', farm: 'farms', animal: 'animals', pond: 'ponds', insect: 'insects', nest: 'nests' }
  for (const t of els(ec, 'teleport')) {
    const tp = { id: idOf(at(t, 'id')), name: at(t, 'name'), pos: vec2(at(t, 'pos')) }
    const color = at(t, 'color')
    if (color != null) tp.color = color                      // 缺省串 "255,255,255,128"（实测 8 条写了）
    tp.targetMapId = numOrNull(at(t, 'targetMapId'))
    entities.teleports.push(tp)
  }
  for (const [tag, key] of Object.entries(kinds)) {
    for (const n of els(ec, tag)) entities[key].push(buildNpc(n, tag, audit))
  }

  return {
    id: mapId,
    name: at(root, 'name') ?? null,
    category,
    worldId: (Number(mapId) < -50000 || Number(mapId) === 0) ? 0 : Math.trunc((category - 1) / 100),
    worldIdKnown: [1, 2, 100].includes(category),          // MDC5：Grass/Station 都算 0 ⇒ 要区分请读 category
    weather: numOrNull(at(root, 'weather')) ?? 0,
    switch: switchNarrow,
    switchRaw,
    dream: boolOf(at(root, 'dream'), false),
    bgColor: at(root, 'color') ?? '255,255,255,255',
    fightMap,
    fightMapColor: fmcEl ? text(fmcEl) : null,
    init: initUnity,                                       // 主列 = Unity 侧（消费方只用它，MDI3）
    initUnity,
    initAs3: null,                                         // 由 `loadMap` 填（AS3 只读适配器；内核**不许**读，M5 TPQ1）
    music: (() => {
      const m = el(c, 'music')
      if (!m) return null
      return { category: numOrNull(at(m, 'category')), bgm: text(el(kids(m), 'bgm')) ?? null, fx: text(el(kids(m), 'fx')) ?? null }
    })(),
    anim: (() => {
      const a = rawAttrs(el(c, 'anim'))
      if (!a) return null
      return { id: a.id ?? null, pos: a.pos ?? null, size: a.size ?? null, scale: a.scale ?? null, rotation: a.rotation ?? null, speed: a.speed ?? null }
    })(),
    resId: resId === 0 ? null : resId,
    pathId: pathId === 0 ? null : pathId,                  // 照录（默认通行面仍走 AS3，MDI1）
    geometry: (() => {                                     // 全仓只有 1 张有值
      const g = el(c, 'geometry')
      if (!g) return null
      const one = (tag) => els(kids(g), tag).map((x) => ({ id: idOf(at(x, 'id')), name: at(x, 'name'), points: at(x, 'points') }))
      const mask = one('mask'), collision = one('collision')
      return mask.length || collision.length ? { mask, collision } : null
    })(),
    entities,
    _source: `Unity:Maps/${file || (mapId + '.xml')}`,
  }
}

// ── AS3 只读适配器（给 swf 回退第 ② 级与 `initAs3` 列；**不进内核列**，MDI3）─────
/** AS3 config `<resource url="xxx.swf"/>` 的**文件名**（缺 ⇒ `null`）。 */
export function as3ResourceNameOf(as3Xml) {
  if (!as3Xml) return null
  let root = null
  try {
    root = el(PARSER.parse(stripComments(as3Xml)), 'map')
  } catch {
    return null
  }
  if (!root) return null
  const res = el(kids(root), 'resource')
  return res ? ((at(res, 'url') ?? '').split('/').pop() || null) : null
}

/** AS3 config `<initialPoint x y>`（并存列 `initAs3`；缺 ⇒ `null`）。 */
export function as3InitOf(as3Xml) {
  if (!as3Xml) return null
  let root = null
  try {
    root = el(PARSER.parse(stripComments(as3Xml)), 'map')
  } catch {
    return null
  }
  if (!root) return null
  const ip = el(kids(root), 'initialPoint')
  if (!ip) return null
  const x = numOrNull(at(ip, 'x')), y = numOrNull(at(ip, 'y'))
  return (x != null || y != null) ? { x, y } : null
}

// ── MQ2 四级回退（**不含注释级**：注释一律丢弃，人类 2026-10-18 / D11）────────────
/**
 * 候选链（有序）：① Unity `@resId` → `<resId>.swf`；② 同 id 的 AS3 `<resource url>`；③ `<id>.swf`。
 * **只出候选**（不判"在不在"）；`pickSwf` 才注入存在判据。
 */
export function swfCandidatesFor(record, { id, as3Resource } = {}) {
  const out = []
  const resId = record?.resId
  const mapId = id != null ? id : record?.id
  if (resId != null && resId !== 0) out.push({ level: 'unity-resId', name: `${resId}.swf` })
  if (as3Resource) out.push({ level: 'as3-resource', name: as3Resource })
  out.push({ level: 'id', name: `${mapId}.swf` })
  return out
}

/**
 * 从候选里挑第一个**存在**的（`existsAsync(name) → Promise<boolean>`）。
 * 都不存在 ⇒ 回第一候选的**名字**（仅供显示）+ `swfOk=false`（走 B3 的"缺图"路径）。
 * @returns {Promise<{swf:string, swfOk:boolean, level:string|null}>}
 */
export async function pickSwf(candidates, existsAsync) {
  for (const c of candidates) {
    if (await existsAsync(c.name)) return { swf: c.name, swfOk: true, level: c.level }
  }
  return { swf: candidates[0]?.name ?? null, swfOk: false, level: null }
}
