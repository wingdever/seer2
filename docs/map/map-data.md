# 地图线 · M1 —— 图与七类实体数据（map-data.md）

> **定位**：本份是地图线的**地基子设计** —— 回答"**一张图在数据里到底是什么形状**"：
> `Map` 的字段与默认值、**七类实体**的表形状、`NpcInfo` 的全字段、`resId` 的**形状家族**（它决定素材能不能对齐）、
> 通行面（`pathId`/`geometry`）在发行数据里的**真实覆盖率**、以及**现场解析器**（`game/logic/map/parse-map.js`，方案 C）的字段清单与归一化规则。
>
> **父文档** = `docs/map/map-design.md`（总设计兼导读 · **边界/不变量 MP1–MP8/决议表 MQ1–MQ8** 都在那里，本份**只细化不重复**）。
> 同线兄弟：**M2** `docs/map/map-npc.md`（NPC 事件模型）· **M3** `docs/map/map-condition.md`（条件 DSL）·
> **M4** `docs/map/map-dialog.md`（对话）· **M5** `docs/map/map-teleport.md`（传送）·
> **M6** `docs/map/map-battle-trigger.md`（战斗触发与阵容）· **M7** `docs/map/map-move.md`（移动/几何/寻路 + 漫游）。
> ⚠️ 同目录互引可写短名（`docs/arch-docs.md §7`），**跨线/跨目录一律全路径**。
>
> **真值源**（本份全部数字来自这两处，可逐条复算）：
> - **重启 Unity 件** = `projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps/*.xml`（**544 个文件 = 272 张 xml + 272 个 `.meta`**）【样本】
> - **上游源码** = `Assets/Scripts/Scene Specific/Map/**`（`Map.cs` 210 / `MapEntities.cs` 15 / `Entities/Npc/NpcInfo.cs` 170 / `MapMusic.cs` 51 含 `AnimInfo` / `MapResources.cs` 26）【源码】
> - **AS3 爬取件** = `swf/map/config/*.xml`（259 张）+ 本地素材 `swf/map/*.swf`（**227 个**）【样本】
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。**结构性断言一律带 `路径:行` 或 `路径:函数`**。
>
> **编号纪律**：本份本地清单 = **MDI1–MDIn**（不变量/契约）/ **MDC1–MDCn**（怪癖与危险设计）/ **MDQ1–MDQn**（待核/开放）——
> **全是本线局部编号**，**不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）；线级 MP/MC/MQ/MB 归父文档。
>
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。依父文档 §7 决议表（MQ1–MQ8 已拍板 2026-10-17）。

---

## 0. 这份文档回答什么

1. **图的字段真值**（§2.1–§2.2）—— `Map` 有 12 个数据字段 + 6 个派生只读；**每一个在 272 张发行数据里出现几次**（覆盖率普查）。
2. **七类实体的表形状与真实份量**（§2.3）—— 六类共用 `NpcInfo`，但发行数据里**后四类几乎是空的**。
3. **`NpcInfo` 的全字段**（§2.4）—— 含**四张处理器表**（M2/M4/M6 的入口都在这里）。
4. **`resId` 有六种形状**（§2.5）—— 它是 MQ2「素材对齐」的真值核心；`GetIcon`/`GetAnim` 的解析规则逐条照录。
5. **通行面在 Unity 侧基本没数据**（§2.6 = 本份第一号实测结论）—— `pathId` **13 张**、`geometry` **1 张**。
6. **两套血统的字段形状差异表**（§2.7–§2.9）—— 同一个概念在 AS3 与 Unity 里**属性名、载体、坐标系都不同** ⇒ 桥必须**归一化**，不许"取一份扔一份"。
7. **现场解析器的字段清单与契约**（§3）—— 每图一条 `MapRecord`（运行时由 `game/app/content.js` 的 `loadMap(id)` **现场解析**产出），字段逐个定义 + 归一化规则。

---

## 1. 范围与边界

### 1.1 圈里（本份负责）

| 块 | 内容 |
|---|---|
| `Map` 图模型 | 12 个数据字段 + 派生只读 + `MapCategory` 枚举 + `worldId` 算式 + `IsMod` |
| `MapEntities` | 七类实体的**表形状**与**装配分流**（数据面，不含行为） |
| `NpcInfo` | 全字段（含 `AnimInfo`/`NpcWildInfo` 的**形状**）+ 四张处理器表的**容器名/元素名** |
| `resId` / `animId` | **形状家族**与解析规则（`GetIcon` / `GetAnim` / `IsMod` / `[expr]` 内插） |
| `MapResources` / `pathId` / `geometry` | 通行面与素材的**数据面**（算法面 → M7） |
| `MapMusic` / `AnimInfo` / `fightMapColor` | 图的**表现侧参数**（数值照录；怎么画归 B3） |
| **现场解析** | `MapRecord` 的字段清单、归一化规则、解析器与取数入口契约（方案 C：无构建期产物） |

### 1.2 圈外（本份不做，各归各位）

| 不做 | 归谁 |
|---|---|
| 四张处理器表**里面的语义**（`<button>` / `<condition>` / `<action>`） | **M2**（事件模型）+ **M3**（条件 DSL） |
| `<dialog>` 的分支/对白/插值 | **M4** `docs/map/map-dialog.md` |
| `<teleport>` 的走位与切图规则 | **M5** `docs/map/map-teleport.md`（数据形状在本份 §2.3 列，规则不在） |
| `<battle>` 的阵容与胜负链语义 | **M6** `docs/map/map-battle-trigger.md`（本份只记**容器形状**） |
| 多边形/`ContainsPoint`/A* 的**算法** | **M7** `docs/map/map-move.md`（本份只记**数据有没有**） |
| 怎么画、缩放、层序、中文补描 | **B3** `docs/view/scene/room/view-scene-map-content.md` |
| 音频的**播放**（`MapMusic` 只是数据） | **编排线** `docs/orchestration/orchestration-design.md`（音频缝） |
| 当前图是哪个、场景怎么切 | **编排线**（会话宿主） |

---

## 2. 上游真值

### 2.1 `Map` —— 字段全表（`Map.cs:9-38`）【源码】

| XML 名 | C# 字段 | 类型 / 默认 | 行 | 派生只读 | 备注 |
|---|---|---|---|---|---|
| `id`（属性） | `id` | `int` | :12 | —— | **可负**（镜像图，M5） |
| `resId`（属性） | `resId` | `int` = `0` | :13 | —— | Addressables 键；**272 张里只 39 张写了**（§2.2） |
| `pathId`（属性） | `pathId` | `int` = `0` | :14 | —— | 通行面纹理；**只 13 张写了**（§2.6，★关键缺口） |
| `name`（属性） | `name` | `string` | :15 | —— | 中文名 |
| `weather`（属性） | `weather` | `int` = `0` | :16 | —— | 0 = 无天气（B1 HUD 的天气钮 `weather==0` 时按上游隐藏） |
| `color`（属性） | `backgroundColorId` | `string` = `"255,255,255,255"` | :17 | `backgroundColor` → `ToColor(Color.white)` | **字段名 ≠ XML 名**；272 张里**只 1 张写了** |
| `category`（属性） | `categoryId` | `int` | :20 | `category` → `(MapCategory)categoryId` | **同样是字段名 ≠ XML 名** |
| —— | —— | —— | :22 | `worldId` = `IsMod(id) ? 0 : (categoryId-1)/100` | **整数除法**；mod 图恒 0 |
| `switch`（属性） | `dayNightSwitch` | `int` | :23 | —— | 昼夜开关；**45 张写了**（语义归 M5） |
| `dream`（属性） | `dream` | `bool` | :24 | —— | **只 3 张写了** |
| `fightMap`（元素） | `fightMapId` | `int` | :26 | —— | **Unity 是文本**（`<fightMap>100002</fightMap>`）；AS3 是属性（§2.8） |
| `fightMapColor`（元素） | `fightMapColorId` | `string` = `"255,255,255,255"` | :27 | `fightMapColor` = **`IsMod(id) ? 解析值 : (0.5,0.5,0.5,1)`** | ⚠️ **非 mod 图完全忽略数据** ⇒ **MDC2** |
| `initialPoint`（元素） | `initialPoint` | `string` | :29 | `initPoint` → `ToVector2()` | Unity = 文本 `"450,250"`；AS3 = `x`/`y` 属性 |
| `anim`（元素） | `anim` | `AnimInfo` | :33 | —— | 48 张有 |
| `music`（元素） | `music` | `MapMusic` | :34 | —— | **272 张全有** |
| `entities`（元素） | `entities` | `MapEntities` | :35 | —— | **272 张全有**（七类实体都在里面） |
| `geometry`（元素） | `geometry` | `MapGeometry` = `new()` | :36 | —— | ⚠️ **默认非 null**（空对象），**发行数据只 1 张真写**（§2.6） |
| —— | `resources` | `MapResources`（`[XmlIgnore]`） | :37 | `pathSize` → `resources.pathSize` | ⚠️ 运行时注入；**未注入即 `NullReference`**（MDC3） |

