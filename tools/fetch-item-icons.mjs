// 有界抓取物品图标: 只下命令行里点名的 id, 路径用 items.json 里算好的 iconOrigin (原版 res/... 路由)
// 本地落到 items.json 的 icon 字段那个路径 (swf/... 镜像)。并发 3, 每个请求之间 ~150ms, 已存在就跳过。
//   node tools/fetch-item-icons.mjs 200001 200011 100005
import fs from 'node:fs'
import path from 'node:path'

const DB = JSON.parse(fs.readFileSync('game/data/items.json', 'utf8'))
const CDN = 'http://seer2.61.com/'
const IDS = process.argv.slice(2).map(Number).filter(Number.isFinite)
if (!IDS.length) { console.error('用法: node tools/fetch-item-icons.mjs <itemId> …'); process.exit(1) }

let ok = 0, miss = 0, skip = 0, queue = IDS.slice()
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function worker() {
  while (queue.length) {
    const id = queue.shift()
    const rec = DB.items[id]
    if (!rec) { console.log(`#${id} 字典里没有`); miss++; continue }
    const file = rec.icon.replace(/^\//, '')            // rec.icon 是 URL 路径 (/swf/…), 落盘去掉开头的 /
    if (fs.existsSync(file)) { skip++; continue }
    await sleep(150)                                   // 限速: 每个请求前都等一下
    try {
      const r = await fetch(CDN + rec.iconOrigin, { signal: AbortSignal.timeout(20000) })
      if (!r.ok) { console.log(`#${id} ${r.status} ${rec.iconOrigin}`); miss++; continue }
      const buf = Buffer.from(await r.arrayBuffer())
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, buf)
      ok++
      console.log(`#${id} ${rec.name} → ${file} ${buf.length}B`)
    } catch (e) { console.log(`#${id} 失败 ${e.message}`); miss++ }
  }
}
await Promise.all([worker(), worker(), worker()])
console.log(`新下 ${ok}  已存在跳过 ${skip}  缺/失败 ${miss}`)
