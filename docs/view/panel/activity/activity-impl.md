# C4·活动 实现计划与 as-built（`activity-impl.md`）

> **文档类别**：**impl**（落地计划 + as-built；配对 design = **`docs/view/panel/activity/activity-design.md`**（ACQ1–4 人类 2026-10-19 已拍板）；证据底座 = **`docs/view/panel/activity/restart-activity-panel.md`**）。
> **状态**：✅ 已写 + **已落码（2026-10-19）**，as-built 见 §7；**等人类手测**（§8）。
> **编号纪律**：施工批 **AC-a…AC-e**、偏差 **ACD1–ACDn**（本份局部编号，**不是**人类决议 ①–⑨）。
> **验收口径**（决议 ⑦）：本份不发测试脚本；验收 = 人类把游戏跑起来按 §8 清单手测；静态自检（`--check`/分层 grep/生成器门禁）见 §7 末，**不替代**手测。

---

## 1. 范围

活动面板闭环（design §0）：HUD「活动」钮 ⇒ 面板（`!hide` 列表 / 每页 9 / 名字搜索 / 详情五件 / 去参加三分类）+ `activities.json` 生成通道 + 商店限购收编进 `"shop"` 袋落盘。
**不做**：六个未建终点面板（只 logLine）、`mod_home` 覆盖位（ACQ3）、每日重置/版本迁移/NewsPanel（报告 A9）、`[k=v]` 参数承接（报告 A7，剥参直开）、像素级美术。

## 2. 文件落位与施工批

| 批 | 文件 | 内容 |
|---|---|---|
| **AC-a 数据通道** | `tools/build-unity-data.mjs` | 解析 `Activities/info.csv`（`DATA_COL=10` stride）⇒ `emit('activities.json')`；`activityType` 词表（`none/resident/daily → 0/1/2`）进 `ENUM_KINDS`；`KNOWN_SILENT_FALLBACK` 记 `'activityType:resdient': 1`（报告 A2）；manifest 记 stride、counts 记 `activities` |
| | `game/data/unity/activities.json` | 生成物：135 条原样全收（ACQ4），勿手改 |
| **AC-b 数据口** | `game/app/content.js` | `R.activities/activityById` 入 boot；getter `restartAllActivities()` / `restartActivityOf(id)`（`:211-212`） |
| **AC-c 限购收编** | `game/app/session.js` | `shopFromData`（`:171-180`，袋→`state.shop.bought` 投影）+ `writeShopToData`（`:181-190`，账→袋、`String()` 化、只碰 `'shop'` 袋）；`stateFromData` 挂 `shop:`（`:224`）；`mergeBack` 末尾回写（`:316`）；**`game/logic/item/shop.js` 一行不改** |
| **AC-d 面板** | `game/app/view/activity/activityPanel.js` | L3 DOM 纯视图：`buildActivityPanel(ctx)` → `{ render }`；ctx = `{ root, onClose, onLink(info) }`；搜索/分页（`PAGE_SIZE=9`，`:10`）/选中回落/详情五件/去参加钮（none ⇒ disabled） |
| | `game/app/view/activity/index.js` | `create(container, opts)` 装配口（同 shop/worldmap 口径） |
| | `game/app/ui.css` | `rb-act-*` 段（`:633-670`）：720×470@120,36、深蓝系同 shop/wmap、遮罩复用 `rb-scrim` |
| **AC-e 接线** | `game/app/view/hud/restartHudView.js` | `event` 钮 `handler:'onEvent'`（`:63`，box `[165,499.5,42,36]` = 上游 Event 钮 42×36 同尺寸） |
| | `game/app/scenes/mapScene.js` | `onEvent: openRestartActivity`（`:255`）；`openRestartActivity` 单例守卫 + `openPanel('rb-activity')`（`:302-311`）；**`handlePanelLink`** 三分类 + `ACT_UNBUILT` 名单（`:311-331`；⚠️ **2026-10-19 图鉴 DX-d**：该函数由 `handleActivityLink` 提升为**活动 + 图鉴共用**，日志文案改中性，正本 = `docs/view/panel/dex/dex-impl.md §4.3`）；NPC `openPanel` intent 兜 `Activity`（`:1065`）；teardown 作废 `ACTIVITY_PANEL`（`:1715`） |

