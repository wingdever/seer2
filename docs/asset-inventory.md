# 素材台账（`asset-inventory.md`）

> **文档类别**：**跨线专题件**（同 `docs/external-refs.md` ⇒ **不带 `<线>-` 前缀**；目录树与索引的收录见 `docs/arch-docs.md §0.1/§6`）。
> **本份短名** = `asset-inventory`；引用一律写全路径 `docs/asset-inventory.md`。
> **范围**：仓内**运行时真会读的一切素材与数据桥文件**（美术 / 表 / 离线提取产物 / 编译产物 / 运行期落盘），每件只回答五件事：
> **住哪里（路径）· 是什么（体量与格式）· 干什么（消费点 `路径:行`）· 怎么获得（命令或人工步骤）· 丢了怎么办（入库状态）**。
> **不回答**：① 上游仓与**仓外硬依赖**（`vendor/**`、`projects/**` 整树、0827 构建、Flex SDK、Ruffle、CDN）= **`docs/external-refs.md` 正本**，本份只链接不重复；
> ② 代码分层与生成物纪律 = `docs/arch-code.md`；③ 任何**目标行为**（仍归各线 design）。
> **证据口径**（`docs/arch-docs.md §4`）：【样本】= 本机实测（`du -sh` / `find | wc -l` / `git ls-files` / `git check-ignore`，本次实测 2026-10-20）；【源码】= 读自脚本或配置；【推断】= 未实证。
> **本地编号**：素材条目 **AS1–ASn** / 缺口登记 **ASG1–ASGn** / 待拍板 **ASQ1–ASQn** —— 全部是本份独有前缀，**不是**人类决议 ①–⑨（`AGENTS.md §5`）。

---

## 0. 为什么要单独立这份

`.gitignore:4` 的原则是「**只留自有成果**；上游参考/证据/三方仓库/依赖/生成物都不进库 ⇒ 文档里按路径写，**克隆后自行获取**」，
但**"哪些素材靠哪条命令获取、哪些根本获取不回来"散在十余处**：`tools/*/` 各自的中文头注释、`docs/item/item-design.md §3.1`、
`docs/map/map-actor-look.md §5.5`、`docs/view/panel/shop/shop-impl.md §图标渲染`、`docs/external-refs.md ERG3`。
⇒ 结果是每条线都要重新 grep 反推"这件东西哪来的、能不能再生"。本份 = 把这些收成一个正本；其余文档**只链接、不重复**。

**三条判据**（贯穿全表）：

1. **真值必须入库**：人推出来、又没有生成器的表（例：`game/data/map_swf.csv`）丢了 = 只能重推 ⇒ **已入库（2026-10-21 仓库重置，ASG2 已结）**，且**仍无生成器** ⇒ 入库件即唯一副本，改表须手工维护后提交。
2. **可重生成的产物不入库**，但**必须写清重生成命令 + 前置**（前置若是"真人进一次游戏"，那就等于半永久，见 **AS-D2** 与 **ASG6**）。
3. **入库 ≠ 可用**：软链与"上游树里的未放行子目录"会让新克隆拿到一个**指向空处的路径**（ASG3 / ASG4 / **ASG8**，另有 AS39 = 反例：入库了但没人读）。

---

## 1. 速查总表 A · 上游发行物里的素材（在 `projects/Seer2-Restart-Lite-main/`，真值来源）

获取途径一律 = 上游发行包 `Seer2-Restart-Lite-main.zip` / 站点（**台账见 `docs/external-refs.md §4`**）；
入库机制（**2026-10-24 纯源码口径**）= `projects/` **整棵不进 git**（`Data` 的 CSV+地图 XML 也随②号包走）。
⚠️ **与 `docs/external-refs.md §4` 的对账差**：那份记 `Assets/Resources/` **3904** + `Buffs` 1012 + `Resources/Pets` 990 + `StaticResources` 305 = **6211**，本次实测白名单总数 = **6267**（差 **56**；两份的**分组口径不同**、成因未逐棵复算 ⇒ **数字以本份的逐棵实测为准**）。那份的 §9 结账仍挂给人类，本份不替它改。

