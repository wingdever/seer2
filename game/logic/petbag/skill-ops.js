// L1 · 精灵技能换位的目标行为（纯函数）。真值 = docs/view/panel/petbag/skill-panel-design.md
// §2（上游 PetSkill.cs:139-190 / PetSwapSkillController.cs:51-88 / PetSkill.cs:113-131 的 CheckNewSkill）。
// 纪律：零 DOM、零 content、零存档知识；技能表由调用方以 learn 参数喂进来（铁律 2）。
// SkillType 的单一真值在 L0（D5 B1 已下沉到 core/pet/skill.ts），L1 → L0 是合法的向下依赖。
import { SkillType } from '../../core/pet/skill.js'

/** 常规技能槽位数 = 上游 `int[4]`（PetSkill.cs:8）。 */
export const NORMAL_SLOTS = 4

const isSuperType = (type) => type === SkillType.必杀
// 上游 Skill.cs:460-465：isAction = type < 属性 && type != 被动（道具/换场/逃跑这类行为技）
const isActionType = (type) => type != null && type < SkillType.属性 && type !== SkillType.被动
// 上游判据两层，照搬 PetSkill.cs:99-102（CheckNewSkill）+ SecretSkillDatabase.cs:11（isAutoLearned）：
//   ① 只收 `secretType == GreaterThanLevel(0)` **或** `isAutoLearned` —— 战斗条件型秘技（1–10：胜场/败场/Buff/残血/回合数/天气/使用技能/造成伤害/专属宠）**一律不收**；
//   ② 再判等级 `level >= (isAutoLearned ? 60 : value)`。
// `isAutoLearned` = `(secretType == Auto(-2)) || (value == 0)` —— **两个分支**（SecretSkillDatabase.cs:11）；
//   只判 secretType === -2 会漏掉 `value == 0` 那一类（实测 6693 条里 5 条，如约瑟 id=990 的 13134/13135/13136，`raw=10000` ⇒ secretType=1 但 value=0 ⇒ 上游 Lv60 自动学，原来**永远学不到**）。
const decodeRaw = (raw) => {
  const r = Number(raw ?? 0)
  return { secretType: r < 0 ? r : Math.floor(r / 10000), value: r < 0 ? r : r % 10000 }
}
const isAutoLearned = (st, v) => st === -2 || v === 0
const learnableAt = (item, level) => {
  const { secretType, value } = decodeRaw(item.unlockRaw)
  const auto = isAutoLearned(secretType, value)
  if (!(secretType === 0 || auto)) return false // ① 战斗条件型秘技不按等级学
  return level >= (auto ? 60 : value)          // ② isAutoLearned 走 60 级，其余走 value
}

const uniq = (xs) => {
  const out = []
  for (const x of xs) if (x != null && x !== 0 && !out.includes(x)) out.push(x)
  return out
}

/**
 * 把「档里的三个字段 + 等级 + 技能表」归一成换位用的模型。
 * @param {{own?:number[], normal?:number[], super?:number}} saved 档里的原始值
 * @param {number} level 这只宠当前等级
 * @param {Array<{id:number,type:number,unlockRaw?:number}>} learn 该宠的可学技能表（content.skillLearnOf）
 * @param {(id:number)=>object|null} [view] **全局**技能表查询（content.skillView）—— 进化兜底，见 ①b
 */
