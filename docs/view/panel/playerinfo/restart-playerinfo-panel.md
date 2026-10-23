# 代码分析：重启的上游是怎么实现「个人信息（PlayerInfo）」的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住本面板子目录 `docs/view/panel/playerinfo/`）。
> **性质**：**只读分析上游 C#/预制/场景**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、发行数据里能观察到什么"查清并钉死。
> **线/族**：View 线 **C4 社交信息族**（`docs/view/view-design.md §8` 表 C4 行 `Mailbox/News/PlayerInfo/SignReward/Activity/Noob`）；**Activity 已先落**（同族首份），本份 = **PlayerInfo**（人类 2026-10-20 点名"实现 HUD 底栏『信息』图标按钮 → PlayerInfo 面板"）。
> **父 / 邻**：面板栈机制 = **A2 `docs/view/mech/view-panel-stack.md`**（`OpenPanel` 同名去重 / 遮罩）；道具背包 = **U4 `docs/view/panel/petbag/petbag-panel-desc.md` + `restartItemBagView`**（本面板 Bag 钮对位它的子层）；称号/货币/立绘消费 = **`docs/item/item-design.md`**（道具怎么用归道具线，本份只读形状）；改名落盘 = Save 线 `nickname`/`settingsData` 透传；HUD 底栏几何 = **B1 `docs/view/scene/room/view-scene-hud-impl.md`**（`info` 钮 23×25 已抄场景）。
> **路径口径**：上游代码路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方代码相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 可复算的数字或可复跑的 grep / `ls`；【源码】= 直接引用 `路径:行`；【预制】= `Resources/Panels/PlayerInfo/Panel.prefab` 的序列化版面/绑定；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A15**，引用**必须带文件名**）。
> **状态**：✅ 已写（阶段一 · 证据）；本线特例 = 人类已点名开工（2026-10-20），配套 design/impl 同批补写（`playerinfo-design.md` / `playerinfo-impl.md`），**先停下等人类拍板 PIQ1–4 再落码**（与 activity 先例不同 —— activity 是先拍板 ACQ1–4 才同批落码）。

---

## 0. 一句话结论

**"个人信息"在上游是一面板五件**（`PlayerInfoPanel` + `PlayerInfoController` + `PlayerInfoModel` + `PlayerInfoView` + 借来的 `ChangeName*` 三件）：
① **昵称两拍**——`ChangeNameController.OnChangeName`：初态 `isDone=true`（显示态），第 1 拍只**翻转进编辑**（InputField 激活、placeholder 填旧名、图标 Edit→Mark），第 2 拍才取值——空 ⇒ 弹「昵称不能空白」且**不退出编辑**；非空 ⇒ `PlayerInfoModel.OnChangeNameSuccess` 写 `data.nickname` + 落盘 + 翻回显示态；
② **称号/装备下拉**——`ChangeNameModel.Init` 把 `itemStorage` 里 `IsInCategory(Achievement)` 的道具按 `type 降序、id 升序`灌进下拉（选项 0 = 「无」），选定 ⇒ `OnAfterChangeAchievement` 写 `data.achievement` + 落盘；
③ **立绘三态**——`SetPlayerSprite`：`useRobotAsPlayer ? 机器人 : (装备图标 ?? nono)`，**只有 `type==Equipment` 算"装备"**，高度 100（机器人/无装备）或 150（有装备）；`Change` 钮翻 `useRobotAsPlayer` + 落盘；
④ **货币活读数**——`PlayerInfoModel.coin/diamond` = `Item.Find(1/2, itemStorage)?.num ?? 0`（图标走 `ItemInfo.GetIcon`）；
⑤ **Item Bag 子层**——初始 `inactive`，Bag 钮 `SetActive(true)` 打开、子层 Esc `SetActive(false)` 关，喂 `data.itemBag`（= **全 itemStorage 按 id 排序，含货币**）。
另有 **Shoot**（翻 `isShootMode`、**不落盘**）、**Follow/Home**（跟随者，**上游 TakeFollower 自身恒弹"尚未实装"**）。
入口 **双通道**：Map 场景 HUD 底栏 `Bag` 节点（= 我方 `info` 钮，23×25 同几何）+ 点地图玩家角色（`PlayerView.OpenPlayerInfoPanel`）；**我方只接底栏入口**。

