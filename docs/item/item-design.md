# 道具线 · 总设计兼导读（item-design.md）

> **定位**：本线回答**"道具是什么 / 怎么用 / 怎么买卖"** —— 道具**表**与查询面、背包**读写**API、
> **使用规则**（能用几次 / 扣多少 / 生效什么）、**买/卖**。
>
> **父文档** = `docs/architecture.md`（§1.1 范围记账 · §2 分层 · §4 指针表）；
> 分层与依赖硬规则 = `docs/arch-code.md §1/§2/§3`；文档形态 / 配对 / 证据标注 = `docs/arch-docs.md §2`。
>
> **邻线（只借不抄，各归各的正本）**：
> - **效果 DSL 的数据模型 = D3** `docs/domain/domain-effect.md` —— 道具的 `effects` **就是**它的 `Effect`；
>   **预制体表** `game/data/unity/effects.json`（`prefabs`）也是 D3 的桥（D3:327）。
> - **算子本体 = E4** `docs/engine/battle-engine-effects.md`（22 算子）；**判定与执行 = E5** `docs/engine/battle-engine-judge.md`（`Condition` / `CheckAndApply`）。
> - **`Item.Remove` 围栏 = E6** `docs/engine/battle-engine-session.md §S13 ⑤`（结论：`game/core/**` 里**不许**直调 `Item` 静态，要搬只能是**注入的 item 面**）。
> - **存档字段 = Save 线** `docs/save/save-xml-spec.md:32`（`itemStorage : Item*` ⇒ `<itemStorage><Item id num/></itemStorage>`）与 `:204`（`itemBag`，肉鸽）。
> - **写盘 / 弹窗 sink = 运行时线** `docs/runtime/runtime-components-design.md`（**R3 存档读写面 / R4 写盘 sink / R5 提示弹窗 sink**）+ **编排线** `docs/orchestration/orchestration-design.md`（宿主）。
> - **面板 = C2** `docs/view/panel/view-panels-item.md`（**待写**；物品/商店族 7 个，归属见 `docs/view/view-design.md:356`）。
> - **纯整数排序助手 = D7** `docs/domain/domain-info.md §5 G12`（`GetSortPriority`；本线是它**第一个非宠消费方**）。
>
> **状态**：✅ 已写，**待人类评审**。配对 `docs/item/item-impl.md`（落地计划）与 `docs/item/item-code-map.md`（代码地图）
> 待**阶段一续**（判据见 `AGENTS.md §1`）。
>
> **立线依据** = `totalk.md` **T2·5**（清单 B；**因结构性提前** = 四条下游等它，见 §0）。
>
> **编号纪律**：`IT1–ITn`（不变量）/ `ITC1–ITCn`（上游怪癖·危险设计）/ `ITQ1–ITQn`（待拍板）/ `ITB1–ITBn`（施工批）
> **全是本线局部编号**，**不是**圆圈数字「人类决议 ①–⑧」（索引 = `AGENTS.md §5`）。
>
> **目录口径**：线名 `item`（`docs/item/`）；本线文档 = `item-design.md` / `item-impl.md` / `item-code-map.md`。

---

## 0. 这份文档回答什么

1. **为什么现在立它** —— 四条下游卡在**同一个不存在的族**上（原文见 `totalk.md:130-131`）：
   - **T2·15 融合**：`docs/domain/domain-info.md §3.3 B7` 把融合推给"**等 Item 族**"；
   - **U4 道具背包的「使用」按钮**：`docs/view/ui-handoff.md` U4 只落了**只读**背包，"使用"灰化的理由就是本线不存在；
   - **E6 §S13 ⑤ 围栏**：`Item.Remove` 的搬法**只能**是本线给出的"注入的 item 面"；
   - **T1 羁绊的礼物支**：`new Item(id, count)` 没有宿主（`totalk.md:39` "Item 族没立 ⇒ 这条注定躺着"）。
2. **上游 ~891 行、design 全仓 0 命中；但我们的「数据桥」已经建好了** —— `game/data/unity/items.json`（**612 条，`effects[]` 已内嵌**）
   由 `tools/build-unity-data.mjs:538` 生产。⇒ 本线缺的是**规则与归属**，不是数据。
3. **最关键的一句话**（本线的立线支点）：
   > **道具的「效果」不是本线的东西。** `Item.GetEffects()`（`Item.cs:70-78`）产出的就是**域线 D3 的 `Effect`**。
   > 本线只定"**哪个道具带哪几条 effect / 能用几次 / 消耗什么 / 能不能买卖**"，**不建第二套效果引擎**。
4. **目标**：给道具一份**能落地**的设计 —— 表与查询面、背包面、使用规则、买卖规则，以及它们与 save / 编排 / View / 引擎的接线。
5. **今天不做的部分要写清楚**（§1.2 圈外），免得被读成"道具线什么都能干"。

---

## 1. 范围与边界

### 1.1 圈里（本线负责）

| 面 | 内容 | 上游落点 |
|---|---|---|
| **表与查询面** | 静态行的**形状**（7 列 + option 派生）、三张词表、两个枚举、排序与归类、`getId` 归并 | `ItemInfo.cs` / `ItemDatabase.cs` |
| **背包读写 API** | `add / remove / find / findAll` 的**语义**（0 即删条目、`getId` 归并、**不抛错**） | `Item.cs:107-187` |
| **使用规则** | 「能不能用」`IsUsable`、「用几次」`GetMaxUseCount`、「扣多少」消耗策略、「生效什么」= **展开成 D3 的 `Effect` 列表** | `Item.cs:287-345` + 两个 handler |
| **买 / 卖** | 价格公式（`price * num`）、币种 = **另一件道具的 id**、不足时的判定 | `Item.cs:189-275` |
| **数据血统登记** | 重启血统 `unity/items.json`（已建）vs 原版 AS3 血统 `game/data/items.json`（已建）**不合并** | §3 现状 |

### 1.2 圈外（三条边界 · 明确不越界）

