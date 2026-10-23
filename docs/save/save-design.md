# 重启存档系统 · 设计文档（save-design.md）

> 子文档：**`docs/save/save-xml-spec.md`**（节点树规格：有哪些子项、子项的子项、谁带属性）——**细则以它为准**。
>
> **范围**：只覆盖**重启血统**存档（`game/data/unity` 宇宙），目标 = **忠实 XML 格式、可互通**
> （能逐字段读写真 `save{id}.xml`）。AS3/SWF 血统不在此列。
> **真值源**（只读，不入库不分发）：
> - 代码：`projects/Seer2-Restart-Lite-main/Assets/Scripts/System/SaveSystem.cs`、
>   `System/Data/GameData.cs`（+ `SettingsData.cs`/`YiteRogueData.cs`/`VersionData.cs`），
>   以及 `MVC/Model/Basic/**` 下的 `Pet`/`Item`/`Mail`/`Mission`/`Activity`/`BattleRecord` 及 `Pet/Components/**`。
> - 样本：真存档 `…/LocalLow/Helios/Seer2 Restart Lite/save0.xml`（`lite_4.9.2`）；**全路径见 §0.1**。
> **证据标注**：【样本】= 真存档里实证；【源码】= 从 C# 读出（样本里没出现）；【推断】= 由序列化规则推出、未实证。
> 冲突时以真存档为准（样本 > 源码 > 推断）。

---

## 0. 一句话

存档 = `System.Xml.Serialization.XmlSerializer` 序列化 `GameData` 对象 → 写到
`persistentDataPath/save{gameDataId}.xml`（`gameDataId ∈ 0..2`，`MAX_SAVE_COUNT=3`）。
`LoadData(id)` 找不到档时**自动生成初始档**（见 §6）。【源码】

### 0.1 存储路径

**两套路径必须分清**（易混点）：

#### (1) 上游（重启本体）路径 —— 互通目标，只读参考

`persistentDataPath` = Unity `Application.persistentDataPath`（Windows 上即 `%USERPROFILE%\AppData\LocalLow\<company>\<product>`）：

