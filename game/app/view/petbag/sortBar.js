// L3 · 排序下拉。键集合 = 显式 none（保持原序）+ 五维读数；非法值**不静默兜底成 ID 序**（修 A14）。
// 只**产出比较器**交给 L1 grid.setSorter，比较器在 grid 里"先滤空槽再排"（null 沉底），不吃 null（C1 §5 死分支）。
import { el, text } from '../panels/battle/_kit.js'

// host；ctx = { setSorter(fn|null) }
export function renderSort(host, ctx) {
  host.textContent = ''
  host.append(text('rbp-slabel', '排序'))
  const KEYS = [['', '原序'], ['level', '等级'], ['atk', '物攻'], ['def', '物防'], ['spa', '魔攻'], ['spe', '速度']]
  let cur = ''
  const row = el('rbp-sortrow')
  for (const [k, label] of KEYS) {
    const b = el('rbp-sortbtn' + (k === cur ? ' rbp-sortbtn--on' : ''))
    b.textContent = label
    b.addEventListener('click', () => {
      cur = k
      row.querySelectorAll('.rbp-sortbtn').forEach(n => n.classList.remove('rbp-sortbtn--on'))
      b.classList.add('rbp-sortbtn--on')
      if (!k) { ctx.setSorter(null); return }
      const val = (p) => {
        if (k === 'level') return p.level | 0
        const s = ctx.statsOf(p) || {}
        const v = s[k]
        return typeof v === 'number' ? v : 0
      }
      ctx.setSorter((a, b2) => val(b2) - val(a))    // 降序；null 由 grid 沉底
    })
    row.append(b)
  }
  host.append(row)
}