| # | 路径（相对仓根） | 是什么【样本：文件数】 | 谁在读（消费点） | 丢了怎么办 |
|---|---|---|---|---|
| **AS1** | `projects/Seer2-Restart-Lite-main/Resources/Pets/icon/` | 宠物头像 PNG（Unity `Addressables "Pets/icon/{id}"`）**990**【样本：覆盖重启 838 只宠里的 **813** 只，登记 = `game/app/view/hud/restartPortrait.js:3` 引 `docs/view/scene/room/view-scene-hud-impl.md §2.4`】 | `game/app/view/panels/battle/_kit.js:36`（`PETIC`）、`game/app/view/hud/restartPortrait.js:8`（`ICON`）；`game/app/view/petbag/cellView.js:6` 与 `game/app/view/spt/bosses.js:12` **只以注释点名这棵树**（实际 URL 经上面两个常量） | ❌ **出库 → ②必要素材包**（2026-10-24 三段发布；发行包内棵） |
| **AS2** | `…/Resources/Pets/battle/` | 宠物战斗形象 PNG（缺 swf 时的回退画面）**990** | `game/app/view/panels/battle/_kit.js:37`（`PETBT`，注释「战斗舞台缺 swf 时回退用它」） | ❌ **入库 0**（白名单只逐层放行到 `Pets/icon/`，`.gitignore:25-26` = 先 `Resources/Pets/*` 排除、再 `!…/Pets/icon/` 找回）⇒ **ASG3** |
| **AS3** | `…/Resources/Buffs/` | buff 图标 + **路径型 resId** 的道具 PNG **1012** | `game/app/view/panels/battle/_kit.js:35`、`game/app/view/item-art.js:40 itemPngUrl`（`"Buffs/400001"` 这类 resId ⇒ 直接拼这棵） | ❌ **出库 → ②必要素材包**（同上） |
| **AS4** | `…/Assets/StaticResources/` | 地图/菜单/UI 位图 **309**（`Sprites/Map/{menu,challenge}/*.png`、`teleport.png`） | `game/app/view/hud/restartHudView.js:19-37`（整张钮位表）、`game/app/view/panels/battle/_kit.js:6`、`game/app/scenes/mapScene.js:127`（光口）、`game/index.html:26` | ❌ **出库 → ②必要素材包**（同上） |
| **AS5** | `…/Assets/Resources/Fonts/` | 字体 **24**（web 端只用两个 `.TTF`） | `game/app/ui.css:94-95` `@font-face`（`Mini Diamond.TTF` / `Zongyi.TTF`） | ❌ **全部出库 → ②必要素材包只带 2 个 .TTF**（2026-10-24 三段发布；web 端 `@font-face` 只引这两个） |
| **AS6** | `…/Assets/Resources/Data/` | 内容表 CSV + **地图 XML** **608**（`Maps/` = **272 张** xml + 272 meta） | **地图线命根**：`game/app/content.js:515`（`MAPS_XML_DIR`）、`game/logic/map/parse-map.js:4`（读侧权威 = 重启件，`MQ1`）；**战斗贴图配置**：`game/app/content.js:78`（`Data/Battle/critical_effect.csv`，⚠️ 故意**容错取**，不让它拖挂 boot）；**数据桥源**：`tools/build-unity-data.mjs` | ❌ **出库 → ②（上游文本数据：CSV + 地图 XML）**（2026-10-24 纯源码口径；ERG4 的注释问题随之消解） |
| **AS7** | `…/Assets/Resources/Prefabs/`（`Player/idle_1/*.png`、`Panels/PlayerInfo/Sprites/Nono.png`） | 机器人立绘 / Nono 立绘 | **PIQ7 后已退役**（旧三态立绘；留档 = `docs/view/panel/playerinfo/playerinfo-impl.md:32`） | ❌ **出库 → ②必要素材包**（2026-10-24） |
| **AS8** | `…/Resources/Items/` | 官方道具/货币图标 PNG **302** | 经 **AS14** 的软链被 `game/app/view/item-art.js:40` 读到（`ART_ROOT + '/Items/' + id + '.png'`） | ❌ **入库 0**（`.gitignore:22-24` 只放行 `Resources/Buffs/` 与 `Resources/Pets/`，`Items/` 整棵被 `:22` 排除）⇒ **ASG4** |
| **AS37** | `…/Assets/Resources/Sprites/` | 松散 UI/特效 PNG **442** / **5.3M**（`Fight/`、`Game/{Hint Box,Elements}`、`Map/spot.png`、`Title/`） | `game/app/view/panels/battle/_kit.js:5`(FIGHT)`/:39`(ELEM)、`game/app/view/panels/hintbox.js:7`、`game/app/content.js:128`、`game/app/view/hud/restartHudView.js:36/:41`、`game/app/view/battle/restartFighterStage.js:136` | ❌ **出库 → ②必要素材包**（同上） |
| **AS38** | `…/Assets/Resources/Panels/` | 面板分块图 **1757** / **42M**（`MiniMap*/Sprites/*.png` 是**世界地图/小地图**的底图切片） | `game/app/view/minimap/blocks.js:18`（逐块 URL 写死在表里）⇒ 小地图面板 | ❌ **出库 → ②必要素材包**（同上；小地图面板要它） |
| **AS39** | `…/Assets/Resources/{Pets,Animation,Games,BGM,Material}/` | **864 个 / 约 14M**（Unity 侧的宠资产、动画、小游戏、BGM） | 【样本】**运行时零引用** ⇒ 随整棵 `Assets/Resources/` 白名单一起进来的"顺带件" | ❌ **出库（2026-10-24 Gitee A 档）** —— 当初登记的"瘦身候选"已兑现 |
| **AS40** | `…/Resources/Maps/`（`bg/` **240** 张 + `animal/fightBg/mine/path/plant/shoot/`）**449 / 432M** | JS 回退图的**背景 PNG**（`AGENTS §4.16` 的"没 swf 就用 Unity PNG"那一支）+ `Maps/mine/*` 一类物件立绘 | `game/logic/map/js-view.js:16`（`BG_DIR`）、`game/logic/map/npc-art.js:18`（`ART_ROOT`，`path` 形 resId 拼自它）、`game/app/scenes/mapScene.js:1802`（注释即口径） | ❌ **入库 0**（被 `.gitignore:22` 整棵排除）⇒ **ASG8**：**新克隆里 JS 图没有背景** |
| **AS41** | `…/Resources/{Npc/, Pets/pet/, BGM/pet/}` | **NPC sprite 138（25M）** + **对话头像/全身立绘 425（121M）** + **宠叫声 mp3 4401（253M）** | `game/logic/map/npc-art.js:29`（`Npc/<id>.png`）与 `:47`（`path` 形 = `Pets/pet/<id>.png` 一类全身立绘/物件）、`game/app/view/panels/battle/_kit.js:38`（`CRY`，图鉴叫声口径 = `_kit.js:52`） | ❌ **入库 0**（同一句 `.gitignore:22`）⇒ **ASG8**：新克隆里 **NPC 全落占位橙点、对话头像缺、叫声静音** |
| **AS42** | `…/Assets/StaticResources/Sprites/Map/talk bubble/`（`emoji/toon/` **24 png** + `emoji/meme/` **7 jpg** + `WildNpcBubbleIntegrated.png`）**32 张 / 300K** | **对话气泡表情**的素材正本（地图 XML `<self image="emoji/toon/*">` 引用它，distinct **24 + 7** ⇒ 真值见 `docs/map/map-move.md:319/:324`、`docs/map/map-actor-look.md §5.7 ④`） | ✅ **运行时已引用（`MDB10` · 2026-10-21）**：URL 数学 = L1 `game/logic/map/npc-art.js:talkImageUrl`（`toon⇒.png` / `meme⇒.jpg`、去扩展名、禁 `..`）⇒ 由 L4 `game/app/scenes/mapScene.js:drawNpcImageBubble` 画进 `#npc` 叠加层；调度 = L1 `game/logic/map/talk.js`（JS/SWF 两条路都跑）。取数走 `tools/serve.mjs` 既有静态根（目录名含空格 ⇒ URL 里是 `talk%20bubble`、**服务端零改动**）。~~旧口径「运行时零引用 ⇒ 气泡只画文本」已作废~~ | ✅ **已入库 32/32**（`git ls-files …/talk bubble` = 67 条含 `.meta`，图片 **32**）⇒ **不是素材缺口**；曾缺的**运行时读取路已随 `MDB10` 接上**（as-built `docs/map/map-impl.md §7.3.32`、手测 `§8.26`）。⚠️ 唯 **`WildNpcBubbleIntegrated.png` 本批不取**（正式气泡排版/底图仍归 View 线 B3 美术，登记为偏差）。⚠️ 本行**保留一条自我更正**：曾把这支记成"`Resources/emoji/toon` 盘上为空、从没抓过"——那是**只看了 `Assets/Resources/` 这棵树**、漏了 `Assets/StaticResources/` ⇒ 官服 404 是因为它们**随客户端静态发行**，不在 `res/` 根下 |
| **AS43** | 登录器缓存 `~/.cache/seer2-live/game-cache/http_seer2.61.com/res/item/equip/swf/*.swf`（**1721 包**，清单 = `game/data/actor/equip/manifest.json`） | **装备部件包**：文件体 = `head + 裁帧表 + 一整张内嵌 PNG spritesheet`（格式真值 = `docs/map/map-actor-look.md §5.3`）⇒ **除了当帧动画源，还是"装备图标静图"的可再生源** | 运行时读侧 = L1 `game/logic/map/actor-view.js` 的 `parsePack`（`png` 字段零拷贝交回）；离线再生 = **`tools/pack-icon-stills.mjs`**（裁 `standDown` 首帧 ⇒ `png/item/equip/icon/{id}.png`，`item-art.js` 兜底链**第①级**；当前为 5 件图标 404 者补图，见 **ASG9** 与 `map-actor-look §5.7 ②-b`） | 🔶 **缓存不入库**（本机登录器产物，同 **AS30**）；生成的 `png/**` 静图**也不入库**（`.gitignore:51-56`，人类 2026-10-20 拍板「静图产物不入库」）⇒ **新克隆**：部件包靠重跑 `tools/fetch-actor-packs.mjs`、图标靠重跑 `tools/pack-icon-stills.mjs`，两处都缺则格子自动落回色块兜底、**不空屏**  |
| **AS44** | `game/data/actor/UI_ActorShadow.bin` + `UI_SurpriseMark.bin`（= **AS29 那 15 张里的 2 张**，**零新素材**） | ★**顶替登记（`MDB13`，2026-10-21）**：上游野怪的脚下阴影与惊讶标记**本有自己的件**（`WildPet.as:169-187` 引 `UI_PetShadow.swf`、`:222` 引 `UI_FightSuprise.swf`），但**这两个文件名打官服 `seer2.61.com` 实测 404**【样本】⇒ **不可补**（同 **ASG9** 那一族的性质：官服侧真无货，不是我们拼错名）。处置 = **借小赛尔的同款**（`MDB12` 顶替口径）：阴影取 `UI_ActorShadow.bin` 的 `local` 首帧（62×31 / anchor 26,23 / labels `local:{1,1}` `remote:{2,2}` `vip:{3,39}`）、惊讶取 `UI_SurpriseMark.bin`（61×68 / **23 帧** / anchor 35,66） | 运行时读侧 = L4 `game/app/scenes/mapScene.js:lookSharedOf`，取数**复用 M8 那台** `loadLookAsset({source:'naked',pack,suffix:''})`（**不需要 manifest**、与玩家角色**同一份缓存** ⇒ 一次 fetch、82 个野怪包共用一张剪影）；几何数学 = L1 `game/logic/map/pet-view.js`（`petShadowScale`/`petMarkTop`） | ✅ **已在库**（随 AS29 的 15 张一起）⇒ **不是缺口**；as-built = `docs/map/map-impl.md §7.3.35`、手测 = `§8.29` |

