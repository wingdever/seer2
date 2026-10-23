# C3·MiniMap 实现：小地图面板（11 块 · 上游 PNG 拼 · 点区传送）

> **文档类别**：**impl**（落地计划 + as-built；`docs/arch-docs.md §1/§2`）。
> **父**：设计 **`docs/view/panel/minimap/minimap-design.md`**（MM1–MM5 不变量、§3 目标行为、§8 已拍板 MQ0-a…d + 待拍板 MQ1–4）；证据 **`docs/view/panel/minimap/restart-mini-map-panel.md`**（报告；§4.1 = 本份数据表的**唯一真值源**）。
> **邻**：宿主 **A2 `docs/view/mech/view-panel-stack.md`**（`openPanel`）· 提示盒 **A3 `docs/view/mech/view-overlays.md`**（`openHintbox`）· 传送 **M5 `docs/map/map-teleport.md`**（`decideTeleport` → `teleport` sink）· 同族先例 **`docs/view/panel/worldmap/worldmap-impl.md`**（WM-a/WM-b 的形状，本份逐条对齐）。
> **路径口径**：上游相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **编号纪律**：本份本地 = 施工批 **MM-a / MM-b** · 落码决策 **WMD 同族的 MMD1–MMDn** · 偏差 **⚠️**；**不占**人类决议 ①–⑨（`AGENTS.md §5`）。
> **状态**：🔶 计划成文 ⇒ **MM-a / MM-b 已落码**（as-built 见 §7、请人测见 §8）。

---

## 1. 前置与判据

- 设计 + 报告已过人类口径四问（MQ0-a…d，`minimap-design.md §8`）⇒ 本份按 **MM-a / MM-b** 两批落码；MQ1–4 未逐条拍板 ⇒ **按设计的"建议"落**（MQ2/3/4 = A），**MQ1 落码时按实测改判 B**（名字本就烘在图里 ⇒ 不叠标签，见 §7 **MMD3**）；评审若改判只回炉对应一处（每条都在 §7 标了落点，改判成本 = 一处常量/一处分支）。
- 落完**停下等人手测**（`AGENTS.md §1` 第 4 条 / 决议 ⑦），验收清单 = §8。

## 2. 文件形状（L4，目录照 `view/worldmap/` 先例）

| 文件 | 职责 | 对外 |
|---|---|---|
| `game/app/view/minimap/blocks.js` | **MM2 静态表**：11 块面板的框尺寸 + 图层矩形 + 热区矩形（绝对像素，原点 = 面板框左上、y 向下） | `MINI_MAP_PANELS`（`{ [category]: panel }`） |
| `game/app/view/minimap/minimapPanel.js` | DOM 自绘：图层 `<img>` → 热区方块（图标 + 区名）→ 关闭钮 → 悬停气泡 | `buildMiniMapPanel(ctx) → { render }` |
| `game/app/view/minimap/index.js` | 装配口 | `create(container, opts)` |
| `game/app/scenes/mapScene.js` | HUD 接线 + 缺类目提示 + 传送链（复用 `runTeleport`） | `openRestartMiniMap()` |
| `game/app/view/hud/restartHudView.js` | `rbh-minimap` 钮从 `todo('小地图')` 改接 `handlers.onMiniMap` | — |
| `game/app/ui.css` | `.rb-mmap-*` 一组类 | — |

**零新 L0/L1**：决议复用 `session.decideTeleport`（经 `runTeleport`）、宿主复用 `panels/host.js`、提示复用 `openHintbox`、类目字段复用桥 `M.unity.category`。

## 3. 数据表口径（`blocks.js`）

- **来源** = 报告 §4.1 的 11 张表**逐行照搬**（175 条图层 + 113 条热区）；**坐标** = 上游 RectTransform 按 Unity 规则折算出的面板绝对像素（报告 §3 口径说明）。
- **图层** `[src, x, y, w, h]`：`src` 相对 `Assets/`；**数组顺序 = 渲染顺序**（后摆盖先摆，同上游层级）；`active=0` 的装饰点**不入表**（设计 §3.2 末条 / 报告 A6）。
- **热区** `[name, label, mapId, icon, x, y, w, h, lx, ly, hover]`：`label=null` ⇒ 上游无 TMP 区名（`MiniMap1` 的 8 格 + `MiniMap100` 的 `Lonely`）⇒ **我方不补、不叠标签**（MQ1 改判 B，见 §7 **MMD3**）；`icon=null` ⇒ 上游是 **alpha=0 的透明点击框**（实测 `MiniMap100` 的 9 个内联钮 `m_Color a=0`，门名烘在底图里）⇒ 不画图；另 2 格"无 override ⇒ prefab 默认"在表里**直接写死默认那张**（不留"运行时去 prefab 查"的口子）；`lx/ly` = 区名标签框**左上角**（标签框恒 `120×25`，字号 16）。
- **`mapId=0` 一格照搬**（`MiniMap100` 的 `Lonely`）⇒ 置灰 + 点击弹"地图暂未开放"（MQ4=A / 设计 §3.3 第 2 条）。
- **不写注释以外的解释**：表是数据，语义全在本节与设计里。