**静态面**（同文件）：`IsMod(int id) = (id < -50000) || (id == 0)`（:40）｜`GetMap(id, onSuccess, onFail)` **异步 + 返回"上一次缓存的图"**（:50-52，注释原文）｜
`GetNpcInfo(map, npcId)`（:54-56，`entities.npcs.Find(x => x.id == npcId)` ⇒ **只查 `npcs`，另外六类查不到** ⇒ **MDC4**）｜
`GetBattleInfo(map, npcId, battleId)`（:58-60）｜`TestBattle` 家族（:62-107，**开发调试用**，见 §2.9）。

**`MapCategory`**（:205-209）= `Ship=1, Grass=2, Station=100` —— **只有三个值**，而 `worldId = (categoryId-1)/100` ⇒ `Grass=2` 的 `worldId = 0`、`Station=100` 的 `worldId = 0`（整数除法）**同值** ⇒ **MDC5**。

### 2.2 ★字段覆盖率普查（**272 张发行数据实测** · 2026-10-17）【样本】

> **口径**（可复算）：`<map …>` 根属性 = `grep -lE "<map [^>]*\bKEY=" Maps/*.xml | wc -l`（**按文件计数**，一张图最多算一次）；
> 元素频次 = `grep -ohE "<KEY[ />]"`（**只数开标签**，`</KEY>` 不匹配）。⚠️ 这是**文本普查**不是 XML 解析 ⇒ 注释里的标签**会被计入**（§2.9 单列一条）。

| 字段 | 出现的**文件数** | 272 分母占比 | 一句话结论 |
|---|---:|---:|---|
| `id` / `name` / `category` | **272** | 100% | 三个**必有** ⇒ 桥的**必填列** |
| `initialPoint` / `music` / `entities` | **272** | 100% | 同上 |
| `weather` | **171** | 63% | 其余走默认 `0` |
| `fightMap` | **130** | 48% | ⚠️ **一半图没有战斗背景**（M6 的素材面要兜底） |
| `anim` | **48** | 18% | 动图装饰 |
| `fightMapColor` | **45** | 17% | ⚠️ 但**代码只对 mod 图生效**（MDC2） |
| `switch`（昼夜） | **45** | 17% | M5 的镜像图线索 |
| `resId` | **39** | 14% | ★ MQ2 的**第一级回退只有 39 张命中** |
| `dream` | **3** | 1% | 几乎没用 |
| `pathId` | **13** | **5%** | ★★ **通行面基本没数据**（§2.6） |
| `geometry` | **1** | **0.4%** | ★★ 只有 `-70.xml` 写了碰撞多边形 |
| `color` | **1** | 0.4% | —— |

**七类实体与子标签的总频次**（同样本）：`<npc>` **640** · `<teleport>` **433** · `<farm>` **12** · `<animal>` **15** · `<pond>` **30** · `<insect>` **8** · `<nest>` **3**；
`<dialog>` **300** · `<battle>` **344** · `<branch>` **1,371** · `<button>` **2,858** · `<condition>` **2,023** · `<action>` **4,429** · `<param>` **9,884** · `<func>` **486** · `<reply>` **1,098**。
**含该元素的文件数**：`<npc>` **252** · `<teleport>` **232** · `<dialog>` **193** · `<battle>` **199** · `<wild>` **54**。
⚠️ **本段是文本普查（口径见 §2.2 末）⇒ 含注释**。M5 按 XML 解析重数了 `teleport`：**393 条 / 211 张**（grep 433/232，差 **40 条 / 21 张** 全在 `<!-- -->` 里）
⇒ **桥按解析口径实现**（MDI7）；差值本身不改变"七类名不副实"这个结论。

> ⇒ **本份的第一个结论**：**"七类实体"名不副实** —— 除 `teleport`(433) 与 `npc`(640) 外，
> `farm/animal/pond/insect/nest` **合计只有 68 条**，且**牧场上半场景（`farm`/`pond`）= `docs/architecture.md §1.1` A 组出局**。
> ⇒ **桥照录七类**（MP7：数据要能解析），但**实现排期只按 `npc` + `teleport` 两类的量做**（MDI6）。

### 2.3 `MapEntities` —— 七类实体的容器形状（`MapEntities.cs:6-15`）【源码】

七个 `[XmlElement]`，**除 `teleport` 用 `TeleportInfo`，其余六类全部是 `List<NpcInfo>`**（同一形状，靠装配函数分流：`NpcHandler.CreateNpc/CreateFarm/CreateAnimal` = `NpcHandler.cs:11/19/27`）。

**`TeleportInfo`**（`Entities/Teleport/TeleportInfo.cs:8-17`）字段：`id` `name` `pos`(`posId`→`ToVector2`) `color`(`rgba`，**默认 `"255,255,255,128"`** ⚠️ 与 `NpcInfo.rgba` 的默认 `"255,255,255,255"` **不同** ⇒ **MDC6**) `targetMapId`。

### 2.4 `NpcInfo` —— 全字段（`Entities/Npc/NpcInfo.cs:12-57`）【源码】

| XML 名 | 字段 | 默认 | 行 | **发行数据出现文件数**（分母 = 含 `<npc>` 的 252） |
|---|---|---|---|---:|
| `id` | `id: int` | —— | :14 | **252**（100%） |
| `resId` | `resId: string` | —— | :15 | **252**（100%）⇒ 素材见 §2.5 |
| `name` | `name: string` | —— | :21 | **251**（⚠️ 有**空串**：`100.xml` 的 `10002` 是 `name=""`） |
| `description` | `description: string`（**元素**） | —— | :22 | —— （`100.xml` 的 `10001` 有） |
| `active` | `active: bool` | **`true`** | :23 | **32** ⇒ 94% 的 NPC 不写 = 默认可见 |
| `target` | `raycastTarget: bool` | **`true`** | :24 | **11** |
| `color` | `rgba: string` | `"255,255,255,255"` | :26 | **74** ⇒ 派生 `color = ToColor(white)` |
| `size` | `npcSize` | —— | :28 | **247**（5 张不写 ⇒ `size` 会 **NRE**：**MDC7**） |
| `pos` | `npcPos` | —— | :30 | **252** |
| `rotation` | `npcRotation` | `"0,0,0"` | :32 | **8** ⇒ `ToQuaternion()` |
| `namePos` | `npcNamePos` | **`"0,5"`** | :34 | **222** |
| `nameSize` | `nameSize: int` | `0` | :36 | **1** |
| `nameColor` | `nameRgba` | `"0,64,255,255"` | :37 | **0**（数据里从不用，全靠默认） |
| `nameFont` | `nameFont` | —— | :39 | **0** |
| `anim`（元素） | `animInfo: AnimInfo` | —— | :18 | —— |
| `gif`（元素） | `gifInfo: AnimInfo` | —— | :19 | —— |
| `wild`（元素） | `wildInfo: NpcWildInfo` | —— | :41 | 含 `<wild>` 的文件 **54** |
| `transport`（元素） | `transport: string` | —— | :43 | `transportPos = transport.ToVector2(pos)` ⇒ **缺省回落到 `pos`** |
| **`dialog`**（数组） | `dialogHandler: List<DialogInfo>` | —— | :46-47 | **容器名 `<dialog>` / 元素名 `<branch>`** ⇒ M4 |
| **`battle`**（数组） | `battleHandler: List<BattleInfo>` | —— | :49-50 | **容器 `<battle>` / 元素 `<branch>`** ⇒ M6 |
| **`eventHandler`** | `List<NpcButtonHandler>` | —— | :52-53 | **容器 `<eventHandler>` / 元素 `<button>`** ⇒ M2 |
| **`callbackHandler`** | `List<NpcButtonHandler>` | —— | :55-56 | **同形状、不同语义**（MC2 的另一半）⇒ M2 |