| 不归本线 | 归谁 | 可核 |
|---|---|---|
| **效果的 DSL 与语义**（`Effect` 七段 + 四张词表 + 三个往返） | **D3** `docs/domain/domain-effect.md` | `Item.cs:70-78` 直接用 `new Effect(x)` |
| **效果的执行与算子**（22 算子、`Condition` / `CheckAndApply`） | **E4 / E5** | `ItemEffectHandler.cs:16` 调 `handler.CheckAndApply(state)` |
| **`game/core/**` 里的道具逻辑**（今天**零**） | **本线的 core 半**，但**只出纯函数**；**不许直调 `Item` 静态** | `docs/engine/battle-engine-session.md §S13 ⑤`；`find game/core -iname '*item*'` = 空 |
| **存档字段名与形状**（`itemStorage` / `<Item id num>` / `itemBag`） | **Save 线** | `docs/save/save-xml-spec.md:32/204` |
| **写盘时机**（上游把 `SaveSystem.SaveData()` 写在 `Item.Add/Remove` 里） | **编排线**（在事务边界调 **R4**）；本线只**返回结果** | `Item.cs:122/135/169/182`；人类决议 ③ |
| **弹窗**（"X 个 Y 已经放入背包" / "购买成功" / "N 不足无法购买"） | **R5 sink**（本线只给**文案 key + args**）+ **C2 面板** | `Item.cs:95-105/196/230`；人类决议 ③ |
| **面板**（`ItemBag` / `ItemShop` / `ItemHintbox` / `Lottery` / `Cook` / `Pond` / `Workshop`） | **C2** `docs/view/panel/view-panels-item.md`（待写） | `docs/view/view-design.md:356` |
| **战斗内的"用药"回合** | **E6 + 原版血统** `game/logic/phases/item.js` + `game/data/rules.json:77` | 见 §4.3 + **ITQ8** |
| **肉鸽（异界）的 `itemBag`**（商店分支 / buff 430000 / 一次一个） | **T2·9 肉鸽** | `ItemShopController.cs:91/95-99/106-110` |
| **牧场 / 融合 / 工坊 / 任务 / 活动的道具消费侧** | **T2·8 / T2·15 / T2·1 / T2·16 / T2·17** | `ItemDatabase.ToLandType`（`:103-112`）= 牧场向 |

> ⚠️ **一句话边界**：**本线 = 道具的"名词"与"动词"，不是它的"形容词"**（效果是什么 = D3/E4/E5）**也不是它的"舞台"**（面板 = C2 / 落盘 = 编排线）。

---

## 2. 上游真值（逐件 · 行号实测）

### 2.0 全貌

| 件 | 文件 | 行 | 一句话 |
|---|---|---|---|
| 静态行 | `MVC/Model/Basic/Item/ItemInfo.cs` | 163 | 一行 CSV = 一个道具的**常量**（7 列）+ option 派生的 `resId`/`getId`/`removable` |
| 词表 | `MVC/Model/Basic/Item/ItemDatabase.cs` | 161 | **三张词表**（type 串↔枚举 / 枚举↔中文名 / 类别→type 列表）+ **两个枚举** |
| 实例 | `MVC/Model/Basic/Item/Item.cs` | 346 | `{id, num}` 实例 + **背包 API** + **10 个查询面** + **使用 / 买卖**入口 |
| 使用·结算 | `MVC/Model/Basic/Item/ItemEffectHandler.cs` | 29 | `UseDefault`（循环 N 次效果、**最后一次结算**）/ `UseExp`（**绕开 DSL** 直接加经验） |
| 使用·次数 | `MVC/Model/Basic/Item/ItemUseCountHandler.cs` | 53 | 四种"最多用几次"：药剂 / 经验 / 学习力 / 搜集品 |
| 面板控制器 | `MVC/Controller/Panel/ItemShopController.cs` | 139 | 商店面板装配（**归 C2**；本线只要它调的 `Buy/Sell` 规则） |
| | **合计** | **891** | 与 `totalk.md` T2·5 记的 `~891` 一致 ✅ |

**主线（数据流）**：

```
Resources/Data/Items/info.csv (612 数据行)
        └─→ ItemInfo(行) ──→ Database.instance.itemInfoDict ──→ ItemInfo.database（排序）
Resources/Data/Items/effect.csv (612 数据行)
        └─→ Effect(预制体) ──→ item.effects[]  （装载期 SetEffects 注入到行上）
                                          │
            存档 <Item id num/> ─→ Item{id,num} ──→ Use() ──→ 展开成 List<Effect>（D3）
                                                              └─→ EffectHandler.CheckAndApply（E5）
```

### 2.1 `ItemInfo` —— 静态行（**只读常量**）

- **7 列**（`DATA_COL = 7`，`:13`；表头实测 = `id, name, type, price, option, description, effect`）。
- **`price` 列是三形态**（`SetCurrencyTypeAndPrice`，`:73-87`）：
  - 无 `[...]` ⇒ `currencyType = COIN_ID(1)`（赛尔豆），既价格；
  - `1[D]` ⇒ `currencyType = DIAMOND_ID(2)`（星钻）；
  - `1[6]` ⇒ `currencyType = 6`（**数字 = 另一件道具的 id**，见 §2.5）。
- **option 派生三件**（`InitOptionProperty`，`:67-71`）：`resId`(默认 `id`)、`getId`(默认 `id`)、`removable`(默认 `true`)。
  ⇒ **`getId` 是"背包归并键"**（同一 `getId` 的不同 id 在背包里算一格，实测 **78 条** `getId ≠ id`）。
- **排序**（`:14-15`）：`database = itemInfoDict.Values.Where(!=null).OrderByDescending(x => x.id.GetSortPriority())`
  ⇒ 用 **D7 G12** 的纯整数助手 `GetSortPriority`（⚠️ 它今天住在 `Helper/HelperMath.cs:13` 的 `namespace UnityEngine` 里，**先下沉到 `core/mathf.ts` 才能用**）。
  **它的语义**（`docs/domain/domain-info.md §7` 第 17 条）：正数 → `int.MaxValue - x`、**负数原样** ⇒ 降序后 = **正 id 升序在前、负 id（Mod）在后**，`id == 0` 的优先级恰为 `0` ⇒ **照搬，但必须搬家**。
- **`IsMod(id) => id < 0`**（`:35`）：**负数 id = mod 资源**（图标目录不同）。
- **取数面**（`GetItemInfoIdentifier`，`:131-155`）—— 效果条件读道具字段的**唯一入口**：
  `option(x)` / `option(k:v)` / `type(x)` / `id` / `getId` / `type` / `price` / `currency` / `removable`，**未命中 ⇒ `float.MinValue`**。
