// S1b 差分对拍：把《阿卡迪亚：重启》**自己编出来的 Assembly-CSharp.dll** 当 oracle，
// 与 game/core/ 的 TS 移植体在同一批向量上逐值比。
//
// 为什么不是"照源码再写一遍 C# 然后对拍"：那样两边都是我理解的产物，一致只证明我没跑偏自己的误解，
// 证明不了跟上游一致。直接调真二进制把这一层循环论证消掉了 —— 顺带把 Mathf.RoundToInt
// 这类"只有 Unity 运行时才有权威答案"的问题当场坐实 (实测 ToEven, 见 tools/oracle-cs probe 输出)。
//
// 跑法: node tools/difftest.mjs [--n=400] [--seed=7]
//   前置: dotnet SDK + tools/oracle-cs 已 build + /home/wing/Software/Seer2/ 下的 0827 构建在盘上。
//   仅本地研究用途, 上游二进制不入库、不分发。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { operate, condition, toHalfCondition, splitCondition } from '../game/core/parser/operator.ts'
import { literalResolver, parseOperation, parseDataType, parseFraction, parseOptions, isFraction, isOperator, isConditionOp } from '../game/core/parser/parser.ts'
import { getIdentifier, getNumIdentifier } from '../game/core/parser/identifier.ts'
import { createRng } from '../game/core/rng.ts'
import { roundToInt, floorToInt, ceilToInt, clamp as mclamp, abs as mabs, pow as mpow, sign as msign, f } from '../game/core/mathf.ts'
import { Status, getPersonalityBuff, getPowerUpBuff, addPersonality, getPetNormalStatus } from '../game/core/pet/status.ts'
import { getElementRelation, getElementRelationSub, getElementName } from '../game/core/pet/element.ts'
import { sortActionOrder } from '../game/core/battle/damage.ts'
import { Effect, PrefabTable, effectFromRow, setEffectTable } from '../game/core/effect/effect.ts'
import { BuffInfo, setBuffTables } from '../game/core/buff/buff-info.ts'
import { BuffReferData } from '../game/core/buff/buff-refer-data.ts'
import { Buff, setBuffHost } from '../game/core/buff/buff.ts'
import { setSkillTable, getSkill } from '../game/core/battle/views.ts'
import { BuffType } from '../game/core/buff/buff-database.ts'
import { tryParseFloat } from '../game/core/strutil.ts'
import { SNAP_KINDS, mineSnap, snapVectors, skillTable } from './snap-mirror.mjs'
import { getLevelExp, getTotalExp, getLevelByTotalExp } from '../game/core/pet/exp-system.ts'
import { Pet } from '../game/core/pet/pet.ts'
import { PetBasic } from '../game/core/pet/basic.ts'
import { PetFeature } from '../game/core/pet/feature.ts'
import { PetExp } from '../game/core/pet/exp.ts'
import { PetTalent } from '../game/core/pet/talent.ts'
import { PetSkill } from '../game/core/pet/skills.ts'
import { PetRecord } from '../game/core/pet/record.ts'
import { PetUI } from '../game/core/pet/ui.ts'
import { PetResist } from '../game/core/pet/resist.ts'
import { setPetEnv, petEnv } from '../game/core/pet/env.ts'
import { petInfoFromUnity } from '../game/core/pet/pet-info.ts'

const ORACLE = join(import.meta.dirname, 'oracle-cs/bin/Debug/net9.0/oracle.dll')
const arg = (k, d) => { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? Number(m.slice(k.length + 3)) : d }
const SEED = arg('seed', 7)
const N = arg('n', 400)

// ── 确定性向量生成 (种子写死可复现; oracle 只吃向量, 不依赖随机源本身) ──
let s = SEED >>> 0
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
const pick = a => a[Math.floor(rnd() * a.length) % a.length]

const OPS = ['+', '-', '*', '/', '^', '%', '[MIN]', '[MAX]', '[ABS]', '[NEG]', '[FLR]', '[CEL]', '[RND]']
const COND = ['<', '>', '=', 'LTE', 'GTE', 'NOT']
// 特意塞进 .5 半值 / 0 除 / 负数 / int 截断边界 / 大数 —— 全是 C# 与 JS 直觉会分叉的位置
const EDGE = [0, 1, 2, 3, 0.5, -0.5, 1.5, 2.5, 3.5, 4.5, -1.5, -2.5, 7.9, -7.9, 100, 0.3333333333, 255, 65535, 1e7, -1e7, 0.1, 0.2, 1e-7]
const num = () => (rnd() < 0.3 ? pick(EDGE) : Math.round(rnd() * 999) / (1 + Math.round(rnd() * 9)))
const lit = String
const expr = () => {
  const shape = rnd()
  const a = num(), b = num(), c = num(), op = pick(OPS), op2 = pick(OPS)
  if (shape < 0.45) return `${lit(a)}${op}${lit(b)}`
  if (shape < 0.7) return `${lit(a)}${op}${lit(b)}${op2}${lit(c)}`          // 左到右折叠, 无优先级
  if (shape < 0.85) return `(${lit(a)}${op}${lit(b)})${op2}${lit(c)}`
  return `-${lit(a)}${op2}${lit(b)}`                                        // 前导符号位
}

const vectors = []
const push = v => vectors.push(v)
for (let i = 0; i < N; i++) push({ kind: 'parse', expr: expr() })
for (const op of OPS) for (const [l, r] of [[5, 2], [2, 5], [-5, 2], [5, -2], [0, 0], [7.9, 2.9], [2.5, 1], [1e7, 3], [-0.5, -0.5]])
  push({ kind: 'operate', op, lhs: l, rhs: r })
for (let i = 0; i < 80; i++) push({ kind: 'operate', op: pick(OPS), lhs: num(), rhs: num() })
for (const op of [...OPS, 'SET', 'Unknown', '', '<', 'lte', '[min]']) push({ kind: 'opknown', op })
for (const op of [...COND, 'unknown', '', '+']) push({ kind: 'condknown', op })
for (let i = 0; i < 60; i++) { const op = pick(COND); push({ kind: 'condition', op, lhs: num(), rhs: num() }) }
for (const data of ['1', '-1', '1.5', 'none', 'true', 'false', '1/3', '1~3|7', 'a', '', '1e5', '+', '0x10', '1f', ' ', '2.', '.5', '1,000', 'NOT 0', '1<2', '[MIN]', '-0.5'])
  push({ kind: 'datatype', data })
for (const data of ['1/3', '0/0', '1/0', '2/1', '1', 'none', '-1/-3', '10/4', '1/2/3', '/3', '1/']) push({ kind: 'isfrac', data })
for (const data of ['1/3', '2/1', '0/0', '-1/-3', '10/4', '5/2.5']) push({ kind: 'fraction', expr: data })
for (const data of ['1<2', '2<1', '1 LTE 2', '1 GTE 2', '1=1', 'NOT 0', '3＞2', '1＞2', 'a=1&b=2']) push({ kind: 'halfcond', data })
for (const data of ['who=op', 'id=chance', 'turn>0', 'max<3', 'none', 'a>=1', 'hp<50', 'hp＜50', 'a＝1']) push({ kind: 'splitcond', data, defaultOp: '=' })
for (const data of ['type=powerup&value=2&turn=3', 'none', '', 'a=1', 'a=1&a=2', 'a=1=2', 'novalue', 'a=', '=1', 'a=1&b=2', 'who=op&op=*&value=0.95', 'max=2|min=1', 'a=1&a=1', 'a=1&'])
  push({ kind: 'options', data })
