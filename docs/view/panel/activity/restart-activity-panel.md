# 代码分析：重启的上游是怎么实现"活动（Activity）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住本面板子目录 `docs/view/panel/activity/`）。
> **性质**：**只读分析上游 C#/CSV/预制/场景**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、发行数据里能观察到什么"查清并钉死。
> **线/族**：View 线 **C4 社交信息族**（`docs/view/view-design.md §8` 表 C4 行 `Mailbox/News/PlayerInfo/SignReward/Activity/Noob`）的**首份成文 = Activity**（人类 2026-10-19 点名"实现活动面板" ⇒ 活动从 `docs/architecture.md §1.1` A 组移出）。
> **父 / 邻**：面板栈机制 = **A2 `docs/view/mech/view-panel-stack.md`**（`OpenPanel`/`SetPanelIdentifier`/遮罩）；传送终点语义 = **M5 `docs/map/map-teleport.md`**（`Panel.Link` 的数字分支 = 六入口之一）；键值袋消费先例 = **地图线 `activity[...]` 条件**（`docs/map/map-code-map.md`，`NpcConditionHandler.cs:38` `Activity.Find(id)` 对位）；商店限购 = **`docs/view/panel/shop/shop-impl.md`**（`state.shop.bought` 现为内存临时账）。
> **路径口径**：上游代码路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方代码相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 可复算的数字或可复跑的 grep；【源码】= 直接引用 `路径:行`；【样本】= `Resources/Data/Activities/info.csv`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A11**，引用**必须带文件名**）；数据错字/静默兜底按 **V2「行为照搬」**（`docs/domain/domain-design.md §1 V2`）单列（A2）。
> **状态**：✅ 已写（阶段一 · 证据）；本线特例 = 人类已点名开工（2026-10-19），配套 design/impl 同批补写（`activity-design.md` / `activity-impl.md`）。

---

## 0. 一句话结论

**"活动"在上游是一体两面**：
① **数据+键值袋**——`ActivityInfo`（CSV 十列行）+ `Activity`（存档里的 `<id, [k,v]列表>` 袋子，`Find` 顺手建档、`SetData` 认 `[expr]` 前缀），被商店限购、每日登录、新手引导、门、农场、肉鸽、条件系统等**至少 12 处**当持久状态仓库用；
② **面板 MVC**——`ActivityPanel.Init()` 把 **全表 `FindAll(!hide)`** 灌进 `SelectModel`（**每页 9 个**，容量写在预制里），左列名字 + 右详情（背景/名/描述/time/3 奖励格）+ 名字 `Contains` 搜索 + "去参加" = `Activity.Link(id)` → `Panel.Link(linkId)`：**none 静默、数字传送、其余开面板（并剥 `[param=…]` 段）**。
CSV 实测 135 行活动（99 可见 / 36 hide）、**背景图 135/135 全在盘**、`time` 只是展示字符串（**没有任何时间过滤/上下线逻辑** —— 过气活动靠手工 `hide=true`）。

我方对应物（本报告写时）：HUD 底栏"活动"钮位（原占位 logLine）；`activityStorage` 键值袋**地图线已落**（`session.data.activityStorage` + `logic/map/activity-ops` 一类）；商店限购 `state.shop.bought` 是**不落盘的临时账**，上游对位恰是 `Activity.Shop` 袋 —— 本次收编（= `activity-design.md` 本份已拍板 **ACQ2**）。

---

## 1. 入口：Map 场景 HUD 的 "Event" 钮【源码 + 实测】

| 钮 | 场景对象 | 接线 | 落点 |
|---|---|---|---|
| **活动** | `Scenes/Map.unity` GameObject `Event`（`:3053` `m_Name: Event`；`SizeDelta 42×36`，`:3077`） | `IButton.onPointerClickEvent → MapMenuController.OpenPanel("Activity")`（`:3088-3105`，`m_MethodName: OpenPanel`、`m_StringArgument: Activity`）；悬浮 InfoPrompt = "活动"（`:3120`） | `MapMenuController : UIModule`（`Scripts/MVC/Controller/Map/Components/MapMenuController.cs:8`）→ `Panel.OpenPanel(string)`（`Scripts/MVC/View/Basic/Panel.cs:28`） |

