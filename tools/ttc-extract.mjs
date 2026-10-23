// 从 TrueType Collection (.ttc) 里抽出单个字面, 重写为标准 SFNT (.ttf)。
// 动机: mxmlc 的 [Embed] 字体路径只认单字面 TTF, 而系统里的中文字体是 .ttc。
// 做法是对表目录本身做数据处理: 读第 N 个字面的表记录, 把每张表原样搬到新文件, 重建 12 字节头 + 表目录。
// 表偏移在原文件里是相对整个 .ttc 起点的, 所以直接按 (offset,length) 切片即可。
import fs from 'node:fs'

const [,, SRC = '/usr/share/fonts/wenquanyi/wqy-microhei/wqy-microhei.ttc', DST = 'game/maprunner/fonts/wqy.ttf', NUM = '0'] = process.argv
const buf = fs.readFileSync(SRC)
if (buf.toString('latin1', 0, 4) !== 'ttcf') throw new Error('not a TTC: ' + SRC)
const numFonts = buf.readUInt32BE(8)
const fontOffset = buf.readUInt32BE(12 + Number(NUM) * 4)

const rd = (o, n) => buf.readUInt16BE(o + n * 2)
const numTables = rd(fontOffset, 2)
const recs = []
for (let i = 0; i < numTables; i++) {
  const r = fontOffset + 12 + i * 16
  recs.push({ tag: buf.toString('latin1', r, r + 4), check: buf.readUInt32BE(r + 4), offset: buf.readUInt32BE(r + 8), length: buf.readUInt32BE(r + 12) })
}
recs.sort((a, b) => a.tag.localeCompare(b.tag))

const HEADER = 12
let cursor = HEADER + recs.length * 16
const chunks = []
for (const t of recs) {
  t.newOffset = cursor
  const data = buf.subarray(t.offset, t.offset + t.length)
  chunks.push(Buffer.from(data))
  cursor += data.length
  if (cursor & 3) cursor += 4 - (cursor & 3)          // 表按 4 字节对齐
}

const out = Buffer.alloc(cursor)
out.writeUInt32BE(0x00010000, 0)                       // sfntVersion = 1.0
out.writeUInt16BE(recs.length, 4)
const sr = 2 ** Math.floor(Math.log2(recs.length)) * 16
out.writeUInt16BE(sr, 6); out.writeUInt16BE(Math.log2(sr) | 0, 8); out.writeUInt16BE(recs.length * 16 - sr, 10)
recs.forEach((t, i) => {
  const r = HEADER + i * 16
  out.write(t.tag, r, r + 4, 'latin1')
  out.writeUInt32BE(t.check, r + 4)                     // 表校验和原样保留
  out.writeUInt32BE(t.newOffset, r + 8)
  out.writeUInt32BE(t.length, r + 12)
})
chunks.forEach((c, i) => c.copy(out, recs[i].newOffset))

fs.mkdirSync(DST.split('/').slice(0, -1).join('/'), { recursive: true })
fs.writeFileSync(DST, out)
const tags = recs.map(t => t.tag).join(' ')
console.log(`ttc→ttf: ${SRC} [${NUM}/${numFonts}] → ${DST}  ${out.length} 字节  表: ${tags}`)
