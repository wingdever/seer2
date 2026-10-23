// 有界抓取 精灵头像 res/pet/icon/{realId}.swf → swf/pet/icon/
// 路由出处: vendor URLUtil.getPetIcon (res/pet/icon/ + getResRealId, 常规 realId==id)
// 个人学习用途, 不二次分发。低并发 + 请求预算 + 请求间隔, 不做压测。
// 用法: node tools/fetch-pet-icons.mjs                    # 默认 = wild.json 池 48 只
//       node tools/fetch-pet-icons.mjs --ids="266 119 43" [--budget=80] [--conc=2] [--spacing=160]
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://seer2.61.com/res/'
const args = process.argv.slice(2)
const argOf = name => { const a = args.find(s => s.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : '' }
const num = (name, dft) => { const v = argOf(name); return v ? Number(v) : dft }
const BUDGET = num('budget', 80)
const CONC = Math.min(3, num('conc', 2))
const SPACING = num('spacing', 160)

let ids
if (argOf('ids')) ids = argOf('ids').split(/\s+/).filter(Boolean)
else ids = JSON.parse(fs.readFileSync('game/data/wild.json')).pool.map(p => String(p.swfId ?? p.id))
ids = [...new Set(ids)]
if (ids.length > BUDGET) { console.log(`请求数 ${ids.length} 超出预算 ${BUDGET}, 只抓前 ${BUDGET} 个`); ids.length = BUDGET }

const todo = ids.filter(id => {
  const out = `swf/pet/icon/${id}.swf`
  if (fs.existsSync(out) && fs.statSync(out).size > 200) return false
  fs.mkdirSync(path.dirname(out), { recursive: true })
  return true
})
console.log(`计划 ${ids.length} 个, 待抓 ${todo.length} 个 (预算 ${BUDGET}, 并发 ${CONC}, 间隔 ${SPACING}ms)`)

let ok = 0, miss = 0, fail = 0, req = 0
const failed = []
async function worker() {
  while (todo.length && req < BUDGET) {
    const id = todo.shift()
    req++
    await new Promise(r => setTimeout(r, SPACING))
    try {
      const r = await fetch(BASE + `pet/icon/${id}.swf`, { signal: AbortSignal.timeout(30000) })
      if (r.status === 404) { miss++; failed.push(`404 ${id}`) }
      else if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.length > 200 && (buf.subarray(0, 3).toString() === 'CWS' || buf.subarray(0, 3).toString() === 'ZWS' || buf.subarray(0, 3).toString() === 'FWS')) {
          fs.writeFileSync(`swf/pet/icon/${id}.swf`, buf); ok++
        } else { fail++; failed.push(`非SWF ${id} ${buf.length}B`) }
      } else { fail++; failed.push(`HTTP${r.status} ${id}`) }
    } catch (e) { fail++; failed.push(`ERR ${id} ${e.name}`) }
  }
}
await Promise.all(Array.from({ length: CONC }, worker))
console.log(`成功 ${ok}, 404 ${miss}, 失败 ${fail}`)
if (failed.length) console.log('清单:\n' + failed.join('\n'))
