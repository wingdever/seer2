// MVC/Model/Basic/Pet/Status.cs 的逐行移植 (S2 数值层的第一块)。
// 移植纪律与三条必须照搬的上游语义:
//   1) **每个标量都是 float32**。C# 里 `status` 是 float[], 每步算术的结果都要收窄回 32 位,
//      所以这里每个算术点都套 f(); 少套一层, 能力值/伤害就会在末位 ULP 上分叉。
//   2) `Status / float` 不是除法, 是 **乘倒数** (Status.cs:287-290 `lhs * (1 / rhs)`)。
//      所以 `/100` = `x * f(1/100)` = x * 0.009999999776482582, 与 x/100f 的最近值**可以差 1 ULP**。
//      GetPetNormalStatus 的两条公式都过 /100, 这条是能力值对拍最容易翻车的地方。
//   3) LINQ 的 Max/Min 与 Mathf.Max/Min 是**两套语义**:
//      Mathf 版是严格比较、比较不成立时返回右操作数 (见 mathf.ts);
//      LINQ 版走 Comparer<float>.Default → Single.CompareTo, 而 CompareTo 把 NaN 判成「比任何数都小」。
//      所以 max/min/sum 这类聚合用 linqMax/linqMin, 别混。

import { f, floorToInt, pow as fpow, max as MathfMax, min as MathfMin, abs as MathfAbs, sign as MathfSign, clamp as MathfClamp } from '../mathf.ts'
import { toFloatList, trimParenthesesLoop, tryParseFloat, concatToString } from '../strutil.ts'

// Status.cs:12-16 —— 列序就是存档/CSV 的列序 (HP 在**末位**, 索引 5)
export const STATUS_TYPE_NAMES = ['atk', 'mat', 'def', 'mdf', 'spd', 'hp'] as const
export const STATUS_TYPE_NAMES_CN = ['物攻', '特攻', '物防', '特防', '速度', '体力'] as const
// typeNames.Update("hp", "hit") —— Helper 的 Update 是「把等于旧值的元素换成新值」
export const POWERUP_NAMES = STATUS_TYPE_NAMES.map(x => (x === 'hp' ? 'hit' : x))
export const POWERUP_NAMES_CN = STATUS_TYPE_NAMES_CN.map(x => (x === '体力' ? '命中' : x))

const F01 = f(0.1) // 0.1f —— 性格加减的都是这个 32 位近似值, 不是 0.1

// Single.CompareTo: > / < / == 都不成立时 (即出现 NaN), NaN 被判定为最小。
export function fcmp(a: number, b: number): number {
  if (a > b) return 1
  if (a < b) return -1
  if (a === b) return 0
  const an = Number.isNaN(a), bn = Number.isNaN(b)
  return an ? (bn ? 0 : -1) : 1
}

export function linqMax(xs: number[]): number {
  if (xs.length === 0) throw new Error('序列不包含任何元素 (EmptyEnumerable)')
  let m = xs[0]
  for (let i = 1; i < xs.length; i++) if (fcmp(m, xs[i]) < 0) m = xs[i]
  return m
}

export function linqMin(xs: number[]): number {
  if (xs.length === 0) throw new Error('序列不包含任何元素 (EmptyEnumerable)')
  let m = xs[0]
  for (let i = 1; i < xs.length; i++) if (fcmp(m, xs[i]) > 0) m = xs[i]
  return m
}

// Enumerable.Sum(IEnumerable<float>) 与 Average 同源 —— 累加器是 **double**, 只在返回时窄化一次 float。
// 用 float 逐步累加会在多位数向量上差 1 ULP (实测 sum=[100,82.33333333333333,21.25,43.333333333333336,21,3.857142857142857]
// 上游 271.7738 / float 累加 271.77383)。这是 seed=1/3/11 三轮对拍唯一剩下的分歧。
// ⚠ 越界行为没有实测依据 (要 3.4e38 量级才碰得到, 能力值/倍率都远够不着), 所以这里**不**猜 OverflowException,
//   只把 double 累加这个已坐实的部分写对。
export function linqSum(xs: number[]): number {
  let acc = 0
  for (const x of xs) acc += x
  return f(acc)
}

