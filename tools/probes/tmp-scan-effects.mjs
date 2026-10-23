import { readFileSync } from 'node:fs'
const D = 'projects/Seer2-Restart-Lite-main/Assets/Resources/Data/'
const flat = (p) => readFileSync(D + p, 'utf8').split(/[,\n]/).filter((x) => x !== '')
const COL = 8 // owner id + 7

// 1) 各 effect 表: 列长度相对第 0 列的形态 (C# 用 effectData[0].Length 作循环上界)
for (const rel of ['Skills/effect.csv', 'Buffs/effect.csv', 'Items/effect.csv', 'Effects/effect.csv']) {
  const t = flat(rel), n = Math.floor(t.length / COL)
  let shorter = 0, longer = 0, equal = 0
  const examples = []
  for (let i = 1; i < n; i++) {
    const cols = []
    for (let j = 1; j <= 7; j++) cols.push(t[COL * i + j].split('\\').filter((x) => x !== '').length)
    const bound = cols[0]
    const mn = Math.min(...cols), mx = Math.max(...cols)
    if (mn < bound) { shorter++; examples.push({ id: t[COL * i], bound, cols }) } else if (mx > bound) longer++
    else equal++
  }
  console.log(`${rel.padEnd(20)} 行${n - 1}  等长${equal}  有超额列(被忽略)${longer}  有短列(C# 抛→整行丢)${shorter}`)
  if (examples.length) console.log('   短列样本:', JSON.stringify(examples.slice(0, 3)))
}

// 2) 词表未命中全量
const VOCAB = JSON.parse(readFileSync('game/data/vocab.json', 'utf8')).values
const miss = []
for (const [rel, kindIdx] of [['Skills/effect.csv', 1], ['Buffs/effect.csv', 1], ['Items/effect.csv', 1], ['Effects/effect.csv', 1]]) {
  const t = flat(rel), n = Math.floor(t.length / COL)
  for (let i = 1; i < n; i++) {
    const col = (j) => t[COL * i + j].split('\\').filter((x) => x !== '')
    const sets = { timing: VOCAB.timing, target: VOCAB.target, condition: VOCAB.condition, ability: VOCAB.ability }
    const bound = col(1).length
    for (const [name, j] of [['timing', 1], ['target', 3], ['condition', 4], ['ability', 6]]) {
      for (const v of col(j)) if (!(v in sets[name])) miss.push(`${rel}#${t[COL * i]} ${name}="${v}"`)
    }
  }
}
const agg = {}
for (const m of miss) { const k = m.replace(/#\d+/, '#*'); agg[k] = (agg[k] || 0) + 1 }
console.log('\n词表未命中(去 id 聚合):')
console.log(Object.entries(agg).map(([k, v]) => `  ${k} ×${v}`).join('\n'))

// 3) Skills 表 type 列全部取值
const sk = flat('Skills/info.csv'), n2 = Math.floor(sk.length / 9)
const types = {}
for (let i = 1; i < n2; i++) types[sk[9 * i + 3]] = (types[sk[9 * i + 3]] || 0) + 1
console.log('\nSkills type 列:', JSON.stringify(types))
console.log('Skills id=-1/-7 行:', sk.slice(9, 18).join('|'), '||', sk.slice(9 * 2, 9 * 3).join('|'))

// 4) Buffs/info 的 ",\n" 空尾列实况
const bi = readFileSync(D + 'Buffs/info.csv', 'utf8')
const lines = bi.split('\n')
console.log('\nBuffs/info 以逗号结尾的行数:', lines.filter((l) => l.endsWith(',')).length)
console.log(JSON.stringify(lines.filter((l) => l.endsWith(','))[0]))
console.log('Buffs/info 含 ",," 的行数:', lines.filter((l) => l.includes(',,')).length)
console.log('Buffs/info 首列空的行数:', lines.filter((l) => l.startsWith(','))
  .length)
