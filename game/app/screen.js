// 全局「游戏屏幕大小」配置（编排线 · 屏幕线；人类 2026-10-19 拍板）。
//
// 唯一的屏幕尺寸开关：所有场景（开始 / 登录 / 标题 / 房间 / 战斗）共用同一个 1200x660 逻辑舞台，
// 本模块只决定这个舞台「按原尺寸显示（fixed）」还是「等比缩放到铺满窗口（full，contain）」。
//
// 历史：原本只有战斗场景挂载时私自给 body 加 rbb-full、把 #wrap 撑成 100vw x 100vh；
//       现在收回到这里，由单一配置统一驱动（房间/开始/战斗… 全部落在同一个游戏屏幕里，见 docs/view/mech/view-shell.md S3.4）。
//
// 不变量：本模块只改「视口 -> 舞台」的变换（CSS transform: scale，contain），绝不改舞台内坐标
//         （舞台内恒 1200x660；地图点击经 getBoundingClientRect 已自动吃掉这层缩放，见 mapScene.js）。
//         画布模式（fixed/match，即 HUD 逻辑高 540/528）仍由各场景按自己版面需要决定，本模块不管。
//
// 依赖：纯浏览器（document / globalThis.localStorage / addEventListener），不进 core。

export const SCREEN_FIXED = 'fixed'   // 1200x660 原尺寸
export const SCREEN_FULL = 'full'     // 尽可能大：整舞台等比缩放铺满窗口（contain，留边）

const KEY = 'seer2.screenMode'
const STAGE_W = 1200
const STAGE_H = 660

let mode = SCREEN_FIXED
let resizeBound = false

function readStored() {
  try {
    const v = globalThis.localStorage && globalThis.localStorage.getItem(KEY)
    return v === SCREEN_FULL ? SCREEN_FULL : SCREEN_FIXED
  } catch {
    return SCREEN_FIXED
  }
}

export function getScreenMode() {
  return mode
}

export function setScreenMode(next) {
  const m = next === SCREEN_FULL ? SCREEN_FULL : SCREEN_FIXED
  if (m === mode) return
  mode = m
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(KEY, m)
  } catch {
    /* 隐私模式：静默，配置不持久但本次会话仍生效 */
  }
  applyScreenMode()
}

// 整舞台等比缩放铺满窗口（contain：取较小比例 => 全可见、多出的方向留黑边）。
// #wrap 的 layout 尺寸恒 1200x660（transform 不改 layout），所以内部所有坐标/点击映射都不受影响。
function fitStage() {
  const wrap = document.getElementById('wrap')
  if (!wrap) return
  const s = Math.min(globalThis.innerWidth / STAGE_W, globalThis.innerHeight / STAGE_H)
  wrap.style.transformOrigin = 'center center'
  wrap.style.transform = 'scale(' + s + ')'
}

// 唯一把配置落到 DOM 的地方。
//   full  => body.screen-full（隐藏页面 chrome：#rvbar/#h1/#log/#bar）+ 整舞台等比缩放铺满窗口；
//   fixed => 还原 1200x660 原尺寸、显示页面 chrome。
export function applyScreenMode() {
  const wrap = document.getElementById('wrap')
  if (!wrap) return
  if (mode === SCREEN_FULL) {
    document.body.classList.add('screen-full')
    fitStage()
  } else {
    document.body.classList.remove('screen-full')
    wrap.style.transform = ''
    wrap.style.transformOrigin = ''
  }
}

// 应用已存/默认配置 + 绑定一次窗口缩放监听（仅在 full 下重算缩放）。幂等。
export function initScreen() {
  mode = readStored()
  applyScreenMode()
  if (!resizeBound && typeof globalThis.addEventListener === 'function') {
    resizeBound = true
    globalThis.addEventListener('resize', function () {
      if (mode === SCREEN_FULL) fitStage()
    })
  }
}
