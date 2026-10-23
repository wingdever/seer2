# UI 线（重启面板复刻）· 交接与规划

> **状态：U1 已完成 + 遇怪→内核战斗→回图闭环已接通 + S5-v3 真·重启原生存档已落地 + U3-HUD/U4-Bag 主场景分层与重启原生 HUD·精灵背包已落地 + U5-Battle 重启战斗舞台（地图背景 SWF + fight-SWF 宠动画 + 战报增量驱动 clip · 纯表现层，数值仍全 core/unity、DOM 仍全 chrome）已落地（2026-10-16），**U2 捕捉+换宠已接内核（S6 批三：`Capture`/`PetChange` 真结算、多宠袋换宠、无门槛胶囊捕捉落档；道具/对手阵容/手牌/战斗记录仍待补；**逃跑已接内核（2026-10-19，`view-scene-battle-impl.md §15`）**。** 本文件是 UI 线唯一入口，冷启动读这一份就够。
> **U0 产物**：面板宿主 `game/app/view/panels/host.js`、样板面板 `game/app/view/panels/hintbox.js`、
> 样式基座 `game/app/ui.css`、入口 `game/index.html#rvDemo`、验证探针 `tools/probes/tmp-rv-hintbox.mjs`；
> 截图留档 `/tmp/rv-hintbox-{1,3}.png`（Two Options / One Option）。
> **定位**：总目标（见 `README.md`「总目标（北极星）」）三条支柱里，**支柱 1「玩法机制复刻重启」**的一条腿，
> 与**内核线**（`docs/engine/kernel-handoff.md`，S1…S6）并列。内核线管"算得对"，本线管"看得见、点得动"。

---

## 1. 这条线为什么现在才立（规划真空的来历）

不是被否掉，是**在改编号时掉了**：

- 唯一一次规划是 `/home/wing/.qoder-cn/plans/silver-flint-dace.md` 的 **S6「五个面板 + 最小 HUD」**，
  明确写了「**面板按重启 IA**」（选档 3 槽 / 战斗底栏 7 槽 / 宠物背包 / 仓库 / 图鉴）。
- 但那份计划的 **S1–S6 编号后来被 `docs/engine/kernel-handoff.md` §4 整体重写**成了
  「求值层 / oracle / 数值层 / 战斗内核 / 同种子重放 / 结算成长 / 内容宇宙接表」——**S6 变成了"接表"**，
  UI 那条在改编号时掉了，之后没有任何文档认领。
- 与此同时实际落地的是**另一条血统**：原版 AS3 SWF 面板（HUD 注入 + `ItemBagRunner` + `PetBagRunner`，
  全在 `game/maprunner/` 走 Ruffle）。近三个计划（`sharp-storm-sandpiper` / 物品背包 / 精灵背包）
  都在**加深这条原版线**，与重启无关。
- 判据：`docs/` 全库 grep `重启.*面板|UI面板|Restart.*UI` → **0 命中**（2026-10-15）。

## 2. 已拍板的四条决策（2026-10-15）

| # | 决策 | 直接后果 |
|---|---|---|
| D1 | **UI 以重启 IA 为准** | 面板布局 / 信息架构照 `Seer2-Restart-Lite-main`；已完工的原版 AS3 面板（HUD / 物品背包 / 精灵背包）降级为**过渡件 / 纯演出**，不再是终局 |
| D2 | **逐面板手写 DOM**（不写 prefab→DOM 转换器） | 可控、无转换器长尾；代价是 ~40 个面板是长尾工作量，需按优先级推进 |
| D3 | **首批做战斗 UI + 战斗底栏** | 与正在移植的 S3 内核直接联调，是"效果被看见"的最短路径 |
| D4 | **先写规划文档，实现推后** | 本文件；不打乱内核步骤 4 |

> D2 的取舍依据：prefab 虽是结构化 YAML（`RectTransform.anchorMin/Max/pivot/sizeDelta` + `Image` 引 PNG），
> 理论上可脚本化；但面板里混着 TMP 文本、`LayoutGroup`、`Spine`/序列帧、以及大量 `[SerializeField]` 注入，
> 转换器要覆盖的边角比手写一个面板还多。**先用样板验证，真需要通用化再回头做**。

## 3. 两个 UI 宇宙（当下并存且互不兼容）

| | **重直线**（本线，终局） | **原版线**（现状在场） |
|---|---|---|
| 来源 | `projects/Seer2-Restart-Lite-main/Assets/Resources/Panels/**` | 官方 AS3 `swf/module/app/*.swf` |
| 格式 | Unity UGUI prefab（YAML）+ 独立 PNG | SWF 符号 + DefineFont2 子集字体 |
| 浏览器渲染 | **不认**，必须转 DOM 或重写 | Ruffle 直渲（已跑通） |
| 数据源 | 与已移植内核**同源**（838 宠 / 5340 技 / 2121 buff / 612 物品） | 原版宇宙（1016 宠 / 8658 技） |
| 中文 | DOM/TMP，**无字体坑** | Ruffle 画不出，必须 DOM 覆盖层（见 `docs/legacy/web-client-notes.md`「负结果记录」） |
| 现状 | **0 行** | HUD、物品背包、精灵背包已完工并浏览器验证 |

> 两套并存这件事本身，正是支柱 3「**多内容宇宙 + 多格式素材兼容**」的落点：
> 同一个"精灵背包"概念，官方侧是 `PetBagPanel.swf`、重启侧是 `Panels/PetBag/Panel.prefab`，
> **语义不同、不得合并**（与 `README.md`「数据血统」同一条纪律）。

## 4. 重启 UI 的实际体量（实测，非估算）

- **6 个场景**：`Assets/Scenes/{Login,Title,Game,Fight,Room,Map}.unity`
- **面板根 ~40 个**：`Assets/Resources/Panels/<Name>/Panel.prefab`
  （PetBag / PetStorage / ItemBag / Fusion / ItemShop / Mission / Mailbox / PlayerInfo / SignReward /
  Settings / Door / News / Cook / Lottery / SoulPet / SPTBoss / SpriteKing / SecretSkill / TwelveRound /
  YiTeRogue / Workshop / WorkshopStoryBrowser / WorldMap / MiniMap1..12 / MiniMap100 / OldPetBag /
  Noob / Pond / GuideLine / Mod / Activity / PetDictionary / SelectNumHintbox / ItemHintbox / PetSelectHintbox / Hintbox）
- **战斗 UI**：`Assets/Resources/Prefabs/Fight/*.prefab`（14 个：伤害数字 / 伤害背景 / 暴击 /
  必杀起手与命中 / Flash / 换宠按钮 / 技能按钮 / Buff 按钮 / 经验块 / 捕捉块 / 战斗记录按钮 …）
  \+ `Assets/Resources/Sprites/Fight/*.png`（~60 张：HP 条与遮罩、怒气条、按钮 normal/chosen、
  伤害 normal/weak/resist/absorb/miss、暴击、天气、结算 win/lose/capture、经验条、2v2 等）
- **MVC 三层**：`Assets/Scripts/MVC/{Controller,Model,View}/**`，Controller ~90 / View ~100 个类
- **基类链**：`View/Basic/{Module → UIModule → Panel}`；`Panel.OpenPanel(name)` →
  `ResourceManager.instance.GetPanel(name)` → `Instantiate` 到 `Canvas`
- **战斗面板的合成**（首批的骨架，都已读过源码）：
  - `BattleSystemView` —— 组装根：`BattleResourceView / BattleOptionView / BattleWeatherView /
    BattlePetBuffView / BattleAudioView / BattleResultView` + `Timer`（PVP）+ 单双打互斥对象两组
  - `BattleOptionView` —— 底栏 7 槽 + 战斗记录面板：`options = [skillView, changeView,
    captureController, itemController, escapeView, opChangeView, cardHandView]`，卡牌模式默认停在第 7 槽
  - `BattlePetSkillView` —— 4 普攻块 + 必杀 + 无操作 + 进化 + 附属精灵；可用性由 `BattleRule`
    （PP / Anger / 默认）三分支决定

