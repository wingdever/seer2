# 战斗内核移植交接（2026-10-17 收口点：第八段·批四 A 档 4 支算子本体 + 控制器 9 方法已绿，冷启动够用）

新会话只需要这一份 + `docs/engine/port-map.md` + `docs/engine/oracle-playbook.md` 就能接上。
**别再重新验证已经绿的东西** —— 跑一遍下面 §3 的门禁，全绿就直接从 §5 的「再下一段」（批五 `rage`，**先写 D5**）开工。

---

## 1. 内核目标（总目标三条支柱之一：玩法机制复刻重启）

总目标（可游玩的游戏 + 多内容宇宙 / 多格式素材兼容）见 `README.md`「总目标（北极星）」；
本文件只管其中**战斗内核**这一条子目标。
**同支柱的另一条腿是 UI 面板线**（重启 IA，逐面板手写 DOM），入口 `docs/view/ui-handoff.md` ——
两者并列、互不阻塞；UI 面板只读 `game/core/**`，不自己算数。

把《阿卡迪亚：重启》（`projects/Seer2-Restart-Lite-main/`，`lite_4.9.2`）的战斗规则
移植成**无头 TypeScript 内核** `game/core/**`，在浏览器里可复现上游的战斗数值与流程；
正确性由**差分对拍**保证 —— 拿上游自己编出来的 `Assembly-CSharp.dll` 当 oracle，
同一批向量逐值比，异常（抛/不抛）也一起比。

保真度口径（用户定调，`docs/engine/port-map.md` 的"保真度口径"一节）：
**跟的是重启的游戏逻辑** —— 数字、控制流、夹紧/截断、集合插入顺序、DSL 解析结果；
**不追 JS/C# 的表面差异** —— 异常类型与消息文本、容器实现细节都不进 golden。
⚠️ **2026-10-17 人类四条决议已把这份交接的三条口径改硬**（原文 `AGENTS.md §1.1`/`§2`/`§4`、细则 `docs/runtime/runtime-components-design.md`）：
① **随机/墙钟**不与 Unity 逐值一致、oracle 侧 shim **取消** ⇒ 走 R1/R2 注入，验收换手段（不是豁免）；
② **上游代码 bug** ⇒ **声明 + 写无 bug 的目标行为**（数据表错字仍照搬，`docs/arch-docs.md §4.1` 的分工）；
③ **核心层只调接口** ⇒ 落盘 = R4、弹窗 = R5（引擎里那些"Hintbox/存档"副作用一律上移）。
⇒ 另外：**主要验收手段 = 人类手测**，difftest / `node --test` 只是回归门；**"不可比"不再是跳过实现的理由**。

素材/动画那条线（SWF 烘焙 + 精灵图鉴 + fightui + 地图）有自己的入口文档，不在这份交接的关键路径上。
其中**光栅烘焙线已废弃**（快照见 `projects/bake/RESUME.md`），当前动画策略是浏览器内 Ruffle 直渲 `swf/fight/*.swf`。

## 2. 规则权威与血统

| | |
|---|---|
| 规则权威 | `projects/Seer2-Restart-Lite-main/`（`lite_4.9.2` / 2026-09-25+08:00） |
| 二进制 oracle | `/home/wing/Software/Seer2/Seer2 Restart Lite 0827/…/Managed`（**本地研究，不入库不分发**） |
| 素材与 swfId | `vendor/seer2-origin-as3/`、`game/petContainer.root.swf`、`projects/bake/baked/` |
| 参考项目 | `arcadia-eternity` **只读词汇表，规则一律不采信**；其产物 `game/battle-kernel.js`、`game/kernel/glue.ts` 已退役 |
| 数据产物 | `tools/build-unity-data.mjs` → `game/data/unity/*.json`（重启表）；`game/data/*.json` 是官方 AS3/改服表，两套 schema **不能同名覆盖**（port-map 有踩坑记录） |

## 3. 现在的落点（2026-10-17，全绿）

```
node tools/difftest.mjs   →  向量=30431 可比=29935 native不可比=0 架子没对上=0 不一致=0
node --test game/core/    →  304 通过 / 0 失败
node tools/build-core.mjs →  42 个 .ts → .js
无头门禁 (§1 of playbook)  →  空输出
```

`game/core/` 共 42 个非测试 `.ts`（9696 行）+ 19 个 `.test.ts`；`.js` 是 `build-core` 产物，别手改。
已落地并有 golden 覆盖的内核层：

| 层 | 文件 | oracle kind |
|---|---|---|
| 求值层（S1/S1b） | `parser/parser.ts`、`parser/operator.ts`、`parser/identifier.ts`、`strutil.ts`、`numutil.ts`、`mathf.ts`、`vocab.ts`、`collections.ts` | `parse operate opknown condknown condition datatype isfrac fraction halfcond splitcond options numid ident …` |
| 数值层（S2） | `pet/status.ts`、`pet/status-controller.ts`、`pet/element.ts`、`pet/linear.ts`、`battle/damage.ts`、`rng.ts` | `normalstatus pbuff pubuff paddd statusop statusget statusset statusparse elemrel elemname msign mabs mpow mclamp orderby roundi floori ceili` |
| 效果/印记层（S3 一、二段） | `effect/effect.ts`、`effect/effect-database.ts`、`buff/buff.ts`、`buff/buff-info.ts`、`buff/buff-database.ts`、`buff/buff-refer-data.ts` | `effectparse buffinfo buffid buffdesc refer` |
| 状态快照层（S3 三段） | `battle/state.ts`、`battle/settings.ts`、`battle/result.ts`、`battle/effect-handler.ts`、`battle/unit-skill-system.ts`、`battle/views.ts` | `statecopy stateid stateset stateflag giveturn gofirst petbag skillsys settings result effectq statedrive`（共 1482 条向量，镜像在 `tools/snap-mirror.mjs`） |
| 驱动层（S3 四段） | `battle/phase.ts`（47 KB，`setPhaseBattle` 接缝在 :62） | `phaseq phasedrive`（`EffectTiming` 推进序 + 队列消费；native 的 `UnityEngine.Random` 两支在生成阶段就挡掉） |
| 第五段·地基（步骤 0–3） | `parser/identifier-effect.ts`（带 effect 上下文的标识符链 + `ParseEffectOperation`）、`battle/target.ts`（`getBattlePetTargetList`）、`pet/status-controller.ts` 的七个缺失突变器、`battle/skill-table.ts` + `views.ts#setSkillTable`（**5340 张真技表已接**，宠表仍围栏） | `effectident target skilltable statusctrl petmut` |
| 第五段·判定外壳（步骤 4） | `effect/effect-judge.ts`（`Condition` 面：相位门 + 四个前置检查 + 六个判定族 + on_fail 后置改写；`Apply` 外壳：repeat 两支 + 未移植算子**显式抛** + `DefaultAbility` + `PostProcess`/`TryGetPostProcessEffects`）。生产 `JUDGE` 仍是 `NOT_PORTED`，真判定只在 harness 里**按 kind 作用域**注入 | `effectcond effectapply` + 补回的 8 条 `target`（fromDefault） |
| **第六段·算子本体批一（6 支）** | `effect/ops-basic.ts`（`set_damage`+`add_status`）、`effect/ops-buff.ts`（`add_buff`+`remove_buff`）、`effect/ops-powerup.ts`、`effect/ops-heal.ts`；`pet/buff-controller.ts` 的 `state!=null` 两处围栏解除（`AddBuff` 的 copyHandle 六支 + `RemoveBuff` 的「先触发后摘除」，递归经 `TRIGGER` 回调注入）；`buff/buff-info.ts` 的 `BuffInfoTable` 接缝加 `buffIdsOfType` | `effectapply` 的六算子真突变 + **`phasedrive(judge:true)` 的第一批真状态签名**（`SigPet` 本轮扩了 `bf[…]`/`st=…`/`pw=…` 三段，oracle 与镜像逐字符同改） |


