// L1 · 野怪**帧包**的纯换算（施工批 **`MDB12`** / `docs/map/map-impl.md §7.3.34`）。
//
// 干什么：地图上野怪的**素材** = Flash 那套 `/swf/pet/normal/<swfId>.swf` **帧序列包**（不是影片：头两字节 = 16 位长度、
//   内嵌一张 PNG spritesheet，与小赛尔部件包同容器 ⇒ 解析复用 `actor-view.js` 的 `parsePack`）。
//   本件只做四件数学：**标签词表 / 动作选择 / 帧号 / 锚点与命中面**。
//   **取包 fetch、画布、点击、漫游循环全在 L4 `app/scenes/mapScene.js`**。
//
// ⚠️ **分布逻辑不在这里**（`MDB11` 已定：野怪在哪、怎么动、打谁 = 地图 XML 的 `<npc><wild>` 单一真值）⇒
//    本件只回答"这只野怪该画哪张图的第几帧、钉在位置点上偏多少"。
// ⚠️ **不碰 AS3**：`game/maprunner/WildPet.as` 的**素材语义**（锚点/镜像/走站标签/帧推进）被本件**照抄复用**，
//    但那件本体运行时**不再生成**（`wild: ''` ⇒ 零生成）⇒ 零 `game/maprunner/**` 改动、不重编译。
// ⚠️ **人类 ③ 拍板 = 帧包原生像素**（不吃重启 `<npc @size>`）⇒ 尺寸/锚点全来自包头（`frameW/frameH/anchorX/anchorY`）。
// ⚠️ **人类 ④ 拍板（`MDB12`）= 走/站两态 + 左右镜像** ⇒ 当时把上游的**脚下阴影 / `personal` 待机小动作 / 惊讶特效 / `Lv` 脚标**四条登记为**不做**（`AGENTS §4.19`）。
//    ⚠️ **★`MDB13`（人类 2026-10-21 点名「接下来做野怪的4条」）已把这四条逐条补齐** ⇒ 见本文件末尾 `MDB13-*` 各段；四条拍板原文与偏离登记同在 `AGENTS §4.19` / `map-impl §7.3.35`。
// ⚠️ 本件**无 DOM / 无 fetch / 不 import app**（`M-5`），且**不改写 `pack` 对象**（归一化词表进模块内 `WeakMap`）。
// ⚠️ **不接 `movement.originalFacesRight`**：实测 107 只 wander 者**全为 `"true"`** ⇒ 与本件默认（包原画朝右、`dx<0` 才镜像）一致；
//    哪天真出现 `"false"` 再在 L4 取反 `flip`（登记在 `map-move §3.4`，不预先做分支）。
//
// 真值：上游 `game/maprunner/WildPet.as`
//         `:189-202 setAction`（标签取不到 ⇒ 退 `standDown`、**不抛**）· `:274-291 update`（**每舞台帧进一格**、越过 `end` 回 `start`）
//         `:316-333 stepWalk`（`dy` 定 `lookUp`、`dx` 定 `flip`，**方向保持**）· `:337-348 render`（`x = flip*(ox-anchorX)`、`y = oy-anchorY`、`scaleX=flip`）
//         `:351-360 drawHot`（命中面 = 整格 `(-anchorX,-anchorY,frameW,frameH)` = "帧格本身 = 点热区"）
//       本仓 `docs/map/map-move.md §3.4`（38 包标签实测：32 齐 / 6 用中文词，`209`/`213` 键名**带尾空格**）
//       `AGENTS §4.10`（人眼校族）、`§4.19`（野怪素材单一口径 + 四条禁令）

/**
 * 动作 → **标签别名表**（实测 38 只野怪包的词表，`map-impl §7.3.34`）。
 * ⚠️ 上游包是**手工做的**，中文词直接当标签名用：`64`=`正面走路`、`114`=`跑步/站立/背面跑`、`195`=`背面走`、
 *   `209`/`213`=`背面走路␣`（**带尾空格** ⇒ 查表前一律 `trim`，见 `normalizeLabels`）、`228`=`正面待机/背面待机`。
 * 顺序 = 优先级（先英文正名，再同族中文词）；**都不命中**才走 `resolveLabel` 的跨族兜底。
 */
