# C3·指引 实现计划与 as-built（`guide-impl.md`）

> **文档类别**：**impl**（落地计划 + as-built；配对 design = **`docs/view/panel/guide/guide-design.md`**（GD1–GD10 / GDQ1–GDQ3）；证据底座 = **`docs/view/panel/guide/restart-guide-panel.md`**（A1–A14））。
> **状态**：✅ 已写 + **已落码（2026-10-20）**，as-built 见 §7；**等人类手测**（§8）。
> **编号纪律**：施工批 **GD-a…GD-f**、偏差 **GDD1–GDDn**（本份局部编号，**不是**人类决议 ①–⑨）。
> **验收口径**（决议 ⑦）：本份不发测试脚本；验收 = 人类把游戏跑起来按 §8 清单手测；静态自检（构建 / 语法 / 分层 grep / 素材可达）见 §5 与 §7 末，**不替代**手测。

---

## 1. 范围

疑难指引面板闭环（design §0）：HUD「指引」钮 ⇒ 570×400「疑难指引」窗（属性攻击 / 属性防守 / 性格查询三页 + 新手指引诚实提示）+ 23×23 查表 + 55 性格查表。
**不做**：`Noob` 面板本体（另一条线）、上游死翻页、关系图 / 25 格死 UI、任何存档写入、像素级美术。

## 2. 文件落位与施工批

| 批 | 文件 | 内容 |
|---|---|---|
| **GD-a L0 查表** | `game/core/pet/element.ts` | `getAttackRelation`（`:80`，遍历 23 防守方取表列 `[防][攻]`）+ `getDefenseRelation`（`:90`，筛表行 `[防]`），逐字对位 `PetElementSystem.cs:177-194` |
| | `game/core/pet/status.ts` | `getPersonalityBuffDescription`（`:240`，增量 >0/<0 分列、中文列名按列序拼接；`平衡发展` 兜底）对位 `Status.cs:363-377` |
| | `game/core/**/*.js` | `node tools/build-core.mjs` 重生成（73 个 `.ts` → `.js`，2026-10-20） |
| **GD-b L2 出口** | `game/app/content.js` | `elementRelationLists(id, mode)`（`:164`，返回 `{weak,resist,zero}` 三 id 数组）；`ELEMENT_COUNT`（`:174`，= `ELEMENT_NUM`）；`PERSONALITY_STAT_NAMES`（`:177`，前 5 列）；`personalityRows()`（`:189`，55 行 `{id,name,cells:[{text,tone}]}`）；`personalityBuffDescription`（`:201`，默认空格分隔）。性格名由 `PERSONALITY`（`basic.ts`）反查，不手写第二张表 |
| **GD-c 面板视图** | `game/app/view/guide/guidePanel.js` | L3/L4 DOM 纯视图：`buildGuidePanel(ctx)` → `{ render }`；`ctx={root,onClose,onNoob}`；窗 / 标题线 / Esc / 4 页签 + 游标 / 属性页（23 格 + 三关系区滚动）/ 性格页（55 行 + 表头 + 底部说明）；`COPY` 两套模式文案（`:19-22`） |
| | `game/app/view/guide/index.js` | `create(container, opts)` → `{update, destroy}`（同 godpet/spt/index 形状） |
| **GD-d 样式** | `game/app/ui.css` | `rb-guide-*` 段（`:1071-1162`）：570×400 窗 / 标题线 / 页签游标 / 23 格 / 关系区 3 列滚动 + 细滚动条 / 55 行列表 + 表头 + 说明条 |
| **GD-e 接线** | `game/app/view/hud/restartHudView.js` | `guide` MENU 行加 `handler:'onGuide'`（`:82`，盒 `[665,505,30,25]` 不动；「面板待建」title 自动消失） |
| | `game/app/scenes/mapScene.js` | `import * as GUIDE`（`:43`）；`GUIDE_PANEL` 单例（`:200`）；HUD `onGuide`（`:269`）；`openRestartGuide()`（`:453-465`，单例守卫 + Noob 诚实提示）；`handlePanelLink` 的 `GuideLine` 分支（`:488`）；NPC openPanel `/GuideLine/` 分支（`:1285`）；`unmount` 作废（`:1960`） |
| **GD-f 收尾** | 文档 | 本份 + `docs/status.md` / `docs/view/view-design.md` / `docs/view/scene/room/view-scene-hud-impl.md` / `docs/arch-docs.md` 台账同步 |

**零新 L1、零新裸依赖**：新文件全相对 import；`game/index.html` import map **不需增项**。

## 3. 行为规格（对位 design §3）

