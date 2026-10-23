# M7 · 移动 / 几何 / 寻路 + 漫游 NPC（`map-move.md`）

> **定位**：地图线（M）的子设计 **M7** —— **"角色怎么走 / 往哪儿走 / 走不过去怎么办"这一整段的真值与目标**：
> **通行面**（无 path 素材时到底可走不可走）、**导航器**（栅格 A* / 足印 / 视线 / 平滑）、
> **几何**（多边形碰撞 / 耳切）、**玩家移动**（速度 / 抵达 / 一步直达）、**漫游 NPC**（谓词 / 走位 / 卡住 / 气泡）、
> 以及**现役 AS3 血统**（SWF 里真正在跑的那一套）。
> 本线**唯一一块"数字真值不可得"**的地盘：栅格极性未核（§2.10）⇒ 本份给它**显式口径**而不是"记死账"（决议 ⑦）。
>
> **父文档**：`docs/map/map-design.md`（总设计兼导读；本份细化 §2.11「移动 / 几何 / 寻路」/ §2.12「漫游 NPC」/ **MP2**「纯函数」/ **MP5**「两步走位、不许瞬移」/ **MP6**「可走性以数据为准、不许拿没素材当全可走」/ §9.1 的 M7 行）。
> **同线兄弟**：**M1** `map-data.md`（桥：`pathId` / `geometry` 照录 + 本份要它补的 `walk` / `wild` 两列的**语义**，§3.1/§3.3）·
> **M2** `map-npc.md`（NPC 的 `pos`/`size`/`rotation` 与 canvas 坐标；`NpcController` = 半 View）·
> **M3** `map-condition.md`（走位不读条件；条件里的 `map.` 八键见 M5）·
> **M4** `map-dialog.md`（对话期间不改走位）·
> **M5** `map-teleport.md`（★本份**接手**它 §2.9 的"三套数"，并给它 **72px 环** 的抵达判定正主）·
> **M6** `map-battle-trigger.md`（★**本份纠正**它 §2.14 / BTQ5 的"野怪谓词恒假"）。
> **邻线**：
> **B3 渲染** `docs/view/scene/room/view-scene-map-content.md`（相机跟随 / 寻路虚线预览 / 野怪脚标 / **气泡表现**：像素与数值归它，本线只给"说什么/什么时候"）·
> **B1** `docs/view/scene/room/view-scene-hud-design.md`（HUD）·
> **编排线** `docs/orchestration/orchestration-design.md`（**OR2** 换场景唯一入口 / **OR4** 入场参数走 `changeScene` 入参 / **§4.1 会话**持 `currentMap`；`MapManager.cs:18-48` 的 `LoadMap`/`LoadPlayer` = **宿主**）·
> **运行时线** `docs/runtime/runtime-components-design.md`（**R1** 随机源 / **R2** 时钟 —— ★本份是这两条缝在地图线里**与 M6 并列的另一大消费点**）·
> **E6** `docs/engine/battle-engine-session.md`（野怪点了"走到脚下 → 开战"的**后半段**归 M6 → E6，本份只管走到）。
>
> **真值源**：`projects/Seer2-Restart-Lite-main/Assets/Scripts/Scene Specific/Map/MapNavigator.cs`（**377**）·
> `.../Scene Specific/Map/MapGeometry.cs`（**371**）· `.../Scene Specific/Map/Map.cs:113-201`（通行面判定 + 坐标换算）·
> `.../Scene Specific/Map/MapResources.cs`（**40**）+ `Assets/Scripts/System/ResourceManager.cs:600-650`（`pathSprite` 的装配）·
> `.../Scene Specific/Map/MapManager.cs:18-48`（`LoadMap` / `LoadPlayer`；**宿主归编排线**）·
> `.../Scene Specific/Map/Entities/Npc/NpcInfo.cs:114-170`（`NpcWildInfo` / `NpcWildMovementInfo` / `NpcWildTalkInfo`）·
> `.../Npc/MapWildNpcBehaviourController.cs`（**76**）· `.../Npc/MapWildNpcWanderController.cs`（**330**）·
> `.../Npc/MapWildNpcTalkController.cs`（**392**）· `.../Npc/MapWildNpcSpriteBubbleController.cs`（**224**）· `.../Npc/MapWildNpcBubbleHost.cs`（**56**）·
> `MVC/Model/Player/PlayerModel.cs`（**129**）+ `MVC/Controller/Player/PlayerController.cs:18-21`（`FixedUpdate` 驱动）·
> `MVC/View/Map/MapSceneView.cs:12` `:36-50` `:295-318`（`ReferenceCanvasSize` / navigator 装配 / 野怪编排）·
> **现役 AS3 血统**：`game/maprunner/MapRunner.as`（**768**）+ `game/maprunner/WildPet.as`（**369**）·
> `game/swfshape.mjs:323-347` `:416-443`（矢量解析旁路 / `walkGridOf`）· `docs/legacy/web-client-notes.md:7-42`（栅格极性）。
> 【样本】`projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps/*.xml`（**272** 张，Unity 血统 —— **先剥 `<!-- -->` 再解析**，父文档 §2.1 的计数纪律）·
> `swf/map/config/*.xml`（**259** 张，AS3 血统 —— `initialPoint` 是单点可走真值）。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **MWI1–MWIn**（不变量/契约）/ **MWC1–MWCn**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**）/
> **MWQ1–MWQn**（待拍板，附建议）/ 施工批 **MDB7-a…e** —— **全是本份局部编号**，**不是**「人类决议 ①–⑧」（`AGENTS.md §5`）；
> ⚠️ 也**不是**父文档的施工批 **MB1–MB5**（那两个号段撞车，故本份施工批带 `7` 与 `D`，同 M5 的 **MDB5-a…e** / M6 的 **MDB6-a…e** 口径）。
> ⚠️ **也不是** M3 的条件族 `MW*`（本仓 `docs/` 全库检索**无 `MW` 前缀**，本轮首次启用，只在本份有效）。
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。

---

## 0. 这份文档回答什么

1. **"可走"到底按哪一套判**（§2.1）—— ★本份第一号事实：上游有**两个同名的可走判定**，
   缺素材时一个退回**内框** `x∈[0,960] ∧ y∈[20,540]`、另一个直接 **`return true`（全可走）**；
   而**导航真正调的是后者** ⇒ 缺 path 时"全可走"（**MC7** 的 M7 面）。
2. **通行面在重启件里几乎不存在**（§2.1）—— `pathId` **13/272**、`<geometry>` **1/272**；
   且本 mirror 里 `Maps/path/` 目录与 Addressables 的 "Map Path" 组**都是空的** ⇒ 运行时 `pathSprite == null` ⇒ **整张 canvas 全可走**。
   ⇒ 通行面**只能照 M1 的 MDI1 走 AS3 `path_mc`**。
3. **三套坐标 / 单位，不许混算**（§2.1 · **接手 M5 §2.9**）—— **canvas**（960×540，实体 `pos` / 玩家 / 导航器）·
   **path 像素**（`IsPathAvailable` 的白像素判定）· **AS3 `mapRoot` 本地 px + `GRID_SIZE=10` 格**（现役 SWF）。
4. **导航器长什么样**（§2.2）—— `cellSize=8f` / `footprintRadius=8f` / 8 邻域 + 禁穿角 / 足印检测 / 视线 / 平滑 /
   `TryFindNearestReachablePoint`（那颗 **72px 环**的实现）。
5. **几何是共用件**（§2.3）—— `MapPolygon` 的 `ContainsPoint`（边上点算内）/ `IntersectsCircle` / `Triangulate`（耳切）；
   消费者 = ① 导航足印 ② **B3 的前景遮罩**。
6. **玩家移动**（§2.4）—— `speed=8f` **不乘 deltaTime**；抵达阈值 `4.8`；`SetDestination*` 的三支（不可达 / 有视线单点 / **A* 失败补单点 = 一步直达**）。
7. **★野怪谓词实测为真，不是恒假**（§2.5 · **纠正 M6 §2.14**）—— 含 `<wild>` 的 NPC **110** 只，**110/110** 满足
   `CanUseWildBehaviour` 的四条 AND（`eventHandler` 的 `battle` 动作 **150 条全部带 `@type`**：click 140 + shoot 10）；`RequiresNavigator` = **107**。
8. **漫游怎么走**（§2.6）—— 常量（`TargetReachThreshold=1.5` / `StuckCheckInterval=1.25` / `MaxTargetAttempts=12`）+
   **三个不同半径系数**（候选夹紧 `max(16,radius)` / 搜索 `max(24,radius*0.5)` / 回退 `max(24,radius*0.6)`）+ 卡住检测用**配置的假时间**。
9. **气泡的两半**（§2.7）—— **调度归本线**（`RestStarted` 触发 + `chance` 掷骰 + `self`/`scene`/`player` 三表，
   实测 `scene`/`player` **都是 0 = 死表**）；**表现归 B3**（字号 17 / 淡出 0.18 / 截断 30 字 / 120×120）。
10. **`<wild>` 数据实测**（§2.8）—— **110 条 / 53 图**；`wander` **107** / `stationary` **3**；107 条 wander **只有 3 种列值**；
    `<self image>` **2,788** 条（**31 个 id** = 24 toon + 7 meme）+ `<self>文本` **732** 条；`visual`/`bobSpeed` = **死字段**。
11. **现役是 AS3**（§2.9）—— ⚠️ **野怪这一半已于 2026-10-21 随 `MDB11` 断粮**（`setWild("")` ⇒ `WildPet` **零生成** = 不可达死码）；玩家移动/出口判定这一半仍是现役（★M9 puppet 只把**走位**提到 JS）—— `MapRunner.as` `USE_GRID=false ⇒ freeRoam`（**整图可走**）、`SPEED=4/帧`、`HOT_R=26`、`ARRIVE_R=18`（★**死常量**）；
    ~~`WildPet.as` `MAX_IDEL_INTERVAL=250` 帧、`WALK_SPEED=1.6`、`ROAM_R=160`（**有意偏离**）、点击 → 靠近 → 开战~~ ⇒ **已无对象**，仅留档对照（现役野怪走位 = `logic/map/wander.js`，**两条路都播**）。
12. **★栅格极性未核**（§2.10）—— `tools/grid-truth.mjs` 用 `initialPoint` 校验：**47 张里出生点被判阻挡 22（46.8%）**；
    已定位的一处缺陷 = `game/swfshape.mjs` 的 `geometryOf()` **从不读填充 alpha**。⇒ 本份给**显式口径**（**MWQ1**），不记死账。

---

## 1. 边界（本线只管这些）

### 1.1 圈里

| 块 | 内容 | 上游落点 |
|---|---|---|
| **通行面** | 可走判定（两种兜底）、`path_mc` 栅格、无素材时的口径 | `Map.cs:113-137` · `ResourceManager.cs:603-632` |
| **坐标 / 单位** | canvas / path 像素 / AS3 本地 三套及其换算（★接手 M5 §2.9） | `Map.cs:166-186` |
| **导航** | 栅格 A*（8 邻域 + 禁穿角）+ 足印 + 视线 + 平滑 + 最近可达点 | `MapNavigator.cs` |
| **几何** | `MapPolygon` 的解析 / 内含 / 圆交 / 耳切 | `MapGeometry.cs` |
| **玩家移动** | 速度 / 抵达判定 / 目标设定的三支 | `PlayerModel.cs:41-110` |
| **漫游谓词** | `CanUseWildBehaviour` / `RequiresNavigator`（**"会走"这一半**） | `MapWildNpcBehaviourController.cs:14-28` |
| **漫游走位** | 目标选取 / 逐帧移动 / 待机 / 卡住检测（数值） | `MapWildNpcWanderController.cs` |
| **气泡调度** | 静止/漫游两套排程 + `self` 表 + `chance` | `MapWildNpcTalkController.cs:40-141` |
| **`<wild>` 数据** | 形状、缺省、实测分布、死字段 | `NpcInfo.cs:114-170` |
| **现役 AS3** | SWF 里真正在跑的移动 / 出口判定 / 野怪（**登记 + 对齐口径**）—— ⚠️ **野怪那一格已于 `MDB11` 断粮**（`§2.9` 顶部注记） | `game/maprunner/MapRunner.as` · `WildPet.as`（后者 = **运行时不可达**） |

