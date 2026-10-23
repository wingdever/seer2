# 外部参考台账（external-refs.md）

> **范围**：仓内**不属于我们自有成果**的一切目录（`vendor/**`、`projects/**`）+ 仓外但**现役门禁依赖**的硬前提（0827 构建、Ruffle、Flex SDK、素材 CDN）。
> **只回答四件事**：每件**从哪来**、**服务哪条线**、**进不进库**、**丢了怎么重建**。
> **不回答**：上游内容是什么（那是各线 design 的真值面）、也不定目标行为（决策仍归各线）。
> **父文档**：`docs/architecture.md`（跨线总览）；目录树的代码面口径 = `docs/arch-code.md §1`；文档面 = `docs/arch-docs.md §0.1`。
> **证据口径**（`docs/arch-docs.md §4`）：【样本】= 本机实测（体积 / `git ls-files` / 哈希比对）；【源码】= 读自脚本或配置；【推断】= 未实证。
> **本地编号**：待拍板 = **ERQ1–ERQn**（本份独有前缀，不与任何线撞号）；缺口登记 = **ERG1–ERGn**。引用必须带前缀。

---

## 1. 为什么要单独立这份

`.gitignore:4` 写了原则「文档里引用它们的地方按路径写，**克隆后自行获取**」，但**"从哪获取、怎么获取"在全仓没有任何落点**：
`docs/arch-code.md:29` 对 `vendor/**` 只有两个字「镜像（只读）」，`README.md:48` 写「`projects/`、`vendor/` —— 上游与镜像，只读参考」。
⇒ 结果是**每条线都在 grep 反推**：`seer2-origin-as3` 的证据身份要靠 `docs/legacy/web-client-notes.md:71,170,267` 三处引用倒推出来，
`seer2-pet-animator` 的复用意图散在 `docs/view/scene/room/view-scene-hud-design.md:124` 与 `docs/view/panel/petbag/restart-petbag-panel.md:294`。
**本份 = 把这些散落的"外部件身份"收成一个正本；其余文档只链接、不重复**（`docs/arch-docs.md §3`）。

---

## 2. vendor 与 projects 的分界（判据是实测的，不是语义的）

| | `vendor/` | `projects/` |
|---|---|---|
| **装什么** | **别人的实现**（社区三方仓库）+ **上游开源仓的源快照** | **上游本体与产物**：游戏工程、站点镜像、启动器、安装包、已废弃线的冻结快照 |
| **我们对它的姿态** | **参考 / 旁证 / 跨验**（读它的做法，不当真值） | **真值来源**（读它的数据与代码，文档按 `路径:行` 引它） |
| **入库机制** | 逐条**排除**（`.gitignore:35-37`），**唯二入库的是两件快照** | 整体排除 + **逐层白名单放行**（`.gitignore:14-32`） |
| **为什么这么分**【源码】 | `.gitignore:34` 的理由只有一条：「**三方独立仓库（各自带 `.git`；直接纳入会变成半拉子 gitlink）**」 | 上游体量太大（【样本】`bake/` 8.4G + `Seer2-Restart-Lite-main/` 1.5G），只放行**运行时真会读的那几棵** |

⚠️ **判据的边界情形**：`vendor/arcadia-eternity-src-snap.tar.gz` 是**上游源**，但因为它**不带 `.git`**（是一个 tar 包）就入了库 ⇒
所以"vendor = 三方"并不严格，**真正的分界是"带不带自己的 `.git`"**。⇒ 由此得 **ERQ1**（见 §6）。
【样本】实测三个 vendor 子仓各有 `.git`：`seer2-origin-as3` / `seer2-pet-animator` / `seer2-pet-preview`。

---

## 3. 台账 A —— `vendor/`（5 件，实测总 103M）

