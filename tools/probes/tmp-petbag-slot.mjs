// 定点普查: 精灵背包里那些「没被 SymbolClass 导出、但被面板当作格子实例化」的 sprite。
// 用法: node tools/probes/tmp-petbag-slot.mjs swf/module/app/PetBagPanel.swf 1256 1286 1297
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList } from '../../game/swfshape.mjs'

const file = process.argv[2] || 'swf/module/app/PetBagPanel.swf'
const want = process.argv.slice(3).map(Number)
const raw = fs.readFileSync(file)
const sig = raw.slice(0, 3).toString()
const body = new Uint8Array(sig === 'FWS' ? raw.subarray(8) : zlib.inflateSync(raw.subarray(8)))
const swf = parseSwf(body)
const u8 = Buffer.from(body)
const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
const cstr = (p) => { let q = p; while (u8[q]) q++; return [Buffer.from(u8.slice(p, q)).toString('utf8'), q + 1] }

// SymbolClass 反查: charId → 导出名
const exportName = new Map()
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    const [nm, q] = cstr(p); p = q
    exportName.set(cid, nm)
  }
}

for (const id of want) {
  const sp = swf.sprites.get(id)
  if (!sp) { console.log(`id${id}: 不是 DefineSprite (可能是 Shape/Bitmap/Text)`); continue }
  console.log(`\n=== sprite${id} frames=${sp.frames} 导出名=${exportName.get(id) ?? '(未导出)'} ===`)
  for (let f = 0; f < sp.frames; f++) {
    const cis = frameList(swf, sp.sub, f)
    if (cis.length === 0) { console.log(`  帧${f}: (空)`); continue }
    const parts = cis.map((ci) =>
      `${ci.name ?? '?'}(d${ci.depth},id${ci.id}${exportName.get(ci.id) ? ':' + exportName.get(ci.id) : ''})`)
    console.log(`  帧${f}: ${parts.join(' ')}`)
  }
}
