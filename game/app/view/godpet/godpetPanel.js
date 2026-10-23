// 灵兽（精灵王约瑟）面板 L4 渲染（View 线 C1·godpet · DOM 自绘最小 UI，形状照 view/spt + view/activity）。
// 真值 = 上游 Assets/Resources/Panels/SpriteKing/（SpriteKingPanel.cs + Panel.prefab，几何逐条抄 RectTransform，
//        Unity 中心系 ⇒ CSS = 480+cx-w/2、270-cy-h/2）。
// 纪律：零 import game/logic/**；读数与动作一律经 opts 注入（state/onXxx）。视图零算数、不伪造头像。
import { el, text, petIconUrl, panelSprite, mountImg } from '../panels/battle/_kit.js'
import * as CONTENT from '../../content.js'

// 灯位 9 格的宠序 = 上游 soulPetId（SpriteKingPanel.cs:15，990 约瑟居中）。
export const SOUL_PET_IDS = [981, 982, 983, 984, 990, 985, 986, 987, 988]

// 规则文案（逐字抄 prefab 的 TMP m_text，`<color>` 富文本两色；本面板 helpHtml 走内联 span）。
const HELP_HTML =
  '通关上方挑战会随机点亮３个头像并获得３个<span style="color:#ffbb33">希望之光</span>' +
  '<span style="color:#00ffff">（每日每种挑战各１次）</span>' +
  '，若原本头像已点亮则会熄灭<br><br>' +
  '全部点亮或集齐50个<span style="color:#ffbb33">希望之光</span>即可在主页面获得约瑟，也可用于兑换奖励'

const FIGHTS = [
  { type: '6v6', label: '6v6 挑战', box: [220, 95, 160, 50] },
  { type: '2v2', label: '2v2 挑战', box: [420, 95, 160, 50] },
  { type: '1v1', label: '1v1 挑战', box: [220, 195, 160, 50] },
]

// buildGodpetPanel(ctx) → { render }。
// ctx = { root, state()→{light:string(9位'0'/'1'), kingAcquired:boolean, hope:number},
//         onFight(type), onShop, onGetKing, onClose }
export function buildGodpetPanel(ctx) {
  const { root, onFight, onShop, onGetKing, onClose } = ctx
  const read = () => (ctx.state ? ctx.state() : { light: '0'.repeat(9), kingAcquired: false, hope: 0 })

  const scrim = el('rb-scrim')
  scrim.addEventListener('click', () => { if (onClose) onClose() })

  const box = el('rb-godpet-box')
  mountImg(box, panelSprite('SpriteKing/Sprites/background.jpg'), 'rb-godpet-bg')

  const closeBtn = text('rb-godpet-close', '✕')
  closeBtn.addEventListener('click', () => { if (onClose) onClose() })

  // ── 左侧 3×3 灯位（Light Panel 400×400 @CSS(60,70)；格 100×100、间距 150，行主序）──
  const light = el('rb-godpet-light')
  const cells = SOUL_PET_IDS.map((petId, i) => {
    const c = el('rb-godpet-cell')
    c.style.left = (150 * (i % 3)) + 'px'
    c.style.top = (150 * Math.floor(i / 3)) + 'px'
    light.append(c)
    return c
  })

  // ── 右侧：三挑战钮（诚实待建）+ 兑换商店 ──
  const chal = el('rb-godpet-chal')
  for (const f of FIGHTS) {
    const b = text('rb-godpet-btn', f.label)
    Object.assign(b.style, { left: f.box[0] + 'px', top: f.box[1] + 'px' })
    b.addEventListener('click', () => { if (onFight) onFight(f.type) })
    chal.append(b)
  }
  const shopBtn = text('rb-godpet-btn', '兑换商店')
  Object.assign(shopBtn.style, { left: '420px', top: '195px' })
  shopBtn.addEventListener('click', () => { if (onShop) onShop() })
  chal.append(shopBtn)

  // ── 底栏：领取约瑟 + 挑战规则（Content 贴底盒，prefab Get King/Rule 165×65 @y 底 +15）──
  const foot = el('rb-godpet-foot')
  const kingBtn = text('rb-godpet-btn rb-godpet-btn--king', '领取约瑟')
  kingBtn.addEventListener('click', () => { if (onGetKing) onGetKing() })
  const ruleBtn = text('rb-godpet-btn', '挑战规则')
  let helpOn = false
  ruleBtn.addEventListener('click', () => { helpOn = !helpOn; render() })
  foot.append(kingBtn, ruleBtn)

  // ── 规则浮层（Help Panel 350×180 @CSS(545,300)，默认隐藏 = 上游 SetActive 开关）──
  const help = el('rb-godpet-help')
  help.innerHTML = HELP_HTML

  box.append(closeBtn, light, chal, foot, help)
  root.append(scrim, box)

  function render() {
    const st = read()
    const lit = String(st.light || '')
    cells.forEach((c, i) => {
      c.textContent = ''
      const on = lit[i] === '1'
      c.classList.toggle('rb-godpet-cell--on', on)
      const name = CONTENT.restartNameOf(SOUL_PET_IDS[i]) || ('id' + SOUL_PET_IDS[i])
      c.title = on ? `${name} · 已点亮` : `${name} · 未点亮`
      if (on) mountImg(c, petIconUrl(SOUL_PET_IDS[i]))
      // 未点亮 = 暗空格（上游 Ban 态），不伪造头像
    })
    kingBtn.classList.toggle('rb-godpet-btn--done', !!st.kingAcquired)
    kingBtn.title = st.kingAcquired
      ? '已领取过约瑟'
      : `点亮全部头像，或集齐 50 个希望之光（当前持有 ×${Number(st.hope) || 0}）`
    help.style.display = helpOn ? 'block' : 'none'
  }

  render()
  return { render }
}
