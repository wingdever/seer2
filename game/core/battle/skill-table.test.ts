// 第五段·步骤3 的单测 —— `skilltable` 一族 (636 条) 比的是**逐列签名**, 它锁得住"列的值",
// 锁不住下面这三类只有形状可讲的东西:
//   · InitCost 那三条分支的**分支归属** (两段费用 / 单段走 Mathf.Max(5, 40−anger) / 200 怒气被下限 5 兜住) ——
//     对拍里它们各自只是一行数字, 看不出"这条数是被哪条分支算出来的";
//   · ignore_powerup/ignore_powerdown **不是字段**而是 Linear 乘子的派生属性, 且 setter 双向覆盖;
//   · GetRawInfoStringArray 的 options 列是**重算**的, 于是"行 → 技能 → 行"不是恒等 —— 它是幂等投影。
// 期望值全部取自二进制 (真表 −1012 / 11094 / 11696 / 14985 / 12323 五条的 oracle 签名), 不取自源码阅读。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  SKILL_DATA_COL,
  JsonSkillTable,
  blankSkillRecord,
  getSkillRawInfoStringArray,
  powerdownIgnored,
  powerupIgnored,
  setPowerdownIgnored,
  setPowerupIgnored,
  skillFromRow,
  type SkillJsonRow,
} from './skill-table.ts'

// 九列原始行 —— 与 JsonSkillTable 喂给 ctor 的那条形状一致 (options 还原成 k=v&… 的原序串)。
const row = (id: number, opts: Record<string, string>, cost = '15', power = 90, acc = 95): string[] => [
  String(id), `技${id}`, '0', '1', String(power), cost, String(acc),
  Object.entries(opts).map(([k, v]) => `${k}=${v}`).join('&'), `描述${id}`,
]

// JsonSkillTable 的入参形状 (build 产物的那一层)。
const jsonRow = (id: number, opts: Record<string, string>, cost = '15'): SkillJsonRow => ({
  id, name: `技${id}`, elementId: 0, type: 1, power: 90, rawCostString: cost, accuracy: 95,
  options: Object.entries(opts), rawDescription: `描述${id}`, effects: [],
})

test('InitCost 单段: anger 取第一段, maxPP 走 Mathf.Max(5, 40 − anger) (11094 的 "15" ⇒ 25)', () => {
  const s = skillFromRow(row(11094, {}, '15'))
  assert.equal(s.anger, 15)
  assert.equal(s.maxPP, 25)
  // `PP = maxPP` 是**夹紧属性**, 所以落库的 pp 就是 maxPP —— skills.json 没有 pp 这列不是缺数据。
  assert.equal(s.pp, 25)
})

test('InitCost 下限 5 真的兜得住: 200 怒气的 "200" ⇒ max(5, 40−200) = 5 (14985)', () => {
  const s = skillFromRow(row(14985, {}, '200'))
  assert.equal(s.anger, 200)
  assert.equal(s.maxPP, 5)
  assert.equal(s.pp, 5)
  const zero = skillFromRow(row(10001, {}, '0')) // 10001 拍打的 "0" ⇒ max(5, 40) = 40
  assert.equal(zero.anger, 0)
  assert.equal(zero.maxPP, 40)
  assert.equal(zero.pp, 40)
})

test('InitCost 两段: 第二段 > 0 时**直接取它**, 不再走 Mathf.Max (11696 的 "15/20" ⇒ 20)', () => {
  const s = skillFromRow(row(11696, {}, '15/20'))
  assert.equal(s.anger, 15)
  assert.equal(s.maxPP, 20)
  assert.equal(s.pp, 20)
})

test('空费用串当场抛, 不是静默 0 (ToIntList("") 给空表, anger = list[0])', () => {
  assert.throws(() => skillFromRow(row(1, {}, '')), /InitCost|ArgumentOutOfRange/)
})

test('列数不足按上游的越界口径抛 (DATA_COL = 9)', () => {
  assert.equal(SKILL_DATA_COL, 9)
  assert.throws(() => skillFromRow(row(1, {}).slice(1)), /9 列/)
})

