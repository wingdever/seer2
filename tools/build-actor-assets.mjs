// M8 素材盘点：扫本地缓存 index.json → game/data/actor/equip/manifest.json
// 只登记“本地已有什么包 + 还缺哪些包”，**不下载、不拷贝、不二次分发**（ALQ5=A / M8-P7）。
// 缺件范围 = **全目录推导（MDB8-e3，人类 2026-10-20 手测反馈触发）**：equip-index 全部 slot 1–8 的件
//   → resourceIdOf(suit, slot) 定包名（手/脚/坐骑要 `_0`+`_1`，其余无后缀）；
//   蓝/红裸装与默认头/眼 = 仓库 `game/data/actor/*.bin`、不列期望（ALC6）。旧单口径（29 骑乘 + 10 色默认 = 108 件）已并入本推导。
// 用法: node tools/build-actor-assets.mjs [--cache=<dir>]
// 前置: node tools/build-equip-index.mjs（本工具读它的 items）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resourceIdOf, DEFAULT_COLORS, SLOT, MIRROR_TO, DEFAULT_HEAD_REF, DEFAULT_EYE_REF } from '../game/logic/map/actor-look.js'
import { parsePack } from '../game/logic/map/actor-view.js'

const argv = process.argv.slice(2)
const cacheArg = argv.find((a) => a.startsWith('--cache='))?.slice('--cache='.length)
const CACHE_ROOT = path.resolve(cacheArg || path.join(os.homedir(), '.cache/seer2-live/game-cache'))
const CACHE_LABEL = cacheArg || '~/.cache/seer2-live/game-cache'
const INDEX = path.join(CACHE_ROOT, 'index.json')
const EQUIP_INDEX = 'game/data/equip-index.json'
const OUT = 'game/data/actor/equip/manifest.json'

if (!fs.existsSync(INDEX)) {
  console.error(`找不到缓存索引: ${INDEX}\n先运行改服登录器缓存素材，或用 --cache=<dir> 指定缓存根。`)
  process.exit(1)
}
if (!fs.existsSync(EQUIP_INDEX)) {
  console.error(`找不到 ${EQUIP_INDEX}；先运行 node tools/build-equip-index.mjs`)
  process.exit(1)
}

const equipIndex = JSON.parse(fs.readFileSync(EQUIP_INDEX, 'utf8'))
const cache = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
const packs = {}
const conflicts = []

// 只看 `res/item/equip/swf/`（排除 preview/icon）；文件名 = 资源标识 + 可选 `_0/_1`。
const PACK_RE = /(?:^|\/)res\/item\/equip\/swf\/(\d{6})(_[01])?\.swf$/
for (const e of cache) {
  const rel = String(e.relPath || '')
  const m = PACK_RE.exec(rel)
  if (!m) continue
  const pack = m[1]
  const suffix = m[2] || ''
  const rec = {
    cachePath: rel,
    url: String(e.url || ''),
    size: Number(e.size) || 0,
    cachedAt: Number(e.cachedAt) || 0,
    ...parseMeta(rel),
  }
  const bucket = (packs[pack] ||= { files: {} })
  const old = bucket.files[suffix]
  if (old && old.cachePath !== rec.cachePath) {
    conflicts.push(`${pack}${suffix || '(无后缀)'}`)
    continue
  }
  bucket.files[suffix] = rec
}

const expected = new Map()   // pack → Set(suffix)
const addExpected = (pack, suffix) => {
  if (!pack) return
  if (!expected.has(pack)) expected.set(pack, new Set())
  expected.get(pack).add(suffix)
}

// ★MDB8-e3 全目录推导：items 全部 slot∈{1..8} → 包名 = resourceIdOf(suit, 基准槽)；
//   手/脚/坐骑（基准 2/6/3）要 `_0`+`_1`，其余槽无后缀；蓝/红（idx 0/6）手/身/脚与默认头/眼 = 仓库裸装 .bin ⇒ 跳过。
const NAKED_REFS = new Set([
  DEFAULT_HEAD_REF, DEFAULT_EYE_REF,
  ...[0, 6].flatMap((idx) => { const c = DEFAULT_COLORS[idx]; return [c.hand, c.body, c.foot] }),
])
const MIRROR_BASE = new Set([SLOT.HAND_R, SLOT.FOOT_R, SLOT.DOGZ_RIGHT])
for (const [idStr, it] of Object.entries(equipIndex.items || {})) {
  const id = Math.trunc(Number(idStr) || 0)
  if (NAKED_REFS.has(id)) continue
  const slot = Math.trunc(Number(it.slot) || 0)
  if (slot < 1 || slot > 8) continue
  const base = MIRROR_TO[slot] ?? slot
  const r = resourceIdOf(it.suit, slot)
  if (MIRROR_BASE.has(base)) { addExpected(r, '_0'); addExpected(r, '_1') }
  else addExpected(r, '')
}

const missing = []
for (const [pack, suffixes] of [...expected].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  for (const suffix of [...suffixes].sort()) {
    if (!packs[pack]?.files?.[suffix]) missing.push(pack + suffix)
  }
}

const out = {
  note: '本地缓存素材清单；包体不入库、只登记来源 URL/大小/帧表元数据（parsePack 字段）。由 tools/build-actor-assets.mjs 生成，勿手改',
  cacheRoot: CACHE_LABEL,
  packs: sortPacks(packs),
  missing,
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')

const fileCount = Object.values(packs).reduce((n, p) => n + Object.keys(p.files).length, 0)
console.log(`${OUT}: packs=${Object.keys(packs).length} files=${fileCount} expected=${[...expected.values()].reduce((n, s) => n + s.size, 0)} missing=${missing.length}`)
console.log(`  缓存根 = ${CACHE_ROOT}`)
for (const [pack, p] of Object.entries(out.packs)) {
  for (const [suffix, f] of Object.entries(p.files)) {
    const meta = f.parseError ? ` parseError=${f.parseError}` : ` ${f.frameW}x${f.frameH}/${f.infoCount}inf/${f.sheetW}x${f.sheetH}`
    console.log(`  ${pack}${suffix || '(无后缀)'} ${f.size}B${meta} ${f.url || f.cachePath}`)
  }
}
if (conflicts.length) console.warn(`  ⚠️ 同包同后缀命中多个路径（保留第一条）: ${[...new Set(conflicts)].join(', ')}`)
if (missing.length) console.log(`  缺件 = ${missing.join(', ')}`)

// 逐包核 parsePack：帧尺寸/unit/info 数/PNG sheet 尺寸/labels 只作清单字段；坏包记 parseError、不中断。
function parseMeta(rel) {
  try {
    const p = parsePack(fs.readFileSync(path.join(CACHE_ROOT, rel)))
    return {
      frameW: p.frameW, frameH: p.frameH, totalFrames: p.totalFrames,
      unitW: p.unitW, unitH: p.unitH, infoCount: p.frameNum,
      sheetW: p.sheetW, sheetH: p.sheetH,
      labels: p.labels,
    }
  } catch (err) {
    return { parseError: err.message }
  }
}

function sortPacks(obj) {
  const out = {}
  for (const k of Object.keys(obj).sort((a, b) => Number(a) - Number(b))) {
    const files = {}
    for (const s of Object.keys(obj[k].files).sort()) files[s] = obj[k].files[s]
    out[k] = { files }
  }
  return out
}
