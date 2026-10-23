# M9 · SWF 路角色提线化（地图与角色相分离）—— 设计（✅ 人类 2026-10-20 评审通过）

> 种类 = **design（真值/目标）**；父 = `docs/map/map-design.md §9.1`；代码地图 = `docs/map/map-code-map.md §2.4`。
> 触发 = 人类 2026-10-20 手测 M8-f2 后反馈「SWF 图角色移动一抖一抖，JS 图没有」，在「一行提频 / 只改 JS 外推 / 彻底分离」三选中**点名选 D（彻底分离）**。
> **总原则（人类 2026-10-20 复审原话「按照 JS 背景图那里的设定不就行了」）**：SWF 路的角色 = **照抄 JS 图那一套** —— 走位、朝向、帧动画、canvas 绘制**全部用 JS 图同一实现**（同一条 `stepJs` 数学 + 同一个 `drawActor`），Flash 退为**纯背景 + 相机从者**；原 `MPQ1–MPQ6` 依该原则在 §5 **一次性收敛为记录**。本份 = M9 设计定稿，`MDB9-a` 起发码。

---

## 1. 问题与根因（有据）

- **JS 图顺**：走位事实由 JS 每帧自算（`game/app/scenes/mapScene.js:stepJs`），画面 = 同一帧同一数据画 ⇒ 60fps 连续。
- **SWF 图抖**：走位事实在 Flash 里（Ruffle 舞台 24fps），canvas 叠层只能吃跨语言回报；
  `game/maprunner/MapRunner.as:617` 每 **6 帧**回报一次 `mapState` ⇒ **每秒仅 4 个坐标点**。
  M8-f2 修补 ① 的指数平滑（τ≈55ms）远小于 250ms 回报周期 ⇒ "追到新点、停住等下一条" = 冲-停-冲，抖感仍在。
  **结论：平滑救不了采样率；根治 = 让"角色位置"这个事实改由 JS 逐帧产生，Flash 退为"背景 + 相机 slave"。**

## 2. 目标 / 非目标

**目标**
1. SWF 图的**角色驱动权与绘制权都归 JS**：走位、朝向、帧动画、画面全部走 JS 图**同一实现**（`stepJs` 数学 + `drawActor` canvas），逐帧连续；
2. `MapRunner.as` **退化为纯背景播放器 + 相机从者**：地图美术/光口贴图/昼夜/野怪 sprite/遮挡仍由 SWF 画；SWF 自带的裸装 `ActorView` 在 puppet 位**恒隐藏**（不再出现黄点/双角色取舍）；
3. 两路观感统一：**同一角色实现、同一帧节拍、同一画法**，抖动根治；此后 JS 图/SWF 图的差别只剩**背景来源**（Unity PNG vs Flash SWF）。

**非目标（本轮不做）**
- 不把 NPC/野怪遭遇数据搬到 SWF 侧或反向（B3/MB7 口径不动）；
- 不动通行面（仍 `USE_GRID=false` 整图可走 = `MapRunner.as:38` 现状，与 §4.6 MB8 搁置同口径）；
- 不做正式装备面板/联机外观（C1/C2/A 组围栏仍在）。

## 3. 现状职责表（MapRunner 里"以角色位置 ax/ay 当真值"的机制）与归宿