- **图标**（`GetIcon(resId)`，`:116-129`）：`resId` 是数字 ⇒ Addressables `Items/<resId>`（`IsMod` 决定目录）；否则按名取。
- **描述**（`:89-105`）：`removable=false` ⇒ 前缀 `[ffbb33]【无限再生】[-]`；`effectDescription` 里 `habitat` option 存在时追加「获取方式：X」。
- **`SetEffects(List<Effect>)`**（`:65-67`）：**唯一**可变项 —— 装载期把 effect.csv 的行注到静态行上。

### 2.2 `ItemDatabase` —— 三张词表 + 两个枚举

| 词表 | 行 | 实测规模 | 备注 |
|---|---|---|---|
| `typeConvDict`（串↔枚举） | `:8-35` | **26** 项（`none` + 25 类型） | `ToItemType`(:83) 未命中原样兜底为 `None` |
| `typeNameDict`（枚举→中文名） | `:37-64` | 26 项 | `ToTypeName`(:91) 未命中为"无" |
| `categoryDict`（类别→type 列表） | `:66-81` | **12** 个类别 | `IsInCategory`(:95-101)；**`All` ⇒ 排除 `Currency`** |
| `enum ItemType` | `:116-144` | **26** 值 | 与 `typeConvDict` 一一对应 |
| `enum ItemCategory` | `:146-161` | **13** 值（`All` + 12） | |

- ⚠️ **反查取插入序第一个**（`ToRawString`，`:87-89`：`typeConvDict.First(x => x.Value == type).Key`）
  ⇒ 与 **D0 §1 V1**（词表反查取插入序第一个）**同族**；本线沿用该口径，**不改字典序**。
- `ToLandType`（`:103-112`，`"water"/"insect"/"nest"/默认 Land`）是**牧场向**（T2·8 的消费方）—— 本线**只登记**。

### 2.3 `Item` —— 实例 / 背包 API / 查询面

- **存档形状**：`[XmlRoot("item")]` + `[XmlAttribute] id` + `[XmlAttribute] num`（`:9, :37-38`）
  ⇒ 落盘就是 `<Item id num/>`（与 `docs/save/save-xml-spec.md:32` 一致）。
- **`effects` 是计算属性**（`:40`，`[XmlIgnore]`）：`GetEffects()`（`:70-78`）= `info.effects.Select(x => new Effect(x))` + 逐条 `e.source = this`
  ⇒ **每次调用都是新对象**（→ §6 **ITC2**）。
- **`itemStorage`（`:32`）= `Player.instance.gameData.itemStorage`** ⇒ **全局单例直取**（我们的纪律见 **IT2**）。
- **`Parse(text, defaultNum=1, delim="/")`（`:59-63`）**：走 `Linear<int>.Parse(text, x => (int)Identifier.GetNumIdentifier(x), ...)`
  ⇒ 道具串（`"300001/2"`）**由域线 `Identifier` 解析**（不是本线自造解析器）。
- **10 个静态查询面**（`:14-30`）—— 表驱动的**预筛集合**，各有消费方：

| 查询面 | 筛法（要点） | 消费方（归属） |
|---|---|---|
| `petItemDatabase` | 非技能书 **且** 所有 effect 都是 `SetPet` **且** `id == getId`；`num=9999` | C1/C2 宠背包 |
| `pvpItemDatabase` | 在 `petItemDatabase` 上再按 effect option `type` 排除 `exp/level/skinId/iv/emblem/evolve` | **T2·7 PVP** |
| `pvpPotionItemDatabase` | `type == HpPotion && id == getId` | T2·7 |
| `animalItemDatabase` / `animalProductItemDatabase` | `type == Animal` / `AnimalProduct`；`num=-1` | **T2·8 牧场** |
| `plantItemDatabase` / `normalPlantItemDatabase` | `type == Plant`；后者再排 `options.rare` | T2·8 |
| `skillBookItemDatabase` | `id - 100000` ∈ `[minSkillId, maxSkillId]` 且 `currencyType == 6` | 技能学习（秘技入口） |
| `yiteGrowItemDatabse` | `id ∈ [9001, 9020]`（⚠️ 上游拼写 `Databse`） | **T2·9 肉鸽** |
| `achievementItemDatabase` | `type == Achievement` | 成就/称号 |

- **背包 API**（全部 `SaveSystem.SaveData()` 落在函数尾部）：

| API | 行 | 语义 | 写盘 | 找不到时 |
|---|---|---|---|---|
| `Add(Item)` | `:154-170` | 按 `info.getId` 归并；`num<=0` 直接 return | `:169` | — |
| `AddTo(item, storage)` | `:107-123` | 同上，**指定背包** | `:122` | — |
| `Remove(id, num=1)` | `:172-187` | `num<=0` ⇒ 删条目 | `:182` | **`throw`（`:186`）** |
| `RemoveFrom(id, num, storage)` | `:125-140` | 同上，**指定背包** | `:135` | **`throw`（`:139`）** |
| `Find(id, storage=null)` / `FindAll(pred, storage=null)` | `:142-152` | `storage ??= itemStorage` | — | 返回 `null` / 空表 |
| `IsNullOrEmpty(item)` | `:65-68` | `null` 或 `num <= 0` | — | — |

### 2.4 使用规则（本线的**核心动词**）

**`IsUsable(invokeUnit, state)`（`:287-298`）** 三个前提：非空调用者 **且** `num > 0` **且**
（`EffectHandler.Condition(state, state == null)` 里有任一为真 **且** `GetMaxUseCount(...) > 0`）。
⇒ **"能不能用"不是道具有没有用，而是"在这件东西身上还有没有效果"**（例：满血用补血药 = 不可用）。

**`Use(invokeUnit, state, useCount=1, petBagMode=Normal)`（`:300-323`）** 的**四步**：

