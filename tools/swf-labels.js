// Minimal SWF parser: decompresses CWS/FWS, walks tags, and reports frame
// labels + frame rate for the root timeline and every DefineSprite.
import { readFileSync } from 'node:fs'
import zlib from 'node:zlib'

function loadSwf(buf) {
  const sig = buf.toString('latin1', 0, 3)
  let body
  if (sig === 'CWS') body = zlib.inflateSync(buf.subarray(8))
  else if (sig === 'FWS' || sig === 'WS') body = buf.subarray(8)
  else if (sig === 'ZWS') throw new Error('LZMA SWF unsupported')
  else throw new Error('bad signature ' + sig)
  return { version: buf[3], data: body }
}

class Reader {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos }
  u8() { return this.b[this.p++] }
  u16() { const v = this.b.readUInt16LE(this.p); this.p += 2; return v }
  u32() { const v = this.b.readUInt32LE(this.p); this.p += 4; return v }
  str() { let s = ''; while (this.b[this.p]) s += String.fromCharCode(this.b[this.p++]); this.p++; return s }
  rect() {
    const start = (this.p * 8) % 8 === 0 ? this.p * 8 : 0
    const bits = new BitReader(this.b, this.p)
    const n = bits.read(5)
    bits.read(n * 4)
    this.p = Math.ceil(bits.bitPos / 8)
    return n
  }
}

class BitReader {
  constructor(buf, bytePos) { this.b = buf; this.bitPos = bytePos * 8 }
  read(n) {
    let v = 0
    for (let i = 0; i < n; i++) {
      const byte = this.b[this.bitPos >> 3]
      v = (v << 1) | ((byte >> (7 - (this.bitPos & 7))) & 1)
      this.bitPos++
    }
    return v >>> 0
  }
}

function readRect(r) {
  const bits = new BitReader(r.b, r.p)
  const n = bits.read(5)
  const xmin = bits.read(n), xmax = bits.read(n), ymin = bits.read(n), ymax = bits.read(n)
  r.p = Math.ceil(bits.bitPos / 8)
  return { xmin, xmax, ymin, ymax }
}

const TAG = {
  1: 'ShowFrame', 39: 'DefineSprite', 43: 'FrameLabel', 106: 'FrameLabel4',
  69: 'FileAttributes', 82: 'DoABC2', 0: 'End',
}

function walkTags(r, endTag, depth) {
  // returns { labels: [{frame,name}], spriteFrameCounts, sawAction }
  const out = { labels: [], sprites: [], frameCount: 0, hasABC: false }
  for (;;) {
    const code = r.u16()
    let len = code >> 6
    const id = code & 0x3f
    if (len === 63) len = r.u32()
    if (id === 0 && len === 0) return out
    const tagStart = r.p
    if (id === 69) { r.p = tagStart; const f = r.u8(); out.as3 = !!(f & 8) }
    if (id === 82 || id === 72) out.hasABC = true
    if (id === 1) out.frameCount++
    if (id === 43) {
      const frame = r.u16(); const name = r.str()
      out.labels.push({ frame, name })
    }
    if (id === 106) {
      const frame = r.u16(); const name = r.str()
      out.labels.push({ frame, name })
    }
    if (id === 39) {
      const spriteId = r.u16(); const fc = r.u16()
      const nested = walkTags(r, true, depth + 1)
      out.sprites.push({ spriteId, frameCount: fc, ...nested })
    }
    r.p = tagStart + len
  }
}

export function parseSwfLabels(file) {
  const buf = readFileSync(file)
  const { version, data } = loadSwf(buf)
  const r = new Reader(data)
  readRect(r) // frame size
  const fps = r.u16() / 256
  const frameCount = r.u16()
  const root = walkTags(r, false, 0)
  return { version, fps, frameCount, root }
}

function summarize(s, path = 'root') {
  const lines = []
  if (s.labels.length) lines.push(`${path} fps-framecount: frames=${s.frameCount} labels=` + JSON.stringify(s.labels))
  for (const sp of s.sprites) lines.push(...summarize(sp, `${path}>${sp.spriteId}(fc=${sp.frameCount})`))
  return lines
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  for (const f of process.argv.slice(2)) {
    const info = parseSwfLabels(f)
    console.log('=== ' + f, 'version', info.version, 'fps', info.fps, 'rootFrames', info.frameCount, 'as3', info.root.as3, 'abc', info.root.hasABC)
    // only print sprites that have labels
    const q = info.root.sprites.map(s => ({ ...s, path: 'sprite:' + s.spriteId }))
    console.log(summarize({ labels: info.root.labels, sprites: [], frameCount: info.frameCount }).join('\n'))
    const stack = [...info.root.sprites]
    while (stack.length) {
      const s = stack.shift()
      if (s.labels.length) console.log(JSON.stringify({ sprite: s.spriteId, frames: s.frameCount, labels: s.labels }))
      stack.push(...(s.sprites || []))
    }
  }
}
