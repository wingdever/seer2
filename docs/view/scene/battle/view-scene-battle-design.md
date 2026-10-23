# 重启战斗场景（Fight）复刻 · 设计文档

> 状态：**B1–B5 已落地**（2026-10-16），§1–§9 的版式/几何/契约全部按本文实现并经 `tools/rbattle-fight-layout-test.mjs`（59 判据）逐盒验收；**B6 缺件仍未做**。
> 实现期读数与本文冲突处一律以 `docs/view/scene/battle/view-scene-battle-impl.md §14 As-built` 为准（本文只保留被坐实的口径）。对标件 = `/home/wing/Pictures/Screenshots/seer2/battle.png`（1920×1032，重启原生战斗截图，2026-10-16）。
> 本文只定**目标形态 + 权威几何 + 行为契约 + 分期**；as-built 另起 `docs/view/scene/battle/view-scene-battle-impl.md`，**冲突以实现期读数为准**（沿用 `docs/view/scene/room/view-scene-hud-design.md` / `docs/view/scene/room/view-scene-hud-impl.md` 那套纪律）。
>
> 权威口径：**几何 / 资产 / 路由 = `projects/Seer2-Restart-Lite-main/Assets/Scenes/Fight.unity` + `Assets/Scripts/MVC/View/Battle/**`；可见性与填充方向 = 参考截图**。
> 二者冲突时的既有裁决不变：「场景有节点但截图是空的 ⇒ 不画」；「截图有、场景读数对不上位置 ⇒ 记进 §10 待核，不私改」。
>
> 血统：**重启宇宙专属**（`game/app/**` DOM chrome 层），只挂在 `#/rbattle`。
> **AS3/SWF 线（`#/battle` + `fightUI.swf`）逐字节不变**、**不碰 `game/core/**`**、**面板零算数**（数值只读 `game/core/**` + `unity` 导出的 driver 出口）、**两条数据血统不合并**。

---

## 0. 参考件与对照件

| 件 | 路径 | 用途 |
|---|---|---|
| 目标视觉 | `/home/wing/Pictures/Screenshots/seer2/battle.png` | 可见性、填充方向、配色裁决 |
| 几何权威 | `projects/Seer2-Restart-Lite-main/Assets/Scenes/Fight.unity` | RectTransform / CanvasScaler / 资产 GUID |
| 行为权威 | `Assets/Scripts/MVC/View/Battle/**`（`BattleSystemView` / `BattleOptionView` / `BattlePetSkillView` / `BattlePetStatusView` / `BattlePetNumView` / `BattlePetBuffView` / `BattlePetInfoView` / `BattleWeatherView` / `BattleAutoView`） | 读数→呈现的映射 |
| 美术 | `Assets/Resources/Sprites/Fight/*.png` + `Assets/StaticResources/Sprites/Map/*.png` + `Assets/Resources/Panels/OldPetBag/Sprites/85.png` | 面板底、条遮罩、字标 |
| 现状 | `game/app/view/panels/battle/*.js` + `game/app/ui.css:68-110` | 被本文替换的对象 |

---

## 1. 现状与差距（先对齐问题）

现 `#/rbattle` 是 **U1 手写近似排版**（`rbattleScene.js:210-215` 六槽，注释自认「近似排版，无逐面板 prefab 权威」），
`ui.css:70` 也明写「几何是对经典对局 IA 的近似」。对照截图后确认：**它复刻的是经典回合制 IA（斜对角血条 + 右下技能格），不是重启 IA**。

### 1.1 三条结构性硬伤（不是像素偏差，是版式错了）

| # | 硬伤 | 现状 | 截图 / 场景 |
|---|---|---|---|
| S1 | **双方血牌同在顶带**，不是「敌上我下」斜对角 | 我方 HUD 在 `(24,330,380×150)`（左中下），敌方在 `(596,24,340×130)` | `Normal Fight` 带 = `UI Layer` 顶锚 `sd(0,110) a(0,1)-(1,1)` ⇒ 设计盒 `(0,0,960,110)`；`Player` 块 `(0,0,400,110)`、`Enemy` 块 `(560,0,400,110)`。**两块都贴屏幕顶边** |
| S2 | **技能卡在底栏内**，不是右侧独立浮窗 | 技能面板 `(560,300,380×190)` 右侧 2 列网格，压住敌方宠 | `Bottom Bar/Content` `(71.5,437.5,700,100)`，卡 `155×82`、**pitch 175**（`BattlePetSkillView.ShowNormalSkillInfo` 里 `80 + 175 * index` 是权威 pitch）、单行 4 张 |
| S3 | **右侧是「页签簇 + 内容互斥」，不是 7 个平铺按钮** | 底栏一条 `(24,508,912×32)` 平铺 7 槽 | `Options` 簇 `(773,429.5,185,110)`：上排 精灵/捕捉、中 战斗（大字标）、下排 道具/逃跑；选中页签把 `Bottom Bar/Content` **整块换掉**（`BattleOptionView.Select`：`options[i].SetActive(i == index)`） |

### 1.2 逐区差距表