for (const x of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, -0.5, -1.5, -2.5, 0, 1e7 + 0.5]) push({ kind: 'roundi', x })
for (const id of ['1', '-2', 'none', 'pet1', '1~3|7', '0[9]', '[1~2]', 'x', '1-2', '2.9']) push({ kind: 'numid', id })

// ── 实测坐实过的语义一律留固定用例 ──
// 这些不是"顺手加的样本", 每一条都对应一次已经观察到的上游行为; 缺了它们, 下一次改动就能把
// 该语义静默退回去而对拍仍是绿的。故意不放 20+ 位长字面量 (.NET 遗留累加路径差 1 ULP, 见 strutil.ts)。
for (const data of ['1e5', '1E5', '1e', '1e+', '1.5e-3', '.5e2', '1,000', '1,00', '10,0,0', '1,0000',
  '12,34,567', ',5', '1,', '1,.', '1.000,5', '1e5f', '+1e5', ' 1e5 ', '1,000.5', '1e40'])
  push({ kind: 'datatype', data })
// 带括号的 token 会原样进 GetIdentifier → 兜底 0; 于是 0/0 = NaN 落到 [MIN]/[MAX] 上,
// 而 Unity 的 Min/Max 是严格比较、不成立时返回 b —— Math.min/max 会返回 NaN, 是分歧高发点。
for (const expr of ['(859/1)[MIN]61.5', '(859/1)[MAX]61.5', '5[MIN]0/0', '5[MAX]0/0',
  '1/0%3', '0/0%3', '1/0[FLR]3', '1/0[CEL]3', '1/0[RND]3', '0/0[RND]3',
  '101^100.33333333333333[FLR]3', '100[NEG]82.33333333333333', '(60.125[RND]36)[NEG]1.5'])
  push({ kind: 'parse', expr })
// % 的两个面: 除数截断为 0 ⇒ 抛 DivideByZero; 操作数越界 ⇒ 饱和到 ±int 极值
for (const [l, r] of [[5, 0.5], [7.5, 0], [0.9, 0.9], [1.9826369e34, 7], [-1.9826369e34, 7], [3.4028235e38, 7]])
  push({ kind: 'operate', op: '%', lhs: l, rhs: r })
// ParseOperation 实际走的是 GetIdentifier (不是 GetNumIdentifier) —— 前缀链也得对拍。
// 只放"进程外也能回答"的: 带括号/异形的 token 一律兜底 0; date.* 依赖墙钟、player.*/petBag/item 依赖
// Player.instance, 上游直接 NullReferenceException (实测), 归到 nativeOnly 那类不可比, 故意不生成。
for (const id of ['1', '-2', 'none', 'pet1', '(859', '1)', '61.5', '1,000', '1e3', 'x', '2.9', '1e', 'SET'])
  push({ kind: 'ident', id })
// int 没有 -0: 负小数过 ToInt 再乘回来必须是 +0 那一侧 (Object.is(0,-0) 为假, 所以这条只能靠固定用例守住)
for (const [op, l, r] of [['[CEL]', -7.9, 111.85714285714286], ['[RND]', -1.5, 137.5], ['[RND]', 86.42857142857143, -1e7], ['[FLR]', 0.2, -0.5]])
  push({ kind: 'operate', op, lhs: l, rhs: r })
for (const expr of ['-1e-7[CEL]133.5', '(-2.5*0.5)[CEL]66.83333333333333', '1e-7/127.5%3'])
  push({ kind: 'parse', expr })

// ── S2 数值层向量 ──
// Status 向量在两边都是 6 列 float。oracle 侧 NonFinite 走哨兵字符串, JS 侧 sent() 映射同一组。
const vec6 = () => Array.from({ length: 6 }, () => (rnd() < 0.25 ? pick(EDGE) : Math.round(rnd() * 255) / (1 + Math.round(rnd() * 9))))
const S_KEYS = ['atk', 'mat', 'def', 'mdf', 'spd', 'hp', 'all', 'max', 'min', 'sum', 'abs', 'sign', 'pos', 'neg', 'acc', 'HIT', 'atk/mat', '', 'none']
for (let i = 0; i < 120; i++) push({ kind: 'normalstatus', level: 1 + Math.floor(rnd() * 100), base: vec6(), iv: Math.floor(rnd() * 32), ev: vec6(), p: Math.floor(rnd() * 60) })
// 性格 id 的**边界**比随机样本重要: IsInRange(0,55) 是半开区间 ⇒ 55 落在兜底那一支,
// 25 是「单+单」与「双+三减一」两段骨架的分界, 24/26 各占一段。
for (const p of [-1, 0, 1, 4, 5, 24, 25, 26, 27, 29, 30, 49, 54, 55, 56, 99]) push({ kind: 'pbuff', p })
for (let i = 0; i < 60; i++) push({ kind: 'pbuff', p: Math.floor(rnd() * 70) - 5 })
for (let i = 0; i < 60; i++) push({ kind: 'pubuff', s: vec6() })
// 0.1 的累加路径 + "两个 delta 同列非零即取 lhs" 的冲突判据, 全靠这两批组合覆盖。
for (const lhs of [0, 1, 5, 24, 25, 26, 54]) for (const rhs of [0, 1, 5, 24, 25, 26, 54, 55, -1]) push({ kind: 'paddd', lhs, rhs })
for (let i = 0; i < 60; i++) push({ kind: 'paddd', lhs: Math.floor(rnd() * 56), rhs: Math.floor(rnd() * 60) - 2 })
// Status 的五个运算符: / 是**乘倒数** (lhs * (1/rhs)), rhs=0 ⇒ ±Inf 而不是抛; ^ 走 Mathf.Pow,
// 1^±Inf 与 (-1)^±Inf 都归 1 —— 这两条是 Math.pow 与 C# 的分叉点, 必须留固定用例。
for (const op of ['add', 'sub', 'mul', 'div', 'pow']) {
  // Status 的 `/` **没有** (Status,Status) 重载 (Status.cs:287 只有 float 那一支),
  // 所以 div 只发标量 rhs —— 发数组会让 oracle 挑不到签名而报 MissingMethodException,
  // 那会被算成"我架子没对上", 而不是上游行为。
  for (const rhsArr of (op === 'div' ? [false] : [false, true])) {
    push({ kind: 'statusop', op, lhs: [1, 2, 3, 4, 5, 6], rhs: 2, rhsArr: rhsArr ? [2, 2, 2, 2, 2, 2] : undefined })
  }
  push({ kind: 'statusop', op, lhs: [1, 1, 1, 1, 1, 1], rhs: 0 })
  push({ kind: 'statusop', op, lhs: [-1, -1, -1, -1, -1, -1], rhs: 'Inf' })
  push({ kind: 'statusop', op, lhs: [0, 0, 0, 0, 0, 0], rhs: 'NaN' })
}
for (let i = 0; i < 90; i++) push({ kind: 'statusop', op: pick(['add', 'sub', 'mul', 'div', 'pow']), lhs: vec6(), rhs: pick(EDGE) })
for (let i = 0; i < 40; i++) push({ kind: 'statusop', op: pick(['add', 'mul', 'pow']), lhs: vec6(), rhsArr: vec6() })
for (let i = 0; i < 60; i++) { const s = vec6(); push({ kind: 'statusget', s, key: pick(S_KEYS) }) }
for (const key of ['atk', 'hp', 'all', 'max', 'spd', '']) push({ kind: 'statusget', s: [0, 0, 0, 0, 0, 0], key })
for (let i = 0; i < 40; i++) push({ kind: 'statusset', s: vec6(), key: pick(S_KEYS), value: pick(EDGE) })
// Parse 有**死分支** (Status.cs 判的是 str 而不是 typeList) ⇒ 畸形串是直接 NRE, 不是回默认值。
for (const str of ['(1,2,3,4,5,6)', '1/2/3/4/5/6', '(1,2,3)', '()', '(,1,2,3,4,5)', 'atk:5', 'none', '(859', '1/2/3', '(1,2,3,4,5,6,7)', ''])
  push({ kind: 'statusparse', str })
