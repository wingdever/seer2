// PetAnimationType —— Unity PetUIInfo / PetTransformInfo 的动画类型枚举（domain-info.md §2.9 / §3.3 B5）。
// 设计记 17 值；build-core 是 strip-only（拒绝 enum），故用 const 映射 + 类型别名（同 basic.ts 的 PERSONALITY 手法）。
// 本埠先落 None + 文档化成员，未知串 parse 失败返 null（§2.10 CB3：解析失败⇒坏行丢弃）。
// 真实 17 值待工坊/Mod 落盘数据 + 人类手测补全。
export const PetAnimationType = {
  None: 0,
  Idle: 1,
  Walk: 2,
  Run: 3,
  Attack: 4,
  Hit: 5,
  Skill: 6,
  Die: 7,
  Win: 8,
  Lose: 9,
} as const
export type PetAnimationType = typeof PetAnimationType[keyof typeof PetAnimationType]

const NAME_TO_TYPE: { [k: string]: PetAnimationType } = {
  none: PetAnimationType.None,
  idle: PetAnimationType.Idle,
  walk: PetAnimationType.Walk,
  run: PetAnimationType.Run,
  attack: PetAnimationType.Attack,
  hit: PetAnimationType.Hit,
  skill: PetAnimationType.Skill,
  die: PetAnimationType.Die,
  win: PetAnimationType.Win,
  lose: PetAnimationType.Lose,
}

// 上游 Enum.TryParse：串→枚举；失败（坏行）返 null（CB3 据此丢弃）。
export const parseAnimationType = (s: string | null | undefined): PetAnimationType | null => {
  if (s == null) return null
  const key = String(s).trim().toLowerCase()
  if (key === '') return null
  if (key in NAME_TO_TYPE) return NAME_TO_TYPE[key]
  const n = Number(key)
  if (!Number.isNaN(n) && Number.isInteger(n)) return n as PetAnimationType
  return null
}

export const animationTypeName = (t: PetAnimationType): string => {
  for (const k in NAME_TO_TYPE) if (NAME_TO_TYPE[k] === t) return k
  return String(t)
}