我方对应物（本报告写时）：HUD 底栏 `info` 钮位（`restartHudView.js:80`，**现无 handler ⇒ 点了走 `todo('信息')`**）；`session.data` 里 `nickname`/`achievement`/`settingsData.useRobotAsPlayer` 三字段的读写需经 **L4 装配点闭包注入**（`A` 不暴露 `session.data`，同 `soulSet` 口径）；道具背包已有现成模态 `openRestartItemBag`。

---

## 1. 入口：Map 场景的双通道【源码 + 预制 + 实测】

| 通道 | 场景对象 | 接线 | 落点 |
|---|---|---|---|
| **① 底栏「信息」钮** | `Scenes/Map.unity` Menu Area 的 `Bag` 节点（GO `1647721954` / doc `1647721956`，`SizeDelta 23×25`） | `IButton.onPointerClickEvent → MapMenuController.OpenPanel("PlayerInfo")`；父 transform `614500963` ⇒ GO `614500962` = **Menu Area**，该父共 7 子：`Shop→ItemShop` / `Background→""` / `Dict→PetDictionary` / `Home→""` / `Guide→GuideLine` / `Mail→Mailbox` / **`Bag→PlayerInfo`**【实测 `pif-unity2`】 | `Panel.OpenPanel("PlayerInfo")` ⇒ 加载 `Resources/Panels/PlayerInfo/Panel.prefab`（面板框素材在场【实测 `ls`】） |
| **② 点地图玩家角色** | 玩家 View 上的 `PlayerView` 组件（guid `30493f9256cda4e4d89aee45cf2a4fb3`，`Map.unity` `playerButton` 字段，doc `2069327821` GO `2069327820`）→ Button 节点（IButton doc `1818240898`，GO `1818240893`） | `OpenPlayerInfoPanel`（target doc `613729592` GO `613729589` = PlayerController）→ `PlayerController.OpenPlayerInfoPanel:151-154` → `PlayerView.OpenPlayerInfoPanel:157-160` → `Panel.OpenPanel<PlayerInfoPanel>()` | 同一面板 |

- **⚠️ 命名陷阱（A15）**：底栏那个节点在场景里叫 **`Bag`**，绑的方法却是 `OpenPanel("PlayerInfo")` —— 场景 GO 名与面板名**不一致**，看场景源码时别被 `Bag` 带偏（它不是道具背包，道具背包走 HUD `mail` 钮 / `openRestartItemBag`）。
- **我方对位**：底栏 `info` 钮已抄场景（`restartHudView.js:80`，`box:[550,505,23,25]` **与上游 23×25 同几何**【实测】），图标 `StaticResources/Sprites/Map/menu/info.png`（`restartHudView.js:26`）；**现无 handler**（点它 `→ todo('信息')`），本份要加 `handler:'onInfo'`。
- **第二入口（点玩家）本仓无对应**：我方角色是 canvas 上的 sprite / 占位点，**不是可点目标**，也没有"点角色弹面板"的绑定面 ⇒ **不实现**，只在此如实登记（A15）。

## 2. 面板机：MVC 五件 + 借来的改名片【源码】

上游本面板脚本 4 个 `.cs`（`PlayerInfoPanel 102` / `PlayerInfoController 40` / `PlayerInfoModel 29` / `PlayerInfoView 44`）+ **借来**的改名三件（`ChangeNameController 40` / `ChangeNameModel 43` / `ChangeNameView 45`，住在 `MVC/*Controller/Model/View/Player/`，供本面板与地图角色共用）。

- **`PlayerInfoPanel.Init`（`:22-26`）⇒ `InitPlayerData`（`:28-36`）**五件初始化：
  1. `changeNameController.InitName(data.nickname)`（显名）；
  2. `changeNameController.InitAchievement(data.achievement)`（灌下拉 + 回填当前）；
  3. `infoController.ShowCurrency()`（刷货币）；
  4. `itemController.SetItemBag(data.itemBag)` + `itemController.gameObject.SetActive(false)`（**子层初始关着**，A2）；
  5. `SetPlayerSprite()`（刷立绘）。
