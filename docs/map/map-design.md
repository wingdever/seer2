# 地图线 · 总设计兼导读（map-design.md）

> **定位**：本线回答**"地图里有什么 / 遇到它会发生什么 / 怎么走到下一张图"** —— 地图**表**（图 id / 分类 / 素材 /
> 通行面）、**七类实体**（传送 / NPC / 农场 / 动物 / 池塘 / 虫巢 / 巢）、**NPC 的事件模型**（条件 → 动作）、
> **对话**、**传送**、**地图触发的战斗**、**移动 / 几何 / 寻路**、**漫游 NPC**。
>
> **父文档** = `docs/architecture.md`（§1.1 范围记账 · §2 分层 · §4 指针表）；
> 分层与依赖硬规则 = `docs/arch-code.md §1/§2/§3`；文档形态 / 配对 / 证据标注 = `docs/arch-docs.md §2`。
>
> **邻线（只借不抄，各归各的正本）**：
> - **渲染那一半 = B3** `docs/view/scene/room/view-scene-map-content.md` —— 背景 / 遮罩 / 实体**表现** / 角色 / 相机 /
>   点击反馈 / 寻路虚线预览 / 野怪脚标 / **传送点光口与出口名**（**已落**）。本线**只管规则与数据**，**不重画任何一层**。
> - **房间 HUD + 角标 = B1** `docs/view/scene/room/view-scene-hud-design.md`；**面板族 = C1/C2** `docs/view/panel/view-panels-*.md`；
>   **浮层原语 = A3** `docs/view/mech/view-overlays.md`（`InfoPrompt` / 提示盒）。
> - **跨族正本（战斗数值拆分）= `docs/view/battle-split.md`**（SP 族）。
> - **战斗怎么跑 = E 线** `docs/engine/battle-engine-design.md`（+ E1–E7）；本线只负责**"从地图数据解析出战斗规格"**
>   并交给战斗宿主（E6 `docs/engine/battle-engine-session.md`）。
> - **条件 / 动作要读写的域对象**：宠 = D6 `docs/domain/domain-pet.md`、道具 = `docs/item/item-design.md`、
>   效果 / 算子 = D3 `docs/domain/domain-effect.md` + E4 `docs/engine/battle-engine-effects.md`、
>   求值面 = D0 `docs/domain/domain-design.md`（接缝清单）。
> - **写盘 / 弹窗 sink = 运行时线** `docs/runtime/runtime-components-design.md`（**R3 存档读写面 / R4 写盘 sink / R5 提示弹窗 sink / R7 内容表注册**）
>   + **编排线** `docs/orchestration/orchestration-design.md`（**宿主**：`Player` = 会话单例、场景切换、`mapInitPos` 这类 `SceneData`）。
> - **纯整数排序助手 = D7** `docs/domain/domain-info.md §5 G12`（`GetSortPriority`，本线**不用**；列此仅说明邻接）。
>
> **状态**：✅ 已写；**§7 的 MQ1–MQ8 已拍板（人类 2026-10-17 常设指示「都按你的建议来吧」⇒ 八条全部采纳建议）**。
> 配对 `docs/map/map-impl.md`（落地计划）与 `docs/map/map-code-map.md`（代码地图）—— ✅ **已成文（2026-10-18）** 且 ✅ **四条拍板（`MIP1–MIP4`）已由人类 2026-10-18 全部结账**（见 §9.1.1）⇒ **本份即可作施工依据**；
> 子设计 **M1–M8 全部已成文**（§9.1）⇒ **本线 `design` 已齐**。⚠️ ⏸ **M7 的通行面随拍板 ② 搁置**（§9.1.1 ②）。
> ⚠️ **M8（`map-actor-look.md`，2026-10-20）是资料索引 / 候补子设计**：讲**角色穿戴装备与骑乘坐骑**的上游源码 / 数据链 / 素材 / 渲染规则，**`MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落（e = 素材清单 + 缺包日志，f = SWF 叠层，g = 存档 `<equip>`）· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**；
> **人类 2026-10-20 已拍板 `ALQ1=A`（存档加 `<equip>`）/ `ALQ2=B`（SWF 图叠 canvas 角色）**，`ALQ3–ALQ8` 按建议默认；**M8 impl 计划 = `docs/map/map-impl.md §3.10`（`a` 的 as-built = `§7.3.15`）**。它不改变 M1–M7 的边界与已落批。
> ⚠️ **本轮（2026-10-17）随 M5 `docs/map/map-teleport.md` 合入的增量**：§2.1 血统表**加一行"传送面的血统差"**＋光口**坐标系不可嫁接**（169/169 全差 >4px）＋
> `<teleport>` 433 ⇒ **393**（新纪律的又一例）＋§2.9 改**导读**并补五条真值＋**MP5 加 `unreachable` 决议**＋**MP8 两套口径都核过**。
> ⚠️ **本轮（2026-10-17）随 M6/M7 合入的增量**：§2.10/§2.11/§2.12 各补 **✅ 正本指向**（M6 `map-battle-trigger.md` / M7 `map-move.md`）＋
> ★**纠正两处**（M6 的"野怪谓词恒假"⇒ **实测 110/110 为真**；Unity 定量改**解析口径**）＋**MP6 补精确内框**（`x∈[0,960] ∧ y∈[20,540]`）＋§9.1 M6/M7 两行 ✅。
>
> **立线依据** = `totalk.md` **T2·2**（清单 C，**建议排期 ①**；`docs/architecture.md §1.1` 记为「**最大可玩缺口**」）；
> `docs/domain/domain-design.md:63` 曾把写侧推给"编排线" ⇒ **本份即那个悬空箭头的着落**（编排线只管**宿主**，不管**地图语义**）。
>
> **编号纪律**：`MP1–MPn`（不变量）/ `MC1–MCn`（上游怪癖·危险设计）/ `MQ1–MQn`（待拍板）/ `MB1–MBn`（施工批）
> **全是本线局部编号**，**不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）。
>
> **目录口径**：线名 `map`（`docs/map/`）；本线文档 = `map-design.md` / `map-impl.md` / `map-code-map.md`
> （子设计 `map-*.md`，地图 = `M1–M8`，见 §9）。

---

## 0. 这份文档回答什么

1. **地图线的边界在哪**（§1）—— 与 B3（渲染）、E 线（战斗）、编排线（会话宿主）、C2（面板）的交界。
2. **上游真值是什么**（§2）—— **★两套血统**（AS3 爬取件 vs 重启 Unity 件）的**逐件行号实测**；
   本线的**基石对象** `NpcButtonHandler`（**条件 → 动作**）；**18 种动作**；**条件 DSL 的命名空间与算子**；
   对话 / 传送 / 战斗触发 / 移动几何 / 漫游 NPC 六块的形状与频次。
3. **我们今天的真实状态**（§3）—— **实测**：`maps.json` 只有传送点；**NPC / 对话 / 战斗触发 = 0 行**；
   `game/core/**` 里 **0 个地图对象**。
4. **目标形状与落点**（§4）—— `game/core/map/**`（纯函数）+ `game/logic/map/**` + **新建一条数据桥**。
5. **不变量 / 上游怪癖 / 决议表 / 人手测项 / 施工批**（§5–§9）—— §7 的 **MQ1–MQ8 已拍板**。

---

## 1. 范围与边界

### 1.1 圈里（本线负责）

| 块 | 内容 | 上游落点 |
|---|---|---|
| **图与实体数据** | 图 id / 名字 / 分类 / 天气 / 初始点 / **昼夜开关** / 战斗背景图 / 素材名 / 通行面 / **七类实体表** | `Map.cs`、`MapEntities.cs`、`Resources/Data/Maps/*.xml` |
| **NPC 事件模型（★基石）** | `NpcButtonHandler` = **条件 → 动作**；5 种 UI 事件；`callbackHandler` 的自定义标签 | `NpcButtonHandler.cs`、`NpcHandler.cs` |
| **条件 DSL** | 6 算子 + 命名空间（`random` / `map.` / `npc()` / `firstPet.` / `petBag` / `player.` / `data.` / `item[]` / `activity[]` / `mission()` / `battle.` / `yite_rogue.` / `plant.` / `animal.`） | `NpcConditionHandler.cs`、`Operator.cs`、`System/Parser/Identifier.cs` |
| **18 种动作的语义** | `setNpcParam` / `openHintbox` / `openPanel` / `openDialog` / `teleport` / `setItem` / `getPet` / `removePet` / `setPet` / `evolvePet` / `setMission` / `setActivity` / `battle` / `player` / `mail` / `fish` / `miniGame` / `callback` | `NpcActionHandler.cs` |
| **对话** | `DialogInfo` + `<branch>` / `<content>` / `<reply>` / `<func>`（**`<func>` 就是按钮**） | `DialogInfo.cs`、`NpcActionHandler.OpenDialog` |
| **传送** | 走位 → 抵达 → 切图；**昼夜镜像图**；**未开放 / mod_home**；`mapInitPos` | `TeleportInfo.cs`、`TeleportHandler.cs` |
| **地图触发的战斗** | `<battle>` 分支 + 阵容（`BossInfo`）+ `winHandler`/`loseHandler`（**又是按钮链**） | `BattleInfo.cs`、`BossInfo.cs` |
| **移动 / 几何 / 寻路** | path 纹理判可走、多边形碰撞、A* + 足印 + 视线 + 路径平滑 | `Map.cs:113-163`、`MapGeometry.cs`、`MapNavigator.cs` |
| **漫游 NPC** | 走动（A* + 卡住检测）/ 气泡（文字 / 图）/ 行为编排 | `MapWildNpc*`（5 件） |

### 1.2 圈外（四条边界 · 明确不越界）

| 边界 | 归谁 | 理由 |
|---|---|---|
| **地图层的视觉**（背景 / 遮罩 / 角色 / 相机 / 光口 / 脚标 / 中文补描） | **B3** `docs/view/scene/room/view-scene-map-content.md` | 判据已拍板：**依赖 SWF 素材 → AS3**；**在舞台坐标上画 DOM / 文字 → 重启**。本线**只出数据与规则** |
| **战斗怎么跑**（阶段 / 伤害 / 判定 / 结算 / 动画） | **E 线**（E1–E7）+ `docs/view/battle-split.md` | 本线只出 `BattleSpec`（阵容 + 设置 + 胜负动作链），**不进战斗循环** |
| **会话宿主**（当前图是哪个、场景怎么切、`SceneData` 存哪） | **编排线** `docs/orchestration/orchestration-design.md` | `Player.instance.currentMap` / `SetSceneData` / `SceneLoader.ChangeScene` 都是宿主职责 |
| **面板与提示的渲染**（`openPanel` / `openHintbox` 长什么样） | **C2** + **A3** | 本线只出**结构化规格**（面板名 / 键值对 / 提示规格） |
| **写盘**（`SaveSystem.SaveData`） | **编排线 / 运行时线 R4** | 决议 ③：核心层只调接口 |
| **活动 / 任务 / 邮件 / 小游戏 / 钓鱼 / 牧场** | **`docs/architecture.md §1.1` A 组（出局）** | ⚠️ **动作枚举与参数形状照录**（数据要能解析、不抛），**执行记"未实现"**，见 **MQ6** |

> ⚠️ **一句话边界**：**本线 = 地图的"名词"与"会发生什么"，不是它的"画面"**（画面 = B3）**也不是"打起来之后"**（= E 线）。

---

## 2. 上游真值（逐件 · 行号实测）

### 2.0 全貌

**上游份量**（实测）：

| 目录 | 件数 / 行数 |
|---|---|
| `Scripts/Scene Specific/Map/**` | **23 文件 / 4,211 行** |
| `MVC/Controller/Map/**`（+ `Utility/Dialog/NpcController.cs` 153） | 9 / 716（+153） |
| `MVC/View/Map/**` | 8 / 1,094（**= B3 的地盘**） |
| **合计（T2·2 记账）** | **40 / 6,021** |

**Map 目录内逐件**（行数降序）：

| 文件 | 行 | 本线归属 |
|---|---:|---|
| `Entities/Dialog/DialogManager.cs` | 616 | **★大半是剧情**（见 §2.8 · MQ/边界） |
| `Entities/Npc/NpcActionHandler.cs` | 481 | ✅ 18 动作 |
| `Entities/Npc/MapWildNpcTalkController.cs` | 392 | ✅ 漫游气泡 |
| `MapNavigator.cs` | 377 | ✅ A* + 足印 + 平滑 |
| `MapGeometry.cs` | 371 | ✅ 多边形碰撞 |
| `Entities/Npc/MapWildNpcWanderController.cs` | 330 | ✅ 漫游走动 |
| `Entities/Npc/MapWildNpcSpriteBubbleController.cs` | 224 | ✅ 气泡**表现**（→ B3 边界） |
| `Map.cs` | 210 | ✅ 图模型 + 通行面 |
| `Entities/Npc/NpcInfo.cs` | 170 | ✅ NPC 数据 |
| `Entities/Npc/NpcConditionHandler.cs` | 145 | ✅ 条件 DSL |
| `Entities/Npc/NpcButtonHandler.cs` | 115 | ✅ **★基石对象 + 两张词表 + 两个枚举** |
| `Entities/Npc/NpcHandler.cs` | 114 | ✅ 实体装配 / 条件组合 / 动作派发 |
| `Entities/Battle/BossInfo.cs` | 108 | ✅ **阵容个体规格** |
| `Entities/Battle/BattleInfo.cs` | 90 | ✅ **战斗分支 + 胜负链** |
| `MapManager.cs` | 88 | ⚠️ 半是**编排**（见 §2.13） |
| `Entities/Npc/MapWildNpcBehaviourController.cs` | 76 | ✅ 漫游编排 |
| `Entities/Dialog/DialogInfo.cs` | 70 | ✅ 对话数据 |
| `Entities/Teleport/TeleportHandler.cs` | 68 | ✅ 传送 |
| `Entities/Npc/MapWildNpcBubbleHost.cs` | 56 | ✅ 气泡宿主 |
| `MapMusic.cs` | 51 | ⚠️ 音频 → **编排线**（音频缝） |
| `MapResources.cs` | 26 | ✅ 资源形状 |
| `Entities/Teleport/TeleportInfo.cs` | 18 | ✅ 传送点数据 |
| `MapEntities.cs` | 15 | ✅ **七类实体表** |

### 2.1 ★两套血统（**本线的第一号事实**）

**同一个游戏有两条地图数据线，形状与 id 空间都不同**：

| | **AS3 血统**（爬取件） | **重启血统**（Unity） |
|---|---|---|
| 落点 | `swf/map/config/*.xml` | `Resources/Data/Maps/*.xml` |
| 张数 | **259** | **272** |
| 素材 | `<resource url="10010.swf"/>` ⇒ 显式文件名 | `<map resId="…">`（**仅 39 张非空**）⇒ Addressables |
| 图属性 | `name` `weather` `fightMap` `initialPoint` `categoryId` | + `category` `switch`（昼夜）`dream` `color` `pathId` `music` `fightMapColor` |
| 实体 | ★**口径 = 先剥 `<!-- -->` 再按 XML 解析**（父文档立的纪律；原始 grep 数在括号里，**差额全在注释里 ⇒ 不可复用**）。AS3 侧另 **4 张整文件解析失败**（`1.xml` `1182` `1183` `142`，已排除）：`<teleport>` **301** 条 / **187 张**（grep 308/190）· `<npc>` **230** 条 / **117 张**（grep 308/124）· `<dialog>` **132** 条 / **86 张**（grep 155/90）· `<branch>` **128** 条（挂在 `<dialog>` 下） | `<teleport>` **393** 条 / **211 张**（grep 433/232）· `<npc>` **604** 条 / **246 张**（grep 640/252）· `<dialog>` **279** 条 / 187 张（grep 300/193）· `<button>` **2813** / `<condition>` **1996** / `<action>` **4355** / `<func>` **471** / `<reply>` **1071**〔★M6 `docs/map/map-battle-trigger.md §2.1` 纠正：原记 252 张 / 2023 / 4429 是 grep 口径〕 |
| **`<branch>` 的双父元素**（★**M6 §2.1 实测**，解析器必须**按父作用域计数**，不许建全局 `branch` 表） | ― | `<branch>` **1335** 条 = `<battle>` 下 **680** ＋ `<dialog>` 下 **655**（230 张图有）⇒ 与 **MC2**「`<button type>` 双重语义」同族：**同一个元素名在两条宿主链上语义不同** |
| **传送面的血统差**（★**M5 `docs/map/map-teleport.md §2.6`** 实测，**MQ2 素材对齐**与**桥重写**都要用它） | `@targetPos` **219 条**（★**有这个字段**）· `@color` **0** · `pos` 值域 x `34..1121` / y `85..611` · `<initialPoint>` 是**属性形** `x="600" y="470"`，**文本恒空** · `<map @id>` **0 张有**（只能靠文件名）· `@switch` 19 张全 `1` 且 **0 张负 id 图**（夜版没爬下来） | `@targetPos` **0 条**（`TeleportInfo` 结构上没这维）· `@color` **8** · `pos` 值域 x `25..880` / y `45..455` · `<initialPoint>` 是**文本形** `445,140`（272/272 全合法）· `<map @id>` **272 张都有** · `@switch` 45 张（`1`/`-1`/`71`）⇒ **昼夜玩法只在 Unity 成立** |
| **NPC 事件模型** | **6 个具名 handler**：`<click><HandlerOpenDialogPanel/></click>`、`<mouseOver><HandlerShowNpcSlogan/>`、`HandlerToggleModule`(112) / `HandlerChangeMap`(5) / `HandlerDreamNpcClick`(6) / `HandlerHttpClick`(2) | **数据驱动 DSL**：`<button type=…><action>…</action><param>…</param><condition>…</condition></button>` |
| 对话 | `<dialog npcId transport><branch id="default"><node emotion><reply action="close">` | `<dialog><branch id name icon size pos><content><functionHandler><func type="click\|branch">` |
| **战斗触发** | **无**（0 条 `<battle>`） | **198 张图 / 337 条 `<battle>` / 680 条 `<branch>`**（grep 199/344）⇒ 正本 = **M6 `docs/map/map-battle-trigger.md`** |
| 我们今天的用途 | **✅ 在用**：`tools/build-map-index.mjs` → `game/data/maps.json`（259）⚠️ **⇒ 我们唯一的地图数据住在"非权威"那一套上**（**MQ1** 已拍板以 Unity 为写侧 ⇒ 桥要**重写**，不是补列） | ❌ **0 行**（**完全没桥**） |

**两套的交集/差集（实测）**：

```
AS3 259 ∩ Unity 272 = 137   （其中 AS3 侧有本地 swf 134；Unity 侧含 npc 120、含 battle 106）
AS3 独有 122                （本地 swf 121 —— 只有 AS3 血统的 npc/dialog）
Unity 独有 135              （其中负 id 26；非负 109 = 飞船区 10001–10030 等）
```

⚠️ **两套的 NPC id 空间不同**：AS3 `100.xml` 的 npc id = `18` / `22` / `158`；Unity `100.xml` 的 npc id = `10001` / `10002`。

⚠️ **两套的光口坐标系不可嫁接**【样本】（M5 §2.6）：取交集里能按「同图同 `@id`」配对的光口 **169 对**，
**169/169 全部相差 >4px**（中位差几百像素）⇒ **不能**拿 AS3 的 `@targetPos` 当 Unity 光口的落点用（**TPQ1** 已按此拍板：不加 `destPos` 列）。

**实测频次（本条是 §2 全部数字的来源）**：

- **Unity 侧**：`<param>` **9,884** · `<action>` **4,429** · `<button>` **2,858** · `<condition>` **2,023** · `<teleport>` **393**（grep 433，差 **40** 在注释，**M5 §2.6**）· `<battle>` 344 · `<npc>` 640。
  ⚠️ **后四个是对话/战斗分支的"同名标签"，grep 会把它们混在一起 ⇒ 已按 XML 解析重数**（`docs/map/map-dialog.md §2.1`）：
  `<dialog>` **279**（grep 300）· `<branch>` **1,335** = **`dialog` 下 655 + `battle` 下 680**（grep 1,371）·
  `<reply>` **1,071**（grep 1,098）· `<func>` **471**（grep 486）。
  ★**差额全部落在 `<!-- -->` 注释里**（例 `10017.xml:41-58` 整段被注释的 `<npc>`）：`dialog` 21 / `branch` 36 / `reply` 27 / `func` 15，逐条对上 ⇒
  **本行原先的 grep 口径不是"错"，但不可复用**；新增统计一律**先解析再计数**（`docs/map/map-condition.md §2.1` 另一条同族教训）。
- **Unity `<action>` 频次**（★**解析口径**，合计 **4,355**；grep 4,429）：`openDialog` 1224 · `openHintbox` 926 · `setActivity` 603 · **`battle` 543**（★**与 M6 §2.6 的"触发面 543"逐字对上** = 对话 391 + NPC 152）· `setItem` 417 · `openPanel` 137 · `getPet` 131 · `teleport` 106 · `setNpcParam` 82 · `evolvePet` 79 · `setPet` 63 · `setMission` 30 · `player` 4 · `fish` 4 · `none` 2 · `miniGame` 2 · `callback` 2。**`mail` = 0**（`NpcAction.SetMail` 是**死枚举**）。
- **Unity `<button type>` 频次**（★**解析口径**，合计 **2,813**，★**2,813/2,813 全有 `@type`**；grep 2,858）：`auto` 1890 · `click` 668 · `evolve` 125 · `choose` 37 · `shoot` 25 · `miracle` 24 · `teleport` 11 · `miracle_choose` 8 · `win` 4 · `gacha_10` 4 · `gacha` 4 · `exit` 4 · `enter` 4 · `get_pet` 3 · `battle` 2。**（15 种取值，见 MC2）**
- **AS3 侧**：**275 个 `<eventHandler>`**（→ `click` 271 · `mouseOver` 194）；**handler 标签只有 6 种**。
- **Unity 条件命名空间**（★**解析口径 = 正本在 `docs/map/map-condition.md §2.1`**，子条件 2,131）：`activity[…]` **1,025**（64 个 id）· `data.` **391** · `firstPet.` **284** · `random` **180** · `mission` **68** · `item[…]` **50** ＋ `item_yite[…]` **10**（★**两条臂**，后者属出局的肉鸽）· `battle.` **43** · `petBag` **38** · `player.` **31** · `map.` **6** · `npc[…]` **4** · **兜底裸键 1**（`active`）。

> **⇒ 本线的第一号设计决定** = **MQ1**：写侧以**哪套**为权威 ⇒ ✅ **已拍板 = 重启血统**（决议表 §7）。

### 2.2 `Map` —— 图模型 + 通行面（`Map.cs`，210 行）

- **XML 根** `[XmlRoot("map")]`；属性 `id` `resId` `pathId` `name` `weather` `color` `category` `switch` `dream`；
  子元素 `<fightMap>` `<fightMapColor>` `<initialPoint>` `<anim>` `<music>` `<entities>` `<geometry>`。【源码】`Map.cs:9-36`
- `category` → `MapCategory { Ship=1, Grass=2, Station=100 }`；**`worldId = (categoryId-1)/100`**。【源码】`Map.cs:21-22`、`:205-209`
- ⚠️ **`IsMod(id) = id < -50000 || id == 0`**（**MC4**）；**`worldId` 对 mod 图 = 0**。
- **通行判定以 path 纹理为准**：`IsPathAvailable(x,y)`：无 pathSprite ⇒ **硬编码矩形** `x∈[0,960] ∧ y∈[20,540]`；
  有 ⇒ 越界 false，否则 **`pathTexture.GetPixel(x,y) == white`**。【源码】`Map.cs:121-136`
- **几何碰撞**：`IsCanvasMovementTargetAvailable` = 可走 **且** 不在碰撞多边形里；`TryGetMovementDestination`
  用 **`geometry.TryGetFirstCollisionHit`** 求最近交点，回退 `hitT - 2f/distance`（**留 2px 余量**）。【源码】`Map.cs:139-163`
- **`GetMapIdentifier`**（供条件 `map.<key>`）：`id` / `resId` / `weather` / `category` / `world` / `switch` / `dream` / `anim`，**其余 → 0**。【源码】`Map.cs:189-201`
- 静态面：`GetMap(id, onSuccess, onFail)`（**异步**，缓存上次）、`GetNpcInfo(map, npcId)`、`GetBattleInfo(map, npcId, battleId)`。【源码】`Map.cs:50/54/58`

### 2.3 `MapEntities` —— 七类实体（15 行，**本线的实体总表**）

```csharp
public class MapEntities {   // 【源码】MapEntities.cs:1-15
    [XmlElement("teleport")] public List<TeleportInfo> teleports;
    [XmlElement("npc")]      public List<NpcInfo> npcs;
    [XmlElement("farm")]     public List<NpcInfo> farms;
    [XmlElement("animal")]   public List<NpcInfo> animals;
    [XmlElement("pond")]     public List<NpcInfo> ponds;
    [XmlElement("insect")]   public List<NpcInfo> insects;
    [XmlElement("nest")]     public List<NpcInfo> nests;
}
```

⇒ **除 `teleport` 外，六类实体共用 `NpcInfo`**（同一形状，靠**装配函数**分流：`CreateNpc` / `CreateFarm` / `CreateAnimal`）。【源码】`NpcHandler.cs:11/19/27`

### 2.4 `NpcInfo` / `NpcHandler` —— NPC 数据与装配

**`NpcInfo`**（170 行）：`id` `resId` `name` `description` `active` `raycastTarget("target")` `rgba("color")` `size`
`pos` `rotation` `namePos` `nameSize` `nameColor` `nameFont` `wildInfo` `transport` + **四张处理器表**：
`dialogHandler` / `battleHandler` / `eventHandler` / `callbackHandler`。【源码】`NpcInfo.cs:12-80`、`Map.cs:54`

- **`<transport>`** = 交互时角色**站到哪儿**（一个点）。
- **`wildInfo`**（`NpcWildInfo`）= 漫游/气泡（§2.11）。

**`NpcHandler`**（114 行）——**本线的调度器**：

| 函数 | 行 | 语义 |
|---|---|---|
| `CreateNpc/Farm/Animal` | 11/19/27 | 装配进 `npcList`（`Dictionary<int, NpcController>`） |
| `GetButtonEvent(btn,handler)` | 35 | **词表 5 条、UI 事件只有 4 种**（`click`/`enter`/`exit`/`hover`）；⚠️ **`auto` 不是 UI 事件** ⇒ 它走**进图批处理**（`MapSceneView.cs:287-291`）；其余 **返回 `null`**（**MC2**）。细则 = `docs/map/map-npc.md §2.2/§2.5` |
| `GetNpcCondition(npc,handler,list)` | 47 | **AND across `<condition>` 元素，OR within `\|` splits**；**无条件 ⇒ 恒真** |
| `GetNpcAction(npc,handler,list)` | 71 | 18 种动作派发（`NpcActionHandler.*`） |
| `GetNpcEntity(npc,handler,list)` | 98 | `if (isShootMode ^ (typeId=="shoot")) return;` ⇒ **射击模式门**（**MC3**）→ 条件 → 动作 |

### 2.5 ★`NpcButtonHandler` —— **本线的基石对象**（一个对象绑死"条件 → 动作"）

```csharp
public class NpcButtonHandler {                       // 【源码】NpcButtonHandler.cs:8-40
    public string description;                        //   <description>（按钮文案）
    [XmlAttribute("type")] public string typeId;      //   type
    public ButtonEventType type => typeId.ToButtonEventType();   // 有词表，其余→None
    [XmlElement("action")] public string actionType;
    public NpcAction action => actionType.ToNpcAction();
    [XmlElement("condition")] public List<string> condition;     // 条件列表
    [XmlElement("param")] public List<string> param;             // 参数列表
    [XmlIgnore] public List<Action> callback;                    // 运行时回调（不进 XML）
}
```

**两张词表 + 两个枚举**（`NpcActionDatabase`，同文件 `:42-116`）：

- `buttonEventTypeDict`（**5 条**）：`auto`→`Auto`、`click`→`OnPointerClick`、`enter`→`OnPointerEnter`、`exit`→`OnPointerExit`、`hover`→`OnPointerOver`。
- `npcActionDict`（**18 条**）：`setNpcParam` `openHintbox` `openPanel` `openDialog` `teleport` `setItem` `getPet`
  `removePet` `setPet` `evolvePet` `setMission` `setActivity` `battle` `player` `mail` `fish` `miniGame` `callback`。
- `enum ButtonEventType { None, Auto, OnPointerClick, OnPointerEnter, OnPointerExit, OnPointerOver }`
- `enum NpcAction { None, …18… }`；另有 `petActionList = {RemovePet, SetPet, EvolvePet}`。

⚠️ **同一个 `<button>` 形状出现在** ★**六个**地方（**这是本线"一个对象走遍全图"的核心洞见**）：
① NPC 的 `eventHandler`（785 条）；② NPC 的 `callbackHandler`（223 条 **标签**，非 UI 事件）；③ 对话的 `<func>`（`functionHandler` / `replyHandler`）；
④ 战斗的 `winHandler`（**582 处**）/ ⑤ `loseHandler`（**96 处**）；⑥ **射击模式**下由 `NpcController.Shoot()`（`NpcController.cs:151`）直接认领的 `typeId=="shoot"`。
⇒ **逐消费点清单 = `docs/map/map-npc.md §2.7`**（含"肉鸽 `replyHandler` 用 `null` 的 npc 喂同一条链"这条 A 组先例）。

### 2.6 条件 DSL（`NpcConditionHandler.cs` 145 行 + `Operator.cs` 163 行 + `Identifier.cs`）

**算子只有 6 个**：`<` `>` `=` `LTE` `GTE` `NOT`。【源码】`Operator.cs:8-15`
- `ToHalfCondition`：全角 `＜＞＝` → 半角。
- **`SplitCondition` 按字典插入序扫描，取第一个命中** ⇒ `<`/`>` 先于 `=`；`NOT` 是**无空格写法**
  （`firstPet.featureIdNOT10499`）。【源码】`Operator.cs:23-45`（**MC1**）

**命名空间**（`NpcConditionHandler.GetNpcCondition(op,key,value)`，`:11-65`）——
⚠️ **括号一律是方括号 `[...]`**（`Helper.TrimParentheses` 的默认字符就是 `[`/`]`，**函数名在骗人**）；
**圆括号 `(...)` 在条件里只有一个用途** = `petBag(...)` / `buff(...)` 的**过滤式**（`Identifier.cs:107` `TryTrimParentheses(…, '(', ')')`）。【样本】实测定量见下

| 前缀 | 取值面 | 行 |
|---|---|---|
| `random` | `GetRandom`：`[old]` 用**会话键袋里那一个**（`sceneData["random"]`，**不是存档**，见 MC5）；`[new]` **先按旧值判定、再现场摇一个写回**；`[a~b]` 范围；**纹章 200051 ⇒ 读侧 `/4`** | :13/67 |
| `map.` | `Map.GetMapIdentifier` | :16 |
| `npc[<id>].color` | `NpcController.GetNpcIdentifier` ⇒ `NpcView.GetIdentifier`（**只认 `"color"` 一个键**，返回 `button.image.color`） | :19 |
| `firstPet.` | `petBag[0].GetPetIdentifier`（**无空指针保护**） | :32 |
| `activity[<id>].<键>` | `Activity.Find(id).GetData(键, 缺省)`；**值的文法 = `[类型]条件值[default]缺省值`** | :35/103 |
| `mission[<id>].` | `Mission.Find(id)` ⇒ `done`（比 bool）/ 其余**当 `checkPointId` 字符串比** | :42/92 |
| `battle.` | `Identifier.GetBattleIdentifier("state."+key)`（`battle == null` ⇒ **`op != "="`**） | :49/124 |
| `item[<id>].<键>`（+ `item_yite[<id>]` 袋） | **`key` 被完全忽略**，恒比 `item?.num ?? 0` | :53/132 |
| `yite_rogue.` | `YiTeRogueData`（`null` ⇒ **`op != "="`**） | :60/138 |
| **兜底** | `Operator.Condition(op, Parser.ParseOperation(key), Parser.ParseOperation(value))` | :64 |

**兜底吃到的那批**（实测存在、**不在上表**）：`data.<面板>.<键>`（**399 条，最大的一族**）、
`player.<键>`（31）、`petBag…`（38）—— 它们由 **`Identifier.cs`** 解析：
- `data.` ⇒ `Player.GetSceneData(<面板名>)` 取**运行时面板回填的对象**（宠则转 `GetPetIdentifier`，否则 `GetNumIdentifier(ToString())`）。【源码】`Identifier.cs:80-91`（**MC6**）
- `firstPet.` ⇒ **重写成 `petBag[0].`** 再递归。【源码】`Identifier.cs:93`
- `petBag[...]` / `petBag(...)` ⇒ 下标式 **或** 过滤式（`count` / `sum.` / `max.` / `min.` / 裸键取第一个命中）。【源码】`Identifier.cs:96-143`
- `plant.` / `animal.` / `date.` ⇒ `Plant.currentPlant` / `Animal.currentAnimal` / `DateTime.Now`。【源码】`Identifier.cs:41-79` ⚠️ **`plant.` / `animal.` 在 272 张地图条件里实测 0 次**（牧场 = A 组出局，条件面也没用到）

**★实测定量**（272 张 Unity 地图，★**解析口径**：`<condition>` 元素 **1,996**（grep 2,023）⇒ 按 `|` 拆出**子条件 2,131**（grep 2,160）；先剥 `<!-- -->`、再解码 `&lt;/&gt;/&amp;`，算子按**上游顺序** `< > = LTE GTE NOT` 取首个命中，方法见 `docs/map/map-condition.md §2.1`）【样本】：
- **命名空间分布**：`activity` **1,025**（64 个 id）· `data.` **391** · `firstPet.` **284** · `random` **180** · `mission` **68** · `item` **50** ＋ `item_yite` **10**（★**两条臂**，后者属出局的肉鸽 ⇒ 解析器要认 `item_yite[` 前缀，但**不实现**）· `battle.` **43** · `petBag` **38** · `player.` **31** · `map.` **6** · `npc` **4** · **兜底裸键 1**（`active=false`，见 MC9 族）。
- **算子分布**：`=` **1,330** · `NOT` **227** · `<` **246** · `GTE` **188** · `LTE` **78** · `>` **62**；**无算子的子条件 = 0**（⇒ `Substring(0,-1)` 那条抛异常路径**在发行数据里不可达**，MC1 只剩"规则本身仍是个坑"）。
- **`|` 从来不出现在 `[...]` 内部**（0 处）⇒ `Split('|')` 的粗暴切分**没被数据踩到**，但 `ToIntRange` 支持 `a|b~c` 池 ⇒ **战斗侧 `random` 与地图侧 `random` 语法不同**（见 `docs/map/map-condition.md §2.4`）。
- **`random` 臂只有三种**：`[old]` **138** / `[a~b]` **26** / `[new]` **16**（裸 `random`、`[id 池]` 在地图条件里 **0 次**）。
- **无条件 = 恒真**（★全**解析口径**）：NPC 的 `<button>` **2,813** 个（grep 2,858）里 **1,418（50.4%）无 `<condition>`**、1 条 1,220 / 2 条 160 / 3 条 8 / 4 条 7；对话 `<func>` **471** 个里 **316（67%）无**、`<reply>` **1,071** 个里 **932（87%）无**（`docs/map/map-dialog.md §2.1`）。

### 2.7 动作 18 种（`NpcActionHandler.cs` 481 行）

| 动作 | 行 | 语义要点 |
|---|---:|---|
| `SetNpcParam` | 9 | 改 NPC 运行时参数（`active` 等）；**`data.` 前缀** ⇒ `Player.SetSceneData`（`:86`） |
| `SetPlayer` | 77 | 改玩家表现/状态 |
| `OpenHintbox` | 103 | **提示盒**（`type=Item/PetSelect/…` + `title/content/option_num/callback/item_icon/…`）→ **A3/C2** |
| `OpenPanel` | 146 | 开面板（`<param>SPTBoss[page=2]</param>` 形态）→ **C2** |
| `OpenDialog` | 163 | 开对话（取 `dialogHandler`）→ §2.8 |
| `Teleport` | 188 | → §2.9 |
| `SetItem` | 202 | `param[0] ∈ {add, add_with_hint, remove, add_to_yite, remove_from_yite}` + `itemId,num` 对 → **道具线** |
| `GetPet` | 225 | 发宠 |
| `RemovePet` | 253 | 删宠 |
| `SetPet` | 274 | 置宠 |
| `EvolvePet` | 300 | 进化 |
| `SetMission` | 320 | **任务线（A 组出局）** |
| `SetActivity` | 341 | `param[0]`=活动 id，`param[1..]` = `key=value` ⇒ `activity.SetData` + **`SaveSystem.SaveData()`** |
| `StartBattle` | 355 | `param[0]`=战斗 id ⇒ 取 `npcInfo.battleHandler` 里 `id==battleId` 的分支 ⇒ `Battle.StartBattle`；**找不到且有 `param[1]` ⇒ 弹提示** ⇒ §2.10 |
| `SetMail` | 379 | **邮件线（A 组出局）**；**实测 0 次调用** |
| `Fish` | 414 | **钓鱼（A 组出局）** |
| `MiniGame` | 449 | **小游戏（T2·21，A 组出局）** |
| `Callback` | 458 | 按 `param` 的 `callback=<标签>` 去 `npc.callbackHandler` 里**按 `typeId` 匹配**再执行 ⇒ **MC2 的另一半** |

### 2.8 对话（`DialogInfo.cs` 70 行 + `DialogManager.cs` 616 行 + `<func>`）

**`DialogInfo`**：`id` `icon` `size` `pos` `color` `name` + **`story*` 一族**
（`storySpeakerSide` / `storyFlipIcon` / `storyUseIconCrop` / `storyIconCrop` / `storyExpression` / `storyTextStyle`）
+ `gifInfo` + **`<content>`（支持 `{expr:…}` 插值，走 `Identifier.GetIdentifier`）** + `functionHandler` / `replyHandler`。【源码】`DialogInfo.cs`

**`<dialog>` 的形状**（Unity XML 实测样本，地图 `10003.xml`）：

```xml
<dialog>
  <branch id="default" name="我" icon="7004" size="136,125" pos="0,40">   <!-- 分支 = 说话人/头像/位置 -->
    <content><![CDATA[神奇扭蛋第一期，大奖是祖拉精元蛋！]]></content>
    <functionHandler>
      <func type="click"><description>单抽</description><action>openHintbox</action>
        <param>type=Item</param>…<condition>item[400023].num>0</condition></func>
      <func type="branch"><action>openHintbox</action>…<condition>item[400023].num=0</condition></func>
    </functionHandler>
  </branch>
</dialog>
```

⇒ **`<func>` / `<reply>` 就是 `<button>`**（同"条件→动作"形状，实测 `type` 只有 `click` / `branch` 两种）。

⚠️ **两处口径由 M4 纠正**（`docs/map/map-dialog.md §2.3/§2.5/§2.8`，此处只留指针）：
① **`<branch>` 之间不是靠 `<func type="branch">` 的条件选择的** —— 翻页靠的是**动作 `openDialog` 的 `param[0]` = 目标 branch id**（作用域 = 当前 NPC；实测入口 `default` **264** 条）；
   `type="branch"` 反而**不渲染、不翻页**，它是"**附挂到上一条可见项点击上的隐藏动作**"（实测 **237 + 83 = 320** 条）。
② **`branch` 这个词在地图 XML 里有三重身份**（`dialog` 下 **655** = 一条对白 / `type="branch"` **320** = 附挂动作 / `battle` 下 **680** = 战斗分支）
   ⇒ **解析器一律按父元素分派，不按标签名**。

★**剧情半边的实测**（M4 **DLQ1** 的依据）：`content` 以 `story=` 开头的 = **59 条 / 5 张图**（`540` `50016` `50019` `50023` `50024`），
而**这 5 张图全部 unity-only、无本地 `.swf`** ⇒ **不在 MQ2 的第一批 134 张里** ⇒ **剧情演出出局不挡第一批任何一张图**。
（另 **1 条 `story=`** 出现在 `<condition>` 里 = `10083.xml` 的活动值文法畸形，**归 M3/CSC 族**，不计入 59。）

⚠️ **`DialogManager.cs` 616 行里大半是"剧情"**（`storyActorLayer` / `storyChoiceRoot` / `storyTextStyle` / `storyTransitionBackground` / `OpenStoryDialog` / `dialogStoryOpenAnimationCoroutine`）——
**剧情 = `docs/architecture.md §1.1` A 组（T2·3，出局）**。本线**只要** `SetCurrentNpc` / `OpenDialog` / `CloseDialog`（`:77-99`）与**非 story** 的 `DialogInfo` 字段。

### 2.9 传送（`TeleportInfo.cs` 18 行 + `TeleportHandler.cs` 68 行）

★**本节的正本 = M5 `docs/map/map-teleport.md`**（已成文，待评审）。这里只留**导读 + 五条最容易漏的真值**：

**`TeleportInfo`**：`id` `name` `pos` `rgba("color")` `targetMapId`。【源码】`TeleportInfo.cs:7-18`
⚠️ **就这五列，而且没有"落点"这一维**（M5 §2.1）—— 光口只说"去哪张图"，不说"站哪"；
⇒ 落点规则因此**只有一条**（`spawn ?? 目标图.initialPos`，M5 §3.3），AS3 的 `@targetPos` **不嫁接**（**TPQ1**）。

**`TeleportHandler`（68 行）**：
- `CreateTeleport` = `SetTeleportRect`（`SetAsLastSibling` + `anchoredPosition`）+ `SetTeleportButton`
  （`onPointerEnter` ⇒ **`InfoPrompt.SetActive(true)`**、`onPointerExit` ⇒ 关）。【源码】`:11-30`（**悬浮说明的上游真值**，B3 已落）
- **`Transport(canvasPos, onArrive)`**（`:33`）：先**寻路走过去**，`TeleportReachableSearchRadius = 72f`（`:9`）内找不到落点就放弃；抵达后回调。
  ⚠️ **上游其实没"放弃"**（M5 §2.3，**TPC3**）：`Transport` **永远传 `onArrive`** ⇒ 搜不到可达点时**用原点**，
  原点若有视线 ⇒ `path = {destination}`；A* 失败 ⇒ **空 path** 被 `PlayerModel.cs:53-54` 补成单点 ⇒ **一步直达一个不可达的光口**。
  ⇒ 我们的目标行为**比 MP5 更强**（不可达 ⇒ 出 `unreachable` 决议，不瞬移、也不走过去）。
- **`Teleport(int mapId, Vector2 targetPos)`**（`:41`）三特例：**`mapId == 0` ⇒ "地图暂未开放"**；
  **`mapId == 50000` ⇒ 取 `Activity.Find("mod_home").GetData("map_id")`**；否则真切图。
  ⚠️ **触发情况**（M5 §2.7【样本】）：`targetMapId == 0` 在 Unity 发行数据里 **0 条**（纯防呆分支）；
  `50000` **恰好 1 条**（`990.xml`「基地」→ `50000.xml`「小屋」，`category=200`）⇒ **传送函数里嵌了对活动/Mod 线的查询**（**TPC6**）。
- **`SwitchDayNight(int, Vector2)`**（`:64`）：**`Mathf.Abs(switch) == 1 ⇒ 目标图 = `-currentMapId`**（**昼夜镜像图**，解释 Unity 的 26 个负 id）。
  ⚠️ **`Abs() != 1` 时把 `switch` 值本身当 mapId**（**TPC5**）；【样本】`@switch` 实测 **45 张 = `1`×23 / `-1`×21 / `71`×1**，
  那个 `71` ⇒ **点了重进当前图**——但 `71` 这张图**零入边、玩家走不进去**（M5 §2.10）⇒ **这条 bug 观测不到**，收窄**照做**（解析期纪律）而**不给人手测用例**。
  ⇒ 目标在**解析期收窄成 `0 | 1 | -1`**（M5 §3.4）。
  ⚠️ **但"昼夜与光口互不相干"是错的**（本轮实测推翻）：跨日夜的光口有 **`day→night` 2 / `night→day` 21 / `night→night` 13** 条，
  唯一成立的可核规则是**孪生边 `X → -X` 全库仅 1 例**（`-1270`「秘密基地梦境」→ `1270`，且那是**梦境出口**）⇒ **镜像仍是第二机制，但依据换成"目标由代码算出、不写在数据里"**（M5 **TPI4**）。
- 切图后落点走 **`Player.SetSceneData("mapInitPos", targetPos)`**，由宿主在 `MapManager.LoadPlayer` 消费并**删除**。【源码】`TeleportHandler.cs` + `MapManager.cs:45-47`
  ⚠️ **写条件是 `targetPos != default`，而生产侧 0 个调用点传得进这个条件**（M5 §2.4【样本】：光口没有落点字段、NPC `teleport` 动作 **106 条全部 1 个 `param`**）
  ⇒ **`mapInitPos` 在发行数据下是死机制** ⇒ 我们**不照搬键袋**，改成 `changeScene('map', {mapId, spawn})` 的**入参**（**TPQ5**，与编排线 **OR4** 同口径）。
- **六个传送入口，本线只认四个**（M5 §2.2）：光口 **393** / NPC `teleport` 动作 **106** / NPC `transport` 属性 **56** / 昼夜按钮（45 张图）；
  面板 `GoToMap` 与任务·剧情检查点属 **A 组出局**，只留形状。
- ★**入口图 = 光口 ∪ `teleport` 动作，两样缺一不可**（M5 **TPI9** / §2.10，本轮按解析口径全量枚举）：272 张图里
  **95 张零光口入边**、**54 张两头皆空**，其中 **26 张**（`10012`…`10043` 整批等）**唯一的出边在 NPC 动作层**
  ⇒ **只读光口就会把那批图做成"死图"**；而**双向性只是数据习惯**（对称 **152** 对 / 单向 **89** 条）⇒ **不建"能走过去就得能走回来"的校验**，只出**只读审计**（`portal-inbound-none` / `portal-isolated`）。
  ⚠️ 这条同时给**门线**（C 组排期 ④）分了诊：**`82`/`88` 两扇门有光口出边（→ `81`）、`83`–`87` 五扇零入零出** ⇒ **门的入口不是光口**，本线**不许**把门做成"一种特殊传送点"。

### 2.10 地图触发的战斗（`BattleInfo.cs` 90 行 + `BossInfo.cs` 108 行）

★**本节的正本 = M6 `docs/map/map-battle-trigger.md`**（已成文，待评审）。这里只留**导读 + 形状**（列、作用域、触发面、开工门、战后链、`battle.` 键表全在 M6）。

`<battle>` 的形状（实测样本，地图 `10009.xml`）：

```xml
<battle>
  <branch id="30">                                   <!-- 战斗分支（按条件选） -->
    <settings count="1"><mode>1</mode></settings>
    <enemy><pet id="10073" level="100">
      <status><atk>600</atk><mat>600</mat><hp>3000</hp></status>   <!-- 覆盖属性 -->
      <initBuff>3645</initBuff><headerSkill>14650</headerSkill>
      <loopSkill>14651,14655,14656,14651,14655,14645</loopSkill>
    </pet></enemy>
    <winHandler>                                     <!-- ★又是按钮链 -->
      <button type="auto"><action>getPet</action><param>10071</param>
        <condition>activity[door].new_basic[easy][max]=[int]29[default]0</condition></button>
      …
    </winHandler>
    <loseHandler>…</loseHandler>
  </branch>
</battle>
```

- `BattleInfo`：`id` `content` `settings`（`BattleSettings`）+ **`playerInfo` / `enemyInfo`（`List<BossInfo>`，元素名 `<pet>`）
  + `winHandler` / `loseHandler`（`List<NpcButtonHandler>`，元素名 `<button>`）**。【源码】`BattleInfo.cs:8-24`
- **`BossInfo`** = **"一只配装宠"的规格**：`petId` `level` `status`（`atk/mat/hp`…）`hasEmblem`
  `initBuffIds` `headerSkillIds` `loopSkillIds` `normalSkillIds` `superSkillId`。【源码】`BossInfo.cs`
- ⇒ **本线只出 `BattleSpec`**（阵容 + 设置 + 胜负按钮链），**战斗循环归 E 线**（E3/E6）。

### 2.11 移动 / 几何 / 寻路

★**本节的正本 = M7 `docs/map/map-move.md`**（已成文，待评审）。这里只留**导读 + 三条最容易漏的真值**：
① 缺 path 素材时有**两个相反**兜底 —— `IsPathAvailable` 回**内框** `x∈[0,960] ∧ y∈[20,540]`、`IsCanvasPathAvailable` **直接 `return true`（全可走）**，
而**导航真正调的是后者** ⇒ 缺素材的图（重启件里是常态：`pathId` **13** / `geometry` **1**）**整张 canvas 可走**（**MC7** 的活支，M7 §2.1）；
② **三套坐标/单位**不许混算（**canvas** 960×540 左下锚定 / **path 像素** / **AS3 `mapRoot` 本地 + `GRID_SIZE=10` 格**，M7 §2.1＝接手 M5 §2.9"三套数"）；
③ **不可达不补单点**：上游 `SetDestinationByCanvasPos` 在 `onArrive != null` 时把空路径**补成单点 = 一步直达**（M7 **MWC4**）⇒ 我们要出 `unreachable`（**MP5**）。

| 件 | 行 | 要点 |
|---|---:|---|
| `Map.IsPathAvailable` | —— | path 纹理白像素 = 可走；**无 path ⇒ 硬编码 960×540 内框**（**MC7**） |
| `MapGeometry` | 371 | `MapPolygon.ContainsPoint / IntersectsCircle / TryGetMovementHit`；`ParsePoints` / `FormatPoints` / **`Triangulate`（耳切）** / `ContainsPoint` / `TryGetSegmentIntersectionT` |
| `MapNavigator` | 377 | **栅格 A***（`cellSize=8f` / `footprintRadius=8f`）+ **足印检测**（`IsFootprintWalkable`）+ **视线**（`HasLineOfSight`）+ **平滑**（`SmoothPath`）+ `TryFindNearestReachablePoint(center, radius)` |

**我们今天的现实**：这些**都没落**；移动/寻路由 **SWF（AS3 血统）** 承担 —— `game/maprunner/MapRunner.as`
（768 行）里 `GRID_SIZE=10`、`path_mc` 主路径、`findPath`（A*）、`spotAt(HOT_R=26)`、`ARRIVE_R=18`、`tick` 移动。【源码】`MapRunner.as:32-34, 522-620`

### 2.12 漫游 NPC（`MapWildNpc*` 5 件 / 1,078 行）

★**本节的正本 = M7 `docs/map/map-move.md`**（已成文，待评审）。导读 + **三条实测更正 / 真值**：
① ★**`CanUseWildBehaviour` 四条 AND 实测 110/110 为真**（不是恒假）—— 【样本】`eventHandler` 的 `battle` 动作 **150 条全带 `@type`**（`click` 140 + `shoot` 10）
⇒ **纠正 M6 §2.14 / BTQ5 的"谓词恒假"**（详见 M7 §2.5；M6 已同步改）；`RequiresNavigator` = **107**（= 107 只 `wander`）；
② `<wild>` **110 条 / 53 图**、`wander` **107** / `stationary` **3**；`talk` 的 **`scene`/`player` 两张表实测为空（死表）**、`visual`/`bobSpeed` **死字段**（M7 §2.7/§2.8）；
③ **"会走"与"能打"是两条契约**（M7 **MWI9**）：能否漫游 = `movement.mode`；能否打 = M6 的 `battleHandler`。

| 件 | 行 | 职责 |
|---|---:|---|
| `MapWildNpcBehaviourController` | 76 | 编排：`CanUseWildBehaviour` / `RequiresNavigator` / 起停 |
| `MapWildNpcWanderController` | 330 | 走动：A* + `TargetReachThreshold=1.5` + **卡住检测**（`StuckCheckInterval=1.25` / `MaxTargetAttempts=12`）+ 待机 |
| `MapWildNpcTalkController` | 392 | 气泡调度：静止/漫游两套排程；图库 `Sprites/Map/talk bubble` |
| `MapWildNpcSpriteBubbleController` | 224 | 气泡**表现**（字号/内边距/淡出）→ **B3 边界** |
| `MapWildNpcBubbleHost` | 56 | 气泡宿主 + 样式表（默认 `white`） |

数据形状：`NpcWildInfo{ anim/gif/movement/talk }`、`NpcWildMovementInfo{mode,radius,speed,idle,step,moveTick,snap,bob,bobSpeed,flip,debug,originalFacesRight}`、`NpcWildTalkInfo{chance,duration,interval,self,scene,player}` + `GetRandomSelf`。【源码】`NpcInfo.cs`

### 2.13 边界外：同目录里**不属于本线**的文件（**目录 ≠ 线**）

| 文件 | 归谁 |
|---|---|
| `MapManager.cs:18-48`（`Init`/`LoadMap`/`LoadPlayer`/`mapInitPos` 消费）+ `PetTest` | **编排线**（会话/场景装配）；**只有 `LoadMap` 里的"把 map 交给三个 controller"是本线的接线点** |
| `MapManager.SetPlantPanelActive/SetAnimalPanelActive/Refresh…`（牧场） | **牧场 = A 组出局** |
| `MapMusic.cs`（51） | **编排线音频缝** |
| `MVC/View/Map/**`（8 件 / 1,094） | **B3** |
| `DialogManager.cs` 的 story 半边（≈500 行） | **剧情 = A 组出局（T2·3）** |
| `NpcController.cs`（`MVC/Controller/Utility/Dialog/`，153）| **半 View 半运行时**：实体位置/颜色/交互态 + `GetNpcIdentifier`（**它是 `npc(<id>).<key>` 的取值面**） |

---

## 3. 我们的现状（**实测** · 2026-10-17）

| 面 | 现状 |
|---|---|
| **地图表** | `game/data/maps.json` = **259 张**（`tools/build-map-index.mjs`，48 行）；字段 `id/name/swf/swfOk/fightMap/fightMapOk/weather/init/entities/teleports` |
| ⚠️ `entities` | **是个数字**（`<entities>` 标签计数 = 1）—— **`<npc>` / `<farm>` / 七类实体一个都没桥** |
| 传送点 | ✅ 190 张图有 `teleports[]`（`pos/target/id/name`）+ B3 的**光口 + 出口名悬浮说明**（已落）。⚠️ **但这条链建立在 AS3 血统上**（`tools/build-map-index.mjs:15` `DIR='swf/map/config'` ⇒ **259 图 / 308 条光口**，实测复数一致），**与 MQ1 拍板的权威血统不是同一套**（M5 §6）⇒ 桥重写后**光口数会变**（AS3 301 条 parse / Unity 393 条），且**坐标系不同**（M5 §2.6）⇒ **现有 `pos` 值不可平移** |
| **NPC** | **0 行**（数据、条件、动作、渲染全无）；`MapRunner.as` 里**没有 npc 概念**（只有 `spots` 与 `wild`） |
| **对话** | **0 行** |
| **地图战斗触发** | **0 行**；今天的战斗入口 = 野怪点击（⚠️ 旧 `startWildFight` **已随 `MDB11`（2026-10-21）退役** ⇒ 现 = `onNpcClick → resolve→run → startMapBattle`，正本 `docs/map/map-impl.md §7.3.33`） |
| **`game/core/**` 地图对象** | **0 个**（无 geometry / navigator / condition / action） |
| 移动 / 寻路 | **由 SWF 承担**（`game/maprunner/MapRunner.as` 768 行；宿主 `mapScene.js:760` 行做叠加层 + HUD + 面板） |
| 会话 | `M.session` / `mapScene.js` 里的 `go('map', …)`；**无 `currentMapId` 的单一真值**（SWF 侧持图，宿主只报回 `camX/camY`） |
| 渡图 | 宿主 `gotoMap(target)` 重载 SWF（`mapScene.js` 的 `loadWorld` / `mapFail` 缺图退回） |

> **一句话现状**：**"传送点"这一条链是通的（数据 → 光口 → 出口名 → 点击走过去 → 切图）；其余全是空地** ——
> 没有 NPC、没有对话、没有条件、没有动作、没有地图战斗触发。而**这四样恰好就是"最大可玩缺口"**（`docs/architecture.md §1.1` C 组 ①）。

---

## 4. 目标形状

### 4.1 落点（✅ 已定 · 依 §7 决议表 MQ1/MQ2/MQ3/MQ4）

| 层 | 落点 | 内容 |
|---|---|---|
| **L2 取数入口** | `game/app/content.js` 的 `loadMap(id)`（**方案 C**，人类 2026-10-18：进一张图时现场取那条 Unity XML、现场解析；**不缓存**） | 每图：`id/name/category/weather/switch/dream/init/fightMap/resId/swf` + **七类实体**（NPC 含四张处理器表的**原始串**）+ `<battle>` 分支 |
| **L1 纯解析器** | `game/logic/map/parse-map.js`（XML 串 → `MapRecord`；零 IO/零 fetch；浏览器与 node 审计共用一份） | 字段映射 + 归一化（MDI4/5/7/10）；swf 候选链（存在判据由调用方注入） |
| **L0 域引擎** | `game/core/map/**` | `operator.ts`（6 算子 + **最左最先切分**）、`condition.ts`（命名空间 + 求值，**注入取值面**）、`action.ts`（**只出决议** `{action, params, target}`）、`geometry.ts`（多边形 + 三角化）、`navigator.ts`（A* + 足印 + 平滑）、`map-table.ts`（图模型纯函数） |
| **L1 域逻辑** | `game/logic/map/**` | `session.js`（当前图 / 走位 / 抵达 / 切图 / 镜像图）、`entity.js`（把记录 → 运行时实体表） |
| **L2 出口** | `game/app/content.js` | `loadMap(id)` / `entitiesOf(record)`（**宇宙权威单一出口**） |
| **离线对账** | `tools/map-audit.mjs` | 读全库跑**同一份**解析器 → 打印判据数字（95/54/393/110…）；**不产产物** |
| **接线（L3/L4）** | 现 `mapScene.js` + B3 的 DOM 契约 | 传送真数据 / NPC 事件 → C2 面板与 A3 提示 / 战斗 → E6 宿主；**渲染仍归 B3** |

### 4.2 目标 API（上游 → 我们，**逐条对照**）

| 上游 | 我们 | 说明 |
|---|---|---|
| `Map.IsPathAvailable` / `IsCanvasMovementTargetAvailable` / `TryGetMovementDestination` | `core/map/geometry.ts` + `map-table.ts` | **纯函数**，吃 path 掩码 + 多边形 |
| `MapNavigator.TryFindPath` / `HasLineOfSight` / `TryFindNearestReachablePoint` | `core/map/navigator.ts` | A* + `cellSize` / `footprintRadius` 参数化 |
| `MapGeometry.ParsePoints` / `Triangulate` | `core/map/polygon.ts` | 耳切三角化 |
| `Map.GetMapIdentifier` | `core/map/map-table.ts:identifierOf(map, key)` | **未知键 → 0**（照抄这个兜底，MP7） |
| `NpcHandler.GetNpcCondition` | `core/map/condition.ts:combine(conds, env)` | AND 元素 / OR `\|` split |
| `Operator.SplitCondition` / `condDict` | `core/map/operator.ts` | **6 算子 + 最左最先**（MC1） |
| `NpcConditionHandler.GetNpcCondition` | `core/map/condition.ts:evalCondition(op,key,value,env)` | 命名空间分派 + 兜底 |
| `NpcHandler.GetNpcEntity` | `core/map/action.ts:resolve(handler, env)` | **只出决议**（不执行） |
| `NpcActionHandler.*` | **执行在 L1/L4 + 邻线接口** | 弹窗=**A3/C2**；面板=**C2**；传送=L1 会话；道具=**item 线**；战斗=**E6**；写盘=**R4** |
| `NpcButtonHandler` | `core/map/button.ts`（**类型 + 两张词表 + 两个枚举**） | **本线的基石类型** |
| `TeleportHandler.Transport/Teleport/SwitchDayNight` | `logic/map/session.js` | 走位 → 抵达 → 切图；镜像图 = `-id` |
| `BattleInfo` / `BossInfo` | `core/map/battle-spec.ts` | 出 `BattleSpec` → **E6** |

### 4.3 三条路径（**别混**）

1. **PVE 地图事件路径**：`点击/进入实体` → `GetButtonEvent`（5 种 UI 事件）→ `条件组合` → `动作决议` → **执行**（面板/提示/传送/发宠/战斗/活动）。
2. **对话路径**：`openDialog` → `取 dialogHandler[0]` → `branch 选择` → `content 渲染（`{expr:}` 插值）` → `functionHandler/replyHandler`（**又是按钮**）→ 动作。
3. **战斗路径**：`battle` 动作 → `battleHandler` 里按 id 找 `<battle>` → **按条件选 `<branch>`** → `阵容（BossInfo）` → **E6 开战** → 胜负 → `winHandler/loseHandler`（**又是按钮**）。

### 4.4 与邻线的接线

| 邻线 | 接口 |
|---|---|
| **B3（渲染）** | B3 要的"实体表 + 光口 + 出口名 + 脚标"由本线的桥供给；**光口已接**，NPC 表现待 B3 |
| **E6（战斗宿主）** | `BattleSpec`（`settings` + `BossInfo[]`×2 + 胜负按钮链） |
| **C2 / A3（面板与提示）** | `openPanel` ⇒ `{panel, args}`；`openHintbox` ⇒ 提示规格（`type/title/content/option_num/callback/item_icon/…`） |
| **item 线** | `setItem` ⇒ `{op ∈ add/remove/add_to_yite/remove_from_yite, (id,num)[]}` |
| **D6（宠）** | `getPet/removePet/setPet/evolvePet` ⇒ 域对象操作（写侧在会话/存档） |
| **编排线** | `Player.currentMapId` / `mapInitPos` 这类 `SceneData` / 场景切换 / **写盘** |
| **runtime R3/R4/R5/R7** | 存档读写面 / 写盘 sink / 提示 sink / 内容表注册 |

---

## 5. 不变量（**MP1–MP8** · 破了即 bug）

- **MP1 · 单一真值**：地图数据只在 **L2 取数入口**（`game/app/content.js` 的 `loadMap(id)`）进入进程 —— **按需 fetch 单图 XML + 现场解析**（方案 C，人类 2026-10-18）；
  **L0/L1 不自己取数**（不 fetch、不读 JSON 文件），只吃传进来的 `MapRecord`。⚠️ `game/data/maps.json`（AS3 血统）是**另一条**（B3 画面），与本条无关。
- **MP2 · 纯函数**：`core/map/**` 的**条件求值**与**动作决议**必须**无副作用**（不写盘、不弹窗、不改状态）；
  一切副作用发生在**执行阶段**（L1/L4 + 邻线接口）。**决议 ③**。
- **MP3 · 不直调**：`game/core/**` 里**不许**出现 `Item.*` / `Pet.*` / `Panel.*` / `SaveSystem.*` / `Activity.*` / `Mission.*` 的静态直调
  （上游 `NpcActionHandler` 里遍地都是 ⇒ 一律改**注入面**）。同 `docs/item/item-design.md` 的口径。
- **MP4 · 中文只进 DOM**：地图 SWF 的字体子集**无 CJK 字形** ⇒ 任何中文（出口名、NPC 名、对白、提示）**不能**交给 SWF；
  **B3 §3 已拍板**，本线的数据面**必须**给到宿主（不能只在 SWF 里）。
- **MP5 · 传送是两步**：**先走位、后切图**（`Transport` → 抵达 → `mapEnter` → 切图）；**不许**瞬移；
  走位失败（72px 内无落点）**不切图**。
  ⚠️ **上游违反这一条**（M5 §2.3，**TPC3**）：`Transport` 永远传 `onArrive`，失败分支回落原点 ⇒ 空 path 被补成单点 ⇒ **一步直达不可达的光口**。
  ⇒ 我们的口径**比上游更强**：不可达要出**显式决议** `unreachable`（不是"走到最近点"、更不是"直接切图"），见 **M5 §3.2**。
- **MP6 · 可走性以数据为准**：`path` 纹理白像素 = 可走；**无 path 素材**时退回**内框**
  （`Map.IsPathAvailable` 的**精确兜底** = `x∈[0,960] ∧ y∈[20,540]`，**不是** `960×540` 一整块）——**不许**把"没有素材"当"全可走"。
  ⚠️ **但登记一条现状**（M7 §2.1【样本】）：导航**真正调的是** `Map.IsCanvasPathAvailable`，而它无素材时 `return true`（**全可走**）——
  且重启件里 `pathSprite == null` 是**常态**（`pathId` 仅 **13** 张 / `geometry` 仅 **1** 张）⇒ **现行实际行为 = 全可走**。目标行为仍是"退回内框"（见 **MC7**）。
- **MP7 · 未知键静默兜底**：未知 `action` → `None`；未知 `type` → `None`；未知条件命名空间 → 走兜底求值；`Map.GetMapIdentifier` 未知键 → `0`；
  未实现的动作（活动/任务/邮件/小游戏/钓鱼/牧场）→ **解析成功、执行记"未实现"**，**不抛**（同 D0 §1 V2 与决议 ②）。
- **MP8 · 出口名取自己**：悬浮说明用 `<teleport name>`（**出口自己的名字**），**不取目标图名**。
  【样本】两套口径都核过：**Unity（权威血统）393 条全有名（空名 0）/ 悬空目标 0 / 162 个不同值 / 与目标图名不同 20 条**
  （含**每一条飞船出口**「传送室」→ `10001`「传送仓」，与夜版图口名）；**AS3 308 条里 25 条不同、1 条为空**。详见 **M5 §2.8**。

---

## 6. 上游怪癖 / 危险设计（**MC1–MC8** · 声明 + 改判）

> 口径 = `AGENTS.md §2`（**声明 + 不照搬**）与 **人类决议 ②**。登记的是**上游代码逻辑 bug / 危险设计**；
> **发行数据里的拼写/水印照搬**（那是行为，不是 bug）。
>
> ⚠️ **子设计各自另立本族怪癖家族**（**不占本处 `MC` 号**；引用须带文档名）：
> **M1 `docs/map/map-data.md §7.1` = MDC1–MDC9**（同名不同型的 `resId`、`fightMapColor` 对非 mod 恒灰、
> `GetNpcInfo` **只查 `npcs`** 所以另外五类的战斗分支永远查不到、`worldId` 把 `Grass`/`Station` 算成同一个 0、
> `geometry` 默认是"空对象"而不是 `null` 等）；
> **M2 `docs/map/map-npc.md §7.1` = MNC1–MNC10**（`TrimEnd(".png")` **当去后缀用**、
> `setPet`/`evolvePet` **边界检查与写入用两个不同数组**、`npcList.Add` **撞重复键即抛**、
> NPC 条件**不走全角转换**（`toHalf: false`）、`callback` **无上限递归**、胜负链里**夹一段硬编码活动**等）；
> **M3 `docs/map/map-condition.md §7.1` = CSC1–CSC12**（★**`Activity.Find` 是 get-or-create ⇒ 读一次条件可能往存档加一条空活动**、
> ★**兜底把未知键当 0 ⇒ `active=false` 恒真**、`random[new]` **用旧值出判定（只是推进序列）**、纹章除 4 **两条臂位置不同**、
> `activity` 的 `bool` 臂**无视算子**、空集哨兵 `float.MinValue` ⇒ **"没有"同时满足一堆区间条件**等）；
> **M4 `docs/map/map-dialog.md §7.1` = DLC1–DLC12**（★**`story=` 前缀是一次性消费的破坏性改写**（`rawContent` 就地被改 ⇒ 第二次打开不再走剧情层）、
> ★**"点背景关闭"= 7 条件门 ⇒ 实测 426 个单选项分支里 117 个关不掉、224 个多选项分支全部关不掉**、
> `type="branch"` **位于 index 0 即静默丢弃**、附挂项**绕过 `replyClickHandler`**（该钩子在地图流程恒 null ⇒ 那段是死支）、
> 找不到分支 ⇒ **静默关对话**、`SetCurrentNpc` 写在放弃**之前**、`CloseDialog` **不清 `currentNpc`**、
> `{expr:}` **替换后从头重扫**（二次求值无上限）+ **`random` 类表达式会让同一条对白两次打开文本不同**、
> 开对话顺手 `isShootMode = false` + **`UILayer.SetActive(false)` 整层藏 HUD**、同 NPC 重复 branch id 后一个永不可达等）。

- **MC1 · 条件切分"最左最先"**：`Operator.SplitCondition` **按字典插入序**扫描算子并取**第一个命中**，
  且 `NOT` 是**无空格写法**（`featureIdNOT10499`）。⇒ **一个含 `<` 的 value 会被切错**（如 `a<b` 形式的嵌套）。
  ⚠️ **实测定量**（M3 §2.1，2,160 条子条件）：**值侧仍含算子的 = 0**、**一个算子都没有的 = 0**
  ⇒ "切错"与 `Substring(0,-1)` 抛异常**两条路径在发行数据里都不可达** —— 本条是**规则本身脆弱**，不是**正在发生的错误**。
  症状（若数据出现该形状）：条件静默求值错 / 求值器抛。**目标**：**保留**"最左最先 + 6 算子"这套**可解析性**（数据依赖它），
  但**显式实现**（不依赖字典顺序）并**登记**"value 里禁出现未转义算子字符"。
- **MC2 · `<button type>` 双重语义**：词表 `buttonEventTypeDict` **只有 5 条**，而实测有 **15 种**取值。
  在 `eventHandler` 里它 = **UI 事件**；在 `callbackHandler` 里它 = **自定义标签**（与 `param` 的 `callback=<标签>` 配对，靠 `typeId` 相等匹配）。
  症状：`GetButtonEvent` 对 10 种取值**返回 `null`**（`evolve/choose/shoot/miracle/win/gacha*/get_pet/battle/teleport`）——
  这些标签**是别的消费方**（进化面板 / 抽奖面板 / 战斗结算）在**自己的**表里认领的。
  **目标**：**照录枚举**（数据要能解析），**明确**"只有 5 种映射 UI 事件"，其余按消费方标签转发。
  ⚠️ **本条的实测精确化**（`docs/map/map-npc.md §2.3`，272 张分段普查）：**`eventHandler` 只用到 5 种**取值
  = `click` **682** / `auto` **66** / **`shoot` 25** / `exit` **4** / `enter` **4**（`hover` **0**）；
  **`callbackHandler` 用到 10 种** = `evolve` **128** / `choose` **35** / `miracle` **24** / `teleport` **11** / `miracle_choose` **8** /
  `win` `gacha_10` `gacha` 各 **4** / `get_pet` **3** / `battle` **2**。
  ⚠️ 两个要紧的例外：**`auto` 不是 UI 事件**（`GetButtonEvent` 的 switch 只有四个 case ⇒ 走**进图批处理**）；
  **`shoot` 根本不在词表**（⇒ `type = None`）却**照样生效** ⇒ 由 `NpcController.Shoot()` **按 `typeId` 原串**认领。
  ⚠️ **第三个容器切片**（`docs/map/map-dialog.md §2.3`）：对话的 `functionHandler` / `replyHandler` 里 **`type` 只剩"是不是 `branch`"这一个有意义取值**
  （`DialogView` **不查事件名表**）⇒ 实测 **4 条没有 `type` 的 `<func>`** 在对话里**照常渲染、照常点击**（同一个缺失值在 `eventHandler` 里则挂不上事件）。
  ⇒ **目标**：`type` 的语义**按容器分派**，解析器**不许**跨容器共用一张表（**DLI3**）。
- **MC3 · 射击模式门**：`if (Player.instance.isShootMode ^ (handler.typeId == "shoot")) return;`
  ⇒ **射击模式下只有 `type=="shoot"` 的按钮生效**，其余按钮**全被吞**（且这个门**在条件之前**）。
  ⚠️ **对话会改掉这个门的输入**：`DialogManager.OpenDialog` 第一步就 `Player.instance.isShootMode = false`（`:83`）
  ⇒ **对话期间所有选项的门恒走"非射击"侧**（实测：`type="shoot"` 的 `<button>` **25** 条都在 `eventHandler` 里，没有一条进过对话容器）——
  登记为 **DLC9** 并**不照搬**（目标：内核不碰射击模式，见 `docs/map/map-dialog.md DLI8/DLQ3`）。
  症状：射击小游戏里点了没反应。**目标**：**显式建模**为"模式门"（一个环境标志），并写明"模式互斥 = 只有本模式的按钮可见"。
- **MC4 · `IsMod` 与昼夜镜像撞名**：`IsMod(id) = id < -50000 || id == 0`，而**昼夜镜像**用**小负数**（`-203`）。
  两者都表现为"非正数/非正常图"但**判据不同**（一个按量级、一个按符号）。
  症状：把镜像图当 mod 图 ⇒ `worldId` 算错 / 素材解析错。**目标**：**两类分开命名**（`isMod` / `isMirror`），镜像 = `-abs(id)`。
- **MC5 · 条件的随机数会**写回会话键袋**（⚠️ 本条 2026-10-17 由 M3 实测**纠正**：原写"写回存档"是错的）**：
  `GetRandom` 的 `[new]` **先按旧值出判定、再现场摇一个写回** `Player.instance.random`；
  ⚠️ 而 `Player.random` 是**属性**，getter/setter 就是 `sceneData["random"]`（`Player.cs:31-34`）⇒
  **它不住在 `GameData` 里、`System/Data/GameData.cs` 全文无 `random` 字段、SaveSystem 不碰它**，
  且 `Player.Start()` 每次重摇 ⇒ **随机数是"会话级"、不是"存档级"**（切场景不清、退出进程才清）。
  `[old]` 用**键袋里那一个**（同会话内可重复求值）。且 **纹章 200051 ⇒ 读侧 `/4`**（整除，发生在 **getter** 里 ⇒
  `[old]`/`[new]` 与 `GetNumIdentifier` 全都自动吃到；`[a~b]` 那一臂**另在算完后再 `/4`** ⇒ **两条臂的除 4 位置不同**）。
  症状：条件求值**有副作用**（写会话态）；且**同一条件重复求值结果不稳定**（`[new]` 每次不同）。
  **目标**：**显式建模**为"夹带一次 RNG 注入的求值"（决议 ①：RNG 是组件，**不逐值一致**），
  副作用**上移**（不写在求值里）；**并且**登记"某条条件求值几次 = 数据决定的"。
  ⇒ **落地上比原记的轻**：**不需要**存档写侧接缝（R4），只需要 `MapEnv.sceneData` + `MapEnv.rng`（MQ3）。
- **MC6 · `data.` 是运行时面板回填的键**：`data.<面板>.<键>` 走 **`Player.GetSceneData(<面板>)`**，取的是**面板塞进去的活对象**
  （宠 ⇒ 转 `GetPetIdentifier`，否则 `ToString()` 再数字解析）。⇒ **条件求值依赖"某个面板当前开着"**。
  症状：面板没开时条件恒 `0=…`。**目标**：**显式建模**为"会话级键值袋"（`SceneData`），并在文档列明**每个键由谁写**。
- **MC7 · "没有素材"当"全可走"的两处**：`Map.IsPathAvailable` 无 pathSprite ⇒ **硬编码 `x∈[0,960] ∧ y∈[20,540]`**；
  `IsCanvasPathAvailable` 无 pathSprite ⇒ **直接 `true`（全可走）**。⇒ 缺素材时**行为不一致**，且第二个会把角色放进墙里。
  ★**导航真正调的是后者**（"全可走"那一支），而缺素材是**常态** ⇒ **现行实际行为 = 整图可走**（M7 §2.1）。
  **目标**：**统一**为"无 path ⇒ 用内框"，**不许** `true`。
- **MC8 · "识别"级别的兜底会吞错**：未知 `type`/`action` 一律 `None`，`GetNpcAction` 的 `_ =>` 分支**执行 `handler.callback`**
  ⇒ **未知动作会变成"什么都不做"或"执行回调"**，**不报错**。
  症状：数据写错（拼错的 action）**静默失效**。**目标**：**保留不抛**（MP7）但**加一头"未知动作/标签"的登记与日志**（人可查）。

---

## 7. 决议表 · 待拍板（**MQ1–MQ8** · 本线局部编号 · **已拍板 2026-10-17**）

> ✅ **本表即本线的"决议表"**：人类 2026-10-17 的常设指示「**都按你的建议来吧**」⇒ **MQ1–MQ8 全部采纳原建议**。
> 人类若否决其中某条，**只改那一条**（并同步 §2.1 末、§4.1/§4.2、§8 与 AGENTS.md §4 台账）。
> **编号纪律**：`MQ1–MQ8` 是本线**局部**编号，**不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）。

| # | 问题 | 事实（可核） | **结论**（✅ 2026-10-17 拍板） |
|---|---|---|---|
| **MQ1** | **写侧以哪套血统为权威？**（AS3 爬取件 vs 重启 Unity 件） | AS3 `swf/map/config/*.xml` **259 张**、**6 个具名 handler**、`<battle>` **实测 0 条**；Unity `Resources/Data/Maps/*.xml` **272 张**、**246 张含 NPC / 198 张含 `<battle>`（337 条 / 680 条 `<branch>`）/ 1,996 条 `<condition>` / 4,355 条 `<action>`**（§2.1，★**解析口径**，非 grep） | ✅ **写侧 = 重启血统**（它是"重启"玩法实际跑的数据，且本项目以重启为真值）。⚠️ **渲染素材不变**：仍按 B3（SWF = AS3 血统），对齐规则 = MQ2。⇒ **本线是"双血统并用"**：规则/实体/条件/动作来自 Unity，画面来自 AS3 |
| **MQ2** | **图 id → 素材名 的对齐规则** | Unity 272 张里 ① `resId` 命中 **4**、③ `<id>.swf` 命中 **47**；**AS3∩Unity 137 张里 134 张有本地 swf**（§2.1） | ✅ **四级回退链**：① Unity `<map resId>` ⇒ `<resId>.swf`；② **同 id 的 AS3 config** 的 `<resource url>`；③ `<id>.swf`；④ 都无 ⇒ `swfOk=false` 走 B3 已有的 `mapFail`"缺图"路径。**施工口径 = 先做那 134 张**（MB1）；⚠️ **方案 C 起**：这条链在**运行时**跑（`parse-map.js` + 存在判据注入：浏览器 HEAD / node `existsSync`），**不预先算好存文件** |
| **MQ3** | **条件求值要读的域状态怎么给？** | 上游 `NpcConditionHandler` 里遍地静态直调（`Item.*` / `petBag` / `Activity.Find` / `Mission.Find` / `Player.GetSceneData`），§2.6 命名空间表 **14 个前缀** | ✅ **注入面 = 一个 `MapEnv`**（一件一缝，附和运行时线 **R3/R7**）：`{ items, petBag, firstPet, map, npcRuntime, battleState, sceneData, activities, missions, player, rng }`；`core/map/**` **只声明接口、零上层 import**（MP3）。⚠️ 其中 `activities/missions` 是**形状占位**（MQ6 出局），不许变成"偷偷实现活动/任务"的入口 |
| **MQ4** | **动作怎么"出决议"而不执行？** | 上游 `NpcActionHandler` 481 行**边算边执行**（`SetActivity` 直接 `SaveSystem.SaveData()`、`OpenHintbox` 直接建 UI），违反决议 ③ | ✅ `core/map/action.ts` 出 **`ActionIntent = { action, params, target, npc, map }`**（纯数据、可序列化、可日志）；**执行器** = `logic/map/action-runner.js`（L1）+ 邻线接口：**面板 = C2 / 提示 = A3 / 道具 = item 线 / 宠 = D6 / 战斗 = E6 / 写盘 = R4**。⇒ 这是 MP2 的实施面。⚠️ **落码形状以 `docs/map/map-npc.md §3.2` 为准**（**13** 变体的可辨识并集，**不带 `npc`/`map`** —— 它们由执行器的 `ctx` 提供）；实况见 `docs/map/map-impl.md §7.3.5` |
| **MQ5** | **昼夜镜像图（负 id）怎么建？** | Unity 独有 135 张里 **26 张是负 id**；`SwitchDayNight` 的判据是 `Mathf.Abs(switch) == 1` ⇒ 目标 = `-currentMapId`；`IsMod(id) = id < -50000 \|\| id == 0` 与之**撞名**（MC4） | ✅ **镜像 = `-abs(id)`，不单独建数据**（**例外**：Unity XML 里该负 id **自带 `<entities>`** ⇒ 照录成独立图，因为它的实体与正图不同）。⚠️ 命名强制分开：`isMod`（按量级）/ `isMirror`（按符号），**不许**用一个"非正常图"布尔混掉 |
| **MQ6** | **活动/任务/邮件/小游戏/钓鱼/牧场这 6 类动作怎么办？** | `<action>` 频次：`setActivity` **606** · `setMission` **30** · `player` **4** · `fish` **4** · `miniGame` **2** · `mail` **0**（`SetMail` 是死枚举）（§2.1） | ✅ 按 `docs/architecture.md §1.1` **A 组出局**：**枚举与参数形状照录**（数据要能解析、不抛 = MP7），**执行 = 记"未实现"日志 + 不动状态**。`mail` **只留枚举**（0 次调用）。⚠️ **A 组不许被本线顺手实现**（要做得先改 `§1.1`）。<br>⚠️ **一处例外（人类 2026-10-18 拍板 ①，见 §9.1.1）**：**`setActivity` 从"不动状态"改为「只写袋」** —— 一次键值写入**存档里既有的 `<activityStorage>`** + 日志；**仍不做活动玩法**（无开放时间/奖励/UI）⇒ `docs/architecture.md §1.1` 的"A 组出局"**无改动**（这不是实现活动，只是让 48% 的条件别恒假） |
| **MQ7** | **`openPanel` / `openHintbox` 本线出到哪一步？** | `<action>` 频次：`openDialog` **1243** · `openHintbox` **941** · `openPanel` **140**；上游 `OpenHintbox` 直接建 UI（`NpcActionHandler.cs:103-146`） | ✅ 出**结构化规格**即收口：面板 ⇒ `{panel, args}`（`SPTBoss[page=2]` 这类形态**照录字符串 + 解析出 `page` 参数**）；提示 ⇒ `{type, title, content, option_num, callback, item_icon, …}`（键集 = 上游实际读到的那些，见 M2 §动作形状）。**渲染与交互 = C2 + A3**，本线**不画一个像素** |
| **MQ8** | **对话的 `{expr:…}` 插值归谁？** | `DialogInfo` 的 `<content>` 支持 `{expr:…}`，走 `Identifier.GetIdentifier`（§2.8）；D5 已拍板"技能描述文本的生成属域" | ✅ **本线**（它是**数据层语义**，走 `Identifier` 求值面）；**渲染归 View**。⇒ 与 D5 同口径，**不另起一套插值器** |

---

## 8. 等人手测确认项（`AGENTS.md §1.1` 口径：**主验收 = 人手测**）

> ⚠️ **不写测试脚本**（决议 ⑦ 的加严）。以下是"**请人测什么、看哪里**"的清单；**MB1（方案 C：现场解析器 + `loadMap` + 对账工具）已落码（2026-10-18）**，其余批落地后由人类跑游戏反馈。

1. **【落地后】传送链不受新数据面影响**：进 `#/map` → 地图 `100`（信奉广场）→ 两个出口悬浮说明仍为 `草系主城` / `水仙草界`，
   点走近仍能切到 `90` / `151`（**回归**：新数据桥不得打破 B3 已落的这条链）。
2. **【落地后】NPC 数据能对上画面**：进一张**有 NPC** 的图 → 画面上的 NPC 与 `loadMap(id)` 现场解析出的该图
   `entities.npcs[]` **数量、名字、位置**一致（**看的是"对不对"，不是"数字对不对"**）。
3. **【落地后】条件门真的生效**：找一张 NPC 带 `<condition>` 的图（如活动/道具门槛）→ **条件不满足时点了没反应，满足时才有动作**。
4. **【落地后】对话分支**：找一张有 `<dialog>` 的图 → 对白文本、`reply` 选项、`{expr:}` 插值位显示正确；中文**不出方框/空字**（MP4）。
5. **【落地后】地图战斗触发**：找一张 `<battle>` 的图 → 点 NPC 进战斗，**敌方阵容 / 等级 / 血量**与数据一致；
   胜负后 `winHandler`/`loseHandler` 的动作（发宠 / 提示 / 活动计数）按预期发生。
6. **【落地后】A 组动作"记账不实现"**：遇到 `setMission` / `miniGame` / `player` / `fish` 的图 → **不崩、不卡住**，
   只在日志里出现"未实现"标记（MP7 / MQ6）。
7. **【可立刻做，无需落码】口径核对**：把 `game/data/maps.json` 里 `swfOk=true` 的图与**游戏里能进的地图**对一遍，
   看有没有"能进但缺资源"或"有资源但进不去"的（MQ2 的覆盖率反证）。

---

## 9. 子地图与施工批

### 9.1 子设计（`map-*.md`，地图 = **M1–M8**）

| 号 | 子设计 | 优先级 | 状态 | 内容 |
|---|---|---|---|---|
| **M1** | `map-data.md` —— **图与七类实体数据** | **P0**（地基） | ✅ 已成文（待评审） | 两套血统（§2.1）、`Map` 模型、七类实体、**现场解析器（方案 C）的字段清单**；本族 **MDC1–MDC9 / MDI1–MDI10 / MDQ1–MDQ5** |
| **M2** | `map-npc.md` —— **NPC 事件模型** | **P0** | ✅ 已成文（待评审） | `NpcButtonHandler`（基石对象）、**5 条词表 / 4 种 UI 事件 / 其余 10 种标签**（MC2 精确化）、**`auto` 的执行时机**、射击模式门（MC3）、**18 动作的 `param` 合同**；本族 **MNC1–MNC10 / MNI1–MNI8 / MNQ1–MNQ4** |
| **M3** | `map-condition.md` —— **条件 DSL** | **P0** | ✅ 已成文（待评审）· **CSQ4 ✅ 已决（2026-10-18）** | **1,996 元素 / 2,131 子条件的实测定量**（★本轮从 grep 口径纠正为解析口径）、6 算子 + 最左最先（**MC1 已补定量**）、**14 臂逐条**、`MapEnv` 注入面（MQ3）、**随机写回 = 会话态（MC5 已纠正）**、`data.` 键袋（MC6）、**★条件的存档副作用（`Activity.Find`）**、**空状态三值 `boolean \| 'unknown'`**；本族 **CSC1–CSC12 / CSI1–CSI8 / CSQ1–CSQ4** |
| **M4** | `map-dialog.md` —— **对话** | **P0** | ✅ 已成文（待评审） | `DialogInfo` **14 成员逐个实测**（`story*` 与 `color` **数据里 0 命中**）、**★`branch` 的三重身份**、**两套血统的两个 `<dialog>`**（Unity 279/655 vs AS3 132/128）、`openDialog` 的 **param 合同与作用域**（悬空 2 条可解析期判定）、**★`type="branch"` = 附挂到上一条可见项的隐藏动作**（一个按钮多条出路，实测 177 次"可见+附挂同时带条件"）、**★关闭 = 7 条件门**（309 可关 / 117 关不掉 / 224 多选项全关不掉）、`{expr:}` 真实分量（**1 条 content / 4 个表达式** ⇒ MQ8 落法）、`story=` **59 条 / 5 图且全在第一批外**；本族 **DLC1–DLC12 / DLI1–DLI8 / DLQ1–DLQ5** |
| **M5** | `map-teleport.md` —— **传送** | **P0** | ✅ 已成文（待评审） | **`TeleportInfo` 五列且★没有落点维**、**六个传送入口本线只认四个**（光口 393 / NPC `teleport` 106 / `transport` 56 / 昼夜按钮 45 图）、**两步走位 + 72px 环形搜索 + ★失败仍"单点直达"**（**TPC3** ⇒ 给 **MP5** 加 `unreachable` 决议）、**`mapInitPos` 在发行数据下是死机制**（生产侧 0 命中 ⇒ 改 `changeScene` 入参，**TPQ5**）、**昼夜 = 独立于传送的第二机制**（`@switch` 实测只有 `1/-1/71` ⇒ 解析期收窄，**TPC5**；⚠️ 同轮**推翻**了"光口不跨日夜"：跨日夜 **2/21/13** 条，可核的只有"孪生边 `X→-X` 全库仅 1 例"）、**★入口图 = 光口 ∪ `teleport` 动作**（**95** 张零光口入边 / **54** 张孤立 / **26** 张只活在动作层 ⇒ **TPI9**）、**★两套血统在传送上不可互换**（`@targetPos` 219 vs 0 / `initialPoint` 属性形 vs 文本形 / **坐标系 169 对全差 >4px**）、`mapId==0` **0 条可触发** · `50000` **恰好 1 条**、**MP8 两套口径都核过**（Unity 393 全有名 / 20 条 ≠ 目标图名）；本族 **TPC1–TPC9 / TPI1–TPI9 / TPQ1–TPQ5**（全 ✅）+ 施工批 **MDB5-a…e** |
| **M6** | `map-battle-trigger.md` —— **地图战斗触发与阵容** | **P0** | ✅ 已成文（待评审） | **★`<battle>` 只挂 `NpcInfo`**（198 张 / 337 个 `<battle>` / **680 条 `battle/branch`**，`<branch>` 另有 655 条挂 `<dialog>` ⇒ **必须按父作用域计数**）、**branch `@id` 是字符串且唯一性作用域 = 单 NPC**（不许建全局表，**BTI3**）、**★触发面 543 = 对话 391（`func` 243 + `reply` 148）+ NPC 152** ⇒ **M4 与 M6 必须同批**、`BattleSpec` 的**开工三门**（配置存在 / 首发没死 / 队伍过校验）、**`@count` 只裁己方**（实测 7/9 只写敌方，**BTI2**）、**敌方 1033 只仅 `@id/@level`**、`isMyWin = Win\|OpEscape\|CaptureSuccess` ⇒ **`winHandler` ≠ 硬胜**（12 条数据自己再筛 `battle.result.state=1`，**BTI8**）、**★`battle.` 两半键表 + 43 条用例**（M3 的输入）、**战后六条 + 只读窗口 `battleOrigin`/`lastBattle`**（**BTI9**，取代"忘了清空 `currentBattle`"）、**结算不得重播种**（**BTC7 ⇒ BTI10**，实测 158 条 `random` 条件会读到上一场余数）、**两套天气互不注入**（**BTI6**）；本族 **BTI1–BTI10 / BTC1–BTC11 / BTQ1–BTQ6**（全 ✅）+ 施工批 **MDB6-a…e** |
| **M7** | `map-move.md` —— **移动 / 几何 / 寻路 + 漫游 NPC** | **P1** | ✅ 已成文（待评审）⏸ **通行面搁置（2026-10-18）· 但漫游（`MDB7-e`）照做** | **★通行面两套机制**：`Map.IsPathAvailable`（`Map.cs:121-129`）缺 path ⇒ 内框 `x∈[0,960] ∧ y∈[20,540]`，`IsCanvasPathAvailable`（`:131-137`）缺 path ⇒ `true`，而**导航只调后者** ⇒ **缺素材（常态）时整图可走**（**MC7** 活支）、`pathId` **13** / `geometry` **1** / mirror 无 `Maps/path/`；**三套坐标 / 单位**不许混算（接手 **M5 §2.9**）；`MapNavigator`（`cellSize`/`footprintRadius` **8**、120×68 格、8 邻域 + 对角禁穿、Chebyshev 启发、`open` 线性 `Contains`、`closed` 不可重开、足印 8 点采样、`HasLineOfSight` **只查格心**、`TryFindNearestReachablePoint` 只扫恰在环上的格、`SmoothPath` LOS 拉直）；`PlayerModel`（`speed=8` **不乘 deltaTime**、抵达阈值 `4.8`、**不可达且 `onArrive≠null` ⇒ 空 path 补单点 = 一步直达**，同 **M5 TPC3**）；`MapGeometry`（`masks`/`collisions` 两列 + 射线法 + 耳切，消费者 = 导航足印 + B3 前景遮罩）；**死代码三件**（`IsPathAvailableByMousePos` / `IsCanvasMovementTargetAvailable` / `TryGetMovementDestination`，同 M1 **MDC9**）；**漫游 NPC 五件** —— ★**谓词实测 110/110 为真**（纠正 M6 §2.14）、`RequiresNavigator` **107**、`wander` 107 / `stationary` 3、wander 只 3 种列值、`<wild visual>` auto/animation/embedded（`visual`/`bobSpeed` **死字段**）、`talk` 的 `scene`/`player` **死表**、三半径系数 + 卡住检测（**假时间** `moveTick`）、气泡数值（像素归 B3）、**AS3 现役 `USE_GRID=false`（freeRoam）+ 栅格极性存疑**（**MP6**/`walk-polarity-unverified`）；本族 **MWI1–MWI11 / MWC1–MWC9 / MWQ1–MWQ5** + 施工批 **MDB7-a…e** |
| **M8** | `map-actor-look.md` —— **角色外观：穿戴装备与骑乘坐骑** | **P1**（资料索引 / 候补） | 🚧 **`MDB8-a`–`d` 手测通过（2026-10-20）· `MDB8-e`/`f`/`g`/`f2` 代码已落（e = 素材清单 + 缺包日志；f = SWF 叠层；g = 存档 `<equip>`）· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）** | **11 槽分层装备模型**（`MultipleEquipPlayer` × `EquipPlayer`，槽位深度两套方向序）、**两套数字空间**（物品 `referenceId` 6 位 vs 资源标识 `1+suit+slot` 也是 6 位，会撞号 = `ALI1`）、**资源标识 / `_0`/`_1` 镜像规则**、12 色默认裸装表、**部件包格式**（非真 SWF：大端头 + AMF3 标签 + info + PNG；`actor-view.js parsePack` 已兼容）、**坐骑 = 槽 3 装备包**（y=−50 / 藏手脚 / 速度 20→25 / 浮空 tween）、上游源码逐件行号、数据链（进图 / 1098 / 1019 / 配置定量）、素材清单（已缓存 18 包 / 37 预览 / 23 图标（快照）；29 只坐骑包待采）、**ALC1–ALC14 上游怪癖**（`ALC13`/`ALC14` = b2 第二轮手测修补）、复刻落点（L1 `actor-look.js` + L4 `mapScene.js`）、施工切片 **MDB8-a…g**（新增 f SWF 叠层 / g 存档接线）、**`ALQ1=A`**（存档 `<equip>`，正本 `save-xml-spec §2.22`）/ **`ALQ2=B`**（SWF 图叠 canvas 角色，不碰 `MapRunner`）/ `ALQ3–ALQ8` 按建议默认、12 条人手测清单。**`a` 已落并手测通过** = 数据桥 + L1 纯计划（as-built `map-impl §7.3.15`、手测 `§8.11`）；**`b` 已落（2026-10-20）** = JS 路 11 槽渲染（as-built `map-impl §7.3.17`、手测 `§8.13`）；**`b2` 已落（2026-10-20，`ALQ7` 改 B）** = 帧动画 + 4 向（as-built `map-impl §7.3.18`、手测 `§8.14`）；**`b3` 已落（2026-10-20，人类点名）** = 光轮/阴影手动切换（`ALQ9`；as-built `map-impl §7.3.19`）；**`c`/`d` 已落+手测通过、`e`/`f`/`g` 代码已落（清单 + 缺包日志 / SWF 叠层 / 存档 `<equip>`）；`a`–`g` 代码已全落** |

