// 原版数值 → 战斗内核数据格式 转换层
// 输入: assets/main-config.json (约瑟传说原始 monster/skill/monster_type/skill_category 表)
//       projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Pets/exp.csv (成长/进化表, 社区重启版)
// 输出: game/data/pets.json  { types, skills:{id}, monsters:{id}, growth:{id} }  (技能去重, 精灵引用技能id)
// 字段映射:
//   monster: hpm→hp, atk→atk, def→def, spk→spa, spf→spd, spd→spe; type(数字)→monster_type 名→Element
//   skill:   anger→rage; category 1物理/2特殊/4属性/80必杀/81合体 → Physical/Special/Status/Climax/Climax
//   growth:  exp.csv 列 id,expType,evolvePetId,evolveLevel,beatExpParam (多分支以 / 分隔; 数量不齐标 ambiguous)
// 仅个人学习用途。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const C = JSON.parse(readFileSync(new URL('../assets/main-config.json', import.meta.url), 'utf8'))

// 属性中文名 → 内核 Element 枚举 (神盾≈Divine)
const TYPE2EL = {
  普通: 'Normal', 草: 'Grass', 水: 'Water', 火: 'Fire', 风: 'Wind', 虫: 'Bug', 飞行: 'Flying',
  电: 'Electric', 地面: 'Ground', 冰: 'Ice', 超能: 'Psychic', 战斗: 'Fighting', 特质: 'Trait',
  光: 'Light', 神秘: 'Mystery', 暗影: 'Shadow', 龙: 'Dragon', 沙漠: 'Desert', 上古: 'Ancient',
  圣灵: 'Holy', 神迹: 'Miracle', 精灵王: 'ElfKing', 神盾: 'Divine', 神遁: 'Divine',
}
const CAT2EN = { 物理: 'Physical', 特殊: 'Special', 属性: 'Status', 必杀: 'Climax', 合体: 'Climax' }

const typeName = {}
for (const t of C.monster_type || []) typeName[t.id] = t.name
const catName = {}
for (const k of C.skill_category || []) catName[k.id] = k.name

const elementOf = tid => TYPE2EL[typeName[tid] ?? ''] ?? 'Normal'

// 技能表 (去重)
const skills = {}
for (const s of C.skill || []) {
  const cn = catName[s.category] ?? '属性'
  skills[s.id] = {
    id: s.id,
    name: s.name,
    tips: s.tips ?? '',
    power: s.power ?? 0,
    accuracy: s.accuracy ?? 100,
    rage: s.anger ?? 0,
    category: CAT2EN[cn] ?? 'Status',
    catName: cn,
    element: elementOf(s.type),
  }
}

// 精灵表
const monsters = {}
for (const m of C.monster || []) {
  const ids = (m.skills || []).filter(id => skills[id])
  monsters[m.id] = {
    id: m.id,
    name: m.name,
    swfId: m.id,
    type: typeName[m.type] ?? '普通',
    element: elementOf(m.type),
    stats: { hp: m.hpm ?? 1, atk: m.atk ?? 1, def: m.def ?? 1, spa: m.spk ?? 1, spd: m.spf ?? 1, spe: m.spd ?? 1 },
    skillIds: ids,
  }
}

// 成长/进化表 (重启版 exp.csv): id,expType,evolvePetId,evolveLevel,beatExpParam
// 多分支进化以 '/' 分隔; id 数与 level 数不一致 → ambiguous(本期不做其升级进化)
const growth = {}
let ambiguousCount = 0
{
  const csvPath = new URL('../projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Pets/exp.csv', import.meta.url)
  let text
  try { text = readFileSync(csvPath, 'utf8') } catch { console.warn('exp.csv 缺失, growth 为空'); text = '' }
  for (const line of text.split(/\r?\n/).slice(1)) {
    const c = line.split(',')
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue
    const ids = c[2].split('/').filter(s => /^\d+$/.test(s)).map(Number)
    const lvls = c[3].split('/').filter(s => /^\d+$/.test(s)).map(Number)
    const g = {
      expType: Number(c[1]) === 1 ? 'B' : 'A',
      beatExpParam: Number(c[4]) || 0,
      evolve: [],
      ambiguous: false,
    }
    if (ids.length && lvls.length && ids.length === lvls.length) {
      g.evolve = ids.map((to, i) => ({ to, level: lvls[i] })).filter(e => e.to && e.to !== Number(c[0]))
    } else {
      g.evolve = ids.map(to => ({ to, level: 0 })).filter(e => e.to && e.to !== Number(c[0]))
      if (ids.length !== lvls.length || g.evolve.length > 1) g.ambiguous = true
    }
    if (g.ambiguous) ambiguousCount++
    growth[c[0]] = g
  }
  for (const id of Object.keys(monsters)) {
    if (!growth[id]) growth[id] = { expType: 'A', beatExpParam: 65, evolve: [], ambiguous: false, synthetic: true }
  }
}

