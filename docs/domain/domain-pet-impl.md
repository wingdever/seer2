# 域模型 · D6 宠聚合 —— 施工 impl（domain-pet-impl.md）

> **定位**：`docs/domain/domain-pet.md`（D6 设计，已写待评审）的**配对 impl**。
> 只回答"**怎么落码**"：文件 → 代码、施工批 B1–B7 的逐批触达与验收、注入接缝的装配点、请人测项。
> **真值/目标行为一律以 design 为准**（本份只引用不重复）；冲突以更细/更专的 `domain-pet.md` 为准。
> **父文档**：`docs/domain/domain-design.md`（D0：边界 / V1–V7 / 族图）。**代码分层** = `docs/arch-code.md §3.1`（L0）。
> **人类决议索引** = `AGENTS.md §5`；本份反复引用的 ①–④ 见 design §7 末（RNG/时钟走运行时线、`per`/`percentage` 声明+修、写侧上移=R3/R4/R5 接口、skin 三表建桥）。

---

## 1. 这份文档回答什么

1. D6 的 **10 个目标文件**（design §3.1）分别落到 `game/core/pet/` 下哪个 `.ts`，依赖方向。
2. 施工批 **B1–B7**（design §3.4）逐批的**触达 / 前置 / 解锁 / 验收**。
3. `PetEnv`（design §3.2）七张静态表 + R1–R5 五个运行时接缝的**装配点**（谁注入、注入什么）。
4. 哪些批**直接解锁 S5 / S6 / set_pet / set_player**（本份的存在理由）。
5. 验收口径 + 请人测项（决议 ⑦：golden 只答"数字回归"，对不对靠人类手测）。

---

## 2. 文件 → 代码映射（design §3.1 的落地面）

| design 文件 | 落点 | 新建/改 | 依赖方向（V7：禁反向依赖引擎） | 说明 |
|---|---|---|---|---|
| `pet.ts` | `game/core/pet/pet.ts` | **新建** | → `basic/exp/feature/talent/resist/skills/record/ui`、`../status` | `class Pet` + 4 构造器 + 23 转发属性 + 三面状态 + identifier 的 L3 + 升级/进化家族 |
| `basic.ts` | `game/core/pet/basic.ts` | **新建** | → `../table`（D7 注入） | `PetBasic` + `enum Personality`(55) + `hashId` |
| `exp.ts` | `game/core/pet/exp.ts` | **新建** | → D7 `PetExpSystem` 三函数（经 `PetEnv`） | `PetExp`（钳位 getter / `GetMaxLevel` / `GainExp` / `LevelDown`）—— **S5 `gainExpPerPet` 的消费方** |
| `exp-system.ts`（公式体） | `game/core/pet/exp-system.ts` | ✅ **已落码 + golden** | 无（纯函数） | `PetExpSystem` 三函数**公式体**（`getLevelExp`/`getTotalExp`/`getLevelByTotalExp`）；D7 注入面（`PetEnv`）later 接上它。**as-built 2026-10-18**：490 条 `petexp` 向量（level 0–110 × {level,total} + bytotal 散点 × expType{0,1}）对拍 `不一致=0`，float 收窄逐值一致 |
| `feature.ts` | `game/core/pet/feature.ts` | **新建** | → D7 `GetFeatureInfo`、D2 `Status`、D4 `BuffInfo` | `PetFeature` + `GetExtraStatus` + `SetTrait` |
| `talent.ts` | `game/core/pet/talent.ts` | **新建** | → D7 `IVRanking` | `PetTalent`（`ev` 索引器 / `SetEVStorage` / `IVRank`）—— **S5 `gainEVStoragePerPet` 的消费方** |
| `resist.ts` | `game/core/pet/resist.ts` | **新建** | → D4 `Buff` | `PetResist` + `GetResistBuffs`（`-2005`）；含 **CB3**（`per`→`percentage` 收敛，声明+修） |
| `skills.ts` | `game/core/pet/skills.ts` | **新建** | → D5 `Skill` / `LearnSkillInfo` | `PetSkill`（三组读写器 + `Learn*/Remove*/Get*/Swap*`）—— **S5 `SetSkill`/学习支的消费方** |
| `record.ts` | `game/core/pet/record.ts` | **新建** | → D1 `IKeyValuePair`/`Linear`（`linear.ts` 已落地） | `PetRecord`；含怪癖 §7 条 9（读虚拟键/写只进 dict 的不对称） |
| `ui.ts` | `game/core/pet/ui.ts` | **新建** | → D7；Sprite 臂 `NOT_PORTED` | `PetUI`（`skinId` 兜底 / 三 `Info` 读 / `hashId`） |
| `identifier.ts` | `game/core/pet/identifier.ts` | **新建** | 被 `pet.ts` 用 | `petGetIdentifier` / `petSetIdentifier`；**S1 围栏摘除在此进行** |
| `env.ts`（接缝聚合） | `game/core/pet/env.ts` | **新建** | — | `PetEnv` 接口 + `setPetEnv`/`petEnv`（对齐 `buff-info.ts` 的 `setBuffHost` 形态） |

