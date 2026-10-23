// 列出 UI.swf 里的 DefineBinaryData(87) 与 SymbolClass(76) 映射
// 帧序列包 (小赛尔各部件) 就是这些二进制符号
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../game/swfshape.mjs'

const file = process.argv[2] || 'swf/ui/UI.swf'
const raw = fs.readFileSync(file)
const sig = raw.slice(0, 3).toString()
if (sig === 'FWS') fs.writeFileSync('/tmp/swf-plain.bin', raw)
else fs.writeFileSync('/tmp/swf-plain.bin', sig === 'CWS' ? zlib.inflateSync(raw.slice(8)) : (() => { throw new Error('未支持压缩 ' + sig) })())
const body = new Uint8Array(fs.readFileSync('/tmp/swf-plain.bin'))
const swf = parseSwf(body)
const u8 = body

const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
const cstr = (p) => { let q = p; while (u8[q]) q++; return [Buffer.from(u8.slice(p, q)).toString('utf8'), q + 1] }

const binary = []      // {charId, size}
let symbols = []
for (const t of swf.tags) {
  if (t.code === 87) {                       // DefineBinaryData: id, reserved(UI16), data
    const id = dv.getUint16(t.start, true)
    binary.push({ charId: id, size: t.len - 4 })
  }
  if (t.code === 76) {                       // SymbolClass: count, (tagId, name)*
    let p = t.start
    const n = dv.getUint16(p, true); p += 2
    for (let i = 0; i < n; i++) {
      const cid = dv.getUint16(p, true); p += 2
      const [nm, q] = cstr(p); p = q
      symbols.push({ name: nm, charId: cid })
    }
  }
}
const binMap = new Map(binary.map(b => [b.charId, b.size]))
symbols = symbols.filter(s => binMap.has(s.charId))
console.log(`DefineBinaryData=${binary.length}  SymbolClass 绑定=${symbols.length}  合计 ${(binary.reduce((a, b) => a + b.size, 0) / 1048576).toFixed(1)}MB`)
const want = /UI_BLUE|UI_RED|UI_DEFAULT|UI_GREEN|UI_YELLOW|UI_BROWN|ActorShadow|BODY|HAND|FOOT|HEAD|EYE/i
for (const s of symbols.filter(s => want.test(s.name)).sort((a, b) => a.name.localeCompare(b.name)))
  console.log(`  ${s.name.padEnd(34)} charId=${String(s.charId).padStart(4)} ${(binMap.get(s.charId) / 1024).toFixed(0)}KB`)
console.log('--- 其余(前 15) ---')
for (const s of symbols.filter(s => !want.test(s.name)).slice(0, 15))
  console.log(`  ${s.name.padEnd(34)} charId=${String(s.charId).padStart(4)} ${(binMap.get(s.charId) / 1024).toFixed(0)}KB`)
