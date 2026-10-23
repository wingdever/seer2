# 代码分析：重启的上游是怎么实现"秘技（隐藏技能）学习"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住**所在面板的子目录** `docs/view/panel/petbag/`，见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 它只把"上游到底怎么写、发行数据里能观察到什么"查清并钉死。
> **父 / 邻**：域线 D7 `docs/domain/domain-info.md`（`LearnSkillInfo` 的**编解码半边**归属 + **本族待拍板 ①**）· D5 `docs/domain/domain-skill.md`（`Skill` 本体）·
> 引擎线 E6 `docs/engine/battle-engine-session.md`（结算段 = 本报告的**唯一谓词调用点**）· 决议索引 `AGENTS.md §5`。
> 同族报告：`docs/view/panel/petbag/restart-petbag-panel.md`（**精灵背包面板**；其 §8 **A10** 补出了本报告 §5 的第 7 条入口）。
> **路径口径**：上游路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/Scripts/`；数据路径相对仓库根。
> **证据标注**：【实测】= 本文件里可复算的数字或可复跑的命令；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**，`docs/arch-docs.md §4.1`）⇒ §7 逐条登记；目标行为**待拍板的**在本文件写"待定 + 指针"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。

---

## 0. 一句话结论

**秘技不是一套独立子系统**。它就是宠物技能表第三列 `learnLevel` 的**高位编码**：

```
learnLevel = secretType * 10000 + value        // type=0 → 普通"等级到就学"
type ≠ 0 的那些条目 = 隐藏技能（秘技）          // 负数是两个特殊类型：-1 Others / -2 Auto
```

判定"这一场打完够不够条件学会它"的谓词有 **12 臂**（`MVC/Model/Basic/Skill/SecretSkillConditionHandler.cs:30-73`），
其中 **10 臂吃战斗结束时的 `BattleState`**（血量、回合、天气、buff、最后一击…），**2 臂吃存档计数**（胜场/败场），**1 臂查硬编码宠物名单**。

但上游一共有 **7 条**"学会一个技能"的入口，**其中只有一条真的调用那 12 臂**（战斗结算）。其余 6 条——包括**花 50 星钻的一键购买**、**背包面板上的"锻炼"一键满配**——**不看任何条件**直接学会。

---

## 1. 数据层【实测】

**表**：`Assets/Resources/Data/Pets/skill.csv` — 表头 `id,ownSkill,learnLevel`，**838 行**（不含表头），三列由
`PetSkillInfo`（`MVC/Model/Basic/Pet/Info/PetSkillInfo.cs:10` 的 `DATA_COL = 3`）切片，第 1/2 列是 `'/'` 分隔的整数表。

| 事实 | 数字 |
|---|---|
| 行数 | **838** |
| `ownSkill` × `learnLevel` 配对出来的**条目数**（按下标配对） | **6693** |
| 两列**长度不相等**的行 | **3**（`100649` / `100681` / `100704`：技能 6 个、学习值 5 个 ⇒ 见 §7 **A5**） |
| `learnLevel` 为**裸负数**的条目 | **536**（`-1` = Others **141** 条 · `-2` = Auto **395** 条） |

**解码**（`Basic/Skill/SecretSkillDatabase.cs:20-23`）：

```csharp
secretType = (learnLevel < 0) ? (SecretType)learnLevel      // 负数：整个数就是枚举值
                              : (SecretType)(learnLevel / 10000);   // 正数：高位是类型
