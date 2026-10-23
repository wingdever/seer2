# M6 · 地图战斗触发（`map-battle-trigger.md`）

> **定位**：地图线（M）的子设计 **M6** —— **"从地图数据里解析出一场战斗，并在打完之后接着办事"这一整段的真值与目标**：
> `<battle>` 分支表、`BattleSettings` 的 18 列、`BossInfo` 的敌方宠构造、**543 个 `battle` 触发动作**、
> 开工前的三道门、**战后回图的再入链**（`winHandler` / `loseHandler`）、以及 `battle.` 条件命名空间。
> 本线**唯一一条"两个场景之间来回"的链**：出去时把地图数据翻成战斗规格，回来时把战斗结果翻成地图动作。
>
> **父文档**：`docs/map/map-design.md`（总设计兼导读；本份细化 §2.9 的战斗切片 / **MP4**「内核只出决议」/ **MP6**「条件→动作」/ §9.1 的 M6 行）。
> **同线兄弟**：**M1** `map-data.md`（桥：`<battle>` 分支表与两张 handler 表的落法）·
> **M2** `map-npc.md`（`battle` 是它那张**动作表**的第 13 行；基石对象 `NpcButtonHandler` 归 M2）·
> **M3** `map-condition.md`（`battle.` 是它那张**命名空间表**的一臂；本份只给它**键的两个半边**与 43 条实测用例）·
> **M4** `map-dialog.md`（★**对话是战斗的主触发面**：543 条里 **391 条**在 `func`/`reply`）· **M5** `map-teleport.md`（同族"入口不止一个"的教训）·
> **M7** `map-move.md`（**野生遭遇的谓词**交叉：`MapWildNpcBehaviourController` 同时要求"会走"和"能打"）。
> **邻线**：
> **E 线** `docs/engine/battle-engine-design.md` —— ★**打起来之后的一切归它**；本份交出去的是**一张战斗规格**，接回来的是**一个结果对象**（宿主 = E6 `battle-engine-session.md`，结算算式 = E6/D6，判定 = E5）。
> **B3 渲染** `docs/view/scene/room/view-scene-map-content.md`（野怪脚标 / NPC 贴图）· **B1** `view-scene-hud-design.md`（★**地图天气 HUD** 那一套，见 §2.12）·
> **A3 / R5** `docs/view/mech/view-overlays.md` + `docs/runtime/runtime-components-design.md`（开工失败与"暂未开放"的提示盒）·
> **编排线** `docs/orchestration/orchestration-design.md`（**OR2** 场景切换唯一入口、**§4.1 会话**持 `currentNpcId` / `currentBattle`）·
> **运行时线** **R1** 随机源 / **R2** 时钟（★本份是这两条缝在地图线里**最大的消费点**，见 §2.3 与 §3.3）。
>
> **真值源**：`Assets/Scripts/Scene Specific/Map/Entities/Npc/NpcInfo.cs:49-50`（★`<battle>` 的唯一挂载点）·
> `.../Battle/BattleInfo.cs`（**90**）· `.../Battle/BossInfo.cs`（**108**）· `Scene Specific/Battle/BattleSettings.cs`（**207**）·
> `Scene Specific/Battle/Battle.cs:38-57` `:204-248`（三个门）· `Scene Specific/Battle/BattleResult.cs`（**250**，本份只取 `:19-25` 胜负谓词、`:35-51` 键表、`:61-66` 播种与早退）·
> `Scene Specific/Battle/BattleState.cs:88-96`（`settings.` / `result.` 两臂的路由）·
> `Scene Specific/Map/Entities/Npc/NpcActionHandler.cs:355-377`（`StartBattle`）· `NpcHandler.cs:35-45` `:47-69` `:71-96` `:98-114`（事件绑定 / 条件 / 动作 / 装配）·
> `NpcButtonHandler.cs:52-73`（`battle` 这个词在 `:65`）` :77` `:86-115`（两张枚举）· `NpcConditionHandler.cs:49-51` `:124-130`（`battle.` 臂与"无战斗兜底"）·
> `Scene Specific/Map/Map.cs:54-90`（`GetNpcInfo` / `GetBattleInfo` / **`TestBattle` 的 id 约定**）·
> `Scene Specific/Map/Entities/Npc/MapWildNpcBehaviourController.cs:15-27`（野生遭遇谓词）·
> `MVC/View/Map/MapSceneView.cs:36-50` `:482-531`（★战后再入的唯一现场）· `System/Parser/Identifier.cs:163-167` `:228-266`（`battle.` 的第二半条路由）·
> `MVC/Model/Panel/DoorModel.cs:13-20` `:49-66` `:101-170`（★门 = 第五个触发入口 ⇒ 记账给 C 组排期 ④）·
> `MVC/View/Battle/BattleSystemView.cs:49`（`settings.time` 的唯一消费者）· `MVC/Controller/Map/MapUIController.cs:21` + `MVC/Model/Map/Components/MapInfoModel.cs:11`（地图天气）。
> 【样本】`Resources/Data/Maps/*.xml`（**272** 张，Unity 血统 —— **先剥 `<!-- -->` 再解析**，父文档 §2.1 的计数纪律）。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **BTI1–BTIn**（不变量/契约）/ **BTC1–BTCn**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**）/
> **BTQ1–BTQn**（待拍板，附建议）/ 施工批 **MDB6-a…e** —— **全是本份局部编号**，**不是**「人类决议 ①–⑧」（`AGENTS.md §5`）；
> ⚠️ 也**不是**父文档的施工批 **MB1–MB5**（那两个号段撞车，故本份施工批带 `6` 与 `D`，同 M5 的 **MDB5-a…e** 口径）。
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。

---

## 0. 这份文档回答什么

1. **`<battle>` 只挂在一个地方**（§2.1）—— 它是 `NpcInfo` 的一个 `XmlArray`；
   ★**地图战斗的唯一宿主是 NPC**。光口、地面、道具、面板都不会自己开战斗（门是例外，但门**也**伪装成一个 NPC，见 §2.13）。
2. **一张战斗配方有 7 列，其中一列是死的**（§2.2）—— `id / content / settings / player / enemy / winHandler / loseHandler`；
   `content` 在发行数据里出现 **0** 次、在代码里被消费 **0** 次 ⇒ **双重死列**。
3. **`<branch id>` 是字符串，唯一性作用域只有一个 NPC**（§2.4）【样本】—— `default` 在全库出现 **275** 次、`evolve` 45 次；
   同一个 NPC 内部**零重号（实测 0）**，跨图大量重号 ⇒ **解析器不许建全局 branch 表**。
4. **`BattleSettings` 有 18 列，数据只写了 6 列属性 + 6 个子元素**（§2.3）—— `count`(680) / `capture`(170) / `parallel`(56) / `star`(43) /
   `simulate`(33) / `item`(21)；`mod`/`escape`/`time` 三个属性**全库 0 次**；**`<seed>` 0 次** ⇒
   ★**每一场地图战斗的随机种子来自时钟**（`BattleSettings.cs:58`）—— 这是 **R1/R2** 两条缝在本线最硬的消费点。
5. **★触发战斗的动作有 543 个，其中 391 个住在对话里**（§2.6）—— `functionHandler` 243 + `replyHandler` 148 vs
   `eventHandler` 150 + `callbackHandler` 2。⇒ **"把 NPC 落地"不足以让战斗跑起来，M6 与 M4 必须同批**。
6. **680 条分支里有 154 条没有任何动作引用**（§2.7）—— 其中 **147 条是数字 id**（门层地板，`DoorModel` 自己选）+
   **7 条具名**（真悬空）；另有 **8 条动作指向一条全库不存在的分支 `hell`** ⇒ 点了**静默无反应**（**BTC8**）。
7. **开工前三道门，其中一道只在"没写 `<player>`"时才关**（§2.8）—— `CanStartBattle` 里那个变量名（`isPlayerPetBag`）**与它的语义相反**，
   后果：**32 条强制阵容的战斗既不查首发死亡，也拿玩家背包去顶替准入检查**（**BTC4**）。
8. **打完回图，谁接着办事**（§2.9–§2.11）—— `SetMap` 装配完实体后调一次 `CheckBattleResult`；
   它有**四个静默出口**（无战斗 / 剧情先消费 / `currentNpcId` 号段护栏 / 胜者两支之外没有 else），
   还有一个硬编码的一周年活动（A 组出局）。
9. **"我赢了"是三个状态的或**（§2.11）—— `isMyWin = Win | OpEscape | CaptureSuccess` ⇒
   ★**敌方逃跑和捕获成功都算胜利**，所以"硬胜才算数"这件事**写在数据里**（`battle.result.state=1` 出现 **12** 次），不是写在代码里。
10. **`battle.` 条件全库只有 43 条，但 2 条读在战斗外**（§2.12）—— 那 2 条之所以能读到，
    是因为**上游从不把 `currentBattle` 置空**（两行 `= null` 被注释掉了）⇒ 本份把它写成**显式契约**（**BTI9**），不靠泄漏。
11. **★结算会把全局随机数重新播种**（§2.13 / **BTC7**）—— `ProcessResult` 第一行就是 `Random.InitState(DateTime.Now.Ticks)`；
    而 NPC 的 `random` 条件（【样本】**158** 条 + 文字算子形若干）读的正是同一个会话寄存器 ⇒ **战斗与地图 NPC 之间有一条隐式信道**。
12. **我们的现状**（§6）—— 有一条"点野怪开打"的边（`mapScene.js:605-634`），但**没有 `<battle>`、没有 handler、没有战后链**。

---

## 1. 边界（本线只管这些）

### 1.1 圈里

