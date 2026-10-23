// Components/PetExp.cs port (D6 B2/B5 shape).
// expSum / levelUpExp / maxExp / expType / evolveLevel read D7 tables via the PetEnv seam (B5).
// GainExp / LevelDown are S5 consumers (B5).
import { petEnv } from './env.ts'

export class PetExp {
  id = 0
  level = 0
  fixedMaxLevel = 0
  totalExp = 0 // C# uint; this repo carries it as number (non-negative invariant held by caller)

  constructor(rhsOrId?: PetExp | number, level = 1, exp = 0) {
    if (rhsOrId instanceof PetExp) {
      const rhs = rhsOrId
      this.id = rhs.id
      this.level = rhs.level
      this.fixedMaxLevel = rhs.fixedMaxLevel
      this.totalExp = rhs.totalExp
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    const info = petEnv().petInfo ? petEnv().petInfo(id) : null
    const expType = info && info.exp ? (info.exp.expType ?? 0) : 0
    const gt = petEnv().totalExp
    this.level = level
    this.totalExp = (exp === 0 && gt) ? gt(level, expType) : exp
  }

  getMaxLevel(): number {
    if (this.fixedMaxLevel > 0) return this.fixedMaxLevel
    if (this.id >= 20001 && this.id <= 30000) return 105
    return 100
  }

  private get info() {
    const e = petEnv()
    const info = e.petInfo ? e.petInfo(this.id) : null
    return info && info.exp ? info.exp : null
  }

  get expType(): number { return this.info ? (this.info.expType ?? 0) : 0 }
  get evolveLevel(): number { return this.info ? (this.info.evolveLevel ?? 0) : 0 }

  // ⚠️ 上游 PetExp.cs:23/26：levelUpExp 与 maxExp 都吃 **GetTotalExp（累计）**，不是 GetLevelExp（单级）。
  //   本 wrapper 2026-10-20 前误接 getLevelExp 缝（expSum 钳位/levelUpExp 全歪，GainExp 的 need 会变负）⇒ 已改。
  private get totalExpAtNext(): number {
    const gt = petEnv().totalExp
    return gt ? gt(this.level + 1, this.expType) : 0
  }
  get expSum(): number {
    const cap = this.totalExpAtNext > 0 ? this.totalExpAtNext - 1 : 0
    return Math.max(0, Math.min(this.totalExp, cap))
  }
  set expSum(v: number) { this.totalExp = v }

  get maxLevel(): number { return this.getMaxLevel() }
  // 同 totalExpAtNext：上游 maxExp = GetTotalExp(maxLevel)（累计）。
  get maxExp(): number {
    const gt = petEnv().totalExp
    return gt ? gt(this.maxLevel, this.expType) : 0
  }

  get levelUpExp(): number { return this.totalExpAtNext - this.expSum }

  GainExp(exp: number): boolean {
    if (this.level >= this.maxLevel) return false
    let remain = exp
    let need = this.levelUpExp
    if (remain < need) { this.totalExp += remain; return false }
    while (remain >= need && this.level < this.maxLevel) {
      remain -= need
      this.totalExp += need
      this.level++
      need = this.levelUpExp
    }
    this.totalExp += remain
    const info = this.info
    const evolveLevel = info ? (info.evolveLevel ?? 0) : 0
    const evolvePetId = info ? (info.evolvePetId ?? 0) : 0
    return this.level >= evolveLevel && evolvePetId !== 0 && evolveLevel !== 0
  }

  // 同 totalExpAtNext：上游 LevelDown 落 **GetTotalExp（累计）**。
  LevelDown(toWhichLevel: number): void {
    if (toWhichLevel < 1 || toWhichLevel > this.level) return
    const gt = petEnv().totalExp
    this.totalExp = gt ? gt(toWhichLevel, this.expType) : 0
    this.level = toWhichLevel
  }
}