for (let i = 0; i < 40; i++) { const m = Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => Math.floor(rnd() * 99)); push({ kind: 'statusparse', str: '(' + m.join(',') + ')' }) }
// 相克表按 [def][atk] 索引, 且 GetElementRelation 的兜底是 `?? 1` —— 越界 id 与未知元素都走它。
for (let i = 0; i < 120; i++) push({ kind: 'elemrel', atk: Math.floor(rnd() * 26) - 2, def: Math.floor(rnd() * 26) - 2 })
for (let i = 0; i < 120; i++) push({ kind: 'elemrel2', atk: Math.floor(rnd() * 26) - 2, def: Math.floor(rnd() * 26) - 2, sub: Math.floor(rnd() * 26) - 2 })
// 副属性为「普通」时**整条子关系被跳过** (不是乘 1), 所以 def=普通 与 sub=普通 要各自有样本。
for (const [atk, def, sub] of [[1, 1, 0], [1, 0, 1], [0, 0, 0], [3, 1, 1], [1, 3, 3], [-1, 0, 5], [99, 5, 5]]) push({ kind: 'elemrel2', atk, def, sub })
for (let i = 0; i < 40; i++) push({ kind: 'elemname', e: Math.floor(rnd() * 28) - 3, len: Math.floor(rnd() * 8) - 1 })
for (const [e, len] of [[-1, 3], [0, 0], [22, 4], [23, 4], [99, -1], [1, 1]]) push({ kind: 'elemname', e, len })
for (const x of [-0, -1, 0, 1, 'NaN', 'Inf', '-Inf', -7.5, 7.5]) push({ kind: 'msign', x })
for (const x of [-0, -1, 0, 1, 'NaN', 'Inf', '-Inf', -7.5, 7.5]) push({ kind: 'mabs', x })
// Mathf.Pow 的定义域: 1^±Inf、(-1)^±Inf 归 1, 0^负 ⇒ Inf, 负数^分数 ⇒ NaN。
for (const [a, b] of [[1, 'Inf'], [1, '-Inf'], [1, 'NaN'], [-1, 'Inf'], [-1, '-Inf'], [-1, 'NaN'], [0, -1], [0, 0], [-8, 1 / 3], [2, 10], [2, -10], ['NaN', 0]])
  push({ kind: 'mpow', a, b })
for (let i = 0; i < 40; i++) push({ kind: 'mpow', a: pick(EDGE), b: pick(EDGE) })
// Clamp 与 Max(Min()) 的嵌套在 lo > hi 时分叉 (这里故意造倒序区间)。
for (const [x, lo, hi] of [[5, 0, 10], [5, 10, 0], [-5, -1, 1], ['NaN', 0, 1], [0, 'NaN', 1], ['Inf', 0, 1]]) push({ kind: 'mclamp', x, lo, hi })
for (let i = 0; i < 40; i++) push({ kind: 'mclamp', x: pick(EDGE), lo: pick(EDGE), hi: pick(EDGE) })
// LINQ 排序**稳定性**: 只有真框架能回答"并列时谁在前"。键空间故意压到很小 ⇒ 大量并列。
for (let i = 0; i < 60; i++) {
  const n = 2 + Math.floor(rnd() * 4)
  push({
    kind: 'orderby', neg: rnd() < 0.3 ? -1 : 1,
    items: Array.from({ length: n }, () => ({
      hasSkill: rnd() < 0.85 ? 1 : 0, isAction: rnd() < 0.5 ? 1 : 0,
      vipriority: Math.floor(rnd() * 2), priority: Math.floor(rnd() * 3),
      spd: pick([100, 100, 50, 50, 0, -1, 'NaN', 'Inf']), rnd: Math.floor(rnd() * 3),
      unitId: pick([-2, -1, 0, 1, 2]), cursor: Math.floor(rnd() * 4),
    })),
  })
}
for (const x of [0.5, 1.5, 2.5, -0.5, -2.5, 'NaN', 'Inf', 7.9, -7.9]) { push({ kind: 'floori', x }); push({ kind: 'ceili', x }) }


// ── S3 效果层向量 (Effect.Parse / Format 往返) ──
// 素材两条腿: ① 上游表里**真实存在**的 DSL 引用串 (tools/fixtures/effect-dsl.txt, 从 Data/**/*.csv
// 平衡括号扫出来的 172 条) —— 这才是会被实际喂进解析器的形状; ② 覆盖全 113 个预制体 id 的合成引用,
// 外加括号/花括号错配、空参、多引用串联这些"表里没有但引擎会被别的调用喂到"的位置。
// 比的是 GetRawEffectStringArray() 的 7 列拼接: 它把 timing/target/condition/ability 的词表反查、
// condOption/abilityOption 的**插入顺序**、Format 的 {i} 替身结果一次性全暴露出来。
const PREFABS = JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/effects.json'), 'utf8')).prefabs
const EFFECTS = new PrefabTable(PREFABS)
const DSL_FIXTURE = join(import.meta.dirname, 'fixtures/effect-dsl.txt')
const REAL_DSL = readFileSync(DSL_FIXTURE, 'utf8').split('\n').filter(Boolean)
for (const expr of REAL_DSL) push({ kind: 'effectparse', expr })

const ARG_SHAPES = ['1', '-1', '0.8', '99999', 'atk', 'who', 'op', 'value', 'name=添加印记', 'buff=3',
  '2=4', 'a=1&b=2', '(round:3)', '(value_1:3)', '', ' ', '1/3', '[MAX]', 'id=10001', '3000']