**`NpcWildInfo`**（:114-119）= `visual`（属性，默认 `"auto"`）+ `movement`（`NpcWildMovementInfo`）+ `talk`（`NpcWildTalkInfo`）；
**`NpcWildMovementInfo`**（:121-139）13 个字段：`mode="stationary"` `radius=120f` `speed=35f` `idle="2,6"` `step="14,30"` `moveTick=0.08f` `snap=1f` `bob=0f` `bobSpeed=2f` `flip=true` `debug=false` `originalFacesRight=false` + 派生 `isWander` / `idleRange` / `stepRange`；
**`NpcWildTalkInfo`**（:141-161）= `chance=0.35f` `duration=1.8f` `interval="5,10"` + 三个列表 `self` / `scene` / `player`（`NpcWildTalkContent{[XmlText] text, image}`，:163-170）+ `GetRandomSelf()` **用 `UnityEngine.Random`**（:153-160 ⇒ 决议 ①：RNG 走注入面，M7 消费）。
⚠️ 形状字段全在，**算法与调度归 M7**。

### 2.5 ★`resId` 有**六种形状**（`NpcInfo.cs:58-111`）【源码】—— MQ2 的真值核心

`NpcInfo.resId` 是 **`string`**（而 `Map.resId` 是 **`int`** —— 两个 `resId` **类型不同、语义不同**，别混）。`GetIcon(resId)`（:65-78）的分支顺序**照录**：

| # | 形状 | 样本（实测于发行数据） | 上游行为 | 我们要的语义 |
|---|---|---|---|---|
| ① | **空 / `"0"` / `"null"` / `"none"`** | `<teleport>` 无 resId；`resId="none"` **7 处**、`resId="0"` **13 处** | :66-67 ⇒ `SpriteSet.Empty`（**不报错**） | **哨兵串四件套** ⇒ 归一化成 `asset: null`（MDI4） |
| ② | **纯数字** | `resId="10001"` | :69-70 ⇒ `GetLocalAddressables<Sprite>("Npc/" + resId, IsMod(resId))` ⇒ **前缀 `Npc/`** | 归一化 `npc:<id>` |
| ③ | **带路径的图片名** | `resId="Pets/pet/251.png"`（`100.xml` 的野怪 NPC）、`Pets/pet/10.png` **9 处** | :72 起按**斜杠分段**解析 | 归一化 `path:<原文>`（**原样保留**，它是 AS3/本地素材的指针）。★`MDB12`（2026-10-21）：`Pets/pet/<数字>` 这一形**还额外是野怪帧包桥的入参**（数字 = 重启**形象 id** → `pet_appearance_swf.csv` → `swf/pet/normal/<n>.swf`；`.png` 可有可无）⇒ L1 `npc-art.petAppearanceId()` 只做这一件判形，**归一化本身未改** |
| ④ | **`Builtin/` 前缀** | —— | :74-77 ⇒ 剥前缀、`isBuiltin=true`（**不当 mod**） | 照录 `builtin:<余下>` |
| ⑤ | **`Mod/` 前缀 或 ≤ -5000100 的数** | —— | :58-63 `IsMod(string)`：数字 ⇒ `modId <= -50001_00`；否则 `StartsWith("Mod/")` | 照录 `mod:<余下>` + **与 `Map.IsMod(int)` 分开命名**（MC4） |
| ⑥ | **分段里带 `[expr]`** | —— | :72 ⇒ 每段 `TryTrimStart("[expr]")` 命中则 `Parser.ParseOperation(expr).ToString()` **现场求值** | ⚠️ **素材名依赖运行时求值**（同 MC6 的病）⇒ 桥**保留原串**，求值交给执行期注入（MDI5） |

**`GetAnim(animId)`**（:80-111）另有一套分支：空/`0`/`null`/`none` ⇒ `null`；`Pets/anim/<id>` 或纯数字 ⇒ `GetPetAnimPrefab(petId, "<expr>-idle")`（**用 `LastIndexOf('-')` 切 petId**）；`Maps/anim/<id>` ⇒ `GetMapAnimPrefab`；否则 ⇒ `GetAssetBundle(前段)` + `LoadAsset(后段)`（**用 `LastIndexOf('-')` 取 bundle、`LastIndexOf('_')` 取资产名 —— 两个不同分隔符**：**MDC8**）。

> **⇒ 对桥的硬要求（MDI4）**：`resId`/`animId` **一律以"原串"进桥**（`resIdRaw`），
> 派生的分类（`kind ∈ {none, npcId, path, builtin, mod, expr}`）由桥**算一次写死**，
> 但**不许**在桥里做⑥/`GetAnim` 那两类**运行时求值** —— 它们必须在执行期由注入面完成。

### 2.6 ★★通行面的数据现实（`pathId` 13 张 / `geometry` 1 张）—— 本份第一号结论【样本】

- **含 `<map … pathId=…>` 的只有 13 张**：`1084.xml` `-10 -20 -30 -40 -50 -60 -70 -80.xml`（**8 张是负 id = 镜像图**）`84 85 86 87.xml`。
  ⇒ **`pathId` 与昼夜镜像高度相关**（M5 的注），而**正图基本没有 path 数据**。
- **`<geometry>` 元素全仓只有 1 张**：`-70.xml` ⇒ 上游的多边形碰撞（`MapGeometry.cs` 371 行）**在发行数据里几乎没被喂过**。
- `Map.geometry` 的声明是 `= new MapGeometry()`（`Map.cs:36`）⇒ **默认是"空对象"而不是 `null`**，
  而 `IsCanvasMovementTargetAvailable`（:143）与 `TryGetMovementDestination`（:152）**都写 `geometry == null` 判断** ——
  **这两个判断在 Unity 侧几乎永远为假**（对象非 null、只是空）⇒ **MDC9**。
- `MapResources.pathSize` 走 `resources.pathSize`（`Map.cs:38`），而 `resources` 是 `[XmlIgnore]` 运行时注入 ⇒
  **`IsPathAvailable` 在没有 `resources` 时会 NRE**（`Map.cs:122` 直读 `resources.pathSprite`）⇒ **MDC3**。

> **⇒ 设计判定（MDI1，写进桥与 M7 的分工）**：**通行面 = AS3 血统**（SWF 内的 `path_mc`，`game/maprunner/MapRunner.as` 已在用），
> **不是** Unity 的 `pathId`/`geometry`。理由：① 实测覆盖率 **5% / 0.4%**；② 我们的**画面本来就是 SWF**（MQ1 的"渲染按 AS3"）；
> ③ `MapRunner.as` 的 `GRID_SIZE=10` + `path_mc` 已经是**跑通的那条路**。
> ⇒ **桥照录 Unity 的 `pathId`/`geometry`**（数据不丢），但**默认实现走 AS3 path**；两者不一致时**以 AS3 为准并记日志**（MDQ1 的口径）。

> ⚠️ **2026-10-18 补一条实测 —— 它把上面这条判定的前提动了**：重启侧**其实有**通行面素材，就在仓里。
> `ResourceManager.GetMapResources`（`System/ResourceManager.cs:600-645`）按
> `bg = Maps/bg/{resId}`、`pathSprite = Maps/path/{pathResId}`（`pathResId = isMod ? resId : (pathId == 0 ? abs(resId) : pathId)`）取图，
> 落进 `MapResources.pathMaskSprite` → `MapSceneView.SetPathMask` / `SetForegroundMasks`（**同一张图兼作"可走蒙版"与"前景遮罩"**，进出 `MapGeometry.cs`）。
> **实存**：`projects/Seer2-Restart-Lite-main/Resources/Maps/bg/*.png` **240 张**（416MB）、`Resources/Maps/path/*.png` **88 张**（2.3MB，多为 `1201×661/680/701`）。
> ⇒ 上面"通行面 = AS3 血统"的**第 ① 条理由（覆盖率 5% / 0.4%）只对 XML 里的 `pathId` 成立，对"素材文件"不成立**；
> **第 ② 条理由（画面本来就是 SWF）正在被 `docs/view/scene/room/view-scene-map-content.md §8.2` 的讨论重议**。
> ⇒ **本判定（MDI1）暂标"待重议"**（**不阻塞 MB1**：`walk` 列本来就没进桥）；重启后 MB8 的"通行面来源"多了一个**真值候选**。

### 2.7 `MapMusic` / `AnimInfo`（`MapMusic.cs:7-46`）【源码】

