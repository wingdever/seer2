// 内核批二·前置 —— `Skill.SetSkillIdentifier` 的写侧与四支 Skill 工厂的行为锁。
//
// 对拍的 `wsk:` 一族 (38 条) 拍的是"两边同值", 但**同一个数落进同一个字段**可以由三条不同的路走来:
// 夹紧 (Mathf.Max/PP 属性)、乘积判据 (ignorePowerup 那两格)、静默不写 (default 支与临时对象丢弃)。
// 签名里那一个数字看不出走了哪条, 所以这里按分支逐条锁住, 并把"读侧与写侧是两套顺序"这件事
// 落在断言里 (option 的括号要求: 读侧不要求、写侧要求)。
//
// 期望值全部取自二进制 (`node tools/ask-oracle.mjs` 的 {"kind":"skillsys","op":"wsk:…"} 返回值),
// 每条 test 的方括号里标的是那条向量, 不是源码行号 —— 读源码得出的期望值不算证据。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, setEffectTable } from '../effect/effect.ts'
import { EffectAbility, EffectTiming } from '../effect/effect-database.ts'
import { f } from '../mathf.ts'
import { JsonSkillTable } from './skill-table.ts'
import { SkillType } from '../pet/skill.ts'
import {
  cloneSkill, escapeSkill, getSkillIdentifier, isActionSkill, noOpSkill, petChangeSkill,
  petChangeSkillWithTiming, randomSkill, setRandomSkillSource, setSkillIdentifier, setSkillTable,
  skillPP, type SkillRecord,
} from './views.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
setEffectTable(new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs))
setSkillTable(new JsonSkillTable(JSON.parse(readFileSync(here('../../data/unity/skills.json'), 'utf8')).skills))

const FLOAT_MIN = -3.4028234663852886e38

// 与 oracle `spec.skill` 那份 stub 同源: 底借 noOpSkill 的完整形状, 再逐条复位成 `Skill()` 空构造的默认,
// 最后只覆盖批二那批向量真给了值的列。
const WSK = (over: Partial<SkillRecord> = {}): SkillRecord => {
  const s = noOpSkill(-1)
  for (const n of ['id', 'elementId', 'type', 'power', 'anger', 'pp', 'maxPP', 'accuracy', 'combo', 'chain', 'priority', 'vipriority'])
    (s as unknown as Record<string, number>)[n] = 0
  s.critical = 0
  for (const n of ['name', 'rawDescription', 'rawCostString']) (s as unknown as Record<string, null>)[n] = null
  s.options = new Map(); s.effects = []; s.referBuffList = []
  s.isSecondSuper = false; s.ignoreShield = false
  s.isAction = isActionSkill(s.type)
  Object.assign(s, { id: 5001, type: 1, anger: 6, pp: 2, maxPP: 4, power: 40, accuracy: 95, priority: 1, elementId: 2, critical: f(6), combo: 2, name: 'WSK' }, over)
  s.isAction = isActionSkill(s.type)
  return s
}
// 写完立刻**同键回读** —— 与 oracle 的 `v=` 那一格同一件事 (两套分支顺序差就在这一步露出来)。
const wsk = (key: string, value: number, s = WSK()): { s: SkillRecord, v: number } => {
  setSkillIdentifier(s, key, value)
  return { s, v: getSkillIdentifier(s, key) }
}

// ── option 支: 写侧要求方括号, 读侧不要求 ────────────────────────────────
test('option[..] 落 float 的十进制串, 同键回读是同一个 32 位值 [wsk:option[hide]=0.5 → o<hide=0.5>|v=0.5]', () => {
  const { s, v } = wsk('option[hide]', f(0.5))
  assert.equal(s.options!.get('hide'), '0.5')
  assert.ok(Object.is(v, f(0.5)))
  assert.equal(wsk('option[hide]', f(-3)).s.options!.get('hide'), '-3')
})

test('写侧只认 "option[": optionX 穿透到 default 静默不写, 而读侧照样去查键 X [wsk:optionX=1 → o<>|v=0]', () => {
  const { s, v } = wsk('optionX', 1)
  assert.equal(s.options!.size, 0)          // 写侧: 没括号 ⇒ 整条穿透, 一个键都没落
  assert.equal(v, 0)                        // 读侧: TrimParentheses("X") 查不到 ⇒ 缺省 "0" ⇒ 数值 0
})

