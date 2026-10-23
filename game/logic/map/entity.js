// L1 · 地图**运行时实体**装配（施工批 **MB5** / `docs/map/map-code-map.md §2.3`）。
//
// 这一层做两件事（都不取数、不碰 DOM、不落盘）：
//   ① **XML 片段串 → `ButtonSpec`**（`MDI10`：桥 `parse-map.js` 只把 `<button>`/`<func>`/`<reply>`
//      存成**原始片段串**，语义解析归这里 —— L0 `button.ts` 零第三方依赖、带不了 XML 库 ⇒ 构造落 L1）。
//   ② `buildEntities(record)`：把一条 `content.loadMap` 记录里的 NPC 拼成**实体表**
//      （运行时字段 + 两张解析好的按钮表）。
//
// ⚠️ **登记先于 `auto`**（`MNI5`）：调用方（L4 `mapScene.js`）必须**先把实体表写进场景键袋、再跑 `auto`**——
//    上游 `MapSceneView.cs:285→:287` 就是这个顺序（`Shoot()` 与 `data.` 系条件都从键袋取 NPC 总表）。
//    本件**只给数据**，"先登记后触发"的时序归调用方（本件不认识会话/场景）。
//
// 真值：`docs/map/map-npc.md §2.1/§3.1`（`ButtonSpec` 形状）· `§2.5`（`auto` = 进图批处理）· `§5 MNI1/MNI5`
//       `docs/map/map-impl.md §3.5`（MB5 蓝图）· `docs/map/map-code-map.md §2.3/§5.1`
// 纪律：**MNI1**（词表 ≠ 事件：`auto` 不是 UI 事件、靠 `type === 'Auto'` 批处理）·
//       **MNI2**（`typeId` 原串 + `source` 必填）· **MNI5**（先登记后 auto，时序在调用方）

import { XMLParser } from 'fast-xml-parser'
import { BUTTON_EVENT_TYPE, NPC_ACTION } from '../../core/map/button.js'

// 与 `parse-map.js` 同一套解析口径（preserveOrder 保住顺序与文本节点；属性不自动转型）。
const PARSER = new XMLParser({
  preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '@',
  trimValues: false, parseTagValue: false, parseAttributeValue: false,
  cdataPropName: '#cdata', commentPropName: '#comment',
  ignoreDeclaration: true, allowBooleanAttributes: true,
})

const META = new Set([':@', '#text', '#cdata', '#comment'])
const elName = (n) => Object.keys(n).find((k) => !META.has(k))
const isEl = (n) => elName(n) !== undefined
const at = (n, k) => { const a = n && n[':@']; return a && ('@' + k) in a ? String(a['@' + k]) : null }

/** 一个元素节点里**所有直接文本/CDATA**的拼接（子元素的文本不算）。 */
function textOf(elNode) {
  const kids = elNode ? elNode[elName(elNode)] || [] : []
  let out = ''
  for (const x of kids) {
    if ('#text' in x) { out += x['#text'] || ''; continue }
    if ('#cdata' in x) {
      // ★本代 `fast-xml-parser` 把 CDATA 存成**文本节点数组**（`#cdata: [{#text:"…"}]`），不是裸串 ⇒
      //   直接 String(数组) 会得到 `[object Object]`（对话正文/选项文字全变这个）。逐项抽 `#text` 再拼。
      const c = x['#cdata']
      if (Array.isArray(c)) for (const t of c) out += (t && typeof t === 'object' ? (t['#text'] || '') : (typeof t === 'string' ? t : ''))
      else out += (typeof c === 'string' ? c : '')
    }
  }
  return out
}

/** 某元素名下的**全部子元素文本**（如 `<param>` 的多条、`<condition>` 的多条）。 */
function childTexts(kids, name) {
  return kids.filter((n) => isEl(n) && elName(n) === name).map(textOf).map((s) => s.trim())
}

/** 某元素名下的**第一个直接子元素节点**（没有 ⇒ `null`）—— `dialog.ts` lex `<branch>` 信封用。 */
function firstChildEl(kids, name) {
  return kids.find((n) => isEl(n) && elName(n) === name) ?? null
}

