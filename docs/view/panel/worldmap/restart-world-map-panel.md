# 代码分析：重启的上游是怎么实现"世界地图面板（大地图）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住**本面板的子目录** `docs/view/panel/worldmap/`，见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制/场景/发行数据里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **C3 设计 `docs/view/panel/view-panels-map.md`**（尚未建 · `docs/view/view-design.md §8` 表 C3 行 ⬜；**本报告 = 它的证据底座**）+ 面板栈 **A2 `docs/view/mech/view-panel-stack.md`**（`OpenPanel`/`SetPanelIdentifier`/遮罩/ESC 的真值）+ **B1 `docs/view/scene/room/view-scene-hud-design.md`**（Map Corner 角标 = 本面板的两把入口钮所在）+ 地图线 **M5 `docs/map/map-teleport.md`**（六入口表**第 5 入口"面板 `GoToMap`"**的正本；⚠️ 该表写"面板归 **C2**"，与 `view-design.md` 的 **C3=地图/世界族** 打架 —— **C2 系笔误**，随 C3 成文时一并订正）。
> **路径口径**：上游代码路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方代码相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 可复算的数字或可复跑的 grep；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A11**，**各自从 A1 起**，引用**必须带文件名**）；目标行为未定的写"待定 + 指针到 C3 design"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；评审通过后进入 C3 design → impl → 代码。

---

## 0. 一句话结论

**大地图面板是一台"分页 + 静态块"的机器，代码薄、真相全在预制里**。
脚本侧只有 `WorldMapPanel.cs`（53 行）：管**两页**（`worldNames = ["阿卡迪亚星", "新世界"]`）的显隐与翻页，**零出路逻辑、零房间列表**。
37 个地图块全是 `Resources/Panels/WorldMap/Panel.prefab` 里**手摆的 `WorldMapBlock` 预制实例**，每块靠 persistent call 的 **int 参数写死目标 `mapId`**，点击 = `Module.GoToMap(mapId)` ⇒ `TeleportHandler.Teleport(mapId)` —— **直切场景、不走"两步走位"**（对照 M5 光口链）。
小地图（`MiniMap{categoryId}` 十一块面板）是**同族更极端**的版本：脚本 9 行**空壳**（个别面板连壳都不挂），行为 100% 在预制里，选面板靠 `categoryId` 字符串拼接、**查不到一律回退 `MiniMap1`（飞船）**。

我方对应物今天 = **两个占位**：HUD `restartHudView.js:165-174` 的 `.rbh-globe` / `.rbh-minimap`（点击 ⇒ `mapScene.js:250` `logLine('大地图：世界地图面板待建')`）；面板宿主 `game/app/view/panels/host.js`（U0 `openPanel/closePanel/panelStack`）与传送 sink（`mapScene.js` `makeRunCtx.teleport` ⇒ `decideTeleport` ⇒ `gotoMap`）**都已就位** —— 缺的就是这份面板本体与其内容表。

---

## 1. 入口：Map 场景 HUD 的 Map Corner 两把钮【源码】

| 钮 | 场景对象 | 接线 | 落点 |
|---|---|---|---|
| **Map Button**（大地图） | `Scenes/Map.unity` GameObject `Map Button`（fileID 192554761） | `IButton.onPointerClickEvent` → `MapWorldController.OpenWorldMapPanel`（`Scenes/Map.unity:1795`） | `Scripts/MVC/Controller/Map/Components/MapWorldController.cs:12-21` |
| **Mini Map Button**（小地图，右上角 25×25） | 同场景 GameObject `Mini Map Button`（fileID 1975560648） | → `MapWorldController.OpenMiniMapPanel`（`Scenes/Map.unity:21419`） | 同文件 `:23-34` |

两钮共用同一点击音效（guid `5d77784f…`）【实测】。B1 已把我们侧的 Map Corner 落成 `rbh-corner`（70×70@5,470：globe 50×50 + minimap 25×25 + 罗盘），**钮在、动作空**。

`MapWorldController.OpenWorldMapPanel()` 的形状（全文 35 行）【源码】：

