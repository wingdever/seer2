// 可注入种子的随机源。两个必须照搬的语义 (依据 Identifier.cs:18 `Random.Range(0, 100)` 与
// EffectAbilityHandler 里的 .Random() 调用形态):
//   1) Unity 的 Random.Range(int,int) 是**闭区间** (min 与 max 都可能取到), 而 Random.Range(float,float) 是左闭右开;
//      这跟 JS 习惯相反, 所以这里显式分成两个方法, 不给一个方法两种语义。
//   2) 我们复刻的是规则, 不是它存档里的随机序列 —— 所以流本身自定, 但 S1b 的 C# oracle 里 UnityEngine.Random
//      的 shim 必须跑**同一个算法**, 否则对拍就是在比两副不同的骰子。
// mulberry32: 32 位状态、纯整数运算, C# 侧能逐位复现。

export interface Rng {
  /** [0,1) 双精度 —— 只用于浮点判定 (命中/暴击), 对应 Unity 的 Random.Range(0f,1f) */
  next01(): number
  /** 闭区间 [min,max] —— 对应 Unity 的 Random.Range(int,int) */
  nextInt(min: number, max: number): number
  /** 左闭右开 [min,max) —— 对应 Unity 的 Random.Range(float,float) */
  nextFloat(min: number, max: number): number
  /** ListHelper.Random(): 从数组里等概率取一个, 空数组返回 undefined */
  pick<T>(arr: T[]): T | undefined
  /** 复刻 Unity 的一个坑: 只有一个公开 next01 时, 闭区间整数要靠 floor(next01*(max-min+1)) */
  seed(): number
}

export function createRng(seed = 1): Rng {
  // 与 C# shim 同步: a = seed | 0, 每步 a += 0x6D2B79F5, t = imul(a ^ (a>>>15), 1|a), 
  // t ^= t + imul(t ^ (t>>>7), 61|t), return ((t ^ (t>>>14)) >>> 0) / 4294967296
  let a = (seed | 0) >>> 0
  const next01 = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next01,
    nextInt: (min, max) => {
      // 闭区间: 先归一化参数顺序 (Unity 的 Range(int,int) 不要求 min<max)
      let lo = Math.trunc(min), hi = Math.trunc(max)
      if (lo > hi) { const s = lo; lo = hi; hi = s }
      return lo + Math.floor(next01() * (hi - lo + 1))
    },
    nextFloat: (min, max) => {
      const lo = Math.fround(min), hi = Math.fround(max)
      const s = Math.min(lo, hi), e = Math.max(lo, hi)
      return Math.fround(s + next01() * (e - s))
    },
    pick: <T>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(next01() * arr.length)] : undefined),
    seed: () => a >>> 0,
  }
}