1. **开/关**：`guide` 钮 ⇒ `openRestartGuide()`；已开 ⇒ `GUIDE_PANEL.update()`（页面状态保持，不叠层）；Esc 图 / 遮罩 ⇒ `onClose` 清引用 + `api.close()`；不改 URL、不进历史、不监听全局 Esc 键。
2. **默认页**：属性攻击（`showPage(0)`，对位 `defaultSelect:1 ⇒ Select(0)`）。
3. **页签**：`属性攻击/属性防守/性格查询` 三颗可切；游标 `left = 120 + page×120`；「新手指引」= 第 0 颗、不参与游标；点它 ⇒ `onNoob` ⇒ `openHintbox` 诚实提示，**本面板保持打开**。
4. **属性页**：23 格行主序；点击 ⇒ 选中描边 + 抬头图标/名称（名称补「系」）+ 三区重填。
5. **关系区**：区标题带数量（`克制 22` 等）；槽区 3 列 36×36 滚动（无效区 1 列）；空区显示 `—`；`精灵王` 的 22 / 21 项全部可达。
6. **脚注**：攻击「克制表示伤害2倍  微弱表示伤害0.5倍」；防守「被克制表示受到伤害2倍  被微弱表示受到伤害0.5倍」。
7. **性格页**：55 行；表头 `性格 | 物攻 | 特攻 | 物防 | 特防 | 速度`；格值 `+10%`（绿）/ `-10%`（红）/ `-`（灰）；点行高亮 + 底部 `getPersonalityBuffDescription`（默认选中 0 实干 = 「平衡发展」）；不画体力列、关系图、25 格表。
8. **零写盘**：全面板无 `save` / `consume` / `addItem` / session 字段读写。

**纪律核对**：`game/app/view/guide/` 仅相对 import（`../panels/battle/_kit.js`、`../../content.js`、`./guidePanel.js`），**零 import `game/logic/**` / `session`**（grep 实测 0 命中）；游戏数值全由 L0/L2 给，视图只排 DOM（GD10-b）；`#rv` DOM 层 ⇒ SWF/JS 两路画面不受影响。

## 4. 不做清单（防"顺手实现"）

`Noob` 面板（`NoobController` 四步进度 + `Player.IsNoob()`）；上游 Prev/Next 死翻页与 `151.png`；关系区 12/12/1 截断；性格页 `Table`（25 格无绑定）/ `Relation`（35/55 缺图）/ `Note` 死块；`Personality Cell` 的 Hp 列；任何存档写入；像素级正式排版。

## 5. 数据验证（构建期，非验收）

- **23 属性图标** `Assets/Resources/Sprites/Game/Elements/0..22.png` **23/23 在盘**（目录实测；另有 23–25 三张上游未用图，不路由）。
- 标题线 `Panels/ItemShop/Sprites/title line.png`、Esc `Sprites/Game/Hint Box/Green Esc.png`、页签游标 `Panels/OldPetBag/Sprites/269.png` **均在盘**（实测）。
- 23×23 表 / 55 性格：仓库 `element.ts`、`basic.ts`、`status.ts` 已有；本批只补两个派生函数，无新表。
- `activities.json` 的 `GuideLine` linkId = **0 条**（报告 §7）⇒ `handlePanelLink` 分支是防御性接线，正常数据流只有 HUD 钮。
- `node tools/build-core.mjs` 重生成通过（73 个 `.ts` → `.js`）。

## 6. 手测前置

无新表、无迁移。打开 `#/map?slot=0&…`（SWF 注明图或 JS 回退图均可，面板是 `#rv` 常驻 DOM 层）。可选调试准备：无需改存档；性格页/属性页数据都是只读静态表。

## 7. as-built（GD-a…GD-f · 2026-10-20）

- 落位与 §2 计划**一致**，**零未落项**；相对计划新增 1 个 L2 常量（`ELEMENT_COUNT`，见 GDD6）。
- 静态自检（编译级，不构成验收，决议 ⑦）：`node --input-type=module --check` 通过（`guidePanel.js` / `index.js` / `mapScene.js` / `content.js`）；`game/app/view/guide/` 分层 grep `from '..*logic/` 与 `session` **零命中**；新文件仅相对 import；素材路径逐条 `test -f` 在盘。