test('option[] 的键是空串, 不是"没有键" [wsk:option[]=2 → o<=2>|v=2]', () => {
  const { s, v } = wsk('option[]', 2)
  assert.equal(s.options!.get(''), '2')
  assert.equal(v, 2)
})

test('写 0.3333333333 存的是 fround 的展宽文本, 但读回来是 0.33333334 —— 文本差不算分歧 [wsk:option[hide]=0.3333333333]', () => {
  const { s, v } = wsk('option[hide]', f(0.3333333333))
  assert.equal(s.options!.get('hide'), String(f(0.3333333333)))   // C# 那边写 "0.33333334" ⇒ 字符串比不得
  assert.ok(Object.is(v, f(0.33333334)))
})

test('evolve 是 option[evolve] 的转发, 读写两头都是 [wsk:evolve=1 → o<evolve=1>|v=1]', () => {
  const { s, v } = wsk('evolve', 1)
  assert.equal(s.options!.get('evolve'), '1')
  assert.equal(v, 1)
})

test('description[..] 写侧静默不写, 读侧在 rawDescription==null 上 NRE (上游不兜底) [wsk:description[WSK]=1 → NullReferenceException]', () => {
  const s = WSK()
  setSkillIdentifier(s, 'description[WSK]', 1)
  assert.equal(s.options!.size, 0)
  assert.equal(s.rawDescription, null)
  assert.throws(() => getSkillIdentifier(s, 'description[WSK]'))
})

test('options 为 null 时: option 支抛 (dictSet 吃 null), 而 powerup 支压根不碰 options [wsk:option[hide]=1 → NRE / wsk:powerup.pos.mult.hp=2 → ok]', () => {
  const s = WSK({ options: null as unknown as Map<string, string> })
  assert.throws(() => setSkillIdentifier(s, 'option[hide]', 1))
  setSkillIdentifier(s, 'powerup.pos.mult.hp', 2)
  assert.equal(s.powerup.mult.get('hp'), 2)
})

// ── powerup 支: 两处"写进临时对象"的静默丢弃 ────────────────────────────
test('powerup.pos.mult.def=0 ⇒ 只有一格为 0 也算 ignorePowerup (判据是**乘积**) [wsk:powerup.pos.mult.def=0 → igFalse/True/False]', () => {
  const { s, v } = wsk('powerup.pos.mult.def', 0)
  assert.equal(s.powerup.mult.get('def'), 0)
  assert.equal(s.powerup.mult.get('mdf'), 1)                       // 只写了一格
  assert.equal(getSkillIdentifier(s, 'ignorePowerup'), 1)
  assert.equal(v, 0)
})

test('powerup.pos.mult.def=0.5 ⇒ 乘积 0.5 不为 0 ⇒ ignorePowerup 仍是 False [wsk:powerup.pos.mult.def=0.5]', () => {
  const { s } = wsk('powerup.pos.mult.def', f(0.5))
  assert.equal(s.powerup.mult.get('def'), 0.5)
  assert.equal(getSkillIdentifier(s, 'ignorePowerup'), 0)
})

test('split[0] 既非 pos 又非 neg ⇒ 写进一只**临时** Linear, 静默丢弃 [wsk:powerup.bog.mult=2 → pu 原样|v=1]', () => {
  const { s, v } = wsk('powerup.bog.mult', 2)
  assert.equal(s.powerup.mult.get('all'), 1)                       // 一只没动过
  assert.equal(s.powerdown.mult.get('all'), 1)
  assert.equal(v, 1)                                               // 读侧同样 new 一只 one/zero 再读 ⇒ 1
})

test('split[1] 既非 mult 又非 add ⇒ 写进一只**临时** Status.zero(), 同样丢弃 [wsk:powerup.pos.bog=2 → v=0]', () => {
  const { s, v } = wsk('powerup.pos.bog', 2)
  assert.equal(s.powerup.mult.get('all'), 1)
  assert.equal(v, 0)
})

