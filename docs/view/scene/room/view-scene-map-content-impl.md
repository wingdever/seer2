# View 子设计 · 房间场景内容层 · 实现文档（view-scene-map-content-impl.md）

> 子文档 of `docs/view/view-design.md`（§8 子文档地图 B3）。配对设计 = `docs/view/scene/room/view-scene-map-content.md`（真值 / 目标口径）。
> 本文把设计落成**逐文件、逐函数、逐层**的施工图；两者冲突以设计的**口径**为准、以本文的**具体做法**为准（`docs/arch-docs.md §2`）。
> ✅ **本份 = 已落码（2026-10-19，人类 "开工"）**；as-built 见 §10（实际文件/函数/行号 + 门禁 + 与设计 §3 表的口径更正回执）。设计态阶段一续产物，落码后停下等人手测（§9）。
> 证据标注：【样本】/【源码】/【推断】；上游路径相对 `projects/Seer2-Restart-Lite-main/Assets/`；实测数字均为 2026-10-19 离线跑 `game/logic/map/parse-map.js` 读 272 张 `Resources/Data/Maps/*.xml` 所得【样本】。
> **本地编号**：施工批 **VB3-a…g**；待拍板 **BCQ1–BCQ2**（B3-Content）；实现期铁律见 §0（编号 1–7，不另立 `BCI`）。均**不**与地图线 `MB*`、面板 `VP*`、开始场景 `STQ*` 混。

---

## 0. 范围 · 边界 · 铁律

**本份这一批只做一件事**：把房间场景里 **NPC 的真美术画上屏**，并**替换掉** MB6 增补（`AGENTS §4` 第 13 条）留下的**占位橙点**（人类 2026-10-19 原话："真画出来后，会替换掉我这次加的占位橙点"）。

| 属本批（B3 · NPC 上屏） | 不属本批 |
|---|---|
| NPC（`<npc>`）的**取图 + 图层 + 尺寸 + 点击命中** | 地图**规则**（条件→动作 / 对话 / 战斗触发 / 传送 = **地图线** `docs/map/map-design.md`，已落 MB1–MB7） |
| NPC 头顶**名字脚标**（`namePos`/`nameColor`/`nameSize`/`nameFont`） | 野怪脚标（`Lv`+名，现 `#lbl`，已由地图线驱动，非本份） |
| 缺真图者（`none` / 装载失败）的**占位兜底**（沿用橙点） | 农场 / 动物 / 池塘 / 虫 / 巢（`farm`/`animal`/`pond`/`insect`/`nest`）—— A 组子系统 + 另批 |
| — | 背景 / 通行·前景遮罩 / 角色 / 相机 / 传送点光口 / 寻路预览 / HUD / Panel（各归其线，见设计 §1/§3） |

**铁律（实现期逐条自检）**：

1. **数据面归地图线、机制归本份**（`docs/map/map-impl.md §4 D10`）：本份**只消费** `MapRecord` 已给的字段（`resId`/`resIdKind`/`pos`/`size`/`active`/`name`/`namePos`…，见 `game/logic/map/entity.js` 的 `buildEntities` 产物），**不重解析 XML、不新增取数入口**（取数一律经 `content.loadMap`，`AGENTS §5 决议⑨`）。
2. **上屏通道 = 宿主 canvas 叠加层**（本批唯一可行路，理由见 §2）：**不碰 `game/maprunner/MapRunner.as`**（`docs/map/map-code-map.md §2.4` 禁改区 + `AGENTS §4` 围栏），**不改 `swfOk===true` 图的既有画面**（`AGENTS §4.11`：SWF 路逐字节不变）。
3. **只在 JS 路（`swfOk===false`）落真美术**（见 §7 BCQ1）：SWF 路前景遮罩在 Ruffle 内容层内部（设计 §8 行 8 同族穿帮问题），把 NPC sprite 叠在整块 SWF 之上会穿帮 ⇒ SWF 路 NPC 上屏**本批不做**，登记为待拍板后续。
4. **不伪造内容**：`resIdKind==='none'`（实测 20 条，如"神奇扭蛋机"/"每日补给"）或取图 404 ⇒ 画**占位橙点**（沿用 MB6 增补，非正式美术），`title`/日志自陈缺素材。
5. **位置误差人类接受**（`AGENTS §4.10` 路线 A）：换算 = `fx=ux/960`、`fy=uy/540`（复用 `game/logic/map/js-view.js` 的 `unityToStage`），"站得像不像"**靠人眼校**（设计 §8 行 15 / §8.2 待办 2）；本份**不**逐图标定。
6. **不改旧桥 `game/data/maps.json`**：JS 路画面坐标本就吃它（`docs/map/map-code-map.md §2.2` 行 55「不改」过渡期并存）；本份动的是**实体上屏**，与光口坐标不冲突。
7. **硬刷新纪律**（`AGENTS §3` / `docs/arch-code.md §7.1`）：新增 L1 共享模块导出 ⇒ 浏览器旧缓存会在 ESM 链接期挂入口（载入中…黑屏）。

---

## 1. 变更文件清单

