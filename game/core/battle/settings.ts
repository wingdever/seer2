// Scene Specific/Battle/BattleSettings.cs 的逐行移植 (+ BattleMode / BattleRule 两张枚举)。
//
// 三处容易写成「我觉得更合理」的地方, 都按上游语义保留:
//   · `isPVP` 读的是 GetSettingsIdentifier("mode"), 而那个键对 Record(-1) **回 PVP(2)**
//     (BattleSettings.cs:19 + :103) ⇒ mode==Record 时 isPVP 为真, 但 mode!=PVP 的字面比较为假。
//     这两个答案在 isAutoOK / isReveal 里被混用, 不能"顺手统一"。
//   · `mode` / `rule` 是 modeId / ruleId 之上的**强转视图**, C# 的 (BattleMode)int 不校验范围
//     ⇒ 表里写 7 就是个 7, 不移植体里偷偷归一到某个已知成员。
//   · `initBuffs` 是一对 **expr 的读写视图** (不是独立字段): getter 每次现解析 initBuffExpr,
//     所以 BattleState 构造里 `stateBuffs = settings.initBuffs` 拿到的是**全新对象**, 与 settings 脱钩。
//
// headless 纪律: 上游 `seed = (int)DateTime.Now.Ticks` 与 `isReveal` 的 PhotonNetwork 房规都拿不到
// 进程外答案 (前者是墙钟, 后者在 PVP 之外被 `||` 短路掉), 一律改成显式入参 / 接缝, 不做静默兜底。

import { Buff } from '../buff/buff.ts'
import { parseConditionFilter, type IdResolver } from '../parser/parser.ts'
import { concatToString, parseIntOrThrow, trimParenthesesLoop } from '../strutil.ts'
import { atIndex } from '../collections.ts'

// BattleSettings.cs:184-194 —— Record = -1 不是"没有模式", 它在 GetSettingsIdentifier 里被当 PVP 读。
export const BattleMode = {
  Record: -1, Normal: 0, SelfSimulation: 1, PVP: 2, SPT: 3, Special: 4, YiTeRogue: 5, Card: 6,
} as const
export type BattleMode = (typeof BattleMode)[keyof typeof BattleMode]

// BattleSettings.cs:203-207 —— Anger 是 0, 于是 BattleRule 的 default 分支 (=0) 与 Anger 重合。
export const BattleRule = { Anger: 0, PP: 1 } as const
export type BattleRule = (typeof BattleRule)[keyof typeof BattleRule]

const INT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— "这个键我不认"的哨兵

/** BattleSettings.cs:136-158 的 Condition 需要的外部世界: GameManager 的调试开关 + PVP 房规。 */
export interface SettingsHost {
  debugMode(): boolean
  /** PhotonNetwork.CurrentRoom.CustomProperties["reveal"] —— 只在 mode==PVP 时才被求值 */
  pvpReveal(): boolean
}

let HOST: SettingsHost = { debugMode: () => false, pvpReveal: () => { throw new Error('PVP 房规不可用 (围栏内不做 PVP)') } }
export const setSettingsHost = (h: Partial<SettingsHost>): void => { HOST = { ...HOST, ...h } }

/** BattleSettings.cs:130-134 的过滤器作用域 —— 上游是 Pet, 这里只要求宠侧提供 identifier 读。 */
export interface PetIdentifierView {
  id: number
  tryGetPetIdentifier(id: string): { ok: boolean; num: number }
}

/** 构造入参: XML 表里能落的那批字段 (mode/rule 走 id, 与 [XmlElement] 一致)。 */
export interface BattleSettingsFields {
  seed: number; isMod: boolean; isSimulate: boolean; isEscapeOK: boolean; isCaptureOK: boolean
  isItemOK: boolean; captureLevel: number; petCount: number; parallelCount: number
  starLimit: number; filterLimit: string | null; filterLimitDesc: string | null
  time: number; bgm: string | null; modeId: number; ruleId: number; weather: number; initBuffExpr: string | null
}

