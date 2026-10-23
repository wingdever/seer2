# 代码分析：重启的上游是怎么实现"精灵图鉴面板（`PetDictionary`）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住本面板的子目录 `docs/view/panel/dex/`，落位口径见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制/场景/发行数据**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制与发行数据里能观察到什么"查清并钉死。
> **线/族**：View 线 **C 族 · 面板族**（`docs/view/view-design.md §8`）；同族先例 = `docs/view/panel/worldmap/`（大地图）、`docs/view/panel/minimap/`（小地图）、`docs/view/panel/activity/`（活动）；**本面板与 C1 精灵背包的关系最近**（`docs/view/panel/petbag/restart-petbag-panel.md` = 下称**背包报告**，其 **§1.2 四宿主 / A1 / S5** 直接 related）。
> **需求源**：人类 2026-10-19 点名 —— **"实现精灵图鉴面板"**。⚠️ 这条**反转**了 `docs/view/panel/view-panels-pet.md §11 VP5`（人类 2026-10-17 拍板"本代不做图鉴宿主、`content.js` 不加全量枚举"）⇒ 反转与新口径的**正本** = `docs/view/panel/dex/dex-design.md §8`（本文件只记事实，不做决议）。
> **父 / 邻**：面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**；跳转终点 = 上游 `Panel.Link`（本报告的 §11，与我方面板共用的 `handlePanelLink` 同一语义族，旧名 `handleActivityLink`）；传送链 = **M5 `docs/map/map-teleport.md`**（`runTeleport`）；展示台素材 = C1 的 `game/app/view/petbag/idleStage.js`（真值：背包报告 §10）。
> **路径口径**：上游代码/预制路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方代码相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 可复算的数字或可复跑的 grep（本文件的计数命令逐条附在 §12）；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §13 逐条登记（本报告内部编号 **A1–A14**，**各自从 A1 起**，引用**必须带文件名**）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；评审通过后进入 design → impl → 代码。

---

## 0. 一句话结论

**上游的"图鉴"里没有任何图鉴状态**：它把发行数据宠表的 **838 行每一行当场造一只 Lv100/IV31 的示例宠**（`Pet.GetExamplePet`），滤掉 `hide=true` 的 **50 行** ⇒ 列出 **788 只**，一格一格摆出来；"已获得"角标 = 拿**玩家背包+仓库里的宠当场反查进化链**（`Pet.cs:399-402`），**没有 `dex{id:{seen,caught}}` 那类落盘字段**。面板框 **760×480**、**9 格/页 + 翻页 + 跳页**、两档页签（**精灵列表 / 最新精灵**）、三件套筛选（**元素 20 钮 2 页 / 名字或 ID / 星级 —— 互斥**）+ 一个**"星级"档是死键**的排序下拉；右侧 = **动画台 + 六项读数（序号/身高/体重/分布/特性/简介）+ 六维种族值 + 叫声钮 + "分布"在 724 只宠上其实是"跳到它的图/面板"的链接钮**。**它自己还嵌套了一整份精灵背包预制**（只为复用"示例宠背包 + 测试对战"）。**【实测 + 源码】**

---

## 1. 入口：Map 场景 HUD 底栏的「图鉴」钮【源码 + 实测】

- 全仓**只有一个调用点**：`Scenes/Map.unity:6708` 的 `onPointerClickEvent` 持久化调用 → 目标类 `MapMenuController`、方法 `OpenPanel`、`m_StringArgument: PetDictionary`【实测：`grep -c PetDictionary Scenes/Map.unity` = 1】。
  - `MapMenuController : UIModule`（`Scripts/Controller/Map/Components/MapMenuController.cs`）不自己写 `OpenPanel`，它继承 `Module.OpenPanel(string) => Panel.OpenPanel(panelName)`（`Scripts/MVC/View/Basic/Module.cs:9`）。
- 同一个钮的**悬停**另有一条：`SetInfoPromptText("\u56FE\u9274")` = **"图鉴"**（`Scenes/Map.unity:6723` 附近），与我方 HUD 已登记的标签同源（`docs/view/scene/room/view-scene-hud-design.md §4.6` 表"图鉴(高亮)"行）。
- 我方现状：`game/app/view/hud/restartHudView.js:81` 已摆好这颗 `dict` 钮（`handler: 'onDex'`），但 `game/app/scenes/mapScene.js:254` 的 `onDex` 仍是 `logLine('图鉴：重启原生面板待建')`。
- `Panel.OpenPanel("PetDictionary")` 的通用名规范化（`Scripts/MVC/View/Basic/Panel.cs:28-75`）：剥尾缀 `Panel`、剥 `[...]` 参数 → `ResourceManager.GetPanel("PetDictionary")` ⇒ **`Resources/Panels/PetDictionary/Panel.prefab`**；预制缺失 ⇒ **返回 null、静默无提示**（同小地图报告 §1 口径）。
- **没有** `SetPanelIdentifier` 入口：图鉴**不接受**外部指定起始档位（`OpenPanel("PetDictionary[...]")` 的参数在预制侧没有任何 `SetPanelIdentifier` 实现来吃它）⇒ 起始档位只由预制 + `Init()` 决定（§2）。

---

## 2. 三档 mode：`All / Topic / Workshop`，但只有两档能点【源码】

`PetDictionaryController`（`Scripts/MVC/Controller/Panel/PetDictionaryController.cs`，76 行 —— **整个图鉴的逻辑面就这 76 行**）：

| 档 | 枚举值 | 数据来源 | 可达性 |
|---|---|---|---|
| `All` = 精灵列表 | 0 | `petData.petAllWithMod.Where(!hide).OrderByDescending(PositiveId)`（`:10`） | 页签「精灵列表」`SelectMode(0)`【实测 `Panel.prefab:7718`】 |
| `Topic` = 最新精灵 | 1 | `petData.petTopic` = `version.xml` 的 9 个 id（`:11`） | 页签「最新精灵」`SelectMode(1)`【实测 `Panel.prefab:7147`】 |
| `Workshop` = 工坊 | 2 | 控制器自带的 `petWorkshop` 缓存（`:12`、`:43-52`） | **图鉴预制里没有第三颗页签** ⇒ 只能由工坊线 `WorkshopAllController.cs:49-51` 外部塞进来 |

