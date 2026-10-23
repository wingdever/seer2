// M0 技术探针: 验证内核多宠队伍/换宠/回合外直改HP/击杀强制换宠/胜负链
// 内核规则(已核实 turn.handler.ts): switch-pet 是一种回合行动, 需敌方也提交后整回合才结算;
// 主动换宠先行执行(priority 排序 switch first)。濒死窗口 available 仅 switch-pet/surrender。
// 用法: node tools/verify-kernel-ops.mjs
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
await import(pathToFileURL(path.join(ROOT, 'game/battle-kernel.js')).href)
const K = globalThis.BattleKernel
if (!K) { console.error('FAIL: BattleKernel 未导出'); process.exit(1) }

const DB = JSON.parse(readFileSync(path.join(ROOT, 'game/data/pets.json'), 'utf8'))
const LEVEL = 100

function petConfig(id, level = LEVEL) {
  const m = DB.monsters[id] || DB.monsters[1]
  const list = (m.skillIds || []).map(i => DB.skills[i]).filter(Boolean)
  const super1 = list.find(s => s.category === 'Climax')
  const normals = list.filter(s => s.category !== 'Climax').slice(0, 4)
  const picked = super1 ? [...normals, super1] : normals
  return {
    name: m.name, swfId: m.id, level, element: m.element, stats: m.stats,
    skills: picked.map(s => ({ name: s.name, power: s.power, accuracy: s.accuracy, rage: s.rage, category: s.category, element: s.element })),
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, ms = 4000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(150) }
  return false
}
const events = []
K.events(m => { events.push(m); if (process.env.KPROBE) console.log('[ev]', m.type, JSON.stringify(m.data ?? {}).slice(0, 140)) })
const lastEv = type => [...events].reverse().find(e => e.type === type)

let fails = 0
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++ }

// 提交一侧的一个行动: 技能(idx)/换宠/team-selection/其余 raw
async function step(side, skillIdx = 0) {
  const av = await K.available(side)
  if (!av.length) return null
  if (av.some(s => s.type === 'team-selection')) {
    const st = await K.snapshot()
    const p = side === 'right' ? st.players[1] : st.players[0]
    const raw = av.find(s => s.type === 'team-selection').raw ?? {}
    await K.submit({ ...raw, player: raw.player ?? p.id, selectedPets: p.team.map(t => t.id), starterPetId: p.team[0].id, type: 'team-selection' })
    await sleep(250)
    return 'team-selection'
  }
  const sw = av.find(s => s.type === 'switch-pet')
  const sk = av.filter(s => s.type === 'use-skill')
  if (sk.length) {
    const s = sk[side === 'left' ? skillIdx % sk.length : 0]
    await K.playSkill(side, s.skill)
    await sleep(250)
    return 'use-skill'
  }
  if (sw) { await K.switchPet(side, sw.pet); await sleep(250); return 'switch-pet' }
  const s0 = av[0]
  await K.submit(s0.raw ?? s0)
  await sleep(250)
  return s0.type
}


async function fullTurn(leftIdx = 0) {
  await step('left', leftIdx)
  await step('right')
  await waitFor(async () => {
    for (const side of ['left', 'right']) {
      const av = await K.available(side)
      if (av.length && !av.some(s => s.type === 'use-skill')) return true
    }
    return false
  }, 1500)
  await sleep(150)
}

let PIDS = {}
async function activePetId(side) {
  const st = await K.snapshot()
  const p = PIDS[side] ? st.players.find(x => x.id === PIDS[side]) : (side === 'right' ? st.players[1] : st.players[0])
  return p.activePet
}

// ---- 场景: 左 3 宠队 vs 右 2 宠队 ----
console.log('== M0: 3v2 队伍开局 ==')
const L = [petConfig(3), petConfig(50), petConfig(74)]
const R = [petConfig(6), petConfig(82)]
const info = await K.start({
  seed: 'm0-probe',
  left: { name: '训练家', pets: L },
  right: { name: '野生队', pets: R },
})
const LP = info.players.find(p => p.side === 'left')
const RP = info.players.find(p => p.side === 'right')
PIDS = { left: LP.id, right: RP.id }
ok(LP.team.length === 3, `左队 3 宠: ${LP.team.map(t => t.name).join('/')}`)
ok(RP.team.length === 2, `右队 2 宠: ${RP.team.map(t => t.name).join('/')}`)
ok(LP.team.every(t => t.petId && K.petMeta(t.petId)?.swfId > 0), 'petId→swfId 元数据可查')

await waitFor(async () => (await K.available('left')).length > 0, 4000)

