// SWF 数据模型解析器 (纯解析, 不渲染不截图):
//   头 / 标签流 / DefineShape* 轮廓 / DefineSprite / PlaceObject* 实例表
//   + 二次曲线展平 + 扫描线栅格化
// 用途: 原版 MapAssetExtractor 用 BitmapData.draw 把 path_mc 栅格化 (透明=可走);
//       Ruffle canvas 后端不支持 BitmapData.draw, 故这里直接读 SWF 矢量记录求可走性。
// 位布局依据 ruffle-rs/ruffle swf/src/{read,write,types}.rs (实测与本批 taomee 导出文件一致):
//   DefineShape: id UI16, RECT [RECT(仅ver4) + UI8 flags(ver4)],
//                UI8 fillCount(0xff→UI16) + 填充样式, UI8 lineCount + 描边样式, UI8 (fillBits<<4|lineBits),
//                ShapeRecords 位流: 1=Edge / 0+UBits5=StyleChange / flags==0 → EndShape
//   FillStyle Type: 0x00 纯色, 0x10 线性渐变, 0x12 径向渐变, 0x13 焦点渐变, 0x40..0x43 位图
//   PlaceObject2 flags: 0x01 Move 0x02 Character 0x04 Matrix 0x08 Color 0x10 Ratio
//                       0x20 Name 0x40 ClipDepth 0x80 ClipActions (PO3 为 UI16 并另有 0x800 ClassName 等)

const TAG_END = 0
const TAG_SHOWFRAME = 1
const TAG_PLACEOBJECT = 4
const TAG_REMOVEOBJECT = 28
const TAG_REMOVEOBJECT2 = 34
const TAG_DEFINESPRITE = 39
const TAG_PLACEOBJECT2 = 26
const TAG_PLACEOBJECT3 = 70
const SHAPE_TAGS = new Set([2, 21, 32, 83])

class Br {
  constructor(u8, bitPos = 0) { this.u = u8; this.p = bitPos }
  get bytePos() { return (this.p + 7) >> 3 }
  align() { if (this.p & 7) this.p = (this.p + 7) & ~7 }
  read(n) {
    let v = 0
    for (let i = 0; i < n; i++) { v = v * 2 + ((this.u[this.p >> 3] >> (7 - (this.p & 7))) & 1); this.p++ }
    return v
  }
  sread(n) { if (!n) return 0; const v = this.read(n); return v & 2 ** (n - 1) ? v - 2 ** n : v }
  // ruffle: read_ubits_ct = 直接读 n 位 (无逃逸)
  ubits(n) { return this.read(n) }
}

function u16(u, p) { return u[p] | (u[p + 1] << 8) }

// ---------- 头部 / 标签流 ----------
export function parseSwf(body) {
  const br = new Br(body, 0)
  const rect = readRectBits(br)
  let p = br.bytePos
  const frameRate = u16(body, p) / 256
  const frameCount = u16(body, p + 2)
  p += 4
  const tags = []
  while (p + 2 <= body.length) {
    const code = u16(body, p) >> 6
    let len = u16(body, p) & 0x3f
    p += 2
    if (len === 0x3f) { len = body[p] | (body[p + 1] << 8) | (body[p + 2] << 16) | (body[p + 3] << 24); p += 4 }
    tags.push({ code, start: p, len })
    p += len
    if (code === TAG_END) break
  }
  const swf = {
    body, rect, frameRate, frameCount, tags,
    shapes: new Map(), sprites: new Map(),
    widthPx: (rect.xmax - rect.xmin) / 20, heightPx: (rect.ymax - rect.ymin) / 20,
  }
  for (const t of tags) {
    if (SHAPE_TAGS.has(t.code)) {
      const id = u16(body, t.start)
      try { swf.shapes.set(id, parseShape(body, t)) }
      catch (e) { swf.shapes.set(id, { id, tag: t.code, contours: [], error: String(e && e.message || e) }) }
    } else if (t.code === TAG_DEFINESPRITE) {
      const sub = []
      let q = t.start + 4
      const end = t.start + t.len
      while (q + 2 <= end) {
        const c = u16(body, q) >> 6
        let l = u16(body, q) & 0x3f
        q += 2
        if (l === 0x3f) { l = body[q] | (body[q + 1] << 8) | (body[q + 2] << 16) | (body[q + 3] << 24); q += 4 }
        sub.push({ code: c, start: q, len: l })
        q += l
        if (c === TAG_END) break
      }
      swf.sprites.set(u16(body, t.start), { id: u16(body, t.start), frames: u16(body, t.start + 2), sub })
    }
  }
  return swf
}

