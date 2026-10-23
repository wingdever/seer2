// PetBattleBuffController 的构造期装载面 —— 这几条是本轮从对拍里**钓出来**的:
// golden 的印记袋子以前最多只有一只"会成功"的印记, 所以 `isSuccess |= AddBuff(...)` 被误写成
// JS 的短路或也没人报警。值的正确性由 tools/difftest.mjs 的 statedrive/petbag/effectident 负责,
// 这里锁的是"每一项都必须真的被调用"。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable, type Effect } from '../effect/effect.ts'
import { EffectTiming } from '../effect/effect-database.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { Buff } from '../buff/buff.ts'
import { tryParseFloat } from '../strutil.ts'
import type { BattleState } from '../battle/state.ts'
import { PetBuffController, setBuffEffectTrigger } from './buff-controller.ts'
import { Element } from './element.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
setEffectTable(EFFECTS)
class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo([String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn), b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}
setBuffTables(new LoadedBuffInfos(), EFFECTS, (id) => tryParseFloat(id!) ?? 0)

const b = (id: number, turn = 2, value = 5): Buff => new Buff(id, turn, value)
const ids = (c: PetBuffController): number[] => c.buffs.map(x => x.id)

test('AddRangeBuff 的 isSuccess 累加**不短路** —— 首只成功后剩下的照样要加', () => {
  const c = new PetBuffController(Element.普通, Element.普通, null)
  assert.equal(c.addRangeBuff([b(1001), b(11), b(1008, 4, 7)], null, null), true)
  assert.deepEqual(ids(c), [1001, 11, 1008])
})

test('构造即 SetElement: 元素免疫表先立起来, 命中块 id 的印记在构造期就被滤掉', () => {
  // 水 ⇒ blockBuffIds=[1000] ⇒ 袋里的 1000 被滤; 3 号是能力增减类 (IsPower) 免疫不了。
  const c = new PetBuffController(Element.水, Element.冰, [b(1000), b(1001), b(1008, 4, 7), b(3, -1, 1)])
  assert.deepEqual(c.blockBuffIds, [1000])
  assert.deepEqual(ids(c), [1001, 1008, 3])
})

test('null 项按 int.MinValue 的 addPriority 排最前, 且被 AddBuff(null) 收下返回 false', () => {
  const c = new PetBuffController(Element.普通, Element.普通, null)
  assert.equal(c.addRangeBuff([b(1001), null as never], null, null), true)
  assert.deepEqual(ids(c), [1001])
  assert.equal(c.addRangeBuff(null, null, null), false)
})

// ── 第五段·步骤2 的突变器 ────────────────────────────────────────────────
// 这几条锁的是**形状**, 数值一致性由对拍的 petmut/statusctrl 族负责。
test('RemoveRangeBuff 的谓词臂 (randomCount 缺省) 是确定性的「摘掉所有匹配项」', () => {
  // randomCount=-1 ⇒ count=int.MaxValue ⇒ ListHelper.Random 在掷骰**之前**就静默返回整表浅拷,
  // 所以这一支不需要随机源; 上游的 `isSuccess |=` 不短路 ⇒ 匹配项**逐只**被摘。
  const c = new PetBuffController(Element.普通, Element.普通, [b(1, 2, 3), b(-9, -1, 2), b(1008, 1, 4)])
  assert.deepEqual(ids(c), [1, -9, 1008])
  assert.equal(c.removeRangeBuff((x: Buff) => x.isPower(), null, null), true)
  assert.deepEqual(ids(c), [1008])
})

test('RemoveRangeBuff 的表臂: null 表返回 false, null 项不中止循环', () => {
  const c = new PetBuffController(Element.普通, Element.普通, [b(1001), b(1008, 1, 4)])
  assert.equal(c.removeRangeBuff(null, null, null), false)
  // 给一张 [在场的 1001, 不在场的 1008, null]: 前两项各有结果, `|=` 让三项都被调用。
  assert.equal(c.removeRangeBuff([c.buffs[0], b(1008), null as never], null, null), true)
  assert.deepEqual(ids(c), [1008])
})

