// D5 B1 (domain-skill.md section 3.2 / G9): SkillType 从 battle/damage.ts 下沉到本文件。
// G9 (V7 "谁定义谁"): SkillType 是**域侧**枚举，必须住在域文件；引擎文件只 import 进来，不能反过来定义。
// 来源 Skill.cs:727-731 -- 负数那一截是「行为类型」(空过/道具/换场/逃跑/被动), 正数才是战斗伤害类型。
// IsNullOrEmpty(Skill) 判的是 type == 空过, 不是 null -- 「空过」就是那张空卡。
// 本文件后续 B2/B3 会再纳入 class Skill (同上游 Skill.cs)，此处先只落枚举拆雷。
export const SkillType = {
  空过: -1, 道具: -2, 換场: -3, 逃跑: -4, 被动: -5,
  属性: 0, 物理: 1, 特殊: 2, 连携: 3, 必杀: 100,
} as const
