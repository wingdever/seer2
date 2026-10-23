// L3 · 筛选栏（长在详情区里，VP4）。三条谓词 AND 叠加（VP1，不照搬上游互斥）；星级"恰好 N"（VP2）。
// 这里只**产出谓词**交给 L1 grid.setFilter，绝不在 DOM 里筛数据（铁律1/V-2）。Reset → resetFilters（三项全清，修 A8）。
import { el, text } from '../panels/battle/_kit.js'

// host 容器；ctx = { allPets(), cfg(p), nameOf(p), setPredicate(fn|null), reset() }
export function renderFilter(host, ctx) {
  host.textContent = ''
  host.append(text('rbp-flabel', '筛选'))

  let elemSel = null, starSel = null, nameBox = null
  const state = { elem: null, star: null, name: '' }

  // 下拉选项按出现顺序即可（视图侧不引入排序调用，V-2）。
  const distinct = (list, get) => [...new Set(list.map(get).filter(v => v != null))]
  const pets = ctx.allPets()
  const elems = distinct(pets, p => ctx.cfg(p)?.elementId)
  const stars = distinct(pets, p => ctx.cfg(p)?.star)

  const mkSelect = (label, values, toOpt) => {
    const wrap = el('rbp-ffield')
    wrap.append(text('rbp-flab', label))
    const s = document.createElement('select'); s.className = 'rbp-fsel'
    const all = document.createElement('option'); all.value = ''; all.textContent = '全部'; s.append(all)
    for (const v of values) { const o = document.createElement('option'); o.value = String(v); o.textContent = toOpt(v); s.append(o) }
    s.onchange = () => { state[toKey(label)] = s.value === '' ? null : Number(s.value); apply() }
    wrap.append(s)
    host.append(wrap)
    return s
  }
  const toKey = (label) => (label === '元素' ? 'elem' : 'star')

  elemSel = mkSelect('元素', elems, id => ctx.elementName(id))
  starSel = mkSelect('星级', stars, n => '★' + n)

  const nameWrap = el('rbp-ffield')
  nameWrap.append(text('rbp-flab', '名字'))
  nameBox = document.createElement('input'); nameBox.className = 'rbp-finput'; nameBox.placeholder = '包含'
  nameBox.oninput = () => { state.name = nameBox.value.trim(); apply() }
  nameWrap.append(nameBox)
  host.append(nameWrap)

  const reset = el('rbp-freset'); reset.textContent = '重置'
  reset.addEventListener('click', () => {
    state.elem = state.star = null; state.name = ''
    elemSel.value = ''; starSel.value = ''; nameBox.value = ''
    ctx.reset()
  })
  host.append(reset)

  function apply() {
    const { elem, star, name } = state
    if (elem == null && star == null && !name) { ctx.setPredicate(null); return }
    ctx.setPredicate(p => {
      const cfg = ctx.cfg(p)
      if (elem != null && cfg?.elementId !== elem) return false
      if (star != null && cfg?.star !== star) return false
      if (name && !String(ctx.nameOf(p) || '').includes(name)) return false
      return true
    })
  }
}
