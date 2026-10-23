# 代码架构（arch-code.md）

> 子文档 of `docs/architecture.md`。本文是**代码结构**的详细面：目录树、每层文件与入口、依赖规则、
> 子系统骨架、真实链路、生成物纪律、已知偏差。
> **抽象分层表与不变量见父文档 `architecture.md §1/§2`**（本文只做展开，不重复）。文档面见 `docs/arch-docs.md`。

---

## 0. 范围

只覆盖**重启血统**（活跃主线）。AS3/SWF 血统（`game/legacy`、`game/maprunner`、`game/scenes`、
`game/fightui`、`game/kernel`）只登记位置，不展开。

---

## 1. 目录树（仓库全貌）

```
seer2/
├─ game/
│  ├─ core/**        # L0 战斗内核（.ts 权威 → 同名 .js 生成）；battle/ buff/ effect/ parser/ pet/ map/
│  ├─ logic/**       # L1 域逻辑（零 DOM 纯函数）：rng.js stats.js settle.js phases/** session.js restartSession.js save/** map/parse-map.js
│  ├─ data/**        # L2 内容表：*.json（AS3 血统）+ unity/*.json（重启血统）
│  ├─ app/**         # L3 表现 + L4 编排：main.js router.js state.js content.js scenes/** view/** ui.css
│  ├─ index.html     # 网页 SPA 入口
│  └─ kernel/ fightui/ maprunner/ legacy/ scenes/   # AS3/SWF 血统相关（只登记）
├─ tools/**          # 构建 / 对拍 / 夹具 / 浏览器 harness（分层见 §7）
├─ projects/**       # 上游参考（只读）：Seer2-Restart-Lite-main/、rocoshowdown/、bake/
├─ vendor/**         # 镜像（只读）
├─ ruffle → node_modules/@ruffle-rs/ruffle   # 软链
├─ swf/ samples/ assets/ assets_swf/         # 美术 / 场景二进制素材
├─ docs/**           # 文档（见 arch-docs.md）
└─ package.json
```

---

## 2. 各层文件与入口

> 抽象分层表见父文档 `architecture.md §2`。这里给每层的**实际文件与入口**。

| 层 | 目录 | 入口 / 导出 | 说明 |
|---|---|---|---|
| **L0 域引擎** | `game/core/**` | 内核 API（`battle`/`buff`/`effect`/`parser`/`pet`；**+ `item` 待落**，见 `docs/item/item-design.md §4.1`；**+ `map` 进行中**（`map-table`/`button`/`condition`/`action` **已落**，MB2/MB3/MB4 2026-10-18；其余见 `docs/map/map-design.md §4.1`））| `.ts` 权威；`.js` 生成物。零引擎依赖 |
| **L1 域逻辑** | `game/logic/**` | `rng.js`、`stats.js`、`settle.js`、`phases/**`、`session.js`、`restartSession.js`（⚠️ 这两件在 **app 侧已退役**，人类 2026-10-18 ⇒ 编排线 **ORP3**：v2/v3 直接废弃、只认 XML 档；文件保留供既有测试/工具）（**+ `item/store.js` 待落**、**+ `map/session.js`/`map/entity.js` 待落**；**`map/parse-map.js` 已落**（方案 C）、**`map/condition-host.js` 已落**，MB3 2026-10-18）、**`map/action-runner.js` 已落**，MB4 2026-10-18）；**`save/**` 已落**（`schema`/`codec`/`newgame`/`storage`/`repository`，见 `docs/save/save-impl.md §9.3/§9.4`） | 无 DOM 纯函数；`storage`/`auth` **注入**。⚠️ **本层文件名一律 `.js`**（`build-core` **只扫 `game/core/`** —— 放 `.ts` 在这儿会**没人执行**） |
| **L2 内容桥** | `game/data/**` + `game/app/content.js` | `loadContent()` → `petConfig`/`skillView`/`normalStatusOf`/`swfIdOf`/`restart*`；地图 = **`loadMap(id)`**（按需 fetch 单图 Unity XML + 现场解析；解析器在 L1 `game/logic/map/parse-map.js`） | 宇宙权威**单一出口** |
| **L3 表现** | `game/app/view/**` + `game/app/ui.css` | `hud/restartHudView`、`petbag/**`（背包/仓库，C1）、`panels/restartItemBagView`、`battle/restartFighterStage`、`battle/skillCardView` | 手写 DOM（D2）|
| **L4 编排** | `game/app/scenes/**`、`router.js`、`state.js`（**目标另加**：`session.js`、`sceneLoader.js`、`platform.js`、`runtime/bootstrap.js`、`runtime/*.js`、`services/*.js` —— 见 `docs/orchestration/orchestration-code-map.md §2`） | `mapScene`/`battleScene`/`rbattleScene` 的 `mount`/`unmount`；`go(route)` | 场景挂载、输入、**会话 / 启动编排**（~~宇宙分流~~ 已于 2026-10-18 作废 ⇒ 只认 XML 档，见该线 **ORP3**；**design = `docs/orchestration/orchestration-design.md`**，2026-10-17 立线；**impl = `docs/orchestration/orchestration-impl.md`**，2026-10-18 已评审、未发码） |