## 5. 素材现状（回答"要不要额外下载"）

**结论：首批（战斗 UI + 底栏）不需要额外下载，仓库自带全套。** 证据：

| 素材 | 状态 | 位置 |
|---|---|---|
| 战斗 UI 元件 PNG | **已有** | `Assets/Resources/Sprites/Fight/*.png` |
| 卡牌框 / 必杀起手帧 | **已有** | `Sprites/Fight/Card/`、`Sprites/Fight/PowerSkillStart/` |
| KO 动画帧 | **已有** | `Assets/Resources/Animation/Fight/KO/sprites/` |
| 暴击特效 | **已有** | `Sprites/Battle/CriticalEffects/` |
| 属性 / 性别 / 品质 / 性格 / 按钮图标 | **已有** | `Sprites/Game/{Elements,Emblems,Genders,IV,Personality,Robot,Hint Box}/` |
| 面板自带美术 | **部分已有** | `Panels/<Name>/Sprites/*.png` |
| **精灵战斗动画** | **缺失**（本 Lite 分发被剪掉） | `Assets/PetAnimation/` 只剩 `.meta`，目录不存在 |
| **AssetBundle** | **缺失**（只剩 `.meta`） | `Assets/AssetBundles/` 不存在 |
| BGM | **只有零星几首** | `Resources/BGM/fight/{KO,PetChange}.mp3`、`FutureResources/BGM/地球/*.mp3` |

判据：`**/*.gif` = 0、`**/*.{skel,atlas,atlas.txt}` = 0（所以精灵动画既不是 GIF 也不是 Spine，
而是随 AssetBundle 运行时下发 —— 本 Lite 源里没有）。

**处置**：精灵视觉走**原版素材**（`swf/fight/*.swf` 1606 个、`swf/pet/normal/*.swf`、
`game/petContainer.root.swf`），这正是支柱 2「素材取自原版与改版游戏」的口径，**不阻塞**。
只有当某个重启**独有**的形态 / 特效在原版找不到时，才需要定点补下载（届时按单个资源名要，不做整包）。

## 6. 技术路线（逐面板手写 DOM）

- **落点**：新增 `game/app/view/panels/*.js`（每个面板一个 DOM 组件）+ `game/app/ui.css`；
  与既有 `game/app/scenes/*.js` 同层，走现有 hash router 与 `state.js` 内存态。
- **数据只读内核**：面板**不自己算数**，一律读 `game/core/**` 导出的选型成果
  （`BattleState` / `BattlePet` / `Skill` / `Buff` / `Item`），与 `difftest` 保护的是同一份实现。
- **中文**：DOM 原生文本，**不再需要**原版线那套 `#lbl` / `#hudtxt` / `#bagtip` 画布补描。
- **素材**：优先用重启 `Sprites/**`（PNG 直接 `<img>`），缺的用原版（SWF 侧仍走 Ruffle 演出层）。
- **不复用**原版线的 `game/maprunner/*Runner.as` 面板逻辑；HUD 是否保留待到 U3 再判。

## 7. 路线图 U0…U5

每段都必须**单独可停、单独可验**。

| 段 | 内容 | 判据 |
|---|---|---|
| **U0** ✅ | 决策固化 + **一个最小面板样板**打通（`Hintbox`）：证明 DOM 手写路线、素材取用、中文、与内核数据的接线方式。产物 `view/panels/{host,hintbox}.js` + `ui.css` | **已完成**：`#rvDemo` 可弹/关面板；正文 5 行全部来自 `petConfig(1,100)`（迪兰 Lv100 + 拍打 40/95）；4 张 Hint Box PNG 解码成功；点 Cancel/Confirm 后栈归 0；`elementFromPoint` 命中下层 Ruffle（面板层不挡舞台）；像素证据 4 条（盒体黑 + 左缘外 2px 纯白 Outline + 标题带青色字 + 盒外见舞台底色）；`errors: none` |
| **U1** ✅ | 战斗 UI 骨架：`BattleSystemView` 对应物（资源条 / 天气 / Buff 条 / 结算）+ 战斗底栏 7 槽 + `BattlePetSkillView` 的 4 普攻/必杀/无操作可用性 | **已完成（2026-10-16）**：新增薄内核驱动 `game/app/battle/driver/{tables,hostPetView,phaseUi,coreBattleDriver}.js`（浏览器里跑真·重启内核战斗，开 JUDGE 接缝，绕 BattleStart/RoundStart/BattleEnd 三围栏），新场景 `scenes/rbattleScene.js`（`#/rbattle`，与原版 `#/battle` 并存不合并）+ 七个面板 `view/panels/battle/*`。判据：`tools/rbattle-selftest.mjs` 14/14（无操作 hp 不变 280/360、两条登场各一、无 NOT_PORTED 泄漏、真伤技 `拍打` 敌方 hp 逐回合降且出「點傷害」战报）；`tools/rbattle-hudtest.mjs` 12/12（六面板就位、技能按钮 5、底栏 7 槽、点击过回合掉血、血条宽比 == 内核 hp/maxHp、Buff 网格随 `脱力→物攻弱化` 出现、真 KO→结算弹窗）；`#/rbattle` 纯 DOM（0 个 ruffle-player）且 unmount 清 `window.__battle`，`#/map`·`#/battle` 原样可进；`game/core/**` 零改动、`node --test` 265/265、`difftest` 基线 30308/29819/0/0/0 不变（浏览器开 JUDGE 与 oracle 进程隔离，实测未污染）。**闭环已接通（2026-10-16）**：地图顶栏「重启内核战斗」开关 → `#/rbattle` 读真存档队首 vs 野怪 → 内核战斗 → KO 结算（复用 `game/logic` 做经验/图鉴/hp 写回）→ 回图递 `APP.lastResult`；见 §9「U1 闭环补记」。<br>**⚠ 上述 6 槽/7 平铺底栏的版式已被推翻（2026-10-16，B1–B5）**：U1 骨架当时无 `Fight.unity` 权威，属近似。现按截图逐区复刻完成 —— 顶带两块血牌 + 底栏页签互斥 + 条单层染色 + buff 网格 + 记录面板；蓝图 `docs/view/scene/battle/view-scene-battle-design.md`、施工图与 **as-built `docs/view/scene/battle/view-scene-battle-impl.md §14`**、过程记要 §9.9。判据 `tools/rbattle-fight-layout-test.mjs` **59/59** + `rbattle-hudtest.mjs` **17/17**（旧 12/12 的断言是旧 IA，整件重写）。`optionView` 七平铺槽 / `resourceView` 双侧 HUD 已退役 |
| **U2** 🟡 | 战斗余下件：换宠（含对手阵容）/ 捕捉 / 道具 / 逃跑 / 卡牌手牌（可灰化）/ 战斗记录 | **捕捉 + 换宠已接内核（2026-10-16，内核 S6 批三）**：`coreBattleDriver` 喂多宠袋（v3 `state.team`→`Unit(bag,…)`）、`isCaptureOK:true`、`useCapture(itemRow)`（`effectFromRow`+`checkAndApply`）/ `switchPet(index)`（`getPetChangeEffect`+`apply`）；`optionView` 换宠/捕捉槽在重启遇怪态置活；`captureView.js` 只画候选（**面板零算数**，概率/门槛全在 `Capture`/`PetChange` 算子里）；捕捉成功读 `result.isCapture` 走 save-side `addPet+settleRestart(outcome:'capture')`（`_authority.capture='kernel-capture+save-side'`）。判据：`rbattle-capture-test 19/19`（prob100 成功→state=5+落档、无门槛胶囊真跑、等级门槛胶囊 `NOT_PORTED` 诚实拒绝不消耗、prob35 掷点消耗）、`rbattle-switch-test 13/13`（cursor 0→1→0、在场宠换身、读数=内核权威、v2 不写）。<br>**战斗记录面板已落（2026-10-16，B5）**：`.rbb-record` `(280,245,360,180)` 默认收起、把手骑面板沿 ±180、展开行序 == `driver.reports()`、滚到底 —— **道具/逃跑/对手阵容/手牌仍待补**；带等级门槛的胶囊（10001/10002）因 `Pet.GetPetIdentifier("level")` 未搬（§8 宠表围栏）暂不判捕捉。（注：这两个 harness 在战斗版式重写中只换了选择器 —— 入口从平铺槽改成 `.rbb-option[data-mid=…]` + `--live` 页签，断言未降级。） |
| **U3** 🟡 | 地图 / 主界面 HUD：`MapSceneView` + `MapInfoView` + `MapBlockView` + `MapPetCornerView` 等 | **常驻 HUD 已替换（2026-10-16）**：重启线主场景 SWF `HudRunner` 让位（`hud=0`）、DOM 常驻层 `view/hud/restartHudView.js` 接管，读数全来自 `A`/`content`（零算数）；见 §9「U3-HUD + U4-Bag 补记」「U3-B4 主场景 HUD 逐区复刻补记」。判据「是否替换原版 HUD」= 已（开关拨上时替换、不拨逐字节不变）。**主场景 HUD 已按截图逐区复刻完成（B1–B5）**：8 区 DOM、几何逐条 == `Assets/Scenes/Map.unity` 的 `RectTransform`、底栏 13 钮全视觉 chrome、无后端点击诚实「待建」；头像改走重启客户端**本地 PNG** `Resources/Pets/icon/{petId}.png`（设计期的 `res/pet/icon/{swfId}.swf` + 迷你 Ruffle 路线**作废**）。施工图与 as-built = `docs/view/scene/room/view-scene-hud-impl.md`（**冲突以 §10/§12 为准**），蓝图 = `docs/view/scene/room/view-scene-hud-design.md`；地图 `MapBlock/Info` 面板本体仍待补 |
| **U4** 🟡 | 精灵背包 / 仓库 / 图鉴：`PetBagView` + `PetStorageView` + `PetDictionary` + `Pet/{Basic,Dict,Storage}/**` | **精灵背包 + 道具背包模态面板已落（2026-10-16）**：`view/panels/restartPetBagView.js`（出战队/仓库列表 + 六维/技能/进化详情 + 入队/入仓/放生，与 v3 闭合）；`view/panels/restartItemBagView.js`（道具列表 + 说明/效果详情，**只读**：名称/类型/效果读 `unity/items.json`、数量读 `A.state.items`，「使用」灰化属 U2/S6；**★ 2026-10-17：规则那半已立** ⇒ `docs/item/item-design.md`（§4.3 使用路径 + **ITQ2**），见「U4 道具背包补记」）。图鉴/EV/筛选/排序/分页待补。⚠️ **2026-10-17 更新**：背包/仓库已按 C1 从 `restartPetBagView.js` 搬到 `game/app/view/petbag/**`（三层 IA + 8 钮操作列；过渡件 `restartPetBagView.js` **已删**） |
| **U5** | 场外面板：`ItemShop` / `Mission` / `Mailbox` / `Dialog` / `Npc` / `Activity` / `Fusion` / `Workshop` 等 | 按需推进；每个面板独立可停 |