| 区 | 截图有 | 现状 | 判定 |
|---|---|---|---|
| 头像框 | 75×75 圆角青边方框 + 真宠脸 | 无 | **缺件** |
| 血牌底板 | 一整张 `Player hp bar.png`（381×110 平行四边形） | CSS 矩形拼 | **缺件 + 形状错** |
| HP 条 | 平行四边形遮罩、**纯绿**、数字**叠在条内居中** | `hp color.png` 彩虹渐变、数字在条外 | **资产错 + 配色错 + 排布错** |
| 怒条 | 246×12、红色、数字在条内 | 260×16、空白色、数字在条外 | 尺寸/配色/排布全错 |
| LV + 属性 | `Level indicator.png`「LV:」字标 + 数字 + `Elements/{i}.png` 水滴 | 纯文本「水 Lv100」 | **缺件** |
| 名牌 | 底板自带圆角胶囊 + 青字 | 无胶囊 | 缺件 |
| 六珠（队伍） | 6 格 `Pet yes/no.png`，死宠变灰 | 无 | **缺件** |
| buff 网格 | 32×32 格、右下角剩余回合数 | 有 `.rbb-buff` 但用 `Status indicator.png` 当底 | 底件错、无回合数 |
| 回合板 | 顶中黑底圆角板「回合\n1」 | 无 | **缺件** |
| 天气 | **画成全局 state buff 的一格**，位于回合板正下方 | `weatherView.js` 文字横幅 | **呈现模型错**（见 §6.6） |
| 必杀槽 | 底栏最左 70×105、赛尔机器人线稿徽章、可用时发光 | 无（必杀混在技能网格里） | **缺件** |
| 出招气泡 | `Skill name bar.png` 292×26 | 无 | 缺件（U5 舞台可后补） |
| 自动战斗 | 底栏上方黄边胶囊 + 勾选框 | 无 | 缺件 |
| 跳过/换宠绿圆钮 | `flip.png` 40×40 | 无 | 缺件 |
| 战斗记录 | 底栏上沿居中 360×180 面板 + 折叠把手 | 左侧 `(24,150,500×175)` 灰浮块 | 位置/尺寸/交互全错 |
| 页签字标 | 精灵/捕捉/道具/逃跑/战斗 **全是烤好的 PNG 字标** | DOM 文本 | **资产错**（字标必须用 PNG，字体对不上） |
| 页面 chrome | 整屏即游戏 | 顶部「约瑟传说·网页复刻 载入中…」+ 调试条 + 1200×660 黑框 | **需收进全屏舞台**（见 §2.3） |

> 结论：本轮是 **重写 `game/app/view/panels/battle/**` 的版式与资产**，不是微调。
> 好消息：**IA 的 7 个模块索引与现状完全一致**（§6.7），`coreBattleDriver` 出口基本够用（§7），内核零改动。

---

## 2. 设计空间与锚定

### 2.1 960×540，与地图 HUD 同一口径

`Fight.unity:18809-18814`：`m_ReferenceResolution = 960x540`、`m_ScreenMatchMode = 0`、**`m_MatchWidthOrHeight = 0`（纯按宽缩放）**、`m_ReferencePixelsPerUnit = 100`。
`ui.css:1-10` 已把这条口径写死并用于地图 HUD ⇒ **战斗沿用同一 host、同一 `.rv-panel` 960×540 盒**，不新建缩放体系。

本文所有坐标一律 **960×540 设计像素、左上原点**（Unity 的 `anchoredPosition` 是左下原点，换算 `y_top = 540 - (y_bottom + h)`；截图像素 ÷2）。

### 2.2 顶带 / 底栏分别贴边，中段是空的

画布按宽缩放 ⇒ **纵向设计高度随窗口变**（参考截图窗口 1920×1032 ⇒ 实际 516，不是 540）。
上游靠锚定消化：顶带 `a(0,1)` 贴顶、底栏 `a(0,1)-(1,0)` 贴底、中段舞台随高度伸缩。

⇒ **裁决**：我们的 host 固定 960×540，因此
- 顶带按 **top: 0** 定位（截图与 540 盒一致，无偏差）；
- 底栏按 **bottom: 0** 定位（同上）；
- 中段（宠站位、伤害数字锚）按 540 高排，**不与截图逐像素对齐，只与 540 盒自洽**。
- 实测复核：截图中底栏可见上沿 ≈ 设计 413、卡上沿 ≈ 422；540 盒下应为 425 / 447。**差 24px 全部来自 516-vs-540**，不是排版错。

### 2.3 全屏舞台

战斗期间隐藏 `game/index.html` 的标题条与 `#/rbattle` 的调试行（`[stage] op 动画状态…`），让 `.rv-panel` 铺满视口并按宽缩放。
调试读数不删，改挂 `data-*` + 一个受开关控制的浮层（沿用地图 HUD 的「读数走 `data-*`、可见性靠截图」裁决）。

---

## 3. 场景分层与节点树

上游 `Fight.unity` 顶层 = `Fight Background`（背景 SpriteRenderer，sortOrder −1）→ `Main Camera`（正交 size 5，挂宠）→ `Canvas`(`UI Layer` + `EventSystem`)。落到我们这三层已经存在，只需摆正 z 序：

```
z0  #rb-bg     地图背景 SWF（`BattleResourceView.SetBackground`：按 1920/1080 反推铺满，偏移 (−9.6,−5.4)）
z1  #rb-fL/R   左右宠动作 SWF（U5 已落地的 restartFighterStage.js，不动）
z60 #rv        DOM chrome（本文重写）
      ├ .rbb-topband      (0,0,960,110)          ← 顶带，两块血牌 + 回合板 + 天气/全局 buff 网格
      │   ├ .rbb-side--my    (0,0,400,110)
      │   ├ .rbb-side--op    (560,0,400,110)
      │   ├ .rbb-round       (430,10,100,50)     ← 「回合\nN」黑 plate（= 上游 Weather 板）
      │   └ .rbb-statebuffs  (432,65,100,110)    ← 天气 + stateBuffs 网格
      ├ .rbb-record        (280,245,360,180)     ← 底栏上沿居中，默认收起
      ├ .rbb-bottombar     (0,425,960,115)       ← 底栏（贴 bottom）
      │   ├ .rbb-superskill  (1,431,70,105)      ← 必杀槽
      │   ├ .rbb-content     (71.5,437.5,700,100)← 页签内容区（技能卡 / 换宠 / 捕捉 / 道具 / …互斥）
      │   ├ .rbb-options     (773,429.5,185,110) ← 页签簇
      │   ├ .rbb-extend      折叠把手（§10 待核 #1）
      │   └ .rbb-evolve/.rbb-token               专属动作 / 分身（缺件，见 §4.7）
      ├ .rbb-auto          (788,390,110,30)      ← 自动战斗胶囊（浮在底栏上沿）
      ├ .rbb-noop          (908,382.5,40,40)     ← flip.png 绿圆钮
      └ .rbb-result        全屏结算（沿用 resultView，按 BattleResultView 盒重排）
```