| 件 | 体积【样本】 | 来源【源码】 | 服务哪条线 | 入库 | 丢了怎么重建 |
|---|---|---|---|---|---|
| `arcadia-eternity-src-snap.tar.gz` | 356K | 上游开源仓 `github.com/arcadia-eternity/arcadia-eternity`（**MPL-2.0**，`tools/build-kernel.sh:3`）的**稀疏浅克隆快照**：`packages/{battle,engine,const,schema,interface,engine-plugins}` + `packs/base`，**0 个 `.cs`** | **AS3/v2 战斗页**的规则层 `game/battle-kernel.js`（rolldown 打包，入口 `game/kernel/glue.ts`）⇒ 消费者 `game/app/scenes/battleScene.js:471`、`game/legacy/battle.html:513`。**⚠️ 不是现役重启内核**（那是我们自 ports 的 `game/core/**`） | ✅ | `bash tools/build-kernel.sh`（幂等；无快照时自己 `git clone --depth 1 --filter=blob:none --sparse` 到 `/tmp/arcadia`） |
| `arcadia-commit.txt` | 4.0K | 内有一行 `1492b2cae49a65d88c7132047132c85d0d06bff1` = 上面快照的**版本锚**【样本】 | 同上 —— 这是全仓**唯一**记了上游 commit hash 的地方 | ✅ | 无源可换：这行本身就是锚。**手改需谨慎** |
| `seer2-origin-as3/` | 62M | `github.com/arcadia-star/seer2-origin-as3`，HEAD `332f95f`【样本】；含 `src/ lib/ build.sh doc/` | **AS3 血统的证据源**：`docs/legacy/web-client-notes.md:71`（"每一条都已用我方 `vendor/seer2-origin-as3` 反编译源码或本地文件互证"）、`:170`（逐段对照移植到 `game/maprunner/WildPet.as`）、`:267`（`ItemConfig__itemXmlClass.xml`） | ❌ `.gitignore:35` | `git clone https://github.com/arcadia-star/seer2-origin-as3`（**需联网**）；clone 后**请记下 HEAD** 再写回本表 |
| `seer2-pet-animator/` | 408K | `github.com/arcadia-star/seer2-pet-animator`，HEAD `9d7bdf4`【样本】；**MIT**（`LICENSE`: "Copyright (c) 2025 arcadia-star"）；`<pet-render>` custom element + `src/assets/petContainer.swf` | **跨参考价 / 旁证**，非依赖：`docs/view/scene/room/view-scene-hud-design.md:124`（拟复用它的迷你 Ruffle 元素做头像格）、`docs/view/panel/petbag/restart-petbag-panel.md:294`（"跨参考价 = vendored `vendor/seer2-pet-animator`"）⇒ **我们实际的装载口径是 `game/petContainer.root.swf?url=/swf/fight/{swfId}.swf`**（`game/app/view/petbag/idleStage.js:3`），与它同法但不 import 它 | ❌ `.gitignore:37` | `git clone` + `pnpm install && pnpm build`（它要构建才有 `dist/*.umd.js`；我们**不需要**这个产物） |
| `seer2-pet-preview/` | 41M（**只剩 `.git`**） | `github.com/arcadia-star/seer2-pet-preview`，HEAD `95c72c2`【样本】；= **本项目的起点页**（精灵动画图鉴，`README.md`：「一个用于展示约瑟传说精灵动画的网页」） | 历史：**动画素材的入口**；⚠️ **VP5 已于 2026-10-19 反转**（人类点名"实现精灵图鉴面板"）⇒ 图鉴立项 = `docs/view/panel/dex/`；本仓仍**不 import 它**，装载口径 = `game/petContainer.root.swf`（`game/app/view/petbag/idleStage.js`，图鉴展示台复用同一台 = `dex-design.md` **DX10**） | ❌ `.gitignore:36` | ⚠️ **今天已取不回**，见 §7 的 ERG2 |

---

## 4. 台账 B —— `projects/`（5 件 + 两个安装包/归档）