export const PET_LABEL_ALIAS = {
  walkDown: ['walkDown', '正面走路', '正面走', '跑步', '走'],
  walkUp: ['walkUp', '背面走', '背面走路', '背面跑'],
  standDown: ['standDown', '正面待机', '站立', '待机'],
  standUp: ['standUp', '背面待机', '背面站立', '背面站'],
}

// 归一化词表（键名 `trim` ⇒ 治 `背面走路␣` 这类尾空格）；按 `pack` 对象缓存、**不写回 pack**（保持纯函数语义）。
const NORM = new WeakMap()
function normalizeLabels(pack) {
  let m = NORM.get(pack)
  if (m) return m
  m = new Map()
  const raw = pack && pack.labels
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (!v || !Number.isFinite(Number(v.start)) || !Number.isFinite(Number(v.end))) continue
      const key = String(k).trim()
      const start = Number(v.start)
      const end = Number(v.end)
      if (end < start || start < 1) continue                     // 畸形区间不当候选
      if (!m.has(key)) m.set(key, { start, end })
    }
  }
  NORM.set(pack, m)
  return m
}

const inRange = (r, pack) => !!r && r.start >= 1 && r.end >= r.start && r.start <= pack.totalFrames

/**
 * 动作名 → **帧区间** `{start,end}`。兜底链 = ① 本动作别名 → ② 同族的另一朝向（上下只影响观感，不许没画面）
 * → ③ 另一族（走↔站）→ ④ 包内第一个可用标签 → ⑤ `{1,totalFrames}`（素材整个没标签的理论情形）。
 * ⚠️ **永不抛**（照 AS3 `setAction:189-202` "取不到就退 `STAND_DOWN`"）；包非法（无帧）⇒ `null`，由 L4 跳过绘制。
 */
export function resolveLabel(pack, action) {
  if (!pack || !(pack.totalFrames > 0)) return null
  const m = normalizeLabels(pack)
  const pick = (keys) => {
    for (const k of keys || []) { const r = m.get(k); if (inRange(r, pack)) return r }
    return null
  }
  const r = pick(PET_LABEL_ALIAS[action])
  if (r) return r
  const sibling = action === 'walkDown' ? 'walkUp' : action === 'walkUp' ? 'walkDown'
    : action === 'standDown' ? 'standUp' : 'standDown'
  const fam = pick(PET_LABEL_ALIAS[sibling])
  if (fam) return fam
  const otherFamily = String(action).startsWith('walk') ? 'stand' : 'walk'
  for (const key of Object.keys(PET_LABEL_ALIAS)) {
    if (key.startsWith(otherFamily)) { const r2 = pick(PET_LABEL_ALIAS[key]); if (r2) return r2 }
  }
  for (const range of m.values()) if (inRange(range, pack)) return range     // ④ 包内任意可用标签
  return { start: 1, end: pack.totalFrames }                                  // ⑤ 全帧区间
}

/**
 * 该画哪个动作（= AS3 `stepWalk:316-333` 的标签选择：**只有上下两族包，左右靠镜像**）。
 * ⚠️ `up` 由 L4 **按 Unity「y 向上」**算好传入（= AS3 舞台 `dy<-1` 的等价判据），本件不碰坐标符号。
 */
export function petAction(moving, up) {
  return (moving ? 'walk' : 'stand') + (up ? 'Up' : 'Down')
}

/** 区间内循环取帧号（AS3 `update` 的 `curIdx++` / 越界回 `start`；`cycleFrame` 的 actor 版兜底语义不同 ⇒ 本件另写）。 */
export function petFrame(pack, action, tick) {
  const r = resolveLabel(pack, action)
  if (!r) return 0
  const span = r.end - r.start + 1
  const t = Number.isFinite(tick) ? Math.floor(tick) : 0
  return r.start + ((t % span) + span) % span
}

/**
 * **命中面 + 标注基准**（人类 ③ = 原生像素）：`{ax, ay, w, h}` = `{anchorX/frameW, anchorY/frameH, frameW, frameH}`。
 * L4 三处消费点（`drawNpcs` / SWF 路点击 / JS 路点击）与 PNG 支路的 `NPC_ANCHOR` **共用同一套 `x-ax*w, y-ay*h` 公式**
 * ⇒ 帧包项的矩形 = 上游"帧格整格"（`drawHot`），锚点落在野怪位置点上。`pack` 非法 ⇒ `null`（L4 退 PNG 支路）。
 */
