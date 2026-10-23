// L3 · 显示区 idle 动画台（VP4 ②·显示区·默认精灵面板 · 正本 docs/view/panel/petbag/petbag-panel-desc.md 1.2.1.1.1）。
// 走**原版 Flash 路由**，与战斗舞台**同一条桥**（口径在 docs/view/scene/battle/view-scene-battle-impl.md + restartFighterStage.js 已验证）：
//   /game/petContainer.root.swf?url=/swf/fight/{swfId}.swf → 就绪握手 petRenderCallbacksReady → setState('待机')。
// 素材桥：swfId 由 content.swfIdOf 解析（官方表只贡献"动画 id 指针"、不贡献数值，与战斗/头像同一既定例外）。
// 缺 Ruffle / 缺素材 ⇒ 回退静态 PNG 占位 + 一行提示，不抛（与 restartFighterStage 同口径）。
//
// ⚠️ Ruffle 播放器**一脱离 DOM 即销毁**（实测：append 到新父会被 disconnectedCallback 撕掉）。
//   所以播放器住在一个**跨 render 常驻**的 .rbp-stage 壳里（displayPane 只建一次该壳），
//   本模块只负责在这个常驻壳里按宠换素材 / 随壳尺寸摆位 / 切演出状态。V-2/V-5：零算数、零写盘。
import { mountImg, text, petIconUrl } from '../panels/battle/_kit.js'

const CONTAINER = '/game/petContainer.root.swf'
const FIGHT = '/swf/fight'
const DEMO = '/swf/pet/demo'  // 背包待机预览 SWF（复刻 AS3 PetDemoDisplayer；id 与 fight 同 = swfId）
const IDLE = '待机'
const CONT_W = 1200, CONT_H = 660   // petContainer.root.swf 舞台尺寸（外层 noBorder 填满播放器时按它换算）
const PET_BASE = 326                // AS3 PetDemoDisplayer 基准：demo pet MC ≈ 326×326，按 min(w,h)/326 缩放适配
const SPRITE_SCALE = 1.9      // fight 回退路：showAll 之上再叠的精灵放大倍数（实测定值）
const FOOT_Y = 0.46           // fight 回退路：脚踩地线 = 台高 × 0.46
const READY_MS = 8000         // 内层 {swfId}.swf 404 ⇒ 外层恒 200、回调不来 ⇒ 超时判缺素材
// 「动画」钮轮换的状态 = Fight.as getAvailableStates() 的**封闭词表**（去『空』，那是不是动画），按观演顺序排；
// 实际只循环该宠 SWF **真有**的 clip（cycleIdleState 用 cur.states 过滤），缺的状态不播、不造假。
const ANIM_CYCLE = ['待机', '个性出场', '物理攻击', '属性攻击', '特殊攻击', '必杀', '合体攻击', '变身效果', '被打', '被暴击', '闪避', '胜利', '失败', '濒死']

let seq = 0
let cur = null   // { stage, petId, player, ro, token, states, shown }

const mkPlayer = () => {
  try { const R = window.RufflePlayer; return R && R.newest ? R.newest().createPlayer() : null } catch { return null }
}

// demo SWF 存在性探测（带缓存）：有 ⇒ 走 demo 待机预览；无 ⇒ 回退 fight SWF。
const demoCache = new Map()   // swfId -> boolean
async function hasDemo(swfId) {
  if (demoCache.has(swfId)) return demoCache.get(swfId)
  let ok = false
  try { const r = await fetch(`${DEMO}/${swfId}.swf`, { method: 'HEAD' }); ok = r.ok } catch { ok = false }
  demoCache.set(swfId, ok)
  return ok
}

// 宠容器就绪握手（SWF 经 ExternalInterface postMessage 通知回调挂好）。
function waitReady(instanceId, timeout = READY_MS) {
  return new Promise(resolve => {
    const h = e => { if (e.data?.instanceId === instanceId && e.data?.type === 'petRenderCallbacksReady') { removeEventListener('message', h); resolve(true) } }
    addEventListener('message', h)
    setTimeout(() => { removeEventListener('message', h); resolve(false) }, timeout)
  })
}

function teardown() {
  if (!cur) return
  try { cur.ro?.disconnect() } catch { /* noop */ }
  try { cur.player?.remove() } catch { /* noop */ }
  cur = null
}

function fallback(stage, spec, msg) {
  // 静态 PNG 尺寸/位置照重启 Unity PetDemoView：battleImage 画在固定 960×540 的 demoImage 里，
  // 锚点居中、偏移 (280,-40)（Unity y-up ⇒ web 即 +280,+40），PreserveAspect=0 ⇒ 拉伸填满 960×540，
 // 由 .rbp-stage 的 overflow:hidden 裁进显示区。故这里加 rbp-demo-img 类，具体摆位见 ui.css。
  mountImg(stage, spec.fallbackUrl || petIconUrl(spec.petId), 'rbp-demo-img')
  stage.append(text('rbp-stage-note', msg))
}