| # | 文件 | 层 | 动作 | 内容 |
|---|---|---|---|---|
| G1 | `game/logic/map/npc-art.js` | L1 | **新建** | 纯件（无 DOM / 无 fetch / 无 import app，`M-5`）：`resId`→取图 URL 的**三类映射规则**（§3）+ `npcRectInStage(npc, rect)` 尺寸换算（§5）+ `ART_ROOT` 常量。与 `js-view.js` 同层同规 |
| G2 | `game/app/scenes/mapScene.js` | L4 | **改** | ① 新建 `#npc` canvas 层（§4）；② `draw()` 的 JS 路 NPC 分支：占位橙点 → **真 sprite（`drawImage`）+ 名字脚标**，缺图回退橙点；③ `M.npcSprites` 装载缓存（仿 `ACTOR_CACHE`/`portalImg.onload`）；④ `jsClick` 命中框从固定 16px 改为 **sprite 实际矩形**（§6）；⑤ 换图 / `leaveJsMode` / `unmount` 拆净 `#npc` + 缓存位图 |
| G3 | `game/index.html` | — | **改** | 加 `#npc` canvas（`1200×660`、`pointer-events:none`、z 序见 §4）；样式与 `#portal`/`#ov` 同规 |
| G4 | `docs/map/map-code-map.md` | 文档 | **改** | §2.2 加 `npc-art.js`（L1）一行；§2.4 A2 例外围栏行补"NPC 真美术上屏 = B3 在本通路的第一块"（正本指针，`AGENTS §1.4`） |
| G5 | `AGENTS.md §4` | 文档 | **改** | 第 13 条（占位橙点）补一句：**B3 真美术上屏后，有真图者替换橙点、`none`/缺图者仍占位**（落码时翻，见 §8 VB3-g） |
| G6 | `docs/status.md` | 文档 | **改** | 登记"View B3 · NPC 真美术上屏"批 + 请人测条目（§9） |

**不改**：`game/logic/map/entity.js`（字段已够）、`game/logic/map/parse-map.js`、`game/logic/map/js-view.js`（复用 `unityToStage`，不加导出）、`game/maprunner/**`（禁改区）、`#portal`/`drawPortals`（光口是另一通路）、`game/core/**`（L0 无涉，本批零 `.ts`）。

---

## 2. 上屏通道：为什么只有"宿主 canvas"一条路

设计 §8 行 14 留了两条待 impl 定：① 塞进 `MapRunner`（改 AS3 源 + 重编译 `mapRunner.swf`）；② 宿主 **DOM/canvas 层**用重启导出件画（同 `#portal`/`#lbl` 先例）。

**实测裁定 = ②，①直接出局**，两条硬事实【样本/源码】：

- **`MapRunner.as` 里根本没有 `npc` 概念** —— 只有 `setWorld`（传送点 spots）与 `setWild`（野怪）。`grep npc` 在 `game/maprunner/MapRunner.as` **零命中**。⇒ 走 ① 不是"接一条已有通道"，而是**从零加一类实体 + 重写 AS3 渲染 + 重编译 swf**，且撞 §0 铁律 2 的禁改区。出局。
- 野怪之所以在 SWF 里画得出，是因为**地图线专门在 `MapRunner.as` 里写了 `WildPet`**（【源码】`MapRunner.as:82-217`）——那是**野怪**（战斗宠），**不是 `<npc>`**。NPC 从未进过 SWF 内容层。⇒ SWF 路今天对 NPC 是**空白**（根本不显示），与"逐字节不变"不矛盾（本份只新增 JS 路）。

⇒ 本批把 MB6 增补的占位通路**升级**为真美术通路：同一个 `draw()` JS 分支、同一张 `jsView.rect`、同一套 `unityToStage`——只把"画圆点"换成"画 sprite + 名字"，缺图仍画圆点。这是 A2 / A2b / MB6 一路开下来的**同一片 L4 自绘区**再扩一格（`AGENTS §4.11`/§4.13 先例）。

---

## 3. NPC 美术映射：三类规则（实测 0 未命中）

设计 §3/§8.2 把"NPC 美术映射"列为留给本份的开放项。实测把它**关账**：`resIdKind`（L0 `parseAssetRef` 六形状，`game/core/map/map-table.ts:128`）跨 604 只 NPC 只落三类，且**每类都有现成 PNG、0 未命中**【样本】：

| resIdKind | 计数（npcs） | 映射规则 → 相对 `Resources/` | 图样实测 |
|---|---|---|---|
| **path** | **346** | `Resources/<resId>`（无扩展名补 `.png`；含 `.png` 原样） | `Pets/pet/*` = **全身战斗宠立绘**（255–766px，425 张在盘）；另有 `Maps/mine/*`(农场矿场 13)、`Items/*`(5)、`Buffs/*`(4)、`Dango/dango/*`(3)、`Pets/battle/*`(2) |
| **npcId** | **238** | `Resources/Npc/<resId>.png` | **真·地图 NPC sprite**（80–214px，138 张在盘；如 `1001`/`1002`/`1001706`） |
| **none** | **20** | —— 无图源 | "神奇扭蛋机"/"扭蛋商店"/"每日补给"/"矿石转化"/"臭臭花"/`99101`–`99112` 等 ⇒ **占位橙点兜底**（§0 铁律 4） |

**`npc-art.js` 的三类函数（L1 纯，G1）**：⚠️ **`MDB12`（2026-10-21）起，带 `<wild>` 的野怪多一条"帧包优先"支路**（`resId`→重启形象 id→`pet_appearance_swf.csv`→`swf/pet/normal/<n>.swf` 原生像素 + 走/站 + 镜像；解不出包 ⇒ **照落回本表的 PNG 规则**，画面不会空一格）⇒ 本表的三类规则**一字未改**、仍是 PNG 支路与普通 NPC 的真值；详见 §10.2 与 as-built `docs/map/map-impl.md §7.3.34`。

```js
// 输入 = buildEntities 的一条（含 resId / resIdKind）；输出 = 可 fetch 的绝对 URL 或 null（none/畸形）
const ART_ROOT = '/projects/Seer2-Restart-Lite-main/Resources'   // dev server 服务仓库根（同 js-view.js:16 BG_DIR）
export function npcArtUrl(npc) {
  const k = npc?.resIdKind, raw = npc?.resId
  if (k == null || raw == null) return null
  if (k === 'npcId') return `${ART_ROOT}/Npc/${raw}.png`                       // 238 条
  if (k === 'path')  return `${ART_ROOT}/${/\.png$/i.test(raw) ? raw : raw + '.png'}`  // 346 条
  return null                                                                  // none(20) / builtin / mod / expr ⇒ 无真图
}
export function npcHasArt(npc) { return npcArtUrl(npc) != null }
```