- **`SelectMode` 有一条单向闸门**：`if (mode == PetDictionaryMode.Workshop) return;`（`:47-48`）⇒ 一旦处于 `Workshop`，**两颗页签都点不动、出不来**（本报告 **A2**）。
- **`GetStorage()` 的 default 分支返回空表**（`:36-42`）⇒ 枚举值越界 = 空列表、不报错。
- **默认落在哪一档 = 两个 `Init()` 抢**（本报告 **A1**）：
  - `PetDictionaryController.mode` **序列化值 = 1（Topic）**【实测 `Panel.prefab:7537` 的 `mode: 1`】，其 `Init()` 调 `SelectMode((int)mode)`（`:26-29`）⇒ 想要 Topic。
  - `PetDictionaryPanel.Init()` 调 `SelectMode(PetDictionaryMode.All)`（`Resources/Panels/PetDictionary/Scripts/PetDictionaryPanel.cs:22-26`）⇒ 想要 All。
  - 两个 `Init()` **都由 Unity 的 `Start()` 驱动**（`Scripts/MVC/View/Basic/IMonoBehaviour.cs:12-14`：`Start() => Init()`），`Panel.OpenPanel` **不显式调用**任何 `Init()`（`Panel.cs:28-75` 全文无 `Init()` 调用点）⇒ 谁后跑谁定。**【推断】** 按 Unity 实例化时的层级顺序（父节点组件先于子节点），挂在**内层 Panel** 上的 `PetDictionaryPanel`（GO `5923892901448668401`，组件挂载 @`Panel.prefab:4320`）先、挂在**子节点 `Menu`**（GO `8680161628653980649`，@`Panel.prefab:7528`）上的控制器后 ⇒ **终态 = Topic（最新精灵）**，即**打开图鉴默认看到的是那 9 只"最新精灵"、不是 788 只全列表**。
  - ⚠️ 这条是**代码没有定死、靠引擎调度顺序**的行为 ⇒ 我方实现必须**显式定一档**（design 已定 = **`dex-design.md` DX6：默认「精灵列表」**）。

---

## 3. 列表数据：整张宠表当场"造样本宠"，不存任何图鉴状态【源码 + 实测】

- `petAllWithMod` = `PetInfo.database.Select(x => Pet.GetExamplePet(x.id)).Where(x => x != null)`（`Scripts/System/Data/VersionData.cs:83`）。
  - `PetInfo.database` = 发行数据 `Resources/Data/Pets/{basic,ui,…}.csv` 建出来的**静态全表**（`Scripts/MVC/Model/Basic/Pet/PetInfo.cs:26-27`）。
  - `Pet.GetExamplePet(id, level=100, iv=31)`（`Scripts/MVC/Model/Basic/Pet/Pet.cs:100-128`）：造一只**满配演示宠** —— 性格取 `ToBestPersonality()`、经验直接补到 100 级、`AddEVStorage(510)`、`iv=31`、`LearnAllSkill()`（**全部技能都"已学会"**）、抗性 `ToBest()`、`hasEmblem=true`、`height/weight = base+5`。
  - ⇒ **图鉴里每一格都不是"玩家的那只"，而是"这一种的满配模板"**；图鉴面板本身**不写任何持久化**（`petAllWithMod` 是 `[XmlIgnore]`，`VersionData.cs:83`）。
- `hide` 过滤：`x.info.ui.hide`（`PetDictionaryController.cs:10`）；`hide` 来自 `ui.csv` 的 `hide=` 选项、**缺省 false**（`Scripts/MVC/Model/Basic/Pet/Info/PetUIInfo.cs:86`）。【实测】**50/838 行 `hide=true`** ⇒ 列表档可见 **788 只**。
- ⚠️ **只有 `All` 档过滤 `hide`**：`petTopic` 直接 `topicPetIds.Select(GetExamplePet)`（`VersionData.cs:88`），**不过滤 hide** ⇒ 9 只最新精灵里 **`114764 瑶光桂影·琉梦` 是 `hide=true`**（本报告 **A6**）。【实测】`grep -o "hide=true" Resources/Data/Pets/ui.csv | wc -l` 与 §12 的 topic 表。
- **`VersionData` 里还有一个同名不同物的 `petDictionary`**（`VersionData.cs:84` = 按 `min/maxPetId` 区间过滤，与 `PetDictionaryController.cs:10` 那个"按 hide 过滤 + 排序"**不是同一个属性**）；控制器用的是自己那个 ⇒ 阅读时极易踩（本报告 **A13**）。
- **Mod 宠**：`petAllWithMod` 名义含 Mod，但 `PetInfo.IsMod(id) ⇔ id < 0`（`PetInfo.cs:25`）而**发行 CSV 里负 id = 0 条**【实测】⇒ 无 Mod 时装盘时，"WithMod" 与"官方表"是同一批 838 行。

---

## 4. "已获得"角标：拿玩家背包+仓库当场反查进化链【源码】

链路：`PetDictionaryController.cs:20`（`selectController.onSetSelectionsEvent += onSetSelections`）→ `:64-69`：

```csharp
var getMarks = selectController.GetPetSelections()
    .Select(x => (x != null) && x.GetPetIdentifier("own") > 0).ToList();
selectController.SetGetMarks(getMarks);
```

- `own` 的实现（`Scripts/MVC/Model/Basic/Pet/Pet.cs:399-402`）：
  ```csharp
  if (id == "own") {
      var allPets = Player.instance.gameData.petDict.GroupBy(x => x.id).Select(x => x.First()).ToList();
      return allPets.Exists(x => (x.id == this.id) || (x.GetPetIdentifier($"baseId[{this.id}]") == 1)) ? 1 : 0;
  }
  ```
  - `gameData.petDict` = `petBag`（**12 格**，`PetInfo.PET_BAG_SIZE=12`）**＋ `petStorage`（仓库列表）**去掉 null 的**拼接视图**，本身 `[XmlIgnore]`（`Scripts/System/Data/GameData.cs:45-48`）⇒ 存档里对应 `<petBag>`/`<petStorage>`，**没有 `<petDict>` 元素**（与我方 Save 线口径一致，见 `docs/save/save-xml-spec.md`）。
  - `baseId[N]`（`Pet.cs:365-370`）= `PetExpSystem.GetEvolveChain(N, this.id)` 非空；`GetEvolveChain`（`Scripts/MVC/Model/Basic/Pet/System/PetExpSystem.cs:91-112`）= **从 `N` 出发沿 `exp.evolvePetIds` 递归找 `this.id`**。
  - ⇒ 语义 = ** dex 条目 D 标"已获得" ⇔ 玩家拥有的某只宠 O 满足 `O.id == D.id` 或「从 D 往下进化能走到 O」**。
  - **方向不对称**（本报告 **A8**）：拥有**进化后**形态 ⇒ 它的**祖先条目也亮**；拥有**初始**形态 ⇒ **不**点亮进化后条目。
  - 与我方数据面的接缝：进化链字段已在桥里（`game/data/unity/pets.json` 的 `growth.evolvePetIds`，示例 `id:1 → [2]`）。
  - ⚠️ **两条口径差**（交 design）：① 递归**不看进化等级**（`GetEvolveChain` 直接沿 `exp.evolvePetIds` 走，`evolveLevels=0` 的"道具/特殊进化"也算链上）⇒ 与我方 `content.restartEvolveOf()`（**只留 `at>0`**）**不是同一个谓词**，图鉴的"已获得"不能拿它当链；② `Pet.GetPetInfo(baseId)`（`:97`）**无空判断** —— 链上出现表里没有的目标就会 NRE（【实测】本发行数据 `evolvePetIds` 悬空目标 **0 条** ⇒ 无后果，但我方实现须把"目标不在表内"兜成"链断、不抛"）。