// ---------- 基础记录 ----------
function readRectBits(br) {
  const n = br.ubits(5)
  const r = { xmin: br.sread(n), xmax: br.sread(n), ymin: br.sread(n), ymax: br.sread(n) }
  br.align()
  return r
}
function readMatrix(br) {
  const hasScale = br.read(1)
  let sx = 65536, sy = 65536
  if (hasScale) { const n = br.ubits(5); sx = br.sread(n); sy = br.sread(n) }
  let kx = 0, ky = 0
  if (br.read(1)) { const n = br.ubits(5); kx = br.sread(n); ky = br.sread(n) }
  const n = br.ubits(5)
  const tx = br.sread(n), ty = br.sread(n)
  return { a: sx / 65536, b: kx / 65536, c: ky / 65536, d: sy / 65536, tx: tx / 20, ty: ty / 20 }
}
export const IDENT = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
export function mulMat(m, n) {
  return {
    a: m.a * n.a + m.b * n.c,
    b: m.a * n.b + m.b * n.d,
    c: m.c * n.a + m.d * n.c,
    d: m.c * n.b + m.d * n.d,
    tx: m.a * n.tx + m.b * n.ty + m.tx,
    ty: m.c * n.tx + m.d * n.ty + m.ty,
  }
}
export function applyMat(m, x, y) { return [m.a * x + m.b * y + m.tx, m.c * x + m.d * y + m.ty] }

// MATRIX 为位流, 其后数据按字节对齐
function afterMatrix(u, p) { const br = new Br(u, p * 8); readMatrix(br); br.align(); return br.bytePos }

// ---------- 样式表 (字节流) ----------
function skipFillStyle(u, p, ver) {
  const type = u[p]; p++
  if (type === 0x00) return p + (ver >= 3 ? 4 : 3)                      // 纯色 RGBA/RGB
  if (type === 0x10 || type === 0x12) { p = afterMatrix(u, p); return skipGradientRecords(u, p, ver) }
  if (type === 0x13) { p = afterMatrix(u, p); p = skipGradientRecords(u, p, ver); return p + 2 }  // + FocalPoint Fixed8
  if (type >= 0x40 && type <= 0x43) { return afterMatrix(u, p + 2) }     // 位图: id UI16 + MATRIX
  throw new Error('unknown fill style 0x' + type.toString(16) + ' ver' + ver)
}
function skipGradientRecords(u, p, ver) {
  const n = u[p] & 0x0f                                                  // 低 4 位 = 记录数(直接值)
  return p + 1 + n * (1 + (ver >= 3 ? 4 : 3))
}
function skipLineStyle(u, p, ver) {
  p += 2                                                                 // Width UI16
  if (ver < 4) return p + (ver >= 3 ? 4 : 3)                             // 旧式: 仅纯色
  const flags = u16(u, p)
  p += 2
  if (((flags >> 2) & 3) === 3) p += 2                                    // JOIN = MITER → MiterLimitFactor Fixed8
  return flags & 0x10 ? skipFillStyle(u, p, ver) : p + 4                 // HAS_FILL ? FillStyle : RGBA
}
function readStyleTables(u, p, ver) {
  let cnt = u[p]; p++
  if (cnt === 0xff && ver >= 2) { cnt = u16(u, p); p += 2 }
  for (let i = 0; i < cnt; i++) p = skipFillStyle(u, p, ver)
  let lcnt = u[p]; p++
  if (lcnt === 0xff && ver >= 2) { lcnt = u16(u, p); p += 2 }
  for (let i = 0; i < lcnt; i++) p = skipLineStyle(u, p, ver)
  const nb = u[p]; p++
  return { p, fillBits: nb >> 4, lineBits: nb & 0x0f }
}