**页签内容互斥**（`BattleOptionView.Select`）：`.rbb-content` 内一次只有一个子块可见，由 `.rbb-options` 的选中态驱动；`.rbb-options` 里选中的那张字标换 `* chosen.png` 并亮 `battle outline.png` 外框。

---

## 4. 逐区规格

### 4.1 R1 血牌（`.rbb-side--my` / `--op`）

底板 = **一整张 `Player hp bar.png`（381×110）**，它自带平行四边形外框、头像方框、名牌胶囊、LV 小尾巴 ⇒ **不要再用 CSS 拼矩形**。
敌方 = 我方按屏幕垂直轴镜像（`x' = 960 − (x + w)`），**且条从右端起算**（截图坐实：敌怒 20/100 的红色段贴在右侧，我方的贴在左侧）。

我方（设计盒 `(0,0,400,110)` 内）：

| 元素 | 盒（左上原点） | 资产 / 字体 | 读数 |
|---|---|---|---|
| 底板 | `(0,0,381,110)` | `Fight/Player hp bar.png` | — |
| 头像 | `(4,5,75,75)` | `Resources/Pets/icon/{petId}.png`（U3 既定路线，990 张本地 PNG） | `pet.baseId` |
| HP/怒 标签 | `(85,10,26,38)` | `Fight/Status indicator.png`（绿 HP + 橙 怒，烤在图里） | — |
| HP 条 | `(111,10,260,18)` | `Fight/hp bar mask.png`（282×18）**按宽裁切** | `hp/maxHp` |
| 腐蚀条 | `(111,10,260,18)` 同轨叠加 | 同遮罩、异色 | §7 缺口 |
| 怒条 | `(111,32,246,12)` | `Fight/anger bar mask.png`（261×18）按宽裁切 | `anger/maxAnger` |
| HP 数字 | 居中压在 HP 条上 | MiniDiamond 14px 白 + 黑描边，`"37" "/" "37"` 三段（current 右对齐、max 左对齐、`/` 固定居中） | 同 |
| 怒数字 | 居中压在怒条上 | MiniDiamond 14px 白，`"20" "/" "100"` | 同 |
| LV 字标 | `(85,52,27,13)` | `Fight/Level indicator.png`（青「LV:」） | — |
| LV 数字 | `(109,52,30,20)` | Zongyi 16px 白 | `pet.level` |
| 主属性 | `(145,54,12,16)` | `Sprites/Game/Elements/{elementId}.png` | `battleElement` |
| 副属性块 | `(80,70,80,20)` | 内置白框 + 「副 属 性」+ `Elements/{subId}.png` | **`subBattleElement !== 普通` 才显示** |
| 名牌 | `(6,85,70,20)` | MSJH 12px 青 `#52E5F9`；`name.length < 6 ? 12 : 10`；模组宠改金色 | `pet.name` |
| 六珠 | `(5,113,85,20)` | 6 格 `Pet yes.png` / `Pet no.png`（14×19），**pitch 13** | §6.3 |
| buff 网格 | `(175,52,225,95)` | 32×32 格，pitch 32，一行 7 | §6.4 |
| 出招气泡 | `(-20,127,292,26)` | `Fight/Skill name bar.png` + MSJH 14px 青 | U5 舞台轮 |
| 分身钮 | `(90,130,35,35)` | `StaticResources/Sprites/Map/Clone.png` | `petSystem.token` |

敌方实测锚点（截图 ÷2，用来验收镜像）：头像右缘 952、HP/怒标签 849..875、HP 条 589..849、怒条 603..849、六珠 **878..950**、名牌右对齐 884..954。
六珠双方**都从左往右数**（index 0 在最左；敌方 index 0 = 在场宠，截图里它是唯一实心那颗）。

> **上游序列化瑕疵登记**：`Fight.unity` 里敌方 `Status Bar Bg / Hp Bar / Corrupt Bar / Anger Bar / Icon` 的 anchor 镜像了但 pivot 没跟着翻，按文件读数会跑到屏幕右缘外。
> 运行时靠 `BattlePetStatusView.SetHp/SetAnger` 的 `SetSizeWithCurrentAnchors` 与代码定位救回，截图证明成品是对的。
> ⇒ **我们按截图 + 镜像公式实现，不照抄那几个坏值**；`docs/view/ui-handoff.md §9` 记一条。

### 4.2 R2 回合板（`.rbb-round`）

上游是 `UI Layer/Weather` 节点（100×50，顶锚居中）：`Button` 子节点 = 内置白图 **染黑** + Outline ⇒ 黑底圆角板；`Turn Text` = 内置字体 **16px Bold 居中**、色 `(0.3216,0.898,0.9765)` = **`#52E5F9`**、`lineSpacing 1.1`、文本 **`"回合\n" + currentState.turn`**。
实测截图：黑区 design `(431.5,11) .. (528,58)` ⇒ 与盒 `(430,10,100,50)` 吻合（外圈白光是 Outline）。

> `Fight/battle indicator.png`（40×23）**在场景里没有任何引用** ⇒ 不用它。`battle normal.png` / `battle outline.png` / `battle split line.png` 属 R4 页签簇的「战斗」大字标，不属回合板。

### 4.3 R3 战斗记录（`.rbb-record`）

