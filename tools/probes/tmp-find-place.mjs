// 找真实的 PlaceObject2(26)/PlaceObject3(70) 记录, 确定 taomee 导出文件的字节布局 ——
// 注入器要按实测布局写, UI.swf 根时间轴没有放置对象可抄, 得进 DefineSprite 里找。
// 头部/标签流解析直接复用 game/swfshape.mjs (已在地图与角色包上验证过)。
//   node tools/probes/tmp-find-place.mjs [swf路径]
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'

const file = process.argv[2] || 'swf/ui/UI.swf'
const raw = fs.readFileSync(file)
const body = new Uint8Array(raw.slice(0, 3).toString() === 'CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)

const dump = (t, path) => {
  const n = Math.min(t.len, 44)
  console.log(`${path} tag${t.code} len=${t.len} @${t.start}`)
  console.log('   ' + [...body.slice(t.start, t.start + n)].map(b => b.toString(16).padStart(2, '0')).join(' '))
  console.log('   ' + [...body.slice(t.start, t.start + n)].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join(''))
}
console.log(`stage ${swf.widthPx}x${swf.heightPx} 帧率 ${swf.frameRate} 帧数 ${swf.frameCount} 根标签 ${swf.tags.length}`)
console.log('根标签种类: ' + [...new Set(swf.tags.map(t => t.code))].sort((a, b) => a - b).join(','))
let found = 0
for (const t of swf.tags) if (t.code === 26 || t.code === 70) if (found++ < 5) dump(t, 'root')
for (const [id, sp] of swf.sprites) {
  const hits = sp.sub.filter(t => t.code === 26 || t.code === 70)
  if (!hits.length) continue
  for (const t of hits) if (found++ < 12) dump(t, `sp#${id}(${sp.frames}帧)`)
}
console.log('放置对象记录共打印 ' + found + ' 条')
