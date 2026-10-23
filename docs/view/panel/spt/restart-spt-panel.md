# 代码分析：重启的上游是怎么实现"SPT Boss 面板（SPTBoss）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；住本面板子目录 `docs/view/panel/spt/`，见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制/场景/发行数据里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **C3 地图/世界族**（`docs/view/view-design.md §8` 表 C3 行；同族先例 = `docs/view/panel/worldmap/`、`docs/view/panel/minimap/`）+ 面板栈 **A2 `docs/view/mech/view-panel-stack.md`**（`OpenPanel`/`SetPanelIdentifier`）+ 底栏入口钮 = **B1 `docs/view/scene/room/view-scene-hud-design.md`**（R6 底栏 SPT 钮，`challenge/spt.png`）+ 传送语义 = **M5 `docs/map/map-teleport.md`**（六入口表第 5 入口"面板 `GoToMap`"，与大地图同一入口）+ SPT **战斗侧**（`BattleMode.SPT=3`）**不在本份**（引擎/地图线口径，见 §7 A7）。
> **路径口径**：上游代码/资产路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 本次可复算（解析预制 byte 数组 / guid 反查 / 目录清点）；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A8**，引用**必须带文件名**）；目标行为未定的写"待定 + 指针到 design"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；评审通过后进入 `spt-design.md` → `spt-impl.md` → 代码（`AGENTS.md §1`）。

---

## 0. 一句话结论

**SPT 面板是一台"三页大陆分布图 + 静态 boss 摆位"的目录板，代码薄（35 行 + 34 行）、真相全在预制里**。
脚本侧 = `Panels/SPTBoss/Scripts/`：`SPTBossPanel.cs` 只管**三页显隐**（`SetPage(i)`）和 `[page=N]` 参数；`SPTBossPageController.cs` 把**手摆在预制里的三对 `List<int>`（bossId / mapId / 按钮）**逐只绑成"换头像 + 悬浮报名 + 点击传送"。
出路 = `Module.GoToMap(mapId)` ⇒ `TeleportHandler.Teleport`（`Scripts/MVC/View/Basic/Module.cs:10`）—— **与大地图面板同一条直切链，零门禁、零奖励、零写档**；"SPT 之战"本身发生在**传送过去之后的地图上**（NPC/野怪触发，`<mode>=3` 那 138 条分支归地图线 MB7 链），面板只是"去哪找 boss"的目录。
入口两个：① 底栏 SPT 钮 ⇒ `MapMenuController.OpenSPTPanel()`（**带"按当前图定位初始页"**）；② 全仓地图 XML 里 **仅 1 条** `openPanel SPTBoss[page=2]`（`Data/Maps/10001.xml:70`，飞船舱传送站）。

我方对应物今天 = **占位三件**：HUD `restartHudView.js:77` 的 `spt` 钮（无 handler ⇒ 落 `面板待建` logLine）、`mapScene.js:320` `ACT_UNBUILT` 名单里的 `'SPTBoss'`、`mapScene.js:1118` openPanel sink 的"未接面板"分支。**钮在、名单在、链在 —— 缺面板本体与其 18 行表**。

---

## 1. 入口与初始页【源码】

`Scripts/MVC/Controller/Map/Components/MapMenuController.cs:39-48`：

```csharp
public void OpenSPTPanel() {
    var panel = Panel.OpenPanel<SPTBossPanel>();
    var page = Player.instance.currentMap.worldId + 1;
    if (page <= 1) page = Player.instance.currentMap.categoryId <= 10 ? 0 : 1;
    panel?.SetPage(page);
}
```

- 场景接线：底栏 `SPT` 节点（`view-scene-hud-design.md` R6：`challenge/spt.png`，图标烘「SPT」字）→ `MapMenuController.OpenSPTPanel`。
- **初始页 = 当前图"世界"**：`Map.worldId = IsMod(id) ? 0 : (categoryId-1)/100`（`Scene Specific/Map/Map.cs:22`）。派生：
  - `category 1..10`（北半球各图）⇒ worldId 0 ⇒ page=1 ⇒ 回落规则 ⇒ **页 0 北半球**；
  - `category 11..99`（南半球各图 + **要塞/门 100 也算这**：(100-1)/100=0、100>10 ⇒ 页 1，见 A2）⇒ **页 1 南半球**；
  - `category 101..200`（**飞船舱 101–105** + 帕诺星图 102 + 太空站 200）⇒ worldId 1 ⇒ **页 2 派诺星系**；mod 图强制 worldId 0 ⇒ 按 category 落页 0/1。
  - 派诺页的 boss 图 `category` 全是 **102**【实测 `10017.xml:1`】。