### 1.2 圈外（本份只留形状，不重述）

| 不在本线 | 归 | 为什么 |
|---|---|---|
| 背景 / 遮罩 / 实体贴图 / 相机 / 点击反馈 / 寻路虚线预览 / **野怪脚标** / **气泡的像素与字体** | **B3** `docs/view/scene/room/view-scene-map-content.md` | 显示归 View；本线只给"走哪儿/说什么" |
| 回合 / 效果 / 判定 / 伤害 / 捕获 | **E 线**（E1–E7） | 野怪点了开战之后的一切 |
| 从地图数据翻成一场战斗 | **M6** | 本份只给"走到脚下"这一段 |
| 换图的落点 / 昼夜 / 光口 | **M5** | 本份只给"抵达"判定 |
| 条件求值 / 动作决议 | **M3 / M2** | 走位不读条件 |
| 场景切换 / 会话字段宿主 / `mapInitPos` 消费 | **编排线**（**OR2** / **OR4** / §4.1） | 宿主 ≠ 语义（`MapManager.cs:18-48`） |
| 随机源与时钟本体 | **运行时线**（**R1** / **R2**） | 本份只声明**消费点** |
| 移动端按键 / 摇杆 | **不存在** | 上游只有点击寻路（`SetDestinationByMousePos` / `SetDestinationByCanvasPos`） |
| 牧场 / 动物 / 池塘 / 虫巢 的走位表现 | **A 组出局**（`docs/architecture.md §1.1`） | 七类实体的动词不实现（M2/M5 同口径） |

---

## 2. 上游真值

### 2.1 ★通行面的两套机制 —— 以及三套坐标 / 单位（接手 **M5 §2.9**）【源码】+【样本】

`Map.cs` 里**两个同名的"可走"判定**，缺素材时兜底**相反**：

```csharp
// :121-129  —— 吃 path 纹理像素
public bool IsPathAvailable(int x, int y) {
    if (resources.pathSprite == null)
        return x.IsInRange(0, 960) && y.IsInRange(20, 540);   // ★硬编码内框
    ...
    return resources.pathTexture.GetPixel(x, y) == Color.white;
}
// :131-137  —— 吃 canvas 坐标
public bool IsCanvasPathAvailable(Vector2 canvasPos, Vector2 canvasSize) {
    if (resources.pathSprite == null)
        return true;                                          // ★全可走
    Vector2Int pathPixel = canvasPos.GetCorrespondingPixel(canvasSize, pathSize);
    return IsPathAvailable(pathPixel);
}
```

- ⇒ **同一个"缺素材"有两种相反兜底**（**MC7** 的 M7 面）。
- **谁在跑**：`MapNavigator.IsFootprintWalkable`（`MapNavigator.cs:158/171`）与 `PlayerModel`（经 navigator）
  **只调 `IsCanvasPathAvailable`** ⇒ **缺 path 时全可走**。
- **"缺 path"在重启件里是常态**（【样本】）：
  - `pathResId = isMod ? resId : ((pathId == 0) ? Mathf.Abs(resId) : pathId)`（`ResourceManager.cs:603`）
    ⇒ 路径素材名 = **"以图 id 命名的 path"**；随后 `GetLocalAddressables<Sprite>("Maps/path/" + pathResId)`（`:632`）。
  - 数据侧：**`pathId` 只 13 张**（含 8 张负 id；M1 §2.6）、**`<geometry>` 只 1 张**（`-70.xml`）。
  - 本 mirror：`Assets/` 里**没有 `Maps/path/` 目录**、Addressables 的 **"Map Path" 组 `m_SerializeEntries: []`**
    （⚠️ 同目录 12 个组**全空** ⇒ 这份 Lite 镜像里地图图集资源一概取不到）。
  - ⇒ **`resources.pathSprite == null`** ⇒ `IsCanvasPathAvailable ⇒ true` ⇒ **导航看到"整张 canvas 全可走"**。
- ⚠️ 这条是**我们对重启件/本 mirror 的观察**；**不论素材哪天到位**，设计判据仍是 **M1 的 MDI1**：
  **通行面以 AS3 `path_mc` 为准**（本份 §3.3 落地）。

**三套坐标 / 单位（★接手 M5 §2.9 —— 这是 M7 的第一块地基）**：

| 空间 | 谁在用 | 尺寸 / 单位 | 换算 |
|---|---|---|---|
| **canvas** | 实体 `pos`、玩家、`MapNavigator`、漫游 NPC 的 `anchoredPosition` | **960×540**，**左下锚定**（`PlayerModel.cs:13` 注释；`MapSceneView.cs:12` `ReferenceCanvasSize`） | `Map.GetCanvasPixelByMousePos` / `ByMapPos`（`Map.cs:166-186`，`anchor` 也是左下） |
| **path 像素** | `IsPathAvailable` 的白像素判定 | `pathSize`（来自 path 纹理；本 mirror 取不到） | `GetCorrespondingPixel(canvasSize, pathSize)` |
| **AS3 `mapRoot` 本地** | 现役 SWF：`<initialPoint>` / 光口 `pos` / `path_mc` 格 | 本地 px（**左上原点 = Flash 坐标**）+ **`GRID_SIZE=10` 格** | 无（同一容器，`docs/legacy/web-client-notes.md:61-62`） |

⚠️ **两套 y 轴方向相反**（Unity canvas 左下锚定 vs Flash 左上原点）⇒ **不许直接平移**（M5 §2.6 已证光口坐标
**169/169 对全差 >4px**）。⇒ `MWI3`：**换算只在桥与宿主边界发生，内核只认一种空间**。

### 2.2 `MapNavigator`（377 行）【源码】`MapNavigator.cs`

- 构造（`:30-40`）：`cellSize = 8f`、`footprintRadius = 8f`（两个都可传，默认都 8）；
  `width = CeilToInt(960/8) = 120`、`height = CeilToInt(540/8) = 68`；`walkable[width*height]`，随即 `BuildGrid()`。
- `BuildGrid`（`:136-146`）：逐格取**格心** `CellToCanvas(cell)` 后 `IsFootprintWalkable(center)` 存进 `walkable[]`。
- `IsFootprintWalkable(center)`（`:153-176`）四步 **AND**：
  ① `IsInsideCanvas(center)`（`x∈[0,960] ∧ y∈[0,540]` —— ★注意 **y 从 0**，与 `IsPathAvailable` 的 `y≥20` 又不同）；
  ② `map.IsCanvasPathAvailable(center)`；③ `geometry != null && IntersectsCollisionCircle(center, footprintRadius)` ⇒ **否**；
  ④ `footprintRadius>0` 时再采 **8 点**（`angle = 2πi/8`，半径 = footprintRadius），每点都要 ①∧② 过。
- `IsTargetReachable(canvasPos)`（`:42-48`）＝ `IsInsideCanvas` ∧ `IsFootprintWalkable(center)` —— ★**精确点**，**不是格心**。
- `TryFindPath(from, to, out path)`（`:108-134`）：
  ① `!IsTargetReachable(to) ⇒ false`；② `from/to` 各转格，格不可走 ⇒ `FindNearestWalkableCell`；
  ③ `start == goal ⇒ path = {to}`；④ `TryRunAStar`；⑤ `SmoothPath(from, CellPathToCanvasPath(cellPath, to))`。
- `TryRunAStar`（`:178-238`）：8 邻域；**对角禁穿**（`offset` 两分量非零时，两个正交邻格都要可走）；
  代价 **1 / 1.4142**；`open` = **`List<Vector2Int>` + `open.Contains(neighbor)` 线性查**；`closed` **不可重开**；
  选点 = `GetBestOpenIndex`（`:240-256`，`score = gScore + Heuristic`，`>=` 跳过 ⇒ **先到先得**）。
- `Heuristic`（`:371-376`）＝ `Math.Max(|dx|, |dy|)` —— ★**纯 Chebyshev**（与 AS3 的 octile 不同，§2.9 / **MWC6**）。
- `TryFindNearestReachablePoint(center, searchRadius, out point)`（`:64-106`，★**M5 那颗 72px 环的正主**）：
  ① 初值 `point = center`；`IsTargetReachable(center)` 真 ⇒ 直接返回 true；
  ② 逐环 `radius = 1..CeilToInt(searchRadius/cell)`，**只扫"恰好在环上"的格**（`|x-ox|!=r && |y-oy|!=r ⇒ continue`）；
  ③ 格用 `IsCellWalkable`（格心，**无足印**）；④ `distanceSquared > searchRadius² || >= bestDistanceSquared ⇒ continue`；
  ⑤ **本环只要有一个命中就 `return true`**（`foundAtRadius` 早退）。
- `HasLineOfSight(from, to)`（`:50-62`）：`steps = CeilToInt(dist / (cellSize*0.5)) = CeilToInt(dist/4)`；
  逐样本 `IsWalkableAt ⇒ IsCellWalkable(包含该样本的格)` ⇒ **只查格心那座"足印网格"**（不查样本自身的足印）。
- `SmoothPath`（`:285-308`）：从 `start` 起**贪心拉直**（`HasLineOfSight` 到最远可见点）。
- `CellPathToCanvasPath`（`:271-283`）：格心序列，末点与真目标 `sqrMagnitude > 1` 时追加、否则**替换成真目标**。
- `FindNearestWalkableCell`（`:310-330`）：`maxRadius = max(width, height)` = **全图**（无限半径）；
  搜不到返回 `(-1,-1)`。
- `CanvasToCell` / `CellToCanvas`（`:347-359`）：`floor(x/cell)` clamp / `(cell+0.5)*cell` clamp。

### 2.3 `MapGeometry`（371 行）【源码】`MapGeometry.cs`

- `MapGeometry`（`:8-63`）：`masks`（`:10`）与 `collisions`（`:11`）两列 `List<MapPolygon>`；
  `ValidMasks` / `ValidCollisions` = 过滤 `IsValid`（`points.Count >= 3`）；
  世界侧入口 `IntersectsCollisionCircle(center, radius)`（`:53-62`，**导航足印的唯一消费者**）与 `ContainsCollisionPoint`（`:42-51`）。
- `MapPolygon{id, name, points(string)}`（`:65-141`）：`points` getter = `MapGeometryUtility.ParsePoints`；
  `IsValid => points.Count >= 3`；`ContainsPoint`（`:79-83` 转调）· `IntersectsCircle`（`:84-103`）· `TryGetMovementHit`（`:105-140`）。
- `ParsePoints`（`:147-167`）：按 `;`/`|` 切、每段再按 `,` 切两段；`TryParseFloat`（`InvariantCulture` 优先，再 `float.TryParse` 容错）。
  ⇒ 数据形状 = **`"x,y;x,y;…"`**。
- `ContainsPoint`（`:178-201`）：**射线法** + `IsPointOnSegment`（**边上点直接算"内"**）。
- `IntersectsCircle`（`:84-103`）：中心在内 ∨ 任一边到圆心距离 ≤ `radius`（`DistancePointToSegmentSquared`）。
- `TryGetMovementHit`（`:105-140`）：起点在内 ⇒ **false**（"从墙里出来"不算撞）；否则取最早边交点的 `t`；
  `endInside && !hasHit ⇒ t = 0`。
- `TryGetSegmentIntersectionT`（`:203-238`）：含**平行/共线**分支（投影 `t0/t1` 取交叠区间）。
- `Triangulate`（`:252-315`）：**耳切法**；`SignedArea < 0 ⇒ remaining.Reverse()`（统一成逆时针）；
  `guard = n²` 防死循环；每个候选耳要求 `Cross > Epsilon`（凸）且三角形内**无其它剩余点**。
