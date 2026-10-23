# C3·WorldMap 实现计划（`worldmap-impl.md`）

> **文档类别**：**impl**（落地计划；配对 design = **`docs/view/panel/worldmap/worldmap-design.md`**，WMQ1–4 人类 2026-10-19 已全部拍板；证据底座 = **`docs/view/panel/worldmap/restart-world-map-panel.md`**）。
> **状态**：✅ 已写 + **WM-a/WM-b 已落码（2026-10-19）**，as-built 见 §7；**等人类手测**（§8）。
> **编号纪律**：施工批 **WM-a/WM-b**、偏差 **WMD1–WMDn**（本份局部编号，**不是**人类决议）。
> **验收口径**（决议 ⑦）：本份不发测试脚本；验收 = 人类把游戏跑起来按 §8 清单手测。

---

## 1. 范围

只做**世界地图面板闭环**：`#/map` HUD globe 钮 ⇒ 面板（两页 / 37 块真值表 / 分组宫格）⇒ 点块走 `teleport` 决议链换图。
**不做**：小地图 MiniMap 族（WMQ3=A）、Mod 面板分支（design §1，报告 §6 声明存在）、美术热区版式（WMQ4=A）、上游代码 bug 的照搬（报告 A2/A3/A3′/A4 ⇒ design §6 处置表）。

## 2. 文件落位（照 `view/shop/` 先例，全 L4/L3 视图层；零新 L0/L1）

| 文件 | 层 | 内容 |
|---|---|---|
| `game/app/view/worldmap/blocks.js` | L4 数据表 | `WORLD_MAP_PAGES`（两页名）/ `WORLD_MAP_GROUPS`（六组中文名）/ `WORLD_MAP_BLOCKS`（**36 行** = 报告 §3 的 37 块**减 Mod 块**，WMD1）；每行 `{page, group, mapId, name, label}`；`mapId===0` ⇒ 未开放块（置灰，WMQ1） |
| `game/app/view/worldmap/worldmapPanel.js` | L4 DOM | `buildWorldMapPanel(ctx)` → `{ render }`；ctx = `{ root, currentMapId, worldId, onGo(mapId), onLocked(mapId), onClose }`；页状态机（Prev/Next 模 2 循环）+ 分组宫格 + "在此"标记 |
| `game/app/view/worldmap/index.js` | L4 装配口 | `create(root, opts)`（同 shop 的 `create` 口径） |
| `game/app/ui.css`（追加一段 `.rb-wmap-*`） | L4 样式 | 最小样式（遮罩复用 `rb-scrim`），非像素级美术 |
| `game/app/scenes/mapScene.js` | L4 接线 | ① `onMap` 占位（`:250`）⇒ `openRestartWorldMap()`；② 新增 **`runTeleport(mapId)`**（从 MB5 `teleport` sink 抽出的**同一条链**：`decideTeleport` ⇒ notOpen 记日志 / 否则撤对话浮层 + `gotoMap(id, true)`），sink 与面板**共用**（WM3：面板不旁路）；③ 未开放块点击 ⇒ `openHintbox('地图暂未开放')`（A3 既有件；文案与上游 `TeleportHandler.cs:44-46` 同语义） |

**纪律核对**：视图件**不 import** `game/logic/**`（决议经 opts 注入口进，同 shop 的 `opts.logic` 口径）；换图只经 `gotoMap`（OR2 单入口）；不缓存地图（§4.9）；不碰 `MapRunner.as` / AS3（WM4，A2/§4.11/§4.12 先例的再扩一格）。

## 3. 块表形状（真值 = 报告 §3.1/§3.2 两张表，逐行照搬）

- `name` = 显示名（design §3.2 单通道：页 0 取上游**块标题**、页 1 取上游**悬浮名**；`Seer`/`Station` 两块上游无名 ⇒ 我们给"夜间传送舱"/"英格瓦要塞"，WMD2）。
- `label` = 目标图 xml 真名（脚标，如 空港/火幻氏族主城）；夜块 label = `传送室`（-70.xml `name`【样本】）。
- 初始页 = 桥记录 `M.unity.worldId`（`parse-map.js:297` 同上游公式）；缺记录 ⇒ 页 0。
- "在此" = `mapId === Number(session.currentMapId)`（负 id 直接可比）。