⚠️ **M3 报出的**CSQ4**：✅ **已拍板（人类 2026-10-18）** —— `activity` 是最大的一族（条件侧 **1,025** / 动作侧 `setActivity` **603**），
而活动按 `docs/architecture.md §1.1` **A 组出局**。**人类裁定 = 建一个「会话/存档级只存取键值袋」**（activity id → 平键 → 字符串值，**不含开放时间/奖励/UI**）。
⚠️ **本线补一条实证（不改变裁定，只把落点钉死）**：这个袋子**存档里早就有** —— `<activityStorage><Activity id=><data><entry><key><value>`（`docs/save/save-design.md §2` 第 13 行 / `docs/save/save-xml-spec.md §2.14`），
真机真档 `tools/fixtures/save-lite4.9.2-played.xml` 里有 **10 个** `Activity`（如 `noob` → `map=done` / `battle=done`）⇒ **键值袋 = 读/写既有的 `activityStorage`**，**不开新字段**（⇒ **不破** `round-trip` 保真）。

### 9.1.1 ⚠️ **2026-10-18 人类四条拍板**（对 M1–M7 与 impl 批序的直接后果）

| # | 拍板 | 后果（落到哪里） |
|---|---|---|
| **①** | ✅ **`activity` 键值袋：做**（只存取、无开放时间/奖励/UI） | **= 复用存档的 `activityStorage`**（上条实证）⇒ A5 臂开、`setActivity` 从"不实现"改成**"只写袋"**；见 `docs/map/map-condition.md §7.2 CSQ4`、`docs/map/map-npc.md §7.2 MNQ2`、`docs/map/map-impl.md §4 D9/§3.3/§3.4` |
| **②** | ⏸ **通行面（地图场景里的可通行区域）暂时搁置不实现** —— ⚠️ **但"不判断能否通行" = "哪里都能走"**（人类 2026-10-18 追问时明确） | ⇒ **M7 的 `walk` 列 / `geometry.ts` / `nav.ts` / `move-runner.js` 全部搁置**（**MB8**）；玩家走位与通行面**继续由 `MapRunner.as` 承担**（现役）；✅ **MB9（漫游）照做**（`wander.js` 无碰撞、在 `radius` 内直走）。⚠️ MB8 要重启得先解决"通行面来源"（见 `docs/map/map-move.md §3` 头部 + impl **D5**） |
| **③** | ✅ **过渡期"光口位置吃 AS3、目标图/落点吃 Unity"接受**（画面对齐 AS3、规则对齐 Unity） | = `docs/map/map-data.md §7.2 MDQ4` + **impl D2/D3**；**两套血统各自自洽、不许混算**（`MDI3`） |
| **④** | ✅ **房间里的实体（NPC / Avatar / pet）×表现 = 用 SWF 美术素材** | ⇒ 实体**美术来源 = SWF 素材**（不是新画的 DOM 图形）；**数据面**归本线（桥的 `resId`/sprite 分类，`MDI4`）、**像素与图层机制归 B3**（`docs/view/scene/room/view-scene-map-content.md`）；见 impl **D10** |

