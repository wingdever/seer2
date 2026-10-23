// 注入器: UI.swf 的根时间轴一个放置对象都没有 (纯定义容器), 原版靠 UIManager 把导出类注册进
// ApplicationDomain 再 new, 而 Ruffle 里 Loader 载入的 SWF 其导出类不注册到任何域 (实测 #1065,
// 见 tools/uitest.mjs 与 NOTES)。这里改成直接改数据模型: 在 ShowFrame 前写入 PlaceObject2,
// 让面板成为根时间轴上的命名子对象, AS3 侧用 loader.content.getChildByName(名字) 就能拿到。
//
// 记录格式 = game/swfshape.mjs applyPlace 的读法的逆 (逐字节实测: UI.swf 内 10865 条 tag26
// 全部整包对齐, 见 tools/probes/tmp-place-layout.mjs):
//   flags u8 | u16 depth | [u16 charId if 0x02] | [MATRIX if 0x04] | [CXFORM if 0x08]
//   | [u16 ratio if 0x10] | [ZSTRING name if 0x20] | [u16 clipDepth if 0x40]
//   flags bit0 = Move
//
//   node tools/inject-ui-panels.mjs          → swf/ui/UI_hud.swf (FWS 不压缩)
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList } from '../game/swfshape.mjs'

const SRC = 'swf/ui/UI.swf'
const OUT = 'swf/ui/UI_hud.swf'
// 名字 → 原版对应面板; depth 只决定彼此叠序, 真正的屏幕位置由 HudRunner.as 按原版坐标设。
// PetAvstarPetItem 要点 6 份: AS3 里 DisplayObject 没有 clone, 原版是 new PetItem() ×N,
// 我们只能把同一个字符 id 放多次 (每个必须独占一个 depth 与名字)。
const PANELS = [
  'UI_ToolBarUI',          // 底部主栏 (ToolBar.as)
  'UI_PetAvatar_Panel',    // 精灵背包条 (PetAvatarPanel.as)
  'UI_ActorAvatar_Panel',  // 左上角色信息 (ActorAvatarPanel.as)
  'UI_Toolbar_Minor',      // 右上伸缩栏 (MinorToolBar.as)
  'UI_MapTitle',           // 底部中间地图名牌 (MapTitlePanel.as)
  'rightToolbarBg',        // 右上活动栏外壳 (图标在 loaderLibrary/rightToolbar/*.swf, 本地未镜像)
]
const PET_ITEMS = 6        // 背包格数量 (原版 hover 展开时按背包宠物数 new)
const PET_ITEM = 'PetAvstarPetItem'

const raw = fs.readFileSync(SRC)
const cws = raw.slice(0, 3).toString() === 'CWS'
const body = new Uint8Array(cws ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)

// 符号表: tag76 SymbolClass 名字 → 字符 id
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
const missing = PANELS.filter(n => !ids.has(n))
if (missing.length) { console.error('符号缺失: ' + missing.join(', ')); process.exit(1) }

// ---------- 编码器 ----------
class Bw {
  constructor() { this.bytes = []; this.cur = 0; this.nbits = 0 }
  bit(v) { this.cur = (this.cur << 1) | (v & 1); if (++this.nbits === 8) { this.bytes.push(this.cur); this.cur = 0; this.nbits = 0 } }
  u(n, v) { for (let i = n - 1; i >= 0; i--) this.bit((v >> i) & 1) }
  s(n, v) { if (v < 0) v += 1 << n; this.u(n, v) }
  align() { if (this.nbits) { while (this.nbits) this.bit(0) } }
  get out() { return this.bytes }
}
const u16 = v => [v & 0xff, (v >> 8) & 0xff]
// MATRIX: HasScale(则两对有符号) HasRotate(则两对有符号) 然后 tx/ty 有符号
function writeMatrix({ sx = 1, sy = 1, kx = 0, ky = 0, tx = 0, ty = 0 }) {
  const w = new Bw()
  const scaled = sx !== 1 || sy !== 1
  w.bit(scaled ? 1 : 0)
  if (scaled) { w.u(5, 16); w.s(16, Math.round(sx * 65536)); w.s(16, Math.round(sy * 65536)) }
  const rot = kx !== 0 || ky !== 0
  w.bit(rot ? 1 : 0)
  if (rot) { w.u(5, 16); w.s(16, Math.round(kx * 65536)); w.s(16, Math.round(ky * 65536)) }
  w.u(5, 17); w.s(17, Math.round(tx * 20)); w.s(17, Math.round(ty * 20))   // 舞台像素 → twips
  w.align()
  return w.out
}
function placeTag(name, charId, depth, pos) {
  const flags = 0x02 | 0x04 | 0x20                 // HasCharacter + HasMatrix + HasName
  const mtx = writeMatrix(pos)
  const nm = [...Buffer.from(name, 'utf8'), 0]
  const content = [flags, ...u16(depth), ...u16(charId), ...mtx, ...nm]
  return tag(26, content)
}
function tag(code, content) {
  // 标签头 u16 = (code 高 10 位) | (len 低 6 位); len ≥ 63 时低 6 位置 63, 其后跟 UI32 真实长度
  const len = content.length
  const head = (code << 6) | (len < 63 ? len : 63)
  const out = [head & 0xff, (head >> 8) & 0xff]
  if (len >= 63) out.push(len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff)
  return out.concat(content)
}

