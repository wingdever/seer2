// 存档仓库 —— **app 侧唯一入口**（`game/app/**` 只许经本文件碰存档：`docs/save/save-code-map.md §5` 规则 4）。
//
// 真值：docs/save/save-code-map.md §2.5（六个函数 + `load` 行为契约 + §4 时序）· docs/save/save-impl.md §6（落点）
//       docs/save/save-xml-spec.md（格式与字节口径）
//
// 契约要点：
//   · `load` 缺档 ⇒ **照上游 `LoadData` 的 null 回退自动造默认档并落盘**（"空档"不是故障，是现象）；
//   · 写盘一律"先 `validate` 再 `serialize`"：形状不对就**抛错**，绝不把坏档写出去（不静默）；
//   · `storage` 由**外部注入**（装配点归编排线，见 docs/save/save-impl.md §6.1）——本文件不自己 new 适配器。
//
// ⚠️ 与本文件对 code-map §2.5 的**追加量**（逐条登记在 docs/save/save-impl.md §9.4）：
//   ① `load` 追加 `opts.login`（默认 `false`）：`true` = 当作一次**登录收尾**（上游 `GameManager.GameLogin`：
//      版本迁移 + `petBag` resize + 跨天 + 刷 `lastLoginDate`）并回写。**默认 false 是为了槽位预览不写坏档**
//      （Login 场景要连读 3 个槽画格子；`login:true` 留给"选档进图"那一刻）。
//   ② 造档/迁移所需的 `opts.tables` / `opts.petFactory` / `opts.rng` / `opts.events` 透传给 `newgame`（批 A 偏差③⑤）。
//   ③ 再导出 `isEmpty` / `MAX_SAVE_COUNT`：B5 的"空档判据"与"3 槽"要走唯一入口，不许自己拼字符串判断。
//      （`isEmpty` 是判据本身，`MAX_SAVE_COUNT` 是槽数本身 —— 都不是新函数。）

import { keyOf, validate, isEmpty, MAX_SAVE_COUNT, DEFAULT_VERSION } from './schema.js'
import { parse, serialize } from './codec.js'
import { defaultGameData, finishNewGame, applyVersionUpdates } from './newgame.js'

export { isEmpty, MAX_SAVE_COUNT }

// ─────────────────────────── 入参体检（失败一律抛错，不静默） ───────────────────────────

function assertStorage(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('storage 不合法：需要 { getItem, setItem, removeItem }（见 docs/save/save-code-map.md §2.1）')
  }
}

function assertGid(gid) {
  if (!Number.isInteger(gid) || gid < 0 || gid >= MAX_SAVE_COUNT) {
    throw new Error(`gid 应为 0..${MAX_SAVE_COUNT - 1} 的整数（上游 SaveSystem.MAX_SAVE_COUNT=3），给的是 ${gid}`)
  }
}

function saveError(code, gid, message) {
  const e = new Error(message)
  e.code = code
  e.gid = gid
  return e
}

/** 写盘唯一通道：先体检再发射（坏档不许落盘）。 */
async function write(storage, key, g, gid = null) {
  const v = validate(g)
  if (!v.ok) {
    throw saveError('SAVE_INVALID', gid,
      `拒绝写盘：存档形状不对（${v.errors.length} 条）\n- ${v.errors.join('\n- ')}`)
  }
  await storage.setItem(key, serialize(g))
}

// ─────────────────────────── 六个接口 ───────────────────────────

/**
 * 读档（`docs/save/save-code-map.md §2.5` 行为契约 + §4 时序）。
 *   1. 命中 ⇒ `parse` → 校验 → 返回（**形状正常的档一个字节都不改**，槽位预览只读）；
 *   2. 缺档 ⇒ `newGame`（默认档 + 登录收尾）→ 落盘 → 返回 —— 对应上游 `LoadData` 的 null 回退；
 *   3. `version` 与当前不一致 ⇒ `applyVersionUpdates` 后回写（对应上游 `GameManager.GameLogin`）；
 *   4. 形状不对（如历史短 `petBag`）⇒ 先走一遍登录收尾补齐（`docs/save/save-xml-spec.md §6.5` 的宽容要求）
 *      再回写；补不齐则**抛 `SAVE_INVALID`**（不把坏档当空档）。
 * `opts.login=true` ⇒ 无论形状如何都走完整登录收尾（版本迁移 + resize + 跨天 + 刷 `lastLoginDate`）并回写。
 *
 * @param {{getItem:Function,setItem:Function,removeItem?:Function}} storage
 * @param {{gid?:number, version?:string, now?:Date, login?:boolean, events?:Array, tables?:any, petFactory?:Function, rng?:Function, coin?:number, diamond?:number}} [opts]
 * @returns {Promise<object>} GameData
 */