// 在常驻 stage 壳里装载/复用某只宠的 idle 动画。spec = { petId, swfId, fallbackUrl }。
// 优先 demo SWF（复刻 AS3 背包 PetDemoDisplayer：直接预览形象 + min(w,h)/326 缩放）；无 demo 才回退 fight SWF。
export async function mountIdle(stage, spec) {
  if (cur && cur.stage === stage && cur.petId === spec.petId && cur.player?.isConnected) return cur.player
  teardown()
  const token = ++seq
  stage.textContent = ''
  const player = mkPlayer()
  if (player == null || spec.swfId == null) {
    fallback(stage, spec, player == null ? '（无 Ruffle：idle 动画降级为静态头像）' : '（无 id：降级为静态头像）')
    return null
  }
  const isDemo = await hasDemo(spec.swfId)
  if (cur?.token !== token) return null                   // 探测期间已被换宠/关闭取代
  const swfUrl = isDemo ? `${DEMO}/${spec.swfId}.swf` : `${FIGHT}/${spec.swfId}.swf`
  player.style.width = '100%'
  player.style.height = '100%'
  stage.append(player)
  cur = { stage, petId: spec.petId, player, ro: null, token, states: [], shown: null, isDemo }

  const place = () => {
    const pw = stage.clientWidth, ph = stage.clientHeight
    if (isDemo) {
      // 复刻 PetDemoDisplayer：pet MC 缩放 = min(pw,ph)/PET_BASE，注册点落播放器中心。
      // 容器 1200×660 经外层 noBorder 填满播放器（左右裁掉）⇒ 换算到容器逻辑坐标。
      const s = Math.max(pw / CONT_W, ph / CONT_H)
      const scale = Math.min(pw / PET_BASE, ph / PET_BASE) / s
      try { player.updateScale?.(scale, scale) } catch { /* 未就绪 */ }
      const visW = pw / s, visH = ph / s
      const offX = (CONT_W - visW) / 2
      try { player.setOffset?.(Math.round(offX + visW / 2), Math.round(visH / 2)) } catch { /* 未就绪 */ }
    } else {
      // fight 回退路（原配法）：showAll + offsetX=宽/2、offsetY=高×FOOT_Y。
      try { player.setOffset?.(Math.round(pw / 2), Math.round(ph * FOOT_Y)) } catch { /* 未就绪 */ }
    }
  }
  const id = `bag-idle-${token}`
  const params = new URLSearchParams({
    url: swfUrl, instanceId: id, scale: isDemo ? 'noScale' : 'showAll',
    scaleX: isDemo ? '1' : String(SPRITE_SCALE), scaleY: isDemo ? '1' : String(SPRITE_SCALE), offsetX: '0', offsetY: '0',
  })
  player.ruffle().load({
    url: `${CONTAINER}?${params}`, allowScriptAccess: true, wmode: 'transparent',
    autoplay: 'on', unmuteOverlay: 'hidden', scale: isDemo ? 'noBorder' : 'showAll', menu: false,
  }).then(async () => {
    const ok = await waitReady(id)
    if (cur?.token !== token) return                       // 已被换宠/关闭取代
    if (!ok) { stage.textContent = ''; fallback(stage, spec, `（动画缺失：${spec.swfId}）`); return }
    place()
    try { cur.states = (await Promise.resolve(player.getAvailableStates?.())) || [] } catch { cur.states = [] }
    if (cur.states.includes(IDLE) || !cur.states.length) {   // 空状态表 = 无标签, 仍让 SWF 自走
      try { player.setState?.(IDLE); cur.shown = IDLE } catch { /* noop */ }
    }
    if (window.ResizeObserver) { cur.ro = new ResizeObserver(place); cur.ro.observe(stage) }
  }).catch(() => {
    if (cur?.token !== token) return
    stage.textContent = ''
    fallback(stage, spec, `（动画装载失败：${spec.swfId}）`)
  })
  return player
}

export function clearIdle() { teardown() }

// 「动画」钮：按 ANIM_CYCLE 观演顺序，只在该宠 SWF 真有的状态里轮换（缺的跳过）。无播放器返回 null。
export function cycleIdleState() {
  if (!cur?.player?.isConnected) return null
  const avail = ANIM_CYCLE.filter(s => (cur.states || []).includes(s))
  if (!avail.length) return null
  const next = avail[(avail.indexOf(cur.shown) + 1) % avail.length]
  try { cur.player.setState?.(next); cur.shown = next } catch { return null }
  return next
}
