// 原始标签转储: 用于校验 game/swfshape.mjs 的 PlaceObject* / DefineShape* 位布局
import fs from 'node:fs'
import zlib from 'node:zlib'

const f = process.argv[2]
const NAME = { 0: 'End', 1: 'ShowFrame', 2: 'DefineShape', 4: 'PlaceObject', 9: 'SetBackground', 21: 'DefineShape2', 26: 'PlaceObject2', 28: 'RemoveObject', 32: 'DefineShape3', 34: 'RemoveObject2', 35: 'SetBackgroundColor', 36: 'DefineFont2', 37: 'DefineText', 38: 'DefineFont2?', 39: 'DefineSprite', 43: 'FrameLabel', 45: 'SoundStreamHead', 46: 'SoundStreamBlock', 56: 'DefineScenes', 57: 'DefineText2', 58: 'DefineSound', 59: 'StartSound', 64: 'DefineFont3', 66: 'SetDigitalSignature', 69: 'FileAttributes', 70: 'PlaceObject3', 71: 'DefineFont4', 73: 'DefineMorphShape2', 74: 'DefineBinaryData', 75: 'DefineFontName', 76: 'SoundDecoderHead', 77: 'SetLicense', 78: 'ClearSound', 79: 'DefineCompression? ', 80: 'DefineSprite2?', 82: 'DoABC', 83: 'DefineShape4', 84: 'DefineBinaryData', 85: 'JPEGXREOFX', 86: 'FileAttributes', 87: 'SetExported? ', 88: 'EnableDebugger', 91: 'DoInitABC', 92: 'DefineFont4', 93: 'SetTabIndex', 95: 'VideoSync? ', 96: 'DoABC2', 97: 'DoABC3', 99: 'MorphShape2' }
const buf = fs.readFileSync(f)
const sig = buf.toString('latin1', 0, 3)
const body = sig === 'FWS' ? Buffer.from(buf.subarray(8)) : Buffer.from(zlib.inflateSync(buf.subarray(8)))
const hex = (a, b) => Array.from(body.slice(a, Math.min(b, a + 64))).map(x => x.toString(16).padStart(2, '0')).join(' ')
let bit = 0
const bits = k => { let v = 0; for (let i = 0; i < k; i++) { v = (v << 1) | ((body[bit >> 3] >> (7 - (bit & 7))) & 1); bit++ } return v }
const nb = bits(5)
for (let i = 0; i < 4; i++) bits(nb)
bit = Math.ceil(bit / 8) * 8
let p = bit / 8
console.log(f, sig, 'body', body.length, 'frameRate', body.readUInt16LE(p) / 256, 'frames', body.readUInt16LE(p + 2))
p += 4
let idx = 0
while (p + 2 <= body.length) {
  const code = body.readUInt16LE(p) >> 6
  let len = body.readUInt16LE(p) & 0x3f
  p += 2
  if (len === 0x3f) { len = body.readUInt32LE(p); p += 4 }
  const id = len >= 2 ? body.readUInt16LE(p) : 0
  const extra = code === 39 ? ` frames=${body.readUInt16LE(p + 2)}` : ''
  console.log(`#${idx++} ${code} ${NAME[code] || '?'} len=${len} id=${id}${extra} @${p}`)
  if (code === 70 || code === 26 || code === 4) console.log('    ', hex(p, len))
  if (code === 83 || code === 32) console.log('    S', hex(p, Math.min(len, 40)))
  p += len
  if (code === 0) break
}