1. `EXP` 类型 **且** effects 里**没有** `max_use` option ⇒ `UseExp`（**绕开 DSL**，见 §6 ITC3）；否则 `UseDefault`。
2. **`petBagMode ∉ {Normal, YiTeRogue}` ⇒ 直接 `return count`（不消耗）**（`:306-307`）—— 那些是"**假背包**"（试看 / 图鉴 / PVP 配装）。
3. `removable` ⇒ 真消耗：`Normal` 用 `Item.Remove`，否则 `RemoveFrom(..., YiTeRogueData.instance.itemBag)`（`:309-315`）。
4. `removable == false` ⇒ **只 `SaveData()`、数量不变**（`:317`）—— 即【无限再生】。⚠️ 这里的落盘是为了**记住效果已生效在宠物身上**，不是记道具。

**`GetMaxUseCount(invokeUnit, state)`（`:325-345`）**：先看 effects 里有没有 `max_use` option ⇒ `StuffMaxUseCount`；
否则按 **type 的 switch**：`Evolve/Emblem/IV/Personality/Skill/Buff/Capture` **恒 1**、`HpPotion/EXP/EV/Stuff` **各走一个函数**、**`_ => int.MaxValue`**（其余类型**不限次**）。

**两个 handler 的细节**（本线必须逐条复刻 / 或显式改判）：

| 函数 | 行 | 行为 |
|---|---|---|
| `UseDefault` | `ItemEffectHandler.cs:7-18` | `count = min(item.num, useCount, maxUseCount)`；**循环 count 次**，每次**重新取** `GetEffects()` 并塞中性的 `pet_bag_mode` option，累加到**同一个** `handler`；**最后一次性** `CheckAndApply(state)` ⇒ **"用 N 个"= N 份效果一起结算**，不是逐份落地 |
| `UseExp` | `:20-28` | **不走效果系统**：读 `SetPet` 的 `value`（**可含宠物标识符**，走 `pet.TryGetPetIdentifier`）⇒ `pet.GainExp(exp * count)`；`maxCount = ceil((maxExp - totalExp) / exp)` |
| `HpPotionMaxUseCount` | `ItemUseCountHandler.cs:8-19` | 战斗外 `ceil((normalHp - curHp) / heal)`（**补满为止**）；**战斗中恒 1** |
| `ExpMaxUseCount` | `:21-26` | `ceil((maxExp - totalExp) / exp)`（**升满为止**） |
| `EvMaxUseCount` | `:28-39` | `type == "evReset"` ⇒ 1；否则 `ceil((510 - ev.sum - evStorage) / ev)`（**510 是学习力上限**） |
| `StuffMaxUseCount` | `:41-51` | `effects.Min(ceil(Parser.ParseEffectOperation("max_use", ...)))` ⇒ **走域线 E4 算子求值**（战斗外 `rhsUnit = null`、`isSimulate = false`） |

### 2.5 买 / 卖（`Item.cs:189-275`）

- **价格公式**：`total = info.price * num`。
- **币种 = 另一件道具的 id**：`info.currencyType` 直接当 `Item.Find(currencyType)` 去查 ⇒ **币种 id 必须是表里的条目**（否则 `currencyInfo.name` 空引用）。
- **流程（两步弹窗）**：① 币不足 ⇒ 弹"X 不足无法购买"**并返回**；够 ⇒ 弹"确定要购买 N 个 Y 吗" + 回调；
  ② 回调里 `OnBuySuccess` ⇒ `Remove(price)` + `Add(item)` ⇒ 再弹"购买成功"。
- ⚠️ **默认背包分支会写活动计数**（`OnBuySuccess :216-217`）：`Activity.Shop.SetData(itemId, 已买 + num)` ⇒ **依赖 T2·17 活动线**。
- `Sell`（`:235-275`）同构：`item.num < num` ⇒ 弹"物品不足无法出售"；成功 = `Remove(item)` + `Add(price)`。

### 2.6 `ItemShopController`（139 行）—— **面板控制器，归 C2**

- 只有**装配与转发**：`SetShopMode/SetDescriptionMode/SetCurrencyType/SetTitle/SetStorage/SetDescriptionFontSize`、
  `OnItemChange/OnItemNumChange`（详情与总价），`OnBuyItem/OnSellItem`（`:85/:122`）⇒ 最后落到 `Item.Buy/Sell`（`:119/:136`）。
- **肉鸽分支**（`:91/:95-99/:106-110`）：`ItemShopMode.BuyYiTe/SellYiTe` ⇒ `storage = YiTeRogueData.instance.itemBag`；
  buff `430000` ⇒ 买一送二；**一次只能买一个**。⇒ 全部归 **T2·9**。
- ⇒ **本线只定 `Item.Buy/Sell` 的规则**；上列 UI 行为属 C2，肉鸽属 T2·9。

### 2.7 边界外（点名 · 别捞进来）

| 件 | 归属 |
|---|---|
| `MVC/Controller/Pet/Basic/PetItemController.cs`(152) / `PetItemModel.cs`(49) / `ItemDetailView.cs`(48) / `PetItemView` / `PetItemBlockView` | **C1 / C2**（面板族） |
| `MVC/Controller/Workshop/WorkshopItem{,List,Learn}*.cs` + `Model/Workshop/WorkshopItem*`(302+70+66) | **T2·1 工坊**（未立） |
| `MVC/Controller/Battle/BattlePetItemController.cs`(74) / `View/Battle/*BattlePetItemView.cs`(26) | **战斗 View（U5/U2）+ 引擎** |
| `Farm/Animal`、`Farm/Plant` 的道具面 | **T2·8 牧场**（未立） |
| `game/data/rules.json:77` 的 `items.{heals,rage,combo}`（`tools/build-data.mjs:125`） | **原版 AS3 血统**的战斗药剂池 —— **不是**本线的重启道具表（见 **ITQ8**） |

---

## 3. 我们的现状（**实测** · 2026-10-17）

