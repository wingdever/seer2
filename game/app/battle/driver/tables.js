// 内核表装配 —— UI 线 U1 战斗驱动的「Database.Init」对应物。
// 镜像 tools/drv-proto.mjs:9-34 的接缝注入序（顺序有依赖：先效果表，再技表/buff 表，
// 因为 JsonSkillTable/BuffInfo 的构造内部会调 setSkillEffects/setEffects，需要 PrefabTable 先到场）。
// 只喂重启 unity 表（game/data/unity/*.json），与差分 oracle 同源；不碰官方 AS3 表。
import { setEffectTable, PrefabTable, effectFromRow } from '/game/core/effect/effect.js'
import { BuffInfo, setBuffTables } from '/game/core/buff/buff-info.js'
import { setBuffHost } from '/game/core/buff/buff.js'
import { setSkillTable } from '/game/core/battle/views.js'
import { JsonSkillTable } from '/game/core/battle/skill-table.js'
import { tryParseFloat } from '/game/core/strutil.js'

let ready = null

// 幂等：多次调用只装配一次（核心单例是进程级的，浏览器里同一份 .js 只有一份状态）。
export function ensureTables() {
  if (ready === null) ready = boot()
  return ready
}

async function boot() {
  const j = async (u) => (await (await fetch(u)).json())
  const [skillsDoc, buffsDoc, effectsDoc] = await Promise.all([
    j('/game/data/unity/skills.json'),
    j('/game/data/unity/buffs.json'),
    j('/game/data/unity/effects.json'),
  ])

  const EFFECTS = new PrefabTable(effectsDoc.prefabs)
  const SKILL_NAME = new Map(skillsDoc.skills.map((s) => [s.id, s.name]))

  // 上游 Database.Init 的先后：效果 prefab 表 → 技表 → buff 表 → buff 宿主（显名）。
  setEffectTable(EFFECTS)
  setSkillTable(new JsonSkillTable(skillsDoc.skills))

  // BuffInfo 吃的是 CSV 那列形状（drv-proto rowOf 同款）；buff 的 effects 走 effectFromRow。
  const rowOf = (b) => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
    b.options.map(([k, x]) => `${k}=${x}`).join('&'), b.description]
  class LoadedBuffInfos {
    constructor() { for (const b of buffsDoc.buffs) { const i = new BuffInfo(rowOf(b)); i.setEffects(b.effects.map(effectFromRow)); this.byId.set(i.id, i) } }
    byId = new Map()
    getBuffInfo(id) { return id === 0 ? null : (this.byId.get(id) ?? null) }
    buffIdsOfType(type) { const o = []; for (const i of this.byId.values()) if (i.type === type) o.push(i.id); return o }
  }
  const T = new LoadedBuffInfos()
  setBuffTables(T, EFFECTS, (id) => tryParseFloat(id) ?? 0)
  // petName 暂给 null（buff 描述里的宠名占位 U1 不需要）；skillName 走技表；allInfos 供 buff 网格显名。
  setBuffHost({
    petName: () => null,
    skillName: (id) => (id === 0 ? null : (SKILL_NAME.get(id) ?? null)),
    allInfos: () => [...T.byId.values()],
  })

  return { skills: skillsDoc.skills }
}
