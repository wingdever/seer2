# M5 · 传送（`map-teleport.md`）

> **定位**：地图线（M）的子设计 **M5** —— **换图这一条链的真值与目标**：光口数据、两步走位、落点模型、昼夜镜像、
> 以及 `mapId==0` / `50000` 两个特例。本线**六条链里最先跑通**的一条（我们已落地，见 §6）。
> **父文档**：`docs/map/map-design.md`（总设计兼导读；本份细化 §2.9 / **MP5** / **MP8** / §7 决议表的传送切片）。
> **同线兄弟**：**M1** `map-data.md`（桥：`teleports[]` 与 `switch`/`dream`/`initialPoint` 的落法）·
> **M2** `map-npc.md`（`teleport` **动作**与 NPC 的 `transport` 属性）· **M3** `map-condition.md`（`map.switch`/`map.dream` 条件臂）·
> **M4** `map-dialog.md`（对话里的 `teleport` 出路，30 条）· **M6** `map-battle-trigger.md` · **M7** `map-move.md`（**可达性/寻路的正本在 M7**，本份只取它的**结论**）。
> **邻线**：
> **编排线** `docs/orchestration/orchestration-design.md`（**OR2** 换场景只有一个入口 / **OR4** 入场参数走 `changeScene` 入参不走键袋 / **§4.1 会话**持 `currentMap`）·
> **B3 渲染** `docs/view/scene/room/view-scene-map-content.md`（**光口贴图与出口名**，已落）· **A3** `docs/view/mech/view-overlays.md`（**R5 弹窗 sink**：`mapId==0` 的"暂未开放"）·
> **运行时线** `docs/runtime/runtime-components-design.md`（**R5**）· **Save 线**（换图后要落盘的只有 `currentMapId`，格式归 Save）。
> **真值源**：`Assets/Scripts/Scene Specific/Map/Entities/Teleport/TeleportInfo.cs`（**18**）·
> `.../Teleport/TeleportHandler.cs`（**68**）· `Scene Specific/Map/Map.cs`（**210**，本份只取 `:22/:23/:29-30/:40/:189-201`）·
> `Scene Specific/Map/MapManager.cs:41-48`（落点消费）· `System/Database.cs:113-123`（`GetMap` 缓存规则）·
> `MVC/Controller/Map/Components/MapInfoController.cs:28-35` + `MVC/View/Map/Components/MapInfoView.cs:23-26` + `Scenes/Map.unity`（**Day Night Button** 的接线）·
> `MVC/View/Map/MapSceneView.cs:469-478`（光口装配）· `MVC/Controller/Player/PlayerController.cs:107-115` ·
> `MVC/Model/Player/PlayerModel.cs:41-76` + `Scene Specific/Map/MapNavigator.cs:64-99`（**72px 环形搜索**）·
> `Helper/Helper.cs:177-195` `:250-254`（`ToFloatList` / `ToVector2` 的静默兜底）·
> `Resources/Data/Maps/*.xml`（**272** 张，Unity 血统）【样本】· `swf/map/config/*.xml`（**259** 张，AS3 血统）【样本】。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **TPI1–TPIn**（不变量/契约）/ **TPC1–TPCn**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**）/
> **TPQ1–TPQn**（待拍板，附建议）/ 施工批 **MDB5-a…e** —— **全是本线局部编号**，**不是**「人类决议 ①–⑧」（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。

---

## 0. 这份文档回答什么

1. **`TeleportInfo` 只有 5 个字段，而且**没有"落点"这一维**（§2.1）—— 光口只说"去哪张图"，不说"站哪"。
2. **传送有六个入口，本线只认四个**（§2.2）—— 光口 / NPC 的 `teleport` 动作 / NPC 的 `transport` 属性 / 昼夜按钮；
   另外两个里，**面板 `GoToMap` 归 View 线 C3**（正本 = `docs/view/panel/worldmap/worldmap-design.md`，2026-10-19 成文；⚠️ 原句把它与任务/剧情混写成"A 组出局"、§2.2 表第 5 行原写"归 **C2**"，两处均为编号笔误，按 `docs/view/view-design.md §8` 订正），
   任务检查点 `MissionController` 与剧情 `StoryPanel` 属 **A 组出局**（`docs/architecture.md §1.1`），本份只留形状。
3. **"两步走位"到底怎么走**（§2.3）—— `Transport` → 72px **环形搜索**最近可达格 → 抵达回调 → 切图；
   ★**搜索失败时上游不但不放弃，反而会"单点直达"**（§2.3 末，**TPC3**）。
4. **落点模型在发行数据下只有一条规则**（§2.4）—— `mapInitPos` 那个覆盖机制**在生产者侧是死代码**：
   光口结构上没有落点字段，NPC 的 `teleport` 动作 **106 条全部只有 1 个 `param`** ⇒ `param[1]` 那条分支** 0 命中** ⇒
   **永远落在目标图的 `<initialPoint>`**。
