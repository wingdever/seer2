// Components/PetUI.cs port (D6 B2 shape).
// skinId / skinBaseId / animId / hashId / info-series read D7 tables: deferred to B5.
export class PetUI {
  id = 0
  baseId = 0
  specialSkinList: number[] = []

  constructor(rhsOrId?: PetUI | number, baseId = 0, specialSkinList?: number[]) {
    if (rhsOrId instanceof PetUI) {
      const rhs = rhsOrId
      this.id = rhs.id
      this.baseId = rhs.baseId
      this.specialSkinList = [...rhs.specialSkinList]
      return
    }
    const id = typeof rhsOrId === 'number' ? rhsOrId : 0
    this.id = id
    this.baseId = baseId
    this.specialSkinList = specialSkinList ? [...specialSkinList] : []
  }
}
