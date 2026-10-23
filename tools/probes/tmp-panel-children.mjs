// 检查注入后能否拿到面板内部的命名子对象 (原版代码就是按这些名字访问的):
// ActorAvatarPanel 用 actor/nameTxt/levelTxt/xingzuanTxt/conisTxt, ToolBar 用 mapBtn/petBag/chatInput…
//   node tools/probes/tmp-panel-children.mjs
import fs from 'node:fs'
import { parseSwf, frameList } from '../../game/swfshape.mjs'

const raw = fs.readFileSync('swf/ui/UI_hud.swf')
const body = new Uint8Array(raw.subarray(8))                 // FWS 不压缩, 直接跳 8 字节头
const swf = parseSwf(body)
const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)

// 面板符号 id
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
for (const name of ['UI_ActorAvatar_Panel', 'UI_ToolBarUI', 'UI_PetAvatar_Panel', 'UI_MapTitle', 'UI_Toolbar_Minor', 'PetAvstarPetItem']) {
  const cid = ids.get(name)
  const sp = swf.sprites.get(cid)
  if (!sp) { console.log(`${name} #${cid}: 没有 DefineSprite 定义`); continue }
  const kids = frameList(swf, sp.sub, 0).filter(r => r.name)
  console.log(`${name} #${cid} 内部 ${sp.frames} 帧, 命名子对象 ${kids.length}: ` + kids.map(k => k.name).join(' '))
}
