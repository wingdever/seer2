// 捕捉 / 道具页（底栏页签 2/3，docs/view/scene/battle/view-scene-battle-impl.md §6.6）。上游 = BattlePetItemController：
// 8 个 62×62 格（底 OldPetBag/87.png），数据 = 存档 itemBag。
// 这条把 U2 的「胶囊模态弹层」改成底栏页；点下去只是递交胶囊行，**概率与等级门全在内核 Capture 算子里**（UI 不算）。
// 道具页当前 settings.isItemOK === false ⇒ 建页但只给一行空态说明，绝不画假物品（铁律 5）。
import { el, text, panelSprite } from './_kit.js'

const CELL = 62
const PITCH = 84                      // 8 格：7×84 + 62 = 650，坐在 Content 的 700 宽里居中
const X0 = 25, Y0 = 19

// create(container, { kind, onPick }) → update(items)
// items = [{id,name,count}]（场景侧 ownedCapsules() 的投影，effectRow 由场景拿着，面板不认识内核行）。
export function create(container, { kind = 'capture', onPick } = {}) {
  const row = el('rbb-items')
  row.dataset.kind = kind
  container.append(row)

  return function update(items) {
    row.textContent = ''
    if (kind === 'item') {                       // 道具支未接：整页空态一行说明，不伪造内容
      row.append(text('rbb-items-empty', '道具支未接（BeforeAttack.addReport 含未移植算子）'))
      return
    }
    if (!items?.length) { row.append(text('rbb-items-empty', '没有可用胶囊')); return }
    items.slice(0, 8).forEach((it, i) => {
      const empty = !(it.count > 0)
      const cell = el('rbb-item' + (empty ? ' rbb-item--off' : ''))
      cell.dataset.itemId = String(it.id)
      cell.style.left = `${X0 + PITCH * i}px`
      cell.style.top = `${Y0}px`
      cell.style.width = `${CELL}px`
      cell.style.height = `${CELL}px`
      cell.style.backgroundImage = `url("${panelSprite('OldPetBag/Sprites/87.png')}")`
      cell.append(text('rbb-item-name', it.name ?? String(it.id)))
      cell.append(text('rbb-item-count', `×${it.count}`))
      cell.title = '捕捉概率与等级门由内核 Capture 算子判定，此处只递交胶囊行'
      if (!empty && onPick) cell.addEventListener('click', () => onPick(it))
      row.append(cell)
    })
  }
}
