// 矢量 SWF → SVG（可选再批转 PNG）。
// 用途: 图标类 SWF 本质是单帧矢量静图（实测 swf/item|pet/icon|nono 1831 个全单帧、零位图、无 clip），
//       离线转成 SVG 后运行时不必再挂 Ruffle。
//   node tools/swf2svg.mjs swf/item/equip/icon                    # 递归一个目录
//   node tools/swf2svg.mjs a.swf b.swf --png=2                   # 写 svg/ 并 rsvg-convert 出 @2x png/
//   node tools/swf2svg.mjs swf/item/equip/icon/100206.swf --print # 打到 stdout 看效果
// 输出路径 = 源路径去掉开头的 swf/ 后镜像到 svg/ 与 png/。
// 本批不支持: 位图填充(bitmap fill)、clipDepth 掩膜、PlaceObject 的 blend/filter ⇒ 遇则记警告、不伪造。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { parseSwf, parseShapeFull, displayList, symbolClasses, mulMat, IDENT, applyMat } from '../game/swfshape.mjs'

const SHAPE_TAGS = new Set([2, 21, 32, 83])
const GRAD_UNIT = 819.2 // Flash 渐变空间: x∈[-1,1] ⇔ ±16384 twips = ±819.2 px

// ---------- 读入 / 建模 ----------
function readSwf(file) {
  const raw = fs.readFileSync(file)
  const sig = raw.subarray(0, 3).toString('latin1')
  if (sig === 'ZWS') throw new Error('ZWS(LZMA) 压缩不支持')
  const body = sig === 'CWS' ? zlib.inflateSync(raw.subarray(8)) : sig === 'FWS' ? raw.subarray(8) : null
  if (!body) throw new Error(`非 SWF 签名 ${JSON.stringify(sig)}`)
  const swf = parseSwf(new Uint8Array(body))
  const shapes = new Map()
  const skips = []
  const collect = tags => {
    for (const t of tags) {
      if (SHAPE_TAGS.has(t.code)) {
        let sh
        try { sh = parseShapeFull(swf.body, t, raw[3]) } catch (e) { skips.push(`tag${t.code}@${t.start} 非形状数据 (${e.message})`); continue }
        if (!sh.ok) { skips.push(`shape#${sh.id} 位流未落在 tag 末尾 (drift=${sh.drift})`); continue }
        shapes.set(sh.id, sh)
      } else if (t.code === 39) collect(swf.sprites.get(u16(swf.body, t.start))?.sub || [])
    }
  }
  collect(swf.tags)
  // 本批建模 = 形状(2/21/32/83) + 精灵(39) + 实例(26/70)。
  // NONCHAR = **确认不是角色定义**的标签, 按语义跳过 (这批实测到):
  //   0 End / 1 ShowFrame / 8 SetTabIndex / 9 背景色 / 23 背景色(4.x) / 69 FileAttributes /
  //   76 SymbolClass / 77 Metadata / 78 SoundStreamHead / 82 DoAbc(字节码) / 86 SceneAndFrameLabels
  // 既不属这两类又不解的 ⇒ 只当"某角色查不到定义"时的**候选出处**报出来, 不猜语义。
  //   (这批实测到的候选: 22 = 记录区是「成对 00 RR GG BB 样式」的大字块, 34 = 13 字节桩)
  const MODELED = new Set([...SHAPE_TAGS, 39, 26, 70, 0, 1, 8, 9, 23, 69, 76, 77, 78, 82, 86])
  const unmodeled = new Map()
  for (const t of swf.tags) if (!MODELED.has(t.code) && t.len >= 6) {
    const k = `tag${t.code}(${t.len}B)`
    unmodeled.set(k, (unmodeled.get(k) || 0) + 1)
  }
  return { swf, shapes, skips, unmodeled }
}
function u16(u, p) { return u[p] | (u[p + 1] << 8) }