- `SignedArea`（`:340-351`）：鞋带公式 ×0.5。
- ⇒ **消费者两处**：① 导航足印 `MapNavigator.cs:161`；② **B3 的前景遮罩** `ValidMasks`（`MapSceneView.SetForegroundMasks`）。
  `TryGetMovementHit` / `ContainsCollisionPoint` 只被**死代码** `TryGetMovementDestination` / `IsCanvasMovementTargetAvailable` 用（`:143`/`:152`，见 §2.11）。
  ⇒ `MWI11`：**几何是共用件**，导航与 B3 **不许各写一份**。

### 2.4 玩家移动（`PlayerModel` 129 行 + `PlayerController`）【源码】

- `speed = 8f`（`PlayerModel.cs:12`，**`const` / `SerializeField`，不乘 deltaTime**）；`canvasSize = 960×540`（`:13`）。
- `SetMap`（`:22-26`）：`navigator = new MapNavigator(map, canvasSize)` ⇒ **玩家也走 §2.2 那台导航器**（canvas 坐标）。
- `OnPlayerMove`（`:94-110`）：`currentPos += speed * direction.normalized`；
  `direction.magnitude <= speed*0.6 (=4.8) ⇒ currentPos = targetPos`（**吸附**）；路径走完 ⇒ 触发 `onArriveEvent`。
- **驱动** = `PlayerController.FixedUpdate`（`PlayerController.cs:18-21`）⇒ 固定步 ≈ 50Hz ⇒ 名义 **400 px/s**。
- `SetDestinationByCanvasPos(destination, onArrive)`（`:41-60`）**三支**：
  ① `!IsTargetReachable(destination) && onArrive == null ⇒ return false`；
  ② `HasLineOfSight(currentPos, destination) ⇒ path = {destination}`（**单点**）；
  ③ `!TryFindPath(...) && onArrive == null ⇒ return false`；
  然后 **`:54-55`：`onArrive != null && path 空 ⇒ path = {destination}`** —— ★**一步直达**（**M5 TPC3 的 M7 同族**）。
- `SetDestinationNearCanvasPos(destination, searchRadius, onArrive)`（`:62-76`）：
  先 `TryFindNearestReachablePoint(destination, searchRadius, out reachable)`；**搜不到且 `onArrive != null` ⇒ `reachable = destination`**；
  再走 `SetDestinationByCanvasPos`。⇒ **看 M5 §2.3 的 72px 环 = `searchRadius` 传 72**。
- ⇒ **M5 的"两步走位"就落在这一对函数上**（光口 `Transport` ⇒ `SetDestinationNearCanvasPos(pos, 72, onArrive)`）。

### 2.5 ★漫游 NPC 的谓词 —— **实测为真**（★纠正 M6 §2.14 / BTQ5）【源码】+【样本】

```csharp
// MapWildNpcBehaviourController.cs:14-28
public static bool CanUseWildBehaviour(NpcInfo info) =>
    info?.wildInfo != null
 && info.battleHandler != null && info.battleHandler.Count > 0
 && info.eventHandler != null
 && info.eventHandler.Any(h => h.type == ButtonEventType.OnPointerClick && h.action == NpcAction.Battle);
public static bool RequiresNavigator(NpcInfo info) =>
    CanUseWildBehaviour(info) && info.wildInfo.movement?.isWander == true;
```

★**本轮实测**（272 张，先剥 `<!-- -->`）：

- 含 `<wild>` 的 NPC = **110** 只 / **53** 张图。
- `eventHandler` 里的 `<button>` = **766** 个，**0 个缺 `@type`**（`click` 668 / `auto` 65 / `shoot` 25 / `enter` 4 / `exit` 4）。
- 其中 `battle` 动作 = **150** 条，**全部带 `@type`**（**`click` 140 + `shoot` 10**）。
- ⇒ **110/110 只野怪都满足四条 AND**（`wildInfo` 有 ∧ `battleHandler` 非空 ∧ `eventHandler` 有 ∧ 存在 `click`+`battle`）
  ⇒ ★**谓词在发行数据下为真，不是恒假**；`RequiresNavigator` = **107**（= 107 只 `wander`）。
- ⚠️ **本份纠正 M6 §2.14 / BTQ5 的"谓词恒假"**：那句把 `eventHandler` 的 150 条 `battle` 动作记成
  "**全都没写 `@type`**"，实测**全都有**（与 M6 §2.6 的"150 条"同源，但 `@type` 分布当时记错）。
  ⇒ 上游的"野怪会走 + 能打"这套行为控制器**在重启的地图数据下是活的**（M6 §9 的 M7 行随之改）。
- ⚠️ **口径仍分开**（`MWI9`）：**"会走" = `movement.mode`**、"能打" = M6 的 `battleHandler`；两者现实里恰好重叠，
  但契约**不许**耦合成一条（否则 M6 的 `BTQ5`"野怪能否打 = 我们的配置位"就无从落地）。
- 装配点：`MapSceneView.TryStartWildNpcBehaviour`（`:295-318`）—— `CanUseWildBehaviour` 假 ⇒ `behaviour.Stop()`；
  真且 `RequiresNavigator` ⇒ `wildNpcNavigator ??= new MapNavigator(map, ReferenceCanvasSize)`（**960×540**，`:12`/`:313`）
  ⇒ ★**漫游 NPC 与玩家共用同一遍通行面**（**MWI7**）。

### 2.6 漫游走位（`MapWildNpcWanderController` 330 行）【源码】

常量（`:7-10`）：`TargetReachThreshold = 1.5` · `StuckCheckInterval = 1.25` · `StuckDistanceThreshold = 0.5` · `MaxTargetAttempts = 12`。

- `Init`（`:37-56`）：`enabled = movementInfo.isWander`（否则 `Stop` 并返回）；
  `spawnPos = rect.anchoredPosition`（★**canvas 坐标**）；`initialized = map ∧ navigator ∧ info ∧ movementInfo ∧ rect` 非空。
- `Update`（`:83-110`）：`holdTimer > 0` ⇒ 只倒计时；**无目标** ⇒ `idleTimer` 到点后 `ChooseNextPath()`；
  **有目标** ⇒ 把 `deltaTime` 累进 `tickTimer`，积到 `moveTick` 才 `MoveOneTick(elapsed)`（`elapsed` 传的是**累计**值）。
- `ChooseNextPath`（`:112-135`）：先 `MaxTargetAttempts`（12）次 `GetRandomCandidate()` 试 `TrySetPathToNearestReachable`；
  再遍历 `GetFallbackCandidates()`；全失败 ⇒ `idleTimer = GetRandomIdleTime() + GetSnapHoldTime()`（并打分类计数日志）。
- `GetRandomCandidate`（`:137-151`）：`radius = max(16, movementInfo.radius)`；
  `distance = Random.Range(minStep, maxStep)`（step 范围 `[12,26]` 的 min/max，clamp 进 `[1, radius]`）；
  角度随机；**离 `spawnPos` 超 `radius` ⇒ 拉回环上**（`spawn + dir.normalized * radius`）。
- `TrySetPathToNearestReachable`（`:164-191`）：`searchRadius = max(24, radius*0.5)`；
  `TryFindNearestReachablePoint`；**过近 ⇒ `sqrMagnitude < 64`（即 <8px）跳过**；
  `HasLineOfSight` ⇒ 单点路径，否则 `TryFindPath`。
- `GetFallbackCandidates`（`:153-162`）：`radius = max(24, radius*0.6)`，依次右/左/上/下 + `spawnPos`。
  ⇒ ★**三个不同系数**：候选夹紧 `max(16,…)` / 搜索 `max(24, ×0.5)` / 回退 `max(24, ×0.6)`（**MWC5 / MWQ4**）。
- `MoveOneTick`（`:209-227`）：`step = max(1, speed) * max(0.01, elapsed)`；`Vector2.MoveTowards`；
  `SnapToPixel`（★**四舍五入到整像素**）；`ToggleStepBob`（bob 高度**逐 tick 交替**）；`CheckStuck`。
- `CheckStuck`（`:281-299`）：`stuckTimer += max(0.01, movementInfo.moveTick)` ⇒ ★**累加的是配置的"假时间"，不是 deltaTime**；
  `≥ StuckCheckInterval` 且位移 `≤ StuckDistanceThreshold` ⇒ 清路径 + 重新待机（`MWC9`）。
- `ArriveAtTarget`（`:229-245`）：到点 `SnapToPixel`；还有航点 ⇒ `holdTimer = snap*moveTick`；否则 `idleTimer = GetIdleDuration()`
  并 **`RestStarted?.Invoke(idleTimer)`** —— ★**这就是气泡的触发点**（§2.7）。
- 视觉偏移 / 朝向走 `NpcController.SetVisualOffset` / `SetVisualFacing`（**半 View**，父文档 §2.13）。

### 2.7 气泡：调度（**本线**）与表现（**B3**）

**调度 = `MapWildNpcTalkController`（392 行）【源码】**：

- `Init(talkInfo, useStationarySchedule = !isWander)`（`:40-57`）：`enabled = talkInfo.HasSelf`；
  **静止 NPC** 立刻 `ScheduleNextStationaryTalk()`。
- **静止排程**：`Update`（`:76-87`）把 `deltaTime` 累进 `stationaryTimer`，到点 `TryShowTalk(max(0.2, talk.duration))` + 重排
  （`intervalRange` 默认 `[5,10]`）。
- **漫游排程**：`OnRestStarted(restDuration)`（`:59-65`）—— ★**只在"走到点停下"那一刻**按 `chance` 决定说不说
  （`restDuration < 0.2` 不说）。
- `TryShowTalk(availableDuration)`（`:89-113`）：`Random.value > chance ⇒ 不说`；`GetRandomSelf()`；`duration = min(max(0.2, talk.duration), availableDuration)`；
  有 `image` ⇒ `ShowImage`，否则 `ShowText`（取不到图 ⇒ `LogWarning`）。
- `GetRandomSelf()`（`NpcInfo.cs:153-160`）：在**有效**的 `self` 里 `UnityEngine.Random.Range(0, count)` 取一条。
- ★**三张表 `self`/`scene`/`player`**（`NpcInfo.cs:146-148`）：【样本】**`<scene>` = 0 / `<player>` = 0（两张死表）** ⇒ **只读 `self`**。
- `GetTalkImage`（`:115-141`）：`Sprites/Map/talk bubble/{id}` 本地取图（mod / 非 mod 各试一次）+ 编辑器图库 + `NormalizeImageId`（去扩展名、禁 `..`）。

**表现 = `MapWildNpcSpriteBubbleController`（224 行）【源码】**（★**数值归 B3**，此处只登记，供 B3 引用）：
`fontSize 17` · `fadeTime 0.18` · `maxTextLength 30`（**超长截断**）· `minWidth 50` / `maxWidth 200` ·
`minHeight 72` · `paddingX 15` / `paddingY 20` · `tailReserve 15` · `imageMaxSize 120×120` ·
文本 `MiddleLeft` + `Wrap` + `Truncate` + 关富文本；淡入淡出各 `fadeTime` 秒。
宿主 `MapWildNpcBubbleHost`（56 行）：样式 id 默认 **`white`**，实际取
`Player.instance.gameData.settingsData.wildNpcBubbleStyle`（⇒ **归设置线/编排线的 settings**）。