test('powerup.neg.add.atk 走的是 powerdown 那一侧的 add [wsk:powerup.neg.add.atk=1.5 → pd=1.5,0,…]', () => {
  const { s, v } = wsk('powerup.neg.add.atk', f(1.5))
  assert.equal(s.powerdown.add.get('atk'), 1.5)
  assert.equal(s.powerdown.mult.get('atk'), 1)
  assert.equal(v, 1.5)
})

// ── 具名写入口: 夹紧的、不夹紧的、不存在的 ──────────────────────────────
test('power/anger/combo 走 Mathf.Max(0) 夹紧; accuracy 不夹紧 [wsk:power=-5 → /0|wsk:accuracy=120|wsk:combo=-2 → 0]', () => {
  assert.equal(wsk('power', -5, WSK({ power: 40 })).s.power, 0)
  assert.equal(wsk('anger', -1).s.anger, 0)
  assert.equal(wsk('combo', -2).s.combo, 0)
  assert.equal(wsk('accuracy', 120).s.accuracy, 120)
})

test('int 列写 float 是截断 (不是四舍六入), 而 critical 是 float 列, 7.5 原样留着 [wsk:anger=1.7 → a1|wsk:critical=7.5 → /7.5/]', () => {
  assert.equal(wsk('anger', f(1.7)).s.anger, 1)
  assert.equal(wsk('chain', f(2.9)).s.chain, 2)
  assert.ok(Object.is(wsk('critical', f(7.5)).s.critical, f(7.5)))
})

test('pp 写的是**夹紧后的**字段值: 999 落 maxPP, -2 落 0 [wsk:pp=999 → pp4/4/4|wsk:pp=-2 → pp0/0/4]', () => {
  assert.equal(wsk('pp', 999).s.pp, 4)
  assert.equal(wsk('pp', -2).s.pp, 0)
})

test('maxPP 归 0 后字段 pp 仍是 2, 但 PP 属性读回 0 —— 夹紧在 getter 上, 不是写侧回滚 [wsk:maxPP=-3 → pp2/0/0]', () => {
  const { s, v } = wsk('maxPP', -3)
  assert.equal(s.maxPP, 0)
  assert.equal(s.pp, 2)
  assert.equal(skillPP(s), 0)
  assert.equal(v, 0)
})

test('type 写下去会重算 isAction; element/priority/vipriority 是直写 [wsk:type=-3|wsk:element=4|wsk:priority=-1|wsk:vipriority=3]', () => {
  const s = WSK()
  s.isAction = false                                                 // 先把它掰成与 type 不一致
  setSkillIdentifier(s, 'type', SkillType.換场)
  assert.equal(s.type, -3)
  assert.equal(s.isAction, true)
  setSkillIdentifier(s, 'type', SkillType.属性)
  assert.equal(s.isAction, false)
  assert.equal(wsk('element', 4).s.elementId, 4)
  assert.equal(wsk('priority', -1).s.priority, -1)
  assert.equal(wsk('vipriority', 3).s.vipriority, 3)
})

test('id 与任何不认识的键都落 default: 静默不写、不抛, 读侧该是多少还是多少 [wsk:id=999 → sig 仍 #5001|wsk:nope=1 → v=float.MinValue]', () => {
  assert.equal(wsk('id', 999).s.id, 5001)
  assert.equal(wsk('nope', 1).v, FLOAT_MIN)
})

test('ignoreShield 按"非零即真"写 bool, 读回 1/0 [wsk:ignoreShield=1 → igTrue|wsk:ignoreShield=0 → igFalse]', () => {
  assert.equal(wsk('ignoreShield', 1).s.ignoreShield, true)
  assert.equal(wsk('ignoreShield', 0).s.ignoreShield, false)
})