test('显式非负且不超过候选数的 randomCount 要 native 随机 ⇒ 显式抛, 不静默摘', () => {
  const c = new PetBuffController(Element.普通, Element.普通, [b(1), b(-9), b(1008, 1, 4)])
  assert.throws(() => c.removeRangeBuff((x: Buff) => x.isPower(), null, null, 1), /NOT_PORTED/)
  // 0 不进循环 ⇒ 什么都不摘 (上游 count=0 时 while 立刻满足), 这条不走随机源。
  assert.equal(c.removeRangeBuff((x: Buff) => x.isPower(), null, null, 0), false)
  assert.deepEqual(ids(c), [1, -9, 1008])
})

test('BlockBuff 只追加免疫表, 不会回头滤掉已经装袋的印记', () => {
  // 构造期 AddRangeBuff 已经跑完 ⇒ 1008 在场; 之后 BlockBuff([1008]) 只改表, 不改袋。
  const c = new PetBuffController(Element.普通, Element.普通, [b(1008, 1, 4)])
  c.blockBuff([1008])
  assert.deepEqual(c.blockBuffIds, [0, 1008])
  assert.deepEqual(ids(c), [1008])
  // 但调用时的检查读的是这张表 ⇒ 同一只印记此刻已经加不进来了 (IsPower 的那支免疫不了, 也一起拍过)。
  assert.equal(c.addBuff(b(1008, 3, 2), null, null, null), false)
  assert.equal(c.addBuff(b(1, -1, 2), null, null, null), true)
})

// ── 第六段·批一步骤2: state != null 的战斗路径 ────────────────────────────
// 触发链在这里用**假接缝** (setBuffEffectTrigger) 拍形状: 谁被调用、什么顺序、当时看到什么相位。
// 真判定的数值一致性由对拍的 petmut/addbuff 族负责, 本文件一条上游数值都不写。

const ST = (over: Record<string, unknown> = {}): BattleState =>
  ({ phase: EffectTiming.OnTurnStart, getRhsUnitById: () => null, getUnitById: () => null, ...over } as unknown as BattleState)

// 注一只记账不干活的接缝, 返回它看到的调用序。SUBJECT 是"当时那个袋子", 用来拍
// NewBuff 的「先入袋后触发」与 RemoveBuff 的「先触发后摘袋」—— 接缝本身拿不到控制器。
let SUBJECT: PetBuffController | null = null
// HITS 记下每次被叫到的**那条效果** (seen 只记场面), 用来看同 priority 的原序。
const HITS: Effect[] = []
const record = (seen: string[]): void => {
  setBuffEffectTrigger((e, _inv, st, checkPhase, _ct, src) => {
    HITS.push(e)
    seen.push(`phase=${st.phase}|t=${e.timing}|e=${e.id}|p=${e.priority}|cp=${checkPhase ? 1 : 0}|src=${src === null ? 'null' : 'x'}|n=${SUBJECT === null ? -1 : SUBJECT.buffs.length}`)
    return true
  })
}
const NO_TRIGGER = (): void => setBuffEffectTrigger(null)
// 只比"场面"不比效果身份 (身份单独在稳定排序那条里比)。
const fields = (s: string): string => s.split('|').filter((x) => !x.startsWith('e=')).join('|')

test('未注入判定层时触发链显式抛 —— 不把「接缝没接」伪装成「印记触发过了」', () => {
  NO_TRIGGER()
  const c = new PetBuffController(Element.普通, Element.普通, null)
  assert.throws(() => c.addBuff(b(11, 2, 1), null, null, ST()), /NOT_PORTED/)
  assert.throws(() => c.removeBuff(c.buffs[0] ?? b(11, 2, 1), null, ST()), /NOT_PORTED/)
})