| AS3 机制（证据） | 现状 | 提线后归宿 |
|---|---|---|
| 走路积分 `tick`（`MapRunner.as:618-639`，`SPEED=4`:34） | 沿 route 每帧挪 ax/ay | **JS `stepJs` 接管**；AS3 在 puppet 位下**跳过** route 推进 |
| 相机 `placeActor`（`:644-653`，§4.16④ 黑边修复后的包围盒口径） | world.x/y = clamp(角色居中) | **留在 AS3**（不重实现钳位！）：JS 调 `setPos(x,y)` ⇒ AS3 挪 ax/ay + `placeActor()` ⇒ **同步返回 `[camX,camY]`**，JS 同帧用返回值画 canvas ⇒ 角色与背景零错位 |
| 点击走位 `onGroundClick→jsWalkTo`（`:521-540`；光口 = **点击落点** `spotAt`，路过不触发） | 意图与执行都在 AS3 | Ruffle 吃掉舞台点击 ⇒ AS3 改**上报意图**：`post({type:'mapClickWant',x,y})`；JS 收 = 走位目标 + 光口判定（JS 侧已有 `portalHit`/`M.spots`，`mapScene.js:1224`），执行归 JS |
| 光口传送 `arriveAtSpot→mapEnter`（`:555-560`） | AS3 到站后发 | JS 到站判定后直接 `gotoMap`（JS 路已如此）；AS3 链在 puppet 位闲置 |
| 野怪(sprite)漫游 + 点击开战 `WildPet.as:206-265` → `petCallActor/petActorArrived/petFight`（`MapRunner.as:582-609`） | 野怪要"叫角色走过来"（内部 route） | ⚠️ **本行整条已随 `MDB11`（2026-10-21）无对象**：宿主喂 `wild: ''` ⇒ `setWild()` 空 ⇒ **一只 `WildPet` 都不生成** ⇒ `petCallActor` / 那条"叫角色走过来"的**野怪支路**成为死码（`mapWantWalk`/`walkReached` **协议本身不动**，仍服务角色走位与光口）。野怪 = 我们 `#npc` 叠加层那一份，点击 = `onNpcClick → resolve→run → startMapBattle`（**不等角色走到脚下**），漫游由 JS **两条路**播 ⇒ 正本 = `docs/map/map-impl.md §7.3.33` / 手测 `§8.27`。原设计（留档）：`petCallActor` 在 puppet 位改发 `mapWantWalk`，JS 走到后调 `player.walkReached()` ⇒ AS3 回调 `startFight`（状态机留 AS3，腿交 JS） |
| 位置回报 `mapState`（`:617`）/ `mapArrive`（`:629`） | canvas/黄点/HUD 的唯一位置源 | puppet 后 JS 自给 ⇒ `mapState` **降为兜底/对照**，`mapArrive` 停用（收口在 c 批） |
| `mapPets` 逐帧回报（`:615`） | 野怪标签 `drawLabels` | ⚠️ **已随 `MDB11` 退役**：`pets.length==0` ⇒ AS3 不再发 `mapPets`；JS 侧 `drawLabels()` 与 `#lbl` 脚标层**整条拆除**（合成野怪的 `Lv+名字` 没有对象了）⇒ 本列旧判据"不变"作废，见 `docs/map/map-impl.md §7.3.33` B-6/B-9 |
| 裸装角色 `ActorView` + `actorVisible`（f2，`:387-390`） | canvas 叠层接管时隐藏 | puppet 位 **恒隐藏**（`onActor` 装载即 `visible=!puppet`）：角色由 canvas 叠层**常开**画出（同 JS 图，含裸装/换色/缺包 fallback），黄点与「有装备才叠」的 `canDrawActor` SWF 分支在 puppet 路**退役**；`actorVisible` 回调保留 = 调试关 puppet 时旧链照旧 |
| 出生点 `jsLoadWorld(initX,initY)`（`:158-166`）+ MB10 回图 `spawn=x,y` | AS3 摆初值 | 不变；JS 首帧把同一初值灌进 `M.pos` 并 `setPos` 对齐相机（两方同源、无竞态） |

## 4. 新契约（puppet 协议，全部为 `MapRunner.as` 的**第三处授权例外**，人类 2026-10-20 点名 D = 预授权，细则以本份评审为准）

```
JS → AS3（Ruffle `player.<名>(...)` = ExternalInterface addCallback；返回值经 Promise 异步回来，**不作同帧位置源**）
  setPos(x:Number, y:Number, moving:Boolean):String  // 写 ax/ay/moving + placeActor()，返回 "world.x,world.y"（仅作校准）
  walkReached():void                                  // 回应 mapWantWalk：JS 已走到，AS3 触发野怪开战回调链
AS3 → JS（post 消息）
  mapClickWant { x, y }       // 舞台点击 → 世界坐标（puppet 位替代内部走路；光口/目标点判定交 JS）
  mapWantWalk  { x, y }       // 野怪请求"把角色叫到 (x,y)"（替代内部 route）
  mapReady 追加字段 x, y, sw, sh, puppet   // 出生位 + 舞台尺寸（JS 本地相机钳位的输入）
开关
  SWF URL 参数 puppet=1 默认开；调试位 `#/map?…&puppet=0`（经 `P.get('puppet')` 透传）= 切回旧链（f2 平滑跟随仍在线）
