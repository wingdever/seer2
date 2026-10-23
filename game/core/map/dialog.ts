// 地图**对话**的**纯逻辑**（施工批 **MB6** / `MDB4-a…e`；真值 = `docs/map/map-dialog.md §3`）。
//
// L0（`MP3`）：零上层 import、**不 XML 解析**（`fast-xml-parser` 住 L1，同 `button.ts`/`entity.js` 的分工：
//   L1 把 `<branch>` 片段串 lex 成 `LexedBranch`，本件只做**物化 / 选择 / 插值 / 关闭**这四件纯事）。
//   不碰时钟 / 随机 / 渲染（`MP2`）；只出**决议**（`MQ4`：`Choice.resolutions[].intent` 是 `ActionIntent`，执行归 `action-runner`）。
//
// 真值：`docs/map/map-dialog.md §2.2`（`DialogInfo` 形状）· `§2.3`（`branch` 三重身份 ⇒ 只吃 `<dialog>` 下 lex 好的）·
//       `§2.5`（入口 `openDialog` 的 `param` 合同 + 哨兵 `"null"`⇒关）· `§2.8`（★`type="branch"` = 附挂到上一条可见项）·
//       `§2.9`（`{expr:}` 插值）· `§2.10`（`story=` 前缀）· `§3.2–§3.5`（目标契约）
// 纪律：**DLI1**（无栈：唯一状态 `(npcId, branchId)`）· **DLI3**（按父元素分派，绝不按标签名 —— 本件只收 `dialog` lex 结果）·
//       **DLI4**（关闭 = 独立意图，`resolveBranch` 认 `'close'`）· **DLI5**（点击期满足者**全部**执行、不短路）·
//       **DLI6**（内容插值禁副作用臂）· **DLI7**（插值走**一张共享前缀表**，不写第四份文法）·
//       **DLQ1**（`story=` 只标 `presentation`、不演）· **DLQ5**（打开期可见性 = 本批唯一行为改动）·
//       **DLC1**（永不变异 `rawContent`：`story=` 前缀在**解析期剥一次**）· **DLC3**（找不到分支 ⇒ `'missing'`、不关对话）·
//       **DLC5**（`idx0` 附挂 ⇒ 登记 `orphan-branch`、不进黑洞）· **DLC8**（插值**单次线性扫描**、展开结果不再参与扫描）
//       · **V2/决议 ②**（上游 bug ⇒ 声明 + 不照搬）

import { parseConditions } from './condition.ts'
import type { ConditionExpr } from './condition.ts'
import { buildIntent } from './action.ts'
import type { ActionIntent } from './action.ts'
import type { ButtonSpec } from './button.ts'

// ───────────────────────────── L1 lex 产物（本件的**输入**；XML 解析在 L1） ─────────────────────────────

/**
 * 一条 `<dialog><branch>` 的**已 lex** 记录（L1 `dialog-host.js` 用 `fast-xml-parser` + `entity.js` 的
 * `parseButtonFragment` 造出来；★`funcs`/`replies` 各自来自 `<functionHandler><func>` / `<replyHandler><reply>`，
 * `type`（=`typeId` 原串）里 `'branch'` 才是附挂项，其余一律当可见项 —— `DLI3`）。
 */
export interface LexedBranch {
  id: string
  name: string                              // 说话人名（中文 ⇒ DOM 真值，`MP4`）
  icon?: string                             // `@icon`（resId 原串）
  size?: string                             // `@size`
  pos?: string                              // `@pos`
  color?: string                            // `@color`（实测 0 命中 ⇒ 缺省即白）
  content: string                           // `<content>` 的 CDATA **原串**（可能以 `story=` 开头）
  gif?: { resId?: string; speed?: string }  // `<gif>`（实测 3 条；形状留位）
  funcs: ButtonSpec[]
  replies: ButtonSpec[]
}

