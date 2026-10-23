# 重启存档 XML 规格（save-xml-spec.md）

> 子文档 of `docs/save/save-design.md`（**设计文档**）。本文是**节点树真值**：有哪些子项、子项又有哪些子项、
> 谁带属性（如 `id`/`num`）。设计文档只讲格式总则与配方，细则以本文为准。
> 证据标注同设计文档：【样本】/【源码】/【推断】；**【我方扩展】** = 复刻新增、上游无此字段（本版仅 `<equip>`，见 §2.22）。

## 0. 读法约定

- `@x` = **XML 属性**（`[XmlAttribute]`）；不带 `@` = **子元素**。
- `T[n]` = **定长数组**；`T*` = **变长列表**（`List<T>`/array）。
- `?` = **可空单引用**，为 null 时**整段省略**。
- `nil` = **数组空槽** → 写作 `<Elem xsi:nil="true" />`。
- 成员**出现顺序 = 声明顺序**（不可乱）。
- 所有 `[XmlIgnore]` 成员**不出现**（见 §3 清单）。
- 集合元素名规则：**外层包装 = 字段名**；**子元素名 = 元素类型名**，除非显式 `[XmlArrayItem]`。

---

## 1. 根节点树（`<gameData>`）

```
gameData  [根, xmlns:xsd/xsi]
├─ version            : string      【样本】
├─ gender             : bool        【样本】
├─ nickname           : string      【样本】
├─ firstLoginDate     : DateTime    【样本】
├─ lastLoginDate      : DateTime    【样本】
├─ achievement        : int         【样本】
├─ petBag             : Pet[12]     【样本】(包装 <petBag>，子元素 <Pet>，空槽 nil；前 6=应战编队/后 6=候选编队)
│                                        ⚠️ 旧/短档可能少于 12 ⇒ 读侧 resize 补 nil（见 §6.5）
├─ petStorage         : Pet*        【样本】(包装 <petStorage>，子元素 <Pet>)
├─ pvpPetTeam         : IKVP<string,Pet[]>*   【推断】(包装 <pvpPetTeam>，子元素 <IKeyValuePair>)
├─ itemStorage        : Item*       【样本】(包装 <itemStorage>，子元素 <Item>，属性 id/num)
├─ mailStorage        : Mail*       【样本】(包装 <mailStorage>，子元素 <Mail>)
├─ missionStorage     : Mission*    【样本】(包装 <missionStorage>，子元素 <Mission>，属性 id/checkpoint/done)
├─ activityStorage    : Activity*   【样本】(包装 <activityStorage>，子元素 <Activity>，属性 id)
├─ battleRecordStorage: BattleRecord*  【样本】(包装 <battleRecordStorage>，子元素 <BattleRecord>；登录即清空)
├─ settingsData       : SettingsData【样本】
├─ yiteRogueData      : YiTeRogueData【样本】
└─ equip              : EquipLook?  【我方扩展 · 2026-10-20 · M8 `ALQ1=A`】(旧档缺整块 ⇒ null = 无装备/未骑乘)
```

> ⚠️ `coin`/`diamond`/`shoot`/`petDict`/`itemBag`/`noobCheckPoint`/`initMapId` **不在树中**（`[XmlIgnore]`）。

---

## 2. 类型定义

### 2.1 `Pet`（元素名 = `Pet`，作为数组子项时**用类型名大写**）
```
Pet
├─ id          : int          【样本】(元素，非属性)
├─ backupPet   : Pet?         【源码】(退化前型态, 结构同 Pet, null→省略)
├─ basic       : PetBasic     【样本】@id
├─ feature     : PetFeature   【样本】@id
├─ exp         : PetExp       【样本】@id
├─ talent      : PetTalent    【样本】@id
├─ resist      : PetResist    【样本】(无属性)
├─ skills      : PetSkill     【样本】@id
├─ record      : PetRecord    【样本】(无属性)
├─ ui          : PetUI        【样本】@id @baseId
└─ currentStatus : Status     【样本】
```