- `Panel.OpenPanel("Activity")` ⇒ 加载 `Resources/Panels/Activity/Panel.prefab`（面板框素材 `Sprites/background.png` 在场【实测 ls】）；`"null"`/`"none"` 名先回退防呆（`Panel.cs:30-31`）。
- 我方对位已落：`game/app/view/hud/restartHudView.js` 的 `event` 钮 `box: [165, 499.5, 42, 36]`（**尺寸 42×36 与上游同**【实测】），动作接 `mapScene.js:255 onEvent`。

## 2. 面板机：MVC 五件 + 预制【源码】

上游活动面板脚本共 9 个 `.cs`、**365 行**（`wc -l` 实测：`Activity.cs 111`/`ActivityInfo.cs 77`/`ActivityController.cs 51`/`ActivityPanel.cs 27`/`ActivityListView.cs 17`/`ActivityContentView.cs 44`/`ActivityFilterModel.cs 21`/`ActivityFilterController.cs 9`/`ActivityModel.cs 8`）。

- **`ActivityPanel.cs:15-17`**：`Init()` = `SetStorage(Activity.GetActivityInfoList().FindAll(x => !x.hide))` —— **全表进、只按 hide 过滤**；`Awake` 里订阅 `filterController.onFilterEvent += activityController.Filter`（`:19-21`）。
- **`ActivityController.cs`**：`SetStorage→OnSetActivityList`（刷列表 + `pageView.SetPage` + **`Select(0)` 选中即绘详情**，`:14-22`）；`Select/Filter/Prev/NextPage` 都是"改 Model → 重灌 View"两拍；`Link()`（`:34-40`）= 取当前选中 → `Activity.Link(activity.id)`。
- **`ActivityModel.cs`**：空壳（8 行，继承 `SelectModel<ActivityInfo>`）；**分页容量不在代码里** —— `SelectModel.cs:13` 默认 `capacity = 4`，预制把它序列化成 **`capacity: 9`**（`Resources/Panels/Activity/Panel.prefab:1880`【实测】）⇒ **一页 9 个活动**是真值（A3）。
- **`ActivityListView.cs:10-16`**：固定一排 `List<Text>`，有项的显、没项的**连父节点一起收**；只写 `activity?.name` —— **列表列只有名字一栏**（类型/时间不上列）。
- **`ActivityContentView.cs:17-32`**：详情五件 = `background.SetSprite(activity.activityBackground)` + 标题（名）+ `contentText`（description）+ `timeText`（`time` **原样字符串**）+ **3 个奖励格**（`ItemInfo.GetIcon(rewardIcons[i])`，`:30`）；`activity==null ⇒ Clear()` 全空。
- **`ActivityFilterModel.cs:12-20`**：`isWorking ⇒ x => x.name.Contains(input)`；`GetFilterType()` 恒 `FilterType.Name`（`:8-10`）但**没人消费它**（A4）；`ActivityFilterController.cs` 是 9 行空壳继承。
- **背景路由 `ActivityInfo.GetBackground()`（`ActivityInfo.cs:52-58`）**：`resId` 是**纯数字** ⇒ addressables 键 `"Activities/" + resId`；否则 `resId` **本身当路径**（如 `Maps/bg/10`、`Pets/battle/1`）；`mod_` 前缀活动走 Mod 组（§7 A10）。磁盘对位【实测】：`Resources/Activities/{10001,10002,10003,20017}.png` 恰好 = CSV 里 4 个数字 resId；其余 131 个路径 resId **按 `Resources/<resId>.png` 全部命中，135/135 覆盖、0 缺盘**。

## 3. 另一面：`Activity` = 存档里的键值袋【源码】

