# 重启主场景 HUD 复刻 · 设计文档

> 状态：**已实现并验完（B1–B5 走完）**。本文保留为**设计期蓝图**，其中若干判断在实现期被
> `Assets/Scenes/Map.unity` + `Assets/Scripts/**` 推翻 —— **as-built 权威在 `docs/view/scene/room/view-scene-hud-impl.md` §10/§12，冲突以那里为准**：
> ① 底栏第 12 钮中文是「**基地**」不是「墓地」，图标一直在（`menu/home.png`，场景 `Home` 节点 GUID 反查；`menu/guild.png` 是**商店**那颗），设计期是看图误读；
> ② 头像改走重启客户端**本地 PNG** `Resources/Pets/icon/{petId}.png`，本文的 `res/pet/icon/{swfId}.swf` + 迷你 Ruffle 路线**作废**；
> ③ 队首卡血条右侧小红位 = **Recover**（`PetCorner.Heal()`），顶中绿圆钮 = **Day Night**（`flip.png`，tooltip「切换地图」）；
> ④ 天气钮上游 `MapInfoView.SetWeather` 在 `weather == 0` 时 `SetActive(false)` ⇒ 参考截图那张确实是空的；
> ⑤ 队首卡/队伍栏的 **Lv 不画**（场景有节点、运行时不显示），读数走 `data-lv` + tooltip；
> ⑥ 血条是**纯绿 `#77E20C`**（场景 `m_Sprite=0` 内建白图 + `m_Color`）。设计期那句「战斗线是 `hp color.png` 渐变」也是误记 ——
> 重启战斗线的 HP/怒条同样是**一层染色矩形被 mask 定形**（`Fight.unity` 里没有按宽度切片的渐变条，见 `docs/view/scene/battle/view-scene-battle-design.md` §2.4），
> 那张 PNG 在新版式里不再被引用。
>
> 权威口径：**几何/资产/路由 = Unity 源码；可见性 = 截图**（源码答不了运行时 SetActive 了什么）。
>
> 血统：本 HUD 属 **重启宇宙专属**（`game/app/**`，DOM 常驻 chrome 层），只在 `hud=0` 重启分支挂载；
> **AS3/SWF 线与 v2 存档逐字节不变**、**不碰 `game/core/**` 与 `tools/difftest.mjs`**、**面板零算数**。

---

## 1. 现状与差距

现有 `game/app/view/hud/restartHudView.js` 只是一条「顶栏 profile（名/Lv/货币）+ 底栏地图名」的骨架，
与截图差距很大：缺**左侧队伍栏**、**底栏 13 图标菜单**、**地球/齿轮按钮**、**队首真宠脸**。
⇒ 本 HUD 复刻是**新写**，不是在现骨架上换皮。

---

## 2. 参考截图分区（权威视觉目标）

HUD 压在地图/传送室场景之上，分 8 区（坐标换算到 **960×540 设计空间**，即截图像素 ÷2；
下列为**目测近似**，精确 `RectTransform` 实现轮从 `Assets/Scenes/Map.unity` 现取）：

| 区 | 内容 | 近似盒（960×540） |
|---|---|---|
| R1 队首卡（左上） | 青边盒：真宠脸 + 名「迪兰」+「HP」标签 + 绿血条「37/37」+ 右侧一个小红状态/药丸图标 | x[5..152] y[4..75] |
| R2 队伍栏（左侧竖排） | 队首卡下方一列 5 个青边方形宠脸缩略（可展开/收起） | x[8..66]，tile≈58×58，pitch≈68，y[98..440] |
| R3 顶中·返回钮 | 绿色圆形「刷新/返回」按钮（`recover.png`） | x[352..398] y[2..38] |
| R4 顶中·地图名横幅 | 深色横幅「传送室」+ 青色角括号 | x[415..545] y[4..30]（水平近居中） |
| R5 底左·地球钮 | 青边方形「世界地图」按钮 + 右上角小罗盘角标 | x[5..76] y[452..528] |
| R6 底栏·左组（玩法） | 图标+标签 7 钮：新闻(NEW)/活动/任务/要塞/SPT/灵兽/炼狱 | x[88..525] y[480..528] |
| R7 底栏·右组（系统） | 图标+标签 6 钮：信息/**图鉴**(黄色高亮)/指引/信箱(NEW)/**基地**/商店（「墓地」= 看图误读，真节点 `Home` = 基地） | x[537..885] y[480..528] |
| R8 底右·设定 | 青边方形齿轮「设定」钮 | x[905..955] y[467..530] |

