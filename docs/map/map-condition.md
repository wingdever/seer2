# 地图线 · M3 —— 条件 DSL（map-condition.md）

> **定位**：本份写**`<condition>` 怎么从一串中文/英文文本变成一个布尔**。它是 M2 §2.4 里"四步调度"的**第二步**，
> 也是整条地图线**被引用最多的一节**：**2,023 个 `<condition>` 元素 / 2,160 条子条件**、
> **14 个命名空间前缀**、**6 个比较算子**、**14 个算术算子**、**51% 的按钮根本没有条件（= 恒真）**。
> 父文档 §2.6 给的是**形状表**；本份给的是**逐臂语义 + 实测定量 + 空状态约定 + 我们的目标契约（`MapEnv`，MQ3）**。
>
> **父文档** = `docs/map/map-design.md`（边界 / **MP1–MP8** / **MC1–MC8** / **MQ1–MQ8 决议表**）—— 本份**只细化不重复**；
> 冲突以本份为准（更细 ⇒ `docs/arch-docs.md §3`）。
> **同线兄弟**：**M1** `docs/map/map-data.md`（数据形状与桥）· **M2** `docs/map/map-npc.md`（谁调用条件、条件之后跑什么）·
> **M4** `docs/map/map-dialog.md`（对话分支**也**用同一套条件）· **M5** `docs/map/map-teleport.md` ·
> **M6** `docs/map/map-battle-trigger.md`（**胜负链也用同一套条件**）· **M7** `docs/map/map-move.md`。
>
> **真值源**：`Scene Specific/Map/Entities/Npc/NpcConditionHandler.cs`（**145**）· `NpcHandler.cs:47-69`（装配层）·
> `System/Parser/Operator.cs`（163）· `System/Parser/Identifier.cs`（**548**，本份只取**地图用到的那几臂**）·
> `System/Parser/Parser.cs`（198，取 `ParseOperation`）· `System/Player.cs:31-34`（`random` 属性）·
> `MVC/Model/Basic/Activity/Activity.cs`（`Find` / `GetData`）· `MVC/Model/Basic/Mission/Mission.cs:73-80` ·
> `MVC/Model/Basic/Pet/Pet.cs:253-441`（`firstPet.<键>` 的合法键集）· `Scene Specific/Battle/BattleState.cs:80-118`（`battle.<键>`）·
> `Helper/Helper.cs:59-88 / 220-244`（`TrimParentheses` / `ToIntRange`）· `Resources/Data/Maps/*.xml`（272 张）【样本】·
> `Resources/Data/Activities/info.csv`（135 行）【样本】。
>
> **邻线（只借不抄）**：`pet.<键>` / `buff.<键>` 的**域语义** = **D6** `docs/domain/domain-pet.md`、**D4** `docs/domain/domain-buff.md`
> （本份**只列"条件能读到哪些键"**，不定义键怎么算）；求值面总表 = **D0** `docs/domain/domain-design.md §4`；
> `random` 与 `date.` 两条**外部能力** = **R1/R2** `docs/runtime/runtime-components-design.md`；
> 会话键袋（`sceneData`）的**宿主** = 编排线 `docs/orchestration/orchestration-design.md`。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **CSI1–CSI**（不变量/契约）/ **CSC1–CSC**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**；
> ⚠️ **不占**父文档 `MC` 号，引用须带文档名）/ **CSQ1–CSQ**（待拍板，附建议）—— **全是本线局部编号**，
> **不是**「人类决议 ①–⑧」（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design）· ✅ **CSQ4 已由人类 2026-10-18 拍板**（键值袋 = **复用存档的 `<activityStorage>`**，见 §7.2 与 §2.1 表后注）⇒ 本份**无待拍板项**。
> ✅ **已落码（2026-10-18，施工批 MB3）**：`game/core/map/condition.ts`（L0）+ `game/logic/map/condition-host.js`（L1）
> —— **as-built / 偏差 / 改判表**见 `docs/map/map-impl.md §7.3.4`；⚠️ 其中 **`CSC8` 的目标已按数据订正**（见该行 ★ 标记），
> 以及 **A11 `player.` 两键按 §3.4 实现为真读**（与 §3.2 的 `A9–A12` 合并行有出入，取更细者）。
> ⚠️ **可玩面**：条件门要**点 NPC** 才响，而"点 NPC"在 **MB4（动作）+ MB5（接线）** ⇒ 本批**今天没有可玩面**。

---

## 0. 这份文档回答什么

1. **条件的真实份量与形状**（§2.1）—— 272 张图里 2,023 个元素 / 2,160 条子条件的**逐命名空间、逐算子**分布，以及**统计方法**（可复述）。
2. **装配层**（§2.2）—— `<condition>` 元素之间 **AND**、串内 `|` **OR**、**无条件 = 恒真**；以及**闭包链**为什么写成那样。
3. **切分层**（§2.3）—— 6 算子 + **最左最先**（MC1）、`NOT` 的**无空格写法**、`Split(':')` 的第二个用途（过滤式）。
4. **14 臂逐条语义**（§2.4，本份最长）—— 每臂给：源码行 / 取值面 / **数据里实际用到的键与频次** / **空值与抛点** / 我们的目标读法。
5. **同一个前缀写了两遍**（§2.5 = 本份第一号结构发现）—— `NpcConditionHandler` 与 `Identifier.GetIdentifier` **各自实现一份命名空间分派**，
   而且**文法不同**（`random` 一臂最明显：显式臂只认 `a~b`，兜底臂认 `a|b~c` 池）。
6. **表达式层**（§2.6）—— `ParseOperation` 的 14 个算术算子、**从左到右无优先级**、未知算子 ⇒ **0**。
7. **`data.` 键袋的全景**（§2.7）—— 13 个具名键 + XML 可任意注入 + **谁写谁读**。
8. **`firstPet.` / `battle.` 能读到哪些键**（§2.8 / §2.9）—— 含 `baseId[N]` **不是"等于 N"而是"在 N 的进化链上"** 这条易误读。
9. **条件求值的副作用**（§2.10 = 本份第二号发现）—— `random` 写会话态、**`Activity.Find` 写存档**。
10. **目标契约**（§3）—— `core/map/condition.ts` 的**纯函数**形状 + **`MapEnv` 注入面**（MQ3）+ **空状态三值约定**。

---

## 1. 范围与边界

| 圈里（本份） | 圈外 → 归谁 |
|---|---|
| `<condition>` 串的**文法**（切分、算子、命名空间、值文法） | 按钮对象、动作 `param` 形状、`auto` 时机 ⇒ **M2** |
| **14 臂的"读哪个状态"** + 空状态约定 | 状态**本身怎么算**（`pet.level` / `buff[..].stack`）⇒ **D6 / D4 / E 线** |
| `MapEnv` 的**接口轮廓**（MQ3） | 装配点与生命周期 ⇒ 编排线 + 运行时线 **R3/R7** |
| `random` / `data.` 两条**副作用**的改判 | RNG **算法**本身 ⇒ 运行时线 **R1**（决议 ①：不逐值一致） |
| 表达式层（14 算术算子）的**地图侧切片** | 战斗侧的 `ParseEffectOperation`（带 `Effect`/`Unit`）⇒ **E4/E5**，本份**不重复** |
| 条件的**求值时机**（进图 `auto` 批 / 点击时 / 战斗胜负链里） | 时机属于宿主 ⇒ **M2 §2.5**、**M6**、**编排线** |

⚠️ **一条边界要提前钉**（**CSQ4** 的根源）：`activity` 是**最大的一族**（1,035 / 2,160 = **48%**），
而活动按 `docs/architecture.md §1.1` **A 组出局** ⇒ **"出局"与"条件面要读它"直接冲突**。本份**不自行**给活动建系统，
只把冲突**如实登记**成一条**待人类拍板**。

---

## 2. 上游真值

### 2.1 实测定量（【样本】· 2026-10-17）

**统计方法**（可复述，⚠️ **必须先解 XML 实体**）：取 `Resources/Data/Maps/*.xml` 全部 `<condition>…</condition>` 内容 ⇒
**HTML 反转义**（`&lt;` `&gt;` `&amp;` —— 不解会**把 248 条 `<` 算子当成"无算子"**，本条就是踩过这个坑后重跑的）⇒
按 `|` 拆子条件 ⇒ 按 `Operator.SplitCondition` 的**同一顺序**（`< > = LTE GTE NOT`）取算子并切 key/value。

