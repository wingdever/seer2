# C3·SPT 实现计划（`spt-impl.md`）

> **文档类别**：**impl**（落地计划；`docs/arch-docs.md §1/§2`；父 = **`docs/view/panel/spt/spt-design.md`**（SP1–SP4 / SPQ1–6）、证据底座 = **`restart-spt-panel.md`**（A1–A8））。
> **形状先例**：`docs/view/panel/worldmap/worldmap-impl.md`（同族同分层：L4 面板目录 + 静态表 + 三入口接线）。
> **状态**：✅ 已写（阶段一 · impl），**施工未放行** —— design **SPQ1–6 拍板 + 本份过审**后才落码（`AGENTS.md §1` 判据）；落码完 = 填 §7 as-built、停下等人类手测（决议 ⑦）。

---

## 1. 范围

只做"面板 + 三入口接线"：18 行静态表、三页线稿摆位 DOM、点 = `runTeleport`、初始页/`[page=N]` 规则、悬浮提示。
**零 L0/L1 新文件**；**零新素材**；**不碰** `MapRunner.as`/AS3/`core`（无 `tools/build-core.mjs` 重生成需求）。

## 2. 文件落位（全 L4）

| 文件 | 内容 | 批次 |
|---|---|---|
| `game/app/view/spt/bosses.js` | **SP3 静态表**：18 行 `{page, bossId, name, mapId, label, parent:[x,y], btn:[x,y], size:[w,h]}` + 页名/页偏移/bg 路径（真值 = 报告 §3 三张表逐行照搬；改表先改报告/设计） | SP-a |
| `game/app/view/spt/sptPanel.js` | DOM 自绘：800×500 盒 + `背景.png` 底 + 三页（互斥显隐）+ 每页线稿 bg（520/524/线路）+ 18 个按钮（`_kit.petIconUrl` 头像、缺图退占位）+ Region 三页签 + ✕；对外 `buildSptPanel({root, page, onGo(mapId), onHover(name,label), onClose})`（逻辑件经 opts 注入，同 `view/worldmap` 口径） | SP-a |
| `game/app/view/spt/index.js` | 装配口 `create(container, opts)`（同 `view/worldmap/index.js` 形状） | SP-a |
| `game/app/scenes/mapScene.js` | ① `import * as SPT from '../view/spt/index.js'`；② `openRestartSPT(open={})`：初始页 = design §3.2 规则（`M.unity.worldId/category`）+ `[page=N]` 夹紧/兜底（SPQ4）；`onGo ⇒ api.close(); runTeleport(mapId)`；`onHover ⇒ openHintbox`/悬浮件（SPQ6 选型）；③ HUD handlers 注入 `onSpt`；④ `handlePanelLink` 加 `SPTBoss` 分支（剥 `[...]` 取参）；⑤ `ACT_UNBUILT` 摘除 `'SPTBoss'`（名单仍全仓唯一，`dex-design DXI4` 纪律）；⑥ openPanel sink `:1118` 加 `/SPTBoss/` 分支 | SP-b |
| `game/app/view/hud/restartHudView.js` | `MENU` 行 `spt` ⇒ 加 `handler: 'onSpt'`（钮与盒 `box:[340,500,52,35]` 不动） | SP-b |
| `game/app/ui.css` | `rb-spt-*` 一族（root/page/bg/btn/tab/hint）；沿用 `rb-shop/rb-dex` 的面板底色/遮罩变量，不新开主题 | SP-a |

## 3. 摆位换算（SPQ1 = A 时；几何真值 = 报告 §3 表）

Unity 中心锚、y 向上 ⇒ CSS 左上坐标（面板盒 800×500，盒内绝对定位）：

```
cx = 400 + (父x + 按钮x)
cy = 250 − (页偏移y + 父y + 按钮y)          // 页偏移 = −60（北/南）、−30（派诺）
left = cx − w/2,  top = cy − h/2            // w/h = 按钮尺寸列
```

- bg 图渲染宽 = **面板可视宽**（`520/524` 约 559×259、`线路` 1469×510：上游按整图缩放摆位【推断】）；`SP_BG_SCALE`（每页一个，默认 = 页 bg 显示宽 / 原生宽，初始 1 ⇒ 全按钮按 `cx,cy` 同步缩放）**= 人眼校常量族**（`flipY`/`NPC_ANCHOR` 同族，§4.10；手测第 11 条回收）。
- bg 图与摆位不同步时**只调常量、不改表**（表 = 报告真值镜像）。