/** 一条**可见项**的**一条出路**（`Choice` = 一个按钮、多条出路，`map-dialog.md §3.3`）。 */
export interface Resolution {
  condition: ConditionExpr   // M3 的类型，本份不重定义
  intent: ActionIntent       // M2 的类型（`buildIntent` 出的纯决议）
  typeId: string             // `'click'` / `'branch'`（附挂）—— 供日志/登记
}

/** 一个对话选项（`type != 'branch'` 的可见项 + 其附挂的 `branch` 项）。 */
export interface Choice {
  description: string
  resolutions: Resolution[]  // ★有序：`[自身, ...附挂]`（`§2.8` 的物化）
  isFunc: boolean            // 来自 `func`（系统跳转）还是 `reply`（玩家选项）—— A3 版式区分，本线只登记
}

/** 一条对话分支（决议式，不含 UI；形状正本 = `map-dialog.md §3.2`）。 */
export interface DialogBranch {
  id: string
  speakerName: string
  icon?: { resId: string; size: string; pos: string; tint: string }
  content: string                          // raw（**未插值**；`story=` 前缀已剥一次，`DLC1`）
  presentation: 'plain' | 'story'          // ★解析期物化（`DLQ1`：story 只标不演）
  gif?: { resId: string; speed?: string }
  choices: Choice[]
}

/** 默认登记出口（**不许静默**，`MP7`）。 */
const defaultLog = (reason: string, detail?: string): void => {
  console.warn('[map/dialog]', reason, detail ?? '')
}

/** `type != 'branch'` ⇒ **可见项**（`DLI3`：对话容器里只有 `branch` 有意义，其余一律渲染、可点）。 */
function isVisible(spec: ButtonSpec): boolean {
  return spec.typeId !== 'branch'
}

/** 一个 handler 数组（`func` / `reply`）→ 若干 `Choice`，附挂项并入上一条可见项（`§3.3` 解析期物化）。 */
function materialize(items: ButtonSpec[], isFunc: boolean, branchId: string, log: (r: string, d?: string) => void): Choice[] {
  const choices: Choice[] = []
  let last: Choice | null = null
  for (const spec of items) {
    const res: Resolution = {
      condition: parseConditions(spec.condition),
      intent: buildIntent(spec),
      typeId: spec.typeId ?? '',
    }
    if (isVisible(spec)) {
      last = { description: spec.description ?? '', resolutions: [res], isFunc }
      choices.push(last)
    } else if (last) {
      last.resolutions.push(res)          // 附挂：挂到最近一个可见项（`§2.8`）
    } else {
      log('orphan-branch', `${branchId} @idx0`)   // `idx0` 附挂 ⇒ `lastText==null` ⇒ 上游静默丢弃（`DLC5`），这里**登记不丢进黑洞**
    }
  }
  return choices
}

/**
 * lex 好的一批 `<branch>` → `DialogBranch[]`（`DLI3`：只吃 `<dialog>` 下的 lex 结果，绝不按标签名全局匹配）。
 * 解析期顺带登记**同 NPC 重复 id**（`Find` 取首个 ⇒ 第二个永不可达，实测 1 例）。
 * ⚠️ **悬空引用**在这里判不了（要等运行时 `param0`），归 `resolveBranch`。
 */
export function parseDialogBranches(lexed: LexedBranch[], log: (r: string, d?: string) => void = defaultLog): DialogBranch[] {
  const seen = new Set<string>()
  const out: DialogBranch[] = []
  for (const b of lexed) {
    if (seen.has(b.id)) log('dup-branch-id', b.id)   // 保留首个（照上游 `Find`），第二个仍建但已登记
    seen.add(b.id)
    // ★`story=` 前缀**解析期剥一次**（`DLC1` 就地改写洞关掉；此后 `content` 永不因读取而变异）
    const isStory = b.content.startsWith('story=')
    const content = isStory ? b.content.slice('story='.length) : b.content
    const choices = [...materialize(b.funcs, true, b.id, log), ...materialize(b.replies, false, b.id, log)]
    const icon = b.icon != null
      ? { resId: b.icon, size: b.size ?? '0,0', pos: b.pos ?? '0,0', tint: b.color ?? '255,255,255,255' }
      : undefined
    out.push({
      id: b.id,
      speakerName: b.name,
      ...(icon ? { icon } : {}),
      content,
      presentation: isStory ? 'story' : 'plain',
      ...(b.gif ? { gif: { resId: b.gif.resId ?? '', ...(b.gif.speed ? { speed: b.gif.speed } : {}) } } : {}),
      choices,
    })
  }
  return out
}