// ---------- DefineShape* → 闭合轮廓 (像素) ----------
// ---------- 样式表 · 读值版 (供矢量→SVG 导出; 位布局与上面 skip* 逐字节同) ----------
export function readArgb(u, p, ver) {
  return ver >= 3
    ? { r: u[p], g: u[p + 1], b: u[p + 2], a: u[p + 3], p: p + 4 }
    : { r: u[p], g: u[p + 1], b: u[p + 2], a: 255, p: p + 3 }
}
function readFixed8(u, p) { const br = new Br(u, p * 8); const v = br.sread(16) / 256; return { v, p: br.bytePos } }
function readGradientRecords(u, p, ver) {
  const b = u[p]
  const spread = (b >> 6) & 0x03          // 0 pad / 1 reflect / 2 clamp (SWF GRADIENT_RECORDS flags)
  const interpolation = (b >> 4) & 0x03    // 0 rgb / 1 linear-rgb
  const n = b & 0x0f
  p += 1
  const stops = []
  for (let i = 0; i < n; i++) {
    const ratio = u[p]; p += 1
    const c = readArgb(u, p, ver)
    stops.push({ ratio, r: c.r, g: c.g, b: c.b, a: c.a })
    p = c.p
  }
  return { stops, spread, interpolation, p }
}
export function readFillStyle(u, p, ver) {
  const type = u[p]; p += 1
  if (type === 0x00) { const c = readArgb(u, p, ver); return { kind: 'solid', color: c, p: c.p } }
  if (type === 0x10 || type === 0x12 || type === 0x13) {
    const br = new Br(u, p * 8); const matrix = readMatrix(br); br.align(); p = br.bytePos
    const g = readGradientRecords(u, p, ver); p = g.p
    let focal = -1
    if (type === 0x13) { const f = readFixed8(u, p); focal = f.v; p = f.p }
    return { kind: type === 0x10 ? 'linear' : 'radial', focal, matrix, stops: g.stops, spread: g.spread, interpolation: g.interpolation, p }
  }
  if (type >= 0x40 && type <= 0x43) {
    const id = u16(u, p); p += 2
    const br = new Br(u, p * 8); const matrix = readMatrix(br); br.align(); p = br.bytePos
    // ruffle: is_repeating = (type & 1) === 0; is_smoothed = fileVer >= 8 && (type & 2) === 0
    // (0x42/0x43 = non-repeating; 0x41/0x43 = 未平滑。smoothed 只影响位图采样, 本批导出器不用)
    return { kind: 'bitmap', id, matrix, repeat: (type & 1) === 0, smoothed: (type & 2) === 0, p }
  }
  throw new Error(`unknown fill style 0x${type.toString(16)} ver${ver} @${p - 1}`)
}
export function readLineStyle(u, p, ver) {
  const width = u16(u, p); p += 2
  if (ver < 4) { const c = readArgb(u, p, ver); return { width, fill: { kind: 'solid', color: c }, p: c.p } }
  // LineStyle4 flags (ruffle LineStyleFlag): StartCap 0-1 | Join 2-3 | HasFill 4 | NoHScale 5 | NoVScale 6 | Closed 7
  const flags = u16(u, p); p += 2
  if (((flags >> 2) & 3) === 3) p += 2                                   // JOIN = MITER → MiterLimitFactor Fixed8
  const scaled = (flags & 0x20) === 0
  if (flags & 0x10) { const s = readFillStyle(u, p, ver); return { width, fill: s, scaled, p: s.p } }
  const c = readArgb(u, p, ver)
  return { width, fill: { kind: 'solid', color: c }, scaled, p: c.p }
}
export function readStyles(u, p, ver) {
  let cnt = u[p]; p += 1
  if (cnt === 0xff && ver >= 2) { cnt = u16(u, p); p += 2 }
  const fills = []
  for (let i = 0; i < cnt; i++) { const s = readFillStyle(u, p, ver); fills.push(s); p = s.p }
  let lcnt = u[p]; p += 1
  if (lcnt === 0xff && ver >= 2) { lcnt = u16(u, p); p += 2 }
  const lines = []
  for (let i = 0; i < lcnt; i++) { const s = readLineStyle(u, p, ver); lines.push(s); p = s.p }
  const nb = u[p]; p += 1
  return { fills, lines, p, fillBits: nb >> 4, lineBits: nb & 0x0f }
}
function parseShape(body, t) {
  const ver = t.code === 2 ? 1 : t.code === 21 ? 2 : t.code === 32 ? 3 : 4
  const id = u16(body, t.start)
  const br = new Br(body, (t.start + 2) * 8)
  const bounds = readRectBits(br)
  let nonzero = false
  if (ver >= 4) {
    readRectBits(br)                                                     // EdgeBounds
    nonzero = (body[br.bytePos] & 0x04) !== 0                             // NON_ZERO_WINDING_RULE
    br.p = (br.bytePos + 1) * 8
  }
  const st = readStyleTables(body, br.bytePos, ver)
  const edges = readShapeEdges(body, st.p * 8, t, st.fillBits, st.lineBits, ver)
  return { id, tag: t.code, ver, nonzero, bounds, contours: edges.contours, groups: edges.groups, ok: edges.ok, consumed: edges.consumed, stylesEnd: st.p }
}
// ShapeRecords → 按填充索引分组的轮廓集合 (Flash 语义):
//   每个填充索引是一组子路径 (move 只重开子路径, 不结束该填充), 因为原画把
//   「外框 + 洞」画成同一填充的多个子路径, 靠 even-odd 得到洞 —— 若按 move 切段就会把洞填实。
//   DefineShape2+ 每条边同时是 f0(左) 与 f1(右) 两个区域的边界, 故两边都要记 (这批地图
//   的 path_mc 掩膜正是只写 f1, 例如 swf/map/10007.swf id3: 1 个实心样式 + FillStyle1 变更)。
function readShapeEdges(body, bitPos, t, fillBits, lineBits, ver) {
  const br = new Br(body, bitPos)
  const tagEndBit = (t.start + t.len) * 8
  const paths = new Map()            // fillIndex → 子路径数组
  let x = 0, y = 0, f0 = 0, f1 = 0
  let s0 = null, s1 = null
  const list = idx => { let a = paths.get(idx); if (!a) { a = []; paths.set(idx, a) } return a }
  const reopen = () => {
    s0 = null; s1 = null
    if (f0) { const a = list(f0); s0 = []; a.push(s0); s0.push([x / 20, y / 20]) }
    if (f1 && f1 !== f0) { const a = list(f1); s1 = []; a.push(s1); s1.push([x / 20, y / 20]) }
  }
  const add = (px, py) => { if (s0) s0.push([px, py]); if (s1) s1.push([px, py]) }
  let guard = 0

  const pushCurve = (cx, cy, nx, ny) => {
    const px = x / 20, py = y / 20
    const n = Math.max(2, Math.min(12, Math.round(Math.hypot(nx - px, ny - py) / 3)))
    for (let k = 1; k <= n; k++) {
      const t2 = k / n, u = 1 - t2
      add(u * u * px + 2 * u * t2 * cx + t2 * t2 * nx, u * u * py + 2 * u * t2 * cy + t2 * t2 * ny)
    }
    x = nx * 20; y = ny * 20
  }
  while (guard++ < 400000 && br.p < tagEndBit) {
    if (br.read(1)) {                                                     // EDGE
      const straight = br.read(1)
      const n = br.ubits(4) + 2
      if (straight) {
        const axisAligned = !br.read(1)
        const vertical = axisAligned && br.read(1)
        const dx = (!axisAligned || !vertical) ? br.sread(n) : 0
        const dy = (!axisAligned || vertical) ? br.sread(n) : 0
        x += dx; y += dy
        add(x / 20, y / 20)
      } else {
        const cx = br.sread(n), cy = br.sread(n)
        const dx = br.sread(n), dy = br.sread(n)
        // 控制点与终点都相对当前笔 (同 readShapeRecordsFull 的曲线口径)
        pushCurve((x + cx) / 20, (y + cy) / 20, (x + dx) / 20, (y + dy) / 20)
      }
    } else {
      const flags = br.ubits(5)
      if (flags === 0) break                                              // EndShapeRecord
      let mv = null
      if (flags & 0x01) { const mb = br.ubits(5); mv = [br.sread(mb), br.sread(mb)] }
      let nf0 = null, nf1 = null
      if (flags & 0x02) nf0 = br.read(fillBits)
      if (flags & 0x04) {
        // DefineShape(v1) 只有一个填充索引, 却写在 FILL_STYLE_1 位上
        if (ver === 1) { if (nf0 === null) nf0 = br.read(fillBits); else br.read(fillBits) }
        else nf1 = br.read(fillBits)
      }
      if (flags & 0x08) br.read(lineBits)
      if (flags & 0x10) { br.align(); const st2 = readStyleTables(body, br.bytePos, ver); fillBits = st2.fillBits; lineBits = st2.lineBits; br.p = st2.p * 8 }
      const styleChanged = (nf0 !== null && nf0 !== f0) || (nf1 !== null && nf1 !== f1)
      if (nf0 !== null) f0 = nf0
      if (nf1 !== null) f1 = nf1
      // MoveDeltaX/Y 名字带 "Delta" 但值是**绝对笔位** (SWF 规范已知坑; ruffle 亦赋不作加;
      // 本仓实测: 3094 个 v1..v4 形状按绝对取值, 落点中位偏差 0.0px 全部回到自带 ShapeBounds)
      if (mv) { x = mv[0]; y = mv[1]; reopen() }
      else if (styleChanged) reopen()
    }
  }
  const groups = [...paths.entries()].map(([idx, subs]) => ({ idx, contours: subs.filter(s => s.length > 2) }))
  const contours = groups.flatMap(g => g.contours)
  const ok = br.p <= tagEndBit && (tagEndBit - br.p) < 8
  return { contours, groups, consumed: br.p, endBit: br.p, tagEndBit, ok }
}