### 2.2 `PetBasic`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `name` | string | 元素 | null → 省略【样本】|
| `gender` | int | 元素 | 【样本】|
| `personality` | `Personality` | 元素 | **中文枚举名**【样本】|
| `height` | int | 元素 | 【样本】|
| `weight` | int | 元素 | 【样本】|
| `getPetDate` | DateTime | 元素 | 【样本】|

### 2.3 `PetFeature`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `hasEmblem` | bool | 元素 | 【样本】|
| `featureId` | int | 元素 | 【样本】|
| `emblemId` | int | 元素 | 【样本】|
| `afterwardBuffIds` | int* | 包装+`<int>` | 空→`<afterwardBuffIds />`【样本】|

### 2.4 `PetExp`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `level` | int | 元素 | 【样本】|
| `fixedMaxLevel` | int | 元素 | 【样本】|
| `totalExp` | uint | 元素 | 【样本】(注：`expSum` 是 `[XmlIgnore]`)|

### 2.5 `PetTalent`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `iv` | int | 元素 | 0..31【样本】|
| `ev` | `Status` | 元素 | 【样本】|
| `evStorage` | int | 元素 | 【样本】|

### 2.6 `PetResist`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `id` | int | **元素** | ⚠️ 唯此处 id 是元素【样本】|
| `lockState` | int | 元素 | 默认 -1【样本】|
| `criResist` | int | 元素 | 【样本】|
| `fixResist` | int | 元素 | 【样本】|
| `perResist` | int | 元素 | 【样本】|
| `abnormalResist` | `IKVP<int,int>` | 元素 | `<key><value>`【样本】|
| `unhealthyResist` | `IKVP<int,int>` | 元素 | 【样本】|

### 2.7 `PetSkill`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `ownSkillId` | int* | 包装+`<int>` | 变长【样本】|
| `normalSkillId` | int* | 包装+`<int>` | 声明 `int[4]`，实测**可少于 4**【样本】|
| `superSkillId` | int | 元素 | 0 表示无【样本】|

### 2.8 `PetRecord`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `winFightNum` | int | 元素 | 【样本】|
| `loseFightNum` | int | 元素 | 【样本】|
| `recordDict` | `IKVP<string,string>*` | 包装+`<IKeyValuePair>` | 空→`<recordDict />`【推断元素名】|

### 2.9 `PetUI`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | =skinId【样本】|
| `@baseId` | int | 属性 | 【样本】|
| `specialSkinList` | int* | 包装+`<int>` | 【样本】|

### 2.10 `Status`（6 元素，底层 `float[6]`，顺序固定）
| 成员 | 类型 | XML |
|---|---|---|
| `atk` | float | `<atk>` |
| `mat` | float | `<mat>` |
| `def` | float | `<def>` |
| `mdf` | float | `<mdf>` |
| `spd` | float | `<spd>` |
| `hp` | float | `<hp>` |

> 列序 = 物攻/特攻/物防/特防/速度/体力。**与官方 AS3 的 `atk/spa/def/spd/spe/hp` 不同**。

### 2.11 `Item`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `@num` | int | 属性 | 【样本】|

> 元素名随上下文变：`itemStorage`/`itemBag` 里 = **`Item`**；`Mail.gift` 里 = **`item`**（见 2.12）。

### 2.12 `Mail`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `isRead` | bool | 元素 | 【样本】|
| `sender` | string | 元素 | 【样本】|
| `title` | string | 元素 | 【样本】|
| `content` | string | 元素 | 【样本】|
| `date` | DateTime | 元素 | 【样本】|
| `gift` | `Item*` | 包装 | `[XmlArray("gift")]`+`[XmlArrayItem("item")]` → `<gift><item …/>`【样本】|

### 2.13 `Mission`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | int | 属性 | 【样本】|
| `@checkpoint` | string | 属性 | `checkPointId`；默认 `"default"`【样本】|
| `@done` | bool | 属性 | `isDone`【样本】|

