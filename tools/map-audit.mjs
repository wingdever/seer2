// tools/map-audit.mjs —— 地图线的**对账工具**（方案 C「运行时现场解析」）
//
// 作用：把上游 272 张 Unity 地图 XML 用**与浏览器同一份解析器**（`game/logic/map/parse-map.js`）
//   全跑一遍，算出 `docs/map/map-impl.md §8.1` 列的那组**判据数字**（95/54/393/110…），打印出来给人眼对。
//   ⚠️ **不再产任何产物**（`game/data/unity/maps.json` 已退役）—— 运行时是"进一张图、取那张 XML、现场解析"。
//   ⚠️ 跨图统计（95/54/悬空）**只有本工具算得了**（要读全库）；运行时**不需要**它（人类 2026-10-18：不做索引）。
//
// 血统与口径（正本 = `docs/map/map-data.md §2/§3.2`）：
//   1) 写侧权威 = 重启（Unity）件 `Assets/Resources/Data/Maps/*.xml`（272 张，MQ1）；
//      AS3 的 `swf/map/config/*.xml`（259 张）**只作只读适配器输入**（swf 回退第 ② 级、initAs3 列），
//      两套 id 空间 / 两套坐标系**不许混算**（MDI3）。
//   2) **注释直接忽略**（人类 2026-10-18 / D11 / MDI7）：解析器内部先剥 `<!-- -->`；
//      本工具另按**原文**登记 `swf-missing`（= 线索只在注释里的那批，属**只读审计**、不是数据）。
//   3) **只做结构、不做语义**（MDI10）：四张处理器表以原始片段串进记录，本文件里**不许**出现 condition/action 判断。
//   4) 桥**不产** `walk` 列（通行面搁置 ⇒ MB8 不发码）；`battles[]` 列与两个 battle 审计**归 MB7**（本工具不产）。
//
// 用法：`node tools/map-audit.mjs`（只读上游 + 打印；重跑幂等，不改仓里任何文件）
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseMapXml, as3ResourceNameOf, as3InitOf, swfCandidatesFor,
} from '../game/logic/map/parse-map.js'
import { parseButtonFragment, lexDialogBranch } from '../game/logic/map/entity.js'   // ★MB7：battle 动作引用面（第二张边表，§3.1 归 M2 的 L0 lex）

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAPS_DIR = join(ROOT, 'projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps')
const AS3_DIR = join(ROOT, 'swf/map/config')       // AS3 血统：只读适配器输入
const SWF_DIR = join(ROOT, 'swf/map')              // 本地已有的地图 SWF

const haveSwf = new Set(readdirSync(SWF_DIR).filter((f) => f.endsWith('.swf')))
const exists = (name) => haveSwf.has(name)

const audit = {
  records: 0, negativeId: 0, kindTotals: {}, mapsWithTeleport: 0,
  'duplicate-teleport-id': [], 'empty-name': [], 'invalid-switch': [], 'dangling-target': [],
  'portal-inbound-none': [], 'portal-isolated': [],
  swfLevel: { 'unity-resId': 0, 'as3-resource': 0, id: 0, none: 0 }, swfOkFalse: [], 'swf-missing': [], 'swf-missing-resolvable': [],
  fightMapWritten: 0, fightMapOk: 0, wildCount: 0, wildMaps: 0, talkSelfImage: 0, talkSelfText: 0,
  npcMissingSize: [], resIdKind: {}, parseErrors: [],
  // ★MB7：battle 配方审计（`map-battle-trigger.md §3.1` 四类）—— dup/noEnemy 由桥（parse-map）填；dangling/unreferenced 在此跨图算
  battleBranchDup: [], battleBranchNoEnemy: [],
  'battle-action-dangling': [], 'battle-branch-unreferenced': [], battleActionTotal: 0, battleBranchTotal: 0,
}
const bump = (obj, k) => { obj[k] = (obj[k] || 0) + 1 }

const records = []
const registrations = []       // 光口边表（只读审计用）
const files = readdirSync(MAPS_DIR).filter((f) => f.endsWith('.xml')).sort()   // MDI8：.meta 不进桥

