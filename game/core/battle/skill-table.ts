// 真技能表的装载与回写 (Skill.cs:86-106 / :130-151 / :191-207)。
//
// 为什么这里放的是**构造器**而不是"把 JSON 字段抄进 SkillRecord":
// build 阶段 (tools/build-unity-data.mjs) 已经把 options→字段那次回写做过了, 所以直接抄 JSON 拍出来
// 一定是绿的 —— 因为它没跟上游比, 只跟我的 build 产物比。对拍要的恰好是反面: 从行出发走上游那条 ctor,
// 再走它的**逆函数** GetRawInfoStringArray, 两边逐列比 (kind `skilltable`)。
// 于是「JSON 少了一列」会以列差暴露, 而不是被静默兜成默认值。
//
// 四处必须照抄的形状 (都各占对拍的一列):
//   · `combo = chain = 1` 写在 InitOptionsProperty **之前**, 而 options 里没有这两条键 ⇒ 纯装载的技能
//     恒为 1/1, 只有运行期的技能改写 (case "combo"/"chain") 会动它们;
//   · `InitCost` 的 `PP = maxPP` 走的是**夹紧属性** ⇒ 落库的 `pp` 恒等于 maxPP, JSON 里没有 pp 这列不是缺数据;
//   · `anger = list[0]` 而 `ToIntList('')` 给**空表** ⇒ 空费用串当场 ArgumentOutOfRange, 不是 0;
//   · `ignorePowerup`/`ignorePowerdown` **不是字段**, 是 powerup/powerdown 的 mult 派生属性 ⇒
//     回写方向是「bool → 把那两个乘子写成 0/1」, 而且 setter 是**双向覆盖** (false 会把 0 改回 1)。

import { SkillType } from '../pet/skill.ts'
import { atIndex, dictGet, isEmpty, listGet } from '../collections.ts'
import { boolParse, concatToString, csBool, parseFloatOrThrow, parseIntOrThrow, replaceSpecialWhitespace, toIntList } from '../strutil.ts'
import { parseOptions } from '../parser/parser.ts'
import { clampInt } from '../mathf.ts'
import { Linear } from '../pet/linear.ts'
import { Status } from '../pet/status.ts'
import { effectFromRow, type PrefabRow } from '../effect/effect.ts'
import { isActionSkill, setSkillEffects, type SkillRecord, type SkillTable } from './views.ts'

/** Skill.cs:11 —— `public const int DATA_COL = 9`。 */
export const SKILL_DATA_COL = 9

/** Skill.cs:193-194 —— GetRawInfoStringArray 里"由字段重算"的那批键 (其余键原样从 options 带走)。 */
const DEFAULT_OPTION_KEYS = ['critical', 'priority', 'second_super', 'ignore_shield', 'ignore_powerup', 'ignore_powerdown', 'ref_buff']

/**
 * Skill.cs:86-106 —— `public Skill(string[] _data, int startIndex = 0)`。
 * 这条 ctor **不过** ReplaceSpecialWhiteSpaceCharacters (只有工坊那条 :107 过),
 * 所以 name/description 里的特殊空白原样留着 —— 两条 ctor 的清洗差是 `skilltable` 的素材。
 */
export function skillFromRow(data: string[] | null, startIndex = 0): SkillRecord {
  if (data === null) throw new Error('NullReferenceException: 技能行是 null (上游 Array.Copy 直接抛)')
  if (data.length < startIndex + SKILL_DATA_COL)
    throw new Error(`ArgumentException: 技能行需要 ${SKILL_DATA_COL} 列 (startIndex=${startIndex}, 实得 ${data.length - startIndex} 列)`)
  const d = data.slice(startIndex, startIndex + SKILL_DATA_COL)

  const skill = blankSkillRecord()
  skill.id = parseIntOrThrow(d[0])
  skill.name = d[1]
  skill.elementId = parseIntOrThrow(d[2])
  // `element = (Element)elementId` (:93) 是同一个 int 的往返, 移植体只留 elementId 一份。
  skill.type = parseIntOrThrow(d[3]) as SkillType
  skill.power = parseIntOrThrow(d[4])
  initCost(skill, d[5])
  skill.accuracy = parseIntOrThrow(d[6])
  parseOptions(skill.options!, d[7])
  skill.combo = 1
  skill.chain = 1
  initOptionsProperty(skill)
  skill.rawDescription = d[8]
  skill.isAction = isActionSkill(skill.type)
  return skill
}

/**
 * Skill.cs:76-84 —— 字段初始化器 + `public Skill() {}`: 数值全 0、字符串 null、三个容器空但非 null,
 * powerup/powerdown = `Linear<Status>(Status.one, Status.zero)`。
 * 注意 `critical` 在这里是 **0** 而不是 5 —— 5 是 options 的**默认串** ("critical=5"), 只有走过
 * InitOptionsProperty 才会变成 5, 所以无参 ctor 造出来的技能 critical 是 0 (派生值, 不是笔误)。
 */
