# 差分 oracle 上手手册（`game/core` 移植专用）

这份是**操作手册**，不是结论集。结论都在 `docs/engine/port-map.md`；这里只写"下一批向量怎么加、
加完怎么跑、报出来的分歧怎么判"。冷启动先读 `docs/engine/kernel-handoff.md` 再回到这里。

---

## 0. 为什么是这个形状

对拍的替代品是"照源码再写一遍 C# 然后跟我的 TS 比" —— 那样两边都是**我理解的产物**，
一致只证明我没跑偏自己的误解，证明不了跟上游一致。所以直接宿主《阿卡迪亚：重启》
自己编出来的 `Assembly-CSharp.dll`，把这一层循环论证消掉。顺带坐实了一批
"只有 Unity 运行时才有权威答案"的问题（`Mathf.RoundToInt` 是 ToEven、`float.Parse("1e40")`
给 `+∞`、`BuffReferData` 的括号是 `[` `]` 而不是 `(` —— 全是对拍给的，不是读源码读出来的）。

三条硬口径，破了就等于自欺：

1. **异常也是被观测对象**。oracle 每条向量的输出是 `{v:值}` 或 `{errType,err}`；比较器要求
   两边"抛/不抛"一致，值一致。所以移植体不许把上游的炸点吞成兜底默认值。
2. **只比行为，不比表面**。异常类型/消息文本、JS 与 C# 的容器实现差异都不进 golden。
3. **golden 也可能是我的错**。`infra` 那一列专用于此 —— 见 §6。

仅限本地研究：上游二进制在 `/home/wing/Software/Seer2/` 下，不入库、不分发。

---

## 1. 前置与命令

前置：dotnet SDK（`dotnet --version` 能出数）、0827 构建在盘、`tools/oracle-cs` 已 build。

```bash
cd tools/oracle-cs && dotnet build -v q --nologo      # 改了 Program.cs **必须**重跑
node tools/difftest.mjs                               # 全量闸门 (约 1~2 分钟, 每次现跑, 无 golden 缓存)
node tools/ask-oracle.mjs '[{"kind":"buffid","id":1008,"turn":-1,"op":"value"}]'   # 一次性提问
node tools/ask-oracle.mjs vectors.json -q             # 批量提问; 输出 `N<TAB>{json}` 与输入同序
node --test game/core/                                # 单元侧
node tools/build-core.mjs                             # .ts → .js 产物
grep -rnE 'UnityEngine|Player\.instance|Photon|Database\.instance' game/core --include='*.ts' \
  | grep -v '\.test\.ts' | grep -vE ':[0-9]+: *(//|/\*|\*)'      # 无头门禁: 输出为空 = 绿
ORACLE_STACK=1 node tools/ask-oracle.mjs …            # 让 oracle 附带堆栈 (定位"哪一行抛"时才加)
node tools/drv-proto.mjs /tmp/drv.json                 # 单族逐列比 (改一条驱动向量时等不起全量; 见 §7A)
node tools/buff-whitelist.mjs                          # 印记候选白名单复算 (见 §7A)
```

`ask-oracle` 只读、不落任何产物，是日常用得最多的一个：**遇到"上游到底怎么想"就当场问，
不要靠读源码猜**。`tools/oracle-cs/Program.cs` 里的 `probe / dbprobe / tablediag <Skills|Buffs>`
三个模式用来体检宿主进程本身（四表计数、逐行调真构造定位"哪一行抛"）。

---

## 2. 加一批向量：三处必须同步

一个 kind 的完整回路是三份代码，**少改一处就会得到假绿或假红**：

| 位置 | 职责 | 里面必须对齐谁 |
|---|---|---|
| `tools/oracle-cs/Program.cs` 的 `switch (kind)` | 把向量喂给真函数，打**可比较的形状** | 上游 C# |
| `tools/difftest.mjs` 的 `mine(v)`（或 `tools/snap-mirror.mjs` 的 `mineSnap`） | 用 `game/core/**.ts` 跑同一件事，打成**同一形状** | oracle 的打印器 |
| `tools/difftest.mjs` 的向量生成区（快照层在 `snap-mirror.mjs` 末尾） | 出向量：真表素材 + 合成边界 | 覆盖分支，不覆盖语法糖 |

快照层（S3 第三段）把后两处拆开了：`tools/snap-mirror.mjs` 里 `Build*` / `Sig*` /
`<Kind>Vector` 是 oracle 同名三件套的**逐条手写镜像**，`difftest.mjs` 只 `for (const v of snapVectors(rnd)) push(v)`。
新增快照 kind 就在那三份里各加一支（oracle `<Kind>Vector` + mirror `mine<Kind>` + mirror 生成器）。

