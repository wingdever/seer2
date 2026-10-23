// 道具美术解析（UI 线 U4 道具支共享）。
// 四级兜底：① 离线静图镜像 /png/<与 swf 同路径>（tools/swf2svg.mjs 产物，一张静图不在运行时挂 Ruffle）；
//          ② 本地 swf 镜像（Ruffle 播）/swf/item/{分类}/icon/{resId}.swf —— 仅当①缺件；
//          ③ Unity 资源树的道具 PNG /projects/.../Resources/{Items|路径}/{resId}.png（与 NPC/宠物美术同口径的 ART_ROOT）；
//          ④ 四处都没有 => 退色块 tile + assetMissing 自陈。
// 纪律：不 import game/logic/**；物品数据经 CONTENT（arch-code 3 例外允许）。
import { el } from './panels/battle/_kit.js'
import * as CONTENT from '../content.js'

// Unity 重启版的 Resources 根（同 npc-art.js 的 ART_ROOT；dev server 服务仓库根，NPC/宠物美术也走这棵）。
const ART_ROOT = '/projects/Seer2-Restart-Lite-main/Resources'

// ID 段 → 分类目录（与 tools/build-items.mjs 的 ICON_BASES 逐条一致；浏览器侧副本，仅当字典缺该物品时兜底拼 swf 路径）。
const ICON_BASES = [
  { range: [1, 100000], base: 'item/icon/' },
  { range: [100001, 199999], base: 'item/equip/icon/' },
  { range: [200001, 299999], base: 'item/pet/icon/' },
  { range: [300001, 399999], base: 'item/emblem/icon/' },
  { range: [400001, 499999], base: 'item/collection/icon/' },
  { range: [500001, 500500], base: 'item/medal/icon/' },
  { range: [500501, 610000], base: 'item/special/icon/' },
  { range: [800001, 805999], base: 'item/petSpirtTrain/icon/' },
]
const NONO_EQUIP = [102000, 102999]
function itemIconRoute(id) {
  if (id >= NONO_EQUIP[0] && id <= NONO_EQUIP[1]) return { cat: 'NONO_EQUIP', base: 'nono/nonoEquipIcon/' }
  for (const r of ICON_BASES) if (id >= r.range[0] && id <= r.range[1]) return { cat: r.cat, base: r.base }
  return { cat: 'COLLECTION', base: 'item/collection/icon/' }   // 原版 default 分支
}

// 本地 swf 镜像（build-items.mjs 已把 icon 算进 items.json，优先用；字典缺项才用路由兜底）。
export function itemSwfUrl(resId) {
  return CONTENT.restartItemOf(resId)?.icon || ('/swf/' + itemIconRoute(resId).base + resId + '.swf')
}
// Unity 资源树的道具 PNG。两类 resId 都要接住（实测 unity/items.json 612 条 = 382 数字 + 230 路径）：
//   数字 "10101"        → Resources/Items/10101.png
//   路径 "Buffs/400001" → Resources/Buffs/400001.png
// ⚠️ 旧版把两者都当文件名拼（Items/Buffs/400001.png）⇒ 那 230 条永远 404、只剩色块；
//    修好后实测命中 611/612（唯一缺 290008），商店/背包两边的图示一起亮。
export function itemPngUrl(resId) {
  const rs = String(resId)
  return rs.includes('/') ? ART_ROOT + '/' + rs + '.png' : ART_ROOT + '/Items/' + rs + '.png'
}

// 离线静图镜像（`tools/swf2svg.mjs` 产物 = 仓根 `png/`，与 swf 源**同路径**、只换前缀与扩展名）。
// 人类 2026-10-20 点名 PI-static「装备和坐骑图标应当改为调用相应的 svg 或 png」⇒ 静图优先、Ruffle 退为缺件兜底。
// 选 png 不选 svg：格子只有 22/44 CSS px，png @2x 够锐且体量约 1/3；`svg/` 留给要放大的场合。
// ⚠️ 产物**不入库**（`.gitignore:51-55`）⇒ 新克隆这里 404 ⇒ 由兜底链落回 Ruffle/PNG/色块，不许空屏。
const STATIC_ROOT = '/png'
export function itemStaticUrl(resId) {
  if (!/^\d+$/.test(String(resId))) return null        // 路径型 resId 压根没有 swf 源 ⇒ 也就没有静图镜像
  const swf = itemSwfUrl(resId)
  if (!swf.startsWith('/swf/')) return null
  return STATIC_ROOT + swf.slice(4).replace(/\.swf$/, '.png')
}

