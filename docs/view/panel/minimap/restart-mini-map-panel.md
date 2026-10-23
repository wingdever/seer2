# 代码分析：重启的上游是怎么实现"小地图面板（`MiniMap{categoryId}` 一族）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住本面板的子目录 `docs/view/panel/minimap/`，见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制/场景**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制/场景/发行数据里能观察到什么"查清并钉死。
> **线/族**：View 线 **C3 地图/世界族**（`docs/view/view-design.md §8` 表 C3 行）的**第二份成文**；同族第一份 = **世界地图（大地图）** = `docs/view/panel/worldmap/`（三文齐、WM-a/WM-b 已落码）。本族入口钮与 C3·WorldMap 的 `globe` 钮同处 Map Corner（`docs/view/scene/room/view-scene-hud-design.md`）。
> **需求源**：人类 2026-10-19 点名 —— **"实现各个小地图的功能"**；四项口径同日拍板（范围 = 整族 11 块 / 交互 = 照上游"能点的才点" / 缺面板的图 = 提示"该区域暂无小地图"不弹 / 画面 = 用上游 PNG 拼），正本见 `docs/view/panel/minimap/minimap-design.md §8`。
> **父 / 邻**：面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**（`Panel.OpenPanel` 的对位）；传送语义 = **M5 `docs/map/map-teleport.md`**（六入口表第 5 入口"面板 `GoToMap`"，本族与大地图**共用同一条链**）；同族前例 = `docs/view/panel/worldmap/restart-world-map-panel.md`（下称**大地图报告**，其 **A8/A10** 与本份直接相关）。
> **路径口径**：上游代码/预制路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方代码相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 可复算的数字或可复跑的 grep；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A12**，**各自从 A1 起**，引用**必须带文件名**）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；评审通过后进入 design → impl → 代码。

---

## 0. 一句话结论

**上游的"小地图"不是一张图，而是 11 块按 `categoryId` 分档的独立面板预制（`Resources/Panels/MiniMap{1,2,3,4,5,6,7,9,11,12,100}/Panel.prefab`），一共摆了 113 个可点热区（112 个不同目的地 + 1 个 `mapId=0`）；点热区 = `Module.GoToMap(mapId)` ⇒ `TeleportHandler.Teleport(mapId)`，与大地图面板走的是同一条传送链。HUD 右上角那把 25×25 的钮只调一个函数：`Panel.OpenPanel("MiniMap" + categoryId)`，**预制不存在就一律回退到飞船图 `MiniMap1`**（⇒ 272 张图里 77 张 = 28% 点开看到的是飞船蓝图）。**【实测】**

---

## 1. 入口：Map 场景 HUD 的第二把角标钮【源码 + 实测】

- 全仓**只有一个调用点**：`Scenes/Map.unity:21419` 的持久化事件 → `m_MethodName: OpenMiniMapPanel`【实测：`grep -rn "OpenMiniMapPanel"` 全仓 = 2 命中（场景 1 + 定义 1）】。
- 定义 = `Scripts/MVC/Controller/Map/Components/MapWorldController.cs:23-34`【源码】：

  ```csharp
  public void OpenMiniMapPanel() {
      int categoryId = Player.instance.currentMap.categoryId;
      if (Map.IsMod(Player.instance.currentMapId) && SaveSystem.TryLoadPanelMod("MiniMap" + categoryId, out _)) {
          Panel.OpenPanel("[Mod]MiniMap" + categoryId);
          return;
      }
      Panel panel = Panel.OpenPanel("MiniMap" + categoryId);
      if (panel == null)
          Panel.OpenPanel("MiniMap1");
  }
  ```

- `categoryId` 的来源 = 地图 XML 根节点的 `category="N"`（我方桥同源：`game/logic/map/parse-map.js:265` 的 `category`）。
- 同文件的 `OpenWorldMapPanel()`（`:12-21`）= 大地图报告 §1 的那把 `globe` 钮；**两把钮成对住在 Map Corner**，我方 HUD 已把两个占位钮都摆好（`game/app/view/hud/restartHudView.js` 的 `rbh-globe` 已接线、`rbh-minimap` 仍是 `todo('小地图')`）。

---

## 2. 面板机：一块预制 = 一个类目，没有"翻页"也没有"标识符"【源码 + 实测】

| 维度 | 上游事实 | 证据 |
|---|---|---|
| 面板命名 | `MiniMap` + `categoryId` 直接当面板名 | 【源码】`MapWorldController.cs:31` |
| 分页 | **无**（一块预制就是一屏） | 【实测】11 块预制内无任何"上一页/下一页"节点（对比：大地图有 `WorldMapPanel.cs` 的翻页机） |
| `SetPanelIdentifier` | **不调**（大地图用它选页，小地图没有页可选） | 【源码】`MapWorldController.cs:20` 只在 `OpenWorldMapPanel` 里出现 |
| 预制数 / 覆盖类目 | **11 块**：`1,2,3,4,5,6,7,9,11,12,100`（**没有 8/10/13/14/16/101…105/200**） | 【实测】`ls Resources/Panels/MiniMap*` |
| 发行数据里的类目 | **22 个**（272 张图） | 【实测】扫 `Resources/Data/Maps/*.xml` 的 `category` |
| 有面板的图 / 无面板的图 | **195 / 77**（77 = 28%） | 【实测】下表 §2.2 |
| 面板框尺寸 | 9 块 = **720×420**；`MiniMap1`/`MiniMap100` = **710×440** | 【实测】内层 `Panel` 节点 `m_SizeDelta` |
| 摆位 | 外层 `Panel` 拉满屏（anchor `0,0→1,1`、`sizeDelta 10,10`）+ 内层 `Panel` **居中**（anchor 全 `0.5`、`anchoredPosition 0,0`） | 【实测】`MiniMap2/Panel.prefab` 两个 `!u!224` |

### 2.1 脚本侧：两块面板**根本没有脚本**【源码】