- **`InitChangeNameSubscriptions`（`PlayerInfoPanel:38-50`）**：`Awake` 里挂三事件（`onChangeNameEmptyEvent→OnChangeNameEmpty` / `onChangeNameSuccessEvent→OnChangeNameSuccess` / `onChangeAchievementSuccessEvent→SetPlayerSprite`）；**懒查 `PlayerController.instance`**（`:45-49`）再挂 `SetPlayerName`/`SetPlayerAchievement`（= 地图角色头顶名/称号文本，`PlayerView.cs:147-155`）—— 面板内改名**顺手**改地图角色头顶名（我方无地图头顶名消费 ⇒ 不接，但需同步我方 `state.trainer.name`，见 design）。
- **`SetPlayerSprite`（`PlayerInfoPanel:61-70`）**：`equipment = GetPlayerEquiment()`（`:52-59`，方法名上游拼错 **`GetPlayerEquiment`**，A10）；`sprite = useRobotAsPlayer ? robotSprite : (equipment?.icon ?? nonoSprite)`；`height = (useRobotAsPlayer || equipment==null) ? 100 : 150`，宽 = `GetResizedWidth(height)`（`HelperUI.cs:106-114`）。地图侧同款：`PlayerController.SetMap:62-75`（非机器人时若 achievement 是 Equipment 也换角色 sprite/尺寸）。
- **`ChangePlayerRobot`（`PlayerInfoPanel:72-77`）** = 翻 `settingsData.useRobotAsPlayer`（`SettingsData.cs:8`，默认 `true` `:22`）+ `SetPlayerSprite` + `SaveSystem.SaveData()`（**落盘**）。
- **`ChangeShootMode`（`PlayerInfoPanel:79-82`）** = 翻 `Player.instance.isShootMode`，**不落盘**（`Player.cs:39-43` = 进程级 `static sceneData:37`；`SetSceneData` 的 `shootMode` 支 `:76-85` 附带改鼠标光标 Aim，且 **`mapId==990` 时清 seed 并 return、连模式都不设**，A7）。
- **`TakeFollower`（`PlayerInfoPanel:84-87`）** = **上游自身恒弹「该功能尚未实装，敬请期待！」**（A3）；`SetFollowerHome`（`:89-100`）无跟随者 ⇒ 弹「当前没有跟随中的精灵或动物哦！」（`Player.follower:21` 本仓永远 null ⇒ 只走这支，A4）。
- **改名片三件**：
  - `ChangeNameModel`（`ChangeNameModel.cs`）：`isDone` 初值 **`true`**（`:10`，= 显示态）；`Init`（`:16-24`）灌 `achievementList` = `itemStorage.Where(IsInCategory(Achievement)).OrderByDescending(info.type).ThenBy(id)`（`:19-20`），选项 = `"无" + 各 name`（`:22`），回填 `SetAchievement(achievement)`；`SetAchievement`（`:26-28`）= `FindIndex(id==value)+1` ⇒ **查无即得 0 = 「无」，只动显示、不改档值**（A1）；`OnAfterChangeName`（`:34-36`）翻 `isDone`；`OnAfterChangeAchievement`（`:38-41`）写 `data.achievement = (value==0)?0:list[value-1].id` + 落盘。
  - `ChangeNameController.OnChangeName`（`:22-34`）：**两拍**——`isDone==true`（第 1 拍）直接跳过取值、只 `OnAfterChangeName` 翻成编辑态；`isDone==false`（第 2 拍）取 `inputString`，空 ⇒ `onChangeNameEmptyEvent`（**不翻回、留在编辑态**）+ return，非空 ⇒ `SetNameText` + `onChangeNameSuccessEvent`，末尾统一 `OnAfterChangeName`（翻回显示态）+ `OnAfterChangeName(isDone)`。
  - `ChangeNameView.OnAfterChangeName(isDone)`（`:38-43`）：InputField 激活 `=!isDone`、placeholder = 旧名、Name Text 激活 `=isDone`、图标 `isEditIcon=isDone`（Edit/Mark 切换）。
- **`PlayerInfoModel`（`PlayerInfoModel.cs`）**：`coinType=1`/`diamondType=2`（`:10-11`）；`coin = coinType==0 ? -1 : Item.Find(coinType, itemStorage)?.num ?? 0`（`:12-13`）；`OnChangeNameSuccess`（`:24-27`）写 `data.nickname` + 落盘。⚠️ **`itemStorage` 属性（`:8`）在 `shopMode` 为 YiTe 时换 `YiTeRogueData.instance.itemBag`**（`ItemShopPanel.IsYite:72`），**常规支 = `null` ⇒ `Item.Find` 落到静态 `Item.itemStorage` = `Player.instance.gameData.itemStorage` 属性代理（`Item.cs:32`）** ⇒ **上游货币与存档 itemStorage 同源**（不再是"可能恒 0"，A9）。
- **`PlayerInfoView`（`PlayerInfoView.cs`）**：`SetCoin/SetDiamond`（`:11-23`）`<0` 显空、否则 `ToString()`；`SetCurrencyType`（`:30-36`）图标走 `Item.GetItemInfo(coinType/diamondType)?.icon`（= `ItemInfo.GetIcon` 路由，A5）；`OnChangeNameEmpty`（`:38-43`）= Hintbox title「提示」/content「昵称不能空白」size 20、1 键。

