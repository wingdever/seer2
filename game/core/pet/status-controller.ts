// MVC/Model/Basic/Pet/Battle/PetBattleStatusController.cs + Status.cs:394-520 (BattleStatus) 的移植。
// 这是 S2 数值层里「伤害要吃的那两口」的出处: UnitSkillSystem 通过
//   statusController.GetCurrentStatus(skill.powerup, skill.powerdown) 取攻防值,
//   statusController.GetCurrentPowerup(...).accuracyBuff 取命中加成,
// 所以它们必须先进对拍, 伤害公式才有资格谈一致。
//
// 移植纪律: **headless**。上游满屏的 `parent`(BattlePet) 与 buffController 在这里一律不出现 ——
// oracle 能静态调的就是这些纯函数, 把它们抽成显式入参既是对齐 oracle 的需要, 也是 core 的门禁
// (grep UnityEngine|Player.instance 必须为空)。

import { f, toInt, clamp as MathfClamp, max as MathfMax } from '../mathf.ts'
import { Status, getPowerUpBuff, statusMax, statusClamp } from './status.ts'
import type { Linear } from './linear.ts'

export type LinearStatus = Linear<Status>

// Status.cs:399 —— 隐藏六维 (索引 6..11)
export const HIDDEN_TYPE_NAMES = ['hit', 'cri', 'eva', 'cdf', 'rec', 'angrec'] as const
// Status.cs:396 battleTypeNames = typeNames.Concat(hiddenTypeNames) —— 「6 维在前, 隐藏 6 维在后」
export const BATTLE_TYPE_NAMES = ['atk', 'mat', 'def', 'mdf', 'spd', 'hp', ...HIDDEN_TYPE_NAMES] as const

// Status.cs:394-520 BattleStatus —— 继承 Status 再多挂一段 hiddenStatus[6]。
// 两个形状必须照搬:
//   · 索引的**分界是 5/6**, 且范围检查是 IsWithin(0,11) (闭区间, HelperMath.cs:30-56) ——
//     与 getPersonalityBuff 用的半开区间 IsInRange 不是一套;
//   · Get(string) 先在 12 项表里找, 找不到才回落 base.Get —— 所以 "hit" 在这里读到的是**隐藏的命中**
//     (idx 6), 而不是基类 switch 里那个「hp 的别名」。同一个键在两种 Status 上取不同维, 是上游事实。
export class BattleStatus extends Status {
  hidden: number[]

  constructor(normal?: Status | number[], extra?: Status) {
    super(normal === undefined ? [0, 0, 0, 0, 0, 0] : normal instanceof Status ? normal.s : normal)
    if (extra) {
      // Status.cs:498-504 —— 逐位**赋值**而非替换数组, 循环长度恒为 hiddenStatus.Length(=6);
      // extra 短于 6 时 extra[i] 越界, 上游同样是 IndexOutOfRange。
      this.hidden = [0, 0, 0, 0, 0, 0]
      for (let i = 0; i < this.hidden.length; i++) this.hidden[i] = extra.at(i)
    } else {
      // Status.cs:486-496 —— 不带 extra 的两个构造把 rec/angrec 设成 100 (满回复率)
      this.hidden = [0, 0, 0, 0, 100, 100]
    }
  }

  // hidden 与 base 的 s 一样是 float[], 写入一律 f() 窄化 (见 status.ts 构造函数上的说明)。
  get hit(): number { return this.hidden[0] }
  set hit(v: number) { this.hidden[0] = f(v) }
  get cri(): number { return this.hidden[1] }
  set cri(v: number) { this.hidden[1] = f(v) }
  get eva(): number { return this.hidden[2] }
  set eva(v: number) { this.hidden[2] = f(v) }
  get cdf(): number { return this.hidden[3] }
  set cdf(v: number) { this.hidden[3] = f(v) }
  get rec(): number { return this.hidden[4] }
  set rec(v: number) { this.hidden[4] = f(v) }
  get angrec(): number { return this.hidden[5] }
  set angrec(v: number) { this.hidden[5] = f(v) }

  override at(i: number): number { return !(i >= 0 && i <= 11) ? 0 : i <= 5 ? this.s[i] : this.hidden[i - 6] }
  override setAt(i: number, v: number): void {
    if (!(i >= 0 && i <= 11)) return
    if (i <= 5) this.s[i] = f(v)
    else this.hidden[i - 6] = f(v)
  }

  override get(name: string): number {
    const idx = BATTLE_TYPE_NAMES.indexOf(name.toLowerCase() as (typeof BATTLE_TYPE_NAMES)[number])
    if (idx === -1) return super.get(name)
    return idx <= 5 ? this.s[idx] : this.hidden[idx - 6]
  }

