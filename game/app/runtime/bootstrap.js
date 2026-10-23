// 运行时装配点（★ 唯一）
//
// 归属：**运行时线 RB6**（`docs/runtime/runtime-components-design.md §6`）。
// 调用者：**编排线** `game/app/sceneLoader.js` 的 `boot()` —— 只此一条注入路径（**OR7**）。
// 本批（第一刀 / ORB4-a）只落「**`storage` 的归属**」这一件：它是 View B5 批 C 的唯一硬前置；
// R1/R2/R4/R5/R6/R7 的归位与 R4/R5 两个新 sink 的建档按 RB6 的顺序留到 **ORB4-b**
// （今天 R4/R5 在 core 里连缝都没有：`grep "setSaveRequest\|requestSave" game/core` = 0）。
import { createFsStorage } from '../../logic/save/storage.js'
import { session } from '../session.js'

let installed = null

/**
 * 装配。**幂等**：重复调用只重装，不重复建对象。
 * @param {{storage?: object}} [opts] 测试可注入（`createMemStorage` 等）；产品路径不传 ⇒ 真文件适配器
 */
export async function bootstrapRuntime({ storage = null } = {}) {
  const st = storage || createFsStorage()
  session.storage = st
  installed = { storageKind: st.kind || 'custom' }   // ← 全仓唯一决定“存档放哪”的一行（OR7）
  // 上游 `Player.Start()`（`Player.cs:45-49`：`random = Random.Range(0, 100)`）**每进程**掷一次 ⇒ 跨存档共享、不落盘。
  // 这里同样只在**进程启动**时播一次；战斗不重置（否则 `random[old]` 会每局归 0，见 impl §2.6 订正③）。
  if (session.random == null) session.random = Math.floor(Math.random() * 100)
  return runtimeStatus()
}

/** 诊断（手测时看装了什么 / 没装什么；**不进**产品路径）。 */
export function runtimeStatus() {
  return {
    storage: installed ? { kind: installed.storageKind, ready: !!session.storage } : null,
    seams: {
      r1: 'per-battle（coreBattleDriver.js 每局 createRng）',
      r2: 'not-installed（ORB4-b）',
      r3: 'delegated → session.readRandom/writeRandom/readPlayerData',
      r4: 'not-installed（core 内无接缝 ⇒ RB3/ORB4-b 建档）',
      r5: 'not-installed（同上）',
      r6: 'per-battle（coreBattleDriver.js 内装）',
      r7: 'installed（battle/driver/tables.js）',
    },
  }
}