/**
 * **已解析的元素节点** → `ButtonSpec`（`parseButtonFragment` 的无 parse 半边；`dialog-host.js` 复用：
 * 一个 `<branch>` parse 一次，逐 `<func>`/`<reply>` 子节点直接喂这里，不重复 parse）。
 * ⚠️ `description` = **元素直文本**优先、否则取 **`<description>` 子元素**（对话的 func/reply 用后者；
 *    NPC 的 `<button>` 用前者或皆空 ⇒ `''`）。
 */
export function buttonSpecFromEl(root, source) {
  const name = elName(root)
  const kids = root[name] || []
  const typeId = at(root, 'type') ?? ''                                   // ★原串才是真值（MNI2）
  const actionType = childTexts(kids, 'action')[0]                        // 首个 `<action>`
  const description = textOf(root).trim() || (childTexts(kids, 'description')[0] ?? '')
  return {
    typeId,
    type: BUTTON_EVENT_TYPE[typeId] ?? 'None',                            // 未登记 ⇒ None（含 shoot/hover，MNI4）
    actionType: actionType || undefined,
    action: NPC_ACTION[actionType] ?? 'None',                             // 未登记 ⇒ None
    condition: childTexts(kids, 'condition'),                            // 多元素 = AND；串内 `|` = OR（求值归 M3）
    param: childTexts(kids, 'param'),
    source,
    ...(description ? { description } : {}),
  }
}

/**
 * 一条按钮/回复/函数片段串 → `ButtonSpec`（形状正本 = `docs/map/map-npc.md §3.1`）。
 *
 * @param {string} fragment  `<button>` / `<func>` / `<reply>` 的**原始片段串**（`parse-map.js` 的 `xmlOf` 产物）
 * @param {import('../../core/map/button.js').ButtonSource} source  这条来自哪个容器（**必填**，`MNI2`）
 * @returns {import('../../core/map/button.js').ButtonSpec | null} 解析不出元素 ⇒ `null`（调用方跳过）
 */
export function parseButtonFragment(fragment, source) {
  if (typeof fragment !== 'string' || !fragment.trim()) return null
  let root = null
  try {
    root = PARSER.parse(fragment).find(isEl) || null
  } catch {
    return null
  }
  return root ? buttonSpecFromEl(root, source) : null
}

/** 一批片段串 → `ButtonSpec[]`（跳过解析失败的）。★MB7 导出：战后链要把 `winHandler`/`loseHandler` 片段翻成 spec。 */
export function parseHandlerFrags(frags, source) {
  const out = []
  for (const f of frags ?? []) {
    const b = parseButtonFragment(f, source)
    if (b) out.push(b)
  }
  return out
}

/**
 * 一条 `<dialog><branch>` 片段串 → `LexedBranch`（`dialog.ts` L0 的**输入**；形状正本 = `docs/map/map-dialog.md §3.2`）。
 *
 * ⚠️ **XML 解析留在 L1**（`dialog.ts` 零第三方依赖、带不了 `fast-xml-parser`，`MP3`）⇒ 本件把 `<branch>` 信封
 *    （attrs + `<content>` + `<gif>` + `<functionHandler><func>` / `<replyHandler><reply>`）lex 成**纯记录**，
 *    物化（附挂 / 可见性 / 插值）归 L0。**只认 `<branch>` 下的容器**（`DLI3`），绝不按标签名全局匹配。
 * @param {string} fragment  一条 `<branch>` 的原始片段串（`rec.handlers.dialog[]` 的一项）
 * @returns {object|null} 解析不出 `<branch>` ⇒ `null`（调用方跳过）
 */
