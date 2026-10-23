// L3 · 显示区（② 内容层左侧，VP4 分区：docs/view/panel/petbag/petbag-panel-desc.md 1.2.1）。
// 可换内容 = 默认精灵面板（idle 动画台 + HUD）／加成面板（先天/后天）。
// 零算数、零写盘（V-2/V-5）：读数一律用装配层交出的对象，缺数据画「—」，**不伪造**。
// ⚠️ idle 动画台是**真的**（原版 Flash fight SWF，同战斗舞台的桥，见 idleStage.js）；
//   Ruffle 播放器**不能被每次 render 重建**（脱离 DOM 即销毁，实测），
//   故 stage 壳跨 render 常驻（displayPane 只建一次），每次 render 只重建同级的 demo / buff。
import { el, text, petBattleUrl, elementName, elementColor, elementIcon, emblemIconUrl } from '../panels/battle/_kit.js'
import { restartIvRankOf } from '../../content.js'
import { mountIdle, clearIdle } from './idleStage.js'

const shells = new WeakMap()   // host -> { stage, demo, buff }

function ensureShell(host) {
  let s = shells.get(host)
  if (s && host.contains(s.stage) && host.contains(s.demo) && host.contains(s.buff)) return s
  host.textContent = ''
  const stage = el('rbp-stage')      // 常驻（播放器住这）
  const demo = el('rbp-demo')        // HUD + HUD 按钮（重建）
  const buff = el('rbp-buff')        // 先天/后天加成（重建）
  host.append(stage, demo, buff)
  s = { stage, demo, buff }
  shells.set(host, s)
  return s
}

// host 容器；ctx 见 index.js；pet = 选中宠（可为 null）；mode = 'demo'（默认精灵面板）| 'buff'（加成面板）
export function renderDisplay(host, ctx, pet, mode = 'demo') {
  const s = ensureShell(host)
  if (!pet) {
    clearIdle()
    s.stage.style.display = 'none'
    s.buff.style.display = 'none'; s.buff.textContent = ''
    s.demo.style.display = ''; s.demo.textContent = ''
    s.demo.append(text('rbp-disp-empty', '先在下方队伍区选一只精灵'))
    return
  }
  if (mode === 'buff') {
    clearIdle()
    s.stage.style.display = 'none'
    s.demo.style.display = 'none'; s.demo.textContent = ''
    s.buff.style.display = ''; s.buff.textContent = ''
    buildBuff(s.buff, ctx, pet)
    return
  }
  // demo：idle 动画台（常驻）+ HUD 六项 + 皮肤/测试对战
  s.buff.style.display = 'none'; s.buff.textContent = ''
  s.demo.style.display = ''; s.demo.textContent = ''
  buildHud(s.demo, ctx, pet)
  s.stage.style.display = ''
  // 左上的「形象」显示台：有 swf 播 idle 动画；无 swf 降级用**重启战斗形象** png（形象，非头像）。
  mountIdle(s.stage, { petId: pet.petId, swfId: ctx.swfIdOf(pet), fallbackUrl: petBattleUrl(pet.petId) })
}

// 1.2.1.1.2 HUD（Unity PetUISystem 小图标 + tooltip 口径；_kit.js:elementIcon 即 PetUISystem.cs:80 路由）：
//   名称顶中 · 属性图标左上 · 特性名右上 · 纹章图标(右下于特性) · 性别图标(右下于属性) · 个体值=星级图标(右下角)
function buildHud(host, ctx, pet) {
  const hud = el('rbp-hud')
  const h = ctx.hudOf(pet) || {}
  const cfg = ctx.cfg(pet) || {}
  const elemId = cfg.elementId ?? 0
  const elemName = elementName(elemId)
  // 1 名称 顶中
  hud.append(text('rbp-name', h.name ?? ctx.nameOf(pet)))
  // 2 属性图标 左上
  const elem = elemIcon(elemId, h.element ?? elemName); elem.classList.add('rbp-pos-tl')
  // 3 特性名 右上（悬停出名称 + 效果描述）
  const trait = el('rbp-trait rbp-tipR')
  trait.append(text('rbp-trait-t', h.feature ?? '—'), tip('特性', h.feature ?? '—', h.featureDesc))
  // 4 纹章图标 右下于特性（右上第二行；悬停出名称 + 效果描述）
  const emblem = emblemIcon(h.emblem, h.emblemDesc, h.emblemIcon); emblem.classList.add('rbp-pos-tr2', 'rbp-tipR')
  // 5 性别图标 右下于属性（左上第二行）
  const gender = genderIcon(h.gender); gender.classList.add('rbp-pos-tl2')
  // 6 个体值 星级图标（替代数字，仿 Unity 品质/level 图标）右下角
  const iv = ivIcon(h.iv); iv.classList.add('rbp-pos-br', 'rbp-ic--tip-up', 'rbp-tipR')
  hud.append(elem, trait, emblem, gender, iv)
  host.append(hud)
}

