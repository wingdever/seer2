# seer2 — 约瑟传说网页复刻研究

研究型**引擎 / 运行时**：以「从文档与公开资料重新实现」的方法学，在浏览器中承载经典网页游戏的玩法机制与内容格式。
本仓库**只有我们自己编写的文本源码**，不含任何原作美术/音乐/数据素材（素材按发布分卷独立获取，见 `docs/asset-inventory.md §5`）；
内容层为可替换的多内容宇宙设计，《约瑟传说》素材仅是可选的承载对象之一。
**不二次分发版权素材；不做压力测试；不要把图鉴发布到 Qoder Sites。**

## 许可与版权

- 本仓库自己编写的源码与文档以 **GPL-3.0** 提供（[LICENSE](LICENSE) 全文为准）；
- 对原作权利人的尊重声明、项目定位与素材边界 = [NOTICE](NOTICE)（**非官方、无关联、未获授权**的个人研究项目；
  任何不在本仓库内的第三方素材不适用、也不被本许可覆盖）。

> 本仓为 git 仓库，远端 = Gitee 公开仓（2026-10-24 人类拍板：公开 + GPL + NOTICE，见 `docs/status.md §0`）。
> 协作规则（文档先行 / 手测验收 / 围栏禁令）见 `AGENTS.md`，全局状态见 `docs/status.md`。

## 总目标（北极星）

**做成一个可游玩的游戏** —— 玩法机制复刻《阿卡迪亚：重启》，美术 / 音乐素材取自原版与改版游戏，
且在重启机制之上支持**多内容宇宙**与**多格式素材**兼容。

三条支柱（每条各有自己的线与入口文档，这里只立目标、不重复细节）：

1. **玩法机制复刻重启** —— 战斗内核移植（无头 TS + 差分 oracle，见 `docs/engine/kernel-handoff.md`）、
   **UI 面板线**（重启 IA，见 `docs/view/ui-handoff.md`）、成长与结算（S5，见 `docs/engine/kernel-handoff.md` §4）。
2. **素材取自原版与改版** —— 动画走浏览器内 Ruffle 直渲 SWF；光栅烘焙线**已废弃**（快照见 `projects/bake/RESUME.md`）；**从改服侧提取资源素材的通路 = `tools/seer2-live/` 登陆器**（该子项目的主要目的即素材提取，声明见其 README「目的声明」）。
3. **多内容宇宙 + 多格式素材兼容** —— 两套语义不同、**不得合并**的真值树（官方 AS3 / 改服 `game/data/*.json`
   与重启 `game/data/unity/*.json`，见下「数据血统」）；SWF 矢量 IR 为未来研究项目（`docs/legacy/swf-ir-plan.md`）。

> 下文表里的「主线」指的是**支柱 1 的战斗内核**那条，不是总目标本身。

## 冷启动：先读这几份

1. `AGENTS.md` —— 工作方式（文档先行、阶段一/二、验收口径）与围栏禁令（§4），**优先级最高的协作约定**。
2. `docs/status.md` —— **唯一状态台账**：各线到哪了、待拍板、已知风险；**等待人类测试的清单 = `docs/playtest.md`**（按场景分组、带判据指针）。
3. `docs/engine/kernel-handoff.md` —— 内核目标 / 现在的落点 / S1…S6 路线图 / 下一件事。
4. `docs/engine/port-map.md` + `docs/engine/oracle-playbook.md` —— 结论集与操作手册。
5. `docs/arch-docs.md`（§0.1 目录树）+ `docs/asset-inventory.md`（素材/数据件台账，新克隆 bootstrap 见其 §5）。

## 工作线（每线各有入口文档，交叉处只链接、不重复）

| 线 | 状态 | 代码 / 产物 | 入口文档 |
|---|---|---|---|
| 战斗内核移植（主线） | 进行中 | `game/core/**`、`tools/oracle-cs/`、`tools/difftest.mjs` | `docs/engine/kernel-handoff.md` |
| UI 面板（重启 IA） | U0–U1 ✅、U3 常驻 HUD ✅（逐区复刻收口）、U4 背包 ✅、U5 战斗舞台 ✅；U2 部分（捕捉/换宠/记录已接，道具/逃跑/手牌待补） | `game/app/view/**`、`game/app/ui.css`、`game/app/scenes/rbattleScene.js` | `docs/view/ui-handoff.md`；战斗场景 = `docs/view/scene/battle/view-scene-battle-design.md` + `docs/view/scene/battle/view-scene-battle-impl.md`（**as-built §14**）；主场景 HUD = `docs/view/scene/room/view-scene-hud-design.md` + `docs/view/scene/room/view-scene-hud-impl.md`（**as-built §10/§12**） |
| 网页复刻（SPA / 地图 / 背包 / HUD · **原版 AS3 血统**） | 进行中 | `game/app/**`、`game/maprunner/`、`game/legacy/` | `docs/legacy/web-client-notes.md`、`docs/legacy/petbag-handoff.md` |
| SWF 矢量 IR（未来研究项目） | 未开始 | —— | `docs/legacy/swf-ir-plan.md` |
| 光栅烘焙（截图法） | **已废弃 · 冻结保留** | `projects/bake/` | `projects/bake/RESUME.md` |
| rocoshowdown.cn 镜像分析 | 已完成 | `projects/rocoshowdown/` | 该目录 `NOTES.md` |
| 其余各线（地图 / 存档 / 域模型 / 编排 / 运行时 / 道具 / 商店 / View 面板族） | 各线进度不一 | 各自 `game/**` 落点见线内文档 | **总索引 = `docs/status.md §1`**；目录树 = `docs/arch-docs.md §0.1` |
| 上游参考 | 只读 | `projects/Seer2-Restart-Lite-main/`、`vendor/` | —— |