| 指标 | 实测 |
|---|---|
| `<condition>` **元素**数 | **2,023** |
| 按 `|` 拆出的**子条件**数 | **2,160** |
| **算子分布** | `=` **1,348** · `<` **248** · `NOT` **234** · `GTE` **190** · `LTE` **78** · `>` **62** |
| **无算子**的子条件 | **0**（⇒ `SplitCondition` 的 `Substring(0,-1)` 抛路径**发行数据不可达**） |
| **值侧仍含算子**（MC1 会切错的那种） | **0**（⇒ MC1 是**规则脆弱**，不是**正在发生的错误**） |
| `|` 出现在 `[...]` **内部** | **0**（⇒ `Split('|')` 的粗暴切分**没被踩到**，但见 §2.5 的文法不对称） |
| **命名空间分布** | `activity` **1,035** · `data.` **399** · `firstPet.` **294** · `random` **180** · `mission` **68** · `item` **60** · `battle.` **43** · `petBag` **38** · `player.` **31** · `map.` **7** · `npc` **4** · **兜底裸键 1** |
| **`plant.` / `animal.` / `date.`** | 地图条件里各 **0** 次（牧场/动物 = A 组；`date.` 只在战斗侧用） |
| **无条件 = 恒真** | `<button>` **2,858** 个 ⇒ **1,448（51%）无 `<condition>`**；`<func>` **486** 个 ⇒ **321（66%）无** |
| **每个容器的 `<condition>` 元素数** | button：`0`→1,448 / `1`→1,233 / `2`→162 / `3`→8 / `4`→7；func：`0`→321 / `1`→153 / `2`→8 / `3`→1 / `5`→2 / `6`→1 |
| **全角算子**（`＜＞＝`）出现 | **0** 次（⇒ §2.2 的 `toHalf: false` 差异**没被数据踩到**） |
| **引用的活动 id** | **64 种 / 1,035 次**，**全部命中** `Activities/info.csv`（135 行）；top：**`door` 184** · `spt` 173 · `mine` 81 · `hell` 54 · `11001` 45 · `20009` 42 · `soul` 36 |

⚠️ **本表的统计口径 = "不剥注释"（grep 口径）**，而 `docs/map/map-design.md §2.1/§2.2` 已改用**剥注释口径**（`<condition>` **1,996** / 子条件 **2,131** / `activity` **1,025** / `data.` 391 / `firstPet.` 284 / `item` 50 / `map.` 6）——
两者差 **27 元素 / 29 子条件**，**差额全在 `<!-- -->` 里**。✅ **人类 2026-10-18 拍板**：**注释直接忽略** ——
**权威口径 = 剥注释**（全仓定量、跨文档对账一律用它）；**grep 值保留为参考数字**（只为反查"差额是不是全在注释里"，桥的解析日志**两个数都打**；⚠️ **它不是数据**）；
**注释里的东西一律不解析**（✅ 人类 2026-10-18：**注释直接忽略、没有例外** —— 注释里的 `<resource>` **也不**作 swf 线索；`MQ2` 第 ③ 级**只认 `<id>.swf`**，见 `docs/map/map-data.md §2.9/§3.2`、**MDI7/MDI8**）。
⇒ 阅读本表时把它当**参考口径**（`activity` 的**相对占比 48%** 与结论不受影响）。

⚠️ **`door` 以 184 次成为最大引用** ⇒ **"门"的状态就存在活动键袋里** ⇒ 这是 `docs/architecture.md §1.1` C 组排期 ④（门线）的**入口证据**，
本份只登记指针、**不定义门**。

**单张图最密**：`1.xml` 66 条 · `87.xml` 49 · `60.xml` 48（⇒ 条件不是"个别图的配料"，是**主干**）。

### 2.2 装配层：`NpcHandler.GetNpcCondition`（`NpcHandler.cs:47-69`）【源码】

```csharp
if ((handler.condition == null) || (handler.condition.Count == 0)) return () => true;   // :49-50  ★无条件 = 恒真
Func<bool> condition = () => true;
for (int i = 0; i < handler.condition.Count; i++) {                 // ★元素之间 = AND
    var conditionOr = handler.condition[i].Split('|');              // :55  ★串内 = OR（朴素 Split）
    Func<bool> oldCondition = new Func<bool>(condition);            // :57  捕获"当前复合式"（不是捕获变量）
    Func<bool> newCondition = () => false;                          // :58  OR 的单位元
    for (int j = 0; j < conditionOr.Length; j++) {
        Func<bool> orCondition = new Func<bool>(newCondition);      // :62  逐个前推（闭包链）
        var split = Operator.SplitCondition(conditionOr[j], out var op, toHalf: false);   // :63  ⚠️ toHalf: false
        newCondition = () => orCondition.Invoke() || NpcConditionHandler.GetNpcCondition(op, split.Key, split.Value).Invoke();
    }
    condition = () => oldCondition.Invoke() && newCondition.Invoke();                    // :66  AND
}
```

- **形状 = DNF（析取的合取）**：`每个 <condition> 元素 = 一个 OR 串`，`元素之间 AND` ⇒ **没有括号、没有嵌套**、
  写在**几个元素**里由**数据**决定（实测最多 6 个元素 / 5 个 `|`）。
- ⚠️ **`toHalf: false`**（:63）：**地图侧不做全角→半角**，而战斗/技能侧走 `SplitCondition` **默认 `toHalf: true`**（`Operator.cs:21`）。
  ⇒ **同一份 DSL，两条链路宽容度不同**。实测全角 = 0 ⇒ **不可达但规则不一致**（**CSC1**，改判见 §3.2）。
- ⚠️ **求出的 `Func<bool>` 是"活的"**：`GetNpcEntity` 每次执行按钮**都会重跑整串求值** ⇒
  条件里若有 `random[new]` / `Activity.Find`，**副作用次数 = 点击次数**（§2.10、**CSC2/CSC3**）。
- **闭包链**的两处细节：`new Func<bool>(condition)` 是**按值捕获委托**（若直接捕获变量 `condition`，C# 的闭包会共享同一变量 ⇒ **全部塌成最后一个**）；
  `||` 的**短路** ⇒ OR 串里**后面的臂可能不执行** ⇒ 与"`random[new]` 写回"合起来 = **同一按钮里 `random` 是否被摇，取决于前面的臂**（**CSC4**）。

### 2.3 切分层：`Operator`（`Operator.cs:8-45`）【源码】

- `condDict`（**6 条，插入序有意义**）：`<` `>` `=` `LTE` `GTE` `NOT` ⇒ `SplitCondition` **按插入序取第一个命中**（MC1 的正身）。
  ⚠️ **`NOT` 无空格** ⇒ 写作 `firstPet.featureIdNOT10499`（【样本】实测 `NOT` **234** 次，全部无空格）。
- `Condition(op, lhs, rhs)`：**未知算子 ⇒ `false`**（`:39-41`，**不是抛**）；`Int/Float/Fraction` 三型重载（`Fraction` = `max * num / den`，战斗侧用）。
- `Split(':')` 的**第二个用途** = **过滤式**（`petBag(键:值)` / `buff(键:值)`），与 `|` / 算子切分**互不相干**；
  注意**先试 `:`**，切不出两段才回退 `SplitCondition`（`Identifier.cs:110-115`）。
- **`TrimParentheses` 的默认括号是 `[` / `]`**（`Helper.cs:59`）⇒ 函数名**与默认值相反**；圆括号 `(...)` 只在**过滤式**里显式传入。
  ⇒ **本纠正同时打在父文档 §2.6**（原写 `npc(<id>)` / `activity(<id>)`，**数据里全是方括号**）。

### 2.4 14 臂逐条（`NpcConditionHandler.GetNpcCondition`，`:11-65` + 各 helper）【源码】

> 每臂四列：**取值面 / 数据实际用的键（实测）/ 空值与抛点 / 我们的目标读法（§3）**。

