// MVC/Model/Basic/Pet/System/PetElementSystem.cs 的移植 —— 23 元素相克表是**硬编码在 C# 里**的
// (不在 CSV 中), 所以它必须由 tools/difftest.mjs 用 23×(0..23) 的全交叉逐格验, 而不是靠我抄写时的眼力。
// 表体是用脚本从源文件第 68-90 行机械提取生成的 (N/R/W/O → 1/0.5/2/0), 不是手敲的。
//
// 三条实测语义:
//   · 索引方向是 **elementDefenseRelation[防][攻]** —— 读反了整张表就转置了。
//     坐实: 草攻光 = 2 (W), 光攻草 = 0 (O)。
//   · 未知防守元素 (含 全部=-1 与 23 以上) → 字典 miss → `?? 1`; 攻方 id 越界 → ListHelper.Get(list, i, 1) → **1**。
//   · 双属性是**两次查表再相乘** (float32 乘), 且副属性为 普通 时**跳过**第二次查表 (乘 1)。

import { f } from '../mathf.ts'

export const Element = {
  全部: -1, 普通: 0, 草: 1, 水: 2, 火: 3, 风: 4, 虫: 5, 飞行: 6, 电: 7, 地面: 8, 冰: 9,
  超能: 10, 战斗: 11, 特质: 12, 光: 13, 神秘: 14, 暗影: 15, 龙: 16, 沙漠: 17, 圣灵: 18,
  精灵王: 19, 上古: 20, 机械: 21, 邪灵: 22,
} as const
export type ElementId = number

// PetElementSystem.cs:32-37 elementNameList —— 下标就是元素 id
export const ELEMENT_NAMES = ['普通', '草', '水', '火', '风', '虫', '飞行', '电', '地面', '冰',
  '超能', '战斗', '特质', '光', '神秘', '暗影', '龙', '沙漠', '圣灵', '精灵王', '上古', '机械', '邪灵']

// PetElementSystem.cs:39-65 elementColorDict (view 层要用; 全部=-1 也有色)
export const ELEMENT_COLORS: Record<number, string> = {
  [-1]: '#ffffff', 0: '#fd893d', 1: '#73c652', 2: '#65ffff', 3: '#fd0100', 4: '#d7e9eb',
  5: '#965983', 6: '#e5eeeb', 7: '#ffe53d', 8: '#cca681', 9: '#57cbfc', 10: '#c24ec9',
  11: '#ba8551', 12: '#f9e805', 13: '#fffc01', 14: '#a428a4', 15: '#595271', 16: '#981c65',
  17: '#a56741', 18: '#01beff', 19: '#ed780e', 20: '#fff699', 21: '#706283', 22: '#073e00',
}

const N = 1.0, R = 0.5, W = 2.0, O = 0.0

// elementDefenseRelation —— 行 = 防守方元素, 列 = 攻击方元素 id (0..22)
export const ELEMENT_DEFENSE_RELATION: Record<number, number[]> = {
  0: [N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N,N],
  1: [N,R,R,W,N,W,W,R,R,N,N,N,R,O,N,N,N,R,W,W,W,W,N],
  2: [N,W,R,R,N,N,N,W,N,R,N,R,R,N,N,R,W,N,W,W,N,R,N],
  3: [N,R,W,R,N,R,N,N,W,R,N,N,R,N,N,N,N,W,W,W,N,R,N],
  4: [N,N,N,W,R,N,R,R,R,W,W,R,R,N,N,N,N,R,N,W,W,N,W],
  5: [N,R,N,W,N,N,W,N,N,R,R,W,W,R,W,R,N,N,R,W,N,R,N],
  6: [N,R,N,N,R,R,N,W,O,W,N,N,R,N,W,N,R,R,N,W,W,W,N],
  7: [N,N,N,N,N,N,R,R,W,N,R,N,R,N,N,N,R,W,W,W,N,R,N],
  8: [N,N,W,N,W,N,W,O,N,N,R,N,W,N,R,R,N,N,N,W,N,W,N],
  9: [N,R,N,W,O,R,N,N,N,R,N,W,R,R,N,N,W,R,W,W,R,W,R],
  10: [N,N,N,N,N,W,N,N,R,N,R,R,R,W,N,W,R,N,N,W,N,W,R],
  11: [N,N,N,R,W,R,N,N,N,R,W,R,R,N,R,N,N,N,R,W,N,N,N],
  12: [N,R,R,R,R,W,R,R,W,R,R,R,R,W,R,W,W,W,W,W,W,N,W],
  13: [N,W,N,N,N,N,R,N,W,N,R,N,W,R,N,R,N,N,N,W,N,R,W],
  14: [N,N,R,N,R,N,N,R,R,N,W,N,R,W,R,N,W,R,R,W,W,O,W],
  15: [N,N,W,N,N,R,R,W,R,N,N,N,W,W,N,W,R,N,N,W,N,N,W],
  16: [N,N,N,R,R,W,R,N,R,N,N,W,W,N,R,W,N,N,R,W,W,N,N],
  17: [N,W,R,R,W,N,N,N,N,W,N,N,W,R,W,N,N,R,N,W,N,N,W],
  18: [N,R,R,R,N,W,N,R,R,R,N,W,W,R,W,R,W,R,N,W,R,N,R],
  19: [N,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,R,W,R,R,R],
  20: [N,R,N,N,N,N,N,N,N,N,W,N,W,N,R,N,R,N,W,W,N,W,N],
  21: [N,R,W,W,R,W,R,W,N,R,W,N,N,N,O,R,N,W,N,W,R,N,R],
  22: [N,N,N,N,R,N,R,N,N,N,N,R,W,R,R,R,W,R,N,W,N,W,N],
}

