// Components/PetBasic.cs port (D6 B2 shape + B6 construction family).
// data carrier + copy + stable hashId + (id,p,g) constructor (B6) + ToBestPersonality.
import { f } from '../mathf.ts'
import { petEnv, petRng, petNow } from './env.ts'

// Components/PetBasic.cs:70-92 -- 55-item Personality. Declaration order is the semantics.
// D2 getPersonalityBuff is bounded by p>=0 && p<55 (game/core/pet/status.ts:218), so this must cover
// 0..54 fully (design section 2.1 end). Modeled as a const map (not a TS enum: build-core is
// strip-only and rejects enum) plus a numeric alias so it stays a plain number downstream.
export const PERSONALITY = {
  // atk+
  实干: 0, 固执: 1, 孤独: 2, 调皮: 3, 勇敢: 4,
  // mat+
  保守: 5, 害羞: 6, 稳重: 7, 马虎: 8, 冷静: 9,
  // def+
  大胆: 10, 顽皮: 11, 坦率: 12, 无虑: 13, 悠闲: 14,
  // mdf+
  沉着: 15, 慎重: 16, 温顺: 17, 浮躁: 18, 狂妄: 19,
  // spd+
  胆小: 20, 开朗: 21, 急躁: 22, 天真: 23, 认真: 24,
  // 30
  豪放: 25, 含蓄: 26, 直率: 27, 叛逆: 28, 谦逊: 29, 孤傲: 30,
  机灵: 31, 古板: 32, 古怪: 33, 狂野: 34, 残忍: 35, 暴虐: 36,
  严肃: 37, 随和: 38, 清纯: 39, 自私: 40, 大方: 41, 仁慈: 42,
  忧郁: 43, 颓废: 44, 元气: 45, 狡猾: 46, 憨厚: 47, 温柔: 48,
  热情: 49, 冷淡: 50, 活泼: 51, 高雅: 52, 粗俗: 53, 可爱: 54,
} as const

export type Personality = number

// Components/PetBasic.cs:7-18 -- fields in declaration order (V4: XML archive order = field order).
export class PetBasic {
  id = 0
  baseId = 0
  name = ''
  gender = 0
  personality: Personality = PERSONALITY.实干
  height = 0
  weight = 0
  getPetDate = 0

  constructor(rhsOrId?: PetBasic | number, p = -1, g = Number.MIN_SAFE_INTEGER) {
    if (rhsOrId instanceof PetBasic) {
      const rhs = rhsOrId
      this.id = rhs.id
      this.name = rhs.name
      this.gender = rhs.gender
      this.personality = rhs.personality
      this.height = rhs.height
      this.weight = rhs.weight
      this.getPetDate = rhs.getPetDate
      this.baseId = rhs.baseId
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    const info = petEnv().petInfo ? petEnv().petInfo(id) : null
    const bi = info && info.basic ? info.basic : null
    this.baseId = (bi && typeof bi.baseId === 'number') ? bi.baseId : 0
    this.name = (info && typeof info.name === 'string') ? info.name : ''
    const gl = bi && Array.isArray(bi.genderList) ? bi.genderList : []
    const g0 = bi && typeof bi.gender === 'number' ? bi.gender : 0
    this.gender = gl.includes(g) ? g : (petRng().pick(gl.length ? gl : [g0]) ?? g0)
    this.personality = p === -1 ? petRng().nextInt(0, 25) : p
    this.height = (bi && typeof bi.baseHeight === 'number' ? bi.baseHeight : 0) + petRng().nextInt(0, 6)
    this.weight = (bi && typeof bi.baseWeight === 'number' ? bi.baseWeight : 0) + petRng().nextInt(0, 6)
    this.getPetDate = petNow()
  }

  ToBestPersonality(): void {
    const info = petEnv().petInfo ? petEnv().petInfo(this.id) : null
    const bs = info && info.basic ? info.basic.baseStatus : null
    if (!bs) return
    this.personality = (bs.atk >= bs.mat) ? 1 : 5
  }

  // Components/PetBasic.cs:52-67 -- stable integer mix. We replace DateTime.GetHashCode() with our
  // own mix (design section 2.8): not comparable to upstream, but deterministic in-repo, assertable,
  // and comparable across saves.
  get hashId(): number {
    let h = 17
    h = (h * 31 + this.id) | 0
    h = (h * 31 + this.personality) | 0
    h = (h * 31 + hashInt(this.getPetDate)) | 0
    return h
  }
}

// Mix the wall clock (double epoch-ms) into a 32-bit integer, same input => same output.
function hashInt(n: number): number {
  const x = f(n)
  return ((x | 0) ^ Math.floor(x * 0x100000000)) | 0
}
