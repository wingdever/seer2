// MVC/Model/Basic/Buff/Buff.cs 的逐行移植 —— 「战斗中那一个印记实例」。
// 与 buff-info.ts (表里那一行, 静态内容) 的分工必须守住: Buff 只带 id/turn/value/options 四样可变数据,
// 其余一切从 info 读, 而且**每次读都重新算** (info 的 sortPriority/hide 与这里的 hide 都是属性)。
//
// 四处最容易分叉的语义, 都有对拍向量兜着 (tools/difftest.mjs 的 buffinfo/buffid/buffdesc):
//   · `value` 的 getter 与 setter **都**过 Mathf.Clamp —— 所以 `b.value = 999` 之后读回来是 maxValue,
//     而直接改 _value 是改不到的 (JS 里必须真的写成访问器, 不能退化成普通字段)。
//   · `hide`/`removable` 的表内覆盖走 **float.Parse** (不是 TryParse) —— options["hide"]="abc" 在 C# 是抛,
//     给成 false 就把一条配置错误变成了静默的显示差异。
//   · `GetBuffDescriptionPreview` 最后那个 `foreach (var key in valueTypeFuncDict.Keys)` 是**无条件**跑的,
//     连 [pet] 这条也会拿 referenceBuff.value 去查精灵表 —— 上游 pet 表在 oracle 里是空的 (见 Boot.cs
//     填 null 字典那一步), 所以 TS 侧的接缝必须同样答 null, 否则会造出「只有 oracle 有」的假分歧。
//   · `IsType(All)` 取的是 `!IsType(Power)` —— 不是「All 恒真」。这条反直觉到值得单独测。

import { BuffType, toBuffType } from './buff-database.ts'
import { type BuffInfo, type Options, BuffInfo as BuffInfoStatic, getBuffInfo, numIdentifier } from './buff-info.ts'
import { BuffReferData } from './buff-refer-data.ts'
import { Effect } from '../effect/effect.ts'
import { dictGet, dictMerge, dictSet, dictTryGet } from '../collections.ts'
import { clampInt } from '../mathf.ts'
import { isInRange, isWithin } from '../numutil.ts'
import { POWERUP_NAMES, POWERUP_NAMES_CN } from '../pet/status.ts'
import { getElementName } from '../pet/element.ts'
import { replaceColorAndNewline, parseFloatOrThrow, trimEndStr, trimParentheses, tryTrimParentheses, tryTrimStart } from '../strutil.ts'

// ── 外部世界的接缝 ──
// 上游这三个查表都是静态直调 Database/Pet/Skill, 移植体只能注进来。
// 默认答 null —— 与 oracle 的真实状态一致 (那份进程里 petInfoDict 是空字典, 所以 [x:pet] 恒为兜底串)。
export interface BuffHost {
  /** Pet.GetPetInfo(id)?.name */
  petName(id: number): string | null
  /** Skill.GetSkill(id, false)?.name —— avoidNull=false ⇒ 查不到就是 null, 不给空过技 */
  skillName(id: number): string | null
  /** BuffInfo.database (全表按 sortPriority **降序**) —— 三个异特药剂池用它 */
  allInfos(): BuffInfo[]
}

let HOST: BuffHost = { petName: () => null, skillName: () => null, allInfos: () => [] }
export const setBuffHost = (h: Partial<BuffHost>): void => { HOST = { ...HOST, ...h } }

export const BUFFID_TOKEN = -21
export const BUFFID_PVP_IV_120 = 61_0000
export const BUFFID_PET_EXCHANGE = 62_0000
export const BUFFID_PET_RANDOM = 62_0001
export const BUFFID_PROTECT_POWERUP = -2003
export const BUFFID_PROTECT_POWERDOWN = -2004
export const BUFFID_RESIST_BUFF = -2005

export const powerupBuffIds = (): number[] => [1, 3, 5, 7, 9, -9]
export const powerdownBuffIds = (): number[] => [2, 4, 6, 8, 10, -10]
export const powerBuffIds = (): number[] => [...powerupBuffIds(), ...powerdownBuffIds()]