| # | 臂 | 源码 | 取值面 | 【样本】实际用的键 | 空值 / 抛点 |
|---|---|---|---|---|---|
| **A1** | `random[arm]` | :13 + `:67-86` | `GetRandom` | `[old]` **138** / `[a~b]` **26** / `[new]` **16**（**裸 `random` = 0**） | 非 `old/new` 一律 `ToIntList('~')` ⇒ 不是两段数字就**越界抛** |
| **A2** | `map.<k>` | :16 | `Map.GetMapIdentifier`（`Map.cs:189-201`，8 个键 = **图级可读键**：`id` `resId` `weather` `category` `world` `switch` `dream` `anim`，★**没有 `name`**；`anim` 是 `resources?.anim == null ? 0 : 1` ⇒ **运行时资源态**、不是数据列） | **只用 `map.anim`（7）** | 键不认识 ⇒ `0`（**不是抛**）；`currentMap` null ⇒ `0`。⚠️ **取值的实测分布归 M5**：`@switch` 45 张 = `1`×23 / `-1`×21 / **`71`×1**、`@dream` **3 张** ⇒ 若将来写 `map.switch==1` 这类条件，**桥必须先把 `switch` 收窄成 `0\|±1`**（M5 §3.4），否则 `71` 会以"非 1"的身份静默参与比较 |
| **A3** | `npc[id].color` | :19-30 | **运行时 UI** `NpcView.GetIdentifier("color")` ⇒ `button.image.color` | **4 次 / 2 张图**（`10017.xml`）；键**只有 `color`** | `npcDict.Get(id)` 取不到 ⇒ `npc` = null ⇒ **NRE**；其余键 ⇒ `false` |
| **A4** | `firstPet.<k>` | :32 + `:88-90` | `petBag[0].GetPetIdentifier`（键集见 §2.8） | `id` 103 · `level` 78 · `baseId` 49 · `uid` 34 · `featureId` 20 · `kizuna` 4 · `skill[N]` 4 · `backup` 2 | **`petBag[0]` 无保护** ⇒ 背包空 = **NRE**（**CSC5**） |
| **A5** | `activity[id].<键>` | :35 + `:103-122` | `Activity.Find(id).GetData(键, 缺省)`（**平键查找**） | **1,035 次 / 64 个 id**；值类型 `bool` **840** / `int` **195** | 值不以 `[` 开头 ⇒ `IndexOf("[")= -1` ⇒ **抛**；`Find` **永不返回 null**（见 §2.10） |
| **A6** | `mission[id].<k>` | :42 + `:92-101` | `Mission.Find(id)`（**可空**，`Mission.cs:73-80`） | `checkpoint` **64** / `done` **4** | **null ⇒ `op != "="`**（§2.10 的"缺状态"编码） |
| **A7** | `battle.<k>` | :49 + `:124-130` | `GetBattleIdentifier("state."+k)`（键集见 §2.9） | `turn` 17 · `result.state` 12 · `op.pet.status.lostHp` 4 · `op.pet.buff[101].count` 4 · `me.skill.criticalResult` 3 · `result.capturePet.id` 2 · `me.pet.baseId` 1 | **`currentBattle` null ⇒ `op != "="`**；`currentState.myUnit` 无保护 |
| **A8** | `item[id].<键>`（含 `item_yite[id]`） | :53 + `:132-136` | `Item.Find(id, 袋)?.num` ⇒ ⚠️ **`<键>` 被整臂忽略** | `item[N].num` **50** / `item_yite[N].num` **10**（**键只有 `num`**） | `int.Parse(value)` 无兜底 ⇒ **非数字即抛**；缺道具 ⇒ `0` |
| **A9** | `yite_rogue.<k>` | :60 + `:138-143` | `YiTeRogueData.GetYiTeRogueIdentifier` | **0 次**（肉鸽 = A 组出局） | **null ⇒ `op != "="`** |
| **A10** | `date.<k>` | 兜底 → `Identifier.cs:41-56` | `DateTime.Now` 的 8 个分量 | **0 次**（地图不用） | 不认识 ⇒ 落 `GetNumIdentifier` ⇒ **0** |
| **A11** | `player.<k>` | 兜底 → `:58-73` | `gameData.shoot` / `gameData.achievement` + `follower.` / `map.` 两条子链 | **`player.shoot` 29 / `player.achievement` 2** | 其余键 ⇒ `GetNumIdentifier` ⇒ **0** |
| **A12** | `plant.` / `animal.` | 兜底 → `:75-79` | `Plant.currentPlant` / `Animal.currentAnimal` | **各 0 次** | null ⇒ **`float.MinValue`**（⚠️ 与 A6/A7 的 `op != "="` **两种不同"缺状态"编码**） |
| **A13** | `data.<面板>[.<键>]` | 兜底 → `:81-91` | `Player.GetSceneData(面板, 0)` 的**活对象**（§2.7） | `data.PetSelect.uid` **199** · `data.PetSelect.level` **197** · `data.is_mod_exist` **3** | `Pet` ⇒ 转 `GetPetIdentifier`；**其余 ⇒ `ToString()` 再数字解析** |
| **A14** | `petBag…` | 兜底 → `:93-143` | 下标式 `petBag[i].k` **或** 过滤式 `petBag(键:值).count` | 全是过滤式：`petBag(baseId[N]:1).count` **×9 种** · `petBag(element:2).count` 等 | 空集 ⇒ `float.MinValue`（**不是 0**，见 §2.8） |
| **A15** | **兜底裸键** | `:64` | `Operator.Condition(op, ParseOperation(key), ParseOperation(value))` | **仅 1 条**：`active=false`（`1190.xml:56`） | **`"active"` 与 `"false"` 都解析成 0 ⇒ `0 = 0` ⇒ 恒真**（**CSC6**） |

**A5 · `activity` 臂的**值文法**（本臂最绕，单独写）**【源码】`:103-122`：

```
[类型]条件值[default]缺省值        例：[bool]false[default]false   [int]29[default]0
   ↓ type = TrimParentheses().ToLower()        （默认 "string"）
   ↓ value  = value.Substring(type.Length+2)   （⚠️ 假定 "[type]" 恰好占据前 2+len 个字符）
   ↓ conditionVal = value.Substring(0, value.IndexOf("["))
   ↓ defaultVal   = value.Substring(value.IndexOf("]")+1)
activity.GetData(dataKey, defaultVal)          // 平键查找：data.Find(x => x.key == dataKey)
```

- **四种类型**：`bool`（实测 840）⇒ **字符串相等比**（`bool.Parse(a) == bool.Parse(b)`，**算子被无视**）；
  `float` / `int` / `uint`（195）⇒ 走 `Operator.Condition`；**其余（含默认 `string`）⇒ 字符串 `==` / `!=`**。
- ⚠️ **`bool` 一臂把 `op` 丢掉** ⇒ `activity[x].y<bool]true[default]false` 与 `NOT` 版**只由值本身决定**，`LTE` 之类**毫无意义**（**CSC7**）。
- 【样本】**2 条畸形**：`activity[spt].done[new][6][skin]=[bool]false[skin]false` ——
  ①`dataKey` = `done[new][6][skin]`，但 `GetData` 是**平键查找** ⇒ 查不到 ⇒ **恒取缺省**；②值里的 `[skin]` 不是 `[default]`，
  靠 `IndexOf("]")` 的**位置巧合**才切出 `false`。**⇒ "多级下标"在 activity 里不是层级，是拼错的平键**（**CSC8**）。

**A1 · `random` 臂的精确语义**（`GetRandom`，`:67-86`）【源码】—— ⚠️ **与父文档原记相反**：

```csharp
bool result = Operator.Condition(op, Player.instance.random, float.Parse(value));   // :68  ★先用「旧值」判定
if (key == "[old]") return result;                                                  // :70-71
if (key == "[new]") { Player.instance.random = Random.Range(0, 100); return result; } // :74-77  ★仍返回旧判定
var range = key.TrimParentheses().ToIntList('~');                                   // :79
int rng = Random.Range(range[0], range[1]);                                         // :80  ★Unity int 重载 = 闭区间
if (petBag.Any(x => Buff.GetEmblemBuff(x)?.id == 20_0051)) rng /= 4;                // :82-83
return Operator.Condition(op, rng, float.Parse(value));                             // :85  ★只有这条臂用新值判定
```

⇒ **三条臂的关系是**：`[old]` 与 `[new]` **判定完全相同**（都用旧值），**唯一区别 = 是否推进序列**；
`[a~b]` **另摇一个并现场判定**（不碰存档/会话）。⇒ 命名**误导**（"new"读起来像"用新数判定"）（**CSC9**）。
⚠️ **`[old]`/`[new]` 与 `[a~b]` 的"纹章除 4"发生在**不同位置**：前者在 `Player.random` 的 **getter** 里（`Player.cs:32`），后者在算完之后**再除** ⇒
`[old]` 拿到的是**已除 4** 的值、`[a~b]` 拿到的是**现场摇再除** ⇒ **两条臂都除，但除的对象不同**（**CSC10**）。

### 2.5 ★同一个前缀写了两遍（本份第一号结构发现）

`NpcConditionHandler.GetNpcCondition`（`:11-65`）与 `Identifier.GetIdentifier(string)`（`Identifier.cs:35-188`）
**各自实现了一份命名空间分派**，覆盖**部分重叠**的前缀（`random` / `activity` / `battle.` / `item` / `yite_rogue.` / `firstPet.`），
**且文法不同**：