> ✅ **本件已由施工批 `MDB10` 接上（人类 2026-10-21 点名，2026-10-21 落码）** —— 此前状态 = **只文本、图像气泡运行时未接**。
> 落地口径（两条由人类拍板）：① **两条渲染路都出**（JS 回退图 + SWF 图 ⇒ 110 只带 `<talk>` 的野怪全覆盖，旧实现只在 JS 路的 21 只上跑）；
> ② **照上游 = 图与文进同一个池子均匀随机**（≈3/4 表情、≈1/4 台词；文本条目**不删**、只是被稀释）。
> 件位 = **L1 调度** `game/logic/map/talk.js`（`seedTalk`/`stepTalk`，从 `wander.js` **迁出** ⇒ 走位与气泡解耦，SWF 路不漫游也能冒泡）、
> **L1 URL** `logic/map/npc-art.js:talkImageUrl`（`emoji/toon⇒.png` / `emoji/meme⇒.jpg`、去扩展名、禁 `..` ⇒ 畸形返 `null`）、
> **L4 绘制** `app/scenes/mapScene.js:drawNpcImageBubble`。**与上游的三条偏差**（如实登记）：**无淡入淡出**（`fadeTime 0.18` 未做）、
> **不取上游底图 `WildNpcBubbleIntegrated.png`**（正式排版归 B3）、**取不到图 ⇒ 不出泡 + 一行日志**（照上游 `LogWarning`，**不伪造、不退回文本**）。
> as-built = `docs/map/map-impl.md §7.3.32` · 手测 = `§8.26`。

### 2.8 `<wild>` 数据实测（272 张，先剥 `<!-- -->`）【样本】

- `<wild>` **110 条 / 53 张图**；`<talk>` **110 条 / 53 图**。
- `movement` **110 条**：`mode="wander"` **107** / `mode="stationary"` **3**。
- 107 条 wander 的列值**只有 3 种**（其余列逐字相同：`radius="220" speed="34" step="12,26" moveTick="0.05" snap="1" bob="1.25" bobSpeed="2"`）：

  | 列 | 条数 |
  |---|---:|
  | `idle="2,3" originalFacesRight="true"` | **84** |
  | `idle="2,6" originalFacesRight="true"` | **21** |
  | `idle="2,6" originalFacesRight="false"` | **2** |

- 3 条 **stationary 只写 `mode`**（其余取类缺省：`radius=120 speed=35 idle="2,6" step="14,30" moveTick=0.08 snap=1 bob=0 flip=true originalFacesRight=false`）。
- `<wild visual>`：【样本】**缺省(auto) 93 / `animation` 14 / `embedded` 3**
  ⇒ ★**`visual` 与 `bobSpeed` 全仓无读取方 = 死字段**（照录不实现，`MWC9`）。
- `talk` 属性：【样本】`chance="0.3" duration="2.5"` ×84 · `chance="0.3" duration="4"` ×21 ·
  `chance="0.3" duration="4" interval="5,10"` ×3 · `chance="0.50" duration="4"` ×2。
- `<self>` **两形**：【样本】**`<self image="…"/>` 2,682 条**（distinct **31** = **24 `emoji/toon/*` + 7 `emoji/meme/*`**）
  + **`<self>文本</self>` 838 条**。
  - ⚠️ **本条数字已订正（2026-10-18，MB1 桥实测）**：原记 **2,788 / 732** 与数据不符 —— **合计 3,520 两者一致**、`distinct 31` 也一致，
    只有**两形之间的切分**错了 106 条。订正依据 = 两种独立数法（剥注释后正则 + `fast-xml-parser` 真解析）**都**给 2,682 / 838。
    见 `docs/map/map-impl.md §7.3 MB1` 偏差 ③。
  - 素材目录实测：`talk bubble/emoji/toon/` **24 png** + `emoji/meme/` **7 jpg** + `WildNpcBubbleIntegrated.png`；
  - ★**`MDB10` 落码前的一次性对账（2026-10-21，剥注释后正则）**：`<talk>` **110 条 / 53 张图**；`self` **3,520 条 = 2,682 图 + 838 文**；
    按"一条 `<talk>` 里有没有文本"切 = **106 条混合（图+文都有）+ 4 条纯图**（⇒ 旧实现"只挑 `{text}`"下这 **4 只野怪一个气泡都不出**、
    其余 106 只**永远看不见那 2,682 条表情**）；单条 `<talk>` 最多 **31** 个 `self`；
    `image` 的 distinct **31** 且 **id 一律不带扩展名**，目录与扩展名**完美二分**（`emoji/toon/*`⇒png 24 张、各被引用 110 次 / `emoji/meme/*`⇒jpg 7 张、各 6 次）
    ⇒ **不需要"先试 png 再试 jpg"**（`npc-art.talkImageUrl` 就按目录定扩展名）；
    53 张图按 `AGENTS §4.16` 分流 = **SWF 路 42 张（89 只）/ JS 路 11 张（21 只）**（对照 `game/data/map_swf.csv` 的 `swf_seq` 列）
    ⇒ **旧调度只活在 `M.jsMode` 里 ⇒ 81% 的说话野怪（89/110）今天根本不冒泡** —— 这就是人类 2026-10-21 拍板"两条路都出"的量。
  - `StoryExpressionCatalog.Ids` 只列 **24 toon** + `GetMotion` 的 **6 种运动**（`Neutral/Bounce/Shake/Surprise/Tilt/Sink`）
    ⇒ ★**运动那一半是剧情演出** ⇒ **A 组出局**，本线**只登记**。

### 2.9 AS3 血统：**现役**的移动与野怪（`MapRunner` / `WildPet`）【源码】

> 我们**今天真正在跑**的是这一套（SWF）。§2.2–§2.8 的 Unity 件是**目标真值来源**，**不是现状**。
> ⚠️ **本节的"现役"已于 2026-10-21 随 `MDB11` 终止**：`mapScene.js` 从此给 AS3 **喂空串** `wild: ''` ⇒ `MapRunner.as:192-206` 的 `setWild()` 解析出**空数组** ⇒ `spawnPets()` **一只 `WildPet` 都不生成**（AS3 侧不再有 `Lv+名字` 脚标、不再有"点了走到脚下才开战"）。**本节代码留档 = 不可达死码**（人类 ①「彻底收口」，但 `MapRunner.as`/`WildPet.as` **一字不动、不重编译** ⇒ 处置与 ★M9-c 旧链退役同款）⇒ as-built `docs/map/map-impl.md §7.3.33`、手测 `§8.27`。
> ⚠️ **同日 `MDB12` 的更正（素材语义被"照抄复用"，本体仍不生成）**：本节 `WildPet` 的**四件事**被 JS 侧逐条抄走 = **锚点钉位**（`:337-348 render` 的 `x = flip*(ox-anchorX)`、`y = oy-anchorY`）· **整格命中面**（`:351-360 drawHot`）· **上下两族 + 左右只镜像**（`:316-333 stepWalk` 的 `lookUp`/`flip` 与"最后一次方向保持"）· **标签取不到就退 `STAND_DOWN`、永不抛**（`:189-202 setAction`）⇒ 落点 = 新 L1 `game/logic/map/pet-view.js` + L4 `mapScene.js`（`drawPetFrame`/`petHitOf`），**帧推进不照抄舞台帧率**、改吃我们自己的 `PET_FPS = 12`（人眼校项）。
> ⚠️ 因而上面那句"不再 fetch `/swf/pet/normal/<id>.swf`"**只对 AS3 成立**：**`MDB12` 起 JS 侧按需要 fetch 同一批包**（`ensurePetPack()`；这些文件**不是 Flash 影片而是帧序列包** ⇒ 用现成的 `actor-view.parsePack` 解、**零 Ruffle、零 AS3 改动**）⇒ as-built **`§7.3.34`**、手测 **`§8.28`**。**仍不做** = `personal` 待机小动作（`:301-305 playIdelAnimation`）、脚下阴影（`:169-187 addShadow`）、惊讶特效（`:222 playSurpriseEffect`）、`Lv` 脚标（人类 ④ + 本批只做"素材来源"这一件事）。

`game/maprunner/MapRunner.as`（768 行）：

- 常量：`GRID_SIZE=10`（`:32`）· `FALLBACK_CELL=20`（`:33`）· `SPEED=4`（`:34`，**每帧** px）·
  `USE_GRID=false`（`:38`）· `NATIVE_GRID=false`（`:43`）· `HOT_R=26`（`:79`）· `ARRIVE_R=18`（`:80`，★**声明后全仓无使用 = 死常量**）。
- `USE_GRID=false ⇒ freeRoam = !USE_GRID || !hasPath = true`（`:291`）⇒ `walkable()` 只查**地图包围盒**（`:406-417`）
  ⇒ ★**整图可走**（与 **MP6** 冲突，见 §2.10）。
- 出生点 / 出口 / 野怪坐标都是 **`mapRoot` 本地坐标**（`<initialPoint>` / 光口 `pos` / 野怪 `fx,fy` 比例 × `mapW/mapH`）。
- `nearestWalkable`（`:425-440`）：`r = 1..16` 格，搜不到**原样返回**（可能把角色放进阻挡里）。
- `findPath`（`:443-500`）：8 邻域、**禁穿角**、`heuristic = max(dx,dy) + 0.414*min(dx,dy)`（**octile**）、
  `open` 用 `Array.indexOf`、`guard < 40000`。
- `spotAt`（`:533-543`）：`HOT_R²`（26px）内选**最近**光口；`jsWalkTo`（`:519-530`）：命中光口 ⇒ 目标改成**光口坐标**，
  **抵达才 `arriveAtSpot → mapEnter`**（= **MP5** 的两步走位；路过/中途改道不触发）。
- `tick`（`:601-632`）：`dist <= SPEED` 即视为到达航点（★`ARRIVE_R` **没用上**）。
- 野怪宿主服务：`petPickPoint`（`:554-562`，矩形内随机 ≤40 次挑可走点）· `petActorArrived`（`:572-576`，**8px**）·
  `petCallActor`（`:579-587`）· `petFight`（`:590-599`，置 `fightOut`、冻结全部野怪、发 `mapWildFight`）。

`game/maprunner/WildPet.as`（369 行，逐段对照原版 `SpawnedPet.as`）：

- 常量：`MAX_IDEL_INTERVAL=250` 帧（`:43`）· `ACTOR_CLOSE_DISTANCE=20`（`:44`）· `WALK_SPEED=1.6`（`:50`）· `ROAM_R=160`（`:51`）。
- 空闲（`:268-299`）：`maxIdleTime = 125 + 125*random()`；超 `MAX_IDEL_INTERVAL` ⇒ `personal` 演一次；超 `maxIdleTime` ⇒ `randomWalk`。
  ⚠️ **★`MDB13` 在此**有意偏离**上游**（人类 2026-10-21 拍板 ③）：我们 = **每次驻停播一次**（走→停的跳变帧），**不是**"站够 250 帧才偶尔演"；末帧回站立循环 + `PERSONAL_MAX=48` 截长。
- `randomWalk`（`:307-314`）：目标点在 **`ROAM_R` 半径**内随机 —— ★**四处有意偏离之一**（原版在整个舞台矩形随机，野怪会走出镜头）。
- 点击（`:204-212`）：`frozen = true` ⇒ `stopAction`（站定 + 惊讶标记 `y = -height+20`）⇒ `actorMoveClose`（**±20px 方框**取可走点）
  ⇒ 角色 `runTo` ⇒ 抵达 ⇒ `startFight()`（`idx != -1` 才开战）。
  ⚠️ **★`MDB13-d` 只接前一半**（人类 2026-10-21 拍板 ①「点了**先播完**再开战」）：我们 = `frozen` 吞重复点 + 站定 + 头顶「!」`y=-height+20`（`PET_MARK_FPS=30` ⇒ 23 帧 ≈0.77 s）⇒ **播完才** `onNpcClick`；**不复刻** `actorMoveClose` 的"叫角色走过来 ±20px 取点"（我们的点击一直是"点了就打"，要走过去 = **另开一批**）。
- ⇒ ★**野怪的战斗入口 = 点击 → 靠近 → 开战**，是**另一条并行的"能不能打"判据**（**AS3 不看 `@type`**）；
  与 §2.5 的 `eventHandler` 谓词**不是同一条链**（前者是我们现役的 AS3 表现层，后者是 Unity 目标真值）。