// ---------- DefineShape* → 路径记录 (保留二次曲线 + 描边, 供 SVG 导出) ----------
export function parseShapeFull(body, t, fileVer = 9) {
  const ver = t.code === 2 ? 1 : t.code === 21 ? 2 : t.code === 32 ? 3 : 4
  const id = u16(body, t.start)
  const br = new Br(body, (t.start + 2) * 8)
  const bounds = readRectBits(br)
  let nonzero = false
  if (ver >= 4) {
    readRectBits(br)                                                     // EdgeBounds
    nonzero = (body[br.bytePos] & 0x04) !== 0
    br.p = (br.bytePos + 1) * 8
  }
  const st = readStyles(body, br.bytePos, ver)
  const rec = readShapeRecordsFull(body, st.p * 8, t, st.fillBits, st.lineBits, ver, st.fills, st.lines)
  return { id, tag: t.code, ver, nonzero, bounds, fills: st.fills, lines: st.lines, fileVer, ...rec }
}
function readShapeRecordsFull(body, bitPos, t, fillBits, lineBits, ver, initFills, initLines) {
  const br = new Br(body, bitPos)
  const tagEndBit = (t.start + t.len) * 8
  const fpaths = new Map(), lpaths = new Map()
  let x = 0, y = 0, f0 = 0, f1 = 0, li = 0
  let s0 = null, s1 = null, sl = null
  // ⚠️ 样式表**不是**只在形状开头出现一次: DefineShape4 常把首表写成空的, 每条记录用
  //   NEW_STYLES(0x10) 现挂一张新表 (实测 swf/item/equip/icon/100206.swf shape#2:
  //   fills=[] 却用到索引 20)。所以每个子路径必须**在打开的那一刻**把当时那张表里的
  //   样式对象绑走, 分组键 = 索引 + 表序号 —— 只留索引会在后面查不到颜色。
  let fills = initFills, lines = initLines, seq = 0
  const bucket = (m, idx, style) => {
    const k = idx + ':' + seq
    let a = m.get(k)
    if (!a) { a = { idx, style, subs: [] }; m.set(k, a) }
    return a.subs
  }
  const reopen = () => {
    s0 = null; s1 = null; sl = null
    const px = x / 20, py = y / 20
    if (f0) { s0 = [['M', px, py]]; bucket(fpaths, f0, fills[f0 - 1]).push(s0) }
    if (f1 && f1 !== f0) { s1 = [['M', px, py]]; bucket(fpaths, f1, fills[f1 - 1]).push(s1) }
    if (li) { sl = [['M', px, py]]; bucket(lpaths, li, lines[li - 1]).push(sl) }
  }
  const add = op => { if (s0) s0.push(op); if (s1 && s1 !== s0) s1.push(op); if (sl) sl.push(op) }
  let guard = 0
  while (guard++ < 400000 && br.p < tagEndBit) {
    if (br.read(1)) {
      const straight = br.read(1)
      const n = br.ubits(4) + 2
      if (straight) {
        const axisAligned = !br.read(1)
        const vertical = axisAligned && br.read(1)
        const dx = (!axisAligned || !vertical) ? br.sread(n) : 0
        const dy = (!axisAligned || vertical) ? br.sread(n) : 0
        x += dx; y += dy
        add(['L', x / 20, y / 20])
      } else {
        const cx = br.sread(n), cy = br.sread(n)
        const dx = br.sread(n), dy = br.sread(n)
        // 曲线: 控制点与终点都相对当前笔 (ruffle read.rs read_shape_edges)
        add(['Q', (x + cx) / 20, (y + cy) / 20, (x + dx) / 20, (y + dy) / 20])
        x += dx; y += dy
      }
    } else {
      const flags = br.ubits(5)
      if (flags === 0) break
      let mv = null
      if (flags & 0x01) { const mb = br.ubits(5); mv = [br.sread(mb), br.sread(mb)] }
      let nf0 = null, nf1 = null, nli = null
      if (flags & 0x02) nf0 = br.read(fillBits)
      if (flags & 0x04) {
        if (ver === 1) { if (nf0 === null) nf0 = br.read(fillBits); else br.read(fillBits) }
        else nf1 = br.read(fillBits)
      }
      if (flags & 0x08) nli = br.read(lineBits)
      let newStyles = false
      if (flags & 0x10) {
        br.align(); const st2 = readStyles(body, br.bytePos, ver)
        fills = st2.fills; lines = st2.lines; seq++
        fillBits = st2.fillBits; lineBits = st2.lineBits; br.p = st2.p * 8
        newStyles = true
      }
      const changed = newStyles || (nf0 !== null && nf0 !== f0) || (nf1 !== null && nf1 !== f1) || (nli !== null && nli !== li)
      if (nf0 !== null) f0 = nf0
      if (nf1 !== null) f1 = nf1
      if (nli !== null) li = nli
      if (mv) { x = mv[0]; y = mv[1]; reopen() }   // 绝对笔位, 见 readShapeEdges 同处的规范坑说明
      else if (changed) reopen()
    }
  }
  const pack = m => [...m.values()].map(g => ({ idx: g.idx, style: g.style, subs: g.subs.filter(s => s.length > 2) }))
  return {
    fillPaths: pack(fpaths), linePaths: pack(lpaths),
    consumed: br.p,
    drift: br.p - tagEndBit,
    ok: br.p <= tagEndBit && (tagEndBit - br.p) < 8,   // 停在 tag 末尾同一个字节内 (旧的 `|| br.p >= tagEndBit` 把越界读也算通过)
  }
}

