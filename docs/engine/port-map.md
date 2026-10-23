# 移植对照表（Restart-Lite C# → 网页端 TS）

> **三份文档的分工**：本文件 = **结论集**（实测事实、口径、围栏、每一段对拍抓到什么）；
> `docs/engine/oracle-playbook.md` = **操作手册**（怎么加向量、反射/float 纪律、不可比分类、上游陷阱登记表）；
> `docs/engine/kernel-handoff.md` = **交接与规划**（内核目标、S1…S6 路线图、当前落点、下一件事、冷启动步骤）。
> 新会话从 kernel-handoff 进，遇到"怎么做"查 playbook，遇到"事实是什么"查这里。

> ⚠️ **口径改版（人类 2026-10-17 决议 ① / ②，验收见 `AGENTS.md §1.1`）** —— 本文件是 **as-built 结论集**，
> 因此**历史数字与各段实测不改**；改的只有**"接下来怎么做"的口径**，三条：
> ① **随机 / 墙钟**：oracle 侧的 `UnityEngine.Random` shim **取消** ⇒ 凡"native 随机 ⇒ 永久不可比 ⇒ 不发向量 / 不实现"的措辞，
>    今后读作"**实现照做（走 R1/R2 注入）+ 验收换成同 seed 自复现 + 形状断言 + 人类手测**"；
>    细则与接缝在 `docs/runtime/runtime-components-design.md §5/§7`，分类法解释在 `docs/engine/oracle-playbook.md §6` 开头的改版块。
> ② **上游代码 bug**：政策 = **声明 + 写无 bug 的目标行为**（`docs/arch-docs.md §4.1`）。本文件里"照抄上游 / 行为一致"的条目要按这条**重新分类**：
>    **数据表错字 = 照搬**（V2），**代码写错（不自终止、单边漏检、catch 位置）= 声明 + 修**（⬜ 待落码，阶段一不发码）。
>    已按此改判的第一例：`GetParallelPetBag` 的不自终止（见「S3 第三段」节与 `docs/engine/oracle-playbook.md §7` 首行）；
>    先例（早就偏离的）：`TrimParenthesesLoop` 的 64 次上限（见「已确认的怪癖」节）。
> ③ **Photon 的 ECall 单向闸门与随机无关** ⇒ 半可比、"这些形状不生成"照旧；但闸门只限制**对拍覆盖面**，**不限制实现**。

规则权威 = `projects/Seer2-Restart-Lite-main/`（`lite_4.9.2` / 2026-09-25+08:00）。
素材与 swfId = `vendor/seer2-origin-as3/` 与 `game/petContainer.root.swf` + `projects/bake/baked/`。
`arcadia-eternity` **只是参考项目**（其事件词汇表可读，规则一律不采信）；它的 `packages/battle`
产物 `game/battle-kernel.js` 与 `game/kernel/glue.ts` 已退役，不在关键路径上。

数据产物：`tools/build-unity-data.mjs` → `game/data/unity/*.json`，每个文件带 `_version`。
度量口径全部来自实测（`manifest.json`），不是估算。

## 两套数据命名空间（踩过一次，写死在这里）

| 目录 | 血统 | 生产者 | 消费者 |
|---|---|---|---|
| `game/data/*.json` | 官方 AS3 / 改服（1016 宠 · 8658 技，含 **swfId**） | `tools/build-data.mjs`、`build-items.mjs`、`build-map-index.mjs`、`build-wild-index.mjs` | `app/scenes/mapScene.js`、`legacy/*.html` —— **当前线上页面** |
| `game/data/unity/*.json` | 重启 `lite_4.9.2`（838 宠 · 5340 技 · 2121 buff） | `tools/build-unity-data.mjs` | `core/**`（S2 起） |

两个 schema 不同（重启顶层是 `{_version,_table,pets:[]}`，app 要的是
`{_src,types,skills,monsters,growth}`），**同名覆盖会当场炸** ——
实测失败点：`mapScene.js:119` 与 `:106` 读 `PETDB.monsters[id]`，覆盖后 `PETDB.monsters` 是 `undefined`
⇒ TypeError。S1 期间误写过一次根目录，已把产物改到 `unity/` 子目录并用 `build-data.mjs`/`build-items.mjs`
重建（两者完全离线、确定性输入 `assets/main-config.json`）。重启内容宇宙要等 S2/S6 明确切换数据源后才接管根目录；
在那之前 `core/` 只从 `unity/` 读，页面照常跑官方表。

## 实测总量（lite_4.9.2）

| 表 | 行数 | 判据 |
|---|---|---|
| Pets | 838 | `manifest.counts.pets`；`_version` 锚 `Data/System/version.xml` |
| Skills | 5340 | 与计划的"内容宇宙"数字一致 |
| Buffs | 2121 | 同上 |
| Items | 612 | 同上 |
| Features | 354 | `Pets/feature.csv` |
| 预制效果 | 113 = 58 行 + 55 份 `+10000` 复制 | `Effects/effect.csv` 有 58 个数据行（每行 1 条子效果）；`LoadEffects:725-731` 把 `IsWithin(0,10000)`（**闭区间**，HelperMath.cs:43-48）的预制**再存一份 id+10000 且 timing=None**，越界的 3 行是 id `-1/-4/-7`。`Effects/info.csv` **无加载器**，不消费 |
| 效果实例 | 12425 | Skills+Buffs+Items+预制 之和 |