⚠️ 只接 `npcId`/`path` 两形（合计 584/604 = **96.7%**）；`builtin`/`mod`/`expr` 实测在 npcs 里 **0 条**（六形状里只有这三类落地），若将来出现 ⇒ 落 `null` 走占位，不瞎猜路径。

**覆盖度**【样本】：**240 / 272 张图**至少有 1 只 `active` 且有真图的 NPC；这些图里 `active` 可画 NPC 合计 **541 只**；另有 2 张图只有 `inactive` 可画者（§0 只画 `active`，见 §5）。

---

## 4. 图层序：新建 `#npc` canvas

设计 §4/§5/§6 的现层栈（自下而上）：`ruffle-player → #portal(z1) → #ov(z2) → #lbl(z3) → #hudtxt(z4) → #bagtip → #prompt(z70)`。占位橙点现在画在 `#ov`（G2）。

**新增 `#npc`**，位次钉在 **`#portal`(z1) 与 `#ov`(z2) 之间 ⇒ `z-index:1` 但 DOM 序在 `#portal` 之后、`#ov` 之前**（同 z 用文档序分先后，`#ov` 仍在其上以便调试栅格盖得住 sprite）：

```
#bgc(JS底图) → ruffle-player(SWF内容) → #portal(光口 z1) → #npc(NPC真美术, 新 z1) → #ov(调试/占位橙点 z2) → #lbl(z3) → #hudtxt(z4) → …
```

- **JS 路**：`#bgc` 画底图 → `#npc` 画 NPC sprite+名字 → `#ov` 只画**缺图者的占位橙点**（有真图的不再在 `#ov` 画点，避免重影）。角色（`drawActor`/黄点）与走位仍在 `#ov`，NPC 在其**下层**（sprite 压不住角色，符合"人站在 NPC 前"）。
- **SWF 路**：`#npc` 空（本批不做 SWF 路 NPC，§7 BCQ1）。
- `pointer-events:none`（点击归 `#ov` 的 `jsClick`，见 §6，与光口/脚标同一处置）。

---

## 5. 坐标 + 尺寸换算（JS 路）

**位置**（复用 `js-view.unityToStage`，与占位标记 / 光口**同一函数同一 rect**，`mapScene.js:545`）：

```
s = unityToStage(npc.pos.x, npc.pos.y, M.jsView.rect)   // flipY=true（Unity 左下 → 舞台左上）
x = M.cam.x + s.x,  y = M.cam.y + s.y                    // JS 路 M.cam 恒 0
```

⚠️ `pos` 是 **sprite 的锚点**：上游 `NpcView.SetPosition` 把 `rect.anchoredPosition = pos`，且 `Assets/Resources/Prefabs/Map/Npc.prefab` 的 `rect` RectTransform `pivot=(0,0)`、anchor(0,0) ⇒ `pos`=NPC 包围盒**左下角**、原点画布左下、y 向上（与 `flipY` 翻转同源）。本份把 sprite 的**左下角**贴到 `pos`（脚底站姿，与野怪 `UNDER_FEET` 脚标同口径）⇒ `drawImage` 左上 = `(x, y - h)`（`ax=0, ay=1`）。此为 `flipY` 之后**第二条靠人眼校**的常量（`AGENTS §4.10`），锚点方向若反，人测指出即调 `NPC_ANCHOR`（G1 导出一个 `{ax,ay}` 供 L4 用）。

**尺寸**（`<npc size="x,y">`，实测 `size.x`：path 中位 88 / 最大 950，npcId 中位 125 / 最大 960，单位 = **Unity 参考画布 960×540**【样本】）：

```js
// npc-art.js（G1）：Unity size → 舞台像素（与 unityToStage 同比例，各自等比）
export function npcSizeInStage(npc, rect) {
  const sx = npc?.size?.x, sy = npc?.size?.y
  if (!(sx > 0 && sy > 0)) return null                 // 缺 size / (0,0) ⇒ 用图自身 naturalSize（L4 兜底）
  return { w: (sx / REF_W) * rect.dw, h: (sy / REF_H) * rect.dh }
}
```

- 有 `size` ⇒ 按上式**拉伸到规格**（上游就是这么摆的，非方形像素保持）。
- `size` 缺或 `(0,0)`（实测仅 1 条）⇒ 退回 **PNG naturalWidth/Height × 一个 `NPC_FALLBACK_SCALE`**（人眼校常量，默认按 `rect.dw/960` 等比），登记 §9 待校。
- `active === false`（实测 43 条）**不画**（上游进图 `SetActive(false)`）；`pos` 缺失实测 **0 条**，但 `draw()` 仍按现有 `Number.isFinite` 守卫跳过。
- `<anim>`（59 条 Unity 动画）/ `<gif>`（3 条）⇒ **本批只画静帧**（resId 那张 PNG）；动画是画面表现、另批（与野怪漫游同族，非地图规则）。

---

## 6. 点击路由：命中框从固定圆改成 sprite 矩形

现状（`mapScene.js:1128`）：`jsClick` 用 `M.npcMarkers` 的**固定 16px 圆**命中 ⇒ `onNpcClick(id,'click')`（那台 `resolve→run` 机，地图线已建好）。

真美术上屏后：

