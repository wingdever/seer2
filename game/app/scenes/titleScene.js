// #/title —— 开始场景（重启血统 Title；设计 docs/view/scene/start/view-scene-start-design.md §3.1）。
// 场景壳只干三件：切画布模式 / 挂面板 / 接线跳转；画面全在 view/start/titleView.js。
import { go } from '../router.js'
import { openPanel, closePanel, setCanvasMode } from '../view/panels/host.js'
import * as titleView from '../view/start/titleView.js'

let entry = null
let view = null

export async function mount() {
  // 满屏 UI（背景铺满）⇒ match 模式（上下不裁）；理由见设计 §3 与 view-scene-start-impl.md §5。
  setCanvasMode('match')
  entry = openPanel('rst-title', (el) => {
    view = titleView.mount(el, { onStart: () => go('login') })
  }, { scrim: false })   // 整屏标题 UI：背后无交互元素，遮罩会无端压暗背景
}

export function unmount() {
  view?.destroy?.()
  view = null
  if (entry) { closePanel(entry); entry = null }
  setCanvasMode('fixed')   // 把画布模式还给地图 HUD（同 rbbattleScene.js 的归还纪律）
}