- **形状**（`Activity.cs:15-18`）：`[XmlAttribute("id")] string id` + `List<IKeyValuePair<string,string>> data`（XML 序列化为 `<data><entry key=… value=…/></data>`）—— 存进 `GameData.activityStorage`（存档字段，Save 线已透传落盘）。
- **`Find(id)`（`:36-46`）= 读即建档**：查不到 ⇒ `new Activity(id)` **并 Add 进 activityStorage** ⇒ 任何一次 `Activity.Find` 都往存档里塞袋子（副作用，A1）。`this[key]` 索引器 = `GetData/SetData`（`:20-24`）。
- **静态门面（`:12-13`）**：`Activity.Noob = Find("noob")`、`Activity.Shop = Find("shop")` —— **碰一下属性就建档**。
- **`GetData(key, default)`（`:82-95`）**：查无/值为 null ⇒ 给 default；泛型版 `Convert.ChangeType`。
- **`SetData(key, value)`（`:97-110`）**：值串以 **`[expr]`** 开头 ⇒ 先 `Parser.ParseOperation` 求值再存（`:103-104`；注释例 `[expr]200+activity[10001].damage[default]123`）—— **上游写袋时就求表达式**；这与地图线"条件读侧 `[expr]` 先登记后随 MB6 落"的决议（`docs/map` MB4/MB6 台账）是同一族机制的两侧。
- **生命周期两刀**：
  - `DailyLogin()`（`:57-61`，`GameManager.cs:113` 调）：**整袋删除**所有 `info.type == Daily` 的袋子（不是清键）⇒ "每日重置" = 袋子消失、次日重读时 `Find` 再建空袋。
  - `VersionUpdate()`（`:63-73`，`GameManager.cs:100` 调）：存档版本 `< lite_3.4.5` ⇒ 删 `noob_reward` 袋、抬版本 —— **版本迁移钩子**。
- **`CheckDailyLogin()`（`MVC/View/Map/MapSceneView.cs:533-541`）**：`Find("daily_login")` 的 `news` 键控 **NewsPanel 每日只弹一次**（弹后 `SetData("news","true")` + `SaveSystem.SaveData()`）—— 袋的"场景级一次性弹窗"用法。
- **消费面清单**【实测 grep `Activity.Find|.Noob|.Shop`】：`Item.cs:216-217`（商店限购，§5）、`MapNoobController.cs:27`（`noob_reward`）、`PetBagController.cs:192` + `NoobIntroController.cs:21/42/61-62`（`noob` 引导步）、`NpcView.cs:347` + `Plant.cs:34/49`（`farm`）、`Animal.cs:47/63/70`（`animal`）、`SignRewardModel.cs:12`、`DoorModel.cs:32`（`door`）、`YiTeRogueChoice.cs:78/104`（`yite_rogue`）、`NpcConditionHandler.cs:38`（**地图条件 `activity[...]`** —— 我们地图线已对位）、`LotteryPanel.cs:15`、`SpriteKingPanel.cs:10-16`（`soul`/`30001`）。

## 4. 出路：`Activity.Link` → `Panel.Link`【源码】

- `Activity.Link(id)`（`Activity.cs:48-55`）：查 `ActivityInfo`，**`info==null` 或 `linkId=="none"` ⇒ 静默 return**（无反馈，A5）；否则 `Panel.Link(info.linkId)`。
- `Panel.Link(linkId)`（`Panel.cs:84-93`）三分支：
  1. 空/`none` ⇒ return；
  2. `int.TryParse` ⇒ `TeleportHandler.Teleport(mapId)` —— **直切**（同 M5 世界地图入口语义；**负数同样成立**，样本 `dream → -131` 夜图）；
  3. 其余 ⇒ `Panel.OpenPanel(linkId)` —— 而 `OpenPanel` 内有个**剥参数循环**（`Panel.cs:68-73`）：`WorldMap[world=1]` 之类尾随 `[k=v]` 段被逐个拆成 `SetPanelIdentifier(k, v)`。