---

## 3. 依赖规则（可 lint）

1. **L0 零引擎依赖**：`grep -E "UnityEngine|Player.instance|Photon|Database.instance" game/core/**` 必须**空输出**。
   ⚠️ **按字面今天就不成立**（实测 2026-10-17：`game/core/**.ts` **63 命中**，全在注释与抛错字符串里；非注释开头的 4 行是
   `game/core/effect/effect-judge.test.ts:262,889,968,969` 里 `throw new Error('native UnityEngine.Random')` 的**字符串字面量** ⇒ **真实违反 0 处**）。
   规则要表达的是"**不许真的引用这些符号**"，而注释/抛错文案**应当**指名上游出处（否则证据标注没法审计）。
   **待拍板**：改为「剥离注释与字符串字面量后，四个符号零命中」并脚本化为 `tools/check-headless.mjs`。
   登记处 `docs/runtime/runtime-components-design.md §3.8 / §8.3 Q5`；未拍板前本条**按现状语义执行**（人工判注释 vs 引用）。
2. **L0 `.js` 是生成物**：`.ts` 权威、同名 `.js` 由 `tools/build-core.mjs` 转写；改 `.ts` **必重跑**（§7）。
3. **单向向下**：上层调下层；下层不认识上层。唯一例外 = L3 `view/**` 直接 `import content.js`（§8 已注册）。
4. **L2 单一出口**：只有 `content.js` 负责 `fetch` 内容表；场景与 view 从它取数。
   ⚠️ **fetch / 读 JSON 是允许的**（L1/L2/工具都可）—— 要守的是"**取数入口只此一处**"：地图**按需**取数（`loadMap(id)` 每次现场 fetch 单图 XML），**不是**开机全量拉表。**这就是人类决议 ⑨**（内容可运行时按需获取，不设门禁）。
5. **存档单一入口**：`game/app/**` 只经 `game/logic/save/repository.js` 触达存档。
   ✅ **已接线（2026-10-18）**：app 侧仅三个文件碰它 —— `game/app/session.js`（会话：读/写活跃档）·
   `game/app/scenes/loginScene.js`（B5 批 C：3 格投影 / 建号 / 导入 / 进图）· `game/app/runtime/bootstrap.js`（只建 `storage` 适配器）。
   ⚠️ `game/logic/restartSession.js`（v2/v3 旧档）**只被当内存模型的纯函数**用（**ORP7 = A**：`findPet`/`addPet`/`settleRestart`/…），
   它的 `loadRestartSession`/`saveRestartSession` **零调用**；`game/app/scenes/battleScene.js`（AS3 遗留页）仍走 v2 内存档 —— 见 `docs/orchestration/orchestration-impl.md §7 偏差 1`。
6. **两血统不合并**：`game/data/*.json`（AS3）与 `game/data/unity/*.json`（重启）不得互相覆盖（父文档 §1.2）。

### 3.1 L0 内部：**底座 → 域模型线 → 战斗引擎线**

