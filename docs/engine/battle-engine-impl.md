# 战斗引擎线落地计划（battle-engine-impl.md）

> **父文档 / 真值**：`docs/engine/battle-engine-design.md`（总设计：边界 / 模块图 / 不变量 E1–E8 / 六条跨模块口径 / §8 子设计地图 / §8.4 域模型边界）。
> **子设计（design 已齐，本份只映射不重述）**：E1 `battle-engine-state.md` · E2 `battle-engine-phases.md` · E3 `battle-engine-units.md` · E4 `battle-engine-effects.md` · E5 `battle-engine-judge.md` · E6 `battle-engine-session.md` · E7 `battle-engine-views.md`。
> **移植事实与对拍**：`docs/engine/kernel-handoff.md`（**本份的 as-built 代理**：S1–S6 落点、各批门禁数字）· `docs/engine/port-map.md`（逐算子实测）· `docs/engine/oracle-playbook.md`（操作手册 + 陷阱登记）。
> **邻线（本线只调接口，不复制真值）**：
> 域模型与求值线 `docs/domain/domain-design.md`（§8.4 归属真值；`Effect`/`Buff` 数据模型 + 求值 DSL 在它那边）·
> 运行时线 `docs/runtime/runtime-components-design.md`（R1–R7 契约，引擎只调接口，人类决议 ③）·
> 存档线 `docs/save/save-xml-spec.md`（BattleRecord / BattleSettings 引擎侧语义交叉登记）·
> View 线 `docs/view/scene/battle/view-scene-battle-design.md` + `view-scene-battle-stage.md`（出口 DTO 的消费者）。
>
> **状态**：⏳ **已写，待人类评审（阶段一续）** —— 本份把 `kernel-handoff.md` 兼任的「impl 配对」事实正式落到线规文档；**尚未发新码**（落码要等本份 + 各子设计 design 一并过评审，见 `AGENTS.md §1`）。
> ⚠️ **本份不重复 design 的子设计细节，也不重复 kernel-handoff 的移植机制**；只做三件事：① **design（E1–E7）→ 代码文件** 的映射；② **施工批总表**（已绿 / 待发）；③ **验收口径 + 请人测项 + 偏差登记**。
>
> **编号纪律**（与 `AGENTS.md §5` 一致）：施工批沿用 `kernel-handoff.md` 的 **S1–S6 段** + **批一…批四** 命名（**不重编**）；本份新增的待拍板用 **EP1–EPn**（⚠️ **本地编号，不是人类决议 ①–⑧**）；落地决策用 **D1–Dn**（本地表内序号）。

---

## 0. 这份文档回答什么（与 design 的分工）

| 问题 | 在哪 |
|---|---|
| 目标形状、不变量、六条口径、子设计地图、域模型边界 | **design**（`battle-engine-design.md`） |
| **E1–E7 各自落到哪些 `game/core/**` 文件、当前绿/黄/红** | **本份 §2** |
| **还有哪些批没发、按什么顺序发、解锁什么** | **本份 §3** |
| 移植机制、对拍数字、陷阱 | `kernel-handoff.md` / `port-map.md` / `oracle-playbook.md` |
| 接缝签名与默认行为（四个「门」） | 运行时线 / 存档线 / View 线（design §6 已列，本份 §4 只给落点索引） |

**一句话结论**：战斗内核的**无头规则层（L0）已经大面积落地并全绿**（S1–S3 各层 + 判定外壳 + 批一/批二/批三/批四 A 档，基线 `向量=30431 可比=29935 不一致=0`，见 `status.md`），剩的是**算子长尾 8 支 / 同种子重放 S4 / 结算成长 S5 / 宠物表接 oracle S6** 四块，以及 **`pet/*` 位置迁移 + 会话层 `logic/settle.js` 去手炒** 两件收尾。

---

## 1. 落地决策（D1–Dn）