`Bottom Bar/Record Scroll View` `ap(-20,-12.5) sd(360,180) a(0.5,1) piv(0.5,0)` ⇒ 设计盒 **`(280,245,360,180)`**，正好坐在底栏上沿、水平居中（中心 x=460）。
内置 UISprite 底 + Outline + `ScrollRect`；正文 `TextMeshProUGUI` **12px 白**、字体 SIMSUN SDF、节点 `Record` 宽 350、`ContentSizeFitter` 顶左。
数据 = `currentState.reports` 逐行拼接（`ConcatToString("\n")`），**每次刷新后滚到底**（`verticalNormalizedPosition = 0`）。
默认态：`Awake` 里若面板 active 就 `ToggleRecordPanel()` ⇒ **默认收起**，截图里它就是空的（看不到面板 ⇒ 不画，符合「截图是空的 ⇒ 不画」）。
把手 = `Extend Button`（`down.png`/`up.png` 56×15，`Map/` 下），点击把面板 y 移 ±180 并换三角朝向。位置见 §10 待核 #1。

### 4.4 R4 页签簇（`.rbb-options`，`BattleOptionSelectView`）

盒 `(773,429.5,185,110)`。字标全部是 **烤好的 PNG**（84×32 / 182×105），不用 DOM 文本 —— 字体对不上，且 `normal`/`chosen` 两态美术差异大。

| 页签 | 盒（绝对设计坐标） | normal / chosen | 模块索引 |
|---|---|---|---|
| 精灵 | `(777,430.5,84,32)` | `pet normal.png` / `pet chosen.png` | 1 `changeView` |
| 捕捉 | `(869,430.5,84,32)` | `catch normal.png` / `catch chosen.png` | 2 `captureController` |
| 战斗 | `(775.5,432.5,180,103)` 居中压底 | `battle normal.png` / 选中加 `battle outline.png` + `battle split line.png`(110×4) | 0 `skillView`（默认） |
| 道具 | `(777,505,84,32)` | `Item normal.png` / `Item chosen.png` | 3 `itemController` |
| 逃跑 | `(869,505,84,32)` | `escape normal.png` / `escape chosen.png` | 4 `escapeView` |

簇外两个浮钮（贴底栏上沿）：
- **自动战斗** `.rbb-auto` `(788,390,110,30)`：内置白框染黑 + 黄 Outline + 勾选框（25×19，`Panels/Mailbox/Sprites/check.png`）+ Zongyi 16px `#FFCC33`「自动战斗」。
  仅当 `battle.settings.isAutoOK` 才建。**打开后弹 Hintbox** 要求填出招顺序（占位「例如：1,3,4,4,2,1（逗号分隔）」）+ 「自动释放必杀技」开关。
- **绿圆钮** `.rbb-noop` `(908,382.5,40,40)`：`StaticResources/Sprites/Map/flip.png`（54×54 源）。上游语义 = **无操作/跳过本轮**（不是换宠）。

### 4.5 R5 必杀槽（`.rbb-superskill`）

盒 `(1,431,70,105)`，内置白框染黑；内嵌 `Super skill indicator.png`（53×77，青色赛尔机器人线稿）居中，**三层叠图**（`Background (0/1/2)`）用于发光动画。
行为（`BattlePetSkillView.SetSuperSkillInteractable`）：按钮**永远可点**，但 `superSkillClickable` 为假时点击直接 return；**怒气够 ⇒ 第 0 层套 `ParticleAfterburner.mat` 发光**。
⇒ 呈现规则：**没攒够必杀 = 暗徽章；攒够 = 发光**。这是截图左下那个「机械徽章」的唯一语义。

### 4.6 R6 技能卡（`.rbb-content` 的 `skillView` 页）

4 个固定槽（`skillBlockViews[4]`），**空槽 `SetActive(false)`** —— 不占位、不画灰框。
卡盒 `155×82`，pitch **175**，`x_i = 80 + 175*i`，垂直居中于 Content（Content 中心 487.5 ⇒ 卡顶 ≈ 447）。
底 = `Fight/Skill normal.png`（155×82，自带左侧圆环 + 横线纹）。

卡内（`BattlePetSkillBlockView`）：

| 字段 | 呈现 | 读数 |
|---|---|---|
| 属性徽章 | 左侧圆环内 `Elements/{elementId}.png` | `skill.elementId` |
| 技能名 | 顶部，**`fontSize = 20 − max(name.length, 6)`**（6 字→14、3 字→14、8 字→12…） | `skill.name` |
| 威力 | `威力: {power}` | `skill.power` |
| 分类 | 左下，`物理 / 特殊 / 属性` | `skill.category` / `type` |
| 消耗 | 右下，`rule` 分流：Anger ⇒ `怒气: {anger}`；PP ⇒ `PP: {pp}/{maxPP}` | `driver.rule()` |
| 不可用 | 置灰（`rule=Anger` 且 `anger < skill.anger`；`rule=PP` 且 `PP<=0`） | `skillList().usable` |
| 被动 | `type == 被动` 的卡**点了不响应**（`SelectNormalSkill` 直接 return） | — |
| 悬停 | 在 `(80 + 175*i, 109)` 弹 `infoPrompt` 技能说明 | 后续轮 |

**「无操作」不是第 5 张卡**：它是底栏上方的 `flip.png` 绿圆钮，且 `interactable = (mode == Card) || (没有任何可用技能)`。
⇒ 现在 `skillView.js` 里那个常驻「无操作」按钮要**删掉**，改成 R4 的绿圆钮 + 上述可用性判据。

### 4.7 R7 缺件（本轮只占位，不实现）

- **专属动作（进化）** `Evolve` 节点：`(5,115,50,50)` 底栏左上、`Fight/evolve.png`（120×120 源）；可放时套发光材质。
- **分身/附属** `Token` 节点：见 R1 表，`(90,130,35,35)` + `Clone.png`。
- **手牌 / 牌库** `Card` + `Deck Or Grave Or Buff`：仅 `BattleMode.Card`（`defaultOptionIndex = 6`），本文不覆盖。
- **伤害数字 / 暴击 / 治疗 / KO / 必杀起手** 动画层：属 U5 舞台，另文。
  权威锚点先记：我方伤害锚 `(550,-250)`、敌方 `(250,-250)`（相对各自 `Anim` 节点 400×110）；治疗数字 = `Heal Number.prefab` 320×160、内置字体 48px Bold 居中、色 `(0.467,0.886,0.047)` 绿 + 黑 Outline；伤害底 = `Damage Background.prefab` 225×158 + `damage normal.png`。
