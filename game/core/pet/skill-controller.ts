// MVC/Model/Basic/Pet/Battle/PetBattleSkillController.cs:69-79 (GetAvailableSkills) 的移植。
// 本文件只搬**规则**, 不搬宿主: 入参是 views.ts 的 `PetSkillControllerView` (四个技能袋 + 大技),
// 于是 core 里有了一个下一段算子可以直接调的入口, 而快照镜像 (FakeSkillController) 只需要转发。
//
// 两条形状必须照抄:
//   · **normalSkills 优先**。上游这里是 `(normalSkills?.Count ?? 0) > 0 ? normalSkills : loopSkills`,
//     而 `Identifier.GetPetIdentifier` 的 `normalSkill[N].x` 那一臂读的是
//     `IsNullOrEmpty(loopSkills) ? normalSkills : loopSkills` —— **环击表优先**。同一个"普攻表"在
//     两处取不同的袋, 次序正好相反, 这不是笔误而是上游事实 (两处都已进对拍, 别"统一")。
//   · 空结果兜底是 `Skill.GetNoOpSkill()` (不是空表, 也不是 null), 而 `IsAvailable` 对 null 大技**返回 false**
//     —— 所以 `withSuper=true` 也不会凭空塞进一个 null。

import { SkillType } from './skill.ts'
import { isSelectSkill, noOpSkill, type PetSkillControllerView, type SkillRecord } from '../battle/views.ts'

// :71 —— `skill != null && skill.type >= SkillType.属性 && skill.anger <= anger && !skill.isSelect`。
// 注意 `>= 属性` 把被动与所有"非主动"挡在外面, 而**空过**在 `属性` 之下 ⇒ 天然不可用。
const isAvailable = (skill: SkillRecord | null, anger: number): boolean =>
  skill !== null && skill.type >= SkillType.属性 && skill.anger <= anger && !isSelectSkill(skill)

// :69-79 GetAvailableSkills。返回的是**新表**, 里面的 Skill 仍是原引用 (上游 Where().ToList() 同形)。
export function getAvailableSkills(controller: PetSkillControllerView, anger: number, withSuper = true): SkillRecord[] {
  const normals = controller.normalSkills
  // `(normalSkills?.Count ?? 0) > 0` —— null 与空表同权, 都算"没有普攻表"。
  const source = normals !== null && normals.length > 0 ? normals : controller.loopSkills
  // 两支袋子都拿不出来时上游是 `null.Where(…)` ⇒ System.Linq 当场 ArgumentNullException (source 判空)。
  // 静默当成空表会把「袋子还没接」伪装成「这只宠没有可用技能」, 所以移植体同样抛, 不兜底。
  if (source === null || source === undefined)
    throw new Error('ArgumentNullException: GetAvailableSkills 的 loopSkills 是 null (上游 Where(source) 判空即抛)')
  const availableSkills = source.filter((s) => isAvailable(s, anger)) as SkillRecord[]
  if (withSuper && isAvailable(controller.superSkill, anger)) availableSkills.push(controller.superSkill as SkillRecord)

  if (availableSkills.length === 0) availableSkills.push(noOpSkill())
  return availableSkills
}

// :43-67 GetDefaultSkill —— 「这只宠这一回合默认出什么」。四条分支的次序与判据都是语义:
//   ① 大技怒气够且不是选择技 ⇒ 直接交大技 (所以**怒满后敌方会连放大技**, 不是普攻轮换);
//   ② 没有环击表 ⇒ 取**可用技表的第一条** (GetAvailableSkills 的兜底保证至少有一项, 不会是空表);
//   ③ 有环击表但有开场表 ⇒ 走一遍开场表, 走完把 headerSkills 置 null、cursor 归零 (一次性开场序列);
//   ④ 纯环击 ⇒ loopSkills[cursor++] 循环。
// ⚠️ 本函数**改写 controller 自身的 cursor / headerSkills**(是它唯一的副作用), 所以调用方
// 必须传**将要真出招的那一只宠的**控制器 —— 快照副本上的 cursor 会被下一回合的拷贝构造丢掉。
export function getDefaultSkill(controller: PetSkillControllerView, anger: number): SkillRecord {
  const superSkill = controller.superSkill
  if (superSkill !== null && superSkill.anger <= anger && !isSelectSkill(superSkill)) return superSkill

  const loopSkills = controller.loopSkills
  if (loopSkills === null || loopSkills.length === 0) return getAvailableSkills(controller, anger, false)[0]

  const headerSkills = controller.headerSkills
  if (headerSkills !== null && headerSkills.length > 0) {
    const skill = headerSkills[controller.cursor]
    if (skill === undefined) throw new Error('ArgumentOutOfRangeException: GetDefaultSkill 的 headerSkills[cursor] 越界 —— PetBattleSkillController.cs:55')
    controller.cursor = controller.cursor + 1
    // 走完开场表 ⇒ 置 null (不是清空数组): 下一回合就落到纯环击分支。
    if (controller.cursor >= headerSkills.length) { controller.headerSkills = null; controller.cursor = 0 }
    return skill
  }

  const skill = loopSkills[controller.cursor]
  if (skill === undefined) throw new Error('ArgumentOutOfRangeException: GetDefaultSkill 的 loopSkills[cursor] 越界 —— PetBattleSkillController.cs:64')
  controller.cursor = (controller.cursor + 1) % loopSkills.length
  return skill
}