> 截图中央三块「监视屏」与传送台平台、玩家「Linux」角色属**地图/世界层 SWF**（`mapRunner.swf` 背景），**不是 HUD** ⇒ 本设计不含。

---

## 3. 资产权威表（逐元素：真图 / 近似 / 缺）

**素材根**：`projects/Seer2-Restart-Lite-main/Assets/`（PNG 面板美术）+ 官方 Flash CDN `http://seer2.61.com/res/`（宠头像/动作 SWF）。
现 CSS 已按绝对路径直 serve Unity PNG（`ui.css:158` 的 `Fight/hp color.png`）⇒ 本 HUD 沿用同一取用方式（既定口径）。

| 元素 | 权威素材 | 状态 |
|---|---|---|
| 菜单图标 新闻/活动/任务/要塞/SPT/灵兽/炼狱/信息/图鉴/指引/信箱/商店 | `StaticResources/Sprites/Map/menu/{news,event,guide,mail,shop,dict,info}.png` + `challenge/{mission,spt,hell,station,god pet}.png` | **真图（已核实存在）** |
| 设定齿轮 | `menu/settings.png` | 真图 |
| 返回/刷新绿圆钮 | `StaticResources/Sprites/Map/recover.png` | 真图 |
| 地图名横幅底 | `StaticResources/Sprites/Map/map title.png` | 真图（角括号 CSS 补） |
| 地球/世界地图钮 | `Map/world button.png`（+ `world map.png`） | 真图 |
| 罗盘角标 | `Map/compass.png` | 真图 |
| 血条填充 | `Resources/Sprites/Fight/hp color.png`（+ `hp bar.png`/`hp bar mask.png`/`hp indicator.png`） | 真图（CSS 已用） |
| **宠物头像（队首卡 + 队伍栏）** | **原版头像路由 `res/pet/icon/{swfId}.swf`**（`URLUtil.getPetIcon`，`swfId==resourceId==id` 常规），本地镜像 `swf/pet/icon/`，抓取器 `tools/fetch-pet-icons.mjs` | **真图（已抓首批，见 §7）** |
| 青边盒 / 角括号 | 场景用 Unity 内建白 sprite 染色（67 处），**无边框 PNG** | **近似**：CSS `border`+`border-radius`+`box-shadow`（沿用现状） |
| 货币符号（◈/✦） | 无独立图标资产；`items.json` id1=赛尔豆/id2=星钻是数值权威 | **近似**：文本字形（现状），值读 `A.state.trainer` |
| 墓地（R7 有一钮） | **全仓库无对应图标**（已搜场景名 + 图标目录） | **缺**：占位字形 + 诚实 tooltip |
| 底栏菜单的「列表定义」 | **不在任何 `.cs` / 数据表**，只以场景节点存在于 `Assets/Scenes/Map.unity`（`Menu Area:5786`/`Function Bar:7632`/`News:19740`/`Event:3053`/`Mission:3795`/`Hell:5980`/`SPT:13236`/`Dict:6655`/`Mail:16514`/`Guide:12097`/`Shop:284`/`Setting Icon:10397`/`God Pet`/`Station`…） | **权威 = 截图 + 场景节点名**（据此定 13 钮） |

**待辨一项**：R1 队首卡血条右侧的**小红图标**语义未定 ⇒ 实现轮先从 `MapPetCornerView.cs`/场景节点坐实，坐实前画占位红点 + tooltip「待辨」，不猜成具体系统。

---

## 4. 逐区域设计规格

### 4.1 R1 队首卡
- 青边盒（CSS 近似），内含：真宠脸（左，§4.9）+ 名（`A.nameOf(lead)`）+「HP」标签 + 绿血条
  + 血条文本 `lead.hp + '/' + round(A.hpMax(lead))`（**分数直读、零算数**，`bar.set(lead.hp/A.hpMax(lead))`）+ 右侧小红状态位（§3 待辨）。