- `Resources/Panels/WorldMap/Scripts/MiniMapPanel.cs` = **9 行空壳**（`public class MiniMapPanel : Panel { }`，无字段无方法）；
- `Resources/Panels/MiniMap1/Scripts/MiniMapShipPanel.cs` = 同样空壳；
- 其余 9 块面板**连脚本都没有**：面板的全部行为 = **预制里摆的持久化事件**（`Button.onClick` / `PointerEnter/Exit/Over`）。
- 热区身上的组件 = `MapBlockView`（`Scripts/MVC/View/Map/MapBlockView.cs`，字段 `infoPrompt`/`button`/`titleObject`，方法 `SetInfoPromptActive`/`SetInfoPromptText`/`SetTitleActive`/`OpenModMapPanel`）+ 继承自 `Module` 的 **`GoToMap(int mapId) => TeleportHandler.Teleport(mapId)`**（`Scripts/MVC/View/Basic/Module.cs:10`）【源码】。

### 2.2 类目覆盖表（272 张图按 `category` 分档）【实测】

| `category` | 图数 | 有小地图面板？ | `category` | 图数 | 有小地图面板？ |
|---|---|---|---|---|---|
| 1 | 28 | ✅ `MiniMap1` | 11 | 10 | ✅ `MiniMap11` |
| 2 | 46 | ✅ `MiniMap2` | 12 | 8 | ✅ `MiniMap12` |
| 3 | 17 | ✅ `MiniMap3` | 13 | 7 | ❌ → 回退 `MiniMap1` |
| 4 | 15 | ✅ `MiniMap4` | 14 | 2 | ❌ → 回退 `MiniMap1` |
| 5 | 16 | ✅ `MiniMap5` | 16 | 1 | ❌ → 回退 `MiniMap1` |
| 6 | 20 | ✅ `MiniMap6` | 100 | 8 | ✅ `MiniMap100` |
| 7 | 14 | ✅ `MiniMap7` | 101 | 15 | ❌ → 回退 `MiniMap1` |
| 8 | 5 | ❌ → 回退 `MiniMap1` | 102 | 28 | ❌ → 回退 `MiniMap1` |
| 9 | 13 | ✅ `MiniMap9` | 103 | 1 | ❌ → 回退 `MiniMap1` |
| 10 | 11 | ❌ → 回退 `MiniMap1` | 104 | 2 | ❌ → 回退 `MiniMap1` |
| | | | 105 | 1 | ❌ → 回退 `MiniMap1` |
| | | | 200 | 4 | ❌ → 回退 `MiniMap1` |

> ⚠️ **`MiniMap1` 的双重身份**：它既是"飞船（category 1）的舱室图"，又是**全类目的兜底图** ⇒ 一个从 太空站/牧场/梦境/活动图 进来的玩家点右上角，看到的都是**飞船舱室 + 8 个飞船传送点**（§7 **A1**）。

---

## 3. 一块小地图由什么画成：五类图层【实测】

解析口径：逐 `!u!224`（RectTransform）按 Unity 规则把 `anchor/pivot/anchoredPosition/sizeDelta` 折算成**面板内绝对像素**（原点 = 面板框左上、y 向下）。下表矩形都是这个口径，**下文 §3.x 的逐块真值表同口径**。

| 图层 | 节点名 | 素材 | 作用 |
|---|---|---|---|
| 底图 | `Background` | `MiniMap1/Sprites/2.png`、`MiniMap100/Sprites/1.png`（两块大图为整幅底） | 飞船/要塞的**整幅剖面图**（标题烘焙在图里） |
| 路径图 | `Path` | `MiniMap{cat}/Sprites/*`（`path.png` / `1.png` / `29.png` / `8.png` / `1 10.png`） | 氏族图的**路线连线图**（区域之间的连线） |
| 节点点 | `Spot` ×N | `StaticResources/Sprites/Map/spot.png`（22×21） | 路线上的**圆点装饰**（数量 ≠ 热区数，见 §7 **A6**） |
| 标题条 | `Title Bar/Background` + `Text (TMP)` | `StaticResources/Sprites/Map/map title.png`（151×36）+ 预制内**硬编码中文** | 页标题（`草目氏族`…）；`y = -3` **压出框顶** |
| 关闭钮 | `Esc Button` | `Sprites/Game/Hint Box/Green Esc.png`（35×35）/ `cancel.png`（81×31，仅 `MiniMap1`） | 调 `Panel.ClosePanel` |
| 热区 | `Minimap Region` 实例 / `ShipMapBlock` 实例 / 内联 `Button` | 每区一个**线稿图标**（`MiniMap{cat}/Sprites/*.png`）+ 区名文字 | 见 §4 |

**热区图标不是"透明方块"**：`Minimap Region.prefab` 的根节点带一个 `Image`（默认色 `rgba(0.32,0.90,0.98,1)` = 青色乘色），每个实例用 `m_Sprite` override 换成**本区专属线稿**（实测 **113 个热区里 111 个有图标、2 个沿用 prefab 默认**）；图标像素与热区矩形 **75 个逐像素吻合、27 个被拉伸**（差几像素）。⇒ 上游的小地图**看得见"每个区画了什么"**，不是纯文字列表。

---

## 4. 热区与出路：113 个可点方块，全走 `GoToMap`【实测】

- 事件形状（`Minimap Region.prefab` 根节点 `Button`）：
  - `onClick` → `MapBlockView.GoToMap(int mapId)` ⇒ **`TeleportHandler.Teleport(mapId)`**（`Module.cs:10`）【源码】；
  - `onPointerOver` → `SetInfoPromptText(string)`、`onPointerEnter/Exit` → `SetInfoPromptActive(bool)` ⇒ 悬停弹**共享的 `Info Prompt`**（`Resources/Prefabs/Info Prompt.prefab`：黑底 + 白字，跟随鼠标 `+(10,2)`、按文字自动尺寸，`InfoPrompt.cs:SetInfoPromptWithAutoSize`）【源码】；
  - 区名文字 = 热区根节点上方的 `Title` 子节点（`120×25`、字号 16、白字、**默认压在热区上沿之上**），文字内容由实例的 `m_text` override 给出。
