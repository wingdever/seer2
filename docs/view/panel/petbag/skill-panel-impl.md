# 精灵技能面板（更换技能）· 实现文档 = `skill-panel-impl.md`

> 上游设计 = **`docs/view/panel/petbag/skill-panel-design.md`**（**SPQ1 已被人类实机观察推翻并改为盖板 · SPQ7–SPQ9 人类 2026-10-19 拍板**；不照搬 **SKB1–SKB5**）。
> **形态**：① 技能页签 = **入口页**（只读当前技能 + 两颗钮）；② 点「调整技能」⇒ **盖板** `rb-skillpanel`（第二层 `openPanel`，**与背包面板同大 948×524**，人类 2026-10-19）。
> **不在本文重述**：上游真值与逐条证据（design §2）、盖板形态的 prefab 证据（design §2.4）、DOM 契约（design §4）。本文只写**怎么落地**。
> **宿主面板**：`docs/view/panel/petbag-impl.md`（C1 配对 impl）。
> **编号纪律**：本文本地 = 施工批 **SK-a…** · 文件 **SF1–SF9**。**不许**借用 ①–⑨ / 裸 `A<n>` / design 的 SKB·SPQ 号。

---

## 0. 铁律（实现期逐条自检）

1. **面板零算数**：`skillPane.js` 里不得出现 `type === 100`、`slice/sort/filter` 之类；过滤与分页一律问 L1 的 `buildModel`（C1 铁律 1 / V-2 同款口径）。
2. **L1 零 DOM / 零 content / 零存档**：`game/logic/petbag/skill-ops.js` 不得出现 `document`、`localStorage`，**不得 import `game/app/**`**；技能表由参数喂进去。
3. **换位只发信号**：View 内 `grep requestSave|A.save` = **0**；L1 返回 `write:'skill'`，由装配层（mapScene）落盘（V-5 / SKB5）。
4. **表只经 L2**：技能表经 `content.js` 的 `skillLearnOf`（唯一允许的跨层 import，C1 铁律 6）。
5. **存档单一入口**：只经 `game/app/session.js` 的 `petSkillsOf`/`applyPetSkills` 读写 `__xml.skills`（`docs/arch-code.md §3` #5）。
6. **不加共享模块导出**：`_kit.js` **逐字节不动**（`petbag-impl §12.3` 的黑屏教训）。
7. **不写测试代码**（决议 ⑦）：验收 = 人类手测，清单在 §8。

---

## 1. 变更文件清单（SF1–SF9）

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| **SF1** | `game/logic/petbag/skill-ops.js` | **新建** | L1 纯函数：`buildModel` / `swapNormal` / `swapSuper`（§2） |
| **SF2** | `game/app/content.js` | **改** | 新出口 `skillLearnOf(petId)`（§3） |
| **SF3** | `game/app/session.js` | **改** | `petSkillsOf(pet)` / `applyPetSkills(pet, skills)` + 挂到 `A`（§4） |
| **SF4** | `game/app/scenes/mapScene.js` | **改** | 注入 `logic.skillOps` + `petSkills`/`setPetSkills`（§5） |
| **SF5** | `game/app/view/petbag/skillPane.js` | **新建** | L3 两个出口：`renderSkillTab`（入口页）+ `createSkillOverlay`（盖板）（§6） |
| **SF6** | `game/app/view/petbag/detailPane.js` | **改** | 技能页签改调 `renderSkillTab`（旧的 `renderSkill`/`skillRow` 整段退役） |
| **SF7** | `game/app/view/petbag/bagPanel.js` | **改** | 「调整技能」→ `ctx.openSkillPanel()`；换宠发 `ctx.onPetChange()` |
| **SF8** | `game/app/view/petbag/index.js` | **改** | `TEXT` 取词 + `logic.skillOps` 注入校验 + `openSkillPanel`（第二层 `openPanel`）+ 关栈联动 |
| **SF9** | `game/app/ui.css` | **续段** | `rbp-sk-*`（入口页）与 `rbx-*`（盖板）两段（**不动** `_kit.js`） |

---

## 2. L1 · `game/logic/petbag/skill-ops.js`

