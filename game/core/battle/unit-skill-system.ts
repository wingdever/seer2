// Scene Specific/Battle/UnitComponent/UnitSkillSystem.cs 的逐行移植 —— 「这一个出手位当前攒下的账」。
//
// 这个类是**回合内的临时账本**: Unit 按 parallelCount 建一排它, 每个出手位一本。
// 上游 CalculateAccuracy / PrepareDamageParam / CalculateDamage 三个算法已经在 S2 搬成显式入参的
// 纯函数 (damage.ts), 这里**不重复移植**, 只搬挂在实例上的那半边: 字段、累加器、重置时机、
// 拷贝构造与 identifier 读写。Unit 的方法把纯函数接上自己的字段。
// 唯一的例外是 `prepareDamageParam` 实例方法 (内核批二 SetSkill 的 reset_param 要它): 算法仍走
// damage.ts, 这里只补**守卫形状** —— 上游只有 `skill == null` 一道早退, 入参宠是直接解引用的,
// 而 damage.ts 那份纯函数为了 phase.ts 的调用点把 null 收成了"什么都不写"。
//
// 四处最容易「顺手改合理」的地方, 全按上游留着:
//   · OnTurnStart 与 OnChainStart 的**重置集不同**: 前者清空 skill/counterSkill/isCounter 与两本 dict,
//     后者只清 skill* 那批并**保留** damageDict 里非 "skill" 前缀的条目 (Where + ToDictionary 重建,
//     于是键的插入序按原序保留)。抄成同一个函数, 连锁技的第二击就会把第一击的印记伤害抹掉。
//   · totalXxxDamage = 专用字段 + `GetTypeDamage(前缀)`, 而 GetTypeDamage 对每条 **取 max(v,0)**,
//     GetTypeHeal 则**不取** —— 治疗可以是负的并原样进合计。这条不对称是表意, 不是漏写。
//   · 伤害键 "skill"/"item"/"buff" 走 GetSkillSystemIdentifier 时**不**进 switch 的三个 case:
//     "skill" ⇒ SkillDamage (只有专用字段, 不加 dict), "item"/"buff" ⇒ total* 合计。所以
//     `damage[skill]` 与裸 `damage` (=totalSkillDamage) 读出来的数可以不一样。
//   · 六个 float 字段 (level/atk/def/weatherBuff/sameElementBuff/elementRelation) 在 C# 是 float,
//     所以任何写入都收窄 —— 这里一律做成 fround 访问器, 与 Buff.value 的夹紧访问器同一个纪律。
//
// headless 纪律: `Skill.GetSkill(skill.id)` / `Skill.GetNoOpSkill()` 走 views.ts 的表接缝;
// SetSkillIdentifier (Skill.cs:635-723) 属算子那一批, 内核批二起已随 views.ts 落地。

import { f, max as MathfMax, toInt } from '../mathf.ts'
import { tryTrimParentheses, tryTrimStart } from '../strutil.ts'
import { dictGet } from '../collections.ts'
import { getSkill, isNullOrEmptySkill, noOpSkill, cloneSkill, setSkillIdentifier, type SkillRecord } from './views.ts'
import { prepareDamageParam as damagePrepareDamageParam } from './damage.ts'
import type { ComboHit } from './damage.ts'
import type { StatusController } from '../pet/status-controller.ts'

const FLOAT_MIN_VALUE = -3.4028234663852886e38   // float.MinValue —— "这个键我不认"的哨兵

/** UnitSkillSystem.ComboDamageInfo —— 与 damage.ts 的 ComboHit 同一个形状, 不再造第二个类型。 */
export type ComboDamageInfo = ComboHit

/** UnitSkillSystem.cs:174-185 的两个入参宠 —— 只声明这个方法真要读的字段 (与 damage.ts 同形状)。 */
export type DamageAtkPet = { level: number; statusController: StatusController; battleElement: number; subBattleElement: number; star: number }
export type DamageDefPet = { statusController: StatusController; battleElement: number; subBattleElement: number }

// 六个 float 字段的存储: 写入即收窄。用 symbol-free 的私有下划线字段, 与 Buff._value 同风格。
export class UnitSkillSystem {
  // UnitSkillSystem.cs:10 —— 上游是个 static 属性 (每次 new 一个数组), 这里给常量表即可:
  // 调用点是效果层判「这一击算不算常规伤害」, 不改它。
  static readonly NORMAL_HP_TYPE = ['skill', 'item', 'buff']

  skill: SkillRecord | null = null
  counterSkill: SkillRecord | null = null

