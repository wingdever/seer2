// L1 · 存档 **XML ⇄ 模型** 的编解码（零 DOM / 零 app import / 零 IO）。
//
// 真值：`docs/save/save-xml-spec.md`（节点树 + §4 列表子项元素名 + §6.2 字节口径）
//       `docs/save/save-code-map.md` §2.3（接口）§5（依赖规则：只 import schema + 第三方库）
//
// 分工（`docs/save/save-impl.md` §2）：**词法/语法解析交给 `fast-xml-parser`**（实体、声明、容错），
// 我们只写库替不了的部分 —— 领域映射 + **值文本口径** + **格式旋钮**。
//
// 写侧（`serialize`）为什么自己拼文本而不用库的 builder：本文件的目标是**与 .NET `XmlSerializer` 逐字节同形**
// （无 BOM / 无 `encoding=` / CRLF / 两空格缩进 / `<x />` 带空格 / `xsi:nil` / 属性序 / 末尾无换行）。
// 这些旋钮是**我们的真值**（`docs/save/save-xml-spec.md §6.2`），用描述子表直接发射比"配置第三方 builder 再去对拍"
// 更短、更可控。**读侧**用库（那才是库的价值所在）。⇒ 偏差已登记在 `docs/save/save-impl.md §9`。
//
// ⚠️ 无样本项：`battleRecordStorage` / `pvpPetTeam` / `YiTeRogueData.itemBag`/`eventMap` / `PetRecord.recordDict`
//   在两份真机真档里**都是空的**（`docs/save/save-xml-spec.md §6.4`）⇒ 它们在本文只按**源码形状**实现，
//   等真档出现内容再以真档为准。

import { XMLParser } from 'fast-xml-parser'
import {
  PET_BAG_SIZE,
  PERSONALITIES,
  STATUS_COLS,
  SETTINGS_FIELDS,
  zeroStatus,
  defaultSettingsData,
  defaultYiteRogueData,
  defaultPetFeature,
  defaultPetRecord,
  defaultPetResist,
  formatDateTime,
  parseDateTime,
} from './schema.js'

// `docs/save/save-code-map.md §2.3` 把这两个记在本文名下；实现住在 schema（见那里的口径说明）⇒ 原样再导出。
export { formatDateTime, parseDateTime }

const CRLF = '\r\n'
const IND = '  '

// ─────────────────────────── 值文本口径 ───────────────────────────

/** float 最短往返（= .NET `R` 格式同族）；非有限数一律 `0`（不许把 `NaN` 写进存档）。 */
export function formatNumber(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  if (x === 0) return '0' // 含 -0
  return String(x)
}

/** 中文枚举 ↔ 序号。未知名字 → 0（实干）；越界序号 → 0。读侧宽容，不抛。 */
export function personalityName(i) {
  const n = Math.trunc(Number(i) || 0)
  return PERSONALITIES[n] || PERSONALITIES[0]
}
export function personalityIndex(s) {
  const i = PERSONALITIES.indexOf(String(s))
  return i < 0 ? 0 : i
}

/**
 * 列表子项元素名：`XmlSerializer` 对无 `[XmlArrayItem]` 的列表用**类型名**，
 * 但 `Mail.gift` 显式声明了 `[XmlArrayItem("item")]` ⇒ 同一个 `Item` 类在 `itemStorage` 写 `<Item>`、
 * 在 `gift` 里写 `<item>`（`docs/save/save-xml-spec.md §2.11/§4`）。
 */
export function elementNameFor(parentField, typeName) {
  if (typeName === 'Item' && parentField === 'gift') return 'item'
  return typeName
}

// 标量类型：str 原文本 · strArr 字符串数组 · bool · int · uint · num(float) · dt(DateTime 原文本) · per(中文性格)
function scalarText(kind, v) {
  switch (kind) {
    case 'bool': return v ? 'true' : 'false'
    case 'int': case 'uint': return String(Math.trunc(Number(v) || 0))
    case 'num': return formatNumber(v)
    case 'dt': return v == null ? '' : String(v)
    case 'per': return personalityName(v)
    case 'str': default: return v == null ? '' : String(v)
  }
}

