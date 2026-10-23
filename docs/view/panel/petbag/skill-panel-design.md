# View 子设计 · 精灵技能面板（更换技能）= `skill-panel-design.md`

> **归属**：C1 精灵面板族里**「调整技能」按钮的那块面板**（`docs/view/panel/view-panels-pet.md §4.1` 的「②·信息区·技能信息子面板」把两颗钮登记为**面板入口、目标面板另属**，本文件就是那个「另属」）。
> **父/ 邻**：`docs/view/panel/view-panels-pet.md`（C1 · 精灵面板族，背包/仓库深写）· `docs/view/panel/petbag-impl.md`（C1 配对 impl，本文配对 impl = **`skill-panel-impl.md`**）·
> 版面正本（人类实测）`docs/view/panel/petbag/petbag-panel-desc.md` · 证据底座**本文件 §2 内联**（上游那几件控制器/模型/视图都很短，直接引 `路径:行`）·
> 隐藏技能（秘技）学习 = **另一块面板**，见 `docs/view/panel/petbag/restart-secret-skill-learning.md`（**本份只做「已学技能之间换位」，不做「学新技能」**）。
> **配对 impl** = `docs/view/panel/petbag/skill-panel-impl.md`。
> **路径口径**：上游相对 `projects/Seer2-Restart-Lite-main/Assets/`；我们的相对仓库根。
> **证据标注**：【源码】= 上游 `.cs`（`路径:行`）·【样本】= prefab / 真档 XML ·【实测】= 可复算数字/可复跑命令 ·【推断】= 导出。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ **§2.2**。
> **验收口径**：**主 = 人类手动测试**（**决议 ⑦**，`AGENTS.md §1.1`）⇒ 请人测清单在 impl §8；**不写测试代码**。
> **⚠️ 编号纪律**：本份本地 = 不照搬 **SKB1–SKB5**（§2.2）· 本批默认 **SPQ1–SPQ6**（§10）· 施工批在 impl（**SK-a…**）。**不许**用 ①–⑨（`AGENTS.md §5` 的人类决议）、不许用裸 `A<n>`（那是分析报告 `restart-*.md` 的号）。

**表 0 · 父文档骨架 ↔ 本文件节号**

| 骨架 | ① 范围/边界 | ② 上游真值 | ③ DOM 与类名 | ④ 数据接线 | ⑤ 资产权威 | ⑥ 依赖方向 | ⑦ 交互/事件 | ⑧ 缺口/待核 | ⑨ 配对 impl |
|---|---|---|---|---|---|---|---|---|---|
| 本文件 | §1 | §2（+§2.2 不照搬） | §4 | §5 | §8 | §6 | §7 | §9 · §10 | §11 |

---

## 1. 范围与边界

### 1.1 一句话说清这是什么

> 玩家在**精灵背包面板 → 「技能」页签 → 点「调整技能」**之后，**背包面板之上会盖起来一块更大的技能调整面板**（原版那块盖板叫 `Pet Swap Skill`，820×270）：
> 上半 = 这只精灵**现在带着的 4 个普通技能 + 1 个必杀技**，下半 = **它已经学会、但没带上的技能**（可翻页）；
> **点上面一个 + 点下面一个就当场交换**（两个方向都行），换完**立刻存盘**；底部有原版那句提示语与「返回」按钮，返回 = 退回只读的技能页签。
>
> ⚠️ **形态是「盖板」，不是「页签内就地展开」**（2026-10-19 **人类实机观察 + prefab 证据**推翻本份首版的就地展开方案，见 §2.4）。

### 1.2 属本文 / 不属本文

| 属本文 | 不属本文 |
|---|---|
| **盖板形态**（`openPanel` 叠一层、盖住背包面板内容区、返回/✕ 的去路）+ 两块技能区的**版式、类名契约、选中/翻页交互** | **技能页签的只读展示**（也在本份里，但它只是入口页：当前技能 + 两颗钮，不可点格） |
| **换位规则**（谁能换、换完写哪三个字段、什么时候存盘） | **学习新技能**（隐藏技能/秘技）—— 判据要战斗结算（`restart-secret-skill-learning.md` 的 12 臂谓词），另属 |
| 技能卡的**信息字段**（名/属性/威力/命中/描述/学会等级） | 技能**效果结算**（战斗引擎 E6）· 技能表本体（L2 `game/data/unity/skills.json`） |
| 「已学技能」怎么算（档里没有就按等级现算） | 升级时自动学新技能（D5/D6 的 `CheckNewSkill` 接进会话，**本批不做** ⇒ §9） |
| 面板 ↔ 存档的**两条接缝**（读已装配的技能 / 写回 XML 三个字段） | 存档 **XML 的形状与编解码**（Save 线 `docs/save/save-xml-spec.md §2.7`）—— 本文只消费 |