## 4. 行为规格

1. **开**：globe click ⇒ `openPanel('rb-worldmap', …)`（宿主 VP3 同名去重）；**不改 URL、不进历史**（WM1）。
2. **翻页**：`上一页/下一页` 按钮 ⇒ `page = (page±1+2)%2`；页标题 = `阿卡迪亚星/新世界`。
3. **点块**：`mapId===0` ⇒ `onLocked` ⇒ 提示盒（面板**不关**，同上游 Hintbox 浮在面板上的可观察层序——上游是叠在面板上的模态，WMD3）；否则 `onClose()` 先撤面板 ⇒ `runTeleport(mapId)`（design §3.3 第 3 条）。
4. **关**：✕ / 遮罩 / 再点 globe（VP3 重开=先关后开）。**ESC**：宿主今天**没有全局 ESC 键层**（A2 设计有、运行时未接；WMD4 登记，不为本次私加）。
5. SWF 图与 JS 回退图**同一 DOM 通路**（面板与画面层无关，design §3.2）。

## 5. 施工批

- **WM-a**：`blocks.js` + `worldmapPanel.js` + `index.js` + ui.css 一段。
- **WM-b**：`mapScene.js` 接线（`runTeleport` 抽取 + `onMap` + 提示盒注入）。

## 6. 不做清单（防"顺手实现"）

Mod 块/Mod 面板；`50000⇒mod_home` 活动查表（M5 TPQ3 已决不实现）；小地图 11 块；解锁/门禁（A11 照做 = 本来就没有）；正式美术。

## 7. as-built（WM-a + WM-b · 2026-10-19）

- 落位与计划一致：新建 `game/app/view/worldmap/{blocks.js,worldmapPanel.js,index.js}`（36 行块表 = 报告 §3 全表减 Mod 行）；`mapScene.js` 加 `openRestartWorldMap()` + `runTeleport()` 共享链，`onMap` 从 `logLine('大地图：世界地图面板待建')` 换成开面板；`ui.css` 追加 `.rb-wmap-*` 段。
- **WMD1** Mod 块**不入表**（37⇒36）——design §1 边界（Mod 声明不做）；报告表仍为 37 行真值。
- **WMD2** `Seer`/`Station` 两块上游匿名（报告 A3/A3′ 泄漏），我们**如实给名**："夜间传送舱"（-70）/"英格瓦要塞"（81）。
- **WMD3** 未开放块 = 面板不关、提示盒叠上（点了灰块关面板反而丢上下文）。
- **WMD4** **ESC 关闭未接**：宿主无全局键层（A2 §… 既定缺口），本批只给 ✕/遮罩；**登记为等人手测确认项**，非死账。
- **WMD5** `runTeleport` 对 notOpen **仍只 `logLine`**（保持 MB5/TPQ4 原行为不变）；面板的灰块走**自己的** `onLocked` ⇒ 提示盒 —— 两条入口语义不同是**故意的**：链上不弹窗 = M5 决议，摆出来的灰块可点有反馈 = WMQ1。

## 8. 请人测（= design §5，交付时随回复同发）

① `#/map?slot=0&map=100` 点地球 ⇒ 面板弹在**页 0「阿卡迪亚星」**（100 cat2 ⇒ worldId 0）；进任一飞船舱（如 `10001`）再点 ⇒ **页 1「新世界」**；
② 翻两页 ⇒ 页 0 三组（北域 10 / 南域 7 / 边栏 2）、页 1 三组（飞船舱 10 / 星球 6 / 太空站 1）；
③ 点「火山星」⇒ 面板关 + 落火山星山脚下出生点；点「传送仓」⇒ 进飞船舱；
④ 点 4 个灰块（神醚/战武/萨伦/雷鸣）⇒ **提示盒"地图暂未开放"**、面板仍在；
⑤ 点「夜间传送舱」⇒ 进夜间传送室（-70）；
⑥ 当前图块显"在此"；点"在此"块 = 重进同图（同上游）；
⑦ ✕/遮罩关闭 ⇒ 无残留、可再开；「返回上一图」仍正常；
⑧ **SWF 图（如 `100`）与 JS 回退图（如 `50000` 小屋）各来一遍**，行为应一致。
