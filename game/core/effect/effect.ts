// Effect.cs 的移植 (数据/解析/格式化那半; Condition/Apply 在 effect-handler 那一步接)。
//
// 上游一条效果 = 7 列 (Effect.DATA_COL=7): timing / priority / target / condition /
// condOption / ability / abilityOption, 再加一个 id。CSV 里的**一行**是预制体 (prefab),
// 而技能/印记/道具表里的 DSL 串 (`(1002{buff=3&2=4&5=6})`) 是**对预制体的引用 + 实参**:
// Effect.Parse 按 id 取一份**拷贝**再 Format 实参 —— 所以同一个预制体被 2000 个技能引用时互不污染,
// 这个 clone 是语义的一部分, 不是防御性复制 (Effect.cs:118-122 `new Effect(e)`)。
//
// headless 纪律: 预制体表从外面注入 (`EffectTable`), 本文件不出现 Database.instance / UnityEngine。

import {
  EffectAbility, EffectCondition, EffectTarget, EffectTiming,
  abilityToRaw, conditionToRaw, targetToRaw, timingToRaw, toEffectTiming,
} from './effect-database.ts'
import { concatToString, parseIntOrThrow, tryTrimParentheses, tryTrimStart, trimParenthesesLoop } from '../strutil.ts'
import { f } from '../mathf.ts'
import { dictGet, isEmpty, toDictionaryStrict } from '../collections.ts'

export type Options = Map<string, string>

// System.Single.MinValue —— 上游用 float.MinValue 当"我不认识这个键"的哨兵 (Effect.cs:424)
const FLOAT_MIN_VALUE = -3.4028234663852886e38

// 预制体表 = 上游 Database.effectDict 的那一块。GetEffect 返回 null 表示查不到 (调用方据此抛, 照搬上游)。
export interface EffectTable {
  getEffect(id: number): Effect | null
}

// Effect.cs:120 与 :165-171 在 C# 里直接读 Database.instance。这里换成模块级接缝, 装载预制体表时由
// app 层调一次 (见 game/app/content.js); 显式传 table 的入口 (parse/getEffect) 不受影响。
let CURRENT_TABLE: EffectTable = { getEffect: () => null }
export const setEffectTable = (table: EffectTable): void => { CURRENT_TABLE = table }
// effect-judge 的 TryGetPostProcessEffects / DefaultAbility 要按 id 查预制体表 (上游直接读 Database.instance)。
export const currentEffectTable = (): EffectTable => CURRENT_TABLE

export class Effect {
  static readonly DATA_COL = 7

  // source / sourcePet / invokeUnit 在 C# 里是 object/BattlePet —— 这里留成 unknown 接缝,
  // 类型等 battle/state.ts 立起来再收窄 (上游也把它们当不透明对象往下传)。
  source: unknown = null
  sourcePet: unknown = null
  invokeUnit: unknown = null

  id: number
  timing: EffectTiming
  priority: number
  target: EffectTarget
  condition: EffectCondition
  condOptionDictList: Options[]
  ability: EffectAbility
  abilityOptionDict: Options

  // Effect.cs:43-62 的七参构造。`_condition_option === null` 时**压入一个空字典**而不是留空列表,
  // 这个区别会被 GetRawCondtionOptionString 读到 (空列表 → FirstOrDefault() 为 undefined → "none",
  // 与"有一个空字典"结果相同, 但 condOptionDictList.Select(...) 的**长度**在别处可观测)。
  constructor(
    timing: EffectTiming,
    priority: number,
    target: EffectTarget,
    condition: EffectCondition,
    condOptionDictList: Options[] | null,
    ability: EffectAbility,
    abilityOptionDict: Options | null,
    id = 0,
  ) {
    this.source = null
    this.timing = timing
    this.priority = priority
    this.target = target
    this.condition = condition
    this.condOptionDictList = condOptionDictList ?? [new Map()]
    this.ability = ability
    this.abilityOptionDict = abilityOptionDict ?? new Map()
    this.id = id
  }

