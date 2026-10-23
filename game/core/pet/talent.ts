// Components/PetTalent.cs port (D6 B2 shape).
// ev is D2 Status (not int[]), so ev.<six-dim-name> reads the Status indexer directly.
// IVRank / IVRankId read D7 IVRanking: deferred to B5.
import { Status } from './status.ts'
import { clamp as MathfClamp } from '../mathf.ts'
import { petRng } from './env.ts'

export class PetTalent {
  id = 0
  iv = 0 // individual value 0..31
  ev = new Status() // effort value 0..255 (six dims)
  evStorage = 0 // remaining effort

  constructor(rhsOrId?: PetTalent | number, rhs?: PetTalent) {
    if (rhsOrId instanceof PetTalent) {
      const r = rhsOrId
      this.id = r.id
      this.iv = r.iv
      this.ev = Status.copy(r.ev)
      this.evStorage = r.evStorage
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    if (rhs instanceof PetTalent) {
      this.iv = rhs.iv
      this.ev = Status.copy(rhs.ev)
      this.evStorage = rhs.evStorage
      return
    }
    this.iv = petRng().nextInt(0, 32)
    this.ev = new Status()
    this.evStorage = 0
  }

  get totalEV(): number { return Math.floor(this.ev.sum) + this.evStorage }

  // Components/PetTalent.cs -- pure clamp, no info dependency.
  setEV(type: number, num: number): void {
    this.ev.setAt(type, MathfClamp(num, 0, 255))
  }

  setEVStorage(num: number): void {
    this.evStorage = MathfClamp(num, 0, 510 - Math.floor(this.ev.sum))
  }

  addEVStorage(num: number): void { this.setEVStorage(this.evStorage + num) }

  resetEV(): void {
    this.evStorage += Math.floor(this.ev.sum)
    this.ev = new Status()
  }
}
