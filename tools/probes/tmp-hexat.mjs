// 小工具: 打印某偏移处的原始字节 + 尝试按标签头解码 (定位标签流走偏的位置)
import fs from 'node:fs'
import zlib from 'node:zlib'
const [,, file, offStr] = process.argv
const buf = fs.readFileSync(file)
const sig = buf.toString('latin1', 0, 3)
const body = sig === 'FWS' ? Buffer.from(buf.subarray(8)) : Buffer.from(zlib.inflateSync(buf.subarray(8)))
const off = Number(offStr)
const bytes = Array.from(body.slice(off, off + 40)).map(x => x.toString(16).padStart(2, '0')).join(' ')
console.log('body', body.length, 'bytes@' + off + ':', bytes)
const w = body.readUInt16LE(off)
console.log('u16', w, 'code', w >> 6, 'shortLen', w & 0x3f, 'longLen', (w & 0x3f) === 0x3f ? body.readUInt32LE(off + 2) : null)
