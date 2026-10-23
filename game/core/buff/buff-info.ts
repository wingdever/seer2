// BuffInfo.cs 的移植 —— 印记「表里那一行」(静态内容), 与 buff.ts 的 Buff (战斗中那一个实例) 是两类东西。
//
// 两个构造重载都得留着, 它们的**清洗规则不同**: 7 参数版 (工坊/新建走这条) 对 name/options/description
// 过 ReplaceSpecialWhiteSpaceCharacters, 而 CSV 版 (BuffInfo.cs:59-71) 只 description.Trim() ——
// 因为 GetCSV 已按 `,`/`\n` 切过, 残留的只有制表与 \v\f 之类, 上游在那条路径上就是不清。
//
// 装载纪律 (和 Skills 一样): `options.ParseOptions` 走 Dictionary.**Add** ⇒ 同一个键出现两次是抛,
// 不是覆盖; 而 ResourceManager.GetBuffInfo 的 try 包在整表循环**外**, 所以一行抛会连坐其后所有行
// (见 docs/engine/port-map.md 的 tablediag)。这两条在 tools/difftest.mjs 里都有对应观测点。

import { BuffType, CopyHandleType, buffTypeToRaw, copyHandleToRaw, toBuffType, toCopyHandleType } from './buff-database.ts'
import { Effect, type EffectTable, setEffectTable } from '../effect/effect.ts'
import { dictGet } from '../collections.ts'
import { boolParse, concatToString, csBool, parseIntOrThrow, replaceSpecialWhitespace, trimEndStr } from '../strutil.ts'
import { isWithin } from '../numutil.ts'
import { parseOptions } from '../parser/parser.ts'
import type { IdResolver } from '../parser/parser.ts'

export type Options = Map<string, string>

export const INT_MIN = -2147483648
export const INT_MAX = 2147483647

// C# 的 int 运算是**环绕**的 (unchecked), 而 (int)float 是饱和的 —— GetSortPriority 全是 int 加法,
// 所以要的是 wrap 不是 sat (JS 的 `|0` 正好是同一件事)。
const wrap32 = (x: number): number => x | 0

/** Database.instance.GetBuffInfo —— id==0 短路返回 null (Database.cs:156-161), 表里真有 0 号也不给查。 */
export interface BuffInfoTable {
  getBuffInfo(id: number): BuffInfo | null
  /**
   * `Database.instance.buffInfoDict.Where(e => e.Value.type == t).Select(e => e.Key)` —— AddBuff 算子的
   * `unique(<类型表>)` / `random(<类型表>)` 两支按类型枚举印记 id。
   * **可选**: 老替身不实现也不影响别的路径, 真走到那条支时由下面的 buffIdsOfType 显式抛 (不静默给空表,
   * 否则「候选为空 ⇒ return false」会把「表没接」伪装成「这一型真没印记」)。
   */
  buffIdsOfType?(type: BuffType): number[]
}

let CURRENT_INFOS: BuffInfoTable = { getBuffInfo: () => null }
export const setBuffInfoTable = (table: BuffInfoTable): void => { CURRENT_INFOS = table }

// 按类型枚举印记 id。上游是 LINQ 直查字典 ⇒ 顺序 = 字典枚举序; 移植体按**装载序**打,
// 而这条支唯一可比的那一格是「筛完为空 ⇒ return false」(非空就要 native Random), 顺序不可观测。
export const buffIdsOfType = (type: BuffType): number[] => {
  const f = CURRENT_INFOS.buffIdsOfType
  if (f === undefined)
    throw new Error('NOT_PORTED: BuffInfoTable.buffIdsOfType 未注入 —— 印记表的按类型枚举 (AddBuff 的 unique/random 候选集)')
  return f.call(CURRENT_INFOS, type)
}

// Identifier.GetNumIdentifier 的接缝: GetSortPriority 的 group=Cm 分支要把 options["Cm_type"] 当表达式求值。
// 上游是静态调用 (要 Player.instance.random), 移植体只能从外面注一个; 没注入时那条分支显式抛, 不静默给 0。
let CURRENT_NUM_ID: IdResolver | null = null

