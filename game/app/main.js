// SPA 引导: Ruffle 已在 index.html 里同步载入, 这里交给唯一启动入口 boot()。
// 启动序（编排线 D8）：platform.init → runtime/bootstrap（先建 storage）→ changeScene(首个场景)
// ⚠️ 读档**不在开机时**：槽位住在路由里，由地图场景 `mount` 调 `session.ensureLoaded({gid})`（= 上游 GameManager.GameLogin「进图那一刻」）
import { boot } from './sceneLoader.js'
import { initScreen, getScreenMode, setScreenMode, SCREEN_FIXED, SCREEN_FULL } from './screen.js'

if (!window.RufflePlayer?.newest) {
  document.getElementById('hint').textContent = 'Ruffle 载入失败 (缺 /ruffle/ruffle.js)'
} else {
  // 默认入口 = 开始场景（"开始 → 选角 → 进图" 是主流程；见 docs/view/scene/start/view-scene-start-design.md §8.1 STQ4）。
  // #/map 直进仍可用（开发捷径）；parseHash 的缺省名不动，空 hash 与"未进入"不再混为一谈。
  if (!location.hash) location.hash = '#/title'
  initScreen()           // 应用已存/默认的屏幕大小（同步、#wrap 已存在）
  mountScreenToggle()    // 控制面板里的「屏幕大小」切换，反映当前值
  boot().catch((e) => {
    console.error('[boot] 启动失败', e)
    document.getElementById('hint').textContent = '启动失败: ' + (e && e.message)
  })
}

// 控制面板（#fab -> #ctrlPanel）里的「屏幕大小」切换：写入 localStorage、随开随切、所有场景即时跟着变。
function mountScreenToggle() {
  const box = document.getElementById('ctrlButtons')
  if (!box) return
  const label = document.createElement('label')
  label.textContent = '屏幕大小：'
  const sel = document.createElement('select')
  sel.id = 'screenMode'
  const opts = [[SCREEN_FIXED, '1200x660'], [SCREEN_FULL, '尽可能大']]
  for (const [v, t] of opts) {
    const o = document.createElement('option')
    o.value = v
    o.textContent = t
    sel.append(o)
  }
  sel.value = getScreenMode()
  sel.addEventListener('change', () => setScreenMode(sel.value))
  box.append(label, sel)
}

// U0 的 Hintbox 样板探针已退役：真实入口在 U1 接进了 #/rbattle（重启血统战斗场景）。
// 这个按钮现在只是把用户导到 U1 战斗 HUD（纯手写 DOM + 内核读数，不建 Ruffle）。
const demo = document.getElementById('rvDemo')
if (demo) { demo.textContent = '重启战斗 · U1 面板'; demo.onclick = () => { location.hash = '#/rbattle' } }