/** `resolveBranch` 的结果：一条分支 / 关闭（独立意图，`DLI4`）/ 找不到（`DLC3`：保持当前对话不动 + 记日志）。 */
export type BranchResolution = DialogBranch | 'close' | 'missing'

/**
 * 入口 / 翻页：`param0` = **当前 NPC 的 branch id**（`DLI2`；作用域 = 本 NPC 的 `DialogBranch[]`，不建全局表）。
 * `'null'`/`'close'` ⇒ `'close'`（`DLI4`：M1 桥已把 533 条哨兵归一化成 `openDialog{branch:'close'}`）；
 * 找不到 ⇒ `'missing'`（★目标 = **不关对话**，上游 `OpenDialog(null)` 会把对话关掉 = `DLC3`）。
 */
export function resolveBranch(branches: DialogBranch[], param0: string): BranchResolution {
  if (param0 === 'close' || param0 === 'null') return 'close'
  return branches.find((b) => b.id === param0) ?? 'missing'
}

/** 一条分支的可见项集合（`Choice[]`；打开期可见性 = OR≠false 的过滤归 L1 宿主，`DLQ5`）。 */
export function choicesOf(branch: DialogBranch): Choice[] {
  return branch.choices
}

/**
 * `{expr:}` 内容插值（`§2.9` / `§3.5` / `MQ8` 的最小落法；实测全库只有 `10693.xml` 一条 content、4 个表达式）。
 *
 * ★**单次线性扫描**：展开结果**不再参与扫描**（关掉 `DLC8` 的"二次求值/无深度上限"洞）。
 * ★**禁副作用臂**（`DLI6`）：`random`（含 `[new]`/裸写）一律 ⇒ **原样保留 `{expr:…}`** + 日志（上游每次读 content 都重摇）。
 * ★**共享一张前缀表**（`DLI7`）：`resolveExpr` 由 L1 注入（`MapEnv ∪ IdentifierHost` 的解析器）；返回 `null` = 未知/失败 ⇒
 *   **原样保留 `{expr:…}`** + 日志，⚠️**不照搬上游"打进对白一个 `0`"**（`§3.5` / 与 M3/CSC6 同一条改判）。
 * ⚠️ **未闭合**（无 `}`）⇒ **原样输出**、不抛（`V2`：数据错字不是 bug）。
 * ⚠️ **永不变异**传入串（`DLC1`）。
 */
export function renderContent(
  raw: string,
  resolveExpr: (expr: string) => number | null,
  log: (r: string, d?: string) => void = defaultLog,
): string {
  const OPEN = '{expr:'
  let result = ''
  let i = 0
  for (;;) {
    const start = raw.indexOf(OPEN, i)
    if (start < 0) { result += raw.slice(i); break }
    const close = raw.indexOf('}', start + OPEN.length)
    if (close < 0) { result += raw.slice(i); break }          // 未闭合 ⇒ 原样输出（余下整段照抄）
    const expr = raw.slice(start + OPEN.length, close)
    result += raw.slice(i, start)
    if (expr.trimStart().startsWith('random')) {              // 副作用臂 ⇒ 拒（`DLI6`）
      log('expr-sideeffect-banned', expr)
      result += raw.slice(start, close + 1)                   // 保留原 `{expr:…}`
    } else {
      const v = eval(expr)
      if (v === null) {
        log('expr-unknown', expr)
        result += raw.slice(start, close + 1)                 // 未知/失败 ⇒ 保留原样、不显示 0
      } else {
        result += String(v)
      }
    }
    i = close + 1
  }
  return result
}