- **刷新时机**：`onSetSelectionsEvent` 只在 `SelectModel.SetSelections` 里发（`Scripts/MVC/Model/Utility/SelectModel.cs:94-97`）⇒ 翻页/换筛选/换档时**整页 9 格重算**，选中单只时**不重算**。
- 表现层：`PetSelectView.SetGetMarks` → 每格 `PetSelectBlockView.SetGetMark(isGet)` = `getMark.gameObject.SetActive(isGet)`（`Scripts/MVC/View/Pet/Basic/Button/PetSelectBlockView.cs:59-62`）。

---

## 5. 面板框与图层【实测】

| 项 | 值 | 证据 |
|---|---|---|
| 外层（遮罩）`Panel` | anchor `(0,0)-(1,1)`、`sizeDelta 10,10`、`Image` 黑色 **a=0.5019608** | `Panel.prefab:4116`、`:4146` |
| 内层 `Panel`（`PetDictionaryPanel` 宿主） | **居中锚点、`anchoredPosition (50, 0)`、`sizeDelta 760×480`** | `Panel.prefab:4286`、`:4320` |
| 标题 | TMP `精灵图鉴`、字号 24、字体 `Mini Diamond SDF` | `Panel.prefab:7940` |
| 左侧元素栏 `Element Background` | 100×482，图 `PetStorage/Sprites/element background.png` | `Panel.prefab:2477`、`:2506` |
| 列表区 `Dict` | 360×380；内层 `Pets` 330×340 摆 `(30,0)` | `Panel.prefab:7362`、`:2567` |
| 右信息区 `Info` | 180×210 摆 `(580,-10)` | `Panel.prefab:7415` |
| 种族值条 `Base Status` | 300×50 + 标签 `【种族值】` | `Panel.prefab:8729`、`:1110` |
| 顶部筛选栏 `Storage Filter` | 760×55（排序下拉 + 元素钮 + 分隔底图 + 名字搜索） | `Panel.prefab:7506` 子树 |
| 关闭钮 | `Green Esc.png`、**35×35**、`onClick → Panel.ClosePanel` | `Panel.prefab:4377`、`:4451` |
| 计数文本 | `PetSelectView.storageCountText` = **`{fileID: 0}`（没接线）** | `Panel.prefab:7239` ⇒ 本报告 **A4** |

组件计数【实测，见 §12】：`GameObject 97` / `RectTransform 137`（含 40 stripped）/ `MonoBehaviour 169`（含 39 stripped、**缺脚本 = 0**）/ `Image 29` / `Text 17` / `TextMeshProUGUI 10` / `Button 14` / `IButton 14` / `InputField 2` / `Dropdown 1` / `ScrollRect 1` / `Mask 1` / `Camera 2`（两台 `Pet Anim Camera` + `AnimCamera`）/ `PrefabInstance 38`。

**钮 ↔ 素材的逐个对应**【实测：把 `Panel.prefab` 里每个 `m_Sprite` 的 guid 反查 `.meta` 再回指所属 `m_GameObject` 的 `m_Name`】：

| PNG | 挂在哪个节点 | 次数 |
|---|---|---|
| `PetStorage/Sprites/31.png` | **`Search`**（名字/ID 搜索钮） | 1 |
| `PetStorage/Sprites/41.png` | **`Dropdown`**（排序下拉的底） | 1 |
| `PetStorage/Sprites/36.png` | **`Element`**（元素栏那颗 toggler/标签位） | 1 |
| `PetStorage/Sprites/30.png` / `35.png` | 两个叫 **`Background`** 的节点（顶栏与筛选区的底） | 各 1 |
| `PetStorage/Sprites/920.png` | **`Item Background`**（信息区行底 ×4） | 4 |
| `PetStorage/Sprites/163.png` | **`Test`（测）** 与 **`Edit`（改）** —— 两颗单字符钮**共用同一张** | 2 |
| ⚠️ **两颗页签（「精灵列表」/「最新精灵」）没有专属 PNG** | `120×30`、底 = **Unity 内置 `UISprite`**（`m_Sprite: {fileID: 10905, guid: 0000000000000000f000000000000000}`）涂**黑** `m_Color (0,0,0,1)`，文字 = TMP + **青色描边** `m_EffectColor rgba(0.32,0.90,0.98)`、`m_EffectDistance (2,-2)` | 【实测】**摆位与档位绑死、且左右与直觉相反**：GO `Topic`（`8051309221030803471`，rect @`Panel.prefab:7036-7050`）在 **x=−80**、子 `Text (TMP)` = `"最新精灵"` 转义串 = **「最新精灵」**、onClick `SelectMode(1)`；GO `Dict`（`8680161629327256685`，rect @`:7607-7621`）在 **x=+80**、文字 = **「精灵列表」**、onClick `SelectMode(0)` ⇒ **界面左边那颗是"最新精灵"、右边那颗才是"精灵列表"** |

**预制内嵌清单**【实测】：`Element Button.prefab ×20`（来自 `Resources/Panels/PetStorage/Prefabs/`）、**`DictPetSelectButton.prefab ×9`**、`Status.prefab ×6`、`Pet Demo.prefab ×1`、`Info Prompt.prefab ×1`、**`PetBag/Panel.prefab ×1`**（实例被改名 `Test 2`，@`Panel.prefab:13230`/`:13779`）。

---

## 6. 列表格：9 格 / 页，一格 = `DictPetSelectButton`【实测 + 源码】

- **每页 9 格**：`PetSelectModel.capacity: 9`【实测 `Panel.prefab:52`】、`selectBlockViews` 数组长度 9【实测 `Panel.prefab:7240-7249`】、预制实例 `Pet (0..8)` ×9。
  - ⚠️ 代码侧默认是 6（`PetSelectView.cs:11` `= new PetSelectBlockView[6]`、`SelectModel.cs:13` `capacity = 4`），**全靠预制序列化值覆盖** ⇒ 模型容量与视图格数**必须相等**：`PetSelectModel.SetSelections` 把数组 `Array.Resize(ref selections, capacity)`（`PetSelectModel.cs:15`），`PetSelectView.SetSelections` 直接按 `selections.Length` 索引格（`PetSelectView.cs:34-37`）**无越界保护**。
