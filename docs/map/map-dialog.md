# 地图线 · M4 —— 对话模型（map-dialog.md）

> **定位**：本份写地图线的**多步 UI 状态机**——对话：`DialogInfo` 的真实形状、`<dialog>` 在**两套血统**里的两个东西、
> `openDialog` 的**入口合同**、★**"branch" 的三重身份**、★**`type="branch"` 其实是"附挂到上一条可见项的隐藏动作"**、
> **关闭语义为什么是"数据驱动的 7 条件门"**、`{expr:}` 插值（MQ8 的落点）、以及 `story=` 前缀这条**剧情侧缝**。
>
> **父文档** = `docs/map/map-design.md`（边界 / **MP1–MP8** / **MC1–MC8** / **MQ1–MQ8 决议表**）—— 本份**只细化不重复**；
> 冲突以本份为准（更细 ⇒ `docs/arch-docs.md §3`）。
> **同线兄弟**：**M1** `docs/map/map-data.md`（数据形状与桥）· **M2** `docs/map/map-npc.md`（`openDialog` **之前**：动作怎么出决议）·
> **M3** `docs/map/map-condition.md`（对话选项的条件**也**用它那张分派表）· **M5** `docs/map/map-teleport.md` ·
> **M6** `docs/map/map-battle-trigger.md`（`winHandler` 里的 `openDialog` = 本份的**再入点**）· **M7** `docs/map/map-move.md`。
> **邻线**：**A3** `docs/view/mech/view-overlays.md`（★**渲染正本**：几何、颜色、打字机、`DialogView`/`NpcView` 的版式）·
> **编排线** `docs/orchestration/orchestration-design.md`（会话宿主：`isShootMode` / `UILayer` / `currentNpcId` 的**归属**）·
> **道具线** `docs/item/item-design.md` 与 **D6** `docs/domain/domain-pet.md`（`{expr:}` 与选项条件的**值来源**）·
> **R1/R2** `docs/runtime/runtime-components-design.md`（★本份**不需要**它们——见 §7.2 末）。
>
> **真值源**：`Assets/Scripts/Scene Specific/Map/Entities/Dialog/DialogInfo.cs`（**70**）·
> `.../Dialog/DialogManager.cs`（**616**，★其中约 **500 行是剧情层**）· `MVC/Controller/Utility/Dialog/DialogController.cs`（**70**）·
> `MVC/Model/Utility/Dialog/DialogModel.cs`（**12**）· `MVC/View/Utility/Dialog/DialogView.cs`（**990**，本份只取 `:86-139` `:847-952`）·
> `Scene Specific/Map/Entities/Npc/NpcActionHandler.cs:163-186`（`OpenDialog` 动作）· `NpcInfo.cs:46-47`（容器声明）·
> `Scene Specific/Map/MapMusic.cs:21-35`（`AnimInfo`，`<gif>` 的类型）· `MVC/View/Map/MapSceneView.cs:490-531`（战斗后再入）·
> `System/Parser/Identifier.cs:10-33` `:35-188`（`{expr:}` 的求值面）·
> `Resources/Data/Maps/*.xml`（**272** 张，Unity 血统）【样本】· `swf/map/config/*.xml`（**259** 张，AS3 血统）【样本】。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **DLI1–DLIn**（不变量/契约）/ **DLC1–DLCn**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**）/
> **DLQ1–DLQn**（待拍板，附建议）—— **全是本线局部编号**，**不是**「人类决议 ①–⑧」（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。依父文档 §7 决议表（MQ1–MQ8 已拍板 2026-10-17），本份**只落 MQ8 与 MQ1/MQ2 的对话切片**。

---

## 0. 这份文档回答什么

1. **`DialogInfo` 的完整形状**（§2.2）—— 14 个成员里 **7 个 `story*` 相关成员在发行数据中 0 命中**；`color` 属性 **0 命中**。
2. **★同一个词 `branch` 在地图 XML 里有三重身份**（§2.3）—— `<dialog><branch>` = 一条对白、`<reply type="branch">` = 附挂动作、`<battle><branch>` = M6 的战斗分支（实测 **655 : 320 : 680**）。
3. **`<dialog>` 是两套血统里形状完全不同的两个东西**（§2.4）—— Unity **279 容器 / 655 branch** vs AS3 **132 / 128**，且 AS3 的 `<reply>` 是**文本 + 内联 action**，不是"条件→动作"。
4. **入口合同**（§2.5）—— `openDialog` 的 `param[0]` = **当前 NPC 的 branch id**，⚠️ **或字面量 `"null"` ⇒ 关闭**（实测 **533 条**）；作用域是**单个 NPC**，⇒ 悬空引用**可在解析期判定**（实测 **2 条**）。
5. **★出口合同 = 7 条件门**（§2.7）—— 地图对话**没有关闭按钮**；点背景能不能关，取决于"replyHandler 恰好 1 项且它是 `openDialog null`"。实测：单选项对话 **426** 条里 **309** 可关、**117** 条点了没反应。
6. **★`type="branch"` 的真实语义**（§2.8）—— 它**不渲染成一行**，而是**把动作挂到上一条可见项的点击上**；一个可见项最多附 **6** 条（实测组数 func **53** / reply **101**，"可见项与附挂项同时带条件" **177** 次）。
7. **`{expr:}` 插值的真实分量**（§2.9）—— 实测只有 **1 条 `<content>` / 4 个表达式 / 全是 `item[..].num`** ⇒ **MQ8 的最小落法**（机制保留、优先级最低），但它把 `Identifier` 的**第三份文法**拉进了对话（§2.9 末）。
8. **`story=` 前缀 = 数据里的剧情开关**（§2.10）—— 实测 **59 条 content / 5 张图**，且这 5 张**全部没有本地 swf** ⇒ **不在 MQ2 的第一批 134 张里** ⇒ 剧情半边出局**零阻塞**（**DLQ1**）。
9. **目标契约**（§3）—— `core/map/dialog.ts` 的 `DialogSpec` / `DialogBranch` / **`Choice`（可见项 + `resolutions[]`）**；关闭 = **独立意图** `closeDialog`，不再是 `openDialog` 的哨兵。
10. **我们侧的现状**（§6）—— 对话**0 行**，而且**今天的桥读的是另一套血统**（`tools/build-map-index.mjs` 的 `DIR = 'swf/map/config'`）⇒ M4 的**第一个依赖不是代码，是 M1 把 Unity 侧 `npcs[]/dialogs[]` 落进桥**。

---

## 1. 范围与边界

| 圈里（本份） | 圈外 → 归谁 |
|---|---|
| `DialogInfo` 的**数据形状**与 `<dialog>` 两套血统的解析合同 | 对话**怎么画**（几何/颜色/字号/打字机/浮层层级）⇒ **A3** `docs/view/mech/view-overlays.md §2.2` |
| `openDialog` 的**入口合同**（param → branch 选择）与**作用域** | 动作**怎么决议**（18 条动作总表）⇒ **M2** `docs/map/map-npc.md §2.6` |
| **选项的求值语义**（可见项 + 附挂 `branch` 的执行顺序） | 条件串的**求值**（算子/命名空间/三值）⇒ **M3** |
| **对话 = 无栈状态机**（`(npcId, branchId)` 是唯一状态） | 战斗后再入的**胜负链** ⇒ **M6**；对话里 `teleport` 的**走位与切图** ⇒ **M5** |
| `{expr:}` 插值的**机制与失败口径**（MQ8） | `item[..].num` / `petBag` 等**值的域语义** ⇒ 道具线 / **D6** / **D7** |
| `story=` **前缀这条缝的记账**（它为什么能出局） | 剧情演出本体（`Stories/*.xml`、`StoryPanel`、`storyActorLayer`）⇒ **A 组出局**（`docs/architecture.md §1.1`） |
| **中文文本的搬运**（不归本份渲染） | 字体 / 归 DOM ⇒ **MP4** + A3 |

