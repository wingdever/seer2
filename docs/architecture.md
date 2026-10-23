# 重启线架构总览（architecture.md）

> **定位**：跨线索引，**只覆盖重启血统**（活跃主线）。AS3 网页线只挂链接、不展开。
> 本文**不重复**每线文档的细节；与每线文档冲突时，**以每线文档为准**。
> 文档纪律：每条结构性断言尽量标 `路径` 或 `路径:函数`，读自真实代码/上游，不写臆想。
> 子文档：**`docs/arch-code.md`（代码架构）**、**`docs/arch-docs.md`（文档架构）** —— 细则下沉于它们。

---

## 0. 这份文档回答什么

- 一个请求（点野怪 → 打一场 → 回图）穿过哪些层、每层负责什么、谁可以依赖谁。
- 重启线的**状态**（存档）和**规则**（内容/数值）分别存在哪、权威是什么。
- 哪些是**不变量**（破了就是 bug），哪些是**已知偏差**（现状如此，待定）。

---

## 1. 不变量（破了即 bug）

1. **内核在 MVC 之外。** `game/core/**` 是纯函数**域引擎**：它需要的外部能力（随机、时钟、存档读写、落盘、弹窗、判定、内容表）
   **一律经接口注入**，核心层只调用接口、自己不实现它们 —— 契约见 **`docs/runtime/runtime-components-design.md`**（人类决议 ③，索引 `AGENTS.md §5`）。
   正确性**主要**由**人类手动测试**验收；差分 oracle（`tools/difftest.mjs`，2026-10-17 实测基线 `向量=30431 可比=29935 不一致=0`，逐批历史以 `docs/engine/port-map.md` 末段为准）与 `node --test game/core/`（同日 `pass 304 / fail 0`）是
   **辅助的回归门**，只回答"数字有没有回归"，不回答"对不对"（口径见 `AGENTS.md §1.1`）。
   无头门禁（`docs/arch-code.md §3` 规则 1）保证它零引擎依赖。
2. **两套血统不合并。** 本条只覆盖重启线；AS3 线（`game/logic/session.js` + `/game/battle` + Ruffle）另存，
   由 `localStorage['roco.battle.engine']` 显式分流，默认重启。两档互不覆盖。
3. **数值权威（重启）** = `getPetNormalStatus`（iv=0）+ `game/data/unity/pets.json` 基值。
   exp→level 曲线**形状**借官方 `rules.json`，**系数仍缺** → 存档打戳 `_authority.exp='borrowed-A/B-shape'`。
   未换血的权威必须**如实标注**，不得谎称。
4. **生成物纪律。** `game/core/**/*.js` 由同名 `.ts` 经 `tools/build-core.mjs` 机械转写。
   改了 `.ts` 必须重跑，否则页面静默加载旧 `.js`。（这是当前无自动门禁的缝。）

### 1.1 范围记账（**2026-10-17 人类拍板 · 全表已决**）

> **为什么要写这一节**：`AGENTS.md §1` 的"阶段一完成 = **所有模块**的 design 定稿"里的"所有模块"**必须有边界**，
> 否则阶段一永远说不清什么时候算完（`totalk.md` **T2** 的存在本身就是这个症状）。
> **留空 ≠ 不做** —— 留空会让下一轮评审重新问一遍。故每一项**都要占一行**：「**结论 + 上游位置**」。
>
> **依据链**：`docs/orchestration/orchestration-design.md §6`（**ORQ1–ORQ7**）先定场景与联机；
> 2026-10-17 人类拍板"**按建议即拍**" ⇒ `totalk.md` **清单 B 其余十九条**一并定案。下面 **A/B/C 三组即其结论**。

#### A. 明确**不做**（出局 · 11 项）