| 件 | 体积【样本】 | 服务哪条线 | 入库 | 丢了怎么重建 |
|---|---|---|---|---|
| `Seer2-Restart-Lite-main/` | 1.5G | **单一真值本体**（`MQ1` 写侧以重启为准）：**地图线**读 `Assets/Resources/Data/Maps/*.xml` **272 张**（`game/app/content.js:228`、`game/logic/map/parse-map.js:4`、`tools/map-audit.mjs:27`）；**引擎/域线**读 `Assets/Resources/Data/{Pets,Skills,Items,Effects,Buffs,Missions,Stories}`；**View 线**读 `Resources/Pets/icon/`、`Resources/Buffs/`、`Assets/StaticResources/`（头像/菜单 PNG）、`Assets/Resources/Fonts`（`@font-face` 两个 `.TTF`）；场景真值 = `Assets/Scenes/{Map,Title,Login}.unity` | 🔶 **白名单逐层放行 = 6267 个文件**：`Assets/Resources/` 3904（**含 `Data/Maps/` 544 = 272 xml + 272 meta**）、`Resources/Buffs/` 1012、`Resources/Pets/` 990、`Assets/StaticResources/` 305 | 发行包 `Seer2-Restart-Lite-main.zip`（同目录，未入库）或上游改版站点；**入库那 6267 个有 git 兜底** |
| `bake/` | **8.4G** | **已废弃线**：光栅烘焙（截图法）⇒ `README.md:37`「已废弃 · 冻结保留」，入口 `projects/bake/RESUME.md`；`game/app/content.js:140` 还引用它的 `PIPELINE.md` 已知限制作口径 | ❌ | 不重建（冻结）。**删了会断两条文档引用**，见 ERG4 |
| `rocoshowdown/` | 3.5M | **改服站点 `rocoshowdown.cn` 的镜像分析**（已完成）⇒ `README.md:38`，入口该目录 `NOTES.md`；`docs/legacy/web-client-notes.md:3` 记 2026-10-15 从它拆出。⚠️ 品牌卫生见 `docs/arch-docs.md §7` | ❌ | 重新抓取站点（`har/` 里留有当初的抓包证据，同样不入库） |
| `seer2-chunshu-launcher/` | 117M | 改服**启动器**参考（含 `src/variants/normal/local-game-index.normal.html`）；`docs/legacy/web-client-notes.md` 的"官方 seer2 线"面（`tools/seer2-live` 同族） | ❌ | 发行渠道，非我们撰写；丢了不阻塞任何线 |
| `seer2-next-client-Linux-1.1.3-amd64.deb` / `Seer2-Restart-Lite-main.zip` | — | 安装包与源归档（**上面两条的获取源**） | ❌ | —— |

---

## 5. 缺口登记 ERG1–ERG5（现状如此，不是设计）

- **ERG1 —— 三件 vendor 子仓没有版本锚。**
  只有 `arcadia-commit.txt` 记了一个 commit；`seer2-origin-as3`（`332f95f`）、`seer2-pet-animator`（`9d7bdf4`）、`seer2-pet-preview`（`95c72c2`）的 HEAD **散在本机、没写进任何入库文件**（【样本】本次实测取得）。
  ⇒ 后果：`docs/legacy/web-client-notes.md:71,170,267` 那些"已用 `vendor/seer2-origin-as3` 互证"的断言**无法复现**到某个上游版本。
- **ERG2 —— `seer2-pet-preview` 已是不可恢复状态（本份最硬的教训）。**
  【样本】`remote.origin.partialclonefilter=blob:none` + `promisor=true`，`git count-objects` = `in-pack: 26`、`size-pack: 41 KiB` ⇒ **本地 0 个 blob**；工作区 1625 个文件全部处于 **staged deletion**（`git status` 第一列 `D`）；`.git/objects/pack/tmp_pack_zGkrEk`（40MB `garbage`）= 一次被中断的 bulk fetch 尸体；实测懒取 `src/main.ts` 报 `RPC failed; curl 35 TLS ... unexpected eof`。
  ⇒ **素材不用救**（它那 1606 个 `public/fight/*.swf` 与我们 `swf/fight/` 文件名集合**全等**，抽 `1/10/100.swf` 比 git blob 哈希**逐字节相同**）；缺的只有 8 个源码文件，而这 8 个**卡在网络上**。