### 2.14 `Activity`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `@id` | string | 属性 | 【样本】|
| `data` | `IKVP<string,string>*` | 包装 | `[XmlArray("data")]`+`[XmlArrayItem("entry")]` → `<data><entry><key><value>`【样本】|

> ⚠️ **消费方已定（地图线，2026-10-18）**：本字段**就是**地图线要的那个「活动键值袋」的正本（`activity id` → 平键 → 字符串值）——
> 人类 2026-10-18 拍板地图线**复用既有 `activityStorage`、不新增字段**（`docs/map/map-impl.md §4 D9` / **E-6**）。
> ⇒ 地图的 `activity[…]` 条件**纯读**（键不存在 = 取默认，**不照搬**上游 `Activity.Find` 的"顺手建档"副作用）；`setActivity` 动作**只写袋**（写一次 `<entry>` + 日志，不做活动玩法）。
> ⇒ 若日后做"存档体检"，`<entry>` 里出现的键值属**合法写入**（非外来内容）；真机真档 `tools/fixtures/save-lite4.9.2-played.xml` 里有 **10 个** `Activity`（如 `noob` → `map=done`/`battle=done`）。

### 2.15 `IKeyValuePair<K,V>`（是 class；元素名 `key`/`value`）
```
IKeyValuePair
├─ key   : K   (元素 <key>)    【样本】
└─ value : V   (元素 <value>)  【样本】
```

### 2.16 `SettingsData`（**13 项，顺序 = 声明顺序**；两份真机真档逐项实证【样本】，见 §6.1）
| 成员 | 类型 | XML |
|---|---|---|
| `useRobotAsPlayer` | bool | 元素 |
| `BGMVolume` / `UIVolume` | float | 元素 |
| `battleBGMVolume` / `battleSEVolume` | float | 元素 |
| `battleAnimSpeed` | float | 元素 |
| `shakeWhenBigDamage` / `flashWhenBigDamage` | bool | 元素 |
| `autoHealAfterBattle` | bool | 元素 |
| `initMapId` | int | 元素（默认 -70）|
| `ruleId` | int | 元素 |
| `comboDamageDisplayMode` | int | 元素 |
| `wildNpcBubbleStyle` | string | 元素 |

> **读侧容忍缺项**：`XmlSerializer` 对缺失的元素取默认值 —— 我们照此（**缺项不报错**）。
> 这条对**所有**表都成立（老档/未来档都会增删字段），不逐表重复。

### 2.17 `YiTeRogueData`（源 `System/Data/YiteRogueData.cs`）
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `mode` | **int** | 元素 | ⚠️ 是 int 不是枚举 → `<mode>1</mode>`（`difficulty` getter 被 `[XmlIgnore]`）【源码】|
| `isEnd` | bool | 元素 | 【样本】|
| `petBag` | `Pet[6]` | 包装+`<Pet>` | 空槽 nil【样本】|
| `buffStatus` | `Status` | 元素 | 【样本】|
| `buffIds` | int* | 包装+`<int>` | 【样本】空 |
| `itemBag` | `Item*` | 包装+`<Item>` | 无 `[XmlArrayItem]`→子项=`Item`（未实证，见 §4）【源码】|
| `floor` | int | 元素 | 【样本】|
| `nextPos` | int | 元素 | 默认 `2147483647`(int.MaxValue)【样本】|
| `trace` | int* | 包装+`<int>` | 【样本】空 |
| `eventMap` | `YiTeRogueEvent*` | 包装+`<YiTeRogueEvent>` | 无 `[XmlArrayItem]`→子项=`YiTeRogueEvent`（见 §2.20/§4）【源码】|