5. **昼夜镜像的真机制**（§2.5）—— 不是"传送"，是**顶栏那颗 25×25 的 `Day Night Button`**；
   `switch` 实测只有 **`1`(23) / `-1`(21) / `71`(1)` 三种值**，而那个 `71` 会让按钮**重进当前图**（**TPC5**；⚠️ 但 `71` 这张图**走进不去**，见 §2.10）。
6. **两套血统在传送上不可互换**（§2.6）—— AS3 有 `targetPos`（219 条）而 Unity **结构上没有这个字段**；
   `initialPoint` 一边是 **`x/y` 属性**、一边是 **文本 `445,140`**；两侧 `pos` 的**坐标系不同**（实测 169/169 配对全差 >4px）。
7. **`mapId==0` 与 `mapId==50000` 两个特例的实际触发情况**（§2.7）—— 前者在 Unity 发行数据里 **0 条**（纯防呆），
   后者**恰好 1 条**（`990.xml`「基地」→ `50000.xml`「小屋」），而那 1 条把**活动/Mod 线**塞进了传送函数。
8. **出口名为什么不能取目标图名**（§2.8，**MP8** 的实测面）。
9. **★光口图很稀疏、而且不是唯一的入口机制**（§2.10）—— 272 张里 **95 张零光口入边**、**54 张两头皆空**，
   其中 **26 张的进出只在 NPC 动作层** ⇒ **只读光口就会把这些图做成"死图"**（**TPI9**，本线最容易犯的错）。
10. **我们的传送链今天通到哪一步**（§6）—— 桥读的是 **AS3 那一套**，所以"通着的那条链"其实建立在**另一条血统**上。
11. **本份要拍的五个板**（§7.2）与**给人手测的八条**（§7.3）。

---

## 1. 边界（本线只管这些）

| 归本线 | 归别人 | 支点 |
|---|---|---|
| 光口数据形状、传送**决议**、落点规则、昼夜镜像规则、`mapId` 特例的**语义** | **可达性与寻路**（`TryFindNearestReachablePoint` / A* / path 纹理） | **M7** `map-move.md`（本份只用它的结论："可达 / 不可达 / 最近可达点"） |
| "抵达光口 ⇒ 出一次传送决议"的**因果** | **换场景这件事本身**（`unmount`/`mount`/加载层/`location.hash`） | **编排线 OR2/ORB2**；本份只声明 `changeScene('map', {mapId, spawn})` 这个**入参形状** |
| `teleports[]` / `switch` / `dream` / `initialPoint` 该进哪一列 | **桥怎么读 XML、产物 JSON 的键序** | **M1** `map-data.md`（本份给**列清单与约束**，不给解析器实现） |
| 出口名是**哪个字段** | 光口贴图、悬浮说明的**版式与命中区** | **B3** `docs/view/scene/room/view-scene-map-content.md §2.4`（已落） |
| "暂未开放"是一条**决议** | 弹窗本身（标题/字号/1 个选项） | **A3** + 运行时线 **R5**（决议 ③：核心层只调接口） |
| 昼夜按钮**该不该出现**（`switch` 是否 ∈ {−1,1}） | 按钮的图标与位置 | **B3/A1**（`Scenes/Map.unity` 里 `Day Night Background` 的子对象，25×25） |

⚠️ **一条容易越界的点**：`Teleport` 在上游是个**静态工具函数**，却一路做到 `SceneLoader.ChangeScene`（§2.7）。
目标里它**只出决议**（**MQ4** 的同一口径），切图由编排层执行 —— **本线不实现换场景**。

---

## 2. 上游真值

### 2.1 `TeleportInfo`（18 行，五个字段）【源码】`TeleportInfo.cs:7-18`

| 字段 | XML | 缺省 | 说明 |
|---|---|---|---|
| `id` | `@id` | —— | **作用域 = 单张图**（与 M4/DLI2 的 branch id 同口径）；是 `teleportList` 的键 |
| `name` | `@name` | —— | **出口自己的名字**（悬浮说明与抵达日志用它，**MP8**） |
| `pos` → `posId` | `@pos` | —— | `posId.ToVector2()` ⇒ **canvas 坐标、左下角锚定**（与 `SetTeleportRect` 的 `anchoredPosition` 同一个值，**不是** path 像素） |
| `rgba` → `color` | `@color` | `"255,255,255,128"` | `.ToColor(Color.white)` ⇒ 畸形串 ⇒ **白**（静默） |
| `targetMapId` | `@targetMapId` | —— | ★**没有 `targetPos`**（见 §2.6） |

【样本】**Unity 393 条**里：`@id`/`@name`/`@pos`/`@targetMapId` **各 393（全有）**、`@color` 只有 **8** 条
（取值 `164,40,164,255` ×5 / `0,128,255,255` ×2 / `0,127,255,255` ×1）；`pos` 全部是合法 `x,y`；`targetMapId` **全部可解析**。
⚠️ 父文档 §2.1 记的 **433** 是 **grep 值**（含注释内 **40** 条），parse 后 = **393 条 / 211 张图**（见 §9 回执）。

### 2.2 六个传送入口（谁能发起换图）【源码】+【样本】

| # | 入口 | 位置 | 落点参数 | 在发行数据里的量 | 归谁 |
|---|---|---|---|---|---|
| 1 | **光口**（地图上的传送点） | `MapSceneView.cs:469-478` → `TeleportHandler.CreateTeleport` | ✗ 结构上没有 | **393 条 / 211 张**（Unity） | **本线** |
| 2 | **NPC 的 `teleport` 动作** | `NpcActionHandler.cs:188-200` | `param[1]`（**可选**） | **106 条**（`eventHandler` 65 / `replyHandler` 25 / `callbackHandler` 11 / `functionHandler` 5）⇒ ★**106 条全部只有 1 个 `param`** ⇒ 带落点那条 **0 命中** | **本线**（语义）/ **M2**（动作决议表） |
| 3 | **NPC 的 `transport` 属性** | `NpcInfo.cs:43-44` + `NpcView.cs:340` | 是（走到 NPC 身边） | **56 条**（如 `10001.xml` 的 5 个 NPC） | **本线**（两步走位）/ **M2** |
| 4 | **昼夜按钮** | `MapInfoController.cs:33-35` ← `Scenes/Map.unity` 的 `Day Night Button`（`Day Night Background` 的子对象，25×25，`m_Mode:1` 持久回调） | ✗ | `switch` 属性 **45 张**（`1`×23 / `-1`×21 / **`71`×1**） | **本线** |
| 5 | 面板 / 图鉴跳转 | `Module.cs:10 GoToMap`、`Panel.cs:90` | ✗ | —— | 面板归 **C3**（正本 `docs/view/panel/worldmap/worldmap-design.md`；原笔误 C2 已订正 2026-10-19。**2026-10-19 追加**：小地图一族 11 块 = `docs/view/panel/minimap/minimap-design.md`，113 个热区**共用同一条链**、不新开 sink），本线只保证 `Teleport(mapId)` 这个动词在 |
| 6 | 任务检查点 / 剧情 / 新手引导 | `MissionController.cs:92`、`StoryPanel.cs:1347`、`NoobIntroController.cs:55` | ✗ | —— | **A 组出局**（任务 / 剧情，`docs/architecture.md §1.1`）⇒ 本份**只留形状不实现** |

### 2.3 两步走位与那颗 72px 的环【源码】

- `TeleportHandler.cs:9` `const float TeleportReachableSearchRadius = 72f`；`:33-35` `Transport(canvasPos, onArrive)` ⇒
  `PlayerController.SetDestinationNearCanvasPos(pos, 72, onArrive)`（`PlayerController.cs:107-115`）。
- `PlayerModel.cs:62-76`：`navigator.TryFindNearestReachablePoint(dest, 72, out p)`；
  `MapNavigator.cs:64-99` = **先试原点**，不可达再按**格环**（`radius = 1..ceil(72/cellSize)`，只遍历"恰好在环上"的格）
  取**欧氏距离 ≤72 且最近**的可行走格中心。
- ★**失败分支**（`PlayerModel.cs:70-76`）：搜不到时 ——
  `if (onArrive == null) return false;` ⇒ 普通点击**放弃**；
  但 `Transport` **永远传 `onArrive`** ⇒ 走 `reachableDestination = destination`（**那个不可达的原点**）→
  `SetDestinationByCanvasPos`：`IsTargetReachable==false && onArrive!=null` ⇒ **不拦**；
  有视线 ⇒ `path = {destination}`（**一步**）；无视线且 A* 失败 ⇒ `:53-54` 把空 path **补成 `{destination}`**（还是**一步**）。
  ⇒ **上游的真值**：光口若落在不可行走区，玩家会被**一步直达**过去然后切图（**TPC3**）。
- 抵达后：`SetTeleportButton` 的点击回调是 `Transport(info.pos, () => Teleport(info))`（`TeleportHandler.cs:28`）⇒
  **切图只由"抵达"触发**，不是点击触发（**MP5** 的正本）。
- 悬浮说明：`onPointerEnter` ⇒ `infoPrompt.SetActive(true)`、`onPointerOver` ⇒ `SetInfoPromptWithAutoSize(info.name, MiddleCenter)`、
  `onPointerExit` ⇒ 关（`:25-27`）⇒ **文案 = `@name`**（**MP8** 的上游依据）。

### 2.4 落点模型（`mapInitPos` 的完整生命周期）【源码】

```
TeleportHandler.cs:56-57  if (targetPos != default(Vector2)) Player.SetSceneData("mapInitPos", targetPos);
                                                            ↑ 只有"显式给了非 (0,0) 的落点"才写
MapManager.cs:45-47       initPos = Player.GetSceneData("mapInitPos", map.initPoint)   // 读，缺省 = 本图 initialPoint
                          playerController.SetPlayerPosition(initPos)
                          Player.RemoveSceneData("mapInitPos")                          // ★读后即删（一次性）