> ⚠️ **编号说明**：AS1–AS8 是本表初批；**AS37–AS43 是同日补盘时按发现顺序续的号**（表 B/C 的号已发出去，不重排）⇒ **表 A = AS1–AS8 + AS37–AS43**；**AS44 = `MDB13` 的顶替登记**（同族续号）。
> 另：`…/Resources/{Activities(12), Dango(6), Emblems(401), Panel(24), version.txt}` 与 `Resources/Pets/kizuna`（5 个）**盘上有、库里无、运行时零引用** ⇒ 不是缺口，只在此登记一行，别去 ASQ2 里为它们操心。

---

## 2. 速查总表 B · 从改服 CDN 抓的 Flash/AS3 件（`swf/**`，盘上 534M / 4990 个；**整棵不进 git**【2026-10-24 纯源码口径：大件 → ③网络拉取、人工采集/上游小件 → ②必要素材包，见 §5】）

CDN 基址 = `http://seer2.61.com/res/`【源码：各 `tools/fetch-*.mjs` 的 `BASE`】；
⚠️ **抓取政策不是"能抓就抓"**：定向拉取（有界名单 + 串行 + 间隔）= 人类 2026-10-20 拍板的**通道一**，正本 = `docs/map/map-actor-look.md §5.5`。

| # | 路径 | 内容【样本】 | 谁在读 | **获取命令**【源码】 | 入库 |
|---|---|---|---|---|---|
| **AS9** | `swf/fight/{id}.swf` | 宠物战斗动画 **1606** | `game/app/view/battle/restartFighterStage.js`（`FIGHT`）、`game/app/view/petbag/idleStage.js:12`、`game/app/scenes/battleScene.js:81`（AS3 线） | `node tools/fetch-swfs.mjs [fromId] [toId]`（默认 `1 1700`） | ❌ **出库（2026-10-24 Gitee A 档，403.9M）** ⇒ 克隆后跑左侧命令拉回 |
| **AS10** | `swf/map/{name}.swf` | 地图画面 **226** | `game/app/scenes/mapScene.js`（`M.mapUrl`，分流口径 = `AGENTS §4.16` + `map_swf.csv`）、`game/app/view/battle/restartFighterStage.js`（`MAP_BG`） | `node tools/fetch-maps.mjs [--budget=2500] [--conc=3] [--spacing=150] [--probe=a:b]`（沿 `teleport` BFS） | ❌ **出库（2026-10-24 Gitee A 档，67.4M）** ⇒ 同命令拉回（同目录 `config/*.xml` = AS11 **仍在库**） |
| **AS11** | `swf/map/config/{id}.xml` | **AS3 血统**地图配置 **259** | `game/app/content.js`（`MAPS_AS3_DIR`，只读适配 + swf 回退第 ② 级） | 同 AS10 一条命令一起落 | ❌ **出库 → ③**（随 `fetch-maps.mjs` 落盘） |
| **AS12** | `swf/pet/icon/{swfId}.swf` | 野怪地图头像 Flash **128** | `game/app/scenes/mapScene.js:889`（`icon: '/swf/pet/icon/…'`，★`MDB11` 后行号已漂 ⇒ 本条同步更正）；⚠️ HUD 头像**故意不用**它（`game/app/view/hud/restartPortrait.js:4` Flash 容器渲染空白 ⇒ 用 AS1 PNG） | `node tools/fetch-pet-icons.mjs`（默认名单 = `game/data/wild.json` 的 `p.swfId ?? p.id`；⚠️ **与运行时无关** = 那份名单是**我方合成的 48 只池**，`wild.json` 自 **`MDB11`（2026-10-21）起运行时零引用**，抓取工具只是**把它当历史清单继续读**，见 **AS25**）或 `--ids="266 119 43"` | ❌ **出库 → ③** |
| **AS13** | `swf/pet/normal/{swfId}.swf` | 野怪地图帧序列包 **82**（48 旧 + **`MDB12` 2026-10-21 新抓 34**，合计 4.7M；新抓的 34 个 id = `18 20 26 28 33 35 40 41 54 64 69 72 88 114 122 124 128 138 141 195 199 200 203 204 209 210 213 240 254 268 295 403 705 884`，逐个 HEAD = **200**、合计 **2,325,139 字节**） | ⚠️ **口径两改**：① `MDB11`（2026-10-21 上午）= AS3 侧断粮（宿主喂 `wild: ''` ⇒ `setWild()` 空 ⇒ **一只 `WildPet` 都不生成**，旧消费点 `WildPet.as:103` 成**不可达死码**）；② **同日 `MDB12` = 运行时按需 fetch 复活、但改由 JS 解包**（这些文件**不是 Flash 影片**：头两字节 = 16 位长度 + 内嵌一张 PNG spritesheet ⇒ L4 `game/app/scenes/mapScene.js:ensurePetPack()` fetch → L1 `actor-view.js:parsePack()` → `createImageBitmap` → 画在 `#npc` 叠加层；换算 = 新 L1 `game/logic/map/pet-view.js`；桥 = **AS27**；正本 as-built `docs/map/map-impl.md §7.3.34`）。**仍**：`tools/build-wild-index.mjs:32` 用它是否存在写 `pool[].have`（离线判据，不属运行时路）。**覆盖** = 80 只 / 38 张图走帧包、30 只 / 15 张图**桥里没有对应物 ⇒ 仍走 AS41 那批 PNG** | `node tools/fetch-pet-normal.mjs --ids="…"` **或** `--urls="ui/UI_PetShadow.swf …"`（二选一必填） | ❌ **出库 → ③网络拉取**（2026-10-24 三段发布；`fetch-pet-normal.mjs --ids` 或随③号包） |
| **AS14** | `png/item/icon/{id}.png` | **302 条软链** ⇒ `../../../projects/…/Resources/Items/{id}.png`（官方道具/货币图标） | `game/app/view/item-art.js:50 itemStaticUrl`（四级兜底的①层恰好命中它） | 手工建的镜像（2026-10-19），**无生成器** | ❌ **软链已出库（2026-10-24）→ ②号包内为 302 个真文件**（git 里软链悬空本就无意义，ASG4 就此了结） |
| **AS15** | `swf/item/{collection,emblem,icon,medal,pet}/**` | 其余道具图标 **15** | `game/app/view/item-art.js:32 itemSwfUrl` 路由②（Ruffle 播） | `node tools/fetch-item-icons.mjs <itemId> …`（**必须点名 id**，路径取自 `game/data/items.json` 的 `icon`/`iconOrigin`） | ❌ **出库 → ③**（点名补） |
| **AS16** | `swf/item/equip/icon/{id}.swf` | **装备/坐骑图标 1687**（采集单 1735 ⇒ 404 的 48 件登记 `game/data/actor/equip/icon-missing.json`） | `game/app/view/item-art.js`（四级链的②层）+ **①层静图（AS21/AS22）由它派生** | `node tools/fetch-actor-packs.mjs --icons`（前置 = 先跑 `node tools/build-equip-index.mjs`） | ❌ **出库（2026-10-24 Gitee A 档，7.2M）** ⇒ 同命令拉回（前置含 ③ 的 vendor 仓；404 的 48 件本就拉不回、见 ASG9 缺件登记） |
| **AS17** | `swf/nono/nonoEquipIcon/102001.swf` | NONO 装备图标 **1** | `game/app/view/item-art.js:26`（`NONO_EQUIP = [102000,102999]` 段路由） | 同 AS15（`fetch-item-icons.mjs`） | ❌ **出库 → ③** |
| **AS18** | `swf/ui/{UI,UI_hud,UI_Arena}.swf` | 原版 HUD / 对战 UI **3** | `game/app/scenes/battleScene.js`（`uiUrl: '/swf/ui/UI_Arena.swf'`）、`game/legacy/map.html:289`（`UI_hud`）；**光口的真身**就是 `UI_hud.swf` 里的符号 `UI_Teleport`（`mapScene.js:122`） | `UI.swf` / `UI_Arena.swf` = **人工采集**（真人进游戏从缓存里取，无任何工具能生成）；`UI_hud.swf` = `node tools/inject-ui-panels.mjs`（往 `UI.swf` 根时间轴注 PlaceObject2） | ❌ **出库 → ②必要素材包（人工采集件，②号包丢了只能重采）** |
| **AS19** | `swf/module/app/{ItemBagPanel,ItemBagPanel_ui,PetBagPanel}.swf` | 原版背包 / 精灵包面板元件 **3** | 面板本体在 `game/maprunner/{ItemBagRunner,PetBagRunner}.as`；数据源 `mapScene.js:798/:858` | 人工采集；`ItemBagPanel_ui.swf` = `node tools/inject-bag-panels.mjs`（该工具头注释自陈**此路线已被取代、留作后备**） | ❌ **出库 → ②必要素材包（同 AS18）** |
| **AS20** | `samples/{1,100,dict1}.swf` | 早期研究样本 **3** | 只供 `tools/ui-symbols.mjs` 一类探针看结构，**运行时零引用** | 手工留样 | ❌ **出库 → ②**（研究样本，非运行必需） |
| **AS45** | `swf/pet/demo/{swfId}.swf` | 宠物**背包待机预览** SWF **980** / 34M（AS3 源码 `vendor/seer2-origin-as3/.../component/PetDemoDisplayer.as` 的素材：960×560 舞台 + 库内 `"pet"` MC ≈ 326×326 预览尺寸，`mc.x=mc.y=0`、`scale=min(w,h)/326`） | `game/app/view/petbag/idleStage.js`（`DEMO` 常量 + `hasDemo()` HEAD 探测）⇒ **id 与 AS9 fight 同 = `swfId`**（`URLUtil.getPetDemo`/`getPetFightSwf` 都走 `getResRealId(id)`）；覆盖 482 只带 swf 的宠里 **471 只**，其余 11 只回退 AS9 | `node tools/fetch-pet-demo.mjs [fromId] [toId]`（默认 `1 1700`，同 AS9 路子；720 个 404 = 上游无该 demo） | ❌ **出库（2026-10-24 Gitee A 档，30.5M）** ⇒ 同命令拉回 |