- 发行数据里的 category 全集 = `1..16,100..105,200`【实测：272 张 `Data/Maps/*.xml` 根元素清点】⇒ `page=3` 起不到达（预制只有 3 页，越界 = 三页全隐，见 §7 A5）。
- **第二入口**：`Data/Maps/10001.xml:66-72` 传送站 NPC 的 `<button type="click"> <action>openPanel</action> <param>SPTBoss[page=2]</param>`【实测：全 272 张仅此 1 条 SPTBoss】⇒ 走 M2/M3 那台 `resolve→run` 机的 `openPanel` 动作（我方已有 sink：`game/app/scenes/mapScene.js:1118`）。
- `SPTBossPanel.SetPanelIdentifier`（`:17-29`）认 **`page`** 一个键：`int.Parse(param)` ⇒ `SetPage` —— **非法值直接抛**（无 TryParse；A6）。
- 活动表里也有 1 条 `linkId=SPTBoss`（`game/data/unity/activities.json`【实测】，与 `docs/view/panel/activity/restart-activity-panel.md §4` 的 38 只命名面板一致）⇒ 活动面板"去参加"该条时经 `handlePanelLink` 到达本面板。

## 2. 本体：两台脚本（69 行）【源码】

### 2.1 `SPTBossPanel.cs`（35 行）—— 翻页壳

- `[SerializeField] List<GameObject> bossPageObjects`（3 个页节点）；
- `SetPage(page)`：`SetActive(i == page)` —— **互斥显隐，无动画、无状态**；
- `SetPanelIdentifier("page", N)` ⇒ `SetPage(N)`。

### 2.2 `SPTBossPageController.cs`（34 行）—— 每页一台"摆位机"

挂在**每个页节点**上，字段 = 三对**手摆 List**（`bossId` / `mapId` / `bossButtonList`）。`Init()` 逐只 i：

1. `Pet.GetPetInfo(bossId[i])` ⇒ null ⇒ **该按钮隐藏**（`:17-21`，防御在，发行数据 18 只全命中 pets.json【实测，见 §3】）；
2. `SetSprite(info.ui.idleImage)` —— 预制里按钮图 = `Resources/Sprites/Empty.png`（guid `07a46f38…`【实测】），运行时换成该宠 **idle 立绘**；
3. `onPointerEnter/Exit` ⇒ `SetInfoPromptActive(true/false)`、`onPointerOver` ⇒ `ShowBossInfo(info.name)` —— **悬浮出信息提示盒**（A3 `infoPrompt` 机制，与 HUD/大地图同件）；
4. `onPointerClickEvent` ⇒ `GoToMap(mapId[i])` —— **动态监听**。

⚠️ 关键怪癖：`IButton.onPointerClickEvent` 是 **`[SerializeField] public UnityEvent`**（`Scripts/IClass/IButton.cs:23`），预制里 **8 只按钮带烘死的 persistent call**（`GoToMap(10038/10040/193)`），而 `SetListener`（`Scripts/Helper/HelperUI.cs:395-402`）= `RemoveAllListeners()+AddListener` —— **只清动态监听、不清 persistent** ⇒【推断】**双发传送**，详见 §7 A1。

## 3. 18 只 boss 全表【实测：逐字节解析 `Panels/SPTBoss/Panel.prefab` 的 `bossId/mapId` byte 数组（小端 int32）+ 逐节点 RectTransform】

页名取预制 TMP 文本：`北半球 / 南半球 / 派诺星系`（`m_Text:` `"\u5317\u534a\u7403"` 等【实测】；页节点名 = `North SPT / South SPT / Pano SPT`）。
宠物名 = `game/data/unity/pets.json` 按 id 解析【实测，18/18 命中】；目标图名 = 各 `Data/Maps/<id>.xml` 根 `name`【实测】。
坐标 = **中心锚**（anchor 0.5）下"父节点 anchoredPos + 按钮相对位"，单位 Unity 像素（y 向上）；面板根 **800×500**。