// Identifier.GetNumIdentifier 的注入版 —— Buff.GetBuffIdentifier 读 option 值、BuffInfo 的 Cm 排序
// 都收敛到这一个入口; 没注入时显式抛 (上游是静态直调, 静默给 0 会把「接缝没接」伪装成「表里就是 0」)。
export const numIdentifier = (id: string): number => {
  if (!CURRENT_NUM_ID) throw new Error('Identifier.GetNumIdentifier 未注入 (见 setBuffTables)')
  return CURRENT_NUM_ID(id)
}

/** 真二进制里 Buff/BuffInfo 都直接读 Database.instance, 这里一处接缝一次装好 (见 game/app/content.js)。 */
export const setBuffTables = (infos: BuffInfoTable, prefabs: EffectTable, numId: IdResolver | null = null): void => {
  CURRENT_INFOS = infos
  CURRENT_NUM_ID = numId
  setEffectTable(prefabs)
}

export const getBuffInfo = (id: number): BuffInfo | null =>
  id === 0 ? null : CURRENT_INFOS.getBuffInfo(id)

export class BuffInfo {
  static readonly DATA_COL = 7

  id: number
  name: string
  type: BuffType
  copyHandleType: CopyHandleType
  turn: number
  options: Options = new Map()
  description: string

  resId = 0
  itemId = 0
  keep = true
  inherit = false
  legacy = false
  hide = false
  autoRemove = false
  movable = true
  removable = true
  minValue = INT_MIN
  maxValue = INT_MAX
  effects: Effect[] = []

  constructor(_data: string[], startIndex = 0) {
    if (_data.length < startIndex + BuffInfo.DATA_COL)
      throw new Error(`ArgumentOutOfRangeException: BuffInfo 需要 ${BuffInfo.DATA_COL} 列 (startIndex=${startIndex}, 实得 ${_data.length - startIndex} 列)`)
    const sliced = _data.slice(startIndex, startIndex + BuffInfo.DATA_COL)
    this.id = parseIntOrThrow(sliced[0])
    this.name = sliced[1]
    this.type = toBuffType(sliced[2])
    this.copyHandleType = toCopyHandleType(sliced[3])
    this.turn = parseIntOrThrow(sliced[4])
    parseOptions(this.options, sliced[5])
    this.description = sliced[6].trim()
    this.initOptionsProperty()
  }

  // 工坊/程序化构造那一条 (BuffInfo.cs:47-57): 三个字符串字段先过空白清洗。
  static fromFields(id: number, name: string, type: BuffType, copyHandleType: CopyHandleType,
    turn: number, options: string, description: string): BuffInfo {
    const self = Object.create(BuffInfo.prototype) as BuffInfo
    self.id = id
    self.name = replaceSpecialWhitespace(name, '')
    self.type = type
    self.copyHandleType = copyHandleType
    self.turn = turn
    self.options = new Map()
    parseOptions(self.options, replaceSpecialWhitespace(options, ''))
    self.description = replaceSpecialWhitespace(description, '')
    // C# 的字段初始化器 (`effects = new List<Effect>()`) 对**每个**构造重载都跑, 而 Object.create 不会 ⇒
    // 这里必须自己补上, 否则工坊那条路拿到的 info.effects 是 undefined (Buff 构造里直接炸)。
    self.effects = []
    self.initOptionsProperty()
    return self
  }

  // BuffInfo.cs:73-85 —— 默认值全是 C# 的形状: bool 默认串来自 `bool.ToString()` ⇒ "True"/"False",
  // min/max 默认来自 `int.MinValue.ToString()` ⇒ "-2147483648" / "2147483647" (不是 JS 的 ±Infinity)。
  private initOptionsProperty(): void {
    const o = this.options
    this.resId = parseIntOrThrow(dictGet(o, 'res', String(this.id))!)
    this.itemId = parseIntOrThrow(dictGet(o, 'item', '0')!)
    this.keep = boolParse(dictGet(o, 'keep', csBool(this.type !== BuffType.Unhealthy && this.type !== BuffType.Abnormal))!)
    this.inherit = boolParse(dictGet(o, 'inherit', 'false')!)
    this.legacy = boolParse(dictGet(o, 'legacy', 'false')!)
    this.hide = boolParse(dictGet(o, 'hide', 'false')!)
    this.removable = boolParse(dictGet(o, 'removable', 'true')!)
    this.autoRemove = boolParse(dictGet(o, 'auto_remove', 'false')!)
    this.minValue = parseIntOrThrow(dictGet(o, 'min_val', String(INT_MIN))!)
    this.maxValue = parseIntOrThrow(dictGet(o, 'max_val', String(INT_MAX))!)
    this.movable = boolParse(dictGet(o, 'movable', String(this.type !== BuffType.Abnormal))!)
  }

