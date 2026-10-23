// 浏览器版 PhaseUI —— game/core/battle/phase.ts 的 PhaseUI 接缝实现。
// 与差分 harness（snap-mirror.mjs makeDriveHost）的**刻意分歧**：那边把 processQuery/stopTimer 做成
// 抛 NRE 是为了镜像 BattleManager 的 Uninit（systemView 为 null）；浏览器里有真渲染面，
// setState 是**渲染钩子**（把这一帧的 last/current 交出去重绘），processQuery/stopTimer 是 no-op。
// 这条分歧只影响表现时机，不影响任何数字（数字全在内核 state 里，phase 已算好）。
// onFrame 是**每一次** setState 都给的旁路（伤害飘字信号层 DB1 用）；onState 仍只留最后一帧给 HUD 重绘。
// 两者都只读，不改内核。
export function createPhaseUi(onState, onFrame) {
  return {
    setState(last, current) { if (onFrame) onFrame(last, current); onState(last, current) },
    processQuery(_processOne) { /* 浏览器：渲染由 setState 驱动，这里 no-op */ },
    stopTimer() { /* 浏览器：无 PVP 计时器，no-op */ },
    setBottomBarInteractable(_b) { /* U1 底栏交互留到调用方按需接，默认 no-op */ },
    setOptionActive(_i, _a) { /* 同上 */ },
  }
}
