// 野怪分布表 game/data/wild.json
//
// 数据可得性说明 (重要, 别误当原版数据):
//   原版每张图的野怪来自服务端 socket 命令 1103 "Pet spawn in lobby scene"
//   (app/lobby/messageHandler/MessageHandlerPetSpawn.as:41-53: 每条 = positionIndex, petResourceId, level),
//   config XML 里没有野怪表 —— 客户端只有 NPC(<npc resId>) 与传送(<teleport>)。
//   1103 的载荷是服务端配置, 已不可得, 所以本表是【我方合成】: 只借用原版仍在用的字段语义
//   (positionIndex 0..9 = 战斗槽位, 见 SpawnedPet.startFight / FightManager.startFightWithWild)。
//
// 合成规则 (确定性, 同一 mapId 永远同一结果):
//   池   = 图鉴里基础能力值最低的 48 只 (有本地战斗 SWF 的), 按能力值分 3 档, 低档 = 新手路
//   档位 = 该图在 teleport 无向连通块里离区域入口(块内最小图号)的 BFS 深度 // 3
//   数量 = 3 + hash(mapId) % 3  (3~5 只), 排除 1/139/220 (原版 1103 硬排除, 见 MessageHandlerPetSpawn.as:41)
//   坐标 = 归一化 (fx, fy), fy 落在地面带 0.45~0.88; 由 MapRunner 按当图 mapX/mapW 换算
//
// 用法: node tools/build-wild-index.mjs [--need]   --need = 只打印待抓的池内精灵号
import fs from 'node:fs'

const POOL_SIZE = 48
const TIERS = 3
const NO_SPAWN = new Set(['1', '139', '220'])   // 原版 1103 不刷怪的图
const args = process.argv.slice(2)
const maps = JSON.parse(fs.readFileSync('game/data/maps.json', 'utf8')).filter(m => m.swfOk)
const db = JSON.parse(fs.readFileSync('game/data/pets.json', 'utf8'))

const power = m => Object.values(m.stats).reduce((a, b) => a + b, 0)
const ranked = Object.values(db.monsters)
  .filter(m => fs.existsSync(`swf/fight/${m.swfId}.swf`))
  .sort((a, b) => power(a) - power(b) || a.id - b.id)
const pool = ranked.slice(0, POOL_SIZE).map((m, i) => ({
  id: m.id, swfId: m.swfId, name: m.name, tier: Math.floor(i * TIERS / POOL_SIZE),
  have: fs.existsSync(`swf/pet/normal/${m.swfId}.swf`),
}))

if (args.includes('--need')) {
  console.log(pool.map(p => p.id).join(' '))
  console.log(`其中已抓到 normal 包: ${pool.filter(p => p.have).length}/${pool.length}`)
  process.exit(0)
}

// ---- 世界图深度 (teleport 无向边; 图 1 所在连通块只有 {1,2}, 全图其实碎成很多区域) ----
// 每个连通块以最小图号为根做 BFS, 深度 = 离该区域入口多远 → 等级带随探索深入递增。
const adj = new Map(maps.map(m => [m.id, new Set()]))
for (const m of maps) for (const t of m.teleports || []) {
  if (!adj.has(t.target)) continue
  adj.get(m.id).add(t.target); adj.get(t.target).add(m.id)
}
const depth = new Map()
const numId = m => Number(m.id) || 0
for (const root of [...maps].sort((a, b) => numId(a) - numId(b))) {
  if (depth.has(root.id)) continue
  depth.set(root.id, 0)
  const q = [root.id]
  while (q.length) {
    const cur = q.shift()
    for (const nx of [...(adj.get(cur) || [])].sort()) if (!depth.has(nx)) { depth.set(nx, depth.get(cur) + 1); q.push(nx) }
  }
}

// ---- 确定性 PRNG ----
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const rngOf = seed => { let a = seed || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const LEVEL_BAND = [[2, 12], [13, 28], [30, 55]]

const usable = pool.filter(p => p.have)
const out = {}
let spawned = 0
for (const m of maps) {
  if (NO_SPAWN.has(m.id) || !usable.length) continue
  const r = rngOf(hash(m.id))
  const tier = Math.min(TIERS - 1, Math.floor((depth.get(m.id) || 0) / 3))
  const cand = usable.filter(p => p.tier === tier)
  const n = 3 + Math.floor(r() * 3)
  const pts = []
  for (let i = 0; i < n && i < cand.length; i++) {
    const p = cand[Math.floor(r() * cand.length)]     // 同档随机取, 每图组合不同
    for (let tries = 0; tries < 24; tries++) {
      const fx = 0.08 + r() * 0.84, fy = 0.45 + r() * 0.43
      if (pts.every(q => Math.hypot((q.fx - fx) * 1200, (q.fy - fy) * 660) > 120)) {
        const band = LEVEL_BAND[p.tier]
        pts.push({ idx: pts.length, pet: p.id, level: band[0] + Math.floor(r() * (band[1] - band[0] + 1)), fx: +fx.toFixed(4), fy: +fy.toFixed(4) })
        break
      }
    }
  }
  if (pts.length) { out[m.id] = pts; spawned += pts.length }
}
fs.writeFileSync('game/data/wild.json', JSON.stringify({ pool, maps: out }, null, 1))
const deep = Math.max(...[...depth.values()])
console.log(`wild.json: 池 ${pool.length} (已抓 ${usable.length}) / 图 ${maps.length} (最大区域深度 ${deep}) / 出怪 ${Object.keys(out).length} 图 ${spawned} 只`)
if (!usable.length) console.log('!! 池内 normal 包一个都没抓到, 先跑 --need 再 tools/fetch-pet-normal.mjs')