- **ERG3 —— 「克隆后自行获取」没有落点。**
  `.gitignore:4` 是这条纪律的**唯一出处**，但全仓没有"从哪个 URL、用什么命令获取"的一份清单。本份即它的落点（`ERQ2`）。
  ⚠️ 例外：AS3 血统的素材**有工具** —— `tools/fetch-swfs.mjs`（`swf/fight`，源 `http://seer2.61.com/res/pet/fight/`）、`tools/fetch-maps.mjs`（`swf/map` + `swf/map/config` 的 259 张 AS3 XML）、`tools/fetch-pet-icons.mjs`（`swf/pet/icon`）、`tools/fetch-pet-normal.mjs`、`tools/fetch-item-icons.mjs`【源码】。
- **ERG4 —— `.gitignore:27` 的注释与事实不符。**
  注释说放行的 4 棵是「运行时真会读的**美术**源（约 228M）」，但实际放行的是**整棵 `Assets/Resources/`**（3904 个文件），里面最关键的其实是**地图线的命根：`Data/Maps/*.xml` 272 张**，注释一个字没提。⇒ 照注释理解会以为入库的只有 PNG/TTF。
- **ERG5 —— `assets_swf/` 是个空壳但仍出现在目录树里。**
  【样本】`git ls-files assets_swf` = **0**，`assets_swf/fight/` 空目录；`docs/arch-code.md §1` 的树把它与 `swf/ samples/ assets/` 并列列出。`assets/` 实际只有 1 个入库文件 `main-config.json`。⇒ 同 `docs/arch-docs.md §0.1` 的「空目录 git 不跟踪 ⇒ 必须留 `.gitkeep`」纪律，这里缺一个占位或一句说明。

---

## 6. 待拍板 ERQ1–ERQ3

| # | 问题（人话） | 我的建议 |
|---|---|---|
| **ERQ1** | `vendor/` 这个名字今天同时装「三方代码」和「上游源快照」两种东西，判据其实是"带不带自己的 `.git`"。要不要把它拆成 `vendor/`（三方）与 `snapshots/`（上游快照），还是维持现状、只在**本份**写明判据？ | **维持现状 + 本份写明判据**（目录改名会牵动 `docs/legacy/*` 与 `docs/view/*` 的十余处引用，属 `AGENTS.md §2` 的人肉 grep 核对活，收益不抵代价） |
| **ERQ2** | 要不要给三件 vendor 子仓补**版本锚**（一个入库的文件记下各自 HEAD + remote URL，像 `arcadia-commit.txt` 那样）？不补的话 ERG1 会一直挂着。 | **补**，形式 = 在本份 §3 表里把「HEAD」列从"实测"升级为"登记的锚"（不新增文件，`external-refs.md` 本身就入库） |
| **ERQ3** | `bake/` 8.4G 的废弃线要不要留在盘上？它现在只被 `game/app/content.js:140` 的一条注释性引用需要。 | **留着**（`README.md:37` 已声明"冻结保留"；瘦身属人类主动决策，不该由 AI 顺手删） |

---

## 7. 仓外硬依赖（不在 vendor/projects，但**门禁与运行**都要它们）

