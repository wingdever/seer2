# 战斗数值拆分 · View 侧正本（battle-split.md）

> **定位**：**表现层（L3）**把"一条战斗数值产出"变成"屏幕上要画的东西"的正本 ——
> ① 伤害**按类型**拆（属性 / 固定 / 百分比 / 真实）；② 伤害**按连击段**拆（上游 `GetEvenComboDamageInfoList`）；
> ③ 派生表现（治疗 `+` 号与颜色、对方反应动画、捕获动画、伤害色）。
>
> **父文档** = `docs/view/view-design.md`（§8 子文档地图）。
> ⚠️ 本份**不占 §8 那 15 行的编号** —— 它是一份**跨族正本**（B2 战斗 HUD / B4 战斗舞台 / 战斗 impl 三处都要读它）。
>
> **邻线（只借不抄）**：
> - **出口契约 = E7** `docs/engine/battle-engine-views.md`：**§2.3 曾"代管"本份算法**（本份成文后它只留指针）；
>   **§3.1 的 A/B/C 三层**里 **本份 = C 层（View 自算）**；**§3.2/§3.3** 定了"出口不许包含什么"与"无事件流"的代价。
> - 内核数值与判定 = **E4** `docs/engine/battle-engine-effects.md` / **E5** `docs/engine/battle-engine-judge.md`；只读出口 = `coreBattleDriver`（E7 §3.1 B 层）。
> - **战报文本** = 内核相位产（`game/core/battle/phase.ts:653-701`）⇒ **本份把它的逐字措辞钉死**（View 的反推依赖它，§3）。
> - 战斗场景 = `docs/view/scene/battle/view-scene-battle-design.md` / `-impl.md`；舞台 = **B4** `docs/view/scene/battle/view-scene-battle-stage.md`。
>
> **状态**：✅ 已写（2026-10-17），**待人类评审**。
> **本份成文 ⇒ E7 的三处"待写"指针要改指本份**（`docs/engine/battle-engine-views.md:154/254/368`；见 §9）。
>
> **编号纪律**：`SP1–SPn`（不变量）/ `SPC1–SPCn`（怪癖·脆弱点）/ `SPQ1–SPQn`（待拍板）/ `SPB1–SPBn`（施工批）
> **都是本份局部编号**，**不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）。

---

## 0. 这份文档回答什么

1. 屏幕上要"拆"的到底是**几种**东西 —— 这里有**两条不同的轴**：**按类型**（属性/固定/百分比/真实）与**按连击段**。
   **我们今天只有前者**，而且只在**战报文本**里。
2. 颜色 / `+` 号 / 反应动画 / 捕获动画 / 伤害色：每条的**真值在哪、谁算**（全是 View 自算，§2）。
3. **反推契约**：内核不给逐动作事件流（E7 §3.3 是显式围栏）⇒ View 只能从 `state.reports` 文本反推
   ⇒ **本份把正则依赖的逐字措辞钉死**（§3.1），否则改一个字的措辞就静默掉动作。
4. **我们的诚实口径**：**飘字、连击段、治疗数字全未落**；今天唯一的"拆分"体现在**战报文本面板**（`.rbb-record`）。

---

## 1. 范围与边界

### 1.1 圈里（C 层 · View 自算）

| 面 | 内容 |
|---|---|
| **伤害按类型拆的显示** | 把战报里的 `【属性伤害】/【固定伤害】/【百分比伤害】/【真实伤害】` 片段解析+着色（**数值由内核给**，本层只解析不重算） |
| **连击段拆分** | `GetEvenComboDamageInfoList` 的算法（§2.3）—— 目标口径；**今天未落** |
| **治疗表现派生** | `HealText`（`+` 号）/ `TypeColor` / `IsForceShowHeal`（§2.4）—— **今天未落** |
| **反应动画** | 对方被击的四分支 → `PetAnimationType` 值（§2.5）—— 今天**由** `reports` 文本近似（§3.2） |
| **捕获动画** | 成功/失败由**技能表**决定（§2.6）—— 今天未落 |
| **伤害色** | 属性相克 → 颜色（§2.7）—— 今天未落 |