  // Status.cs:462-475 —— 与 base 的 Set(string) 不同: 这里**没有** "all"/"hit" 的特判,
  // 只有 12 项表; 未知键静默忽略。所以 BattleStatus.Set("all", x) 什么都不做。
  override setByName(name: string, value: number): void {
    const idx = BATTLE_TYPE_NAMES.indexOf(name.toLowerCase() as (typeof BATTLE_TYPE_NAMES)[number])
    if (idx === -1) return
    if (idx <= 5) this.s[idx] = value
    else this.hidden[idx - 6] = value
  }

  // Status.cs:426-429 —— base 段 + delim + 隐藏段, 两段各自先 FloorToInt
  override toString(delim: string): string {
    return super.toString(delim) + delim + new Status([...this.hidden]).toString(delim)
  }

  getBasicStatus(): Status { return new Status([...this.s]) }
  getHiddenStatus(): Status { return new Status([...this.hidden]) }
}

// PetBattleStatusController.cs:13-14 —— _hp/_maxHp/_anger 是 **int**, 其余是 Status(float[6])。
// 所以 hp 的 clamp 走 Mathf.Clamp(int,int,int), 存取都是整数值; 而 _powerup 是 float,
// 「int 参数写进 float 数组」这层类型差在 JS 里塌缩成同一个 number, 只有截断点需要显式保留。
export class StatusController {
  _initStatus: Status
  _addStatus: Status
  _multStatus: Status
  _hiddenStatus: Status
  _powerup: Status
  _maxPowerUp: Status
  _minPowerUp: Status
  _hp: number
  _maxHp: number
  _anger: number
  _minAnger: number
  _maxAnger: number

  // 构造 #1 (PetBattleStatusController.cs:54-70): 由能力值 Status 起一手新状态。
  // 两处上游不整齐的地方原样保留, 不做"统一":
  //   · _maxPowerUp/_minPowerUp 在这里过 FloorToInt(±6*one), 而构造 #2 (BattleStatus 版) **不过** ——
  //     同一对边界值在两条路径上形状不同, 存档回读走 #2, 新建走 #1;
  //   · _hiddenStatus 直接是 (0,0,0,0,100,100)。
  constructor(normalStatus: Status, initHp: number, initAnger = 20) {
    this._initStatus = Status.copy(normalStatus)
    this._addStatus = Status.zero()
    this._multStatus = Status.one()
    this._hiddenStatus = Status.of6(0, 0, 0, 0, 100, 100)
    this._powerup = new Status()
    this._maxPowerUp = Status.one().timesF(6).floorToInt()
    this._minPowerUp = Status.one().timesF(-6).floorToInt()
    this._hp = toInt(initHp)
    this._maxHp = toInt(normalStatus.hp)
    this._anger = initAnger
    this._minAnger = 0
    this._maxAnger = 100
  }

  // :90-106 拷贝构造 —— 逐字段 new Status(...) 深拷, _hp/_maxHp/_anger 直接抄
  static fromCopy(rhs: StatusController): StatusController {
    const c = new StatusController(rhs._initStatus, 0, rhs._anger)
    c._addStatus = Status.copy(rhs._addStatus)
    c._multStatus = Status.copy(rhs._multStatus)
    c._hiddenStatus = Status.copy(rhs._hiddenStatus)
    c._powerup = Status.copy(rhs._powerup)
    c._maxPowerUp = Status.copy(rhs._maxPowerUp)
    c._minPowerUp = Status.copy(rhs._minPowerUp)
    c._hp = rhs._hp
    c._maxHp = rhs._maxHp
    c._minAnger = rhs._minAnger
    c._maxAnger = rhs._maxAnger
    return c
  }

  get hp(): number { return MathfClamp(this._hp, 0, this._maxHp) }
  set hp(v: number) { this._hp = MathfClamp(v, 0, this._maxHp) }
  get maxHp(): number { return MathfMax(this._maxHp, 0) }
  set maxHp(v: number) { this._maxHp = MathfMax(v, 0) }
  get anger(): number { return MathfClamp(this._anger, this._minAnger, this._maxAnger) }
  set anger(v: number) { this._anger = MathfClamp(v, this._minAnger, this._maxAnger) }
  get minAnger(): number { return MathfMax(this._minAnger, 0) }
  set minAnger(v: number) { this._minAnger = MathfMax(v, 0) }
  get maxAnger(): number { return MathfMax(this._maxAnger, 0) }
  set maxAnger(v: number) { this._maxAnger = MathfMax(v, 0) }

