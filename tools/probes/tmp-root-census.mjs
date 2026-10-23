// UI.swf 根时间轴普查: 标签构成 + 是否已有放置对象 + SymbolClass 里目标面板的 characterId
//   node tools/probes/tmp-root-census.mjs [swf] [符号名过滤]
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'

const raw = fs.readFileSync(process.argv[2] || 'swf/ui/UI.swf')
const body = new Uint8Array(raw.slice(0, 3).toString() === 'CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)
console.log(`rect ${swf.rect.xmin},${swf.rect.ymin}..${swf.rect.xmax},${swf.rect.ymax} = ${swf.widthPx}x${swf.heightPx} 帧率 ${swf.frameRate} 帧数 ${swf.frameCount}`)

const cnt = new Map()
for (const t of swf.tags) cnt.set(t.code, (cnt.get(t.code) || 0) + 1)
console.log('根标签 ' + [...cnt].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '))

// 帧分组: 找 ShowFrame / End 的字节位置 (注入点)
const sf = swf.tags.findIndex(t => t.code === 1)
console.log('ShowFrame #' + sf + ' @' + (sf < 0 ? '-' : swf.tags[sf].start) + '  End #' + swf.tags.findIndex(t => t.code === 0))
const placed = swf.tags.filter(t => t.code === 26 || t.code === 70 || t.code === 4)
console.log('根放置对象 ' + placed.length)
for (const t of placed.slice(0, 6)) console.log(`  tag${t.code} len=${t.len} @${t.start}: ${[...body.slice(t.start, t.start + Math.min(t.len, 32))].map(b => b.toString(16).padStart(2, '0')).join(' ')}`)

const pat = process.argv[3] || ''
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    let q = p; while (body[q]) q++
    const name = Buffer.from(body.slice(p, q)).toString('utf8'); p = q + 1
    if (!pat || name.includes(pat)) {
      const def = swf.tags.find(x => (x.code === 39 || x.code === 2 || x.code === 21 || x.code === 23 || x.code === 32 || x.code === 35 || x.code === 36 || x.code === 83) && dv.getUint16(x.start, true) === cid)
      console.log(`  ${name} → #${cid} 定义tag=${def ? def.code : '?'} len=${def ? def.len : '-'} @${def ? def.start : '-'}`)
    }
  }
}
