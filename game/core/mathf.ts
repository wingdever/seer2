// UnityEngine.Mathf 的等价件 —— 移植纪律: C# 侧一切标量都是 float(32 位), 所以每个算术结果都要过 fround;
// 整型转换一律走 trunc/roundi, 禁止裸用 Math.round (JS 的 Math.round 与 .NET 的 Math.Round 舍入方向都不同)。
// 依据: Assets/Scripts/System/Parser/Operator.cs 用了 Mathf.Min/Max/Pow/FloorToInt/CeilToInt/RoundToInt/Abs。

// 单精度化: 对应 C# 的 float 存储
export const f = (x: number): number => Math.fround(x)

// ── 入口窄化纪律 ──
// 下面这些函数在 C# 侧的**形参类型就是 float**。JS 里传进来的却可能是 carrying 额外精度的
// double (对拍向量里的字面量 0.2 就是 double 0.2, 而 C# 收到的是 0.2f = 0.20000000298…)。
// 不窄化的话, pow(1e7, 0.2) 用 double 指数算出 25.118864、用 float 指数算出 25.118866,
// 差一整颗 ULP —— 这类分歧既不是"上游难懂"也不是"我算错", 纯粹是**参数边界没守住**。
// 所以每个 float 形参在函数入口先 f() 一次; 对已经是 float 的值 f() 是恒等的, 没有代价。

// float→int 的边界语义 —— 实测自上游二进制 (tools/oracle-cs 直调 UnityEngine.Mathf):
//   · NaN → 0 (不是抛异常, 也不是 NaN)
//   · 超出 int 范围 → **饱和**到 ±int 极值 (floori/ceili/roundi(1.98e34) 都是 2147483647,
//     floori(-1.98e34) = -2147483648)。原计划以为这里是"未定义、只能记为有意分歧", 实测能精确复现。
const INT_MAX = 2147483647
const INT_MIN = -2147483648
// 末尾的 x===0?0:x 不是防御性噪音, 是**语义**: 这些函数的返回类型是 int, 而 int 没有 -0。
// JS 的 Math.ceil(-0.05)/Math.round(-0.4)/(int 化前) 都给出 -0, 于是 "[CEL] 负数小数" 这类表达式
// 会带着 -0 乘下去变成 -0.0, 上游却是 +0 —— 实测 seed=3/11/99 的 [RND]/[CEL] 分歧全在这里。
const sat = (x: number): number => Number.isNaN(x) ? 0 : x > INT_MAX ? INT_MAX : x < INT_MIN ? INT_MIN : x === 0 ? 0 : x

// Mathf.FloorToInt(float) → int: 向下取整 (−2.5 → −3)
export const floorToInt = (x: number): number => sat(Math.floor(f(x)))

// Mathf.CeilToInt(float) → int: 向上取整 (2.1 → 3)
export const ceilToInt = (x: number): number => sat(Math.ceil(f(x)))

// Mathf.RoundToInt(float) → int。
// Unity 的 Mathf.Round(x) = (float)System.Math.Round((double)x), 而 .NET Math.Round(double)
// 默认 MidpointRounding.ToEven (银行家舍入), 所以 0.5→0 / 1.5→2 / 2.5→2。
// ✅ 已实测坐实 (tools/oracle-cs: 0.5→0 1.5→2 2.5→2 3.5→4 4.5→4 5.5→6 -0.5→0 -1.5→-2 -2.5→-2)。
// ⚠ JS 的 Math.round(0.5)=1、常见的"半远离零"实现也都不对, 所以这里必须自己写半值取偶。
export const roundToInt = (x0: number): number => {
  const x = f(x0)
  if (Number.isNaN(x)) return sat(x)
  const r = Math.round(x)
  if (Math.abs(x % 1) !== 0.5) return sat(r)
  // 正中: 取偶数一侧
  const lo = Math.floor(x)
  return sat(lo % 2 === 0 ? lo : lo + 1)
}