| 前缀 | 显式臂（`NpcConditionHandler`） | 兜底臂（`Identifier`） | 差异 |
|---|---|---|---|
| `random` | 只认 `[old]`/`[new]`/`[a~b]`（`ToIntList('~')`） | `[old]`/`[new]`/**裸**/`[a\|b~c]` **池**（`ToIntRange`，`Helper.cs:220-244` 支持 `|` 与 `~`） | **地图条件读不到"id 池"文法**；战斗/对话表达式读得到 |
| `activity` | `GetData(键, 缺省)` 后按**类型**比 | 同样 `GetData`，但**缺 `[default]` 时自动补 `[default]0`**（`Identifier.cs:152-153`），再 `float.TryParse` | **同一个键两条链路缺省不同**（0 与"抛/字符串比"） |
| `battle.` | `GetBattle(op, key, value)`（先 `op != "="` 兜 null） | `GetBattleIdentifier("state."+k)` 后 `float.TryParse` | 兜 null 的位置不同 |
| `item` | 忽略键、比 `num`（`int.Parse(value)`） | **同样忽略键**（`Identifier.cs:175-178` 的 `switch { _ => item?.num ?? 0 }`） | 一致（**两份都写"忽略键"**） |
| `firstPet.` | `petBag[0].GetPetIdentifier` | **重写成 `petBag[0].`** 再递归（`:93`） | 一份直接、一份绕路 |

⇒ **目标**（**CSI3**）：**只留一份分派表**。地图侧的 `core/map/condition.ts` **拥有**这张表，
`pet.` / `buff.` 之类**下钻到域线的读键函数**（而不是再抄一遍前缀）；
`Identifier` 那份**只服务战斗表达式**，两者**不许互抄**（`docs/arch-code.md §3` 的硬规则按"一份语义一个家"）。

### 2.6 表达式层：`Parser.ParseOperation`（`Parser.cs:106-124` + `Operator.cs:84-136`）【源码】

- **14 个算术算子**（`opDict`，插入序 = `+ - * / ^ % [MIN] [MAX] SET [ABS] [NEG] [FLR] [CEL] [RND]`）。
- `ParseOperation(expr)`：剥一个**前导 `-`** 当符号 ⇒ `Split(opDict.Keys)` 切出**标识符序列** ⇒ **从左到右逐个 `Operate`，无优先级、无括号**。
- **`Operate` 未知算子 ⇒ `0`**（`:90-92`）⇒ **一个切错的算子会把整条左值抹成 0**（不是抛、不是保留）。
- 语义细节（**必须照录的三条**）：`%` = **`(int)lhs % (int)rhs`**（先截断）；`[ABS]` = **`|lhs - rhs|`**（**二元**，不是"取绝对值"）；
  `[FLR]/[CEL]/[RND]` = **对齐到 `rhs` 的倍数**（`FloorToInt(lhs/rhs)*rhs`）；`SET` = **返回右值**；`[NEG]` = **`rhs - lhs`**（**反号减法**）。
- ⚠️ **`Split` 用的是 `string[]` 重载**（不是逐字符）⇒ 多字符算子按**整串**匹配；**`RemoveEmptyEntries`** ⇒ 相邻两个算子会塌成一个未知算子 ⇒ **0**。
- 实测：**30 条子条件的 key/value 里出现算术字符**，全部形如 `activity[dream].done[-209]=…`（`-` 是**负数下标**的一部分，不是算子）
  ⇒ **表达式层在地图条件里几乎没被真正使用**，但**动作 `param` 侧用得很多**（`[expr]` 分段，M2 §2.6；`{expr:}` 插值，M4）。

### 2.7 `data.` 键袋（`sceneData`）全景（MC6 的正身）【源码】+【样本】

**它是什么**：`Player.cs:37` 的 **`private static Dictionary<string, object> sceneData`** —— **静态、进程生命周期、`SaveSystem` 不碰**；
`GetSceneData(key, default)` 缺键 ⇒ 返回**传入的默认**（`Identifier.cs:85` 传的是 **`0`**）。

| 键 | 谁写 | 谁读 | 类型 |
|---|---|---|---|
| `random` | `Player.random` setter / `Start()` | **A1 臂 + 条件兜底 + 战斗** | `int` ⚠️（getter 里带**纹章除 4**） |
| `mapNpcList` | `MapSceneView.cs:285`（**进图 `auto` 之前先写**，M2 §2.5） | **A3 臂**、`NpcController.Shoot`、`DialogView` ×4、`DialogManager.cs:78` | `Dictionary<int, NpcController>` |
| `PetSelect` / `PetSelectIndex` | `PetSelectHintboxController.cs:13-14`（**面板回填**） | **A13（199+197 次）**、`FusionModel.cs:31/38` | `Pet` / `int` |
| `mapTeleportList` | `MapSceneView.cs:477` | 传送（M5） | `Dictionary` |
| `mapInitPos` | `TeleportHandler.cs:57` | `MapManager.cs:45`（消费后**应删**，M5） | `Vector2` |
| `shootMode` | `Player.isShootMode` setter | MC3 模式门 | `bool` |
| `seed` | 农场/动物/`MapManager` ×8 | 牧场（A 组） | `int` |
| `is_mod_exist` | `ResourceManager.cs:57` | **A13（3 次）** | `int`（0/1） |
| `fightBg` / `fightBgIsMod` / `captureAnim` | `FightLoadingScreen.cs:62-64` | 战斗表现（B4 / E7） | `Sprite` / `bool` / `AnimatorController` |
| **任意键** | **`NpcActionHandler.SetNpcParam` 的 `data.<键>=<表达式>`**（`:86-90`） | 同上前缀任意处 | 表达式结果 |

⇒ **上游把三种东西塞进一个袋子**：**会话态**（`random`/`shootMode`/`mapInitPos`）、**面板回填的活对象**（`PetSelect`）、
**资源句柄**（`fightBg`/`captureAnim`）。**A13 的"取运行时面板塞进去的活对象"**正是 MC6 的病根。
⇒ **目标（CSI5）**：**拆开**（编排线的 `SceneData` = 会话态；面板回填 = **结构化 `selection` 切片**；资源句柄 = B3/B4 的加载层，**不进条件面**），
条件只读**前者两者**，**永不**读资源。

### 2.8 `firstPet.<键>` / `petBag…` 的合法键集（`Pet.cs:253-441`）【源码】

- **未知键 ⇒ `float.MinValue`**；`TryGetPetIdentifier` = `GetPetIdentifier(...) != float.MinValue`（`:439-442`）
  ⇒ **过滤式空集返回 `float.MinValue`，不是 0**（`Identifier.cs:129-130`）⇒ `petBag(…)=0` 与 `petBag(…)<1` **含义不同**。
- ⚠️ **`baseId` ≠ `baseId[N]`**：平键 `baseId` = `basic.baseId`（**数值**，实测 49 次）；
  **`baseId[N]` = `PetExpSystem.GetEvolveChain(N, this.id)` 非空 ⇒ 1/0**，即 **"这只宠是否在 N 的进化链上"**（`Pet.cs:365-370`）。
  ⇒ 数据里 `petBag(baseId[10010]:1).count=0` 的正确读法是 **"背包里没有任何属于 10010 进化链的宠"**。
  ⚠️ **`[N]` 用的是**方**括号**（`TrimParentheses` 默认 `[ ]`），与过滤式的圆括号**同串不同种**。
- ⚠️ **`skill[N]` = 成员测试**（`skills.ownSkillId.Contains(N) ? 1 : 0`，`:308-314`）⇒ `firstPet.skill[10440]=1` = "会这招"（实测 4 次）。
- `uid` = **实例 id**（`this.id`）、`id` = **物种展示 id**（`info.ui.defaultId`）⇒ **两条键都不是"数据库主键"**，别混（**D6** 已定 `Pet` 身份三件套）。
- 其余可用：`status.*`（`init/extra/battle/personality`）· `ev.*` · `kizuna[.min/.max/.tag[..]]` · `skin[N]` · `gender[N]` ·
  `subElement.group[..]` · `buff[..]` · `record(..)` · `backup.` · `own` · `star/generation/element/level/maxLevel/exp/levelExp/iv/evStorage/emblem/featureId/featureType/emblemId/emblemType/resistLock/height/weight/trait`。
- ⚠️ **`superSkill` 一臂读错变量**（`Pet.cs:298-304` 用 `trimNormalSkill` 而非 `trimSuperSkill`）⇒ **上游代码 bug**，
  **归 D6**（本份只登记：条件若写 `firstPet.superSkill.x` 会读到 `normalSkill` 的残余 ⇒ 见 **CSC11**，**不重复登记**）。

### 2.9 `battle.<键>` 能读到什么（`Identifier.cs:228-296` → `BattleState.cs:80-118`）【源码】

`NpcConditionHandler.GetBattle` 把键**前置成 `"state."`** 再走 `GetBattleIdentifier` ⇒ 实际面：
`turn` · `actionCursor` · `order.direction` · `phase` · `weather` · `whosTurn` · `option(k)` · `settings.<k>` · `result.<k>` · `buff[..].<k>` · `last.<k>`
+ `me.` / `op.` 两条**单位链**（`pet.` / `skill.` / `buff` / `card.`）+ `state.me.order`（行动序）。
【样本】实测只用了 **7 种**（`turn` 最多）⇒ **本份不实现整面**，按 §3.2 **先实现实测命中的 7 条**，其余**登记待补**。
⚠️ **这些键的真值**归 **E1**（状态）/ **E5**（判定）/ **D4**（buff）—— 本份**只列可点名，不定义算法**。