**判定外壳两个 kind（S3 第五段步骤 4）**：`effectcond` → `EffectCondVector`/`mineEffectCond`（调 `Effect.Condition`），
`effectapply` → `EffectApplyVector`/`mineEffectApply`（调 `Effect.Apply`）。它们与补回的 8 条 `target`（fromDefault）
共用一份世界拼装（oracle `JudgeWorld` / mirror `judgeWorld`：`Set(PhaseBattle,"currentState",st)` + `ivk/src/sp`）。
**镜像侧的真判定按 kind 作用域注入**（`snap-mirror.mjs` 的 `withJudge`：`INJECT_JUDGE` → `try` → `finally`
`RESTORE_NOT_PORTED`）—— 生产 `JUDGE` 保持 `NOT_PORTED`，只有这三类向量吃到 `game/core/effect/effect-judge.ts`。
signature 里**不签 `rnd`**：`Player.random` 的 getter 解引用空 petBag 即 NRE（`EffectConditionHandler.cs:92` 的
`RandomNumber` 首行无条件读它），凡触到 random 键的向量两边都不可比 ⇒ 生成阶段挡；oracle 的 `ability!=0` 抛
`MissingMemberException`（本轮 `effectapply` 只发 `none` 形状）。
⚠️ **"生成阶段挡"这半句自 2026-10-17 起只描述 as-built（已落批次）**；今后随机臂的口径见 §6 开头的改版块
（走 **R1/R3** 注入 + 同 seed 自复现，`docs/runtime/runtime-components-design.md §5/§7`）—— **不再**当作"不发向量"的理由。

**算子本体批次（S3 第六段）改了两处口径**：

- oracle 的 `EffectApplyVector` 不再"只放 `ability==0`"，而是查一张**白名单**
  `PortedAbilities`（`Program.cs:1849`，当前 `{0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9}` = none/set_damage/add_status/add_buff/remove_buff/heal/capture/pet_change/set_skill/win/escape/set_weather/block_buff）。
  **越界照旧抛 `MissingMemberException`** ⇒ 落 `架子没对上`，所以"忘了把新算子加进白名单"不会假绿，只会红在显眼处。
  **这张表只在 `effectapply` 一族被读**；`phasedrive`/`target`/`effectcond` 都不查它（驱动向量走真 `DoWork`，
  算子没搬就抛上游自己的异常）。搬一支新算子 = 三处同步：TS 的 `applyAbility` case、oracle 白名单加 id、
  镜像 `EA` 生成区发形状。**只加 TS 不加 oracle 的话，该算子的向量会红在 infra 列，不是漏过去。**
  唯一的例外是 `powerup(7)`：**故意不加**，因为上游 `Powerup` 方法入口就 `SecurityException`（见 §6 第四类）。
- 真判定的注入从"按 kind 整族"细化成**逐向量 `judge:true`**（`snap-mirror.mjs` 的 `withJudge(bv(v,'judge',false), …)`）。
  `effectcond`/`effectapply` 仍整族开；`target`/`phasedrive` 按向量开。
  **本轮实测：驱动族里只有 `phasedrive` 这条门真能跑到算子** ——
  `mineGiveturn`（`state.giveTurnToNextUnit`）与 `mineGofirst`（`isGoFirst/isGoLast`）根本不经
  `Effect.Condition/Apply`，`effectq`/`phaseq` 只拼装 handler 不 `CheckAndApply` ⇒ 那四族的 `judge` 标是**惰性门**，
  发出去也不改抛点。**新增驱动向量时先按 `phasedrive` 想，别按"这族也该吃到判定"想。**
  没打标的老向量抛点必须一字不变 —— 复核办法是比 oracle 的**抛错条数**（本轮 489 条不变）与各族分布。

形状对齐的两条老规矩：

- **装箱/表示不同型的东西先压成同一种形状**再比。已用的例子：`parseDataType` 的 value 统一成
  `{vk,v}`；委托只比"是不是委托"（`{type,vk:'func'}`），因为方法名是 C# 内部实现细节，
  拿它当 golden 会把"我抄的表"变成"我抄的名字"。
- **能出结构化就别拼字符串**。反例见 §5 的 `Single.ToString`。

---

## 3. 反射纪律（这些错的都不是上游）

1. **默认值参数 = 不存在**。`GetNextCursorCircular(int start = -1, Func … = null, Func … = null)`
   按 arity 找重载时"省略"等于"不存在" ⇒ 必须把默认值位置**显式喂 `null`**。
   `GetEffectHandler(unit, bool addSkill = true)` 同理：arity 1 的候选根本不存在。
