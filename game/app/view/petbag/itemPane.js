// L3 · 精灵道具面板（信息区可换内容之一，道具钮切出；desc 1.2.2.2 第 2 项）。
// 结构：上面一行标签（全部、培养、纹章、战斗、其他）+ 下面道具网格（3 行 6 列 = 18 格）。
// ⚠️ 标签取**人类实测**（上游子物体名第 5 个是 `Skin`，人类读作「其他」；留手测确认 C1 §12 末项）。
// 内容 = 空壳：用什么道具/效果归 C2 / T2·5 ⇒ 打开若空白是**已知前置**，不伪造道具列表（登记 impl §11）。
// 前缀用 `rbp-item-*`（挂在信息面板里），**不占用** `rbi-*`（那是独立的「道具背包」模态面板，见 C1 §4.2）。
import { el, text } from '../panels/battle/_kit.js'

const TABS = [['all', '全部'], ['grow', '培养'], ['emblem', '纹章'], ['battle', '战斗'], ['other', '其他']]

export function renderItemPane(host, ctx, tab = 'all') {
  host.textContent = ''
  const row = el('rbp-item-tabs')
  for (const [id, label] of TABS) {
    const t = el('rbp-item-tab' + (id === tab ? ' rbp-item-tab--on' : ''))
    t.textContent = label
    t.addEventListener('click', () => ctx.onItemTab(id))
    row.append(t)
  }
  host.append(row)

  const grid = el('rbp-item-grid')          // 3 行 6 列 = 18 格
  for (let i = 0; i < 18; i++) grid.append(el('rbp-item-cell'))
  host.append(grid)

  host.append(text('rbp-item-pend', '道具网格内容待 C2 / 道具线 T2·5（本份只画出标签行与 3×6 网格）'))
}