## 8. 首批详设（U1，战斗 UI + 战斗底栏）

**上游权威文件**（都已定位，实现时逐个对照）：

- 组装根：`MVC/View/Battle/BattleSystemView.cs` —— 决定"有哪几块"
- 底栏：`MVC/View/Battle/Components/System/BattleOptionView.cs` —— 7 槽与默认槽、记录面板
- 技能区：`.../Option/BattlePetSkillView.cs` —— 4 普攻 + 必杀 + 无操作 + 进化 + 附属精灵
- 其余对照件：`Option/{BattlePetChangeView, BattlePetItemView, BattleCardDeckView, BatttleCardHandView, BattleAutoView, BattlePlayerSwitchView}`、
  `Status/{BattlePetInfoView, BattlePetStatusView, BattlePetBuffView}`、
  `Unit/{BattleStatusView, BattlePetNumView, BattleAnimView}`、
  `System/{BattleResourceView, BattleWeatherView, BattleResultView, BattleResultSkillView, BattleAudioView}`

**必须同时读的模型侧**（面板只读不算）：`MVC/Model/Battle/{BattlePet, PetBattleSkillController, PetBattleBuffController, PetBattleStatusController}.cs`。

**验收补充**：U1 结束时应能回答"**S3 搬完的 22 个算子，哪些在 UI 上有可观测表现**" —— 这就是内核线
`kernel-handoff.md` S3 判据②「至少 5 类高频效果肉眼可见」的落地。

## 9. 风险与止损

| 风险 | 处置 |
|---|---|
| 与原版线**双轨并存**造成两套 HUD/背包，认知负担 | 明确 D1：原版线降级为过渡件；在 README 工作线表里把两条分开列 |
| 手写 ~40 个面板是长尾（D2 的代价） | 按 U1→U2→U3→U4→U5 优先级切分，每段独立可停；只做"可玩"必需的面板，工坊/活动等长尾按需 |
| 面板塞满业务逻辑，与内核重复实现 | 硬约束：面板**不自己算数**（§6），只读 `game/core/**` |
| 重启独有素材缺失（精灵动画 / AssetBundle 已被剪） | 走原版素材（支柱 2 口径）；只有在原版也找不到时才定点补，不做整包下载 |
| 改动扩到 `game/app/**` 影响 difftest 基线管理 | UI 线**不碰** `game/core/**` 与 `tools/difftest.mjs`；内核线基线照旧（`/tmp/seq4-base`） |

### U0 已知偏差（几何照 prefab 抄，以下两处为近似）

| 项 | 上游 | 现状 | 理由 |
|---|---|---|---|
| 盒体圆角 | Unity 内置 UISprite（`fileID:10907`）九宫格 | CSS `border-radius:10px` | 内置 sprite 不可导出；只影响观感，不影响命中/尺寸 |
| 字体 | `FontOption.Zongyi`（综艺体）/ Arial | 系统 CJK 族（`Noto Sans CJK SC` 等） | 上游字体未随工程保留；重直线无 SWF 字体子集坑（§3） |

### U1 已知偏差 / 限制（薄内核驱动 + 战斗骨架）

| 项 | 上游 / 理想 | 现状 | 理由 |
|---|---|---|---|
| Buff 剩余回合 | 每回合 `RoundStart` 递减 | **静态显示初值**（不递减） | 驱动绕开 `RoundStartPhase`（`doWork` 抛 NOT_PORTED 围栏）；倒计时待内核补 RoundStart 后接 |
| 出战宠 name/level/star | 内核 `BattlePetView` 自带 | **host 侧从 `content.petConfig` 填**（内核 FakePet 返 null/0） | 表装配在 `driver/hostPetView.js`；忘填即空白名，属驱动职责而非面板 |
| 怒气/护盾 buff id | — | 硬编码 `61`（无限怒气）/`2000`（护盾） | core 内常量；上怒气条前已对照重启 buff 表核对 |
| 随机数 | oracle 用 native `UnityEngine.Random` | 浏览器用真 `createRng(seed)` | **结构忠实、非 golden 逐值**，属预期，别去"修"；与 difftest 进程隔离互不影响 |
| 战斗结束判定 | `BattleEndPhase.doWork` 跑结算 | 以 `result.isBattleEnd` 为主信号；撞到 `NOT_PORTED: BattleEndPhase` 抛**仅按前缀吞**当 over 哨兵 | 结算只读 `currentState.result` getters，**从不执行 doWork** |
| 未移植算子的招 | 正常结算 | master 选招若含 NOT_PORTED 算子（如 pet2 洒水→Rage）：快照回滚 + no-op 重试 + `{rejected}` → 弹「已跳过」提示 | 驱动不改 core，围栏照常抛，UI 层诚实降级 |
| HUD 几何 | 各面板 prefab 精确坐标 | 6 槽位为近似排版（无逐面板 prefab 权威） | U1 目标是"骨架 + 读数接线"，像素级照 prefab 归 U2/U3 |
| 越界槽位 | 换宠/捕捉/道具/逃跑/手牌可用 | 底栏槽 0 活；**重启遇怪态下换宠/捕捉槽（2/3）已置活并经内核算子真结算（U2 批三）**；**逃跑槽已置活 = 页签 → 二次确认 → 内核 `escape(2)` 真结算（2026-10-19，`view-scene-battle-impl.md §15`，无掷点必成功）**；道具/手牌仍灰化 + `why` tooltip | 道具支抛 NOT_PORTED / 手牌算子未搬；捕捉+换宠已解除（见 §9 U2 与 port-map「第七段」），等级门槛胶囊因 `GetPetIdentifier("level")` 未搬暂不判 |

