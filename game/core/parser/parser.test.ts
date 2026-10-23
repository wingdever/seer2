// 求值器 golden —— 每条都标了 C# 出处, 值全部按 Unity 侧语义手算。
// 跑法: node --test game/core/   (Node 26 原生剥 TS 类型, 无构建步)
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseDataType, parseMultipleOptions, parseOperation, parseOptions, parseConditionFilter, isFraction, parseFraction } from './parser.ts'
import { condition, conditionOf, operate, splitCondition } from './operator.ts'
import { getNumIdentifier, type IdentifierHost } from './identifier.ts'
import { createRng } from '../rng.ts'
import { f, roundToInt, floorToInt, ceilToInt, toInt, min as MathfMin, max as MathfMax } from '../mathf.ts'
import { toIntRange, trimParentheses, trimParenthesesLoop, tryParseFloat, tryParseInt } from '../strutil.ts'

// 只解析字面量 (数据表阶段), random 走注入的确定性 Rng
function hostAt(seed = 1): IdentifierHost {
  let playerRandom = 0
  return {
    rng: createRng(seed),
    getPlayerRandom: () => playerRandom,
    setPlayerRandom: v => { playerRandom = v },
    getDate: part => (part === 'year' ? 2026 : 0),
    getPlayerData: () => null,
  }
}
const lit = (expr: string, seed = 1) => parseOperation(expr, id => getNumIdentifier(id, hostAt(seed)))

test('左到右折叠, 无优先级 (Parser.cs:106-125)', () => {
  assert.equal(lit('1+2*3'), 9)          // 不是 7
  assert.equal(lit('10-4/2'), 3)         // (10-4)/2
  assert.equal(lit('2^3*2'), 16)         // (2^3)*2
})

test('前导负号先摘成符号位 (Parser.cs:107-109)', () => {
  assert.equal(lit('-1+2'), -3)          // -(1+2)
  assert.equal(lit('-7%2'), -1)          // -(7%2), 截断后 1
  assert.equal(lit('1-2'), -1)           // 中间的 - 仍是减号
})

test('未知标识符与未知算子都返回 0, 不抛 (Operator.cs:88 / Identifier.cs:32)', () => {
  assert.equal(lit('me.skill.damage'), 0)
  assert.equal(lit('1+[MIN]2'), 0)       // 复合算子串 "+[MIN]" 不认识 → 0
  assert.equal(lit('5 SET 3'), 3)
  assert.equal(operate('~', 1, 2), 0)
})

test('单精度浮点逐位 (C# float=32 位)', () => {
  assert.equal(lit('0.1+0.2'), f(0.1 + 0.2))
  assert.equal(lit('1/3'), f(1 / 3))
  assert.notEqual(lit('0.1+0.2'), 0.3)
})

test('算子逐个 (Operator.cs:91-137)', () => {
  assert.equal(operate('[MIN]', 3, 7), 3)
  assert.equal(operate('[MAX]', 3, 7), 7)
  assert.equal(operate('[NEG]', 3, 7), 4)      // rhs - lhs
  assert.equal(operate('[ABS]', 3, 7), 4)      // |lhs - rhs|
  assert.equal(operate('%', 7.9, 2.9), 1)      // (int)lhs % (int)rhs
  assert.equal(operate('%', -7.9, 2.9), -1)    // C# 与 JS 的 % 都跟被除数同号
  assert.equal(operate('[FLR]', 5, 2), 4)      // FloorToInt(5/2)*2
  assert.equal(operate('[CEL]', 5, 2), 6)      // CeilToInt(5/2)*2
})

test('[RND] 的半值舍入方向 = ToEven (Operator.cs:133-136 用 Mathf.RoundToInt)', () => {
  // .NET Math.Round(double) 默认 MidpointRounding.ToEven → 0.5→0, 1.5→2, 2.5→2
  assert.equal(roundToInt(0.5), 0)
  assert.equal(roundToInt(1.5), 2)
  assert.equal(roundToInt(2.5), 2)
  assert.equal(roundToInt(-0.5), 0)
  // ✅ 已由 tools/oracle-cs 直调 UnityEngine.Mathf 坐实: 3.5→4 4.5→4 5.5→6 -1.5→-2 -2.5→-2
  //   (固定向量在 difftest.mjs 的 roundi 一族里, 退回去就会红)
  assert.equal(operate('[RND]', 5, 2), 4)
  assert.equal(operate('[RND]', 7, 2), 8)
})

test('FloorToInt/CeilToInt 对负数向两侧 (Mathf 语义)', () => {
  assert.equal(floorToInt(-2.5), -3)
  assert.equal(ceilToInt(-2.5), -2)
})

