// 驱动向量原型台: 只跑手写的几条候选, 镜像 + 真二进制两边逐字符比, 用来在把它们写进
// tools/snap-mirror.mjs 之前先筛掉「oracle 完成 / TS 抛」那一类不可发形状。
// 表装载复刻 tools/difftest.mjs:205-246 (顺序 = 上游 Database.Init)。
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { setEffectTable, PrefabTable, effectFromRow } from '../game/core/effect/effect.ts'
import { BuffInfo, setBuffTables } from '../game/core/buff/buff-info.ts'
import { setBuffHost } from '../game/core/buff/buff.ts'
import { setSkillTable } from '../game/core/battle/views.ts'
import { skillTable, mineSnap } from './snap-mirror.mjs'
import { tryParseFloat } from '../game/core/strutil.ts'

const ROOT = '/home/wing/Projects/Games/seer2'
const BUFFS = JSON.parse(readFileSync(join(ROOT, 'game/data/unity/buffs.json'), 'utf8')).buffs
const SKILLS = JSON.parse(readFileSync(join(ROOT, 'game/data/unity/skills.json'), 'utf8')).skills
const SKILL_NAME = new Map(SKILLS.map(s => [s.id, s.name]))
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(join(ROOT, 'game/data/unity/effects.json'), 'utf8')).prefabs)
const rowOf = b => [String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn),
  b.options.map(([k, x]) => `${k}=${x}`).join('&'), b.description]

class LoadedBuffInfos {
  constructor() { for (const b of BUFFS) { const i = new BuffInfo(rowOf(b)); i.setEffects(b.effects.map(effectFromRow)); this.byId.set(i.id, i) } }
  byId = new Map()
  getBuffInfo(id) { return id === 0 ? null : (this.byId.get(id) ?? null) }
  buffIdsOfType(type) { const o = []; for (const i of this.byId.values()) if (i.type === type) o.push(i.id); return o }
}
setEffectTable(EFFECTS)
setSkillTable(skillTable())
const T = new LoadedBuffInfos()
setBuffTables(T, EFFECTS, (id) => tryParseFloat(id) ?? 0)
setBuffHost({ petName: () => null, skillName: (id) => (id === 0 ? null : (SKILL_NAME.get(id) ?? null)), allInfos: () => [...T.byId.values()] })

const vectors = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'drv-'))
writeFileSync(join(dir, 'in.json'), JSON.stringify(vectors))
const outPath = join(dir, 'out.json')
execFileSync('dotnet', [join(ROOT, 'tools/oracle-cs/bin/Debug/net9.0/oracle.dll'), join(dir, 'in.json'), outPath], { stdio: ['ignore', 'ignore', 'inherit'] })
const golden = JSON.parse(readFileSync(outPath, 'utf8'))

const norm = (x) => typeof x === 'string' ? x : JSON.stringify(x)
vectors.forEach((v, i) => {
  const g = golden[i]
  let m, threw = false
  try { m = mineSnap(v) } catch (e) { threw = true; m = String(e.message) }
  const tag = v.tag ?? `#${i}`
  if (g.infra === true) { console.log(`⚠infra ${tag}: ${g.err}`); return }
  const gErr = typeof g.errType === 'string'
  if (gErr !== threw) { console.log(`❌${gErr ? 'oracle抛/TS不抛' : 'TS抛/oracle不抛'} ${tag}\n   oracle: ${String(g.err ?? g.v).slice(0, 300)}\n   ts    : ${norm(m).slice(0, 300)}`); return }
  if (gErr) { console.log(`✓抛同 ${tag}: oracle ${g.errType} 「${String(g.err).slice(0, 110)}」 / TS 「${norm(m).slice(0, 110)}」`); return }
  const a = norm(g.v), b = norm(m)
  if (a === b) { console.log(`✓值同 ${tag}: len=${a.length}`); return }
  const pa = a.split('|'), pb = b.split('|')
  const cols = []
  for (let k = 0; k < Math.max(pa.length, pb.length); k++)
    if (pa[k] !== pb[k]) cols.push(`  col${k}\n     oracle: ${String(pa[k]).slice(0, 220)}\n     ts    : ${String(pb[k]).slice(0, 220)}`)
  console.log(`❌值不等 ${tag}: ${cols.length} 列\n${cols.slice(0, 12).join('\n')}`)
})