// ---- 主动换宠(占本回合行动, 敌方提交后结算) ----
console.log('== M0: 主动换宠 ==')
await fullTurn(0)
const before = await activePetId('left')
const target = LP.team.find(t => t.petId !== before)
await step('left') // 若上回合未闭合先清一次
await K.switchPet('left', target.petId)
await step('right')
await waitFor(async () => (await activePetId('left')) === target.petId, 3000)
const after = await activePetId('left')
ok(after === target.petId, `activePet 切换 ${before} -> ${after}`)
ok(events.some(e => e.type === 'PET_SWITCH'), 'PET_SWITCH 事件已发射')

// ---- 回合外直改 HP ----
console.log('== M0: setHp/hp 直改 world ==')
const rAct = await activePetId('right')
const maxHp = K.hp(rAct).max
K.setHp(rAct, 1)
ok(K.hp(rAct).current === 1, `右 active HP ${maxHp} -> 1 (回合外, 不经 submitAction)`)
K.setHp(rAct, maxHp + 999)
ok(K.hp(rAct).current === maxHp, '越界钳制到 maxHp')
K.setHp(rAct, 1)

// 左侧出攻击技 (power>0 优先); 无可用则按 step 的兜底逻辑
async function stepAtk() {
  const act = await activePetId('left')
  const m = K.petMeta(act)
  const av = await K.available('left')
  const sk = av.filter(s => s.type === 'use-skill')
  const withPow = sk.find(s => { const i = Number(String(s.baseId ?? '').match(/_(\d+)$/)?.[1] ?? -1); return (m?.index != null && L[m.index]?.skills?.[i]?.power > 0) })
  const s = withPow ?? sk.find(x => true) ?? av.find(y => y.type === 'switch-pet') ?? av[0]
  if (!s) return null
  if (s.type === 'use-skill') await K.playSkill('left', s.skill)
  else if (s.type === 'switch-pet') await K.switchPet('left', s.pet)
  else await K.submit(s.raw ?? s)
  await sleep(250)
  return s.type
}

// ---- 击杀 -> 强制换宠只允许 switch/surrender ----
console.log('== M0: 击杀与强制换宠 ==')
let guard = 0
let faintWin = false
while (guard++ < 12 && !faintWin) {
  K.setHp(rAct, 1)
  await stepAtk()
  await step('right', 0)
  faintWin = await waitFor(async () => {
    const av = await K.available('right')
    return av.length > 0 && av.every(s => s.type === 'switch-pet' || s.type === 'surrender')
  }, 1500)
}
const defeated = events.filter(e => e.type === 'PET_DEFEATED' && (e.data?.pet === rAct || e.data?.target === rAct))
ok(defeated.length >= 1, 'PET_DEFEATED 触发 (右首发被击杀)')
ok(faintWin, '濒死窗口 available 仅 switch-pet/surrender')
const rSecond = (await K.available('right')).find(s => s.type === 'switch-pet')
if (!rSecond) { ok(false, '濒死窗口内未找到 switch-pet 选项') }
else {
  await K.switchPet('right', rSecond.pet)
  await waitFor(async () => (await activePetId('right')) !== rAct, 1500)
  let nowR = await activePetId('right')
  if (nowR === rAct) { // 若 SWITCH_PHASE 需下一动作推进
    await stepAtk()
    await step('right', 0)
    await waitFor(async () => (await activePetId('right')) !== rAct, 3000)
    nowR = await activePetId('right')
  }
  const rightIds = RP.team.map(t => t.petId)
  ok(nowR !== rAct && rightIds.includes(nowR), `右队后备上场 (现 active ${nowR}, 右队 ${rightIds.join('/')}, 指定 ${rSecond.pet}), 战斗继续`)
}

// ---- 灭队 -> BATTLE_END ----
console.log('== M0: 灭队判负 ==')
guard = 0
let ended = false
while (!ended && guard++ < 30) {
  for (const p of RP.team) { const h = K.hp(p.petId); if (h.current > 1) K.setHp(p.petId, 1) }
  for (const p of LP.team) { const h = K.hp(p.petId); if (h.current < 5) K.setHp(p.petId, h.max) }
  await stepAtk()
  await step('right')
  ended = !!(await waitFor(() => !!lastEv('BATTLE_END'), 800))
  if (!ended) await step('right') // 吃右队可能的强制换宠窗口
}
ok(ended, 'BATTLE_END 触发')
const end = lastEv('BATTLE_END')
ok(end?.data?.winner === LP.id, `winner = 左玩家 (${end?.data?.winner}) reason=${end?.data?.reason}`)

await K.cleanup()
console.log(fails === 0 ? '\nM0 ALL PASS' : `\nM0 FAIL x${fails}`)
process.exit(fails === 0 ? 0 : 1)