test('ToInt 家族的 int 边界 (全部实测自上游 Mathf/Operator)', () => {
  assert.equal(roundToInt(Number.NaN), 0)                     // NaN→0, 不是 NaN 也不是抛
  assert.equal(floorToInt(Number.NaN), 0)
  assert.equal(ceilToInt(Number.NaN), 0)
  assert.equal(floorToInt(1.9826369e34), 2147483647)          // 上溢**饱和**, 不是回绕
  assert.equal(floorToInt(-1.9826369e34), -2147483648)
  assert.equal(ceilToInt(Number.POSITIVE_INFINITY), 2147483647)
  assert.equal(toInt(1.9826369e34), 2147483647)               // (int) 强转与 Mathf.*ToInt 同一套饱和
  // int 没有 -0: 负小数取整再乘回来必须落在 +0 一侧
  assert.ok(Object.is(ceilToInt(-0.05), 0), 'ceilToInt(-0.05) 必须是 +0')
  assert.ok(Object.is(operate('[CEL]', -7.9, 111.857), 0), '[CEL] 负小数必须返回 +0')
  // Mathf.Min/Max 是严格比较, 不成立时返回 b —— 与 Math.min/max 的 NaN 行为不同
  assert.equal(MathfMin(Number.NaN, 61.5), 61.5)
  assert.equal(MathfMax(Number.NaN, 61.5), 61.5)
  // (int)rhs == 0 就抛 DivideByZero, 不是给 0 也不是给 Inf
  assert.throws(() => operate('%', 5, 0.5), /DivideByZero/)
  assert.throws(() => operate('%', 0.9, 0.9), /DivideByZero/)
  assert.equal(operate('%', 1.9826369e34, 7), 1)              // (int)lhs 饱和到 2147483647
  // ParseFraction 两侧是 int.Parse (不是 TryParse): 畸形分数量必须抛, 不能兜成 5/0。
  // 只锁"抛不抛" —— 异常类型/文案是 C# 与 JS 的表层差异, 对拍也是按"两边都抛 ⇒ 一致"比的。
  assert.throws(() => parseFraction('5/2.5'))
  assert.deepEqual(parseFraction('-5/-2'), { num: -5, den: -2 })
})

test('ParseDataType 判定顺序 (Parser.cs:54-75)', () => {
  assert.equal(parseDataType('').type, 'Null')
  assert.equal(parseDataType('<').type, 'Condition')
  assert.equal(parseDataType('*').type, 'Operator')
  assert.equal(parseDataType('1/4').type, 'Fraction')
  assert.deepEqual(parseDataType('1/4').value, { num: 1, den: 4 })
  assert.equal(parseDataType('-3').type, 'Int')
  assert.equal(parseDataType('1.5').type, 'Float')
  assert.equal(parseDataType('me.hp').type, 'Text')
  assert.equal(isFraction('1/4/2'), false)
  assert.deepEqual(parseFraction('3/4'), { num: 3, den: 4 })
})

test('Fraction 条件是 max*num/den, 且先乘后除 (Operator.cs:44-62)', () => {
  assert.equal(conditionOf('LTE', 25, 100, { type: 'Fraction', value: { num: 1, den: 4 } }), true)
  assert.equal(conditionOf('<', 25, 100, { type: 'Fraction', value: { num: 1, den: 4 } }), false)
  assert.equal(conditionOf('=', 33, 100, { type: 'Int', value: 33 }), true)
  assert.equal(conditionOf('GTE', 1, 1, { type: 'Text', value: 'x' }), false)  // default: false
})

test('SplitCondition 取「第一个出现」的算子, 不是最靠前的 (Operator.cs:22-38)', () => {
  assert.deepEqual(splitCondition('x=1LTE2'), { key: 'x', value: '1LTE2', op: '=' })
  assert.deepEqual(splitCondition('hpLTE1/2'), { key: 'hp', value: '1/2', op: 'LTE' })
  assert.deepEqual(splitCondition('a＜b'), { key: 'a', value: 'b', op: '<' })   // 全角归一
  // 一个 condDict 算子都没有时, C# 在 Substring(0,-1) 抛 ArgumentOutOfRange —— 这里同样抛, 带上原串
  assert.throws(() => splitCondition('nounderscore'), /no condition op/)
  assert.throws(() => splitCondition('type:powerup'), /no condition op/)
})

test('ParseOptions / ParseMultipleOptions (Parser.cs:12-37)', () => {
  const m = new Map<string, string>()
  parseOptions(m, 'type=powerup&value=2&turn=3')
  assert.equal(m.get('type'), 'powerup'); assert.equal(m.get('turn'), '3')
  const n = new Map<string, string>()
  parseOptions(n, 'none')
  assert.equal(n.size, 0)
  assert.throws(() => parseOptions(new Map(), 'a=1=2'), /Option Parsing Failure/)
  assert.throws(() => parseOptions(new Map(), 'novalue'), /Option Parsing Failure/)
  // C# 用 dict.Add 而非索引器 ⇒ 重复键抛 ArgumentException。上游真有这形状:
  //   Skills "谁在场就发动效果" = 同一行两段 who=cur&...|who=op&... 是合法的(两个 Map),
  //   但同一段内写两次同键会当场炸掉整张表的加载循环 (ResourceManager 的外层 try)。
  assert.throws(() => parseOptions(new Map(), 'a=1&a=2'), /Duplicate option key/)
  const multi = parseMultipleOptions('a=1&b=2|a=3')
  assert.equal(multi.length, 2); assert.equal(multi[1].get('a'), '3')
  const none = parseMultipleOptions('none')
  assert.equal(none.length, 1); assert.equal(none[0].size, 0)
})

