// 一次性: 列 UI.swf 的 SymbolClass 名字表 (tag 76), 按前缀归类
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'
const raw = fs.readFileSync(process.argv[2] || 'swf/ui/UI.swf')
const body = new Uint8Array(raw.slice(0,3).toString()==='CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)
const out = []
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    let q = p; while (body[q]) q++
    out.push([Buffer.from(body.slice(p,q)).toString('utf8'), cid]); p = q + 1
  }
}
console.log('总符号数', out.length)
const pat = process.argv[3] || ''
const hit = out.filter(([n]) => !pat || n.includes(pat))
console.log(hit.length + ' 命中')
for (const [n, c] of hit.sort()) console.log('  ' + n + '  #' + c)
