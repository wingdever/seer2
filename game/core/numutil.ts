// HelperMath.cs:23-56 的两个区间判据 —— 名字像但**上界一个开一个闭**, 上游两处都用错就会静默改行为:
//   · IsInRange: 上界**开** (num >= min && num < max) —— List.Get/Set 的下标检查、性格 id 判界都靠它;
//   · IsWithin:  上界**闭** (num >= min && num <= max) —— Buff.IsPower 的 id∈[1,10] 用它是刻意的。
// 两者在 min > max 时**先交换**, 所以调用方传反了区间不会抛, 只会静默变宽 (别指望它当参数校验)。

export const isInRange = (num: number, min: number, max: number): boolean => {
  const lo = min <= max ? min : max
  const hi = min <= max ? max : min
  return num >= lo && num < hi
}

export const isWithin = (num: number, min: number, max: number): boolean => {
  const lo = min <= max ? min : max
  const hi = min <= max ? max : min
  return num >= lo && num <= hi
}