### U1 闭环补记（遇怪 → 重启内核战斗 → 回图，2026-10-16）

把 `#/rbattle` 从独立 demo 接成**能玩的最小闭环**（全落 `game/app/`，`game/core/**` 仍零改动）：

- **入口**：`#/map` 顶栏持久复选框「重启内核战斗 (U1)」（`localStorage['roco.battle.engine']`）。**默认宇宙 = 重启**：判据是 `!== 'as3'`（未设/其它值都按重启），勾选态 `startWildFight` 走 `#/rbattle?encounter=1&client=<数值id>&…`、全线读写 v3。**只有显式取消勾选（写 `as3`）才切回原 AS3 `#/battle` + v2**（两宇宙并存、互不合并纪律不变，只是默认从 AS3 改成了重启）。
- **数值 id 桥**：`mapWildFight` 回传的是 swfId，内核要数值 id；`mapScene.numericIdOfWild(mapId, slot)` 从 `M.wild.maps`（pruneWildPool 的 `{idx, pet, …}`）按槽位反查 `p.pet` 即得（纯 JS，不动 AS3/不重建 mapRunner.swf）。实测 map 2 槽位 → 数值 id `34`，未知槽位 → `null`。
- **开局**：`rbattleScene` encounter 模式读 `SESSION.loadSession` 队首宠（`petId/level/hp`）作我方、野怪数值 id+等级作敌方 → `createCoreBattle({masterPetId, clientPetId, masterLevel, clientLevel})` + `setStartHp('my', clamp(存档hp,1,重启maxHp))` 带伤入场；`encounter.start` 点亮图鉴「见过」。
- **结算**：KO 后读内核 `result`（`isMyWin`→win/else lose）→ **复用 `game/logic/`**（`LOGIC.dispatch battle.end` + `SETTLE.applyEvolution` + `SESSION.saveSession`）做经验/升级/血量写回 → 递 `APP.lastResult` → `go('map',{map:back})`，地图 `applyBattleResult()` 消费一次即清。元游戏走官方 `rules.json`（非 core），与 AS3 线同一分层。
- **判据**：`tools/rbattle-encounter-test.mjs` 14/14（真队首「迪兰 Lv100」vs「迪迪兰 Lv2」→1 回合 KO 判胜、exp 入账、图鉴新见、hp 写回、存档落盘、`battle` 归 null）；`tools/map-engine-toggle-test.mjs` 5/5（开关持久 + 数值 id 反查）；AS3 `#/battle` 与 `#/rbattle` 默认 demo 回归不破（selftest 14/14、hudtest 12/12）；`node --test` 265、`difftest` 30308/29819/0/0/0、分歧族 `{}` 不变。

**闭环已知边界**：① 1v1、无换宠/后备（队首被击倒即判负，换宠属 U2）；② 驱动里 client 恒无操作 ⇒ 敌方不主动出手，遇怪必可推进到 win（真 AI 归 U2）；③ 捕捉/道具/逃跑不出现（内核围栏）；④ 带伤入场上限用重启 `maxHpOf` 与存档 `hp`（rules 曲线）以 `clamp` 吸收，属已知近似。
> **U2 批三更新（2026-10-16，内核 S6）**：①/③ 已部分解除 —— 重启遇怪态现支持**多宠袋换宠**（`switchPet`→`PetChange` 切 `cursor`）与**无门槛胶囊捕捉**（`useCapture`→`Capture` 真结算，成功走 save-side 落档）。道具/逃跑/对手阵容/手牌仍属上述围栏。

### S5-v3 补记（真·重启原生存档：全 App 切读、全新开始、exp 曲线如实标借用，2026-10-16）

上面 U1 闭环**借用**官方 v2 存档做元游戏 → hp 上限打架（战斗内 `content.maxHpOf` iv=0 vs 存档回写官方 `petHpMax` iv=31）、exp/进化读官方 `pets.growth`+`rules.json`。S5-v3 起，**引擎开关拨上时全线切到重启原生存档 v3**，两宇宙各一份完整存档：

- **读档权 = 全 App 切**：重启宇宙下 地图 HUD/物品背包/精灵背包/图鉴/`#/rbattle` **全线读写 `rocoshowdown.restart.v3`**；AS3 宇宙 → 全线 v2。`mapScene` 引入 activeStore 视图 `A`（宇宙选择器），渲染层只认 `A.state/A.hpMax/A.nameOf/A.swfIdOf/A.save`，不再直接碰 `S/SESSION.petHpMax/p.name/p.swfId`；`eng.onchange` 拨档即热重建 `A`。（判据早期为 `==='restart'`（默认 AS3），U3-HUD/U4-Bag 起改为 `!== 'as3'` —— **默认宇宙 = 重启**，见下「U3-HUD + U4-Bag 补记」。）
- **v3 = 纯函数层，独立一份**：新增 `game/logic/restartSession.js`（仿 `session.js`，storage 注入、权威经 `auth` 注入、不 import content）。pet 形状精简 `{uid,petId,level,exp,hp}`；`hpMax/name/swfId` 一律现算（`auth.*`）**不落盘** → 宇宙换表永不过期。官方 `session.js/stats.js/settle.js/phases/**` **零改动**（AS3 v2 线逐字节不动）。**无 v2→v3 迁移**（iv31↔iv0 与 官方↔unity 成长宇宙数值不同，硬转会静默错值）；v3 首入自动生成重启初始宠（`makeRestartPet` iv=0 满血）。
- **权威分档（诚实，不伪造）**：**HP/六维/进化 = 真重启权威**（hp 走已建绿的 `getPetNormalStatus` iv=0；进化阈值/目标/`beatExpParam`/`expType` 来自 `unity/growth.json`）。**exp→level 曲线系数 = 借 `rules.json` A/B 形状**（内核 `ProcessResult/SetExp` 是围栏、无无头 oracle），存档打溯源戳 `_authority.exp='borrowed-A/B-shape'`、结算事件带 `curve:'borrowed-A/B-shape'`、`resultView` 结算框如实追加「经验曲线：借用官方 A/B（待 S6 真值）」行 → **未谎称 exp 已换血**。待 S6 只换 `auth.exp.{levelExpAt,levelFromTotalExp}`，schema/call-site 不动。
- **宇宙差为实测真值**（非装饰）：`restartHpMax(1,100)=280 ≠ 官方 calcMaxHp(1,100)=311`（iv 0↔31）；实测 unity id1 迪兰：进化 `{to:2, at:20}`、`beatExpParam=65`、`expType=0`（注：早期规划笔误记成 `{to:3,at:40}/95`，以实测为准）。v3 带伤入场上限改用 `restartHpMax`，与内核同源 → U1 的 `clamp` 近似缝在重启宇宙内消除。

**S5-v3 判据**：`tools/rbattle-restart-save-test.mjs` **21/21**（宇宙差为真、toggle-on 首入写 v3 且同 run v2 未被写、溯源戳、全新开始、遇怪→KO→进化 1→2→回图闭环、exp 入账/升级/图鉴新见/battle 归 null、lose 支全愈到 restartCap、console 0 错）；`game/logic/restartSession.test.js` 纯函数单测（`node --test game/logic/` **19/19**，含 5 新：注入 stub auth 验 fresh/settle 升级/进化/全愈/dex）；**toggle-off v2 逐字节不变**（`verify-save-dex`/`verify-battle`/`verify-loop` 全绿）；`engine-off + 手搓 encounter URL` 保留旧 v2 结算路（`rbattle-encounter-test` **14/14**、`map-engine-toggle` **5/5**）；`game/core/**` 零改动、`node --test game/core/` **265/265**、`difftest` 基线 **30308/29819/0/0/0**、分歧族 `{}` 不变。