// ---------- 数字/颜色格式化 ----------
const f = v => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? '0' : String(r) }
const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)))
// CXCT: 每通道 final = orig * mul + add (mul 为 0..1 浮点, add 为 0..255 单位, alpha 同色)
function rgba(color, tint) {
  let { r, g, b, a } = color
  if (tint) { r = tint.mul[1] * r + tint.add[1]; g = tint.mul[2] * g + tint.add[2]; b = tint.mul[3] * b + tint.add[3]; a = tint.mul[0] * a + tint.add[0] }
  return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a: clamp255(a) / 255 }
}
const css = c => `#${[c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')}`

// ---------- 样式 → 颜色 ----------
// 颜色写成 #rrggbb + *-opacity (SVG 1.1 的 fill/stroke 不认 rgba());
// 同一份颜色既可能挂 fill 也可能挂 stroke ⇒ 返回 {paint, opacity}, 由调用方拼属性
let gradSeq = 0
function stylePaint(style, M, tint, ctx) {
  const s = style && (style.kind ? style : style.fill)             // 线样式的颜色藏在 .fill 里
  if (!s) return null
  if (s.kind === 'solid') { const c = rgba(s.color, tint); return { paint: css(c), opacity: c.a } }
  if (s.kind === 'linear' || s.kind === 'radial') {
    const id = `g${gradSeq++}`
    const gm = s.matrix || IDENT
    const scaled = { ...gm, a: gm.a * GRAD_UNIT, b: gm.b * GRAD_UNIT, c: gm.c * GRAD_UNIT, d: gm.d * GRAD_UNIT }
    const t = mulMat(M, scaled)
    const stops = s.stops.map(g => {
      const c = rgba(g, tint)
      return `<stop offset="${(g.ratio / 255).toFixed(3)}" stop-color="${css(c)}" stop-opacity="${c.a.toFixed(3)}"/>`
    }).join('')
    const tf = `matrix(${f(t.a)} ${f(t.b)} ${f(t.c)} ${f(t.d)} ${f(t.tx)} ${f(t.ty)})`
    ctx.defs.push(s.kind === 'linear'
      ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="-1" y1="0" x2="1" y2="0" gradientTransform="${tf}">${stops}</linearGradient>`
      : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" fx="${f(s.focal > -2 ? s.focal : 0)}" fy="0" gradientTransform="${tf}">${stops}</radialGradient>`)
    return { paint: `url(#${id})`, opacity: 1 }
  }
  ctx.warn(`位图填充 id=${s.id} 本批不支持 ⇒ 该路径不画`)
  return { paint: 'none', opacity: 1 }
}
const attr = (kind, p) => !p || p.paint === 'none' ? `${kind}="none"`
  : p.opacity >= 0.999 ? `${kind}="${p.paint}"` : `${kind}="${p.paint}" ${kind}-opacity="${p.opacity.toFixed(3)}"`

// ---------- 形状 → <path> ----------
function shapePaths(sh, M, tint, ctx) {
  const out = []
  const dOf = subs => subs.map(s => s.map(op => op[0] === 'Q'
    ? `Q${f(applyMat(M, op[1], op[2])[0])} ${f(applyMat(M, op[1], op[2])[1])} ${f(applyMat(M, op[3], op[4])[0])} ${f(applyMat(M, op[3], op[4])[1])}`
    : `${op[0]}${f(applyMat(M, op[1], op[2])[0])} ${f(applyMat(M, op[1], op[2])[1])}`).join(' ') + ' Z').join(' ')
  const rule = sh.nonzero ? ' fill-rule="nonzero"' : ' fill-rule="evenodd"'   // Flash 默认 = even-odd
  for (const grp of sh.fillPaths) {
    if (!grp.idx) continue                                          // 索引 0 = 无填充
    if (!grp.style) { ctx.warn(`shape#${sh.id} 填充索引 ${grp.idx} 查不到样式 ⇒ 跳过`); continue }
    out.push(`<path d="${dOf(grp.subs)}" ${attr('fill', stylePaint(grp.style, M, tint, ctx))}${rule}/>`)
  }
  for (const grp of sh.linePaths) {
    if (!grp.idx) continue
    if (!grp.style) { ctx.warn(`shape#${sh.id} 线索引 ${grp.idx} 查不到样式 ⇒ 跳过`); continue }
    const w = grp.style.width / 20 * Math.sqrt(Math.abs(M.a * M.d - M.b * M.c))   // LineWidth 单位 = twips
    out.push(`<path d="${dOf(grp.subs)}" fill="none" ${attr('stroke', stylePaint(grp.style, M, tint, ctx))} stroke-width="${f(w || 0.05)}" stroke-linejoin="round"/>`)
  }
  return out
}