2. **`MissingMethod / MissingMember / MissingFieldException` 一律是架子的错**，不是上游行为。
   `Fail()` 对 `MissingMemberException`（`MissingMethod/MissingField` 的基类）打 `infra=true`，
   比较器把它单列成"架子没对上"，**绝不当通过放过**。看到这一列非零先修 oracle 再跑。
3. **`out/ref` 的写回要落在调用方那个数组**。`m.Invoke(inst, args.Select(…).ToArray())`
   会把新数组递给 Invoke，`TryGet*(id, out num)` 的 `num` 就永远停在传进去的 `0f` ——
   这一条坑掉过 80 条 golden，症状是"上游成功时也返回 0"，长得像真事实。
4. **`RuntimeHelpers.GetUninitializedObject` 跳过 MonoBehaviour ctor**（玩家进程外构造不安全）。
   `Database.instance` 的 setter 是 private ⇒ 反射写，且必须在上游三张表装载**之前**写进去，
   否则 `Skill/BuffInfo.SetEffects` 回查 `effectDict` 时每行抛、被上游 try/catch 收进 `Hintbox`
   （进程外 = `SecurityException: ECall methods must be packaged into a system module`），
   表静默变"未装载"。这就是"逐行诊断 5340 行全绿、真函数却全灭"的唯一差因。
5. **字段不是属性**。`Skill.id/name` 是字段，`BuffInfo.id` 才是属性；`DATA_COL` 是
   `public const` ⇒ 要 `BindingFlags.Static`。取错成员会伪装成上游异常。
6. **枚举参数给数字**，`Enum.Parse` 只认名字。`Enum.ToObject` 允许未定义值（`-1`/`99`），
   这正是"未知元素走 `?? 1` 兜底"那批向量要问的东西；`Fits` 里要把这种情形放过，
   否则重载选择退化成"取第一个候选"，报出来的 `InvalidCast` 是我架子的错。
7. **`HashSet<T>` 只实现 `ICollection<T>`**，没有非泛型 `IList` ⇒ 加元素走泛型接口。
8. **`InvocationException` 会把上游异常包一层** ⇒ 取 `InnerException` 再打类型名，
   不然 golden 里的 `errType` 是包装类而不是上游抛的那个。
9. **同名重载组一律用 `InvSig(inst, name, Type[], args)`**，别用按"名字+元数+`Fits`"挑的 `Inv`。
   本轮踩到的三组：`AddInitStatus(Status)` / `AddInitStatus(int type, …)`（元数不同但 `Fits` 都能过）、
   `SetPowerUp(Status)` / `SetPowerUp(int, float)`、`RemoveRangeBuff(IEnumerable)` /
   `RemoveRangeBuff(Predicate, …, int randomCount = -1)`（**元数可以相同**，C# 靠首参类型静态分派）。
   挑错了报出来的 `InvalidCast`/`MissingMethod` 是我架子的错，长得却像"上游不认这个入参"（同 §3.6）。
10. **`Has(v, name)` 对显式 JSON `null` 返回 false**，于是 `Sub` 给出 `default(JsonElement)`
    （`ValueKind.Undefined`），`BuffOf` 在它上面抛 BCL `InvalidOperationException` ——
    **自己造的错，伪装成上游行为**。向量的语义真的是 null（如 `petmut addBuff` 的空印记）时，
    必须直接 `v.GetProperty(name)` 读，别走 `Sub`。

---

## 4. float 与哨兵纪律

- 每个 float 字段进出都过 `Math.fround`（TS 侧 `f()`，oracle 侧 `f32()`），比较器再对两边
  `fr = x => Math.fround(Number(x))` 后 `Object.is`。**不做这一步就会有批"看着对、实际是 double"的绿。**
- JSON 写不了 `Inf/NaN` ⇒ 用哨兵字符串 `"Inf" / "-Inf" / "NaN"`，两侧对称映射
  （oracle `Norm`、TS `norm`/`sent`、向量读入 `fnum`）。**别把非有限数当"解析失败"** ——
  float 除零返回 `±∞` 不抛异常，那是被观测的上游返回值。
- 文本表示差 ≠ 语义差：C# `Single.ToString` 是**最短可回写的 float**（`-3.4028235E+38`），
  JS `String(Math.fround(x))` 是展宽 double 的最短形式（`-3.4028234663852886e+38`）。
  签名打印器统一走"展宽成 double 再 ToString"（oracle `Fs` ↔ TS `FS`），
  但**拼进字符串的 float 就失去了 `fround` 比较的机会** ⇒ 该出结构化就出结构化。