⚠️ **本份与 A3 的分工支点**：本份产出的是**"该显示什么"**（`DialogBranch` + `Choice[]` + `ActionIntent[]`），
A3 消费它并决定**"长什么样"**。上游的 `DialogView` 把两件事写在同一个类里（`:847-952` 一边算附挂语义一边摆 `anchoredPosition`），
⇒ **DLC6** 的两套重复代码就是这么来的。

---

## 2. 上游真值

### 2.1 实测定量（Unity 血统 `Resources/Data/Maps/*.xml`，272 张）【样本】

**先说方法**（M3 §2.1 同一条纪律）：**必须用 XML 解析器，不能 grep**。本仓顶层文档 `docs/map/map-design.md §2.1` 记的
`<dialog>` **300** / `<branch>` **1,371** / `<reply>` **1,098** / `<func>` **486** 是 **grep 数**，逐条对上差额：

| 标签 | grep | 解析所得 | 差额去向 |
|---|---|---|---|
| `<dialog>` | 300 | **279** | **21** 处在 `<!-- -->` 注释里（例：`10017.xml:41-58` 整段被注释的 `<npc>`） |
| `<branch>` | 1,371 | **655**（`dialog` 下）+ **680**（`battle` 下）+ **36** 注释 | ★**同名不同物**，见 §2.3 |
| `<reply>` | 1,098 | **1,071** | **27** 注释 |
| `<func>` | 486 | **471** | **15** 注释 |

⇒ **本份一律用解析数**，并在 §9 回执里把父文档那行的口径改成"解析 / 含注释"两列。

| 量 | 实测 | 备注 |
|---|---|---|
| `<npc>` | **604** 个（grep 640） | 含 `<dialog>` 的 = **279**（**46%**） |
| `<dialog>` 容器 | **279** | 每个 NPC **最多 1 个**（`NpcInfo.cs:46` 是 `List`，数据里没人用第二个） |
| `<branch>`（= `DialogInfo`） | **655** | distinct `id` **228**；`default` **256**（**39%**）⇒ §2.5 的入口默认名 |
| 每 NPC 的 branch 数 | `0:326 1:155 2:58 3:21 4:6 5:14 6:2 7:2 8:5 9:9 10:2 11:1 13:1 14:1 22:1` | ★最长一条对话树 **22 个分支**（`50024.xml`） |
| `<content>` | **650** | ⚠️ **5** 个 branch **没有 content**（纯功能壳，见 §2.6 的 NRE 面） |
| `<functionHandler>` / `<func>` | **169** / **471** | `type`：`click` **384** / `branch` **83** / **无 `type` 4** |
| `<replyHandler>` / `<reply>` | **650** / **1,071** | `type`：`click` **834** / `branch` **237** |
| 带 `<condition>` 的比例 | func **155（33%）** · reply **139（13%）** | 对比 NPC `eventHandler/button`（M3：**51%** 无条件）⇒ **选项里三分之一的确有门** |
| `<param>` 个数（func+reply） | `0:2 1:1,226 2:79 3:58 4:12 5:137 6:15 9:13` | ⚠️ **2 项完全没有 `<param>`** ⇒ 点击直接 return（§2.5） |
| `openDialog` 的 `param[0]` | distinct **169**；`"null"` **533**（reply **532** + func **1**）·真翻页 **176** 条 | ★**"关对话"比"翻页"多 3 倍**（§2.7） |
| 悬空 `openDialog` 引用 | **2** 条 | `-404.xml` → `not_enough`；`50019.xml`(npc 7002) → `mission_6_dream_11`（实际只有 `_1…_10`） |
| 同 NPC 重复 branch id | **1** 例 | `-404.xml` / npc `-40401` 有两个 `reward` ⇒ 第二个**永不可达**（`Find` 取首个） |
| `<gif>` | **3** | 全在 `10010.xml`，`Dango/idle/10303\|10306\|10309` |
| `{expr:}` | **1 条 content / 4 个表达式** | `10693.xml` 的 branch `feather`，全是 `item[40001{7,8,9,20}].num` |
| `story=` 前缀 | **59 条 content / 5 张图** | `50024` 20 · `50016` 20 · `50019` 7 · `540` 6 · `50023` 6 ⇒ §2.10 |
| content 内富文本 | **71** 条 / **23** 张图 | ★标签白名单实测只有两种：`<color=…>` **81** 对、`<b>` **64** 对（**全部成对**） |
| `<description>` 含 `<` | **0** | ⇒ §2.8 的 TMP 注入风险**未爆**（脆弱规则，不是正在发生的错误） |
| NPC `eventHandler/button` | **766**，其中 `openDialog` **329**（`param[0]`=`default` **264**） | ⇒ 对话的**主入口**：点 NPC ⇒ 开 `default` |

### 2.2 `DialogInfo`（`DialogInfo.cs:9-42`）【源码】

| 成员 | XML | 行 | 实测（655 个 branch） |
|---|---|---|---|
| `id: string` | `@id` | :11 | **必填**（选择键，§2.5）；`default` 占 39% |
| `iconId: string` → `icon: Sprite` | `@icon` + 派生 getter | :12-13 | **655/655 有属性**；`GetIcon` **委托 `NpcInfo.GetIcon`**（:40-42）⇒ 与 NPC 头像同一套资源解析（**M1**） |
| `iconSize` → `size: Vector2` | `@size` | :15-16 | **655/655** |
| `iconPos` → `pos: Vector2` | `@pos` | :17-18 | **655/655** |
| `iconColor` → `color: Color` | `@color`（默认 `"255,255,255,255"`） | :19-20 | ⚠️ **0/655 命中** ⇒ 那条默认值是**唯一实际值** |
| `name: string` | `@name` | :23 | **655/655**（说话人名 ⇒ **中文** ⇒ MP4 归 DOM） |
| **`storySpeakerSide` / `storyFlipIcon` / `storyUseIconCrop` / `storyIconCrop` / `storyExpression` / `storyTextStyle`** | **无 XML 映射**（只有 `gif`/`content`/两个 handler 有 `XmlElement`/`XmlArray`） | :24-29 | ⚠️★**这 6 个字段根本不由 `<dialog>` 填**——它们由**剧情侧代码**（`StoryPanel`）赋值 ⇒ **地图 XML 里 0 命中**（实测一致） |
| `gifInfo: AnimInfo` | `<gif>` | :30 | **3** 处；`AnimInfo` 声明在 **`MapMusic.cs:21-35`**（不在 Dialog 目录），`AnimSpeed` 走 `Identifier.GetNumIdentifier(speed)` ⇒ **速度也可以是表达式** |
| `rawContent` → `content` | `<content>`（CDATA） | :31-32 | **650/655**；派生 getter = `{expr:}` 求值（§2.9） |
| `functionHandler: List<NpcButtonHandler>` | `<functionHandler><func>` | :34-35 | **471** 项 |
| `replyHandler: List<NpcButtonHandler>` | `<replyHandler><reply>` | :37-38 | **1,071** 项 |

⚠️ **形状支点**：两个 handler 的元素类型**就是 `NpcButtonHandler`**（与 `<button>` 同一个类）⇒ **M2 的基石对象在这里第二次复用**，
本份**不再抄它的 7 个成员**；本份只管"**这个容器里 `type` 意味着什么**"（§2.3/§2.8）与"**content 怎么变成文本**"（§2.9）。

### 2.3 ★`branch` 的三重身份（本份第一号修正）

