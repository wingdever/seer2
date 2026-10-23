// 场景切换器（编排线 L4）。**唯一**换场景入口（OR2）。
//
// 本批（第一刀）只落 `boot()` 的最小形状（启动顺序 = design §4.2 修订版 / impl D8）：
//   platform.init() → bootstrapRuntime()（先建 storage）→ route()
//   （**不读档**：读档 = 场景的事，见 `session.ensureLoaded`；上游 GameManager.GameLogin 也是进场景时调）
// `unmount` 先于 `mount`、last/next、加载层挂钩（ORB5）留给 **ORB2**（router.go 今天仍是唯一写 hash 的地方）。
import { route, go } from './router.js'
import { init as platformInit, setCursor } from './platform.js'
import { bootstrapRuntime } from './runtime/bootstrap.js'
import { session } from './session.js'

let booted = false
const beforeHooks = new Set()

/** 当前 hash 的场景名（与 `router.js:13-17` 同口径；不在这里写 hash）。 */
function routeName() {
  const h = (location.hash || '').replace(/^#\/?/, '')
  return (h.split('?')[0] || 'map')
}

/** 启动：`main.js` 的唯一入口。**幂等**。 */
export async function boot() {
  if (booted) return
  booted = true
  platformInit()
  await bootstrapRuntime()   // ⚠️ 必须早于读档：storage 在这里创建，会话要拿它当入参（D8）
  // 读档**不在这里**：槽位是路由的事（`#/map?slot=2` 的开发捷径 / 批 C 的登录场景选定），
  // 由地图场景在 `mount` 里调 `session.ensureLoaded({gid})`（见 impl §3.2 ③ 与 `mapScene.js initSession`）。
  await route()
}

/**
 * 换场景（场景内部跳转都走这里）。今天 = `router.go` + 光标复位；
 * **ORB2** 再补 `unmount`/`mount` 的显式时序与加载层挂钩。
 */
export function changeScene(name, params) {
  for (const fn of beforeHooks) {
    try { fn(name, params) } catch (e) { console.warn('[sceneLoader] beforeChange 抛错', e) }
  }
  setCursor(null)            // 修 ORC3：上一张图的光标不跨图残留
  go(name, params)
}

/** 加载层的挂钩点（ORB5 用；今天只有 `changeScene` 触发）。 */
export function onBeforeChange(fn) {
  beforeHooks.add(fn)
  return () => beforeHooks.delete(fn)
}

/** 诊断（手测/控制台用）。 */
export function bootStatus() {
  return { booted, scene: routeName(), sessionReady: !!session.active, gid: session.gid }
}