function scalarValue(kind, raw) {
  if (raw === undefined || raw === null || typeof raw === 'object') return emptyScalar(kind)
  const s = String(raw)
  switch (kind) {
    case 'bool': return s === 'true' || s === '1'
    case 'int': case 'uint': { const n = Number(s); return Number.isFinite(n) ? Math.trunc(n) : 0 }
    case 'num': { const n = Number(s); return Number.isFinite(n) ? n : 0 }
    case 'per': return personalityIndex(s)
    case 'str': case 'dt': default: return s
  }
}

function emptyScalar(kind) {
  switch (kind) {
    case 'bool': return false
    case 'int': case 'uint': case 'num': return 0
    case 'per': return 0
    case 'str': case 'dt': default: return ''
  }
}

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// .NET 在**属性值**里把空白转义（`\r`/`\n`/`\t`），文本节点不转 —— 无样本，按 XmlWriter 口径。
const escAttr = (s) => escText(s).replace(/"/g, '&quot;').replace(/\r/g, '&#xD;').replace(/\n/g, '&#xA;').replace(/\t/g, '&#x9;')

// ─────────────────────────── 描述子表 ───────────────────────────
//
// 一个描述子 = 一个子元素。字段：
//   n  元素名（= 模型字段名）
//   v  标量类型；o 子对象类型名；p 原始值列表的标量类型
//   a  列表子项类型名；item 子项元素名；nil 允许 `<x xsi:nil="true" />`；omitNull 值为 null 时整段省略
//   kv  单个键值对 {k,v}；kva 键值对列表 {elem,k,v}（k/v 可为 'strArr' / 'PetList'）
// 属性（ATTRS）另表：{xml, field, v}（v='const' ⇒ 固定值，读侧忽略）。

const TYPES = {
  root: [
    { n: 'version', v: 'str' },
    { n: 'gender', v: 'bool' },
    { n: 'nickname', v: 'str' },
    { n: 'firstLoginDate', v: 'dt' },
    { n: 'lastLoginDate', v: 'dt' },
    { n: 'achievement', v: 'int' },
    { n: 'petBag', a: 'Pet', item: 'Pet', nil: true },
    { n: 'petStorage', a: 'Pet', item: 'Pet' },
    { n: 'pvpPetTeam', kva: { elem: 'IKeyValuePair', k: 'str', v: 'PetList' } },
    { n: 'itemStorage', a: 'Item', item: 'Item' },
    { n: 'mailStorage', a: 'Mail', item: 'Mail' },
    { n: 'missionStorage', a: 'Mission', item: 'Mission' },
    { n: 'activityStorage', a: 'Activity', item: 'Activity' },
    { n: 'battleRecordStorage', a: 'BattleRecord', item: 'BattleRecord' },
    { n: 'settingsData', o: 'SettingsData' },
    { n: 'yiteRogueData', o: 'YiTeRogueData' },
  ],
  Pet: [
    { n: 'id', v: 'int' },
    { n: 'backupPet', o: 'Pet', omitNull: true },
    { n: 'basic', o: 'PetBasic' },
    { n: 'feature', o: 'PetFeature' },
    { n: 'exp', o: 'PetExp' },
    { n: 'talent', o: 'PetTalent' },
    { n: 'resist', o: 'PetResist' },
    { n: 'skills', o: 'PetSkill' },
    { n: 'record', o: 'PetRecord' },
    { n: 'ui', o: 'PetUI' },
    { n: 'currentStatus', o: 'Status' },
  ],
  PetBasic: [
    { n: 'name', v: 'str', omitNull: true },
    { n: 'gender', v: 'int' },
    { n: 'personality', v: 'per' },
    { n: 'height', v: 'int' },
    { n: 'weight', v: 'int' },
    { n: 'getPetDate', v: 'dt' },
  ],
  PetFeature: [
    { n: 'hasEmblem', v: 'bool' },
    { n: 'featureId', v: 'int' },
    { n: 'emblemId', v: 'int' },
    { n: 'afterwardBuffIds', p: 'int' },
  ],
  PetExp: [
    { n: 'level', v: 'int' },
    { n: 'fixedMaxLevel', v: 'int' },
    { n: 'totalExp', v: 'uint' },
  ],
  PetTalent: [
    { n: 'iv', v: 'int' },
    { n: 'ev', o: 'Status' },
    { n: 'evStorage', v: 'int' },
  ],
  Status: STATUS_COLS.map((c) => ({ n: c, v: 'num' })),
  PetResist: [
    { n: 'id', v: 'int' }, // ⚠️ 唯此处 id 是**元素**（其余子结构是属性）
    { n: 'lockState', v: 'int' },
    { n: 'criResist', v: 'int' },
    { n: 'fixResist', v: 'int' },
    { n: 'perResist', v: 'int' },
    { n: 'abnormalResist', kv: { k: 'int', v: 'int' } },
    { n: 'unhealthyResist', kv: { k: 'int', v: 'int' } },
  ],
  PetSkill: [
    { n: 'ownSkillId', p: 'int' },
    { n: 'normalSkillId', p: 'int' }, // 声明 int[4]，实测**可少于 4**
    { n: 'superSkillId', v: 'int' },
  ],
  PetRecord: [
    { n: 'winFightNum', v: 'int' },
    { n: 'loseFightNum', v: 'int' },
    { n: 'recordDict', kva: { elem: 'IKeyValuePair', k: 'str', v: 'str' } },
  ],
  PetUI: [
    { n: 'specialSkinList', p: 'int' },
  ],
  Item: [], // 只有属性
  Mail: [
    { n: 'isRead', v: 'bool' },
    { n: 'sender', v: 'str' },
    { n: 'title', v: 'str' },
    { n: 'content', v: 'str' },
    { n: 'date', v: 'dt' },
    { n: 'gift', a: 'Item', item: 'item' },
  ],
  Mission: [], // 只有属性
  Activity: [
    { n: 'data', kva: { elem: 'entry', k: 'str', v: 'str' } },
  ],
  BattleRecord: [
    { n: 'isMaster', v: 'bool' },
    { n: 'originalResultState', v: 'str' }, // 枚举**以名字存**（如 Win）
    { n: 'settings', o: 'BattleSettings' },
    { n: 'masterPetBag', a: 'Pet', item: 'Pet', omitNull: true },
    { n: 'clientPetBag', a: 'Pet', item: 'Pet', omitNull: true },
    { n: 'date', v: 'dt' },
    { n: 'actionList', kva: { elem: 'action', k: 'strArr', v: 'bool' } },
  ],
  BattleSettings: [
    { n: 'seed', v: 'int' },
    { n: 'captureLevel', v: 'int' },
    { n: 'limit', v: 'str', omitNull: true },
    { n: 'limitDesc', v: 'str', omitNull: true },
    { n: 'bgm', v: 'str', omitNull: true },
    { n: 'mode', v: 'int' }, // ⚠️ int 不是枚举
    { n: 'rule', v: 'int' }, // ⚠️ int 不是枚举
    { n: 'weather', v: 'int' },
    { n: 'initBuff', v: 'str', omitNull: true },
  ],
  SettingsData: [
    { n: 'useRobotAsPlayer', v: 'bool' },
    { n: 'BGMVolume', v: 'num' },
    { n: 'UIVolume', v: 'num' },
    { n: 'battleBGMVolume', v: 'num' },
    { n: 'battleSEVolume', v: 'num' },
    { n: 'battleAnimSpeed', v: 'num' },
    { n: 'shakeWhenBigDamage', v: 'bool' },
    { n: 'flashWhenBigDamage', v: 'bool' },
    { n: 'autoHealAfterBattle', v: 'bool' },
    { n: 'initMapId', v: 'int' },
    { n: 'ruleId', v: 'int' },
    { n: 'comboDamageDisplayMode', v: 'int' },
    { n: 'wildNpcBubbleStyle', v: 'str' },
  ],
  YiTeRogueData: [
    { n: 'mode', v: 'int' },
    { n: 'isEnd', v: 'bool' },
    { n: 'petBag', a: 'Pet', item: 'Pet', nil: true },
    { n: 'buffStatus', o: 'Status' },
    { n: 'buffIds', p: 'int' },
    { n: 'itemBag', a: 'Item', item: 'Item' },
    { n: 'floor', v: 'int' },
    { n: 'nextPos', v: 'int' },
    { n: 'trace', p: 'int' },
    { n: 'eventMap', a: 'YiTeRogueEvent', item: 'YiTeRogueEvent' },
  ],
  YiTeRogueEvent: [
    { n: 'type', v: 'str' }, // 枚举**以名字存**（Start/BattleEasy/End…）
    { n: 'pos', v: 'int' },
    { n: 'step', v: 'int' },
    { n: 'next', p: 'int', omitNull: true },
    { n: 'data', kva: { elem: 'IKeyValuePair', k: 'str', v: 'str' } },
  ],
}

const ATTRS = {
  root: [
    { xml: 'xmlns:xsd', v: 'const', val: 'http://www.w3.org/2001/XMLSchema' },
    { xml: 'xmlns:xsi', v: 'const', val: 'http://www.w3.org/2001/XMLSchema-instance' },
  ],
  Pet: [],
  PetBasic: [{ xml: 'id', field: 'id', v: 'int' }],
  PetFeature: [{ xml: 'id', field: 'id', v: 'int' }],
  PetExp: [{ xml: 'id', field: 'id', v: 'int' }],
  PetTalent: [{ xml: 'id', field: 'id', v: 'int' }],
  PetSkill: [{ xml: 'id', field: 'id', v: 'int' }],
  PetUI: [{ xml: 'id', field: 'id', v: 'int' }, { xml: 'baseId', field: 'baseId', v: 'int' }],
  Item: [{ xml: 'id', field: 'id', v: 'int' }, { xml: 'num', field: 'num', v: 'int' }],
  Mission: [
    { xml: 'id', field: 'id', v: 'int' },
    { xml: 'checkpoint', field: 'checkpoint', v: 'str' },
    { xml: 'done', field: 'done', v: 'bool' },
  ],
  Activity: [{ xml: 'id', field: 'id', v: 'str' }],
  BattleSettings: [
    { xml: 'mod', field: 'isMod', v: 'bool' },
    { xml: 'simulate', field: 'isSimulate', v: 'bool' },
    { xml: 'escape', field: 'isEscapeOK', v: 'bool' },
    { xml: 'capture', field: 'isCaptureOK', v: 'bool' },
    { xml: 'item', field: 'isItemOK', v: 'bool' },
    { xml: 'count', field: 'petCount', v: 'int' },
    { xml: 'parallel', field: 'parallelCount', v: 'int' },
    { xml: 'star', field: 'starLimit', v: 'int' },
    { xml: 'time', field: 'time', v: 'int' },
  ],
}

// 对象缺项时的**构造器默认**（.NET 反序列化先跑参数less 构造器，再覆盖找到的元素 ⇒ 缺项保留默认）。
const OBJECT_DEFAULTS = {
  SettingsData: () => defaultSettingsData(),
  YiTeRogueData: () => defaultYiteRogueData(),
  PetRecord: () => defaultPetRecord(),
  PetFeature: (ctx) => defaultPetFeature(ctx.petId || 0),
  PetResist: (ctx) => defaultPetResist(ctx.petId || 0, 0),
  Status: () => zeroStatus(),
}

// ─────────────────────────── 写侧 ───────────────────────────

/**
 * 模型 → XML 文本（**真机真档字节口径**：无 BOM / 首行 `<?xml version="1.0"?>` / CRLF /
 * 两空格缩进 / 空元素 `<x />` / 末尾无换行）。
 */
export function serialize(g) {
  const out = ['<?xml version="1.0"?>']
  writeObject(out, '', 'gameData', 'root', g)
  return out.join(CRLF)
}

function writeObject(out, pad, elem, type, obj) {
  const o = (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {}
  let attrs = ''
  for (const a of (ATTRS[type] || [])) {
    const text = (a.v === 'const') ? a.val : scalarText(a.v, o[a.field])
    attrs += ` ${a.xml}="${escAttr(text)}"`
  }
  const kids = TYPES[type] || []
  if (kids.length === 0) {
    out.push(`${pad}<${elem}${attrs} />`)
    return
  }
  out.push(`${pad}<${elem}${attrs}>`)
  for (const d of kids) writeChild(out, pad + IND, d, o)
  out.push(`${pad}</${elem}>`)
}

function writeChild(out, pad, d, obj) {
  const v = obj ? obj[d.n] : undefined
  if (d.omitNull && v == null) return
  if (d.p != null) { writePrimList(out, pad, d.n, d.p, v); return }
  if (d.o) { writeObject(out, pad, d.n, d.o, v); return }
  if (d.a) { writeObjList(out, pad, d, v); return }
  if (d.kv) { writeKvp(out, pad, d.n, d.kv, v); return }
  if (d.kva) { writeKvpList(out, pad, d.n, d.kva, v); return }
  // 标量：空串/缺值都写 `<x />`（与 .NET 对 null/空字符串的写法一致）
  const text = scalarText(d.v, v)
  out.push(text === '' ? `${pad}<${d.n} />` : `${pad}<${d.n}>${escText(text)}</${d.n}>`)
}

function writeObjList(out, pad, d, arr) {
  const items = asArray(arr)
  if (items.length === 0) { out.push(`${pad}<${d.n} />`); return }
  out.push(`${pad}<${d.n}>`)
  for (const it of items) {
    if (it == null) {
      if (d.nil) out.push(`${pad + IND}<${d.item} xsi:nil="true" />`)
      continue
    }
    writeObject(out, pad + IND, d.item, d.a, it)
  }
  out.push(`${pad}</${d.n}>`)
}

function writePrimList(out, pad, name, kind, arr) {
  const items = asArray(arr)
  if (items.length === 0) { out.push(`${pad}<${name} />`); return }
  out.push(`${pad}<${name}>`)
  for (const it of items) out.push(`${pad + IND}<${scalarTag(kind)}>${escText(scalarText(kind, it))}</${scalarTag(kind)}>`)
  out.push(`${pad}</${name}>`)
}

function writeKvp(out, pad, name, kv, obj) {
  out.push(`${pad}<${name}>`)
  out.push(`${pad + IND}<key>${escText(scalarText(kv.k, obj ? obj.key : undefined))}</key>`)
  out.push(`${pad + IND}<value>${escText(scalarText(kv.v, obj ? obj.value : undefined))}</value>`)
  out.push(`${pad}</${name}>`)
}

function writeKvpList(out, pad, name, kva, arr) {
  const items = asArray(arr)
  if (items.length === 0) { out.push(`${pad}<${name} />`); return }
  out.push(`${pad}<${name}>`)
  for (const it of items) {
    out.push(`${pad + IND}<${kva.elem}>`)
    const kPad = pad + IND + IND
    if (kva.k === 'strArr') {
      const list = asArray(it ? it.key : undefined)
      if (list.length === 0) out.push(`${kPad}<key />`)
      else {
        out.push(`${kPad}<key>`)
        for (const s of list) out.push(`${kPad + IND}<string>${escText(String(s))}</string>`)
        out.push(`${kPad}</key>`)
      }
    } else {
      out.push(`${kPad}<key>${escText(scalarText(kva.k, it ? it.key : undefined))}</key>`)
    }
    if (kva.v === 'PetList') {
      const pets = asArray(it ? it.value : undefined)
      if (pets.length === 0) out.push(`${kPad}<value />`)
      else {
        out.push(`${kPad}<value>`)
        for (const pet of pets) {
          if (pet == null) out.push(`${kPad + IND}<Pet xsi:nil="true" />`)
          else writeObject(out, kPad + IND, 'Pet', 'Pet', pet)
        }
        out.push(`${kPad}</value>`)
      }
    } else {
      out.push(`${kPad}<value>${escText(scalarText(kva.v, it ? it.value : undefined))}</value>`)
    }
    out.push(`${pad + IND}</${kva.elem}>`)
  }
  out.push(`${pad}</${name}>`)
}

const scalarTag = (kind) => (kind === 'str' ? 'string' : kind === 'bool' ? 'boolean' : 'int')

// ─────────────────────────── 读侧 ───────────────────────────

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,      // 值一律留字符串 ⇒ 由我们按类型口径收窄（精度/空串可控）
  parseAttributeValue: false,
  trimValues: true,
  allowBooleanAttributes: false,
})