### 1.2 圈外（明确不越界）

| 不归本份 | 归谁 |
|---|---|
| 伤害**数值本身**（`totalSkillDamage` / `damageDict` / `getTypeDamage`） | **内核 E4/E5**（今天表现层**够不到**，见 §3.3） |
| 命中 / 暴击 / 相克的**判定** | **内核** |
| `reports` 文本的**产生** | **内核相位**（`phase.ts:653-701`） |
| **出口形状**（哪些字段能给 View） | **E7 §3.1/§3.2** |
| 面板可用性（哪钮能点） | **会话层 E6 §2.5** |
| clip 名与素材（SWF 内的动画名） | 美术 / SWF（`docs/legacy/`）；舞台按 **KIND 词表**做**子串匹配** |
| 战报**文本面板**的版式与开合 | **B2** / `docs/view/scene/battle/view-scene-battle-impl.md` |

---

## 2. 上游真值（逐件）

### 2.1 四个表现草稿本 DTO —— 只指路，不重复

`CaptureInfo` / `DamageInfo` / `OtherSidePetReactionInfo` / `HealInfo` 的**字段与语义**已在
**E7 §2.3** 逐条记完（含 `DamageInfo` 的 8 字段 / `HealInfo` 的 4 成员）。**本份不复制**，只取其中"**算数**"与"**派生**"部分。

### 2.2 轴 ①：按**伤害类型**拆（**内核已在给，本层只解析**）

【源码】`MVC/Model/Battle/Phase/AttackPhase.cs:175/188`；【我们】`game/core/battle/phase.ts:684/690`（**逐字照搬**）。

- 内核把伤害**按三类先聚合**再走结算（`phase.ts:581` 注释 + `:583-593`）：
  `element`（`skill_element*`）/ `pink`（`skill_fix` + `skill_per`）/ `white`（`skill_act`）。
- **战报里要把它们画成独立片段**：

| 片段 | 颜色（上游原文） | 数据来源（内核） |
|---|---|---|
| `【属性伤害】N` | `#ed780e` | `sys.getTypeDamage(k => k.startsWith('skill_element'))` |
| `【固定伤害】N` | `#ff8cff` | `sys.damageDict.get('skill_fix')` |
| `【百分比伤害】N` | `#ff8cff` | `sys.damageDict.get('skill_per')` |
| `【真实伤害】N` | `#ff8cff` | `sys.damageDict.get('skill_act')` |

⚠️ **这两组色是上游战报自己的色**（`AttackPhase.cs:175/188`），**不是** `HealInfo.TypeColor` 那张表（§2.4）—— 两者**不通用**，别互相套。

### 2.3 轴 ②：按**连击段**拆 —— `GetEvenComboDamageInfoList`（本份的核心算数）

【源码】`UnitHudSystem.cs` `GetComboDamageInfoList :150-156` + `GetEvenComboDamageInfoList :158-190`
（E7 §2.3 已如实记录，本份是**接手后的正本**）。

```
comboCount = skillSystem.comboDamageInfoList.Count
  ≤ 1              ⇒ 返回 null                       （注意是 null，不是空表）
finalDamage = Mathf.Max(damage, 0)                    （负数归 0）

maxComboDamageDisplayCount = 30                       （上限常量）
comboCount = Mathf.Min(sourceCount, 30)               （源段超 30 ⇒ 只显示 30 段）
baseDamage      = finalDamage / comboCount            （int 整除）
remainingDamage = finalDamage % comboCount
for i in [0, comboCount):
    comboDamage = baseDamage + (i < remainingDamage ? 1 : 0)   ← 余数摊到**前**几段
    start = (long)i * sourceCount / comboCount                 ← 源段分组边界
    end   = (long)(i + 1) * sourceCount / comboCount
    isCritical = 该组内**任一段**暴击 ⇒ true                    ← 是 any，不是 all
```