- **格子结构**（`Resources/Panels/PetDictionary/Prefabs/DictPetSelectButton.prefab`，595 行）：根 `75×75` 摆 `(20,-15)` + `Image(87.png)` + `Button` + `IButton` + `PetSelectBlockView`；子 = `Mask`(内含 `Icon`) / `Ban`[**INACTIVE**] / `Get Mark`[**INACTIVE**] / `Text`（默认 `未知`）。
- **`PetSelectBlockView` 的接线取舍**【实测 `DictPetSelectButton.prefab:423-437`】：

  | 字段 | 值 | 后果 |
  |---|---|---|
  | `interactableWhenNull` | **0** | 空格子**点不动**（与背包口径不同，那边空格用于"入队"） |
  | `showGender` | **0** | 不画性别 |
  | `showIconFrame` | **1** | 画**头像框 + 遮罩**两层（三层素材口径 = 背包报告 §8；框/遮罩数据住在宠的 `record` 里，**示例宠没有 record** ⇒ 图鉴格实际只吃到默认框） |
  | `frame` / `levelText` / `hpText` / `hpBarRect` | **`{fileID: 0}`** | 图鉴格**不显示等级、不显示血量条**（这是"图鉴 ≠ 背包"的可见差别） |
  | `getMark` | → `Get Mark` 节点 | 角标图 = **`TwelveRound/Sprites/have.png`**（`50×32` 摆 `(-10,5)`） |
  | `chosenFrameSprite`/`notChosenFrameSprite` | `87.png` / `85.png`（`OldPetBag/Sprites/`） | 选中=换框；**空格子的图标也用 `notChosenFrameSprite`**（`PetSelectBlockView.cs:129`） |
  | `banPick` | → `Ban` 节点（`Pet/Ban.png`） | PVP 专用，图鉴档**恒 INACTIVE**（与 **VP7** 一致） |
- **头像图标来源**（`PetSelectBlockView.cs:126-130` → `PetUIInfo.icon` → `PetUISystem.GetPetIcon(defaultSkinId)` → `ResourceManager.GetLocalAddressables<Sprite>("Pets/icon/" + id)` ⇒ 运行时 `persistentDataPath/Resources/Pets/icon/{skinId}.png`）：我方桥 = `game/app/view/panels/battle/_kit.js:45` 的 `petIconUrl(petId)`（同源路径，**盘上 990 张**，见 §12 覆盖率）。
- **空格子的文字**：`SetName` 在 `isNull` 时写 **"未知"**（`PetSelectBlockView.cs:140-157`）⇒ 上游把"空槽"也当"未知精灵"画（C1 已判定背包语义下这是错的，见 `docs/view/panel/view-panels-pet.md §8` "空格子画空槽"条）。

---

## 7. 分页机与 `SelectModel<T>`【源码】

正本机器已在背包报告 §5 写过一遍，这里只补图鉴相关的三个观测点：

- `SetStorage(storage, defaultSelectPage=0, reset=true)`（`SelectModel.cs:80-92`）会**触发 `onSetStorageEvent`** ⇒ 图鉴把它接到 `filterController.Reset`（`PetDictionaryController.cs:23`）⇒ **换档/换列表 = 筛选清空**（连带 **A5**：`Reset()` 只清元素与名字、**漏星级**，`PetFilterController.cs:60-64`）。
- `sortedStorage`/`resultStorage` 是**每次读取都重算**的计算属性（`SelectModel.cs:16-17`）⇒ 排序 + 过滤在 788 条上是"每帧重算"级别的做法（上游不缓存；我方数据量同级，impl 侧要决定是否缓存）。
- `GetLastPage()` = `(resultStorage.Count - 1) / capacity`（`SelectModel.cs:46`）⇒ **空列表时 = `(-1)/9 = 0`**（C# 整除向零截断），即"0 页"而不是负页；页码显示走 `PageView.SetPage`（`Scripts/MVC/View/Utility/PageView.cs:17-26`，**显示 1 基**、`prev/next` 用 `SetInteractable` 置灰）。
- **跳页输入**：`PageView.GetJumpPage()` = `int.TryParse(输入) ? 值 : 0` 再 **−1**（`:15`）⇒ 空/非数字输入 → `-1` → 被 `SetPage` 的 `Clamp(0, lastPage)` 兜成第 1 页；`SetPageByInputField` 只在 `page < 0` 时**直接 return**（`PetSelectController.cs:107-121`）⇒ 只有"解析失败以外的负数"走不到 return，实际上 `GetJumpPage` 的 `-1` **会被 return 掉**（"空输入 = 不动"，不是"回到第 1 页"）。

---

## 8. 筛选三件套 + 排序下拉【源码 + 实测】

| 件 | UI 形态 | 发出的谓词 | 证据 |
|---|---|---|---|
| **元素** | 左侧栏 **20 颗钮 / 页**（`elementNumInOnePage: 20`【实测 `Panel.prefab:2105`】），共 **23 种属性** ⇒ **2 页**；每页各配一对 `Prev/Next`（图 `OldPetBag/Sprites/151.png`）；钮点击 = `Select(int)`、悬停 = `SetElementInfo(int)`【实测：20 个 override，`m_IntArgument` 0–19】 | `element==全部 ⇒ 全通过`，否则 `x.element==E \|\| (x.subElement==E && subElement!=普通)`（`PetElementFilterModel.cs:47-55`）；元素枚举见 `PetElementSystem.cs:207-215`（`全部=-1`、`普通0…邪灵22`） |
| **名字/ID** | 一个输入框 + `Search` 钮（`PetStorage/Sprites/31.png`），占位文案 **"搜索名字或ID"**【实测 `Panel.prefab:6681`】 | 输入若是纯数字 ⇒ `x.id == N`（**这里是宠的行 id**，`PetNameFilterModel.cs:19-20`，与排序键 `defaultId` **不同源**）；若是 `(...)` ⇒ 走**括号表达式 DSL**（`Parser.ParseConditionFilter<Pet>`，谓词语言 = `GetPetIdentifier` 那套）；否则 ⇒ `x.name.Contains(input)`（**序号敏感子串、不转小写**）（`PetNameFilterModel.cs:8-33`、`FilterModel.cs:14-33`） |
| **星级** | **图鉴预制里没挂**（`PetStarFilterController` 全类存在，但 `Panel.prefab` 内 0 引用【实测 grep guid】） | —— 只在**背包**侧用；图鉴靠排序下拉里的"星级"档，而那一档是死键（下一条） |
| **互斥** | 三者的 `onFilterEvent` 互相 reset 对方（`PetFilterController.cs:21-52`） | ⇒ **上游是互斥、不是叠加**（我方 C1 已改判叠加 = **VP1**，本面板沿用，见 design） |

**排序下拉**：`Dropdown` 3 项、`m_Value: 0`【实测 `Panel.prefab:3026-3033`】，标签 = **一般 / 特殊 / 星级**（`:4064`、`:4645`；`sortingType: 1 = Dict`【实测 `Panel.prefab:3390`】）。

`PetSortingModel.GetSortingOptions()` 的 Dict 公式 = `(dropdown.value + 1) * Mathf.Sign(dropdown.value - 2)`（`Scripts/MVC/Model/Pet/Storage/PetSortingModel.cs:20`）：

| 下拉值 | 标签 | `(v+1)` | `Sign(v−2)` | 算出的枚举 | 实际排序 |
|---|---|---|---|---|---|
| 0 | 一般 | 1 | −1 | `PositiveId(−1)` | **id 升序**（`OrderByDescending` × `int.MaxValue−id`） |
| 1 | 特殊 | 2 | −1 | `NegativeId(−2)` | **id 降序** |
| 2 | 星级 | 3 | **`Sign(0)=0`** | **`None(0)`** | 落进 `GetSorter` 的 `default:` —— 而 `default:` 与 `case PositiveId:` **共用同一个 return** ⇒ **仍然按 id 升序**（本报告 **A3**） |

