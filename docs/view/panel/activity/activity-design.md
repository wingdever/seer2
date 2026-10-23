# C4·活动 设计：活动面板（列表/详情/去参加）+ 数据表 + 限购收编

> **文档类别**：**design**（目标行为真值；`docs/arch-docs.md §1/§2`）。
> **线/族**：View 线 **C4 社交信息族**首份 = **Activity**（人类 2026-10-19 点名"实现活动面板" ⇒ 活动自 `docs/architecture.md §1.1` A 组移出、立成本份；围栏正本 = `AGENTS.md §4.1` 第 1 条注记；同族 `Mailbox/News/PlayerInfo/SignReward/Noob` 仍 ⬜）。
> **需求源**：人类 2026-10-19 "实现活动面板" + 同日四项拍板（本份 §8 **ACQ1–ACQ4**，**不是**全局决议 ①–⑨）。
> **父 / 邻**：证据底座 = **`docs/view/panel/activity/restart-activity-panel.md`**（下称**报告**，A1–A11 在那份 §7）；面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**（`openPanel` 同名去重）；传送语义 = **M5 `docs/map/map-teleport.md`**（"去参加"数字分支 = 与光口/NPC/世界地图**同一台** `resolve→run` 机）；商店消费端 = **`docs/view/panel/shop/shop-impl.md`**（`remaining` 读 `state.shop.bought`）；存档袋 = Save 线 `activityStorage`（地图线已透传落盘）。
> **路径口径**：上游相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **证据标注**：【报告】= 报告实测；【源码】/【样本】直引；【设计】= 本份定的目标。
> **编号纪律**：本份本地 = 不变量 **AC1–ACn** / 已拍板 **ACQ1–ACQ4** —— **不是**人类决议 ①–⑨（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design；本线为人类点名开工的特例，代码与 impl **同批**落地，as-built = `activity-impl.md §7`），**待人类评审**。

---

## 0. 一句话目标

**在 `#/map` 点 HUD 底栏"活动"钮 ⇒ 弹自绘最小活动面板：列 `!hide` 的 99 条活动（每页 9、名字搜索）⇒ 右详情（背景/名/time/说明/3 奖励文本格）⇒「去参加」按 `linkId` 三分类走已落码通路（数字 → `runTeleport`；已建面板直开；未建如实 log）；同时把商店限购的内存账收编进存档 `activityStorage` 的 `"shop"` 袋。**

## 1. 范围与边界（= ACQ1 的展开）

| 归本份 | 不归本份 | 支点 |
|---|---|---|
| 面板形状/数据表/搜索分页/详情/去参加 的目标行为 | **未落码终点面板**：`Noob/SignReward/Mailbox/SPTBoss/SoulPet/Workshop`（点了只 logLine，各面板归自己未来的线） | 报告 §4；A 组围栏仍在（`AGENTS.md §4.1`） |
| `activities.json` 生成通道 + `content.js` 读数口 | 面板**像素级美术**（上游预制框/字体/排版复刻） | §4.11/§4.12 先例：自绘最小 UI |
| "去参加"数字分支 → **既有 `runTeleport` 决议链** | `mod_home` 的 `map_id=50000` **覆盖位**（TPC6/TPQ3） | **ACQ3：仍不接**；M5 决议不变，只在报告 A10 记账 |
| 商店限购 `state.shop.bought` ⇄ `"shop"` 袋收编（落盘） | 每日重置 `DailyLogin` / 版本迁移 `VersionUpdate` / `CheckDailyLogin`NewsPanel | 报告 A9；本线无每日状态消费方 |
| 奖励格 = **文本**（数值 → 道具名） | `[world=1]`/`[activity=2406]` 的 **SetPanelIdentifier 参数承接** | 报告 A7：本轮**剥参直开**，登记待细化 |
| | 活动图标 `Resources/Activities` 的 sprite 图集化、正式美术 | A 组口径 |

## 2. 上游真值摘要（细节不重复，见报告）

- 入口 = Map HUD `Event` 钮（42×36）→ `OpenPanel("Activity")`【报告 §1】；我方 `restartHudView.js` `event` 钮同尺寸、接 `onEvent`。
- 面板机 = `Init=!hide` 全表、`SelectModel` 预制容量 **9**/页、列表只列名字、详情五件、搜索 `name.Contains`【报告 §2】。
- 出路 = `Activity.Link → Panel.Link`：none 静默 / int（含负）传送 / 其余开面板并剥 `[k=v]`【报告 §4】。
- 键值袋 = `Activity(Find 即建档, GetData/SetData, [expr] 求值)`，商店限购是其中一个消费者【报告 §3/§5】。
- 数据 = CSV 135 行（99 可见）、背景 135/135 在盘、`resdient` 错字静默降 None【报告 §6/A2】。

