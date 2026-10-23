// 打印指定 sprite 的内部实例 (depth/name/id/matrix), 校验 PO2/PO3 解码
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList, geometryOf, findInstance } from '../../game/swfshape.mjs'

const [,, file, ...ids] = process.argv
const buf = fs.readFileSync(file)
const sig = buf.toString('latin1', 0, 3)
const body = sig === 'FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
const swf = parseSwf(body)
for (const id of ids.map(Number)) {
  const sp = swf.sprites.get(id)
  if (!sp) { console.log(`sprite ${id}: MISSING`); continue }
  console.log(`\nsprite${id} frames=${sp.frames} tags=[${sp.sub.map(t => t.code).join(',')}]`)
  for (const ci of frameList(swf, sp.sub, 0)) {
    const g = swf.shapes.get(ci.id) || swf.sprites.get(ci.id)
    console.log(`  d${ci.depth} ${ci.name || '-'} id${ci.id} m=${JSON.stringify(ci.matrix || null)} → ${g ? (g.contours ? g.contours.length + ' contours' : 'sprite') : '???'}`)
  }
}
const nm = process.env.LAYER
if (nm) {
  const i = findInstance(swf, nm)
  console.log(`\nlayer ${nm}:`, JSON.stringify(i), i ? geometryOf(swf, i).contours.length + ' contours' : '')
}
