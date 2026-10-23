// BattleSettings 的行为锁 —— 拍的是「哪些键能读出来」与 expr ⇄ 列表那对读写视图。
// chunk D 的对拍覆盖 identifier 的取值本身, 这里锁的是 TS 侧容易自作主张改形的地方:
// 拷贝构造漏字段、initBuffs 写进去读不回来、condition 的判定顺序。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { Buff } from '../buff/buff.ts'
import { BattleSettings, BattleMode, BattleRule, setSettingsHost } from './settings.ts'
import { tryParseFloat } from '../strutil.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
const rowOf = (b: any) => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
  b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]
class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo(rowOf(b)); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}
setEffectTable(EFFECTS)                     // 顺序 = 上游 Database.Init: LoadEffects 先于 LoadBuffInfo
setBuffTables(new LoadedBuffInfos(), EFFECTS, (s) => tryParseFloat(s) ?? 0)

const FLOAT_MIN = -3.4028234663852886e38
const modPet = { id: -7, tryGetPetIdentifier: () => ({ ok: false, num: 0 }) }

test('getSettingsIdentifier: Record 读成 PVP, 未知键给 float.MinValue, captureLevel 未开放时是 -1', () => {
  const s = new BattleSettings()
  assert.equal(s.getSettingsIdentifier('mode'), BattleMode.Normal)
  assert.equal(new BattleSettings({ modeId: BattleMode.Record }).getSettingsIdentifier('mode'), BattleMode.PVP)
  assert.equal(s.getSettingsIdentifier('zzz'), FLOAT_MIN)

  assert.equal(s.getSettingsIdentifier('captureLevel'), -1)      // isCaptureOK 默认 false
  s.isCaptureOK = true
  assert.equal(s.getSettingsIdentifier('captureLevel'), 1)
  s.captureLevel = 7
  assert.equal(s.getSettingsIdentifier('captureLevel'), 7)
})

test('isPVP 走 identifier 视图 ⇒ mode=Record 也算 PVP, 与 mode!==Card 的字面比较并存', () => {
  const record = new BattleSettings({ modeId: BattleMode.Record })
  assert.equal(record.mode, BattleMode.Record)
  assert.equal(record.isPVP, true)

  const card = new BattleSettings({ modeId: BattleMode.Card })
  assert.equal(card.isPVP, false)
  assert.equal(card.isAutoOK, false)
  assert.equal(new BattleSettings({ modeId: BattleMode.Normal, parallelCount: 2 }).isAutoOK, false)
  assert.equal(new BattleSettings({ modeId: BattleMode.Normal }).isAutoOK, true)
})

test('isReveal 在非 PVP 时被短路, 根本不问宿主', () => {
  let asked = 0
  setSettingsHost({ pvpReveal: () => { asked++; return true } })
  assert.equal(new BattleSettings({ modeId: BattleMode.Normal }).isReveal, true)
  assert.equal(asked, 0)
  assert.equal(new BattleSettings({ modeId: BattleMode.PVP }).isReveal, true)
  assert.equal(asked, 1)
})

test('isLimited: starLimit>0 或 filterLimit 非空串 (空串按 IsNullOrEmpty 算空)', () => {
  const s = new BattleSettings()
  assert.equal(s.isLimited, false)
  s.filterLimit = ''
  assert.equal(s.isLimited, false)
  s.filterLimit = '(element:1)'
  assert.equal(s.isLimited, true)
})

test('拷贝构造逐字段照抄, 且不把 initBuffs 的解析结果拖进去', () => {
  const s = new BattleSettings()
  s.seed = 1234
  s.mode = BattleMode.YiTeRogue
  s.rule = BattleRule.PP
  s.weather = 4
  s.petCount = 3
  s.parallelCount = 2
  s.starLimit = 5
  s.filterLimit = '(level<50)'
  s.filterLimitDesc = '限 50 级以下'
  s.time = 20
  s.bgm = 'boss'
  s.initBuffExpr = '(w:1002)'

  const c = BattleSettings.from(s)
  assert.equal(c.seed, 1234)
  assert.equal(c.mode, BattleMode.YiTeRogue)
  assert.equal(c.ruleId, BattleRule.PP)
  assert.equal(c.weather, 4)
  assert.equal(c.petCount, 3)
  assert.equal(c.parallelCount, 2)
  assert.equal(c.starLimit, 5)
  assert.equal(c.filterLimit, '(level<50)')
  assert.equal(c.filterLimitDesc, '限 50 级以下')
  assert.equal(c.time, 20)
  assert.equal(c.bgm, 'boss')
  assert.equal(c.initBuffExpr, '(w:1002)')

  c.weather = 9
  assert.equal(s.weather, 4)
})

