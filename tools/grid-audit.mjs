// 栅格体检: 把所有地图的 path_mc 栅格跑一遍, 看"可走比例"分布到底错在多大范围。
// 判读: 正常地图应有一大片连续可走区 (ratio 大致 0.2~0.8);
//       ratio≈0 (全阻挡) 或 ≈1 (全可走) 或 gw/gh 异常小 = 该图栅格不可信。
// 用法: node tools/grid-audit.mjs [张数]
import * as S from '../game/swfshape.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:8090'
const LIMIT = Number(process.argv[2] || 200)
const list = (await (await fetch(`${BASE}/game/data/maps.json`)).json()).filter(m => m.swf)

const rows = []
for (const m of list.slice(0, LIMIT)) {
  const id = m.swf.replace(/\.swf$/i, '')
  try {
    const swf = await S.fetchSwf(`${BASE}/swf/map/${m.swf}`)
    const g = S.walkGridOf(swf, 10)
    rows.push({ id, name: m.name || '', gw: g.gw, gh: g.gh, free: 1 - g.blockedRatio, contours: g.contours, groups: g.groups })
  } catch (e) {
    rows.push({ id, name: m.name || '', err: e.message.slice(0, 60) })
  }
}

const ok = rows.filter(r => !r.err)
const bad = rows.filter(r => r.err)
const bucket = { 全阻挡: 0, 极少: 0, 正常: 0, 极多: 0, 全可走: 0 }
for (const r of ok) {
  if (r.free < 0.01) bucket.全阻挡++
  else if (r.free < 0.1) bucket.极少++
  else if (r.free <= 0.9) bucket.正常++
  else if (r.free < 1) bucket.极多++
  else bucket.全可走++
}
console.log(`共 ${rows.length} 张 · 解析成功 ${ok.length} · 失败 ${bad.length}`)
console.log('可走比例分布:', Object.entries(bucket).map(([k, v]) => `${k}=${v}`).join('  '))
const sorted = [...ok].sort((a, b) => a.free - b.free)
const show = (label, arr) => { console.log(`\n${label}`); for (const r of arr.slice(0, 12)) console.log(`  ${r.id}  ${r.gw}x${r.gh}  可走 ${(r.free * 100).toFixed(1)}%  轮廓${r.contours} 组${r.groups}  ${r.name}`) }
show('最差 12 (可走最少):', sorted)
show('最好 12 (可走最多):', sorted.slice(-12))
if (bad.length) { console.log('\n解析失败:'); for (const r of bad.slice(0, 12)) console.log(`  ${r.id}  ${r.err}  ${r.name}`) }