test('combo = chain = 1 写在 InitOptionsProperty **之前**, 且 options 从不带这两条键', () => {
  const s = skillFromRow(row(1, { combo: '5', chain: '7' }))
  // 这两条不是 option 键 ⇒ 回写期不动它们; 运行期的改写走另一条路 (case "combo")。
  assert.equal(s.combo, 1)
  assert.equal(s.chain, 1)
  assert.equal(blankSkillRecord().combo, 0) // 无参 ctor 是 0, 1 只属于"从行装载"这条路
})

test('critical 的 5 来自 options 的**默认串**: 无参 ctor 造出来是 0, 走过装载才是 5', () => {
  assert.equal(blankSkillRecord().critical, 0)
  assert.equal(skillFromRow(row(1, {})).critical, 5)
  assert.equal(skillFromRow(row(1, { critical: '6.25' })).critical, 6.25)
})

test('ignore_powerup 是**派生属性**: 置位 = 把 powerup.mult 的 def 与 mdf 同时写 0 (−1012 的 1,1,0,0,1,1)', () => {
  const s = skillFromRow(row(-1012, { priority: '4', ignore_powerup: 'true', ignore_shield: 'true' }, '100'))
  assert.equal(powerupIgnored(s), true)
  assert.equal(powerdownIgnored(s), false)
  const m = s.powerup!.mult
  assert.deepEqual([m.atk, m.mat, m.def, m.mdf], [1, 1, 0, 0])
  // 判"忽略"用的是**乘积**, 所以只置其中一个也算忽略 —— 这条口径与上游一致 (def * mdf == 0)。
  const half = skillFromRow(row(2, {}))
  half.powerup!.mult.def = 0
  assert.equal(powerupIgnored(half), true)
})

test('ignore_powerdown 落在 powerdown.mult 的 **atk/mat** 上 (11094 的 0,0,1,1,1,1)', () => {
  const s = skillFromRow(row(11094, { ignore_powerdown: 'true', ignore_powerup: 'true' }))
  const m = s.powerdown!.mult
  assert.deepEqual([m.atk, m.mat, m.def, m.mdf], [0, 0, 1, 1])
  assert.equal(powerdownIgnored(s), true)
  assert.equal(powerupIgnored(s), true)
})

test('两个 ignore setter 是**双向覆盖**: 给 false 会把 0 改回 1, 不是"只置不清"', () => {
  const s = skillFromRow(row(1, {}))
  setPowerupIgnored(s, true)
  assert.deepEqual([s.powerup!.mult.def, s.powerup!.mult.mdf], [0, 0])
  setPowerupIgnored(s, false)
  assert.deepEqual([s.powerup!.mult.def, s.powerup!.mult.mdf], [1, 1])
  setPowerdownIgnored(s, true)
  assert.deepEqual([s.powerdown!.mult.atk, s.powerdown!.mult.mat], [0, 0])
  setPowerdownIgnored(s, false)
  assert.deepEqual([s.powerdown!.mult.atk, s.powerdown!.mult.mat], [1, 1])
})

test('ref_buff 缺键时 referBuffList 是 **null** 而不是空表 (Split 的接收者是 null)', () => {
  assert.equal(skillFromRow(row(1, {})).referBuffList, null)
  assert.deepEqual(skillFromRow(row(1, { ref_buff: '2010[200]' })).referBuffList, ['2010[200]'])
  assert.deepEqual(skillFromRow(row(1, { ref_buff: '104/1001' })).referBuffList, ['104', '1001'])
})