### 9.1.2 ⚠️ **2026-10-18 人类第五轮拍板：方案 C（运行时现场解析）**

| # | 人类原话（要点） | 后果（落到哪里） |
|---|---|---|
| **a** | "dev 期间直接吃上游，将 XML 目录路径编码为一个常量" | `game/app/content.js` 里 `MAPS_XML_DIR = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps'`；依赖 `tools/serve.mjs` 服务**仓库根**。⚠️ 打包期该路径不存在 ⇒ **已知备案、不阻塞** |
| **b** | "跨图数据/全图清单不需要" ⇒ **选项 A：不做小索引** | 跨图统计（95/54/悬空）**降级为离线对账**（`tools/map-audit.mjs`）；**运行时无索引、无全图清单** |
| **c** | "解析器收在 content.js" | **取数入口** = `content.js` 的 `loadMap(id)`；**纯解析器**独立成 `game/logic/map/parse-map.js`（node 跑不动 `content.js`：它用 `/game/...` 绝对路径 + `fetch`）—— 与存档线 `logic/save/codec.js` 同族 |
| **d** | "进过的图不要缓存" | `loadMap` **每次重新 fetch + 重新解析**；"当前屏幕上的那张图"不算缓存 |

⚠️ **C 的前身 = 构建期桥（旧 MB1 已落码 `f09da0a`）**：`tools/build-map-entities.mjs` → `game/data/unity/maps.json`（2.35 MB）。
**C 落码后该产物与本工具均已退役**（工具 `git mv` 为 `tools/map-audit.mjs`，只读不产；`manifest.json` 的 `counts.maps` 一并删除）。
**保留下来的** = 解析逻辑与那组判据数字（对账工具照打）。


