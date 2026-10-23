// 注入器(背包): 把 ItemBagPanel.swf 里的面板符号写成它自己根时间轴上的命名放置对象。
//
// **这条路线已经被取代**：实测导出类注册在**被载入 SWF 自己的** ApplicationDomain 里，
// `src.loaderInfo.applicationDomain.getDefinition(类名)` + `new cls()` 直接可用，
// `ItemBagRunner.as` 走的就是这条（也更接近原版 UIManager.getMovieClip + new UI_Xxx()）。
// 本文件留作后备（例如将来遇到某个模块的 DoABC 在 Ruffle 里挂掉时，还能退回注入 + getChildByName）。
//
// 符号 id 来自 ItemBagPanel.swf 的 SymbolClass(76) 绑定, 逐条核对见 tools/probes/tmp-bag-dump.mjs:
//   com.taomee.seer2.module.app.itemBag.ItemBagPanelUI  → 38   面板外壳 (dragMC/closeBtn/zuanTxt/conisTxt/userBtn)
//   …ItemBagTabUI                                     → 95   六个分类页签 (equip/petRelate/collection/vip/element/petSpirtTrain)
//   …ItemBagPageUI                                    → 53   翻页 (previous/next/page)
//   …ItemBagCellUI                                    → 138  单个格子 (bg/vipFlag) —— AS3 没有 clone, 要点 N 份
//   …ItemBagNickUI                                    → 132  标题栏上的昵称/VIP 那块
//
//   node tools/inject-bag-panels.mjs        → swf/module/app/ItemBagPanel_ui.swf (FWS 不压缩)
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList } from '../game/swfshape.mjs'

const SRC = 'swf/module/app/ItemBagPanel.swf'
const OUT = 'swf/module/app/ItemBagPanel_ui.swf'
const CELLS = 30          // 格子份数 (原版是 AS 代码按分页 new 出来的, 面板铺开后再按实际网格调)

// 注入名 → SymbolClass 类名的后缀 (模块里的类名带包路径, 取后缀认)
const PANELS = [
  ['ItemBagPanelUI', '.ItemBagPanelUI'],
  ['ItemBagTabUI', '.ItemBagTabUI'],
  ['ItemBagPageUI', '.ItemBagPageUI'],
  ['ItemBagNickUI', '.ItemBagNickUI'],
  ['ItemBagCellUI', '.ItemBagCellUI'],
]

const raw = fs.readFileSync(SRC)
const cws = raw.slice(0, 3).toString() === 'CWS'
const body = new Uint8Array(cws ? zlib.inflateSync(raw.slice(8)) : raw.subarray(8))
const swf = parseSwf(body)

const ids = new Map()
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = body[p] | (body[p + 1] << 8); p += 2
  for (let i = 0; i < n; i++) {
    const cid = body[p] | (body[p + 1] << 8); p += 2
    let q = p; while (body[q]) q++
    ids.set(Buffer.from(body.slice(p, q)).toString('utf8'), cid); p = q + 1
  }
}
// 后缀 → 字符 id
const bySuffix = new Map()
for (const [nm, cid] of ids) bySuffix.set(nm.slice(nm.lastIndexOf('.')), cid)

const missing = PANELS.filter(([, suf]) => !bySuffix.has(suf))
if (missing.length) { console.error('符号缺失: ' + missing.map(m => m[1]).join(', ')); process.exit(1) }

// ---------- 编码器 (与 inject-ui-panels.mjs 同一份, 逐字节实测过) ----------
class Bw {
  constructor() { this.bytes = []; this.cur = 0; this.nbits = 0 }
  bit(v) { this.cur = (this.cur << 1) | (v & 1); if (++this.nbits === 8) { this.bytes.push(this.cur); this.cur = 0; this.nbits = 0 } }
  u(n, v) { for (let i = n - 1; i >= 0; i--) this.bit((v >> i) & 1) }
  s(n, v) { if (v < 0) v += 1 << n; this.u(n, v) }
  align() { if (this.nbits) { while (this.nbits) this.bit(0) } }
  get out() { return this.bytes }
}
const u16 = v => [v & 0xff, (v >> 8) & 0xff]
function writeMatrix({ tx = 0, ty = 0 }) {
  const w = new Bw()
  w.bit(0)                       // HasScale
  w.bit(0)                       // HasRotate
  w.u(5, 17); w.s(17, Math.round(tx * 20)); w.s(17, Math.round(ty * 20))
  w.align()
  return w.out
}
function placeTag(name, charId, depth) {
  const flags = 0x02 | 0x04 | 0x20                 // HasCharacter + HasMatrix + HasName
  const nm = [...Buffer.from(name, 'utf8'), 0]
  return tag(26, [flags, ...u16(depth), ...u16(charId), ...writeMatrix({}), ...nm])
}
function tag(code, content) {
  const len = content.length
  const head = (code << 6) | (len < 63 ? len : 63)
  const out = [head & 0xff, (head >> 8) & 0xff]
  if (len >= 63) out.push(len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff)
  return out.concat(content)
}

// 注入点: 根时间轴最后一个 ShowFrame 之前
let injectAt = -1
for (let i = swf.tags.length - 1; i >= 0; i--) if (swf.tags[i].code === 1) { injectAt = swf.tags[i].start - 2; break }
if (injectAt < 0) { console.error('根时间轴没有 ShowFrame'); process.exit(1) }

const chunks = []
function emit(name, cid, depth) {
  const def = swf.tags.find(t => t.code === 39 && (body[t.start] | (body[t.start + 1] << 8)) === cid)
  if (!def) { console.error(`${name} #${cid} 不是 DefineSprite, 跳过`); return }
  chunks.push(placeTag(name, cid, depth))
  console.log(`注入 ${name} #${cid} depth ${depth}`)
}
let depth = 1
const cellCid = bySuffix.get('.ItemBagCellUI')
for (const [name, suf] of PANELS) {
  if (suf === '.ItemBagCellUI') {
    for (let i = 0; i < CELLS; i++) emit('Cell' + i, cellCid, depth++)
  } else emit(name, bySuffix.get(suf), depth++)
}
const injected = Buffer.concat(chunks.map(c => Buffer.from(c)))

const hdr = Buffer.alloc(8)
hdr.write('FWS', 0, 'latin1')
hdr[3] = raw[3]
const bodyOut = Buffer.concat([Buffer.from(body.slice(0, injectAt)), injected, Buffer.from(body.slice(injectAt))])
hdr.writeUInt32LE(8 + bodyOut.length, 4)
const out = Buffer.concat([hdr, bodyOut])
fs.writeFileSync(OUT, out)
console.log(`写出 ${OUT}  ${out.length} 字节 (源 ${raw.length}, CWS=${cws}, 注入 ${injected.length} 字节 @${injectAt})`)

// ---------- 自校验 ----------
const back = parseSwf(new Uint8Array(out.subarray(8)))
const list = frameList(back, back.tags, 0)
console.log(`回读根帧0: ${list.length} 个实例 → ` + list.slice(0, 8).map(r => `${r.name || '?'}#${r.id}@d${r.depth}`).join(' ') + (list.length > 8 ? ' …' : ''))
