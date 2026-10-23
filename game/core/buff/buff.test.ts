// S3 印记层 (Buff) 的行为锁。
// 对拍 (tools/difftest.mjs 的 buffinfo/buffid/buffdesc 三类向量) 已经证明"与上游二进制同输入同输出"；
// 这里补的是对拍**不便隔离**的那几件事: 夹紧的双向性、注入接缝真的能换结果、克隆的独立性、
// 以及那几个 static 构造器的回落形状。异常只断"抛不抛" —— C# 与 JS 的异常类型/文案不对齐是表层差异。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from './buff-info.ts'
import { BuffType } from './buff-database.ts'
import { Buff, setBuffHost, powerupBuffIds, BUFFID_PROTECT_POWERUP } from './buff.ts'
import { tryParseFloat } from '../strutil.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const SKILLS = JSON.parse(readFileSync(here('../../data/unity/skills.json'), 'utf8')).skills
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
const SKILL_NAME = new Map(SKILLS.map((s: any) => [s.id, s.name]))

// 从 buffs.json 重建 CSV 那 7 列再走 BuffInfo 的 CSV 构造 —— 与 difftest 同法, 拍的是构造器而不是 build 产物。
const rowOf = (b: any) => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
  b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]

class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo(rowOf(b)); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}

// 顺序 = 上游 Database.Init (LoadEffects 先于 LoadBuffInfo): BuffInfo.SetEffects 展开常驻 set_skill 壳要回查效果表。
setEffectTable(EFFECTS)
const TABLE = new LoadedBuffInfos()
setBuffTables(TABLE, EFFECTS, (id) => tryParseFloat(id!) ?? 0)
setBuffHost({ petName: () => null, skillName: (id) => (id === 0 ? null : (SKILL_NAME.get(id) ?? null)), allInfos: () => [...TABLE.byId.values()] })

const infoOf = (id: number): BuffInfo => {
  const info = TABLE.byId.get(id)
  assert.ok(info, `表里没有 ${id}`)
  return info!
}

test('真表全量装载: 2121 条印记, 且效果壳已展开 (顺序坑的回归锁) [oracle]', () => {
  assert.equal(TABLE.byId.size, 2121)
  // 3 特攻强化的 [value] 与 1008 慢性毒药的 ref_buff 都要求 effects 非空才有意义
  assert.ok(infoOf(3).effects.length > 0, 'BuffInfo.effects 应已展开, 而不是空数组')
})

test('value 的夹紧读写双向, 且是 int 夹紧不是 float 夹紧', () => {
  // 3000 弱点记号 max_val=2 / 1008 慢性毒药 max_val=10 (上游 options 里实测)
  assert.equal(TABLE.byId.get(3000)!.maxValue, 2)
  const b = new Buff(3000)
  b.value = 9999
  assert.equal(b.value, 2)
  // 没写 min_val ⇒ 下界是 C# 的 int.MinValue (不是 -Infinity), 所以 -9999 本来就在界内、不该被抬起来
  b.value = -9999
  assert.equal(b.value, -9999)
  b.value = -2147483649
  assert.equal(b.value, -2147483648)
  // 上限 2147483647 在 float32 里是 2147483648 ⇒ 必须走 clampInt, 否则越界的 value 会被"合法化"
  const wide = new Buff(3)
  wide.value = 2147483647
  assert.equal(wide.value, 2147483647)
})

test('ref_buff 让 value 与 options 从预制档起步, 显式传 value 仍然优先', () => {
  // 1008 的 ref_buff = "1008[10]" ⇒ 默认档 value=10; Buff(1008, -1, 3) 的 3 覆盖它
  assert.equal(new Buff(1008).value, 10)
  assert.equal(new Buff(1008, -1, 3).value, 3)
})

test('IsType(All) = !IsType(Power) 的递归形状与能力档 id 集合一致', () => {
  const pow = new Buff(1)
  assert.equal(pow.isType(BuffType.Power), true)
  assert.equal(pow.isType(BuffType.Powerup), true)
  assert.equal(pow.isType(BuffType.All), false, 'All 把 Power 排除掉 (Buff.cs:110 的自指递归)')
  assert.equal(new Buff(199).isType(BuffType.Abnormal), true, '199 硬编码进 Abnormal')
  assert.deepEqual(powerupBuffIds(), [1, 3, 5, 7, 9, -9])
  assert.equal(new Buff(-10).isPowerUp(), false)
  assert.equal(new Buff(-10).isPowerDown(), true)
})