### 9.2 施工批草案（**MB1–MB5**，等 impl）

> ⚠️ **执行序以 `docs/map/map-impl.md §2` 为准**：impl 把 `MB1–MB5` 展开成 **`MB1…MB10`** 可停点（`MB8` ⏸ 搁置、`MB9` 照做、`MB10` 人类点名追加）。
> 🚧 **M8 的施工切片 `MDB8-a…g` 不在 `MB1–MB10` 序列内**：**`MDB8-a`–`d` 已落+手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落（2026-10-20）**，**e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**；
> **`ALQ1=A`（存档 `<equip>`）/ `ALQ2=B`（SWF 叠层）已于 2026-10-20 拍板**，`ALQ3–ALQ8` 按建议默认；
> **impl 计划 = `docs/map/map-impl.md §3.10`**（`a` 的 as-built = `§7.3.15`、手测 = `§8.11`）。切片见 `docs/map/map-actor-look.md §9`。

- **MB1 · 现场解析**（⚠️ **方案 C 重定义**，见 §9.1.2）：`game/logic/map/parse-map.js`（纯解析器）+ `game/app/content.js` 的 `loadMap(id)`（取数入口）+ `tools/map-audit.mjs`（离线对账）。产出 = `MapRecord`（七类实体 + 四张处理器表的**原始串** + `<battle>` 分支 + `swf`/`swfOk`）。**先落 MQ2 的 134 张**。
- **MB2 · 基石类型**：✅ **已落码（2026-10-18）** —— `core/map/map-table.ts`（`MapRecord`/`EntityKind`/`AssetRef` + `identifierOf` / `isModId` / `isMirrorId` / `parseAssetRef`）+ `core/map/button.ts`（两词表 + 两枚举 + `uiEventOf`）。
  ⚠️ **算子不新建**：6 算子复用 `game/core/parser/operator.ts`（impl **D4**；原草案写的 `core/map/operator.ts` 作废）。as-built 见 `docs/map/map-impl.md §7.3.3`。