| 出现形式 | 实际类型 | 实测 | 归谁 |
|---|---|---|---|
| `<dialog><branch id name icon size pos>` | **`DialogInfo`**（`NpcInfo.cs:46-47` 的 `XmlArrayItem`） | **655** | **本份** |
| `<battle><branch id …>` | **`BattleBranch`**（战斗分支表，含 `winHandler`/`loseHandler`） | **680** | **M6** |
| `<reply type="branch">` / `<func type="branch">` | **`NpcButtonHandler` 的一个 `typeId` 取值**（附挂语义） | **237 + 83 = 320** | **本份 §2.8** |

⇒ **三个 `branch` 互不相干**，且第二个和第三个**在同一张图里同时存在**（`10017.xml` 就有 `dialog/branch` 与 `battle/branch`）。
⚠️ 落地纪律：**解析器按"父元素"分派，绝不按标签名**（**DLI3**）；`type="branch"` 走的是 **`typeId` 原串**（M2 已定"`typeId` 才是真值"）。

**同一条修正的另一半**：`type` 属性在**第三个容器**里语义又降一级——
`eventHandler`（M2：5 种取值）/ `callbackHandler`（M2：10 种标签）/ **对话容器：只有 `branch` 有意义**（其余一律按可见项渲染，`DialogView` **不查事件名表**）。
⇒ 实测那 **4 条无 `type` 的 `<func>`** 在对话里**无害**（照常渲染、照常点击）；同一个缺失值在 `eventHandler` 里则是 `None` ⇒ 挂不上事件（M2/MNC）。**⇒ 本条已并入父文档 MC2 的回执（§9）。**

### 2.4 `<dialog>` 的两套血统（MQ1/MQ2 的对话切片）【样本】

| | **AS3**（`swf/map/config/*.xml`，259 张，**4 张解析失败**） | **Unity**（`Resources/Data/Maps/*.xml`，272 张） |
|---|---|---|
| 容器 | `<dialog npcId transport npcName>`（`npcId` **132**、`transport` **118**、`npcName` **12**） | `<dialog>`（**无属性**） |
| 分支 | `<branch id>`：`default` **124** / `next0` **2** / `next1` **2** | `<branch id name icon size pos>`（name/icon/size/pos **100%**） |
| 正文 | `<node emotion="0">` **128** 条（`emotion` 取值 **0:99 1:13 2:5 3:5 4:6**） | `<content><![CDATA[…]]>` **650** 条（无 `emotion`，表情在 `icon`/`storyExpression`） |
| 选项 | `<reply action="close\|goToBranch\|(空)">` **135** 条：`close` **124** / 空 **7** / `goToBranch` **4**（另 `@params` **11**）；★**选项文案就是元素文本** | `<reply type="click><description>…<action>…<param>…` **1,071** 条（13 种动作，§2.1） |
| 条件 | **0**（AS3 血统整体没有 `<condition>`，父文档 §2.1） | **155 + 139** |
| 空壳 | ⚠️ **8** 个 `<dialog>` **一个 branch 都没有**；**7** 条 reply 的 `action` 为空 | 5 个 branch 无 content |
| 每容器 branch 数 | `0:8 1:122 3:2` | 见 §2.1（最长 **22**） |

⇒ **结论**（= MQ1 在本份的落法）：**写侧 = Unity 一套解析器**；AS3 的 `<node emotion>` / `<reply action>` **不映射成 `NpcButtonHandler`**，
若要消费 AS3 对话，另立一个**只读适配器**（`emotion → 表情键`、`goToBranch → branch id`、`close → closeDialog`），**不进内核**（它没有条件、没有动作表）。
⇒ 本份后续章节**全部只讲 Unity 血统**。

### 2.5 入口：`openDialog` 的 `param` 合同（`NpcActionHandler.cs:163-186`）【源码】

```
param 空或 null        → return                                    (:165-166)   实测 2 项命中 ⇒ 点了没反应
param[0] == "null"     → DialogManager.CloseDialog(); return      (:168-172)   ★哨兵，实测 533 条
dialogInfo = npcInfo.dialogHandler.Find(id == param[0])            (:173)       ★作用域 = 当前 NPC
SetCurrentNpc(npcInfo)                                            (:174)       ⚠️ 在 null 检查**之前**
content 以 "story=" 开头 → rawContent = rawContent.Substring(6);   (:176-180)   ★破坏性改写，见 DLC1
                             OpenStoryDialog(dialogInfo)
                         否则                    OpenDialog(dialogInfo) (:181-184)
```

- **入口来源分布**：NPC 的 `<button>` **329** 条（`default` **264**）· 对话内 `<reply>` **709** 条（翻页）· `<func>` **56** 条。
- ⚠️ **`Find` 找不到 ⇒ 传 `null` ⇒ `OpenDialog(null)` 内部第一步就是 `CloseDialog()`**（`DialogManager.cs:86-89`）
  ⇒ **"引用了不存在的分支"表现为"对话被关掉"**，没有任何日志（实测 **2** 条悬空）。⇒ **DLC3**。
- ⚠️ **`SetCurrentNpc` 先执行** ⇒ 即使随后放弃打开，`Player.instance.currentNpcId` 已被写成这个 NPC（`DialogManager.cs:78-79`）。

### 2.6 两层互斥与跨层副作用（`DialogManager.cs:58-117` `288-299`）【源码】

| 事实 | 行 | 后果 |
|---|---|---|
| **两个层**：`dialogLayer`（普通）与 `dialogStoryLayer`（剧情）互斥；打开一个会先关另一个 | :91-96 / :108-113 | 同一时刻只有一个对话层可见；**没有"多层对话栈"** |
| `OpenDialog` 第一步 `Player.instance.isShootMode = false` | :83 | ★**开对话会退出射击模式** ⇒ 与 M2/MC3 的门相互作用，且**推论明确**：对话期间 `isShootMode` 恒 `false` ⇒ **对话里所有选项的射击门恒走"非射击"侧、恒通过**（实测 `type="shoot"` 的 25 条 `<button>` 全在 `eventHandler`，**没有一条进过对话容器**）⇒ 本份的求值语义**不必**考虑射击门。**目标口径**：不靠"开对话顺手清模式"来达成这件事（**DLI8**），而是**对话选项一律不查射击门**（上游 `DialogView` 本来也只走 `GetNpcEntity`，是**数据**从没把 `shoot` 写进对话容器 ⇒ 两种做法对发行数据等价，目标选**后者**，因为它不引入跨层副作用） |
| `SetDialogLayerActive` 里 `UILayer.SetActive(!active)` | :58-66 | ★**整个 HUD 层被对话隐藏**（不是盖住，是 `SetActive(false)`）⇒ 属于跨层副作用，**不归本线决定**（**DLQ3**） |
| 开启动画：`0.18s` / 上浮 `12px` / `EaseInOut` | :17-20 `:301-347` | 纯表现 ⇒ **A3** |
| `CloseDialog` 清 4 个钩子 + 选项 + 背景 + 两层关闭 + `currentNpcId = 0` | :288-299 | ⚠️ **不清 `currentNpc`** ⇒ 残留引用（**DLC10**） |
| `SetCurrentNpc` 的 `mapNpcList` 取自 `Player.GetSceneData`（会话键袋） | :78 | 与 M2/M2 的键袋同源；**键袋为 null ⇒ `currentNpc` 静默 null** ⇒ 后续动作拿到 `npcInfo = null`（M2/MNC 已登记同一个洞） |

### 2.7 ★出口：地图对话的"关闭"是**数据驱动的 7 条件门**（`DialogController.cs:42-69`）【源码】

`OnBackgroundClick`（**在 `Scenes/Map.unity` 里绑定到背景点击**，代码内无调用点）逐条：