### 1.3 面板宿主

入口 = 精灵背包面板（`openPanel('rb-petbag')`）的技能页签；盖板 = **第二层面板** `openPanel('rb-skillpanel')`，叠在背包面板之上（`host.js` 的面板栈，同名去重走 VP3）。与 C1 §1.2 的六个宿主（`normal/pvp/dictionary/yiterogue/door/story`）无关 ——
**换技能只在 `host === 'normal'` 可写**（沿用 C1「写盘只由会改数据的操作触发、`writeOf(src)` 单点决定」的口径；其余宿主本代不接）。

---

## 2. 上游真值

### 2.1 三件模型 + 一台交换机（逐条钉死）

上游这块是**四件**（不是一块面板），拼起来才是本文的功能：

| 件 | 路径 | 它管什么 |
|---|---|---|
| `PetCurrentSkillModel` | `Scripts/MVC/Model/Pet/Basic/PetCurrentSkillModel.cs:5-51` | 当前 4 常规 + 必杀；**单选游标**（`normalSkillCursor`）；`SwapPetNormalSkill` 把选中槽换成传进来的技能 |
| `PetBackupSkillModel` | `Scripts/MVC/Model/Pet/Basic/PetBackupSkillModel.cs:6-96` | 备用（已学未带）；`Filter` 把**秘技**与普通备用技能分成两台；翻页；`SwapPetNormalSkill` **写回存档** |
| `PetSwapSkillController` | `Scripts/MVC/Controller/Pet/Basic/PetSwapSkillController.cs:6-90` | **交换机**：把「点了当前技能」和「点了备用技能」两个事件接成一次对换（两个方向都支持） |
| `PetSkill`（数据） | `Scripts/MVC/Model/Basic/Pet/Components/PetSkill.cs:5-190` | 三个字段：`ownSkillId`（**已学**）/ `normalSkillId`（**带 4 个常规**）/ `superSkillId`（**带 1 个必杀**）+ 换位守卫 + `CheckNewSkill` |

**换位守卫（`PetSkill.cs:172-186`，逐条抄成我们的目标行为）**：

```csharp
public void SwapNormalSkill(Skill oldSkill, Skill newSkill) {
    if ((newSkill == null) || (ownSkillId == null)) return;
    if ((!normalSkillId.Contains(oldSkill.id)) || (!ownSkillId.Contains(newSkill.id))) return;   // (1) 旧的在带、新的学过
    if ((oldSkill.positionType == SkillType.必杀) || oldSkill.isAction
        || (newSkill.positionType == SkillType.必杀) || newSkill.isAction) return;               // (2) 两边都不能是必杀/行为技
    normalSkill = normalSkill.Update(oldSkill, newSkill).ToArray();
    SaveSystem.SaveData();                                                                     // (3) 当场存盘
}
```

- **`isAction` 是什么**【源码】`Scripts/MVC/Model/Basic/Pet/Skill.cs:460-465`：`type < SkillType.属性 && type != SkillType.被动`（道具/换场/逃跑这类行为技）。
  ⇒ **我们能自己算**：`SkillType` 已下沉到 `game/core/pet/skill.ts`（D5 B1 已落），常量：`属性=0 物理=1 特殊=2 连携=3 必杀=100`，负值 `-1 空过 / -2 道具 / -3 換场 / -4 逃跑 / -5 被动`。
- **必杀怎么换**【源码】`PetSkill.cs:156-170` `GetBackupSuperSkill`：**备用必杀 = 已学必杀里环上的下一个**（只有 1 个已学必杀 ⇒ 没有备选；≥2 ⇒ 取当前的后一个，末尾绕回头）。
  ⇒ 我们照搬这个**环形轮换**语义（备用区只有 1 个必杀格）。
- **当前技能怎么显示**【源码】`PetSkill.cs:139-146` `GetNormalSkill()`：`normalSkillId` 去重 → 取技能 → **滤掉必杀** → `Array.Resize(4)` 补空。
  ⇒ **我们写进档里的 `normalSkillId` 可能含必杀**（Save 线 `newgame.js:130-132` 自认未滤必杀），显示层**照上游滤掉**，不假装它是一个普通技能。
