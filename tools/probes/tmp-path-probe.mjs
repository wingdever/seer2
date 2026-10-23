// 校验 game/swfshape.js 的位流解析: 每个 DefineShape* 的边记录是否正好消耗到标签末尾
// (对齐 = 位布局正确的强证据), 并打印 path_mc 栅格化结果统计。
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList, findInstance, geometryOf, walkGridOf } from '../../game/swfshape.mjs'

const files = process.argv.slice(2)
if (!files.length) files.push('swf/map/1.swf')
for (const f of files) {
  const buf = fs.readFileSync(f)
  const sig = buf.toString('latin1', 0, 3)
  const body = sig === 'FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
  const swf = parseSwf(body)
  let ok = 0, bad = 0, errs = 0
  for (const [, s] of swf.shapes) { if (s.ok) ok++; else bad++ }
  console.log(`\n=== ${f} ${sig} tags=${swf.tags.length} shapes=${swf.shapes.size} sprites=${swf.sprites.size} aligned=${ok} misaligned=${bad}`)
  const root = frameList(swf, swf.tags, 0)
  console.log('root instances:', root.map(i => `${i.depth}:${i.name || '?'}=id${i.id}`).join(' '))
  for (const nm of ['path_mc', 'size_mc', 'ground_mc', 'content_mc', 'far_mc', 'front_mc']) {
    const i = findInstance(swf, nm)
    if (!i) { console.log(`  ${nm}: MISSING`); continue }
    const g = geometryOf(swf, i)
    const b = g.bounds
    console.log(`  ${nm}: id=${i.id} mtx=${JSON.stringify(i.matrix)} contours=${g.contours.length} bounds=${b ? `${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}` : 'none'}`)
  }
  try {
    const w = walkGridOf(swf, 20)
    console.log(`  grid ox=${w.ox.toFixed(0)} oy=${w.oy.toFixed(0)} cell=${w.cell} ${w.gw}x${w.gh} segments=${w.segments} blocked=${(w.blockedRatio * 100).toFixed(1)}%`)
    const rows = []
    for (let j = 0; j < w.gh; j += Math.max(1, Math.ceil(w.gh / 22))) {
      let s = ''
      for (let i = 0; i < w.gw; i += Math.max(1, Math.ceil(w.gw / 60))) s += w.ascii[j * w.gw + i]
      rows.push(s)
    }
    console.log(rows.join('\n'))
  } catch (e) { console.log('  walkGrid failed: ' + e.message) }
}