1. `dialogView.CompleteStoryTextReveal()` 返回 true ⇒ 先"补完打字机"，**不关**（剧情侧）；
2. `backgroundClickHandler != null` ⇒ 调它，**不关**（实测：**地图流程永不设** ⇒ 唯一写入方是 `StoryPanel`，`:1147/1159/1179`）；
3. `info?.replyHandler == null` ⇒ **不关**；
4. `replyHandler.Count != 1` ⇒ **不关**（⚠️ 数的是**列表长度**，含 `type="branch"` 的附挂项）；
5. `replyHandler[0].action != OpenDialog` ⇒ **不关**；
6. `param == null || param.Count != 1` ⇒ **不关**；
7. `param[0] != "null"` ⇒ **不关**；全过 ⇒ `CloseDialog()`。

【样本】实测后果（可核对）：单 reply 的 branch **426** 个 ⇒ 全过门（点背景可关）**309** 个、**不过门 117** 个；
多 reply 的 branch（**224** 个）**一律点背景不关**。⇒ **"这局对话关不掉"是发行数据里的常态**，不是偶发 bug。
⚠️ 这就是 §3.4 要把"关闭"升格成**独立意图**的直接理由（**DLQ4**）。

### 2.8 ★`type="branch"`：不渲染的"附挂动作"（`DialogView.cs:847-952`）【源码】

`SetFunction`（:847-894）与 `SetReply`（:896-952）是**两套几乎逐字重复**的实现（**DLC6**），共同规则：

- **可见项**（`type != "branch"`）→ `Instantiate` 一个文本、挂 `enter/exit` 变色、挂 `click`；
- **附挂项**（`type == "branch"`）→ **不实例化任何东西**，只做
  `lastText?.onPointerClickEvent.AddListener(...)`（:865 / :916）⇒ **把动作追加到"最近一个可见项"的点击事件上**；
- `lastText` **只在可见项分支更新**（:892 / :950）⇒
  - **连续多个 `branch` 全挂在同一个可见项上**，点击时**按注册顺序逐个求值并全部执行满足者**（⚠️ **不是"第一个满足即停"**）；
  - ⚠️ **`branch` 出现在 index 0 ⇒ `lastText == null` ⇒ `?.` 短路 ⇒ 该动作被静默丢弃**（**DLC5**；实测 **0 命中** ⇒ 脆弱规则未爆）。
- **附挂量实测**：每个可见项附 `1:72 2:30 3:28 4:18 5:4 6:2` 组；有附挂的组数 **func 53 / reply 101**；
  "可见项自带条件 ∧ 附挂项自带条件"**177** 次 ⇒ **数据作者的意图 = 一个按钮、两条互斥出路**（例：`10017.xml` 扭蛋：`item>0` ⇒ 抽，附挂 `item=0` ⇒ 提示"道具不足"）。
- ★**附挂项绕过 `replyClickHandler`**：`reply` 的可见项点击先查钩子（:934-938），`branch` 分支在查钩子**之前** `continue`（:914-922）
  ⇒ 剧情侧的 reply 钩子对附挂项失效。⚠️ 且实测**地图流程根本不设这个钩子**（唯一写入方 = `SetStoryDialogReplyClickHandler`，只挂在**剧情控制器**上）
  ⇒ **`:934-938` 在地图对话里是死支**（**DLC6** 的第二半）。
- `func` 侧**从不查钩子** ⇒ 两个容器的可点项最终都走 `NpcHandler.GetNpcEntity(npc, handler, npcList)`（:869/:885/:920/:942）
  ⇒ **对话选项 = NPC 按钮**（射击门 + 条件 + 动作全套复用，M2 §2.4）——这就是父文档说的"一个对象走遍全图"的**对话切片**。
- **版式事实（归 A3，本份只登记"数据能读出的最小合同"）**：
  func 行 Y = `Mathf.Min(-55, contentRect.y - content.size.y - 5)`（:851，贴在正文下方）；func **自左向右**排（`handlerX +=` :891），
  reply **自右向左**排（`handlerX -=` :949，anchor 在右）；reply 等分宽 = `replyRect.width / 非branch 数`（:904-908）；
  默认色 `252,237,105` / hover `119,226,12`（`DialogView.cs:14-15`）；
  ★**func 的文案被硬编码拼上齿轮**：`"<sprite name=\"settings\"> <u>" + description`（:878）⇒ 每个功能项前面都是同一个图标（**DLC7**）。

### 2.9 `{expr:}` 插值（MQ8 的落点；`DialogInfo.cs:44-68`）【源码】

```
startIndex = result.IndexOf("{expr:");  没有 → 原样返回                     (:47-49)
endIndex   = result.IndexOf("}", startIndex)                               (:51)
循环：expr  = result[(startIndex+6) … (endIndex-startIndex-6)]
       eval = Identifier.GetIdentifier(expr).ToString()                     (:55-56)  ★无上下文版
       result = 前段 + eval + 后段；然后**从头**再找下一个 "{expr:"          (:58-64)
```

- **实测定量**：整个 Unity 语料只有 **1 条 `<content>` 用到**（`10693.xml` 的 `feather`），**4 个表达式**，全部 `item[40001{7,8,9,20}].num`
  ⇒ **MQ8 的机制要留、优先级排最低**（§3.6 的 **MDB4-e**）。
- ⚠️ **走的是"无上下文"版 `Identifier.GetIdentifier`**（`Identifier.cs:35-188`），**不是** M3 的 `NpcConditionHandler`。
  同一个前缀（`item`/`petBag`/`activity`/`data.`/`player.`/`battle.`）在**三处**各有一份文法：条件臂（M3 §2.4）、战斗/技能臂（M3 §2.5）、**内容插值（本份）**。
  ⇒ 本份的目标 = **三处共用一张表**（把 `IdentifierHost` 与 `MapEnv` 并成一个装配面，**DLI7**），**不写第四份**。
- ⚠️ **`{expr:}` 求值带副作用**：`GetIdentifier` 的兜底 `GetNumIdentifier`（`Identifier.cs:10-33`）里
  `random` 裸写 ⇒ **现场摇**、`random[new]` ⇒ **写回会话 random**。而 `content` 是**派生 getter**（`DialogInfo.cs:32`），
  **每次读取都重跑整个替换循环** ⇒ **"同一条对白，两次打开文本可能不同"**。实测 **0 命中**（无人这么写），⇒ **DLI6 明令禁止**（内容插值一律禁副作用臂）。
- ⚠️ **未闭合的行为**：`endIndex == -1` ⇒ `while` 条件 `(endIndex > startIndex)` 不成立 ⇒ **原样输出**（不抛、不吞）——这条**照录**（V2 口径：数据错字不是 bug）。
- ⚠️ **展开结果会被重新扫描**（:60 从头 `IndexOf`）⇒ 若求值结果本身含 `{expr:` 会**二次求值**（无深度上限）；与 M2 的 `callback` 无上限递归同族（**DLC8**）。
- ⚠️ **失败 ⇒ 打进对白的是 `0`**：`GetNumIdentifier` 的兜底是"`float.TryParse` 失败返回 `0`"（同族 **M3/CSC6**）⇒ 未知键会在玩家眼前显示成 `0`。目标口径见 **§3.5**。

### 2.10 `story=` 前缀：对话侧唯一一条通向剧情层的缝（§2.5 的 :176-180）【样本】

