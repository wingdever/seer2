// S3 第一块 (Effect 数据/解析/格式化) 的 golden。
// 标注 [oracle] 的期望值是**上游二进制自己给的答案** —— 由 `tools/oracle-cs dbprobe` 直调
// Assembly-CSharp.dll 打印 (Effect.Parse + GetRawEffectStringArray), 不是我照 Effect.cs 推第二遍的结果。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { Effect, PrefabTable, setEffectTable } from './effect.ts'
import { getNumIdentifier, type IdentifierHost } from '../parser/identifier.ts'
import { createRng } from '../rng.ts'
import {
  EffectAbility, EffectCondition, EffectTarget, EffectTiming,
  toEffectTiming, timingToRaw, targetToRaw, abilityToRaw, isAttackPhase,
} from './effect-database.ts'

// 与 parser.test.ts 同款: 只解析字面量, random 走注入的确定性 Rng
function hostAt(seed = 1): IdentifierHost {
  let playerRandom = 0
  return {
    rng: createRng(seed),
    getPlayerRandom: () => playerRandom,
    setPlayerRandom: (v) => { playerRandom = v },
    getDate: (part) => (part === 'year' ? 2026 : 0),
    getPlayerData: () => null,
  }
}

const PREFABS = JSON.parse(readFileSync(new URL('../../data/unity/effects.json', import.meta.url), 'utf8')).prefabs
const TABLE = new PrefabTable(PREFABS)
setEffectTable(TABLE)

const rawOf = (list: Effect[]): string[] => list.map((e) => e.getRawEffectStringArray().join('|'))

test('prefab 表全量装载, 条数与上游 effectDict 一致 [oracle]', () => {
  // oracle: dbprobe → effectDict = 113 (含 LoadEffects 的 0..10000 → +10000 复制, 那一份在表外)
  assert.equal(TABLE.size, 113)
})

test('Effect.Parse 引用+实参: 键也参与 {i} 替换 [oracle]', () => {
  const got = rawOf(Effect.parse('(1002{buff=3&2=4&5=6})', TABLE)!)
  // 这一整行是 oracle 打印的 raw, 逐字符比:
  // 预制体 1002 的 abilityOptionDict 键是 {0}/{2}/{4}…, 实参列表只有**一个** `{buff=3&2=4&5=6}`,
  // 所以 {0} 整块换成实参串, 而值里的 {1} 起保持字面 —— 反直觉, 但这是实测行为。
  assert.deepEqual(got, [
    'on_after_attack|-1|pet|none|none|add_buff|name=添加印记&buff=3&2=4&5=6={1}&{2}={3}&{4}={5}&{6}={7}&{8}={9}&{10}={11}',
  ])
})

test('Effect.Parse 的四个边界都照上游的抛法', () => {
  assert.equal(Effect.parse(null, TABLE), null, 'null 输入不抛, 返回 null (Effect.cs:126-127)')
  assert.equal(Effect.parse('1002', TABLE), null, '没有成对圆括号 ⇒ TrimParenthesesLoop 给 null')
  assert.throws(() => Effect.parse('(abc)', TABLE), /格式不正确/, 'id 非整数 ⇒ int.Parse 抛')
  assert.throws(() => Effect.parse('(99999999)', TABLE), /NullReferenceException/, '表里没有该 id ⇒ 上游对 null 调 Format')
  // 多个圆括号组 = 多条效果, 顺序即书写顺序
  assert.equal(Effect.parse('(-4)(-4)', TABLE)!.length, 2)
})

test('TryParse 的 ok 只判括号, 不判解析成功 (Effect.cs:148-152)', () => {
  assert.deepEqual(Effect.tryParse('(1002)', TABLE), { ok: true, effects: Effect.parse('(1002)', TABLE) })
  const noParen = Effect.tryParse('1002', TABLE)
  assert.equal(noParen.ok, false)
  assert.equal(noParen.effects, null)
})

test('GetDefaultEffect 的 raw 串 [oracle 形状]', () => {
  // 空 condOptionDictList ⇒ "none"; priority 是 -1 而不是 0
  assert.deepEqual(Effect.getDefaultEffect().getRawEffectStringArray(),
    ['none', '-1', 'none', 'none', 'none', 'none', 'none'])
})

test('GetPetChangeEffect: passive 决定 timing 落点, 布尔写成 C# 的 True/False', () => {
  const e = Effect.getPetChangeEffect(1, 2, false)
  assert.deepEqual(e.getRawEffectStringArray(),
    ['on_before_attack', '99999', 'pet', 'none', 'none', 'pet_change', 'source_index=1&target_index=2&passive=False'])
  const p = Effect.getPetChangeEffect(1, 2, true)
  assert.equal(p.timing, EffectTiming.OnPassivePetChange)
  assert.equal(timingToRaw(p.timing), 'on_passive_pet_change')
  assert.equal(p.getRawAbilityOptionString(), 'source_index=1&target_index=2&passive=True')
})