### 2.10 ★条件求值的副作用（本份第二号发现）

| 副作用 | 源码 | 落在哪 | 严重度 |
|---|---|---|---|
| `random[new]` 写 `Player.instance.random` | `NpcConditionHandler.cs:75` | **会话态** `sceneData["random"]`（`Player.cs:32-33`）；⚠️ **`System/Data/GameData.cs` 全文无 `random` 字段、`SaveSystem` 不碰** ⇒ **不落盘**，`Player.Start()` 每次**重摇** | 中（父文档 MC5 原写"写回存档"是**错的**，已纠正） |
| **`Activity.Find(id)` 找不到就 `new` + `activityStorage.Add`** | `Activity.cs:36-44` | ⚠️ **`activityStorage` 是 `GameData` 字段**（`GameData.cs:59`）⇒ **进存档**（`SaveSystem.cs:392` 还在清理它） | **高**：**读一次条件 = 可能往存档加一条空活动**（**CSC3**） |
| `Mission.Find` | `Mission.cs:73-80` | **纯读**（可返回 null） | 无（⇒ A6 的 null 分支**可达**，实测 68 条） |
| `Player.GetSceneData` | `Player.cs:59-62` | **纯读** | 无 |

⚠️ **两个直接推论**：① `GetActivity` 里的 `activity == null` **NRE 不可达**（`Find` 永不返回 null）⇒ 上游用"永不 null"**掩盖了**"随手写存档"；
② **`random` 是会话级**⇒ **落地不需要 R4 写盘接缝**，只需要 `MapEnv.sceneData` + `MapEnv.rng`（**MQ3 因此比原判更轻**）。

---

## 3. 目标结构与契约

### 3.1 落点与形状

```
core/map/condition.ts          ← 本份的目标（纯函数、零上层 import，MP3）
  ├─ splitCondition(str)        → { op, key, value }          // 显式「最左最先」，不依赖字典序（CSI1）
  ├─ parseConditions(list)     → ConditionExpr                // 元素 AND / 串内 OR（DNF，无括号）
  ├─ evalCondition(expr, env: MapEnv) → boolean | 'unknown'   // ★三值（§3.3）
  └─ 14 臂的**一张**分派表                                    // 不再有两份（§2.5）
logic/map/condition-host.js     ← L1：把 MapEnv 的接口接到真状态（道具/宠/会话/战斗宿主）
```

- **语法与求值分开**（`parseConditions` 产出**可序列化的 AST**，`eval` 只读 `env`）⇒
  数据加载期就能**登记畸形**（`active=false` 这类），不等点击（**CSI6**）。
- **`split('|')` 只在装配层做一次**，且**必须在 `[...]` 之外**（实现为**括号深度感知**）⇒ 未来若真出现 id 池不会被切坏（**CSI2**）。

### 3.2 逐臂目标行为（✅ 依父文档 §7 MQ3；空状态依 §3.3）

| 臂 | 目标 |
|---|---|
| A1 `random` | `[old]` = 读会话值**不摇**；`[new]` = **同一判定值** + **推进序列**（照录"判定用旧值"，因为**数据依赖它**，但**改名**为 `random[consume]` 并保留 `new` 作别名 ⇒ 见 **CSQ2**）；`[a~b]` = 现场摇、**闭区间**（Unity `Random.Range(int,int)` 语义，`rng.ts` 已按此实现）；**纹章除 4 = 一份规则**（只在**读侧**一次，两条臂共用） |
| A2 `map.` | 8 键照录；**未知键 ⇒ `'unknown'`**（上游是 `0`） |
| A3 `npc[..].color` | **不读 UI** ⇒ 读 `env.npcRuntime[id].tint`（**L1 维护的逻辑色**，见 **CSQ3**）；**未知键 ⇒ `false` 照录**；**id 取不到 ⇒ `'unknown'`**（上游 NRE） |
| A4 `firstPet.` | 键集**下钻 D6**（本份不抄）；**背包空 ⇒ `'unknown'`**（上游 NRE） |
| A5 `activity[..]` | **值文法照录**（`[类型]值[default]缺省`）；⚠️ **`bool` 一臂"算子被无视"不照搬** ⇒ 目标：`bool` 也用 `op`（**CSC7** 改判）；**平键查找照录** —— ⚠️ `[...]` **是平键的一部分、不是层级**（实测**读侧 947 / 1,025 条（92%）**、**写侧 578 / 603 条（96%）**，**CSC8 已订正**）⇒ **不判"多级下标"**；只有**值**侧分隔标记 ≠ `[default]` ⇒ `'unknown'` + 登记；**`Find` 纯读**（不再 get-or-create，**CSC3** 改判） |
| A6 `mission[..]` | **`'unknown'`**（任务 = A 组出局；上游 `op != "="`） |
| A7 `battle.` | 先实现**实测 7 键**，其余 `'unknown'` + 登记（**E1/E5 落地后补**）；**战斗未就绪 ⇒ `'unknown'`**（上游 `op != "="`，把"没在打"当成了"打得不一样"） |
| A8 `item[..]` | **`<键>` 照录忽略**（数据里 100% 是 `num`，改了没收益）；**值非数字 ⇒ 解析期报错**（上游运行期抛）；⚠️ 缺来源时说 `'unknown'`，**不谎报 `0`**（`items.count` 允许三值，见 §3.4 注） |
| A9 `yite_rogue.` | 形状照录、执行 `'unknown'`（A 组出局） |
| A10 `date.` | 形状照录、执行 `'unknown'`（⚠️ **实测 0 次**，且时钟 = 运行时线 **R2**，**未建**；本线**不顺手造时钟**） |
| A11 `player.` | ⚠️ **§3.2 原把 A9–A12 合并成"一律 `'unknown'`"，与 §3.4 的 `player` 缝冲突** ⇒ 按**更细者**（§3.4）实现：`shoot` / `achievement` **两键真读**（**实测 31 次**）；其余子键（上游 `:58-73` 还挂着 `follower.` / `map.` 两条子链，但**发行数据里 0 次**）⇒ `'unknown'` + 登记 |
| A12 `plant.` / `animal.` | 形状照录、执行 `'unknown'`（牧场 = A 组出局，**实测 0 次**） |
| A13 `data.` | 只读**会话态 + `selection`**（§2.7 拆分后）；`PetSelect.uid/level` 两条 = **`env.selection`**；**键不存在 ⇒ `'unknown'`**（上游 `0`） |
| A14 `petBag…` | 下标式 + 过滤式**都要**（`count`/`sum`/`max`/`min`/裸键）；**空集 ⇒ `0`（`count`）或 `'unknown'`（裸键）**——上游的 `float.MinValue` **不照搬**（**CSC12**）；`baseId[N]` = **进化链成员**读法照录（链表 = **D7**） |
| A15 兜底裸键 | **不再静默 0**：解析期 ⇒ 登记 `unknown-key`；求值 ⇒ `'unknown'`（**CSC6** 改判） |

### 3.3 ★空状态三值约定（本份最重要的一条契约）

上游有**三种**"状态不存在"的编码（`op != "="` / `float.MinValue` / `0` / NRE），**互不一致**且都会**把"不知道"变成"答案"**。
⇒ **目标 = `boolean | 'unknown'`**（**CSI4**）：

- **`'unknown'` 在 AND/OR 里的传播**：`unknown AND true = unknown`；`unknown AND false = false`；`unknown OR true = true`；`unknown OR false = unknown`。
- **按钮级**：`'unknown'` ⇒ **视为不满足**（不触发），**但记一条日志**（键名 + 原因）⇒ 与 MP7"不抛"、MC8"要能查"同一条口径。
- ⚠️ **为什么不能简化成"unknown = false"**：`random[new]` 与 `Activity.Find` 都有副作用，
  短路 + unknown 传播的**求值次数**会影响会话态（§2.2）⇒ 目标实现里 **`'unknown'` 的臂一律不执行副作用**（副作用只在**真需要新值**时经 `env.consumeRandom()` 显式上抛）。

### 3.4 `MapEnv` 轮廓（MQ3 的**条件侧切片**）

> ⚠️ **2026-10-18 实现期两处订正**（as-built `docs/map/map-impl.md §7.3.4` 偏差 ② ③）：
> ① **`npcRuntime` 可缺省**（`?`）：A3 取不到逻辑色 ⇒ `'unknown'`（比"必须给一个对象"更诚实）；
> ② **两处数值缝加宽成三值** —— `items.count` 与 `player.shoot/achievement` 允许返回 `'unknown'`，
>    因为这条线的原则是**"取不到就说不知道"**（`CSI4`：上游正是把"不知道"说成了 `0`）；`A11` 因此**从"一律 `'unknown'`"改为真读两键**（见 §3.2 表）。
> ③ 另多出 **`rng.emblem?(): boolean`**（纹章除 4 的**唯一**开关，`CSI8`）——未实现 ⇒ 省略 ⇒ 不除 4。