### 2.10 ★栅格极性存疑（本线唯一"数字真值不可得"的地方）【样本】+【源码】

- `tools/grid-truth.mjs` 用 config XML 的 `<initialPoint>`（**原版保证可走**）当真值，校验 `path_mc` 栅格：
  【样本】259 张里**有 config 的 47 张：出生点可走 25 / 被阻挡 22（46.8%）**（`docs/legacy/web-client-notes.md:28-42`）。
- 正常实现该 ≈ 0% ⇒ **两种可能未分离**：① **JS 光栅化**有系统性偏差；② `path_mc` 的填充/透明**极性整体与
  "`alpha==0` = 可走"相反**。
- 已定位的一处**确切缺陷**（②的候选之一）：`game/swfshape.mjs` 的 `geometryOf()`（`:323-347`）
  **只按填充索引分组**（`readShapeEdges` 也按 `fillIndex` 分组，`:176`）、**从不读填充色的 alpha** ⇒
  "**用透明色画的形状**"也被算成阻挡；而 AS3 的 `BitmapData.draw` **尊重 alpha**（`docs/legacy/web-client-notes.md:38-42`）。
- ⇒ 今天 `MapRunner.USE_GRID=false` 是**"因为真值不可得"**（`MapRunner.as:35-37` 原话），**不是**"确认整图可走"。
- ⇒ 它与 **MP6**（"不许把没有素材当全可走"）**直接冲突** ⇒ 本份在 §3.3 立**我们自己的口径**，见 **MWQ1**；
  ⚠️ **不记死账**（决议 ⑦）：把"极性到底正不正"做成 **§7.3 的人手核对项**（跑既有脚本），并**先**用显式口径兜住行为。

### 2.11 死代码与出局面（只登记，不实现）

| 上游件（`路径:行`） | 症状 | 处置 |
|---|---|---|
| `Map.IsPathAvailableByMousePos`（`Map.cs:113`） | 全仓 **0 调用** | **不照搬** |
| `Map.IsCanvasMovementTargetAvailable`（`:139`） | 全仓 0 调用；`geometry == null` **恒假**（`:36 = new()`，同 **M1 MDC9**） | 不照搬 |
| `Map.TryGetMovementDestination`（`:146`） | 全仓 0 调用；同上（`TryGetMovementHit` 唯一消费者） | 不照搬 |
| `MapWildNpcSpriteBubbleController` 的表现数值 | 归 **B3** | 本线只登记（§2.7） |
| `StoryExpressionCatalog.GetMotion`（6 种运动） | 剧情演出 | **A 组出局** |
| `<wild visual>` / `bobSpeed` | 死字段 | 照录不实现（§2.8） |
| `MapRunner.ARRIVE_R` | **我们自己** AS3 件里的死常量 | 登记（§2.9） |

---

## 3. 目标形状（契约）

> ⏸ ⚠️ **2026-10-18 人类拍板：通行面（地图场景里的可通行区域）暂时搁置不实现。**
> 后果：`walk` 列**不进桥**、`geometry.ts`/`nav.ts`/`move-runner.js` **不发码**；**玩家走位与通行面继续由 `MapRunner.as` 承担**（现役）；impl 侧记为 **MB8 搁置**（`docs/map/map-impl.md §2/§4 D5`）。
> ✅ **但 §3.4（漫游）不受影响**：人类同一轮明确"**不判断能否通行 = 哪里都能走**" ⇒ **漫游照做、无碰撞**（`MB9` 照常发码，只是不吃 `nav.ts`/`geometry.ts`）。
> ✅ **2026-10-18 追加（同族，涉及玩家侧）**：人类明确"**玩家暂时也不判断可通行区域，先直接全部区域可以通行**"。
> ⚠️ **这已经是现状、不需要改码**：`game/maprunner/MapRunner.as:38` `USE_GRID = false` ⇒ `:291 freeRoam = !USE_GRID || !hasPath` ⇒ 恒真 ⇒ **整图可走**（`:297` 的日志原话"阻挡=关(整图可走)"；`:421 walkable() ⇒ freeRoam`）。
> 今天喂给它的可走表（`game/app/scenes/mapScene.js:434-440` 的 `sendWalkGrid`）**只喂调试叠加层**（`:453` 绿/红格），**不参与阻挡**。
> ⇒ **§3.3 的 MP6（"不许拿没核过当全可走"）在玩家侧被本条暂缓**：`walk` 列的语义与 MB8 的判据以人类这条新裁定为准（MB8 重启时再议）。
> ⇒ 本节其余内容**保留为目标形状（真值不删）**；§3.1/§3.2/§3.3 里 **MB8 相关**的部分在人类重新开启前**不作为施工依据**。

### 3.1 数据（L2 现场解析记录；**落点与文件形状归 M1**，本节只给语义与列名）

```jsonc
// `parse-map.js` 的 `MapRecord` 里每个 npc 追加（方案 C：无 JSON 产物，运行时现场解析）：
"wild": {                             // ← <wild>（110 条；桥只做结构归一化，MDI10）
  "visual": "auto",                   // ★死字段，照录不实现
  "movement": { "mode": "wander", "radius": 220, "speed": 34, "idle": "2,3", "step": "12,26",
                "moveTick": 0.05, "snap": 1, "bob": 1.25, "bobSpeed": 2, "flip": true,
                "debug": false, "originalFacesRight": true },
  "talk": { "chance": 0.3, "duration": 2.5, "interval": "5,10",
            "self": [ { "image": "emoji/toon/happy" }, { "text": "…" } ] }   // scene/player 实测 0 ⇒ 不建列
}

// 每条 map 追加（通行面；★具体字段形状归 M1 定稿，本节只给语义）：
"walk": { "source": "as3-path" | "declared-box" | "none",
          "ox": 0, "oy": 0, "cell": 10, "gw": 0, "gh": 0, "ascii": "01…",   // source = as3-path 时
          "box": { "x": 0, "y": 20, "w": 960, "h": 520 } }                    // source = declared-box 时
```

- **`pathId` / `geometry` 照录**（M1 §3.2 的正主），本份**不作为默认通行面**（`MWI1`）。
- **桥的只读审计**（同 M5/M6 的口径，**只登记不报错**）：`walk-polarity-unverified`（§2.10：极性未核，**不阻塞**）、
  `walk-source-none`（既无 `path_mc` 又无声明内框可给 ⇒ 需人类过目）。
- **`wild` 与 `battle` 是两条独立的列**（`MWI9`）：`wild` 由本份定，`battles[]` 由 M6 定，**不互相派生**。

### 3.2 内核决议（内核只出这些；执行归编排层 / View）

```ts
// MoveIntent（L1 执行；内核纯函数产出，MP2）
{ kind: 'walk',        to: Vec2, onArrive?: { teleport?: {mapId}, npcId?: number } }
{ kind: 'arrive',      at: Vec2 }
{ kind: 'unreachable', wanted: Vec2, nearest?: Vec2 }   // ★不瞬移、不一步直达（MP5）
{ kind: 'talk',        npcId: number, content: {image?} | {text?} }   // 供 B3 表现
// teleport 本身的决议归 M5（本份只给"抵达"判定）
```

- **内核纯函数**（**MP2** / **MWI3**）：`core/map/nav.ts` 吃 `(walk, from, to, opts)`，出**路径点列**或 `null`（不可达）；
  **不碰时钟 / 随机 / 渲染**。
- **几何纯函数**（`core/map/geometry.ts`）：`parsePoints` / `containsPoint` / `intersectsCircle` / `triangulate`（**MWI11**）。
- `unreachable` 走 **R5** 提示（A3 `docs/view/mech/view-overlays.md`），**不切图、不瞬移**。

### 3.3 ★通行面口径（我们实际的走法）

| 情形 | 目标行为 | 与上游的差 |
|---|---|---|
| 有 AS3 `path_mc`（极性已核） | 用 `path_mc` 栅格（**cell = 10**，`alpha==0` = 可走） | 同 AS3 |
| 有 AS3 `path_mc`（**极性未定**） | **仍用** `path_mc`，同时出一条只读审计 `walk-polarity-unverified`；★**不**改用"全可走" | **MP6**：不许拿"没核过"当"全可走" |
| 无 AS3 `path_mc` / 解析失败 | 退回**显式声明的内框** `x∈[0,960] ∧ y∈[20,540]`（= **MC7 想统一的那一支**） | **不照搬** `IsCanvasPathAvailable ⇒ true` |
| 到达点不可达 | 出 `unreachable` 决议（**MP5**），**不**补单点、**不**瞬移 | ★**比上游强**（**MWC4**） |

- ⚠️ **格心 vs 足印**（`MWI4`）：目标**统一到一种口径**并**只声明一次**（上游三处不一致，**MWC2**）。
  **建议 = 足印（±8px 8 点采样）**（与 `BuildGrid` 一致、最保守、最不会把角色放进墙里），**LOS 也用同一遍格**。
- ⚠️ **单位**（`MWI3`）：内核只认 **canvas（960×540，左下锚定）**；`path_mc` 的 **`GRID_SIZE=10` 格 / mapRoot 本地坐标**
  只在**桥**里换算成 canvas，**不把两套带进内核**。
- ✅ **2026-10-18 人类裁定（玩家侧临时口径）**：**玩家暂时也不判断可通行区域 ⇒ 全部区域可通行**。
  现状**已经如此**（`MapRunner.as` 的 `USE_GRID=false`，见本节头部注）⇒ **无代码改动**；上表这四种情形**暂时都不生效**（它们只在 MB8 重启、内核接管走位时才用得上）。

### 3.4 漫游 NPC 的目标行为

- **能否漫游 = 显式配置位**（`wild.movement.mode == "wander"`），**不与"能打"耦合**（`MWI9` / ★纠正 M6 §2.14）。
- **走位**：⚠️ **本批（MB9）无碰撞**（人类 2026-10-18：通行面不判断 ⇒ "哪里都能走"）⇒ **不吃 `nav.ts`/`geometry.ts`**、**不另建** A*；
  野怪在 `radius` 内直着选点走、会停、不走出镜头。⚠️ **`MWI7`（"与玩家同一遍通行面"）本批不成立** —— 那是 `MB8` 的事（已搁置）；观感后果：野怪可能**穿墙**（见 `docs/map/map-impl.md §8.8` 第 4 条）。