test('GetEffect 给的是拷贝: 改副本不污染预制体 (Effect.cs:118-122)', () => {
  const a = Effect.getEffect(1002, TABLE)!
  a.abilityOptionDict.set('name', '改了')
  a.condOptionDictList.push(new Map([['x', 'y']]))
  const b = Effect.getEffect(1002, TABLE)!
  assert.equal(b.abilityOptionDict.get('name'), '添加印记')
  assert.equal(b.condOptionDictList.length, 1)
  assert.notEqual(a, b)
})

test('SetEffects 剥掉常驻 set_skill(type=effect) 的壳, value 为空则整条丢弃', () => {
  const shell = (value: string | null) => new Effect(
    EffectTiming.Resident, -1, EffectTarget.CurrentSkill, EffectCondition.None, null,
    EffectAbility.SetSkill, new Map<string, string>([['type', 'effect'], ...(value === null ? [] : [['value', value]])]),
  )
  const plain = Effect.getEffect(-4, TABLE)!
  const out = Effect.setEffects([shell('(-4)'), shell(null), plain], EffectAbility.SetSkill)
  // 第 1 条展开成它引用的 -4 (escape), 第 2 条 value 空 ⇒ 丢, 第 3 条原样
  assert.equal(out.length, 2)
  assert.equal(out[0].ability, EffectAbility.Escape)
  assert.equal(out[1].ability, EffectAbility.Escape)
  // formatAbility 不参与匹配的壳不当壳用
  assert.equal(Effect.setEffects([shell('(-4)')], EffectAbility.AddBuff).length, 1)
})

test('Format 空实参不动; 多实参按 {0}/{1} 下标依次替换键与值', () => {
  const e = new Effect(EffectTiming.None, 0, EffectTarget.None, EffectCondition.None,
    [new Map([['{0}', '{1}']])], EffectAbility.Heal, new Map([['{0}', 'v{1}']]))
  e.format(null)
  assert.deepEqual([...e.abilityOptionDict], [['{0}', 'v{1}']])
  e.format(['a', 'b'])
  assert.deepEqual([...e.abilityOptionDict], [['a', 'vb']])
  assert.deepEqual([...e.condOptionDictList[0]], [['a', 'b']])
})

// 上游 Format 用的是 LINQ ToDictionary ⇒ 两个键被同一个实参替成同名是**抛**, 不是后者覆盖前者。
// JS 的 `new Map([...])` 默认静默合并, 所以这条只能靠固定用例 + 对拍里那 13 条一起守。
test('Format 键冲突 ⇒ ArgumentException (LINQ ToDictionary 语义)', () => {
  const e = new Effect(EffectTiming.None, 0, EffectTarget.None, EffectCondition.None,
    null, EffectAbility.Heal, new Map([['{0}', 'x'], ['{1}', 'y']]))
  assert.throws(() => e.format(['k', 'k']), /An item with the same key has already been added\. Key: k/)
  // 真实表里就长这样的引用 (Buffs/effect.csv): 预制体 2001 的两个键替完都叫 who
  assert.throws(() => Effect.parse('(2001{who}{name=添加印记}{value}{buff=3}{who})', TABLE), /ArgumentException/)
  // 条件表同样会撞 —— 它是逐条 ToDictionary 的 List, 不是合并
  const c = new Effect(EffectTiming.None, 0, EffectTarget.None, EffectCondition.None,
    [new Map([['{0}', 'p']]), new Map([['{0}', 'q']])], EffectAbility.Heal, new Map([['z', '1']]))
  c.format(['a', 'b'])
  assert.deepEqual([...c.condOptionDictList[0]], [['a', 'p']])
  assert.deepEqual([...c.condOptionDictList[1]], [['a', 'q']])
})

test('isSelect / targetType: target_type 按 \'_\' 切, 缺省 none', () => {
  const mk = (opts: [string, string][]) => new Effect(
    EffectTiming.None, 0, EffectTarget.None, EffectCondition.None, null, EffectAbility.SetPet, new Map(opts))
  assert.equal(mk([]).isSelect, false)
  assert.deepEqual(mk([]).targetType, ['none'])
  assert.equal(mk([['target_type', 'ally_index']]).isSelect, true)
  assert.deepEqual(mk([['target_type', 'ally_index']]).targetType, ['ally', 'index'])
  assert.equal(mk([['target_filter', 'alive']]).targetFilter, 'alive')
})

test('词表: 未知键静默兜 None, 反查取插入序第一个匹配键 (EffectDatabase.cs:92-122)', () => {
  assert.equal(toEffectTiming('on_turn_end'), EffectTiming.OnTurnEnd)
  assert.equal(toEffectTiming('ON_TURN_END'), EffectTiming.None, '区分大小写')
  assert.equal(toEffectTiming(''), EffectTiming.None)
  assert.equal(timingToRaw(EffectTiming.All), 'all')
  assert.equal(timingToRaw(-9999 as EffectTiming), 'none', '不在词表里的值反向兜 none 而不是抛')
  assert.equal(targetToRaw(EffectTarget.CurrentPet), 'pet')
  assert.equal(abilityToRaw(EffectAbility.AddBuff), 'add_buff')
  // 枚举数值是硬事实: 排序与 IsAttackPhase 直接拿整数比
  assert.equal(EffectTiming.All, -999)
  assert.equal(EffectTiming.OnBattleEnd, 999)
  assert.equal(EffectTiming.OnAfterEffect, -11)
  assert.equal(EffectTarget.CurrentPet, 5)
  assert.equal(EffectAbility.Card, 21)
})

