// S2 数值层最后一块: 伤害/命中/暴击/先手/捕捉。
// 权威出处 (逐行对照, 不做"我觉得更合理"的改写):
//   BattlePet.cs:145-175            GetSkillTypeStatus   —— 技能类型决定吃哪一维
//   UnitSkillSystem.cs:161-224      CalculateAccuracy / PrepareDamageParam / CalculateDamage
//   DecidePriorityPhase.cs:40-57    GetActionOrder       —— 6 级 LINQ 排序 + 方向反转
//   EffectAbilityHandler.cs:66-106  Capture              —— 捕捉概率分档
//
// headless 纪律: 上游这三处都挂在 BattlePet / Unit / BattleState 实例上, 这里一律改成**显式入参**。
// 这不是简化, 是 oracle 能静态调用的前提 (见 tools/oracle-cs), 也是 core/ 的门禁。

import { f, toInt, ceilToInt, max as MathfMax, sign as MathfSign } from '../mathf.ts'
import { Status, fcmp } from '../pet/status.ts'
import type { StatusController, LinearStatus } from '../pet/status-controller.ts'
import { getElementRelationSub, getSameElementBuff } from '../pet/element.ts'
import { numIdentifier } from '../buff/buff-info.ts'
import { dictTryGet } from '../collections.ts'
import { tryParseFloat } from '../strutil.ts'
import type { Rng } from '../rng.ts'

// SkillType 已下沉到 core/pet/skill.ts (D5 B1 · G9: 域语义枚举住域文件, 引擎只 import 进来)。
import { SkillType } from '../pet/skill.ts'

// Skill.cs:14-58 里 S2 用到的那几个字段。上游是 class, 这里是结构体视图 ——
// 数值语义只在 power(int)/accuracy(int)/critical(float)/combo(int) 的类型差上要紧,
// 所以字段名与类型注释都留着, 别在下游偷偷换算。
export interface SkillView {
  type: number
  power: number            // int
  accuracy: number         // int
  critical: number         // float
  combo: number            // int
  chain: number            // int
  elementId: number        // CSV 里的原始 id, 相克一律用它 (不经过 Element 枚举转换)
  priority: number         // int
  vipriority: number       // int
  isAction: boolean        // 上游是属性 (IsAction()); 算法只在 views.ts 的 isActionSkill 里写一次
  powerup?: LinearStatus | null
  powerdown?: LinearStatus | null
  // 上游是 Dictionary<string,string> ⇒ **有序** (插入序即回写序), 所以是 Map 而不是 Record。
  // views.ts 的 SkillRecord 继承这一形状并把它钉成必带字段; 键查找一律走 dictGet (缺键给 null,
  // 不是 undefined), 否则 `options?.['accuracy']` 这种写法在 Map 上会静默读到 undefined。
  options?: Map<string, string> | null
}

// BattlePet.cs:145-175 GetSkillTypeStatus。
// 上游返回 KeyValuePair<int,int>, 所以**攻防在离开这个函数时就已经被 (int) 截断过一次**;
// 后面 PrepareDamageParam 把它们当 float 用。中间这一步截断是伤害对拍的分叉点之一。
// 形状要点: 造出来的临时 Status 里 spd = (atk+mat)/2、hp = (def+mdf)/2, 而 `/` 是 Status 的
// **乘倒数** (status.ts), 不是除法; 连携/必杀在 atk == mat 时取的是 (spd, hp) 这一对"平均维"。
export function getSkillTypeStatus(skill: SkillView, atkSC: StatusController, defSC: StatusController): [number, number] {
  const lhsStatus = atkSC.getCurrentStatus(skill.powerup, skill.powerdown)
  const rhsStatus = defSC.getCurrentStatus(skill.powerup, skill.powerdown)

  const status = Status.of6(lhsStatus.atk, lhsStatus.mat, rhsStatus.def, rhsStatus.mdf, 0, 0)
  // 注意这里是 **float 属性相加再除以 int 2** —— 普通单精度除法, 不是 Status 的 `/` 乘倒数。
  // (数值上 /2 与 *0.5 恰好同结果, 但形状要写对, 免得后人以为这里也走 Status 运算符)
  status.spd = f(status.atk + status.mat) / 2
  status.hp = f(status.def + status.mdf) / 2

  if (skill.type === SkillType.物理) return [toInt(status.atk), toInt(status.def)]
  if (skill.type === SkillType.特殊) return [toInt(status.mat), toInt(status.mdf)]
  if (skill.type === SkillType.必杀 || skill.type === SkillType.连携) {
    if (status.atk > status.mat) return [toInt(status.atk), toInt(status.def)]
    if (status.atk < status.mat) return [toInt(status.mat), toInt(status.mdf)]
    return [toInt(status.spd), toInt(status.hp)]
  }
  // 属性/被动/道具/换场/逃跑/空过 全部落到这里 —— (0, 1): 打不出伤害, 但除数不能是 0
  return [0, 1]
}