- **数据来源 = 重启真值**（⚠️ 2026-10-18 订正）：野怪表**只存在于重启侧**（`Resources/Data/Maps/*.xml` 的 `<npc><wild>` **110 条 / 53 张图** + `<talk>`）；
  ✅ **人类 2026-10-18 指出**："野怪数据在重启的地图代码里应当已经有了" —— **确实有**（本条据此改口径）。
  ⚠️ **我们曾经的 `game/data/wild.json` = "我方合成"**（`tools/build-wild-index.mjs` 头注：原版 AS3 的野怪清单来自**服务端 socket 1103**、已不可得 ⇒ 自造：48 只池 + BFS 定档 + hash 定数量 + 归一化 `fx/fy`）⇒ **它不是真值、只服务旧渲染器**，**✅ 已断（`MDB11`，2026-10-21）**：文件**留盘**、生成脚本**保留**，但**运行时零引用**（`mapScene.js` 的 `wildOf`/`fetch('/game/data/wild.json')`/`startWildFight`/`numericIdOfWild` 与 `content.js` 的 `pruneWildPool` **已删除** ⇒ as-built `docs/map/map-impl.md §7.3.33`）。⚠️ 本条 2026-10-18 就写着"退场"，但**运行时直到本批才真断**（旧消费方指针 `mapScene.js:62-64, 590, 621-623` 也早已漂移 ⇒ 以 as-built 为准）。
  ⚠️ **一条可见变化**：合成表覆盖 **252 张图**，真值只有 **53 张** ⇒ 换真值后**野怪只出现在那 53 张图上**（其余图不再有野怪）。
  📏 **`MDB11` 实测（2026-10-21 本批新量，一律以此为准）**：`<wild>` = **110 只 / 53 张图**（图侧 = **42 张走 SWF / 11 张走 JS**，按 `game/data/map_swf.csv` 分流）；`<movement mode>` = **107 `wander` + 3 `stationary`**（wander 侧 **SWF 86 只 / JS 21 只**；非 wander 的 3 只**全在 SWF 侧**）；这 107 只的参数**完全一致** = **`radius=220`、`speed=34`、`step="12,26"`、`idle="2,3"`（84 只）或 `"2,6"`（23 只）**。全量图 **272 张 = 170 张有 swf 映射 + 102 张 JS 侧**。合成表与真值的**交集 = 34 张** ⇒ 本批之后 **19 张图新增野怪**（真值有、合成表没有）、**218 张图失去野怪**（合成表有、真值没有：**SWF 侧 98 / JS 侧 120**）；**219 张 = 272−53** 张图**压根没有 Unity 野怪** ⇒ 人类 ② 拍板 = **就没有、不伪造**。⚠️ Unity 侧**没有"出怪表 / 重生"概念**（`<wild>` 是**这只 NPC 自己**的行为包，不是"这张图刷哪些怪"）⇒ 本批**不造**第二张表。⚠️ **位置 = 该 `<npc>` 的 `pos`（Unity 坐标）** ✅ **换算口径已定（人类 2026-10-18 路线 A）= 简单归一化**：`fx = ux/960`、`fy = uy/540`（重启参考画布 **960×540**，`MapSceneView.cs:11`；实测 `x∈[25,880]`、`y∈[45,455]` 全在画布内）⇒ **现役管线本来就吃归一化**（`MapRunner.as:222-223`：`wx = mapX + fx*mapW`）；**位置误差人类接受**（两套地图构图有差异，靠人眼校）。
  📏 **`MDB12` 实测（2026-10-21 本批新量，素材侧 ⇒ 分布数字不变）**：**110 只野怪 / 53 张图**在上屏时分裂成两条**素材支路** = **帧包 80 只 / 38 张图** + **重启 PNG 30 只 / 15 张图**（`混源图 = 0` ⇒ 没有一张图两种来源混着画）。桥链 = `<npc @resId="Pets/pet/<形象 id>">` → `game/data/pet_appearance_swf.csv`（1,016 行，`appearance_id` 只到 **2999**、**零条 10xxx**、**零条 `swf_seq=0`**）→ `swf/pet/normal/<n>.swf`。**三支覆盖**：包**已在盘且已入库** = 10 只 / 4 种 / 4 图（`121`/`131`/`407`/`409`，全 SWF 路）；包缺、官服抓得到 = 70 只 / 34 种 / 34 图（30 SWF / 4 JS；34/34 逐个 HEAD = **HTTP 200**，合计 **2,325,139 字节 ≈ 2.3 MB**，目录 **48 → 82**）；**无 Flash 对应物** = 30 只 / 15 种 / 15 图（8 SWF / 7 JS，全在 `10015…10043` 段）⇒ **继续走重启 PNG、不伪造**。**38 个在用包的帧包形状**：`frameW` **28–231**、`frameH` **28–224**、`anchorX` **9–181**、`anchorY` **26–220**；`walk` 区间跨度 **9–59** 帧、`stand` **8–60** 帧；**32 个包**四个英文标签齐全、**6 个包**要中文别名（`64 正面走路` / `114 跑步·站立·背面跑` / `195 背面走` / `209`+`213 背面走路␣`**带尾空格** / `228 正面待机·背面待机`）⇒ 别名表 + 查表前 `trim` 是**必须**。区间样本：`114` ⇒ `walkDown 1-10 / standDown 11-27 / walkUp 28-37 / standUp 38-54`；`209` ⇒ `walkUp 40-60`（由 `背面走路␣` 命中）。**立绘 vs 帧包的尺寸对照（为什么这次要换）**：`Pets/pet/20.png` = **111×124**、`240.png` = **736×980**、`119.png` = **500×573**、`10013.png` = **102×102**，而 `<npc @size>` 声明 **48×54** 那一类 ⇒ 立绘被硬缩（糊）；帧包的 `28×31` 那一类才是 Flash 时代地图上那只小精灵。⚠️ **`<wild @visual>` 不吃**：实测 **裸 93 + `animation` 14 + `embedded` 3 = 110**，上游 `NpcInfo.cs:116` 只是**声明**、**零消费者**，桥接层 `game/logic/map/parse-map.js:107 wildOf()` **把它透传成 `wild.visual` 但下游没人读** ⇒ 本批不据它分流（死数据线索登记在 `docs/map/map-npc.md §6`）。
  📏 **★`MDB13` 实测（2026-10-21 本批新量，细节侧 ⇒ 分布与素材数字不变）**：**① `personal` 素材覆盖 = 82/82 个包**（在盘帧包逐个 `parsePack` + `personalRange` 实测）—— **81 只带字面标签 `personal`**、唯一缺件 `114.swf` 用同义词 **`free`（55–119）** ⇒ 别名表 `PET_PERSONAL_ALIAS = ['personal','free']` 把它兜住（在用 38 包自然全覆盖）；段跨度 **4 帧（`20`）– 233 帧（`122`）**（次长 `135`=151 / `138`=145 / `181`=135 / `195`=121）⇒ **58/82 只超过 `PERSONAL_MAX=48`（≈4 s @`PET_FPS=12`）被刻意截断**（不截最长的要播 ≈19 s）。**② 两张共享特效包 = 借小赛尔的、都已在库**：`game/data/actor/UI_ActorShadow.bin` = **62×31 / 39 帧 / anchor (26,23)**、标签 `local:{1,1} remote:{2,2} vip:{3,39}` ⇒ 阴影恒取 **`local` 首帧**（与 M8-b2 第二轮 `ALC14` 同口径）；`UI_SurpriseMark.bin` = **61×68 / 23 帧 / anchor (35,66)** ⇒ `PET_MARK_FPS=30` 播完 ≈**0.77 s**（= 点击到开战的延迟）。⚠️ 上游那两张 `UI_PetShadow.swf` / `UI_FightSuprise.swf` **官服 404** ⇒ 属**顶替**（同 `MDB12` 借包口径，台账 `docs/asset-inventory.md`）。**③ 等级真值 = `<battle>`**：`<wild>` 共 **112 条**（`active=false` 2 条 ⇒ **上屏 110**，与本份 📏 前两行的 110 一致）、**112 条全部带 `<pet level>`**、**111 条**名字自带 `LvNN ` 前缀（⇒ 脚标必须**先剥前缀**，否则写出 `Lv13 Lv13 奇鲁`）；**名级不一致 4 处** = `133.xml` 的 `13301/13302/13303` 荧光蝶（名 `Lv10/11/12` ⇔ `level=8/9/10`）+ `408` 的多利（名 `Lv70` ⇔ `level=14`）⇒ 脚标**以 `<battle>` 为准**（= 与实际打到的等级必然一致，`MDB11` 口径）⇒ **这 4 处观感会变、已写进 `map-impl §8.29` 第 3 条**。
- **随机（目标点 / 待机时长 / 气泡概率）走 R1、时钟走 R2**（`MWI8`）：内核不碰。
- **卡住检测**：照上游的**语义**（位移阈值 + 间隔），但**按 deltaTime**（`MWI6`），**不照搬**"累加 `moveTick` 的假时间"（**MWC9**）。
- **气泡**：**调度归本线**（"什么时候说哪一条" = `talk` 决议），**表现归 B3**（`MWI10`）；`scene`/`player` 两张死表**不建列**。
- **漫游半径**：取**数据侧 `radius`（220）**（MQ1 写侧以重启为准）；★**AS3 的 `ROAM_R=160` 不继承**（那是对原版的**有意偏离**，**MWQ4**）。

### 3.5 接缝

| 接缝 | 谁给谁 | 内容 |
|---|---|---|
| **B3** | M7 → B3 | 通行面栅格（调试叠加层）· 相机跟随 · 寻路虚线预览 · 野怪脚标 · ★**气泡数值与渲染**（§2.7）；本线不给任何像素 |
| **M5** | M7 → M5 | ★**接手 §2.9 的"三套数"**（本份 §2.1）；`SetDestinationNearCanvasPos(pos, 72, …)` 的**抵达判定**（§2.4）；抵达 ⇒ 切图（MP5） |
| **M6** | M7 → M6 | ★**纠正 §2.14 / BTQ5**：`CanUseWildBehaviour` 实测 **110/110 为真**（不是恒假）；`battle` 触发面归 M6、"会走"归本份 |
| **M1** | M7 → M1 | 桥新增 `wild` 列（§3.1）与 `walk` 列的**语义**（§3.3）；`pathId`/`geometry` **照录**（M1 §3.2 正主） |
| **M2** | M7 → M2 | NPC 的 `pos`/`size`/`rotation` 与 canvas 坐标（§2.1）；`NpcController` 是"半 View"（父 §2.13） |
| **编排线** | M7 ⇄ 编排线 | 会话持 `currentMap`（§4.1）；移动**按 deltaTime**（**R2**）；`mapInitPos` 消费同 **OR4**；`MapManager.LoadMap/LoadPlayer` = 宿主 |
| **运行时线** | M7 → R1/R2 | 漫游目标点 / 待机 / 气泡概率 = **R1** 消费点；逐帧移动 / 卡住检测 = **R2** 消费点 |
| **E6** | — | 野怪点了"走到脚下 → 开战"的**后半段**归 M6 → E6；本份只管**走到** |

### 3.6 施工批草案（**MDB7-a…e**，等 impl）

> ⏸ **`MDB7-a` 的 `walk` 列不产、`MDB7-b/c/d`（几何/寻路/走位执行器）不发码**（人类 2026-10-18：通行面不实现）—— 这些都是 **MB8**。
> ✅ **`MDB7-e`（漫游）照常发码** = **MB9**：人类同轮裁定"不判断通行 = 哪里都能走" ⇒ 漫游**无碰撞**、**不依赖 MDB7-b/c**。
> ⚠️ **MB8 重启前置**：先定"通行面来源"（桥预产栅格？运行时解析？声明的内框？）—— 见 **MWQ1** 与 `docs/map/map-impl.md §4 D5`。

| 批 | 内容 | 依赖 |
|---|---|---|
| **MDB7-a** | 桥：`wild` 列（§3.1）+ `walk` 列（AS3 `path_mc` 栅格 / declared-box）+ 只读审计 `walk-polarity-unverified` | **M1** / MB1 |
| **MDB7-b** | `core/map/geometry.ts`：`parsePoints` / `containsPoint` / `intersectsCircle` / `triangulate`（**纯函数**，与 B3 共用） | —— |
| **MDB7-c** | `core/map/nav.ts`：栅格 A*（8 邻域 + 禁穿角）+ **统一口径的足印** + LOS + 最近可达点；`open` 用**优先队列** | **MDB7-a/b** |
| **MDB7-d** | `logic/map/move-runner.js`：把 `walk`/`arrive`/`unreachable` 决议接到宿主（**按 deltaTime**；接 B3 相机 + M5 切图 + R5 提示） | 编排线会话切片 / **M5** |
| **MDB7-e** | 漫游 NPC：`logic/map/wander.js`（目标选取 + 卡住检测 + 待机）+ `talk` 决议（表现归 B3） | **MDB7-c** / **R1** / **R2** |

---

## 4. 数据流（两条链）