- **两个方向都支持**【源码】`PetSwapSkillController.cs:51-88`：`OnSelectCurrentNormalSkill`（先点当前 → 立刻把当前选中槽换成它选中的备用技）与 `OnSelectBackupNormalSkill`（先点备用 → 换掉当前选中槽）是一对**镜像**。

### 2.2 不照搬清单（决议 ②）

| 上游号 | 症状一句话 | 我们的目标行为 | 落在 |
|---|---|---|---|
| **SKB1** | 点备用必杀时**必须先点当前必杀格**，否则静默无反应（`PetSwapSkillController.cs:80-88` 的 `isSuperSkillChosen` 门） | 必杀只有 1 个槽 ⇒ **点备用必杀直接换**，不必先选中 | §7.2 |
| **SKB2** | 4 个常规槽全满时点一个备用技，没有任何提示；槽未满时又能塞进去 —— 两条路手感不统一 | **两条路统一成「换位」**：先点当前槽（或点备用技自动挑第一个空格），再点另一侧 | §7.2 |
| **SKB3** | `SetPet`/`Refresh` 会把**翻页游标、选中态**一起重置（`PetBackupSkillController.cs:28-38` 每次 `SetPet` 都 `Filter(...)` 重来） | 打开「调整技能」期间**翻页与选中态留在原地**；只换宠时才重置 | §7.3 |
| **SKB4** | `SwapSuperSkill` 只在 `backupSkill != null` 时写盘（`PetSkill.cs:188-192`）⇒ 选到空等于取消，但**没有取消路径** | 点当前必杀格再点它自己 = **取消选中**；换位永远立即存盘 | §7.2 |
| **SKB5** | 换位走 `SaveSystem.SaveData()` —— 内核里直连存档（违反我们的存档单一入口） | 动作**只返回 `write:'skill'` 信号**，由装配层落盘（与 C1 同口径，V-5） | §5.3 |

> ⚠️ 本表只收**代码逻辑层面**的怪癖。「分页 4 格 / 单选 / 悬停出说明」这类**机制**照搬（§4 写目标设计），不列缺陷。

### 2.3 上游的隐藏技能按钮（本份不做，只登记）

【源码】`PetCurrentSkillController.cs:30-47`：点「隐藏技能」先查**等级 ≥ 60**、再看 `skills.secretSkillInfo.Length > 0`，任一门不过就弹提示；过了才 `Panel.OpenPanel<SecretSkillPanel>()`。
⇒ **本批：点「隐藏技能」维持现状**（面板未建，`bag.secretSkillPending` 提示），**并把「必杀技也在当前技能区里换」做掉**（那不是隐藏技能，是 `normalSkillId`/`superSkillId` 的换位）。

### 2.4 盖板的**形态证据**（prefab + 人类实机 · 2026-10-19）

| 事实 | 证据 |
|---|---|
| 盖板是**独立预制体** `Pet Swap Skill`，**820×270** | 【样本】`Resources/Panels/PetBag/Prefabs/Pet Swap Skill.prefab` 根 RectTransform：`SizeDelta (820,270)`、`AnchorMin/Max (1,0)`、`AnchoredPosition (10,-5)` |
| 它与只读的「当前技能」视图**同挂在信息面板的同一格**，且**默认隐藏** | 【样本】`Pet Detail.prefab`：两个嵌套实例 `Current Skill`（无 active 覆盖 = 亮）与 `Swap Skill`（`m_IsActive = 0`），父 fileID 相同 |
| 点「调整技能」= 切到它 | 【样本】`Pet Current Skill.prefab:523`：`Reset Button` 的指针事件绑 `PetBackupSkillController.OnResetButtonClick`。⚠️ **该方法在我们这份上游源码里没有定义**（`PetBackupSkillController.cs` 只有 `SetActive`）⇒ **「点了会盖起面板」以人类实机观察为准**（`AGENTS.md §2` 证据优先级：样本 > 源码 > 推断） |
| 盖板里**删掉了「调整技能」「隐藏技能」两颗钮** | 【样本】盖板内嵌的 `Current Skill` 实例带 `m_RemovedGameObjects`：`5435088318650367030` = Secret Skill Button、`6393892455879996472` = **Reset Button** |
| 盖板自上而下 = **当前技能区** → **分隔线 `Divider` 790×6 @ y=-90** → **备用技能区**（内部名 `Normal`，高 **110**）→ **特殊技能区**（内部名 `Special`，高 **90**，**只装秘技**） | 【样本】盖板内三个嵌套实例改名 `Current Skill` / `Normal` / `Special`；`Normal` 实例 `SizeDelta.y=110`、`Special` 的源 prefab `SizeDelta (0,90)` |
| 每个技能区 = **4 个普通格 + 1 个必杀格 + 选中指示器（`Indicator Normal` 19×66 / `Indicator Super` 19×53）+ 分隔线 `Divider` 2.5×128**，备用区另有 **`Prev`/`Next` 22×30 翻页** | 【样本】`Pet Current Skill.prefab` / `Pet Backup Skill.prefab` / `Pet Special Skill.prefab` 的节点表 |
| 底部条 = 背景 760×78 + **提示语原文「点击上方和下方技能各一个进行交换，点击右方按钮返回」** + 「返回」图片钮 99×27 | 【样本】盖板 `Background Bottom`、`Text (Legacy)` 的 `m_Text`（UTF-16 转义）、`Back Button` |
| 一颗技能格 136×70 = 属性图标 18×25 + 竖排类型字 20×35 + 技能名 + 「威力: N」+「怒气: N」+ 秘技专用底 | 【样本】`Resources/Panels/OldPetBag/Prefabs/Skill Button.prefab` 的节点与默认文本（`威力: NaN`/`怒气: NaN`/`技能出错`/`错误`） |