### 2.18 `BattleRecord`
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `isMaster` | bool | 元素 | |
| `originalResultState` | `BattleResultState` | 元素 | **枚举名**（如 `<originalResultState>Win</originalResultState>`）【源码】|
| `settings` | `BattleSettings` | 元素 | 见 §2.19【源码】|
| `masterPetBag` / `clientPetBag` | `Pet[]` | 包装+`<Pet>` | 无 `[XmlArrayItem]`→子项=`Pet`；数组为 null 时**整段省略**【源码】|
| `date` | DateTime | 元素 | |
| `actionList` | `List<IKVP<string[],bool>>` | 包装 | `[XmlArray("actionList")]`+`[XmlArrayItem(…,"action")]` → `<action><key><string>…</string></key><value>true</value></action>`【源码】|

### 2.19 `BattleSettings`（源 `Scene Specific/Battle/BattleSettings.cs`）

**属性**（声明序）：`@mod`/`@simulate`/`@escape`/`@capture`/`@item`/`@count`/`@parallel`/`@star`/`@time`
**子元素**（声明序）：`seed` → `captureLevel` → `limit` → `limitDesc` → `bgm` → `mode` → `rule` → `weather` → `initBuff`

| 成员 | 类型 | XML | 默认 |
|---|---|---|---|
| `seed` | int | 元素 | `(int)DateTime.Now.Ticks` |
| `isMod` | bool | 属性 `@mod` | false |
| `isSimulate` | bool | 属性 `@simulate` | false |
| `isEscapeOK` | bool | 属性 `@escape` | true |
| `isCaptureOK` | bool | 属性 `@capture` | false |
| `isItemOK` | bool | 属性 `@item` | true |
| `captureLevel` | int | 元素 | 1 |
| `petCount` | int | 属性 `@count` | 6 |
| `parallelCount` | int | 属性 `@parallel` | 1 |
| `starLimit` | int | 属性 `@star` | 0 |
| `filterLimit` | string | 元素 `limit` | null→省略 |
| `filterLimitDesc` | string | 元素 `limitDesc` | null→省略 |
| `time` | int | 属性 `@time` | 10 |
| `bgm` | string | 元素 | null→省略 |
| `modeId` | **int** | 元素 `mode` | 0；⚠️ int 不是枚举 |
| `ruleId` | **int** | 元素 `rule` | 0；⚠️ int 不是枚举 |
| `weather` | int | 元素 | 0 |
| `initBuffExpr` | string | 元素 `initBuff` | null→省略 |

> `[XmlIgnore]`：`mode`/`rule`（枚举 getter/setter）、`isPVP`/`isAutoOK`/`isReveal`/`isLimited`、`initBuffs`。
> 相关枚举（**均以 int 存**）：`BattleMode{Record=-1,Normal=0,SelfSimulation=1,PVP=2,SPT=3,Special=4,YiTeRogue=5,Card=6}`、
> `BattleRule{Anger=0,PP=1}`。

### 2.20 `YiTeRogueEvent`（源 `MVC/Model/Basic/YiTeRogue/YiTeRogueEvent.cs`）
| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `type` | `YiTeRogueEventType` | 元素 | **枚举名**（`Start`/`BattleEasy`/`End`…）【源码】|
| `pos` | int | 元素 | |
| `step` | int | 元素 | |
| `next` | `List<int>` | 包装+`<int>` | 可为 null → **整段省略**【源码】|
| `data` | `List<IKVP<string,string>>` | 包装+`<IKeyValuePair>` | 无 `[XmlArrayItem]`→子项=`IKeyValuePair`，每项 `<key>`/`<value>`【源码】|

> `[XmlIgnore]`：`eventIcon`/`eventIconBuffId`/`npcId`/`battleDifficulty`/`title`/`content`/`choiceList`/`nextEventList`。
> 枚举 `YiTeRogueEventType{Store=-2,End=-1,Start=0,Heal=1,BattleEasy=2,BattleHard=3,Reward=4,Dialog=5}`（**以名字存**）。

### 2.21 `BattleResultState`（源 `Scene Specific/Battle/BattleResult.cs`）