| # | 决策 | 内容 | 依据 | 需人拍板 |
|---|---|---|---|---|
| **D1** | **未移植显式抛（NOT_PORTED）** | 移植体对未移植算子**显式抛**，不静默降级（刻意偏离上游 `DefaultAbility` 静默 `true`）；生产 `JUDGE` 仍 `NOT_PORTED`，真判定只在 harness 按 kind 作用域注入 | design §5.6 / E7；`kernel-handoff.md §5a` | — |
| **D2** | **算子长尾按真表频次 + 随机臂照做** | 余 8 支（rage/copy_buff/set_buff/set_pet/set_player/poker/set_pet_bag/card）**不再**记为「永久不可比 ⇒ 不做」；随机臂按 **决议 ①** 走 R1 注入、发**合成向量**、验收 = 同 seed 复现 + 形状 + **人类手测**；频次高的先搬（set_pet 289 / rage 166 …） | design §4.1 注；`AGENTS.md §5` 决议 ① | — |
| **D3** | **`pet/*` 位置迁移到 `battle/`** | `pet/{buff-controller,status-controller,skill-controller}.ts` 现住 `core/pet/`，design §3.2 标「⚠️ 位置待挪进 battle/」；随 **S5** 一并迁移，避免引擎圈内跨子目录 | design §3.2 / §8.4(5) | — |
| **D4** | **会话层 `logic/settle.js` 去手炒** | `ProcessResult` 六笔现由 `logic/settle.js` 手抄、**无差分保护**，是最大未对拍面；**S5** 搬进 `core/battle/result.ts`，外部能力（墙钟 R2 / 写盘 R4 / 弹窗 R5）上移走接缝 | `kernel-handoff.md §4（logic 终局）`；决议 ③ | — |
| **D5** | **random 臂与 Photon 闸门分开记** | Photon 的 `ECall` 闸门（win/escape 半可比根因）**与随机无关**，照旧；native 随机臂改发合成向量，不混为一谈 | design §5.5；`oracle-playbook.md §6` | — |
| **D6** | **带等级门槛的捕捉胶囊诚实 NOT_PORTED** | 内核捕捉只对无门槛胶囊（items 10003/10004/10005）真结算；带门槛胶囊（10001/10002）驱动捕获 `NOT_PORTED` 后**诚实提示、不消耗、不判捕捉**（属 S6 宠表未接，不属算子本体） | `kernel-handoff.md §5c` 已坐实 | — |

---

## 2. design（E1–E7）→ 代码映射

> 文件名均为 `game/core/**`（L0 无头纯函数）。oracle kind 取自 `kernel-handoff.md §3`；状态取自各子设计 + `status.md` 基线。
> ⚠️ **`game/core/map/*`（map-table/condition/button/action）属地图线，不归本线** —— 见 `docs/map/map-impl.md`，本份不映射。