// ---------- 头部 ----------
// 注意: game/swfshape.mjs 的 parseSwf 收的是"去掉 8 字节文件头"的 body (本仓库约定),
// 所以 body[0..] 直接就是 RECT; 文件头只存在于 raw 里 (sig + ver + 解压后总长)。
console.log(`body ${body.length} 字节, 首个标签体 @${swf.tags[0].start}, 帧率 ${swf.frameRate}, 帧数 ${swf.frameCount}, stage ${swf.widthPx}x${swf.heightPx}`)

// 注入点: 根时间轴最后一个 ShowFrame 之前
let injectAt = -1
for (let i = swf.tags.length - 1; i >= 0; i--) if (swf.tags[i].code === 1) { injectAt = swf.tags[i].start - 2; break }
if (injectAt < 0) { console.error('根时间轴没有 ShowFrame'); process.exit(1) }

const chunks = []
function emit(name, cid, depth) {
  const def = swf.tags.find(t => t.code === 39 && (body[t.start] | (body[t.start + 1] << 8)) === cid)
  if (!def) { console.error(`${name} #${cid} 不是 DefineSprite, 跳过`); return }
  chunks.push(placeTag(name, cid, depth, { tx: 0, ty: 0 }))
  console.log(`注入 ${name} #${cid} depth ${depth}`)
}
let depth = 1
PANELS.forEach(name => emit(name, ids.get(name), depth++))
// 同一个字符 id 放 6 次, 各占一个 depth 与名字; HudRunner 用 getChildByName 取, 按背包长度显隐
if (ids.has(PET_ITEM)) for (let i = 0; i < PET_ITEMS; i++) emit(`PetItem${i}`, ids.get(PET_ITEM), depth++)
else console.error(`符号缺失: ${PET_ITEM} (背包格将不注入)`)
const injected = Buffer.concat(chunks.map(c => Buffer.from(c)))

// 写出不压缩的 FWS: 文件头 (sig + ver + 解压后总长) 8 字节是我自己造的, body 里不含它
const hdr = Buffer.alloc(8)
hdr.write('FWS', 0, 'latin1')
hdr[3] = raw[3]                                     // SWF 版本号沿用原文件
const bodyOut = Buffer.concat([Buffer.from(body.slice(0, injectAt)), injected, Buffer.from(body.slice(injectAt))])
hdr.writeUInt32LE(8 + bodyOut.length, 4)            // FileLength = 头 + 未压缩 body
const out = Buffer.concat([hdr, bodyOut])
fs.writeFileSync(OUT, out)
console.log(`写出 ${OUT}  ${out.length} 字节 (源 ${raw.length}, CWS=${cws}, 注入 ${injected.length} 字节 @${injectAt})`)

// ---------- 自校验: 重新解析, 读回根时间轴第一帧的显示列表 ----------
const back = parseSwf(new Uint8Array(out.subarray(8)))
const list = frameList(back, back.tags, 0)
console.log(`回读根帧0: ${list.length} 个实例 → ` + list.map(r => `${r.name || '?'}#${r.id}@d${r.depth}`).join(' '))