- **与大地图面板的差别**：大地图块用 `SetTitleActive` 切显隐、有 `mapId=0` 的"暂未开放"位；小地图**不用** `SetTitleActive`（实测 11 块里 `SetTitleActive` 命中 **0**），`mapId=0` 只有 **1 个**（`MiniMap100` 的 `Lonely` 门）。
- **目的地对账**：113 个热区 ⇒ **112 个不同 `mapId` + 1 个 `0`**；**112 个全部在 `Resources/Data/Maps/` 有对应 `<id>.xml`（悬空 = 0）**【实测】。其中含 **8 个负 id 飞船舱**（`-10` 船长室 … `-80` 游戏室）与 **`-70` 夜间传送舱**。
- **没有任何门禁**：预制里没有等级/任务/活动条件，`GoToMap` 直接 `Teleport`（与大地图报告 §5 同一条结论）。

### 4.1 逐块真值表（11 块 × 图层 + 热区）【实测】

**MiniMap1** · category `1` · 面板框 **710×440** · 页标题 `（无）`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Background` | `Resources/Panels/MiniMap1/Sprites/2.png` | 709×438 | 1 | 0,0,710,440 |
| `Esc Button` | `Resources/Sprites/Game/Hint Box/cancel.png` | 81×31 | 1 | 314.5,384,81,31 |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Instructor` | — | `-60` | `（无 override ⇒ prefab 默认）` | 17,19,201,122 | 57.5,-6,120,25 |
| `Data` | — | `-30` | `Resources/Panels/MiniMap1/Sprites/81.png` | 17,219,201,122 | 57.5,194,120,25 |
| `Experiment` | — | `-20` | `Resources/Panels/MiniMap1/Sprites/9.png` | 17,319,201,122 | 57.5,294,120,25 |
| `Mechanic` | — | `-50` | `Resources/Panels/MiniMap1/Sprites/55.png` | 17,119,201,122 | 57.5,94,120,25 |
| `Captain` | — | `-10` | `Resources/Panels/MiniMap1/Sprites/43.png` | 547,19,201,122 | 587.5,-6,120,25 |
| `Power` | — | `-40` | `Resources/Panels/MiniMap1/Sprites/32.png` | 547,319,201,122 | 587.5,294,120,25 |
| `Teleport` | — | `-70` | `Resources/Panels/MiniMap1/Sprites/94.png` | 547,119,201,122 | 587.5,94,120,25 |
| `Game` | — | `-80` | `Resources/Panels/MiniMap1/Sprites/106.png` | 547,219,201,122 | 587.5,194,120,25 |

**MiniMap2** · category `2` · 面板框 **720×420** · 页标题 `草目氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap2/Sprites/path.png` | 567×285 | 1 | 76.5,97.5,567,285 |
| Spot … Spot (15) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 16 | 464,229.5,22,21；309,249.5,22,21；199,249.5,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Marsh` | 深幽沼泽 | `133` | `Resources/Panels/MiniMap2/Sprites/33.png` | 158,47.5,64,65 | 130,22.5,120,25 |
| `Cave` | 巨石洞穴 | `142` | `Resources/Panels/MiniMap2/Sprites/1.png` | 587.5,64.5,105,91 | 580,39.5,120,25 |
| `River` | 水仙溪口 | `152` | `Resources/Panels/MiniMap2/Sprites/29.png` | 25.5,85,109,90 | 20,60,120,25 |
| `Thorn Trail` | 荆棘小徑 | `132` | `Resources/Panels/MiniMap2/Sprites/36.png` | 246.5,53.5,67,63 | 220,31.5,120,25 |
| `Cliff` | 幻影崖 | `141` | `Resources/Panels/MiniMap2/Sprites/5.png` | 519.5,150.5,81,79 | 495,125.5,120,25 |
| `Mushroom World` | 异蘑世界 | `121` | `Resources/Panels/MiniMap2/Sprites/14.png` | 442,285,116,80 | 533,312.5,120,25 |
| `Mushroom Valley` | 异蘑谷 | `124` | `Resources/Panels/MiniMap2/Sprites/23.png` | 22.5,262.5,115,85 | 10,347.5,120,25 |
| `Bridge` | 朽木桥 | `122` | `Resources/Panels/MiniMap2/Sprites/17.png` | 346,333,88,54 | 330,308,120,25 |
| `Altar` | 信奉广场 | `100` | `Resources/Panels/MiniMap2/Sprites/11.png` | 321,217.5,88,75 | 290,192.5,120,25 |
| `Mushroom Trail` | 异蘑小径 | `123` | `Resources/Panels/MiniMap2/Sprites/20.png` | 190.5,277.5,109,105 | 195,382.5,120,25 |
| `Main` | 草目主城 | `90` | `（无 override ⇒ prefab 默认）` | 397,157,86,96 | 395,132,120,25 |
| `Thorn Forest` | 荆棘林 | `131` | `Resources/Panels/MiniMap2/Sprites/39.png` | 343.5,48,93,84 | 396.5,48,120,25 |
| `Water Border` | 水仙草界 | `151` | `Resources/Panels/MiniMap2/Sprites/26.png` | 151,182.5,88,75 | 135,157.5,120,25 |

**MiniMap3** · category `3` · 面板框 **720×420** · 页标题 `水脉氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap3/Sprites/path.png` | 607×384 | 1 | 56.5,53,607,384 |
| Spot … Spot (17) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 18 | 464,244.5,22,21；349,264.5,22,21；129,244.5,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Sad Entry` | 残骸入口 | `191` | `Resources/Panels/MiniMap3/Sprites/49.png` | 360,58.5,95,93 | 300,34.5,120,25 |
| `Sad Hallway` | 残骸通道 | `192` | `Resources/Panels/MiniMap3/Sprites/4.png` | 503,27.5,94,75 | 408,32.5,120,25 |
| `Swirl Gorge` | 漩涡峡谷 | `212` | `Resources/Panels/MiniMap3/Sprites/17.png` | 516,288.5,81,67 | 496.5,266.5,120,25 |
| `Coral Road` | 珊瑚路 | `202` | `Resources/Panels/MiniMap3/Sprites/45.png` | 227,135,98,62 | 177,120,120,25 |
| `Wild Swirl` | 狂暴漩涡 | `213` | `Resources/Panels/MiniMap3/Sprites/13.png` | 621.5,205.5,71,83 | 597,180.5,120,25 |
| `Colorful Coral` | 幻彩珊瑚 | `203` | `Resources/Panels/MiniMap3/Sprites/41.png` | 199,44,92,66 | 185,19,120,25 |
| `Coral Cave` | 幽静珊瑚穴 | `204` | `Resources/Panels/MiniMap3/Sprites/37.png` | 27.5,53,85,64 | 10,28,120,25 |
| `Beach` | 幽静浅滩 | `220` | `Resources/Panels/MiniMap3/Sprites/57.png` | 455,171.5,107,88 | 455,146.5,120,25 |
| `Rainbow` | 彩虹珊瑚湾 | `201` | `Resources/Panels/MiniMap3/Sprites/33.png` | 97,171.5,86,77 | 80,146.5,120,25 |
| `Swirl Valley` | 漩涡谷地 | `211` | `Resources/Panels/MiniMap3/Sprites/21.png` | 427,288.5,76,81 | 357,379.5,120,25 |
| `Silver Mount` | 银脉山脊 | `180` | `Resources/Panels/MiniMap3/Sprites/53.png` | 343,161,72,88 | 248,224,120,25 |
| `Deep Water` | 深水之城 | `170` | `Resources/Panels/MiniMap3/Sprites/29.png` | 175,257.5,90,95 | 160,362.5,120,25 |
| `Main` | 水脉主城 | `160` | `Resources/Panels/MiniMap3/Sprites/25.png` | 300,275,80,80 | 280,360,120,25 |
| `Sad End` | 悲伤残骸 | `193` | `Resources/Panels/MiniMap3/Sprites/9.png` | 601.5,81.5,97,77 | 600,56.5,120,25 |