⇒ 上游图鉴的"星级"档**选了等于没选**（与"一般"完全同序）；`Star/Date/Level` 三个 sorter 在图鉴下拉里**永远够不到**。
另：`isWorking` 恒 `true`、从不写（`PetSortingModel.cs:10`）⇒ 那条 `if (!isWorking) return null`（`:26-28`）是死支。

**默认序**【源码 + 实测复核】：`All` 档在控制器里就按 `PositiveId` 排过一次（`PetDictionaryController.cs:10`）。两个关键点：
- ⚠️ **排序键不是宠的行 id，而是 `ui.defaultId`**：`PositiveId` 的 key 里 `GetPetIdentifier("id")` = **`info.ui.defaultId`**（`Pet.cs:408`）、`GetPetIdentifier("subId")` = **`info.ui.subId`**（`:409`）。
- key = 正 `defaultId` 取 `int.MaxValue − defaultId`、非正取原值，再 **降序** ⇒ **`defaultId` 升序在前、Mod/负号按值降序垫后**（发行数据里负 id = 0 条【实测】）；**`subId` 取负后降序 = `subId` 升序**（先无后缀、再 `-1`、再 `-2`）——【实测】拿 `defaultId=220 / 10010` 两家按公式复算 ⇒ 序 = `220(埃鲁,sub1) → 845(达克,sub2) → 10010(皮皮,sub0) → 10164(闪光皮皮,sub1)`。
  ⚠️ **本句在 2026-10-19 订正过一次**：初稿写成"按行 id 排、同主编号内子编号**降序**"，两条都不对（键是 `defaultId`、次键是升序）。
- 显示用的"序号"另走 `SetID(defaultId, subId, star)`（§9 表第 1 行）⇒ **排序键与显示序号同源**，但**列表里 `defaultId ≠ id` 的行有 47 条**【实测】（`49` 条带 `subId≠0`），它们的格名/头像仍按**行 id**（`icon/{id}`）。

---

## 9. 右侧信息区：六项读数 + 六维种族值【源码 + 实测】

数据面 = `PetDictInfoModel.SetPetId(id)` → `Database.instance.GetPetInfo(id)`，视图 `PetDictInfoView.SetPetInfo(info)`（`Scripts/MVC/View/Pet/Dict/PetDictInfoView.cs:29-64`）：

| 标签（预制默认） | 写入方 | 口径 | 证据 |
|---|---|---|---|
| **序号：** | `SetID(info.ui.defaultId, info.ui.subId, info.star)` | `defaultId` +（`subId==0 ? "" : "-"+subId`）+ **` (★ <star> )`** 彩色串（`<color=#52e5f9>`、字号 4 空格排版） | `:64-66`；`star` 是 **float**（`PetUIInfo.cs:87`，发行数据含 `5.5`） |
| **身高：** | `SetHeightAndWeight(info.basic.baseHeight, …)` | **`base − (base+5) cm` 区间**（不是单值） | `:68-70`；本报告 **A12**（示例宠自身 `height=base+5`，永远落在区间上界） |
| **体重：** | 同上 | `base − (base+5) kg` | 同上 |
| **分布：** 或 **链接钮** | `SetHabitat(habitat, linkId)` | **二选一互斥**：`linkId` 非空且 ≠`none` ⇒ **藏文本、亮 `go.png` 链接钮**；否则 ⇒ 显示 `habitat` 文本 | `:72-77`；【实测】可见 788 只中 **linkId 数值 680 / 具名 44 / none 64** ⇒ **92% 的宠"分布"是一个跳图钮， habitat 文本被藏起来** |
| **特性：** | **不由本视图写** —— 由展示台 `PetDemoView.SetFeature` 写，取 `feature.name` 的**前 2 个字符** | `Substring(0, Min(len,2))`（`Scripts/MVC/View/Pet/Basic/PetDemoView.cs:120-131`）；同时按有无特性图标切换 `featureButton`/`featureHighStarButton` 两颗钮 | 本报告 **A11** |
| **简介：** | `SetDescription(info.basic.description)` | 原文（发行数据 `description` 列，**空值 0 条**） | `:79-81` |
| **【种族值】** 6 格 | `SetBaseStatus(info.basic.baseStatus)`，`Status.zero` ⇒ 6 格**清空文字**；否则逐格 `((int)baseStatus[i]).ToString()` | 6 维顺序 = **物攻/魔攻/物防/魔防/速度/体力**（`Status.cs:12-24`）；6 个 `Status.prefab` 实例的默认标签 `物攻`/值 `80` 是**烘焙占位** | `:83-92`；`Prefabs/Status.prefab`（`Indicator` TMP `物攻` size18、值 size20） |

- **`Info Prompt`（悬浮详细说明）**：`SetInfoPromptActive/SetHabitatInfoPromptContent`（`:94-102`），链接钮四事件 = 悬停取 `habitat` 文本、进/出错位显隐（【实测】`Panel.prefab:3551`）。
- **叫声钮**：`Sound` 节点（`StaticResources/Sprites/Map/sound.png`）→ `PetDictInfoController.PlayPetSound` → `PetUIInfo.PlaySound()` = `GetLocalAddressables<AudioClip>($"BGM/pet/{id}", IsMod)` ⇒ **按 petId（不是 skinId）** 取 `Resources/BGM/pet/{id}.mp3`（`PetUIInfo.cs:51-57`、`ResourceManager.cs:149-153`）。【实测】盘上该目录 **3371 个文件**、覆盖可见宠 **667/788**。
- **`测` / `改` 两颗单字符钮**（`PetStorage/Sprites/163.png`）：`测` = `PetDictInfoController.OpenExamplePetBagPanel`（`:89-95`，把示例宠灌进那份嵌套背包）；`改` = `OnEditPet` + **紧接着 `Panel.ClosePanel`**【实测 `Panel.prefab:4972` 同一 onClick 两条调用】⇒ 编辑（工坊专用）会**把图鉴关掉**；`改` 钮只在 `Workshop` 档由 `PetDictInfoView.SelectMode` 亮起（`:24-27`）。

---

## 10. 展示台（`PetDemo*`）：动画 + 六枚信息钮【源码】

`selectController.onSelectPetEvent` 双订阅：`demoController.SetPet` 与 `infoController.SetPet`（`PetDictionaryPanel.cs:24-26`）。展示台 `PetDemoView.SetPet(pet, animMode=true)`（`Scripts/MVC/View/Pet/Basic/PetDemoView.cs:60-73`）依次写：