export function buildModel(saved = {}, level = 1, learn = [], view = () => null) {
  const meta = new Map(learn.map((x) => [Number(x.id), x]))
  const typeOf = (id) => meta.get(Number(id))?.type
  const learnable = uniq(learn.filter((x) => learnableAt(x, level)).map((x) => Number(x.id)))

  // ① 已学 = 档里为准 + 此刻按等级该学的（上游 CheckNewSkill 会把两者并进 ownSkillId）
  const own = uniq([...(saved.own || []), ...learnable])

  // ①b **进化兜底**：进化保留旧招（人类 2026-10-19 拍板 = 照上游 `PetSkill(evolveId, level, original)`），
  //     而旧招不在新形态的 `learn` 表里 ⇒ 不补的话面板查不到名字/类型，只显示裸数字 `#10001`。
  //     上游 `GetLearnSkillInfos`（PetSkill.cs:88-92）对「已拥有但 learnInfoList 里查不到」，
  //     明确回退成 `SecretType.Others(-1)` 并用**全局** `Skill.GetSkill` 取完整卡面 —— 照搬。
  //     `unlockRaw:-1` ⇒ `learnableAt` 恒 false ⇒ 兜底项不会被当成「现在该学」，也不会进未习得区。
  for (const id of own) {
    if (meta.has(id)) continue
    const v = view(id)
    if (!v) continue
    meta.set(id, { ...v, secretType: -1, unlockRaw: -1, value: -1, isAutoLearned: false })
  }

  // ② 带在身上的常规技能 = 档里去重 → 滤掉必杀/行为技 → 补空到 4（照搬 GetNormalSkill）
  const normal = []
  for (const id of saved.normal || []) {
    const t = typeOf(id)
    if (normal.length >= NORMAL_SLOTS) break
    if (t != null && (isSuperType(t) || isActionType(t))) continue
    if (!normal.includes(Number(id))) normal.push(Number(id))
  }
  while (normal.length < NORMAL_SLOTS) normal.push(0)

  // ③ 必杀 = 档里非 0 才用，否则取已学必杀里第一个（照搬 CheckNewSkill 的 superSkill = superSkill ?? first）
  const ownSupers = own.filter((id) => isSuperType(typeOf(id)))
  const savedSuper = Number(saved.super || 0)
  const superId = ownSupers.includes(savedSuper) ? savedSuper : (ownSupers[0] || 0)

  // ④ 备用常规 = 已学、非必杀、非行为技、且没带上
  const backupNormal = own.filter((id) => !isSuperType(typeOf(id)) && !isActionType(typeOf(id)) && !normal.includes(id))
  // ⑤ 备用必杀 = 环上的下一个（照搬 GetBackupSuperSkill：只有 1 个已学必杀 ⇒ 没有备选）
  let backupSuper = 0
  if (ownSupers.length >= 2) {
    const i = ownSupers.indexOf(superId)
    backupSuper = ownSupers[(i + 1) % ownSupers.length]
  }

  // ⑥ 未学习（表里该宠的全部可学项 − 已学）= 给人看的「将来能学什么」；排序：等级到就学 → 60 级自动 → 其它途径/秘技
  const rank = (x) => { const raw = Number(x.unlockRaw ?? 0); return (raw > 0 && raw < 10000) ? 0 : (raw === -2 ? 1 : 2) }
  const unlearned = learn
    .filter((x) => !own.includes(Number(x.id)))
    .slice()
    .sort((a, b) => rank(a) - rank(b) || Number(a.unlockRaw ?? 0) - Number(b.unlockRaw ?? 0))
    .map((x) => ({ id: Number(x.id), unlockRaw: Number(x.unlockRaw ?? 0), secretType: Number(x.secretType ?? 0), value: Number(x.value ?? 0), isAutoLearned: x.isAutoLearned === true }))

  // ⑦ 盖板「备用技能」区的**合池**（人类 2026-10-19 三轮：已习得与未习得**同区**）
  //    —— learned=true 的排前面（可点可换），learned=false 的灰色跟在后面（只报学习条件、点不动）
  const backup = [
    ...backupNormal.map((id) => ({ id, learned: true })),
    ...unlearned.map((x) => ({ ...x, learned: false })),
  ]

  return { own, normal, super: superId, backupNormal, backupSuper, backup, ownSupers, unlearned, meta }
}

const pack = (model, { own = model.own, normal = model.normal, super: s = model.super }) =>
  ({ own: [...own], normal: [...normal], super: Number(s || 0) })

// 提示文案里的技能名：取词归 View，这里只把名字当参数交出去（与 petbag/actions.js 的 hint 口径同款）
const nameOf = (model, id) => (id ? (model.meta.get(Number(id))?.name || String(id)) : '空')

const NOT_LEARNED = { key: 'skill.notLearned', args: [], level: 'warn' }
const NOT_SUPER = { key: 'skill.notSuper', args: [], level: 'warn' }
const SAME = { key: 'skill.sameSlot', args: [], level: 'info' }

/**
 * 常规技能换位（守卫逐条照抄 PetSkill.cs:174-181）。
 * @param {object} model buildModel 的产物
 * @param {{slot:number, skillId:number}} p slot = 0..3 的槽；skillId = 要换上去的已学技能
 */
export function swapNormal(model, { slot, skillId }) {
  const idx = Number(slot)
  const id = Number(skillId)
  if (!(idx >= 0 && idx < model.normal.length)) return { ok: false, skills: null, hint: null }
  const type = model.meta.get(id)?.type
  if (!model.own.includes(id)) return { ok: false, skills: null, hint: NOT_LEARNED }
  if (type != null && (isSuperType(type) || isActionType(type))) return { ok: false, skills: null, hint: NOT_SUPER }
  if (model.normal[idx] === id) return { ok: false, skills: null, hint: SAME }

  const normal = [...model.normal]
  const oldId = normal[idx]
  normal[idx] = id                       // 换下来的技能仍在 own 里，不需要写回（照搬上游）
  return { ok: true, skills: pack(model, { normal }), hint: { key: 'skill.swapped', args: [nameOf(model, oldId), nameOf(model, id)], level: 'info' } }
}

/** 必杀技换位（上游 PetSkill.cs:188-192；唯一差别 = 我们的备用必杀已由 buildModel 选好）。 */
export function swapSuper(model, { skillId }) {
  const id = Number(skillId)
  if (!model.own.includes(id)) return { ok: false, skills: null, hint: NOT_LEARNED }
  if (!isSuperType(model.meta.get(id)?.type)) return { ok: false, skills: null, hint: NOT_SUPER }
  if (model.super === id) return { ok: false, skills: null, hint: SAME }
  return { ok: true, skills: pack(model, { super: id }), hint: { key: 'skill.superSwapped', args: [nameOf(model, model.super), nameOf(model, id)], level: 'info' } }
}