export class Status {
  // 上游是 `protected float[] status = new float[6]`, 长度 6 是**默认**而非不变式:
  // Status(IEnumerable<float>) 用 Where((x,i)=>i<6) 截断, 短的输入就得到短数组,
  // 之后 `[5]` 越界即抛 IndexOutOfRangeException —— 这里保持同样的「不做防御」形状。
  // ⚠ 元素一律 fround: 字段是 float[], 而 JS 里能递进构造函数的都是 double。
  //   不窄化的话, 一个 5.333333333333333 会以 double 精度参与后续运算, 与上游差 1 ULP ——
  //   对拍里 statusop 那批分歧就是这么来的 (oracle 侧 Coerce/GetSingle 天然收窄了)。
  s: number[]

  constructor(s?: number[] | number) {
    if (s === undefined) { this.s = [0, 0, 0, 0, 0, 0]; return }
    if (typeof s === 'number') { this.s = [0, 1, 2, 3, 4, 5].map(() => f(s)); return }
    this.s = s.slice(0, 6).map(f)
  }

  static zero(): Status { return new Status(0) }
  static one(): Status { return new Status(1) }
  // Status.cs:12-16 —— 四个名字表都是 **属性** (`=> new string[6]{…}` / `=> typeNames.Update(...)`),
  // 也就是**每次访问 new 一份新数组**。这点有下游意义: `SetPowerUp(Status)` 那类循环读的是
  // `Status.typeNames.Length`, 读到的是刚建出来的 6, 谁也不会拿到被谁就地改过的表。
  // 上游还有个 `typeSprites` (Enumerable.Range(0,6).Select(GetSprite)), 它要 UnityEngine 资源, 不搬。
  static get typeNames(): string[] { return [...STATUS_TYPE_NAMES] }
  static get typeNamesChinese(): string[] { return [...STATUS_TYPE_NAMES_CN] }
  static get powerupNames(): string[] { return [...POWERUP_NAMES] }
  static get powerupNamesChinese(): string[] { return [...POWERUP_NAMES_CN] }
  static copy(o: Status): Status { return new Status([...o.s]) }
  static of6(atk: number, mat: number, def: number, mdf: number, spd: number, hp: number): Status {
    return new Status([f(atk), f(mat), f(def), f(mdf), f(spd), f(hp)])
  }

  // Status.cs:26-30 的 this[int] —— 注意它走的是 Get/Set, 而 Get 只对 **0..5** 之外的索引返回 0,
  // 索引在 0..5 但数组更短时照样越界抛 (上游就是这个形状)。
  at(i: number): number { return !(i >= 0 && i <= 5) ? 0 : this.s[i] }
  setAt(i: number, v: number): void { if (i >= 0 && i <= 5) this.s[i] = f(v) }
  get atk(): number { return this.s[0] }
  set atk(v: number) { this.s[0] = f(v) }
  get mat(): number { return this.s[1] }
  set mat(v: number) { this.s[1] = f(v) }
  get def(): number { return this.s[2] }
  set def(v: number) { this.s[2] = f(v) }
  get mdf(): number { return this.s[3] }
  set mdf(v: number) { this.s[3] = f(v) }
  get spd(): number { return this.s[4] }
  set spd(v: number) { this.s[4] = f(v) }
  get hp(): number { return this.s[5] }
  set hp(v: number) { this.s[5] = f(v) }

  get sum(): number { return linqSum(this.s) }
  get max(): number { return linqMax(this.s) }
  get min(): number { return linqMin(this.s) }
  get sign(): Status { return this.select2((_x, i) => MathfSign(this.at(i))) }
  get abs(): Status { return this.select2((_x, i) => MathfAbs(this.at(i))) }
  get pos(): Status { return this.select(x => MathfMax(x, 0)) }
  get neg(): Status { return this.select(x => MathfMin(x, 0)) }
  get posMax(): number { return linqMax(this.pos.s) }
  get negMax(): number { return linqMin(this.neg.s) }
  // Status.cs:47 —— 命中 buff 直接挂在体力上: hp*10 + Clamp(hp,-3,3)*5
  get accuracyBuff(): number { return f(f(this.hp * f(10)) + f(MathfClamp(this.hp, f(-3), f(3)) * f(5))) }