- 上游 float 的"未知标识符"哨兵是 `float.MinValue` = `-3.4028234663852886e38`（TS 里
  `FLOAT_MIN_VALUE`），不是 `0`、不是 `NaN`。标识符读回的兜底分档要照抄（查不到 ⇒ `MinValue`；
  查到但键不认识 ⇒ 回落 `GetNumIdentifier`，它兜 0）。

---

## 5. 三档拷贝深度（快照层的全部意义）

| 档 | 上游 | 语义 |
|---|---|---|
| `BattleState(rhs)` | 递归深拷 | 快照的正解 |
| `Unit(rhs)` / `UnitPetSystem(rhs)` | 逐只 `new BattlePet` ⇒ **深** | 副本的 anger 是从原宠**被夹过的值**再夹一次，不是原始输入 |
| `UnitPetSystem(originalBag)` | `Array.Copy` ⇒ 数组是新的、**里面的宠是同一个引用** | 改原袋的宠，副本跟着变 |

对拍的打法是"拷贝完只改**副本**，然后两边一起打签名"（`op:'mutate'`）——
原帧只要动过一个字，就是某一档深浅拷漏了。这一层没有第三个 `snapshot` op：
上游 `BattleState` **没有** `Snapshot()` 方法（全项目 grep 无），移植体的
`state.snapshot()` 就是拷贝构造的别名，与 `op:'copy'` 拍同一件事。

---

## 6. 三种"不可比"，别混

> ⚠️ **口径改版（人类 2026-10-17 决议 ① · 验收口径见 `AGENTS.md §1.1`）** —— 本节是**分类法**，不是**跳过实现的理由**。三条：
> ① **随机 / 墙钟不再需要 oracle 侧的 `UnityEngine.Random` shim**（该 shim **取消**）：E-line 文档里凡"native 随机 ⇒ 永久不可比 ⇒ **不实现 / 不发向量 / oracle 永久不放**"的**措辞**，
>    今后一律读作"**实现照做**（随机来自 R1 注入的 `Rng`、时间来自 R2 注入的时钟，`docs/runtime/runtime-components-design.md §5`），**验收手段换掉**：
>    同 seed 自复现 + 形状断言 + 人类手测，不与上游逐值比"。⇒ **不许把它记成死账**（`AGENTS.md §1.1` 的推论）。
> ② **Photon 的 ECall 单向闸门与随机无关**（`Unit.IsMyUnit()` → `PhotonNetwork.IsConnected`）⇒ **照旧**，半可比/不生成那些形状仍然是正确操作；
>    但"因此不实现某支"仍然禁止 —— 闸门只限**对拍覆盖面**，不限实现。
> ③ **已落批次的基线数字（`向量=30431 可比=29935 native不可比=0 …`）是 as-built 事实，不改**；
>    改版只影响**今后**批次怎么发向量、怎么定验收。`difftest` 的四列分类**保留**（它是机械事实：oracle 问不出结果就是问不出）。
> ⇒ 落到操作上的**唯一变化**：随机臂**不再是"生成阶段挡掉"**，而是发**合成向量**（显式声明来源）并断言**同 seed 复现 + 区间端点可达**；
>   `powerup(7)` / `poker` / `capture` 掷点支 / `set_pet_bag` 的 `random` 三支 / D6 的 N 支构造 —— **实现按 R1**，golden 里不比值。

`difftest` 的汇总行四列：`可比 / native不可比 / 架子没对上 / 不一致`。

- **`native不可比`（`nativeOnly`）**：上游炸在 native 层、本来就问不出结果。
  现在只有 `numid`/`ident` 走真随机那批，以及在镜像运行**之前**分类掉的
  `OutOfMemoryException`（见 §7 第一条）。这一列非零不是失败，但要看是不是它该有的形状。
- **`架子没对上`（`infra`）**：我的反射签名搭错。**必须归零**才算这轮绿。
- **`不一致`**：真分歧，一条都不许放过（要么改移植体，要么改镜像/形状，理由写进 port-map）。

还有一类要**在生成阶段就挡掉**，别指望运行时分类：不自终止的向量。
分类发生在 `mine(v)` 之前 —— 顺序错了闸门就挂死。

**两类"没有第四列、却会误导人"的形状**（S3 第六段量出来的）：

- **搬了但 oracle 永久问不出结果** —— `Powerup` 方法入口即 `SecurityException: ECall methods…`。
  它**不进** `PortedAbilities`，所以相关向量会红在 `架子没对上`；正确做法是**不发那条向量**，
  函数体照搬、形状交给 `node --test`。这不是"没搬"，也不是围栏，别在文档里写成待搬。