- `draw()` 在 `#npc` 画 sprite 时，把每个 sprite 的**舞台矩形** `{id,name,x,y,w,h}` 一并存进 `M.npcHit`（新数组；有真图者进这个，缺图者仍进 `M.npcMarkers`）。
- `jsClick` **先按 sprite 矩形**命中（点在 NPC 身上即算），再按旧 16px 占位圆兜底（覆盖缺图者），二者都不中 ⇒ 才走 `M.spots` 光口 / 走位。命中仍调**同一个** `onNpcClick(id,'click')`（§0 铁律 1：点击路由是地图线 M2/M3 那台机，本份不碰）。
- 光口 `M.spots` 命中优先级不变（`HOT_R=26`，`mapScene.js:1132`）；NPC 矩形若与光口重叠 ⇒ **NPC 优先**（人要点的是人，不是门；登记为人眼校可翻项）。

⇒ 交付效果：JS 路地图上，鼠标点**画出来的 NPC** ⇒ 弹对话 / 开战（走 MB6/MB7 已通的出路），**不必再敲控制台 `window.onNpcClick`**。这正是选 A（占位标记）时承诺的"鼠标点就能验"的真美术版。

---

## 7. 待拍板（本份要人先定的，先人话再编号）

### BCQ1 · SWF 路（`swfOk===true`，170/272 图）的 NPC 要不要也画？ ✅ **初拍 (A)（2026-10-19 "认"）→ ✅ 追认改选「也画 · 盖顶层近似版」（2026-10-19，见 §7.1 修订）**
- **这是什么**：一大半房间是有可玩 SWF 画面的（Ruffle 播 MapRunner + 地图 SWF）。这批真美术只在**没 SWF 画面的那 102 张图**（JS 回退路）画。SWF 路上 NPC 仍**不显示**（MapRunner 无 npc，见 §2）。
- **为什么现在问**：定了才知道本批交付面是"102 张图有 NPC"还是"全部 272 张都有"。
- **选项与后果**：
  - **(A · 建议) 本批只 JS 路**：干净、不碰 SWF 逐字节不变围栏；代价 = SWF 图的 NPC 仍缺（但 SWF 图本就没有 NPC，玩家视角不是"回退"而是"维持现状"）。
  - **(B) 也画 SWF 路**：NPC sprite 会叠在整块 Ruffle 画面之上 ⇒ **压过前景遮罩**（设计 §8 行 8 光口同族穿帮：NPC 站在掩体前也照画到掩体上）+ 违反 `AGENTS §4.11`「SWF 路逐字节不变」。要做就得连前景遮罩几何一起处置 = 另一整批。
- **建议 (A)**，SWF 路 NPC 上屏登记为**待后续（需前景遮罩方案）**，不阻塞本批。

### BCQ2 · 名字脚标画不画？ ✅ **已拍板 (A)（人类 2026-10-19 "认"）**
- `<npc>` 自带 `namePos/nameColor(默认0,64,255,255)/nameSize/nameFont`。上游在 NPC 头顶画名字。
- **中文**：地图 SWF 字体子集无 CJK ⇒ 只能 canvas/DOM 出（`MP4` 同光口出口名处置）。本批 `#npc` 是 canvas ⇒ 能直接 `fillText` 中文。
- **选项**：(A·建议) 画（sprite 头顶 `fillText(name, …)`，用 `nameColor`）——让 NPC 认得出；(B) 先只画 sprite、名字下批。
- **建议 (A)**：点得动但不知道点了谁，人测体验差；名字是 canvas 直书、成本极低。

> ✅ **BCQ2 由人类 2026-10-19 "认" 拍板 = (A)**：NPC 头顶**画中文名字**（JS 路 + SWF 路一致）。
> ✅ **BCQ1 见 §7.1 追认修订**：JS 路（B3 首批）已落码；SWF 路（170 张 `swfOk===true` 图）**也画** = 盖顶层近似版（遮挡不完美，如实登记、留 B）。

### 7.1 BCQ1 追认修订（人类 2026-10-19 · B3 首批交付手测通过后追加）
- **触发**：B3 首批（只 JS 路）交付后，人测「现在可以看到 NPC 的美术素材了」⇒ 追问「有 SWF 画面的图也渲染 NPC？」人类选 **A：先让 SWF 图也看得见、点得动 NPC，遮挡缺陷如实登记、留给 B 以后收拾**。
- **改选内容**：BCQ1 从「只 JS 路（102 图）」→「JS 路 + SWF 路（全 272 图）都画 NPC 真美术」。
- **做法（盖顶层近似版 · 不碰 `MapRunner.as`）**：SWF 路 `draw()` 里用 `unityToStage(ux,uy,{dx:mapX,dy:mapY,dw:mapW,dh:mapH})`（`mapX/Y/W/H` = `mapReady` 已回报、存进 `M.info`；`+M.cam` = `mapState` 已回报的滚动相机）出**舞台像素**，`npcSizeInStage(n,{dw:mapW,dh:mapH})` 出**世界尺寸** —— 与 JS 路**同一个函数同一个 flipY**、与野怪脚标 `wx=mapX+fx*mapW`（`MapRunner.as:224`）**同一套换算**（故不新增禁改区改动、不重编译 AS3）。
- **已知缺陷（如实登记 · 不记死账 = `决议⑦`）**：
  ① **前景遮挡穿帮**：NPC sprite 叠在整块 Ruffle 画面**之上** ⇒ 站在前景掩体（`front_mc`：树/墙）后时也画到掩体上、挡不住（正是初拍 (B) 里警告的那条）。**正确遮挡 = 把 NPC 塞进 SWF 图层 content↔front 之间 = 改 `MapRunner.as` + AS3 重编译 = 后续 B 批**；本批接受穿帮。
  ② **位置/尺度靠人眼校**：Unity 960×540 → SWF 世界 rect 的映射 = `flipY`/`NPC_ANCHOR`/`NPC_FALLBACK_SCALE` 同族新常量（§4.10），偏了按图记、再调；不同图构图差异 ⇒ 可能个别图需单校。
  ③ **双绘风险（待人眼）**：个别地图 `content_mc` 里**可能已烘焙静态 NPC 美术**（原版美术，非数据驱动）⇒ 叠重启 PNG 会重影。手测若见双绘 ⇒ 登记哪张图，处置（隐藏重启 overlay 或接受）随 B 批一并定。