| 件 | 位置【源码】 | 谁需要 | 丢了会怎样 | 入库 |
|---|---|---|---|---|
| **0827 构建（上游 Unity 二进制）** | `/home/wing/Software/Seer2/Seer2 Restart Lite 0827/Seer2 Restart Lite_Data/Managed` —— **绝对路径硬编码在 `tools/oracle-cs/Program.cs:18`** | **差分 oracle** ⇒ `tools/difftest.mjs:9` 的前置、`docs/engine/oracle-playbook.md:29` 的前置、`docs/engine/kernel-handoff.md:37` 已登记「本地研究，不入库不分发」 | ⚠️ **门禁整条挂掉**（`node tools/difftest.mjs` 报 `oracle 跑挂了 —— 检查 … 0827 目录还在不在`，`tools/difftest.mjs:361`）。`docs/status.md §0` 那组 `向量=30431 可比=29935 不一致=0` 就建立在这台机器的这个路径上 | ❌（版权发行物，且**在仓库之外**） |
| **Ruffle** | `ruffle` → `node_modules/@ruffle-rs/ruffle`（**软链**，`docs/arch-code.md §1` 的树里那行） | 地图 SWF（`mapRunner`）、战斗舞台与 idle 动画台、`game/index.html` 的 import map | 所有 SWF 表现降级为静态图（`game/app/view/petbag/idleStage.js:57` 有降级分支） | ❌ `/node_modules/`（`.gitignore:42`） |
| **Flex SDK** | `tools/vendor/flex/`（含 `frameworks/projects/**` 的 AS3 源码） | 编译我们的 `game/maprunner/*.as` ⇒ `bash tools/build-maprunner.sh`（`build-fightui.sh` 同理） | 不能改/重建 `MapRunner.swf` ⇒ 围栏 §4.6「玩家走位继续由 `MapRunner.as` 承担」就失去可编辑性 | ❌ `.gitignore:39`（「三方与参考素材 115M」） |
| **素材 CDN** | `http://seer2.61.com/res/`（`tools/fetch-*.mjs` 的 `BASE`） | `swf/fight/` 1606 个（入库 2289 个 swf 文件含 `swf/map`）、`swf/pet/icon/`、道具图标 | 已入库的**不用重取**；缺 id 时补取工具失效（`docs/legacy/swf-ir-plan.md:150`：`1055`/`3055` 两个是加密非 SWF，**永久排除** ⇒ 目标 1604） | 🔶 产物入库 |
| **真档夹具 vs 运行时档** | 夹具 `tools/fixtures/save-lite4.9.2-{played,default}.xml` **入库**；运行时档 `saves/save{id}.xml` **不入库**（`.gitignore:54`） | Save 线口径（围栏 §4.3「只认真机真档夹具」） | 丢夹具 ⇒ 存档线失去唯一口径基准 | 🔶 夹具入库 |
| `har/`、`logs/` | `.gitignore:9`、`:49` | 抓包证据 / 运行日志 | 证据丢失后**镜像分析线的结论不可复现**（`rocoshowdown` 那条） | ❌ |

---

## 8. 版权与分发边界（**不是纪律的新内容，只汇总**）

- `README.md:4`：**不二次分发版权素材；不做压力测试；不要把图鉴发布到 Qoder Sites。**
- `docs/engine/kernel-handoff.md:37`：0827 构建「**本地研究，不入库不分发**」。
- `AGENTS.md §4` 围栏第 4 条：本仓**无 remote**，"先不 push" ⇒ 现状下不存在对外分发路径。
- ⇒ 任何"把某个素材/表/页面推到线上（Sites / CDN / PR）"的动作，**先回本节**：上游版权件一律不许出本机。

---

## 9. 挂号待办（本份**尚未**被父文档收录 —— 我故意没动它们）

本份要成为正本，需改四处既有文档。⚠️ 其中 `docs/arch-code.md`、`docs/arch-docs.md` **当前正被另一个 agent 编辑**（`git status` 显示 M），并发写入会互相覆盖 ⇒ **留给人类或该 agent 顺带结账**：

1. `docs/arch-docs.md §0.1` 目录树顶层加一行 `external-refs.md`（⚠️ 顶层现在是「跨线三件套 + `status.md`」四件，本份是**第五件** ⇒ 属命名/落位例外，需同时在此登记，口径同 `docs/arch-docs.md §7` 的 `runtime/` 短目录例外：**跨线专题件、不带 `<线>-` 前缀**）。
2. `docs/arch-docs.md §6` 索引加一行「外部参考与仓外依赖 = `docs/external-refs.md`」。
3. `docs/arch-code.md:29` 的 `├─ vendor/** # 镜像（只读）` ⇒ 改为「三方仓 + 上游源快照（**台账见 `docs/external-refs.md`**）」；同一棵树的 `assets_swf/` 补一句"空壳"（ERG5）。
4. `.gitignore:27` 的「放行的 4 棵 = 美术源」⇒ 补上 `Data/Maps/*.xml` 272 张这一项（ERG4）。