- **单向闸门：oracle 抛、移植体不该抛** —— `TurnEndPhase` 的 hud 调用（`UnitHudSystem` → `Unit.IsMyUnit()`
  → `PhotonNetwork.IsConnected`）在无头里 `TypeInitializationException`，而 hud 是表现层 ⇒
  **移植体不建模这个抛**。这类向量的正确形态是"根本不生成"，办法是绕开进入条件：
  本轮实测的谓词是「任一 unit 的 `totalBuffHeal − totalBuffDamage ≠ 0`」⇒ 挂 17 号时机的效果要么账本中性，
  要么给**同一只 unit 上净额为 0 的 damage+heal 成对**（2023 value=4 配 2024 value=25）；
  18 号（`OnAfterTurnEnd`）在 hud 之后 ⇒ 不受限；`AfterAttackPhase` 没有 hud ⇒ 富矿。
  ⚠ **成对 ≠ 平衡**：2016「吸取体力」伤害落 op、治疗落 self，逐 unit 净额 ≠ 0，照样撞闸门。
- **同一个闸门在算子层复现**（S3 第八段·批四）：`win(1)`/`escape(2)` 的**结果面**也过 `Unit.IsMyUnit()`
  ⇒ 一样 `TypeInitializationException`。所以这两支是**「半可比」**：只发 `state==null ⇒ false` 与
  `escape` 在 `:60` 处 `atkUnit==null` 的 NRE（**在进 `IsMyUnit` 之前**抛，两端同抛），结果面只靠 `node --test`。
  ⚠ **别去 stub Photon** —— 那要动 `AssemblyLoadContext.Resolving`，而 Photon 被引用的表面积远大于
  `IsConnected`/`IsMasterClient` 两个成员，会连带把别处的"同抛假绿"改成真比较。
- **共同根因是 ECall**：`PhotonNetwork.StaticReset()` 与 `Powerup(:561)` 的 `UnityEngine.Random.Range`
  抛的都是 `SecurityException: ECall methods must be packaged into a system module`。
  ⇒ 认这个 **`SecurityException`/`TypeInitializationException` 组合**，不要去猜"是不是缺程序集"
  （缺程序集是**加载期** `FileNotFoundException`，与运行期 ECall 完全不同）。

---

## 7. 上游陷阱登记表（对拍量出来的，不是读出来的）