## 4. 渲染与交互（`minimapPanel.js`）

1. **摆位**：面板框在 960×540 逻辑画布内**居中** ⇒ `left=(960-w)/2`、`top=(540-h)/2`（720×420 ⇒ `120,60`；710×440 ⇒ `125,50`）；外层 `.rb-scrim` 复用（遮罩点击 = 关，A2 口径）。
2. **裁剪**：框 `overflow:hidden`（设计 §3.2 / 报告 A7 / MQ2=A）⇒ 出框的图（`MiniMap7` 的 1920×1120、标题条上沿 3px）**裁掉**。
3. **图层**：每条一个 `<img>`，`position:absolute` + 表里的 `x/y/w/h`（**不保持宽高比** = 与上游 `Image` 同做法，报告 §3 末段"27 个被拉伸"照做）。
4. **热区**：一个方块（`cursor:pointer`）套一张图标 `<img>`（铺满方块）；`mapId==currentMapId` ⇒ 加"在此"角标（MM4）；`mapId==0` ⇒ 置灰（不置"不可点"，点击仍发决议、由链侧/面板侧给提示 = 与大地图 WMQ1 同形）。
5. **区名**：方块外的一个 `120×25` 文字框（居中、16px、白字 + 描边，`text-shadow` 代替 TMP 描边）；**出框的标签夹回框内**（实测只有 3 条轻微出框：`MiniMap4/6/11` 各 1 条 = ⚠️ 偏差 ①）。
6. **关闭钮**：按表里的 `Esc Button` 矩形摆（三种形状照上游，报告 A8），图 = `cancel.png` / `Green Esc.png`。
7. **悬停气泡**：`pointerover` ⇒ 在指针右下显示 `hover` 文案的小黑盒（内容 = 上游 `SetInfoPromptText` 那串）；**无文案 ⇒ 不显示**（不伪造，设计 §3.5 / 报告 A3/A4）；`pointerout` ⇒ 隐。
8. **点区**：`onGo(mapId)`；`mapId=0` ⇒ `onLocked()`；**面板先撤再传送**由 `mapScene` 侧负责（同 WM3 / 大地图 §3.3 第 3 条）。

## 5. 接线（`mapScene.js` + HUD）

```js
onMiniMap: () => openRestartMiniMap(),          // 替掉 restartHudView 的 todo('小地图')

function openRestartMiniMap() {
  const cat = Number(M.unity && M.unity.category) || 0
  const panel = MINI_MAP_PANELS[cat]
  if (!panel) { openHintbox({ title:'提示', content:'该区域暂无小地图', … }); return }   // MM4 / 修 A1
  openPanel('rb-minimap', (root, api) => MINIMAP.create(root, {
    category: cat, currentMapId: Number(session.currentMapId) || 0,
    onClose: () => api.close(),
    onGo: (mapId) => { api.close(); runTeleport(mapId) },                    // MM3：同一台决议机
    onLocked: () => openHintbox({ title:'提示', content:'地图暂未开放', … }),   // MQ4=A
  }))
}
```

- **`teleport` sink 共用**：`runTeleport` 就是 MB5 落的那台（光口 / NPC / 对话出路 / 大地图 / 活动跳转都走它，`mapScene.js:266`）⇒ 本面板**不新开第二条传送路**（MM3）。
- **夜图/负 id**：`category` 由桥按 XML 根属性给（负 id 图同样有 `category="1"` ⇒ 飞船面板正常弹）。

## 6. 施工批

- **MM-a** = `blocks.js`（11 块表）+ `minimapPanel.js` + `index.js` + `.rb-mmap-*` CSS。
- **MM-b** = `restartHudView.js` 的 `rbh-minimap` 接线 + `mapScene.js` 的 `openRestartMiniMap`（含缺类目提示、传送链、置灰提示）。
- 两批落完**停下**，交 §8 请人测。

## 7. as-built（MM-a + MM-b · 2026-10-19）

**落位与计划一致**：新建 `game/app/view/minimap/{blocks.js,minimapPanel.js,index.js}`；`mapScene.js` 加 `openRestartMiniMap()` + `onMiniMap` 注入口（传送仍走**同一个** `runTeleport`）；`restartHudView.js` 的 `rbh-minimap` 从 `todo('小地图')` 改接 `handlers.onMiniMap`；`ui.css` 追加 `.rb-mmap-*` 段。**零新 L0/L1、零新素材**（MM5 达成）。