  // 上游这三个是**每次访问都重算**的属性 (不是构造时缓存), 所以照搬成 getter ——
  // options 被 SetBuffIdentifier 改过之后, 这里必须立刻看到新值。
  get sortPriority(): number { return this.getSortPriority() }
  get addPriority(): number { return parseIntOrThrow(dictGet(this.options, 'priority', '0')!) }
  get position(): string { return dictGet(this.options, 'position', 'none')! }
  // Dictionary.Get(key) 不带默认值 ⇒ string 的 default 是 **null**, 调用方靠它判「有没有覆盖类型」
  get overrideType(): string | null { return dictGet(this.options, 'type') }

  // BuffInfo.cs:87-89 —— 表装载时把预制体引用换成 effectDict 里的拷贝并展开常驻 set_skill 壳。
  setEffects(_effects: Effect[]): void { this.effects = Effect.setEffects(_effects) }

  static isMod(id: number): boolean {
    return isWithin(id, 51_0001, 59_9999) || isWithin(id, 80_0013, 89_9999) || isWithin(id, 90_0013, 99_9999) || id < -10_0000
  }

  // BuffInfo.cs:112-143。整除与取余都用 C# 语义 (向零截断 / 余数随被除数符号), JS 的 % 恰好同侧。
  getSortPriority(): number {
    const mod = 10_0000
    const _pet = this.id % mod
    const group = dictGet(this.options, 'group')

    if (group === 'achievement') return wrap32(INT_MIN + Math.abs(this.id))
    if (this.id === -5 || this.id === -6) return INT_MAX
    if (this.id === -9 || this.id === -10 || this.id === -2005) return Math.abs(this.id)

    if (this.type === BuffType.Feature) return wrap32(-2 * mod + (_pet - mod))
    if (this.type === BuffType.Emblem) return wrap32(-1 * mod + (_pet - mod))

    if (group === 'Cm') {
      return wrap32((5 + Math.trunc(numIdentifier(dictGet(this.options, 'Cm_type', '0')!))) * mod + _pet)
    }

    if (this.id < 0) return wrap32(50 * mod + this.id)
    if (this.id <= 10) return this.id - 2
    return this.id
  }

  // BuffInfo.cs:91-110 —— 反推回一行 CSV。这是「表装载 → 运行时 → 落盘」往返一致性的观测点,
  // 所以 bool 必须是 C# 的 "True"/"False", 且 defaultOptionKeys 之外的键按**插入序**原样吐回。
  getRawInfoStringArray(): string[] {
    const defaultOptionKeys = ['res', 'hide', 'keep', 'inherit', 'legacy', 'auto_remove', 'min_val', 'max_val']

    const resRawString = this.id === this.resId ? '' : (`res=${this.resId}&`)
    const hideString = this.hide ? 'hide=true&' : ''
    const legacyString = this.legacy ? 'legacy=true&' : ''
    const autoRemoveString = this.autoRemove ? 'auto_remove=true&' : ''
    const minValueString = this.minValue === INT_MIN ? '' : (`min_val=${this.minValue}&`)
    const maxValueString = this.maxValue === INT_MAX ? '' : (`max_val=${this.maxValue}&`)

    const rawOptionString = resRawString + minValueString + maxValueString +
      hideString + legacyString + autoRemoveString +
      `keep=${csBool(this.keep)}&inherit=${csBool(this.inherit)}&`
    const otherOptionString = concatToString(
      [...this.options].filter(([k]) => !defaultOptionKeys.includes(k)).map(([k, v]) => `${k}=${v}`), '&')
    const allOptionString = rawOptionString + otherOptionString

    return [String(this.id), this.name, buffTypeToRaw(this.type), copyHandleToRaw(this.copyHandleType),
      String(this.turn), trimEndStr(allOptionString, '&'), this.description]
  }
}