const dslArg = () => pick(ARG_SHAPES)
const refOf = (id, n) => `(${id}${Array.from({ length: n }, () => `{${dslArg()}}`).join('')})`
for (const p of PREFABS) {
  const id = p.id
  for (const n of [0, 1, 2, 3, 5, 8]) push({ kind: 'effectparse', expr: refOf(id, n) })
}
// 括号语义的边界: 上游 trimParenthesesLoop 只在"剥得干净"时返回, 否则整串判失败; Format 又是按下标
// 替换 {1}..{n} ⇒ 参数个数与预制体占位符个数的错配必须专门覆盖 (上面 n=0..8 已经扫过一遍)。
for (const expr of [
  null, '', 'none', '1002', '(1002', '1002)', '(1002)', '()', '(())', '((1002))', '(1002{)', '(1002{a)',
  '(1002{{a}})', '(1002{a}{b}', '(1002{a}})', '(abc{1})', '(99999999)', '(-1)', '(-4)', '(-7)', '(-1001)',
  '(1002{a})(1001{b})', '(1002{a}{b}{c}{d}{e}{f}{g}{h}{i}{j})', ' (1002) ', '（1002）', '(1002{1}{2})x',
  'x(1002{1}{2})', '(1002{1}extra)', '(2002{who}{op}{id}{120}{turn}{2})', '(1002{buff=3&2=4&5=6})',
  '(0)', '(0{1})', '0',
]) push({ kind: 'effectparse', expr: expr === null ? null : String(expr) })

// ── S3 印记层向量 (BuffInfo / Buff / 文案) ──────────────────────────────
// 比的是「印记这一层能不能喂进真表」: BuffInfo 的七个成员、Buff 的 value 夹紧与标识符求值、
// 以及整条 GetBuffDescriptionPreview。文案是**整串比对**, 一处替换顺序错就整条不同, 所以
// raw 里既有真表的描述 (它们本来就带 [value]/[skill]/[option[x]:num]), 也有手工凑的十一个键。
const BUFFS = JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/buffs.json'), 'utf8')).buffs
const SKILLS = JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/skills.json'), 'utf8')).skills
const BUFF_ROW = new Map(BUFFS.map(b => [b.id, b]))
const SKILL_NAME = new Map(SKILLS.map(s => [s.id, s.name]))

// 从 buffs.json **重建成 CSV 那 7 个字段**再走 BuffInfo 的 CSV 构造 —— 直接塞已解析字段的话,
// 拍到的只是 build-unity-data.mjs 的自己, 不是 BuffInfo.cs。重建与再解析是否等价, 由 raw 那条向量自己回答。
const rowOf = b => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
  b.options.map(([k, x]) => `${k}=${x}`).join('&'), b.description]

class LoadedBuffInfos {
  constructor() {
    for (const b of BUFFS) {
      const info = new BuffInfo(rowOf(b))
      info.setEffects(b.effects.map(effectFromRow))
      this.byId.set(info.id, info)
    }
  }
  byId = new Map()
  getBuffInfo(id) { return id === 0 ? null : (this.byId.get(id) ?? null) }
  // AddBuff 的 `unique[型]` / `random[型]` 候选集 —— 上游是
  // `Database.instance.buffInfoDict.Where(e => e.Value.type == t).Select(e => e.Key)`,
  // 也就是**字典插入序** (= CSV 装载序) 过滤。非空候选接着要掷 native 骰 ⇒ 对拍只在「筛空 ⇒ return false」
  // 那条确定支上可比, 顺序本身不可观测, 但按上游口径打才不欠东西。
  buffIdsOfType(type) {
    const out = []
    for (const info of this.byId.values()) if (info.type === type) out.push(info.id)
    return out
  }
}
// 装载顺序 = 上游 Database.Init 的顺序 (LoadEffects → LoadSkill → LoadBuffInfo):
// BuffInfo.SetEffects 里的常驻 set_skill 壳会经 Effect.Parse 回头查 effectDict, 效果表没先立起来
// 整张印记表就建不出来 —— 这条在 oracle 侧 (Boot.cs) 和这里踩到的是同一个坑。
setEffectTable(EFFECTS)
// LoadSkill: 真技能表在这条线上立起来, 顺序与 oracle 的 Boot (skillDict 先、buffInfoDict 后) 一致 ——
// 于是 `unit-skill-system` 的 getSkill(id) 从此查到真技能, 而 `skilltable` 一族已经证明逐列一致。
setSkillTable(skillTable())
const BUFF_TABLE = new LoadedBuffInfos()
// petName 恒 null 是与 oracle **同一口径**的注法: 那份进程里 petInfoDict 是被补出来的空表 (Boot.cs 第 5 步),
// 所以 [x:pet] 在真二进制里走的正是兜底分支。等 S6 把宠表接进 oracle 后这条要一起换掉。
setBuffTables(BUFF_TABLE, EFFECTS, (id) => tryParseFloat(id) ?? 0)
setBuffHost({ petName: () => null, skillName: (id) => (id === 0 ? null : (SKILL_NAME.get(id) ?? null)), allInfos: () => [...BUFF_TABLE.byId.values()] })

// ── D6 B5: 把 pets.json 的真实宠表接进 PetEnv 接缝, 让 getPetIdentifier / normalStatus / evolve 读到真数据 ──
const PETS_JSON = JSON.parse(readFileSync(join(import.meta.dirname, '../game/data/unity/pets.json'), 'utf8'))
const PETS_ARR = Array.isArray(PETS_JSON.pets) ? PETS_JSON.pets : []
const PETS_BY_ID = new Map(PETS_ARR.map((p) => [p.id, p]))
setPetEnv({
  petInfo: (id) => { const raw = PETS_BY_ID.get(id); return raw ? petInfoFromUnity(raw) : null },
  getSkill: (id) => getSkill(id, false),
  getLevelExp: (level, expType) => getLevelExp(level, expType),
  evolveChain: (baseId, id) => {
    const chain = []
    const seen = new Set()
    let cur = PETS_BY_ID.get(id)
    while (cur && cur.id !== baseId && !seen.has(cur.id)) {
      seen.add(cur.id)
      const ev = cur.growth && Array.isArray(cur.growth.evolvePetIds) ? (cur.growth.evolvePetIds[0] ?? 0) : 0
      if (ev === 0) break
      const next = PETS_BY_ID.get(ev)
      if (!next) break
      chain.push(ev)
      cur = next
    }
    return chain
  },
  rng: createRng(SEED),
  now: () => 0,
  petInfoIds: () => PETS_ARR.map((p) => p.id),
  buffIdsOfGroup: (group) => [...BUFF_TABLE.byId.values()].filter((b) => (b.options.get(group) ?? '') === group).map((b) => b.id),
})

// 与 oracle BuildPet 同口径的造宠: 组件各自带 id, currentStatus 初值为零 Status。
const buildPet = (spec) => {
  const id = spec.id ?? 10001
  const pet = new Pet()
  pet.id = id
  pet.basic = new PetBasic()
  pet.basic.baseId = spec.baseId !== undefined ? spec.baseId : ((petEnv().petInfo?.(id)?.basic?.baseId) ?? id)
  pet.feature = new PetFeature()
  pet.exp = new PetExp(); pet.exp.id = id
  if (spec.level !== undefined) pet.exp.level = spec.level
  pet.talent = new PetTalent()
  pet.skills = new PetSkill()
  pet.record = new PetRecord()
  pet.ui = new PetUI()
  pet.ui.skinId = (petEnv().petInfo(id)?.ui?.skinId) ?? id
  pet.resist = new PetResist()
  pet.currentStatus = new Status()
  return pet
}