// ---------- 实例表 ----------
// PlaceFlag (ruffle swf/src/types.rs, 与这批 taomee 文件实测一致):
//   MOVE 0x01, HAS_CHARACTER 0x02, HAS_MATRIX 0x04, HAS_COLOR_TRANSFORM 0x08,
//   HAS_RATIO 0x10, HAS_NAME 0x20, HAS_CLIP_DEPTH 0x40, HAS_CLIP_ACTIONS 0x80
//   PO3 额外: FILTER 0x100, BLEND 0x200, CACHE_AS_BITMAP 0x400, CLASS_NAME 0x800,
//             IMAGE 0x1000, VISIBLE 0x2000, OPAQUE_BG 0x4000, CLIP_ACTIONS 0x8000
const PF_MOVE = 0x01, PF_CHAR = 0x02, PF_MTX = 0x04, PF_COLOR = 0x08, PF_RATIO = 0x10, PF_NAME = 0x20, PF_CLIP_DEPTH = 0x40, PF_CLIP_ACTIONS = 0x80
function trailingName(u, t) {
  let e = t.start + t.len - 1
  if (u[e] !== 0) return null
  let s = e - 1
  while (s >= t.start && u[s] !== 0) s--
  const name = txt(u, s + 1, e)
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : null
}
function readStr(u, p) { let q = p; while (q < u.length && u[q]) q++; return { s: txt(u, p, q), p: q + 1 } }
function applyPlace(list, u, t, is3) {
  let p = t.start
  const flags = is3 ? u16(u, p) : u[p]
  p += is3 ? 2 : 1
  const depth = u16(u, p); p += 2
  const hasChar = (flags & PF_CHAR) !== 0
  const exotic = is3 && (flags & 0x8100) !== 0                          // 含滤镜/混合等需跳过的扩展字段
  if (is3 && ((flags & 0x800) || ((flags & 0x1000) && !hasChar))) p = readStr(u, p).p
  let id = 0
  if (hasChar) { id = u16(u, p); p += 2 }
  let m = null
  if (flags & PF_MTX) { const br = new Br(u, p * 8); m = readMatrix(br); br.align(); p = br.bytePos }
  if (flags & PF_COLOR) p = skipColorTransform(u, p)
  if (flags & PF_RATIO) p += 2
  let name = null
  if (flags & PF_NAME) { const r = readStr(u, p); name = /^[A-Za-z_][A-Za-z0-9_]*$/.test(r.s) ? r.s : null; p = r.p }
  if (flags & PF_CLIP_DEPTH) p += 2
  if (exotic || (flags & PF_CLIP_ACTIONS)) name = name || trailingName(u, t)
  if (name == null) name = trailingName(u, t)
  const rec = list.get(depth) || { depth }
  if (hasChar) rec.id = id
  if (m) rec.matrix = m
  if (name) rec.name = name
  list.set(depth, rec)
}
function skipColorTransform(u, p) {
  const br = new Br(u, p * 8)
  const hasAdd = br.read(1), hasMul = br.read(1)
  const n = br.read(4)
  if (hasMul) { br.read(n); br.read(n); br.read(n); br.read(n) }
  if (hasAdd) { br.read(n); br.read(n); br.read(n); br.read(n) }
  br.align()
  return br.bytePos
}
function txt(u, a, b) { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u[i]); return s }