### 3.1 页 0 · 北半球（bg = `Sprites/520.png` 559×259；页偏移 (0, −60)）

| # | bossId | 宠名 | mapId | 目标图（category） | 父节点名 | 父位 | 按钮位 | 按钮尺寸 |
|---|---|---|---|---|---|---|---|---|
| 1 | 17 | 布鲁托 | 142 | 巨石洞穴 (2) | `Pluto` | (−120,105) | (20,60) | 176×144 |
| 2 | 31 | 阿卡纳斯 | 193 | 悲伤残骸 (3) | `Arcanas` | (−260,30) | (30,70) | 242×176 |
| 3 | 38 | 霍克努尔 | 270 | 魅罗门 (4) | `Hoknure` | (−260,−110) | (−20,30) | 128×125 |
| 4 | 57 | 麦麦迪 | 152 | 水仙溪口 (2) | `Maimaidi` | (−95,−130) | (0,60) | 160×130 |
| 5 | 80 | 巨锤莫古 | 530 | 黑岩旋梯 (6) | `Big Hammer Mog` | (30,−90) | (0,50) | 129×84 |
| 6 | 82 | 沙皇鸟 | 370 | 海市蜃楼 (6) | `Sand King Bird` | (145,−150) | (0,50) | 88×120 |
| 7 | 127 | 卡尼娅 | 404 | 冰晶矿场 (5) | `Carnia` | (265,−85) | (15,40) | 110×133 |
| 8 | 157 | 菲亚斯 | 423 | 遗忘之岛 (7) | `Fieas` | (245,75) | (0,25) | 147×125 |
| 9 | 215 | 艾丽希斯 | 790 | 微光湖畔 (9) | `Alicis` | (85,120) | (0,40) | 207×222 |

### 3.2 页 1 · 南半球（bg = `Sprites/524.png` 544×255；页偏移 (0, −60)）

| # | bossId | 宠名 | mapId | 目标图（category） | 父节点名 | 父位 | 按钮位 | 按钮尺寸 |
|---|---|---|---|---|---|---|---|---|
| 10 | 248 | 卡多斯 | 910 | 神风祭台 (11) | `Pluto` | (−260,60) | (0,60) | 114×154 |
| 11 | 401 | 特米提 | 1220 | 虫穴地牢 (12) | `Hoknure` | (−170,−110) | (−40,30) | 200×150 |
| 12 | 895 | 梵尔尼 | 1290 | 超源氏族主城 (13) | `Arcanas` | (−60,0) | (80,50) | 214×180 |

### 3.3 页 2 · 派诺星系（bg = `Sprites/线路.png` 1469×510；页偏移 (0, −30)）

| # | bossId | 宠名 | mapId | 目标图（category） | 父节点名 | 父位 | 按钮位 | 按钮尺寸 |
|---|---|---|---|---|---|---|---|---|
| 13 | 10047 | 蘑菇怪 | 10038 | 克洛斯星林间 (102) | `Mushroom` | (−310,20) | (0,50) | 128×140 |
| 14 | 10034 | 钢牙鲨 | 10022 | 海洋星海底 (102) | `Shark` | (−260,−100) | (0,50) | 140×120 |
| 15 | 10042 | 里奥斯 | 10017 | 火山星深处 (102) | `Deer` | (−175,−9) | (0,70) | 142×165 |
| 16 | 10069 | 提亚斯 | 10027 | 云霄星最高层 (102) | `Bird` | (−90,80) | (0,70) | 158×207 |
| 17 | 10070 | 雷伊 | 10032 | 赫尔卡星荒地 (102) | `Lei` | (15,25) | (5,100) | 134×256 |
| 18 | 10050 | 阿克希亚 | 10040 | 塞西利亚星冰原 (102) | `Ice` | (115,50) | (0,100) | 141×184 |