> ⚠️ **2026-10-18 修订**：**`Title`（开始/开场场景）与 `Login`（选择角色/登录）已从本组移出**、并入「要做」（人类拍板）⇒
> 落到 View 线 **B5** `docs/view/scene/start/`（分析报告 + 设计 + impl 三份）。原依据 **ORQ4**（"六场景先按暂不做记账"）就此对这两项失效。
>
> ⚠️ **2026-10-19 修订**：**`Activity`（活动）已从本组移出**、并入「要做」（人类点名"实现活动面板"）⇒
> 落到 View 线 **C4** `docs/view/panel/activity/`（分析报告 + 设计 + impl 三份）。**键值袋机制半边此前已由地图线落地**（`activityStorage` 存档字段 / `activity` 条件 / `setActivity` 动作，见 AGENTS §4 无此围栏记录）；本批补的是**面板 UI + 数据表通道 + linkId 跳转 + 商店限购收编**。**边界**：`mod_home` 的 `map_id` 覆盖位**仍不接线**（人类拍板 ③，见下表 TPC6 追记与 `docs/view/panel/activity/activity-design.md`）。
>
> ⚠️ **2026-10-19 修订（同日第二项）**：**`SPT` 的「面板」半边已从本组移出**、并入「要做」（人类点名"实现游戏的SPT面板"）⇒
> 落到 View 线 **C3 第三份** `docs/view/panel/spt/`（分析报告 + 设计 + impl 三份）。**边界（重要）**：移出 A 组的**只有目录面板**（三页 18 boss 摆位 → 传送）；**`BattleMode.SPT=3` / `Special=4` 的引擎侧战斗规则仍留本组**（T2·18 继续记账，正本处置 = `docs/view/panel/spt/spt-design.md §9`；战斗触发链本身归地图线 MB7，已落）。

| 项 | 上游位置 | 依据（台账号） |
|---|---|---|
| **`Room` PVP 房间** | `Scene Specific/Room/RoomManager.cs`（351）+ Room MVC（542） | ORQ4 · **T2·7** |
| **`Game` 小游戏** | `Scene Specific/Game/**`（≈60） | ORQ4 · **T2·21** |
| **联机（Photon）** | `System/NetworkManager.cs`（161）+ 全仓 **48 处** `PhotonNetwork.*` | 编排线 **ORQ5** · **T2·7** |
| **工坊 Workshop** | `MVC/{Model,View,Controller}/Workshop`（**45 文件 / 16,694 行** = 全仓 ≈24%） | **T2·1** |
| **剧情 Story** | `MVC/Model/Basic/Story`(13/2,892) + `MVC/View/Story`(3/2,186) | **T2·3** |
| **牧场 Farm** | `MVC/Model/Basic/Farm`（Animal 407 / Plant 333） | **T2·8** |
| **伊特肉鸽 YiTeRogue** | `MVC/Model/Basic/YiTeRogue`(2/484) + `YiteRogueData`(177) | **T2·9** |
| **邮件 Mailbox** | `MVC/Model/Basic/Mail`(94) + Mailbox MVC(240) + `MVC/View/Mail`(93) | **T2·10** |
| **卡牌模式** | `Scene Specific/Battle/UnitComponent/UnitCardSystem.cs`(252) + 2 view | **T2·14** |
| **任务 Mission** | `MVC/Model/Basic/Mission`(2/241) | **T2·16** |
| **SPT 战斗规则**（⚠️ 2026-10-19 收窄：**面板半边已移出本组**、立为 View C3 第三份 `docs/view/panel/spt/`；本行只剩 `BattleMode.SPT=3`/`Special=4` 的引擎侧规则） | `BattleSettings.cs:190` 枚举 + `SpriteKingPanel.cs:151/199` 消费 + 地图 `<mode>` SPT 138 / Special 61 条分支（`docs/map/map-battle-trigger.md`，数据照录、动词不实现口径同 `<farm>` 先例） | **T2·18**（收窄） |