// ---------- 实例表 · 读值版 (含 CXCT 与 ClipDepth, 供 SVG 导出) ----------
// PlaceObject2/3 共用同一份 CXCT (ruffle: read_color_transform(has_alpha=true)):
// 位打包 hasAdd/hasMul + SI(n) 乘数 (8.8 定点, 256 = 1.0) + SI(n) 加数 (0..255 单位)。
export function readCxct(u, p) {
  const br = new Br(u, p * 8)
  const hasAdd = br.read(1), hasMul = br.read(1)
  const n = br.read(4)
  const unit = 256                                           // ruffle 一律按 Fixed8::from_bits 取 (不看版本)
  const mul = [unit, unit, unit, unit], add = [0, 0, 0, 0]
  if (hasMul) for (let i = 0; i < 4; i++) mul[i] = br.sread(n) / unit
  if (hasAdd) for (let i = 0; i < 4; i++) add[i] = br.sread(n)
  br.align()
  return { mul, add, p: br.bytePos }
}
// 滤镜表 (ruffle read_filter 的每条长度, 类型字节之后的字节数): 我们不渲染, 但要跳对才能核对位流对齐
const FILTER_BYTES = { 0: 23, 1: 9, 2: 15, 3: 27, 6: 80 }
function skipFilters(u, p) {
  const n = u[p++]
  for (let i = 0; i < n; i++) {
    const ty = u[p++]
    if (FILTER_BYTES[ty] !== undefined) p += FILTER_BYTES[ty]
    else if (ty === 4 || ty === 7) p += 1 + 5 * u[p] + 16 + 2 + 1            // 渐变滤镜: 颜色数 + (RGBA+ratio)×n + 4×Fixed16 + Strength + flags
    else if (ty === 5) { const cols = u[p++], rows = u[p++]; p += 4 + 4 + cols * rows * 4 + 4 + 1 }
    else throw new Error('unknown filter ' + ty)
  }
  return p
}
// PO3 字段次序 (ruffle read_place_object_2_or_3): flags → depth → ClassName → 角色号 → 矩阵
//   → CXCT → Ratio → Name → ClipDepth → 滤镜表 → BlendMode → CacheAsBitmap。
// 位定义: MOVE 0x01 | CHAR 0x02 | MTX 0x04 | COLOR 0x08 | RATIO 0x10 | NAME 0x20 | CLIP 0x40
//   | CLIP_ACTIONS 0x80 | FILTER 0x100 | BLEND 0x200 | CACHE 0x400 | CLASS_NAME 0x800 | IMAGE 0x1000
//   (与 Adobe SWF19 文档把 Image/ClassName 排在 0x100/0x200 的写法**不同**, 以 ruffle 为准;
//    本仓实测 swf/item/equip/icon/100241.swf PO3@1133: 6 头 + 3 矩阵 + 滤镜(1 个发光, 15 字节) + blend = 26 = tag 长度, 分毫不差)
// rec.drift = 解析终点与 tag 末尾的字节差 (0 = 整包对齐); 带 ClipActions 的记录尾部是动作, 不比对。
export function readPlace(u, t) {
  const is3 = t.code === TAG_PLACEOBJECT3
  let p = t.start
  const flags = is3 ? u16(u, p) : u[p]
  p += is3 ? 2 : 1
  const depth = u16(u, p); p += 2
  const rec = { depth, flags, matrix: IDENT, cxct: null, clipDepth: 0, name: null, id: 0, blend: null, hasFilter: false, drift: 0 }
  const hasChar = (flags & PF_CHAR) !== 0
  if (is3 && ((flags & 0x800) !== 0 || ((flags & 0x1000) !== 0 && !hasChar))) p = readStr(u, p).p   // ClassName
  if (hasChar) { rec.id = u16(u, p); p += 2 }                                                       // 角色号只跟 CHAR 位, 不跟 IMAGE 位
  if (flags & PF_MTX) { const br = new Br(u, p * 8); rec.matrix = readMatrix(br); br.align(); p = br.bytePos }
  if (flags & PF_COLOR) { const c = readCxct(u, p); rec.cxct = c; p = c.p }
  if (flags & PF_RATIO) p += 2
  if (flags & PF_NAME) { const r = readStr(u, p); rec.name = r.s; p = r.p }
  if (flags & PF_CLIP_DEPTH) { rec.clipDepth = u16(u, p); p += 2 }
  if (is3 && (flags & 0x100) !== 0) {
    rec.hasFilter = true
    try { p = skipFilters(u, p) } catch (e) { rec.filterError = e.message }                  // 认不出来的滤镜类型 ⇒ 不猜, 交给导出器记警告
  }
  if (is3 && !rec.filterError && (flags & 0x200) !== 0) { rec.blend = u[p]; p += 1; if (rec.blend === 0xff) p += 1 }  // 0xFF = 后面还有一个"高级混合"字节
  if (is3 && !rec.filterError && (flags & 0x400) !== 0) p += 1                                                          // CacheAsBitmap
  if (is3 && !rec.filterError && (flags & 0x2000) !== 0) p += 1                                                         // Visible
  if (is3 && !rec.filterError && (flags & 0x4000) !== 0) p += 4                                                         // OpaqueBackground
  if (!(flags & PF_CLIP_ACTIONS) && !rec.filterError) rec.drift = t.start + t.len - p
  if (rec.name == null || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rec.name || '')) rec.name = trailingName(u, t)
  return rec
}
// 递归取某帧显示列表 (含 clipDepth / cxct), 供矢量→SVG
export function displayList(swf, tags, frame = 0) {
  const groups = []
  let group = []
  for (const t of tags) {
    if (t.code === TAG_SHOWFRAME) { groups.push(group); group = [] }
    else if (t.code === TAG_END) break
    else group.push(t)
  }
  groups.push(group)
  const list = new Map()
  for (let fi = 0; fi <= frame && fi < groups.length; fi++) {
    for (const t of groups[fi]) {
      if (t.code === TAG_PLACEOBJECT2 || t.code === TAG_PLACEOBJECT3) {
        const r = readPlace(swf.body, t)
        list.set(r.depth, r)
      } else if (t.code === TAG_REMOVEOBJECT2) {
        list.delete(u16(swf.body, t.start))
      } else if (t.code === TAG_REMOVEOBJECT) {
        list.delete(u16(swf.body, t.start + 2))
      }
    }
  }
  return [...list.values()].sort((a, b) => a.depth - b.depth)
}