| 陷阱 | 实测口径 | 移植体的态度 |
|---|---|---|
| `UnitPetSystem.GetParallelPetBag(pc)` 在 `cursor` 落在 `[0, pc)` 之外（但仍在袋长内）时**不自终止** | C# 数到数组上限抛 `OutOfMemoryException: Array dimensions exceeded supported range`，一条向量耗时 77 秒、吃约 2 GB | `state.ts:187-200` 是同一个 `for(;;)`，**行为一致**（as-built：本条**照抄了**）。⚠️ 按人类决议 ② 的政策分工（`docs/arch-docs.md §4.1`）**改判**：这是**代码逻辑 bug**（不自终止）而非数据错字 ⇒ 目标行为 = **入口显式抛**（与 `docs/domain/domain-base.md §5 B11` 的 `listRandom` 同族），⬜ **待落码**（阶段一不发码）。落码前：向量生成器只发终止形状、harness 保留 `OutOfMemoryException → native不可比` 的分类兜住手滑 |
| 同一函数的相邻两位 | `cursor < 0` ⇒ `(start+i+1) % len` 出**负下标** ⇒ `IndexOutOfRangeException`；`cursor >= 袋长` ⇒ 取 `pet` 那一行就炸，进不了循环 | 照抄，并在 golden 里各占一条 |
| `Effect.Format` 的键替换走 LINQ `ToDictionary` | 两个键被同一实参替成同名 ⇒ **抛 `ArgumentException`**，不是后者覆盖前者 | `collections.ts:toDictionaryStrict`（JS `new Map([...])` 默认静默合并 = 假通过） |
| `Helper.TrimParenthesesLoop` 默认括号是 **`[` `]`** | `1008[10]` 才是引用；`3044(2)` 不是 ⇒ `int.Parse` 整串炸 | 移植体按 `[` `]`，`buffdesc`/`refer` 两层各锁一条 |
| `int.Parse("99999999999")` | 抛 **OverflowException**（`TryParse` 同范围回 false） | `strutil.test.ts` 锁住 |
| `float.Parse/TryParse("1e40")` | .NET Core 3.0 起**不算失败**，给 `+∞`（`1e39` 也已是 `+∞`，Single 上界 `3.4028234663852886e38`） | `tryParseFloat` 只挡 NaN；"顺手"加 `isFinite` 会把合法字面量降级成标识符分支 |
| `Mathf.Clamp` 有 int / float 两版 | 必须 **int** 版：`f(2147483647) = 2147483648`，float 版会把 `Buff` 上界抬高一位 | 移植体走 int 版 |
| `buff` 表未写 `min_val` | 下界是 `int.MinValue` 而**不是** `-Infinity` ⇒ `value=-9999` 本来就在界内 | 照抄 |
| `.NET` 数字格式段数语义 | `"+#;-#"` 两段时**零走正段**且 `#` 渲染成**空串** | `GetBuffDescriptionPreview` 逐条对齐 |
| `Effect.getRawConditionOptionString` 判空 | 只看**第一个**条件字典（`FirstOrDefault()?.Count ?? 0`）⇒ `[{},{a=1}]` 整体输出 `none`，后面的字典被吞 | 原样保留，注释标"上游形状" |
| `getStateIdentifier` 的 `TryTrimStart` 链 | 每轮都重写 `trimId`（不匹配时原样返回）⇒ `id="buffturn"` 会带着 `trimId="turn"` 落到 switch 读出 turn | 是语义不是 bug，照搬 |
| `petInfoDict` 在宿主进程里是**空表**（Addressables） | `[x:pet]` 在真二进制里**只走兜底分支**"精灵信息错误" | S6 把宠表接进 oracle 时要一起换掉；换之前别把兜底当上游行为写进面板 |
| `Effect` 有**两个七参构造**（`Effect.cs:31` 全 string 的 CSV 行版、`:43` 的枚举版） | 反射按 `GetParameters().Length == 7` 挑 ⇒ 挑到 string 版，`EffectTiming` 喂进去炸 `ArgumentException: Object of type 'EffectTiming' cannot be converted to type 'System.String'`，看起来像"上游不认这个组合" | oracle 侧按 **`p[0].ParameterType.IsEnum`** 筛。规则：**同元数重载绝不按元数挑**，按键类型挑 |
| `EffectHandler.Condition` 对队列里**每一条**都调一次判定，与 timing 无关 | `GetEffectsByTiming(OnSelectTarget, …)` 为了借 `phase` 判一遍，先把整条队列判完再筛 ⇒ 只要队列非空就必然进 JUDGE。而 `GetEffectHandler` 无条件把 `WeatherBuff.effects` 塞进队列（`BattleState.cs:295`），真表 500000..500014 **每个天气印记都带一条效果** ⇒ 队列**永不空** | 步骤 4 之前生产 `JUDGE` 是 `NOT_PORTED`，这八条 `target`（fromDefault）**发不了**；步骤 4 把真判定搬进 `effect-judge.ts` 后，harness **按 kind 作用域**注入真 judge，八条连同 oracle `TargetVector` 补 `currentState` 一起补回（对拍 可比+8、不一致=0）。教训：**"这条路不用判定"要实测，不能读源码认定** |
| `ListHelper.Random(int, bool)` 的两条静默兜底 | `!repeat && count > Count` ⇒ 返回**整表拷贝**；`count = -1`（`target_num` 没配）⇒ `while (result.Count != count)` **永不成立** ⇒ 上游死循环 | ⚠️ **已按人类决议 ② 改判（2026-10-17），分两半**：**第一条**（`count > Count` ⇒ 整表）**是求值口径 ⇒ 照搬**；**第二条**（不自终止）**是代码 bug ⇒ 声明 + 修** —— 目标行为 = 入口对 `count < 0` 与"不同项数不够"**显式抛**（`docs/domain/domain-base.md §2.4 / §5 B11`，与本表首行的 `GetParallelPetBag` 同族）。⬜ **待落码**：`collections.ts:listRandom` 今天**还保留同一个循环**（as-built），向量生成阶段挡掉 `-1` 那形状，`target.test.ts` 用"数到第 200 次就抛"的假骰子断它不终止 —— 落码后这条断言**换成"断它抛"** |
| `ListHelper.Random()`（单个）用 `Range(0, Count)` **闭区间** | 抽出 `Count` ⇒ `List.Get(index)` 越界给 **`default(T)`** ⇒ 空表抽一个得 `[null]`；而且这个 null **占一个名额**、第二次抽到 null 才被 `includes` 挡掉 | `listPickRandom`/`listRandom` 照抄，`target.test.ts` 锁形状（随机本身 native ⇒ 进不了 golden） |
| `Parser.FromPetBag` 的 `index` 支 | `petBag[targetIndex]` **绕过** `target_filter` 与 dead 过滤，`IsInRange` 上界还是**开区间** ⇒ 越界时静默往下落到 `target_num`；`List.Remove(defaultPet)` 只删**第一个**引用相等的项 | `target.ts` 逐条对齐；袋里有重复引用、有洞这两种形状 golden 铺不到 ⇒ 单测锁 |
| `BattleStatus.ParseConditonStat` 里 `status.parallelCount \|= x >= 0 ? 1 : 0` | JS 的 `\|\=` 对 `undefined` 是"或一下"，C# 的 `\|=` 是**按位或**，且 `int.Parse` 对 `"random"` 是**静默 0**（不是异常） | `pet/buff-controller.ts` 曾把 `\|=` 写成 `\|\|` ⇒ `parallelCount` 永远 1、`parallelApplyOOM` 一族 12 条集体变红。按位或与 `\|\|` 在 0/1 世界里不相等，抄 `\|=` 就写 `\|=` |
| `Parser.SplitCondition`（`condition` 串不匹配形状时） | **抛 `ArgumentOutOfRangeException`**（`"buffturn"` 这类串在 `pet.buff[...]` 支里直接抛），不是返回 false | `skill[power]` 的"括号里不是 int ⇒ 不进臂"合取守卫救回了大多数；剩余抛出点在 `effectident` 里比"抛不抛" |
| `skill[999].power` 在 BattlePet 层 | 给 **`FLOAT_MIN_VALUE`**，`0` 是调用方 `GetNumIdentifier` 的兜底 ⇒ 两层各拍各的 | `getBattlePetIdentifier` 不许提前兜 0 |
| 反射按 `(string, object)` 找 `ItemInfo.GetItemType` | 找到的是 `object GetItemType(string)`，**没有 `bool` 重载**（`ItemInfo.cs:52` 只有一个）⇒ `MissingMethodException`，红成"上游不认这个入参" | 方法签名查错时**先怀疑反射的 binding flag 和重载**，再怀疑上游 |
| 无头门禁按**字面量**扫 | 错误串里写 `"未移植: BattleManager.database"`，`.` 让正则里的 `\.database` 匹配不上 ⇒ 门禁"全绿"却把 `database` 这个词带进了 `game/core/**` | 上游符号名只出现在**注释**里，抛错文案换成中文描述（`phase.ts:282,299` 是范例） |
| `StatusController.GetPowerUp(type)` 读的是**属性** `powerup[type]`，不是裸字段 `_powerup` | `min>max` 的鬼值上才暴露：`SetMinPowerUp(9)`/`SetMaxPowerUp(3)` 后裸字段是 `0`，属性给 **`9`**（`Clamp` 的两头都过一遍） | `getPowerUpType` 读钳后的值。`statusctrl` 一族直接拿这条做向量 |
| `AddPowerUp` 的累加**再钳一次** | 当前 999 ⇒ 先钳到 6，`+3` = 9，`SetPowerUp` 写回时**又钳回 6**（写的是钳后的值，不是 9） | 照抄；`status-controller.test.ts` 锁住 |
| `PetBattleBuffController.BlockBuff(List<int>)` 只有 `AddRange` | **不回头滤**已经装在袋里的印记 ⇒ "先装后屏蔽"的袋子照旧带着被屏蔽项，只有**调用时**的检查生效 | `buff-controller.ts` 的 `blockBuff` 同样只 append，并各留一条 golden/单测 |
| `BattlePet.PowerUp(…, isSet)` 的 `isSet` **只**跳过免疫检查 | 问过二进制：起点 `powerup=[1,…]` 加 `3`，`isSet=true` 与 `false` 都给 **`pw=4`** ⇒ 写入永远是 `AddPowerUp` 累加，参数名里的 "Set" 不是覆盖 | `petPowerUp` 保持 `addPowerUp`；`petmut` 用「非零起点 + 不撞 ±6 钳」的向量把这两支分开（`Set` 会给 3、`Add` 给 4） |
| `PetBattleSkillController.GetAvailableSkills` 两支袋子都是 null | 上游是 `null.Where(…)` ⇒ 当场 `ArgumentNullException`，**不是**空表 | 移植体同样抛（`skill-controller.ts`）。静默兜底会把"袋子还没接"伪装成"这只宠没有可用技能" |
| 同一个"普攻表"在两处取**相反**的袋子 | `GetAvailableSkills` 是 `normalSkills` 优先；`Identifier.GetPetIdentifier` 的 `normalSkill[N].x` 那臂是 `IsNullOrEmpty(loopSkills) ? normalSkills : loopSkills` ⇒ **loopSkills 优先** | 两处各自照抄，别"统一"。都进过对拍 |
| `isSuccess \|= AddBuff(…)` / `\|= RemoveBuff(…)` 在 C# 里**不短路** | 袋子里首只成功后，剩下的每一项仍要被调用；写成 JS 的 `\|\|` 会在第一次成功后停掉 | `addRangeBuff`、`removeRange` 两处都曾这么错过。先算再或，且各留一条"多项都动"的 golden |

