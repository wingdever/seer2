import test from 'node:test'
import assert from 'node:assert/strict'
import { createPetBagSource } from './source.js'

const bag = () => [{ uid: 'a' }, null, null]

test('normal ⇒ 唯一可写盘宿主（S2/解 A1）', () => {
  const s = createPetBagSource({ host: 'normal', bag: bag() })
  assert.equal(s.host(), 'normal')
  assert.equal(s.canPersist(), true)
  assert.equal(s.persist(), 'repository')
  assert.equal(s.readOnly(), false)
})

test('非 normal 宿主一律不可写盘：pvp/yiterogue/door/story', () => {
  for (const host of ['pvp', 'yiterogue', 'door', 'story']) {
    const s = createPetBagSource({ host, bag: bag() })
    assert.equal(s.canPersist(), false, `${host} 不该能写盘`)
    assert.notEqual(s.persist(), 'repository')
  }
})

test('door/story 是只读宿主（readOnly=true）', () => {
  assert.equal(createPetBagSource({ host: 'door', bag: bag() }).readOnly(), true)
  assert.equal(createPetBagSource({ host: 'story', bag: bag() }).readOnly(), true)
  assert.equal(createPetBagSource({ host: 'pvp', bag: bag() }).readOnly(), false)  // pvp 可就地改，只是不落盘
})

test('S5：dictionary 宿主构造即抛（VP5 本代未实现，事后灌数据也不行）', () => {
  assert.throws(() => createPetBagSource({ host: 'dictionary', bag: bag() }), /dictionary/)
})

test('未知 host 抛、bag 非数组抛', () => {
  assert.throws(() => createPetBagSource({ host: 'nope', bag: bag() }), /未知 host/)
  assert.throws(() => createPetBagSource({ host: 'normal', bag: 'not-array' }), /数组/)
})

test('S3：无 SetMode；setBag 只换数组引用、host 与政策不变', () => {
  const s = createPetBagSource({ host: 'pvp', bag: bag() })
  s.setBag([{ uid: 'x' }, { uid: 'y' }])
  assert.equal(s.host(), 'pvp')
  assert.equal(s.canPersist(), false)      // 换数组不变成可写盘
  assert.equal(s.bag().length, 2)
  assert.throws(() => s.setBag('bad'), /数组/)
})

test('storage 默认 null；setStorage 灌仓库数组', () => {
  const s = createPetBagSource({ host: 'normal', bag: bag() })
  assert.equal(s.storage(), null)
  s.setStorage([{ uid: 'r1' }])
  assert.equal(s.storage()[0].uid, 'r1')
})
