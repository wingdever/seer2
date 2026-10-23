// 全量地图体检: 形状解析对齐率 / 图层实例 / path_mc 可走栅格
import fs from 'node:fs'; import zlib from 'node:zlib'
import { parseSwf, findInstance, walkGridOf } from '../../game/swfshape.mjs'
const files = fs.readdirSync('swf/map').filter(f=>f.endsWith('.swf')).map(f=>'swf/map/'+f)
let noPath = 0, badShapes = 0, err = 0
for (const f of files) {
  try {
    const buf = fs.readFileSync(f)
    const body = buf.toString('latin1',0,3)==='FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
    const swf = parseSwf(body)
    let bad = 0
    for (const [, s] of swf.shapes) if (!s.ok) bad++
    const names = ['far_mc','ground_mc','content_mc','front_mc','path_mc','size_mc']
    const have = names.filter(n => findInstance(swf, n))
    if (bad) badShapes++
    if (!findInstance(swf,'path_mc')) noPath++
    let info = ''
    if (have.includes('path_mc')) {
      try { const w = walkGridOf(swf, 10); info = `${w.gw}x${w.gh} blocked=${(w.blockedRatio*100).toFixed(0)}% c=${w.contours} nz=${w.nonzero}` }
      catch (e) { info = 'GRID-FAIL ' + e.message; err++ }
    } else info = '—'
    console.log(`${f} stage=${swf.widthPx.toFixed(0)}x${swf.heightPx.toFixed(0)} shapes=${swf.shapes.size} misaligned=${bad} layers=[${have.join(',')}] ${info}`)
  } catch (e) { console.log(`${f} PARSE-FAIL ${e.message}`); err++ }
}
console.log(`\ntotal=${files.length} 无path_mc=${noPath} 有未对齐形状=${badShapes} 失败=${err}`)
