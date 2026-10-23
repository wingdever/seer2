// 词表 (原始串 ↔ 数值) 的两头查表 —— 语义照 C#: 正向是 `dict.Get(raw, fallback)` (不抛),
// 反向是 `ContainsValue(v) ? First(x => x.Value == v).Key : "none"` (EffectDatabase.cs:92-122 与
// BuffDatabase.cs:52-77 两个文件里这段结构一字不差)。
//
// 表必须用 [ [raw, value], … ] 的**有序数组**表达: 上游是 Dictionary, 枚举顺序 = 插入顺序,
// 而反查取的是「第一个匹配的键」。今天每张表里每个值只有一个键所以看不出差别, 但只要重启以后
// 加一个别名键, 正/反查就会各自选中不同的字符串 —— 用 Map 或对象就把这个顺序语义丢掉了,
// 而它已经在 tools/difftest.mjs 的 raw 串往返里被上游观测到 (见 docs/engine/port-map.md)。
export const conv = <E extends number>(table: [string, E][], fallback: E) => ({
  from: (raw: string): E => { const hit = table.find(([k]) => k === raw); return hit ? hit[1] : fallback },
  to: (value: E): string => { const hit = table.find(([, v]) => v === value); return hit ? hit[0] : 'none' },
})
