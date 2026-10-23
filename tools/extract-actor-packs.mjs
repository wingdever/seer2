// 从 UI.swf 抽出小赛尔各部件的"帧序列包"(DefineBinaryData), 落盘 game/data/actor/{NAME}.bin
// 包格式 (com/taomee/seer2/core/animation/frame/FrameSequence.as + FrameSheet.as):
//   u16 headLen | head: u16 frameW, u16 frameH, u16 totalFrames, u16 anchorX, u16 anchorY, AMF0 object {l,i}
//   u16 infoLen | info: u16 unitW, u16 unitH, u16 frameNum, frameNum x (keyNum,offsetX,offsetY,contentW,contentH,sheetIndex)
//   rest        | 一个内嵌 SWF, 里面是一张位图 (spritesheet)
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'
import { parseSwf } from '../game/swfshape.mjs'

const src = process.argv[2] || 'swf/ui/UI.swf'
const outDir = 'game/data/actor'
const raw = fs.readFileSync(src)
const body = new Uint8Array(raw.slice(0, 3).toString() === 'CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)

const names = new Map()          // charId -> name
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    let q = p; while (body[q]) q++
    names.set(cid, Buffer.from(body.slice(p, q)).toString('utf8')); p = q + 1
  }
}

fs.mkdirSync(outDir, { recursive: true })
for (const t of swf.tags) {
  if (t.code !== 87) continue                       // DefineBinaryData: u16 id, u16 reserved, data...
  const cid = dv.getUint16(t.start, true)
  const name = names.get(cid)
  if (!name || !/UI_(BLUE|RED|DEFAULT|ActorShadow|SurpriseMark|QuestionMark)/.test(name)) continue
  const bytes = Buffer.from(body.slice(t.start + 6, t.start + t.len))
  fs.writeFileSync(path.join(outDir, name + '.bin'), bytes)
  console.log(`${name.padEnd(20)} ${bytes.length}B  ${bytes.slice(0, 16).toString('hex')}`)
}
console.log('→ ' + outDir + '/  ' + fs.readdirSync(outDir).length + ' 个包')