| 块 | 内容 | 上游落点 |
|---|---|---|
| **战斗表** | `<battle>` / `<branch>` 的形状、列、作用域、悬空与未引用的**解析期审计** | `NpcInfo.cs:49-50` · `BattleInfo.cs:9-30` |
| **战斗配方** | `BattleSettings` 18 列（含缺省值方向）+ 数据侧**实际写了哪几列** | `BattleSettings.cs:12-54` |
| **敌方宠** | `BossInfo` 的 9 列 + `<status>` / 技能四列 / `emblem` 默认方向 | `BossInfo.cs:10-28` |
| **己方阵容** | `<player>` 三种来源的**选择规则**（不是构造规则） | `Battle.cs:45-56` |
| **触发面** | 哪些 handler 数组能挂 `battle` 动作、`param` 的形状、找不到分支时怎么办 | `NpcActionHandler.cs:355-377` |
| **准入门** | 三道门与三条文案（呈现走 **R5**） | `Battle.cs:204-248` · `BattleSettings.cs:136-171` |
| **交出去** | `BattleSpec`（决议）→ 战斗宿主 **E6** | `Battle.cs:217-218` |
| **接回来** | 战后链：`result.state` → `winHandler`/`loseHandler` → `NpcHandler.GetNpcEntity` | `MapSceneView.cs:482-531` |
| **`battle.` 键表** | 两张表的**两半**（settings / result），供 M3 的命名空间表引用 | `BattleSettings.cs:99-119` · `BattleResult.cs:35-51` |
| **野生遭遇谓词** | "会走 + 能打 + 点击触发"四条 AND（走的那一半归 M7） | `MapWildNpcBehaviourController.cs:15-27` |

### 1.2 圈外（本份只留形状，不重述）

| 不在本线 | 归 | 为什么 |
|---|---|---|
| 回合、效果、判定、伤害、捕获算式、经验算式 | **E 线**（E1–E7；结算算式 `docs/engine/battle-engine-session.md`，宠物写回 `docs/domain/domain-pet.md`） | 本份只把**数据翻成规格**、把**结果翻成动作** |
| 战斗界面（伤害拆分、连击均分、捕获动画、**倒计时条**） | `docs/view/battle-split.md`（**SP** 族）+ B5 | 显示归 View |
| `battle.` 之外的所有条件命名空间、6 个算子、`|`/换行的与或语义 | **M3** | 本份只交 2 张键表 + 43 条用例 |
| `battle` 动作在**动作表**里的位置、`param` 的通用形状、`NpcButtonHandler` 本体 | **M2** | 基石对象归 M2 |
| 对话 `func`/`reply` 的渲染与分支推进 | **M4** | 本份只统计它们触发了多少场战斗 |
| 门的层数、层号→分支号的选取、`GetRandomEnemyInfoList` | **C 组排期 ④「门」**（§2.13 只记账） | 门**借**本份的触发口，不自立一套 |
| 漫游 NPC 的走位与寻路 | **M7** | 谓词交叉见 §2.14 |
| 场景切换 / 会话字段宿主 | **编排线**（**OR2** / §4.1） | 宿主 ≠ 语义 |
| 肉鸽 `FixToYiTeRogue`、剧情 `StoryBattleCatalog`、卡牌、PVP 联机 | **A 组出局**（`docs/architecture.md §1.1`） | §2.15 只登记"数据里还有它们" |

---

## 2. 上游真值

### 2.1 `<battle>` 只挂在 `NpcInfo` 上【源码】

`NpcInfo.cs:49-50`：

```csharp
[XmlArray("battle"), XmlArrayItem(typeof(BattleInfo), ElementName = "branch")]
public List<BattleInfo> battleHandler;
```

⇒ **XML 里的 `<battle>` 是"数组容器"，`<branch>` 才是 `BattleInfo` 本身**（元素名与类名不同名，读代码时容易看反）。
全仓 grep `XmlArray("battle")` **只有这一处** ⇒ **`<battle>` 不会出现在图根、光口、道具或面板数据里**。【样本】272 张图里
`<battle>` 元素 **337** 个，逐条数下来**全部**在 `entities/npc` 之下，且**每个 NPC 最多一个 `<battle>`**（337 个 `<battle>` = 337 个 NPC）。

### 2.2 `BattleInfo` 的 7 列【源码】`BattleInfo.cs:9-30`

| XML | 列 | 类型 | 缺省 | 【样本】680 条分支里出现 |
|---|---|---|---|---|
| `@id` | `id` | **`string`** | `null` | **680 / 680**（每条都有） |
| `<content>` | `content` | `string` | `""` | ★**0**（且代码里 0 消费者 ⇒ **双重死列**） |
| `<settings>` | `settings` | `BattleSettings` | `new()` ⇒ **18 列全缺省** | **680 / 680** |
| `<player><pet/></player>` | `playerInfo` | `List<BossInfo>` | `null` | **32**（其余 648 ⇒ 用玩家真背包，§2.5） |
| `<enemy><pet/></enemy>` | `enemyInfo` | `List<BossInfo>` | `null` | **680 / 680 非空**（★空 = 0 条；构造时无条件解引用，见 **BTC5**） |
| `<winHandler><button/></winHandler>` | `winHandler` | `List<NpcButtonHandler>` | `null` | **571**（⇒ **109** 条分支胜利后**什么都不做**） |
| `<loseHandler><button/></loseHandler>` | `loseHandler` | `List<NpcButtonHandler>` | `null` | **95**（⇒ **585** 条分支失败后**什么都不做**） |

⚠️ **没有 `<drawHandler>`**：`BattleInfo` 结构上**没有平局这一支**，数据里 `<draw>` = **0**（实测）⇒ 和棋语义不存在（引擎侧的"双双倒下"只能落到 Win/Lose 之一）。
拷贝构造 `BattleInfo.cs:25-37` 逐列 `new`，`winHandler`/`loseHandler` 也**深拷**（`NpcButtonHandler.cs:30-37`）⇒ 一场战斗的配方是可复制的（门的"预览敌方"就靠这个）。

### 2.3 `BattleSettings` 18 列 —— 以及数据真正写了哪几列【源码】+【样本】

| 列 | XML | 缺省【源码】 | 【样本】出现次数 |
|---|---|---|---|
| `seed` | **无 `[XmlAttribute]`/`[XmlElement]`** ⇒ 序列化名 = `seed`（元素形） | `= (int)DateTime.Now.Ticks`（`:58` `:63`） | ★**0** ⇒ **地图战斗的种子全部来自时钟** |
| `isMod` | `@mod` | `false` | **0** |
| `isSimulate` | `@simulate` | `false` | `true` × **33** |
| `isEscapeOK` | `@escape` | **`true`** | **0**（⇒ 全库都可逃） |
| `isCaptureOK` | `@capture` | `false` | `true` × **170**（分布 **78** 张图 ⇒ **抓宠入口的数据面**） |
| `isItemOK` | `@item` | **`true`** | `false` × **21**（⇒ 21 条战斗禁道具） |
| `captureLevel` | `<captureLevel>` | `1` | **0**（⇒ 捕获等级恒 1，见 §2.11 的捕获宠） |
| `petCount` | `@count` | `6` | **680**（值：`6`→319 / `1`→245 / `3`→58 / `2`→58） |
| `parallelCount` | `@parallel` | `1` | **56**（★值**全是 `2`**，没有 3+） |
| `starLimit` | `@star` | `0` | **43**（值 2–7，`4` 占 28） |
| `filterLimit` | `<limit>` | `null` | **6** |
| `filterLimitDesc` | `<limitDesc>` | `null` | **6** |
| `time` | `@time` | `10` | **0** |
| `bgm` | `<bgm>` | `null` | **1** |
| `mode` | `<mode>`（文本） | `0 = Normal` | 非缺省 **349**：`1 SelfSimulation` **147** / `3 SPT` **138** / `4 Special` **61** / `6 Card` **3** |
| `rule` | `<rule>` | `0 = Anger` | **1**（值 `1 = PP`） |
| `weather` | `<weather>` | `0` | 非缺省 **212**，14 个不同值（`1`46 / `8`34 / `3`27 / `2`18 / `4`17 / `13`13 …） |
| `initBuffs` | `<initBuff>` 文本形如 `(rule:12)(k:id)` | `null` | **52** |

★三条要点：
1. **`@seed` 不是属性**（`BattleSettings.cs:12` 没有任何 XML 标注）⇒ 它能被 `XmlSerializer` 当**元素**读写，但**发行数据一条都没写** ⇒
   两个构造器都把 `seed` 设成 `DateTime.Now.Ticks` ⇒ **地图战斗的随机性不可复现**，且这是**上游的真实现**（不是我们的实现选择）。
   ⇒ 决议 ① + **R1/R2**：我们同样"缺省 = 注入时钟"，但**可复现性**由外部传 `seed` 实现（**BTQ6**）。
2. **缺省方向是"宽松"**：`escape=true` / `item=true` / `capture=false` / `count=6` / `parallel=1` / `time=10` ——
   数据只写**例外**（【样本】`@mod`/`@escape`/`@time` 一次都没写 ⇒ 这三列的**实际生效值 = 缺省值**，读数据时不要在脑子里给它们留位置）。
3. **`@simulate` 的语义不在战斗里，在结算里**：`BattleResult.cs:88` `if (endState.settings.isSimulate) return;`
   ⇒ 战斗照跑，**战后不写回任何东西**（不扣血、不给经验、不落盘）⇒ 那 33 条是**"演练/剧情演出战"**。

派生读列（`BattleSettings.cs:19-22`，不进数据）：`isPVP`（= `GetSettingsIdentifier("mode") == 2`）、`isAutoOK`、`isReveal`
（★依赖 `PhotonNetwork.CurrentRoom` ⇒ 联机出局，见 **BTC11**）、`isLimited`。

### 2.4 `<branch>` 的 id：字符串、作用域 = 一个 NPC【源码】+【样本】

【样本】680 条分支的 `@id` 全局频次 top：`default` **275** / `evolve` **45** / `challenge_1` **27** / `challenge_2` **27** /
`miracle` **18** / `1`–`5` 各 **16** / `challenge_3` **14** / `resident_miracle` **8** / `story` **8** / `capture` **8** / `skin` / `sun` / `test` / `boss` / `shadow` …

- **同一个 NPC 内部零重号**（实测 `dup_within_npc = 0`）⇒ 唯一性作用域**恰好**是"一个 NPC"，与消费方一致：
  `NpcActionHandler.cs:362` `npcInfo.battleHandler.Find(x => x.id == handler.param[0])`。
- **跨图、跨 NPC 大量重号**（`default` 275 次）⇒ **不得**把 branch id 当成全局键，**不得**建全局 branch 表（**BTI3**）。
- **数字 id 是给门用的**（`DoorModel.cs:64` 用 `int.Parse(x.id)` 取最大层）⇒ 门系 NPC 的分支必须能 `int.Parse`，
  而 `default`/`evolve` 这类具名分支**不能**进门（解析期可据此校验，§3.1）。

### 2.5 敌方宠 `BossInfo` 的 9 列【源码】+【样本】