| 面 | 现状 | 证据（可核） |
|---|---|---|
| **重启表（L2 桥）** | ✅ **已建**：`game/data/unity/items.json`，**612 条**，键 = `id,name,typeRaw,typeId,rawPrice,currencyType,price,options,resId,getId,removable,itemDescription,effectDescription,effects`（**`effects[]` 已内嵌**） | 生成器 `tools/build-unity-data.mjs:538` |
| 表的统计 | 25 种 `typeRaw`（= 上游 25 类型 ✅）；**365 条**带非 `none` 效果；429 条有 options；**30 条** `removable=false`；**78 条** `getId ≠ id`；币种取值含 1–9 与一批大数（如 `290001`、`610003`） | `node -e` 直读 |
| **原版表（另一血统）** | ✅ **已建**：`game/data/items.json`（原版 `ItemConfig` XML → **未合成任何条目**）+ 图标抓取器 `tools/fetch-item-icons.mjs`（**只抓点名 id**，落 `icon`/`iconOrigin`） | `tools/build-items.mjs:1,13` |
| 效果预制体表 | ✅ 已建：`game/data/unity/effects.json`（`prefabs`）—— **归 D3**（D3:327） | `docs/domain/domain-effect.md:37/327` |
| **L1 背包面** | 🟡 **只有数量**：`addItem` / `consumeItem`（**各两套**：官方宇宙 `game/logic/session.js:129/:135`，重启宇宙 `game/logic/restartSession.js:93/:98`）；`consumeItem` 返回 `bool`、0 即删条目 | 两文件 |
| **L1 战斗用药** | 🟡 **已有**：`game/logic/phases/item.js`（37 行）`findPotion`/`usePotion` —— 消耗 + 算量，**hp 落点由页面执行** | 该文件 |
| 战斗药剂池（原版血统） | 🟡 `game/data/rules.json:77` 的 `items.heals/rage/combo`；消费方 `game/app/scenes/battleScene.js:334` | `tools/build-data.mjs:125` |
| **View** | 🟡 `game/app/view/panels/restartItemBagView.js`（115 行，**只读**，明写"本轮不做使用"）；`game/app/view/panels/battle/itemBoardView.js`；`game/app/view/petbag/itemPane.js`（**3 行 6 列空壳**，内容等 C2） | 三文件 + `docs/view/panel/petbag-impl.md:221` |
| 内容面 | ✅ `game/app/content.js`：`itemById` Map、`restartItemOf`/`restartItemNameOf`/`restartCaptureEffectOf`/`restartItemTypeOf` | `content.js:28/36/170/178/188` |
| 场景 | 🟡 `game/app/scenes/mapScene.js:88-96` **硬编码** `STARTER_ITEMS` 15 条（`{id,count}`） | 该文件 |
| **`game/core/**`** | ❌ **0 个道具对象**（`find game/core -iname '*item*'` 为空） | 与 E6 §S13 ⑤ 的实测**一致** |

> **一句话现状**：**数据齐、桥齐、"数量"齐；缺的是"规则"（用几次 / 生效什么 / 消耗谁 / 能不能买卖）与"归属"（core 里没有它的位置）。**

### 3.1 静图离线提取 = `tools/swf2svg.mjs`（人类 2026-10-20 点名 · 第一批 = 道具/装备图标）

> 人类口径：「一些 swf 文件本身只是一张图片……矢量图提取为 svg 到 `./svg/`、位图提取为 png 到 `./png/`，运行时就不必再挂 Ruffle。」

- **范围（人类选定）** = `swf/item/**` + `swf/pet/icon` + `swf/nono`，**1831 个**【样本：全单帧、无位图定义】。
  地图位图（`swf/map`）与多帧复合（`swf/fight`）**留后批**，本批不动。
- **命令**：`node tools/swf2svg.mjs swf/item swf/pet/icon swf/nono --out=svg --png=2`
  ⇒ 矢量入 `svg/<源路径去掉 swf/>.svg`；`--png=N` 再经 `rsvg-convert` 光栅化入 `png/….png`（= 舞台像素 ×N）。
- **路线**（人类点名"自研、复用 `game/swfshape.mjs`"，**不 import JPEXS/ffdec**）：建模 = 形状 tag 2/21/32/83 + 精灵 39 + 实例 26/70 +
  样式表（实心 / 线性 / 径向渐变含焦点）+ LineStyle4 + CXCT + 矩阵 + 记录区中途 `NEW_STYLES` 换表（**每个子路径在打开那刻绑走当时的样式**）。
  `game/swfshape.mjs` 是**手写工具库、运行时零 import** ⇒ 不触 `docs/arch-code.md §3` 的分层。
- **产出与体检**【样本 2026-10-20】：SVG **1831** / PNG **1830**（@2x，共 62M + 25M；**另有 1 个软链拒写** = 见下面那条事故）、**失败 0**、**位流漂移 0**（每个形状都正好停在 tag 末尾 ⇒ 字节对齐成立）、警告 **746** 条（解析侧，另有软链拒写 1 条）。
- **未覆盖 = 如实登记、不伪造**（`AGENTS.md §2` 的"声明 + 不照搬"在本批的对应物 = **声明 + 不画**）：

| 限制【样本：警告条数 / 涉及文件数】 | 画面后果 |
|---|---|
| PlaceObject 滤镜（发光 / 投影 / 模糊）**453 / 136** | 图标的外发光与投影丢失（边缘变"干"）；样本 `100241`、`100352`、`100392` |
| `clipDepth` 掩膜 **129 / 129** | 本该被裁掉的部分**露出来**；样本 `101371`、`swf/pet/icon/1.swf` |
| 根显示列表为空 ⇒ 回退画 `SymbolClass` 导出类 **94 / 94** | 首批 `swf/item/equip/icon/100034`–`100059` 全属此类；画面 = 该类的首帧 |
| 角色定义在**未建模标签**里（tag22 = 「成对 `00 RR GG BB` 样式」的大字块、tag34 = 13 字节桩）**55 / 31** | 该图层**丢失**、其余图层照常出。**不猜这两种标签的语义**，只把字节事实报成"候选出处" |
| 文件里**真没有**该角色定义 **7 / 4** | `swf/item/equip/icon/{100701,101622,101651,101738}.swf` 引用了盘上无定义的 character#1/2/3 |
| 形状解析抛出（`unknown fill style 0x5b/0xaa/0x1c/0xff`）**4 / 3** | 整个形状跳过 ⇒ **`101622.swf` = 0 路径 = 空 SVG**。实测其记录区前 **2371 条完全同步**（零越界；首表 1 个实心样式、第 2 张 63-fill/8-line 表都解得干净），断在下一条记录的"表首"读到 `0xb8`/`0xaa`；**这段 12 字节异常全批只此 1 例**、blob 内无 JPEG/PNG/GIF/ZIP/zlib 签名 ⇒ 记为**文件级发行数据异常**，不是我们的系统性缺口 |
| 位图填充（`0x40..0x43`）**1 / 1** | `swf/pet/icon/535.swf` 少一条路径 |
| 多帧 sprite **2 / 1** | `swf/item/equip/icon/101070.swf` 有 19 帧 ⇒ **只取第 1 帧** |