// 实例记录的对齐自检: drift != 0 = 我们没把这条 PlaceObject 的字节读完/读过头 ⇒ 位置或颜色可能错
function checkPlace(inst, where, ctx) {
  if (inst.clipDepth) ctx.warn(`${where} 实例 depth=${inst.depth} 带 clipDepth ⇒ 掩膜未导出`)
  if (inst.hasFilter) ctx.warn(`${where} 实例 depth=${inst.depth} 带滤镜 (发光/投影) ⇒ 静图未导出该效果`)
  if (inst.filterError) ctx.warn(`${where} 实例 depth=${inst.depth} ${inst.filterError} ⇒ 该实例之后的字段未解析`)
  else if (inst.drift) ctx.warn(`${where} 实例 depth=${inst.depth} 记录未整包对齐 (drift=${inst.drift})`)   // 合成实例 (SymbolClass 回退) 无 drift 字段 ⇒ 不报
}
// ---------- 显示列表递归 ----------
// 本批未建模的标签 = 未定义角色的**候选出处** (只报事实、不猜语义):
//   tag22 = 记录区是「成对 00 RR GG BB 样式」的形变/位图类大字块; tag34 = 13 字节桩。
const holders = um => (!um || !um.size ? '' :
  ' (候选出处 ' + [...um].map(([k, n]) => k + (n > 1 ? `×${n}` : '')).join(', ') + ')')
function walkInstance(id, M, tint, ctx, depth, seen) {
  if (!id || depth > 8 || seen.has(id)) return []
  const sh = ctx.shapes.get(id)
  if (sh) return shapePaths(sh, M, tint, ctx)
  const sp = ctx.swf.sprites.get(id)
  if (!sp) { ctx.warn(`character#${id} 未定义 ⇒ 跳过${holders(ctx.unmodeled)}`); return [] }
  if (sp.frames > 1) ctx.warn(`sprite#${id} 有 ${sp.frames} 帧 ⇒ 只取第 1 帧`)
  const next = new Set(seen); next.add(id)
  const out = []
  for (const inst of displayList(ctx.swf, sp.sub, 0)) {
    checkPlace(inst, `sprite#${id}`, ctx)
    out.push(...walkInstance(inst.id, mulMat(M, inst.matrix || IDENT), tintOf(inst, tint, ctx), ctx, depth + 1, next))
  }
  return out
}
function tintOf(inst, parent, ctx) {
  const c = inst.cxct
  if (!c) return parent
  const mul = c.mul, add = c.add
  if (!parent) return { mul, add }
  return {
    mul: mul.map((v, i) => v * parent.mul[i]),
    add: add.map((v, i) => v * parent.mul[i] + parent.add[i]),
  }
}

