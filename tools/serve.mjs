// 开发用本地服务：静态文件 + 存档写端点（Save 线「落点」那一半）
//
// 跑法：node tools/serve.mjs [--port=8090] [--host=127.0.0.1] [--root=<dir>] [--cache=<dir>]
//       （不带参数 = 仓库根 + 127.0.0.1:8090，与 README 里 darkhttpd 那条同址）
//
// 路由：
//   GET/HEAD  /                  → 302 → /game/index.html（省得记路径）
//   GET/HEAD  /<任意静态文件>     → 仓库根直服（含 /node_modules/**，浏览器 import map 要它）
//   GET/HEAD  /game-cache/<rel>  → 改服缓存根只读（M8 装备包；禁 .. 逃逸、不列目录、不存在=404）
//   GET/HEAD  /saves/            → 目录清单（看档生成没生成）
//   GET/HEAD  /saves/<name>.xml  → 存档读；不存在 = 404（fsStorage 把 404 读成「无档」，不是错误）
//   PUT       /saves/<name>.xml  → 存档写（原样字节落 <root>/saves/，不加 BOM、不加末尾换行）
//   DELETE    /saves/<name>.xml  → 存档删（不存在也算成功）
//
// 真值：docs/save/save-impl.md §6/§6.1（落点与写端点）· docs/save/save-code-map.md §2.1（Storage 接口）·
//       docs/map/map-impl.md §3.10.1（M8 缓存只读路由）
//
// 为什么不用 darkhttpd：
//   ① 它**只读** ⇒ 落不了 saves/（这正是本节存在的理由）；
//   ② 它不发 Cache-Control ⇒ 浏览器启发式缓存 ⇒ 那个「载入中… + 黑屏」（docs/arch-code.md §7.1）。
//   本服务对**一切**响应加 `Cache-Control: no-store` ⇒ 改完 JS/CSS 刷新即生效，不必再靠硬刷新。
//
// 安全（只给本机开发用）：静态侧禁 `..` 逃逸；写侧**只认** `/saves/<name>.xml` 一层，
//   名字限 `[A-Za-z0-9._-]+`（⇒ 不会悄悄造出 `saves/saves/` 这种嵌套目录）；
//   `/game-cache/` 只 GET/HEAD、只服文件、不列目录、路径必须仍在缓存根内。

import http from 'node:http'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ─────────────────────────── 参数 ───────────────────────────

