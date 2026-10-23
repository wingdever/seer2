// R1 血牌（docs/view/scene/battle/view-scene-battle-impl.md §6.1）。我/敌同一模块，side 只改镜像方向，不另写一份敌方面板。
// 底板 = 一整张 Player hp bar.png（381×110，平行四边形外框/头像方框/名牌胶囊/LV 小尾巴全烘在图里），
// 不再用 CSS 拼矩形；条是**一层**（§2.4）：mask 图定形 + background-color 定色 + 宽 = 轨长 × 比例。
// 零算数：只有两处 —— frac = hp/maxHp（轨宽）与 hpColor(frac)（§6.2 的上游公式）；其余全是读数。
import { el, text, anch, fitBar, petIconUrl, elementIcon, sprite, elementColor } from './_kit.js'
import * as BUFF_GRID from './buffGridView.js'

// 设计盒，左上原点，相对 .rbb-plate 的 (0,0,400,110)。权威 = 设计 §4.1 表 + 截图实测锚点。
const GEO = {
  bg: [0, 0, 381, 110],
  portrait: [4, 5, 75, 75],
  numlabel: [85, 10, 26, 38],
  hp: [111, 10, 260, 18],
  anger: [111, 32, 246, 12],
  lvlabel: [85, 52, 27, 13],
  lvnum: [109, 52, 30, 20],
  elem: [145, 54, 12, 16],
  name: [6, 85, 70, 20],
  petnum: [5, 113, 85, 20],
  buffs: [175, 52, 225, 95],
}
const PLATE = [0, 0, 400, 110]      // 我方；敌方由场景摆到 x=560，盒宽同 400

// 敌方 = 我方按屏幕纵轴镜像：x' = 400 − (x + w)。截图逐格坐实 —— numlabel→849..875、HP→589..849、
// 怒→603..849、名牌→884..954，四条全部与「560 + 镜像盒」吻合 ⇒ 这条公式是版式正解，不是近似。
// **只有盒位镜像**：底图另用 CSS scaleX(-1)；文字与头像不翻（否则数字反写）。
const mb = (b, mirror) => (mirror ? [PLATE[2] - (b[0] + b[2]), b[1], b[2], b[3]] : b)

// BattlePetStatusView.cs:59-62 —— 满血纯绿 #77E20C、半血黄、残血红。逐字搬，不发明。
const lerp3 = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const YELLOW = [255, 255, 0], GREEN = [119, 226, 12], RED = [255, 0, 0]
export function hpColor(p) {
  return `rgb(${lerp3(...(p >= 0.5 ? [YELLOW, GREEN, (p - 0.5) * 2] : [RED, YELLOW, p * 2])).join(',')})`
}
// 怒条固定色 = 场景里那张 Anger Bar Image 的 m_Color（Fight.unity 的 r:.8 g:0 b:0 ⇒ 不拍脑袋当 #FF3B30）。
const ANGER_COLOR = 'rgb(204,0,0)'

const style = (b) => ({ left: `${b[0]}px`, top: `${b[1]}px`, width: `${b[2]}px`, height: `${b[3]}px` })

// 数字压条内：上游是两个独立 Text，斜杠是静态节点（§2.5：代码从不写 '/'）。照抄成三段。
function trio(track, prefix) {
  const row = el(`rbb-${prefix}-txt`)
  const cur = text(`rbb-${prefix}-cur`, '')
  const max = text(`rbb-${prefix}-max`, '')
  row.append(cur, text(`rbb-${prefix}-sep`, '/'), max)
  track.append(row)
  return { cur, max }
}

// 挂图并按结果自陈：缺图就留 data-asset-missing，不画也不换图（铁律 5）。键变了才重挂（同宠不重挂）。
function imgSlot(host, cls) {
  let cur = null
  return function set(url, key) {
    if (key === cur) return
    cur = key
    host.textContent = ''
    delete host.dataset.assetMissing
    const node = el(cls)
    node.style.backgroundImage = `url("${encodeURI(url)}")`
    host.append(node)
    const probe = new Image()
    probe.onerror = () => {
      if (cur !== key) return
      host.dataset.assetMissing = decodeURIComponent(url.slice(url.lastIndexOf('/') + 1))
      node.style.backgroundImage = ''
    }
    probe.src = url
  }
}