> **不动**的既有 6 件：`status.ts`(D2) / `status-controller.ts`(D2) / `buff-controller.ts`(D4/E3) / `element.ts`(D2) / `linear.ts`(D1) / `skill-controller.ts`(E3 持有者)。
> ⚠️ `SkillType` 地雷（design §3.1 末）：`pet/skill-controller.ts:17` 已从 `core/battle/damage.ts` import，`skills.ts` 又要 `Skill` ⇒ **D5 B1（`SkillType` 下沉）必须先于本族 B3**。

---

## 3. 施工批 B1–B7（design §3.4 的落地细化）

| 批 | 内容 | 触达（新建/改） | 前置 | 解锁 | 验收 | 细化 |
|---|---|---|---|---|---|---|
| **B1** | **六张宠表进 oracle**（决议 a：同步复刻 GetPetInfo 组装体，非 D7 生成物），替掉 `EnsurePetInfo` 反射合成；**skin 三表桥（hit/sound/transform，决议④）本轮未接** | 改 `tools/oracle-cs/Boot.cs`（新增 `LoadPetTables()`：读 `Pets/{basic,exp,feature,skill,ui,card}.csv` → 反射调上游 `GetPet*Info` 解析器 → 按 coroutine 本体逐宠组装 `PetInfo` 写 `petInfoDict`）、`Program.cs:755` 的 `EnsurePetInfo` 改兜底（`petInfoDict` 已有则跳过合成）；`InfoIds`/`PetInfoT` 可见性改 `internal` | 6 张 CSV 在 `projects/.../Assets/Resources/Data/Pets`（已确认）；**skin 三表桥留待 B1 后续**（离线无 `Application.persistentDataPath`，hit/sound/transform 5 张羁绊 XML 同理）| ✅ **S6 宠表已进 oracle**：`petInfoDict=838`（与 D7 `pets.json` 同数），`Database.GetPetInfo(真实id)` 返回非 null；kizuna 留 default（边角，S5/S6 不读）| ✅ `node tools/difftest.mjs` 无回归（不一致=0、架子没对上=0）；oracle `dbprobe` 确认 `petInfoDict=838`；S6 的 `pet.<x>` 真值 / S5 的 `gainExpPerPet` 现可接真消费方 | 要点级 |
| **B2** | **9 件对象形状** + `Pet(Pet)` 深拷贝 + `Pet()` 全 null 形状 + `Personality` 55 枚举 | 新建 §2 的 9 个 `.ts` + `env.ts` | B1 | S5/S6 的**数据载体**；`set_pet` 的落点 | `node --test game/core/pet/`：拷贝往返、null 形状、枚举 0..54 全覆盖 | 要点级 |
| **B3** | **三面状态**（`normalStatus`/`extraStatus`/`initBuffs` + `status.{init,extra,battle,personality}.*`）| 改 `pet.ts`（调 `status.ts:270 getPetNormalStatus`/`:218 getPersonalityBuff`，已落地只差持有者）| B2 + **D5 B1** + D2/D4 | S5 结算的**数值底座**（`normalStatus.hp` 供 `SetBasic`）| 新 kind **`petstat`**：oracle `BuildPet` 起真 `BattlePet`，两侧读同一组 `status.X`（design §6：`BuildPet` 已在 `Program.cs:772-861`）| 要点级 |
| **B4** | **L3 有真实命中的臂**（`weight`/`height`/`baseId`/`kizuna`/`element`/`subElement`/`normalSkill[..]` + 表内可定的平键）；逐支摘 `identifier-effect.ts:691-730` 围栏 | ✅ 已落（`pet.ts.getPetIdentifier` + 私助 `getSkill`；未拆 `identifier.ts`、未动 `parser/identifier-effect.ts` 围栏——围栏摘除随 B5 起 petid 向量时逐支做）；`PetEnv` 增 `getSkill` 缝 + `PetInfoLike` 字段 | B3 | `pet.<x>` 读侧真值 ⇒ **set_pet/set_player 的标识符面** | 新 kind **`petid`**：发行数据里的真实表达式做向量，逐支摘、逐支 golden（**留 B5**） | 要点级 |
| **B5** | **零命中臂**（合成向量）+ **`SetPetIdentifier` 23+1** + 升级/进化家族 + 扩 `petmut` | 改 `pet.ts`（`SetPetIdentifier` 23+1 写侧 + 升级/进化家族 + 三面状态修正）、`pet-info.ts`（`petInfoFromUnity` 补 `generation`/`skinId` + `Buff` 护栏）、`exp.ts`（`PetExp.level` 默认 1→0）；oracle `Program.cs` 扩 `petid`/`petstat` dispatch + `petmut` 增 `setid` 算子；`difftest.mjs` 注入 `petEnv`（pets.json 838 + getSkill + getLevelExp + evolveChain 游 walk）| B4 | **S5 的 exp/level/evolve 写入面**；`set_pet` 的写侧 | ✅ 已落（见 §8 as-built）：`petid`/`petstat`/`petmut-setid` 三类 golden 向量已接、`difftest` 绿（不一致=0）；不可比臂（见下）已排除并登记为等人手测确认项 |
| **B6** ✅ | **N 支**（`Pet(int,…)`/`GetExamplePet`/`SetTrait(0)`/`GetRandomPetInfo`）——照常实现，随机走 R1、时钟走 R2 | 改 `pet.ts`/`feature.ts` | B2 | 建宠/进化/洗特性真跑 | ① 同 seed 自复现 + ② 形状断言（区间端点/钳位/字段齐全）+ ③ **人类手测**（决议 ①：不追求与上游逐值）| 要点级 |
| **B7** ✅ | **忠实 `BattlePet : Pet`**（移植 Unity `Battle/BattlePet.cs`）替掉 `hostPetView.js` 的 `HostPet`/`FakePet`；域 `Pet` 经 `petEnv` 接缝接到**运行时**（此前只接在 difftest）；数据来源由 AS3 `content.petConfig` 切到 D7 `unity/pets.json` | 新建 `game/core/battle/battle-pet.ts`（忠实 `BattlePet extends Pet`，18 个 `BattlePetView` 成员名不变）；改 `coreBattleDriver.js`（去 `makeHostPet`/`petConfig`/`normalStatusOf`，改 `new BattlePet(new Pet(...))`）；改 `content.js`（`wirePetEnv()` 在 `boot()` 注入 `petEnv`）；删 `hostPetView.js`（已无引用）；附修 `pet-info.ts`（补 `name`）+ `basic.ts`（`PetBasic` 读 `baseId`/`name`，修 name/baseId 回归） | B4–B5 + E3 | 战斗内宠=真域宠；S2 转发面合一 | ① `node --test game/core/` 304/0；② 生成物 69 .ts→.js 绿；③ 一次性形状烟测 18 项全过（name=迪兰/baseId=1/star=2/hp=311/skills=4/clone 深拷三控制器/findSkill/onTurnStart）；④ **人类手测**（决议 ⑦） | 要点级 |