**MiniMap4** · category `4` · 面板框 **720×420** · 页标题 `火幻氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap4/Sprites/1.png` | 481×334 | 1 | 119.5,68,481,334 |
| Spot … Spot (21) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 22 | 349,269.5,22,21；247,248.5,22,21；199,235,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Thorn Trail` | 焰之森 | `281` | `Resources/Panels/MiniMap4/Sprites/42.png` | 422,305.5,94,71 | 389,376.5,120,25 |
| `Ash Hell` | 灰烬深渊 | `303` | `Resources/Panels/MiniMap4/Sprites/63.png` | 306.5,326,83,82 | 206.5,383,120,25 |
| `Sky Mount` | 幻空岭 | `292` | `Resources/Panels/MiniMap4/Sprites/28.png` | 61.5,71.5,97,79 | 50,150.5,120,25 |
| `Skyway` | 幻空通道 | `291` | `Resources/Panels/MiniMap4/Sprites/10.png` | 236.5,120,107,82 | 176.5,120,120,25 |
| `Fire Valley` | 烈焰峡谷 | `262` | `Resources/Panels/MiniMap4/Sprites/54.png` | 566,57.5,78,88 | 535,145.5,120,25 |
| `Meromen` | 魅罗门 | `270` | `Resources/Panels/MiniMap4/Sprites/46.png` | 552,300,106,72 | 628,323.5,120,25 |
| `Main` | 火幻主城 | `230` | `Resources/Panels/MiniMap4/Sprites/14.png` | 254.5,218,101,94 | 245,312,120,25 |
| `Ash` | 灰烬之地 | `301` | `Resources/Panels/MiniMap4/Sprites/18.png` | 134,213.5,82,73 | 100,188.5,120,25 |
| `Red Chain Mountain` | 赤链山脉 | `261` | `Resources/Panels/MiniMap4/Sprites/2.png` | 426,50,86,78 | 392,37.5,120,25 |
| `Manshin Warfield` | 蛮神战场 | `240` | `Resources/Panels/MiniMap4/Sprites/6.png` | 389.5,161,89,92 | 458.5,194.5,120,25 |
| `Ash Cross` | 灰烬岔口 | `302` | `Resources/Panels/MiniMap4/Sprites/22.png` | 125,300,100,82 | 115,382,120,25 |
| `Fire Mountain` | 火焰山 | `263` | `Resources/Panels/MiniMap4/Sprites/58.png` | 199,11.5,88,96 | 124,21.5,120,25 |

**MiniMap5** · category `5` · 面板框 **720×420** · 页标题 `冰沁氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 678,7,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 282.5,-1,151,36 |
| `Path` | `Resources/Panels/MiniMap5/Sprites/29.png` | 630×262 | 1 | 69.1,134.6,593.3,230.5 |
| Spot … Spot (21) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 20 | 351.8,237,22,21；117.3,357.5,22,21；70.9,315.5,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Ice Temple ` | 冰沁神殿 | `406` | `Resources/Panels/MiniMap5/Sprites/22.png` | 595.4,182.4,94,71 | 569.4,156.4,120,25 |
| `Ice Prison ` | 冰之监狱 | `407` | `Resources/Panels/MiniMap5/Sprites/25.png` | 568.5,66,83,82 | 550,42,120,25 |
| `mountaintop` | 冰脊之巅 | `403` | `Resources/Panels/MiniMap5/Sprites/34.png` | 67,42.4,97,79 | 86,18.9,120,25 |
| `Bingqin Palace` | 冰沁宫殿 | `405` | `Resources/Panels/MiniMap5/Sprites/18.png` | 511,270,106,72 | 488.1,240.7,120,25 |
| `Ice Crystal Mine` | 冰晶矿场 | `404` | `Resources/Panels/MiniMap5/Sprites/8.png` | 252.5,220,101,94 | 275,196,120,25 |
| `Primeval snow forest` | 原始雪森林 | `408` | `Resources/Panels/MiniMap5/Sprites/46.png` | 346,295.8,82,73 | 346,375.8,120,25 |
| `Iceridge Mountains` | 冰脊山脉 | `402` | `Resources/Panels/MiniMap5/Sprites/30.png` | 230,83,86,78 | 224,58,120,25 |
| `Valley of Ice` | 冰之谷 | `401` | `Resources/Panels/MiniMap5/Sprites/14.png` | 380.5,100,89,92 | 365,72.5,120,25 |
| `Lake of Snow` | 雪之湖泊 | `409` | `Resources/Panels/MiniMap5/Sprites/51.png` | 147,319,100,82 | 147,297.3,120,25 |
| `Snow Cave` | 雪之溶洞 | `410` | `Resources/Panels/MiniMap5/Sprites/55.png` | 53.9,230.4,88,96 | 117.9,237.4,120,25 |

**MiniMap6** · category `6` · 面板框 **720×420** · 页标题 `地月·沙爪氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 678,7,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 282.5,-1,151,36 |
| `Path` | `Resources/Panels/MiniMap6/Sprites/1.png` | 489×306 | 1 | 97.5,65.5,489,306 |
| Spot … Spot (29) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 30 | 326.5,224.4,22,21；556.4,321.5,22,21；356.5,183.5,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Rotation Ladder` | 黑岩旋梯 | `530` | `Resources/Panels/MiniMap6/Sprites/30.png` | 265.5,42,87,62 | 189,24.6,120,25 |
| `Underway` | 地道之路 | `510` | `Resources/Panels/MiniMap6/Sprites/14.png` | 370,80.2,93,73 | 356.5,56.2,120,25 |
| `Sand Cave` | 沙之迷穴 | `380` | `Resources/Panels/MiniMap6/Sprites/18.png` | 126.8,42,107,96 | 38.8,77.5,120,25 |
| `Desert Eagle` | 沙漠之鹰 | `350` | `Resources/Panels/MiniMap6/Sprites/50.png` | 556.9,317.5,116,72 | 554.9,389.5,120,25 |
| `Phantom` | 海市蜃楼 | `370` | `Resources/Panels/MiniMap6/Sprites/58.png` | 54,163.3,117,97 | -7.5,152,120,25 |
| `Experiment` | 实验禁地 | `500` | `Resources/Panels/MiniMap6/Sprites/21.png` | 595.4,42,64,67 | 567.4,16.9,120,25 |
| `Earth main city` | 地月氏族主城 | `470` | `Resources/Panels/MiniMap6/Sprites/2.png` | 342.5,186,84,82 | 342.5,268,120,25 |
| `Sand main city` | 沙爪氏族主城 | `320` | `Resources/Panels/MiniMap6/Sprites/38.png` | 274.4,300.5,86,89 | 263.2,390.5,120,25 |
| `running line (earth)` | 三八跑道线(地) | `390` | `Resources/Panels/MiniMap6/Sprites/6.png` | 245.3,114.5,87,94 | 228.8,89.5,120,25 |
| `Taomee Market` | 沙爪市场 | `330` | `Resources/Panels/MiniMap6/Sprites/42.png` | 402,283,113,84 | 402,367,120,25 |
| `Gold Road` | 黄金之路 | `360` | `Resources/Panels/MiniMap6/Sprites/54.png` | 90.5,279,102,92 | 81.5,371,120,25 |
| `Subway` | 地铁站 | `480` | `Resources/Panels/MiniMap6/Sprites/65.png` | 581.9,118.8,91,73 | 567.4,192.8,120,25 |
| `Black Market` | 地下黑市 | `490` | `Resources/Panels/MiniMap6/Sprites/26.png` | 456.6,163.3,85,77 | 439.1,242.3,120,25 |
| `Money Palace` | 娜钱莱宫殿 | `340` | `Resources/Panels/MiniMap6/Sprites/46.png` | 554.9,227,118,72 | 599.9,286.5,120,25 |
| `running line (sand)` | 三八跑道线(沙) | `310` | `Resources/Panels/MiniMap6/Sprites/34.png` | 178.8,180,80,103 | 227.3,270.5,120,25 |
| `Black Mine` | 乌黑矿坑 | `520` | `Resources/Panels/MiniMap6/Sprites/10.png` | 463,42,84,65 | 445,16.3,120,25 |

**MiniMap7** · category `7` · 面板框 **720×420** · 页标题 `飞翼氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 678,7,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 282.5,-1,151,36 |
| `Path` | `Resources/Panels/MiniMap7/Sprites/1 10.png` | 1920×1120 | 1 | -512.9,-333,1920,1120 |
| Spot … Spot (21) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 16 | 312.9,259,22,21；242,249.5,22,21；204.8,291.8,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Street Garden` | 街心花园 | `426` | `Resources/Panels/MiniMap7/Sprites/1 5.png` | 514,300.5,94,71 | 526,276.5,120,25 |
| `Forgotten Island` | 遗忘之岛 | `423` | `Resources/Panels/MiniMap7/Sprites/1 6.png` | 83.1,80.2,155.8,105.6 | 22,80.2,120,25 |
| `Library` | 云海藏书 | `430` | `Resources/Panels/MiniMap7/Sprites/59.png` | 424,42,100,100 | 424,17,120,25 |
| `Research` | 研究院 | `429` | `Resources/Panels/MiniMap7/Sprites/55.png` | 279.9,51,100,100 | 190.9,44,120,25 |
| `Jiyu Island` | 汲雨之岛 | `424` | `Resources/Panels/MiniMap7/Sprites/1 4.png` | 383.2,278.5,74.4,93 | 360.4,370.5,120,25 |
| `Feiyi's main city` | 飞翼氏族主城 | `419` | `Resources/Panels/MiniMap7/Sprites/1.png` | 245.2,180,101,94 | 235.7,158,120,25 |
| `Wind Race` | 御风赛场 | `427` | `Resources/Panels/MiniMap7/Sprites/140.png` | 592,180,100,90 | 582,153,120,25 |
| `airport` | 空港 | `420` | `Resources/Panels/MiniMap7/Sprites/1 3.png` | 279.9,330.9,82,73 | 295.9,330.9,120,25 |
| `Feather Crown Island` | 羽冠之岛 | `425` | `Resources/Panels/MiniMap7/Sprites/1 7.png` | 402.6,151,89,92 | 460.5,151,120,25 |
| `Core of Flying Wings` | 飞翼之核 | `421` | `Resources/Panels/MiniMap7/Sprites/1 1.png` | 147.2,278.5,75.5,99.5 | 124.9,378,120,25 |
| `Time Mirror Island` | 时镜之岛 | `422` | `Resources/Panels/MiniMap7/Sprites/1 2.png` | 66.8,196.8,88,96 | 34.8,291.1,120,25 |