```

- **JS 每帧流程**（rAF，`stepJs` 同一条数学）：推进 `M.pos`（定速 + 坐骑 `speedFactor`）→ **本地照抄 `placeActor` 钳位公式**（`mapX/mapY/mapW/mapH` 吃 `mapReady`、`sw/sh` 吃 `mapReady` 回报）得 `M.cam` → `player.setPos(...)` **fire-and-forget**（AS3 于自己 24fps 节拍挪背景相机）→ `drawActor` 画在 `cam+pos`。两端**同一公式、同一 ax**，数值零分歧；时间差 ≤1 个 AVM2 帧、位移 ≤1px ⇒ 肉眼无错位。`setPos` 返回值异步回来后**校准**本地 `M.cam`（防舞台尺寸假设错）。
- **朝向/动画**：puppet 下 JS 知道**意图**（目标点方向），直接喂 `ACTOR_ANIM`（`stepDirection` 与 JS 图同源）⇒ 拐角滞后一并消失。

## 5. 决策记录（`MPQ1–MPQ6` · 人类 2026-10-20 定总原则「照抄 JS 图」⇒ 全部随原则收敛，无遗留）

| # | 问题 | 结论（= 照抄 JS 图的直接推论 / 建议值） |
|---|---|---|
| **MPQ1** | `setPos` 调用频率 | **每浏览器帧 fire-and-forget（≈60Hz）**，与 JS 图每帧自算同节拍；实测卡顿再降频（§4） |
| **MPQ2** | 黄点基线 | **puppet 路退役**：角色一律 canvas 叠层常开（同 JS 图，裸装也画），SWF 自带角色恒隐藏；`puppet=0` 旧链里黄点照旧 |
| **MPQ3** | 走位手感 | **照抄 JS 手感**：复用 `stepJs` 数学与 `JS_SPEED`（`0.28px/ms ≈ 280px/s`）+ 坐骑 `speedFactor`；SWF 世界界更大 ⇒ 速度作**人眼校常量**（不齐只调 JS 侧，不回填 AS3 曲线） |
| **MPQ4** | 野怪"点击→走过来→开战"链 | **状态机留 AS3、腿交 JS**（`mapWantWalk`→JS 走→`walkReached`→AS3 `onActorReached` 判距 `≤8px` 开战，`WildPet.as:255-261`）；改动面最小。⚠️ **本项已随 `MDB11`（2026-10-21）无对象**：AS3 侧不再生成 `WildPet` ⇒ 这条链**没有触发者**（协议 `mapWantWalk`/`walkReached` 仍留给角色走位，**不动 AS3**）⇒ 现状 = 点我们叠加层的野怪**直接开战**（`onNpcClick` 那台机，与渲染路无关）。正本 = `docs/map/map-impl.md §7.3.33` |
| **MPQ5** | `mapState`/`mapArrive` 回报去留 | **保留（`puppet=0` 旧链需要它）+ puppet 位不消费**（JS 自给 ⇒ `mapState` 降为对照/兜底），收口在 c 批 |
| **MPQ6** | puppet 默认值 | **默认开**（全图一致）；调试位 `#/map?…&puppet=0` 一键回旧链（人测期回退保险） |

## 6. 施工批（设计评审通过后，落 `docs/map/map-impl.md` 新 §3.11 再发码；一次一批、停手测）

- **MDB9-a · 提线最小闭环（走/传送/开战三链一起过 puppet，否则野怪开战会断）**：
  - **AS3**：`setPos`/`walkReached` 两个 `addCallback`；puppet 位下 `tick` **跳过走路段**（`jsWalkTo`/`petCallActor` 改**只上报** `mapClickWant`/`mapWantWalk`、不内部积分 route）；`mapReady` 追加 `x/y/sw/sh/puppet`；`onActor` 装载即 `actor.visible = !puppet`；重编译 `mapRunner.swf`。
  - **JS**：`mapClickWant`→用**现有 `portalHit`/`M.spots`** 判目标点与光口、`mapWantWalk`→野怪脚边目标点；两者都置 `M.walkTarget` 并起 **`stepJs` 逐帧走**（复用同一条定速 + 坐骑 `speedFactor` 数学）；每帧**本地 `placeActor` 钳位公式**（吃 `mapReady` 的界 + 舞台尺寸）算 `M.cam` → `drawActor` 叠层**常开**（`canDrawActor` puppet 位恒真、黄点分支不触发）→ `player.setPos(...)` fire-and-forget（返回 Promise 仅校准 `M.cam`）；到站：光口 ⇒ `gotoMap`、野怪 ⇒ `player.walkReached()`（AS3 触发 `startFight`）。
  - **验收** = SWF 图连续走动**无抖**、**只有一只 canvas 角色**、点地走 / 点光口传送 / 点野怪走到脚下开战三链都通、`puppet=0` 旧链逐字节回退。手测 = `map-impl` 新停点（§8.20 puppet 分支）。