`core/**` 是同一个 L0，但内部**归属按上游目录 / 类名**判，**依赖必须单向**（引擎 → 域模型 → 底座）：

| 区 | `core/**` 落点 | 上游 | 被谁依赖 |
|---|---|---|---|
| **公共底座** | `mathf` `numutil` `strutil` `collections` `vocab` `rng` | 工具类 / `IClass` | 所有 |
| **效果语言 + 表** | `effect/effect.ts`、`effect/effect-database.ts` | `Basic/Effect/Effect.cs`、`EffectDatabase.cs` | 域模型线 **+** 引擎 |
| **域模型线** | `pet/{status,element,linear}.ts`、`buff/**`、`parser/{identifier,parser,operator}.ts` | `Basic/Pet/**`（**非** `Battle/`）、`Basic/Buff/**`、`Identifier.cs:10-188` | 引擎 |
| **战斗引擎线** | `battle/**`、`effect/{effect-judge,ops-*}.ts`、`parser/identifier-effect.ts`、`pet/{status,buff,skill}-controller.ts` | `Scene Specific/Battle/**`、`Basic/Pet/Battle/**`、`Effect{Ability,Condition}Handler.cs`、`Identifier.cs:190-548` | 只被 L1+ 依赖 |
| **地图线** | `map/**`（`map-table.ts` / `button.ts` / `condition.ts` / `action.ts` **已落**，MB2/MB3/MB4 2026-10-18；`dialog`/`battle-spec`/`geometry`/`nav` 待落） | `Scene Specific/Map/**`（`Map.cs` / `NpcButtonHandler.cs` / `NpcHandler.cs` / `NpcConditionHandler.cs` / …） | 只被 L1+ 依赖（`docs/map/map-design.md §4.1` · `docs/map/map-code-map.md §2.2`） |

- **判据（一句话）**：类名以 `Battle` 打头，或住在 `Basic/Pet/Battle/` / `Scene Specific/Battle/` ⇒ **引擎**。
- **权威边界表**（逐文件判定 + 跨界例外 + 位置偏差）见 `docs/engine/battle-engine-design.md §8.4`。
- **域模型线的内部结构**（族图 / 依赖序 / 不变量 V1–V7 / 与引擎的 7 条接缝）见 `docs/domain/domain-design.md`；
  子设计 `docs/domain/domain-{base,status,effect,buff,skill,pet,info}.md`（**D1–D7 全部已写**）。
- ⚠️ **位置偏差（待阶段二机械迁移）**：`core/pet/{status,buff,skill}-controller.ts` 是**引擎件**
  （上游 `Basic/Pet/Battle/PetBattle*Controller.cs`），暂寄在 `pet/`；目标 = `core/battle/pet-{status,buff,skill}-controller.ts`。
- ⚠️ **反向的位置偏差（域件寄在引擎区，D5 登记）**：技能族的**域侧语义**目前住在 `core/battle/` ——
  `battle/skill-table.ts`（247，九列 ctor ↔ 逆函数）+ `battle/views.ts` 的 Skill 半边（约 300 行，标识符读写 / 克隆 / 五工厂），
  而权威枚举 `SkillType`（上游 `Skill.cs:727-731`，§8.4 判归**域模型线**）定义在引擎文件 `battle/damage.ts:22` 里，被上面两处 import。
  目标落点 = `core/pet/skill.ts` + `core/pet/skill-table.ts`；施工批 **B1–B3** 与门禁见 `docs/domain/domain-skill.md §3.3`。
  - **两种读法要说清**（本仓库没有 zone-lint 脚本，§3 的硬规则 #1 只 grep `UnityEngine|Player.instance|Photon|Database.instance`，方向靠文档判）：
    **按 §3.1 的"归属按上游目录/类名判"** ⇒ `battle/**` 整体是引擎区，今天**不算破** §3 硬规则 #3；
    **按 §8.4 的文件真值** ⇒ `Skill` 本体属域，`SkillType` 就是**引擎文件替域侧定义权威类型**，
    且 `pet/skill-controller.ts:13-14` 已经**从域目录 import 引擎目录** ⇒ 一旦 B2/B3 把 `Skill` 对象搬回 `core/pet/skill.ts`，
    不先做 **B1** 就会**立刻**造出 §3 #3 的反向依赖。**所以 B1 必须在 B2/B3 之前**，且 D6/D7 落地时别照抄这个形状。
  - ⚠️ 这条与上一条**方向相反**，别并成一件事：上一条是**引擎件寄在域目录**（目录名不对、箭头没错），
    这条是**域语义寄在引擎目录**（箭头迟早指错）。
