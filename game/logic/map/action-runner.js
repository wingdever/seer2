// `core/map/action.ts` 出的**决议**（`ActionIntent`）落成**副作用**（施工批 **MB4** / `MDB2-b…e` 的执行半边）。
//
// 真值：`docs/map/map-npc.md §3.3`（执行接缝表）· `§5`（`MNI6`/`MNI7`/`MNI8`）· `§7.2 MNQ3`（链深 = 16）
//       `docs/map/map-impl.md §3.4`（MB4 蓝图）· `docs/map/map-code-map.md §2.3/§5.4/§6`
// 纪律：**决议 ③**（写盘 / 弹窗走**外部接口**，内核不直接做）· **MNI8**（写盘**收口一次**；`core` 不出"保存"语义）
//       **MNI7**（`npc` 可空：依赖 NPC 的动作**只登记不执行**）· **MNQ3**（`callback` 链深上限 = 16，超限登记**不抛**）
//       **M-5**（本件**不许** import `app/**`：一切外部能力由 `ctx` 注入）
//
// ⚠️ **本件只做适配**：今天大多数接缝（面板 C2 / 提示 A3 / 道具 / 宠 D6 / 战斗 E6 / 传送 M5 / 对话 MB6）
//    都还没有消费者 ⇒ 没有 sink 的决议一律**记一条日志、不动状态**（"能到得了接缝"即可，端到端随 MB5–MB7 闭合）。

import { resolve } from '../../core/map/action.js'

/** `callback` 链深上限（`MNQ3`）：超限 ⇒ 记一条登记、**不抛**。 */
export const MAX_CALLBACK_DEPTH = 16

/** 写盘类动作：上游 **6** 处各自 `SaveSystem.SaveData()`（`getPet:250`/`removePet:271`/`setPet:297`/`evolvePet:317`/`setMission:338`/`setActivity:352`）
 *  ⇒ 我们改成**执行器在一批决议落地后收口一次**（`MNI8` + `R4`）。 */
const SAVE_ACTIONS = new Set(['setItem', 'getPet', 'setPet', 'evolvePet', 'setActivity'])

/** 默认登记出口：**不许静默**（`MP7`）。 */
const defaultLog = (reason, intent) => console.warn('[map/action]', reason, intent)

/**
 * @typedef {object} ActionRunContext
 * @property {Record<string, Function>} [sinks] 接缝表（**按 `intent.action` 取名**；签名 = `(intent, api) => void|Promise<void>`）：
 *   `setNpcParam` `openHintbox` `openPanel` `openDialog` `teleport` `setItem` `setActivity` `getPet` `setPet` `evolvePet` `battle`。
 *   缺项 ⇒ 该决议只登记（`no-sink: <action>`），**不动状态**。
 * @property {import('../../core/map/condition.js').MapEnv} [env] `callback` 链再入要（`MDB2-e`）。
 * @property {'normal'|'shoot'} [mode] 模式门（透传给 `action.resolve`）。
 * @property {{callbackHandler?: Array}} [npc] 被点的 NPC（`callback`/提示盒回调的查找面；`MNI7` 允许 `null`）。
 * @property {(reason: string, intent: object) => void} [log] 登记出口（缺省 ⇒ `console.warn`）。
 * @property {() => (void|Promise<void>)} [save] **写盘收口**（`R4`；缺省 ⇒ 不落，留给 MB5 接线）。
 * @property {number} [maxCallbackDepth] 链深上限（缺省 = `MAX_CALLBACK_DEPTH` = 16）。
 */

/**
 * 一批决议 → 副作用，**写盘收口一次**（`MNI8`）。
 *
 * 这是"点一下 NPC"的执行入口：`mapScene` 先 `action.resolve(handler, env)` 出决议，
 * 再把整批交给本函数（`docs/map/map-impl.md §6` 的"遇 NPC 点击"两步）。
 *
 * @param {Array<object>} intents `ActionIntent[]`
 * @param {ActionRunContext} [ctx]
 * @returns {Promise<void>}
 */
export async function run(intents, ctx = {}) {
  const state = { dirty: false }
  const api = {
    log: ctx.log ?? defaultLog,
    npc: ctx.npc ?? null,
    /** `openDialog`/`battle` 的 sink 要**当场求值条件/建 env** ⇒ 把注入面随 `api` 透出（`M-5`：仍由 `ctx` 提供）。 */
    env: ctx.env ?? null,
    mode: ctx.mode ?? 'normal',
    /**
     * 给**延迟回调**用（`openHintbox` 的 `callbackTag` ⇒ 选项确认后跑；对话分支的回调同理）：
     * 按标签再入同一条链（`MDB2-e`）。⚠️ 这里从**深度 0** 起算（一次用户确认 = 一条新链的根）。
     */
    runCallbackTags: (tags, depth = 0) => runCallbackTags(tags, ctx, state, api, depth),
  }
  await runBatch(intents, ctx, state, api, 0)
  // 写盘**收口一次**（`MNI8`）：只有真改过状态的批次才落。
  if (state.dirty && typeof ctx.save === 'function') await ctx.save()
}