- **两个互不相干的开关**（★本份第二号发现）：
  ① **选层** = `dialogInfo.content.StartsWith("story=")`（`NpcActionHandler.cs:176`）→ `OpenStoryDialog`；
  ② **选版式** = `info?.id == "story"`（`DialogView.cs:87`）→ `ApplyStoryLayout`。
  【样本】实测：① 命中 **59 条 content / 5 张图**（`50024` 20、`50016` 20、`50019` 7、`540` 6、`50023` 6）；② **0 命中**（**没有任何 branch 的 `id` 是 `"story"`**）。
  ⇒ **数据里的"剧情对话"进了 story 层但不套 story 版式**（**DLC2**）；而 `DialogManager.cs` 那 **~500 行剧情基础设施**（`storyActorLayer` / `storyChoiceRoot` / `ShowStoryChoices` / `SetStoryDialogBackground` / `CreateStoryChoiceButton`）的**真实消费者是 `StoryPanel`**（`:1108-1249`），不是地图对话。
- ★**这批图全在第一批之外**：5 张图（`540/50016/50019/50023/50024`）**均无本地 `.swf`、且不在 AS3 语料里**（unity-only）
  ⇒ 按 **MQ2**（先做 AS3∩Unity 且有素材的 **134** 张），**剧情半边出局不挡第一批任何一张图**（**DLQ1** 的依据）。
- ⚠️ 另有 **1 条 `story=` 出现在 `<condition>` 里**（`10083.xml`：`activity[new_pony].done]story=[bool]false[default]`）
  ⇒ 那是 **M3 的活动值文法畸形**（CSC 族），与本份无关，**别把它数进 59**。

### 2.11 对话与会话态（消费点清单）【源码】

| 写点 / 读点 | 位置 | 说明 |
|---|---|---|
| `currentNpc`（`DialogManager` 的属性） | :22 `:77-80` | 由 `mapNpcList` 键袋反查；**关对话不清**（DLC10） |
| `Player.instance.currentNpcId` | :79 `:298` | 对话开 = 写 NPC id；关 = **归零**（哨兵 `0`） |
| **战斗后再入**：`MapSceneView.cs:490-531` | :493 `:499` `:508/:521` `:529` | ★`winHandler`/`loseHandler` 里若有 `openDialog` ⇒ **战斗结束直接再开一屏对话**；:493 的特例 `currentNpcId.IsInRange(50000,50100) && currentMapId != 500` ⇒ **这条链在 500 系（任务图）被人为放行/拦截**（M6 的真值，本份只登记接缝） |
| `Player.cs:39 isShootMode` | :39 | 开对话会写 `false`（§2.6） |
| 其它 `dialogHandler` 消费者 | `YiTeRogueChoice.cs:213` · `YiTeRogueEvent.cs:223` · `WorkshopStoryNodeEditorPanel.cs:853` | ⚠️ **肉鸽 / 工坊 = A 组出局**（`docs/architecture.md §1.1`）⇒ **本线不消费它们**；地图流程的唯一消费者就是 `NpcActionHandler.OpenDialog` |

---

## 3. 目标结构与契约

### 3.1 落点

```
core/map/dialog.ts            ← 本份目标（纯函数、零上层 import，MP3）
  ├─ parseDialogBranches(xml)   → DialogBranch[]        // 解析期就判悬空 / 重复 id / idx0 附挂（§2.5 / DLC3 / DLC5）
  ├─ resolveBranch(branches, param0) → DialogBranch | 'close' | 'missing'
  ├─ choicesOf(branch)          → Choice[]              // 物化"可见项 + resolutions[]"（§3.3）
  ├─ renderContent(raw, env)    → string                // {expr:} 插值（§3.5）
  └─ 富文本白名单（color / b，实测两种）               // 不做通用解析
logic/map/dialog-host.js      ← L1：把 DialogEnv/MapEnv 接到真状态（道具 / 会话键袋 / 日志）
app/scenes/…  + A3            ← 渲染（`openDialog(info, {onReply})` 已在 `docs/view/mech/view-overlays.md §117` 预约）
```

### 3.2 `DialogBranch` / `Choice` 的形状（决议式，不含 UI）

```ts
export interface DialogBranch {
  id: string                          // 选择键（§2.5）；'default' 占 39%
  speakerName: string                 // 中文 ⇒ DOM 真值（MP4）
  icon?: { resId: string; size: Vec2; pos: Vec2; tint?: string }   // tint: 实测 0 命中 ⇒ 缺省即白
  content: string                     // raw（未插值）
  presentation: 'plain' | 'story'     // ★由 'story=' 前缀**物化**，且**就地剥掉**在解析期做一次（DLC1 修）
  gif?: { resId: string; speed?: string }                            // 实测 3 条；形状留位，实现排最后
  choices: Choice[]                   // §3.3
}
export interface Choice {
  description: string                 // 可见文案
  resolutions: Resolution[]           // ★有序：[自身, ...附挂]（§2.8 的物化）
}
export interface Resolution { condition: ConditionExpr; intent: ActionIntent }  // M3 / M2 的类型，本份不重定义
```

- ⚠️ `ActionIntent` / `ConditionExpr` **一律指回 M2 §3 / M3 §3**，本份**不另立第二套**（父文档"基石对象走遍全图"的落地形状到此为止）。

### 3.3 ★求值语义（`Choice` = 一个按钮、多条出路）

| 阶段 | 目标 | 与上游的差别 |
|---|---|---|
| **解析期** | 把 `<func>/<reply>` 序列**物化**成 `Choice[]`：`type == 'branch'` 项并入**前一个可见项**的 `resolutions`；**index 0 的附挂 ⇒ 登记 `orphan-branch`**（不丢进黑洞） | 上游靠"注册监听器的顺序"隐式实现（DLC5 的静默丢弃由此消失） |
| **打开期（可见性）** | `visible = OR(resolutions[].condition) ≠ false` ⇒ **全部不可能 ⇒ 这一项不渲染**；任一 `'unknown'` ⇒ **渲染 + 记日志**（M3 §3.3 同口径） | ⚠️**这是行为改动**：上游**永远渲染**，不满足的点击没反应 ⇒ 玩家看到"死按钮"。实测带条件的选项 = func **33%** / reply **13%** ⇒ 改进面明确，**列进 §7.3 人手测** |
| **点击期** | 按 `resolutions` **注册顺序全部求值**，**每一个满足的都执行**（★照录上游，不改成"第一个即停"） | 与上游一致；数据作者的互斥约定（177 次）是**建立在"全跑"上的**——改成短路会让"两个都满足"时的出路减半，属于**未声明的行为改动**，故**不改**（**DLI5**） |

### 3.4 入口 / 翻页 / 关闭 = **三个不同意图**

```
{ action: 'openDialog'; branch: string }     // 翻页：branch id 作用域 = 当前 NPC 的 DialogBranch[]（DLI2）
{ action: 'closeDialog' }                    // ★独立意图：M1 桥把 param[0]=="null" 的 533 条**归一化**成它
{ action: 'missingBranch'; wanted: string }  // 找不到 ⇒ 决议里带原因；执行侧**保持当前对话不动 + 记日志**（DLC3 修）
```

- **对话状态机 = 无栈**（**DLI1**）：唯一状态是 `(npcId, branchId)`；翻页换 `branchId`，关闭归零。**回退/历史不属本线**。
- **点背景能不能关**：由 View 侧规则决定 = "**当且仅当前分支的 `resolutions` 里存在 `closeDialog`**"（**DLQ4**）⇒
  上游的 7 条件门不复现，但 309/426 那批"能关"的对话行为不变；**117 条"关不掉"的单选项对话**在目标里同样关不掉（数据如此，V2 口径**照搬**），除非人类愿意补数据。

### 3.5 `renderContent` 的目标（MQ8 + 三处一张表）

- 单次线性扫描（不按"替换后重扫"实现），**展开结果不再参与扫描**（DLC8 的二次求值洞关掉）。
- 求值面 = **`MapEnv`（M3 §3.4）与既有 `IdentifierHost`（`game/core/parser/identifier.ts`）并成一个装配面**（**DLI7**）；
  `L1` 出一个适配器，`core` 侧只有这一个入口。