- **宠站位**：上游宠挂在 `Main Camera` 下（正交 size 5），主战宠 `anchPos (0.13, −0.4) scale 2`、副战宠 `(0.13, +0.4) scale 1`（sortOrder −1 压在后）。
  换算到 960×540 屏幕：`y = 270 − 0.4×(540/10) = 248.4`（主战），副战 `y = 291.6`。U5 现用锚 x=120/1080，**待与 U5 舞台一并校**，本轮不动。

---

## 5. 资产权威表

**除标注外全部实测存在**，路径根 = `projects/Seer2-Restart-Lite-main/`。所有 Fight PNG 的 `.meta` 实测 `spriteBorder = (0,0,0,0)` ⇒ **没有任何 9-slice**，一律按源尺寸画或整块拉伸；场景里那些 `Sliced` 图全是 Unity 内置白图（染色用）。

| 用途 | 路径 | 源尺寸 | 状态 |
|---|---|---|---|
| 血牌底板 | `Assets/Resources/Sprites/Fight/Player hp bar.png` | 381×110 | 真图 |
| HP 条遮罩 | `…/Fight/hp bar mask.png` | 282×18 | 真图（按宽裁） |
| 怒条遮罩 | `…/Fight/anger bar mask.png` | 261×18 | 真图（按宽裁） |
| 敌方底板 | `…/Fight/Player hp bar.png`（镜像）；`…/Fight/hp bar.png` 271×19 / `Boss hp bar.png` 798×128 | 381×110 / — | **已坐实**：敌方 = 同一张 `Player hp bar.png` 镜像；`hp bar.png` 与 `Boss hp bar.png` 在 Fight.unity **零引用**（impl §2.2） |
| HP/怒 标签 | `…/Fight/Status indicator.png` | 26×38 | 真图 |
| LV 字标 | `…/Fight/Level indicator.png` | 27×13 | 真图 |
| 六珠 有/无 | `…/Fight/Pet yes.png` / `Pet no.png` | 14×19 | 真图 |
| 必杀徽章 | `…/Fight/Super skill indicator.png` | 53×77 | 真图 |
| 底栏 | `…/Fight/Bottom bar.png` | 960×115 | 真图 |
| 技能卡 | `…/Fight/Skill normal.png` | 155×82 | 真图 |
| 页签字标 | `…/Fight/{pet,catch,Item,escape} normal.png` + `* chosen.png` | 84×32 | 真图 |
| 战斗字标 | `…/Fight/battle normal.png` / `battle outline.png` / `battle split line.png` | 182×105 / 182×105 / 67×2 | 真图 |
| 出招气泡 | `…/Fight/Skill name bar.png` | 292×26 | 真图 |
| 属性图标 | `Assets/Resources/Sprites/Game/Elements/{0..25}.png` | — | 真图（`Element` 枚举下标；场景里那个 GUID `f0e005a7…` 是**丢失资产**，走 `Elements/` 运行时路由，同 `PetUISystem.cs:80`） |
| 宠头像 | `Resources/Pets/icon/{petId}.png` | — | 真图（990 张，U3 既定路线） |
| buff 格底 | `Assets/Resources/Panels/OldPetBag/Sprites/85.png` | 86×86 | 真图（缩到 32×32） |
| buff 图标 | `Assets/Resources/Buffs/{resId}.png` | 100×100 | **已坐实**（impl §2.1）：路由 = `BuffInfo.GetIcon()` 的 Addressables `"Buffs/" + resId`，在盘 1012 张；截图里那颗「星形徽章包宠脸」就是 buff 图标本身，格子底另用 `85.png` |
| 绿圆钮 | `Assets/StaticResources/Sprites/Map/flip.png` | 54×54 | 真图 |
| 记录把手 | `Assets/StaticResources/Sprites/Map/{up,down}.png` | 56×15 | 真图 |
| 分身 / 进化 | `Assets/StaticResources/Sprites/Map/{Clone,evolve}.png` | 100×100 / 120×120 | 真图 |
| 勾选框 | `Assets/Resources/Panels/Mailbox/Sprites/check.png` | 25×19 | 真图（实测尺寸） |
| 结算 | `…/Fight/fight result {back,win,lose,capture}.png` + `… content.png` | 961×319 / 669×43 / 669×42 / 669×43 / 271×268 / 414×41 | 真图 |
| 字体 | `Assets/Resources/Fonts/`：`Mini Diamond.TTF`（数字）/ `MSJH.TTC`（名/技能名）/ `Zongyi.TTF`（LV/自动/页签）/ `Simsun.TTC`（记录/卡文本） | — | **需本地化**：DOM 侧无这四款 ⇒ 用 `@font-face` 引 TTF/TTC，缺字面时诚实降级系统 CJK 并在 §10 登记 |

**作废**：`hp color.png`（282×23 彩虹渐变）在 Fight 战斗 HUD 里**没有被任何节点引用**。
`ui.css:87` 与 `ui.css:230` 现在拿它当血条填充 ⇒ **本轮删掉这两处**，改成 §6.1 的分段纯色。
（顺带修正 `docs/view/scene/room/view-scene-hud-design.md:10` 那句「战斗线那张 `hp color.png` 渐变」—— 地图线和战斗线的血条都是**纯 `#77E20C`**，设计期那句是误记。）

---

## 6. 行为契约（读数 → 呈现）

面板零算数：以下**除颜色插值与宽度比例外的所有判定**都从 driver/core 读，不在 DOM 侧写业务。

### 6.1 HP / 怒 / 腐蚀条