/**
 * XML 文本 → 模型。**宽容读**（`docs/save/save-xml-spec.md §6.5` 的硬要求）：
 * ① 缺字段 → 取构造器默认；② 解析不了的标量 → 取默认（**不抛**）；③ `petBag` 短于 12 **不在这里补**
 * （resize 归 `newgame.finishNewGame`，`validate` 负责报出）。
 */
export function parse(xml) {
  const text = String(xml == null ? '' : xml).replace(/^\uFEFF/, '') // 防 BOM（改档工具会加）
  const doc = PARSER.parse(text)
  return readObject('root', doc ? doc.gameData : undefined, {})
}

function readObject(type, node, ctx) {
  const n = (node && typeof node === 'object' && !Array.isArray(node)) ? node : {}
  const out = OBJECT_DEFAULTS[type] ? OBJECT_DEFAULTS[type](ctx) : {}
  let childCtx = ctx
  if (type === 'Pet') childCtx = { ...ctx, petId: scalarValue('int', n.id) }

  for (const a of (ATTRS[type] || [])) {
    if (a.v === 'const') continue
    out[a.field] = scalarValue(a.v, n['@_' + a.xml])
  }
  for (const d of (TYPES[type] || [])) {
    const v = n[d.n]
    if (d.omitNull && v == null) { out[d.n] = null; continue } // 「null → 整段省略」的字段：读侧也留 null
    if (d.p != null) { out[d.n] = asArray(v ? v[scalarTag(d.p)] : undefined).map((x) => scalarValue(d.p, x)); continue }
    if (d.o) { out[d.n] = readObject(d.o, v, childCtx); continue }
    if (d.a) { out[d.n] = readObjList(d, v, childCtx); continue }
    if (d.kv) { out[d.n] = { key: scalarValue(d.kv.k, v ? v.key : undefined), value: scalarValue(d.kv.v, v ? v.value : undefined) }; continue }
    if (d.kva) { out[d.n] = asArray(v ? v[d.kva.elem] : undefined).map((it) => readKvp(it, d.kva, childCtx)); continue }
    // 标量：**元素缺席 / 空元素（数值类）⇒ 保持构造器默认**（= .NET 反序列化语义：先跑 ctor 再用找到的元素覆盖）
    if (v == null) { if (!(d.n in out)) out[d.n] = emptyScalar(d.v); continue }
    const s = String(v)
    if (s === '' && d.v !== 'str' && d.v !== 'dt') { if (!(d.n in out)) out[d.n] = emptyScalar(d.v); continue }
    out[d.n] = scalarValue(d.v, s)
  }
  return out
}

