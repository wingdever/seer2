// Components/PetRecord.cs port (D6 B2 shape).
// recordDict is List<IKeyValuePair<string,string>> == Linear<string>[] (see linear.ts).
// Asymmetry note (design section 7 item 9): read virtual keys winFightNum/loseFightNum, write only
// into recordDict -- preserved below.
import { Linear } from './linear.ts'

export class PetRecord {
  winFightNum = 0
  loseFightNum = 0
  recordDict: Linear<string>[] = []

  constructor(rhs?: PetRecord) {
    if (rhs) {
      this.winFightNum = rhs.winFightNum
      this.loseFightNum = rhs.loseFightNum
      this.recordDict = rhs.recordDict.map(x => new Linear<string>(x.key, x.value))
    }
  }

  getRecord(key: string, defaultValue: string | null = null): string | null {
    if (key === 'winFightNum') return this.winFightNum.toString()
    if (key === 'loseFightNum') return this.loseFightNum.toString()
    const found = this.recordDict.find(x => x.key === key)
    return found ? found.value : defaultValue
  }

  getRecordT<T>(key: string, defaultValue: T): T {
    const v = this.getRecord(key)
    if (v === null) return defaultValue
    if (typeof defaultValue === 'number') return Number(v) as unknown as T
    return v as unknown as T
  }

  tryGetRecord(key: string): string | null {
    return this.getRecord(key)
  }

  setRecord(key: string, value: object | null): void {
    this.recordDict = this.recordDict.filter(x => x.key !== key)
    if (value !== null) this.recordDict.push(new Linear<string>(key, value.toString()))
  }

  // CleanMod also needs ItemInfo.IsMod (item line, not D6): the extra mod guard is deferred to that
  // line; for now it removes icon-prefixed entries like CleanIconFrame.
  cleanMod(): void {
    this.recordDict = this.recordDict.filter(x => !(x.key.startsWith('icon') && x.value !== null))
  }

  cleanIconFrame(): void {
    this.recordDict = this.recordDict.filter(x => !(x.key.startsWith('icon') && x.value !== null))
  }
}