`BossInfo.cs:10-28`（★敌方宠与玩家宠**不是同一个类**：敌方用 `BossInfo`，进场时才 `BattlePet.GetBattlePet(BossInfo)` 翻成战斗宠 —— 那道接缝归 **E3/D6**）：

| XML | 列 | 类型 / 缺省 | 【样本】680 条分支的敌方 1033 只宠里出现 |
|---|---|---|---|
| `@id` | `petId` | `int` | **1033**（★全有） |
| `@level` | `level` | `int` | **1033**（★全有） |
| `<status>` | `status` | `BattleStatus` \| `null` | **452**（⇒ 581 只走"按等级算出来"的常规数值） |
| `<emblem>` | `hasEmblem` | `bool`，★**缺省 `true`** | **5**（且**五条全是 `false`** ⇒ 数据只写例外） |
| `<initBuff>` | `initBuffIds` | 逗号串 → `BuffReferData.CreateBuff(Parse(x))` | **611** |
| `<headerSkill>` | `headerSkillIds` | 逗号串 → `Skill.GetSkill(x,false)` | **150** |
| `<loopSkill>` | `loopSkillIds` | 同上 | **1018**（★主力列） |
| `<normalSkill>` | `normalSkillIds` | 同上 | **2** |
| `<superSkill>` | `superSkillId` | **单个 `int`**（不是串） | **319** |

- ★**`<pet>` 只有 `@id` / `@level` 两个属性被写过**（`personality`/`feature`/`iv`/`ev` 实测 **0** 次，而且 `BossInfo` 类里**根本没有这些列** ⇒ 写了也会被 `XmlSerializer` 静默丢弃）。
- **每分支敌人数**：`1`→532 / `2`→61 / `3`→49 / `6`→36 / **`7`→1 / `9`→1**（`-1`「Lv 105 贪星者」7 只、`403`「Lv105 九尾冰狐」9 只，两条的 `@count` 都写着 `6`）。
  ⇒ **`@count` 不裁敌方**：`Battle.cs:50/:52` 对己方两处 `.Take(petCount)`，`Battle.cs:54` 敌方**没有** `Take`（**BTC6**）。
- `BossInfo.cs:45-75` `GetRandomEnemyInfo` / `GetRandomEnemyInfoList` —— 读 `GameManager.versionData.petData.petLastEvolveDictionary` 再 `.Random()` ⇒
  ★**全仓调用者只有 `DoorModel.cs:144-145`（门）与 `YiTeRogueChoice.cs:131-137`（出局）** ⇒ **地图战斗数据不随机生成敌人**（敌人在 XML 里逐只写死），
  这条随机消费点**不属于本份**，随 §2.13 一起记给**门线**。

### 2.6 ★触发面：543 个 `battle` 动作，**对话是主场**【样本】

对 272 张图逐条数"哪个 handler 数组里的动作是 `battle`"（`action` 文本 = `battle`；`NpcButtonHandler.cs:65` 把它映成 `NpcAction.Battle`）：

| 宿主数组 | `battle` 动作数 | 备注 |
|---|---|---|
| `npc/dialog/branch/functionHandler`（`<func>`） | **243** | 对话的**系统跳转**（`M4`） |
| `npc/dialog/branch/replyHandler`（`<reply>`） | **148** | 对话的**玩家选项**（`M4`） |
| `npc/eventHandler`（`<button>`） | **150** | NPC 自身事件（`M2`；`@type` = `click` **140** + `shoot` **10**，见下） |
| `npc/callbackHandler`（`<button>`） | **2** | 回调（`NpcActionHandler.Callback`） |
| `battle/branch/winHandler` \| `loseHandler` | **0** | ★**战后链不再嵌套战斗**（实测 0，与 M5 的"光口 ∪ teleport"同族结论） |
| **合计** | **543** | 其中 **391 = 72% 来自对话** |

⇒ **两条硬结论**：
1. **M6 与 M4 必须同批落地**才跑得通战斗线：只做 NPC 点击 ⇒ 只能打开 **152/543** 个入口。
2. `eventHandler` 的 150 条 `battle` 动作**全带 `@type`**（`click` **140** + `shoot` **10**；实测 `eventHandler` 的
   `<button>` **766 个、0 个缺 `@type`**，分布 `click` 668 / `auto` 65 / `shoot` 25 / `enter` 4 / `exit` 4）⇒
   140 条走 `ButtonEventType.OnPointerClick` 的点击路径、10 条过 `shoot` 的 XOR 门 ⇒ **`@type` 在这类动作上是驱动面之一、不是装饰**（**BTQ5**，**纠正初稿"全为空"**）。
   ⚠️ 但**动作分类**仍由 handler 数组决定（`eventHandler` = 点击 / `callbackHandler` = 回调 / `func`·`reply` = 对话），**不用 `@type` 反推**
   （`NpcHandler.cs` 的 `GetButtonEvent` 对 `None`/`Auto` 返回 `null` 这条**只是缺省兜底**，与本 150 条无关）。

### 2.7 分支引用完整性：**543 个动作 vs 680 条分支**【样本】★本节的三个数是 M6 的骨架

- **动作指向的分支都在同一个 NPC 里**：543 条中 **535** 条 `param[0]` 命中本 NPC 的某条分支；
  ★**8 条悬空** —— `1081`–`1088` 八张图（欲望/暴食/贪婪/虚弱/狂暴/妒忌/傲慢/忏悔殿宗「七宗罪回廊」，NPC `108x01` 莫利亚…撒旦）
  的对话 `<func>` 写着 `<action>battle</action><param>hell</param>`，而这 8 只 NPC 只有 `challenge` / `story` 两条分支；
  **`hell` 分支全库不存在**（实测 0）。后果：`NpcActionHandler.cs:364-367` `param.Count <= 1` ⇒ **静默 return**（连提示都没有）
  ⇒ 玩家点了那个对话选项**什么都没发生**（**BTC8**，按 `AGENTS.md §2` = 声明 + 不照搬）。
- **反向：154 条分支没有任何动作引用** = **147 数字 id**（门层地板，`DoorModel` 自己按层号选）+ **7 条具名**
  （`-1100` 的 `miracle` / `resident_miracle`、`-4` 的 `default`、`2` 的 `default`、`2` 的 `test`、`413` 的 `sun`、`540` 的 `test`）。
- ⇒ **入口图 = NPC 动作（543）∪ 门（147 条数字分支）∪ 调试（`test`）**，与 M5 **TPI9** 完全同构：
  **只按一张表建索引会漏掉一大半可达性**（**BTI4** + §3.1 的两张审计表）。
- ⚠️ 但**与 M5 不同**：这 8 条悬空是**代码 bug**（`hell` 分支被删过），而 M5 的 95 张零入边图**是数据习惯** ⇒ 所以本份对悬空**要报错**，对未引用**只登记**（**BTQ2**）。

### 2.8 三道开工门【源码】`Battle.cs:204-248`

```
StartBattle(info)                       ← NpcActionHandler.cs:376 / DoorModel.cs:122
 └ TryStartBattle(info, out err)        ← StoryPanel.cs:521（出局剧情也复用）
    └ CanStartBattle(info, out err)     ← StoryPanel.cs:499（预览用）
       ① info == null            ⇒ "战斗配置不存在。"
       ② isPlayerPetBag && isFirstPetDead ⇒ "首发精灵血量耗尽，快去恢复精灵吧！"
       ③ settings.Condition(petBag.Take(petCount)) ⇒ settings 自己的文案
    ⇒ new Battle(info) + ChangeScene(SceneId.Battle)
```

- **②的变量名与语义相反**：`bool isPlayerPetBag = ListHelper.IsNullOrEmpty(battleInfo.playerInfo);`（`Battle.cs:231`）——
  字面是"用玩家背包"，实值是"**这条分支没写 `<player>`**"。后果：写了 `<player>` 的 **32** 条分支**跳过首发死亡检查**（**BTC4**）。
- **③拿玩家背包去校验，即使上场的是数据阵容**：`Battle.cs:241` `Player.instance.petBag.Take(petCount)` 无条件喂给 `settings.Condition`
  ⇒ 同一处不一致（**BTC4** 的第二半）。
- `settings.Condition`（`BattleSettings.cs:136-159`）内部还有**四个早退/文案**：
  `GameManager.instance.debugMode` ⇒ **直接放过**；`isSimulate || pet == null` ⇒ 放过；
  `!isMod && isLimited && PetInfo.IsMod(pet.id)` ⇒ "无法使用Mod精灵进行本体关卡的挑战哦\n<color=#ffbb33>橘色名字</color>的是Mod精灵"；
  `starLimit > 0 && pet.info.star > starLimit` ⇒ "不能携带超过<color=#ffbb33>{starLimit}星</color>的精灵进行挑战哦"；
  最后 `message = filterLimitDesc; return GetBattleLimit()(pet)`（`GetBattleLimit` = `Parser.ParseConditionFilter<Pet>(filterLimit, …)`，`:130-134` ⇒ **M3 的算子**）。
- **失败呈现** = `Hintbox.OpenHintboxWithContent(message, 16)` ⇒ 走 **R5**；★**成功时不弹任何东西**，直接切场景。

### 2.9 ★战后回图的再入链【源码】`MapSceneView.cs:36-50` + `:482-531`

调用面**只有一个**：`SetMap(map)` 在**装配完资源与实体之后**（`:45` `SetResources`、`:46` `SetEntites`）调 `:47` `CheckBattleResult()`。
★**这个顺序是承重的**（**BTI7**）：`winHandler` 的动作会 `setNpcParam` / `openDialog` / `setItem`，全部要求 NPC 已经在场。

```
CheckBattleResult():
  :484  player?.currentBattle?.info == null        ⇒ return        ← 出口①（正常游玩进来时）
  :490  StoryBattleSession.TryConsumeBattleResult(…) ⇒ return       ← 出口②（★出局剧情"先消费"）
  :493  currentNpcId == 0
        || (currentNpcId ∈ [50000,50100] && currentMapId != 500) ⇒ return ← 出口③（★号段护栏，静默吞链）
  :499  npc = npcDict.Get(currentNpcId)            ← 只在**当前图**内解引用
  :506  result.isMyWin → actionList = winHandler.Select(GetNpcEntity)
  :511  ★硬编码：map.id ∈ [82,90] && npc.id ≥ 8200 ⇒ new Item(7, Random.Range(1,5)) + Item.Add + OpenHintbox
  :519  else if result.isOpWin → loseHandler.Select(GetNpcEntity)
        ★没有 else                                  ← 出口④
  :524  foreach action → action.Invoke()
  :529  currentNpcId = 0
  :530  currentBattle.info = null        （★`currentBattle` 本体**不清空**，`:486`/`:495` 两行 `= null` 被注释掉）
```

