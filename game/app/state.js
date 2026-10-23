// SPA 内的跨场景 handoff（**编排线第一刀**起，值归会话；这里只是兼容代理）。
// 原来战斗页用 sessionStorage['roco.battle.result.v1'] 把战果递给地图页（两个 document 之间的桥），
// 单页之后两个场景同进程，就只剩这一份内存对象：战斗写、地图读一次即清、reload 自然归零（OR4）。
// ⚠️ 新代码请直接用会话的 `takeResult()` / `session.lastResult`（前者是 `game/app/session.js` 的**模块导出**，
//    不是 `session` 对象上的方法 —— 写 `session.takeResult()` 会抛 TypeError）；本对象只保证旧调用点不改。
import { session } from './session.js'

export const APP = {
  get lastResult() { return session.lastResult },
  set lastResult(v) { session.lastResult = v == null ? null : v },
  scene: '',
}
window.APP = APP