// SymbolClass (tag 76): 导出类名 → character id。
// 这批图标 SWF 里有 94/1831 只**根显示列表是空的**, 画面挂在导出类上
// (例 swf/item/equip/icon/100034.swf: class "item" → sprite#4) —— 播放器 new 出该类才看得到画。
export function symbolClasses(swf) {
  const out = []
  for (const t of swf.tags) {
    if (t.code !== 76) continue
    const u = swf.body
    let p = t.start
    const n = u16(u, p); p += 2
    for (let i = 0; i < n; i++) {
      const id = u16(u, p); p += 2
      const s = p
      while (p < t.start + t.len && u[p] !== 0) p++
      out.push({ id, name: txt(u, s, p) })
      p++
    }
  }
  return out
}

// 取某一帧的显示列表 (仅处理放置/删除; ShowFrame 分组)
export function frameList(swf, tags, frame = 0) {
  const list = new Map()
  let group = []
  const frames = []
  for (const t of tags) {
    if (t.code === TAG_SHOWFRAME) { frames.push(group); group = [] }
    else if (t.code === TAG_END) break
    else group.push(t)
  }
  frames.push(group)
  for (let fi = 0; fi <= frame && fi < frames.length; fi++) {
    for (const t of frames[fi]) {
      if (t.code === TAG_PLACEOBJECT || t.code === TAG_PLACEOBJECT2 || t.code === TAG_PLACEOBJECT3) {
        applyPlace(list, swf.body, t, t.code === TAG_PLACEOBJECT3)
      } else if (t.code === TAG_REMOVEOBJECT || t.code === TAG_REMOVEOBJECT2) {
        const depth = t.code === TAG_REMOVEOBJECT ? u16(swf.body, t.start + 2) : u16(swf.body, t.start)
        list.delete(depth)
      }
    }
  }
  return [...list.values()].sort((a, b) => a.depth - b.depth)
}

// 名称 → 实例 (根时间轴)
export function findInstance(swf, name) {
  const fl = frameList(swf, swf.tags, 0)
  return fl.find(i => i.name === name) || null
}

// 递归收集某实例下所有矢量轮廓 (变换到根空间, 像素)
export function geometryOf(swf, inst, parentM = IDENT, depthLimit = 6) {
  const groups = []                                       // 每个填充索引一组, 独立 even-odd 后并集
  let nonzero = false
  const seen = new Set()
  const walk = (id, M, depth) => {
    if (seen.has(id + '@' + depth) || depth > depthLimit) return
    seen.add(id + '@' + depth)
    const sh = swf.shapes.get(id)
    if (sh) {
      if (sh.nonzero) nonzero = true
      for (const g of sh.groups || []) {
        const cs = g.contours.map(c => c.map(pt => applyMat(M, pt[0], pt[1])))
        if (cs.length) groups.push({ nonzero: !!sh.nonzero, contours: cs })
      }
      return
    }
    const sp = swf.sprites.get(id)
    if (sp) for (const ci of frameList(swf, sp.sub, 0)) walk(ci.id, mulMat(M, ci.matrix || IDENT), depth + 1)
  }
  walk(inst.id, mulMat(parentM, inst.matrix || IDENT), 0)
  const contours = groups.flatMap(g => g.contours)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const c of contours) for (const [x, y] of c) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y }
  return { contours, groups, nonzero, bounds: contours.length ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null }
}