/** 顺序跑一批决议（`callback` 链再入也走这里 ⇒ 深度单调递增）。 */
async function runBatch(intents, ctx, state, api, depth) {
  for (const intent of intents ?? []) await applyIntent(intent, ctx, state, api, depth)
}

/** 一条决议 → 一个接缝（或一条登记）。 */
async function applyIntent(intent, ctx, state, api, depth) {
  if (!intent || typeof intent.action !== 'string') { api.log('malformed-intent', intent); return }
  switch (intent.action) {
    case 'unimplemented':
      // 未实现 / 畸形参数：**登记 + 不动状态 + 不抛**（`MP7` + `MNI6` + 决议 ②）。
      api.log(intent.reason || 'unimplemented', intent)
      return
    case 'setNpcParam':
      // `target === 'animal'` ⇒ 开动物面板 = **牧场（A 组出局）** ⇒ 只登记（`docs/map/map-npc.md §2.6` 第 1 行）。
      if (intent.target === 'animal') { api.log('a-group: animal-panel', intent); return }
      await callSink(ctx, api, intent, 'setNpcParam')
      return
    case 'openHintbox':
      // 带 `api`：`callbackTag` ⇒ A3 在"选项确认"时调 `api.runCallbackTags([tag])` 再入（`MDB2-e`）。
      await callSink(ctx, api, intent, 'openHintbox', api)
      return
    case 'openPanel':
    case 'teleport':
      await callSink(ctx, api, intent, intent.action)
      return
    case 'openDialog':
    case 'battle':
      // 这两个 sink 要读**当前 NPC + env**（对话翻页 / 开工三门）⇒ 随 `api` 透出（`openHintbox` 同款）。
      await callSink(ctx, api, intent, intent.action, api)
      return
    case 'setItem':
    case 'setActivity':
    case 'getPet':
    case 'setPet':
    case 'evolvePet': {
      // 只有**真落到 sink**才算"改过状态" ⇒ 才计入那一次收口写盘（`MNI8`）。
      const ok = await callSink(ctx, api, intent, intent.action)
      if (ok && SAVE_ACTIONS.has(intent.action)) state.dirty = true
      return
    }
    case 'callback':
      await runCallbackTags(intent.tags, ctx, state, api, depth)
      return
    default:
      api.log('unknown-intent', intent)
  }
}

/**
 * 调到接缝；缺 sink ⇒ 登记一条 `no-sink: <action>` 并返还 `false`（⇒ 不计入写盘）。
 * @returns {Promise<boolean>} 是否真调到了 sink
 */
async function callSink(ctx, api, intent, name, ...extra) {
  const fn = ctx.sinks?.[name]
  if (typeof fn !== 'function') { api.log(`no-sink: ${name}`, intent); return false }
  const out = fn(intent, ...extra)
  if (out && typeof out.then === 'function') await out
  return true
}

/**
 * `callback` 链再入（`NpcActionHandler.Callback` 的等价：`typeId` 匹配 `callbackHandler` ⇒ 再走一遍 `resolve`，
 * 含**模式门 + 条件门**）。四道闸全**只登记不抛**：
 *   ① 链深 ≥ 上限（`MNQ3`）；② `npc === null`（`MNI7`）；③ `callbackHandler` 空；④ 标签一条都匹配不到。
 */
async function runCallbackTags(tags, ctx, state, api, depth) {
  const intent = { action: 'callback', tags }
  const limit = Number.isInteger(ctx.maxCallbackDepth) ? ctx.maxCallbackDepth : MAX_CALLBACK_DEPTH
  if (depth >= limit) { api.log('callback-depth-exceeded', intent); return }
  if (!ctx.npc) { api.log('callback-npc-null', intent); return }
  const handler = ctx.npc.callbackHandler
  if (!Array.isArray(handler) || handler.length === 0) { api.log('callback-handler-empty', intent); return }
  if (!ctx.env) { api.log('callback-no-env', intent); return }
  const want = new Set(tags ?? [])
  const matched = handler.filter((b) => b && want.has(b.typeId))
  if (matched.length === 0) { api.log('callback-tag-not-found', intent); return }
  const next = []
  for (const b of matched) {
    const it = resolve(b, ctx.env, { mode: ctx.mode })
    if (it) next.push(it)
  }
  await runBatch(next, ctx, state, api, depth + 1)
}