## 3. 目标行为（真值）

### 3.1 面板生命周期（AC1）

1. **开**：`#/map` 内点 HUD `event` 钮 ⇒ `openPanel('rb-activity', …)`（宿主同名去重）；NPC/对话 `openPanel` intent 含 `Activity` ⇒ 同一入口。
2. **单例刷新**：面板已在 ⇒ 再点只 `update()` 重绘，不叠层。
3. **关**：✕ / 遮罩点击 ⇒ 销毁；"去参加"触发跳转时**面板先关再走**（同 WM/MB6"执行前撤浮层"口径）。
4. **栈纪律**：弹层**不改 URL、不进历史**；ESC 无全局键层（同 worldmap 已登记缺口，不私加）。
5. **零写状态**：开/关/翻页/搜索/选中**不产生落盘**；本线唯一写盘来源 = 限购收编（§3.4，经既有 `onWrite` 链，面板不直接碰）。

### 3.2 列表与筛选（AC2）

- 数据源 = `content.restartAllActivities()`（135 条全量，**ACQ4**）；面板入口先 `.filter(x => !x.hide)` —— 与上游 `ActivityPanel.cs:16` 同口径【报告 §2】。
- **每页 9**（上游预制真值 A3）；`‹/›` 翻页到界禁用、页码 `n / m`。
- 搜索 = **名字 `includes`**（对位 `name.Contains`，A4：不做类型/时间筛选）；输入即筛、页归 0。
- 选中项若被筛掉 ⇒ 回落到筛选结果首项（空结果 ⇒ 详情给提示、列表给"无匹配活动"）。
- 行 = 名字 + 类型角标（`typeId` 1 常驻 / 2 每日 / 其余 `—`，**None 含 `resdient` 错字行 = 复现降级**，A2）；**只有名字上列**（同上游 ListView）。

### 3.3 详情与去参加（AC3/AC4）

- 详情五件（对位 `ActivityContentView`）：背景图（`resId` 数字 → `Activities/<resId>.png`、否则 `Resources/<resId>.png`；**缺图 `mountImg` 自陈 asset-missing、不伪造**）· 名 · `time · releaseDate` · 说明 · 奖励 ≤3 文本格（`none` 不画；数值 token → 道具名，其余原样）。
- **去参加三分类**（面板只发 `{linkId}` 信号，路由在 L4 装配层，AC6）：
  1. `none`/空 ⇒ 按钮 disabled + 文案"此活动无入口"（**修 A5 静默**）；
  2. 纯数字（含负）⇒ `runTeleport(Number(linkId))` —— 与光口/NPC/世界地图**同一台**决议机（`decideTeleport` ⇒ 0=notOpen 提示、50000 覆盖位**不接** = ACQ3）；
  3. 命名面板 ⇒ `PetBag`/`WorldMap`/`ItemShop` 直开已落码面板；`Noob/SignReward/Mailbox/SPTBoss/SoulPet/Workshop` ⇒ `logLine('活动跳转终点面板待建: …')`；其余未识别 ⇒ logLine 如实。
  - `[k=v]` 参数段本轮**剥掉**（A7，登记待细化，不是死账）。

### 3.4 限购收编（AC5 · = ACQ2）

- **袋 = 唯一真源**：`session.data.activityStorage` 中 `id==='shop'` 的袋，`key=itemId 字符串、value=已购数字符串`（上游形状【报告 §5】）。
- **读**：`stateFromData` 把袋投影成 `state.shop.bought`（数值化、`≤0`/非数丢弃）⇒ `logic/item/shop.js` **一行不改**，`remaining` 自动跨档成立。
- **写**：`mergeBack` 把 `state.shop.bought` 写回袋（`String()` 化、`>0` 才留条目，与地图线 `setActivity` 的 schema 口径一致）⇒ 随既有 `onWrite` 落 XML。
- **围栏**：收编/投影**只碰 `'shop'` 一只袋**，地图线写的其他袋逐字节不动。
- 不做：上游 `Find` 建档副作用（A1，我们只在有账时建袋）、`[expr]` 写侧求值（本线无写 `[expr]` 的需求，地图线 MB6 另账）。

### 3.5 不变量