// C# 的 (int)float 原生强转: 超范围与 NaN 都落到 0x80000000 (cvttsd2si 的「无效值」编码),
// 与 Mathf.FloorToInt 的 NaN→0 是两件事。这里唯一被对拍实测覆盖的分支是 float.MinValue ⇒ -2147483648
// (GetBuffIdentifier 查不到键的哨兵值, 在 [pet:xxx] 这类文案里必然走到); NaN 分支尚未坐实。
const intCast = (x: number): number => {
  if (Number.isNaN(x)) return -2147483648
  const t = Math.trunc(x)
  return t > 2147483647 ? 2147483647 : t < -2147483648 ? -2147483648 : t
}

// .NET 的数字段格式: 分号分成 positive/negative/zero 三段, negative 段拿**绝对值**套模板。
// 两段式 (+#;-#) 时 0 走 positive 段, 而 '#' 对 0 不产生任何字符 ⇒ 空串。这是格式串的既有怪处, 照搬。
const fmtSigned = (v: number, zeroText: string | null): string => {
  const digits = String(Math.abs(v))
  if (v > 0) return `+${digits}`
  if (v < 0) return `-${digits}`
  return zeroText === null ? (digits === '0' ? '' : `+${digits}`) : zeroText
}

export class Buff {
  id: number
  turn: number
  ignore = false
  effects: Effect[] = []
  options: Options = new Map()

  private _value = 0

  // Buff.cs:26-30 —— 三个都是**每次现查表**的属性; info 为 null (id 不在表里) 时下面全都 NRE,
  // 上游靠「先构造再显示」的顺序保证不发生, 移植体不额外兜底 (对拍会把它炸出来)。
  get info(): BuffInfo { return getBuffInfo(this.id)! }
  get name(): string { return this.info.name }
  get description(): string { return this.getDescription() }

  get value(): number { return clampInt(this._value, this.info.minValue, this.info.maxValue) }
  set value(v: number) { this._value = clampInt(v, this.info.minValue, this.info.maxValue) }

  // 表内覆盖用 float.Parse ⇒ 畸形值抛, 不是 false
  get hide(): boolean {
    const t = dictTryGet<string>(this.options, 'hide')
    return t.ok ? (parseFloatOrThrow(t.value!) !== 0) : this.info.hide
  }
  get removable(): boolean {
    const t = dictTryGet<string>(this.options, 'removable')
    return t.ok ? (parseFloatOrThrow(t.value!) !== 0) : this.info.removable
  }

  // Buff.cs:47-64 主构造。注意 `(_turn == -1) ? info.turn : _turn` —— 想传「永久」就得给 -1,
  // 而表里 turn 恰好也可能是 -1, 于是调用方无法把回合数显式写成 -1。
  constructor(_id: number, _turn = -1, _value: number | null = null) {
    this.id = _id
    this.turn = _turn === -1 ? this.info.turn : _turn
    this.value = _value ?? 0
    this.ignore = false
    this.effects = this.info.effects.map((x) => { const e = x.clone(); e.source = this; return e })

    const data = BuffReferData.parseDict(dictGet(this.info.options, 'ref_buff'))?.get(this.id)
    if (data === undefined || data === null) return
    this.value = _value ?? data.Value
    dictMerge(this.options, data.options)
  }

  // Buff.cs:66-78 —— 从引用串构造: turn/value 直接取 data (已过 ID/Turn/Value 的默认), 不再看 info.turn。
  static fromReferData(data: BuffReferData): Buff {
    const self = Object.create(Buff.prototype) as Buff
    self.id = data.ID
    self.turn = data.Turn
    self._value = 0
    self.value = data.Value
    self.ignore = false
    self.effects = self.info.effects.map((x) => { const e = x.clone(); e.source = self; return e })
    self.options = new Map()
    dictMerge(self.options, data.options)
    return self
  }

  // Buff.cs:80-93 拷贝构造 —— options 是**新字典**, effects 逐个 new Effect(x), 且 source 指向新 body。
  clone(): Buff {
    const self = Object.create(Buff.prototype) as Buff
    self.id = this.id
    self.turn = this.turn
    self._value = 0
    self.value = this.value
    self.ignore = this.ignore
    self.options = new Map()
    self.effects = this.effects.map((x) => { const e = x.clone(); e.source = self; return e })
    dictMerge(self.options, this.options)
    return self
  }