**S5-v3 已知边界**：① `expType(0|1)→A/B` 是观测两桶映射（815:23），非权威断定，待 S6 校正；② `evolveLevels:[0]`（道具/特殊进化，494/838 无等级进化）本轮跳过；③ v3 与 v2 各自独立、无迁移；④ 捕捉/道具/换宠/逃跑仍内核围栏（U2），捕捉写档将骑在这条 v3 路径上（`unity/items.json` 供物品权威）；⑤ 地图→v3 这条边只在开关打开时生效，关 = AS3 v2 逐字节不破。

### U3-HUD + U4-Bag 补记（主场景分层 + 重启原生常驻 HUD / 精灵背包模态面板，2026-10-16）

把用户提的**分层直觉**落成布局约定（**不引入通用 Scene/Layer 框架**，D2「逐面板手写、无 prefab→DOM 转换器」不变），并在重启线上把常驻 HUD 与精灵背包从 SWF/平铺栈里切出来：

- **场景 = router 的 hash route**（`game/app/router.js`：`SCENES={map,battle,rbattle}`）。`#/map`=主场景、`#/rbattle`(重启)/`#/battle`(AS3)=战斗场景。**不新建 SceneManager**。
- **主场景内部叠序（z-order，非独立场景层）**：
  ```
  地图/世界层 (SWF, 不动): [背景瓦片 far/ground] → [场景实体: 玩家 · NPC · 野怪] → [实体脚标 overlay: #lbl Lv/名]
  HUD 层      (常驻 chrome)
  面板层      (模态栈: 背包 / 未来 道具·图鉴·NPC 对话…)
  ```
  **野怪/玩家/NPC 同属「场景实体」**（相机耦合、被 `front_mc` 遮挡），不是独立层；只有脚下 Lv/名标签是叠在地图上的文字 overlay。野怪**遇怪触发**（`startWildFight`→`#/rbattle`）= 主场景→战斗场景的接缝。本轮仍无 NPC 系统 → 面板留位。
- **本任务补齐的唯一区分**：**HUD = 常驻 chrome 层**、**背包 = 盖在其上的模态面板**（此前 `#rv` 是一层平铺可关栈，HUD 混在里面）。

**默认宇宙 = 重启（本次改动）**：`restartOn()` 判据由 `localStorage['roco.battle.engine']==='restart'` 改为 `!== 'as3'`（`mapScene.js` + `rbattleScene.js` 两处读点对齐）——**未设 key 即按重启**，冷启动直接进 v3 + DOM 原生 HUD/背包；原版 AS3 线降级为**显式 opt-out**（取消勾选写 `as3`）。两宇宙仍**互不合并**（`as3` 那条路逐字节代码未动，只是不再是默认）。回归因此把 v2/AS3 线测试**显式钉 `roco.battle.engine='as3'`**（`verify-save-dex`/`verify-battle`/`verify-loop`/`rbattle-encounter-test`），`map-engine-toggle-test` 改断「默认勾选=重启 / 取消写 as3」。

**A. HUD 让位机制（不拨像素遮罩，走整块不建）**：重编译 `game/maprunner/mapRunner.swf`，用 `hud` URL 参数门控 HudRunner 创建（`(parameters.hud||"1")!="0"` 才建）。重启线 `loadMapRunner` 传 `hud=0` → SWF 整块常驻 HUD 根本不实例化（`M.player.hudStatus()` 返回 `"hud=none"`）；AS3 线不传/传 `1` → **逐字节不变**。

**B. `view/hud/restartHudView.js`（常驻 HUD 层）**：`create(container,A,handlers)→{update(),setMapTitle,destroy()}`。画（全部只读）训练师 name/Lv/coins/diamonds、出战队首 name（`A.nameOf`）/Lv/HP（`bar.set(lead.hp/A.hpMax(lead))`）/元素点（`content.petConfig(...).elementId`）、其余队头像色块、图鉴 `caught/seen` 计数、地图名底栏、工具按钮行（精灵背包→开 C；道具/图鉴/地图/系统 = logLine 占位「待建」）。**无一处自算**。CSS `.rbh-*`。

**C. `view/panels/restartPetBagView.js`（模态面板，与 v3 闭合）—— ⚠️ 本 U4 过渡件已退役**（背包面板搬到 `game/app/view/petbag/**`，三层 IA，见 `docs/view/panel/petbag-impl.md`；以下保留为 U4 当轮记录）：出战队(≤6)/仓库两列表 + 右侧详情。每格 name/Lv/HP 条/元素色描边。详情只画**有重启权威的字段**：六维 `content.petConfig(...).stats`（iv=0）、元素 `elementNameOf`、技能 `petConfig({unlockedOnly})`（power/accuracy/rage/category）、进化 `restartEvolveOf`（仅 `at>0&&to>0`）、exp 行如实标「借用官方 A/B（待 S6 真值）」。事务「入队/入仓」= `RST.swapTeamBox(A.state,uid,toTeam)`、「放生」= `RST.releasePet`（末位保护：仅剩最后一只出战宠时拒放），成功后 `A.save()` 落 v3 再重渲染。**容量/队首语义全按 `restartSession` 现成函数，面板不自写**。CSS `.rbp-*`。

**D. 接线（`mapScene.js`，全在 `A.isRestart` 分支）**：`refreshHud()` 统一入口（重启线挂/更 DOM HUD，as3 线 `pushHud()` 喂 SWF）；`mountRestartHud()` 经 `openPanel('rb-hud',…)` 建常驻层（`host.ensureLayer()` 每次场景重写 `#wrap` 后自动重确认层在）；背包按钮 `openRestartPetBag()` 经 `openPanel('rb-petbag',…)` 开模态（已开则 `update()`）。**不拨开关**：`pushHud()` + `petBagOpen` SWF 路径逐字节保持现状。

**U3-HUD/U4-Bag 判据**：`tools/rbag-restart-hud-bag-test.mjs` **14/14**（toggle-on：SWF `hudStatus()="hud=none"`、DOM 常驻 HUD 接管、队首 HP 条分数 == `lead.hp/restartHpMax`、cap == `restartHpMax(1,10)`≠官方 40、name/Lv/货币/图鉴读自 `A.state`、背包格数 == 存档长度、详情六维 == `statsOf` 直读、`swapTeamBox` 入队后 v3 `team+1/box-1` 落盘、满 `TEAM_MAX` 拒绝、放生末位保护拒放、同 run v2 未被写、console 0 错）；**toggle-off 逐字节不变**（`verify-save-dex`/`verify-battle`/`verify-loop`/`rbattle-encounter-test` 14/14/`map-engine-toggle-test` 5/5 全绿）；`game/core/**` 零改动、`game/logic/{session,settle,stats,phases}.js` 未编辑、`restartSession.js` 只被调用未改；`node --test game/core/` **265/265**、`difftest` 基线 **30308/29819/0/0/0**、分歧族 `{}` 不变。

**U3-HUD/U4-Bag 已知边界**：① 面板**零算数**，布局像素为表现层近似（D2 许可，无逐面板 prefab 权威）；② 重启 Lite 无宠美术 → 列表/头像用元素色色块 + 名，icon 桥仍走官方 `swfId`（既定口径，非新引入）；③ `height/weight/getWay/star/introduce` 官方 `petbag` 详情字段重启无源 → 本轮不画，将来接 `unity` 表再补；④ 道具背包/图鉴/NPC 面板留位（按钮占位 logLine，下一轮 `restartItemBagView`/`restartDexView` 套同模态套路）；⑤ exp 曲线系数不伪造、沿用 v3 的 `borrowed-A/B-shape` 戳。