- **linkId 分布**【样本，135 行实测分桶】：数字 mapId **94** · `none` **3** · 命名面板 **38**（`SignReward` 30（**全部带 `[activity=…]` 参数**）/ `WorldMap` 2（带 `[world=1]`）/ `Noob`/`PetBag`/`Mailbox`/`SPTBoss`/`SoulPet`/`Workshop` 各 1）。
- 我方已落码终点：数字 ⇒ 共用 `runTeleport` 决议链（`mapScene.js`，MB5/WM-b 同一条）；`PetBag`/`WorldMap` ⇒ 直开已建面板；其余六个 = **上游有、我们未建**（如实 logLine，不伪造）。`[param]` 段本轮**剥掉不带**（A7）。

## 5. 商店限购 = `Activity.Shop` 袋【源码】

- 记账点唯一：`Item.OnBuySuccess`（`Item.cs:214-219`）—— `toWhichStorage==null`（普通入包）时 `bought = int.Parse(Activity.Shop.GetData(item.id.ToString(), "0"))` ⇒ `SetData(itemId, bought+num)`。**袋键 = itemId 字符串、值 = 已购数**。
- 上游全仓 grep **没有**"读 bought 拦购买"的限购校验在 `Item.cs`（限购余量消费在商店视图/我方 `game/logic/item/shop.js` 的 `remaining`）—— 本线只关心：**袋 = 持久真源**。
- 我方现状：`shop.js` 读 `session.state.shop.bought`（**内存投影、不落盘**，读档归零）—— 与上游"买过的限购品跨档记住"不等价 ⇒ 本次收编进 `activityStorage` 的 `"shop"` 袋（读投影 + 写回袋，见 `activity-impl.md`）。

## 6. 数据表与可得性【实测 + 样本】

- `Resources/Data/Activities/info.csv`：**表头 + 135 行**（末行无换行，`wc -l`=135）；十列 = `id,resId,name,type,time,linkId,reward,release_date,options,description`（`ActivityInfo.DATA_COL=10`，`:13`）。
- 列语义【源码 `ActivityInfo.cs:33-47`】：`reward` 按 `&` 切、**不足 3 补 `"none"`**（`:39-41`）；`options` 走 `ParseOptions`（键值串），`hide = bool.Parse(options.Get("hide","false"))`（`:47`）；`releaseDate = DateTime.Parse`（**解析失败会抛**，A8）。
- 分布【样本实测】：可见 99 / hide 36；type `resident 123 / daily 11 / resdient 1`（错字行 = id `11005` 冰封的九尾冰狐，A2）；`time` 34 种取值（`全天候` 99 条 + 年月串），**纯展示**；id 前缀 `mod_` 1 行（`mod_home`，hide=true，resId `Maps/bg/50000` —— M5 TPC6 覆盖位数据源，A10）。
- 资产在场：9 个 `.cs`（365 行）✓ · info.csv ✓ · 背景 PNG **135/135**（`Resources/…` 按 §2 路由逐一 `existsSync` 实测）✓ · 面板框 `Panels/Activity/Panel.prefab + Sprites/background.png` ✓。
- 生成通道（我方）：`tools/build-unity-data.mjs` → `game/data/unity/activities.json`（135 条原样全收 = 本份已拍板 **ACQ4**；字段 `id/resId/name/typeRaw/typeId/time/linkId/rewardIcons/releaseDate/options/hide/description`）。

## 7. 怪癖与缺口登记（A1–A11；政策 = 决议 ② 声明 + 不照搬；A2 属 V2"行为照搬"）