> ⚠️ **`1055` / `3055` 两个 id 永久排除**：CDN 上是**加密非 SWF**（`docs/legacy/swf-ir-plan.md:150`，另见 `docs/external-refs.md:96`）⇒ 目标数 = 1604 动画件，别当"没抓齐"。

---

## 3. 速查总表 C · 我方生成件（离线静图 + 数据桥 + 编译产物）

| # | 路径 | 是什么【样本】 | 谁在读 | **重生成命令**【源码】 | 入库 |
|---|---|---|---|---|---|
| **AS21** | `svg/**.svg` | **1831 个** / 62M = AS9/AS12/AS16/AS17 的**矢量静图真值层**（可放大） | 运行时**零引用**（人看 / 再导用） | `node tools/swf2svg.mjs swf/item swf/pet/icon swf/nono --out=svg` | ❌ **故意不入库**（人类 2026-10-20 拍板；`.gitignore:47-55`）正本 = `docs/item/item-design.md §3.1` |
| **AS22** | `png/**.png`（除 `png/item/icon/`） | **1830 个** / 25M = AS21 的 `rsvg-convert` @2x 光栅版 | `game/app/view/item-art.js:50 itemStaticUrl` ⇒ 四级兜底的**①层**（`/png/<与 swf 同路径>`） | `node tools/swf2svg.mjs swf/item swf/pet/icon swf/nono --out=svg --png=2`（**前置 = PATH 上有 `rsvg-convert`**） | ❌ 同上；⚠️ **工具对软链拒写**（`png/item/icon/` 那 302 条不许被覆盖，见 AS14 与 §6 事故） |
| **AS23** | `game/data/unity/{vocab,pets,features,growth,skills,buffs,items,activities,effects,manifest}.json` | 重启内容表桥 **10 个 / 7.9M**（`items.json` = 612 条） | `game/app/content.js:43-47`（**boot 硬依赖，不容错**）、`game/app/battle/driver/tables.js:23-25` | `node tools/build-unity-data.mjs`（源 = AS6 的 CSV） | ✅ **入库 10 / 10**（`activities.json` 随 2026-10-21 仓库重置入库 ⇒ ASG1 已结） |
| **AS24** | `game/data/{pets,items,rules}.json` | **原版血统**数值 + 道具字典 + 战斗规则（`items.json` 2.3M） | `game/app/content.js:47`（`official`）、`game/app/scenes/mapScene.js:801`、`game/legacy/*` | `node tools/build-data.mjs`（源 = `assets/main-config.json` + AS6 的 `exp.csv`）；`items.json` = `node tools/build-items.mjs`（源 = `vendor/seer2-origin-as3` 的 `ItemConfig__itemXmlClass.xml`） | ❌ **出库 → ②**（生成数据） |
| **AS25** | `game/data/{maps,wild}.json` | 前端地图清单 + ~~野怪分布~~（`wild.json` = **我方合成**，头注释自陈原版命令 1103 不可用）⇒ ⚠️ **`wild.json` 运行时零引用（`MDB11`，2026-10-21 断）**：留盘当**历史产物**，野怪分布的**唯一来源** = 地图 XML 的 `<npc><wild>`（现场解析，方案 C） | `maps.json` = `game/app/scenes/mapScene.js`（旧桥并存，**D2**）；`wild.json` = **运行时无消费者**（旧消费点 `wildOf`/`fetch` 已删 ⇒ 正本 `docs/map/map-impl.md §7.3.33`）；仅 `tools/*-wild*` / `fetch-pet-icons.mjs` 的**默认名单**还读它 | **顺序有依赖**：`node tools/build-map-index.mjs`（要 AS11）⇒ `node tools/build-wild-index.mjs`（可 `--need` 只看缺哪些 normal 包） | ❌ **出库 → ②**（生成数据；`wild.json` 本就运行时零引用） |
| **AS26** | `game/data/map_swf.csv` | **单一真值分流表** 8.6K（272 图 = **170 有 swf / 102 无**；列 `map_id,name,png_seq,swf_seq`） | `game/app/content.js:166/:182`（`mapSwfIdOf`）⇒ 决定 `AGENTS §4.16` 的 SWF/JS 分流 | **没有生成器**【样本：`grep map_swf tools/**` 零命中】= 一次性推导后**手工维护** | ✅ **留库（2026-10-24 纯源码口径的唯一数据例外）**（无生成器 ⇒ 入库件 = 唯一副本） |
| **AS27** | `game/data/pet_appearance_swf.csv` | 形象 id → swf 序号 桥 18K（列 `appearance_id,swf_seq,name`；id 只到 **2999**、**零条 10xxx**、**零条 `swf_seq=0`**） | `game/app/content.js:132/:149`（`swfIdOf`；重启表没有 `swfId`，靠这张桥）· ★**消费端新增（`MDB12`，2026-10-21）= 野怪上屏**：`<npc resId="Pets/pet/<形象 id>">` →（L1 `npc-art.petAppearanceId`）→ 本桥 → **AS13 帧包**；**不在表里 ⇒ `null` ⇒ 退 AS41 的 PNG**（⇒ **这张桥一旦丢，38 张图的野怪画面静默退回立绘、不报错** ⇒ 依赖比 `MDB11` 前**加重**） | 同上 = **无生成器** | ✅ **留库（同上，唯一数据例外）** |
| **AS28** | `game/data/equip-index.json` | 装备目录 104K（AS16 采集单与 M8 外观的数据源） | `game/app/content.js:555`（`loadEquipIndex`）、`tools/build-actor-assets.mjs:19`、`tools/fetch-actor-packs.mjs --icons` | `node tools/build-equip-index.mjs`（**前置 = AS24 的 `items.json` + `vendor/seer2-origin-as3`**） | ❌ **出库 → ②**（生成数据） |
| **AS29** | `game/data/actor/UI_*.bin` | 小赛尔**部件包** 15 个（`DefineBinaryData` 原字节；帧序列/帧表格式见 `docs/map/map-actor-look.md`） | `game/logic/map/actor-view.js`（`parsePack`，L1 纯解析）、包名表 = `game/logic/map/actor-look.js:98` ⇒ **实际 fetch 在 L4 `game/app/scenes/mapScene.js`**（`loadLookParts`，`actor-look.js:3` 自陈"取包与绘制全在 L4"）⇒ 地图与 PlayerInfo 的 canvas 角色 | `node tools/extract-actor-packs.mjs [src.swf]`（默认源 = **AS18 的 `swf/ui/UI.swf`**） | ❌ **出库 → ②**（可由②的 UI.swf 再提取） |
| **AS30** | `game/data/actor/equip/{manifest,pack-missing,icon-missing}.json` | 素材盘点三张：本地已有什么包 / 缺哪些包 / 图标 404 清单 | `tools/fetch-actor-packs.mjs:37`（读 `manifest.json` 的 missing 当采集单）、`docs/map/map-actor-look.md §5.5` | `node tools/build-actor-assets.mjs [--cache=<dir>]`（**前置 = 改服登录器缓存** `~/.cache/seer2-live/game-cache/index.json`，见 AS-D2）；登记件由 `--icons` 侧写 | ❌ **出库 → ②**（本机快照，随包走 ⇒ 采集后重跑工具、重打②） |
| **AS31** | `game/data/actor/equip/*.{bin,swf}` | M8 装备包**本地样本**（从改服缓存提取） | 只供本机研究（`docs/map/map-actor-look.md`） | 同 AS30 的缓存通路 | ❌ **明确忽略**（`.gitignore:66-67`，理由 = **禁二次分发**）= **合规、非缺口** |
| **AS32** | `game/maprunner/mapRunner.swf` | 我们自编译的地图容器（**29390 字节**，★M9 puppet 协议在里面 = `AGENTS §4.16` 例外三） | `game/app/scenes/mapScene.js`（`loadMapRunner` → Ruffle） | `bash tools/build-maprunner.sh`（**前置 = `tools/vendor/flex/` 的 Flex SDK + JDK8** + `playerglobal.swc`，见 `docs/external-refs.md §7`） | ❌ **出库 → ②**（自编译件，可重编译） |
| **AS33** | `game/fightui/fightUI.swf` | 自编译战斗 UI 容器 | `game/legacy/battle.html:128`、`game/fightui-test.html:17` | `bash tools/build-fightui.sh`（同 AS32 前置） | ❌ **出库 → ②**（自编译件） |
| **AS34** | `game/petContainer.root.swf` | 三方 `petContainer.swf` 经**舞台头手术**的外壳（`?url=/swf/fight/{swfId}.swf`） | `game/app/view/petbag/idleStage.js:12`、`game/app/view/battle/restartFighterStage.js:426` | `node tools/patch-swf-stage.mjs <in.swf> <out.swf> <wPx> <hPx>`（⚠️ **只能改同字节数的 RECT**、不支持 LZMA 源） | ❌ **出库 → ②**（加工件） |
| **AS35** | `game/battle-kernel.js`、`game/gaf-player.js` | AS3/v2 血统的打包内核与 GAF 播放器 | `game/legacy/battle.html`、`game/app/scenes/battleScene.js`（`#/battle` 线 = **`AGENTS §4.8` 搁置**） | `bash tools/build-kernel.sh`（**需联网 + git + pnpm + rolldown**；源锚 = `vendor/arcadia-eternity-src-snap.tar.gz` + `vendor/arcadia-commit.txt`） | ❌ **出库 → ②**（构建件；vendor 源快照同随②） |
| **AS36** | `game/core/**/*.js` | **不是素材**，但同属"改源必重生成"的生成物纪律 | 浏览器 import map（`game/index.html`） | `node tools/build-core.mjs`（纪律正本 = `AGENTS.md §3` / `docs/arch-code.md §7.1`） | ❌ **出库**（2026-10-24 纯源码口径 ⇒ 与本份判据 2 终于一致；克隆①后必跑一次 `build-core.mjs`） |