| 元素 | 口径 |
|---|---|
| 名字 | `nameText`，**Mod 宠 = 金色、普通 = 青色**（`SetName`，`:75-79` + `ColorHelper.gold`） |
| 主/副属性 | `elementButton`/`subElementButton` 的 `SetElementSprite`；**副属性 = 普通 时整颗钮隐藏**（`:106-111`） |
| 特性 | 前 2 字文本 + （有图标 ⇒ 亮 `featureHighStarButton` 并 `SetSprite(icon)`；无图标 ⇒ 亮 `featureButton` 文字钮） |
| 性别 / 纹章 / 个体值 | `SetGender(basic.gender)`、`SetEmblem(hasEmblem, feature.emblem)`、`SetIVRank(talent.IVRank)`（示例宠恒 `hasEmblem=true`、`iv=31` ⇒ 图鉴上这三项对所有宠都是**满配值**） |
| 画面 | `animMode` ⇒ `pet.ui.GetBattleAnim(Idle)`（**SWF clip 或 Spine**，见 `:190-255`）；`animMode==false` 或动画为 null ⇒ 退回静态 `pet.ui.battleImage`（`Pets/battle/{skinId}`） |
| 气泡 | `ShowInteractDialog(text, sound)`：文本 + 播放音、**4 秒自动收**（`:124-142`）；`OnDisable` 立即收（`:46-49`） |

- 渲染通路 = **专用相机 `Pet Anim Camera`（预制里 2 台）→ RenderTexture `Resources/Sprites/PetAnimationRenderTexture.renderTexture` → `RawImage`**【实测 `Panel.prefab:1244`、`:5741`】，与我方 Ruffle 播 `/swf/fight/{swfId}.swf` 的 `idleStage.js` 是**两条不同的技术路**（我方对位口径 = 背包报告 §10、`docs/view/panel/petbag-impl.md`）。
- **图鉴档的动画开关**：`PetDictionaryController` 只调 `demoController.SetPet`（经事件），而 `PetDemoController.SetMode`/`SetPetAnimationActive` 的调用发生在**嵌套的那份背包**里（`PetBagPanel.Init` 里 `demoController?.SetMode(mode)`）⇒ 图鉴的"示例宠背包"打开时会先 `SetPetAnimationActive(false)` 停掉主展示台动画（`PetDictInfoController.cs:89-95` + `Panel.prefab` 的 2 处 `SetPetAnimationActive` override）。

---

## 11. 与背包机的关系：一份背包预制被嵌进图鉴【实测 + 源码】

- 图鉴预制**内嵌 `PetBag/Panel.prefab` 一份**（实例名 override 成 **`Test 2`**，`Panel.prefab:13230`、`:13779`），并**逐处把 `mode` 覆写成 2 = `PetBagMode.Dictionary`**，共 **4 处 override**【实测】：

  | 行 | 被覆写对象所属类 | 含义 |
  |---|---|---|
  | `Panel.prefab:13635` | **PetBagPanel** | 面板自身切到 Dictionary 档 |
  | `Panel.prefab:13243` | PetBagController | 控制器同档 |
  | `Panel.prefab:9546` | PetDemoController（直接内嵌的 `Pet Demo.prefab`） | 展示台同档 |
  | `Panel.prefab:13755` | PetDemoController（背包实例内部那份） | 同上 |

  ⇒ 这与背包报告 §1.2 的"一个机器被四个宿主复用（`mode` 0/1/2/3）"是同一件事：**`2 = Dictionary` 的宿主 = 图鉴**，且它是**嵌套预制 + override**、不是"运行时 SetMode"（对照 **S3**：上游没有 `SetMode`）。
- **Dictionary 档改变了什么**（`Resources/Panels/OldPetBag/Scripts/PetBagPanel.cs`）：
  - `InitMode`：**只 `SetItemBag(Item.petItemDatabase)`（全道具表），不调 `SetPetBag`**（`:58-59`）⇒ 打开图鉴时嵌套背包**格子里没有宠**；
  - `GetPetBag()` 走 `default:` ⇒ `selectController?.GetPetSelections()`（`:220-229`）＝ **该背包当前页的格子数组**（没人灌过就是全 null）；
  - `PetBagController.ToPersonalityPet` 在 `PVP/Dictionary` 档 **跳过 `SaveSystem.SaveData()`**（`Scripts/MVC/Controller/Panel/PetBagController.cs:164-167`）⇒ 图鉴档改性格**不写盘**（与 C1 §10 的 `persist='none'` 口径同源）；
  - 背包报告登记的 **A1（打开面板必写一次存档，因为 `Init()` 无条件 `SetSkillRule` → `SaveData`）** 在图鉴档**同样中招**（那份 `Init()` 就在被嵌套的背包里跑）⇒ 我方已按 A1 目标行为实现（打开不写盘），见背包报告 §7 / `docs/view/panel/petbag-impl.md`。
- **`测试对战`**：嵌套背包里那颗钮的 onClick 被 override 成 **`PetDictionaryController.TestBattle`、`m_IntArgument = 2`**【实测 `Panel.prefab:13639-13652`】，悬停文案 **"测试对战（约瑟）"**（`:13656`）。链路 = `Map.TestBattle(2, petBagPanel?.petBag)`（`PetDictionaryController.cs:61-63`）→ `Scripts/Scene Specific/Map/Map.cs:75-78` → 载图 `2`、取 npcId `2*100+1=201` 的 `battleHandler["test"]`、清 win/lose handler、`isSimulate=true, isCaptureOK=false`、**`SceneLoader.ChangeScene(SceneId.Battle)`**（`:80-107`）⇒ **需要一个独立 Battle 场景**；地图加载失败 / 无该 NPC ⇒ 弹 Hintbox（"加载的地图为空"/"测试的NPC战斗信息为空"）。
- ⚠️ **同一颗钮在 Room 场景里被改指向了一个不存在的控制器**：`Scenes/Room.unity:3504` 对 `PetBag/Panel.prefab` 实例把 `m_TargetAssemblyTypeName` 覆写成 `PetDictionaryController`，但 **Room 场景里 `PetDictionaryController` 的 guid 计数 = 0**【实测】⇒ 那条 onClick 的 target 是悬空的（本报告 **A9**）。

---

## 12. 发行数据与盘上素材（可复算）【实测】