⚠️ **「出局」的颗粒度 = 子系统，不是地图**（地图线 **TPQ3** 的澄清，`docs/map/map-teleport.md §7.2`；防下轮被读成"这些 id 要拦下来"）：
光口**指向** A 组出局图时**照传** ——【样本】Unity 血统里 `990`「普兰特山脚」的光口各有 **1 条**指向 `50000`「小屋」与 `1010`「普兰特牧场」，
而这两张都是**普通可玩地图**（有 `initialPoint`、有 NPC、光口走得回来：`1010 → 990`、`50000 → -70`）。⇒ 地图线**只保证"传得进、走得岀"**，两条边界：
① **`<farm>` / `<animal>` 这类元素照录进桥**（M1 的七类实体之一：实测 `1010` **15** 只动物、`990` **12** 块农田），
但**其动词（种植 / 喂养 / 收获 / 面板）不实现** —— 那是**牧场**这一行；
② 上游 `Teleport(50000)` 里那条 `Activity.Find("mod_home").GetData("map_id")` 查表**不实现** —— 原记为**活动**这一行（`TPC6`）；**活动 2026-10-19 已立线**，但该覆盖位**仍不接线**（= 活动 design 本份已拍板 **ACQ3**，人类 2026-10-19：`50000` 恒当普通图直进，手测清单第 6 条不变）。活动线只在文档里记账"袋已可读、覆盖位存在未接"（见 `docs/view/panel/activity/activity-design.md`），要接得改地图线 `runTeleport` 决议。

#### B. 明确**要做** —— **并线**（**不新立线**，只补指针 · 3 项）

| 项 | 上游位置 | 并到哪条线 / 已有决定 |
|---|---|---|
| **加载屏 / 新手引导** | `Scene Specific/Loading/**`(5/318) + `Panels/{Noob,GuideLine}` | **A1** `docs/view/mech/view-shell.md`（视觉）+ **编排线**（调用顺序）—— **ORQ1** 已定"**做薄版**" |
| **设置 / 音频** | `SettingsData` + `VolumeSetting`×3 + `System/AudioSystem`(250) | **编排线**（时钟 / 音频缝）—— **ORQ2** 已定"**先做缝不做内容**"；设置**面板**归 **C5** |
| **皮肤 / 打击音 / 变身 的消费侧** | `System/ResourceManager.cs:821-835` + 三张 CSV（`hit/sound/transform`） | **数据侧 = D7 `B5`**（**人类决议 ④**"要建数据桥"）+ **消费侧 = 引擎 E7 / View B4**（战斗里谁读这三张表） |

#### C. 明确**要做** —— **需立线 / 子文档**（6 项 · 含建议排期）

