// 暴力搜索: 对指定 DefineShape, 在 (记录起始字节, fillBits, lineBits) 空间里找
// 能"正好消耗到标签末尾"的解码 → 由此确定 ShapeRecords 的真实位布局。
import fs from 'node:fs'
import zlib from 'node:zlib'

const [,, file, ...want] = process.argv
const buf = fs.readFileSync(file)
const sig = buf.toString('latin1', 0, 3)
const body = sig === 'FWS' ? new Uint8Array(buf.subarray(8)) : Buffer.from(zlib.inflateSync(buf.subarray(8)))

class Br {
  constructor(u8, bitPos = 0) { this.u = u8; this.p = bitPos }
  get bytePos() { return (this.p + 7) >> 3 }
  align() { if (this.p & 7) this.p = (this.p + 7) & ~7 }
  read(n) { let v = 0; for (let i = 0; i < n; i++) { v = v * 2 + ((this.u[this.p >> 3] >> (7 - (this.p & 7))) & 1); this.p++ } return v }
  sread(n) { if (!n) return 0; const v = this.read(n); return v & 2 ** (n - 1) ? v - 2 ** n : v }
}
const u16 = (u, p) => u[p] | (u[p + 1] << 8)

const tags = []
{
  let q = 0
  const br0 = new Br(body, 0)
  const n = br0.read(5); br0.sread(n); br0.sread(n); br0.sread(n); br0.sread(n); br0.align()
  q = br0.bytePos + 4
  for (;;) {
    const w = body.readUInt16LE(q); const code = w >> 6; let len = w & 0x3f; q += 2
    if (len === 0x3f) { len = body.readUInt32LE(q); q += 4 }
    tags.push({ code, start: q, len })
    q += len
    if (code === 0) break
  }
}

// 解码一遍 ShapeRecords; flagMode: ruffle = bit0..4 = MOVE/F0/F1/LINE/NEWSTYLES;
// adobe = bit4..0 直接按 NewFill/NewLine/End 位置解释 (前 3 位为语义位)
function run(startByte, fillBits, lineBits, flagMode) {
  const br = new Br(body, startByte * 8)
  let recs = 0, edges = 0, moves = 0, ends = 0
  const bitLimit = body.length * 8
  for (let g = 0; g < 200000; g++) {
    if (br.p >= bitLimit) return null
    const type = br.read(1)
    if (type) {
      edges++
      const straight = br.read(1)
      const n = br.read(4) + 2
      if (straight) {
        const axis = !br.read(1)
        const vert = axis && br.read(1) !== 0
        if (!axis || !vert) br.sread(n)
        if (!axis || vert) br.sread(n)
      } else { br.sread(n); br.sread(n); br.sread(n); br.sread(n) }
    } else {
      recs++
      let flags
      if (flagMode === 'ruffle') {
        flags = br.read(5)
        if (flags === 0) { ends++; break }
        if (flags & 1) { const mb = br.read(5); br.sread(mb); br.sread(mb); moves++ }
        if (flags & 2) br.read(fillBits)
        if (flags & 4) br.read(fillBits)
        if (flags & 8) br.read(lineBits)
        if (flags & 16) return null                       // NEW_STYLES 暂不支持
      } else {
        const nf = br.read(1), nl = br.read(1), end = br.read(1)
        if (end) { ends++; br.read(2); break }
        if (nf) { const has = br.read(1); if (has) { const r = br.read(1); if (r) { br.read(1); br.read(fillBits) } else br.read(fillBits) } else br.read(4) }
        if (nl) { const r = br.read(1); if (r) br.read(4); else br.read(lineBits) }
        moves += 0
      }
    }
  }
  return { endByte: br.bytePos, endBit: br.p, recs, edges, moves, ends }
}

for (const t of tags) {
  if (![2, 21, 32, 83].includes(t.code)) continue
  const id = body.readUInt16LE(t.start)
  if (want.length && !want.map(Number).includes(id)) continue
  const tagEnd = (t.start + t.len) * 8
  const sols = []
  for (const mode of ['ruffle', 'adobe']) {
    for (let sb = t.start + 2; sb < Math.min(t.start + t.len, t.start + 40); sb++) {
      for (let fb = 0; fb <= 8; fb++) {
        for (let lb = 0; lb <= 8; lb++) {
          const r = run(sb, fb, lb, mode)
          if (!r) continue
          if (r.ends && r.endBit === tagEnd) sols.push(`${mode} byte${sb} f${fb} l${lb} rec=${r.recs} edge=${r.edges} mv=${r.moves}`)
        }
      }
    }
  }
  console.log(`\nid${id} tag${t.code} len=${t.len}: ${sols.length} solutions`)
  console.log(sols.slice(0, 12).join('\n'))
}