  _level = 0
  _atk = 0
  _def = 0
  _weatherBuff = f(1)
  _sameElementBuff = f(1)
  _elementRelation = f(1)

  get level(): number { return this._level }
  set level(v: number) { this._level = f(v) }
  get atk(): number { return this._atk }
  set atk(v: number) { this._atk = f(v) }
  get def(): number { return this._def }
  set def(v: number) { this._def = f(v) }
  get weatherBuff(): number { return this._weatherBuff }
  set weatherBuff(v: number) { this._weatherBuff = f(v) }
  get sameElementBuff(): number { return this._sameElementBuff }
  set sameElementBuff(v: number) { this._sameElementBuff = f(v) }
  get elementRelation(): number { return this._elementRelation }
  set elementRelation(v: number) { this._elementRelation = f(v) }

  isCounter = false
  isHit = true
  isCritical = false
  comboDamageInfoList: ComboDamageInfo[] = []

  // damage to op, buff damage to me, heal to me. —— 键是来源 ("skill"/"buff-1003"/自由串)
  damageDict = new Map<string, number>()
  healDict = new Map<string, number>()

  skillDamage = 0
  skillHeal = 0
  skillOverHeal = 0
  itemDamage = 0
  itemHeal = 0
  itemOverHeal = 0
  buffDamage = 0
  buffHeal = 0

  // UnitSkillSystem.cs:49-52 —— 无参构造**就是**一次 OnTurnStart (字段初值 + 清零)。
  constructor() { this.onTurnStart() }

  // UnitSkillSystem.cs:54-82 拷贝构造。三点要紧:
  //   · skill/counterSkill 走 new Skill(rhs) ⇒ **深拷** (含 Effect.SetEffects 的常驻壳展开);
  //   · comboDamageInfoList 是 `new List(rhs)` ⇒ 结构体元素按值复制, 这里逐条拷;
  //   · 读的是**字段**而不是属性: skillDamage/buffDamage/... 直接抄, 不经 SkillDamage 的 max(.,0)。
  static from(rhs: UnitSkillSystem): UnitSkillSystem {
    const out = new UnitSkillSystem()
    out.skill = rhs.skill === null ? null : cloneSkill(rhs.skill)
    out.counterSkill = rhs.counterSkill === null ? null : cloneSkill(rhs.counterSkill)
    out._level = rhs._level
    out._atk = rhs._atk
    out._def = rhs._def
    out._weatherBuff = rhs._weatherBuff
    out._sameElementBuff = rhs._sameElementBuff
    out._elementRelation = rhs._elementRelation
    out.isCounter = rhs.isCounter
    out.isHit = rhs.isHit
    out.isCritical = rhs.isCritical
    out.comboDamageInfoList = rhs.comboDamageInfoList.map((x) => ({ damage: x.damage, isCritical: x.isCritical }))

    out.damageDict = new Map(rhs.damageDict)
    out.healDict = new Map(rhs.healDict)

    out.skillDamage = rhs.skillDamage
    out.buffDamage = rhs.buffDamage
    out.itemDamage = rhs.itemDamage

    out.skillHeal = rhs.skillHeal
    out.buffHeal = rhs.buffHeal
    out.itemHeal = rhs.itemHeal

    out.skillOverHeal = rhs.skillOverHeal
    out.itemOverHeal = rhs.itemOverHeal
    return out
  }

  // UnitSkillSystem.cs:34-36 —— 三个「只读非负」视图。
  get skillDamageClamped(): number { return MathfMax(this.skillDamage, 0) }
  get itemDamageClamped(): number { return MathfMax(this.itemDamage, 0) }
  get buffDamageClamped(): number { return MathfMax(this.buffDamage, 0) }

  // :38-40 —— 专用字段 + 前缀合计。注意 "skill" 那支加的是**夹紧后**的 SkillDamage。
  get totalSkillDamage(): number { return this.skillDamageClamped + this.getTypeDamage((k) => k.startsWith('skill')) }
  get totalItemDamage(): number { return this.itemDamageClamped + this.getTypeDamage((k) => k.startsWith('item')) }
  get totalBuffDamage(): number { return this.buffDamageClamped + this.getTypeDamage((k) => k.startsWith('buff')) }

  // :42-44 —— 治疗**不**夹紧 (与 damage 侧的不对称)。
  get totalSkillHeal(): number { return this.skillHeal + this.getTypeHeal((k) => k.startsWith('skill')) }
  get totalItemHeal(): number { return this.itemHeal + this.getTypeHeal((k) => k.startsWith('item')) }
  get totalBuffHeal(): number { return this.buffHeal + this.getTypeHeal((k) => k.startsWith('buff')) }