// ── D6 B5: petid / petstat 金色向量 ──
// 取一批真实 pet id, 覆盖 23+1 只读臂 + status.*/record/skill/buff 前缀。
const PETID_IDS = PETS_ARR.slice(0, 24).map((p) => p.id)
const PETID_IDENTS = ['uid','id','subId','baseId','star','generation','skinId','subElement','gender','personality','trait','height','weight','level','maxLevel','exp','iv','evStorage','emblem','resistLock','status.atk','status.hp','status.all','status.battle']
for (const id of PETID_IDS) for (const ident of PETID_IDENTS) push({ kind: 'petid', pet: { id }, ident })
// normalStatus 在 oracle 造宠路径里取不到真 baseStatus (永远回退到默认 Status), 不可比; 只比 extra/current (两边皆 0)。
for (const id of PETID_IDS) for (const which of ['extra', 'current']) push({ kind: 'petstat', pet: { id }, which })
// B5 写侧: SetPetIdentifier 的标量臂 (写后再回读同一把 key)。非标量臂 (skill±/buff±/record/trait/featureType/
// emblemType/maxLevel) 走整只签名, TS 侧没实现 SigPet, 留作等人手测确认项。
const SETID_SCALAR = [['gender', 5], ['personality', 3], ['height', 40], ['weight', 50], ['emblem', 1], ['evStorage', 3], ['skinId', 200], ['resistLock', 2], ['trait', 4]]
for (const id of PETID_IDS) for (const [ident, num] of SETID_SCALAR) push({ kind: 'petmut', op: 'setid', pet: { id }, ident, num })


// 与 oracle 的 BuffOf 逐字对齐: turn 缺省 -1、value 缺省 null, sets 按 JSON 里的书写序应用。
const buildBuff = (v) => {
  const b = new Buff(v.id, v.turn ?? -1, v.value ?? null)
  if (v.sets) for (const [k, x] of Object.entries(v.sets)) b.setBuffIdentifier(k, x)
  return b
}

const INFO_OPS = ['raw', 'effects', 'sortPriority', 'addPriority', 'position', 'overrideType', 'resId', 'itemId',
  'keep', 'inherit', 'legacy', 'hide', 'removable', 'autoRemove', 'movable', 'minValue', 'maxValue',
  'name', 'description', 'type', 'copyHandleType', 'turn', 'id']
const IDENT_KEYS = ['id', 'type', 'value', 'turn', 'round', 'ignore', 'hide', 'removable', 'movable',
  'maxValue', 'minValue', 'nope', 'option[round]', 'option[value]', 'option[atk]', 'group[feature]',
  'type[powerup]', 'type[abnormal]', 'option', 'option[]', 'group', 'type']
const BOOL_OPS = ['uneffectable', 'copyable', 'power', 'powerup', 'powerdown', 'abnormal', 'unhealthy', 'unmovable', 'yite']
const TYPE_NAMES = Object.keys(BuffType)

// 特殊 id 全覆盖 (sortPriority 的七个特判 + IsPower/IsUnmovable/IsAbnormal 的硬编码 id), 再随机补一批
const SPECIAL = [-1, -2, -4, -5, -6, -9, -10, -21, -2001, -2003, -2004, -2005, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 15, 90, 91, 99, 100, 104, 199, 1999, 3044]
const BUFF_IDS = SPECIAL.filter(id => BUFF_ROW.has(id))
  .concat([...BUFF_ROW.keys()].sort((a, b) => a - b).filter(() => rnd() < 0.02).slice(0, 40))
