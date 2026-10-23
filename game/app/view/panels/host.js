// 重启面板宿主（UI 线 U0）。只干三件事：备层 / 按 CanvasScaler 口径缩放 / 面板栈。
// 面板自己怎么画 DOM 由各自模块决定（D2：逐面板手写，不写 prefab→DOM 转换器）。
// 上游：Assets/Scenes/*.unity 的 CanvasScaler（960x540, matchWidth）；坐标口径见 game/app/ui.css 顶部。

const REF_W = 960, REF_H = 540

let root = null, shell = null, stack = [], watch = null

// 画布模式（CanvasScaler m_MatchWidthOrHeight = 0 纯按宽，六场景一致）：
//   fixed —— 逻辑高恒 540、按舞台高居中（地图 HUD 的既路口径，含 EDGE=6 那 6px 裁切）。
//   match —— 逻辑高 = 舞台高/缩放 ⇒ 上下不裁（战斗版式血牌贴 y=0、底栏贴 y=540，fixed 会削掉两头）。
// 见 docs/view/scene/battle/view-scene-battle-impl.md §3。
let mode = 'fixed', refH = REF_H, lastScale = 1

export function setCanvasMode(next) {
  if (next === mode) return
  mode = next
  const wrap = document.getElementById('wrap')
  if (wrap) applyFit(wrap)
}
export const getCanvasInfo = () => ({ mode, scale: lastScale, refW: REF_W, refH })

function applyFit(wrap) {
  if (!shell || !wrap) return
  const s = wrap.clientWidth / REF_W
  lastScale = s
  if (mode === 'match') {
    refH = wrap.clientHeight / s
    shell.style.transform = `scale(${s})`
    root.style.setProperty('--rv-h', `${refH}px`)
  } else {
    refH = REF_H
    shell.style.transform = `translateY(${(wrap.clientHeight - REF_H * s) / 2}px) scale(${s})`
    root.style.removeProperty('--rv-h')
  }
}

// #wrap 会被场景 mount/unmount 整体重写（innerHTML=''），所以每次弹面板都重新确认层还在，
// 顺手把被场景清掉的残留面板从栈里剔掉。
function ensureLayer() {
  stack = stack.filter(e => e.el.isConnected)
  const wrap = document.getElementById('wrap')
  if (!wrap) throw new Error('面板宿主：找不到 #wrap 舞台')
  if (!root?.isConnected || root.parentElement !== wrap) {
    root = document.createElement('div')
    root.id = 'rv'
    shell = document.createElement('div')
    shell.className = 'rv-scale'
    root.append(shell)
    wrap.append(root)
    if (!watch && window.ResizeObserver) { watch = new ResizeObserver(() => applyFit(wrap)); watch.observe(wrap) }
  }
  // Unity 画布默认居中：960x540 按舞台宽缩放后高 675 > 舞台 660，上下各溢 7.5px。
  // 每次都重算 (外加 ResizeObserver) —— 只算一次会吃到当时的瞬态尺寸: #wrap 里冒出横向
  // 滚动条那一下 clientHeight 少 ~18px, 缓存下来贴底的节点就被 overflow:hidden 静默裁掉。
  applyFit(wrap)
  return shell
}

// 打开面板。build(el, api)：el 就是 960x540 的逻辑画布，api.close() 关掉自己。
// opts.onClose：关闭回调（A2 §4 契约）；opts 缺省 ⇒ 与旧两参调用逐字节兼容。
// VP3 同名去重（docs/view/panel/petbag-impl.md §6）：栈内已有同名 entry ⇒ 先走完整 close（触发 onClose + remove），
//   再开新的，**只留最新一层**（是销毁旧 DOM，不是隐藏）。参数化双实例需求须换 name。
export function openPanel(name, build, opts = {}) {
  const host = ensureLayer()
  for (const e of stack.filter(x => x.name === name)) closePanel(e)
  const el = document.createElement('div')
  el.className = 'rv-panel'
  // 模态遮罩（design: docs/view/mech/view-panel-stack.md §7#3 / 用户需求「弹面板时只可操作当前面板」）：
  // 默认给面板垫一层全画布遮罩，挡住背后地图/HUD 误触；scrim:false 为非模态
  // （常驻 HUD / 自带遮罩的 Hintbox / 整屏场景根面板 rst-title·rst-login·rbattle）。
  if (opts.scrim !== false) {
    const scrim = document.createElement('div')
    scrim.className = 'rv-scrim'
    el.append(scrim)
  }
  host.append(el)
  const entry = { name, el, opts }
  stack.push(entry)
  build(el, { close: () => closePanel(entry) })
  return entry
}

// 不带参数则关最上层。
export function closePanel(entry) {
  const top = entry || stack[stack.length - 1]
  if (!top) return
  stack = stack.filter(e => e !== top)
  top.el.remove()
  top.opts?.onClose?.()
}

export const panelStack = () => stack.map(e => e.name)