`BattlePetStatusView`（权威）：
```
HP 宽   = (hp / maxHp) × 260      // 改宽度，不是 fillAmount
怒 宽   = (anger / maxAnger) × 246
腐蚀宽  = (corrupt / maxCorrupt) × 260   // 与 HP 同轨叠加
HP 色   = p >= 0.5 ? lerp(#FFFF00, #77E20C, (p-0.5)*2)
                   : lerp(#FF0000, #FFFF00, p*2)
怒 色   = 固定红（场景 Image m_Color）
```
⇒ 满血纯绿 `#77E20C`、半血黄、残血红。**不是渐变图**，是一个随比例变色的实心填充。
动画：`ModifyHp` 逐帧逼近，步长 `speed = 0.005 + 0.01 × max(0,(Δ%−30)/70) × battleAnimSpeed`，`Δ = |hp−lastHp|×100/maxHp`；期间 `isHpDone=false`，三条都 done 才放行下一回合。
**本轮实现口径**：先做瞬时态（直接落最终值），条动画 + `isDone` 门控留到 B5（与 U5 舞台时序合流），避免与 `STEP_MS=650` 序列化打架。

### 6.2 无限怒气

`buff 61` 存在 ⇒ 显示与判定一律按 `int.MaxValue`（`driver.isAngerInfinite(pet)` 已有出口）。

### 6.3 六珠

`BattlePetNumView.SetPetBag`：
```
petNum   = 袋中非 null 数量
aliveNum = 袋中非 null 且 !isDead 数量
i < petNum ? Pet yes.png : Pet no.png
i ∈ [aliveNum, petNum) ? 染灰 : 染白      // 死了但占位 ⇒ 灰实心
```
双打（`parallelCount > 1`）时上游把 `myBag.take(n) ++ [null×(6−2n)] ++ opBag.take(n).reverse()` 拼成一条喂给**我方**面板，`parallelCursor` 另标 —— 本轮不做双打，只走 `myBag`。

### 6.4 buff 网格

`BattlePetBuffView`：过滤 `hide`、按 `info.sortPriority` 排序；格 `32×32`、pitch 32、一行 7（`numInOneRow`）；超过 `numLimitExtend=7` 追加一个「展开」虚拟格，点击切换展开/收起。
格内 = `85.png` 底 + `buff.info.icon`（缺省走 `SpriteSet.GetDefaultIconSprite`）+ 右下角 `buff.value`（**0 则隐藏**），11px 白。
我方自面板左上向右铺，敌方自右上向左铺（截图：我方格在 x≈207 起、敌方格在 x≈725..780 区间）。
> 现 `buffView.js` 用 `buffs[{name,turn}]` 且**静态回合数** —— 换成 `value` 语义 + `85.png` 底 + 缺省图标路由。

### 6.5 名牌

`BattlePetInfoView.SetPet`：无宠 ⇒ 空图 + 名「未知」+ 普通色 + 等级清空 + 副属性块隐藏。
`nameFontSizeFit` ⇒ `< 6` 字用 12px，否则 10px。模组宠（`PetInfo.IsMod`）金色。
副属性块仅当 `subBattleElement !== 普通` 显示。

### 6.6 天气 = 全局 buff（**关键更正**）

`BattleSystemView.SetState`：
```
stateBuffs = currentState.stateBuffs.Select(x => x.Value)
if (currentState.weather != 0) stateBuffs.Insert(0, currentState.weatherBuff)
stateBuffView.SetBuff(stateBuffs)
```
⇒ **天气不是一个独立图标件，它占 `Weather/State Buff` 网格（`(432,65,100,110)`）的第一格**，与全局场地 buff 同格同尺寸同规则（截图里那颗雨云正落在该格位）。
`BattleWeatherView` 只管「回合\nN」文本。
⇒ 现 `weatherView.js` 的「无天气」文字横幅**作废**；无天气时该格不存在 ⇒ **什么都不画**（与截图一致）。

### 6.7 页签与模块

`options = [skillView(0 战斗), changeView(1 精灵), captureController(2 捕捉), itemController(3 道具), escapeView(4 逃跑), opChangeView(5 对方), cardHandView(6 手牌)]`
—— **与现 `optionView.js:6-14` 的 7 槽顺序完全一致**，只换呈现。
`defaultOptionIndex = (mode == Card) ? 6 : 0`；`Select(0)` 实际落到 `defaultOptionIndex`。
`index == 5（对方）` 且 `!settings.isReveal` ⇒ 不切页，弹 Hintbox「当前模式下，对手阵容不公开！」。
`SetBottomBarInteractable(false)` ⇒ 强制回落到 `Select(0)` 并全簇置灰（回合结算中、动画未完时）。

### 6.8 换宠/捕捉/道具页的内容

- `changeView` / `opChangeView`：`BattlePetChangeView`，6 个 `Battle Pet Change Button`（`Pet change option.png` 88×93），在场宠打 `current fight.png`（53×39）火焰角标；已死不可点；`parallelCount>1` 时已在另一侧出手的槽禁点。
  - **阵亡强制换宠**（`BattleManager.ProcessQuery` 的 `SelectOption(myUnit.pet.isDead ? 1 : 0)`）：我方在场宠倒下 ⇒ **自动落到本页**、战斗/捕捉/道具三页签锁死，直到换上来一只活宠；**没有活宠可换**时本页也灰（战斗已判负）。**不可换上的判据是「非当前 且 没死」**（`BattlePetChangeBlockView.SetPet` → `SetInteractable(!pet.isDead)`），**不是**「活宠数 > 1」—— 后者恰好把一只刚阵亡的场景挡死。落地见 `view-scene-battle-impl.md §16`。
- `captureController` / `itemController`：`BattlePetItemController`，8 个 62×62 `Item Button`（`OldPetBag/87.png` 底），数据 = `itemBag`（PVP 时换 `pvpPotionItemDatabase`）。
- 逃跑 = `Hintbox` 二次确认，不是页内容。

---

## 7. 数据契约（driver 出口）