  // :46-47 —— `damage`/`heal` 只算 skill+item 两族, **不含 buff**。上游就这么写的。
  get damage(): number { return this.totalSkillDamage + this.totalItemDamage }
  get heal(): number { return this.totalSkillHeal + this.totalItemHeal }

  // :84-91 —— 只认 "counter", 其余 (含 null) 一律落到 skill。
  getSkillByKey(key: string | null): SkillRecord | null {
    return key === 'counter' ? this.counterSkill : this.skill
  }

  // :93-97 —— 两侧都补一份新空过技 (不是共享引用)。
  ensureSkillNotNull(): void {
    this.skill ??= noOpSkill()
    this.counterSkill ??= noOpSkill()
  }

  // :99-107 —— 两条过滤链的**唯一**差别是 max(v,0)。Sum 在 .NET 里对 int 序列走 int 累加。
  getTypeDamage(filter: (key: string) => boolean): number {
    let sum = 0
    for (const [k, v] of this.damageDict) if (filter(k)) sum += MathfMax(v, 0)
    return sum
  }

  getTypeHeal(filter: (key: string) => boolean): number {
    let sum = 0
    for (const [k, v] of this.healDict) if (filter(k)) sum += v
    return sum
  }

  // :109-127 —— 全清。
  onTurnStart(): void {
    this.skill = null
    this.counterSkill = null

    this.level = 0
    this.atk = 0
    this.def = 0
    this.weatherBuff = 1
    this.sameElementBuff = 1
    this.elementRelation = 1
    this.isCounter = false
    this.isHit = true
    this.isCritical = false
    this.comboDamageInfoList = []

    this.damageDict.clear()
    this.healDict.clear()

    this.skillDamage = 0
    this.itemDamage = 0
    this.buffDamage = 0
    this.skillHeal = 0
    this.itemHeal = 0
    this.buffHeal = 0
    this.skillOverHeal = 0
    this.itemOverHeal = 0
  }

  // :129-150 —— 连击起点: 只清 skill 那一族, **留下** buff/item 的账。
  // 最后那段是「把表里改过的数值参数按技能表**回填**」—— 上游注释掉的分支没有, 照抄。
  onChainStart(): void {
    this.level = 0
    this.atk = 0
    this.def = 0
    this.weatherBuff = 1
    this.sameElementBuff = 1
    this.elementRelation = 1
    this.isHit = true
    this.isCritical = false
    this.comboDamageInfoList = []

    this.skillDamage = 0
    this.skillHeal = 0
    this.skillOverHeal = 0
    this.itemDamage = 0
    this.itemHeal = 0
    this.itemOverHeal = 0

    // Where + ToDictionary ⇒ 非 skill 前缀的条目按原序重建; 重复键在 C# 会抛 ArgumentException,
    // 但这里键唯一是 dict 自己的不变式, 不可能出现重复, 所以不套 toDictionaryStrict。
    this.damageDict = new Map([...this.damageDict].filter(([k]) => !k.startsWith('skill')))
    this.healDict = new Map([...this.healDict].filter(([k]) => !k.startsWith('skill')))

    if (!isNullOrEmptySkill(this.skill) && !this.skill!.isAction) {
      const testSkill = getSkill(this.skill!.id)
      this.skill!.critical = f(testSkill!.critical)
      this.skill!.combo = testSkill!.combo
      this.skill!.accuracy = testSkill!.accuracy
      this.skill!.power = testSkill!.power
    }
  }

  // :152-159 —— 反击start时把 skill 交出去当 counterSkill, 自己接过旧的 counterSkill;
  // 非反击start则 counterSkill 换成一张**新**空过 (所以旧反击技在这本账上消失了)。
  swapCounterSkill(isCounterStart: boolean): void {
    this.isCounter = isCounterStart

    const tmp = this.counterSkill
    this.counterSkill = isCounterStart ? this.skill : noOpSkill()
    this.skill = tmp
  }