const argv = process.argv.slice(2)
const opt = (name, def) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`))
  if (i === -1) return def
  const hit = argv[i]
  const eq = hit.indexOf('=')
  return eq === -1 ? (argv[i + 1] ?? def) : hit.slice(eq + 1)
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log('用法: node tools/serve.mjs [--port=8090] [--host=127.0.0.1] [--root=<dir>] [--cache=<dir>]\n' +
    '  静态服务 = 仓库根；写端点 = /saves/<name>.xml（见 docs/save/save-impl.md §6.1）\n' +
    '  /game-cache/ = 改服缓存根只读（缺省 ~/.cache/seer2-live/game-cache；M8 装备包）')
  process.exit(0)
}

const ROOT = path.resolve(opt('root', path.resolve(fileURLToPath(import.meta.url), '..', '..')))
const CACHE_ROOT = path.resolve(opt('cache', path.join(os.homedir(), '.cache/seer2-live/game-cache')))
const HOST = String(opt('host', '127.0.0.1'))
const PORT = Number.parseInt(opt('port', '8090'), 10)

const TXT = 'text/plain; charset=utf-8'
const MAX_BODY = 4 * 1024 * 1024 // 存档几十 KB 量级；4 MB 是防跑飞的上限
const SAVE_RE = /^\/saves\/([A-Za-z0-9._-]+\.xml)$/

// ─────────────────────────── 小工具 ───────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'text/xml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',   // 暴击贴图配置 Resources/Data/Battle/critical_effect.csv（DB-C）
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.swf': 'application/x-shockwave-flash',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.webm': 'video/webm', '.mp4': 'video/mp4',
}
const mimeOf = (f) => MIME[path.extname(f).toLowerCase()] ?? 'application/octet-stream'

const statOrNull = async (p) => { try { return await fsp.stat(p) } catch { return null } }

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function respond(req, res, status, headers, body, started) {
  const h = { 'Cache-Control': 'no-store', ...headers } // ← 本服务与 darkhttpd 的关键差别（§7.1）
  let bytes = 0
  if (body != null) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8')
    bytes = buf.length
    if (!('Content-Length' in h)) h['Content-Length'] = String(buf.length)
    res.writeHead(status, h)
    if (req.method === 'HEAD') res.end(); else res.end(buf)
  } else {
    if (!('Content-Length' in h)) h['Content-Length'] = '0'
    res.writeHead(status, h)
    res.end()
  }
  console.log(`[serve] ${req.method} ${req.url} → ${status} ${bytes}B ${Date.now() - started}ms`)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => {
      n += c.length
      if (n > MAX_BODY) { reject(new Error(`请求体超过上限 ${MAX_BODY} 字节`)); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// 单段 Range（Ruffle 取资源偶尔用；不支持就退回整文件也行，但实现代价很小）
function parseRange(header, total) {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim())
  if (!m || (m[1] === '' && m[2] === '')) return 'invalid'
  let start, end
  if (m[1] === '') {
    const n = Number(m[2])
    if (!Number.isFinite(n) || n <= 0) return 'invalid'
    start = Math.max(0, total - n); end = total - 1
  } else {
    start = Number(m[1]); end = m[2] === '' ? total - 1 : Number(m[2])
  }
  if (!Number.isFinite(start) || start < 0 || start >= total) return 'invalid'
  if (end >= total) end = total - 1
  if (!Number.isFinite(end) || end < start) return 'invalid'
  return { start, end }
}

// ─────────────────────────── 静态侧 ───────────────────────────

async function serveStatic(req, res, pathname, started) {
  let file = path.resolve(ROOT, pathname.replace(/^\/+/, ''))
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return respond(req, res, 403, { 'Content-Type': TXT }, '403 越界（禁 .. 逃逸）\n', started)
  }
  let st = await statOrNull(file)
  if (st?.isDirectory()) {
    const idx = path.join(file, 'index.html')
    const stIdx = await statOrNull(idx)
    if (stIdx?.isFile()) { file = idx; st = stIdx } else return listDirectory(req, res, file, pathname, started)
  }
  if (!st?.isFile()) return respond(req, res, 404, { 'Content-Type': TXT }, `404 ${pathname}\n`, started)

  return sendFile(req, res, file, st, started)
}

// 单文件响应（静态侧与 /game-cache/ 共用；支持单段 Range）。
async function sendFile(req, res, file, st, started) {
  const mime = mimeOf(file)
  const range = parseRange(req.headers.range, st.size)
  if (range === 'invalid') {
    return respond(req, res, 416, { 'Content-Type': TXT, 'Content-Range': `bytes */${st.size}` }, '416\n', started)
  }
  const common = { 'Content-Type': mime, 'Accept-Ranges': 'bytes' }
  if (range) {
    const fh = await fsp.open(file, 'r')
    try {
      const buf = Buffer.alloc(range.end - range.start + 1)
      await fh.read(buf, 0, buf.length, range.start)
      respond(req, res, 206, { ...common, 'Content-Range': `bytes ${range.start}-${range.end}/${st.size}` }, buf, started)
    } finally { await fh.close() }
  } else {
    respond(req, res, 200, common, await fsp.readFile(file), started)
  }
}

// M8：本地缓存只读路由。只服文件、不列目录；解析后的路径必须仍在缓存根内。
async function serveCache(req, res, pathname, started) {
  const rel = pathname.slice('/game-cache/'.length)
  const file = path.resolve(CACHE_ROOT, rel)
  if (file !== CACHE_ROOT && !file.startsWith(CACHE_ROOT + path.sep)) {
    return respond(req, res, 403, { 'Content-Type': TXT }, '403 越界（禁 .. 逃逸）\n', started)
  }
  const st = await statOrNull(file)
  if (!st?.isFile()) return respond(req, res, 404, { 'Content-Type': TXT }, `404 ${pathname}\n`, started)
  return sendFile(req, res, file, st, started)
}

// 目录清单：只为「`/saves/` 里到底生成了什么」这种手测看一眼（无脚本、名字转义）
async function listDirectory(req, res, dir, pathname, started) {
  const entries = (await fsp.readdir(dir, { withFileTypes: true }))
    .filter((d) => !d.name.startsWith('.'))
    .sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : (a.isDirectory() ? -1 : 1)))
  const rows = entries.map((d) => {
    const suffix = d.isDirectory() ? '/' : ''
    return `<li><a href="${encodeURIComponent(d.name)}${suffix}">${esc(d.name)}${suffix}</a></li>`
  }).join('\n')
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(pathname)}</title>` +
    '<style>body{font:14px/1.7 ui-monospace,monospace;background:#14161c;color:#cfd3dd}a{color:#8fc7ff}</style>' +
    `<h1>${esc(pathname)}</h1><ul>${rows || '<li>（空）</li>'}</ul>`
  respond(req, res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, html, started)
}

