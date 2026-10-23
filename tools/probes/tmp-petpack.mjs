// 探针: res/pet/normal/{id}.swf 是否就是角色那套帧序列包格式, 动作标签有哪些
import fs from 'node:fs'

for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f)
  const headLen = b.readUInt16BE(0)
  const frameW = b.readUInt16BE(2), frameH = b.readUInt16BE(4), total = b.readUInt16BE(6)
  const anchorX = b.readUInt16BE(8), anchorY = b.readUInt16BE(10)
  const head = b.subarray(10, headLen).toString('latin1')
  const strs = (head.match(/[ -~]{3,}/g) || []).filter(s => /^[ -~]+$/.test(s))
  const infoAt = 10 + headLen
  const infoLen = b.readUInt16BE(infoAt)
  const unitW = b.readUInt16BE(infoAt + 2), unitH = b.readUInt16BE(infoAt + 4), fn = b.readUInt16BE(infoAt + 6)
  console.log(`${f} ${b.length}B head=${headLen} frame=${frameW}x${frameH} total=${total} anchor=${anchorX},${anchorY} info=${infoLen} unit=${unitW}x${unitH} frames=${fn} sheetAt=${infoAt + 2 + infoLen}`)
  console.log('  strings:', strs.join(' | '))
  const tail = b.subarray(infoAt + 2 + infoLen, infoAt + 2 + infoLen + 4)
  console.log('  sheet sig:', Buffer.from(tail).toString('hex'))
}
