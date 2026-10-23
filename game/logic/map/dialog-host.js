// L1 · 地图**对话**宿主（施工批 **MB6** / `docs/map/map-impl.md §3.6`）。
//
// 把 L0 `core/map/dialog.ts`（纯物化 / 选择 / 插值 / 关闭）接到**真状态**上：
//   ① `entity.dialogHandler[]`（`<branch>` 片段串）→ `lexDialogBranch`（L1 XML）→ `parseDialogBranches`（L0）→ `DialogBranch[]`；
//   ② `{expr:}` 内容插值 = **一张 env 前缀表**（`DLI7`：`item[..].num` 读 `env.items`、禁副作用臂 `DLI6`）；
//   ③ **打开期可见性**（`DLQ5`：`OR(resolutions[].condition) ≠ false` ⇒ 渲染）+ **点击期全跑不短路**（`DLI5`）——
//      条件求值用 `core/map/condition.ts` 的 `evalCondition`（env 由 **L4** 经 `createMapEnv` 传入，本件**不取数**）。
//
// ⚠️ **本件无 DOM / 不 fetch / 不 import app**（依赖规则 `M-5`）：只**产可渲染数据 + 决议**，
//    上屏（自绘最小对话框）与把 `intents` 交给 `action-runner.run` 全在 **L4 `mapScene.js`**。
// ⚠️ **无栈状态机**（`DLI1`）：唯一状态 = `(npcId, branchId)`；翻页换 `branchId`、关闭归零 ⇒ 本件**不持状态**，
//    每次 `openDialog` 就地 lex + 决议（"进图现场取"同 `parse-map`，MB6 不建对话索引，遵 §4.9 不缓存）。
//
// 真值：`docs/map/map-dialog.md §3.1–§3.5`（目标契约）· `§2.9`（`{expr:}` 实测唯一用例 = `10693` 的 4 个 `item[..].num`）
//       `docs/map/map-impl.md §3.6`（MB6 蓝图）· `docs/map/map-code-map.md §2.3`（落点）

import { tryParseFloat } from '../../core/strutil.js'
import { evalCondition, readMapValue } from '../../core/map/condition.js'
import { parseDialogBranches, resolveBranch, renderContent } from '../../core/map/dialog.js'
import { lexDialogBranch } from './entity.js'

/**
 * `{expr:}` / `[expr]` 的**共享求值面**（`DLI7`）：委托 L0 `condition.ts` 的 `readMapValue`（同一张前缀表，
 * `CSI3`：前缀分派只住一份、不在此重写文法）⇒ 返回 `number | null`（`null` = **不认识 / 取不到** ⇒
 * `dialog.ts` 保留字面 `{expr:…}` + 日志，⚠️**不照搬上游"打进对白一个 `0`"**，`§3.5`）。
 *
 * ★**禁副作用臂**（`DLI6`）：`random` ⇒ `readMapValue` 返回 `null`（上游每次读 content 都重摇 ⇒ 内容会"抖"）。
 * ★**B1/B2 变活**：`map.`/`item.`/`item_yite.`/`activity.`/`player.`/`battle.`/`data.`/`firstPet.` 均经
 *   L4 传入的**真 `MapEnv`** 读数（本批 items/activities 已接真状态）；取不到 ⇒ `null`（V2 口径：不瞎猜 0）。
 * ★**裸数字字面量**兜底（`{expr:5}` 之类，实测 0 条，留兼容）。
 */
export function makeExprResolver(env) {
  return (expr) => {
    const id = String(expr ?? '').trim()
    if (!id) return null
    const v = readMapValue(id, env)
    if (v !== null) return v
    const literal = tryParseFloat(id.replaceAll('－', '-'))   // 前缀表不认识 ⇒ 试裸字面量
    return literal === null ? null : literal
  }
}

