// BattlePet —— Unity Battle/BattlePet.cs 的忠实移植: class BattlePet : Pet。
// 持有三个战斗控制器 (status/buff/skill), 它们从继承来的 Pet 字段 (normalStatus / currentStatus.hp /
// element / subElement / skills) 取数; 暴露 BattlePetView (views.ts:542-579) 的 18 个转发成员。
// 与 Unity 同形: 构造 (Pet) 走 base(_pet) 拷贝构造 + 三个控制器; 构造 (BattlePet) 走深拷贝三控制器。
import { Pet } from '../pet/pet.ts'
import { StatusController } from '../pet/status-controller.ts'
import { PetBuffController } from '../pet/buff-controller.ts'
import { SkillType } from '../pet/skill.ts'
import { getSkill, cloneSkill } from './views.ts'
import { getAvailableSkills, getDefaultSkill } from '../pet/skill-controller.ts'
import { petPowerUp } from './state.ts'

// PetBattleSkillController.cs 的宿主面 —— 与 snap-mirror FakeSkillController / hostPetView HostSkillController 同形。
class BattlePetSkillController {
  constructor(normalSkills, superSkill) {
    this.cursor = 0
    this.headerSkills = null
    this.loopSkills = null
    this.normalSkills = normalSkills
    this.superSkill = superSkill
  }
  get allSkills() {
    return [...(this.headerSkills ?? []), ...(this.loopSkills ?? []), ...(this.normalSkills ?? []), ...(this.superSkill === null ? [] : [this.superSkill])]
  }
  findSkill(id) { return this.allSkills.find((x) => ((x === null || x === undefined) ? 0 : x.id) === id) ?? null }
  getAvailableSkills(anger, withSuper = true) { return getAvailableSkills(this, anger, withSuper) }
  getDefaultSkill(anger) { return getDefaultSkill(this, anger) }
  // PetBattleSkillController.cs:33-39 拷贝构造 —— headerSkills/loopSkills 都要带走 (不只是 cursor):
  // GetDefaultSkill 会把 headerSkills 写成 null、cursor 前进, 漏抄任一项都会让开场表/环击表在快照后失忆。
  clone() {
    const out = new BattlePetSkillController(null, null)
    out.cursor = this.cursor
    const cp = (list) => list === null ? null : list.map((x) => (x === null ? null : cloneSkill(x, true)))
    out.headerSkills = cp(this.headerSkills)
    out.loopSkills = cp(this.loopSkills)
    out.normalSkills = cp(this.normalSkills)
    out.superSkill = this.superSkill === null ? null : cloneSkill(this.superSkill, true)
    return out
  }
}

export class BattlePet extends Pet {
  statusController = null
  buffController = null
  skillController = null
  stayTurn = 0
  chain = 0

  constructor(arg) {
    super(arg)
    if (arg instanceof BattlePet) {
      // BattlePet(BattlePet rhs) : base(rhs) —— 深拷贝三控制器
      this.statusController = StatusController.fromCopy(arg.statusController)
      this.buffController = PetBuffController.fromCopy(arg.buffController)
      this.buffController.parent = this
      this.skillController = arg.skillController.clone()
      this.stayTurn = arg.stayTurn
      this.chain = arg.chain
      return
    }
    // BattlePet(Pet _pet) : base(_pet)
    this.stayTurn = 0
    this.chain = 0
    const info = this.info
    const el = (info && typeof info.elementId === 'number') ? info.elementId : 0
    const sub = (info && typeof info.subElementId === 'number') ? info.subElementId : 0
    this.statusController = new StatusController(this.normalStatus, this.currentStatus.hp)
    this.buffController = new PetBuffController(el, sub, null)
    this.buffController.parent = this
    const ids = this.skills ? this.skills.ownSkillId : []
    const recs = ids.map((id) => getSkill(id, false)).filter((s) => s !== null)
    // PetSkill.GetNormalSkill (PetSkill.cs:158-163) 末尾那句 `Array.Resize(ref ret, 4)` 是这里的关键:
    // 不足 4 条**补 null 洞**、超 4 条截断 ⇒ normalSkills 恒是长度 4 的表。上游正因为这个洞存在,
    // GetAvailableSkills 里 `(normalSkills?.Count ?? 0) > 0` 恒真, 永远不会回落到 loopSkills 分支,
    // 也就永远不会撞 `null.Where()`。移植体若原样留下 slice 的结果, 「一只技能都没学到的宠」(实测
    // unity/pets.json 838 只里 328 只在 Lv20 前无可用技) 会得到**空表** ⇒ 敌方选招/玩家看技能面板当场抛。
    const learned = recs.filter((s) => s.type !== SkillType.必杀).slice(0, 4)
    const normals = [...learned, ...new Array(4 - learned.length).fill(null)]
    const sup = recs.find((s) => s.type === SkillType.必杀) ?? null
    this.skillController = new BattlePetSkillController(normals, sup)
  }

  get isDead() { return this.battleStatus.hp <= 0 }
  get isMovable() { return this.buffController.isMovable }
  get isToken() { const b = this.buffController.getBuff(-21); return b !== null }

  get battleStatus() { return this.statusController.battleStatus }
  get initStatus() { return this.statusController.initStatus }
  get buffs() { return this.buffController.buffs }

  get hp() { return this.statusController.hp }
  set hp(v) { this.statusController.hp = v }
  get maxHp() { return this.statusController.maxHp }
  set maxHp(v) { this.statusController.maxHp = v }
  get anger() { return this.statusController.anger }
  set anger(v) { this.statusController.anger = v }
  get maxAnger() { return this.statusController.maxAnger }

  get battleElement() { return this.buffController.element }
  get subBattleElement() { return this.buffController.subElement }

  // host 元数据（FakePet 留 null/0 防污染 golden; 运行时如实填, UI 要显名）
  get name() { const info = this.info; const n = info && info.name; return typeof n === 'string' ? n : '' }
  get level() { return this.exp ? this.exp.level : 1 }
  get star() { const info = this.info; return (info && info.ui && typeof info.ui.star === 'number') ? info.ui.star : 0 }
  get baseId() { return this.basic ? this.basic.baseId : 0 }

  // BattlePet.cs:357-368 —— chain 归零、token 直回、turn>1 累加 stayTurn。
  onTurnStart(thisUnit, state) {
    this.chain = 0
    if (this.isToken) return
    if (state && state.turn > 1) this.stayTurn += 1
  }

  powerUp(status, lhsUnit, state, isSet = false) { petPowerUp(this, status, lhsUnit, state, isSet) }

  // BattlePet.cs:327-331 —— 敌方自动出招的入口。buff 61 (无限怒气) ⇒ petAnger 顶到 int.MaxValue。
  getDefaultSkill() {
    const petAnger = this.buffController.getBuff(61) === null ? this.anger : 2147483647
    return this.skillController.getDefaultSkill(petAnger)
  }

  clone() { return new BattlePet(this) }

  static GetBattlePet(pet) { return pet === null ? null : new BattlePet(pet) }
}
