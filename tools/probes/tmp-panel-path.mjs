// 沿原版代码的访问路径逐层列出命名子对象, 用来确认 HudRunner 里 getChildByName 的链路是否成立。
//   node tools/probes/tmp-panel-path.mjs UI_MapTitle title mapTitleTxt
import fs from 'node:fs'
import { parseSwf, frameList } from '../../game/swfshape.mjs'

const raw = fs.readFileSync('swf/ui/UI_hud.swf')
const body = new Uint8Array(raw.subarray(8))
const swf = parseSwf(body)
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)

const ids = new Map()
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    let q = p; while (body[q]) q++
    ids.set(Buffer.from(body.slice(p, q)).toString('utf8'), cid); p = q + 1
  }
}

const [, , sym, ...path] = process.argv
let cur = { name: sym, cid: ids.get(sym) }
while (true) {
  const sp = swf.sprites.get(cur.cid)
  if (!sp) { console.log(`  ${cur.name} #${cur.cid}: 不是 DefineSprite (形状/位图/按钮)`); break }
  const kids = frameList(swf, sp.sub, 0).filter(r => r.name)
  console.log(`  ${cur.name} #${cur.cid} ${sp.frames}帧 → ` + (kids.map(k => `${k.name}#${k.id}`).join(' ') || '无'))
  const next = path.shift()
  if (!next) break
  const hit = kids.find(k => k.name === next)
  if (!hit) { console.log('    ✗ 没有 ' + next); break }
  cur = { name: next, cid: hit.id }
}