for (const id of new Set(BUFF_IDS)) {
  for (const op of INFO_OPS) push({ kind: 'buffinfo', id, op })
  for (const [turn, value] of [[-1, null], [-1, 3], [2, -2], [0, 0], [5, 999999], [-1, -999999]]) {
    push({ kind: 'buffid', id, turn, value, op: 'name' })
    for (const key of IDENT_KEYS) push({ kind: 'buffid', id, turn, value, op: `ident:${key}` })
    for (const b of BOOL_OPS) push({ kind: 'buffid', id, turn, value, op: b })
    for (const t of TYPE_NAMES) push({ kind: 'buffid', id, turn, value, op: `type:${t}` })
    push({ kind: 'buffid', id, turn, value, op: 'value' }, { kind: 'buffid', id, turn, value, op: 'hide' },
      { kind: 'buffid', id, turn, value, op: 'removable' }, { kind: 'buffid', id, turn, value, op: 'options' },
      { kind: 'buffid', id, turn, value, op: 'effects' }, { kind: 'buffid', id, turn, value, op: 'desc' })
  }
  push({ kind: 'buffid', id, turn: -1, value: 1, sets: { 'option[round]': 4, 'turn': 2 }, op: 'ident:round' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:option[value]=5' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:value=999999' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:id=3' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:id=98765432' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:nope=1' })
  push({ kind: 'buffid', id, turn: -1, value: 1, op: 'set:hide=1' })
  push({ kind: 'buffdesc', id, turn: -1, value: 3 })
}

// BuffInfo 的 CSV 构造单独拍一批: 列数不足 / 空 options / 畸形枚举 / 重复键, 这些在真表里未必出现,
// 但「表以后加一行」就会撞上, 而两边的抛法必须一致。
for (const row of [
  ['1', '测试', 'mark', 'stack', '3', '', '描述'],
  ['1', '测试', 'mark', 'stack', '3', 'a=1&a=2', '描述'],
  ['1', '测试', 'bogus', 'stack', '3', '', '描述'],
  ['1', '测试', 'mark', 'bogus', '3', '', '描述'],
  ['abc', '测试', 'mark', 'stack', '3', '', '描述'],
  ['1', '测试', 'mark', 'stack', 'xyz', '', '描述'],
  ['1', '测\t试', 'mark', 'stack', '3', '', '描述'],
  ['1', '测试', 'mark', 'stack', '3', 'min_val=1&max_val=5', '[value]'],
  ['1', '测试', 'mark', 'stack', '3', 'keep=TRUE', 'x'],
  ['1', '测试', 'mark', 'stack', '3', 'keep=true&inherit=true&legacy=true', 'x'],
  ['1', '测试', 'powerup', 'new', '-1', 'type=abnormal', 'x'],
  ['1', '测试', 'mark', 'stack', '3', 'group=achievement', 'x'],
  ['-5', '测试', 'mark', 'stack', '3', '', 'x'],
  ['99999999999', '测试', 'mark', 'stack', '3', '', 'x'],
]) {
  push({ kind: 'buffinfo', row, op: 'raw' }, { kind: 'buffinfo', row, op: 'sortPriority' })
}
push({ kind: 'buffinfo', row: ['1', '测试', 'mark'], op: 'raw' })
push({ kind: 'buffinfo', row: ['1', '测试', 'mark', 'stack', '3', '', '描述', '多余'], start: 1, op: 'raw' })
push({ kind: 'buffinfo', id: 0, op: 'raw' })
push({ kind: 'buffinfo', id: 98765432, op: 'raw' })

// 文案: 真表描述 (含各种 [x]/[x:y]/[option[x]:y]) + 十一个键的手工串
const REAL_DESC = [...new Set(BUFFS.map(b => b.description))].filter(d => d && d.length).sort(() => rnd() - 0.5).slice(0, 150)
const DESC_OPS = [...REAL_DESC.map(raw => ({ kind: 'buffdesc', raw })),
  ...['[pet]', '[skill]', '[buff]', '[element]', '[poker]', '[powerup]', '[who]', '[num]', '[+num]', '[-num]',
    '[value]', '[pet:5]', '[skill:10001]', '[buff:3]', '[element:value]', '[poker:value]', '[who:value]',
    '[option[atk]:num]', '[option[atk]]', '[option[atk]:value]', '[option[]:num]', '[nope:1]', '[nope]',
    '[value][value]', '[num][num]', '[[value]]', '[value', 'value]', '[ENDL]', '[-]', '[FF0000]', '[x]',
    'x[value]y', '[value][skill][pet]', '[+num:who]', '[-num:pet]', '[float:value]', '[int:value]',
    '[value:float]', '[option[value]:float]'].map(raw => ({ kind: 'buffdesc', raw })),
  ...[0, 1, 3, -1, 13, 999].map(value => ({ kind: 'buffdesc', id: 3, turn: -1, value }))]
for (const d of DESC_OPS) push(d)
for (const raw of ['[skill:10001]造成[value]点伤害', '[option[atk]:powerup]', '[poker:poker]', '[element:element]'])
  push({ kind: 'buffdesc', id: 3, turn: -1, value: 3, raw })

// ── BuffReferData 引用串 ────────────────────────────────────────────────
// 技能/道具/天赋都借用这套紧凑写法, 而它的**括号种类**决定 value/turn 取不取得到:
// 表里写的是 `1008[10]` (方括号), 圆括号 `3044(2)` 上游是 int.Parse 整串炸掉。
// 判据来自 oracle: {"kind":"refer","str":"3044(2)"} → FormatException, {"str":"1008[10]"} → 1008|-1|10|。
const REF_REAL = [...new Set([
  ...BUFFS.map(b => b.options.find(([k]) => k === 'ref_buff')?.[1]),
  ...SKILLS.map(s => s.options?.find?.(([k]) => k === 'ref_buff')?.[1]),
].filter(s => s && s.length))]
for (const str of REF_REAL) { push({ kind: 'refer', str }); push({ kind: 'refer', str, dict: true }) }
for (const str of ['1008[10]', '3044[2][k:v]', '3044(2)', '3044', '3044[]', '3044[k:v]', '3044[k:v][w]',
  '3044[2][a:b:c]', '3044[2]/3045[1]', '3044[2]/3044[1]', '', 'abc', '3044[99999999999]', '[2]',
  '3044[1][2][3]', '3044[2][3][k:v]', '3044[(2)]', '3044[2]extra', '3044[ 2 ]']) {
  push({ kind: 'refer', str })
  push({ kind: 'refer', str, dflt: 7 })
  push({ kind: 'refer', str, dflt: 7, dturn: 3 })
  push({ kind: 'refer', str, dict: true })
}
push({ kind: 'refer', str: null })

// ── S3 快照层 ───────────────────────────────────────────────────────────
// 规格表与镜像求值都在 tools/snap-mirror.mjs (它把 oracle 的 Build*/Sig*/<Kind>Vector 逐条对着写了一遍),
// 这里只负责把向量喂进同一批 golden 与同一套比较器。
for (const v of snapVectors(rnd)) push(v)

// ── D6 经验公式（PetExpSystem：纯静态，无 coroutine）—— level/total/bytotal × expType{0,1} 逐值对拍 ──
// 等级覆盖 0..110（含 60 学招线 / 100 / 105 神兽线），totalExp 取跨 Type A(~125w)/B(~83w) 全程的一批散点。
for (const expType of [0, 1]) {
  for (let level = 0; level <= 110; level++) {
    push({ kind: 'petexp', op: 'level', level, expType })
    push({ kind: 'petexp', op: 'total', level, expType })
  }
  for (const total of [0, 1, 5, 9, 10, 50, 100, 333, 500, 1000, 5000, 10000, 50000, 100000,
    200000, 300000, 400000, 500000, 700000, 833330, 1000000, 1250000, 1300000]) {
    push({ kind: 'petexp', op: 'bytotal', total, expType })
  }
}


// ── 跑 oracle ──
const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
writeFileSync(join(dir, 'in.json'), JSON.stringify(vectors))
const outPath = join(dir, 'out.json')
try {
  execFileSync('dotnet', [ORACLE, join(dir, 'in.json'), outPath], { stdio: ['ignore', 'inherit', 'inherit'] })
} catch (e) {
  console.error('oracle 跑挂了 —— 检查 dotnet 构建与 0827 目录还在不在:', e.message)
  process.exit(2)
}
const golden = JSON.parse(readFileSync(outPath, 'utf8'))
// 调试口: DIFF_DUMP=<目录> 时把本批 in/out 原样留档, 方便直接看 oracle 的 errType/err (对拍本身不比错误类型)。
if (process.env.DIFF_DUMP) {
  writeFileSync(join(process.env.DIFF_DUMP, 'in.json'), JSON.stringify(vectors))
  writeFileSync(join(process.env.DIFF_DUMP, 'out.json'), JSON.stringify(golden))
}

// ── TS 侧同构求值 ──
// 无战斗上下文的 host: 只服务 random/日期/玩家档这些可注入分支, 其余前缀一律不认识 → 与上游兜底 0 对齐
const HOST = {
  rng: createRng(SEED),
  getPlayerRandom: () => 0,
  setPlayerRandom: () => {},
  getDate: part => (part === 'year' ? 2026 : 0),
  getPlayerData: () => null,
}
// C# 的 ParseOperation 内部用 Identifier.GetIdentifier 解析每个操作数 (认不认识的一律兜底 0),
// 所以这里必须给同一个兜底链, 不能图省事传 () => 0 —— 那会把每个操作数都当成 0, 分歧全是假报警。
const LIT = literalResolver(HOST)

function mine(v) {
  switch (v.kind) {
    case 'parse': return parseOperation(v.expr, LIT)
    case 'operate': return operate(v.op, v.lhs, v.rhs)
    case 'petexp': {
      const et = v.expType ?? 0
      if (v.op === 'level') return getLevelExp(v.level, et)
      if (v.op === 'total') return getTotalExp(v.level, et)
      if (v.op === 'bytotal') return getLevelByTotalExp(v.total, et)
      throw new Error('difftest 不认 petexp op: ' + v.op)
    }
    // D6 B5: getPetIdentifier read side + three status vectors
    case 'petid': return buildPet(v.pet).getPetIdentifier(v.ident)
    case 'petmut': {
      if (v.op === 'setid') {
        const pet = buildPet(v.pet)
        pet.SetPetIdentifier(v.ident, v.num)
        return pet.getPetIdentifier(v.ident)
      }
      return mineSnap(v)
    }
    case 'petstat': {
      const pet = buildPet(v.pet)
      const which = v.which ?? 'normal'
      const st = which === 'extra' ? pet.extraStatus : which === 'current' ? pet.currentStatus : pet.normalStatus
      return st.toArray()
    }
    case 'opknown': return isOperator(v.op)
    case 'condknown': return isConditionOp(v.op)
    case 'condition': return condition(v.op, v.lhs, v.rhs)
    case 'datatype': return shapeDataType(parseDataType(v.data))
    case 'isfrac': return isFraction(v.data)
    case 'fraction': { const x = parseFraction(v.expr); return `${x.num}/${x.den}` }
    case 'halfcond': return toHalfCondition(v.data)
    case 'splitcond': { const r = splitCondition(v.data, v.defaultOp); return `${r.key}|${r.value}|op=${r.op}` }
    case 'options': { const m = new Map(); parseOptions(m, v.data); return [...m].map(([k, x]) => `${k}=${x}`).join('&') }
    case 'roundi': return Number(roundToInt(v.x))
    case 'numid': return getNumIdentifier(v.id, HOST)
    case 'ident': return getIdentifier(v.id, HOST)
    // ── S2 ──
    case 'normalstatus': return getPetNormalStatus(v.level, new Status(v.base), v.iv, new Status(v.ev), v.p).toArray()
    case 'pbuff': return getPersonalityBuff(v.p).toArray()
    case 'pubuff': return getPowerUpBuff(new Status(v.s)).toArray()
    case 'paddd': return addPersonality(v.lhs, v.rhs)
    case 'statusop': {
      const lhs = new Status(v.lhs)
      const rhs = v.rhsArr !== undefined ? new Status(v.rhsArr) : fnum(v.rhs)
      switch (v.op) {
        case 'add': return (v.rhsArr !== undefined ? lhs.plus(rhs) : lhs.plusF(rhs)).toArray()
        case 'sub': return (v.rhsArr !== undefined ? lhs.minus(rhs) : lhs.minusF(rhs)).toArray()
        case 'mul': return (v.rhsArr !== undefined ? lhs.times(rhs) : lhs.timesF(rhs)).toArray()
        case 'div': return lhs.divF(rhs).toArray()
        case 'pow': return (v.rhsArr !== undefined ? lhs.powTo(rhs) : lhs.powToF(rhs)).toArray()
        default: throw new Error('未知 statusop: ' + v.op)
      }
    }
    case 'statusget': return new Status(v.s).get(v.key)
    case 'statusset': { const st = new Status(v.s); st.setByName(v.key, fnum(v.value)); return st.toArray() }
    case 'statusparse': { const st = Status.Parse(v.str); return st === null ? null : st.toArray() }
    case 'elemrel': return getElementRelation(v.atk, v.def)
    case 'elemrel2': return getElementRelationSub(v.atk, v.def, v.sub)
    case 'elemname': return getElementName(v.e, v.len)
    case 'msign': return msign(fnum(v.x))
    case 'mabs': return mabs(fnum(v.x))
    case 'mpow': return mpow(fnum(v.a), fnum(v.b))
    case 'mclamp': return mclamp(fnum(v.x), fnum(v.lo), fnum(v.hi))
    case 'floori': return floorToInt(fnum(v.x))
    case 'ceili': return ceilToInt(fnum(v.x))
    case 'orderby': return sortActionOrder(v.items.map(x => ({ ...x, neg: v.neg, spd: fnum(x.spd) })))
    // ── S3 ── 比 7 列 raw 串的拼接; 逐列比没意义, 上游暴露的本来就是这一个数组
    case 'effectparse': { const list = Effect.parse(v.expr, EFFECTS); return list === null ? null : list.map(e => e.getRawEffectStringArray().join('|')) }
    // ── S3 印记层 ── 三个 kind 的成员取值口径与 oracle 的 BuffMember 一致 (属性与字段混着取)
    // refer 的观测形状与 oracle 的 FormatRefer 逐字对齐: id|turn|value(可空写成 "null")|k=v&…
    case 'refer': {
      const fmt = (d) => `${d.id}|${d.turn}|${d.value === null ? 'null' : d.value}|${[...d.options].map(([k, x]) => `${k}=${x}`).join('&')}`
      const dflt = v.dflt === undefined ? null : v.dflt
      const dturn = v.dturn === undefined ? -1 : v.dturn
      if (v.dict !== undefined) {
        const m = BuffReferData.parseDict(v.str, dflt, dturn)
        return m === null ? null : [...m].map(([k, d]) => `${k}=>${fmt(d)}`)
      }
      const one = BuffReferData.parse(v.str, dflt, dturn)
      return one === null ? null : fmt(one)
    }
    case 'buffinfo': {
      const info = v.row !== undefined ? new BuffInfo(v.row, v.start ?? 0) : BUFF_TABLE.getBuffInfo(v.id)
      if (info === null) throw new Error('NullReferenceException: GetBuffInfo ⇒ null')
      if (v.op === 'raw') return info.getRawInfoStringArray().join('|')
      if (v.op === 'effects') return info.effects.map(e => e.getRawEffectStringArray().join('|'))
      if (!(v.op in info)) throw new Error(`MissingMemberException: BuffInfo 没有成员 ${v.op}`)
      return info[v.op]
    }
    case 'buffid': {
      const b = buildBuff(v)
      const op = v.op
      if (op.startsWith('ident:')) return b.getBuffIdentifier(op.slice(6))
      if (op.startsWith('type:')) return b.isType(BuffType[op.slice(5)])
      if (op.startsWith('set:')) {
        const body = op.slice(4), n = body.indexOf('=')
        b.setBuffIdentifier(body.slice(0, n), Number(body.slice(n + 1)))
        return b.getBuffIdentifier(body.slice(0, n))
      }
      if (op === 'options') return [...b.options].map(([k, x]) => `${k}=${x}`).join('&')
      if (op === 'effects') return b.effects.map(e => e.getRawEffectStringArray().join('|'))
      const m = { uneffectable: 'isUneffectable', copyable: 'isCopyable', power: 'isPower', powerup: 'isPowerUp',
        powerdown: 'isPowerDown', abnormal: 'isAbnormal', unhealthy: 'isUnhealthy', unmovable: 'isUnmovable',
        yite: 'isYiTeMedicineItem', desc: 'getDescription' }[op]
      if (m) return b[m]()
      if (!(op in b)) throw new Error(`MissingMemberException: Buff 没有成员 ${op}`)
      return b[op]
    }
    case 'buffdesc': {
      const ref = v.id !== undefined ? buildBuff(v) : null
      if (v.raw !== undefined) return Buff.getBuffDescriptionPreview(v.raw, ref)
      return ref.description
    }
    default: if (SNAP_KINDS.has(v.kind)) return mineSnap(v); throw new Error('difftest 不认识 kind: ' + v.kind)
  }
}
// ParseDataType 的 value: C# 侧装箱类型与 JS 侧表示不同, 统一成 {vk, v} 再比, 免得拿字符串格式假报警
const classify = val => val === null ? { vk: 'null' }
  : typeof val === 'string' ? { vk: 'str', v: val }
  : typeof val === 'boolean' ? { vk: 'bool', v: val }
  : { vk: 'num', v: sent(Number(val)) }

// Condition / Operator 两个分支上游装的是委托 (Parser.cs:61,64), Fraction 装的是 KeyValuePair<int,int>:
// 都跟 JS 的表示不同型, 统一压成同一种形状再比。委托只比"是不是委托" —— 方法名是 C# 内部实现细节,
// 拿它当 golden 会把"我抄的表"变成"我抄的名字", 没有额外信息量。
function shapeDataType(d) {
  if (d.type === 'Fraction') return { type: d.type, vk: 'frac', v: `${d.value.num}/${d.value.den}` }
  if (d.type === 'Operator' || d.type === 'Condition') return { type: d.type, vk: 'func' }
  return { type: d.type, ...classify(d.value) }
}
const shapeOracleDt = x => x && x.vk === 'func' ? { type: x.type, vk: 'func' } : x

// ── 逐条比 ──
// 数值一律两边 Math.fround 后再比: oracle 的 Single 经 JSON 是最短可回写十进制,
// 解析成 double 后只有再 fround 才还原成那个 32 位值的精确 double 表示。
const fr = x => Math.fround(Number(x))
const eq = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return Object.is(fr(a), fr(b))
  if (a && typeof a === 'object' && b && typeof b === 'object')
    return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => eq(a[k], b[k]))
  return Object.is(a, b)
}