export function petHitRect(pack) {
  if (!pack || !(pack.frameW > 0) || !(pack.frameH > 0)) return null
  return { ax: (pack.anchorX || 0) / pack.frameW, ay: (pack.anchorY || 0) / pack.frameH, w: pack.frameW, h: pack.frameH }
}

/**
 * 帧的**绘制偏移**（相对野怪位置点，镜像前）= AS3 `render:345-346` 的 `ox-anchorX / oy-anchorY`。
 * 镜像由 L4 用 `translate(x,y)+scale(flip,1)` 完成（法与 `mapScene` M8-b2 修补① "外层整体镜像"同）。
 */
export function petDrawShift(pack, rec) {
  if (!pack || !rec) return null
  return { dx: rec.ox - (pack.anchorX || 0), dy: rec.oy - (pack.anchorY || 0) }
}

// ─────────────── ★MDB13-a · 脚下阴影 ───────────────
// 上游 = `WildPet.as:169-187 addShadow`：素材**借** `UI_ActorShadow` 的 `local` 首帧（官服 `UI_PetShadow.swf` **404** ⇒ 顶替，同 `MDB12` 借包口径），
//   `ColorTransform(0,0,0,0.45)` 压成黑色半透明剪影 + `scaleX=scaleY=野怪帧格宽/40`；**不吃 `flip`**（对照 `ActorView.as:136-138` 才镜像 ⇒ 阴影不跟着翻）。
// ⚠️ 本件**只出数学**：压黑 = L4 **一次性离屏预渲染**（逐帧 `ctx.filter` 太贵）；偏移**复用** `petDrawShift`（同一条 `ox-anchorX` 式子，不另写）。

/** 上游 `addShadow:183` 的 `scale = frameW/40` 里那个 **40**（人眼校族 `AGENTS §4.10` 同族：阴影整体偏大/偏小只调这里）。 */
export const SHADOW_BASE_W = 40

/** 野怪帧格宽 → 阴影缩放（包非法 ⇒ `1`，由 L4 照原生尺寸画、不猜）。 */
export function petShadowScale(petPack) {
  return petPack && petPack.frameW > 0 ? petPack.frameW / SHADOW_BASE_W : 1
}

// ─────────────── ★MDB13-b · `personal` 待机小动作 ───────────────
// 上游 = `WildPet.as:301-305 playIdelAnimation` + `:274-291 update` 的 `personaling` 支路：**播一遍**（不循环），
//   末帧 ⇒ 回站立 + `randomWalk()`。⚠️ **触发时机我们有意偏离**：上游是"**久站**才播"（`checkIdleState:293-299` 的 idle 计时），
//   人类 2026-10-21 拍板 = **每次驻停播一次**（走→停的跳变帧）⇒ 触发归 L4，本件只出**区间与帧号**。
// 实测 82 包（`map-move §3.4`）：**81 只带 `personal`**、唯一缺件 `114` 用同义标签 **`free`（55–119）** ⇒ 两个词都进别名表。

/** `personal` 段的别名（**只本族**：`standby`/`idle` 这类同音词实测不存在，不预先塞）。 */
export const PET_PERSONAL_ALIAS = ['personal', 'free']

/**
 * `personal` 段的**帧区间** —— ⚠️ **无兜底**（与 `resolveLabel` 的五级兜底恰好相反）：
 * 缺标签 ⇒ `null` ⇒ **不播**。理由：走/站兜底链在这里语义错（把"待机小动作"播成"原地走路循环"是画错，不是降级）。
 */
export function personalRange(pack) {
  if (!pack || !(pack.totalFrames > 0)) return null
  const m = normalizeLabels(pack)
  for (const k of PET_PERSONAL_ALIAS) { const r = m.get(k); if (inRange(r, pack)) return r }
  return null
}

/**
 * **播一遍**（不循环）的帧号：`tick` = 本段起算的第几格（0 起），`maxFrames` = 时长上限（L4 的人眼校常数）。
 * ⇒ `{frame, done}`：帧号夹在 `[start, start+min(span,max)-1]`，`done` = 夹到的那一格 ⇒ 调用侧据此**摘掉 personal、回站立**。
 * 夹上界的必要性（实测）：`personal` 段跨 **4–233 帧**，最长几只（`122`=233、`135`=151）按 `PET_FPS=12` 要播 19s ⇒ 截到上限。
 */