/**
 * 一条 NPC 的 `dialogHandler[]` → `DialogBranch[]`（L1 lex 每条 `<branch>` → L0 物化，`DLI3`：只吃 `<dialog>` lex 结果）。
 * @param {{dialogHandler?: string[]}} entity `buildEntities` 的一条
 * @param {(r: string, d?: string) => void} [log]
 */
export function branchesOf(entity, log) {
  const lexed = (entity?.dialogHandler ?? []).map(lexDialogBranch).filter(Boolean)
  return parseDialogBranches(lexed, log)
}

/** 一条出路（`Resolution`）在当前 env 下是否**满足**（`true`）/ 未知（`'unknown'`）/ 不满足（`false`）。 */
function resolutionTruth(res, env) {
  return evalCondition(res.condition, env)
}

/**
 * **一个选项的渲染态**：可见性（`DLQ5`：任一出路 `≠ false` ⇒ 渲染）+ 该选项的各出路（供点击期再判）。
 * ⚠️ `'unknown'` 计入"可见"（玩家看得到、点了可能没反应，与 M3 §3.3 同口径，已记日志）。
 */
export function choiceView(choice, env) {
  const truths = choice.resolutions.map((r) => resolutionTruth(r, env))
  const visible = truths.some((t) => t !== false)                    // OR ≠ false
  return { visible, truths }
}

/**
 * **点击期**（`DLI5`）：一个选项 ⇒ 按注册顺序求值**全部**出路，返回**每一个满足者**的 `ActionIntent`（**不短路**）。
 * 数据作者的互斥约定（实测 177 次"一个按钮两条出路"）建立在"全跑"上 ⇒ 两个都满足时两条都执行（照录上游，**不改**）。
 * @returns {import('../../core/map/action.js').ActionIntent[]}
 */
export function clickChoice(choice, env) {
  const out = []
  for (const res of choice.resolutions) {
    if (resolutionTruth(res, env) === true) out.push(res.intent)
  }
  return out
}

/**
 * `openDialog` 的一条决议产物 = **可渲染载荷**（交 L4 自绘最小对话框）。三种结局（`DLI4` / `DLC3`）：
 *   · `close`   ⇒ L4 撤浮层（独立意图，`param0='null'`/`'close'`）；
 *   · `missing` ⇒ **保持当前对话不动** + 记日志（★目标：不关，上游 `OpenDialog(null)` 会关 = `DLC3`）；
 *   · `branch`  ⇒ 说话人名 + 插值后正文 + 可见选项（每项带 `choice` 引用，点击交 `clickChoice`）。
 *
 * @param {object} entity `buildEntities` 的一条（含 `dialogHandler[]`）
 * @param {string} param0 `openDialog` 的 `param[0]`（翻页 branch id / 哨兵）
 * @param {import('../../core/map/condition.js').MapEnv} env L4 经 `createMapEnv` 建好的注入面
 * @param {(r: string, d?: string) => void} [log]
 */
export function openDialog(entity, param0, env, log) {
  const branches = branchesOf(entity, log)
  const picked = resolveBranch(branches, param0)
  if (picked === 'close') return { kind: 'close' }
  if (picked === 'missing') {
    env.log.unknown(`dialog-missing-branch: ${param0}`)              // DLC3：不关、只登记
    return { kind: 'missing', wanted: param0 }
  }
  const render = makeExprResolver(env)
  const contentText = renderContent(picked.content, render, log)
  const choices = []
  for (const c of picked.choices) {
    const { visible } = choiceView(c, env)
    if (visible) choices.push({ description: c.description, choice: c })
  }
  return {
    kind: 'branch',
    npcId: entity?.id,
    branch: {
      id: picked.id,
      speakerName: picked.speakerName,
      contentText,                                                    // 富文本标签（`<color>`/`<b>`）仍在，L4 转 DOM
      presentation: picked.presentation,
      icon: picked.icon,                                              // ★A2：说话人头像 `{resId,size,pos,tint}`（`<branch @icon>`；L4 经 `npc-art.iconUrl` 取图）
    },
    choices,
  }
}