- **出口③的真意**（【样本】）：全库落在 `[50000,50100]` 的 NPC **只有 3 只，全在 `500`「实验禁地」**（`50001` 伊特 / `50017` 伊特大乱斗奖励事件 / `50018` 伊特大乱斗随机事件），
  而且**这 3 只都带 0 条 `<branch>`** ⇒ 这条护栏**服务的是肉鸽（A 组出局）**，不是地图战斗 ⇒ **不照搬号段判断**（**BTQ1**）。
- **`GetNpcEntity`（`NpcHandler.cs:98-114`）在动作之前套了两道门**：
  ① `Player.instance.isShootMode ^ (handler.typeId == "shoot")` ⇒ return（★`@type` 的**双重语义**：在 `eventHandler` 里是事件名，在这里是"只在射击模式跑"）；
  ② `!condition.Invoke()` ⇒ return（`GetNpcCondition`，`NpcHandler.cs:47-69`：换行 **AND**、`|` **OR** ⇒ 归 M3）。
- **出口④的可观察后果**：`Error`（唯一现实产生点 = `Battle.cs:268` 无限循环中断）与 `Fighting` 时，
  **战后链两边都不跑**，而 `:529-530` 照样清空 `currentNpcId` ⇒ **一次性吞掉**（**BTC3**）。
- **`:511` 是硬编码活动**（一周年争霸赛送道具 7）+ 直用 `UnityEngine.Random` ⇒ A 组出局 + **R1** 违例（**BTC9**）。

### 2.10 战斗怎么结束【源码】（接缝，不重述引擎）

`BattleState.cs:44` 拿 `settings.weather`；结果态由**四处**写：
`TurnEndPhase.cs:44/48`（Lose / Win）、`EffectAbilityHandler.cs:48`（效果强制胜负，按 `lhsUnit.IsMyUnit()`）、`:60`（逃跑，按 `atkUnit.IsMyUnit()`）、`:101`（`CaptureSuccess`）；
外加 `Battle.cs:268` 的 `Error`（无限循环熔断：`round > 100 × (OnAfterAttack − OnBeforeAttack + 1)` 或任一 `pet.chain > 100`）。
返回地图有两条：`BattleManager.cs:73`（正常结算完）与 `Battle.cs:273`（熔断提示盒的确认回调）。
★**`BattleResultState.Timeout = 99` 全仓没有任何赋值点**（实测 grep 只有枚举声明 `BattleResult.cs:249`）
⇒ **`settings.time` 有消费者（`BattleSystemView.cs:49` `timer.SetTimer(...)`）但没有生产者**：倒计时到点**不发生任何事**（**BTC10**）。

### 2.11 胜负的宽定义与结算输入【源码】

`BattleResult.cs:19-25`：

| 谓词 | 定义 | 后果 |
|---|---|---|
| `isBattleEnd` | `state != Fighting` | — |
| `isKO` | `Win \| Lose` | 只问"打到瘫" |
| `isEscape` | `MyEscape \| OpEscape` | — |
| `isCapture` | `CaptureSuccess` | — |
| **`isMyWin`** | **`Win \| OpEscape \| CaptureSuccess`** | ⇒ **对面跑了、抓到了，都算我赢 ⇒ 都走 `winHandler`** |
| **`isOpWin`** | **`Lose \| MyEscape`** | ⇒ **我方逃跑算输** |

结算的输入只有三列（`BattleResult.cs:61-113`，**算式归 E6/D6**，本份只登记"哪列开关哪段"）：
`state == Error` ⇒ 早退（`:66`）；`settings.isSimulate` ⇒ 早退（`:88`）；
`state == CaptureSuccess` ⇒ 用 **`endState.opUnit.pet`** 的 `baseId` / `feature.hasEmblem` / `basic.gender` + **`settings.captureLevel`** 造一只新宠并 `Pet.Add`，随后 `SaveData` + `return`（`:99-105`）；
否则 `if (!isMyWin)` ⇒ 只 `SetBasic`（`settingsData.autoHealAfterBattle` 决定回不回满血）+ `SetRecord`（★**`level < 60` 不计胜负场次**）就 `SaveData` 早退（`:94-97`）；
赢了才走 `SetTalent` → `SetExp` → `SetSkill`（★`level < 60` 不学密技，`:108-110`）。
⇒ **"赢"与"有奖励"是两件事**：捕获胜利 `return` 在 `SetTalent` 之前 ⇒ **抓到的那只不给经验**（同族：`OpEscape` 给）。

### 2.12 `battle.` 条件命名空间：两张键表 + 43 条实测用例【源码】+【样本】★本节是 M3 的输入

**两半**（M3 §命名空间表里 `battle.` 那一臂的正本 = 这两处）：

- `BattleSettings.GetSettingsIdentifier`（`BattleSettings.cs:99-119`）= **14 键**：
  `mode / rule / petCount / parallelCount / starLimit / time / weather / mod / simulate / escape / item / capture / captureLevel / reveal`；
  ⚠️ 两条特殊臂：`"mode"` 把 **`Record(-1)` 报成 `PVP(2)`**（`:103`）；`"captureLevel"` 在 `isCaptureOK == false` 时报 **`-1`** 哨兵（`:115`）；`_ => float.MinValue`（`:117`）。
- `BattleResult.GetResultIdentifier`（`BattleResult.cs:35-51`）= **8 键** `state / fightPetCount / isEnd / isKO / isEscape / isCapture / isMyWin / isOpWin`
  \+ **`capturePet.<x>` 透传**（`capturePet == null` ⇒ **`-1`**，`:38-39`）；同样 `_ => float.MinValue`。

**路由**（★两半之间还夹了一层）：`battle.<x>` ⇒ `Identifier.cs:163-167`（补前缀 `state.`）→ `Identifier.GetBattleIdentifier`（`:228-266`，`me.`/`op.`/`last.` 三臂）
→ `BattleState.GetStateIdentifier`（`BattleState.cs:92` `settings.` / `:95` `result.`）→ 上面两表。
⇒ 于是数据里 **`battle.result.state=1`** 与 **`battle.state.result.…`** 走的是同一条（`battle.` 后面直接被补成 `state.`，再被分派到 `result.`）。

**【样本】43 条含 `battle.` 的 `<condition>` 元素**（winHandler **39** / loseHandler **2** / 对话 `replyHandler` **2**），键只用过 6 种：

| 表达式 | 次数 | 宿主 | 语义 |
|---|---|---|---|
| `battle.result.state=1` | **12** | `10020`/`10026`/`10030`/`10043`/`121`/`131` 的 ★`Lv…★` 星宠 winHandler | **在 winHandler 里再筛"硬胜"**（排除 `OpEscape` / `CaptureSuccess` 这两种"也算赢"） |
| `battle.turn>10` / `LTE10` / `GTE11` / `LTE5` | **6+**（`-20`/`20` 加尼隆、`10025` 盖亚、`240` 盖亚） | winHandler | **速通判定**（回合数） |
| `battle.op.pet.buff[101].count>0` / `LTE0` | 4（`1081`–`1088` 系） | winHandler | **对面必须/不得带某 buff** |
| `battle.me.skill.criticalResult=1` | 3（`240` Lv70 盖亚） | winHandler | **本场出过暴击** |
| `battle.me.pet.baseId=61` | 1（`124` Lv100 星辰兔） | winHandler | **必须用某只宠打的** |
| `battle.op.pet.status.lostHpGTE1000000` | 4（`870` Lv105 影灵兽，**win 与 lose 两支都带**） | win + lose | **伤害挑战**（不管胜负，只看打掉多少血） |
| `battle.result.capturePet.id=10` / `NOT10` | **2**（`50004`「异蘑世界」NPC `12106`「油民」） | ★**对话 `replyHandler`** | **战斗外**读上一场捕获结果来分流对话 |

⇒ **三条真值得单独记**：
1. **"胜利的子型"写在数据里，不在代码里**（12 条 `battle.result.state=1`）⇒ 我们的 `winHandler` **不得**假定"进来了就是硬胜"（**BTI8**）。
2. **`50004` 的 2 条对话条件读的是一场已经打完的战斗** ⇒ 它能读到的唯一原因是 `currentBattle` **从不清空**（`MapSceneView.cs:486`/`:495` 两行注释）。
   ★这是**承重墙不是泄漏**：本份把它写成显式契约（**BTI9** / **BTQ1**）。
3. **两个失败模式不一致**：条件层 `NpcConditionHandler.GetBattle`（`:124-130`）在 `battle == null` 时 `return op != "="`
   ⇒ 无战斗时 **`battle.x ≠ y` 恒真**；表达式层 `Identifier.cs:166` 用 `battle?.currentState` 但 `GetBattleIdentifier`（`:235`）**无条件解引用** `battle.currentState`
   ⇒ 无战斗时读 `battle.` **表达式**是 NRE 面。**同一条键，两条不同的静默/崩溃路径**（**BTC11**）。
4. ★**天气两套数不互相注入**：地图 `map@weather`（root 属性，值含 `100002`/`100003`/`100004` 三个"像 mapId"的怪值，5 张图）只喂 HUD
   （`MapUIController.cs:21` → `MapInfoModel.cs:11` → `MapInfoController.cs:25` `Buff.GetWeatherBuff`）；
   **战斗天气只来自分支 `<settings><weather>`**（`BattleState.cs:44`）⇒ 上游没有任何"地图天气 → 战斗"的通道（**BTI6**，B1 的接缝）。

### 2.13 出局面与门（只登记，不实现）

