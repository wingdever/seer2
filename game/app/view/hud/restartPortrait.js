// 宠物头像槽 (U3 HUD)。权威 = 重启客户端自己的头像表:
//   PetUISystem.GetPetIcon(petId) → Addressables "Pets/icon/{petId}" → 本地 Resources/Pets/icon/{petId}.png
//   (实测 990 张在盘, 覆盖重启 838 只宠里的 813 只; 见 docs/view/scene/room/view-scene-hud-impl.md §2.4)
// 不走 res/pet/icon/{swfId}.swf: 那些是 Flash 资源容器 (库里有图、时间线空), Ruffle 装载后只剩白底, 画不出头像。
// 纪律: 只画不算 —— 这里只吃 petId + 降级用的元素色/名首字, 不碰任何数值。
import { el, elementColor } from '../panels/battle/_kit.js'

const ICON = '/projects/Seer2-Restart-Lite-main/Resources/Pets/icon'

// createPortrait(slot) → { set(petId, fb), destroy() }   fb = { elemId, name }
export function createPortrait(slot) {
  let img = null
  let cur = null

  function fallback(fb, why) {
    slot.textContent = ''
    img = null
    const c = el('rbh-portrait-fb', { background: elementColor(fb?.elemId ?? 0) })
    c.textContent = String(fb?.name || '?').slice(0, 1)
    c.title = `头像缺失 (${why})`
    slot.append(c)
    slot.dataset.portrait = 'miss'
  }

  function set(petId, fb) {
    const key = petId == null ? null : String(petId)
    if (key === cur && slot.firstChild) return                 // 幂等: 同一宠不重挂
    cur = key
    if (key == null) { fallback(fb, '无 petId'); return }
    const e = new Image()
    e.alt = ''
    e.decoding = 'async'
    e.addEventListener('error', () => { if (img === e) fallback(fb, `${key}.png`) })
    e.addEventListener('load', () => { if (img === e) slot.dataset.portrait = 'png' })
    img = e
    slot.textContent = ''
    slot.append(e)
    slot.dataset.portrait = 'loading'
    e.src = `${ICON}/${key}.png`
  }

  return { set, destroy() { slot.textContent = ''; slot.dataset.portrait = ''; img = null; cur = null } }
}