  // :226-278 —— 兜底 float.MinValue。前缀分支用**方括号** (TryTrimParentheses 的默认对儿)。
  getSkillSystemIdentifier(id: string): number {
    const dmg = tryTrimStart(id, 'damage')
    if (dmg.ok) {
      const p = tryTrimParentheses(dmg.trim)
      if (p.ok) {
        switch (p.trim) {
          case 'item': return f(this.totalItemDamage)
          case 'buff': return f(this.totalBuffDamage)
          case 'skill': return f(this.skillDamageClamped)
          default: return f(dictGet(this.damageDict, p.trim, 0)!)
        }
      }
    }

    const heal = tryTrimStart(id, 'heal')
    if (heal.ok) {
      const p = tryTrimParentheses(heal.trim)
      if (p.ok) {
        switch (p.trim) {
          case 'item': return f(this.totalItemHeal)
          case 'buff': return f(this.totalBuffHeal)
          case 'skill': return f(this.skillHeal)
          default: return f(dictGet(this.healDict, p.trim, 0)!)
        }
      }
    }

    const over = tryTrimStart(id, 'overHeal')
    if (over.ok) {
      const p = tryTrimParentheses(over.trim)
      if (p.ok) {
        switch (p.trim) {
          case 'item': return f(this.itemOverHeal)
          case 'skill': return f(this.skillOverHeal)
          default: return 0
        }
      }
    }

    switch (id) {
      case 'level': return this.level
      case 'atk': return this.atk
      case 'def': return this.def
      case 'weather': return this.weatherBuff
      case 'sameElement': return this.sameElementBuff
      case 'elementRelation': return this.elementRelation
      case 'damage': return f(this.totalSkillDamage)
      case 'heal': return f(this.totalSkillHeal)
      case 'counter': return this.isCounter ? 1 : 0
      case 'hit': return this.isHit ? 1 : 0
      case 'criticalResult': return this.isCritical ? 1 : 0
      default: return FLOAT_MIN_VALUE
    }
  }

  tryGetSkillSystemIdentifier(id: string): { ok: boolean; num: number } {
    const num = this.getSkillSystemIdentifier(id)
    return { ok: num !== FLOAT_MIN_VALUE, num }
  }

  // :286-318 —— default 那支落到**技能**的 identifier, 且 `damage`/`heal` 在这里是写**专用字段**
  // (int 强转), 与读取侧的 total* 完全不是一回事。顺序敏感: 前三个 case 之前没有任何前缀匹配。
  setSkillSystemIdentifier(id: string, num: number, key: string | null = null): void {
    switch (id) {
      default: {
        const skill = this.getSkillByKey(key)
        if (skill === null) throw new TypeError(`NullReferenceException: SetSkillSystemIdentifier("${id}") 时 GetSkillByKey("${key ?? 'null'}") 为 null`)
        setSkillIdentifier(skill, id, num)
        return
      }
      case 'level': this.level = num; return
      case 'atk': this.atk = num; return
      case 'def': this.def = num; return
      case 'weather': this.weatherBuff = num; return
      case 'sameElement': this.sameElementBuff = num; return
      case 'elementRelation': this.elementRelation = num; return
      case 'damage': this.skillDamage = toInt(num); return
      case 'heal': this.skillHeal = toInt(num); return
    }
  }

  /**
   * UnitSkillSystem.cs:174-185 —— SetSkill 算子的 `reset_param` 要的就是这个实例方法。
   * 算法不在这里重写 (damage.ts 那份是权威), 这里只把**守卫**摆回上游的位置:
   *   · 只有 `skill == null` 早退, 入参宠**没有守卫** —— :179 直接读 atkPet.level,
   *     而私有 GetSameElementBuff 里那句 `if (atkPet == null) return 1f` (:189) 永远走不到
   *     (控制流早死在 :179), 所以它是一道**不可达的守卫**, 不能当成"上游容忍 null 宠"的证据;
   *   · defPet 的解引用在 :180 的 GetSkillTypeStatus 里 ⇒ atkPet 先炸。
   * 调用方注意 C# 的实参在**进函数之前**就求值: `PrepareDamageParam(state.atkUnit.pet, …)` 里
   * 的 atkUnit 为 null 时炸的是取 .pet, 而不是这里。
   */
  prepareDamageParam(atkPet: DamageAtkPet | null, defPet: DamageDefPet | null): void {
    if (this.skill === null) return
    if (atkPet === null) throw new TypeError('NullReferenceException: UnitSkillSystem.cs:179 atkPet.level —— PrepareDamageParam 的入参没有守卫')
    const p = damagePrepareDamageParam(this.skill, atkPet, defPet, this.weatherBuff)
    if (p === null) throw new TypeError('NullReferenceException: UnitSkillSystem.cs:180 BattlePet.GetSkillTypeStatus(skill, atkPet, defPet) 的 defPet 为 null')
    // 上游写的是**属性** (level/atk/def/elementRelation/sameElementBuff 全是 float 字段),
    // 这里的访问器同样收窄 ⇒ 逐个赋值即可, 不碰 weatherBuff (上游那一步不动它)。
    this.level = p.level
    this.atk = p.atk
    this.def = p.def
    this.elementRelation = p.elementRelation
    this.sameElementBuff = p.sameElementBuff
  }
}