| 上游件 | 内容 | 处置 |
|---|---|---|
| `BattleInfo.cs:39-46` `FixToYiTeRogue` / `:48-81` `OnYiTeRogueBattleWin` / `:82-89` `OnYiTeRogueBattleLose` | 把配方改写成肉鸽事件（`Item(6,…)`、`Item(10232,3)`、`Panel.OpenPanel<YiTeRoguePanel>()`） | **A 组出局**；数据里没有任何列触发它 |
| `BossInfo.cs:77-107` `FixToYiTeRogue` | 按层数改写 level/status/initBuff/loopSkill | 同上 |
| `BattleResult.cs:71-79` YiTeRogue 分支 | 战斗后把血量写回 `YiTeRogueData.petBag` | 同上 |
| `Battle.cs:62-101` PVP 构造器 + `:19-22` `isReveal` | 读 `Hashtable` 房间属性、`PhotonNetwork.CurrentRoom` | **A 组出局（联机）** |
| `StoryBattleCatalog.cs:55-81` / `StoryPanel.cs:499` `:521` / `StoryResourceValidator.cs:206-207` | 剧情按 `battleHandler` 里"有 `@id` 的分支"建目录，并**先于** `CheckBattleResult` 消费结果 | **A 组出局（剧情）**；⚠️ 它解释了出口②为什么排在前面 |
| `BattleRecord.cs:11-38` | `originalResultState` 与"逃跑折算成胜/负" | 战报线（PVP 用），本份不接 |
| **`DoorModel.cs:13-20` + `:49-77` + `:101-170`** | ★门 = **第五个触发入口**：`floor => battleInfo.id`、层号读活动键 `door[mode][floor]`（默认 `"1"`）、选不到就 `int.Parse` 取最大、`competition`/`hero`/`new_basic` 三种门**自己 `new BattleInfo`**（含 `BossInfo.GetRandomEnemyInfoList`），最后仍回落到 `NpcActionHandler.StartBattle(npcInfo, new NpcButtonHandler(){param=[floor]})` | **记给 C 组排期 ④「门」**（`docs/architecture.md §1.1`）；本份只保证**那条回落口**的形状正确 |
| `YiTeRogueChoice.cs:122` `:131-137` | 肉鸽自己拼 `BattleInfo` + `GetRandomEnemyInfo` | A 组出局 |

⇒ **门之所以在本份里出现两次**：① 它是 **147 条"未被引用分支"** 的解释（§2.7）；② 它是 `battle` 动作面**之外**的开工口（§2.6 那张表统计不到它）。

### 2.14 野生遭遇谓词（与 M7 的交叉）【源码】`MapWildNpcBehaviourController.cs:15-27`

```csharp
CanUseWildBehaviour(info) =
    info.wildInfo != null
 && info.battleHandler != null && info.battleHandler.Count > 0
 && info.eventHandler != null
 && info.eventHandler.Any(h => h.type == ButtonEventType.OnPointerClick && h.action == NpcAction.Battle);
RequiresNavigator(info) = CanUseWildBehaviour(info) && info.wildInfo.movement?.isWander == true;
```

⚠️ **本节初稿曾断言"谓词恒假"，已被 M7 的实测推翻**（**纠正**，见 `docs/map/map-move.md §2.5`）：
第四条 AND 要求 `@type == "click"`，而【样本】含 `<wild>` 的 NPC **110 只 / 53 图** ——
其 `eventHandler` 的 `<button>` **766 个、0 个缺 `@type`**，其中 `battle` 动作 **150 条全带 `@type`**（**`click` 140 + `shoot` 10**）
⇒ **110/110 只野怪都满足四条 AND**（`RequiresNavigator` = **107** = 107 只 `wander`）
⇒ 上游"野怪会走 + 能打"这套行为控制器**在重启的地图数据下是活的**。
（初稿把 150 条 `battle` 动作记成"全都没写 `@type`" —— 那句是**记错了**，同源但 `@type` 分布当时读错。）

⇒ 本份的处理**不变**：**照录数据**（**V2** 口径，不猜意图），并把"野怪能不能打"做成**我们自己的显式配置位**（**BTQ5**）——
谓词为真**不改**这条口径；`CanUseWildBehaviour` 的四条 AND 记成 M7 的谓词输入（走位归 M7，`battle` 归本份）。

### 2.15 `TestBattle`：id 约定在发行数据里有实物【源码】+【样本】

`Map.cs:75-77`：`TestBattle(int mapId, Pet[] petBag)` 合成 **`npcId = mapId * 100 + (mapId > 0 ? 1 : -1)`**、**`battleId = "test"`**，
再走 `Map.cs:58-59 GetBattleInfo(map, npcId, battleId)`（★这条是 null-safe 的：`?.battleHandler?.Find(x => x?.id == battleId)`）
→ `Map.cs:80-90 OnLoadTestBattleMapSuccess` → `new Battle(player, enemy, settings)` + 切战斗场景。

【样本】全库有 `test` 分支的 NPC **恰好 3 只**，且 id 逐条**命中这个公式**：

| 图 | 图名 | NPC id | 公式 | 分支 |
|---|---|---|---|---|
| `-2` | — | `-201` | `(-2)×100 + (-1) = -201` ✓ | `default` / `test` |
| `2` | 约瑟… | `201` | `2×100 + 1 = 201` ✓ | `default` / `test` |
| `540` | — | `54001` | `540×100 + 1 = 54001` ✓ | `default` / `test` |

⇒ **这是"我们自己人手测战斗链"的现成抓手**（§7.3）：`test` 分支与 `Map.TestBattle` 的双向互证 ⇒ 我们实现调试入口时**沿用同一公式**，
并且可以拿这 3 张图当"最先该打通的样本"。

---

## 3. 目标形状（契约）

### 3.1 数据（L2 现场解析记录；落点与文件形状归 M1，本节只给列）

```jsonc
// `parse-map.js` 的 `MapRecord` 里每个 npc 追加（方案 C：无 JSON 产物，运行时现场解析）：
"battles": [                       // ← <battle> 的 <branch> 列表（每 NPC ≤1 个容器）
  { "id": "default",              // ★字符串，作用域 = 本 NPC（BTI3）
    "settings": { "count": 6, "capture": false, "escape": true, "item": true, "simulate": false,
                  "parallel": 1, "star": 0, "time": 10, "mod": false,
                  "mode": 0, "rule": 0, "weather": 0, "bgm": null,
                  "captureLevel": 1, "limit": null, "limitDesc": null, "initBuff": [],
                  "seed": null },  // ★缺省 null ⇒ 运行时按 R2 取时钟（不写进数据，BTI5）
    "player": null,                // ← 32 条有；null = 用玩家真背包（BTI5）
    "enemy": [ { "id": 961, "level": 105, "status": {…}|null, "emblem": true,
                 "initBuff": [12,13,…], "headerSkill": [], "loopSkill": [], "normalSkill": [], "superSkill": 0 } ],
    "winHandler":  [ /* NpcButtonHandler，M2 的形状 */ ],   // 571 条有
    "loseHandler": [ … ]                                     // 95 条有
  }
]
```

- **`content` 不建列**（§2.2 双重死列）。
- **桥做四类解析期登记**（同 M5 的口径，只登记不报错）：
  `battle-branch-dup`（同 NPC 内重号，实测 0 例）、`battle-branch-nonint-in-door`（门系 NPC 的分支号不能 `int.Parse`）、
  **`battle-branch-unreferenced`**（**154** 条：147 数字 + 7 具名 ⇒ **只读审计**，供门线分诊）、
  **`battle-action-dangling`**（**8** 条 `hell` ⇒ ★这一类**要报警**，因为它是代码 bug，**BTQ2**）。
- ★**第二张边表**：`battles[].id` 的**引用来源**（哪个 handler 数组的哪个动作指向它）由 **M2 的 L0 解析器**产出，**桥自己不产**（同 M5 §3.1 与 M1 **MDI10** 的分工）。

### 3.2 `BattleSpec`（内核只出决议 → **E6**）

内核（`core/map/action.ts` 的 `battle` 那一条，MQ4 / **MP4**）产出的是一条**决议**，不是战斗对象：

```ts
// ActionIntent
{ kind: 'battle',
  spec: { mapId, npcId, branchId,                       // ← 三者定位一条配方（npcId 只在当前图内可解引用，§2.9）
          settings,                                     // ← 已按 §3.1 缺省方向填齐
          side:  { kind: 'data', pets: BossInfo[] }      // player 非空（32 条）
                 | { kind: 'bag', take: settings.count },// 否则用真背包前 count 只（648 条）
          enemy: BossInfo[],                            // ★不裁到 count（BTI2）
          onWin: NpcButtonHandler[], onLose: NpcButtonHandler[] },
  host: 'e6' }
```

- **`seed == null` ⇒ 由编排层向 R2 取时钟**、**战斗开始后 R1 用它播种** ⇒ 内核**不碰时钟**（决议 ③ + **BTI5**）。
- 开工门（§3.3）**不通过 ⇒ 不发决议**，改发一条 `{kind:'hint', text}`（走 **R5**）。
- 战斗宿主接过去跑（E6）；**回来时本线要能读到结果对象**（§3.4）。

### 3.3 开工三门（我们的目标行为 = 上游三门，**修掉两处不一致**）

| 门 | 目标行为 | 与上游的差 |
|---|---|---|
| ① 配方不存在 | **必须给文案**（"战斗配置不存在" 同义），且解析期已登记过 `battle-action-dangling` | 上游对"分支找不到"**静默 return**（`NpcActionHandler.cs:364-367`）⇒ **BTC8 的修法** |
| ② 首发是否可用 | **只在校验对象 = 上场对象时才检查**：`side.kind === 'bag'` ⇒ 查队首；`side.kind === 'data'` ⇒ **查数据阵容的队首**（上游这里查的是玩家） | **BTC4** |
| ③ `settings` 准入 | 逐条：`star ≤ starLimit`、非 Mod 宠（当 `!mod && (star>0 \|\| limit)`）、`limit` 表达式过滤；文案取 `limitDesc`；★**没有 `debugMode` 旁路** | 上游 `BattleSettings.cs:139` 的 `debugMode` 直接放过 ⇒ **不照搬**（`AGENTS.md §2`） |

三门任一失败 ⇒ **不切场景**，一条 `hint` 决议；三门过 ⇒ 发 `battle` 决议 + 编排层切场景（**OR2**）。

### 3.4 战后再入（**本线最容易做错的一段**）

目标 = 上游 §2.9 的形状，**去掉两个静默出口、保留两条真语义**：

1. **顺序契约**：**先装配实体、再跑战后链**（**BTI7**）——装配包含 NPC、光口、可交互件；战后链的动作要能 `setNpcParam`。
2. **发起方标记**：`发起战斗时`记一条 `battleOrigin = { mapId, npcId, branchId }`（取代"只看 `currentNpcId`"），
   回图时**必须同图**才跑（★取代 `:493` 的 `[50000,50100]` 号段判断，**BTQ1**）；无 origin ⇒ 干净跳过（不打扰）。
