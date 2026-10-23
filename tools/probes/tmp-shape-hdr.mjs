// 按 ruffle 布局逐步打印 DefineShape* 的样式表位置, 定位解析走偏处
import fs from 'node:fs'
import zlib from 'node:zlib'

const [,, file, ...wantIds] = process.argv
const buf = fs.readFileSync(file)
const sig = buf.toString('latin1', 0, 3)
const body = sig === 'FWS' ? Buffer.from(buf.subarray(8)) : Buffer.from(zlib.inflateSync(buf.subarray(8)))

class Br {
  constructor(u8, bitPos = 0) { this.u = u8; this.p = bitPos }
  get bytePos() { return (this.p + 7) >> 3 }
  align() { if (this.p & 7) this.p = (this.p + 7) & ~7 }
  read(n) { let v = 0; for (let i = 0; i < n; i++) { v = v * 2 + ((this.u[this.p >> 3] >> (7 - (this.p & 7))) & 1); this.p++ } return v }
  sread(n) { if (!n) return 0; const v = this.read(n); return v & 2 ** (n - 1) ? v - 2 ** n : v }
  ubits(n) { return this.read(n) }
}
const u16 = (u, p) => u[p] | (u[p + 1] << 8)
const hex = (a, b) => Array.from(body.slice(a, b)).map(x => x.toString(16).padStart(2, '0')).join(' ')

const tags = []
{
  let q = 0
  const br0 = new Br(body, 0)
  const n = br0.ubits(5); br0.sread(n); br0.sread(n); br0.sread(n); br0.sread(n); br0.align()
  q = br0.bytePos + 4
  for (;;) {
    const w = body.readUInt16LE(q); const code = w >> 6; let len = w & 0x3f; q += 2
    if (len === 0x3f) { len = body.readUInt32LE(q); q += 4 }
    tags.push({ code, start: q, len })
    q += len
    if (code === 0) break
  }
}

for (const t of tags) {
  if (![2, 21, 32, 83].includes(t.code)) continue
  const id = body.readUInt16LE(t.start)
  if (wantIds.length && !wantIds.map(Number).includes(id)) continue
  const ver = t.code === 2 ? 1 : t.code === 21 ? 2 : t.code === 32 ? 3 : 4
  const br = new Br(body, (t.start + 2) * 8)
  const rect = () => { const n = br.ubits(5); const r = [br.sread(n), br.sread(n), br.sread(n), br.sread(n)]; br.align(); return `n=${n} ${r.join(',')} → byte${br.bytePos}` }
  console.log(`\n== id${id} tag${t.code} ver${ver} len=${t.len} body@${t.start}..${t.start + t.len}`)
  console.log('  bounds  ' + rect())
  let flags = 0
  if (ver >= 4) {
    console.log('  edgeBnd ' + rect())
    flags = body[br.bytePos]
    console.log(`  flags byte=${flags.toString(16)} @${br.bytePos}`)
  }
  let p = br.bytePos + (ver >= 4 ? 1 : 0)
  console.log(`  styles@${p}: ${hex(p, Math.min(p + 40, t.start + t.len))}`)
  let cnt = body[p]; p++
  if (cnt === 0xff && ver >= 2) { cnt = u16(body, p); p += 2 }
  console.log(`  numFillStyles=${cnt}`)
  let lcnt = 0
  if (cnt === 0) {
    lcnt = body[p]; p++
    if (lcnt === 0xff && ver >= 2) { lcnt = u16(body, p); p += 2 }
    console.log(`  numLineStyles=${lcnt} → next@${p}: ${hex(p, Math.min(p + 24, t.start + t.len))}`)
    if (lcnt === 0) {
      const nb = body[p]
      console.log(`  numBits byte=0x${nb.toString(16)} fillBits=${nb >> 4} lineBits=${nb & 15} records@${p + 1}`)
      console.log(`  records hex: ${hex(p + 1, t.start + t.len)}`)
    }
  }
}