- ⚠️ **同族的第二条（D7 登记）**：`GetSortPriority`（上游 `Helper/HelperMath.cs:13`）是**纯整数函数**，
  但那个文件声明在 **`namespace UnityEngine`** 里（`:7`），且被三处 `database` 排序调用（`PetInfo.cs:27` / `ItemInfo.cs:15` / `BuffInfo.cs:14`）。
  ⇒ 域侧照搬就是把引擎命名空间引进来；目标落点 = `core/mathf.ts`，施工批 **B1**（见 `docs/domain/domain-info.md §3.3` / `§5 G12`）。

---

## 4. Model 骨架：存档子系统

**读写接口**（纯函数，`storage` 与数值权威均**注入**，便于测试）：

- **现状**：`game/logic/restartSession.js` —— 键 `rocoshowdown.restart.v3`、**JSON**。
  - `loadRestartSession(storage, auth, {starterId, starterLevel})`、`saveRestartSession(storage, state)`。
- **目标**：忠实 **XML** 真档 —— 新模块 `game/logic/save/**`、键 `seer2.save{n}.xml`。
  - 真值与落地分别见 `docs/save/save-design.md`（+ `save-xml-spec.md`）与 `docs/save/save-impl.md`（+ `save-code-map.md`）。

**状态形状**：

| | 现状（v3 JSON） | 目标（XML 真档） |
|---|---|---|
| 顶层 | `v / trainer / team / box / items / dex / evolve / battle / _authority` | 上游 `GameData`：`petBag(12) / petStorage / itemStorage / mailStorage / missionStorage / activityStorage / battleRecordStorage / settingsData / yiteRogueData` |
| 精灵 | 最小字段 `{uid,petId,level,exp,hp}` | `Pet` 全子树（`basic/feature/exp/talent/resist/skills/record/ui/currentStatus`）|

**子模块清单**（现状 v3；目标见 `save-design.md §4`）：

| 子模块 | 字段 | 操作 |
|---|---|---|
| 训练家 | `trainer` | 名/等级/货币 |
| 精灵栏 | `team`（≤6）、`box`（≤240） | `findPet`/`addPet`/`swapTeamBox`/`releasePet` |
| 道具 | `items[{id,count}]` | `countItem`/`addItem`/`consumeItem` |
| 图鉴 | `dex{id:{seen,caught}}` | `dexSee`/`dexCatch` |
| 进化 | `evolve.pending[]` | 结算尾统一 `apply` |
| 战斗槽 | `battle`（进行中战斗，回图归 `null`） | 结算时清空 |

> **关键设计**：宠只落盘最小字段，`name`/`swfId`/`hpMax` **一律现算**（`auth.*`），保证"换表不过期"。
> `auth` 由场景经 `content.buildRestartAuth(rules)` 组装注入。**XML 目标形状会改这条**（改为全字段建模）。

**结算**：`settleRestart(auth, state, action)` —— 回写 HP（夹到 iv=0 上限）→ 发经验 → 判进化 → 出事件流。

---

## 5. Model 规则面：内容与数值

- **单一出口**：`game/app/content.js`（`loadContent()` 后暴露 `petConfig`/`skillView`/`normalStatusOf`/`swfIdOf`/`restart*` 系列；
  地图 = **`loadMap(id)`** —— 按需 fetch 单图 Unity XML + 现场解析，见 `docs/map/map-data.md §3.1`）。
  场景与 view 都从它取数，不各自 `fetch`。