3. **两支 + 一条显式第四支**：`isMyWin → onWin`、`isOpWin → onLose`、**其余态 ⇒ 显式"不办事"并登记一条 `result-state-unhandled`**
   （我们这里 `Error` 由 E 线的熔断续写产生，仍需给玩家一句返回提示 —— **BTC3** 的修法）。
4. **每个 handler 走 M2/M3 的同一台机器**（`type` 的射击 XOR + `|`/换行的条件与或），**不为战后链另开一条评估路径**。
5. **读窗口（★新增，**BTQ1**）**：回图后到下一次开工前，会话必须提供一份**上一场战斗的只读快照**，
   使 §2.12 的 43 条 `battle.` 条件（含 `50004` 战斗外那 2 条）**全部可算**。
   实现口径：`lastBattle = { settings, result, endState? }`，由编排层持有、E6 填充；**不许**用"忘了清空 `currentBattle`"来实现它。
6. **不清理的东西也不许顺手清**：`battleOrigin` 只在这次用完置空、`lastBattle` 保到下一次开工；★**结算不得重新播种全局 RNG**（§2.13 / **BTC7**）。

### 3.5 与 M2 / M3 / M4 / 门线 / E6 的接缝

| 接缝 | 谁给谁 | 内容 |
|---|---|---|
| **M2** | M2 → M6 | `battle` 是动作表第 13 行的一个 `NpcAction`；`param[0]` 的通用形状、`NpcButtonHandler` 本体归 M2；M6 给**引用完整性两张表**（§3.1）与"找不到分支"的报警口径 |
| **M2/M6** | M6 → M2 | ★`NpcActionHandler.cs:361`（先把 `currentNpcId` 写下去再判 null）是 M2 动作执行器的**副作用顺序**反例 ⇒ 记 **BTC1**，M2 的执行器一律"决议齐了才写会话" |
| **M3** | M6 → M3 | `battle.` 命名空间的**两张键表**（§2.12）+ 43 条实测用例 + `float.MinValue` 兜底方向 + **两条不同的失败模式**（条件层 vs 表达式层）⇒ M3 的键表以此为准 |
| **M4** | M6 ↔ M4 | ★**543 条触发口里 391 条在对话里** ⇒ M4 的动作执行必须能发 `battle` 决议；M4 的 `func`/`reply` 形状 = `NpcButtonHandler`（同一台机器） |
| **M7** | M6 ↔ M7 | `CanUseWildBehaviour` 的四条 AND（§2.14）里"能打"归本份、"会走"归 M7；实测该谓词在发行数据下**为真（110/110）** |
| **门线（C 组 ④）** | M6 → 门 | 门用**回落口** `StartBattle(npcInfo, param=[floor])`；147 条数字分支 + `GetRandomEnemyInfoList` 的随机消费点随门走；`floor` 键 = `door[mode][floor]` 属**活动键袋**（M3/MC 的 `data.` 同族） |
| **E6** | M6 ⇄ E6 | 出去 = `BattleSpec`；回来 = `BattleResult`（`state` / `capturePet` / `gainExpPerPet` / `learnedSecretSkills`）；★结算写回宠的列归 **D6**，落盘归 **R4**（决议 ③） |
| **B3 / B1** | — | 野怪脚标、NPC 贴图、天气图标归 View；本份不给任何像素 |

### 3.6 施工批草案（**MDB6-a…e**，等 impl）

| 批 | 内容 | 依赖 |
|---|---|---|
| **MDB6-a** | 现场解析器的 `battles[]` 列（§3.1）+ 四类登记（含 `battle-action-dangling` 的**报警**） | **M1** / MB1 |
| **MDB6-b** | `core/map/battle-spec.ts`：`BattleSpec` 类型 + 缺省填充（§2.3 的缺省方向）+ 三门判定（**纯函数**，R2 注入时钟） | **M2** 动作决议 |
| **MDB6-c** | `battle` 动作接线：NPC / 对话 `func` / 对话 `reply` **三个来源共用一条**，`onWin`/`onLose` 原样带着走 | **M4** / **MDB6-b** |
| **MDB6-d** | 战后再入：`battleOrigin` + `lastBattle` 读窗口 + 两支一第四支（§3.4） | 编排线 **ORB** 会话切片 / E6 |
| **MDB6-e** | `battle.` 键表落 `core/map/keys-battle.ts`（两半 14+8 键 + 两哨兵），接进 M3 的命名空间分派 | **M3** |

---

## 4. 数据流（一条链）

```
发行数据 <npc><battle><branch id>          (272 张图 / 337 个容器 / 680 条分支)
   │  桥（MDB6-a，先剥注释再解析）
   ▼
npcs[].battles[] ────────────────┐
                                 │  543 个 battle 动作（func 243 / reply 148 / event 150 / callback 2）
NPC 点击 · 对话跳转 · 对话选项 ────┤        ↓  M2 的 GetNpcCondition（M3）筛
                                 │  命中 param[0] ⇒ 一条 branch（★找不到 = 报警，不静默）
                                 ▼
                        【开工三门】(§3.3) ──失败──→ R5 提示盒（不切场景）
                                 │ 过
                                 ▼
                        BattleSpec（决议，§3.2）
                                 │  seed==null ⇒ R2 时钟；R1 播种
                                 ▼
                     E6 战斗宿主（回合 / 效果 / 判定 / 捕获 / 经验 —— 全部圈外）
                                 │  BattleResultState ∈ {Win,Lose,MyEscape,OpEscape,CaptureSuccess,Error}
                                 ▼
                       结算（D6 写回宠 / R4 落盘；★不重播种）
                                 ▼
                    编排层 ChangeScene(地图) ⇒ 装配实体 ⇒ 【战后链】
                       origin 命中同图？ isMyWin→onWin / isOpWin→onLose / 其余→登记
                       每个 handler 再走一次 M3 条件（含 43 条 battle.，读 lastBattle）
                                 ▼
                    origin 清空；lastBattle 保留到下一次开工
```

---

## 5. 不变量（**BTI1–BTI10**）

| # | 不变量 | 依据 |
|---|---|---|
| **BTI1** | **`<battle>` 只挂在 NPC 上** ⇒ 地图战斗的唯一宿主是 NPC；任何"非 NPC 的战斗入口"必须**显式登记**（今天已知两个：门 §2.13、调试 §2.15） | `NpcInfo.cs:49-50`【源码】+ 全仓 grep 唯一【源码】 |
| **BTI2** | **`@count` 只约束己方** ⇒ 敌方可以超编（实测 7 / 9 两只）；实现**不得**在解析期裁敌方 | `Battle.cs:50/:52` vs `:54`【源码】+【样本】 |
| **BTI3** | **branch id 的唯一性作用域 = 单个 NPC** ⇒ 不许建全局 branch 表、不许跨图复用解析结果 | 【样本】同 NPC 0 重号、`default` 跨库 275 次 |
| **BTI4** | **可达性 = NPC 动作 ∪ 门 ∪ 调试**，三张都要产；`battle-branch-unreferenced`（**154**）**只登记不报错**（门线要它） | §2.7【样本】；与 M5 **TPI9** 同构 |
| **BTI5** | **内核不碰时钟与随机**：`seed` 缺省 ⇒ 编排层向 **R2** 取，播种归 **R1**；数据缺省方向 = §2.3 那张表（只写例外） | `BattleSettings.cs:58`【源码】+ 决议 ①/③ |
| **BTI6** | **地图天气与战斗天气互不注入**（两套数、两条消费者） | `BattleState.cs:44` vs `MapUIController.cs:21`【源码】 |
| **BTI7** | **先装配实体，再跑战后链** —— 顺序是承重的（`winHandler` 会碰 NPC） | `MapSceneView.cs:45-47`【源码】 |
| **BTI8** | **`winHandler` 不等于"硬胜"**：`isMyWin` 是三个状态的或；"必须是 `Win`"这类要求**由条件表达**（12 条实测）⇒ 战后链**不得**提前替数据做判断 | `BattleResult.cs:22-23`【源码】+【样本】 |
| **BTI9** | **"上一场战斗"必须有显式的只读窗口**（43 条 `battle.` 条件 + `50004` 的战斗外 2 条依赖它）；实现**不许**依赖"忘了清空 `currentBattle`" | §2.12【样本】+ `MapSceneView.cs:486`/`:495`【源码】 |
| **BTI10** | **一条 `battle` 触发只能改一个会话字段**（`battleOrigin`），且必须在战后链跑完后才清；★**结算不得重新播种随机源、不得写 NPC 的随机寄存器**（那是 NPC 自己的） | §2.9 `:361`/`:529`【源码】+ **BTC7** |

---

## 6. 现状与缺口（实测）

| 件 | 今天 | 目标 |
|---|---|---|
| `<battle>` 数据 | ❌ `game/data/maps.json` **只有传送点**；桥读的是 **AS3 血统**（`tools/build-map-index.mjs:DIR='swf/map/config'`） | **MDB6-a**（随 M1 的 MB1 整条换桥） |
| `battle` 动作 | ❌ **0 行**（NPC 事件 / 对话都还没有） | **MDB6-c**（等 M2 + M4） |
| 开工门 | ❌ 无（现在**点野怪就直接进战斗**，无任何准入判断） | **MDB6-b** |
| **战斗入口** | ⚠️ **有一条"点野怪开打"的边**（`game/app/scenes/mapScene.js:605-634`，两宇宙开关 `roco.battle.engine` ⇒ `#/battle` 或 `#/rbattle`），参数是**单只野怪**的 `level / name / cid / positionIndex / fightMap` | ★保留为**调试入口**；正式入口换成 `BattleSpec`（**BTI1** 的"非 NPC 入口"就这一条，除门之外） |
| 战后链 | ❌ **完全没有**；`rbattleScene.js:309` 的 `onExit ⇒ go('map', {map: back})` 只是**回图**，`winHandler`/`loseHandler` 无处可挂 | **MDB6-d** |
| 结算 | ⚠️ 部分：`rbattleScene.js:273` 注明捕获由内核真结算 + `save-side` 副作用；`BattleResult` 的**经验/记录/密技/学习力**四段没有 | 归 **E6/D6**，本份只补"战后链"这半条 |
| `battle.` 键表 | ❌ `game/core/**` 0 处 | **MDB6-e** |
| `lastBattle` 读窗口 | ❌ 无（我们的战斗结束后**什么都读不到**） | **MDB6-d** / **BTQ1** |
| `settings.time` | ❌ 无计时器 | ★**不接**（§7.2 **BTQ4**：上游有倒计时 UI 但到点不发生任何事） |