// ---------- 单文件 → SVG 文本 ----------
export function swfToSvg(file) {
  const warns = []
  const { swf, shapes, skips, unmodeled } = readSwf(file)
  const ctx = { shapes, swf, unmodeled, defs: [], warn: m => warns.push(m) }
  warns.push(...skips)
  gradSeq = 0
  let tint = null
  const body = []
  const emit = inst => {
    checkPlace(inst, '根实例', ctx)
    tint = tintOf(inst, tint, ctx)
    body.push(...walkInstance(inst.id, inst.matrix || IDENT, tint, ctx, 0, new Set()))
  }
  const root = displayList(swf, swf.tags, 0)
  for (const inst of root) emit(inst)
  if (!root.length) {
    // 根显示列表为空 ⇒ 画面挂在导出类上 (SymbolClass), 播放器 new 该类才画得出
    for (const sym of symbolClasses(swf)) {
      if (!sym.id) continue
      ctx.warn(`根显示列表为空 ⇒ 改画导出类 "${sym.name}" (character#${sym.id})`)
      emit({ id: sym.id, matrix: IDENT, cxct: null, depth: 0, clipDepth: 0 })
    }
  }
  const r = swf.rect
  const x0 = r.xmin / 20, y0 = r.ymin / 20, w = (r.xmax - r.xmin) / 20, h = (r.ymax - r.ymin) / 20
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}" height="${f(h)}" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}">`
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : ''
  return { svg: `${head}${defs}${body.join('')}</svg>\n`, width: w, height: h, warns, paths: body.length }
}

// ---------- 批处理 ----------
function listSwf(src) {
  const st = fs.statSync(src)
  if (st.isFile()) return [src]
  return fs.readdirSync(src, { withFileTypes: true }).flatMap(e =>
    e.name.endsWith('.swf') ? [path.join(src, e.name)] : e.isDirectory() ? listSwf(path.join(src, e.name)) : [])
}
function outPath(file, root) {
  return path.join(root, path.relative(process.cwd(), file).replace(/^swf\//, '')).replace(/\.swf$/, '')
}
// 落盘纪律: 目标**已是指向别处的符号链接** ⇒ 不跟随写。
//   教训实测: png/item/icon/*.png = 10-19 建的软链 (直插 projects/…/Resources/Items/),
//   写/-o 都会跟着软链把**原图**覆盖掉 (本批就撞掉过 Resources/Items/1.png, 盘上无第二份、不可恢复)。
const isSymlink = p => { try { return fs.lstatSync(p).isSymbolicLink() } catch { return false } }

// 被 import (只取 swfToSvg) 时不跑批处理
const isMain = process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname
if (isMain) {
const argv = process.argv.slice(2)
const get = pre => argv.find(a => a.startsWith(pre + '='))?.slice(pre.length + 1)
const print = argv.includes('--print')
const outSvg = get('--out') || 'svg'
const pngScale = get('--png') !== undefined ? Number(get('--png') || 1) : (argv.includes('--png') ? 1 : 0)
const srcs = argv.filter(a => !a.startsWith('--'))
if (!srcs.length) { console.error('用法: node tools/swf2svg.mjs <.swf|目录> … [--out=svg] [--png[=N]] [--print]'); process.exit(1) }

let done = 0, failed = 0, empty = 0, warnLines = [], blocked = []
for (const src of srcs) {
  for (const file of listSwf(src)) {
    let res
    try { res = swfToSvg(file) } catch (e) { failed++; console.log(`✗ ${file}: ${e.message}`); continue }
    if (!res.paths) empty++
    if (print) { process.stdout.write(res.svg); continue }
    const base = outPath(file, outSvg)
    const pngBase = outPath(file, 'png')
    if (isSymlink(base + '.svg')) { blocked.push(base + '.svg'); warnLines.push(`${file}: → ${base}.svg 是软链 ⇒ 未写`); continue }
    fs.mkdirSync(path.dirname(base), { recursive: true })
    fs.writeFileSync(base + '.svg', res.svg)
    done++
    for (const wmsg of res.warns) warnLines.push(`${file}: ${wmsg}`)
    if (pngScale) {
      const px = Math.round(res.width * pngScale)
      if (isSymlink(pngBase + '.png')) { blocked.push(pngBase + '.png'); warnLines.push(`${file}: → ${pngBase}.png 是软链 ⇒ 未写 (不跟随覆盖原图)`); continue }
      fs.mkdirSync(path.dirname(pngBase), { recursive: true })
      execFileSync('rsvg-convert', ['-w', String(px), '-h', String(Math.round(res.height * pngScale)), '-o', pngBase + '.png', base + '.svg'])
    }
  }
}
if (!print) {
  console.log(`SVG ${done} 个 → ${outSvg}/  空画面 ${empty} 个  失败 ${failed} 个${pngScale ? `  PNG → png/ @${pngScale}x` : ''}${blocked.length ? `  软链拒写 ${blocked.length} 个` : ''}`)
  if (warnLines.length) console.log(`警告 ${warnLines.length} 条:\n  ` + warnLines.slice(0, 25).join('\n  ') + (warnLines.length > 25 ? `\n  … 另 ${warnLines.length - 25} 条` : ''))
}
}