// UnitSkillSystem.cs:174-185 PrepareDamageParam 的产出。
// level = (2*L+10)/250f: 分子是**整数**运算 (2*L+10), 只在除以 250f 时才升为 float,
// 所以这一步是普通 float 除法, 不走 Status 的乘倒数。
// atk/def 过 Mathf.Max(., 1) —— 注意 Unity 的 Max 是严格比较、不成立时返回右值, NaN 也因此被兜成 1。
export interface DamageParam {
  level: number
  atk: number
  def: number
  elementRelation: number
  sameElementBuff: number
  weatherBuff: number
}

export function prepareDamageParam(
  skill: SkillView | null,
  atkPet: { level: number; statusController: StatusController; battleElement: number; subBattleElement: number; star: number } | null,
  defPet: { statusController: StatusController; battleElement: number; subBattleElement: number } | null,
  weatherBuff = 1,
): DamageParam | null {
  if (skill === null || atkPet === null || defPet === null) return null

  const level = f((2 * Math.trunc(atkPet.level) + 10) / 250)
  const status = getSkillTypeStatus(skill, atkPet.statusController, defPet.statusController)
  const atk = MathfMax(status[0], 1)
  const def = MathfMax(status[1], 1)
  const elementRelation = getElementRelationSub(skill.elementId, defPet.battleElement, defPet.subBattleElement)
  const sameElementBuff = getSameElementBuff(atkPet.battleElement, atkPet.subBattleElement, atkPet.star, skill.elementId)
  return { level, atk, def, elementRelation, sameElementBuff, weatherBuff: f(weatherBuff) }
}

// UnitSkillSystem.cs:161-172 CalculateAccuracy。
// 顺序敏感的两处: ① `_random` **先**抽, 再算 accuracy (所以随机序列的消耗点在前面);
// ② 加法链是 float 从左到右, 没有任何一处走 Status 运算符。
// ③ skill.options["accuracy"] 一旦存在就**整体替换** accuracy, 值经 GetNumIdentifier 解析
//    —— 于是 "100" 这种字面量也过一遍标识符链 (兜底链在这里是活的, 不是装饰)。
export function calculateAccuracy(
  skill: SkillView,
  atkPet: { statusController: StatusController; battleStatus: { hit: number } },
  defPet: { battleStatus: { eva: number } },
  rng: Rng,
): { isHit: boolean; accuracy: number; random: number } {
  const random = rng.nextFloat(0, 100)
  const accuracyBuff = atkPet.statusController.getCurrentPowerup(skill.powerup, skill.powerdown).accuracyBuff
  let accuracy = f(f(f(skill.accuracy + accuracyBuff) + atkPet.battleStatus.hit) - defPet.battleStatus.eva)

  const override = skill.options ? dictTryGet(skill.options, 'accuracy') : null
  if (override !== null && override.ok) accuracy = numIdentifier(override.value!)

  return { isHit: accuracy >= random, accuracy, random }
}

export interface ComboHit { damage: number; isCritical: boolean }

