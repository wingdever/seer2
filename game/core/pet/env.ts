// PetEnv -- D6 injection-seam aggregate (design section 3.2 / impl section 4).
// Mirrors buff-info.ts setBuffHost shape: a module-level singleton + a set* merge inject, so static
// tables and R1-R5 are injected from one place and the whole thing can be swapped for a test double.
//
// B2 only establishes the seam contract; the info-backed getters (petInfo/featureInfo/skill/buffInfo
// / totalExp / getLevelExp / evolveChain / hitInfo / soundInfo / transformInfo / rng / now / store /
// save / hint) are wired in B4/B5/B6 branch by branch.
import type { Pet } from './pet.ts'
import type { Status } from './status.ts'
import type { Buff } from '../buff/buff.ts'
import type { SkillRecord } from '../battle/views.ts'
import type { Rng } from '../rng.ts'
import type { PetHitInfo } from './info/pet-hit-info.ts'
import type { PetSoundInfo } from './info/pet-sound-info.ts'
import type { PetTransformInfo } from './info/pet-transform-info.ts'

// D7 PetInfo shape (B5 concretized). Typed so pet.ts getters avoid any-casts.
// Mirrors the upstream PetInfo struct that Pet reads via Database.GetPetInfo(id):
//   info.basic.{baseStatus,baseId,genderList}
//   info.exp.{expType,evolveLevel,evolvePetId}
//   info.ui.{defaultId,subId,star,defaultBuffs,defaultFeatureList}
//   info.skills.{skillList,learnInfoList}
//   info.{elementId,subElementId}
export interface PetSkillInfoLike {
  id: number
  secretType?: number
  isAutoLearned?: boolean
  value?: number
}
export interface PetInfoLike {
  id?: number
  name?: string
  baseId?: number
  elementId?: number
  subElementId?: number
  basic?: { baseStatus?: Status; baseId?: number; baseHeight?: number; baseWeight?: number; genderList?: number[]; gender?: number }
  exp?: { expType?: number; evolveLevel?: number; evolvePetId?: number }
  ui?: {
    defaultBuffs?: Buff[]
    defaultId?: number
    defaultSkinId?: number
    subId?: number
    star?: number
    generation?: number
    defaultFeatureList?: number[]
  }
  skills?: { skillList?: unknown[]; learnInfoList?: PetSkillInfoLike[] }
  feature?: unknown
  [k: string]: unknown
}

export interface PetStoreLike {
  petBag: Pet[] | null
  petDict: Map<number, Pet> | null
  indexOf(p: Pet): number
}

export interface PetEnv {
  // static tables (D7 / D5 / D4)
  petInfo?: (id: number) => PetInfoLike | null
  featureInfo?: (id: number) => unknown
  getSkill?: (id: number) => SkillRecord | null
  skillTable?: unknown
  buffInfo?: unknown
  // D7 PetExpSystem three functions (already landed in exp-system.ts)
  totalExp?: (level: number, expType: number) => number
  getLevelExp?: (level: number, expType: number) => number
  evolveChain?: (baseId: number, id: number) => number[] | null
  // skin three-table bridge (resolution 4): PetHitInfo/PetSoundInfo/PetTransformInfo keyed by skinId.
  // Web runtime has no Mod CSV (persistentDataPath/PetAnimation/pet/*.csv) => fed empty by content.wireSkinTables,
  // so any skinId misses => returns null (0-sentinel default). Real rows via workshop/Mod save (future).
  hitInfo?: (skinId: number) => PetHitInfo | null
  soundInfo?: (skinId: number) => PetSoundInfo | null
  transformInfo?: (skinId: number) => PetTransformInfo | null
  // R1-R5 runtime seams
  rng?: Rng
  now?: () => number
  /** 全宠 id 列表（GetRandomPetInfo 从全表随机取一只）。运行时由内容桥注入。 */
  petInfoIds?: () => number[]
  /** 按 option 的 group 枚举印记 id（SetTrait(0) 从 trait 组随机取一个）。运行时由印记表注入。 */
  buffIdsOfGroup?: (group: string) => number[]
  store?: PetStoreLike
  save?: () => void
  hint?: (msg: string) => void
}

/** R1 随机源：造宠/洗特性等随机走注入的种子 RNG（决议 ①：不追求与上游逐值一致）。未注入显式抛。 */
export const petRng = (): Rng => {
  const r = petEnv().rng
  if (!r) throw new Error('PetEnv.rng (R1) 未注入 —— 造宠随机源缺失')
  return r
}

/** R2 时钟：getPetDate 等时间量来自注入时钟；未注入退化为真实墙钟。 */
export const petNow = (): number => {
  const n = petEnv().now
  return n ? n() : Date.now()
}

let PET_ENV: PetEnv = {}

export const setPetEnv = (e: PetEnv): void => { PET_ENV = { ...PET_ENV, ...e } }
export const petEnv = (): PetEnv => PET_ENV