for (const file of files) {
  const raw = readFileSync(join(MAPS_DIR, file), 'utf8')
  const fileId = file.replace(/\.xml$/, '')
  const rec = parseMapXml(raw, { file, id: fileId, audit })
  if (!rec) { audit.parseErrors.push(`${file}: 无有效 <map>`); continue }

  // AS3 只读适配器（并存列 + swf 回退第 ② 级）
  const as3Path = join(AS3_DIR, fileId + '.xml')
  const as3Xml = existsSync(as3Path) ? readFileSync(as3Path, 'utf8') : null
  rec.initAs3 = as3InitOf(as3Xml)

  // MQ2 四级回退（不含注释级）
  const cands = swfCandidatesFor(rec, { id: fileId, as3Resource: as3ResourceNameOf(as3Xml) })
  // node 侧存在判据是同步的 ⇒ 这里同步挑（与浏览器的 HEAD 探针同语义）
  let swf = cands[0]?.name ?? null, swfOk = false, level = null
  for (const c of cands) { if (exists(c.name)) { swf = c.name; swfOk = true; level = c.level; break } }
  rec.swf = swf; rec.swfOk = swfOk
  bump(audit.swfLevel, level || 'none')
  if (!swfOk) {
    audit.swfOkFalse.push(fileId)
    // 线索只在注释里（不采纳，只登记）；并多记一笔"若照注释取，能不能 resolve"
    const clue = /<resource[^>]*>([^<]*)</.exec(raw) || /<resource\s+url="([^"]+)"/.exec(raw)
    if (clue) {
      audit['swf-missing'].push(fileId)
      const name = clue[1].split('/').pop()
      if (haveSwf.has(name) || haveSwf.has(name + '.swf')) audit['swf-missing-resolvable'].push(fileId)
    }
  }
  rec.fightMapOk = rec.fightMap != null && exists(`${rec.fightMap}.swf`)
  if (rec.fightMapOk) audit.fightMapOk++

  // ── 登记（同 `docs/map/map-data.md §3.2` 四类畸形 + 两个只读审计）
  const seenTp = new Set()
  for (const tp of rec.entities.teleports) {
    if (seenTp.has(String(tp.id))) audit['duplicate-teleport-id'].push(`${rec.id}#${tp.id}`)
    seenTp.add(String(tp.id))
    if (!tp.name) audit['empty-name'].push(`${rec.id}#${tp.id}`)
    registrations.push({ from: rec.id, to: tp.targetMapId })
  }
  if (rec.entities.teleports.length) audit.mapsWithTeleport++
  if (rec.switchRaw !== rec.switch) audit['invalid-switch'].push(`${rec.id}(${rec.switchRaw})`)
  if (rec.fightMap != null) audit.fightMapWritten++

  // 六类 `NpcInfo` 实体（npc/farm/animal/pond/insect/nest）的汇总
  let wildHere = false
  for (const key of ['npcs', 'farms', 'animals', 'ponds', 'insects', 'nests']) {
    for (const n of rec.entities[key]) {
      bump(audit.kindTotals, n.kind)
      bump(audit.resIdKind, n.resIdKind)
      if (n.wild) {
        wildHere = true; audit.wildCount++
        for (const s of n.wild.talk?.self ?? []) { if (s.image) audit.talkSelfImage++; else audit.talkSelfText++ }
      }
    }
  }
  audit.kindTotals.teleport = (audit.kindTotals.teleport || 0) + rec.entities.teleports.length
  if (wildHere) audit.wildMaps++

  records.push(rec)
  audit.records++
  if (Number(rec.id) < 0) audit.negativeId++
}

// ── 光口图：只读审计（TPI9；不阻塞、不归一化）────────────────────────────────
const idSet = new Set(records.map((r) => Number(r.id)))
const inbound = new Map()
for (const reg of registrations) {
  if (reg.to == null) continue
  if (!idSet.has(reg.to)) audit['dangling-target'].push(`${reg.from}→${reg.to}`)
  else inbound.set(reg.to, (inbound.get(reg.to) || 0) + 1)
}
for (const r of records) {
  const n = Number(r.id)
  const out = r.entities.teleports.length > 0
  const inn = (inbound.get(n) || 0) > 0
  if (!inn) audit['portal-inbound-none'].push(String(n))      // 95：没有任何光口指向（**含** isolated 那 54 张，TPI9）
  if (!inn && !out) audit['portal-isolated'].push(String(n))  // 54：连出边（`<teleport>`）也没有
}