```

【样本】**生产者侧 0 命中**：光口结构上没有落点字段；`teleport` 动作 106 条**全部 1 param**；
`SwitchDayNight` 的两个调用方都**不传** targetPos（`MapInfoController.cs:34`）。
⇒ **目标只有一条规则**：**落点 = 目标图的 `<initialPoint>`**（§3.3）。覆盖机制**留位**（§3.3 的 `spawn`），
因为编排线 **OR4** 要求"入场参数走 `changeScene` 入参、不走键袋"——**形状要有，生产者可以为空**。

⚠️ 顺带一条：`MapManager.LoadPlayer`（`:41`）还**无条件** `Player.instance.isShootMode = false` —— 每次进图都退射击模式。
这与 **M4/DLC9** 是同族（跨层副作用），但**语义不同**（进图归零 vs 开对话归零）⇒ 归**编排线/地图线的输入门**记账，见 §9。

### 2.5 昼夜镜像【源码】+【样本】

- `Map.cs:23` `[XmlAttribute("switch")] public int dayNightSwitch;` —— **图级属性**，不在光口上。
- `TeleportHandler.cs:64-67` `SwitchDayNight(switch, targetPos)`：
  `targetMapId = (Mathf.Abs(switch) == 1) ? -Player.instance.currentMapId : switch;` ⇒ **`±1` ⇒ 取当前图的负号孪生**；
  **其它值 ⇒ 直接当 mapId 用**（**TPC5** 的成因）。
- `MapInfoView.cs:23-26` `dayNightBackground?.SetActive(dayNightSwitch != 0)` —— ⚠️ **它只管背景，不管按钮本身**，
  但 `Scenes/Map.unity` 里 **`Day Night Button` 是 `Day Night Background` 的子对象**（`m_Father` = 1657932865）
  ⇒ **隐藏背景会连带隐藏按钮** ⇒ 没有 `switch` 的图**点不到**那颗按钮（这条我一度判成"227 张图都会弹暂未开放"，**已实测排除**）。
- 【样本】Unity **26 张负 id 图**，其中 **24 张有正号孪生**；两张例外是 **`-139`「荆棘林梦境」/ `-209`「幻彩珊瑚梦境」**
  （它们带 `dream="true"`、`resId="-131"` / `resId="-203"` ⇒ **梦境图借的是夜版图的美术**）。
- 【样本】反向也一样：45 张 `switch != 0` 的图里，**镜像文件缺失的只有畸形的 `71` 那一张** ⇒
  **`missingMirror` 在发行数据下没有触发点**（§3.4 的校验因此是**防呆**，不是补洞）。
- 【样本】★**孪生边的分布**（本轮按解析口径把 393 条光口按 `sign(id) → sign(target)` 分四桶，⚠️ 推翻本份先前"光口永不跨日夜"的绝对表述）：
  **`day→day` 357 / `day→night` 2 / `night→day` 21 / `night→night` 13** ⇒ **光口确实会跨日夜**（34 张夜版图一共只有 34 条光口，其中 13 条互相连、21 条走回日版）。
  但**"同一张图的日 ↔ 夜孪生"这条边，光口层几乎不存在**：`X → -X` 全库**只有 1 例 = `-1270`「秘密基地梦境」 →(秘密基地) `1270`「秘密基地」**，
  而 `-1270` 是 `dream="true"` 的**梦境图** ⇒ 那条边的语义是"**梦境出口回现实**"，不是"换滤镜"（`-131 → -132`、`-70 → -20` 这类则是**两张不同的夜版图**互连，与孪生无关）。
- 【样本】★**孪生边住在动作层，不住在光口层**：`1270 → -1270`、`-131 → -139`（3 处）、`-203 → -209`（2 处）**全是 NPC 的 `<action>teleport</action><param>目标</param>`**（M2 那 **106** 条里的成员，**1 param ⇒ 不带落点**）
  ⇒ **梦境/镜像的"入场券"是 NPC 动作，"出场券"才是光口**（`-139`/`-209` 的**唯一**入边 = NPC teleport，实测无光口入边）。
- ⇒ **TPI4 的规范主张不变**（镜像与传送是两套数据、不许混），但**依据要换**：不是"光口从不跨日夜"，而是 **镜像目标 = `-currentMapId` 由代码算出、不写在任何光口/动作数据里**（`TeleportHandler.cs:64-67`）。
  ⚠️ **同时被推翻的还有 §2.10 那条推论**：不能把"夜版只能靠那颗按钮进"当设计前提（`-70` 有 2 条光口入边、`-139`/`-209` 靠 NPC teleport 进）。
- 【样本】`dream="true"` 共 **3 张**（`-1270` / `-139` / `-209`），三张的 `switch` 都**不是** ±1（`-1270` 的 `switch` 缺省）
  ⇒ **`dream` 与昼夜无关**，它是 M3 的 `map.dream` 条件臂（`Map.cs:197`）。

### 2.6 两套血统在传送上的差异【样本】★本表是 M5 最重要的对照

| 面 | **Unity**（`Resources/Data/Maps`，272） | **AS3**（`swf/map/config`，259） | 结论 |
|---|---|---|---|
| `<teleport>` | parse **393** / grep 433（差 **40** 在 `<!-- -->`）/ **211 张** | parse **301** / grep 308（差 5 在注释；另 **4 张整文件解析失败**）/ **187 张** | 桥**必须**先解析再计数（父文档新纪律） |
| `@targetPos` | **0 条**（`TeleportInfo` 里根本没有该字段） | **219 条**（2 条含空格 `"70, 465"`，`float.TryParse` 吃前导空格 ⇒ 无害） | ★AS3 有精确落点、Unity 没有 |
| `@color` | **8** 条 | **0** 条 | 我们的工具注释写"308 条无一带 @color"= **AS3 口径** |
| `pos` 值域 | x **25..880** · y **45..455** | x **34..1121** · y **85..611** | ⚠️ **坐标系不同** |
| 同图同 id 的 `pos` 对比 | —— 交集 **135** 张、可配对 **169** 对 | | ★**169/169 全部相差 >4px**（中位差几百像素）⇒ **AS3 的 `targetPos` 不能嫁接到 Unity 光口**（**TPQ1** 的证据） |
| `<initialPoint>` | **272/272 文本形** `<initialPoint>445,140</initialPoint>`，全合法 | **属性形** `<initialPoint x="600" y="470"/>`，**文本恒空** | ⚠️ 两种形状；按 Unity 规则读 AS3 ⇒ `ToVector2("")` ⇒ **全部落 (0,0)** |
| `<map @id>` | **272 张都有** | **0**（只能靠文件名） | 桥的 id 来源差异（M1） |
| `@switch` | 45 张（`1`/`-1`/`71`） | 19 张全 `1`，**且 0 张负 id 图**（夜版没爬下来） | ⇒ **昼夜玩法只在 Unity 血统成立** |
| 光口重复 `@id` | **0 张** | **4 张**（`101090` / `3825` / `3827` / `3828`，各两条 `id="1"`） | ⇒ 喂给上游 `Dictionary.Add` 会抛（**TPC1**） |
| 光口悬空目标 | **0 条**（393 条 `targetMapId` 全部有同名文件） | **4 条**指向解析失败的图（`141→142`、`1422→142`、`1423→142`、`950→1182`） | AS3 只作**只读适配器**输入（M4/DLC12 同口径） |
| NPC `transport` | **56 条** | **0 条** | 血统差 |

### 2.7 `Teleport(mapId, targetPos)` 的三分支【源码】`TeleportHandler.cs:41-62`

1. `mapId == 0` ⇒ **`Hintbox`**「提示 / 地图暂未开放 / 1 个选项」后 `return`（**在**传送函数里直接开弹窗）。
   【样本】Unity 393 条里 `targetMapId==0` **0 条** ⇒ **这条在发行数据里永不触发**（只保护硬编码调用方）。
2. `mapId == 50000` ⇒ `Activity.Find("mod_home").GetData("map_id", "50000")`，`int.TryParse` 失败 ⇒ **兜回 50000**。
   【样本】Unity **恰好 1 条**：`990.xml`「普兰特山脚」的光口 `name="基地"` → `50000`；`50000.xml` 名字是「**小屋**」、`category=200`、4 个 NPC、1 个光口 → `-70`。
   ⇒ ★传送函数里**嵌了对活动/Mod 线的查询**（**TPC6**）。
3. 否则 ⇒ `SetSceneData("mapInitPos")`（条件见 §2.4）→ **`Player.instance.currentNpcId = 0`** → `Player.instance.currentMapId = mapId` → `SceneLoader.ChangeScene(SceneId.Map)`。
   ⚠️ **一个 22 行的静态函数一路写到全局单例 + 场景切换**（**TPC4**）。
- 另：`Database.cs:113-123` ⇒ **`Map.IsMod(id)` 的图不进 `mapDict` 缓存**（`:117-118`），而 `Map.cs:40` `IsMod = (id < -50000) || (id == 0)`
  ⇒ **夜版图（`-1..-50000`）照常缓存**；`id==0` 既是"未开放"又被判为 Mod（**TPC7**：`0` 一身两职）。

### 2.8 出口名（**MP8** 的实测面）【样本】

- Unity（权威血统，**本轮已按图核对完**）：393 条**全部有非空 `@name`**（空名 **0** 条）、`targetMapId` **全部可解析**（悬空 **0** 条）、**162 个不同值**；
  与目标图名对照 ⇒ **相同 373 条 / 不同 20 条**（≈**5.1%**）。不同的两类：
  ① **飞船区的「传送室」→ `10001`「传送仓」**（同义不同字，绝大多数落在这里）；② **夜版图的口名沿用日版语境**（例 `-131.xml` 口名「草系主城」→ `90`「草目氏族主城」）。
  ⇒ **MP8 在 Unity 血统下同样成立**（取目标图名会把 20 条写错，其中含**每一条飞船出口**）。【样本】
- AS3：父文档 MP8 记的"308 条里 25 条不同、1 条为空"是 **AS3 口径**（我们的工具注释同源）。
- ⇒ 悬浮说明与"抵达日志"的文案**只能取 `@name`**（上游 `TeleportHandler.cs:27` 就是它）。

### 2.9 `pos` / `initialPoint` / path 像素：三套数（给 M7/B3 的接缝）【源码】

- 光口 `pos` = **canvas 坐标**（`anchoredPosition`，左下锚定；`PlayerModel` 的全部接口都以 canvas 为单位）。
- `Map.pathSize` = **path 纹理像素**；换算靠 `GetCorrespondingPixel` / `GetCanvasPixelByMapPos`（`Map.cs:166-186`）。
- `Map.cs:122-123` 的一条兜底：**没有 path 纹理时**，可行区判定退化成 `x∈[0,960] && y∈[20,540]`。
  ⚠️ 我们今天的桥**没有 path 纹理**（`docs/map/map-design.md §3`）⇒ 这条兜底**看似**就是我们实际在跑的规则（归 M7 记账，本份只引用）。
  ★**但 M7 已纠正**（`docs/map/map-move.md §2.1`）：导航真正调的是 `IsCanvasPathAvailable`，它缺 path 时 `return true`（**全可走**）⇒
  **实际在跑的是"全可走"那一支**，`Map.cs:122-123` 的矩形内框只属 `IsPathAvailable` 那条未被导航调用的路径（父文档 **MC7**）。

### 2.10 ★光口是**有向图**，而且**不是唯一的入口机制**【样本】

> **本轮按解析口径全量枚举**（272 张、393 条，**先剥 `<!-- -->`**）：
> **入边** = 被至少一条光口的 `targetMapId` 指向（自环不改变结论，实测 0 张靠自环）；**出边** = 该图自己的 `<teleport>` 条数。
> ⚠️ 本节初稿记的"零入边 92 张"是**未剥注释**的口径 ⇒ **以 95 为准**（可复现规则就是上面这两行）。

- **零入边 = 95 / 272（≈35%）**、**零出边 = 61**、**两头皆空（光口图上的孤立点）= 54** ⇒ **"没有光口指向"≠"进不去"**，只代表**进它的路不是光口**。
- 这 54 张里 **26 张有 `teleport` 动作出边**（`10012`…`10043` **整批 21 张** + `50001`/`50006`/`50008` + `-30`/`-50`，每张 1–3 条）
  ⇒ 那一族是**"进出全靠 NPC 动作、一张光口都没有"的场景包**（M2 那 **106** 条的成员）⇒ **光口与 `teleport` 动作是两套入口数据**，桥**两样都要产**（**TPI9** 的下半）。
- **剩下 28 张连动作出边也没有**（`3`/`4`/`305`/`83`–`87`/`1100`/`1160`/`1170`/`10103`/`10358`/`10425`/`10457`/`10693`/`50002`–`50005`/`50007`/`50013`/`50017`/`-2`/`-3`/`-4`/`-1100`/`-1160`）
  ⇒ 它们的入口**全在本线之外**（门 / 剧情 / 牧场 / 活动 = **C 组排期 ④** 或 **A 组出局**）⇒ 本线**只保证"传得进、走得出"**，**不许**为此发明入口（**TPQ3** 同口径）。
- **门图实证**：**`82`「经验之门」与 `88`「王者之门」各有一条光口 → `81`「英格瓦要塞」**（**出口是光口**），而 **`83`–`87` 五张门零入零出**
  ⇒ 印证 **门不是光口**（入口另有一套：`activity[door]` 184 条条件 + `openPanel` 的 `<param>Door</param>` 12 处，见 `docs/map/map-npc.md` 动作表第 3 行）；
  本线**不许**把门做成"一种特殊传送点"（记账给门线）。
- **飞船区（`category=1`）= 28 张光口房间图**，零入边 **11 张**，含两张**重名重复房**：
  **`61`「教官室」**（`60` 的重复体：出边 `[70,10]` 与 `60` **逐条相同**，但自己**零入边**）与 **`71`「传送室」**（`70` 的重复体：`resId="70"`、唯一出边 → `60`）
  ⇒ ★**`61`/`71` 在光口图上不可达**（实测也**没有任何** `teleport`/`transport`/`<param>` 入边）⇒ 这一条**直接改写了 TPC5 的"可观察后果"**（那颗畸形按钮长在进不去的 `71` 上）。
- 夜版侧：**`-70`「传送室」的入边是 `50000`「小屋」与 `81`**，而 **`81 ↔ -70` 是全库唯一一对跨日夜的对称光口**（`81 →(传送室) -70`、`-70 →(英格瓦要塞) 81`）
  ⇒ **夜版图不只靠那颗按钮进**（与 §2.5 同口径；`-139`/`-209` 两张梦境图的唯一入边则是 NPC teleport 动作）。
- ⚠️ **对本线的两条含义**：
  ① `targetMapId` **悬空检测**（§3.1）只保证"目标文件存在"，**不保证"目标图能走回来"**；
  ② 双向性**只是数据习惯、不是规则**：对称边 **152 对 / 393 条里的 304 条（≈77%）**，**单向 89 条**（例 `71 → 60` 而 `60` 不指回 `71`）
     ⇒ **我们不建"双向边"校验**（不报错、不阻塞），只把它降级成**桥的只读审计清单**（**TPI9**，见 §5）。

---

## 3. 目标形状（契约）

### 3.1 数据（L2 现场解析记录，落点见 M1）

```ts
// `game/logic/map/parse-map.js` 产出的每一条 MapRecord（本份关心的列；方案 C 起**运行时现场解析**，无 JSON 产物）
interface MapRecordV2 {
  id: number;                 // ← @id（Unity 有；AS3 靠文件名 ⇒ M1 的降级规则）
  name: string;
  initialPos: Vec2;           // ← <initialPoint> 文本 "x,y"（★畸形 ⇒ 登记，不静默落 (0,0)）
                              //   ⚠️ **列名的正本在 M1**：M1 §3.2 因 MDI3（两套坐标系并存）把这两列记成
                              //   `initUnity` / `initAs3` ⇒ **本份写的 `initialPos` ≡ `initUnity`**（内核只读 Unity 那一列）；
                              //   AS3 的**属性形** `initialPoint x/y` ⇒ 只进 `initAs3` + **只读适配器**，**不进传送决议的落点**（§2.6 / **TPQ1**）
  switch: 0 | 1 | -1;         // ← @switch；★其它值 ⇒ 解析期登记 'invalid-switch' ⇒ 归一化成 0（§3.4）
  dream: boolean;             // ← @dream
  teleports: TeleportSpot[];
}