export const blankSkillRecord = (): SkillRecord => ({
  id: 0,
  name: null as unknown as string,
  elementId: 0,
  type: 0,
  power: 0,
  rawCostString: null,
  anger: 0,
  pp: 0,
  maxPP: 0,
  accuracy: 0,
  rawDescription: null,
  effects: [],
  options: new Map<string, string>(),
  isSecondSuper: false,
  referBuffList: null,
  critical: 0,
  combo: 0,
  chain: 0,
  priority: 0,
  vipriority: 0,
  ignoreShield: false,
  powerup: new Linear(Status.one(), Status.zero()),
  powerdown: new Linear(Status.one(), Status.zero()),
  isAction: false,
})

// Skill.cs:130-138 InitCost —— `maxPP = (list.Get(1, 0) > 0) ? list[1] : Mathf.Max(5, 40 - anger)`。
// 那个三元判的是 list[1] **存不存在且 > 0**, 而 `list[1]` 取的是原表 (不是兜底值) —— 两条都得照搬。
function initCost(skill: SkillRecord, cost: string): void {
  skill.rawCostString = cost
  const list = toIntList(cost, '/') ?? []
  skill.anger = atIndex(list, 0, 'Skill.InitCost 的费用表')
  const second = listGet(list, 1, 0) as number
  skill.maxPP = second > 0 ? (list[1] as number) : intMax(5, 40 - skill.anger)
  // `PP = maxPP` 是属性写入 (int 夹紧), 所以落库的 pp 就是 maxPP 本身。
  skill.pp = clampInt(skill.maxPP, 0, skill.maxPP)
}

// Mathf.Max 的 **int** 版 (不是 float 版 —— 见 docs/engine/oracle-playbook.md §7 那条 Clamp/Clamp 两版的教训)。
const intMax = (a: number, b: number): number => (a > b ? a : b)

// Skill.cs:140-151 InitOptionsProperty —— 六条回写 + ref_buff 的 Split('/')。
// `options.Get("ref_buff", null)?.Split('/')` ⇒ 没这条键时是 **null**, 不是空表 (两处判空都靠它)。
// bool 的默认串是小写字面量 "false" 而 `bool.Parse` 只认 true/false 两种 (strutil.boolParse),
// 上游这里写的确实是 "false" ⇒ 与 BuffInfo 那条 "True"/"False" 默认串**不同型**, 别统一。
function initOptionsProperty(skill: SkillRecord): void {
  const o = skill.options!
  const refBuff = dictGet(o, 'ref_buff')
  skill.referBuffList = refBuff === null ? null : refBuff.split('/')
  skill.isSecondSuper = boolParse(dictGet(o, 'second_super', 'false')!)
  skill.critical = parseFloatOrThrow(dictGet(o, 'critical', '5')!)
  skill.priority = parseIntOrThrow(dictGet(o, 'priority', '0')!)
  skill.vipriority = parseIntOrThrow(dictGet(o, 'vipriority', '0')!)
  skill.ignoreShield = boolParse(dictGet(o, 'ignore_shield', 'false')!)
  setPowerupIgnored(skill, boolParse(dictGet(o, 'ignore_powerup', 'false')!))
  setPowerdownIgnored(skill, boolParse(dictGet(o, 'ignore_powerdown', 'false')!))
}

// Skill.cs:47-55 —— 这两对是**派生属性**, 不是字段:
//   ignorePowerup   ⇔ powerup.mult.def  * powerup.mult.mdf == 0
//   ignorePowerdown ⇔ powerdown.mult.atk * powerdown.mult.mat == 0
// setter 把两个乘子**同时**写成 0 或 1, 所以给 false 也会覆盖 (把 0 改回 1) —— 单向置位会漏掉这半。
export const powerupIgnored = (skill: SkillRecord): boolean =>
  skill.powerup!.mult.def * skill.powerup!.mult.mdf === 0
export const powerdownIgnored = (skill: SkillRecord): boolean =>
  skill.powerdown!.mult.atk * skill.powerdown!.mult.mat === 0
export const setPowerupIgnored = (skill: SkillRecord, value: boolean): void => {
  const v = value ? 0 : 1
  skill.powerup!.mult.def = v
  skill.powerup!.mult.mdf = v
}
export const setPowerdownIgnored = (skill: SkillRecord, value: boolean): void => {
  const v = value ? 0 : 1
  skill.powerdown!.mult.atk = v
  skill.powerdown!.mult.mat = v
}

/**
 * Skill.cs:191-207 GetRawInfoStringArray —— ctor 的**逆函数**, 也是 `skilltable` 比的那九列。
 * 三个不显然的点:
 *   · 前七列是字段直读, 第八列却是**重算**的: 默认键由字段重拼 (bool 出 `"True"` 而不是表里的 "true"),
 *     其余键从 options 按**插入序**原样带上 ⇒ 同一条 `ignore_shield=true` 回写成 `ignore_shield=True`,
 *     且顺序被挪到 critical/priority 之后。这是回写顺序, 不是笔误。
 *   · `raw + "&" + other` 中间那个 '&' 在 other 为空时留下尾 '&', 由末尾 Trim('&') 砍掉;
 *   · 两支都空才是 "none"。
 */