| # | 症状【证据】 | 说明/处置 |
|---|---|---|
| **A1** | `Activity.Find` **读即建档**（`Activity.cs:40-44`），`.Noob`/`.Shop` 静态属性一碰就把袋写进存档；`DailyLogin` 又整袋删除（`:57-61`） | 存档里出现大量空 `<activity id="…"/>` 的来源。**不照搬**：我方读纯函数、写只发生在显式 SetData/收编链。 |
| **A2** | CSV 第 11005 行 type 值 **`resdient`**（拼错）⇒ `ToActivityType` 查词典未命中**静默降级 `None`**（`ActivityInfo.cs:69-71`），本应"常驻"的活动显示成"无类型" | 数据错字 + 静默兜底 = **V2 口径：行为照搬**（我们也降 None=typeId 0），构建期以 `KNOWN_SILENT_FALLBACK` 配额 1 钉死、多一条即门禁红。 |
| **A3** | 分页容量 **9 写在预制**（`Panel.prefab:1880`），代码默认 4（`SelectModel.cs:13`）——只看 `.cs` 会拿错数 | 真值 = 预制【实测】；我们 `PAGE_SIZE = 9` 对齐。 |
| **A4** | `FilterModel.GetFilterType()` 返回 `Name` 但**无人消费**；过滤只有 `name.Contains`，无类型/时间维度（`ActivityFilterModel.cs:8-19`） | 照做（搜索只搜名字）；不做类型筛选（上游没有）。 |
| **A5** | `linkId=="none"` 时点"去参加"**静默无反馈**（`Activity.cs:51-52`） | 不照搬：按钮 disabled + 文案"此活动无入口"。 |
| **A6** | 负 mapId（`dream → -131`）走 `int.TryParse ⇒ Teleport` **合法直跳夜图**【样本+源码 `Panel.cs:88-89`】 | 照做（`runTeleport` 同一台机，负数天然支持）。 |
| **A7** | `WorldMap[world=1]`/`SignReward[activity=2406]` 的 `[k=v]` 参数由 `OpenPanel` 剥给 `SetPanelIdentifier`（`Panel.cs:68-73`）——**参数是面板定位状态**（如签到月份） | 本轮**剥参直开**（WorldMap 开在默认页）、参数**未接**；已登记为待细化（impl 偏差行），不是死账。 |
| **A8** | `releaseDate = DateTime.Parse(...)` 无兜底（`ActivityInfo.cs:43`）：发行 CSV 若有一行日期畸形**整表构造抛**；`hide = options.Get("hide","false")` 的 `bool.Parse` 同样只兜缺键不兜脏值 | 上游发行数据实测 135 行全解析得过（我们的生成器同样全过）；我们生成期解析、面板期零抛。 |
| **A9** | `DailyLogin`/`VersionUpdate`/`CheckDailyLogin` 三个**生命周期钩子**（`GameManager.cs:100/113`、`MapSceneView.cs:533`）改变袋与弹窗 | 本线**不实现**每日重置/版本迁移/NewsPanel（A 组 + 无每日状态消费方）；限购袋不受影响（`shop` 非 Daily 型）。 |
| **A10** | `mod_` 前缀活动（`mod_home`，hide=true）背景走 **Mod addressables 组**（`ActivityInfo.cs:50-57`）；其 resId `Maps/bg/50000` 同时是 M5 TPC6"小屋图覆盖位"的数据源 | 无 Mod ⇒ 若显示该活动背景，退到 `Resources/Maps/bg/50000.png`（在盘【实测】）；覆盖位**仍不接线**（= 本份已拍板 **ACQ3**，人类 2026-10-19；M5 TPQ3 不变）。 |
| **A11** | 面板**无上下线时间逻辑**：`time` 纯字符串、过期靠手工 `hide=true`【源码 §2 + 样本】 | 照做（= 本份已拍板 **ACQ4** 原样全收，面板只按 hide 过滤）。 |

---

## 8. 交 design 的输入清单

1. **面板形状**：!hide 列表（99 条）+ 每页 9 + 名字搜索 + 右详情五件（背景/名/time/说明/3 奖励）+ "去参加"；数据 = `activities.json`（已生成）。
2. **出路三分法**：数字 → `runTeleport`；已建面板（PetBag/WorldMap）直开；未建（Noob/SignReward/Mailbox/SPTBoss/SoulPet/Workshop）→ logLine 如实登记。
3. **限购收编**：`state.shop.bought` ⇄ `activityStorage` 的 `"shop"` 袋（键=itemId、值=已购数【源码 §5】）。
4. **要拍板的设计位**（本文件只列形状、不定行为）：批次范围（A/CB 处置见 §7）、限购收编方式、`mod_home` 覆盖位、数据全收 vs 只收可见 —— 四条已在 `activity-design.md §8` 定为**本份已拍板 ACQ1–ACQ4**（人类 2026-10-19 点名选定；**不是**全局决议 ①–⑨）。