export function petFrameOnce(range, tick, maxFrames) {
  if (!range) return null
  const span = range.end - range.start + 1
  const cap = Number.isFinite(maxFrames) && maxFrames > 0 ? Math.min(span, Math.floor(maxFrames)) : span
  const t = Number.isFinite(tick) ? Math.max(0, Math.floor(tick)) : 0
  return { frame: range.start + Math.min(t, cap - 1), done: t >= cap - 1 }
}

// ─────────────── ★MDB13-c · 脚下等级脚标 ───────────────
// 上游 = `SpawnedPet`：`"Lv"+level+" "+name`、`level==0 ⇒ "Lv???"`、位置 `UNDER_FEET`（脚底居中）
//   （真值见 `docs/legacy/web-client-notes.md §`「野怪脚标」段）。⚠️ **等级真值 = 该 NPC 自己 `<battle>` 的敌方 `bossOf.level`**
//   （`parse-map.js:126`；★`MDB11` 起野怪等级唯一来源 = `<battle>` ⇒ 脚标与**实际打到的等级必然一致**，不看名字）。
// 实测（`projects/…/Data/Maps/*.xml` 粗扫，`map-move §3.4`）：**112 只含 `<wild>`**（`active=false` 2 只 ⇒ 上屏 110）、**112 只全有 `<pet level>`**、
//   **111 只名字自带 `LvNN ` 前缀** ⇒ 照上游公式直接拼会写出 `Lv13 Lv13 奇鲁` ⇒ **先剥前缀**；
//   **名级不一致 4 处** = `133` 的荧光蝶 3 只（名 `Lv10/11/12` ⇔ `level=8/9/10`）+ `408` 的多利（名 `Lv70` ⇔ `level=14`）⇒ **脚标以 `<battle>` 为准、这 4 处观感会变**（已进手测）。

/** 等级（`number | null`）：`<battle>` 敌方首只的 `level` → 名字里的 `Lv\d+` → `null`（⇒ 出 `Lv???`，照上游）。 */
export function petLevel(n) {
  for (const b of (n && n.battles) || []) {
    const lv = Number(b && b.enemy && b.enemy[0] && b.enemy[0].level)
    if (Number.isFinite(lv) && lv > 0) return lv
  }
  const m = /^Lv\s*(\d+)/i.exec(String((n && n.name) || ''))
  return m ? Number(m[1]) : null
}

/** 脚标文本 = `Lv{等级} {去掉 Lv 前缀的名字}`（名字为空 ⇒ 只剩 `Lv{等级}`）。 */
export function petLabelText(n) {
  const lv = petLevel(n)
  const base = String((n && n.name) || '').replace(/^Lv\s*\d+\s*/i, '').trim()
  return 'Lv' + (lv == null ? '???' : lv) + (base ? ' ' + base : '')
}

// ─────────────── ★MDB13-d · 惊讶特效（头顶「!」） ───────────────
// 上游 = `WildPet.as:222-229 playSurpriseEffect` + `:231-238 drawMark`：`markTop = -height + 20`（= 整只 sprite 顶边往上抬 20px），
//   每帧 `mark.y = markTop + (fr.oy - markSeq.anchorY)`、**不镜像不缩放**（`mark` 挂在**容器**上，容器不吃 `scaleX=flip`）。
// 素材 = `UI_SurpriseMark`（**实测 23 帧**；官服 `UI_FightSuprise.swf` 404 ⇒ 同阴影那样借小赛尔那套，`AGENTS §4.19` 顶替登记）。

/** 上游 `-height + 20` 里那个 **20**（人眼校族：「!」偏高/偏低只调这里）。 */
export const MARK_TOP_PAD = 20

/** sprite 顶边相对野怪位置点（原点在锚点/脚底、y 向下为正 = 与 AS3 舞台同向）⇒ 标注基准 = `-height + MARK_TOP_PAD`。 */
export function petMarkTop(height) {
  const h = Number(height)
  return (Number.isFinite(h) ? -h : 0) + MARK_TOP_PAD
}