1. **Mod 分支先走**：当前图 `Map.IsMod(currentMapId)` 且存档里有面板 Mod 数据（`SaveSystem.TryLoadPanelMod("WorldMap")`）⇒ `Panel.OpenPanel("[Mod]WorldMap")` 并 return。
2. 否则 `worldId = (currentMap.categoryId - 1) / 100` ⇒ `Panel.OpenPanel<WorldMapPanel>()` + `SetPanelIdentifier("world", worldId)` —— **打开时就停在"当前图所属世界"那一页**（所以页不是"选世界"，是**定位**）。

`OpenMiniMapPanel()` 同构：`Panel.OpenPanel("MiniMap" + categoryId)`，返回 `null` ⇒ **回退 `OpenPanel("MiniMap1")`**；Mod 分支同 1。

---

## 2. 本体：`WorldMapPanel.cs`（53 行）——只有一台"翻页机"【源码】

- 序列化字段：`worldNameText / pageView / worldObjects(List<GameObject>) / debugObjectList`（`Resources/Panels/WorldMap/Scripts/WorldMapPanel.cs:9-12`）。
- `worldNames = { "阿卡迪亚星", "新世界" }` —— **硬编码两元素数组**（`:15`）。
- `Init()`：debug 对象按 `GameManager.debugMode` 显隐，然后 `SetWorld(worldId)`（字段默认 0）。
- `SetPanelIdentifier(id, param)`：只认 `"world"` ⇒ `SetWorld(int.Parse(param))`；其余落 base。
- `SetWorld(w)`：标题文本 = `worldNames[w]`；`worldObjects` 里**只有下标 == w 的那页 `SetActive(true)`**；`pageView.SetPage(w, 1)`。
- `PrevPage/NextPage`：对 2 取模循环翻页（`:44-52`）。

**没有任何"房间/地图/传送"字样** —— 出路全在预制的块上（§3–§4）。

### 2.1 面板层级与两页【实测：解析 `Resources/Panels/WorldMap/Panel.prefab`】

`worldObjects` 序列化的两个引用 = 页根 **`Arcadia`**（index 0，预制里 `m_IsActive: 0`）与 **`Seer`**（index 1）；两页都直挂面板根 `Panel` 之下。树形：

```
Panel（面板根；Page / World Name Text / Prev / Next / Esc Button / Background …）
├─ Arcadia            ← 页 0「阿卡迪亚星」
│   ├─ North（10 块） South（7 块） Left Bar（3 块）
└─ Seer               ← 页 1「新世界」（页根名是"飞船"，见 A9）
    ├─ Ship（10 块）
    ├─ Scroll View > Viewport > Content（6 块 · 星球，带滚动视图）
    └─ Right Bar（1 块 · 10081 精灵太空站）
```

（另有 `Info Prompt` 实例挂在浮层节点 = 全局悬浮说明，不属任何页。）

---

## 3. 37 个地图块全表【实测：逐 PrefabInstance 解析 override】

每实例的 override 只有三类：`onPointerClickEvent…m_IntArgument`（= 目标 mapId）、`onPointerOverEvent…m_StringArgument`（= InfoPrompt 悬浮名）、子节点 `m_Text`（= 块上常驻标题 title）；**方法名一律继承块预制默认 `GoToMap`**（唯一例外 = `Mod` 块，见 A2）。

### 3.1 页 0 · 阿卡迪亚星（20 块）

