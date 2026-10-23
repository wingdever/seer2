// PetTransformInfo —— Unity Info/PetTransformInfo.cs。行长不齐（不吃 DATA_COL），逐行切。
// §2.10 CB3：解析失败 ⇒ 整行丢弃（不写入任何键）；None 只留给字面写了 None 的行（合法通配）。
import { PetAnimationType, parseAnimationType } from './animation-type.ts'

export interface TransformPose { posX: number; posY: number; scaleX: number; scaleY: number }

export class PetTransformInfo {
  skinId = 0
  poses: Map<number, TransformPose> = new Map()
  constructor(skinId = 0) { this.skinId = skinId }

  // 解析单行 "type,x,y,scaleX,scaleY"（字段数不定）。CB3：type 解析失败 ⇒ 返 null（坏行丢弃）。
  static parseLine(skinId: number, line: string): PetTransformInfo | null {
    const info = new PetTransformInfo(skinId)
    const parts = line.split(',').map((s) => s.trim())
    if (parts.length < 5) return null
    const t = parseAnimationType(parts[0])
    if (t === null) return null
    const pose: TransformPose = {
      posX: parseFloat(parts[1]) || 0,
      posY: parseFloat(parts[2]) || 0,
      scaleX: parseFloat(parts[3]) || 1,
      scaleY: parseFloat(parts[4]) || 1,
    }
    info.poses.set(t, pose)
    return info
  }

  // 从多行块解析：每行 parseLine，坏行跳过。
  static parseBlock(skinId: number, block: string): PetTransformInfo {
    const info = new PetTransformInfo(skinId)
    const lines = block.split('\n')
    for (const ln of lines) {
      const parsed = PetTransformInfo.parseLine(skinId, ln)
      if (parsed) { for (const pair of parsed.poses) info.poses.set(pair[0], pair[1]) }
    }
    return info
  }

  // 读取侧：具体 type 优先，查不到回落 None 通配（设计 §2.9）。
  getPositionByType(type: number): TransformPose | null {
    return this.poses.get(type) ?? this.poses.get(PetAnimationType.None) ?? null
  }

  getRawInfoStringArray(): string[] | null {
    const lines: string[] = []
    for (const pair of this.poses) {
      const t = pair[0]
      const p = pair[1]
      lines.push([String(t), String(p.posX), String(p.posY), String(p.scaleX), String(p.scaleY)].join(','))
    }
    return lines.length ? lines : null
  }
}
