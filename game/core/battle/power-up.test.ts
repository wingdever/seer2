// BattlePet.PowerUp (BattlePet.cs:333-354) 的移植体 —— `petPowerUp` in battle/state.ts。
// 下一段要搬的 powerup 算子 (1346 行) 直接调它, 所以它的**怪癖**必须在这里就锁死:
//   · 先按 `IsPower()` 把袋里的能力增减类**全摘掉** (两支 RemoveRangeBuff 重载里走谓词那一支);
//   · 免疫检查只挡「写增幅」这半步, 挡不住后半段给**既有**增幅补印记 —— 上游没有 continue;
//   · isSet=true **只**跳过免疫检查: 写入那一半仍是 `AddPowerUp` 累加 (问过二进制: 起点 1 加 3 ⇒ 4,
//     与 isSet=false 同值; 参数名里的 "Set" 不是"覆盖"), 印记那半段本来就不过免疫;
//   · 印记的 value 是 |增幅|, turn 是 -1 (⇒ 由表决定), 且 id 被算了**两遍**。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { PrefabTable, effectFromRow, setEffectTable } from '../effect/effect.ts'
import { BuffInfo, setBuffTables } from '../buff/buff-info.ts'
import { Buff } from '../buff/buff.ts'
import { tryParseFloat } from '../strutil.ts'
import { Status } from '../pet/status.ts'
import { StatusController } from '../pet/status-controller.ts'
import { PetBuffController } from '../pet/buff-controller.ts'
import { Element } from '../pet/element.ts'
import { petPowerUp } from './state.ts'
import type { BattlePetView } from './views.ts'

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))
const BUFFS = JSON.parse(readFileSync(here('../../data/unity/buffs.json'), 'utf8')).buffs
const EFFECTS = new PrefabTable(JSON.parse(readFileSync(here('../../data/unity/effects.json'), 'utf8')).prefabs)
class LoadedBuffInfos {
  byId = new Map<number, BuffInfo>()
  constructor() { for (const b of BUFFS) { const info = new BuffInfo([String(b.id), b.name, b.typeRaw, b.copyHandleRaw, String(b.turn), b.options.map(([k, x]: [string, string]) => `${k}=${x}`).join('&'), b.description]); info.setEffects(b.effects.map(effectFromRow)); this.byId.set(info.id, info) } }
  getBuffInfo(id: number): BuffInfo | null { return id === 0 ? null : (this.byId.get(id) ?? null) }
}
setEffectTable(EFFECTS)
const TABLE = new LoadedBuffInfos()
setBuffTables(TABLE, EFFECTS, (s) => tryParseFloat(s) ?? 0)

const mkPet = (opts: { powerup?: [number, number], block?: number[], buffs?: number[] } = {}): BattlePetView => {
  const sc = new StatusController(new Status([0, 0, 0, 0, 0, 100]), 100, 20)
  if (opts.powerup) sc.setPowerUpType(opts.powerup[0], opts.powerup[1])
  const bc = new PetBuffController(Element.普通, Element.普通, (opts.buffs ?? []).map((id) => new Buff(id, 2, 1)))
  if (opts.block) bc.blockBuff(opts.block)
  return { statusController: sc, buffController: bc } as unknown as BattlePetView
}
const bag = (pet: BattlePetView): string[] => pet.buffController.buffs.map((x: Buff) => `${x.id}:${x.value}`)
const pw0 = (pet: BattlePetView): number => pet.statusController.getPowerUpType(0)

test('PowerUp 先按 IsPower 清空能力增减类印记, 正负两向、各类型都被摘', () => {
  // 1 (atk+) / 2 (atk−) / -9 (全属性+) 都算 IsPower; 1008 不是 ⇒ 留在袋里。
  const pet = mkPet({ buffs: [1, 2, -9, 1008] })
  petPowerUp(pet, new Status([3, 0, 0, 0, 0, 0]), null, null)
  assert.deepEqual(bag(pet).filter((x) => !x.startsWith('1008')), ['1:3'])
  assert.ok(bag(pet).some((x) => x.startsWith('1008')))
})

test('免疫挡得住「写增幅」, 挡不住「给既有增幅补印记」—— 上游这一支没有 continue', () => {
  // 当前 atk 增幅 3 (印记 id 1)。要求 +5 的印记同样映射到 id 1 ⇒ 被免疫挡住, 增幅不写;
  // 但后半段重读 powerup 仍是 3 ⇒ id 1 ≠ 0 ⇒ 照样补一枚 value=3 的印记。
  const blocked = mkPet({ powerup: [0, 3], block: [1] })
  petPowerUp(blocked, new Status([5, 0, 0, 0, 0, 0]), null, null)
  assert.equal(pw0(blocked), 3)
  assert.deepEqual(bag(blocked), ['1:3'])

  // 对照: 不被免疫时写的是 3+5 再钳到 6 (SetPowerUp 的钳), 印记 value 跟着变成 6。
  const open = mkPet({ powerup: [0, 3] })
  petPowerUp(open, new Status([5, 0, 0, 0, 0, 0]), null, null)
  assert.equal(pw0(open), 6)
  assert.deepEqual(bag(open), ['1:6'])
})

test('isSet=true 跳过免疫检查 (写入), 但印记那半段照旧', () => {
  // 同一条 blocked 形状, 只差 isSet: false ⇒ 增幅不写 (pw 仍 3); true ⇒ 3+2=5 照样累加进去。
  // 这里的增量刻意取 2 而不是 5, 免得被 ±6 的钳把"覆盖还是累加"这一问题糊掉。
  const pet = mkPet({ powerup: [0, 3], block: [1] })
  petPowerUp(pet, new Status([2, 0, 0, 0, 0, 0]), null, null, true)
  assert.equal(pw0(pet), 5)
  assert.deepEqual(bag(pet), ['1:5'])
})

test('第 6 维借用的是全属性印记 -9/-10, 正负分两枚', () => {
  const up = mkPet()
  petPowerUp(up, new Status([0, 0, 0, 0, 0, 4]), null, null)
  assert.deepEqual(bag(up), ['-9:4'])
  const down = mkPet()
  petPowerUp(down, new Status([0, 0, 0, 0, 0, -4]), null, null)
  assert.deepEqual(bag(down), ['-10:4'])          // value 是 Mathf.Abs(增幅)
})

test('增幅为 0 的那一维不配印记 (id==0 直接 continue), 所以六维里只出现非零项', () => {
  const pet = mkPet()
  petPowerUp(pet, new Status([0, -2, 0, 0, 3, 0]), null, null)
  assert.deepEqual(bag(pet).map((x) => Number(x.split(':')[0])).sort((a, b) => a - b), [4, 9])
})

test('Buff.getBuffInfo 的静态入口就是查表本身: 0 与不在表里的 id 都给 null, 不兜底', () => {
  assert.equal(Buff.getBuffInfo(0), null)
  assert.equal(Buff.getBuffInfo(99_9999), null)
  assert.equal(Buff.getBuffInfo(1008)!.id, 1008)
})
