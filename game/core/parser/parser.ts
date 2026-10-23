// Parser.cs 的逐行移植 (System/Parser/Parser.cs:10-150 的求值部分)。
// 这条链路是本次移植 bug 密度最高的地方, 四个反直觉点全部按 C# 原样保留:
//   1) **左到右折叠, 无优先级**: "1+2*3" = (1+2)*3 = 9, 不是 7。Split 出所有操作数后,
//      从 i=1 起用 expr.IndexOf(操作数) 反推中间的算子串, 依次 Operate。
//   2) 前导 '-' 先摘成符号位再解析: "-1+2" = -(1+2) = -3, 而 "(int) 减加" 都发生在摘符号之后的串上。
//   3) Split 用 RemoveEmptyEntries → 相邻/首尾算子产生的空串直接消失, 于是反推出的"算子串"
//      可能是 "+-" 这种复合串, Operate 不认识就返回 0 (不是抛错, 也不是按第二个算子算)。
//   4) 未知标识符最终落到 GetNumIdentifier → 解析失败返回 **0**, 整条表达式跟着塌成 0。
//      所以内容表里一个拼错的字段名不会报错, 只会静默变成 0 —— 对拍必须靠值逐位比, 不能靠"没抛错"。

import { f } from '../mathf.ts'
import {
  splitCondition,
  condition,
  OP_KEYS,
  operate,
  COND_KEYS,
  type DataType,
  type Fraction,
} from './operator.ts'
import { getIdentifier, getNumIdentifier, type IdentifierHost } from './identifier.ts'
import { trimParenthesesLoop, tryParseFloat, tryParseInt, parseIntOrThrow } from '../strutil.ts'

export type IdResolver = (id: string) => number

export function isOperator(op: string): boolean { return OP_KEYS.includes(op as typeof OP_KEYS[number]) }
export function isConditionOp(op: string): boolean { return COND_KEYS.includes(op as typeof COND_KEYS[number]) }

// Parser.cs:78-83 —— 两侧都是 **int.Parse**, 不是 TryParse: "5/2.5" 上游抛 FormatException,
// 兜成 0 会把一条写错的分数量悄悄当成 "5/0" 继续用。
export function parseFraction(frac: string): Fraction {
  const num = frac.split('/')
  return { num: parseIntOrThrow(num[0] ?? ''), den: parseIntOrThrow(num[1] ?? '') }
}

// Parser.cs:44-52 IsFraction: 恰好两段且两段都能 int.TryParse
export function isFraction(s: string): boolean {
  const num = s.split('/')
  if (num.length !== 2) return false
  return tryParseInt(num[0]) !== null && tryParseInt(num[1]) !== null
}

// Parser.cs:54-75 ParseDataType —— 判定顺序就是语义 (Condition 优先于 Operator 优先于 Fraction…)
export function parseDataType(data: string): { type: DataType; value: unknown } {
  if (data === '') return { type: 'Null', value: data }
  if (isConditionOp(data)) return { type: 'Condition', value: data }
  if (isOperator(data)) return { type: 'Operator', value: data }
  if (isFraction(data)) return { type: 'Fraction', value: parseFraction(data) }
  const i = tryParseInt(data)
  if (i !== null) return { type: 'Int', value: i }
  const fl = tryParseFloat(data)
  if (fl !== null) return { type: 'Float', value: f(fl) }
  return { type: 'Text', value: data }
}

// Parser.cs:12-24 ParseOptions: 'none' 直接返回; '&' 分段; 每段 '=' 必须**恰好**切成 2 段, 否则抛。
// 第 19 行是 dict.Add 而非 dict[key]=value ⇒ **重复键同样抛 ArgumentException**,
// 用 set 会静默覆盖成后者, 表里写错两次同名 option 就该被发现而不是被吞掉。
export function parseOptions(target: Map<string, string>, data: string): void {
  const s = data.trim()
  if (s === 'none') return
  const opts = s.split('&').filter(x => x !== '')
  for (const o of opts) {
    const kv = o.split('=').filter(x => x !== '')
    if (kv.length !== 2) throw new Error(`Option Parsing Failure: "${o}"`)
    if (target.has(kv[0])) throw new Error(`Duplicate option key: "${kv[0]}" in "${data}"`)
    target.set(kv[0], kv[1])
  }
}