- **`MapMusic`** = `category`（属性）+ `bgm` + `fx`（元素，**字符串名**如 `BGM_100` / `FX_104`）+ `ValueEquals`（:13-19）。**272 张全有**。⇒ **数据归本份、播放归编排线**。
- **`AnimInfo`** = `id` `pos` `size` `scale` `rotation` `speed` 六个属性 + 派生 `GifPath`（`id` 补 `.gif`、非 `Mod/` 前缀再加 `Resources/`）/ `AnimPos` / `AnimScale` / `AnimRot` / `AnimSpeed` / `UseAnimSize`（`size == "anim"`）。
  ⚠️ **`AnimSpeed` 走 `Identifier.GetNumIdentifier(speed)`**（:44）⇒ **动画速度可以是表达式**（又一个 `Identifier` 依赖点，M3 的注入面要覆盖）。

### 2.8 ★两套血统的**形状差异表**（本份给 MQ1/MQ2 补的最后一块）【样本】

同一张图 `100`（信奉广场）的两条记录，**逐字段对照**：

| 概念 | **AS3**（`swf/map/config/100.xml`） | **Unity**（`.../Data/Maps/100.xml`） | 归一化决定 |
|---|---|---|---|
| 根 | `<map name="信奉广场" categoryId="2">` | `<map name="信奉广场" category="2" id="100" weather="0">` | ⚠️ **属性名 `categoryId` vs `category`**；**AS3 根上没有 `id`**（**图 id = 文件名**）⇒ 桥的 `id` 取 Unity `id`，**文件名兜底**（MDI2） |
| 素材 | `<resource url="10010.swf"/>`（**真元素、带 `url`**） | `<!-- <resource>10011</resource> -->`（**注释、纯文本**） | MQ2 的回退链**只认上半格（AS3 真元素的 `url`）**；下半格（注释）✅ **人类 2026-10-18：直接忽略**（§2.9） |
| 战斗背景 | `<fightMap id="100002"/>`（**属性**） | `<fightMap>100002</fightMap>`（**文本**） | 桥统一成 `fightMap: int` |
| 初始点 | `<initialPoint x="394" y="401"/>`（**属性 x/y**） | `<initialPoint>450,250</initialPoint>`（**文本 "x,y"**） | ⚠️ **两个数值不同 ⇒ 坐标系不同**（MDI3） |
| NPC | `<npc id="18" resId="18" name="斯力普" dir="0" width="70" height="125" pos="791,317" actorPos="644,355" path="">` | `<npc id="10001" resId="10001" name="斯力普" size="123,102" pos="690,240">` | ⚠️ **同一个人：`id` 18 vs 10001、`pos` 不同、尺寸拆法不同**（`width/height` vs `size="x,y"`）⇒ **两套 id 空间不可互换**（MDI3） |
| NPC 附加 | `dir` / `actorPos` / `path` | `rotation` / `transport` / `namePos` | 各自照录，**不合成一个字段** |
| 对白 | `<dialog npcId="18" transport="1,300,400"><branch id="default"><node emotion="0">文本` | `<dialog><branch id="default" name icon size pos><content>文本` | ⚠️ **容器名相同、内部形状完全不同** ⇒ M4 两套解析器 |
| 事件 | `<eventHandler><click><HandlerOpenDialogPanel/></click>` | `<eventHandler><button type="click"><action>openDialog</action>` | ★**这是两套最本质的差别**（6 个具名 handler vs 数据驱动 DSL）⇒ MQ1 |
| 传送 | `<teleport .../>`（2 条：`90` / `151`） | `<teleport .../>`（**3 条**：`90` / `151` / **`101` 碧玉森林(草)**） | ⚠️ **Unity 更全** ⇒ 换桥后图 100 会**多一个出口**（M5 的回归点，也是父文档 §8 第 1 条要盯的） |

### 2.9 注释里"藏着"的东西 —— ✅ **人类 2026-10-18 拍板：一律忽略**

> ⚠️ **本节原先是"别当噪声"的清单；人类 2026-10-18 明确裁定「上游 XML 里的注释直接忽略」⇒ 下面第 1、2 条只作**现象登记**（证明"注释里确实有东西"），
> **不是取数依据**：桥**剥掉 `<!-- -->` 后一律丢弃**，**不保留任何注释内容**（包括下面第 1 条的 `<resource>`）。

1. **`<resource>` 全在注释里**：111 个文件含 `<resource`，**抽样逐条看**形如 `<!-- <resource>10011</resource> -->`（**纯文本、无 `.swf` 后缀、无 `url` 属性**）⇒
   这是上游手工留下的 AS3 素材号**备注**。❌ **本份原记"进 MQ2 回退链第 ③ 级"已被人类 2026-10-18 否决**（**注释直接忽略**）⇒ **不采纳**；`MQ2` 的第 ③ 级**只认 `<id>.swf`**（§3.2 / **MDI7**）。
   ⚠️ **由此产生一条要如实报的数**：若某张图的 swf 线索**只存在于注释里**，它将解析不出 swf ⇒ 桥把它登记成 **`swf-missing`**（不抛、不猜），**张数由 MB1 的桥体检报出**（= 一条"等桥跑出来才知道"的数字，**不许记死账**）。
   ✅ **MB1 报出（2026-10-18）**：`swf-missing` = **55 张**；其中 **48 张**的注释素材号在 `swf/map/` 里**真的有对应文件** ⇒ 这就是"注释直接忽略"这条裁决**放弃掉的那部分**（另 7 张即使照注释取也取不到）。
   全量：`swfOk=false` 共 **102 张**（另 47 张连注释线索都没有）；四级回退命中 = ① **4** / ② **134** / ③ **32** ⇒ ②的 134 恰与 **MQ2 的"134 张有本地 swf"** 对上。见 `docs/map/map-impl.md §7.3 MB1`。
2. **AS3 里也有被注释的 NPC**：`swf/map/config/100.xml` 有 `<!--<npc id="158" ...` ⇒ 两套都存在**注释掉的实体** ⇒
   **桥必须按"XML 注释 = 不解析"处理**（**不许**把注释里的 NPC 当真实体）（MDI8）—— ✅ 与人类 2026-10-18 的裁定**同向**。
3. **`Map.TestBattle` 的调试约定暴露了一个 id 规律**：`Map.cs:76` 用 `npcId = mapId * 100 + (mapId > 0 ? 1 : -1)` + `battleId = "test"` ⇒
   `10002`（图 100 的野怪 NPC）= `100*100 + 2` ——**与发行数据里 `id="10001"` / `10002` 的编号风格一致** ⇒
   【推断】**Unity 侧 NPC id 的命名约定 = `mapId*100 + 序`**（父文档 §2.1 只说"两套 id 空间不同"，这条把重启侧的规律说清）（MDQ2）。

### 2.10 ★坐标系与"简单换算"（人类 2026-10-18 裁决 = 路线 A）【源码 + 样本】

- **重启侧实体坐标住在 `960×540` 画布**：`MapSceneView.ReferenceCanvasSize = new Vector2(960, 540)`（`MVC/View/Map/MapSceneView.cs:11`）；
  实测 `Resources/Data/Maps/*.xml` 的 `pos` 值域 `x∈[25,880]`、`y∈[45,455]`，**全在该画布内**（M5 §2.6 说的"两套坐标系不同"即此）。
