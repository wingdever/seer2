// PlaceObject2(tag26) 字节布局实测: 枚举候选位序, 要求 UI.swf 里全部 13124 条真实记录整包对齐。
//   node tools/probes/tmp-place-layout.mjs [swf]
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'

const file = process.argv[2] || 'swf/ui/UI.swf'
const raw = fs.readFileSync(file)
const body = new Uint8Array(raw.slice(0, 3).toString() === 'CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)

class Br {
  constructor(p) { this.p = p * 8 }
  bit() { const v = (body[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; return v }
  u(n) { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + this.bit(); return v }
  s(n) { if (!n) return 0; const v = this.u(n); return v & (1 << (n - 1)) ? v - (1 << n) : v }
  align() { if (this.p & 7) this.p = (this.p + 7) & ~7 }
  get byte() { return this.p >> 3 }
}
const MATRIX = p => { const br = new Br(p); if (br.bit()) { const n = br.u(5); br.s(n); br.s(n) } if (br.bit()) { const n = br.u(5); br.s(n); br.s(n) } const n = br.u(5); br.s(n); br.s(n); br.align(); return br.byte }
const CXFORM = p => { const br = new Br(p); const a = br.bit(), m = br.bit(); const n = br.u(4); if (m) { br.u(n); br.u(n); br.u(n); br.u(n) } if (a) { br.u(n); br.u(n); br.u(n); br.u(n) } br.align(); return br.byte }

// 候选: 第一字节位序 (MSB优先) 与 depth 位置
const CAND = [
  // name: 第一字节 = HasVersion|Action|Place|ShowFrame|Move|保留3; 其后 u16 id (无 version 字节时 id 高字节在前?)
  { key: 'A 规范顺序: [b0][u16 id][ver?][b1][mtx][cx][ratio][name][depth]', depthEnd: true, b0: 'ver_act_place_show_move' },
  { key: 'B swfshape 现在用的: [b0][u16 depth][u16 id?][mtx][cx][ratio][name]', depthEnd: false, b0: 'swfshape' },
]

// 实现候选 A: 逐条验证
function decA(p, end) {
  const br0 = new Br(p)
  const hasVer = br0.bit(), action = br0.bit(), place = br0.bit(), showF = br0.bit(), move = br0.bit()
  const b0Consumed = br0.byte   // 只够 5 bit, 规范上第一字节含 4 位保留 → 直接按整字节读
  let q = p + 1
  const id = body[q] | (body[q + 1] << 8); q += 2
  if (hasVer) q += 1
  const f = body[q]; q += 1
  const hasMtx = f & 0x02, hasCx = f & 0x04, hasRatio = f & 0x08, hasName = f & 0x10   // 候选位序1 (ruffle: 0x02 mtx)
  if (hasMtx) q = MATRIX(q)
  if (hasCx) q = CXFORM(q)
  if (hasRatio) q += 1
  let name = null
  if (hasName) { let e = q; while (body[e]) e++; name = Buffer.from(body.slice(q, e)).toString('utf8'); q = e + 1 }
  const depth = body[q] | (body[q + 1] << 8); q += 2
  if (action || place || showF || move) { }                                   // 尾部 blend/clip 需另算
  if ((f & 0x80)) q += 2                                                      // HasClipDepth
  return { ok: q === end, name, id, depth, hasVer, f }
}
// 候选 A2: 第一字节位序 = 0x01 Move / 0x02 Char / 0x04 Mtx / 0x08 Cx / 0x10 Ratio / 0x20 Name / 0x40 ClipDepth / 0x80 ClipActions,
//          其后 [u16 id 当有 Char][mtx][cx][ratio u8][name][u16 depth][clipdepth]
function decA2(p, end) {
  const f = body[p]; let q = p + 1
  const hasChar = f & 0x02
  const id = hasChar ? (body[q] | (body[q + 1] << 8)) : 0
  if (hasChar) q += 2
  if (f & 0x04) q = MATRIX(q)
  if (f & 0x08) q = CXFORM(q)
  if (f & 0x10) q += 1
  let name = null
  if (f & 0x20) { let e = q; while (body[e]) e++; name = Buffer.from(body.slice(q, e)).toString('utf8'); q = e + 1 }
  const depth = body[q] | (body[q + 1] << 8); q += 2
  if (f & 0x40) q += 2
  return { ok: q === end, name, id, depth }
}
// 候选 B: swfshape.mjs applyPlace 的顺序
function decB(p, end) {
  const f = body[p]; let q = p + 1
  const depth = body[q] | (body[q + 1] << 8); q += 2
  let id = 0
  if (f & 0x02) { id = body[q] | (body[q + 1] << 8); q += 2 }
  if (f & 0x04) q = MATRIX(q)
  if (f & 0x08) q = CXFORM(q)
  if (f & 0x10) q += 2
  let name = null
  if (f & 0x20) { let e = q; while (body[e]) e++; name = Buffer.from(body.slice(q, e)).toString('utf8'); q = e + 1 }
  if (f & 0x40) q += 2
  return { ok: q === end, name, id, depth }
}

const all = []
for (const t of swf.tags) if (t.code === 26) all.push({ t, path: 'root' })
for (const [id, sp] of swf.sprites) for (const t of sp.sub) if (t.code === 26) all.push({ t, path: 'sp' + id })
const tally = { A: 0, A2: 0, B: 0, names: 0 }
const bad = []
for (const { t, path } of all) {
  const end = t.start + t.len
  const a = decA(t.start, end), a2 = decA2(t.start, end), b = decB(t.start, end)
  if (a.ok) tally.A++
  if (a2.ok) tally.A2++
  if (b.ok) tally.B++
  if (a2.ok && a2.name) tally.names++
  if (!a2.ok && bad.length < 6) bad.push(`${path} len=${t.len}: ${[...body.slice(t.start, end)].map(x => x.toString(16).padStart(2, '0')).join(' ')}`)
}
console.log(`tag26 记录 ${all.length} 条`)
console.log(`A(规范,mtx0x02) 对齐 ${tally.A}   A2(Char0x02..depth在尾) 对齐 ${tally.A2} (其中有名 ${tally.names})   B(swfshape) 对齐 ${tally.B}`)
for (const s of bad) console.log('  A2失败样例 ' + s)
const sample = all.slice(0, 5).map(({ t, path }) => { const r = decA2(t.start, t.start + t.len); return `${path}[${r.ok ? 'ok' : 'X'}] id=${r.id} depth=${r.depth} name=${r.name}` })
console.log('样例 ' + sample.join('  |  '))
