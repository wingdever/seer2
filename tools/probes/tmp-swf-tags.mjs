// 一次性: 列 SWF 的 tag 流 (码/长度/起止), 重点看定义段之后还有哪些控制 tag
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf } from '../../game/swfshape.mjs'
const raw = fs.readFileSync(process.argv[2])
const body = new Uint8Array(raw.slice(0,3).toString()==='CWS' ? zlib.inflateSync(raw.slice(8)) : raw)
const swf = parseSwf(body)
const DEF = new Set([2,20,21,26,35,36,39,40,41,45,46,48,56,57,58,59,60,62,63,69,71,72,73,74,75,76,82,83,84,86,87,88,91,93])
const cnt = new Map()
let lastDef = -1
swf.tags.forEach((t,i) => { cnt.set(t.code,(cnt.get(t.code)||0)+1); if (DEF.has(t.code)) lastDef = i })
console.log('帧率', swf.frameRate, '尺寸', swf.width+'x'+swf.height, '总tag', swf.tags.length, '帧数?', swf.numFrames)
console.log('tag 码统计:', [...cnt.entries()].sort((a,b)=>a[0]-b[0]).map(([c,n])=>c+'×'+n).join(' '))
console.log('最后一个定义tag 下标', lastDef, '码', swf.tags[lastDef].code)
console.log('之后的控制 tag:')
for (const t of swf.tags.slice(lastDef)) console.log('  code=' + t.code + ' len=' + (t.end - t.start) + ' @' + t.start)