- **AC6 分层**：面板（L3 视图）**不 import** `game/logic/**`，只读 `content` 数据口；跳转/收编的**动作**全在 L4 装配点（`mapScene.js`/`session.js`）；面板零算术（只画内核/数据给的数）。
- **AC7 生成物纪律**：`activities.json` 只能由 `tools/build-unity-data.mjs` 再生成，**勿手改**；`resdient` 静默降级有构建期配额门禁（`KNOWN_SILENT_FALLBACK`）。
- **AC8 SWF 路不变**：面板是 `#rv` DOM 层，与 `swfOk` 两路画面无关；HUD 钮增改**不动** `MapRunner.as`/AS3。

## 4. 落点与分层（框；细节与 as-built 归 impl）

| 件 | 层 | 内容 |
|---|---|---|
| `tools/build-unity-data.mjs` → `game/data/unity/activities.json` | 生成 | 135 条原样全收（ACQ4）+ `activityType` 词表 + 门禁 |
| `game/app/content.js` | 数据口 | `restartAllActivities()` / `restartActivityOf(id)` |
| `game/app/view/activity/{activityPanel.js,index.js}` | L3/L4 | DOM 面板（AC2/AC3），ctx = `{ root, onClose, onLink }` |
| `game/app/scenes/mapScene.js` | L4 装配 | `onEvent → openRestartActivity`；**`handlePanelLink`**（AC4 三分类；2026-10-19 图鉴 DX-d 起 = 活动 + 图鉴**共用**的终点分派器，旧名 `handleActivityLink`）；NPC openPanel 兜 `Activity` |
| `game/app/session.js` | L4 状态 | `shopFromData`/`writeShopToData`（AC5，投影 ⇄ 袋） |
| `game/app/view/hud/restartHudView.js` + `game/app/ui.css` | L4 | `event` 钮动作接上 + `.rb-act-*` 最小样式 |

## 5. 怪癖处置回执（决议 ②：声明 + 不照搬；A2 按 V2 照搬行为）

| 报告 # | 本设计处置 |
|---|---|
| A1（Find 读即建档） | 不照搬：读纯函数；只在有已购账时建 `'shop'` 袋 |
| A2（`resdient` 静默降 None） | **行为照搬**（typeId=0）+ 构建期配额 1 钉死 |
| A3（页容量在预制） | 真值取预制 ⇒ 每页 9 |
| A4（只搜名字、FilterType 无人消费） | 照做（只名字搜索） |
| A5（none 静默） | 不照搬：disabled + 文案 |
| A6（负 mapId 直跳夜图） | 照做（`runTeleport` 同一台机） |
| A7（`[k=v]` 参数） | 本轮剥参直开；**登记待细化**（impl 偏差行） |
| A8（DateTime.Parse 无兜底） | 生成期已过全表；面板期只显字符串、零抛 |
| A9（DailyLogin/VersionUpdate/NewsPanel 钩子） | 不做（§1 边界）；限购袋非 Daily、不受影响 |
| A10（mod_home/覆盖位） | **ACQ3 = 仍不接**；若列表外显示 `mod_home` 背景，退盘上 PNG（其行 hide ⇒ 实际不上列） |
| A11（无时间过滤、手工 hide） | 照做（ACQ4 全收 + 面板只按 hide） |

## 6. 请人测（验收主口径 = 决议 ⑦；同 `activity-impl.md §8`，交付时随回复同发）

见 impl §8 —— 两份同一张清单，不重复维护。

## 7. 交 impl 的判据

本份 + 报告过人类评审后按 `activity-impl.md` 复述 as-built；本线特例 = 人类点名开工、四项已拍板（§8），代码已同批落地。

## 8. 本份已拍板（ACQ1–ACQ4 · 人类 2026-10-19 全部按建议落定）

| # | 问题 | **决议** |
|---|---|---|
| **ACQ1** | 这一批"活动面板"做到哪一层？ | ✅ **A = 面板 + 数据表 + 跳转**：info.csv → `activities.json` 生成通道、面板列 `!hide`、"去参加"跳已落码面板/地图；**未建面板只 logLine** |
| **ACQ2** | 商店限购的临时账 `state.shop.bought`（不落盘、读档归零）收不收编进 `Activity("shop")` 袋？ | ✅ **收编**：袋 = 唯一真源、读写经 `session.js` 投影，**随 XML 落盘**；`shop.js` 一行不改 |
| **ACQ3** | 小屋图 50000 的 `mod_home.map_id` 覆盖位接不接？ | ✅ **仍不接**：M5 TPQ3 决议不变、手测第 6 条不变；只在报告 A10 记"存在覆盖位未接" |
| **ACQ4** | 135 条活动数据怎么进表？ | ✅ **原样全收**：135 条全进 JSON，面板仅按 `hide` 过滤（99 可见） |