export function lexDialogBranch(fragment) {
  if (typeof fragment !== 'string' || !fragment.trim()) return null
  let root = null
  try {
    root = PARSER.parse(fragment).find(isEl) || null
  } catch {
    return null
  }
  if (!root || elName(root) !== 'branch') return null
  const kids = root.branch || []

  const contentEl = firstChildEl(kids, 'content')
  const gifEl = firstChildEl(kids, 'gif')
  const handlerSource = (boxName, itemNames) => {
    const box = firstChildEl(kids, boxName)
    if (!box) return []
    const boxKids = box[elName(box)] || []
    return boxKids.filter((n) => isEl(n) && itemNames.includes(elName(n))).map((n) => buttonSpecFromEl(n, boxName))
  }

  const icon = at(root, 'icon')
  const size = at(root, 'size')
  const pos = at(root, 'pos')
  const color = at(root, 'color')
  const gifId = gifEl ? at(gifEl, 'id') : null

  return {
    id: at(root, 'id') ?? '',
    name: at(root, 'name') ?? '',
    content: contentEl ? textOf(contentEl) : '',
    funcs: handlerSource('functionHandler', ['func']),
    replies: handlerSource('replyHandler', ['reply']),
    ...(icon != null ? { icon } : {}),
    ...(size != null ? { size } : {}),
    ...(pos != null ? { pos } : {}),
    ...(color != null ? { color } : {}),
    ...(gifId != null ? { gif: { resId: gifId } } : {}),
  }
}

/**
 * 一条记录 → **运行时实体表**（本批只按 NPC 排期，`MDI6`；七类里的其余留给后续）。
 *
 * ⚠️ **吃 `content.loadMap` 给的记录**，不自己取数（`M-5`：`logic/**` 不许 import `app/**`）。
 * @param {object} record  `parse-map.js` 的 `MapRecord`
 * @returns {Array<object>}  每只 NPC：`{ ...运行时字段, eventHandler: ButtonSpec[], callbackHandler: ButtonSpec[] }`
 */
export function buildEntities(record) {
  const npcs = record?.entities?.npcs || []
  return npcs.map((n) => ({
    // ── 运行时字段（B3 上屏/条件/动作都会看；`resIdKind`/`pos` 来自 `parse-map`，D10 换算归 B3）
    id: n.id,
    kind: n.kind,
    name: n.name,
    namePos: n.namePos,       // ★B3（头顶名字脚标）：`<npc @namePos>` "x,y"（缺省 "0,5"）—— sprite 头顶文字的偏移
    nameColor: n.nameColor,   // ★B3：`<npc @nameColor>` "R,G,B,A"（缺省 "0,64,255,255"）—— 名字颜色（BCQ2·A 需要）
    description: n.description,
    resId: n.resId,
    resIdKind: n.resIdKind,
    pos: n.pos,
    size: n.size,
    color: n.color,
    active: n.active,
    target: n.target,
    anim: n.anim,
    gif: n.gif,
    wild: n.wild,
    // ── 两张按钮表：片段串 → ButtonSpec（语义在 L1 补齐）
    eventHandler: parseHandlerFrags(n.handlers?.eventHandler, 'eventHandler'),
    callbackHandler: parseHandlerFrags(n.handlers?.callbackHandler, 'callbackHandler'),
    // 原始表留着（`battle`/`dialog` 归 M6/M4，本批不解析其语义；供后续批就近取用）
    battleHandler: n.handlers?.battle || [],
    dialogHandler: n.handlers?.dialog || [],
    // ★MB7：`<battle>` 的**结构化配方**（`parse-map.js` 的 `battleBranchOf` 产物：settings/player/enemy/winHandler/loseHandler）
    //   ⇒ `battle-spec.ts` 就地取用（不重解析）；战后链用每支的 `winHandler`/`loseHandler`（原始按钮片段串，走同一台 `resolve→run`）。
    battles: n.battles || [],
  }))
}

/**
 * 这只 NPC 的 **`auto` 按钮**（`MNI1`：`auto` **不是** UI 事件 ⇒ 不进 `uiEventOf`，走"进图批处理"这条）。
 * `docs/map/map-npc.md §2.5`：**每次进图对每只 NPC 求值一次并执行**。
 * @param {object} entity `buildEntities` 的一条
 * @returns {Array<import('../../core/map/button.js').ButtonSpec>}
 */
export function autoSpecsOf(entity) {
  return (entity?.eventHandler || []).filter((b) => b.type === 'Auto')
}

/** 这只 NPC 的**可点 UI 按钮**（4 种指针事件；`auto`/`shoot`/`None` 归 `uiEventOf` ⇒ `null`，`MNI1`）。 */
export function uiSpecsOf(entity) {
  return (entity?.eventHandler || []).filter((b) => b.type !== 'None' && b.type !== 'Auto')
}