- **禁副作用臂**：`random`（含 `[new]`）在内容插值里一律 ⇒ **原样保留 `{expr:…}` + 日志**（**DLI6**）。
- **求值失败 / 未知键** ⇒ **原样保留 `{expr:…}` + `env.log.unknown()`**，⚠️**不照搬上游的"打进对白一个 `0`"**（与 **M3/CSC6** 同一条改判）。
- 富文本 = **白名单两种**（`<color=…>`、`<b>`，实测成对）；**不解析任意 TMP 标签**（上游把数据直接拼进 TMP，`description` 里一旦出现 `<` 就是标签——实测 0 命中 ⇒ 保持"脆弱规则不爆"的状态，靠白名单而不是靠正则清洗）。

### 3.6 施工批草案（**MDB4-a…e**，等 impl）

| 号 | 内容 | 依赖 |
|---|---|---|
| **MDB4-a** | `parseDialogBranches`（Unity 血统）+ **解析期畸形登记**（悬空 / 重复 id / idx0 附挂 / 无 `<param>` 的 `openDialog`） | **M1 桥**（★今天 `maps.json` 连 `npcs[]` 都没有，§6） |
| **MDB4-b** | `Choice` 物化（附挂并入）+ **可见性求值**（接 M3 三值） | M3 |
| **MDB4-c** | `openDialog` / `closeDialog` 两个意图 + 无栈状态机（`(npcId, branchId)`） | M2 动作决议表 |
| **MDB4-d** | A3 接缝：把 `DialogBranch`/`Choice[]` 交出去（`openDialog(info, {onReply})`） | A3 |
| **MDB4-e** | `renderContent`（4 条表达式即可验，实测面最小）+ `presentation` 剥前缀（**不实现 story 层**） | `Identifier`/`MapEnv` 合并（DLI7） |

---

## 4. 数据流（一张图）

```
Unity <dialog> ──解析(M1 桥)──► DialogBranch[]  (presentation 已剥、悬空已登记)
                                        │
                         resolveBranch(param0)   ← 'null' ⇒ 归一化为 closeDialog
                                        ▼
      NPC 的 <button> / <func> / <reply>（同一个 NpcButtonHandler）
                                        │  choicesOf() 物化附挂
                                        ▼
        Choice[] = 可见项 + resolutions[(cond, ActionIntent)]
             │  打开期：OR(cond) ⇒ 渲染 / 不渲染（unknown ⇒ 渲染 + 日志）
             ▼
        点击 ⇒ 按序求值，满足者**全部**出 ActionIntent（不执行，MQ4）
             │            └─ openDialog(下一个 branchId)  ⇒ 回到 resolveBranch（无栈）
             │            └─ battle / teleport / openHintbox / setItem … ⇒ M2/M5/M6/A3
             ▼
        renderContent(raw, env)  ← {expr:} 走 M3∪Identifier 的**同一张**前缀表（禁副作用臂）
```

⚠️ **上图里 `teleport` 那一支的实测（M5 §9 已并入，2026-10-17）**：对话宿主上的 `teleport` 动作 = **30 条**
（`replyHandler>reply` **25** + `functionHandler>func` **5**；全图 **106** 条里其余在 `eventHandler` 65 / `callbackHandler` 11），
**106 条全部只有 1 个 `param`** ⇒ 对话里的传送**同样不带落点**。
⇒ **本族的接缝约束**：编排层执行 `teleport` 决议前**必须先清 `session.overlay`**（对话是盖层，**OR8**）——
否则切图后盖层仍挂在旧场景上。上游靠的是"直接 `ChangeScene` 把整层冲掉"，我们**不照搬**（M5 §3.5）。

---

## 5. 不变量（**DLI1–DLI8**）

| # | 不变量 |
|---|---|
| **DLI1** | 对话 = **无栈状态机**，唯一状态 `(npcId, branchId)`；翻页是**换状态**不是压栈；**回退 / 历史 / 多层叠加不属本线**。 |
| **DLI2** | `branch id` 的**作用域 = 单个 NPC**（`NpcInfo.dialogHandler`）⇒ 悬空引用**在解析期可判定**，不等点击。 |
| **DLI3** | 解析器**按父元素分派，绝不按标签名**（`branch` 有三重身份，§2.3）；`type="branch"` 用 **`typeId` 原串**判定（M2 口径）。 |
| **DLI4** | 关闭 = **独立意图 `closeDialog`**，不是 `openDialog` 的哨兵参数；`param[0]=="null"` 的归一化发生在**桥**，不在内核。 |
| **DLI5** | 一个 `Choice` 的 `resolutions` **按注册顺序求值、满足者全部执行**（照录上游，**不许**改成短路）；数据作者的互斥约定建立在"全跑"上。 |
| **DLI6** | `content` 求值**只在渲染期、不改数据、不许有副作用**：`rawContent` 一旦写入不再变异（DLC1 的反面），插值遇副作用臂 ⇒ 原样 + 日志。 |
| **DLI7** | 前缀求值表**全仓只有一张**：条件臂（M3）/ 战斗臂（M3 §2.5）/ 内容插值（本份）**共用同一个装配面**（`MapEnv` ∪ `IdentifierHost`），**不写第四份**。 |
| **DLI8** | 内核只出决议（**MQ4** / 决议 ③）：**不写盘、不弹窗、不换场景、不碰 `isShootMode` / `UILayer`**（那两个跨层副作用归编排层裁决，**DLQ3** ⇒ 已被接住：`docs/orchestration/orchestration-design.md` §2.9 **ORC4** / §4.3 / **OR8**）。 |

---

## 6. 现状与缺口

| 面 | 今天 | 缺口 |
|---|---|---|
| `game/core/**` 对话 | **0 行**（全仓 `game/` 搜 `dialog` **0 命中**） | 本份 §3 全部 |
| 数据桥 | `tools/build-map-index.mjs` 的 `DIR = 'swf/map/config'` ⇒ **259 张 = AS3 血统**；产物字段只有 `id/name/swf/init/entities(只是一个计数!)/teleports/weather` | ⚠️ **★最大的前置缺口**：今天的桥**读的是 MQ1 判给"写侧"的另一套血统**，且**没有 `npcs[]` / 没有 `dialogs[]`**（`entities` 只是 `<entities>` 出现次数）。M4 依赖 **M1 把 Unity XML 的 `npcs[].dialog[]` 落进桥**（`docs/map/map-data.md §3`） |
| 条件求值 | `game/core/parser/{operator,parser,identifier,rng}.ts` 有 **101/155/78/49 行** | `MapEnv` 未建（M3 §3.4）⇒ 对话可见性求值等 M3 的 **MDB3-a/b** |
| View 接缝 | A3 已预约 `openDialog(info, {onReply})`（`docs/view/mech/view-overlays.md §117`），**实现 0 行**（§91 表 "Dialog / Npc ❌ 缺"） | 等 **MDB4-d** |
| 战斗后再入 | 无（M6 未落） | §2.11 的那条链 = **M6 ↔ M4 的接缝**，两边都要在 impl 里对齐 |

---

## 7. 怪癖登记 · 待拍板 · 等人手测

### 7.1 上游代码 bug / 危险设计（**DLC1–DLC12** · 按 `AGENTS.md §2`：**声明 + 不照搬**）

