// HelperCollections.cs:14-95 的 C# 语义镜像。这几个不是「JS 直觉」能代替的:
//   · Get(key) 不带默认值时返回 default(TValue) —— string 是 **null**, 不是 ''。
//     Effect.cs:277 的 `x?.Get("on_fail")` 后面接 `FirstOrDefault(x => x != null)` 就靠这个 null;
//   · Set 是「有则覆盖、无则插入」(HelperCollections.cs:35), 与 Add 的「重复键即抛」是两回事 ——
//     上游 Skills 用 Add、Buffs/Items 用 Set, 这个差别已经在 oracle 的 tablediag 里验过。

import type { Rng } from './rng.ts'

export function dictGet<V>(map: Map<string, V>, key: string, defaultValue: V | null = null): V | null {
  return map.has(key) ? map.get(key)! : defaultValue
}

export const dictSet = <V>(map: Map<string, V>, key: string, value: V): void => { map.set(key, value) }

// HelperCollections.cs:14-22 TryGet —— 命中返回 true 并写 out, 未命中写 defaultReturn 并返回 false。
// JS 没有 out 参数, 这里用 {ok, value} 表达同一个二态。
export function dictTryGet<V>(map: Map<string, V>, key: string, defaultReturn: V | null = null): { ok: boolean; value: V | null } {
  const ok = map.has(key)
  return { ok, value: ok ? map.get(key)! : defaultReturn }
}

// HelperCollections.cs:46-58 Merge: rhs 逐项 Set 进 lhs 并**返回 lhs** (原地改, 不是新字典)
export function dictMerge<V>(lhs: Map<string, V>, rhs: Map<string, V> | null): Map<string, V> {
  if (rhs) for (const [k, v] of rhs) lhs.set(k, v)
  return lhs
}

// HelperCollections.cs:74-82 List.Get(index, default) —— 用的是 IsInRange (**上界开区间**),
// 与 BattleStatus 那套 IsWithin (闭区间) 不是同一个判断, 别混。
export function listGet<T>(list: T[], index: number, defaultValue: T | null = null): T | null {
  return index >= 0 && index < list.length ? list[index] : defaultValue
}

// HelperCollections.cs:84-95 List.Set —— 越界则 **追加** (并返回追加后的下标), 不是抛也不是补 null。
export function listSet<T>(list: T[], index: number, value: T): number {
  if (index >= 0 && index < list.length) { list[index] = value; return index }
  list.push(value)
  return list.length - 1
}

// ListHelper.IsNullOrEmpty —— null 与空表同为「空」
export const isEmpty = (list: unknown[] | null): boolean => list === null || list.length === 0

// C# 的下标越界是**异常**, JS 是 undefined。凡是"越界即整条链路炸"的调用点都得显式建模,
// 否则 undefined 会顺着往下走, 把一次抛变成一次静默降级 (对拍里表现为「只有 TS 不炸」)。
export function atIndex<T>(list: T[], index: number, where: string): T {
  if (index < 0 || index >= list.length) throw new RangeError(`IndexOutOfRangeException: ${where} index=${index}`)
  return list[index]
}

// HelperCollections.cs:108-138 的两个 Random 扩展 (ListHelper.Random)。三处不能按 JS 直觉改:
//   · 单取用的是 `UnityEngine.Random.Range(0, Count)` —— 整数版是**闭区间**, 于是 index 可以等于 Count,
//     接着 `values.Get(index)` 落到 default(T) = **null**。空表也走这条路 (0 就出界) ⇒ "取一个"对空表
//     返回 null, 而不是抛。这条与 parser/identifier-effect.ts 的 random[...] 是同一个上游函数。
//   · `!repeat && count > values.Count` 是**静默返回整表** (`values.ToList()` 的浅拷), 不是截断也不是抛;
//   · `count = -1` (即 target_num 没配) 时 `while (result.Count != count)` **永真** ⇒ 上游死循环。
//     移植体保留同一个循环、不补兜底: 补了就把"上游搭不出这个状态"伪装成"上游给了个结果"。
//     对拍向量在生成阶段挡掉这一形状 (同 parallelApplyOOM 的先例), 由单测锁其余边界。
export function listPickRandom<T>(values: T[], rng: Rng, weights: number[] | null = null): T | null {
  if (weights === null) return listGet(values, rng.nextInt(0, values.length))
  const w = weights.slice(0, values.length)
  let p = rng.nextInt(0, w.reduce((a, b) => a + b, 0))
  for (let i = 0; i < w.length; i++) {
    if (p < w[i]) return values[i]
    p -= w[i]
  }
  return values.length > 0 ? values[values.length - 1] : null
}

export function listRandom<T>(values: T[], count: number, repeat: boolean, rng: Rng, weights: number[] | null = null): T[] {
  const result: T[] = []
  if (!repeat && count > values.length) return [...values]

  while (result.length !== count) {
    const rngItem = listPickRandom(values, rng, weights)
    // C# 的 Contains 走 EqualityComparer<T>.Default, 对引用类型就是引用相等 ⇒ 与 includes 同形。
    if (!repeat && result.includes(rngItem as T)) continue
    result.push(rngItem as T)
  }
  return result
}

// System.Linq ToDictionary 的重复键语义: **抛 ArgumentException**, 不是覆盖。
// 上游 Effect.Format (Effect.cs:214-215) 的键替换就是走 ToDictionary, 两个键被同一个实参替成
// 同名时整条 DSL 解析当场炸 —— difftest 实测 13 条这类分歧 (JS 的 `new Map` 会静默合并, 是假通过)。
export function toDictionaryStrict<V>(entries: [string, V][]): Map<string, V> {
  const map = new Map<string, V>()
  for (const [k, v] of entries) {
    if (map.has(k)) throw new Error(`ArgumentException: An item with the same key has already been added. Key: ${k}`)
    map.set(k, v)
  }
  return map
}
