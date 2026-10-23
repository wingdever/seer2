# 地图线 · 落地计划（map-impl.md）

> **父文档**：`docs/map/map-design.md`（总设计兼导读 · `MP1–MP8` 不变量 · `MC1–MC8` 上游怪癖 · `MQ1–MQ8` 决议 · `MB1–MB5` 施工批）。
> **子设计（真值，本份只引用不重复）**：**M1** `docs/map/map-data.md` · **M2** `docs/map/map-npc.md` ·
> **M3** `docs/map/map-condition.md` · **M4** `docs/map/map-dialog.md` · **M5** `docs/map/map-teleport.md` ·
> **M6** `docs/map/map-battle-trigger.md` · **M7** `docs/map/map-move.md` · **M8** `docs/map/map-actor-look.md`（📝 角色外观资料索引 + 配对 impl 计划 = 本份 **§3.10**；**`MDB8-a`–`d` 已落并手测通过 · `MDB8-e` 代码已落 2026-10-20 · §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · `MDB8-f` 代码已落 2026-10-20 · §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · `MDB8-g` 代码已落 2026-10-20 · §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · `MDB8-f2`（修「双角色」）代码已落 2026-10-20 · §8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**）（`docs/map/map-design.md §9.1`）。
> **配对代码地图**：`docs/map/map-code-map.md`。
> **结构面**：`docs/arch-code.md §2/§3`；文档形态 / 证据标注 = `docs/arch-docs.md §2/§4`；as-built 纪律 = `docs/arch-docs.md §5`。
> **邻线写法范本**：`docs/orchestration/orchestration-impl.md`、`docs/save/save-impl.md`、`docs/view/scene/start/view-scene-start-impl.md`。
> **验收口径**：`AGENTS.md §1.1`（**主验收 = 人类把游戏跑起来手测 + 反馈**；AI **不新写**测试脚本、**不为验收去跑**）。
>
> **状态**：✅ **阶段一续产物** —— MB1–MB10 已分批落码（as-built §7.3）；**M8 追加切片 = §3.10（`MDB8-a…g` + 插入 `b2`/`b3`/`f2`）· `a`–`b3` 已落且手测通过（2026-10-20，人类「全部完美」；as-built §7.3.15/§7.3.17/§7.3.18/§7.3.19；`b2` 同日两轮手测修补：idle 停顿/整体镜像 + 光轮闪阴影/套装站立射箭；`b3` = 光轮/阴影手动切换）· `c` 已落且手测通过（as-built §7.3.20）· `d` 已落且手测通过（as-built §7.3.21，坐骑速度 + 浮动；人类「it worked good」）· `e` 代码已落（as-built §7.3.22，素材清单 + 缺包日志）· §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · `f` 代码已落（as-built §7.3.23，SWF 路叠层）· §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · `g` 代码已落（as-built §7.3.24，存档 `<equip>` 接线）· §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · **`f2` 代码已落（as-built §7.3.25，SWF 裸装角色显隐 = 修「双角色」；人类手测 f 后点名「修」，`AGENTS §4.17②` 授权例外之二）** —— **M8 追加切片代码已全落（a–g + f2）**。✅ **M9（SWF 路角色提线化）设计已过审（人类 2026-10-20「照抄 JS 图」）· `MDB9-a` 已落并手测通过（2026-10-20「nice, 现在ok了」；as-built §7.3.26、手测 §8.21；`game/maprunner/**` 授权例外之三）· `b` 回归已过（2026-10-20「都过」，§8.22 五条全过）· `c`（收口）**已拍板 A·退役（2026-10-20）并落码 + 手测通过（as-built §7.3.27、手测 §8.23 ✅ 2026-10-20「整体结账」）—— ★M9 全线结账（a/b/c 全过；遗留仅「前景遮挡穿帮 / 朝向滞后」两条例登记人眼校项）****。✅ **M8-h（`MDB8-h` · 2026-10-21 人类三条指令 ⇒ `ALQ10=A / ALQ11=A`）已落码**：玩家面目录只列**有部件包**的件（11 件官服 404 不再露出、缺件实名表 = `map-actor-look §5.7`）+ 12 色**独立成「颜色」组**（不进部件表、不落盘）⇒ as-built **§7.3.30**、**手测 §8.24 ✅ 已通过（2026-10-21，人类「ok, done good」）**（View 侧同批 = `playerinfo-impl` **PI-j** / 手测 **#20**）。✅ **M8-i（`MDB8-i` · 2026-10-21 人类四条反馈 ⇒ `ALQ12`/`ALQ13`/`ALQ14`）已落码**：面板补**「表情」组**（槽 8、20 件、要落盘）+ `suit=0` **空件不列**（默认头顶/默认眼睛）+ 新工具 `tools/pack-icon-stills.mjs` 从部件包裁 **5 张图标静图**（兜底链第①级、运行时零改动）⇒ as-built **§7.3.31**、**手测 §8.25 ✅ 已通过（2026-10-21，人类「ok, done good」）**（View 侧同批 = **PI-k** / 手测 **#21**）—— ⚠️ **h 的三条指令反馈 = 催生 i 的那四条 ⇒ 同盘面一并确认，两批就此收口**；**M8 两条手测 §8.17（e · 新包上屏）/ §8.19（g · 存档 `<equip>` 落盘）✅ 已通过（人类 2026-10-21「全部测试通过」） ⇒ M8 全线收口**（`§8.18`/`§8.20` = f/f2 的 SWF 旧链面，已随 ★M9-c 退役、不可测，等价判据并入 `§8.23` ✅）。✅ **MDB10（野怪**图像**对话气泡 · 2026-10-21 人类点名，`§7.3.30` 预登记的那条"新批"照单落地）已落码**：新 L1 `logic/map/talk.js`（气泡调度从 `wander.js` **迁出**、**JS/SWF 两条路都出** = 人类拍板 ①）+ `npc-art.talkImageUrl`（盘上 31 张静图 = 24 toon png + 7 meme jpg）+ L4 接线 ⇒ **图与文同一个池子均匀随机**（≈3/4 表情 / ≈1/4 台词 = 人类拍板 ②，照上游 `TryShowTalk`）⇒ as-built **§7.3.32**、手测 **§8.26** ✅ 已通过（人类 2026-10-21「全部测试通过」）（不碰 `game/maprunner/**` ⇒ 无需新围栏例外）。✅ **MDB11（野怪分布单一来源 = Unity `<npc><wild>` · 2026-10-21 人类点名「先不引入其它逻辑」）已落码**：**断开**我方合成的 `game/data/wild.json` 那条平行通路（AS3 `WildPet` = 第二套野怪：自己溜达 + `Lv+名字` 脚标 + 自己点击开战）⇒ `wild: ''` 让 AS3 零生成（**不碰 `game/maprunner/**`、不重编译**，`WildPet.as` 留成不可达死码）+ JS 侧那套只服务它的代码**整条删除**（`wildOf`/`startWildFight`/`numericIdOfWild`/`mapWild`/`mapPets`/`mapWildFight`/`drawLabels`/`#lbl` 层）；人类三条拍板 = **① 彻底收口 / ② 空图就没有（219 张不伪造）/ ③ 漫游 JS+SWF 两条路都走**（SWF 路"怪动帧才重绘"）⇒ 同时**结掉 2026-10-18 起就写在文档里的"退场"旧账** ⇒ as-built **§7.3.33**、手测 **§8.27** ✅ 已通过（人类 2026-10-21「全部测试通过」）。✅ **MDB12（野怪**素材**改取 Flash 帧包 · 2026-10-21 人类点名「素材能否还是取自 swf，而不是重启的 png」）已落码**：**分布逻辑一字未动**（仍 = `MDB11` 的 Unity `<npc><wild>` 单一真值），只把 `#npc` 层画的那张图从「重启宠物立绘 PNG（被 `<npc @size>` 硬缩）」升级为「**Flash 帧包原生像素 + 走/站两态 + 左右镜像**」——新 L1 `game/logic/map/pet-view.js`（标签别名/动作/帧号/锚点纯换算，复用 `actor-view.parsePack/pickFrame/frameRect`）+ `npc-art.petAppearanceId`（`resId`→形象 id）+ 既有桥 `CONTENT.swfIdOf` + L4 `ensurePetPack/petHitOf/drawPetFrame`；**抓 34 个缺包入库**（`swf/pet/normal` **48→82**，≈2.3 MB）⇒ **80 只 / 38 张图**走帧包、**30 只 / 15 张图**无 Flash 对应物 ⇒ **仍走重启 PNG、不伪造**；**零 `game/maprunner/**`、不重编译 AS3** ⇒ as-built **§7.3.34**、手测 **§8.28** ✅ 已通过（人类 2026-10-21「全部测试通过」）。✅ **MDB13（野怪四件细节 = 脚下阴影 / `personal` 驻停小动作 / `Lv` 等级脚标 / 惊讶特效 · 2026-10-21 人类点名「接下来做野怪的 4 条」）已落码**：把 `MDB12` 登记为"不做"的那四条 ❌ **逐条补齐**（语义照抄上游 `WildPet.as`，**零 `game/maprunner/**`、不重编译、零新素材** —— 阴影与「!」借 `game/data/actor/UI_ActorShadow.bin` / `UI_SurpriseMark.bin`，官服同名两件 404）⇒ 四件 = **`-a` 帧包野怪脚下软阴影（`scale=frameW/40`、剪影一次性离屏预渲染、不跟着镜像）** / **`-b` `personal` 每次驻停播一次（实测 82/82 包有素材：81 只 `personal` + `114` 的 `free`；`PERSONAL_MAX=48` 截长，58/82 被截；无兜底 = 缺材不播）** / **`-c` 整串 `Lv13 奇鲁` 移到脚下（金字白边）+ 撤野怪头顶名（非野怪 NPC 头顶名一字未动；等级真值 = `<battle>` ⇒ 4 处与名字不一致属预期）** / **`-d` 点野怪先播头顶「!」≈0.8 s 再开战（`PET_MARK_FPS=30`、独立 rAF 自起自停、连点吞、离开图即取消、素材未就绪则不延迟）** ⇒ as-built **§7.3.35**、手测 **§8.29 ✅ 已通过**（人类 2026-10-21「test ok」= 一揽子通过、未逐条拆分回报）⇒ **MDB13 全线收口**（四条拍板 = ① 先播完再开战 / ② 整串移脚下撤头顶名 / ③ 每次驻停播一次 / ④ **四件一起落完再测** ⇒ 四个提交连发、清单合并成一份）。✅ **四条拍板已结账（人类 2026-10-18）**（判据 `AGENTS.md §1`）。
> ⚠️ **本线已有存量落地代码**（不是空地）：`game/app/scenes/mapScene.js` 的**光口 + 两步走 + 出口名悬浮说明**、
> `tools/build-map-index.mjs` 的**旧（AS3）桥**。它们属于**邻线 B3 期**的产物，建在 **AS3 血统**上；
> 本份的 **§7 as-built** 先把这两处**如实登记**，再给**桥改读 Unity 的重生成序列**（`docs/map/map-teleport.md §8` 点名要求）。
>
> **编号纪律**（引用须带限定词）：
> `MP*` 不变量 / `MC*` 上游怪癖 / `MQ*` 决议 / `MB*` 施工批 —— **design 的本地编号**；
> `MD*`（M1）/ `MN*`（M2）/ `CS*`（M3）/ `DL*`（M4）/ `TP*`（M5）/ `BT*`（M6）/ `MW*`（M7）—— **各子设计本地编号**；
> `D1–D12` 本份**落地决策** · `MIP1–MIP4` 本份**四条拍板（✅ 已决 2026-10-18）** · **`M8-I1–M8-I6`** = §3.10 的 M8 **impl 级局部条款** —— **都不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）。
> ✅ **人类 2026-10-18 四条拍板已折进本份**：① `activity` 键值袋**做**（= 复用存档的 `<activityStorage>`，**D9**）· ② **通行面暂时不实现**（⇒ **MB8 ⏸ 搁置**；⚠️ **MB9 漫游照做** —— "不判断通行 = 哪里都能走"）·
> ③ 过渡期**画面吃 AS3 / 规则吃 Unity**（**D2/D3 确认**）· ④ 实体表现**用 SWF 美术素材**（**D10**，⚠️ **同日追加**：**实体/野怪的"分布"吃重启数据 + 简单归一化换算** = 路线 A）；另加 **⑤ 注释口径 = 直接忽略**（**D11**）。见 §2.1 / §9。

---

## 0. 这份文档回答什么（与 design 的分工）

| 问题 | 在哪 |
|---|---|
| 地图里有什么 / 遇到它会发生什么 / 怎么走到下一张图 | **design** `docs/map/map-design.md` + M1–M8（**真值**；M8 = 角色外观资料索引，impl 计划 = 本份 **§3.10**） |
| **先做哪一件、做在哪、依赖谁、什么时候能停下来给人测** | **本份**（§2 批序 · §3 逐批要点 · §5 接缝） |
| 要实现哪些文件 / 函数 / 依赖方向 | `docs/map/map-code-map.md` |
| 已经落了什么、和文档差在哪 | 本份 **§7 as-built**（随实现填，与上文冲突**以 §7 为准**） |
| 请人测什么、看哪里 | 本份 **§8**（合并 M1–M7 各自的 §7.3；**M8-a–d 已落+手测通过 ⇒ §8.11/§8.13/§8.14/§8.15/§8.16 · M8-e 代码已落 ⇒ §8.17 · M8-f 代码已落 ⇒ §8.18 · M8-g 代码已落 ⇒ §8.19 · M8-f2 代码已落 ⇒ §8.20 · **M9-a 已手测通过 ⇒ §8.21 · M9-b 回归已过 ⇒ §8.22（2026-10-20「都过」）· M9-c 旧链退役已落码 ⇒ §8.23（✅ 已过 2026-10-20「整体结账」）**，impl 计划 = §3.10 / §3.11；`docs/map/map-actor-look.md §11` 是整条 M8 的手测清单；**M8-h（MDB8-h 缺件过滤 + 颜色组）✅ 已过 2026-10-21 ⇒ §8.24 · M8-i（表情组 + 空件不列 + 裁帧图标）✅ 已过 2026-10-21 ⇒ §8.25**；M8 手测全清 = **§8.17**（e · 新包上屏）✅ 已通过（人类 2026-10-21「全部测试通过」） / **§8.19**（g · 存档 `<equip>` 落盘）✅ 已通过（人类 2026-10-21「全部测试通过」）——`§8.18`/`§8.20`（f/f2 的 SWF 旧链面）已随 ★M9-c 退役不可测，等价判据 = `§8.23` ✅；**MDB10（野怪图像对话气泡 · 图+文同池、两条路）代码已落 2026-10-21、手测 §8.26 ✅ 已通过（人类 2026-10-21「全部测试通过」）**；**MDB11（野怪只剩 Unity 那一套：合成路断粮 + 漫游两条路）代码已落 2026-10-21、手测 §8.27 ✅ 已通过（人类 2026-10-21「全部测试通过」）**；**MDB12（野怪**素材**= Flash 帧包优先 / PNG 兜底，分布不变）代码已落 2026-10-21、手测 §8.28 ✅ 已通过（人类 2026-10-21「全部测试通过」）**；**★MDB13（野怪四件细节 = 脚下阴影 / `personal` 驻停小动作 / `Lv` 脚标移脚下+撤头顶名 / 惊讶特效先播后战）代码已落 2026-10-21、手测 **§8.29 ✅ 已通过**（人类 2026-10-21「test ok」= 一揽子通过、未逐条拆分回报）⇒ **MDB13 全线收口、本线当前无待测项**） |
| 还卡在谁那里 | 本份 **§5 接缝请求**（编排线/运行时线/B3）；~~§9 待拍板~~ ⇒ ✅ **四条已结账**（§9 只留档） |

**一句话**：design 说**目标**，本份说**刀法与顺序**。⚠️ 本份**不改任何真值**：与 M1–M8 冲突时以子设计为准（`docs/arch-docs.md §3`）。

---

## 1. 前置与范围（先立，再谈施工）

### 1.1 三条已经定死的前提

1. **写侧以重启（Unity）血统为权威**（**MQ1**）：规则 / 实体 / 条件 / 动作取自 `projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps/*.xml`（**272 张**）；
   **画面与素材仍走 AS3**（B3），对齐规则 = **MQ2** 四级回退（**先做交集里的 134 张**）。
   ⇒ 本线是**双血统并用**，不是"换血统"。
2. **两套血统并存是有意为之**（`docs/map/map-data.md §7.2 MDQ4` + 本份 **D2**）：
   旧桥 `game/data/maps.json`（AS3，259 张）**继续服务 B3 的画面与光口坐标**；**Unity 侧（272 张）改走运行时现场解析**（**方案 C**，见 §2.2）**服务规则与实体**。
   合并触发条件 = **MQ2 的 134 张全部跑通且旧桥无独有消费者**。
3. **只做结构、不做语义**（`MDI10`）：四张处理器表以**原始 XML 片段串**进记录，`condition` / `action` 的解析归 L0。

### 1.2 前置缺口（实测，`docs/map/map-design.md §3`）

- Unity 侧的现场解析器**已落**（**方案 C**，§2.2）：`game/logic/map/parse-map.js` + `content.loadMap(id)` + `tools/map-audit.mjs`。
- `game/data/maps.json` 的 `entities` **只是一个标签计数**（`<entities>` 出现 1 次），**没有 `npcs[]`**（与 Unity 侧无关）。
- `game/core/map/**` **0 文件**；`game/logic/map/` 今天只有 `parse-map.js`（**MB1**）。
- ⇒ **MB1（现场解析）已落码**（2026-10-18）：`parse-map.js` 给出的 `npcs[].handlers` 原始串已是 M2–M6 的输入；**MB2 起在新数据上发码**。

### 1.3 可复用的既有件（不重造）

| 既有件 | 位置 | 本线怎么用 |
|---|---|---|
| 6 算子 + 显式最左最先 + 全角转换 | `game/core/parser/operator.ts`（101 行，`docs/map/map-condition.md §6`） | **直接复用**（**D4**；不新建 `core/map/operator.ts`，`CSI3`"一份分派表"） |
| 表达式层 `ParseOperation` 家族 | `game/core/parser/parser.ts`（155 行） | 复用（条件兜底臂 / 对话 `{expr:}`） |
| `random` 四臂 + `IdentifierHost` 注入先例 | `game/core/parser/identifier.ts`（78 行） | `MapEnv` 参照它的注入形状（`docs/map/map-condition.md §6`） |
| 闭区间 RNG | `game/core/rng.ts`（49 行） | `random[a~b]` 用它（`CSI8`） |
| 桥的记账口径 | `game/data/unity/manifest.json`（`counts`/`_source`/`_generated`）+ `tools/build-unity-data.mjs` | **地图不产产物** ⇒ **不共用记账**（`MDI9` 方案 C 起作废）；那六张 CSV 表的记账照旧 |
| 真 XML 解析库 | `fast-xml-parser`（已在 `package.json` 依赖 + `game/index.html` 的 importmap） | 解析器用它（**D1** / `MDQ5`）；与存档线 `game/logic/save/codec.js` 同一用法 |
| 光口 + 两步走 + 出口名 | `game/app/scenes/mapScene.js`（`PORTAL_*`/`drawPortals`/`onStageMove`/`mapWalk`→`mapEnter`） | **过渡期保留**（**D3/D5**），S8 才换内核 nav |
| 野怪点击 → 战斗 | **单一来源** = 地图 XML 的 `<npc><wild>`（真值）→ B3 的 `#npc` 叠加层 → `onNpcClick` → `resolve→run` → `startMapBattle` | ✅ **只剩这一条路（`MDB11`，2026-10-21）**：等级/怪物 id 吃该 NPC 的 `<battle>`。⚠️ 本行旧写法（`startWildFight` + `game/data/wild.json`）= **我方合成**、非真值；文档从 **2026-10-18** 起就宣称它"退场"，但**运行时从未断过** ⇒ **`MDB11` 才把这句落实**：`wild.json` **运行时零引用**、`startWildFight`/`WildPet` **退役**（as-built **§7.3.33**）。`battles[]`（M6）仍**不替代**它（`MWI9`：两条独立契约）。⚠️ **本行说的是"打谁"，不是"长什么样"**：**素材**自 `MDB12`（2026-10-21）起 = **Flash 帧包优先**（`resId`→形象 id→`pet_appearance_swf.csv`→`swf/pet/normal/<n>.swf`，JS 侧 `parsePack` 解）、缺对应物 ⇒ **退重启 PNG**（as-built **§7.3.34**） |

---

## 2. 施工批（总表 · 序 · 依赖）

> ⚠️ **批号沿用 design**：父文档 `docs/map/map-design.md §9.2` 的 **`MB1–MB5` 是"分期"**，
> 子设计的 **`MDB1-a…`/`MDB5-a…`/`MDB4-a…`/`MDB6-a…`/`MDB7-a…` 是"切片"**。
> 本份把它们**排成一条可独立验收的顺序**，并把 `MB1–MB5` 展开成 **9 个可停点**（`MB1…MB9` 在这里是**执行序**，
> 每一行都标真正的 design 批号）。**只有"能停下来给人手测"的粒度**才算一批（`AGENTS.md §1` 第 3 条：一次只实现一个模块）。

| 序 | 批（执行序） | = design 批 | 内容 | 硬前置 | 可停点（给人测什么） |
|---|---|---|---|---|---|
| 1 | **MB1** 现场解析骨架 | `MB1`（`MDB1-a…d` + **`MDB5-a` 折入**） | `game/logic/map/parse-map.js`（纯解析器）+ `game/app/content.js` 的 `loadMap(id)`（取数入口）+ `tools/map-audit.mjs`（离线对账）；产出 = `MapRecord`（七类实体 + 四张处理器表**原始串** + `teleports[]` 五列 + `swf` 四级回退） | —— | **§8.1 对账体检**（纯跑工具，不用玩游戏）· ✅ **已落码 2026-10-18**（as-built 见 §7.3.2；⚠️ **方案 C 重定义**，见 §2.2） |
| 2 | **MB2** 基石类型 | `MB2`（`MDB2-a`） | `core/map/button.ts`（2 词表 + 2 枚举 + `uiEventOf`）+ `core/map/map-table.ts` | MB1 | ✅ **已落码 2026-10-18**（无独立可玩面 ⇒ 判据 = 对账数字不变；as-built §7.3.3） |
| 3 | **MB3** 条件求值 | `MB3`（`MDB3-a…e`） | `core/map/condition.ts` + `logic/map/condition-host.js`（⚠️ **`core/map/keys-battle.ts` 缓到 MB7**：A7 的"问路"已落，键表本身随战斗宿主一起建） | MB2 | ✅ **已落码 2026-10-18**（as-built §7.3.4）；⚠️ **可玩面随 MB4/MB5** ⇒ **§8.3** 除日志外都还没面 |
| 4 | **MB4** 动作决议 + 执行器 | `MB4`（`MDB2-b…e`） | `core/map/action.ts` + `logic/map/action-runner.js`（写盘**收口一次**） | MB3 | ✅ **已落码 2026-10-18**（as-built §7.3.5）；⚠️ 大多数接缝（A3/C2/道具/D6/E6/M5/MB6）今天**还没有消费者** ⇒ 本批只到"**能出决议、能到得了接缝**"，端到端随 MB5–MB7；**§8.4** 的可玩面因此多数要等 MB5 |
| 5 | **MB5** 会话 + 传送接线 | `MB5` 的传送半（`MDB5-b…e`） | `logic/map/session.js` + `logic/map/entity.js` + `mapScene.js` 接线 | MB4 | ✅ **已落码 2026-10-18**（as-built §7.3.6）；**第一个"玩家能感觉到"的批** ⇒ 可手测 = 光口传送 / 昼夜按钮 / `auto` 进图触发（NPC 点击链已建、**上屏要等 B3**）；**§8.2**（光口回归 + 出生点 + 昼夜按钮） |
| 6 | **MB6** 对话 | M4 的 `MDB4-a…e` | `core/map/dialog.ts` + `logic/map/dialog-host.js` + L4 自绘最小对话浮层（决策一 A） | MB5 | ✅ **已落码 2026-10-19**（as-built §7.3.9）；**§8.5**（对话分支 / 附挂 / `{expr:}` / 关不掉）—— 触发面 = 调试 `onNpcClick`（NPC 未上屏，B3 围栏仍在） |
| 7 | **MB7** 地图战斗触发 | M6 的 `MDB6-a…e` | `core/map/battle-spec.ts`（+ 桥 `battles[]` 列 + `keys-battle.ts` 键表）+ 三门 + 战后链（复用 `#/rbattle` 单敌遭遇，决策二） | **MB6（同批）** | ✅ **已落码 2026-10-19**（as-built §7.3.10）；**§8.6**（开战 / 回图 / 胜负链）；⚠️ **多宠带 settings 的正式规格 + 板凳敌方宠交 E6**（如实登记，不伪造） |
| 8 | **MB8** 移动 / 几何 / 寻路 | M7 的 `MDB7-b…d` | ⏸ **搁置**（人类 2026-10-18：**通行面暂时不实现**） | —— | ⏸ **不发码**（§8.7 一并搁置） |
| 9 | **MB9** 漫游 NPC | M7 的 `MDB7-e` | `logic/map/wander.js`（目标选取 + 待机 + `talk` 决议）—— ✅ **照做**（人类 2026-10-18：**通行面判断恒真 = "哪里都能走"** ⇒ **不需要** `nav.ts`/`geometry.ts`，也**不做碰撞**） | MB7 | ✅ **已落码 2026-10-19**（as-built **§7.3.11**）；**§8.8**（野怪在 `radius` 内溜达 / 会停 / 不走出镜头 / 文本气泡）—— ⚠️ ~~**只 JS 回退图**、无碰撞~~ ⇒ **游荡范围已被 `MDB11` 取代 = JS/SWF 两条路都走**（人类 2026-10-21 点名 ③；**无碰撞**这一格不变）；**`talk` 气泡调度已于 `MDB10` 从本件迁出** = `logic/map/talk.js`（图像气泡同日已接 ⇒ as-built **§7.3.32**、手测 **§8.26**；本件收窄成**只管走位**）；⚠️ **走的是"位"，画的是"素材"另批**：野怪**上屏素材**自 `MDB12` 起 = **帧包优先 / PNG 兜底**（本件的 `seedWander`/`stepWander` 数学**一字未改**，as-built **§7.3.34**） |
| 10 | **MB10** 记录最后所在的房间 | **无（人类 2026-10-19 直接点名）** | 照上游 `NormalLoadingScreen.cs:41` 记 `session.currentMapId`/`lastMapId`（**唯一写者 = `renderMap`**）+ 战后回图补 `spawn=x,y`（复用 TPQ5 一次性落点口） | MB7 | ✅ **已落码 2026-10-19**（as-built §7.3.14）；**§8.10**（回原房间 / 回原位置 / 战后链回归 / 换房间不串 / 手敲 `map=` 认 JS 图）—— ⚠️ **房间号是会话态、不入档**（同上游 `Player` 单例）|

> 📝 **MDB10（野怪图像对话气泡 = MB9 尾步的预登记后批）不在本执行序内**：`docs/map/map-impl.md §7.3.30` 末尾预先登记"图像气泡是一条新批"⇒ **本批照单落地**（人类 2026-10-21 点名范围 = **两条路都出**、挑选 = **照上游：图与文同一个池子均匀随机**）。新建 L1 `game/logic/map/talk.js`（`seedTalk`/`stepTalk`，纯调度）+ `logic/map/npc-art.js` 新导出 `talkImageUrl`（`emoji/{toon,meme}/*` → 盘上静图 URL）+ L4 `mapScene.js` 接线（两条路播种 + `#npc` 层画表情 + 独立 `talkRaf`）⇒ as-built **§7.3.32**、手测 **§8.26** ✅ 已通过（人类 2026-10-21「全部测试通过」）。**不碰 `game/maprunner/**`、不重编译 AS3**（气泡骑在 B3 已授权的 `#npc` 叠加层上，`AGENTS §4.14` ①）。
>
> 📝 **MDB11（野怪分布单一来源 = Unity `<npc><wild>`）同样不在本执行序内**：人类 2026-10-21 点名「**只采用 Unity 端的野怪分布逻辑，先不引入其它逻辑**」⇒ 本批**断开**我方合成的 `game/data/wild.json` 那条**平行通路**（AS3 `WildPet` 会自己溜达、自己 `Lv+名字` 脚标、自己点击开战 = **第二套野怪**）。三条拍板：① 清理力度 = **彻底收口**（不再喂合成表 + **删** JS 侧那套只服务它的代码）；② 空图 = **就没有**（219 张真值没写怪的图**不伪造**）；③ 漫游 = **JS/SWF 两条路都走**（解除 `wanderRaf` 的 `M.jsMode` 闸）。围栏判定 = **零 `game/maprunner/**` 改动、不重编译**（`wild: ''` ⇒ `setWild()` 空数组 ⇒ `spawnPets()` 零生成），`WildPet.as` 留成**不可达死码**（★M9-c 同款处置）⇒ as-built **§7.3.33**、手测 **§8.27** ✅ 已通过（人类 2026-10-21「全部测试通过」）。⚠️ 本批同时是**一条旧账的结账**：`§1.3` 该行、本份 `:290` 一带与 `map-code-map.md`/`map-move.md` 从 2026-10-18 起就一致宣称合成表"退场"，但**运行时从来没断过**（`mapScene.js` 至今仍在 `fetch('/game/data/wild.json')` 并喂给 AS3）。
> 📝 **MDB12（野怪素材 = Flash 帧包优先）同样不在本执行序内**：`MDB11` 结账后，人类 2026-10-21 接着点名「**野怪分布按照重启设定，但野怪素材能否还是取自 swf？而不是重启的 png？**」⇒ 本批**只换"画哪张图"**、**分布/漫游/点击/战斗一字不动**。四条拍板：① **JS 自己解帧包**（`swf/pet/normal/<n>.swf` 其实是**帧序列包**、与小赛尔部件包同容器 ⇒ 复用 L1 `actor-view.parsePack`；**不碰 `game/maprunner/**`、不重编译、零 Ruffle 新用法**）；② **现在抓那 34 个缺的包**（≈2.3 MB，目录 48→82）；③ **帧包原生像素**（不吃 `<npc @size>`）；④ **走/站两态 + 左右镜像**（不做 `personal`）。新建 L1 `logic/map/pet-view.js` + `npc-art.petAppearanceId` + L4 `ensurePetPack`/`petHitOf`/`drawPetFrame`；`pet_appearance_swf.csv` 里**无对应物**的 15 种 ⇒ **继续走重启 PNG、不伪造** ⇒ as-built **§7.3.34**、手测 **§8.28** ✅ 已通过（人类 2026-10-21「全部测试通过」）。
> 📝 **★MDB13（野怪四件细节 = 脚下阴影 / `personal` / 惊讶特效 / `Lv` 脚标）同样不在本执行序内**：`MDB12` 结账后，人类 2026-10-21 接着点名「**接下来做野怪的 4 条：脚下阴影、待机小动作、惊讶特效、等级脚注**」⇒ 本批把 `MDB12` 逐条登记为"**不做**"的那四条 ❌ **补齐**（`AGENTS §4.19` 的禁令随本批改写）。语义**照抄**上游 `game/maprunner/WildPet.as`（`addShadow:169-187` / `playIdelAnimation:301-305` / `playSurpriseEffect:222-229` + `drawMark:231-238` / `SpawnedPet` 的 `UNDER_FEET` 脚标），**但零 `game/maprunner/**` 改动、不重编译**（那件仍是不可达死码、只当**语义真值**读）；**零新素材** = 阴影与「!」借小赛尔的 `game/data/actor/UI_ActorShadow.bin` / `UI_SurpriseMark.bin`（官服同名两件 `UI_PetShadow.swf` / `UI_FightSuprise.swf` **404** ⇒ 顶替，同 `MDB12` 口径）。四条拍板：① 惊讶 = **点了先播完再开战**（≈0.8 s）；② 脚标 = **整串移到脚下、撤野怪头顶名**（非野怪 NPC 不动）；③ `personal` = **每次驻停播一次**（**有意偏离**上游"久站才播"）；④ 节奏 = **四件一起落完再测** ⇒ **四个提交连发（`-a`/`-b`/`-c`/`-d`）、手测合并成一份 `§8.29`**；另两条**有意偏离**：**不复刻"叫角色走过来"**（`actorMoveClose:248-254`）、**不接** `LV_NAME_RESTORE`（核对后气泡基线本就挂在 sprite 顶边 ⇒ 撤名不影响）。⇒ as-built **§7.3.35**、手测 **§8.29 ✅ 已通过**（人类 2026-10-21「test ok」= 一揽子通过、未逐条拆分回报）⇒ **MDB13 全线收口**。
>
> 📝 **M8（角色外观 · 穿戴装备 / 骑乘坐骑）不在本执行序内**：`docs/map/map-actor-look.md` **已成文（2026-10-20）**；`MDB8-a`（数据桥 + L1 纯计划）**已落并手测通过**，`MDB8-b`（JS 路 11 槽渲染）、`MDB8-b2`（帧动画 + 4 向，含同日两轮手测修补）与 `MDB8-b3`（光轮/阴影切换）**已落且手测通过（2026-10-20）**（as-built §7.3.15 / §7.3.17 / §7.3.18 / §7.3.19）；`MDB8-c`（会话态 + 正式调试入口）**已落且手测通过**（as-built §7.3.20）；`MDB8-d`（坐骑速度 + 13 只浮动坐骑）**已落且手测通过（2026-10-20，人类「it worked good」）**（as-built §7.3.21）；`MDB8-e`（素材补齐 + 清单）**已落码**（as-built §7.3.22）· §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」）；`MDB8-f`（SWF 路叠层）**已落码**（as-built §7.3.23）· §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）；`MDB8-g`（存档 `<equip>` 接线）**已落码**（as-built §7.3.24）· §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」）；`MDB8-f2`（SWF 裸装角色显隐 = 修「双角色」，人类手测 f 后点名）**已落码**（as-built §7.3.25）· §8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）。
>
> 📝 **M9（SWF 路角色提线化 = 地图与角色相分离）同样不在本执行序内**：设计 = `docs/map/map-swf-puppet.md` **✅ 已评审通过（人类 2026-10-20「照抄 JS 图」）**；施工计划 = 本份 **§3.11**（`MDB9-a…c`）；`MDB9-a`（提线最小闭环）**已落并手测通过（2026-10-20「nice, 现在ok了」；as-built §7.3.26 = `game/maprunner/**` 授权例外之三、手测 §8.21）**；`b`（交互改道回归）**已过人肉回归（2026-10-20「都过」= §8.22 五条全过）**；`c`（旧链退役收口）**已拍板 A·退役（人类 2026-10-20「A · 退役」）、落码并手测通过（as-built §7.3.27、手测 §8.23 ✅ 2026-10-20「整体结账」）—— ★M9 就此全线结账**。
> **人类 2026-10-20 已拍板**：`ALQ1=A`（存档加 `<equip>`，正本 `save-xml-spec §2.22`）、`ALQ2=B`（SWF 图叠 canvas 角色；f 批不碰 `MapRunner`，`f2` 经人类授权只加显隐开关）；
> `ALQ3–ALQ8` 按建议默认。施工切片 = `MDB8-a…g` + `f2`（数据桥 → JS 11 槽渲染 → 装备状态 → 坐骑 → 素材采集 → **SWF 叠层** → **存档接线**）。
> ✅ **M8 impl 计划 = §3.10（2026-10-20）**；as-built 已齐 = §7.3.15–§7.3.25（`a`–`g` + `f2`）。`a`–`d` 手测通过；`e`/`f`/`g`/`f2` 代码已落，分别停点 §8.17/§8.18/§8.19/§8.20 ⇒ **e/g（§8.17 / §8.19）✅ 已通过（人类 2026-10-21「全部测试通过」） = 一揽子通过；f/f2（§8.18 / §8.20）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） ⇒ M8 手测全清、全线收口**（逐批停下等手测，`AGENTS §1`）。

**批序的三条硬理由**（不是偏好）：

- **MB1 必须第一**：桥是**唯一数据源**（`MP1`），没有它后面全是空转。
- **MB6 与 MB7 必须同批**：**触发面 543 = 对话 391（`func` 243 + `reply` 148）+ NPC 152**（`docs/map/map-battle-trigger.md §2.6`）
  ⇒ 只做 NPC 那一半 ⇒ **71% 的战斗触发口打不开**（`docs/map/map-design.md §9.1` M6 行）。
- **MB8 ⏸ 搁置**（人类 2026-10-18：**通行面（地图场景里的可通行区域）不实现**）⇒ 玩家走位与通行面**继续由 `MapRunner.as` 承担**（现役，行为不变）；
  本份的 **D5 由"过渡期"升级为"长期"**。⚠️ **重启前置** = 先定"通行面来源"（桥预产栅格 / 运行时解析 / 声明的内框），见 `docs/map/map-move.md §3.6`。
- **MB9 ✅ 照做**（人类 2026-10-18 同一轮的裁定）：既然通行面**不做**，"做什么都不能走"就等于**"哪里都能走"** ⇒ 漫游**照旧实现**，
  只是**不给它碰撞/寻路**（野怪在 `radius` 内直着走、会停、不走出镜头）；⇒ **MB9 与 MB8 解耦**：`wander.js` 不吃 `nav.ts`/`geometry.ts`。

**可选的并行**：**MB2 与 MB1 并行**（MB2 只吃字段名，不吃数据）。

---

### 2.1 人类 2026-10-18 的四条拍板（= §9 的 `MIP1–MIP4` 全部结账）

| # | 拍板 | 落到本份 |
|---|---|---|
| **①** | ✅ **`activity` 键值袋：做**（只存取、无开放时间/奖励/UI） | **D9 重写** —— 袋 = **复用存档的 `<activityStorage>`**（`docs/save/save-xml-spec.md §2.14`）；**`MDB3-d` 解阻**（§3.3）；`setActivity` 改**写袋**（§3.4） |
| **②** | ⏸ **通行面暂时不实现** —— ⚠️ **但"不判断能否通行" = "哪里都能走"** ⇒ **漫游 NPC 照做**（人类 2026-10-18 追问时明确） | **`walk` 列不产、`geometry.ts`/`nav.ts`/`move-runner.js` 不发码**（**MB8 搁置**）；⚠️ **MB9 照做**（`wander.js` 无碰撞：在 `radius` 内直走、会停）；玩家走位仍交 `MapRunner.as` |
| **③** | ✅ **过渡期"光口位置 AS3 / 目标图 Unity"接受**（画面归 AS3、规则归 Unity） | **D2/D3 确认**（§4） |
| **④** | ✅ **实体（NPC / Avatar / pet）表现 = 用 SWF 美术素材** | **新增 D10**（数据面归本线、图层机制归 B3） |

---

### 2.2 人类 2026-10-18 第五轮拍板：**方案 C —— 运行时现场解析**（把 MB1 重定义）

> **背景**（人话）：MB1 第一版走的是"**构建期**先把 272 张 XML 转成一张大表 `game/data/unity/maps.json`（2.35 MB），运行时读那张表"。
> 人类 2026-10-18 改主意：**不要中间产物，进哪张图就现场取那张 XML、现场解析**。

| # | 人类原话（要点） | 落到本份 |
|---|---|---|
| **a** | "dev 期间直接吃上游，将 XML 目录路径编码为一个常量" | `content.js` 里 `MAPS_XML_DIR = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps'`；依赖 `tools/serve.mjs` 服务仓库根。⚠️ 打包期该路径不存在 ⇒ 已知备案、**不阻塞** |
| **b** | "跨图数据 / 全图清单不需要" ⇒ **不做小索引** | 跨图统计（`portal-inbound-none` 95 / `portal-isolated` 54 / 悬空）**降级为离线对账**（`tools/map-audit.mjs`）；**运行时无索引** |
| **c** | "解析器收在 content.js" | **取数入口** = `content.js` 的 `loadMap(id)`；**纯解析器**独立成 `game/logic/map/parse-map.js`（node 跑不动 `content.js`：它用 `/game/...` 绝对路径 + `fetch`）—— 与存档线 `logic/save/codec.js` 同族。**入口仍在 content.js**，与人类说法一致 |
| **d** | "进过的图不要缓存" | `loadMap` **每次重新 fetch + 重新解析**；"当前屏幕上的那张图"不算缓存 |

**C 的后果清单（哪些变了、哪些没变）**：

| 变 | 内容 |
|---|---|
| ❌ **退役** | `game/data/unity/maps.json`（旧 MB1 产物，2.35 MB）· `tools/build-map-entities.mjs`（改名 `tools/map-audit.mjs`，只读不产）· `manifest.json` 的 `counts.maps` · `content.js` 的三出口（`mapList`/`mapTableOf`/`entitiesOf(id)` 的取数语义） |
| ✅ **新增** | `game/logic/map/parse-map.js`（纯解析器，一份两用）· `content.loadMap(id)`（按需 fetch + 解析 + 补 swf 链）· `content.entitiesOf(record)`（改成吃记录、不自己取数）· `tools/map-audit.mjs`（离线对账） |
| ✅ **不变** | 字段清单与归一化规则（`docs/map/map-data.md §3.2`）· 四张处理器表的**原始串**口径（`MDI10`）· 注释一律忽略（`MDI7`）· 七类实体照录（`MDI6`）· 两套血统各自独立（`MQ1`/`D2`/`D3`）· `walk` 列不产（MB8 搁置）· MB6+MB7 同批 |

⚠️ **C 丢掉的三样保证（如实登记）**：
1. 不再有"**页面数据已被离线审计过**"的保证 —— 改靠**人测** + **node 对账工具**（`tools/map-audit.mjs`，判据数字同一组）；
2. **运行期拿不到跨图统计**（真需要的只有"该载哪个素材"）—— 人类拍板接受；
3. MB1 的**大表本身**没了 —— 但**解析逻辑与那组判据数字保下来**了（对账工具照打 95/54/393/110…）。

⚠️ **`loadMap` 是异步的**（`await`）：进图的那一刻多一次 ~13 KB 的 fetch + 一次解析；**屏幕上的那张图**是唯一"当前数据"，**不缓存**（人类 d）。

---

## 3. 逐批要点（落点 / 接口 / 判据）

> 接口签名与依赖方向见 `docs/map/map-code-map.md §4/§5`。本节只写**每批要做到什么、卡在哪**。

### 3.1 MB1 · 现场解析骨架（`game/logic/map/parse-map.js` + `content.loadMap` + `tools/map-audit.mjs`）

- **落点**（**方案 C**，见 §2.2）：新建 `game/logic/map/parse-map.js`（纯解析器：XML 串 → `MapRecord`；零 IO / 零 fetch）；
  `game/app/content.js` 追加 **`loadMap(id)`**（取数入口：fetch 单图 Unity XML + AS3 config → 调解析器 → 补 swf 链；**不缓存**）、`entitiesOf(record)`（改成吃记录）；
  `tools/map-audit.mjs`（**离线对账**：读全库 272 张跑**同一份**解析器 → 打印判据数字；**不产产物**）。
  ❌ **不再有** `game/data/unity/maps.json`、`tools/build-map-entities.mjs`、`manifest.json` 的 `counts.maps`。
- **字段清单的正本** = `docs/map/map-data.md §3.2`（**不抄进本份**）。本批要特别落的三件：
  1. **`entities` 从"计数"改成"七类数组"**（修掉旧桥的现状缺陷，`docs/map/map-data.md §6`）；
  2. **四张处理器表以原始 XML 片段串存**（`MDI10`）——**这是 M2/M3/M4/M6 的全部输入**；
  3. **`teleports[]` 五列**（`id/name/pos/color?/targetMapId`，**无落点维**）—— 即 `MDB5-a`，**折进本批**
     （理由：`teleports` 是七类实体之一，`docs/map/map-data.md §3.2` 已定义它的列；单独排批只会解析同一张图两次）。
- **解析期登记**（`docs/map/map-data.md §3.2` 四类畸形 + §2.10 两类只读审计）—— ⚠️ **方案 C 把两处切开了**：
  - **单图内**（`parse-map.js`/`loadMap` 就能判）：`duplicate-teleport-id` · `empty-name` · `invalid-switch`（实测 1 例 = `71`）· 悬空 `targetMapId`（该目标 fetch 404）；
  - **跨图**（只有读全库才算得出 ⇒ **`tools/map-audit.mjs` 离线算**，运行时不需要）：`portal-inbound-none`（期望 **95**）/ `portal-isolated`（期望 **54**）。
- **`swf`/`swfOk`**：`MQ2` 四级回退（① `@resId` → `<resId>.swf`；② 同 id 的 AS3 config `<resource url>`；③ `<id>.swf`；④ 无 ⇒ `swfOk=false`）。
  ✅ **人类 2026-10-18 拍板：上游 XML 的注释直接忽略** ⇒ ❌ **不再有"注释里的 `<resource>`"这一级**、**`swfFromComment` 取消**（`docs/map/map-data.md §2.9/§3.2`、**MDI7**）；
  ⚠️ 线索**只在注释里**的图 ⇒ 登记 **`swf-missing`**（不抛、不猜），**张数由对账工具报出**（一条"跑出来才知道"的数）。
  ⚠️ **方案 C 起**：这一链在**运行时**跑 —— 候选链由 `parse-map.js` 出（`swfCandidatesFor`），"文件在不在"由**调用方注入**：
  浏览器 = `HEAD /swf/map/<name>`（`content.loadMap`）；node = `fs.existsSync`（`tools/map-audit.mjs`）⇒ **两边同一语义、数字一致**。
- **卡点**：无（数据齐、库齐、`fast-xml-parser` 浏览器可用：`game/index.html` import map 8 项）。
- ✅ **已落码（2026-10-18）**：as-built + 全部判据数字见 **§7.3.2**（第一版构建期桥的 as-built 留在 **§7.3.1**，**已退役**）；
  本批落了三处**新增登记**（`swf-missing` **55** / 可 resolve **48**、`switchRaw` 审计列、`worldIdKnown` 口径）
  与**一条改挂**（`battles[]` 与两个 battle 审计 ⇒ 归 MB7，见 §7.3.1 偏差 ①）。
- **不要顺手做的**：`farm/animal/pond/insect/nest` **照录但不实现动词**（`MDI6` + `docs/architecture.md §1.1` A 组围栏）；
  记录里**不许**出现任何 `condition`/`action` 判断（`MDI10` 的分水岭）。

### 3.2 MB2 · 基石类型（`core/map/button.ts` + `core/map/map-table.ts`）—— ✅ **已落码（2026-10-18）**

- `button.ts`：`ButtonSpec`（**`source` 必填**，`MNI2`）+ 两张词表（5 / 18 条）+ 两枚举 + `uiEventOf`（对 `auto` **返回 `null`**，`MNI1`）。
  ⚠️ **`shoot` 不进词表**（它 `type == None`）却照样生效（`MC2`）⇒ **按 `typeId` 原串**在射击门里认领（`MNI4`）。
- `map-table.ts`：`identifierOf`（8 键 + 未知 ⇒ `0`，`MP7`）· `isModId` / `isMirrorId`（**两类分开命名**，`MC4`）· `parseAssetRef`（`resId` 六形状**只分类不求值**，`MDI5`）。
  ⚠️ **`resId` 六形状的分类今天已在 MB1 落了**（`game/logic/map/parse-map.js` 的 `resIdKind`，§7.3.2）⇒ MB2 的 `parseAssetRef` **搬它、不重写**（避免两处分类漂移）。
- ⚠️ **`anim` 键按数据面**（有 `<anim>` ⇒ 1），与上游读**运行时资源**不同 —— 如实标出（`MDQ3`）。
- **判据**：`docs/map/map-npc.md §7.3` 第 5 条（畸形参数不抛）。

### 3.3 MB3 · 条件求值（`core/map/condition.ts` + `logic/map/condition-host.js`）—— ✅ **已落码（2026-10-18）**

- **切片**（`MDB3-a…e`，**一次落齐**）：语法（括号感知 `|` + AST + 畸形登记）→ `MapEnv` + `condition-host` 适配器 → **A1–A15 十五臂**（含 **A5 `activity`** 与 **A1 `random`**）。
- **三值**：`boolean | 'unknown'`；`'unknown'` ⇒ **不触发 + 登记 + 不执行副作用**（`CSI4`）。
- **`activity` 一致性**：动作侧 `setActivity` **603** 次（**解析口径**；CSQ4/MNQ2 写的 **606** 是 **grep 口径**）、条件侧 `activity[…]` **1,025** 条（64 个 id，**48%**）—— 两者**共用同一张活动表**（`docs/map/map-npc.md §2.6`）。
  ✅ **已拍板（人类 2026-10-18）**：键值袋**做** ⇒ **`MDB3-d` 解阻**。**落点已钉**：袋 = **存档里既有的** `<activityStorage><Activity id=><data><entry><key><value>`（`docs/save/save-xml-spec.md §2.14`；真机档 `tools/fixtures/save-lite4.9.2-played.xml` 有 **10 个** `Activity`，如 `noob` → `map=done`）
  ⇒ **不开新字段、不破 round-trip 保真**。**A5 求值 = 纯读**（按 id 找 `Activity`、再按平键找 `value`，**缺省即默认**；⚠️ **不照搬** `Activity.Find` 的"顺手建档"副作用 —— `CSC3`：读**不污染存档**）。
- **不许顺手实现的**：`yite_rogue.`（肉鸽，A 组）· `plant.`/`animal.`（牧场，A 组，**实测 0 次**）· `mission`（任务，A 组，**68 条全在"任务未接"路径**）。⇒ 这三族**形状照录、执行一律 `'unknown'`**（`M3 §3.2 A6/A9/A10/A12`）。
- **`MapEnv` 的形状**（`MQ3`，一件一缝）：`{ items, petBag, firstPet, map, npcRuntime, battleState, sceneData, activities, missions, player, rng, log }`。
  ⚠️ 其中 `activities` **现在有实体**（= 存档的 `activityStorage` 投影，**只读写平键**）；`missions` 仍是**形状占位**，**不许**变成"偷偷实现任务"的入口（`MQ3`/`MQ6`）。
  ⚠️ **落码时两处加宽**（见 §7.3.4 偏差 ③）：`items.count` 与 `player.shoot/achievement` 允许 `'unknown'`（缺来源时说"不知道"，不谎报 `0`）。

> ⚠️ **一条真值订正（`M3 §7.1 CSC8`）**：**`activity` 的平键里带 `[...]` 是常态**（`done[1]` / `twin[easy][max]` 一类；
> 动作侧 `setActivity` **就按这个形状写**进存档 —— 实测**写 578 / 603 条带括号的写入键（96%）** / **条件读 947 / 1,025 条（92%）**）⇒ 实现**照录平键查找**，
> **不**把"多级下标"判成畸形；只有**值**里的分隔标记不是 `[default]`（实测 **2** 处 `[skin]`）才登记。
> 详见 **§7.3.4 偏差 ①** 与 `docs/map/map-condition.md §7.1 CSC8`（已就地订正）。

### 3.4 MB4 · 动作决议 + 执行器（`core/map/action.ts` + `logic/map/action-runner.js`）—— ✅ **已落码（2026-10-18）**，as-built 见 §7.3.5

- **门序不许倒**（`MNI3`）：**模式门 → 条件 → 动作**（`MC3` 的射击 XOR 门 + `Where(typeId=="shoot")` 两条入口都要在，`MNI4`）。
- **18 动作的施工优先级**（`MNQ4` + 父文档 §2.1 的**解析口径频次**，合计 **4,355**）：
  `openDialog`(1224) → `openHintbox`(926) → `battle`(543) → `setItem`(417) → `openPanel`(137) → `getPet`(131)
  → `teleport`(106) → `setNpcParam`(82) → `evolvePet`(79) → `setPet`(63) → **其余一律 `unimplemented`**。
  ⇒ **做完前四条 = 覆盖 ~72% 的 `<action>`**（3,110/4,355）。⚠️ **本批的执行面还要与 MB6/MB7 分工**：`openDialog` 的**渲染**归 MB6、`battle` 的**战斗**归 MB7
  ⇒ **MB4 只落"能出决议、能到得了接缝"**，四条的真正端到端在 MB6/MB7 才闭合（这也是它们必须同批的原因）。
  ⚠️ **`setActivity`(603) 改为「只写袋」**（人类 2026-10-18 拍板 ①；`MNQ2`）：一次键值写入 `activityStorage` + 日志，**仍不做活动玩法**（无开放时间/奖励/UI）——
  这是**本条拍板导出的动作侧改动**（MQ6 原定 `unimplemented`），也是解掉 **`winHandler` 里 132 条 `getPet`** 的那一刀（`docs/map/map-npc.md §7.2 MNQ2`）。
- **`unimplemented` / 畸形参数**：一律**登记 + 不动状态 + 不抛**（`MP7` + `MNI6` + 决议 ②）。
- **写盘收口一次**（`MNI8`）：上游 6 个动作各自 `SaveSystem.SaveData()` ⇒ 我们改成**执行器在一批决议落地后收口一次**
  （经 `game/app/session.js` 的 `save()`；`R4` 建档后指向它，决议 ③）。
- **`callback` 链深上限 = 16**（`MNQ3`），超限 ⇒ 记一条 `unimplemented`（"回调链过深"）。
- **`npc` 可空**（`MNI7`）：`resolve` 允许 `npc: null`；依赖 NPC 的动作在空 npc 时**只登记不执行**。
- **判据**：`docs/map/map-npc.md §7.3` 第 2/5/6 条。

### 3.5 MB5 · 会话 + 传送接线（`logic/map/entity.js` + `logic/map/session.js` + `mapScene.js`）—— ✅ **已落码（2026-10-18）**，as-built 见 §7.3.6

- **落点规则只有一条**：`spawn ?? 目标图.init`（`docs/map/map-teleport.md §3.3`）；`spawn` **只能是** `changeScene('map',{mapId,spawn})` 的入参，
  **不是** `sceneData` 键袋（`TPQ5`；与编排线 **OR4** 同口径）。
- **决议族**（`MDB5-b` 五个：`teleport` / `notOpen{mapId}` / `mirror{dir}` / `unreachable{spotId}` / `walkTo`；另加 `missingMirror`，见 `TPI7`/`MDB5-d`）。
  ⚠️ **`mapId==0` 与"暂未开放"文案**归 **A3/R5**，内核**不弹窗**（决议 ③、`TPQ4`、`TPI7`）。
- **昼夜**（`MDB5-d`）：`switch` 收窄成 `0|±1` 后才显示按钮；目标图 = `-currentMapId`，**仍要校验存在**，不存在 ⇒ `missingMirror{wanted}`。
- **光口不是唯一入口**（`TPI9`）：**入口 = 光口 ∪ NPC `teleport` 动作**（**两张边表**）——
  ⇒ 本批要把 `teleport` 动作（**106 条**）也接进同一条链，否则 **26 张图在我们这侧全是"死图"**。
- **⚙️ 过渡期口径（本份 D5）**：两步走**继续用现有消息链**（`mapScene.js` 的 `mapWalk`(→429)/`mapArrive`(→430)/`mapEnter`(→422)/`gotoMap`(→565)），
  由 `logic/map/session.js` 包一层：**决议归内核、走位仍交 SWF**。⇒ 这样本批**不碰 `MapRunner.as`**，可独立验收（MB8 才换）。
- **判据**：`docs/map/map-teleport.md §7.3` 第 1/2/3/5/6 条。

### 3.6 MB6 · 对话（`core/map/dialog.ts` + `logic/map/dialog-host.js`）✅ 已落码（as-built §7.3.9）

- **无栈状态机**：唯一状态 `(npcId, branchId)`（`DLI1`）；关闭 = **独立意图 `closeDialog`**（`DLI4`）。
- **`branch` 三重身份按父元素分派**（`DLI3`）：`dialog` 下 655 / `type="branch"` 320 / `battle` 下 680 ⇒ **绝不按标签名**。
- **附挂在解析期物化**成 `Choice.resolutions[]`（`DLQ2`）；idx0 附挂 ⇒ `orphan-branch` 登记（`DLC5`，实测 0 命中）。
- **可见性**（本题唯一行为改动，`DLQ5`）：**打开时求值**，全不可能则不渲染；⚠️ **点击期不改短路**（`DLI5`：满足者**全部**执行）。
- **`renderContent`**：`{expr:}` 走 **M3∪`Identifier` 的同一张前缀表**（`DLI7`）；**永不**变异 `rawContent`（修 `DLC1`）；`presentation` 在**解析期**剥前缀。
- **story 半边不做**（`DLQ1`，A 组）；`presentation: 'plain'|'story'` **字段留位**。
- **A3 接缝**：`openDialog(info, {onReply})`（`docs/view/mech/view-overlays.md` 已预约）。
- ⚠️ **先清 `overlay` 再切图**：对话里 30 条 `teleport` 出路（`reply` 25 + `func` 5）⇒ 执行 `teleport` 前**必须**清对话盖层（`docs/map/map-dialog.md §4` ⚠️ + 编排线 **OR8**）。
- **判据**：`docs/map/map-dialog.md §7.3` 全部 8 条。

### 3.7 MB7 · 地图战斗触发（`core/map/battle-spec.ts` + 桥 `battles[]` 列）✅ 已落码（as-built §7.3.10）

- **桥列**（`MDB6-a`）：`battles[]`（§3.1 形状）+ 四类登记；⚠️ **`battle-action-dangling`（8 条 `hell`）要报警**（它是代码 bug，`BTQ2`），
  而 `battle-branch-unreferenced`（154 条）**只读审计**。
- **`BattleSpec`**（`MDB6-b`）：`seed == null` ⇒ **由编排层向 R2 取时钟**，内核**不碰时钟**（`BTI5` + 决议 ③）；
  ⚠️ **`@count` 只裁己方，敌方不裁**（`BTI2`）。
- **开工三门**（§3.3）：配方存在 / 首发可用 / `settings` 准入；⚠️ **第三门不许照搬上游的 `debugMode` 旁路**（`BTC4` + `AGENTS.md §2`）。
- **战后再入**（§3.4，本线最容易做错那段）：`battleOrigin{mapId,npcId,branchId}` + **同图才跑**（删号段护栏，`BTQ1`）+
  `lastBattle` **只读窗口**（供 43 条 `battle.` 条件）+ 两支 + 一条**显式第四支**（`result-state-unhandled`，`BTC3`）。
- **`@time` / 倒计时 / `Timeout` 不接**（`BTQ4`）：`time` 列**照录不消费**。
- **判据**：`docs/map/map-battle-trigger.md §7.3` 第 1–8 条（其中第 3 条板凳敌方宠是**最值得先看**的）。

### 3.8 MB8 · 移动 / 几何 / 寻路（`core/map/{geometry,nav}.ts` + `logic/map/move-runner.js`）

> ⏸ **整批搁置（人类 2026-10-18：通行面暂时不实现）** —— 以下为**目标形状**，人类重启前**不发码**。玩家走位与通行面**继续由 `MapRunner.as` 承担**。

- **通行面四支**（`docs/map/map-move.md §3.3`）：有 `path_mc`（已核/未核）⇒ 用它 + 只读审计 `walk-polarity-unverified`；无 ⇒ **声明的内框**（`x∈[0,960] ∧ y∈[20,540]`）；
  到达点不可达 ⇒ **`unreachable`**。⚠️ **不许**拿"没素材"当"全可走"（**不照搬**上游 `IsCanvasPathAvailable ⇒ true`，`MC7`）。
- **统一到足印**（±8px 8 点采样，`MWQ2`）并**只声明一次**；**LOS 用同一遍格**。
- **单位**：内核只认 **canvas（960×540，左下锚定）**；`path_mc` 的 `GRID_SIZE=10` 格 / `mapRoot` 本地坐标**只在桥里换算**（`MWI3`）。
- **寻路照语义不照实现**（`MWQ3`）：8 邻域 + 禁穿角 + 可采纳启发（**选一个并声明**）+ `open` 用**优先队列**；**不对拍**。
- **这一批是"换掉 `MapRunner.as` 走位"的唯一一刀**：落地后 `mapScene.js` 的 `sendWalkGrid` / `mapWalk` 依赖降级为**调试叠加层**。
- **判据**：`docs/map/map-move.md §7.3` 第 1/2/3/7 条。

### 3.9 MB9 · 漫游 NPC（`logic/map/wander.js`）—— ✅ **照做**（人类 2026-10-18）

> ✅ **不搁置**：人类 2026-10-18 裁定"**通行面不判断 = 哪里都能走**" ⇒ 漫游**照旧做**，只是**无碰撞、无寻路**（不吃 `nav.ts`/`geometry.ts`）。
> ⚠️ **一条要如实登记的观感后果**：野怪可能**穿过墙/遮挡**（因为"哪里都能走"）；玩家**不会**（玩家仍走 SWF 的墙）。若日后觉得别扭，再谈"给野怪也接通行面"。

- **能否漫游 = 显式配置位**（`wild.movement.mode == "wander"`），**不与"能打"耦合**（`MWI9`）。
- ⚠️ **本批的通行面判断恒真**（= 人类 2026-10-18 的"哪里都能走"）⇒ **`MWI7` 要求的"同一台寻路/同一遍通行面"本批不成立**（那是 `MB8` 的事，已搁置）；
  **随机 / 时钟走 R1/R2**（`MWI8`）。
- **卡住检测按 deltaTime**（`MWI6`，**不照搬**累加 `moveTick` 的假时间，`MWC9`）；**半径取数据侧 `radius=220`**（`MWQ4`）。
- **数据来源 = 重启真值**（⚠️ **2026-10-18 订正**，人类追问"野怪数据在重启里应当已经有了吧？"）：野怪数据**确实**在重启的 `Resources/Data/Maps/*.xml` 里（`<npc><wild>` **110 条 / 53 张图** + `<talk>`；`docs/map/map-move.md §2.8`）；
  ⇒ **本批吃桥的 `wild` 列（MDB7-a 原计划），~~不再吃现役 `game/data/wild.json`~~** ——
  ⚠️ 那张表是**我方合成**（`tools/build-wild-index.mjs` 头注：原版野怪清单来自服务端 socket 1103、不可得）⇒ **非真值、退场**（覆盖 252 张图 → 真值只有 53 张，**野怪会变少**，见 `docs/map/map-move.md §3.4`）。
  ⚠️ **"退场"这一句 2026-10-18 就写在这里，但运行时直到 `MDB11`（2026-10-21）才真的断**：MB9 当时只把**画**改吃 `wild` 列，`mapScene.js` 仍在 `fetch('/game/data/wild.json')` 并把它喂给 SWF 通路（AS3 `WildPet` 照旧生成第二套野怪）。**✅ 现已落**：`wild: ''` ⇒ AS3 零生成、合成表**运行时零引用**、只服务它的 JS 侧代码整条删除 ⇒ as-built **§7.3.33**。⚠️ **同日 `MDB12` 只动"画哪张图"**（野怪**上屏素材** = Flash 帧包优先 / 重启 PNG 兜底；本件的 `seedWander`/`stepWander` 走位数学**一字未改**）⇒ as-built **§7.3.34**。
  ⚠️ **位置上标 = 已定（人类 2026-10-18 路线 A）**：**简单归一化** `fx = ux/960`、`fy = uy/540`（重启参考画布 **960×540**）⇒ **现役管线本来就吃归一化**（`MapRunner.as:222-223` `wx = mapX + fx*mapW`）⇒ **一处换算、不动渲染**；**位置误差接受**（靠人眼校，B3 §8.1）。
- **气泡**：调度归本线、**表现归 B3**（`MWI10`）；`scene`/`player` 两张**死表不建列**（`MWQ5`）。
  ⚠️ **`MDB10`（2026-10-21）落地实况**：调度**独立成件** = `logic/map/talk.js`（**两条渲染路都跑**）、`self` 的图与文**同池均匀随机**（人类拍板）；**表现仍由本线 L4 最小自绘**（`drawNpcImageBubble` = 圆角框 + 盘上静图）⇒ **正式排版 / 底图 / `settingsData.wildNpcBubbleStyle` 仍归 B3**（`MWI10` 口径未变）。
- **判据**：`docs/map/map-move.md §7.3` 第 4/5/6 条 + 本份 §8.8。

### 3.10 M8 · 角色穿戴 / 骑乘坐骑（`MDB8-a…g` + 插入 `b2`/`b3`/`f2`）—— ✅ **`a`–`d` 已落+手测通过 · `e`/`f`/`g`/`f2` 代码已落（2026-10-20，as-built §7.3.15/§7.3.17/§7.3.18/§7.3.19/§7.3.20/§7.3.21/§7.3.22/§7.3.23/§7.3.24/§7.3.25；b2 同日两轮手测修补：idle 停顿/整体镜像 + 光轮闪阴影/套装站立射箭；b3 = 光轮/阴影手动切换；c = 会话态 + 正式调试入口；d = 坐骑速度 25/20 + 13 只浮动坐骑 ±5；e = 素材清单 + 缺包日志；f = SWF 路叠整只 canvas 角色；g = 存档 `<equip>`；f2 = SWF 裸装角色显隐（修双角色））· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**

> **真值** = `docs/map/map-actor-look.md`（下称 **M8**；`ALI`/`ALC`/`ALQ` 编号均出自它）。本份只写**刀法 / 落点 / 顺序 / 停点**，不复制它的外观模型与素材账。
> **人类 2026-10-20 已拍板**：`ALQ1=A`（存档新增我方扩展 `<equip>`，节点真值 = `docs/save/save-xml-spec.md §2.22`）、
> `ALQ2=B`（SWF 图也叠 canvas 角色，**不碰** `game/maprunner/**`）；`ALQ3–ALQ8` 按 M8 §10 的建议默认。
> **纪律**：一次只落一批、每批停下等人手测（`AGENTS §1/§1.1`）；**不新写测试 / 探针 / 截图 / 断言脚本**；
> `game/maprunner/**`、上游 `projects/**`、`vendor/**` **只读**；素材仅本地研究、禁止二次分发；复刻档**不得**喂回官方服。

#### 3.10.0 共同口径（先钉死，后七批都吃它）

| # | 口径 | 落点 / 依据 |
|---|---|---|
| **M8-P1** | **物品 ID ≠ 资源标识**：任何取包前先查 `slotindex/suitid` 算 `"1"+pad3(suit)+pad2(slot)`；左槽先映射右槽号 | M8 §2.1/§2.3（**ALI1**）；实现只在 L1 一处算 |
| **M8-P2** | **11 槽 + 镜像**：右手/右脚/坐骑三槽各生成 `_0` 主件与 `_1` 左镜像；物品表里的 slot 9 是 NONO 服装，**不是左鞋** | M8 §2.2（**ALI3**/**ALC4**）；`slot 9/10/11` 的独立物品一律拒绝 + 登记 |
| **M8-P3** | **默认装合并**：按槽位补头/眼/手/身/脚 5 件；玩家自定义件优先；颜色 10/11 的 suit 是 **39/40**，不按“颜色+1”硬算 | M8 §2.4/§4.2（**ALI5**/**ALC6**）；12 色表放 L1 常量，不在运行时读 AS3 |
| **M8-P4** | **坐骑 = 3 号槽装备包**，没有独立渲染器；视觉状态只有三个可观察量：`offsetY=-50`、藏槽 `2/6/9/10`、速度 `25`（未骑 `20`） | M8 §2.5/§6.6（**ALI4**）；本份 **M8-I1** 定速度换算 |
| **M8-P5** | **缺包不崩、不伪造**：该槽跳过或退默认件；坐骑包缺 ⇒ **不应用坐骑视觉态**（见 **M8-I2**） | M8 §8.2（**ALI6**） |
| **M8-P6** | **首版（a/b 批）只做本机玩家 / 静态站立 / 朝下（`DOWN_ORDER`）/ `flip=1`**；其他玩家、正式面板不在本批。⚠️ **b2 起 JS 路已扩：`ALQ7` 改 B ⇒ 帧动画 + 4 向 + 左右翻转**（§3.10.3b）；SWF 叠层（f）的朝向/帧同步另定 | M8 §6.7/§8.4（`ALQ6=A`；`ALQ7` 已改 B） |
| **M8-P7** | **素材只在本地缓存**：仓库只提交 `manifest.json`；运行期经 dev server 的只读路由取缓存；**不做全站遍历/无边界扫描、不二次分发**（采集单点名**定向拉取**已批准：人类 2026-10-20 拍板 B，`tools/fetch-actor-packs.mjs`，见 M8 §5.5） | `ALQ5=A`；落点见 §3.10.1 |

#### 3.10.1 数据面（`MDB8-a` 的前置，不单独算批）

**① 装备小表 `game/data/equip-index.json`（新建，构建期产物）**

- 现状：`game/data/items.json`（**2.3 MB**，9,629 条）已由 `tools/build-items.mjs` 从
  `ItemConfig__itemXmlClass.xml` 逐条转出，含 `slotindex`/`suitid`；其中 **1,864** 条 `slotindex>0`。
  但它是背包面板的懒加载大表（`mapScene.js:678-680` 的 `itemDB()`），**不适合**进图路径。
- 新增 `tools/build-equip-index.mjs`（**构建工具，不是验收脚本**）：读 `game/data/items.json` + `PetRideShopConfig__setting.xml`，
  产出只含装备与骑乘映射的小表（预计 ~150 KB）：

```json
{
  "note": "M8 外观数据桥：装备定义 + 骑乘映射；源 = ItemConfig/PetRideShopConfig（vendor 只读）",
  "source": {
    "items": "game/data/items.json（由 ItemConfig__itemXmlClass.xml 转出）",
    "ride": "vendor/seer2-origin-as3/src/_assets/65_com.taomee.seer2.app.config.PetRideShopConfig__setting.xml"
  },
  "items": {
    "100577": { "name": "射手守护头盔", "slot": 1, "suit": 203 },
    "101020": { "name": "迈巴赫", "slot": 3, "suit": 364 }
  },
  "ride": {
    "byPetResourceId": { "529": 101020 },
    "byChipBackId": { "900011": 101020 }
  }
}
```

- **判据数字**（工具打印，与 M8 §4.5 同源）：`items=9630`（源表总行）/ `equip=1864`（`slot>0`）；
  槽分布 `1:347, 2:391, 3:96, 4:13, 5:305, 6:317, 7:245, 8:21, 9:129`；骑乘 `rows=48` / `distinctEquip=29` /
  `byPetResourceId=31` / `byChipBackId=29`；`900017→101131`、`900018→101125` **按 `chipBackId` 走、不按行名**（**ALC8**）。
- 生成物纪律：文件头写“由 `tools/build-equip-index.mjs` 生成，勿手改”；改源后重跑；不加时间戳（避免无意义 diff）。

**② 取数出口（`game/app/content.js`）**

- 新增 `loadEquipIndex()`：`fetch('/game/data/equip-index.json')`，**只取一次**（小表、非地图；不违反 §4.9“地图不缓存”）；
  失败 ⇒ 返回 `null` + 一条日志，M8 计划退“仅默认裸装”，不阻塞进图。
- 新增 `loadActorManifest()`：`fetch('/game/data/actor/equip/manifest.json')`，同样只取一次；失败 ⇒ `{packs:{},missing:[]}` + 日志。
- L1 `actor-look.js` **不 fetch**：这两个对象由 L4 注入（`D7` 同口径：L1 纯、取数归 app）。

**③ 素材清单 `game/data/actor/equip/manifest.json`（提交仓库）**

```json
{
  "note": "本地缓存素材清单；包体不入库、只登记来源与大小",
  "cacheRoot": "~/.cache/seer2-live/game-cache",
  "packs": {
    "120301": {
      "files": { "": { "cachePath": "http_seer2.61.com/res/item/equip/swf/120301.swf", "size": 10638 } }
    },
    "120302": {
      "files": {
        "_0": { "cachePath": "http_seer2.61.com/res/item/equip/swf/120302_0.swf", "size": 18984 },
        "_1": { "cachePath": "http_seer2.61.com/res/item/equip/swf/120302_1.swf", "size": 87598 }
      }
    }
  },
  "missing": ["136403_0", "136403_1"]
}
```

- 键 = `pack`（资源标识）；`files` 的键 = 后缀 `''` / `_0` / `_1`；`cachePath` **相对于缓存根**（官方回落前缀
  `http_seer2.61.com/...` 与改服前缀 `res/...` 都可能出现，**以 manifest 为准，不按目录猜**）。
- 由 `tools/build-actor-assets.mjs`（**构建/盘点工具**）扫描 `~/.cache/seer2-live/game-cache/index.json` 生成；
  29 张坐骑的 `_0/_1` 缺件写进 `missing`，M8 §11 第 9 条按它手测。
- **包体不入库**：仓库只提交 manifest；若本地临时拷贝样本，放 `game/data/actor/equip/*.bin` 并加 `.gitignore`（本批只加规则，不提交包）。

**④ 本地缓存只读路由（`tools/serve.mjs`）**

- 新增 `--cache=<dir>`（缺省 `~/.cache/seer2-live/game-cache`）+ 只读路由：
  `GET/HEAD /game-cache/<cachePath>` → 映射到缓存根下同名相对路径。
- 安全：`path.resolve` 后必须仍在缓存根内（禁 `..` 逃逸）；**只 GET/HEAD**、**不列目录**、不写；
  文件不存在 ⇒ 404（客户端按“缺包”处理）。响应仍加 `Cache-Control: no-store`。
- 运行期 URL：`/game-cache/` + `manifest.packs[pack].files[suffix].cachePath`；
  **不把 `~` 展开成浏览器路径**，也**不**把缓存目录整个静态暴露。

#### 3.10.2 `MDB8-a` · 数据桥 + 纯计划（`game/logic/map/actor-look.js`，新建 L1）

- **依赖方向**：只 import 标准 JS；**不** import `app/**`、**不** fetch、**不**碰 DOM（`M-1`/`M-5` 同口径）。
  输入 = `equipVec`（物品 ID 数组）+ `mountEquipId`（或 `ridingPetInfo`）+ `color`/`sex` + `itemIndex`/`rideTable`；
  输出 = **纯计划**；取数与渲染都在 L4。
- **API（签名先钉死，后续批只加不破）**：

| 函数 | 输入 → 输出 | 要点 |
|---|---|---|
| `resourceIdOf(suitId, slot)` | `→ string` | `"1"+pad3+pad2`；左槽 `10→2`、`9→6`、`11→3` |
| `packSuffixOf({slot, isAccessory})` | `→ ''/'_0'/'_1'` | 槽 2/6/3：主件 `_0`、镜像 `_1`；其它槽 `''` |
| `defaultRefsOf(color)` | `→ [{refId,slot}]`（5 条） | 12 色表；`'BLUE'→0`、`'RED'→6` |
| `mergeDefaultEquip(color, equipVec, itemIndex)` | `→ {refs, warnings}` | 按槽去重；自定义优先；坏 ID/9/10/11 槽登记后跳过 |
| `mountEquipIdOf(ridingPetInfo, rideTable)` | `→ refId \| 0` | 先 `resourceId`、再 `petRideChipId`；**不二次反查**（**ALC2**） |
| `slotOrder(direction)` | `→ slot[]` | 11 槽深度表；第一版只用 `'down'` |
| `buildLookPlan(opts)` | `→ LookPlan` | 合并默认装 → 展开镜像 → 算包 → 坐骑态 → 签名/告警 |

- **`LookPlan` 形状**（L4 只读它）：

```js
{
  signature: 'down|0|100001,100003,100004,100005,100006|0',
  layers: [                       // 已按 DOWN_ORDER_11 自底向上排好
    { part:'FOOT_R', slot:6, refId:100006, resourceId:'100106', pack:'UI_BLUE_RGIHT_FOOT',
      suffix:'', source:'naked', mirror:false,
      fallback:null },
    { part:'HAND_R', slot:2, refId:100578, resourceId:'120302', pack:'120302',
      suffix:'_0', source:'equip', mirror:false,
      fallback:{ source:'naked', pack:'UI_BLUE_RGIHT_HAND', suffix:'' } }
  ],
  hiddenSlots: [2,6,9,10],        // 仅坐骑态
  mount: { refId:101020, resourceId:'136403', readyOffsetY:-50 } | null,
  offsetY: -50,                   // 仅坐骑态；L4 若坐骑包未就绪则按 M8-I2 归零
  speedFactor: 1.25,              // 25/20；仅 JS 自由走使用
  warnings: []
}
```

- **层序**（M8 §6.2 正本，自底向上）：朝下 `WING, HAND_R, FOOT_R, FOOT_L, BODY, BELT, EYE, HEAD, HAND_L, DOGZ_RIGHT, DOGZ_LEFT`；
  朝上 `DOGZ_RIGHT, DOGZ_LEFT, EYE, HAND_R, FOOT_R, FOOT_L, BODY, BELT, HAND_L, HEAD, WING`（第一版不消费）。
- **默认包走仓库、设备包走缓存**：默认 5 件在蓝/红（suit 0/1/7）时用仓库既有 `UI_*` 裸装包（保证裸装逐像素回归）；
  其余颜色与所有自定义件用 `equip-index` 算出的资源标识去 manifest 找包。**不把 `items.json` 整体塞进进图路径**。
- **镜像**：只有槽 2/6/3 产生镜像层；镜像层 `refId` 与主件相同、`suffix='_1'`、`part` 为左槽；
  **不读**背包里的左槽物品（**ALI3**）。
- **坐骑识别**：优先 `opts.mountEquipId`；若有 `opts.ridingPetInfo` 则先走 `mountEquipIdOf`。
  `equipVec` 里若误带 slot 3，按坐骑归并并登记一条 warning（兼容旧档）。
- **判据（可停点）**：浏览器控制台 `APP.actorLook.dump()` 打印 3 组计划 ——
  ① 裸装（蓝）；② `equipVec=[100577]`（资源 `120301`）；③ `mountEquipId=101020`（资源 `136403`，`offsetY=-50`）；
  **本批不改画面**。`dump()` 只读、无副作用；换装/骑乘入口在 `MDB8-c` 才加。
- ✅ **已落码并手测通过（2026-10-20）**：as-built = `§7.3.15`、人工判据 = `§8.11`（人类：“目前一切正常”）；本批**未改画面**。

#### 3.10.3 `MDB8-b` · JS 路 11 槽渲染（`mapScene.js` + `actor-view.js`）

- **保留 `actor-view.js` 的解析职责**（`parsePack`/`pickFrame`/`frameRect`/`standFrame`/`labelStartFrame`/`cycleFrame`/`localShadowFrame`）；
  **不在它里面加装备业务**。11 槽深度表与槽→部件名映射放 `actor-look.js`。
- `mapScene.js` 的 `loadActorParts(color)` 改成 `loadLookParts(plan)`：
  1. 按 `plan.layers` 的 `assetKey`（`source:pack:suffix`）取包；`source='naked'` ⇒ `/game/data/actor/<pack>.bin`；
     `source='equip'` ⇒ manifest → `/game-cache/<cachePath>`；逐件 `parsePack` + `createImageBitmap`，**逐件 try/catch**；
  2. 主件失败 ⇒ 尝试 `layer.fallback`（默认件）；仍失败 ⇒ 该层跳过 + 一行日志；
  3. `LOOK_PARTS` 按 `assetKey` 复用位图；换计划只装新增键，装完 `close()` 不再被引用的位图；
  4. 竞态：`lookGen++`，装回前校验 `lookGen` 与场景仍挂载；**不再**用 `M.jsMode` 作丢弃条件（SWF 路也要装）。
- `drawActor(ctx,x,y)` 读当前 `LOOK.plan`（⚠️ b2 起去掉 `flip` 实参，朝向/帧号由 `ACTOR_ANIM` 决定）：
  - `f = standFrame(BODY.pack)`（b 批原计划；⚠️ **b2 起改为每层 `cycleFrame(该层 pack, labelOf(moving,up), tick)` 的 24fps 循环帧 + 4 向**，见 §3.10.3b/§7.3.18）；
  - 先画阴影（`UI_ActorShadow`；⚠️ b2 第二轮手测起帧号 = `localShadowFrame` 的 `local` 帧，**不跟 BODY 帧**，见 §3.10.3b），再按 `plan.layers` 自底向上画；
  - 每层 `x = rec.ox - pack.anchorX`、`y = plan.offsetY + rec.oy - pack.anchorY`；朝向 = 外层 `ctx.scale(±1,1)` 整体镜像（b2 起）；
  - `hiddenSlots` 命中 ⇒ 跳过；`rec.w<=1||rec.h<=1` ⇒ 跳过；缺位图 ⇒ 跳过（或已由 fallback 补位）；
  - `ACTOR_SCALE` 保持 1；`flip=1`。
- **裸装回归**：`plan.layers` 在蓝/红裸装时 = 原 `DOWN_ORDER` 的 7 件 + 阴影，顺序/包/帧全同 ⇒ 应与今天**逐像素一致**。
- **停点**：进 JS 图（如 `1010`/`50000`）⇒ 裸装不变；用 `MDB8-a` 的只读 `dump()` 看 11 槽计划；
  `equipVec` 手工塞入后（下一批才有入口）层序正确、缺包不崩。判据 = M8 §11 第 1–6、10 条（第 6 条要等 c 的入口）。
- ✅ **已落码（2026-10-20）**：as-built = `§7.3.17`、人工判据 = `§8.13`；本批手测钩子 = `APP.actorLook.preview/clear`（`c` 批由正式入口取代）。

#### 3.10.3b `MDB8-b2` · 帧动画 + 4 向（`actor-view.js` + `mapScene.js`；2026-10-20 人类点名插入）—— ✅ **已落码（2026-10-20）**

> **插入原因**：`MDB8-b` 手测时人类看到的是静态站立图 ⇒ `ALQ7` 由 A 改 B（`map-actor-look.md §6.4/§6.7/§10`）。
> 本批只做**角色帧动画 + 4 向**；坐骑浮动 ±5 / 速度 25/20 仍归 `d` 批（`M8-I5`）。

- **血统（目标行为，不照搬 `ALC3` 的空操作）**：
  - `FramePlayer.update()`（`core/animation/FramePlayer.as:114-125`）：每 tick **先绘当前帧、再 +1**，越过 `end` 回 `start`；
  - 帧率 = **24fps**（`game/maprunner/build-config.xml:13`）；
  - 标签 = `MoveStyle.getStyleByDirection`（`run/stand` + `Up/Down`）；玩家走位用 `run`；
  - 方向 = `Mobile.direction` 位掩码（bit1 朝右 ⇒ `scaleX=+1`；bit2 朝上），`PathMobile.updateDirection:184-204`；
  - 停止（`stand`）**保留最后方向**；纯水平段清 bit2 ⇒ `Down`。
  - **帧号归属**：`MultipleEquipPlayer.update`（`:193-199`）对每只 `EquipPlayer`（各自一条 `FramePlayer`）先 `update()`，
    再 `gotoAndPlay(body.currentFrameIndex)`；后者在 `FramePlayer.gotoAndPlay`（`:104-112`）里**忽略实参** ⇒ `ALC3` 空操作。
    实际行为 = **各层在自己的标签区间内、按同一 tick 各自循环**（坐骑 `120403_0` standDown 25–60、装备件 `120301`（头）25–97、
    裸装 BODY 25–65）。目标行为 = 保留「同一 tick」修掉上游的 ±1 错帧，但**不把不同区间强行并到 BODY 帧号**。
  - **装备层站立 = 静姿（ALC13，第二轮手测新增）**：`120302_1`（射手弓左手）的 standDown 25–97 实测是
    「举弓→拉弦→射箭→回位」整段动作（首末帧同为 `si=12`，中间最长 480×150）；照上游循环会站立无限射箭。
    目标行为 = 装备层（11 槽）站立取 `labelStartFrame`（标签首帧）；**坐骑（3/11 槽）与裸装层仍循环**。
  - **阴影 = `local` 帧（ALC14，第二轮手测新增）**：`UI_ActorShadow` 标签 `local=1 / remote=2 / vip=3–39`（3–39 = 光轮）。
    不能按 BODY 帧取模（会光轮/阴影逐圈交替）⇒ 本机普通玩家恒取 `local`（1）；vip/remote 分支待接用户信息。
- **L1 `actor-view.js` 新增纯函数**（无 DOM / 无 fetch / 不 import app）：
  - `cycleFrame(pack, label, tick)`：`start + (tick % span)`；标签缺/越界 ⇒ `standFrame(pack)`；
  - `labelOf(moving, up)`：`(moving?'run':'stand') + (up?'Up':'Down')`；
  - `stepDirection(dx, dy)` → `{right, up}`：`right = dx>=0`、`up = dy<0`（方向由当前段 delta 完全决定；
    纯水平段 `dy=0 ⇒ Down`、纯垂直段 `dx=0 ⇒ right=true`，同 `PathMobile.updateDirection`）。**停止时不调用**（保留朝向）。
- **L4 `mapScene.js`**：
  - `ACTOR_ANIM = {right:true, up:false, moving:false}`（初态 = 朝下朝右，与 b 批首帧一致）；
  - 新增仅 JS 路的常驻 `animRaf`：累计 `dt`，按 `1000/24` 算 `tick`，**仅 tick 变化时 `draw()`**（≈24fps）；
  - 切标签（`label` 变化）⇒ 相位归零、从新标签 `start` 起播（`gotoLabel` 语义）；
  - `stepJs` 移动前调 `stepDirection` 并置 `moving=true`；到位置 `moving=false`；
  - `drawActor(ctx,x,y)`：**每层** `f = cycleFrame(该层 pack, labelOf(moving,up), tick)`（同一 tick、各自的标签区间）；
    **装备层站立改取 `labelStartFrame`**（ALC13）；地面特效默认 `localShadowFrame`（ALC14，不依赖 BODY 帧），
    `b3` 起可切 `vipShadowFrame`（vip 3–39 循环）；
    按 `UP_ORDER`/`DOWN_ORDER` 排序 `LOOK.resolved`；
    左右翻转 = `ctx.scale(right?1:-1, 1)` **整体镜像**（阴影 / 11 槽 / 坐骑同翻，不逐层负宽）；
  - 生命周期：`syncLook` 成功后启动、`leaveJsMode`/`unmount` 取消（`animRaf` 独立于 `rafHandle`/`wanderRaf`）。
- **边界**：
  - **SWF 路本批仍逐字节不变**（叠层 = `f`）；SWF 路角色仍是原 SWF 动画 + 黄点；
  - 坐骑包也是 layer ⇒ 按自己的 standDown 25–60 **连续**循环，但**不抬起浮动**（`d`）；
  - **装备层站立是静姿**（ALC13），跑动时 `run` 整段播放；裸装体/眼与坐骑不受影响；
  - **默认脚下阴影 = `local` 静止帧**（ALC14）；vip 光轮由 `b3` 手动切换（`ground('halo')`），身份自动分支本批不接；
  - 静置也常驻 24fps 重绘（背景/NPC 一起重绘，CPU 上升为预期）；
  - 各包帧表若与 BODY 有出入，`cycleFrame` 用**本层自己的**标签区间；本层缺该标签 ⇒ `standFrame` 兜底，不抛（§6.4）。
- **停点**：§8.14；判据 = 站立循环 / 走位 run + 朝向 / 全套同步 / SWF 回归。
- ✅ **已落码（2026-10-20）**：as-built = `§7.3.18`、人工判据 = `§8.14`；本批不改 `preview/clear` 钩子（动画自动播放）。

#### 3.10.3c `MDB8-b3` · 地面特效切换：阴影 ↔ 光轮（`actor-view.js` + `mapScene.js`；2026-10-20 人类点名插入）—— ✅ **已落码（2026-10-20）**

> **插入原因**：第二轮修补把本机阴影固定为 `local` 后，人类问「想要光轮怎么办」⇒ 地面特效需要**可手动切换**；
> 光轮与角色各自循环 ⇒ 不再有「光轮/阴影交替」带来的间断感（`ALQ9`、`map-actor-look §10`）。

- **血统（目标行为，不照搬身份自动分支）**：`ActorShadow.updateLabel` 按玩家身份二选一（vip 循环 3–39 / remote 停 2 /
  本机停 1）。M8 没有用户信息 ⇒ 默认本机 `local`；另给**手动** `halo` 分支 = `vip` 标签 3–39 循环。
- **L1 `actor-view.js`**：新增 `vipShadowFrame(shadowPack, tick)` = `vip.start + tick % span`；缺标签/越界 ⇒ `localShadowFrame`
  （不复用 `cycleFrame`：该包没有 `standDown`，其 `standFrame` 兜底会落到无意义帧）。
- **L4 `mapScene.js`**：
  - `GROUND_MODE = 'shadow' | 'halo'`（默认 shadow）；
  - `groundElapsed` = 光轮**自己的**时钟，只随常驻 rAF 前进，**不随角色 stand/run 切换归零** ⇒ 光轮连续旋转，
    角色照常播自己的 idle；
  - `drawActor` 先画地面特效：`shadow` ⇒ `localShadowFrame`（1，静止）；`halo` ⇒ `vipShadowFrame(..., groundElapsed)`（3–39 循环）；
  - 手测钩子 `APP.actorLook.ground('halo'|'shadow')`（接受 `vip`/`光轮`）；`clear()` 回裸装 + 阴影；`unmount` 复位。
- **边界**：① 两态**互斥**（每 tick 只画一个），不会出现「光轮里闪阴影」；② 光轮只在 JS 路（SWF 叠层 = `f`）；
  ③ 不写盘、不改会话态（正式入口/会话态归 `c`；按 VIP 身份自动二选一留后续）；④ 地面特效不吃 `offsetY`
  （骑乘抬起角色、特效留地面）。
- **停点**：§8.14 第 15–16 条；判据 = 光轮连续旋转 / 切回阴影 / 角色 idle 不中断 / 套装与坐骑两态都对。
- ✅ **已落码（2026-10-20）**：as-built = `§7.3.19`。

#### 3.10.4 `MDB8-c` · 会话态 + 调试入口（`session.js` + `mapScene.js` + `state.js` 的 `APP`）—— ✅ **已落码（2026-10-20，as-built §7.3.20）**

> **as-built 细化**（与下方原计划的差异）：① `session.actorColor` 初值 = **`null`**（= 跟随 `#avSel`，保持 A2b 旧行为），
> `APP.actorLook.color(n)` 后才固定为 `0..11`；② 新增 `session.groundMode`（`ALQ9` 并入会话态），`unmount` 只复位光轮相位、
> **模式跨图保持**；③ `equip()` 对 slot 3 明确报「请用 `ride()`」，允许槽 = `1/2/4/5/6/7/8`（9+ = NONO 服装不支持）；
> ④ `dump()` 增打「⓪ 当前会话」一组；⑤ `clear()` = 撤调试覆盖 + **清空会话外观**（裸装 + 阴影 + 颜色回跟随 `#avSel`）。

- `game/app/session.js` 的 `session` 增字段（全部**会话态**，本批不写盘）：
  - `equipVec: number[]`（**原始自定义物品 ID**，不含默认合并结果；顺序 = 保存顺序）；
  - `mountEquipId: number`（0 = 未骑乘）；
  - `ridingPetInfo: null`（网络/上游形状留位；第一版只读 `mountEquipId`）；
  - `actorColor: null | 'BLUE' | 'RED' | 0..11`（**初值 `null` = 跟随 `#avSel`**；`color(n)` 后固定到会话；12 色见 **M8-I6**）；
  - `actorSex: 0|1`（从 `data.gender` 派生，**只作兼容输入**，计划不消费 —— **ALC6**）；
  - `groundMode: 'shadow'|'halo'`（`ALQ9` 从 `MDB8-b3` 的局部调试态收编为会话态）。
- `adopt({data})`：从 `data.equip` 灌 `equipVec` / `mountEquipId`（缺省 = `[]` / `0`）；`reset()` 清回默认。
- **调试 API**（挂在既有 `window.APP`，不另造 `window.A`；`mapScene.js` 在 `mount` 时安装）：
  - `APP.actorLook.equip(refId)`：**物品 ID**（如 `100577`；不是 `120301`）⇒ 校验 `itemIndex` 的槽位属于 `1/2/4/5/6/7/8`
    （slot 3 报「请用 `ride()`」、9+ 报 NONO 不支持）；
    同槽已有 ⇒ 替换（保留原位置）；成功后重建计划 + 重绘；
  - `APP.actorLook.unequip(refId)`：按物品 ID 移除；移除后默认装由 `mergeDefaultEquip` 自动补；
  - `APP.actorLook.ride(equipId)` / `unride()`：**装备物品 ID**（如 `101020`；不是 `chipBackId` `900011`），校验 `slot==3`；
  - `APP.actorLook.color(n)`：`0..11`，只改 `session.actorColor`，**不改** SWF 的 `actorColor` 入参（**M8-I6**）；
  - `APP.actorLook.dump()`：打印计划 + 每层包的“已装/缺包”。
  - 所有入口**只改会话态、不写盘**（g 批才接 `session.save()`）；非法参数 ⇒ 一行日志、不改状态；不改 `#/battle`。
- **重绘**：`equip/unequip/ride/unride/color` → `syncLook()`（重建计划、按需装包）→ `draw()`。
  JS 路/ SWF 路共用同一 `syncLook`；SWF 路只在“有自定义外观”时装载（见 f）。
- **停点**：M8 §11 第 2–7、10 条（穿/换/卸/切图保持）；**本批仍不写盘**（关浏览器回裸装是预期）；手测清单 = **§8.15**。

#### 3.10.5 `MDB8-d` · 坐骑（`actor-look.js` + `mapScene.js`）

- **视觉态**（M8 §6.6 / **ALI4**）：`mount != null` ⇒ `offsetY=-50`、`hiddenSlots=[2,6,9,10]`、`speedFactor=1.25`；
  `unride` ⇒ 归零/空/1。✅ 已落（`b` 画，`c` 会话态；`d` 接速度与浮动）。
- **速度换算（本份局部条款 `M8-I1`）**：上游 `runSpeed` 的 `25/20` 是 AS3 帧速单位，**不是** px/ms；
  复刻 JS 自由走当前 `JS_SPEED=0.28 px/ms`（`mapScene.js`）⇒ 骑乘 = `0.28 * 25/20 = 0.35 px/ms`。
  ✅ `d` 已落：`stepJs` 的 `stepAmt = JS_SPEED * 有效计划.speedFactor * dt`（M8-I2 降级时 = 1）。
  **只改 `stepJs` 的步长**；NPC 漫游（MB9）不受影响；SWF 路的本体走位仍归 `MapRunner`（叠层角色不参与走位）。
- **缺包（本份局部条款 `M8-I2`）**：坐骑 `_0` 包未就绪 ⇒ **不应用** `offsetY/hiddenSlots/speedFactor`，
  按裸装/已穿装备画 + 一行日志；**不**出现“角色抬起但坐骑空白”的假态。`_1` 缺 ⇒ 只画 `_0` + 日志。✅ 已落（`loadLookParts` 的 `effectivePlan`）。
- **浮动坐骑（`d` 已落，`M8-I5` 改口径）**：13 个 ID（L1 `FLOAT_MOUNT_IDS`，`Actor.as:215`）⇒ `mount.float=true`；
  L4 `mountVisualOffset()` = `-50 + 5·sin(2π·t/3000)`（3s 周期；正弦近似上游两段 1.5s TweenMax）；
  **动态 `ride()`** 的浮动坐骑先 2s 升起（Back.easeIn 近似，从当前抬升量到 -50）；换图/读档/`preview` 直接浮动；
  `unride`/`clear` 即时归零（同 `Actor.removeDogz`，无降下 tween）。地面特效不吃该偏移（阴影/光轮留地面）。
- **停点**：M8 §11 第 7、8、9 条（骑 `100582` 抬起/藏手脚/加速/上下浮动；`unride` 恢复；挡包不崩）；手测 = **§8.16**。
  ⚠️ 本机缓存只有 `120403`（`100582`，浮动坐骑）这一个坐骑包；`136403`（`101020`）未缓存 ⇒ 只能验 M8-I2 降级，验不了固定坐骑的“不浮动”（等 `e` 补素材）。
- ✅ **已落码并手测通过（2026-10-20，人类「it worked good」）**：as-built = `§7.3.21`、人工判据 = `§8.16`。

#### 3.10.6 `MDB8-e` · 素材补齐 + 清单（与 d 并行）—— ✅ **已结账（2026-10-20：代码 `§7.3.22` + 定向拉取补齐 108 缺件 `§7.3.28`；同日 PI-g 手测后采集单**扩全目录推导** = `MDB8-e3` `§7.3.29`）**

- **补法**（M8 §5.5，两通道）：① **定向拉取**（人类 2026-10-20 拍板 B）= `node tools/fetch-actor-packs.mjs` 按 `missing` 清单点名拉取并登记 `index.json`；② 原路 = 用现役启动器进游戏，穿上/预览/骑上目标装备 ⇒ 客户端请求并缓存；
  从 `~/.cache/seer2-live/game-cache/` 取**裸包**（`swf/` 下是自定义帧序列，不是 CWS）。
- **范围**：29 张骑乘（`_0`+`_1`，M8 §5.4 表）、10 色默认手/身/脚（suit 2–10、39/40）、
  常用装备样本（头/身/手/脚/腰带/翅膀/眼各 1–2 件；已缓存的 18 包先用）。
- **清单**：`tools/build-actor-assets.mjs` 扫 `index.json` → 写 `game/data/actor/equip/manifest.json`（含 `missing`）；
  **逐包核 `parsePack`**（`unitW/H`、info 数、PNG IHDR）只作为“清单字段”，不新写断言脚本；
  工具输出**包名/大小/后缀/来源 URL**，不做网络请求。
- **缺口提示**：`syncLook()` 对当前计划缺包**每个签名只打一行日志**（不刷屏）；不弹窗、不阻塞走位。
- **12 色选择器（本份局部条款 `M8-I6`）**：L1 先支持 12 色；`#avSel` 仍只暴露蓝/红。
  等 10 色默认包齐了，再把选择器扩到 12；SWF 路给 `MapRunner` 的 `actorColor` **只传 `BLUE`/`RED`**
  （上游 `ActorView.as:33-41` 按字符串拼 `UI_<color>_*`，未知名会缺包），非蓝/红颜色在 SWF 路用 canvas 裸装叠层补色。
- **停点**：M8 §11 第 9 条 + 清单与缓存对账（缺件清单可读、不误报已有包）。

#### 3.10.7 `MDB8-f` · SWF 路叠层（`ALQ2=B`，不碰 `game/maprunner/**`）—— ✅ **代码已落（2026-10-20，as-built §7.3.23）· 手测 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**

- **触发条件**：`hasCustomLook()` = `session.equipVec.length > 0 || session.mountEquipId !== 0`
  （裸装默认合并**不算**自定义；`LOOK_OVERRIDE` = 调试直通，优先读）；SWF 图 `enterSwfMode` 成功后，若有自定义外观 ⇒ `syncLook()`。
- **坐标**：复用既有 `mapState` 通道（`MapRunner.as:610` 每 6 帧 post `{x,y,camX,camY,moving}`；`mapScene.js:934` 存 `M.cam`/`M.pos`），
  **不新增消息、不改 AS3**；叠层位置 = `M.cam.x + M.pos.x`、`M.cam.y + M.pos.y`（与今天黄点同源）。
- **绘制**：`draw()` 的 `M.pos` 分支改为：

```js
const canOverlay = LOOK && LOOK.ready &&
  (M.jsMode || (hasCustomLook() && LOOK.missingCustom.length === 0))
if (canOverlay) drawActor(octx, M.cam.x + M.pos.x, M.cam.y + M.pos.y, LOOK_SCALE, LOOK_DY)
else { /* 今天的黄点，逐字节不变 */ }
```

  - JS 路：`LOOK.ready` 即可（部分缺层按 fallback 画）；
  - SWF 路：**所有自定义层就绪**才叠；任一自定义包缺 ⇒ **不叠、保留黄点 + 日志**（M8 §8.4）；
    自定义件 = `session.equipVec` + `mountEquipId` 的 refId（默认色/裸装的 fallback 不算缺）；
  - 无自定义外观 ⇒ **不装载**叠层部件、不改变 SWF 画面（基线保持）。
- **走位观感**：`mapState.moving` ⇒ 叠层播 `run`/`stand`；朝向按 4Hz 位移首版推断（`dx` 主导 ⇒ 左右，`dy` 主导 ⇒ 上下）。
  `mapWalk` 消息里的 `x/y` 是**目标点**（`MapRunner.as:532`）⇒ 叠层激活时**不写入 `M.pos`**（否则角色先闪到终点）；
  不叠层时保留旧黄点行为（基线逐字节不变）。
- **对齐常量**：`LOOK_SCALE=1`、`LOOK_DY=0`（`M.cam/M.pos` 已与黄点同源；如人眼发现脚底偏移，只调这两个常量，**不动 MapRunner**）。
- **已知缺陷（如实登记，不在本批修）**：① 底层 SWF 裸装角色仍在 ⇒ **双角色/露边**；② `front_mc` 前景遮不住
  `#ov`（z-index 2）⇒ **遮挡穿帮**（与 B3 SWF 路 NPC 同族）；③ 位置约 4Hz ⇒ **快速走动跳格/拖影**（帧动画已在 `MDB8-b2` 解决，f 批直接复用 `drawActor`；⚠️ 本份与同期文档旧稿曾误记「~10Hz」，2026-10-20 按 `MapRunner.as:617` 实测修正 = 24fps 每 6 帧回报 ≈4Hz，根因分析见 `map-swf-puppet.md §1`）；
  ④ 朝向 = 位移推断首版，拐角/小步可能滞后；⑤ 非蓝/红颜色**单独切换**（无装备/坐骑）在 SWF 路仍不叠层（`hasCustomLook` 按本批口径只认装备/坐骑）。
- **停点**：M8 §11 第 11 条（`10017`/`100`/`151` 等 SWF 图：穿装备/骑 `101020` 可见、位置跟走位；
  无装备时仍是今天画面；人眼校三件事）。

#### 3.10.7b `MDB8-f2` · SWF 裸装角色显隐（修「双角色」；2026-10-20 人类手测 f 后点名「修」）—— ✅ **代码已落（2026-10-20，as-built §7.3.25）· 手测 §8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**

- **为什么现在做**：`f` 的手测反馈 = SWF 图上看到**两只角色**（底层 `MapRunner` 的裸装 `ActorView` 与 `#ov` 的 canvas 角色并存、
  动画相位/尺寸不齐而露边）。这正是 M8 §8.4 登记的「选项 C 留待再议」触发点 ⇒ 人类拍板修。
- **做法（最小面）**：
  - `game/maprunner/MapRunner.as`：`ExternalInterface.addCallback("actorVisible", jsActorVisible)`，
    实现只有一行语义 —— `if (actor != null) actor.visible = v;`。**只拨显示开关**：走位/相机/光口/NPC/野怪逐字节不变。
  - `tools/build-maprunner.sh` 重编译 `mapRunner.swf`（产物入库，同 §4.16④ 相机修复的口径）。
  - `game/app/scenes/mapScene.js`：`syncSwfActorVisibility(hide)` 在 `draw()` 里**与叠层同帧结算** ——
    canvas 角色**真正画出**（`drewActor`）⇒ `actorVisible(false)`；画的是黄点 ⇒ `actorVisible(true)`。
    结果缓存 `swfActorHidden`（同值不重复下发）；`loadMapRunner` 重建播放器与 `unmount` 时归零 ⇒ 新容器重新下发。
- **边界**：
  1. **JS 路不受影响**（`M.jsMode` 时不调用；JS 图本来就没有第二只角色）；
  2. **无装备 / 缺自定义包 ⇒ 黄点回退时底层角色恢复可见**（SWF 基线不变）；
  3. 换图（`loadWorld`）时 `onMap` 把 actor 摘下再挂回，**显示属性跟着对象走** ⇒ 隐藏态跨图保持，无需重发；
  4. 调用失败（Ruffle 未就绪等）⇒ 不缓存、下次 `draw` 重试，只日志一行（不刷屏）。
- **围栏**：这是「不碰 `game/maprunner/**`」的**授权例外之二**（第一例 = §4.16④ 相机修复）；`AGENTS §4.16④`/`§4.17②③` 已同步。
- **停点**：M8 §11 第 21 条（SWF 图穿装备/骑乘 ⇒ **只有一只角色**；卸装/`clear()` ⇒ 黄点 + 原 SWF 角色回来；走位/光口/NPC 不变）。

#### 3.10.8 `MDB8-g` · 存档接线（`ALQ1=A`）—— ✅ **代码已落（2026-10-20，as-built §7.3.24）· §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」）**

- **codec / schema**（`game/logic/save/codec.js` + `schema.js`）：
  - `TYPES.root` 末尾追加 `{ n:'equip', o:'EquipLook', omitNull:true }`（**必须是最后一块**，`save-xml-spec §1`）；
  - 新增 `TYPES.EquipLook = [{ n:'items', p:'int' }, { n:'mountEquipId', v:'int' }]`
    ⇒ 写出 `<items><int>…</int></items>` / `<mountEquipId>…</mountEquipId>`（空 items = `<items />`，`writePrimList` 已支持）；
  - `fresh()` 增 `equip: null`；`validate()` 增：`equip==null` 合法；否则必须是对象、`items` 为整数数组、`mountEquipId` 为整数；
  - **空块不写**：`mergeBack` 在 `equipVec.length===0 && mountEquipId===0` 时把 `data.equip=null`
    ⇒ 旧档 round-trip **不会凭空多出 `<equip>`**（`omitNull` 省略）。
- **读**：`adopt` 灌 `session.equipVec/mountEquipId`（见 c）；`repository.load(login:true)` / `finishNewGame` 保留该字段（已核：`finishNewGame` 只改版本/宠物袋/登录日期）。
- **写**：`mergeBack()` 末尾写回：

```js
data.equip = (session.equipVec.length || session.mountEquipId)
  ? { items: session.equipVec.slice(), mountEquipId: session.mountEquipId }
  : null
```

  `equip/unequip/ride/unride` 在**本批**才调用 `session.save()`（经 repository 唯一写盘口，**不碰 `activityStorage`**）；
  失败只记日志、不回滚会话态（与既有保存口径一致）。L4 落点 = `installActorLookDebug()` 内的 `persistLook()`
  （named import `save as saveSession`）；`clear/preview/color/ground` 仍只改会话态、**不写盘**（`clear` 之后的下一笔存档会按空外观写 `null`）。
- **兼容口径**：上游不认 `<equip>` ⇒ 会忽略；上游重写该档会丢块；**复刻档不得喂回官方服**；我们自己的 round-trip 必须保留。
- **停点**：M8 §11 第 12 条（关浏览器重进同槽外观保持；XML 有 `<equip>`；导出→导入不丢块；旧档正常进游戏）。

#### 3.10.9 顺序、依赖与停点

| 序 | 批 | 依赖 | 可停点（人手测入口） | 对应 M8 §11 |
|---|---|---|---|---|
| 1 | **a** 数据桥 + 纯计划 | — | `APP.actorLook.dump()` 打 3 组计划；**画面不变** | 第 10 条（提前核编号陷阱） |
| 2 | **b** JS 11 槽渲染 | a | 进 JS 图：裸装逐像素回归；层序/缺包 | 第 1–5、10 条（入口未全） |
| 3 | **c** 会话态 + 调试入口 | b | `equip/unequip/ride/unride/color/dump`；切图保持；**不写盘**（手测 = §8.15） | 第 2–7、10 条 |
| 4 | **d** 坐骑速度 + 浮动 | c | 骑 `100582`（浮动/加速）/ 卸下 / 挡包（手测 = §8.16） | 第 7、8、9 条 |
| 5 | **e** 素材补齐 + 清单 | 可与 d 并行 | ✅ 已结账：`manifest` 带 URL/帧字段、缺包每签名一行（`§7.3.22`）；缺件 108 = 定向拉取补齐（`§7.3.28`，`tools/fetch-actor-packs.mjs`） | 第 9 条 + 清单对账（missing=0） |
| 6 | **f** SWF 叠层 | d | ✅ 代码已落：SWF 图穿/骑可见、位置跟走位；无装备基线不变；人眼校遮挡/跳格（双角色由 **f2** 修，见 §8.20）（手测 = §8.18） | 第 11 条 |
| 7 | **g** 存档接线 | c + 存档线评审 | ✅ 代码已落：重开保持；round-trip；旧档；不喂官方服（手测 = §8.19） | 第 12 条 |
| 7b | **f2** SWF 裸装角色显隐 | f | ✅ 代码已落：叠层画出时隐藏底层 ActorView、黄点回退时恢复（手测 = §8.20） | 第 21 条 |

- **建议顺序**：`a → b → c → d`，随后 `f` 与 `g`（可并行），`e` 与 `d` 并行（`e` 的素材采集可随时插入，不阻塞 `f`/`g`），`f2` 收 `f` 的双角色尾巴。当前 = `a`–`g` + `f2` 全部落码；`a`–`d` 手测通过，`e`/`g`（§8.17 / §8.19）✅ 已通过（人类 2026-10-21「全部测试通过」） = 一揽子通过，`f`/`f2`（§8.18 / §8.20）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） ⇒ **M8 手测全清、全线收口**。
- **每批交付后必须停下**等人类手测反馈（`AGENTS §1` 第 3 条）；反馈进入“文档 + 代码同步修订”回路。
- **不写测试**：验收一律 = 人类跑游戏手测（`AGENTS §1.1` / 决议 ⑦）；本份不新增 `tools/*-test.mjs`、`verify-*`、`probes/**` 或截图脚本。

#### 3.10.10 围栏与“不许顺手做”

1. **`game/maprunner/**` 默认一字不改**：SWF 叠层只经既有 `#ov` + `mapState`；**已获人类授权的例外有三处** = ① §4.16④ 相机修复（as-built §7.3.16）、② `MDB8-f2` 的 `actorVisible` 显隐开关（只拨 `actor.visible`，as-built §7.3.25；⚠️ **`MDB9-c` 后 JS 侧调用已退役** —— puppet 位 AS3 装载即恒隐，回调成惰性死码、**不重编译**）、③ `MDB9` puppet 协议（`setPos`/`walkReached`/`mapClickWant`/`mapWantWalk` + `puppet` 参数，设计 `map-swf-puppet.md` ✅ 过审，as-built §7.3.26/§7.3.27）—— 除此之外不加消息、不改 `ActorView.as`、不重编译 AS3。
2. **不碰 `#/battle`**（`AGENTS §4.8`）；战斗里的角色外观不归本批。
3. **不做正式装备面板 / 背包装备页 / 预览图标**（C1/C2；M8 §8.6）；M8 只有 `APP.actorLook.*` 调试入口。
4. **不做其他玩家外观**（A 组联机围栏）；不读写服务端。
5. **不新增地图缓存**；`loadMap` 仍每图现场解析。
6. **不把装备状态塞进 `activityStorage`**（存档污染）；只用根级 `<equip>`。
7. **不伪造素材**：缺包就跳过/退默认 + 日志；不拿 `swf/` 装备包喂 Ruffle（它不是 SWF）。
8. **不提交第三方包体**：仓库只留 manifest；素材仅本地研究、禁止二次分发。

#### 3.10.11 本份局部条款（待评审时可逐条改）

| # | 条款 | 为什么这样定 |
|---|---|---|
| **M8-I1** | 骑乘速度 = `JS_SPEED * 25/20`（0.28 → 0.35 px/ms），**不是**绝对 25/20 px/ms | 上游单位是 AS3 帧速；我们 JS 自由走是 px/ms；人眼校手感 |
| **M8-I2** | 坐骑包未就绪 ⇒ **不应用**抬升/藏手脚/加速，按未骑画 + 日志 | 避免“悬空 + 无坐骑”的假态（M8 未明说，取**ALI6** 的稳妥解） |
| **M8-I3** | 自定义件缺包时，5 个默认槽退**同色默认件**；腰带/翅膀/坐骑**该槽跳过** | 复刻上游 `EquipPlayer` 的“先默认、后换包”行为（M8 §6.3） |
| **M8-I4** | SWF 路“所有自定义层就绪才叠”，任一缺 ⇒ 黄点 | M8 §8.4 明写；避免半套装备叠在 SWF 角色上更难校 |
| **M8-I5** | 浮动坐骑 = `d` 落：3s 正弦 ±5 近似上游两段 1.5s TweenMax；动态骑上 2s Back.easeIn 升起；卸下瞬时归零 | 设计 §11 第 8 条把浮动列为 d 验收；正弦同 ±5/同周期、无端点突变；精确 Tween 曲线不可观察，不值得复刻 |
| **M8-I6** | L1 支持 12 色；`#avSel` 仍只蓝/红，10 色包齐后再扩；SWF 入参只传 `BLUE`/`RED` | 上游按字符串拼包名，未知名会缺包；先保 SWF 基线不破 |

> ⚠️ **M8-I2/I3/I4/I6 是 impl 级细化**（设计未逐字写死）；评审时若不同意，改本表 + 对应批再落码。
> **未决项**：无（`ALQ1`/`ALQ2` 已拍板，其余按默认）；若评审改口径，以 M8 修订为准。

---

### 3.11 M9 · SWF 路角色提线化（`MDB9-a…c`）—— ✅ **设计已评审通过（人类 2026-10-20「照抄 JS 图」）· `MDB9-a` 已落并手测通过（2026-10-20「nice, 现在ok了」，as-built §7.3.26、手测 §8.21）· `b` 回归已过（2026-10-20「都过」，§8.22）· `c`（收口）✅ 已拍板 A·退役（2026-10-20）、落码并手测通过（as-built §7.3.27、手测 §8.23 ✅「整体结账」）—— **★M9 全线结账，本线无新停点**

> 正本设计 = **`docs/map/map-swf-puppet.md`**（根因、职责归宿表、puppet 协议、`MPQ1–MPQ6` 决策记录、风险）；本节只写**施工落点/接口/判据**，冲突以设计稿为准。
> **一句话**：SWF 图的角色 = **照抄 JS 图那一套** —— 走位/朝向/帧动画/canvas 绘制全用 JS 同一实现，Flash 退为纯背景 + 相机从者，根治 M8-f2 遗留的「一抖一抖」（4Hz 采样台阶，平滑救不了采样率）。
> **围栏**：这是 `game/maprunner/**` 的**第三处授权例外**（人类 2026-10-20 点名 D = 预授权）；前两处（§7.3.16 相机、§7.3.25 `actorVisible`）不动。
> ⚠️ **批次注（c 批 · 人类 2026-10-20 拍板 A·退役）**：下方 §3.11.1/§3.11.2 a 批施工的细案与判据属**施工时态**——凡「`&puppet=0` 调试回旧链 / 旧链照旧」的步骤**已过期**；终态 = **as-built §7.3.27**（puppet 唯一通路，JS 不再透传 `puppet` 参数，AS3 旧走位段成惰性死码、不重编译）。

#### 3.11.1 `MDB9-a` · 提线最小闭环（走 / 传送 / 开战三链一起过 puppet）

**落点**

- **L? AS3 `game/maprunner/MapRunner.as`**（重编译 `mapRunner.swf`）：
  1. 构造读 `loaderInfo.parameters.puppet`（缺省 `"1"`）⇒ `puppet:Boolean`；调试 `&puppet=0` 关。
  2. `ExternalInterface.addCallback("setPos", jsSetPos)`：写 `ax=x, ay=y, moving=mov` → `placeActor()` → **返回 `world.x + "," + world.y`**（String，先例 = `jsHudStatus():String`）。
  3. `ExternalInterface.addCallback("walkReached", jsWalkReached)`：JS 走到野怪脚边后调用 ⇒ 触发暂存的 `callCb`（= `WildPet.onActorReached` → `startFight`）。
  4. `puppet` 位下 **`tick` 跳过走路段**（`if (moving && route.length>0){…}` 与 `placeActor()` 之外不改，route 恒空即可）：不再内部积分、不再发 `mapArrive`/`arriveAtSpot`。
  5. `jsWalkTo` / `onGroundClick`（`:521-540`）在 `puppet` 位**只上报** `post({type:"mapClickWant",x,y})`（`onGroundClick` 已把舞台点转世界点），**不** `findPath`/`spotAt`；`petCallActor`（`:589-597`）在 `puppet` 位存 `callCb=cb` + `post({type:"mapWantWalk",x,y})`，**不**内部走路。
  6. `mapReady`（`:412`）追加字段 `x:ax, y:ay, sw:stage.stageWidth, sh:stage.stageHeight, puppet:puppet`（JS 本地相机钳位的输入 + 初始落点）。
  7. `onActor`（`:397`）装载即 `actor.visible = !puppet`（puppet 位裸装角色恒隐，消除双角色；`actorVisible` 回调保留给 `puppet=0` 旧链）。
- **L4 `game/app/scenes/mapScene.js`**：
  1. `loadMapRunner` 的 `q` 追加 `puppet: P.get('puppet') || '1'`；记录 `M.puppet = (该值 !== '0')`；新播放器复位 `M.walkTarget=null`。
  2. `mapReady` 处理：`M.puppet` 时 ⇒ `M.pos={x:d.x,y:d.y}`、`M.swfStage={sw:d.sw,sh:d.sh}`、`M.cam` 用本地钳位公式初始化（`M.info` 已含界）。
  3. **`mapState` 处理**：`M.puppet` 时 ⇒ **不消费** `x/y/moving`（JS 自给，避免 4Hz 台阶覆写）；仍保留 `M.cam` 事后校准（见 4）。
  4. 新增本地相机 `puppetCam(px,py)`：照抄 `placeActor` 钳位（`mapW<=sw?0:clamp(-(px-sw/2), -(mapX+mapW-sw), -mapX)`，y 同理），吃 `M.info` 的 `mapX/mapY/mapW/mapH` + `M.swfStage` 的 `sw/sh` ⇒ 返回 `{camX,camY}`。
  5. 新增 puppet 走路循环（复用 `stepJs` 数学，独立于 `rafHandle`）：`mapClickWant`→`M.walkTarget={x,y,hit}`（`hit = M.spots` 里 `portalHit`/圆 `≤26` 命中者）、`mapWantWalk`→`M.walkTarget={x,y,hit:WILD}`（到站调 `M.player.walkReached()`）；每帧定速推进 `M.pos`（`JS_SPEED*speedFactor`，人眼校常量 = **M9-I1**）→ `M.cam=puppetCam(...)` → `M.player.setPos(M.pos.x,M.pos.y,moving)`（**不 await**，`.then` 解析 "x,y" 事后校准 `M.cam`）→ `draw()`；到站：`hit.target`⇒`gotoMap`、`hit===WILD`⇒`walkReached()`、否则停。
  6. `canDrawActor()`：`M.puppet && !M.jsMode` ⇒ 恒 `true`（角色一律 canvas 叠层，含裸装/换色/缺包 fallback）；`draw()` 的 SWF 叠层分支用 `M.cam+M.pos`（**不走 `swfFollowPoint`**，那是 `puppet=0` 旧链的补丁）。
  7. `syncSwfActorVisibility`：`M.puppet` 位不改（AS3 已恒隐），仅 `puppet=0` 旧链沿用 f2。

**接口**（puppet 协议，见设计稿 §4）：JS→AS3 `setPos(x,y,moving)->"camX,camY"`、`walkReached()`；AS3→JS `mapClickWant{x,y}`、`mapWantWalk{x,y}`、`mapReady{…,x,y,sw,sh,puppet}`。

**判据 / 停点（= **`§8.21`**（as-built 时独立成节，不并入 §8.20），人类 2026-10-20 主口径）**：进 SWF 图（如 `10017`/`100`/`151`）⇒
① **只有一只角色**（canvas 叠层，SWF 自带裸装恒隐）、**连续走动平滑无抖**（对比 `&puppet=0` 旧链仍 4Hz 抖）；
② **点空地走到**、**点光口走到后传送**、**点野怪走到脚下开战**三链都通；③ 穿装备/骑乘仍叠层（复用 f/b2 的 `drawActor`）；④ `&puppet=0` 一键回旧链（f2 行为逐字节）。

#### 3.11.2 `MDB9-b`/`c`（设计评审后细案，暂不落码）

- **b**：MB10 回图 spawn 落点、昼夜镜像、B3 SWF 路 NPC 点击、HUD 读数在 puppet 数据面回归；缺包 fallback（非黄点）核。✅ **2026-10-20 代码审计 = 四条链路**/**fallback 均结构兼容 puppet、零新增码**（判定见 §8.22 头注）⇒ 本批 = **纯人回归**，清单 = **§8.22**。✅ **2026-10-20 已过（人类「都过」= 回图落点/镜像/NPC 点击/HUD/野怪两面 五条全过）**。
- **c**：✅ **已拍板 A·退役（人类 2026-10-20「A · 退役」）、已落码并手测通过（§8.23 ✅ 2026-10-20「整体结账」）**（as-built **§7.3.27**）。执行面：① **已退役** `swfFollowPoint` 平滑补丁 + `mapState` 的 `x/y/moving` 旧链消费 + `mapWalk`/`mapArrive` 消费（puppet 恒真后 AS3 不再发）+ `syncSwfActorVisibility`/`swfActorHidden`（f2 显隐同步，puppet 位 AS3 恒隐后无消费者）+ `hasCustomLook` 缺包退黄点判定（`customRefs`/`missingCustom`，puppet 位一律 fallback）+ `&puppet=0` 调试入口（JS 不再透传 `q.puppet`；**AS3 参数默认 `"1"`、不重编译**，旧走位段成惰性死码）—— 抖动/双角色逐条登记「由 M9 根治」；② 文档级联收尾：`AGENTS §4.17` 例外与缺陷条目改写为「puppet 唯一通路」✅、`map-code-map §2.4` ✅、`map-actor-look §11` 横幅 ✅、`status.md` 待拍板结账 ✅；③ 旧链代码**可从 git 历史找回**（本批只删不藏）。

#### 3.11.3 本份局部条款（M9）

| # | 条款 | 为什么 |
|---|---|---|
| **M9-I1** | puppet 走路速度 = `JS_SPEED`（0.28px/ms）+ 坐骑 `speedFactor`，**人眼校常量**（SWF 世界界更大、可能觉得偏快/偏慢只调 JS 侧） | 照抄 JS 手感；不回填 AS3 `SPEED=4@24fps` 曲线（MPQ3） |
| **M9-I2** | `setPos` 返回值**不 await**、只做事后 `M.cam` 校准；每帧位置源 = JS 本地钳位公式 | 每帧 `await` 会挂起 rAF；两端同公式同 `ax` ⇒ 数值零分歧、时间差 ≤1 AVM2 帧 |
| **M9-I3** | puppet 位 `canDrawActor` 恒真 ⇒ **黄点分支在 puppet 路不触发**（缺包也画裸装小赛尔，不是黄点） | 照抄 JS 图（JS 路缺包也是小赛尔 fallback）；与 M8-I4（旧链缺包退黄点）分工：旧链不变、puppet 新链 |
| **M9-I4** | 野怪开战：AS3 状态机（`WildPet.onActorReached` 判距 `≤8px`）留、腿交 JS（`mapWantWalk`→走到→`walkReached`） | MPQ4；改动面最小，`fightOut` 后 `startFight` 链不动 |


---

## 4. 落地决策（`D1–D12` · 本份局部编号）

> 这些是 **design 未定 / 留给 impl 的**实现层选择；每条给**依据**与**代价**。人类可否决任意一条（否决则只改那一条）。

| # | 决策 | 依据 | 代价 / 备注 |
|---|---|---|---|
| **D1** | **用 `fast-xml-parser` 真解析**（不用正则），解析器 = **一份纯函数**（`game/logic/map/parse-map.js`，浏览器与 node 审计共用） | `MDQ5`：【样本】Unity 侧有 `<branch>` 嵌套 / CDATA / 注释 / `[XmlText]` ⇒ 正则**静默丢内容**；旧桥的正则只对付过 AS3 的扁平形状 | 依赖已在 `package.json` + `index.html` importmap（save 线已在用）；⚠️ **住 L1 而非 L0**（L0 零第三方依赖），见 `docs/map/map-data.md §3.1` |
| **D2** | **两套血统并存**：旧桥（AS3，文件）继续服务 B3 画面/光口坐标；Unity 侧**现场解析**（无产物）服务规则/实体 | `MDQ4`：合并触发条件 = MQ2 的 134 张全跑通**且**旧桥无独有消费者 | 过渡期**两套 datum 同时在用**（不是债务遗漏，是**有意为之**） |
| **D3** | ✅ **传送的"画面"吃旧桥、"规则"吃 Unity**：光口**位置/出口名**仍用 AS3（B3 已落的舞台坐标），**去哪个图/落点/昼夜**用 Unity（**人类 2026-10-18 拍板 ③ 确认**） | `docs/map/map-teleport.md §2.6`：【样本】两套光口坐标系**不可嫁接**（169/169 全差 >4px）；`MDI3` 双坐标系 | ⚠️ 过渡期会看到"**光口位置来自 AS3、目标图来自 Unity**"；**两套数据不许混算**；⚠️ **A2 例外**：`swfOk=false` 的 JS 回退图**无 AS3 画面坐标** ⇒ 光口位置/起点改由 `js-view.unityToStage`（路线 A）归一化 Unity `pos`（见 `§7.3.7`） |
| **D4** | **不新建 `core/map/operator.ts`**，复用 `game/core/parser/operator.ts` | `docs/map/map-condition.md §6`（**已 101 行照搬**）+ `CSI3`"一份分派表" | ⚠️ **与 design §4.1 的落点表不同**（那里写 `core/map/operator.ts`）⇒ 以本份为准，回执见 §10 |
| **D5** | ⏸ **走位长期交 SWF**（`MapRunner.as`）——**2026-10-18 起由"过渡期"升级为长期**（人类拍板 ②：通行面不实现）；MB5 的"两步走"**复用现有 `mapWalk`/`mapEnter` 消息链** | 现状（`docs/map/map-design.md §2.11`）：移动/寻路**由 SWF 承担**；人类 2026-10-18 拍板；✅ **人类同轮补一句"玩家也全可走"** ⇒ 与现状**一致**（`MapRunner.as:38 USE_GRID=false` ⇒ 整图可走），**无改动** | ⚠️ **只影响 `MB8`**（`walk` 列不产、`geometry/nav/move-runner` 不发码）；⚠️ **`MB9` 漫游不受影响**（人类同轮裁定"不判断 = 哪里都能走" ⇒ 无碰撞照做）；⚠️ `MP6`（"没核过不算全可走"）在**玩家侧暂缓**；⚠️ **A2 例外**：`swfOk=false` 的 JS 回退图**无 Ruffle** ⇒ 走位由 L4 自由走 rAF 承担（定速直线、无寻路、不碰 `MapRunner.as`，与 MB8 搁置同口径，见 `§7.3.7`） |
| **D6** | **写盘收口一次**：`action-runner` 在一批决议落地后调 `session.save()`（`R4` 建档后指向它） | `MNI8` + 决议 ③（核心层只调接口）；上游是 6 个动作各写一次 | `R4` 今天**在 core 内无接缝**（`docs/runtime/runtime-components-design.md §3`）⇒ 过渡期经 app 会话 |
| **D7** | **`unimplemented` + 畸形参数一律登记、不抛、不动状态** | `MP7` + `MNI6` + `MC8` + 决议 ② | 数据写错会**静默失效**，但日志能查（人可复核） |
| **D8** | **解析期登记走一条统一日志通道**：离线对账 → stdout（`node tools/map-audit.mjs`）；运行时 → `MapEnv.log` | `MDI7` 口径 + `CSI6`（语法/求值分离，畸形在**加载期**可见） | 判据 = **数字对得上**（§8.1 的 95/54/393/110/1） |
| **D9** | ✅ **`activity[]` 走「会话/存档级键值袋」** —— **袋 = 存档既有的 `<activityStorage>`**（`docs/save/save-xml-spec.md §2.14`）；**A5 条件纯读**、**`setActivity` 只写袋**（✅ 人类 2026-10-18 **二次确认"需要执行相应的记录 setActivity"**） | **人类 2026-10-18 拍板 ①** + `CSQ4`/`MNQ2`；实证：真机档 `tools/fixtures/save-lite4.9.2-played.xml` 里 **10 个** `Activity`（`noob` → `map=done`/`battle=done`）⇒ **不开新字段** | ⚠️ **边界 = 只读写平键**（无开放时间 / 无奖励 / 无 UI）⇒ **不违 A 组围栏**（`docs/architecture.md §1.1` 无改动）；**代价**：`setActivity` 从 MQ6 的 `unimplemented` 变成"写一次键"（**记在 §10 的回执里**） |
| **D10** | **实体（NPC / Avatar / pet）表现 = 用 SWF 美术素材**（不新画 DOM 图形）；✅ **2026-10-18 追加（裁决 ④ / 路线 A）：实体与野怪的"分布"吃重启数据**，换算 = **简单归一化**（`fx = ux/960`、`fy = uy/540`；重启参考画布 **960×540**，`MapSceneView.cs:11`）+ **位置误差接受** | **人类 2026-10-18 拍板 ④** + 同日路线 A 裁决；现状：`MapRunner.as` **没有 `npc` 概念** ⇒ 实体目前**根本不上屏**；现役野怪管线**本就吃归一化**（`MapRunner.as:222-223`） | **数据面归本线**（记录的 `resId`/sprite 分类 + `<npc pos>`；`docs/map/map-data.md §3.2` / **MDI4**：只分类、不做路径拼接）；**取图、图层机制、NPC 上屏通道归 B3**（`docs/view/scene/room/view-scene-map-content.md §8.2`）。⚠️ **误差来源**：两套地图构图不同（`docs/map/map-teleport.md §2.6`；144 对门的中位差 61px）⇒ **靠人眼校**（B3 §8.1）；⚠️ **一条留给 B3 的开放项**：NPC 的**美术映射**（Unity `<npc>` 的 sprite/resId → 具体 SWF 素材）要 B3 与素材层一起定；本线只保证**数据到得了** |
| **D11** | **注释口径 = 直接忽略**（人类 2026-10-18 拍板 ⑤）：**权威 = 剥注释**，剥掉的内容**一律丢弃、不参与取值（无例外）**；`grep` 值（含注释）**只作对账参考数字、不是数据** | `MDI7`/`MDI8` + 人类拍板 ⑤；实证：M3 §2.1（未剥）与设计 §2.1（剥）差 **27 元素 / 29 子条件**，**差额全在注释里** | ⇒ ❌ **`swfFromComment` 取消**、`MQ2` 第 ③ 级**只认 `<id>.swf`**；线索只在注释里的图登记 **`swf-missing`**（张数由对账工具报出）；日志仍**两个数都打**（权威 + 参考，便于反查差额） |
| **D12** | ✅ **方案 C：运行时现场解析**（人类 2026-10-18 拍板 a/b/c/d）—— **不产构建期产物**、**不做小索引**、**不缓存**；解析器一份两用（浏览器 `loadMap` / node 对账） | 人类原话见 §2.2；`MP1`（取数入口单一） | ⚠️ **dev 期直接吃上游目录**（`projects/...`，路径常量）⇒ 打包期该路径不存在，**已知备案、不阻塞**；⚠️ 代价三样见 §2.2 末 |

---

## 5. 与邻线的接缝（回执 / 请求）

### 5.1 本线**向邻线**要的（请求）

| # | 对象 | 请求 | 什么时候要 |
|---|---|---|---|
| **R-1** | **编排线**（`docs/orchestration/orchestration-impl.md`） | `game/app/session.js` 加两项：① `currentMapId` 单一真值（M5/M7 要）；② `battleOrigin` + 只读窗口 `lastBattle`（**由编排层持有、E6 填充**，`docs/map/map-battle-trigger.md §3.4` / `BTQ1` / `BTI10`） | MB5（①）/ MB7（②） |
| **R-2** | **编排线** | `changeScene('map', {mapId, spawn})` 的**入参**通道（`TPQ5` / 编排线 **OR4**） | MB5 |
| **R-3** | **运行时线**（`docs/runtime/runtime-components-design.md`） | `R4` 写盘 sink / `R5` 提示 sink 的**缝**（core 内今天**一个都没有**，`grep` 0 命中）；`R1` 随机源 / `R2` 时钟 | ✅ **R1 已接（MB3）**：`condition.ts` 声明 `MapRng`（`read`/`consume`/`roll`/`emblem?`），**由 L4 填**；⚠️ **`R2` 时钟仍未建** ⇒ `date.` 臂恒 `'unknown'`（不顺手造时钟）· MB4（R4/R5）/ MB7（R2）/ MB9（R1） |
| **R-4** | **域线 D6 / 道具线** | `petBag` / `firstPet` / `item[]` 的**取值面**（`MapEnv` 的注入实现） | ⚠️ **MB3 已把缝定死**（`PetView.identifier(key)` / `items.count(id, bag?)`），但**实现仍缺** ⇒ 今天 `firstPet.` 恒 `'unknown'`、`petBag(…).count` 恒 `0`（`UNIMPLEMENTED_PET` 占位，**MB5 可先拿它接**）；D6/道具线落地后**只换注入件、不动 MB3** |
| **R-5** | **引擎 E6** | `BattleSpec` 出去 / `BattleResult` 回来（§2.12/§2.3） | MB7（⚠️ **A7 的 `battle.` 键表也随它落**：`keys-battle.ts` 已从 MB3 缓到 MB7；今天 `battleState` 恒缺 ⇒ A7 恒 `'unknown'`） |
| **R-6** | **A3 / C2** | `openHintbox` / `openPanel` / `openDialog(info,{onReply})` 三个接缝 | MB4（前两个）/ MB6（第三个） |
| **R-7** | **B3** | 实体表 / 光口 / 出口名 / 脚标：**数据面本线给、像素 B3 画**（`MP4`）；实体**美术 = SWF 素材**（拍板 ④ / **D10**） | MB5–MB7 + **MB9**（气泡随 ✅ MB9 照做） |
| **R-8** | **编排线** | **活动键值袋的读写面**：`session` 上给 `activityData(id) → Record<string,string>`（只读投影）+ `setActivityData(id, key, value)`（一次写入）。袋 = 存档里**既有的** `<activityStorage>`（人类 2026-10-18 拍板 ①）⇒ **不新增存档字段**；⚠️ 落盘仍走 **R4** 的"收口一次"（不在这里 `save`） | ⚠️ **读侧（MB3）已把缝定死**（`activities: KeyValueBag<string>`，`get(id, key)` ⇒ `undefined` 即走值里的 `[default]`）；**投影本身仍待编排线给**（`session` 上今天没有这个函数）⇒ 在它落地前，`activity` 门一律走 `[default]`。写侧 = MB4 |

### 5.2 本线**给邻线**的（回执）

| # | 对象 | 内容 |
|---|---|---|
| **E-1** | `docs/architecture.md §1.1` | ✅ **已合并**（**TPQ3**）：**"出局 = 子系统，不是地图"** —— 光口指向 A 组出局图（`1010` 牧场 / `50000` 小屋）时**照传**；`<farm>`/`<animal>` **照录不实现动词** |
| **E-2** | **编排线** | **ORC5**（`MapManager.LoadPlayer` 的**无条件 `isShootMode=false`** ⇒ 进图复位射击态）+ 死键 `mapTeleportList`（**TPC9**）**不照搬**；`overlay` 清空时序（**OR8**，对话里 30 条 `teleport`） |
| **E-3** | `docs/view/battle-split.md`（SP 族） | `settings.time → BattleSystemView.cs:49` 的倒计时条**到点不办事**（**BTC10**）⇒ View 侧若显示倒计时，**不许**暗示"到点判负" |
| **E-4** | **门线**（C 组排期 ④，**尚未立**） | 门**不是"一种特殊光口"**（`82`/`88` 有光口出边、`83`–`87` 零入零出）；门的**入口** = `openPanel` 的 `<param>Door</param>`（**12 处**）+ `activity[door]` 条件（**184** 条）；门**回落**到 `StartBattle(param=[floor])` ⇒ 共用 M6 的**开工三门与战后链** |
| **E-5** | **道具线** | `setItem` 的 op 集（`add`/`add_with_hint`/`remove`/`add_to_yite`/`remove_from_yite`）是 M2 的 `ActionIntent` 形状 ⇒ 道具线**不建第二套效果引擎**（`docs/item/item-design.md`） |
| **E-6** | **存档线**（`docs/save/save-impl.md`） | ✅ **无需新增字段**：其中一句"地图的活动键值袋"**就是既有的 `activityStorage`**（`docs/save/save-xml-spec.md §2.14`）⇒ 地图线**只存取平键**、**不碰** `codec.js`/`schema.js` 的形状；⚠️ 但地图线会**写入** `<entry><key><value>` ⇒ 若将来做"存档体检"，请按**合法键值**对待（**不是**外来内容）。✅ **不破** round-trip 保真（无字段增删）。⚠️ 同族的另一条**不改**：**读条件不得建档**（`CSC3`）⇒ 地图线读 `activityStorage` **纯读**，**不**照搬上游 `Activity.Find` 的"顺手建档" |
| **E-7** | **B3**（`docs/view/scene/room/view-scene-map-content.md`） | **人类 2026-10-18 拍板 ④**：实体（NPC / Avatar / pet）表现**用 SWF 美术素材**（**D10**）⇒ 请 B3 定**取图与图层机制**；⚠️ 我这边登记一条**开放项**：NPC 的**美术映射**（Unity `<npc>` 的 sprite/resId → 具体 SWF 素材）需 B3 与素材层一起定（本线只给数据，`MDI4`） |

---

## 6. 装配点与接线（谁在哪儿调）

```text
开机（编排线 D8）: main.js → sceneLoader.boot() → platform.init → bootstrapRuntime(建 storage)
                                    │
                          （读档不在开机时）
                                    ▼
#/map?slot=N&map=…  →  mapScene.mount(query)
                                    │
        initMaps():  await content.loadMap(gid 的当前图) → MapRecord → 规则侧记录 + B3 实体表  ← MB1（方案 C：现场解析）
                     （地图下拉 / 缺图标记仍读旧 AS3 桥 `game/data/maps.json`，**B3 的，不归本线**）
                     content.entitiesOf(record) → logic/map/entity.buildEntities()  ← MB1/MB5
                                    │
                    logic/map/condition-host.createMapEnv(src)  ← ★MB3（已落：env 只在这里拼一次）
                        ├─ mapViewOf(record) → core/map/condition.ts 的 A2 臂
                        ├─ activities（存档 <activityStorage> 的投影）/ rng / player / log … ← L4 填（R-8 / R-3）
                        └─ petBag（D6 占位 UNIMPLEMENTED_PET）/ items（道具线）⇒ 未接面一律 'unknown'
                                    │
        遇 NPC 点击  →  core/map/action.resolve(handler, env)  ──► ActionIntent[]（先过条件门：MB3）
                                    │
                                    │
                     logic/map/action-runner.run(intents, ctx)  ──► A3/C2/item/D6/E6 + session.save()  ← MB4
                                    │
        遇光口点击  →  logic/map/session.walkTo(...)  ──► 过渡期仍走 SWF mapWalk/mapEnter  ← MB5（D5）
                                    │
        遇对话      →  logic/map/dialog-host + A3.openDialog(info,{onReply})            ← MB6
        遇战斗      →  core/map/battle-spec → 编排层 changeScene('rbattle', {spec}) → E6  ← MB7
        点地面      →  logic/map/move-runner（MB8 后换掉 SWF 走位）                      ← MB8
        漫游 NPC    →  logic/map/wander（MB9）                                          ← MB9
```

- **`storage` / 会话** 不属本线（编排线 **ORB4-a** 已落）；本线只**调** `session.save()` / 读 `session.active.state`。
- **槽位（`gid`）来自路由** `#/map?slot=N`（批 C 已落）；**`spawn` 来自 `changeScene` 入参**，**都不是键袋**（`TPQ5`）。

---

## 7. as-built（随实现填；与上文冲突**以本节为准**）

### 7.1 存量（2026-10-18 之前的既有代码 · **建在 AS3 血统上**）

> 这两处**不是本份批序的产物**，是**邻线 B3 期**落下的。如实登记，便于 MB5/MB8 的"换血统"有个明确起点。

| 件 | 位置 | 实况 | 与 design 的差 |
|---|---|---|---|
| **光口 + 出口名悬浮说明 + 两步走** | `game/app/scenes/mapScene.js`：`PORTAL_SRC`/`PORTAL_W/H/OX/OY`（`:55-56`）· `portalHit`（`:61`）· `drawPortals`（`:480`）· `onStageMove`（`:492`）· `mapWalk`→`mapEnter`→`gotoMap`（`:429/:422/:565`） | 出口名取 `<teleport name>` 自己（`spotNameOf`，`:44`，符合 `MP8`）；两步走 = 点击 → 走 → 抵达才切图（符合 `MP5`）；光口 `alpha=0.5`（跟重启 `image.color`，**不跟 AS3 全不透明**） | ① **数据来自 AS3 桥**（`game/data/maps.json`，259 图 / 308 条光口）⇒ MQ1 拍板后**这口锅要换**（Unity 393 条、坐标系不同）；② **落点 = 目标图 `<initialPoint>`**（AS3 属性形）；③ 缺图走 `restoreAfterFail`（`:572`） |
| **旧桥** | `tools/build-map-index.mjs`（48 行）→ `game/data/maps.json` | `DIR='swf/map/config'`（AS3）；字段 `id/name/swf/swfOk/fightMap/fightMapOk/weather/init/entities/teleports`；`entities` = `<entities>` 标签计数（**缺陷**） | 见 `docs/map/map-data.md §6`；**本份 D2 决定过渡期不删** |

**⇒ MB5 的"换血统"要动的正是第 ① 条**：光口**位置/出口名**保持吃 AS3（`D3`），目标图/落点/昼夜改吃 Unity。

### 7.2 MB1 的**复算序列**（`docs/map/map-teleport.md §8` 点名要求 · 方案 C 起不再"重生成"）

```bash
# ① 跑对账工具（只读上游 272 张 XML，**不写仓里任何文件**）；日志即 §8.1 判据表
node tools/map-audit.mjs
# ② 确认真没写仓（两套血统互不覆盖，arch-code §3 规则 6）
git status --short
# ③ 用手测服务起站（写端点 + Cache-Control: no-store），硬刷新后进 #/map
node tools/serve.mjs
```

⚠️ **不改旧桥**：本序列**不重跑** `tools/build-map-index.mjs`（B3 的画面与光口坐标还在吃它）。
⚠️ **`tools/serve.mjs` 是一切手测的前提**（写端点 + `Cache-Control: no-store`，`docs/save/save-impl.md §9.4 ⓪`）；
   方案 C 还多一条依赖：它**服务仓库根** ⇒ 浏览器才取得到 `/projects/.../Maps/<id>.xml`。

### 7.3 各批落地登记

| 批 | 状态 | 落地的文件（实况） | 与 §3 蓝图的偏差 | 请人测 |
|---|---|---|---|---|
| **MB1（v1 · 构建期桥）** | ❌ **已退役（2026-10-18）** | `tools/build-map-entities.mjs` → 产物 `game/data/unity/maps.json`（2.35 MB / 272 条）+ `manifest.json`（+`counts.maps=272`）；`content.js` 加 `mapList`/`mapTableOf`/`entitiesOf` | 历史 as-built 留 **§7.3.1**（**已作废**，仅作对照） | —— |
| **MB1（v2 · 方案 C）** | ✅ **已落码（2026-10-18）** | 新建 `game/logic/map/parse-map.js`；改 `game/app/content.js`（+`loadMap(id)`：fetch 单图 + 解析 + 补 swf 链；退役 `mapList`/`mapTableOf`，`entitiesOf` 改吃记录）；`tools/build-map-entities.mjs` → `tools/map-audit.mjs`（只读不产）；删 `game/data/unity/maps.json`、`manifest.json` 去 `counts.maps` | 见 **§7.3.2** | **§8.1** |
| **MB2** | ✅ **已落码（2026-10-18）** | 新建 `game/core/map/map-table.ts` + `game/core/map/button.ts`（+ `tools/build-core.mjs` 生成的 `.js`）；`game/logic/map/parse-map.js` 改 import L0 的 `parseAssetRef`（本地 `resIdKind` 已删） | 见 **§7.3.3**（**3 条**） | ——（无独立可玩面；判据 = §8.1 对账数字**不变**） |
| **MB3** | ✅ **已落码（2026-10-18）** | 新建 `game/core/map/condition.ts`（+ `tools/build-core.mjs` 生成的 `.js`）· `game/logic/map/condition-host.js` | 见 **§7.3.4**（**4 条**） | 见 **§8.3**（⚠️ **多数要等 MB4/MB5 接线才看得见**） |
| **MB4** | ✅ **已落码（2026-10-18）** | 新建 `game/core/map/action.ts`（+ 生成的 `.js`）· `game/logic/map/action-runner.js` | 见 **§7.3.5**（**6 条**） | 见 **§8.4**（⚠️ 无独立可玩面 ⇒ 端到端随 MB5–MB7） |
| **MB5** | ✅ **已落码（2026-10-18）** | 新建 `game/logic/map/entity.js` · `game/logic/map/session.js`；改 `game/app/scenes/mapScene.js`（Unity 记录并存 / spots 换血统 / 昼夜按钮 / 先登记后 auto / teleport sink / `onNpcClick` 派发口） | 见 **§7.3.6**（**6 条**） | **§8.2**（光口回归 + 出生点 + 昼夜）· **§8.4**（`auto` 面）—— ⚠️ NPC 上屏等 B3 |
| **A2（JS 回退渲染）** | ✅ **已落码（2026-10-19）** | 新建 `game/logic/map/js-view.js`（L1 纯数学）；改 `game/logic/map/session.js`（`mergePortals` 改 **AS3∪Unity 并集**）+ `game/app/scenes/mapScene.js`（单一入口 `renderMap` 分流 `swfOk` / `enterJsMode` JS 渲染 / SWF 路落点回 `initAs3` / `leaveJsMode` / `unmount` 收尾 / 昼夜诊断） | 见 **§7.3.7**（**7 条偏差/限制**）；跨"本线零像素"围栏 ⇒ 正本例外见 `map-code-map §2.4` + `AGENTS §4` 第 11 条 | 见 **§7.3.7 请人测**（obs-1-a 落点 / `990` 三光口 / `50000/1010/90` 进 JS 图 / 昼夜 / 自由走 / Y 翻转）|
| **A2b（角色 sprite）** | ✅ **已落码（2026-10-19）** | 新建 `game/logic/map/actor-view.js`（L1 纯解析 `game/data/actor/*.bin` 大端头/信息表 + AMF3 标签锚定切片 + PNG IHDR 取 `cols`）；改 `game/app/scenes/mapScene.js`（`loadActorParts`+`drawActor` 在 `#ov` 合成原版小赛尔、`ACTOR_CACHE` 静态素材缓存、`draw()` 的 `M.pos` 分支被 `M.jsMode` 门住 ⇒ SWF 路仍画原黄点、`enterJsMode` 触发 / `leaveJsMode` 递增 `gen`） | 见 **§7.3.8**（**6 条偏差/限制**：PNG-vs-SWF 旧注释、`ACTOR_SCALE` 待眼校、静态姿态无动画、朝右无 flip、`avSel` JS 侧每次进图重读略严、不碰 `MapRunner.as`/`game/core`）| 见 **§7.3.8 请人测**（`50000` 站机器人 / `1010`/`90`/`-131` / 尺度 `ACTOR_SCALE` 要人回 / 换色 / SWF 回归仍黄点 / 缺件降级）|
| **MB6** | ✅ **已落码（2026-10-19）** | 新建 `game/core/map/dialog.ts`（L0 纯）+ 生成 `.js` · `game/logic/map/dialog-host.js`（L1）；改 `game/logic/map/entity.js`（`lexDialogBranch`/`buttonSpecFromEl`/`parseHandlerFrags` 导出）· `game/app/scenes/mapScene.js`（自绘最小对话浮层 `renderDialogBox`/`closeDialogBox` + `openDialog`/`teleport` sinks） | 见 **§7.3.9**（偏差：`parseDialogBranches` 吃 L1 lex 的纯记录、非 XML 串；`{expr:}` 只接 `item`/裸数；正式排版归 A3）| 见 **§7.3.9 请人测**（`onNpcClick` 出对话 / 翻页无栈 / 附挂两出路 / 可见性 / `{expr:}` 数字 / 悬空不关）|
| **MB7** | ✅ **已落码（2026-10-19）** | 新建 `game/core/map/battle-spec.ts` + `game/core/map/keys-battle.ts`（L0 纯）+ 生成 `.js`；改 `game/logic/map/parse-map.js`（`battles[]` 列 + 登记）· `tools/map-audit.mjs`（跨图战斗审计 8/154）· `game/app/session.js`（`battleOrigin`/`lastBattle`）· `game/app/scenes/rbattleScene.js`（回图前落 `lastBattle`）· `game/app/scenes/mapScene.js`（`startMapBattle` 三门 + `runPostBattleChain` + `buildMapEnv` 注 `battleState`） | 见 **§7.3.10**（偏差：复用 `#/rbattle` 单敌遭遇；多宠带 settings/板凳敌 = E6；`probe` 恒 `'unknown'` ⇒ 门②③放行 = D6；`turn`/`me.`/`op.` 键恒 `FLOAT_MIN` = E1/E5；`@time` 不接 `BTQ4`）| 见 **§7.3.10 请人测**（`test` 三只开战/回图 / 战后 `setItem` / `OpEscape` 也跑 winHandler `BTI8` / 硬胜 vs 逃-win 分叉 / `50004` 战斗外读捕获 / `simulate` 不落盘）|
| **MB8** | ⏸ **搁置** | —— | —— | §8.7 一并搁置 |
| **MB9** | ✅ **已落码（2026-10-19）** | 新建 `game/logic/map/wander.js`（L1 纯步进、无碰撞 + talk 气泡调度）；改 `game/app/scenes/mapScene.js`（`seedWander` 种子 + 画环取 `n._wander?.pos ?? n.pos` + 常驻 `startWanderLoop`/`stepWanderLoop` rAF，仅 JS 路 + `npcGen` 守卫 + `leaveJsMode` 停 + `drawNpcs` 画文本气泡） | 见 **§7.3.11**（偏差：~~只 JS 回退图、SWF 路不叠游荡~~〔**已被 `MDB11` 取代 = 两条路都走**，`§7.3.33`〕；无碰撞穿墙=已定；`active===false` 仍不漫游；**文本气泡已做、图像气泡当时未做**〔后批 **`MDB10`** 已接 ⇒ **§7.3.32 / §8.26**；⚠️ 气泡调度同日**已从 `wander.js` 迁出** = `logic/map/talk.js`〕）| 见 **§8.8 / §7.3.11 请人测**（`10017` 赤甲虫溜达/会停/不飘出画面 / 点游荡野怪开战 / 驻停文字气泡 / 穿墙观感登记）|
| **MB10** | ✅ **已落码（2026-10-19）** | 改 `game/app/session.js`（`currentMapId`/`lastMapId` 口径注释 + **新增 `lastPos={mapId,x,y}`** + `reset()` 清）· `game/app/scenes/mapScene.js`（`renderMap` 写 `currentMapId`/**返回布尔**、`mount` 回图入口 `map=` 优先、**新增 `rememberRoom()`** 于 `startMapBattle`/`startWildFight`）· `game/app/scenes/rbattleScene.js`（`exitToMap` 命中同房补 `spawn=x,y`） | 见 **§7.3.14**（偏差：房间号**不入档**；传送落点口径 `spawn ?? init` 未动、只有战后回图多带坐标；`map=` 指不存在的图退回下拉当前项）| 见 **§8.10 请人测**（回原房间 / 回原位置 / 战后链回归 / 换房间不串 / 手敲 `map=` / 传送回归 / 不入档）|

#### 7.3.1 MB1 **v1** as-built（2026-10-18）—— ❌ **已退役（方案 C 取代）**

> ⚠️ **本节整节作废**（保留仅作对照）：MB1 v1 = **构建期桥**（`tools/build-map-entities.mjs` → `game/data/unity/maps.json`），
> 已被人类 2026-10-18 的**方案 C**（运行时现场解析）取代 ⇒ 见 **§7.3.2**。下面记的**判据数字仍然有效**（对账工具照打同一组），
> 但**产物、工具、记账**三处均已不存在。

**改点 4 件**：① 新建 `tools/build-map-entities.mjs`（Unity `Maps/*.xml` 272 张 → 桥；AS3 `swf/map/config/*.xml` 只作**只读适配器**）；② 产物 `game/data/unity/maps.json`
（`{_version,_table,_source,_audit,maps[]}`）；③ `manifest.json` **merge** 一笔 `counts.maps = 272`；④ `game/app/content.js` 追加第 8 张表 + 三个出口。

**体检数字（判据 = §8.1）**：

| 判据 | 文档期望 | MB1 实测 |
|---|---|---|
| 记录数 / 负 id | 272 / 26 | **272 / 26** ✅ |
| `<teleport>` 条数 / 含光口的图 | 393 / 211 | **393 / 211** ✅ |
| `portal-inbound-none` / `portal-isolated` | 95 / 54 | **95 / 54** ✅ |
| `invalid-switch` | 1（`71`） | **1**（`71`）✅ |
| 三类光口畸形（重复 id / 空名 / 悬空 target） | 0（Unity 侧） | **0 / 0 / 0** ✅ |
| 七类实体 | npc / farm / animal / pond / insect / nest | **604 / 12 / 15 / 30 / 8 / 3** |
| `fightMap` 写了 / 本地有 | 130 / —— | **130 / 48** |
| `<wild>` | 110 条 / 53 图 | **110 / 53** ✅ |
| `battle-action-dangling` / `battle-branch-unreferenced` | 8 / 154 | **本轮不产**（见偏差 ①） |

**偏差 7 条**（与 §3.1 蓝图逐条对照 · 如实登记）：

① **`battles[]` 列 + 两个 battle 审计未产** —— §2 总表与 **§3.7** 把 `MDB6-a` 排在 **MB7**，故 §8.1 第 6 条**改挂 MB7**（已在 §8.1 就地标注）。
理由：那两条审计要对 `<action>battle</action>` 的 `param` 做**引用扫描** ⇒ 已踩到 **MDI10「桥里出现任何 condition/action 判断即为破口」**的边沿，留给 MB7 与 `battle-spec.ts` 一起落。
② **新增 `switchRaw` 审计列**（§3.2 清单外）：`switch` 仍按拍板**收窄**（`71` ⇒ `0`），原值只在 `switchRaw` 里留档 ⇒ 已同步 `docs/map/map-data.md §3.2`。
③ **`wild` 列产了、`walk` 列没产**：前者是 §3.1「折进本批」+ M7 §3.1 的形状；后者随通行面搁置（人类 2026-10-18）⇒ 已同步 `docs/map/map-data.md §3.2`、`docs/map/map-move.md`。
④ **`geometry` 形状照数据订正**：不是 §3.2 写的 `{polygon: string[]}`，而是 `{mask[], collision[]}`（`<mask|collision id name points/>`，`points` 原串）—— 实测只有 `-70.xml` 一张有值 ⇒ 已同步 §3.2。
⑤ **片段串是"重建"不是"逐字节切片"**：`fast-xml-parser` 不提供原文偏移 ⇒ 片段由 `preserveOrder` 树重建（**CDATA 仍作 CDATA**、文本/属性**重新转义**、空白与自闭合形态归一）。
**语义与上游一致、且天然是良构 XML**（L0 解析器直接吃）；代价是与上游文件**不能逐字节 grep 对齐**。要逐字节 ⇒ 另写切片器（未做）。
⑥ **`worldIdKnown` 的口径是本轮定的**（§3.2 只说了"要同时存"）：定为 **`category ∈ {1,2,100}`**（上游枚举三值）⇒ 实测 `category` 有 **21 种取值**（`1..16` / `100..105` / `200`）⇒ **190/272 张 `worldIdKnown=false`**（`worldId` 仍按 `Map.cs:22` 公式算、不置 null）。已同步 §3.2。
⑦ **`manifest.json` 的记法是 merge**：该文件由 `tools/build-unity-data.mjs` **整份重写** ⇒ **重跑表桥后要再跑一次本工具**，否则 `counts.maps` 会丢（§7.2 的重生成序列已含此步）。

**文档订正 3 处**（设计真值里的数字/形状与数据不符 ⇒ 已改，属 §1 第 4 条的"同时修订文档"）：

| 处 | 原记 | 订正 | 依据 |
|---|---|---|---|
| `docs/map/map-move.md §2.8` | `<self image>` **2,788** / `<self>文本` **732** | **2,682 / 838** | 合计 3,520、distinct **31** 三者一致，只有**两形切分**错 106；两种独立数法（剥注释后正则 + 真解析）都指后者 |
| `docs/map/map-data.md §3.2` | `geometry = {polygon:string[]}`；`worldIdKnown` 无口径；无 `switchRaw`/`wild` 行 | 见偏差 ②③④⑥ | 桥的 as-built |
| `docs/map/map-data.md §2.9` | `swf-missing` "等 MB1 报出" | **55 张**（其中 **48 张**照注释取**能** resolve） | 桥的解析日志 |

**新增实证（不是偏差，是桥跑出来的数 —— 供人眼再判）**：

- **`category` 21 种取值 vs 上游枚举 3 个** ⇒ `worldIdKnown=false` **190 张**（"上游枚举不全"的实测证据，见偏差 ⑥）。
- **swf 四级回退命中** = ① Unity `resId` **4** / ② 同 id 的 AS3 `<resource url>` **134** / ③ `<id>.swf` **32** / ④ 都无 **102**。
  ⚠️ ② 的 **134** 恰好对上 **MQ2 说的"134 张有本地 swf"**；④ 的 **102** = B3「缺图」路径的样本集（前 8 个：`-10, -10010, -1160, -1270, -131, -132, -139, -20`）。
- **`swf-missing` 55 / 可 resolve 48** ⇒ 这就是"注释直接忽略"这条裁决**放弃掉的那部分**（另 7 张照注释也取不到）。
- **图 `100`**：`npcs` = `10001`(斯力普) / `10002`(空名) ✅、`teleports` 3 条（→ `90`/`151`/`101`）✅。
- **`<npc>` 口径差**：解析 **604** vs grep **640**（差 36 = 注释里的实体，D11 弃之）；同理 `size` 缺写 = 解析 **0** / grep **22**（MDC7 记的"5 张"两种口径都不复现，**hazard 仍登记**、今天观测不到）。
- `maps.json` **2.35 MB** ⇒ `content.js` 的 boot 变成 **8 张表 eager**（§5.3 的三个出口是**同步**签名，故不做惰性加载）；`skills.json` 4.1 MB 本来就在这份 eager 里。
- 门禁（人工 grep）：**M-6** `unity/maps` 在 `game/app/` 只 `content.js` 命中 ✅；**M-7** 桥只 `writeFileSync` 到 `maps.json` + `manifest.json` ✅；两套血统互不覆盖（`git status` 只多 `game/data/unity/maps.json` + `manifest.json`）✅。

#### 7.3.2 MB1 **v2** as-built = **方案 C**（2026-10-18）

**改点 5 件**：

| # | 件 | 实况 |
|---|---|---|
| ① | **新建纯解析器** `game/logic/map/parse-map.js`（≈210 行） | 导出 `parseMapXml(rawXml, {file,id,audit})`（XML 串 → `MapRecord`；内部先剥注释）· `stripComments` · `resIdKind`（六形状只分类；⚠️ **MB2 起下沉 L0** `map-table.ts` 的 `parseAssetRef`，**本地实现已删**）· `as3ResourceNameOf` / `as3InitOf`（AS3 只读适配器）· `swfCandidatesFor`（三级候选，⚠️ **不含注释级**）· `pickSwf(candidates, existsAsync)`（存在判据**注入**）。**零 IO / 零 fetch** |
| ② | **改 `game/app/content.js`** | 追加 `loadMap(id)`（`fetch` 单图 Unity XML + AS3 config → 解析 → 补 `swf`/`swfOk`/`fightMapOk`；**不缓存**；`HEAD` 探针判"文件在不在"）· `entitiesOf(record)`（**改吃记录**，不再自己取数）· `emptyEntities()`；**删** boot 第 8 张表（`unity/maps.json`）与 `mapList`/`mapTableOf`；目录常量 `MAPS_XML_DIR` / `MAPS_AS3_DIR` / `MAP_SWF_DIR` |
| ③ | **`git mv tools/build-map-entities.mjs → tools/map-audit.mjs`**（重写） | 读全库 272 张 → 跑**同一份** `parse-map.js` → 打印判据表；**只读、不写仓里任何文件**（`writeFileSync` 零命中） |
| ④ | **删产物** `game/data/unity/maps.json` | 2.35 MB 大表退役 |
| ⑤ | **`manifest.json` 去 `counts.maps`** | 地图不再产 JSON ⇒ 不再记账（六张 CSV 表的 `counts`/`strides` 照旧） |

**判据数字（`node tools/map-audit.mjs` 实跑 · 与 v1 逐条相同）**：

| 判据 | 期望 | 实跑 |
|---|---|---|
| 记录数 / 负 id | 272 / 26 | **272 / 26** ✅ |
| 七类实体 | npc/farm/animal/pond/insect/nest | **604 / 12 / 15 / 30 / 8 / 3** ✅ |
| `<teleport>` 条数 / 含光口图 | 393 / 211 | **393 / 211** ✅ |
| `portal-inbound-none` / `portal-isolated` | 95 / 54 | **95 / 54** ✅ |
| `invalid-switch` | 1（`71`） | **1**（`71`）✅ |
| swf 回退命中 ①/②/③ | 4 / 134 / 32 | **4 / 134 / 32** ✅ |
| `swfOk=false`（其中注释线索 55 / 可 resolve 48） | 102 / 55 / 48 | **102 / 55 / 48** ✅ |
| `fightMap` 写了 / 本地有 | 130 / 48 | **130 / 48** ✅ |
| `<wild>` / 图数 · talk self | 110 / 53 · image 2,682 text 838 | **110 / 53** · **2,682 / 838** ✅ |
| `resId` 分类 | path 346 / npcId 306 / none 20 | **346 / 306 / 20** ✅ |
| 解析失败 | 0 | **0** ✅ |

**偏差 4 条**（与 §3.1 蓝图逐条对照 · 如实登记）：

① **解析器住 L1 而非 L0**（蓝图没写死层，但 design §4.1 的 `core/map/**` 是 L0）—— 因为它 import `fast-xml-parser`，而 L0 是"零第三方依赖的纯端口" ⇒ 放 `game/logic/map/`，与存档线 `logic/save/codec.js` 同族。`M-3`（`core/map/**` 不 fetch / 不读 JSON）**不受影响**。
② **`entitiesOf` 改签名**（`entitiesOf(id)` → `entitiesOf(record)`）：方案 C 下实体随 `loadMap` 的记录一起来的，**不该再按 id 反查一张全库表**。
③ **`swf` / `swfOk` / `fightMapOk` 改成运行时算**（HEAD 探针）—— 蓝图只写了"四级回退"，没定"存在判据从哪来"；node 侧同语义（`fs.existsSync`）⇒ 两边数字一致。
④ **跨图审计（95/54/悬空）只剩对账用途**（运行时不需要，人类 2026-10-18 拍板 b）—— 由 `tools/map-audit.mjs` 离线算。
   ⚠️ **旧 v1 的偏差 ①（`battles[]` 列改挂 MB7）仍然成立**（见 §7.3.1 偏差 ①）；其余 v1 偏差（②`switchRaw`/③`wild`/④`geometry` 形状/⑤片段串重建/⑥`worldIdKnown` 口径）**已并入 v2 的解析器**，仍成立。

**⚠️ 本批丢掉的三样保证**（与 §2.2 同一份清单，此处留档）：① "页面数据已被离线审计过"的保证（改靠人测 + 对账工具）；② 运行期跨图统计；③ 2.35 MB 大表本身。
**⚠️ dev 期吃上游路径**（`/projects/Seer2-Restart-Lite-main/Assets/Resources/Data/Maps`）：**打包期该路径不存在** —— 已知备案、不阻塞（人类 2026-10-18 a）。

**请人测**：见 **§8.1**（本批**不需要玩游戏**：跑一次 `node tools/map-audit.mjs` 对数字；进图那一步随 MB5 一起测）。

#### 7.3.3 MB2 as-built（2026-10-18）—— 基石类型（L0）

**改点 3 件**：

| # | 件 | 实况 |
|---|---|---|
| ① | **新建 `game/core/map/map-table.ts`**（L0 纯函数，≈160 行） | `MapRecord` / `EntityKind` / `AssetKind` / `AssetRef` 类型 · `ENTITY_KINDS` · `MAP_IDENTIFIER_KEYS` · `identifierOf(map,key)`（8 键 + `_ => 0` 兜底）· `isModId(id)`（`id < -50000 \|\| id === 0`）· `isMirrorId(id)`（`id < 0 && !isModId`）· `parseAssetRef(raw)`（六形状**只分类、不拼接、不求值**） |
| ② | **新建 `game/core/map/button.ts`**（L0 纯数据，≈120 行） | `ButtonEventType` / `NpcAction` / `ButtonSource` / `ButtonSpec`（**`source` 必填**，MNI2）· `BUTTON_EVENT_TYPE`（**5** 条）· `NPC_ACTION`（**18** 条）· `PET_ACTIONS`（3 条）· `uiEventOf(b)`（★`auto` ⇒ `null`，MNI1） |
| ③ | **`game/logic/map/parse-map.js` 改 import** | 本地 `resIdKind` 与 `MOD_ID_MAX` **删除**，改 `import { parseAssetRef } from '../../core/map/map-table.js'`（**L1 → L0 下行**）；`rec.resIdKind = parseAssetRef(resId).kind`。⇒ **一份实现、两处不漂移**（§3.2 那句"搬它、不重写"落地） |

⚠️ **两件都必须跑 `node tools/build-core.mjs`**（`game/core/**/*.ts` → 同目录 `.js`；浏览器不吃 `.ts`，`docs/arch-code.md §7.1`）——
本次生成 `game/core/map/{map-table,button}.js`（共 44 个 `.ts` → `.js`）。

**判据（本批**无独立可玩面**，判据 = 对账数字**不变**）**：`node tools/map-audit.mjs` 的输出与 §7.3.2 **逐条相同**
（`resId 分类 path=346 npcId=306 none=20` 即证明 L0 搬移**没改语义**）。

**偏差 3 条**（与 §3.2 蓝图逐条对照 · 如实登记）：

① **多导出了两个运行时常量** `ENTITY_KINDS` / `MAP_IDENTIFIER_KEYS`（蓝图只列了类型与函数）—— 与既有内核**同形**（如 `core/parser/operator.ts` 的 `COND_KEYS` / `OP_KEYS` 也是导出的常量数组）⇒ 供 L0/L1 遍历用。
② **多导出一个 `PET_ACTIONS`**（上游 `NpcActionDatabase.petActionList`，`NpcButtonHandler.cs:73-75`）—— 三个"宠"动作的分类依据，D6 接缝要用；**照录**而非另写。
③ **`parseAssetRef` 的返回值 = `{raw, kind}`**（蓝图 §3.3 就是这个形状）；⚠️ 但 L1 记录里**仍只有** `resId`（原串）+ `resIdKind`（分类）**两列**，**没有**存 `AssetRef` 对象 —— 保持 §3.2 的字段清单不动。

⚠️ **`MapRecord` 的类型声明只列了核心列 + 索引签名**（`[k: string]: unknown`）—— 全字段以 `docs/map/map-data.md §3.2` 为**唯一正本**，**不把那张表抄进 TS**（父文档只链接不重复）。

**请人测**：本批**不用玩游戏**（无独立可玩面）—— 判据是对账数字不变（§8.1）。真正的"点了有没有反应"随 **MB4/MB5** 才有面。

> 落地后**按批**在此追加小节（照 `docs/orchestration/orchestration-impl.md §7.1` 的写法：**改点、偏差逐条、请人测**），
> 并同步 `docs/map/map-code-map.md §7` 的状态列。

#### 7.3.4 MB3 as-built（2026-10-18）—— 条件求值（`condition.ts` + `condition-host.js`）

**改点 3 件**：

| # | 件 | 实况 |
|---|---|---|
| ① | **新建 `game/core/map/condition.ts`**（L0 纯函数，**584 行**） | 类型 `Truth` / `PetView` / `BattleView` / `MapRng` / `KeyValueBag` / `MapEnv` / `ConditionExpr` / `ConditionTerm` / `ConditionIssue` · `splitOrClause`（**括号感知** `\|`）· `parseConditions(texts)`（**解析期**登记畸形）· `evalCondition(expr, env)`（**三值**）· `and3`/`or3` · **A1–A15 十五臂全落** · 再导出 `splitCondition`（= `core/parser/operator.ts` 的那一份，`D4`） |
| ② | **新建 `game/logic/map/condition-host.js`**（L1 适配器，**86 行**） | `createMapEnv(src)`（`MapEnvSource` → `MapEnv`，纯适配）· `mapViewOf(record)`（A2）· `EMPTY_BAG` · `UNIMPLEMENTED_PET`（**D6 落地前的宠占位**）· `evalConditionTexts(texts, src)`（便捷入口） |
| ③ | **跑 `node tools/build-core.mjs`** | 生成 `game/core/map/condition.js`（**45** 个 `.ts` → `.js`；浏览器不吃 `.ts`，`docs/arch-code.md §7.1`） |

⚠️ **`condition-host` 是 `.js` 不是 `.ts`**：`game/core/**` 才是「`.ts` 权威 + 生成 `.js`」；`game/logic/**` 与 `game/app/**` **零构建、浏览器直吃 `.js`**（与 `logic/map/parse-map.js` 同族）。
    ⇒ **订正 `docs/map/map-code-map.md §2.3` 的写法**（那一节把 L1 目标文件全写成了 `.ts`，是**地图线自己的笔误**，本次一并改掉，见该文档 §7）。

**判据（本批**无独立可玩面** —— 条件门要等人点 NPC，而"点 NPC"在 MB4/MB5）**：

| 判据 | 期望 | 实跑（落码时） |
|---|---|---|
| 既有内核测试 `node --test game/core/` | pass 304 / fail 0 | **304 / 0** ✅（新模块**不新增**测试，决议 ⑦） |
| 对账 `node tools/map-audit.mjs` | 与 §7.3.2/§7.3.3 **逐条相同** | **逐条相同** ✅（本批**没碰**解析器） |
| 分层 `M-1`（`core/map/**` 零上层 import） | `grep` 空 | **空** ✅（只 import `../parser/operator.ts` · `./map-table.ts` · `../strutil.ts`） |
| `M-4`（前缀分派只有一处） | `core/map/` 下无 `operator.ts` | **无** ✅（`ls game/core/map/` = `button` `condition` `map-table`） |

**偏差 4 条 + 改判 1 表**（与 §3.3 / `M3 §3.2/§3.4` 逐条对照 · 如实登记）：

① ★ **`M3 §7.1 CSC8` 的真值订正（数据反证）** —— 原文写「`activity` 的**多级下标** ⇒ `'unknown'` + 登记」，
   实现时按"先数清楚再判"复核，发现**反了**：
   - 【样本·剥注释口径】**平键里带 `[...]` 是常态**：`done[1]` / `twin[easy][max]` / `done[north][7][challenge_2]` 一类共 **947 / 1,025 条**（占 `activity` 条件子句的 **92%**）；
   - 【样本·同口径】**动作侧 `setActivity` 就按这个形状写**：`<param>new_basic[easy][max]=30</param>` 一类**写入键带括号**的共 **578 / 603 条**（**96%**；603 = 全库 `setActivity` 条数，含按钮内 575 + 对话分支 `<reply>`/`<func>` 内 28）；
   - ⇒ 它们**不是**"多级下标"，是**平键本身**（`Activity.cs:82-86` 就是 `data.Find(x => x.key == key)`）。
   - **实现**：**照录平键查找**（键、值都按原串平比），**不判"多级下标"**；否则会**误杀 92% 的 `activity` 门**。
   - **保留**设计里对**值**的那半边：值的分隔标记≠`[default]`（实测 **2** 处 `[skin]`，同一串在 `10040.xml` 出现两次）⇒ **解析期登记** `activity-value-marker` + `'unknown'`（"不靠 `IndexOf(']')` 的位置巧合"）。
   - 已就地订正 `docs/map/map-condition.md §7.1 CSC8` + §3.2 表后注（**设计文档已改**，不只是代码注释）。
   - ⚠️ **连"数一遍"本身也订正过一次（如实留档）**：本条第一稿写的是"**479 条 / 47%**"，那是**键提取写错**（把 `activity[door]` 的 `door` 当成了键）留下的数；
     改用**两种互证**数法（① 手工找 `activity[` 后第一个 `]` 再切到算子；② 正则 `activity\[[^\]]*\][^=<>]*\[`）后**两法同为 947 / 1,025**，
     写侧同为 **578 / 603**。⇒ **本 as-built 与设计文档里一律以 947/578 为准**。

② **A11 `player.` 的两键**实现为**真读**，不是 `'unknown'` —— `M3 §3.2` 把 `A9–A12` 四臂一起写成"执行 `'unknown'`（A 组出局）"，
   但 §3.4 的 `MapEnv` **给了 `player` 缝**，且**实测 31 次**（`player.shoot` 29 / `player.achievement` 2，`M3 §2.4`）。
   ⇒ 按"**更细者为准**"（`docs/arch-docs.md §2`）取 §3.4：**只有 `shoot` / `achievement` 两个真键**（`Identifier.cs:67-74`），其余子键一律 `'unknown'` + 登记 `player-key-unknown`（⚠️ 实测发行数据里**也只有这两个**：`player.shoot` 29 次 / `player.achievement` 2 次，`player.` 别的子键 **0 次**）。
   ⚠️ `A10 date.` **实测 0 次**且时钟（运行时线 **R2**）**0 实现** ⇒ 仍 `'unknown'`（本批**不顺手造时钟**）。

③ **两处数值缝加宽成三值**（`MapEnv` 声明与 §3.4 的写法不同）：`items.count` 与 `player.shoot/achievement` 现在允许返回 `'unknown'`。
   依据：这条线的原则是 **"取不到就说不知道"**（`CSI4` —— 上游正是把"不知道"说成了 `0`，`MP7` 的靶子）。
   代价：**MB5 接线时若漏了某一缝，条件会走 `'unknown'` 并记日志**（而不是"安静地说你没有这只宠/这件道具"）—— 这是**想要**的行为。

④ **缺来源的兜底是"保守"而非"零值"**（`createMapEnv`）：`map`/`items`/`player` 缺 ⇒ 恒 `'unknown'`；`rng` 缺 ⇒ **不摇也不推进** + 日志；`log` 缺 ⇒ `console.warn`（**不许静默**）。
   ⚠️ 与 `MP7` 一致：**不抛**、不让缺件把整条链带崩。

**改判表**（上游把"不知道"说成"答案"的地方 ⇒ 统一改成 `'unknown'` + 登记）。**出口只有两个**：解析期 `ConditionExpr.issues[]`（⇒ 该条**恒** `'unknown'`，`CSI6`）与求值期 `log.unknown(why)`（⇒ 本次 `'unknown'`）：

| 类 | 上游行为 | 我们 | 依据 |
|---|---|---|---|
| **兜底裸键**（`active=false`，实测 **1** 次） | 两侧都 `0` ⇒ `0=0` **恒真** | 登记 `unknown-key` + `'unknown'` | `CSC6` |
| **畸形 · 解析期就看得见**（`no-operator` / `random-arm` / `bad-value-number` / `bad-value-int` / `map-unknown-key` / `npc-key-shape` / `activity-key-shape` / `activity-bool-op` / `mission-key-shape` / `item-key-shape` / `petBag-shape` / `activity-value-grammar` / `activity-value-marker`） | 三种坏法：**抛**（`Substring(0,-1)` / `float.Parse` / `int.Parse`）、**静默给 `0`**（`map.` 未知键）、**靠 `IndexOf(']')` 的位置巧合**切值 | 解析期登记（**加载期就看得见**，`CSI6`）；有 issue ⇒ **恒 `'unknown'`** | `MP7`（不抛）+ `CSC6/7/8` + `CSI6` |
| **未实现的臂**（`mission-not-implemented` / `yite-rogue-not-implemented` / `farm-animal-not-implemented` / `date-not-implemented`，即 `mission.` `yite_rogue.` `plant.`/`animal.` `date.`） | 各读一半状态 | 一律 `'unknown'` + 登记 | `M3 §3.2 A6/A9/A10/A12`（A 组出局 / **R2 时钟未建**） |
| **宠面缺来源**（`pet-identifier-unknown` / `pet-filter-unknown` / `pet-bag-empty` / `pet-bag-index-empty`） | `GetPetIdentifier` 不认识 ⇒ `float.MinValue`（**照样参与比较**）；过滤键取不到 ⇒ 回退 `GetNumIdentifier` ⇒ `0`；非 `count` 聚合遇空集 ⇒ `Max` **抛**、裸键 **NRE** | 一律 `'unknown'` + 登记（⚠️ **不静默说"你没有这只宠"**） | `M3 §2.8`（**D6 未落地时的诚实说法**）+ `CSC5` |
| **战斗面未就绪**（`battle-not-ready` / `battle-key-unknown`） | `op != "="` 时把"没在打"当成"打得不一样"；键不认识 ⇒ `MinValue` | `'unknown'` + 登记 | `A7`（键表 `keys-battle.ts` 缓到 **MB7**） |
| **其余缺来源**（`item-source-unknown` / `player-key-unknown` / `scene-data-unknown` / `selection-unknown` / `npc-color-unknown` / `firstPet-empty-bag` / `activity-bool-bad-value`） | 未知键 ⇒ `0`；空背包 / 色段不足 ⇒ **NRE** | `'unknown'` + 登记 | `A2/A3/A4/A8/A11/A13` + `CSC5` |

⚠️ **两个"照录"的例外**（**故意不是 `'unknown'`**，别当成漏登记）：
   ① **`petBag(…).count`**（**认 `count` 这个聚合**）遇空集 ⇒ **真 `0`**（`CSC12`：上游这里**确实**是 0，不是"不知道"）；
   ② 臂的**形状**（`yite_rogue.` / `plant.`/`animal.` / `mission.`）**照录**，只是**执行**统一 `'unknown'` —— 不是"不认这个前缀"。

⇒ **按 issue 名 grep 得全**：解析期 13 个 + 求值期 22 个，全部写在 `game/core/map/condition.ts` 的 `parseTerm`/`eval*` 里（`unknownOf(env, '…')` 的第二参就是日志名）。

**⚠️ 照录（**故意不改**）的行为两条**，别当 bug 报：

1. **设置侧副作用的"是否发生"取决于短路**（`CSC4`）：`a=true|random[new]LTE5` ⇒ 第一项已 `true`，第二项**不求值** ⇒ `random[new]` **不推进**（上游 `||` 同样短路）。
   ⇒ 每点一次按钮，随机数**被推进几次是数据决定的**，不是"恒推进一次"。
2. **`activity` 的 `string` 型臂**（值里没写 `[类型]`）：算子**非 `=`** 时按 `!=` 处理（上游 `:114` 就这么写）；实测这类值 **0** 条（全部 1,025 条都写了类型：`bool` 830 / `int` 195）。

**⚠️ 本批**不落**的三件（等 MB4/MB5，别在本批里找）**：
   ① **XML 片段串 → 条件文本**的抽取（`<button><condition>…</condition>` ⇒ `texts[]`）—— 归 **MB5** `entity.js`（`ButtonSpec` 的**构造**）；
   ② **谁往 `MapEnvSource` 里填真状态** —— 归 **L4** `mapScene.js`（`M-5`：`logic/**` 不许 import `app/**`）；
   ③ **`selection.pet`（`data.PetSelect`）** —— 面板（**C2**）回填前恒缺 ⇒ `'unknown'`。

**请人测**：**本批没有可玩面**（条件门要 MB4 的动作 + MB5 的接线才响）⇒ **今天唯一能跑的只有 §8.1 的对账工具**；
**§8.3 的各条（含第 2 条的 `unknown-key: active` 日志）都要等 MB5 接线**（要"点得到那个 NPC"才看得到）。

#### 7.3.5 MB4 as-built（2026-10-18）—— 动作决议 + 执行器（`action.ts` + `action-runner.js`）

**改点 3 件**：

| # | 件 | 实况 |
|---|---|---|
| ① | **新建 `game/core/map/action.ts`**（L0 纯函数，**361 行**） | 模式门 `SHOOT_TYPE_ID` / `MapMode` / `isShootButton` / `modeGateOk` · **`ActionIntent`**（**13** 个变体）· `NpcParamTarget` / `SetItemOp` / `SET_ITEM_OPS` / `HintboxKind` / `GetPetOp` · **`resolve(handler, env, opts?)`**（**门序 = 模式门 → 条件门 → 动作**，`MNI3`）· **18 动作一格分派**：**9 条真实现**（`setNpcParam`/`openHintbox`/`openPanel`/`openDialog`/`teleport`/`setItem`/`getPet`/`setPet`/`evolvePet`）+ `battle` + `callback` + **`setActivity`（只写袋）**，其余 ⇒ `unimplemented` |
| ② | **新建 `game/logic/map/action-runner.js`**（L1 执行器，**143 行**） | `run(intents, ctx)`（**写盘收口一次**，`MNI8`）· `MAX_CALLBACK_DEPTH = 16`（`MNQ3`）· **sinks 表**（按 `intent.action` 取名，缺项 ⇒ 只登记 `no-sink: <action>`、**不动状态**）· **`callback` 链再入**（`callbackHandler` 按 `typeId` 匹配 ⇒ 再走一遍 `resolve`，**四道闸只登记不抛**）· `api.runCallbackTags`（给 A3 的"选项确认"回调，`MDB2-e`） |
| ③ | **跑 `node tools/build-core.mjs`** | 生成 `game/core/map/action.js`（**46** 个 `.ts` → `.js`；浏览器不吃 `.ts`，`docs/arch-code.md §7.1`） |

**判据**（本批**无独立可玩面** —— 大多数接缝今天**还没有消费者**：A3/C2/道具/D6/E6/M5/MB6 ⇒ 只能到"**能出决议、能到得了接缝**"）：

| 判据 | 期望 | 实跑（落码时） |
|---|---|---|
| 既有内核测试 `node --test game/core/` | pass 304 / fail 0 | **304 / 0** ✅（新模块**不新增**测试，决议 ⑦） |
| 对账 `node tools/map-audit.mjs` | 与 §7.3.2/§7.3.3 **逐条相同** | **逐条相同** ✅（本批**没碰**解析器：272/26 · npc 604 · teleport 393 · 211 · 95/54 · invalid-switch 1 · swf 4/134/32 · wild 110/53 · resId 346/306/20 · 解析失败 0） |
| 分层 `M-1`（`core/map/**` 零上层 import） | `grep` 空 | **空** ✅（只 import `./condition.ts` · `./button.ts` · `../strutil.ts`） |
| 分层 `M-2`（`MP3`：无静态直调 `Item.`/`Pet.`/…） | `grep` 空 | ⚠️ **非空、但本批零新命中** —— 命中**全在 MB3 的 `condition.ts`/`condition.js`**（见**偏差 ⑤**）；`action.ts`/`action.js` **零命中** |
| 分层 `M-3`（L0 不 fetch / 不读 `.json`） | `grep` 空 | **空** ✅ |
| `M-4`（前缀分派只有一处 ⇒ 无 `operator.ts`） | `ls game/core/map/` 无 `operator.ts` | **无** ✅（= `action` `button` `condition` `map-table`） |
| `§8` 第 8 条（内核不碰模式） | `grep "isShootMode" game/core/map/` 空 | **空** ✅（模式是抽象位 `MapMode`） |
| `§8` 第 9 条（L1 文件名一律 `.js`） | `grep` 空 | **空** ✅（新件 = `action-runner.js`） |

**偏差 6 条**（与 §3.4 / `docs/map/map-npc.md §3.2` 逐条对照 · 如实登记）：

① **`resolve` 的签名多了一个可选第三参 `opts`** —— design（`docs/map/map-npc.md §3.2` / `docs/map/map-code-map.md §5.2`）写的是 `resolve(handler, env)` **两参**，但 **`MNI3`（门序不许倒）+ `MNI4`（`shoot` 两条入口）**要求"**模式门在条件之前**"，而**模式不在 `MapEnv` 里**（`MapEnv` 是**条件**的注入面）。⇒ 加 `opts = { mode?, conditions? }`：
   · `mode` = **抽象位**（`'normal' | 'shoot'`）⇒ 门序**在一处强制**、外部无法倒置；
   · `conditions` = **构造期**解析好的 `ConditionExpr`（`CSI6`）；缺省 ⇒ `resolve` 现 `parseConditions(handler.condition)`（只给"点一下算一次"的兜底 —— **MB5 的 `entity.js` 应当把缓存传进来**）。
   ⚠️ 两参调用（`resolve(handler, env)`）**照旧合法**（`opts` 缺省）⇒ §6 装配图那句不动。

② **`unimplemented` 决议多一个 `reason` 字段**（design §3.2 = `{action,name,params}`）：`reason` 是**机器可读**的因由（**23** 个名字，见下表），使"**未实现 / 畸形参数 / A 组出局**"三类在日志里可分且**可 grep**；`name` 仍是动作名、`params` 仍是原串。运行期另有 **9** 个执行器侧日志名（`malformed-intent` · `no-sink: <action>` · `a-group: animal-panel` · `callback-depth-exceeded` · `callback-npc-null` · `callback-handler-empty` · `callback-no-env` · `callback-tag-not-found` · `unknown-intent`）。

③ **`ActionIntent` 少两个 design §3.2 列过的成员**：`removePet`（实测 **0** 命中）与 `player`（`data.<key>=<表达式>` 要 `Parser.ParseOperation`，属**编排线键袋**）—— `MNQ4` 未列它们 ⇒ 本批 `resolve` 对二者出 `unimplemented`（`reason = not-implemented`）、**形状未定死**（等 MB5+/编排线）。⚠️ 这**不是漏做**：`MNQ4` 的九条 + `setActivity` 例外 + `callback` = 本批**全部**的面。

④ **接缝的载荷 = `ActionIntent` 本身**（sinks 一律 `(intent, api) => …`）—— design 的 `openHintbox({title,content,optionNum,onConfirm})`（`docs/map/map-code-map.md §6`）是 **A3 的渲染形状**；按 **MQ7**"**出结构化规格即收口**"，本侧交付的就是**结构化规格**（`{kind, fields:[[k,v]], callbackTag?}`），A3 自行取字段。⇒ `onConfirm` 的等价物 = 执行器给的 **`api.runCallbackTags([tag])`**（`MDB2-e` 的链）。

⑤ `M-2`（`MP3`）门禁的**字面** grep 今天不可能为空（**如实登记**）：正则 `Item\.|Pet\.|Panel\.|SaveSystem\.|Activity\.|Mission\.` 会命中 **`firstPet.`**（`condition.ts` 的 **A4 臂真前缀**，**代码里就有**）与 **MB3 两处注释**（`Activity.Find` / `Pet.GetPetIdentifier`）。⇒ 该门的**真义 = "无静态直调"**；本批 `action.ts`/`action.js` **零命中**。⚠️ 已在 `docs/map/map-code-map.md §8` 第 2 条**加一句注**（带词界的写法留待人类定，**不顺手改验收面**）。

⑥ **`[expr]` 求值器未接 ⇒ 一律 `unimplemented`（`expr-unsupported`）**：实测**只**出现在 `setActivity` 的**值**里（**11** 条，如 `guarantee[1]=[expr]activity[10003].guarantee[1]+1`）—— 上游写活动键值时会**先求值**（活动类的 `SetData`）。求值器 = `M3 ∪ Identifier` 的**同一张前缀表**（`DLI7`，随 **MB6** 落）⇒ 本批**登记、不写半条错的**（**11 / 603 ≈ 1.8%** 的 `setActivity` 暂缺）。⚠️ `openHintbox` 的 `callback=[expr]…`、`callback` 的 `[expr]` 标签**实测 0 命中**（形状留位）。✅ **人类 2026-10-18 已确认**：**现在先登记 + 跳过**，求值器随 MB6 一起落（不额外造）。

**改判表**（上游"数据不合格就抛 / 未知动作静默吞"的地方 ⇒ 统一改成 **`unimplemented` + 登记**，`MNI6` + `MC8` + 决议 ②）。**登记出口 = `unimplemented.reason`（23 个，可按名 grep）**：

| 类 | `reason`（按动作） | 上游行为 | 依据 |
|---|---|---|---|
| **空 `param`** | `no-param`（`openHintbox`/`openPanel`/`openDialog`/`teleport`/`getPet`/`setPet`/`evolvePet`/`setActivity`/`battle`/`callback`） | 直接 `return`（**点了没反应**） | `MNI6` + M5 §3.5（`teleport`/`openDialog` 的"空 `param`"登记） |
| **条数不足** | `param-count-lt-2`（`setNpcParam`/`setItem`） | 直接 `return` | `MNI6` |
| **非数 id** | `bad-target-id`（`setNpcParam`）· `bad-map-id`（`teleport`，**TPC2**） | `int.Parse` **抛** ⇒ 整条动作崩 | `MNI6` + 决议 ② |
| **`key=value` 切不出** | `bad-write`（`setNpcParam`）· `bad-field`（`openHintbox`）· `bad-arg`（`openPanel`）· `bad-entry`（`setActivity`） | `option[1]` **越界抛**（`MNC` 全表通用） | `MNI6` |
| **`param[0]` 不是 `type=<X>`** | `bad-type`（`openHintbox`） | `type[1]` **越界抛**（`:110`） | `MNI6` |
| **落点不是 `x,y`** | `bad-spawn`（`teleport`；实测 **0** 命中） | `ToVector2` 失败 | `MNI6` |
| **未知 op** | `unknown-op`（`setItem`） | `itemFunc = null` ⇒ **整批静默不执行** | `MNI6` + `MC8` |
| **道具/宠的数字串坏** | `bad-item`（`setItem`）· `bad-grant`（`getPet`） | `itemInfo[1]` **越界抛** | `MNI6` |
| **宠标识符坏** | `bad-identifier`（`getPet`）· `bad-value`（`setPet`） | `float.Parse` **抛** | `MNI6` |
| **首条就是 `key=value`** | `identifier-without-pet`（`getPet`） | `pet` 还是 `null` ⇒ **NRE**（`:247`） | `MNI6` + 决议 ② |
| **`index=N` 坏 / 缺 evolveId** | `bad-index`（`setPet`/`evolvePet`）· `missing-evolve-id`（`evolvePet`）· `bad-evolve-id`（`evolvePet`） | `Parser.ParseOperation` / `param[paramOffset]` **抛或越界** | `MNI6` |
| **`[expr]` 求值器未接** | `expr-unsupported`（`setActivity` **值** / `openHintbox` 回调 / `callback` 标签） | 现场求值（活动类的 `SetData` / `:129` / `:469`） | 见**偏差 ⑥**（求值器随 MB6） |
| **A 组出局** | `a-group`（`setMission`/`fish`/`miniGame`/`mail`） | 各自执行玩法 | `MQ6`（A 组）+ `MP7` |
| **本批未实现** | `not-implemented`（`player`/`removePet`） | 各自执行 | `MNQ4`（**偏差 ③**） |
| **未知动作** | `unknown-action`（`None`：拼错的 `action`、`none` 2 次） | `_ =>` **执行回调 / 什么都不做**（**静默**） | `MC8`（加一头登记） |

⚠️ **`setNpcParam` 的 `target === 'animal'`** 不在 L0 登记：`resolve` **照出决议**（`{target:'animal'}`），由**执行器**记 `a-group: animal-panel`（**牧场 = A 组出局**，`docs/map/map-npc.md §2.6` 第 1 行）—— 因为"它是不是要开面板"是**执行面**的判断。

**⚠️ 照录（故意不改）的行为两条**：

1. **`setNpcParam` 的 `param-count-lt-2`**：上游 `Count < 2` 就 `return` ⇒ `param=["animal"]`（只有一格）**连动物面板都不开**（数据里那唯一一条 `animal` 是 `1010.xml`，带第二格）。我们**登记畸形**（比上游"静默没反应"更可见）。
2. **`setPet` 的无 `=` 参数**：上游 `petInfo.Length < 2 ⇒ continue`（**跳过、不算畸形**）⇒ 我们**照录**（`splitKeyValue` 为 `null` 就 `continue`，**不走 `bad-value`**）。

**⚠️ 本批不落的三件（等 MB5/MB6，别在本批里找）**：
   ① **XML 片段串 → `ButtonSpec`** 的构造（含 `<condition>` 文本抽取）—— 归 **MB5** `logic/map/entity.js`；
   ② **各 sinks 的真实实现**（A3 提示 / C2 面板 / 道具线 / D6 宠 / E6 战斗 / M5 传送 / MB6 对话）—— 各自批；
   ③ **`[expr]` 求值器**（`M3 ∪ Identifier` 的同一张前缀表，`DLI7`）—— 随 **MB6**。

**请人测**：**本批与 MB3 同样是"没有可玩面"**（决议要"点得到 NPC"才有面，而"点 NPC 的接线"在 MB5）⇒ **今天唯一能跑的只有 §8.1 的对账工具**；**§8.4 的各条**（`auto` 时机 / A 组不崩 / 畸形参数 / HUD 面板）**都要等 MB5 接线**。
⚠️ 本批**唯一能"看"的**仍是**日志**（`console.warn`，前缀 `[map/action]`）：走到带 `setMission`/`fish`/`miniGame` 的分支时出现一条 `a-group`（也要等接线）。

#### 7.3.6 MB5 as-built（2026-10-18）—— 会话 + 传送接线（`entity.js` + `session.js` + `mapScene.js`）

> **第一个"玩家能感觉到"的批**：把**光口传送 / 昼夜镜像 / 进图即触发的 `auto`** 从旧 AS3 桥换成**重启（Unity）血统的规则**（落点/目标图/昼夜走 Unity，光口位置/出口名仍走 AS3，依 **D3**）。
> ⚠️ **NPC 今天不上屏**（`MapRunner.as` 无 `npc` 概念；"NPC 美术上屏通道"归 **B3**、本线零像素）⇒ "点 NPC 触发对话/战斗/传送"这条链**数据与派发建好、人手测不了**（§7.3 第 5/8 条**不是死账**）。

**改点 3 件**：

| # | 件 | 实况 |
|---|---|---|
| ① | **新建 `game/logic/map/entity.js`**（L1 · **138 行** · 无 DOM/无 fetch） | `parseButtonFragment(fragment, source)`（`<button>`/`<func>`/`<reply>` 片段串 → `ButtonSpec`：`typeId=@type` 原串 + `type=BUTTON_EVENT_TYPE[typeId]??'None'` + `actionType` 首 `<action>` + `action=NPC_ACTION[...]??'None'` + `condition[]`/`param[]` 子元素文本 + `source`）· `buildEntities(record)`（`entities.npcs[]` + 两张处理器表 → 运行时实体表）· `autoSpecsOf(e)`（`type==='Auto'`，**`auto` 非 UI 事件**，`MNI1`）· `uiSpecsOf(e)`（4 种指针事件）· import `fast-xml-parser` + L0 `core/map/button.js`（`parse-map.js` 同口径 preserveOrder） |
| ② | **新建 `game/logic/map/session.js`**（L1 · **纯决议 · 零 import**） | `decideTeleport(mapId)`（`===0`/非数 ⇒ `{kind:'notOpen'}`，`TPQ4`）· `decideMirror(record, targetExists)`（`switch∉{±1}`⇒`invalidSwitch`；`!targetExists(-id)`⇒`missingMirror{wanted}`；否则`mirror{dir,targetMapId:-id}`，`§3.4`/`TPI4`）· `landingSpot(targetRecord, spawn)`（`spawn ?? 目标图 init`，**唯一一条**，`§3.3`/`T2`）· `mergePortals(as3Teleports, unityTeleports, log)`（**D3**：pos/name 取 AS3、target 取同 `id` 的 Unity `targetMapId`；Unity 缺该 id ⇒ 保留 AS3 target + 登记 `portal-no-unity`；畸形 pos ⇒ 不产出 + `bad-portal-pos`，`TPC8`）· `parsePos` 助手。**不取数**（`M-5`）：`targetExists` 由 L4 注入 |
| ③ | **改 `game/app/scenes/mapScene.js`**（L4 接线） | `M` 扩 `{unity,npcs,npcById,env,spawn}`（Unity 与 AS3 **并存**，`D2`）· `spotsOf` **换血统**（喂 `mergePortals`）· `loadUnityInto`（进图 `await CONTENT.loadMap(id)` 现场解析、登记 `invalid-switch`、调 `updateDayNightBtn`）· `buildMapEnv`（`createMapEnv`：`map=mapViewOf(unity)` + `sceneData.get('mapNpcList')→npcById` + `player{shoot,achievement}` + **近似 `rng`** + `log→logLine`）· `makeRunCtx`（**只接 `teleport` sink** ⇒ `decideTeleport`→`notOpen` 登记 / `gotoMap`；`env`/`mode`/`save→A.save`/`log`）· `registerAndRunAuto`（**先登记后 auto**，`MNI5`：`buildEntities`→`M.npcs`/`npcById`/`env`→逐只 `autoSpecsOf`→`resolve`→`MAP_RUN.run`）· `onNpcClick(entityId,typeId)`（挂 `window` 供 **B3** 上屏后接线）· `updateDayNightBtn`（仅 `switch===±1` 显）· `onMirrorClick`（`loadMap(-id)` 探针→`decideMirror`→`gotoMap`/`missingMirror` 登记）· `loadMapRunner`/`worldLoad` 落点 = `landingSpot(M.unity, consumeSpawn()) ?? AS3 init`；BAR 加 `#dayNightBtn`；`unmount` 清 Unity 侧（**不建死键 `mapTeleportList`**，`TPC9`） |

**判据**（本批 = 决议 ⑦ 的"人眼主验收"落点；AI 侧只跑**语法 + 分层 + 无回归**三样）：

| 判据 | 期望 | 实跑 |
|---|---|---|
| 三件 ESM 语法（`node --input-type=module --check`） | 全过 | **全过** ✅（⚠️ `node --check` 默认 CJS 会对浏览器 ESM `.js` 误报 "Cannot use import" ⇒ 须 `--input-type=module`） |
| 对账 `node tools/map-audit.mjs` | 与 §7.3.2/§7.3.3/§7.3.4/§7.3.5 **逐条相同** | **相同** ✅（本批**没碰**解析器/内核：`portal-inbound-none 95` / `portal-isolated 54` / `invalid-switch 1(71)`） |
| 分层 `M-5`（`logic/map/**` 不 import `app/**`） | `grep` 空 | **空** ✅（`entity.js` 只 import `fast-xml-parser` + `core/map/button.js`；`session.js` **零 import**） |
| `core/**/*.ts` 改动 | 无 ⇒ 不需 `build-core` | **无** ✅（本批全 `.js`） |
| 决议 ⑦（不新写/不为验收跑测试脚本） | 遵守 | ✅（只跑既有 `map-audit`；`difftest`/`node --test` 属战斗/道具线，本批 `.js` 改动触不到） |

**偏差 6 条**（与计划文档 `patient-storm-pigeon.md` 及 §3.5 蓝图逐条对照 · 如实登记）：

① **`§3.5` 决议族的 `unreachable{spotId}` / `walkTo` 未落** —— 本批只落 `teleport`/`notOpen`/`mirror`/`missingMirror` 四决议 + `landingSpot`/`mergePortals` 两归一。`walkTo` 依 **D5** 仍交 SWF（不碰 `MapRunner.as`）；`unreachable` 今天**无判据面**（"不可达光口硬穿防护"= §7.3 第 7 条，可能造不出用例）⇒ 留 MB8/后续。**不是漏做**：这两条没有可执行/可观测的消费者。

② **sinks 只接 `teleport`** —— 计划说"复用现成 `openHintbox`/`openPanel`"，但二者**现签名**（`openHintbox({title,content,optionNum,...})` / `openPanel(name)`）与 Unity `ActionIntent` 的形状**对不上** ⇒ 本批**不硬套**，`openHintbox`/`openPanel`/`battle`/`setActivity`/道具/宠一律走 `action-runner` 的内建 `no-sink` 登记（**不崩、不动状态**）。端到端提示/面板随 **MB6**+ 各自批闭合。

③ **`rng` 是近似注入** —— 运行时线 **R1** 未建 ⇒ `MapEnv.rng` 用 `session` 的 `readRandom`/`writeRandom` 回填 + `Math.random()` 摇（`roll` = 局部 `[a~b]`、`emblem` 恒 `false`）。够 `auto` 的 `random[new]` 条件求值 + 观测"每次进出**重摇**"，**不追求与上游逐值一致**（决议 ①）。精确序列随 R1 落地再换注入件、**不动 MB5**。

④ **NPC 不上屏 ⇒ 本批可手测面收窄** —— 点击链（`onNpcClick`→`resolve`→`run`）与派发口（`window.onNpcClick`）已建好，但 B3 画 NPC 前**人手测不到**；依 §7.3 第 5/8 条，**进梦境 `−139/−209`**、**场景包图 `10012…` NPC 动作进出** 今天测不了 ⇒ **登记为"等 B3 的人手测项"，不记死账**。本批**能测**的 = 光口传送 / 昼夜按钮 / `auto` 进图触发（经 `#log`）。

⑤ **`teleport` 的 `intent[1]`（一次性落点 `spawn`）未接** —— sink 只取 `intent.mapId` 走 `gotoMap`；生产侧 `spawn` 实测 **0** 命中 ⇒ 恒走目标图 `init`（§3.3 唯一一条）。URL 侧 `?spawn=` 由 `parseSpawnParam`/`consumeSpawn` **单独**消费（走的是 `changeScene('map',{spawn})` 通道，R-2/OR4，与 `teleport` 动作的 `spawn` 参数**不同源**）。

⑥ **`condition` 未做构造期缓存** —— `registerAndRunAuto`/`onNpcClick` 每次 `resolveAction(b, env, {mode})` ⇒ `resolve` 内部现 `parseConditions(b.condition)`（**非** MB4 偏差 ① 建议的"entity.js 把缓存 `conditions` 传进 `opts`"）。进图 = 一次一批、量小 ⇒ 本批**不优化**（`CSI6`/`CSI7` 记为后续，**不是 bug**）。

**请人测**：**§8.2**（光口回归 + 出生点 + 昼夜按钮）+ **§8.4**（`auto` 面经 `#log`）+ **§8.1** 对账数字**不变**。⚠️ **测不了、别记死账**（等 B3/后续批）：点 NPC 触发对话/战斗/传送、进梦境、场景包图进出、不可达光口硬穿防护。

#### 7.3.7 A2 as-built（2026-10-19）—— **JS 回退渲染器**（缺 SWF 画面的图用 Unity bg 可玩）

> **触发**：MB5 人测暴露 3 条 obs —— **obs-1** 点光口 `151` 落地即遭遇到怪；**obs-2** `131` 没看到昼夜按钮；**obs-3** `990` 一个光口都没有。
> 人类据此拍板 **A2**：对**没有可玩 SWF 画面的图**（运行时探针 `swfOk===false`，实测 102/272）让**地图线自己**用 JS 画 bg + 角色 + 可点光口，"能看能走能传送"（自由走、无寻路 = MB8 搁置同口径）。
> ⚠️ 这**正面跨**了"本线零像素"围栏（正本 = `docs/map/map-code-map.md §2.4` 已加 **A2 例外**），并提前吃下 B3 上屏通道的一小片（**仅 `swfOk=false` 图**）；围栏正本先改、再落码（`AGENTS.md §2`）。

**改动 3 件（本批全 `.js`，无 `core/**/*.ts` ⇒ 不需 `build-core`）**：

| 文件 | 层 | 改点 |
|---|---|---|
| `game/logic/map/js-view.js` | **L1（新建）** | 纯数学、无 DOM / 无 fetch / 不 import app（`M-5`）：`bgKeyOf`（=`resId ?? id`，对齐 `ResourceManager.cs:601/631`）· `bgUrlOf`（`Resources/Maps/bg/{key}.png`）· `fitBg`（`contain` 矩形）· `unityToStage`（**路线 A** 一条换算 + `flipY` 开关）· `buildJsView`（Unity `teleports`/`init` → `{spots,start,name}`） |
| `game/logic/map/session.js` | **L1（改）** | **obs-3**：`mergePortals` 从"只遍历 AS3"改 **AS3 ∪ Unity 并集** —— 新增第 4 参 `unityNormalized`（**L4 已归一化**、本件仍坐标无关），AS3 无同 id 的 Unity 光口 ⇒ 追加一条 + 登记 `portal-unity-only`（仿 `TPC8` 不静默）。`landingSpot`/`decideTeleport`/`decideMirror` **不动** |
| `game/app/scenes/mapScene.js` | **L4（改）** | ① 单一入口 `renderMap(id,{pushHist})`（现场取图**一次**、不缓存 §4.9 → 按 `u.swfOk` 分流）；② **obs-1-a** SWF 路落点改喂 **AS3 `initAs3`**（`spawn ?? initAs3 ?? maps.json init`），**绝不喂 Unity `init`**（960×540）进 AS3 舞台 ⇒ 灭"落地打怪"；③ 所有入口（下拉/重载/返回/`gotoMap`/teleport sink/昼夜/初始 `?map`）统一走 `renderMap`；④ **`enterJsMode`** JS 回退（`#bgc` 画 bg、复用 `#ov`/`#portal`、静态相机 `M.cam=0`、自由走 rAF、点光口 `HOT_R=26` 先走到再 `gotoMap`）；⑤ `leaveJsMode`（换模式/卸载拆净）+ `unmount` 收尾；⑥ 昼夜诊断行 |

**判据（回归门，只回答"没回归"）**：`node tools/map-audit.mjs` **逐字不变**（`swfOk=false 102 / portal-inbound-none 95 / portal-isolated 54 / invalid-switch 1(71) / npc=604 / teleport=393 / 解析失败 0`）✅；`node tools/difftest.mjs` **不一致=0 / 分歧族={}** ✅；`node --test game/core/` **304 pass / 0 fail** ✅。（本批没碰解析器/内核，`session.js`/`js-view.js` 属 L1、`map-audit` 不 import 它们 ⇒ 对账数字不动。）

**偏差 / 已知限制（如实登记，非 bug）**：
- **① Y 翻转待校**：`unityToStage` 的 `flipY`（Unity 左下 vs 舞台左上）是**唯一需人眼校的常量**（路线 A"误差靠人眼校"）⇒ 做成开关，若某 JS 图光口上下颠倒就翻。
- **② contain letterbox**：bg 尺寸非统一（`2400×1320`/`1201×661`/`960×560`/`1920×1120`…）⇒ 整图可见、上下或左右补**黑边**；Unity 坐标映射到**绘制矩形**上（贴合它引用的画面）。
- **③ 静态相机**：`contain` 已把整图放进 1200×660 ⇒ `M.cam={0,0}`；**跟随相机（超尺寸 bg 滚动）不在 A2 范围**。
- **④ 只画 bg + 角色 + 光口**：NPC/野怪/农场/动物 sprite **一律不画**（A 组子系统 + B3 实体美术围栏仍在）⇒ JS 图里没有实体。⚠️ **角色本批初为黄点**，**A2b（§7.3.8）已把黄点升级为原版小赛尔**（仍不画 NPC/野怪）。
- **⑤ 无寻路 / 可穿"墙"**：JS 路 = 定速直线走（`JS_SPEED≈0.28px/ms`），与 MB8 搁置 / MB9 无碰撞同口径。
- **⑥ obs-2 症状 (a) 独立未修**：`131` **按钮不出现**是独立接线问题（`switch=1` 解析正常），本批只加**诊断行**（`#log` 打 `昼夜检查 switch=…`）定位，**不盲修**；症状 (b)（`131→-131` 点了进不去）由 A2 副作用通（`-131` 现可进 JS 图）。
- **⑦ 缺底图不静默、不黑屏**：`bgUrlOf` 取图 `onerror` ⇒ `logLine('缺底图…')` + 按整舞台矩形铺一版占位（仍可走/可传），绝不空白崩溃。

**请人测（A2）**：见 §8（obs-1-a 落点、obs-3 `990` 三光口、`50000/1010/90` 直接进 JS 图能看能走能传、昼夜、自由走手感、Y 翻转）。

#### 7.3.8 A2b as-built（2026-10-19）—— **JS 回退图把角色黄点换成原版小赛尔**（部件包 JS 合成 · 静态站立）

> **触发**：A2 人测反馈 **#1** = `swfOk===false` 的 JS 图（如草系主城 `90`）里角色只是**黄点**、没有小赛尔机器人。
> 人类路线 B 拍板 = **最小一批只做「玩家角色」**（不上 NPC / 野怪）、素材 = **原版 SWF 符号**（`game/data/actor/*.bin` 部件包，与 AS3 `MapRunner` 同一份真值）。
> ⚠️ 这把 §2.4 的 A2 围栏"只画角色点"**升级**为"画角色 sprite"⇒ 围栏正本先改（`AGENTS §4` 第 11 条 + `map-code-map §2.4`）、再落码（`AGENTS §2`）。

**改动 2 件（本批全 `.js`、不碰 `game/core/**` ⇒ 不需 `build-core`）**：

| 文件 | 层 | 改点 |
|---|---|---|
| `game/logic/map/actor-view.js` | **L1（新建）** | 纯解析、无 DOM / 无 fetch / 不 import app（`M-5`；`DataView`/`Uint8Array`/`TextDecoder` = ES 内置）：`parsePack(u8)`（**大端 u16** 解 `.bin` = head `frameW,H,totalFrames,anchorX,Y` + **AMF3** 锚定切片取 `labels`（属性 `i` 前、`l` 后，U29 长度 `v>>1`）+ info `unitW,H,frameNum,` 每条 `key,ox,oy,w,h,si` + 尾部 **PNG 字节** 零拷贝 `subarray`；`cols` 从 **PNG IHDR**（`rest+16`）纯算，`f<1`→null、缺 `l/i`⇒`labels={}` 不抛）· `pickFrame`（照搬 `FrameSequence.as:93` **`key<=f` 用 break**）· `standFrame`（=`standDown.start`，兜底 25→1）· `SHADOW_FRAME`（`((f-1)%totalFrames)+1`；⚠️ `MDB8-b2` 第二轮已删除 ⇒ 改 `localShadowFrame`/`labelStartFrame`，见 §7.3.18）· `frameRect(pack,rec)`（`{sx,sy,sw,sh}` 裁帧源矩形 = `si%cols*unitW,(si/cols|0)*unitH,rec.w,rec.h`，纯数学故留在 L1、L4 只喂 `drawImage`）· `ACTOR_PACKS(color)`（8 件、含 `RGIHT` 原拼写）· `DOWN_ORDER`/`UP_ORDER` |
| `game/app/scenes/mapScene.js` | **L4（改）** | ① `import * as ACTOR_VIEW`；② `ACTOR_CACHE`（**静态素材缓存** `{color,parts:{slot→{pack,bitmap}},gen}`，`§4.9`「不缓存」只针对**地图**、先例 = `worldLoad` 的「8 个 .bin 只加载一次」+ `portalImg` `<img>`）；③ `loadActorParts(color)`（逐 slot `fetch('/game/data/actor/'+name+'.bin')` → `parsePack` → `createImageBitmap(new Blob([pack.png]))`；**逐件 try/catch 绝不外抛**，缺件 `logLine`、BODY 缺则留黄点，仿 `ActorView.as:75-80`；装回前校验 `gen`+`M.jsMode` 防换图/卸载竞态，换色 `bitmap.close()` 旧的）；④ `drawActor(ctx,x,y,flip)`（`save→translate→scale(ACTOR_SCALE)`、先阴影后 `DOWN_ORDER` 7 件、**跳过 `w\|\|h<=1` 的 1×1「隐藏」裁帧**、9 参 `drawImage` 用 `si%cols*unitW,(si/cols|0)*unitH` 裁 → `flip*(ox-anchorX),oy-anchorY,flip*w,h`，`flip` = 负目标宽复刻 Flash `scaleX`）；⑤ `draw()` 的 `if(M.pos)` 分支 **仅 `M.jsMode && ACTOR_CACHE` 画机器人、否则原黄点** ⇒ SWF 路字节不变；⑥ `enterJsMode` 读 `avSel?.value\|\|'BLUE'` 触发加载、缺/变色先置 `null`（黄点顶上）再 `then(()=>{if(M.jsMode)draw()})`（仿 `portalImg.onload`）；⑦ `leaveJsMode` **只清 `M.actor` 态 + 递增 `gen`、不删缓存**；⑧ `window` 调试面补 `drawActor/loadActorParts` |

**判据（回归门，只回答"没回归"）**：✅ **落码后复跑（2026-10-19）三闸全绿、数字逐字吻合基线** —— `node tools/map-audit.mjs` **逐字不变**（`swfOk=false 102 / portal-inbound-none 95 / portal-isolated 54 / invalid-switch 1(71) / npc=604 / teleport=393 / 解析失败 0`）—— 本批不碰解析器/内核，L1 `actor-view.js` 不被 `map-audit` import ⇒ 对账数字不动；`node tools/difftest.mjs` **不一致=0 / 分歧族={}**；`node --test game/core/` **304 pass / 0 fail**；语法：`node --check` 过 `actor-view.js`（顶层 `export` 被识别为 ESM），`mapScene.js` 经 `.mjs` 副本 `node --check` 过（app 侧 `.js` 是浏览器直吃的 ESM，`node --check` 默认按 CJS 解会误报 import ⇒ 用 `.mjs` 强制 ESM 解析，仅查语法、不解析 import / 不执行）。另：对 `UI_BLUE_BODY.bin`/`UI_ActorShadow.bin` 做了**纯内存**解析自检（head/info/PNG IHDR/`standFrame=25`/`pickFrame(25)={key:25,ox:16,oy:17,w:41,h:39,si:7}`/`cols=9`），不落盘、不新增脚本（决议 ⑦ 加严口径下、plan Step 2 授权的一次性手算核对）。

**偏差 / 已知限制（如实登记，非 bug）**：
- **① 旧注释"内嵌 SWF"不实**：`FrameSequence.as:5` 与 `tools/extract-actor-packs.mjs:5` 写「内嵌位图 SWF」，实测每个包 `rest` 都是**带 alpha 的 PNG**（`89 50 4e 47 … IEND`）⇒ 本批据此走 `createImageBitmap` 简化管线。`game/maprunner/**` 是禁改区（`map-code-map.md:110`）⇒ **AS3/工具注释不动、只在此登记差异**。
- **② `ACTOR_SCALE` 待眼校**（路线 A 第二个"靠人眼校"常量，接 `flipY` 先例）：机器人原生 `41×63px`，`2400×1320/1920×1120` 大 bg 被 `fitBg` 缩到 ~0.5 ⇒ 相对背景会显大 ⇒ 默认 `1`、注释给 `M.bgRect.dw/1200` 备选，**人测定夺**。
- **③ 静态站立、无动画**：只画 `standDown` 起始一帧（=25，与 AS3 `setLabel("standDown")` 首帧同形）⇒ **走位动画**（`Timer`/rAF 逐帧）**留后批**。
- **④ 朝右、无朝向翻转**：`flip=1` + `DOWN_ORDER`（`up=false`）⇒ **`flip=-1` 朝向 + `UP_ORDER` 换层序 + y 方向选美术集**（`MapRunner.as:625-628` 按 y 选上/下行）**留后批**。
- **⑤ `avSel` JS 侧略严于 SWF**：JS 每次 `enterJsMode` 重读 `avSel.value`；SWF 只在容器重建时取新色（`loadMapRunner:711` 传、`worldLoad:749` 不重传、`MapRunner.jsLoadWorld:162` 回读原始参数）⇒ 不是 SWF 路 bug，JS 只是更即时。
- **⑥ 不碰禁改区**：`MapRunner.as`/`mapRunner.swf`（碰则须重跑 `build-maprunner.sh`）、`#portal`/`drawPortals`、`game/core/**` 全未动 ⇒ 无 `build-core`；`swfOk===true` 的 ~170 图逐字节不变。

**请人测（A2b）**：`990`→「基地」→`50000` 出生点站**小赛尔**（约 63px 高、脚踩点、脚下软阴影、非黄点）；`1010`/`90`/`131`→昼夜→`-131` 各有机器人、不黑屏；**尺度**：大 bg vs `990` 级 bg，回 `ACTOR_SCALE`=`1` 还是 `rect.dw/1200`；自由走机器人随位置平移、点光口先走到再切、返回仍是机器人；换色 `avSel`=红→重载→进 JS 图=红身躯（头/眼不变）、再进别图缓存命中不闪、无红蓝混装；**SWF 回归**：`100`→`151`=真 AS3 画面、**仍黄点、无机器人**；降级：挡一个 `.bin`=部分机器人+一行 `logLine`、仍可走可传、不崩。

> 📝 **M8 = 本份 §3.10（`ALQ1=A`/`ALQ2=B` 已拍板；`a`–`d` 手测通过 · `e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 停点 §8.20）**：本节的 8 件裸装合成是 M8 的**起点**，不是终点 ——
> M8 要把它扩成 **11 槽装备分层 + 坐骑（槽 3）**：新增 L1 `game/logic/map/actor-look.js`（纯计划函数，§3.10.2），
> L4 同一片自绘区扩 JS 路 11 槽（§3.10.3）+ **SWF 路叠整只角色**（§3.10.7；无装备仍黄点），
> 装备/坐骑状态经存档 `<equip>` 持久化（§3.10.8；`save-xml-spec §2.22`）。
> `actor-view.js parsePack` 已验证可读装备包；素材、行号与怪癖见 **`docs/map/map-actor-look.md`**。

---

#### 7.3.9 MB6 as-built（2026-10-19）—— 对话（`core/map/dialog.ts` + `logic/map/dialog-host.js` + L4 自绘浮层）

**改点**：
- **新建 L0 `game/core/map/dialog.ts`**（纯，零 XML/零第三方，`MP3`）：`parseDialogBranches(lexed, log)` · `resolveBranch(branches, param0)` → `DialogBranch | 'close' | 'missing'`（`'null'`⇒`'close'` `DLI4`；找不到⇒`'missing'` 不关 = **DLC3 修法**）· `choicesOf(branch)`（`type="branch"` 附挂⇒上一条可见项；`idx0` 附挂⇒登记 `orphan-branch` `DLC5`）· `renderContent(raw, resolveExpr, log)`（`{expr:}` 走注入前缀表、**永不变异 raw** `DLC1`、`story=` 解析期剥成 `presentation` `DLQ1`、单趟扫描不重扫展开结果 `DLC8`、`random*` 拒 `DLI6`）。
- **新建 L1 `game/logic/map/dialog-host.js`**（无 DOM/fetch，`M-5`）：`openDialog(entity, param0, env, log)` → 可渲染 payload + 每选项 `ActionIntent[]`（`condition` 求值 + `action` 出决议）· `choiceView`（可见性 = OR≠false `DLQ5`）· `clickChoice`（点击期全满足者执行、不短路 `DLI5`）· `makeExprResolver(env)`（`item[..].num`/`item_yite[..]`/裸数；`random*` 拒；未知⇒`null`）。
- **改 L1 `game/logic/map/entity.js`**：`lexDialogBranch`（XML `<branch>` → L0 输入纯记录，**XML 解析留 L1**）· `buttonSpecFromEl`/`parseButtonFragment` 的 `description` 改**子元素 `<description>` 优先**（对话的 func/reply 用后者）· `buildEntities` 透传 `battles[]`。
- **改 L4 `game/app/scenes/mapScene.js`**（决策一 A）：**自绘最小对话浮层** `renderDialogBox`/`closeDialogBox`（`#dialog` DOM 层，说话人名 + 正文（`richToHtml` 白名单 `color`/`b`）+ 可点选项 + 关闭）；`makeRunCtx().sinks` 补 **`openDialog`**（→ `dialog-host` → 浮层）；选项点击 ⇒ `clickChoice` → **同一台** `resolve→run`；`teleport` 执行前撤浮层（OR8）。**（2026-10-19 追改：`#dialog` `z-index` 由 50 抬到 80 —— B3 后 HUD 宿主 `#rv`(z=60) / `#prompt`(z=70) 同为 `#wrap` 子节点、同一起叠上下文，50 会被底部 HUD 遮住对话，故压到两者之上。）**

**偏差 / 限制（与 §3.6 蓝图逐条对照）**：
① **`parseDialogBranches` 的输入 = L1 lex 的纯记录、非 XML 串** —— `dialog.ts` 零第三方依赖带不动 `fast-xml-parser` ⇒ XML 词法留 L1（`entity.lexDialogBranch`），L0 只物化（附挂/可见性/插值）。design §3.6 原文写"L0 解析 XML"，本实现把解析边界上移到 L1，语义不变。
② **`{expr:}` 前缀表只接 `item`/`item_yite`/裸数**（实测 `10693` feather 全用 `item[..].num`）—— 其余前缀（`pet.`/`activity.`/`battle.`）在对话插值里**未命中 ⇒ 返回 `null`**、显示按目标（不抛、不瞎猜）；扩到全前缀表随各消费线（D6/E6）自然生效。
③ **正式对话排版归 A3** —— 本浮层是"看得见、点得动"的**调试触发面**最小 UI（围栏扩展见 `map-code-map §2.4` + `AGENTS §4` 第 11 条），**非像素级美术**；富文本只放 `color`/`b` 两种白名单。
④ **`story=` 半边不做**（`DLQ1`，A 组出局）—— 只剥前缀、留 `presentation:'story'` 字段位，不渲染剧情。
⑤ **NPC 不上屏**（B3 围栏）⇒ 对话触发 = 控制台 `window.onNpcClick(npcId,'click')`；B3 上屏后改真点击。
⑥ **本仓 CDATA 解析 bug（已修，人类 2026-10-19 手测发现）**：对话正文与选项文字起初全显 `[object Object]` —— 根因 = L1 `entity.js` 的 `textOf()` 把本代 `fast-xml-parser` 的 CDATA 当成裸串，实际存成**文本节点数组** `#cdata:[{#text:"…"}]`（`String(数组)` ⇒ `[object Object]`）；`parse-map.js` 早有 `cdataOf` 正确展平，唯 `entity.js` 漏了 ⇒ 修 `textOf` 展平 `#cdata` 数组（抽每项 `#text` 再拼）。仅影响 CDATA 包裹的 `content`/`<description>`，`<param>`/`<action>` 等纯文本不受。

**请人测（MB6）**：见 §8.5。要点：`onNpcClick(1001701,'click')` 出对话、中文**不出方框**（`MP4`）；翻页无栈、点背景不自动关（`DLQ4`）；`10003`/`10017` 扭蛋**一个按钮两条出路**、道具=0 按钮仍显；可见性（全不可能 ⇒ 不出现，**唯一行为改动**、最需人眼）；`10693` `{expr:}` 4 个数字与背包一致、同次打开不抖；悬空引用（`-404` `not_enough` / `50019` `mission_6_dream_11`）⇒ **不关 + 日志 `missingBranch`**。

**增补（人类 2026-10-19 选 A）· NPC 可点占位标记**（把上面 ⑤ 的"只能敲控制台"扩成"能鼠标点"）：
- **改 L4 `mapScene.js`**：`M` 加 `npcMarkers: []`；`draw()` 内**仅 `M.jsMode` 分支**遍历 `M.npcs`，用 `JS_VIEW.unityToStage(npc.pos.x, npc.pos.y, M.jsView.rect)`（**与光口同一张矩形/同一函数**）把 Unity `pos` 投到舞台，画**最小占位标记**（圆点 + 名字），并把 `{id,name,x,y}` 存进 `M.npcMarkers`（畸形/缺 `pos` ⇒ 跳过）；`jsClick(ev)` **先按 `M.npcMarkers` ~16px 命中 ⇒ `onNpcClick(id,'click')` 并 `return`**（不进走位），未命中再走原光口逻辑；`registerAndRunAuto()` 后若 `M.jsMode` 补一次 `draw()`（bg 未到也先显标记）。
- **边界**：① **只 `swfOk===false` 的 JS 图**（相机恒 `0,0`、矩形已知）——**SWF 图逐字节不变、不叠加标记**，仍用控制台 `onNpcClick`；② 标记 = **占位图形、非正式美术**，NPC 美术映射 + 真上屏通道仍归 **B3**（`AGENTS §4` 第 13 条）；③ "不画实体正式 sprite"围栏不变。
- **请人测更新**：JS 图（例 `10017`/`10012`…/`10003`/`10693`/`50004`/`-2`/`1081`…/`-404`/`50019`）里 NPC 现以**可点标记**出现在地图上 ⇒ **鼠标点标记**即走对话/战斗（无需控制台）；SWF 图（例 `2`/`540`/`121`/`131`）仍标 `⚠` 且**只能用 `onNpcClick`**。

---

#### 7.3.10 MB7 as-built（2026-10-19）—— 地图战斗触发（`battle-spec.ts` + `keys-battle.ts` + 桥 `battles[]` + 战后链）

**改点**：
- **改 L1 `game/logic/map/parse-map.js`（`MDB6-a`）**：`buildNpc` 把 `<battle>` → **结构化 `rec.battles[]`**（`battleBranchOf`：`{id, settings(18 列宽松缺省 `settingsOf`), player|null, enemy[](`bossOf`、**不裁 `count`** `BTI2`), winHandler[], loseHandler[]}`；`content` 列**不建** = 双重死列）+ 解析期登记 `battleBranchDup`（同 NPC 重号，实测 0）/ `battleBranchNoEnemy`（`BTC5`）。
- **扩 `tools/map-audit.mjs`（跨图战斗审计）**：`battle-branch-unreferenced`（只读登记 = **154**）· `battle-action-dangling`（★报警 = **8** 条 `hell`，`BTC8`/`BTQ2`）· 分支总 **680** / 动作总 **543**。旧数字**逐字不变**（`swfOk=false 102 / portal-inbound-none 95 / portal-isolated 54 / invalid-switch 1(71) / npc=604 / teleport=393`）。
- **新建 L0 `game/core/map/battle-spec.ts`（`MDB6-b/c`）**：`buildSpec(npc, branchId, mapId)` → `BattleSpec|null`（同 NPC 内解引用 `BTI3`）· `canStartBattle(spec, probe)` 开工三门（① 空敌⇒`hint` 不静默 `BTC8` / ② 首发可用查**上场对象** `BTC4` / ③ settings 准入、无 `debugMode` 旁路）· `seed==null` ⇒ 内核不碰时钟 `BTI5`。
- **新建 L0 `game/core/map/keys-battle.ts`（`MDB6-e`）**：`battle.` 键表（settings 14 + result 8 + `capturePet.` 透传）+ 两哨兵（`mode` `-1`→`2`、`captureLevel` `!capture`→`-1`）· `makeBattleView(snapshot)` → `env.battleState` · **统一 BTC11**：无快照 ⇒ 一切键 `FLOAT_MIN`（无 NRE 面）。
- **改 L4 `game/app/session.js`**：新增 `battleOrigin`（`{mapId,npcId,branchId}` 一次性）+ `lastBattle`（只读窗口，保到下次开工 `BTI10`）字段；`reset()` 一并清。
- **改 L4 `game/app/scenes/rbattleScene.js`（`MDB6-d`）**：`settleAndExit` 里 `save()` 之后、回图之前把 `driver.outcome()` + `driver.state.settings` 摘要写进 `session.lastBattle`（含 `capturePet`，未捕⇒null）；**只加"回图前落一笔"、不碰内核算法**。
- **改 L4 `game/app/scenes/mapScene.js`**：`makeRunCtx().sinks.battle` → `startMapBattle`（`buildSpec`+三门 ⇒ `openHintbox` 或写 `battleOrigin` + 复用 `#/rbattle` **单敌遭遇**用 `spec.enemy[0]`）；`buildMapEnv` 恒注入 `battleState = makeBattleView(session.lastBattle)`；`registerAndRunAuto` 末尾 `runPostBattleChain`（同图判定 `BTQ1` ⇒ `isMyWin→winHandler` / `isOpWin→loseHandler` / 其余登记 `result-state-unhandled` `BTC3`，用完清 `battleOrigin`，走**同一台** `resolve→run`）。

**偏差 / 限制（与 §3.7 蓝图逐条对照）**：
① **复用 `#/rbattle` 单敌遭遇**（决策二）—— 今天 `#/rbattle` 只吃 `{client, level}`；本批把 `spec.enemy[0]` 当遭遇敌打出去。**多宠带 `<settings>` 的正式 `BattleSpec` 消费 + 板凳敌方宠（`-1`/`403` 的 7/9 只）交 E6**（`BTC6`/`BTQ3`），**不伪造、不记死账**。
② **`GateProbe` 恒 `'unknown'` ⇒ 门②③放行** —— 宠血量/Mod 标/星级 = **D6** 结账；今天接不上 ⇒ 只有门①（配方存在）可观测。接 D6 后自动生效。
③ **`battle.turn` / `battle.me.*` / `battle.op.*` 恒 `FLOAT_MIN`** —— 这些要**活战斗态**（归 **E1/E5**），`lastBattle` 快照只有 `settings`+`result` 半 ⇒ 速通/暴击/伤害挑战那批 winHandler 条件当前恒不满足（如实登记，不瞎猜）。
④ **`settings.limit` 表达式过滤不接**（= `Parser.ParseConditionFilter` = M3 算子，随 D6/E6）。
⑤ **`@time`/倒计时/`Timeout` 不接**（`BTQ4`：`time` 列照录不消费）。
⑥ **战后链沿用现遭遇时钟机制**（`BTI5`）—— 本批不新增 `R2` 时钟；`simulate` 遭遇靠现机制不落盘（人测项 12）。

**请人测（MB7）**：见 §8.6。要点：`test` 三只（`onNpcClick(201/-201/54001,'click')`，battleId 约定 `mapId*100±1`）能开战/回图；战后 `setItem` 进包 + 提示；`OpEscape` 逃-win 也跑 winHandler（`BTI8`）；`121`/`131` 硬胜 vs 逃-win 分叉（`battle.result.state=1` 只前者给奖）；`50004` 油民 `12106` 战斗外读捕获（`capturePet.id` `BTI9`）；`-2`/`-201` `simulate` 血不扣经验不给不落盘；`hell` 悬空 8 处**不作手测**（看 §8.1 两数 8/154）。

---

#### 7.3.11 MB9 as-built（2026-10-19）—— 野怪漫游（`logic/map/wander.js` L1 + L4 接线）

> ⚠️ **关键事实（本批探索发现）**：重启数据里 **野怪 = 一只带 `<wild><movement mode="wander">` + `<battle>` 的 `<npc>`**（实测 `<wild>` 110 条 / 53 图，其中 `wander 107 / stationary 3`）。B3 的 `#npc` 画环**本就按 `active` 过滤、不按 `wild`** ⇒ 这些野怪**早就上屏、点了就开战**（走 `battle` sink → `startMapBattle` → `#/rbattle` 单敌遭遇）。⇒ **本批缺的只是"让它在 `radius` 内溜达"**，非"让它显示"。

**改点**：
- **新建 L1 `game/logic/map/wander.js`（`MDB7-e`）**：`seedWander(npc, rand)`（只对 `wild.movement.mode==='wander'` 且 `pos` 合法者建初态 `{home,pos,target,phase:'idle',timer,bobPhase,face,bubble}`，其余 ⇒ `null` 照旧静态）+ `stepWander(state, movement, dtSec, rand, talk)`（**纯步进**：`idle` 段按 `idle="min,max"` 秒停 → 到点选新 `target`（方向随机、距离 = `step="min,max"` px、钳在 `home` 半径 `radius` 内）→ `move` 段按 `speed` px/s 直线挪 → 到位回 `idle`）。⚠️ **无碰撞、无寻路、不吃 `nav.ts`/`geometry.ts`**（D5 / 人类"哪里都能走"）；**卡住/步进按真实 `deltaTime`**（`MWI6`，**不累加 `moveTick` 假时间**）；`snap`/`moveTick` **忽略**（连续 dt，非网格 tick）。随机 / 时钟**由 L4 注入**（决议 ① R1/R2，本件不自带 `Math.random`/`Date.now`）。**★talk 气泡调度（尾步，本批已落文本半）**：`state.bubble={text,timer,next}`，`idle` 段每 `interval="min,max"` 秒到点 ⇒ 按 `chance` 摇一次 ⇒ 命中则从 `talk.self` 的 `{text}` 里随机挑一条挂 `bubble.text`、显示 `duration` 秒（跨相位淡出）；`{image}`（`emoji/toon/*`）**盘上无素材** ⇒ 只挑文本、图像气泡跳过（见偏差 ④）。⚠️ **本段口径已被 `MDB10` 取代（2026-10-21）**：气泡调度**整体迁出本件** = `logic/map/talk.js`（`state.bubble` 字段与 `stepWander` 的 `talk` 形参已删），`self` 的**图与文进同一个池子均匀随机**、**JS/SWF 两条渲染路都出** ⇒ as-built **§7.3.32** / 手测 **§8.26**（本条 = MB9 当时的 as-built，按纪律保留原样）。
- **改 L4 `game/app/scenes/mapScene.js`（接线）**：① `registerAndRunAuto` 内**仅 `M.jsMode`**（SWF 路不播态）给每只 wild 跑 `seedWander` 挂到 `e._wander` —— ⚠️ **该闸已由 `MDB11` 解除 = 两条路都播**（D-13，见 **§7.3.33**）；② `draw()` 的 NPC 投位改 `const p = n._wander?.pos ?? n.pos` ⇒ 野怪跟随实时位、点击命中面（`M.npcHit` 每帧重算）自动跟；③ **独立 rAF** `startWanderLoop`/`stepWanderLoop`（仿 `stepJs` 的 `dt`/`rafHandle` 口径，但用 `wanderRaf`/`wanderLastTs`，与走位循环互不干扰）：每帧对全部 `_wander` 跑 `stepWander(dtSec, Math.random, talk)` → `draw()`，全空 ⇒ 停（不空跑），`dt` 夹 ≤100ms（防切后台瞬移）；④ `leaveJsMode` 里 `cancelAnimationFrame(wanderRaf)`（换图/卸载/退 JS 路即停）；⑤ `drawNpcs()` 给 `M.npcHit` 里带 `bubble.text` 者**在名字之上画一个最小自绘文本气泡**（圆角框 + 下指小尖 + 白字，超 30 字截断；`none`/无气泡不画）。

**边界 / 偏差（如实登记）**：
① **只 JS 路**（`swfOk===false`）—— SWF 路野怪照 `MapRunner.as` 自己那套（`mapWildFight`），**不叠游荡、不碰 `MapRunner.as`**。
   ⚠️ **本条已被 `MDB11` 取代（2026-10-21，人类点名 ③「两条路都走」）**：SWF 路的 `M.jsMode` 闸**已解除** ⇒ 野怪在**两条渲染路**都由 JS 播态游荡；AS3 那套（`mapWildFight`/`WildPet`）**同日断粮退役**（`wild: ''`）⇒ as-built **§7.3.33**。本条 = MB9 当时的 as-built，按纪律保留原样。
② **无碰撞 ⇒ 野怪可能穿墙/遮挡**（人类 2026-10-18 已定 = 不修，`AGENTS §4.7/§4.15`）；**请人眼确认观感**（§8.8 第 4 条）。
③ **`active===false` 的野怪仍不画不漫游**（现有过滤，如 `10017` 的闪光格林/格林）；`mode!=='wander'`（`stationary` 3 条）不飘。
④ **talk 气泡 = 文本已做、图像未做** —— `<wild><talk>` 的 `self` = **image 2,682 / text 838**（`§7.3.1` 订正数）；**盘上 `Resources/emoji/toon` 为空**（图像气泡无素材）【**2026-10-21 更正：此判据错 = 看错了树** —— 素材真在盘且已入库：`Assets/StaticResources/Sprites/Map/talk bubble/emoji/toon/` **24 png**（正本 = `docs/map/map-move.md:319/:324`；详见 `map-actor-look §5.7 ④` 与 as-built **§7.3.30**）⇒ 缺口性质 = **运行时未接线**、不是缺素材】⇒ **图像气泡不做**（如实登记，非漏做）；**文本气泡 = 本批尾步已落**（`stepWander` 调度 `chance/interval/duration` + L4 `drawNpcs` 画头顶圆角框）。⚠️ **口径 = 只挑 `{text}` 条目**（`self` 里 image 项跳过 ⇒ 一只野怪若 `self` 全是 image，则不出气泡）。**✅ 该格已由后批 `MDB10` 结账（2026-10-21）**：读取路接上（`npc-art.talkImageUrl` + L4 `drawNpcImageBubble`）、调度迁到 `logic/map/talk.js`、**图与文同池均匀** ⇒ as-built **§7.3.32** / 手测 **§8.26**。
⑤ `bob`（待机上下浮）在 `stepWander` 里累加 `bobPhase`，但**画环暂未消费**（cosmetic，静帧锚点仍取 `pos`）；留后续美术批。

**判据 / 请人测（MB9）**：见 §8.8。要点 = 进 `10017`（JS 图）⇒ 赤甲虫 Lv26/27 **在自家附近溜达、会停、不飘出画面**（`radius=220`/`speed≈34`）；**鼠标点飘着的野怪**照样进 `#/rbattle`（单敌）；`active=false` 的格林**仍不出现**。

---

#### 7.3.12 A2+B as-built（2026-10-19）—— 对话说话人头像 + 前缀表补全 & 写回

**A2 · 对话说话人头像**：
- **改 L1 `dialog-host.js` `openDialog`**：返回的 `branch` 里补 `icon: picked.icon`（`{resId,size,pos,tint}`；此前被丢掉 ⇒ 浮层没头像）。
- **加 L1 `npc-art.js` `iconUrl(raw)`**：复用 L0 `parseAssetRef`（`MDI4` 一份分类、两处不漂移）⇒ `path` 形（如 `Pets/pet/407`）补 `.png`、`npcId` 形 ⇒ `Npc/<id>.png`、`none/builtin/mod/expr/空` ⇒ `null`。
- **改 L4 `mapScene.js` `renderDialogBox`**：`head` 改 flex 行、名字前插一个 ~48px `<img>`（`iconUrl(branch.icon.resId)`），`onerror` ⇒ **直接摘掉、不伪造占位**（缺图只显名字，与 B3 占位同口径）。`tint`/`pos` 本批不接（人眼校项，留后续）。

**B · 前缀表补全 + 写回（人类 2026-10-19 拍板：`setActivity` + `setItem` 都接，动作 `[expr]` 一起）**：
- **B1 env 变活（`mapScene.js buildMapEnv`）**：补传 `items:{count}`（现算 `A.state.items`，yite 袋 ⇒ `'unknown'`，缺 A ⇒ `'unknown'`）+ `activities:{get}`（读 `session.data.activityStorage` 的 `{id,data:[{key,value}]}` 平键）⇒ 羽毛 `{expr:item[..].num}`、条件 A8/A5 **当场从 stub 变真值**。⚠️ **`petBag`（`firstPet.`/`petBag.`）本批仍走兜底**：宠标识符键集归 **D6**、未就绪 ⇒ **不传 ⇒ `[UNIMPLEMENTED_PET]` ⇒ 一切键 `'unknown'`**（如实登记、不瞎猜）。
- **B2 共享前缀表（`core/map/condition.ts` 新导出 `readMapValue(key, env) → number|null`）**：**复用现 `armOf` 前缀分派 + 各臂左侧读值切片**（口径逐字对齐 `eval*`，`CSI3` 不写第四份文法）⇒ 供对话 `{expr:}` 与动作 `[expr]` 共用。`random/npc.color/petBag/mission/yiteRogue/date/plantAnimal` ⇒ `null`；`map/item/activity/player/battle/data/firstPet` ⇒ 数值或 `null`。**`dialog-host.makeExprResolver` 改为委托 `readMapValue`**（+ 裸数字字面量兜底）。⚠️ **未剥离 `eval*` 的 LHS**（代价过大）⇒ 采取 plan 许可的**"共享一张表在 `condition.ts`、切片口径对齐"**退路，留此痕。
- **B3 写回 sink（`mapScene.js makeRunCtx().sinks` 加两把）**：`setItem`（`add`/`add_with_hint`⇒`A.addItem`；`remove`⇒`A.consumeItem`，不足**不扣成负**；`add_to_yite`/`remove_from_yite`⇒**登记不接**）+ `setActivity`（逐 entry：值 `[expr]` 开头 ⇒ `readMapValue(剥前缀, M.env)`，`null` ⇒ 跳过 + 登记；写进 `session.data.activityStorage`，**值强制 `String`**（否则 `schema` walk 拒 `SAVE_INVALID`））。落盘仍由 runner **收口一次**（`MNI8`：`A.save()`→`mergeBack` 自动把 `state.items` 折进 `itemStorage`、`activityStorage` 原样序列化）。
- **B4 解 L0 早退（`core/map/action.ts parseSetActivity`）**：删掉对 `[expr]` 值的整条 `unimpl` ⇒ **原样保留 `key=value`（含 `[expr]` 串）**交 sink 在写回期求值（解析期无 env）。`openHintbox`/`callback` 的 `[expr]`（实测 0 命中）**本批仍不动**（仍登记）。

**门禁**：`node tools/map-audit.mjs` 旧数字**逐字不变**（`npc=604 / resId path=346·npcId=306·none=20 / battle 680·543·8·154 / wild 110·53`）；改 `.ts` 已 `node tools/build-core.mjs` 重生成 `condition.js`/`action.js`。

**请人测（A2+B）**：见 §8 末（本批合并清单）。

---

> ⚠️ **swf 优先 as-built 追认（2026-10-20 · 反向推翻本节 2026-10-19「分流反转」）**：① 新增单一真值 CSV game/data/map_swf.csv（272 图：170 有 swf / 102 无；列 = map_id,name,png_seq,swf_seq，swf_seq 存盘上真实存在的 swf 文件名，png_seq = resId??id）；② content.js 加 mapSwfIdOf(id) + parseMapSwfMap + boot 取 CSV，loadMap 以 CSV 覆盖 rec.swf/rec.swfOk（CSV 未加载才退回原 pickSwf 动态探测）；③ mapScene.js renderMap 分流由「看 SWF_ANNOTATED_IDS 名单」改为「看 u.swfOk」（名单退役）；④ 选项 C：loadMapRunner 的 ruffle().load 失败或 25s mapReady 超时 ⇒ 自动 enterJsMode(mid, M.unity) 退回 Unity PNG，不黑屏。待人类手测 Flash/AS3 通路回归。
#### 7.3.13 分流反转 as-built（2026-10-19）—— **背景素材默认加载 Unity 目录 PNG，"注明采用 swf"才走 SWF**

**人类点名**："更改地图房间场景的背景素材的加载机制，默认加载 Unity 目录中 png，除非注明采用 swf。"（围栏扩展 = `AGENTS §4` 第 16 条；正本 = `docs/map/map-code-map.md §2.4` "分流反转"块）

- **改 L4 `mapScene.js`（唯一落点）**：`renderMap` 分流从「`swfOk===false` ⇒ JS / 否则 ⇒ SWF」**反转**为「**默认 ⇒ `enterJsMode`（JS 路 · 背景 = `Resources/Maps/bg/{resId??id}.png`，实测 272/272 覆盖）**；仅 `SWF_ANNOTATED_IDS.has(mid)` 的图 ⇒ `enterSwfMode`」。
- **注明机制 = `SWF_ANNOTATED_IDS`（`mapScene.js` 模块内 `Set`，图 id 字符串）**：进名单 = 注明采用 swf；**当前名单为空 ⇒ 全部图默认 PNG 路**。注明了但盘上无可玩 SWF（`swfOk===false`）⇒ **退回 JS 路 + `logLine` 一行**，不黑屏。
- **逐字节不动的部分**：`enterSwfMode`/`worldLoad`/`loadMapRunner`/`MapRunner.as`/Ruffle 通路**零改动**，只是不再默认进入；JS 路（`enterJsMode` 及其 bg/角色/光口/NPC/漫游/对话）逻辑**零改动**，只是覆盖面从 102 张扩到全部 272 张。
- **连带注释同步**（不改语义）：`mapScene.js` 的 A2 节区头 / `enterJsMode` docstring / `M.jsMode` 行 / `JS_VIEW` import 行，`wander.js` 头行「只 JS 路（`swfOk===false` 图）」⇒「默认通路」。
- **已知代价（如实登记，不修）**：未注明的图不再有 SWF 动态场景/多层遮罩/网格走位/HUD-in-SWF —— 观感从 `MapRunner` 版降级为 PNG 静帧版；这是人类点名的默认，需要原画面的图**逐个进 `SWF_ANNOTATED_IDS` 注明**。
- **门禁**：`node --input-type=module --check`（`mapScene.js`/`wander.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；无新脚本（决议 ⑦）。

**请人测（分流反转）**：见 **§8.9**。

#### 7.3.14 MB10 as-built（2026-10-19）—— **记录最后所在的房间**：战后回原房间 + 原位置，不再落回出生点

**人类点名（2026-10-19）**：*"实现记录最后所在的房间的功能，退出战斗后会重新加载最后所在的房间，而不是在出生点。"*
（并点名落点 = **房间 + 原位置**，不是只回房间）

**修的是什么（两个 bug 叠在一起）**：

| # | 症状 | 根因 | 修法 |
|---|---|---|---|
| ① | 点 NPC 开战后，回图总落在 **`70`「传送室」** | `session.currentMapId`（上游 `Player.cs:23` 的同名字段）**建了但从来没有写入过** ⇒ 恒为初值 `70`；`startMapBattle` 的 `back` / `battleOrigin.mapId` 都读它 | `renderMap` 取到该图 Unity 记录后才换（照搬 `NormalLoadingScreen.cs:41`「成功则 `lastMapId`←当前、`currentMapId`←新；失败则换图中止」）⇒ **唯一写者 = `renderMap`** |
| ② | 就算 ① 修好，回图仍落在 **`1`「监狱」**（进游戏的第一张图） | 回图路由 `#/map?map=X` 只认「**在下拉里且 `swfOk!==false`**」的图；分流反转（§7.3.13）后默认走 JS 路，那批图既不在下拉里、又带 `swfOk===false` ⇒ `map=` 被丢掉，落回下拉首项 | 回图入口**优先 `renderMap(map=)`**，不再看下拉/下拉是否可选；取不到记录才退回下拉当前项（`renderMap` 改为返回布尔）|

- **改 L4 `game/app/session.js`**：① `currentMapId`/`lastMapId` 补口径注释（**唯一写者 = 地图场景 `renderMap`**、场景态**不入档**）；② **新增 `lastPos = {mapId,x,y}`**（开工那一刻的房间 + 舞台坐标），`reset()` 一并清。
- **改 L4 `game/app/scenes/mapScene.js`**：① `renderMap` 写 `session.currentMapId`（异图时旧号挪进 `lastMapId`）+ **返回布尔**；② `mount` 的进图入口 = `map=` 优先（不再要求「下拉里可选」），失败才退回下拉当前项；③ **新增 `rememberRoom()`**，`startMapBattle`（NPC 战）与 `startWildFight`（点野怪）切战斗场景前各调一笔。
- **改 L4 `game/app/scenes/rbattleScene.js`**：`exitToMap` 在 `retParams.map` 与 `session.lastPos.mapId` 对得上时补 `spawn=x,y` ⇒ 复用地图侧**既有的一次性落点口**（`parseSpawnParam` / `consumeSpawn`，TPQ5），**两条渲染通路都生效**（JS 路 `enterJsMode`、SWF 路 `worldLoad`/`loadMapRunner`）。
- **没动的**：传送落点规则仍是 **`spawn ?? 目标图 init`**（`map-teleport.md §3.3` / `TPI2`）—— 光口传送**不传 `spawn`**，仍站出生点，只有**战后回图**多带一笔坐标；`MapRunner.as` / AS3 线 / 存档格式零改动（**房间号不入档**，同上游 `Player` 单例）。
- **门禁**：`node --check`（三份 `.js` 以 `.mjs` 副本验）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；无新脚本（决议 ⑦）。

**请人测（记录最后所在的房间）**：见 **§8.10**。

#### 7.3.15 MDB8-a as-built（2026-10-20）—— **装备/坐骑的数据桥 + L1 纯计划**（本批不改画面）

**人类点名（2026-10-20）**：*"那按你说的，等M8落码再一次性组迁吧，现在开工吧"* ⇒ 按 `§3.10` 批序从 **`MDB8-a`** 起落，第一批只到"控制台能打印 3 组外观计划"。

- **新建 L1 `game/logic/map/actor-look.js`**（纯函数：无 DOM / 无 fetch / 不 import `app/**`，`M-5` 同口径）：
  - 常量：`SLOT`（11 槽）· `MIRROR_TO`（`10→2 / 9→6 / 11→3`）· `PART_OF_SLOT`（反向表）· `MOUNT_HIDDEN_SLOTS=[2,6,9,10]` · `MOUNT_OFFSET_Y=-50` · `MOUNT_SPEED_FACTOR=25/20` · `DOWN_ORDER` / `UP_ORDER`（11 槽深度序）· `DEFAULT_COLORS`（12 色）· `DEFAULT_HEAD_REF=100001` / `DEFAULT_EYE_REF=100003`。
  - API（与 `§3.10.2` 签名一致）：`colorIndexOf` · `resourceIdOf(suitId,slot)`（`"1"+pad3+pad2`，**6 位**）· `packSuffixOf({slot,isAccessory})`（槽 2/6/3 主件 `_0`、镜像 `_1`）· `defaultRefsOf(color)`（5 条：头/眼/手/身/脚；蓝/红的手/身/脚 `source:'naked'`、其余颜色 `source:'equip'`）· `mergeDefaultEquip(color,equipVec,itemIndex)`（按槽去重、自定义优先、坏 ID/9/10/11 槽登记后跳过）· `mountEquipIdOf(ridingPetInfo,rideTable)`（先 `resourceId`、再 `petRideChipId`，不二次反查）· `slotOrder(direction)` · `nakedFallbackOf` / `defaultFallbackOf` / `layersOfRef` · `buildLookPlan(opts)`。
  - `LookPlan` = `{signature, direction, color, layers[], hiddenSlots, mount, offsetY, speedFactor, warnings}`；层已按 `DOWN_ORDER` 自底向上排好，手/脚自动展开主件 + 镜像层。
  - **兜底口径（本批实装）**：自定义件缺包 ⇒ 退**同色默认**（腰带/翅膀/坐骑跳过）；同色默认本身是 equip 包（非蓝/红）⇒ 再退**蓝/红裸装包**；坐骑缺包 ⇒ 不进入骑乘态（`M8-I2`）。默认件的 fallback 直接是裸装，避免"默认件退到自己"的死循环。
- **新建 `tools/build-equip-index.mjs` → `game/data/equip-index.json`**（102.2 KB；`note` 内注明"由工具生成、勿手改"）：
  - 源 = `game/data/items.json`（`referenceId`）+ `PetRideShopConfig__setting.xml`；`items` **1,864** 条 `{name,slot,suit}`。
  - 槽分布：`1:347 · 2:391 · 3:96 · 4:13 · 5:305 · 6:317 · 7:245 · 8:21 · 9:129`；无 `suitid` **129** 条（全 slot 9）。
  - 骑乘表：源 XML **48** 行 / 去重 **29** 个装备；`byPetResourceId=31`、`byChipBackId=29`；特殊映射 `900017→101131`、`900018→101125` 已核。
  - ⚠️ **如实登记一处源数据差**：源 XML `<Item>` **9,630 行**、唯一 ID **9,629**（重复 ID `300607`）⇒ `items.json` 的 9,629 是去重后的真值，计划里的 `equip=1864` 不受影响。
- **新建 `tools/build-actor-assets.mjs` → `game/data/actor/equip/manifest.json`**：读改服缓存 `~/.cache/seer2-live/game-cache/index.json`（可 `--cache=`），只扫 `res/item/equip/swf/<6位>(_0|_1)?.swf`；产出 `packs=12 / files=18`（`100001`、`100008`、`100102`、`100104`、`100106`、`101506`、`120301`、`120302`、`120305`、`120306`、`120307`、`120403`）与 `missing=108`（29 张坐骑 × `_0/_1` = 58 + 10 种非蓝/红默认装 ×（手 2 + 身 1 + 脚 2）= 50）；本机样本文件不入库（`.gitignore` 挡 `game/data/actor/equip/*.bin|*.swf`，**只提交 manifest**）。
- **改 L4 `game/app/content.js`**：新增懒加载 `loadEquipIndex()` / `loadActorManifest()`（各 fetch 一次、失败 `console.warn` 并退回 `null` / 空 manifest，不抛）。
- **改 `tools/serve.mjs`**：新增 `--cache=<dir>`（缺省 `~/.cache/seer2-live/game-cache`）与 **`/game-cache/<rel>` 只读路由**；禁 `..` 逃逸、不列目录、缺件 404；静态侧抽 `sendFile` 复用。冒烟：已缓存包 `120301.swf` → 200、未缓存 `136403_0.swf` → 404、逃逸路径 → 403。
- **改 L4 `game/app/scenes/mapScene.js`**：`installActorLookDebug()` 在 `mount` 时装 `APP.actorLook.dump()`（`unmount` 时 `delete`）；`dump()` 并行取 `equip-index` + `manifest`，打印 3 组计划 —— ① 裸装（蓝）② `equipVec=[100577]`（头，资源 `120301`）③ `mountEquipId=101020`（坐骑，资源 `136403`），并逐层标注 `ok / missing`；**只读、无副作用、不改画面**。换装/骑乘入口留到 `MDB8-c`。
- **文档修正**：`docs/map/map-actor-look.md` 与 `docs/map/map-design.md` 中资源标识"7 位"的笔误改为 **6 位**（`1+3+2=6`）。
- **门禁**：`node --input-type=module --check`（`actor-look.js` / `content.js` / `mapScene.js` / 两个构建工具 / `serve.mjs`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；**未新写测试/探针脚本**（决议 ⑦）。
- **已知未做（下一批才做）**：画面不变（`drawActor` / `actor-view.js` 未动）、无会话态、无换装/骑乘入口、不写盘、未碰 `game/maprunner/**`；SWF 叠层 = `MDB8-f`、存档 `<equip>` = `MDB8-g`。

**人类手测（2026-10-20，✅ 通过）**：人类在浏览器执行 `await APP.actorLook.dump()`，三组计划与 §8.11 期望逐项一致 —— ① 裸装 7 层、签名 `down|0|100001,100003,100004,100005,100006|0`；② 头装 `100577/120301` 原位替换；③ 坐骑 `101020/136403`、`offsetY=-50`、`hiddenSlots=[2,6,9,10]`、`speedFactor=1.25`，两个坐骑包 `missing` 为预期；尾部日志正常。人类结论：**“目前一切正常”** ⇒ `M8-a` 验收通过。

**请人测（M8-a 数据桥）**：见 **§8.11**。

---

#### 7.3.16 地图黑边 bug 修复 as-built（2026-10-20）—— **SWF 图一边露黑边的根因 = 相机多扣了 size_mc 的摆放位**（对齐上游 LayerManager；非缩放、非后端）

**背景**：§4.16（人类 2026-10-20 选 C）把分流翻回「有 swf 映射走 Flash/AS3（enterSwfMode 进 mapRunner.swf）」后，约 170 张图重走 MapRunner.as 通路，暴露出「部分图渲染后一边露黑边」。黄金之路（map 360 → swf/map/10036.swf）最典型：canvas 后端右边一条黑、webgl 后端左边缺一块 —— **左右随后端不同，实为同一个 bug 的两种露法**。人类手测确认上游原版无此黑边 ⇒ 是我们移植版与上游的**相机分歧**，不是素材问题、也不是后端问题。

**病根（MapRunner.as 的 onMap + placeActor）**：

| # | 现象 | 根因 | 证据 |
|---|---|---|---|
| ① | 黄金之路左/右露边（后端不同露边不同） | onMap 取 mapX = sizeMc.x / mapY = sizeMc.y，而 size_mc 只是个**尺寸标记**，它的 .x/.y 是它自己被 PlaceObject **摆放的位置**（黄金之路 size_mc 摆在 (119,51)，真实地面 ground_mc 却在 (0,-20)、尺寸 1200×700）；随后 placeActor 的相机算式 world.x = (sw-mapW)/2 - mapX = 0 - 119 = **-119** 把整张图**左移 119px** ⇒ 左边 119px 被挪出屏（裁掉）、右边空 119px（canvas 露黑 / webgl 露缺） | MapAssetExtractor.as:90-95（_x=_size.x）+ LayerManager.as:173-198；10036.swf 拆包实测 size_mc place=(119,51)、ground_mc drawnBounds=(0,-20,1200×700)、content_mc 并集被装饰物（funnyFlower/teapot/funnyPet）畸形巨 shape 污染到约 34000×24855（故 world.getBounds 不可信） |

**上游口径（照它改才对）**：LayerManager.as:173-198 的相机**从不扣 mapModel.x/y** —— 内容不超过舞台 ⇒ _loc4_/_loc5_ = 0（mapLayer.x/y = 0，内容按原位铺）；只有宽/高溢出舞台才 clamp(actor - stage/2, 0, size - stage) 跟随角色滚动。我们的移植版多扣了 mapX/mapY 才歪。

**修法（改 game/maprunner/MapRunner.as + 重编译 mapRunner.swf）**：
1. onMap：**位置改用内容包围盒**（mapX/mapY = ground.getBounds(world).x/y，真实内容位）；size_mc **只贡献宽高**（mapW/mapH = sizeMc.getBounds 的 width/height，沿用上游 _size 尺寸口径），**不再取它的 .x/.y 当位置**。
2. placeActor：相机对齐上游 —— 内容不超过舞台 ⇒ world.x/y = 0（原位铺，不扣 mapX/mapY）；宽/高溢出舞台才走原滚动 clamp(...)。world.scaleX/Y = 1（**不缩放**）。
3. 加一行诊断日志 mapExtent content=x,y 宽x高。
4. **未采纳 / 回退**：曾试「按 world.getBounds 等比放大铺满」—— content_mc 装饰物巨 shape 污染 getBounds、且上游本就不缩放，弃；也**回退**了误判的「地图默认 webgl 后端」（黑边是相机 bug、与后端无关，改回 canvas；URL 仍可 ?renderer=webgl/wgpu 试后端）。

**门禁**：tools/build-maprunner.sh（mxmlc + playerglobal 11.1）重编译通过；node --check（mapScene.js）通过。**本修动了 §4.11/§4.14「不碰 MapRunner.as / SWF 路逐字节不变」围栏** —— 属「对齐上游相机」的授权例外（AGENTS.md §4.16 已追认）。

**请人测**：见 **§8.12**。

---

#### 7.3.17 MDB8-b as-built（2026-10-20）—— **JS 路 11 槽渲染**（按 `LookPlan` 装包 + 合成；裸装逐像素回归）

**前置**：`MDB8-a` 手测通过（人类 2026-10-20：“目前一切正常”）⇒ 按 `§3.10.3` 落本批。

- **改 L4 `game/app/scenes/mapScene.js`（主改动）**：
  - 运行时状态换成外观计划：`LOOK`（`{plan, sourcePlan, resolved[], shadow, body, ready, signature}`）· `LOOK_PARTS`（`assetKey` = `source:pack:suffix` → 位图/包元数据）· `LOOK_LOADING`（并发去重）· `LOOK_OVERRIDE`（本批手测钩子）· `lookGen`（竞态守卫）· `LOOK_LOGGED`（缺包日志去重）。旧 `ACTOR_CACHE` / `actorGen` / `loadActorParts` 删除。
  - `syncLook()`：取 `equip-index` + `manifest` → `ACTOR_LOOK.buildLookPlan` → `loadLookParts` → `pruneLookParts` → `draw()`。计划签名未变且已就绪 ⇒ 直接复用（换图回图不重装）。输入 = `LOOK_OVERRIDE` 或 `avSel` 颜色（`MDB8-c` 起叠加会话态）。
  - `loadLookParts(plan, manifest, gen)`：每层按 **主件 → `fallback` → 再下一级** 逐级尝试；阴影 `UI_ActorShadow` 单独装（不在计划里）；`BODY` 缺 ⇒ `ready=false`（调用侧留黄点）。所有包走 `parsePack` + `createImageBitmap`，逐件失败不抛。
  - `assetUrlOf`：`source='naked'` ⇒ `/game/data/actor/<pack>.bin`；`source='equip'` ⇒ `manifest.packs[pack].files[suffix].cachePath` → `/game-cache/<cachePath>`（缺项抛 → 交给 fallback）。
  - `drawActor`：读 `LOOK.plan` 的 11 槽层序；**所有层共用 BODY 的 `standFrame` 帧号**（`ALQ7=A`；⚠️ **b2 起改为每层 `cycleFrame` 的 `run/stand × Up/Down` 循环帧——同 tick、各自标签区间——+ 4 向 + 整体镜像，见 §7.3.18；b2 第二轮再改为装备层站立取 `labelStartFrame`、阴影取 `localShadowFrame`**）；先阴影（**不吃 `offsetY`** —— 坐骑抬起、影子留地面），再自底向上逐层 9 参 `drawImage`；跳过 `hiddenSlots` 与 `w<=1||h<=1` 隐藏裁帧；`ACTOR_SCALE=1`、`flip=1` 不变。
  - **`M8-I2` 提前守住**：坐骑 `_0` 包未就绪 ⇒ 生效计划改为 `offsetY=0 / hiddenSlots=[] / mount=null / speedFactor=1` + 一行日志，**不出现“角色抬起但坐骑空白”**；`_1` 缺 ⇒ 只画 `_0`。
  - `leaveJsMode` 改为 `lookGen++`（作废在飞装载）；`draw()` 的 JS 分支由 `ACTOR_CACHE.parts.BODY` 改为 `LOOK.ready`（SWF 分支仍逐字节不变 = 黄点）。
  - **调试入口**：`APP.actorLook.preview({color, equipVec, mountEquipId})` / `clear()`（本批手测钩子，不写盘、不改会话态；`MDB8-c` 起由 `equip/unequip/ride/unride` 取代，保留为直通）；window 导出改为 `syncLook / drawActor / getLook`。
- **改 L1 `game/logic/map/actor-view.js`**：删除旧的 7 槽 `PART_SLOTS` / `ACTOR_PACKS` / `DOWN_ORDER` / `UP_ORDER`（已被 `actor-look.js` 的 11 槽表取代），本件**只留解析**（`parsePack` / `pickFrame` / `frameRect` / `standFrame` / `SHADOW_FRAME`；⚠️ `SHADOW_FRAME` 于 `MDB8-b2` 第二轮被 `localShadowFrame` 取代，另新增 `labelStartFrame`/`cycleFrame`/`labelOf`/`stepDirection`，见 §7.3.18）。
- **裸装回归**：蓝/红裸装的计划层序 = `HAND_R → FOOT_R → FOOT_L → BODY → EYE → HEAD → HAND_L`（与原 `DOWN_ORDER` 逐项相同）+ 同一阴影，`offsetY=0` ⇒ 应与 `MDB8-a` 前的画面**逐像素一致**。
- **素材实测（本机缓存）**：`120301`（头）· `120302_0/_1`（手）· `120305`（腰带）· `120306_0/_1`（脚）· `120307`（翅）· `120403_0/_1`（坐骑 `100582`）均可 `parsePack`；`120403_1` 在站立帧（25）是 1×1 隐藏帧 ⇒ 按数据跳过（如实登记）。坐骑 `101020` 的 `136403_0/_1` 仍缺 ⇒ 本批按 `M8-I2` 不进入骑乘态。
- **门禁**：`node --input-type=module --check`（`mapScene.js` / `actor-view.js` / `actor-look.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；**未新写测试/探针脚本**（决议 ⑦）。
- **已知未做（下一批才做）**：无会话态（`equipVec/mountEquipId/color` 字段 = `MDB8-c`）、无正式换装/骑乘入口（现为 `preview` 手测钩子）、不写盘（`MDB8-g`）、SWF 路不叠层（`MDB8-f`）、速度 `speedFactor` 未接（`MDB8-d`）、浮动坐骑 tween 未做（`MDB8-d`）；10 种非蓝/红默认装缺包 ⇒ 退蓝/红裸装（`MDB8-e` 补素材）。

**请人测（M8-b JS 路 11 槽）**：见 **§8.13**。

---

#### 7.3.18 MDB8-b2 as-built（2026-10-20）—— **帧动画 + 4 向**（站立循环 / `run` 走位 / 左右翻转 / 朝上层序；含同日两轮手测修补）

**前置**：`MDB8-b` 手测时人类看到静态站立图、点名要动画 ⇒ `ALQ7` 由 A 改 B（`map-actor-look.md §10`）⇒ 插入本批（设计/impl 计划 = `§3.10.3b`）。

- **改 L1 `game/logic/map/actor-view.js`（只加纯函数，仍无 DOM / 无 fetch / 不 import app）**：
  - `cycleFrame(pack, label, tick)`：`start + (tick % span)`（`span = end-start+1`）；标签缺失/越界 ⇒ `standFrame(pack)` 兜底，不抛。
  - `labelOf(moving, up)`：`(moving?'run':'stand') + (up?'Up':'Down')`，与 `MoveStyle.getStyleByDirection` 同构（无左右包）。
  - `stepDirection(dx, dy)`：`{right: dx>=0, up: dy<0}` —— 纯水平段 `dy=0 ⇒ Down`、纯垂直段 `dx=0 ⇒ right=true`（同 `PathMobile.updateDirection`）；停止时不调用、保留最后朝向。
  - `labelStartFrame(pack, label)`（第二轮修补新增）：标签首帧；缺标签 ⇒ `standFrame` 兜底 —— 装备层站立静姿（ALC13）。
  - `localShadowFrame(shadowPack)`（第二轮修补新增）：取 `UI_ActorShadow` 的 `local` 帧（=1）；缺标签 ⇒ 1 —— 本机玩家阴影（ALC14）。
  - 头注补血统（`FramePlayer.as` + `PathMobile/Mobile/MoveStyle`）；`parsePack/pickFrame/frameRect/standFrame` 未动；
    `SHADOW_FRAME`（按 BODY 帧取模）**已删除**（与 `ActorShadow.updateLabel` 的 local/remote/vip 二选一不符）。
- **改 L4 `game/app/scenes/mapScene.js`**：
  - 状态：`ANIM_FRAME_MS = 1000/24`；`ACTOR_ANIM = {right:true, up:false, moving:false}`（初态 = 朝下朝右，与 b 批首帧一致）；`animRaf/animLastTs/animElapsed/animTick/animLabel`（独立于 `rafHandle`/`wanderRaf`）。
  - `startActorAnim()` / `stopActorAnim()` / `stepActorAnim(ts)`：累加 `dt`（首帧按一帧、单次封顶 **100ms** 防后台回来跳帧），`tick=floor(elapsed/ANIM_FRAME_MS)`，**仅 tick 变化时 `draw()`**；循环只在 `M.jsMode && LOOK.ready` 时续转。
  - `syncLook()` 两个成功分支（签名命中缓存 / 装载完成）⇒ `startActorAnim() + draw()`；`leaveJsMode()` ⇒ `stopActorAnim()` + 复位 `ACTOR_ANIM` 与 `animLabel/elapsed/tick`。
  - `drawActor(ctx,x,y)`：`label = labelOf(moving, up)`；**切标签 ⇒ 相位归零、从新标签 `start` 起播**（`gotoLabel` 语义）；**每层各自** `cycleFrame(该层 pack, label, tick)`（同一 tick；修 `ALC3` 的 ±1 错帧、又保留各包自己的标签区间）；**装备层站立改取 `labelStartFrame`**（`layer.freezeStand`；ALC13），坐骑/裸装仍循环；层序 = `ACTOR_LOOK.slotOrder(up?'up':'down')`（`UP_ORDER`/`DOWN_ORDER`）；左右翻转 = `ctx.scale(flip*ACTOR_SCALE, ACTOR_SCALE)` **整体镜像**（阴影/部件/坐骑同翻）；阴影仍最底、帧号 `localShadowFrame(sh.pack)`（= `local` 帧 1；ALC14）、**不吃 `offsetY`**；跳过 `hiddenSlots` 与 1×1 裁帧。
  - `stepJs`：移动分支先 `stepDirection(dx,dy)` 置 `right/up/moving=true` 再挪位 + `draw()`；到位分支 `moving=false` 后 `draw()` ⇒ 停步保留最后朝向（`PathMobile.stand`）；`JS_SPEED` 未动（坐骑加速仍 `MDB8-d`）。
  - `draw()` 的 JS 分支改为 `drawActor(octx, cam+pos)`（去掉旧的 flip 实参，朝向由 `ACTOR_ANIM` 决定）；SWF 分支逐字节不变。
- **实测标签差异（本机缓存，一次性 Node 校验）**：裸装 `UI_BLUE_BODY` standDown **25–65**；装备件 `120301`（头）/`120302_0`（右手）/`120305`（腰带）/`120306_0`（右靴）/`120307`（翅膀）standDown **25–97**；坐骑 `120403_0` standDown **25–60**；run 全部 **1–12/13–24**。**各层按自己的标签区间循环** + `pickFrame` 的 `key<=f` 取最近一条（本层区间内）。
  裸装 idle 的可见动效 = **`UI_DEFAULT_EYE` 在 43/45/47/49 眨眼一次**（41 帧一圈 ≈ 1.7s），身体/头/手/脚在 standDown 只有 key 25 一张静态图 —— 这是**素材原样**，不是丢帧。
  ⚠️ **`120302_1`（射手弓左手）的 standDown 25–97 不是 idle**：实测 info 52 条，key 25（idle 举弓，`si=12`）→ 30–43（拉弦/蓄力）→
  44–59（大特效，最大 141×150）→ 69–72（箭迹，最大 **480×150**）→ 73–86（收势）→ 87 回到 `si=12` → 97 端；
  即整段「举弓→拉弦→射箭→回位」。照循环播会站立无限射箭 ⇒ 装备层站立只取 `labelStartFrame`（ALC13）。
  `cycleFrame` 抽查：裸装 tick 0/40/41 ⇒ 25/65/25；`labelOf(false,false)=standDown`、`labelOf(true,true)=runUp`；`stepDirection(3,-2)={right:true,up:true}`、`(0,3)={right:true,up:false}`、`(-1,0)={right:false,up:false}`。
- **手测反馈修补（2026-10-20 同日，人类报 2 项）**：
  1. **idle 有停顿** —— 根因 = b2 首版让所有层共用 BODY 帧号：装备件 `120301`（头）的 standDown 是 25–97（73 tick），
     而坐骑 `120403_0` 的 idle 只有 25–60（36 tick）；共用帧号 ⇒ 坐骑动画播完后**冻结 37 tick ≈ 1.5s** 才回卷。
     上游 `MultipleEquipPlayer.update:193-199` 的 `gotoAndPlay(body.currentFrameIndex)` 实为空操作（`ALC3`）⇒ 实际是**各层各自循环**。
     修法 = `drawActor` 改为**每层取自己的 `cycleFrame(asset.pack, label, animTick)`**（同一 tick、切标签同时回各自 start）。
  2. **朝左未翻转** —— 根因 = **Chromium 的 `drawImage` 不会因负目标宽而镜像**：`drawImage(img, dx, dy, -w, h)`
     会把负宽归一成「从 `dx-w` 起的正向矩形」照原样画（一次性 headless 对照：负宽输出 `[红,透明]`、`scale(-1,1)` 输出 `[透明,红]`），
     即 b2 首版只镜像了**位置**、没镜像**像素**，所以坐骑/部件看起来仍朝右。修法 = **外层 `ctx.scale(flip*ACTOR_SCALE, ACTOR_SCALE)` 整体镜像**
     （`flip = ACTOR_ANIM.right ? 1 : -1`，层内用正宽 + `rec.ox - anchorX`）；这才是 AS3 `bitmap.scaleX = flip` 的本义。
     阴影 / 11 槽 / 坐骑必然同向；`stepJs` 的方向位逻辑不变。
- **手测反馈修补 · 第二轮（2026-10-20 同日，人类报 2 项）**：
  3. **光轮旋转中闪烁出阴影** —— 根因 = 阴影帧号 = `((BODY帧-1) % UI_ActorShadow.totalFrames)+1`，而该包
     **39 帧里只有 1–2 是阴影、3–39 是 vip“光轮”**（`local=1 / remote=2 / vip=3–39`）⇒ 每圈都在「光轮 ↔ 阴影」之间切换；
     骑坐骑把脚下露出来时最明显。上游 `ActorShadow.updateLabel` 是**按身份二选一**（vip 循环光轮 / remote 停 2 / 本机停 1），
     **不是**按 BODY 帧取模。修法 = 新增 `localShadowFrame(pack)` 恒取 `local` 帧（=1），删掉 `SHADOW_FRAME`（ALC14）。
     vip 光轮 = `b3` 的手动可选分支（见 §7.3.19）；按身份自动二选一仍留待接用户信息。
  4. **穿套装站立无限射箭** —— 根因 = 射手弓 `120302_1` 的 `standDown` 25–97 实测是「举弓→拉弦→射箭→回位」整段动作，
     按上游 `gotoLabel('standDown')` 循环就会一直射。设计目标 = **站立的默认动作应是 idle，射箭应由动作系统显式触发**（人类口径）。
     修法 = `buildLookPlan` 给每层加 `freezeStand`（装备层 true、裸装/坐骑 false）；
     `drawActor` 在 `!moving && layer.freezeStand` 时取 `labelStartFrame`（标签首帧，`120302_1` = 25 举弓待机），跑动仍整段循环（ALC13）。
- **门禁**：`node --input-type=module --check`（`mapScene.js` / `actor-view.js` / `actor-look.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；**未新写测试/探针脚本**（决议 ⑦）。
- **已知边界（如实登记，不阻塞）**：① SWF 路仍逐字节不变（叠层 = `MDB8-f`）；② 静置也按 24fps 重绘整张 JS 图（背景/NPC 一起），CPU 上升为预期；③ 坐骑浮动 tween ±5 / `speedFactor` 仍归 `MDB8-d`；④ 10 种非蓝/红默认装仍缺包 ⇒ 退蓝/红裸装（`MDB8-e`）；⑤ `preview/clear` 钩子与 `MDB8-b` 相同，动画自动播放；⑥ **裸装 idle 只有眨眼**（素材原样），看起来「大半时间不动」属预期，**坐骑 idle 连续**；⑦ **装备层站立为静姿**（ALC13）；⑧ **默认阴影恒 `local` 帧**（ALC14），vip 光轮改由 `b3` 手动切换（需用户信息的自动分支仍未接）。

**请人测（M8-b2 帧动画 + 4 向）**：见 **§8.14**。

#### 7.3.19 MDB8-b3 as-built（2026-10-20）—— **地面特效切换：阴影 ↔ 光轮**（人类点名「想要光轮」）

- **需求**：第二轮修补后本机恒画 `local` 静止阴影；人类问「想要光轮怎么办」⇒ 增加**手动切换**，
  光轮按自己的 idle 循环、角色按自己的 idle 循环 ⇒ 两态互斥、无「交替闪」的间断感（`ALQ9`）。
- **改 L1 `game/logic/map/actor-view.js`**：
  - 新增 `vipShadowFrame(shadowPack, tick)`：取 `UI_ActorShadow` 的 `vip` 标签（实测 3–39）做 `start + tick % span`；
    缺标签/越界 ⇒ `localShadowFrame`。不复用 `cycleFrame`（该包没有 `standDown`，兜底会落到无意义帧）。
  - 头注函数清单补 `vipShadowFrame`。
- **改 L4 `game/app/scenes/mapScene.js`**：
  - `GROUND_MODE = 'shadow' | 'halo'`（默认 `shadow`）；`groundElapsed` 累计毫秒，**只随常驻 rAF 前进**，
    不随 `animElapsed` 在 stand/run 切换时归零 ⇒ 光轮连续转，角色切动作不会把光轮打回第一帧。
  - `stepActorAnim` 每帧 `groundElapsed += dt`；`drawActor` 画地面特效前按 `GROUND_MODE` 选帧：
    `localShadowFrame(pack)`（1，静止）或 `vipShadowFrame(pack, floor(groundElapsed / (1000/24)))`（3–39 循环）。
  - 手测钩子 `APP.actorLook.ground('halo'|'shadow')`（也接受 `vip`/`光轮`）；`clear()` = 回裸装 + 阴影；
    `unmount` 复位 `GROUND_MODE='shadow'` / `groundElapsed=0`。
- **边界**：① 光轮与阴影**互斥**（同一帧只画一个）；② SWF 路本批仍不叠层（f 起才叠，见 §7.3.23；本批边界）；
  ③ 不写盘、不改会话态（正式入口/会话态归 `MDB8-c`；按 VIP 身份自动二选一留后续）；
  ④ 地面特效仍不吃 `offsetY`（骑乘抬起角色、特效留地面）；⑤ 穿射手套装时弓的青色弧光会盖住小阴影
  （角色层在特效之上），不是阴影丢失；光轮较大，通常能从弧光边缘看到。
- **门禁**：`node --input-type=module --check`（`mapScene.js` / `actor-view.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；
  **未新写测试/探针脚本**（决议 ⑦）；`vipShadowFrame` 抽查 `tick 0/1/2/35/36/37/38/39 ⇒ 3/4/5/38/39/3/4/5`。

**请人测（M8-b3 光轮 / 阴影切换）**：见 **§8.14 第 15–16 条**。

#### 7.3.20 MDB8-c as-built（2026-10-20）—— **会话态 + 正式调试入口**

- **需求**：`b`/`b2`/`b3` 的手测钩子（`preview/clear`）只改临时变量；本批把外观状态收进会话，
  给出正式 `equip/unequip/ride/unride/color`，供后续 `d`/`f`/`g` 共用。**本批仍不写盘**。
- **改 `game/app/session.js`**：
  - `session` 加 `equipVec: []`（自定义物品 ID；默认装不混入）、`mountEquipId: 0`、`ridingPetInfo: null`、
    `actorColor: null`、`actorSex: 0`、`groundMode: 'shadow'`。
  - `adopt({data})`：读 `data.equip`（`items` 过滤为正整数、`mountEquipId` 缺省归 0；`MDB8-g` 前真实档无该块 ⇒ 恒缺省）；
    `actorSex` 从 `data.gender` 派生；每次交档把 `actorColor` 复位为 `null`（重新跟随 `#avSel`）、`groundMode` 复位 `shadow`。
  - `reset()` 同步清回默认。
- **改 `game/app/scenes/mapScene.js`**：
  - `syncLook()` 输入改为 **`LOOK_OVERRIDE`（调试直通）> 会话态**：
    `color = override.color ?? session.actorColor ?? currentActorColor()`、`equipVec = override.equipVec ?? session.equipVec`、
    `mountEquipId = override.mountEquipId ?? session.mountEquipId`；签名未变仍复用（换图不重装）。
  - `GROUND_MODE` 模块变量删除 ⇒ `drawActor` 直接读 `session.groundMode`；`groundElapsed`（光轮相位）仍为场景局部量，
    `unmount` 只复位相位、**模式跨图保持**。
  - 调试 API 扩为 `dump/ground/equip/unequip/ride/unride/color/preview/clear`：
    - `equip(refId)`：查 `equip-index.items`，允许槽 `1/2/4/5/6/7/8`；slot 3 提示用 `ride()`、9+ 提示 NONO 不支持、
      查无此物品/非法 ID 均只打一行日志；同槽替换**保留原位置**（ALI5）。
    - `unequip(refId)`：不在 `equipVec` ⇒ 日志 no-op；否则移除后 `syncLook()`（默认装由 L1 `mergeDefaultEquip` 补）。
    - `ride(equipId)`：校验 `slot===3`；成功写 `mountEquipId`、清 `ridingPetInfo`。`unride()` ⇒ `mountEquipId=0`。
    - `color(n)`：`0..11` / `BLUE`/`RED` 经 L1 `colorIndexOf` 校验；`null` ⇒ 回跟随 `#avSel`。
    - `dump()`：在既有 ①②③ 前增打「⓪ 当前会话」。
    - `preview/clear` 保留：`preview` 仍是**不改会话态**的整组直通；`clear` = 撤直通 + **清空会话外观**
      （裸装 + 阴影 + 颜色回跟随 `#avSel`，保持 b3 手测口径）。
  - 所有入口**不写盘**；SWF 图入口在 c 批只改会话态并提示「本批不叠层」（f 起有自定义外观即叠层，见 §7.3.23）。
- **边界（如实登记）**：
  ① 本批**不写盘**：刷新/关浏览器回裸装 + 阴影（`MDB8-g` 接 `<equip>`）；
  ② SWF 路在 c 批仍不叠层（f 起有自定义外观即叠，见 §7.3.23）：`equip/ride` 在 SWF 图只更新会话态，当时回 JS 图生效；
  ③ 正式装备/骑乘面板归 C1/C2，本批只有控制台入口（M8 §8.6 / 围栏 §3.10.10）；
  ④ `actorSex` 只存不用（ALC6）；`ridingPetInfo` 留位，第一版只认 `mountEquipId`；
  ⑤ 10 色默认装仍缺包 ⇒ 退蓝/红裸装（`MDB8-e`）。
- **门禁**：`node --input-type=module --check`（`session.js` / `mapScene.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；
  **未新写测试/探针脚本**（决议 ⑦）。

**请人测（M8-c 会话态 + 调试入口）**：见 **§8.15**。

#### 7.3.21 MDB8-d as-built（2026-10-20）—— **坐骑视觉：速度 25/20 + 13 只浮动坐骑**（✅ 手测通过同日「it worked good」）

- **需求**：`b` 已画坐骑静态抬升（`offsetY=-50`）与藏手脚；本批补 M8 §6.6 的另两个可观察量：
  **骑乘加速**（`DOGZ_RUN_SPEED 25` vs `NOMARL_RUN_SPEED 20`）与 **浮动坐骑**（`_floatList` 13 只的上下 tween）。
  `M8-I5` 原写“浮动不塞进 d”，但 design §11 第 8 条与状态台账都把浮动列为 d 的验收项 ⇒ 本批落，`M8-I5` 同步改口径。
- **改 L1 `game/logic/map/actor-look.js`**：
  - 新增 `FLOAT_MOUNT_IDS`（13 个，`Actor.as:215` 原表）；
  - `buildLookPlan` 的 `mount` 增 `float: boolean`（按装备 ID 命中，不是资源标识）；**签名不变**（已含 `mountRef`）。
- **改 L4 `game/app/scenes/mapScene.js`**：
  - **速度**：`stepJs` 的 `stepAmt = JS_SPEED * speedFactor * dt`；`speedFactor` 取 `LOOK.plan`（**有效计划**）——
    M8-I2 坐骑缺包降级时 `effectivePlan.speedFactor=1` ⇒ 不会出现“没坐骑却加速”。只影响 JS 自由走；NPC 漫游/SWF 走位不变。
  - **浮动**：`mountVisualOffset(now)` 统一算坐骑垂直偏移 —— 非坐骑 `0`；非浮动坐骑 `-50`；
    浮动坐骑 `-50 + 5·sin(2π·t/3000)`（`MOUNT_FLOAT_AMP/PERIOD_MS`）。`drawActor` 的 `offsetY` 改读它
    （地面特效仍不吃 `offsetY`，阴影/光轮留地面）。
  - **升起**：`ride()` 在 `syncLook()` 前用 `pendingMountRise` 记下当前抬升量（无坐骑 = 0）；
    新计划装上后若为浮动坐骑 ⇒ `mountMotion.riseMs=2000`，`mountVisualOffset` 用 Back.easeIn 从起点升到 -50，再进入浮动。
    换图/读档/`preview`（`pendingMountRise=null`）不发升起，直接以 -50 为相位起点浮动（`Actor.addDogz(false)` 的初始化语义）。
  - **运动时钟**：`mountMotion = {key(refId:resourceId), startTs, fromY, riseMs}`，按**坐骑键**懒建/重建 ——
    换装/换色不改键 ⇒ 不打断浮动相位；换坐骑才重建。`unride()`/`clear()` 置空（瞬时归零，同 `Actor.removeDogz`）；
    `unmount()` 复位（场景局部量）。
  - `dump()` 摘要行追加 `float=Y/N/-`，便于对数。
- **近似口径（如实登记）**：上游是 TweenMax 两段 1.5s（默认 easeOut）在 `-45 ↔ -55` 间往返，起点 `-50`；
  我们用 3s 正弦（同 ±5、同周期、无端点速度突变）近似，视觉 = 持续平滑上下。升起 = 2s Back.easeIn 同款公式（`s=1.70158`）。
- **门禁**：`node --input-type=module --check`（`actor-look.js` / `mapScene.js`）通过；本批**不发 `.ts`** ⇒ 无需 `build-core`；
  **未新写测试/探针脚本**（决议 ⑦）。
- **边界（如实登记）**：
  ① 本机缓存只有 `120403`（`100582`，浮动）这一个坐骑包 ⇒ 固定坐骑“直接偏移”只能等 `e` 补素材后验；
  ② SWF 路在 d 批仍不叠层（f 起叠层，见 §7.3.23）；速度只作用于 JS 自由走（SWF 走位仍由 MapRunner 驱动）；
  ③ 浮动相位随 `performance.now()`（换图不重置）；刷新/重载档坐骑按初始化路径直接浮动、无升起（预期）；
  ④ 10 色默认装仍缺包（`MDB8-e`）。

**请人测（M8-d 坐骑速度 + 浮动）**：见 **§8.16**。

#### 7.3.22 MDB8-e as-built（2026-10-20）—— **素材清单增强 + 缺包日志归并**（代码半边；素材半边 = 后续 `MDB8-e2` 定向拉取已结账，见 §7.3.28）

- **需求**：`e` = 素材补齐 + 清单。清单/日志半边本批落码；**素材补齐 = 定向拉取（`tools/fetch-actor-packs.mjs`，人类 2026-10-20 拍板 B，M8 §5.5 通道一）**或真人用启动器进游戏触发缓存
  （`tools/seer2-live/README.md §5`：缓存只记录客户端**实际请求过**的资源；定向拉取 = 把文件按采集单点名补进同一缓存、登记同一 `index.json`）。
- **改 `tools/build-actor-assets.mjs`**：
  - 每个缓存文件记录除 `cachePath`/`size` 外，新增 `url` / `cachedAt`，以及逐包 `parsePack` 的清单字段
    `frameW/frameH/totalFrames/unitW/unitH/infoCount/sheetW/sheetH/labels`；坏包记 `parseError`、不中断（只作清单字段，不是断言）。
  - 控制台逐文件打印 `包名+后缀 / 字节数 / 帧元数据 / 来源 URL`；仍**不下载、不拷贝、不做网络请求**。
- **重生成 `game/data/actor/equip/manifest.json`**（2026-10-20 缓存快照）：`packs=12 / files=18 / expected=108 / missing=108`；
  已缓存 18 包全部 `parsePack` 通过（无 `parseError`）。缺件构成 = 29 张骑乘 ×2（58）+ 10 色默认手/身/脚（50），
  与 `map-actor-look.md §5.4/§5.6` 一致；**已缓存包不误报为 missing**。
- **改 L4 `game/app/scenes/mapScene.js`（缺口提示）**：缺包日志从“每层一行”归并为**每个计划签名一行**：
  `外观缺包（signature）: PART pack+suffix[(fallback)], …（每签名一行；有 fallback 的已用 fallback 绘制）`；
  `logLookOnce` 按签名去重（换装反复触发不刷屏）。`resolveLookLayer` 不再自行打日志；`loadLookParts` 汇总 `missingMain`。
  M8-I2 坐骑降级那行（`坐骑包未就绪…`）保持不变，仍按签名一次。
- **12 色选择器（`M8-I6`）**：本批**不扩** —— `#avSel` 仍只蓝/红；L1 已支持 12 色，等 10 色默认包采齐再扩（`color(n)` 现在可用，缺包退蓝/红 + 日志）。
- **边界（如实登记）**：
  ① 素材采集必须真人进游戏（启动器），**本机当前只有 18 个装备包**；未采集的坐骑仍按 M8-I2 降级、未采集颜色仍退蓝/红裸装；
  ② `manifest.json` 是生成物（勿手改），包体**不入库**（`ALQ5=A`），只登记 URL/大小/帧表元数据；
  ③ 清单快照随缓存增长而变 —— 采集后再跑一次工具即可对账，不需要改代码。
- **门禁**：`node --input-type=module --check`（`mapScene.js`）与 `node --check tools/build-actor-assets.mjs` 通过；
  **未新写测试/探针脚本**（决议 ⑦）。
- **停点 → ✅ 已结账**：§8.17（清单与缓存对账 + 缺包日志 + 采集后回归）手测通过（人类 2026-10-21「全部测试通过」= 一揽子通过，未逐条拆分回报）；**素材采集未完成前不阻塞 `f`/`g`**（渲染已有降级链）。

**请人测（M8-e 素材清单 + 缺包日志）**：见 **§8.17** —— ✅ 已通过（人类 2026-10-21「全部测试通过」）。

#### 7.3.23 MDB8-f as-built（2026-10-20）—— **SWF 路叠整只 canvas 角色（`ALQ2=B`）**（代码已落；停点 `§8.18` **已随 ★M9-c 退役 ⇒ 不再可测**，等价判据 = `§8.23` ✅）

- **需求**：`swfOk===true` 的图（Ruffle/AS3 画面）在有装备/坐骑时也要看见外观；**无装备时仍是今天的黄点基线**；
  **不碰 `game/maprunner/**`、不重编译 AS3、不新增消息**。
- **L4 `game/app/scenes/mapScene.js`**：
  - `hasCustomLook()` = 会话态 `equipVec.length > 0 || mountEquipId !== 0`（`LOOK_OVERRIDE` 调试直通优先；裸装/12 色默认**不算**）；
  - `canDrawActor()` = `LOOK.ready` 且（JS 路 **或** SWF 路“有自定义外观 + `LOOK.missingCustom` 为空”）；
  - `loadLookParts(plan, manifest, gen, customRefs)` 新增 `missingCustom`：只统计**自定义件/坐骑**（`source==='equip'` 且 refId ∈ `customRefs`）的**主件**缺失；
    默认色/裸装的 fallback 不算缺。任一自定义包缺 ⇒ SWF 不叠、黄点 + 一行 `SWF 叠层暂缺自定义包，保留黄点: …`；
  - `draw()` 的 `M.pos` 分支：`canDrawActor()` ⇒ `drawActor(octx, cam+pos, LOOK_SCALE, LOOK_DY)`，否则黄点（逐字节不变）；`drawActor` 新增可选 `scale/dy` 参数（JS 路默认 `ACTOR_SCALE`/0）；
  - `enterSwfMode` 落模式后：有自定义外观 ⇒ `await syncLook()`（无自定义不装包）；选项 C 兜底进 JS 路时再调命中签名复用、幂等；
  - 帧动画循环门禁由 `M.jsMode` 放宽到 `canDrawActor()` ⇒ SWF 叠层也按 24fps；
  - `mapState` 吃 `moving`（AS3 `MapRunner.as:610` 已带）+ 4Hz 位移推断朝向；`mapArrive` 停 `moving`；
  - `mapWalk` 的 x/y 是**目标点**（`MapRunner.as:532`）⇒ 叠层激活时**不写 `M.pos`**（避免整只角色先闪到终点）；不叠层时保留旧行为；
  - 调试日志 `swfNote()` 改为如实反映：`叠层已开` / `缺自定义包 ⇒ 仍黄点` / `无自定义外观 ⇒ 仍黄点`。
- **对齐常量**：`LOOK_SCALE = 1`、`LOOK_DY = 0`（与 `ACTOR_SCALE` 分开；人眼发现脚底偏移只调这两个）。
- **已知缺陷（如实登记）**：
  ① **双角色/露边** —— 底层 SWF 裸装角色仍在走/动 ⇒ **已由 `MDB8-f2` 修复（同日，见 §7.3.25）**；
  ② **前景遮挡穿帮** —— `front_mc` 盖不住 `#ov`(z-index 2)，与 B3 SWF 路 NPC 同族；
  ③ **位置约 4Hz** —— 快速走动可能跳格/拖影（帧动画已由 `MDB8-b2` 解决）⇒ **已由 f2 同日修补 ①「叠层位置平滑跟随」抹平（见 §7.3.25；该手测面 `§8.20` 已随 ★M9-c 退役、不可测 ⇒ 等价判据 = `§8.23` ✅）**；
  ④ **朝向** = 位移推断首版（拐角/小步可能滞后）；
  ⑤ **非蓝/红颜色单独切换**（无装备/坐骑）在 SWF 路仍不叠层（`hasCustomLook` 本批口径只认装备/坐骑）。
- **门禁**：`node --input-type=module --check`（`mapScene.js`）与 scoped `git diff --check` 通过；**未新写测试/探针脚本**（决议 ⑦）。
- **停点**：§8.18（SWF 图穿装备/骑 `100582` 可见 + 位置跟走位；无装备基线不变；`101020` 缺包 ⇒ 黄点降级；人眼校三件事）⇒ **已随 ★M9-c 退役、不再可测**（旧链代码仅存 git 历史），puppet 路等价判据并入 `§8.23` **✅ 已通过（2026-10-20「整体结账」）**。

**请人测（M8-f SWF 路叠层）**：见 **§8.18** ⇒ ⚠️ 该面已随 ★M9-c 退役、**不再可测**（等价判据 = `§8.23` ✅）

#### 7.3.24 MDB8-g as-built（2026-10-20）—— **外观持久化：根级 `<equip>`（`ALQ1=A`）**（代码已落；§8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」））

- **需求**：`equip/unequip/ride/unride` 的结果跨“关浏览器重进同槽”保持；写入我方扩展块 `<equip>`
  （真值 = `docs/save/save-xml-spec.md §2.22`），不污染 `activityStorage`；旧档（无该块）照常进游戏；round-trip 不丢块。
- **L1 `game/logic/save/codec.js`**：
  - `TYPES.root` **末尾**追加 `{ n:'equip', o:'EquipLook', omitNull:true }`（根级最后一块，顺序不可乱）；
  - 新增 `TYPES.EquipLook = [{ n:'items', p:'int' }, { n:'mountEquipId', v:'int' }]`
    ⇒ 写 `<equip><items><int>…</int></items><mountEquipId>…</mountEquipId></equip>`；空 items 写 `<items />`；
  - 读侧沿用 `omitNull` 分支：旧档缺整块 ⇒ `data.equip = null`；`readObject('EquipLook', …)` 对缺项宽容（`items=[]`、`mountEquipId=0`）。
- **L1 `game/logic/save/schema.js`**：`fresh()` 增 `equip: null`；`validate()` 增形状体检 —— `null` 合法，
  否则必须是对象、`items` 为整数数组、`mountEquipId` 为整数（坏形状由 repository 拒写，不静默）。
- **L2 `game/app/session.js`**：`mergeBack()` 末尾按会话态写回：
  `data.equip = (equipVec.length || mountEquipId) ? { items: equipVec.slice(), mountEquipId } : null`
  ⇒ **空外观 = `null` ⇒ writer 整段省略**（旧档 round-trip 不会凭空多出 `<equip>`）。
  读侧 `adopt()` 自 `MDB8-c` 起已灌 `session.equipVec/mountEquipId`；`repository.load(login:true)` / `finishNewGame` 不动该字段。
- **L4 `game/app/scenes/mapScene.js`**：`installActorLookDebug()` 新增 `persistLook()`（named import `save as saveSession`）；
  `equip/unequip/ride/unride` 在 `syncLook()` 之后调用 ⇒ 变更即落盘（唯一写盘口 = repository）。
  失败只 `console.error` + 一行 `外观落盘失败`，**不回滚会话态**；未登录/无会话时 `session.save()` 自行空转。
  `clear/preview/color/ground` **不写盘**；`color`/`groundMode`/`actorSex` 本批不入档（`<equip>` 只存物品 ID + 坐骑 ID）。
- **兼容口径（如实登记）**：
  ① 上游不认 `<equip>`（读档忽略、重写会丢块）⇒ **复刻档不得喂回官方服**；
  ② 块里只存物品 ID，槽位由物品表反推；骑乘只需 `mountEquipId`（`0` = 未骑乘）；
  ③ 本批 `equip` 是调试入口，**不校验背包是否真有该物品**（正式装备面板/背包装备页归 C1/C2，届时补校验）；
  ④ `clear()` 只清会话态，若之后有任意一笔存档（战斗/商店…）则按空外观写 `null`；不做“撤销到上次存档”的逻辑。
- **门禁**：`node --input-type=module --check`（`codec.js` / `schema.js` / `session.js` / `mapScene.js`）与 scoped `git diff --check` 通过；
  **未新写测试/探针脚本**（决议 ⑦）。
- **停点 → ✅ 已结账**：§8.19（关浏览器重进同槽外观保持；XML 有 `<equip>` 且旧档不凭空多块；导出→导入不丢块；旧档正常进游戏）手测通过（人类 2026-10-21「全部测试通过」= 一揽子通过，未逐条拆分回报）。

**请人测（M8-g 存档接线）**：见 **§8.19** —— ✅ 已通过（人类 2026-10-21「全部测试通过」）。

#### 7.3.25 MDB8-f2 as-built（2026-10-20）—— **SWF 裸装角色显隐：修「双角色」（人类手测 f 后点名「修」）**（代码已落；停点 `§8.20` **已随 ★M9-c 退役 ⇒ 不再可测**，等价判据 = `§8.23` ✅）

- **触发**：f 的手测 = SWF 图上**两只角色**（`MapRunner` 的裸装 `ActorView` + `#ov` 的 canvas 角色，动画相位/尺寸不齐露边）。
  这正是 M8 §8.4「选项 C 留待再议」的触发点 ⇒ 人类拍板修；围栏 = `AGENTS §4.17②` 追加条款（授权例外之二，与 §4.16④ 相机修复并列）。
- **AS3 `game/maprunner/MapRunner.as`**（最小面）：
  - 构造器注册 `ExternalInterface.addCallback("actorVisible", jsActorVisible)`；
  - `private function jsActorVisible(v:Boolean):void { if (actor != null) actor.visible = v; }`
    —— **只拨显示开关**：走位/相机/光口/NPC/野怪/HUD 代码路径逐字节不变；
  - `tools/build-maprunner.sh` 重编译 ⇒ `mapRunner.swf` 29175 字节（解包确认 `actorVisible` 字符串已进产物）。
- **L4 `game/app/scenes/mapScene.js`**：
  - 新增模块态 `swfActorHidden`（`null` = 未同步；`loadMapRunner` 重建播放器与 `unmount` 时归零）；
  - `syncSwfActorVisibility(hide)`：`M.jsMode`/无 `M.player` ⇒ 不动；同值不重复下发；调用失败**不缓存**（下次 `draw` 重试）+ 只日志一行（`swfActorWarned` 去重）；
  - `draw()` 的 `M.pos` 分支**与叠层同帧结算**：`syncSwfActorVisibility(drewActor)` ——
    canvas 角色真正画出 ⇒ 隐藏底层 ActorView；画黄点（无外观/缺包/计划未就绪）⇒ 恢复可见（**SWF 基线不变**）。
- **行为口径（如实登记）**：
  ① 换图（`loadWorld`）时 `onMap` 把 actor 摘下再挂回，**`visible` 跟着对象走** ⇒ 隐藏态跨图保持，不需要重发；
  ② JS 路不受影响（本来只有一只角色）；
  ③ 进图首帧到首次 `mapState`（约 ≤6 帧）之间底层角色短暂可见 —— 叠层本身也要等 `mapState` 才有位置，同帧出现、同帧隐藏，无空窗；
  ④ 修复对象 = **本机玩家角色**的重影；**前景遮挡穿帮 / 朝向滞后 / 仅换色不叠层** 仍是 §7.3.23 登记的未修项
    （**4Hz 跳格已由同日修补 ① 平滑抹平**，见下）。
- **同日手测修补 ①（人类 2026-10-20 反馈：「看不到底层角色了，但移动时会一抖一抖，JS 图没有」）= 叠层位置平滑跟随**：
  - 根因 = `mapState` 每 6 帧才回报一次（24fps÷6 = ≈4Hz），叠层按 24fps 逐帧画 ⇒ 坐标每 ~250ms 跳一步 = 抖动；
    JS 路 `stepJs` 每帧自算位置、逐帧连续 ⇒ 无此现象（= §7.3.23 登记的「位置约 4Hz」人眼校项被实测触发）；
  - `mapScene.js` 新增 `swfFollowPoint()` = **指数平滑跟随**（τ≈55ms；匀速走时滞后恒定几像素、肉眼不显），
    **吸附**条件 = 首帧（`init`）、大跳 >80px（传送/换图）、到站（`mapArrive` 置 `swfFollowSnap`）；
  - 只吃在 **SWF 叠层分支**：黄点基线与 JS 路仍用原始 `M.pos`，一字不变；`swfFollow` 缓存随 `loadMapRunner`/`unmount` 作废；
  - **不碰 `MapRunner.as`**（不构成第三处授权例外）—— 备选「把回报间隔从 6 帧缩到 1 帧」需再重编译，被否。
- **门禁**：`bash tools/build-maprunner.sh` 编译通过（仅两条既有"无构造器"警告，与历史一致）；
  `node --input-type=module --check`（`mapScene.js`）与 scoped `git diff --check` 通过；**未新写测试/探针脚本**（决议 ⑦）。
- **停点**：§8.20（SWF 图穿装备/骑乘 ⇒ 只有一只角色；卸装/`clear()` ⇒ 黄点 + 原 SWF 角色回来；走位/光口/NPC/野怪不变）⇒ **已随 ★M9-c 退役、不再可测**（旧链代码仅存 git 历史），puppet 路等价判据并入 `§8.23` **✅ 已通过（2026-10-20「整体结账」）**。

**请人测（M8-f2 双角色修复）**：见 **§8.20** ⇒ ⚠️ 该面已随 ★M9-c 退役、**不再可测**（等价判据 = `§8.23` ✅）

---

#### 7.3.26 MDB9-a as-built（2026-10-20）—— **SWF 路角色提线化最小闭环：puppet 协议 + JS 逐帧走 + 相机本地钳位**（✅ 已手测通过 2026-10-20「nice, 现在ok了」）

- **触发 / 授权**：f2 修补①（`swfFollowPoint` 平滑）手测仍抖 —— 根因 = `mapState` 每 6 帧回报 ≈4Hz，平滑补不回采样率（分析 = `map-swf-puppet.md §1`）。
  人类 2026-10-20 点名 **D（地图与角色相分离）**、评审口径「**照抄 JS 图那里的设定**」⇒ `map-swf-puppet.md` 过审，`MPQ1–MPQ6` 收敛为该稿 §5 决策记录。
  本批 = `game/maprunner/**` **第三处授权例外**（细则 = `map-swf-puppet.md §4` 协议 + 本节）。
- **AS3 `game/maprunner/MapRunner.as`**（puppet 协议，全部行为以 `puppet` 位分流、`puppet=0` 旧链逐字节不变）：
  - 构造器：`puppet = (loaderInfo.parameters.puppet || "1") != "0"`（**默认开**，= MPQ6）；注册 `addCallback("setPos", jsSetPos)`、`addCallback("walkReached", jsWalkReached)`；
  - `jsSetPos(x,y,mov):String` = 写 `ax/ay/moving` + `placeActor()`，返回 `"world.x,world.y"`（Ruffle 调用端拿到的是 Promise ⇒ JS **不 await**、只做事后相机校准，= **M9-I2**）；
  - `jsWalkReached()` = 执行一次性 `callCb`（野怪召唤到站 ⇒ `WildPet.onActorReached` 判距 `≤8px` 成立 ⇒ `startFight`，状态机留 AS3，= **M9-I4**）；
  - `onActor`：装载即 `if (puppet) actor.visible = false` —— **SWF 自带裸装角色在 puppet 位恒隐**（黄点/叠层结算不再需要，`actorVisible` 回调保留给旧链）；
  - `finishInit` 的 `mapReady` 追加 `x:ax, y:ay, sw:stage.stageWidth, sh:stage.stageHeight, puppet:puppet`（JS 本地钳位与初始落点的输入）；
  - `jsWalkTo`：puppet 位**只上报** `post({type:"mapClickWant",x,y})`（不 `findPath`/`spotAt`）；`petCallActor`：puppet 位已在脚下 ⇒ 直接 `cb()`，否则存 `callCb` + `post({type:"mapWantWalk",x,y})`；
  - `tick`：走路段加 `!puppet` 门（`route` 恒空 ⇒ 不内部积分、不发 `mapArrive`）；`mapState` 回报与 `placeActor` 保留（JS 只吃相机）。
  - `tools/build-maprunner.sh` 重编译 ⇒ `mapRunner.swf` **29390 字节**（解包确认 `setPos`/`walkReached`/`mapClickWant`/`mapWantWalk`/`puppet` 均已进产物）。
- **L4 `game/app/scenes/mapScene.js`**（走位事实 = JS 每帧，样式 = 照抄 JS 路）：
  - `M` 增 `puppet/swfStage/wantWalk` 三态；`loadMapRunner` 的 `q` 追加 `puppet: P.get('puppet') || '1'`（调试 `#/map?…&puppet=0` 一键回旧链）+ 复位四态；`enterJsMode`/`unmount` 同步复位；
  - `mapReady`：puppet 位 ⇒ `M.pos={x,y}`、`M.swfStage={sw,sh}`、`M.cam` 用本地钳位初始化、强制 `syncLook()`（角色一律 canvas 画）；
  - `mapState`：puppet 位 ⇒ **只取 `camX/camY` 校准**，**不消费** `x/y/moving`（避免 4Hz 台阶覆写 JS 连续位）；
  - 新增 `mapClickWant`（JS 侧做光口判定：`M.spots` 圆 `HOT_R=26` 最近者 ⇒ `M.walkTarget={…,hit}`）与 `mapWantWalk`（`M.wantWalk=true` ⇒ 到站调 `M.player.walkReached()`）两个 handler，均 `startJsLoop()`；各带一行调试日志；
  - **`stepJs` 直接扩用**（偏差登记 ①：计划 §3.11.1 说"新增独立循环"，实现 = 把既有 `stepJs/startJsLoop` 的门从 `M.jsMode` 放开到 `M.jsMode||M.puppet`，到站序 = 先 `walkReached()`、再光口 `gotoMap`，同一台机不复制数学）；
  - `puppetCam(px,py)` + `clampN` = **本地复刻 `placeActor` 钳位公式**（吃 `M.info` 的 `mapX/mapY/mapW/mapH` + `swfStage` 的 `sw/sh`）；`puppetSync(moving)` 每帧 = 本地相机 + `draw()` + fire-and-forget `setPos`（`.then` 解析 `"x,y"` 仅做 ≤1 AVM2 帧的事后校准）；
  - `canDrawActor()`：`M.jsMode || M.puppet` ⇒ 恒真（**M9-I3**：puppet 路黄点退役，缺自定义包也画裸装小赛尔 fallback）；`draw()` 的 SWF 叠层分支 puppet 位直接用 `M.cam+M.pos`（**不走 `swfFollowPoint`**，那是旧链补丁）、跳过 `syncSwfActorVisibility`；
  - `syncLook` 两处「SWF 叠层暂缺自定义包，保留黄点」日志加 `!M.puppet` 门（puppet 位 fallback 非黄点，不误报）。
- **已知未修（预期，等 §8.21 手测 + b/c 批）**：遮挡穿帮（`front_mc` 盖不住 `#ov`）不变；`mapState`/`swfFollowPoint` 消费仍在旧链、**c 批退役**；MB10 回图 spawn / 昼夜镜像 / B3 NPC 点击的 puppet 数据面回归 = **b 批**。
- **门禁**：`bash tools/build-maprunner.sh` 编译通过（仅两条既有"无构造器"警告，与历史一致）；`node --input-type=module --check`（`mapScene.js`）通过；scoped `git diff --check` 通过；**未新写测试/探针脚本**（决议 ⑦）。
- **停点**：§8.21（SWF 图**只有一只 canvas 角色、连续走动无抖**；点空地/光口/野怪三链通；装备骑乘仍叠层；`&puppet=0` 逐字节回旧链）。
- **手测结论（人类 2026-10-20「nice, 现在ok了」）**：**整体通过** = 抖动根治达成；①–⑤ 未逐条拆分回报，速度未报 = 按默认（M9-I1 的 `JS_SPEED` 不动）；已知未修（遮挡穿帮）未报新异状。**遗留 → `b` 批回归 = §8.22**。

**请人测（M9-a 提线闭环）**：见 **§8.21**（✅ 已通过）。

---

#### 7.3.27 MDB9-c as-built（2026-10-20）—— **`puppet=0` 旧链退役：JS 侧删 f2 补丁与旧链消费，puppet 成唯一 SWF 走位通路**（✅ 人类拍板 A·退役；✅ **已手测通过 2026-10-20「整体结账」= §8.23**）

- **触发 / 授权**：`b` 批已过（§8.22「都过」）后，c 批唯一前置 = `puppet=0` 旧链去留 ⇒ 人类 2026-10-20 拍板 **A·退役**（`status.md` 待拍板已结账）。
- **L4 `game/app/scenes/mapScene.js`（只删 JS、**不碰 `game/maprunner/**`、不重编译**）**：
  - 删除 `swfFollowPoint()` + `swfFollow/swfFollowSnap` 状态（f2 修补① 的 4Hz 指数平滑）与 `loadMapRunner`/`unmount` 两处复位；
  - 删除 `syncSwfActorVisibility()` + `swfActorHidden/swfActorWarned`（f2 的 `actorVisible` 显隐同步 —— puppet 位 AS3 装载即恒隐，回调无消费者）；
  - `mapState`：**只剩** puppet 相机校准一行（旧链的 `x/y/moving` 消费与 `M.pos` 覆写整段删除 ⇒ 4Hz 台阶源头不再进绘制链）；
  - `mapWalk`/`mapArrive` 两个 handler **整体删除**（二者是 AS3 内部走位的回报；`tick` 走路段有 `!puppet` 门 ⇒ puppet 恒真后永不发出）；
  - `q` 不再透传 `puppet: P.get('puppet')` ⇒ **`&puppet=0` 调试入口退役**（AS3 参数缺省 `"1"`，旧走位段成惰性死码留在产物里，不重编译）；
  - `canDrawActor()` 收敛为「计划就绪即真」（旧链「有自定义外观且包齐」分支删）；连带删 `customRefs`/`missingCustom` 判定与两处「SWF 叠层暂缺自定义包，保留黄点」日志（puppet 位缺包一律 `drawActor` fallback）；`hasCustomLook()` 只剩 `enterSwfMode` 的装载门一处引用；
  - `draw()` 位置 = `M.cam+M.pos` 单一来源（平滑分支删）；`APP.actorLook` 调试 dump 的 SWF 注语改写为提线口径。
  - **保留不动**：`M.puppet` 位本身（仍由 `mapReady.puppet` 回报置位，作为 `mapClickWant`/`mapWantWalk`/`mapState` 校准的有效门）、`puppetCam/puppetSync`、`stepJs` 的 puppet 分支、AS3 侧全部。
- **登记「由 M9 根治」的三条历史缺陷**：4Hz 抖动（f2 修补① = 缓解 ⇒ M9 根治，平滑补丁本批删）；双角色露边（f2 `actorVisible` = 结算 ⇒ puppet 恒隐根治，本批删 JS 侧）；缺包退黄点基线（f 语义 ⇒ M9-I3 puppet 路 fallback 取代，本批删判定）。**旧链代码可从 git 历史找回**。
- **门禁**：`node --input-type=module --check`（`mapScene.js`）通过；scoped `git diff --check` 通过；`game/maprunner/**` 零改动（`git status` 验证）；**未新写测试/探针脚本**（决议 ⑦）。
- **停点**：**§8.23**（puppet 单通路回归 —— 走/传送/开战三链 + 单角色无抖 + `&puppet=0` 已无效 + 缺包 fallback + NPC/HUD 抽查）。
- **手测结论（人类 2026-10-20「整体结账」）**：**§8.23 通过** ⇒ `MDB9-c` 结账、**★M9 全线（a/b/c）就此收口**；旧链退役未引发回归（三链/无抖/单角色/fallback 均照 a/b 批口径）。遗留仍只有已登记的两条人眼校项：**前景遮挡穿帮**（`front_mc` 盖不住 `#ov`）与**朝向判定滞后**（拐角/小步）—— 均非本批引入、不阻塞。

**请人测（M9-c 收口）**：见 **§8.23**（✅ 已通过 2026-10-20「整体结账」= M9 全线结账）。

#### 7.3.28 MDB8-e2 as-built（2026-10-20）—— **采集单定向拉取工具 + 缺件 108 全量补齐**（政策 = 人类拍板 B，M8 §5.5 通道一）

- **触发 / 授权**：PI-equip 手测撞见"脚部/坐骑点了没效果"= 缺包降级（盘上仅 12 包）；补素材原只有"真人进游戏逐件预览"一条慢通道 ⇒ 人类 2026-10-20 拍板 **B**：允许**按采集单点名、有界定向拉取**（仍禁全站遍历/无边界扫描）。政策修订已落 `map-actor-look §5.5`（两通道）与本份 **M8-P7**（§3.10.1）。
- **新工具 `tools/fetch-actor-packs.mjs`**（L2 侧工具，不进运行时）：默认拉 `manifest.missing` 全量、`--ids=` 点名、`--dry` 单件试探、`--limit/--sleep/--cache/--force`；**有界纪律** = 串行 + 150ms 间隔 + 显式目标清单（对齐 `docs/legacy/petbag-handoff.md` 有界爬取口径）。落盘 = 缓存根裸包（改服自定义帧序列容器，族头有 `004c`/`004b` 两族 ⇒ **校验只信 `parsePack`**，与运行时同码）+ 同步登记 `index.json`（`hash = md5(url)`，与启动器 core-net `_urlHash` 同式 ⇒ 启动器见键即命中、不重复下载）。
- **结果（对账 = `node tools/build-actor-assets.mjs`）**：manifest **12→71 包 / 18→126 文件 / missing 108→0、parseError 0**；`serve.mjs /game-cache/` 新包 200 可达（8090/8099 双实例都验）。**未采集登记 = 0 件**（无 404、无坏包）。
- **过程异常（如实记）**：首轮全量拉取后清单核验出现"旧态回滚"假象（index/文件/manifest 三处同回旧态、mtime 早于拉取时刻，来源未定位 —— 环境有 2 个 `serve.mjs` 与外部 hermes gateway 进程在跑）；**重跑同一命令后写入持久有效**，上述结果以重跑后为准。若再现，先查 `index.json` mtime 与 `ls swf/ | wc -l`。
- **门禁**：`node --input-type=module --check`（工具）通过；无运行时代码改动（`game/app/**`、`game/core/**` 零触碰）；`game/maprunner/**` 零改动。
- **停点 → ✅ 已结账（2026-10-21 随 §8.17 一并确认）**：**请人重开游戏（硬刷新）** ⇒ 面板/地图上脚部、坐骑、其余装备应有真画面（= 原 §8.17 的"采集"半边就此结账）。

#### 7.3.29 MDB8-e3 as-built（2026-10-20）—— **包采集单扩成全目录推导 + 2404 缺包全量补齐（14 件真 404 登记未采集）**

- **触发**：PI-g 手测日志（人类 2026-10-20 原样回贴）= 脚 `111006_0/_1` 只走 fallback、坐骑 `157003_0/_1` 缺包按未骑绘制（M8-I2 降级链本身正常）。根因 = `MDB8-e2` 的采集单还是**旧口径**（29 骑乘 + 10 色默认 = 108 件手挑清单），而 PI-g 面板已放开「全目录随便换」（PIQ5=A）⇒ 单外件必缺包。
- **改正（政策不变 = 点名式有界，M8 §5.5 通道一）**：
  - `tools/build-actor-assets.mjs` 期望集**不再手挑**，改为从 `equip-index.items` 全目录推导：`slot∈{1..8}` 每件 → `resourceIdOf(suit, slot)` 定包名（手/脚/坐骑基准槽 {2,6,3} 要 `_0`+`_1`，其余无后缀）；**跳过**蓝/红裸装与默认头/眼（`DEFAULT_COLORS[0]/[6]` 手脚身 + `100001/100003` = 仓库 `game/data/actor/*.bin` 裸装通路，ALC6）⇒ 期望 = **2523 包文件 / 573 个 suit 族**（旧 108 件清单被完全覆盖后删除）。
  - `tools/fetch-actor-packs.mjs`（包模式）：全量跑（非 `--ids`/`--dry`）时把失败逐件落**未采集台账** `game/data/actor/equip/pack-missing.json`（与 `--icons` 的 `icon-missing.json` 同口径）。
- **结果（对账 = 重跑 `build-actor-assets.mjs`）**：拉取 2404 件 ⇒ **成功 2390 / 404 = 14**（`index.json` 743→3133 条；manifest **71→1721 包 / 126→2516 文件 / missing 2404→14、parseError 0**）。**14 件未采集 = 服务器真无**（对位目录：葛蕾芬手套/兵团长拳套 suit76、兵团长的剑 suit86、回忆录 suit572、雷电电闪 suit108、渡鸦战靴 suit279、战魔武煞背甲 suit413、上古战神背装 suit454、张飞盔甲背装 suit498、鬼瞳背装 suit512、**五周年冠军坐骑 101737 suit570**）⇒ 运行时对这些件继续走既有降级链（fallback/未骑绘制），**不伪造、非死账**（台账 + 日志自陈在）。
- **门禁**：两工具 `node --input-type=module --check` 过；无运行时代码改动（`game/app/**`、`game/core/**`、`game/maprunner/**` 零触碰）；不新增测试/探针脚本（决议 ⑦）。
- **停点**：**请人重开游戏（硬刷新）**复测同两件 ⇒ 脚 `100581→111006` 应有真画面；坐骑 `101737` **仍按未骑绘制 = 预期**（该 suit 包服务器 404，已登记），可换骑别的坐骑组件（如目录里 suit 非 570 的件）验证骑乘画面。**✅ 人类 2026-10-20 复测确认「现在可以更换其他的装备了」= 本批结账**（缺包补拉达成；`157003` 那件维持未骑 = 已登记的预期降级）。

---

#### 7.3.30 MDB8-h as-built（2026-10-21）—— **玩家面「缺件过滤」+ 12 色独立成「颜色」组**（人类三条指令 ⇒ `ALQ10=A / ALQ11=A`；View 侧施工批 = `playerinfo-impl` **PI-j**）

- **触发**：人查「五周年冠军坐骑 101737 怎么找不到素材」⇒ 顺着量出**整个缺件面**（`map-actor-look §5.7`）：部件包缺 **14 文件 = 11 件**（`game/data/actor/equip/pack-missing.json`，官服 404 实测）、装备图标缺 **48 件**（`icon-missing.json`）、另有 **132 条是设计排除**（129 件槽 9 NONO 装 + 3 件蓝/红裸装走仓库 `.bin`）不是缺口。同时暴露两个目录设计问题：**36 件颜色装与真装扮件平铺在同一目录**、**表情有两支**（槽 8 装备表情 = 21/21 齐；对话气泡 `emoji/toon/*` = **素材在盘且已入库、只是运行时没接** ⇒ 见本条末尾「指令② 的处置」，先前写"从没抓过"已更正）。
- **人类指令（2026-10-21 三条）**：① 部件包缺的 ⇒ **文档写缺失、不要出现在游戏内**；② 表情素材疑似没抓；③ 颜色**单出一个换色功能**、不要出现在角色部件表里。追问后拍板：屏蔽范围 = **只玩家面（面板目录）剔除**（调试入口照旧可穿任意 ID、存档里的无包件照常画 fallback、**不静默改档**）；换色入口 = **面板内单开「颜色」组**。
- **L1 `game/logic/map/actor-look.js`**（纯，无 L0/L2 改动 ⇒ **不需** `node tools/build-core.mjs`）：`:66` 新导出 **`COLOR_ITEM_IDS`**（= `DEFAULT_COLORS` 的 hand/body/foot 展平 ⇒ **Set，36 件**，单一真值不新抄表）；`:104` 新导出 **`packRefOf(item)` → `{pack, suffix}`**（复用既有 `resourceIdOf` + `packSuffixOf` ⇒ **包名/后缀公式全仓只此一份**，L4 不许重拼）。
- **L4 `game/app/scenes/mapScene.js`**（`openRestartPlayerInfo` 闭包）：`:563/:583` 新 `PIF_MANIFEST` 与 `PIF_EQUIP_IDX` **并列预热**（`CONTENT.loadActorManifest()`，content 侧失败已兜成空清单）；`:588-600` `listCatalog` **三重筛** = 槽位 → `!COLOR_ITEM_IDS.has(id)` → `packs[pack]?.files?.[suffix]` 已登记；`:560` `PI_GROUPS` 末位追加 `{key:'color', label:'颜色', slot:0, color:true}`（照 `ground` 非物品组先例，**追加在尾 ⇒ 组序不动**）；`:606/:607/:611/:626` 新 `getColorMode()` / `listColors()` / 汇总的 color 支 / `onPickColor(n)` = 既有 `APP.actorLook.color(n)`（`:2567`，**内不调 `persistLook` ⇒ 不落 `<equip>`**，与 `ground` 同口径）。
- **L3 + CSS**：`playerInfoPanel.js` `:203-219` 加 `active.color` 分支（形状照抄 `active.ground`：12 钮 + 当前高亮、**不分页**）；`ui.css` `:764-768` 新 `.rb-pif-colorbtn(--on)/-chip/-name`。细节与偏差（**PID14 色值表只当显示底色、PID15 `assetReady`、PID16 落点 4 文件**）= `docs/view/panel/playerinfo/playerinfo-impl.md §7.8`。
- **效果实测（数据口径核对，非验收）**：面板六组 **1701 → 1666**（头 347/手 375/脚 304/腰 305/背 240/坐骑 95；−35 = 24 件颜色手脚 + 11 件无包），逐组对上 design §3.8 预算。身体（槽 4）与 12 件颜色身体件本就不在面板组里。
- **边界（守住）**：**调试面不屏蔽**（`APP.actorLook.equip/ride` 仍可穿任意 ID ⇒ 将来补到货靠它验）；**不改存档**（档里已有的无包件进图照画 fallback + 一行缺包日志 `:2053` 口径 = `外观缺包（签名）: 157003_0…`）；**图标缺不作剔除条件**（图标仍走 `item-art.js` 四级兜底，末位色块 + `assetMissing` 自陈）；**不补抓红色 suit7 的三个包**（官服实有、被 `tools/build-actor-assets.mjs:69-72` `NAKED_REFS` 主动跳过 = 设计排除；颜色既已独立成换色功能，`.bin` 裸装够用）。
- **指令② 的处置（表情两支分开 ⇒ 附带一条**自我更正**）**：**槽 8 表情/眼睛 21 件 = 已齐**（包 21/21、图标 21/21，实测），**不重复抓取**；**对话气泡 `emoji/toon/*`（24 个名、54 张地图 XML 引用，另 `emoji/meme/*` 7 个名）= 素材其实在盘且已入库** —— ⚠️ 本批先前把它判成"从没抓过 / 盘上为空"是**我看错了树**：真路径 = `projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map/talk bubble/emoji/toon/`（**24 png / 196K、逐名对上、零缺件**，`git ls-files` = TRACKED），而这条事实**正本早就写在 `docs/map/map-move.md:319/:324`**（样本 > 源码，我先前没查到）。官服侧确实没有这条路（4 候选根全 404、上游 `URLUtil.as` 无 emoji 取数函数）⇒ **它是发行包自带静图、不是"抓"来的**。⇒ **缺口性质改写 = 运行时未接线（气泡只文本，`mapScene.js:1158` 一带），不是缺素材**；原先挂的"登录器日志取证项"**取消**。图像气泡落地 = 读本树静图 + 气泡排版，**是一条新批**（本批按已批范围不动它 ⇒ **✅ 该新批已随 `MDB10` 落地，见 as-built §7.3.32 / 手测 §8.26**）。更正同时落 `map-actor-look §5.7 ④` 与本份旧条目（`:1326` / `§8.8` 一带）。
- **门禁**：`node --input-type=module --check` = `actor-look.js` / `mapScene.js` / `playerInfoPanel.js` **3/3 过**；分层 = `grep "from '.*logic/" game/app/view/playerinfo/` **零命中**（PI2 不破）；`session.js` 一行未改；无新裸依赖 ⇒ import map 零增项；`game/core/**` 零改动 ⇒ 无重生成物；`game/maprunner/**` 零改动；本批**未新增**测试/探针脚本（决议 ⑦）。
- **停点 → ✅ 手测通过（人类 2026-10-21「ok, done good」）**：**§8.24** 已结账（本批的三条指令反馈 = 催生 `MDB8-i` 的四条 ⇒ 同盘面一并确认；判据逐条保留供日后回归复用）。

#### 7.3.31 MDB8-i as-built（2026-10-21）—— **「表情」组进面板 + `suit=0` 空件不列 + 部件包裁图标静图**（人类四条反馈 ⇒ `ALQ12` / `ALQ13` / `ALQ14`；View 侧施工批 = `playerinfo-impl` **PI-k**）

- **触发（人类 2026-10-21 四条）**：① 「更改角色表情未添加」；② 背部「蓝队旗帜 / 红队旗帜」没有图标素材，**能不能从部件 swf 生成**；③ 手部「阿卡 / 迪迪兰 / 咻休公仔」同上；④ 头部「**默认头顶不就是没有头顶吗？感觉没有必要显示在部件列表里**」。
- **① 表情 = 装备槽 8（上游 `EquipSlot.as:18` `EYE`）**：**素材本来就全齐**（`equip-index` 21 件、包 **21/21**、图标 **21/21**），L1 也早就支持（`PART_OF_SLOT[8]='EYE'`、`DOWN_ORDER` 含 8、`mergeDefaultEquip` 收 `slot<=8`、L4 `LOOK_EQUIP_SLOTS` 含 8）⇒ **缺口只是面板组里那一行**。表情是**装备件**（与「颜色/阴影」两个非物品组不同）⇒ 走既有 `APP.actorLook.equip/unequip` ⇒ **变更即落盘 `<equip>`**（`MDB8-g` 通路，本批零改动）。
- **L1 `game/logic/map/actor-look.js`**（纯，无 L0/L2 改动 ⇒ **不需** `node tools/build-core.mjs`）：`:75` 新导出 **`isEmptySuitItem(item)`** = `Math.trunc(Number(item?.suit)||0) === 0`（上游 `suit=0` = 「这一槽没穿东西」的默认件：默认头顶 `100001` / 透明替身 `100002` / 默认眼睛 `100003`）。判据放 L1 = 与 `COLOR_ITEM_IDS`（`:66`）同口径：**单一真值在 L1、L4 只装配**。
- **L4 `game/app/scenes/mapScene.js`**：`:560` `PI_GROUPS` 在 `mount` 后、`ground` 前插 `{key:'eye', label:'表情', slot:8}` ⇒ **件物组相邻、两个非物品组仍在末位**（组标签共 **9 个**）；`:597` `listCatalog` 的筛由三重改**四重** = 槽位 → 剔 `COLOR_ITEM_IDS` → **剔 `isEmptySuitItem`** → 只留清单已登记包。面板机械件（`equippedIdOfSlot` / `getEquippedSummary` / `onPickEquip` / `onUnequipSlot`）**全按 `g.slot` 通用** ⇒ 槽 8 零分支；**L3 视图与 CSS 零改动**（`.rb-pif-tabs` 已 `flex-wrap`，ui.css:750）。
- **② 图标 = 新工具 `tools/pack-icon-stills.mjs`（素材生成，不是验收脚本）**：部件包文件本身 = `head + 裁帧表 + 一整张内嵌 PNG spritesheet`（§7.3.22 / `map-actor-look §5.3`）⇒ 复用 L1 `parsePack` / `labelStartFrame('standDown')` / `pickFrame` / `frameRect` 切出该帧、按「最长边 ≈ 112」最近邻放大、居中贴 **120×120 RGBA**（与 `tools/swf2svg.mjs --png=2` 的产物同尺寸），写 `png/item/equip/icon/{id}.png` = `game/app/view/item-art.js` 四级兜底的**第①级** ⇒ **运行时零改动即亮起**。默认扫描口径 = `icon-missing.json` ∩ 玩家面可见（槽 ∈{1,2,3,5,6,7,8}、非颜色件、非空件）∩ 包已缓存 ⇒ 实测命中 **5 件**（`100106` 蓝队旗帜 / `100107` 红队旗帜 / `100242–100244` 三公仔）；另有 **5 件包也 404**（`100233/100337/101335/101493/101737`）⇒ **无从生成、且本就被 `ALQ10` 剔出目录**；其余 **38 件**不在玩家面。守卫：目标**已存在即跳过**、**是软链则拒绝覆盖**（抄 `tools/swf2svg.mjs:195-198` 的 `isSymlink` 纪律 —— 曾有写穿软链毁掉 `Resources/Items/1.png` 的事故）。
- **效果实测（数据口径核对，非验收）**：七组 **1666 → 1685** = 头 **347→346**（−1 = 默认头顶）+ 手 375 + 脚 304 + 腰 305 + 背 240 + 坐骑 95 + **表情 20**（21 件 − 默认眼睛 `100003`）。
- **边界（守住）**：`suit=0` **只筛目录显示** —— `APP.actorLook.equip(100001)` 照旧能穿、存档里已有的不动（**决议②/`ALQ10` 同口径，不静默改档**）；**产物不入库**（`.gitignore` 的 `/png/*` 支，人类 2026-10-20 拍板「静图产物不入库」）⇒ 新克隆这里 404、由兜底链落回 Ruffle/PNG/色块，**不空屏**；**裁出来的是"部件美术"、不是官服图标原画**（小图放大带块感）⇒ 属**兜底美术**，如实登记（`map-actor-look §5.7 ②-b`）。
- **门禁**：`node --check`（ESM 副本）= `actor-look.js` / `mapScene.js` / `playerInfoPanel.js` / `pack-icon-stills.mjs` **4/4 过**；分层 = `grep "from '.*logic/" game/app/view/playerinfo/` **零命中**（PI2 不破）、L1 两文件零 `fetch`/DOM；`session.js` 一行未改；`game/core/**` 零改动 ⇒ 无重生成物；`game/maprunner/**` 零改动；本批**未新增**测试/探针脚本（决议 ⑦）。
- **停点 → ✅ 手测通过（人类 2026-10-21「ok, done good」）**：**§8.25** 已结账 ⇒ `MDB8-h` + `MDB8-i`（M8 玩家面两批）就此收口。**未逐条拆分回报**（表情能否换 / 默认头顶是否消失 / 五张裁帧图 / 其余组数字 = 一揽子通过）；**裁帧图若日后不满意是可逆的**：删 `png/item/equip/icon/{100106,100107,100242,100243,100244}.png` 即回到色块（产物不入库，重跑 `tools/pack-icon-stills.mjs` 再生）。**M8 两条手测 `§8.17`（e · 新包上屏）与 `§8.19`（g · 存档 `<equip>` 落盘/round-trip）✅ 已通过（人类 2026-10-21「全部测试通过」） ⇒ M8 全线收口**（`§8.18`/`§8.20` 的 SWF 旧链面已随 ★M9-c 退役不可测，等价判据并入 `§8.23` ✅）。

#### 7.3.32 MDB10 as-built（2026-10-21）—— **野怪图像对话气泡**（`logic/map/talk.js` L1 新件 + `talkImageUrl` + L4 两条路接线）

- **触发**：`§7.3.30` 末尾把"图像气泡"登记成**一条新批**（缺口 = 运行时读取路、不是缺素材）⇒ 人类 2026-10-21 点名"那就处理图像对话气泡"。**两条口径由人类拍板**：① **生效范围 = 两条渲染路都出**（不只 JS 回退图）；② **挑选 = 照上游：图与文进同一个池子均匀随机**（⇒ 约 **3/4 出表情、1/4 出台词**；**文本条目不删、只是被稀释**）。
- **落地前的账面（本批新量，脚本一次性读样本、剥注释）**：`<talk>` **110 条 / 53 张图**；`<self>` **3,520 条 = 2,682 图 + 838 文**；**106 条混合 + 4 条纯图**；`image` 的 distinct **31** = **24 `emoji/toon/*`（各 110 次）+ 7 `emoji/meme/*`（各 6 次）**、**id 一律不带扩展名**、目录与扩展名**完美二分**（toon=png / meme=jpg）⇒ **不需要"先试 png 再试 jpg"**。53 张图按 `AGENTS §4.16` 分流 = **JS 路 11 张（21 只）/ SWF 路 42 张（89 只）** ⇒ 旧口径（调度只在 `M.jsMode`）下**81% 的说话野怪永远不冒泡**，而丢掉图像条目又让**76% 的说话内容看不见**、那 **4 只纯图野怪一个气泡都不出**。
- **L1 新件 `game/logic/map/talk.js`（纯：零 DOM / 零 fetch / 随机与时钟外部注入 = 决议 ① R1/R2）**：`:48` **`seedTalk(npc, rand)`** ⇒ `talk.self` 里**有 ≥1 条有效条目（`text` 非空 或 `image` 非空）**才建 `{text:null, image:null, timer:0, next:pick(interval,rand)}`，否则 `null`（**替换** `wander.js` 旧判据"至少有一条文本"）；`:65` **`stepTalk(st, talk, dtSec, rand, canStart)`** ⇒ `timer>0` 只倒计时、归零把**图与文一起清空**；否则 `next` 到点 ⇒ 先重排 `next` ⇒ 摇 `chance` ⇒ **从全部有效条目均匀挑一条** ⇒ `{image}` 就只写 `st.image = 原样 id`（**不拼 URL**，URL 归美术件那一族）、`{text}` 就只写 `st.text`；`timer = Number(duration) || 1.8`。**独立成件的理由** = SWF 路野怪**不漫游**（走位归 `MapRunner.as`），为一个气泡去伪造 `_wander` 是错的耦合 ⇒ **两条路共用同一份调度数学、只有一份实现**。
- **L1 `game/logic/map/wander.js` 收口成"只管走位"**：`:12-14` 头注释改成"气泡调度已迁出"；`seedWander` 的 `bubble` 字段与 `stepWander` 里的整段气泡调度、以及 `talk` 形参**一并删除**（**不留兼容垫片**）；`:66` 签名现为 `stepWander(state, movement, dtSec, rand)`。走位口径（无碰撞 / `radius` / **只 JS 路**）一字未改（`AGENTS §4.15` ①② 仍成立）。
- **L1 `game/logic/map/npc-art.js` 新导出 `:66` `talkImageUrl(id)`**（该件本就是"地图实体美术 URL"的单一落点，与 `npcArtUrl` `:30` / `iconUrl` `:48` 并列、不动它们）：`trim` → **去尾部扩展名**（上游 `NormalizeImageId` 同口径）→ **拒绝**含 `..` / 以 `/` 开头 / 不匹配 `^emoji\/(toon|meme)\/[a-z0-9_]+$` ⇒ **返回 `null`** → 扩展名 `toon⇒.png` / `meme⇒.jpg` → `:23` `TALK_BUBBLE_DIR` = `/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map/talk%20bubble`（目录名**带空格** ⇒ 必须写 `%20`；`tools/serve.mjs` 的静态服务已 `decodeURIComponent`，**服务端零改动**）。
- **L4 `game/app/scenes/mapScene.js`**：`:65` `import * as TALK`（与 `WANDER` 同族 ⇒ **无新裸依赖 ⇒ import map 零增项**）；`:1691-1696` **播种在 `if (M.jsMode)` 之外** ⇒ JS/SWF **两条路都播** `_talk`（~~`_wander` 仍只 JS 路~~ ⇒ **同日 `MDB11` 已把 `_wander` 也放成两条路**，见 **§7.3.33** D-13/D-14），有货即 `startTalkLoop()` + 一行日志；`:192` `TALK_CACHE` + `:1220` `ensureTalkSprite(url)`（**照抄** `ensureNpcSprite` 的形状 = `{state:'loading'|'ok'|'err', img}` + `npcGen` 竞态守卫 + 装载完 `draw()` 补画；缓存**按 URL 键、跨图复用** = 与 `NPC_CACHE` 同口径，"地图不缓存"只针对地图）；`:1129` 投喂把 `bubble` 从 `string` 改成 `{text,image}`（**唯一消费者 = `drawNpcs`**，点击命中面不读 `bubble` ⇒ 不破）；`:1184` **`drawNpcs()` 拆两遍**；`:1234` 新 `drawNpcImageBubble()`；`:2401-2421` 新 `startTalkLoop`/`stopTalkLoop`/`stepTalkLoop`；`:1881` `leaveJsMode()` 里 `stopTalkLoop()`（换图/卸载；SWF 路 `loadMapRunner` 亦经 `leaveJsMode` ⇒ 停后由 `registerAndRunAuto` 重新起）。
- **顺带修掉一条旧毛病（不在批计划里、如实登记）**：`drawNpcs` 原为**单遍**绘制 ⇒ 一只邻居的 sprite 会盖掉前一只**已画出的气泡**（MB9 文本气泡今天就有这现象）。改成**第一遍全部 sprite + 名字、第二遍全部气泡**后气泡恒在最上。
- **人眼校常量（`AGENTS §4.10` 同族）**：`:195` **`TALK_EMOJI_MAX = 120`**（= 上游 `imageMaxSize 120×120`；实测素材 30–60px ⇒ 基本不触发）与 `:196` **`TALK_EMOJI_SCALE = 1`**（嫌表情小/大就调这里）。框形沿用文本气泡那套（`padX/padY = 7`、圆角 `6`、下指小尖 `5`、底边仍落名字之上 `ny-16`），框 = `sw+14 × sh+14`。
- **与上游的偏差（三条，照 `AGENTS §2` 如实登记，不当 bug 报）**：① **无淡入淡出**（上游 `fadeTime 0.18` 未做）；② **不取上游气泡底图 `WildNpcBubbleIntegrated.png`**（正式排版归 B3 美术）；③ **取不到图 ⇒ 不出泡 + 一行日志**（照上游 `LogWarning`、**不伪造、不退回文本**），但 id **畸形**（`talkImageUrl` 返 `null`）时走 `logLookOnce` 去重 ⇒ 不随 `draw()` 刷屏。另：`<scene>` / `<player>` 两张**死表**（样本 0 条）仍不接；剧情那 6 种表情运动仍归 A 组。
- **SWF 路的绘制纪律**：本环**只在"气泡出现/消失"的跳变帧**调 `draw()` —— SWF 路没有逐帧重绘循环 ⇒ 无条件 60fps 重绘整张 `#npc` 是白烧；JS 路 `stepWanderLoop` 本来就逐帧画，跳变多画一次无害。`canStart = !n._wander || n._wander.phase === 'idle'` = **驻停才起新泡**（上游 `OnRestStarted` 口径，与 MB9 一致）。
- **门禁**：`node --check`（ESM 副本）= `talk.js` / `wander.js` / `npc-art.js` / `mapScene.js` **4/4 过**；分层 = `game/logic/map/talk.js` 零 `fetch`/DOM、本批**不碰 L3** ⇒ `grep "from '.*logic/" game/app/view/` 无新增命中（现存那一条 = `view/battle/restartFighterStage.js:10`，**本批之前就有**、与地图线无关）；`game/core/**` 零改动 ⇒ **不需** `node tools/build-core.mjs`；`game/maprunner/**` 零改动 ⇒ **不重编译 AS3、不需要新围栏例外**；`game/index.html` import map 零增项；`session.js` 一行未改；本批**未新增**测试/探针脚本（决议 ⑦）。
- **停点 → ✅ 已结账**：**§8.26** 手测通过（人类 2026-10-21「全部测试通过」= 一揽子通过，**未逐条拆分回报**；人类手测为主 = 决议 ⑦）。

#### 7.3.33 MDB11 as-built（2026-10-21）—— **野怪分布单一来源 = Unity `<npc><wild>`**（断开我方合成的 `wild.json` + AS3 `WildPet`）

**触发**：人类 2026-10-21 点名「现在地图的野怪分布能不能采用 Unity 端的野怪分布逻辑即可，但是现在还有其它逻辑。我希望先不引入其它逻辑到游戏中」⇒ 地图上**同时跑着两套野怪**（Unity 真值 `<npc><wild>` + 我方合成 `wild.json`→AS3 `WildPet`）这件事本身就是本批要消掉的。三条拍板（AskUserQuestion，全选推荐）：① **彻底收口**（断数据入口 + **删** JS 侧那套只服务它的代码）；② **空图就没有**（219 张真值没写怪的图**不伪造**）；③ **漫游两条路都走**（解除 `wanderRaf` 的 `M.jsMode` 闸）。

⚠️ **本批性质 = 结一条旧账**：`§1.3`「野怪点击 → 战斗」行、`§3.9`（`:292` 一带）、`map-code-map.md:28/:56`、`map-move.md:475/:576` 从 **2026-10-18** 起一致宣称合成表"**退场**"，但**运行时从来没断过**（`mapScene.js` 仍 `fetch('/game/data/wild.json')` 并喂给 AS3）⇒ 本批**把已拍板的口径落到底**，不是新决策。

**落点（L4 `game/app/scenes/mapScene.js`）**：
| # | 处 | 改了什么 |
|---|---|---|
| A-1 | `:135`（原 `wildOf()`）| **函数删除** ⇒ 换成 ★MDB11 登记注释 |
| A-2 | `loadMapRunner:1732` 查询串 `:1763` | `wild: wildOf(id)` ⇒ **`wild: ''`**（**保留键名** = "我们主动喂空"在 URL 上看得见；AS3 侧 `\|\| ""` 本来容缺键） |
| A-3 | `worldLoad:1790` → `:1806` | `M.player.loadWorld(…, spotsOf(m), wildOf(id))` ⇒ 末位 **`''`** |
| A-4 | `initMaps():2444` | 整段 `try { … fetch('/game/data/wild.json') … 野怪表: 48 种 / 252 张图有怪 … }` **删除**；⚠️ **`await CONTENT.loadContent()` 提出来独立成行**（`:2444`，会话/内容预热位，`session.js` 与 `rbattleScene.js` 都依赖，只是不该和合成表挤在同一个 try） |
| A-5 | `M` 初态 `:76` | 去掉 `wild: null` / `pets: []` / `petCount: 0` 三字段（**不留 `= null` 空壳**）；`hudTexts` 及其它一字不动 |
| B-6 | `onMessage:999` | `mapWild` / `mapPets` / `mapWildFight` **三个 handler 删除** ⇒ 换成登记注释。AS3 仍会回报一次 `mapWild{count:0}`，落进"无人认领"即被忽略（`onMessage` 无未知类型兜底日志 ⇒ **不刷屏**，已核） |
| B-7 | `:2429` | **`numericIdOfWild()` + `startWildFight()` 删除**。⚠️ **`const restartOn = () => true` 保留**（另有消费者 = `loadMapRunner` 的 `hud:` 参数）；那段"单血统 ORP3"头注跟着 `restartOn` 走 |
| B-8 | window 暴露表 | 去掉 `numericIdOfWild`（`restartOn`/`initSession`/`getActiveStore` 等照旧） |
| B-9 | **`#lbl` 脚标层整条拆除** | 它**只**画 `M.pets` 的 `Lv+名字` ⇒ 删 `drawLabels()`、声明 `lctx`、`mount()` 里的 `getElementById('lbl')`、`STAGE` 模板里的 `<canvas id="lbl">`、`game/index.html` 的 `#lbl { … }` 一行 CSS。⚠️ **`#hudtxt`/`hctx`/`drawHudTexts`、`#ov`、`#portal`、`#npc` 全部保留**（与本批无关） |
| B-10 | 三处 reset 收口 | `loadMapRunner` / `enterJsMode:1879` / `worldLoad` 里的 `M.petCount = 0` 与 `M.pets = []; drawLabels(null)` 删除（`drawHudTexts(null)` 留，★M9-c 的 f2 注释留） |
| C-11 | 图下拉 `:2459` | 选项尾的 **`⚔N` 计数移除**（旧数据源是合成表、当场可得；Unity 侧要逐张 `loadMap` 才知道 ⇒ **不伪造**一个数）。下拉仍显示 `⚠缺图` 与 `⇄N` |
| C-12 | `updateHint():955` | 「`${M.petCount \|\| 0} 只野怪」⇒ **`${(M.npcs \|\| []).filter(n => n.wild).length} 只野怪`**（现图真值）；并在 `registerAndRunAuto():1677` 播种之后**补一行 `updateHint()`** —— 旧刷新点只有 SWF 的 `mapReady`（**早于**实体登记 ⇒ 读到 0）与已删的 `mapWild` ⇒ ① JS 路本来就不刷新 |
| D-13 | `registerAndRunAuto():1666` | 播种出闸：`if (M.jsMode) { …seedWander… }` ⇒ **两条路都播**（107 只 `wander`；3 只 `stationary` 由 `seedWander` 自己返回 `null`，判据不动）；日志文案「仅 JS 路」⇒「**JS/SWF 两条路**」 |
| D-14 | `startWanderLoop():2356` / `stepWanderLoop():2362` | 循环出闸：删 `if (wanderRaf \|\| !M.jsMode)` 的 `\|\| !M.jsMode`、删 `stepWanderLoop` 开头的 `if (!M.jsMode) return`；`:2348` 头注同步改写（"SWF 路野怪照 `MapRunner.as`、不叠游荡"那句旧口径**已不成立**） |
| D-15 | 停环 | **不用新加**：`leaveJsMode():1859` 已 `cancelAnimationFrame(wanderRaf)`，而它在两条路的进图前都被调（`loadMapRunner` / `enterSwfMode` / `enterJsMode` / `unmount`），`registerAndRunAuto` 一律在之后 ⇒ 换图即"先停旧环、再播新环"。无 `_wander` 者时 `if (!any) return` 自然停转（不空跑） |
| D-16 | `stepWanderLoop():2372/2377` | **成本闸（SWF 路新引入的那一点）**：改成「**只在这帧真有怪挪动才 `draw()`**」= 步进前后各读一次 `w.pos.x/y`（`moved` 标志）。依据 = `bob` 只推进 `state.bobPhase`、**从不写 `pos`**（`logic/map/wander.js` 实测；`bobPhase` 全仓**零消费者**）⇒ 待机帧必然不动，不画就不掉信息。**不新增节流常数**：puppet 路角色行走时 `stepJs` 本来就逐帧 `draw()`（`mapState` 也每 6 帧画一次）⇒ 本批**不引入新的成本类别**；怪动窗口 = `step 12~26 / speed 34` ≈ **0.35–0.76s**，其余 2–3s 待机不画 |

**落点（L1 / L2）**：
- **E-17 `game/logic/map/wander.js:7`**：头注「**只 JS 路**」⇒「**JS/SWF 两条路**（`MDB11`，人类 2026-10-21 点名 ③）」；**本件数学一行不改**。
- **E-18 `game/app/content.js`**：**`pruneWildPool()` 整块删除**（唯一消费者 = `mapScene.js` 那段 fetch，本批已删 ⇒ 不留垫片）。⚠️ **`hasPet()` 保留** —— `battleScene.js` 两处还在用。
- **`game/logic/map/talk.js` 头注**：旧理由「SWF 路没有 `_wander`」不再成立 ⇒ 改成「SWF 路怪同日也由 JS 播态」，并写明**两套调度器仍分开**（走位与气泡是两个独立生命周期）。
- **L4 里两条同源注释一并更正**（★MDB10 留下的旧措辞，本批的出闸让它们变成假话 ⇒ 就地改，不改任何行为）：`:186` 漫游句柄头注「**仅 JS 路**」⇒「JS + SWF 两条路都转」；`:2382` 气泡循环头注「SWF 路的"不漫游"」「SWF 路没有逐帧重绘循环」⇒ 改成「SWF 路的怪也由 JS 播态；漫游环只在怪真挪动那帧画 ⇒ 气泡环**另在跳变帧**画」。
- **E-19 不动**：`game/data/wild.json`（留盘、**运行时零引用**）、`tools/build-wild-index.mjs`（留，头注已自陈是合成）、`tools/fetch-pet-icons.mjs`（默认名单仍读 wild.json 的 48 池 = 一个抓取清单，不属运行时路）⇒ 与"素材不清除、脚本不新增"（决议 ⑦）同口径。

**本批实测数（写进 `map-move.md §3.4`）**：`<wild>` 野怪 **110 只 / 53 张图**（图侧 = **42 张走 SWF / 11 张走 JS**）；`<movement mode>` = **107 `wander` + 3 `stationary`**（wander 侧 **SWF 86 / JS 21**，非 wander 的 3 只全在 SWF 侧）；107 只参数**完全一致** = `radius=220`、`speed=34`、`step="12,26"`、`idle="2,3"`(84) 或 `"2,6"`(23)。全图 **272 张 = 170 张有 swf 映射 + 102 张 JS 侧**。合成表（48 只池 / 252 张图 / 1,008 个出怪点）与真值**交集 34 张** ⇒ 本批之后 **19 张图新增野怪**（真值有、合成表没有）、**218 张图失去野怪**（合成表有、真值没有：**SWF 侧 98 / JS 侧 120**）；**219 张 = 272−53** 张图压根没有 Unity 野怪 = **拍板接受、不伪造**。

**与文档的偏差 / 如实登记的边界（五条）**：
① **合成表文件不删**（`wild.json` + 生成脚本留盘当历史产物，运行时零引用）；
② **`WildPet.as` 留成不可达死码、不重编译**（`MapRunner.as` 的 `setWild`/`spawnPets`/`jsPetPositions`/`fightOut` 全部**无对象**；★M9-c 旧链退役的同款处置）⇒ 零 `game/maprunner/**` 改动，`mapRunner.swf` 保持 ★M9 留下的工作区状态；
③ **SWF 路新增"怪动帧逐帧重绘"**（D-16）= 本批唯一新引入的运行时成本，已用"真挪动才画"夹紧；若人眼觉得"飘得突兀/掉帧"，改的是**同一族人眼校**（`AGENTS §4.10`）：调回单路或加 30Hz 上限 —— 都**不预先做**；
④ **`mapWantWalk`/`walkReached` 协议不动**（角色走位仍在用）⇒ 它那条**野怪支路**随 `WildPet` 无对象而成为死码，登记在 `map-swf-puppet.md`；
⑤ **他线文档里仍有旧指针**（本批**不越线去改**，只如实登记 ⇒ 随各线下次触碰时更正）：View 线 B3 两份（`docs/view/scene/room/view-scene-map-content.md` §4/§5 的画布栈把 `#lbl` 列为现役、`:162` 的 `mapWildFight → startWildFight` 那行；`…-impl.md:18/:51/:95/:100` 同族）、`docs/view/mech/view-shell.md:154`（栈图含 `#lbl`）、`docs/view/ui-handoff.md:106/:174/:175/:203/:207`（`numericIdOfWild`/`M.wild`/`#lbl` 脚标）、`docs/orchestration/orchestration-impl.md:480`（一条已作废的 `startWildFight` 修法）、`docs/legacy/web-client-notes.md:374`（旧记录，**当史料看即可**）⇒ 判据 = **`#lbl`/`drawLabels`/`startWildFight`/`numericIdOfWild`/`mapWildFight` 在运行时代码里已不存在**（本份 §7.3.33 为准）。地图线自己那两份（`map-design.md §2` 与 `map-npc.md §6` 的现状行）**本批已就地更正**。

**门禁（静态自检，不替代手测）**：`node --check`（ESM 副本）= `mapScene.js` / `content.js` / `wander.js` / `talk.js` / `index.html`(无 JS) **4/4 过**；**零残留 grep**（`wildOf|M\.wild|M\.pets|M\.petCount|pruneWildPool|startWildFight|numericIdOfWild|mapPets|mapWildFight|mapWild\b|drawLabels|lctx|getElementById\('lbl'\)` 在 `game/app/**` + `game/logic/**` 内**只剩本批的 ★MDB11 注释**）；分层 = 本批不碰 L3（已知 1 处历史违规 `view/battle/restartFighterStage.js:10` **非本批、不顺手改**）、`wander.js` 仍零 DOM / 零 fetch；零 `game/core/**` 改动 ⇒ **不跑** `build-core.mjs`；`game/index.html` **import map 零增项**（只删一行 CSS）；`session.js` 一行未改。

**停点 → ✅ 已结账**：**§8.27** 手测通过（人类 2026-10-21「全部测试通过」= 一揽子通过，**未逐条拆分回报**；人类手测为主 = 决议 ⑦）。

> 🔗 **后继 = `MDB12`（同日，2026-10-21）**：本批定的是「**分布**只剩 Unity 这一套」；`MDB12` 只换**上屏素材**（Flash 帧包优先 / 重启 PNG 兜底），**本批口径原样不动** ⇒ as-built **§7.3.34** / 手测 **§8.28**。

#### 7.3.34 MDB12 as-built（2026-10-21）—— **野怪素材改取 Flash 帧包**（`swf/pet/normal/<n>.swf`，JS 侧解包；分布逻辑仍 100% 吃重启 `<npc><wild>`）

**触发**：人类 2026-10-21 的新点名 ——「**野怪分布按照重启设定，但野怪素材能否还是取自 swf？而不是重启的 png？**」。`MDB11`（§7.3.33）把**分布**收成单一 Unity 真值；本批**只动"画的是哪张图"**，**不动**「在哪、怎么动、打谁」。四条拍板（AskUserQuestion，人类亲答）：**① 技术路线 = JS 自己解帧包**（复用现成 L1 `parsePack`，画在既有 `#npc` 叠加层 ⇒ **不碰 `game/maprunner/**`、不重编译 AS3、零 Ruffle 新用法**）；**② 取包力度 = 现在抓那 34 个缺的包**（2.3 MB，产物入库）；**③ 绘制尺寸 = 帧包原生像素**（**不吃**重启声明的 `<npc @size>`）；**④ 动画档位 = 走/站两态 + 左右镜像**（不做 `personal`）。

**立足点（三条实测事实）**：
1. **`swf/pet/normal/<n>.swf` 不是 Flash 影片，是帧序列包** —— 头两字节 = 16 位长度（**不是** `FWS/CWS`），内嵌一张 PNG spritesheet，**与小赛尔部件包同一容器** ⇒ 现成的 L1 `game/logic/map/actor-view.js:54 parsePack()` 直接能解（样本实测：`10` = 30×33 / anchor 11,38 / 120 帧；`13` = 28×31 / 13,30 / 94 帧；`119` = 133×104 / 28,91 / 165 帧；`228` = 29×41 / 9,40 / 184 帧）。
2. **id 桥早已存在、无需新表**：野怪写的是 `<npc resId="Pets/pet/20.png">`（20 = 重启**形象 id**）⇒ `game/data/pet_appearance_swf.csv`（1,016 行 `appearance_id,swf_seq,name`）⇒ **L2 唯一入口** `CONTENT.swfIdOf(id)`（`game/app/content.js:153`，其注释里写死的语义正是"不在表里 / 显式 0 ⇒ `null` ⇒ 上层回退重启 png"）。
3. **此前画在地图上的 PNG 其实是宠物立绘、不是地图 sprite**：`Pets/pet/20.png` = **111×124**、`240.png`（海特尔）= **736×980**、`119.png` = **500×573**，被 `size="48,54"` 的框硬缩 ⇒ 糊；帧包的 `frameW×frameH`（28×31 那一类）才是 Flash 时代地图上那只小精灵。

**A 批 · 素材抓取（人类点名 ②）**：
- **A-1** 用**既有**工具（不新增脚本）：`node tools/fetch-pet-normal.mjs --ids="18 20 26 28 33 35 40 41 54 64 69 72 88 114 122 124 128 138 141 195 199 200 203 204 209 210 213 240 254 268 295 403 705 884" --budget=40` ⇒ **落盘 34 / 404 0 / 失败 0**；目录 `swf/pet/normal/`（**已被 git 跟踪**）从 **48 → 82** 个包（**4.7 MB**）。
- **A-2 逐个 `parsePack` 审计**（inline `node -e`，产物不留文件）⇒ **38 个在用的包全部可解、零抛**；数字见下「实测数」。
- **A-3**：无抓取失败 ⇒ 没有落回 PNG 支路的"缺包"怪（`err` 支路仍留作 dev 路径异常时的兜底）。

**B 批 · 新 L1 `game/logic/map/pet-view.js`（纯换算，零 DOM / 零 fetch / 不改写 `pack`）**：
| # | 导出 | 职责（真值指针） |
|---|---|---|
| B-1 | `PET_LABEL_ALIAS`（`:31`） | 动作 → 标签别名表（**实测 6 个包用中文词** ⇒ 别名表是**必须**、不是可选）：`walkDown:[walkDown,正面走路,正面走,跑步,走]` / `walkUp:[walkUp,背面走,背面走路,背面跑]` / `standDown:[standDown,正面待机,站立,待机]` / `standUp:[standUp,背面待机,背面站立,背面站]` |
| B-2 | `resolveLabel(pack,action)`（`:66`） | 兜底链 = ① 本动作别名 → ② **同族另一朝向** → ③ **另一族**（走↔站）→ ④ 包内第一个可用标签 → ⑤ `{1,totalFrames}`；**永不抛**（照 AS3 `WildPet.as:189-202` "取不到就退 `STAND_DOWN`"）。内部 `normalizeLabels`（`:40`）把标签键 **`trim`** ⇒ 治 `209`/`213` 的 `背面走路␣`（**带尾空格**），归一化词表进模块内 `WeakMap`、**不写回 `pack`**（保持纯函数语义） |
| B-3 | `petFrame(pack,action,tick)`（`:96`） | 区间内**循环**取帧号（= AS3 `update:274-291` 的 `curIdx++` / 越界回 `start`）；不复用 `actor-view` 的 `cycleFrame`（那个带 actor 专属的 `standFrame=25` 兜底语义） |
| B-4 | `petAction(moving,up)`（`:91`） | `walkUp/walkDown/standUp/standDown` 四选一（= AS3 `stepWalk:316-333`；**上游只有上下两套包 ⇒ 左右只靠镜像**）。⚠️ `up` 由 L4 **按 Unity「y 向上」**算好传入（= AS3 舞台 `dy<-1` 的等价式） |
| B-5 | `petHitRect(pack)`（`:109`） | `{ax,ay,w,h} = {anchorX/frameW, anchorY/frameH, frameW, frameH}`（**原生像素** = 人类 ③）⇒ 命中面 = 上游 `drawHot:351-360` 的"整格热区"；`pack` 非法 ⇒ `null`（L4 退 PNG） |
| B-6 | `petDrawShift(pack,rec)`（`:118`） | `{dx,dy} = {rec.ox-anchorX, rec.oy-anchorY}`（= AS3 `render:345-346`）；镜像由 L4 用 `translate+scale(±1,1)` 完成 |

**复用**（不复制数学）：`ACTOR_VIEW.parsePack`（`:54`）/ `pickFrame`（`:96`）/ `frameRect`（`:109`）—— L1→L1 同层 import 已有先例（`logic/map/dialog-host.js:20` import `./entity.js`）。

**C 批 · L1 `game/logic/map/npc-art.js`**：
- **C-1** 新导出 `petAppearanceId(npc)`（`:50`）—— `resIdKind === 'path'` 且形如 `Pets/pet/<数字>`（**`.png` 可有可无**：`10022` 那 14 条 `visual="animation"` 就**不带扩展名**）⇒ 返回数字；其余 ⇒ `null`。**判据在 L4 只问 `wild` 的 NPC** ⇒ 普通 NPC 一律碰不到帧包通路。
- **C-2** `npcArtUrl` / `npcSizeInStage` / `NPC_ANCHOR` / `talkImageUrl` **一字未改**（PNG 支路与气泡仍归它们）。

**D 批 · L4 `game/app/scenes/mapScene.js` 接线**：
| # | 处（当前行号）| 改了什么 |
|---|---|---|
| D-1 | `:64` import 块 | `import * as PET_VIEW from '../../logic/map/pet-view.js'` ⇒ **相对路径、无新裸依赖 ⇒ `game/index.html` import map 零增项** |
| D-2 | `:188-191` | `PET_CACHE = new Map()`（键 = `swfId`，值 `{state:'loading'\|'ok'\|'err', pack, bitmap}`）+ `const PET_FPS = 12`（**人眼校常量**，与 `NPC_ANCHOR`/`LOOK_SCALE`/`flipY` 同族，`AGENTS §4.10`）；缓存口径照 `NPC_CACHE`/`TALK_CACHE` = **按素材键、跨图复用**（"地图不缓存"只针对地图；`:1969` 卸载只递增 `npcGen`、不清素材缓存） |
| D-3 | `:1171 ensurePetPack(swfId)` | `fetch('/swf/pet/normal/<n>.swf')` → `parsePack` → `createImageBitmap(Blob([pack.png]))`；`!r.ok` / 解析抛 ⇒ `state='err'` + **每 id 一行日志**（`logLookOnce('petpack:'+id, …)`，不刷屏）；到位后 `gen === npcGen` 守卫下 `draw()` 补画 —— ⚠️ **两条路都补**（SWF 路没有怪挪动时不重绘 ⇒ 不补画就永远不露脸），这是与 `ensureNpcSprite`（`onload` 时**仅 JS 路**补画）的唯一差别 |
| D-4 | `:1111-1116` NPC 投位循环 | **支路顺序 = 帧包优先**：`petHitOf(n,x,y)` 非空 ⇒ `M.npcHit.push(pet)` + `continue`；**否则原 PNG 支路逐字节不变**（`loading`/`err`/无 `swf` 桥/非 wild 全落这里 ⇒ 画面不会空一格）。⚠️ **顺序要紧**：帧包命中时**不去起 PNG 的 fetch**（否则白拉一张用不到的立绘） |
| D-5 | `:1199 petHitOf()` | 判据链 = `n.wild` → `petAppearanceId` → `CONTENT.swfIdOf`（**L2 唯一入口**，不在桥表 ⇒ `null`）→ `ensurePetPack(seq).state==='ok'` → `petHitRect` 合法。动画态挂 `n._pet = {tick:0, acc:0, flip:1, up:false}`（**L4 私有装饰**，与 `_wander`/`_talk` 同列；`_wander` 是 L1 纯态 ⇒ **不往里塞画的东西**）；`phase==='move'` ⇒ `moving` ⇒ `walk*`，`idle` ⇒ `stand*`；方向 = `target-pos`，`up = dy>0`（Unity y 向上）、`dx≠0 ⇒ flip = dx<0 ? -1 : 1`，**0.01 死区 + 最后一次方向保持**（照 AS3 `stepWalk:329-331`） |
| D-6 | `:1232 drawPetFrame()` + `:1264` | 帧包项：`ctx.save(); translate(h.x,h.y); scale(h.pet.flip,1); drawImage(bitmap, 源矩形, dx, dy, rec.w, rec.h); restore()`（源矩形 = `frameRect`、偏移 = `petDrawShift`）；`rec.w<=1 \|\| rec.h<=1` ⇒ 跳画（`actor-view.js:96` 那条 1×1「隐藏」裁帧口径）。**镜像等价式已核**：AS3 `x = flip*(ox-anchorX)` ≡ canvas `scale(flip,1)` 后画在 `ox-anchorX`（`flip=±1` 两向都等）|
| D-7 | `:1252-1276 drawNpcs` | 命中/标注矩形从"全体共用 `NPC_ANCHOR`"改成**每项自带** `ax/ay`（`const ax = h.ax ?? anch.ax`）⇒ 帧包项 = 锚点命中、PNG 项 = 左下角命中，**同一个数组、同一套点击代码、不新增数组、不改优先级链**；名字与气泡的几何（顶边 `y-ay*h`、中心 `x-ax*w+w/2`）**两遍绘制逻辑不改** |
| D-8 | `:1415 onSwfNpcCapture` + `:2358 jsClick` | 同上：两处命中矩形都改成 `s.ax ?? anch.ax` / `s.ay ?? anch.ay` ⇒ 帧包野怪的点击面 = 上游"整格热区"、PNG 野怪不变 |
| D-9 | `:96 M.npcHit` 声明注释 | **顺带更正一条旧注释**：原文写"**仅 JS 路** … SWF 路恒空"，但 B3 §7.1 起 SWF 路同样投 `npcHit`（`:1415` 就在读它）⇒ 改成本批口径（**两路都投 + 帧包/PNG 两项 + 每项自带 `ax/ay`**）；`:2349` 上方那句"SWF 路两数组恒空"同批更正 |

**E 批 · SWF 路的成本闸（`MDB11` 那道闸扩一句）**：
- **E-1** `stepWanderLoop():2480-2487`：旧判据 = "**这帧真有怪挪动才 `draw()`**"；加了走/站循环后**驻停也在换帧** ⇒ 判据扩成「**怪挪动 或 帧号变了**」。每怪 `tick` 用累加器推进（`p.acc += dt*PET_FPS/1000`，整数部分进 `p.tick`），**只有 tick 真的跳了一格**才算"帧变" ⇒ 待机重绘上限 ≈ **12 Hz**（从 `MDB11` 的 **0 Hz** 变 12 Hz；移动时仍 60 Hz）。⚠️ tick 段**独立于 `_wander` 循环**遍历 `M.npcs` ⇒ 同图的 3 只 `stationary` 帧包怪也拿得到 tick（若整图**只有** `stationary` 怪 ⇒ 环不起 ⇒ 它们画**站立首帧**，登记为已知边界）。
- **E-2** `startTalkLoop`（气泡环）**不动** —— 它本来就只在气泡跳变帧 `draw()`。
- **E-3** JS 路无影响（`stepJs` 每帧 `draw()` ⇒ 帧包动画天然顺帧跑，实际仍受 12Hz 的 tick 推进约束）。

**实测数（本批新增，同步落 `docs/map/map-move.md §3.4`）**：
- **覆盖面（110 只野怪 / 53 张图）**：包**已在盘且已入库** = **10 只 / 4 种 / 4 图**（`121`/`131`/`407`/`409`，全 SWF 路）；包缺、官服**抓得到** = **70 只 / 34 种 / 34 图**（30 张 SWF / 4 张 JS，34/34 逐个 HEAD = **HTTP 200**，合计 **2,325,139 字节 ≈ 2.3 MB**）；**无 Flash 对应物** = **30 只 / 15 种 / 15 图**（8 张 SWF / 7 张 JS，全在 `10015…10043` 段 ⇒ 桥表 id 只到 **2999**、**零条 10xxx**）⇒ 抓完 = **80 只 / 38 张图走帧包**、**30 只 / 15 张图走 PNG**；**混源图 = 0**（没有一张图混用两种来源 ⇒ 手测可整图判定）。
- **38 个在用包的标签审计**：**32 个**四个英文标签齐全；**6 个**要别名表 —— `64`=`正面走路`、`114`=`跑步/站立/背面跑`（+英文 `standUp`）、`195`=`背面走`、`209`/`213`=`背面走路␣`（**尾空格**）、`228`=`正面待机/背面待机` ⇒ 8 个 distinct 中文词、`PET_LABEL_ALIAS` 全覆盖。
- **尺寸范围**：`frameW` **28–231**、`frameH` **28–224**、`anchorX` **9–181**、`anchorY` **26–220**；`walk` 区间跨度 **9–59** 帧、`stand` **8–60** 帧。别名解析后的区间样本：`114` ⇒ `walkDown 1-10 / standDown 11-27 / walkUp 28-37 / standUp 38-54`；`209` ⇒ `walkUp 40-60`（由 `背面走路␣` 命中）。
- **`<wild @visual>` 是死数据（登记、不吃）**：实测 **裸 93 + `animation` 14 + `embedded` 3 = 110**；上游 `NpcInfo.cs:116` 只**声明**、**全仓零消费者**（该词在上游 `Assets/Scripts/**` 里仅此一处），桥接层 `game/logic/map/parse-map.js:107 wildOf()` 把它**原样透传成 `wild.visual`（缺省 `'auto'`）但下游没人读** ⇒ 本批**不据它分流**（⚠️ 计划里写的"不透传"**不准确、此处已更正**：**透传了、只是零消费**）。

**与计划的偏差 / 如实登记的边界（八条）**：
① **计划原写"只有 2 个中文标签（`正面待机/背面待机`）"** ⇒ A-2 实测 = **6 个包 / 8 个 distinct 词 / 且带尾空格** ⇒ 别名表加宽 + `normalizeLabels` 做 `trim`（**不是**按计划那 4 条）；
② **`PET_FPS` = 我们自己的常数**——上游 AS3 是"每舞台帧进一格"（`WildPet.as:274-291`），**我们不复刻舞台帧率**（那是 AS3 的事），故 `12` 为人眼校项、**不是**从包头的帧率读出来的（曾尝试读 SWF 头，解析出的数不可信 ⇒ 放弃、不写进代码）；
③ **脚下阴影 / `personal` / 惊讶特效 / `Lv` 黄脚标 = 四条"不做"**（人类 ④ + 本批只做"素材来源"这一件事）；上游 `addShadow:169-187` 借 `UI_ActorShadow` 压暗 + `scale = frameW/40`，canvas 侧要 `ctx.filter` ⇒ 属另一格人眼校，想要就单开一批；
    ⚠️ **本条的"不做"已被 ★`MDB13`（同日 2026-10-21 人类点名"接下来做野怪的 4 条"）逐条取代** ⇒ 四件**都做了**，as-built **§7.3.35** / 手测 **§8.29**（"想要就单开一批"那一格照兑现：单开的就是 `MDB13`；实际**没用** `ctx.filter`，改成**一次性离屏预渲染剪影**）。
④ **原生像素 ⇒ 大小不一**（`119` 那种 133×104 会比角色还高）且 **JS 回退图底图缩放时 sprite 不随缩放** = **人眼校族**（`AGENTS §4.10`）⇒ 不满意改 `PET_FPS` / 加统一倍率，**不改回** Unity `size`（人类 ③ 已拍板）；
⑤ **`bobPhase` 仍零消费者**（本批不接，照 `MDB11` 登记）；
⑥ **分布 / 漫游 / 点击 / 战斗 = 一字未改**：`<npc><wild>` ⇒ `seedWander`/`stepWander` ⇒ `onNpcClick → resolve→run → startMapBattle`；`MDB11` 的口径（单一来源、219 张空图不伪造）**原样保持**；
⑦ **`Resources/Pets/pet/*.png` 未入库**（`.gitignore:25`）而 `swf/pet/normal/**` **已入库** ⇒ 本批之后 **38/53** 张图的野怪美术变成**可克隆、可复现**（旧账 **ASG8** 同族的资产来源不对称，登记在 `docs/asset-inventory.md`）；
⑧ **计划里"`<wild @visual>` 桥接层不透传"一句不准确、本批更正**：`game/logic/map/parse-map.js:107 wildOf()` **把它原样透传成 `wild.visual`**（缺省 `'auto'`）⇒ 死数据的准确说法是 **"透传了、但全仓零消费者"**（上游 `Assets/Scripts/**` 里该词仅 `NpcInfo.cs:116` 那一处声明；我们侧 `mapScene.js`/`entity.js`/`npc-art.js` grep 零命中）。**结论不变**（本批不据它分流），登记落 `docs/map/map-npc.md §6`。

**门禁（静态自检，不替代手测）**：`node --check`（ESM 副本）= **`pet-view.js` / `npc-art.js` / `mapScene.js` 3/3 过**；`pet-view.js` **零 DOM / 零 fetch**（fetch 全在 L4，与 `wander.js`/`talk.js` 同规）；**82 个包逐个 `parsePack` 不抛** + 在用 38 包的四动作区间解析**零异常**；分层 = 本批不碰 L3（已知 1 处历史违规 `view/battle/restartFighterStage.js:10` **非本批、不顺手改**）；零 `game/core/**` ⇒ **不跑** `build-core.mjs`；零 `game/maprunner/**` ⇒ **不重编译**（`mapRunner.swf` 保持 ★M9 的工作区状态、不碰不提交）；`game/index.html` **零改动**；`session.js` **一行未改**；`game/legacy/**` 不动。

**停点 → ✅ 已结账**：**§8.28** 手测通过（人类 2026-10-21「全部测试通过」= 一揽子通过，**未逐条拆分回报**；人类手测为主 = 决议 ⑦）。

#### 7.3.35 ★MDB13 as-built（2026-10-21）—— **野怪四件细节：脚下阴影 / `personal` 待机小动作 / 惊讶特效 / `Lv` 等级脚标**（`AGENTS §4.19` 那四条 ❌ 一次补齐）

**触发**：人类 2026-10-21 点名 ——「**接下来做野怪的 4 条：脚下阴影、待机小动作、惊讶特效、等级脚注**」。这四条**正是** `MDB12`（§7.3.34）交付时逐条登记为"**不做**"的那四条（`AGENTS §4.19` 的 ❌ 清单 + 本份 `§7.3.34` 偏差③）⇒ 本批 = **把禁令改写成已做**，语义**照抄**上游 `game/maprunner/WildPet.as`（**只读、零改动、不重编译**）。

**四条拍板（AskUserQuestion，人类亲答 ⇒ 原文落 `AGENTS §4.19`）**：
① 惊讶特效 = **「点了先播完再开战」**（≈0.8 s 后才 `onNpcClick`）；
② 等级脚标 = **「整串移到脚下、撤头顶名」**（**只野怪**；非野怪 NPC 的头顶名**一字不动**）；
③ `personal` = **「每次驻停播一次」**（走→停的跳变帧播一次 ⇒ **有意偏离**上游"久站才播"）；
④ 节奏 = **「四件一起落完再测」**（四个本地提交、中途不逐件停测 ⇒ 手测合并成一份 **§8.29**）。

**落码四批 = 四个本地提交**（顺序照依赖：先几何、后行为）：`-a` `c9a5ce8` / `-b` `e0f082f` / `-c` `3a2600a` / `-d` **本提交**（**文档随 `-d` 一次落全**，含 `AGENTS §4.19` 的禁令改写 = 拍板 ④ 的"中途不停"）。
⚠️ **`-d` 的提交归属如实登记**（人类 2026-10-21 期间并行线所致）：`-d` 的**代码主体**（`MARK_TOP_PAD`/`petMarkTop` + `drawPetMark`/`petClick`/`startMarkLoop` 环 + 两处 `npcHit` 载荷 + 点击改道）**当时已进暂存区，被并线的 `00bac48`（petbag idle 那笔，非本线）连暂存区一起卷走** ⇒ 故 **`-d` 实际 = `00bac48`（代码主体）+ 本提交**（本提交 = 全部文档 + `stopMarkLoop()` 的收口修补：停环时**同时摘掉** `mark`/`frozen` 并归零 `markLastTs`，否则那只怪会**永久吞点击**（`petClick` 的 `n._frozen` 闸在前、环却已不再推进））。

**批 `-a` · 脚下阴影（只帧包支路）**
- **L1 `game/logic/map/pet-view.js`**：`SHADOW_BASE_W = 40`（上游 `addShadow:183` 的 `scale = frameW/40` 那个分母）+ `petShadowScale(petPack)`（非法包 ⇒ `1`，不猜）。⚠️ 计划里另写的 `petShadowShift(pack, rec)` **未新增**：它与既有 `petDrawShift:118` 是**同一条** `ox-anchorX / oy-anchorY` 式子 ⇒ **直接复用**，不在 L1 留第二份同形数学。
- **L4 `game/app/scenes/mapScene.js`**：新增 `lookSharedOf(packName)`（**同步查 + 后台起装**：键 = `assetKeyOf({source:'naked',pack,suffix:''})` ⇒ 与**玩家角色同一份** `LOOK_PARTS` 缓存，角色已装过阴影包时野怪**零额外 fetch**；未装过 ⇒ 复用 M8 的 `loadLookAsset`（`naked` 支路**不需要装备清单**）+ `npcGen` 守卫后补画；失败 ⇒ `logLookOnce` 一行 + `LOOK_SHARED_STARTED` **不再重试**（防 `draw()` 每帧拉 fetch））。
- **剪影 = 一次性离屏预渲染**（`shadowSilhouette(entry)`：离屏 canvas 画 `localShadowFrame` 首帧 + `globalCompositeOperation='source-atop'` 填黑 ⇒ 结果缓在共享包条目 `entry.sil` 上、**82 包共用一张**）—— 计划原话"逐帧 `ctx.filter` 太贵"在实现里兑现成这条；帧号恒取 `local`（= 第 1 帧），**不吃 `vip` 3–39 的光轮**（与 M8-b2 第二轮修补 `ALC14` 完全同口径）。
- **`drawPetShadow(ctx, h)`**：`translate(h.x,h.y)` + `scale(s,s)` + `globalAlpha = SHADOW_ALPHA(0.45)`（= 上游 `ColorTransform(0,0,0,.45)` 的等价物）；调用点在 `drawPetFrame` **之前**、且在 `flip` 变换**之外** ⇒ **镜像时阴影不跟着翻**（上游 `addShadow` 没有 `scaleX=flip` 那一步，对照 `ActorView.as:136-138` 才镜像）。
- **支路边界**：只给**帧包野怪**。PNG 支路的尺寸来自重启 `<npc @size>`、锚点与帧包**不同族** ⇒ 不硬套（这条"不做"**保留**在 `AGENTS §4.19`）。

**批 `-b` · `personal` 待机小动作（只帧包支路）**
- **L1**：`PET_PERSONAL_ALIAS = ['personal','free']` + `personalRange(pack)` + `petFrameOnce(range, tick, maxFrames) -> {frame, done}`。⚠️ **`personalRange` 只查本族、无兜底**（与 `resolveLabel:66` 的五级兜底恰好相反）：缺标签 ⇒ `null` ⇒ **不播** —— 把"待机小动作"退化成"原地走路循环"是**画错**、不是降级。
- **实测（一次性内联，不落脚本）**：82 个包 **81 只带字面 `personal`**，唯一缺件 = `114.swf`、它的同义段叫 **`free`（55–119）** ⇒ 别名表把它兜住 ⇒ **覆盖 82/82**（在用的 38 包自然全覆盖）。段跨度 **4 帧（`20`）– 233 帧（`122`）** ⇒ **58/82 只超上限被截**；不截的话最长那几只按 `PET_FPS=12` 要播 ≈19 s。
- **L4**：`n._pet` 增 `{pRange, pStart, wasMoving}`（`pStart = -1` = 未播）。**触发** = `petHitOf` 里 `moving` 由真变假的那一帧（= 走→停**跳变**，拍板 ③）⇒ 置 `pRange` + `pStart = p.tick`；**帧号**在 `drawPetFrame` 用 `tick - pStart` 取，`done` ⇒ 当场摘 `pRange` ⇒ 下一格自然回站立循环（照上游 `update:283-286`）。
- **不另开时钟**：推进寄生在 `stepWanderLoop` **已有的 `PET_FPS` 累加器**上（`p.tick` 本就每 12 Hz 进一格）⇒ 脏闸 `frameChanged` 自动带上，SWF 路不多画一帧。
- **边界（如实登记）**：① `moving` 是在**绘制时**求的 ⇒ SWF 路的起播至多晚一格（≈83 ms，肉眼不可见）；② `mode="stationary"` 那 3 只**从不** `moving=true` ⇒ **永不触发** `personal`（它们没走过 ⇒ 与"每次驻停播一次"的语义一致，不是漏接）；③ 打包局 `personal` 与 `standDown/standUp` 的**朝向族**无关（段内不上下分家，实测包头即如此）。

**批 `-c` · `Lv` 等级脚标移到脚下 + 撤野怪头顶名（两条支路都盖）**
- **L1**：`petLevel(n)`（**`<battle>` 敌方首只 `level`** → 名字里的 `^Lv\s*(\d+)` → `null`）+ `petLabelText(n)` = `Lv{等级|???} {剥掉 Lv 前缀的名字}`（上游 `SpawnedPet` 的 `"Lv"+level+" "+name` + `UNDER_FEET`；`level` 缺 ⇒ `Lv???` = 上游 `level==0` 口径）。⚠️ **先剥前缀**是必需的：`<npc name>` 里本来就写着 `Lv13 奇鲁`，照公式直接拼会写出 **`Lv13 Lv13 奇鲁`**。
- **L4 `M.npcHit` 的两个 push 点都补载荷**（帧包项 + PNG 项）：`wild: true` + `lvText`。⚠️ **字段名不许叫 `label`** —— 帧包项的 `label` 已是动画标签（`walkDown`…，被 `drawPetFrame` 消费）⇒ 撞名会画错帧。
- **画法**：`cx` = sprite 几何中心、基线 `by = (h.y - ay*h.h + h.h) + LV_LBL_DY(13)`；**金字 `LV_LBL_COLOR='#CC9900'` + 白描边 `LV_LBL_LW=2`** = 上游 `LabelRenderer.setLabelStyle(13395456, 16777215)`（`docs/legacy/web-client-notes.md:192-194`）⇒ 与头顶名的"黑描边 3px"是**两套**，别混。`h.wild ⇒` **跳过整段头顶名**（拍板 ②）；非 wild 分支**逐字节未动**。
- **实测（等级真值）**：`<wild>` 的 NPC **112 只**（`active=false` 2 只 ⇒ 上屏 110）、**112 只全有** `<pet level>`（`parse-map.js:126 bossOf` 经 `entity.js:197` 透传成 `n.battles[]`）、**111 只**名字自带 `LvNN ` 前缀；**名级不一致 4 处** = `133.xml` 的荧光蝶 3 只（名 `Lv10/11/12` ⇔ `level=8/9/10`）+ `408` 的多利（名 `Lv70` ⇔ `level=14`）⇒ 脚标**以 `<battle>` 为准**（= 与**打到的等级必然一致**，`MDB11` 的口径）⇒ 这 4 处观感**会变**、已写进 §8.29 第 3 条（**预期、不是 bug**）。
- **计划里那条"连带项"实测不成立 ⇒ 取消**：计划担心撤掉头顶名会把 MDB10 的气泡基线带崩（要另加一个 `LV_NAME_RESTORE` 常数把人眼校回来）。核对 `drawNpcs` 第二遍：气泡基线 `ny` **一直**是从 **sprite 顶边**算的（`h.y - ay*h.h - 3 + namePos.y`），**从不依赖头顶名** ⇒ **撤名不影响气泡位置** ⇒ 该常数**不作落地**（人眼校清单少一项）。

**批 `-d` · 惊讶特效 + 点击播完再开战（两条支路都盖）**
- **L1**：`MARK_TOP_PAD = 20` + `petMarkTop(height) = -height + 20`（上游 `playSurpriseEffect:227`；`height` = 该支路**实际显示高度** ⇒ 帧包项吃包帧格高、PNG 项吃缩放宽，**两条路都能挂**）；偏移复用 `petDrawShift`（计划写的 `markShift(rec, pack)` 与它同式 ⇒ 不另写）。
- **L4 素材**：`lookSharedOf('UI_SurpriseMark')`（实测 **23 帧** / 61×68 / anchor (35,66)）。**态挂在野怪本体**：`n._mark = {ms, frames}` + `n._frozen` ⇒ **所有野怪都有**（**不挂 `n._pet`**，那只有帧包怪才有）；`M.npcHit` 两个 push 点带 `mark`。
- **`petClick(id)` = 野怪点击的唯一入口**（三处改造：`jsClick` 的 sprite 命中、`jsClick` 的占位橙点、`onSwfNpcCapture`）：非野怪 ⇒ **逐字节透传** `onNpcClick`（行为不变）；野怪 ⇒ `n._frozen` 已置就**吞重复点**（上游 `onClick:204-212` 的 `frozen` + `stopImmediatePropagation`），否则起标记 + **站定**（`n._wander.phase = 'idle'` = 上游 `stopAction()` 的 `walking=false`）+ 起环 + `draw()`。
- **`drawPetMark(ctx,h)`**：`markFrameOf(ms) = 1 + ⌊ms·PET_MARK_FPS/1000⌋`、**原生像素、不镜像、不缩放**（上游 `mark` 挂在容器上、容器不吃 `scaleX=flip`）、画在 **sprite 之上、气泡之下**。
- **环 = `startMarkLoop`/`stepMarkLoop`/`stopMarkLoop`（独立 rAF，形状照 `startTalkLoop`：无活动标记 ⇒ 不起环、播完自停）**。**为什么不寄生漫游环**：`stepWanderLoop` 只在图里有 `_wander` 者时才转，而 `stationary` 那 3 只与 PNG 支路的野怪**也得能播**（播完还得能开战）。`PET_MARK_FPS = 30` 是我们自己的常数（同 `PET_FPS` 一族、**不复刻舞台帧率**）⇒ 23 帧 ≈ **0.77 s**。
- **末帧才开战**：`f > frames` ⇒ 摘 `mark`/`frozen` ⇒ **这时**才 `onNpcClick(id,'click')`（走同一台 `resolve→run → startMapBattle:§7.3.10`，**不另开通路**）。⚠️ **`requestAnimationFrame` 的排期写在触发之前**：`onNpcClick` 会导航 → `unmount` → `stopMarkLoop`，两行反过来写会把刚停掉的环又点亮。
- **取消（不留挂账）**：`leaveJsMode()` 里 `stopMarkLoop()`（`unmount()` 经它）⇒ **同时摘掉全部 `mark`/`frozen`**；只停环不清态会留下一只"**点不动的怪**"（`_frozen` 闸在前、环已不再推进）。
- **未就绪不延迟**：`UI_SurpriseMark` 尚未装载 ⇒ **直接** `onNpcClick`、**不伪造一段空等**（⇒ 首次进图可能看不到「!」，第二次起就有；该包与玩家角色共享缓存）。✅ **人类 2026-10-21「test ok」未提出异议 ⇒ 本条从"待确认的取舍"升为已确认的本线行为**。
- **两条有意偏离上游**（登记进 `AGENTS §4.19`）：① `personal` 的**触发时机**（上游 `checkIdleState:293-299` 是"久站才播"，我们 = 每次驻停播一次，拍板 ③）；② **不复刻"叫角色走过来"**（上游 `actorMoveClose:248-254` 的 ±20 px 取点 + 角色跑过去）⇒ 我们的点击一直是"点了就打"，本批只加"先播特效"，要走过去 = **另开一批**。⚠️ `mapWantWalk`/`walkReached` 那条 AS3 协议**仍在**（`MDB11` 口径 = 不动它），但 `wild: ''` ⇒ 上游永远不会发起它。

**两条素材顶替**（官服 **404** ⇒ 借小赛尔同款，同 `MDB12` 的顶替口径；台账 = `docs/asset-inventory.md`）：`UI_PetShadow.swf` → **`game/data/actor/UI_ActorShadow.bin`**；`UI_FightSuprise.swf` → **`game/data/actor/UI_SurpriseMark.bin`**。⇒ **零新素材、零抓取**（两个 `.bin` 早已在库、由 M8 的装载路带起来）。

**人眼校常数（`AGENTS §4.10` 同族；`-a`/`-b`/`-c`/`-d` 各自的文件顶部注释都写了"偏了只调这里"）**：
`SHADOW_BASE_W = 40`（阴影整体大小）· `SHADOW_ALPHA = 0.45`（浓淡）· `PERSONAL_MAX = 48`（≈4 s @12 Hz，驻停小动作时长上限）· `LV_LBL_DY = 13`（脚标离脚底）· `LV_LBL_LW = 2` + `LV_LBL_COLOR = '#CC9900'`（描边粗细 / 字色）· `MARK_TOP_PAD = 20`（「!」高低）· `PET_MARK_FPS = 30`（「!」快慢 = 同时是**开战延迟**）。`PET_FPS = 12` **不动**；计划里的 `LV_NAME_RESTORE` **取消**（理由见批 `-c`）。

**门禁（静态自检，不替代手测）**：`node --check`（ESM 副本）= **`pet-view.js` / `mapScene.js` 2/2 过**（本批无新文件）；`pet-view.js` **零 DOM / 零 fetch**（fetch 全在 L4）；分层 = 本批不碰 L3、不碰 `game/core/**` ⇒ **不跑** `build-core.mjs`；**零 `game/maprunner/**` 改动 ⇒ 不重编译**（`WildPet.as` 继续**只当语义真值读**、`mapRunner.swf` 保持 ★M9 的工作区状态、不碰不提交）；`game/index.html` **零改动**（无新裸依赖）；`session.js` **一行未改**；**不新增、不为验收跑任何脚本**（决议 ⑦）⇒ 本批唯一的"跑" = 写码时用**一次性内联** `node -e` 读 82 包的 `personal/free` 区间与两张共享包的包头（**不落脚本文件、不入库**）。

**停点（拍板 ④）**：四件代码 + 文档全部落完 ⇒ **请人测 §8.29 的 1–7**；中途**不逐件停测** ⇒ 本批**四个提交连发**、手测清单**合并成一份**。
✅ **同日已结账**：人类回 **「test ok」**（一揽子通过、未逐条拆分）⇒ **`§8.29` 通过、MDB13 全线收口**，本线**当前无待测项** ⇒ 下一步 = **等人类点名新任务**（"叫角色走过来"`actorMoveClose` / PNG 支路阴影 / 前景遮挡穿帮 / `content_mc` 烘焙怪 = **仍是登记项、没据此开工**）。

---

## 8. 请人测（`AGENTS.md §1.1`：**主验收 = 人类把游戏跑起来手测 + 反馈**）

> ⚠️ **AI 不新写测试脚本、不为验收去跑既有脚本**（决议 ⑦ 的加严）。以下是**"请人测什么、看哪里"**的合并清单
> （来源 = `docs/map/map-data.md §7.3` · `map-npc.md §7.3` · `map-condition.md §7.3` · `map-dialog.md §7.3` ·
> `map-teleport.md §7.3` · `map-battle-trigger.md §7.3` · `map-move.md §7.3`）。
> 手测入口：`node tools/serve.mjs` → **硬刷新** → `#/title` → 开始 → `#/login` → 选档 → `#/map?slot=N`。

### 8.1 MB1 · 对账体检（**不用玩游戏，先跑对账工具**）—— ✅ **已落码，下面是"实测 vs 期望"**

> 一键复算：`node tools/map-audit.mjs`（读全库 272 张跑**同一份**解析器，日志直接打印下表；**只读、不产产物**）。
> ⚠️ **本节的数字全部已对账通过（2026-10-18）**；标 ❌ 的两条是**口径差**、不是错，见各行说明。
> ⚠️ **方案 C 起**：这些数字**不在页面里**（运行时只解析"当前那张图"）—— 它们是**离线判据**（人手动跑）。

1. **条数对账**：记录 **272** ✅、**负 id 恰 26** ✅、图 `100` 的 `npcs` **2** 条（`10001` 斯力普 / `10002` 空名野怪）✅、`teleports` **3** 条（→ `90`/`151`/`101`）✅。
   ⚠️ `<npc>` 总数：**解析口径 604**、grep 口径 640 —— 差的 **36 条全在注释里**（D11 弃之，**不是漏解析**）。
2. **注释没被当真数据**：任一图的 `npcs` 里**不该出现**被注释掉的实体 ✅（解析 604 vs grep 640 即证；`swf/map/config/100.xml` 里那个被注释的 `158` 也不在任何记录里）。
3. **只读审计数字**：`portal-inbound-none` = **95** ✅、`portal-isolated` = **54** ✅；`invalid-switch` = **1**（`71`）✅。
   三类光口畸形（同图重复 `@id` / 空 `@name` / `targetMapId` 悬空）**全 0** ✅。
   对不上 ⇒ 十有八九是**注释没剥**或只抓了自闭合 `<teleport .../>` 一种形态（`docs/map/map-teleport.md §2.6`）。
4. **缺素材路径**：进一张 `swfOk=false` 的图 ⇒ 走 B3 的 `mapFail`"缺图"路径，**不白屏、不卡"载入中…"**。
   样本（102 张里挑）：`-131`（荆棘小徑夜版）/ `-10` / `-10010` / `-1160` / `-1270`。
   ⚠️ 顺带核两个"回退命中"的数：① Unity `resId` **4** / ② AS3 `<resource url>` **134** / ③ `<id>.swf` **32** —— **② 的 134 应与 MQ2 的"134 张有本地 swf"相等**。
5. **七类实体别被"顺手实现"**：进含 `<pond>`/`<animal>` 的图 ⇒ 数据查得到（实测各 **30** / **15** 条），但**画面上不出现牧场玩法**（`MDI6`）。
   ⚠️ 含这两类的图只有 **1 张**，所以这条今天基本测不到 —— **别记死账**（`docs/arch-code.md §1.1`：出局的是子系统、不是地图）。
6. **`battles[]` / `winHandler` 记账** —— ⚠️ **改挂 MB7**（理由见 §7.3.1 偏差 ①：那两条要对 action 的 `param` 做引用扫描，踩 MDI10 的分水岭）。
   MB7 落地时再核 `battle-action-dangling` = **8**（全 `hell`）、`battle-branch-unreferenced` = **154**（含 **147** 数字）。**MB1 不产这两条**（不记死账、也不假装跑了）。
7. **`<wild>` 与换算（MB9 的前置数据面）**：`<wild>` **110 条 / 53 图** ✅、`wander 107 / stationary 3`；`talk.self` = **image 2,682 / text 838**（⚠️ 这组数**订正了 M7 §2.8 的 2,788/732**，见 §7.3.1 的表）。
   ⇒ 请人**只看分布是否与"火炎贝那张图（`10015`）的野怪有一串表情+台词"这种直观印象一致**；换算（`fx=ux/960`）**不在桥里做**（MB9/B3 表现层做）。

### 8.2 MB5 · 传送回归 + 出生点（**最需要人眼判断的一条**）

1. **光口回归**：`#/map` 图 `100`「信奉广场」的两个出口悬浮说明仍为 **`草系主城` / `水仙草界`**（**出口名，不是目标图名**，`MP8`）→
   点一个 → **走过去 → 抵达才切图**（`TPI1`）→ 新图**站在出生点**（`TPI2`）。
2. ⚠️ **出生点是否合理**（**`TPQ1` 不嫁接 AS3 落点的代价**）：连续传 3–4 张图，看角色是否**总落在出生点、偶尔离出口很远** ⇒
   **这条最需要人眼判断能不能接受**；若不可接受，重开 `TPQ1`（不是改数据，而是**另立决议**给 Unity 血统补一列自定义 `spawn`）。
3. **昼夜按钮**（落地后）：进 `131.xml`（有 `switch`）→ 顶栏出现那颗按钮 → 点它到 **`-131`「荆棘小徑」夜版**；再点回白天。
   ⚠️ **同时测一张没 `switch` 的图**（如 `100`）⇒ 期望**按钮不出现**。⚠️ 记一条**行为差异**：镜像**不是**"换滤镜"，是**换一张图**。
4. **梦境图**：`-139`「荆棘林梦境」/`-209`「幻彩珊瑚梦境」**没有日夜按钮**；回场走**自己的光口**（`-139` → `-131`、`-209` → `-203`）⇒ 请人**从梦境图点光口回夜版**，确认这条链通。
   ⚠️ **进梦境**那条链要等 **MB6/MB4**（唯一入边是夜版图上的 NPC `teleport` 动作）—— **别记成死账**。
5. **`50000`「小屋」**：`990`「普兰特山脚」的光口「基地」→ `50000` 应**正常进图**（`TPQ3`：不查活动、不弹"暂未开放"）；小屋里的光口（→ `-70`）也要能走。
6. **不可达光口**（`TPC3`）：找一张光口落在障碍区的图 ⇒ 期望**不切图**、给"走不过去"的反馈。测不到 ⇒ 由声明兜住，**不记死账**。
7. **入口不是光口的那批**（`TPI9`）：从 `10012` 这类场景包图**用 NPC 动作进出** ⇒ 要等 **MB6/MB4**；今天**只核数**（§8.1 第 3 条）。
8. **过场不串档**（回归）：`#/map?slot=1` 遇怪 → 打完回图 ⇒ 仍是**同一张图、同一 1 号档**（HUD 昵称/等级/金币一致）。

### 8.3 MB3 · 条件门

> ⚠️ **2026-10-18 起本节的前置说明**：`condition.ts` **已落码**，但**条件门要"点 NPC"才响** ——
> "点 NPC" 需要 **MB4（动作）** 与 **MB5（接线）** ⇒ **本节各条都要等 MB5**（含第 2 条：日志也只有在"点得到那个 NPC"时才产生）。
> **今天唯一能跑的是 §8.1 的对账工具**（它不碰条件求值）。
> 日志出口 = `condition-host.js` 送出的 `log.unknown`（默认落 `console.warn`，前缀 `[map/condition]`）。

1. **不满足点了没反应**（父文档 §8 第 3 条）：一张带 `<condition>` 的图 ⇒ 条件不满足时**点了没反应**，满足时才有动作。
2. **`1190.xml` 那条恒真分支**（`CSC6`）：行为与"永远隐藏 `119001`"一致（上游即如此），且日志出现一条 `unknown-key: active`。
3. **键值袋真的通（人类 2026-10-18 拍板 ①）**：找一条 `winHandler` 里带 `setActivity` 的胜场（或任一 `activity[…]` 条件门）⇒ 打赢后**存档里出现该 activity 的 `<entry><key><value>`**（可用文本编辑器看 `saves/save<N>.xml`），**再点那个 NPC ⇒ 条件这次为真**（发放/开对话）。
   ⚠️ 这是**本条拍板最值得先看的一条**（它解掉 `winHandler` 里 132 条 `getPet` 被条件挡住的问题）。
4. **存档不被条件污染**（`CSC3`）：点若干带 `activity` 条件的 NPC 后，存档里**只含真正被 `setActivity` 写过的活动**，**没有**"只被读过就冒出来"的空条目（我们读**纯读**，不照搬上游 `Activity.Find` 的"顺手建档"）。
5. **`bool` 条件**（`CSC7`）：`activity[door].done[bool]…` 的门 ⇒ 满足才放行；若数据里 `bool` + `LTE`（畸形）⇒ **加载日志报错**而不是静默相等。
6. **进化链条件**（`CSC12`）：背包**有/没有** `10010` 链上的宠各测一次 ⇒ 前者不触发、后者触发（易错点：`baseId[N]` 是"链上"，不是"id 等于"）。
7. **`10017` 的铺路门**（`CSQ3`，父文档 MC 族的活样本）：铺**两块**路 → 进进化对话；**一块** → 出提示盒；**一块都不铺** ⇒
   ⚠️ **上游"点了毫无反应"**，**我们改判后应出提示盒** ⇒ **这条要人眼看**。
8. **未落地的臂**（`CSI4`）：遇 `mission` / `yite_rogue` / `plant.` 条件 ⇒ **不崩、不弹错**，NPC 不响应且日志有一条 `unknown`。

### 8.4 MB4 · 18 动作

> ⚠️ **2026-10-18 起本节的前置说明**：`action.ts` + `action-runner.js` **已落码**（as-built §7.3.5），但**决议要"点得到 NPC"才有面** ——
> 而"点 NPC → `resolve` → `run`"的**接线在 MB5**；今天各接缝（A3/C2/道具/D6/E6/M5/MB6）**多数还没有消费者** ⇒ 本节各条**都要等 MB5 接线**。
> **今天唯一能跑的是 §8.1 的对账工具**（它不碰动作）。日志出口 = `action-runner.js` 的 `log`（默认落 `console.warn`，前缀 `[map/action]`）。

1. **`auto` 的时机**（`MDB2-c`）：`100.xml` 的 `10002` 野怪 ⇒ **反复进出图 100**，看它是否按 `random[new]LTE5` **有的次出现有的次不出现**（**不许**每次都一样、也不许崩）。
2. **A 组"记账不实现"**（父文档 §8 第 6 条）：遇 `setMission` / `miniGame` / `player` / `fish` ⇒ **不崩、不卡住**，只多一条"未实现"日志。
   ⚠️ **例外 = `setActivity`**（人类 2026-10-18 拍板 ①）：它**写一次键值袋**（+ 日志），**不做活动玩法** ⇒ 测它时看的是**存档里多没多那条 `<entry>`**（见 §8.3 第 3 条）。
3. **畸形参数**（`MNI6`）：在测试档写一个 `<param>active</param>`（无 `=`）⇒ **不崩**、日志一条登记。
4. **HUD / 面板**：`openHintbox` / `openPanel` 出来的盒子/面板内容与数据一致（中文**不出方框**，`MP4`）。

### 8.5 MB6 · 对话 ✅ **已落码可测**（触发 = 控制台 `window.onNpcClick(npcId,'click')`，NPC 未上屏）

⚠️ **MB6 已落**（as-built §7.3.9）⇒ 本节**现在可人测**；但 NPC 不上屏 ⇒ 用调试口 `onNpcClick` 驱动，弹的是 L4 自绘**最小对话浮层**（正式排版归 A3）。

1. **进一张有 `<dialog>` 的图**（建议 `10017.xml` 火山星深处）⇒ 对白中文**不出方框 / 不缺字**（`MP4`）。
2. **翻页**：选"我带来了！"之类 ⇒ 换 branch，确认**无栈**（点背景不回到上一屏 —— 224 个多选项分支上游本来也回不去）。
3. **关不掉的对话**：找一条"117 条"中的单选项对话 ⇒ 确认人测接受"**只能顺着选项走**"（`DLQ4`）。
4. **附挂出路**：`10003.xml` 扭蛋那条（`item>0` 抽 / 附挂 `item=0` 提示）⇒ **一个按钮、两种出路**成立；且**道具数为 0 时按钮仍显示**（可见性 = OR ≠ false）。
5. **可见性改动**（`DLQ5`，**唯一行为改动面**）：找一条**所有出路都不满足**的选项 ⇒ 期望**不出现**（上游会出现但点了没反应）—— **这条最需要人眼确认**。
6. **`{expr:}`**：`10693.xml` 的 `feather` 一条 ⇒ 文本里 4 个数字与背包一致；背包变化后**重开对话**数字更新，但**同一次打开内不抖动**（`DLI6`）。
7. **悬空引用**（2 条）：`-404.xml` 的 `not_enough`、`50019.xml` 的 `mission_6_dream_11` ⇒ 期望**对话不关、日志出现 `missingBranch`**（上游是对话直接被关掉）。
8. **战斗后再入**：打完 `10017.xml` 的 Boss ⇒ `default_lose` / `winHandler` 里的 `openDialog` 正常开屏。

### 8.6 MB7 · 地图战斗触发 ✅ **已落码可测**（触发 = `onNpcClick`；复用 `#/rbattle` 单敌遭遇）

⚠️ **MB7 已落**（as-built §7.3.10）⇒ 开战 / 回图 / 胜负链**现在可人测**；但今天只吃**单敌遭遇** ⇒ **第 3 条"板凳敌方宠"依赖多宠战斗规格 = 等 E6**（本批如实登记，不算本批失败）。

> 📝 **`MDB11`（2026-10-21）与本节的关系（别误读成结账）**：本批把**野怪遭遇的数据源**收成唯一一条 Unity 真值路（`<npc><wild>` + `<battle>`，经 `onNpcClick → resolve→run → startMapBattle` = **就是 MB7 这台机**）⇒ 手测 **§8.27** 会**顺带**给出「**SWF 面点 canvas 野怪直接开战**」的观测机会（旧合成路在 SWF 面是 AS3 自己那套，测不到这一格）。⚠️ 但 §8.27 **不等于 §8.6 整条结账** —— 本节的 8 条（`test` 三只 / `winHandler` 道具 / 板凳敌方宠 / 战斗外读结果 / 硬胜 vs 逃-win / 随机信道 / `@simulate`）仍按原口径等人逐条确认。

1. **先打通 `test` 三只**（`docs/map/map-battle-trigger.md §2.15`）：`2`（NPC `201`）/ `-2`（`-201`）/ `540`（`54001`）⇒ 能不能进去、能不能回图、回图后状态有没有变。
2. **战后链第一条真图**：挑一条 `winHandler` 里带 `setItem` 的普通野怪分支（`10012`–`10043` 那批最多）⇒ 打赢后**道具进包 + 提示盒文案**；
   再打一次用**逃跑**结束（`OpEscape`）⇒ **同一支 `winHandler` 也应跑**（`BTI8`）。
3. **板凳敌方宠**（`BTQ3`，**最值得先看**）：`403`「Lv105 九尾冰狐」`@count=6` 而 `<enemy>` 写了 **9** 只 ⇒ 看敌方是否真出现 **9** 只、换人节奏是否合理。
4. **战斗外读结果**（`BTQ1`，`BTI9` 唯一能被人观测的用例）：`50004`「异蘑世界」NPC `12106`「油民」⇒ 先抓一只指定宠（`capturePet.id = 10`），再点它 ⇒
   两条选项（`=10` / `≠10`）按捕获结果**正确分流**。
5. **硬胜 vs 逃-win 的分叉**（`BTI8`）：`121`「Lv1 法拉★」/ `131`「Lv5 小小葵★」那批 ⇒ 分别用"打倒"和"对面跑了"结束 ⇒ **奖励只在前者**。
6. **随机信道**（`BTC7`）：找一条 `random[...]` 条件的 NPC ⇒ 连续两次"**先打一架、再来点它**" ⇒ 结果**不应**随战斗次数漂移。
7. **`hell` 悬空那 8 处**（`BTC8`）：**不作为手测用例**（上游点了就是没反应），由 §8.1 第 6 条的日志数字兜住。
8. **`@simulate` 那 33 条**：挑 `-2`「-201」的 `default` ⇒ **打完血不扣、经验不给、不落盘**（关游戏重开应当什么都没变）。

### 8.7 MB8 · 移动 / 几何 / 寻路 ⏸ **（搁置：随通行面拍板 ② 不发码）**

1. **点地面走动**：进 `990`「普兰特山脚」⇒ 角色**绕开遮挡**走到、**抵达停下**；★**不同帧率下速度一致**（`MWI6` 的唯一可观测面）。
2. **点光口换图**（`MP5`）：点光口 → **走过去才切图**；**路过 / 中途点别处不触发**。
3. **不可达点 / 不可达光口**（`MWC4`，★**与上游行为最容易看出差别的一条**）：**不瞬移**、给"走不过去"的反馈（上游会一步直达）。
4. **栅格极性核对**（`MWQ1`，★**不改码**）：`node tools/grid-truth.mjs` 的 **46.8%** 在修复 `game/swfshape.mjs` 的"不读填充 alpha"后是否降到 **≈ 0%**
   —— 降了 ⇒ 极性本来是对的、锅在光栅化；不降 ⇒ 极性真反了（`USE_GRID` 不能开）。⚠️ 本项**只须复核一个数字**，由**人类**决定何时跑（决议 ⑦：AI 不新写、不为验收去跑）。
5. **点野怪开战**：点野怪 → 角色**走到脚下** → 开战（~~复现现役 AS3 行为~~）。⚠️ **"复现现役 AS3 行为"这半句已被 `MDB11` 作废**（2026-10-21）：AS3 `WildPet` 那条"走到脚下才开战"的合成路**已断粮**（`wild: ''` ⇒ 零生成）⇒ 现在点**我们 `#npc` 叠加层**上的野怪 = **直接进** `onNpcClick → resolve→run → startMapBattle`（不绕角色走位），等级/怪物吃该 NPC 的 `<battle>` ⇒ as-built **§7.3.33** / 手测 **§8.27**。本条其余四项仍随 MB8 ⏸ 搁置。

### 8.8 MB9 · 漫游 NPC（✅ **照做 · 已落码 2026-10-19**；通行面判断恒真 ⇒ **等人手测**）

> ⚠️ **本批实际范围**（as-built **§7.3.11**）：只 **JS 回退图**（`swfOk===false`，`10015`–`10083` 一批）给野怪叠游荡；**SWF 路不叠**（MapRunner 自己溜达）。**气泡 = 文本已做、图像未做** —— ~~`Resources/emoji/toon` 盘上为空、图像气泡缺素材~~【**2026-10-21 更正**：素材**在盘且已入库** = `Assets/StaticResources/Sprites/Map/talk bubble/emoji/toon/` 24 png（正本 `map-move.md:319/:324`、`map-actor-look §5.7 ④`、as-built **§7.3.30**）⇒ 未做的原因是**运行时还没接这条读取路**，不是缺素材】⇒ **登记为后批**；**野怪驻停时按 `chance` 会冒文字气泡**（手测第 2 条）。⚠️ **2026-10-21 `MDB10` 已把"图像未做"这一格接上**（两条渲染路都出、图与文同池均匀）⇒ 本条第 2 项的"只文字"口径不再成立，测图像气泡请看 **§8.26**（as-built **§7.3.32**）。
> ⚠️ **口径更正二（`MDB11`，人类 2026-10-21 点名 ③）**：上面第一句"**只 JS 回退图**给野怪叠游荡；**SWF 路不叠**（MapRunner 自己溜达）"**已被取代** = 漫游**两条路都走**（JS 回退图 + 有 swf 映射的图都由 JS 播态；SWF 路只在"这帧真有怪挪动"才重绘）。同批还把**第二套野怪**（AS3 `WildPet` + 我方合成 `wild.json`）**断粮** ⇒ 新判据 = **§8.27**、as-built = **§7.3.33**。本条第 1 项写的"**53 张**有 `<wild>` 的 **JS 图**"也**不精确**（实测 = 53 张图里 **42 张走 SWF / 11 张走 JS**）⇒ MB9 当时真正能游荡的只有那 **11** 张。

1. **野怪漫游**：进 **53 张**有 `<wild>` 的 JS 图之一（`10017` 赤甲虫 Lv26/27 等）⇒ 野怪在 `radius` 内来回走、**会停**（待机）、**不走出镜头**；朝向随左右翻。
2. **文本气泡**：同一批图 ⇒ 野怪**驻停时**按 `chance`/`interval` 冒出**文字气泡**（`self` 表的 `{text}`），显示 `duration` 秒后淡出、超 30 字截断。⚠️ **图像气泡本批不做**（~~`emoji/toon` 缺素材~~【2026-10-21 更正：素材在盘 = `StaticResources/Sprites/Map/talk bubble/emoji/toon/` 24 png，只是**运行时未接**】⇒ `self` 里 `image` 项跳过；只带 image 的野怪不出气泡）。**〔2026-10-21 `MDB10` 已接 ⇒ 本项"只文字"的判据作废，新判据 = §8.26〕**
3. **卡住不死循环**（`MWC9`）：把角色挤到野怪的目标点上 ⇒ 野怪**重新选目标**，**不抖动、不卡死**（⚠️ 本批无碰撞 ⇒ 角色与野怪可以重叠，这是**预期**）。
4. ⚠️ **一条要人眼确认的观感**：野怪**可能穿过墙/遮挡**（因为"哪里都能走"）；**看的是**是否影响观感 —— 觉得别扭就说一声，再谈"给野怪也接通行面"（`MB8`）。

### 8.9 分流反转 · 背景默认 Unity PNG（✅ **已落码可测 2026-10-19**；as-built §7.3.13）

1. **默认路**：进一张**原本有 SWF 画面**的图（如 `990`「普兰特山脚」、`104`）⇒ 期望 = **Unity `Resources/Maps/bg` PNG 静帧底图 + 小赛尔 sprite + 光口可点**，**不是** Ruffle/`MapRunner` 画面（下拉不再触发热重载 SWF）。
2. **功能面**：在同一批图上走一遍**真流程** ⇒ 走动、点光口传送、点 NPC 对话/开战、野怪漫游气泡 —— 都应照常（JS 路覆盖面从 102 张扩到全部，逻辑未改）。
3. **注明才回 SWF**：把某图 id 加进 `game/app/scenes/mapScene.js` 的 `SWF_ANNOTATED_IDS` ⇒ 该图应**回到原 MapRunner 画面**（逐字节同旧）；再把不存在的图（`swfOk===false`）注明 ⇒ 日志出现「注明采用 swf 但无可玩 SWF，退回 Unity PNG 路」、不黑屏。
4. **观感代价确认**：未注明的图**没有 SWF 动态场景/遮罩/网格走位**（= 点名的默认，代价已在 §7.3.13 登记）—— 哪些图**必须**回 SWF 画面，请人类点名进名单。

### 8.10 MB10 · 记录最后所在的房间（✅ **已落码可测 2026-10-19**；as-built §7.3.14）

> 症状（人类 2026-10-19 报障）：打完一场 ⇒ 回图落到**出生点**，不是刚才打的那间屋子。
> 走法：进一张 **JS 图**（默认通路，随便哪张，如 `10017`「火山星深处」）⇒ **点画面上的野怪**开战 ⇒ 打完（胜 / 逃 / 打输）⇒ 看 `#log` 里的 `⚔` 行与回图落点。

1. **回原房间**：在 `10017` 点野怪开战 ⇒ 打赢 ⇒ 回图应**还在 `10017`**（背景是火山那张、坐标还接近刚才那只怪），**不是** `70`「传送室」、也不是 `1`「监狱」。
2. **回原位置**：同一场打**胜**与打**逃**各一次 ⇒ 两次回图都应站在**刚才点怪的位置附近**（不必再从房间入口重跑一趟）。
3. **点 NPC 开战也一样**（另一条开工路径）：找带 `<battle>` 的 NPC（如 `10017` 的怪 NPC 或 `50004`）⇒ 鼠标点它 → 对话里点「战斗」⇒ 打赢 ⇒ 应回**同一张图 + 同一位置**。
4. **战后链仍然接得上**（回归 · **BTQ1**）：打**带 `winHandler`** 的遭遇（如 `10012`–`10043` 那批）⇒ 打赢后**道具要进包**、提示要出 ⇒ 说明回图仍落在同图（`runPostBattleChain` 的同图判定没被本批打断）。
5. **换房间不该串**：打完 → 回图 → **立刻走光口传去别的图** → 确认不报错、`#log` 无异常；再从新图开战回图 ⇒ 应回**新图**（`lastMapId` 跟着换，不许回上一间）。
6. **手敲路由也认**（开发捷径）：`#/map?slot=0&map=10017` ⇒ 直接进那张 JS 图（从前会被丢回下拉首项）；敲个不存在的 `map=999999` ⇒ 日志一行「目标地图无 Unity 记录」+ 退回下拉当前项、**不黑屏**。
7. **光口传送不受影响**（回归）：`990`→「基地」→`50000` ⇒ 新图仍站**房间出生点**（`spawn ?? init` 原口径没动）。
8. ⚠️ **不入档（预期）**：打完关掉浏览器重开 ⇒ 从**进游戏的第一张图**起步 —— 房间号是**会话态**（同上游 `Player` 单例，不写进 `saves/saveN.xml`）。要持久化房间号请另立决议。

### 8.11 M8-a · 装备/坐骑数据桥（✅ **已落码 · ✅ 人类 2026-10-20 手测通过**；as-built §7.3.15）

> ✅ **手测结论（2026-10-20）**：3 组计划与下列期望一致，人类回复**“目前一切正常”** ⇒ 本批通过，转 `MDB8-b`。

> ⚠️ **本批不改画面** —— 角色还是现在的样子；下面看的是**控制台里打印的外观计划**对不对（真正换装/骑乘 = `MDB8-b/c`）。
> 走法：`node tools/serve.mjs` → **硬刷新** → 进任意一张地图（如 `#/map?slot=0&map=10017`）→ 打开浏览器控制台 → 敲 **`await APP.actorLook.dump()`**。

1. **能打印 3 组**：① 裸装（蓝）② `equipVec=[100577]`（头）③ `mountEquipId=101020`（坐骑）；每组 = 一张逐层表 + 一行摘要。
2. **① 裸装**：展开成 **7 层**（手/脚各主件 + 镜像），`signature=down|0|100001,100003,100004,100005,100006|0`，每层 `status=ok`（仓库 `game/data/actor/*.bin` 都在）。
3. **② 头装**：头那层应变成 `refId=100577 / resourceId=120301 / pack=120301 / source=equip`、`status=ok`（改服缓存里已有该包）；`signature=down|0|100577,100003,100004,100005,100006|0`（自定义头**原位替换**默认头，其余 4 件不动）。
4. **③ 坐骑**：摘要行应为 `mount=101020/136403 offsetY=-50 hiddenSlots=[2,6,9,10] speedFactor=1.25 float=N`；多出 `DOGZ_RIGHT`（`136403_0`）与 `DOGZ_LEFT`（`136403_1`）两层，二者 `status=missing`（本机缓存还没采这两个包 —— **缺件是预期**，本批不补）。
5. **缓存只读路由**（顺手核一条）：控制台 `fetch('/game-cache/res/item/equip/swf/120301.swf',{method:'HEAD'}).then(r=>r.status)` ⇒ `200`；把文件名换成 `136403_0.swf` ⇒ `404`（未缓存）。⚠️ 这两条只证明"缓存路由通"，不证明包内容可用。
6. **画面不变**（本批验收的一部分）：进图、走动、点光口、点 NPC/野怪 —— 行为与本批之前**一致**，角色**不会**变装（渲染 = 下一批）。
7. **报错排查**：若第 1 条提示 `equip-index 未加载` ⇒ 看控制台是否有 `[content] loadEquipIndex 失败`（多半是没经 `tools/serve.mjs` 打开，`/game/data/equip-index.json` 取不到）。

### 8.12 地图黑边 bug 修复（✅ **已落码可测 2026-10-20**；as-built §7.3.16）

> 症状（人类 2026-10-20 报障）：§4.16 翻回 swf 优先后，部分 SWF 图渲染后一边露黑边（黄金之路 canvas 右黑 / webgl 左缺）；上游原版无此边。
> 走法：node tools/serve.mjs → 硬刷新 → 进一张**有 swf 的图**（黄金之路 = map 360，下拉选或路由 #/map?slot=0&map=360）。

1. **黄金之路铺满**：左右都不裁、不空、不黑边；地图 1200×700 比舞台高 40px，按上游口径上下各露/裁一点（可接受）。
2. **正常图回归**：抽 1 张一直正常的 SWF 图（如 10001 传送仓）⇒ 画面/走位/光口/NPC 与本批前一致（相机 offset 0 对满舞台图 = 原位，无变化）。
3. **窄图按上游**：抽 1 张窄图（size_mc 宽 < 1200，如 10024/1042/1170）⇒ 现按上游**左对齐（offset 0）**，右侧可能有空（= 上游行为）；确认你可接受（若要窄图也铺满，是偏离上游的额外决策，另议）。
4. **功能回归**：在黄金之路走一圈 —— 点光口传送、点 NPC 对话/开战、点野怪开战、走位点击落点准确（相机归位后点击/传送坐标应对得上）。
5. **诊断日志**（可选）：#log 里该图进图时有一行 mapExtent content=x,y 宽x高（黄金之路 ≈ content=0,-20 1200x700），与上游口径互证。

### 8.13 M8-b · JS 路 11 槽渲染（✅ **已落码可测 2026-10-20**；as-built §7.3.17）

> **本批才第一次改画面**：JS 回退图（`map_swf.csv` 里无 swf 映射的图，如 `1010`/`50000`）的角色从“固定 7 件裸装”升级为“按外观计划 11 槽合成”。
> 走法：`node tools/serve.mjs` → **硬刷新** → 进一张 JS 图 → 控制台用 `await APP.actorLook.preview({...})` 套用外观（`clear()` 还原）。
> ⚠️ `preview` 是**b 批手测钩子**（不写盘、不改会话态）；正式换装/骑乘入口 = `MDB8-c` 的 `equip/unequip/ride/unride`（**已落**，见 §3.10.4 / §7.3.20）。
> ⚠️ 先确认这行日志：`[actorLook] preview: down|...`；缺包会打 `外观缺包（signature）: …`（`MDB8-e` 起**每签名一行**；此前旧版本是“每包一行”）。

1. **裸装回归（必测）**：进 JS 图 ⇒ 蓝/红裸装、阴影、位置与 `MDB8-a` 前**逐像素一致**；走动/点光口/点 NPC/点野怪行为不变。
2. **穿头**：`await APP.actorLook.preview({equipVec:[100577]})`（射手守护头盔，资源 `120301`）⇒ 头顶换成头盔，**不遮眼/不悬空**；`await APP.actorLook.clear()` 回默认头。
3. **穿一套（层序）**：`preview({equipVec:[100577,100578,100580,100579,100581]})`（头/弓/战靴/腰带/翅膀）⇒
   - 左右手/脚**成对出现**（`_0` 主件 + `_1` 镜像）；翅膀在**最底层**（朝下），腰带在身体层，头盔压在眼之上；
   - 顺序与 `map-actor-look.md §6.2` 的朝下深度表一致；没有某件被另一件整块盖掉。
4. **缺包不崩 / 编号陷阱**：`preview({equipVec:[100102]})`（物品“巨星头盔”，资源 `102701` **未缓存**）⇒
   头该槽退**默认头** + 一行 `外观缺包（…）: HEAD 102701(fallback)`（`MDB8-e` 后的日志格式），**不能**误取同号的包 `100102`（那是蓝色手部）；画面不崩、可继续走。
5. **坐骑（视觉态）**：`preview({mountEquipId:100582})`（星空追猎者，资源 `120403` **已缓存**）⇒ 角色整体抬起约 50px、**双手双脚消失**、影子留地面；`clear()` 后恢复。
6. **坐骑缺包（M8-I2）**：`preview({mountEquipId:101020})`（迈巴赫，资源 `136403` **未缓存**）⇒ **不抬起、不藏手脚** + 一行 `坐骑包未就绪，按未骑乘绘制`；不允许出现“角色浮空、坐骑空白”。
7. **换色回归**：`preview({color:'RED'})` ⇒ 红色裸装（手/身/脚换红）；`clear()` 后回 `avSel` 当前色。⚠️ 其他 10 色默认装缺包 ⇒ 会退蓝/红裸装（预期，`MDB8-e` 补素材，不算本批缺陷）。
8. **SWF 图不变（本批围栏）**：进一张有 swf 的图（如 `10017`）⇒ 角色仍是黄点 + 原 SWF 裸装角色，**不叠 canvas 角色**（b 批口径；f 起有装备/坐骑时会叠层，见 §8.18）。
9. **报错排查**：若 `preview` 返回 `未就绪` ⇒ 看控制台是否有 `[content] loadEquipIndex/loadActorManifest 失败`（多半是没经 `tools/serve.mjs`）。
10. **`/game-cache/…` 404**：该路由是 M8-b 新增，**旧 serve 进程不认**（无软链接、无需额外映射，直接读 `~/.cache/seer2-live/game-cache`）。若浏览器报 `GET /game-cache/http_seer2.61.com/... 404`，先重启 `serve.mjs`（`ps -eo lstart,args | grep serve.mjs` 核对进程启动时间晚于 `tools/serve.mjs` 的修改时间），再硬刷新。

### 8.14 M8-b2 · 帧动画 + 4 向（✅ **已落码可测 2026-10-20**；as-built §7.3.18；含同日两轮修补 + `b3` 地面特效切换，as-built §7.3.19）

> **本批让 JS 图的小赛尔动起来**：站立 24fps 循环、点地走播 `run`、朝上换层序、左右只翻转、停下保留朝向。**动画自动播放，不用敲 `preview`**。
> ⚠️ 第二轮修补后：**装备层站立为静姿**（射箭等展示动作不循环）、**默认脚下为普通阴影**（不再夹 vip 光轮）；第 15 条可手动切光轮（`b3`）。
> 走法同 §8.13：`node tools/serve.mjs` → **硬刷新** → 进一张 **JS 图**（如 `1010`/`50000`）；已开着的旧页先确认 `serve` 是重启后的进程。

1. **站立循环（必测）**：进 JS 图、不做任何操作 ⇒ 角色按 24fps 播站立循环，默认朝下朝右。⚠️ **裸装 idle 的可见动效 = 眼睛每圈（41 帧 ≈ 1.7s）眨一次**（`UI_DEFAULT_EYE` key 43/45/47/49），身体/头/手/脚在该区间是静态图 —— 这是**素材原样**，不是丢帧；**骑坐骑后坐骑 idle 连续播**（装备层站立为静姿）。
2. **走位 `run` + 水平翻转**：点地图**左侧**空地 ⇒ **整个角色（身体 + 头 + 手 + 脚 + 装备 + 坐骑 + 影子）一起水平镜像**朝左跑，播的是 `runDown`；到位后**保持朝左站立**。再点右侧 ⇒ 整体翻回朝右。
3. **上下方向**：点**上方**空地 ⇒ 角色播放 `runUp`、并按**朝上层序**绘制（翅膀/腰带/头盔的前后关系与朝下时不同）；点**下方** ⇒ `runDown`。纯垂直移动时角色仍朝右（与上游 `PathMobile` 一致）。
4. **层序回归（穿一套走）**：`await APP.actorLook.preview({equipVec:[100577,100578,100580,100579,100581]})` ⇒ **站立时装备层为静姿**（裸装体/眼照常，弓不射箭，见第 14 条）；走位时 `run` 各层按同一 tick 播放；朝上/朝下走位时层序分别按 `UP_ORDER`/`DOWN_ORDER`，**没有部件错帧、错位或被整块盖掉**。
5. **全套同期 + 坐骑 idle 连续（必测，2026-10-20 修补点）**：一次调用 `preview({equipVec:[100577,100578,100580,100579,100581], mountEquipId:100582})`（坐骑资源 `120403`，idle = 25–60 共 36 帧）⇒ 坐着不动时**坐骑的 idle 一圈接一圈连续播、圈间没有明显冻结/停顿**；裸装 BODY（25–65，静态）与装备层（静姿）不干涉坐骑。走位时各层按同一 tick 各自的 `run` 区间播放（run 全部 1–12/13–24 ⇒ 看起来同步）；**不要求不同区间的层显示同一个帧号**。手脚因骑乘隐藏、影子留地面（**恒为普通阴影，见第 13 条**）。坐骑**上下浮动** = `MDB8-d`（§8.16），本批原地不动是预期。
6. **停下/起步的相位**：站立动画走到一半时点地 ⇒ 立即切到 `run` 且**从 run 的起始帧**播；到位切回 `stand` ⇒ 从站立起始帧播（不复用半截相位）。
7. **换色/缺包回归**：`preview({color:'RED'})` ⇒ 红色裸装同样会动；`preview({equipVec:[100102]})` 仍按 §8.13 第 4 条退默认头并打日志，动画不受影响。
8. **SWF 图不变（围栏）**：进有 swf 的图（如 `10017`）⇒ 画面/走位/NPC 与 b 批前一致（本批只动 JS 路 `drawActor`，SWF 路零改动）。
9. **性能观感**：JS 图**静置也会按 24fps 重绘整张图**（背景 + NPC 一起）⇒ 若明显卡顿/发热，请反馈机器与图号；这是本批的已知代价。
10. **排查**：若角色不动 ⇒ 看控制台是否有 `外观缺包（…）: BODY …`（`BODY` 缺包时 `LOOK.ready=false`，动画循环不启动）；若只有站立、走位不播 `run` ⇒ 确认点的是 `#ov` 画布内的空地、且没被 `#rv`/NPC 命中。
11. **修补复测 A（idle 停顿）**：`preview({equipVec:[100577,100578,100580,100579,100581], mountEquipId:100582})` ⇒ 站立不动观察 **10 秒以上**：坐骑 idle 应**连续循环**（每圈约 1.5s），**不再出现「动一圈 → 冻住约 1.5s → 再动」**。若仍有停顿，请记录是哪个部件（坐骑/身体/头/手/脚）以及是否在裸装下也停顿。
12. **修补复测 B（朝左翻转）**：点角色**左侧**空地 ⇒ 角色**整体**（含坐骑、装备、阴影）水平镜像；到位站立仍保持镜像。再点右侧 ⇒ 整体翻回。若某个部件方向相反/位置不对，请指出部件名（尤其坐骑左右两半）。
13. **修补复测 C（光轮/阴影，2026-10-20 第二轮）**：穿全套 + 骑 `100582`，站立观察脚下 **10 秒以上** ⇒ 应**始终是同一个普通灰色阴影**，不出现黄色旋转光轮、也不在「光轮 ↔ 阴影」之间闪烁切换；走位时阴影跟着角色，不抖不闪。
14. **修补复测 D（套装站立不射箭，2026-10-20 第二轮）**：`preview({equipVec:[100577,100578,100580,100579,100581]})`（不骑坐骑）⇒ 站立时 **弓保持举弓待机姿势**，**不自动拉弦/放箭/出箭迹**；点地走位 ⇒ `run` 正常播放；到位 ⇒ 回举弓静姿。`clear()` 后恢复裸装。
15. **光轮切换（`MDB8-b3`，2026-10-20 第三轮）**：`APP.actorLook.ground('halo')` ⇒ 脚下出现**黄色光轮**，**连续旋转、不夹阴影**；角色照常播自己的 idle（裸装/坐骑/装备层互不打断）。`ground('shadow')` ⇒ 回静止灰影。穿套装和骑坐骑各试一次。
    ⚠️ **穿射手套装时阴影可能看不见**：弓的待机帧自带大片青色弧光、画在角色层，会盖住脚下小阴影；骑乘抬起 50px 才露出来。切光轮后光轮较大，通常能从弧光边缘看到——这不是阴影丢失。
16. **光轮生命周期（`MDB8-b3`）**：光轮状态下点地走位/停下/转向 ⇒ 光轮**不跳回第一帧、不闪回阴影**（自己的时钟不随角色标签归零）；`clear()` ⇒ 回裸装 + 阴影；换图/刷新 ⇒ 回默认阴影（不写盘、不改会话态）。

### 8.15 M8-c · 会话态 + 调试入口（✅ **已落码可测 2026-10-20**；as-built §7.3.20）

> **本批把外观从「临时 preview」换成会话态**：`equip/unequip/ride/unride/color` 改的是 `session`，**换图回图保持**；
> 但**仍不写盘**（刷新/关浏览器回裸装 = 预期，`MDB8-g` 才落盘）。走法同 §8.14：`serve.mjs` → 硬刷新 → 进 JS 图。
> 参数一律是**物品 ID**（如 `100577`），不是资源标识（`120301`）。

1. **穿/换/卸**：`await APP.actorLook.equip(100577)` ⇒ 头盔上屏且日志 `equip: 100577 …`；
   再依次 `equip(100578)`（弓）/`equip(100580)`（靴）/`equip(100579)`（腰带）/`equip(100581)`（翅膀）⇒ 成套；
   **同槽换一件**（再 `equip(100577)` 或换另一件头盔）⇒ 不叠加、不残留；`unequip(100578)` ⇒ 弓消失、默认手回来。
2. **骑乘**：`await APP.actorLook.ride(100582)` ⇒ 抬起/藏手脚/坐骑 idle 连续；`unride()` ⇒ 恢复；
   骑乘中再 `equip(...)` ⇒ 改动仍生效、手脚保持隐藏。
3. **非法参数（不崩、不改状态）**：`equip(101020)` ⇒ 日志「是坐骑（slot 3），请用 ride()」；
   `ride(100577)` ⇒ 日志「不是坐骑」；`equip(99999999)` / 未穿时 `unequip(100577)` ⇒ 各一行日志、画面不变。
4. **切图保持（本批关键）**：穿一套 + 骑乘 ⇒ 点光口/换图再回来 ⇒ 外观仍在；`dump()` 的「⓪ 当前会话」与画面一致。
5. **颜色**：`color(6)` ⇒ 红色裸装；`color('BLUE')` ⇒ 蓝；`color(99)` ⇒ 一行日志、不变；`color(null)` ⇒ 回跟随 `#avSel`。
6. **preview 不写会话态**：`equip(100577)` 后 `preview({equipVec:[100578]})` ⇒ 画面暂时只有弓，但 `dump()` 的「⓪ 当前会话」
   仍是 `100577`；`clear()` ⇒ 撤直通**并清空会话外观**（裸装 + 阴影，本批口径）。
7. **地面特效随会话**：`ground('halo')` ⇒ 换图再回来**仍是光轮**（c 起模式跨图保持）；刷新/重载档 ⇒ 回阴影。
8. **不写盘（预期）**：穿装备后**刷新浏览器** ⇒ 回裸装；SWF 图 `equip/ride` 在 c 批只打日志、画面仍基线（**f 起有自定义外观即叠层**，见 §8.18；存档 = `MDB8-g`）。

### 8.16 M8-d · 坐骑速度 + 浮动（✅ **已落码 · ✅ 人类 2026-10-20 手测通过「it worked good」**；as-built §7.3.21）

> **本批补两个观感**：骑乘后 JS 自由走**变快**（0.28 → 0.35 px/ms）；`_floatList` 里 13 只坐骑
> **骑上时先升起、之后持续上下浮动 ±5px（3s 一圈）**。走法同 §8.15：`serve.mjs` → 硬刷新 → 进 JS 图。
> ⚠️ 本机缓存只有 `100582`（资源 `120403`，浮动坐骑）这一个坐骑包；`101020`（`136403`）未缓存 ⇒ 后者只验降级。

1. **动态骑上 = 2s 升起**：`await APP.actorLook.ride(100582)`（星空追猎者）⇒ 角色+坐骑从地面**缓缓升起**到 -50（约 2s，起步有轻微下压再升），
   随后**开始上下浮动**；`unride()` ⇒ **立即**回到地面（无降下动画，同上游），手脚恢复。
2. **持续浮动（必测）**：骑 `100582` 站立观察 **10 秒以上** ⇒ 角色与坐骑整体在 `-45 ↔ -55` 间**连续平滑浮动**（±5px、一圈约 3s），
   **不是**在 -50 抖动、也不跳帧；脚下阴影/光轮**留在原地不跟着浮**（只有角色层动）。
3. **浮动不打断**：骑乘中 `equip(100577)` / `color(6)` ⇒ 外观变化，但**浮动相位不重置**（不突然跳回 -50）。
4. **换坐骑**：`ride(100582)` 后再 `ride(100582)`（或换另一只浮动坐骑）⇒ 从当前高度平滑升/降到 -50 再继续浮动。
5. **加速（必测）**：同一张 JS 图，比较裸装走位与骑 `100582` 走位（点同样距离的空地）⇒ 骑乘明显更快（约 25%）。
   `unride()` 后速度恢复。⚠️ SWF 图的走位仍由 `MapRunner` 驱动，本批**不变**。
6. **坐骑缺包不加速**：`ride(101020)`（迈巴赫，包未缓存）⇒ 日志「坐骑包未就绪，按未骑乘绘制」；此时**不抬起、不藏手脚、不加速、不浮动**（M8-I2）。
7. **地面特效**：`ground('halo')` + 骑 `100582` ⇒ 光轮在**地面**连续旋转，不被浮动带起；`ground('shadow')` 同理。
8. **换图**：骑 `100582` 切图再回来 ⇒ 仍浮动着（相位不要求从第一帧开始）；刷新浏览器 ⇒ 回裸装（本批不写盘）。
9. **dump 对数**：`await APP.actorLook.dump()` ⇒ ③ 行末尾 `float=N`（`101020` 不在浮动表）；先 `ride(100582)` 再 dump ⇒ ⓪ 行末尾 `float=Y`、`speedFactor=1.25`。
   ⚠️ `dump` 只读**会话态**，`preview` 的临时覆盖不会出现在 ⓪ 行（这是 c 批口径，不是本批缺陷）。

### 8.17 M8-e · 素材清单 + 缺包日志（✅ **代码已落 2026-10-20**；as-built §7.3.22；**缺件已由 §7.3.28 定向拉取补齐 ⇒ 本条重测 = 新包上屏**；**✅ 手测通过 2026-10-21，人类「全部测试通过」= 一揽子通过（未逐条拆分回报）**）

> 本批的“代码半边”（清单字段 + 缺包日志）与“素材半边”（进游戏采集）是两件事：
> 前者已落，后者需要真人用启动器进游戏把缺的包**请求出来**。未采集前所有旧画面照常，缺包走 fallback/M8-I2 降级。
> 判据 = 清单与缓存对账（不误报已有包）+ 缺包日志每签名一行 + 采集后新包能上屏。

1. **清单字段（必测）**：打开 `game/data/actor/equip/manifest.json` ⇒ 每个已缓存包有 `url` / `size` / `cachedAt` /
   `frameW/frameH/infoCount/sheetW/sheetH/labels`；已知样本 `120301` 应为 `155x82`、`14inf`；`120302_1` 为 `584x173`、`52inf`（ALC10）。
   顶层 `missing` = 108 条，且**没有任何已缓存包**出现在 `missing` 里（不误报）。
2. **重生成**：`node tools/build-actor-assets.mjs` ⇒ 输出 `packs=12 files=18 expected=108 missing=108`，逐文件行含来源 URL；
   无 `parseError`；仓库 `manifest.json` 无意外 diff（除首次新增字段）。
3. **缺包日志归并（必测）**：进 JS 图，`await APP.actorLook.equip(100102)`（巨星头盔，资源 `102701` 未缓存）⇒
   控制台**只出现一行** `外观缺包（<signature>）: HEAD 102701(fallback), …`（不是每层一行）；头退默认头、画面不崩、可继续走。
4. **不刷屏**：反复 `equip(100102)` / `unequip(100102)` / 再 `equip(100102)` ⇒ 同一签名的缺包行**不重复打印**；
   换成另一件缺包装备（新签名）⇒ 再打一行。`ride(101020)`（`136403` 未缓存）⇒ 仍是一行 `坐骑包未就绪…` + 一行缺包摘要，不抬起、不加速（M8-I2）。
5. **12 色仍只蓝/红（预期）**：`#avSel` 下拉仍只有蓝/红；`color(1)`（绿，包未采集）⇒ 退蓝/红裸装 + 一行缺包日志；
   采集齐 10 色包后再扩选择器（`M8-I6`），本批不算缺陷。
6. **采集后回归（待真人进游戏）**：用启动器进游戏，按 `map-actor-look §5.5` 的采集单**预览/穿上/骑上**目标装备与坐骑，
   退出后告诉我 ⇒ 我重跑 `build-actor-assets.mjs` 对账（`missing` 应变小）；再进 JS 图验证新采到的包：
   ① 新坐骑 `ride(...)` ⇒ 抬起/浮动/加速按 `_floatList` 与 M8-I2 正确表现；② 新颜色 `color(...)` ⇒ 该色裸装成对出现；
   ③ 新装备 `equip(...)` ⇒ 该槽上屏、层序正确。
7. **采集不可达（如实登记）**：若定向拉取拿不到某件（站外 404/无该文件）⇒ 记下名字，登记为“未采集”，
   不做无边界遍历/扫描；渲染按现有降级链处理，不算缺陷。

### 8.18 M8-f · SWF 路叠层（✅ **代码已落 2026-10-20**；as-built §7.3.23）⚠️ **本条 = `&puppet=0` 旧链面，已随 ★M9-c（2026-10-20 拍板 A·退役）不再可测** ⇒ **不宣布通过**；puppet 路等价判据见 `§8.23` ✅

> ⚠️ **c 批注（人类 2026-10-20 拍板 A·退役）**：本节判据里的「无装备/缺包 ⇒ 仍黄点」是 `puppet=0` 旧链语义，旧链代码已删除 ⇒ **不再可测**（puppet 路缺包 = 裸装小赛尔 fallback）。改测 **§8.23** 第 3 条；旧链代码可从 git 历史找回。

> 走法：`node tools/serve.mjs` → 硬刷新 → 进一张 **SWF 图**（`swfOk===true`，如 `10017`/`100`/`151`）。
> 本批**不碰** `game/maprunner/**`：SWF 画面、光口、HUD、走位都应与今天一致，只有“本机角色”这一格被扩。
> ⚠️ 本机缓存只有 `100582` 一个坐骑包；`101020` 未缓存 ⇒ 按第 4 条验**降级**，等 `e` 采集后再验“可见”。

1. **无装备基线（必测）**：先 `APP.actorLook.clear()`，再进 SWF 图 ⇒ 角色仍是**黄点 + 原 SWF 裸装角色**；
   不做任何外观装载、不出现 `外观缺包` / `SWF 叠层` 日志；SWF 画面、光口、走位与改前一致。
2. **穿装备可见（必测）**：在同一张 SWF 图里 `await APP.actorLook.equip(100577)`（头，资源 `120301` 已缓存）⇒
   黄点被**整只 canvas 角色**替代（头/身/手脚/阴影），日志尾部出现 `（SWF 图：叠层已开）`。
   点空地走位 ⇒ 角色**位置跟着走**（约 4Hz 更新）、走路播放 `run`；停下回 `stand`。
3. **骑坐骑可见（必测）**：`await APP.actorLook.ride(100582)`（星空追猎者，浮动坐骑，已缓存）⇒
   角色与坐骑整体抬起 **-50**、持续上下浮动；点空地走位 ⇒ 位置跟随；`unride()` ⇒ 回站立（不再抬起）。
   ⚠️ SWF 图的**移动速度仍由 MapRunner 驱动**，本批不给 SWF 路加速（`speedFactor` 只作用于 JS 自由走）。
4. **缺自定义包降级（必测）**：`await APP.actorLook.equip(100102)`（巨星头盔，包未缓存）⇒
   SWF 图**不叠层、保留黄点**，`#log` 一行 `SWF 叠层暂缺自定义包，保留黄点: …`（+ 一行 `外观缺包（…）`）；
   画面不崩、可继续走/点光口。`await APP.actorLook.unequip(100102)` ⇒ **若还在骑 `100582`** 则回到叠层；
   若没骑马（`100102` 已在同槽替换掉 `100577`）⇒ 仍是黄点，重新 `equip(100577)` 即回叠层。
   `ride(101020)`（迈巴赫，包未缓存）同理 ⇒ 黄点 + 缺包日志（M8-I2 坐骑降级行仍在）。
5. **开关即时生效**：`clear()` ⇒ 立刻回黄点；再 `equip(...)` ⇒ 立刻回叠层；`ground('halo')` / `ground('shadow')`
   ⇒ 叠层角色的地面特效立即切换（黄点态无效果、属预期）。
6. **换图保持**：穿装备在 SWF 图 → JS 图 → 再回 SWF 图 ⇒ 叠层仍在（`LOOK` 签名复用、不重装）；
   **刷新浏览器** ⇒ 回裸装（本批不写盘 = 预期，`MDB8-g` 才落 `<equip>`）。
7. **人眼校（2026-10-20 更新：双角色已由 `f2` 修，见 §8.20）**：① 是否露出**双角色边** ⇒ **f2 后应消失**（仍见 = 报图号）；
   ② 叠层是否**压过前景遮挡**（`front_mc` 盖不住 `#ov`）；③ 快速走动是否**跳格/拖影**（4Hz）⇒ **已由 f2 同日修补 ①「位置平滑跟随」处理，验收挪到 §8.20 第 7 条**。
   另请看一眼**脚底是否对齐**（不对 ⇒ 报“偏高/偏低多少像素”，我只调 `LOOK_DY`；大小不对 ⇒ 报 `LOOK_SCALE`）。
8. **颜色（预期口径）**：`color(6)`（红）在**已有叠层**时 ⇒ 整只角色变红；**没有装备/坐骑时单独 `color(6)`**
   ⇒ SWF 路仍黄点（本批 `hasCustomLook` 只认装备/坐骑；非蓝/红裸装叠层留后续）。

### 8.19 M8-g · 存档 `<equip>`（✅ **代码已落 2026-10-20**；as-built §7.3.24；**✅ 手测通过 2026-10-21，人类「全部测试通过」= 一揽子通过（未逐条拆分回报）**）

> 走法：`node tools/serve.mjs` → 硬刷新 → 登录并进图（建议用一个**已有进度**的槽，记下槽号 N）。
> 本次验收 = “**关浏览器再进来外观还在**”，以及存档文件里的块形状。
> 文件位置 = 仓库根 `saves/saveN.xml`（`tools/serve.mjs` 支持 PUT；无写端点时降级 localStorage，见 `save-impl §6`）。

1. **穿+骑后落盘（必测）**：进图后执行
   `await APP.actorLook.equip(100577)`、`await APP.actorLook.ride(100582)` ⇒ 画面立刻变（JS 路角色/ SWF 路叠层），
   `#log` 无 `外观落盘失败`。打开 `saves/saveN.xml`：`</yiteRogueData>` 之后应出现**根级最后一块**
   ```xml
   <equip>
     <items>
       <int>100577</int>
     </items>
     <mountEquipId>100582</mountEquipId>
   </equip>
   ```
   （缩进/换行按真档 CRLF 口径；`items` 顺序 = 会话里的装备顺序。）
2. **重开保持（必测）**：**刷新/关浏览器重开** → 登录**同一槽** → 进图 ⇒ 不用再敲命令，装备与坐骑已恢复
   （JS 图直接是穿戴角色；SWF 图叠层自动开、缺包则按 M8-I4 黄点 + 日志）。换到**另一个槽** ⇒ 外观按该槽自己的档来（不串档）。
3. **卸下/清空写回（必测）**：`await APP.actorLook.unequip(100577)`、`await APP.actorLook.unride()` ⇒ 再开 XML，
   `<items />`（或槽内无 `100577`）且 `<mountEquipId>0</mountEquipId>`；
   再 `APP.actorLook.clear()` + `await APP.actorLook.unride()`（`clear` 本身不写盘，`unride` 触发一次空外观写盘）⇒
   XML 里 **`<equip>` 整段消失**（不是 `<equip />`），重新进图 = 裸装。
4. **旧档兼容（必测）**：拿一份**本批之前**的档（无 `<equip>`）导入同槽并进图 ⇒ 不报错、正常游玩；
   随便触发一次存档（如商店购物/战斗结束）后看 XML ⇒ **仍无 `<equip>`**（旧档 round-trip 不凭空多块）。
5. **导入导出（必测）**：把第 1 步产出的 `saveN.xml` 复制一份（= 导出）；在登录页「导入其他存档」选它覆盖同槽 ⇒
   进图外观保持、`<equip>` 内容逐字不变（导入走 `repository.importXML` → `parse` → `validate`，坏形状会被拒）。
6. **坏块拒写（可选）**：手工把 `items` 改成非整数（或删掉 `mountEquipId`）再导入 ⇒ 登录页提示**导入失败**（不静默放行）；
   把文件改回去即可。⚠️ 别把改过的档留在槽里。
7. **不喂官方服（纪律提醒）**：复刻档现在含上游不认的 `<equip>`（上游重写会丢块）⇒ 只在本复刻里用，**不要拿去登录/喂回官方服务器**。
8. **已知边界（预期）**：`color`/`ground`/`actorSex` **不入档**（本批只存装备物品 ID + 坐骑 ID）；重开后颜色回跟随 `#avSel`、
   地面特效回默认阴影。`equip` 不校验背包持有量（正式装备面板 C1/C2 再补）。

### 8.20 M8-f2 · SWF 裸装角色显隐（双角色修复）（✅ **代码已落 2026-10-20**；as-built §7.3.25）⚠️ **本条 = `&puppet=0` 旧链面，已随 ★M9-c（2026-10-20 拍板 A·退役）不再可测** ⇒ **不宣布通过**；puppet 路等价判据见 `§8.23` ✅

> ⚠️ **c 批注（人类 2026-10-20 拍板 A·退役）**：f2 的显隐同步与平滑跟随已随 `puppet=0` 旧链删除（puppet 位 AS3 装载即恒隐、无需结算）⇒ 本节**整体不再可测**，「双角色/一抖一抖」登记为**由 M9 根治**；改测 **§8.23**。

> 走法：`node tools/serve.mjs` → **硬刷新**（`mapRunner.swf` 已重编译，必须有 `actorVisible` 回调）→ 进一张 **SWF 图**（`swfOk===true`，如 `10017`/`100`/`151`）。
> 本次验收只有一件事：**叠层接管时，画面上不应再有第二只角色**。

1. **单角色（必测）**：`await APP.actorLook.equip(100577)` ⇒ canvas 角色出现的同时，底层 SWF 裸装角色**消失**
   （站立/走动/转向都不应再从边缘露出手脚或阴影）。
2. **骑乘同样（必测）**：`await APP.actorLook.ride(100582)` ⇒ 仍**只有一只**（抬起 + 浮动照常，脚下不再多一套裸装影）。
3. **回退即恢复（必测）**：`APP.actorLook.clear()`（或 `unequip`/`unride` 清掉全部自定义件）⇒ 黄点回来，
   **原 SWF 裸装角色同时重新可见**（= f 之前的基线，不多不少一只）。
4. **跨图保持（必测）**：叠层开着传送（SWF→SWF）⇒ 目标图里仍只有一只；SWF→JS→再回 SWF（重建播放器）⇒ 也只有一只。
5. **降级不误伤（必测）**：`await APP.actorLook.ride(101020)`（包未缓存）⇒ 黄点 + **SWF 裸装角色可见**
   （隐藏只跟随"canvas 真正画出"，不在缺包时误隐藏角色）。
6. **回归**：走位点击落点、光口传送、点 NPC 对话/开战、点野怪开战、昼夜镜像 —— 应与本批前一致
   （`actorVisible` 只拨显示开关，不碰这些路径）。
7. **平滑跟随（同日修补 ①，必测）**：穿着装备/骑乘**连续走动** ⇒ 角色应**平滑移动**、不再"一抖一抖"（对比：修理前 = 每 ~100ms 跳一步）；
   到站应**干净停住**（不回弹、不余滑）；传送/换图落位应**瞬时**（不从旧点飞过去）。若仍抖 = 报图号与走法。
8. **仍属 f 的未修项（预期，别按新 bug 报）**：前景遮挡穿帮（`front_mc` 盖不住 `#ov`）、
   拐角朝向滞后、仅换色（无装备/坐骑）不触发叠层。

---

### 8.21 M9-a · SWF 路角色提线化（puppet 最小闭环）（✅ **已落码并手测通过 2026-10-20**，人类「nice, 现在ok了」；as-built §7.3.26）

> 走法：`node tools/serve.mjs` → **硬刷新**（`mapRunner.swf` 已重编译，必须带 `setPos`/`walkReached`）→ 进一张 **SWF 图**（`swfOk===true`，如 `10017`/`100`/`151`）。
> 本次验收的主口径只有一件事：**SWF 图的走位应该和 JS 图一样顺滑**（角色 = canvas 一只、逐帧动）。

1. **单角色 + 无抖（必测）**：**什么装备都不穿**进 SWF 图 ⇒ 画面上应只有**一只 canvas 小赛尔**（SWF 自带裸装不再出现），
   连续走动**平滑无抖**、无 ~250ms 一跳的台阶感；对比旧链：地址栏加 `#/map?slot=N&…&puppet=0` ⇒ 应回到 f2 时代行为（SWF 角色 + 黄点/平滑跟随、走动仍抖）。
2. **三链（必测）**：① 点**空地** ⇒ 走到；② 点**光口** ⇒ 走到后传送（目标图正确）；③ 点**野怪** ⇒ 走到脚下**开战**（战败/战胜回图链路 = b 批回归，本条先看能否开战）。
3. **装备/坐骑仍叠层（必测）**：`await APP.actorLook.equip(100577)` / `await APP.actorLook.ride(100582)` ⇒ 仍画整只外观角色、骑乘加速 + 浮动照常（复用 f/b2/d 的 `drawActor`，无回归）。
4. **缺包不黄点（口径确认）**：穿一件包未缓存的自定义装备 ⇒ 画的仍是**裸装小赛尔 fallback**（**不是黄点**），日志**不出现**「保留黄点」误导行。
5. **手感（人眼校，= M9-I1）**：puppet 走路速度 = JS 路 `JS_SPEED`（SWF 世界更大，可能显得偏快/偏慢）⇒ 只报"快/慢/合适"，调的是 JS 侧常量。
6. **回归（抽查）**：点 NPC 对话/开战（B3 SWF 路）、HUD 读数、昼夜按钮换图、连续传送 —— 应与本批前一致；
   **已知未修**：前景遮挡穿帮（`front_mc` 盖不住 `#ov`）不变，**别按新 bug 报**。

---

### 8.22 M9-b · 交互改道回归（puppet 数据面 · **纯人回归、零新增码**）（✅ **已过人肉回归 2026-10-20，人类「都过」= 下列 1–5 五条全过**）

> **代码审计结论**（先审后测：五条链路在 puppet 数据面**结构兼容**、无需修补 ⇒ 本批不发新码）：
> ① **MB10 战后回图 spawn 落点**：`spawn` 一次性落点 → `loadMapRunner` 的 `initX/initY` → AS3 `onMap` 用 `spawnX/spawnY` 落位 → `finishInit` 回报 `mapReady x,y` → puppet 分支照 a 批以其为 `M.pos` 初值 ⇒ 回图落点**自动走 puppet**；
> ② **昼夜镜像（孪生图 `-id` 换图）** = `gotoMap` 重建/换图 ⇒ `puppet` 态随 `loadMapRunner` 复位 + 新 `mapReady` 重同步（风险 5「换图/卸载复位」）；
> ③ **B3 SWF 路 NPC 标记/点击**：`#npc`/`#ov` 坐标 = `M.info` 世界界 + `M.cam`，puppet 路 `M.cam` 逐帧更新（`puppetSync` 本地钳位与 `mapState` 校准同公式）⇒ 命中面与绘制**同帧**；
> ④ **HUD**：`HudRunner`/`jsHud*` 与走位通道无关（AS3 兄弟层），DOM 背包/精灵袋 = `jsHudStatus` 只读桥 ⇒ 均不消费 `mapState` 位置；
> ⑤ **缺包 fallback**：a 批 §8.21 第 4 条已目视（画裸装 fallback 非黄点），本批只抽查**每签名一行日志不刷屏**。
>
> 前置：M9-a 已手测通过；**硬刷新**保证 `mapRunner.swf`（29390 字节）到位。

1. **战后回图落点（必测）**：SWF 路点野怪开战 → 胜/败/逃回图 ⇒ 应落在**那只野怪脚下**（`spawn` 落点，不是房间入口），角色仍单只、走动仍平滑。
2. **昼夜镜像（必测）**：带 `switch≠0` 的图（如 `131`）点昼夜换图 ⇒ 新图 `mapReady` 后走动/NPC/光口全正常、puppet 位仍生效（单角色无抖）。
3. **B3 NPC 点击（必测）**：SWF 路点 canvas 画出的 NPC ⇒ 对话/开战走同一台 `resolve→run` 机；**连续走动时** NPC 标记/贴图应逐帧跟相机（不滞后、不跳格）。
4. **HUD 抽查**：背包/精灵袋开关与读数、图名标题 —— 与 M8 前一致（本批不改它，防误伤即可）。
5. **野怪两面抽查（口径确认、非 bug）**：SWF 路同时存在 AS3 `WildPet`（点了**走到脚下**开战）与 B3 canvas 野怪（点了**直接开战**、MB7 链）——两面都能开战即过；行为差异 = 已登记现状。
   ⚠️ **"两面"已随 `MDB11` 并成一面（2026-10-21）**：`wild: ''` ⇒ AS3 一只 `WildPet` 都不生成 ⇒ **canvas 野怪成为 SWF 路的唯一野怪**（本条当年验到的"双绘"那一格同时消掉）；本条 = M9-b 当时的观测记录，按纪律保留原样 ⇒ 新判据 **§8.27**、as-built **§7.3.33**。

> ⚠️ **c 批注（2026-10-20）**：本清单当时与 §8.21 第 1 条里的 `&puppet=0` 对照步骤，已随 `MDB9-c` 旧链退役**不再可测**（puppet 是唯一通路）。

---

### 8.23 M9-c · 旧链退役后的 puppet 单通路回归（**零新增功能，只验"删码删干净"**）（✅ **已手测通过 2026-10-20，人类「整体结账」= 1–5 全过、★M9 全线收口**，as-built §7.3.27）

> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` 改了）→ 进一张 **SWF 图**（如 `10017`/`100`/`151`）。本批只删了 JS 旧链补丁，**没碰 `mapRunner.swf`** ⇒ 判据 = §8.21 的口径应**原样保持**。

1. **三链 + 无抖（必测）**：点空地走到 / 点光口传送 / 点野怪走到脚下开战 —— 与 a/b 批一致；连续走动仍**平滑无抖**、画面仍**一只 canvas 角色**。
2. **`&puppet=0` 已无效（口径确认）**：地址栏加 `#/map?…&puppet=0` ⇒ 行为**不变**（仍是提线单通路，不再回 f2 旧链），不报错即对。
3. **缺包 fallback（必测）**：`await APP.actorLook.equip(<包未缓存的装备 ID>)` ⇒ 仍画**裸装小赛尔 fallback**（非黄点）、日志只有「外观缺包（签名）…」一行、**无**「保留黄点」字样。
4. **装备/坐骑仍正常（抽查）**：`equip(100577)` / `ride(100582)` ⇒ 叠层外观、骑乘加速 + 浮动照常。
5. **回归抽查**：NPC 点击对话/开战、HUD、昼夜换图、战后回图落点 —— 与 b 批一致；**已知未修**：前景遮挡穿帮不变。

### 8.24 MDB8-h · 玩家面缺件过滤 + 「颜色」组（**✅ 手测通过 2026-10-21，人类「ok, done good」**；as-built §7.3.30；View 侧同批清单 = `docs/view/panel/playerinfo/playerinfo-impl.md §8 #20`）

> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `playerInfoPanel.js` / `ui.css` 改了）→ 进图 → 点 HUD「信息」开面板。本批**只改玩家面目录的筛法 + 加一个颜色组**，不碰走位/相机/存档结构。

1. **六个件物组的条数（主判据）**：头 **347** / 手 **375** / 脚 **304** / 腰 **305** / 背 **240** / 坐骑 **95**（数格子或看页码 × 36 反推）；**页码随条数自动收缩**。
2. **无包件不再露出**：上述列表里**不应再有** = 五周年冠军坐骑 `101737`、回忆录 `101740`（手部件）、葛蕾芬手套 `100233`、兵团长拳套 `100253`、兵团长的剑 `100254`、渡鸦战靴 `100770`、五件背装 `100337/101191/101335/101493/101537`（实名表 = `docs/map/map-actor-look.md §5.7`）。
3. **12 色件不进部件表**：手/脚组里**不应再出现**任何「蓝/绿/紫/…/咖啡」的颜色默认装（36 件里的 24 件手脚）；身体（槽 4）与 12 件颜色身体件本就不在面板组里。
4. **「颜色」组**：组标签**末位**多出「颜色」（共 8 个）；点进去 = **12 个色名钮 + 一小块底色、不分页、当前高亮**；点任意色 ⇒ 左栏 canvas 预览与地图角色**即时换色**，重开面板/进图仍生效；**重开游戏后回跟随 `#avSel`**（不落盘 = 与阴影两态同口径，档里 `<equip>` **不应**多出颜色字段）。
5. **调试面不受屏蔽（边界）**：Console `await APP.actorLook.equip(101737)` ⇒ **仍能穿上**、画裸装 fallback、`#log` 一行 `外观缺包（…）: 157003_0…`（`:2053`）。
6. **空列表提示分两支（可选，非必测）**：正常情况各组都有货；若把 `game/data/actor/equip/manifest.json` 临时挪走再硬刷新 ⇒ 组应显示**「素材清单还没到位，这组暂时列不出」**（不是「目录里这组是空的」）、**不崩不黑屏**（测完记得挪回）。⚠️ **别用 `node tools/build-actor-assets.mjs` 去"重新生成"它** —— 该工具的输入 = **本机登录器缓存**（`asset-inventory` **AS30** / AS-D2），拿空缓存跑一遍会把已抓到的 **1721 包登记成缺件** ⇒ 目录整体空掉、只能重跑 `tools/fetch-actor-packs.mjs` 恢复。
7. **回归**：换装/骑乘/卸下/翻页照常（= §8.17、`playerinfo-impl §8` #12/#13/#16 口径）；个别在册格子仍是**色块** = 图标 404 的 48 件（`icon-missing.json`），**属预期**（图标缺不是剔除条件）。

> **✅ 手测回报（人类 2026-10-21）**：「ok, done good」= 本条已过。**未逐条拆分回报**（1–7 按整体通过登记）；本批的三条指令反馈正是催生 `MDB8-i` 的那四条 ⇒ 同盘面一并确认。判据逐条保留供日后回归复用。

### 8.25 MDB8-i · 「表情」组 + 空件不列 + 裁帧图标（**✅ 手测通过 2026-10-21，人类「ok, done good」**；as-built §7.3.31；View 侧同批清单 = `docs/view/panel/playerinfo/playerinfo-impl.md §8 #21`）

> 走法：先 `node tools/pack-icon-stills.mjs`（生成 5 张图标静图，产物不入库）→ `node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `actor-look.js` 改了）→ 进图 → 点 HUD「信息」开面板。本批**只加一个组、加一条筛、离线补五张图**，不碰走位/相机/存档结构。

1. **表情组（主判据）**：组标签共 **9 个** = 头/手/脚/腰/背/坐骑/**表情**/阴影/颜色（表情排在坐骑之后、阴影之前）；点「表情」= **20 格**、图标**全是真图不是色块**；点任意表情 ⇒ 左栏 canvas 预览与**地图上的角色脸部即时变化**，重开面板仍是那一张。
2. **表情要落盘（与颜色不同）**：换表情后**关浏览器重开同一存档槽** ⇒ 表情还在；存档 XML 的 `<equip>` 里应出现该 ID。对照：换「颜色」后重开仍回 `#avSel`（不落盘，= §8.24 第 4 条口径不变）。
3. **空件不再露出**：头部组 **346**（原 347，少的那一件就是**默认头顶**）、列表里搜不到「默认头顶」；表情组里也**没有「默认眼睛」**。
4. **五张裁帧图标**：背部「**蓝队旗帜 100106** / **红队旗帜 100107**」、手部「**阿卡公仔 100242** / **迪迪兰公仔 100243** / **咻休公仔 100244**」的格子应**从色块变成图**（旗帜 = 一面旗带旗杆；公仔 = 小玩偶）。⚠️ 这些是**从部件包裁的穿戴美术、不是官服图标原画**（小图放大会带块感）⇒ 请人判"能不能认得出是哪件、摆着别扭不别扭"，不满意可回退（删掉 `png/item/equip/icon/{那5个}.png` 即回到色块）。
5. **不可补的仍是缺（边界）**：`葛蕾芬手套 100233 / 雷电电闪 100337 / 上古战神背装 101335 / 张飞盔甲背装 101493 / 五周年冠军坐骑 101737` 在目录里**依然看不到**（部件包也 404，§8.24 已过滤）⇒ 本批**没有**让它们"变出来"。
6. **调试面不受屏蔽（边界）**：Console `await APP.actorLook.equip(100001)` ⇒ **仍能穿上**默认头顶（只是目录里不列）。
7. **回归**：其余六组条数不变 = 手 **375** / 脚 **304** / 腰 **305** / 背 **240** / 坐骑 **95**；换装/骑乘/卸下/翻页/换色照常（§8.24 口径）。

> **✅ 手测回报（人类 2026-10-21）**：「ok, done good」= 本条已过 ⇒ **`MDB8-h` + `MDB8-i`（M8 玩家面两批）就此收口**。**未逐条拆分回报**（1–7 按整体通过登记）。第 4 条的**裁帧图若日后不满意是可逆的**：删 `png/item/equip/icon/{100106,100107,100242,100243,100244}.png` 即回到色块（产物不入库）。**M8 两条手测 §8.17（e · 新包上屏）与 §8.19（g · 存档 `<equip>` 落盘 / round-trip）✅ 已通过（人类 2026-10-21「全部测试通过」） ⇒ M8 全线收口**，本批未替人类宣布（`§8.18` / `§8.20` 的 SWF 旧链面已随 ★M9-c 退役、不可测，等价判据并入 `§8.23` ✅）。

### 8.26 MDB10 · 野怪图像对话气泡（**✅ 手测通过 2026-10-21，人类「全部测试通过」= 一揽子通过（未逐条拆分回报）**；as-built §7.3.32）

> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `wander.js` / `npc-art.js` 改了、`talk.js` 是新文件）→ 进图 → **站着别动看野怪头顶**。
> 本批**只加气泡内容与一条独立调度环**：不碰走位、不碰相机、不碰 `MapRunner.as`、不碰 `game/core/**` ⇒ 无需重生成物。

1. **JS 路（无 swf 映射的图，例 `10030` / `424` / `10025`）**：野怪头顶**约 3/4 概率出圆形表情**（愤怒 / 开心 / 星星眼 / 睡…）、**约 1/4 出中文台词**（= 人类拍板的"图与文同一个池子均匀随机"）；`duration`（2.5s 或 4s）后消失、隔 5–10s 再冒。**以前这里只有文字** ⇒ 现在应该明显看到图。
2. **SWF 路（有 swf 映射的图，例 `151` / `131` / `10017`）= 今天第一次会冒泡**：表情/台词同上。⚠️ 表情挂的是**我们叠加的那只 sprite** 头上，与 SWF 自己画的那只**可能错位** = **已登记的双绘旧缺陷（`AGENTS §4.14` ①），不是本批新 bug** ⇒ 只需确认"泡挂对了对象"。
3. **F12 Network**：请求应长成 `…/Sprites/Map/talk%20bubble/emoji/toon/<name>.png`（`meme` 那 7 张在特定图上 = `.jpg`）；**Console 不该出现**「表情气泡缺图」或「id 畸形」（31 张全在盘、id 全在白名单内）。
4. **两遍绘制顺带修的遮挡**：两只野怪挨着时，**后画的邻居不再盖掉前一只的气泡**（MB9 文本气泡以前会被盖）。
5. **`meme/*` 那 7 张（熊猫头表情包）在暗框里认不认得出来** = 请人眼判（不满意就改 `TALK_EMOJI_MAX` / `TALK_EMOJI_SCALE` / 框色，属人眼校项 `AGENTS §4.10`）。
6. **回归**：点野怪仍能开对话 / 开战（命中面未变）；走位、光口、HUD、角色外观不受影响；换图 → 战后回图 ⇒ **气泡不残留、不越跑越卡**（`talkRaf` 应随新图重启而不是叠好几层）。
7. **已知不做（别当 bug 报）**：无淡入淡出（上游 `fadeTime 0.18`）；不取上游气泡底图 `WildNpcBubbleIntegrated.png`（正式排版归 B3 美术）；`<scene>` / `<player>` 两张死表不接；剧情的 6 种表情运动仍归 A 组；`active===false` 的野怪仍不画 ⇒ 也不冒泡。

### 8.27 MDB11 · 野怪只剩 Unity 那一套（**✅ 手测通过 2026-10-21，人类「全部测试通过」= 一揽子通过（未逐条拆分回报）**；as-built §7.3.33）

> **一句话说明这次该看到什么**：以前地图上有**两套野怪**叠着跑 —— 一套是**重启数据里真写的**（XML 的 `<npc><wild>`，110 只在 53 张图上），另一套是**我们自己造的**（`game/data/wild.json`：48 只池子铺到 252 张图上，Flash 那侧自己溜达、自己挂 `Lv+名字` 黄脚标）。**本批把第二套彻底断掉**，只留真数据那一套。
> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `content.js` / `wander.js` / `index.html` 都改了）→ 进图看野怪。
> ⚠️ 本批**零 `game/maprunner/**` 改动、不重编译 AS3、零 `game/core/**` 改动** ⇒ 无重生成物。

1. **SWF 图（有 swf 映射，例 `151` / `131` / `10017`）**：地图上**不该再有**那种带 **`Lv+名字` 黄脚标**、自己乱走的 Flash 宠物；看得见的是**我们叠加层的 sprite 野怪**（头顶中文名），而且**它们现在也会溜达了**（在家附近来回、2–3 秒停一下再走）。
2. **打到的怪变了 = 预期，不是 bug**：点野怪开战的遭遇里，**怪物与等级来自这只 NPC 自己写的 `<battle>`**（不再来自"能力值最低 48 只 + 按图分档"的合成表）⇒ 同一张图上看到的怪**跟今天不一样**是正常的（判据与 MB7 那台机一致 = `§8.6`）。
3. **F12 的两条硬指标**：① **Network 里不应再出现** `/swf/pet/normal/<id>.swf` 的请求（一只宠物都没生成 ⇒ 不加载宠物包）；② **Console 里这两行必须消失** —— 「`野怪表: 48 种 / 252 张图有怪`」与「`野怪 N 只站图`」，改为出现一行 **`MB9 漫游: N 只野怪已播态（… JS/SWF 两条路）`**；顶栏那句「N 只野怪」应等于**当前图实际的野怪数**（从 53 张有怪的图里挑一张，例 `10017` / `131`）。
4. **219 张图没有野怪 = 拍板如此（人类 ②「就没有」）**：以前"几乎每张图都 3–5 只"，现在**真数据没写怪的地方就是一只都没有**，我们不伪造。请抽查三种：① 真数据有怪的 **53** 张 ⇒ 出怪正确；② 以前有怪现在空的（合成表独有的 **218** 张，SWF 侧任挑一张）⇒ **画面正常、不报错**即可；③ 真数据独有的 **19** 张 ⇒ **新出现了**野怪（顺带看看位置别太离谱 = 人眼校）。
5. **下拉与换图**：图下拉里那个 **`⚔N` 计数已移除**（不是 bug —— Unity 侧要逐张图加载才知道有没有怪，下拉构建时拿不到 ⇒ 不伪造一个数）；换图 / 传送 / 战后回图 ⇒ **漫游循环不叠加、不越跑越卡**，野怪**不残留**上一张图的。
6. **回归**：JS 回退图（例 `10030` / `424`）三链照旧（点地面走 / 光口传送 / 点野怪开战）；MDB10 的**表情气泡两条路仍会冒** —— ⚠️ 有一条**预期收紧**：气泡的"驻停才起新泡"判据在 SWF 路上**从今天起才真正生效**（因为 SWF 路的怪以前不游荡 ⇒ 现在怪走动时不起新泡、停下才起，符合上游 `OnRestStarted`）；HUD / 角色外观 / 昼夜 / 光口不受影响。
7. **已知不做（别当 bug 报）**：不出怪的 219 张不补、不造"重生/出怪表"（Unity 侧本来没这个概念）；不给野怪加 `Lv` 脚标（那是合成路的专属）；`wild.json` 与 `tools/build-wild-index.mjs` **不删**（只是不读）；`WildPet.as` 留成**不可达死码、不重编译**；`bobPhase`（待机上下浮）仍**无消费者**；前景遮挡穿帮 / `content_mc` 烘焙进图的怪 = **旧登记项**（`AGENTS §4.14` ① / `§8.22` 第 5 条）。
8. ⚠️ **两条工具会红/会哑（如实登记，不清除也不新增 = 决议 ⑦）**：`tools/verify-wild.mjs` 复跑必 `exit 1`（「图上没有野怪」—— 它查的是退役通路）；`tools/map-engine-toggle-test.mjs` 的野怪段会自动落进 `skip:野怪表未就绪` 分支，而**该分支的字符串是真值 ⇒ 被记成 pass = 不再测任何东西**。

### 8.28 MDB12 · 野怪素材取自 Flash 帧包（**✅ 手测通过 2026-10-21，人类「全部测试通过」= 一揽子通过（未逐条拆分回报）**；as-built §7.3.34）

> **一句话说明这次该看到什么**：野怪**还是同一批野怪、还在原来的位置、还是那样溜达**，但**画出来的那张图**从"重启的宠物立绘（被硬缩成小卡片）"换成"**Flash 时代那只会走的小精灵**"（原生像素、脚底钉在 `pos`、走/站两套动画、往左走整体镜像）。
> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `npc-art.js` 改了、`pet-view.js` 是新文件）→ 进图看野怪。
> ⚠️ 本批**零 `game/maprunner/**` 改动、不重编译 AS3、零 `game/core/**` 改动、`game/index.html` 零改动** ⇒ 无重生成物。

1. **变了样（包已在盘的四张图，最容易看）**：进 **`131` / `407` / `409` / `121`** ⇒ 野怪从"小卡片立绘"变成**会走的小精灵**：脚底贴在 `pos` 上、头顶**中文名照旧**；走动时循环 `walkDown/walkUp`、停下换 `standDown/standUp`、**往左走 ⇒ 整体水平镜像**（上下两族包 + 镜像 = 上游做法）。
2. **抓包后（34 张新变帧包的图）**：任挑 3–4 张（例 `151` 那类 SWF 图、`10030` 那类 JS 图都算）⇒ 同上；**F12 Network 应出现** `/swf/pet/normal/<n>.swf`（**每张图按需取**、跨图复用同一个包 = 第二次进同 id 的图不该再请求）；**Console 不该出现**「`野怪帧包不可用（退重启 PNG）`」（82 个包全在盘）。
3. **仍是 PNG 的 15 张 = 拍板如此（不伪造）**：`10015 / 10016 / 10017 / 10020 / 10021 / 10025 / 10026 / 10027 / 10030 / 10031 / 10035 / 10036 / 10037 / 10040 / 10043` ⇒ 画面与 `MDB11` 时**逐格一致**（这些怪在重启侧是新造的、`pet_appearance_swf.csv` 里**没有 Flash 对应物** ⇒ **别当 bug 报**）。
4. **大小观感（人类 ③ 选的就是"原生像素"，这条专门来看它）**：包之间差异大 = **28~231 px 宽**（`119` 那种 133×104 会比角色还高）；JS 回退图（底图被缩放）里 sprite **不随底图缩放** ⇒ **觉得飘/过大/过小就指出来**，改的是 `PET_FPS` 或加一个统一倍率（同族**人眼校** = `AGENTS §4.10`），**不是**改回 Unity `<npc @size>`。
5. **位置没变**：野怪仍**钉在 `<npc pos>`**、仍在 `radius=220` 内按 `step 12–26 / speed 34` 溜达、仍驻停 2–3 s ⇒ **分布与漫游与 `MDB11` 完全相同**（本批只换素材）。
6. **点击开战照旧**：点帧包野怪 ⇒ **直接**进 `onNpcClick → resolve→run → startMapBattle`（**不**绕"角色走到脚下"）；命中面 = **整格**（上游 `drawHot` 的"帧格本身 = 点热区"）；遭遇的怪与等级仍吃该 NPC 的 `<battle>`（判据同 `§8.27` 第 2 条）。
   ⚠️ **本条的"直接"已被 ★`MDB13-d` 改掉**：野怪点击现在 = **先播头顶「!」（≈0.8 s）再开战** ⇒ 判据见 **§8.29** 第 4 条；"**不**绕角色走过去"这一格**不变**。
7. **气泡与别的东西不受影响**：`MDB10` 的表情/台词泡**照旧冒**（帧包怪也一样，画在名字之上、两遍绘制不变）；HUD / 角色外观 / 昼夜 / 光口 / 传送 / JS 回退图三链照旧。
8. **换图与成本**：连续换 5–8 张图 ⇒ 帧包不残留上一张、漫游不叠加、**不越跑越卡**（SWF 路**待机时重绘 ≈12 Hz**（本批从 0 Hz 抬上来）、既不挪动也不换帧时不重绘）。
9. **已知不做（别当 bug 报）**：~~**没有**脚下阴影、**没有** `personal` 待机小动作、**没有**惊讶特效、**没有** `Lv` 黄脚标~~ ⇒ ⚠️ **这四条已全部被 ★`MDB13` 做完**（人类 2026-10-21 点名，as-built **§7.3.35** / 手测 **§8.29**）；本条**只剩**这些仍不做：**15 张无对应物的图仍 PNG**；`<wild @visual>`（`auto/animation/embedded`）**不吃**（上游零消费者的死数据）；**PNG 支路野怪不加脚下阴影**（尺寸来自 `<npc @size>`、锚点与帧包不同族）；**只画站立首帧**的极端情形 = 某张图上**只有** 3 只 `stationary` 怪且没有漫游者 ⇒ 动画环不起（本批已登记的边界、`MDB13-b` 同此）；**不复刻"叫角色走过来"**（上游 `actorMoveClose:248-254`）；前景遮挡穿帮 / `content_mc` 烘焙怪 = 旧登记项（`AGENTS §4.14` ① / `§8.22` 第 5 条）。

### 8.29 ★MDB13 · 野怪四件细节（脚下阴影 / `personal` 驻停小动作 / `Lv` 脚标 / 惊讶特效）—— **✅ 已通过（人类 2026-10-21「test ok」= 一揽子通过、未逐条拆分回报）**；as-built **§7.3.35**

> **一句话说明这次该看到什么**：野怪**还是同一批、还在原位、还是那样溜达**（分布/漫游/战斗逻辑一字未动），但**细节补齐成 Flash 那版的样子** ——
> **脚下多一圈软阴影**、**每次停下先做一个小动作**、**头顶名字撤掉换成脚下金字 `Lv13 奇鲁`**、**点它会先冒「!」≈0.8 秒才进战斗**。
> 走法：`node tools/serve.mjs` → **硬刷新**（`mapScene.js` / `pet-view.js` 改了）→ 进图看野怪 + 点一只。
> 四件是**四个本地提交**连发的（`-a`/`-b`/`-c`/`-d`），按人类拍板 ④ **中途没停测** ⇒ 这一份是**合并清单**。
> ⚠️ 本批**零 `game/maprunner/**` 改动、不重编译 AS3、零 `game/core/**`、`game/index.html` 零改动、零新素材** ⇒ 无重生成物。
> ✅ **2026-10-21 结账**：回报原文 = **「test ok」**，**未逐条拆分**（哪几条过、哪几条不过都没说）⇒ 记为**一揽子通过**（同 `§8.26`/`§8.27`/`§8.28` 三笔的口径）；人没指出任何一条要改 ⇒ **人眼校常数**（`SHADOW_ALPHA` / `PERSONAL_MAX` / `LV_LBL_DY` / `MARK_TOP_PAD` / `PET_MARK_FPS` …）**全部保持原值**，第 4 条④项的「**素材未就绪 ⇒ 完全不延迟、可能首点直接开战**」就此**确认为本线行为**（不是待确认的取舍）。

1. **脚下阴影（`-a`）**：进**帧包野怪**所在的图（例 `131` / `407` / `409` / `121` / `151` 那类）⇒ 每只野怪脚下有**一块暗色椭圆软影**、**跟着走**、**大小随怪体型**（大怪阴影大、小怪小）；**往左走镜像时阴影不跟着翻**（上游就是阴影不镜像）。
   ⚠️ **PNG 支路的野怪没有阴影 = 拍板如此**（那 15 张图 `10015 / 10016 / 10017 / 10020 / 10021 / 10025 / 10026 / 10027 / 10030 / 10031 / 10035 / 10036 / 10037 / 10040 / 10043` 里的怪仍走重启 PNG ⇒ **不加**阴影，尺寸不同族不硬套）。
2. **`personal` 驻停小动作（`-b`）**：盯一只怪走一段 ⇒ **每次停下的第一下**有个**小动作**（原地一段展示动画）、**播完自动回站立**；不是"站着很久才偶尔动一下"（= 上游行为，我们按拍板 ③ 改成每次驻停都播）。
   ⚠️ 三个预期：**① 走得越快越常看到**（每次驻停都播一次）；**② 很长的段会被截到 ≈4 秒**（实测 58/82 包的原段比这长，最长的 `122` 有 233 帧 ≈19 s ⇒ 截断是**刻意的**，嫌短/嫌长改 `PERSONAL_MAX`）；**③ `stationary` 那 3 只从不播**（它们没走过）。素材覆盖 = **82/82 包都有**（81 只叫 `personal`、`114` 那只叫 `free` ⇒ 都认）。
3. **`Lv` 脚标 + 撤头顶名（`-c`）**：野怪**头顶不再有中文名**、**脚下出现金字白边的 `Lv13 奇鲁`**（**整串**都在脚下 = 拍板 ②）。
   ⚠️ **非野怪 NPC 的头顶名一字未动**（请抽查一张有普通 NPC 的图，例 `100` / `990`）—— 名字仍**在头顶、黑描边**，这一格若变了就是 bug。
   ⚠️ **等级以 `<battle>` 为准 ⇒ 4 处会和名字不符，这是预期**：`133.xml` 的 3 只荧光蝶显示 **8/9/10**（名字里写的是 10/11/12）、`408` 的多利显示 **Lv14**（名字里写 Lv70）⇒ 判据 = **脚标的等级和打到的等级一致**（`MDB11` 口径）。
4. **惊讶特效 + 延迟开战（`-d`）**：点一只野怪 ⇒ 它**站定** + **头顶冒「!」**，**播完（≈0.8 秒）才**进 `#/rbattle`。
   ⚠️ 这一条里要看的四件：① **期间连点不重复触发**（不会开出两场战斗）；② **在「!」没播完时按浏览器返回 / 走光口 / 换图 ⇒ 不许过一会儿自己跳进战斗**（必须被取消）；③ **点普通 NPC 不受延迟**（对话面板照旧即时出）；④ 首次进图若**没看到「!」就直接开战** = 素材还在装载（**不伪造一段空等**）⇒ 再点一次/再进图就有。
5. **MDB10 气泡回归（连带项）**：野怪驻停时**表情/台词气泡仍在头顶**（不掉到脚下、不被脚标压住）—— 撤头顶名**理论上不影响**气泡（基线一直挂在 sprite 顶边），这一条是**复核它确实没影响**。
6. **两条渲染路都验 1–4**：JS 回退图（例 `10030` / `424`）与 SWF 图（例 `131` / `151`）各走一遍；SWF 路"怪动或换帧才重绘"的脏闸仍生效 = **待机时阴影/脚标不得一闪一闪**。
7. **已知不做（别当 bug 报）**：PNG 支路不加阴影、`stationary` 怪不播 `personal`、**不复刻"叫角色走过来"**（点怪仍是**原地开战**、角色不跑过去）、`<wild @visual>` 不吃、219 张真值没写怪的图仍然没有怪；前景遮挡穿帮 / `content_mc` 烘焙怪 = 旧登记项（`AGENTS §4.14` ① / `§8.22` 第 5 条）。
8. **零改动面抽查**：光口 / 角色外观叠层（M8）/ HUD / 昼夜 / 战后回图落点（MB10）无回归；F12 Network **不应出现新的 `/swf/**` 请求**（阴影与「!」两张是 `game/data/actor/*.bin`，与玩家角色**共用同一份缓存** ⇒ 角色那边已经装过就不再拉）。

---

## 9. 四条拍板（`MIP1–MIP4`）+ 追加复核四条 · **本份局部编号** —— ✅ **全部已决（人类 2026-10-18）**

> 本节的编号只是**本份**的（不是圆圈数字「人类决议 ①–⑧」，索引见 `AGENTS.md §5`）。四条都是**人类点答**，下文保留原文 + 记下答复与落地。

| # | 问题 | 事实（可核） | ✅ **人类 2026-10-18 答复 / 落地** |
|---|---|---|---|
| **MIP1** | ⚠️ **`activity[]` 条件（占地图条件 **48%**）与"活动 = A 组出局"直接冲突 —— 怎么解？** | 【样本】**设计侧口径**（剥注释，`docs/map/map-design.md §2.1`）：条件侧 `activity[…]` **1,025** 条 / 64 个 id；动作侧 `setActivity` **603** 次；`door` 184（= 门线入口）；`spt` 173（A 组）。**这是 `docs/map/map-condition.md §7.2 CSQ4` 与本份的共同问题** | ✅ **接受建一个「会话/存档级键值袋」（activity id → 平键 → 字符串，只存取、无开放时间/无奖励/无 UI）** ⇒ 落地 = **D9**（袋 = **复用存档的 `<activityStorage>`**，不开新字段；A5 纯读、`setActivity` 只写袋）+ **`MDB3-d` 解阻**（§3.3）+ `setActivity` 改动（§3.4）+ 手测 §8.3 第 3 条 |
| **MIP2** | **通行面（`walk` 列）什么时候进桥？** | `docs/map/map-move.md §3.1`（M7 `MDB7-a` 要桥预产）vs 现状 = **运行时**从 SWF 解析（`game/swfshape.mjs` 的 `walkGridOf`，由 `mapScene.js:434/438 sendWalkGrid` 调） | ⏸ **"通行面不实现"**（人类 2026-10-18）⇒ **`walk` 列不产、`MB8` 搁置**（§2 / §3.8 / §8.7）；**D5 由"过渡期"升级为长期**（走位继续交 `MapRunner.as`）。⚠️ **同一轮又裁定"不判断通行 = 哪里都能走"** ⇒ ✅ **`MB9` 漫游照做、无碰撞**（§3.9 / §8.8）。⚠️ **MB8 重启前置** = 先定"通行面来源" |
| **MIP3** | **过渡期"光口位置来自 AS3、目标图来自 Unity"（`D3`）能不能接受？** | 【样本】两套光口坐标系**169/169 全差 >4px**（`docs/map/map-teleport.md §2.6`）⇒ 不能嫁接；AS3 **308** 条 / Unity **393** 条 | ✅ **接受**（"画面归 AS3、规则归 Unity"）⇒ **D2/D3 确认**；两套数据**各自自洽、不许混算**（`MDI3`） |
| **MIP4** | **`#/map` 的实体渲染在 NPC 落地后要不要从 SWF 改成 DOM？** | 本线**零像素**（`MP4`）；但 `MapRunner.as` 没有 `npc` 概念（`docs/map/map-design.md §2.11`）⇒ 实体目前**根本不上屏** | ✅ **实体（NPC / Avatar / pet）表现 = 用 SWF 美术素材** ⇒ **新增 D10**（数据面归本线、**取图与图层机制归 B3**）；⚠️ 留一条**开放项**给 B3：NPC 的**美术映射**（`<npc>` sprite/resId → 具体 SWF 素材）需 B3 与素材层一起定 |
| （附）| **注释口径**（本份 §10 的两处"⚠️ 口径复核"） | M3 §2.1（未剥注释）vs 设计 §2.1（剥）：差 **27 元素 / 29 子条件**，**全在 `<!-- -->` 里**；`MQ2` vs M1 §3.2 对"第 ③ 级"两种读法 | ✅ **"注释直接忽略"** ⇒ **D11**：权威 = 剥注释、剥掉的一律丢弃（**无例外**）、grep 值只作对账参考；❌ `swfFromComment` 取消、③ **只认 `<id>.swf`**；线索只在注释里的图登记 `swf-missing` |

### 9.1 追加复核（人类 2026-10-18 第二轮 · 原我方四条"待复核 / 待讨论"）

| # | 我方原记（待复核） | ✅ 人类 2026-10-18 | 落地 |
|---|---|---|---|
| **① `setActivity`** | 两种选择："写袋" / "不写袋" | **"需要执行相应的记录 `setActivity`"** ⇒ **执行 = 真往袋里写一笔** | ✅ **确认 D9**（写进存档既有的 `<activityStorage>`）；解掉 `winHandler` 里 **132 条 `getPet`** 被活动条件挡住那件事 |
| **② 玩家侧可通行** | 只谈了 NPC（漫游），没谈玩家 | **"玩家暂时也不判断可通行区域，先直接全部区域可以通行"** | ✅ **现状即如此 ⇒ 无需改码**：`game/maprunner/MapRunner.as:38` `USE_GRID=false` ⇒ 整图可走（`:291/:297/:421`）；可走表只喂调试叠加层（`docs/map/map-move.md §3` 头部注）。`walk` 列仍不产、**MB8 仍搁置**；`MP6` 在**玩家侧暂缓**（**D5**） |
| **③ 野怪数据来源** | 我方原选**先用现役 `game/data/wild.json`**（认为它与舞台同坐标） | **"野怪数据在重启中的地图代码中应当已经编写了吧？"** ⇒ 人类对：**重启侧确实有真值** | ✅ **改口径**：桥产 `wild` 列（`MDB7-a` 原计划），MB9 吃它；现役 `game/data/wild.json` = **我方合成、非真值 ⇒ 退场**（`§3.9`、`docs/map/map-move.md §3.4`）。⚠️ **可见变化**：252 张图有怪 → 真值 **53 张** |
| **④ 素材 / 逻辑的血统** | B3 §3 = 房间各层"**视觉依赖 SWF 素材 ⇒ 归 AS3**"；D10 = 实体表现用 **SWF 素材** | **"画面素材归 AS3，但是画面逻辑归 Unity。这个我们需要进一步讨论。"** → 次日再答：**"地图美术选 A：数据先行，素材使用 SWF，画面逻辑仍 AS3，但 NPC 和野怪的分布仍采用重启数据，并进行简单换算，位置出现误差可以接受。"** | ✅ **已决 = 路线 A**：素材与画面逻辑**都仍归 AS3**；**NPC / 野怪的分布吃重启数据**（`<npc pos>` / `<wild>`）⇒ **简单换算** = `fx = ux/960`、`fy = uy/540`（重启参考画布 **960×540**；现役管线本来就吃归一化 ⇒ `MapRunner.as:222-223`）；**位置误差接受**。落地见 **D10** 与 `docs/view/scene/room/view-scene-map-content.md §8.2`（含两条派生待办：NPC 上屏通道 / 人眼校位置） |

---

## 10. 回执台账（本份对 design / 邻线的改动）

| 对象 | 本份要改的 | 状态 |
|---|---|---|
| `docs/map/map-design.md §9.2/§9.3` | 补齐 `map-impl.md` / `map-code-map.md` 的**指针**（从"待写（阶段一续）"⇒ ✅ 已成文待评审） | ✅ **已合并（2026-10-18）** |
| `docs/map/map-design.md §4.1`（落点表） | ★**一处收窄**（**D4**）：`operator.ts` **不新建**，复用 `game/core/parser/operator.ts`（`docs/map/map-condition.md §6` 已 101 行照搬 + `CSI3`"一份分派表"） | ✅ **已合并**（以 §9.3 的注记**指向本份 §4**；**§4.1 表体未动**，等评审后决定是否直接改表） |
| `docs/map/map-design.md §4.1`（落点表） | 落点名以子设计为准：`core/map/nav.ts`（M7 §3.2）而非 `navigator.ts`；并补 `keys-battle.ts`/`dialog.ts`/`battle-spec.ts` | ✅ **已合并**（同上，注记指向 `docs/map/map-code-map.md §2.2`） |
| `docs/map/map-design.md §9.2`（MB1–MB5） | 本份**不动 MB 编号**，只是**排成 9 个执行序可停点**（§2）；`MDB5-a` 折进 MB1、`MDB7-a` 延到 MB8（**D5**） | ✅ **已合并**（§9.3 注记） |
| `docs/map/map-code-map.md` | 本份的 §3/§4 与它 §2/§4/§5 同源；落地后同步它 §7 状态列 | —— |
| `docs/arch-code.md §2` | L0/L1/L2 行的"`map` 待落" ⇒ 阶段二落地后翻"已落" | ⬜ 待落地 |
| **编排线** `docs/orchestration/orchestration-impl.md` | 两条接缝请求（**R-1** `currentMapId` / `battleOrigin`+`lastBattle`、**R-2** `changeScene` 入参）与 4 条回执（**E-2**） | ⬜ 待合并 |
| **子设计 M1–M7** | 各自的 §8"配对 impl 指针"从"待写"⇒ ✅ 已成文；批序以本份 §2 为准（**不动它们的批号**） | ✅ **已合并（2026-10-18）** |
| 📝 **子设计 M8** `docs/map/map-actor-look.md` | 新增**角色外观（穿戴装备 / 骑乘坐骑）资料索引**；指针已接进 `map-design.md §9.1/§9.2/§9.3` + 本份头注/§0/§2/§7.3.8 + `map-code-map.md §2.3/§2.4/§7`。**2026-10-20 拍板**：`ALQ1=A` + `ALQ2=B`；`ALQ3–ALQ8` 按建议默认（**`ALQ7` 当日晚些由 A 改 B**）；`<equip>` schema 落 `save-xml-spec §2.22`。**配对 impl 计划 = 本份 §3.10（`MDB8-a…g`，插入 `b2`）** | ✅ **已合并（2026-10-20）**；`MDB8-a` **已落并手测通过**（as-built §7.3.15）· `MDB8-b`/`b2`/`b3`/`c`/`d` **已落并手测通过**（as-built §7.3.17/§7.3.18/§7.3.19/§7.3.20/§7.3.21）· `MDB8-e` **代码已落**（§7.3.22）· `MDB8-f` **代码已落**（§7.3.23）· `MDB8-g` **代码已落**（§7.3.24）· **e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）（M8 代码已全落、手测全清）** |
| ✅ **`docs/map/map-condition.md §2.1`**（**已决 2026-10-18**） | **口径复核（数字不一致，须人定）**：M3 §2.1 = **未剥注释**口径（`<condition>` **2,023** / 子条件 **2,160** / `activity` **1,035** / `data.` 399 / `firstPet.` 294 / `item` 60 / `map.` 7），而 `docs/map/map-design.md §2.1/§2.2` = **已剥注释**口径（**1,996** / **2,131** / **1,025** / 391 / 284 / 50 / 6）——两者**差 27 元素 / 29 子条件**，**差额全在 `<!-- -->` 里**。按设计侧自己立的纪律（"先剥注释再解析"），**应以设计侧为准**；但 M3 §2.1 自称正本 ⇒ **需人拍板统一口径后回改一处**（M3 §7.3 第 7 条**已自报此账**）。本份 §3.3/§9 已按**设计侧口径**写（M3 §3.5 的"64%"等**相对占比**不受影响） | ✅ **已决（2026-10-18）= D11「注释直接忽略」**（权威 = 剥注释；M3 §2.1 的数转为**参考值**并已加注） |
| ✅ **`MQ2` ↔ `docs/map/map-data.md §3.2`**（**已决 2026-10-18**） | **口径复核（"四级回退"的第 ③ 级到底是哪一级）**：`MQ2` 说 ③ = **`<id>.swf`**，M1 §3.2 说 ③ = **Unity 注释里的 `<resource>`**。**两者只有一处能是第 ③ 级**；本份原打算"两种都算命中 + 注释命中单独标 `swfFromComment`" | ✅ **已决（2026-10-18）= D11**：❌ **注释级线索取消** ⇒ ③ **只认 `<id>.swf`**；`swfFromComment` 撤销，线索只在注释里的图登记 **`swf-missing`**（张数由 MB1 报出） |
| `docs/map/map-condition.md` | ✅ **已合并（2026-10-18）**：**CSQ4 已决**（键值袋 = 复用 `<activityStorage>`）+ §2.1 加"**注释直接忽略**"表后注 + §7.3 第 7 条结账 |
| `docs/map/map-npc.md` | ✅ **已合并**：**MNQ2 已决** + **`setActivity` 由 `unimplemented` 改为「只写袋」**（本条拍板导出的动作侧改动，请一并复核） |
| `docs/map/map-move.md` | ✅ **已合并**：§3 头部 + §3.6 + §7.3 + §8 标 **⏸ 通行面搁置（MB8）/ ✅ MB9 照做** |
| `docs/map/map-data.md` | ✅ **已合并**：§2.9 标"注释一律忽略"（第 1 条线索**否决**）+ §3.2 回退链改为**单一读法** + `MDB1-c` 加 `swf-missing` 登记 + **MDI7** 加严 |
| `docs/map/map-code-map.md` | ✅ **已合并**：`geometry/nav/move-runner` 标 ⏸（**`wander` 例外：MB9 照做**）、状态表 MB8 ⏸ / MB9 ⬜、§9 结账四条拍板 |
| **存档线** `docs/save/save-xml-spec.md §2.14` | ✅ **已合并（2026-10-18）**：一条**回执（不改字段）** —— 地图的活动键值袋 = **既有的 `activityStorage`**，无新增字段、不破 round-trip（**E-6**） | ✅ **已合并** |
| `AGENTS.md §4`（台账） | 地图线：**design 已齐（M1–M7）** + **impl/code-map 已成文** + **`MIP1–MIP4` 四条已决（2026-10-18）** + **通行面搁置（但 MB9 漫游照做）** | ✅ **已合并（2026-10-18）** |
| **B3** `docs/view/scene/room/view-scene-map-content.md §3` | ✅ **已合并**：表后加一条**人类 2026-10-18 拍板 ④**（实体表现 = SWF 美术素材，与它既有第 3 行同向）+ **留一条开放项**（NPC 的 `<npc>` sprite/resId → 具体 SWF 素材，需 B3 与素材层一起定，**E-7**） | ✅ **已合并** |
| ⚠️ **B3**（**新证据，2026-10-18**） | ✅ **已合并**（同日人类**裁决 = 路线 A**）：两条实测（重启自带底图 240 张 / 蒙版 88 张；两套坐标不可简单换算，146 对残差中位 61px）**仍作为证据留档**，新加"**裁决的落地口径**"表 + 两条派生待办 ⇒ `docs/view/scene/room/view-scene-map-content.md §8.2` | ✅ **已合并（2026-10-18）** |
| `AGENTS.md §4`（台账） | §9.1 追加复核 ①②③④ **四条全部结账**（④ = 路线 A） | ✅ **已合并（2026-10-18）** |
| `docs/map/map-move.md §2.8` | ✅ **已订正（2026-10-18 · MB1 实测）**：`<self>` 两形切分 **2,788 / 732 → 2,682 / 838**（合计 3,520、distinct 31 三者不变） | ✅ **已合并** |
| `docs/map/map-data.md §3.2` | ✅ **已同步（2026-10-18 · MB1 as-built）**：`geometry` 形状订正（`mask`/`collision`）、`worldIdKnown` 口径（`category ∈ {1,2,100}`）、新增 **`switchRaw`** 与 **`entities.npcs[].wild`** 两行、`handlers` 补"每元素一段"口径 | ✅ **已合并** |
| `docs/map/map-data.md §2.9` | ✅ **已填（2026-10-18）**：`swf-missing` = **55 张**（其中 **48** 照注释取能 resolve）+ 四级回退命中 **4 / 134 / 32** | ✅ **已合并** |
| `docs/map/map-code-map.md §1/§3/§5.3/§7` | ✅ **已同步（2026-10-18）**：`content.js` 现状行（不再"无出口"）、MB1 状态翻"已落"、§5.3 补 **`mapList()`** 一行 | ✅ **已合并** |
| `AGENTS.md §4`（台账） | ✅ **已合并（2026-10-18）**：地图线 **MB1 已落码**（含体检数字与两条订正） | ✅ **已合并** |
| ✅ **`docs/map/map-data.md §3.1/§3.2/§3.4/§4/§5/§6/§7`**（**方案 C，2026-10-18**） | 桥 → **现场解析器**：落点表（`parse-map.js`/`map-audit.mjs`/`loadMap`）、数据流向、`MDI9` 作废、§6 现状表、"跨图统计只剩对账" | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-design.md §4.1/§5 MP1/§8/§9.1.2/§9.2/§9.3`** | 落点表加 **L1 解析器** / `MQ2` 行加运行时注 / **MP1 重写**（按需 fetch 单图）/ 新增 **§9.1.2（方案 C）** / `MB1` 重定义 | ✅ **已合并（本次）** |
| ✅ **`docs/arch-code.md §2/§3 规则 4/§5`** | L2 行改 `loadMap(id)`；**明写"fetch / 读 JSON 是允许的"**（要守的是"取数入口单一"）；地图不走开机全量拉表 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md §1/§2/§4/§5/§7/§8`** | 退役 `maps.json`/`build-map-entities.mjs`；新增 `parse-map.js`/`map-audit.mjs`；`M-6`/`M-7` 改述 | ✅ **已合并（本次）** |
| ✅ **`AGENTS.md §4`**（台账，**本次**） | 地图线 **MB1 依方案 C 重落**（产物退役、现场解析、对账工具） | ✅ **已合并（本次）** |
| ✅ **`AGENTS.md §5`**（**决议 ⑨**，2026-10-18） | **新增人类决议 ⑨** = **内容可运行时按需获取**（`fetch` / 读 JSON 都允许；守"取数入口单一" + L0 零第三方依赖） | ✅ **已合并（本次）** |
| ✅ **`docs/arch-code.md §2/§3.1`**（MB2） | L0 行"`map` 待落" ⇒"**进行中**（`map-table`/`button` 已落）"；目录树与 §3.1 归属表补 `map/**` | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md §1/§2.2/§7`**（MB2） | 两件翻"已落"、§7 加 MB2 行、§1 现状表 `core/map/**` = 2 文件 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-data.md §3.3` / `docs/map/map-npc.md §3.1`**（MB2） | 标 **✅ 已落**；补两个常量 + `PET_ACTIONS`；写明 `ButtonSpec` 的**构造归 L1** | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-design.md §9.2/§9.3`**（MB2） | MB2 定义改写（**算子不新建**、`map-table.ts` 补上）+ 下一步翻 MB3 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md`（全篇）**（MB3，2026-10-18） | ① **★文件名订正**：§2.3/§5/§6 等 **19 处** L1 目标文件名 `.ts` → **`.js`**（另 **39 处**带 `logic/map/` 前缀的，两轮合共 **58 处**；旧写法**零残留**）—— `build-core` **只扫 `game/core/`**，`game/logic/**` 放 `.ts` 会**没人执行**；② §2.2 `condition.ts` 翻 ✅ + `operator.ts` 行改述（MB3 已按 **D4** 复用）+ `keys-battle.ts` **缓到 MB7**；③ §2.3 `condition-host.js` 翻 ✅ + **补 `entity.js` 的"XML 片段 → `ButtonSpec`"职责**；④ §5.2/§5.4 补 6 行接口；⑤ §7 MB3 行翻 ✅；⑥ §8 加第 9 条（`.js` 核对）与 MB3 实检记录；⑦ §9 下一步翻 MB4 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-condition.md`**（MB3，2026-10-18） | ① **★`§7.1 CSC8` 就地订正**（`activity` 平键里的 `[...]` 是**常态**：读侧 **947 / 1,025** 条（92%）· 写侧 **578 / 603** 条（96%）⇒ **不判"多级下标"**，只有**值**侧 `≠[default]` 才登记）；② §3.2 表：`A5` 按订正改述、`A9–A12` **拆成四行**（★`A11 player.` 两键**真读** —— 原合并行与 §3.4 冲突，取更细者）、`A7`/`A8` 补三值注；③ §3.4 `MapEnv`：`npcRuntime?` 可缺省、`items.count`/`player.*` 加宽成三值、补 `rng.emblem?()`；④ §3.5 批表加**状态列**（`MDB3-a…e` **一次落齐**）；⑤ §6 现状表五行翻新；⑥ §7.3 加头注 + 第 1 条**改为"行为与上游相反"**（上游 `0=0` 恒真 ⇒ 永远执行；我们 `'unknown'` ⇒ 不触发）；⑦ §9 加 1 行（`[...]` 口径回执）+ 扩 MQ3 行 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-design.md` / `map-data.md` / `map-dialog.md` / `map-move.md` / `map-npc.md`**（MB3，2026-10-18） | 仅 **`.ts → .js`** 的文件名订正（**共 8 处**）；**语义未动** | ✅ **已合并（本次）** |
| ✅ **`game/core/map/button.ts`**（+ 生成 `.js`）（MB3，2026-10-18） | 两处**注释**里的 L1 文件名 `.ts → .js`（**代码零改动**，仍跑 `build-core` 重生成） | ✅ **已合并（本次）** |
| ✅ **`docs/arch-code.md §2`**（L0 `map` 行） | `condition.ts` 已落 ⇒ 该行由"进行中（`map-table`/`button`）"改为 **3 件**（`map-table`/`button`/`condition`） | ✅ **已合并（本次）** |
| ✅ **`docs/status.md §1`（地图行）**（MB3，2026-10-18） | 状态台账已从 `AGENTS.md` 拆出（人类同日重构）⇒ 地图行的"下一步 = MB3"翻成 **MB4**，最新 as-built 指 `map-impl §7.3.4` | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md`**（MB4，2026-10-18） | ① §1 `core/map/**` = **4 文件**（补 `action`）；② §2.2 `action.ts` 行翻 ✅ + 补导出清单；③ §2.3 `action-runner.js` 行翻 ✅；④ §5.2/§5.4 补 `resolve`/`run` 两行（含新签名注）；⑤ §6 接触点补"载荷 = `ActionIntent` 本身"；⑥ §7 MB4 行翻 ✅；⑦ §8 第 2 条**加注**（`M-2` 字面 grep 亦命中 `firstPet.` 前缀与注释 ⇒ 真义 = 无静态直调）+ MB4 实检记录；⑧ §9 下一步翻 MB5 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-npc.md`**（MB4，2026-10-18） | ① §3.2 标 **✅ 已落码（MB4）** + 补 `opts`/`reason` 两处偏差指针；② §3.3 执行接缝表补"**载荷 = `ActionIntent`**"一句；③ §7.3 加头注（本批无可玩面 ⇒ 各条等 MB5）；④ §8 指针更新 | ✅ **已合并（本次）** |
| ✅ **`docs/arch-code.md §2`**（MB4，2026-10-18） | L0 `map` 行 → **4 件**（+`action`）；L1 行 +`map/action-runner.js 已落` | ✅ **已合并（本次）** |
| ✅ **`docs/status.md §1`（地图行）**（MB4，2026-10-18） | 最新 as-built 指 `map-impl §7.3.5`；"下一步"翻成 **MB5** | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-impl.md §2/§3.5/§7.3`**（MB5，2026-10-18） | ① §2 批表第 5 行翻 ✅（"第一个玩家能感觉到的批"）；② §3.5 标题翻 ✅ 已落码 + 补 `entity.js`；③ §7.3 表**拆** `MB4–MB9` 为 `MB4`/`MB5` ✅ + `MB6–MB9` ⬜；④ **新增 §7.3.6 MB5 as-built**（改点 3 件 + 判据 + **偏差 6 条**） | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md`（全篇）**（MB5，2026-10-18） | ① §1 现状表 `logic/map/**` = **5 文件**（补 `entity.js`/`session.js`）；② §2.3 `entity.js`/`session.js` 两行翻 ✅ + 写成 as-built 出口（`decideTeleport`/`decideMirror`/`landingSpot`/`mergePortals`；⚠️ `walkTo`/`enterMap` 副作用依 **D5** 留 SWF）；③ §2.4 `mapScene.js` 行标 ✅ MB5 部分（④对话/战斗待 MB6/MB7）；④ §4 装配图后"已落"小结翻新（`loadMap` **已有消费者**）；⑤ §7 MB5 行翻 ✅；⑥ §9 下一步翻 **MB6** | ✅ **已合并（本次）** |
| ✅ **`docs/status.md §1`/§2**（MB5，2026-10-18） | 地图行"下一步"翻 **MB6**、as-built 指 `map-impl §7.3.6`、批栏 +`MB5`；§2 请人测**加一条 MB5**（光口传送/昼夜/`auto`，点 NPC 等 B3） | ✅ **已合并（本次）** |
| ✅ **`AGENTS.md §4`**（第 15 条 · MB9 围栏，2026-10-19） | 新增围栏条：野怪漫游（MB9）**照做、只 JS 回退图、无碰撞**；SWF 路不给野怪叠游荡；农场/动物/虫/巢仍不画 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-code-map.md §2.2/§2.4/§7`**（MB9 + A2 + B，2026-10-19） | §2.2 加 `logic/map/wander.js`（L1）行 ✅；§2.4 围栏行标 **★MB9**（只 JS 路、无碰撞、SWF 路不叠）；§7 状态行 MB9 翻 ✅ | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-impl.md §2/§7.3/§8.8`**（MB9 + A2 + B，2026-10-19） | ① §2 批表 MB9 行翻 ✅（as-built §7.3.11）；② §7.3 汇总表 MB9 行翻 ✅；③ **新增 §7.3.11（MB9 漫游 as-built）/ §7.3.12（A2 头像 + B 前缀表&写回 as-built）**；④ §8.8 判据翻"等人手测"、气泡条标"本批不做（缺 emoji 素材）" | ✅ **已合并（本次）** |
| ✅ **`docs/status.md §1`/§2/§3**（MB9 + A2 + B，2026-10-19） | 地图行 as-built 指 `§7.3.11`/`§7.3.12`、批栏 +`MB9`、"下一步"翻 **MB8 ⏸ / C 档 / `#/battle` AS3 结账**；§2 请人测加 **MB9 / A2 / B 三条**；§3 `[expr]` 风险行改为"**已随 B 批接通**（`readMapValue` 进 `activity.` 前缀、`action.ts` 解早退）"、野怪穿墙行标 ✅ | ✅ **已合并（本次）** |
| **代码落点**（MB9 + A2 + B，2026-10-19） | 新建 `game/logic/map/wander.js`（L1 纯步进 + talk 气泡调度）；改 `game/app/scenes/mapScene.js`（漫游种子/画环 live 位/常驻 rAF + `drawNpcs` 画文本气泡 + `buildMapEnv` 传 items/activities + `setItem`/`setActivity` sink + 对话头 `<img>` 头像）；改 `game/core/map/condition.ts`（+`.js`，`readMapValue`）· `game/core/map/action.ts`（+`.js`，解 `[expr]` 早退）；改 `game/logic/map/dialog-host.js`（`icon` 透传 + `makeExprResolver` 委托）· `game/logic/map/npc-art.js`（`iconUrl`） | ✅ **已合并（本次）** |
| ✅ **`AGENTS.md §4.15 / 新增 §4.18`**（`MDB11`，2026-10-21） | §4.15 ①「**只 JS 路游荡**、SWF 路照 `MapRunner.as` 自己溜达」**作废** ⇒ 两条路都走；§4.15 ⑤ 补「野怪遭遇**只剩 Unity 真值一条路**」；**新增 §4.18** = 野怪分布单一来源、`wild.json`/`WildPet` **运行时零引用**、219 张空图**拍板接受不伪造** | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-move.md` / `map-code-map.md` / `map-data.md` / `map-swf-puppet.md`**（`MDB11`，2026-10-21） | 把 2026-10-18 起的"**退场**"措辞统一改成"**已断**"（`map-move §2.9`/`:475`/`:530`/`:573`/`:576`/`:631`、`map-code-map:28/:56` + §2.4 边界、`map-data §2.4/§3.2`、`map-swf-puppet:37/:67` = `MPQ4` 野怪链**无对象**）；`map-move §3.4` 落本批实测数 | ✅ **已合并（本次）** |
| ✅ **`docs/status.md` / `docs/asset-inventory.md`**（`MDB11`，2026-10-21） | 状态台账地图行 + 请人测 + 三点名 + **两条会红/会哑的旧工具**登记；素材台账 **AS25**（`wild.json` 运行时零引用）/ **AS13**（`swf/pet/normal/*` 不再 fetch）/ **AS12**（抓取名单仍来自合成表，与运行时无关） | ✅ **已合并（本次）** |
| ⚠️ **`tools/verify-wild.mjs` / `tools/map-engine-toggle-test.mjs`**（`MDB11` 波及，2026-10-21） | 两条脚本的野怪段**指向已退役通路**：前者复跑必 `exit 1`（「图上没有野怪」）；后者落进 `skip:野怪表未就绪` 分支，而该分支字符串是**真值 ⇒ 被记成 pass = 不再测任何东西**。**决议 ⑦：不清除、不新增** ⇒ 如实登记为"复跑红/哑属预期" | 📝 **登记，不改码** |
| **代码落点**（`MDB12`，2026-10-21） | 新建 `game/logic/map/pet-view.js`（L1 纯换算：`PET_LABEL_ALIAS`/`resolveLabel`/`petAction`/`petFrame`/`petHitRect`/`petDrawShift`）；改 `game/logic/map/npc-art.js`（+`petAppearanceId`）；改 `game/app/scenes/mapScene.js`（`+PET_CACHE`/`PET_FPS` + `ensurePetPack`/`petHitOf`/`drawPetFrame` + 投位支路 + `drawNpcs` 每项 `ax/ay` + 两处命中 + `stepWanderLoop` tick 与"帧变"闸）；抓 `swf/pet/normal/**` **34 个新包**（48→82）入库 | ✅ **已合并（本次）** |
| ✅ **`AGENTS.md 新增 §4.19`（+ §4.18 尾部后继指针）**（`MDB12`，2026-10-21） | **新立 §4.19**（不是塞进 §4.18，避免两条口径混读）：野怪**素材** = Flash 帧包优先（`resId`→形象 id→`pet_appearance_swf.csv`→`swf/pet/normal/<n>.swf`，JS 侧 `parsePack` 解、**不碰 AS3**）+ **15 种/30 只/15 图无对应物 ⇒ 仍走重启 PNG** + **分布仍以 Unity 为唯一真值** + 四条新禁令（`personal`/阴影/惊讶/`Lv` 脚标）+ ❌ **不吃 `<wild @visual>`**；§4.18 末尾加一句「本条只管分布，素材见 §4.19」 | ✅ **已合并（本次）** |
| ✅ **`docs/map/map-move.md` / `map-code-map.md` / `map-data.md` / `map-npc.md`**（`MDB12`，2026-10-21） | `map-move §2.9`（`WildPet.as` 的**素材语义**被 JS 侧照抄、本体仍不生成）+ `§3.4`（38 包标签审计 / 中文别名 / 尺寸区间 / 立绘 vs 帧包尺寸对照）；`map-code-map` 加 `pet-view.js` 行 + `npc-art` 的 `petAppearanceId` + 桥 CSV 的消费端 + §2.4 边界一句；`map-data §2.4/§3.2` 加**素材真值**结论；`map-npc` `<wild>` 节登记 `@visual` = **死数据** | ✅ **已合并（本次）** |
| ✅ **`docs/view/scene/room/view-scene-map-content-impl.md`（B3）**（`MDB12`，2026-10-21） | `#npc` 层的**取图来源**加一条 `MDB12` 追记（野怪这一格：重启 PNG → **帧包优先 / PNG 兜底**）；图层机制 / z 序 / 点击面**不变**（B3 拥有图层、地图线拥有数据与素材选择 = `AGENTS §4.14` 边界） | ✅ **已合并（本次）** |
| ✅ **`docs/status.md` / `docs/asset-inventory.md`**（`MDB12`，2026-10-21） | 台账：地图行下一步 = `MDB12` + ★MDB12 请人测 + 四条拍板登记 + 六条已知风险；素材：**AS13**（`swf/pet/normal` 48→82、运行时**重新** fetch = `mapScene.js ensurePetPack()`）、**AS27**（桥 CSV 消费端 +「野怪上屏」）、新增 **ASG**（`Resources/Pets/pet/*.png` 未入库且**立绘≠地图 sprite**） | ✅ **已合并（本次）** |

---

> **下一步（2026-10-18 更新，MB5 已落）**：**MB1（方案 C）** · **MB2（基石类型）** · **MB3（条件求值）** · **MB4（动作决议 + 执行器）** · **MB5（会话 + 传送接线）** 均已落码 ⇒
> **先跑 §8.1 对账**（`node tools/map-audit.mjs`，应打印 `95 / 54 / 393 / 110 / 4/134/32` 等；MB2–MB5 落码后这组数**不变** = 下沉/条件/动作/接线都没改解析语义）。
> ✅ **MB5 是第一个"玩家能感觉到"的批** ⇒ 现在**该请人进图看**了：**§8.2**（光口传送 + 出生点 + 昼夜按钮）+ **§8.4**（`auto` 进图触发经 `#log`）。
> ⚠️ **NPC 不上屏**（`MapRunner.as` 无 `npc` 概念、"上屏通道"归 **B3**）⇒ **点 NPC 触发对话/战斗/传送**这条链**数据与派发建好（`window.onNpcClick`）、人手测不了**；依 §7.3 第 5/7/8 条，进梦境 `−139/−209`、场景包图 `10012…` 进出、不可达光口硬穿防护**今天测不了，别记死账**。
> ⚠️ **sinks 只接了 `teleport`**（其余 `openHintbox`/`openPanel`/`battle`/`setActivity`/道具/宠 ⇒ `no-sink` 登记、不动状态）⇒ 端到端提示/面板随 **MB6**+ 各自批闭合。
> 反馈回来后按 `AGENTS.md §1` 第 4 条**同时修订文档与代码**，再进 **MB6（对话：`core/map/dialog.ts` + `logic/map/dialog-host.js` + A3 接缝）—— ⚠️ 必与 MB7 同批；`[expr]` 求值器随 MB6 落**（人类 2026-10-18 确认）。
> ⚠️ **顺带请 B3 定两件**（开放项，**不阻 MB2**）：**D10 的"NPC 美术映射"**（`resId`/`animId` → 具体 SWF 素材、`<npc>` 上屏通道，`docs/view/scene/room/view-scene-map-content.md §8.2`）；
> ③ **通行面（MB8）**等你重新开启；✅ **MB9 漫游已在施工序里**（无碰撞）。
> ⚠️ **MB7 那一批**会带回**两个 battle 审计数字**（`battle-action-dangling` = 8 / `battle-branch-unreferenced` = 154）—— 本轮**没记死账**，是**改挂**到 MB7（§7.3.1 偏差 ①）。
> ✅ **④ 已决（2026-10-18）= 路线 A**：素材与画面逻辑仍 AS3、**实体/野怪分布吃重启数据 + 简单归一化换算**（`fx = ux/960`）—— 落地见 **D10** / **§3.9** / `docs/view/scene/room/view-scene-map-content.md §8.2`。
>
> ✅ **M8（2026-10-20 · 手测全清、全线收口）**：角色外观 `MDB8-a` **已落并手测通过**（数据桥 + L1 纯计划，as-built **§7.3.15**）；`MDB8-b`（JS 路 11 槽渲染）+ `MDB8-b2`（帧动画 + 4 向，含同日两轮手测修补）+ `MDB8-b3`（光轮/阴影手动切换）**已落并手测通过**（as-built **§7.3.17 / §7.3.18 / §7.3.19**，人类「全部完美」）；`MDB8-c`（会话态 + 正式调试入口）**已落且手测通过**（as-built **§7.3.20**）；`MDB8-d`（坐骑速度 25/20 + 13 只浮动坐骑 ±5）**已落且手测通过（2026-10-20，人类「it worked good」）**（as-built **§7.3.21**）；`MDB8-e`（素材补齐 + 清单）**已落码**（as-built **§7.3.22**）⇒ **§8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」）（缺件 108 已于 `MDB8-e2` 补齐）**；`MDB8-f`（SWF 叠层）**已落码**（as-built **§7.3.23**）⇒ **§8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**；`MDB8-g`（存档 `<equip>` 接线）**已落码**（as-built **§7.3.24**）⇒ **§8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」）**；`MDB8-f2`（SWF 裸装角色显隐 · 修「双角色」）**已落码**（as-built **§7.3.25**，含 `MapRunner.as` 的 `actorVisible` 回调 + 重编译）⇒ **§8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**。`a`–`g`+`f2` 代码已全落、**M8 手测全清**（整条清单 = `docs/map/map-actor-look.md §11`）。