- 数据源：`A.state.team[0]`。队空 → 「队伍为空」占位（沿用 `renderLead`）。Lv：截图卡面未显式标 ⇒ 默认不画，留 `data-lv` tooltip。

### 4.2 R2 队伍栏（左侧竖排）
- 一列方形宠脸缩略，源 `A.state.team.slice(0,6)`（`TEAM_MAX`），每格 = 真宠脸（§4.9）+ 元素色描边。
- **点击格** → 复用现有 `openRestartPetBag()`（精灵背包模态，已落）并定位该宠。
- 展开/收起行为留实现轮（上游 `MapPetCornerView.cs:23-42 Extend()`：滑到 `x=-150`）；首版常显。

### 4.3 R3 返回钮 / R4 地图名横幅
- R3 `recover.png` 绿圆钮：**语义待坐实**（上游 `Recover` 节点 + `OnAfterHeal` 提示 ⇒ 疑「精灵恢复」非「返回地图」）⇒ 坐实前点击走诚实「待建」。
- R4 地图名：`setMapTitle(M.map.name)`（**已接线**，值来自 `game/data/maps.json` 的「传送室」）；横幅底 `map title.png`，青色角括号 CSS 补。

### 4.4 R5 地球/世界地图钮 + 罗盘角标
- `world button.png` + `compass.png` 角标。点击 → 现有 `onMap`（当前 logLine 占位）⇒ 指向**未来「世界地图面板」**（上游 `MapBlockView.OpenModMapPanel`→`WorldMap`，本仓库未建）⇒ **诚实「待建」**。

### 4.5 R6+R7 底栏 13 钮（全复刻为视觉 chrome）
统一格：`icon PNG` + 中文标签 + 可选 NEW 红角标；`图鉴` 默认带**黄色高亮态**（对齐截图，装饰性）。
点击路由（**有后端的接现成 handler，无后端统一 `待建` tooltip + logLine，绝不伪造子面板**）：

| 钮 | 图标 | 点击 |
|---|---|---|
| 新闻(NEW) | `news.png` | 待建（上游 `NewsPanel`，`MapSceneView.cs:533` 每日登录自动弹） |
| 活动 | `event.png` | 待建 |
| 任务 | `mission.png` | 待建 |
| 要塞 | `station.png` | → `onStation`：**上游不是面板，是跳转**（`MapMenuController.cs:34 GoToStation()` → `GoToMap(worldId*10000+81)`，2026-10-19 落码，as-built 见 `view-scene-hud-impl.md §12.7`） |
| SPT | `spt.png` | 待建 |
| 灵兽 | `god pet.png` | → `onGodpet`：开**灵兽/精灵王面板**（上游 `MapMenuController.OpenPanel("SoulPet")` → `Panels/SpriteKing`；3×3 灯位 + 领取约瑟 + 兑换商店 + 规则；6v6/2v2/1v1 挑战 = 诚实待建（A 组围栏）。2026-10-19 落码，正本 = `docs/view/panel/godpet/`，as-built 见 `view-scene-hud-impl.md`） |
| 炼狱 | `hell.png` | → `onHell`：**上游也不是面板，是跳转**（`Map.unity` 的 `Hell` 节点绑 `MapMenuController.GoToMap` 实参 **`1080`** ⇒ 进「炼狱入口」，2026-10-19 落码，as-built 见 `view-scene-hud-impl.md §12.8`） |
| 信息 | `info.png` | 待建 |
| **图鉴**(高亮) | `dict.png` | → `onDex`（现占位；未来 `restartDexView`） |
| 指引 | `guide.png` | 待建 |
| 信箱(NEW) | `mail.png` | → `onItemBag`：**人类 2026-10-19 要求这颗钮改开道具背包**（上游 `Mailbox` 面板本身仍待建；as-built 见 `view-scene-hud-impl.md §12.10`） |
| 墓地 → **实为「基地」**（本份头部追记 ①：设计期看图误读，节点 = `Map.unity` 的 `Home`、素材 `menu/home.png`） | `home.png` | → `onHome`：**跳转、不是面板**（上游 `Home` 节点绑 `MapMenuController.GoToMap` 实参 **`50000`** ⇒ 进「小屋」；`mod_home` 的 `map_id` 覆盖位按 **ACQ3** 仍不接，2026-10-19 落码，as-built 见 `view-scene-hud-impl.md §12.8`） |
| 商店 | `shop.png` | 待建（未来 `ItemShop`，U5） |
| 设定(R8) | `settings.png` | → `onSystem`（现占位） |