  // :117-123 GetHiddenStatus —— 只钳 [4]/[5] (rec/angrec) 非负, 命中/暴击/闪避/暴抗**允许负值**。
  getHiddenStatus(): Status {
    const status = Status.copy(this._hiddenStatus)
    status.setAt(4, MathfMax(status.at(4), 0))
    status.setAt(5, MathfMax(status.at(5), 0))
    return status
  }

  get battleStatus(): BattleStatus { return new BattleStatus(this.getCurrentStatus(), this.getHiddenStatus()) }

  // :126-146 GetCurrentPowerup。三条必须照搬:
  //   1) 先按 [_min,_max] 逐维钳、再 FloorToInt —— 所以进下面分支的 x 恒为整值 float (0/±1/±2…);
  //   2) 线性改写之后还要**再 (int) 截断一次**: 乘 mult 加 add 的结果可以是 2.7, 上游收成 2。
  //      注意是 (int) 截断而不是 FloorToInt —— 负数分支两者方向相反 (−2.7 → −2 vs −3);
  //   3) x === 0 那一支是 `x += add_up + add_down` —— 两个 add **都加**, 与正/负支各加自己那一个不同。
  getCurrentPowerup(powerup?: LinearStatus | null, powerdown?: LinearStatus | null): Status {
    const basePowerup = StatusClamp(this._powerup, this._minPowerUp, this._maxPowerUp).floorToInt()
    if ((powerup === null || powerup === undefined) && (powerdown === null || powerdown === undefined)) return basePowerup

    const upMult = powerup?.mult ?? Status.one()
    const upAdd = powerup?.add ?? Status.zero()
    const downMult = powerdown?.mult ?? Status.one()
    const downAdd = powerdown?.add ?? Status.zero()

    return basePowerup.select2((_x, i) => {
      const x = basePowerup.at(i)
      if (x > 0) return toInt(f(f(x * upMult.at(i)) + upAdd.at(i)))
      if (x < 0) return toInt(f(f(x * downMult.at(i)) + downAdd.at(i)))
      return f(x + upAdd.at(i) + downAdd.at(i))
    })
  }

  // :108-115 GetCurrentStatus:
  //   init * PowerUpBuff(currentPowerup) * mult + add, 再逐维 Mathf.Max(.,1) 兜住下限, 最后把 hp 换成**当前 HP**。
  // `status.hp = hp` 读的是属性 hp (已钳到 [0,_maxHp] 的 int), 不是 _initStatus 的那个上限值 ——
  // 所以残血单位的 def/mdf 仍是满的, 只有体力维跟着实际血量走 (GetSkillTypeStatus 的 hp 维由此受影响)。
  getCurrentStatus(powerup?: LinearStatus | null, powerdown?: LinearStatus | null): Status {
    const currentPowerup = this.getCurrentPowerup(powerup, powerdown)
    const status = this._initStatus
      .times(getPowerUpBuff(currentPowerup))
      .times(this._multStatus)
      .plus(this._addStatus)
    const clamped = statusMax(status, Status.one())
    clamped.hp = this.hp
    return clamped
  }

  // :16-24 五个"抄一份出来给人看"的属性 —— 上游每次 get 都 `new Status(私有字段)`, 所以读它们
  // **拿不到活引用**, 改了私有字段再 get 才是新值 (反过来, 改 get 出来的那份不影响控制器)。
  get initStatus(): Status { return Status.copy(this._initStatus) }
  get addStatus(): Status { return Status.copy(this._addStatus) }
  get multStatus(): Status { return Status.copy(this._multStatus) }
  get minPowerUp(): Status { return Status.copy(this._minPowerUp) }
  get maxPowerUp(): Status { return Status.copy(this._maxPowerUp) }
  // :20 `hiddenStatus => GetHiddenStatus()` —— 不是抄字段而是**现算**, 与 powerup/currentStatus 同一类。
  get hiddenStatus(): Status { return this.getHiddenStatus() }

  // :164-175 SetPowerUp —— 写的是**钳过的值**, 不是原值; int 参数先 (int) 再逐维进同一个入口。
  setPowerUpType(type: number, powerup: number): void {
    this._powerup.setAt(type, MathfClamp(powerup, this._minPowerUp.at(type), this._maxPowerUp.at(type)))
  }
  setPowerUp(powerup: Status): void {
    for (let i = 0; i < Status.typeNames.length; i++) this.setPowerUpType(i, toInt(powerup.at(i)))
  }
  // :148-152 GetPowerUp —— `(int)powerup[type]` 读的是**属性** (已过 Clamp + FloorToInt), 不是 `_powerup` 裸字段。
  // 差别在 min>max 的鬼值上才暴露: 裸字段给 0, 属性给 9 (上面那条 getPowerUp 向量拍的就是它)。
  getPowerUpType(type: number): number { return toInt(this.powerup.at(type)) }
  get powerup(): Status { return this.getCurrentPowerup() }
  get currentStatus(): Status { return this.getCurrentStatus() }