## 3. 数据与可得性【实测 + 源码】

- **称号族 = `ItemCategory.Achievement` 的映射**（`ItemDatabase.cs:75`）= **{Achievement, Shoot, Equipment}** 三类型（enum 顺序 `ItemDatabase.cs:116-144` 实测 `Achievement=23 / Shoot=24 / Equipment=25`）。我方 `game/data/unity/items.json`（顶层 `{_version,_table,items}`，612 条，类型字段 = `typeId`）里 `typeId∈{23,24,25}` 实测 **18 条**（【实测 node】）：
  - **Equipment(25) 5 条**：`7001 潜水服`(resId 37001) / `7006 飞行套装`(37006) / `7010 防寒套装`(**resId 37010**) / `30001 银翼猎手`(30001) / `37002 喷水套装`(37002)
  - **Shoot(24) 7 条**：`7002 高压水枪` / `7003 火焰喷射器` / `7004 鱼饵` / `7005 赤色鱼饵` / `7007 寒流枪`(resId 37007) / `7008 金色鱼饵` / `7009 电磁棒`(resId 37009)
  - **Achievement(23) 6 条**：`24001 魅魔之王`(resId `Buffs/440001`) / `24002 笑口常开`(`Buffs/440002`) / `25001 七日创世`(`Buffs/441001`) / `25002 魔花绽放`(`Buffs/441002`) / `25003 永恒之光`(`Pets/pet/14149`) / `25004 黄晶矿脉`(`Npc/1035803`)
  - **三类都进下拉，立绘只认 Equipment(25)**（`SetPlayerSprite` 的 `type==Equipment` 判，`PlayerInfoPanel:58`）。
  - **图标路由**（`ItemInfo.GetIcon:117-129`）：数字 resId ⇒ `Resources/Items/<resId>.png`；路径 resId ⇒ `Resources/<resId>.png`。18 条**按 resId（不是 id）查盘**实测 **18/18 在盘**（⚠️ `7010` 的 resId 是 `37010`、`24001` 的是 `Buffs/440001`，**按 id 查会误报缺盘**）。
- **货币图标**：`1 赛尔豆`(resId `1`) / `2 星钻`(resId `2`)，`Resources/Items/1.png` / `2.png` **在盘**【实测】。
- **本面板自有素材**（`Assets/Resources/Panels/PlayerInfo/Sprites/`，【实测 `ls`】）：`Nono` / `Edit` / `Mark` / `Coin` / `Diamond` 5 张**被预制引用** + `Own pet num` / `Beat spt num` / `Pet highest level` 3 张**盘上有但预制树未引用**（A6 遗留）。**robotSprite 不在此目录** —— 见 A13。
- **⚠️ 双资源树**：`projects/…/Resources/`（运行时镜像，`item-art` 的 `ART_ROOT`，称号/货币图标走这棵）与 `projects/…/Assets/Resources/`（本面板自有 Sprites + robotSprite 只在这棵）是**两棵**；L3 既有代码两边都引用（`item-art` 走 `Resources`、`npc-art`/本面板 sprite 走 `Assets/Resources`）⇒ 取图根**照抄双根**，不统一挪树（design §4）。

## 4. 预制版面与绑定【预制 + 实测】