### 4.6 R8 设定齿轮
`settings.png` 青边方钮，点击 → `onSystem`（现 logLine 占位 ⇒ 未来设置面板）。

### 4.7 顶栏 profile / 货币 / 图鉴计数（现有元素的去留）
- 截图**顶栏没有** profile 名/Lv/coins/◈ 那一排（现 `restartHudView` 顶栏在截图里无对应物）⇒ 设计**移除现顶栏 profile 条**，以截图为准；
  若产品要留货币/图鉴读数，另议一个截图未覆盖的角落（不破坏贴合度）。**默认：删顶栏 profile 条。**

### 4.8 宠物头像管线（原版头像路由，用户拍板）
- **源**：`swf/pet/icon/{swfIdOf(petId)}.swf`。`swfIdOf`（`content.js:45`）把重启 petId 桥到官方 `monsters[id].swfId`（缺位退回 id）。
- **抓取**：`tools/fetch-pet-icons.mjs`（已存在、内建礼貌抓取：并发≤3、请求预算、160ms 间隔、SWF magic 校验 CWS/ZWS/FWS、跳过已存在 >200B）
  ⇒ **仅本地学习、不二次分发、不做压测**。补抓显式 id：`node tools/fetch-pet-icons.mjs --ids="<swfId 列表>" [--budget=80] [--conc=2] [--spacing=160]`。
- **DOM 渲染**：头像 SWF 很小（~2.4KB、多为单帧）⇒ 每格挂一个**常驻 Loader 的迷你 Ruffle**（复用 `vendor/seer2-pet-animator` 的 `<pet-render url=…>` 自定义元素，
  或 `restartFighterStage.js` 已有的 Ruffle 加载路子）。**硬坑先例**（`petbag-handoff.md:34`）：载入对象不能从 Loader 摘出（Error #2069）⇒ **每格常驻一个 Loader**、换宠往同一 Loader 重 `load()`。
  （可选优化：若本机有 headless SWF→PNG 渲染器，构建期把 icon SWF 首帧烘成 PNG 用 `<img>`，运行时更轻；可行性实现轮验，不作承诺。）
- **降级**：`swfIdOf` 无桥 / 该 icon 未抓或 404 → 回退**元素色色块 + 名首字**（现状口径，诚实不空图）。
- **纪律**：头像只作表现，**数值仍全读 `A.*`**；不新增算数；不碰内核。

### 4.9 R9 收起/唤出 HUD 的箭头（人类 2026-10-19 要求 · 上游没有的额外入口）
- **位置** = 「精灵背包」卡（R1 队首卡，场景 `PetCorner`，hover 文本正是「精灵背包」）**右缘外侧、垂直居中**。
- **行为** = 点一下把**整块常驻 HUD**（R1–R8 全部）收走，只留这颗箭头；再点一下唤回。用途 = 截图/看画面时清屏。
- **箭头方向**：HUD 在位 ⇒ 指左（点一下收走）；HUD 已收 ⇒ 指右（点一下唤回）。
- **素材** = 原版 `StaticResources/Sprites/Map/arrow.png`（24×24 青三角），方向由 CSS 旋转得到（上游没有现成的左右向图）。
- **状态延续** = 换图会重建 HUD ⇒ 收起态**跨图保持**（收着传送不该自己弹回）。
- **不越界**：本钮只动 HUD 这一层 DOM，**不影响**地图/光口/NPC/对话浮层，也**不影响**已开的模态面板（背包、商店等）。
- 上游对照：`MapPetCornerView.cs:23 Extend()` 确实有一套「收起」逻辑，但它只把 `PetCorner` 滑到 `x=-150`（收一格里、不是整块 HUD），
  且 `Assets/Scenes/Map.unity` 里**没有任何节点调用** `MapPetCornerController.Extend()` ⇒ 本钮不是复刻，是**我们新加的**（登记见 §8 第 8 条）。

---

## 5. 读数接线（零算数总表）