interface TeleportSpot {      // 只此一份真值 = TeleportInfo 的五字段
  id: number;                 // 作用域 = 本图（重复 ⇒ 登记 'duplicate-teleport-id'）
  name: string;               // 出口名（MP8）；空串 ⇒ 登记 'empty-name'
  pos: Vec2;                  // canvas 坐标，左下锚定
  color?: RGBA;               // 缺省 {255,255,255,128}；畸形 ⇒ 白 + 登记
  targetMapId: number;        // ★Unity 血统没有落点字段 ⇒ 这里**不加** destPos（TPQ1）
}
```

⚠️ **畸形登记 = 解析期**（同 M4/DLI2 的口径），因为**图与图都在桥里可得**：393 条 `targetMapId` 全部有文件 ⇒ 悬空检测是**零成本**的。

⚠️ **两类"不阻塞的只读审计"**（与上面四类畸形**不同级** ⇒ 畸形是"数据坏了要归一"，这两类是"数据没坏、只是本线看不全"，**TPI9** / §2.10）：

| 审计名 | 判据 | 期望值（Unity 血统，本轮实测） | 消费方 |
|---|---|---|---|
| `portal-inbound-none` | 没有任何光口的 `targetMapId` 指向它 | **95** / 272 | 门线（C 组排期 ④）· 本线用于"入口不是光口"的分诊 |
| `portal-isolated` | 既无入边**又**无出边 | **54** / 272（其中 **26** 张在 NPC 动作层有出边） | 同上；剩下的 28 张入口**在本线之外**（**TPQ3** 口径：不为此发明入口） |

⇒ 另外**必须有第二张边表**：`actionTeleports[]` = 本图 NPC/对话上的 `<action>teleport</action><param>mapId</param>`（全库 **106** 条，M2 §动作表第 5 行）。
⚠️ **分工不破**：这张表由 **M2 的 L0 解析器**产出（读 M1 桥存的 `handlers` 原始片段），**桥自己不产**（**MDI10**：桥只做结构归一化、不解析语义）——
本条只把"**入口 = 两张边表**"写成契约：**只读光口**会得出"很多图是死图"的错误结论（**TPI9**）。

### 3.2 决议（内核只出这些，执行归编排层）

| 意图 | 触发 | 载荷 | 说明 |
|---|---|---|---|
| `teleport{ mapId, spawn? }` | 抵达光口 / NPC `teleport` 动作 / `GoToMap` | `spawn` 缺省 `null` | ★**`mapId==0` 不再是 `teleport`** ⇒ 出 `notOpen{mapId}` |
| `notOpen{ mapId }` | `mapId==0` | —— | View/A3 按 **R5** 弹「地图暂未开放」；内核**不弹窗**（决议 ③） |
| `mirror{ dir: 1\|-1 }` | 昼夜按钮 | —— | 目标图 = `-currentMapId`；★**`switch ∉ {-1,1}` ⇒ 出 `invalidSwitch`，不传送**（**TPC5**） |
| `walkTo{ pos, onArrive:'teleport' }` | 点击光口（两步的**第一步**） | —— | 交 **M7**；本线只声明"抵达 ⇒ `teleport`" |
| `unreachable{ spotId }` | 72px 环搜索失败 | —— | ★**不硬穿**（**TPC3** 的目标面）：登记 + 日志，**不**一步直达、**不**切图 |

### 3.3 落点规则（唯一一条 + 一个留位）

```
spawn ?? 目标图.initialPos
```
- 【样本】生产侧 0 命中 ⇒ 今天**永远**走 `initialPos` 分支（**照搬**：这是行为不是 bug）。
- `spawn` 的来源**只能是** `changeScene('map', { mapId, spawn })` 的入参（编排线 **OR4**），**不是** `sceneData` 键袋（**TPQ5**）。
- 一次性：消费即清（对齐 `MapManager.cs:47` 的 `RemoveSceneData`，但**改成入参的局部变量**，不存在"忘删"这种失败模式）。

### 3.4 昼夜（镜像图）规则

- `switch` 在解析期**收窄成 `0 | 1 | -1`**（**TPC5** 的 `71` ⇒ 登记 `invalid-switch` 并归 `0` ⇒ **按钮不出现**）。
- `1` 与 `-1` **语义等价**（都表示"这张图有镜像"）⇒ 上游 `Mathf.Abs(...)==1` 已说明这点；我们**保留原值**（给 M3 的 `map.switch` 条件臂用，那条臂要的是**原值**）。
- 目标图 = `-currentMapId`；★**仍要校验目标存在**。【样本】实测 **`abs(switch)==1` 的 44 张图，孪生文件全在**（`switch != 0` 共 45 张，多出的那张就是畸形的 `71` ⇒ 归一化后按钮根本不出现）
  ⇒ **这条校验在发行数据下是纯防呆**，不是"正在坏的路径"，
  但**必须留**：`-139`/`-209`/`-1270` 这三张**没有正号孪生的负 id 图**（梦境图，`139.xml`/`209.xml` 根本不存在）证明了"孪生可以不存在"这件事在数据模型里成立。
  ⇒ 不存在 ⇒ 出 `missingMirror{wanted}`，**不**传送、**不**弹"暂未开放"（那是另一条语义）。
- ⚠️ 那三张梦境图的 `@switch` **属性缺省**（与 `0` 同义）⇒ **它们没有日夜按钮**；
  它们的**入场是 NPC `teleport` 动作**（`1270` → `-1270`、`-131` → `-139` ×3、`-203` → `-209` ×2，实测），**出场是自己的光口**
  （`-139`「荆棘林梦境」→ 光口"荆棘林" → `-131`；`-209` → `-203`；`-1270` →(秘密基地) `1270`）
  ⇒ **梦境是"动作可达的另一层图"，与昼夜无关**。
- ⚠️ **光口会跨日夜**（§2.5：`day→night` **2** / `night→day` **21** / `night→night` **13**；`81 ↔ -70` 是全库唯一一对跨日夜的**对称**光口）
  ⇒ 两条不许：**不许**给光口加"夜版偏移"这类发明，**也不许**假设"夜版只能靠那颗按钮进"（`-70` 有 `50000`/`81` 两条光口入边）。
  **目标口径 = 光口的 `targetMapId` 就是最终答案，`sign` 不参与任何推导**（**TPI4**）。

### 3.5 与 M2 的接缝（`teleport` 动作）

- 动作决议表里 `teleport` 的 param 规则：**`param[0]` = mapId（必填）**、`param[1]` = `spawn`（可选）。
  ⚠️ 上游 `int.Parse(handler.param[0])` **无 try** ⇒ 非数字**整条动作抛**（**TPC2**）⇒ 目标：解析期登记 `bad-teleport-param`，点击期**跳过该条**并日志。
- `param` 为空 ⇒ 上游**直接 return**（`:190-192`，点了没反应）⇒ 目标：登记进 M4/M2 的畸形面（同 M4 §2.6 那条"空 `param` 的 openDialog"）。
- 106 条分布（§2.2 表第 2 行）：**`eventHandler` 65 / `replyHandler` 25 / `callbackHandler` 11 / `functionHandler` 5**
  ⇒ 传送**不只来自光口**，还有 **30 条埋在对话里**（对话内 `<branch>` 的 teleport 动作实测 30）⇒ **M4/M5 的接缝**：
  对话出 `teleport` 决议时**必须先关对话**（会话里 `overlay` 归 null，见编排线 **OR8**），否则切图后盖层还挂着。

### 3.6 施工批草案（**MDB5-a…e**，等 impl）

| 号 | 内容 | 依赖 |
|---|---|---|
| **MDB5-a** | 现场解析器（方案 C）：Unity 血统的 `initialPos`（文本形）/ `switch` / `dream` / `teleports[]`（含 `@color`）+ **解析期四类登记**（duplicate-teleport-id / empty-name / invalid-switch / 悬空 targetMapId） | **M1** |
| **MDB5-b** | `teleport` / `notOpen` / `mirror` / `unreachable` / `walkTo` 五个决议 + 决议表里 `teleport` 的 param 校验 | **M2** 动作决议表 |
| **MDB5-c** | 两步走的**抵达回调**接进现有 `mapWalk` 事件（我们已有 `d.teleport` 字段，`mapScene.js:451`） | **M7** 结论 |
| **MDB5-d** | 昼夜按钮（`switch` 收窄后才显示）+ 镜像校验 + `missingMirror` | A1/B3 的顶栏位 |
| **MDB5-e** | 把 `spawn` 改成 `changeScene` 入参（**删** `mapInitPos` 键袋方案） | 编排线 **OR4** / **ORB3** |

---

## 4. 数据流（一张图）

```
Unity <map @switch @dream> <initialPoint>x,y</initialPoint> <entities><teleport @id @name @pos @targetMapId [&#64;color]>
        │
        └─解析(M1/现场解析器)──► MapRecord { initialPos, switch∈{0,±1}, teleports[] }   (+畸形登记：dup-id/empty-name/invalid-switch/dangling-target)
                                        │
   点击光口 ──► walkTo(pos, onArrive='teleport')  ──M7：72px 环形搜索最近可达格──► 抵达
        │                     └─ 搜不到 ⇒ 'unreachable'（★不一步直达，修 TPC3）
        ▼
   决议 teleport{ targetMapId, spawn: null }
        │
        ├─ targetMapId==0      ⇒ 'notOpen'      ⇒ A3/R5 弹「地图暂未开放」（内核不弹）
        ├─ targetMapId==50000  ⇒ ★目标：直接用 50000（**不查 Activity**，TPC6/TPQ3）
        └─ 其它                ⇒ changeScene('map', { mapId, spawn })   ← 编排线 OR2/OR4
                                     │
                    进图：落点 = spawn ?? 目标图.initialPos（一次性；★不读 sceneData 键袋，TPQ5）
                                     │
   顶栏 Day Night Button（仅 switch∈{±1} 时存在）⇒ mirror{dir} ⇒ 目标 = -currentMapId
                                     └─ 缺孪生 ⇒ 'missingMirror'（不传、不弹"暂未开放"）
```

---

## 5. 不变量（**TPI1–TPI9**）

| # | 不变量 |
|---|---|
| **TPI1** | **两步走是硬序**：点击 ⇒ `walkTo` ⇒ **抵达** ⇒ `teleport`；**不许**点击即切图（父文档 **MP5** 的正本），也**不许**"走不到位就一步直达"（**TPC3**）。 |
| **TPI2** | **落点只有一条规则**：`spawn ?? 目标图.initialPos`；`spawn` **只来自 `changeScene` 入参**，**不进** `sceneData` 键袋（编排线 **OR4**）。 |
| **TPI3** | **光口没有落点字段**：`TeleportSpot` 就是五列，**不许**为了"看起来更准"去嫁接 AS3 的 `targetPos`（**TPQ1**，实测坐标系不同）。 |
| **TPI4** | **昼夜是第二机制**：镜像**只**由 `switch` 驱动，目标 = `-currentMapId` **由代码算出、不写在任何光口/动作数据里** ⇒ 二者**不许混成一套数据**（§2.5）。⚠️ **注意依据不是"光口不跨日夜"**（那条已被实测推翻：跨日夜光口 `day→night` **2** / `night→day` **21** / `night→night` **13**）；可核的硬事实是**孪生边 `X → -X` 全库仅 1 例（`-1270 → 1270`，梦境出口）而日版指向自己夜版 = 0 例**。 |
| **TPI5** | **出口名取自己**：悬浮说明/日志用 `<teleport @name>`，**不取目标图名**（父文档 **MP8**）。 |
| **TPI6** | **畸形在解析期结账**：重复 `@id` / 空 `@name` / `@switch ∉ {0,±1}` / 悬空 `targetMapId` / 畸形 `pos` ⇒ **登记 + 归一化**，**不许**静默落 `(0,0)`、**不许**运行期抛（`Dictionary.Add`、`int.Parse` 都是上游的抛点）。 |
| **TPI7** | **内核不切场景、不弹窗**：只出 `teleport` / `notOpen` / `mirror` / `unreachable` / `missingMirror`（决议 ③ + **MQ4**）。 |
| **TPI8** | **换图会话归零的只有一件**：`currentNpcId`（对齐 `:59`）；**其余跨层状态**（射击模式、HUD 层、`overlay`）**由编排层按 `overlay` 推导**，本线不写（**DLI8** / 编排线 **OR8** 的同一口径）。 |
| **TPI9** | **入口 = 光口 ∪ `teleport` 动作，两样都要产**：272 张里 **95** 张**零光口入边**、**54** 张在光口图上两头皆空，其中 **26** 张的进出**只存在于 NPC 动作层**（§2.10）⇒ 只读光口会把这些图做成"死图"（**本线最容易犯的错**）。⚠️ 同时：**"必须能走回来"不是上游的规则**（对称 **152** 对 / 单向 **89** 条，例 `71 → 60` 而 `60` 不指回 `71`）⇒ **不建双向边校验**，只把零入边/孤立点产成**只读审计清单**（`portal-inbound-none` / `portal-isolated`，与 **TPI6** 同族但**不阻塞、不报错**）。 |

---

## 6. 现状与缺口

| 面 | 今天 | 缺口 |
|---|---|---|
| 桥 | `tools/build-map-index.mjs`：`DIR = 'swf/map/config'` ⇒ **读的是 AS3 那一套**；`teleports[]` = **正则** `<teleport .../>` 抓 `pos/target/id/name`（**没有 `@color`**），`init` = **`x/y` 属性形**（⇒ 换成 Unity 文件就全空） | ⚠️ ★**整条桥要按 Unity 重写**（**MQ1**）：文本形 `initialPoint`、`@switch`/`@dream`、`@color`、**先解析再计数**、四类畸形登记（**MDB5-a**） |
| 产物 | `game/data/maps.json` **259 条**（`id/name/swf/swfOk/fightMap/fightMapOk/weather/init/entities/teleports`） | 缺 `switch` / `dream`；`entities` 只是计数（M1 已记） |
| 光口渲染 | ✅ **已落**：`mapScene.js:33-45` `spotsOf()` + `#portal` 贴图 + 出口名悬浮（`PORTAL_SRC` 用重启的 `teleport.png`，注释里已算清 pivot 差 39.65/21.35） | 无（B3 侧）；⚠️ 但注释"308 条无一带 @color"是 **AS3 口径** ⇒ Unity 有 8 条 ⇒ 换桥后要接 |
| 两步走 | ✅ **已落**：`d.type==='mapWalk'` 事件带 `d.teleport`（`mapScene.js:451`）⇒ 抵达后 `loadWorld` | 缺 `unreachable` 分支（今天会怎么走？——我们的寻路是 path 兜底矩形，见 M7） |
| `teleport` 动作 | ❌ **0 行**（NPC/对话还没有） | 等 **M2** + **MDB5-b** |
| 昼夜 | ❌ **0 行**，且桥里**没有 `switch` 这一列** | **MDB5-a** + **MDB5-d**（★这是"最大可玩缺口"里最容易补的一块：45 张图、26 张夜版） |
| `mapId==0` / `50000` | ❌ 无（桥的 `swfOk===false` 只是"缺图"禁用下拉，不是这条语义） | **MDB5-b** 的 `notOpen`（走 **R5**） |
| 落点 | 今天 `init` 直接用（等价于 `initialPos`） | 换桥后形状不变（**TPI2** 天然成立） |
| **A2 · 缺画面的图（2026-10-19；角色 sprite = A2b）** | ✅ **`swfOk===false` 不再是死路**：`renderMap` 按 `swfOk` 分流 ⇒ 102 张无 AS3 画面的图改由 **L4 JS 回退渲染**（Unity `bg` + **角色 sprite**（A2b：原版小赛尔部件包 JS 合成，替早期黄点）+ Unity 光口归一化，见 `map-impl.md §7.3.7`/`§7.3.8`）；⚠️ **obs-1-a** SWF 路落点改喂 **AS3 `initAs3`**（不再把 Unity `init` 灌进 1200×660 舞台 ⇒ 灭"落地即遭遇"）；⚠️ **obs-3** `mergePortals` 改 **AS3∪Unity 并集**（`990` 的 AS3 `teleports=[]`、Unity 有 3 条 ⇒ 光口现在出）；`worldLoad` 的 `!m` bail 改成**防御位**（缺画面/缺记录的图已由 `renderMap` 分去 JS 路，不再从 SWF 路被静默拒）；**TPQ3** 的 `50000`/`1010`/`90` 经传送**可进图** | JS 路**不画实体**（NPC/野怪/农场，B3 围栏）· **无寻路 / 静态相机**（MB8 搁置同口径）· **Y 翻转 + `ACTOR_SCALE` 待人眼校**（`flipY` 开关 / 角色尺度） |

【实测】`game/` 全仓搜 `switch` / `dayNight` 的传送语义 = **0 处**；`mapInitPos` 这个键**我们根本没有**（我们的入场参数走 `router.go(name, params)` 的 query，**已经**是 OR4 的形状）⇒ **§3.3 我们是零迁移成本达标**。

---

## 7. 怪癖登记 · 待拍板 · 等人手测

### 7.1 上游代码 bug / 危险设计（**TPC1–TPC9** · 按 `AGENTS.md §2`：**声明 + 不照搬**；⚠️ **TPC9 在 §7.2 末的补行**，不重号）

| # | 登记（`路径:行` + 症状 + 发行数据里的可观察后果） | 目标 |
|---|---|---|
| **TPC1** | **`teleportList.Add(info.id, teleport)`**（`TeleportHandler.cs:14`）用 `Dictionary.Add` ⇒ **同图重复光口 id 直接抛**。【样本】Unity **0 例**（未爆）；**AS3 4 张**（`101090`/`3825`/`3827`/`3828` 各两条 `id="1"`）⇒ 只要桥肯读 AS3 就爆 | 解析期登记 `duplicate-teleport-id`；运行期**不抛**、两个光口都画（**TPI6**） |
| **TPC2** | **`int.Parse(handler.param[0])`**（`NpcActionHandler.cs:193`）**无 try** ⇒ 非数字 mapId 让**整条动作**炸在点击期；`param` 为空时上游是**静默 return**（`:190-192`，点了没反应） | 解析期登记 + 点击期**跳过并日志**（同 M2 的畸形口径） |
| **TPC3** | **传送会"一步直达"不可达的光口**（`PlayerModel.cs:62-76` + `:41-54`）：72px 搜不到 ⇒ 用原点；有视线 ⇒ 单点路径；A* 失败 ⇒ 空 path **被补成单点** ⇒ **穿到不可行走区再切图**。原因：**`Transport` 永远传 `onArrive`**，把所有"该放弃"的分支变成了"硬走" | 搜不到 ⇒ `unreachable{spotId}` + 日志，**不切图**（**TPI1**） |
| **TPC4** | **一个 22 行的静态函数写穿三层**（`TeleportHandler.cs:41-62`：弹窗 + `Activity` 查表 + `Player` 全局会话 + `SceneLoader.ChangeScene`）⇒ 传送没有"决议"这一层，**无法单测、无法被内核复用**（**MQ4** 要的形状它给不了） | 内核只出决议；执行归编排层（**TPI7**） |
| **TPC5** | **`switch` 只按 `Abs()==1` 判，其它值直接当 mapId**（`:65`）。【样本】`71.xml`「传送室」`@switch="71"` ⇒ 那颗日夜按钮**可见**（它是 `Day Night Background` 的子对象，而背景 `SetActive(71 != 0)` ⇒ 显示）⇒ **点它 = `Teleport(71)` = 重进当前图**（全仓 45 张有 `switch`，**这是唯一 1 例**）。⚠️ **本轮把"可观察后果"往下修了一格**：**`71` 这张图在发行数据里走进不去** —— 实测**零光口入边**、且**无任何** `teleport`/`transport`/`<param>` 入边（它是 `70`「传送室」的重复体，`resId="70"`、唯一出边 → `60`，§2.10）⇒ **这条 bug 在正常游玩里观测不到**，它只在"硬编码/未来的入口"把玩家放进 `71` 时才会显形。**同族**：`61`「教官室」（`60` 的重复体）也**零入边** | 解析期收窄 `switch ∈ {0,±1}` + 登记 `invalid-switch`；非 ±1 ⇒ **按钮不出现**（**§3.4**）。⚠️ 收窄**照做**（不因"观测不到"而省）：它是**解析期纪律**（**TPI6**），且我们在 §3.4 的 `missingMirror` 校验要靠**收窄后的值**才不误报 |
| **TPC6** | **传送里嵌活动/Mod 查询**（`:50-54`：`Activity.Find("mod_home").GetData("map_id")`，`TryParse` 失败静默兜回 50000）⇒ `TeleportHandler` 依赖**活动线**（**2026-10-19 前记 A 组出局；现活动线已立 = `docs/view/panel/activity/`，但本覆盖位经其本份已拍板 ACQ3 仍不接线**）；且"兜回"让**错值不可见** | 目标：`50000` **直接当普通图**（`50000.xml` 确实存在、`category=200`、有 NPC 有光口）；`mod_home` 那条查询**不实现**，只在 §9 给活动线留一条"存在此覆盖位"的记账（**TPQ3**） |
| **TPC7** | **`mapId==0` 一身两职**：`Map.cs:40 IsMod = (id < -50000) \|\| (id == 0)` ⇒ `0` 既表示"未开放"又被判为 Mod 图 ⇒ `Database.cs:117-118` 因此**不缓存**任何 `id==0` 的"图" | 目标：`0` = **保留哨兵**（"未开放"），**不参与** Mod 判定（Mod 只看 `id < -50000`）；两者在桥里都归一化成显式字段 |
| **TPC8** | **`ToFloatList` 静默丢段 + `ToVector2` 回落 `(0,0)`**（`Helper.cs:177-195` `:250-254`）：不可解析的段被**跳过**（`"1,x"` ⇒ list 长度 1 ⇒ 整个回落），`"a,b,c"` ⇒ **只剩两个数**（第三段消失）。⇒ 畸形 `pos` / `initialPoint` **叠到左下角，无日志**。【样本】Unity 393 条 `pos` + 272 条 `initialPoint` **全部合法 ⇒ 未爆**；但**按 Unity 规则读 AS3 就会全爆**（AS3 的 `initialPoint` 文本恒空） | ★**桥不共用这条兜底**：畸形 ⇒ **登记 + 该条数据不产出**（`TPI6`）；`pos` 域校验（canvas 内）在解析期做 |

⚠️ **两条"未爆的脆弱规则"要显式声明**（避免下轮被当成新发现）：**TPC1** / **TPC8** 在 **Unity 血统里都是 0 命中** —— 它们不是"正在发生的错误"，是"桥一换血统就会发生的错误"。这与 **M4/DLC5**（附挂 idx0，实测 0 命中）同一口径。

### 7.2 待拍板（**TPQ1–TPQ5** · 本线局部编号 · 依人类常设指示「都按你的建议来吧」**已采纳建议并标 ✅**）

| # | 问题 | 决议（采纳建议） |
|---|---|---|
| **TPQ1** | **要不要把 AS3 的 `targetPos`（219 条精确落点）嫁接到 Unity 光口上**，以补"传过去总落在出生点"的观感缺口？ | ✅ **不嫁接**。依据【样本】：交集 135 张里可配对 **169** 对，**169/169 全部相差 >4px**，且 `pos` 值域一个是 `880×455`、一个是 `1121×611` ⇒ **两套坐标系**，嫁接等于把点放到图外。落点规则保持 **§3.3** 一条（`initialPos`），**并照搬**上游"光口不带落点"这一行为（是行为不是 bug）。⚠️ AS3 的 `targetPos` 作为**只读适配器字段**留在 M1 的另一份表里，不进内核 |
| **TPQ2** | **昼夜镜像做不做？**（要新增 `switch` 列 + 一颗顶栏按钮 + 26 张夜版图） | ✅ **做**，而且**排在光口之后第一件事**：这是"最大可玩缺口"里**最便宜**的一块（数据 45 张图、代码只有 `SwitchDayNight` 那 4 行语义）。目标附带两条改进：**`switch` 收窄 + 缺孪生不传**（**TPC5**/**§3.4**）。⚠️ 记一条**行为差异**给人确认：镜像**不是**"同一张图换滤镜"，是**换一张图**（`-131.xml` 与 `131.xml` 是两份数据） |
| **TPQ3** | **`50000`「小屋」与 `1010`「普兰特牧场」在不在范围内？**（**A 组出局**里有"牧场"） | ✅ **光口照传**：`50000.xml` / `1010.xml` 本身是**普通可玩地图**（有 `initialPoint`、NPC、光口），出局的是它们的**子系统面板**（牧场玩法）。⇒ 本线**只保证"能传进去、能走出来"**；`mod_home` 的活动查表**不实现**（**TPC6**）。⚠️ 这条要给 `docs/architecture.md §1.1` 补一句澄清（§9 回执），避免下轮被读成"顺手实现了牧场" |
| **TPQ4** | **`mapId==0` 的"暂未开放"还留不留？**（发行数据 **0 条**能触发） | ✅ **留，但降级**：留成一条**决议** `notOpen`（**TPI7**），因为硬编码调用方（`NoobIntroController`、`Panel.cs:90`）仍可能传 0；⚠️ **不**为此建 UI 文案的副本，文案归 **A3/R5** 的一处 |
| **TPQ5** | **`mapInitPos` 这个键袋键要不要照搬到我们这边？** | ✅ **不照搬**：改成 `changeScene('map', { mapId, spawn })` 的**入参**（编排线 **OR4**）。依据：【样本】生产侧 **0 命中** ⇒ 迁移成本为零；而键袋方案有三个已知失败模式（忘 `Remove`、跨场景残留、`OR1` 违规）。⚠️ 同族的两条死键一并记账：**`mapTeleportList`**（`MapSceneView.cs:477` **写而不读**，且换图不清 ⇒ 挂着一批已销毁的 `GameObject`）（**TPC9**，见下表补行） |

补一行登记（拍板过程中新报的，编在 **TPC** 尾部不重号）：

| # | 登记 | 目标 |
|---|---|---|
| **TPC9** | **死键 `mapTeleportList`**：`MapSceneView.cs:477` 每次装配光口都 `Player.SetSceneData("mapTeleportList", teleportDict)`，**全仓无任何读取方**（grep 仅 1 处命中 = 这次写），而 `Teleport` **不清它** ⇒ 换图后键袋里挂着一本**指向已销毁 GameObject** 的字典。⚠️ **同族一共 3 条死键**（本轮按字面量全量枚举 `Player.(Set|Get|Remove)SceneData("…")`：袋里 **10 个键、3 个有写无读**）：除本条外还有 **`PetSelect`**（`PetSelectHintboxController.cs:13` 写的是**选中的 Pet 对象**，而**融合**读的是**相邻那条键** `PetSelectIndex`，`FusionModel.cs:31/38` ⇒ 对象版本从来没人拿）与 **`is_mod_exist`**（`ResourceManager.cs:57` 写、0 读）。⇒ **"一个袋子里一半活着、一半死了，而袋子的 API 看不出差别"** | 目标：**不建这个键**；光口集合是**场景局部数据**（随 `unmount` 生灭），需要时由场景自己持有（**OR1**） |

### 7.3 等人手测确认的具体项（决议 ⑦：主验收 = 人类把游戏跑起来手测）

1. **先测已经通的那条**：进 `#/map`，图 `100`「信奉广场」→ 两个光口悬浮说明应是 **`草系主城` / `水仙草界`**（出口名，不是目标图名，**MP8**）→ 点一个 → **走过去 → 抵达才切图**（**TPI1**）→ 新图**站在出生点**（**TPI2**）。
2. **出生点是否合理**：连续传 3–4 张图，看角色是否**总落在出生点、偶尔离出口很远**（这就是 **TPQ1** 决定"不嫁接"的代价）⇒ **这条最需要人眼判断能不能接受**；若不可接受，重开 **TPQ1**（不是改数据，而是给 Unity 血统补一列我们自己定的 `spawn`，那时要另立决议）。
3. **昼夜（**TPQ2**，落地后测）**：进 `131.xml`（有 `switch`）→ 顶栏应出现那颗 25×25 的日夜按钮 → 点它应到 **`-131`「荆棘小徑」夜版**；再点回白天。⚠️ **同时测一张没有 `switch` 的图**（如 `100`）⇒ 期望**按钮不出现**。
4. **`71.xml`「传送室」**（**TPC5** 的那 1 例）：⚠️ **本轮实测这张图走进不去**（零光口入边、也没有任何 NPC 动作入边，§2.10）⇒ **这条不作为手测用例**（没法玩到）。
   改成两件事：① **由 §7.1/TPC5 的声明兜住，不阻塞、不记死账**（决议 ⑦ 的口径）；② 请人在**桥的解析期日志**里**看一眼那一行 `invalid-switch: 71`**（`switch=71` 被归一成 0 ⇒ 按钮不出现）就算验收；
   ⚠️ 顺带请人**确认可接受度**（"若哪天真把玩家放进 `71`，按钮消失 vs 照上游点了重进本图"——另一选择要改 **§3.4**）。同族的 `61`「教官室」同理（也是零入边重复体）。
5. **梦境图**（`-139`「荆棘林梦境」/ `-209`「幻彩珊瑚梦境」）：这两张**连 `@switch` 属性都没有**（实测缺省，与 `switch=0` 同义）⇒ 期望**日夜按钮不出现**；
   它们的回场走**自己的光口**（`-139` → `-131`、`-209` → `-203`）⇒ 请人**从梦境图点光口回夜版**，确认这条链在桥重写后仍通。
   ⚠️ **反向要等 M2**：进这两张图的**唯一**入边是**夜版图上的 NPC `teleport` 动作**（`-131` 上 3 处、`-203` 上 2 处，实测）⇒ **"进梦境"这条链今天还测不了**（NPC 未落地），**别记成死账**：等 **MDB5-b** 后按 §2.10 测。
   顺带一条给人"看一眼就行"的：`missingMirror` 这条路**在发行数据里没有任何触发点**（`abs(switch)==1` 的 44 张孪生文件**全在**，畸形的 `71` 已被归一 ⇒ 实测 0 例）⇒ **不需要**为它设计用例，只要别把它当"已知会发生的错误"。
6. **`990.xml`「普兰特山脚」**：光口「基地」→ `50000`「小屋」应当**正常进图**（**TPQ3**：不查活动、不弹"暂未开放"）；小屋里的光口（→ `-70`）也要能走。
7. **不可达光口**（**TPC3**）：找一张 path 纹理缺失/光口落在障碍区的图（我们的兜底矩形 `x∈[0,960]&&y∈[20,540]` 下不容易造出来，可能**测不到**）⇒ 若测不到，就把这条记成"由 §7.1/TPC3 的声明兜住，不阻塞"，**别当成死账**。
8. **光口不是唯一入口**（**TPI9** / §2.10）：桥重写后（**MDB5-a**）请人**核对一次那两个数** —— 解析日志里的 `portal-inbound-none` 应 = **95**、`portal-isolated` 应 = **54**（其中 26 张的出边在 NPC 动作层）。
   对得上 ⇒ **两张边表都产全了**；对不上 ⇒ 十有八九是**注释没剥**或**只抓了 `<teleport .../>` 自闭合形**（§2.6 那两条口径）。⚠️ "从 `10012` 这类场景包图**用 NPC 动作进出**"那条**要等 M2 落地才测得了**，今天**只核数、不测玩法**，也别记成死账。

---

## 8. 配对 `impl` / `code-map`

⚠️ **阶段一续**（所有 `design` 定稿后统一编，`AGENTS.md §1` 第 2 条）—— ✅ **已完成（2026-10-18）**（其 `MIP1–MIP4` 四条已由人类 2026-10-18 结账）：
`docs/map/map-impl.md` 吸收 **MDB5-a…e**（`MDB5-a` 折进它 §2 的 **MB1**、`MDB5-b…e` = **MB5**）；`map-code-map.md` 的落点表把 §3.1/§3.6 换成实际文件。
（★本线**已有落地代码**：`game/app/scenes/mapScene.js` 的光口与两步走、`tools/build-map-index.mjs` 的正则桥 ——
impl 的**第一件事已按本节要求做完**：**把这两处写成 as-built**（`docs/map/map-impl.md §7.1`），
其中桥的"改读 Unity"是**破坏性变更**，**重生成序列**给在 `docs/map/map-impl.md §7.2`。）

---

## 9. 本份对父文档 / 同线文档的回执

| 对象 | 本份要改的 | 状态 |
|---|---|---|
| 父文档 **§2.1 定量** | `<teleport>` **433 → 393**（Unity，差 40 在注释）；★父文档这一行的口径混了两套血统 —— **AS3 是 301/308** | ✅ **已合并**（父文档 §2.1 实体行已改成"解析 / 含注释"两列并标血统 + 新增「传送面的血统差」一行） |
| 父文档 **§2.9**（传送真值） | ①`TeleportInfo` **五字段、无落点**（原文没写这条，而它是 §3.3 的依据）；② `Transport` **失败仍一步直达**（**TPC3**）；③ `SwitchDayNight` 的 `Abs()==1` ⇒ **非 ±1 当 mapId**（**TPC5**，实测 1 例）；④ `mapInitPos` 在发行数据下**永不被写**（**§2.4**）；⑤ `mapId==0` **0 条**可触发 | ✅ **已合并**（父文档 §2.9 五条真值全落，并**同轮追加**两条：`TPC5` 的后果因 `71` 零入边而**观测不到**、"光口不跨日夜"被**推翻** ⇒ 换成"孪生边 `X→-X` 仅 1 例"） |
| 父文档 **§2.1 两套血统表** | ★新增一行：**光口的坐标系不同**（Unity `880×455` / AS3 `1121×611`，169/169 配对全差 >4px）+ `initialPoint` **属性形 vs 文本形** + AS3 **`targetPos` 独有** | ✅ **已合并**（**MQ2 素材对齐**与**桥重写**都引用这条） |
| 父文档 **MP5 / MP8** | **MP5** 加例外口径：上游在"光口不可达"时会**一步直达** ⇒ 我们的"不许瞬移"**更强**（`unreachable`）；**MP8** 的"308 条里 25 条不同、1 条为空"标成 **AS3 口径**，Unity 侧是 **393 条全有名 / 162 个不同值** | ✅ **已合并**（MP8 的 Unity 侧实测补齐：相同 373 / **不同 20**，含每一条飞船出口） |
| 父文档 **§9.1 子设计表** | **M5** 行 ⬜ 待写 → ✅ 已成文（待评审） | ✅ **已合并** |
| **M1** `map-data.md` | 现场解析器的**列清单**：`initialPos`（文本形）/ `switch`（收窄 `0\|±1`）/ `dream` / `teleports[]` 五列 + **四类解析期登记**；另：AS3 的 `targetPos`/属性形 `initialPoint` **只进只读适配器**，不进内核表 | ✅ **已合并**（M1 §3.2 后新增**第 3 条**：`portal-inbound-none` / `portal-isolated` 两类**只读审计**，与四类畸形**不同级**） |
| **M2** `map-npc.md` | 动作决议表里 `teleport` 一行：`param[0]` 必填 + `int.Parse` 无 try（**TPC2**）+ **106 条全部 1 param** 这条实测分布 | ✅ **已合并**（并追加 ★"这 106 条是入口图的第二张边表"⇒ **TPI9** 的落地依赖） |
| **M3** `map-condition.md` | `map.switch` / `map.dream` 两个条件臂的**取值真值**：`Map.cs:189-201` 的**八个可读键**（`id/resId/weather/category/world/switch/dream/anim`）+ `_ => 0` 兜底 | ✅ **已合并**（A2 `map.<k>` 行已扩写成八键 + `@switch`/`@dream` 实测分布） |
| **M4** `map-dialog.md` | 对话里的 `teleport` 出路 **30 条** ⇒ 决议 `teleport` 时**先清 `overlay`**（编排线 **OR8**） | ✅ **已合并**（M4 状态机图后新增 ⚠️ 段：30 条 = reply 25 + func 5，且**同样不带落点**） |
| **M7** `map-move.md` | 72px 环形搜索的**调用面**（`TryFindNearestReachablePoint` 的环只遍历"恰好在环上"的格、`distanceSquared >= best` 的比较次序）+ **我们没有 path 纹理 ⇒ 实际在跑 `Map.cs:122-123` 的矩形兜底** | ✅ **已合并**（M7 已成文并接走：三套坐标/单位进 `map-move.md §2.1`、72px 抵达判定进 §2.4；M7 另**纠正**"实际在跑矩形兜底"——导航真正调的是 `IsCanvasPathAvailable` 的 `return true`（**全可走**），矩形内框只是 `IsPathAvailable` 那一支，见 M7 §2.1 / 父文档 MC7） |
| **编排线** | ① **OR4** 的实例：`spawn` 走入参、`mapInitPos` 键袋**不照搬**（**TPQ5**）；② 死键 **`mapTeleportList`**（**TPC9**）作为"**反面例**"进它的会话状态表；③ `MapManager.LoadPlayer` 每次进图 `isShootMode=false` 这条**跨层副作用**与 **ORC4** 同族但不同处 ⇒ 请它收进 §2.9 的同一张表 | ✅ **已合并**（编排线 §2.3 键袋表 + **新增 §2.10 ORC5** + §7 人手测第 7 行） |
| **`docs/architecture.md §1.1`** | **TPQ3** 的澄清：光口**指向** A 组出局图（`1010` 牧场 / `50000` 小屋）时**照传**，出局的是**其子系统**；建议 §1.1 补一行注 | ✅ **已合并**（§1.1 A 组表后新增「**出局 = 子系统，不是地图**」注，含实测 `990 → 50000/1010` 各 1 条 + `1010` 15 只动物 / `990` 12 块农田照录不实现动词） |
| **门线**（C 组排期 ④，**尚未立**） | §2.10 给的三条入口证据：**`82`/`88` 两扇门有光口出边（→ `81`）、`83`–`87` 五扇零入零出**；`activity[door]` **184** 条条件；`openPanel` 的 `<param>Door</param>` **12** 处 | ✅ **已记账**（本行就是那条指针；`docs/architecture.md §1.1 C 组` 成文时引这里。⚠️ 门线**不许**回头把门改成"一种特殊光口"） |

⚠️ **本表 13 行已全部结账**（M7 已成文，接走了 §2.9 的"三套数"与本表 M7 行）⇒ **M5 的回执到此为止**。