## 3. 行为规格（对位 design §3）

1. **开/关**：`event` 钮 ⇒ `openRestartActivity()`；已开 ⇒ `ACTIVITY_PANEL.update()` 重绘不叠层；✕/遮罩 ⇒ `onClose` 清引用 + `api.close()`；不改 URL、不进历史。
2. **列表**：`restartAllActivities().filter(!x.hide)`（99 条）；行 = 名 + 角标（`typeId` 2⇒每日 / 1⇒常驻 / 其余 `—`）；搜索 `name.includes(query)` 即时、页归 0；每页 9、`‹n/m›` 到界置灰。
3. **详情**：`restartActivityOf(sel)` ⇒ 背景 `bgUrl(resId)`（数字 ⇒ `Resources/Activities/<resId>.png`，否则 `Resources/<resId>.png`；`mountImg` 缺图自陈 `asset-missing`）· 名 · `time · releaseDate` · 说明（空 ⇒「（无说明）」）· 奖励 ≤3 `rewardChip`（`none` 跳、数值 ⇒ `restartItemNameOf`、其余原样）。
4. **去参加**：`linkId none/空` ⇒ disabled；否则 `onLink(info)` ⇒ 面板先关，L4 **`handlePanelLink`**（2026-10-19 由 `handleActivityLink` 改名，与图鉴共用）：剥 `[..]` ⇒ 纯数字（含负）⇒ `runTeleport(Number)`（同一台决议机）；`PetBag/WorldMap/ItemShop` ⇒ 直开；`ACT_UNBUILT` 八名（补了 `Fusion`/`Mission`）⇒ `logLine('跳转终点面板待建: …')`；其余 ⇒ `logLine('未识别的跳转: …')`。
5. **限购**：买限购品 ⇒ `shop.js` 记 `state.shop.bought`（原逻辑）⇒ 落盘时 `writeShopToData` 把账写进 `activityStorage['shop']`（`value` 字符串、只留 `>0`）⇒ 读档 `shopFromData` 投影回账 ⇒ `remaining` 跨档成立。

**纪律核对**：视图件不 import `game/logic/**`（`grep "from '..*logic/" game/app/view/` 零命中，实测于 §7）；面板零算术；跳转只经既有 `runTeleport`/`openPanel` sink，不旁路 `gotoMap`/`location.hash`；`#rv` DOM 层 ⇒ SWF/JS 两路画面逐字节不变（AC8）。

## 4. 不做清单（防"顺手实现"）

每日重置 `DailyLogin` / 版本迁移 `VersionUpdate` / `CheckDailyLogin`+NewsPanel（报告 A9）；`Find` 建档副作用照搬（A1）；`[expr]` 写侧求值（本线无写方需求，MB6 另账）；`SetPanelIdentifier` 参数（A7）；A 组六面板；`mod_home` 覆盖位（ACQ3）。

## 5. 数据验证（构建期，非验收）

生成器门禁全过：`Activities/info` stride 余数 0、危险字符扫描、`activityType` 枚举 + `resdient` 配额恰好命中 1（多一条即红）；产物 **135 条 / hide 36 / 可见 99**；`11005` 行 `typeId=0`（复现上游降级，A2）；linkId 分桶 = 数字 94 / `none` 3 / 命名 38（`SignReward` 30 带参、`WorldMap` 2 带参…）。背景 135/135 盘上命中【报告 §6】。

## 6. 手测前置

无新裸依赖 ⇒ `game/index.html` import map **不需增项**（新文件全相对 import，实测 grep）；`activities.json` 已入库（生成物勿手改，重跑 `node tools/build-unity-data.mjs` 可再生物）。

## 7. as-built（AC-a…AC-e · 2026-10-19）

