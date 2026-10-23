// 平台接口（编排线 D6）：光标 / 舞台尺寸 / 在线开关。
// 归 L4，**不进 core**（core 不许知道 DOM / 光标）。本批只**暴露**现状，不改样式。
import { session } from './session.js'

/** 上游 `GameManager.cs:10` 的联机开关位；我们恒 false（ORQ5 = 联机暂不做）。 */
export const onlineMode = false

/** 上游 `Utility` 的初始化（`HelperUtility.cs`）。今天网页端零实现 —— 留缝，不假装做了什么。 */
export function init() {
  // 舞台是 `game/index.html:10-12` 的 1200×660，写死；这里只暴露，不改
}

/**
 * 光标（上游 `Utility.SetCursor`）。
 * 修 **ORC3**：`seed` 特例的光标会跨图残留 ⇒ 换场景时由 `sceneLoader` 传 `null` 复位。
 * 网页端今天没有硬件光标（SWF 内自带），所以这里是**记状态的空实现**，不是“已实现”。
 */
let cursor = null
export function setCursor(tex = null) {
  cursor = tex || null
  return cursor
}

export function currentCursor() { return cursor }

/** 舞台尺寸（上游 `Utility` 的屏幕尺寸；本仓 = `#wrap` 的 1200×660）。 */
export function screenSize() {
  const el = document.getElementById('wrap')
  return { w: el?.clientWidth || 1200, h: el?.clientHeight || 660 }
}

/** 诊断用：平台层看到的状态（不进产品路径）。 */
export function platformStatus() {
  return { onlineMode, cursor: !!cursor, size: screenSize(), sessionReady: !!session.active }
}
