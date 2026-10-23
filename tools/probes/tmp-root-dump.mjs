import fs from 'node:fs'; import zlib from 'node:zlib'
import { parseSwf, frameList, findInstance, geometryOf } from '../../game/swfshape.mjs'
for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(f)
  const body = buf.toString('latin1',0,3)==='FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
  const swf = parseSwf(body)
  console.log(`\n== ${f} shapes=${swf.shapes.size} sprites=${swf.sprites.size} stage=${swf.widthPx}x${swf.heightPx}`)
  console.log(' root:', frameList(swf, swf.tags, 0).map(i=>`${i.depth}:${i.name||'?'}=id${i.id}`).join(' '))
  const p = findInstance(swf, 'path_mc')
  if (!p) { console.log(' path_mc MISSING at root'); continue }
  // path_mc 的 char 是 sprite 还是 shape?
  const sp = swf.sprites.get(p.id)
  if (sp) console.log(`  path_mc id${p.id} = sprite, sub tags=[${sp.sub.map(t=>t.code).join(',')}] inst=${JSON.stringify(frameList(swf,sp.sub,0).map(i=>({d:i.depth,id:i.id,n:i.name})))}`)
  const g = geometryOf(swf, p)
  console.log(`  contours=${g.contours.length} nonzero=${g.nonzero} bounds=${JSON.stringify(g.bounds)}`)
  g.contours.forEach((c,i)=>console.log(`   c${i} pts=${c.length} first=${c[0].map(v=>v.toFixed(1))} last=${c[c.length-1].map(v=>v.toFixed(1))}`))
}
