// 背包模块 (swf/module/app/ItemBagPanel.swf) 结构普查:
//  - SymbolClass(76) 绑定: 这个模块里有没有已注册的 AS 类 (有的话 UIManager 那条路或许还活着)
//  - 每个 DefineSprite 的放置实例名: 面板符号靠子对象名认 (原版全靠 getChildByName)
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, frameList } from '../../game/swfshape.mjs'

const file = process.argv[2] || 'swf/module/app/ItemBagPanel.swf'
const raw = fs.readFileSync(file)
const sig = raw.slice(0, 3).toString()
const body = new Uint8Array(sig === 'FWS' ? raw.subarray(8) : zlib.inflateSync(raw.subarray(8)))
const swf = parseSwf(body)
const u8 = Buffer.from(body)
const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
const cstr = (p) => { let q = p; while (u8[q]) q++; return [Buffer.from(u8.slice(p, q)).toString('utf8'), q + 1] }

const symbols = []
for (const t of swf.tags) {
  if (t.code !== 76) continue
  let p = t.start
  const n = dv.getUint16(p, true); p += 2
  for (let i = 0; i < n; i++) {
    const cid = dv.getUint16(p, true); p += 2
    const [nm, q] = cstr(p); p = q
    symbols.push({ name: nm, charId: cid })
  }
}
console.log(`SymbolClass 绑定 ${symbols.length} 条`)
// 默认截断到 40 条 / 14 个 sprite (ItemBagPanel 够用)；PetBagPanel 有 119 条，用环境变量放开:
//   BAG_N=200 BAG_SPRITES=46 node tools/probes/tmp-bag-dump.mjs swf/module/app/PetBagPanel.swf
for (const s of symbols.slice(0, Number(process.env.BAG_N || 40))) console.log(`  ${s.name} → id${s.charId}`)

// 每个 sprite 的顶层放置名集合 (只看 246 个 tag 里那些有命名子对象的)
const named = []
for (const [id, sp] of swf.sprites) {
  const names = []
  for (const ci of frameList(swf, sp.sub, 0)) if (ci.name) names.push(`${ci.name}(d${ci.depth},id${ci.id})`)
  if (names.length) named.push({ id, frames: sp.frames, names })
}
console.log(`\n有命名子对象的 sprite: ${named.length} / ${swf.sprites.size}`)
// 只打印子对象最多的前 14 个 —— 面板本体一定在这些里
named.sort((a, b) => b.names.length - a.names.length)
for (const s of named.slice(0, Number(process.env.BAG_SPRITES || 14))) {
  console.log(`\nsprite${s.id} frames=${s.frames} 子对象${s.names.length}:`)
  console.log('  ' + s.names.join(' '))
}