| 组 | 实例名 | 点 mapId | 悬浮名 | 块标题 | 目标图（xml `name`）【样本】 | cat |
|---|---|---|---|---|---|---|
| North | Fly | 420 | —（A3） | 飞翼氏族 | 空港 | 7 |
| North | Earth | 470 | — | 地月氏族 | 地月氏族主城 | 6 |
| North | Plant | 990 | — | 普兰特山麓 | 普兰特山脚 | 9 |
| North | Water | 160 | — | 水脉氏族 | 水脉氏族主城 | 3 |
| North | Fire | 230 | — | **不覆盖 ⇒ 吃默认"火幻氏族"** | 火幻氏族主城 | 4 |
| North | Ice | 401 | — | 冰沁氏族 | 冰之谷 | 5 |
| North | Grass | 90 | — | 草目氏族 | 草目氏族主城 | 2 |
| North | Energy | 790 | — | `"\r能源之树"`（**带 \r**，A4） | 微光湖畔 | 9 |
| North | Diet | 540 | — | 禁食山 | 禁食山脚 | 8 |
| North | Sand | 320 | — | 沙爪氏族 | 沙爪氏族主城 | 6 |
| South | Mystery | **0** | — | 神醚氏族 | （0 = 未开放，A1） | — |
| South | Fight | **0** | — | 战武氏族 | （同上） | — |
| South | King | **0** | — | 萨伦帝国 | （同上） | — |
| South | Thunder | **0** | — | 雷鸣氏族 | （同上） | — |
| South | Wind | 900 | — | 风刃氏族 | 风刃氏族主城 | 11 |
| South | Bug | 1210 | — | 虫蚀氏族 | 虫蚀氏族主城 | 12 |
| South | Super | 1290 | — | 超源氏族 | 超源氏族主城 | 13 |
| Left Bar | Seer | **-70** | —（A3） | 不覆盖 ⇒ 吃默认"火幻氏族"（A3′） | 传送室（夜镜像） | 1 |
| Left Bar | Station | **81** | — | 同上 | 英格瓦要塞 | 100 |
| Left Bar | Mod | （int 残留 -50081） | — | "Mod 地图" | **方法改 override 成 `OpenModMapPanel`**（§5.3） | — |

### 3.2 页 1 · 新世界（17 块）

| 组 | 实例名 | 点 mapId | 悬浮名 | 目标图（xml `name`） | cat |
|---|---|---|---|---|---|
| Ship | Teleport | 10001 | 传送仓 | 传送仓 | 101 |
| Ship | Data | 10002 | 资料室 | 资料室 | 101 |
| Ship | Platform | 10003 | 瞭望露台 | 瞭望露台 | 101 |
| Ship | Telescope | 10004 | 瞭望仓 | 瞭望仓 | 101 |
| Ship | Invent | 10005 | 发明室 | 发明室 | 101 |
| Ship | Engine | 10006 | 动力室 | 动力室 | 101 |
| Ship | Captain | 10007 | 船长室 | 船长室 | 101 |
| Ship | Mechanic | 10008 | 机械室 | 机械室 | 101 |
| Ship | Instructor | 10009 | 教官室 | 教官室 | 101 |
| Ship | Pet Center | 10010 | 精灵中心 | 精灵中心 | 101 |
| Content | Volcano | 10015 | 火山星 | 火山星山脚下 | 102 |
| Content | Ocean | 10020 | 海洋星 | 海洋星浅水区 | 102 |
| Content | Sky | 10025 | 云霄星 | 云霄星地面层 | 102 |
| Content | Helka | 10030 | 赫尔卡星 | 赫尔卡星建筑区 | 102 |
| Content | Klose | 10036 | 克洛斯星 | 克洛斯星草原 | 102 |
| Content | Cecilia | 10040 | 塞西利亚星 | 塞西利亚星冰原 | 102 |
| Right Bar | Space Station | 10081 | 精灵太空站 | 精灵太空站 | 200 |

（悬浮名 17 块齐 = 10 舱 + 6 星 + 1 站；块标题反而**不覆盖** ⇒ 全吃预制默认文本，见 A3′。Ship 组挂在页根 `Seer` 直属下【实测 §2.1 树】。）

**总量核对**：37 块 + 1 Info Prompt = 38 个 PrefabInstance【实测】；`mapId==0` 的 4 块全在页 0 的 South 组；负数块 1（-70）；改方法块 1（Mod）。

---

## 4. 块的机制：`WorldMapBlock.prefab` + `MapBlockView`【源码】

- 预制（`Resources/Panels/WorldMap/Prefabs/WorldMapBlock.prefab`，53 行规模）= `Button` + `Text`（默认 `m_Text:"火幻氏族"`，:81）+ `Title Background`；挂 **`MapBlockView : Module`**。
- 事件接线（预制默认，实例只改参数）：
  - `onPointerClickEvent → GoToMap(int)`（`m_Mode=3` 传 int；默认 `m_IntArgument: 70`，:228 —— A2）。
  - `onPointerEnter/ExitEvent → SetTitleActive(bool)`（悬浮时显/隐块标题）。
  - `onPointerOverEvent → SetInfoPromptText(string)`（把 `StringArgument` 灌进全局 InfoPrompt 浮层）。