| 显示项 | 唯一来源（现读，不计算） |
|---|---|
| 队首名 | `A.nameOf(lead)` |
| 队首 HP 分数 | `lead.hp` / `A.hpMax(lead)`（`bar.set` 比值） |
| 队首/栏宠脸 | `content.swfIdOf(petId)` → `swf/pet/icon/{swfId}.swf` |
| 队伍栏成员 | `A.state.team`（≤`TEAM_MAX`） |
| 地图名「传送室」 | `M.map.name`（`maps.json`） |
| 元素色描边 | `content.petConfig(petId,level).elementId` → `elementColor/elementName` |
| 货币（若保留） | `A.state.trainer.coins/diamonds`（`items.json` id1/id2 权威） |
| 图鉴计数（若保留） | `A.state.dex` 的 caught/seen 计数（沿用现 `update`） |

`update()` 仍由 `mapScene.js` 的 `refreshHud()` 统一驱动（挂/更），`setMapTitle()` 在 `mapReady` 后喂 `M.map.name`。

---

## 6. 与现有代码的关系（改造面，本轮不改，仅登记）

- **重写 `restartHudView.js`**：从「顶栏+底标题」骨架 → 上述 8 区 DOM（`.rbh-*` 扩，几何近似 + 可从 `Map.unity` 精修）。
  保留 `create(container,A,handlers)→{update,setMapTitle,destroy}` 契约与 `handlers`（`onPetBag/onItemBag/onDex/onMap/onSystem`），**新增** `待建` 占位回调 `onTodo(label)`。
- **`mapScene.js`**：`mountRestartHud/refreshHud` 调用点不变，仅多传 `onTodo`；**`as3` 分支与 `pushHud()` SWF 路径逐字节不动**。
- **`ui.css`**：新增 `.rbh-card/.rbh-rail/.rbh-portrait/.rbh-menu/.rbh-menu-btn/.rbh-badge/.rbh-globe/.rbh-gear/.rbh-return/.rbh-title`；直 serve Unity PNG 绝对路径（同 `hp color.png`）。
- **不碰**：`game/core/**`、`tools/difftest.mjs`、`session.js/stats.js/settle.js/phases/**`、两条真值树。
- **面板层不变**：`host.js` 的 `ensureLayer/openPanel` 机制沿用（HUD 仍是常驻 chrome 层，背包仍是模态）。

---

## 7. 宠物头像素材抓取状态

- **路由坐实**：`URLUtil.getPetIcon` = `res/pet/icon/{swfId}.swf`（`http://seer2.61.com/res/`，`swfId==resourceId==id` 常规）。
- **覆盖缺口**：重启 838 只宠 → 去重 swfId 838 个；开工前 `swf/pet/icon/` 仅命中 41 个（野怪池）。
- **首批已抓（2026-10-16）**：最低位 80 个缺失 swfId（含队首宠 迪兰 id1 → `1.swf` 2799B 有效 Flash），
  `fetch-pet-icons.mjs --budget=80 --conc=2 --spacing=160` → **成功 80 / 404 0 / 失败 0**；`swf/pet/icon/` 现 128 支。
  ⇒ 默认/早期队伍（迪兰线、休咻线…）已有真宠脸。
- **剩余**：约 717 个 swfId 未抓 ⇒ **分批按预算续抓**（每批 ≤80、礼貌间隔，非压测）。
  实现轮可写一个小 helper：算「当前存档 team 的 swfId 差集」→ 生成 `--ids` 批次，或按 id 段全量分批。
- **纪律**：仅本地学习用途、不二次分发；缺素材格 HUD 走色块降级。

---

## 8. 已知边界 / 诚实声明（D2 许可）