⚠️ **几何不可逐位还原**：盖板用锚点（`AnchorMin/Max=(1,0)`）+ 自适应锚的子件，真机逐块解锚点解不出屏幕坐标（与 C1 `§4.1` 版面正本为什么以人类实测为准同因）⇒ **尺寸取量级（820×270），版式按上面的自上而下次序 + 人类实机观感**。

---

## 3. 我们今天的现状（设计前必须知道的差集）

## 3. 我们今天的现状（设计前必须知道的差集）

| 东西 | 现状 | 与目标的差 |
|---|---|---|
| 技能页签 | `detailPane.js` 的 `renderSkill` = **只读**：`常规技能（4）`/`必杀技` 两栏文字行 + 两颗钮 | ① 技能数据是 `CONTENT.petConfig(petId, level).skills` = **表算的前 4 + 1 必杀**，**不是这只宠真正带的**；② 无选中/无备用/无换位；③ 两颗钮只弹提示（`index.js:30-31`） |
| 内存宠形状 | `game/app/session.js` 的 `memPet` = `{uid,petId,level,exp,hp}` + **非枚举 `__xml`**（指向真档的 `Pet` 子树，`petXmlOf` 只回写 level/exp/hp） | 好消息：**XML 子树就在手上** ⇒ 换技能**可以写回真档**，不必重建形状 |
| 真档里的技能 | 【样本】`saves/save0.xml` 的 `<skills id="4"><ownSkillId><int>10018</int>…<normalSkillId>…<superSkillId>0</superSkillId></skills>` | **`superSkillId` 普遍是 0**（`newgame.js:132` 自认恒 0）⇒ 必杀**读时现算**（上游 `CheckNewSkill` 就是「没有就取第一个已学必杀」，`PetSkill.cs:113-131`） |
| 已学技能表 | 【实测】`game/data/unity/pets.json` 的 `skills.skillIdList`/`learnLevelList` **原样保留了编码**：6693 条里 **536 条负值**（`-1` 其它途径 / `-2` 60 级自动）、最大值 **100016** | ⇒ 「此刻该不该已学」**可算**：`0 < v < 10000 && v <= level` 或 `v === -2 && level >= 60`（与上游 `CheckNewSkill` 同口径） |
| 写盘通路 | C1 的 `onWrite(reason)` → `mapScene` 的 `requestSave()` = `writeBackBag` + `A.save()` | 复用它：换技能 ⇒ 先改 XML 子树 ⇒ 再发 `onWrite('skill')`。**不新增存档入口**（`docs/arch-code.md §3` #5） |
| 面板形态 | 上游是**盖板**（`Pet Swap Skill` 与只读的 `Current Skill` 同格、默认 `active=0`，§2.4） | **本份首版误判为「就地展开」⇒ 已按人类实机观察改为盖板**（第二层 `openPanel`） |

---

## 4. DOM 与类名契约（骨架 ③）

> **两块 DOM**：① 技能页签里的**只读**当前技能（入口页，类名 `.rbp-sk-*`）；② **盖板**（类名 `.rbx-*`，第二层面板）。

### 4.1 ① 只读技能页签（入口）

```
.rbp-sk                根（挂在 .rbp-ipanel > .rbp-tabbody 里）
├─ .rbp-sk-hd  「当前技能」
├─ .rbp-sk-slots     4 个 .rbp-sk-cell（普通，只读）
├─ .rbp-sk-cell--super   必杀横条（只读）
└─ .rbp-skill-acts   [调整技能] [隐藏技能]   ← 唯一可点的两颗钮
```