**数字对账**（表 = `blocks.js`，实测 `Object.keys` 求和）：

| 项 | 报告 §4.1 | `blocks.js` | 差额去向 |
|---|---|---|---|
| 类目 | 11 | 11 | — |
| 图层 | 175 行 | **142** | 22 条 `active=0` 装饰点不入表（A6 / §3 末条）+ 11 条 `Esc Button` 另立 `close` 字段 |
| 热区 | 113 | **113** | — |
| 目的地 | 112 + 1 个 `mapId=0` | **112 + 1** | — |
| 引用素材 | — | 119 个不同路径 | **盘上 0 缺失**（逐条 `os.path.isfile` 核对过 `Assets/` 根） |

**落码决策**（MQ2/3/4 按设计的建议 A 落；**MQ1 落码时改判 B**，见 MMD3；每条的"改判成本"就在括号里）：

- **MMD1** 表由**一次性抽取器**（`/tmp` 里的 `mmgeom.py`/`mmbake.py`，**不入库**，遵决议 ⑦「不新增脚本」）从 11 块预制按报告 §3 的 RectTransform 口径折算 ⇒ 表是**生成后手写的静态真值**，运行时零解析（改判成本 = 重跑抽取）。
- **MMD2**「缺类目 ⇒ 不弹面板、只提示」落在**装配口之外**：`index.js` 只给 `has(category)`，`mapScene.openRestartMiniMap()` 决定弹或提示（修 A1；改判成本 = 那一个 `if` 分支）。
- **MMD3** **MQ1 改判 B（原建议 A 的前提被实测推翻）** ⇒ `MiniMap1` 的 8 格与 `MiniMap100` 的 9 格**一律不叠区名标签**：前者名字**烘在图标 PNG 里**（`MiniMap1/Sprites/{43,65,81,94,106}.png` = 房间实景 + 底部中文，49–52KB；对比 `MiniMap2/Sprites/1.png` 6KB 青色线稿、无字），后者名字**烘在底图** `MiniMap100/Sprites/1.png` 里 ⇒ 补一层就是**双份文字**。表里 `label=null` = 不画（改判成本 = 把 8/9 行的 `label` 填上名字，面板代码不动）。报告 **A2** 已同步纠正。
- **MMD4** **图标三态**：① 111 格有专属线稿 ⇒ 表里给路径；② 2 格上游"无 override ⇒ prefab 默认" ⇒ **表里直接写死那张默认图**（`MiniMap1/Sprites/65.png`、`MiniMap2/Sprites/8.png`，不留"运行时去 prefab 查"的口子，同报告 §7 末那条地雷）；③ `MiniMap100` 的 9 个内联钮实测 `m_Color a=0` = **透明点击框**（门的名字烘在底图 `MiniMap100/Sprites/1.png` 里）⇒ 表里 `icon=null` = **不画图、只给点击框**；`lx/ly=null`（上游无 `Title` 节点）= **不叠区名**（见 MMD3）。
- **MMD5** **MQ3=A** ⇒ 不乘青色（上游那层 `rgba(0.32,0.90,0.98,1)` 乘色不搬）；**MQ2=A** ⇒ 框 `overflow:hidden`，出框的图（`MiniMap7` 的 1920×1120、9 块标题条 `y=-3`）裁掉（改判 = 删那一行 CSS）。
- **MMD6** **MQ4=A** ⇒ `mapId=0` 那格（`MiniMap100` 的 `Lonely`）**置灰 + 点击弹"地图暂未开放"、面板不关**；与链侧 `runTeleport` 的 `notOpen` **仍只 `logLine`** 是两条故意不同的语义（照大地图 **WMD5** 先例）。
- **MMD7** 区名标签**摆在热区之后**（压在图标之上）+ `pointer-events:none`；出框的夹回框内（实测夹到边上的 = `MiniMap4/6/11` 各 1 条；`MiniMap1` 那 2 条 `ly=-6` 因 MMD3 不画标签 ⇒ 不再相关）。
- **MMD8** 悬停气泡 = 跟随指针的小黑盒（上游 `+(10,2)` 偏移照做），挂在**面板层**而非框内 ⇒ 不受框 `overflow:hidden` 裁；贴右缘自动翻到指针左侧。

**偏差（如实登记，不修）**：