// ─────────────────────────── 写侧（存档端点） ───────────────────────────

async function handleSaveWrite(req, res, name, started) {
  const dir = path.join(ROOT, 'saves')
  const file = path.join(dir, name)
  if (req.method === 'PUT') {
    const body = await readBody(req)
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(file, body) // 原样字节：不加 BOM、不改行尾、不补末尾换行（口径见 docs/save/save-xml-spec.md §6.2）
    console.log(`[serve] 存档已写 saves/${name}（${body.length} 字节）`)
  } else { // DELETE
    try { await fsp.unlink(file) } catch (e) { if (e.code !== 'ENOENT') throw e }
    console.log(`[serve] 存档已删 saves/${name}`)
  }
  respond(req, res, 204, {}, null, started)
}

// ─────────────────────────── 路由 ───────────────────────────

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  let pathname
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  } catch {
    return respond(req, res, 400, { 'Content-Type': TXT }, '400 坏 URL\n', started)
  }

  const save = SAVE_RE.exec(pathname)
  try {
    if (save && (req.method === 'PUT' || req.method === 'DELETE')) {
      return await handleSaveWrite(req, res, save[1], started)
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return respond(req, res, 403, { 'Content-Type': TXT },
        '403 只读服务：可写的只有 PUT/DELETE /saves/<name>.xml\n', started)
    }
    if (pathname === '/') return respond(req, res, 302, { Location: '/game/index.html' }, null, started)
    if (pathname.startsWith('/game-cache/')) return await serveCache(req, res, pathname, started)
    return await serveStatic(req, res, pathname, started)
  } catch (e) {
    respond(req, res, 500, { 'Content-Type': TXT }, `500 ${e.message}\n`, started)
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[serve] 端口 ${PORT} 被占了（改 --port=8091 或先停掉它）`)
    process.exit(1)
  }
  throw e
})

server.listen(PORT, HOST, () => {
  console.log(`[serve] root = ${ROOT}`)
  console.log(`[serve] 网页入口  http://${HOST}:${PORT}/game/index.html`)
  console.log(`[serve] 存档端点  GET/PUT/DELETE http://${HOST}:${PORT}/saves/<name>.xml → ${path.join(ROOT, 'saves')}/`)
  console.log(`[serve] 缓存只读  GET/HEAD http://${HOST}:${PORT}/game-cache/<rel> → ${CACHE_ROOT}/`)
  console.log('[serve] 一切响应带 Cache-Control: no-store（改完 JS/CSS 刷新即可，见 docs/arch-code.md §7.1）')
})