- **打破的围栏**：`AGENTS §4.11`/`map-code-map §2.4`「SWF 图逐字节不变」⇒ **本批在 SWF 路只**新增 `#npc` 叠加层（画 NPC + 名字）与一条 NPC 点击 capture 监听；**光口/角色/HUD/走位等既有 SWF 画面仍逐字节不变**（只有 NPC 这一格被扩）。正本同步 = `AGENTS §4.14` + `map-code-map §2.4/§7` + 本份 §9/§10。

---

## 8. 施工批切分（先小后大；每步 `node --check` / 复用 `#ov` 手验，不新增测试脚本 `AGENTS §1.1`）

| 批 | 内容 | 自检（判据 = 人眼 + 门禁没回归） |
|---|---|---|
| **VB3-a** | G1 `npc-art.js`（三类映射 + 尺寸换算，L1 纯）→ `node --check`（经 `.mjs` 复制法，`AGENTS §3`） | 离线：对 272 图跑 → 计数 path 346/npcId 238/none 20、URL 可达抽查 3 张（`Npc/1001.png`、`Pets/pet/40.png`、`Maps/mine/green.png`）在盘 |
| **VB3-b** | G3 建 `#npc` 层 + G2 `M.npcSprites` 装载（`new Image()`→`onload`→`draw()`，仿 `portalImg`/`loadActorParts`）；`draw()` JS 分支画 sprite（暂不画名字） | 进一张 JS 图（例 `10017` 火山星深处）：NPC 立绘出现在 `pos` 处；缺图者仍橙点；无重影 |
| **VB3-c** | 名字脚标（BCQ2）：`fillText` + `nameColor`；锚点常量 `NPC_ANCHOR` | 中文名字**不缺字**（canvas 直书）；位置贴头顶 |
| **VB3-d** | 点击命中改 sprite 矩形（§6）：`M.npcHit` + `jsClick` 先矩形后占位圆 | **鼠标点 NPC** ⇒ 弹对话/开战（`onNpcClick` 那条链），不再敲控制台 |
| **VB3-e** | 尺寸换算接入（`size`→`npcSizeInStage`；缺 size 退 natural×`NPC_FALLBACK_SCALE`） | 大小像不像、`(0,0)` 那条兜底不炸 |
| **VB3-f** | 拆净：换图 / `leaveJsMode` / `unmount` 清 `#npc` + 位图缓存（竞态 `gen` 守卫仿 `actorGen`，`mapScene.js:1078`） | 连续进出多张图不涨位图、不残留旧图 NPC |
| **VB3-g** | 正本回填（G4/G5/G6 + 本份 §10 as-built 开位）+ 复跑门禁 | 见 §8.1 |

**门禁（只为"没回归"，`AGENTS §1.1`；人点名才跑，否则在交付说明里列出请复核）**：
- `node tools/map-audit.mjs`：**旧数字逐字不变**（`swfOk=false 102 / portal-inbound-none 95 / portal-isolated 54 / invalid-switch 1(71) / npc=604 / teleport=393 / 七类 604·12·15·30·8·3 / resId path 346·npcId 306·none 20`）。⚠️ 本批**不改解析器**，这些数**必须原样**。
- `node --test game/core/`（既有 304/0，本批零 `.ts` ⇒ 应不动）· `node tools/difftest.mjs`（不一致=0）。
- 分层 grep 门禁（`docs/arch-code.md §3`）：G1 是 L1 纯件 ⇒ `grep -rn "from '..*logic/" game/app/view/` 仍零命中；`npc-art.js` **不许** import `app/**`、**不许** `fetch`/DOM。

### 8.1 显式登记的偏差 / 限制（对照设计蓝图）
① **上屏通道 = canvas，非 SWF 内容层**：设计 §3 表第 3 行说 NPC 血统 = AS3、实现 = SWF；但 `MapRunner.as` 无 npc 概念（§2 实测）⇒ 本批 NPC 走 **JS 路 canvas + 重启 PNG**，是路线 A「底图被消费」同族的**再扩一格**（`AGENTS §4.11`/§4.13 先例）。**SWF 路 NPC 仍缺**（BCQ1 拍板）。⚠️ 这与 §3 表"NPC→SWF"一行**有出入** ⇒ 落码后回填设计 §3/§8.2 更正本行口径（`AGENTS §1.4` 反馈回路同改文档+代码）。
② **只画 `active`、只画静帧**：43 条 `inactive` 不画、`<anim>`/`<gif>` 只静帧 —— 动效/农场/动物 = 另批。
③ **两条人眼校常量**（`NPC_ANCHOR` 锚点方向 / `NPC_FALLBACK_SCALE` 缺 size 缩放）= `flipY`/`ACTOR_SCALE` 同族，登记 §9 待校，不记死账（`决议⑦`）。

---

## 9. 请人测清单（主验收 = 人手测 `决议⑦`；触发 = 进图 + 鼠标）

> **JS 路**（`swfOk===false`，如 `10017`/`10012`/`10003`/`10693`/`50004`）：B3 首批，画 NPC 真美术 + 名字 + sprite 矩形可点。
> **SWF 路**（`swfOk===true`，如 `100`/`2`/`121`/`131`…）：§7.1 追认新增，同样画 NPC（盖顶层近似版）；**遮挡穿帮/双绘为已知项、如实记不阻塞**。

