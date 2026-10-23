// Rewrite an SWF's stage RECT (header surgery, data-model level).
// These taomee-exported SWFs use the legacy header: after sig/ver/len, the
// decompressed body starts directly with the stage RECT:
//   RECT = 5-bit nBits + 4 x nBits signed (xMin xMax yMin yMax), byte-padded,
// followed by frame-rate/count bytes and the tag stream.
// Usage: node tools/patch-swf-stage.mjs <in.swf> <out.swf> <wPx> <hPx>
import fs from 'node:fs'
import zlib from 'node:zlib'

const [,, inFile, outFile, wStr, hStr] = process.argv
const W = Math.round(Number(wStr) * 20), H = Math.round(Number(hStr) * 20) // twips
const buf = fs.readFileSync(inFile)
const sig = buf.toString('latin1', 0, 3)
if (sig === 'ZWS') throw new Error('LZMA unsupported')
const version = buf[3]
const body = sig === 'FWS' || sig === 'WS' ? buf.subarray(8) : zlib.inflateSync(buf.subarray(8))

let bit = 0
const bits = k => { let v = 0; for (let i = 0; i < k; i++) { v = (v << 1) | ((body[bit >> 3] >> (7 - (bit & 7))) & 1); bit++ } return v }
const nBitsOld = bits(5)
const rd = () => { let v = bits(nBitsOld); if ((v >> (nBitsOld - 1)) & 1) v -= 1 << nBitsOld; return v }
const [xMin, xMax, yMin, yMax] = [rd(), rd(), rd(), rd()]
const tagsStart = Math.ceil(bit / 8)
const tags = body.subarray(tagsStart)

let nBits = 1
while ((1 << (nBits - 1)) - 1 < Math.max(Math.abs(xMin), W, Math.abs(yMin), H)) nBits++
const headBytes = Math.ceil((5 + 4 * nBits) / 8)
const out = Buffer.alloc(headBytes)
let bp = 0
const wr = (v, k) => { for (let i = k - 1; i >= 0; i--) { if (((v >>> i) & 1)) out[bp >> 3] |= 1 << (7 - (bp & 7)); bp++ } }
wr(nBits, 5)
for (const v of [xMin, W, yMin, H]) wr(v < 0 ? (1 << nBits) + v : v, nBits)
if (headBytes !== tagsStart) throw new Error(`rect size change not supported: ${tagsStart} → ${headBytes} bytes (choose nBits-compatible size)`)
const newBody = Buffer.concat([out, tags])

const comp = zlib.deflateSync(newBody)
const head = Buffer.alloc(8)
head.write(sig, 0, 'latin1')
head[3] = version
head.writeUInt32LE(8 + newBody.length, 4)
fs.writeFileSync(outFile, Buffer.concat([head, comp]))
console.log(inFile, `stage (${xMin / 20},${yMin / 20}) ${xMax / 20}x${yMax / 20} nBits ${nBitsOld} → ${W / 20}x${H / 20} nBits ${nBits}`, '→', outFile, fs.statSync(outFile).size, 'bytes')