  select(fn: (x: number) => number): Status { return new Status(this.s.map(x => f(fn(x)))) }
  select2(fn: (x: number, i: number) => number): Status { return new Status(this.s.map((x, i) => f(fn(x, i)))) }
  count(pred: (x: number) => boolean): number { return this.s.filter(pred).length }

  // Status.cs:260-263 —— lhs.Select((x,i) => lhs[i] + rhs[i]): 逐元素**读索引**, 不是读闭包里的 x
  plus(rhs: Status): Status { return new Status(this.s.map((_x, i) => f(this.at(i) + rhs.at(i)))) }
  times(rhs: Status): Status { return new Status(this.s.map((_x, i) => f(this.at(i) * rhs.at(i)))) }
  powTo(rhs: Status): Status { return new Status(this.s.map((_x, i) => fpow(this.at(i), rhs.at(i)))) }
  // Status.cs:292-295 `^float` → Status.Pow(value, float) —— 逐维 Mathf.Pow(值, 同一个指数)
  powToF(rhs: number): Status { return this.select(x => fpow(x, rhs)) }
  plusF(rhs: number): Status { return this.plus(new Status(rhs)) }
  timesF(rhs: number): Status { return this.times(new Status(rhs)) }
  minus(rhs: Status): Status { return this.plus(rhs.times(new Status(-1))) } // Status.cs:269-272
  minusF(rhs: number): Status { return this.minus(new Status(rhs)) }
  // Status.cs:287-290 —— **乘倒数**, 不是除。rhs 先窄化 (见 mathf.ts 的入口纪律): C# 形参是 float,
  // 而 1/0.2 在 double 与 float 下得到 4.9999999254 与 5.0 两个不同的数。
  divF(rhs: number): Status { const r = f(rhs); return this.timesF(f(f(1) / r)) }
  floorToInt(): Status { return this.select(x => floorToInt(x)) }

  // Status.cs:148-171 Get(string)。两点必须照搬:
  //   · switch 判的是**原始** type (没 ToLower), 只有兜底的索引查表才用 type.ToLower();
  //     所以 "HIT" 走兜底 → IndexOf("hit")=5? 不 —— typeNames 里没有 "hit", idx=-1 → 返回 0。
  //   · "max(except:hp)" 这种带括号的键是合法字面量, 来自 buff/效果表里的写法。
  get(name: string): number {
    const idx = STATUS_TYPE_NAMES.indexOf(name.toLowerCase() as typeof STATUS_TYPE_NAMES[number])
    switch (name) {
      case 'hit': return this.hp
      // status.Average() —— .NET 的 Average(float) 用 **double** 累加器 (Sum 才是 float 累加),
      // 空序列给 0 而不是 NaN。所以这里不能复用 float 累加的 linqSum, 否则末位 ULP 会分叉。
      case 'all': {
        if (this.s.length === 0) return 0
        let acc = 0
        for (const x of this.s) acc += x
        return f(acc / this.s.length)
      }
      case 'count': return this.count(x => x !== 0)
      case 'posCount': return this.count(x => x > 0)
      case 'negCount': return this.count(x => x < 0)
      case 'sum': return this.sum
      case 'absSum': return linqSum(this.s.map(x => MathfAbs(x)))
      case 'posSum': return linqSum(this.s.map(x => MathfMax(0, x)))
      case 'negSum': return linqSum(this.s.map(x => MathfMin(0, x)))
      case 'max': return this.max
      case 'min': return this.min
      case 'posMax': return this.posMax
      case 'negMax': return this.negMax
      case 'max(except:hp)': return linqMax(this.s.slice(0, 5))
      case 'min(except:hp)': return linqMin(this.s.slice(0, 5))
      case 'accuracyBuff': return this.accuracyBuff
      default: return idx === -1 ? 0 : this.s[idx]
    }
  }