| 子设计 | 覆盖 | 落点文件（核心） | oracle kind（摘要） | 状态 |
|---|---|---|---|---|
| **E1 状态** | BattleState + Unit + PetSystem + settings + result | `battle/state.ts`、`battle/settings.ts`、`battle/result.ts`（ProcessResult 未搬，见 D4） | `statecopy/stateid/stateset/stateflag/giveturn/gofirst/petbag/settings/result` | ✅ 绿（result 的 ProcessResult/S5 黄） |
| **E2 相位** | 14 相位流水线 + EffectTiming 推进序 + 队列消费 | `battle/phase.ts`（47KB，`setPhaseBattle` 接缝 :62） | `phaseq/phasedrive` | ✅ 绿 |
| **E3 单位与数值** | Unit/PetSystem/UnitSkillSystem + 战斗数值五段 | `battle/unit-skill-system.ts`、`battle/damage.ts`、`pet/{status,status-controller,element,linear,buff-controller,skill-controller}.ts` | `skillsys/petmut/statusctrl/statusop/elemrel/…` 及 `damage` 的 `m*` 族 | ✅ 绿（pet/* 位置待迁，D3） |
| **E4 效果算子** | 22 算子本体 + 效果语言 | `effect/ops-{basic,buff,heal,powerup,capture,pet,skill,block,state}.ts` + `effect-judge.ts`（Apply 外壳） | `effectapply` 各族（每支所在文件/门槛见 `kernel-handoff.md §3/§5` + `battle-engine-effects.md §2.2/§2.5`） | 🟡 **13/22 进 golden + win/escape 半可比 + powerup 进不了 golden = 14 有实现**；余 8 支未搬（D2） |
| **E5 判定** | Condition 面 + Apply 外壳 + dispatch + 目标 | `effect/effect-judge.ts`、`battle/target.ts` | `effectcond/effectapply` + 补回的 `target(judge:true)` | ✅ 绿（生产 JUDGE=NOT_PORTED，真判定按 kind 注入） |
| **E6 会话编排** | 开战校验 / 驱动循环 / SetSkill 唯一输入接缝 / 自动战斗 / ProcessResult 结算 | `game/logic/**`（session/phases/settle/stats）+ `game/app/battle/driver/coreBattleDriver.js` | —（产品层，不进 core） | 🟡 会话层未进 core；ProcessResult 手炒无保护（D4/S5） |
| **E7 出口** | 内核 → 表现只读 DTO | `battle/views.ts`（579 行） | —（pull DTO） | ✅ 绿（表现层在 View 线 `view-scene-battle-*`） |

**效果数据模型归属（§8.4 边界）**：`effect/effect.ts` + `effect/effect-database.ts` 与 `buff/*` 物理上住在 `core/`，但**概念归属域模型线**（design §2.2 / §8.4）。本线只消费，禁反向依赖；凡涉及 `Effect`/`Buff` 数据模型的改动，真值以域模型线 `docs/domain/domain-{effect,buff}.md` 为准。

---

## 3. 施工批总表

> 沿用 `kernel-handoff.md` 的 S 段 + 批-n 命名。已落部分**不在此重述机制**，只给「批 / 内容 / 落点 / 解锁 / 状态」一行索引；机制与门禁数字见 kernel-handoff 对应节。

### 3.1 已绿（consolidated，detail → kernel-handoff）

| 批 | 内容 | 落点（摘要） | 状态 |
|---|---|---|---|
| **S1 / S1b** | 求值层 DSL + 差分 oracle 立起 | `parser/{parser,operator,identifier}.ts`、`strutil/numutil/mathf/vocab/collections.ts` | ✅ 绿 |
| **S2** | 数值层 + 内容宇宙换重启表 | `pet/{status,status-controller,element,linear}.ts`、`battle/damage.ts`、`rng.ts` | ✅ 绿 |
| **S3 一/二/三/四段** | 效果印记 / 状态快照 / 驱动 / 地基 | `effect/*`、`buff/*`、`battle/{state,settings,result,effect-handler,unit-skill-system,views,phase,target,skill-table}.ts` | ✅ 绿 |
| **S3 第五段** | 判定外壳 | `effect/effect-judge.ts` | ✅ 绿 |
| **批一** | 6 支算子本体 | `effect/ops-{basic,buff,heal,powerup}.ts` + `pet/buff-controller.ts` 围栏解除 | ✅ 绿 |
| **批二** | `set_skill(15)` | `effect/ops-skill.ts` | ✅ 绿 |
| **批三** | `capture(3)` + `pet_change(4)` | `effect/ops-capture.ts`、`effect/ops-pet.ts` | ✅ 绿（门槛胶囊见 D6） |
| **批四 A 档** | `win(1)`/`escape(2)`/`set_weather(17)`/`block_buff(9)` | `effect/ops-{state,block}.ts` | ✅ 绿（win/escape 半可比，D5） |

**当前基线（2026-10-17 复跑，`status.md`）**：`向量=30431 可比=29935 native不可比=0 架子没对上=0 不一致=0` · `node --test game/core/` `pass 304 / fail 0` · `node tools/build-core.mjs` 42 个 `.ts→.js` · 无头 grep 空输出。

### 3.2 待发

| 批 | 内容 | 触达（新建 / 改） | 解锁 | 细化程度 |
|---|---|---|---|---|
| **批五（算子长尾）** | `set_buff(13)`/`copy_buff(12)`/`rage(6)`/`poker(19)`/`set_pet_bag(20)` **已落码 + golden 验收通过**（分别 10/11/8/4/7 条 effectapply 向量，difftest 不一致=0；见 `ops-set-buff.ts`/`ops-copy-buff.ts`/`ops-rage.ts`/`ops-poker.ts`/`ops-set-pet-bag.ts` + `snap-mirror.mjs` 批五段）。随机臂（rage pp 支 `.Random`、copy_buff `random`、poker 抽牌）走 RNG 注入缝（`setOpsRageRng`/`setOpsCopyBuffRng`/`setOpsPokerRng`）⇒ 不可比，留手测。`set_pet_bag` 的增宠支（default·"+"/token·"+"）S6-blocked ⇒ 抛 NOT_PORTED。余 3 支：`set_pet(16)`/`set_player(18)`/`card(21)`；`set_pet`/`set_player` 依赖 S6 宠表，`card` 走围栏外的 `cardSystem` | 新 `effect/ops-*.ts`；`effect-judge.ts#applyAbility` 接 case；`PortedAbilities` 白名单扩 | 长尾战斗行为由内核真结算 | 要点级（每支施工图见 `battle-engine-effects.md §2.5`） |
| **S4 同种子重放** | 我方同 seed 重放自复现（不与上游逐位对齐） | `core/rng.ts`（R1 注入）+ 驱动层 replay 钩 | 随机臂可被主验收（人类手测）覆盖 | ✅ 已接线：`coreBattleDriver.js` 把 9 条 native-Random 注入缝（setOps{Skill,Rage,Poker,Powerup,Pet,CopyBuff,Buff}Rng + setBuff{Resist,Remove}Rng）接到同一个 `createRng(seed)` 流（= 上游 UnityEngine.Random），每局按 seed 新建 ⇒ 同 seed 重放逐位复现；Unit.randomSource 仍独立 |
| **S5 结算成长** | `ProcessResult` 六笔搬进 `core/battle/result.ts`；外部能力上移 R2/R4/R5；`logic/settle.js` 改 import core；`pet/*` 迁 `battle/`（D3） | 改 `core/battle/result.ts`、删 `logic/settle.js` 手炒 | 结算/成长/进化进无头 oracle 保护 | 要点级 |
| **S6 宠物表接 oracle** | 真宠表/技能表接进 oracle（域模型 D6 **B1** 之后） | 域模型 D6 落码后；`core/pet/*`、`battle/skill-table.ts`、`UnitSkillSystem` 构造链 | 宠表相关向量进 golden | 要点级（依赖域模型线） |
| **收尾** | `pet/*` 位置迁移（D3）+ 会话层去手炒（D4）+ 表现层 `view-scene-battle-*` 接线 | 见 S5 | — | — |

---

## 4. 四个「门」的落点索引（design §6 已在，本份不给签名）

| 门 | 接缝 | 落点 |
|---|---|---|
| 引擎 → 表现（只读） | `views.ts` pull DTO | `battle/views.ts`；消费者 = View 线 `view-scene-battle-stage.md` |
| 引擎 ↔ 存档（交叉登记） | `BattleRecord` / `BattleSettings` 同名同义 | `save-xml-spec.md §2.19` + 本线 `battle/settings.ts` / `battle/result.ts` |
| 引擎 ↔ 内容桥（注入） | 内容经 L2 `content.js` 注入，引擎不 fetch | `runtime-components-design.md §3/§5` |
| 选招输入源（主机端口） | `SetSkill` 唯一接缝，5 实现 | `battle-engine-session.md §2.4` + `coreBattleDriver.js` |

---

## 5. 验收口径 + 请人测项

### 5.1 回归门禁（每次落码必跑，现状见 §3.1 基线）

    node tools/difftest.mjs        # 向量/可比/不一致=0；架子没对上=0
    node --test game/core/         # pass 不降
    node tools/build-core.mjs      # 改了 .ts 必跑，勿手改 .js
    # 无头门禁（E1）：core 不得认识引擎/平台
    grep -E "UnityEngine|Player.instance|Photon|Database.instance" game/core/**   # 期望：空输出

### 5.2 请人测项（按决议 ⑦：对拍不可比的不记死账，列具体人手测确认项）

- **随机臂**（capture 掷点支 / pet_change `random` 支 / powerup / set_pet_bag 三支 / poker 整支 / S4 重放）：每支 = 同 seed 复现 + 形状断言 + **人类手测看「伤害/捕捉/换宠是否像重启」**。
- **带等级门槛的捕捉胶囊**（items 10001/10002，D6）：手测确认驱动**提示后不消耗胶囊、不判捕捉**。
- **结算/成长（S5 发后）**：手测一场战斗结束后的 exp/升级/进化/属性是否与重启一致（golden 前唯一验收面）。
- **`pet/*` 迁移（S5 后）**：手测战斗内 buff/状态/技能表现未因目录搬迁回归。
- **长尾算子（批五 发后）**：rage/copy_buff/set_buff/set_pet/set_player/poker/set_pet_bag/card 各挑一个真实技能，手测行为。

---

## 6. 偏差 / 缺口登记（as-built 前的诚实记录）

| 缺口 | 说明 | 处置 |
|---|---|---|
| **会话层未进 core** | `ProcessResult` 六笔现由 `logic/settle.js` 手抄、无差分保护 ⇒ 最大未对拍面 | S5（D4） |
| **E4 长尾 8 支未搬** | 见 §3.2 批五；按 D2 不再记为永久不可比 | 批五 |
| **`pet/*` 位置偏差** | `core/pet/` 应迁 `core/battle/`（design §3.2） | S5（D3） |
| **capture 门槛胶囊 NOT_PORTED** | 属 S6 宠表未接，非算子本体缺陷 | D6，S6 后解 |
| **`logic/stats.js` 失效符号引用** | 自称调 `pet.system.ts calcMaxHp/calcStat`，core 无此名；权威在 `core/pet/status.ts#getPetNormalStatus` | S5 去重时更正 |
| **exp→level 曲线系数仍借 `rules.json` A/B 形状** | 无无头 oracle；存档打 `_authority.exp='borrowed-A/B-shape'` 溯源戳，未谎称换血 | S5 补 `SetExp` 后只换 `auth.exp` 系数 |

---

### 9.1 敌方自动出招（人类 2026-10-19 · 「只有我方会出招」报障 ⇒ 已落码）

**症状**：`#/rbattle` 每回合只有我方行动，敌方恒无操作（战报只有一条我方「使用了」）。
**根因**：`game/app/battle/driver/coreBattleDriver.js` 的 `nextRound()` 里，敌方那一路恒传 `null`
⇒ `pickSkill(pet, null)` 永远返回 `noOpSkill()`（**驱动层从未接过上游的敌方选招**）。
上游真值 = `Battle.cs:361-380`：非 PVP 且 `opUnit.skill == null` ⇒ 逐槽 `opUnit.pet.GetDefaultSkill()`。

**落点（三处，缺一不可）**

| 层 | 文件 | 落了什么 |
|---|---|---|
| **L0 规则** | `game/core/pet/skill-controller.ts` | 新增 `getDefaultSkill(controller, anger)` = `PetBattleSkillController.cs:43-67` 四支：大技够怒⇒交大技 / 无环击表⇒取可用表首条 / 有开场表⇒走一遍后置 null / 纯环击⇒cursor 循环 |
| **L0 宿主** | `game/core/battle/battle-pet.ts` · `battle/views.ts` | `BattlePet.GetDefaultSkill()`（含 **buff 61 无限怒气 ⇒ petAnger 顶到 int.MaxValue**，BattlePet.cs:327-331）；两个 view 接口补 `cursor` / `getDefaultSkill` / `getDefaultSkill()` |
| **L4 驱动** | `game/app/battle/driver/coreBattleDriver.js` | 新增 `pickClientSkill(unit)` 逐字照 Battle.cs:361-380：默认技；宠已死 ⇒ `petChangeSkill(cursor, nextCursor, true)`（双打才给 null） |

**⚠️ 两条踩过的坑（改这块前必读）**

1. **选招必须在快照还原之后**。`nextRound()` 每次尝试都 `BattleState.from(snapshot)` 回滚，而
   `GetDefaultSkill` **有副作用**（推进 `cursor` / 消费 `headerSkills`）。若像原先那样**先挑好再进
   `attempt`**，那次推进会被 `from(snapshot)` 原样丢弃 ⇒ 敌方永远重复第 0 招。故入参改成
   「从还原后的 state 上取技」的函数（`pickMaster`/`pickClient`），不是已挑好的技能。
2. **`normalSkills` 必须是长度 4 的表、不足补 null 洞**。`PetSkill.GetNormalSkill` 末尾那句
   `Array.Resize(ref ret, 4)`（PetSkill.cs:158-163）是承重的：正因为有这个洞，`GetAvailableSkills` 里
   `(normalSkills?.Count ?? 0) > 0` 恒真，永不回落到 `loopSkills` 分支，也就永不撞 `null.Where()` 抛。
   移植体原样留下 `slice()` 的结果 ⇒ **一只技能都没学到的宠**得到空表。实测 `unity/pets.json`
   **838 只里 328 只在 Lv20 前无可用技** ⇒ 敌方选招/玩家看技能面板当场抛 `ArgumentNullException`。
   本批按上游补洞（`battle-pet.ts` 的 `learned` + 补 null）。**这是修的是我们自己的移植偏差，不是上游 bug。**

**未移植（如实登记，不是死账）**：Battle.cs 的「双打」两支（`parallelCount > 1` ⇒ 逐槽推进 cursor +
`SetParallelIndex`）在本仓**走不到**——`BattleSettings` 恒 `parallelCount: 1`（单敌遭遇，MB7 决策二），
故不移植、未伪造。

**门禁（2026-10-19 复跑）**：`node tools/build-core.mjs` 干净；`node --test game/core/` → **pass 304 / fail 0**；
`node tools/difftest.mjs` → `向量=31801 可比=31300 不一致=113`、`分歧族={petid 值不等}` = **与本批前逐字相同**
（随机臂，决议① 已登记，**无回归**）；`node tools/rbattle-selftest.mjs` → **14/14 绿**（含新增两条
「我方无操作 ⇒ 敌方不掉血」/「敌方自动出招 ⇒ 我方掉血」；同时**作废**旧断言「无操作 hp 不变(我)」——
它在敌方恒不出招时才是事实）。

**实跑复核（浏览器，只读驱动不碰数值）**：`#/rbattle` 连打 7 回合 ⇒ 敌方「激流穿击」逐回合出手、
我方 296→0，`result={state:2, isMyWin:false, isOpWin:true}` ⇒ **战败闭环也通**。首回合我方 0 伤害是
上游命中掷骰（战报写明「但是没有命中」），非缺陷。

---

## 9. as-built

> 本份是**事后**把 `kernel-handoff.md` 兼任的 impl 配对事实正式落到线规文档；内核代码**已大面积落地**（§3.1）。
> **as-built 真值 = `docs/engine/kernel-handoff.md` §3（落点表）/ §5（各批门禁数字）/ `port-map.md`**；本份不另开 as-built 数字账，避免双账漂移。
> 待 §3.2 任一批落码后，在该批下补 as-built 行（门禁数字 + 偏差），并回写 `status.md` 引擎行。