---

## 4. 速查总表 D · 运行期落盘与仓外件（**只链接 `docs/external-refs.md`，不在此重复**）

| # | 位置 | 是什么 | 怎么来 | 入库 |
|---|---|---|---|---|
| **AS-D1** | `saves/save{id}.xml` | 运行时真档（Save 线落点） | **真人玩一把** ⇒ 浏览器 `PUT /saves/<name>.xml`，写端点 = `node tools/serve.mjs [--port=8090] [--root=<dir>] [--cache=<dir>]` | ❌ `.gitignore:63`；**比对夹具** `tools/fixtures/save-lite4.9.2-{played,default}.xml` ❌ 出库 → ②（上游真档文本；口径 = `AGENTS §4.3`） |
| **AS-D2** | `~/.cache/seer2-live/game-cache/`（**仓库外**） | 改服登录器的素材缓存（装备包 `.swf` + `index.json`） | **真人用改服登录器进一次游戏**；`tools/serve.mjs` 以 `/game-cache/` 只读挂出来 | ❌（不在仓内）；缺它 ⇒ AS30 盘点直接报「先运行改服登录器缓存素材」 |
| **AS-D3** | `har/`（36M）、`logs/` | 抓包证据 / 运行日志 | 人工浏览器抓取 / 运行期写 | ❌ `.gitignore:9/:58` |
| **AS-D4** | `ruffle` → `node_modules/@ruffle-rs/ruffle` | Flash 播放器本体 | `npm install`（仓 `package.json` **无 build 脚本**【样本】，只有 `test`） | ❌ `.gitignore:42` |
| **AS-D5** | `tools/vendor/flex/`（115M） | Flex SDK（编译 AS3） | **手工放置**（无脚本能重建） | ❌ `.gitignore:39` |
| **AS-D6** | `/home/wing/Software/Seer2/…0827/…` | 上游 Unity 二进制 = 差分 oracle 前置 | 发行安装物 | ❌（**在仓外**；细节与"丢了会怎样" = `docs/external-refs.md §7`） |
| **AS-D7** | `assets/main-config.json`（1.7M） | 原版数值样本 = AS24 的输入 | 手工留样 | ❌ **出库 → ②** |

---

## 5. 发布分卷与新克隆复原（人类 2026-10-24 定三段式，后收紧为「**git 只装自己编写的文本源码**」）

**git 只装 ①**；②③ 是随发布走的压缩包与脚本，**不进 git**（`.gitignore` 已挡回）。

### ① 源码 = git 仓库本身（480 个文件 / 7.6M，几乎全文本）

自己编写的源码与文档：`game/{app,logic,legacy}/**`（手写 .js）、`game/core/**/*.ts`（权威源；`.js` 是转写产物不进库）、
`game/{maprunner,fightui}/**`（.as + build-config.xml）、`tools/**`（.mjs 工具 + oracle-cs C# 源；fixtures 除外）、
`docs/**`、根目录 md / `package*.json`。
**唯一数据例外** = 两张自推导真值 CSV（`game/data/{map_swf,pet_appearance_swf}.csv`，无生成器、丢了只能重推 272 张图）。
⇒ **克隆①后**：`npm install` + `node tools/build-core.mjs` + 解② + 拉③ ⇒ 可玩。