### 4.2 ② 盖板 `rb-skillpanel`（**与背包面板同大：948×524 @ left6/top8**，人类 2026-10-19 「可以和精灵背包面板一样大」）

```
.rbx-box               948×524 @ left6/top8（= .rbp-box 逐项对齐；盖住背包面板整块内容区）
├─ .rbx-top            标题层：空列 + 「技能调整」居中 + ✕（**关掉整个背包面板**，因为盖板已盖住背包自己那颗 ✕）
├─ .rbx-cur            当前技能区
│  ├─ .rbx-hd 「当前技能」
│  ├─ .rbx-slots          4 个 .rbx-cell（可点 = 选中）
│  └─ .rbx-cell--super    必杀横条（可点 = 选中必杀通道）
├─ .rbx-div             分隔线（790×6 的量级）
├─ .rbx-bak             备用技能区（内部名 Normal）= **与当前技能同一行版式**（人类 2026-10-19）：左边 4 个普通格（已习得未带可换 / 未习得灰格）+ **最右 1 个备用必杀格**，**五格同样大小**
│  ├─ .rbx-hd 「备用技能（含未习得）」 + 页码〔‹ n/m ›〕+ 必杀环〔必杀 k/m ‹ ›〕（翻页钮放标题栏 ⇒ 不占格位）
│  └─ .rbx-slots          本页 4 个普通格（空位也占格；未习得 = 灰格）+ **第 5 格 = 备用必杀**
├─ .rbx-note            一行小字（灰色 = 未习得；已按等级习得的排前面可点可换）
└─ .rbx-foot            底部条
   ├─ .rbx-tip           提示语（照抄上游原文）
   └─ .rbx-back          [返回]
```

- **前缀**：入口页沿用 `.rbp-sk-*`（C1 已启用）；盖板**新前缀 `.rbx-*`**（`rbp-` 已被背包、`rbs-` 已被仓库占用）。**不碰共享的 `_kit.js`**（`petbag-impl §12.3` 那次给共享模块加导出炸黑屏的教训）。
- **一颗技能格**（两种皮同构，**人类 2026-10-19 定**：**上下两行** —— 第一行**技能名占满整格宽**（可换行、完整显示，不截断），第二行才是 类别 + 威力；**命中率与学习等级不进格内**，连同元素/说明都放**跟随鼠标的悬浮框**（`.rb-skilltip`，body 级 `position:fixed`）；⚠️ **格内不设 `title`**（否则浏览器原生悬浮框与详情浮框重复 ⇒ 两个框）；空槽画「空」、必杀空槽画「空（必杀技）」；`--on` = 选中（金边）；`--ro` = 只读（无手型光标）。**当前技能恒 4 普 + 1 必杀共 5 格、排同一行**（入口页一个 `.rbp-sk-slots`、盖板一个 `.rbx-slots`）。
- **右上角 ✕**：盖板自带一颗（`.rbx-x`）= **关掉整个精灵背包面板**（与上游 `Close Button Cover` 同义）；盖板已盖住背包面板自己那颗，故必须自带。
- **盖板不自带遮罩**（照上游：它是背包面板的子层）⇒ 盖板与背包面板**同大**时，除了盖板那一层，**其余区域都点不到**（背包的遮罩/✕/队伍区都被盖住）⇒ 换宠联动（§7.2 最后一行）在同大形态下**不再触发**，但保留接线（若将来盖板改小或加遮罩，仍然成立）。

### 4.3 尺寸与行高（盖板 820×270 内）

| 行 | 高 |
|---|---|
| 当前技能区（标题 14 + 普格 38 + 必杀 28 + 行距 6） | ≈ 86 |
| 分隔线 | 6 |
| 备用技能区（同版式） | ≈ 86 |
| 秘技留位小字 | 14 |
| 底部条 | 42 |
| 余量 | ≈ 30（给 gap） |

⇒ **不改背包面板 `.rbp-box` 的高度口径**（人类 2026-10-17 手测定死的 `472→524`，`petbag-impl §12.3`）。

### 4.4 悬浮说明（`InfoPrompt` 的等价物）

**鼠标悬浮任一技能格** ⇒ 说明条显示 `名 / 元素 / 类别 / 威力 / 命中 / 描述`；移开 ⇒ 保留最后一次非空的（不闪）。
⚠️ 描述文本来自 `skills.json` 的 `rawDescription`（可能带方括号标记）⇒ **原样显示，不解析**（解析 = 战斗引擎 E4 的事）。

