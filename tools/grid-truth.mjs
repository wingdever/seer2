// 用原版 config 的 initialPoint 当"保证可走"真值, 判定 path_mc 栅格的极性。
// 判读: 若大量图的出生点落在 '1'(按我的语义=被 path_mc 填充=阻挡) 上,
//       说明 path_mc 的填充区其实是可走区, 极性整体反了。
// 用法: node tools/grid-truth.mjs [张数]
import fs from 'node:fs'
import * as S from '../game/swfshape.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:8090'
const LIMIT = Number(process.argv[2] || 300)
const maps = (await (await fetch(`${BASE}/game/data/maps.json`)).json()).filter(m => m.swf)

const tally = { 出生点可走: 0, 出生点被阻挡: 0, 越界: 0, 无initialPoint: 0, 无config: 0, 解析失败: 0 }
const inverted = []
for (const m of maps.slice(0, LIMIT)) {
  const id = m.swf.replace(/\.swf$/i, '')
  const cfg = `swf/map/config/${id}.xml`
  if (!fs.existsSync(cfg)) { tally.无config++; continue }
  const xml = fs.readFileSync(cfg, 'utf8')
  const pt = /<initialPoint[^>]*x="(-?[\d.]+)"[^>]*y="(-?[\d.]+)"/.exec(xml)
  if (!pt) { tally.无initialPoint++; continue }
  let g
  try { g = S.walkGridOf(await S.fetchSwf(`${BASE}/swf/map/${m.swf}`), 10) }
  catch (e) { tally.解析失败++; continue }
  const cx = Math.floor((Number(pt[1]) - g.ox) / g.cell), cy = Math.floor((Number(pt[2]) - g.oy) / g.cell)
  if (cx < 0 || cy < 0 || cx >= g.gw || cy >= g.gh) { tally.越界++; continue }
  const bit = g.ascii[cy * g.gw + cx]
  if (bit === '0') tally.出生点可走++
  else {
    tally.出生点被阻挡++
    inverted.push(`${id} ${m.name || ''} 格${cx},${cy} 可走率${((1 - g.blockedRatio) * 100).toFixed(1)}% ${g.gw}x${g.gh}`)
  }
}
console.log(`共 ${Math.min(LIMIT, maps.length)} 张:`, Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('  '))
const judged = tally.出生点可走 + tally.出生点被阻挡
if (judged) console.log(`出生点落在"阻挡"上的比例 = ${(tally.出生点被阻挡 * 100 / judged).toFixed(1)}%  (>50% 即极性整体相反)`)
console.log('\n出生点被判为阻挡的图 (前 20):')
for (const line of inverted.slice(0, 20)) console.log('  ' + line)