⇒ 纯算数四要点：**`int` 整除**、**余数前置**、**`long` 防溢出**、**`any` 语义**。
⚠️ **落点**：它住在 `UnitHudSystem`（表现草稿本）⇒ **不进 core**（E7 §3.2 已判围栏），但它是**可复刻的确定算法**。

### 2.4 治疗的表现派生（今天未落）

【源码】`HealInfo`（E7 §2.3）：`IsForceShowHeal = Type 非空`（**有 type 就强制显示，哪怕 heal 是 0**）；

| 派生 | 规则 |
|---|---|
| `HealText` | `(heal >= 0 ? "+" : "") + heal` ⇒ ⚠️ **`0` 也带 `+`** |

| `TypeColor` | `element` → `#ED780E`；`pink` → `#FF40FF`；`white` → `Color.white`；其它 → `heal >= 0 ? #77E20C : Color.red` |

⚠️ 上游**治疗也有三色聚合**（`phase.ts:584-588` 的 `elementHeal/pinkHeal/whiteHeal` 已在内核里算）—— **但战报文本里没有治疗行**（§3.1 逐字清单里没有）⇒ **今天 View 拿不到治疗数字**（**SPC1**）。

### 2.5 对方反应动画（四分支）

【源码】`OtherSidePetReactionInfo`（E7 §2.3）：

```
DamageType === true  →  IsHit ? (IsCritical ? BeCriticalStruck : Hurt) : Evade
DamageType === false →  Idle
```

⚠️ 名字里的 `OtherSide` = "**看对方**"（我方视角看对手的反应）；`DamageType` = 技能伤害 vs buff 伤害。

### 2.6 捕获动画：由**技能表**决定，**不是**由 `result.isCapture`

【源码】E7 §2.3：`OnUseItem` 只在 `atkSkill.isCapture` 时 `new CaptureInfo(atkSkill.captureAnimType)`
⇒ **成功/失败是技能表数据**，与 `result.isCapture`（E6 §2.7）**不同源**。
⚠️ 这是"**表现与结果可能不一致**"的**上游事实**（不是我们引入的）：**照搬数据口径，别拿 `result` 去纠正动画**。

### 2.7 伤害颜色（属性相克）

【源码】`DamageInfo.ElementRelation`（E7 §2.3）→ 决定颜色；上游把它和 `DamageInfo` 的其余 7 字段一起给 View。
【我们】内核有相克结果（E4/E5），但**出口没给**（§3.3）⇒ 今天**只能从文本猜**。

---

## 3. 反推契约（我们今天**实际**依赖的逐字措辞）

### 3.1 内核战报原文（【源码】`game/core/battle/phase.ts` 逐字 · 别改措辞）

| 行 | 逐字模板（`<color=…>` 原样保留） |
|---|---|
| `state.ts:690` | `<color=#ffbb33>【{我方名}】</color>登场了！` |
| `phase.ts:664` | `<color={atkColor}>【{名}】</color>激活了专属动作！` |
| `phase.ts:667` | `<color={atkColor}>【{名}】</color>使用了<color=#00ffff>{技能名}</color>，` |
| `phase.ts:670` | `是属性技能！`（接在上行后） |
| `phase.ts:674` | `打出了致命一击，`（命中且暴击时） |
| `phase.ts:676` | `但是没有命中<color={defColor}>【{名}】</color>！` |
| `phase.ts:680` | `對<color={defColor}>【{名}】</color>总共造成了 <color=#ff4444><size=13>{N}</size></color> 點傷害！` |
| `phase.ts:684` | `<color=#ed780e>【属性伤害】<size=13>{N}</size=13></color>` |
| `phase.ts:690` | `<color=#ff8cff>【{固定\|百分比\|真实}伤害】<size=13>{N}</size=13></color>` |
| `phase.ts:696` | `  ` + 技能 `battle_report` 模板（`[atk_pet]`/`[def_pet]` 已替换） |
| `phase.ts:472` | `空过了本次行动，动弹不得！` |
| `phase.ts:477` | `主动更换出战精灵为<color=…>【{名}】</color>` |
| `phase.ts:481` | `逃跑了，战斗结束！` |