---

## 7A. 单族比对器与两张白名单（S3 第六段立的两个小工具）

全量 `difftest` 一次几分钟，改一条驱动向量等不起。本轮固化了两件窄工具：

- **`tools/drv-proto.mjs <向量文件.json>`** —— 驱动/快照向量的**原型台**。它按 `difftest.mjs:205-246` 的
  顺序把四张表喂给镜像（`setEffectTable` → `setSkillTable` → `setBuffTables` → `setBuffHost`，
  **少一步就会拿假 NRE 当上游行为**：本轮踩过一次，`Buff` 构造里 `this.info.turn` 炸，那是缺表装载，不是上游形状），
  然后跑 oracle + `mineSnap`，逐条打
  `✓值同 / ❌值不等（按 `|` 拆列，只打不一致的列）/ ✓抛同（**两边异常各打一段**）/ ❌oracle抛/TS不抛 / ⚠infra`。
  用法：把候选向量写成 JSON 数组放 `/tmp`，`node tools/drv-proto.mjs /tmp/drv.json`。
  **筛掉"oracle 完成 / TS 抛"和反过来那两类不可发形状，再往 `snap-mirror.mjs` 里落**。
  ⚠ `✓抛同` 只证明"两边都抛"，**不证明同一个原因**：本轮 X4(976)/X10(968) 是 oracle 上游 NRE vs
  TS `NOT_PORTED: random[old]`（一条接缝），不是算子证据 ⇒ 别把它当 golden 收进来。