test('options 列由字段**重算**: true→"True", 且默认键挪到 critical/priority 之后、非默认键按插入序带走', () => {
  // 上游真表里 11094 的列是 `ignore_powerdown=true&ignore_powerup=true`, 回写出来是
  // `ignore_powerup=True&ignore_powerdown=True` —— 大小写与顺序**同时**变, 这一列不是原文照抄。
  assert.equal(getSkillRawInfoStringArray(skillFromRow(row(11094, { ignore_powerdown: 'true', ignore_powerup: 'true' })))[7],
    'ignore_powerup=True&ignore_powerdown=True')
  // −1012: critical 恰为默认 5 ⇒ 不出现; priority/护盾/强化按字段顺序, ref_buff 压轴。
  assert.equal(getSkillRawInfoStringArray(skillFromRow(row(-1012, { priority: '4', ignore_powerup: 'true', ignore_shield: 'true' }, '100')))[7],
    'priority=4&ignore_shield=True&ignore_powerup=True')
  assert.equal(getSkillRawInfoStringArray(skillFromRow(row(11696, { priority: '3', ref_buff: '2010[200]' }, '15/20')))[7],
    'priority=3&ref_buff=2010[200]')
  // 两支都空才是 none (14985); 中间的 '&' 只在有内容时插, 两端的由 Trim('&') 砍掉。
  assert.equal(getSkillRawInfoStringArray(skillFromRow(row(14985, {}, '200')))[7], 'none')
})

test('其余八列是字段直读, 原样回写 (第九列连清洗都不做 —— 只有工坊那条 ctor 清洗)', () => {
  const src = row(12323, {}, '50', 50, 1100)
  src[1] = '雷光炙炎'
  src[8] = '随机连击4~7次[ENDL]'
  const back = getSkillRawInfoStringArray(skillFromRow(src))
  assert.deepEqual([back[0], back[1], back[2], back[3], back[4], back[5], back[6], back[8]],
    [src[0], src[1], src[2], src[3], src[4], src[5], src[6], src[8]])
})

test('逆函数是**幂等投影**: 5340 行全表跑两趟, 只有第 8 列会动, 且第二趟起不再动', () => {
  const path = join(import.meta.dirname, '../../data/unity/skills.json')
  const rows = (JSON.parse(readFileSync(path, 'utf8')).skills as SkillJsonRow[])
    .map(r => [String(r.id), r.name, String(r.elementId), String(r.type), String(r.power),
      r.rawCostString, String(r.accuracy), r.options.map(([k, v]) => `${k}=${v}`).join('&'), r.rawDescription])
  assert.equal(rows.length, 5340)
  let moved = 0
  for (const src of rows) {
    const once = getSkillRawInfoStringArray(skillFromRow(src))
    for (let c = 0; c < 9; c++)
      if (once[c] !== src[c]) assert.equal(c, 7, `${src[0]} 号行的第 ${c} 列不该被重算`)
    if (once[7] !== src[7]) moved++
    // 第二趟必须与原样吐出 ⇒ 装载→回写→装载 落在不动点上。
    assert.deepEqual(getSkillRawInfoStringArray(skillFromRow(once)), once, `${src[0]} 号行二往返不稳`)
  }
  // 真表实测 3371 行的 options 列会被重算 (空串→none 的 3241 行也在这 3371 里)。
  assert.ok(moved > 3000 && moved < rows.length, `重算列的覆盖面异常: ${moved}`)
})

test('JsonSkillTable: Database.cs:132 的 `id == 0` 短路与查不到的洞', () => {
  const t = new JsonSkillTable([jsonRow(0, {}), jsonRow(11094, { ignore_powerdown: 'true' })])
  // 表里**真有** 0 号行也查不到 —— 上游在查表之前就短路了。
  assert.equal(t.getSkill(0), null)
  assert.equal(t.getSkill(12345), null)
  assert.equal(t.size, 2)
})

test('负 id 照进照查 (真表有 13 条负 id, 形如 −1012 的大技)', () => {
  const t = new JsonSkillTable([jsonRow(-1012, { priority: '4' }, '100')])
  assert.equal(t.getSkill(-1012)?.name, '技-1012')
  assert.equal(t.getSkill(-1012)?.priority, 4)
  assert.equal(t.getSkill(-1012)?.maxPP, 5)
})