test('GetNumIdentifier 的 random 家族 (Identifier.cs:10-33)', () => {
  const h = hostAt(7)
  const v = getNumIdentifier('random', h)
  assert.ok(v >= 0 && v <= 100 && Number.isInteger(v), `闭区间 0..100 的整数, 实得 ${v}`)
  assert.equal(getNumIdentifier('random[old]', h), 0)
  const nv = getNumIdentifier('random[new]', h)
  assert.equal(getNumIdentifier('random[old]', h), nv)      // [new] 写回, [old] 读同一个
  assert.equal(getNumIdentifier('random[5]', h), 5)         // 区间展开后只剩一个值
  assert.equal(getNumIdentifier('random[]', h), 0)          // 空表 → ListHelper.Get 的 default(T)=0 (HelperCollections.cs:74-82), 不抛
  assert.equal(getNumIdentifier('3.5', h), 3.5)
  assert.equal(getNumIdentifier('not-a-number', h), 0)
  assert.equal(getNumIdentifier('1e5', h), 100000)           // 科学计数法**认** —— oracle 实测 (numid '1e3'→1000), 原先按 JS 直觉写成了 0
})

test('.NET TryParse 的接受/拒绝面 (strutil 对齐)', () => {
  assert.equal(tryParseFloat(' 1.5 '), 1.5)
  assert.equal(tryParseFloat('123.'), 123)
  assert.equal(tryParseFloat('.5'), 0.5)
  // 下面 6 条 golden 全部由 tools/oracle-cs 直调上游 float.TryParse 实测得到 (datatype/numid 两类向量),
  // 不是按 JS Number 的直觉写的 —— 千分位与指数都**接受**, 但只允许「逗号在小数点前、组内至少 1 位」。
  assert.equal(tryParseFloat('1,000'), 1000)
  assert.equal(tryParseFloat('12,34,567'), 1234567)
  assert.equal(tryParseFloat('1,00'), 100)                    // 组长度不校验
  assert.equal(tryParseFloat('1,'), 1)
  assert.equal(tryParseFloat(',5'), null)                     // 逗号不能在开头
  assert.equal(tryParseFloat('1.000,5'), null)                // 逗号必须在小数点之前
  assert.equal(tryParseFloat('1.5e-3'), Math.fround(0.0015))   // 字面量在解析这一刻就是 float32
  assert.equal(tryParseFloat('1e'), null)                     // 指数必须有数字
  assert.equal(tryParseFloat('1e40'), Infinity)               // 越界饱和成 Inf, 与上游同为 "Inf" 哨兵
  assert.equal(tryParseFloat('1e5f'), null)
  assert.equal(tryParseFloat('1f'), null)
  assert.equal(tryParseFloat('0x10'), null)
  assert.equal(tryParseFloat(''), null)
  assert.equal(tryParseInt('2.9'), null)                      // TryParse ≠ (int) 强转: 小数一律 false
  assert.equal(tryParseInt('-2.9'), null)
  assert.equal(tryParseInt('2'), 2)
  assert.equal(tryParseInt(' +40 '), 40)
  assert.equal(tryParseInt(''), null)
})

test('ToIntRange 展开 (Helper.cs:220-245)', () => {
  assert.deepEqual(toIntRange('1~3|7'), [1, 2, 3, 7])
  assert.deepEqual(toIntRange('3~1'), [1, 2, 3])
  assert.deepEqual(toIntRange('none'), [])
  assert.deepEqual(toIntRange('－1~3'), [-1, 0, 1, 2, 3])     // 全角「－」只是负号写法
  assert.throws(() => toIntRange('1-2'))                  // '-' 不是区间符, 默认 parseFunc = int.Parse 会抛
})

test('括号工具默认方括号 (Helper.cs:59-104)', () => {
  assert.equal(trimParentheses('[1]'), '1')
  assert.equal(trimParentheses('(1)'), '(1)')                // 默认不剥圆括号
  assert.deepEqual(trimParenthesesLoop('(a:b)(c:d)', '(', ')'), ['a:b', 'c:d'])
  assert.equal(trimParenthesesLoop('nope'), null)
})

test('ParseConditionFilter (Parser.cs:128-151)', () => {
  const rows = [{ id: 1, hp: 30 }, { id: 2, hp: 80 }]
  const pick = (id: string, r: { id: number; hp: number }) => (id === 'id' ? r.id : id === 'hp' ? r.hp : Number(id) || 0)
  const gt50 = parseConditionFilter<{ id: number; hp: number }>('(hp>50)', (ids, v) => ids.map(x => pick(x, v)))
  assert.deepEqual(rows.filter(gt50), [{ id: 2, hp: 80 }])
  const all = parseConditionFilter<{ id: number; hp: number }>(null, (ids, v) => ids.map(x => pick(x, v)))
  assert.equal(rows.filter(all).length, 2)
})
