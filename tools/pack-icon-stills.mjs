// 图标兜底静图：官服图标 404、但**部件包已缓存**的装备件 ⇒ 从包里的内嵌 PNG spritesheet 裁一帧，
// 落成 `png/item/equip/icon/{id}.png` = `game/app/view/item-art.js` 四级兜底的**第①级**（运行时零改动即亮起）。
// ⚠️ 裁出来的是**部件美术**（穿在角色身上的那件），不是官服图标原画（那两个目录是真 404、无从补抓）。
// 产物**不入库**（`.gitignore` 的 `/png/*` 支）⇒ 新克隆要重跑本工具。
// 用法: node tools/pack-icon-stills.mjs [--cache=<dir>] [--ids=100106,100107]
// 前置: node tools/build-equip-index.mjs + node tools/fetch-actor-packs.mjs + node tools/build-actor-assets.mjs
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PNG } from 'pngjs'
import { packRefOf, COLOR_ITEM_IDS, isEmptySuitItem } from '../game/logic/map/actor-look.js'
import { parsePack, pickFrame, frameRect, labelStartFrame } from '../game/logic/map/actor-view.js'

const argv = process.argv.slice(2)
const argOf = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const CACHE_ROOT = path.resolve(argOf('cache') || path.join(os.homedir(), '.cache/seer2-live/game-cache'))
const ONLY = (argOf('ids') || '').split(',').map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number)
const OUT_DIR = 'png/item/equip/icon'
const SIDE = 120   // 与 tools/swf2svg.mjs --png=2 的产物同尺寸（60×60 舞台 @2x）
const PAD = 8      // 居中留边，格子 44 CSS px 里不至于顶满
const MAX_SCALE = 8

const PANEL_SLOTS = new Set([1, 2, 3, 5, 6, 7, 8])   // 玩家面七组（槽 4 身体、槽 9/10/11 镜像本就不列）

const equipIndex = JSON.parse(fs.readFileSync('game/data/equip-index.json', 'utf8'))
const manifest = JSON.parse(fs.readFileSync('game/data/actor/equip/manifest.json', 'utf8'))
const iconMissing = JSON.parse(fs.readFileSync('game/data/actor/equip/icon-missing.json', 'utf8'))

// 候选 = 图标缺件 ∩ 玩家面可见 ∩ 部件包已缓存（`--ids` 显式指定时只按包在不在筛）。
const wantIds = new Set(ONLY.length ? ONLY.map(String) : iconMissing.missing.map((m) => String(m.id)))
const picks = []
for (const [idStr, it] of Object.entries(equipIndex.items || {})) {
  if (!wantIds.has(idStr)) continue
  const slot = Math.trunc(Number(it.slot) || 0)
  if (!ONLY.length && !(PANEL_SLOTS.has(slot) && !COLOR_ITEM_IDS.has(Math.trunc(Number(idStr))) && !isEmptySuitItem(it))) continue
  const { pack, suffix } = packRefOf(it)
  const rec = manifest.packs?.[pack]?.files?.[suffix]
  if (!rec?.cachePath) { console.log(`  跳过 ${idStr} ${it.name}：部件包未缓存（${pack}${suffix || ' '}）`); continue }
  picks.push({ id: Math.trunc(Number(idStr)), name: it.name, pack, suffix, cachePath: rec.cachePath })
}
picks.sort((a, b) => a.id - b.id)

fs.mkdirSync(OUT_DIR, { recursive: true })
let written = 0, skipped = 0, failed = 0
for (const p of picks) {
  const outPath = path.join(OUT_DIR, `${p.id}.png`)
  try {
    if (fs.existsSync(outPath)) {
      const link = fs.lstatSync(outPath).isSymbolicLink()
      // ⚠️ 绝不写穿软链（`tools/swf2svg.mjs` 事故登记：一次写穿毁了 `Resources/Items/1.png`）
      console.log(`  已存在，不动 ${p.id} ${p.name}${link ? ' ⚠️ 目标是指向别处的软链，拒绝覆盖' : ''}`)
      skipped++
      continue
    }
    const pack = parsePack(new Uint8Array(fs.readFileSync(path.join(CACHE_ROOT, p.cachePath))))
    const frame = labelStartFrame(pack, 'standDown')
    const rec = pickFrame(pack, frame)
    if (!rec || rec.w <= 1 || rec.h <= 1) throw new Error(`裁帧为空（frame=${frame} ${rec ? rec.w + 'x' + rec.h : '无记录'}）`)
    const r = frameRect(pack, rec)
    const sheet = PNG.sync.read(Buffer.from(pack.png))
    if (r.sx + r.sw > sheet.width || r.sy + r.sh > sheet.height) throw new Error(`裁框越界 ${JSON.stringify(r)} sheet=${sheet.width}x${sheet.height}`)
    const scale = Math.min(MAX_SCALE, (SIDE - PAD) / Math.max(r.sw, r.sh))   // 一律放大到「最长边 ≈ 112」，五件在格子里视觉同大
    const dw = Math.round(r.sw * scale), dh = Math.round(r.sh * scale)
    const img = new PNG({ width: SIDE, height: SIDE })   // 全 0 = 透明黑；RGBA
    const ox = Math.floor((SIDE - dw) / 2), oy = Math.floor((SIDE - dh) / 2)
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(r.sh - 1, Math.floor(y / scale))
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(r.sw - 1, Math.floor(x / scale))
        const si = ((r.sy + sy) * sheet.width + (r.sx + sx)) << 2
        const a = sheet.data[si + 3]
        if (a === 0) continue
        const di = ((oy + y) * SIDE + (ox + x)) << 2
        img.data[di] = sheet.data[si]; img.data[di + 1] = sheet.data[si + 1]
        img.data[di + 2] = sheet.data[si + 2]; img.data[di + 3] = a
      }
    }
    fs.writeFileSync(outPath, PNG.sync.write(img))
    written++
    console.log(`  ${p.id} ${p.name} 包=${p.pack}${p.suffix || ' '} 裁 ${r.sw}x${r.sh} ×${scale.toFixed(2)} => ${dw}x${dh} 居中贴 ${SIDE}x${SIDE} ⇒ ${outPath}`)
  } catch (err) {
    failed++
    console.warn(`  失败 ${p.id} ${p.name}：${err.message}`)
  }
}
console.log(`${OUT_DIR}: 候选=${picks.length} 写=${written} 跳过=${skipped} 失败=${failed}`)
console.log(`  缓存根 = ${CACHE_ROOT}`)