// typeRaw → 稳定色相（纯表现，同类型同色；非数值权威）。
export function typeColor(raw) {
  const s = String(raw || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return 'hsl(' + (h % 360) + ' 45% 42%)'
}

// makeItemIcon(resId, size, useRuffle, typeRawHint) —— 四级兜底装载器（① 静图镜像 → ② Ruffle → ③ Unity PNG → ④ 色块）。
// 大列表用 useRuffle=false 跳过 Ruffle（避免数百个 Flash 播放器）；① 静图不受该参数影响（就是一张 <img>）。
// typeRawHint：色块底色用。路径型 resId（"Buffs/400001"）按 id 查不到字典，这里让调用方把 item.typeRaw 递进来。
export function makeItemIcon(resId, size, useRuffle, typeRawHint) {
  const wrap = el('rb-shop-ico')
  wrap.style.width = size + 'px'; wrap.style.height = size + 'px'
  const raw = (typeRawHint != null && typeRawHint !== '') ? typeRawHint : CONTENT.restartItemOf(resId)?.typeRaw
  wrap.append(el('rb-shop-tile', { background: typeColor(raw) }))
  // 每一层失败就摘掉自己、交棒下一层；末层再失败 = 留 tile 并在宿主上自陈缺件（同 battle/_kit.js 的 mountImg 口径，不静默换图）。
  const imgStep = (url, next, last) => {
    const img = document.createElement('img')
    img.className = 'rb-shop-img'
    img.addEventListener('error', () => {
      img.remove()
      if (last) wrap.dataset.assetMissing = url.slice(url.lastIndexOf('/') + 1)
      next()
    })
    img.src = url
    wrap.append(img)
  }
  const swfStep = (url, next) => {
    try {
      const p = window.RufflePlayer.newest().createPlayer()
      p.style.width = '100%'; p.style.height = '100%'
      p.style.position = 'absolute'; p.style.left = '0'; p.style.top = '0'; p.style.pointerEvents = 'none'
      let done = false
      const fail = () => { if (done) return; done = true; p.remove(); next() }
      p.addEventListener('error', fail)
      wrap.append(p)
      // ⚠️ Ruffle 对**尚未进入活 DOM** 的元素直接忽略 play（console 警告 "Ignoring attempt to play a disconnected or
      // suspended Ruffle element"），且入栈后不重试 ⇒ 装载必须等调用方把 wrap 接进文档再发（本函数返回 wrap、
      // 接树发生在同批同步代码里 ⇒ queueMicrotask 让出一个微任务即已连接）。仓内其余播放器全是「先 append 后 load」（battleScene/mapScene…）。
      queueMicrotask(() => {
        if (!p.isConnected) { fail(); return }   // 宿主没接进 DOM ⇒ 走兜底，不留挂死播放器
        try {
          p.ruffle().load({
            url,
            allowScriptAccess: true, wmode: 'transparent',
            autoplay: 'on', unmuteOverlay: 'hidden', scale: 'showAll', menu: false,
          }).catch(fail)
        } catch (e) { fail() }
      })
    } catch (e) { next() }
  }
  // 路径型 resId 压根没有对应 swf（/swf/item/**/icon/ 下只躺着 1.swf），别为一次注定失败的 Ruffle 装载空等一轮
  //（还会先挡住底色块）⇒ 只有纯数字 id 才排进②。
  const staticUrl = itemStaticUrl(resId)
  const canRuffle = useRuffle && /^\d+$/.test(String(resId)) && window.RufflePlayer?.newest
  const steps = []
  if (staticUrl) steps.push(next => imgStep(staticUrl, next, false))
  if (canRuffle) steps.push(next => swfStep(itemSwfUrl(resId), next))
  steps.push(next => imgStep(itemPngUrl(resId), next, true))
  const run = k => { if (k < steps.length) steps[k](() => run(k + 1)) }
  run(0)
  return wrap
}