export const ELEMENT_NUM = 23

// PetElementSystem.cs:155-158 —— 防守方不认识 / 攻击方越界一律 1
export function getElementRelation(atkElementId: number, defElement: ElementId): number {
  const row = ELEMENT_DEFENSE_RELATION[defElement]
  if (row === undefined) return 1
  const v = row[atkElementId]
  return v === undefined ? 1 : v
}

// PetElementSystem.cs:160-165 —— 副属性为 普通 时不查第二次
export function getElementRelationSub(atkElementId: number, defElement: ElementId, defSubElement: ElementId): number {
  const defenseRelation = getElementRelation(atkElementId, defElement)
  const subDefenseRelation = getElementRelation(atkElementId, defSubElement)
  return f(defenseRelation * (defSubElement === Element.普通 ? 1 : subDefenseRelation))
}

// PetElementSystem.cs:177-187 GetAttackRelation —— 遍历 23 个防守方，取表**列** [防][攻]；
// 上游 `elementDefenseRelation.Get(e)` 缺行会抛（字典默认无兜底），而本表 0..22 齐全，故不需要兜底。
export function getAttackRelation(element: ElementId, filter: (value: number) => boolean): ElementId[] {
  const out: ElementId[] = []
  for (let i = 0; i < ELEMENT_NUM; i++) {
    if (filter(ELEMENT_DEFENSE_RELATION[i][element])) out.push(i)
  }
  return out
}

// PetElementSystem.cs:189-194 GetDefenseRelation —— 直接筛防守方那一**行**，返回攻击方 id。
// 未知防守元素 ⇒ 上游 `?.` 落空 ⇒ 空表（不是抛）。
export function getDefenseRelation(element: ElementId, filter: (value: number) => boolean): ElementId[] {
  const row = ELEMENT_DEFENSE_RELATION[element]
  if (row === undefined) return []
  const out: ElementId[] = []
  for (let i = 0; i < row.length; i++) if (filter(row[i])) out.push(i)
  return out
}

// PetElementSystem.cs:127-153 —— 颜色/文字提示按**关系值**分档 (0 无效 / >1 克制 / <1 微弱 / 其余普通)。
// NaN 三个判据都不成立 ⇒ 落到"普通", 这是上游形状, 别"顺手"改成 else 分支抛错。
export function getElementRelationNote(relation: number): string {
  if (relation === 0) return '无效'
  if (relation > 1) return '克制'
  if (relation < 1) return '微弱'
  return '普通'
}

// PetElementSystem.cs:117-125 GetElementName: id<0 ⇒ "全部", 越界 ⇒ "未知";
// totalLength 比名字长时**在前面**补全角空格「　」(UI 对齐用), 半角空格都不行。
export function getElementName(element: ElementId, totalLength = -1): string {
  const id = element
  const name = id < 0 ? '全部' : (ELEMENT_NAMES[id] ?? '未知')
  if (totalLength <= name.length) return name
  return '　'.repeat(totalLength - name.length) + name
}

// PetElementSystem.cs:112-115 GetElementGroup: 分组表**默认是空的** —— 它只由玩家自己导入的
// 元素表 (SaveSystem.cs:1059-1063 → ResourceManager.GetElementEffect) 填充, 发行数据里没有那份文件
// (实测安装目录下没有任何 element 表)。所以本体语境下分组恒为「自己」, 同属性加成因此只看属性是否相同。
// 保留可注入的 dict, 将来支持导入时不必改调用点。
export type ElementGroups = Map<ElementId, ElementId[]>
export function getElementGroup(element: ElementId, groups: ElementGroups | null = null): ElementId[] {
  return groups?.get(element) ?? [element]
}

// UnitSkillSystem.cs:187-199 GetSameElementBuff —— 1.5 / (星>5?1.5:1.25) / 1
export function getSameElementBuff(atkElement: ElementId, subElement: ElementId, star: number, skillElement: ElementId, groups: ElementGroups | null = null): number {
  if (getElementGroup(atkElement, groups).includes(skillElement)) return 1.5
  if (getElementGroup(subElement, groups).includes(skillElement) && subElement !== Element.普通) return star > 5 ? 1.5 : 1.25
  return 1
}