// 元游戏规则 (本期合成, 集中可调)。公式移植自重启版:
//   EffectAbilityHandler.cs:66 Capture(); BattleResult.cs:174 SetExp(); PetExpSystem.cs:59 曲线
const RULES = {
  _note: '个人学习用合成规则, 原版数值在服务端无法直接获取; 参数集中在此可调',
  expCurve: {
    // GetLevelExp(L) = a*L^2 + b*L + c + (L % parityMod > 0 ? parityAdd : 0); L==1 另加 lv1Extra
    A: { a: 3.75, b: 3.75, c: 1, parityMod: 2, parityAdd: 1, lv1Extra: 1 },
    B: { a: 2.5, b: 2.5, c: 0.8, parityMod: 5, parityAdd: 1, lv1Extra: 0 },
    maxLevel: 100,
  },
  expSettle: {
    // totalExp = Σ_敌方全体 (beatExpParam/divisor) * levelExp(level); 均分给参战(出手过)的我方宠
    divisor: 255,
    participants: 'acted',
  },
  capture: {
    // prob<100 时乘血量损失档 [≤25%:0.25, ≤50%:1, ≤75%:1.5, >75%:2]; 掷点 0-100
    hpBands: [[0.25, 0.25], [0.5, 1], [0.75, 1.5], [1, 2]],
    statusDivisor: 3,
    alwaysByIds: [10],
  },
  items: {
    // itemId = 原版 ItemConfig ID (items.json 实测): 胶囊概率按重启版 effect.csv 档 (25/35/49/100),
    // 体力/怒气药剂恢复量取自原版 item tip (固定点数, 非百分比)
    captureBalls: [
      { itemId: 200001, name: '普通精灵胶囊', prob: 25, maxWildLevel: 30 },
      { itemId: 200002, name: '中级精灵胶囊', prob: 35, maxWildLevel: 60 },
      { itemId: 200003, name: '高级精灵胶囊', prob: 49, maxWildLevel: null },
      { itemId: 200006, name: '无敌精灵胶囊', prob: 100, maxWildLevel: null },
    ],
    heals: [
      { itemId: 200011, name: '初级体力药剂', healAmount: 20 },
      { itemId: 200012, name: '中级体力药剂', healAmount: 50 },
      { itemId: 200013, name: '高级体力药剂', healAmount: 100 },
      { itemId: 200014, name: '特级体力药剂', healAmount: 200 },
      { itemId: 200015, name: '超级体力药剂', healAmount: 300 },
      { itemId: 200020, name: '完全体力药剂', healAmount: 2000 },
    ],
    rage: [
      { itemId: 200021, name: '初级怒气药剂', rageAmount: 10 },
      { itemId: 200022, name: '中级怒气药剂', rageAmount: 20 },
      { itemId: 200023, name: '高级怒气药剂', rageAmount: 30 },
      { itemId: 200024, name: '特级怒气药剂', rageAmount: 40 },
      { itemId: 200025, name: '超级怒气药剂', rageAmount: 50 },
      { itemId: 200026, name: '完全怒气药剂', rageAmount: 200 },
    ],
    combo: [
      { itemId: 200031, name: '初级战斗药剂', healAmount: 20, rageAmount: 10 },
      { itemId: 200039, name: '完全战斗药剂', healAmount: 2000, rageAmount: 200 },
    ],
  },
  skillUnlock: {
    // 第 i 技(0-based, 装配顺序 [普攻.., 必杀])解锁等级 = min(1 + i*levelsPerSkill, maxLevel)
    levelsPerSkill: 20,
  },
  escape: {
    // p = base + (我方spe/敌spe - 1)*speWeight, clamp[pMin,pMax]; 原版服务端公式不可得, 合成可调
    base: 0.7, speWeight: 0.2, pMin: 0.3, pMax: 0.95,
  },
}

const out = { _src: 'assets/main-config.json + exp.csv', types: typeName, skills, monsters, growth }
mkdirSync(new URL('../game/data/', import.meta.url), { recursive: true })
writeFileSync(new URL('../game/data/pets.json', import.meta.url), JSON.stringify(out))
writeFileSync(new URL('../game/data/rules.json', import.meta.url), JSON.stringify(RULES, null, 1))
console.log(`精灵 ${Object.keys(monsters).length} · 技能 ${Object.keys(skills).length} · 属性 ${Object.keys(typeName).length} · 成长表 ${Object.keys(growth).length} (模糊进化 ${ambiguousCount})`)
const unmapped = [...new Set((C.monster || []).map(m => typeName[m.type]).filter(n => n && !TYPE2EL[n]))]
if (unmapped.length) console.log('未映射属性:', unmapped)
// 进化链无环校验
{
  let cycles = 0
  const seen = new Set()
  for (const [id, g] of Object.entries(growth)) {
    if (g.ambiguous) continue
    const path = new Set()
    let cur = Number(id)
    while (growth[cur] && growth[cur].evolve.length === 1 && !growth[cur].ambiguous) {
      cur = growth[cur].evolve[0].to
      if (path.has(cur) || String(cur) === id) { cycles++; break }
      path.add(cur)
      if (seen.has(cur)) break
    }
    seen.add(Number(id))
  }
  console.log(cycles === 0 ? '进化链: 无环' : `进化链: 检出 ${cycles} 个环!`)
  if (cycles) process.exitCode = 1
}