test('overrideType 优先级高于表里的 type 列', () => {
  const info = TABLE.byId.get(1999)!
  assert.equal(new Buff(1999).isUnhealthy(), true)
  info.options.set('type', 'powerup.pos')           // 词表里 Powerup 的键是 powerup.pos; 裸 'powerup' 是 Power
  const b = new Buff(1999)
  assert.equal(b.isType(BuffType.Powerup), true)
  assert.equal(b.isType(BuffType.Unhealthy), false)
  assert.equal(b.isType(BuffType.Abnormal), false)
  info.options.set('type', 'powerup')
  assert.equal(b.isType(BuffType.Power), true)
  assert.equal(b.isType(BuffType.Powerup), false, 'override 之后一律按 override 的判定, 不再回落到 IsPowerUp() 的 id 表')
  info.options.delete('type')
})

test('hide / removable 的 option 覆盖按 float 解释, 非 0 即真', () => {
  const b = new Buff(3000)
  assert.equal(b.hide, TABLE.byId.get(3000)!.hide)
  b.options.set('hide', '2')
  assert.equal(b.hide, true)
  b.options.set('hide', '0')
  assert.equal(b.hide, false)
  assert.throws(() => { b.options.set('hide', 'abc'); return b.hide }, /abc/, 'float.Parse 畸形串是炸, 不是 false')
})

test('GetBuffIdentifier 的读写接缝: 未知键不可写, 已知键写后即读', () => {
  const b = new Buff(3)
  assert.equal(b.getBuffIdentifier('nope'), -3.4028234663852886e38)  // float.MinValue 哨兵
  assert.equal(b.tryGetBuffIdentifier('nope').ok, false)
  b.setBuffIdentifier('option[round]', 5)
  assert.equal(b.getBuffIdentifier('round'), 5)
  assert.equal(b.options.get('round'), '5')
  b.setBuffIdentifier('turn', 3)
  assert.equal(b.turn, 3)
  b.setBuffIdentifier('ignore', 1)
  assert.equal(b.ignore, true)
  assert.equal(b.isUnmovable(), false, 'ignore 直接短路 movable 判定 (Buff.cs:145-153)')
})

test('setBuffIdentifier("id", …) 查表失败即 no-op, 成功则重建 effects 且 source 指回自身', () => {
  const b = new Buff(3)
  b.setBuffIdentifier('id', 98765432)
  assert.equal(b.id, 3, '查不到的 id 不能把印记改成无主状态')
  b.setBuffIdentifier('id', 1999)
  assert.equal(b.id, 1999)
  assert.ok(b.effects.length > 0)
  for (const e of b.effects) assert.equal(e.source, b, 'Effect.source 必须指回这只 Buff')
})

test('文案替换: 注入的技能名进得来, 空栏位与兜底出得去', () => {
  assert.equal(Buff.getBuffDescriptionPreview('特攻强化[value]級', new Buff(3, -1, 2)), '特攻强化2級')
  // [option[value]:skill] —— value 是技能 id, 交给注入的 host 查名
  const b = new Buff(3582)
  b.setBuffIdentifier('option[value]', 10001)
  assert.match(Buff.getBuffDescriptionPreview('[option[value]:skill]', b), new RegExp(String(SKILL_NAME.get(10001))))
  assert.equal(Buff.getBuffDescriptionPreview('[option[nosuch]:num]', b), '空栏位')
  assert.equal(Buff.getBuffDescriptionPreview('[9:nope]', b), '-2147483648', '未知值类型 ⇒ v.ToString(), 而 value 取不到就是 float.MinValue 强转 int')
  // 裸键 [pet] 走的是最后那轮**无条件**替换, 实参是 referenceBuff.value (带冒号的 [x:pet] 里 x 是 option 键)
  const pv = new Buff(3, -1, 5)
  assert.equal(Buff.getBuffDescriptionPreview('[pet]', pv), '精灵信息错误', '宠表未接入时与 oracle 同口径 (见 port-map)')
  // 注入不同的 host 必须改变结果 —— 接缝没接上时这条会红
  setBuffHost({ petName: (id) => (id === 5 ? '迪兰' : null) })
  assert.equal(Buff.getBuffDescriptionPreview('[pet]', pv), '迪兰')
  assert.equal(Buff.getBuffDescriptionPreview('[5:pet]', pv), '精灵信息错误', 'option 键 "5" 取不到 ⇒ float.MinValue 强转, 查不到宠')
  setBuffHost({ petName: () => null })
})