**MiniMap9** · category `9` · 面板框 **720×420** · 页标题 `能源之树`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap9/Sprites/1.png` | 651×417 | 1 | 24.5,-33.5,651,417 |
| Spot … Spot (21) | `StaticResources/Sprites/Map/spot.png` | 22×21 | 22 ⚠️**全部 `active=0`** | 349,269.5,22,21；247,248.5,22,21；199,235,22,21… |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Horizon Plain` | 视界原野 | `800` | `Resources/Panels/MiniMap9/Sprites/28.png` | 297.5,254,113,102 | 364,254,120,25 |
| `Waterfall` | 脉流之瀑 | `810` | `Resources/Panels/MiniMap9/Sprites/32.png` | 22.5,257,139,96 | 32,355.5,120,25 |
| `Fire Hallway` | 火源通径 | `820` | `Resources/Panels/MiniMap9/Sprites/36.png` | 41,25,132,110 | 72,25,120,25 |
| `Sun Lake` | 微光湖畔 | `790` | `Resources/Panels/MiniMap9/Sprites/24.png` | 536.5,281,145,72 | 561.5,256,120,25 |
| `Ice` | 冰晶魔域 | `840` | `Resources/Panels/MiniMap9/Sprites/44.png` | 401.5,25,135,120 | 381,146,120,25 |
| `Tangel Vine` | 纠结之藤 | `830` | `Resources/Panels/MiniMap9/Sprites/40.png` | 189.5,120,135,98 | 204.5,93,120,25 |
| `Cloud` | 玄云之冠 | `850` | `Resources/Panels/MiniMap9/Sprites/50.png` | 599.5,58,93,103 | 572.5,32,120,25 |