const diffs = []
const throwTypes = {}
const nativeOnly = []       // 上游炸在 native Random 上的向量: 本来就不可比, 单列, 不算分歧也不算通过
const infra = []            // errType=MissingMethod ⇒ 是我这套反射架子没对上签名, **不是**上游行为, 绝不当"一致"放过
let comparable = 0
// 上游 float 除零返回 ±Inf 而不是抛异常; JSON 写不了 Inf, oracle 侧用哨兵字符串, 这里映射同一组
const sent = x => typeof x === 'number' && !Number.isFinite(x) ? (Number.isNaN(x) ? 'NaN' : x > 0 ? 'Inf' : '-Inf') : x
// Status 向量里的元素也会是非有限数, 所以哨兵要**逐元素**铺; 数组长度本身也是被观测的形状
// (上游 Status 的长度是"默认 6"而非不变式, 短输入就得到短数组)。
const sentDeep = x => Array.isArray(x) ? x.map(sentDeep) : sent(x)
// 向量里的哨兵字符串读成真数 —— oracle 侧 f32 也做同一件事, 两边必须对称, 否则
// 'Inf' 会被 JS 当成字符串参与乘法 (=> NaN) 而报出一条假分歧。
const fnum = x => x === 'NaN' ? NaN : x === 'Inf' ? Infinity : x === '-Inf' ? -Infinity : Number(x)
vectors.forEach((v, i) => {
  const g = golden[i]
  if ((v.kind === 'numid' || v.kind === 'ident') && g.errType) { nativeOnly.push({ id: v.id, err: g.err }); return }
  // oracle 的 Fail 只在 MissingMember/MissingMethod (后者派生自前者) 时打 infra ⇒ 那是**我**的反射架子
  // 没对上签名, 不是上游行为; 早先只认 errType 字符串, 一旦异常换成派生的 InnerException 就漏判。
  if (g.infra === true) { infra.push({ i, v, err: g.err }); return }
  // 上游 GetParallelPetBag 的 while 在 cursor 落在 [0, parallelCount) 之外时**不自终止**,
  // 数到 int 上限后抛 OutOfMemoryException。移植体是同一个 for(;;) —— 放进 mine() 会挂死整个对拍,
  // 所以这条分歧必须在调用镜像**之前**归入不可比。
  if (g.errType === 'OutOfMemoryException') { nativeOnly.push({ id: v.id ?? v.kind, op: v.op, err: g.err }); return }
  let m, threw = false
  try { m = mine(v) } catch (e) { threw = true; m = String(e.message) }
  const gErr = typeof g.errType === 'string'
  if (gErr) throwTypes[`${v.kind} → ${g.errType}`] = (throwTypes[`${v.kind} → ${g.errType}`] || 0) + 1
  if (gErr !== threw) { diffs.push({ i, v, oracle: g.err, ts: m, why: threw ? 'TS 抛 / oracle 不抛' : 'oracle 抛 / TS 不抛' }); return }
  if (gErr) return                                       // 都抛 ⇒ 一致 (异常**类型**差异单独看 diffs 里的 message)
  comparable++
  const gv = v.kind === 'datatype' ? shapeOracleDt(g.v) : g.v
  if (!eq(sentDeep(m), gv)) diffs.push({ i, v, oracle: gv, ts: sentDeep(m), why: '值不等' })
})