  // Effect.cs:64-74 拷贝构造 —— 只拷 7 列 + id, **不拷** source/sourcePet/invokeUnit/isSelect。
  clone(): Effect {
    const e = new Effect(this.timing, this.priority, this.target, this.condition, null, this.ability, null, this.id)
    e.condOptionDictList = this.condOptionDictList.map((x) => new Map(x))
    e.abilityOptionDict = new Map(this.abilityOptionDict)
    return e
  }

  // Effect.cs:20-21 —— target_type 缺省 'none', 按 '_' 切; 一个字符串都能切出 ['none']。
  get targetType(): string[] { return dictGet(this.abilityOptionDict, 'target_type', 'none')!.split('_') }
  get targetFilter(): string { return dictGet(this.abilityOptionDict, 'target_filter', 'none')! }
  // Effect.cs:24-25: type 与 ability 是同一个东西的两个名字 (type 只是个别名)
  get type(): EffectAbility { return this.ability }
  get isSelect(): boolean { return this.targetType.includes('index') }

  // Effect.cs:94-98
  getRawEffectStringArray(): string[] {
    return [
      timingToRaw(this.timing), String(this.priority), targetToRaw(this.target),
      conditionToRaw(this.condition), this.getRawConditionOptionString(), abilityToRaw(this.ability),
      this.getRawAbilityOptionString(),
    ]
  }

  // Effect.cs:100-104 —— 判空只看**第一个**条件字典 (FirstOrDefault()?.Count ?? 0),
  // 所以「[{},{a=1}]」这种畸形会整体输出成 none, 后面的字典被吞。原样保留。
  getRawConditionOptionString(): string {
    const first = this.condOptionDictList.length ? this.condOptionDictList[0] : null
    if (!first || first.size === 0) return 'none'
    return concatToString(
      this.condOptionDictList.map((cond) => concatToString([...cond].map(([k, v]) => k + '=' + v), '&')),
      '|',
    )
  }

  // Effect.cs:106-116 —— 先拷一份再 Remove, **不改原表** (调用点是渲染/回写路径, 改了就污染预制体)。
  getRawAbilityOptionString(excludeKeys: string[] | null = null): string {
    if (this.abilityOptionDict.size === 0) return 'none'
    const dict = new Map(this.abilityOptionDict)
    if (!isEmpty(excludeKeys)) excludeKeys!.forEach((x) => dict.delete(x))
    return concatToString([...dict].map(([k, v]) => k + '=' + v), '&')
  }

  // Effect.cs:118-122 —— 查不到就 null; 查到了给一份拷贝。
  static getEffect(id: number, table: EffectTable): Effect | null {
    const e = table.getEffect(id)
    return e === null ? null : e.clone()
  }

  // Effect.cs:124-146 Parse。四个可观测点, 全部按上游抛法保留:
  //   · value 为 null → null (不抛);
  //   · 剥不掉外层圆括号 → TrimParenthesesLoop 给 null → null;
  //   · id 不是整数 → int.Parse 抛;
  //   · id 是整数但表里没有 → 上游对 null 调 Format ⇒ NullReferenceException。
  static parse(value: string | null, table: EffectTable): Effect[] | null {
    if (value === null) return null
    const split = trimParenthesesLoop(value, '(', ')')
    if (split === null) return null
    const effects: Effect[] = []
    for (const item of split) {
      const startIndex = item.indexOf('{')
      const id = item.slice(0, startIndex === -1 ? item.length : startIndex)
      const options = trimParenthesesLoop(item, '{', '}')
      const r = Effect.getEffect(parseIntOrThrow(id), table)
      if (r === null) throw new TypeError(`NullReferenceException: Effect.Parse 引用了不存在的预制体 id=${id} ("${value}")`)
      r.format(options)
      effects.push(r)
    }
    return effects
  }