**MiniMap11** · category `11` · 面板框 **720×420** · 页标题 `风刃氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap11/Sprites/1.png` | 658×372 | 1 | 21,45,658,372 |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Workshop` | 风涡工房 | `940` | `Resources/Panels/MiniMap11/Sprites/35.png` | 465.5,251,179,128 | 495,379,120,25 |
| `Main` | 风刃氏族主城 | `900` | `Resources/Panels/MiniMap11/Sprites/39.png` | 179.5,127,184,117 | 271.5,94,120,25 |
| `Street` | 流离街 | `920` | `Resources/Panels/MiniMap11/Sprites/18.png` | 261.5,270,177,140 | 183.5,362.5,120,25 |
| `Research` | 神秘研究院 | `950` | `Resources/Panels/MiniMap11/Sprites/26.png` | 590.5,131,103,130 | 602,106,120,25 |
| `Priest` | 神风祭台 | `910` | `Resources/Panels/MiniMap11/Sprites/32.png` | 31,66,141,142 | 31.5,39,120,25 |
| `Core` | 御风中枢 | `930` | `Resources/Panels/MiniMap11/Sprites/23.png` | 385.5,63,149,134 | 400,38,120,25 |
| `Cliff` | 风暴悬崖 | `890` | `Resources/Panels/MiniMap11/Sprites/29.png` | 31,240,170,134 | 6,249,120,25 |

**MiniMap12** · category `12` · 面板框 **720×420** · 页标题 `虫蚀氏族`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 680,5,35,35 |
| `Background` | `StaticResources/Sprites/Map/map title.png` | 151×36 | 1 | 284.5,-3,151,36 |
| `Path` | `Resources/Panels/MiniMap12/Sprites/8.png` | 342×283 | 1 | 179,89.5,342,283 |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Hole` | 树洞⏎ | `1240` | `Resources/Panels/MiniMap12/Sprites/18.png` | 515.5,50,107,125 | 552.5,67,120,25 |
| `Trail` | 虫林小径 | `1200` | `Resources/Panels/MiniMap12/Sprites/9.png` | 87,207,94,98 | 74,180,120,25 |
| `Jail` | 虫穴地牢⏎ | `1220` | `Resources/Panels/MiniMap12/Sprites/15.png` | 345,314.5,106,91 | 338,289.5,120,25 |
| `Firefly` | 萤火之墓 | `1250` | `Resources/Panels/MiniMap12/Sprites/38.png` | 530.5,256.5,92,107 | 516.5,363.5,120,25 |
| `Garden` | 后花园 | `1230` | `Resources/Panels/MiniMap12/Sprites/32.png` | 351,50,106,54 | 344,104,120,25 |
| `Main` | 虫蚀氏族主城 | `1210` | `Resources/Panels/MiniMap12/Sprites/22.png` | 251.8,179,94,112 | 304.8,189,120,25 |

**MiniMap100** · category `100` · 面板框 **710×440** · 页标题 `（无）`

| 图层 | 素材（相对 `Assets/`） | 原图 | 份数 | 面板矩形 `x,y,w,h` |
|---|---|---|---|---|
| `Background` | `Resources/Panels/MiniMap100/Sprites/1.png` | 1005×603 | 1 | 0,0,710,440 |
| `Esc Button` | `Resources/Sprites/Game/Hint Box/Green Esc.png` | 35×35 | 1 | 665,7,40,40 |

