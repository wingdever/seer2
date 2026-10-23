// PetBattleStatusController 的八个写入口 + Status 的四张名字表 (第五段·步骤2)。
// 这些是下一段搬 powerup / add_status 那批算子时要调的**突变器底座**: 数值一致性由对拍的
// statusctrl 族 (94 条) 逐值保证, 这里锁的是"参数到底被不被读""就地改还是换引用""钳与不钳"
// 这三类形状 —— 它们最容易在重写时被"看起来更合理"的版本悄悄换掉。

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { Status } from './status.ts'
import { StatusController } from './status-controller.ts'

const sc = (init = [10, 20, 30, 40, 50, 100], hp = 60, anger = 20): StatusController =>
  new StatusController(new Status(init), hp, anger)
const six = (s: Status): number[] => [0, 1, 2, 3, 4, 5].map((i) => s.at(i))

test('MultInitStatus **收了 type 但不读** —— 整条 init 一起乘; MultCurrentStatus 才是逐维', () => {
  const a = sc()
  a.multInitStatus(3, 2)
  assert.deepEqual(six(a.initStatus), [20, 40, 60, 80, 100, 200])
  const b = sc()
  b.multCurrentStatus(3, 2)
  assert.deepEqual(six(b.multStatus), [1, 1, 1, 2, 1, 1])
})

test('AddInitStatus(Status) 是 `+` 出新表再赋回; AddInitStatus(int,int) 是就地 += —— 引用外泄的方向相反', () => {
  const a = sc()
  const before = a['_initStatus']
  a.addInitStatus(new Status([1, 1, 1, 1, 1, 1]))
  assert.notEqual(a['_initStatus'], before)          // 换引用: 旧引用还指着老值
  assert.deepEqual(six(before), [10, 20, 30, 40, 50, 100])

  const b = sc()
  const before2 = b['_initStatus']
  b.addInitStatusType(0, 5)
  assert.equal(b['_initStatus'], before2)            // 就地改: 拿着旧引用的人看得到新值
  assert.deepEqual(six(before2), [15, 20, 30, 40, 50, 100])
})

test('AddBattleStatus 以 Status.typeNames.Length (=6) 分界, 上半进 add 段、下半**减 6** 进隐藏段', () => {
  const c = sc()
  c.addBattleStatus(2, 7)
  assert.deepEqual(six(c.addStatus), [0, 0, 7, 0, 0, 0])
  const d = sc()
  d.addBattleStatus(8, -3)                            // 8-6=2 ⇒ 隐藏段第 3 维 (def)
  assert.deepEqual(six(d.hiddenStatus), [0, 0, -3, 0, 100, 100])
})

test('越界的 type 静默不写 (Status.setAt 的 0..5 守卫), 但读取侧同样静默给 0', () => {
  const c = sc()
  c.addInitStatusType(6, 5)
  c.addHiddenStatus(-1, 9)
  assert.deepEqual(six(c.initStatus), [10, 20, 30, 40, 50, 100])
  assert.equal(c['_hiddenStatus'].at(-1), 0)
})

test('SetPowerUp 写的是**钳过的值**, SetMin/MaxPowerUp 不钳不截也不管次序', () => {
  const c = sc()
  c.setPowerUpType(0, 99)
  assert.deepEqual(six(c.powerup), [6, 0, 0, 0, 0, 0])
  c.setPowerUp(new Status([1.9, -1.9, 6.5, -6.5, 7, -7]))
  assert.deepEqual(six(c.powerup), [1, -1, 6, -6, 6, -6])   // (int) 截断在 Clamp **之前**, 见 :169-175

  const d = sc()
  d.setMinPowerUpType(2, 999)
  assert.equal(d.minPowerUp.at(2), 999)               // 不钳: 直接写字段
  d.setMaxPowerUp(new Status([0, 0, 3, 0, 0, 0]))
  assert.equal(d.maxPowerUp.at(2), 3)
})

test('min 盖过 max 时 GetPowerUp 给出 Unity Clamp 的鬼值 (读的是 powerup 属性, 不是裸字段)', () => {
  // 这条是从对拍里钓出来的移植体缺陷: `GetPowerUp(type)` 上游写的是 `(int)powerup[type]`,
  // 读**属性** (已过 Clamp + FloorToInt) 而不是 `_powerup` 裸字段 —— 裸字段在这里给 0。
  const c = sc()
  c.setMinPowerUpType(2, 9)
  c.setMaxPowerUpType(2, 3)
  assert.equal(c['_powerup'].at(2), 0)
  assert.equal(c.getPowerUpType(2), 9)
  assert.deepEqual(six(c.powerup), [0, 0, 9, 0, 0, 0])
})

test('AddPowerUp 读的是 powerup 属性 ⇒ 越界的当前增幅先被夹回来, 加完再过一次钳', () => {
  const c = sc()
  c['_powerup'].setAt(0, 999)                          // 裸字段可以越界, 属性会夹到上界 6
  c.addPowerUp(0, 3)                                   // 6 + 3 = 9 → SetPowerUp 再钳回 6
  assert.equal(c.getPowerUpType(0), 6)
  assert.equal(c['_powerup'].at(0), 6)                 // 写回的是**钳过的值**, 不是 999+3
})

test('GetStatusIdentifier: init 前缀读副本属性, base 前缀在没有宿主时恒 0, 其余落 battleStatus', () => {
  const c = sc([0, 0, 0, 0, 0, 50], 30)
  assert.equal(c.getStatusIdentifier('initrec'), 0)
  assert.equal(c.getStatusIdentifier('baseatk'), 0)
  assert.equal(c.getStatusIdentifier('baseatk', () => 77), 77)
  assert.equal(c.getStatusIdentifier('hp'), 30)
  assert.equal(c.getStatusIdentifier('unknown'), 0)
})

test('Status 的四张名字表是**每次访问新建一份** (上游是表达式体属性), hp 与 hit 只差最后一维', () => {
  const a = Status.typeNames
  a[0] = 'MUTATED'
  assert.notEqual(Status.typeNames[0], 'MUTATED')      // 改不到别人手里的那份
  assert.deepEqual(Status.typeNames, ['atk', 'mat', 'def', 'mdf', 'spd', 'hp'])
  assert.deepEqual(Status.powerupNames, ['atk', 'mat', 'def', 'mdf', 'spd', 'hit'])
  assert.equal(Status.typeNames.length, 6)
  assert.equal(Status.powerupNames.length, 6)
  assert.ok(Status.powerupNamesChinese.every((x) => x.length > 0))
})