```js
import { SkillType } from '../../core/pet/skill.js'   // L0 单一真值（D5 B1 已下沉）；L1 → L0 是合法的向下依赖

export const NORMAL_SLOTS = 4

export function buildModel({ own = [], normal = [], super: superId = 0 }, level = 1, learn = [])
// -> { own:[id], normal:[4 个 id/0], super:id, backupNormal:[id], backupSuper:id, ownSupers:[id], meta:Map(id->learn 项) }

export function swapNormal(model, { slot, skillId })  // -> { ok, skills:{own,normal,super}, hint }
export function swapSuper(model, { skillId })       // -> { ok, skills:{...}, hint }
```

**归一化（buildModel 内做，design §5.1/§5.2）**：

1. `own` = 档里 own ∪ 此刻该学的（`0 < raw < 10000 && raw <= level` 或 `raw === -2 && level >= 60`），去重保序；
2. `normal` = 档里 normal 去重 → 滤掉必杀与行为技 → 补 0 到 4；
3. `super` = 档里非 0 且属于 own ⇒ 用它；否则 `own` 里第一个必杀；
4. `backupNormal` = own 里非必杀、非行为技、且不在 normal 里；
5. `ownSupers` = own 里的全部必杀（**盖板的备用必杀 ‹ › 在这条环上轮换**）；`backupSuper` = 环上下一个（兼容口径）。

⚠️ **`isAction` 公式**（照上游 `Skill.cs:460-465`）：`type < SkillType.属性 && type !== SkillType.被动`。

---

## 3. L2 · `content.js` 新出口

```js
export function skillLearnOf(petId) {
  // pets.json: skills.skillIdList × skills.learnLevelList 配对
  // 解码（照 SecretSkillDatabase.cs:20-23）：raw < 0 ⇒ secretType = raw；raw >= 0 ⇒ type = floor(raw/10000), value = raw % 10000
  // 卡字段从 skillView(id) 取（名/类别/威力/命中/元素/描述/type）
}
```

---

## 4. 会话存取（`game/app/session.js`）

```js
export function petSkillsOf(pet)   // -> { own, normal, super }（读 __xml.skills 的三个字段）
export function applyPetSkills(pet, { own, normal, super })  // 就地改 __xml.skills，保留 <skills id="…">
```

⚠️ `id` 必须留着（属性）；`normalSkillId` **写 4 个（含 0）**（存档声明 `int[4]`、实测可少于 4）。

---

## 5. 装配接线

- `mapScene.openRestartPetBag` 多传：`logic.skillOps`、`petSkills`、`setPetSkills`；`requestSave` 保持原样（换技能走**同一个** `onWrite`）。
- `index.js`：`skillModelOf(pet)` = `buildModel(petSkills(pet), level, skillLearnOf(petId))`；`runSkill(op, pet, args)` 成功后 `setPetSkills` + `onWrite('skill')`。

---

## 6. L3 · `skillPane.js`

### 6.1 两个出口

```js
export function renderSkillTab(host, ctx, pet)      // 入口页：只读 4 常规 + 必杀 + [调整技能][隐藏技能]
export function createSkillOverlay(root, ctx)       // 盖板：{ render, close }
```

### 6.2 盖板的自有状态（盖板一关就丢）

`sel`（选中槽）· `page`（备用普通区页码，每页 4）· `superIdx`（在 `ownSupers` 环上的游标）· `tip`（悬浮说明最后一条）。

### 6.3 面板栈接线（`index.js`）

- 打开：`skillEntry = openPanel('rb-skillpanel', root => { skillCtrl = createSkillOverlay(root, {...}) })`
  —— `openPanel` **返回它自己的栈项** ⇒ 关闭时 `closePanel(skillEntry)` **不会误关栈顶别的面板**。
- 盖板的 `getPet()` = **当前队伍区选中的那只** ⇒ 盖板开着时点下方队伍格换宠（照上游：盖板是背包的子层、外部仍可点）也能跟着换。
- 关背包 ⇒ `closeSkillPanel()` 先关盖板（`ctxBase.onClose` 里先调它）。
- 「返回」= 只关盖板 ⇒ 回到只读的技能页签。

### 6.4 CSS