⚠️ **两处容易踩的**：
- 措辞是**繁体**（`對…點傷害`）—— **不是** E7 §3.3 里那段**示意性**的简体样例（`对【变异蘑菇】造成了 128 点伤害`）。**以本表为准**。
- `atkColor` = 我方 `#ffbb33` / 敌方 `#ff0080`；`defColor` 取反（`phase.ts:660-661`）。

### 3.2 文本 → 动作 的映射（`clipActions`，`game/app/scenes/rbattleScene.js:110-133`）

```
新行（= reports 的新增行；遇到缩短就按"未见过的行"重算）
  ├ 含「登场了」                  → 跳过（登场由 stage.present 播，不进回合序列）
  ├ 匹配 /【([^】]+)】激活了专属动作/ → {side, kind:'super'}
  ├ 匹配 /【([^】]+)】使用了/        → {side, kind:'attack'}
  ├ 含「造成了」且 /對【([^】]+)】/  → {side, kind:'hit'}
  └ 末尾按**状态数值**补：hp<=0 ⇒ ko；isOver ⇒ victory
```

- `side` 由**名字比对**（`driver.myPet()?.name` / `opPet()?.name`）判定 ⇒ ⚠️ **同名宠会误判**（**SPC3**）。
- `stripTags` 先剥 `<color=…>`/`<size=…>`（同名大小写不一致时也照剥）。

### 3.3 靠文本**拿不到**的三件（必须承认）

| 拿不到 | 上游有（E7 §2.3） | 我们今天的替代 |
|---|---|---|
| **暴击**（`IsCritical`） | `DamageInfo.IsCritical` | 只能读文本里的「打出了致命一击」—— 但它**只在命中且暴击时**才写 ⇒ 能从文本判出来（**近似可判**） |
| **属性相克**（`ElementRelation`） | `DamageInfo.ElementRelation` | ❌ **拿不到**（文本文案里没有相克信息） |
| **连击逐段**（`ComboDamageInfoList`） | `DamageInfo.ComboDamageInfoList` | ❌ **拿不到**（内核出口也没有，§3.3 之外还有 §2.3 的围栏） |

---

## 4. 我们的现状（**实测** · 2026-10-17）

| 面 | 现状 | 证据 |
|---|---|---|
| **飘伤害字 / 治疗字** | ❌ **完全没有**。舞台只播 clip + 降级提示（`.rb-stage-note` 仅用于"无 Ruffle / 素材缺失"） | `game/app/view/battle/restartFighterStage.js:88/95/100/121` |
| **连击段拆分** | ❌ 未落（且内核无数据） | `game/core/**` 无 `GetEvenComboDamageInfoList` 等价物 |
| **按类型拆** | 🟡 **只以战报文本形式**出现（内核已把四类片段写进 `reports`，`#ed780e`/`#ff8cff` 逐字照搬上游） | `phase.ts:684/690` |
| **战报文本面板** | ✅ 已落（U2 批 B5）：`.rbb-record` 默认收起，展开行序 == `driver.reports()` | `docs/view/ui-handoff.md` U2 行 |
| **动作序列反推** | ✅ 已落：`clipActions`（词表匹配，非正则万能） | `rbattleScene.js:110-133` |
| **结构化伤害出口** | ❌ 表现层**够不到**：`game/app/**` 里 `damageDict` / `getTypeDamage` / `totalSkillDamage` **零命中** | `grep` 实测 |
| **治疗** | ❌ 内核**算**但**不报**（`phase.ts:584-588` 有聚合、无战报行） | 同上 |

> **一句话现状**：**"拆分"今天只活在战报文本里**；飘字/连击段/治疗数字**三样都没有**。

---

## 5. 目标形状

### 5.1 落点（建议）