- **版面树**（`Panel.prefab`，根 `Panel 480×320` 居中【实测 `parse-pif`】）：
  - `Background`（全拉伸）+ `Esc Button 35×35`（右上 `pos=-10,-10` 锚 `1,1`）
  - **`Name Bar`** > `View` >
    - `Name`（`Name Indicator`「昵称」18px + `Name Text`「约瑟传说永不言败」18px + `Name InputField[a=0]`（`Placeholder`「名字」）+ `Change Name Button 20×20`（Edit.png））
    - `Achievement`（`Name Indicator`「称号/装备」18px + `Dropdown 160×25`（`Label`「无」16px + `Template` 带 `Checkmark`），**序列化选项实测 = 仅 1 条「无」**）
  - **`Player Bar`**（立绘 `Image 100×100` 居中 + `Shoot 45×45` / `Bag 50×25` / `Follow 50×25` / `Home 50×25` / `Change 30×30`，均右锚底边）
  - **`Currency Bar`**（`Coin 170×30` = `Image 42×42`(Coin.png) + `Text` 占位 **`2147483647`**；`Diamond 170×30` = `Image 28×28`(Diamond.png) + `Text` 占位 **`999999`**）
  - **`Item Bag[a=0]`**（`Esc Button 35×35` + `Background`「物 品 背 包」28px + `Page`：`Prev/Next 33×46` + 页码 `1/1` + `Box 384×192`）
- **12 条绑定全复验**【实测 `parse-pif2`】：`Change→ChangePlayerRobot`、`Shoot→ChangeShootMode`、`Follow→TakeFollower`、`Home→SetFollowerHome`、`Esc→ClosePanel`、`Change Name→OnChangeName`、`InputField→OnValueChanged`、`Dropdown→OnChangeAchievement`、`Prev/Next→OnItemPrevPage/NextPage`、**`Bag→SetActive(Item Bag GO)`**、**`Item Bag.Esc→SetActive(Item Bag GO)`**（双向开关同一子层）。
- **tooltip 五条**【实测 `pif-tips`】：`Bag`=「物品背包」、`Change`=「改变形象 (下次进入地图适用)」、`Home`=「使精灵或动物取消跟随」、`Follow`=「选择跟随的精灵」、`Shoot`=「射击模式」。
- **sprite 解析**【实测 `pif-img2`】：`Bag`=`Panels/PetBag/Sprites/Btn/prop.png`、`Change`=`Panels/PetBag/Sprites/Btn/skin.png`、`Follow`=`Panels/OldPetBag/Sprites/24.png`、`Home`=`Panels/OldPetBag/Sprites/52.png`、`Esc`=`Sprites/Game/Hint Box/Green Esc.png`、`Prev/Next`=`Panels/PetBag/Sprites/Prop/Btn/page.png`、`Arrow`=`StaticResources/Sprites/Map/arrow.png`、`Checkmark`=`Panels/Mailbox/Sprites/check.png`、`Shoot`=`StaticResources/Sprites/Map/menu/shoot.png`（**非本面板素材**）、`Coin/Diamond/Nono/Edit`=本面板 `Sprites/`、立绘初始 `Nono.png`。
- **nono/robot 序列化字段**：`Panel.prefab:3751-3752`（`nonoSprite` guid `3d870443…` = `Nono.png`、`robotSprite` guid `04e56da1…`）。
- **robotSprite 落点**：guid `04e56da1602600447b9b8c0631fe5e8c` 反查 `.meta` ⇒ **`Assets/Resources/Prefabs/Player/idle_1/idle_1_0001.png`**（引用方 = 本预制 / `Map.unity` / `player.prefab` / `idle_1.anim`【实测 grep】，A13）。
- **桥组件**：**`Assets/Scripts/IClass/`**（⚠️ **不在** `MVC/IClass/`）`IInputField.cs` 的 `OnValueChanged:20-22` / `OnEndEdit:24-26` **空实现**（预制绑了 = 死绑定，A14）；`IDropdown.cs` 的 `value` / `SetDropdownOptions`。

## 5. Item Bag 子层 = 道具背包的另一份视图【源码】

- **喂的是 `data.itemBag`**（`PlayerInfoPanel:33`），而 `GameData.itemBag`（`GameData.cs:50-55`）= **`[XmlIgnore]` 属性**：get = `itemStorage.OrderBy(x=>x.id).ToList()`、set = `itemStorage = value` ⇒ **子层喂的是「全 itemStorage 按 id 排序，含货币 1/2」**（子层 = 道具背包的重复视图）。
- **开关**：预制 `Bag` 钮 = 子层 `SetActive(true)`、子层 `Esc` = `SetActive(false)`（`PlayerInfoPanel:34` 初始化时 `SetActive(false)`）。
- **我方道具背包 = `A.state.items`（过滤掉 COIN/DIAMOND 的 `session.js:220-222`）** —— 与上游子层「含货币」的口径差，是本份 **PIQ1** 之源（design §8）：上游这个子层其实和独立的道具背包**同源但多算两枚货币**。
- 我方已有现成道具背包模态 `openRestartItemBag`（`mapScene.js:589-594`，`RESTART_ITEMBAG.create(root, A, {onClose})` 单参 A 型）⇒ Bag 钮复用它（PIQ1 建议 A）。

