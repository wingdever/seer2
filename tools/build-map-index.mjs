// 从爬取的 res/map/config/*.xml 生成前端清单 game/data/maps.json
// 字段: id(地图号) name(中文名) swf(场景资源文件名) init(初始点) teleports(传送点 → 目标图, 含出口名) weather
import fs from 'node:fs'
import path from 'node:path'

const DIR = 'swf/map/config'
const OUT = 'game/data/maps.json'
const have = new Set(fs.readdirSync('swf/map').filter(f => f.endsWith('.swf')))

const attr = (s, k) => { const m = s.match(new RegExp(k + '\\s*=\\s*"([^"]*)"')); return m ? m[1] : null }
const list = []
let missing = 0
for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.xml'))) {
  const id = path.basename(f, '.xml')
  const xml = fs.readFileSync(path.join(DIR, f), 'utf8')
  const res = [...xml.matchAll(/<resource\s+url\s*=\s*"([^"]+)"/g)].map(m => m[1].split('/').pop())
  const swf = res.find(r => have.has(r)) || res[0] || null
  if (swf && !have.has(swf)) missing++
  const ipm = xml.match(/<initialPoint[^>]*>/)
  // <fightMap id="100002"/>: 进战斗时用哪张战斗场景 (MapModel.fightMapId; 没有则原版为 0)
  const fm = xml.match(/<fightMap\b[^>]*\/>/)
  const fightMap = fm ? attr(fm[0], 'id') : null
  // name = 出口自己的名字 (原版 Teleport.as 的 this.name, 也是悬浮说明的文案)。
  // ⚠️ 它 **不等于** 目标图的 name: 308 条 <teleport> 里 25 条不同 (100.xml 的"草系主城" → 图 90 "草目氏族主城"),
  //    1 条为空 (1.xml) ⇒ 提示文案只能取这个字段, 不能拿目标图名顶替。
  const teleports = [...xml.matchAll(/<teleport\b[^>]*\/>/g)].map(t => ({
    pos: attr(t[0], 'pos'), target: attr(t[0], 'targetMapId'), id: attr(t[0], 'id'), name: attr(t[0], 'name') ?? '',
  })).filter(t => t.pos && t.target)
  list.push({
    id,
    name: attr(xml, 'name') || id,
    swf,
    swfOk: !!swf && have.has(swf),   // 场景 SWF 是否已在本地 (4 张当时未爬到)
    fightMap,
    fightMapOk: !!fightMap && have.has(fightMap + '.swf'),
    weather: attr(xml, 'weather'),
    init: ipm ? { x: Number(attr(ipm[0], 'x')), y: Number(attr(ipm[0], 'y')) } : null,
    entities: (xml.match(/<entities>/g) || []).length,
    teleports,
  })
}
list.sort((a, b) => (Number(a.id) - Number(b.id)) || a.id.localeCompare(b.id))
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(list, null, 1))
const withPath = list.filter(m => m.teleports.length).length
const withFight = list.filter(m => m.fightMap).length
console.log(`maps.json: ${list.length} 张 (有场景文件 ${list.filter(m => m && have.has(m.swf)).length}, 缺资源 ${missing}, 含传送点 ${withPath}, 含 fightMap ${withFight}, 战斗图本地有 ${list.filter(m => m.fightMapOk).length})`)
console.log('fightMap 分布: ' + [...new Set(list.map(m => m.fightMap).filter(Boolean))].sort().join(' '))
