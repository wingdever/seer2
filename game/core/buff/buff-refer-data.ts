// BuffReferData.cs 的移植 —— 表里那种「印记引用」的紧凑写法: `3044[值][回合][键:值][键:值]`
// (技能/道具/天赋表都借用它, 所以它是 buff 管线之外的公共件, 不只服务于 Buff 构造)。
//
// 四条必须照搬的解析细节, 每条都是静默分歧点:
//   · 段落在**方括号**里 (`TrimParenthesesLoop` 的默认左右括号就是 `[`/`]`, Helper.cs:91) —— 表里写的
//     正是 `1008[10]`。这条搞错会让每一条带值的引用静默退化成「没写值」, 而 `int.Parse("3044(2)")`
//     这类圆括号写法反而**不是**引用 (对拍实测: 上游对 `3044(2)` 抛 FormatException);
//   · 值与回合取自「不含 ':'」的那些段, 第 1 段是 value、第 2 段是 turn (FirstOrDefault /
//     ElementAtOrDefault(1)) —— 所以段落的**书写序**不重要, 只看它们是不是纯数字:
//     `3044[k:v][w]` 里 w 当 value ⇒ int.Parse 抛; `3044[2][a:b:c]` 是 value=2、options a=b;
//   · `Split(':')[0] / [1]` 只取前两段 —— "a:b:c" 落成 a=b, 第三段被丢掉;
//   · 没有方括号段 ⇒ 整串当 id 走 `int.Parse` (畸形串在这里炸, 不是兜成 0)。

import { dictSet, toDictionaryStrict } from '../collections.ts'
import { parseIntOrThrow, trimParenthesesLoop } from '../strutil.ts'
import type { Options } from './buff-info.ts'
import { Buff } from './buff.ts'

export class BuffReferData {
  id = 0
  turn = -1
  value: number | null = null
  options: Options = new Map()

  get ID(): number { return this.id }
  get Turn(): number { return this.turn }
  // `Value => value ?? 0` —— 但 Buff 构造里读的是**可空**的 `value` 字段 (data.Value 与 data.value 不等价:
  // 前者把「没写值」变成 0, 后者保留 null 让调用方能区分)。
  get Value(): number { return this.value ?? 0 }

  static parse(str: string | null, defaultValue: number | null = null, defaultTurn = -1): BuffReferData | null {
    if (str === null || str === '') return null

    const data = new BuffReferData()
    const list = trimParenthesesLoop(str)
    const hasValues = list !== null && list.length > 0

    if (hasValues) {
      const plain = list!.filter(x => !x.includes(':'))
      const valueExpr = plain.length ? plain[0] : undefined          // FirstOrDefault
      const turnExpr = plain.length > 1 ? plain[1] : undefined       // ElementAtOrDefault(1)
      // 有方括号段 ⇒ '[' 必然在串里, 这里不需要防 IndexOf 返回 -1。
      data.id = parseIntOrThrow(str.slice(0, str.indexOf('[')))
      data.value = (valueExpr === undefined || valueExpr === '') ? defaultValue : parseIntOrThrow(valueExpr)
      data.turn = (turnExpr === undefined || turnExpr === '') ? defaultTurn : parseIntOrThrow(turnExpr)
    } else {
      data.id = parseIntOrThrow(str)
      data.value = defaultValue
      data.turn = defaultTurn
    }

    if (list) for (const x of list.filter(v => v.includes(':'))) {
      const kv = x.split(':')
      dictSet(data.options, kv[0], kv[1])
    }
    return data
  }

  // 表里一条可以引用多个印记: `3044(2)/3045(1)`。ToDictionary ⇒ **同一个 id 出现两次即抛**。
  // 另一处隐藏前提: `Parse` 对空段返回 null, 而这里直接 `data.id` ⇒ 上游是 NRE, 这里也让它炸。
  static parseDict(str: string | null, defaultValue: number | null = null, defaultTurn = -1): Map<number, BuffReferData> | null {
    if (str === null || str === '') return null
    const entries: [number, BuffReferData][] = []
    for (const part of str.split('/')) {
      const data = BuffReferData.parse(part, defaultValue, defaultTurn)!
      entries.push([data.id, data])
    }
    return toDictionaryStrict(entries)
  }
}

// BuffReferData.CreateBuff —— id==0 视为「没有引用」直接 null (上游就是这么判的, 别改成查不到)。
export function createBuff(data: BuffReferData | null): Buff | null {
  if (data === null || data.id === 0) return null
  const buff = new Buff(data.id, data.turn, data.value)
  for (const [k, v] of data.options) buff.options.set(k, v)
  return buff
}