| # | 登记（`路径:行` + 症状 + 发行数据里的可观察后果） | 目标 |
|---|---|---|
| **DLC1** | **`story=` 前缀是一次性消费的破坏性改写**（`NpcActionHandler.cs:178`：`dialogInfo.rawContent = rawContent.Substring(6)`）：对象**就地被改**⇒ 同一 branch **第二次打开不再走 story 层**（非幂等）。实测 **59 条** content 受影响 | `presentation` 在**解析期**物化，`content` 永不再变异（**DLI6**） |
| **DLC2** | **两个不一致的剧情开关**：选层用 `content.StartsWith("story=")`（:176），选版式用 `info?.id == "story"`（`DialogView.cs:87`）⇒ 后者**实测 0 命中**，剧情对话**进了 story 层却不套 story 版式** | 一个字段（`presentation`）说了算；本线**只实现 `plain`**（**DLQ1**） |
| **DLC3** | **找不到分支 ⇒ 静默关对话**：`Find` 返回 null 后照样往下调（:173→:183），`DialogManager.cs:86-89` 把 null 当"关闭"；且 `SetCurrentNpc`（:174）在放弃**之前**已写了 `currentNpcId`。实测 **2 条**悬空（`-404.xml`、`50019.xml`） | `'missingBranch'` 决议 + 日志；**会话状态不动** |
| **DLC4** | **"点背景关闭"= 7 条件门**（`DialogController.cs:42-69`，其中第 4 条数的是**含附挂项的列表长度**）⇒ 实测 **426** 个单选项分支里 **117 个**关不掉；**224 个**多选项分支**全部**关不掉。地图对话**没有关闭按钮** | `closeDialog` 成为独立意图，View 规则改为"有 `closeDialog` 出路才可点背景关"（**DLQ4**） |
| **DLC5** | **附挂项位于 index 0 ⇒ 静默丢弃**（`DialogView.cs:865` `:916` 的 `lastText?.` 短路；`lastText` 只在可见项分支更新 :892 `:950`）⇒ 没有描述文案、没有日志。实测 **0 命中**（脆弱规则未爆） | 解析期物化 + `orphan-branch` 登记 |
| **DLC6** | **两套逐字重复的渲染实现**（`SetFunction :847-894` / `SetReply :896-952`，差异只有齿轮前缀、排布方向、和钩子）；且**地图流程永不设 `replyClickHandler`**（唯一写入方 `DialogManager.cs:123-124` 只挂在剧情控制器）⇒ **`DialogView.cs:934-938` 是地图对话里的死支** | 一条 `choicesOf()`；View 侧一份渲染（A3） |
| **DLC7** | **func 文案硬编码拼 TMP 标签**（`DialogView.cs:878`：`"<sprite name=\"settings\"> <u>" + description`）⇒ 每个功能项前面都是同一个齿轮；且 `description` / `content` 一律**直接拼进富文本**，数据里出现 `<` 即当标签（实测 `description` 含 `<` **0** 条 ⇒ 未爆） | 白名单渲染（`color` / `b`），齿轮归 View 样式不是字符串拼接 |
| **DLC8** | **`{expr:}` 的"替换后从头重扫"**（`DialogInfo.cs:58-64`）⇒ 展开结果含 `{expr:` 会被**二次求值，无深度上限**；同族 = M2 的 `callback` 无上限递归 | 单次线性扫描；展开结果不参与扫描 |
| **DLC9** | **两个跨层副作用藏在"打开对话"里**：`isShootMode = false`（`DialogManager.cs:83`）+ `UILayer.SetActive(false)`（:58-66）⇒ 开对话会**退出射击模式并整层隐藏 HUD**，地图侧其余代码（M2 的射击门、M5 的传送）都被动受影响 | 内核只出 `DialogOpened` 事实；层切换/模式切换归编排层（**DLQ3**、**DLI8**） |
| **DLC10** | **`CloseDialog` 只清 `currentNpcId`，不清 `currentNpc`**（`DialogManager.cs:288-299`）⇒ 关闭后 `DialogManager.instance.currentNpc` 仍指旧 NPC；任何在关闭之后再跑的 `resolutions` 会拿到**上一个 NPC** 的 `NpcInfo` | 关闭即归零（**DLI1**） |
| **DLC11** | **同 NPC 内重复 branch id ⇒ 后一个永不可达**（`Find` 取首个，`NpcActionHandler.cs:173`）。实测 **1 例**（`-404.xml` / npc `-40401` 两个 `reward`） | 解析期登记 `duplicate-branch-id` |
| **DLC12** | **AS3 血统的存量不能当"可跑通"的证据**：**8** 个 `<dialog>` 容器**没有任何 `<branch>`**、**7** 条 `<reply>` 的 `action` 为空、**4** 张 AS3 图解析失败（`docs/map/map-data.md` 已记 4 张缺 swf） | 只作为**只读适配器**的输入（§2.4），**不进内核** |

### 7.2 待拍板（**DLQ1–DLQ5** · 本线局部编号 · 依人类常设指示「都按你的建议来吧」**已采纳建议并标 ✅**）

| # | 问题 | 决议（采纳建议） |
|---|---|---|
| **DLQ1** | **剧情演出半边做不做？**（`story=` 前缀 / `OpenStoryDialog` / `DialogManager.cs` 那 ~500 行 story 基础设施 / `DialogView` 的 story 版式） | ✅ **不做，只记账**。依据：① A 组出局（`docs/architecture.md §1.1`）；② **实测受影响的 5 张图全部 unity-only、无本地 swf ⇒ 不在 MQ2 的第一批 134 张里** ⇒ 零阻塞。落法 = `presentation: 'plain' \| 'story'` 字段**留位**、数据加载期把前缀**剥成字段值**（顺手修掉 **DLC1**），执行侧一律按 `plain`；**并在本文档留一条"等人类手测确认的项"**：若人测要进 `540.xml` 教学，则本条改为"实现 story 层最小切片" |
| **DLQ2** | **附挂（`type="branch"`）建模**：保留"上一条可见项"的隐式语义，还是数据里写显式目标？ | ✅ **保留上游语义但在解析期物化**成 `Choice.resolutions[]`（§3.3），畸形（idx0）登记不静默。⚠️ **不改发行数据**（V2 口径） |
| **DLQ3** | **`isShootMode = false` + `UILayer.SetActive(false)`** 这两个副作用归谁？ | ✅ **不归本线**（**DLI8**）：内核只产出"对话已打开"这一事实，**射击模式与 HUD 层的处置由编排线 + View 决定**（`docs/orchestration/orchestration-design.md`）。✅ **已交接并被接住**：编排线新增 §2.9 **ORC4** / §4.3 模态处置 / 不变量 **OR8** |
| **DLQ4** | **关闭语义**：复现 7 条件门？还是给一个真关闭按钮？ | ✅ **独立意图 `closeDialog`**（**DLI4**）+ View 规则"存在 `closeDialog` 出路 ⇒ 点背景可关"。**不复现 7 条件门**；同时**不补数据**，故 117 条单选项关不掉的对话在目标里同样关不掉（记进 §7.3 让人确认这是可玩的） |
| **DLQ5** | **选项可见性**：上游"永远渲染 + 点击时判条件"，目标"打开时求值、全不可能就不渲染"——**这是行为改动**，要不要？ | ✅ **要**（§3.3）。理由：带条件的选项占 func **33%** / reply **13%**，上游口径下不满足即"点了没反应"。⚠️ 与之同时明确：**点击期不改短路**（**DLI5**），可见性与执行是两件不同的事 |

⚠️ **本份不需要 R1/R2/R4 接缝**：内容插值的实测面是 `item[..].num`（道具）；`random` 类表达式一律禁（**DLI6**）⇒
**对话不消耗随机数、不写盘**（与 **M3/MC5** 的"条件随机数"区分开：那条走会话键袋，也不是 R4）。

### 7.3 等人手测确认的具体项（决议 ⑦：主验收 = 人类把游戏跑起来手测）