---

## 5. 数据接线（零算数，骨架 ④）

### 5.1 三个字段的真值

| 字段 | 真值（上游） | 我们的读 | 我们的写 |
|---|---|---|---|
| `ownSkillId` | 学会的全部技能 | **档里为准**；档里缺项时并上「此刻按等级该学的」（§5.2） | 换位成功 ⇒ **一并写回归一化后的 own**（上游 `LearnNewSkill`/`CheckNewSkill` 也是这么改的） |
| `normalSkillId` | 带的 4 个常规 | 档里为准，**显示时滤掉必杀、去重、补空到 4**（照搬 `GetNormalSkill`） | 只写被换的那一格；**被换下来的技能不写进 `own`**（它还在 own 里） |
| `superSkillId` | 带的 1 个必杀 | **档里非 0 才用**；为 0 ⇒ 取已学必杀里第一个（照搬 `CheckNewSkill` 的 `superSkill = superSkill ?? first`） | 换位成功 ⇒ 写 `superSkillId` |

⚠️ **读时现算的必杀不立刻落盘**（打开面板看 ≠ 改数据，C1 的 `A1` 口径）；**第一次真正换位时才随 own/normal/super 一起写**。

### 5.2 「此刻已学」的判据（照搬 `CheckNewSkill`，`PetSkill.cs:113-131`）

```
learnableNow = 表里 skillIdList × learnLevelList 配对出来的条目 x：
    (secretType == GreaterThanLevel(0) && level >= value)        // 0 < raw < 10000 && raw <= level
    || (isAutoLearned(-2) && level >= 60)                        // raw == -2
// 其余（raw < 0 的 -1、raw >= 10000 的秘技）本批不自动学
```

### 5.2b **进化后档里的旧招**（人类 2026-10-19 拍板 · 修 bug "进化后技能显示混乱"）

**问题**：进化保留旧招（照上游 `PetSkill(evolveId, level, original)`，见 `orchestration-impl §偏差 8`），
但旧招**不在新形态的 `skillLearnOf` 表里** ⇒ §5.1 的 `meta` 查不到它们
⇒ 面板只能打出裸数字 `#10001`（人类 2026-10-19 报障：技能"混乱"）。

**目标行为（照上游 `GetLearnSkillInfos`，`PetSkill.cs:88-92`）**：
上游对「已拥有、但 `learnInfoList` 里查不到」的条目，**回退成 `SecretType.Others(-1)`**
并用**全局** `Skill.GetSkill` 取完整卡面（名字/类别/威力/描述）—— 不是丢弃、也不是显示裸 id。

⇒ L1 `buildModel` 加第 4 参 `view`（= `content.skillView`，L2 注入）：
对 `own` 里每个不在 `meta` 的 id，用 `view` 查一次并**补进 `meta`**（`secretType:-1` / `unlockRaw:-1`）。
⚠️ `unlockRaw:-1` ⇒ §5.2 的 `learnableAt` 恒 false ⇒ 兜底项**不会**被当成"现在该学"、也**不进未习得区**（它已习得）。

**接缝不变**（仍是 §5.3 那三个口子）；落盘侧由 `session.js` 的 `applyEvolutionXml` 用**同一台** `buildModel` 算 ⇒
落盘与显示**口径一致**，不会出现"面板这样、存档那样"。

### 5.3 接缝（谁读、谁写、谁落盘）

```
[L1] game/logic/petbag/skill-ops.js   纯函数：buildModel / swapNormal / swapSuper（零 DOM、零 content、零存档）
       ▲ 注入                        （与 C1 的 logic 注入同族：opts.logic.skillOps，缺项抛错）
[L4] mapScene（装配）  ── 读：opts.petSkills(pet) ── 写：opts.setPetSkills(pet, skills) ── 落盘：opts.onWrite(skill)
       ▲ 两个存取口都由 session.js 提供（真档 XML 子树在它手上）
[L3] view/petbag/skillPane.js  只画 DOM + 只发意图 {kind, slot|skillId}
[L2] content.js  新出口 skillLearnOf(petId)  ← pets.json 的 skillIdList×learnLevelList + skills.json 解码
```

- **存档单一入口**：L3/L1 **不碰** `localStorage`、不碰 XML；换位只返回 `{ok, skills, hint, write:'skill'}`，由装配层写回 + `A.save()`（V-5）。
- **表只经 L2**：`skillLearnOf` 加在 `game/app/content.js`（C1 铁律 6 允许的唯一跨层 import）。
- **读/写两口的形状**（`session.js` 新增两个函数，`A` 上同名暴露）：

