import { Status } from './status.ts'
import { Buff } from '../buff/buff.ts'
import { getBuffInfo, type BuffInfo } from '../buff/buff-info.ts'
import { toFloatList } from '../strutil.ts'
import { petEnv } from './env.ts'

const statusFromSlash = (s?: string): Status => {
  if (s === undefined) return new Status(0)
  const arr = toFloatList(s, '/')
  if (arr && arr.length === 6) return new Status(arr)
  return new Status(0)
}

const SL = 6

export class PetFeature {
  id = 0
  hasEmblem = true
  featureId = 0
  emblemId = 0
  afterwardBuffIds: number[] = []

  constructor(rhsOrId?: PetFeature | number, hasEmblem = true, featureId = 0, emblemId = 0, afterwardBuffIds?: number[]) {
    if (rhsOrId instanceof PetFeature) {
      const rhs = rhsOrId
      this.id = rhs.id
      this.hasEmblem = rhs.hasEmblem
      this.featureId = rhs.featureId
      this.emblemId = rhs.emblemId
      this.afterwardBuffIds = [...rhs.afterwardBuffIds]
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    this.hasEmblem = hasEmblem
    this.featureId = featureId
    this.emblemId = emblemId
    this.afterwardBuffIds = afterwardBuffIds ? [...afterwardBuffIds] : []
  }

  get afterwardBuffs(): Buff[] {
    return this.afterwardBuffIds.map((id) => new Buff(id))
  }

  getExtraStatus(normalStatus: Status): Status {
    const buffs: BuffInfo[] = this.afterwardBuffIds.map((id) => getBuffInfo(id)).filter((b): b is BuffInfo => b !== null)
    const id = Status.one()
    const z = Status.zero()
    const mult = buffs.map((b) => statusFromSlash(b.options.get('status_mult'))).reduce((a, s) => a.times(s), id)
    const add = buffs.map((b) => statusFromSlash(b.options.get('status'))).reduce((a, s) => a.plus(s), z)
    return mult.minus(id).times(normalStatus).plus(add).floorToInt()
  }

  // B6 (N-branch): matches C# int SetTrait(int).
  //   traitId === -1 -> no-op, returns -1
  //   traitId ===  0 -> roll a random trait buff from buffIdsOfGroup('trait') via R1
  //   traitId  >  0 -> add that buff id (clears prior trait-group buffs first, faithful to C#)
  SetTrait(traitId = 0): number {
    if (traitId === -1) return traitId
    this.afterwardBuffIds = this.afterwardBuffIds.filter((id) => {
      const b = getBuffInfo(id)
      return !(b && b.options.get('group') === 'trait')
    })
    let chosen = traitId
    if (traitId === 0) {
      const e = petEnv()
      const ids = e.buffIdsOfGroup ? e.buffIdsOfGroup('trait') : []
      const picked = e.rng ? e.rng.pick(ids) : (ids.length ? ids[0] : 0)
      chosen = picked ?? 0
    }
    this.afterwardBuffIds.push(chosen)
    return chosen
  }

  SetFeatureType(num: number): void {
    const e = petEnv()
    const info = e.petInfo ? e.petInfo(this.id) : null
    const list = info && info.ui && info.ui.defaultFeatureList ? info.ui.defaultFeatureList : []
    if (!list || list.length === 0) return
    const i = ((num % list.length) + list.length) % list.length
    this.featureId = list[i]
  }

  SetEmblemType(num: number): void {
    const e = petEnv()
    const info = e.petInfo ? e.petInfo(this.id) : null
    const list = info && info.ui && info.ui.defaultFeatureList ? info.ui.defaultFeatureList : []
    if (!list || list.length === 0) return
    const i = ((num % list.length) + list.length) % list.length
    this.emblemId = list[i]
  }
}