- **AS3 侧是 `1200×660` 舞台**（`game/app/scenes/mapScene.js` 的 `STAGE` 常量；AS3 的 `<initialPoint>` / `<teleport pos>` 都在这个空间里）。
- ✅ **人类 2026-10-18 拍板**：**地图美术与画面逻辑仍走 AS3**（不换重启底图/蒙版）；**但 NPC / 野怪的"分布"吃重启数据**，**允许简单换算、位置误差可接受**。
- ✅ **野怪分布的单一来源 = 地图 XML 的 `<npc><wild>`（`MDB11`，人类 2026-10-21 落到底）**：**110 只 / 53 张图**（全量数 = `docs/map/map-move.md §3.4` 的 📏 行）；我方合成的 `game/data/wild.json`（pool 48 / 252 图 / 1,008 个出怪点）= **留盘的合成产物、运行时零引用**（文件与生成脚本 `tools/build-wild-index.mjs` **保留不删**，只是不再读 ⇒ as-built `docs/map/map-impl.md §7.3.33`）。Unity 侧**没有"出怪表 / 重生"概念** ⇒ `<wild>` 是**这只 NPC 自己**的行为包（movement/talk/battle），不是"这张图刷哪些怪" ⇒ **不造第二张表**；真值没写怪的 **219 张图就没有野怪**（人类 ②「就没有」**不伪造**）。
- ✅ **野怪"素材"的单一来源 = Flash 帧包（`MDB12`，人类 2026-10-21 点名「素材能否还是取自 swf？而不是重启的 png？」）**：**分布真值 = `<npc><wild>`（上面那条，一字未动）**；**素材真值 = `swf/pet/normal/<n>.swf`**，桥链 = `<npc @resId="Pets/pet/<形象 id>">` →（`game/data/pet_appearance_swf.csv`，`appearance_id→swf_seq`）→ 帧包，**JS 侧用现成 `actor-view.parsePack` 解**（这些文件**不是 Flash 影片**、头两字节 = 16 位长度 + 内嵌 PNG spritesheet）⇒ **零 `game/maprunner/**` 改动、不重编译 AS3**。覆盖 = **80 只 / 38 张图**走帧包（含本批新抓的 34 个包，目录 **48→82**）；**30 只 / 15 张图**（全在 `10015…10043` 段）在桥表里**没有 Flash 对应物**（表内 id 只到 **2999**、**零条 10xxx**）⇒ **仍取重启 PNG、不伪造**（= `AGENTS §4.19`）。尺寸 = **帧包原生像素**（人类 ③，**不吃** `<npc @size>`；`28–231 px` 宽、大小不一属**人眼校族** `AGENTS §4.10`）；动画 = **走/站两态 + 左右镜像**（人类 ④，不做 `personal`）。as-built = **`docs/map/map-impl.md §7.3.34`**、手测 **`§8.28`**、实测数 = `docs/map/map-move.md §3.4`。
- ⇒ **本项目采用的换算 = 归一化**：**`fx = ux / 960`、`fy = uy / 540`**。
  依据：现役野怪管线**本来就吃归一化**（`game/maprunner/MapRunner.as:222-223`：`wx = mapX + fx*mapW`、`wy = mapY + fy*mapH`）
  ⇒ **一处换算、不动渲染**；⚠️ 误差来源 = 两套地图构图差异（同图同去向的门 **146 对**线性拟合残差中位 **61px**，§2.6 邻区实测）⇒ **靠人眼校**（`docs/view/scene/room/view-scene-map-content.md §8.1`）。
- ⚠️ **桥的记录方式**：`npcs[].pos` / `teleports[].pos` **照录原值（Unity 坐标）**、**不在桥里预除** —— 换算发生在**执行层 / 表现层**（地图线 MB9 与 B3）；桥只保证**数字到得了**（`MDI4` 同族：只分类、不做拼接）。
- ⚠️ **备用口径**（若人眼觉得偏）：用当图舞台矩形微调（`mapX/mapY/mapW/mapH` 由 MapRunner 的 `mapReady` 报出），或**逐图单独校**。
- **路线 A 的真实换算函数（JS 回退 / B3 / SWF 路 NPC 共用）** = `game/logic/map/js-view.js` 的 `unityToStage(ux, uy, rect, flipY=true)`：`x = rect.dx + (ux/REF_W)*rect.dw`、`y = rect.dy + (1 - uy/REF_H)*rect.dh`，再 `+ M.cam`（相机偏移）。
  ⚠️ **Y 必翻转**：上方 `fx=ux/960`、`fy=uy/540` 是 Unity 到归一化分数；但 **Unity 是左下原点、y 向上**，而本游戏**舞台是左上原点、y 向下**，落到舞台时必须 `ny = 1 - uy/REF_H`（即 `flipY`）。这是路线 A 唯一需人眼校的常量（做成开关，某图光口/NPC 上下颠倒就翻 `flipY`）。
- **`pos` 的锚点 = 包围盒左下角**（已人测确认位置正确）：上游 `Assets/Resources/Prefabs/Map/Npc.prefab` 的 `rect` RectTransform `pivot=(0,0)` + `NpcView.SetPosition` 把 `pos` 钉在 NPC 左下角（原点画布左下、y 向上）；故 `drawImage` 左上 = `(x, y - h)`（`NPC_ANCHOR={ax:0, ay:1}`，详见 B3 impl `docs/view/scene/room/view-scene-map-content-impl.md:118`）。JS 路与 SWF 路**同一函数、同一 `flipY`**，不新增禁改区改动。

---

## 3. 目标结构与契约

> ⚠️ **方案 C（人类 2026-10-18 拍板）**：**不再有构建期的大表产物**（`game/data/unity/maps.json` 已退役）；
> 改为**进一张图时现场取那一条 Unity XML、现场解析**。本文旧称的"桥 / 桥产物"自此一律指**现场解析器**（`parse-map.js`）+ **取数入口**（`loadMap`）。

### 3.1 落点（照父文档 §4.1，本份只定义 **M1 那格**）

```text
game/logic/map/parse-map.js        ← L1 纯解析器（XML 串 → MapRecord；零 IO / 零 fetch；本份 §3.2 定义字段）
tools/map-audit.mjs                ← node 对账工具（读全库跑**同一份**解析器 → 打印 §8.1 判据数字；不产产物）
game/core/map/map-table.ts         ← L0 纯函数（图模型 + identifierOf；MB2，未落）
game/app/content.js                ← L2 取数入口 loadMap(id)：fetch 单图 XML → 解析 → 补 swf 链（**不缓存**）
```

⚠️ **为什么解析器住 L1 而不是 L0**：它要 import `fast-xml-parser`（第三方库），而 L0（`game/core/**`）的历史纪律是**零第三方依赖、纯端口**；
放 L1（`game/logic/**`）与**存档线 `game/logic/save/codec.js` 同族**（同样是"纯 JS + fast-xml-parser + 浏览器 / node 共用"）⇒ **M-3**（`core/map/**` 不 fetch / 不读 JSON）不受影响。
⚠️ **dev 期直吃上游**（人类 2026-10-18）：XML 目录 = `projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps`（**路径常量**写在 `content.js`）。
这依赖 `tools/serve.mjs` 服务**仓库根**；⚠️ 这是**开发期**形状 —— 打包发布时 `projects/` 不在包里，那一步待打包线另议（**不阻塞本线**）。
⚠️ **运行时取数的门禁 = 人类决议 ⑨**（`AGENTS.md §5`）：`fetch` / 读 JSON **允许**；要守的是"**取数入口单一**"（地图一律经 `content.loadMap`）。
⚠️ **与既有表桥的分工不变**：`game/data/unity/*.json` 那六张表仍由 `tools/build-unity-data.mjs` 从 **CSV** 生成（`manifest.json` 的 `counts`/`strides`）；
地图**不产 JSON** ⇒ **不再有 `counts.maps`**（旧 MB1 记的那笔已随产物退役删除）。

### 3.2 `MapRecord` 的字段清单（**每图一条记录** · `parse-map.js` 产出）