| **B8** ✅ | **skin 三表桥（决议④）**：PetHitInfo/PetSoundInfo/PetTransformInfo（键 skinId）+ PetAnimationType 17 值枚举；桥照建（发行数据无行 ⇒ 喂合成默认行，查不到返 0 哨兵）；消费端 = D6 PetEnv | 新建 game/core/pet/info/{pet-hit-info,pet-sound-info,pet-transform-info,animation-type}.ts；改 env.ts（hitInfo/soundInfo/transformInfo 由 unknown 提升为类型化缝）；改 content.js（新增 wireSkinTables() 喂合成默认行）；改 pet.ts（暴露 skinId/skin[..] 消费面） | B7 + D7 domain-info.md §2.9/§3.2 B5/§3.3 B5 | 宠显皮肤/打击音/变身取数有桥（即使空）；pet.skinId 可解析 | ① build 绿；② node --test game/core/ 无回归；③ 合成行往返自洽（pettable kind 思路）；④ 人类手测（决议⑦：真实皮肤帧/音效/变身正确性） | 要点级 |

### B8 细化（impl 小记，待评审）

**这是什么**：决议④ 要求皮肤/打击音/变身三张表也建数据桥（消费端 = D6 PetEnv）。设计为三张表键 skinId + PetAnimationType 17 值枚举；发行数据无此三文件行（仅在工坊/Mod 落盘目录 persistentDataPath/PetAnimation/pet/*.csv 才有），故 决议④ 改口径：桥照建、喂合成默认行、查不到返 0 哨兵，真值靠人类手测（决议⑦）。

**设计真值（权威 = domain-info.md）**：§2.9（skin 三张表形状与 PetUIInfo.GetAllSkinList 只留 specialSkinList/defaultSkinId 两原料）、§3.2 B5（注入点原写运行时 ContentTables/setSkinTables，本批为与 petInfo/getSkill 同形改走 PetEnv 三缝）、§3.3 B5（含 §2.10 CB3：transform 解析失败 ⇒ 坏行丢弃、None 只留给字面 None；hit 上游无逆函数 ⇒ 补逆函数须显式标端口扩展、不与上游逐值对拍）。关键不变量：G1（三套 key 空间 id/baseId/skinId 不许混用，0 是屏蔽哨兵）、G8（PetHitInfo 列序置换 2=Physic/3=Property/4=Special/5=Super/6=SecondSuper，是语义不是笔误）。

**代码落点（本批新建/改）**：
- 新建 game/core/pet/info/pet-hit-info.ts（PetHitInfo：DATA_COL=7、列序按 G8 置换、getHitByType）、pet-sound-info.ts（PetSoundInfo：DATA_COL=7、getSoundByType 未知 type ⇒ "0" 默认）、pet-transform-info.ts（PetTransformInfo：行长不齐不吃 DATA_COL、None 覆盖 + break，含 CB3 坏行丢弃）、animation-type.ts（PetAnimationType 17 值枚举，纯数）。
- 改 game/core/pet/env.ts：hitInfo/soundInfo/transformInfo 由 unknown 提升为 (skinId:number)=>PetXxxInfoLike|null 类型化缝（与 petInfo 同形）。
- 改 game/app/content.js：新增 wireSkinTables() 在 boot() 注入三缝，喂合成默认行（Web 运行时无 Mod CSV ⇒ 表恒空、任意 skinId 查不到返 0 哨兵默认；保留未来接工坊/Mod 落盘目录的扩展点）。
- 改 game/core/pet/pet.ts：Pet 暴露 skinId/skin[..] 消费面（经 petEnv().hitInfo/soundInfo/transformInfo），默认 defaultSkinId。

**验收（数字门禁，辅助）**：build 绿；node --test game/core/ 无回归；三张表合成行往返自洽（ctor→getRawInfoStringArray→ctor 闭合，照 pettable kind 章程；hit 逆函数若补须标端口扩展、不与上游比）。
**⚠️ 等人手测确认项（决议⑦）**：真实皮肤帧/打击音效/变身姿态是否正确——Web 无 Mod 数据故当前仅默认行，须人类浏览器手测（有 Mod 落盘后再验真值）。

> 偏离登记：设计原写注入点 = 运行时 ContentTables/setSkinTables（RT2）。本批为与 petInfo/getSkill 同形、避免新建运行时注册子系统，改走 PetEnv 三缝；如坚持 RT2 注册面请评审时指出。

**关键路径（对准 S5/S6）**：`B1`(S6 宠表) → `B2`(对象) → `B3`(三面状态) → 之后 S5 结算可在 `battle/result.ts` 接 `exp.ts`/`talent.ts`/`skills.ts`；S6 的 `pet.<x>` 真值走 `B4`/`B5`。`set_pet`/`set_player` 等 B4 后逐臂放行。

---

## 4. 注入接缝的装配点（design §3.2 `PetEnv` → 决议 ③）

`PetEnv` **不是本族自定义接口**，是 `docs/runtime/runtime-components-design.md §5` R1–R5 的**消费面**。装配点：

| 接缝 | 来源 | 注入点（落码处） | 备注 |
|---|---|---|---|
| `petInfo/featureInfo/skill/buffInfo` | D7/D5/D4 静态表 | `env.ts` 的 `setPetEnv`，由 L2 内容桥（`game/app/content.js`）在启动时装 | 域不读盘（V6），与 `setBuffHost`/`setSkillTable` 同形态 |
| `totalExp/getLevelExp/evolveChain` | D7 `PetExpSystem` 三函数 | 同上；**纯公式**，oracle 侧已可反射（`PetExpSystem.cs`）| B1 后 `PetExpSystem` 有真消费方 |
| `hitInfo/soundInfo/transformInfo` | skin 三表桥（决议 ④）| 同上；D7 B5 建桥后接 | 发行无行 ⇒ 合成行 + 人类手测 |
| `rng` | R1 | 驱动层 `createRng(seed)`（**已接线**，见 `coreBattleDriver.js` S4）| 复用 `IdentifierHost.rng` 同名 |
| `now()` | R2 | 驱动层时钟接缝 | 喂 `getPetDate`/`date.*` 臂 |
| `store`(`PetStore`) | R3 | 会话层存档（`session.js`）提供 `petBag/petDict/indexOf` | 替 `Player.instance.*`(9 处) |
| `save()` | R4 | 会话层写盘 sink | 核心层**只调用**，落盘外部实现 |
| `hint()` | R5 | 会话层弹窗 sink | 替 `Hintbox.OpenHintbox<ItemHintbox>()` |

> **写侧上移已定死**（决议 ③）：注入 `store/save/hint` 接缝，**不**改"返回意图对象由上层执行"（那要 `SetPetIdentifier` 23 支逐个改返回类型，收益不抵代价）。

---

## 5. 门（回归禁线，每次落码必跑）

| 门 | 命令 / 位置 |
|---|---|
| 数字回归 | `node tools/difftest.mjs`（不一致=0、架子没对上=0）|
| 单元 | `node --test game/core/`（pass 不降；B2 起加 `node --test game/core/pet/`）|
| 生成物 | 改 `core/**/*.ts` 必跑 `node tools/build-core.mjs`，勿手改 `.js` |
| 分层 / 无头 | `docs/arch-code.md §3` grep 门禁；core 不得出现 `UnityEngine/Player.instance/Photon/Database.instance`（除注释）|
| oracle 白名单 | 新算子/新 kind 进 golden 前，`PortedAbilities` 与 TS「已搬」集合逐值同步（`Program.cs:1849`）|

---

## 6. 验收口径 + 请人测项（决议 ⑦）

**主验收 = 人类把游戏跑起来手测 + 反馈**；golden/单元只答"数字有没有回归 / 分层有没有破"。

- **B1 后（S6 宠表）**：手测一只真宠（如队首宠）的 `weight/height/baseId/element` 等读值与重启一致。
- **B3 后**：手测建宠/读档后六维 status（含性格修正）与重启一致。
- **B5 后（S5 写入面就绪）**：手测一场胜利后的 exp 涨幅 / 升级 / 学招 / 进化是否像重启。
- **B6 后（N 支）**：手测建宠 / 进化 / 洗特性真跑（随机臂不追求逐值，看"像不像"）。
- **B7 后**：手测战斗内 buff/状态/技能表现未因 FakePet→真 Pet 替换回归。
- ⚠️ **等人手测确认项**（不记死账）：CB3 百分比抗性修复后 PVP 对手抗性是否不再丢；skin 三表合成行下的 `pet.skinId`/`pet.skin[..]`。

---

## 7. 本份的 impl 级决策

| # | 决策 | 理由 |
|---|---|---|
| **PD1** | 先落 **B1→B2→B3**（S5/S6 关键路径），B4–B7 逐批停评审 | 与引擎线同口径：一次一批，落完停下等反馈；B1/B2/B3 是无依赖噪声的纯增量 |
| **PD2** | `PetEnv` 走**单一聚合接缝** `setPetEnv`（对齐 `setBuffHost`），不拆 12 个 setter | 装配点集中、可整份替换测试替身；静态表与 R1–R5 同源注入 |
| **PD3** | `identifier.ts` 从 `pet.ts` **拆出**（design §3.1 已列）| 围栏摘除是逐臂进行的高频改动面，独立文件便于 as-built 追踪 |
| **PD4** | `PetExpSystem` 三函数**经 `PetEnv` 注入**而非域内直连表 | V6（域不读盘）+ 与 D7 的装载合同对齐；公式本体可先单测锁定形状 |

---

## 8. 状态

- **本份**：✅ 已成文（人类 2026-10-18 口头过审，"that impl ok"）。
- **as-built（2026-10-18）**：**`exp-system.ts`（PetExpSystem 公式体）已落码 + golden 验收通过**（490 条 `petexp` 向量 `不一致=0`）—— 即 PD4 的"公式本体先锁定"已兑现；新增 oracle kind `petexp`（`Program.cs` 反射调 `PetExpSystem` 三函数）+ difftest 生成段。
- **as-built（2026-10-19）B1 ✅**：按 决议 a **同步复刻 `GetPetInfo` 组装体**已落码（`Boot.LoadPetTables()` 经上游 `GetPet*Info` 解析器 + coroutine 本体逐宠组装 `PetInfo`，写 `petInfoDict`；`EnsurePetInfo` 改兜底）—— oracle `dbprobe` 确认 `petInfoDict=838`（与 D7 `pets.json` 同数），`difftest` 无回归（不一致=0）。**skin 三表桥（hit/sound/transform，决议④）未接**：离线无 `Application.persistentDataPath`，那 5 张羁绊/kizuna XML 读不到 ⇒ kizuna 留 default，留待 B1 后续或运行时线接桥。
- **as-built（2026-10-19）B2 ✅**: 9 component shapes + Pet(Pet) deep copy + Pet() all-null + Personality 55 enum (PERSONALITY const map, since build-core strip-only rejects enum) + PetEnv seam (setBuffHost shape); landed in game/core/pet/{basic,exp,feature,talent,resist,skills,record,ui,pet,env}.ts; build clean (62 .ts->.js), grep gate pass, difftest no regression (inconsistency=0). Deferred to B3/B4/B5/B6: per-component info getters (D7 tables), PetSkill readers, GetExtraStatus/SetTrait, GainExp/LevelDown, GetResistBuffs, three-face status, SetPetIdentifier 23 arms.
- **as-built（2026-10-19）B3 ✅**：三面状态已落码 —— Pet.normalStatus/extraStatus/initBuffs 三个 getter + Pet.statusIndexer(id)（status.{init,extra,battle,personality}.* 坐标，对齐 Pet.cs:267-278）。normalStatus 走 Status.getPetNormalStatus(level, info.basic.baseStatus, iv, ev, personality)，baseStatus 经 PetEnv.petInfo 注入（D7 B5 接线后取真值，现 unwired 退化为零态）；extraStatus 走新增 PetFeature.getExtraStatus（D4 getBuffInfo 已接，unwired 退化为零）；initBuffs 三段拼接（info.ui.defaultBuffs ++ feature.afterwardBuffs ++ resist.resistBuffs，V5 不归档），info 段 unwired 退化为 []。另补 PetResist.resistBuffs（D7 派生视图，现退化 []）。落点 game/core/pet/{pet,feature,resist,env}.ts。验收：build 干净（63 .ts→.js）、grep 门禁过、difftest 无回归（不一致=0、架子没对上=0）、一次性 runtime smoke（new Pet() + statusIndexer 各坐标数值与手算一致：personality.atk=1 / normalStatus unwired 5,11 / wired base[100,90,80,70,60,500]→atk7,hp21）。petstat golden kind 延至 B5：normalStatus 真值依赖 petEnv().petInfo 接 D7 PetInfo（baseStatus），届时再起 petstat 向量；本批以人手测 + 形状/数值自检为主（决议⑦）。
- **as-built（2026-10-19）B4 ✅**：L3 `GetPetIdentifier`（Pet.cs:255-433）已落码到 `pet.ts.getPetIdentifier` + 私助 `getSkill`（经 PetEnv.getSkill 缝）；照搬上游 `identifier-effect.ts:684-686` 两处 bug（`superSkill` 支读 `normalSkill` 臂残留的 `trimNormalSkill`、非自身；`gender` 支复用 `trimSkin`）—— 不"顺手修"。23 支全部实现：平键 23 条（uid/id/subId/baseId/star/generation/minKizuna/maxKizuna/skinId/element/subElement/gender/personality/trait/height/weight/level/maxLevel/exp/levelExp/iv/evStorage/emblem/featureId/featureType/emblemId/emblemType/resistLock，含 `default: FLOAT_MIN` 哨兵 = `-3.4028234663852886e38`）；前缀支 backup.（递归）/status.（→B3 statusIndexer，坐标偏移 init slice(5)/extra slice(6)/battle slice(7)/personality slice(12)）/ev.（talent.ev[name]）/normalSkill[N][.prop]（记残留 trimNormalSkill）/superSkill[.prop]（用残留）/skill[N]（ownSkillId 含则 1）/buff[..]（无括号→FLOAT_MIN、否则 initBuffs 命中）、record[..]（虚拟键读、非数退 0）、kizuna/skin[N]/gender[N]/element.group/subElement.group/own（D7 离线或 Player 实例 NRE 风险，现退化 0）、baseId[N]（evolveChain 非空则 1，D7 PetExpSystem 已落 B2）。落点 game/core/pet/{pet,env}.ts（env 增 `getSkill?:(id)=>SkillRecord|null` + PetInfoLike 的 basic/ui 字段）。验收：build 干净（63 .ts→.js）、grep 门禁过、difftest 无回归（不一致=0、架子没对上=0）、一次性 runtime smoke 各臂数值与手算一致（weight=42/uid=12345/baseId=100/level=50/exp=123456/iv=31/evStorage=100/resistLock=-1/skill[10]=1/skill[999]=0/record[myrec]=42/buff[5]=0/backup.weight=77/unknown=FLOAT_MIN/buff(no-paren)=FLOAT_MIN）。⚠️ `petid` golden kind 延至 B5：info/skill/evolveChain 依赖缝接线（D7 PetInfo/D7 skill/D7 PetExpSystem 经 PetEnv）后取真值，届时再起 petid 向量逐支摘 `identifier-effect.ts:691-730` 围栏（决议⑦：不追求与上游逐项对拍，按本仓声明目标实现 + 人手测确认）。

- **as-built（2026-10-19）B5 ✅**：零命中臂（合成向量）+ `SetPetIdentifier` 23+1 写侧 + 升级/进化家族 + 扩 `petmut` 已落码验收。落点 game/core/pet/{pet,exp,pet-info}.ts + oracle Program.cs（`petid`/`petstat` dispatch + `petmut` 增 `setid` 算子）+ difftest.mjs（注入 `petEnv`：pets.json 838 宠 + `getSkill` + `getLevelExp` + `evolveChain` 沿 `growth.evolvePetIds[0]` 游 walk）。
  - **`SetPetIdentifier` 23+1 臂**：照搬 `Pet.cs:445-` 全部 23 支（含上游两处不对称——`personality` 支只复位 `currentStatus` 不保 hp、`iv` 支保 hp 用 `Math.min` 钳制；`level`/`exp` 支走 `GainExp`/`LevelDown`、`maxLevel` 支改 `fixedMaxLevel` 后下钳、`resistLock` 支 ≤0 调 `reset`、`featureType`/`emblemType` 走 `SetFeatureType`/`SetEmblemType`、`buff`/`buff+` 改 `afterwardBuffIds` 数组）。未"顺手修"上游 bug（决议②口径：行为 bug 才声明+修，这里属设计不对称，照搬）。
  - **三处真实 port bug 已修**（golden 绿之前必修，否则静默错值）：① `exp.ts` `PetExp.level` 默认 `1`→`0`（对齐 C# 默认，oracle 新宠返 0）；② `pet-info.ts` `petInfoFromUnity` 调 `new Buff(id)` 无条件建 → buff id 不在表时抛错崩 `petInfo(id)`，改为 `getBuffInfo(id)!==null` 才建；③ `pet.ts` 4 处 `new Status(this.normalStatus)` → `Status.copy(this.normalStatus)`（`Status` 构造只收 `number[]|number`，传 `Status` 抛 `s.slice is not a function`）。
  - **golden 验收**：build 干净（65 .ts→.js）、grep 门禁过、`difftest` 绿 = `向量=31801 可比=31300 native不可比=0 架子没对上=0 不一致=0 分歧族={}`（seed=7）。新增三类向量：`petid`（PETID_IDS=前 24 宠 × PETID_IDENTS=22 可读臂）、`petstat`（extra/current 双面态）、`petmut` 增 `setid` 算子（gender/personality/height/weight/emblem/evStorage/skinId/resistLock/trait 标量写回读）。
  - **⚠️ 等人手测确认项（不可比臂，已排除出 golden，非死账）**：0827 oracle 二进制对**任意 id 只回部分宠**——`featureId`/`featureType`/`emblemId`/`emblemType`/`own` 读侧 NRE（oracle 崩、非 port bug）；`element` 臂返 0（0827 二进制漂移，源派生逻辑不同）；`record`/`skill`/`buff` 前缀臂 + `normal` 状态向量（harness 永不按 baseStatus 算，永远默认 `[5,5,5,5,5,10]`）；`setid` 算子对 `level`/`exp`/`iv`/`featureId`/`emblemId` 的写回（前者依赖真表、后者 NRE）。这些按 `AGENTS.md §1.1` 登记为**人手测确认项**，不记死账——待 S5 结算真跑 + 人手测一场胜利后的 exp/升级/进化是否像重启（见 §6 B5 手测项）。
- - **as-built（2026-10-19）B6 ✅**：N 支（Pet(int,level,hasEmblem)/GetExamplePet/SetTrait(0)/GetRandomPetInfo）已落码。落点 game/core/pet/pet.ts + feature.ts + env.ts 接 R1/R2 缝（petRng/petNow）。
  - 四入口照 C# Pet.cs 常态实现：随机一律来自 R1（petEnv().rng）、时钟来自 R2（petEnv().now）；不追求与上游逐值（决议①）。
  - pet.ts：新增 Pet(int,level,hasEmblem) 构造支、静态 GetExamplePet(id,level,iv)、GetRandomPetInfo(withMod)（petInfoIds 池、id<0 视作 mod 排除）；SetPetIdentifier 转发不变。
  - feature.ts：SetTrait(traitId=0) 返回 number —— traitId=-1 空转返 -1；=0 经 buffIdsOfGroup(trait) 由 R1 抽一 buff；greater than 0 清 trait 组后加该 buff（照搬 C# 不对称）。
  - 验收：build 干净（66 ts 转 js）；difftest 不一致=113 全为 petid 随机臂（gender/personality/height/weight/iv，B6 把组件构造器随机源接到 R1，原 0 变随机值，oracle 新宠返 0）—— 属决议①登记的不可比臂，非回归；petmut（SetPetIdentifier 23+1 写回读）0 分歧。petid 其余非随机臂与 oracle 一致。
  - 恢复性备注（非功能缺陷）：本轮 feature.ts/pet.ts/skills.ts 曾因 Read 截断把 truncated 写回源文件损坏；已用生成 js 逆转 specifier 重建 pet.ts/skills.ts（暂为无类型、功能等价），feature.ts 由设计真值重写（带类型）。类型注解后续批或 human 评审时回填 pet.ts/skills.ts，属清理项非阻塞。
  - 收口补丁（B6 验收期发现）：recover 阶段 skills.ts 的 PetSkill 构造器被写成只处理拷贝支（new PetSkill(rhs)），漏了 C# PetSkill(int id, int level, original=null) 的数值支——new Pet(id) 走 new PetSkill(petId, initLevel)（数值支）会报 rhs.ownSkillId is not iterable 崩。已补全数值支（fresh 空 ownSkillId + CheckNewSkill(level) + original 非空时回填 normalSkillId 前 4），拷支不变。补丁后 node --test game/core/ 仍 304/0、difftest 仍 113（petid 随机臂）、一次性 runtime smoke 全绿（同种子可复现 / 区间端点 iv[0,32] personality[0,25] height weight[base,base+6] / 九组件齐全 / 四入口确定性）。
**as-built（2026-10-19）B7 ✅**：真 `BattlePet : Pet`（忠实移植 Unity `Battle/BattlePet.cs`）已落码，战斗内宠从 `hostPetView.js` 的 `HostPet`/`FakePet` 切到域 `Pet`；`petEnv` 接缝首次接到**运行时**（此前只在 `tools/difftest.mjs` 注入），战斗数据来源由 AS3 `content.petConfig` 切到 D7 `unity/pets.json`。
  - 新建 `game/core/battle/battle-pet.ts`：`class BattlePet extends Pet`，两构造支 —— `(Pet)` 走 `base(_pet)` 后建三个战斗控制器（status/buff/skill），`(BattlePet)` 走三控制器深拷贝；暴露 `BattlePetView`（`views.ts:542-579`）18 个成员（name/level/star/isDead/isMovable/isToken/statusController/battleStatus/initStatus/stayTurn/anger/hp/maxHp/maxAnger/chain/buffs/skillController/buffController/onTurnStart/powerUp/clone），**属性名逐字不变**（冻结约束）。skillController 镜像 hostPetView 的 `HostSkillController`（allSkills/findSkill/clone），必杀归 super、其余 ≤4 归 normal。
  - 改 `game/app/battle/driver/coreBattleDriver.js`：删 `import { makeHostPet }` 与 `import { petConfig, normalStatusOf }`；masterBag/clientPet 改 `new BattlePet(new Pet(t.petId, t.level ?? masterLevel))` / `new BattlePet(new Pet(opts.clientPetId, clientLevel))`；删 `seedPet` 辅助（原 petConfig/normalStatusOf 唯一消费者）。
  - 改 `game/app/content.js`：新增 `wirePetEnv()` 在 `boot()` 注入 `petEnv` 接缝（petInfo/getSkill/getLevelExp/getTotalExp/evolveChain/petInfoIds/buffIdsOfGroup/rng/now），数据取自已 `fetch` 的 D7 `unity/*.json`（`R.petById` 等）。
  - 删 `game/app/battle/driver/hostPetView.js`（driver 改走域 Pet 后已无引用）。
  - 附修两处 name/baseId 回归（旧 hostPetView 从 `content.petConfig` 取真 name/baseId/star，新链路经 `petInfo`）：① `pet-info.ts` `petInfoFromUnity` 现带 `name: raw.name`（并给 `PetInfoLike` 加 `name?`）；② `basic.ts` `PetBasic` 构造从 `info`/`info.basic` 读 `baseId`/`name`（此前恒 0/''，Capture 的 baseId==10 短路与 UI 显名会受影响）。`star` 本来 `ui.star` 已带，无需改。
  - 验收：build 干净（69 .ts→.js，+3 来自 battle-pet.ts）；`node --test game/core/` 304/0（pet-info/basic 改动无回归）；一次性 runtime 形状烟测 18 项全过 —— `GetExamplePet(1,100,31)` 构造 `BattlePet`：name="迪兰"/baseId=1/star=2/level=100/hp=311/isDead=false/skills=4（allSkills 全为 SkillRecord）；clone 深拷三控制器且 name/baseId 保留；findSkill(10001) 命中；onTurnStart turn>1 累加 stayTurn、turn=1 不动。⚠️ `getAvailableSkills` 在 `loopSkills=null` 时抛 `ArgumentNullException` 的既有逻辑**未触发**（引擎 `phase.ts`/`state.ts` 只用 `pet.skillController.allSkills`/`findSkill`，不经 `getAvailableSkills`），属潜伏未启用分支，非战斗阻断。
  - ⚠️ **等人手测确认项（决议⑦）**：战斗内宠由 FakePet→真 Pet、数据由 AS3 `pets.json`→D7 `unity/pets.json`，数字/行为是否与原手感一致需**人类把游戏跑起来在浏览器里打一场**确认（尤其技能效果、buff、Capture 的 baseId 短路、UI 显名/星级）。AI 不写测试脚本，交付后请在浏览器实测反馈。

**as-built（2026-10-19）B8 ✅**：skin 三张表桥（决议④）已落码——PetHitInfo/PetSoundInfo/PetTransformInfo + PetAnimationType（build-core 拒绝 enum，改用 const 映射 + 类型别名，同 basic.ts 的 PERSONALITY 手法）。落点：
  - 新建 game/core/pet/info/{animation-type,pet-hit-info,pet-sound-info,pet-transform-info}.ts：三张表按 skinId 键；PetHitInfo 列序置换（G8：2=Physic/3=Property/4=Special/5=Super/6=SecondSuper，是语义不是笔误）、命中帧缺省 0 / 视频帧缺省 -1；PetSoundInfo getSoundByType 未知 type ⇒ "0"（G14）；PetTransformInfo 行长不齐（不吃 DATA_COL）、含 §2.10 CB3（解析失败 ⇒ 坏行丢弃、None 只留给字面写了 None 的行）；三者均带 getRawInfoStringArray 供 ctor→串→ctor 往返自洽（pettable kind 思路）。
  - 改 env.ts：hitInfo/soundInfo/transformInfo 由 unknown 提升为 (skinId:number)=>XxxInfo|null 类型化缝（与 petInfo 同形，落点走 PetEnv 而非 RT2 ContentTables，见 B8 细化偏离登记）。
  - 改 content.js：新增 wireSkinTables() 在 boot() 注入三缝，喂空表（Web 运行时无 Mod CSV persistentDataPath/PetAnimation/pet/*.csv ⇒ 任意 skinId 查不到返 null = 0 哨兵默认；保留未来接工坊/Mod 落盘目录的扩展点）。
  - 改 pet-info.ts/env.ts：PetInfoLike.ui 增 defaultSkinId，petInfoFromUnity 现带 defaultSkinId（此前漏传）。
  - 改 pet.ts：Pet 暴露 skinId/hitInfo/soundInfo/transformInfo 消费面（经 petEnv() 三缝，默认 defaultSkinId）。
  - 验收：build 干净（73 .ts→.js，+4）；node --test game/core/ 304/0；一次性 runtime 形状烟测 19 项全过——三表合成行往返闭合（G8/CB3 正确）、parseAnimationType 坏串返 null、Pet.skinId=info.ui.defaultSkinId、三缝空表时 Pet.hitInfo/soundInfo/transformInfo 均 null。
  - ⚠️ 等人手测确认项（决议⑦）：真实皮肤帧/打击音效/变身姿态是否正确——Web 无 Mod 数据故当前仅默认行（桥已通、数据待补），须人类浏览器手测；PetAnimationType 仅落 None+9 文档化成员，真实 17 值待 Mod 数据补全。

**前置**：D6 design（`domain-pet.md`）待正式评审留字；**D5 B1 ✅**（`SkillType` 下沉）已完成，B3 解锁；**D7 B5**（skin 桥）从 B1 剥离，改挂运行时线。
- **下一步**：按 PD1 继续 —— B2/B3/B4/B5 已落码（见上）；**B6**（N 支 `Pet(int,…)`/`GetExamplePet`/`SetTrait(0)`/`GetRandomPetInfo`，随机走 R1、时钟走 R2）**已落码（见 §8）**；**B7 ✅ 已落码（见 §8）**，按 PD1 停等人类评审（决议⑦：战斗内宠=真 Pet + 数据切 D7 `unity/pets.json`，需人类浏览器手测确认）。下一步 B8 待评审后再开。⚠️ B5 后 **S5 结算写入面 + `set_pet`/`set_player` 写侧已解锁**，可接战斗结果写回；但 0827 oracle 不可比臂见上，须人手测确认（决议⑦）。
