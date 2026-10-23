// 印记候选白名单复算器 (S3 第六段·批一步骤 3 立的闸门)。
// 递归口子解围栏后, add_buff/remove_buff 会把印记的 OnAddBuff/OnRemoveBuff 触发链跑起来:
// 「oracle 真跑到未移植算子、TS 抛 NOT_PORTED」就是翻红。所以进对拍的印记必须满足
// 「它的触发时机上的效果的 ability ⊆ oracle 的 PortedAbilities」。这一族是 2121 行手工挑不出来的, 就扫表。
//
//   node tools/buff-whitelist.mjs                       用当前 PortedAbilities 扫
//   node tools/buff-whitelist.mjs 7                     额外把 powerup 当已移植 (只为看数字怎么变)
//   node tools/buff-whitelist.mjs -- 5                  从白名单里**摘掉** heal, 复算批一步骤 3 的 1904/217
//
// 扫描集默认 **不含** on_effect(-10): 全表只有 6 行挂它 (93/1020/2102/3668/100993/200471),
// 算子全是 baked abilityId=0, 算不算进来这两个数字一样 —— heal 一族要用的正是这 6 行。
import { readFileSync } from 'node:fs'

// 与 tools/oracle-cs/Program.cs:1849 的 PortedAbilities 同步 (0=none 8=set_damage 14=add_status
// 10=add_buff 11=remove_buff 5=heal 3=capture 4=pet_change 15=set_skill 1=win 2=escape
// 17=set_weather 9=block_buff)。7=powerup **故意不在**: 上游 Powerup 方法入口就 SecurityException。
// ⚠️ 1/2 (win/escape) 在表里, 但它们的**结果面**撞 Photon ECall ⇒ 只发问得出答案的形状 (playbook §6)。
const PORTED = new Set([0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9])
let drop = false
for (const x of process.argv.slice(2)) {
  if (x === '--') { drop = true; continue }
  if (drop) PORTED.delete(Number(x))
  else PORTED.add(Number(x))
}

const TRIG = new Set([-3, -4, -999])
const buffs = JSON.parse(readFileSync(new URL('../game/data/unity/buffs.json', import.meta.url), 'utf8')).buffs

const dirtyByAbility = new Map()
let safe = 0
const dirty = []
for (const b of buffs) {
  const bad = (b.effects ?? []).filter((e) => TRIG.has(e.timingId) && !PORTED.has(e.abilityId))
  if (bad.length === 0) { safe++; continue }
  dirty.push(b.id)
  for (const e of bad) dirtyByAbility.set(e.abilityRaw ?? String(e.abilityId), (dirtyByAbility.get(e.abilityRaw) ?? 0) + 1)
}

console.log(`白名单 [${[...PORTED].sort((x, y) => x - y).join(',')}] ⇒ 安全 ${safe} / 脏 ${dirty.length} (共 ${buffs.length})`)
console.log('脏在哪些算子上:', [...dirtyByAbility].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '))
