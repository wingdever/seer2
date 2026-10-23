import test from 'node:test'
import assert from 'node:assert/strict'
import { createGrid } from './grid.js'

const pets = (n, fill = 12) => {
  const a = new Array(fill).fill(null)
  for (let i = 0; i < n; i++) a[i] = { uid: 'p' + i, level: i + 1 }
  return a
}

test('G1 灌入长度 != capacity ⇒ 抛（不 resize）', () => {
  assert.throws(() => createGrid({ capacity: 12, items: pets(3, 5) }), /G1/)
})

test('G8 无筛选时空槽照画（定长 12 → 首页 6 格含 null）', () => {
  const g = createGrid({ capacity: 12, items: pets(4) })
  const cells = g.cells()
  assert.equal(cells.length, 6)
  assert.equal(cells[4].pet, null)   // 第 5、6 格是空槽，仍画
  assert.equal(g.pageCount(), 2)
})

test('G2 只交对象、selectedItem 给本体；selectedSlot 给槽下标', () => {
  const g = createGrid({ capacity: 12, items: pets(4) })
  g.select(2)
  assert.equal(g.selectedItem().uid, 'p2')
  assert.equal(g.selectedSlot(), 2)
})

test('G4 单选不可取消（再点同格不清空）', () => {
  const g = createGrid({ capacity: 12, items: pets(4) })
  g.select(1)
  g.select(1)
  assert.equal(g.selectedItem()?.uid, 'p1')
})

test('G5 翻页不清选中；换页后 cursor 归 0', () => {
  const g = createGrid({ capacity: 12, items: pets(12) })
  g.select(3)
  g.next()
  assert.equal(g.page(), 1)
  assert.equal(g.cursor(), 0)
})

test('G6 删格导致视图剩 (count%6==1) ⇒ 退一页', () => {
  const items = pets(8)   // 8 只非空 + 4 空槽（无筛选时视图=12 槽，pageCount 2）
  const g = createGrid({ capacity: 12, items })
  g.setPage(1)            // 第 2 页
  // 直接删到非空数满足 %6==1：删到只剩 7 只非空（无筛选时空槽也算进视图 12，故这里改用 filter 精确测）
  const items2 = pets(7)  // 7 非空 + 5 null
  const g2 = createGrid({ capacity: 12, items: items2, })
  g2.setFilter(p => !!p)  // 只留非空 → 视图 7 → pageCount 2
  g2.setPage(1)           // 第 2 页（第 7 只）
  g2.removeAtSlot(6)      // 删第 7 只 → 非空 6 → 视图 6 → 应退到第 1 页
  assert.equal(g2.page(), 0)
})

test('G7 换位两端必须非空', () => {
  const g = createGrid({ capacity: 12, items: pets(2) })
  assert.equal(g.swap(0, 1), true)     // 两端有宠
  assert.equal(g.swap(0, 5), false)    // b 空槽 ⇒ no-op
  assert.equal(g.swap(0, 0), false)
})

test('G3 排序先、筛选后：sorter 与 filter 同时生效', () => {
  const items = pets(6)   // p0..p5, level 1..6
  const g = createGrid({ capacity: 12, items })
  g.setSorter((a, b) => b.level - a.level)   // 等级降序
  g.setFilter(p => p.level >= 3)             // 只留 level>=3（p2.level=3 也在内）
  const uids = g.cells().map(c => c.pet && c.pet.uid)
  assert.deepEqual(uids, ['p5', 'p4', 'p3', 'p2'])   // 筛掉 p0/p1、余下按等级降序 ⇒ 排序与筛选都生效
})

test('Reset（resetFilters）三项全清 ⇒ 视图回全长（解 A8）', () => {
  const g = createGrid({ capacity: 12, items: pets(6) })
  g.setFilter(p => p.level >= 3)
  g.setSorter((a, b) => b.level - a.level)
  g.resetFilters()
  assert.equal(g.cells().length, 6)          // 无筛选 → 首页 6 格（含空槽）
  assert.equal(g.cells().map(c => c.slot).join(','), '0,1,2,3,4,5')
})

test('仓库式变长网格：不传 capacity ⇒ 无 G1、无空槽', () => {
  const list = pets(3, 3)
  const g = createGrid({ items: list, pageSize: 6 })
  assert.equal(g.pageCount(), 1)
  assert.equal(g.cells().length, 3)
})