`Error=-1`、`Fighting=0`、`Win=1`、`Lose=2`、`MyEscape=3`、`OpEscape=4`、`CaptureSuccess=5`、`Timeout=99`。
作为字段（如 `BattleRecord.originalResultState`）时**以名字存**。

### 2.22 `EquipLook`（**我方扩展** · 2026-10-20 · 正本 = 地图线 M8 `ALQ1=A`）

> **证据口径**：本类型**不是上游字段**（真机真档无 `<equip>`，上游外观状态在服务端），
> 是复刻为“重开仍保持穿戴/骑乘”新增的顶层块。标记一律写 **【我方扩展】**；其余【样本】/【源码】口径不变。
> 声明顺序 = **根节点最后一块**（写在 `yiteRogueData` 之后）；旧档缺省 ⇒ `null`，读侧不报错。

| 成员 | 类型 | XML | 备注 |
|---|---|---|---|
| `items` | `List<int>` | 包装+`<int>` | 已装备**物品 ID**（`referenceId`）；空 ⇒ `<items />` |
| `mountEquipId` | int | 元素 | **坐骑装备物品 ID**；`0` = 未骑乘 |

示例：

```xml
<equip>
  <items>
    <int>100577</int>
    <int>100578</int>
  </items>
  <mountEquipId>101020</mountEquipId>
</equip>
```

**兼容与纪律**：
- **上游客户端不认该块**（`XmlSerializer` 忽略未知元素）；若上游重写该档，`<equip>` 会丢 ⇒
  **复刻档不得喂回官方服**。我们自己的 round-trip **必须原样保留**（§6 / `save-impl §4`）。
- `items` 里**只存物品 ID**，槽位由 `ItemConfig.SlotIndex` 派生；**不要**另存槽位/套装号（会漂移）。
- 骑乘只需 `mountEquipId` 即可还原外观（地图线 `mountEquipIdOf` 走物品 → 资源标识）；
  `ridingPetInfo`（宠物 resourceId/chip）**不进本块**，宠物归属仍归 D6/服务端语义。
- 角色**颜色**（`avSel`）**不在本块**；`gender` 本来就在根节点。若日后要持久化颜色，另立决策。

✅ **已落码（`MDB8-g`，2026-10-20）**：`codec.js` 的 `TYPES.root` 末块 + `EquipLook` 描述子、`schema.js` 的 `fresh/validate`、
`session.mergeBack` 写回（空 = `null` ⇒ 整段省略）；as-built = `docs/save/save-impl.md §9.5` + `docs/map/map-impl.md §7.3.24`，
手测 = `map-impl §8.19`。

---

## 3. `[XmlIgnore]` 排除清单（**不得写入 XML**）

| 宿主 | 成员 |
|---|---|
| `GameData` | `coin`、`diamond`、`shoot`、`petDict`、`itemBag`、`noobCheckPoint`、`initMapId` |
| `Pet` | `info`、`name`、`element`、`elementId`、`subElement*`、`hasEmblem`、`initBuffs`、`level`、`maxLevel`、`totalExp`(getter)、`levelUpExp`、`maxExp`、`ownSkill`、`normalSkill`、`superSkill` |
| `PetBasic` | `baseId`、`info` |
| `PetFeature` | `feature`、`emblem`、`afterwardBuffs`、`info`、`defaultInfo` |
| `PetExp` | `expSum`、`info` |
| `PetTalent` | `info`、`totalEV`、`IVRank*` |
| `PetResist` | `star`、`abnormalBuffId`、`unhealthyBuffId`、`abnormalBuff`、`unhealthyBuff`、`resistBuffs` |
| `PetSkill` | `info`、`ownSkill`、`ownSuperSkill`、`normalSkill`、`superSkill`、`backupNormalSkill*`、`secretSkill*` |
| `PetUI` | `info`、`skinInfo`、`hitInfo`、`soundInfo`、`skinId`、`skinBaseId`、`animId`、`hashId`、`icon`、`emblemIcon`、`battleImage`、`idleImage` |
| `SettingsData` | `rule` |
| `YiTeRogueData` | `instance`、`modeNameDict`、`difficulty`、`battlePetBag`、`initBuffs`、`isNextPosLocked`、`prize` |
| `BattleRecord` | `MAX_RECORD_STORAGE_NUM`(const)、`myPetBag`、`opPetBag`、`resultState`、`resultColor`、`resultNote` |
| `BattleSettings` | `mode`、`rule`、`isPVP`、`isAutoOK`、`isReveal`、`isLimited`、`initBuffs` |
| `YiTeRogueEvent` | `eventIcon`、`eventIconBuffId`、`npcId`、`battleDifficulty`、`title`、`content`、`choiceList`、`nextEventList` |