```
【链一 · 玩家走位 / 换图】
玩家点击（canvas 坐标）
   │  判定：落在光口 HOT_R 内？ / 落在野怪上？（M5 / M6 的入口）
   ▼
core/map/nav.ts（MDB7-c，纯函数）  ← walk 列（MDB7-a：AS3 path_mc 或 declared-box，§3.3）
   │  可达 ⇒ 路径（或视线单点）；不可达 ⇒ null
   ▼
MoveIntent { walk | arrive | unreachable }
   │  执行（MDB7-d，按 deltaTime）
   ▼
B3 相机/表现 · M5 抵达⇒切图（mapEnter） · R5 "走不过去"提示
```

```
【链二 · 漫游 NPC 与气泡】⚠️ 2026-10-18 起：**寻路一段取消**（通行面不判断案）—— 见下方 ⏸ 注
发行数据 <npc><wild><movement|talk>            (272 张 / 110 条)
   │  桥（MDB7-a，先剥注释再解析）✅ 本批**产 `wild` 列**（重启真值；~~我方合成的 `game/data/wild.json` 已退场~~ ⇒ ✅ **2026-10-21 `MDB11` 才真断**：文件留盘、**运行时零引用**，`map-impl §7.3.33`）
   ▼
npcs[].wild ─────────────────────────────────┐
   │  idle → 选目标(R1) → 【无碰撞】直走 → 逐帧移动(R2) → 抵达 → RestStarted
   ▼
⏸ ~~core/map/nav.ts（MDB7-c） ← 同一遍通行面（MWI7）~~（**MB8 搁置**；MB9 不走这里）
   │  路径 | 不可达（⇒ 记 idle）
   ▼
MoveIntent{walk|arrive}  +  TalkIntent{content}（chance 掷骰走 R1）
   │  执行（MDB7-e）
   ▼
NpcController 位移/朝向/bob（半 View）  ·  B3 气泡表现（字号/淡出/脚标）
```

---

## 5. 不变量（**MWI1–MWI11**）

| # | 不变量 | 依据 |
|---|---|---|
| **MWI1** | **通行面默认 = AS3 `path_mc`**（继承 **M1 MDI1**）；Unity `pathId`/`geometry` **照录不实现** | §2.1【样本】+ M1 §2.6 |
| **MWI2** | **无 path 素材 ≠ 全可走**：退回**显式声明的内框**（`x∈[0,960] ∧ y∈[20,540]`），**不许** `IsCanvasPathAvailable` 的 `return true` | **MP6** + **MC7**（§2.1） |
| **MWI3** | **三套坐标/单位不许混算**（canvas / path 像素 / AS3 mapRoot 本地+cell）；换算只在**桥与宿主边界**发生，内核只认一种空间 | §2.1【源码】（接手 M5 §2.9） |
| **MWI4** | **可走性口径唯一**：格心与足印**只准声明一种**，全链路（grid / reachable / LOS / 最近点）**同口径** | §2.2【源码】（上游三处不一致 = **MWC2**） |
| **MWI5** | **不可达 ⇒ `unreachable` 决议**：不瞬移、不一步直达、不把空路径补成单点 | **MP5** 的 M7 面；= **MWC4** 的修法 |
| **MWI6** | **移动与卡住检测按时间（deltaTime）**，不按帧、不用配置的假时间 | §2.4/§2.6/§2.9【源码】（**MWC3/MWC9**） |
| **MWI7** | **漫游复用同一台寻路与同一遍通行面**：不另建第二套 A*；NPC 与玩家受同一约束 | §2.5【源码】（`MapSceneView.cs:313`）。⚠️ **2026-10-18 起暂不适用**（人类：通行面不判断 ⇒ 等于"哪里都能走" ⇒ **MB9 漫游无碰撞**）；⚠️ **MB8 完成日** = 本不变量重新生效之日 |
| **MWI8** | **内核不碰时钟与随机**：目标点/待机/气泡概率走 **R1**、时钟走 **R2** | 决议 ①/③ + §2.6/§2.7【源码】 |
| **MWI9** | **"会走"与"能打"是两条契约**：能否漫游 = `movement.mode`；能否打 = M6 的 `battleHandler` | ★纠正 M6 §2.14（**实测 110/110 为真**） |
| **MWI10** | **气泡 / 脚标 / 相机是表现（B3）**：内核只出"说什么 / 什么时候"的决议 | §2.7 + `docs/view/scene/room/view-scene-map-content.md` |
| **MWI11** | **几何是共用件**：`containsPoint`/`intersectsCircle`/`triangulate` **一套**，导航与 B3 前景遮罩共用（不各写一份） | §2.3【源码】（`ValidMasks` 的消费者） |

---

## 6. 现状与缺口（实测）

| 件 | 今天 | 目标 |
|---|---|---|
| **通行面** | ⚠️ 现役 = **整图可走**（AS3 `USE_GRID=false ⇒ freeRoam`）；`game/data/maps.json` **无任何栅格列** | **MDB7-a/c**（AS3 `path_mc` 栅格 / declared-box，§3.3） |
| **几何** | ❌ `game/core/**` **0 个几何对象**（无 `MapPolygon` / 无耳切） | **MDB7-b** |
| **导航** | ❌ `game/core/**` **0 个导航对象**；现役寻路在 SWF（`MapRunner.findPath`） | **MDB7-c** |
| **玩家移动/抵达** | ⚠️ 现役 = SWF `tick`（`SPEED=4/帧`，`ARRIVE_R` 死常量）；宿主只报回 `camX/camY` | **MDB7-d**（按 deltaTime） |
| **点光口走位** | ✅ 已通（`spotAt` HOT_R=26 → 走到 → `mapEnter` → `gotoMap`），**两步走位在跑** | 换成内核决议（**MDB7-c/d**） |
| **野怪漫游** | ⚠️ ~~现役 = AS3 `WildPet`~~ ⇒ ✅ **运行时已断（`MDB11`，2026-10-21）**：AS3 侧 `setWild("")` ⇒ 零生成（`MAX_IDEL_INTERVAL=250` / `WALK_SPEED=1.6` / `ROAM_R=160` 那套**成为不可达死码**、代码留档不重编译）；现役 = **JS 的 `logic/map/wander.js`，JS/SWF 两条路都播态** | **MDB7-e**（Unity 语义：`radius=220` 环 + 待机 + 卡住检测）✅ **已落（`§7.3.11` + `§7.3.33`）** |
| **气泡** | ⚠️ 现役 = 宿主的 `#lbl` 画布层只画**脚标**（`Lv{等级} {名字}`）；**说话气泡 0 行** ⇒ ✅ **两处均已变更（2026-10-21）**：说话气泡**已落**（`MDB10` = `logic/map/talk.js` + 图像/文本同池，`map-impl §7.3.32`）；`#lbl` 脚标层**已随 `MDB11` 整条拆除**（合成野怪不再存在 ⇒ 无对象，`§7.3.33` B-9） | 调度 → 本线（**MDB7-e**）；表现 → **B3** |
| **`<wild>` 数据** | ❌ 桥**没有** `<wild>` 列（`game/data/maps.json` 只有 `id/name/swf/…/teleports`） | **MDB7-a** |
| **野怪出怪表** | ✅ **已断（`MDB11`，2026-10-21）**：`game/data/wild.json` 是**我方合成**（`tools/build-wild-index.mjs`，`hash(mapId)` 确定性；**原版出怪来自服务端 socket 1103，不可得**）= pool 48 / 252 张图 ⇒ 2026-10-18 **改口径弃用**、**2026-10-21 运行时真断**（文件与脚本**留盘**、**零引用**）⇒ 单一来源 = 重启真值 `<wild>`（**110 只 / 53 张图**，全量数见 `§3.4` 的 📏 行） | **MDB7-a** 的 `wild` 列；与 M6 的"地图战斗"合流；本份**不造第二张表**（Unity 侧没有出怪/重生概念） |
| **栅格极性** | ⚠️ **未核**（`tools/grid-truth.mjs`：46.8% 出生点被判阻挡）；`swfshape.mjs` 不读填充 alpha | **MWQ1** + §7.3 第 7 条（人手核对） |

---

## 7. 怪癖登记 · 待拍板 · 等人手测

### 7.1 上游代码 bug / 危险设计（**MWC1–MWC9** · 按 `AGENTS.md §2`：**声明 + 不照搬**）

| # | 上游行为（`路径:行` + 症状） | 发行数据里的可观察后果 | 目标（本份写的"没有该 bug"的行为） |
|---|---|---|---|
| **MWC1** | `IsCanvasPathAvailable` 无 path ⇒ **`return true`（全可走）**（`Map.cs:132-133`），而 `IsPathAvailable` 无 path ⇒ **内框 `[0,960]×[20,540]`**（`:122-123`） | ★**导航只调前者** ⇒ 缺 path 的图（本 mirror **全部**）**整张 canvas 可走**（角色能进墙） | §3.3：**统一到内框**，**不许** `true`（**MWI2** / MC7） |
| **MWC2** | 可走性口径**三处不一致**：`BuildGrid` = **足印@格心**；`IsTargetReachable` = **足印@精确点**；`HasLineOfSight` = **格心（无足印）** | 4px 级别的"目标可达但格不可走"；`TryFindPath` 还会把目标 **snap 到最近 walkable 格**（`FindNearestWalkableCell` 半径 = **全图**）⇒ **实际终点可静默地离请求点很远** | **MWI4**：统一到**一种**口径（建议足印），全链路同口径 |
| **MWC3** | `PlayerModel.speed = 8f` **不乘 deltaTime**（`PlayerModel.cs:12`/`:106`，`FixedUpdate` 驱动）；AS3 `SPEED=4`/帧 | **帧率相关**：同一段路在不同机器上耗时不同 | **MWI6**：按 **deltaTime**（R2 时钟），定值 = 数据/常量表声明 |
| **MWC4** | `SetDestinationByCanvasPos`：A* 失败 ∧ `onArrive != null` ⇒ 空 path 被 `:54-55` **补成单点** | 点一个**不可达**的光口/地面 ⇒ **角色"一步直达"**（穿过墙/瞬移）⇒ **M5 TPC3 的 M7 同族** | **MWI5**：出 `unreachable` 决议，**不**补单点（**MP5** 更强） |
| **MWC5** | `TryFindNearestReachablePoint`：只扫**恰好在环上**的格（对角距离被忽略）+ `distanceSquared >= best` 严格比较 + `foundAtRadius` **早退** + `point` 初值 = 原点；★漫游侧**三个不同半径系数**（`max(16,…)` / `max(24,×0.5)` / `max(24,×0.6)`） | 环的**覆盖与择优都不完整**（首个有命中的环就返回，可能不是最近）；漫游的"找目标"成功/失败边界**难以复核** | §3.3/§3.4：**声明一套**半径语义（常量表 + 日志）；最近点**扫整盘**比距离（不早退） |
| **MWC6** | A* 实现：`open` = `List` + `Contains` **线性查**、`closed` **不可重开**、无优先队列；`GetBestOpenIndex` 用 `>=`（先到先得）；`Heuristic` = **Chebyshev**，而 AS3 `findPath` 用 **octile** | 两套"同一 8 邻域 A*"给出**不同路径** ⇒ 不可对拍；大图 O(n²) | **MWQ3**：照**语义**（8 邻域 + 禁穿角 + 可采纳启发）**不照实现**；`open` 用**优先队列**；启发**选一个并声明**；**不对拍**（决议 ⑦） |
| **MWC7** | `PlayerModel.onArriveEvent` 是**单个委托**（`:14`），新目标**覆盖**旧目标 | 连续点击 ⇒ **上一个 `onArrive` 被丢掉**（若是"抵达去切图"的那一个，就**永远不切图**） | 目标/回调**成对**存在 move 决议里（`MoveIntent.onArrive`），**不靠单例字段** |
| **MWC8** | `Map.IsPathAvailable`（非 canvas 版）与三个 `Movement*` 函数**全仓 0 调用**（`:113`/`:139`/`:146`），且 `geometry == null` **恒假** | ⇒ ★**"内框"那一支在导航上从来不是活的**（真正跑的是 `return true`，见 **MWC1**） | 只实现 §3.3 的四支，**不搬死代码** |
| **MWC9** | 漫游 `CheckStuck` 累加**配置的假时间** `moveTick`（`MapWildNpcWanderController.cs:283`）而非 deltaTime；`bobSpeed`/`visual` **死字段**；`MapRunner.ARRIVE_R` **死常量** | 卡住判定的**时间尺度与真实耗时脱钩**；死字段/常量误导读者 | **MWI6**：按 deltaTime；死字段**照录不实现**但**在文档标记**（§2.8/§2.11） |