### U4 道具背包补记（重启原生道具背包模态面板 · 只读第一刀，2026-10-16）

用户拍板 **(1a) 默认如实显示空包 + (2a) 只读、不伪造「使用」执行**（对齐战斗底栏「越界槽位灰化」先例）。

- **道具权威**：`game/data/unity/items.json`（612 条，字段 `id/name/typeRaw/typeId/price/resId/itemDescription/effectDescription/effects[]/removable/getId`）。`content.js` `boot()` 新增加载 `items.json` → `R.itemById`，并导出**只读** getter：`restartItemOf(id)`（整行）、`restartItemNameOf(id)`、`restartItemTypeOf(id)→{raw,cn}`（`typeRaw`→中文显示名映射，纯表现层，未知键回落原英文、不臆造）。**与官方 `game/data/items.json` 是两个宇宙，不混**。
- **数量权威**：`A.state.items`（`[{id,count}]`），经 `restartSession.countItem/addItem/consumeItem`（本轮面板不调用写函数，仅 `A.addItem` 供测试播种）。
- **面板 `view/panels/restartItemBagView.js`**：`create(container,A,{onClose})→{update(),destroy()}`，套 `restartPetBagView` 的模态套路（scrim + `.rbi-box` + 列表/详情 + note）。格 = 类型色块（`typeColor(raw)` 稳定色相，非数值权威）+ 名 + `×count`；详情 = 名/类型/持有 + 说明（`itemDescription`）+ 效果（`effectDescription` + `effects[]` 只读摘要行）+ **灰化「使用」按钮**（`title` 标「属 U2/S6，面板不伪造执行」）。**零写、零算数**。
- **接线**：`mapScene` 加 `RESTART_ITEMBAG` import + `ITEMBAG` 模块态 + `openRestartItemBag()`（`openPanel('rb-itembag',…)`，已开则 `update()`）；HUD 的 `onItemBag` 由占位 `logLine` 改指 `openRestartItemBag`；`eng.onchange`/`unmount` 一并作废 `ITEMBAG`；window 暴露 `openRestartItemBag/getItemBag`。CSS `.rbi-*` 落 `ui.css`（`#rv`-scoped）。
- **默认空包诚实**：v3 首入 `items:[]` 且**不跑官方 `STARTER_ITEMS` 新手包**（那是官方 items.json 宇宙）→ 面板如实显示「背包是空的 —— 捕捉 / 商店 / 战利品 获取道具属 U2」。
- **判据**：`tools/rbag-restart-hud-bag-test.mjs` 扩到 **20/20**（道具段：默认空态文案、`addItem` 播种后格数==`items`长度、名/数取 unity+存档、详情效果描述==`restartItemOf(8006).effectDescription` 直读、「使用」`--off` 禁用、计数落 v3、同 run v2 未写、console 0 错）；AS3 线不破（`verify-save-dex` ALL PASS、`rbattle-encounter-test` 14/14、`map-engine-toggle-test` 6/6）；`game/core/**` 零改动、`node --test game/core/` **265/265**、`difftest` **30308/29819/0/0/0**、分歧族 `{}`。
- **已知边界**：① 重启 Lite 无本地道具图标（`ItemShop/Sprites/*.png` 是商店装饰、非 `resId` 键）→ 格用类型色块 + 名（与宠无美术同口径）；② 「使用/丢弃」不接（`effects[]` 属内核 `NOT_PORTED`，U2/S6）；③ 获取路径（捕捉战利品 / 商店 / 签到）未接 → 正常游玩下背包为空，属预期。

### U5-Battle 补记（重启战斗舞台：地图背景 SWF + fight-SWF 宠动画 · 纯表现层，2026-10-16）

修用户的「`#/rbattle` 黑乎乎一片、精灵战斗 SWF 动画应当被加载」。U1 起 `#/rbattle` 只在 `#rv` 铺六个 DOM 盒子（`_kit.js` 的 `sprite()` 取 `Sprites/Fight/*.png` 是血条/按钮 chrome，不是宠）→ **没有形象层、没有战斗背景** → 读作黑屏。本段起 `#/rbattle` **不再是纯 DOM**（U1 记录里的「0 个 ruffle-player」自本段失效）。

**为什么装原版 fight SWF 是「贴重启」而非「串 AS3」**：重启本体就是在重放这批 Flash —— `BattlePetAnimView.cs:27` 持 FlashTools `SwfClipController` 播 `pet.ui.GetBattleAnim(Idle/Present/Skill)`，`:107` 缺动图才退回静态 `battleImage`；`PetUISystem.cs` 按 `{petId}-Idle` / `"Pets/battle/{petId}"` 取，但这些动画文件**不在本快照**（运行期下载）。而原版 `swf/fight/{petId}.swf` 本地有 1606 个、AS3 线已证明浏览器里 Ruffle 能播。⇒ 把这批 fight SWF 作重启战斗的**表现层**，既符合北极星「素材取自原版」，也与既定 icon 桥同口径。

**三层舞台（全落 `#wrap`，纯表现，零碰数值）**：`view/battle/restartFighterStage.js`（新）
- `#rb-bg`(z1) = `/swf/map/{fightMap}.swf`（缺省 `100002`，本地 226 张已在，`scale:'showAll'` 铺 1200×660）；`#rb-fL`/`#rb-fR`(z2) = 左右宠 `petContainer.root.swf?url=/swf/fight/{swfId}.swf`（我 x=120 正、敌 x=1080 镜像 scaleX=-1，同 AS3 锚点）；`#rv`(z60) DOM chrome 仍压在最上、`pointer-events:none`。
- 装载/桥接口照搬 AS3 `battleScene.js` 已验证原语（Ruffle `newest().createPlayer()`、`wmode:'transparent'`、`getAvailableStates()`/`setState()`、`postMessage 'petRenderCallbacksReady'` 就绪握手、`pickState` 模糊匹配），**不引 battleScene 本体以免串态**。
- **两套坐标分开**：SWF 舞台层用 `#wrap` 原生 1200×660；DOM chrome 仍用 `host.js` 960×540 逻辑画布（1.25× 缩放）。敌宠在右→HUD 右上、我宠在左→HUD 左下（斜对角贴合，几何近似记 §7）。

**逐动作 clip 的驱动机制（零改 core、零改 driver）**：重启内核是**整回合同步**（`coreBattleDriver.js` `nextRound()` 一次跑完整回合、只发一次 `emitRender`；`phase.ts:99` 逐 phase `setState` 帧未收集），**没有 AS3 那条 `BattleKernel.events` 逐动作事件流**。⇒ 视图侧维护 `prevReports`，每次 `onRender` 取 `driver.reports()` 与 `prevReports` 求**本轮新增行**，按措辞映射成 `[{side,kind}]` 序列交舞台**定时逐条播**（`STEP_MS=650`，播完复位待机）：
- `【atk】使用了{skill}` → 攻方 `attack`（→物理攻击）；`對【def】…造成了…點傷害` → 守方 `hit`（→被打）；`【atk】激活了专属动作` → 攻方 `super`（→特殊攻击）；`登场了` 行进 `present`（装载后双方 登场→待机）；`pet.hp<=0` → `ko`（→失败/濒死）；`isOver()` → `victory`（→胜利）。侧别按 `【name】` 与我/敌 `pet.name` 精确匹配。
- **原版 fight SWF 状态实测词表**：`待机 / 物理攻击 / 属性攻击 / 特殊攻击 / 被打 / 被暴击 / 胜利 / 失败 / 闪避 / 濒死 / 空`（无独立「登场/必杀」名，故 present 落 `空`、super 落 `特殊攻击`）。

**接线**：`rbattleScene.js` `mountHud` 里 `STAGE = RESTART_STAGE.create({ mySwfId: CONTENT.swfIdOf(myPetId), opSwfId: CONTENT.swfIdOf(opPetId), fightMap })`（demo/encounter 两模式都铺；`myPetId/opPetId` 来自 enc 队首/野怪或 demo master/client）；`offRender` 里 `clipActions(driver, prevReports)` → `STAGE.playRound(acts)`；`STAGE.ready.then(()=>STAGE.present())`；`unmount` 里 `STAGE.destroy()`。`mapScene.js` 重启支 `startWildFight` 的 `rq` 追加 `map=fm`（镜像 AS3，缺图不传由战斗场景用缺省）。