> 另有一类**只读属性**（无 setter，XmlSerializer 不序列化）：`PetSkill.normalSkillInfo`/`backupNormalSkill` 等、`PetRecord` 无、`Mission.info`/`checkpointInfo`。

---

## 4. 列表子项元素名（按源码规则**定案**）

**规则**：`XmlSerializer` 对无 `[XmlArrayItem]` 的列表，**子项元素名 = 泛型去元数后的类名**。
样本里这些列表均为空（**两份真机真档亦然**，见 §6.4），故**按规则定**（不再挂"待实证"）：

| 位置 | 子元素名 |
|---|---|
| `pvpPetTeam`（`IKeyValuePair<string,Pet[]>`）| `<IKeyValuePair>` |
| `PetRecord.recordDict`（`IKeyValuePair<string,string>`）| `<IKeyValuePair>` |
| `YiTeRogueData.itemBag`（`Item`）| `<Item>` |
| `YiTeRogueData.eventMap`（`YiTeRogueEvent`）| `<YiTeRogueEvent>` |
| `BattleRecord.actionList`（已显式 `,"action"`）| `<action>`；其 `<key>` 内 `string[]` → `<key><string>…</string>…</key>` |

> 若将来真档出现不符，以真档为准（**样本 > 源码 > 推断**）。

---

## 5. 校验关系

本规格是 `docs/save/save-code-map.md` 里 `schema.js`/`codec.js` 的**真值依据**：schema 覆盖表 / 字段覆盖缺一项即为**实现缺陷**
（⚠️ 按**决议 ⑦**不写断言脚本：由**人手测 + 夹具比对**发现，见 `docs/save/save-impl.md §7`）。

---

## 6. 样本实证登记（2026-10-18）

> **口径**：本规格的【样本】标注，出处 = **真游戏自己写的档**（`Application.persistentDataPath`），
> **不是**任何流传 / 改档工具的产物。本机真档路径（Steam/Proton 实测）：
> `~/.local/share/Steam/steamapps/compatdata/3491219114/pfx/drive_c/users/steamuser/AppData/LocalLow/Helios/Seer2 Restart Lite/save{0,1,2}.xml`

### 6.1 入库夹具（`tools/fixtures/`，**快照**）

| 夹具 | 来源 | `version` | 字节 | sha256 | 用途 |
|---|---|---|---|---|---|
| `save-lite4.9.2-played.xml` | 真机 `save0.xml` 快照 | `lite_4.9.2` | 20008 | `a65719403a3296952caaf310c3c6511f1927daf2af39e59379e27c4e4d68695a` | **字节口径基准**；满结构（28 件道具 / 8 封邮件 / 10 个 Activity / 2 个 Mission）⇒ round-trip 的对手 |
| `save-lite4.9.2-default.xml` | 真机 `save1.xml` 快照 | 空（未登录） | 14106 | `9df916b99c354174d49d9f4f18a22cbd708ea352359bf6e3fb764039c2ff2f44` | **初始档生成的 golden**（= `GameData.GetDefaultData(2000,0)` 原样，见 `docs/save/save-design.md §5`） |

> ⚠️ **快照会漂移**：真机 `save0.xml` 随游玩持续变化（这就是为什么本表钉 **sha256**）。比对本仓夹具时**只认夹具文件本身**，别去读那个路径下的当前内容。
> 来源路径写在这里是为了**将来可重取**（一份新快照要另起文件名 + 新 sha256，不覆盖旧的）。