面板只经 `game/app/battle/driver/coreBattleDriver.js` 读数。现有出口已覆盖大部分：

| 需要 | 出口 | 状态 |
|---|---|---|
| 血/怒/等级/属性/副属性/名/星级 | `myPet()` / `opPet()` → `BattlePetView{hp,maxHp,anger,maxAnger,level,name,battleElement,subBattleElement,star,baseId,isDead}` | ✅ |
| 技能列表 + 可用性 | `skillList(pet)` → `{normals:[{skill,usable}], super}` | ✅ |
| 消耗口径 | `rule()`（Anger:0 / PP:1） | ✅ |
| 无限怒气 | `isAngerInfinite(pet)` | ✅ |
| 回合数 | `turn()` | ✅ |
| 战报 | `reports()` | ✅ |
| 我方 buff | `buffsOf('my'\|'op')` | ✅ |
| 天气 | `weatherInfo()` → `{id,name,turn}` | ✅（但要改成「一格 buff」呈现，且需补图标） |
| 六珠 | `myBag()` / `myCursor()` | ✅ |
| 结算 | `outcome()` | ✅ |
| **全局 state buff** | — | ❌ **缺 `stateBuffs()`**（core 里 `state.stateBuffs` 是 `[key,buff]` 数组，加只读出口即可） |
| **buff 图标 / value / hide / sortPriority** | `buffsOf()` 返回的是 **core `Buff[]` 原对象** | ✅ **不缺**（impl §9 更正）：view 直读 `b.value / b.hide / b.info.resId / b.info.sortPriority`，driver 无需扩投影 |
| **天气 buff 图标** | `weatherInfo()` 只给 `{id,name,turn}` | ❌ 缺 `weatherBuff()`（返回 core `Buff`，供图标 + `value`） |
| **敌方袋** | — | ❌ 缺 `opBag()`（「对方」页签用；`isReveal` 也要出口） |
| **腐蚀值** | — | ❌ core 未建模 `corrupt` ⇒ **本轮不画腐蚀条**，§10 登记 |
| **是否公开对手阵容 / 是否允许自动战斗** | — | ❌ 缺 `settings` 只读投影 |
| 分身 / 专属动作次数 | — | ❌ 缺（R7 缺件，本轮不实现） |

⇒ **允许改的只有 `coreBattleDriver.js`（加只读出口）与 `game/app/view/panels/battle/**`。`game/core/**` 零改动。**

---

## 8. 纪律与围栏

1. `game/core/**` 不碰；`tools/difftest.mjs` 与 `node --test game/core/` 必须保持全绿（基线数字以 `docs/engine/port-map.md` 末段为准；本批收口快照见 `docs/view/scene/battle/view-scene-battle-impl.md §14`）。
2. 面板零算数：血条宽度、颜色分段、六珠灰白、页签可用性都是**呈现函数**，允许在 view 里算比例；**任何业务判定**（能不能用、消耗够不够、谁先手、能不能捕捉）一律读 driver/core。
3. AS3 血统不变：`#/battle` + `fightUI.swf` + `battleScene.js` + `battle-kernel.js` 逐字节不动。
4. 缺素材诚实降级：拿不到 PNG 时退回 CSS 矩形并在 DOM 上打 `data-asset-missing="…"`，**不静默换成别的图**（沿用 U5 的降级纪律）。
5. 两套宇宙不合并：本文只服务重启线；`roco.battle.engine === 'as3'` 分支不受影响。

---

## 9. 分期实施

> **落地实况（B5 收口）**：B1–B5 全部完成并通过 §11 判据；每期的 as-built 细节、实测改判与被推翻的施工图条目见 `view-scene-battle-impl.md §14`。门禁快照：`fight-layout 59/0`、`hudtest 17/0`（整件重写）、`capture 19 / switch 13 / encounter 14 / stage 23 / restart-save 21 / selftest 14`、地图 HUD 两件 `21/0 · 27/0` 未动、`node --test game/core/ 272/272`、`difftest 30316/29827/0/0/0`。

| 期 | 内容 | 判据 |
|---|---|---|
| **B1 版式归位** | 顶带两块血牌（含底板 PNG、头像、LV/属性、名牌、六珠）、回合板、底栏 + 页签簇 + 技能卡行；删掉右侧技能浮窗与左侧玩家 HUD | 新布局测试逐区盒 == 本文 §4 表；截图对照无斜对角血牌 |
| **B2 条与色** | HP/怒按宽裁切 + 分段变色 + 数字压条内；镜像敌方从右起算；删 `hp color.png` 引用 | 满血 `#77E20C`、50% 黄、10% 红；条宽 == `hp/maxHp × {260,246}` ±1px |
| **B3 buff / 天气** | buff 网格换 `85.png` + `value` + 缺省图标；天气并入 state buff 网格首格；删「无天气」横幅 | 无天气时该区不产出任何节点；有天气时首格 == 天气 buff |
| **B4 必杀槽 + 页签内容互斥** | 必杀槽发光语义；`Content` 五页互斥；绿圆钮替代常驻「无操作」；自动战斗胶囊 | 切页时同屏只有一个内容块；无操作钮仅在「无可用水技能」时可点 |
| **B5 记录面板 + 把手 + 动画门控** | 360×180 居中面板、折叠把手、滚到底；条动画 + `isDone` 与 U5 时序合流 | 收起态与截图一致；展开后行序 == `reports()` |
| **B6 缺件** | 副属性块、出招气泡、伤害/治疗/KO 数字层、专属动作/分身、双打、卡牌模式 | 各自另立设计段，本文不承诺 |

---

## 10. 冲突与待核清单