  // Effect.cs:148-152 TryParse —— 返回值由「能不能剥圆括号」决定, 与解析成不成功无关:
  // "(1002)" 与 "abc" 都返回 false, 但前者的 effects 是**有效列表**。别把它当"校验成功"用。
  static tryParse(value: string, table: EffectTable): { ok: boolean; effects: Effect[] | null } {
    const effects = Effect.parse(value, table)
    return { ok: tryTrimParentheses(value, '(', ')').ok, effects }
  }

  // Effect.cs:207-217 Format —— `{i}` 同时替换 **键和值** (键也替! 上游 ToDictionary 两边都 Replace),
  // i 是实参列表的下标, 而列表来自 `TrimParenthesesLoop('{','}')` —— 所以
  // `1002{buff=3&2=4&5=6}` 只有一个实参 `{0}`, 预制体的键 `{0}` 整块变成 "buff=3&2=4&5=6",
  // 而值里的 `{1}`… 保持字面。这条已在真二进制上实测 (tools/oracle-cs → dbprobe)。
  format(options: string[] | null): void {
    if (isEmpty(options)) return
    options!.forEach((value, i) => {
      const token = '{' + i + '}'
      this.condOptionDictList = this.condOptionDictList.map(
        (x) => toDictionaryStrict([...x].map(([k, v]) => [k.replaceAll(token, value), v.replaceAll(token, value)])),
      )
      this.abilityOptionDict = toDictionaryStrict(
        [...this.abilityOptionDict].map(([k, v]) => [k.replaceAll(token, value), v.replaceAll(token, value)]),
      )
    })
  }

  // Effect.cs:159-180 SetEffects —— 把「常驻的 set_skill(type=effect)」就地**展开成它引用的效果**,
  // 其它原样留下; value 为空则整条丢弃。技能表装载时靠这一步把嵌套的常驻壳剥掉。
  static setEffects(effects: Effect[], formatAbility: EffectAbility = EffectAbility.SetSkill): Effect[] {
    const out: Effect[] = []
    for (const e of effects) {
      if (e.timing === EffectTiming.Resident && e.ability === formatAbility && dictGet(e.abilityOptionDict, 'type') === 'effect') {
        const value = dictGet(e.abilityOptionDict, 'value')
        if (value === null || value === '') continue
        const parsed = Effect.parse(value, CURRENT_TABLE)
        if (parsed === null) throw new TypeError(`Effect.Parse("${value}") 返回 null —— 常驻壳里的 value 必须是 (…) 形状`)
        out.push(...parsed)
      } else {
        out.push(e)
      }
    }
    return out
  }

  // Effect.cs:182-185
  static getDefaultEffect(): Effect {
    return new Effect(EffectTiming.None, -1, EffectTarget.None, EffectCondition.None, null, EffectAbility.None, null)
  }

  static getEscapeEffect(table: EffectTable): Effect | null { return Effect.getEffect(-4, table) }

  // Effect.cs:188-197 —— priority 硬编 99999, target 是当前宠, passive 决定 timing 落在
  // OnPassivePetChange(-1) 还是 OnBeforeAttack(6) 上。passive 的值以 **passive.ToString()** 落进 option
  // ⇒ C# 是 "True"/"False" 首字母大写, 不是 JSON 的 true/false。
  static getPetChangeEffect(sourceIndex: number, targetIndex: number, passive: boolean): Effect {
    const abilityOptionDict = new Map<string, string>([
      ['source_index', String(sourceIndex)],
      ['target_index', String(targetIndex)],
      ['passive', passive ? 'True' : 'False'],
    ])
    const phase = passive ? EffectTiming.OnPassivePetChange : EffectTiming.OnBeforeAttack
    return new Effect(phase, 99999, EffectTarget.CurrentPet, EffectCondition.None, null, EffectAbility.PetChange, abilityOptionDict)
  }

  setTiming(timing: EffectTiming): void { this.timing = timing }

