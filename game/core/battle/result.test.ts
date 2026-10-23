// BattleResult 的状态形状锁 —— 只拍搬过来的那半 (identifier + 拷贝构造), 结算链在 S5。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BattleResult, BattleResultState } from './result.ts'

const FLOAT_MIN = -3.4028234663852886e38

test('构造: fightPetCursors 是 Range(0, parallelCount), parallelCount=0 时是空集', () => {
  assert.deepEqual([...new BattleResult({ parallelCount: 3 }).fightPetCursors], [0, 1, 2])
  assert.equal(new BattleResult({ parallelCount: 0 }).fightPetCursors.size, 0)
  assert.equal(new BattleResult({ parallelCount: 1 }).getResultIdentifier('fightPetCount'), 1)
})

test('六个布尔判定各自的成员集合 (Timeout 既不是 KO 也不是 Escape, 双 win 皆 false)', () => {
  const mk = (state: BattleResultState) => {
    const r = new BattleResult({ parallelCount: 1 })
    r.setState(state)
    return r
  }
  assert.equal(mk(BattleResultState.Error).isBattleEnd, true)
  assert.equal(mk(BattleResultState.Timeout).isBattleEnd, true)
  assert.equal(mk(BattleResultState.Fighting).isBattleEnd, false)

  const timeout = mk(BattleResultState.Timeout)
  assert.equal(timeout.isKO, false)
  assert.equal(timeout.isEscape, false)
  assert.equal(timeout.isMyWin, false)
  assert.equal(timeout.isOpWin, false)
  assert.equal(timeout.getResultIdentifier('isEnd'), 1)

  assert.equal(mk(BattleResultState.OpEscape).isMyWin, true)
  assert.equal(mk(BattleResultState.CaptureSuccess).isMyWin, true)
  assert.equal(mk(BattleResultState.MyEscape).isOpWin, true)
  assert.equal(mk(BattleResultState.Lose).isKO, true)
})

test('getResultIdentifier: capturePet. 前缀在 switch 之前, 未捕捉时统一给 -1', () => {
  const r = new BattleResult({ parallelCount: 1 })
  assert.equal(r.getResultIdentifier('capturePet.level'), -1)
  assert.equal(r.getResultIdentifier('capturePet.'), -1)      // 空串也走进去
  assert.equal(r.getResultIdentifier('zzz'), FLOAT_MIN)

  const seen: string[] = []
  r.capturePet = {
    getPetIdentifier: (id: string) => { seen.push(id); return id === 'level' ? 42 : FLOAT_MIN },
  }
  assert.equal(r.getResultIdentifier('capturePet.level'), 42)
  assert.equal(r.getResultIdentifier('capturePet.maxHp'), FLOAT_MIN)   // 宠侧不认的键透传它的兜底
  assert.deepEqual(seen, ['level', 'maxHp'])
})

test('拷贝构造只带 state 与 fightPetCursors, capturePet 回 null', () => {
  const r = new BattleResult({ parallelCount: 2 })
  r.setState(BattleResultState.Win)
  r.addFightPetCursor(4)
  r.capturePet = { getPetIdentifier: () => 1 }

  const c = BattleResult.from(r)
  assert.equal(c.state, BattleResultState.Win)
  assert.deepEqual([...c.fightPetCursors], [0, 1, 4])
  assert.equal(c.capturePet, null)

  c.addFightPetCursor(9)
  assert.equal(r.fightPetCursors.has(9), false)               // 集合是新的, 不共享
})

test('addFightPetCursor 是 HashSet.Add —— 重复即 no-op, 不计次', () => {
  const r = new BattleResult({ parallelCount: 1 })
  r.addFightPetCursor(0)
  r.addFightPetCursor(0)
  assert.equal(r.fightPetCursors.size, 1)
})