| 场景 | 目录 | 文件 |
|---|---|---|
| **Windows（游戏本体）** | `%USERPROFILE%\AppData\LocalLow\Helios\Seer2 Restart Lite\` | `save{id}.xml` |
| **Linux + Proton（本机实测）** | `~/.local/share/Steam/steamapps/compatdata/3491219114/pfx/drive_c/users/steamuser/AppData/LocalLow/Helios/Seer2 Restart Lite/` | `save0/1/2.xml` |

- 用途：**读 / 写真档**（互通）。`{id}`=`gameDataId ∈ 0..2`（`MAX_SAVE_COUNT=3`）；`Helios`/`Seer2 Restart Lite` 即 `Application.companyName/productName`。【源码】
- 本机三份真机样本：`save0.xml`（已游玩态）、`save1/save2.xml`（未登录原始档，见 §5）。
  ✅ **已入库为夹具（2026-10-18）**：`tools/fixtures/save-lite4.9.2-played.xml`（=`save0` 快照）/ `save-lite4.9.2-default.xml`（=`save1` 快照），
  清单与 sha256 见 `docs/save/save-xml-spec.md §6.1`。

#### (2) 本游戏（本工程）路径 —— 我们自己的真存储

- **落在源码工程目录内**：`<repo>/saves/save{id}.xml`（每档一文件；**文件名与上游一致** → 可直接与真档互换）。【已拍板】
- **读写机制**：加 `tools/serve.mjs`（静态服务 + `GET/PUT /saves/*`），让**工程目录即真存储**；细节见 `save-impl.md §6`。
- 理由：存档是**工程数据** —— 工具 / 测试可直接读写、可人工检查、可纳入版本管理（或 gitignore）。
- 浏览器适配器设计见 **`save-impl.md §6`**。

---

## 1. 格式总则（XmlSerializer 口径）

| 维度 | 实测/规则 |
|---|---|
| 声明 | `<?xml version="1.0"?>`（无 `encoding=`，**无 BOM**）【样本】 |
| 根 | `<gameData xmlns:xsd="…/XMLSchema" xmlns:xsi="…/XMLSchema-instance">`（源自 `[XmlRoot("gameData")]`）【样本+源码】 |
| 缩进 | 2 空格 【样本】 |
| 换行 | **CRLF**（`\r\n`），**文件末尾无换行** 【样本】 |
| 空元素 | `<petStorage />`（注意 `/` 前有一个空格）【样本】 |
| null 单引用字段 | **整段省略**（如 `backupPet` 为 null 时无 `<backupPet>`）【样本】 |
| 数组/列表 | 外层包装元素 = **字段名**；子元素名 = **元素类型名**（除显式 `[XmlArrayItem]`）【样本】 |
| 数组空槽 | `<Pet xsi:nil="true" />`（数组元素默认 nullable）【样本】 |
| 属性 | `[XmlAttribute]` → 元素属性（如 `<Item id="1" num="2000"/>`）；否则默认是子元素 【样本+源码】 |
| 成员顺序 | **= 字段/属性声明顺序** 【样本】 |
| `[XmlIgnore]` | 完全不出现 【样本】 |
| `bool` | `true` / `false` 【样本】 |
| `enum` | **成员名字符串**（`Personality` 是**中文名**，如 `实干`）【样本】 |
| `DateTime` | round-trip：`2026-08-28T16:39:17.7635093+08:00`（7 位小数 + 时区）【样本】 |
| `float` | 文本（整数写 `28`，非整数写 `28.5`；`currentStatus`/`ev`/`buffStatus` 是 float）【样本+源码】 |
| `uint` | 文本（`totalExp`）【样本】 |

> **【样本】= 真机真档**（本机 `LocalLow/Helios/Seer2 Restart Lite/save{0,1,2}.xml`，已入库为
> `tools/fixtures/save-lite4.9.2-played.xml` / `save-lite4.9.2-default.xml`）。
> ⚠️ **流传/改档工具产出的档字节不同**（BOM / LF / `encoding=`）⇒ **不可当口径基准**；
> 两条写侧（存档 vs 导出）的差别见 **`docs/save/save-xml-spec.md §6.2/§6.3`**。

---

## 2. 顶层 `<gameData>` 字段表（按声明顺序）

| # | 字段 | C# 类型 | XML 形态 | 备注 |
|---|---|---|---|---|
| 1 | `version` | string | `<version>` | 资源版本；启动时写当前版本（样本 `lite_4.9.2`）|
| 2 | `gender` | bool | `<gender>` | |
| 3 | `nickname` | string | `<nickname>` | 空串/nickname 判"空档" |
| — | `coin` | int | **不出现** | `[XmlIgnore]` 属性；实存 `itemStorage` 的 `Item(id=1)` |
| — | `diamond` | int | **不出现** | 同上，`Item(id=2)` |
| 4 | `firstLoginDate` | DateTime | `<firstLoginDate>` | |
| 5 | `lastLoginDate` | DateTime | `<lastLoginDate>` | 每次登录刷新 |
| 6 | `achievement` | int | `<achievement>` | |
| — | `shoot` | int | **不出现** | `[XmlIgnore]`，派生自 `achievement` |
| 7 | `petBag` | `Pet[12]` | `<petBag><Pet>…×12` | 定长 `PET_BAG_SIZE=12`；空槽 `<Pet xsi:nil="true" />` |
| 8 | `petStorage` | `List<Pet>` | `<petStorage><Pet>…` | 仓库 |
| 9 | `pvpPetTeam` | `List<IKeyValuePair<string,Pet[]>>` | `<pvpPetTeam><IKeyValuePair>…` | 【推断】子元素名=`IKeyValuePair` |
| — | `petDict` | — | **不出现** | `[XmlIgnore]`，= petBag ∪ petStorage |
| — | `itemBag` | — | **不出现** | `[XmlIgnore]`，= itemStorage 按 id 排序 |
| 10 | `itemStorage` | `List<Item>` | `<itemStorage><Item id= num=/>` | 子元素名 **`Item`**（类型名） |
| 11 | `mailStorage` | `List<Mail>` | `<mailStorage><Mail>…` | |
| 12 | `missionStorage` | `List<Mission>` | `<missionStorage><Mission id= checkpoint= done=/>` | |
| 13 | `activityStorage` | `List<Activity>` | `<activityStorage><Activity id=><data><entry>…` | |
| 14 | `battleRecordStorage` | `List<BattleRecord>` | `<battleRecordStorage>…` | 登录时 `VersionUpdate` 清空 |
| 15 | `settingsData` | `SettingsData` | `<settingsData>…` | §5 |
| 16 | `yiteRogueData` | `YiTeRogueData` | `<yiteRogueData>…` | §5 |
| 17 | `equip` | `EquipLook?` | `<equip><items><int>…</int></items><mountEquipId>…` | **我方扩展**（2026-10-20 · 地图 M8 `ALQ1=A`）：已装备物品 ID + 坐骑装备 ID；旧档缺省 = 无装备/未骑乘；节点真值 = `save-xml-spec §2.22` |
| — | `noobCheckPoint` / `initMapId` | — | **不出现** | `[XmlIgnore]`，派生 |

---

## 3. `Pet` 子树

`Pet` 声明 `[XmlRoot("pet")]`，但**作为 `petBag`/`petStorage` 的数组元素时，元素名 = 类型名 `Pet`**（大写 P）【样本】。
顶层无属性的字段进 XML，`[XmlIgnore]` 的派生量（`name`/`ownSkill`/`normalSkill`/`superSkill`/`initBuffs`/`element`/`level`/`info`…）**全部不出现**【样本】。

| 字段 | 类型 | XML 形态 |
|---|---|---|
| `id` | int | `<id>`（**元素**，非属性）|
| `backupPet` | Pet | `<backupPet>…`（退化前型态；null 时省略）|
| `basic` | PetBasic | `<basic id="…">` |
| `feature` | PetFeature | `<feature id="…">` |
| `exp` | PetExp | `<exp id="…">` |
| `talent` | PetTalent | `<talent id="…">` |
| `resist` | PetResist | `<resist>` |
| `skills` | PetSkill | `<skills id="…">` |
| `record` | PetRecord | `<record>` |
| `ui` | PetUI | `<ui id="…" baseId="…">` |
| `currentStatus` | Status | `<currentStatus>` |

**子结构逐字段**：

- **PetBasic**：`[id:属性] id`、`name`(string，null 省略)、`gender`(int)、`personality`(`Personality` **中文名**)、`height`/`weight`(int)、`getPetDate`(DateTime)。
- **PetFeature**：`[id:属性]`、`hasEmblem`(bool)、`featureId`/`emblemId`(int)、`afterwardBuffIds`(`List<int>` → `<afterwardBuffIds><int>…`）。
- **PetExp**：`[id:属性]`、`level`(int)、`fixedMaxLevel`(int)、`totalExp`(uint)。（`expSum` 是 `[XmlIgnore]`）
- **PetTalent**：`[id:属性]`、`iv`(int, 0..31)、`ev`(**Status**)、`evStorage`(int)。
- **PetResist**：`id`(**元素**,注意), `lockState`(int,默认 -1)、`criResist`/`fixResist`/`perResist`(int)、`abnormalResist`/`unhealthyResist`(`IKeyValuePair<int,int>`)。
- **PetSkill**：`[id:属性]`、`ownSkillId`(`int[]` → `<int>` 变长)、`normalSkillId`(`int[]`，**声明为 4 但实测可按 ≤4 变长**)、`superSkillId`(int)。（只读属性 `normalSkillInfo`/`backupNormalSkill` 等**不进档**）
- **PetRecord**：`winFightNum`/`loseFightNum`(int)、`recordDict`(`List<IKeyValuePair<string,string>>` → `<IKeyValuePair><key><value>`)【推断元素名】。
- **PetUI**：`[id:属性][baseId:属性]`、`specialSkinList`(`List<int>`)。
- **Status**（6 个 `[XmlElement]`，底层 `float[6]`）：`atk` `mat` `def` `mdf` `spd` `hp`。
  → 注意列序 **atk/mat/def/mdf/spd/hp**（物攻/特攻/物防/特防/速度/体力），与官方 AS3 命名不同。

---

## 4. 其余顶层子结构

- **Item**：`[XmlRoot("item")]`；`[XmlAttribute] id`、`[XmlAttribute] num`。
  - 在 `itemStorage` 里子元素名 **`Item`**；在 `Mail.items` 里靠 `[XmlArrayItem("item")]` 变 **`item`（小写）**；在 `YiTeRogueData.itemBag` 里又是 **`Item`**。**同名类，三种元素名**，靠上下文决定。
- **Mail**：`isRead`(bool)、`sender`/`title`/`content`(string)、`date`(DateTime)、`items`(`[XmlArray("gift")]`+`[XmlArrayItem(Item,"item")]` → `<gift><item …/>`)。
- **Mission**：`[XmlAttribute("id")] id`、`[XmlAttribute("checkpoint")] checkPointId`、`[XmlAttribute("done")] isDone`(bool)。
- **Activity**：`[XmlAttribute("id")] id`(string)、`data`(`[XmlArray("data")]`+`[XmlArrayItem(IKeyValuePair<string,string>,"entry")]` → `<data><entry><key><value>`)。
- **IKeyValuePair<TKey,TValue>**（**是 class，不是 interface**）：`<key>`、`<value>` 两个**元素**。
- **BattleRecord**：`isMaster`(bool)、`originalResultState`(enum 名)、`settings`(`BattleSettings`)、`masterPetBag`/`clientPetBag`(`Pet[]`)、`date`(DateTime)、`actionList`(`[XmlArrayItem("action")]`)。
  - `BattleSettings` 逐字段见 `save-xml-spec.md §2.19`（`[XmlAttribute] mod/simulate/escape/capture/item/count/parallel/star/time` + 元素 `seed/captureLevel/limit/limitDesc/bgm/mode/rule/weather/initBuff`）。实测登录即清空，样本里为空。
- **SettingsData**：`useRobotAsPlayer`(bool)、`BGMVolume`/`UIVolume`/`battleBGMVolume`/`battleSEVolume`(float)、`battleAnimSpeed`(float)、`shakeWhenBigDamage`/`flashWhenBigDamage`/`autoHealAfterBattle`(bool)、`initMapId`(int,默认 -70)、`ruleId`(int)、`comboDamageDisplayMode`(int)、`wildNpcBubbleStyle`(string)。
- **YiTeRogueData**：`mode`(int)、`isEnd`(bool)、`petBag`(`Pet[6]`)、`buffStatus`(Status)、`buffIds`(`List<int>`)、`itemBag`(`List<Item>`)、`floor`(int)、`nextPos`(int,默认 `2147483647`=int.MaxValue)、`trace`(`List<int>`)、`eventMap`(`List<YiTeRogueEvent>`，逐字段见 `save-xml-spec.md §2.20`)。

---

## 5. 初始存档生成（本设计的关键能力）

**触发**：`SaveSystem.LoadData(id)` → `LoadXML<GameData>("save"+id)` 返回 null → 生成默认档并落盘。【源码】

**`GameData.GetDefaultData(initCoin=2000, initDiamond=0)` 配方**（逐项精确）【源码，且与样本初始 6 宠一致】：

1. `new GameData()` → `InitGameData()`：`version=""`、`firstLoginDate=lastLoginDate=DateTime.Now`、`achievement=0`、
   `gender=false`、`nickname=""`、各存储清空、`settingsData=new SettingsData()`、`yiteRogueData=new YiTeRogueData()`。
2. `petBag[0..5]` 放入 6 只初始宠：**id = 1, 4, 7, 10001, 10004, 10007**，各 **10 级**（`new Pet(id, 10)`）。
   - 每只走 `new Pet(id, level)`：`PetBasic/PetFeature/PetExp/PetTalent/PetSkill/PetRecord/PetUI/PetResist` 各按基表构造
     （身高=baseHeight+rand(0,6)、体重=baseWeight+rand(0,6)、性格 `(Personality)rand(0,25)`、`iv=rand(0,32)`、
     `hasEmblem=true`、`getPetDate=now`、`currentStatus=normalStatus`）。
3. `itemStorage += Item(COIN_ID=1, 2000)`、`Item(DIAMOND_ID=2, 0)`、`Item(10237, 1)`。
4. `missionStorage += Mission(1)`（`checkpoint="default"`, `done=false`）。

**随后 `GameManager.GameLogin()` 会"修饰"这份档**【源码】：
- `version != 当前版本` ⇒ 跑 `Mail/Mission/Pet/BattleRecord/Activity.VersionUpdate()`；
- 写 `version = 当前资源版本`；
- `petBag.Length < 12` ⇒ resize；
- 跨天 ⇒ `Mail/Mission/Activity.DailyLogin()`（样本里那些「登入奖励」邮件即由此产生）；
- 刷新 `lastLoginDate = now`；
- `SaveData()` 落盘。

> **实证（两个阶段，两套 golden）** —— 两份都已入库为 `tools/fixtures/` 夹具，清单/哈希见 `docs/save/save-xml-spec.md §6.1`：
> - `save-lite4.9.2-default.xml`（源 = 真机 `save1.xml` 快照）≈ **`GetDefaultData` 原样**（尚未登录）：
>   `<version />`、`<nickname />`、`Mail=0`、`Activity=0`、`Mission=1`、
>   `itemStorage` 恰为 `Item(1,2000)+Item(2,0)+Item(10237,1)`（**共 3 件**）、
>   `petBag` = 6 只初始宠（id `1/4/7/10001/10004/10007` @ lv10）+ 6 个 `xsi:nil` 空槽（长度 12）。
>   → **初始档生成的直接 golden**（只验 `defaultGameData()`，不含登录修饰）。
> - `save-lite4.9.2-played.xml`（源 = 真机 `save0.xml` 快照）= **登录后 + 游玩**态：
>   `<version>lite_4.9.2</version>`、`nickname=Linux`、`itemStorage` = **28 件**、`Mail=8`、`Mission=2`、`Activity=10`
>   （`noob`/`noob_reward`/`2609`/`2608`/`2610`/`new_yellow_mine`/`mod_home`/`farm`/`animal`/`daily_login`），
>   前 6 只宠仍是 `1/4/7/10001/10004/10007` @ lv10（与 `GetDefaultData` 逐一致）。
>   → **`finishNewGame`（版本迁移 + 每日登录）的 golden**。
>
> ⚠️ **快照钉 sha256**：真机 `save0.xml` **随游玩持续变化**（本文早先记的 `Mail=6` 是更早一版；入库夹具是 `Mail=8`）
> ⇒ 比对**只认夹具文件本身**（sha256 见 `docs/save/save-xml-spec.md §6.1`），别去读那个路径下的当前内容。
>
> **`petBag` = 12 槽是设计，不是 resize 痕迹**：`GameData.petBag` 初始即 `new Pet[PET_BAG_SIZE=12]`【源码】。
> 前 6 槽 = **应战编队**，后 6 槽 = **候选编队**；面板「换队」= swap `[i]`↔`[6+i]`（`i=0..5`，
> `PetBagController.SwapPetTeam`），战斗换宠分页亦按 `page*6+i`【源码】。
> §5 的 `petBag.Length<12` resize 只对**历史短档**生效。

**迁移**：加载旧档时会清 mod 内容并 `Array.Resize(ref petBag, 12)`（`SaveSystem.cs:380/717`）。【源码】

---

## 6. 版本与迁移

- `version` 字段驱动迁移；比较器 `VersionData.Compare(lhs, rhs)`：前缀序 `alpha < beta < lite`，
  同前缀则按 `_` 后 `a.b.c` **逐段数字比较**（缺段视作 -1）。【源码】
- 迁移入口 `GameManager.GameLogin()` 的版本分支（§5）；各 `*.VersionUpdate()`：
  - `Pet.VersionUpdate`：`lite_3.6.1` 重建 `resist`；`lite_3.7.1` 令 baseId[704] 性别=1；末了 `CheckNewSkill`。
  - `Activity.VersionUpdate`：`lite_3.4.5` 移除 `noob_reward`。
  - `BattleRecord.VersionUpdate`：直接清空 `battleRecordStorage`。
- `petBag` 长度不足 12 时 resize（`GameManager.cs:104-106`）——仅对**历史短档**；新档默认即 `new Pet[12]`（§5）。

---

## 7. 上游陷阱登记

| 陷阱 | 说明 |
|---|---|
| `IKeyValuePair` **是 class** | 名字像接口；能被 `XmlSerializer` 正常序列化成 `<key><value>`。 |
| **同类型三种元素名** | `Item` 在 `itemStorage`=`<Item>`、在 `Mail.items`=`<item>`、在 `itemBag`=`<Item>`。 |
| `PetResist.id` 是**元素** | 其余子结构(`basic`/`exp`/`talent`/`skills`/`ui`)的 id 都是**属性**，唯独 resist 是元素。 |
| `Status` 列序 | `atk/mat/def/mdf/spd/hp`，与官方 AS3 `atk/spa/def/spd/spe/hp` 命名冲突（官方的 spd 装魔抗）。 |
| `Personality` 是**中文枚举** | 序列化出 `实干`/`稳重`/`害羞`…（共 55 项）。 |
| 货币 = 道具 | `coin`/`diamond` 是 `[XmlIgnore]`，实存 `itemStorage` 的 id 1/2。 |
| `petBag` **定长 12** | 空槽是 `<Pet xsi:nil="true" />`，不是省略。前 6=应战编队、后 6=候选编队（换队即 swap `[i]`↔`[6+i]`）。 |
| `normalSkillId` 变长 | 声明 `int[4]`，实测可只写已装备的 N 个。 |
| 数值是 **float** | `currentStatus`/`ev`/`buffStatus` 底层 `float[6]`，序列化可能带小数。 |
| CRLF + 无 BOM + 末尾无换行 | 要字节级保真必须照抄，别用默认 LF。 |
| **两条写侧，字节不同** | 存档 `SaveXML`（**无 BOM** / 无 `encoding` / **CRLF**）≠ 导出 `TrySaveXML`（声明写成 `encoding="utf-16"`）。**我们两边都照"存档"口径**。见 `docs/save/save-xml-spec.md §6.3`。 |
| **流传 / 改档档不可信** | 经传输链或改档工具后，字节（BOM / LF / `encoding=`）甚至**形状**都会变。**逐字节口径只能拿真机 `LocalLow` 档**。见 `docs/save/save-xml-spec.md §6.2`。 |
| 顺带：**`.gitignore`** | `saves/`（运行时数据）建议忽略；`tools/fixtures/`（夹具）**要入库**。见 `docs/save/save-impl.md §6`。 |

**本线认领的一条规则（人类拍板 2026-10-17 · 源出 `docs/view/panel/view-panels-pet.md §11 VP8`）**

- **获得宠时 `petBag` 已满 12 ⇒ 溢出进 `petStorage`**，由**存档侧的获得/写入入口**执行，**View（背包面板）不实现这条判断**。
  上游真值 = `Scripts/MVC/Model/Basic/Pet/Pet.cs:148-157 Pet.Add`（`IndexOf(null) == -1 ⇒ petStorage.Add(pet)`）；
  它同时是引擎 **E6 §S13 ⑥** 的注入围栏对象，也是 D6 `docs/domain/domain-pet.md` 里 `Add(pet)` 那一行（写 = **R3**、落盘 = **R4**、弹窗 = **R5**，决议 ③）。
  ⇒ 本线的落点在 `game/logic/save/repository.js`（**设计态**，见 `docs/save/save-code-map.md:182`）的"获得宠"写路径；具体函数名待 `docs/save/save-impl.md`。

---

## 8. 已挖清（原待挖列表）

- `BattleSettings`、`YiTeRogueEvent`、`BattleResultState` —— **已挖清**，逐字段见 `docs/save/save-xml-spec.md` §2.19–§2.21。
- `IKeyValuePair` 元素名 —— **已坐实**：`[XmlElement("key")]/[XmlElement("value")]`（`IClass/IKeyValuePair.cs`），
  写作 `<key>…</key><value>…</value>`。
- 编码 / BOM / 换行 —— **真机真档实测**：**无 BOM**、首行 `<?xml version="1.0"?>`（无 `encoding=`）、**CRLF**、末尾无换行
  （= `SaveXML` 口径，【源码 `System/SaveSystem.cs:103-113`】）。两条写侧（存档 vs 导出）的差别见 `docs/save/save-xml-spec.md §6.2/§6.3`。

**无 `[XmlArrayItem]` 列表的子项元素名**：按源码规则**定案**（= 泛型去元数后的类名），不再挂"待实证"；
逐项见 `docs/save/save-xml-spec.md §4`。

---

## 9. 与现有实现的关系

现有**两套**简化 JSON 档，**都不是**本设计的忠实实现：

- `game/logic/restartSession.js`（v3，`rocoshowdown.restart.v3`，字段 `trainer/team/box/items/dex/evolve/battle`）：
  没有 `petBag` 定长、没有 `Pet` 子树、把货币写成 `trainer.coins`、并额外引入上游 `GameData` 里**不存在**的 `dex`/`evolve`/`battle` 三样；
- `game/logic/session.js`（v2，`rocoshowdown.save.v2`/`.v1`）：官方向的简化档，同样无 `petBag`/`Pet` 子树。

**人类 2026-10-18 拍板（编排线 ORP3）**：**v2 与 v3 一起直接废弃**，本项目**只认 XML 真档**（`saves/save{id}.xml`）；
两文件的处置（保留文件、app 侧零引用、不迁移）见 `docs/save/save-impl.md §1` 与 `docs/orchestration/orchestration-impl.md §3.2/§9`。

## 10. 回执 · View B5（2026-10-18）

> 来源：`docs/view/scene/start/view-scene-start-design.md §8.3`（人类 2026-10-18 拍板"要多个存档 + 要建号"）。**本节只登记需求，不在此改本线设计**。
> ⚠️ **初版回执写错过、此处留档**：我最初以为"我方存档 = `restartSession.js` 的 JSON（`SAVE_KEY_V3`）"，据此向本线要"XML→JSON 映射"。
> 人类 2026-10-18 指出**存档就是 XML** ⇒ 该条**作废**（本线 **S-决策 1** 早已定：XML 真档取代 v3 JSON）。

| # | 需要 Save 线出的 | 现状 |
|---|---|---|
| ① | **`repository.js` 落码**（`load`/`save`/`importXML`/`exportXML`，`gid 0..2`） | `game/logic/save/**` **尚不存在**（今天 app 侧仍走 `restartSession.js`）⇒ **B5 的选档/建号/导入全压在它后面** |
| ①′ | **app 侧 `storage` 适配器的注入点**（谁建 `fsStorage` / `localStorageAdapter`） | ✅ **人类 2026-10-18 已决：归编排线装配点**（`docs/orchestration/orchestration-design.md §6`）—— 本线只出 `storage.js` 适配器与接口，**不自己 new** |
| ② | **`restartSession.js`（v3）与 `session.js`（v2）退役**（本线已定"**不迁移**"，见 `docs/save/save-impl.md §1`） | ✅ **人类 2026-10-18 已决：照原样丢弃，不迁移**；**同轮加严（编排线 ORP3）**：**v2 也一并废弃**（"v2/v3 直接废弃、采用 XML 档"）⇒ app 侧零引用、文件保留供既有测试/工具（不阻塞 View B5） |
| ③ | ~~`saveN.xml` → 我方格式的映射~~ | **作废**：我方档**就是** `save{id}.xml`（文件名与上游一致，见 `docs/save/save-impl.md §6`）；View 的导入/导出直接用 `importXML`/`exportXML`，不需要映射 |

> **顺带回执给 View B5 + 编排线**（人类 2026-10-18 拍板）：**v3 的 `dex`/`evolve.pending`/`battle` 三样私有字段 = 直接丢**
> （上游 `GameData` 无对应；本线忠实 XML 档不写它们，见 `docs/save/save-impl.md §8`）。⇒ STQ2 的"3 槽"只需 `nickname`/`gender` 就能建号。

⚠️ ① 落地前，`docs/view/scene/start/view-scene-start-impl.md §6.2–§6.4` 的槽位接线**起不来**（本例不伪造兜底存储）。
⚠️ ② 的结果直接决定"老玩家进度会不会消失"，属**人类可见的行为**，落地前请给一句结论。