## 4. 行为规格（照 design 逐条落点）

- **SP1**：`host.openPanel('rb-spt', …)`；✕/遮罩/ESC = 既有宿主；零写档（不 import session 写面）。
- **SP2**：初始页函数 `sptInitialPage(worldId, category)` 纯计算 + `clamp(0,2)`；`[page=abc]` ⇒ 忽略、走初始页规则（A6）；`[page=9]` ⇒ 夹紧（A5）。
- **SP3**：单发传送 = 表值 `mapId`（A1 不照搬）；头像 `petIconUrl` + `mountImg` 自陈缺失；hover ⇒ `ShowBossInfo(宠名 → 目标图名)`（SPQ6=A）。
- **SP4′**：`runTeleport` 前 `api.close()`；待接线图（530/910/1290）**不置灰**（SPQ5=A）。

## 5. 施工批

| 批 | 内容 | 验收（= 人类手测，决议 ⑦；脚本仅数字回归） |
|---|---|---|
| **SP-a** | `bosses.js` + `sptPanel.js` + `index.js` + `ui.css`（面板能开、三页能切、18 只画得出） | 手测 §5 第 1/3/7/11 条 |
| **SP-b** | `mapScene.js` 六处接线 + HUD `onSpt` + `ACT_UNBUILT` 摘除 + `[page]` 参数 | 手测 §5 第 2/4/5/6/8/9/10/12 条 |

每批落完**停下**（`AGENTS.md §1` 第 3 条），as-built 记进 §7。

## 6. 不做清单（防"顺手实现"）

- SPT 战斗规则（`mode=3` 138 分支 / `Special=4`）与 `SpriteKingPanel` 那两处 `BattleMode.SPT` 消费 —— 引擎/地图线台账（报告 A7）。
- "打过几只"计数、周常/次数记录 —— 上游面板就没有（报告 §6）。
- `522.png` 孤儿资产、`活动[spt]` 袋联动、`mod_home` 覆盖位 —— 一律不碰。
- 像素级正式排版（A3）；要塞 cat=100 落页订正（SPQ3=B 才做）。

## 7. as-built

✅ **SP-a + SP-b 已落码（2026-10-19，SPQ1–6 全 = A）**。停点 = **等人类手测反馈**（决议 ⑦；下表为 as-built 事实，非计划）。