// ── ★MB7 battle 交叉审计（`map-battle-trigger.md §2.7`/`§3.1`）──────────────────
//   引用来源 = 各 NPC 的 event/callback/dialog(func·reply) 里 `action=battle` 的 `param[0]`（本工具用 L1 lex，不建运行时表）；
//   branch 集 = 该 NPC 的 `battles[].id`（作用域 = 一个 NPC，`BTI3`，绝不跨 NPC 匹配）。
//   · `battle-action-dangling`（期望 8 = 1081–1088 的 `hell`）：**代码 bug** ⇒ ★报警（`BTQ2`/`BTC8` 的修法）。
//   · `battle-branch-unreferenced`（期望 154 = 147 数字门地板 + 7 具名）：**数据习惯** ⇒ 只读登记。
for (const rec of records) {
  for (const n of rec.entities.npcs) {
    const branchIds = new Set((n.battles || []).map((b) => String(b.id)))
    for (const b of n.battles || []) audit.battleBranchTotal++
    const refs = []
    const push = (spec) => { if (spec && spec.action === 'Battle') { const p = spec.param && spec.param[0]; if (p != null) refs.push(String(p)) } }
    for (const f of n.handlers?.eventHandler || []) push(parseButtonFragment(f, 'eventHandler'))
    for (const f of n.handlers?.callbackHandler || []) push(parseButtonFragment(f, 'callbackHandler'))
    for (const f of n.handlers?.dialog || []) {
      const lb = lexDialogBranch(f)
      if (lb) { for (const s of lb.funcs) push(s); for (const s of lb.replies) push(s) }
    }
    audit.battleActionTotal += refs.length
    const referenced = new Set()
    for (const r of refs) {
      if (branchIds.has(r)) referenced.add(r)
      else audit['battle-action-dangling'].push(`${n.id}→${r}`)     // 悬空引用 ⇒ 报警项
    }
    for (const id of branchIds) if (!referenced.has(id)) audit['battle-branch-unreferenced'].push(`${n.id}@${id}`)
  }
}

// ── 解析日志（判据见 docs/map/map-impl.md §8.1）────────────────────────────────
const L = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`)
console.log(`map-audit（方案 C：运行时现场解析；本工具只读、不产产物）`)
L('记录数', audit.records)
L('负 id', audit.negativeId)
L('七类实体', Object.entries(audit.kindTotals).map(([k, v]) => `${k}=${v}`).join(' '))
L('含 teleport 的图', audit.mapsWithTeleport)
L('portal-inbound-none（期望 95）', audit['portal-inbound-none'].length)
L('portal-isolated（期望 54）', audit['portal-isolated'].length)
L('duplicate-teleport-id / empty-name', `${audit['duplicate-teleport-id'].length} / ${audit['empty-name'].length}`)
L('invalid-switch（期望 1=71）', `${audit['invalid-switch'].length} ${JSON.stringify(audit['invalid-switch'])}`)
L('dangling-targetMapId', audit['dangling-target'].length)
L('swf 回退命中 ①②③', `${audit.swfLevel['unity-resId']} / ${audit.swfLevel['as3-resource']} / ${audit.swfLevel.id}`)
L('swfOk=false', `${audit.swfOkFalse.length}（其中线索只在注释里 = ${audit['swf-missing'].length}，照注释取能 resolve 的 = ${audit['swf-missing-resolvable'].length}）`)
L('fightMap 写了 / 本地有', `${audit.fightMapWritten} / ${audit.fightMapOk}`)
L('wild 条数 / 图数', `${audit.wildCount} / ${audit.wildMaps}`)
L('wild talk self', `image=${audit.talkSelfImage} text=${audit.talkSelfText}`)
L('npc 缺 size（MDC7）', audit.npcMissingSize.length)
L('resId 分类', Object.entries(audit.resIdKind).map(([k, v]) => `${k}=${v}`).join(' '))
L('解析失败', audit.parseErrors.length)
// ── ★MB7 battle 配方（`map-battle-trigger.md §7.3` 判据）
L('battle 分支总数（期望 680）', audit.battleBranchTotal)
L('battle 动作总数（期望 543）', audit.battleActionTotal)
L('battle-action-dangling（期望 8 = hell）', `${audit['battle-action-dangling'].length} ${JSON.stringify(audit['battle-action-dangling'])}`)
L('battle-branch-unreferenced（期望 154 = 147 数字 + 7 具名）', audit['battle-branch-unreferenced'].length)
L('battle-branch-dup（期望 0）', `${audit.battleBranchDup.length} ${JSON.stringify(audit.battleBranchDup)}`)
L('battle-branch-noEnemy（BTC5）', `${audit.battleBranchNoEnemy.length} ${JSON.stringify(audit.battleBranchNoEnemy)}`)
console.log('  ⚠️ 未产：walk 列（通行面搁置，MB8）')
if (audit.parseErrors.length) { for (const e of audit.parseErrors) console.log(`    ! ${e}`); process.exitCode = 1 }