- `Module.cs:10 GoToMap(int mapId) => TeleportHandler.Teleport(mapId)` —— 面板出路 = **纯直切**。
- `MapBlockView.cs:23-30 OpenModMapPanel()`：面板 Mod 数据不在 ⇒ `Hintbox("加载Mod地图失败，可能为未加载Mod或该Mod未制作世界地图", 16)`。

## 5. 出路终点：`TeleportHandler.Teleport(mapId, targetPos=default)`（`Entities/Teleport/TeleportHandler.cs:41-62`）【源码】

1. `mapId == 0` ⇒ `Hintbox` 标题"提示"、内容**"地图暂未开放"**、1 个按钮，return（运行期兜底，A1 的下游）。
2. `mapId == 50000` ⇒ 查活动 `mod_home` 的 `map_id` 顶替（**M5 已登记 TPC6/TPQ3**：本线政策 = 不实现查表）。
3. `targetPos != default` ⇒ `Player.SetSceneData("mapInitPos", pos)` —— **面板路永远不传 targetPos**（`GoToMap` 单参），所以面板传送**恒落目标图 `<initialPoint>`**，与 M5 §2.4 的结论一致。
4. `currentNpcId = 0`；`currentMapId = mapId`；`SceneLoader.ChangeScene(SceneId.Map)` —— **已在 Map 场景也整场重载**（无"同图软切"）。

**对照**：光口/`transport` 走 `Transport(pos, onArrive)` ⇒ 72px 环形搜索 ⇒ **先走到、抵达才切**；**面板 `GoToMap` 跳过整段走位**，点击即换图（M5 六入口表第 5 行的"✗不走来"）。负数 `mapId`（-70）在 `Teleport` 里**无任何特殊分支** —— 夜镜像纯粹靠 id 符号在 `Database.GetMap`/`Map.IsMod` 层成立（M5 §2.5 的昼夜机制同根）。

## 6. Mod 分支与 `Map.IsMod`【源码】

- `Map.cs:40`：`IsMod(id) => (id < -50000) || (id == 0)` —— **`id==0` 也算"Mod 图"**（A6）。
- `Map.cs:22`：`worldId = IsMod ? 0 : (categoryId-1)/100`。
- Mod 面板 = `Panel.OpenPanel("[Mod]WorldMap")`：`Panel.cs:36-65` 把 `[Mod]` 前缀换成 `Mod` 预制 + `ModPanel.SetPanelData(TryLoadPanelMod 的数据)` —— **热加载扩展点**，依赖 Save 线的面板 Mod 存储；**A 组外围、本功能不含**（照 `map-teleport.md` 对 `50000`/Mod 的政策：声明 + 不做）。

## 7. 怪癖与缺口登记（A1–A11，本报告内部编号；政策 = 决议 ② **声明 + 不照搬**）