### ② 必要素材/数据包（`seer2-assets-essential.zip` ≈ 190M；**无网络脚本可拉**的运行必需件）

```bash
zip -r seer2-assets-essential.zip \
  game/data game/scenes game/battle-kernel.js game/gaf-player.js \
  projects/Seer2-Restart-Lite-main/Assets/Resources/Panels \
  projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites \
  projects/Seer2-Restart-Lite-main/Assets/Resources/Prefabs \
  projects/Seer2-Restart-Lite-main/Assets/StaticResources \
  "projects/Seer2-Restart-Lite-main/Assets/Resources/Fonts/Mini Diamond.TTF" \
  "projects/Seer2-Restart-Lite-main/Assets/Resources/Fonts/Zongyi.TTF" \
  projects/Seer2-Restart-Lite-main/Assets/Resources/Data \
  projects/Seer2-Restart-Lite-main/Resources \
  assets/main-config.json tools/fixtures samples vendor \
  swf/ui swf/module png/item/icon
# ⚠️ game/data 里两张 CSV 与 git 重叠（内容一致；解包覆盖亦无害）
# 新机器复原：克隆①后解压到仓库根
```

内容 = **运行数据**（`game/data` 数据桥+盘点+bins 14.4M〔两张 CSV 除外〕、上游 `Data` 608 个 CSV+地图XML 4.1M、
`main-config.json` 1.7M、真档夹具、`game/scenes` 图集、vendor 源码快照 tar.gz）+
**美术四棵**（小地图切片 36.6M / buff 27.5M / HUD 头像 32.6M / 静态 UI 6.5M / Sprites 4.3M / Prefabs 2.7M）+
2 个 web 字体 TTF + **人工采集件 `swf/ui`×3 与 `swf/module`×3【⚠️ 全网无脚本可拉，丢了只能重采】** +
302 个官方图标真文件 + 自编译件（`mapRunner.swf`/`fightUI.swf`/`petContainer.root.swf`）+ 研究样本 `samples`。
可选扩展：ASG8 六棵大图（Maps 432M / Npc 25M / Pets/pet 121M / BGM/pet 253M / Pets/battle 221M；Items 已含在②的 302 图标）
若要画面完整需另打包或直接发上游发行包原 zip（`docs/external-refs.md §4`）。

### ③ 网络拉取件（≈ 514M；全部有 fetch 脚本，也可打成 `seer2-assets-cdn.zip` 直接分发）

```bash
node tools/fetch-swfs.mjs                 # swf/fight 1606 个宠战斗动画（403.9M）
node tools/fetch-maps.mjs                 # swf/map 226 张地图画面 + config/*.xml 259（67.6M）
node tools/fetch-pet-demo.mjs             # swf/pet/demo 980 个背包预览（30.5M）
node tools/fetch-actor-packs.mjs --icons  # swf/item/equip/icon 1687 张（7.2M；前置 = ②的 vendor + build-equip-index）
node tools/fetch-pet-normal.mjs --ids=…   # swf/pet/normal 82 个野怪帧包（4.5M；id 由地图 XML resId 经 AS27 桥推出）
node tools/fetch-pet-icons.mjs            # swf/pet/icon 128（0.4M；可选）
node tools/fetch-item-icons.mjs <id> …    # swf/item 零件 15 + nono 1（点名补；可选）
```

### 重新生成才需要（新克隆①+②+③后可跳过）

```text
node tools/build-core.mjs                   # core .js（克隆①后必跑一次）
node tools/build-{data,items,unity-data,map-index,wild-index,equip-index}.mjs   # 数据桥（②里已有产物）
bash tools/build-maprunner.sh / build-fightui.sh    # 改 AS3 容器才需要（前置 Flex+JDK8；②里有现成 swf）
node tools/swf2svg.mjs … --out=svg --png=2  # 静图离线提取（可选加速，产物不入库）
```

**丢了就真没了的件**：②里的 `swf/ui`/`swf/module` 六个人工采集件、`assets/main-config.json` 数值样本（②里）、
两张真值 CSV（好在①里）、AS-D2 登录器缓存（永不在库）。其余一切要么可脚本拉回、要么在上游发行包。


## 6. 事故与限制登记（不重复制定，只指过去）

- **静图批覆盖原图事故（1 条）**：`rsvg-convert -o` 跟随 `png/item/icon/1.png` 软链、把 `Resources/Items/1.png`（赛尔豆货币图标）覆盖，**盘上无第二份、不可恢复**；
  工具已加**软链拒写**并复跑验证 ⇒ 正本 = **`docs/item/item-design.md §3.1`「事故登记」**（含替身口径 = 同一 swf 的矢量重栅格版，人类拍板"维持现状"）。
- **静图八行未覆盖（发光/掩膜/未建模标签/位图/多帧…）**：**都不补**（人类 2026-10-20 拍板）⇒ 逐行数字与样本文件 = `docs/item/item-design.md §3.1` 限制表。
- **图标播放时序（Ruffle 忽略 detached 元素）**：根因与修复 = `docs/view/panel/playerinfo/playerinfo-impl.md §7.6`（PI-h）；四级兜底链的现行口径 = 同文档 **§7.7**（PI-i）。

---

## 7. 缺口登记 ASG1–ASG10（**现状如此，不是设计**；证据一律【样本】= 本次实测）