// UnitSkillSystem.cs:201-224 CalculateDamage。
// 每一击**先**抽伤害随机 (0.85~1.0, float 左闭右开) **再**抽暴击随机 (0~100) —— 顺序反过来
// 就会让同一局的重放对不上, S4 的「同种子重放逐字节相同」判据第一个踩的就是这里。
// 乘法链逐项都是 float 收窄, 顺序按 C# 原文: ((level*(atk/def)*power)+2) * same * elem * weather * rand * crit。
// `atk / def` 是普通 float 除法 (字段除法, 不是 Status), def=0 时给 Inf 而不是抛。
export function calculateDamage(
  skill: SkillView,
  param: DamageParam,
  atkPet: { battleStatus: { cri: number } },
  defPet: { battleStatus: { cdf: number } },
  rng: Rng,
  hits: ComboHit[] = [],
): { skillDamage: number; isCritical: boolean; hits: ComboHit[] } {
  let skillDamage = 0
  let isCritical = false
  const combo = Math.trunc(skill.combo)
  for (let i = 0; i < combo; i++) {
    const random = rng.nextFloat(0.85, 1)
    const criRandom = rng.nextFloat(0, 100)
    const critKey = f(f(skill.critical + atkPet.battleStatus.cri) - defPet.battleStatus.cdf)
    const isCrit = critKey >= criRandom
    const base = f(f(f(param.level * f(param.atk / param.def)) * skill.power) + 2)
    const dmg = f(f(f(f(f(base * param.sameElementBuff) * param.elementRelation) * param.weatherBuff) * random) * (isCrit ? 2 : 1))
    const damage = ceilToInt(dmg)
    skillDamage += damage
    isCritical ||= isCrit
    hits.push({ damage, isCritical: isCrit })
  }
  return { skillDamage, isCritical, hits }
}

// DecidePriorityPhase.cs:40-57 GetActionOrder。
// 六个排序键按「降/降/降/降/降/升」的字典序比, 等价于上游那条 OrderByDescending×4 + ThenByDescending + ThenBy 链
// (链式 ThenBy 在 LINQ 里就是逐键追加比较, 稳定排序下等价于全键字典序 —— 这条等价性由 oracle 的
//  orderby 向量实测, 不是推测)。
// 两个必须保留的坑:
//   · 第一键给 null 技能算了 -1, 但第二键 `p.Item2.isAction` 紧接着就 NRE —— 上游那条防御是**死代码**,
//     带 null 技能进来必炸。这里照炸 (抛 TypeError), 不"顺手修好"。
//   · 第五键的 negSpeed 来自 state buff 600013 (存在则 -1), 它乘的是** spd 的 float 值 **,
//     所以速度维为负的畸形状态会反转排序方向。
export interface PriorityUnit {
  unitId: number
  cursor: number
  skill: SkillView | null
  pet: { statusController: StatusController } | null
}

// 纯排序: 六键字典序 (前五降、末键升) + 并列保序。
// 单独拆出来只为了一个原因 —— oracle 那边的 LINQ 也只能拿到**算好的键**
// (tools/oracle-cs/Program.cs 的 OrderByKeyVectors), 所以这一层才是两边真正可比的对象;
// 上面那些键怎么从实例里抽出来, 是 S4「同种子重放逐字节相同」管的事。
// ⚠ 这里吃的是**原始值**而不是键: hasSkill 是 0/1, spd 未乘 neg。两个字段级的映射
// (0⇒-1 / 其余⇒0, 以及 spd×neg) 也在函数内做, 这样 oracle 向量可以逐字段原样喂进来,
// 不必在对拍脚本里重写一遍排序键 —— 重写就会分叉。
export interface ActionOrderRow {
  hasSkill: number    // 0 / 1 原始值 (上游是 bool: 有技能⇒键 0, 无⇒键 -1)
  isAction: number    // 1 / 0
  vipriority: number
  priority: number
  spd: number         // float, **未**乘 neg
  neg: number         // ±1, 状态 buff 600013 时为 -1
  rnd: number
  unitId: number
  cursor: number
}