| # | as-built（实现实况，与计划的差异如实登记） |
|---|---|
| **GDD1** | **选中属性抬头挪位**：上游图标 x=400 与属性格第 5 列（x=384..424）交叠（预制摆位事实，报告 §3 注）。目标版把抬头放到页内 `left 240 / top 10`（= 关系区左缘正上方），图标 40 + 名称右排，消除交叠；属"人眼校常量"族（`AGENTS.md §4.10`），偏了回改 CSS/常量，不动数据。 |
| **GDD2** | **关系区滚动 + 数量标题**（design GD7）：区尺寸保持预制 120/120/50×190；内部槽区高 166、`overflow-y:auto`、3 列 36×36（图标 30）、无效区 1 列。`精灵王` 攻击克制 22、防守被微弱 21 全部可达；数量 = 数组长度，视图零游戏算术。 |
| **GDD3** | **性格页布局微调**：上游 `List [220,180,520,280]` / `Scroll View [227,220,510,230]`。目标版在页内加固定表头（`top 10, h26`）与底部说明条（`top 268, h26`），列表视口取 `top 42 / h 222`；列宽 `100 + 82×5 = 510` 全在视口内（修 A11）。上游 `Note` 块本就 `m_IsActive:0`，故不冲突。 |
| **GDD4** | **属性名带「系」**：`headName.textContent = elementNameOf(id) + '系'`（如「普通系」）。上游运行期 `SetText(GetElementName())` 丢「系」（报告 A7），本面板取预制占位的可读目标；仅显示层差异。 |
| **GDD5** | **默认选中 = 0**：属性页默认普通（预制占位「普通系」）；性格页默认 0 实干（说明条即显示「平衡发展」）。上游性格页无可见选中反馈，此举是 GDQ3 目标的一部分。 |
| **GDD6** | **`ELEMENT_COUNT` 走 L2**：视图画 23 格不硬编 23，`content.js` 由 `ELEMENT_NUM` 透出（`:174`）；性格列名由 `STATUS_TYPE_NAMES_CN.slice(0,5)` 透出，均不写第二张表。 |
| **GDD7** | **Noob 不关本面板**：上游 `Noob` 页签绑 `Module.OpenPanel("Noob") + Panel.ClosePanel`（报告 A13）。本批目标面板不存在 ⇒ `onNoob` 弹 `openHintbox` 诚实提示，**不调 `onClose`**（design GD3/GDQ1 的明确选择）。 |
| **GDD8** | **不画死翻页**：未使用 `Panels/OldPetBag/Sprites/151.png`（在盘但上游 `lastPage=0`、两键不可交互、页码未绑，报告 A4）；属性页只有 23 格一屏。 |
| **GDD9** | **`update()` 为页面态保持**：数据全是静态表，面板重开由宿主 `openPanel` 同名去重重建；`update()` 只 `showPage(pageIndex)`。无写盘、无重读。 |
| **GDD10** | **NPC 第二入口是防御接线**：`handlePanelLink` 与 NPC openPanel 都加 `GuideLine` 分支；发行数据 `activities.json` 无 `GuideLine`，故正常手测只走 HUD 钮。分支不伪造面板、不弹错误。 |
| **GDD11** | **人测反馈修正（2026-10-20）**：首版三颗可切页签只建了 DOM + 位置、**漏绑 `click → showPage(i)`** ⇒ 点「属性防守 / 性格查询」无反应（Noob 钮与关闭/遮罩不受影响）。已补监听并重跑 `--check`；`showPage` 为函数声明、提升可见，监听可安全前置。此条属实现遗漏、不是设计变更。 |

## 8. 请人测（= design §5；交付时随回复同发）

1. **开面板**：进 `#/map`，点底栏「指引」⇒ 弹出 570×400「疑难指引」窗（不是全屏），标题青色、右上 Esc；默认停在「属性攻击」，游标在「属性攻击」页签下；点遮罩或 Esc 能关；关掉再开不残留。
2. **切页**：依次点「属性防守」「性格查询」「属性攻击」⇒ 内容互换、游标跟到对应页签；「新手指引」⇒ 弹提示「新手指引面板（Noob）待建」，**疑难指引仍在**（不消失、页签不变）。
3. **攻击页**：点「草系」⇒ 克制区/微弱区/无效区与 23×23 表一致（可对照 `game/core/pet/element.ts` 的草行）；点「普通系」⇒ 三区都是 `0` 且槽区显示 `—`；点任意格有青色选中描边。
4. **精灵王不截断（关键）**：攻击页点「精灵王」⇒ 克制区标题显示 `22`，滚动能看全 22 个图标（上游会丢后 10 个）；防守页点「精灵王」⇒ 被微弱区标题显示 `21`，滚动能看全（上游丢后 9 个）。
5. **防守页语义**：三区标题是「被克制 / 被微弱 / 被无效」，脚注是「被克制表示受到伤害2倍  被微弱表示受到伤害0.5倍」（不是攻击页原句）。
6. **性格页**：55 行（从实干到可爱），表头「性格/物攻/特攻/物防/特防/速度」；数字显示 `+10%`（绿）/ `-10%`（红）/ `-`；默认第 0 行高亮、底部写「平衡发展」；点「固执」⇒ 行高亮、底部写「物攻+10% 特攻-10%」；滚到底能看到第 54 行「可爱」。
7. **缺图不伪造**：正常 23/23 属性图标、标题线、Esc、游标都在盘，不应出现虚线占位；若出现，说明素材路由断了（面板不会拿别的图冒充）。
8. **零写盘**：开/切页/点属性/点性格/关面板后，存档文件的修改时间不变（或日志无保存动作）；本面板没有任何领取/购买钮。
9. **两路画面一致**：在 `SWF_ANNOTATED_IDS` 注明图（如 100）与 JS 回退图各开一次「指引」⇒ 行为一致（面板是 DOM 常驻层，与地图画面通路无关）；离开地图再回来，面板可重新打开、无残留层。
10. **第二入口（防御接线，可选）**：若有 NPC 的 `openPanel` 指向 `GuideLine`，点该 NPC 应开同一面板；`activities.json` 里没有 `GuideLine` 活动，所以活动面板不会出现该入口。