- **MB3 · 条件求值**：✅ **已落码（2026-10-18）** —— `core/map/condition.ts`（**A1–A15 十五臂** + `splitOrClause` 括号感知 `|` + 三值 `boolean|'unknown'`，**纯函数**）+ `game/logic/map/condition-host.js`（`MapEnv` **适配器**：`createMapEnv`/`mapViewOf`/`UNIMPLEMENTED_PET`，**只适配不取数**）。
  ⚠️ **两条与原文不同的口径**（as-built `docs/map/map-impl.md §7.3.4`）：① **`activity` 平键里的 `[...]` 是常态**（读侧 **947 / 1,025** 条 · 写侧 **578 / 603** 条）⇒ **不判"多级下标"**（**`map-condition.md §7.1 CSC8` 已就地订正**）；② **`A11 player.shoot/achievement` 两键真读**（原 `A9–A12` 合并行与 `MapEnv` 的 `player` 缝冲突，取更细者）。
  ⚠️ `core/map/keys-battle.ts`（A7 的 `battle.` 两半键表）**缓到 MB7**（随 E6 宿主一起落）；今天 `battleState` 恒缺 ⇒ A7 恒 `'unknown'`。⚠️ **可玩面随 MB5**（条件门与动作都要"点得到 NPC"才响，而接线在 MB5）。