## 6. 射击消费面【源码 + 实测】

- `PlayerController.OnClickMap`（`PlayerController.cs:37-52`）：`pointerId default` ⇒ `isShootMode ? Shoot() : 走位`；`case -2`（右键）= 翻 `isShootMode`。
- `Shoot`（`:72-81`）：`shootId = (achievement==0) ? 1 : achievement` ⇒ **射击用的道具 = 当前称号**（无称号时兜底 id 1）。
- **我方 `isShootMode` 消费面全仓仅 4 处**【实测 grep】：`session.js:35`（进程级字段，不入档）/ `session.js:452`（`readPlayerData` 的 `shoot` 键）+ `mapScene.js:1105`（`playerData.shoot`）/ `mapScene.js:1268`（`env.mode` = `shoot/normal`）⇒ **翻转面板内无即时画面变化，只影响下次进图的 env mode**（与上游 `sceneData` 进程级 static 同行为）。

## 7. 怪癖与缺口登记（A1–A15；政策 = 决议 ② 声明 + 不照搬）

| # | 症状【证据】 | 说明 / 处置 |
|---|---|---|
| **A1** | `ChangeNameModel.SetAchievement:26-28` = `FindIndex(id==value)+1`：存档里 `achievement` 指向**一个已不在 itemStorage 的 id**（或 0）⇒ 得 `0+1-1=0` 显「无」，**只改显示、不改档值** | **行为照搬**：回填查无 = 显「无」（不伪造、不改档）；只有用户**主动**在下拉里选定才落盘。 |
| **A2** | Item Bag 子层 `SetItemBag(data.itemBag)` + 初始 `SetActive(false)`（`PlayerInfoPanel:33-34`），Bag/Esc 双向 `SetActive`；喂的是**全 itemStorage 按 id 排序含货币** | 与我方 `A.state.items`（不含货币）**口径差** = **PIQ1** 之源；design 定为复用现成道具背包模态（建议 A），**不**新造一份含货币的子层。 |
| **A3** | `TakeFollower:84-87` **上游自身恒弹「该功能尚未实装，敬请期待！」** | 上游都没实装 ⇒ 我方 Follow 钮**诚实提示**（PIQ2 建议 A），绝不伪造跟随者 UI。 |
| **A4** | `SetFollowerHome:89-100` 的"有跟随者"支路本仓**永不可达**（`Player.follower:21` 本仓恒 null） | 我方 Home 钮**只走无跟随者支** = 诚实提示「当前没有跟随中的精灵或动物哦！」（PIQ2）。 |
| **A5** | 货币 `Coin/Diamond` 图标运行时被 `ItemInfo.GetIcon(1/2)`（`PlayerInfoView:34-35`）**覆盖**成 `Items/1.png`/`2.png`；预制里的 `Coin.png`/`Diamond.png` 与占位数值 `2147483647`/`999999` **仅编辑期** | 我方货币图标走 `makeItemIcon(resId 1/2)`（同 shop `currencyChip` 惯例），**不用**预制 `Coin.png`/`Diamond.png`；数值走活读数。 |
| **A6** | 三张统计 PNG（`Own pet num`/`Beat spt num`/`Pet highest level`）**盘上有、预制树未引用** = 遗留素材 | 不搬、不接（上游自己都没用）。 |
| **A7** | `isShootMode` **不落盘**（进程级 `sceneData:37`）+ `SetSceneData` 的 `shootMode` 支 `mapId==990` 时**清 seed 并 return、连模式都不设**（`Player.cs:76-85`）+ 附带改鼠标光标 Aim | 我方**只翻 `session.isShootMode` 布尔**（不落盘，重开回 false）；光标/990 特例**不接**（如实登记，PIQ3）。 |
| **A8** | 立绘 `height` 100/150 规则 + **仅 `type==Equipment(25)` 算装备**（23/24 进下拉但**不算装备**）+ 地图角色同款（`PlayerController.SetMap:62-75`） | 照搬：立绘三态（机器人 / 装备图标 / nono），装备判 `typeId==25`。 |
| **A9** | `PlayerInfoModel:8` 属性 `itemStorage` 在 `shopMode` 为 YiTe 时换 `YiTeRogueData.instance.itemBag`；**常规支真义已核清** = 静态 `Item.itemStorage` 是**存档袋代理**（`Item.cs:32`）⇒ 上游货币与存档同源 | YiTe 换袋支**不接**（本仓不接 YiTe）；常规支货币 = 读存档 `itemStorage`（`Item.Find(1/2)` 同袋），我方对位 = `state.trainer.coins/diamonds`（同源投影）。 |
| **A10** | `ShowCurrency(int coin, int diamond)`（`PlayerInfoController:28-30`）**忽略自己的参数**、照旧读 model（与无参重载 `:24-26` 逐字同）；`GetPlayerEquiment` 拼写（`PlayerInfoPanel:52`） | 死参/拼写 = 上游自身瑕疵，不照搬（我方无对应死参、方法名不沿用拼写错误）。 |
| **A11** | `Name Text`「约瑟传说永不言败」+ `Placeholder`「名字」= **预制占位**（非运行时值） | 运行时读 `data.nickname`（我方读 `session.data.nickname`），占位文本不上屏（或仅作 placeholder 提示）。 |
| **A12** | 按钮 sprite **全借自他面板**（`PetBag`/`OldPetBag`/`Hint Box`/`Mailbox`/`Map`，含 `Shoot` 借 `Map/menu/shoot.png`） | 我方自绘最小 UI，**不搬**这些借用素材（像素级美术归正式美术批）。 |
| **A13** | `robotSprite` 指向 **`Prefabs/Player/idle_1/idle_1_0001.png`**（非本面板目录素材） | 立绘机器人态取这张图；**缺图自陈不伪造**（`mountImg` asset-missing 口径）。 |
| **A14** | `IInputField.OnValueChanged:20-22` / `OnEndEdit:24-26` **空实现** = 预制绑了 = **死绑定**（`IClass/IInputField.cs`） | 我方昵称输入不用这个死桥，InputField 只当编辑态的输入框（`OnEndEdit` 的"第 2 拍"由我方 Change 钮触发，不走 InputField 回调）。 |
| **A15** | 底栏场景 GO 名 **`Bag`** vs 面板名 **PlayerInfo** 不一致；**双入口**（底栏 Bag + 点玩家 `OpenPlayerInfoPanel`） | 命名陷阱只登记；**第二入口（点玩家）本仓无对应**（角色非可点目标）⇒ 不实现。 |