```ts
export interface MapEnv {                        // 由 L1 注入；core 零 import 上层（MP3）
  rng: {                                         // A1（★副作用外提，决议 ①/③）
    read(): number                               //   `[old]`：读**原始**会话值（除 4 由 core 一处做）
    consume(): number                            //   `[new]`：推进序列并返回新值（**判定不用它**）
    roll(min: number, max: number): number       //   `[a~b]`：闭区间现场摇
    emblem?(): boolean                           //   纹章 `20_0051` 在不在队伍（缺省 ⇒ 不除 4）
  }
  map: { identifier(key: string): number | 'unknown' }          // A2
  npcRuntime?: { tint(id: number): string | 'unknown' }         // A3（L1 的逻辑色，不是 UI）
  petBag: Array<PetView | null>                                 // A4 / A14（PetView = D6 的只读切片）
  activities: KeyValueBag<string>                               // A5（✅ 有实体：存档 `<activityStorage>`，见 CSQ4）
  missions: KeyValueBag<number>                                 // A6（形状占位，A 组出局）
  battleState?: BattleView | null                               // A7（→ E6 宿主；`null` = 没在打）
  items: { count(id: number, bag?: 'yite'): number | 'unknown' } // A8（→ 道具线）
  sceneData: { get(key: string): unknown }                      // A13（→ 编排线 SceneData）
  selection?: { pet?: PetView }                                 // A13 的 PetSelect 拆分件
  player: { shoot: number | 'unknown'; achievement: number | 'unknown' } // A11
  log: { unknown(why: string): void }                           // §3.3 的登记出口
}
```

### 3.5 施工批（**MDB3-a…e** —— ✅ **2026-10-18 一次落齐**）

> ⚠️ **实际落码时五片**一次**写完**（`parseConditions` 与 `evalCondition` 是同一份 AST 的两半，拆开反而要留半成品）——
> 下面的表保留**原切片的意图**（每片都能独立复核），状态列是**实况**。

| 号 | 内容 | 依赖 | 状态 |
|---|---|---|---|
| **MDB3-a** | 括号感知 `|`（`splitOrClause`）+ `parseConditions`（最左最先、**畸形在解析期登记**，`active=false` 这类可见） | M1 桥（`conditions[]` 原串） | ✅ 已落 |
| **MDB3-b** | `MapEnv` + `condition-host` 适配器（**只做适配、来源由 L4 传**；缺来源 ⇒ 保守兜底） | 道具线、D6、编排线 | ✅ 已落 |
| **MDB3-c** | **A2/A4/A8/A13/A14 五臂** | 同上 | ✅ 已落（⚠️ A14 的过滤键取不到 ⇒ **该宠不入选 + 登记**） |
| **MDB3-d** | **A5 `activity`**（值文法 + 平键 + **纯读**）——✅ 已解阻（人类 2026-10-18 拍板 `CSQ4`） | **CSQ4**（✅ 已决） | ✅ 已落 |
| **MDB3-e** | **A1 `random`**（三臂 + 纹章一份规则）+ **A7** + A3 逻辑色 | R1、M6、B3 | ✅ 已落（⚠️ A7 的 7 键**值面**仍等 E1/E5 ⇒ 今天恒 `'unknown'`） |
| **额外** | **A6/A9/A10/A12/A15** 五臂的形状与改判（`mission`/`yite_rogue`/`date`/`plant.`/裸键） | —— | ✅ 已落（一律 `'unknown'` + 登记） |

---

## 4. 数据流（一张图）

```text
Maps/<id>.xml
   └─ <button>/<func>/<winHandler 的 button>
        └─ <condition> 元素 × N          ← M1 桥：原样存 string[]（不解析、不执行 = MDI10）
             │
             ▼  parseConditions（装配层，MDB3-a）
        AND[ OR[ {op,key,value}, … ], … ]                     ← 可序列化 AST（CSI6）
             │
             ▼  eval(expr, MapEnv)（MDB3-b/c/d/e）
        boolean | 'unknown' ──'unknown'──▶ env.log.unknown(键名+原因)
             │
             ▼  NpcHandler.GetNpcEntity 的门序（M2 §2.4）
        模式门（MC3）→ 条件 → ActionIntent（M2 §3 / MQ4）→ L1 执行器
```

---

## 5. 不变量 / 契约（**CSI1–CSI8**）

| # | 不变量 |
|---|---|
| **CSI1** | **6 个比较算子 + 显式"最左最先"**：`< > = LTE GTE NOT`，切分**按固定优先级表**（不靠字典插入序）；**未知算子 ⇒ 解析期登记**（不静默 `false`）。 |
| **CSI2** | **DNF 结构**：元素间 **AND**、串内 **OR**、**无括号无嵌套**；`|` 的切分**必须括号深度感知**。 |
| **CSI3** | **一份分派表**：命名空间分派**只住在 `core/map/condition.ts`**；战斗侧 `Identifier` **不再抄一份**（§2.5）。 |
| **CSI4** | **三值求值**：`boolean | 'unknown'`；`'unknown'` ⇒ **不触发 + 登记**；**`'unknown'` 的臂不执行副作用**。 |
| **CSI5** | **条件只读会话态与结构化选择**，**永不**读 UI / 资源句柄 / 面板对象实例（§2.7 拆分）。 |
| **CSI6** | **语法与求值分离**：畸形（无算子 / 未知键 / 值文法错）在**数据加载期**可见，不等点击。 |
| **CSI7** | **求值 = 纯函数 + 上抛的显式效应**（`env.consumeRandom()`）⇒ 同一 `env` 快照内**重复求值同题同答**（除 `random` 显式消费）。 |
| **CSI8** | **纹章除 4 = 一份规则、只在读侧一次**；`[a~b]` 的**闭区间**语义照录（Unity `Random.Range(int,int)`，`core/rng.ts` 已实现）。 |

---

## 6. 现状与缺口（我们的仓库）

| 面 | 现状 | 缺口 |
|---|---|---|
| `game/core/parser/operator.ts`（**101 行**） | ✅ **6 算子 + 最左最先 + 全角转换 + `splitCondition`** 已逐行照搬，且**无算子时抛**（带原文，比上游更好定位） | ✅ **括号感知 `|` 已补**（`CSI2`）—— 落点**不在** `operator.ts`（它是战斗侧共用的底座），而在 **`game/core/map/condition.ts` 的 `splitOrClause`**（2026-10-18） |
| `game/core/parser/parser.ts`（**155 行**） | ✅ `ParseOperation` 家族（表达式层）已在，服务战斗 | ⚠️ **地图线不复用它**（决策 `D4` + `CSI3`）：兜底裸键走**登记 + `'unknown'`**（`CSC6` 改判），而 `ParseOperation` 正是"静默 `0`"的那条路 |
| `game/core/parser/identifier.ts`（**78 行**） | ✅ `getNumIdentifier` 的 `random` 四臂 + `date.` / `player.` 前缀 + **`IdentifierHost` 注入面**（本份 `MapEnv` 的**同族先例**） | ⚠️ **只覆盖兜底臂的少数前缀**，`data.` / `petBag` / `activity` / `item` **全无** —— ⚠️ **2026-10-18 起地图侧不再走它**（`CSI3`：14 臂**只**住 `core/map/condition.ts`，它作为 **D5 的 `SkillType` 同族**，等**战斗线**决定归属） |
| `game/core/rng.ts`（**49 行**） | ✅ **闭区间 `nextInt` 已按 Unity 语义实现**（含注释说明"int 重载闭区间、float 左闭右开"） | 无（`condition-host` 只需把它包成 `MapRng`） |
| **`NpcConditionHandler` 的对应物** | ✅ **已落（2026-10-18）**：`game/core/map/condition.ts`（**L0**，14 臂分派 + 求值 + `splitOrClause`）+ `game/logic/map/condition-host.js`（**L1** 适配器） | 条件门要**点 NPC** 才响 ⇒ 可玩面随 **MB4（动作）+ MB5（接线）**；`PetView`（A4/A14）等 **D6**、`BattleView`（A7）等 **E1/E5** |
| **`game/data/maps.json`** | ⚠️ 只有 `teleports[]`（AS3 血统），**无 `conditions[]`** | ✅ **前置已落（MB1 方案 C）**：条件**不再经数据桥**，由 `game/logic/map/parse-map.js` 现场解析出 `<condition>` 原串（`content.loadMap`） |

---

## 7. 怪癖登记 / 待拍板 / 人手测项

### 7.1 上游代码 bug 与危险设计（**CSC1–CSC12** · 声明 + 不照搬）

