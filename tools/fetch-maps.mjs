// 地图资源爬取: 从种子地图配置出发, 沿 config XML 里的 teleport targetMapId 做 BFS,
// 抓 res/map/config/{id}.xml 与其引用的 res/map/swf/{url}。
// 只做低并发 + 请求预算限制的礼貌抓取, 个人学习用途, 不二次分发。
// 用法: node tools/fetch-maps.mjs [--budget=2500] [--conc=3]
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://seer2.61.com/res/map/'
const OUT_SWF = 'swf/map'
const OUT_XML = 'swf/map/config'
const args = process.argv.slice(2)
const numArg = (name, dft) => { const a = args.find(s => s.startsWith('--' + name + '=')); return a ? Number(a.split('=')[1]) : dft }
const BUDGET = numArg('budget', 2500)
const CONC = numArg('conc', 3)
const SPACING = numArg('spacing', 150)

// 种子: 初始监狱(1, 传送图入口) + setting.xml 昼夜对 + 活动脚本里硬编码的地图号
const SEEDS = ['1', '131', '1310', '132', '1320', '180', '1800', '203', '2030', '370', '3700', '10109', '101090',
  '90', '124', '141', '142', '160', '204', '211', '202', '230', '261', '281', '302', '81', '40', '3840']

// 有界区间探测: 主世界地图号集中在小数段, 逐个确认 config 是否存在 (404 也算一次廉价请求)
// 用法 --probe=1:1024
const probeArg = args.find(s => s.startsWith('--probe='))
if (probeArg) {
  const [a, b] = probeArg.split('=')[1].split(':').map(Number)
  if (a >= 1 && b >= a && b - a <= 4096) for (let i = a; i <= b; i++) SEEDS.push(String(i))
}

fs.mkdirSync(OUT_SWF, { recursive: true })
fs.mkdirSync(OUT_XML, { recursive: true })

let requests = 0
const seenCfg = new Set(fs.readdirSync(OUT_XML).filter(f => f.endsWith('.xml')).map(f => path.basename(f, '.xml')))
const seenSwf = new Set(fs.readdirSync(OUT_SWF).filter(f => f.endsWith('.swf')).map(f => path.basename(f)))
// 已缓存的配置也要贡献传送目标 (否则续爬会丢掉它们后面的图)
const queue = []
const push = id => { if (!seenCfg.has(id) && !queue.includes(id)) queue.push(id) }
for (const f of fs.readdirSync(OUT_XML).filter(x => x.endsWith('.xml'))) {
  try { for (const t of targetsOf(fs.readFileSync(path.join(OUT_XML, f), 'utf8'))) push(t) } catch { /* 忽略坏文件 */ }
}
for (const s of SEEDS) push(s)
let done = 0, cfgOk = 0, cfgMiss = 0, swfOk = 0, swfMiss = 0, swfSkip = 0, errs = 0

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function get(url) {
  if (requests >= BUDGET) throw Object.assign(new Error('budget'), { budget: true })
  requests++
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) return { status: r.status, buf: null }
  return { status: 200, buf: Buffer.from(await r.arrayBuffer()) }
}

function targetsOf(xml) {
  const out = []
  for (const m of xml.matchAll(/targetMapId\s*=\s*"(\d+)"/g)) out.push(m[1])
  for (const m of xml.matchAll(/mapId\s*=\s*"(\d+)"/g)) out.push(m[1])
  return out
}

async function worker() {
  while (requests < BUDGET) {
    const id = queue.shift()
    if (id === undefined) { await sleep(120); if (!queue.length) return; continue }
    if (seenCfg.has(id)) { swfSkip++; continue }
    try {
      const c = await get(BASE + 'config/' + id + '.xml')
      if (c.status !== 200) { cfgMiss++; seenCfg.add(id); await sleep(SPACING / 2); continue }
      cfgOk++
      const xml = c.buf.toString('utf8')
      fs.writeFileSync(path.join(OUT_XML, id + '.xml'), c.buf)
      seenCfg.add(id)
      // 引用的场景 SWF
      const res = [...xml.matchAll(/<resource\s+url\s*=\s*"([^"]+)"/g)].map(m => m[1])
      for (const name of res) {
        const key = name.split('/').pop().replace(/\?.*$/, '')
        if (seenSwf.has(key)) { swfSkip++; continue }
        const s = await get(BASE + 'swf/' + name)
        if (s.status === 200) { fs.writeFileSync(path.join(OUT_SWF, key), s.buf); seenSwf.add(key); swfOk++ }
        else { swfMiss++; seenSwf.add(key) }
      }
      for (const t of targetsOf(xml)) if (!seenCfg.has(t)) queue.push(t)
      done++
      if (done % 10 === 0) console.log(`cfg=${cfgOk}/${cfgMiss} swf=${swfOk}/${swfMiss} queue=${queue.length} req=${requests}`)
      await sleep(SPACING)
    } catch (e) {
      if (e.budget) { console.log('请求预算用尽'); return }
      errs++
      if (errs < 5) console.log(`cfg ${id} 失败: ${e.message}`)
    }
  }
}

console.log(`种子 ${SEEDS.length} 个地图配置, 已缓存 cfg=${seenCfg.size} swf=${seenSwf.size}`)
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`\n完成: config ${cfgOk} (缺失 ${cfgMiss}) / swf ${swfOk} (缺失 ${swfMiss}) / 跳过 ${swfSkip} / 错误 ${errs} / 请求 ${requests}`)
console.log(`剩余未探明队列 ${queue.length} (可再次运行本脚本续爬)`)