test('getDescription 的四行后缀按 info 标志与 turn 追加', () => {
  const legacy = new Buff(3000)                                // inherit + legacy + auto_remove 都 true
  const text = legacy.getDescription()
  assert.match(text, /（阵亡继承给下一位精灵）/)
  assert.match(text, /（换场继承给下一位精灵）/)
  legacy.turn = 4
  assert.match(legacy.getDescription(), /持续 4 回合/)
  assert.doesNotMatch(legacy.getDescription(), /持续 \d+ 轮次/)
  legacy.setBuffIdentifier('option[round]', 2)
  assert.match(legacy.getDescription(), /持续 2 轮次/)
})

test('static 构造器的回落形状', () => {
  assert.equal(Buff.getPowerUpBuffId(5, 3), -9)
  assert.equal(Buff.getPowerUpBuffId(5, -3), -10)
  assert.equal(Buff.getPowerUpBuffId(2, 1), 5)                 // 2*type + (幂>0 ? 1 : 2)
  assert.equal(Buff.getPowerUpBuffId(2, 0), 0, 'powerup=0 不产生能力档')
  assert.equal(Buff.getProtectBuffTypeId(BuffType.Powerup), BUFFID_PROTECT_POWERUP)
  assert.equal(Buff.getProtectBuffTypeId(BuffType.Feature), 0)
  assert.equal(Buff.getWeatherBuff(999999).id, 50_0000, '查不到回落成通用天气')
  assert.equal(Buff.getFeatureBuff(1)!.name, '终结')            // 1>0 ⇒ 10_0000 段
  assert.equal(Buff.getFeatureBuff(0), null, 'featureId=0 落 90_0000, 而表里没有 900000 ⇒ 不兜底')
  assert.equal(Buff.getFeatureBuff(null), null)
  assert.equal(Buff.getEmblemBuff(7)!.id, 200007)               // emblemId>=0 ⇒ 20_0000 段
  assert.equal(Buff.getEmblemBuff(7)!.value, 1, '纹章印记起手 value=1')
  assert.equal(Buff.getEmblemBuff(-7), null, '80_0007 不在表里 ⇒ null')
  assert.equal(Buff.getFeatureBuff(98765432), null, '表里没有的特性直接 null, 不兜底')
})

test('clone 与 fromReferData 得到独立的 options / 指向自身的 effects', () => {
  const b = new Buff(3000, 5, 1)
  b.setBuffIdentifier('option[stamp]', 7)
  const c = b.clone()
  c.setBuffIdentifier('option[stamp]', 9)
  assert.equal(b.getBuffIdentifier('option[stamp]'), 7, '克隆必须切断 options 别名')
  assert.equal(c.getBuffIdentifier('option[stamp]'), 9)
  assert.notEqual(c.effects, b.effects)
  for (const e of c.effects) assert.equal(e.source, c)
})

test('易特药剂三池按 isInRange 分组, 与上游 LINQ Where 同集合', () => {
  const pool = [...TABLE.byId.values()]
  const mine = Buff.yiteEasyBuffDatabase.map((x) => x.id).sort((a, b2) => a - b2)
  const theirs = pool.filter((i) => (i.id >= 420000 && i.id < 430000) || (i.id >= 400005 && i.id < 400010))
    .map((i) => i.id).sort((a, b2) => a - b2)
  assert.deepEqual(mine, theirs)
  assert.ok(mine.length > 0, '池子空了通常说明 allInfos 接缝没接上')
})