1. **NPC 出现了没有**（JS 路）：进 `10017`（火山星深处）⇒ 图上出现 NPC **立绘**（宠物形/人形 sprite），不再是橙点（缺图者除外）。
2. **站的位置像不像**：NPC 是否站在**该站的地方**（贴地、不悬空、不钻底图）——这是 `AGENTS §4.10`「位置误差人类接受」的人眼校项；偏了就记哪张图、往哪个方向偏（供调 `NPC_ANCHOR`/`flipY`）。
3. **大小对不对**：NPC 立绘尺度是否与底图协调（`size` 换算项，供调 `NPC_FALLBACK_SCALE`）。
4. **中文名字**：头顶名字**不出方框/不缺字**（canvas 直书）；颜色贴 `nameColor`。
5. **点得动**：**鼠标点 NPC**（不再敲控制台）⇒ 弹对话 / 开战（例 `1001701` ⇒ 对话；带 `<battle>` 的 NPC ⇒ 开工门）。对照 MB6/MB7 已验的出路。
6. **占位兜底**：`none` 类 NPC（"神奇扭蛋机"等）⇒ 仍是占位橙点、点得动、不自造假立绘。
7. **重叠优先级**：NPC 与光口重叠处，点下去点的是 NPC（可翻项）。
8. **连续换图不脏**：JS↔SWF 来回、进出多张图 ⇒ 上一张 NPC 不残留、画面不涨（VB3-f）。
9. **★SWF 路也出 NPC**（§7.1 追认）：进一张 `swfOk===true` 带 NPC 的图（如 `2`/`121`/`131`）⇒ 图上出现 NPC 立绘 + 名字、**鼠标点得动**（对话/战斗不再敲控制台 `onNpcClick`）。⚠️ 若某 SWF 图本就没数据 NPC ⇒ 无变化属正常。
10. **★SWF 画面除 NPC 外不变**（回归）：同图的光口/角色（黄点）/脚标/HUD/走位**照旧**、只有 NPC 是新增叠加。
11. **★遮挡穿帮（已知、要人确认范围）**：NPC 站在前景掩体（树/墙）后时也画到掩体上（挡不住）——这是 §7.1 缺陷①、留 B 批。**不必修**，但请回报**哪几张图穿帮最刺眼**（供 B 批排优先级）。
12. **★双绘（若见则记）**：个别图 `content_mc` 可能已烘焙静态 NPC 美术 ⇒ 叠重启 PNG 出现**重影/两套 NPC**。若见到 ⇒ 记图号，处置留 B 批（§7.1 缺陷③）。

---

## 10. as-built（**已落码 2026-10-19**，人类 "开工"；`docs/arch-docs.md §5` 冲突时以本节为准）

> 落点全部核对自源码；人眼校常量 = 默认值，待人手测（§9）反馈后再调（不记死账 `决议⑦`）。

**新文件（L1 纯件 · VB3-a）**：`game/logic/map/npc-art.js`（53 行，零 import、零 DOM/fetch，`M-5` 合规；`node --check` 过）
- `npcArtUrl(npc)`（`:23`）= `resIdKind`→URL 三类映射（`npcId`→`Npc/<id>.png` 238 条 · `path`→`Resources/<resId>`[补 `.png`] 346 条 · 其余⇒`null`）；
- `npcHasArt`（`:33`）· `npcSizeInStage(npc, rect)`（`:40`，`size>0`⇒`(sx/960)*dw,(sy/540)*dh`；缺/`0`⇒`null`）；
- 定值：`ART_ROOT='/projects/Seer2-Restart-Lite-main/Resources'`（`:16`，同 `js-view.js` `BG_DIR` 父目录）· `REF_W=960`/`REF_H=540`（`:14`/`:15`）· **`NPC_ANCHOR={ax:0, ay:1}`（`:50` = 左下角贴 `pos`，对齐上游 `Npc.prefab` pivot=(0,0)）**。