| 字段 | 类型 | 来源 | 归一化规则 |
|---|---|---|---|
| `id` | `int` | Unity `@id`（缺 ⇒ 文件名） | **可负**；负 = 镜像（M5）；⚠️ **不合成 `isMod`**（照 `IsMod` 的原始判据存，规则归 MDC 表） |
| `name` | `string \| null` | Unity `@name` | 原样（**中文**，MP4 归 DOM） |
| `category` | `int` | Unity `@category` | 原样存**数**；`MapCategory` 枚举在 L0（`{1,2,100}`），**未知值照录不抛**（MP7） |
| `worldId` | `int` | 派生 | `(categoryId-1)/100`，`isMod ⇒ 0`；⚠️ **同时存 `worldIdKnown`**：`Grass` 与 `Station` 都算出 0（MDC5）⇒ 消费方要区分时读 `category` 不读 `worldId`。⚠️ **`worldIdKnown` 的口径（MB1 as-built 定，待评审）= `category ∈ {1,2,100}`（上游枚举三值）**；实测 `category` 有 **21 种取值**（`1..16` / `100..105` / `200`）⇒ **190/272 张图 `worldIdKnown=false`**（`worldId` 仍照 `Map.cs:22` 的公式算出，不置 null）—— 这条数本身就是"上游枚举不全"的实证，见 `docs/map/map-impl.md §7.3 MB1` |
| `weather` | `int` | Unity `@weather`，缺省 `0` | —— |
| `switch` | `0 \| 1 \| -1` | Unity `@switch`，缺省 `0` | M5 消费。⚠️ **桥在解析期收窄**（**M5 §3.4**）：实测 45 张里有一个 **`71`**（畸形），照 `int` 存 ⇒ 上游 `Mathf.Abs(71)!=1` 会**把 71 当 mapId**（**TPC5**）；收窄后 `71` ⇒ **登记成"未知 switch"且按钮不出现**，不进内核列。⚠️ as-built：原值另存一列 **`switchRaw`**（`71` 那张图里就是 `switch: 0 / switchRaw: 71`）—— 只为**审计**（`docs/map/map-impl.md §7.3 MB1`），内核**不许**读 |
| `dream` | `bool` | Unity `@dream`，缺省 `false` | —— |
| `bgColor` | `string` | Unity `@color`，缺省 `"255,255,255,255"` | **存原串**，不存解析后的颜色（A1 的色口径） |
| `fightMap` | `int \| null` | Unity 元素文本 | AS3 侧属性形态**只做兜底** |
| `fightMapColor` | `string \| null` | Unity 元素文本 | ⚠️ 存下来；**"非 mod 恒灰"这条行为**归 L0/B4，**桥不改值**（MDC2） |
| `init` | `{x,y} \| null` | Unity `initialPoint` 文本 | ⚠️ **坐标系 = Unity 侧**，与 AS3 的 `initialPoint x/y` **不同**（MDI3）⇒ 记录里并存 `initUnity` / `initAs3` 两列，**谁在用哪个由消费方选** |
| `music` | `{category,bgm,fx} \| null` | Unity `<music>` | 编排线音频缝消费 |
| `anim` | `AnimInfo \| null` | Unity `<anim>` | 六属性原串进桥（`speed` 可能是表达式 ⇒ **存原串**） |
| `resId` | `int \| null` | Unity `@resId`，`0` ⇒ `null` | MQ2 第 ① 级 |
| `pathId` | `int \| null` | Unity `@pathId` | §2.6：**照录但不作为默认通行面** |
| `geometry` | `{mask[], collision[]} \| null` | Unity `<geometry>` | 全量照录（**实测只有 1 张有值**：`-70.xml`）。⚠️ **as-built 订正形状**：数据里不是 `{polygon: string[]}`，而是 `<mask id name points/>` + `<collision id name points/>` 两种子元素、`points` 为**原串**（`"319,508;339,454;…"`）⇒ 桥照录这两列（**通行面搁置 ⇒ 本列今天无消费者**，`MB8 ⏸`） |
| `swf` / `swfOk` / `fightMapOk` | `string` / `bool` / `bool` | **MQ2 四级回退链**算出 | ✅ **人类 2026-10-18 拍板：上游 XML 的注释直接忽略** ⇒ 回退链**只有一条读法**：① Unity `<map resId>` ⇒ `<resId>.swf` → ② 同 id 的 AS3 config 的 `<resource url>` → ③ `<id>.swf` → ④ 都无 ⇒ `swfOk=false`（走 B3 已有的"缺图"路径）。❌ **不再有"注释里的 `<resource>`"这一级**、**`swfFromComment` 标记取消**；线索只在注释里的图 ⇒ 登记 **`swf-missing`**（张数由对账工具报出）。⚠️ **方案 C 起**：这三列由 `loadMap` 在**运行时**判"文件在不在"（浏览器 = `HEAD /swf/map/<name>`；node = `fs.existsSync`）⇒ 两边同一语义 |
| `entities.teleports[]` | `{id, name, pos, color?, targetMapId}` | Unity `<teleport>` | ★**只有这五列**（`TeleportInfo.cs:7-18`，M5 §2.1）⇒ **不加 `destPos`/`targetPos`**（Unity 结构上没有；AS3 的 `@targetPos` **219 条不嫁接**，坐标系实测 **169/169 全差 >4px**，M5 §2.6 / **TPQ1**）。`@color` 实测 **8 条**，缺省串 `"255,255,255,128"`（存原串） |
| `entities` | `{teleports[], npcs[], farms[], animals[], ponds[], insects[], nests[]}` | Unity `<entities>` | 每类**照录成数组**（**不再是数字**，修掉现状 `entities` 是标签计数这个缺陷，见 §6） |
| `entities.*[].handlers` | `{dialog[]?, battle[]?, eventHandler[]?, callbackHandler[]?}` | `NpcInfo` 的四张表 | ★**桥存"原始 XML 片段串"，不在桥里解析语义**（语义归 M2/M3/M4/M6 的 L0 解析器） ⇒ 桥只做**结构归一化**（MDI10）。⚠️ as-built：**每段 = 容器里的一个元素**（一个 `<button>` / 一个 `<branch>` 各一段），空表 ⇒ **键不出现**；片段串由 `preserveOrder` 树**重建**（CDATA 仍作 CDATA、文本与属性重新转义）⇒ 语义与上游一致、**不是逐字节原文切片**（见 `docs/map/map-impl.md §7.3 MB1` 偏差 ⑤） |
| `entities.npcs[].wild` | `{visual, movement{…}, talk{…}} \| null` | Unity `<wild>` | 形状正本 = **M7 §3.1**（`docs/map/map-move.md`）；实测 **110 条 / 53 图**；缺省按 `NpcInfo.cs` 类缺省补齐（`mode=stationary` 等）⇒ MB9 直接吃。⚠️ **`MDB11`（2026-10-21）起这是野怪分布的唯一来源**（合成表 `wild.json` 运行时零引用）；`movement.mode` 实测 = **107 `wander` + 3 `stationary`** |
| `_source` | `string` | 固定 `"Unity:Maps/<file>"` | as-built 审计用 |

⚠️ **两条由 M5（`docs/map/map-teleport.md`）钉给本份的约束**（**MDI7「注释不是数据」的同族**）：
1. **畸形与悬空一律在解析期登记，不静默兜底**：光口相关的四类 —— `switch ∉ {0,±1}`（实测 1 例 `71`）、
   同图重复 `@id`（AS3 **4 张**，Unity **0**）、空 `@name`（Unity **0**、AS3 **1**）、`targetMapId` 悬空（Unity **0**、AS3 **4**）。
   登记标签与逐项实测见 **M5 §3.1 / §2.6**。⇒ 393 条 Unity 光口**全部可解析、全部有名**，所以这些登记**今天全是零成本的防呆**。
   ⚠️ 同一条理由也解释了为什么 `71` 的登记**观测不到**：那张图在光口图上**零入边**（没有任何光口/NPC 动作指向它，M5 §2.10）⇒ 玩家走不进去 ⇒ **登记照做**（解析期纪律），但**不给人手测用例**（M5 §7.3 第 4 条）。
2. **AS3 血统只作「只读适配器」的输入，不进内核列**：AS3 独有的 `@targetPos`（**219 条**）与**属性形** `initialPoint x/y`
   ⇒ 只能落进 `initAs3` 这类**并存列**（MDI3），**不许**被内核的传送/落点规则读到（**M5 TPQ1**）。
3. **另有两类「不阻塞的只读审计」，与上面四类畸形不同级**（本轮 M5 §2.10 实测，判据 = 光口的 `targetMapId` 图）：
   `portal-inbound-none` = **95 / 272** 张没有任何光口指向、`portal-isolated` = **54** 张连出边也没有（其中 **26** 张的出边只在 NPC 动作层）。
   ⚠️ 它们**不是**"数据坏了"（文件都在、名字都有）⇒ **登记但不归一化、不报错、不阻塞**；
   用途是给**门线**（C 组排期 ④）分诊"进它的路不是光口"，以及防本线把"只读光口"误当成完整入口图   用途是给**门线**（C 组排期 ④）分诊"进它的路不是光口"，以及防本线把"只读光口"误当成完整入口图（**M5 TPI9**）。

⚠️ **方案 C 起：跨图统计只剩"对账"用途，不再是运行时数据**（人类 2026-10-18）：
  上条里的 `portal-inbound-none` / `portal-isolated` / 悬空目标，**只有读全库才算得出** ⇒ 由 `tools/map-audit.mjs` 离线算（人手动跑）；
  **运行时不需要它**（进图只要那一张的 XML；"目标图存不存在"直接 fetch，404 即不存在）。⇒ **不做"全图清单 / 小索引"**、**不缓存**（人类同日拍板）。

### 3.3 L0 类型轮廓（`game/core/map/map-table.ts`）

```ts
export type MapRecord = { id, name, category, weather, switch, dream, resId, pathId,
                          fightMap, fightMapColor, initUnity, initAs3, swf, swfOk, … }
export type EntityKind = 'teleport'|'npc'|'farm'|'animal'|'pond'|'insect'|'nest'
export type AssetRef = { raw: string; kind: 'none'|'npcId'|'path'|'builtin'|'mod'|'expr' }  // §2.5 六形状
export function identifierOf(map: MapRecord, key: string): number      // 8 键 + 未知 ⇒ 0（照抄兜底）
export function isModId(id: number): boolean                          // 原判据：id < -50000 || id === 0
export function isMirrorId(id: number): boolean                       // 新命名：id < 0 && !isModId(id)  （MC4 分开）
export function parseAssetRef(raw: string): AssetRef                  // 分类**不做运行时求值**（MDI5）
```

