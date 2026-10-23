import { readFileSync } from 'node:fs'
const D = 'projects/Seer2-Restart-Lite-main/Assets/Resources/Data/'
const flat = (p) => readFileSync(D + p, 'utf8').split(new RegExp('[,' + String.fromCharCode(10) + ']')).filter((x) => x !== '')
const t = flat('Pets/basic.csv'), col = 10, n = Math.floor(t.length / col)
const m = {}, hl = {}, el = {}, link = {}, hab = {}
for (let i = 1; i < n; i++) {
  m[t[col * i + 5]] = (m[t[col * i + 5]] || 0) + 1
  const st = t[col * i + 4]; hl[st.split('/').length] = (hl[st.split('/').length] || 0) + 1
  el[t[col * i + 3].split('/').length] = (el[t[col * i + 3].split('/').length] || 0) + 1
  link[t[col * i + 9]] = (link[t[col * i + 9]] || 0) + 1
  hab[t[col * i + 6].split('/').length] = (hab[t[col * i + 6].split('/').length] || 0) + 1
}
console.log('rows', n - 1, 'remainder', t.length % col)
console.log('gender distinct', Object.keys(m).length)
console.log('gender ALL', Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join('  '))

// PetBasicInfo.cs:92 的 TrimEnd(string) 绑到 char[] 重载 ⇒ 字符集裁剪; TryParseGender 失败时
// out 参数还留着**失败前已加入的部分**。照此模拟, 统计真实受影响行数。
const trimEndSet = (s, set) => { let e = s.length; while (e > 0 && set.has(s[e - 1])) e--; return s.slice(0, e) }
const tryParseIntCs = (s) => (/^\s*[+-]?\d+\s*$/.test(s) ? Number(s.trim()) : null)   // int.TryParse: "" 是 false
function tryParseGender(expr) {
  const list = [], dist = []
  const uniq = tryParseIntCs(expr)
  if (uniq !== null) { list.push(uniq); dist.push(1); return { list, dist, ok: true } }
  for (const piece of expr.split('/')) {
    const p = tryParseIntCs(piece.slice(piece.indexOf('[') + 1, piece.lastIndexOf(']')))
    if (p === null) return { list, dist, ok: false, bad: piece, why: 'p' }
    const g = tryParseIntCs(trimEndSet(piece, new Set(`[${p}]`)))
    if (g === null) return { list, dist, ok: false, bad: piece, why: 'g' }
    list.push(g); dist.push(p)
  }
  return { list, dist, ok: true }
}
const fails = {}, genderOf = {}
for (let i = 1; i < n; i++) {
  const raw = t[col * i + 5]
  const r = tryParseGender(raw)
  if (!r.ok) { const k = `${raw} → 残表 ${JSON.stringify(r.list)} 于 ${r.bad} (${r.why})`; fails[k] = (fails[k] || 0) + 1 }
  const g = r.list.length ? r.list[0] : 0          // gender => genderList.FirstOrDefault()
  genderOf[g] = (genderOf[g] || 0) + 1
}
console.log('gender 解析失败(部分填充)行数:', Object.values(fails).reduce((a, b) => a + b, 0))
console.log(Object.entries(fails).map(([k, v]) => `${k} ×${v}`).join('\n'))
console.log('实际 gender 分布(FirstOrDefault):', genderOf)

console.log('baseStatus segs', hl, 'element segs', el, 'hw segs', hab)
console.log('linkId distinct', Object.keys(link).length, Object.entries(link).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${JSON.stringify(k)}=${v}`).join(' '))