- ⚠️ **事故登记（1 条 · 必读）**：本批首次跑 `--png` 时，输出目录里 **`png/item/icon/1.png` 是 2026-10-19 建的软链**（指向
  `projects/Seer2-Restart-Lite-main/Resources/Items/1.png` = 货币**赛尔豆**图标，见 `docs/view/panel/playerinfo/restart-playerinfo-panel.md:71`），
  而 `rsvg-convert -o` **跟随软链把原图覆盖了**。【样本】该文件**不在 git**（`.gitignore` 排除整棵 `Resources/`）、
  源 zip **没有** `Resources/Items/`（客户端运行期下载物）、全盘**无第二份副本** ⇒ **原 PNG 不可恢复**。
  影响面 = `Resources/Items/` 302 个文件**只中这 1 个**（其余软链本批无同名源）；替身 = 我们 `swf/item/icon/1.swf` 的 @2x 渲染
  （该文件导出 **14 条路径、零警告** ⇒ 同一图标的矢量重栅格化，尺寸/抗锯齿与官方 PNG 不同）。
  **修补已落**：`tools/swf2svg.mjs` 加**软链拒写**（目标是 symlink ⇒ 不跟随、记警告并在汇总报 `软链拒写 N 个`），复跑实测 `软链拒写 1 个` 生效。
- **本批待拍板 ①②③ · ✅ 已由人类 2026-10-20 全部拍板**（解说的正文在交付回复里）：
  ① **产物不入库**（`svg/` 62M + `png/` 25M 共 3662 个）⇒ 落点 = `.gitignore:51-55`（`/svg/`、`/png/*`，
     并**逐层例外放行 `png/item/icon/`** = 2026-10-19 建、**已入库 302 条**的官方图标软链，它们不是本批产物）；
     ⇒ 换机/克隆后要用得**重跑命令**，产物本身不是真值。
  ② 被覆盖的 `Resources/Items/1.png` ⇒ **维持现状**（就用同一 swf 的矢量重栅格版顶上，不另取原图、不改软链）。
  ③ 上表八行未覆盖 ⇒ **都不补**（发光/掩膜/缺图层/位图/多帧一律按"图标够不够用"结算，不新开实现批）。
- **消费端接线（PI-static · 人类 2026-10-20 点名「信息面板中的装备和坐骑图标应当改为调用相应的 svg 或 png」）**：
  产物不是自娱 —— L3 共享装载器 `game/app/view/item-art.js` 已把取图顺序改成**四级**：
  ① `/png/<与 swf 同路径>`（本工具产物）→ ② Ruffle 播 `/swf/…`（仅①缺件且调用方要 swf）→ ③ Unity `Resources/` PNG → ④ 色块 tile + `assetMissing`。
  新增导出 `itemStaticUrl(resId)` = `itemSwfUrl(resId)` 同路径换前缀/扩展名（路径型 resId 无镜像 ⇒ 返回 `null`）。
  消费者实测三家 = **个人信息面板**（装备/坐骑 44px 网格 + 已装配条 22px ⇒ 静图齐时**在册 Ruffle 播放器 = 0**）、
  **商店**、**道具背包**（后两家原先 `useRuffle=false`、装备 id 在 Unity 树里无 PNG ⇒ 从注定色块变成出图）。
  正本 = `docs/view/panel/playerinfo/playerinfo-design.md §3.8`（PI-static 条）；as-built = `playerinfo-impl.md §7.7`（施工批 **PI-i**）；手测 = 同文档 **§8 #19**。
- **本批等人手测确认项**（`AGENTS.md §1.1`）：③ 已把"缺效果要不要补"问死了 ⇒ 剩下的手测**只盯一件事** =
  **有没有哪个图标是"画错/画空"而不是"缺效果"**（唯一已知空画面 = `swf/item/equip/icon/101622.swf`）；
  有就点名个案，没有就本批结账。

---

## 4. 目标形状

### 4.1 落点（建议）

| 落点 | 内容 | 纪律 |
|---|---|---|
| `game/core/item/item-info.ts` | 静态行的**形状**与派生（`resId/getId/removable`、价格三形态、`GetItemInfoIdentifier` 取数面） | **纯**（无 DOM、无 storage、无单例） |
| `game/core/item/item-database.ts` | 三张词表 + 两个枚举 + `classify` / `isInCategory` / 排序键 | 排序键用 **`core/mathf.ts` 的 `sortPriority`**（**先做 D7 G12 的下沉**） |
| `game/core/item/item-use.ts` | `maxUseCount(...)` / `useCount(...)` / `effectsFor(item, count)`（**只展开成 D3 的 `Effect` 列表**） | **不执行**效果（执行 = E5） |
| `game/logic/item/store.js` | 背包面：`add / remove / find / findAll`（**入参 = `state.items`**，**返回 `bool`，不抛错，不落盘**） | 写盘由**编排线**在事务边界调 **R4** |
| 接线 | C2 面板的「使用」、E6 §S13 ⑤ 的**注入 item 面** | 见 §4.2 / §4.3 |

> ⚠️ **`game/core/**` 里不许出现 `Item` 静态直调**（E6 §S13 ⑤）；core 只出**纯函数**，背包与落盘都在 L1 以上。

### 4.2 目标 API（上游 → 我们，**逐条对照**）