- **18 张目标图全部在盘**【实测：`Data/Maps/*.xml` 存在性逐 id 验证】；
- **18 张头像 PNG 全部在盘**【实测：`Resources/Pets/icon/{petId}.png`（镜像根，与图鉴头像同通道 `game/app/view/panels/battle/_kit.js:46`）】；
- 父节点 = 各 boss 自家图的**星球/氏族定位图标**，美术**复用大地图面板的 sprite 集**（guid 反查【实测】：`Ocean/飛翼/火幻/冰沁/沙爪/地月/蟲/風/Klose/Volacano.png` = `Resources/Panels/WorldMap/Sprites/**` + `StaticResources/Sprites/Map/go.png` + `Sprites/Game/Hint Box/Green Esc.png`）。

## 4. 画面构成（预制层级）【实测】

```
Panel (800×500)
 ├─ Background（背景.png 1935×1158，整板底）
 ├─ 页 North SPT  ← bg 520.png（北半球大陆线稿）+ 9 组「父图标 + Boss 按钮(Empty→idleImage)」
 ├─ 页 South SPT  ← bg 524.png（南半球大陆线稿）+ 3 组
 ├─ 页 Pano SPT   ← bg 线路.png（帕诺星系线稿）+ 6 组 + Icon（SPT.png 144×142 角标）
 ├─ Region（三页签钮：North→SetPage(0) / South→SetPage(1) / Pano→SetPage(2)）
 └─ Esc Button（Green Esc.png，关面板）
```

- 静态文案节点（TMP）：`北半球 / 南半球 / 派诺星系 / 挑战 1 / 挑战 2 / 普通 / 等级 / 位置`【实测 `m_Text:` 8 条】—— 后四条是叠在线稿上的**图例/装饰文字**（节点名 `Challenge 2/Normal/Level/Position`）【推断：无脚本引用，纯文本】。
- 悬浮名走**共享 `infoPrompt`**（`UIModule`），**不画常驻名牌**；面板内**无选中详情区、无奖励说明、无每周/次数记录 UI**【实测：脚本 69 行里没有这些东西】。

## 5. 出路终点：`GoToMap ⇒ TeleportHandler.Teleport`【源码】

与 `WorldMap/MiniMap` 面板**同一入口 #5**（`docs/map/map-teleport.md` 六入口表）：直切、无两步走位、无门禁；`mapId==0` 类"暂未开放"分支**本表不存在**（18 只 mapId 全非 0【实测】）。我方消费端 = `mapScene.js` 的 `runTeleport`（MB5 已落，`decideTeleport → gotoMap`）。

## 6. 面板不碰的东西（防"顺手实现"）

- **存档**：面板零读零写（脚本无 SaveSystem 触点）；"打过几只 SPT"的 **`Beat spt num.png`** 只是 `Panels/PlayerInfo/Sprites/` 里一张**装饰图**【实测路径存在】，本面板无计数机制。
- **活动袋**：地图条件里 `activity[spt]` 173 次（`docs/map/map-condition.md §3`）属**地图线键值袋**；SPTBoss 面板**不读袋、不写袋**。
- **SPT 战斗规则**：`BattleMode.SPT=3`（`BattleSettings.cs:190`）的 `<mode>` 138 条分支、`Special=4` 61 条 ⇒ 引擎/地图线口径（`docs/map/map-battle-trigger.md`），本面板只负责"把你送到那张图"。

## 7. 怪癖与缺口登记（A1–A8，本报告内部编号；政策 = 决议 ② **声明 + 不照搬**）