// Mathf.Clamp —— 写成 Unity 的**严格比较三段式**而不是 Math.max(lo, Math.min(hi, x)):
// 两者在 lo<=hi 时等价, 但 min>max (倒挂区间, 表里写错就会出现) 时分歧 —— 实测
// Mathf.Clamp(20, 10, 1) = 1 (先判 20<10 不成立, 再判 20>1 成立 ⇒ 取 hi), 而 max/min 版给 10。
export const clamp = (x: number, lo: number, hi: number): number => {
  const v = f(x), a = f(lo), b = f(hi)
  return v < a ? a : v > b ? b : v
}
export const clamp01 = (x: number): number => clamp(x, 0, 1)
// Mathf.Clamp 的 **int 重载** —— Buff.value 用的是这个, 不是上面那版:
// 整数区间端点是 ±2147483647, 而 f(2147483647) = 2147483648 (32 位放不下), 用 float 版会把上界抬高一个。
export const clampInt = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
export const abs = (x: number): number => f(Math.abs(f(x)))
// Mathf.Min / Mathf.Max —— **不能**用 Math.min/Math.max: 它们是严格比较, 任一 NaN 都返回 NaN;
// Unity 的实现是 "if (a < b) return a; return b;" / "if (a > b) return a; return b;", 比较不成立时**返回 b**。
// 实测 (ParseOperation "(859/1)[MIN]61.5", 左操作数 0/0 = NaN): 上游返回 61.5, Math.min 会返回 NaN。
export const min = (a: number, b: number): number => { const x = f(a), y = f(b); return x < y ? x : y }
export const max = (a: number, b: number): number => { const x = f(a), y = f(b); return x > y ? x : y }

// Mathf.Pow(float, float) —— 实测 (tools/oracle-cs, 9 个底 × 10 个指数的全矩阵 90 组) 与 JS 的
// Math.pow 只差 5 组: 1^Inf / 1^-Inf / 1^NaN / (-1)^Inf / (-1)^-Inf。
// C 库 (走 IEEE 的 .NET Math.Pow) 认为 |x|=1 且 y=±∞ 时极限不收敛但约定返回 1, 且 x=1 时**无条件** 1;
// JS 规范对这几组给 NaN。(-1)^NaN 两边都是 NaN —— 别把它一起"修"成 1, 实测上游就是 NaN。
// ⚠ 两个参数都要先窄化 (见文件头的入口纪律): pow(1e7, 0.2) 在 double 指数与 float 指数下差 1 ULP,
//   而 statusop 对拍里唯一一条 pow 分歧就是这个, 不是 Math.pow 与 .NET Pow 的库间差异。
export const pow = (a: number, b: number): number => {
  const x = f(a), y = f(b)
  if (x === 1) return 1
  if (x === -1 && Math.abs(y) === Infinity) return 1
  return f(Math.pow(x, y))
}

// Mathf.Sign(float): Unity 的实现是 `value >= 0 ? 1 : -1`, 所以 0 和 -0 都给 **+1**。
// 不能写成 Math.sign —— 它对 0 给 0、对 -0 给 -1, 而 Status.GetPowerUpBuff 把 sign 当**指数**用
// (Status.cs:379-383 `(1 + 0.5f * abs) ^ powerup.sign`), 差一个符号就是乘 1.5 与除 1.5 的区别。
export const sign = (x: number): number => (f(x) >= 0 ? 1 : -1)

// (int)cast: C# 在 unchecked 下是向零截断, 且实测 (tools/oracle-cs) 与 Mathf.*ToInt 同一套边界语义:
//   NaN→0, 上溢→2147483647, 下溢→-2147483648。依据: Operate("%",-1.98e34,7) 返回 -2
//   (只有 (int)lhs == -2147483648 才可能), ParseOperation("1/0%3") 返回 1
//   (只有 (int)Inf == 2147483647 才可能), ParseOperation("0/0%3") 返回 0。
export const toInt = (x: number): number => sat(Math.trunc(f(x)))
