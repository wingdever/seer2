// Components/PetResist.cs port (D6 B2 shape).
// abnormalResist / unhealthyResist are IKeyValuePair<int,int> == Linear<number> (see linear.ts).
import { Linear } from './linear.ts'
import { Buff } from '../buff/buff.ts'
import { petEnv } from './env.ts'

// CB3 (design section 2.7 + AGENTS.md section 2): upstream resistKeyNames[2] is "per", but
// SetResistValue only accepts "percentage", so percent resist is silently dropped. Per the
// "declare + do not copy the bug" policy, we converge the vocabulary to "percentage".
export const RESIST_KEY_NAMES: string[] = [
  'critical', 'fix', 'percentage', 'abnormal.id', 'unhealthy.id', 'abnormal.value', 'unhealthy.value',
]

export class PetResist {
  id = 0
  lockState = -1
  criResist = 0
  fixResist = 0
  perResist = 0
  abnormalResist = new Linear<number>(0, 0)
  unhealthyResist = new Linear<number>(0, 0)

  constructor(rhsOrId?: PetResist | number) {
    if (rhsOrId instanceof PetResist) {
      const rhs = rhsOrId
      this.id = rhs.id
      this.lockState = rhs.lockState
      this.criResist = rhs.criResist
      this.fixResist = rhs.fixResist
      this.perResist = rhs.perResist
      this.abnormalResist = new Linear<number>(rhs.abnormalResist.key, rhs.abnormalResist.value)
      this.unhealthyResist = new Linear<number>(rhs.unhealthyResist.key, rhs.unhealthyResist.value)
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    const star = (petEnv().petInfo ? petEnv().petInfo(id) : null)?.ui?.star ?? 0
    this.lockState = star < 6 ? -1 : 0
    this.criResist = 0
    this.fixResist = 0
    this.perResist = 0
    this.abnormalResist = new Linear<number>(0, 0)
    this.unhealthyResist = new Linear<number>(0, 0)
  }

  toArray(): number[] {
    return [
      this.criResist, this.fixResist, this.perResist,
      this.abnormalResist.key, this.unhealthyResist.key,
      this.abnormalResist.value, this.unhealthyResist.value,
    ]
  }

  toDictionary(): Record<string, number> {
    return {
      critical: this.criResist,
      fix: this.fixResist,
      percentage: this.perResist,
      'abnormal.id': this.abnormalResist.key,
      'unhealthy.id': this.unhealthyResist.key,
      'abnormal.value': this.abnormalResist.value,
      'unhealthy.value': this.unhealthyResist.value,
    }
  }

  setResistValue(type: string, value: number): void {
    switch (type) {
      default: return
      case 'critical': this.criResist = value; return
      case 'fix': this.fixResist = value; return
      case 'percentage': this.perResist = value; return
      case 'abnormal.id': this.abnormalResist.key = value; return
      case 'unhealthy.id': this.unhealthyResist.key = value; return
      case 'abnormal.value': this.abnormalResist.value = value; return
      case 'unhealthy.value': this.unhealthyResist.value = value; return
    }
  }

  setResistArray(array: number[] | null): void {
    if (!array || array.length !== RESIST_KEY_NAMES.length) return
    for (let i = 0; i < RESIST_KEY_NAMES.length; i++) this.setResistValue(RESIST_KEY_NAMES[i], array[i])
  }

  setResistDict(dict: Record<string, number> | null): void {
    if (!dict) return
    for (const k in dict) this.setResistValue(k, dict[k])
  }

  // ToBest / GetResistBuffs read info/star/D4: deferred to B3/B5.
  // PetResist.cs:22 -- XmlIgnore derived view (V5). D7: resist values map to buffs;
  // degraded to [] until resist data is wired (B5).
  get resistBuffs(): Buff[] {
    return []
  }

  reset(): void {
    this.criResist = 0
    this.fixResist = 0
    this.perResist = 0
    this.abnormalResist = new Linear<number>(0, 0)
    this.unhealthyResist = new Linear<number>(0, 0)
  }

  ToBest(): void {
    const star = (petEnv().petInfo ? petEnv().petInfo(this.id) : null)?.ui?.star ?? 0
    this.lockState = star < 6 ? -1 : 1
    this.criResist = 35
    this.fixResist = 35
    this.perResist = 35
    this.abnormalResist = new Linear<number>(this.abnormalResist.key, 55)
    this.unhealthyResist = new Linear<number>(this.unhealthyResist.key, 55)
  }
}