- 入口页：`rbp-sk` / `rbp-sk-hd(-t)` / `rbp-sk-slots` / `rbp-sk-cell(--super)` / `rbp-sk-name|cat|pow|acc|lv`。
- 盖板：`rbx-box`（**948×524 @ left6/top8，与 .rbp-box 逐项对齐**）/ `rbx-top` + `rbx-title` + `rbx-x`（关整个背包）/ `rbx-hd(-t)` / `rbx-page(btn)` / `rbx-slots` / `rbx-bak` / `rbx-div` / `rbx-superrow` / `rbx-cell(--super|--on|--ro)` / `rbx-name|cat|pow|acc|lv` / `rbx-note` / `rbx-foot` / `rbx-tip` / `rbx-back`。垂直预算：24(标题)+18+76+76+6+18+76+6+76+16+52(底条)+8×6(行距) ≈ 406 ≤ 504（余量由底条 `margin-top:auto` 吃掉）。⚠️ **必杀条必须放在行容器里**（`.rbx-superrow` / `.rbp-sk-slots`）——格子的 `flex:1 1 0` 是按**行**算的，直接挂列容器上会被 flex-basis 压成 0 高（同理 `--super` 只能 `width:100%`、**不能**写 `flex:0 0 100%`，那是列向主轴=高度）。
- ⚠️ **不加 z-index**（`petbag-impl §12.3` 实测：加了会跳出 `.rv-panel` 的层叠上下文）；**盖板不带遮罩**（照上游）。

---

## 7. 施工批（SK-a…）

| 批 | 内容 | 可独立验 |
|---|---|---|
| **SK-a** | SF1 L1 + SF2 `content.skillLearnOf` | 浏览器控制台可查（不改存档） |
| **SK-b** | SF3 会话读写 + SF4 mapScene 注入 | 入口页技能 = **真档里的** |
| **SK-c** | SF5/SF6/SF7/SF8 入口页 + 盖板接线 | 点「调整技能」⇒ 盖板起得来、换得动、存得上 |
| **SK-d** | SF9 CSS | 版式 |
| **SK-e** | as-built 回填 + `docs/status.md` 与 C1 指针同步 | — |

---

## 8. 请人测（人类手测 = 主要验收，决议 ⑦）

> `#/map?slot=0&map=100` ⇒ HUD「精灵背包」⇒ 选一只 ⇒「技能」页签（**⚠️ 先 Ctrl+Shift+R 硬刷新**）