// create(parent, side) → update(driver, pet)   side ∈ 'my' | 'op'
export function create(parent, side) {
  const mirror = side === 'op'
  const plate = anch(`rbb-plate rbb-plate--${side}`, [side === 'my' ? 0 : 560, 0, PLATE[2], PLATE[3]])
  plate.dataset.side = side
  parent.append(plate)

  const bgEl = anch('rbb-plate-bg', mb(GEO.bg, mirror))
  bgEl.style.backgroundImage = `url("${sprite('Player hp bar.png')}")`
  plate.append(bgEl)

  // 头像：键 = pet.id ?? pet.baseId —— icon/ 那 990 张是 **petId** 命名（设计 §4.1 表写 baseId 是笔误，§14 ①）。
  // 缺图降级成元素色块 + 名首字（同 restartPortrait.js 的纪律），data-portrait ∈ {png,fb}。
  const portrait = anch('rbb-portrait', mb(GEO.portrait, mirror))
  plate.append(portrait)
  let portraitKey = null
  function setPortrait(pet) {
    const key = pet?.id ?? pet?.baseId ?? null
    if (key === portraitKey && portrait.firstChild) return
    portraitKey = key
    portrait.textContent = ''
    delete portrait.dataset.assetMissing
    if (key == null) { portrait.dataset.portrait = 'fb'; portrait.append(fbPortrait(pet, '无 petId')); return }
    portrait.dataset.portrait = 'loading'
    const probe = new Image()
    probe.onerror = () => {
      if (portrait.dataset.portrait !== 'loading') return
      portrait.dataset.assetMissing = `${key}.png`
      portrait.dataset.portrait = 'fb'
      portrait.textContent = ''
      portrait.append(fbPortrait(pet, `${key}.png`))
    }
    probe.onload = () => { if (portrait.dataset.portrait === 'loading') portrait.dataset.portrait = 'png' }
    probe.alt = ''
    probe.draggable = false
    probe.src = petIconUrl(key)
    portrait.append(probe)
  }
  function fbPortrait(pet, why) {
    const c = el('rbb-portrait-fb', { background: elementColor(pet?.battleElement ?? 0) })
    c.textContent = String(pet?.name || '?').slice(0, 1)
    c.title = `头像缺失 (${why})`
    return c
  }

  const numlabel = anch('rbb-numlabel', mb(GEO.numlabel, mirror))
  numlabel.style.backgroundImage = `url("${sprite('Status indicator.png')}")`
  plate.append(numlabel)

  const hp = fitBar({ trackCls: 'rbb-hp', fillCls: 'rbb-hp-fill', maskUrl: sprite('hp bar mask.png'), box: mb(GEO.hp, mirror) })
  const hpTrio = trio(hp.track, 'hp')
  plate.append(hp.track)

  const anger = fitBar({ trackCls: 'rbb-anger', fillCls: 'rbb-anger-fill', maskUrl: sprite('anger bar mask.png'), box: mb(GEO.anger, mirror) })
  const angerTrio = trio(anger.track, 'anger')
  plate.append(anger.track)

  const lvlabel = anch('rbb-lvlabel', mb(GEO.lvlabel, mirror))
  lvlabel.style.backgroundImage = `url("${sprite('Level indicator.png')}")`
  plate.append(lvlabel)
  const lvnum = text('rbb-lvnum', '', style(mb(GEO.lvnum, mirror)))
  plate.append(lvnum)

  const elem = anch('rbb-elem', mb(GEO.elem, mirror))
  plate.append(elem)
  const setElem = imgSlot(elem, 'rbb-elem-img')

  const name = text('rbb-name', '', style(mb(GEO.name, mirror)))
  plate.append(name)

  // 六珠：双方都从左往右数（index 0 在最左；敌方 index 0 = 在场宠）。
  const beads = anch('rbb-petnum', mb(GEO.petnum, mirror))
  plate.append(beads)

  const buffsBox = anch('rbb-buffs', mb(GEO.buffs, mirror))
  plate.append(buffsBox)
  const updBuffs = BUFF_GRID.create(buffsBox, { layout: mirror ? 'right' : 'left' })

  return function update(driver, pet) {
    if (!pet) { name.textContent = '未知'; return }
    setPortrait(pet)

    const maxHp = pet.maxHp || 1
    const fHp = pet.hp / maxHp
    hp.set(fHp, hpColor(fHp))
    hpTrio.cur.textContent = String(pet.hp)
    hpTrio.max.textContent = String(pet.maxHp)

    const maxAnger = pet.maxAnger || 1
    anger.set(pet.anger / maxAnger, ANGER_COLOR)
    angerTrio.cur.textContent = String(pet.anger)
    angerTrio.max.textContent = String(pet.maxAnger)

    lvnum.textContent = String(pet.level ?? '')
    elem.dataset.elemId = String(pet.battleElement)
    setElem(elementIcon(pet.battleElement), String(pet.battleElement))

    name.textContent = pet.name ?? '未知'
    name.dataset.fit = String((pet.name ?? '').length < 6 ? 12 : 10)   // BattlePetInfoView.nameFontSizeFit

    const { petNum, aliveNum } = driver.bagCounts(side)
    beads.textContent = ''
    for (let i = 0; i < 6; i++) {
      const has = i < petNum
      const bead = el('rbb-bead')
      bead.dataset.state = has ? (i >= aliveNum ? 'has-dead' : 'has') : 'no'
      bead.style.backgroundImage = `url("${sprite(has ? 'Pet yes.png' : 'Pet no.png')}")`
      beads.append(bead)
    }
    updBuffs(driver.buffsOf(side))
  }
}