- ⚠️ **①（= §4.5 的夹取规则）** 出框标签夹回框内 —— 上游无遮罩、真的让字压出框（报告 A7），我方按 MQ2=A 裁 ⇒ 与上游像素**故意不同**。
- ⚠️ **② 字号** 上游区名 TMP 默认 **16**，但实测 **6 格被 override 成 18/14**（`MiniMap11 Main/Priest`、`MiniMap12 Trail/Main` = 18；`MiniMap6 Rotation Ladder/running line (sand)` = 14）⇒ 我方**统一 16**（表里不带字号列 = §3 列规）；差异 2px，**列为人眼校项**。
- ⚠️ **③ 页标题** 上游是 TMP 压在 `map title.png` 条上；我方按标题条矩形**垂直居中 + 顶偏移 6px** 摆 DOM 文字 ⇒ 行高与 TMP 不同源，**人眼校项**。
- ⚠️ **④ ESC 关闭未接**：宿主无全局键层（同大地图 **WMD4** 的既定缺口）⇒ 本批只给 **✕ / 遮罩**两种关法；**登记为等人手测确认项**，非死账。

## 8. 请人测（验收主口径 = 决议 ⑦）

> 起服务：`node tools/serve.mjs`（默认 `127.0.0.1:8090`）⇒ 开 `#/map?slot=0&map=…`。入口 = **HUD 左上角标簇里那把 25×25 的小地图钮**（`data-mid="minimap"`，紧贴大地图地球钮右侧）。

1. **有面板的类目**：`#/map?slot=0&map=100`（信奉广场，`category=2`）点小地图钮 ⇒ 弹 **`MiniMap2`「草目氏族」**（720×420、画布居中、18 条图层 + 13 个区名）；
2. **换类目换面板**：`map=81`（英格瓦要塞，`cat=100`）⇒ **`MiniMap100`**（710×440、9 个门**看不见方块**= 上游透明框，MMD4 ③，但能点、门名本就印在底图上）；`map=-10`（船长室，`cat=1`）⇒ **`MiniMap1`**（飞船蓝图 + 8 格，**名字在图标里**、我们不叠标签 = MMD3）；
3. **缺类目不弹**：`map=10001`（传送仓，`cat=101`）/ `540`（禁食山脚，`cat=8`）/ `10082`（太空站左翼，`cat=200`）⇒ 只出**提示盒"该区域暂无小地图"**、不弹面板（⚠️ 与上游**故意不同** = 修 A1）；顺带确认 **`10015…10043` 整片新世界的星球图（`cat=102`，28 张）也都没有小地图**；
4. **逐块看版式**（11 块都要过一遍：`cat` 1/2/3/4/5/6/7/9/11/12/100 ⇒ 各进一张代表图：`-10 / 100 / -203 / 305 / 414 / 530 / -420 / 990 / 950 / 1220 / 81`）⇒ **区名有没有压在图标上、标签有没有跑出框、线稿图标有没有错位、拉伸的 27 张能不能接受**；
5. **点区传送**：`MiniMap2` 点「草目氏族主城」(90) ⇒ 面板关 + 落 `90` 出生点，HUD 图名横幅变；`MiniMap1` 点右上第一格（`Captain` → `-10`）⇒ 进船长室；点 `Teleport` 格（`-70`）⇒ 进夜间传送舱；
6. **`mapId=0`**：`MiniMap100` 点右下那格（`Lonely`）⇒ 提示盒"地图暂未开放"、**面板不闪退**；
7. **当前图高亮**：站在 `100` 打开 `MiniMap2` ⇒「信奉广场」金框 + "在此"角标；再点它 ⇒ 重进本图（不报错）；
8. **悬停气泡**：划过有文案的区（`MiniMap2` 全部 13 格、`MiniMap100` 的 8 格）⇒ 指针右下出小黑盒、随指针走、移出即隐；划 `MiniMap1` 的 8 格 ⇒ **不出**（上游那块的提示盒被 `m_IsActive=0`，A3 ⇒ 我们不伪造）；
9. **关**：✕（`MiniMap2` 右上 35×35 / `MiniMap1` 底部居中 `cancel.png` / `MiniMap100` 右上 40×40，三种位置照上游）+ 遮罩点空白 ⇒ 都关得掉、无残留层、可再开；「返回上一图」仍正常（面板不进历史）；
10. **SWF 图与 JS 回退图各测一遍**（面板是 DOM 层、与画面通路无关 ⇒ 行为应一致；分流反转后默认全是 JS 路，注明图见 `SWF_ANNOTATED_IDS`）。

**等人手测确认项**（设计/实现的开放点，逐条对应上面第 3/4/8 条）：① 缺类目只提示不弹（A1 不照搬）是否合口味；② 11 块的像素级版式（标签压字、图标错位、2px 字号差）；③ **MQ1 改判**：`MiniMap1` 的 8 格与 `MiniMap100` 的 9 格我们**不叠区名**（名字本就烘在图里）——若你更想要一层自己的文字，回一句「叠」即可（改判成本 = 表里 17 个 `label`）；④ `MiniMap100` 的透明框要不要给一个可见描边（现在是**只有 hover 才亮**）。