/** BattleSettings.cs:145 的 PetInfo.IsMod。 */
const petInfoIsMod = (id: number): boolean => id < 0

export class BattleSettings {
  seed = 0
  isMod = false
  isSimulate = false
  isEscapeOK = true
  isCaptureOK = false
  isItemOK = true
  captureLevel = 1

  petCount = 6
  parallelCount = 1
  starLimit = 0
  filterLimit: string | null = null
  filterLimitDesc: string | null = null

  time = 10
  bgm: string | null = null
  modeId = 0
  ruleId = 0
  weather = 0
  initBuffExpr: string | null = null

  // BattleSettings.cs:19 —— 走 identifier 视图 ⇒ Record 也算 PVP。
  get isPVP(): boolean { return this.getSettingsIdentifier('mode') === BattleMode.PVP }
  get isAutoOK(): boolean { return !this.isPVP && this.parallelCount <= 1 && this.mode !== BattleMode.Card }
  get isReveal(): boolean { return this.mode !== BattleMode.PVP || HOST.pvpReveal() }
  get isLimited(): boolean { return this.starLimit > 0 || (this.filterLimit !== null && this.filterLimit !== '') }

  get mode(): BattleMode { return this.modeId as BattleMode }
  set mode(v: BattleMode) { this.modeId = v }
  get rule(): BattleRule { return this.ruleId as BattleRule }
  set rule(v: BattleRule) { this.ruleId = v }

  // 上游无参构造取墙钟; 移植体把 seed 交给调用方 (S4 的同种子重放正是靠它)。
  constructor(init: Partial<BattleSettingsFields> = {}) {
    Object.assign(this, init)
  }

  // BattleSettings.cs:76-97 拷贝构造 —— 逐字段照抄, 注意**不拷** isPVP/isAutoOK/isReveal/isLimited
  // (它们是属性, 每次现算) 也不拷 initBuffs (只拷 initBuffExpr 原文, getter 现解析)。
  static from(rhs: BattleSettings): BattleSettings {
    const s = new BattleSettings()
    s.seed = rhs.seed
    s.isMod = rhs.isMod
    s.isSimulate = rhs.isSimulate
    s.isEscapeOK = rhs.isEscapeOK
    s.isCaptureOK = rhs.isCaptureOK
    s.isItemOK = rhs.isItemOK
    s.mode = rhs.mode
    s.rule = rhs.rule
    s.weather = rhs.weather
    s.petCount = rhs.petCount
    s.parallelCount = rhs.parallelCount
    s.starLimit = rhs.starLimit
    s.filterLimit = rhs.filterLimit
    s.filterLimitDesc = rhs.filterLimitDesc
    s.time = rhs.time
    s.bgm = rhs.bgm
    s.initBuffExpr = rhs.initBuffExpr
    return s
  }

  // BattleSettings.cs:101-118 —— 兜底 float.MinValue; captureLevel 在未开放捕捉时是 **-1** 而不是原值。
  getSettingsIdentifier(id: string): number {
    switch (id) {
      case 'mode': return this.mode === BattleMode.Record ? BattleMode.PVP : this.modeId
      case 'rule': return this.ruleId
      case 'petCount': return this.petCount
      case 'parallelCount': return this.parallelCount
      case 'starLimit': return this.starLimit
      case 'time': return this.time
      case 'weather': return this.weather
      case 'mod': return this.isMod ? 1 : 0
      case 'simulate': return this.isSimulate ? 1 : 0
      case 'escape': return this.isEscapeOK ? 1 : 0
      case 'item': return this.isItemOK ? 1 : 0
      case 'capture': return this.isCaptureOK ? 1 : 0
      case 'captureLevel': return this.isCaptureOK ? this.captureLevel : -1
      case 'reveal': return this.isReveal ? 1 : 0
      default: return INT_MIN_VALUE
    }
  }

