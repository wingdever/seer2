// 物品字典: 原版 ItemConfig 的 [Embed] XML → game/data/items.json
// 源: vendor/seer2-origin-as3/src/_assets/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml
//     (反编译客户端里带的那份配置原文, 一个字段都没改; 只做 XML→JSON 的形态转换)
// 分类/ID 段的对应关系抄自 vendor 源码:
//   app/inventory/constant/ItemCategory.as  BASIC=0 EQUIP=1 PET_RELATE=2 EMBLEM=3
//     COLLECTION=4 MEDAL=5 DECORATIN=6 PET_SPIRT_TRAIN=8 SPECIAL_ITEM=101
//   app/inventory/constant/ItemIdRange.as   每类 ID 从 cat*100000+1 起
//   core/utils/URLUtil.as:378  getItemIcon(id) = res/item/icon/<id>.swf
// 用法: node tools/build-items.mjs
import fs from 'node:fs'

const SRC = 'vendor/seer2-origin-as3/src/_assets/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml'
const OUT = 'game/data/items.json'

const xml = fs.readFileSync(SRC, 'utf8')
const cats = []
const items = {}
let tips = 0

// Cat 块: <Cat ID= DbCatID= Name= Max=> … </Cat>
const catRe = /<Cat\b([^>]*)>([\s\S]*?)<\/Cat>/g
let cm
while ((cm = catRe.exec(xml))) {
  const attr = parseAttrs(cm[1])
  const cat = { id: Number(attr.ID), name: attr.Name, max: Number(attr.Max) }
  if (attr.DbCatID !== undefined) cat.dbCat = Number(attr.DbCatID)
  cats.push(cat)
  const body = cm[2]
  const itemRe = /<Item\b([^>]*?)(\/>|>([\s\S]*?)<\/Item>)/g
  let im
  while ((im = itemRe.exec(body))) {
    const a = parseAttrs(im[1])
    const id = Number(a.ID)
    if (!Number.isFinite(id)) continue
    const rec = { id, cat: cat.id, name: a.Name }
    for (const k of Object.keys(a)) {
      if (k === 'ID' || k === 'Name') continue
      const v = a[k]
      rec[k.toLowerCase()] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
    }
    if (im[3]) {
      const tip = /<Tip>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/Tip>/.exec(im[3])
      if (tip) { rec.tip = tip[1].trim(); tips++ }
    }
    items[id] = rec
  }
}

// 图标路由: ItemConfig.getItemIconUrl 按 ItemCategoryUtil.findItemCategoryByReferenceId 的
// ID 段选目录 (注意是 ID 段, 不是 XML 的 Cat), URL 前缀逐条抄 core/utils/URLUtil.as:147-195
const ICON_BASES = [
  { range: [1, 100000], cat: 'BASIC', base: 'item/icon/' },
  { range: [100001, 199999], cat: 'EQUIP', base: 'item/equip/icon/' },
  { range: [200001, 299999], cat: 'PET_RELATE', base: 'item/pet/icon/' },
  { range: [300001, 399999], cat: 'EMBLEM', base: 'item/emblem/icon/' },
  { range: [400001, 499999], cat: 'COLLECTION', base: 'item/collection/icon/' },
  { range: [500001, 500500], cat: 'MEDAL', base: 'item/medal/icon/' },
  { range: [500501, 610000], cat: 'SPECIAL_ITEM', base: 'item/special/icon/' },
  { range: [800001, 805999], cat: 'PET_SPIRT_TRAIN', base: 'item/petSpirtTrain/icon/' },
]
const NONO_EQUIP = [102000, 102999]          // 这段特殊: res/nono/nonoEquipIcon/<id>.swf
function iconRoute(id) {
  if (id >= NONO_EQUIP[0] && id <= NONO_EQUIP[1]) return { cat: 'NONO_EQUIP', base: 'nono/nonoEquipIcon/' }
  for (const r of ICON_BASES) if (id >= r.range[0] && id <= r.range[1]) return { cat: r.cat, base: r.base }
  return { cat: 'COLLECTION', base: 'item/collection/icon/' }   // 原版的 default 分支
}
for (const it of Object.values(items)) {
  const r = iconRoute(it.id)
  it.iconCat = r.cat
  it.icon = '/swf/' + r.base + it.id + '.swf'      // 本地镜像前缀
  it.iconOrigin = 'res/' + r.base + it.id + '.swf' // 原版 CDN 路径
}

// 分类键名照抄 ItemCategory.as 的常量名 (本地源码里没有 cat7/9 的常量, 按 XML 的类名补)
const CLASS_BY_CAT = { 0: 'BASIC', 1: 'EQUIP', 2: 'PET_RELATE', 3: 'EMBLEM', 4: 'COLLECTION', 5: 'MEDAL', 6: 'DECORATIN', 7: 'PET_ORNAMENTS', 8: 'PET_SPIRT_TRAIN', 9: 'RIDE' }
for (const c of cats) c.key = CLASS_BY_CAT[c.id] ?? ('CAT' + c.id)

const out = {
  note: '原版物品字典 (ItemConfig__itemXmlClass.xml 逐条转换, 未合成任何条目)',
  source: SRC,
  iconUrl: 'ItemConfig.getItemIconUrl + ItemCategoryUtil + URLUtil (逐条见 ICON_BASES)',
  cats,
  count: Object.keys(items).length,
  items,
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(`${OUT}: 分类 ${cats.length} 物品 ${out.count} 带Tip ${tips}  ${(fs.statSync(OUT).size / 1048576).toFixed(2)}MB`)
const perCat = new Map()
for (const it of Object.values(items)) perCat.set(it.cat, (perCat.get(it.cat) || 0) + 1)
for (const c of cats) console.log(`  cat${c.id} ${c.name} key=${c.key} max=${c.max} 条目=${perCat.get(c.id) || 0}`)

// ---------- 属性解析 ----------
function parseAttrs(s) {
  const out = {}
  const re = /(\w+)\s*=\s*"([^"]*)"/g
  let m
  while ((m = re.exec(s))) out[m[1]] = m[2]
  return out
}