S3 二段与三段各自抓到过一个**只有二进制能推翻我的误解**的分歧，记在 port-map：
`BuffReferData` 的括号是 `[10]` 不是 `(2)`（静默降级，不崩）；
`TryGet*(id, out num)` 的 golden 曾被反射架子吞成 `|0`（架子错，不是上游行为）。
**看 §7 之前别动手改比较器。**

## 4. 路线图（S1…S6）与每段判据

段落编号来自最初的移植计划（结论散落在 `docs/engine/port-map.md` 各节，这里是收拢）：

| 段 | 内容 | 判据（已定的口径） | 状态 |
|---|---|---|---|
| S1 | 求值层：DSL 解析、标识符、字符串/数值工具 | 上游解析结果逐值一致，含抛点 | **绿** |
| S1b | 差分 oracle 立起来（宿主真 DLL） | 同批向量两边同值 | **绿** |
| S2 | 数值层：Status / 元素 / 线性曲线 / 排序 | 实测口径取代推测；内容宇宙换到重启表（838 宠 / 5340 技 / 2121 buff / 612 物品） | **绿** |
| S3 | 战斗内核：Effect / Buff / Unit / UnitPetSystem / BattleState / Phase / 22 算子 | 每块搬完**立刻**进 `difftest`，拷贝构造 + identifier 读回；PVP-Photon 与 hudSystem 围栏 | **前 4 层绿 + 第五段地基（步骤 0–3）绿 + 判定外壳（步骤 4）绿 + 批一 6 支 + 批二 `set_skill` + 批三 `capture`/`pet_change` + 批四 A 档 4 支算子绿 ⇒ 22 支里 `11 进 golden + 2 半可比 + 1 进不了 golden = 14 有实现`；余 8 支未动（批五 `rage` 等，只记 TODO）** |
| S4 | 同种子重放 | 判据已按实测**重读**：Unity `Random` 是 native ECall ⇒ **oracle 给不出 golden**（⚠️ 旧措辞"不可注入"**已作废**，2026-10-17 决议 ① ⇒ 我方**由 R1 注入 `Rng`**、墙钟 R2、存档随机 R3）。⇒ 要求"**我方**同 seed 重放自复现"（同一回合序列、同一结算、同一状态形状），**不与上游逐位对齐**；对拍侧随机臂发**合成向量**，主验收 = 人类手测（见 port-map「保真度口径」与 `docs/runtime/runtime-components-design.md §5/§7`） | 未开始 |
| S5 | 结算与成长：`ProcessResult`、`logic/stats.js` 曲线替换 | ⚠️ `ProcessResult` 摸的三件外部能力**一律上移走接缝**（人类决议 ③）：墙钟播种 → **R2**（改显式 seed 入参）、写存档 → **R4**、`Hintbox` → **R5**（文案 key + args，取词归 View 线）。 ⇒ `docs/runtime/runtime-components-design.md §3.2/§5 R4/R5` | 未开始 |
| S6 | 内容宇宙接表：把真宠表/技能表接进 oracle，搬 `Pet.cs` + `Skill.cs` + 三个 controller + `UnitSkillSystem` 构造链；`[x:pet]` 的兜底口径在这里换掉 | ⚠️ **编号撞车**：`docs/domain/domain-design.md` 接缝清单里的 **S6 = 四张词表**（已完），本行的 **S6 = 宠表移交阶段** ⇒ 读到"S6"先看出处。域侧真值与批次已立：**D7** `docs/domain/domain-info.md`（表 + L2 桥，施工批 B1–B7、bug 登记 CB1–CB6）与 **D6** `docs/domain/domain-pet.md`（`Pet` + 8 组件，B1–B7）⇒ **本阶段发生在它们的落码之后**，`BuildPet` 的反射合成形状（`Program.cs:751-770`）换成真表是 D6 的 **B1** | 未开始 |

### `logic/` 的终局（三分口径，2026-10-15 定；S5 的验收口径）

`game/logic/**` 现在是**三类东西混住**，终局各不同：

| 类 | 现文件 | 去向 | 时机 |
|---|---|---|---|
| 规则数值 | `settle.js` 的 `computeExp`/`awardExp`/`detectEvolve`/`applyEvolution`/`hpBandMult`/`captureProb`/`captureRoll`/`escapeChance`、`stats.js` 的 `levelExp`/`levelFromTotalExp` | **搬进 `core/`**（补 `core/battle/result.ts` 已登记未搬的 `SetExp`/`ProcessResult`），logic 改为 `import` core | S5 |
| 重复公式 | `stats.js` 的 `calcMaxHp`/`calcStat` | **去重**：直接调 `core/pet/status.ts#getPetNormalStatus`（iv=31 / ev=0 / 性格 0）。现状是 **double 直算**，权威实现逐点 `f()` 收窄 float32，末位 ULP 可翻转 `floor` | 可即做，不依赖 S5 |
| 存档 / 事务 / 掷点 | `session.js`、`rng.js`、`phases/**`、`phases/index.js` | **留产品层并改名**（`logic` 与 core＝"逻辑内核"撞名），如 `game/session/` | 可延后 |

依据（两条都要在 S5 一并处理）：

- `core/battle/result.ts:3` 已登记「**未搬**：ProcessResult / SetBasic / SetRecord / SetTalent / SetExp / SetSkill / DoWork」，而 `logic/settle.js:5` 直接引 `BattleResult.cs:174` —— 同一段上游代码，一边标未搬、一边有 JS 手抄，**手抄不受 difftest 保护**，是当前最大的未对拍面。
- `logic/stats.js:1` 自称「与内核 `pet.system.ts` calcMaxHp/calcStatWithoutHp 严格同式」，但 core 里**不存在** `pet.system.ts`，也无这两个函数名（权威在 `core/pet/status.ts#getPetNormalStatus`）。这条是失效符号引用，S5 去重时一并更正。

