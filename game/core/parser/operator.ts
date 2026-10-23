// Operator.cs 的逐行移植 (Assets/Scripts/System/Parser/Operator.cs, 163 行)。
// 三处最容易跑偏的语义, 都按 C# 原样保留而不是"修正":
//   1) 一切算术在 float(32 位) 上做 → 每步过 f(), 否则 0.1+0.2 这类分歧会在几千回合对拍里炸出来。
//   2) Condition 的 op 查找是「按 condDict 插入顺序找第一个出现的」, **不是**「找最靠前的」——
//      所以 "x=1LTE2" 会用 '=' 且 value 是 "1LTE2" (Operator.cs:26-36)。
//   3) Operate 遇到不认识的算子返回 0, 不抛错 (Operator.cs:88)。配合 Parser 的 split 再寻位,
//      形如 "1+[MIN]2" 的串会静默变 0。这是既有内容里真实存在的行为, 照搬。

import { abs as fabs, ceilToInt, f, floorToInt, max as fmax, min as fmin, pow as fpow, roundToInt, toInt } from '../mathf.ts'

export type DataType = 'Null' | 'Text' | 'Condition' | 'Operator' | 'Int' | 'Float' | 'Fraction'

export interface Fraction { num: number; den: number }

// condDict: 插入顺序 = '<' '>' '=' 'LTE' 'GTE' 'NOT' (影响 SplitCondition 的命中优先级)
export const COND_KEYS = ['<', '>', '=', 'LTE', 'GTE', 'NOT'] as const

const CONDS: Record<string, (l: number, r: number) => boolean> = {
  '<': (l, r) => f(l) < f(r),
  '>': (l, r) => f(l) > f(r),
  '=': (l, r) => f(l) === f(r),
  'LTE': (l, r) => f(l) < f(r) || f(l) === f(r),
  'GTE': (l, r) => f(l) > f(r) || f(l) === f(r),
  'NOT': (l, r) => f(l) !== f(r),
}

// opDict: 插入顺序即 split 的候选集, 顺序不影响结果 (没有任何算子是另一个的前缀)
export const OP_KEYS = ['+', '-', '*', '/', '^', '%', '[MIN]', '[MAX]', 'SET', '[ABS]', '[NEG]', '[FLR]', '[CEL]', '[RND]'] as const

const OPS: Record<string, (l: number, r: number) => number> = {
  '+': (l, r) => f(l + r),
  '-': (l, r) => f(l - r),
  '*': (l, r) => f(l * r),
  '/': (l, r) => f(l / r),
  '^': (l, r) => fpow(l, r),
  // (int)lhs % (int)rhs (Operator.cs:112-114) —— 整型取模后隐式转回 float。
  // ⚠ 实测: 除数**截断后**为 0 就抛 DivideByZeroException, 不是浮点除零的 Inf:
  //   Operate("%",5,0.5) / Operate("%",7.5,0) / Operate("%",0.9,0.9) 三条上游全抛。
  //   这里必须真抛, 吞掉它会把一条畸形配置当成"算出 0"静默通过。
  '%': (l, r) => {
    const rhs = toInt(r)
    if (rhs === 0) throw new Error('DivideByZeroException: Attempted to divide by zero.')
    return f(toInt(l) % rhs)
  },
  '[MIN]': (l, r) => fmin(l, r),
  '[MAX]': (l, r) => fmax(l, r),
  'SET': (l, r) => f(r),
  '[ABS]': (l, r) => fabs(f(l - r)),
  '[NEG]': (l, r) => f(r - l),
  // Floor/Ceil/Round 的乘法在 C# 侧是 int * float ⇒ R4 运算: 整数先转 float32 再乘。
  // 少了中间那层 f(), 在 2^31 附近会出现 double 中间精度分歧 (实测 [FLR] 1.98e34,3 上游=6442450944)。
  '[FLR]': (l, r) => f(f(floorToInt(f(l / r))) * r),
  '[CEL]': (l, r) => f(f(ceilToInt(f(l / r))) * r),
  '[RND]': (l, r) => f(f(roundToInt(f(l / r))) * r),
}

// 签名是 (string, float, float) ⇒ 入参在进函数那一刻就已经是 float32。调用方若传来 double (对拍的向量、
// 外部注入的数字) 就必须在这里收窄一次, 否则 "7.9 × 2.9" 会拿 double 操作数算出 22.90999984741211,
// 而上游是 22.910002 —— 实测分歧见 tools/difftest.mjs。
export function operate(op: string, lhs: number, rhs: number): number {
  const fn = OPS[op]
  return fn ? fn(f(lhs), f(rhs)) : 0
}

export function condition(op: string, lhs: number, rhs: number): boolean {
  const fn = CONDS[op]
  return fn ? fn(f(lhs), f(rhs)) : false
}

// Operator.cs:44-62 —— DataType 版本: Fraction 走 max*num/den, 且是**从左到右** (max*num) 再 /den
export function conditionOf(op: string, current: number, max: number, data: { type: DataType; value: unknown }): boolean {
  switch (data.type) {
    case 'Int': return condition(op, current, data.value as number)
    case 'Float': return condition(op, current, data.value as number)
    case 'Fraction': {
      const fr = data.value as Fraction
      return condition(op, current, f(f(max * fr.num) / fr.den))
    }
    default: return false
  }
}

export const toHalfCondition = (s: string): string => s.replaceAll('＜', '<').replaceAll('＞', '>').replaceAll('＝', '=')

// Operator.cs:22-38: 按 COND_KEYS 顺序取**第一个出现**的算子; 一个都没有时 C# 会在 Substring(0,-1) 抛异常,
// 这里同样抛 (调用方靠它兜住畸形配置), 但带上原始串便于定位。
export function splitCondition(str: string, defaultOp = '=', toHalf = true): { key: string; value: string; op: string } {
  const s = toHalf ? toHalfCondition(str) : str
  let opIndex = -1
  let op = defaultOp
  for (const key of COND_KEYS) {
    opIndex = s.indexOf(key)
    if (opIndex !== -1) { op = key; break }
  }
  if (opIndex === -1) throw new Error(`Operator.SplitCondition: no condition op in "${str}"`)
  return { key: s.slice(0, opIndex), value: s.slice(opIndex + op.length), op }
}

// Operator.cs:139-147 的泛型 Max/Min (System.Collections.Generic 里到处在用)
export const genericMax = <T extends { compareTo(o: T): number }>(a: T, b: T): T => (a.compareTo(b) > 0 ? a : b)
export const genericMin = <T extends { compareTo(o: T): number }>(a: T, b: T): T => (a.compareTo(b) < 0 ? a : b)
