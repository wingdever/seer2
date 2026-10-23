// PetHitInfo —— Unity Info/PetHitInfo.cs。键 skinId。
// §2.9 G8：列序置换 2=Physic / 3=Property / 4=Special / 5=Super / 6=SecondSuper（是语义不是笔误）。
// 命中帧缺省 0、视频帧缺省 -1（设计 §2.9）。
import { PetAnimationType } from './animation-type.ts'

const DATA_COL = 7
// 枚举序 Physic(9) / Special(10) / Property(11) / Super(12) / SecondSuper(13)
const HIT_TYPES = [9, 10, 11, 12, 13]
const HIT_COL_OF_TYPE: { [k: number]: number } = { 9: 2, 10: 4, 11: 3, 12: 5, 13: 6 }

export class PetHitInfo {
  skinId = 0
  // type(9..13) -> { hit, video }
  frames: Map<number, { hit: number; video: number }> = new Map()
  constructor(skinId = 0) { this.skinId = skinId }

  static parseRow(row: string[]): PetHitInfo {
    const info = new PetHitInfo()
    if (!row || row.length < DATA_COL) return info
    info.skinId = parseInt(row[0] ?? '0', 10) || 0
    for (const t of HIT_TYPES) {
      const col = HIT_COL_OF_TYPE[t]
      const raw = row[col] ?? ''
      const hit = raw === '' ? 0 : (parseInt(raw, 10) || 0)
      info.frames.set(t, { hit, video: -1 })
    }
    return info
  }

  getHitByType(type: number): number {
    const f = this.frames.get(type)
    return f ? f.hit : 0
  }
  getVideoByType(type: number): number {
    const f = this.frames.get(type)
    return f ? f.video : -1
  }

  // ctor -> 字符串行 -> ctor 闭合（pettable kind 往返自洽）。
  getRawInfoStringArray(): string[] | null {
    const row = new Array(DATA_COL).fill('')
    row[0] = String(this.skinId)
    for (const t of HIT_TYPES) {
      const col = HIT_COL_OF_TYPE[t]
      const f = this.frames.get(t)
      row[col] = f ? String(f.hit) : '0'
    }
    return row
  }
}
