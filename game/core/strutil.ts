// Helper.cs / Identifier.cs 里求值器必须依赖的字符串工具, 逐条对齐 C# 语义 (不是 JS 的直觉语义):
//   · float.TryParse 默认风格 = NumberStyles.Float | AllowThousands (CurrentCulture):
//       允许 前导/尾随空白、可选符号、"123." 与 ".5"、**科学计数法 "1e5"**、**千分位逗号 "1,000"**;
//       拒绝 hex、"1f"、空串、纯符号、以逗号开头 (",5")、逗号在小数点之后 ("1.000,5")。详见 CS_FLOAT_RE 处。
//   · (int)cast 向零截断。
//   · TrimParentheses 默认剥的是**方括号** [] 而不是圆括号 —— 调用点没传参数时千万别以为是 ()。
//   · ToIntRange 把 "1~3|7" 展开成 [1,2,3,7], 先把全角「－」换成半角 "-"。
//   · C# 的 str.TrimStart("pet") 是 **char 集合**重载 (会剥掉任意前导 p/e/t 字符), 而本仓库有
//       Helper.cs:34/46 的 string 扩展把它改成整串前缀 —— 语义以扩展版为准, 见 trimStartStr。

// float.TryParse(string, out float) 的默认风格 = NumberStyles.Float | AllowThousands + CurrentCulture
// (不是裸 NumberStyles.Float!) —— 实测 (tools/oracle-cs) 上游接受: 1e5 / 1E5 / 1.5e-3 / .5e2 /
// +1e5 / " 1e5 " / 1,000 / 1,00 / 10,0,0 / 1,0000 / 12,34,567 / "1," / "1,." / "1,." ;
// 拒绝: 1e / 1e+ / 1e5f / ",5" / "1.000,5" (小数点必须在千分位之后) / 0x10 / "" / "true"。
// 即: 千分位组长度**不做 3 位校验**, 也不许出现在开头; 值 = 剥掉逗号后按十进制解析再收窄到 float32。
// ⚠ 已知不覆盖的极端: 20+ 位长字面量 .NET 走的是遗留累加路径, 结果与最近 float32 差 1 ULP 级
//   (实测 "1,000,…,000" 得 9.999999884841548e26)。内容表里没有这种字面量, 对拍向量也不生成它。
const CS_FLOAT_RE = /^\s*[+-]?(?:\d+(?:,\d*)*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*$/
// .NET int.TryParse 默认风格 = Integer | AllowLeadingWhite | AllowTrailingWhite | AllowLeadingSign:
// 只有「可选符号 + 纯整数」, 小数点/千分位/hex/空串一律 false。
// 别和 (int) 强转混为一谈 —— 强截断是 truncToInt, 见 mathf.toInt。
const CS_INT_RE = /^\s*[+-]?\d+\s*$/

export function tryParseFloat(s: string): number | null {
  if (!CS_FLOAT_RE.test(s)) return null
  // float.TryParse 的 out 是 **Single**, 不是 double —— 字面量在解析这一刻就已经是 32 位了。
  // 不 fround 的话 "34.22222222222222" 会带着 double 精度一路进到算术里, 对拍必分歧 (实测见 difftest)。
  const n = Math.fround(Number(s.trim().replaceAll(',', '')))
  // ⚠ 超出 Single 范围**不是**解析失败: 对拍实测 `ParseDataType("1e40")` 上游给的是 Float/+∞
  //   (.NET Core 3.0 起浮点解析溢出返回 ±Infinity, 不再抛 OverflowException / 不再回 false)。
  //   所以这里只挡 NaN, 别"顺手"加 isFinite —— 那会把一条合法的浮点字面量降级成标识符分支。
  return Number.isNaN(n) ? null : n
}

export const parseFloatOr0 = (s: string): number => { const n = tryParseFloat(s); return n === null ? 0 : n }

// float.Parse(string) —— 语法与 TryParse 完全一致, 但**失败即抛** (FormatException)。
// 越界**不抛** (与 TryParse 同样得到 ±∞, 见上面的 .NET Core 3.0 说明)。
// Buff.cs:41-42 的 hide/removable 覆盖用的就是这版: 表里写 options["hide"]=abc 时上游是炸, 不是 false。
export function parseFloatOrThrow(s: string): number {
  const n = tryParseFloat(s)
  if (n === null) throw new Error(`FormatException: 输入字符串的格式不正确 "${s}"`)
  return n
}

// Int32 的范围是 **解析期** 就判的, 不是用 `|0` 之后判的 —— 这条由对拍坐实:
// BuffInfo.csv 里一行 id=99999999999 时上游是 OverflowException, 而不是环绕成某个 int32。
const INT32_MAX = 2147483647
const INT32_MIN = -2147483648

export function tryParseInt(s: string): number | null {
  if (!CS_INT_RE.test(s)) return null
  const n = Number(s.trim())
  if (!Number.isInteger(n)) return null
  return n > INT32_MAX || n < INT32_MIN ? null : n
}

// int.Parse (Helper.cs:228 的 ToIntRange 默认 parseFunc): 语法失败抛 FormatException, **越界抛 OverflowException**
// —— 两种异常在上游是不同 catch 路径 (前者被表装载的整表 try 吞掉时行为一样, 但调用方可能只 catch 其中一种)。
export function parseIntOrThrow(s: string): number {
  if (!CS_INT_RE.test(s)) throw new Error(`FormatException: 输入字符串的格式不正确 "${s}"`)
  const n = Number(s.trim())
  if (n > INT32_MAX || n < INT32_MIN) throw new Error(`OverflowException: 值太大或太小, 无法表示为 Int32 "${s}"`)
  return n
}

export const trimStartStr = (s: string, prefix: string): string => (s.startsWith(prefix) ? s.slice(prefix.length) : s)
export const trimEndStr = (s: string, suffix: string): string => (suffix !== '' && s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s)

export function tryTrimStart(s: string, prefix: string): { ok: boolean; trim: string } {
  const ok = s.startsWith(prefix)
  return { ok, trim: ok ? s.slice(prefix.length) : s }
}

// Helper.cs:59-83 TrimParentheses —— 比「剥首尾」宽松得多: 从**第一个** leftPar 到配平的 rightPar 取内容,
// 前面的噪声与后面的噪声都被丢掉; 若第一个 rightPar 出现在 leftPar 之前则原样返回。
export function trimParentheses(s: string, left = '[', right = ']'): string {
  if (s === '') return s
  const startIndex = s.indexOf(left)
  let endIndex = s.lastIndexOf(right)
  if (startIndex === -1 || endIndex === -1 || s.indexOf(right) < startIndex) return s
  for (let l = 1, r = 0, i = startIndex + 1; i <= endIndex; i++) {
    if (s[i] === left) l++
    else if (s[i] === right) r++
    if (l === r) { endIndex = i; break }
  }
  return s.slice(startIndex + 1, endIndex)
}

// Helper.cs:85-89 —— 「变了就算成功」, 不是「剥掉了首尾才算成功」
export function tryTrimParentheses(s: string, left = '[', right = ']'): { ok: boolean; trim: string } {
  const trim = trimParentheses(s, left, right)
  return { ok: trim !== s, trim }
}

// Helper.cs:91-110 TrimParenthesesLoop。两处原样保留的怪处:
//   · 第 100 行判的是硬编码 '(' 而不是 leftPar;
//   · 当剩余串不以「left+trim+right」开头时, C# 版本永远不会收敛 (真死循环)。
//     这里加 64 次上限并抛错 —— 这是**有意偏离**, 否则一条畸形配置会把整页挂住。
export function trimParenthesesLoop(s: string, left = '[', right = ']'): string[] | null {
  if (s === '') return null
  const result: string[] = []
  let str = s
  for (let guard = 0; guard < 64; guard++) {
    const t = tryTrimParentheses(str, left, right)
    if (!t.ok) break
    result.push(t.trim)
    if (!str.startsWith('(')) str = str.slice(str.indexOf(left))
    const next = trimStartStr(str, left + t.trim + right)
    if (next === str) throw new Error(`TrimParenthesesLoop 不收敛: "${s}" (left=${left})`)
    str = next
  }
  return result.length ? result : null
}

// Helper.cs:177-202 的精确形状: 每个 token 先 float.TryParse, 失败再走标识符解析 (resolve),
// 标识符解析返回 0 视为失败 → **整表返回 null** (调用点据此走默认值)。
// resolve 缺省 = 一律失败, 供纯字面量的数据表构建用; 战斗求值要传 identifier.ts 的实现。
export function toFloatList(s: string, delim = ',', resolve?: (id: string) => number): number[] | null {
  if (s === '') return []
  const out: number[] = []
  for (const tok of s.split(delim)) {
    const n = tryParseFloat(tok)
    if (n !== null) { out.push(n); continue }
    const v = resolve ? resolve(tok) : 0
    if (v !== 0) { out.push(v); continue }
    return null
  }
  return out
}

export function toIntList(s: string, delim = ',', resolve?: (id: string) => number): number[] | null {
  if (s === '' || s === 'none') return []
  const list = toFloatList(s, delim, resolve)
  return list === null ? null : list.map(x => Math.trunc(x))
}

// Helper.cs:220-244 ToIntRange。注意:
//   · 区间分隔符**只有** '~'; '|' 分多段。"1-2" 不是区间, 而是 int.Parse 直接抛 FormatException。
//   · 「－」→"-" 的归一是为了让**负号**能写成全角 (如 "－1~3"), 不是为了支持全角连字符。
//   · 默认 parseFunc = int.Parse (失败即抛), 不静默变 0/NaN。
export function toIntRange(s: string, parseFunc: (x: string) => number = parseIntOrThrow): number[] {
  if (s === '' || s === 'none') return []
  const parts = s.replaceAll('－', '-').split('|')
  const all: number[] = []
  for (const seg of parts) {
    const range = seg.split('~').map(parseFunc)
    if (range.length === 1) { all.push(range[0]); continue }
    const lo = Math.min(range[0], range[1])
    const hi = Math.max(range[0], range[1])
    for (let v = lo; v <= hi; v++) all.push(v)
  }
  return all
}

// Helper.cs:20-28 ConcatToString。与 arr.join(sep) **不等价**: 元素自身以 sep 结尾时,
// 这里末尾多出的那个 sep 是「拼上去的」, 会被 TrimEnd 砍掉一次, 而 join 会把两个都留下。
export const concatToString = (arr: string[], sep: string): string =>
  trimEndStr(arr.map(x => x + sep).join(''), sep)

// System.Boolean.Parse —— 只认 "true"/"false" (大小写不敏感、允许首尾空白), 其它一律 FormatException。
// 别用 JS 的真值判断顶替: "1" / "yes" / "" 在 JS 里都有答案, 在上游是抛错。
// 上游的默认值全是 `bool.ToString()` 出来的 "True"/"False" (BuffInfo.cs:76-84), 所以大小写也必须兼容。
export function boolParse(s: string): boolean {
  const t = s.trim().toLowerCase()
  if (t === 'true') return true
  if (t === 'false') return false
  throw new Error(`FormatException: 输入字符串的格式不正确 "${s}"`)
}

// C# `bool.TryParse(s, out value)` —— 语法与 bool.Parse 一致 (只认 true/false, 大小写不敏感、容空白),
// 但**失败不抛**, 而是 ok=false 且把 out 写成 **false** (.NET 失败时 out 是类型默认值)。
// 三处用 TryParse (IsAttackAndHit 的 hit/move、PetCondition/BuffCondition 的 own、Powerup 的 random/copy),
// 而 SkillCondition 的 default 用的是**会抛**的 bool.Parse —— 两套语义不能并成一个, 所以这里单列。
export function boolTryParse(s: string): { ok: boolean; value: boolean } {
  const t = s.trim().toLowerCase()
  if (t === 'true') return { ok: true, value: true }
  if (t === 'false') return { ok: true, value: false }
  return { ok: false, value: false }
}

// C# `bool.ToString()` ⇒ "True"/"False" (首字母大写), 而 JS 的 true→"true"。
// BuffInfo.GetRawInfoStringArray 的 `keep=`/`inherit=` 与 Effect.GetPetChangeEffect 的
// `passive=` 都直接把布尔拼进 raw 串, 落盘/对拍时大小写就是分歧点。
export const csBool = (b: boolean): string => (b ? 'True' : 'False')

// Helper.cs:127-130 ReplaceSpecialWhiteSpaceCharacters —— \t \r \n \v \f 逐个替成 newString。
// 表装载时用它把 CSV 里混进 name/options/description 的换行清干净 (BuffInfo.cs:49-54)。
export const replaceSpecialWhitespace = (s: string, to: string): string =>
  s.replaceAll('\t', to).replaceAll('\r', to).replaceAll('\n', to).replaceAll('\v', to).replaceAll('\f', to)

// Helper.cs:132-135 ReplaceColorAndNewline —— 文案里的 [ENDL]/[-]/[/] 是**颜色标记**, 不是括号。
// Buff.GetBuffDescriptionPreview 末尾与 HUD 渲染都靠它, 顺序也不能调 ("[-]" 先于 "]" 的替换)。
export const replaceColorAndNewline = (s: string): string =>
  s.replaceAll('[ENDL]', '\n').replaceAll('[-]', '</color>').replaceAll('[', '<color=#').replaceAll(']', '>')