| # | 症状【证据】 | 说明 |
|---|---|---|
| **A1** | 4 块（神醚/战武/萨伦/雷鸣，页 0 South）`mapId` 写死 **0**，点击全靠运行期 Hintbox"暂未开放"【实测 §3.1 + 源码 TeleportHandler.cs:42-48】 | 作者期没做"未开放不落板"校验。→ 目标行为（我们的面板要不要摆死块）**待 C3 design 拍板**。 |
| **A2** | `WorldMapBlock.prefab:228` 默认 click `int=70`：**实例忘覆盖就传送到图 70**【源码】 | 静默错传的陷阱。`Mod` 块即残留 `int=-50081`（方法被覆盖成 `OpenModMapPanel` 才没出事）。→ 我们：目标写死、**不留默认值**。 |
| **A3** | North/South 17 个氏族块**不覆盖 InfoPrompt 文本**（默认空串）⇒ 悬浮时浮层**开而无文**【实测 §3.1】 | 名字只上了块标题这一半。 |
| **A3′** | 反向：Ship/Content/Space 17 块**不覆盖块标题 `m_Text`** ⇒ 悬浮时标题吃预制默认 **"火幻氏族"**（`WorldMapBlock.prefab:81`）【实测】 | 两条文本通道（title / InfoPrompt）在两族块上**各漏一半、且默认值是别的图的名字**。 |
| **A4** | `Energy` 块标题 = `"\r能源之树"`（回车混进文本）【实测】 | 手摆残留；渲染无害但脏。 |
| **A5** | 负图镜像盘上共 **26 张** `-*.xml`【实测 ls】；面板只用了 `-70` 一张（Left Bar `Seer` 块） | 夜图**可以从大地图直跳**（不经昼夜钮、无 `switch` 校验）——照做与否待 C3 design。 |
| **A6** | `Map.IsMod` 把 `id==0` 判成 Mod（`Map.cs:40`）【源码】 | 语义混叠（0 既是"未开放"哨兵又是"Mod"）；M5 已把 0 当纯防呆。**不照搬**。 |
| **A7** | `MapCategory` 枚举只有 `Ship=1/Grass=2/Station=100`（`Map.cs:205-209`），而发行数据实测 category 取值 **1–16、100–105、200 共 22 档**【样本】 | 枚举失真；`worldId` 计算只用裸 int。 |
| **A8** | 小地图选面板 `Panel.OpenPanel("MiniMap"+categoryId)`，缺则**一律回退 `MiniMap1`（飞船内览）**【源码 MapWorldController.cs:31-33】；面板目录实测只有 `{1,2,3,4,5,6,7,9,11,12,100}` 十一块，而 cat 102（星球地表 **28 图**）、101（飞船舱 14 图）、103/104/105、13/14/16、200 等**无对应面板**【实测 ls + 样本 category 分布】 | 101 回退 `MiniMap1` 说得通（就是飞船）；**102 星球也弹飞船小图 = 明显错位**。→ 本功能（大地图）不含小地图；留给 C3 后续批。 |
| **A9** | 页 1 根节点名 **"Seer"（飞船）**，但 `worldNames[1]` = "新世界"，且 Ship 组（舱）与 Content 组（星球）都挂在这一页【实测 §2.1】 | 文档陷阱：页名 ≠ 页根名。 |
| **A10** | `MiniMapPanel.cs`（9 行）/ `MiniMapShipPanel.cs`（继承、空）**零成员**；且 `MiniMapShipPanel` **从未被任何预制挂载**、`MiniMap100/Panel.prefab` **连 `MiniMapPanel` 都不挂**（guid 计数 = 0）【实测 grep guid】 | "面板脚本"是死壳；`Resources/Prefabs/Map/Minimap Region.prefab` 同样**无任何脚本/预制引用**（孤儿资产）。 |
| **A11** | 面板**零门禁**：无解锁、无等级、无剧情校验，任何图（含夜图）点块即走【源码 TeleportHandler.cs:41-62 全程无校验分支】 | 上游事实如此。我们照不照 = C3 design 待拍板项。 |

**另一处非 bug 的口径提醒**：`docs/map/map-teleport.md:33/:93` 把"面板 `GoToMap`"归 **C2**，而 `docs/view/view-design.md §8` 明写 C2=物品/商店族、**C3=地图/世界族（WorldMap/MiniMap\*）** —— **前者为编号笔误**，C3 成文时按 `AGENTS.md §2` 同时修订（正本指针随 C3）。

---

## 8. 交下一环（C3 design）的输入清单

1. **内容表 = 本报告 §3 两张表**（37 块：页/组/mapId/名字/目标图名/category）——真值样本，直接搬。
2. **通路 = 已就位**：面板宿主 `host.js`（U0）+ 传送决议 `session.decideTeleport`（0⇒notOpen）+ `mapScene.js` 的 `teleport` sink ⇒ `gotoMap`（`#/map?slot=N&map=…` 带槽纪律 = `AGENTS.md §3`）。
3. **要拍板的设计位**（本文件只列形状、不定行为）：① 未开放块摆不摆（A1）；② 双文本通道合并成一条（A3/A3′）；③ 夜图块要不要（A5）；④ 解锁门禁有无（A11）；⑤ 版面：上游是"手绘世界画 + 热区"，我们按 §4.11/§4.12 先例 = **自绘最小 UI**（分页列表/宫格），美术归 A 组；⑥ MiniMap 族（含 A8 错位）留后批，本批范围 = **大地图钮 → 面板 → 传送指定 Room**（人类 2026-10-19 点名）。