- ⚠️ **地图不走 SPA 开机全量拉表**：与上一条的六张 JSON 不同，地图是**每次进图按需取**（`loadMap` 不缓存；人类 2026-10-18 拍板）。
- **两条真值树**：本线权威 = `game/data/unity/*.json`（重启血统）；`game/data/*.json`（AS3 血统）**只借一个用途**：
  动画 id（`swfIdOf`）。两表共用数字 id 空间，桥是纯字段改名。
- **已知偏差**：部分 `view/**`（如 `restartItemBagView`、`battle/skillCardView`）**直接 import `content.js`**。
  这是"组件自取数"，偏离经典 MVC。是否收敛（改为 props 注入）见 §8。
- ✅ **已修的偏差（2026-10-18）**：`game/app/view/petbag/index.js` 原来**直接 import `game/logic/petbag/*`**
  （`source.js`/`grid.js`/`actions.js`/`constants.js`，4 行，按 §3 硬规则 #3 是未登记的 L3 → L1 下行 import）。
  **人类 2026-10-18 拍板"收敛成注入"** ⇒ 四个逻辑件改由**装配层** `game/app/scenes/mapScene.js` 经
  `opts.logic = { createPetBagSource, createGrid, actions, BAG_SIZE, PAGE_SIZE }` 注入（缺了 `index.js` 会**抛错**，不静默降级）。
  实测 `grep -rn "from '..*logic/" game/app/view/` **零命中**（`content.js` 那条例外不在 `logic/` 下）。
  ⚠️ 这不是"新例外"，是**回归 §3 原则**；其余仍直接 import `content.js` 的 view 文件照旧（上一条已登记）。

---

## 6. 一条真实链路（点野怪 → 打 → 回图）

1. `mapScene` 点怪 → 判宇宙 → 写 `state.battle` → `go('rbattle', …)`（`router.js`）。
2. `rbattleScene.mount` → `content.loadContent()` + `loadRestartSession(storage, auth)`。
3. `createCoreBattle`（`battle/driver/coreBattleDriver.js`）跑真内核：`content.petConfig` 造宠 → 内核 `phase.js` 推回合。
4. 内核整回合同步返回战报 → `phaseUi.js` 渲染 → `view/**` 手写 DOM 画版式；`restartFighterStage` 用战报增量反推 clip。
5. 结算 `settleRestart` 回写 v3 → `APP.lastResult` handoff → 回图刷新 HUD。

---

## 7. 生成物纪律（改源必重生成）

| 生成物 | 源 | 生成器 |
|---|---|---|
| `game/core/**/*.js` | 同名 `.ts` | `tools/build-core.mjs` |
| `game/data/unity/*.json` | 重启 C# 内容表 | `tools/build-unity-data.mjs` |
| `tools/oracle-cs/bin\|obj` | `tools/oracle-cs/*.cs` | 构建 |

`tools/` 分层：`tools/vendor/`（三方，勿改）、`tools/probes/`（一次性探针，可弃）、
`tools/oracle-cs/`（差分 oracle 的 C# 源）、`tools/fixtures/`（夹具）、`tools/` 根（**只放稳定入口**）。
本线新增稳定入口：`tools/serve.mjs` = 静态服务 + `/saves/*` 写端点（见 `docs/save/save-impl.md §6.1`）。


## 8. 已知偏差 / 待定（open）

- **view 直接读 content**（§5）：收敛成注入，还是保持？
- **`router.js` 竞态**：`route()` 不串接进行中的 `mount()`，`#/map` 后立刻跳 `#/rbattle` 会叠层。
  修法与绕行见 `docs/view/scene/battle/view-scene-battle-impl.md §14.4`。
- **scenes 偏胖**（`mapScene` 664 / `battleScene` 650 / `rbattleScene` 441 行）：是否把控制器逻辑抽薄。
- **exp 系数**待内核 S6 搬 `ProcessResult`/`SetExp` 后换血。
- **存档 v3 → XML 换血**：`restartSession.js` 退役、`game/logic/save/**` 落地（`docs/save/save-impl.md`）。
- **`core/pet/*-controller.ts` 位置**（§3.1）：引擎件寄在域模型目录，待阶段二机械迁移到 `core/battle/`。