| # | 条目 | 源码 | 症状（含**发行数据里的可观察后果**） | 我们怎么写 |
|---|---|---|---|---|
| **CSC1** | **地图侧不做全角→半角**（`toHalf: false`），战斗侧做 | `NpcHandler.cs:63` | 同一 DSL 两种宽容度；【样本】全角 **0 次** ⇒ **当前不可达** | **统一走全角转换**（零成本、消除双标准） |
| **CSC2** | **条件求值次数 = 点击次数**（活委托 + 每次重跑） | `NpcHandler.cs:47`、`NpcHandler.cs:101-108` | 与 A1/A5 的副作用相乘 ⇒ **"多点几下会改变后续判定"** | 目标 = **快照内幂等**（CSI7）；`random` 消费**显式上抛** |
| **CSC3** | ★**`Activity.Find` 是 get-or-create 且写进 `GameData.activityStorage`** | `Activity.cs:36-44` + `GameData.cs:59` | **读一次条件 ⇒ 可能往存档加一条空活动**；`SaveSystem.cs:392` 还在专门清理 mod 活动 ⇒ 副作用**已被上游察觉并打补丁**，但根因（`Find` 有写副作用）没修 | **`activities` 是纯读键袋**；缺键 ⇒ `'unknown'` + 走值里的 `[default]`，**不建对象** |
| **CSC4** | **`|` 短路 + 随机写回** | `NpcHandler.cs:64`（`||` 短路） | `random[new]` 是否被摇**取决于前面臂的结果** ⇒ 同一按钮内**序列推进不确定**（对拍不可比，但**决议 ① 已允许**） | 照录短路（**行为**），但在文档与日志里**写明"推进次数由数据决定"** |
| **CSC5** | **`petBag[0]` / `currentState.myUnit` 无保护** | `NpcConditionHandler.cs:89`、`:129` | 空背包 / 战斗未就绪 ⇒ **NRE**（整条按钮链炸） | `'unknown'` + 登记（CSI4） |
| **CSC6** | ★**兜底把未知键当 0 ⇒ `active=false` 恒真** | `Identifier.cs:32`（`TryParse` 失败 ⇒ `0`）+ `NpcConditionHandler.cs:64` | 实测**唯一一条兜底裸键** = `1190.xml:56` 的 `active=false`（一个 `<reply type="branch">`，意图"若 NPC 未激活"）⇒ `"active"`→0、`"false"`→0 ⇒ **`0=0` 恒真** ⇒ **该分支永远执行**（恰好 `setNpcParam active=false` 幂等 ⇒ 玩家看不出） | 解析期 ⇒ 登记 `unknown-key`；求值 ⇒ `'unknown'`（**不静默通过**） |
| **CSC7** | **`activity` 的 `bool` 臂无视 `op`** | `NpcConditionHandler.cs:119-120` | `LTE` / `GTE` 写在 bool 值上 ⇒ **静默当相等**；【样本】`bool` **840 次**（最大的一族值类型） | `bool` 也经 `condition(op,…)`（布尔只允许 `=`/`NOT`，其余 ⇒ 解析期报错） |
| **CSC8** | **`activity` 的键没有层级语义** | `Activity.cs:82-86`（平键 `data.Find`） | ★**2026-10-18 实现期订正**（原写"多级下标 ⇒ 查不到"是**误判**）：`[...]` **就是平键的一部分**，不是层级 —— 【样本·剥注释口径】条件侧共 **1,025** 条 `activity` 子句，其中**键里带 `[...]`** 的 **947** 条（**92%**，如 `done[1]` / `twin[easy][max]` / `done[north][7][challenge_2]`）；动作侧 `setActivity` **按同一形状写**（全库 **603** 条里 **578** 条**写入键带括号**，**96%**，如 `<param>new_basic[easy][max]=30</param>`）⇒ 它们**读得到**。真正的畸形只在**值**侧：`done[new][6][skin]=[bool]false[skin]false` **2** 处（`10040.xml`，同一串出现两次），`[skin]` 不是 `[default]`，靠 `IndexOf("]")` 的**位置巧合**切出值 | 平键查找**照录**（键与值都按原串平比，**不判**"多级下标"）；**值**侧的分隔标记 ≠ `[default]` ⇒ **解析期登记 + `'unknown'`**（不靠巧合）。⚠️ 若照原写法实现会**误杀 92% 的 `activity` 门** ⇒ 见 `docs/map/map-impl.md §7.3.4` 偏差 ① |
| **CSC9** | **`random[new]` 用旧值出判定** | `NpcConditionHandler.cs:68-77` | `[old]` 与 `[new]` **判定完全相同**，差别只在推进 ⇒ 命名误导（读代码的人会以为"重摇后判定"） | **改名 `consume`**、保留 `new` 别名；**行为照录**（数据依赖） |
| **CSC10** | **纹章除 4 的位置在两条臂不同** | `Player.cs:32`（getter 里除）vs `NpcConditionHandler.cs:82-83`（现场摇后除） | 同一个纹章 ⇒ `[old]` 读的是**已除 4 的存储值**、`[a~b]` 是**现场值的 1/4**；两者语义本就不一样但**共用一个开关**，容易误读成"一处规则" | **一份规则、只在读侧**（CSI8）；范围臂显式说明"作用于摇出的值" |
| **CSC11** | `Pet.GetPetIdentifier` 的 `superSkill` 一臂**读错变量**（用 `trimNormalSkill`） | `Pet.cs:298-304` | 条件写 `firstPet.superSkill.position` 会读到 normalSkill 的残余 ⇒ **静默错值**。【样本】地图条件**未使用**该键 | **归 D6** 登记（本份只指过去，**不重复占号**） |
| **CSC12** | **空集 ⇒ `float.MinValue`**（一个"看起来像数字"的哨兵参与比较） | `Identifier.cs:129-130`、`:184` | `petBag(…)=0` ⇒ `MinValue == 0` **假**；`petBag(…)>0` ⇒ **假**；`petBag(…)<5` ⇒ **真**（哨兵比任何数都小）⇒ **"背包里没有"会同时满足一堆区间条件** | `count` ⇒ 真 `0`；裸键取空集 ⇒ `'unknown'`（§3.2 A14） |

### 7.2 待拍板（**CSQ1–CSQ4** · 本线局部编号 · 引用须带文档名）

| # | 问题 | 事实（可核） | **建议**（⚠️ 未拍板） |
|---|---|---|---|
| **CSQ1** | **`'unknown'` 的按钮级默认**：不触发（建议）还是"当作满足"？ | 上游四种编码并存（`op != "="` / `MinValue` / `0` / NRE，§3.3）；实测 `mission` 68 条**全在"任务未接"路径**上 | ✅ **建议 = 不触发 + 日志**。理由：地图的按钮**多为"满足条件才该出现"**，误触发比漏触发更伤（漏触发 = 玩家看到 NPC 没反应，可反馈；误触发 = 白送道具/提前战斗，难复现）。⚠️ 代价：**未落码期间会有"点了没反应"的图** ⇒ 需要日志能查 |
| **CSQ2** | **`random[new]` 是照录行为还是照录语义？** | §2.4 A1 + **CSC9**：判定用旧值、只推进序列 | **建议 = 行为照录（推进语义不变）+ 内部改名 `consume` + `new` 作别名**。⚠️ 这条**违反"不照搬上游命名"**的直觉，所以单独列：改语义会让**所有 `random` 图的通过率翻倍** |
| **CSQ3** | **`npc[..].color` 这条要不要保留？** | 【样本】**4 次 / 1 张图（`10017.xml`）**；语义 = "读**运行时 UI** 的 `Image.color`"（违反 MP3 headless） | **建议 = 保留语义、改读法** = `env.npcRuntime[id].tint`（**L1 维护的逻辑色**，由 `setNpcParam color=` 写入）。⇒ **1 张图的玩法门保住**，核心层不碰 UI |
| **CSQ4** | ⚠️ **`activity` 条件占 48%，而活动 = A 组出局 —— 怎么解？** | 【样本】`activity` **1,035** 条 / 64 个 id（⚠️ 本表为 **grep 口径**，权威 = 剥注释 **1,025**，见 §2.1 表后注），**全部命中 `info.csv`**；动作侧 `setActivity` **606** 次（grep；权威 **603**）；`door` **184**（= 门线入口）；`spt` 173（A 组） | ✅ **已拍板（人类 2026-10-18）＝ 建一个「会话/存档级**只存取键值袋**」`KeyValueBag<string>`**（activity id → 平键 → 字符串值），**只存取、不含活动逻辑**（没有开放时间、没有奖励发放、没有 UI）。⚠️ **落点补钉（只细化、不改裁定）**：这个袋子**存档里本来就有** —— `<activityStorage><Activity id=><data><entry><key><value>`（`docs/save/save-xml-spec.md §2.14`）；真机真档 `tools/fixtures/save-lite4.9.2-played.xml` 里有 **10 个** `Activity`（如 `noob` → `map=done`/`battle=done`）⇒ **读/写既有的 `activityStorage`、不开新字段**（不破 round-trip 保真）。**A5 求值 = 纯读**（见 **CSC3**）；**写侧 = `setActivity` 动作只写袋**（`docs/map/map-npc.md §7.2 MNQ2`）。⚠️ ~~本条不许按"常设指示"自动采纳~~（**2026-10-18 人类已明确拍板，不再设疑**）：它**紧挨** `docs/architecture.md §1.1` 的 **"A 组出局 13 项"** 与 **"A 组不许被别的线顺手实现"**（人类已决）⇒ 已由人类**明确**裁定：**键值袋 = 地图线的基础设施（允许）**，**且边界 = 只存取平键**（不实现活动玩法）。⚠️ 对 `docs/architecture.md §1.1` 的口径无改动（A 组仍出局；本条只是让 **48% 的条件**别恒 `'unknown'`） |