- **`tools/buff-whitelist.mjs`** —— 印记候选白名单复算器。口径：`buffs.json` 的 2121 行里，
  每条取 `timingId ∈ {-3 on_add_buff, -4 on_remove_buff, -999 all}` 的效果，要求
  `abilityId ⊆ PortedAbilities`；**`on_effect(-10)` 不算进扫描集**（全表只有 6 行挂它，算子全是 baked `abilityId=0`，
  进不进都不改数字）。当前实测（批四白名单 13 个 id）`2029 安全 / 92 脏`；`node tools/buff-whitelist.mjs -- 5`
  复算出加 heal 前的 `1904 / 217`。脏的分布现在是 `rage=56 set_buff=37 set_pet=32 powerup=27 poker=1 set_pet_bag=1`
  （批一/批二时代曾是 `block_buff=160 … set_weather=3` —— 那两类已搬，脏数从 217 掉到 92）。
  **搬一支新算子就把它的 id 同时加进本文件的 `PORTED` 和 oracle 的 `PortedAbilities`，重跑一遍再挑样本。**
  ⚠️ 白名单扩大**不会**自动给 `snap-mirror` 放量（那边的"安全样本"是**手工挑死**的列表）。
  `powerup(7)` 那 27 行即使 TS 搬了也**不能当安全样本**（oracle 侧入口就抛）；
  `win(1)`/`escape(2)` 已在白名单里，但它们的**结果面**撞 Photon ECall ⇒ 挂它们的行要单独判断（见 §6）。

**签名扩三档的顺序纪律**（步骤 0 的做法，值得复用）：先把 `Sig*` 改好、**一个算子都不动**，跑一遍全量
（条数与结果都该不变 ⇒ 一翻红就确定是两边字符没对齐），再开算子。本轮 `SigPet` 加 `bf[…]/st=…/pw=…`
就是靠这条把"格式差"和"行为差"分成了两批红。

---

## 8. 别做的事

- 别为了绿把比较器调松（`eq` 的 `fround` 是唯一允许的宽容，且两边对称）。
- 别把 `infra` 非零当"上游异常"，也别把 `native不可比` 当"通过"。
- 别把上游二进制、`projects/bake/baked/` 之外的上游资产或任何解码产物提交/分发。
- 别在 `game/core/**` 里引入 `UnityEngine` / `Player.instance` / `Photon` / `Database.instance`
  —— 需要那个语义就走注入的接缝（`setNetFence`、`setBuffHost`、`views.ts` 的 Pet/Skill 视图接口）。
- 别用裸 `grep -rE 'UnityEngine'` 判无头（注释里出现这些词是**必要的**，说明这里替代的是谁）；
  用 §1 那条带两条 `grep -v` 的判定。