export function sortActionOrder(rows: ActionOrderRow[]): number[] {
  // 比较一律走 fcmp (= Single.CompareTo): LINQ 的 Comparer<float>.Default 用的就是它,
  // 而它把 NaN 判成「比任何数都小」且 NaN 与 NaN **相等**。用 !==/> 写的话, spd 维一旦出现 NaN
  // (状态被 buff 打成 NaN 是可行的) 排序就会和框架分叉 —— 这一条正是orderby向量存在的理由。
  const keys: [number[], number][] = [
    [rows.map(r => (r.hasSkill === 0 ? -1 : 0)), 1], [rows.map(r => r.isAction), 1],
    [rows.map(r => r.vipriority), 1], [rows.map(r => r.priority), 1],
    [rows.map(r => f(r.spd * r.neg)), 1], [rows.map(r => r.rnd), -1],
  ]
  const idx = rows.map((_r, i) => i).sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = fcmp(k[a], k[b])
      if (c !== 0) return dir > 0 ? -c : c
    }
    return a - b
  })
  // (int)(Mathf.Sign(unitId) * (cursor + 1)) —— 符号表示「哪一方」, 绝对值是背包游标+1。
  // Sign(0)=+1 (mathf.ts 实测), 所以 unitId=0 这种畸形单位会站到正侧而不是被抹成 0。
  return idx.map(i => toInt(MathfSign(rows[i].unitId) * (rows[i].cursor + 1)))
}

export function getActionOrder(
  units: PriorityUnit[],
  rng: Rng,
  opts: { negSpeed?: boolean; direction?: number } = {},
): number[] {
  const negSpeed = opts.negSpeed === true ? -1 : 1
  const direction = opts.direction ?? 1

  // 技能为 null 的项: 第一键算 -1, 第二键立刻 NRE (上游形状)。键的**计算顺序**也照上游:
  // 每一级的键先对全部元素算完, 再进下一级 (LINQ 的 GetKeys 是 parent 先、自己后),
  // 所以最后那一路 Random 抽签是按输入顺序抽完、然后才排序。
  const rows: ActionOrderRow[] = units.map(u => {
    const hasSkill = (u.skill === null || u.pet === null) ? 0 : 1
    if (u.skill === null) throw new TypeError('GetActionOrder: skill 为 null 时第二键 isAction → 上游 NRE (DecidePriorityPhase.cs:44)')
    return { hasSkill, isAction: u.skill.isAction ? 1 : 0, vipriority: Math.trunc(u.skill.vipriority), priority: Math.trunc(u.skill.priority),
      spd: 0, neg: negSpeed, rnd: 0, unitId: u.unitId, cursor: u.cursor }
  })
  for (const [i, u] of units.entries())
    rows[i].spd = f(u.pet!.statusController.getCurrentStatus(u.skill!.powerup, u.skill!.powerdown).spd)
  for (const r of rows) r.rnd = rng.nextInt(0, 100)

  const order = sortActionOrder(rows)
  if (direction < 0) order.reverse()
  return order
}

// EffectAbilityHandler.cs:66-106 Capture 的概率部分。
// 上游返回 bool 「效果是否执行」, 而捕捉**成功与否**写进 skill.options["capture_result"];
// baseId == 10 是无条件捕获的特殊怪 (剧情怪), 它排在概率判定**之前**短路。
// 分档用 lostPercent (已损血量比例), 而 value < 100 这一层判断在 buff(-2) 与分档**之外** ——
// 也就是说 prob=100 既不吃 debuff 减半也不吃残血加成, 这是表里写 100 就必抓的原因。
export function captureValue(probText: string, hp: number, maxHp: number, hasCaptureDebuff: boolean): { ok: boolean; value: number; lostPercent: number } {
  const parsed = parseProb(probText)
  if (parsed === null) return { ok: false, value: 0, lostPercent: 0 }
  let value = parsed
  const lostPercent = f(1 - f(f(hp * 1) / maxHp))
  if (value < 100) {
    if (hasCaptureDebuff) value = f(value / 3)
    if (lostPercent <= f(0.25)) value = f(value * f(0.25))
    else if (lostPercent <= f(0.5)) value = f(value * 1)
    else if (lostPercent <= f(0.75)) value = f(value * f(1.5))
    else value = f(value * 2)
  }
  return { ok: true, value, lostPercent }
}

export function isCaptureSuccess(value: number, rngValue: number, targetBaseId: number): boolean {
  return targetBaseId === 10 || value >= rngValue
}

// float.TryParse: 失败要给 null (调用点 return false), 不能抛。
function parseProb(s: string): number | null {
  const v = tryParseFloat(s)
  return v === null ? null : f(v)
}