export async function load(storage, opts = {}) {
  const { gid = 0, version = DEFAULT_VERSION, now = new Date(), login = false, events = null } = opts
  assertStorage(storage)
  assertGid(gid)

  const key = keyOf(gid)
  const raw = await storage.getItem(key)

  // ── 缺档：造默认档（上游 LoadData 的 null 回退）
  if (raw == null) return await newGame(storage, { ...opts, gid, version, now })

  let g
  try {
    g = parse(raw)
  } catch (e) {
    throw saveError('SAVE_PARSE_FAILED', gid, `存档读不动 saves/save${gid}.xml：${e.message}`)
  }

  // ── 登录收尾（选档进图那一刻；默认不走）
  if (login) {
    finishNewGame(g, { version, now, events })
    await write(storage, key, g, gid)
    return g
  }

  // ── 形状不对：先按登录收尾补齐（历史短 petBag），补不齐才抛
  const v = validate(g)
  if (!v.ok) {
    finishNewGame(g, { version, now, events })
    const v2 = validate(g)
    if (!v2.ok) {
      throw saveError('SAVE_INVALID', gid,
        `存档形状不对且补齐后仍不行（saves/save${gid}.xml，${v2.errors.length} 条）\n- ${v2.errors.join('\n- ')}`)
    }
    await write(storage, key, g, gid)
    return g
  }

  // ── 版本不一致：迁移后回写（对应上游 GameLogin 的 `*.VersionUpdate()`）
  if (String(g.version) !== String(version)) {
    applyVersionUpdates(g, g.version, version)
    g.version = version
    await write(storage, key, g, gid)
  }
  return g
}

/**
 * 落盘（`g` 会先体检；坏档抛 `SAVE_INVALID`）。
 * @returns {Promise<void>}
 */
export async function save(storage, gid, g) {
  assertStorage(storage)
  assertGid(gid)
  await write(storage, keyOf(gid), g, gid)
}

/**
 * 造一份新档并落盘（= `defaultGameData` + `finishNewGame`；对应上游 `InitGameData` + `GameLogin` 那两步）。
 * ⚠️ 需要 `opts.tables`（`newgame.unityTables(...)`）或 `opts.petFactory`（域线 D6 的真工厂）—— 二者缺一就抛错。
 * @returns {Promise<object>} GameData
 */
export async function newGame(storage, opts = {}) {
  const {
    gid = 0, coin = 2000, diamond = 0, rng, tables, petFactory,
    version = DEFAULT_VERSION, now = new Date(), events = null,
  } = opts
  assertStorage(storage)
  assertGid(gid)

  const g = defaultGameData({ coin, diamond, rng, tables, petFactory, now })
  finishNewGame(g, { version, now, events })
  await write(storage, keyOf(gid), g, gid)
  return g
}

/**
 * 导出为 XML 文本（`纯`）。字节口径见 `docs/save/save-xml-spec.md §6.2`（无 BOM / CRLF / 末尾无换行）
 * ⇒ 导出的档**真游戏能直接读**。
 * @returns {string}
 */
export function exportXML(g) {
  const v = validate(g)
  if (!v.ok) {
    throw saveError('SAVE_INVALID', null, `拒绝导出：存档形状不对（${v.errors.length} 条）\n- ${v.errors.join('\n- ')}`)
  }
  return serialize(g)
}

/**
 * 导入 XML（STQ8 = XML 档）。**原样落盘**（字节保真：写进去的就是给进来的那些字节），
 * 校验不过则**不写**、把 `errors` 交回（B5 用 A3 明说，不静默）。
 * @param {string} xml
 * @returns {Promise<{ok:boolean, errors:string[], data?:object}>}
 */
export async function importXML(storage, gid, xml) {
  assertStorage(storage)
  assertGid(gid)

  if (typeof xml !== 'string' || xml.trim() === '') return { ok: false, errors: ['导入内容为空'] }

  let g
  try {
    g = parse(xml)
  } catch (e) {
    return { ok: false, errors: [`XML 读不动：${e.message}`] }
  }
  const v = validate(g)
  if (!v.ok) return { ok: false, errors: v.errors }

  await storage.setItem(keyOf(gid), xml)
  return { ok: true, errors: [], data: g }
}

/** 删档（清空该槽）。 */
export async function clear(storage, gid) {
  assertStorage(storage)
  assertGid(gid)
  await storage.removeItem(keyOf(gid))
}