> **UI 线 S5-v3 已接的输入（2026-10-16）**：新增重启原生存档 `game/logic/restartSession.js` 经注入 `auth` 消费**已建绿的** `getPetNormalStatus`（iv=0 HP/六维）+ `unity/growth.json`（进化阈值/目标/`beatExpParam`/`expType`）——即 **HP 与进化的数值输入已换成真重启权威**（`docs/view/ui-handoff.md` §S5-v3 补记、`tools/rbattle-restart-save-test.mjs` 21/21）。但 **exp→level 曲线系数仍借 `rules.json` A/B 形状**（本文件类目1 的 `SetExp`/`ProcessResult` 是内核围栏、无无头 oracle），存档打 `_authority.exp='borrowed-A/B-shape'` 溯源戳、结算事件带 `curve` 戳、`resultView` 如实标注 → **未谎称 exp 换血**。待 S5 把 `SetExp` 补进 `core/battle/result.ts` 并挂 oracle 后，只换 `auth.exp.{levelExpAt,levelFromTotalExp}` 的系数/来源，`restartSession.js` schema 与 call-site 不动 → v3 exp 才算真换血。`game/core/**` 本轮零改动。

一句话终局：**`logic/` 应被"掏出规则、留下存档"** —— 规则归 `core/`，`logic` 收缩成纯存档/事务编排层并改名。

## 5. 已完成（S3 第五段·判定外壳 → 第六段·批一·算子本体）

### 5a. 第五段（步骤 0–4）：Condition 面 + Apply 外壳

计划见 `/home/wing/.qoder-cn/plans/soft-vent-dove.md`（第五段五步）。**步骤 0–4 已落地全绿**。

- **oracle 侧**（`tools/oracle-cs/Program.cs`，`dotnet build` 干净）：`BuildEffect` 支持 `condOptions` 数组；
  `SigEffectShape`（用上游那个拼错的 `GetRawCondtionOptionString`）；`JudgeWorld`（`Set(PhaseBattle,"currentState",st)` +
  `ivk=lhs|rhs|null` / `src` / `sp`）；`EffectCondVector`/`EffectApplyVector`（`cond=/apply=…|SigState|E=…`，
  **不签 `rnd`** —— `Player.random` 的 getter 解引用空 petBag 即 NRE，见下「两条 native RNG 面」）；
  `EffectApplyVector` 对 `ability!=0` 抛 `MissingMemberException`（本轮只发 `none` 形状）；dispatch 在 :291-293。
  `TargetVector` 现补上 `Phase()` + `Set(PhaseBattle,"currentState",st)`，让补回的 fromDefault 八条里的
  `handler.condition` 与镜像同形（非 fromDefault 的旧向量不进 condition，注了无副作用）。
- **TS 侧已立**：`game/core/effect/effect-judge.ts` 导出 `condition`/`apply` 与四个前置检查、六个判定族、
  `defaultAbility`/`postProcess`/`tryGetPostProcessEffects`；`effectcond`/`effectapply` 已进 `SNAP_KINDS` 与 `mineSnap`。
- **注入口径**：采**按 kind 作用域注入** —— harness 用 `withJudge(on,fn)`（`INJECT_JUDGE` → `try` → `finally`
  `RESTORE_NOT_PORTED`）只在 `effectcond`/`effectapply`/补回的 `target(judge:true)` 三类上换真 judge。
  `phaseq`/`phasedrive`/`effectq`/`giveturn`/`gofirst` 因不进作用域窗口而**逐条一字不变**（本轮无需退回实验，直接按作用域落）。

**最终门禁**（第五段收口实测）：`dotnet build` 0 error；`node tools/difftest.mjs` →
`向量=30090 可比=29613 native不可比=0 架子没对上=0 不一致=0`；`node --test game/core/` → `pass 230`；
`node tools/build-core.mjs` 干净；headless grep 可执行代码为空。

### 两条 native RNG 面（本轮踩过，别再重新发现）

> ⚠️ **口径改版（人类 2026-10-17 决议 ①）**：下面两条是**oracle 侧的事实**（问不出 golden），
> **不再是"实现/验收可以跳过"的理由**。今后批次的随机臂：实现走 **R1**（`Rng` 注入）、墙钟走 **R2**、`random[old]/[new]` 走 **R3**
> —— 接缝与验收口径见 `docs/runtime/runtime-components-design.md §5/§7` 与 `AGENTS.md §1.1`（**主验收 = 人类手测**）。
> 操作上只改一件事：**不再"生成阶段全挡"**，改发**显式声明来源的合成向量**并断言**同 seed 复现 + 形状**；
> "两边同抛/不签 `rnd`"这类**已落批次**的 as-built 描述照旧保留（别改历史数字）。
> Photon 的 ECall 闸门与随机无关 ⇒ 那条**照旧**（`docs/engine/oracle-playbook.md §6` ②）。

1. **`Player.random` 的 getter**（`Player.cs:32`）解引用 `petBag`，oracle 的 petBag 是空 ⇒ 读它就 NRE。
   `RandomNumber` 首行 `float random = Player.instance.random`（`EffectConditionHandler.cs:92`）只要带任一
   random 键就无条件读 ⇒ **凡 condOptions/表达式触到 random 键的向量都不可比**，生成阶段全挡，
   `EffectCondVector`/`EffectApplyVector` 也不再把 `rnd` 写进签名（结果不依赖它，去掉无损）。
2. **裸 `random` / `me.random` 标识符叶** → `Identifier.GetNumIdentifier` → `UnityEngine.Random.Range(int,int)`
   是 native ECall ⇒ headless oracle 抛 `SecurityException`，镜像的 `createRng` 给确定值。
   这类向量同样在生成阶段挡掉（`target` 一族的 `target_index:'random'` 读的是 `unit.random`，**不是** native，可比）。

**为什么 Condition 和 Apply 必须同一个增量**：上游未移植算子的兜底 `DefaultAbility` 是**静默 `true`**
（`EffectAbilityHandler.cs:13-36`）。只把 Condition 换真、Apply 仍抛 ⇒ 抛出点从 condition 移到 apply，
而 oracle 侧 condition 为 false 时根本不进 apply ⇒ 现有 `phasedrive` 那批 throw-only 对**当场翻红**。

移植体里 Apply 对未移植算子**显式抛 `NOT_PORTED`**，这是对上游静默 true 的**刻意偏离**（与全仓接缝纪律一致），
这条偏离已在 port-map「第五段」登记。

读上游时容易漏的六点（本轮逐行核过，别再重新发现一遍）：