1. 布局像素是**近似**（无逐面板 prefab 权威）；精确几何实现轮从 `Assets/Scenes/Map.unity` 现取 `RectTransform`。
2. 青边盒/角括号是 CSS 染色近似（重启场景本就内建白 sprite 染色，无边框 PNG）。
3. **13 钮里 4 个无后端**（新闻/任务/信息/指引）⇒ 视觉全画、点击诚实「待建」，**不伪造任何子面板内容**（对齐越界槽位灰化先例）。
   ~~5 个（含信箱）~~ **追记（人类 2026-10-19）**：**信箱**钮改接**道具背包**入口（上游 `Mailbox` 面板本身仍待建，`view-scene-hud-impl.md §12.10`）。
   已接后端的 9 个：**活动**（`docs/view/panel/activity/`）、**SPT**（`docs/view/panel/spt/`）、**灵兽**（`docs/view/panel/godpet/`，2026-10-19 落码；其 6v6/2v2/1v1 挑战钮仍诚实待建、属 A 组围栏）、**图鉴**（`docs/view/panel/dex/`）、**商店**（`docs/view/panel/shop/`）、**信箱→道具背包**（§4.5 该行）、
   以及**三颗跳转钮**：**要塞**（§4.5 + `view-scene-hud-impl.md §12.7`）、**炼狱**、**基地**（同一族，`§12.8`）—— 上游绑的都是 `GoToMap`/`GoToStation`，**不是面板**。
4. 宠头像用**原版 `res/pet/icon/{swfId}.swf` 路由**（既定 `swfIdOf` 桥），首批已覆盖早期队；全量分批续抓；带 ≤6 迷你 Ruffle 实例的性能成本；缺素材降级色块。
5. ~~墓地图标缺素材~~ **追认作废**（本份头部 ①：那颗是「基地」、素材 `menu/home.png` 一直在盘上，看图误读）；
   仍待辨的只有**队首卡红状态位语义**（已坐实 = `Recover`/`PetCorner.Heal()`，见 `view-scene-hud-impl.md §10`）⇒ 本条只剩"该功能本身未建"。
6. 顶栏 profile/货币条截图无对应 ⇒ 默认删（以截图为准）。
7. 本 HUD 属**重启宇宙专属**；AS3/SWF 线与 v2 存档逐字节不变。
8. **两处上游没有的额外入口**（不冒充原版，如实登记）：① ~~栏底「道具」格（§3.5 偏离，虚线框弱化）~~ **已摘除**（人类 2026-10-19：道具背包入口改由「信箱」钮承担，`view-scene-hud-impl.md §12.10`）；② **R9 收起/唤出 HUD 箭头**（§4.9，人类 2026-10-19 要求；素材借原版 `Map/arrow.png` 旋转）。

---

## 9. 验收判据（留给实现轮的 harness 草案）

未来 `tools/rbattle-hud-layout-test.mjs`（puppeteer，重启宇宙 `#/map`）应断：
- 8 区 DOM 齐（队首卡 / 栏 N 格 / 返回钮 / 标题「传送室」/ 地球 / 底栏 13 钮 / 设定）；
- 底栏 13 钮**逐个可点**：有后端的开对应面板、无后端弹「待建」且**不崩**（console 0 错）；
- 队首卡 HP 分数 == `lead.hp/A.hpMax(lead)`（零算数核对）；
- 队首/栏宠脸经 `swfIdOf` 桥加载 `swf/pet/icon/{swfId}.swf`（缺素材格回退色块、不空图）；
- 地图名 == `maps.json` 当前图名；
- **AS3 线逐字节不变**（`rbag-restart-hud-bag-test` 等既有 harness 仍绿）、`game/core/**` 零改动、
  `node --test game/core/` 与 `difftest` 基线不动（纯 app 层）。

---

## 10. 实现分批建议（下一轮）

- **B0 素材**：按 §7 分批续抓 `swf/pet/icon/`（可入队宠的 swfId 全量，礼貌预算）。
- **B1 骨架贴合**：重写 `restartHudView.js` 出 8 区 DOM + CSS 近似几何 + 真图标（先色块占位头像）→ 截图并排比。
- **B2 读数接线**：队首卡/栏/地图名接 `A.*`/`maps.json`，删顶栏 profile 条，`待建` 回调统一。
- **B3 头像管线**：`swfIdOf` 桥 + 迷你 Ruffle（每格常驻 Loader）+ 降级色块；实测 ≤6 实例性能。
- **B4 精修**：从 `Map.unity` 提 `RectTransform` 修几何；坐实返回钮/红状态位语义；补罗盘/角标。
- **B5 harness + 文档**：`rbattle-hud-layout-test.mjs` + 更新 `ui-handoff.md` U3 / `RESUME.md`。