✅ **已落码（MB2，2026-10-18）**：as-built 见 `docs/map/map-impl.md §7.3.3`。
另**多导出两个运行时常量** `ENTITY_KINDS` / `MAP_IDENTIFIER_KEYS`（与 `game/core/parser/operator.ts` 的 `COND_KEYS` / `OP_KEYS` 同形）。
⚠️ `parseAssetRef` 的实现在此（L0），L1 `parse-map.js` **搬用**它（本地 `resIdKind` 已删）—— **一份实现、两处不漂移**。

⚠️ `identifierOf` 的 `"anim"` 键在上游读的是 **`resources?.anim`**（运行时资源，不是数据，`Map.cs:198`）⇒
我们的 `MapRecord` **没有"资源已加载"这一面** ⇒ 目标行为：**`"anim"` 键读"数据里有没有 `<anim>`"**，并在桥记录里**如实标出与上游不同**（**MDQ3**）。

### 3.4 施工切法（**本族** = 父文档 MB1 的展开，不改 MB 编号）

| 批 | 内容 | 判据（人手测口径，决议 ⑦） |
|---|---|---|
| **MDB1-a** | 纯解析器 `parse-map.js`：XML 串 → `MapRecord`（**只处理非注释节点**） | 图 `100` ⇒ `id=100` / `name=信奉广场`；负 id 记录照出 |
| **MDB1-b** | 七类实体 + 四张表的**原始片段**进记录 | 图 `100` ⇒ `npcs.length==2`、`teleports.length==3`（→ `90/151/101`）、`10001` 有 `dialog`+`eventHandler` |
| **MDB1-c** | `swf`/`swfOk` 的 **MQ2 四级回退**（**不含注释级**，人类 2026-10-18）+ **存在判据注入**（浏览器 = HEAD / node = `existsSync`） | node `tools/map-audit.mjs` 打印四级命中 = `4/134/32`、`swf-missing=55` |
| **MDB1-d** | `content.js` 的 `loadMap(id)`（fetch 单图 + 解析 + 补 swf 链；**不缓存**）+ `tools/map-audit.mjs` 对账 | 进图能拿到记录；对账日志与 §2.2 实测对得上 |

---

## 4. 数据流向

```text
  运行时（进一张图时）                          node 对账（离线，人手动跑）
  ─────────────────────                        ───────────────────────
  content.js  loadMap(id)                      tools/map-audit.mjs
    │  fetch                                       │  读全库 272 张
    ├─ /projects/.../Maps/<id>.xml  （★权威，MQ1）   ├─ 同一份 parse-map.js
    ├─ /swf/map/config/<id>.xml     （AS3 只读适配器）├─ swf/map/*.swf 列目录
    └─ HEAD /swf/map/<name>.swf     （存在判据）      └─ 打印 §8.1 判据数字（95/54/393/110…）
    │
    ▼
  game/logic/map/parse-map.js  parseMapXml(xml) → MapRecord
    │                         as3ResourceNameOf / swfCandidatesFor / pickSwf
    ▼
  MapRecord（七类实体 + 四张处理器表原始串）
    │
   ┌────────┴────────┬─────────────┬─────────────┐
   ▼                 ▼             ▼             ▼
 core/map/map-table  M2 npc     M4 dialog     M6 battle-spec   （★L0 只做解析与纯函数，MP2）
 (纯函数/枚举)       button.ts   dialog.ts     battle-spec.ts
            │
            ▼
      logic/map/session.js  ──►  执行（C2/A3/item/E6/R4）  （副作用在这层与 L4，不在 core）
```

⚠️ **不再有 JSON 中转**：`game/data/unity/maps.json`（旧 MB1 产物）与 `tools/build-map-entities.mjs` 均已退役；
而 `game/data/maps.json` 那条 **AS3 血统**桥**仍在**、继续服务 B3 的画面与光口坐标 —— 两套**各自独立**、不许交叉覆盖（MQ1 / D2 / D3）。

⚠️ **两套血统并存的过渡期是有意为之**（不是债务遗漏）：`game/data/maps.json`（AS3）仍在服务 B3 的**画面与传送链**，
本份的**现场解析**供**规则与实体**；合并条件见 §7 MDQ4。

---

## 5. 不变量与围栏（**MDI1–MDI10** · 本族）

- **MDI1 · 通行面默认走 AS3 path**：Unity 的 `pathId`(13)/`geometry`(1) **覆盖率过低** ⇒ 不作为默认实现；两者冲突时**以 AS3 为准 + 记日志**。
- **MDI2 · 图 id 的唯一来源**：`id` 取 Unity `@id`，**缺失才回落文件名**；⚠️ **AS3 侧根上没有 `id`** ⇒ **不许**从 AS3 记录"猜"id。
- **MDI3 · 双 id 空间与双坐标系**：同一张图的两条记录里，**NPC id 与坐标都不可互换**（`18` vs `10001`；`pos 791,317` vs `690,240`；`init 394,401` vs `450,250`）⇒ 桥**两列并存、各自命名**，任何消费方**必须显式声明用哪套**。
- **MDI4 · `resId` 存原串 + 分类**：六种形状（§2.5）在桥里只做**分类**，**不做解析后的路径拼接**（拼接归素材层/B3）。
- **MDI5 · 桥内零运行时求值**：`[expr]` 段、`AnimInfo.speed` 的 `GetNumIdentifier`、`transport` 的插值 ⇒ **一律存原串**，求值在执行期由注入面（M3 的 `MapEnv`）做。
- **MDI6 · 七类照录、实现按两类**：`farm/animal/pond/insect/nest`（合计 68 条）**照录入桥**，**但排期只按 `npc`+`teleport` 做**；`farm`/`pond` 属 A 组出局，**不许顺手实现**。
- **MDI7 · 注释不是数据**（✅ **人类 2026-10-18 加严：注释直接忽略**）：解析器**必须先剥 `<!-- -->`**，剥掉的内容**一律丢弃、不参与任何取值**（**没有例外** —— 注释里的 `<resource>` 也**不**作 swf 线索）；`MQ2` 的第 ③ 级**只认 `<id>.swf`**。
- **MDI8 · 空文件不算图**：`.meta` 不进桥（544 个文件 = 272 xml + 272 meta）。
- **MDI9 · ~~与表桥共用记账~~（⚠️ 方案 C 起作废）**：地图**不再产任何 JSON 产物** ⇒ 没有 `manifest.json` 记账可共用（旧 MB1 记的 `counts.maps` 已随产物删除）。
  字段若有改动，改的是**本份 §3.2** 与 `game/logic/map/parse-map.js`；**不动** `manifest.json`（那六张 CSV 表的记账照旧）。
- **MDI10 · 桥只做结构、不做语义**：四张处理器表以**原始 XML 片段串**进桥 ⇒ 语义解析归 M2/M3/M4/M6 的 L0 代码。
  ⚠️ **这条是本份与"顺手把条件也解析了"的分水岭** —— 桥里出现任何 `condition`/`action` 判断即为破口。

**继承父文档**：MP1（单一真值）/ MP2（纯函数）/ MP3（不直调）/ MP7（未知静默兜底）在本族的样子 = 上面 MDI5/MDI10/§3.3。

---

## 6. 现状与缺口（**实测** · 2026-10-17）

