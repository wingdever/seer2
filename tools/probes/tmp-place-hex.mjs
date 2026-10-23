// 把 UI.swf 根时间轴上的 PlaceObject2/3 原样十六进制打出来, 人工定位真实字节布局。
//   node tools/probes/tmp-place-hex.mjs [swf路径] [数量]
import fs from 'fs'
import zlib from 'zlib'

const file = process.argv[2] || 'swf/ui/UI.swf'
const LIMIT = Number(process.argv[3] || 8)
const buf = fs.readFileSync(file)
const sig = buf.toString('latin1', 0, 3)
const ver = buf[3]
// FWS = 未压缩, CWS = zlib, ZWS = LZMA (本地只遇到前两种)
const body = sig === 'CWS' ? Buffer.concat([buf.subarray(0, 8), zlib.inflateSync(buf.subarray(8))])
  : sig === 'ZWS' ? (() => { throw new Error('LZMA 未支持') })()
  : Buffer.from(buf)
console.log(`文件 ${file}  ${sig}  SWF版本 ${ver}  body ${body.length - 8} 字节`)

let p = 8
const counts = new Map()
let shown = 0

// 递归进 DefineSprite (tag 36): 根时间轴往往没有放置对象, 实例都嵌在精灵里
function walk(start, end, path) {
  let q = start
  while (q + 2 <= end) {
    let code = body[q] >> 3
    // 标签头 = 11 位 code + 5 位长度; 长度 31 是扩展形式 (后跟 UI32)
    let len = (body[q] & 31) | (body[q + 1] << 5)
    q += 2
    if (len === 31) {
      len = body.readUInt32LE(q); q += 4
      if (code === 43) { code = body.readUInt16LE(q); q += 2 }
    }
    const key = path + ':' + code
    counts.set(key, (counts.get(key) || 0) + 1)
    if ((code === 26 || code === 39 || code === 4) && shown < LIMIT) {
      shown++
      const n = Math.min(len, 48)
      const hex = [...body.subarray(q, q + n)].map(b => b.toString(16).padStart(2, '0')).join(' ')
      const asc = [...body.subarray(q, q + n)].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('')
      console.log(`${path} tag${code} len=${len} @${q}\n     ${hex}${len > n ? ' …' : ''}\n     ${asc}`)
    }
    // DefineSprite 体内前 4 字节是 spriteId/frameCount, 之后才是子标签流
    if (code === 36) walk(q + 4, q + len, path + '/sp')
    if (code === 0) break
    q += len
  }
}
walk(8, body.length, 'root')
console.log('计数 ' + [...counts].filter(([k, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' '))