// Parser.cs:26-37 ParseMultipleOptions: 先按 '|' 切, 'none' 时压入一个空 dict
export function parseMultipleOptions(data: string): Map<string, string>[] {
  const s = data.trim()
  if (s === 'none') return [new Map()]
  return s.split('|').filter(x => x !== '').map(seg => { const m = new Map<string, string>(); parseOptions(m, seg); return m })
}

// 与 C# string.Split(string[], RemoveEmptyEntries) 等价的多算子切分
function splitOnOps(expr: string): string[] {
  const out: string[] = []
  let cur = ''
  let i = 0
  while (i < expr.length) {
    let hit = ''
    for (const op of OP_KEYS) {
      if (expr.startsWith(op, i)) { hit = op; break }
    }
    if (hit) { if (cur !== '') { out.push(cur); cur = '' } i += hit.length; continue }
    cur += expr[i]
    i++
  }
  if (cur !== '') out.push(cur)
  return out
}

/**
 * Parser.cs:106-125 ParseOperation —— 无战斗上下文的表达式求值。
 * resolve 由调用方注入 (数据表阶段用 getNumIdentifier, 战斗阶段用 Identifier.GetIdentifier(id, effect, …))。
 */
export function parseOperation(expr: string, resolve: IdResolver): number {
  const negativeFirst = expr.startsWith('-')
  const sign = negativeFirst ? -1 : 1
  const body = negativeFirst ? expr.slice(1) : expr

  const id = splitOnOps(body)
  if (id.length === 0) throw new Error(`ParseOperation: empty operand list in "${expr}"`)

  let value = resolve(id[0])
  if (id.length === 1) return f(sign * value)

  let opStartIdx = id[0].length
  for (let i = 1; i < id.length; i++) {
    const opEndIdx = body.indexOf(id[i], opStartIdx)
    if (opEndIdx < opStartIdx) throw new Error(`ParseOperation: cannot locate operand "${id[i]}" from ${opStartIdx} in "${body}"`)
    const op = body.slice(opStartIdx, opEndIdx)
    value = operate(op, value, resolve(id[i]))
    opStartIdx = opEndIdx + id[i].length
  }
  return f(sign * value)
}

// 数据表/条件过滤用的缺省解析器: 只认字面量与 random 系列, 战斗标识符一律 0 (由 S3 注入真 resolve)
export function literalResolver(host: IdentifierHost): IdResolver {
  return (id: string) => getIdentifier(id, host)
}

/**
 * Parser.cs:128-151 ParseConditionFilter: "(a:b)(c>d)" 这种串编成逐条与检查。
 * 一条 filter 的左右两侧都过 idConverter; 分隔符先 ':' 再退回 SplitCondition, 且全角 '：' 归一为半角。
 */
export function parseConditionFilter<T>(
  filterExpr: string | null,
  idConverter: (ids: string[], value: T) => number[],
  leftPar = '(', rightPar = ')',
): (value: T) => boolean {
  const loop = filterExpr === null ? null : trimParenthesesLoop(filterExpr, leftPar, rightPar)
  return (value: T): boolean => {
    if (loop === null) return true
    for (const filter of loop) {
      let op = '='
      // C# 是 filter.Split(':', 2) 之后才对每段做 '：'→':' 替换; 顺序反了会把 "a：b" 误当成有分隔
      let options = filter.split(':', 2).map(x => x.replaceAll('：', ':'))
      if (options.length < 2) {
        const sp = splitCondition(filter.replaceAll('：', ':'))
        options = [sp.key, sp.value]
        op = sp.op
      }
      const ids = idConverter(options, value)
      if (!condition(op, ids[0], ids[1])) return false
    }
    return true
  }
}

export { getIdentifier, getNumIdentifier }