| 项 | 上游位置 / 体量 | 目标落点（建议） | 已有半边 |
|---|---|---|---|
| **地图 / NPC / 对话 / 传送**（**最大可玩缺口**） | `Scene Specific/Map/**`(23/4,211) + `MVC/Controller/Map`(9/716) + `MVC/View/Map`(8/1,094) = **40 / 6,021**；表 `Resources/Data/Maps/*.xml` **272 张** | **✅ 已立「地图线」**（2026-10-17）⇒ `docs/map/map-design.md`（写侧：**条件 → 动作** / 对话 / 传送 / 地图战斗触发 / 几何寻路；**MQ1** = 写侧以**重启血统**为权威） | **渲染半边已落**（B3 `docs/view/scene/room/view-scene-map-content.md`）+ **地图传送点"光口"已落**（见该文件 §2.4/§8.1） |
| **图鉴** | `PetDictInfoController`(71) + `PetDictInfoView`(99) ≈ **170** | **C1 的图鉴支 + 宠线（D7）** | 存档已有 `caught/seen` 计数；C1 已定 13 个 Panel 的归属 |
| **门 Door** | `MVC/Model/Panel/DoorModel`(189) + Controller(89) + View(31) ≈ **309** | **C3 地图族面板 + 地图线** | 地图渲染既有（B3） |
| **融合 Fusion** | `PetFusionSystem`(97，含 `FusionRecipe`) + `FusionModel`(113) + `FusionView`(38) ≈ **248** | **道具线（ITQ7）+ 宠线 D7（`fusion-recipe.ts`）+ C2 面板** | D7 已出 `FusionRecipe` 的 shape 并判"配方来源 = Item 族"——**道具线 2026-10-17 已立** |
| **开始 / 选择角色场景**（2026-10-18 从 A 组移出） | `Scene Specific/Title/**`(4/1,077) + `Scene Specific/Login/LoginManager.cs`(68) + `MVC/{Controller,Model,View}/Player`(≈1,424)；场景资产 `Title.unity`(13,107) / `Login.unity`(4,564) | **✅ 已立（2026-10-18）⇒ `docs/view/scene/start/`**（View 线 **B5**：分析报告 `restart-start-scene.md` + 设计 `view-scene-start-design.md` + impl `view-scene-start-impl.md`） | **无**（三份本轮成文）—— 3 槽存档归 Save 线、会话/启动顺序归编排线 |
| **活动 Activity**（2026-10-19 从 A 组移出） | 键值袋机制 `MVC/Model/Basic/Activity`(2/188) + 面板 MVC（Model/Controller/View/Panel ≈177）+ 数据表 `Resources/Data/Activities/info.csv`（表头 + **135 条活动**，99 可见 / 36 hide） | **✅ 已立（2026-10-19）⇒ `docs/view/panel/activity/`**（View 线 **C4** 社交信息族首份：分析报告 `restart-activity-panel.md` + 设计 `activity-design.md` + impl `activity-impl.md`） | 键值袋**存档字段 + 条件/动作**已由**地图线**落地（`activityStorage` / `activity` / `setActivity`）；本批补**面板 UI + `activities.json` 数据通道 + linkId 跳转 + 商店限购收编**（`state.shop.bought` → `Activity("shop")` 落盘）|
| **SPT 面板**（2026-10-19 从 A 组移出，同日第二项；⚠️ **只面板**，战斗规则仍在上表 A 组） | `Panels/SPTBoss`（脚本 2 台 69 行 + `Panel.prefab` 手摆 18 只 boss 表）+ `MapMenuController.OpenSPTPanel`（初始页定位）+ 地图唯一 `openPanel SPTBoss[page=2]`（`10001.xml:70`） | **✅ 已立（2026-10-19）⇒ `docs/view/panel/spt/`**（View 线 **C3 第三份**：分析报告 `restart-spt-panel.md` + 设计 `spt-design.md`（SPQ1–6 待拍板）+ impl `spt-impl.md`；施工同 `worldmap/` 先例） | 传送链 = M5 入口 #5（`runTeleport` 已落）；宿主/头像/悬浮件 = A2/A3/`_kit` 既有；**boss 战斗触发本身已随 MB7 在**（点图上的 boss 开 `#/rbattle` 遭遇）|

**建议设计顺序（"要做"的 8 项）**：
**① 地图 / NPC / 对话 / 传送**（最大可玩缺口，且渲染半边已落 ⇒ **✅ 已立线 2026-10-17**，总设计 `docs/map/map-design.md`；子设计 **M1–M8 已成文（待评审）**，**M8 = 角色穿戴/骑乘资料索引 · `ALQ1=A`/`ALQ2=B` 已拍板 · impl 计划 = `map-impl §3.10` · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e 停点等人手测 §8.17 + 素材采集 · f 停点等人手测 §8.18 · g 停点等人手测 §8.19 · f2 停点 §8.20（修「双角色」）**）
→ ✅ **开始 / 选择角色场景**（**2026-10-18 立**，从 A 组移出 ⇒ `docs/view/scene/start/` 三份已成文）
→ **② 融合**（三处已有半边：道具线 + D7 + C2）
→ **③ 图鉴** → **④ 门**
→ **⑤–⑦ 并线三件**（加载屏 / 设置·音频 / 皮肤·打击音消费侧 —— 都只需补指针 + 薄实现）。