  // BattleSettings.cs:50-54 —— expr ⇄ 列表。setter 的 `x.Value?.id ?? 0` 意味着 null 印记写成 "0",
  // 而 getter 侧 `new Buff(int.Parse(split[1]))` 对 id=0 会查不到表 (getBuffInfo(0) 恒 null) ⇒ 抛。
  // 这是一条**写得出读不回**的往返, 上游同样如此, 不修。
  get initBuffs(): [string, Buff][] {
    const parts = this.initBuffExpr === null ? null : trimParenthesesLoop(this.initBuffExpr, '(', ')')
    if (parts === null) return []
    return parts.map((x) => {
      const split = x.split(':')
      // 上游 split[1] 越界 ⇒ IndexOutOfRangeException (atIndex), 且这段**不在** try 里 ⇒ 整次读取抛出。
      return [split[0], new Buff(parseIntOrThrow(atIndex(split, 1, `BattleSettings.initBuffs: "${x}"`)))]
    })
  }
  set initBuffs(value: [string, Buff][]) {
    this.initBuffExpr = concatToString(value.map((x) => `(${x[0]}:${x[1]?.id ?? 0})`), '')
  }

  // BattleSettings.cs:130-134 —— 上游走 ParseConditionFilter 的**单串**重载, 它对每个 id 调一次
  // `pet.TryGetPetIdentifier ?? Identifier.GetIdentifier`。TS 侧只有批量版重载, 这里按上游单串重载的
  // 原文 (`ids.Select(...)`) 展开, 语义一致。filterLimit 为空 ⇒ trimParenthesesLoop 给 null ⇒ 恒真。
  getBattleLimit(getIdentifier: IdResolver): (pet: PetIdentifierView | null) => boolean {
    return parseConditionFilter<PetIdentifierView | null>(
      this.filterLimit,
      (ids, pet) => ids.map((x) => {
        const r = pet?.tryGetPetIdentifier(x)
        return r && r.ok ? r.num : getIdentifier(x)
      }),
    )
  }

  // BattleSettings.cs:136-159 —— 判定顺序即语义: debugMode 最先, 其次 isSimulate/null, 然后 mod, 然后 star,
  // 最后才是 filterLimit。message 在**每一条**失败支上各自赋一次, 成功时是 null ⇒ 返回二元组。
  // star 由调用方从宠表取 (上游是 pet.info.star), 移植体不把宠表拖进这一层。
  condition(pet: PetIdentifierView | null, star: number, getIdentifier: IdResolver): { ok: boolean; message: string | null } {
    if (HOST.debugMode()) return { ok: true, message: null }
    if (this.isSimulate || pet === null) return { ok: true, message: null }

    if (!this.isMod && this.isLimited && petInfoIsMod(pet.id)) {
      return { ok: false, message: '无法使用Mod精灵进行本体关卡的挑战哦\n<color=#ffbb33>橘色名字</color>的是Mod精灵' }
    }
    if (this.starLimit > 0 && star > this.starLimit) {
      return { ok: false, message: `不能携带超过<color=#ffbb33>${this.starLimit}星</color>的精灵进行挑战哦` }
    }
    return { ok: this.getBattleLimit(getIdentifier)(pet), message: this.filterLimitDesc }
  }

  // BattleSettings.cs:161-171 —— 逐只过, 第一只失败就带着它的 message 返回; 全过则 message 归 null。
  conditionAll(pets: (PetIdentifierView | null)[], stars: number[], getIdentifier: IdResolver): { ok: boolean; message: string | null } {
    for (let i = 0; i < pets.length; i++) {
      const r = this.condition(pets[i], stars[i]!, getIdentifier)
      if (!r.ok) return r
    }
    return { ok: true, message: null }
  }

  fixToYiTeRogue(): BattleSettings {
    this.mode = BattleMode.YiTeRogue
    this.isSimulate = false
    this.isItemOK = true
    this.petCount = 6
    this.parallelCount = 1
    return this
  }
}