| 热区节点 | 显示名 | 目标 `mapId` | 图标（相对 `Assets/`） | 热区矩形 | 标签框矩形 |
|---|---|---|---|---|---|
| `Button` | 经验之门 | `82` | `（无 override ⇒ prefab 默认）` | 12.5,30,210,100 | — |
| `Button` | 试炼之门 | `83` | `（无 override ⇒ prefab 默认）` | 12.5,127.5,210,95 | — |
| `Button` | 勇士之门 | `84` | `（无 override ⇒ prefab 默认）` | 7.5,217.5,210,95 | — |
| `Button` | 竞技之门 | `85` | `（无 override ⇒ prefab 默认）` | 7.5,312.5,210,95 | — |
| `Button` | 英雄之门 | `86` | `（无 override ⇒ prefab 默认）` | 542.5,32.5,210,95 | — |
| `Button` | 双子之门 | `87` | `（无 override ⇒ prefab 默认）` | 542.5,127.5,210,95 | — |
| `Button` | 王者之门 | `88` | `（无 override ⇒ prefab 默认）` | 542.5,222.5,210,95 | — |
| `Button` | — | `0` | `（无 override ⇒ prefab 默认）` | 542.5,312.5,210,95 | — |
| `Button` | 要塞顶层 | `81` | `（无 override ⇒ prefab 默认）` | 250,296.5,210,95 | — |

---

## 5. 关闭 / 悬停 / 其它可观察行为【实测 + 源码】

- **关**：`Esc Button.onClick → Panel.ClosePanel`（11 块**都有**，位置/尺寸两种：9 块 = `35×35` 在右上角 `680,5`；`MiniMap1` = `cancel.png 81×31` 在**底部居中** `314.5,384`；`MiniMap100` = `40×40` 在 `665,7`）。
- **悬停**：`Info Prompt` 实例**每块面板一个**（`MiniMap1`/`MiniMap2`… 各 1 个 PrefabInstance），由该区 `MapBlockView.infoPrompt` 字段引用；⚠️ **`MiniMap1` 的那个实例 `m_IsActive=0`** ⇒ 飞船图的 8 个舱室**既没有区名、也没有悬停提示**（§7 **A3**）。`MiniMap100` 干脆**没有** `Info Prompt` 实例，但它的 9 个内联 `Button` 仍调 `SetInfoPromptText` ⇒ 引用为空、`infoPrompt?.` 空传播 ⇒ **静默什么都不弹**（§7 **A4**）。
- **遮罩 / ESC**：不在预制里，属宿主机制（A2 `docs/view/mech/view-panel-stack.md`；上游 `Panel` 的遮罩与 ESC 口径已由大地图报告 §1 记过一遍）。
- **零写状态**：面板全程不碰存档（`GoToMap` 之后落盘属传送链 M5，不属本面板）。

---

## 6. Mod 分支【源码】

`MapWorldController.cs:26-29`：`Map.IsMod(currentMapId) && SaveSystem.TryLoadPanelMod("MiniMap"+categoryId)` ⇒ 开 `[Mod]MiniMap{cat}`。与大地图报告 §6 同形；**我方不做**（Mod 面归 A 组外围，见 design §1）。

---

## 7. 怪癖与缺口登记（A1–A12；政策 = 决议 ② **声明 + 不照搬**）