  // Status.cs:173-194 Set(string): "all" 铺满, "hit" 写 hp, 其余按 typeNames 小写索引, 未知键**静默忽略**
  setByName(name: string, value: number): void {
    switch (name) {
      case 'all': this.s = this.s.map(() => f(value)); return
      case 'hit': this.hp = value; return
      default: {
        const idx = STATUS_TYPE_NAMES.indexOf(name.toLowerCase() as typeof STATUS_TYPE_NAMES[number])
        if (idx !== -1) this.s[idx] = f(value)
      }
    }
  }

  // Status.cs:85-108 Parse。⚠ 第 95 行判空判的是 **str** 而不是 typeList —— 那是上游笔误,
  // 结果是一条永远不成立的死分支 (str 走到这里必非空), 于是 typeList 为 null 时在 foreach 处 NRE。
  // 移植保留这个形状, 不"顺手修好"。
  static Parse(str: string, defaultReturn: Status | null = null, leftPar = '(', rightPar = ')'): Status | null {
    if (str === '') return defaultReturn
    const floatList = toFloatList(str, '/')
    if (floatList !== null && floatList.length === STATUS_TYPE_NAMES.length) return new Status(floatList)

    const typeList = trimParenthesesLoop(str, leftPar, rightPar)
    if (str === '') return defaultReturn // 死分支: 判的是 str, 上游 Status.cs:95 原样
    // 上游 Status.cs:99 直接 foreach 这个 List —— typeList 为 null 时是 NullReferenceException,
    // 而不是「返回默认值」。实测 (oracle): "atk:5" / "none" / "(859" / "1/2/3" 全 NRE。
    // 这条不是可修的边界, 是**调用方的契约**: 传进 Parse 的必须是括号包裹的形状, 否则进程外会炸。
    if (typeList === null) throw new TypeError('Status.Parse: typeList 为 null → 上游 NRE (Status.cs:99)')

    const status = new Status(defaultReturn === null ? Status.zero().s : [...defaultReturn.s])
    for (const type of typeList) {
      const split = type.split(':')
      if (split.length !== 2) return defaultReturn
      const num = tryParseFloat(split[1])
      if (num === null) return defaultReturn
      status.setByName(split[0], num)
    }
    return status
  }

  // Status.cs:122-125 ToString(delimeter): 先 FloorToInt 再逐个 ToString, 最后 ConcatToString
  // (Helper.cs:20 —— 不是 string.Join, 差在元素自带尾分隔符时砍几个, 见 strutil.concatToString)
  toString(delim: string): string { return concatToString(this.floorToInt().s.map(x => `${x}`), delim) }
  toArray(): number[] { return [...this.s] }
}

// Status.cs:325-361 GetPersonalityBuff —— 0..24 是「单一 + 单一」, 25..54 是「双 + 三减一」。
// 边界用 IsInRange(0, 55) = `>= 0 && < 55` (HelperMath.cs:23-28), 即 55 本身**不**在范围内。
const UP_PAIRS: number[][] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]
export function getPersonalityBuff(p: number): Status {
  const buff = Status.one()
  if (!(p >= 0 && p < 55)) return buff

  if (p < 25) {
    const up = Math.floor(p / 5), down = p % 5
    buff.s[up] = f(buff.s[up] + F01)
    buff.s[down] = f(buff.s[down] - F01)
    return buff
  }

  const id = p - 25
  const upIndex = UP_PAIRS[Math.floor(id / 3)] ?? [3, 4] // switch 的 _ 分支在 id/3 == 9, 表里已覆盖
  const downIndex = [0, 1, 2, 3, 4].filter(x => !upIndex.includes(x))
  for (const x of upIndex) buff.s[x] = f(buff.s[x] + F01)
  downIndex.forEach((x, i) => { if (id % 3 !== i) buff.s[x] = f(buff.s[x] - F01) })
  return buff
}

