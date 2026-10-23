// M8 素材定向拉取（人类 2026-10-20 拍板 B，政策 = docs/map/map-actor-look.md §5.5 通道一）：
// 按 `manifest.json` 的 missing 采集单（或 --ids 点名）逐件从改服 CDN 拉包，
// 落进启动器缓存根 + 同步登记 index.json（hash=md5(url)，与 core-net `_urlHash` 同式 ⇒ 启动器见键即命中）。
// 有界纪律（对齐 docs/legacy/petbag-handoff.md §爬取口径）：串行、间隔默认 150ms、显式预算、仅本地研究、不二次分发、不做无边界 ID 扫描。
// 用法: node tools/fetch-actor-packs.mjs [--dry] [--ids=100204,900005_0,...] [--limit=N] [--sleep=150] [--cache=<dir>] [--force]
//       node tools/fetch-actor-packs.mjs --icons [--ids=100102,...] [--limit=N] [--sleep=120] [--force]
// 拉完对账: node tools/build-actor-assets.mjs（missing 应变小、新包带 url/帧字段；期望全目录 = MDB8-e3，未采集记 pack-missing.json）；--icons 对账 = game/data/actor/equip/icon-missing.json
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { parsePack } from '../game/logic/map/actor-view.js'

const argv = process.argv.slice(2)
const opt = (name, dflt) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(`--${name}=`.length) ?? dflt
const flag = (name) => argv.includes(`--${name}`)
const CACHE_ROOT = path.resolve(opt('cache', path.join(os.homedir(), '.cache/seer2-live/game-cache')))
const MANIFEST = 'game/data/actor/equip/manifest.json'
const SLEEP = Math.max(50, Number(opt('sleep', 150)) || 150)
const LIMIT = Number(opt('limit', 0)) || 0
const FALLBACK_BASE = 'http://seer2.61.com/res/item/equip/swf/'
const NAME_RE = /^\d{6}(_[01])?$/
const TIMEOUT_MS = 15000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (flag('help') || argv.includes('-h')) {
  console.log('用法: node tools/fetch-actor-packs.mjs [--dry] [--ids=a,b] [--limit=N] [--sleep=150] [--cache=DIR] [--force]')
  console.log('  默认拉取 manifest.missing 全量；--dry 只试探第一件、不落盘；--ids 点名（格式 123456 或 123456_0/_1）')
  console.log('  --icons = 图标采集单（equip-index slot 1–8 全件 ⇒ swf/item/equip/icon/，未采集记 icon-missing.json）')
  process.exit(0)
}

if (!fs.existsSync(MANIFEST)) {
  console.error(`找不到 ${MANIFEST}；先跑 node tools/build-actor-assets.mjs`)
  process.exit(1)
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))

// 从已缓存包取 url 模板（域名/前缀随线路变，模板比硬编码可信）；取不到 ⇒ FALLBACK。
function packUrlBase() {
  for (const p of Object.values(manifest.packs || {})) {
    for (const f of Object.values(p.files || {})) {
      const m = /^(.*\/)[^/]+\.swf$/.exec(f.url || '')
      if (m) return m[1]
    }
  }
  return FALLBACK_BASE
}

// ── --icons 模式（PI-g · 图标采集单，`map-actor-look §5.5`）：
//    目标 = equip-index 全部 slot∈{1..8} 的 id（点名清单、无 ID 扫描）；
//    源 = res/item/equip/icon/<id>.swf（标准 CWS，Ruffle 原生可播）；落 = 仓库镜像 swf/item/equip/icon/（item-art 路由逐字对上）。
//    404/坏格式 ⇒ 记「未采集」到 game/data/actor/equip/icon-missing.json（UI 退色块自陈，不伪造）。
if (flag('icons')) {
  const EQUIP_INDEX = 'game/data/equip-index.json'
  const DEST_DIR = 'swf/item/equip/icon'
  const MISS_OUT = 'game/data/actor/equip/icon-missing.json'
  if (!fs.existsSync(EQUIP_INDEX)) { console.error(`找不到 ${EQUIP_INDEX}`); process.exit(1) }
  const idx = JSON.parse(fs.readFileSync(EQUIP_INDEX, 'utf8'))
  let ids = opt('ids', '')
    ? String(opt('ids')).split(',').map((s) => s.trim()).filter(Boolean)
    : Object.entries(idx.items).filter(([, it]) => it.slot >= 1 && it.slot <= 8).map(([id]) => id).sort((a, b) => Number(a) - Number(b))
  for (const t of ids) if (!/^\d{6}$/.test(t)) { console.error(`非法图标 id（须 6 位数字）: ${t}`); process.exit(1) }
  if (LIMIT > 0 && LIMIT < ids.length) ids = ids.slice(0, LIMIT)
  const iconBase = packUrlBase().replace(/equip\/swf\/$/, 'equip/icon/')
  console.log(`[icons] 基址=${iconBase} 目标=${ids.length} 件 落点=${DEST_DIR}/`)
  fs.mkdirSync(DEST_DIR, { recursive: true })
  const missing = []
  let got = 0, skipped = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    const dest = path.join(DEST_DIR, `${id}.swf`)
    if (!flag('force') && fs.existsSync(dest)) { skipped++; continue }
    try {
      const res = await fetch(`${iconBase}${id}.swf`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) { missing.push({ id, reason: `HTTP ${res.status}` }); await sleep(SLEEP); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const magic = buf.subarray(0, 3).toString('latin1')
      if (buf.length < 12 || !['FWS', 'CWS', 'ZWS'].includes(magic)) { missing.push({ id, reason: 'bad-format' }); await sleep(SLEEP); continue }
      fs.writeFileSync(dest, buf)
      got++
    } catch (e) {
      missing.push({ id, reason: String(e.message || e) })
    }
    if ((i + 1) % 200 === 0) console.log(`  … ${i + 1}/${ids.length}（新落 ${got}，未采集 ${missing.length}）`)
    await sleep(SLEEP)
  }
  fs.writeFileSync(MISS_OUT, JSON.stringify({ note: '装备图标未采集清单（404/坏格式）。由 tools/fetch-actor-packs.mjs --icons 生成，勿手改', iconBase, dest: DEST_DIR, at: new Date().toISOString(), missing }, null, 2) + '\n')
  console.log(`[icons] 完成: 新落=${got} 已存在跳过=${skipped} 未采集=${missing.length} ⇒ 登记 ${MISS_OUT}`)
  if (missing.length) console.log('  未采集样例:', missing.slice(0, 12).map((f) => `${f.id}(${f.reason})`).join(', '))
  process.exit(0)
}