- **MB4 · 动作决议**：✅ **已落码（2026-10-18）** —— `core/map/action.ts`（`ActionIntent` **13** 变体 + `resolve` 门序 **模式门 → 条件门 → 动作** + 模式抽象位 `MapMode`）+ L1 执行器 `logic/map/action-runner.js`（`run` 写盘**收口一次** + `callback` 链深 16）—— 接 C2/A3/item/D6/E6/R4。
  ⚠️ **三处与草案不同**（as-built `docs/map/map-impl.md §7.3.5`）：① `resolve` 加**可选第三参** `opts{mode,conditions}`（门序 `MNI3`/`MNI4` 要求模式门在条件之前，而模式不在 `MapEnv` 里）；② `unimplemented` 加 `reason` 字段（**23** 个可 grep 名）；③ `removePet`/`player` 两个 §3.2 成员本批**未发**（`MNQ4`）。⚠️ **可玩面随 MB5**（点不到 NPC）。
- **MB5 · 会话与接线**：`logic/map/session.js`（当前图 / 走位 / 抵达 / 切图 / 镜像）；把传送链换成**真数据**；NPC 事件接进 `mapScene.js`。

### 9.3 配对 impl 指针

- `docs/map/map-impl.md`（落地计划：M1–M7 + MB1–MB5 的**切片与顺序**；**M8 = §3.10 追加切片 `MDB8-a…g` + 插入 `b2`/`b3`/`f2`，`a`–`d` 手测通过、`e`/`f`/`g`/`f2` 代码已落、e 停点§8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」）、f 停点等 §8.18 手测、g 停点§8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」）、f2 停点等 §8.20 手测（修「双角色」）**）—— ✅ **已成文（2026-10-18；M8 §3.10 于 2026-10-20 追加）**：
  把 `MB1–MB5` 排成 **9 个可独立验收的执行序停点（`MB1…MB9`，其中 **MB8 ⏸ 搁置**、**MB9 ✅ 照做**）**（批号**沿用 design**），给 **`D1–D12`** 落地决策 + **`MIP1–MIP4`（✅ 人类 2026-10-18 全部拍板，见 §9.1.1 / 其 §9）** + **§7 存量 as-built**（光口/两步走/旧桥）+ **§8 请人测**（合并 M1–M7 各自的 §7.3；**M8 清单在它 §11**）。