| 位置 | 会咬人的地方 |
|---|---|
| `Effect.cs:224-293` | `checkPhase && !isCorrectPhase ⇒ return false` 发生在 **`this.invokeUnit = invokeUnit` 之前** ⇒ 这条向量上 effect 的 invokeUnit 没被写。 |
| `Effect.cs:274-290` | on_fail 块**永久改写共享 Effect** 的 `target`/`ability`，且 `abilityOptionDict = effect.abilityOptionDict` 是**引用赋值不是拷贝**；随后 `Remove("on_fail")` 也是永久的。 |
| `Effect.cs:295-343` | `state==null` 时 `repeat` 走 `int.Parse`（对表达式**抛**）；循环用 `result &=`，**不短路** ⇒ 已经 false 之后算子照样被调。 |
| `Effect.cs:365-389` | `postEffects` 里的 null 元素 ⇒ `SelectMany` 抛 `ArgumentNullException`，**在列表顺序上惰性触发**；`effectIdList` 为 null ⇒ 后面那个 timing 修正 foreach NRE。 |
| `EffectConditionHandler.cs` 的 `Buff`/`Skill`/`Poker` 三支 | 都在 state 判空**之前**解引用 `((Unit)effect.invokeUnit).id` ⇒ 无 spec 的向量两边**同抛**，这是预期，别加兜底。 |
| `RandomNumber:81-131` | `who` 读了**不用**；`random_op`/`random_cmp` 双缺 ⇒ 直接 true；战斗侧那五步 `*=`/`+=`/`-=` **每步都是 R4** ⇒ 逐步 `f()`；`IN` 走 `IsWithin`（闭区间）。 |

`PetCondition`/`StatusCondition` 的 `state==null` 支要 `(Pet)invokeUnit` 强转，而 **core 里没有 `Pet` 模型** ⇒
一律显式 `NOT_PORTED`（`JudgeWorld` 无 spec 时 `invokeUnit=null`，两边同抛，属 throw-vs-throw，**不去"修"**）。
`Pet.normalStatus` 同理 —— 它是宠表读，留给 S6。

注入口径（**已定稿 = 按 kind 作用域**）：harness 用 `withJudge(on,fn)`（`INJECT_JUDGE` → `try` → `finally`
`RESTORE_NOT_PORTED`）只在 `effectcond`/`effectapply`/补回 `target(judge:true)` 三类上换真 judge。全局注入这条路
没走 —— 作用域注入让 `phaseq`/`phasedrive`/`effectq`/`giveturn`/`gofirst` 五个既有族**逐条一字不变**，本轮不改 phase 行为
（算子本体是下一段的事）。**第六段·批一把 `phasedrive` 打了标，这条"一字不变"到此为止，见 5b。**

**验收** = 计划四条门禁全绿（见本节「最终门禁」），外加一条：上述五个既有族的**条数与结果与开工前逐条一致**
（`不一致=0` 即蕴含，基线种子 `seed=7` 固定可复现）。
**这条验收对第六段·批一不再适用** —— 批一就把 `phasedrive` 的 throw-only 向量升级成了真状态签名，
逐条一字不变的口径见下面 5b「口径变更」。

### 5b. 第六段·批一（6 支算子本体 + phasedrive 真状态签名）—— 本轮收口

计划见 `/home/wing/.qoder-cn/plans/remote-peak-deer.md`（步骤 0–7）。**八步全部落地**
（步骤 7 = 本节 + port-map「S3 第六段」+ playbook §2/§6/§7A 的文档收口）。

搬的六支（上游 `EffectAbilityHandler.cs`，按真表频次）：
`set_damage 618 / add_status 95(复合 95) / add_buff 1468(+188 复合) / remove_buff 193 /
powerup 657 / heal 315`。`none` 是 `DefaultAbility`，第五段已搬。文件落点见 §3 表最后一行。
**长尾 14 支（win/escape/capture/pet_change/rage/block_buff/copy_buff/set_buff/set_pet/set_weather/
set_player/poker/set_pet_bag/card）保持 `notPorted`，只在 port-map 记 TODO，不顺手搬**（用户定的口径）。
> **注（见 §5c / §5d）**：本条口径在第七段·批三被用户**特意反转** —— `capture(3)`/`pet_change(4)` 搬进 golden；
> 第八段·批四再把 A 档 `win(1)`/`escape(2)`/`set_weather(17)`/`block_buff(9)` 也搬了（`win`/`escape` **半可比**）。
> 余 **8 支**（rage/copy_buff/set_buff/set_pet/set_player/poker/set_pet_bag/card）守本条不搬。

三条本轮新立的机制（都在 playbook/port-map 有细节）：

- **oracle 白名单** `PortedAbilities`（`Program.cs:1849`；初始 `{0, 8, 14, 10, 11, 5}`，批三扩 `{…, 3, 4}`，批四再扩 `{…, 15, 1, 2, 17, 9}`）
  **现值 `{ 0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9 }`**
  **只在 `EffectApplyVector` 里查**；
  越界继续抛 `MissingMemberException` ⇒ 归 `架子没对上`，**忘搬/误生成的分支不会假绿**。
- **逐向量 `judge:true` 门**（`snap-mirror.mjs`）：`effectcond`/`effectapply` 整族注入，
  `target`/`phasedrive` 按向量打标。**实测更正：驱动族里只有 `phasedrive` 这条门真能跑到算子** ——
  `mineGiveturn` 走 `state.giveTurnToNextUnit`、`mineGofirst` 读 `isGoFirst/isGoLast`，都不经
  `Effect.Condition/Apply`（`state.ts:720-744`）；`effectq`/`phaseq` 只拼装 handler 不 `CheckAndApply`
  ⇒ 它们的 `judge` 标是**惰性门**（留着为形状对称与以后接入，发出去也不改抛点）。
- **`SigPet` 扩签三段**（`bf[…]` 印记袋内容 / `st=…` 四个状态数组 / `pw=…` powerup 六维），
  oracle `Program.cs:1026 SigPet` 与镜像 `snap-mirror.mjs:342 sigPet` **逐字符同改**，且是**步骤 0 单独一轮先落地**
  （只改签名不动算子 ⇒ 一翻红就确定是字符没对齐）。

**口径变更**（覆盖 5a 那条验收）：升级后 `phasedrive` 会第一次真跑算子，条数与可比数必然上升。
复核方式改成两条：打标向量逐条看 `cur=` 签名逐值一致；**未打标向量抛点与开工前逐条一致**
（本轮实测 `oracle抛错 489 条` 不变、各族分布不变 ⇒ 既有 throw-only 向量一条没被洗绿，
`parallelApplyOOM` 那条 77 秒/OOM 护栏也没松）。

**本轮踩到并坐实的四条新事实**（写进 port-map「第六段」，别再重新发现）：