| 量 | 值 | 复算方式 |
|---|---|---|
| 宠表行数 | **838** | `awk 'END{print NR-1}' Resources/Data/Pets/basic.csv`（`ui.csv` 同为 838） |
| `hide=true` | **50** ⇒ 列表可见 **788** | `grep -c "hide=true" Resources/Data/Pets/ui.csv` |
| 星级取值 | **8 档**：1(63) 2(466) 3(91) 4(88) 5(43) 5.5(3) 6(14) 7(20)（**可见 788 只口径**） | `grep -oE "star=[0-9.]+" ui.csv \| sort \| uniq -c` |
| id 范围 | 1 … **114798**；`>100000` 29 条；**负 id 0 条** | `awk -F, 'NR>1{print $1}' basic.csv \| sort -n` |
| 进化家族数（`baseId` 去重） | **317** | `awk -F, 'NR>1{print $2}' basic.csv \| sort -u \| wc -l` |
| `topicPetId`（"最新精灵"档） | **9 只** = `20016,14415,969,531,493,10904,376,752,114764`（源 `Resources/Data/System/version.xml:51`）；**9 只全在表内**，其中 **`114764 瑶光桂影·琉梦` = `hide=true`** | `grep -o "<topicPetId>[^<]*" version.xml`；逐只查 `game/data/unity/pets.json` |
| `linkId` 分类（可见 788 只） | **数值 680 / 具名 44 / none 64**；具名去重 = `SignReward[activity=…]×3`、`Mission`、`SoulPet`、`Fusion`、`WorldMap[world=1]` | 逐行分类 `game/data/unity/pets.json` 的 `linkId` |
| 数值 `linkId` 样例 | `-10010 … -1 … 540 … 10457`（含**负数图号**） | 同上 |
| 头像 PNG | `Resources/Pets/icon/` 盘上 **990** 张 ⇒ 覆盖可见宠 **788/788（100%）** | `ls projects/Seer2-Restart-Lite-main/Resources/Pets/icon \| wc -l` + 按 `ui.defaultSkinId` 逐个查 |
| 战斗动画 SWF | 我方 `swf/fight/` **1606** 个；按 `content.swfIdOf(id)` 桥覆盖可见宠 **489/788（62%）**，缺 **299**（示例：id 459–466 一线） | 逐 id 查 `swf/fight/<swfId>.swf` |
| 叫声 MP3 | `Resources/BGM/pet/` 盘上 **3371** 个 ⇒ 覆盖可见宠 **667/788（85%）**（按 **petId** 取，不是 skinId） | `ls …/Resources/BGM/pet \| wc -l` |
| 面板框用到的 PNG | **全部在盘**：`PetStorage/Sprites/{element background,30,31,35,36,41,920}.png`、`OldPetBag/Sprites/{85,87,151}.png`、`TwelveRound/Sprites/have.png`、`PetBag/Sprites/Pet/Ban.png`、`StaticResources/Sprites/Map/{go,sound}.png`、`ItemShop/Sprites/title line.png`、`Sprites/Game/Hint Box/Green Esc.png` | 逐条 `[ -e ]` |

**预制计数命令**（本报告 §5 的数字全部来自这几条）：

```bash
cd projects/Seer2-Restart-Lite-main/Assets/Resources/Panels/PetDictionary
for c in 1 224 114 222 20 1001; do echo -n "!u!$c = "; grep -c "^--- !u!$c " Panel.prefab; done
grep -c m_MethodName Panel.prefab                        # 109（persistent call 的方法行）
grep -oP 'm_SourcePrefab: \{fileID: 100100000, guid: \K[0-9a-f]+' Panel.prefab | sort | uniq -c
grep -n 'propertyPath: mode' Panel.prefab                # 4 处，全部 value: 2
```

---

## 13. 怪癖与缺口登记（A1–A14；政策 = 决议 ② **声明 + 不照搬**）

| # | 怪癖 | 证据 | 发行数据里的可观察后果 |
|---|---|---|---|
| **A1** | **起始档位没有代码定死**：预制序列化 `mode=1(Topic)`，面板 `Init()` 又要 `All`，两个 `Init()` 都靠 Unity `Start()` 驱动、`Panel.OpenPanel` 不调 `Init()` | 【源码】`Panel.prefab:7537`、`PetDictionaryPanel.cs:22-26`、`PetDictionaryController.cs:26-29`、`IMonoBehaviour.cs:12-14`、`Panel.cs:28-75` | 打开图鉴**默认落在只有 9 只的"最新精灵"**、要看全列表得再点"精灵列表"；且这一行为**依赖引擎调度顺序**（换 Unity 版本可能翻转）⇒ 我方必须**显式定档**（design 已定 = `dex-design.md` DX6） |
| **A2** | **`Workshop` 是单向死档**：`SelectMode` 开头 `if (mode == Workshop) return;` | 【源码】`PetDictionaryController.cs:47-48` | 由工坊线外部设成 Workshop 后，**两颗页签全部失效、出不回列表档**（本次发行数据不触发，属地雷） |
| **A3** | **排序下拉的"星级"档是死键**：`(v+1)*Mathf.Sign(v-2)` 在 `v=2` 时 = 0 = `None`，而 `GetSorter` 的 `default:` 与 `PositiveId` **共用一个 return** | 【源码】`PetSortingModel.cs:20`、`:32-36`；【实测】下拉 3 项 `Panel.prefab:3026-3033` | 玩家选"星级"后**顺序一模一样**（按 id 升序），星级的 `Star` sorter 在这块面板**永远够不到** |
| **A4** | **总数文本没接线**：`PetSelectView.storageCountText = {fileID: 0}` | 【实测】`Panel.prefab:7239` | 图鉴**不显示"共 788 只 / 当前筛选 N 只"**（`SetStorageCountText` 全程 no-op）；背包面板那边是接了的 ⇒ 两面板观感不一致 |
| **A5** | **`Reset()` 漏星级**：只 reset 元素与名字 | 【源码】`PetFilterController.cs:60-64` | 与 C1 背包报告的 A8 **同一条**（同一台机器的同一处）：星级谓词残留 ⇒ 换列表后筛不掉。⚠️ 图鉴档**根本没挂星级筛选器**（§8）⇒ 本面板无后果，但**机器共用、改正本在 C1** |
| **A6** | **`hide` 只在 All 档生效**：`petTopic` 不过滤 hide | 【源码】`PetDictionaryController.cs:10-11`、`VersionData.cs:88`；【实测】`114764` = `hide=true` | "最新精灵"档里**能看见一只全列表搜不到的宠**（瑶光桂影·琉梦）⇒ 上游自己都不自洽 |
| **A7** | **图鉴不存"见过/抓到"**：列表 = 整张宠表当场造样本宠，无任何落盘 | 【源码】`VersionData.cs:83`（`[XmlIgnore]`）、`Pet.cs:100-128`；【实测】存档面 `petDict` 亦 `[XmlIgnore]`、XML 无 `<dex>` 元素 | 玩家**第一档就能看到全部 788 只**（无战争迷雾）；"抓到没"只剩那枚 `have.png` 角标。⚠️ 与 `docs/save/save-impl.md:207`"图鉴字段直接丢"一致 ⇒ **我方做图鉴不需要新存档面**（design **DX0-b** 的根据；要不要另加战争迷雾 = design **DXQ3**） |
| **A8** | **"已获得"判定方向不对称** | 【源码】`Pet.cs:399-402` + `PetExpSystem.cs:91-112` | 拥有进化后形态 ⇒ **祖先条目一起亮**；只拥有初始形态 ⇒ 进化后条目**不亮**。玩家看到的是"我没抓到这只进化形"，但上游其实**没有"抓到过进化形"的记录面** |
| **A9** | **Room 场景把嵌套背包的"测"钮指向了本场景不存在的控制器** | 【实测】`Scenes/Room.unity:3504`（`m_TargetAssemblyTypeName: PetDictionaryController`）vs 该场景 `95a2c076…` guid 计数 **0** | Room 场景里的背包"测"钮点击 = **目标悬空、无反应**（Unity 侧静默）；与我方无关（我方 Room 场景 = A 组 `Room`，`docs/architecture.md §1.1`），但**说明上游把图鉴的 override 复制进了别的场景** |
| **A10** | **图鉴档的"测试对战"带的包是空的**：`InitMode` 的 `Dictionary` 支只灌道具、不灌宠，`GetPetBag()` 落 `default: ⇒ GetPetSelections()` | 【源码】`PetBagPanel.cs:54-59`、`:220-229` | 不先点"测（示例宠背包）"就直接点嵌套背包里的"测试对战" ⇒ `Map.TestBattle(2, 全 null 的 12 格)` ⇒ **带 0 只宠进模拟战**（顺序耦合、界面无提示） |
| **A11** | **"特性"文本被截成 2 字、且写入方在展示台不在信息区** | 【源码】`PetDemoView.cs:120-131`；`PetDictInfoView.cs` 全文**没有** `featureText` | 特性行**依赖展示台存活**：`demoController` 一旦关动画/异常，特性格子留在预制默认；文本口径是"显示层截断"而非数据字段 |
| **A12** | **身高/体重显示成"区间"、示例宠恒落在上界** | 【源码】`PetDictInfoView.cs:68-70`（`base − base+5`）对照 `Pet.cs:109-110`（示例宠 `height=base+5`） | 信息区写 `39 - 44 cm`、而"图鉴里那只宠"实际 44 —— 两处口径不同，玩家不会察觉，但**不能据此认为图鉴有"个体差异"**（同一种每格完全相同） |
| **A13** | **两个同名 `petDictionary` 是不同东西** | 【源码】`VersionData.cs:84`（按 `min/maxPetId` 区间）vs `PetDictionaryController.cs:10`（按 `hide` 过滤 + 排序） | 读代码极易把"图鉴 = id 区间过滤"记错；控制器用的是自己那个 ⇒ 本报告 §3 的口径以控制器为准 |
| **A14** | **`改`（编辑）钮与"关闭图鉴"绑在同一次点击** | 【实测】`Panel.prefab:4972`：同一 `onPointerClickEvent` 两条调用 = `OnEditPet` + `Panel.ClosePanel` | 工坊编辑一触发 ⇒ **图鉴整块消失**（编辑目标交给外部回调）；`OnEditPet` 的回调只有工坊线注册（`WorkshopAllController`），别处点它 = 静默 + 面板被关 |