| 上游 | 我们 | 差异理由 |
|---|---|---|
| `ItemInfo.database`（读 `Database.instance` 单例） | `itemDatabase(itemsJson)` —— **表由调用方传入** | 去单例（§2.3 IT2） |
| `Item.itemStorage`（`Player.instance` 单例） | `store.add(state.items, ...)` —— **state 由调用方传** | 去单例 + 双宇宙（IT6） |
| `Item.Add/Remove` 尾部 `SaveSystem.SaveData()` | **不落盘**；返回结果，落盘交编排线 | 人类决议 ③（R4） |
| `Item.Remove` 找不到 ⇒ `throw` | **返回 `false`** | IT4 / **ITC1** |
| `Item.Use(...)`（结算 + 消耗**一体**） | 拆两半：`effectsFor()`（纯）+ 调用方的 `store.remove()` | ITC2 |
| `GetMaxUseCount` 的 type-switch | `maxUseCount(type, effects, pet, inBattle)` 纯函数 | 可测化（不靠单例） |
| `id.GetSortPriority()` | `sortPriority(id)`（`core/mathf.ts`） | **D7 G12** 的下沉 |
| `Item.Parse` 走 `Identifier` | 沿用 `core/...Identifier`（**不自造**） | 与域线同源 |

### 4.3 两条使用路径（**别混**）

- **战斗外（本线的活）**：面板点「使用」→ `maxUseCount()` 定 N → `effectsFor(item, N)`（D3 的 `Effect` 列表）
  → **E5 的 `condition` + `checkAndApply`**（页面已有先例：U2 捕捉用的就是 `effectFromRow` + `checkAndApply`）
  → 成功 ⇒ `store.remove(N)` → **编排线**落盘。
- **战斗内（**照旧**·见 ITQ8）**：`game/logic/phases/item.js` + `game/data/rules.json` 的**原版血统**药剂池 —— **本线不动**，
  直到 **E6** 拿到"注入的 item 面"再谈"战斗内用重启道具"。

### 4.4 与邻线的接线

| 邻线 | 接点 |
|---|---|
| **D3 / E5** | 本线**只产** `Effect` 列表；**判定与执行**全在 E5（本线**不写**算子） |
| **Save 线** | 字段名与形状**不改**（`<Item id num/>`）；**双宇宙**各一套 `state.items` |
| **编排线** | 事务边界落盘（R4）；启动期把 `unity/items.json` 装进 `content`（**已有**） |
| **C2** | 面板拿 `store` + `item-use` 的纯函数；**去灰化**「使用」按钮（U4 的欠账） |
| **E6** | 提供 §S13 ⑤ 说的"注入的 item 面" |

---

## 5. 不变量（**IT1–IT8** · 破了即 bug）

1. **IT1 · 效果 DSL 只有一个。** 道具 / 技能 / 印记共用 **D3 的 `Effect`**；本线**不得**新建效果类型或第二套解析。
   （可核：`Item.cs:70-78` 直接用 `new Effect(x)`。）
2. **IT2 · 背包写入口只有一个。** 所有数量变更走 `logic/item/store`（**入参 = 道具列表**）；**不许**直取 `Player.instance.gameData` 式单例；
   **`game/core/**` 不碰 storage**。
3. **IT3 · 0 即删条目。** `num <= 0` ⇒ 从列表移除（对齐 `Item.cs:178-181/:132-137` 与今天 L1 的 `consumeItem`）。
4. **IT4 · 数量不足不是异常。** 删不存在/不足 ⇒ **返回 `false`**、**不抛**（改上游 `throw`；见 **ITC1**）。
5. **IT5 · 表按 `id` 唯一、按 `getId` 归并。** 排序口径统一为 `sortPriority`（D7 G12；语义 = 正数 `int.MaxValue - x`、**负数原样**，与 `docs/domain/domain-info.md §7` 第 17 条同）；
   `getId` 是**背包归并键**（实测 78 条两者不同）。
6. **IT6 · 两个宇宙的道具表不合并。** 重启血统 = `game/data/unity/items.json`；原版血统 = `game/data/items.json`（+ `rules.json` 药剂池）。
   **战斗内**用药属原版血统（ITQ8），**战斗外**属重启血统。
7. **IT7 · 价格与币种三形态。** `N` ⇒ 豆；`N[D]` ⇒ 钻；`N[<id>]` ⇒ 数字币种 **= 另一件道具的 id**。
   币种 id **必须先查表**；查不到 ⇒ **不弹窗、明确失败**（见 ITC5）。
8. **IT8 · 存档字段名与形状不动。** `itemStorage` / `<Item id num/>`（Save 线正本）；本线**不改**字段名。

---

## 6. 上游怪癖 / 危险设计（**ITC1–ITC5** · 声明 + 改判）

> 口径 = `AGENTS.md §2`（**声明 + 不照搬**：写清症状与可观察后果，目标设计写"没有它"的行为）与 **人类决议 ②**。

| # | 位置 | 症状 | 可观察后果 | 目标行为 |
|---|---|---|---|---|
| **ITC1** | `Item.cs:139/:186` | 删一个**不在背包**里的道具 ⇒ **抛异常** | 把"数量不足"当**致命错误**；PVP/试看模式的"假背包"用一次就炸 | **返回 `false`**（IT4）；由调用方决定提示 |
| **ITC2** | `Item.cs:70-78` | `GetEffects()` **每次调用都新建对象**；`UseDefault` 在循环里**每次重新取**（`ItemEffectHandler.cs:12`） | 效果对象的**身份不稳定**（改了 `source` 或 option 不会串味，但同一道具两次使用拿到的是**不同**对象） | core 出**纯函数**：`effectsFor(item, count)` 一次产出**确定**的列表；对象身份不参与语义 |
| **ITC3** | `Item.cs:304` + `ItemEffectHandler.cs:20-28` | **`EXP` 道具走 `UseExp` 快路**，**绕开效果 DSL**（直接 `GainExp`） | 经验道具的 `effects` 里除 `SetPet` 外的其它效果**不会生效**；`maxUseCount` 语义也不同（按满级算） | **照搬该可观察行为**，但写成**一条显式规则**（不留在隐含特例里） |
| **ITC4** | `Item.cs:14-21` | `pvpItemDatabase` = `petItemDatabase.Where(...)`，且内外两层都用了 `All(...)` ⇒ **空 `effects` 集合的 `All` 恒为 `true`** | **没有任何效果的道具会同时通过两层筛选**，被打进宠用/PVP 道具池 | 筛选**显式要求 `effects` 非空**；`All` 的空集语义**不参与**筛选判定 |
| **ITC5** | `Item.cs:193` | `GetItemInfo(info.currencyType)` **不判空**，随后用 `currencyInfo.name` | 币种 id 不在表里 ⇒ **空引用**（崩在弹窗文案上） | **先查表校验**币种 id；查不到 ⇒ 明确失败、不弹窗（IT7） |

