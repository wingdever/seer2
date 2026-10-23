// Browser glue for the arcadia-eternity v2 battle kernel.
// Bundled (rolldown, everything inlined) into game/battle-kernel.js
// Exposes window.BattleKernel for battle.html.

import { createBattleFromConfig } from './src/v2/data/battle-factory.js'
import { createRepositoryFromRawData } from './src/v2/data/repository-from-raw.js'
import { LocalBattleSystemV2 } from './src/v2/local-battle.js'

const STATS_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const

function zeros() {
  const o: Record<string, number> = {}
  for (const k of STATS_KEYS) o[k] = 0
  return o
}

function full(ivs?: Record<string, number>) {
  const o = zeros()
  for (const k of STATS_KEYS) o[k] = ivs && k in ivs ? ivs[k] : 31
  return o
}

// One side may field 1..N pets: cfg.pets = [petcfg, ...] (fallback: [cfg] single).
// Base-data ids are namespaced per side+pet: species_L0, skill_L0_0 ...
function buildSide(cfg: any, tag: string) {
  const petCfgs: any[] = cfg.pets ?? [cfg]
  const species: any[] = []
  const skillRaw: any[] = []
  const team: any[] = []
  petCfgs.forEach((p: any, pi: number) => {
    const speciesId = `species_${tag}${pi}`
    species.push({
      id: speciesId,
      num: p.swfId ?? 0,
      element: p.element,
      baseStats: { ...zeros(), ...p.stats },
      genderRatio: [50, 50],
      heightRange: [50, 100],
      weightRange: [20, 40],
      ability: [],
      emblem: [],
    })
    const skillIds: string[] = []
    ;(p.skills ?? []).forEach((s: any, i: number) => {
      const id = `skill_${tag}${pi}_${i}`
      skillIds.push(id)
      skillRaw.push({
        id,
        category: s.category ?? 'Status',
        element: s.element ?? p.element,
        power: s.power ?? 0,
        accuracy: s.accuracy ?? 100,
        rage: s.rage ?? 0,
        priority: s.priority ?? 0,
        multihit: 1,
        sureHit: s.sureHit ?? false,
        sureCrit: s.sureCrit ?? false,
        tags: [],
        effect: s.effectIds ?? [],
      })
    })
    team.push({
      name: p.name,
      species: speciesId,
      level: p.level ?? 50,
      evs: zeros(),
      ivs: full(p.ivs),
      nature: 'Hardy',
      skills: skillIds,
    })
  })
  return { species, skillRaw, team, teamConfig: { name: cfg.name, team } }
}

const SKILL_META = new Map<string, { name: string; desc?: string }>()
const _listeners = new Set<(msg: any) => void>()

let _battle: any = null
let _system: LocalBattleSystemV2 | null = null
let _sideByPet = new Map<string, string>()
// petId (runtime entity id) -> display meta from the side config
const _petMeta = new Map<string, { side: string; name: string; swfId: number; level: number; index: number }>()
const _playerBySide = new Map<string, string>()

async function start(config: any): Promise<any> {
  const sides = ['left', 'right']
  const built = sides.map((tag, si) => buildSide(config[tag], tag[0].toUpperCase()))
  SKILL_META.clear()
  _sideByPet = new Map()
  _petMeta.clear()
  _playerBySide.clear()
  built.forEach((s, si) => {
    const cfg = config[sides[si]]
    const petCfgs: any[] = cfg.pets ?? [cfg]
    s.skillRaw.forEach((sk: any) => {
      const m = String(sk.id).match(/^skill_[LR](\d+)_(\d+)$/)
      const pi = m ? Number(m[1]) : 0
      const i = m ? Number(m[2]) : 0
      SKILL_META.set(sk.id, { name: petCfgs[pi]?.skills?.[i]?.name ?? sk.id, desc: petCfgs[pi]?.skills?.[i]?.desc })
    })
  })

  const repo = createRepositoryFromRawData({
    effects: config.effects ?? [],
    marks: [],
    skills: [...built[0].skillRaw, ...built[1].skillRaw],
    species: [...built[0].species, ...built[1].species],
  })
  _battle = createBattleFromConfig(built[0].teamConfig, built[1].teamConfig, repo, { seed: config.seed ?? String(Date.now()) })
  _system = new LocalBattleSystemV2(_battle)
  _system.BattleEvent(msg => {
    for (const cb of _listeners) cb(msg)
  })
  await _system.ready()
  const st = await snapshot()
  const info = {
    players: st.players.map((p: any, si: number) => {
      const side = sides[si]
      const cfg = config[side]
      const petCfgs: any[] = cfg.pets ?? [cfg]
      const team = (p.team ?? []).map((pet: any, pi: number) => {
        const m = {
          side,
          name: petCfgs[pi]?.name ?? cfg.name,
          swfId: petCfgs[pi]?.swfId ?? cfg.swfId ?? 0,
          level: petCfgs[pi]?.level ?? 50,
          index: pi,
        }
        _petMeta.set(String(pet.id), m)
        _sideByPet.set(String(pet.id), side)
        return { petId: pet.id, ...m }
      })
      for (const pet of p.team ?? []) _sideByPet.set(String(pet.id), side)
      _playerBySide.set(side, String(p.id))
      return { side, id: p.id, name: p.name, activePet: p.activePet, team }
    }),
  }
  return info
}