`\` 子效果条数分布（计划里写的是估算值 3840/1122，实测如下，以本表为准）：

- Skills：1→3843、2→1119、3→220、4→100、5→24、6→27、7→3、8→2、9→1、20→1
- Buffs：1→1171、2→574、3→190、4→82、5→37、6→14、7→6、8→5、9→3、10→1、11→33、13→1、14→2、24→1、59→1
- Items：1→510、2→88、3→11、4→3

算子频次前 6 覆盖 **74.2%**：`add_buff 2984 / set_skill 1741 / powerup 1346 / set_damage 1269 / heal 1027 / none 855`，
其后 `remove_buff 772 / add_status 572`。S3 按这个次序逐个移植，长尾先空实现。

## CSV 加载契约（已坐实，别再猜）

- `ResourceManager.GetCSV`：`text.Split(new[]{',','\n'}, RemoveEmptyEntries)` + 固定 `DATA_COL` 跨步；
  第 0 行当表头吃掉。**`LoadCSVByLines` 是死代码**。⇒ 全仓 10 张表零引号、零字段错位（实测），
  上 RFC4180 严格解析反而会与上游分叉。
- `\` = 横向子效果分隔；`/` = 单元格内值列表。
- 只有 `Pets/basic.csv` 跳过首字段 `startsWith('#')` 的行（ResourceManager.cs:916）；本表实测 0 行命中。
- `GetEffectLists` 的循环上界 = **`effectData[0].Length`（只看第 0 列）**：
  其它列更长 ⇒ 多出来的静默忽略；更短 ⇒ IndexOutOfRange ⇒ **整行效果变空表**（行级 try/catch）。
  实测 14 行"更长"、**0 行"更短"**，所以今天没有丢任何行；`audit.rowMismatch` 记 14 条 `extras ignored`。
- `GetSkill/GetBuffInfo/GetItemInfo` 把**整个循环**包在一个 try 里 ⇒ 第一次 throw 会截断其后所有行。
  移植时把这两类异常（`int.Parse` 失败、重复 option 键）当**硬失败**卡门禁，而不是悄悄截断。
- info 与 effect 表**按行下标配对**（`effectLists[i-1]`），不是按 id。实测 2 处 id 不等
  （`manifest.audit.effectPairMiss`），只记账、不改数据 —— 跟上游行为一致。

## 上游数据自身的错字：照抄它的降级，并配额化卡住新增

`To*` 系列扩展一律 `dict.Get(key, None)`（BuffDatabase.cs:35-45、EffectDatabase.cs、ItemDatabase.cs）
⇒ **拼错的 token 不报错，降级成 None**。移植必须复现同一降级（否则网页端比参考实现多做事情），
但绝不让新错字悄悄溜过去：`KNOWN_SILENT_FALLBACK` 写死配额，条数一变就卡门禁。实测 20 处：

| 键 | 次数 | 落点 | 降级后果 |
|---|---|---|---|
| `timing:on_remove_buf` | 1 | Effects/effect 预制 | 少一个 f → timing=None |
| `target:heal` | 1 | Skill 13736 | ability 名写进 target 位 → target=None |
| `condition:noen` | 2 | Skill 14168/14169 | none 拼反 → condition=None（= 恒真） |
| `condition:state` | 1 | Buff | state 是 target 的 token |
| `ability:poewrup` | 2 | Skill 15178/15179 | powerup 拼错 → 整条效果空转 |
| `ability:set_effect` | 7 | Skill 1 + Buff 6 | **枚举里根本没有这个算子** |
| `copyHandleType:none` | 2 | Buff -7 最大体力锁定 / -3090 模仿反击 | CopyHandleType 无 none → New |
| `copyHandleType:chance` | 2 | Buff 3624 再生复苏 / -3127 蓄势 | BuffType 的 token 漏进 copyType 列 → New |
| `copyHandleType:repalce` | 1 | Buff 200298 水性 | replace 拼错 → New |
| `buffType:new` | 1 | Buff 3591 漩涡风（天气） | CopyHandleType 的 token 漏进 type 列 → BuffType.None |

`SkillType` 表里还出现未声明的 `-7`（1 行）。C# 的 int→enum 强转不校验，所以它就是个 -7；
只记进 `audit.unknownSkillType`，**不**在词表里补一个假名字（补了就把真发现遮住了）。

## 已确认的怪癖（分两类：**数据/口径差异 ⇒ 保留**；**代码逻辑 bug ⇒ 声明 + 修**）

> ⚠️ **本节标题于 2026-10-17 改版**（原为「移植时保留，不"修好"」）。按人类决议 ② 的政策分工
> （`AGENTS.md §2`、`docs/arch-docs.md §4.1`、`docs/domain/domain-design.md §7` 第 5/6 条）：
> **发行数据里的错字/水印/降级 = 照搬**（V2，那一支的配额门禁见上一节）；**代码写错 = 声明 + 写无 bug 的目标行为**。
> ⇒ 本节的每一条今后要**标类别**。已有的先例：`TrimParenthesesLoop` 的真死循环**已经**有意偏离（加 64 次上限后抛，见下）；
> 已按此改判的第一例 = `GetParallelPetBag` 的不自终止（本节下方 → `docs/engine/oracle-playbook.md §7` 首行，⬜ 待落码）。
> ⇒ ⚠️ **不许扩大解释**：下面的 `dict.Add` 抛、`Get` 越界给 `default`、`ToFloatList` 整表 null、`int.TryParse` 拒小数
> 都是**求值/装载规则**（是语义不是 bug），照搬不变 —— 与 D1 `§5 B11` 末尾那句"不许把政策读宽"同一条边界。

- `PetBasicInfo.cs:92` 的 `TrimEnd("[" + p + "]")` 绑到 **char[] 字符集重载**，不是本仓库那个
  string 后缀扩展 ⇒ `13` 行 `0[9]/1[1]` 形状解析失败，留下**部分填充**的性别列表
  （`manifest.audit.quirks`）。⚠️ **类型 = 代码写错（用错重载）+ 数据形状畸形**：解析规则**照搬**（V2 的降级形状不动），
  但**失败要可见** —— 已落地的先例是桥为它单独产出 `genderParseFailed` 审计列（`tools/build-unity-data.mjs:217-269`）；
  ⬜ **待落码**的是把装载/导出的容错从"整表"降到"逐行"（= `docs/domain/domain-info.md §2.10 CB6`，D7 施工批 **B2** 的桥侧）。
- `Parser.ParseOptions` 用 `dict.Add` ⇒ 同一 option 段内重复键 **抛 ArgumentException**。
  实测现表 0 处命中（`parseMultipleOptions('a=1&b=2|a=3')` 是两段、各自一个 Map，合法）。
- `ListHelper.Get` 越界/空表返回 `default(T)` ⇒ `ListHelper.Random` 对空表返回 **0**
  （HelperCollections.cs:74-82, 108-123）⇒ `random[]` = 0。
- `TrimParentheses` 默认剥 **方括号 `[]`**，不是圆括号（Helper.cs:59-83）；
  `TrimParenthesesLoop` 对畸形串在 C# 里是**真死循环**，这里加 64 次上限后抛错（有意偏离，见 `strutil.ts` 注释）。
- `ToFloatList` 只要有一个 token 既不是浮点、其标识符值又为 0 ⇒ **整表返回 null**，调用点据此走默认值。
- `int.TryParse` **拒绝**小数（截断是另一回事，`(int)` 强转才截断）；`ToIntRange` 的区间分隔符只有 `~`，
  默认 parseFunc 是会抛的 `int.Parse`。

## 求值器边界语义（S1b 差分 oracle 实测，不再是推测）

oracle 在 `tools/oracle-cs/`：一个 net9 console，用 `AssemblyLoadContext` **反射加载游戏自己编出来的
`Assembly-CSharp.dll` + `UnityEngine.CoreModule.dll`**（`/home/wing/Software/Seer2/Seer2 Restart Lite 0827/…`），
把 `Parser/Operator/Identifier/Mathf` 的返回值打成 JSONL。
**不是**"照上游源码再编一遍 C# 然后对拍" —— 那样两边都是我对源码的理解，一致只证明我没跑偏自己的误解。
直接调真二进制把这层循环论证消掉了，也顺手把 `Mathf.RoundToInt` 这类"只有 Unity 运行时才有权威答案"的问题当场坐实。

```
dotnet build tools/oracle-cs
node tools/difftest.mjs [--n=1200] [--seed=7]     # 退出码非 0 = 有分歧 = 门禁红
```

现状：向量随移植面扩大，S2 收尾时是 seed 1/3/7/11/42/99/123 各 2013 条，**不一致 = 0**、架子没对上 = 0
（S1b 只有求值器时是 1623 条）。

| 语义 | 上游实测 | 我原先的误解 |
|---|---|---|
| `float.TryParse` 的语法 | **接受**科学计数法 `1e5`、千分位 `1,000`/`1,00`/`12,34,567`/`1,`/`1,.`；**拒绝** `,5`、`1.000,5`、`1e`、`1e5f`、`0x10` | 按 JS 直觉以为"不认指数、不认逗号" ⇒ 190 条假分歧 |
| 字面量的精度 | 解析这一刻就是 **float32**（`"34.22222222222222"` → `34.22222`） | 留着 double 进算术 |
| 算子入参 | 签名是 `(string, float, float)` ⇒ 入参先收窄；`7.9 × 2.9` = `22.910002` 不是 `22.90999984741211` | 拿调用方传来的 double 直接算 |
| `Mathf.RoundToInt` 半值 | **ToEven**：`0.5→0 1.5→2 2.5→2 3.5→4 4.5→4 5.5→6 -0.5→0 -1.5→-2 -2.5→-2` | 已在 `mathf.ts` 猜对，现在是实测而非猜测 |
| `*ToInt` / `(int)` 的 NaN | → **0**（不抛、不是 NaN） | 传播成 NaN |
| `*ToInt` / `(int)` 的越界 | **饱和**：`floori(1.98e34)=2147483647`、`floori(-1.98e34)=-2147483648`、`(int)Inf%3=1` | 以为 x64 回绕、准备"记为有意分歧" |
| `*ToInt` 的负零 | int 没有 `-0` ⇒ `ceilToInt(-0.05)=+0`，于是 `[CEL]/[RND]` 对负小数乘回来是 **+0** | JS 的 `Math.ceil(-0.05)=-0` 一路带下去，`Object.is(0,-0)` 为假 |
| `Mathf.Min/Max` | 严格比较、不成立返回 **b** ⇒ `Min(NaN,61.5)=61.5` | `Math.min(NaN,…)=NaN`（内容里 `(859/1)[MIN]61.5` 这类带括号 token 的表达式真会走到） |
| `%` | `(int)lhs % (int)rhs`，**除数截断为 0 就抛 `DivideByZeroException`**（`5%0.5`、`0.9%0.9` 都抛） | JS 里静默给 0/NaN |
| float 除零 | 返回 ±Inf（不抛）。JSON 写不了 ⇒ oracle 用 `"Inf"/"-Inf"` 哨兵，difftest 映射同一组 | — |
| 括号 token | `"(859"` 原样进 `GetIdentifier` ⇒ 兜底 **0**（不剥圆括号） | 以为会递归求值 |

不可对拍的一族：`random` / `random[old]` / `random[new]`。实测上游 `UnityEngine.Random.Range(0,100)` 在
玩家进程外**直接抛 `SecurityException: ECall methods must be packaged into a system module`**
（`Identifier.GetNumIdentifier("random")` 同），`random[old]` 则炸在 `Player.instance` 为 null 的
`NullReferenceException` 上 —— 所以 oracle 给不出 golden，difftest 不生成这类向量（`nativeOnly` 桶保留，
万一有向量走到这里会被单列成"不可比"，绝不当通过）。改由单测断言其**形状**：`0..100` 闭区间的整数、
`[new]` 写回后 `[old]` 读到同值、空表 `random[]` = 0。
> ⚠️ **口径注（人类决议 ①，2026-10-17）**：上面这段是**分类事实**（oracle 问不出结果），不是"不做"的许可 ——
> 本族的**实现照做**：随机来自 **R1** 注入的 `Rng`、`random[old]/[new]` 走 **R3** 存档面、墙钟走 **R2**
> （接缝定义 `docs/runtime/runtime-components-design.md §5`）。上面"改由单测断言形状"**正是**新口径要的验收手段；
> 变的是：① 今后这类臂要发**显式声明来源的合成向量**并断言**同 seed 复现**，不再停在"不生成"；
> ② **主要验收 = 人类手测**（`AGENTS.md §1.1`），形状单测只是回归门。

已知**未**覆盖的一处：20 位以上的长字面量 .NET 走遗留累加路径，与最近 float32 差 1 ULP 级
（实测 `1,000,…,000` → `9.999999884841548e26`）。内容表里没有这种字面量（CSV 以 `,` 分隔，字段内不可能含逗号；
`grep -E '[0-9][eE][+-]?[0-9]'` 命中的 3 处全是描述文本里的颜色十六进制），difftest 也不生成它。

## 数值层（S2 差分 oracle 实测）

`game/core/{mathf,rng,strutil}.ts` + `parser/*` + `pet/{status,status-controller,linear,element}.ts` + `battle/damage.ts`
= 能力值 / 伤害 / 命中 / 暴击 / 相克 / 先手排序 / 捕捉分档。对拍规模：**2013 条向量 / 可比 1990 / 不一致 0**
（seed 1·3·7·11·42·99·123 各自都是 0；oracle 抛错 23 条两侧同分布，含 `statusparse → NullReferenceException` 4 条）。
golden 冻结在 `game/core/pet/status.test.ts`（期望值**抄自 oracle 的答复**，31 个用例）。

float32 的三条边界纪律 —— 每条都是分歧查出来的，不是先想通的：

| 位置 | 规则 | 踩到的分歧 |
|---|---|---|
| 类型是 `float[]` 的**字段** | 存进去的每个值都要 `fround`，**构造器和每个 setter 都要**，不只是算术结果 | 72 条 `statusop`：`new Status([…])` 留了 double |
| 类型是 `float` 的**形参** | 入口就收窄。`Mathf.Pow(1e7, 0.2)` 用 double 指数得 `25.118864`、用 `0.2f` 得 `25.118866` —— 差一整颗 ULP | 1 条 `statusop pow` |
| `Enumerable.Sum(IEnumerable<float>)` | 累加器是 **double**，只在返回处收窄一次（与 `Average(float)` 同源）；逐步 `f(acc+…)` 是错的 | 3–4 条 `statusget key:'sum'` |

其余坐实（写进代码注释，别再重新发现一次）：

- `Status / float` 是**乘倒数**（`divF`），`/0` 给 ±Inf 不抛；`1/0.2` 在 double 与 float 下是 `4.9999999254` 与 `5.0`。
- `Linear<Status>.Parse`：`'1/2/3/4/5/6'` → 整向量六列；`'(atk:5)(hp:10)'` → `[5,0,0,0,0,10]`；
  **`'atk:5'`（无括号）抛 NRE** —— 上游那条判空写在 `str` 而不是 `typeList` 上，是活的死分支，照炸不修。
- `GetElementName(-1, 3)` = `　全部`，左侧补的是 **U+3000 全角空格**（`charCodeAt(0) === 0x3000`），不是半角。
- 先手排序：LINQ `OrderByDescending×4 + ThenByDescending + ThenBy` 在稳定排序下 = 六键字典序；
  **全并列时保持输入序**，且输出带阵营符号 `(int)(Mathf.Sign(unitId) * (cursor + 1))`。
  `DecidePriorityPhase.cs:40-57` 给 null 技能算的第一键 `-1` 是**死代码** —— 第二键 `Item2.isAction` 紧接着 NRE。
- `GetSkillTypeStatus` 返回 `KeyValuePair<int,int>` ⇒ 攻防在离开该函数时已被 `(int)` 截断一次，
  之后 `PrepareDamageParam` 才当 float 用；`level = (2*L+10)/250f` 的分子是**整数**运算。
- 相克表在 `PetElementSystem.cs` 是硬编码 C#（23 元素，N/R/W/O = 1.0/0.5/2.0/0.0），不在 CSV 里。

oracle 侧的**架子故障**要单列、绝不当通过：非有限浮点跨进程是哨兵字符串 `"NaN"/"Inf"/"-Inf"`，
用 `GetSingle()` 读它会抛 `InvalidOperationException: element has type 'String'` —— 这是 4 条
`floori/ceili` 假失败的真因，改成 `f32(...)` 才对。`tools/difftest.mjs` 把这类计入「架子没对上」而不是分歧。

## 内容宇宙已换到重启表（S2 判据的落点）

`game/app/content.js` = 桥。技能/能力值/元素/名字一律读 `game/data/unity/*`（`lite_4.9.2`），
官方 `game/data/pets.json` **只**剩一个用途：`swfId` 动画 id（重启不是 Flash 客户端，表里没有）。
六维换算：重启 `Status` 六列序 `atk/mat/def/mdf/spd/hp` ↔ 官方命名 `atk/spa/def/spd/spe/hp`
—— 注意官方的 `spd` 装的是**魔抗**、`spe` 才是速度，这个命名坑照搬不改。
`game/core/**` 要进浏览器必须有 `.ts → .js` 一层机械转写（`tools/build-core.mjs`，Node 自带
`stripTypeScriptTypes`，只改说明符、不打包不降级；`.ts` 永远是权威源）——**验页面前先跑它**。

判据现场：战斗页 `#cards` 读数条（DOM，中文不受 SWF 字体子集限制）显示
`拍打 威力40 命中95`（官方表是 100）与 `六维 {"hp":280,"atk":237,…}`（= 移植公式 L100 的结果），
默认对局改成 1 vs 2 就是为了让它无需配参数即可见。野怪表按重启 838 表裁掉 7 只（231/269/344/361/379/416/535），
`mapScene` 装载时裁剪并记档 —— 宁缺勿错。

已知**尚未**换干净的两处（各自的阶段负责）：`battle-kernel.js` 仍按它自己的 packs 算 maxHp
（页面血量 389/701 那一档是它的，不是重启的）→ S3 整块退役；存档里 `hp` 上限仍走官方
`logic/stats.js` 曲线 → S5 换。另有一处登记过但**结论要改**：`Skills` 表里 2099 张技带
`options.priority/critical`，早先记的是"build 产物只留原始 DSL 串、装载时必须回写进字段" ——
实测不成立，`build-unity-data.mjs:332-344` 已经把 `anger/maxPP/critical/priority/vipriority/ignore*/
referBuffList` 全算好写进了 JSON。**内核反过来刻意不走这些预计算字段**：`battle/skill-table.ts` 把行还原成
九列原文再走上游那条 ctor（`Skill.cs:86-106` + `InitOptionsProperty:140-151`），因为拿移植体比我的 build 产物
等于"两份假实现互相比"，恒绿且零信息量；派生字段必须由**被移植的逻辑**算出来，再与二进制的逆函数
`GetRawInfoStringArray` 逐列比（对拍 kind `skilltable`）。HUD 侧的读取方继续用 JSON 的现成字段，不受这条影响。

## 未移植但已登记的 DSL

- `Linear<int>.Parse(skinStr, int.Parse, int.MinValue)` —— `PetUIInfo.ParseSpecialSkin` 用；
  皮肤/学习力/性格那批面板（S6）之前得先搬 `Common/Linear.cs`。
- `PetElementSystem.cs:66-91,160-165` 的相克表是**硬编码 C#**（23 元素，N/R/W/O = 1.0/0.5/2.0/0.0），不在 CSV 里，S2 搬。
- `Battle/critical_effect.csv`（11 列）是演出数据 → 归 view 层，不进 `core/`。

## 围栏排除（明确不做）

PVP / Photon、卡牌模式（`card` 算子走 `DefaultAbility` 空实现）。

## 保真度口径（用户定调：重点是重启的**游戏逻辑**，不是与 C# 逐字节一致）

对拍是**手段**，不是目标。分歧按两类处理，别混：

| 类别 | 处理 | 例子 |
|---|---|---|
| **会改变游戏状态**的语义 —— 数值、控制流、表装载顺序、夹紧/截断/取整、DSL 解析结果、集合插入序 | 一律照二进制对上，这是这次移植的全部技术风险所在 | `RoundToInt` ToEven、float32 收窄时机、`ref_buff` 的方括号、`ToDictionary` 重复键抛 |
| **JS/C# 的表层差异** —— 异常类型与文案、private 成员布局、`.NET` BCL 内部实现、没人看的调试字符串 | 不追。单测只断"抛不抛/返回什么"，不断文案；对拍规则本身就是"两边都抛 ⇒ 一致" | `FormatException:` 前缀、`MissingMemberException` 措辞、`int.Parse` vs `Number()` |

因此 S4 的判据按这一条重读：**同种子重放要求两侧行为等价**（同一回合序列、同一结算、同一状态形状），
不要求 `BattleState` 的字段集合与 C# 一一对应，也不要求我们的 RNG 流等于 `UnityEngine.Random` 的流
（Unity 的 `Random.Range` 在进程外直接抛 `SecurityException`，本来就没有 golden 可对）。
⇒ **这一条已由"用户定调"升级为人类决议 ①（2026-10-17），并且更硬**：oracle 侧的 `UnityEngine.Random` shim **取消**
（不再是"探一次→炸→剔除"，而是"不需要探"）；随机/墙钟改由 **R1/R2** 注入、按其**自己的目标**实现，
验收 = 同 seed 自复现 + 形状断言 + **人类手测**（`AGENTS.md §1.1`、`docs/runtime/runtime-components-design.md §5/§7`）。
⇒ ⚠️ 反面也要读准：**"没有 golden"不等于"可以不做"** —— 本表凡以"不可比"为由**推迟实现**的条目，一律按这条纠正。
纯展示层的差异（文案空白、色板残留）只有在它会让玩家读到不同的数字时才算分歧。

## S3 现场（oracle 已能宿主上游 Database）

`tools/oracle-cs/Boot.cs`：在无 Unity 进程里把重启**自己编出来的** `Database` 立起来，
供 `Effect.Parse` / `Buff` / `Identifier.GetBuffIdentifier` 这类原本挂在 MonoBehaviour 生命周期上的链路当 golden。
做法只有两步、都不碰原生层：表数据全部交给**上游自己的** `GetCSV/GetEffectDict/GetSkill/GetBuffInfo/GetItemInfo`
（我只把磁盘原文递进去，不做任何字段级理解）；`Singleton<Database>.instance` 的 setter 是 private，反射写。
`MonoBehaviour` 构造在玩家进程外不安全 ⇒ `RuntimeHelpers.GetUninitializedObject` 跳过 ctor。

    dotnet run -- dbprobe          # 四表计数 + 三条真调用
    dotnet run -- tablediag Skills # 逐行调真构造，定位"哪一行抛"
    dotnet run -- tablediag Buffs

实测：`effectDict=113 / skillDict=5340 / buffInfoDict=2121 / itemInfoDict=612`，
与 TS 构建产物逐一对上；`Effect.Parse("(1002{buff=3&2=4&5=6})")` 与 `Buff(1,-1,3).name = 物攻强化` 都走真二进制。

**踩过的坑（务必别退回）**：`Database.instance` 必须在上游三张表装载**之前**反射写进去。
`Skill/BuffInfo.SetEffects` 会经 `Effect.Parse` 回头查 `Database.instance.effectDict`，
instance 为 null 时**每一行**都抛，而上游的 `try/catch` 把整表异常收进 `Hintbox` 弹窗
（进程外 = `SecurityException: ECall methods must be packaged into a system module`），
于是表静默变成「未装载」，只留下一条看不出抛出点的 SecurityException。
这就是「逐行诊断 5340 行全绿、真函数却全灭」的唯一差因。
另外两点架子纪律：`DATA_COL` 是 `public const` ⇒ 反射要 `BindingFlags.Static`；
`Skill.id/name` 是**字段**不是属性（`BuffInfo.id` 才是属性），取错成员会伪装成上游异常。
`CallStatic/Invoke` 一律收**显式 `object[]`**，不能用 `params` —— `string[]` 会被当成整个参数数组（协变），
报出来的假签名不匹配会被误读成「上游行为」。

**`Buff.description` 的接缝已解决**：它经 `GetBuffDescriptionPreview` 回头查 `Pet.GetPetInfo(id)` 与
`Skill.GetSkill(id, false)` 两个静态查表（`Buff.cs:245-269`），oracle 的宿主进程里这两个表都是
Boot.cs 第 5 步补出来的空表 ⇒ `[x:pet]` 在真二进制里**只走兜底分支**「精灵信息错误」。
TS 侧同一口径：`setBuffHost({ petName, skillName, allInfos })`，对拍注入的 `petName` 恒 `null`、
`skillName` 从重启 skills 表查（实测 `[skill]` → 「拍打」）。
**这条口径要在 S6 把宠表接进 oracle 时一起换掉**（⚠️ 那个动作的域侧合同 = **D6 的施工批 B1**，`docs/domain/domain-pet.md §3.4`；本节说的是 `kernel-handoff.md` 的 S6，与 `domain-design.md §4` 的 S6 **不是同一条**），换之前别把 `[x:pet]` 的兜底当成上游行为写进面板。

**下一段的顺序**（按计划的 S3 判据，每块搬完立刻进 `tools/difftest.mjs`）：
`game/core/battle/state.ts`（Unit/UnitPetSystem/BattleState 拷贝构造快照，PVP-Photon 与 hudSystem 围栏）
→ `game/core/battle/phase.ts`（14 阶段）→ 22 个算子按频次逐个
（`add_buff 2984 / set_skill 1741 / powerup 1346 / set_damage 1269 / heal 1027 / remove_buff 772`，
前 6 个占 74.2%），长尾先空实现 + 记 TODO。
`effect.ts`、`buff.ts` 与 `battle/state.ts`（快照层）三块已落地并对拍绿，不再在列。

## S3 第一段已进对拍（effect.ts）

`tools/difftest.mjs` 新增 `kind='effectparse'`：比的是 `Effect.Parse(...)` 之后每条效果的
`GetRawEffectStringArray()` 7 列拼接（词表反查、condOption/abilityOption 的**插入顺序**、
`Format` 的 `{i}` 替身结果一次性全暴露）。素材两条腿：
① `tools/fixtures/effect-dsl.txt` —— 上游表里**真实存在**的 172 条 DSL 引用串，重新生成：
扫 `projects/Seer2-Restart-Lite-main/Assets/Resources/Data/**/*.csv` 取「以数字/负号开头且含 `{`」的平衡括号子串、去重排序；
② 覆盖全 113 个预制体 id 的合成引用（实参 0/1/2/3/5/8 个，实参形状含 `(round:3)`、`a=1&b=2`、空串、空格）
加括号/花括号错配、多引用串联、全角括号、未知 id 等 31 条边界。

当前规模 `向量=2893 可比=2851 不一致=0`，上游 42 条抛错（含 `effectparse` 的 ArgumentException 13 / FormatException 4 / NRE 2）
在 TS 侧**逐条同样抛**。

对拍抓到的第一个真分歧，记下来免得当成 JS 直觉改掉：**`Effect.Format` 的键替换走 LINQ `ToDictionary` ⇒
两个键被同一个实参替成同名是抛 `ArgumentException`，不是后者覆盖前者**（Effect.cs:214-215）。
JS 侧 `new Map([...])` 默认静默合并，是假通过；已用 `collections.ts:toDictionaryStrict` 对上，
并留 `effect.test.ts` 固定用例（合成 1 条 + 真表样本 `(2001{who}{name=添加印记}{value}{buff=3}{who})`）。

## S3 第二段已进对拍（buff-info.ts / buff.ts / buff-refer-data.ts）

新增四个 kind：`buffinfo`（`BuffInfo` 的 CSV 构造 + 七个成员 + `GetRawInfoStringArray` 往返）、
`buffid`（`Buff` 的 9 个 bool 方法、12 个 `ident:` 键、14 个 `type:` 判定、`set:` 写后即读、
`options`/`effects` 整串、其余成员按 `BuffMember` 的属性/字段混取口径）、
`buffdesc`（`GetBuffDescriptionPreview` **整串**比对）、`refer`（`BuffReferData.Parse/ParseDict`）。

当前规模 `向量=27219 可比=26975 不一致=0 架子没对上=0`，oracle 抛错 244 条在 TS 侧逐条同样抛
（新增 `refer → FormatException 187 / ArgumentException 1 / OverflowException 4`）。
单元侧 `node --test game/core/` = **63 通过 / 0 失败**（新增 `buff/buff.test.ts` 13 条、`strutil.test.ts` 6 条）。
一次性提问用 `node tools/ask-oracle.mjs '[{"kind":"refer","str":"1008[10]"}]'`（只读，不产产物）。

**oracle 抓到的第一个真 bug：`BuffReferData` 的括号种类。** 我按 `TrimParenthesesLoop('(',')')` 移植，
而 `Helper.cs:91` 的默认左右括号是 **`[` 与 `]`** —— 表里写的正是 `1008[10]`。
后果不是崩，是**静默降级**：所有 `ref_buff` 的 `[值]` 全读不到，`Buff` 起手 value 一律 0，
`int.Parse("1008[10]")` 那条路还会 FormatException 把整表装载截断。实测口径：

| 引用串 | 上游 | 我原先的写法 |
|---|---|---|
| `1008[10]` | `id=1008, turn=-1, value=10` | 抛 FormatException |
| `3044(2)`（圆括号） | **不是引用** ⇒ `int.Parse` 整串炸 | 当成 value=2 |
| `3044[k:v][w]` | 纯数字段按**位置**取（不看书写序）⇒ `int.Parse("w")` 抛 | — |
| `3044[2][a:b:c]` | value=2、`options[a]=b`（第三段丢） | 一致 |
| `3044[2]/3044[1]` | `ToDictionary` 重复键 ⇒ ArgumentException | 一致 |

顺带两条**边界事实**也是这轮对拍给的，不是读源码读出来的：
`int.Parse("99999999999")` 抛 **OverflowException**（`int.TryParse` 同范围回 false）；
而 `float` 解析**越界不算失败** —— .NET Core 3.0 起 `float.Parse/TryParse("1e40")` 给 `+∞`，
所以 `tryParseFloat` 只挡 NaN，"顺手"加 `isFinite` 会把合法字面量降级成标识符分支
（`strutil.test.ts` 单独锁住这条；`1e39` 也已经是 `+∞`，Single 上界是 `3.4028234663852886e38`）。

印记层里另外几条「只有二进制能给权威答案」的：
`Mathf.Clamp` 必须是 **int** 版（`f(2147483647)=2147483648`，float 版会把 `Buff` 的上界抬高一位），
`buff` 表未写 `min_val` 时下界是 `int.MinValue` 而**不是** `-Infinity`（所以 `value=-9999` 本来就在界内），
`.NET` 数字格式的段数语义 —— `"+#;-#"` 两段时**零走正段**且 `#` 渲染成**空串**，
`GetBuffDescriptionPreview` 最后那轮对 11 个键**无条件** `Replace`（裸 `[pet]` 的实参是 `referenceBuff.value`，
而 `[5:pet]` 里的 `5` 是 **option 键**、取不到就是 `float.MinValue` 强转成 `-2147483648`）。

## S3 第三段已进对拍（battle/state.ts 快照层）

新增 12 个 kind：`statecopy / stateid / stateset / stateflag / giveturn / gofirst / petbag / skillsys /
settings / result / effectq / statedrive`，共 **1482 条向量**。规格表与镜像求值都在 `tools/snap-mirror.mjs`
（它把 oracle 的 `Build*` / `Sig*` / `<Kind>Vector` 逐条对着写了一遍，含每个字段的 C# 初值），
`tools/difftest.mjs` 只负责把向量喂进同一批 golden 与同一套比较器。
比的是定的那一档 —— **拷贝构造 + identifier 读回**：每条向量把整棵状态树搭出来，拍**整状态签名**
（`SigState` 逐字段、float 一律其文本形状），再走拷贝构造 / 真构造 / `mutate 只改副本`（原帧只要动过一个字，
就是某一档深浅拷漏了），最后用 `GetStateIdentifier` / `GetPetSystemIdentifier` / `GetSkillSystemIdentifier`
/ `GetSettingsIdentifier` / `GetResultIdentifier` 把同一批键读回来。

规模 `向量=28701 可比=28307 native不可比=0 架子没对上=0 不一致=0`；oracle 这层新增 150 条抛错
（`petbag → IndexOutOfRange 48 / skillsys → NRE 56 / effectq → NRE 24 / giveturn → ArgumentOutOfRange 7 /
settings → NRE 8 / stateflag → ArgumentOutOfRange 4 / effectq → ArgumentOutOfRange 3`）在 TS 侧**逐条同样抛**。
`node --test game/core/` = **122 通过 / 0 失败**，headless 门禁（本节末）为绿。

**这轮抓到的三个"golden 会骗人"的坑，都不是上游行为：**

| 坑 | 症状 | 真相 |
|---|---|---|
| 反射把 `out` 写回丢在临时数组上 | 80 条 `tryident` golden 全是 `True\|0` / `False\|0` | `Inv` 用 `Select().ToArray()` 换了个新数组递给 `Invoke`，`TryGet*(id, out num)` 的 `num` 永远停在传进去的 `0f`。写回必须落在**调用方那个数组** |
| 镜像自己加了一位 | `addcursor:` 比 `True/False` 不等 | 上游是 `public void AddFightPetCursor(int)`（BattleResult.cs:57），那一位恒为 `null` 的打印 `-`；加没加进去由后面的 `SigResult` 兜住 |
| 拿 C# 的 `Single.ToString` 当语义值比 | 哨兵报成 `-3.4028235E+38` vs `…4663852886e+38` | 前者是**最短可回写的 float** 文本、后者是展宽 double 的最短文本，是表示差。`tryident` 改出成结构化 JSON `{ok,num}`，由比较器两边各自 `fround` 再比 |

一条**只有二进制能量出来**的上游陷阱：`UnitPetSystem.GetParallelPetBag(parallelCount)` 在
`cursor` 落在 `[0, parallelCount)` 之外（但仍在袋长之内）时**不自终止** —— `while` 的终止条件是"绕回 cursor"，
而环形遍历只在 `[0, parallelCount)` 里走，永远碰不到它。实测一条这样的向量：C# 数到数组上限后抛
`OutOfMemoryException: Array dimensions exceeded supported range`，耗时 77 秒、吃 ~2 GB。
移植体 `state.ts:187-200` 是同一个 `for(;;)` ⇒ **行为一致**，所以这一档不进 golden（每跑一次多花 77 秒不值），
向量生成器只发终止的形状；`difftest.mjs` 里保留一条 `OutOfMemoryException → 不可比` 的分类，
它挡的就是"以后谁手滑生成了一条不自终止的向量把闸门挂死"。
相邻的两位也顺手量清了：`cursor < 0` ⇒ `%` 出负下标 ⇒ `IndexOutOfRangeException`；`cursor >= 袋长` ⇒
取 `pet` 那一行就炸，压根进不了循环。
> ⚠️ **2026-10-17 按人类决议 ② 改判**（政策 `docs/arch-docs.md §4.1`）：这一条**从"上游陷阱 = 照抄行为一致"改归"代码逻辑 bug"**
> —— 不自终止的循环是**写错**（终止条件覆盖了永不成立的形状），不是数据错字 ⇒
> **目标行为 = 入口显式抛**（消息带 `cursor` / `parallelCount` / 袋长），与 D1 的 `docs/domain/domain-base.md §5 B11`（`listRandom` 两条挂起路）同族。
> ⬜ **待落码**（阶段一不发码）：`state.ts:187-200` 的 `for(;;)` 改抛 ⇒ 落码后 `difftest.mjs` 的 `OutOfMemoryException` 分类**保留**，
> 但它兜的对象从"上游会挂"变成"我方已经不会挂、只剩回归监控"；oracle 侧那些形状**仍不进 golden**（上游会挂 77 秒，问不出结果）。

**这一层的不可比清单**（都记在围栏里，不是漏）：`Unit.OnTurnStart` / `BattleState.OnTurnStart` 与一切
`RNG` 读数（上游 `Random` 是 Unity native，进程外没有可复现的种子流）、`Unit.IsMyUnit` 与 PVP/Photon
（`PhotonNetwork` 的静态构造在播放器进程外直接 `TypeInitializationException`）、`SetSkill` /
`TakeSkillCost`（`Player.instance`）、`Effect` 的 22 个**算子本体**（判定外壳 `Condition`/`Apply` 与
`DefaultAbility`/`PostProcess` 已于步骤 4 搬入 `effect/effect-judge.ts`，未移植算子在那儿**显式抛**）、hudSystem 与 card、`ProcessResult`（S5）、
`BattleResult.capturePet`、宠物 `buffController.buffs` 与一切 `Skill` 对象（S6）。
> ⚠️ **清单里"不可比"的三种理由今后要分开读**（`docs/engine/oracle-playbook.md §6` 改版块）：
> ① **随机/墙钟**（`RNG` 读数、`ProcessResult` 的 `Random.InitState(DateTime.Now.Ticks)`）⇒ **不再记为缺口**，
>    实现走 **R1/R2**，验收换成同 seed 自复现 + 形状断言 + 人类手测；`Player.instance` 那一支的存档面接缝是 **R3**（`random[old]/[new]`）。
> ② **Photon ECall 的单向闸门**（`IsMyUnit`、PVP）⇒ 照旧（本仓库**围栏排除**里已写死 PVP 不做）。
> ③ **纯"还没搬"**（22 个算子本体、`Skill` 对象、`buffController.buffs`）⇒ 那是**施工批次**的进度，不是可比性问题，别混进这张清单当理由。

## S3 第三段的架子改动（决定下一段怎么加向量）

- `Inv` 的 coercion 写回**调用方数组** ⇒ `difftest` 的 infra 判定改看 `g.infra === true`
  （原来是比 `errType === 'MissingMethodException'`，异常一被包一层就漏判）。
- 新增 `NumOut(ok, num)`：`TryGet*` 这类"布尔 + out float"的结果出成 `{ok,num}` 结构化 JSON。
- `mine()` 的 `default` 委派 `SNAP_KINDS → mineSnap(v)`（快照层的镜像与生成器都在
  `tools/snap-mirror.mjs`，`difftest.mjs` 只 `push` 向量）。
- `OutOfMemoryException` 在 `mine(v)` **之前**归入 `native不可比` —— 顺序错了闸门直接挂死。
- 分歧报告改成「按族汇总 + 每族前 3 条只打两边值」：一条快照向量动辄几 KB，
  整条打出来会把分歧本身淹掉（要整条按 `#i` 回查生成点）。

## S3 第五段·判定外壳（步骤 4）的坑与刻意偏离

`Effect.cs:224-343`（`Condition`/`Apply`）+ `EffectConditionHandler.cs`（四个前置检查 + 六个判定族）+
`EffectAbilityHandler.cs:13`（`DefaultAbility`）搬进 `game/core/effect/effect-judge.ts`。新 kind `effectcond`/`effectapply`
与补回的 8 条 `target`（fromDefault）都在 `tools/snap-mirror.mjs` 生成、进对拍。几条要登记的东西：

- **刻意偏离**：上游未移植算子（`Heal`/`SetDamage`/… 二十一支）落进 `DefaultAbility` 前先在 `Apply` 的 switch 里列出，
  而 `DefaultAbility` 是**完整可跑、静默 `true`** 的一条（`EffectAbilityHandler.cs:13-36`）。移植体对未移植算子
  **显式抛 `NOT_PORTED`** —— 与全仓接缝纪律一致（"没接"必须比对拍可见，静默 true 会把缺口伪装成"这条恒成立"）。
  这也是 Condition 与 Apply 必须**同一增量**落地的原因：只换 Condition 会让现有 `phasedrive` 那批 throw-only 向量**改抛点翻红**。
- **注入纪律**：生产 `JUDGE`（`battle/effect-handler.ts`）继续 `NOT_PORTED`；真判定只在 harness 里**按 kind 作用域**注入
  （`withJudge` 的 `try/finally`），`phaseq`/`phasedrive`/`effectq`/`giveturn`/`gofirst` 五个既有族因此一字不变
  （**这条到第六段·批一为止**：`phasedrive` 改用**逐向量 `judge:true`** 门，见下一节）。
- **两条 native RNG 面**（都在生成阶段挡掉，绝不拿装出来的值当 golden）：
  (1) `Player.random` 的 getter 解引用空 petBag → NRE，`RandomNumber` 首行无条件读它（`EffectConditionHandler.cs:92`）
      ⇒ 带任一 random 键的向量不可比，oracle 的 `EffectCondVector`/`EffectApplyVector` 也不再签 `rnd`；
  (2) 裸 `random`/`me.random` 标识符叶 → `UnityEngine.Random.Range(int,int)` 是 native ECall → oracle 抛 `SecurityException`。
- **`on_fail` 后置块永久改写共享 Effect**（`Effect.cs:275-290`）：`target`/`ability`/`abilityOptionDict` 被预制体覆盖，
  且 `Remove("on_fail")` 是永久的 —— 对拍签名比的是**跑完之后**那条 Effect 的形状，单测锁"改写在共享对象上 + on_fail 被抹"。
- **相位门早于 `this.invokeUnit = invokeUnit`**（`Effect.cs:226` vs `:232`）：`checkPhase && !isCorrectPhase` 直接 return，
  这条向量的 `invokeUnit` 没被写。`checkTurn` 把 correctList 过滤空也是**提前** return false，**不触发 on_fail**。

## S3 第六段·算子本体批一（6 支）的坑与刻意偏离

`EffectAbilityHandler.cs` 的 `set_damage(:1235)` / `add_status(:627)` / `add_buff(:737)` /
`remove_buff(:865)` / `powerup(:474)` / `heal(:165)` 搬进 `game/core/effect/ops-{basic,buff,powerup,heal}.ts`，
`phasedrive` 的 throw-only 向量同步升级成真状态签名。**每支算子的逐条 quirk 写在各文件头部**（那里最贴近代码），
这一节只登记跨文件、跨轮次的结论。

- **oracle 白名单是防假绿的唯一结构**：`Program.cs:1849` `PortedAbilities = {0, 8, 14, 10, 11, 5, 3, 4, 15, 1, 2, 17, 9}`，
  只在 `EffectApplyVector`（`:1855` 的 `PortedAbilities.Contains`）里查，越界照旧抛 `MissingMemberException` ⇒ 归 `架子没对上`。
  **`PhaseDriveVector` 不查它**（驱动向量走真 `DoWork`，抛的是上游自己的异常）。以后搬一支算子必须**两边同时**
  加 id：只加 TS 会让该算子的 `effectapply` 向量落在 infra 列（看得见，不会假绿）；只加 oracle 会反过来翻红。
- **`powerup(7)` 故意不进白名单** —— 上游 `Powerup` **方法入口**就 `SecurityException: ECall methods…`，
  oracle 永久不可比。函数体照搬 + `node --test` 锁形状，值不进 golden。这是一条新类别：
  **搬了但进不了对拍**（既不是围栏也不是没搬），文档里别把它写成"待搬"。
  ⚠️ 2026-10-17 决议 ① 后这条**读法**固定为：进不了的是**golden**，不是**实现** —— "永久不可比"**不再**是验收缺口，
  它的验收 = 同 seed 自复现 + 形状断言 + 人类手测（详见 `docs/engine/oracle-playbook.md §6` 改版块）。
- **印记候选白名单**（防"触发递归踩到未移植算子 ⇒ oracle 真跑、TS 抛"）：`buffs.json` 2121 行里取
  `on_add_buff(-3) / on_remove_buff(-4) / all(-999)` 三个时机的效果，要求算子 ⊆ `PortedAbilities`。
  实测 **白名单 `{0,8,14,10,11}` ⇒ 1904 安全 / 217 脏**；加 `heal(5)` ⇒ **1954 / 167**。
  `on_effect(-10)` 算不算进扫描集**不影响这两个数字**（全表只有 6 行挂它：`93/1020/2102/3668/100993/200471`，
  算子全是 baked `abilityId=0`）。复算：`node tools/buff-whitelist.mjs`（口径与脏分布见 playbook §7A）。
- **签名是双方约定，不是上游语义**：`SigPet` 本轮扩的 `bf[…]` 段按 `buffController.buffs` 的**插入序**打
  （上游是 `List` ⇒ 天然同序），**没有引入任何排序**；`st=…` 四段固定 `init/add/mult/hidden` 顺序、
  `pw=…` 就是六维数组原序。以后若为某个 `Dictionary` 引入排序，必须回来在这里登记一条。
- **上游 quirk 一律照抄，别顺手"修正"**（详见各文件头部）：
  `set_damage` 的键名是 `state` 不是 `target_state`，且 `who=="me"` 支读的是**参数 `state`**（`:1251`）；
  `MultInitStatus` **忽略 type 参数、整表乘**；`powerup` 的自定义 pdf 循环上界是 `i < 5` ⇒ **第六维 hit 永不清零**，
  且 `opCopy=="reverse"` 用的是**循环里最后一只 target 攒下的 status**；
  `add_buff` 的 `:854` 是 `isSuccess = true`（**不是 `|=`**）而 `:846/:859` 是 `|=`（两边都要求值，JS 的 `||` 会短路掉
  后面那次 `AddBuff`），`:859` 传给控制器的 buffUnit 实参是 **`lhsUnit`** ⇒ 多目标时触发链里的 `me.` 指向发起方；
  `remove_buff` 的 `:965` 是 **XOR**（两边都需求值，别让 `&&`/`||` 短路），`:941/:953-957` 保护印记命中时
  **同时从 `idPowerResult` 摘掉**；`heal` 的 `:288` `healAdd` 只在 `heal > 0` 时打 `rec/100` 折（**负治疗不打折**）。
- **`GetEffectIdentifier` 两支的括号字符不是一套**（`Effect.cs:398` vs `:412`）：`timing(...)` 显式给圆括号，
  `ability[...]` 走 `Helper.cs:85` 的缺省方括号 ⇒ `ability(rage)` 剥不动、直接 `return 0`。写成圆括号会让整族判定反过来。
- **`target_type` 是 abilityOption，不是 effect option**（`Effect.cs:20-21`，按 `_` 切、缺省 `none`）；
  且它在 `remove_buff` 里是**哑键**（那支不走 target 列表，只按 `who` 换 unit）。
- **`buff-controller` 两处 `state!=null` 围栏解除**（步骤 2）：`AddBuff` 的 copyHandle 六支 +
  `RemoveBuff` 的「**先 `OnRemoveBuff` 触发、后 `buffs.Remove`**」（顺序敏感）。
  递归口子是**注入的 `TRIGGER` 回调**（照 `setEffectJudgement` 那条接缝），不是 `effect-judge ↔ buff-controller`
  的模块循环 import。抗性支（`:164-183` 的 `Random.Range(0,100)`）**保持 `RESIST_RNG===null ⇒ 抛`**，
  对拍向量一律构造到「袋里不带 `-2005`」⇒ 不进那次掷骰。
- **native RNG 挡点清单**（全部在**生成阶段**挡，函数体照搬、掷骰走默认抛的接缝、形状由 `node --test` 锁）：
  `add_buff` 的非空 `unique[…]`/`random[…]` 候选（`:795/:807`）与抗性掷骰；`remove_buff` 的
  `random_count ∈ [0, 候选数]`（`:909`，缺省 `-1 ⇒ int.MaxValue` 靠 `ListHelper.Random` **掷骰前短路**才可比）；
  `powerup` 的两条 `random_pdf`（`:546/:561`，uniform 只在 `count > 非零维数` 时发）；
  以及一切表达式里的 `random` / `me.random` 叶。
  > ⚠️ **本清单是 as-built（已落批次的向量口径）**。按人类决议 ①（2026-10-17）**今后不再"挡"，改为换手段验收**：
  > 这些掷骰支**照常实现**，随机来自 **R1**（现缝 `RESIST_RNG`/`setBuffResistRng`/`setBuffRemoveRng`/`setOps*Rng`
  > 随运行时线 **RB1** 九合一，`docs/runtime/runtime-components-design.md §3.1/§5 R1/§8.2`）；
  > 向量改发**显式声明来源的合成形状**，断言 = 同 seed 复现 + 区间端点可达 + 人类手测（`AGENTS.md §1.1`）。
  > ⇒ 唯一仍然成立的"可比"判据是 `ListHelper.Random` 那条**托管**链（掷骰前短路 ⇒ 本来就可比，见上）；
  >   它与"要不要启 Unity"无关，别跟着这条一起改口径。
- **TurnEnd 的 hud→Photon 闸门**（本轮新事实，`snap-mirror.mjs` 的 22 条 `phasedrive(judge:true)` 就是照它造的）：
  `TurnEndPhase.cs:98-99` → `UnitHudSystem.OnTurnEnd` → `Unit.IsMyUnit()` 先读 `PhotonNetwork.IsConnected`
  ⇒ 无头 oracle `TypeInitializationException`。**进入谓词实测是「任一 unit 的 `totalBuffHeal − totalBuffDamage ≠ 0`」**
  （`UnitSkillSystem.cs:40/44` 计 `buff/buff_per/buff_fix/buff_percentage_unhealthy`）。于是 17 号时机的效果必须
  **账本中性**或给**同 unit 上净额为 0 的 damage+heal 成对**（2023 value=4 配 2024 value=25）；
  18 号（`OnAfterTurnEnd`）在 hud 之后跑 ⇒ 不受限；`AfterAttackPhase` 根本没有 hud 调用 ⇒ 是富矿。
  **移植体不建模这个抛**（hud 是表现层，生产代码不该因测试架子而抛）⇒ 这是一条"oracle 不可比、TS 照常跑"的单向闸门。
  反例：**2016「吸取体力」看着成对却不平衡**（伤害落 op、治疗落 self ⇒ 逐 unit 净额 ≠ 0），向量已剪除。
- **drive 的技能 stub 两边只认 `id`/`type`**：oracle `BuildSkillSystem`（`Program.cs:906-918`）忽略 power/accuracy，
  镜像 `blankSkill` 全字段吃 ⇒ 多传的字段会在 `sk=` 列翻红。规格里只给 `{ id: 5001, type: 1 }`。
- **孤儿帧 phase 写**（本轮由驱动向量抓到的**移植体真 bug**，不是上游形状）：TS 里 `const st = this.state`
  跨过 `this.state = BattleState.from(…)` 换帧后再写 `st.phase`，写进的是**旧帧**；C# 每次 `state.Phase = …`
  都是**现取字段**。`phase.ts:799`（`TurnEndPhase.doWork`）已改现取，`phase.test.ts` 锁一条
  （顺带坐实：`battle.currentState` 全程不被 phase 碰，它停在 `BattleState` 构造的 `OnBattleStart`）。
- **throw-only 向量的证据资格**：「两边同抛」只有 TS 因**上游同一条原因**抛才算证据。
  本轮 X4(976) / X10(968) 是 oracle 上游 NRE vs TS `NOT_PORTED: random[old]` ⇒ **不同类**，剪除。
  既有未打标的 throw-only 向量（含 `parallelApplyOOM` 那条 77 秒/OOM 护栏）**一条没删、抛点没变**（oracle 抛错 489 条不变）。
- **长尾 14 支的 TODO（用户口径：空实现 + 记档，别顺手搬）**：`win / escape / capture / pet_change / rage /
  block_buff / copy_buff / set_buff / set_pet / set_weather / set_player / poker / set_pet_bag / card`
  —— 全部保持 `notPorted` 显式抛。**下一支该动的是 `set_skill`（真表 869 行，批二）**，它的前置是
  `Skill.SetSkillIdentifier`（围栏）+ `GetEscapeSkill/GetRandomSkill/GetPetChangeSkillWithTiming` 三个工厂，
  且五条支路真运行时都掷 native 骰；`sk=` 四列签名第六段已扩好，批二无需再扩签。
  > **注（见下一节·第七段 / 第八段）**：`capture` / `pet_change` 已在批三、A 档四支（`win`/`escape`/`set_weather`/
  > `block_buff`）已在批四被用户**特意反转、搬进 golden**；本条 TODO 对其余 **8 支**仍成立
  > （`rage`/`copy_buff`/`set_buff`/`set_pet`/`set_player`/`poker`/`set_pet_bag`/`card`）。
- **本段收口基线**（seed=7）：`向量=30308 可比=29819 native不可比=0 架子没对上=0 不一致=0`；
  `pass 265`；37 个 `.ts → .js`。步进：`30090/29613`（步骤 0，只扩签 ⇒ 条数不变）→ `30136/29655`（步骤 1）→
  不变（步骤 2）→ `30229/29740`（步骤 3）→ 不发向量（步骤 4）→ `30286/29797`（步骤 5）→ `30308/29819`（步骤 6）。

## S3 第七段·算子本体批三（capture 3 + pet_change 4）的坑与刻意偏离

`EffectAbilityHandler.cs` 的 `Capture(:66-106)` / `PetChange(:108-163)` 搬进
`game/core/effect/ops-capture.ts` / `ops-pet.ts`，`effect-judge.ts` 的 `notPorted('算子 Capture'/'算子 PetChange')`
两 case 换成真调用；oracle `PortedAbilities` 加 `3`、`4`（`Program.cs`，当段行号 `:1756`；现 `:1838`）；`snap-mirror.mjs` EA 生成区发对应形状。
**这一段的口径与第六段相反** —— 用户明确选了「真·内核移植捕捉+换宠」，**特意反转**上一节的「长尾不搬」纪律，
把这两支从围栏里拉出来进 golden（详见 kernel-handoff §5c/§8）。

- **capture 的可比面 = 三条 RNG-free 支，比 powerup 大**：① `state==null`→`false`（`:68`）；② `prob`
  `float.TryParse` 失败→`false`（`:72`，先于解引用 `invokeUnit`）；③ **`baseId==10` 自动捕捉**（`:95` 的
  `||` **左侧短路 ⇒ 不吃 `Unit.RNG()`**，走完 `capture_result` / `phase=OnBattleEnd` / `result.state=CaptureSuccess`
  / `isDone` / `actionCursor` 全突变 ⇒ `sigState` 可比）。**`baseId≠10` 的掷点支**走
  `Unit.RNG()`→`UnityEngine.Random.Range(0,100)` native ⇒ **生成阶段不发向量**（与 powerup 同族，但 capture 多这三条可比支）。
  与 `Powerup`「方法入口即抛、永久不可比」的**关键区别**：`Capture` 的 native 调用在**一帧托管调用之下**
  （`Unit.RNG` 而非方法体直接 `call Random.Range`），所以短路支与守卫支根本不经 native。
- **captureValue 的 `value<100` 闸在 buff(-2) 与血线乘子之外**（`damage.ts` 里 `captureValue`）：
  即 `prob=100` **既不吃 debuff ÷3 也不吃残血 ×0.25/1/1.5/2** ⇒ 表里写 100 就 `value=100 ≥ roll[0,100]` 必抓。
  血线分档用 `lostPercent = f(1 − f(f(hp×1)/maxHp))`，逐点 `f()` 收窄（float 链，照 R4 口径）。
- **pet_change 的可比面**：三条前置守卫（`state==null` / `target_index<0`→`false`(:126) /
  `target=="random" && randomIndexList.Count==0`→`false`(:122)）+ **整条换场成功支**：
  `petSystem.cursor = targetIndex`、`anger = FloorToInt(f(f(anger×(getBuff(63)??80)/100)×(getBuff(64)??100)/100))`
  两步 f 收窄、`RefreshStayTurn`、`removeRangeBuff(!keep)` / `addRangeBuff(inherit|legacy)`（**`addRangeBuff`
  第六段·批一步骤 2 已搬** ⇒ 不再撞围栏）、`if unit==myUnit: result.addFightPetCursor(targetIndex)`、两次 `applyBuffs`
  全进 `sigState`。**`target=="random"` 且袋里有备选** → `ListHelper.Random` native ⇒ 不发向量。
- **oracle 早就能观测多宠态**：`BuildState` 收 `petBag` 数组（`Program.cs:843`）+ `cursor`（`:858`）+ `isDone`（`:928`）；
  `SigPetSys` 已签 `cur={cursor}|bag[…]`（`:1044`）、`SigUnit` 已签 `done={isDone}`（`:1074`）、`SigResult` 含
  `fightPetCursors`（`:995`）⇒ capture 的 `isDone/actionCursor` 与 pet_change 的 `cursor/addFightPetCursor` 大多已可比，
  Phase-0 只需确认 `result.state` / `capture_result` 已进签（缺则步骤 0 单独一轮逐字符扩签，确认旧 30308 取默认值等价）。
- **等级门槛捕捉条件仍 NOT_PORTED（本轮新发现，写死别踩）**：`items.json` 里 `conditionRaw:"pet" type:"level"`
  的胶囊（10001/10002）经 `checkAndApply` 会在 `petCondition`→`getPetIdentifier('level')` 抛
  `NOT_PORTED: Pet.GetPetIdentifier "level"`（要真 `petInfoDict`/`Pet` 组件，属 §8 宠表围栏 ⇒ **逐臂清单与分批口径见 `docs/domain/domain-pet.md §2.3`**）。
  驱动 `doCapture` 捕获后**诚实拒绝、不消耗胶囊、不判捕捉**（`tools/rbattle-capture-test.mjs` 场景2 锁死）。
  ⇒ 浏览器里只有**无门槛胶囊（10003/10004/10005）**能跑真·内核算子。
- **`ProcessResult` / `BattleResult.capturePet` 保持围栏**：内核 `Capture` 只落 `result.state=CaptureSuccess` 结束战斗，
  「按 `settings.captureLevel` 造被捕获 Pet 对象」是上游 ProcessResult（S5/S6）的活 ⇒ 场景里 `RST.makeRestartPet + addPet`
  落进 v3 队伍是 **save-side 副作用**（对齐官方 `phases/capture.js`），标 `_authority.capture='kernel-capture+save-side'`，
  **不谎称进 golden**。
- **胶囊效果行只在 `items.json` 内嵌**（`PrefabRow` 形：`abilityId:3` + `options.prob` + `condOptions`），
  **不在 `effects.json` prefab 表**（表 id 10001 是 `card` abilityId:21）⇒ 构造用 `effectFromRow(itemRow)`，不是 `Effect.getEffect`。
- **本段收口基线**（seed=7）：`向量=30316 可比=29827 native不可比=0 架子没对上=0 不一致=0 分歧族:{}`
  （批三 +8 条：capture +3 / pet_change +5，既有向量一条不翻红）；`node --test game/core/` `pass 272`（265 +capture 3 +pet_change 4）；
  `build-core` 39 个 `.js`；headless 门禁空。端到端：`rbattle-capture-test 18/18`、`rbattle-switch-test 12/12`，
  `selftest 14 / encounter 14 / hud 12 / restart-save 21 / stage 23` 全绿（v2/AS3 线逐字节不变）。

## S3 第八段·算子本体批四（A 档 4 支 + 控制器 9 方法 + `SigPet` 扩 5 段）的坑与刻意偏离

`EffectAbilityHandler.cs` 的 `Win(:38-53)` / `Escape(:54-65)` / `SetWeather(:1969-1983)` 搬进新建
`game/core/effect/ops-state.ts`；`BlockOrCopyBuff(:678-736)` 搬进新建 `game/core/effect/ops-block.ts`
（带本地 `removeFirst` 助手）；`PetBattleBuffController.cs:323-388` 的 **9 个方法**补进
`game/core/pet/buff-controller.ts:145-167`（+ 模块级 `removeRange` 助手）；`effect-judge.ts#applyAbility`
的 `Win`/`Escape`/`BlockBuff`/`SetWeather` 四臂换成真调用；oracle `PortedAbilities` 加 `1, 2, 17, 9`
（现值 `Program.cs:1849` = `{0,8,14,10,11,5,3,4,15,1,2,17,9}`）。

- **⚠️ 本段踩到的最大一条：`win`/`escape` 的「零 native」判断是错的 —— 它们是「半可比」**。
  两支的**结果面**过 `Unit.IsMyUnit()`（`Unit.cs:115-118`），它读 `PhotonNetwork.IsConnected`，
  而 Photon 的**静态构造**在无头宿主里必抛：
  `TypeInitializationException → SecurityException: ECall methods must be packaged into a system module`
  （`at Photon.Pun.PhotonNetwork.StaticReset() / .cctor()`）。**不是缺程序集**（那是加载期 `FileNotFoundException`），
  是**运行期 ECall 不可用** —— 与 `powerup(7)`（`:561` `UnityEngine.Random.Range`）**同根因**。
  ⇒ 按 `oracle-playbook.md §6` 的**单向闸门**口径「**根本不生成**那些向量」。首跑 difftest 因此得 `不一致=6`，
  删掉 6 条（4×win + 2×escape）后回绿 —— 这条**不是回归**，别下次又"顺手补回来"。
  ⇒ golden 只剩 3 条：`state==null ⇒ false`（`:41`/`:57`）与 `whosTurn==0 ⇒ atkUnit==null ⇒ NRE`（`:60`，
  **在进 `IsMyUnit` 之前**抛，两端同抛）；**结果面只能靠单测**（`effect-judge.test.ts` 末尾 +4 条，用真 `Unit`
  ⇒ `isMyUnit` 是真方法，离线退化 = `isMasterUnit`，`state.ts:343`，生产路径读的正是这个值）。
  （真正修法见 kernel-handoff §5d 的处置：**不去 stub Photon** —— 那会动到 `AssemblyLoadContext.Resolving`，
  且 Photon 的表面积远大于 `IsConnected`/`IsMasterClient` 两个成员。）
- **`set_weather` 反而全可比，而且 `int.TryParse` 的次序是承重的**：`:1973` 的 `int.TryParse`（**字面**，
  不认表达式/标识符/小数点）**早于** `:1976` 的两处 `IsBuffTypeBlocked(BuffType.Weather)`，也早于解引用 `state`
  ⇒ `weather='abc'` + `state==null` 是**干净 false**（golden 一条）；而 `weather='3'` + `state==null` 在
  `state.masterUnit` 上 NRE（golden 又一条，两端同抛）。两侧判定是 **`||`**（任一侧挂 weather 型印记即拒）。
  ⚠️ **不判 `state == null`**（与 `win`/`escape` 相反 —— 这就是 E4 不变量 A3）。
- **`block_buff` 的「九个方法」必须先补到位，且五张私有表必须先上签名**：该支只改
  `blockBuffIds / blockBuffTypes / copyBuffIds / copyBuffTypes / blockBuffSps`，原来**一个都不在签名上**
  ⇒ 光靠 `apply=True` 会拿到一堆**假绿向量**。所以本轮**同时**扩了 `tools/snap-mirror.mjs` 的 `sigPet`
  与 oracle 的 `SigPet` 五段 `|B[..]|BT[..]|C[..]|CT[..]|S<..>`（`Ints()` 走 `Convert.ToInt32`，因为
  `BuffType` 是**枚举**，`string.Join` 会打名字；`Sps()` 走 `IDictionary<string,int>` 保**插入序**），
  并给两边 pet 构造各加四个**铺垫键** `blockTypes` / `sps` / `copyIds` / `copyTypes`（都走**真方法**
  `BlockBuffWithType`/`BlockBuffWithString`/`CopyBuff`/`CopyBuffWithType`，与 oracle 逐条同序）——
  否则 `unblockBuffWithType`/`unblockBuffWithString`/`uncopyBuff`/`uncopyBuffWithType` **没有起点可摘**。
- **`RemoveRange(this IList<T> lhs, IList<T> rhs)` 不是集合差**（`HelperCollections.cs:192-196`）：
  它是对 `rhs` **逐项 `lhs.Remove(item)`**，而 `List.Remove` **只删首个匹配**、摘不到**不报错**。
  ⇒ `- id_list='1/1'` 对 `[1,1,2]` 摘两个 1；`- id_list='9'` 静默不变。**Power 族展开同理**：
  `typeBlockList.Remove(Power)` 只摘一个 ⇒ 传 `['powerup','powerup']` 时**只有一处**展开成 id、另一处仍留在 type 表里。
- **`Power` 族的三型先「移出 type 表」再「展开进 id 表」**（`:722-730`）：`Power(-2)` → powerup ∪ powerdown
  全集；`Powerup(-3)` → 只展开 powerup ids；`Powerdown(-4)` → 只展开 powerdown ids。
  ⚠️ **词表里的原始串是 `'powerup'` / `'powerup.pos'` / `'powerup.neg'`**（`BuffDatabase.cs:8-33`），
  **`Powerdown` 的串是 `'powerup.neg'` 而不是 `'powerdown.neg'`** —— 查不到一律**静默兜 `None(0)`**（词表兜底不抛）。
  这条被 difftest 当场咬出来（期望 `BT[]` 实得 `BT[0]`），已写进 E4 §7 #15。
- **一加一减不对称**：`BlockBuffWithString` 的 switch **只有 default** ⇒ 任何**非空**串都 `+1`
  （默认 `sp_list="none"` 于是 `none=1` 也照落）；`UnblockBuffWithString` **只有 `case "op"`、没有 default**
  ⇒ 别的串什么都不做。而 `spFunc` 只在 `op` 为 `+`/`-` 时非空 ⇒ **`*`/`/` 完全不碰 `blockBuffSps`**
  （字形上极易以为"五个键都参与四个动作"）。
- **未认的 `op` ⇒ 三个函数都是空动作，但仍 `return true`**（`:700`/`:710`/`:718`）—— 不是 `false`。
- **`id_list` 走 `ToIntList('/')` ⇒ 非数字 token 会落 `Identifier.GetNumIdentifier`，解析失败整表 `null`**
  ⇒ 后续 `AddRange(null)` NRE。这条**故意不发向量**（那是我喂错数据，不是上游证据）。
- **本段收口基线**（seed=7）：`向量=30431 可比=29935 native不可比=0 架子没对上=0 不一致=0 分歧族:{}`
  （批四 +35 条：win/escape 3 + set_weather 8 + block_buff 24，既有向量一条不翻红）；
  `node --test game/core/` `pass 304`；`build-core` 42 个 `.js`；headless 门禁空。

## core 的 headless 门禁（口径写死，别再拿裸 grep 自欺）

注释里出现 `UnityEngine` / `Player.instance` 是**必要的**（说明这里替代的是谁），
所以裸 `grep -rE` 永远不为空。可执行代码的判定是：

```
grep -rnE 'UnityEngine|Player\.instance|Photon|Database\.instance' game/core --include='*.ts' \
  | grep -v '\.test\.ts' | grep -vE ':[0-9]+: *(//|/\*|\*)'      # 输出为空 = 绿
```

S3 第三段收口（`battle/state.ts` 落地）时这条是绿的；`phase/*.ts` 落地后要再重跑一遍 ——
那两个文件正是上游 `Player.instance` / `BattleState` 最密的地方，接缝漏一个就会在这里露头。