## 目录结构

- `game/core/**` —— 战斗内核。**`.ts` 是权威源**，同名 `.js` 由 `tools/build-core.mjs` 机械转写生成（浏览器实际加载 `.js`，**但 `.js` 不入 git**——克隆后必跑一次转写）；改了 `.ts` **必须**重跑 build-core，否则页面静默加载旧 `.js`。
- `game/app/**` —— 网页 SPA（入口 `game/index.html`）。
- `tools/` —— 构建与抓取工具（分层约定见下「tools 分层」）。
- `game/data/**`、`swf/`、`samples/`、`game/scenes/`、`projects/`、`vendor/`、`assets/` —— **内容表与素材均不入 git**（2026-10-24 纯源码口径），随②必要素材/数据包与③网络拉取分发（见上「常用命令」与 `docs/asset-inventory.md §5`）。

## 数据血统（两条来源不同、语义不同的真值树，勿合并）

- `game/data/*.json`（`pets` / `items` / `maps` / `rules`；`wild` 自 2026-10-21 `MDB11` 起**运行时零引用**、仅留档）—— **官方 AS3 / 改服血统**的运行时表，网页复刻线直接 `fetch`。
- `game/data/unity/*.json` —— 由**重启（Seer2-Restart-Lite）的 C# 内容表**转写而来，由 `tools/build-unity-data.mjs` 生成，服务内核线的差分对拍。

两者概念上重叠（都有宠物/技能/道具），但**来源不同、语义不同**——这是差分 oracle 能成立的前提。**不得互相覆盖或合并。**

## tools 分层

- `tools/vendor/` —— 三方 SDK（如 Flex），**勿改**。
- `tools/probes/` —— 一次性探针（`tmp-*.mjs` 与 `bagtest`/`fonttest`/`gridtest` 探针目录），可弃。
- `tools/oracle-cs/` —— 差分 oracle 的 C# 源码（我们自己的）。
- `tools/fixtures/` —— 测试夹具。
- `tools/` 根层 —— 只放**稳定入口**（`difftest.mjs`、`build-*.mjs/sh`、`fetch-*.mjs`、`verify-*.mjs`、`grid-*.mjs`、`serve.mjs` 等）。

## 常用命令（在仓库根执行）

- **发布三卷（2026-10-24 终版：git 只装自己编写的文本源码，正本 = `docs/asset-inventory.md §5`）**：
  ①git 仓 = 源码/文档/工具（480 文件 / 7.6M，唯一数据例外 = 两张真值 CSV）；
  ②必要素材/数据包（~190M：`game/data` 运行数据、上游 Data、美术四棵、字体、人工采集件、自编译件…打包命令见 §5）解压到仓库根；
  ③网络拉取（~514M：`node tools/fetch-swfs.mjs && node tools/fetch-maps.mjs && node tools/fetch-pet-demo.mjs && node tools/fetch-actor-packs.mjs --icons && node tools/fetch-pet-normal.mjs --ids=…`）。
  **克隆①后必跑**：`npm install` + `node tools/build-core.mjs`（core 的 `.js` 是转写产物、不在库里）。
- 差分对拍：`node tools/difftest.mjs`
- 内核单测：`node --test game/core/`
- 生成内核 `.js`：`node tools/build-core.mjs`
- 生成 unity 数据：`node tools/build-unity-data.mjs`
- 本地起**带存档写端点**的开发服务：`node tools/serve.mjs`（默认 `127.0.0.1:8090`，多了 `/saves/*` 写端点 +
  一切响应 `Cache-Control: no-store` ⇒ 不必硬刷新；与上面那条**二选一**，别同时开。见 `docs/save/save-impl.md §6.1`）

## 约定

- 一条线的废弃/状态声明，只写在该线**自己的入口文档**里一次；其余文档只链接、不重复。
- `tools/vendor/` 三方不可改；`tools/probes/` 是一次性探针；稳定入口才进 `tools/` 根。
- 生成物（`game/core/**/*.js`、`game/data/unity/*.json`、`tools/oracle-cs/bin|obj`）改了源就重生成，别手改产物。