console.log(`difftest seed=${SEED} 向量=${vectors.length} 可比=${comparable} native不可比=${nativeOnly.length} 架子没对上=${infra.length} 不一致=${diffs.length}`)
console.log(`oracle 抛错分布: ${JSON.stringify(throwTypes)}`)
if (infra.length) {
  console.log(`❌ 反射架子没对上的签名 ${infra.length} 条 (这些**不算**通过, 必须修 oracle 再跑):`)
  for (const x of infra.slice(0, 8)) console.log('  ⚠', JSON.stringify(x))
}
if (nativeOnly.length) console.log(`native-only: ${JSON.stringify(nativeOnly.slice(0, 6))}`)
// 一条快照向量动辄几 KB, 整条打出来会把分歧本身淹掉: 先按族汇总, 每族再只列前若干条的**两边值**
// (要整条向量按 #i 回查 tools/difftest.mjs 的 push 点)。
const brief = x => { const s = JSON.stringify(x); return s === undefined ? String(x) : s.length > 150 ? s.slice(0, 150) + '…' : s }
// 快照签名一条几 KB, 从头截 150 字符**永远看不到分歧列** —— 先定位第一个不同的字符, 再在那儿开窗。
const win = (s, a) => JSON.stringify(s.slice(Math.max(0, a - 40), a + 90))
const firstDiff = (a, b) => {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}
const byFam = {}
for (const d of diffs) {
  const k = `${d.v.kind} ${(d.v.op ?? d.v.id ?? '').split(':')[0]} → ${d.why}`
  byFam[k] = (byFam[k] || 0) + 1
}
console.log(`分歧族: ${JSON.stringify(byFam, null, 1)}`)
const shown = {}
for (const d of diffs) {
  const k = `${d.v.kind} ${d.why}`
  shown[k] = (shown[k] || 0) + 1
  if (shown[k] > 3) continue
  const both = typeof d.oracle === 'string' && typeof d.ts === 'string'
  const at = both ? firstDiff(d.oracle, d.ts) : 0
  console.log(`  ✘ #${d.i} ${d.v.kind} ${brief(d.v.op ?? d.v.id ?? '')}${both ? ` @${at}` : ''}\n`
    + `      oracle=${both ? win(d.oracle, at) : brief(d.oracle)}\n`
    + `      ts    =${both ? win(d.ts, at) : brief(d.ts)}`)
}
if (diffs.length) console.log(`  …共 ${diffs.length} 条分歧`)
process.exit(diffs.length || infra.length ? 1 : 0)
