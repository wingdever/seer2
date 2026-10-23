// PetBattleSkillController.GetAvailableSkills (:69-79) 的三条形状 (第五段·步骤2)。
// 逐值一致性在 petmut 对拍族里 (11 条 available 向量), 这里锁的是**袋子的优先级**、
// 空结果的兜底、以及两支袋子都没有时上游那句 `null.Where(…)` 的抛。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { SkillType } from './skill.ts'
import { getAvailableSkills } from './skill-controller.ts'
import { noOpSkill, type PetSkillControllerView, type SkillRecord } from '../battle/views.ts'

const sk = (id: number, type: number, anger: number): SkillRecord =>
  ({ id, type, anger, effects: [] }) as unknown as SkillRecord
const view = (x: Partial<PetSkillControllerView>): PetSkillControllerView =>
  ({ allSkills: [], findSkill: () => null, headerSkills: null, loopSkills: null, normalSkills: null, superSkill: null, ...x }) as PetSkillControllerView

test('筛子是 type>=属性 且 anger<=入参 且非选择技; 洞 (null 项) 由 IsAvailable 自己挡掉', () => {
  const v = view({ normalSkills: [sk(101, SkillType.属性, 5), null, sk(102, SkillType.属性, 50), sk(103, SkillType.被动, 0)] })
  assert.deepEqual(getAvailableSkills(v, 20).map((x) => x.id), [101])
  assert.deepEqual(getAvailableSkills(v, 100).map((x) => x.id), [101, 102])
})

test('normalSkills 优先于 loopSkills —— 与 `normalSkill[N].x` 标识符臂的优先级**相反**, 两处都是上游事实', () => {
  const both = view({ normalSkills: [sk(105, SkillType.属性, 1)], loopSkills: [sk(106, SkillType.属性, 1)] })
  assert.deepEqual(getAvailableSkills(both, 20).map((x) => x.id), [105])
  // normalSkills 是空表与 null 同权 (`(normalSkills?.Count ?? 0) > 0`), 于是换 loopSkills 上桌。
  const empty = view({ normalSkills: [], loopSkills: [sk(107, SkillType.属性, 1)] })
  assert.deepEqual(getAvailableSkills(empty, 20).map((x) => x.id), [107])
  // 但「有表全被筛光」不会回退到另一支: normalSkills 有内容就用它, 筛空了走 noOp 兜底。
  const spent = view({ normalSkills: [sk(108, SkillType.属性, 99)], loopSkills: [sk(109, SkillType.属性, 1)] })
  assert.deepEqual(getAvailableSkills(spent, 20).map((x) => x.id), [noOpSkill().id])
})

test('大技按 withSuper 追加 (在普攻之后), null 大技不追加; 空结果的兜底是 noOp 而不是空表', () => {
  const v = view({ normalSkills: [sk(110, SkillType.属性, 1)], superSkill: sk(111, SkillType.必杀, 5) })
  assert.deepEqual(getAvailableSkills(v, 20).map((x) => x.id), [110, 111])
  assert.deepEqual(getAvailableSkills(v, 20, false).map((x) => x.id), [110])
  assert.deepEqual(getAvailableSkills(v, 3).map((x) => x.id), [110])       // 大技怒气不够 ⇒ 不进
  const none = view({ normalSkills: [null] })
  assert.deepEqual(getAvailableSkills(none, 20).map((x) => x.id), [noOpSkill().id])
})

test('两支袋子都是 null ⇒ 上游 Where(null) 当场抛, 移植体同样抛 (静默兜底会伪装成「没有可用技能」)', () => {
  assert.throws(() => getAvailableSkills(view({}), 20), /ArgumentNullException/)
  assert.throws(() => getAvailableSkills(view({ normalSkills: [] }), 20), /ArgumentNullException/)
})