---

## 7. 怪癖登记 · 待拍板 · 等人手测

### 7.1 上游代码 bug / 危险设计（**BTC1–BTC11** · 按 `AGENTS.md §2`：**声明 + 不照搬**）

| # | 上游行为（`路径:行` + 症状） | 发行数据里的可观察后果 | 目标（本份写的"没有该 bug"的行为） |
|---|---|---|---|
| **BTC1** | `NpcActionHandler.cs:361` **先把 `currentNpcId` 写进会话**，`:362` 再**无条件解引用 `npcInfo.battleHandler`** —— 同一个函数里 `:361` 才刚防过 `npcInfo == null` | 门与调试路径传 `npcInfo == null` 时 ⇒ NRE；正常 NPC 路径 ⇒ 看不到 | 判空前置；**决议齐了才写会话字段**（给 M2 的顺序纪律，§3.5） |
| **BTC2** | `MapSceneView.cs:493` 的 `currentNpcId ∈ [50000,50100] && currentMapId != 500` ⇒ **静默吞掉整条战后链** | 【样本】该号段只有 `500`「实验禁地」的 3 只**肉鸽** NPC（0 条分支）⇒ 正常地图战斗观测不到 | 删号段判断，换 **`battleOrigin` + 同图**（§3.4 第 2 条，**BTQ1**） |
| **BTC3** | `MapSceneView.cs:506-522` 只有 `isMyWin` / `isOpWin` 两支、**没有 else**，而 `:529-530` 照样清 `currentNpcId` | 现实产生点 = `Battle.cs:268` 无限循环熔断 ⇒ 熔断路径**吞掉任务进度且不重放**（一次性） | 显式第四支：登记 `result-state-unhandled` + 给一句返回提示 |
| **BTC4** | `Battle.cs:231` 变量名 `isPlayerPetBag` **语义相反**（实为"没写 `<player>`"）；`:235` 因而对强制阵容战斗**跳过首发死亡检查**；`:241` 又**拿玩家背包**去跑准入 | 【样本】**32** 条 `<player>` 分支：死队也能进、准入校验的不是上场的那批宠 | §3.3 门②/门③：校验对象与上场对象**必须同一批** |
| **BTC5** | `Battle.cs:43`/`:54` `enemy` **无条件解引用**（`enemyInfo` 为 `null` ⇒ NRE），而 `BattleInfo.enemyInfo` 缺省就是 `null` | 【样本】`<enemy>` 空 = **0** 条 ⇒ 数据侧观测不到（**别拿它当理由跳过实现**，决议 ⑦） | 解析期要求 `enemy.length ≥ 1`；运行时给明确错误 |
| **BTC6** | `@count` 不裁敌方（§2.5） | 【样本】`-1`「贪星者」7 只、`403`「九尾冰狐」9 只（`@count` 都写 6）⇒ 战斗里出现**超出 `count` 的板凳敌方宠** | **照录不裁**（改了会动这两场 Boss 战的强度）；列 §7.3 人手测项，**BTQ3** |
| **BTC7** | ★`BattleResult.cs:62-63` **每次结算都 `Random.InitState(DateTime.Now.Ticks)` 并重掷 `Player.instance.random`** | 【样本】`random` 条件 **158** 条（+ 文字算子形）⇒ **NPC 的随机条件读到的值是"上一场战斗留下的余数"** —— 战斗与地图之间有一条隐式信道 | **一条 RNG 源、一处播种**（**R1**）：结算**不许**重播种、**不许**写 NPC 的寄存器；`random[old]` 的语义按 M3 的声明实现 |
| **BTC8** | `NpcActionHandler.cs:364-373`：找不到分支时，`param.Count <= 1` ⇒ **静默 return**（无提示） | ★【样本】**8 条实锤**：`1081`–`1088`「七宗罪回廊」的 `<func> battle → hell`，而 `hell` 分支**全库不存在** ⇒ 玩家点那个对话选项**毫无反应** | 解析期 `battle-action-dangling` 报警 + 运行时走 **R5** 明确提示（**BTQ2**） |
| **BTC9** | `MapSceneView.cs:511` 硬编码活动：`map.id ∈ [82,90] && npc.id ≥ 8200` ⇒ `new Item(7, Random.Range(1,5))` | 一周年争霸赛送道具（活动数据在别处）⇒ **"打赢就送"这件事写在 View 的一行里** | **A 组出局**（`docs/architecture.md §1.1`）⇒ 不实现；活动/奖励一律走 M2 的 `setItem` + 活动键袋 |
| **BTC10** | `BattleResultState.Timeout = 99` **全仓无赋值点**（`BattleResult.cs:249`），而 `settings.time` 有消费者（`BattleSystemView.cs:49`） | 【样本】`@time` 数据里 **0** 次 ⇒ 全部取缺省 `10`；**倒计时走完不发生任何事**（不判负、不结算） | 计时与超时判定**不接**（本份不实现一条上游没有语义的机制）；`time` 列**照录不消费**，**BTQ4** |
| **BTC11** | 同一条 `battle.` 键有**两个失败模式**：`NpcConditionHandler.cs:126-127` 无战斗时 `return op != "="`（⇒ **`battle.x ≠ y` 恒真**）；`Identifier.cs:166` → `:235` **无条件解引用 `battle.currentState`**（⇒ 无战斗时读**表达式** = NRE） | 【样本】`50004`「油民」的 2 条战斗外条件**恰好**在"打完回图"这一刻读到值才没事；若在别的时机求值 ⇒ 一条静默真、一条崩 | 一个读窗口（**BTI9**）+ **兜底方向统一**：无快照 ⇒ 一律 `float.MinValue`（与两张键表的 `_` 臂一致），**不区分条件/表达式两条路径** |

⚠️ **与 V2 的分工**（`AGENTS.md §2`）：上面 **BTC1–BTC11** 都是**代码逻辑**问题 ⇒ **不照搬**；
而**数据本身**的怪值（`map@weather` 里的 `100002/100003/100004`、5 张图；`hasEmblem` 缺省 `true` 只写 `false` 例外）**照录**，不是 bug。

### 7.2 待拍板（**BTQ1–BTQ6** · 本份局部编号 · 依人类常设指示「都按你的建议来吧」**已采纳建议并标 ✅**）

| # | 问题 | 证据 | 决议 |
|---|---|---|---|
| **BTQ1** | **战后链的"发起方"怎么记？"上一场战斗"怎么给？** | `MapSceneView.cs:486`/`:493`/`:495`/`:530`【源码】+ 43 条 `battle.` 条件、其中 2 条读在战斗外【样本】 | ✅ **发起方 = 显式 `battleOrigin {mapId,npcId,branchId}` + 同图才跑**（删号段护栏）；**上一场 = 显式只读窗口 `lastBattle`**，由编排层持有、E6 填充，保到下一次开工。**不照搬**"忘了清空 `currentBattle`" |
| **BTQ2** | 悬空 `battle` 引用（8 条 `hell`）与未引用分支（154 条）分别怎么处置？ | §2.7【样本】+ `NpcActionHandler.cs:364-367`【源码】 | ✅ **不对称**：**悬空 = 代码 bug ⇒ 解析期报警 + 运行时 R5 提示**（**BTC8**）；**未引用 = 数据习惯 ⇒ 只读审计**（门线要用那 147 条数字分支），**不阻塞、不报错** |
| **BTQ3** | 敌方超出 `@count`（7 / 9 只）要不要裁？ | `Battle.cs:54`【源码】+ 两条分支【样本】 | ✅ **不裁**，**照上游语义**跑（板凳敌方宠存在）；理由：裁了就改了这两场 Boss 战的强度，而**强度是真值**。列 §7.3 第 3 条等人手测 |
| **BTQ4** | `@time` / 倒计时 / `Timeout` 这一整套接不接？ | `BattleSystemView.cs:49`、`BattleResult.cs:249` 无赋值点【源码】、`@time` 0 次【样本】 | ✅ **不接**：`time` 列照录、不消费、不做 UI 倒计时（上游到点也不办事）；真要做超时判负 ⇒ **另立引擎议题**（归 E5/E6，不在地图线） |
| **BTQ5** | `@type`（`ButtonEventType`）在 `battle` 动作上要不要实现？ | 【样本】`eventHandler` 的 `battle` 动作 **150 条全带 `@type`**（click 140 + shoot 10）；`NpcHandler.cs:33-43` 对 `None`/`Auto` 返回 `null`；`MapWildNpcBehaviourController.cs:19-23` 要求 `OnPointerClick` ⇒ ★**谓词实测 110/110 为真**（**纠正初稿"恒假"**，见 §2.14 + `docs/map/map-move.md §2.5`） | ✅ **照录数据、不猜意图**：M2 的动作执行**按 handler 数组分类**跑（`eventHandler` = 点击、`callbackHandler` = 回调、`func`/`reply` = 对话），**不**用 `@type` 反推；`type="shoot"` 的 **XOR 门保留**（那是 M3/M2 已记的双重语义）。谓词**实测为真**这条**如实登记**（§2.14），野怪能否打 = **我们的配置位** |
| **BTQ6** | `seed` 来自时钟（33 条 `simulate` 与 680 条战斗都受影响），可复现性怎么办？ | `BattleSettings.cs:58`/`:63`【源码】+ `<seed>` 0 次【样本】+ 决议 ① | ✅ **照实现"缺省 = 注入时钟"**（**R2**），但**调试入口允许外部传 `seed`**（`#/rbattle` 的查询参数即可）⇒ 可复现而不改真值；**不追求与上游逐值一致**（决议 ①：RNG 一律**人测行为**，不对拍） |

### 7.3 等人手测确认的具体项（决议 ⑦：主验收 = 人类把游戏跑起来手测）

1. **最先打通 `test` 三只**（§2.15）：`2`（NPC `201`）、`-2`（`-201`）、`540`（`54001`）—— 用 `mapId*100±1` + `battleId="test"` 的约定开一场，
   **看的是**：能不能进去、能不能回图、回图后状态有没有变。★这三张是**为这条链准备的样本**，不是碰巧。
