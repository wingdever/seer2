// Download pet demo (背包待机预览) SWFs from the live game CDN, politely (low concurrency).
// id 与 fight SWF 同源：URLUtil.getPetDemo / getPetFightSwf 都走 getResRealId(id) ⇒ demo 文件 id = swfId。
// 用法: node tools/fetch-pet-demo.mjs [fromId] [toId]   默认 1..1700（与 swf/fight 同范围，缺的 404 跳过）
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://seer2.61.com/res/pet/demo/'
const OUT = 'swf/pet/demo'
const CONC = 4
const from = Number(process.argv[2] || 1)
const to = Number(process.argv[3] || 1700)
fs.mkdirSync(OUT, { recursive: true })

const exists = new Set(fs.readdirSync(OUT).map(f => Number(path.basename(f, '.swf'))).filter(Number.isFinite))
const ids = []
for (let i = from; i <= to; i++) if (!exists.has(i)) ids.push(i)
console.log('to fetch:', ids.length)

let done = 0, ok = 0, miss = 0, fail = 0
async function worker() {
  while (ids.length) {
    const id = ids.shift()
    try {
      const res = await fetch(BASE + id + '.swf', { signal: AbortSignal.timeout(30000) })
      if (res.status === 404) { miss++; }
      else if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 200 && (buf.toString('latin1', 0, 3) === 'CWS' || buf.toString('latin1', 0, 3) === 'FWS' || buf.toString('latin1', 0, 3) === 'ZWS')) {
          fs.writeFileSync(`${OUT}/${id}.swf`, buf)
          ok++
        } else fail++
      } else fail++
    } catch { fail++ }
    done++
    if (done % 100 === 0) console.log(`progress ${done} ok=${ok} miss=${miss} fail=${fail}`)
    await new Promise(r => setTimeout(r, 40))
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`DONE total ok=${ok} miss=${miss} fail=${fail}`)