1. **入口页 = 真档**：四个技能格 + 必杀条 = 这只宠**档里带的**（改 `saves/save0.xml` 的 `normalSkillId` 重开即变，才算真读档）。
2. **盖板起得来**：点「调整技能」⇒ **一块和精灵背包面板一样大的盖板盖上来**（948×524，带自己的标题「技能调整」+ 右上角 ✕；内部：当前技能区 / 分隔线 / 备用技能区 / 底部提示语 + 返回）。
3. **提示语**：底部那行字 = 「点击上方和下方技能各一个进行交换，点击右方按钮返回」。
3b. **格内三项 + 上下两行**：每个技能块**第一行是技能名（占满整格宽、可换行、完整显示）**，第二行才是 类别 + 威力；**没有**命中率、没有学习等级。实测「奋力突破」这类四字名在**精灵背包**里也要完整显示。
3c. **恒 5 格、同一行**：当前技能区 = **4 个普通格 + 1 个必杀格**排**一行**（不是两行）；空槽也画占位，必杀空槽写「空（必杀技）」。
3d. **悬浮详情**：鼠标停在任一技能块上 ⇒ **跟随鼠标出现浮框**（**含命中率**、学习等级、元素、类别、威力、**技能说明**），鼠标移开即消失；浮框不被面板边缘裁掉、不会挡住鼠标；**只有这一个浮框**（浏览器原生的技能名悬浮框已取消 = 格内不再设 `title`）；入口页与盖板都要有。
3e. **不溢出**：技能页签内容**不超出**信息面板（`.rbp-ipanel`）边界。
4. **换位（先点当前）**：点盖板上方第 1 格（金边高亮）⇒ 点下方某个 ⇒ 互换；**关掉背包重开仍是新技能**（= 写盘成功，`saves/save0.xml` 的 `<skills>` 同步变）。
5. **换位（先点备用）**：不选当前格，直接点下方技能 ⇒ 落进**第一个空格**；四格全满且没选中 ⇒ 出提示「先点一个要换掉的当前技能」。
6. **必杀**：上方必杀条高亮 ⇒ 点下方备用必杀 ⇒ 换；有多个已学必杀时，下方必杀两侧的 ‹ › 能在**必杀之间轮换**。
6b. **备用区 = 与当前技能同一行版式**（人类 2026-10-19）：左边 **4 个普通格** + **最右 1 个备用必杀格**，**五格同样大小**；空位也占格。翻页钮在标题栏（`‹ n/m ›` 与 `必杀 k/m ‹ ›`）⇒ 不占格位。
6c. **备用区含未习得**：**已习得未带的不灰、可点可换**；**未习得的灰色、点不动**（不换位、不写盘），**第二行左侧 = 学习条件**（`Lv n` / `Lv60` / `秘技` / `胜场`·`败场`·`我方Buff`·`残血`…），悬浮仍出详情（前缀「未学习 ·」）。**习得判据**：等级 15 ⇒ 1~15 级技能已习得（不灰），16~100 级与其它条件型 = 灰色但照样显示；升一级后重开面板，跨过的那条应由灰转正常、可点。
7. **翻页**：备用技能 > 4 时 ‹ › 翻页；翻页**不写盘**（关盖板重开回到第 1 页）。
8. **返回 / 关闭**：点底部「返回」⇒ 只关盖板、回只读页签；点盖板**右上角 ✕** ⇒ **关掉整个背包面板**（盖板同大 ⇒ 背包面板自己那颗 ✕ 被盖住，故盖板自带一颗）。
9. **换宠联动**：⚠️ **同大盖板下换不到宠**（盖板盖住了队伍区）⇒ 本条**改为**：确认盖板开着时点不到下面的队伍区（= 没有穿透点击的副作用）。
10. **不回归**：背包其余八钮 / 三个页签 / 队伍区翻页照旧；地图场景照旧。

---

## 9. as-built（2026-10-19 落码 · 本节以实际口径为准）

### 9.1 落地盘点（对照 §1）

| # | 状态 |
|---|---|
| **SF1** | ✅ `skill-ops.js`（另按盖板需要**多返回 `ownSupers`**（已学必杀环，供盖板 ‹ › 轮换）、**`unlearned`**（表里可学项 − 已学）与 **`backup`**（= `backupNormal` 已习得未带 + `unlearned` 灰色未习得，**同区合池**）） |
| **SF2** | ✅ `content.skillLearnOf` |
| **SF3** | ✅ `session.petSkillsOf`/`applyPetSkills` + 挂 `A` |
| **SF4** | ✅ `mapScene` 三处注入 |
| **SF5** | ✅ `skillPane.js` 重写为 `renderSkillTab` + `createSkillOverlay`（盖板自带 sel/page/superIdx/tip） |
| **SF6** | ✅ `detailPane.js` 改调 `renderSkillTab`；旧 `renderSkill`/`skillRow` 与其 CSS 类整段退役 |
| **SF7** | ✅ `bagPanel.js`：「调整技能」→ `ctx.openSkillPanel()`（入口页里那颗钮的闭包）；换宠 → `ctx.onPetChange()` |
| **SF8** | ✅ `index.js`：`openSkillPanel`（第二层 `openPanel` + 用**返回的栈项**关闭）、`closeSkillPanel`（关背包先关盖板）、`onPetChange`、6 条 `skill.*` 取词 |
| **SF9** | ✅ `ui.css`：`rbp-sk-*`（入口页）+ `rbx-*`（盖板）两段 |

### 9.2 与 §2–§6 的偏差 / 补充