**纪律核对（两宇宙仍不合并）**：战斗数值 100% 仍读 `game/core/**`（经 `coreBattleDriver`）+ `unity/*.json`；DOM 仍是唯一 chrome（血条/技能/战报/指令全 DOM，**不装 `fightUI.swf` 控制层、不重画血条**）；Ruffle 只当**动画播放器 + 背景画**。官方表只经 `swfIdOf` 贡献「动画 id 指针」（与 icon 桥同一既定例外），**不贡献任何数值**，`data/*.json` 与 `data/unity/*.json` 不合并。`game/core/**`、`coreBattleDriver.js`、`phaseUi.js`、`game/logic/{session,settle,stats,phases}.js` 零改动。

**判据**：`tools/rbattle-stage-test.mjs` **23/23**（demo `?master=1&client=2`：① 三层 ruffle-player 存在 + 逐层隔离截图→2D 采样非全黑，背景 99.9% 非黑/色相分布 1624、两宠各自有像素；② 两宠 `getAvailableStates()` 非空含 待机/攻击；③ present 触发 `setStateCalls≥4`；④ 打真回合后含 攻击族+被族 状态各≥1 且**出手先于受击**；⑤ `__clipActions` 全量含 attack+hit；⑥ 降级：缺 fight swf→状态表空→留提示 note、缺背景不抛、一侧缺另一侧仍装载、缺状态 `setState` 不炸；⑦ 遇怪闭环：舞台挂载下 `runUntilOver`→v3 回写正确、KO/胜利 clip 触发、全程 v2 未写；console 0 错）。
> **采样口径记一笔**：Ruffle 用 WebGL canvas，直接对它的 canvas `getImageData` 读回全黑（`preserveDrawingBuffer=false` 的已知坑）——故舞台判据的「非全黑」用「裁剪截图 → 光栅 PNG 过 2D canvas → `getImageData`」采样真实渲染输出，不是采样 Ruffle 内部 canvas。

**U5-Battle 已知边界 / 后续**：① 逐动作用**战报文本**反推（非内核事件），措辞变则映射需跟改；round 同步 ⇒ clip 按 `STEP_MS` 序列化播、非真逐帧；② 换宠→`reloadFighter` 装卸新宠 fight SWF、捕捉/道具/逃跑的内核围栏解除属 **U2**；③ 若要更细演出可让 driver 收集 `phase.ts:99` 逐 phase `setState` 帧序列回放（本轮战报增量已够、零改 driver）；④ 缺素材诚实降级为 DOM-only（今日行为），不阻塞逻辑。

### U3-B4 补记（主场景 HUD 逐区复刻收口：几何/资产/路由回源码、可见性回截图，2026-10-16）

**方法学（这轮真正立住的东西，后续任何复刻照抄）**：
- **几何 / 资产 / 路由 = Unity 源码权威** —— `Assets/Scenes/Map.unity` 的 `RectTransform`（`size = (anchorMax−anchorMin)×parentLocalSize + sizeDelta`）、
  `m_LocalScale`（`PetSelectBlock`/`Pet Shortcut` 一族是 `0.6`，连子树一起缩）、`m_Color`（`Hp Bar` = 内建白图染 `#77E20C` ⇒ **纯绿条**，
  不是战斗线 `hp color.png` 渐变）、sprite GUID 经 `.meta` 反查真路径，以及每个按钮内嵌的
  `onPointerClickEvent → MapMenuController.OpenPanel(...)` / `onPointerOverEvent → SetInfoPromptText(...)`；语义再往下一层是 `Assets/Scripts/MVC/**` 的 C#。
- **可见性 = 截图权威** —— 源码答不了运行时到底 `SetActive` 了什么。冲突按「**场景有节点、截图那一格是空的 ⇒ 不画**」裁决，
  读数改挂 `data-*` + tooltip，信息不丢。
- 多源交叉：截图裁片 × 场景节点 × C# × PNG 像素扫描，四者都过才算坐实。

**这轮推翻的早期判断（都记在 `docs/view/scene/room/view-scene-hud-impl.md` §10）**：墓地→**基地**（`menu/guild.png` 一直在，设计期看图误读）；
小红位=**Recover**(`PetCorner.Heal()`)；顶中绿钮=**Day Night**(`flip.png`，tooltip「切换地图」)；
天气钮上游 `MapInfoView.SetWeather` 在 `weather==0` 时**隐藏**（所以截图那张是空的）；
队首卡/队伍栏 **Lv 不画**（场景有 `Level Indicator` 但运行时不显示）；
头像改走重启客户端**本地 PNG** `Resources/Pets/icon/{petId}.png`，设计期的 `res/pet/icon/{swfId}.swf` + 迷你 Ruffle **作废**。

**两条会反复踩的坑（已写死进 `docs/view/scene/room/view-scene-hud-impl.md` §12.2）**：
① `EDGE = 6` —— 960×540 画布按舞台宽缩放后比 `#wrap` 高 15 屏 px，`overflow:hidden` 上下各静默裁 **6 设计 px**，
可见带是 `y ∈ [6, 534]`，所有根级节点按锚边补偿；判据 9a 是「相对 `.rbh-root`」的量法，宿主整体跑偏时抓不到，
故另立 9c 按「相对 `#wrap` 可见带的贴边距离」独立复量。
② `host.js` 的 shell 缩放**不能只在建层时算一次** —— `#wrap` 若有瞬态滚动条 `clientHeight` 少 ~18px，缓存下来底栏整排被削掉；
现每次 `ensureLayer()` 重算 + `ResizeObserver` 跟手。

**纪律核对**：`game/core/**` 与 `tools/difftest.mjs` 零改动；面板仍**零算数**（唯一算数是 `lead.hp / A.hpMax(lead)` 这个比值）；
`data/*.json` 与 `data/unity/*.json` 两棵树不合并（HUD 读 `maps.json` 的 `name/weather` + `unity/buffs.json` 的天气名）；
as3 线（`pushHud()` / `HudRunner` / `p.hudTitle`）逐字节不变，新测试面 `window.__rbHud` 只在 `A.isRestart` 分支内写。

**一处显式偏离（不偷偷做）**：栏底「道具」格在截图、`Map.unity`、`Assets/Scripts/**`、所有 Prefab 里**零出现**
（上游道具走 商店→`OpenPanel(ItemShop)`，该面板未建），它是 U4 已落道具背包的唯一 HUD 入口。
保留但**故意不像原版**：`1px dashed` + 半透明底 + 弱化字色，tooltip 自陈「截图未覆盖的额外入口」。
> **追记（人类 2026-10-19）：该格已摘除** —— 道具背包入口改由底栏「信箱」钮承担，见 `view-scene-hud-impl.md §12.10`。

**判据（本轮全绿）**：
- `tools/rbattle-hud-layout-test.mjs` **27/27**，page/console 0 错。新增：4e 栏格不画 Lv、
  9a 场景 15 锚点盒 + 13 钮盒（容差 1.5 设计 px）、9b 队伍栏 5 格 == 截图量测、9c 贴边距离 == 场景贴画布边距离、
  10a–10d 六钮逐个点击各打自己的诚实日志 + `pointer-events` 命中自己 + 面板栈不脏、
  11a–11d 天气钮显隐/名字描述直读 `unity/buffs.json`/盒 `[565,0,50,35]`/点击打诚实日志。