| # | 怪癖 | 证据（`路径` / 实测数字） | 发行数据里的可观察后果 |
|---|---|---|---|
| **A1** | **一律回退飞船图**：`Panel.OpenPanel("MiniMap"+cat)` 返回 `null` 时**硬回退 `MiniMap1`**，不提示、不区分 | 【源码】`MapWorldController.cs:31-33` | **77/272 张图（28%）**点右上角看到的是**飞船蓝图 + 8 个飞船舱门**，与所站区域无关（类目 8/10/13/14/16/101/102/103/104/105/200 全中招，其中 `102` 28 张、`101` 15 张最多） |
| **A2** | **`MiniMap1` 的 8 个热区没有 TMP 区名标签**（但**图标 PNG 自带中文名**）：`Title Background` 被逐个 `m_IsActive=0` | 【实测】8/8 实例的 `Title Background.m_IsActive=0`；⚠️ **2026-10-19 复核纠正**：`MiniMap1/Sprites/{43,65,81,94,106}.png` 目视 = **房间实景缩略图 + 底部烘有中文名字**（船长室/教官室/资料室/传送室/游戏室），文件 49–52KB，对比 `MiniMap2/Sprites/1.png`（6KB 青色线稿、无字） | 飞船面板上**名字在图里、不在标签里** ⇒ 玩家看得见"这是哪间舱"，只是那 8 格**没有可改写的文字层**（⇒ 我方**不该再补一层标签**，否则与图里的字重叠 = 双份文字；见 design §8 **MQ1** 的改判） |
| **A3** | **`MiniMap1` 的 `Info Prompt` 实例被关掉**（`m_IsActive=0`） | 【实测】`MiniMap1/Panel.prefab` 的 PrefabInstance `Info Prompt` | 鼠标悬到飞船舱门上**不出提示**（其余 9 块会出） |
| **A4** | **`MiniMap100` 无 `Info Prompt` 却仍绑提示事件**：9 个内联 `Button` 调 `SetInfoPromptText/Active`，`MapBlockView.infoPrompt` 引用为空 | 【实测】`MiniMap100/Panel.prefab` 的 PrefabInstance 数 = 0 | 要塞门悬停**静默无提示**（`?.` 空传播，不报错）；只有 8 个门有 `m_StringArgument` 文案（`要塞顶层/经验之门/试炼之门/勇士之门/竞技之门/英雄之门/双子之门/王者之门`），**第 9 个（`Lonely`，`mapId=0`）连文案都没绑** |
| **A5** | **`mapId=0` 摆上板**：`MiniMap100` 的 `Lonely` 热区 `GoToMap(0)` | 【实测】113 热区里唯一 `int=0` | 点它会走 `TeleportHandler.Teleport(0)`（M5 侧 `mapId==0` 的既有分支），面板上**看不出"未开放"** |
| **A6** | **装饰点数 ≠ 热区数、且跨面板复制**：`MiniMap9` 的 22 个 `Spot` **坐标与 `MiniMap4` 的 22 个逐字节相同**，且**全部 `m_IsActive=0`** | 【实测】两组矩形集合 `sorted() == sorted()` 为真；22/22 `active=0` | `MiniMap9`（能源之树）画了 22 个隐藏点（不可见、无后果），但**说明这块面板是从 `MiniMap4` 复制改的**；`MiniMap2` 16 点 vs 13 区、`MiniMap5` 19 点 vs 10 区 ⇒ 点数与区数无对应关系，纯手绘装饰 |
| **A7** | **图片溢出面板框、且无遮罩**：`MiniMap7` 的 `Path` = **1920×1120** 摆在 `-513,-333`；`MiniMap9` 的 `Path` = 651×417 摆在 `y=-33.5`；`MiniMap100` 的 `Background` = **1005×603 塞进 710×440**（拉伸）；9 块的标题条 `map title.png` 一律 `y=-3` 压出框顶 | 【实测】逐节点矩形；11 块预制内**没有** `Mask`/`RectMask2D` 组件 | Unity 无遮罩 ⇒ 上游画面**真的会溢出面板框**（`MiniMap7` 最明显：图比框大 2.7 倍）；`MiniMap100` 的底图被**非等比压扁** |
| **A8** | **两套面板框尺寸混用**：720×420（9 块）vs 710×440（`MiniMap1`/`MiniMap100`）；关闭钮三种（35×35 右上 / 81×31 底部居中 / 40×40 右上） | 【实测】§2 表 | 视觉上"飞船/要塞"两块面板比氏族面板**高一点、窄一点**，关闭钮位置跳 |
| **A9** | **区名混排繁简 + 尾换行**：`MiniMap2` 的 `荆棘小徑`（繁"徑"）与其余简体混用；`MiniMap12` 的 `树洞\n`、`虫穴地牢\n` **带尾换行**（`hover` 文案干净、`m_text` 脏） | 【实测】`m_text` override 原值 | 区名标签**下方多一行空行**（TMP 会把 `\n` 画出来）；繁简混用是发行数据本身的事实（**属 V2"数据错字 ⇒ 照搬"还是代码 bug ⇒ 不照搬**：本条是**预制里的文字数据**，不是代码逻辑 bug ⇒ 目标行为见 design §6：**显示通道取 `hover` 文案**，等于顺手清洗） |
| **A10** | **`MiniMap11`/`MiniMap12` 没有 `Spot` 装饰**（只有 `Path` + 热区） | 【实测】图层数 3（`Esc`+标题条+`Path`） | 这两块看起来"比别的素"，无功能后果 |
| **A11** | **两块面板脚本空壳**：`MiniMapPanel.cs`（9 行）、`MiniMapShipPanel.cs` | 【源码】`Resources/Panels/WorldMap/Scripts/MiniMapPanel.cs`、`Resources/Panels/MiniMap1/Scripts/MiniMapShipPanel.cs` | 纯声明：面板行为 100% 在预制事件里，**C# 侧没有可参照的逻辑**（⇒ 我方复刻只能靠解析预制，本报告的数字就是这么来的） |
| **A12** | **⚠️ 订正大地图报告 §7 的 A10**：那份报告把 `Resources/Prefabs/Map/Minimap Region.prefab` 记成"**孤儿资产**"。**实测不成立** —— 它是**全部 9 块氏族小地图面板的热区模板**（`MiniMap2/3/4/5/6/7/9/11/12` 共 **96 个 PrefabInstance** 引用它），`MiniMap1` 另用 `MiniMap1/Prefabs/ShipMapBlock.prefab`（8 个实例）。 | 【实测】逐面板 PrefabInstance 源统计：`{Minimap Region: 96, ShipMapBlock: 8, Info Prompt: 10}` | 若不订正，会让人以为小地图没有可复刻的热区模板 ⇒ 本族的全部真值表（§4.1）正是从这两个模板的 override 里读出来的 |

> **另记一条"共享 prefab 的默认素材跨面板"**（**当前无后果、属地雷**）：`Minimap Region.prefab` 根节点 `Image` 的**默认 sprite** = `MiniMap2/Sprites/8.png`（一口井的线稿）。实测 111/113 热区都 override 了自己的图标，唯一两个"没 override"的恰好是 `MiniMap2` 的 `Main`（用自家图 = 正确）与 `MiniMap1` 的 `Instructor`（用 `ShipMapBlock.prefab` 的默认图 `MiniMap1/Sprites/65.png` = 自家图，也正确）⇒ **发行数据里没有可见穿帮**，但"共享模板的默认素材指向某一块面板"这件事本身要登记（改数据时容易踩）。

---

## 8. 交 design 的输入清单

1. **入口**：HUD `rbh-minimap` 钮 ⇒ 按**当前图 `category`** 选面板（我方已有同源字段：`parse-map.js:296` 的 `category`）。
2. **内容真值** = §4.1 的 11 张表（113 热区 / 112 目的地 / 0 悬空）；**数据文件形态** = 手写静态表（同大地图 WM2 口径：上游本就手摆，无 XML 源）。
3. **画面** = §3 五类图层 + 每区线稿图标 + 区名文字，**坐标已折算成面板绝对像素**（可直接摆 DOM）。
4. **必须处置的怪癖**（决议 ②）：**A1**（回退飞船图）、**A2/A3/A4**（无标签/无提示）、**A5**（`mapId=0`）、**A7**（溢出）、**A9**（尾换行）——逐条给目标行为。
5. **不做**：Mod 分支（§6）、`[Mod]MiniMap*`。
6. **术语订正**：大地图报告 **A10** 关于 `Minimap Region.prefab` 的"孤儿资产"说法需按本份 **A12** 更正（改的是**那份报告**，不是行为）。