  // Effect.cs:391-431 —— 效果自身的标识符 ("timing"/"ability(...)" 两族)。
  // 兜底是 **float.MinValue = -3.4028235E+38**, TryGet 拿它判"这个键我认不认";
  // 换成 -Number.MAX_VALUE 会在对拍里差一个数量级, 所以写死 C# 的那个值。
  getEffectIdentifier(id: string, resolveNum: (s: string) => number): number {
    const t = tryTrimStart(id, 'timing')
    if (t.ok) {
      if (t.trim === '') return f(this.timing)
      // 上游把 out 写回同一个 trimId ⇒ 括号是 Helper 的 TrimParentheses 剥的, 比较用剥完的内容。
      // 这一支**显式给了** '(' ')' (Effect.cs:398), 与下面 ability 那支不是同一套字符。
      const p = tryTrimParentheses(t.trim, '(', ')')
      if (p.ok) return this.timing === toEffectTiming(p.trim) ? 1 : 0
      return 0
    }

    const a = tryTrimStart(id, 'ability')
    if (a.ok) {
      if (a.trim === '') return f(this.ability)
      if (a.trim === `(${abilityToRaw(this.ability)})`) return 1
      // Effect.cs:412 的这句是 `trimExpr.TryTrimParentheses(out trimExpr)` —— **不带**字符实参,
      // 于是吃的是 Helper.cs:85 的缺省 '[' ']'。与上面 timing 那支 (Effect.cs:398 显式给 '(' ')')
      // 不是一套。所以 `ability(rage)` 剥不动、直接落到末尾的 `return 0`; 只有 `ability[型:值]`
      // 真会去查 abilityOptionDict。写成圆括号会让整族判定反过来。
      const p = tryTrimParentheses(a.trim)
      if (p.ok) {
        const split = p.trim.split(':')
        // 单冒号那支把 option 值交给 Identifier.GetNumIdentifier —— 键不存在时上游拿到 null
        // 立刻 NullReferenceException, JS 这边同样在 resolveNum 里炸, 不做静默兜 0。
        if (split.length === 1) return resolveNum(dictGet(this.abilityOptionDict, split[0])!)
        return dictGet(this.abilityOptionDict, split[0]) === split[1] ? 1 : 0
      }
      return 0
    }

    return FLOAT_MIN_VALUE
  }

  tryGetEffectIdentifier(id: string, resolveNum: (s: string) => number): { ok: boolean; value: number } {
    const value = this.getEffectIdentifier(id, resolveNum)
    return { ok: value !== FLOAT_MIN_VALUE, value }
  }
}

// ── 预制体表 (game/data/unity/effects.json 的 prefabs) → EffectTable ─────────────
// options/condOptions 是**有序 pair 数组**而不是对象, 原因见 build-unity-data.mjs 的 optPairs 注释
// (数字串键 "2"/"5" 会被 JSON 对象重排, 而反解出的 raw 串按插入序拼)。
export interface PrefabRow {
  id: number
  timingId: number
  priority: number
  targetId: number
  conditionId: number
  condOptions: [string, string][][]
  abilityId: number
  options: [string, string][]
}

export const effectFromRow = (r: PrefabRow): Effect => new Effect(
  r.timingId as EffectTiming, r.priority, r.targetId as EffectTarget, r.conditionId as EffectCondition,
  r.condOptions.map((pairs) => new Map(pairs)), r.abilityId as EffectAbility, new Map(r.options), r.id,
)

export class PrefabTable implements EffectTable {
  private byId = new Map<number, Effect>()
  constructor(rows: PrefabRow[]) { for (const r of rows) this.byId.set(r.id, effectFromRow(r)) }
  // 这一层就是上游的 Database.GetEffect (Database.cs:125-129): **id==0 一律查不到**, 哪怕表里真有 0 号行。
  getEffect(id: number): Effect | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
  get size(): number { return this.byId.size }
}