  // :153-162 GetStatusIdentifier —— "init"/"base" 前缀链 + 兜底 battleStatus[id]。
  // base 那一支上游读 parent.info.basic.baseStatus (实例数据), 这里做成显式注入的回调, 保持 headless。
  getStatusIdentifier(id: string, baseStatus?: (name: string) => number): number {
    if (id.startsWith('init')) return this._initStatus.get(id.slice(4))
    if (id.startsWith('base')) return baseStatus ? baseStatus(id.slice(4)) : 0
    return this.battleStatus.get(id)
  }

  // ── 突变器 (PetBattleStatusController.cs:177-249) ──────────────────────
  // 五个"看着对称其实不对称"的点, 每条都在 statusctrl 向量和 status-controller.test.ts 里锁住:
  //   · MultInitStatus 的 `int type` 是**收而不读** (`_initStatus *= multAmount` 整条乘),
  //     而 MultCurrentStatus 是**逐维** (`_multStatus[type] *= multAmount`) —— 同一个动词, 两种作用域;
  //   · AddBattleStatus 用 type 与 `Status.typeNames.Length`(=6) 比大小, 小于走 add 段、否则**减 6** 走隐藏段;
  //   · Add*/Mult* 全是**就地 +=**（float 数组), 而 AddInitStatus(Status) 是 `+` 出新表再赋回 ——
  //     引用会不会外泄给拿着 `_initStatus` 旧引用的人, 两条路径的答案相反;
  //   · SetMin/MaxPowerUp **不钳、不截、不检查** (直接写字段), 与 SetPowerUp 的 Clamp 形成对比;
  //     而且它们**没有下限次序**: 把 min 设得比 max 大, GetCurrentPowerup 的 Mathf.Clamp 会给出
  //     一个"上界小于下界"的鬼值 (Unity 的 Clamp(int,int,int) 在 max<min 时返回 min)。
  multInitStatus(type: number, multAmount: number): void {
    void type // 上游这个参数从头到尾没被读过 (PetBattleStatusController.cs:210-213)。
    this._initStatus = this._initStatus.timesF(multAmount)
  }

  addInitStatus(status: Status): void {
    this._initStatus = this._initStatus.plus(status)
  }

  addInitStatusType(type: number, addAmount: number): void {
    this._initStatus.setAt(type, this._initStatus.at(type) + addAmount)
  }

  addCurrentStatus(type: number, addAmount: number): void {
    this._addStatus.setAt(type, this._addStatus.at(type) + addAmount)
  }

  addHiddenStatus(type: number, addAmount: number): void {
    this._hiddenStatus.setAt(type, this._hiddenStatus.at(type) + addAmount)
  }

  addBattleStatus(type: number, addAmount: number): void {
    const basicTypeLength = Status.typeNames.length
    if (type < basicTypeLength) { this.addCurrentStatus(type, addAmount); return }
    this.addHiddenStatus(type - basicTypeLength, addAmount)
  }

  multCurrentStatus(type: number, multAmount: number): void {
    this._multStatus.setAt(type, this._multStatus.at(type) * multAmount)
  }

  setMinPowerUpType(type: number, min: number): void { this._minPowerUp.setAt(type, min) }
  setMinPowerUp(minPowerup: Status): void {
    for (let i = 0; i < Status.typeNames.length; i++) this.setMinPowerUpType(i, toInt(minPowerup.at(i)))
  }

  setMaxPowerUpType(type: number, max: number): void { this._maxPowerUp.setAt(type, max) }
  setMaxPowerUp(maxPowerup: Status): void {
    for (let i = 0; i < Status.typeNames.length; i++) this.setMaxPowerUpType(i, toInt(maxPowerup.at(i)))
  }

  // :202-206 AddPowerUp —— 读的是**属性** `powerup` (已钳 + FloorToInt), 不是 `_powerup` 裸字段,
  // 所以"越界的当前增幅"会先被夹回来再加, 加完还要再过一次 SetPowerUp 的钳。
  addPowerUp(type: number, addAmount: number): void {
    this.setPowerUpType(type, toInt(this.powerup.at(type)) + addAmount)
  }
}

// Status.cs:236-239 Status.Clamp —— 逐维 Mathf.Clamp(value[i], min[i], max[i])。
// 用 status.ts 的 statusMax 同族实现, 但 Clamp 在 status.ts 里叫 statusClamp; 这里重导一个别名
// 是为了让本文件的读法与 C# 原文一致 (StatusClamp(x, min, max)), 少一层心智转换。
import { statusClamp as StatusClampImpl } from './status.ts'
const StatusClamp = StatusClampImpl