```js
petSkillsOf(pet)   -> { own: number[], normal: number[], super: number }
applyPetSkills(pet, { own, normal, super })   // 就地改 __xml.skills 的三个字段（保真优先，不重建子树）
```

---

## 6. 依赖方向（骨架 ⑥）

```
skillPane.js(L3) ──import──> content.js(L2, 唯一允许的跨层)
       │ ctx.runSkill(op, args)（只发意图）
       ▼
index.js(L3 装配) ──注入──> skill-ops.js(L1) · petSkills/applyPetSkills（来自 L4）
       │                                  ▲
       └──> detailPane.js(L3)            └── import { SkillType } from game/core/pet/skill.js（L0，单向向下）
```

- **L1 允许 import L0**（`SkillType` 的**单一真值**在 `core/pet/skill.ts`）。
- **不许** L1 import L2/L3；**不许** L3 import L1（铁律 3，走注入）。

---

## 7. 交互与事件（骨架 ⑦）

### 7.1 状态（盖板自有，视图态不是数据；盖板一关就丢）

| 状态 | 取值 | 何时清 |
|---|---|---|
| `sel` | `{kind:'normal', slot:0..3}` / `{kind:'super'}` / `null` | 点已选中项（取消）、换位成功、盖板关闭 |
| `page` | 备用普通区页码（每页 4） | 换宠（`onPetChange`）⇒ 回第 1 页 |
| `superIdx` | 备用必杀在「已学必杀环」上的游标 | 换宠 ⇒ 归 0；‹ › 时循环 |

⚠️ 入口页（只读技能页签）**不再持有任何视图态** —— 首版留在页签里的 `adjust/sel/page` 三态随形态改动**作废**。

### 7.2 换位（两条方向都支持）

| 玩家动作 | 结果 |
|---|---|
| 点**当前**普通格 | 选中该槽（再点一次 = 取消） |
| 点**当前**必杀格 | 选中必杀通道 |
| 点**备用**普通格，且当前有选中槽 | 与该槽换位 → 写盘 → 重画 |
| 点**备用**普通格，且当前没选中 | 换到**第一个空格**；没有空格 ⇒ 提示「先点一个要替换的当前技能」 |
| 点**备用**必杀格 | 直接换必杀（**不必先选**，解 SKB1）；点已选中的当前必杀格 = 取消（解 SKB4） |
| 点备用区的 ‹ / › | 翻页（**不写盘**）；备用必杀另有自己的 ‹ ›（在已学必杀间轮换） |
| 点底部「返回」 | 关盖板 ⇒ 回到只读技能页签（**不写盘**） |
| 点盖板外的队伍格 | ⚠️ **同大盖板下点不到**（盖板已盖住整块）⇒ 换宠联动只保留接线（`ctx.onPetChange`），实际不触发 |

**守卫**（不满足 ⇒ 提示，不写盘）：新技能**必须已学**；旧技能**必须在带**；两边都**不能是必杀**、**不能是行为技**（`type < 属性 && type != 被动`）。
**换完必存盘**（上游 `SaveSystem.SaveData()` 同款时机）。

### 7.3 事件出口

| 事件 | 去向 |
|---|---|
| `ctx.runSkill(swapNormal, {slot, skillId})` / `(swapSuper, {skillId})` | `index.js` → L1 → 返回 `{ok, skills, hint, write:'skill'}` |
| `write === 'skill'` | `opts.onWrite(skill)` ⇒ 装配层 `applyPetSkills` + `A.save()` |
| `hint` | `TEXT` 表取中文串 ⇒ 说明条 + `showHint` |

---

## 8. 资产权威

| 东西 | 权威 | 缺口 |
|---|---|---|
| 技能名/威力/命中/描述/类别 | L2 `game/data/unity/skills.json`（经 `content.skillView`） | 无 |
| 学会等级/秘技编码 | L2 `game/data/unity/pets.json` 的 `skills.learnLevelList` | 无（编码原样保留，实测见 §3） |
| 技能格**美术**（原版 `PetSkillBlockView` 贴图） | **本代不搬**：用文字格（同 `itemPane` 空壳那套口径） | 登记 §9 |
| 悬浮说明贴图 `Info Prompt 95×30` | 同上，本代文字条 | 登记 §9 |

---

## 9. 缺口 / 已知不接（不偷偷做）