- **盖板尺寸 = 人类拍板，不是上游尺寸**：上游那块是 820×270（锚点定位、只占背包面板内容区的一半多）；**人类 2026-10-19 反馈「太小了，可以和精灵背包面板一样大」⇒ 我们改成 948×524（与 `.rbp-box` 逐项对齐）**。代价：背包面板的 ✕/遮罩/队伍区被盖住 ⇒ 盖板自带标题 + ✕（§4.2），换宠联动不再触发（接线保留）。
- **秘技区按方案 B 不实现**：只在底部上方留一行「秘技区：本作暂未开放（学习条件要战斗结算，另属）」。等 D7 接上再把第三块补回来。
- **盖板不带遮罩**（照上游：它是背包面板的子层）⇒ 点盖板外仍能操作背包（队伍格换宠 → 盖板跟着重画；右上角 ✕ → 关整个背包面板）。
- **`write` 的 reason 被忽略**：`mapScene` 的 `requestSave` 是无参壳（`petbag-impl §12.2` 已登记 R4 未落地）⇒ 换技能与背包九件走**同一条** `writeBackBag + A.save()`。
- **`normalSkillId` 写满 4 个（含 0）**（读侧照样去重/补空；往返已实测）。
- **读时现算的必杀不落盘**：档里 `superSkillId=0` 时盖板显示第一个已学必杀（照搬 `CheckNewSkill`），**打开面板不写盘**，第一次真换位才随三个字段一起写。
- **技能格 = 文字块 + 上下两行**（原版 136×70 的贴图本仓没有）：**第一行技能名占满整格宽**（`width:100%` + `word-break:break-word`，可换行、不截断），**第二行才是 类别 + 威力**（人类 2026-10-19：「奋力突破」在精灵背包里显示不全 ⇒ 名字必须独占一行）；**命中率与学习等级不进格内**。
- **取消浏览器原生的技能名悬浮框**：格内**不设 `title`**（人类 2026-10-19：与我们的详情浮框重复，出现两个框）⇒ 现在悬浮**只有 `.rb-skilltip` 一个**。
- **当前技能 = 4 普 + 1 必杀，**同一行**（人类 2026-10-19 二轮：先前把必杀条另起一行 ⇒ 被要求改回一行）：入口页一个 `.rbp-sk-slots`、盖板一个 `.rbx-slots`，5 格并排；必杀格只靠配色/边框区分（**不再** `width:100%`）。⚠️ 反过来，格子的 `flex` 是按**行**算的 ⇒ 任何技能格都**不能**直接挂列容器上（会被 flex-basis 压成 0 高）。
- **悬浮详情 = 跟随鼠标的浮框**（人类 2026-10-19 二轮：不再嵌在面板里）：`skillPane.js` 内 `showTip/moveTip/hideTip`，一个 `position:fixed` 的 `.rb-skilltip` 挂在 **body** 上（`z-index:9999`，**不进 `.rv-panel` 的层叠上下文** ⇒ 不影响面板层叠），靠右/靠下自动翻面，`pointer-events:none`。盖板底部那条只留**上游提示语原文**。
- **防溢出**：`.rbp-ipanel` 补 `min-height:0` + `overflow:hidden auto`、新增 `.rbp-tabbody{min-height:0}`（flex 里的自动最小尺寸会让内容顶出容器）；格内标签一律 `white-space:nowrap` + `flex:0 0 auto`，只有技能名可换行。
- **恒 5 格**：4 个普通格 + 1 个必杀格，空槽也画出占位（必杀空槽写「空（必杀技）」）——低等级宠物本来没有必杀技能，不画会被误认成漏格。

### 9.3 未接（与 design §9 同口径，非死账）

- **隐藏技能（秘技）面板**与**盖板里的秘技区** —— 学习谓词要战斗结算（`restart-secret-skill-learning.md` 的 12 臂）。
- **升级自动学新技能并落盘** —— 会话未接 `CheckNewSkill`（面板读时现算补偿）。
- **技能格美术 / 说明条贴图** —— 文字块。
- **盖板的精确版式**（逐块坐标、锚点）—— 等人类手测校。

### 9.4 门禁（诚实记录）

- 本批**未改 `game/core/**.ts`** ⇒ 不需要 `node tools/build-core.mjs`。
- **没有跑** `difftest` / `node --test` / 任何探针（决议 ⑦：不为验收跑脚本、也不新写）⇒ **验收 = §8 的人类手测**，未跑之前不许宣称通过。
- 已做的机械自查：改动文件逐个 `node --check`（ESM 解析）通过；L1 的换位/守卫/归一化在 /tmp 里跑过一次性冒烟（**不入库**）；`__xml.skills` 的 `serialize→parse` 往返与 `validate` 通过。