| # | 缺口 | 可观察后果 | 建议处置 |
|---|---|---|---|
| **ASG1** | ✅ **已结（2026-10-21）**：`activities.json` 随仓库重置入库（`git ls-files game/data/unity` = **10/10**） | 新克隆不再卡「载入中…」 | 原建议"补 `git add`"已由重置提交顺手解决 ⇒ **ASQ1 已决** |
| **ASG2** | ✅ **已结（2026-10-21）**：`map_swf.csv` + `pet_appearance_swf.csv` 已入库；**仍无生成器** ⇒ 入库件 = 唯一副本、改表手工维护后提交 | 分流真值不再只活在本机 | 同上 |
| **ASG3** | `…/Resources/Pets/battle/`（**990 PNG**）盘上有、入库 0，而 `game/app/view/panels/battle/_kit.js:37` 读它 | 新克隆里"战斗舞台缺 swf 的回退形象"全缺 ⇒ 只剩更下层的兜底 | 要么把这一棵加进 `.gitignore` 白名单（约等于 AS1 的体量），要么**改代码**不依赖它；⇒ **ASQ2** |
| **ASG4** | `png/item/icon/` 的 **302 条软链入库、指向的 `Resources/Items/` 不入库** | 新克隆里这 302 条**全部悬空**（`git ls-files …/Resources/Items` = 0）⇒ 道具/货币图标落回②Ruffle 或③，货币那颗（`1.png`）**连原图都不在盘上**（§6 事故） | 在 `.gitignore:49-50` 的注释里**如实写明"软链在新克隆里会悬空"**；真要稳 ⇒ 把 `Resources/Items/` 也放行进白名单 ⇒ **ASQ2** |
| **ASG5** | ✅ **已结（2026-10-21）**：`swf/item/equip/icon/` **1687 件已入库**（重置提交卷入，`git ls-files swf/item/equip/icon` = 1687 ⇒ 相当于当年 ASQ1 的 **B 档**被重置顺手做掉） | 装备图标镜像不再是工作区孤儿，克隆即得 | **后续（2026-10-24）**：人类为推 Gitee 拍板 A 档 ⇒ 这 1687 件已 `git rm --cached` 出库 + `.gitignore` 挡回（本地保留），拉回 = `fetch-actor-packs.mjs --icons` ⇒ 见 **ASQ3** |
| **ASG6** | ✅ **已结（2026-10-21）**：`equip-index.json` + `actor/equip/` 三张盘点件全部入库（原建议"盘点件写进忽略"**未采纳**，既成事实 = 入库） | 盘点件从"本机快照"变成"随库走" ⇒ **每次采集后须重跑 `build-actor-assets.mjs` 并提交**，否则与盘上漂移（`missing` 数字失真） | 无（事实登记）；介意"快照入库"再单开拍板 |
| **ASG7** | ✅ **已结（2026-10-21）**：`manifest.json` 已入库 ⇒ `.gitignore:65` 注释「清单 manifest.json 入库」**与事实一致** | 无 | 无 |
| **ASG8** | **本次补盘查出的最大一格**：`Resources/Maps/`（432M，含 `bg/` 240 张）+ `Resources/Npc/`（25M）+ `Resources/Pets/pet/`（121M）+ `Resources/BGM/pet/`（253M）**整棵被 `.gitignore:22` 排除，但运行时真在读**（AS40/AS41） | 【样本】合计 **约 831M** ⇒ 新克隆里 **JS 回退图没有背景（黑底）、NPC 全落占位橙点、对话头像缺、图鉴叫声静音**（B3 / A2 / ★分流口径全部退化，但**不崩** —— 四级兜底与占位橙点就是为此而设） | **别放行**（把仓库撑到 GB 级正是 `.gitignore:11`「上游参考 11G 只留本机」要避免的事）。正解 = 把"这几棵树必须先取上游发行包"写进 **§5 bootstrap 第 ② 步**与各线**手测前置**（本份已照此写）；要真金白银的稳定 ⇒ 只有换素材源（自绘 / 压缩）一条路，那是新批，不是 git 配置。⇒ **ASQ2** |
| **ASG9** | **装备缺件族**（人类 2026-10-21 顺着"五周年冠军坐骑怎么找不到"量出来的整片）：**部件包缺 14 个文件 = 11 件物品** + **装备图标缺 48 件**，登记件 = `game/data/actor/equip/{pack-missing,icon-missing}.json`（明细表 = `docs/map/map-actor-look.md §5.7 ①/②`） | 【样本】全部 = **打官服 `seer2.61.com` 得到的 HTTP 404**，且**同批探针里对照组 200**（如坐骑 `136403_0` ⇒ 200，`157003_0/_1` ⇒ 404）⇒ **不是我们拼错名**（公式 = 上游 `EquipItem.as:103` 自己的 `resourceId` 规则，L1 `actor-look.js` 复用）⇒ **官服侧真无货 = 不可补**。后果 = 这 11 件穿上只能画 fallback、48 件的图标落四级兜底末位色块。**另有 132 条不是缺口**（129 = 槽 9 NONO 装、`tools/build-actor-assets.mjs:78` 按 `slot<1\|\|slot>8` 主动跳过；3 = 蓝/红手身脚走仓库 `.bin` 裸装，`:68-72` `NAKED_REFS`）；`127906`（渡鸦战靴）= **半件**（`_1` 200、`_0` 404） | **处置已定（人类 2026-10-21 指令①= A）**：**只玩家面（PlayerInfo 装备目录）剔除**这些无包件 ⇒ 目录 1701 → **1666**；**调试入口 `APP.actorLook.equip/ride` 不屏蔽**（将来补到货要靠它验）、**存档里已有的无包件不静默改档**（照常画 fallback + 一行缺包日志）。图标缺**不作**剔除条件，但**可自造兜底**（人类 2026-10-21 问「能不能从部件 swf 生成」⇒ `ALQ14`）：48 件三分 = **5 件可从已缓存的部件包裁静图**（`100106/100107` 旗帜 + `100242–100244` 公仔，工具 `tools/pack-icon-stills.mjs` ⇒ `png/item/equip/icon/`，见 **AS43**）／**5 件包也 404 无从生成**（`100233/100337/101335/101493/101737`，本就被剔出目录）／**38 件不在玩家面**（颜色件 + 槽 4/9）。⇒ 落码 as-built `docs/map/map-impl.md §7.3.30`（PI-j）+ **`§7.3.31`（PI-k：再剔 `suit=0` 空件 + 补「表情」组 ⇒ 六组 1666 → 七组 1685）** / `docs/view/panel/playerinfo/playerinfo-impl.md §7.8/§7.9` |
| **ASG10** | **野怪这一格曾完全依赖未入库的立绘**（`MDB12` 顺手量出来的一条资产事实，2026-10-21）：`Resources/Pets/pet/*.png`（**AS41** 那 425 张的一部分，被 `.gitignore:25` 整棵排除）**从来不是地图 sprite** —— 它们是**图鉴/对话用的全身立绘**（实测 `20.png` = **111×124**、`240.png` = **736×980**、`119.png` = **500×573**、`10013.png` = **102×102**），而 `<npc @size>` 声明的是 **48×54** 那一类 ⇒ 从前地图上那些野怪 = **立绘被硬缩成小卡片**（糊、且比例失真）。**Flash 时代真正的地图小精灵住在 AS13 的帧包里**（`frameW×frameH` = 28×31 那一类） | 【样本】`MDB12` 后 **38/53** 张图改吃 AS13（**入库、可克隆可复现**），**15/53** 张（`10015…10043` 段，桥 AS27 里**没有 Flash 对应物**）**仍只能吃这张未入库的立绘** ⇒ 新克隆上这 15 张图的野怪会**落回占位/兜底**（同 **ASG8** 的"必须先取上游发行包"前置，**不崩**）。**没有据此开工**：要么放行 PNG（= ASQ2 的 C 维持现状反对），要么给这 15 种**伪造**素材（`MDB11` 已明令禁止）⇒ 只登记 |

> ⚠️ **ASG1/ASG2/ASG5/ASG6 的根因是同一个**：`.gitignore` 只管"排除"，**从没保证"该提交的都提交了"** ⇒ 全仓缺一个"未入库且未忽略"的巡检口径。本份**不新增脚本**（`AGENTS §1.1` 决议⑦），把这句话留在表里。
> **2026-10-21 的实况**：仓库因对象库损坏**重置为单一初始提交**（以工作区全量入库）⇒ 这四格 + ASG7 被**一次性清零**。但根因（无巡检口径）仍在 —— **下次再出现"未入库且未忽略"的件，同样没人会发现**，只是这次运气好被重置兜住了。

---

## 8. 待拍板 ASQ1–ASQ2（按 `AGENTS.md §1.2` 决议 ⑧ 先说人话）

**ASQ1 · "该入库却没入库"的这几件，要不要我补一次 `git add`？—— ✅ 已结（2026-10-21，非逐项拍板）**
- **结法**：仓库因对象库损坏**重置为单一初始提交**（以工作区全量入库）⇒ 当年点名的 **1694 个文件全部进库**：
  `unity/activities.json`（40K）、两张 CSV（27K）、`equip-index.json`（102K）、`actor/equip/` 三张盘点件、以及原 A 方案说"先不动"的 **1687 张装备图标（11M）**
  —— 相当于 **B 档被重置顺手做掉**。新克隆不再卡「载入中…」、分流真值入库。
- **留观两条**：① 仓库因此变胖（pack ≈ 536M，其中 `swf/**` ≈ 534M 全量入库）——若要瘦回 A 档需人类显式拍板（`git rm --cached` + `.gitignore`），**未做**；
  ② 根因（"未入库且未忽略"无巡检口径）仍在，见 §7 脚注。