| 项 | 状态 | 归属 |
|---|---|---|
| **隐藏技能（秘技）面板** | 不做，维持提示 | `restart-secret-skill-learning.md` + D7（学习谓词要战斗结算） |
| **升级自动学新技能**（`CheckNewSkill` 接进会话） | 不做：面板**读时现算**补齐（§5.2），**不落盘** ⇒ 换技能时顺带写 | D5/D6 + 会话线 |
| **技能格美术 / 说明条贴图** | 文字格 + 文字条 | A3 浮层与正式排版线 |
| **PVP/肉鸽宿主**的技能换位 | 不接（宿主写盘门 = `normal`） | C1 §1.2 |
| 换位动画/音效 | 无（上游在战斗里用） | 战斗引擎 E6 |

---

## 10. 本批默认（**SPQ1–SPQ6**）

| # | 事项 | 本批默认 | 状态 |
|---|---|---|---|
| **SPQ1** | 面板形态 | **盖板**（`openPanel('rb-skillpanel')` 叠在背包面板之上，820×270） | ⚠️ **2026-10-19 人类实机观察 + prefab 证据推翻首版的「就地展开」**（§2.4），**已按盖板实施** |
| **SPQ2** | 范围：**只做「已学技能之间换位」**，不做学习新技能 | 只换位 | 维持 |
| **SPQ3** | 必杀技**一并可换**（1 个槽，环形轮换） | 可换 | 维持 |
| **SPQ4** | 换完**立即存盘** | 立即存盘 | 维持 |
| **SPQ5** | 4 个槽**未满时**点备用技 = 直接填空 | 直接填空 | 维持 |
| **SPQ6** | 「隐藏技能」钮**维持提示**、不建面板 | 维持提示 | 维持 |
| **SPQ7** | **方案 B（人类 2026-10-19 拍板）**：盖板**照搬上游结构**（当前技能区 + 备用技能区 + 分隔线 + 底部提示条 + 返回），但**第三块「特殊/秘技区」不实现** | 按 B | **已拍板**；⚠️ **2026-10-19 三轮修订**：原先的「留一行小字」换成 **「未学习技能」灰格区**（SPQ10） |
| **SPQ10** | **未习得技能与已习得技能同处「备用技能」区**（人类 2026-10-19 三轮澄清）：**已习得未带的不灰、可点可换**；**未习得的灰色、点不动**，**第二行左侧显示学习条件**（Lv n / Lv60 / 秘技 / 胜场·败场·Buff·残血…） | 合池 | **人类 2026-10-19 点名 + 澄清**。数据 = L1 `buildModel` 的 `backup` = `backupNormal`（已习得未带，排前）+ `unlearned`（表里可学 − 已学，排后，按「等级到就学 → 60 级自动 → 条件型」排序）。**「习得」判据照人类原话**：等级 15 ⇒ 1~15 级的技能已习得，16~100 级与其它条件型 = 灰色但**照样显示** |
| **SPQ8** | 盖板**不自带遮罩**（照上游：它是背包面板的子层）⇒ 外部可点、点队伍格仍会换宠且盖板跟着重画；**右上角 ✕ 用背包面板自己那颗**（= 关整个背包面板） | 按此 | **人类 2026-10-19 一并确认（盖上面、留标题与队伍区）** |
| **SPQ9** | 技能格用**文字块**（原版是 136×70 的贴图，本仓没有那些贴图） | 文字块 | **人类 2026-10-19 一并确认** |

---

## 11. 配对 impl 的义务（交接给 `skill-panel-impl.md`）

1. **L1** `game/logic/petbag/skill-ops.js`：`buildModel` / `swapNormal` / `swapSuper`（纯函数，§5.3 签名）。
2. **L2** `content.js` 加 `skillLearnOf(petId)`（§5.2 的解码）。
3. **L4 会话** `game/app/session.js` 加 `petSkillsOf` / `applyPetSkills` 并挂到 `A`；`mapScene` 注入 + `onWrite(skill)` 落盘。
4. **L3** `view/petbag/skillPane.js` 新建：导出 `renderSkillTab`（入口页，只读）与 `createSkillOverlay`（盖板）；`detailPane.js` 的技能页签改调前者；`bagPanel.js` 的「调整技能」→ `ctx.openSkillPanel(pet)` + 换宠发 `ctx.onPetChange`；`index.js` 加 `TEXT` 取词 + `logic.skillOps` 注入校验 + `openSkillPanel`（第二层 `openPanel` + 关栈联动）。
5. **CSS** `ui.css` 加 `rbp-sk-*`（入口页）与 `rbx-*`（盖板）两段（**不加** `_kit.js` 新导出）。
6. as-built 与**请人测清单**。
