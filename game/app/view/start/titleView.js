// 开始场景（重启血统 Title）的画面与动效 —— 设计 docs/view/scene/start/view-scene-start-design.md §3.1/§7
// 施工图 docs/view/scene/start/view-scene-start-impl.md §3（本批 = STB-b：纯视觉）
// 血统纪律 STI4：素材只取重启导出件 Assets/StaticResources/Sprites/Title/**（不碰 AS3/Ruffle 线）。
// 零算数 STI3：只做取数 / 拼接 / 显隐 + 纯 CSS 动效；不 import game/core/** 与 game/logic/**。
// 不伪造 STI2：资源包 / Mod 无浏览器后端 ⇒ 灰化 + A3 说明，绝不画假子面板。
import { openHintbox } from '../panels/hintbox.js'

const SPRITE = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Title'
const asset = (file) => `${SPRITE}/${file.replace(/ /g, '%20')}`
const url = (file) => `url("${asset(file)}")`

// 上游 TitleManager 的 resource/mod 区都是原生文件对话框 + 网络下载（分析报告 §5 A6–A8 / A17–A18），
// 浏览器里没有对应后端 ⇒ 灰化 + 这句说明（STI2 / STQ3）。
const NOTE_RESOURCE = '本复刻没有「资源包」流程：原版是原生文件对话框 + 网络下载。'
const NOTE_MOD = '本复刻没有「Mod」流程：原版同上（导入 / 更新 / 导出三条都走原生文件对话框）。'
// 帮助浮层内容（本份自拟，非上游文案）—— 登记在施工图 §9 As-built 待补。
const NOTE_HELP = '地图：点地面行走，点精灵 / 传送光口触发。\n战斗：底栏选技能，页签切捕捉 / 换宠。\n'
  + '（帮助内容尚未按原版逐条整理。）'

// 版本两行恒占位（STQ5 = 本轮不处理版本档；不编造数字，打 data-version-missing）。
export const VERSION_PLACEHOLDER = { date: '----/--/--', string: '----' }

function mk(cls, tag = 'div') {
  const el = document.createElement(tag)
  el.className = cls
  return el
}

// mount(el, opts) → handle{el, destroy()}。el = 面板宿主给的 960×refH 逻辑画布（host.js）。
// opts.onStart：点「开始游戏」的回调（场景接到 go('login')）。
export function mount(el, opts = {}) {
  const root = mk('rst-scene rst-title')
  root.id = 'rst-title'

  // ── 背景（入场的"先到位"判据 = 这张图 load 完，见 CSS 的 .is-ready 门）──
  const bg = mk('rst-bg')
  const img = document.createElement('img')
  img.className = 'rst-bg-img'
  img.alt = ''
  img.src = asset('FirstPage.jpg')   // STQ6：优先 FirstPage.jpg（实测 1200×660，与本舞台同比例）
  bg.append(img)

  // ── 开始图标（上游 "Game Icon"；入场 = 横向擦出 + scale.x 0.08→1）──
  const icon = mk('rst-icon')
  icon.style.backgroundImage = url('Seer2 New Icon.png')

  // ── 底部 HUD（人类 desc 口径：左版本 / 中开始 / 右三钮）──
  const bottom = mk('rst-bottom')

  const version = mk('rst-version')
  version.dataset.versionMissing = '1'
  const vDate = mk('rst-version-date')
  vDate.textContent = VERSION_PLACEHOLDER.date
  const vStr = mk('rst-version-string')
  vStr.textContent = VERSION_PLACEHOLDER.string
  version.append(vDate, vStr)

  const start = mk('rst-startbtn', 'button')
  start.type = 'button'
  start.title = '开始游戏'
  start.setAttribute('aria-label', '开始游戏')
  start.onclick = () => opts.onStart?.()

  const toolbar = mk('rst-toolbar')
  const tools = [
    ['resource', '资源包', NOTE_RESOURCE, true],
    ['mod', 'Mod', NOTE_MOD, true],
    ['help', '帮助', NOTE_HELP, false],
  ]
  for (const [kind, label, note, disabled] of tools) {
    const b = mk('rst-tool', 'button')
    b.type = 'button'
    b.dataset.tool = kind
    b.textContent = label
    if (disabled) b.classList.add('is-disabled')   // 灰化：点了只给 A3 说明，不出假面板
    b.title = label + '：' + note
    b.onclick = () => openHintbox({ content: note, optionNum: 1 })
    toolbar.append(b)
  }

  bottom.append(version, start, toolbar)
  root.append(bg, icon, bottom)
  el.append(root)

  // ── 入场门（STI9）：背景先到位，图标 / 工具条后演（不复现上游 A10/A16 的"演到一半被停用"）──
  const revealed = () => root.classList.add('is-ready')
  if (img.complete) revealed()
  img.addEventListener('load', revealed, { once: true })
  img.addEventListener('error', () => {
    // 缺素材也要能看版式，且如实登记（STI2）
    bg.dataset.assetMissing = 'FirstPage.jpg'
    revealed()
  }, { once: true })

  return {
    el: root,
    destroy() {
      img.removeEventListener('load', revealed)
      root.remove()
    },
  }
}