---

## 8. 交 design 的输入清单

1. **面板形状**：480×320 居中；昵称行（名 + 输入框 + Edit/Mark）/ 称号下拉（「无」+ 称号族 18 条，type 降序 id 升序）/ 立绘三态 + Change/Shoot/Bag/Follow/Home 五钮 / 货币活读数（coin 1 / diamond 2）/ Item Bag 子层。
2. **昵称两拍**：第 1 拍进编辑、第 2 拍取值（空 ⇒ Hintbox「昵称不能空白」不退出编辑；非空 ⇒ 落盘 + 翻回 + 同步我方 `state.trainer.name`）。
3. **称号下拉**：三类（23/24/25）都进、立绘只认 25；回填查无 = 显「无」（A1）；选定落盘 + 重绘立绘。
4. **货币**：`state.trainer.coins/diamonds` 活读数，图标 `makeItemIcon(1/2)`（A5）。
5. **立绘三态 + Change**：机器人 / 装备图标（typeId==25）/ nono；`useRobotAsPlayer` 翻转落盘。
6. **Shoot**：翻 `session.isShootMode`（不落盘、进程级），按钮视觉态自陈，光标/990 特例不接（A7）。
7. **Bag / Follow / Home**：Bag = 复用 `openRestartItemBag`（PIQ1）；Follow/Home = 诚实提示（PIQ2，A3/A4）。
8. **双入口**：只接底栏 `info` 钮（我方 `handler:'onInfo'`）；点玩家入口不接（A15）。
9. **要拍板的设计位**（本文件只列形状、不定行为）：**PIQ1**（Bag 口径：复用现成道具背包 vs 造含货币子层）/ **PIQ2**（Follow/Home 诚实提示）/ **PIQ3**（Shoot 翻转不落盘 + 不接光标/990）/ **PIQ4**（昵称两拍照搬 + `state.trainer.name` 同步）—— 四条在 `playerinfo-design.md §8` 定为**待拍板 PIQ1–4**（**不是**全局决议 ①–⑨）。