| 落点 | 内容 | 纪律 |
|---|---|---|
| `game/app/view/battle/splitText.js`（**新增**，名待定） | **文本 → 结构化片段**的解析：`parseDamageLine(text) → {total, types:[{key,value}], isCrit, isHit, names}` | 纯解析 + 纯算数（**不碰 DOM**） |
| `game/app/view/battle/combo.js`（**新增**，名待定） | `evenComboSplit(total, sourceCount, critFlags)`（§2.3 的四要点） | 纯算数 |
| `game/app/view/battle/…`（飘字层） | 把片段画到舞台（**新面**；B4 只管 clip） | 逐区复刻，零规则 |
| `clipActions`（现有） | 保持；但**措辞常量**改为从**一处**导出（与 §3.1 表同源） | 防"改措辞静默掉动作" |

### 5.2 两条轴的目标口径（**别混**）

- **轴 ①（类型）**：**数据已经在**（战报文本）⇒ 只需**解析 + 着色**（`#ed780e` / `#ff8cff` 照搬）。
- **轴 ②（连击段）**：**数据不在** ⇒ 两条路（**SPQ1**）：
  1. **不做**（保持"只显示总伤害"）；
  2. **提保真度** ⇒ 走 §5.3 的**唯一合规路径**（相位多写结构化字段），**不是**在 View 里重算连击。

### 5.3 保真度提升的**唯一合规路径**（E7 §3.3 的显式结论）

> 若将来要提保真度，**唯一不违规的路径**是让**相位**推进时**多写结构化战报字段**（内核侧）；
> **不是**在 View 层加重正则。

⇒ 本份**同意并引用**该结论，并把它落成 **SP1**（不变量）。

---

## 6. 不变量（**SP1–SP8** · 破了即 bug）

1. **SP1 · 提保真度只能从内核加字段。** 不许在 View 层"加重正则"去猜 `IsCritical`/`ElementRelation`/连击段（E7 §3.3）。
2. **SP2 · 本层不重算数值。** 伤害/治疗**数值**一律来自内核产出（今天 = 战报文本；将来 = 结构化字段）；View **只做拆分显示**。
3. **SP3 · 措辞是契约。** §3.1 的逐字模板是**跨层契约**（内核产 / View 反推）⇒ 改措辞必须**同时**改本表与 `clipActions`；**不许**只改一边。
4. **SP4 · 反推要"宁可少，不可错"。** 匹配不上 ⇒ **不猜**（不加动作），靠**状态数值**兜底（hp<=0 ⇒ ko、isOver ⇒ victory）—— 这正是今天的做法。
5. **SP5 · 颜色表两套不通用。** 战报色（`#ed780e`/`#ff8cff`，源 `AttackPhase.cs:175/188`）与 `HealInfo.TypeColor`（E7 §2.3）是**两张表**，别互相套用。
6. **SP6 · 拆分是"显示压缩"，不是"算账"。** 连击段拆分**不改**伤害总量（`Σ 段 = finalDamage`），也不回喂内核。
7. **SP7 · 捕获动画不纠正结果。** 动画源 = **技能表** `captureAnimType`；`result.isCapture` 另走保存侧（E6 §2.7）⇒ **不许**用后者改写前者。
8. **SP8 · 本层零存档、零场景切换。** 一切副作用归会话层/编排线。

---

## 7. 怪癖与脆弱点（**SPC1–SPC4**）

| # | 位置 | 症状 | 后果 / 目标 |
|---|---|---|---|
| **SPC1** | 内核战报**没有治疗行**（`phase.ts` 只有伤害行） | 上游有 `HealInfo` + 三色治疗聚合，我们**算得出、报不出** | 表现层**画不出治疗数字** ⇒ 要么**补一条内核战报行**（合规，SP1 同路），要么**承认不画**（**SPQ2**） |
| **SPC2** | 战报里 `固定/百分比/真实` **共用 `#ff8cff`**（`AttackPhase.cs:188` 原文如此） | 与"三色"直觉不符 | **照搬**（是上游原文，不是我们的 bug）；**别**"顺手改成三色" |
| **SPC3** | `clipActions` 用**名字比对**判 `side` | 双方**同名宠**（同种精灵）⇒ `sideOf` 恒取 `myName` ⇒ **动作挂错边** | 今天**已知**；修法应在**内核侧**给结构化行（含 side），**不在** View 加特判（SP1） |
| **SPC4** | `GetEvenComboDamageInfoList` 在 `sourceCount ≤ 1` 时返回 **`null`**（不是空表） | 调用方不判空就 NRE | 目标实现返回 `[]` 或显式 `null` **并写清**（照搬"≤1 不拆"的语义，**不照搬**"null/空表混用"的易错面） |