⚠️ **与 V2 的分工**（`AGENTS.md §2`）：上面 **MWC1–MWC9** 都是**代码逻辑 / 危险设计** ⇒ **不照搬**；
而**数据本身**的怪值（如 3 条 stationary 只写 `mode`、`idle="2,3"` ×84 这类**分布**）**照录**，不是 bug。

### 7.2 待拍板（**MWQ1–MWQ5** · 本份局部编号 · 依人类常设指示「都按你的建议来吧」**已采纳建议并标 ✅**）

| # | 问题 | 证据 | 决议 |
|---|---|---|---|
| **MWQ1** | **栅格极性未核时，"可走性"怎么定？** | §2.10【样本】（46.8%）+ `swfshape.mjs:323-347`【源码】+ **MP6** | ✅ **仍以 AS3 `path_mc` 为默认**；未核时出**只读审计** `walk-polarity-unverified`（**不阻塞**）；**无 path 时用声明式内框**（**不**全可走）；**不追求与 AS3 逐值一致**（真值不可得 ⇒ 决议 ⑦：人测行为） |
| **MWQ2** | **格心还是足印？** | §2.2【源码】（三处不一致，**MWC2**） | ✅ **统一到足印（±8px 8 点）**：格盘由足印建、可达判定同一遍、**LOS 也用同一遍格**（最保守、最不会进墙）；**只声明一次** |
| **MWQ3** | **寻路算法照不照抄上游？** | §2.2/§2.9【源码】+ `Heuristic` 两套（**MWC6**） | ✅ **照语义、不照实现**：8 邻域 + **禁穿角** + 可采纳启发（**选一个并声明**，允许用 octile）；`open` 用**优先队列**；**不对拍**（决议 ⑦） |
| **MWQ4** | **漫游半径取谁？** | §2.6/§2.9【源码】+ §2.8【样本】 | ✅ **取数据侧 `radius=220`**（MQ1 写侧以重启为准）；★**AS3 的 `ROAM_R=160` 不继承**（那是对原版的**有意偏离**）；三个系数（16 / 24·0.5 / 24·0.6）**收进一张常量表并声明** |
| **MWQ5** | **气泡：`self` 2,788 图 + 732 文本怎么落？`scene`/`player`/运动怎么办？** | §2.7/§2.8【样本】 | ✅ **调度归本线、表现归 B3**（**MWI10**）；`scene`/`player` 两张**实测为空的表** ⇒ **不建列**；`StoryExpressionCatalog` 的 **6 种运动不实现**（剧情 = **A 组出局**） |

### 7.3 等人手测确认的具体项（决议 ⑦：主验收 = 人类把游戏跑起来手测）

> ⏸ **第 1/3/6/7 条随 2026-10-18 的「通行面搁置」一并搁置** —— 它们测的是**内核通行面与内核寻路**（现役仍由 `MapRunner.as` 走，行为不变）；
> ✅ **第 2 条**（点光口两步走）**已由现行代码实现**，可在 MB5 回归时测（`docs/map/map-impl.md §8.2`）；
> ✅ **第 4/5/8 条（漫游 / 气泡 / 点野怪开战）照测** —— 人类 2026-10-18：漫游照做（`MB9`，无碰撞）。

1. **点地面走动**：进任意可走图（如 `990`「普兰特山脚」）→ 点地面，**看的是**：角色**绕开遮挡**走到、**抵达停下**；
   ★**不同帧率下速度一致**（= **MWI6** 的唯一可观测面）。
2. **点光口换图**（**MP5**）：点光口 → **走过去才切图**；**路过 / 中途点别处不触发**。
3. **点一个不可达的点 / 不可达光口**（**MWI5** / **MWC4**）：**看的是**：**不瞬移**、给"走不过去"的反馈；
   ★这是本份与上游行为**最容易看出差别**的一条（上游会一步直达）。
4. **野怪漫游**：进 53 张有 `<wild>` 的图之一（`10015`「火山星山脚下」等）→ **看的是**：野怪**在 `radius` 内来回走**、
   **会停**（待机）、**不走出镜头**；朝向随左右翻。
5. **气泡**（**MWI10**）：同一批图 → **看的是**：野怪**驻停时**按 `chance` 冒出**图标气泡**或**文字气泡**（`self` 表），
   字号/淡出与 B3 的数值一致；超 30 字被截断。
6. **卡住不死循环**（**MWC9** / **MWQ4**）：把角色挤到野怪的目标点上（或找窄图）→ **看的是**：野怪**重新选目标**，
   **不抖动、不卡死**。
7. **栅格极性核对**（**MWQ1**，★**不改码，跑既有脚本**）：`node tools/grid-truth.mjs` 的 **46.8%**
   在修复 `game/swfshape.mjs` 的"不读填充 alpha"后，**看的是**：是否降到 **≈ 0%**
   —— 降了 ⇒ **极性本来是对的、锅在光栅化**；不降 ⇒ **极性真反了**（`USE_GRID` 不能开）。
   ⚠️ 本项**只须复核一个数字**，由**人类**决定何时跑（决议 ⑦：AI 不新写、不为验收去跑）。
8. **点野怪开战**（接 **M6**）：点野怪 → ~~**看的是**：角色**走到脚下** → 开战（复现现役 AS3 行为，`WildPet` §2.9）~~ ⇒ ✅ **本批口径已换（`MDB11`，2026-10-21）**：**只剩一条路** = 点**我们 `#npc` 叠加层**上的野怪 ⇒ `onNpcClick` → `resolve→run` → `startMapBattle`，**直接开战**（不绕角色走位，**与渲染路无关** ⇒ SWF 面今天第一次能这样测）；怪物与等级吃该 NPC 的 `<battle>`，**不再**吃合成表的 `pet`/`level` ⇒ 判据 = `map-impl §8.27` 第 2 条。

---

## 8. 配对 `impl` / `code-map`

`docs/map/map-impl.md` 吸收 **MDB7-a…e** 的切片与顺序 —— ⏸ **但 2026-10-18 人类拍板「通行面搁置」⇒ `walk` 列不产、`MDB7-b…d` 不发码（= MB8 搁置）**；
✅ **`MDB7-e` 照常发码（= MB9，无碰撞漫游）**（`docs/map/map-impl.md §2/§4 D5/§3.9`）；`docs/map/map-code-map.md` 把 §3.1（`wild` / `walk` 两列）、
§3.2（`MoveIntent` 决议）、§3.3（通行面四支）、§3.4（漫游目标行为）换成实际文件与函数名（`core/map/nav.ts` / `core/map/geometry.ts` /
`logic/map/move-runner.js` / `logic/map/wander.js`）；§7.3 的 8 条人手测项原样搬进 impl 的验收清单（`docs/map/map-impl.md §8.7` ⏸ 搁置 / **§8.8 ✅ 照测**）。
两份均 ✅ **已成文（2026-10-18）**，且 `MIP1–MIP4` 四条已由人类 2026-10-18 结账（见 `docs/map/map-impl.md §9`）。

---

## 9. 本份对父文档 / 同线文档的回执

| 对象 | 本份要改的 | 状态 |
|---|---|---|
| 父文档 **§2.11**（移动/几何/寻路导读） | 从"表 + 现状"升为 **✅ 正本指向**（本份 §2.1–§2.4/§2.9/§2.10 覆盖）；补两处最容易漏的真值：**缺 path 时全可走**（MC7 的活支）+ **三套坐标/单位** | ✅ 已合并 |
| 父文档 **§2.12**（漫游 NPC 导读） | 升为 **✅ 正本指向**（本份 §2.5–§2.8）；★补"**谓词实测 110/110 为真**、`RequiresNavigator` = 107、`scene`/`player` 死表、`visual`/`bobSpeed` 死字段" | ✅ 已合并 |
| 父文档 **§9.1 M7 行** | **M7** 行 ⬜ 待写 ⇒ ✅ 已成文（待评审）；内容列按本份 §0/§5 重写 | ✅ 已合并 |
| 父文档 **MP6** | 补一句"精确兜底 = **内框 `x∈[0,960] ∧ y∈[20,540]`**"；★并登记"**现行实际在跑的是 `IsCanvasPathAvailable` 的 `return true`**（全可走）" | ✅ 已合并 |
| 父文档 **MC7** | 补一句：两个相反兜底里，**导航真正调的是"全可走"那一支**（本份 §2.1【样本】：`pathSprite == null` 是常态） | ✅ 已合并 |
| **M5 §2.9（"三套数"）** | ★**接手**：三套坐标/单位进本份 §2.1；`SetDestinationNearCanvasPos(pos, 72, …)` 的**抵达判定**进 §2.4 | ✅ 已合并（并回赠 M5 一处**纠正**：实际在跑的是"全可走"支） |
| **M5 §9 回执表末行（M7）** | ✅ 结账：M5 §2.9"三套数"与回执表 M7 行由本份接走（M5 侧标 ✅ 已合并） | ✅ 已合并 |
| **M6 §2.14 + BTQ5 + §9 M7 行** | ★**纠正**"谓词在发行数据下恒假" ⇒ **实测 110/110 为真**（`eventHandler` 的 `battle` 动作 150 条**全带 `@type`**：click 140 + shoot 10）；`RequiresNavigator` = 107。M6 §9 的 M7 行从 ⬜ 待 M7 成文 ⇒ ✅ | ✅ 已合并（M6 §2.6/§2.14/BTQ5/§9 已同步） |
| **M1 §2.6 / §3.2** | `walk` 列的**语义**（§3.1/§3.3）：AS3 `path_mc` 为默认 + declared-box 兜底 + `walk-polarity-unverified` **只读审计**；`wild` 列的语义（§3.1） | ⬜ 待合并（字段形状归 M1 定稿） |
| **B3 `view-scene-map-content.md`** | 相机跟随 / 寻路虚线预览 / 野怪脚标 / ★**气泡数值（§2.7）**：数据面由本份给，像素归 B3 | ⬜ 待合并 |
| **编排线** | 会话持 `currentMap`；移动**按 deltaTime**（**R2**）；`mapInitPos` 消费同 **OR4** | ⬜ 待合并 |
| **运行时线 R1/R2** | 漫游目标点/待机/气泡概率 = **R1** 消费点；逐帧移动 / 卡住检测 = **R2** 消费点 | ⬜ 待合并 |
| **`docs/legacy/web-client-notes.md`** | 栅格极性存疑（§2.10）已在该文件 `:28-42` 登记；本份把它**接进设计口径**（**MWQ1**）⇒ 从"待办"升级为"**显式口径 + 人测项**" | ⬜ 待合并 |

⚠️ **本份是本线主设计最后一份**（M1–M7 齐）⇒ 地图线 **`design` 全部成文**；**配对 `map-impl.md` / `map-code-map.md`** ✅ **已成文（2026-10-18）** ⚠️ **人类 2026-10-18 已结账四条拍板**（`docs/map/map-impl.md §9`），design 本身仍待评审（判据见 `AGENTS.md §1`）⇒ **本线 design + impl 均已交，等人类评审**。⚠️ **2026-10-20 另立候补资料索引 M8**（`docs/map/map-actor-look.md`：角色穿戴/骑乘，**`ALQ1=A`/`ALQ2=B` 已拍板 · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**），不改变 M1–M7 的边界与已落批。