| # | as-built（实现实况，与上文计划的差异如实登记） |
|---|---|
| **SPB1** | 新建 3 件 + CSS：`game/app/view/spt/{bosses.js,sptPanel.js,index.js}`；`game/app/ui.css` 末尾追加 `rb-spt-*` 块（`.rb-scrim` 复用）。形状 = `view/worldmap`（scrim+box+head/body+render 重建）+ `view/dex`（悬停气泡）先例。 |
| **SPB2** | `bosses.js` = 报告 §3 三表**逐行照搬**的 18 行静态数据（`{page,bossId,name,mapId,label,parent,btn,size}`）+ `SPT_PAGES`（3 页名 / 偏移 −60/−60/−30 / bg `520·524·线路.png`）+ `SPT_BOX_BG=背景.png`。**真值只在报告/本表**，运行期不回读 XML（SP2）。 |
| **SPB3** | 盒 `800×500` 居中 = CSS `left:80px; top:calc((var(--rv-h,540px)-500px)/2)`（fixed 画布 top=20；match 画布随 `--rv-h` 重居中）。**运行期几何**：横 `s=zoneW/800`、竖 `sy=zoneH/500`（zone 实测高≈450，被 head 吃掉 ~50 ⇒ 竖距按比例、非恒 500），按钮 `cx=400+父x+按钮x`、`cy=250−(页偏移+父y+按钮y)`，`left/right` 与尺寸乘 `s`、`top` 乘 `sy`（= §3 换算的落码）。`ResizeObserver` 监听 zone 重排。**位置误差人眼校**（§4.10 同法，偏了回常量）。 |
| **SPB4** | 三页签 = `head` 内三颗文字钮（北/南/派诺），点 ⇒ `st.page` 改 + `render()` 重建（bg 换图、按钮重排）；当前页加 `.rb-spt-on`。**互斥显隐**用"整区重建"实现（非 CSS display 切换，无动画，同上游 SetPage 语义）。 |
| **SPB5** | 18 按钮：`mountImg(el, petIconUrl(bossId))` + 名字脚标 `.rb-spt-bname`。**缺图 ⇒ `mountImg` 自摘 `<img>` + `data-asset-missing`** ⇒ CSS 画虚线占位盒、**绝不伪造换图**（铁律 5）。**全 18 只不置灰**（SPQ5=A）；未验图 530/910/1290 照点，`notOpen` 由 `runTeleport` 那台机 logLine（链侧语义不动）。 |
| **SPB6** | 悬停 = **面板内浮动气泡 `.rb-spt-tip`**（`宠名 → mapId 图名`，`mouseenter/mouseleave`、贴按钮右侧、贴右缘翻到左侧）= **dex/minimap 同族先例**。**与 design 原写"提示盒(openHintbox)"不同**：模态盒每 hover 弹一次会叠层、且需点击撤 ⇒ 改用非模态浮层（仍满足 SPQ6=A"宠名→目标图名"）；design §3.1 关条目与 §5 第 7 条据此为准。`onHover(b,b|null)` 仍透注入口（当前接线未消费）。 |
| **SPB7** | 关 = ✕ / 遮罩（两条都 ⇒ 面板 `onClose` → `SPT_PANEL=null` + `api.close()`）。**单发传送**：`onGo ⇒ SPT_PANEL=null; api.close(); runTeleport(mapId)`（A1 烘死的二次 `GoToMap` **不照搬** = 决议 ②；表值 mapId 唯一）。 |
| **SPB8** | **ESC 不实现**：宿主 `host.js` 不提供 ESC、`worldmap/minimap/dex` 三先例一律无 ⇒ 本面板随族不承诺 ESC（design §3.1/§5 第 10 条已据此改正）。关上面板 = ✕/遮罩。 |
| **SPB9** | `mapScene.js` 六处接线：① `import * as SPT`；② 单例 `SPT_PANEL`（同 `ACTIVITY_PANEL` 口径）；③ `sptInitialPage()`=`worldId+1`、`≤1⇒(cat≤10?0:1)`、上界夹 2（读 `M.unity.worldId/category`）；④ `openRestartSPT(open)`：`[page=N]` 有限 ⇒ `clamp(0,2)`、非法/缺失 ⇒ 初始页规则（修 A5 白板/A6 抛）；`onGo` 内先撤再 `runTeleport`；⑤ `handlePanelLink` 加 `SPTBoss` 分支（**剥 `[...]` ⇒ 走初始页规则**，与上游烘死无参调用一致）+ `ACT_UNBUILT` **摘除 `'SPTBoss'`**（名单仍全仓唯一）；⑥ openPanel sink 加 `/SPTBoss/` 分支 ⇒ `openRestartSPT(parseShopArgs(intent))`（`SPTBoss[page=2]` 链在 **NPC 动作**路里被解析，非 linkId 路）。 |
| **SPB10** | HUD：`restartHudView.js:77` `spt` 行加 `handler:'onSpt'`；`mountRestartHud` 注入 `onSpt: () => openRestartSPT()`（钮从"面板待建"灰路升为真开板）。 |
| **SPB11** | 分层：`view/spt/**` **零 import `game/logic/**`、零 import `session`**，行为全经 opts 注入（arch-code 规则 3）；面板零写档（SP1）。语法 `node --check`/`SourceTextModule` 全过。 |

## 8. 请人测

= design §5 十二条（交付时随回复同发）。**重点**：第 4 条（里奥斯须落 `10017` 非 `10038`，验 A1 单跳）、第 5 条（雷伊 → `10032`）、第 2 条（初始页跟随：`map=142→北`/`1220→南`/`10017→派诺`/`82→南`[SPQ3=A 观感项]）、第 8 条（`map=10001` NPC `SPTBoss[page=2]` → 派诺页）、第 11 条（18 只摆位人眼校，偏了记页/哪只/方向回 §SPB3 常量）。
