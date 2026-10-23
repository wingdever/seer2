// 换宠页（底栏页签 1，docs/view/scene/battle/view-scene-battle-impl.md §6.6）。上游 = BattlePetChangeView：6 个 changeBlockViews、
// 在场宠叠 current fight.png 火焰角标、已死不可点；**点下去只是递交下标**，cursor 由内核 PetChange 算子真结算。
// 这条把 U2 的「模态弹层 openSwitchPicker」改成「底栏页」—— 那是上游 IA 的正解（页签互斥），也是 F17 改选择器的原因。
// 几何缺口诚实登记：那 6 个槽的 RectTransform 在 Fight.unity 里**读不到**（整块来自 prefab 实例），
// 只有 sprite 尺寸有权威（Pet change option.png 88×93）⇒ pitch/起点是本地排版，打 data-tbd，B5 实测校。
import { el, text, anch, sprite, petIconUrl, elementColor } from './_kit.js'

const SLOT = [88, 93]
const PITCH = 110
const X0 = 31          // Content 700 宽居中：31 + 5×110 + 88 = 659
const Y0 = 3           // 93 高的槽坐在 100 高的 Content 里

// create(container, { onSwitch }) → update(driver)
export function create(container, { onSwitch }) {
  const row = el('rbb-change')
  row.dataset.tbd = 'change-layout'
  container.append(row)

  return function update(driver) {
    row.textContent = ''
    const bag = driver.myBag()
    const cursor = driver.myCursor()
    for (let i = 0; i < 6; i++) {
      const pet = bag[i] ?? null
      if (!pet) continue                                  // 空位不建节点（同技能卡那口径）
      const dead = !!pet.isDead
      const on = i === cursor
      const btn = el('rbb-change-btn' + (dead || on ? ' rbb-change-btn--off' : ''))
      btn.dataset.index = String(i)
      btn.style.left = `${X0 + PITCH * i}px`
      btn.style.top = `${Y0}px`
      btn.style.width = `${SLOT[0]}px`
      btn.style.height = `${SLOT[1]}px`
      btn.style.backgroundImage = `url("${sprite('Pet change option.png')}")`

      const face = el('rbb-change-face', { backgroundColor: elementColor(pet.battleElement) })
      const url = petIconUrl(pet.id ?? pet.baseId)
      const probe = new Image()
      probe.onerror = () => { face.dataset.assetMissing = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1)) }
      probe.onload = () => { face.style.backgroundImage = `url("${encodeURI(url)}")`; face.textContent = '' }
      probe.src = url
      face.textContent = String(pet.name || '?').slice(0, 1)   // 图未到之前先顶一个字面，缺图就留著（不换图，铁律 5）
      btn.append(face)
      btn.append(text('rbb-change-hp', `${pet.hp}/${pet.maxHp}`))
      if (on) btn.append(anch('rbb-change-current', [SLOT[0] - 30, -8, 30, 22]))   // 火焰角标压在右上
      // 阵亡优先于「在场」：cursor 还停在死宠上时（强制换宠那一瞬就是这样），文案要说它是倒下的
      btn.title = `${pet.name}${dead ? '（已倒下，不可换上）' : on ? '（在场）' : `  HP ${pet.hp}/${pet.maxHp}`}`

      if (!dead && !on && onSwitch) btn.addEventListener('click', () => onSwitch(i))   // 死宠不可点（同上游 SetInteractable(!pet.isDead)）
      row.append(btn)
    }
  }
}