**ASQ2 · 上游那几棵"盘上有、库里无、运行时真在读"的图，要不要放行进 git？**（= ASG3 + ASG4 + ASG8 三格合并成一问，因为它们是同一个决定）
- **这是什么**：这些 PNG/MP3 只在**上游发行包**里，`.gitignore` 把 `Resources/` 整棵排除、只手工放回了 `Buffs/`、`Pets/icon/` 两棵 ⇒ 剩下的**运行时在读但克隆里没有**：
  `Resources/Maps/bg/`（JS 图背景，240 张 / 432M）、`Resources/Npc/`（NPC sprite 138 张 / 25M）、`Resources/Pets/pet/`（对话头像 425 张 / 121M）、`Resources/BGM/pet/`（叫声 4401 个 / 253M）、`Resources/Pets/battle/`（战斗回退形象 990 张 / 221M）、`Resources/Items/`（道具/货币图标 302 张 / 30M）。合计 **约 1.1G**【样本：`du -ch` 这六棵 = 1.1G】。
- **为什么现在问**：这决定**"换新机器/给别人一份仓库时，画面长什么样"**。现在的答案是"背景黑、NPC 变橙点、没头像、没叫声、货币图标落兜底"，
  而且**这不是 bug 而是设计**（四级兜底链 + 占位橙点 = `AGENTS §4.11/§4.13/§4.14` 就是为了让它"退化但不崩"）。
  ⚠️ 但它同时也意味着：**各线的手测结论只在"本机有发行包"的前提下成立**。
- **选项与后果**：
  **A = 放行**（把这六棵加进 `.gitignore` 白名单）⇒ 克隆即完整画面；代价 = 仓库再胖 **约 1.1G**、且违背 `.gitignore:2`「只留自有成果」与 `:11`「上游参考只留本机」两条**成文原则**，版权件也全部进 git 历史（**以后想瘦都瘦不掉**）。
  **B = 不放行，改代码不依赖**（把 `Maps/bg` 换压缩版、`Npc`/头像自绘或裁雪碧图、叫声要么砍要么换小体积源）⇒ 仓库不胖且克隆自足；代价 = **一批实打实的素材工程**（不是配置活），且画面会偏离原版。
  **C = 维持现状**（建议）⇒ 零成本；代价 = "先取上游发行包"永远是人手前置，文档必须把这句话写明（本份 §5 第 ② 步 + 各线手测前置已经这么写），ASG8 的"退化画面"就当作**已知前置未满足**而不是 bug。
- **我的建议**：**C**，并把 ASG8 一句话挂进 `docs/status.md §3`（已知风险）—— 理由是**现在的兜底行为已经是"不崩"的**，而 A 的代价不可逆（版权件进 git 历史）、B 的代价是一整条新工作线，都不该由一次盘点顺手决定。
- **你只需回**：`A` / `B` / `C`（选 B 的话不必指定哪棵，我会另开一条线来谈）。

**ASQ3 · 推 Gitee 的仓库瘦身 —— ✅ 已决（2026-10-24，人类拍板 A 档）**
- **背景**：Gitee 免费版限额 = 单仓库 500MB / 单文件 50MB / 单次 HTTP 推送 500MB；重置后的单一初始提交含 764.7M blob（pack 561MB）**超限推不动**。
- **拍板 A 档（出库 = `git rm --cached`、本地文件全保留、游戏照跑）**：四棵 CDN 可拉回件（`swf/fight` 403.9M + `swf/map/*.swf` 67.4M + `swf/pet/demo` 30.5M + `swf/item/equip/icon` 7.2M）
  + Fonts 大件（~84M 的 `.TTC`/`.SDF`，只留 web 端 `@font-face` 真用的 `Mini Diamond.TTF`/`Zongyi.TTF`）+ AS39 零引用件（11.9M）
  ⇒ 索引剩 **6787 个文件 / 163.6M**（最大单件 4.8M，均在限额内）。
- **拉回方式**：四棵 CDN 件 = §5 第 ⑥ 步四条命令；Fonts/AS39 = 发行包件（§5 第 ② 步取上游树后自会有）。
- **配套机制**：初始提交由人类 `git commit --amend` 重做 + `git gc --prune=now`（**旧 blob 不清、推送体积不降**——追加新提交是瘦不下来的；⚠️ 实测补充：reflog 锚着 amend 前的旧提交 ⇒ 须先 `git reflog expire --expire=now --all` 再 gc）；`.gitignore` 已加挡回规则；**Gitee 仓库必须建私有**（内含版权素材，README 自我声明"不二次分发"）。
- **同日追加（三段发布）**：人类进一步定发布形态 = **①源码 git 仓 / ②必要素材压缩包（~155M，含人工采集件）/ ③网络拉取素材（~513M，含可打包分发）** ⇒ 第二波出库（发行包美术棵 + 2 TTF + `swf/ui`/`swf/module` + `swf/pet/normal` + 302 条软链图标，5165 个 / 129.6M）⇒ **git 终态 = 1622 个文件 / 33.9M**（纯源码 + 数据真值 + 微量数据型小件）；三卷清单与命令 = **§5**。
- **第三波（同日再收紧）**：人类定「**远程仓只装自己编写的文本源码**」⇒ 再出库 1142 件 / 26.2M（`game/data` 全部数据桥与盘点〔两张 CSV 例外〕、上游 `Data` 608 + `main-config.json`、`core` 转写 `.js`、fixtures 真档、`game/scenes`、自编译三 swf、vendor 源快照、samples、swf 上游小件、探针 swf、`ruffle` 软链）⇒ **git 终态 = 480 个文件 / 7.6M**（几乎全文本，唯一数据例外 = 两张真值 CSV）；②号包扩为「必要素材/数据包 ≈190M」（清单 = §5）。
- **终决（同日）**：人类定 **Gitee 公开仓 + GPL-3.0（`LICENSE`）+ `NOTICE` 尊重声明** —— 定位 = 从文档重实现的**引擎/运行时**，不含、不分发任何原作素材（②③号包独立于仓库之外）；"必须私有"的旧建议就此作废。**边界仍要守住**：今后任何原作素材都**不得**因公开而回流 git（`.gitignore` 挡回规则即为此设）。

---

## 9. 与其他文档的关系（谁指正本）

| 主题 | 正本 | 本份的角色 |
|---|---|---|
| 外部仓 / 仓外硬依赖 / 版权分发 | **`docs/external-refs.md`**（§3/§4/§7/§8） | **只引用**（§4 表 D 整块） |
| 静图离线提取的实现细节、八行限制、事故 | **`docs/item/item-design.md §3.1`** | 摘要 + 链接（§6） |
| 图标四级兜底链的现行口径 | **`docs/view/panel/playerinfo/playerinfo-impl.md §7.7`**（PI-i）+ 设计条 `playerinfo-design.md §3.8` | 消费点登记（AS22） |
| 素材定向拉取政策（能不能抓、抓多少） | **`docs/map/map-actor-look.md §5.5`** | 引用为 AS16 与**表 B 整块**的前置纪律 |
| 地图 SWF 优先分流 | **`docs/map/map-code-map.md §2.4`** + `AGENTS.md §4.16` | 登记 AS26 = 那张表的**存放处与易失性** |
| 生成物纪律（改源必重生成） | **`docs/arch-code.md §7/§7.1`** + `AGENTS.md §3` | §5 bootstrap 的执行顺序 |
| 存档件（真档 vs 夹具） | **`docs/save/save-xml-spec.md §6.1`** / `save-impl.md §6.1` | §4 只登记落点与忽略 |

**§0.1 目录树的收录状态**：本份已作为**顶层跨线专题件**登记进 `docs/arch-docs.md` 的 **§0.1 目录树**、**§6 每线文档索引**、**§7 命名卫生**（「顶层跨线专题件不带 `<线>-` 前缀」那条 + `AS*`/`ASG*`/`ASQ*` 前缀声明），
与 `external-refs.md` 同类、同样**不带 `<线>-` 前缀**。⚠️ `docs/external-refs.md §9` 自留的四处"挂号待办"（把它自己收进树与索引）**不在本批范围**，原样留给人类或该线结账 —— 本份只登记了自己这一件。