| 事实 | 出处 / 后果 |
|---|---|
| **TurnEnd 的 hud→Photon 闸门**：`TurnEndPhase.cs:98-99` 调 `UnitHudSystem.OnTurnEnd`，其 `Unit.IsMyUnit()` 三元先读 `PhotonNetwork.IsConnected` ⇒ 无头 oracle `TypeInitializationException`。**进入条件实测是「任一 unit 的 `totalBuffHeal − totalBuffDamage ≠ 0`」**（`UnitSkillSystem.cs:40/44` 计 `buff/buff_per/buff_fix/buff_percentage_unhealthy`）。 | 挂 17 号时机（`OnTurnEnd`）的效果必须**账本中性**（`add_buff/remove_buff/add_status/none`），或给**净额为 0 的 damage+heal 成对**（2023 value=4 ⇒ 奶 maxHp/4=25 配 2024 value=25）。18 号（`OnAfterTurnEnd`）在 hud 之后跑 ⇒ 不受限；`AfterAttackPhase`（`AfterAttackPhase.cs:12-18`）**根本没有 hud 调用** ⇒ 是 heal/add_status/add_buff/set_damage 的富矿。移植体**不建模这个抛**（hud 是表现层，生产代码不该因测试架子而抛）。 |
| **2016「吸取体力」看着成对却不平衡**：伤害落 op、治疗落 self ⇒ **逐 unit** 净额 ≠ 0 ⇒ 照样撞 hud 闸门。 | 向量已剪除；别把它当「成对即可比」的先例。 |
| **孤儿帧 class 的 port bug**：TS 里 `const st = this.state … st.phase = …` 跨过 `this.state = BattleState.from(…)` 换帧，写进的是**旧帧**；C# 每次 `state.Phase` 都是**现取字段**。 | `phase.ts:799` 已改成现取 `this.state`，`phase.test.ts` 新锁一条；驱动向量实测坐实（旧帧停在 17、上游是 18）。 |
| **drive 的技能 stub 两边只认 `id`/`type`**：oracle `BuildSkillSystem`（`Program.cs:906-918`）忽略 power/accuracy 等，镜像 `blankSkill` 全字段吃 ⇒ 多传的字段会在 `sk=` 列翻红。 | 规格只给 `{ id: 5001, type: 1 }`。 |

**powerup 的 oracle 面拿不到 golden**（不是没搬）：上游 `Powerup` 方法入口即 `SecurityException: ECall methods…` ⇒
`PortedAbilities` **故意不含 7**。函数体照搬、形状由 `node --test` 锁、值不进 golden。
⚠️ 按决议 ① 读法固定：**"进不了 golden" ≠ "缺口"** —— 实现按 R1，验收 = 同 seed 复现 + 形状 + 人类手测（`docs/engine/oracle-playbook.md §6` 改版块）。

**最终门禁**（本轮实测）：`dotnet build` 0 error；`node tools/difftest.mjs` →
`向量=30308 可比=29819 native不可比=0 架子没对上=0 不一致=0`；`node --test game/core/` → `pass 265`；
`node tools/build-core.mjs` → 37 个 `.js`；headless grep 可执行代码为空。
步进基线（seed=7 可复现）：步骤 0 `30090/29613` → 1 `30136/29655` → 2 不变 → 3 `30229/29740` →
4 不发向量 → 5 `30286/29797` → 6 `30308/29819`（全程 +218 条 / +206 可比）。

### 5c. 第七段·批三（`capture 3` + `pet_change 4` 两支算子本体）—— 本轮收口

计划见 `/home/wing/.qoder-cn/plans/rough-meadow-swallow.md`（Phase 0 + 批 A–E）。**本段刻意反转 §5b 那条
「长尾 14 支保持 notPorted，别顺手搬」** —— 用户明确选了「真·内核移植捕捉+换宠」，把 `capture(3)`/`pet_change(4)`
两支搬进 `game/core/**`、进 difftest、解 §8 围栏，驱动接多宠队，让捕捉/换宠在重启线上**由内核真结算**。
落点：`effect/ops-capture.ts`（镜像 `EffectAbilityHandler.cs:66-106`）、`effect/ops-pet.ts`（镜像 `:108-163`），
`effect-judge.ts#applyAbility` 两支 case 接线，`views.ts` 的 `PetBuffControllerView` 补 `baseId` 与 `addRangeBuff`。

**可比面（Phase-0 探平、oracle + 镜像 `PortedAbilities = {0,8,14,10,11,5,3,4}` 已同步）**：

| 算子 | 进 golden 的可比支 | native 生成阶段挡（不发向量、体照搬、`node --test` 注入 rng 缝锁形状）—— ⚠️ **本列是 as-built 说法**，新批次改发合成向量 + 断同 seed（上面的口径块） |
|---|---|---|
| `capture(3)` | ① `state==null`；② `prob` 字面 `float.TryParse` 失败（先于解引用 invokeUnit）；③ **`baseId==10` 自动捕捉**（`\|\|` 短路不掷 `Unit.RNG` ⇒ `random=` 签名不变，走完 `capture_result`/`phase=OnBattleEnd`/`result.state=CaptureSuccess`/`isDone`/`actionCursor` 全突变可比） | `baseId≠10` 的掷点支 → `Unit.RNG()`→`UnityEngine.Random.Range` native |
| `pet_change(4)` | 三条前置守卫（`state==null` / `target_index<0` / `random && count==0`）+ **整条换场成功支**（cursor 移动、anger `FloorToInt(×63/100×64/100)` 两步 f 收窄、`RefreshStayTurn`、`add/removeRangeBuff`、`fightPetCursors`、两次 `ApplyBuffs` 全进 `sigState`） | `target=="random"` 且袋里有备选 → `ListHelper.Random` native |

**本轮坐实的一条新围栏（诚实记录，别当已解）**：带等级门槛的捕捉胶囊（items.json `conditionRaw:"pet"` + `type:"level"`）
在浏览器经 `checkAndApply → petCondition → getPetIdentifier("level")` 抛 **`NOT_PORTED: Pet.GetPetIdentifier 的平键 "level"`**
——该 condition 判定族需要**宠表/实例组件**（`petInfoDict`，§8 仍围栏），不属本轮两支算子本体。⇒
**内核捕捉只对无门槛胶囊（items 10003/10004/10005，`conditionRaw:"none"`）真结算**；带门槛胶囊（10001/10002）
驱动 `doCapture` 捕获该 `NOT_PORTED` 后**诚实提示、不消耗胶囊、不判捕捉**（`tools/rbattle-capture-test.mjs` 场景2 锁死）。

**`ProcessResult` / `BattleResult.capturePet` 保持围栏**：内核 `Capture` 算子只落 `result.state=CaptureSuccess` 结束战斗，
「按 `captureLevel` 造被捕获 Pet 对象」是上游 ProcessResult（S5/S6）的活 ⇒ 驱动/场景里把抓到的宠 `addPet` 落进 v3 队伍是
**save-side 副作用**（对齐官方 `phases/capture.js`），标 `_authority.capture='kernel-capture+save-side'`，**不谎称进 golden**。

**驱动/浏览器接线（app 层，非 core，不触基线）**：`coreBattleDriver.js` 喂多宠袋（`opts.masterTeam`→`Unit(bag,1,…)`，
`isCaptureOK:true`）、`useCapture(itemRow)`（`effectFromRow` + `checkAndApply`）、`switchPet(index)`（`getPetChangeEffect` + `apply`）；
`optionView.js` 换宠/捕捉槽在重启遇怪态置活；`captureView.js` 只画候选、递交下标/胶囊 id（**面板零算数**，概率/门槛全在内核算子）；
`rbattleScene.js` 捕捉成功读 `result.isCapture` 走 save-side `addPet + settleRestart(outcome:'capture')`。

