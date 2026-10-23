// Scene Specific/Battle/BattleResult.cs 的**状态形状**那半 (BattleResultState 枚举 + 拷贝构造 + identifier)。
//
// 已登记**未搬**的半截: ProcessResult / SetBasic / SetRecord / SetTalent / SetExp / SetSkill / DoWork
// (BattleResult.cs:61-237)。它们整条链路挂在 Player.instance / SaveSystem / petBag / YiTeRogueData 上,
// 落的是存档与经验, 属 S5 的地盘 (见 docs/engine/port-map.md「存档里 hp 上限仍走官方曲线 → S5 换」)。
// 因此 endState / gainExpPerPet / gainEVStoragePerPet / learnedSecretSkills 这四个**只由那条链写入**
// 的字段在这里不出现, capturePet 只保留读侧 (identifier 要查它)。别在 S5 之前给它们接上任何实现。
//
// 三处按上游保留的怪处:
//   · `isBattleEnd` 判的是 `state != Fighting` ⇒ Timeout(99) 与 Error(-1) 都算结束, 而 `isKO`/`isEscape`
//     各自只点名两三个成员, Timeout 既不是 KO 也不是 Escape, isMyWin/isOpWin 双双为 false。
//   · `GetResultIdentifier("capturePet.xxx")` 在 capturePet 为 null 时给 **-1** (不是 float.MinValue),
//     于是未捕捉时 `[capturePet.level]` 这类读出来是 -1 而不是"查不到"。
//   · 拷贝构造只带 state 与 fightPetCursors —— 快照里的 BattleResult 天然丢掉战斗外那批结算数据。

import { tryTrimStart } from '../strutil.ts'

// BattleResult.cs:241-250 —— Timeout = 99 是有意留的大洞, 不是笔误。
export const BattleResultState = {
  Error: -1, Fighting: 0, Win: 1, Lose: 2, MyEscape: 3, OpEscape: 4, CaptureSuccess: 5, Timeout: 99,
} as const
export type BattleResultState = (typeof BattleResultState)[keyof typeof BattleResultState]

const FLOAT_MIN_VALUE = -3.4028234663852886e38

/** BattleResult.cs:38 对 capturePet 只用到 GetPetIdentifier (S5 换成真宠表时收窄这里)。 */
export interface PetIdentifierReadView {
  getPetIdentifier(id: string): number
}

export class BattleResult {
  state: BattleResultState = BattleResultState.Fighting
  fightPetCursors: Set<number>
  capturePet: PetIdentifierReadView | null = null

  get isBattleEnd(): boolean { return this.state !== BattleResultState.Fighting }
  get isKO(): boolean { return this.state === BattleResultState.Win || this.state === BattleResultState.Lose }
  get isEscape(): boolean { return this.state === BattleResultState.MyEscape || this.state === BattleResultState.OpEscape }
  get isCapture(): boolean { return this.state === BattleResultState.CaptureSuccess }
  get isMyWin(): boolean {
    return this.state === BattleResultState.Win || this.state === BattleResultState.OpEscape || this.state === BattleResultState.CaptureSuccess
  }
  get isOpWin(): boolean { return this.state === BattleResultState.Lose || this.state === BattleResultState.MyEscape }

  // BattleResult.cs:25-28 —— fightPetCursors 的初值是 Enumerable.Range(0, parallelCount),
  // 所以 parallelCount=0 时是个**空集** (而字段默认 {0} 那条走的是无参初始化, 上游没有)。
  constructor(settings: { parallelCount: number }) {
    this.state = BattleResultState.Fighting
    this.fightPetCursors = new Set()
    for (let i = 0; i < settings.parallelCount; i++) this.fightPetCursors.add(i)
  }

  // BattleResult.cs:30-33 拷贝构造 —— **只**拷 state 与 fightPetCursors, 其余一律回默认值。
  static from(rhs: BattleResult): BattleResult {
    const r = Object.create(BattleResult.prototype) as BattleResult
    r.state = rhs.state
    r.fightPetCursors = new Set(rhs.fightPetCursors)
    r.capturePet = null
    return r
  }

  // BattleResult.cs:35-51 —— capturePet. 前缀在 switch **之前**, 所以 "capturePet." 后面接什么
  // 都交给宠侧 identifier (空串也走进去), 而 capturePet 为 null 时统一给 -1。
  getResultIdentifier(id: string): number {
    const t = tryTrimStart(id, 'capturePet.')
    if (t.ok) return this.capturePet === null ? -1 : this.capturePet.getPetIdentifier(t.trim)

    switch (id) {
      case 'state': return this.state
      case 'fightPetCount': return this.fightPetCursors.size
      case 'isEnd': return this.isBattleEnd ? 1 : 0
      case 'isKO': return this.isKO ? 1 : 0
      case 'isEscape': return this.isEscape ? 1 : 0
      case 'isCapture': return this.isCapture ? 1 : 0
      case 'isMyWin': return this.isMyWin ? 1 : 0
      case 'isOpWin': return this.isOpWin ? 1 : 0
      default: return FLOAT_MIN_VALUE
    }
  }

  setState(state: BattleResultState): void { this.state = state }

  // HashSet.Add —— 已在集合里就是 no-op, 上游也不记这条的返回值。
  addFightPetCursor(cursor: number): void { this.fightPetCursors.add(cursor) }
}