test('IsAttackPhase 是数值区间, 不是名字查表 (EffectDatabase.cs:134-139)', () => {
  assert.equal(isAttackPhase(EffectTiming.OnAttack), true)
  assert.equal(isAttackPhase(EffectTiming.OnBeforeAttack), false, '左开')
  assert.equal(isAttackPhase(EffectTiming.OnAttackEnd), false, '右开')
  for (const t of [EffectTiming.OnDamageParamCalculate, EffectTiming.OnBeforeDamageCalculate,
    EffectTiming.OnDamageCalculate, EffectTiming.OnAfterDamageCalculate, EffectTiming.OnFinalDamageCalculate])
    assert.equal(isAttackPhase(t), false, '伤害计算段被单独摘出去')
  assert.equal(isAttackPhase(EffectTiming.OnPassivePetChange), false)
})

test('GetEffectIdentifier: timing/ability 两族 + 不认的键给 float.MinValue', () => {
  const e = Effect.getEffect(1002, TABLE)!
  // 用**真**的 GetNumIdentifier 当 resolveNum, 而不是随手 Number(): 上游这一支就是它
  // (Effect.cs:416)。非数字 option ⇒ float.TryParse 失败 ⇒ 0; 键不存在 ⇒ null.StartsWith ⇒ NRE。
  const num = (s: string): number => getNumIdentifier(s, hostAt(1))
  assert.equal(e.getEffectIdentifier('timing', num), EffectTiming.OnAfterAttack)
  assert.equal(e.getEffectIdentifier('timing(on_after_attack)', num), 1)
  assert.equal(e.getEffectIdentifier('timing(on_turn_end)', num), 0)
  assert.equal(e.getEffectIdentifier('ability', num), EffectAbility.AddBuff)
  assert.equal(e.getEffectIdentifier('ability(add_buff)', num), 1)
  assert.deepEqual(e.tryGetEffectIdentifier('nonsense', num), { ok: false, value: -3.4028234663852886e38 })
  assert.equal(e.tryGetEffectIdentifier('timing', num).ok, true)

  // 两族剥的**不是同一对括号**: timing 那支显式给了 '(' ')' (Effect.cs:398), ability 那支
  // `trimExpr.TryTrimParentheses(out trimExpr)` 不带字符实参 ⇒ 吃 Helper.cs:85 的缺省 '[' ']' (:412)。
  // 于是 `ability(heal)` 只能靠 :409 那条字面比较命中, `ability(rage)` 剥不动 ⇒ 直接落末尾的 `return 0`,
  // 一次都不碰 abilityOptionDict —— 真表 3668/100993 的 `(ability(rage):1)` 正是靠这条才不落进 NRE。
  assert.equal(e.getEffectIdentifier('timing[on_after_attack]', num), 0,
    '反过来也对称: 方括号喂给 timing 那支同样剥不动 ⇒ 落 :401 的 return 0 (上游 ToEffectTiming 根本没被调到)')
  assert.equal(e.getEffectIdentifier('ability(rage)', num), 0, '圆括号在 ability 支是**哑**的')
  assert.equal(e.getEffectIdentifier('ability(no_such_key)', num), 0, '同上 —— 连字典都不查, 所以不抛')

  // 剥掉**方**括号后含冒号才是字符串等值比较; 不含冒则把 option 值交给 GetNumIdentifier。
  // TrimParentheses 只看第一对括号, 后面挂的 ":42" 当噪声丢掉 —— 所以 'ability[v]:42' 走的还是单键那支。
  const s = new Effect(EffectTiming.None, 0, EffectTarget.None, EffectCondition.None, null,
    EffectAbility.Heal, new Map([['v', '42'], ['name', 'x']]))
  assert.equal(s.getEffectIdentifier('ability(v:42)', num), 0, '圆括号不剥 ⇒ 落末尾 return 0')
  assert.equal(s.getEffectIdentifier('ability[v:42]', num), 1)
  assert.equal(s.getEffectIdentifier('ability[v:43]', num), 0)
  assert.equal(s.getEffectIdentifier('ability[v]', num), 42)
  assert.equal(s.getEffectIdentifier('ability[v]:42', num), 42, '"]" 之后的 ":42" 是噪声, 不参与比较')
  assert.equal(s.getEffectIdentifier('ability[name]', num), 0, 'option 值不是数字 ⇒ GetNumIdentifier 兜 0')
  assert.throws(() => s.getEffectIdentifier('ability[no_such_key]', num), TypeError,
    '键不存在 ⇒ abilityOptionDict.Get 给 null, 上游立刻 NRE, 不许静默兜 0')
})