- **MDB9-b · 回归与边角**：MB10 回图 spawn 落点、昼夜镜像、B3 SWF 路 NPC 点击、HUD 状态读数在 puppet 数据面上全回归；缺包/无装备仍走 `drawActor` 的 fallback（缺自定义包 ⇒ 裸装小赛尔、非黄点）。
- **MDB9-c · 收口**：退役 `mapState/mapArrive` 消费与 `swfFollowPoint` 补丁（被根治取代，登记"由 M9 根治"）、文档级联（AGENTS §4.16④/§4.17 例外清单改写为"例外三 = MDB9 puppet 协议"）、旧链调试位去留结账。

## 7. 风险与对策

1. **ExternalInterface 桥成本**（每帧 1 次 `setPos`、3 参、fire-and-forget）：a 批实测；若 Ruffle 有抖动/掉帧 ⇒ 降频（隔帧调）或缓存增量（MPQ1 已备）。**不 `await` 返回值**（返回走 Promise 异步、只做事后校准），避免每帧挂起 rAF。
2. **两源竞态**：puppet 位下若 AS3 残链（`jsWalkTo` 被 HUD/调试误触）会与 JS 抢 `ax/ay` ⇒ puppet=true 时 `tick` 无条件跳过走路段，`jsWalkTo` 只转发 `mapClickWant` 不自走。
3. **相机钳位公式分歧**：JS 本地照抄 `placeActor` 钳位 ⇒ 若舞台尺寸假设错会整体错位；对策 = `setPos` 返回值（"world.x,world.y"，Ruffle 经 Promise 异步回）做**事后校准**，不作同帧位置源（先例 = `jsHudStatus():String` 证明 `addCallback` 可带返回值）。
4. **换图/卸载**：puppet 态是 per-player；`loadMapRunner`/`unmount` 复位（同 f2 缓存纪律）。
5. **昼夜镜像**：实测镜像 = **JS 侧换孪生图**（`mapScene.js:onMirrorClick` → `gotoMap(-id)`），AS3 无 flipX 逻辑 ⇒ puppet 态随播放器重建自然复位；b 批按 §8.20 第 6 条同法回归即可。

## 8. 与既有围栏/批次的关系

- `game/maprunner/**` 例外清单更新为**三处**：① §4.16④ 相机修复、② f2 `actorVisible`、③ 本份 puppet 协议（✅ 已写进 `AGENTS §4.17⑤` + `map-code-map.md` / `map-impl §3.10.10` 围栏清单）。
- M8-f/f2 的叠层、显隐、平滑跟随**不改语义**：`swfFollowPoint` 在 a 批保留（无 puppet 回退位仍吃它），c 批随旧链一并退役。
- B3 SWF 路 NPC、MB9 只 JS 游荡、MB7 战斗触发：数据面不变，b 批只回归验证。

---

**状态（人类 2026-10-20）**：设计**已评审通过**（总原则「照抄 JS 图」，`MPQ1–MPQ6` 全随原则收敛、见 §5）。`map-impl §3.11` 已编；✅ **`MDB9-a` 已落并手测通过（as-built `map-impl §7.3.26`、重编译 `mapRunner.swf` 29390 字节、手测 `§8.21`「nice, 现在ok了」= 抖动根治达成）**；**`b` = 交互改道回归（清单 `map-impl §8.22`，代码审计 = 四条链路结构兼容、零新增码 ⇒ 纯人回归，✅ 已过 2026-10-20「都过」）**；**`c`（旧链退役收口）✅ 已拍板 A·退役（人类 2026-10-20「A · 退役」）、落码并手测通过（as-built `map-impl §7.3.27`、手测 `§8.23` ✅ 2026-10-20「整体结账」= ★M9 全线结账）** —— ⚠️ **文中一切「`&puppet=0` 调试回旧链 / 旧链照旧」的口径自此进入历史态**：JS 不再透传 `puppet` 参数，puppet = 唯一 SWF 走位通路；AS3 侧参数默认 `"1"`、旧走位段成惰性死码（**不重编译**），旧链 JS 码可从 git 历史找回。一批一停手测。