**最终门禁**（本轮实测）：`node tools/difftest.mjs` → `向量=30316 可比=29827 native不可比=0 架子没对上=0 不一致=0 分歧族:{}`
（批三 +8 条：capture +3 / pet_change +5，全程既有向量一条不翻红）；`node --test game/core/` → `pass 272`（批一 265 → +capture 3 +pet_change 4）；
`node tools/build-core.mjs` → 39 个 `.js`；headless grep 可执行代码为空。端到端 harness：`tools/rbattle-capture-test.mjs 18/18`、
`tools/rbattle-switch-test.mjs 12/12`，且 `selftest 14 / encounter 14 / hud 12 / restart-save 21 / stage 23` 全绿（v2/AS3 线逐字节不变）。

### 5d. 第八段·批四（A 档 4 支算子本体 + 控制器 9 方法 + `SigPet` 扩 5 段）—— 本轮收口

**用户点名**：先落 A 档三支 43 行（`win` → `escape` → `set_weather`，零前置），再补控制器 9 方法吃下 `block_buff`。
落点：新建 `effect/ops-state.ts`（`win` `:38-53` / `escape` `:54-65` / `setWeather` `:1969-1983`，75 行）、
`effect/ops-block.ts`（`blockOrCopyBuff` `:678-736`，96 行）；`pet/buff-controller.ts` 补 `:323-388` 的
9 个方法（`blockBuffWithType`/`blockBuffWithString`/`unblockBuff`/…/`uncopyBuffWithType`，`:145-167`）
+ 模块级 `removeRange` 助手；`effect-judge.ts#applyAbility` 四臂接线（`Win`/`Escape`/`BlockBuff`/`SetWeather`）。

**oracle 白名单** `PortedAbilities = { 0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9 }`（`Program.cs:1849`）—— **13 进 golden**。

**⚠️ 本批最重要的一条修正：`win`/`escape` 是「半可比」，不是「可进 golden」**。
两支的**结果面**（`:48` 的 `lhsUnit.IsMyUnit()` / `:60` 的 `state.atkUnit.IsMyUnit()`）都要过
`PhotonNetwork.IsConnected`，而 Photon 的**静态构造**在无头宿主里必抛：

```
TypeInitializationException: The type initializer for 'Photon.Pun.PhotonNetwork' threw an exception.
  → SecurityException: ECall methods must be packaged into a system module.
    → at Photon.Pun.PhotonNetwork.StaticReset() / PhotonNetwork..cctor()
```

**不是"缺程序集"**（那是加载期 `FileNotFoundException`），是**运行期 ECall 不可用** —— 与 §5b 的
`powerup(7)`（`:561` `UnityEngine.Random.Range`）**同根因**。⇒ 按 `docs/engine/oracle-playbook.md §6`
的**单向闸门「oracle 抛、移植体不该抛」**，那些形状**根本不生成**。
（这条是本批**踩出来的**：首跑 difftest 得 `不一致=6`，全是 `TypeInitializationException`。）

**可比面**：

| 算子 | 进 golden | 不可生成（原因） |
|---|---|---|
| `set_weather(17)` | `int.TryParse` 失败 ⇒ `false`（**早于解引用 `state`**）；`weather='3'/'-1'/'0'` 真赋值；`'2.0'` 拒；**两侧任一**挂 `BuffType.Weather` 型印记 ⇒ 拒；`state==null` + 合法串 ⇒ 两端同抛 NRE | — （**全可比**） |
| `block_buff(9)` | `op` 四值 `+ - * /` + 未认 `op`（空动作仍 `true`）；`type_list` 的 `Power`/`Powerup`/`Powerdown` 展开；`sp_list` 只 `+`/`-` 生效；`id_list` 多段；`-`/`/` 的首匹配逐项摘；`who≠me` 落对侧；五张表全在签名上 | `id_list` 解析失败 ⇒ 整表 null → `AddRange(null)` 两端同抛（**没喂对数据，不是证据**，不发） |
| `win(1)` / `escape(2)` | 只 3 条：`state==null ⇒ false`（`:41`/`:57`）、`whosTurn==0 ⇒ atkUnit==null ⇒ NRE`（`:60`，**在进 `IsMyUnit` 之前**，两端同抛） | 结果面（`phase`/`result.state`/两个 `isDone`/`actionCursor`）⇒ 撞 Photon ECall |

**为了「看得见」而扩的签名（本批的第二件正事）**：`block_buff` 只改印记控制器的**五张私有表**
（`blockBuffIds`/`blockBuffTypes`/`copyBuffIds`/`copyBuffTypes`/`blockBuffSps`）—— 原来**一个都不在签名上**
⇒ 光靠 `apply=True` 证明不了 9 个方法被调对。所以：
- `snap-mirror.mjs` 的 `sigPet` 与 oracle 的 `SigPet` **同时**扩 `|B[..]|BT[..]|C[..]|CT[..]|S<..>` 五段
  （`Ints()` 走 `Convert.ToInt32`，因为 `BuffType` 是枚举；`Sps()` 走 `IDictionary<string,int>` 保**插入序**）；
- 两边 pet 构造各加四个**铺垫键** `blockTypes`/`sps`/`copyIds`/`copyTypes`（`blockIds` 早就有），
  一律走**真方法**播种 —— 否则 `unblock*`/`uncopy*` 四支**没有起点可摘**，测不出"摘对了没有"。

