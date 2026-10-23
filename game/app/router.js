// hash router: #/map?map=100002 / #/battle?wild=2&level=20 / #/title / #/login
// query 挂在 hash 里 (不再是 location.search), 场景从 mount(query) 取参数。
import { APP } from './state.js'
import * as titleScene from './scenes/titleScene.js'
import * as loginScene from './scenes/loginScene.js'
import * as mapScene from './scenes/mapScene.js'
import * as battleScene from './scenes/battleScene.js'
import * as rbattleScene from './scenes/rbattleScene.js'

const SCENES = { title: titleScene, login: loginScene, map: mapScene, battle: battleScene, rbattle: rbattleScene }
let current = null, lastHash = null
let routeChain = Promise.resolve()

function parseHash() {
  const h = (location.hash || '').replace(/^#\/?/, '')
  const [name, qs = ''] = h.split('?')
  return { name: name || 'map', query: new URLSearchParams(qs) }
}

// 场景切换串行化：上一次 mount 完成前不开始下一次 unmount/mount。
// 否则 #/map 后立刻跳 #/rbattle 会交错 —— unmount 清完 DOM、在途的地图 mount 随后 resolve
// 又把 HUD 追加回来，两套 chrome 叠加（缺陷记录 = docs/view/scene/battle/view-scene-battle-impl.md §14.4）。
export function route() {
  routeChain = routeChain.then(doRoute).catch(e => console.warn('route', e))
  return routeChain
}

async function doRoute() {
  const { name, query } = parseHash()
  const scene = SCENES[name]
  if (!scene) { console.warn('未知场景: ' + name); return }
  if (location.hash === lastHash) return            // 同一个地址不重建场景
  lastHash = location.hash
  if (current) {
    try { current.mod.unmount?.() } catch (e) { console.warn('unmount', e) }
  }
  APP.scene = name
  current = { name, mod: scene }
  try { await scene.mount(query) } catch (e) { console.warn('mount', e) }
}

// 场景内跳转的唯一入口 (地图点野怪 → 战斗; 战斗结算 → 回图)
export function go(name, params) {
  const q = params ? new URLSearchParams(params).toString() : ''
  location.hash = `#/${name}` + (q ? '?' + q : '')
}

addEventListener('hashchange', route)
