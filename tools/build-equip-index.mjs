// M8 外观数据桥：game/data/items.json + PetRideShopConfig → game/data/equip-index.json
// 源（均为上游只读件）：
//   game/data/items.json                       ← tools/build-items.mjs 转出的 ItemConfig 物品字典
//   vendor/seer2-origin-as3/src/_assets/65_com.taomee.seer2.app.config.PetRideShopConfig__setting.xml
// 产物只留“进图外观计划”需要的字段：装备的 slot/suit + 骑乘映射；不含图标/描述/背包用字段。
// 用法: node tools/build-equip-index.mjs
import fs from 'node:fs'

const ITEMS = 'game/data/items.json'
const RIDE = 'vendor/seer2-origin-as3/src/_assets/65_com.taomee.seer2.app.config.PetRideShopConfig__setting.xml'
const OUT = 'game/data/equip-index.json'

const src = JSON.parse(fs.readFileSync(ITEMS, 'utf8'))
const items = {}
const slots = {}
let equip = 0
let noSuitField = 0

for (const [id, v] of Object.entries(src.items)) {
  const slot = Number(v.slotindex ?? 0)
  if (!(slot > 0)) continue
  equip++
  slots[slot] = (slots[slot] || 0) + 1
  if (!Object.prototype.hasOwnProperty.call(v, 'suitid')) noSuitField++   // 实测 129 条全是 slot 9（NONO 服装）
  items[id] = { name: v.name, slot, suit: Number(v.suitid ?? 0) || 0 }
}

// `<pet ... />` 一行一条；重复键（收费版与免费版同 chipBackId）必须映射到同一件装备。
const xml = fs.readFileSync(RIDE, 'utf8')
const rows = [...xml.matchAll(/<pet\b([^>]*?)\/?>/g)].map((m) => parseAttrs(m[1]))
const byPetResourceId = {}
const byChipBackId = {}
const conflicts = []
for (const a of rows) {
  const equipId = Number(a.equipId)
  const petRid = Number(a.petResourceId)
  const chip = Number(a.chipBackId)
  if (!Number.isFinite(equipId) || !Number.isFinite(petRid) || !Number.isFinite(chip)) continue
  if (byPetResourceId[petRid] != null && byPetResourceId[petRid] !== equipId) conflicts.push(`petResourceId=${petRid}`)
  if (byChipBackId[chip] != null && byChipBackId[chip] !== equipId) conflicts.push(`chipBackId=${chip}`)
  byPetResourceId[petRid] = equipId
  byChipBackId[chip] = equipId
}

const out = {
  note: '由 tools/build-equip-index.mjs 生成，勿手改。M8 外观数据桥：装备定义 + 骑乘映射；源 = ItemConfig/PetRideShopConfig（vendor 只读）',
  source: { items: ITEMS, ride: RIDE },
  items,
  ride: {
    byPetResourceId: sortNumericKeys(byPetResourceId),
    byChipBackId: sortNumericKeys(byChipBackId),
  },
}
fs.writeFileSync(OUT, JSON.stringify(out))

// 源表总行数（含重复 ID）从原 XML 数：items.json 按 ID 去重，二者差 = 重复 ID 数。
const itemXmlRows = (fs.readFileSync(src.source, 'utf8').match(/<Item\b/g) || []).length
const distinctEquip = new Set(rows.map((a) => Number(a.equipId)).filter(Number.isFinite)).size
console.log(`${OUT}: items=${Object.keys(items).length} (源 XML ${itemXmlRows} 行 / 去重 ${src.count}) equip=${equip}  ${(fs.statSync(OUT).size / 1024).toFixed(1)}KB`)
console.log(`  槽分布 ${Object.keys(slots).sort((a, b) => a - b).map((s) => `${s}:${slots[s]}`).join(', ')}`)
console.log(`  无 suitid 字段 ${noSuitField} 条（slot 9 全量；槽位规则见 actor-look.js）`)
console.log(`  骑乘: rows=${rows.length} distinctEquip=${distinctEquip} byPetResourceId=${Object.keys(byPetResourceId).length} byChipBackId=${Object.keys(byChipBackId).length}`)
console.log(`  特殊: byChipBackId[900017]=${byChipBackId[900017]} byChipBackId[900018]=${byChipBackId[900018]}`)
if (conflicts.length) {
  console.warn(`  ⚠️ 同一键映射到不同 equipId: ${[...new Set(conflicts)].join(', ')}（保留最后一行）`)
}

function sortNumericKeys(obj) {
  const out = {}
  for (const k of Object.keys(obj).sort((a, b) => Number(a) - Number(b))) out[k] = obj[k]
  return out
}

function parseAttrs(s) {
  const out = {}
  const re = /(\w+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(s))) out[m[1]] = m[2]
  return out
}