2. **战后链跑通的第一张真图**：挑一条 `winHandler` 里带 `setItem` 的普通野怪分支（`10012`–`10043` 那批场景包图最多），
   **看的是**：打赢后**道具进包 + 提示盒文案**；再打一次用**逃跑**结束（`OpEscape`），★**同一支 `winHandler` 应该也跑**（**BTI8**）。
3. **板凳敌方宠**（**BTC6** / **BTQ3**）：`403`「Lv105 九尾冰狐」`@count=6` 而 `<enemy>` 写了 **9** 只 ——
   **看的是**：战斗里敌方是否真出现 9 只、换人节奏是否合理。⚠️ 这条**今天还测不了**（要等 **MDB6-c**），**不记死账**。
4. **`hell` 悬空那 8 处**（**BTC8**）：`1081`–`1088`「七宗罪回廊」——★**不作为手测用例**（上游点了就是没反应），
   由**解析日志**兜住：请人在 **MDB6-a** 跑完后看一眼 `battle-action-dangling` 是否 **= 8**、`battle-branch-unreferenced` 是否 **= 154**（其中 147 数字）。
   对不上 ⇒ 大概率是**注释没剥**或 `<branch>` 抓错容器。
5. **战斗外读结果**（**BTQ1** / §2.12 第 2 条）：`50004`「异蘑世界」NPC `12106`「油民」——
   先抓一只指定宠（`capturePet.id = 10`），再回去点它的对话，**看的是**：两条选项（`=10` / `≠10`）是否按捕获结果**正确分流**。
   ⚠️ 这条同时验"**读窗口**"，是 **BTI9** 唯一能被人观测的用例。
6. **硬胜 vs 逃-win 的分叉**（**BTI8**）：`121`「Lv1 法拉★」/ `131`「Lv5 小小葵★」那批 `battle.result.state=1` 的星宠 ——
   分别用"打倒"和"对面跑了"结束各一次，**看的是**：**奖励只在前者**（后者应什么都不给）。
7. **随机信道**（**BTC7**）：找一条 `random[...]` 条件的 NPC（【样本】158 条里任意一条），
   连续两次"**先打一架、再来点它**"，**看的是**：结果**不应**随战斗次数漂移（我们的目标行为 = 结算不重播种）。
8. **`@simulate` 那 33 条**：挑 `-2`「-201」的 `default`（它同时是 `test` NPC、`@simulate=true`、`@item=false`、`<player>` 指定 1990 Lv105），
   **看的是**：**打完血不扣、经验不给、不落盘**（关游戏重开应当什么都没变）。

---

## 8. 配对 `impl` / `code-map`

`docs/map/map-impl.md` 吸收 **MDB6-a…e** 的切片与顺序（= 它 §2 的 **MB7**，**与 MB6 同批**）；`docs/map/map-code-map.md` 把 §3.1（列 + 四类登记）、
§3.2（`BattleSpec`）、§3.3（三门）、§3.4（战后链六条）换成实际文件与函数名；§7.3 的 8 条人手测项原样搬进 impl 的验收清单（`docs/map/map-impl.md §8.6`）。
两份均 ✅ **已成文（2026-10-18）** ⚠️ **人类 2026-10-18 已结账四条拍板**（`docs/map/map-impl.md §9`），design 本身仍待评审（判据见 `AGENTS.md §1`）。

---

## 9. 本份对父文档 / 同线文档的回执

| 对象 | 回执 | 状态 |
|---|---|---|
| **父文档 §2.1 血统表** | ★**四个数按解析口径纠正**：含 `<battle>` 的图 **199 ⇒ 198**、含 NPC 的图 **252 ⇒ 246**、`<condition>` **2023 ⇒ 1996**、`<action>` **4429 ⇒ 4355**（差值 = 注释里的命中，正是父文档立的"先剥注释再解析"纪律）；并补一行"`<battle>` 元素 **337** / `<branch>` **680** / `<player>` **32** / `winHandler` **571** / `loseHandler` **95**" | ⬜ 待合并 |
| **父文档 §2.9 / §9.1 M6 行** | 从 ⬜ 待写 ⇒ ✅ 成文；本份给它**BTI1–BTI10** 与 §2.6 的"触发面 543 = 对话 391 + NPC 152"这一条**排期结论**（**M4 必须与 M6 同批**） | ⬜ 待合并 |
| **M1 `map-data.md`** | `battles[]` 的列（§3.1）+ **四类登记**（其中 `battle-action-dangling` **要报警**、`battle-branch-unreferenced` **只登记**）；并钉住"引用来源表由 M2 的 L0 解析器产出、桥不产"（同 **MDI10**） | ⬜ 待合并 |
| **M2 `map-npc.md`** | ① 动作表第 13 行 `battle` 的**目标行为补丁**（找不到分支**必须**报警，**BTC8**）；② **副作用顺序纪律**（**BTC1** ⇒ 决议齐了才写会话）；③ `@type` 在 `battle` 上是装饰；`eventHandler` 的 `battle` 动作 **150 条全带 `@type`**（click 140 + shoot 10）【样本】⇒ **BTQ5** | ⬜ 待合并 |
| **M3 `map-condition.md`** | ★`battle.` 命名空间的**两张键表**（14 + 8 键 + 两个哨兵 `-1` + `float.MinValue`）、**43 条实测用例与 6 种键**、**两个不一致的失败模式**（**BTC11**）⇒ M3 的键表以本份 §2.12 为准 | ⬜ 待合并 |
| **M4 `map-dialog.md`** | ★**391 条战斗触发口住在对话里**（`func` 243 / `reply` 148）⇒ 对话的动作执行必须能发 `battle` 决议；**战后链不再嵌套战斗**（实测 0） | ⬜ 待合并 |
| **M5 `map-teleport.md`** | 收下 **TPI9** 的方法论：本份的 §2.7 是它的同构应用（三张边表并集 + 只读审计），并把"悬空 = bug / 未引用 = 习惯"的**不对称处置**回赠给 M5 的同类表 | ✅ 同构，无需改 M5 |
| **M7 `map-move.md`** | `CanUseWildBehaviour` 四条 AND（§2.14）：走位归 M7、`battle` 归本份；★【已由 M7 §2.5 回执纠正】该谓词**实测 110/110 为真**（`eventHandler` 的 `battle` 150 条全带 `@type`：click 140 + shoot 10）⇒ 本份 §2.14 / BTQ5 的"恒假"表述已随之改写；野怪能否打**仍是**我们的配置位（**BTQ5**），谓词真假**不改**该口径 | ✅ 已成文（M7 §2.5 / §9 回执） |
| **门线（C 组排期 ④）** | 三件：① **147 条数字分支**是门的地板（`DoorModel.cs:59-66` 按层号选、`:64` `int.Parse` 取最大）；② `BossInfo.GetRandomEnemyInfoList`（`BossInfo.cs:65-75`，**全仓唯一两个调用者 = 门 + 出局肉鸽**）= **R1 的消费点**，随门走；③ 门回落到 `NpcActionHandler.StartBattle(param=[floor])` ⇒ 门的战斗**共用本份的开工三门与战后链** | ⬜ 待门线成文 |
| **编排线** | ① `battleOrigin` + **`lastBattle` 只读窗口**（**BTQ1**）要落在会话（§4.1）⇒ 新增一条接缝请求；② `MapSceneView.cs:43` 用 `currentBattle.settings.mode` 判"要不要重刷 BGM" ⇒ ★读的是**上一场**的陈旧值（`settings`/`result` 是 `currentState` 的投影，`Battle.cs:13-14`）⇒ 记给编排线的会话清理 + **BTC11** 同族 | ⬜ 待合并 |
| **`docs/architecture.md §1.1`** | ★**出局记账补三行**：`<mode>` 里 **SPT(3) = 138 条分支**、**Card(6) = 3 条** 属 A 组出局 ⇒ **数据照录、枚举保留、动词不实现**（同 `<farm>`/`<animal>` 的先例）；PVP 构造器与 `isReveal`（联机）同样只登记 | ⬜ 待合并 |
| **`docs/view/battle-split.md`（SP 族）** | `settings.time` → `BattleSystemView.cs:49` 的倒计时条**到点不办事**（**BTC10**）⇒ View 侧若显示倒计时，**不许**暗示"到点判负" | ⬜ 待合并 |
| **落点回执（MB7 · 2026-10-19）** | 本份 §3 的蓝图 ⇒ **实际落点**：`battles[]` 列 + `battleBranchOf`/`settingsOf`/`bossOf` + 解析期登记 = **`game/logic/map/parse-map.js`**（`MDB6-a`）；全局两数 `dangling=8`/`unreferenced=154` = **`tools/map-audit.mjs`**（跨 272 图，旧数字逐字不变）；`BattleSpec` + 开工三门 `canStartBattle` = **`game/core/map/battle-spec.ts`**（L0 纯）；`battle.` 键表（14+8+两哨兵+`FLOAT_MIN`）+ `makeBattleView` = **`game/core/map/keys-battle.ts`**（接 `condition.ts:466` 的 A7 调用点）；`battleOrigin`/`lastBattle` 会话字段 = **`game/app/session.js`**；回图前落快照 = **`game/app/scenes/rbattleScene.js:settleAndExit`**；三门 sink + 战后链 = **`game/app/scenes/mapScene.js:startMapBattle`/`runPostBattleChain`**。⚠️ **边界（决策二 · 非死账）**：复用 `#/rbattle` **单敌遭遇**（`spec.enemy[0]`），**多宠带 `<settings>` 的正式规格 + 板凳敌方宠（`-1`/`403` 的 7/9 只）交 E6**；`GateProbe` 恒 `'unknown'` ⇒ 门②③放行（等 D6）；`turn`/`me.`/`op.` 活战斗态键 ⇒ 恒 `FLOAT_MIN`（等 E1/E5）；`@time`/倒计时**不接**（`BTQ4`）；**BTC8/BTC4/BTC3/BTC11 四处修法已落**（门①给文案、②查上场对象、第四支登记 `result-state-unhandled`、无快照统一 `FLOAT_MIN` 无 NRE）。as-built = `docs/map/map-impl.md §7.3.10`；语义未动（本份仍是真值） | ✅ **已落码（MB7）** |