// 扫描线栅格化 → Uint8Array (1 = 被填充 = 不可走)
export function rasterBlocked(contours, ox, oy, cell, gw, gh, nonzero = false) {
  const grid = new Uint8Array(gw * gh)
  const edges = []
  for (const c of contours) {
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length]
      if (a[1] === b[1]) continue
      edges.push({ xa: a[0], xb: b[0], ya: a[1], yb: b[1], dir: a[1] < b[1] ? 1 : -1 })
    }
  }
  for (let j = 0; j < gh; j++) {
    const y = oy + (j + 0.5) * cell
    const hits = []
    for (const e of edges) {
      const lo = e.dir === 1 ? e.ya : e.yb, hi = e.dir === 1 ? e.yb : e.ya
      if (y >= lo && y < hi) hits.push([e.xa + ((y - e.ya) / (e.yb - e.ya)) * (e.xb - e.xa), e.dir])
    }
    if (!hits.length) continue
    hits.sort((p, q) => p[0] - q[0])
    const row = j * gw
    if (nonzero) {
      let w = 0
      for (let i = 0; i + 1 < hits.length; i++) { w += hits[i][1]; if (w !== 0) fillRow(grid, row, hits[i][0], hits[i + 1][0], ox, cell, gw) }
    } else {
      for (let i = 0; i + 1 < hits.length; i += 2) fillRow(grid, row, hits[i][0], hits[i + 1][0], ox, cell, gw)
    }
  }
  return grid
}
function fillRow(grid, row, xa, xb, ox, cell, gw) {
  let i0 = Math.ceil((xa - ox) / cell - 0.5)
  let i1 = Math.floor((xb - ox) / cell - 0.5)
  if (i1 < 0 || i0 >= gw) return
  if (i0 < 0) i0 = 0
  if (i1 >= gw) i1 = gw - 1
  for (let i = i0; i <= i1; i++) grid[row + i] = 1
}

export function bitsToAscii(grid) {
  let s = ''
  for (let i = 0; i < grid.length; i++) s += grid[i] ? '1' : '0'
  return s
}

// 浏览器端: 取 map SWF 的 path_mc → 可走栅格
export async function fetchSwf(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url)
  const buf = new Uint8Array(await r.arrayBuffer())
  const sig = String.fromCharCode(buf[0], buf[1], buf[2])
  let body
  if (sig === 'CWS') body = await inflate(buf.subarray(8), 'deflate')
  else if (sig === 'ZWS') body = await inflate(buf.subarray(8), 'deflate-raw')
  else if (sig === 'FWS' || sig === 'WS') body = buf.subarray(8)
  else throw new Error('bad SWF signature ' + sig)
  return parseSwf(body)
}
async function inflate(u, fmt) {
  const ds = new DecompressionStream(fmt)
  const stream = new Blob([u]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// 一站式: 地图 SWF → {ox,oy,cell,gw,gh,ascii,stats}
// 语义对齐 MapAssetExtractor.extractPath: path_mc 缩放 1/GRID_SIZE 后 draw,
//   栅格原点 = path_mc 局部 (0,0), 单元 = GRID_SIZE px, alpha==0 (未填充) = 可走。
export function walkGridOf(swf, cell = 10) {
  const named = name => findInstance(swf, name)
  const path = named('path_mc')
  if (!path) throw new Error('path_mc not found in map SWF')
  // MapAssetExtractor 语义: BitmapData.draw 在 path_mc 的【本地】坐标系栅格化
  // (draw 忽略对象自身的放置), 栅格原点 = 本地 (0,0), 每格 cell px;
  // 格数 = path.width = 本地包围盒宽 / cell (Flash 侧按 int 截断)。
  const local = geometryOf(swf, { id: path.id }, IDENT)
  if (!local.contours.length) throw new Error('path_mc 无轮廓 (形状解析失败)')
  const m = path.matrix || IDENT
  const ox = m.tx, oy = m.ty
  const gw = Math.max(1, Math.floor(local.bounds.w / cell))
  const gh = Math.max(1, Math.floor(local.bounds.h / cell))
  // 每个填充索引各自偶奇填充, 再并集 —— 等价于 BitmapData.draw 把所有填充画进同一张位图
  const grid = new Uint8Array(gw * gh)
  for (const g of local.groups) {
    const part = rasterBlocked(g.contours, 0, 0, cell, gw, gh, g.nonzero)
    for (let i = 0; i < grid.length; i++) grid[i] |= part[i]
  }
  let blocked = 0
  for (const v of grid) blocked += v
  return {
    ox, oy, cell, gw, gh, ascii: bitsToAscii(grid),
    contours: local.contours.length, segments: local.contours.reduce((n, c) => n + c.length, 0),
    groups: local.groups.length,
    nonzero: local.nonzero, blockedRatio: blocked / (gw * gh),
  }
}