---

## 7. 待拍板（**ITQ1–ITQ8** · 本线局部编号）

| # | 问题 | 事实（可核） | 我的建议（不算结论） |
|---|---|---|---|
| **ITQ1** | **使用规则落在 `core` 还是 `logic`** | 上游 `IsUsable/Use/GetMaxUseCount` 全在 Model，且**直接碰单例与存档** | **core 出纯函数**（表 / 归类 / `maxUseCount` / `effectsFor`），**logic 出背包面与消耗时机** ⇒ 才能满足 E6 §S13 ⑤ |
| **ITQ2** | **「使用」按钮去灰化**归本线还是 C2 | `docs/view/ui-handoff.md` U4 只落了**只读**；`docs/view/panel/petbag-impl.md:221` 的道具子面板是**空壳** | **本线给规则（core/logic），C2 画面板与点击**；两者**同批验收**（U4 的欠账） |
| **ITQ3** | **图标** | 上游 `GetIcon` 走 Addressables `Items/<resId>`（`ItemInfo.cs:116-129`）；重启 Lite **无该资源**；另血统有 `tools/fetch-item-icons.mjs` | **沿用 U4 口径**（类型色块 + 名），图标**按需点名抓取**（不乱抓 612 张）。**2026-10-20 追加**：人类点名把"本质是静图"的 SWF **离线提取**（`tools/swf2svg.mjs` ⇒ `svg/` + `png/`，第一批 = `swf/item` + `swf/pet/icon` + `swf/nono` **1831 个**）⇒ 本条的"按需抓取"不变，只是取来的是**静图产物**、运行时**不必挂 Ruffle**；限制/事故/待拍板 = **§3.1** |
| **ITQ4** | **买 / 卖做不做** | 依赖 **C2 商店面板** + `Activity.Shop` 计数（⇒ **T2·17** 未立） | **先落 `Buy/Sell` 的纯规则**（价格/币种/不足判定），面板与活动计数**等 C2 / T2·17** |
| **ITQ5** | **10 个查询面哪些属本线** | 7 个的消费方**都还没立**（PVP T2·7 / 牧场 T2·8 / 肉鸽 T2·9 / 秘技 / 成就） | 本线只落**表 + 归类**（`classify`/`isInCategory`）；**各筛选随消费方立**（别替未立的线预判） |
| **ITQ6** | **`removable=false`（无限再生）保不保留** | 实测 **30 条**；上游语义 = 用后数量不变、只落盘（`Item.cs:317`） | **保留**（是发行数据的行为，不是 bug）；在 §8 人手测项里验一次 |
| **ITQ7** | **T2·15 融合吃的 Item 表归谁** | `docs/domain/domain-info.md §3.3 B7` 推给"等 Item 族" | **归本线**（融合配方吃 Item 表 + 消耗道具）；具体等 **T2·15** 谈（本线只留接口位） |
| **ITQ8** | **战斗内用药走哪套血统** | 今天走 `game/logic/phases/item.js` + `rules.json:77`（**原版**）；重启表 `unity/items.json` 是**另一套** | **战斗内照旧走原版池**（它是 AS3 战斗引擎的一部分）；重启道具的「使用」**只在战斗外**生效，直到 E6 有注入 item 面 |

---

## 8. 等人手测确认项（`AGENTS.md §1.1` 口径：**主验收 = 人手测**）

> ⚠️ **不写测试脚本**（决议 ⑦ 的加严）。以下是"**请人测什么、看哪里**"的清单；落地后由人类跑游戏反馈。

| # | 场景 | 看哪里 | 期望 |
|---|---|---|---|
| 1 | **今天可测**：进图 → 开道具背包 | HUD「信箱」钮 → 面板列表（栏底「道具」格已摘除，人类 2026-10-19，见 `docs/view/scene/room/view-scene-hud-impl.md §12.10`） | 15 条 `STARTER_ITEMS` 的名称/类型/说明来自 `unity/items.json`；**只读** |
| 2 | **今天可测**：战斗内用一次药剂 | `#/battle` 或 `#/rbattle` 里用药 | 数量 **-1**、该宠回血正确（`logic/phases/item.js` 已有） |
| 3 | **落地后**：宠物背包「使用」经验道具 | C2 面板 | 经验按 `maxUseCount` 增长、数量按 N 扣；灰化解除 |
| 4 | **落地后**：用【无限再生】道具（`removable=false`，30 条之一） | 同上 | **数量不减** |
| 5 | **落地后**：数量不足时再点使用 | 同上 | **不抛错**、面板给提示（IT4/ITC1） |

---

## 9. 子地图与施工批

**子设计**：**暂不拆**（与 `docs/runtime/runtime-components-design.md` / `docs/orchestration/orchestration-design.md` 同判 —— 体量 ~891 行，单份可承载）。
若将来拆，建议按 §4.1 的落点分（`core/item` 与 `logic/item/store` 各一份）。

| 批 | 内容 | 依赖 |
|---|---|---|
| **ITB1** | 表与归类：`core/item/item-info.ts` + `item-database.ts`（`unity/items.json` 驱动） | **D7 G12 的下沉**（`sortPriority` → `core/mathf.ts`） |
| **ITB2** | 纯使用规则：`core/item/item-use.ts`（`maxUseCount` / `useCount` / `effectsFor`） | ITB1；D3 的 `Effect` |
| **ITB3** | 背包面：`logic/item/store.js`（`add/remove/find`，返回 `bool`，不抛错，不落盘） | ITB1；编排线的 **R4** 接点 |
| **ITB4** | 接线：C2 面板「使用」去灰化 + **E6 §S13 ⑤** 的注入 item 面 | ITB2 / ITB3 / C2 |
| **ITB5** | 买卖的**纯规则**（价格/币种/不足判定） | ITB1；**ITQ4 先拍**（本批只出规则，不出面板） |

**配对实现（impl）指针**：`docs/item/item-impl.md`（落地计划）· `docs/item/item-code-map.md`（代码地图）—— **均待阶段一续**（`AGENTS.md §1`）。
**上游源码地图**：本节 §2 已给逐件行号；`port-map` 式的逐条覆盖表在 impl 阶段补。