// 目标清单：--ids 点名 > manifest.missing 全量
let targets
if (opt('ids', '')) {
  targets = String(opt('ids')).split(',').map((s) => s.trim()).filter(Boolean)
} else {
  targets = (manifest.missing || []).map(String)
}
for (const t of targets) {
  if (!NAME_RE.test(t)) { console.error(`非法包名（须 6 位数字 [+ _0/_1]）: ${t}`); process.exit(1) }
}
if (LIMIT > 0 && LIMIT < targets.length) targets = targets.slice(0, LIMIT)

// URL 基址：优先 --base，否则取任一已缓存包的 url 模板
const base = opt('base', '') || packUrlBase()
console.log(`[fetch] 基址=${base} 目标=${targets.length} 件 缓存根=${CACHE_ROOT} dry=${flag('dry')}`)

const INDEX = path.join(CACHE_ROOT, 'index.json')
const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : []
const byHash = new Map(index.map((e) => [e.hash, e]))
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')

// 校验包体：真校验 = 仓库自己的 `parsePack`（与运行时同码，坏包/HTML 错误页必抛）；
// 族头首字节不可粗筛（实测有 `00 4c`/`00 4b` 两族，见 138403）。
function looksLikePack(buf) {
  if (!buf || buf.length < 16) return false
  try {
    parsePack(buf)
    return true
  } catch {
    return false
  }
}

let ok = 0, skipped = 0, failed = 0
const failures = []
const PACK_MISS_OUT = 'game/data/actor/equip/pack-missing.json'

for (const name of targets) {
  const url = `${base}${name}.swf`
  const hash = md5(url)
  const relPath = url.replace(/^(\w+):\/\//, '$1_')
  const disk = path.join(CACHE_ROOT, relPath)
  if (!flag('force') && byHash.has(hash) && fs.existsSync(disk)) {
    console.log(`  ⏭ ${name} 已在缓存（跳过）`)
    skipped++
    continue
  }
  let buf
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    buf = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.log(`  ✗ ${name} 拉取失败: ${e.message}`)
    failures.push({ name, reason: e.message })
    failed++
    if (flag('dry')) break
    continue
  }
  if (!looksLikePack(buf)) {
    console.log(`  ✗ ${name} 不像包（${buf.length}B，族头/解析不符）`)
    failures.push({ name, reason: 'bad-format' })
    failed++
    if (flag('dry')) break
    continue
  }
  console.log(`  ✓ ${name} ${buf.length}B${flag('dry') ? '（dry：不落盘）' : ''}`)
  ok++
  if (flag('dry')) break
  fs.mkdirSync(path.dirname(disk), { recursive: true })
  fs.writeFileSync(disk, buf)
  const rec = { hash, name: `${name}.swf`, relPath, url, ext: 'swf', diskName: relPath, size: buf.length, cachedAt: Date.now(), hitCount: 0 }
  if (byHash.has(hash)) index.splice(index.findIndex((e) => e.hash === hash), 1, rec)
  else index.push(rec)
  byHash.set(hash, rec)
  await sleep(SLEEP)
}

if (!flag('dry') && ok > 0) {
  fs.writeFileSync(INDEX, JSON.stringify(index, null, 2))
  console.log(`[fetch] index.json 已登记 ${ok} 条（现共 ${index.length} 条）`)
}
// 未采集登记（MDB8-e3，同 --icons 的 icon-missing.json 口径）：全量跑才写，--ids/--dry 局部操作不动台账。
if (!flag('dry') && !opt('ids', '')) {
  fs.writeFileSync(PACK_MISS_OUT, JSON.stringify({ note: '角色包未采集清单（404/坏包，采集单 = manifest 期望全目录）。由 tools/fetch-actor-packs.mjs 生成，勿手改', base, at: new Date().toISOString(), missing: failures }, null, 2) + '\n')
  console.log(`[fetch] 未采集 ${failures.length} 件 ⇒ 登记 ${PACK_MISS_OUT}`)
}
console.log(`[fetch] 完成: 成功=${ok} 跳过=${skipped} 失败=${failed}`)
if (failures.length) console.log('  失败清单（登记“未采集”用）:', failures.map((f) => `${f.name}(${f.reason})`).join(', '))
if (!flag('dry') && ok > 0) console.log('下一步: node tools/build-actor-assets.mjs 重生成 manifest ⇒ 浏览器重开游戏生效')