| # | 事项 | 现状证据 | 处理 |
|---|---|---|---|
| 1 | **折叠把手位置**：场景读数 = 底栏右下角 `(904,525,56,15)`，截图实测 ≈ `(552..607, 421..439)`（底栏上沿、居中偏右） | `Bottom Bar/Extend Button` `a(1,0) piv(1,0)` + `ToggleRecordPanel()` 移 ±180 | **已关闭** ⇒ 把手骑面板沿、随折叠位移 ±180（收起贴下沿 y≈421 / 展开贴上沿 y≈241），截图量测吻合。权威 = `BattleOptionView.cs:46-61`；落地见 `view-scene-battle-impl.md §2.3 / §6.7`。`openSprite/closeSprite` 的图名映射按 **收起=`Map/up.png` / 展开=`Map/down.png`** 落地，GUID 在 `Fight.unity` 里仍直读不到 ⇒ 节点保留 `data-tbd="handle-sprite"` 诚实留痕，**不算已证**（`impl §14.2 ⑥`） |
| 2 | 敌方血牌底板是否就是 `Player hp bar.png` 镜像 | 场景里敌方 `Status Bar Bg` 的 sprite GUID 未单独确认（`hp bar.png` 271×19 / `Boss hp bar.png` 另有其件） | **已关闭** ⇒ GUID 反查：`Player hp bar.png` 恰被 2 个 `Status Bar Bg` 引用，`hp bar.png` / `Boss hp bar.png`(实测 798×128) **场景零引用** ⇒ 我/敌同图镜像，BOSS 换底推到 B6。见 `view-scene-battle-impl.md §2.2` |
| 3 | buff 图标路由（星形徽章美术从哪来） | `buff.info.icon` → `SpriteSet`，GUID 未在 Assets 里解析到 | **已关闭** ⇒ `BattlePetBuffBlockView.cs:26` → `BuffInfo.GetIcon()` → Addressables `"Buffs/" + resId`，在盘 **1012 张 100×100**（`Resources/Buffs/{resId}.png`，`resId` = core `BuffInfo.resId`，`res` option 覆盖、缺省 = buffId）；缺省图标 = `OldPetBag/{85,87}.png`。见 `view-scene-battle-impl.md §2.1 / §6.3` |
| 4 | 六珠 x 起点：场景 5、实测 12（我方）/ 878（敌方） | `Pet Num` 面板 `(5,113,85,20)`，格 pitch 13 | 差 7px，按 pitch 定案；不影响验收 |
| 5 | 字体：四款 TTF/TTC 无 Web 版式授权/子集 | `Assets/Resources/Fonts/` | **已按此收口** ⇒ `@font-face` 直引 `Mini Diamond.TTF`(数字/LV) 与 `Zongyi.TTF`(页签)，同源静态服务；`MSJH/Simsun` 是 **TTC 集合**，Chrome 只认首字面且子集不明 ⇒ **不引**，名牌/战报继续系统 CJK。见 `impl §2.6 / §14.2 ⑦` |
| 6 | 腐蚀条 | core 无 `corrupt` | 本轮不画；§7 登记为内核侧缺口，**不为 UI 改 core** |
| 7 | 宠站位换算 | U5 用锚 x=120/1080；上游正交相机 `(0.13,∓0.4)` | 与 U5 舞台另校，本文不动 |
| 8 | 上游敌方血牌 anchor/pivot 镜像不完整的序列化瑕疵 | §4.1 注 | 按截图实现，`ui-handoff §9` 记一条「不照抄坏值」 |

---

## 11. 判据

新增 `tools/rbattle-fight-layout-test.mjs`（与 `rbattle-hud-layout-test.mjs` 同构：逐盒断言 `getBoundingClientRect` ÷ scale == 本文 §4 设计盒，容差 ±2px）：

- 顶带两块血牌同在 `y[0..110]`，我方 `x[0..400]`、敌方 `x[560..960]`；**断言不存在任何 y>200 的 HUD 盒**（钉死 S1 不回退）。
- 底栏盒 == `(0,425,960,115)`；技能卡 4 槽 pitch 175、卡 `155×82`；空槽不产出节点（钉死 S2）。
- 页签簇 5 张字标盒 == §4.4 表，且**同屏只有一个内容块可见**（钉死 S3）。
- 血条：`width == round(hp/maxHp × 260)`；满血 `background-color == rgb(119,226,12)`；**断言 CSS 里不再出现 `hp color.png`**。
- 六珠 6 节点、pitch 13、死宠 `filter: grayscale` 或 `data-dead`。
- 回合板文本 `/回合\n\d+/`，盒 `(430,10,100,50)`。
- 无天气 ⇒ `.rbb-statebuffs` 子节点数 == `stateBuffs.length`；有天气 ⇒ 首格 `data-buff-id == weatherBuff.id`。
- 「无操作」不再是技能卡：断言 `.rbb-skills` 无「无操作」文本、`.rbb-noop` 存在且 `disabled` 与「有无可用水技能」互斥。
- 回归：`tools/rbattle-hudtest.mjs` 需按新版式重写断言（现断言的 6 槽几何与 7 平铺槽位是旧 IA，**必须改**，不能当护栏复用）；`rbattle-capture/switch/encounter/restart-save/stage/selftest` 六个功能测试保持全绿。
- 截图留档：`node tools/rbattle-shot.mjs 0 /tmp/rb-fight-b<期>.png`，与 `battle.png` 并排目测一轮。

> **落地补充（B5）**：`rbattle-fight-layout-test.mjs` 已建，59 判据全绿。两处口径按实测收紧/改判：
> ① 测的是**重启遇怪态**（`?encounter=1`，v3 六宠袋），不是 demo 对局 —— demo 态只有「战斗」一枚页签可点，S3 互斥判据会退化成空断言。
> ② 条的**填充方向不能靠 `getComputedStyle`**（绝对定位返回用值 px，拿不到 `auto`）⇒ 改为扫 `document.styleSheets` 断言**声明的规则**（我方 `left:0/right:auto`、敌方 `left:auto/right:0`）。记录面板默认 `display:none` 量不到盒 ⇒ 走公共出口 `record.toggle()` 量一个来回并还原。详见 `impl §14.3`。