  // Buff.cs:95-111 —— 七个 case 里的递归是**语义本身**: All = 非 Power, Power = Powerup|Powerdown,
  // 而 Powerup 既要查 id 名单也要查 type。overrideType 一旦存在就整体接管, 连 All 都跟着变。
  isType(type: BuffType): boolean {
    const over = this.info.overrideType
    if (over !== null && over !== '') return toBuffType(over) === type

    switch (type) {
      case BuffType.All: return !this.isType(BuffType.Power)
      case BuffType.Power: return this.isType(BuffType.Powerup) || this.isType(BuffType.Powerdown)
      case BuffType.Powerup: return this.isPowerUp() || this.info.type === BuffType.Powerup
      case BuffType.Powerdown: return this.isPowerDown() || this.info.type === BuffType.Powerdown
      case BuffType.Unhealthy: return this.isUnhealthy()
      case BuffType.Abnormal: return this.isAbnormal()
      case BuffType.TurnBased: return this.turn > 0 && !this.isUnhealthy() && !this.isAbnormal()
      default: return this.info.type === type
    }
  }

  isUneffectable(): boolean {
    const idList = [90, 91, 99, 100]
    const excludeIdList = [-2003, -2004]
    return (this.id <= 0 && !excludeIdList.includes(this.id) && !BuffInfoStatic.isMod(this.id)) || !this.removable || idList.includes(this.id)
  }

  isCopyable(): boolean { return !this.isPower() }
  isPower(): boolean { return isWithin(this.id, 1, 10) || isWithin(this.id, -9, -10) }
  isPowerUp(): boolean { return powerupBuffIds().includes(this.id) }
  isPowerDown(): boolean { return powerdownBuffIds().includes(this.id) }
  isAbnormal(): boolean { return this.info.type === BuffType.Abnormal || this.id === 199 }
  isUnhealthy(): boolean { return this.info.type === BuffType.Unhealthy || this.id === 1999 }

  // 注意取反两次: ignore ⇒ 一定可动; id104 (封印系) 看 value 是否 < 40。
  isUnmovable(): boolean {
    if (this.ignore) return false
    if (this.id === 104) return this.value < 40
    return !this.info.movable
  }

  isYiTeMedicineItem(): boolean { return isInRange(this.id, 400005, 400015) }

  // Buff.cs:162-229 的静态工厂
  // Buff.cs:162-164 —— 上游是 `Database.instance.GetBuffInfo(id)` 的静态转发; 移植体转发到
  // buff-info.ts 的表接缝 (查不到给 null)。`get info()` 走的是同一个函数, 但它在 null 时**炸**,
  // 而这个静态入口的设计用途正是「先探一下有没有这张表」(GetWeatherBuff / GetFeatureBuff 那三支)。
  static getBuffInfo(id: number): BuffInfo | null { return getBuffInfo(id) }

  static getExtendUIBuffId(extend: boolean): number { return extend ? -6 : -5 }
  static getExtendUIBuff(extend: boolean): Buff { return new Buff(Buff.getExtendUIBuffId(extend)) }

  // type 是 StatusType 的下标 (0..5), 5 = hp→hit 那一列借用了 -9/-10 两个「全属性」印记。
  static getPowerUpBuffId(type: number, powerup: number): number {
    if (powerup === 0) return 0
    if (type === 5) return powerup > 0 ? -9 : -10
    return 2 * type + (powerup > 0 ? 1 : 2)
  }

  static getProtectBuffTypeId(type: BuffType): number {
    switch (type) {
      case BuffType.TurnBased: return -2001
      case BuffType.ChanceBased: return -2002
      case BuffType.Powerup: return -2003
      case BuffType.Powerdown: return -2004
      default: return 0
    }
  }

  static getWeatherBuff(weatherId: number): Buff {
    const id = 50_0000 + weatherId
    return getBuffInfo(id) === null ? new Buff(50_0000) : new Buff(id)
  }

  // feature/emblem 两个工厂在移植体里收 baseId (上游收 pet.feature.feature?.baseId) ——
  // 传 0 就是「没有特性」, 上游据此落到 90_0000 查一个空壳印记, 查不到给 null。
  static getFeatureBuff(featureBaseId: number | null): Buff | null {
    const featureId = featureBaseId ?? 0
    const id = (featureId > 0 ? 10_0000 : 90_0000) + Math.abs(featureId)
    return getBuffInfo(id) === null ? null : new Buff(id)
  }