| # | 内容 | 证据 |
|---|---|---|
| **A1 · persistent/dynamic 双发** | 8 只 Boss 按钮的 `IButton.onPointerClickEvent` 里**烘有 persistent `GoToMap` 调用**，其中 **5 只与 §3 表冲突**：钢牙鲨(表 10022/烘 10038)、雷伊(10032/10038)、提亚斯(10027/10038)、里奥斯(10017/10038)、梵尔尼·南页(1290/193)；另 3 只恰好同值（阿克希亚 10040、蘑菇怪 10038、阿卡纳斯 193）。`SetListener` 只清动态监听 ⇒【推断】点击会 **persistent 先、dynamic 后各发一次 Teleport**（先烘值后表值；两次场景切换谁最终落地 = 引擎时序决定）。目标行为 = 待定 ⇒ **design 本份待拍板** | 【实测】预制逐 block 解析 + `IClass/IButton.cs:23` + `Helper/HelperUI.cs:395-402` |
| **A2 · 要塞/门系列开面板落"南半球"页** | `category=100` = **要塞/门**（英格瓦要塞 `81`、经验之门 `82`…【实测】，HUD 要塞钮的 `worldId*10000+81` 链也落这类图）⇒ `(100-1)/100=0` ⇒ page=1 ⇒ `100>10` ⇒ **页 1 南半球**；相邻的 `category=101..105`（飞船舱/传送站）⇒ worldId 1 ⇒ **页 2 派诺**。**同一族"非大陆"图，100 与 101 仅差 1、初始页差两档**，且要塞在阿卡迪亚**北**半球、落南页可疑（【推断】上游 category 分档 off-by-boundary）。照搬性待定 ⇒ design | 【源码】`MapMenuController.cs:42-44` + `Map.cs:22`；【实测】`Data/Maps/81.xml:1` 起 |
| **A3 · 节点名 = 英文/拼音黑话** | `Pluto/Arcanas/Hoknure/Maimaidi/…` 与中文宠名不成一一对应（还跨页**复名**：南北页都有 `Pluto`/`Arcanas`/`Hoknure` 节点但装的是不同 boss）⇒ 我们数据用 §3 表（宠名 + mapId），不沿用节点名（同 worldmap 报告 A9 口径） | 【实测】prefab 逐节点 |
| **A4 · 按钮图运行时才换上** | 预制里 18 只按钮 = `Sprites/Empty.png` 空图，**编辑态看不见摆位**；真图 = `info.ui.idleImage`。若 `GetPetInfo` 缺 ⇒ 按钮整个隐藏（本表 18/18 命中、触发不了） | 【实测】guid 反查 + `SPTBossPageController.cs:16-23` |
| **A5 · `SetPage` 越界 = 白板** | `page` 出 `[0,3)` ⇒ 循环没有命中项 ⇒ **三页全隐**（`bossPageObjects[i]?.SetActive(i==page)`）。发行数据算不出越界（§1 category 全集验证），但 `[page=9]` 这类**外部参数可达**（活动/未来配置）。目标行为 = 待定 ⇒ design | 【源码】`SPTBossPanel.cs:31-34` |
| **A6 · `[page=…]` 非法值抛异常** | `int.Parse(param)` 无 TryParse ⇒ `SPTBoss[page=abc]` 在 SetPanelIdentifier 就抛（A2 面板栈的容错口径未知，按现状登记）。目标行为 = 待定 ⇒ design | 【源码】`SPTBossPanel.cs:25` |
| **A7 · 面板 ≠ SPT 战斗** | 上游没有任何"SPT 规则"在本面板里（`BattleMode.SPT=3` 走 `SpriteKingPanel.cs:151/199` 与地图 `<mode>` 分支、`docs/map/map-battle-trigger.md`）。本面板 = 目录板。⚠️ 不许被读成"SPT 已实装战斗" | 【源码】`SpriteKingPanel.cs` + grep 全仓 `BattleMode.SPT` |
| **A8 · 孤儿资产** | `Sprites/522.png`（51×51）**预制零引用**（guid `24bccbbb…` 在本 Panel.prefab 无命中【实测】）；`线路/背景` 两张大图尺寸（1469×510 / 1935×1158）**大于面板可视区** ⇒ 上游当"整张大陆图"裁着用 | 【实测】guid 反查 |

## 8. 交下一环（`spt-design.md`）的输入清单

1. **18 行表**（§3）→ design 的内容真值（静态表，同 worldmap 块表纪律，不许运行时现编）；
2. **A1 双发** → 待拍板"单发 = 表值"目标行为；
3. **初始页规则（§1）+ A2/A5/A6** → 待拍板照搬/订正 + 越界/非法参数兜底；
4. **画面构成（§4）** → 版式选型（复刻线稿摆位 vs 宫格列表，同 WMQ4 先例）；
5. **入口两件**（底栏钮 + `SPTBoss[page=2]` + 活动 linkId）→ 接线面 = `restartHudView.js` `spt` 钮 handler、`mapScene.js` `handlePanelLink`/`ACT_UNBUILT`、openPanel sink；
6. **素材可得性**（§3 注：头像 18/18、面板 PNG 在 `Assets/Resources/Panels/SPTBoss/Sprites/` 且已入库【实测 `git ls-files`】）→ 零新素材约束成立。