test('OnAddBuff 只筛 timing==OnAddBuff、按 priority 稳定升序, 且把相位改成 OnAddBuff 后**恢复**', () => {
  const seen: string[] = []
  record(seen)
  try {
    const c = new PetBuffController(Element.普通, Element.普通, null)
    SUBJECT = c
    const st = ST()
    // 88 号: on_add_buff/p-1、on_add_buff/p0、on_remove_buff/p-1 —— 第三条此刻不该被叫到。
    assert.equal(c.addBuff(b(88, 2, 1), null, null, st), true)
    assert.deepEqual(seen.map(fields), [
      `phase=${EffectTiming.OnAddBuff}|t=${EffectTiming.OnAddBuff}|p=-1|cp=1|src=null|n=1`,
      `phase=${EffectTiming.OnAddBuff}|t=${EffectTiming.OnAddBuff}|p=0|cp=1|src=null|n=1`,
    ], '入袋在前 (n=1)、相位为 OnAddBuff、on_remove 那条不在本轮')
    assert.equal(st.phase, EffectTiming.OnTurnStart, '触发完把相位交还')

    seen.length = 0
    HITS.length = 0
    const d = new PetBuffController(Element.普通, Element.普通, null)
    SUBJECT = d
    const probe = b(95, 2, 1)
    const wanted = probe.effects.filter((x) => x.timing === EffectTiming.OnAddBuff)
    assert.equal(wanted.length, 2, '95 号有两条同 priority 的 on_add_buff')
    assert.equal(d.addBuff(probe, null, null, ST()), true)
    // 两条同 priority 且 `Effect.id` 在克隆体上恒为 -3 (Buff.cs 的 effects 是 info.effects 的 clone) ⇒
    // 只能按**引用身份**比原序, 用 indexOf 把它们投到袋里的位置。
    const posOf = (e: Effect): number => probe.effects.indexOf(e)
    assert.deepEqual(HITS.map(posOf), wanted.map(posOf),
      '同 priority ⇒ 稳定排序保持 effects 原序 (抄成不保证稳定的 sort 就会翻)')

    // 1008 的效果挂在 on_turn_end ⇒ 装载时一次都不触发。
    seen.length = 0
    const e = new PetBuffController(Element.普通, Element.普通, null)
    SUBJECT = e
    assert.equal(e.addBuff(b(1008, 2, 5), null, null, ST()), true)
    assert.deepEqual(seen, [], 'Where(timing) 筛掉了非 OnAddBuff 的效果')
  } finally {
    NO_TRIGGER()
  }
})

test('copyHandleType 六支各一拍: New 叠两份 / Block 拒 / Replace 换 / Stack 累加 / Max、Min 比大小', () => {
  const seen: string[] = []
  record(seen)
  try {
    const mk = (id: number, turn: number, value: number) => {
      seen.length = 0
      const c2 = new PetBuffController(Element.普通, Element.普通, [b(id, turn, value)])
      SUBJECT = c2
      return c2
    }

    // New (2108): 同 id 再来一次 ⇒ 袋里两份 (上游 default 与 New 同一支)。
    let c = mk(2108, 2, 1)
    assert.equal(c.addBuff(b(2108, 2, 1), null, null, ST()), true)
    assert.deepEqual(ids(c), [2108, 2108])

    // Block (85): 第二次直接 false, 且**不触发**任何东西。
    c = mk(85, 2, 1)
    assert.equal(c.addBuff(b(85, 2, 1), null, null, ST()), false)
    assert.deepEqual(ids(c), [85])
    assert.deepEqual(seen, [], 'Block 支连 OnAddBuff 都不跑')

    // Stack (1008, max_val=10): 5+5=10 成功, 但触发的是**新来的那条** (它的 effects 同样是 on_turn_end ⇒ 这里为空)。
    c = mk(1008, 2, 5)
    assert.equal(c.addBuff(b(1008, 2, 5), null, null, ST()), true)
    assert.equal(c.buffs[0].value, 10)
    assert.deepEqual(ids(c), [1008], 'Stack 不新增条目')
    assert.equal(c.addBuff(b(1008, 2, 5), null, null, ST()), false, '10 < 10 不成立 ⇒ 天花板到顶就拒')
    assert.equal(c.buffs[0].value, 10)

    // Max (31): 大者留; Min (32): 小者留。两支都是「RemoveBuff(旧的) + NewBuff(新的)」⇒ 袋里那条是**新引用**。
    c = mk(31, 2, 5)
    const old31 = c.buffs[0]
    assert.equal(c.addBuff(b(31, 2, 9), null, null, ST()), true)
    assert.deepEqual(ids(c), [31])
    assert.equal(c.buffs[0].value, 9)
    assert.notEqual(c.buffs[0], old31, '换人是摘旧+入新 (不是就地改 old31) ⇒ old31 身上看不到任何变化')
    assert.equal(old31.value, 5)
    assert.deepEqual(seen, [], '31 号表上没挂 on_add/on_remove ⇒ 这次换人一次都不触发')
    seen.length = 0
    assert.equal(c.addBuff(b(31, 2, 3), null, null, ST()), false)
    assert.deepEqual(seen, [], '比大小不成立时连 Remove 都不发生')

    c = mk(32, 2, 5)
    assert.equal(c.addBuff(b(32, 2, 3), null, null, ST()), true)
    assert.equal(c.buffs[0].value, 3)
    assert.equal(c.addBuff(b(32, 2, 8), null, null, ST()), false)
    assert.equal(c.buffs[0].value, 3)
  } finally {
    NO_TRIGGER()
  }
})