- 落位与 §2 计划**一致**，无增删文件。静态自检（编译级，不构成验收，决议 ⑦）：6 个改动/新建 `.js` 过 `node --input-type=module --check`；分层 grep 门禁 `from '..*logic/` 在 `game/app/view/` 零命中；新文件仅相对 import。
- **ACD1** 分页容量先按 10 落码，报告复核时查明上游真值 = **预制 `capacity: 9`**（`Panel.prefab:1880`，代码默认 4 是陷阱，报告 A3）⇒ 已改 `PAGE_SIZE = 9` 对齐。
- **ACD2** 奖励格 = **文本 chip**（数值→道具名、路径/字面原样），非图标 —— 技能格先例"美术未搬"同口径；上游 `ItemInfo.GetIcon` 的图标路由留正式美术批。
- **ACD3** `handlePanelLink`（旧名 `handleActivityLink`）对 `ItemShop` 直开**我们的**商店面板（上游 `Panel.Link("ItemShop")` 开上游商店；我们只有已落码的 `rb-shop`）—— 终点等价、面板不同源。
- **ACD4** `[k=v]` 参数**剥掉直开**：`WorldMap[world=1]` 开在"当前图所属世界"默认页（非恒页 1）、`SignReward[activity=2406]` 落在未建名单只 logLine。**登记为待细化**（上游经 `SetPanelIdentifier` 承接，报告 A7），不是死账。
- **ACD5** 限购袋写入 `value` 一律 `String()` 且只留 `>0` 条目（地图线 `setActivity` schema 同口径，防 `SAVE_INVALID`）；`writeShopToData` 只重写/新建 `'shop'` 一只袋，其余袋（地图线写的 `door`/`noob`… 若有）逐字节不动。
- **ACD6** 面板 `#rv` DOM 常驻层：teardown（离场）时 `#wrap.innerHTML` 清空连带面板，`ACTIVITY_PANEL` 引用同步置 null（`:1715`）。

## 8. 请人测（= design §6；交付时随回复同发）

1. **开面板**：`#/map?slot=0&…` 点 HUD 底栏「活动」钮 ⇒ 面板弹出，列表分页恰好 **11 页**（99 条可见 ÷ 每页 9）；**hide 的 36 条不列** —— 搜"熟悉精灵"应**无结果**（`noob_tutor_1` 上游 hide=true），"每日登入"应在册；
2. **搜索**：输入"火山"之类 ⇒ 列表即时收窄、页归 0；清空还原；无匹配 ⇒ "无匹配活动"；
3. **详情**：点任一活动 ⇒ 右侧背景图（多数是地图背景 PNG）、名、时间、说明、奖励文本格；个别行背景可能自陈缺图（灰框留痕、**不应**出现别的图冒充）；
4. **去参加 · 传送**：选数字 `linkId` 的可见活动 —— 如「挖矿」(⇒40)、「梦境」(⇒**-131 夜图**，报告 A6) ⇒ 面板关、换图到出生点；
5. **去参加 · 面板**：「新世界」/「尼尔家族」（`WorldMap[world=1]`）⇒ 关面板后开**世界地图面板**（`[world=1]` 参数被忽略、开在当前图所属页 = ACD4）。**注**：`PetBag` 支路**暂无可见行可测**（全表唯一 `PetBag` 行 = hide 的 `noob_tutor_1`）—— 代码路在、人手测不到，如实登记；
6. **去参加 · 未建终点**：「新手指引」(Noob)、「每日登入」(Mailbox)、「九月签到」(SignReward[activity=2609]) ⇒ 关面板 + 日志行"活动跳转终点面板待建: …"（不崩、不静默）。**注**：`linkId=none` 的三行（`mod_home/shop/twelve_round`）**全是 hide** ⇒ disabled"此活动无入口"态**面板内人手测不到**，同 ACD 口径如实登记；
7. **限购落盘**：进商店买一件**限购**商品 ⇒ 关游戏重开同存档 ⇒ 背包/商店里该商品**已购数不归零**（余量正确）；
8. **小屋图（对照 ACQ3）**：进 `50000` 小屋图 ⇒ 传送**不**受 `mod_home` 覆盖位影响（预期行为 = 仍不接）；
9. 翻页到首/末页按钮变灰、✕ 与遮罩关闭后**无残留层**、可重复开；SWF 注明图（如 `100`）与 JS 回退图各点一遍活动钮，行为一致。