test('initBuffs: getter 每次现解析 (返回新对象), setter 写成 (key:id) 串', () => {
  const s = new BattleSettings()
  s.initBuffExpr = '(a:1002)(b:1003)'
  const first = s.initBuffs
  assert.deepEqual(first.map((x) => x[0]), ['a', 'b'])
  assert.equal(first[0][1].id, 1002)
  assert.notEqual(s.initBuffs, first)                        // 上游 getter 是 GetInitBuffs() 现算

  s.initBuffs = [['k', new Buff(1002)], ['m', new Buff(1004)]]
  assert.equal(s.initBuffExpr, '(k:1002)(m:1004)')
})

test('initBuffs 的两条上游炸法: 缺冒号越界、id 不是整数', () => {
  const s = new BattleSettings()
  s.initBuffExpr = '(ab)'
  assert.throws(() => s.initBuffs, RangeError)
  s.initBuffExpr = '(a:1x)'
  assert.throws(() => s.initBuffs)
})

test('initBuffExpr 为 null 或剥不掉圆括号时 getter 给空表', () => {
  const s = new BattleSettings()
  assert.deepEqual(s.initBuffs, [])
  s.initBuffExpr = 'no-paren'
  assert.deepEqual(s.initBuffs, [])
})

test('condition 的判定顺序: debugMode 最先, simulate/null 次之, 然后 mod、star、filterLimit', () => {
  setSettingsHost({ debugMode: () => true })
  const s = new BattleSettings({ starLimit: 1 })
  assert.equal(s.condition(modPet, 99, () => 0).ok, true)     // debugMode ⇒ 全放行

  setSettingsHost({ debugMode: () => false })
  s.isSimulate = true
  assert.equal(s.condition(modPet, 99, () => 0).ok, true)     // simulate ⇒ 放行 (在 mod 判定之前)
  s.isSimulate = false

  const r = s.condition(modPet, 99, () => 0)
  assert.equal(r.ok, false)
  assert.match(r.message!, /Mod精灵/)

  // isLimited 为假时 (starLimit=0 且 filterLimit 空) mod 那关整个跳过
  assert.equal(new BattleSettings().condition(modPet, 99, () => 0).ok, true)

  // star 超限: 正 id 的宠走的是 starLimit 那一条
  const okPet = { id: 1, tryGetPetIdentifier: () => ({ ok: false, num: 0 }) }
  assert.match(s.condition(okPet, 6, () => 0).message!, /星/)
})

test('condition 成功时 message 是 filterLimitDesc (上游在 return 之前无条件赋值)', () => {
  const s = new BattleSettings({ filterLimit: '(level<100000)', filterLimitDesc: '描述' })
  const pet = { id: 1, tryGetPetIdentifier: (x: string) => (x === 'level' ? { ok: true, num: 10 } : { ok: false, num: 0 }) }
  // 数字字面量这一侧要过 Identifier.GetNumIdentifier 的兜底, 所以 resolver 得认真数 (stub 恒 0 会把 10<0 判假)
  const r = s.condition(pet, 1, (x) => tryParseFloat(x) ?? 0)
  assert.equal(r.ok, true)
  assert.equal(r.message, '描述')
})

test('conditionAll: 第一只失败就带它的 message 返回; 全过则 message 归 null', () => {
  const s = new BattleSettings({ starLimit: 3 })
  const pets = [{ id: 1, tryGetPetIdentifier: () => ({ ok: false, num: 0 }) }, null]
  assert.equal(s.conditionAll(pets, [2, 1], () => 0).ok, true)
  assert.equal(s.conditionAll(pets, [4, 1], () => 0).ok, false)
})

test('fixToYiTeRogue 就地改并返回自身', () => {
  const s = new BattleSettings({ isSimulate: true, isItemOK: false, petCount: 1, parallelCount: 2 })
  assert.equal(s.fixToYiTeRogue(), s)
  assert.equal(s.mode, BattleMode.YiTeRogue)
  assert.equal(s.isSimulate, false)
  assert.equal(s.isItemOK, true)
  assert.equal(s.petCount, 6)
  assert.equal(s.parallelCount, 1)
})