| 面 | 现状 | 缺什么 |
|---|---|---|
| 桥 | `game/data/maps.json`（**259 张 AS3**，`tools/build-map-index.mjs` 48 行，**正则抓取**，仍服务 B3 的画面） | **Unity 侧**（MQ1 权威）**改走运行时现场解析**（方案 C：`parse-map.js` + `content.loadMap`）⇒ 不产 JSON |
| ⚠️ `entities` 字段 | **是个数字** = `(<entities> 标签计数)` ⇒ 恒为 `1` | 旧桥的缺陷；**Unity 侧七类实体**由 `loadMap` 现场给到（本份 §3.2 的形状 = **数组**） |
| 传送 | `teleports[]{pos,target,id,name}` ✅ | 缺 `color`（默认半透明那套）与**图 100 的第三个出口**（§2.8） |
| NPC | **0** | 本份 §2.4 的全字段（Unity 侧由 `loadMap` 现场给到） |
| 战斗/对话/条件 | **0** | 归 M2/M3/M4/M6（解析器只给**原始片段串**） |
| 素材 | `swf`/`swfOk`/`fightMap`/`fightMapOk` ✅（AS3 血统） | ✅ **四级回退已在 `parse-map.js` 实现**（存在判据注入：浏览器 HEAD / node `existsSync`）；⚠️ **注释级线索不算**（人类 2026-10-18） |
| 通行面 | 走 **SWF**（`MapRunner.as` `path_mc`） | 与 Unity `pathId`/`geometry` **从未对齐** ⇒ MDQ1 |
| 工具形态 | 正则在 `build-map-index.mjs` 里硬编 | ✅ **Unity 侧真解析**（`parse-map.js`；理由：`<branch>` 嵌套 + CDATA + 注释 ⇒ 正则静默丢内容，MDQ5） |

---

## 7. 怪癖登记与待核

### 7.1 怪癖（**MDC1–MDC9** · 口径 = `AGENTS.md §2` / 决议 ②：**声明 + 不照搬**）

- **MDC1 · `Map.resId` 是 `int`、`NpcInfo.resId` 是 `string`** —— 同名不同型（`Map.cs:13` vs `NpcInfo.cs:15`）。症状：把两者当一个概念会写错类型。目标：**两个名字**（`mapResId` / `assetRef`）。
- **MDC2 · `fightMapColor` 对非 mod 图恒灰**：`Map.cs:28` `IsMod(id) ? 数据值 : new Color(0.5f,0.5f,0.5f,1)` ⇒ **45 张写了这个色的图里，非 mod 的全部被忽略**。症状：改数据没效果。目标：**照录数据 + 行为显式建模**（谁消费谁决定是否按 mod 分支），**不许**把恒灰写进桥。
- **MDC3 · `Map.cs:122` 直读 `resources.pathSprite`** ⇒ `resources`（`[XmlIgnore]`，运行时注入）未注入即 **NRE**；而 `GetMapIdentifier("anim")`（:198）却做了 `resources?.anim == null` 的**空值保护** —— **同一个类里两种纪律**。目标：**全部按"资源可选"**处理。
- **MDC4 · `GetNpcInfo` 只查 `entities.npcs`**（`Map.cs:55`）⇒ 六类共用 `NpcInfo` 里，**farm/animal/pond/insect/nest 的 NPC 用 id 查不到**（`GetBattleInfo` 经它取 `battleHandler` ⇒ 那五类里的战斗分支**永远为空**）。症状：数据写了战斗、点了没反应。目标：**查找面覆盖七类**（按 `EntityKind` 或先合成一张总表）。
- **MDC5 · `worldId` 把 `Grass=2` 与 `Station=100` 都算成 0**（`(categoryId-1)/100` 的整数除法，`Map.cs:22`）⇒ 两个不同大类**同 worldId**。目标：`worldId` 保留但**不作为区分依据**；要区分读 `category`。
- **MDC6 · `TeleportInfo.rgba` 默认 `"255,255,255,128"`，`NpcInfo.rgba` 默认 `"255,255,255,255"`**（`TeleportInfo.cs:12` vs `NpcInfo.cs:26`）⇒ 两类"同一形状、不同默认透明度"；且 `ToColor(Color.white)` 的兜底色**都是不透明白**（与默认串不一致）。目标：**各自默认各自存**，兜底色与原串一致。
- **MDC7 · `NpcInfo.size` 无默认**（`npcSize` 可为 null ⇒ `ToVector2()` 会炸）而实测 **5 张 `<npc>` 没写 `size`**。目标：**缺 size ⇒ 显式 `(0,0)` + 记日志**，由 B3 决定回落素材尺寸。
- **MDC8 · `GetAnim` 用两个不同分隔符切同一条路径**：bundle 名取 `LastIndexOf('-')`、资产名取 `LastIndexOf('_')`（`NpcInfo.cs:105-109`）⇒ 名字里只要混用 `-`/`_` 就**切错**。目标：**显式契约**（要么都按 `-`、要么存成 `{bundle, asset}` 两段），**不照搬这个巧合**。
- **MDC9 · `geometry` 默认是"空对象"而不是 `null`**（`Map.cs:36` `= new MapGeometry()`），而两处消费点写的是 `geometry == null`（:143/:152）⇒ **"没有多边形"与"有多边形但为空"在代码里被合成同一个判断**，且**永远走"有几何体"那一支**。症状：碰撞判定退化依赖 `MapGeometry` 内部是否为空。目标：**判"空集合"而不是判 null**（`hasPolygons(map)`）。

### 7.2 待核（**MDQ1–MDQ5** · 附我的建议；依人类常设指示「都按你的建议来吧」，否决哪条改哪条）

| # | 问题 | 建议 |
|---|---|---|
| **MDQ1** | **Unity `pathId`/`geometry` 与 AS3 `path_mc` 冲突时信谁？** | **信 AS3**（MDI1），但**每次冲突记一条日志**并把清单交人类过目；**不追求自动对齐**（两侧 13/1 张的量不值得建机器） |
| **MDQ2** | **Unity NPC id 是否真按 `mapId*100 + 序` 编？** | 【推断】成立（`10001`/`10002` vs `Map.cs:76` 的 `mapId*100±1`）。**不写死这条规律**，只做**校验日志**：违反规律的 id **不报错、只登记** |
| **MDQ3** | **`map.anim` 标识符键怎么给？** | 按**数据面**（有 `<anim>` ⇒ 1），并在 M3 的条件命名空间表里**标注"与上游语义不同"**（上游读运行时资源） |
| **MDQ4** | **两套血统（`game/data/maps.json` AS3 桥 / Unity 现场解析）何时合并？** | **不在阶段一合并**：Unity 现场解析**只服务规则与实体**，B3 继续吃 AS3 桥；合并触发条件 = **MQ2 的 134 张全部跑通且 AS3 桥无独有消费者** |
| **MDQ5** | **Unity 侧用正则还是真 XML 解析？** | ✅ **真解析**（已落：`game/logic/map/parse-map.js` 用 `fast-xml-parser`）。理由：Unity 侧有 `<branch>` 嵌套、CDATA、注释、`[XmlText]`（`NpcWildTalkContent.text`）—— 正则处理这些会**静默丢内容**（旧桥的正则只对付过 AS3 的扁平形状） |

### 7.3 等人手测确认项（决议 ⑦：主验收 = 人手测）

> ⚠️ 不写测试脚本；**MB1（方案 C）已落码（2026-10-18）**，以下由人类跑对账工具 / 直接把游戏跑起来确认。

1. **解析器对账**（可立刻做，不用玩游戏）：`node tools/map-audit.mjs` 打印 **记录数 272**、**负 id 26**、
   图 `100` 的记录里 `teleports` **是 3 条**（`90`/`151`/`101`）且 `npcs` **是 2 条**（`10001` 斯力普 / `10002` 空名野怪）。
2. **注释没被当真数据**：任一图的 `npcs` 里**不该出现** Unity/AS3 注释里那个 `158`（§2.9 第 2 条）。
3. **出口名回归**（父文档 §8 第 1 条的加强版）：`#/map` 图 `100` 的三个出口，悬浮说明分别是
   **草目氏族主城 / 水仙草界 / 碧玉森林(草)**，且**目标图 id** 与 `90 / 151 / 101` 一致。
4. **缺素材的路径不崩**：进一张 `swfOk=false` 的图 ⇒ 走 B3 的 `mapFail`"缺图"路径，**不白屏、不卡载入中**。
5. **七类实体别被"顺手实现"**：进一张含 `<pond>`/`<animal>` 的图 ⇒ 数据在 `loadMap` 的记录里查得到，但**画面上不出现新的牧场玩法**（MDI6 / A 组围栏）。

---

## 8. 配对实现（impl）指针

- `docs/map/map-impl.md`（落地计划）/ `docs/map/map-code-map.md`（代码地图）—— ✅ **已成文（2026-10-18）** ⚠️ **人类 2026-10-18 已结账四条拍板**（`docs/map/map-impl.md §9`），design 本身仍待评审，见 `docs/map/map-design.md §9.3`。
  本份的切片 **`MDB1-a…d`** 对应它 §2 的 **MB1**（`MDB5-a` 折入同批；`MDB7-a` 延到 MB8，见其 **D5**）。
- 本份的**as-built** 回填位置：`docs/map/map-impl.md §7`（MDB1-a…d 完成后）。
