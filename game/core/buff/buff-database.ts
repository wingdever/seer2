// BuffDatabase.cs 的移植: BuffType / CopyHandleType 两个枚举 + 各自的原始串词表。
//
// 枚举值取自 BuffDatabase.cs:60-77 的**字面量** (声明里显式赋了 -4…10), CopyHandleType 才是纯顺序 0-5。
// 词表顺序 = C# Dictionary 的插入顺序 (BuffDatabase.cs:8-33), 反查 `First(x => x.Value == t).Key`
// 取的是第一个匹配键 —— 这张表里 "powerup.neg"/"powerup.pos"/"powerup" 三个键分别指向
// Powerdown/Powerup/Power, 顺序一旦调过, GetRawInfoStringArray 的 round-trip 就和上游分歧。
// 正向查不到 ⇒ BuffType.None / CopyHandleType.New (Get 的默认值), 反查不到 ⇒ "none"。都不抛。

import { conv } from '../vocab.ts'

export const BuffType = {
  Powerdown: -4, Powerup: -3, Power: -2, All: -1, None: 0,
  Feature: 1, Emblem: 2, Mark: 3, Unhealthy: 4, Abnormal: 5,
  TurnBased: 6, ChanceBased: 7, Shield: 8, Weather: 9, Item: 10,
} as const
export type BuffType = (typeof BuffType)[keyof typeof BuffType]

export const CopyHandleType = { New: 0, Block: 1, Replace: 2, Stack: 3, Min: 4, Max: 5 } as const
export type CopyHandleType = (typeof CopyHandleType)[keyof typeof CopyHandleType]

const TYPE: [string, BuffType][] = [
  ['powerup.neg', BuffType.Powerdown], ['powerup.pos', BuffType.Powerup], ['powerup', BuffType.Power],
  ['all', BuffType.All], ['none', BuffType.None], ['feature', BuffType.Feature],
  ['emblem', BuffType.Emblem], ['mark', BuffType.Mark], ['unhealthy', BuffType.Unhealthy],
  ['abnormal', BuffType.Abnormal], ['turn', BuffType.TurnBased], ['chance', BuffType.ChanceBased],
  ['shield', BuffType.Shield], ['weather', BuffType.Weather], ['item', BuffType.Item],
]

const COPY: [string, CopyHandleType][] = [
  ['new', CopyHandleType.New], ['block', CopyHandleType.Block], ['replace', CopyHandleType.Replace],
  ['stack', CopyHandleType.Stack], ['max', CopyHandleType.Max], ['min', CopyHandleType.Min],
]

const TYPE_C = conv(TYPE, BuffType.None)
const COPY_C = conv(COPY, CopyHandleType.New)

export const toBuffType = TYPE_C.from
export const buffTypeToRaw = TYPE_C.to
export const toCopyHandleType = COPY_C.from
export const copyHandleToRaw = COPY_C.to