test('ignorePowerup/ignorePowerdown **没有字段**, 写它们等于把 mult 的两格打成 0 或 1; 2 也算真 [wsk:ignorePowerup=1 → pu 1,1,0,0|wsk:ignorePowerdown=2 → pd 0,0,…]', () => {
  const a = wsk('ignorePowerup', 1).s
  assert.equal(a.powerup.mult.get('def'), 0)
  assert.equal(a.powerup.mult.get('mdf'), 0)
  assert.equal(getSkillIdentifier(a, 'ignorePowerup'), 1)
  const b = wsk('ignorePowerup', 0).s
  assert.equal(b.powerup.mult.get('def'), 1)
  assert.equal(b.powerup.mult.get('mdf'), 1)
  const c = wsk('ignorePowerdown', 2).s
  assert.equal(c.powerdown.mult.get('atk'), 0)
  assert.equal(c.powerdown.mult.get('mat'), 0)
  assert.equal(getSkillIdentifier(c, 'ignorePowerdown'), 1)
})

test('effect=0 给空表, effect=<表里的 id> 给**逐条回指本技能**的拷贝, 查不到也是空表 [wsk:effect=11094 → ef2/2|wsk:effect=999999 → ef0/0]', () => {
  const zero = wsk('effect', 0, WSK({ effects: [] }))
  assert.equal(zero.s.effects.length, 0)

  const s = WSK()
  setSkillIdentifier(s, 'effect', 11094)
  assert.equal(s.effects.length, 2)
  assert.ok(s.effects.every((x) => x.source === s))                 // ef 的第二格就是这条回指计数
  assert.equal(getSkillIdentifier(s, 'effect'), 2)

  const miss = wsk('effect', 999999)
  assert.equal(miss.s.effects.length, 0)
})

test('parallelTargetIndex 的 source 是从**自己的** parallel_source_index 里 int.Parse 出来的, 不是入参 [wsk:parallelTargetIndex=2 → ps=0|预置 3 → ps=3]', () => {
  const a = wsk('parallelTargetIndex', 2, WSK({ options: new Map([['source_index', '1']]) }))
  assert.equal(a.s.options!.get('parallel_source_index'), '0')      // 读的是自己那把键, 缺省 "0"
  assert.equal(a.s.options!.get('parallel_target_index'), '2')
  assert.equal(a.v, 2)

  const b = wsk('parallelTargetIndex', 2, WSK({ options: new Map([['parallel_source_index', '3']]) }))
  assert.equal(b.s.options!.get('parallel_source_index'), '3')

  const c = WSK({ options: new Map([['parallel_source_index', '1.5']]) })
  assert.throws(() => setSkillIdentifier(c, 'parallelTargetIndex', 2), /FormatException|1\.5/)
})

// ── 四支特殊技工厂 (批二的 type=id 全靠它们) ────────────────────────────
test('空过技: id/type 都是 -1, critical 自己补 5、combo 1、accuracy 100、power/anger/pp 全 0 [oracle value=-1 → #-1:-1/5/1/100/0|a0|pp0/0/0|o<parallel_source_index=-1>]', () => {
  const s = noOpSkill()
  assert.equal(s.id, -1)
  assert.equal(s.type, SkillType.空过)
  assert.equal(s.critical, 5)
  assert.equal(s.combo, 1)
  assert.equal(s.accuracy, 100)
  assert.equal(s.power, 0)
  assert.equal(s.anger, 0)
  assert.equal(s.maxPP, 0)
  assert.equal(skillPP(s), 0)
  assert.equal(s.name, '空过')
  assert.equal(s.rawDescription, '跳过自己的回合')
  assert.equal(s.options!.get('parallel_source_index'), '-1')
  assert.equal(s.effects.length, 0)                                 // 字段初始化器, 不过常驻壳展开
  assert.equal(noOpSkill(7).options!.get('parallel_source_index'), '7')
})

test('逃跑技: priority 6、单数重载只挂一条效果并回指, rawDescription 是 null ⇒ description 支 NRE [oracle value=-4 → #-4:-4/0/1/100/0|pr6/0|ef1/1]', () => {
  const s = escapeSkill()
  assert.equal(s.id, SkillType.逃跑)
  assert.equal(s.priority, 6)
  assert.equal(s.critical, 0)                                       // protected ctor 不管 critical, 只有空过自己补
  assert.equal(s.combo, 1)
  assert.equal(s.accuracy, 100)
  assert.equal(s.name, '逃跑')
  assert.equal(s.rawDescription, null)
  assert.equal(s.effects.length, 1)
  assert.equal(s.effects[0]!.source, s)
  assert.throws(() => getSkillIdentifier(s, 'description[跑]'))
})