  static getEmblemBuff(emblemBaseId: number | null): Buff | null {
    const emblemId = emblemBaseId ?? 0
    const id = (emblemId >= 0 ? 20_0000 : 80_0000) + Math.abs(emblemId)
    return getBuffInfo(id) === null ? null : new Buff(id, -1, 1)
  }

  // Buff.cs:21-23 —— 异特药剂三池。id 区间用的全是 IsInRange (上界**不含**)。
  static get yiteEndBuffDatabase(): Buff[] {
    return HOST.allInfos().filter((x) => isInRange(x.id, 410000, 420000)).map((x) => new Buff(x.id))
  }
  static get yiteHardBuffDatabase(): Buff[] {
    return HOST.allInfos()
      .filter((x) => isInRange(x.id, 430000, 440000) || isInRange(x.id, 400010, 400015) || isInRange(x.id, 950, 999))
      .map((x) => new Buff(x.id))
  }
  static get yiteEasyBuffDatabase(): Buff[] {
    return HOST.allInfos()
      .filter((x) => isInRange(x.id, 420000, 430000) || isInRange(x.id, 400005, 400010))
      .map((x) => new Buff(x.id))
  }

  // Buff.cs:231-326 —— 文案预览。顺序即语义, 三步分开看:
  //   ① 正则抓 [x:y] / [option[x]:y] / [option[x]] 三种, GroupBy(全文).First() **去重**后逐个替换;
  //   ② 注释掉的那段 while 循环是上游放弃的老实现, 不搬;
  //   ③ 最后无条件遍历 11 个键做 [key] 单名替换 —— 这一步会拿 referenceBuff.value 去查 pet/skill 表,
  //      所以 value≠0 时上游也对空 pet 表调一次 (在 oracle 里 ⇒ "精灵信息错误")。
  static getBuffDescriptionPreview(rawDescription: string, referenceBuff: Buff | null = null): string {
    let desc = rawDescription
    const ref = referenceBuff ?? new Buff(-1, 0, 0)

    const getPokerValue = (v: number): string =>
      v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : v === 1 ? 'A' : String(v)

    const getPowerupValue = (): string => {
      let result = ''
      for (let i = 0; i < POWERUP_NAMES.length; i++) {
        const powerup = ref.getBuffIdentifier(`option[${POWERUP_NAMES[i]}]`)
        if (powerup !== 0) result += `${POWERUP_NAMES_CN[i]}${fmtSigned(powerup, null)}，`
      }
      return trimEndStr(result, '，')
    }

    // 键序 = C# 字典字面量的书写序, 第 ③ 步的替换顺序由它决定
    const valueTypeFunc: [string, (v: number) => string][] = [
      ['pet', (v) => HOST.petName(v) ?? '精灵信息错误'],
      ['skill', (v) => HOST.skillName(v) ?? '技能信息错误'],
      ['buff', (v) => getBuffInfo(v)?.name ?? '印记信息错误'],
      ['element', (v) => getElementName(v)],
      ['poker', getPokerValue],
      ['powerup', () => getPowerupValue()],
      ['who', (v) => (v === 1 ? '自身' : '对方')],
      ['num', (v) => fmtSigned(v, '0')],
      ['+num', (v) => fmtSigned(v, '+0')],
      ['-num', (v) => fmtSigned(v, '-0')],
      ['value', (v) => String(v)],
    ]
    const lookup = (key: string): ((v: number) => string) | null =>
      valueTypeFunc.find(([k]) => k === key)?.[1] ?? null

    const replaceValue = (str: string, key: string): string => {
      const split = key.split(':')
      const optionKey = split[0] ?? 'value'
      const valueType = split[1] ?? 'value'

      const t = tryTrimStart(optionKey, 'option')
      if (t.ok) {
        const p = tryTrimParentheses(t.trim)
        if (p.ok && !ref.options.has(p.trim)) return str.replaceAll(`[${key}]`, '空栏位')
      }

      const buffValue = ref.getBuffIdentifier(optionKey)
      const fn = lookup(valueType) ?? ((v: number) => String(v))
      return str.replaceAll(`[${key}]`, valueType === 'float' ? String(buffValue) : fn(intCast(buffValue)))
    }

    // 命名捕获组在 JS 里同名会 SyntaxError (上游三个组名互不重复, 但这里也用不到名字)
    const re = /\[(?:option\[([^\]]+)\](?::([^\]]+))?|([^:\]]+):([^\]]+))\]/g
    const seen = new Set<string>()
    for (const m of desc.matchAll(re)) if (!seen.has(m[0])) seen.add(m[0])
    for (const key of seen) desc = replaceValue(desc, trimParentheses(key))

    for (const [key, fn] of valueTypeFunc) desc = desc.replaceAll(`[${key}]`, fn(ref.value))

    return replaceColorAndNewline(desc)
  }

  // Buff.cs:328-349 —— 四行中文后缀的**拼接顺序**就是显示顺序; 「换场不保留」那条的判定是
  // !keep && !Unhealthy && !Abnormal (异常/负面天然不提, 因为它们本来就不跨场)。
  getDescription(): string {
    let desc = Buff.getBuffDescriptionPreview(this.info.description, this)

    if (!this.info.keep && !this.isUnhealthy() && !this.isAbnormal()) desc += '\n（换场不保留原精灵身上）'
    if (this.info.inherit) desc += '\n（换场继承给下一位精灵）'
    if (this.info.legacy) desc += '\n（阵亡继承给下一位精灵）'
    if (this.turn > 0) desc += `\n持续 ${this.turn} 回合`

    const round = this.getBuffIdentifier('round')
    if (round > 0) desc += `\n持续 ${round} 轮次`
    return desc
  }

  // Buff.cs:351-386 —— 三个前缀分支都在 switch 之前, 所以 "option[type]" 走的是 option 分支而不是 type。
  // 兜底是 float.MinValue, 调用方 (TryGetBuffIdentifier / 文案) 靠它判「查不到」。
  getBuffIdentifier(id: string): number {
    const tOpt = tryTrimStart(id, 'option')
    if (tOpt.ok) {
      const trimId = trimParentheses(tOpt.trim)
      return numIdentifier(dictGet(this.options, trimId, dictGet(this.info.options, trimId, '0')!)!)
    }

    const tGrp = tryTrimStart(id, 'group')
    if (tGrp.ok) {
      const trimId = trimParentheses(tGrp.trim)
      return dictGet(this.options, 'group', dictGet(this.info.options, 'group')!) === trimId ? 1 : 0
    }

    const tTyp = tryTrimStart(id, 'type')
    if (tTyp.ok) {
      const p = tryTrimParentheses(tTyp.trim)
      if (p.ok) return this.isType(toBuffType(p.trim)) ? 1 : 0
    }

    switch (id) {
      case 'id': return this.id
      case 'type': return this.info.type
      case 'value': return this.value
      case 'turn': return this.turn
      case 'round': return this.getBuffIdentifier('option[round]')
      case 'ignore': return this.ignore ? 1 : 0
      case 'hide': return this.hide ? 1 : 0
      case 'removable': return this.removable ? 1 : 0
      case 'movable': return this.isUnmovable() ? 0 : 1
      case 'maxValue': return this.info.maxValue
      case 'minValue': return this.info.minValue
      default: return -3.4028234663852886e38   // float.MinValue
    }
  }

  tryGetBuffIdentifier(id: string): { ok: boolean; num: number } {
    const num = this.getBuffIdentifier(id)
    return { ok: num !== -3.4028234663852886e38, num }
  }

  // Buff.cs:394-432 —— option[...] 之外只有六个键可写, 其余**静默 return** (不抛)。
  // 写 "id" 时先查表, 查不到就不改 —— 这条守卫让 SetBuffIdentifier 不能用来构造悬空印记。
  setBuffIdentifier(id: string, num: number): void {
    const t = tryTrimStart(id, 'option')
    if (t.ok) {
      const p = tryTrimParentheses(t.trim)
      if (p.ok) {
        dictSet(this.options, p.trim, String(num))
        return
      }
    }

    switch (id) {
      case 'id': {
        if (getBuffInfo(intCast(num)) === null) return
        this.id = intCast(num)
        this.effects = this.info.effects.map((x) => { const e = x.clone(); e.source = this; return e })
        return
      }
      case 'value': this.value = intCast(num); return
      case 'turn': this.turn = intCast(num); return
      case 'round': this.setBuffIdentifier('option[round]', num); return
      case 'ignore': this.ignore = num !== 0; return
      case 'hide':
      case 'removable': this.setBuffIdentifier(`option[${id}]`, num); return
      default: return
    }
  }
}
