// #/login —— 选择角色场景（重启血统 Login；设计 docs/view/scene/start/view-scene-start-design.md §3.2）。
// 画面与状态机全在 view/start/loginView.js；**存档读写只在本壳**。
//
// ⚠️ **为什么接线在壳里而不是 view 里**（施工图 §6.2 原写"view 里唯一的存档依赖"）：
//    `game/app/view/**` 是 L3，**不许** import L1 `game/logic/**` 或 L4 `session.js`（`docs/arch-code.md §3` 第 3 条，
//    唯一登记例外 = view → `content.js`）。所以 view 只收**数据 + 回调**，值转换/落盘全在本场景（见施工图 §9.2 新偏差）。
//
// 三条口径（施工图 §6.2 / §9.6，零算数）：
//   ① 3 格 = `repository.load` 的投影（**只读**；缺档由 Save 线造默认档 ⇒ 昵称为空 =「空档」，STI11）；
//   ② 建号 = `load` + 改 `nickname`/`gender` + `save`（**不是** `newGame`，那会重掷宠/币）；
//   ③ 进图 = `load({..., login:true})`（登录收尾）→ `session.js` 的 `adopt({gid, data})` → `go('map', {slot:gid})`。
import { go } from '../router.js'
import { openPanel, closePanel, setCanvasMode } from '../view/panels/host.js'
import { openHintbox } from '../view/panels/hintbox.js'
import * as loginView from '../view/start/loginView.js'
import * as repo from '../../logic/save/repository.js'
// ⚠️ `adopt`/`ensureTables` 是 `session.js` 的**模块级导出**（不是 `session` 对象上的方法）——
//    2026-10-18 手测踩过一次：写成 `session.adopt(...)` ⇒ 进图时抛 "session.adopt is not a function"。
import { session, adopt, ensureTables } from '../session.js'

let entry = null
let view = null

const msg = (e) => String((e && e.message) || e)

/**
 * `GameData.gender` 是 **bool**，且 **false = 男**。
 * 证据：上游 `CreateRoleModel.gender` 初值 `false`（`.../Model/Player/CreateRoleModel.cs:8`）；
 * `CreateRoleView.SetGender(gender)` 取 `gender ? 1 : 0` 高亮 `genderImage[chosen]`（`.../View/Player/CreateRoleView.cs:16-18`），
 * 而 `Login.unity` 里 `genderImage` 两项的 GameObject 名依次是 `Male`、`Female`（fileID 677850106 / 1986130412）
 * ⇒ `genderImage[0]` = 男 ⇒ **`false` = 男、`true` = 女**。
 */
const genderOf = (g) => (g ? 'female' : 'male')

/** 3 格投影（`gid` = 0..2；**只读**，形状正常的档一个字节都不改）。 */
async function projectSlots() {
  const tables = await ensureTables()
  const out = []
  for (let gid = 0; gid < repo.MAX_SAVE_COUNT; gid++) {
    const g = await repo.load(session.storage, { gid, tables })
    out.push({ gid, nickname: String(g.nickname || ''), gender: genderOf(g.gender), isEmpty: repo.isEmpty(g) })
  }
  return out
}

/** 建号（空槽）：只覆盖昵称/性别，其余按 Save 线的默认档口径原样。 */
async function onCreate({ gid, nickname, gender }) {
  try {
    const tables = await ensureTables()
    const g = await repo.load(session.storage, { gid, tables })
    g.nickname = nickname
    g.gender = gender === 'female'
    await repo.save(session.storage, gid, g)
    return { ok: true }
  } catch (e) {
    return { ok: false, errors: [msg(e)] }
  }
}

/** 导入 XML 覆盖该槽（**ok 才写**；失败把 `errors` 原样交回，不静默）。 */
async function onImport(gid, file) {
  try {
    const xml = await file.text()
    const r = await repo.importXML(session.storage, gid, xml)
    if (r.ok) view?.update?.(await projectSlots())   // 只重载格子，不 reload 整页（施工图 §4.2）
    return r.ok ? { ok: true } : { ok: false, errors: r.errors || [] }
  } catch (e) {
    return { ok: false, errors: [msg(e)] }
  }
}

/** 选档进图：登录收尾 → 交会话 → 换场景（**槽位随路由走**，地图场景按它取会话）。 */
async function onEnterMap(gid) {
  const tables = await ensureTables()
  const g = await repo.load(session.storage, { gid, login: true, tables })   // ⚠️ 进图这一次才 login:true
  adopt({ gid, data: g })
  go('map', { slot: gid })
}

export async function mount() {
  setCanvasMode('match')
  let slots = [], loadError = null
  try {
    slots = await projectSlots()
  } catch (e) {
    loadError = e
    slots = Array.from({ length: repo.MAX_SAVE_COUNT }, (_, gid) => ({ gid, nickname: '', gender: 'male', isEmpty: true }))
  }
  entry = openPanel('rst-login', (el) => {
    view = loginView.mount(el, { slots, onCreate, onImport, onEnterMap })
  }, { scrim: false })   // 整屏登录 UI：背后无交互元素，遮罩会无端压暗背景
  if (loadError) {
    openHintbox({
      content: `存档读不出来：${msg(loadError)}\n（缺档要造默认档 ⇒ 需要写端点。手测请用 node tools/serve.mjs，见 docs/view/scene/start/view-scene-start-impl.md §9.4）`,
      optionNum: 1,
    })
  }
}

export function unmount() {
  view?.destroy?.()
  view = null
  if (entry) { closePanel(entry); entry = null }
  setCanvasMode('fixed')
}