function readObjList(d, v, ctx) {
  const out = []
  for (const it of asArray(v ? v[d.item] : undefined)) {
    if (isNil(it)) { if (d.nil) out.push(null); continue }
    out.push(readObject(d.a, it, ctx))
  }
  return out
}

function readKvp(it, kva, ctx) {
  const node = (it && typeof it === 'object') ? it : {}
  const key = kva.k === 'strArr'
    ? asArray(node.key ? node.key.string : undefined).map((x) => String(x))
    : scalarValue(kva.k, node.key)
  const value = kva.v === 'PetList'
    ? asArray(node.value ? node.value.Pet : undefined).map((p) => (isNil(p) ? null : readObject('Pet', p, ctx)))
    : scalarValue(kva.v, node.value)
  return { key, value }
}

const isNil = (node) => !!(node && typeof node === 'object' && (node['@_xsi:nil'] === 'true' || node['@_xsi:nil'] === true))

function asArray(v) {
  if (v === undefined || v === null || v === '') return []
  return Array.isArray(v) ? v : [v]
}

// ─────────────────────────── 自检用导出 ───────────────────────────

/** 描述子表（只读导出：`docs/save/save-xml-spec.md §5` 的「覆盖表」比对用，也便于人手测时看形状）。 */
export const XML_SCHEMA = { TYPES, ATTRS, PET_BAG_SIZE, SETTINGS_FIELDS }
