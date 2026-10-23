// 有界抓取 野怪地图帧序列包 res/pet/normal/{swfId}.swf → swf/pet/normal/
// 个人学习用途, 不二次分发。低并发 + 请求预算 + 请求间隔, 不做压测。
// 用法: node tools/fetch-pet-normal.mjs --ids="266 119 43 ..." [--budget=64] [--conc=2] [--spacing=160]
//       node tools/fetch-pet-normal.mjs --urls="ui/UI_PetShadow.swf ui/UI_SurpriseMark.swf"
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://seer2.61.com/res/'
const args = process.argv.slice(2)
const argOf = name => { const a = args.find(s => s.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : '' }
const num = (name, dft) => { const v = argOf(name); return v ? Number(v) : dft }
const BUDGET = num('budget', 64)
const CONC = Math.min(3, num('conc', 2))
const SPACING = num('spacing', 160)

const urls = argOf('urls') ? argOf('urls').split(/\s+/).filter(Boolean)
  : argOf('ids').split(/\s+/).filter(Boolean).map(id => `pet/normal/${id}.swf`)
if (!urls.length) { console.log('没有要抓的 --ids/--urls'); process.exit(1) }
if (urls.length > BUDGET) { console.log(`请求数 ${urls.length} 超出预算 ${BUDGET}, 只抓前 ${BUDGET} 个`); urls.length = BUDGET }

const todo = urls.filter(u => {
  const out = `swf/${u}`
  if (fs.existsSync(out) && fs.statSync(out).size > 200) return false
  fs.mkdirSync(path.dirname(out), { recursive: true })
  return true
})
console.log(`计划 ${urls.length} 个, 待抓 ${todo.length} 个 (预算 ${BUDGET}, 并发 ${CONC}, 间隔 ${SPACING}ms)`)

let ok = 0, miss = 0, fail = 0, req = 0
async function worker() {
  while (todo.length && req < BUDGET) {
    const u = todo.shift()
    req++
    try {
      const r = await fetch(BASE + u, { signal: AbortSignal.timeout(30000) })
      if (r.status === 404) miss++
      else if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        const head = buf.subarray(0, 2).readUInt16BE(0)
        const isPack = buf.length > 200 && buf.length < 4_000_000 && head > 8 && head < buf.length / 2
        const isSwf = ['CWS', 'FWS', 'ZWS'].includes(buf.subarray(0, 3).toString('latin1'))
        if (isPack || isSwf) { fs.writeFileSync(`swf/${u}`, buf); ok++ }
        else { fail++; console.log('  格式不符', u, buf.length, Buffer.from(buf.subarray(0, 4)).toString('hex')) }
      } else fail++
    } catch (e) { fail++; console.log('  失败', u, e.message) }
    await new Promise(r => setTimeout(r, SPACING))
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`完成: 落盘 ${ok} / 404 ${miss} / 失败 ${fail} / 请求 ${req}`)