- `docs/map/map-code-map.md`（代码地图：上游件 ↔ 我们的文件）—— ✅ **已成文（2026-10-18）**（逐文件 / 依赖方向 **M-1…M-8** / 接口表 / 人工核对清单）。
- 📝 `docs/map/map-actor-look.md`（**M8**：角色穿戴装备 / 骑乘坐骑的源码与素材索引）—— ✅ **已成文（2026-10-20）**；内含上游逐件行号、数据链、素材清单与采集法、**`ALC1–ALC14` 怪癖**、落点、`MDB8-a…g` 切片（+ 插入 `b2`/`b3`）、**`ALQ1=A`/`ALQ2=B` 已拍板 · `ALQ7` 改 B · `ALQ3–ALQ8` 按建议默认 · `ALQ9` = 光轮/阴影切换**、12 条人手测清单。**`MDB8-a` 已落并手测通过（数据桥 + L1 纯计划，as-built `map-impl §7.3.15`）；`MDB8-b`/`b2`/`b3` 已落并手测通过（JS 路 11 槽渲染 + 帧动画 + 光轮/阴影切换，as-built `map-impl §7.3.17`/`§7.3.18`/`§7.3.19`）；`MDB8-c` 已落并手测通过 = 会话态 + 正式调试入口（as-built `map-impl §7.3.20`）；`MDB8-d` 已落并手测通过 = 坐骑速度 + 浮动（as-built `§7.3.21`，人类「it worked good」）；`MDB8-e`/`f`/`g`/`f2` 代码已落（e = 素材清单 + 缺包日志，as-built `§7.3.22`；f = SWF 叠层，as-built `§7.3.23`；g = 存档 `<equip>`，as-built `§7.3.24`）· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）；`a`–`g` 代码已全落**。
- ⚠️ **本份 §4.1 的落点表有三处收窄，以 `map-impl.md §4` 为准**（更细者为准，`docs/arch-docs.md §3`）：**D4**（`operator.ts` **不新建**、复用 `game/core/parser/operator.ts`）· `nav.ts` 命名（非 `navigator.ts`）· **D10**（实体表现 = SWF 美术素材，§9.1.1 ④）；**MB 编号未动**。
- ✅ **子设计 M9（人类 2026-10-20 点名 D 触发 · 同日「照抄 JS 图那里的设定」**过审）`docs/map/map-swf-puppet.md`（**SWF 路角色提线化 = 地图与角色相分离**）：起因 = f2 手测反馈「SWF 图角色一抖一抖」，根因 = `mapState` 每 6 帧回报（≈4Hz），平滑救不了采样率 ⇒ 实现 = `MapRunner.as` 退为**背景 + 相机从者**（puppet 协议 `setPos`/`walkReached`/`mapClickWant`/`mapWantWalk` = `game/maprunner/**` **第三处授权例外（成立）**），走位/朝向/绘制归 JS 逐帧（复用 `stepJs` + `drawActor`；puppet 路黄点退役）。`MPQ1–MPQ6` 收敛为该稿 §5 决策记录。✅ **`MDB9-a` 已落并手测通过（2026-10-20，「nice, 现在ok了」；as-built `map-impl §7.3.26`、手测 `§8.21`）**；`b` = 交互改道回归（清单 `map-impl §8.22`、零新增码、**✅ 已过 2026-10-20「都过」**）；`c`（旧链退役收口）**✅ 已拍板 A·退役（2026-10-20「A · 退役」）、落码并手测通过（as-built `map-impl §7.3.27`、手测 `§8.23` ✅ 2026-10-20「整体结账」）—— ★M9 全线结账**。⚠️ 已过审 ⇒ 下一条「玩家走位继续交 `MapRunner.as`」的口径**由 M9 取代**（SWF 图走位改 JS 驱动；`&puppet=0` 旧链已于 c 批退役 ⇒ puppet 唯一通路）。
- ⏸ **含一处排期改动**：随 §9.1.1 ② **通行面搁置** ⇒ **M7 的 `walk` 列 / `geometry.ts` / `nav.ts` / `move-runner.js` 与其批（MB8）一并搁置**（`map-impl.md §2` 批表已标记）；~~**玩家走位继续交 `MapRunner.as`**~~（= `map-impl.md` **D5** 的扩大版；⚠️ **★M9 过审后 SWF 图走位改 JS 提线**，`&puppet=0` 旧链已于 **`MDB9-c` 退役**（人类 2026-10-20「A · 退役」）⇒ puppet 唯一通路；通行面搁置不变 = `USE_GRID=false` 整图可走）。✅ **但 `wander.js`（MB9）照做**（人类 2026-10-18："不判断通行 = 哪里都能走" ⇒ 无碰撞漫游）。
- ✅ **本线已交的两份**（impl / code-map）**不需要人类再评审 design 才能发码** —— `docs/map/map-impl.md §9` 的 `MIP1–MIP4` **四条已由人类 2026-10-18 全部结账**（见 §9.1.1）；
  ✅ **MB1（方案 C）已落码（2026-10-18，见 §9.1.2）**：`game/logic/map/parse-map.js` + `game/app/content.js` 的 `loadMap(id)` + `tools/map-audit.mjs`（旧产物 `game/data/unity/maps.json` 退役）。
  ✅ **MB2（基石类型）已落码（2026-10-18）**：`game/core/map/map-table.ts` + `game/core/map/button.ts`（+ 生成 `.js`）⇒ as-built 见 `docs/map/map-impl.md §7.3.3`。
  ✅ **MB3（条件求值）已落码（2026-10-18）**：`game/core/map/condition.ts` + `game/logic/map/condition-host.js`（+ 生成 `.js`）⇒ as-built 见 `docs/map/map-impl.md §7.3.4`（含 **`CSC8` 订正**）。
  ✅ **MB4（动作决议 + 执行器）已落码（2026-10-18）**：`game/core/map/action.ts` + `game/logic/map/action-runner.js`（+ 生成 `.js`）⇒ as-built 见 `docs/map/map-impl.md §7.3.5`（18 动作 / 偏差 **6** 条 / 改判表 **23** 个 `reason`）。
  ⇒ **下一步 = MB5**（`logic/map/session.js` + `logic/map/entity.js` + `mapScene.js` 接线；M5 的传送链）—— **第一个"玩家能感觉到"的批**（进图现场解析 + 点 NPC 有反应）。