test('Replace: -1 当**无限久**, 相等时旧的被换掉 (换人是"先摘后入"两步触发)', () => {
  const seen: string[] = []
  record(seen)
  try {
    // 旧 11 号 turn=-1 (永久) ⇒ oldTurn=int.MaxValue > 5 ⇒ 短的换不掉永久的。
    const a = new PetBuffController(Element.普通, Element.普通, [b(11, -1, 1)])
    SUBJECT = a
    seen.length = 0
    assert.equal(a.addBuff(b(11, 5, 2), null, null, ST()), false)
    assert.equal(a.buffs[0].turn, -1)
    assert.deepEqual(seen, [], '换不掉时连摘除都不发生')

    // 旧 turn=2、新 turn=5 ⇒ old <= new 成立 ⇒ 先 OnRemoveBuff(旧) 再 OnAddBuff(新)。
    const c = new PetBuffController(Element.普通, Element.普通, [b(11, 2, 1)])
    SUBJECT = c
    seen.length = 0
    assert.equal(c.addBuff(b(11, 5, 2), null, null, ST()), true)
    assert.deepEqual(ids(c), [11])
    assert.equal(c.buffs[0].turn, 5)
    assert.deepEqual(seen.map((x) => x.split('|')[0]),
      [`phase=${EffectTiming.OnRemoveBuff}`, `phase=${EffectTiming.OnAddBuff}`], '旧的两条先退场, 新的再入袋')

    // 相等 ⇒ int.MaxValue <= int.MaxValue 也成立 ⇒ 永久可以被"另一个永久"替换 (引用换人)。
    const d = new PetBuffController(Element.普通, Element.普通, [b(11, -1, 1)])
    SUBJECT = d
    assert.equal(d.addBuff(b(11, -1, 7), null, null, ST()), true)
    assert.equal(d.buffs[0].value, 7)
  } finally {
    NO_TRIGGER()
  }
})

test('RemoveBuff 先 OnRemoveBuff 再摘袋 —— 被触发的效果看得到自己还在袋里', () => {
  const seen: string[] = []
  record(seen)
  try {
    const c = new PetBuffController(Element.普通, Element.普通, [b(11, 2, 1)])
    SUBJECT = c
    const st = ST()
    assert.equal(c.removeBuff(c.buffs[0], null, st), true)
    assert.deepEqual(seen.map(fields), [`phase=${EffectTiming.OnRemoveBuff}|t=${EffectTiming.OnRemoveBuff}|p=-1|cp=1|src=null|n=1`])
    assert.deepEqual(ids(c), [], '触发完才真的摘掉')
    assert.equal(st.phase, EffectTiming.OnTurnStart, '相位交还')

    // state==null ⇒ OnRemoveBuff 自己早退 (与 OnAddBuff 没有这一道检查不同), 退化成引用删除。
    seen.length = 0
    const d = new PetBuffController(Element.普通, Element.普通, [b(11, 2, 1)])
    SUBJECT = d
    assert.equal(d.removeBuff(d.buffs[0], null, null), true)
    assert.deepEqual(seen, [])
    // 不在袋里的引用 ⇒ false, 但仍**先**跑了一遍触发 (上游就是这个顺序, 不是"找到才触发")。
    const e = new PetBuffController(Element.普通, Element.普通, [b(11, 2, 1)])
    SUBJECT = e
    seen.length = 0
    assert.equal(e.removeBuff(b(11, 2, 1), null, ST()), false)
    assert.equal(seen.length, 1, '孤儿印记的 on_remove 照样被叫到')
  } finally {
    NO_TRIGGER()
    SUBJECT = null
  }
})