- `tools/rbag-restart-hud-bag-test.mjs` **21/21**（Lv 断言改走 `.rbh-card[data-lv]`）。
- `node --test game/core/` **272/272**；`node tools/difftest.mjs` 基线 **30316/29827/0/0/0**、分歧族 `{}`。
- 目视：`/tmp/rbhud-layout.png` ↔ `mainHud.png` 并排 + 分区裁片（队首卡 / 左栏 / 顶中 / 底栏 / 角标 / 设定）逐区核。
  > 截图坑记一笔：headless=new 会把窗口顶部那条「硬件加速已停用」infobar 烘进 **clip 截图**（`captureBeyondViewport` 路径），
  > 它是窗口浮层、不在 DOM 里 ⇒ 关不掉；harness 改成**整屏截图 + `execFileSync('magick', …)` 按 `#wrap` 页面盒裁**。

## 9.9 R-Battle 补记（战斗场景版式复刻收口：顶带/底栏归位，B1–B5，2026-10-16）

设计 = `docs/view/scene/battle/view-scene-battle-design.md`，施工图与 as-built = `docs/view/scene/battle/view-scene-battle-impl.md`（**§14 是最终口径**）。
方法学沿用 U3-B4 那套，战斗场景这一格是它的第一次跨场景复用：几何/资产/路由 = `Assets/Scenes/Fight.unity` +
`Assets/Scripts/MVC/View/Battle/**`，可见性与填充方向 = `battle.png`。

**三条结构性改判**（旧实现是版式错了，不是像素偏了 —— 这三条各有一条判据钉着，回退即红）：
- **S1 两块血牌同在顶带** `(0,0,400,110)` / `(560,0,400,110)`，不再是一左下一右上的斜对角；中段留给舞台，**不许有任何 y>200 的 HUD 盒**。
- **S2 技能卡在底栏内** `.rbb-content` `(71.5,437.5,700,100)`，卡 `155×82`、pitch 175（权威 = `BattlePetSkillView` 里 `80 + 175 * index`），右侧独立浮窗作废。
- **S3 页签互斥**，不是 7 个平铺按钮：`.rbb-options` 簇 `(773,429.5,185,110)` 五张烤字标（PNG，非 DOM 文本），选中页把整个 `.rbb-content` 换掉（`BattleOptionView.Select`）⇒ **同屏只有一个 `.rbb-page` 可见**。

**这一轮真正新增的事实（会反复用到，别只当战斗线的边角）**：
- **条是一层**：上游没有独立轨道也没有 `fillAmount`，改的就是持有 `hp bar mask.png` 那张 Image 自己的宽 + `m_Color`。
  ⇒ DOM 侧等价物 = `mask-image` 定形 + `background-color` 定色 + `width = 轨长 × frac`。HP 色逐字搬 `BattlePetStatusView.cs:59-62`
  （满 `rgb(119,226,12)`、半黄、残血 `rgb(255,0,0)`），怒条固定 `rgb(204,0,0)`（源 `r:.8 g:0 b:0`，**不是** `#FF3B30`）。
- **`getComputedStyle` 量不出"从哪边填充"**：绝对定位元素的 `left/right` 返回**用值**（具体 px），永远拿不到 `auto`。
  ⇒ 方向类判据只能扫 `document.styleSheets` 断言**声明的规则**，且 `r.style.right === ''` 与 `'auto'` 同义。
- **`display:none` 的件 rect 全 0** ⇒ 默认收起的记录面板不进静态盒表，走公共出口 `record.toggle()` 量一个来回并还原。
- **不照抄坏值**：上游敌方血牌的 anchor/pivot 序列化不完整（设计 §4.1 注）⇒ 我们按截图的镜像公式 `x' = 400 − (x + w)` 实现，
  且**只有三件事镜像**（盒位、底板 `scaleX(-1)`、条起点 `right:0`），文字与头像不翻。
- **缺件诚实**：把手 `openSprite/closeSprite` 的 GUID 直读不到 ⇒ 按 `Map/up.png`/`down.png` 落地并**保留 `data-tbd="handle-sprite"`**，不谎称已证。

**一处产品级已知缺陷（本轮未修，属 router 共用面）**：`game/app/router.js route()` **不串接 `mount()`**，而 `mapScene.mount` 是 async 的。
`#/map` 后**立刻**跳 `#/rbattle` ⇒ 挂在途中的地图 HUD 在 `unmount()` 清空 `#wrap` **之后**才 resolve，把 `.rbh-*` 整树追加回来并留下游离 `Ruffle-PLAYER`，两张 chrome 叠加。
战斗版式 harness 因此改走**未知场景**地址播种（`#/seed` 在 `SCENES` 里没有 ⇒ `route()` 在赋值 `lastHash` 前就 return，一帧 HUD 都不挂）。
**修法**：`route()` 串行化（`pending = (pending ?? Promise.resolve()).then(doRoute)`）或给 mount 加令牌号、`unmount` 后丢弃迟到的 resolve。
谁做这件事，**必须**同步删掉 harness 的 `#/seed` 绕行，并把「战斗 HUD 独占画布」那条护栏改回真跳 `#/map → #/rbattle`。
> 护栏口径也记一笔：判「不该在的东西」才判 0 —— 地图 HUD `.rbh-*` 必须一个不出现，但 **3 个 `ruffle-player` 是合法产物**（背景 + 两侧宠，见 U5-Battle），拿裸 `ruffle-player` 计数会天天假红。

**纪律核对**：`game/core/**` 与 `tools/difftest.mjs` 零改动；面板**零算数**（只剩 `hp/maxHp` 轨宽、`hpColor(frac)` 色插值、读数格式化、以及 `buffGridView` 按上游 `BattlePetBuffView` 的 `hide`/`sortPriority` 做过滤排序）；
AS3 线 `#/battle` + `fightUI.swf` 逐字节不变；`.rbh-*`（地图 HUD）与 `.rbb-*`（战斗）两套 chrome 仍不共享选择器；缺图一律 `data-asset-missing`，绝不静默换图（铁律 5）。

**判据（本轮全绿）**：
- `tools/rbattle-fight-layout-test.mjs` **59/59**（新建）。测的是**重启遇怪态**（`?encounter=1`，v3 六宠袋）—— demo 态只有「战斗」一枚页签可点，S3 互斥判据会退化成空断言。
  逐盒 == 设计 §4 表（容差 ±2）、S1/S2/S3 三条钉子、条宽 `round(frac×{260,246})`、锚定方向、六珠 pitch 13、记录面板 ±180 骑沿、页签门禁与诚实提示、`pageerror` 0。
- `tools/rbattle-hudtest.mjs` **17/17**（整件重写：旧断言的 6 槽几何与 7 平铺槽位是旧 IA，不能当护栏复用）。
- `tools/rbattle-{capture 19, switch 13, encounter 14, stage 23, restart-save 21, selftest 14}` 全绿 —— **只换选择器，断言一律没降级**（反而由"条变短了"升级成"条宽 == round(frac×260)±1 且严格变小"、新增"无遗留旧节点""同屏只一页可见"）。
- 地图 HUD 两件 `rbag-restart-hud-bag-test 21/21`、`rbattle-hud-layout-test 27/27` **未动**；`node --test game/core/` **272/272**；`node tools/difftest.mjs` **30316/29827/0/0/0**、分歧族 `{}`。
- 目视：`/tmp/rbfight-layout.png`（harness 自带 `magick` 按 `#rv` 页面盒裁）↔ `battle.png` 并排，斜对角血牌消失。

**已知边界**：① B6 九件缺项（副属性块、出招气泡、伤害/治疗/KO 数字层、专属动作、分身、双打、卡牌模式、BOSS 底板、腐蚀条）继续不画；
② 道具/逃跑/手牌页签仍锁（内核围栏，解除属 U2）；③ 动画门控只做到"条宽随读数 + 记录滚到底"，逐帧演出仍由 U5 舞台的战报增量驱动；④ CJK 字体走系统族（TTC 只认首字面，不引）。

## 10. 冷启动

1. 先读本文件 §1–§3 认清"两个 UI 宇宙"。
2. 实现前读 §8 的上游权威文件（对照源码，不要照记忆写）。
3. 素材在 `projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/**` 就地取，**先别下载**。
4. 内核侧接口以 `game/core/**` 为准；需要什么就补导出，**不要在面板里重算**。