---

## 8. 待拍板（**SPQ1–SPQ3**）与人手测项

| # | 问题 | 事实 | 我的建议（不算结论） |
|---|---|---|---|
| **SPQ1** | **连击段拆做不做** | 数据不在我们内核（§3.3）；上游算法可复刻（§2.3） | **先不做**（只显示总伤害）；真要做 ⇒ 先按 §5.3 给内核加"连击段"结构化字段，再在其上做显示 |
| **SPQ2** | **治疗数字做不做** | 内核有聚合、无战报行（**SPC1**） | **要画就得内核补一行**（合规）；否则**承认不画**。建议：**先补内核战报行**（小、且解 SPC1） |
| **SPQ3** | **飘字层归属**（B4 加节 vs 新文档） | B4 已覆盖"舞台与动画"（clip），不含数值飘字 | **飘字归 B4 加一节**（同属"舞台上的东西"），**解析/算数**留在本份的两支纯函数里 |

**人手测项（`AGENTS.md §1.1`：主验收 = 人手测）**

| # | 场景 | 看哪里 | 期望 |
|---|---|---|---|
| 1 | **今天可测**：打一场，展开战斗记录 | `.rbb-record` 面板 | 伤害行**含** `【属性伤害】/【固定伤害】/…` 片段；总伤害与片段自洽 |
| 2 | **今天可测**：打一场（含连击宠） | 舞台 + 记录 | **只有总伤害**、**无分段数字**（当前诚实口径） |
| 3 | **今天可测**：打一场治疗 | 舞台 | **无治疗数字**（SPC1 的现状） |
| 4 | 落地后：飘字 | 舞台 | 类型片段按 `#ed780e`/`#ff8cff` 显示 |

---

## 9. 子地图与施工批 + 指针

**子设计**：**不拆**（本份就是那一份；两支纯函数 + 一个飘字节）。
**配对 impl**：并入 `docs/view/scene/battle/view-scene-battle-impl.md`（**不另立** impl 文件 —— 体量不足；若将来飘字层长大再拆）。

| 批 | 内容 | 依赖 |
|---|---|---|
| **SPB1** | `parseDamageLine`（§3.1 表 → 结构化片段）+ 措辞常量**单点导出** | 无（数据已在文本里） |
| **SPB2** | `evenComboSplit`（§2.3 四要点，**先不接显示**） | 无 |
| **SPB3** | 飘字层（B4 加节）+ 着色（SP5 两套表分开） | SPB1；B4 |
| **SPB4** | 治疗：**内核**补战报行（SPQ2 若拍"做"）→ 再接飘字 | 内核改正；E7 §3.1 C 层 |

**本份成文后要改的指针（3 处 + 1 处）**：

| 位置 | 现状 | 改为 |
|---|---|---|
| `docs/engine/battle-engine-views.md:154` | "View 侧正本 `docs/view/battle-split.md` **尚未成文** ⇒ 今天本份 §2.3 就是唯一真值源" | "正本 = `docs/view/battle-split.md §2.3`；本份保留**上游真值**的如实记录" |
| `docs/engine/battle-engine-views.md:254` | "算法正本今天在本份 §2.3（View 侧 `…battle-split.md` 待写）" | "算法正本 = `docs/view/battle-split.md §2.3`" |
| `docs/engine/battle-engine-views.md:368` | "`GetEvenComboDamageInfoList` ⬜ 未落（…正本见本份 §2.3，View 侧正本待写…）" | "…正本 = `docs/view/battle-split.md §2.3`；**落地批 = SPB2**" |
| `docs/arch-docs.md §8` | 列在"已被引用但尚未成文" | **移出**该清单（已成文 2026-10-17） |