**结果面由单测锁**（`effect-judge.test.ts` 末尾 +4 条，用**真 `Unit`** ⇒ `isMyUnit` 就是真方法；
离线退化 = `isMasterUnit`，`state.ts:343`，生产路径读的正是这个值）：`win` 的四笔突变 + `who` 选宿主、
`escape` 的 `atkUnit` 语义（与 `invokeUnit` 无关）、`set_weather` 的解析次序与两侧屏蔽、
`block_buff` 的四个动作 / Power 展开 / `sp` 只 `+`-` 有函数 / 首匹配逐项摘。

**最终门禁**（本轮实测）：`node tools/difftest.mjs` → `向量=30431 可比=29935 native不可比=0 架子没对上=0 不一致=0 分歧族:{}`
（批四 +35 条：win/escape 3 + set_weather 8 + block_buff 24，全程既有向量一条不翻红）；
`node --test game/core/` → `pass 304`（较批三的 272 增 32 条，其中**本批 4 条**：`win`/`escape`/`set_weather`/`block_buff` 各一条）；
`node tools/build-core.mjs` → 42 个 `.js`（+`ops-state`/`ops-block`）。

### 再下一段（批四收口后）

**批五 = B 档 `rage`（166）/ `copy_buff` / `set_buff`**。`rage` 前置 = **D5** 的 `Skill.PP` / `allSkills` /
`TryGetSkillIdentifier` ⇒ **D5 已成文**（`docs/domain/domain-skill.md`，2026-10-17：`Skill.PP` 的夹紧访问器 = 该文档 **G2**、施工批 **B2**；`allSkills` / `TryGetSkillIdentifier` 已在 §2.1/§2.9 定契约）。
⚠️ **契约齐 ≠ 码齐**：`rage` 仍要等 **B1–B2 落地**（把 `SkillType` 下沉、`SkillRecord` 变 `class Skill`）才动，且这两批**不改任何对拍 kind**。
⚠️ `rage` 的 `random` 走 `bool.Parse`（畸形串**抛**）、`copy_buff` 的三个开关走 `bool.TryParse`（失败即 `false`）—— 别混。
之后 `set_pet 289` ⇒ **D7 已成文**（`docs/domain/domain-info.md`，2026-10-17：`PetInfo` 组装合同 = §2.3、三套 key 空间 = §2.2、`learnLevel` 编解码 = §2.6、施工批 **B1–B7**）。
⚠️ **契约齐 ≠ 码齐**：`core/pet/**` 目前**一个本族对象都没有**（§6.1）⇒ `set_pet` 仍要等 B2–B6 落地。**D6**（`Pet`/`Components/*`）也**已成文**（`docs/domain/domain-pet.md`，2026-10-17：构造家族的决定性分级 = §2.2、`pet.` 穿五层 = §2.3、写侧 23+1 臂 = §2.4、施工批 **B1–B7**）。
⚠️ **口径纠正**：本文与 `port-map.md` 说的「宠表批次」= D6 的 **B1**（把六张 `Pets/*.csv` 装进 oracle、替掉 `EnsurePetInfo` 的反射合成）；**在它之前，`pet.` 的 L3 臂一律只能停在围栏**（`docs/domain/domain-pet.md §6`）。
`card` / `set_player` 非 bgm 支**本轮不做**（各撞一条真前置线：卡牌线 / 剧情-UI 线）。
⚠️ **`poker` 从这一句里摘出**（决议 ①）：它**没有前置线**，只是**没有 golden** ⇒ 实现照做（掷骰走 **R1**）、排期靠后。
宠表（`petInfoDict`）与 `[x:pet]` 口径、PVP/Photon、hudSystem 与 card 继续保持围栏；
`ProcessResult`（S5）**不是"围栏"**，是**还没排到** —— 它要的三件外部能力一律走接缝（墙钟 **R2** / 写盘 **R4** / 弹窗 **R5**，决议 ③）。

## 6. 冷启动步骤

```bash
cd /home/wing/Projects/Games/seer2
# 1) 读三份文档 (顺序: handoff → port-map 的 S3 各节(含「第六段·算子本体」) + 保真度口径 + 围栏排除 → playbook)
# 2) 跑门禁, 确认基线还绿 (改过 .cs 就先 dotnet build)
cd tools/oracle-cs && dotnet build -v q --nologo && cd ../..
node tools/difftest.mjs | tail -3
node --test game/core/ 2>&1 | tail -8
# 3) 有疑问**当场问二进制**, 不要读源码猜:
node tools/ask-oracle.mjs '[{"kind":"petbag","op":"ident:aliveNum","spec":{"petBag":[{"id":1,"hp":10,"maxHp":10}]}}]'
# 4) 改一条驱动/快照向量别跑全量 (等不起): 手写候选 JSON, 用逐列比的原型台先筛形状 (playbook §7A)
node tools/drv-proto.mjs /tmp/drv.json
node tools/buff-whitelist.mjs        # 搬新算子后重算印记候选白名单 (两边白名单必须同步)
```

工作纪律（用户定过的）：每搬完**一块**就进对拍 + 跑 `node --test`，不留"写完再一起验"的尾巴；
分歧一条都不放过；改 oracle 必须 rebuild 后重跑全量。

## 7. 三条最容易破的规矩

- **`架子没对上`（infra）列非零就是失败**。`MissingMethod/MissingField/MissingMember` 全是我
  反射签名搭错的信号，绝不能读成"上游抛这个"。默认值参数要按 arity **显式补齐**（`null` 就是"沿用默认"）。
- **别拼 float 进字符串**。`Single.ToString` 给最短可回写 float（`-3.4028235E+38`），
  JS 给展宽 double 的最短形式 —— 那是表示差不是行为差；出结构化 JSON 数字让比较器两边 `fround`。
- **不自终止的向量不许进 golden**。`GetParallelPetBag` 那条实测 77 秒 / ~2 GB 才抛 OOM；
  生成器只发终止形状，harness 在 `mine(v)` **之前**把 `OutOfMemoryException` 归成不可比。

## 8. 围栏（当前明确不做，都在 port-map 有出处）

`hudSystem` 与 card/Card 模式、Photon 与 PVP（含 `Unit.IsMyUnit` —— 它的三元先读
`PhotonNetwork.IsConnected`，而 `PhotonNetwork` 的静态构造在播放器进程外直接
`TypeInitializationException`；移植体走注入的 `NetFence`，且**不建模 hud 那条抛**，见 5b 的 TurnEnd 闸门）、
`Skill.SetSkillIdentifier`（批二 `set_skill` 的前置）、`ProcessResult`（S5）、`BattleResult.capturePet`、
`PetBattleBuffController.AddRangeBuff` 与一切真 `Skill` 对象（S6）、
Unity native `Random`（⚠️ **口径已改，2026-10-17 决议 ①**：原记"不可注入"**作废** ⇒ 随机**由 R1 注入 `Rng`**、墙钟走 **R2**、
存档随机走 **R3**（`docs/runtime/runtime-components-design.md §5`）；与上游**不逐值比**、只比同 seed 复现 ⇒ 见 S4 判据重读）、
**宠表 `petInfoDict` 与 `[x:pet]`**（S6）。

**已从围栏里解除**：`Effect.Condition/Apply`（第五段·步骤 4 搬完，`effect/effect-judge.ts`）与
`PetBattleBuffController.AddBuff/RemoveBuff` 的 `state!=null` 支（第六段·批一步骤 2）；
以及第七段·批三**特意反转「长尾保持 notPorted」纪律**搬进来的两支算子
`Capture(3)`（`effect/ops-capture.ts`）与 `PetChange(4)`（`effect/ops-pet.ts`）—— 二者均已进 `PortedAbilities`、进 difftest golden；
第八段·批四再搬 A 档四支：`Win(1)`/`Escape(2)`/`SetWeather(17)`（`effect/ops-state.ts`）与
`BlockOrCopyBuff(9)`（`effect/ops-block.ts`），并解除了 `PetBattleBuffController` 的 9 方法围栏。
**生产默认仍然是 `NOT_PORTED`**（`effect-judge.ts` 的 `JUDGE`）——
解除的是"移植体有没有实现"，不是"运行时默认开没开"：真判定只在 harness 里按向量注入。
`powerup(7)` 在 oracle 侧永久不可比（ECall），不算解除也不算围栏，是**第三种状态**：搬了但进不了 golden。
`win(1)`/`escape(2)` 是**第四种状态「半可比」**：oracle 答得出 `state==null` 那半边，结果面撞同一个 ECall（见 §5d）。

**批次搬完后仍留的 native/ECall 硬栏（诚实口径，别当全可比）**：
① **native 掷点支进不了 golden**（与 powerup 同族）—— `Capture` 的 `baseId≠10` 掷点走 `Unit.RNG()`→
`UnityEngine.Random.Range(0,100)`、`PetChange` 的 `target=="random"` 且有备选走 `ListHelper.Random` ⇒ 两支在 oracle
**生成阶段不发向量**，算子本体照搬、数学由 `node --test` 注入 `Rng` 缝锁形状（区别：capture 有 ③ 条 RNG-free 可比支、比 powerup 可比面大）。
> ⚠️ **本条 2026-10-17 起要读准两半**："进不了 golden"是**对拍覆盖面**的事实（照旧、别改数字）；
> **它不是实现或验收的豁免**（决议 ① + `AGENTS.md §1.1`）⇒ 今后掷骰支**照常实现**、随机来自 **R1**，
> 验收换成**同 seed 自复现 + 形状断言 + 人类手测**，"生成阶段不发向量"只对**已落批次**成立。
> ⚠️ `ListHelper.Random` 是**托管**链、不是 native ECall ⇒ 它在"掷骰前短路"的形状**本来就可比**，别跟着这条一起降级。
①′ **ECall 单向闸门** —— `win`/`escape` 的**结果面**（`IsMyUnit()` 读 `PhotonNetwork.IsConnected`）与 `powerup(:561)`
同根因（`SecurityException: ECall methods must be packaged into a system module`）⇒ 那些形状**不生成**，结果面只靠单测。
② **等级门槛捕捉条件（`items` 里 `conditionRaw:"pet" type:"level"`）仍撞 `Pet.GetPetIdentifier("level")` 的 `NOT_PORTED`**
—— 它要真 `petInfoDict`/`Pet` 组件（本 §8 宠表围栏）⇒ 只有无门槛胶囊（10003/10004/10005）能在浏览器跑真·内核算子，
有门槛胶囊（10001/10002）由驱动 `doCapture` 捕获该抛后**诚实拒绝、不消耗、不判捕捉**。
**`ProcessResult`（S5）与 `BattleResult.capturePet` 继续保持上面这条围栏**：内核 `Capture` 只落 `result.state=CaptureSuccess`，
「按 `captureLevel` 造被捕获 Pet 对象并落进玩家队伍」是 save-side 副作用（标 `_authority.capture='kernel-capture+save-side'`，**不谎称进 golden**）。

## 9. 已知坑（别踩回去）

- Node 直接跑 `.ts` 是**类型剥离**：不能有 `enum`、不能有构造函数参数属性，
  纯类型 import 必须写 `import type`。TS 的 `private` 字段在 `.mjs` harness 里运行时照样能读
  （`sigHandler` 就靠这个打 `h.queue`）。
- `python*` / `pip*` / `rm` / `timeout` 等在本机被 deny；临时文件写 `/tmp`，改文件用编辑工具。
- `git`：本仓是**纯本地 git 仓库**（2026-10-21 重置为单一初始提交，无 remote）。`git status` 可用；
  注意 `/svg/`、`/png/*`（除软链）、`/saves/`、`/logs/` 等**被忽略的产物不在版本控制内**，
  「改了什么」的权威仍以源文件与各线 as-built 为准。
- 无头门禁必须用带两条 `grep -v` 的那条命令；裸 grep 永远不为空（注释里出现被替代者的名字是必要的）。
  ⚠️ **`throw new Error('…')` 里的字符串也算"可执行代码"**（批四才清掉 `views.ts` 的一处遗留 ——
  报错文案里写了 `UnityEngine`）⇒ 想在**注释**里解释"这里替代的是谁"可以，**别写进抛出串**。
- **`HelperCollections.RemoveRange(lhs, rhs)` 不是集合差**：对 `rhs` **逐项** `lhs.Remove(item)`，
  而 `List.Remove` 只删**首个**匹配、摘不到**不报错**。写成 `lhs.filter(x => !rhs.includes(x))` 是**错的**。
- **词表查不到的串一律静默兜底**（`toBuffType`/`toEffectAbility`/`GetNumIdentifier` …）：
  `Powerdown` 的原始串是 **`'powerup.neg'`** 而不是 `'powerdown.neg'` ⇒ 写反了会静默兜 `None(0)`，
  向量照样"绿"，只是什么都没测到（批四被 difftest 咬出：期望 `BT[]` 实得 `BT[0]`）。

## 10. 文档索引

| 文件 | 内容 |
|---|---|
| `docs/engine/port-map.md` | 结论集：实测总量、CSV 加载契约、上游错字与降级、已确认怪癖、求值器/数值层边界语义、保真度口径、S1→S3 各段对拍记录（含「第六段·算子本体批一」）、围栏排除、无头门禁口径 |
| `docs/engine/oracle-playbook.md` | 操作手册：命令、加向量的三处同步、反射纪律、float 纪律、三档拷贝深度、不可比的四类、上游陷阱登记表、单族比对器与两张白名单（§7A）、禁令 |
| `docs/legacy/petbag-handoff.md` + `docs/legacy/petbag-symbols.txt` | 精灵背包 UI（任务 #25，已完成）的冷启动文档，与内核线无关 |
| **`docs/runtime/runtime-components-design.md`** | **运行时功能组件线（2026-10-17 新立）**：核心层需要的外部能力七件 **R1 随机源 / R2 时钟 / R3 存档读写面 / R4 写盘 sink / R5 提示弹窗 sink / R6 判定与战斗宿主 / R7 内容表注册**，一件一缝 + 默认行为 + 验收口径（§7 就是本文件"随机不逐值比"那条决议的细则）+ 施工批 RB1–RB6 与待拍板 Q1–Q5。**引擎侧那 10 条随机路（本文件 §3.1 口径的 #1–#10）由 RB1 九合一** |
| `docs/domain/domain-design.md`（+ **D1–D7**） | 域模型线总设计与七份子设计；**S6（宠表进 oracle 的内核移交阶段）** 的域侧真值在 `docs/domain/domain-info.md`（D7）与 `docs/domain/domain-pet.md`（D6）—— ⚠️ 两处 **S6** 编号撞车：接缝清单的 S6 = 四张词表（已完），本文件的 S6 = 宠表移交阶段 ⇒ 按上下文读 |
| `docs/legacy/m0-findings.md` | SWF 烘焙线（光栅截图法）的调研发现——**该线已废弃**，产物冻结保留，仅追溯用 |
| `docs/legacy/swf-ir-plan.md` | 矢量 IR 线的规划（未来研究项目）；当前 SWF 由浏览器内 Ruffle 直渲 |
| `RESUME.md` | 当前主线（内核移植）指针；烘焙线目标快照见 `projects/bake/RESUME.md` |
| `projects/bake/PIPELINE.md`、`projects/rocoshowdown/NOTES.md`、`projects/rocoshowdown/README.md` | 光栅烘焙管线（**已废弃**，冻结保留）与 rocoshowdown.cn 前端镜像分析（研究用途） |
| `docs/legacy/web-client-notes.md` | 网页端复刻线的移植笔记：地图/栅格真值、加解密、野怪、HUD、背包、SPA、负结果 |