async function snapshot(showHidden = true) {
  if (!_system) throw new Error('kernel not started')
  const st: any = await _system.getState(undefined as any, showHidden)
  for (const p of st.players)
    for (const pet of p.team ?? [])
      for (const s of pet.skills ?? []) {
        const meta = SKILL_META.get(String(s.baseId)) ?? SKILL_META.get(String(s.id))
        if (meta) (s as any).name = meta.name
      }
  return st
}

function sideOfPet(petId: string) {
  return _sideByPet.get(String(petId)) ?? 'left'
}

function petMeta(petId: string) {
  return _petMeta.get(String(petId)) ?? null
}

function _playerId(st: any, side: string) {
  const idx = side === 'right' ? 1 : 0
  return st.players[idx]?.id
}

// instance-id -> base-id (selections reference skill instances; configs reference base ids)
function _instBaseMap(st: any) {
  const m = new Map<string, string>()
  for (const p of st.players)
    for (const pet of p.team ?? [])
      for (const s of pet.skills ?? []) m.set(String(s.id), String(s.baseId))
  return m
}

async function available(side: string) {
  if (!_system) return []
  const st = await snapshot()
  const pid = _playerId(st, side)
  if (!pid) return []
  const ib = _instBaseMap(st)
  const sels = await _system.getAvailableSelection(pid as any)
  return (sels ?? []).map((s: any, i: number) => {
    if (s.type === 'use-skill') {
      const base = ib.get(String(s.skill)) ?? String(s.skill)
      const meta = SKILL_META.get(base)
      return { index: i, type: s.type, skill: s.skill, baseId: base, name: meta?.name ?? base }
    }
    if (s.type === 'switch-pet') {
      const m = _petMeta.get(String(s.pet))
      return { index: i, type: s.type, pet: s.pet, name: m?.name ?? String(s.pet), swfId: m?.swfId ?? 0 }
    }
    return { index: i, type: s.type, skill: s.skill, raw: s }
  })
}

// Play by base skill id (from a skill card) or instance id — matches the use-skill selection.
async function playSkill(side: string, skillInstanceId: string) {
  if (!_system) throw new Error('kernel not started')
  const st = await snapshot()
  const pid = _playerId(st, side)
  const ib = _instBaseMap(st)
  const sels: any = await _system.getAvailableSelection(pid as any)
  const want = String(skillInstanceId)
  let sel = (sels ?? []).find((s: any) => s.type === 'use-skill' && (String(s.skill) === want || ib.get(String(s.skill)) === want))
  if (!sel) throw new Error(`no use-skill selection for ${side} -> ${want}`)
  await _system.submitAction(sel)
  return sel
}

async function switchPet(side: string, petId: string) {
  if (!_system) throw new Error('kernel not started')
  const st = await snapshot()
  const pid = _playerId(st, side)
  const sels: any = await _system.getAvailableSelection(pid as any)
  const sel = (sels ?? []).find((s: any) => s.type === 'switch-pet' && String(s.pet) === String(petId))
  if (!sel) throw new Error(`no switch-pet selection for ${side} -> ${petId}`)
  await _system.submitAction(sel)
  return sel
}

// Submit an already-obtained selection object (surrender / do-nothing / future types).
async function submit(sel: any) {
  if (!_system) throw new Error('kernel not started')
  await _system.submitAction(sel)
  return sel
}

// Out-of-turn world access (items/capture mutate state without a kernel action).
function hp(petId: string): { current: number; max: number } {
  if (!_battle) throw new Error('kernel not started')
  const { world, attrSystem } = _battle
  return {
    current: attrSystem.getBaseValue(world, petId as any, 'currentHp') as number,
    max: attrSystem.getBaseValue(world, petId as any, 'maxHp') as number,
  }
}

function setHp(petId: string, value: number) {
  if (!_battle) throw new Error('kernel not started')
  const { world, attrSystem } = _battle
  const max = attrSystem.getBaseValue(world, petId as any, 'maxHp') as number
  const v = Math.max(0, Math.min(max, Math.round(value)))
  attrSystem.setBaseValue(world, petId as any, 'currentHp', v)
  return v
}

function events(cb: (msg: any) => void) {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

// Player rage (怒气) lives on the player entity as currentRage/maxRage.
function rage(side: string): { current: number; max: number } {
  if (!_battle) throw new Error('kernel not started')
  const pid = _playerBySide.get(side)
  if (!pid) throw new Error(`unknown side ${side}`)
  const { world, attrSystem } = _battle
  return {
    current: attrSystem.getBaseValue(world, pid, 'currentRage') as number,
    max: attrSystem.getBaseValue(world, pid, 'maxRage') as number,
  }
}

function setRage(side: string, value: number) {
  if (!_battle) throw new Error('kernel not started')
  const pid = _playerBySide.get(side)
  if (!pid) throw new Error(`unknown side ${side}`)
  const { world, attrSystem } = _battle
  const max = attrSystem.getBaseValue(world, pid, 'maxRage') as number
  const v = Math.max(0, Math.min(max, Math.round(value)))
  attrSystem.setBaseValue(world, pid, 'currentRage', v)
  return v
}

async function cleanup() {
  await _system?.cleanup()
}

;(globalThis as any).BattleKernel = {
  start, snapshot, sideOfPet, petMeta, available, playSkill, switchPet, submit,
  hp, setHp, rage, setRage, events, cleanup, battleRef: () => _battle,
}
export {}