⚠️ **注意**：
- ⇒ **我们的场景集合 = `title` / `login` / `map` / `battle` / `rbattle` 五个**（上游 6 个里除 `Room`/`Game` 外都纳；**`Title`/`Login` 于 2026-10-18 纳入**）⇒ **启动走 `title → login → map`**（`#/map` 直进保留为开发捷径）。
- ⚠️ **本表即"已由人类拍板"的范围项**（来源 = 编排线 §6 决议表 + 2026-10-17"按建议即拍"）
  ⇒ `totalk.md` **T2 清单 B 至此全部有主**（A 组 = 出局；B/C 组 = 要做，档期在 §C 末）。
- ⚠️ **"暂不做"是记账不是销毁**：上游代码与 `totalk.md` 的实测行数都留着；将来要立，按 `docs/arch-docs.md §0.1`「新增一条线」照常立。
- ⚠️ **不做 ≠ 可以碰**：A 组各项在代码里的**围栏**（如 `docs/engine/battle-engine-session.md §S13` ①②③）**仍按围栏执行**；
  A 组**不许**被别的线顺手实现（要做得先改本表）。

---

## 2. 分层与依赖方向

| 层 | 目录 / 文件 | 职责 | 允许依赖 |
|---|---|---|---|
| **L0 域引擎** | `game/core/**`（`.ts` 权威） | 战斗规则纯函数 | 无（零上层、零引擎） |
| **L1 域逻辑** | `game/logic/**`（`rng`/`stats`/`settle`/`restartSession`） | 无 DOM 的纯函数：存档、结算、成长 | L0（经注入，不直接 import） |
| **L2 内容桥** | `game/data/**` + `game/app/content.js` | 表 → 运行时对象；宇宙权威的单一出口 | L0、L1 |
| **L3 表现** | `game/app/view/**`、`game/app/ui.css` | 手写 DOM，逐区复刻 | L2（见 `arch-code.md §8` 偏差） |
| **L4 编排** | `game/app/scenes/**`、`router.js`、`state.js` | 场景挂载、输入、宇宙分流 | 全部 |

依赖方向（实体关系）：

```
L4 scene ──► L2 content ──► L0 kernel
   │  │                        ▲
   │  └──► L1 logic             │
   │                           │
   └──► L3 view ──► L2 content ─┘   (L3 直接读 L2：当前现实，见 arch-code.md §5)
```

- **单向向下**：上层可调用下层，下层不认识上层。例外只有 `arch-code.md §5` 那条（view→content）。
- **L0 对上层不可见**：`scenes`/`driver` 通过 L2 的适配函数取数，不直接把内核类型漏给 view。
- **注入不算反向依赖**：L0 声明接口 + 默认抛，上层在装配时把闭包喂进来（`setXxx(...)` 仍是上层→下层的一次调用）。
  这些接口**收拢在哪几件、每件一个缝**：`docs/runtime/runtime-components-design.md §5`。
- **L4 编排的 design**：`docs/orchestration/orchestration-design.md`（会话 / 场景切换器 / 服务三件 + 启动顺序）。
  该层**一直在代码里**（上表最后一行），2026-10-17 才补上文档 —— 立线依据 = `totalk.md` **T2·4**（三条现有文档的箭头曾指向这条不存在的线）。

---

## 3. MVC 三轴（作为**视角**，不是三个类）

- **Model = L1 状态 + L2 规则 + L0 引擎（被调用）**：存档是 M 的状态面，内容是 M 的规则面，内核是 M 的计算面。
- **View = L3**：手写 DOM（D2 决策：逐面板手写，不写 prefab→DOM 转换器）。
- **Controller = L4**：场景挂载/卸载、输入接线、路由、宇宙分流。

> 选用 MVC 的价值在**依赖方向**（谁可以 import 谁），不在"三个字母各一个类"。

---

## 4. 详细面（下沉为子文档）