### 7.3 等人手测确认项（`AGENTS.md §1.1`：主验收 = 人手测；⚠️ 不写测试脚本）

> ✅ **2026-10-18 起本节的"落地后"= 已落码**（MB3），但**条件门要"点 NPC"才响** ⇒ 除第 1 条的**日志**外，
> **其余各条要等 MB4（动作）+ MB5（接线）**。届时看的是 `game/logic/map/condition-host.js` 送出的 `log.unknown` 与 NPC 的反应。

1. **【落地后 · CSC6】`1190.xml` 那条恒真分支**：进对应图 → 点该 NPC 走到那条 `<reply>` → ⚠️ **行为与上游"永远隐藏 119001"相反**（上游 `0=0` 恒真 ⇒ **永远执行**；我们登记 + `'unknown'` ⇒ **不触发**），
   且我们的日志里出现一条 `unknown-key: active`（**这正是改判的目击证据** —— 上游那条分支是"靠 `0=0` 蒙对的"，我们让它**显形**）。
   ⚠️ 这条**只看日志**：`setNpcParam active=false` 幂等 ⇒ 玩家**看不出画面差别**（上游也看不出）。
2. **【落地后 · CSC3】存档不被条件污染**：玩一段（点若干带 `activity` 条件的 NPC）→ **存档里 `activityStorage` 只含真正被 `setActivity` 写过的活动**，
   没有"只被读过就冒出来"的空条目。
3. **【落地后 · A5/CSC7】`bool` 条件**：找一条 `activity[door].done[bool]…` 的门（`door` 184 条最多）→ **满足才放行、不满足点不动**；
   若数据里出现 `bool` + `LTE`（畸形），应当**在加载日志里报错**而不是静默相等。
4. **【落地后 · A14/CSC12】进化链条件**：背包里**有/没有** `10010` 进化链的宠各测一次 `petBag(baseId[10010]:1).count=0` 那张图 →
   **前者不触发、后者触发**（易错点：`baseId[N]` 是"链上"，不是"id 等于"）。
5. **【落地后 · A3/CSQ3】10017 的铺路门**：铺**两块**路 → 点里奥斯进进化对话；铺**一块** → 出提示盒；**一块都不铺** →
   ⚠️ **上游在这里"点了毫无反应"**（CSC2 的 XOR 反了一半）；**我们改判后应当出提示盒** ⇒ **这条要人眼看**（父文档 MC 族的活样本）。
6. **【落地后 · CSI4】未落地的臂**：遇到 `mission` / `yite_rogue` / `plant.` 条件 → **不崩、不弹错**，NPC 不响应且日志有一条 `unknown`。
7. **【已结账 · 2026-10-18】口径核对**：§2.1 的**命名空间分布**（1,035 / 399 / 294 / 180 …）与 `docs/map/map-design.md §2.1` 的差额（**27 元素 / 29 子条件**）
   已查明**全在 `<!-- -->` 里** —— 本份是**不剥注释**口径、父文档是**剥注释**口径。✅ **人类拍板 = 注释直接忽略**（权威口径 = 剥注释，见本份 §2.1 的表后注）；**本表的数转为参考值**，不再逐格回改（保留是为了能一眼反查差额来源）。

---

## 8. impl 指针

- **前置**：**M1 `docs/map/map-data.md §3`**（现场解析器要产出 `conditions: string[]` 原样字段，**MDI10 = 解析器内零运行时求值**）
  → 本份的解析层才**有东西可切**。
- **接缝**：`MapEnv` 的装配点 = **运行时线 R3/R7** + **编排线**（`SceneData` / 会话）；`env.log.unknown` = **R5 sink** 的降级形态（日志，不弹窗）。
- **配对**：本份的 as-built 归 `docs/map/map-impl.md §7`（✅ **impl 已成文 2026-10-18**（`MIP1–MIP4` 四条已由人类 2026-10-18 结账）），**施工批 MDB3-a…e** 是其**条件节**的拆分依据（= 它 §2 的 **MB3**）。
- ⚠️ **`MDB3-b` 的 `MapEnv`** 与 **`MDB3-d`（A5 `activity` 臂）** 在 impl 里各带一条卡点：前者等域线/道具线/编排线的取值面；后者**已随 `CSQ4` 解阻**（**人类 2026-10-18 拍板**：键值袋**做** = **复用存档的 `<activityStorage>`**，见 `docs/map/map-impl.md §3.3 / §4 D9`）。
- **门禁**：本份**不发码**（阶段一 · `AGENTS.md §1`）⇒ 无新增测试；落地后验收 = §7.3 + 人手测。

---

## 9. 本份对父文档的回执（需同步的条目）

| 父文档位置 | 原写 | 本份实测 | 状态 |
|---|---|---|---|
| **§2.6 命名空间表** | `npc(<id>)` / `activity(<id>)` / `mission(<id>)` / `item(<id>)` **圆括号** | **全是方括号** `npc[<id>]`…；圆括号**只**用于 `petBag(...)` / `buff(...)` 过滤式（§2.3） | ✅ **已改** |
| **§2.6 `random` 行** | "`[old]` 用**存档里**那一个"、"纹章 200051 ⇒ 除数 4" | `random` 在 **`sceneData`（会话，不落盘）**；除 4 在 **getter** 里，**两条臂位置不同**（§2.4 A1 / §2.10） | ✅ **已改** |
| **§2.6 兜底那批** | `data.` **311** · `player.` **29** · `petBag` **31**；含 `plant.`/`animal.` | `data.` **399** · `player.` **31** · `petBag` **38**；`plant.`/`animal.` **各 0** | ✅ **已改**（并新增**实测定量**块） |
| **§6 MC1** | "一个含 `<` 的 value 会被切错" | 值侧仍含算子 = **0 / 2,160**、无算子 = **0** ⇒ **规则脆弱，不是正在发生的错误** | ✅ **已补定量** |
| **§6 MC5** | "条件的随机数会**写回存档**" | **写回会话键袋**；`GameData` 无 `random` 字段、`SaveSystem` 不碰 ⇒ **落地不需要 R4**（§2.10） | ✅ **已纠正** |
| **§5 MQ3 决议行**（`MapEnv` 字段） | `{…, rng}` + 写盘接缝 | `random` 是**会话态** ⇒ 只需要 `sceneData` + `rng`（更轻）；⚠️ **2026-10-18 实现期加宽**：`npcRuntime` 可缺省、`items.count` 与 `player.*` 允许 `'unknown'`、`rng` 多一个 `emblem?()`（§3.4 注） | ⚠️ **待父文档下轮合并**（本份 §3.4 已给条件侧切片 + 订正） |
| **§6 MC6/§7 CSC8 一类"多级下标"表述** | （若父文档也这么写） | ⚠️ **数据反证**：`activity` 平键里的 `[...]` **是常态**（读侧 **947 / 1,025** 条 · 写侧 **578 / 603** 条）⇒ **不判"多级下标"** | ✅ 本份 **CSC8 已就地订正** + as-built `docs/map/map-impl.md §7.3.4` 偏差 ① |
| **§7 待拍板** | — | **CSQ4** 触碰 A 组围栏 | ✅ **已决（2026-10-18）**：键值袋**做**（= 复用存档 `<activityStorage>`，**只存取平键**、无活动玩法）⇒ 不违围栏；**落点 = `docs/map/map-impl.md §4 D9`** |
| **§9.1 M3 行** | "6 算子 + 最左最先（MC1）、命名空间表 + 兜底、`MapEnv`（MQ3）、随机写回（MC5）、`data.` 键袋（MC6）" | 全部覆盖，另加 **§2.5 两份分派表**、**§2.10 副作用**、**§3.3 三值** | ✅ 本份成文 |
