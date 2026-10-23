// 逐符号校验 DefineShape* 解析: 是否正好消耗到标签末尾 (aligned) + 轮廓数 + 错误
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'

for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(f)
  const body = buf.toString('latin1', 0, 3) === 'FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
  const swf = parseSwf(body)
  console.log('\n== ' + f, 'shapes', swf.shapes.size, 'sprites', swf.sprites.size)
  for (const [id, s] of swf.shapes) {
    console.log(` id${id} tag${s.tag} ver${s.ver} ok=${s.ok} end-start=${s.endBit - s.startBit} contours=${s.contours ? s.contours.length : 'ERR'} stylesEnd=${s.stylesEnd} bounds=${JSON.stringify(s.bounds)}` + (s.error ? ' ERR=' + s.error : ''))
  }
  // sprite 内部形状是否可解析
  for (const [id, sp] of swf.sprites) {
    const ids = sp.sub.map(t => t.code)
    console.log(` sprite${id} frames=${sp.frames} tags=[${ids.join(',')}]`)
  }
}