test('換场技: 三把 option 键与效果里的 dict **各写一遍**, passive 是 C# 的 True/False 不是 json 的 true/false', () => {
  const s = petChangeSkill(1, 2)
  assert.equal(s.type, SkillType.換场)
  assert.equal(s.name, '換场')
  assert.equal(s.options!.get('source_index'), '1')
  assert.equal(s.options!.get('target_index'), '2')
  assert.equal(s.options!.get('passive'), 'False')
  assert.equal(s.effects.length, 1)
  assert.equal(s.effects[0]!.ability, EffectAbility.PetChange)
  assert.equal(s.effects[0]!.abilityOptionDict.get('passive'), 'False')
  assert.equal(petChangeSkill(0, 3, true).options!.get('passive'), 'True')
})

test('GetPetChangeSkillWithTiming: null 归 null、非換场**原对象返回**、換场才深拷并改时机', () => {
  const other = WSK()
  assert.equal(petChangeSkillWithTiming(null, EffectTiming.OnTurnEnd), null)
  assert.equal(petChangeSkillWithTiming(other, EffectTiming.OnTurnEnd), other)   // 同一个引用, 不是副本

  const pc = petChangeSkill(1, 2)                                  // passive=false ⇒ 时机落在 on_before_attack
  const moved = petChangeSkillWithTiming(pc, EffectTiming.OnTurnEnd)
  assert.notEqual(moved, pc)
  assert.equal(moved!.type, SkillType.換场)
  assert.notEqual(moved!.effects[0], pc.effects[0])                // 深拷过, 效果也是新的
  assert.equal(moved!.effects[0]!.source, moved!)
  assert.notEqual(moved!.effects[0]!.timing, pc.effects[0]!.timing)
  assert.equal(pc.effects[0]!.timing, EffectTiming.OnBeforeAttack)         // passive=false 的落点 (表里那条 raw 是 on_before_attack)
})

test('拷贝构造: copyPP=false 是"按满 PP 重建"; options 为 null 在**拷贝当下**抛; effects 逐条回指副本 [Skill.cs:152-176]', () => {
  const src = WSK({ pp: 1, maxPP: 4 })
  assert.equal(cloneSkill(src).pp, 1)
  assert.equal(cloneSkill(src, false).pp, 4)

  const withEffects = WSK()
  setSkillIdentifier(withEffects, 'effect', 11094)
  const cp = cloneSkill(withEffects)
  assert.equal(cp.effects.length, withEffects.effects.length)
  assert.ok(cp.effects.every((x) => x.source === cp))

  assert.throws(() => cloneSkill(WSK({ options: null as unknown as Map<string, string> })), /ArgumentNullException/)
})

test('GetRandomSkill 的两处不可比都留成显式接缝: 未注入即抛, 注入后跳过必杀与选技', () => {
  setRandomSkillSource(null)
  assert.throws(() => randomSkill(), /NOT_PORTED/)

  // 三只 id 从**已装载的真表**里现挑 (不写死), 判据就是上游那两条筛法: 必杀 / isSelect。
  const table = new JsonSkillTable(JSON.parse(readFileSync(here('../../data/unity/skills.json'), 'utf8')).skills)
  const all = table.all()
  const superId = all.find((x) => x.type === SkillType.必杀)!.id
  const selId = all.find((x) => x.id !== superId && getSkillIdentifier(x, 'isSelect') === 1)!.id
  const plainId = all.find((x) => x.id !== superId && x.id !== selId && x.type !== SkillType.必杀 && getSkillIdentifier(x, 'isSelect') === 0)!.id

  const picks = [superId, selId, plainId]
  let n = 0
  setRandomSkillSource({
    rng: { next01: () => 0, nextFloat: () => 0, seed: () => undefined, nextInt: () => picks[n++], pick: () => null },
    minSkillId: plainId, maxSkillId: superId,
  })
  assert.equal(randomSkill().id, plainId)
  assert.equal(n, 3)                                                // 前两次掷点都被筛掉
  setRandomSkillSource(null)
})
