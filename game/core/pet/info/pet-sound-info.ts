// PetSoundInfo —— Unity Info/PetSoundInfo.cs。键 skinId。
// 字段序 physics/attribute/special/critical/fit（设计 §2.9 与 PetHitInfo 字段序对齐）。
// getSoundByType 未知 type ⇒ 返 "0"（设计 §2.9 / G14）。
import { PetAnimationType } from './animation-type.ts'

const DATA_COL = 7
const SOUND_TYPES = [0, 1, 2, 3, 4] // physics, attribute, special, critical, fit
const SOUND_COL_OF_TYPE: { [k: number]: number } = { 0: 2, 1: 3, 2: 4, 3: 5, 4: 6 }

export class PetSoundInfo {
  skinId = 0
  sounds: Map<number, string> = new Map()
  constructor(skinId = 0) { this.skinId = skinId }

  static parseRow(row: string[]): PetSoundInfo {
    const info = new PetSoundInfo()
    if (!row || row.length < DATA_COL) return info
    info.skinId = parseInt(row[0] ?? '0', 10) || 0
    for (const t of SOUND_TYPES) {
      const col = SOUND_COL_OF_TYPE[t]
      info.sounds.set(t, row[col] ?? '0')
    }
    return info
  }

  getSoundByType(type: number): string {
    const s = this.sounds.get(type)
    return s == null ? '0' : s
  }

  getRawInfoStringArray(): string[] | null {
    const row = new Array(DATA_COL).fill('0')
    row[0] = String(this.skinId)
    for (const t of SOUND_TYPES) {
      const col = SOUND_COL_OF_TYPE[t]
      const s = this.sounds.get(t)
      row[col] = s == null ? '0' : s
    }
    return row
  }
}