function tip(k, v, desc) {
  const t = el('rbp-ic-tip')
  const head = el('rbp-ic-tip-head')   // 标签 + 值同一行（标签在左），描述另起一行
  head.append(text('rbp-ic-tip-k', k + '：'), text('rbp-ic-tip-v', String(v)))
  t.append(head)
  if (desc) t.append(text('rbp-ic-tip-d', String(desc)))
  return t
}

// 属性：元素图标（缺图退首字，染元素色）；悬停出「属性：火」之类
function elemIcon(elemId, v) {
  const b = el('rbp-ic rbp-ic--elem')
  const img = document.createElement('img')
  img.className = 'rbp-ic-img'; img.alt = v; img.src = elementIcon(elemId)
  const glyph = text('rbp-ic-glyph', String(v)[0] || '?'); glyph.style.color = elementColor(elemId); glyph.style.display = 'none'
  img.onerror = () => { img.style.display = 'none'; glyph.style.display = '' }
  b.append(img, glyph, tip('属性', v))
  return b
}

// 性别：♂/♀/⚧ 符号图标；悬停出「性别：雄性」之类
function genderIcon(g) {
  const sym = /雌/.test(g) ? '♀' : /雄/.test(g) ? '♂' : '⚧'
  const b = el('rbp-ic rbp-ic--gender')
  b.append(text('rbp-ic-glyph', sym), tip('性别', g || '—'))
  return b
}

// 纹章：有专配图标 ⇒ 显 Emblems/{baseId}.png；缺图/未佩戴 ⇒ 退名称徽章（双字）或「纹」并置灰；悬停出「纹章：名 + 效果描述」
function emblemIcon(em, desc, baseId) {
  const has = em && em !== '—' && em !== '未佩戴'
  const b = el('rbp-ic rbp-ic--emblem' + (has ? '' : ' rbp-ic--off'))
  const nameBadge = () => text('rbp-ic-glyph', has ? String(em) : '纹')
  if (has && baseId) {
    const img = document.createElement('img')
    img.className = 'rbp-ic-img'; img.alt = em; img.src = emblemIconUrl(baseId)
    img.onerror = () => img.replaceWith(nameBadge())   // 取不到纹章图标（28 只缺盘 / 新克隆未入库）⇒ 退名称徽章，不静默
    b.append(img)
  } else {
    b.append(nameBadge())
  }
  b.append(tip('纹章', has ? em : '未佩戴', has ? desc : ''))
  return b
}

// 个体值：仿 Unity 品质/level 图标 = 星级（按评级染色），不显数字；悬停出「个体值：31（极）」之类
function ivIcon(iv) {
  const s = String(iv ?? '—')
  const num = s.match(/^\d+/)
  const v = num ? parseInt(num[0], 10) : null
  const rank = v != null ? restartIvRankOf(v) : null
  const color = { '极': '#ffd700', '稀': '#c77dff', '优': '#7fd0ff', '良': '#7fe08a', '一般': '#9aa3b5' }[rank] || '#ffe066'
  const b = el('rbp-ic rbp-ic--iv')
  const glyph = text('rbp-ic-glyph', '★'); glyph.style.color = color
  b.append(glyph, tip('个体值', s))
  return b
}

// 1.2.1.2 加成面板：先天加成 / 后天加成（数据源 D2/D4 ⇒ 只画**注入的清单**，无数据即空态）
function buildBuff(host, ctx, pet) {
  const b = ctx.buffsOf?.(pet) || {}
  for (const [label, list] of [['先天加成', b.innate || []], ['后天加成', b.acquired || []]]) {
    const sec = el('rbp-buff-sec')
    sec.append(text('rbp-buff-title', label))
    const box = el('rbp-buff-list')
    if (!list.length) box.append(text('rbp-buff-empty', '（无 / 数据源 D2·D4 待接）'))
    for (const x of list) box.append(text('rbp-buff-item', x && x.name ? x.name : String(x)))
    sec.append(box)
    host.append(sec)
  }
}