1. **进一张有 `<dialog>` 的图（建议 `10017.xml` 火山星深处）**：点 NPC ⇒ 开 `default` 分支；对白中文**不出方框 / 不缺字**（MP4）。
2. **翻页**：选"我带来了！"之类 ⇒ `openDialog` 换 branch，确认**无栈**（点背景不回到上一屏，因为 224 个多选项分支上游本来也回不去）。
3. **关不掉的对话**：找一条 §7.1/DLC4 里"117 条"中的单选项对话（例：唯一 reply 是 `openDialog mission_*`）⇒ 确认人测接受"只能顺着选项走"。
4. **附挂出路**：`10003.xml` 扭蛋那条（`item>0` 抽 / 附挂 `item=0` 提示）⇒ **一个按钮、两种出路**在目标实现里仍成立；同时验"道具数为 0 时按钮仍显示"（可见性 = OR ≠ false）。
5. **可见性改动**（**DLQ5** 唯一的行为改动面）：找一条**所有出路都不满足**的选项 ⇒ 期望**不出现**（上游会出现但点了没反应）——**这条最需要人眼确认**。
6. **`{expr:}`**：`10693.xml` 的 `feather` 一条 ⇒ 文本里 4 个数字与背包一致；背包变化后**重开对话**数字更新，但**同一次打开内不抖动**（**DLI6**）。
7. **悬空引用**（2 条）：`-404.xml` 的 `not_enough` 与 `50019.xml` 的 `mission_6_dream_11` ⇒ 期望**对话不关、日志出现 `missingBranch`**（上游是对话直接被关掉）。
8. **战斗后再入**（§2.11，依赖 M6）：打完 `10017.xml` 的 Boss ⇒ `default_lose` / `winHandler` 里的 `openDialog` 正常开屏。

---

## 8. 配对 `impl` / `code-map`

⚠️ **阶段一续**（所有 `design` 定稿后统一编，`AGENTS.md §1` 第 2 条）—— ✅ **已完成（2026-10-18）**（其 `MIP1–MIP4` 四条已由人类 2026-10-18 结账）：
`docs/map/map-impl.md` 吸收 **MDB4-a…e**（= 它 §2 的 **MB6**，**与 MB7 同批**），`docs/map/map-code-map.md` 侧的落点表把 §3.1 三行换成实际文件；
as-built 差异（尤其 **DLQ5** 的可见性与 §3.3 点击期是否被实现侧简化）**只写进 impl §7**，本份不动。

---

## 9. 本份对父文档 / 同线文档的回执

| 对象 | 本份要改的 | 状态 |
|---|---|---|
| 父文档 **§2.1 定量** | `<dialog>` **300 → 279**、`<branch>` **1,371 → 655（+680 属 `<battle>`）**、`<reply>` **1,098 → 1,071**、`<func>` **486 → 471**；**差额全部是 XML 注释**（逐条对上，见 §2.1 表） | ✅ **已合并**（父文档该行已改成"解析 / 含注释"口径，并加一条纪律：**新增统计一律先解析再计数**） |
| 父文档 **§2.1 无条件比例** | `<func>` 471 条中 **316（67%）无 `condition`**；新增 `<reply>` 1,071 条中 **932（87%）无** | ✅ **已合并** |
| 父文档 **§2.6**（M3 已改）/ **MC2** | `type` 属性现在有**第四个容器切片**：对话容器里**只有 `branch` 有意义**（其余不查事件名表），且实测 **4 条无 `type` 的 `<func>` 在对话里无害** | ✅ **已合并进 MC2**（未新开 MC 号） |
| 父文档 **MC3**（射击门） | 推论一条：开对话即 `isShootMode=false`（**DLC9**）⇒ 对话期该门恒走非射击侧；实测 `type="shoot"` **25 条全在 `eventHandler`、从未进对话容器** | ✅ **已合并** |
| 父文档 **§2.8** | ① `<branch>` 是 `DialogInfo`、与 `<battle><branch>` **同名不同物**（三重身份 655/320/680）；② 翻页靠 `openDialog` 的 `param[0]`，**不是** `<func type="branch">` 选分支（原文那条论断是错的，已删）；③ `story=` 实测 **59 条 / 5 张图**（原文写"6 个文件"数的是 grep，含 1 条落在 `<condition>` 里）；④ 那 5 张图**全在 MQ2 第一批之外** | ✅ **已合并**（§9.1 的 M4 行同时改 ✅） |
| 父文档 **§7 MQ8** | `{expr:}` 的真实分量 = **1 条 content / 4 个表达式** ⇒ 决议**不变**（本线做机制），但施工排最后（**MDB4-e**），且求值面并入 **DLI7** 的"一张表" | ✅ **已按决议落**（本份 §3.5） |
| 父文档 **§9.2 人手测** 第 4 条 | 本份 §7.3 把它细化成 **8 条**（含"关不掉的对话""可见性改动"两条最需要人眼的） | ✅ **本份已细化**（父文档保留一句指针即可） |
| **M2** `map-npc.md §2.6` 第 4 行 | 该行注"实测 **6 个文件**含 `story=`" ⇒ 精确化为 **5 张图 / 59 条 content**（第 6 个文件 `10083.xml` 的 `story=` 在 `<condition>` 里，归 M3）；同时补 `"null"` **533** 条、空 `param` **2** 条（点了没反应）、**DLC1 非幂等**标注、指针指到本份 §2.5 / **DLQ1** | ✅ **已合并**（M2 §0 第 3 条同轮加了"`type` 第三个切片"的指针） |
| **M3** `map-condition.md` | 本份的选项求值 = **完全复用** M3 的 `evalCondition` 与三值口径（§3.3）；**未新增臂** | ✅ 无改动 |
| **编排线** | **DLQ3** 那条待办已交接：编排线新增 **§2.9 怪癖 ORC4**（两个副作用的真值与行号，含"`:83` 在 `info==null` 分支**之前** ⇒ 连 null 关对话也会退出射击模式、且关闭不恢复"这条本份没细说的推论）+ **§4.3 模态处置** + **不变量 OR8**（盖层只有一个声明者）。本份的**目标口径**与之对齐：内核只出事实，**输入门保持原值**、HUD 由 `overlay` 推导 | ✅ **已交接并被接住**（`docs/orchestration/orchestration-design.md` §2.9/§4.3/OR8；⚠️ OR8 待人类评审） |
| **落点回执（MB6 · 2026-10-19）** | 本份 §3 的蓝图 ⇒ **实际落点**：`parseDialogBranches`/`resolveBranch`/`choicesOf`/`renderContent` = **`game/core/map/dialog.ts`**（L0 纯）；无栈状态机 `(npcId,branchId)` + `{expr:}`/`[expr]` 前缀表 = **`game/logic/map/dialog-host.js`**（`openDialog`/`choiceView`/`clickChoice`/`makeExprResolver`，L1）；XML `<branch>` 词法 = **`game/logic/map/entity.js:lexDialogBranch`**（解析边界上移到 L1，因 `dialog.ts` 零第三方依赖）；**渲染 = L4 `game/app/scenes/mapScene.js:renderDialogBox`/`closeDialogBox` 自绘最小对话浮层**（决策一 A，正式排版仍归 A3；触发 = `onNpcClick`）；选项出路经**同一台** `resolve→run`。⚠️ **偏差**：`{expr:}` 前缀表今天只接 `item`/`item_yite`/裸数（`pet.`/`activity.`/`battle.` 在对话插值未命中 ⇒ `null`，随消费线扩）；`story=` 半边不做（`DLQ1`）。as-built = `docs/map/map-impl.md §7.3.9`；语义未动（本份仍是真值） | ✅ **已落码（MB6）** |
