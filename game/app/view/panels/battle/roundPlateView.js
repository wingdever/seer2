// R2 回合板（docs/view/scene/battle/view-scene-battle-impl.md §6.3）。上游节点就叫 UI Layer/Weather（100×50，顶锚居中），
// 但它只管文本：BattleWeatherView 写的是 "回合\n" + currentState.turn —— 天气在**另一处**（F5 网格首格，§6.6）。
// 黑底 = 内置白图染黑 + Outline（场景里没有那张 battle indicator.png 的引用 ⇒ 不用它，设计 §4.2 已判）。
import { el, text } from './_kit.js'

const BOX = [430, 10, 100, 50]

// create(parent) → update(driver)
export function create(parent) {
  const plate = el('rbb-round', { left: `${BOX[0]}px`, top: `${BOX[1]}px`, width: `${BOX[2]}px`, height: `${BOX[3]}px` })
  const label = text('rbb-round-txt', '')
  plate.append(label)
  parent.append(plate)
  return function update(driver) {
    // \n 走 CSS white-space:pre-line；文本形状 = /回合\n\d+/（§5 契约）。
    label.textContent = `回合\n${driver.turn()}`
  }
}