value      = learnLevel % 10000;      // ⚠️ C# 取余保被除数符号 ⇒ -1 % 10000 = -1，不是 0
```

**编码**（反向，`Info/PetSkillInfo.cs:32`，用于 **Mod 导出**）：`((int)secretType) * 10000 + value` —— 与解码**不对称**，见 §7 **A1**。

### 1.1 解码后的实测分布（全 6693 条，逐型 value 范围）

| type | `SecretType` | 条数 | value min..max | 观察 |
|---|---|---|---|---|
| **-2** | `Auto` | **395** | -2..-2 | 60 级自动习得 |
| **-1** | `Others` | **141** | -1..-1 | "透过特别的方式习得" |
| **0** | `GreaterThanLevel` | **4995** | **0..100** | 含 **2** 条 `value=0`（哨兵撞车，§7 **A2**） |
| 1 | `WinFightNum` | 109 | **0**..50 | ⚠️ **3 条 `value=0`** ⇒ 直接落进 `isAutoLearned`（§7 **A2**） |
| 2 | `LoseFightNum` | 66 | 5..10 | — |
| 3 | `MeHaveBuff` | 235 | 1..**3723** | value = buff id（文案要查 buff 表，§6） |
| 4 | `OpHaveBuff` | 197 | 1..**3576** | 同上 |
| 5 | `LessThanHp` | 153 | **5**..100 | ⚠️ 形状上 `value=0` 会除零；**发行数据未踩**（min=5）⇒ 潜伏，§7 **A3** |
| 6 | `EqualTurnNum` | 46 | 1..10 | — |
| 7 | `AtWeather` | 89 | 1..14 | value = 天气 buff id |
| 8 | `UseSkill` | 194 | 4..**5224** | 比较的是 `10000 + value` 这个技能 id |
| 9 | `GreaterThanDamage` | 40 | **950..9999** | 伤害门槛 |
| 10 | `SpecialPet` | 33 | **1..16** | ⚠️ 硬编码名单下标合法域 **0..16**；**发行数据未踩 0 与越界** ⇒ 潜伏，§7 **A4** |

**样例**（`game/data/unity/pets.json` 里的宠物 990，说明数据桥**原样照搬**了两列）：
`skillIdList` 17 个 / `learnLevelList` = `1,5,…,60,10000,10000,10000,100009`
⇒ 前 13 条是等级型，中间 **3 条 type=1 value=0**，最后一条 **type=10 value=9**（名单第 9 组 = `{990, 1990}`）。

### 1.2 数据桥现状【实测】

`tools/build-unity-data.mjs:291` 已经把 `learnLevelList` 原样搬进 `game/data/unity/pets.json`（`pets[i].skills.learnLevelList`），
**包括那 3 行长度不匹配**（桥不修，错位留给消费端 ⇒ 与上游行为一致）。**域侧代码至今 0 处引用**（`grep -rl "SecretType\|LearnSkillInfo\|learnInfo" game/core/` ⇒ **空**）。

---

## 2. 解码层：`LearnSkillInfo` 与那个关键的短路

`MVC/Model/Basic/Skill/SecretSkillDatabase.cs`（83 行）里的 `LearnSkillInfo` = `{ skill, secretType, value }` + 两个派生入口。

⚠️ **整个秘技机制最要紧的一行**（`:11`）：

```csharp
public bool isAutoLearned => (secretType == SecretType.Auto) || (value == 0);
//                                                    ↑ 把"value==0"当成"自动学习"的哨兵
```

`value == 0` 被读成"这条不需要条件" ⇒ 于是一条**本该是"获得 0 场胜利"**的秘技（type=1, value=0）会：
① 被等级流程在 60 级白送，② 说明串显示 **"60级自动习得"** 而不是"获得 0 场对战胜利"。
【实测】发行数据里真有 **3 条**这种（宠物 `990` 的 `13134`/`13135`/`13136`）⇒ 见 §7 **A2**。

`SecretType` 共 **13 值**：`Auto=-2`、`Others=-1`、`GreaterThanLevel=0`、`WinFightNum=1`、`LoseFightNum=2`、`MeHaveBuff=3`、
`OpHaveBuff=4`、`LessThanHp=5`、`EqualTurnNum=6`、`AtWeather=7`、`UseSkill=8`、`GreaterThanDamage=9`、`SpecialPet=10`。
`Condition` 的 `switch` 表达式**兜底臂 = `_ => this.GreaterThanLevel`**（`:40`；文案那支 `GetLearnDescription` 同形状，`:62`）
⇒ **任何非法枚举值都退化成"等级 ≥ value"**（A1 的后果就是从这一行来的）。

---

## 3. 集合层：`PetSkill` 把技能切成几堆

`MVC/Model/Basic/Pet/Components/PetSkill.cs` —— 存档里只存**三个 int 数组**，其余全是**每次现算的属性**：

| 集合 | 存不存 | 怎么算 | 上游 |
|---|---|---|---|
| `ownSkillId` | ✅ 存档 | 已习得 | `:13` |
| `normalSkillId` | ✅ 存档（**定长 4**） | 出战的一般技能 | `:14` |
| `superSkillId` | ✅ 存档 | 出战的必杀 | `:15` |
| `info.skillList` | ❌ | 沿**进化链**（`PetExpSystem.GetEvolveChain`）把每个形态的技能表**串起来** | `Info/PetSkillInfo.cs:40-51` |
| `info.learnInfoList` | ❌ | `skillList.Zip(learnLevelList, …)` ⇒ **Zip 以短的那条为准**（A5） | 同上 `:65-67` |
| **`secretSkill`** | ❌ | `learnInfoList.Where(x => x.secretType != GreaterThanLevel && x.secretType <= SpecialPet)` | `:51` |
| **`secretSkillInfo`** | ❌ | 把上面那堆 id 再回查一次 `learnInfoList` | `:52` |
| `backupNormalSkill` | ❌ | 已学 − 出战 | `:42` |

**两处值得钉住的形状**：

1. **秘技集合的定义式是"不是等级型、且类型 ≤ 10"** ⇒ 于是 **`Auto(-2)` 和 `Others(-1)` 都算隐藏技能**，
   会出现在隐藏技能面板里；其中 `Auto` 还**能被 50 星钻一键买**（一键买只排除 `Others`，§5 路径 3）。
2. **`Others` 有两个来源**，不是一条：
   - 表里写的**裸 `-1`**（【实测】141 条）；
   - **运行时合成**：`GetLearnSkillInfos(skillId)` 在 `learnInfoList` 里**查不到**这个已拥有技能时，`return new LearnSkillInfo(Skill.GetSkill(skillId), -1)`（`:91-93`）
     ⇒ 注释原话 *"Cannot find info but own it => SecretType.Others"*。进化搬来的、Mod 加的、注入的技能都从这里被认成"特别方式习得"。

---

## 4. 谓词层：12 臂逐臂真值

`Condition(Pet pet, BattleState endState)`（`Basic/Skill/SecretSkillDatabase.cs:26-43`）→ 臂体全在
`Basic/Skill/SecretSkillConditionHandler.cs`（静态扩展方法，**同文件 `:9-28` 还硬编码了一张 17 项的宠物名单**）。

| 臂 | 上游表达式（原文） | 真值来自 | 风险 / 备注 |
|---|---|---|---|
| `0 GreaterThanLevel` | `pet.level >= value` | **存档·成长** | 也是 **兜底臂**（非法类型落这里） |
| `1 WinFightNum` | `pet.record.winFightNum >= value` | **存档·战绩** | `value=0` 撞 `isAutoLearned`（A2） |
| `2 LoseFightNum` | `pet.record.loseFightNum >= value` | **存档·战绩** | 文案是"累计 N 场失败**后首次击败**对手"，谓词只管计数 |
| `3 MeHaveBuff` | `endState.myUnit.pet.buffController.GetBuff(value) != null` | 引擎·战斗末态 | 我方身上有 buff `value` |
| `4 OpHaveBuff` | `endState.opUnit.pet.buffController.GetBuff(value) != null` | 引擎·战斗末态 | 敌方身上有 buff `value` |
| `5 LessThanHp` | `endState.myUnit.pet.hp <= (endState.myUnit.pet.maxHp * 1f / value)` | 引擎·战斗末态 | **`value==0` ⇒ 除零 ⇒ `Infinity` ⇒ 恒真**（A3） |
| `6 EqualTurnNum` | `endState.turn == value` | 引擎·战斗末态 | **相等**，不是 `>=` ⇒ 第 4 回合赢的判"第 3 回合"条件不成立 |
| `7 AtWeather` | `endState.weather == value` | 引擎·战斗末态 | 天气 id 相等 |
| `8 UseSkill` | `endState.myUnit.skill.id == (10000 + value)` | 引擎·战斗末态 | 读的是**结算瞬间那一个技能**（`myUnit.skill`），**不是整场用过的集合** |
| `9 GreaterThanDamage` | `endState.myUnit.skillSystem.totalSkillDamage >= value` | 引擎·战斗末态 | `totalSkillDamage` 的口径属引擎（`docs/engine/battle-engine-units.md`） |
| `10 SpecialPet` | `名单[value]` × `endState.myUnit.petSystem.petBag.Any(y => y != null && y.id == x)` 再 `.All(…)` | 引擎·**全队** | 语义 = **名单里每一只都得在本次战斗的队伍里且活着**；下标越界 ⇒ 空表 ⇒ `All` **恒真**（A4） |
| `-1 Others` | `(p, s) => false` | — | 谓词**恒假** ⇒ 只能靠非战斗途径学会 |
| `-2 Auto` | `(p, s) => true` | — | 谓词**恒真**（还有一道调用方的 60 级门，§5 路径 2） |

**⇒ 入参其实裂成三族**：纯成长/存档（臂 0/1/2）、战斗末态（臂 3–10，共 **8 臂**，且**全部**是引擎子系统）、无参（`Auto`/`Others`）。
这条分裂正是 D7 **本族待拍板 ①**（`docs/domain/domain-info.md §8` 末）的对象；本文件只把真值查清，**不在这里定形状**。

**一条容易漏的前提**：谓词**只在"我方胜利"时被调用** —— `Scene Specific/Battle/BattleResult.cs:94-97`：

```csharp
if (!isMyWin) { SaveSystem.SaveData(); return; }   // 败局 / 无胜负 → 后面的 SetTalent / SetExp / SetSkill 全不跑
```

⇒ 文案里那串"…时击败对手"在机制上是**冗余的**（不赢根本不会问）。同时 ⇒ **捕捉成功也走同一道早退**（`:99-106`），
所以**捕捉胜利不跑秘技判定**（这条与引擎 E6 的待拍板 **PD3** 是同一件事，见 `docs/engine/battle-engine-session.md`）。

---

## 5. 触发层：七条"学会技能"的入口【源码逐条】

| # | 入口 | 调用点 | 判不判那 12 臂 | 门槛 |
|---|---|---|---|---|
| **1** | **等级流程** `PetSkill.CheckNewSkill(level)` | `Components/PetSkill.cs:98-118`；被 5 处调：构造 `:63` · 升级 `Pet.cs:562` · 降级 `Pet.cs:581` · 进化 `Pet.cs:623` · **读档版本迁移** `Pet.cs:711` | ❌ **不判** | 只放行 `secretType == GreaterThanLevel \|\| isAutoLearned`，再要 `level >= (isAutoLearned ? 60 : value)` |
| **2** | **战斗结算** `BattleResult.SetSkill(endState)` | `Scene Specific/Battle/BattleResult.cs:110` → `:206-226` | ✅ **唯一判谓词的路径** | 三重门：`isMyWin`（`:94`）· **只发给上场那一格**（`endState.myUnit.petSystem.cursor`，**不是**全部参战宠）· `pet.level < 60 ⇒ return`（`:213-214`） |
| **3** | **50 星钻一键购买** | `MVC/Controller/Pet/Basic/PetSecretSkillController.cs:48-75` | ❌ **不判**（面板只让你看条件文案） | 排除 `Others`；扣 `Item.DIAMOND_ID` 50；**入口另有一道 60 级门**（`PetCurrentSkillController.cs:31-37`，文案"精灵达到60级才能学习隐藏技能"） |
| **4** | **进化保留** `Pet.EvolveTo` | `MVC/Model/Basic/Pet/Pet.cs:607-629`（筛选在 `:615`） | ❌ | 把"不在新形态技能表里"或"表里标 `Others`"的已学技能**逐条 `LearnNewSkill` 搬给进化体** |
| **5** | **伊特肉鸽开局** `GetStartPet` | `MVC/Model/Basic/YiTeRogue/YiTeRogueChoice.cs:58-64` | ❌ | `foreach (var skill in pet.skills.secretSkill) LearnNewSkill(skill)` ⇒ **开局直接全学会全部秘技** |
| **6** | **满配 / 退化 / 注入** | `Pet.cs:100-125`（`GetExamplePet` → `LearnAllSkill()`）· `Pet.cs:657-663`（退化选形态）· `Pet.cs:460-463`（标识符 `skill`/`skill+`/`skill-`） | ❌ | `LearnAllSkill()` 连 `info.skillList`（进化链全集，含秘技）都一次学完 |
| **7** | **PVP 赛前满配** `RoomManager` 的出战副本 | `Scene Specific/Room/RoomManager.cs:65-94`：`Player.instance.petBag.Take(petCount)` → `new Pet(x)`（**副本**）→ 改等级/清空 `record` → **`Pet.ToBestPet(副本, iv)`**（`Pet.cs:130-146`） | ❌ | `ToBestPet` 把 `info.skills.skillList` 里**所有未学者逐条 `LearnNewSkill`**（`:140-144`）⇒ **进化链全集含秘技**；`iv` 按房间 buff 取 `31` 或 `120`（`:94`）。⚠️ 作用在**副本**上 ⇒ **不污染存档本体**，但 PVP 里每只宠都"天生会全部秘技" |

> ⚠️ **计数勘误**（2026-10-17，由 `docs/view/panel/petbag/restart-petbag-panel.md §8 A10` 报出）：本表原本只有六条。
> 补第 7 条时顺带查实：**背包面板上那个"锻炼"按钮并不走这条链** —— prefab/scene 里绑的是 `PetBagController.SetPetTrain`
> （`Assets/Resources/Panels/PetBag/Prefabs/Pet Bag Button Group.prefab:932`、`Assets/Resources/Panels/OldPetBag/Panel.prefab:7359`；⚠️ 这两条路径相对 `Assets/`，不是本文件的 `Assets/Scripts/` 口径），
> 而那个方法（`MVC/Controller/Panel/PetBagController.cs:126-131`）**只互换两块 UI 的显隐**。
> 真会满配的 `PetBagController.ToBestPet(Personality)`（`:133-142` → `PetBagModel.cs:103-114` → `Pet.ToBestPet`）**没有任何绑定/订阅方**
> （【实测】`onSelectPersonalityEvent += ToBestPet` 全仓不存在，prefab 里无 `ToBestPet`）⇒ **死链**，其"锻炼成功！"弹窗（`PetBagView.cs:32-37`）也就永远不会弹。
> ⇒ `Pet.ToBestPet` 在**发行版里唯一活着的调用点**就是上面第 7 条（PVP 赛前）。

**由这张表得出的结论（【推断】，但直接来自源码）**：
秘技的"条件"在机制上是**可花钱跳过、可开局白送、可进化继承、可赛前满配**的软约束；
谓词只决定**不花钱的那一条路**上"这一场打得算不算数"。⇒ 移植时**只搬 Condition 而不搬这七条入口**，会得到一个比上游更严格的游戏。

**硬编码 `60` 在秘技链上一共出现四处**（【实测】grep）：`PetSkill.cs:102`（`isAutoLearned` 的等级门）· `BattleResult.cs:213` · `BattleResult.cs:126`（战绩计数同样卡 60，⇒ **未满 60 级的宠根本不计胜场**，A7）· `PetCurrentSkillController.cs:31`。

---

## 6. 呈现层

- **条件文案** = `learnDescription` → `GetLearnDescription()`（`Basic/Skill/SecretSkillDatabase.cs:45-63`，同一 `switch` 形状）→
  `Basic/Skill/SecretSkillDescriptionHandler.cs:28-78` 的 13 臂文案。`isAutoLearned` **先短路**（`:46`）⇒ A2 那 3 条显示"60级自动习得"。
- **两份必须同长同序的硬编码**：判定用 `specialPetIdList`（`SecretSkillConditionHandler.cs:9`，**17 项**）·
  文案用 `specialPetNameList`（`SecretSkillDescriptionHandler.cs:7`，**17 项**）⇒ 索引即语义，**两张表分开住在两个文件**（A9）。
- **面板**：`PetSecretSkillModel.cs:15` 把 `secretSkillInfo` 全量塞进列表（含已学的）；`PetSecretSkillView.cs:11-14` 逐格画技能 + `learnDescription`。
- **战斗结算展示**：`BattleResult.cs:16` 的 `learnedSecretSkills` → `BattleSystemView.cs:89-94` 判断要不要弹 →
  `BattleResultView.cs:32-33` `ShowNewSkill(...)` **显示完立刻 `Clear()`**。

---

## 7. 怪癖 / bug 登记（**声明**；目标行为另议）

> 政策 = **人类决议 ②**：登记要写**① 上游怎么写** ② 我们怎么写、为什么。① 全部在本节写实；
> ② 未拍的**指向未决项**（D7 **本族待拍板 ①** / `totalk.md`），**不记死账**。
> ⚠️ 与 **V2**（数据错字 ⇒ **照搬**，`docs/domain/domain-design.md §1`）分工不同：下面 **A5** 属数据侧 ⇒ **照搬**；**A1–A4** 属代码逻辑 ⇒ **声明 + 不照搬**。

| # | 上游怎么写 | 发行数据里的**可观察后果** | 类型 | 我们怎么写 |
|---|---|---|---|---|
| **A1** | 解码：负 `learnLevel` 直接当枚举值（`SecretSkillDatabase.cs:22-23`）；编码：`secretType*10000 + value`（`Info/PetSkillInfo.cs:32`）⇒ **两边不对称** | Mod 导出再读入：`Others` 变 `-10001` ⇒ `secretType` 非法 ⇒ **落兜底臂 = `level >= -1` ⇒ 恒真**，文案变 **"等级达到-1级"**，且**可被 50 星钻一键买**；`Auto` 变 `-20002` ⇒ **60 级不再自动学**，改成"打赢一场即学" | **代码逻辑 bug** | 目标 = **编解码往返闭合**（D7 **B4** 已定"只改编码侧、解码侧一行不动"，见 `docs/domain/domain-info.md §3.3`） |
| **A2** | `isAutoLearned => (secretType == Auto) \|\| (value == 0)`（`SecretSkillDatabase.cs:11`）⇒ 把 `value==0` **当"自动学习"的哨兵** | 【实测】**3 条**真踩到：宠物 `990` 的 `13134/13135/13136`（type=`WinFightNum`, value=0）⇒ 60 级白送 + 文案"60级自动习得" | **代码逻辑 bug**（误当哨兵） | 目标 = 判"是否自动学"**只看类型**，不许看 `value` ⇒ 与 D7 **本族待拍板 ①** 同轮定 |
| **A3** | `LessThanHp` = `hp <= maxHp * 1f / value`（`SecretSkillConditionHandler.cs:51`）⇒ `value==0` 除零得 `Infinity` | 【实测】**发行数据未踩**（type5 的 value min=5）⇒ 潜伏；一旦有 `x0000` 型条目即恒真 | **代码逻辑 bug** | 目标 = `value <= 0` 视为**不成立**，并把它列成**等人手测/等内容表确认**的具体项 |
| **A4** | `SpecialPet` = `specialPetIdList.Get(value, new List<int>())` 再 `.All(…)`（`SecretSkillConditionHandler.cs:70-73`）⇒ **下标越界得到空表，空表的 `All` 是 `true`** | 【实测】**未踩**（type10 的 value ∈ 1..16，合法域 0..16）⇒ 潜伏；**且 `value=0` 那条空名单也会恒真** | **代码逻辑 bug** | 目标 = 空名单 ⇒ **不成立**（而不是放行） |
| **A5** | `skillList.Zip(learnLevelList, …)`（`Info/PetSkillInfo.cs:66`）⇒ **长度不等时静默截断** | 【实测】**3 行**：`100649`/`100681`/`100704`（技能 6 个、学习值 5 个）⇒ 这 3 只的第 6 格技能**永远没有学习条件**；若因别的原因拥有它，会被 §3 的合成分支认成 `Others` | **数据侧错字** | **照搬**（V2 / `docs/arch-docs.md §4.1` 下半：静默兜底是行为不是 bug）；数据桥已原样保留两列 ⇒ 只需在文档里写明后果 |
| **A6** | 战斗结算**只发给 `endState.myUnit.petSystem.cursor` 这一格**（`BattleResult.cs:207`），而经验/EV/战绩走 `DoWork(fightPetCursors)`（`:228-229`） | 【推断】**换人获胜时，没上场的后备宠拿不到秘技**（其余奖励照发） | **待判**：设计还是疏漏 | 先按上游照搬 + 列成**人手测确认项**（§8） |
| **A7** | `SetRecord` 里 `pet.level < 60 ⇒ return`（`BattleResult.cs:126-127`）⇒ **胜/败场计数只统计 ≥60 级的宠** | 【推断】升级途中**不积累胜场** ⇒ `WinFightNum`/`LoseFightNum` 型秘技的实际节奏远慢于文案暗示 | **待判**：设计 | 列成**人手测确认项**（§8） |
| **A8** | 秘技集合式含 `Auto`（`Components/PetSkill.cs:51` 的 `!= GreaterThanLevel && <= SpecialPet`）；一键买只排除 `Others`（`PetSecretSkillController.cs:50`） | 【实测】395 条 `Auto` **既在面板里、又能花 50 星钻买** —— 而它们本来 60 级就自动送 | **待判**：产品口径 | 先照搬；**面板/付费那支属 View + Item 线**，本文件只记事实 |
| **A9** | 名单判定与名单文案是**两个文件里的两张硬编码表**，靠下标对齐 | 两张各 17 项（【实测】对齐），但**任一处增删都会静默错位** ⇒ 文案说"风伊特、电伊特、冰伊特"而判定放行另一组 | **脆弱结构** | 目标 = **一张表两个字段**（id 组 + 名字）⇒ 归 D7 **B4** 的数据/常量决定 |

---

## 8. 待人手测确认的具体项（不许记死账 —— `AGENTS.md §1.1` / 决议 ⑦）

1. **A6**：一只 ≥60 级宠在**替补席**上、换人后获胜，结算界面有没有弹出它的秘技？（预期：没有）
2. **A7**：把一只宠从 55 级练到 65 级打赢若干场，图鉴/面板里的"胜场数"是从 55 起算还是从 60 起算？
3. **A2**：宠物 **990**（约瑟/奎尔斯那条线）的三个 `13134/13135/13136` 在隐藏技能面板里显示的是"60级自动习得"还是"获得 0 场对战胜利"？
4. **A5**：`100649` 那只宠的**第 6 格技能**在游戏里以什么身份出现（不可学 / 显示"透过特别的方式习得"）？
5. **A8**：给一只 60 级、含 `Auto` 秘技的宠花 50 星钻一键买，扣钱与提示文案是什么？
6. `6 EqualTurnNum` 用的是 **`==`**：第 N 回合**击败**才算，还是第 N 回合结束时才算？（谓词读 `endState.turn`，是**末态**值）

---

## 9. 对移植的影响（只指路，不在此定案）

- **域线归属**：`LearnSkillInfo` 的编解码 + `SecretType` + 说明串 = **D7**（`docs/domain/domain-info.md §2` 接缝表、施工批 **B4**）。
- **谓词形状** = D7 **本族待拍板 ①**（`docs/domain/domain-info.md §8` 末）；本文件 §4 那张"三族入参"表就是它的证据底座。
- **调用时刻**（`isMyWin` 早退 / 只发上场一格 / 60 级门）= **引擎 E6 结算段**（`docs/engine/battle-engine-session.md`，其 **PD3** 与本文件"捕捉不判秘技"同源）。
- **`endState.turn` / `totalSkillDamage` / `buffController` 的口径** = 引擎 E1/E3/E4（**域不许自己解释这些数怎么来的**）。
- **一键购买 / 面板** 属 **View + Item 线**（Item 族未立，同 `totalk.md` **T1** 卡住的原因）。
- **肉鸽开局全学**（§5 路径 5）与 **PVP 赛前满配**（§5 路径 7）目前**没有任何一份 design 提过** ⇒ 若移植要覆盖 YiTeRogue / PVP，需要新登记归属
  （两者的证据底座见 `docs/view/panel/petbag/restart-petbag-panel.md §2`、`§8 A10`）。