| 轴 | 子文档 | 内容 |
|---|---|---|
| **代码架构** | `docs/arch-code.md` | 目录树、各层文件与入口、依赖规则、存档/内容子系统骨架、真实链路、生成物纪律、偏差 |
| **运行时功能组件** | `docs/runtime/runtime-components-design.md` | 核心层需要的**外部能力**（随机源 / 时钟 / 存档读写面 / 写盘 sink / 弹窗 sink / 判定与战斗宿主 / 内容表注册）——**一件一缝**的契约、默认行为、装配点与验收口径 |
| **编排线**（2026-10-17 立） | `docs/orchestration/orchestration-design.md` | **L4 编排**：会话 / 场景切换器 / 服务三件（时钟·请求·音频）+ 启动顺序；上游 `Scripts/System/**` 七件真值 + 边界三则 + 不变量 OR1–OR8（含 **OR8 模态处置**，待评审）+ 上游怪癖 ORC1–ORC5 + 待拍板 ORQ1–ORQ7（✅ 全决） |
| **道具线**（2026-10-17 立） | `docs/item/item-design.md` | **道具的表与动词**：静态表 + 背包 API + **使用规则**（用几次 / 扣多少）+ 买卖（币种 = 另一件道具的 id）。**边界支点**：道具的效果**就是** D3 的 `Effect` ⇒ 本线**不建第二套效果引擎**（执行归 E4/E5、写盘归编排线，决议 ③）；不变量 IT1–IT8 + 上游怪癖 ITC1–ITC5 + 待拍板 ITQ1–ITQ8 |
| **地图线**（2026-10-17 立，C 组排期 ①） | `docs/map/map-design.md` | **地图的名词与"会发生什么"**：**两套血统**（AS3 爬取件 259 vs 重启 Unity 272，**MQ1 = 写侧以重启为准**）+ 七类实体 + **★基石对象 `NpcButtonHandler`（条件 → 动作）** + **14 种条件的命名空间表** + **18 种动作** + 对话 / 传送 / **地图战斗触发** / 几何寻路 / 漫游 NPC。**边界**：画面 = B3、打起来 = E 线、会话宿主 = 编排线；不变量 MP1–MP8 + 上游怪癖 MC1–MC8 + ✅ **MQ1–MQ8 已拍板**（§7 = 决议表）+ 子设计 M1–M8（**M8 = 角色穿戴/骑乘资料索引 · `ALQ1=A`/`ALQ2=B` 已拍板 · impl 计划 = `map-impl §3.10` · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e 停点等人手测 §8.17 + 素材采集 · f 停点等人手测 §8.18 · g 停点等人手测 §8.19 · f2 停点 §8.20（修「双角色」）**）+ 施工批 MB1–MB5 |

> ⚠️ **文档面的其余各条**（**文档架构** `docs/arch-docs.md`、**代码分析报告**、**等待讨论台账** `totalk.md`）**只在 `docs/arch-docs.md`（§1/§6/§0.1）记一份**，本文件不重复。

> 存档子系统：**上游真值**见 `docs/save/save-design.md`（+ `save-xml-spec.md`），**落地计划**见
> `docs/save/save-impl.md`（+ `save-code-map.md`）。
> 战斗引擎线：**导读**见 `docs/engine/battle-engine-overview.md`（构成与机制，读得懂）；
> **总设计**见 `docs/engine/battle-engine-design.md`（边界 / 模块图 / 不变量 / 口径 / **§8 子设计地图**）；
> 移植路线见 `docs/engine/kernel-handoff.md`。
> **域模型与求值线**（引擎的下层，依赖单向 引擎 → 域模型 → 底座）：**总设计兼导读**见
> `docs/domain/domain-design.md`（不变量 / 族图 / **§4 与引擎的接缝清单** / 子地图）；子设计
> `docs/domain/domain-{base,status,effect,buff,skill,pet,info}.md`（**D1–D7 全部已写**）；边界真值 = `battle-engine-design.md §8.4`。
> 原 §4（存档骨架）/§5（内容与数值）/§6（真实链路）/§7（偏差）已迁入 `arch-code.md`；§8（文档索引）已迁入 `arch-docs.md`。