// Status.cs:363-377 GetPersonalityBuffDescription —— 先减 Status.one 取增量；>0 归"升"、<0 归"降"，
// 各自按列序拼中文列名（FindAllIndex 保序）。两表皆空才「平衡发展」。
// 注意 `ConcatToString(string.Empty)` 在空分隔符下 = 直接拼接；这里用 join('') 等价。
export function getPersonalityBuffDescription(p: number, delim = '\n', amount = '10%'): string {
  const buff = getPersonalityBuff(p).minus(Status.one())
  const up: string[] = [], down: string[] = []
  for (let i = 0; i < STATUS_TYPE_NAMES_CN.length; i++) {
    const v = buff.at(i)
    if (v > 0) up.push(STATUS_TYPE_NAMES_CN[i])
    else if (v < 0) down.push(STATUS_TYPE_NAMES_CN[i])
  }
  if (up.length + down.length === 0) return '平衡发展'
  return up.join('') + '+' + amount + delim + down.join('') + '-' + amount
}

// Status.cs:303-323 Add(Personality, Personality): 合成两个性格。
// 冲突判据是「存在同一列同时为 +0.1」⇒ 直接取 lhs; 否则把两个 delta 相加后回查 0..54 里第一个完全吻合的性格。
// 注意它比的是 `GetPersonalityBuff(p) - buff` **每一列都 == 0**, 而 buff 是 float32 累加的结果,
// 所以这一步对 0.1 的舍入路径敏感 —— 用 f() 逐位算, 别用「近似相等」。
export function addPersonality(lhs: number, rhs: number): number {
  const lhsBuff = getPersonalityBuff(lhs).minus(Status.one())
  const rhsBuff = getPersonalityBuff(rhs).minus(Status.one())

  for (let i = 0; i < STATUS_TYPE_NAMES.length; i++) {
    if (lhsBuff.at(i) === rhsBuff.at(i) && lhsBuff.at(i) !== 0) return lhs
  }

  const buff = lhsBuff.plus(rhsBuff).plusF(1)
  for (let i = 0; i < 55; i++) {
    const diff = getPersonalityBuff(i).minus(buff)
    if (diff.s.every(x => x === 0)) return i
  }
  return 0 // Personality.实干
}

// Status.cs:379-383 GetPowerUpBuff: (1 + 0.5f * |p|) ^ sign(p) —— 正负各走倒数, 用**幂**而不是分支。
export function getPowerUpBuff(powerup: Status): Status {
  const sgn = powerup.sign
  const base = powerup.abs.timesF(0.5).plusF(1)
  return base.powTo(new Status(sgn.s))
}

// Status.cs:385-391 GetPetNormalStatus —— 能力值主公式。
// 展开成算术序列 (每个 `()` 都 fround):
//   t = ((base*2) + iv) + (ev/4)        // *2 与 /4 都是逐元素; +iv 是 Status+float; /4 是**乘倒数**
//   n = (((t * level) / 100) + 5) * personalityBuff
//   h = ((t * level) / 100) + 10 + level   // 左结合: ((x+10)+level)
//   n.hp = h.hp; return FloorToInt(n)
export function getPetNormalStatus(level: number, baseStatus: Status, iv: number, ev: Status, personality: number): Status {
  const t = baseStatus.timesF(2).plusF(iv).plus(ev.divF(4))
  const scaled = t.timesF(level).divF(100)
  const normalStatus = scaled.plusF(5).times(getPersonalityBuff(personality))
  const hpStatus = scaled.plusF(10).plusF(level)
  normalStatus.hp = hpStatus.hp
  return normalStatus.floorToInt()
}

// Status.cs:228-239 的逐元素 Mathf.Min/Max/Clamp (效果表里 set_status 一类要用)
export const statusMin = (lhs: Status, rhs: Status): Status => lhs.select2((_x, i) => MathfMin(lhs.at(i), rhs.at(i)))
export const statusMax = (lhs: Status, rhs: Status): Status => lhs.select2((_x, i) => MathfMax(lhs.at(i), rhs.at(i)))
export const statusClamp = (v: Status, lo: Status, hi: Status): Status => v.select2((_x, i) => MathfClamp(v.at(i), lo.at(i), hi.at(i)))

// BattleStatus 的隐藏列 (Status.cs:394-408): hit/cri/eva/cdf/rec/angrec
export const HIDDEN_TYPE_NAMES = ['hit', 'cri', 'eva', 'cdf', 'rec', 'angrec'] as const
export const HIDDEN_TYPE_NAMES_CN = ['命中', '暴击', '闪避', '暴抗', '回复率', '怒气回复率'] as const