**另记两条"当前无后果"的观察**（登记以便改数据时不踩）：
- **烘焙默认值**：信息区在预制里预置了**某一只具体宠**的数据 —— `39 - 44 cm`（`:945`）、`7 - 12 kg`（`:2023`）、序号 `1`（`:6147`）、简介 **"漂亮冷酷的精灵，不爱说话。"重复两遍**（`:4724`）、分布文本 `新手任务`（`:8604`、且该节点 `m_IsActive=0`）；格名默认 `未知`、种族值默认 `物攻/80`、页码默认 `0/0`。**运行时全部会被覆盖** ⇒ 无后果，但**"简介写两遍"是预制手工摆的**（若我方首帧未覆盖就会露出）。
- **不写存档**：图鉴自身全程**不碰存档**（唯一一次写盘风险来自嵌套背包的 **A1**，见 §11 —— 那条已在 C1 按目标行为修掉）。

---

## 14. 交 design 的输入清单

1. **入口已就位**：HUD `dict` 钮 + `handler:'onDex'`（`game/app/view/hud/restartHudView.js:81`）+ `mapScene.js:254` 的占位 —— 接线形状与 WorldMap/MiniMap/Activity 三条**完全同构**（`openPanel(name, build)` + `api.close()`）。
2. **数据面我方已齐**：`game/data/unity/pets.json`（838 行、含 `hide/star/defaultId/subId/baseHeight/baseWeight/description/habitat/linkId/baseStatus/elementId/growth.evolvePetIds`）⇒ 图鉴要的字段**一个不缺**；缺的只有 **"枚举全部宠"这个 getter**（`content.js` 现状 = `restartAllItems()` 有、**无 `restartAllPets()`**，正是 **VP5** 当年不补的那一格 —— 反转与新口径的**正本** = `docs/view/panel/dex/dex-design.md §8` 的 **DX0-a**）。
3. **"已获得"的输入我方已有**：`petBag`(12) + `petStorage` 的运行时投影已在 `mapScene.js` 的 `projectBagView`（`:340` 附近）里；进化链字段在桥里 ⇒ §4 的谓词可以在 **L1 纯函数**里复刻（决议 ① 口径：不引随机、不引外部状态）。
4. **画面素材**：框/角标/属性栏 PNG **全部在盘**（§12 表）；头像 **788/788**；动画 **489/788（62%）** ⇒ 缺的 299 只必须**降级到静态头像**、且**如实登记**（口径接 §4.11/§4.14 先例与 `docs/view/panel/petbag/petbag-panel-desc.md`）。
5. **跳转终点**：`linkId` 的三类出路（数值传送 / 具名开面板 / `none`）与**活动面板已实现的那台分派器同源**（`mapScene.js:321` `handlePanelLink`，含 `ACT_UNBUILT` 未建终点名单）⇒ design 要定：**图鉴复用同一个分派器，还是各面板各写一份**（design **DXQ4**，建议 = 提为共用 `handlePanelLink`）。✅ **已决 = A，2026-10-19 落码**（`dex-impl.md §4.1 d4`）。
6. **必须逐条给目标行为的怪癖**（决议 ②）：**A1**（默认档）、**A3**（星级死键）、**A4**（无计数）、**A6**（hide 不一致）、**A8**（已获得方向）、**A9**（Room 悬空，属 A 组不接）、**A10**（空包测试对战）、**A11**（特性 2 字）、**A14**（编辑即关面板）；**A2/A5/A13** 登记为地雷/正本指针。
7. **不做**（围栏照旧）：`Workshop` 档（工坊 = A 组，`AGENTS.md §4` 第 1 条）、PVP 禁选（**VP7**）、`[Mod]` 面板分支、`#/battle` AS3 战斗页（`AGENTS.md §4` 第 8 条）、`Map.TestBattle` 所需的上游 Battle 场景 ⇒ 见 design §1/§8。
8. **正本指针**：本面板规则一旦被 design 承接，`docs/view/panel/view-panels-pet.md §1.2/§5.1 S5/§10/§11 VP5` 那四处"本代不做"的记载**必须同步改写**（同一批改写还含 `docs/arch-docs.md §0.1` 目录树与 `docs/external-refs.md §3`（台账 A · `seer2-pet-preview/` 行，**:45**）里那句"VP5 已决'本代不做图鉴宿主'"的旁证句）。
