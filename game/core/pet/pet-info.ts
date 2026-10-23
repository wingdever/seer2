import { Status } from './status.ts'
import { Buff } from '../buff/buff.ts'
import { getBuffInfo } from '../buff/buff-info.ts'
import type { PetInfoLike, PetSkillInfoLike } from './env.ts'

/**
 * `learnLevelList` 逐项解码 —— 照上游 `LearnSkillInfo(int skill, int learnLevel)`（SecretSkillDatabase.cs:19-23）：
 *   `secretType = (learnLevel < 0) ? (SecretType)learnLevel : (SecretType)(learnLevel / 10000)`
 *   `value      = learnLevel % 10000`
 *   `isAutoLearned = (secretType == Auto(-2)) || (value == 0)`（同文件 :11，**两个分支**）
 * 原实现是**错的**：`lv >= 100000` 一律判 `secretType=4`、且 `value` 直接塞原始 `lv`（完全没解码）。
 *   实测 6693 条里有 1162 条 `raw >= 10000`（真正的分支型秘技）会被误判成 `OpHaveBuff(4)`，且 value 大到离谱。
 */
function learnInfosFrom(rawSkills: any): PetSkillInfoLike[] {
  if (!rawSkills || !Array.isArray(rawSkills.skillIdList)) return []
  const ids = rawSkills.skillIdList
  const levels = Array.isArray(rawSkills.learnLevelList) ? rawSkills.learnLevelList : []
  const out: PetSkillInfoLike[] = []
  for (let i = 0; i < ids.length; i++) {
    const lv = Math.trunc(Number(levels[i] ?? 0)) || 0
    const secretType = lv < 0 ? lv : Math.floor(lv / 10000)
    const value = lv < 0 ? lv : lv % 10000
    out.push({ id: ids[i], secretType, value, isAutoLearned: secretType === -2 || value === 0 } as PetSkillInfoLike)
  }
  return out
}

export function petInfoFromUnity(raw: any): PetInfoLike {
  if (!raw) return {}
  const bs = raw.baseStatus
  let baseStatus: Status | undefined = undefined
  if (bs && typeof bs === 'object') {
    baseStatus = Status.of6(bs.atk ?? 0, bs.mat ?? 0, bs.def ?? 0, bs.mdf ?? 0, bs.spd ?? 0, bs.hp ?? 0)
  }
  const growth = raw.growth ?? {}
  const ui = raw.ui ?? {}
  const skills = raw.skills ?? {}
  const evolveLevels = growth.evolveLevels
  const evolvePetIds = growth.evolvePetIds
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : undefined,
    baseId: raw.baseId,
    elementId: raw.elementId,
    subElementId: raw.subElementId,
    basic: {
      baseStatus,
      baseId: raw.baseId,
      baseHeight: typeof raw.baseHeight === 'number' ? raw.baseHeight : undefined,
      baseWeight: typeof raw.baseWeight === 'number' ? raw.baseWeight : undefined,
      genderList: Array.isArray(raw.genderList) ? raw.genderList : undefined,
      gender: raw.gender,
    },
    exp: {
      expType: growth.expType ?? 0,
      evolveLevel: Array.isArray(evolveLevels) ? (evolveLevels[0] ?? 0) : 0,
      evolvePetId: Array.isArray(evolvePetIds) ? (evolvePetIds[0] ?? 0) : 0,
    },
    ui: {
      defaultId: ui.defaultId ?? raw.id,
      skinId: ui.defaultSkinId ?? raw.id,
      defaultSkinId: typeof ui.defaultSkinId === 'number' ? ui.defaultSkinId : 0,
      generation: ui.generation ?? 1,
      subId: ui.subId ?? 0,
      star: ui.star ?? 1,
      defaultBuffs: Array.isArray(ui.defaultBuffIds)
        ? ui.defaultBuffIds.filter((id: number) => getBuffInfo(id) !== null).map((id: number) => new Buff(id))
        : [],
      defaultFeatureList: Array.isArray(ui.defaultFeatureList) ? ui.defaultFeatureList : [],
    },
    skills: {
      skillList: Array.isArray(skills.skillIdList) ? skills.skillIdList : [],
      learnInfoList: learnInfosFrom(skills),
    },
    feature: raw.feature,
  }
}