export function getSkillRawInfoStringArray(skill: SkillRecord): string[] {
  const raw = (skill.critical === 5 ? '' : `critical=${csFloat(skill.critical)}&`)
    + (skill.priority === 0 ? '' : `priority=${skill.priority}&`)
    + (skill.isSecondSuper ? 'second_super=true&' : '')
    + (skill.ignoreShield ? `ignore_shield=${csBool(skill.ignoreShield)}&` : '')
    + (powerupIgnored(skill) ? `ignore_powerup=${csBool(powerupIgnored(skill))}&` : '')
    + (powerdownIgnored(skill) ? `ignore_powerdown=${csBool(powerdownIgnored(skill))}&` : '')
    + (isEmpty(skill.referBuffList) ? '' : `ref_buff=${concatToString(skill.referBuffList!, '/')}`)
  const other = [...skill.options!.entries()]
    .filter(([k]) => !DEFAULT_OPTION_KEYS.includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  // `string.IsNullOrEmpty(raw + other)` 判的是**拼接后**的串, 不是两支各自; 非空时才插那个分隔 '&'。
  const all = (raw + other) === '' ? 'none' : raw + '&' + other
  return [
    String(skill.id),
    skill.name,
    String(skill.elementId),
    String(skill.type),
    String(skill.power),
    skill.rawCostString as string,
    String(skill.accuracy),
    trimAmps(all),
    skill.rawDescription as string,
  ]
}

// string.Trim('&') —— 两端连续的 '&' 全砍, 中间的保留 ("a&&b" 原样)。
const trimAmps = (s: string): string => s.replace(/^&+/, '').replace(/&+$/, '')

// C# 的 `float + string` 走**当前区域**的 ToString; 真表 critical 实测全是整数 (skilltable 盯着这列),
// 所以先按能唯一还原的最短十进制出 (与 oracle 的 Fs 同口径)。
const csFloat = (x: number): string => String(Math.fround(x))

/**
 * skills.json (build-unity-data.mjs 的产物) → SkillTable。
 * 每一行走 `skillFromRow`, 所以 `options` 的 pair 数组要先还原成 `k=v&…` 的**原序串** ——
 * 这里绝不能改用 build 已经算好的 `priority/critical/ignore*` 字段, 否则比的就是我自己。
 * 效果行是上游 effect.csv 的解码形状 (PrefabRow 兼容), 交给 `setSkillEffects` ⇒ 走 SetEffects 那条
 * 「展开常驻壳 + source 指回」的路, 与 Database.GetSkill(infos, effects, …) 同序。
 */
export interface SkillJsonRow {
  id: number
  name: string
  elementId: number
  type: number
  power: number
  rawCostString: string
  accuracy: number
  options: [string, string][]
  rawDescription: string
  effects: PrefabRow[]
}

export class JsonSkillTable implements SkillTable {
  private byId = new Map<number, SkillRecord>()

  constructor(rows: SkillJsonRow[]) {
    for (const r of rows) {
      const skill = skillFromRow([String(r.id), r.name, String(r.elementId), String(r.type), String(r.power),
        r.rawCostString, String(r.accuracy), r.options.map(([k, v]) => `${k}=${v}`).join('&'), r.rawDescription], 0)
      setSkillEffects(skill, r.effects.map(effectFromRow))
      this.byId.set(skill.id, skill)
    }
  }

  get size(): number { return this.byId.size }
  all(): SkillRecord[] { return [...this.byId.values()] }

  // Database.cs:130-133 —— `id == 0` 一律查不到, 哪怕表里真有 0 号行 (与 PrefabTable 同一条规矩)。
  getSkill(id: number): SkillRecord | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}

/** 上游 GetRawInfoStringArray 的第九列是原样输出, 但**工坊那条 ctor** 会清洗 —— 留给调用方按需组合。 */
export const skillRowFromFields = (id: number, name: string, elementId: number, type: SkillType, power: number,
  cost: string, accuracy: number, options: string, rawDescription: string): SkillRecord => {
  // Skill.cs:107-128 —— 三个字符串字段先过 ReplaceSpecialWhiteSpaceCharacters(string.Empty)。
  const skill = blankSkillRecord()
  skill.id = id
  skill.name = replaceSpecialWhitespace(name, '')
  skill.elementId = elementId
  skill.type = type
  skill.power = power
  initCost(skill, cost)
  skill.accuracy = accuracy
  parseOptions(skill.options!, replaceSpecialWhitespace(options, ''))
  skill.combo = 1
  skill.chain = 1
  initOptionsProperty(skill)
  skill.rawDescription = replaceSpecialWhitespace(rawDescription, '')
  skill.isAction = isActionSkill(skill.type)
  return skill
}