**`game/app/scenes/mapScene.js`（改 · L4 · VB3-b…f）**（行号 = 现源码）
- import：`:43` `NPC_ART`；状态位 `M.npcHit=[]`（`:68`，真 sprite 命中矩形，SWF 路恒空）。
- 层与缓存：`npcEl`/`npctx`（`:117`）；`NPC_CACHE=new Map()`/`npcGen=0`/**`NPC_FALLBACK_SCALE=1`（`:129`/`:130`/`:131`，缺 `size` 时 = PNG natural × 1，第二条人眼校常量）**。
- `draw()` NPC 分流（`:545`–578）：仅 `M.jsMode` 且 `active!==false`、`pos` 合法者；坐标 = 光口同一 `JS_VIEW.unityToStage(…, M.jsView.rect)`（`:556`）；`rec.state==='ok'`⇒进 `M.npcHit`（尺寸 `npcSizeInStage(...) || natural×NPC_FALLBACK_SCALE`，`:561`），否则退 `M.npcMarkers` 占位橙点（画在 `#ov`，`:571`–578）。**SWF 路不进此分支⇒逐字节不变**。
- `ensureNpcSprite(url)`（`:598`）：按 URL 缓存、`new Image()` 后台装、`onload/onerror` **gen 守卫**重绘；`err`⇒退占位 + 日志「NPC 素材缺图（走占位）」（不伪造）。
- `drawNpcs()`（`:612`）：清 `#npc`、`drawImage` 左下角锚定、头顶**中文名 `fillText`**（BCQ2·A：暗底描边 + `npcColorCss(nameColor)` + `npcVec2(namePos)` 偏移）；非 JS 路 `npctx` 为 null 直接退。辅助 `npcColorCss`（`:633`，RGBA 串→css，畸形退默认蓝）/`npcVec2`（`:640`）。
- `#npc` 层装配（`enterJsMode` `:1087`–1095）：懒建 canvas（`id='npc'`、1200×660、`z-index:1;pointer-events:none`），`insertBefore(…, #ov)`（DOM 序在 `#portal` 后、`#ov` 前 = §4）。
- 拆净（`leaveJsMode` `:1055`/`:1057`）：移 `#npc` + `npcGen++`；`unmount()`（`:1410`→`:1413` `leaveJsMode()`）同覆盖。**`NPC_CACHE` 故意不清、跨图复用（仿 `ACTOR_CACHE`）**。
- `jsClick`（`:1205`）命中优先级 = **真 sprite 矩形**（`:1216`–1224，取离 sprite 中心最近者→`onNpcClick`）→ 占位橙点圆（16px）→ 光口（26）→ 走位；SWF 路两数组恒空⇒命中面不变。

**数据面加档（VB3-c · 最小、已登记）**：`game/logic/map/entity.js` `buildEntities` 透传 `namePos`/`nameColor`（名字脚标用；缺省 `"0,5"`/`"0,64,255,255"` 来自 `parse-map.js:207-209`）。

**门禁复跑（本批只 "没回归"）**：`node tools/map-audit.mjs` **旧数字逐字不变**（`swfOk=false 102 / portal-inbound-none 95 / portal-isolated 54 / invalid-switch 1(71) / npc=604 / teleport=393`；battle `dangling=8 / unreferenced=154 / dup=0`；`resId` 全实体表 `path 346·npcId 306·none 20` —— NPC 子集三类 = `path 346 / npcId 238 / none 20`，见 §3）· `node --test game/core/` **304/0**（本批零 `.ts`）· 分层 grep 干净（`npc-art.js` 无 import/fetch/DOM）。
- ⚠️ **`node tools/difftest.mjs` 现报 113 分歧 = 与本批无关的既有 WIP**：分歧源在 `core/battle` + `core/pet`（先前会话未提交的战斗/宠物域改动，`git diff --stat` 18 文件），**`difftest.mjs` 既不读 `logic/map` 也不读 `app/scenes`**，本批未碰任何 `core` 文件 ⇒ 该 113 **非 B3 引入**，如实登记、不谎称 "0"。留战斗/宠物线结账。

**与设计 §3 表的口径更正回执（§8.1 偏差①）**：设计 `view-scene-map-content.md §3` 血统表第 3 行原写 "NPC→SWF 内容层"；实测 `MapRunner.as` 无 npc 概念 ⇒ **落码走 canvas（`#npc`）+ 重启 PNG**。JS 路首批（B3 主体）后，**人类 2026-10-19 追认（§7.1）：SWF 路也画** = 同一片 `#npc` 叠加层盖在 Ruffle 之上（不碰 `MapRunner.as`）；遮挡穿帮/双绘为**已知、留后续 B 批**。设计 §3/§8 该口径按本 as-built 更正（`AGENTS §1.4` 同改文档+代码）。

### 10.1 SWF-路扩展 as-built（§7.1 追认，2026-10-19；行号 = 现 `mapScene.js` 源码）

> 首批 B3（只 JS 路）→ 本增量把 NPC 叠加扩到 SWF 路（`swfOk===true`，170 图）。**纯 L4 改动**（`mapScene.js`），**未碰 `MapRunner.as` / `parse-map.js` / 任何 `core/**`** ⇒ 不重编译 AS3、`map-audit`/`difftest`/`core` 门禁的**输入本增量零变化**。

- 换算复用：`draw()` NPC 分支（`:590`）改为 `const nRect = npcOverlayRect()`（`:705`）——JS 路 = `M.jsView.rect`；**SWF 路 = `{dx:M.info.mapX, dy:M.info.mapY, dw:M.info.mapW, dh:M.info.mapH}`**（`mapReady` 已回报、存 `M.info`，`:475`）；投影 `JS_VIEW.unityToStage(p.x,p.y,nRect)` + `M.cam`（`mapState` 滚动相机，`:491`）→ **与野怪脚标 `wx=mapX+fx*mapW`（`MapRunner.as:224`）同一套换算**；尺寸 `NPC_ART.npcSizeInStage(n, nRect)`（同一 `(sx/960)*dw` 公式、世界界版）。原 `if (M.jsMode && M.jsView.rect)` 独门已删。
- 图层：`ensureNpcLayer()`（`:692`，幂等建 `#npc`、DOM 序插 `#ov` 之前、`z-index:1`）——JS 路 `enterJsMode`（`:1187`）与 SWF 路 `draw()`（`:592`）都调；`unmount`/`leaveJsMode` 拆层、`NPC_CACHE` 复用、`npcGen` 竞态守卫不变。`mount` 加 `npcEl = npctx = null`（`:1451`，`#wrap.innerHTML` 重写 ⇒ 让新 DOM 重建）。
- 点击（`:719` `onSwfNpcCapture`，capture-phase on `#wrap`，`bindSwfNpcClick` `:713` 一次性绑）：SWF 路点 NPC sprite 矩形 ⇒ `onNpcClick(id,'click')` + `stopPropagation`（吞在 Ruffle 之前，不让 MapRunner 走位）；不中 ⇒ 什么都不做、事件照常落 Ruffle（**走位/光口逐字节不变**）。JS 路仍走 `jsClick`（bubble），capture 监听在 JS 路早退（`M.jsMode` 守卫）⇒ 不双处理。`#wrap` 是持久外框（mount 只重写 `innerHTML`）⇒ 监听不重复绑、卸载后 `npctx` 空 ⇒ 惰化。
- 人眼校常量（§7.1 缺陷②）：SWF 世界界 = `mapReady` 的 `mapX/Y/W/H`，Unity→世界 rect 映射未再单配 ⇒ 靠 §9 手测回报"哪张图偏/偏哪向"再调（`flipY`/`NPC_ANCHOR`/`NPC_FALLBACK_SCALE` 同族）。

**门禁（本增量）**：`node tools/map-audit.mjs` / `node --test game/core/` / `node tools/difftest.mjs` **输入零变化**（本增量只动 `mapScene.js` L4，不碰解析器/core）⇒ 数字与 B3 首批交付一致（`npc=604` 等旧数字逐字不变；difftest 那 113 仍是**先前会话 `core/battle`+`core/pet` WIP**、非本次）。`node --check mapScene.js`（ESM）过。**主验收 = 人类手测 §9 的 9–12 条**（SWF 路出画/可点/遮挡穿帮如实记/双绘若见记图号）。

---

### 10.2 `MDB12` 追记（2026-10-21 · **野怪这一格的「取图来源」升级**，图层机制与本份口径不变）

> 触发 = 人类点名「野怪分布按照重启设定，但野怪**素材**能否还是取自 swf？」⇒ 本追记**只改取图来源**这一格，
> **不**改本份的图层/z 序/点击命中机制（`AGENTS §4.14` 边界：**B3 拥有图层、地图线拥有数据与素材选择**）。
> as-built 正本 = `docs/map/map-impl.md §7.3.34`；手测 = **`§8.28`**。

- **`#npc` 层现在有两种"项"**：同一份 `M.npcHit` 数组、同一个绘制循环、**同一套点击代码**（不新增数组、不改优先级链）。
  - **帧包项**（`h.pack` 为真）= 带 `<wild>` 的 NPC 且 `resId`→重启形象 id→`game/data/pet_appearance_swf.csv`→`swf/pet/normal/<n>.swf` **解得出包** ⇒ 画 **Flash 帧包原生像素**（`frameW×frameH`，**不吃**重启 `<npc @size>`，人类拍板 ③）+ **走/站两态 + 左右镜像**（拍板 ④）；
  - **PNG 项**（其余一切：普通 NPC、无桥的 15 种野怪、`loading`/`err`/解析失败）⇒ **§3 那三类映射逐字节不变**（`npcArtUrl`→`Resources/` PNG、锚点 `NPC_ANCHOR` 左下角、缺 `size` 退 natural）。
- **锚点语义分岔 ⇒ 命中矩形改为"每项自带"**：帧包项的 `ax/ay` = `anchorX/frameW`、`anchorY/frameH`（**脚底**钉在 `pos`，命中面 = 整格，照上游 `WildPet.as:351-360 drawHot`）；PNG 项仍是 `NPC_ANCHOR`。落地 = `drawNpcs` 与两处点击站点都写 `const ax = h.ax ?? anch.ax`（`?? ` ⇒ PNG 项没带就退旧常量，**不需要分支**）。
- **按需 fetch 复活（仅这一格）**：本份 §1 铁律"每次进图 fresh 取图、地图不缓存"仍成立；但**素材**缓存 `PET_CACHE` 与 `NPC_CACHE`/`TALK_CACHE` **同口径 = 按素材键、跨图复用**（一个包 2.3 MB/34 包，逐图重取没意义）。
- **成本**：SWF 路的"怪动才重绘"闸扩成「**怪挪动 或 帧号变了** 才 `draw()`」⇒ 待机重绘从 0 Hz 升到 **≈12 Hz**（`PET_FPS`，人眼校项）；移动仍 60 Hz。JS 路无变化（本就逐帧 `draw()`）。
- **仍不做**（登记为边界，别当本份的缺口）：脚下阴影 / `personal` 待机小动作 / 惊讶特效 / `Lv` 黄脚标（四条理由逐条见 `AGENTS §4.19` 与本批 as-built 偏差 ③）。
- **零改动清单**：`game/maprunner/**` 不碰、不重编译（`WildPet.as` 仍是运行时不可达死码，其**素材语义**被 JS 侧照抄）；`core/**` 零；`game/index.html` 零；本份的图层/z 序/`title` 占位橙点/名字脚标/气泡两遍绘制逻辑**一字未改**。

---

## 11. 接缝与指针

- **上游真值**：`docs/view/scene/room/view-scene-map-content.md`（设计，§3 血统表 / §8 缺口行 14–15 / §8.2 路线 A 待办 1「上屏通道」）——**本份即其落地**。
- **数据面（消费方）**：地图线 `game/logic/map/entity.js` `buildEntities`（给 `resId/resIdKind/pos/size/active/name*`）· `docs/map/map-impl.md §4 D10`（数据归地图线、取图机制归本份）· `docs/map/map-npc.md §2.5`（`auto` 已在进图批处理，非本份）。
- **点击执行机**：地图线 `resolve→run`（`window.onNpcClick` 驱动，`mapScene.js:838`），本份只把命中面从橙点扩到 sprite 矩形。
- **同片自绘区先例**：A2 底图（`§7.3.7`）· A2b 角色（`§7.3.8`）· MB6 对话浮层（`§7.3.9`）· MB6 增补占位标记（`§7.3.9 增补` / `AGENTS §4` 第 13 条）。
- **兄弟文档（同目录互引可写短名，`docs/arch-docs.md §7`）**：`view-scene-hud-impl.md`（HUD 层施工图，本文体例范本）· `view-scene-map-content.md`（本文配对设计）。
- **线入口**：`docs/view/view-design.md §8`（B3 行）· `docs/view/ui-handoff.md`。