### 6.2 字节口径（真机真档实测）

| 维度 | 真机真档 | （反例）流传/改档工具产物 |
|---|---|---|
| BOM | **无** | 有（`EF BB BF`） |
| 首行 | `<?xml version="1.0"?>`（**无 `encoding=`**） | `<?xml version="1.0" encoding="utf-8"?>` |
| 换行 | **CRLF** | LF |
| 文件末尾 | 无换行 | 无换行 |
| 自闭合 | `<x />`（`/` 前一个空格） | 同 |

> ⚠️ **流传的存档不可当口径基准**。本仓曾收到一份 `projects/Seer2-Restart-Lite-main/萌新专用护肝存档.xml`
> （`<version>lite_3.7</version>`、道具 `num=99999999`）：其**字节**（BOM / LF / `encoding=`）与**形状**（`petBag` 只有 6 槽）
> 都与真机真档不符 ⇒ 是**传输链或改档工具重写过**的产物。**它未入 `tools/fixtures/`**，此处只作反例，
> 防后人拿它"验证"而把 writer 改坏。

> ✅ **左列口径已被我方 writer 复现（2026-10-18）**：`serialize(parse(夹具)) === 夹具` 在**两份真机真档**上都
> **逐字节成立**（14106 / 20008 字节）⇒ 这张表不只是"观察到的事实"，已是**可复现的目标**。
> 实现与复现步骤见 `docs/save/save-impl.md §9.3`。

### 6.3 上游有**两条写侧**（产物不同，别混）

| 路径 | 源码 | 产物 |
|---|---|---|
| **存档**（真档） | `SaveSystem.SaveXML` = `new StreamWriter(path)` + `Serialize(writer.BaseStream, …)`【源码 `System/SaveSystem.cs:103-113`】 | = §6.2 左列（无 BOM / 无 `encoding` / CRLF） |
| **导出**（给玩家的档） | `SaveSystem.TrySaveXML` = `StringWriter` + `Serialize(writer, …)` + `FileBrowserHelpers.WriteTextToFile`【源码 `SaveSystem.cs:131-150`】 | 声明会写成 **`encoding="utf-16"`**（`StringWriter.Encoding` 是 UTF-16）【源码+推断】 |

⇒ **两边都按"存档"口径做**（我们写出的存档与导出档用同一套字节规则），因为真游戏 `LoadXML` 读的正是这一口径。
（上游那条导出档本身能否被 `LoadXML` 读回，**未实测**，不作为我们的目标。）

### 6.4 真机档里**依然为空**的项（本规格内仍无样本）

`petStorage`（非空态）、`pvpPetTeam`、`battleRecordStorage`（⇒ `BattleRecord`/`BattleSettings` 整体）、
`YiTeRogueData.itemBag`/`eventMap`/`trace`、`PetRecord.recordDict` 子项 —— **两份真档里都空**
⇒ 这些条目**仍是【源码】/【推断】**（§2.12/§2.18–§2.20 + §4），等真档里出现内容再升格。

### 6.5 旧档容忍（**读侧硬要求**）

- 真机 `save1/2` 的 `<version />` 为空 ⇒ **"未登录的默认档"是常态**（`LoadData` 缺档自动造档，见 `docs/save/save-code-map.md §2.5`）。
- 上游对"版本不符 / 数组短"的处理 = `VersionUpdate()` + `Array.Resize(ref petBag, 12)`
  （【源码 `SaveSystem.cs:380/717`】、【源码 `GameManager.cs:104-106`】）。
- ⇒ **我们的读侧必须**：① 缺字段 → 取默认值；② `petBag` 短于 12 → **resize 补 nil**（不是报错）；③ `version` 空/旧 → 走迁移分支（本仓 v3 JSON **不迁移**，见 `docs/save/save-impl.md §1`）。

