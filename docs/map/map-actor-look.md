# M8 · 小赛尔外观：穿戴装备与骑乘坐骑（map-actor-look.md）

> **定位**：本份是地图线的**子设计 M8**，回答四件事 ——
> ① 原版小赛尔的**外观模型**是什么（裸装 / 11 槽位 / 套装 / 坐骑）；
> ② 这些外观的**源码与数据链**在哪（AS3 逐文件索引 + 登录/进图/换装/骑乘包）；
> ③ **素材**在哪、什么格式、已缓存哪些、还缺哪些、怎么补；
> ④ 复刻侧怎么接（当前 A2b JS 回退通路的扩展点、数据桥、会话/存档缺口、SWF 路的边界）。
>
> **状态**：✅ **已成文**；**`ALQ1=A` / `ALQ2=B` 已拍板（人类 2026-10-20）**，`ALQ3–ALQ8` 按建议默认（**`ALQ7` 当日晚些由 A 改 B**；`ALQ9` 由人类点名 = 光轮/阴影可切换）；
> **`ALQ10=A` / `ALQ11=A` 已拍板（人类 2026-10-21）** = 官服无包件不进玩家面目录 / 12 色独立成「颜色」组；缺件实名表 = **§5.7**；
> ✅ **配对 impl 计划 = `docs/map/map-impl.md §3.10`（`MDB8-a…g` + 插入 `b2`/`b3` + `M8-P1–P7` / `M8-I1–I6`，2026-10-20）**；
> ✅ **`MDB8-a`–`b3` 已落且手测通过（2026-10-20，人类「全部完美」）**：`a` = 数据桥 + L1 纯计划（as-built = `map-impl §7.3.15`，手测 = `§8.11`）；`b` = **JS 路 11 槽渲染**（as-built = `map-impl §7.3.17`，手测 = `§8.13`）；`b2` = **帧动画 + 4 向**（as-built = `map-impl §7.3.18`，手测 = `§8.14`）；`b3` = **光轮/阴影切换**（as-built = `map-impl §7.3.19`，手测 = `§8.14` 第 15–16 条）；`c` = **会话态 + 正式调试入口**（as-built = `map-impl §7.3.20`，手测 = `§8.15`，✅ 通过）；`d` = **坐骑速度 25/20 + 13 只浮动坐骑 ±5**（as-built = `map-impl §7.3.21`，✅ 人类「it worked good」）；`e` = **素材清单 + 缺包日志**（as-built = `map-impl §7.3.22`，`§8.17` ✅ 已通过（人类 2026-10-21「全部测试通过」））；`f` = **SWF 路叠层**（as-built = `map-impl §7.3.23`，`§8.18` 已随 ★M9-c 退役、不可测（等价判据 = `map-impl §8.23` ✅））；`g` = **存档 `<equip>` 接线**（as-built = `map-impl §7.3.24`，`§8.19` ✅ 已通过（人类 2026-10-21「全部测试通过」））；`f2` = **SWF 裸装角色显隐**（修「双角色」；as-built = `map-impl §7.3.25`，`§8.20` 已随 ★M9-c 退役、不可测（等价判据 = `map-impl §8.23` ✅））。
> 本份**不改**任何既有行为；当前线上 = **JS 图按外观计划合成 11 槽角色并播放帧动画**（站立 24fps 循环、走位 `run`、4 向 + 左右翻转；裸装素材与外观与 b 批同源；地面特效可在静止阴影 / VIP 光轮间手动切换，`b3`）；**SWF 图自 `f` 起在“有装备/坐骑且自定义包齐”时叠整只 canvas 角色，无装备仍为黄点基线；`f2` 起叠层真正画出时隐藏 MapRunner 自带的裸装角色（`actorVisible`），SWF 图只余一只角色**。
>
> **编号纪律**：`ALI1–ALIn`（不变量）/ `ALC1–ALCn`（上游怪癖·数据坑）/ `ALQ1–ALQn`（待人拍板）/
> `MDB8-a…g`（施工批草案）**全是本份局部编号**，不是 `AGENTS.md §5` 的圆圈数字「人类决议 ①–⑨」。
>
> **父文档**：`docs/map/map-design.md`（§9.1 子设计表 / §9.2 施工批）。
> **配对 impl**：`docs/map/map-impl.md §3.10`（`MDB8-a…g` + `f2` 已全落，as-built = `§7.3.15`–`§7.3.25`）。
> **邻线正本**：
> - 角色**像素/图层机制** = View 线 B3 `docs/view/scene/room/view-scene-map-content.md`（§2.2 角色）；
> - **道具定义/背包** = 道具线 `docs/item/item-design.md`；
> - **宠物数据/骑宠 flag** = D6 `docs/domain/domain-pet.md`；
> - **存档** = `docs/save/save-design.md` / `save-xml-spec.md`；
> - **面板 UI** = C1 `docs/view/panel/view-panels-pet.md` / C2 面板族；
> - **本线围栏** = `AGENTS.md §4`（尤其第 11/12/13/14 条 A2/A2b/B3 自绘区先例、第 16 条 swf 优先）。

---

## 0. 一句话结论

原版小赛尔的外观 = **一套 11 槽位的“图层装备”**：每个槽位一个 `EquipPlayer`（各自一个帧序列包），
按朝向做深度排序、**同一 tick 下各层按自己的标签区间循环**（不并帧号，见 §6.4）；**裸装是 5 件默认装（头/眼/手/身/脚），渲染时左右手脚镜像成 8 个部件（含阴影）**，穿戴后逐槽替换；
**坐骑不是独立渲染器**，它就是 **3 号槽（`DOGZ_RIGHT`）的装备包**，外加“整体 y=−50、藏起手脚、跑速 25”的
`Actor.addDogz` 视觉状态。素材 = `res/item/equip/swf/{1+suit(3)+slot(2)}[_0|_1].swf` 的**自定义帧序列包**
（不是真 SWF，是 `u16 headLen + AMF3 标签 + 帧记录 + PNG`），预览/图标才是真 CWS SWF。
复刻侧现有 `game/logic/map/actor-view.js` 的 `parsePack` **已经能直接吃装备包**；缺的是
**11 槽模型、装备/坐骑数据桥、会话/存档状态、以及 29 张坐骑包与 10 种颜色默认装的素材**。

---

## 1. 范围与边界

### 1.1 圈里（本份负责）

1. **外观模型**：槽位、套装、默认装、配件镜像、坐骑槽、层序、帧同步、锚点/绘制公式。
2. **上游源码索引**：AS3 里每个相关文件 / 关键函数 / 行号（§3）。
3. **数据链**：登录/进图的 `equipVec` 与 `ridingPetInfo`、默认装合并、1098 换装包、1019 骑乘包（§4）。
4. **素材索引**：URL 公式、包格式、已缓存清单、29 张坐骑映射、缺素材与补法（§5）。
5. **复刻设计**：L1 纯函数 + L4 JS 回退渲染的扩展点、数据桥、会话/存档缺口、SWF 路边界（§8）。
6. **施工批草案** `MDB8-a…g` 与**拍板项** `ALQ1–ALQ8`（§9/§10；`ALQ1=A`/`ALQ2=B` 已决）。

### 1.2 圈外（各归各的正本）

| 事 | 归属 | 本份只做什么 |
|---|---|---|
| 装备的**道具定义 / 背包 / 买卖 / 限时** | 道具线 `docs/item/item-design.md` | 只读 `ItemConfig` 的 `SlotIndex` / `SuitID` / `Name` |
| 宠物的**属性 / 技能 / 跟随 / 骑宠状态机** | D6 `docs/domain/domain-pet.md` | 只读 `PetInfo.isPetRiding` / `petRideChipId` / `chipPutOnTime` |
| **装备面板 / 背包面板 / 骑宠面板** 的正式 UI | C1/C2（`docs/view/panel/`）；**⚠️ 2026-10-20 起 PlayerInfo（C4）内嵌最小装备/坐骑两栏 = `APP.actorLook.*` 的第一个正式消费面板（正本 `docs/view/panel/playerinfo/playerinfo-design.md §3.8`）；独立正式装备/骑乘面板（suits/BODY/EYE/商店联动）仍归 C1/C2** | 第一批只给**调试控制台**入口，不做正式面板（PI-equip 属 C4 线的扩格，不改本线交付） |
| **角色像素/图层机制**（正式美术、朝向 4 态、走位动画） | View 线 B3（`docs/view/scene/room/view-scene-map-content.md`） | 本份给**数据与 JS 回退通路的实现方案**，不重画 B3 的正式层 |
| **SWF 地图里的角色**（`MapRunner.as`） | 现役 AS3 地图宿主，**no-modify 围栏** | 只登记“裸装、无装备/坐骑”的现状与选项，**不改 `game/maprunner/**`** |
| **装备/坐骑状态写盘** | 存档线 + 运行时线 R3/R4 | 已决 A：新增我方扩展 `<equip>`（§8.5；节点真值 = `docs/save/save-xml-spec.md §2.22`） |
| **其他玩家 / 联机同步** | A 组（联机） | 不实现；只说明单机本地玩家路径 |

### 1.3 当前复刻侧的既成事实（as-built）

- `game/logic/map/actor-view.js`（L1）：
  - **A2b 时期**的 `PART_SLOTS` / `ACTOR_PACKS` / `DOWN_ORDER` 已在 `MDB8-b` 移除（11 槽表归 `actor-look.js`）；
  - 本件现只负责**解析 + 动画数学**：`parsePack` / `pickFrame` / `frameRect` / `standFrame` / `labelStartFrame` / `cycleFrame` / `localShadowFrame`，
    **`MDB8-b2` 新增** `labelOf` / `stepDirection`；**`MDB8-b3` 新增** `vipShadowFrame`（`UI_ActorShadow` 的 `vip` 3–39 循环）。
- `game/app/scenes/mapScene.js`（L4）：
  - **`MDB8-b`**：`syncLook()` 按 `LookPlan` 装包 + `drawActor` 11 槽合成（`LOOK`/`LOOK_PARTS`/`LOOK_OVERRIDE`）；
  - **`MDB8-b2`**：`drawActor(ctx,x,y)` 按 24fps 播放 `run/stand × Up/Down`、4 向层序、左右 `flip`（常驻 `animRaf`）；
  - **`MDB8-b3`**：地面特效 `GROUND_MODE`（`shadow`/`halo`）+ `groundElapsed` 独立时钟，`APP.actorLook.ground(mode)` 切换；
  - 手测钩子 `APP.actorLook.preview/clear`（`MDB8-c` 起已有正式 `equip/unequip/ride/unride/color`，preview 保留为不改会话态的整组直通）；
  - `avSel` 仍只有 `{BLUE:'小赛尔·蓝', RED:'小赛尔·红'}` 两项；`ACTOR_SCALE=1`。
- `game/data/actor/` 现有 **15 个 `.bin`**：BLUE/RED 各 5 件 + `UI_DEFAULT_HEAD` + `UI_DEFAULT_EYE` + `UI_ActorShadow` + `UI_QuestionMark` + `UI_SurpriseMark`。
- **没有**装备槽、坐骑、装备包加载、装备/坐骑状态；`game/app/session.js` 也没有这些字段。
- **存档里没有**装备/坐骑字段（`tools/fixtures/save-lite4.9.2-played.xml` 无 `equip`/`ride` 节点；原版这两项在服务端）。

> ⚠️ **一句话**：今天能看“裸装小赛尔”，不能看“穿装备/骑坐骑的小赛尔”；本份就是把后半句的资料与落地路径补齐。

---

## 2. 术语与外观模型

### 2.1 两套编号（**最重要的坑**）

| 编号 | 例子 | 含义 | 用在哪 |
|---|---|---|---|
| **物品 ID**（`referenceId`） | `100004` | 道具表主键（6 位） | 背包、`equipVec`、`EquipItem.referenceId` |
| **资源标识**（`resourceIdentifier`） | `100102` | `"1" + pad(suitId,3) + pad(slotIndex,2)`（**6 位**；1+3+2） | 素材文件名 `res/item/equip/swf/100102_0.swf` |

**它们会撞车，且含义完全不同**：
- 物品 `100102` = 「巨星头盔」（suit 27 / slot 1）；
- 资源标识 `100102` = 「蓝色手部」（物品 `100004`，suit 1 / slot 2）。
- 同理：物品 `100104` = 「巨星腰带」（suit 27 / slot 5），而资源标识 `100104` = 「蓝色身体」（物品 `100005`）。

⇒ **禁止**拿“物品 ID 当素材 ID”直接拼路径；**必须先查 `ItemConfig` 的 `SlotIndex` / `SuitID` 再算资源标识**。
本份把这条列为 **ALI1**。

### 2.2 11 个槽位

正本：`vendor/seer2-origin-as3/src/com/taomee/seer2/app/actor/constant/EquipSlot.as:4-26`。

| 常量 | 值 | 中文 | 备注 |
|---|---:|---|---|
| `HEAD` | 1 | 头顶/头部 | 默认包 `UI_DEFAULT_HEAD` |
| `HAND_RIGHT` | 2 | 右手 | 有 `_0` 主件 + `_1` 左镜像 |
| `DOGZ_RIGHT` | 3 | 坐骑（右） | **坐骑/骑宠唯一视觉槽**；有 `_0` + `_1` |
| `BODY` | 4 | 身体 | 默认包按性别色；**帧同步时钟** |
| `BELT` | 5 | 腰带 | 无配件后缀 |
| `FOOT_RIGHT` | 6 | 右脚 | 有 `_0` + `_1` |
| `WING` | 7 | 翅膀 | 无配件后缀 |
| `EYE` | 8 | 眼睛 | 默认包 `UI_DEFAULT_EYE` |
| `FOOT_LEFT` | 9 | 左脚（仅镜像） | **物品表里 129 条 slot=9 全是 NONO 服装**，不是正常左鞋 |
| `HAND_LEFT` | 10 | 左手（仅镜像） | 无独立物品定义 |
| `DOGZ_LEFT` | 11 | 坐骑左（仅镜像） | 无独立物品定义 |

`TOTAL_SLOT_NUM = 11`；`EquipSlot.isAccessory` **写错了**（见 `ALC1`）。

**左/右配件的实际生成方式**：右手/右脚/坐骑的 `EquipItem` 在 `hasAccessory=true` 时，
`getAccessory()` 复制同一 `referenceId` 生成一个 `isAccessory=true` 的左槽物品；渲染时
`swfUrl` 给主件加 `_0`、给镜像件加 `_1`（`EquipItem.as:162-188`、`:78-87`）。
**左槽不是独立物品**，不要为它去物品表找定义。

### 2.3 套装（`suitId`）与资源标识

`EquipItem.getResourceIdentifier()`（`EquipItem.as:89-104`）：

```
base = "1" + pad(suitId, 3, "0", false) + pad(slotIndex, 2, "0", false)
// 左槽先映射到右槽号：HAND_LEFT→2, FOOT_LEFT→6, DOGZ_LEFT→3
```

例子：
- 默认头 `suit 0 / slot 1` ⇒ `100001`；
- 默认眼 `suit 0 / slot 8` ⇒ `100008`；
- 蓝色手 `suit 1 / slot 2` ⇒ `100102`；蓝色身 `suit 1 / slot 4` ⇒ `100104`；蓝色腿 `suit 1 / slot 6` ⇒ `100106`；
- 坐骑「迈巴赫」`suit 364 / slot 3` ⇒ `136403`。

### 2.4 默认裸装（12 色）

正本：`vendor/seer2-origin-as3/src/com/taomee/seer2/app/actor/util/ActorEquipAssembler.as:49-60`。
`mergeDefaultEquip(color, equipVec)` 按**槽位**补 5 件（头/眼/手/身/脚），已有同槽物品则不补。

| color | 颜色 | 默认 5 件（头 / 眼 / 手 / 身 / 脚） | 手/身/脚 suit |
|---:|---|---|---:|
| 0 | 蓝 | `100001 / 100003 / 100004 / 100005 / 100006` | 1 |
| 1 | 绿 | `100001 / 100003 / 100007 / 100008 / 100009` | 2 |
| 2 | 紫 | `100001 / 100003 / 100010 / 100011 / 100012` | 3 |
| 3 | 黄 | `100001 / 100003 / 100013 / 100014 / 100015` | 4 |
| 4 | 紫罗兰 | `100001 / 100003 / 100016 / 100017 / 100018` | 5 |
| 5 | 橙 | `100001 / 100003 / 100019 / 100020 / 100021` | 6 |
| 6 | 红 | `100001 / 100003 / 100022 / 100023 / 100024` | 7 |
| 7 | 粉 | `100001 / 100003 / 100025 / 100026 / 100027` | 8 |
| 8 | 白 | `100001 / 100003 / 100028 / 100029 / 100030` | 9 |
| 9 | 黑 | `100001 / 100003 / 100031 / 100032 / 100033` | 10 |
| 10 | 深蓝 | `100001 / 100003 / 100143 / 100144 / 100145` | **39** |
| 11 | 咖啡 | `100001 / 100003 / 100146 / 100147 / 100148` | **40** |

⚠️ 颜色 10/11 的 suit 不是 11/12，而是 **39/40**（上游历史遗留），不要按“颜色序号+1”硬算。

**当前复刻只有蓝/红两套**：`UI.swf` 里只有 `UI_BLUE_*` / `UI_RED_*` 的裸装包；
其余 10 色的默认手/身/脚要去 `res/item/equip/swf/` 取对应 suit 的装备包（例如绿色 `100202/100204/100206`），
不能从 `UI.swf` 抽到。⇒ `ALQ3` / `MDB8-e`。

**⚠️ 12 色的定位（`ALQ11` · 人类 2026-10-21）= 独立的「换色」功能，不是部件目录的成员**：
上表这 **36 件**（手/身/脚 × 12 色）是"颜色的载体"、不是玩家挑选的装扮 ⇒ **不进玩家面部件目录**
（PlayerInfo 装备两栏按 `COLOR_ITEM_IDS` 剔除，落点 = `playerinfo-design.md §3.8` + as-built `map-impl §7.3.30`）；
换色入口 = 面板**「颜色」组**（12 个色块，走既有 `APP.actorLook.color(n)`）/ 地图 HUD `#avSel` / 控制台。
取数也不走"穿某件"这条路：蓝/红由仓库裸装 `.bin` 承担（`actor-look.js:98-100` `NAKED_PACK_KEY`），
其余 10 色由 `MDB8-e3` 补齐的 equip 包承担 ⇒ **红 suit7 的三个 equip 包（`100702_0/100704/100706_0`）不需要抓**
（官服实测 **200**、但被 `tools/build-actor-assets.mjs:68-72` 的 `NAKED_REFS` 主动跳过 = **设计排除、不是缺口**）。

### 2.5 坐骑 = 骑宠系统 + 3 号槽

原版**没有**单独的“坐骑渲染器”：

1. 登录/进图包里有 `ridingPetInfo`（`PetInfo`）；
2. `PetInfo.isPetRiding` 由 `flag & 8192` 解析（`PetInfo.as:396`）；
3. 骑乘芯片 `petRideChipId` 经 `PetRideShopConfig.getEquipIdByChipBackId()` 映射到一件 **slot=3 的装备物品**；
4. 该物品作为普通装备进入 `EquipItem` / `MultipleEquipPlayer`，在 3 号槽画“坐骑包”；
5. `Actor.addDogz()` 负责**整体 y=−50、藏起手脚、跑速 25**等视觉状态。

⇒ 只要把 3 号槽的装备包画出来，**坐骑就“长”在角色身上**；不需要另建坐骑 sprite。

---

## 3. 上游源码索引

> 根目录：`vendor/seer2-origin-as3/src/com/taomee/seer2/`（AS3 爬取件；只读）。
> 行号以当前仓内文件为准；`路径:行号` 是证据，不是“必须逐行照抄”的合同。

### 3.1 核心文件

| 文件 | 职责 | 关键符号 / 行号 |
|---|---|---|
| `app/actor/constant/EquipSlot.as` | 11 槽位常量 | `TOTAL_SLOT_NUM=11` `:4`；`HEAD..DOGZ_LEFT` `:6-26`；`isAccessory` `:33-35`（**写错**，见 ALC1） |
| `app/actor/constant/EquipSlotDepth.as` | 朝向深度表 | `_upDirDefinition` `:6`；`_downDirDefinition` `:8`；`getDepthByDirection` `:15-20` |
| `app/actor/equip/ActorEquipHelper.as` | 角色装备总控 | `initEquip` `:30-50`（**双查 bug** `:41-43`）；`addEquip` `:52-59`；`updateEquipVec` `:79-96`；`addEquipToPlayer` `:135-146`；`addEquipToItemVec` `:148-170`；`removeEquip` `:69-77` |
| `app/actor/util/ActorEquipAssembler.as` | 默认装 / 12 色表 | `DEFAULT_BODY_REFERENCE_ID=100002` `:9`；`DEFAULT_BOOY_RESOURCE_ID=100004` `:11`；颜色常量 `:13-35`；`_equipMap` 表 `:49-60`；`mergeDefaultEquip` `:75-99`；`getSlotDefaultEquipReferenceId` `:109-125` |
| `app/actor/equip/MultipleEquipPlayer.as` | 多槽合成器 | `addEquip` `:36-46`（跳过 `suitId==0 && slot==9`）；`hideHandAndFootEquipPlayer` `:48-55`；`showHandAndFootEquipPlayer` `:57-64`；`arrangeSoltDepth` `:167-179`；`sortBySlotDepth` `:181-191`；`update` `:193-199`（**帧同步无效**，见 ALC3） |
| `app/actor/equip/EquipPlayer.as` | 单槽播放器 | `initFrameSequence` `:28-62`（默认头/眼、蓝/红身体手脚）；`updateEquip` `:64-67`；`update` `:69-74` |
| `app/inventory/item/EquipItem.as` | 单件装备 | `checkAccessory` `:59-61`（**真正在用的配件判定**）；`iconUrl/previewUrl/swfUrl` `:63-87`；`getResourceIdentifier` `:89-104`；`getAccessory` `:162-188` |
| `core/utils/URLUtil.as` | 素材 URL | `_equipBase` `:145`；`_equipPreviewBase` `:146`；`_equipIconBase` `:147`；`getEquipSwf/Preview/Icon` `:309-321` |
| `core/animation/FramePlayer.as` | 帧播放/定位 | `gotoAndPlay(param1)` `:104-112`（**忽略参数**）；`updateFrameIndex` `:159`；`drawFrame` `:190-200`（`x=scaleX*(offsetX-anchorX)`、`y=offsetY-anchorY`） |
| `core/animation/frame/FrameSequence.as` | 包 head / 标签 | `parseHead` `:36-49`；`parseLabel` `:51-63` |
| `core/animation/frame/FrameSheet.as` | 包 info / spritesheet | `parseFrameInfo` `:48-68`；`getFrameInfo` `:108-115`；`findFrameInfoIndex` `:117-132`（`key<=f` 取最后一条）；`createFrameData` `:134-141` |
| `app/actor/Actor.as` | 坐骑视觉状态 | `DOGZ_RUN_SPEED=25` `:154`；`NOMARL_RUN_SPEED=20` `:156`；`_floatList` `:215`；`addDogz` `:1124-1133`；`removeDogz` `:1135-1140`；`checkAddFloat` `:1180-1205`；`onRidePetUpdate` `:1288-1323` |
| `app/net/helper/UserInfoParseHelper.as` | 登录/进图包 | `parseEnterMap` `:19-52`（pet[0]=following、其余=riding）；`readBaseInfo` `:54-80`（`equipVec` + `mergeDefaultEquip` `:79`） |
| `app/pet/data/PetInfo.as` | 骑宠 flag | `isPetRiding` `:122`；`flag` setter `:396`（`& 8192`）；`updateFlag` `:359-373`（**写回用 8162**，见 ALC5） |
| `app/config/ItemConfig.as` | 装备定义 | `SlotIndex` / `SuitID` 解析 `:187-188`；`EquipItemDefinition` `:212`；`getEquipDefinition` `:260-262` |
| `app/config/PetRideShopConfig.as` | 骑宠 → 装备 | `getEquipIdByPetId` `:81-92`；`getEquipIdByChipBackId` `:117-127`；`isRidePetEquip` `:129-139` |
| `app/lobby/messageHandler/MessageHandlerEquipChange.as` | 1098 换装包 | `onMessage` `:27-85`；本人/远程分派 `:53-60`；骑宠补件 `:62-80`；`updateItemManager` `:87-100` |
| `app/lobby/messageHandler/MessageHandlerSetPetFollow.as` | 1019 跟随/骑乘包 | `onMessage` `:26-67`；`sub==3` 创建骑乘 `:52-65`；`sub==2` 移除 `:50-51`；`createPetRide` `:93-103` |
| `app/actor/data/UserInfo.as` | 用户信息事件 | `updateEquipVec` `:142-147`；`updateColor` `:149-157`；`setPetRidePetInfo` `:162-165` |
| `app/actor/events/UserInfoEvent.as` | 事件名 | `EQUIP_UPDATE` / `RIDING_PET_UPDATE` / `FOLLOWING_PET_UPDATE` |

### 3.2 我方现役文件（A2b / SWF 路）

| 文件 | 现状 | 与 M8 的关系 |
|---|---|---|
| `game/logic/map/actor-view.js` | L1 纯解析裸装 8 件；`parsePack` 可读装备包 | **M8 的主要扩展点**（§8.1） |
| `game/app/scenes/mapScene.js` | L4 `loadActorParts` / `drawActor` 静态裸装 | 扩展为“按外观计划装包 + 11 槽合成 + 坐骑偏移” |
| `game/data/actor/*.bin` | 15 个裸装/阴影/问号包 | 装备包建议另放 `game/data/actor/equip/` 或运行时取 |
| `game/maprunner/ActorView.as` | SWF 路的裸装合成员（`UP_ORDER`/`DOWN_ORDER` 7 槽） | **no-modify**；SWF 路今天**不带装备/坐骑**（§8.4） |
| `game/maprunner/MapRunner.as` | `loadActor(color)` 只传颜色 | 同上；要改需人类拍板并破围栏 |
| `docs/map/map-impl.md §7.3.8` | A2b as-built（静态、朝右、无装备） | 本份是它的**下一层设计**，不是替代 |

### 3.3 重启 Unity 侧（为什么不能从 Unity 抄外观）

- `projects/Seer2-Restart-Lite-main/Assets/Scripts/MVC/Controller/Player/PlayerController.cs:55-68`
  只做 `nonoView` / `robotView` 二选一；`nonOView.SetPlayerSprite(item.icon)` 用的是
  `Player.gameData.achievement` 的**单张图标**，不是分层装备。
- `MVC/Model/Player/PlayerModel.cs` 只有移动/寻路，没有外观层。
- 全仓 `.cs` 搜不到 `EquipSlot` / `ridingPet` / `PetRide` 的运行时实现；`ItemType.Equipment` 只用于道具分类。
- ⇒ **外观（尤其分层装备/坐骑）只有 AS3 这套完整实现**；重启侧没有可抄的渲染链。这一条是 §3 的核心结论。

---

## 4. 数据链

### 4.1 登录 / 进图

`UserInfoParseHelper.parseEnterMap(UserInfo, IDataInput)`（`:19-52`）：

```
readBaseInfo(userInfo, input)
  id, nick, color, x, y, medalId, createTime
  equipVec: u32 count, 每项 u32 referenceId -> new EquipItem(...)
  nonoEquip: u32 count（逐个读掉，最后一项写 nonoInfo.equipId）
  ActorEquipAssembler.mergeDefaultEquip(color, equipVec)
u32 petCount
  每只 PetInfo: catchTime, resourceId, sex, level, character, potential, flag,
                petRideChipId, chipPutOnTime, evolveLevel
  index==0 -> followingPetInfo；index>0 -> ridingPetInfo（后者覆盖前者）
troop, vipInfo, activityData[], trainerScore
```

要点：
- **`ridingPetInfo` 取自“pet 列表第 2 只及以后”的最后一只**；第 1 只是跟随宠。
- `flag` 的 bit 8192 = `isPetRiding`；`petRideChipId` 是芯片/骑乘凭证，`chipPutOnTime` 用于 7 天规则。
- `equipVec` 里是**物品 ID**；默认 5 件不在网络包里，由 `mergeDefaultEquip(color)` 补。

### 4.2 默认装合并

`ActorEquipAssembler.mergeDefaultEquip(color, equipVec)`（`:75-99`）：
- 取 `color` 对应的 5 个默认 `referenceId`；
- 对每个默认件，若 `equipVec` 里**没有同 `slotIndex` 的物品**，就 `new EquipItem(refId)` 追加；
- 已有同槽（例如玩家穿了自定义头）⇒ 不补默认件。
- `UserInfo.updateEquipVec` / `updateColor` 都会再调一次合并（`:142-157`）。

### 4.3 换装动态包（1098）

`MessageHandlerEquipChange`（`:27-85`）：
- 读 `actorId`、`equipCount + referenceId[]`、`nonoCount + ...`；
- 本人：更新 `ItemManager`，再走 `getInfo().updateEquipVec(_loc5_)`；
- 远程：直接走 `updateEquipVec`；
- 若该 actor 有 `ridingPetInfo`：按 `getEquipIdByChipBackId(petRideChipId)` 取坐骑装备，
  非 VIP 且 `serverTime - chipPutOnTime <= 7 天` 才追加；VIP 不受 7 天限制；`isPetRiding` 为真才追加；
- `updateEquipVec` 触发 `EQUIP_UPDATE` → `Actor.onEquipUpdate` → `ActorEquipHelper.updateEquipVec(diff)`。

`ActorEquipHelper.updateEquipVec`（`:79-96`）用**前后差集**：
- 被移除的件：`removeEquip(refId)`；若是 `DOGZ_RIGHT` ⇒ `updateDogzState(true, refId)`；
- 新增的件：`addEquip(refId)`；若是 `DOGZ_RIGHT` ⇒ `updateDogzState(true, refId)`；
- `addEquipToPlayer` 里若 `slotIndex==DOGZ_RIGHT` ⇒ `actor.isDogz=true`、`curtDogzId=refId`；
  `removeEquipFromPlayer` 反之清零。
- `checkAddDogz()` 在 `initEquip` 末尾按 `isDogz` 调 `addDogz/removeDogz`。

### 4.4 骑乘动态包（1019）

`MessageHandlerSetPetFollow`（`:26-67`）按子类型：
- `1`：创建跟随宠（`followingPetInfo`）；
- `0`：结束跟随；
- `2`：移除骑乘（`ridingPetInfo=null`）；
- `3`：创建骑乘：读 `resourceId, sex, level, character, potential, flag, petRideChipId, chipPutOnTime, evolveLevel`，
  强制 `isPetRiding=true`，`setPetRidePetInfo(pet)`。

`UserInfo.setPetRidePetInfo` 派发 `RIDING_PET_UPDATE` → `Actor.onRidePetUpdate`：
- 有 `ridingPetInfo`：非 VIP 且超过 7 天 ⇒ **直接 return**（不显示坐骑）；否则
  `getEquipIdByChipBackId(petRideChipId)` → `EquipItem`；
  `isPetRiding` 为真 ⇒ push 进 `equipVec`、`updateItemManager`、`updateEquipVec`；
- 无 `ridingPetInfo`：从 `equipVec` 里删掉 `slotIndex` 为 `DOGZ_LEFT/DOGZ_RIGHT` 且
  `PetRideShopConfig.isRidePetEquip(refId)` 为真的件，再更新。

### 4.5 配置表定量（本仓已核）

| 表 | 文件 | 定量 |
|---|---|---|
| 道具定义 | `vendor/seer2-origin-as3/src/_assets/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml` | **9,630** 个 `<Item>`；**1,864** 条 `SlotIndex>0` 的装备；slot 分布 `1:347, 2:391, 3:96, 4:13, 5:305, 6:317, 7:245, 8:21, 9:129`；slot 10/11 **0**；distinct `SuitID` **573**（含 0，非零 **572**） |
| 套装名 | `vendor/seer2-origin-as3/src/_assets/56_com.taomee.seer2.app.config.ItemConfig__suitXmlClass.xml` | **302** 个 `<Suit>`；**suit 204 缺行**（但物品 `100582` 用它，见 ALC9） |
| 骑宠映射 | `vendor/seer2-origin-as3/src/_assets/65_com.taomee.seer2.app.config.PetRideShopConfig__setting.xml` | **48** 个 `<pet>`；distinct `equipId` **29**（有重复行）；`chipBackId` 900001–900029 |

> 采集口径：`<Item>` 总行数 9,630（不是 9,627）；装备定义 1,864；以上数字均以**当前仓内 XML**为准。
> 装备定义里 **slot 3 共 96 条**，其中 **29 条**是 `PetRideShopConfig` 的骑乘坐骑；其余是其它 slot-3 装备（例如 `100582`）。

---

## 5. 素材面

### 5.1 URL 公式

`URLUtil` 基址（`core/utils/URLUtil.as:145-147`）：

```
res/item/equip/swf/       -> getEquipSwf(id)      -> <id>.swf
res/item/equip/preview/   -> getEquipPreview(id)  -> <id>.swf
res/item/equip/icon/      -> getEquipIcon(refId)  -> <refId>.swf
```

`EquipItem` 取哪个后缀（`:78-87`）：

| 物品角色 | 资源标识后缀 |
|---|---|
| 右手 / 右脚 / 坐骑（`hasAccessory=true`） | `<base>_0` |
| 上述件的左镜像（`isAccessory=true`） | `<base>_1` |
| 其它槽（头/身/腰带/翅膀/眼） | `<base>`（无后缀） |

⚠️ `icon` 用的是**物品 ID**（`referenceId`），不是资源标识；`preview` / `swf` 用资源标识。
这是两套编号的又一处分叉（ALI1）。

### 5.2 已缓存素材（2026-10-20 实测）

缓存根：`~/.cache/seer2-live/game-cache/`。
本批装备素材全部落在**官方回落前缀**下：
`http_seer2.61.com/res/item/equip/{swf,preview,icon}/`（改服未覆盖 ⇒ 回落官方）。

| 目录 | 文件数 | 说明 |
|---|---:|---|
| `swf/` | **18** | 自定义帧序列包（不是 CWS；头 `00 4c ...`） |
| `preview/` | **37** | 真 CWS SWF（`43 57 53`） |
| `icon/` | **23** | 真 CWS SWF（快照 2026-10-20 08:25；缓存按需增长） |

> ⚠️ 上表是**某一时刻的快照**，不是固定库存：启动器会按游戏内实际请求继续增长（本份写作期间 `icon/` 就从 9 增至 23）。
> 判断“某件装备有没有素材”要按**具体文件名**核对，不能只看总数。

`swf/` 的 18 个包与归属（反查物品表）：

| 包 | 大小 | 归属 | suit / slot |
|---|---:|---|---|
| `100001.swf` | 1,734 | 物品 `100001` 默认头顶 | 0 / 1 |
| `100008.swf` | 1,054 | 物品 `100003` 默认眼睛 | 0 / 8 |
| `100102_0/_1.swf` | 2,855 / 4,534 | 物品 `100004` 蓝色手部 | 1 / 2 |
| `100104.swf` | 6,411 | 物品 `100005` 蓝色身体 | 1 / 4 |
| `100106_0/_1.swf` | 4,088 / 4,415 | 物品 `100006` 蓝色腿部 | 1 / 6 |
| `101506_0/_1.swf` | 4,861 / 5,100 | 物品 `100055` 队长重靴 | 15 / 6 |
| `120301.swf` | 10,638 | 物品 `100577` 射手守护头盔 | 203 / 1 |
| `120302_0/_1.swf` | 18,984 / 87,598 | 物品 `100578` 星空追猎之弓 | 203 / 2 |
| `120305.swf` | 4,015 | 物品 `100579` 射手守护腰带 | 203 / 5 |
| `120306_0/_1.swf` | 6,836 / 7,164 | 物品 `100580` 射手守护战靴 | 203 / 6 |
| `120307.swf` | 13,016 | 物品 `100581` 射手星辰羽翼 | 203 / 7 |
| `120403_0/_1.swf` | 58,404 / 61,238 | 物品 `100582` 星空追猎者（slot 3，**不在 29 骑乘表内**） | 204 / 3 |

> 这 18 个包足以验证 **8 个槽位类型**（头/眼/手/身/脚/腰带/翅膀/坐骑）和 **`_0`/`_1` 配件规则**，
> 是 M8 第一版渲染的**黄金样本**；它们**不是**全量素材。

### 5.3 包格式（`parsePack` 已兼容）

正本：`FrameSequence.as:36-63` + `FrameSheet.as:48-80`；我方实现 `game/logic/map/actor-view.js:71-110`。

```
u16 headLen                      （大端）
head:
  i16 frameW, frameH, totalFrames, anchorX, anchorY
  AMF3 object { l: "runDown,runUp,standDown,standUp", i: "1,12,13,24,25,65,66,107" }
u16 infoLen
info:
  i16 unitW, unitH, frameNum
  重复 frameNum 次：i16 key, offsetX, offsetY, contentW, contentH, sheetIndex
rest:
  一张 PNG（带 alpha），IHDR 宽高在 rest+16 / rest+20
```

- `cols = floor(pngWidth / unitW)`（`FrameSequence.as:70` / `actor-view.js:103`）。
- 取帧：`key <= f` 的**最后一条**，遇到 `key > f` 停（`FrameSheet.findFrameInfoIndex`）。
- 源矩形：`sx=(sheetIndex%cols)*unitW`、`sy=floor(sheetIndex/cols)*unitH`、`sw=contentW`、`sh=contentH`。
- 绘制：`x = flip*(offsetX-anchorX)`、`y = offsetY-anchorY`（`FramePlayer.as:190-200`；`ActorView.as:153-155`）。
- **不是 SWF**：`preview/` 与 `icon/` 才是真 CWS；`swf/` 只是历史扩展名。⇒ **ALI2**。
- 包可能有**不规则 info 数**（如 `120302_1` 有 52 条，而多数是 12–14 条）；解析器不要假设“一帧一条”。

### 5.4 29 张骑乘坐骑（`PetRideShopConfig`）

这 29 件是**骑宠系统实际会挂到 3 号槽**的装备；每件需要 `_0` + `_1` 两个包。
**截至 2026-10-20 全部未缓存**（只有非骑乘表的 `120403` 坐骑包已缓存）。

| 坐骑名（petName） | 装备物品 | 物品名 | suit | 资源标识 / 包前缀 | chipBackId |
|---|---:|---|---:|---|---:|
| 迈巴赫 | 101020 | 迈巴赫 | 364 | `136403` | 900011 |
| 艾妮维娅 | 101021 | 艾妮维娅 | 365 | `136503` | 900012 |
| 雷克顿 | 101022 | 雷克顿 | 366 | `136603` | 900013 |
| 格尔西克 | 100971 | 格尔西克 | 346 | `134603` | 900001 |
| 雷克萨斯 | 100972 | 雷克萨斯 | 347 | `134703` | 900002 |
| 英菲尼迪 | 100973 | 英菲尼迪 | 348 | `134803` | 900003 |
| 兰博基尼 | 100974 | 兰博基尼 | 349 | `134903` | 900004 |
| 法拉利 | 100975 | 法拉利 | 350 | `135003` | 900005 |
| 哈德拉奇 | 100976 | 哈德拉奇 | 351 | `135103` | 900006 |
| 萨菲隆 | 100977 | 萨菲隆 | 352 | `135203` | 900007 |
| 泰格武茨 | 100978 | 泰格武茨 | 353 | `135303` | 900008 |
| 奥黛丽 | 100979 | 奥黛丽 | 354 | `135403` | 900009 |
| 赫本 | 100980 | 赫本 | 355 | `135503` | 900010 |
| 托尼乔巴 | 101091 | 乔尼骑宠 | 384 | `138403` | 900014 |
| 陶勒斯 | 101118 | 陶勒斯骑宠 | 391 | `139103` | 900015 |
| 布加迪威龙 | 101119 | 布加迪威骑宠 | 392 | `139203` | 900016 |
| 圣兽天尊 | 101125 | 圣兽天尊骑宠 | 394 | `139403` | **900018** |
| 圣兽天尊（行名）/ 沧海霸主 | 101131 | 沧海霸主骑宠 | 397 | `139703` | **900017** |
| 小木马 | 101137 | 小木马坐骑 | 399 | `139903` | 900019 |
| 卢卡斯 | 101165 | 卢卡斯坐骑 | 407 | `140703` | 900020 |
| 极冰凤皇 | 101212 | 极冰凤皇坐骑 | 418 | `141803` | 900021 |
| 魔纹黑龙 | 101292 | 魔纹龙骑 | 438 | `143803` | 900022 |
| 雷霆 | 101510 | 雷霆骑宠 | 503 | `150303` | 900023 |
| 赤兔 | 101542 | 赤兔骑宠 | 517 | `151703` | 900024 |
| 白龙驹 | 101543 | 白龙骑宠 | 518 | `151803` | 900025 |
| 的卢 | 101544 | 的卢骑宠 | 519 | `151903` | 900026 |
| 焰豪 | 101545 | 焰豪骑宠 | 520 | `152003` | 900027 |
| 恶灵兽 | 101643 | 恶灵兽骑宠 | 543 | `154303` | 900028 |
| 奎尔斯之影 | 101644 | 奎尔斯之影骑宠 | 544 | `154403` | 900029 |

⚠️ **900017 / 900018 与行名/物品名的对应是错位的**：行名为「圣兽天尊」的两行，
`900017` 的 equipId 是 `101131`「沧海霸主骑宠」，`900018` 的 equipId 是 `101125`「圣兽天尊骑宠」。
**按 `chipBackId → equipId` 走，不要按行名猜**（ALC8）。

### 5.5 怎么补素材（按需增长 + **采集单点名定向拉取**）

> ✅ **政策修订（人类 2026-10-20 拍板 B）**：原「不爬站」口径收窄为**仍不做全站遍历/无边界 ID 扫描**；
> **允许按本份采集单（= `manifest.json` 的 `missing` 清单）逐件点名、有界定向拉取**（工具 = `tools/fetch-actor-packs.mjs`，
> 并发 1、间隔 ≥150ms、单次预算显式、仅本地研究、不二次分发，与 `docs/legacy/petbag-handoff.md` 的有界爬取纪律同规）。
> 素材缓存本身仍"按需增长"（`tools/seer2-live/README.md §5`）；定向拉取 = 把"人进游戏逐件预览"自动化成"按单点名的那一小撮"。

补法（两条通道，任选或并用）：

**通道一 · 定向拉取（新，推荐）**：`node tools/fetch-actor-packs.mjs`（默认拉 `missing` 全量；`--ids=<a_0,b,...>` 点名；`--dry` 只试探）⇒ 工具从缓存已存包的 `url` 模板拼 `res/item/equip/swf/<包>.swf`，落盘进缓存根并**同步登记 `index.json`**（`hash` = md5(url)，与启动器 `_urlHash` 同式，启动器见键即命中、不重复下载）；拉完跑 `build-actor-assets.mjs` 对账。

**通道二 · 游戏内自然采集（原路，仍有效）**：

1. 用现役启动器进游戏，**穿上/预览**目标装备 → 客户端会请求 `res/item/equip/swf/...`，全量缓存落盘；
2. 骑乘 29 张坐骑：在游戏里骑上对应骑宠（或打开对应图鉴/商店预览）→ 请求 `_0`/`_1` 两个包；
3. 从 `~/.cache/seer2-live/game-cache/http_seer2.61.com/res/item/equip/swf/` 取**解压后的裸包**；
4. 需要转存时按 `index.json` / `index-extra.json` 的 `url` 字段核对，不要根据目录里文件少就判断“没请求过”（官方回落前缀会分叉）；
5. **不做全站遍历/无边界扫描**；定向拉取只准按采集单点名（缓存是“按需增长”，不是全量素材库）。

**采集单（2026-10-20 `MDB8-e`，对账 = `node tools/build-actor-assets.mjs`）**

- **29 张骑乘**：按 §5.4 表的「装备物品 / 包前缀」逐件触发，每件要 `_0` + `_1`（共 **58** 包）。
  触发方式按可行优先级：① 骑上对应骑宠；② 打开骑宠商店/图鉴的**预览**；③ 先获得物品再穿戴。
  客户端请求路径 = `res/item/equip/swf/<包前缀>_0.swf` 与 `_1.swf`。
- **10 色默认装**（蓝/红之外）：每色 **5** 包 = 手 `_0/_1` + 身 + 脚 `_0/_1`（共 **50** 包）。
  触发目标 = 让游戏里**角色本体显示该色**（换色界面 / 新建角色选色 / 穿上该色默认装均可，关键是让客户端请求这些包）：

| 颜色（索引） | 手：物品 → 包 | 身：物品 → 包 | 脚：物品 → 包 |
|---|---|---|---|
| 绿（1） | 100007 → `100202_0/_1` | 100008 → `100204` | 100009 → `100206_0/_1` |
| 紫（2） | 100010 → `100302_0/_1` | 100011 → `100304` | 100012 → `100306_0/_1` |
| 黄（3） | 100013 → `100402_0/_1` | 100014 → `100404` | 100015 → `100406_0/_1` |
| 紫罗兰（4） | 100016 → `100502_0/_1` | 100017 → `100504` | 100018 → `100506_0/_1` |
| 橙（5） | 100019 → `100602_0/_1` | 100020 → `100604` | 100021 → `100606_0/_1` |
| 粉（7） | 100025 → `100802_0/_1` | 100026 → `100804` | 100027 → `100806_0/_1` |
| 白（8） | 100028 → `100902_0/_1` | 100029 → `100904` | 100030 → `100906_0/_1` |
| 黑（9） | 100031 → `101002_0/_1` | 100032 → `101004` | 100033 → `101006_0/_1` |
| 深蓝（10） | 100143 → `103902_0/_1` | 100144 → `103904` | 100145 → `103906_0/_1` |
| 咖啡（11） | 100146 → `104002_0/_1` | 100147 → `104004` | 100148 → `104006_0/_1` |

- **常用装备样本**：已缓存 18 包（§5.2 表）覆盖头/眼/手/身/脚/腰带/翅膀/坐骑，够回归用；
  想补更多样本，同样在商城/背包里**预览**对应装备即可。
- **装备图标采集单（PI-g · 人类 2026-10-20 点名 B 追加）**：面板/商店右栏格子的**图标**（区别于上面的角色包）。
  服务器路径 = `res/item/equip/icon/<id>.swf`（试探实测：坐骑/眼/常规装备 = 200，默认色身体等 = 404）；
  目标清单 = `equip-index.items` 全部 `slot ∈ {1..8}`（**1735 件**，点名式、无 ID 扫描）；
  落盘 = **仓库镜像 `swf/item/equip/icon/<id>.swf`**（与 `game/app/view/item-art.js` 的 `itemSwfUrl` 路由逐字对上，UI 侧直接可播；镜像既有先例 = `swf/item/collection|emblem/**` 已入库）；
  404 件 = 逐件登记「未采集」清单（UI 退色块 tile + `assetMissing` 自陈，不摆假图）。工具 = `tools/fetch-actor-packs.mjs --icons`。
  **✅ 已执行（2026-10-20 PI-g）：1735 件 ⇒ 落仓 1687 / 未采集 48**（404 逐件登记 `game/data/actor/equip/icon-missing.json`，含默认色身体 100001–100008 等；消费面 as-built = `playerinfo-impl §7.5`）。
- **角色包采集单扩到全目录（MDB8-e3 · 人类 2026-10-20 手测反馈触发）**：PI-g 手测日志露出旧采集单口径缺口 —— 面板「全目录随便换」（PIQ5=A）放开后，玩家点穿了单外的件：脚 `111006_0/_1`（只走 fallback）、坐骑 `157003_0/_1`（缺 ⇒ 按未骑绘制 = M8-I2）。
  根因 = 上面的单按「29 骑乘 + 10 色默认」列（108 件），**没按全目录列**。
  本批 = 期望集改为**全目录推导**：`equip-index.items` 全部 `slot ∈ {1..8}` → `resourceIdOf(suit, slot)` 定包名（手/脚/坐骑要 `_0`+`_1`，其余无后缀；蓝/红裸装与默认头/眼 = 仓库 `.bin`、跳过不列）⇒ **2535 个包文件 / 573 个 suit 族**（仍 = 点名式清单、无 ID 扫描；体量实测均值 23KB ⇒ 全程 ≈54MB）。
  工具 = `node tools/build-actor-assets.mjs`（重生成期望）+ `node tools/fetch-actor-packs.mjs`（默认拉 `manifest.missing`）；404/坏包逐件登记 `game/data/actor/equip/pack-missing.json`（「未采集」，运行时降级链照旧、不伪造）。
  **✅ 已执行（2026-10-20 MDB8-e3）：2404 缺件 ⇒ 落仓 2390 / 未采集 14**（manifest 对账 = 1721 包 / 2516 文件 / missing 14）；14 件 = 服务器真无（含**五周年冠军坐骑 101737/suit570**、葛蕾芬手套等 suit76/86/108/279/413/454/498/512/572 族）⇒ 这些件继续走 fallback/未骑绘制降级链，as-built = `map-impl §7.3.29`。
- **对账**：采集后跑一次 `build-actor-assets.mjs` ⇒ `missing` 变小、新包带 `url` 与 `parsePack` 帧字段；
  若某件**定向拉取也拿不到**（404/站外无该文件）⇒ **记下名字、登记“未采集”**，不做无边界遍历（渲染已有降级链，不算死账）。

> 若要让复刻**离线可复现**，需要决定是否把选定的包放进仓库（`game/data/actor/equip/`）——
> 见 `ALQ5`。版权边界：素材只在本地研究使用，禁止二次分发。

### 5.6 缺素材清单（第一批）

| 缺口 | 影响 | 优先级 |
|---|---|---|
| 29 张骑乘坐骑 × 2 包 = **58** 个包 | 骑乘坐骑在 JS 路显示不出来 | **P0**（本功能的主目标） |
| 10 种颜色默认手/身/脚（绿/紫/黄/紫罗兰/橙/粉/白/黑/深蓝/咖啡） | ~~只能蓝/红裸装；切色会缺件~~ ⇒ ✅ **已补齐（2026-10-20 `MDB8-e3`）**：12 色的 36 件里 **33 个包在清单里**（实测 `manifest.packs`），缺的 3 个 = **红**的手/身/脚 ⇒ 那三件本来就走**仓库 `.bin` 裸装**（`NAKED_REFS`，非缺口）。⚠️ 这 36 件**已从部件目录剔除**、改由面板「颜色」组换色（`ALQ11`，2026-10-21） | ~~P1（`ALQ3`）~~ ✅ **结账** |
| 常用装备样本（头/身/脚/腰带/翅膀/眼） | 只能验证已缓存的 8 类样本 | P1（`MDB8-e`） |
| 其他 67 件 slot-3 装备（非骑乘表） | 非骑乘坐骑外观不完整 | P2 |
| `UI.swf` 里没有的 10 色裸装包 | 同第一项（默认装即装备包） | P1 |

### 5.7 缺件终态 · 官服实名表（2026-10-21 复查）

> **判据（先说清"怎么算真无"）**：包名不是我拼的 = 上游原文
> `vendor/seer2-origin-as3/src/com/taomee/seer2/app/inventory/item/EquipItem.as:103`（`"1" + pad3(suitId) + pad2(基准槽)`）
> 与 `:79-87`（后缀：基准槽 ∈{2,6,3} 主件 `_0`、镜像件 `_1`、其余无后缀）；
> 资源根 = `core/utils/URLUtil.as:143-147`（`res/` + `item/equip/{swf,preview,icon}/`）。
> **对照件同目录同规则 200**（坐骑 `136403_0` = 61773 字节 / 107 帧、`136403_1` = 200）⇒ 站在、路对、名对。

**① 部件包未采集（`game/data/actor/equip/pack-missing.json`，14 个文件 = 11 件物品，全 HTTP 404）**

| 物品 | 名 | 槽 / suit | 404 的包文件 |
|---|---|---|---|
| 101737 | **五周年冠军坐骑** | 3（坐骑）/ 570 | `157003_0` + `157003_1` |
| 101740 | **回忆录**（⚠️ 实为**手部**件、不是坐骑） | 2 / 572 | `157202_0` + `157202_1` |
| 100233 · 100253 | 葛蕾芬手套 · 兵团长拳套 | 2 / 76 | `107602_0` + `107602_1` |
| 100254 | 兵团长的剑 | 2 / 86 | `108602_0` + `108602_1` |
| 100770 | 渡鸦战靴 | 6 / 279 | `127906_0`（**半件**：`_1` 官服 **200**、已缓存 ⇒ 官方只缺主件） |
| 100337 · 101191 · 101335 · 101493 · 101537 | 雷电电闪 · 战魔武煞背甲 · 上古战神背装 · 张飞盔甲背装 · 鬼瞳背装 | 7（背装） | `110807` · `141307` · `145407` · `149807` · `151207` |

⇒ 处置 = **`ALQ10`（人类 2026-10-21）**：这 11 件**不进玩家面部件目录**（面板筛掉），
调试入口 `APP.actorLook.equip/ride` 与存档里已有的 ID **不屏蔽**（仍画 fallback、不静默改档）。

**② 图标未采集（`game/data/actor/equip/icon-missing.json`，48 件，全 HTTP 404）分组**

| 组 | 件数 | 说明 |
|---|---|---|
| 12 色默认手/身/脚 + 默认头 + 透明替身 | **38** | 官服 `res/item/equip/icon/` 无（`100001/100002` + `100004–100033` + `100143–100148`）；**其角色包反倒大多已缓存**（图标与包是两棵树） |
| 蓝队旗帜 100106 · 红队旗帜 100107 | 2 | 槽 7 |
| 阿卡/迪迪兰/咻休公仔 100242–100244 | 3 | 槽 2 |
| 无包那 11 件里图标也缺的 | 5 | 101737（**图标+包双缺 = 整套从没上传**）、100337、101335、101493、100233 |

> 图标缺**不作为**目录剔除条件：仍走 `game/app/view/item-art.js` 四级兜底，末位退色块 + `dataset.assetMissing` 自陈（不摆假图）。

**②-b 图标 48 件的三分（2026-10-21 人类问「可以从部件 swf 中生成吗」⇒ `ALQ14`）**

| 分支 | 件数 | 明细 |
|---|---|---|
| **可从部件包裁静图兜底** | **5** | 蓝队旗帜 `100106`、红队旗帜 `100107`（槽 7）、阿卡/迪迪兰/咻休公仔 `100242–100244`（槽 2）—— 图标 404 **但部件包已缓存** ⇒ `tools/pack-icon-stills.mjs` 从包内 PNG 裁 `standDown` 首帧、放大居中贴 120×120，落 `png/item/equip/icon/{id}.png` = 兜底链**第①级**（运行时零改动即亮起） |
| **包也 404 ⇒ 无从生成** | **5** | `100233` 葛蕾芬手套、`100337` 雷电电闪、`101335` 上古战神背装、`101493` 张飞盔甲背装、`101737` 五周年冠军坐骑 —— 这 5 件本就被 `ALQ10` 剔出玩家面，格子里根本看不到 |
| **不在玩家面目录 ⇒ 无需图标** | **38** | 12 色手/身/脚 + 默认头 `100001` + 默认眼 `100003` + 透明替身 `100002`（`ALQ11`/`ALQ13` 剔除）+ 槽 9 NONO 装（`ALC` 槽筛） |

> ⚠️ **裁出来的是"部件美术"、不是官服图标原画**（穿在角色身上的那件，尺寸小 ⇒ 放大有块感），
> 属**兜底美术**；官服 `res/item/equip/icon/` 那两个目录是真 404（同目录对照件 200），**无从补抓**。
> 产物**不入库**（`.gitignore` 的 `/png/*` 支，人类 2026-10-20 拍板「静图产物不入库」）⇒ 新克隆需重跑 `node tools/pack-icon-stills.mjs`。

**③ 「既不在缓存、也不在缺件单」的 132 条 = 设计排除，不是缺口**

- **129 条 = 槽 9 的 NONO 装**：`tools/build-actor-assets.mjs:78` 的 `slot<1||slot>8` 跳过（对应 `ALC` 表「槽 9 双重含义 / NONO 装备不计入」那条）；面板目录取槽 1/2/3/5/6/7/**8**（表情 = `ALQ12`）⇒ 不会露出。
- **3 条 = 蓝/红手身脚**：`NAKED_REFS`（`:68-72`）走仓库 `.bin`（见 §2.4 的 `ALQ11` 段）。

**④ 「表情」有两支，别混（人类 2026-10-21 问到）**

| 支 | 位置 | 素材状态（实测） |
|---|---|---|
| **装备表情/眼睛** | 槽 8（上游 `EquipSlot.as:18` `EYE`），`equip-index` 共 **21 件** | ✅ **已齐**：包 **21/21**、图标 **21/21**（含最新的 白眼表情 101741/suit573 → 包 `157308` **已缓存**、泪奔 100722 → `125908`）⇒ 不需补抓。**2026-10-21 `ALQ12`**：这一组已接进玩家面目录（面板「表情」组，**20 件** = 21 减默认眼睛 `100003`，见 `ALQ13`）|
| **对话气泡表情** | 地图 XML 的 `image="emoji/toon/*"`，**24 个名**（alert/angry/…/worried）、**54 张图**引用（另一支 `emoji/meme/*` = **7 个名**） | ✅ **素材在盘、且已入库**（⚠️ **本节先前判成"从没抓过 / 盘上为空"是我看错了树 —— 正本早就写在 `docs/map/map-move.md:319/:324`，特此更正**）：真实路径 = **`projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map/talk bubble/emoji/toon/`**（**24 png / 196K**，与 XML 里 24 个名**逐一对上、零缺件**）+ 同级 `emoji/meme/`（**7 jpg**）；`git ls-files` = **TRACKED**（`StaticResources/` 整棵在白名单里）。官服侧确实**没有**这条路（4 个候选根全 404：`res/emoji/toon/`、`/emoji/toon/`、`res/map/emoji/toon/`、`res/activity/npcTalk/`），上游 `URLUtil.as` 里也**没有** emoji 取数函数 ⇒ **它不是"抓"来的，是发行包自带的静图**。⇒ **现状缺口 = 运行时未接线**（气泡只画文本，`mapScene.js:1158` 一带），**不是缺素材**；接上它 = 一条新批（读本树静图 + 气泡排版），不必再登录器取证。**本批（ALQ10/ALQ11）不动它** |

---

## 6. 渲染规则

### 6.1 单槽 = 一个 `EquipPlayer`

`MultipleEquipPlayer` 为每个槽位建一个 `EquipPlayer`（`addEquipPlayer` `:66-76`）：
- `new EquipPlayer(item, userInfo)` → `super(item.swfUrl)`；
- `play()` + `gotoLabel(currentLabel)`；
- 槽位占用则 `updateEquipPlayer`（换包），不重复建；
- BODY 槽单独存 `_bodyEquipPlayer` 作为**帧时钟**。

### 6.2 层序（深度表）

正本：`EquipSlotDepth.as:6-8`。两套数组均**自底向上**：

| 朝向 | 顺序 |
|---|---|
| 朝上（`DIR_VERTICAL_MASK`） | `DOGZ_RIGHT, DOGZ_LEFT, EYE, HAND_RIGHT, FOOT_RIGHT, FOOT_LEFT, BODY, BELT, HAND_LEFT, HEAD, WING` |
| 朝下（其余） | `WING, HAND_RIGHT, FOOT_RIGHT, FOOT_LEFT, BODY, BELT, EYE, HEAD, HAND_LEFT, DOGZ_RIGHT, DOGZ_LEFT` |

`arrangeSoltDepth` 按 `getDepthByDirection` **升序**排序后 `addChildAt`（`:167-179`）。
⇒ 朝下时**坐骑在最上层**；朝上时**坐骑在最底层**（被身体挡住）。

我方 `ActorView.as` 只保留了裸装 7 槽（去掉 BELT/WING/DOGZ），
`actor-view.js` 的 `DOWN_ORDER`/`UP_ORDER` 也是 7 槽；M8 要扩成 **11 槽**（`MDB8-b`）。

### 6.3 默认包回退（避免空帧）

`EquipPlayer.initFrameSequence`（`:28-62`）：
- HEAD/EYE：先取 `UI_DEFAULT_HEAD` / `UI_DEFAULT_EYE`；
- HAND_L/R、BODY、FOOT_L/R：按 `_actorInfo.sex == 0 ? "UI_BLUE_*" : "UI_RED_*"` 取裸装；
- 然后 `_newFrameSequence = getFrameSequence(item.swfUrl, CacheType.EQUIP)`；
  `update()` 在新包 ready 后替换（`:69-74`）。

⇒ 已有默认件时**先有画面、后换装备**；没有默认件（BELT/WING/DOGZ）时**等装备包**。
⚠️ 10 种非蓝/红颜色的默认件会先显示蓝/红裸装，再换成本色包；如果包缺失 ⇒ **停在蓝/红兜底**（ALC6）。

**我方目标行为（`ALQ10`/`ALQ11` · 人类 2026-10-21）**：兜底链本身**保留**（调试入口、存档复原仍靠它不空帧）；
但**玩家面不再提供"画不出东西的选项"** —— 官服无包的 11 件与 12 色 36 件都不进面板部件目录（§5.7 ①/§2.4）。
⇒ 上游"任何物品都能穿、穿不出来就停在蓝/红"这一条**不照搬**（`AGENTS §2` 决议 ②：声明 + 按目标行为做）。

### 6.4 帧同步

`MultipleEquipPlayer.update`（`:193-199`）：

```as3
for each (player in _playerVec) {
    player.update();
    player.gotoAndPlay(this._bodyEquipPlayer.currentFrameIndex);
}
```

但 `FramePlayer.gotoAndPlay(param1)`（`:104-112`）**根本不使用 param1**，只把当前帧号存回自己；
⇒ 这行“同步”是**空操作**，每个部件按自己的时钟走。**run 区间全部对齐**（1–12/13–24）⇒ 跑步看起来同步；
**stand 区间并不对齐**（实测：裸装 BODY 25–65、装备件 `120301`（头）25–97、坐骑 `120403` 25–60）⇒
静止时各层按**自己的区间**循环，上游本就不会把坐骑拖到 BODY 的 97。**换装瞬间**新包的当前帧可能与 BODY 不一致（ALC3）。

**复刻目标行为（`MDB8-b2`，2026-10-20 人类点名要动画 ⇒ `ALQ7` 由 A 改 B）**：

- 帧率 = **24fps**（`game/maprunner/build-config.xml:13` 的 `default-frame-rate`；上游 `MobileManager.update()` 每 tick 调一次 `FramePlayer.update()`）。
- 每 tick：绘制**当前帧**，然后帧号 +1；越过标签 `end` ⇒ 回 `start`（`FramePlayer.updateFrame/updateFrameIndex`）。
  等价公式：`f = start + (tick % (end - start + 1))`。
- 切标签（stand↔run、Up↔Down）⇒ 从新标签 `start` 重新起播（`gotoLabel` → `updateIndexRangeByLabel` 的语义）。
- **各层用同一个 tick、但各自在自己的标签区间内循环**（`f = 本层 start + tick % 本层 span`）：
  上游每只 `EquipPlayer` 本来就是这样走（`gotoAndPlay(bodyFrame)` 是空操作，ALC3）；
  复刻只去掉上游的 ±1 错帧（所有层同 tick 推进），**不把不同区间强行并到 BODY 帧号** ——
  否则坐骑 `120403` 的 standDown 25–60 会被装备件（头）`120301` 的 25–97 拖住，每圈末尾冻结约 1.5s。
  本层缺该标签 ⇒ `standFrame` 兜底，不抛。（2026-10-20 手测反馈后修正，见 `map-impl §7.3.18`。）
- ⚠️ **装备层的 stand 区间可能不是 idle、而是“展示动作”**（**ALC13**）：射手弓 `120302_1` 的
  `standDown`（25–97）实测是「举弓→拉弦→射箭→回位」的整段动作（首帧 `si=12` 与末帧相同，中间最长到 480×150）。
  照上游循环会**站立时无限射箭** ⇒ 目标行为 = **装备层（11 槽）站立只取标签首帧**（`labelStartFrame`）；
  **坐骑层（3/11 槽）与裸装层仍整段循环**（坐骑 stand 是真 idle：悬浮/扇翅；裸装 EYE 要眨眼）。
  2026-10-20 手测反馈第 3 条落地。
- 标签选择：`moveStyle`（`stand`/`run`，玩家走位 = `run`）+ `Up`/`Down` 后缀（`MoveStyle.getStyleByDirection`）；
  动作/方向切换见 §6.7。JS 路自由走位速度是既有 `JS_SPEED`，不按 AS3 的 20px/tick 换算。

### 6.5 锚点与绘制

每个部件用自己的 `anchorX/anchorY` 与当前帧 `offsetX/offsetY`：

```
drawX = flip * (offsetX - anchorX)
drawY = offsetY - anchorY
```

> `MDB8-b2` 实现 = **整体镜像**：外层 `ctx.scale(flip, 1)`，层内用 `offsetX - anchorX` / 正宽
> ⇒ 阴影 / 11 槽 / 坐骑一定同向翻转。⚠️ 2026-10-20 手测反馈后由「逐层负目标宽」改为此式：
> **Chromium 的 `drawImage` 负目标宽只归一化矩形、不镜像像素**（实测），所以首版只翻了位置、没翻画面。

阴影单独先画，帧号 = **`localShadowFrame(shadowPack)`** = `UI_ActorShadow` 的 `local` 帧（=1）。
⚠️ **不能**用 `((bodyFrame - 1) % shadow.totalFrames) + 1`：`UI_ActorShadow` 的 3–39 帧是 **vip“光轮”**动画，
按 BODY 帧取模会在「普通阴影（1）/远程（2）/光轮（3–39）」之间反复切 —— 骑坐骑把脚下露出来时，
就表现为**光轮旋转中闪烁出阴影**（**ALC14**）。上游 `ActorShadow.updateLabel` 是按玩家身份**二选一**：
`vip` 循环 3–39、`remote` 停 2、本机普通玩家停 1。M8 尚无 vip 状态 ⇒ 默认恒取 `local`（1）；
按身份自动二选一仍待接用户信息。
**光轮 / 阴影可手动切换（`MDB8-b3`，人类 2026-10-20 点名）**：`APP.actorLook.ground('halo')` ⇒ 改画
`vip` 标签 3–39，按 24fps **独立时钟**循环（不随角色 stand/run 切换归零），角色照常播自己的 idle ⇒
两者互斥、不再交替；`ground('shadow')` 切回静止阴影。正式会话态/正式入口 = `MDB8-c`（已落：`session.groundMode`）；SWF 路本批仍不叠层。
然后 `DOWN_ORDER`/`UP_ORDER` 逐件画（`ActorView.as:123-158`；`actor-view.js` 的 `drawActor` 同式）。

### 6.6 坐骑视觉状态

`Actor.addDogz(isEquipAction, equipId)`（`:1124-1133`）：
- `isEquipAction == false`（初始化）：`animation.y = -50`，再 `checkAddFloat(equipId)`；
- `isEquipAction == true`（动态换装）：`checkAddFloat(equipId, true)`；
- 无论哪支：`_actorEquip.hidHandAndFoot()`（隐藏 2/6/9/10 四槽）、`runSpeed = 25`。
- `checkAddFloat`（`:1180-1205`）：
  - 若 `equipId` 在 `_floatList`（13 个 ID：`100324, 100377, 100393, 100394, 100419, 100439,
    100464, 100512, 100582, 100568, 100569, 100595, 100690`）⇒ 用 TweenMax 做升起/降下；
  - 否则 `animation.y = -50`。

`Actor.removeDogz`（`:1135-1140`）：
- `checkRemoveFloat(equipId)` 杀掉浮动 tween；
- `animation.y = 0`；
- `showHandAndFoot()`（恢复 2/6/9/10）；
- `runSpeed = 20`。

⇒ 复刻侧只需要三个可观察量：**y 偏移、四槽可见性、速度**；浮动坐骑的 Tween 是锦上添花（`MDB8-d`）。

**`MDB8-d` 落码后的口径（2026-10-20）**：
- 非浮动坐骑：`offsetY=-50` 静态；卸下瞬时归零。
- 浮动坐骑（13 个 ID，L1 `FLOAT_MOUNT_IDS`）：`-50 ± 5`、3s 正弦循环（近似上游 `tweenDown/tweenUp` 两段 1.5s TweenMax）；
  动态 `ride()` 先 2s 升起（Back.easeIn 近似），换图/读档/`preview` 直接浮动；`unride` 无降下动画（同上游）。
- 速度：JS 自由走 `JS_SPEED × 25/20`（0.28 → 0.35 px/ms，`M8-I1`）；SWF 走位仍归 `MapRunner`。

### 6.7 朝向与翻转

`FramePlayer.drawFrame` 用 `scaleX` 做水平翻转；`ActorView.render` 用 `b.scaleX = flip`、
`b.x = flip*(ox-anchorX)`。复刻 A2b 当时固定 `flip=1`（朝右），没有 4 向/上下层切换。

**`MDB8-b2` 起 JS 路按上游方向位掩码走 4 向（2026-10-20）**：

- `Mobile.direction`：bit1（`DIR_HORIZONTAL_MASK=1`）= 朝右 ⇒ `scaleX=+1`；bit1=0 ⇒ `scaleX=−1`（素材原生朝右）。
  bit2（`DIR_VERTICAL_MASK=2`）= 朝上（`stepStart.y > stepEnd.y`，即 y 递减）。
- `PathMobile.updateDirection` 只在**起步与路径拐点**调用（`updateHorizontal/VerticalDirection`）；纯水平段清 bit2 ⇒ **Down**。
- 方向标签 = `run/stand` + `Up/Down`（`MoveStyle.getStyleByDirection`）；**没有独立的左/右包**，左右只靠 `flip`。
- 停止（`stand`）时**保留最后的 `direction`** ⇒ 站立可能是 `standUp` + 朝左，不是强制回朝下。
- 深度序随上下切换：`DOWN_ORDER` / `UP_ORDER`（§6.2）；左右不换深度序，只换 `flip`。
- 初始状态 = 朝下、朝右（`up=false`、`flip=1`），与 A2b/`b` 批的静态首帧一致。
- 仍只做**本机玩家**；其他玩家、正式面板、B3 正式层不在本批。

---

## 7. 上游怪癖与数据坑（`ALC`）

> 处置口径 = **决议 ②**：登记 + 设计“没有该 bug”的目标行为；**不照搬**代码逻辑 bug。
> 数据错字/水印（如 900017/900018 行名错位、suit 204 缺行）按 **V2 口径**处理：
> 现实数据是什么就吃什么，但要**声明**，不许静默猜。

| # | 现象 | 证据 | 发行后果 | 我们的目标行为 |
|---|---|---|---|---|
| **ALC1** | `EquipSlot.isAccessory` 写成了 `p == HAND_LEFT && p == FOOT_LEFT`，恒假 | `EquipSlot.as:33-35` | 真正生效的是 `EquipItem.checkAccessory`（`:59-61`），此函数无人用 | 不实现该函数；用 `checkAccessory` 的判定（右/脚/坐骑三槽） |
| **ALC2** | `initEquip` 把 `getEquipIdByPetId(resourceId)` 的**返回值（equipId）**再喂给 `getEquipIdByPetId` | `ActorEquipHelper.as:41-43` | 初始登录时，若 `ridingPetInfo.resourceId != 0`，坐骑**不会被加上**；只有 `resourceId==0 && chipBackId!=0` 的分支正常 | 一次 `resourceId → equipId` 查询；查不到再 `chipBackId → equipId`；不二次反查 |
| **ALC3** | `MultipleEquipPlayer.update` 调 `gotoAndPlay(body.currentFrameIndex)`，但 `FramePlayer.gotoAndPlay(param1)` 忽略参数 | `MultipleEquipPlayer.as:193-199`、`FramePlayer.as:104-112` | 帧同步是空操作；换装/新包首次出场可能与 BODY 错帧 | 若做动画：显式把每个 `EquipPlayer` 的当前帧设为 BODY 帧；若只做静态：用 BODY 的 `standDown.start`，不假装同步 |
| **ALC4** | slot 9 同时是“左脚镜像槽”和“NONO 服装槽”；物品表 129 条 slot=9 全是 NONO 服装、**XML 里不写 `SuitID`**（`ItemConfig.as:188` 解析默认 **0**） | `EquipSlot.as:20`；`ItemConfig` 统计；`MultipleEquipPlayer.addEquip:37-39`；`ActorEquipHelper.addEquipToItemVec:156-169` | 正常左鞋不存在；NONO 服装不能被当装备穿上 | 保留“`suitId==0 && slot==9` 跳过”；左脚只由 `getAccessory()` 生成；不把 129 条 NONO 当外观装备 |
| **ALC5** | `PetInfo.updateFlag` 用 `8162` 表示骑乘，而解析用 `8192` | `PetInfo.as:373` vs `:396` | 回写/上报 flag 时骑乘位错；服务端/他人看到的状态可能不一致 | 统一 `8192`；本地状态不因这个错位丢失 |
| **ALC6** | 默认装合并用 `color`，`EquipPlayer` 的裸装兜底用 `sex` | `ActorEquipAssembler.mergeDefaultEquip:75`；`EquipPlayer.initFrameSequence:33-53` | 红/蓝兜底与玩家实际颜色可能不一致；非蓝/红颜色先闪蓝/红 | 复刻用**一个颜色源**（`color`）驱动默认装与兜底；`sex` 只做兼容输入 |
| **ALC7** | `ActorEquipHelper.removeEquip` 算了默认件 `_loc3_` 但从未使用 | `ActorEquipHelper.as:69-77` | 卸下装备后不会主动补默认件；依赖 `updateEquipVec` 的默认合并兜底 | 卸下后显式按槽补默认件（或确保合并步骤必跑） |
| **ALC8** | `chipBackId 900017/900018` 的行名与 equipId 物品名错位 | `PetRideShopConfig__setting.xml`；`101125` vs `101131` | 按名字找坐骑会拿错 | 只按 `chipBackId → equipId`（或 `petResourceId → equipId`）走；名字仅展示 |
| **ALC9** | 物品 `100582` 用 suit 204，但 suit 表没有 204 行 | `ItemConfig__suitXmlClass.xml` 302 行；`100582` | 套装名缺失；按 suit 表反查会漏 | 缺名不阻塞；用物品名/资源标识兜底 |
| **ALC10** | `120302_1` 有 52 条 info，而多数包 12–14 条 | 缓存包实测 | 若解析器假设“帧数=info 数”会错位 | 按 `frameNum` 读 info；取帧按 `key<=f`；不假设一一对应 |
| **ALC11** | `FrameSequence.as:5`、`tools/extract-actor-packs.mjs:5` 注释说“内嵌位图 SWF / AMF0”，实际是 AMF3 + PNG | `actor-view.js:6-8` 已登记 | 照注释找 SWF 会找不到 | 以 `parsePack` 的实测格式为准；注释只当历史 |
| **ALC12** | 骑乘表 48 行只有 29 个 distinct `equipId` | XML 实测 | 重复行可能导致同一坐骑被加多次 | 按 `equipId` 去重；`EquipItem` 以 `referenceId` 查重 |
| **ALC13** | 装备包的 `stand*` 标签区间可能编入“展示动作”，不是 idle | 缓存包实测：`120302_1`（射手弓左手）`standDown` 25–97 = 举弓→拉弦→射箭→回位（首末帧同为 `si=12`） | 照上游 `gotoLabel('standDown')` 循环 ⇒ **站立时无限射箭** | 装备层（11 槽）站立只取标签首帧 `labelStartFrame`；坐骑（3/11 槽）与裸装层仍循环（2026-10-20 人类手测反馈） |
| **ALC14** | `UI_ActorShadow` 第 3–39 帧是 vip“光轮”，1/2 才是普通/远程阴影 | `game/data/actor/UI_ActorShadow.bin` 标签 `local=1 / remote=2 / vip=3–39`；`ActorShadow.updateLabel` 按身份二选一 | 用 BODY 帧对 `totalFrames` 取模 ⇒ 光轮与阴影逐圈交替，脚下闪烁 | 本机普通玩家恒取 `local`（1）；vip 时才循环 3–39、remote 停 2；不按 BODY 帧取模（2026-10-20 人类手测反馈） |

---

## 8. 复刻落点与缺口

### 8.1 建议的分层

```
L0  game/core/actor/look.ts?       （可选）纯模型：槽位/深度/资源标识/默认装/骑乘映射
L1  game/logic/map/actor-look.js   （推荐）纯解析 + 纯计划：输入 equipVec/ridingPetInfo/color，
                                    输出 [{slot, packBase, suffix, mount}] 与 {offsetY, hideHandFoot, speed}
L4  game/app/scenes/mapScene.js    loadActorParts / drawActor 扩展：按计划装包、11 槽合成、坐骑偏移
```

**为什么先放 L1**：现有 A2b 的 `actor-view.js` 已经是 L1；M8 的增量主要是“把 8 件裸装计划
扩展成 11 槽计划”，不需要新 L0。等数据模型稳定、被战斗/面板复用时再考虑下沉 L0。

### 8.2 L1 纯函数建议（`MDB8-a`）

> ✅ **as-built（2026-10-20，`MDB8-a`）**：已落 `game/logic/map/actor-look.js`，API 与下表一致；
> 两处落地细化 —— `mergeDefaultEquip(color, equipVec, itemIndex)` 多吃 `itemIndex`（槽号/套装查询）、
> `buildLookPlan` 返回 `LookPlan{signature, direction, color, layers[], hiddenSlots, mount, offsetY, speedFactor, warnings}`；
> 每层带 `source`（`naked`/`equip`）与 **`freezeStand`**（`b2` 第二轮手测新增：装备层 true、裸装/坐骑 false，见 ALC13）；
> `mount` 另带 **`float`**（`d` 新增：装备 ID 命中 `FLOAT_MOUNT_IDS` ⇒ true）。
> 数据表 = `game/data/equip-index.json`（`items` 1,864 条 + 骑乘两表）+ `game/data/actor/equip/manifest.json`（包清单/缺件）；详见 `map-impl §7.3.15`。

| 函数 | 输入 → 输出 | 说明 |
|---|---|---|
| `resourceIdOf(suitId, slot)` | `(int,int) → string` | `"1"+pad3(suit)+pad2(slot)`；左槽先映射右槽号 |
| `packSuffixOf(itemLike)` | `{slot, hasAccessory, isAccessory}` → `''/'_0'/'_1'` | 与 `EquipItem` 三态一致 |
| `defaultRefsOf(color)` | `color → [refId x5]` | 12 色表；见 §2.4 |
| `mergeDefaultEquip(color, equipVec)` | `(color, refId[]) → refId[]` | 按槽位补 5 件，已有同槽不补 |
| `mountEquipIdOf(ridingPetInfo, rideTable)` | `PetInfo + 表 → refId\|0` | 先 `resourceId → equipId`；查不到再 `petRideChipId → chipBackId → equipId`；不二次反查（ALC2） |
| `buildLookPlan({equipVec, ridingPetInfo, color, sex, direction})` | → `{layers:[...], offsetY, hideHandFoot, speed}` | `layers` 自底向上，每层含 `freezeStand`；坐骑 ⇒ `offsetY=-50`、`hideHandFoot=true`、`speed=25` |
| `slotOrder(direction)` | `'down'/'up' → slot[]` | 11 槽深度表；见 §6.2 |

**不变量**：
- **ALI1**：物品 ID ≠ 资源标识；任何路径拼接前必须先查 `SlotIndex`/`SuitID`。
- **ALI2**：`swf/` 下的装备包是自定义帧序列（PNG），不是 CWS；预览/图标才是 CWS。
- **ALI3**：左槽只由右手/右脚/坐骑镜像生成，不读独立物品。
- **ALI4**：坐骑 = slot 3 装备包 + `offsetY=-50` + 藏 2/6/9/10 + 速度 25；没有独立坐骑渲染器。
- **ALI5**：默认装合并按**槽位**去重；玩家自定义件优先。
- **ALI6**：缺包 ⇒ 该槽不画/退默认件，不崩、不伪造。

### 8.3 L4 扩展（`MDB8-b`/`MDB8-b2`/`MDB8-c`/`MDB8-d`）

> ✅ **as-built（2026-10-20，`MDB8-b`）**：`mapScene.js` 已改为 `syncLook()` + `loadLookParts()` + 11 槽 `drawActor`；
> 缓存键 = **`source:pack:suffix`**（不是计划签名），换计划只装新增键并关闭不再引用的位图；
> 本批手测钩子 = `APP.actorLook.preview({color,equipVec,mountEquipId})` / `clear()`（`c` 批已加正式 `equip/unequip/ride/unride/color`，preview 保留为整组直通）。详见 `map-impl §7.3.17`。
> ✅ **as-built（2026-10-20，`MDB8-c`）**：`syncLook` 输入 = `LOOK_OVERRIDE`（直通）> `session.equipVec`/`mountEquipId`/`actorColor`（`null` = 跟随 `#avSel`）；
> `session.groundMode` 收编 b3 的地面特效；正式入口 = `equip/unequip/ride/unride/color/dump`，**只改会话态、不写盘**。详见 `map-impl §7.3.20`。
> ✅ **as-built（2026-10-20，`MDB8-d`）**：`stepJs` 吃有效计划的 `speedFactor`（M8-I2 降级 = 1）；
> `mountVisualOffset()` = 非坐骑 0 / 非浮动 `-50` / 浮动 `-50±5`（3s 正弦）；`ride()` 动态换乘浮动坐骑走 2s 升起；
> `unride/clear` 瞬时归零；阴影/光轮不吃该偏移。详见 `map-impl §7.3.21`。

现有 `loadActorParts(color)` / `drawActor(ctx,x,y,flip)` 需要改成“按计划装包”：

1. **计划**：从 `session`（或调试状态）取 `equipVec` / `ridingPetInfo` / `color` / `sex`，
   调 L1 `buildLookPlan` 得到 layers。
2. **装包**：对每层算 `packBase` + `suffix`，取 `/game/data/actor/equip/<pack>.bin`
   （或按 `ALQ5` 的素材落点）；`ACTOR_CACHE` 改为按**计划签名**缓存，
   换装时只装新增/变更的包，旧 `ImageBitmap` 关闭。
3. **合成**：`drawActor` 先画阴影，再按 `layers` 自底向上画；每层用自己的 `anchor`；
   `y` 加 `offsetY`（坐骑 −50；浮动坐骑 −50±5、动态骑上 2s 升起 = `MDB8-d`）。
   **动画（`MDB8-b2`）**：标签 = `run/stand` × `Up/Down`；**每层在同一 tick 下按自己的标签区间循环**
   （切标签各回自己的 `start`）；**装备层站立只取标签首帧**（`freezeStand`，ALC13；跑动仍整段循环）；
   `Up` 时层序换 `UP_ORDER`；左右翻转 = 整体 `ctx.scale(flip,1)`；
   阴影 = `localShadowFrame` = `UI_ActorShadow` 的 `local` 帧（ALC14；不跟 BODY 帧，§6.4/§6.5）。
4. **隐藏手脚**：`hideHandFoot` 时跳过 slot 2/6/9/10（对应 `MultipleEquipPlayer.hideHandAndFoot`）。
5. **调试入口**（第一批不接正式面板）：
   - `window.APP.actorLook.equip(refId)` / `unequip(refId)`（**物品 ID**，如 `100577`；不是资源标识 `120301`）；
   - `window.APP.actorLook.ride(equipId)` / `unride()`（**装备物品 ID**，如 `101020`；不是 `chipBackId` `900011`）；
   - `window.APP.actorLook.dump()` 打印当前计划（槽/包/缺失）。
   `equip/unequip/ride/unride` 自 **`MDB8-g`** 起**变更即落盘**（`ALQ1=A`，经 repository 写根级 `<equip>`）；
   `color/ground/preview/clear` 仍只改会话态、**不写盘**。`window.APP` 是既有调试命名空间（`game/app/state.js:13`），不另造 `window.A`。
6. **动画循环**（`MDB8-b2`，`MDB8-f` 起也供 SWF 叠层复用）：新增常驻 rAF（按 24fps 节流，仅帧号变化时重绘），
   由 `enterJsMode`/`syncLook` 启动、`leaveJsMode`/`unmount` 取消；循环门禁 = `canDrawActor()`（SWF 图无自定义外观时不启动）。

### 8.4 SWF 路（`ALQ2=B` · 人类 2026-10-20 拍板）

> ✅ **as-built（2026-10-20，`MDB8-f`）**：已按本节落码，详见 `map-impl §7.3.23`；手测 = `map-impl §8.18`。
> `hasCustomLook()` 只认装备/坐骑（裸装/12 色默认不算）；`LOOK.missingCustom` 任一非空 ⇒ 不叠、黄点 + 日志。

- 现状：`game/maprunner/MapRunner.as:382-391` 的 `loadActor(color)` 只调 `ActorView.load(color, "/game/data/actor/", ...)`；
  `ActorView.as:35-41` 只装 7 件裸装。`game/maprunner/**` 仍是 **no-modify 区**。
- **决策 B**：SWF 图**也显示**装备/坐骑，做法 = 在既有 `#ov` 自绘层**整只叠一个 canvas 角色**，
  **不碰 `game/maprunner/**`、不重编译 AS3**。
- 落点（`game/app/scenes/mapScene.js`）：
  - SWF 路原先在 `draw()` 的 `M.pos` 分支画**黄点**；`MDB8-f` 起改为 `canDrawActor()` 分支：
    **有装备/坐骑 + 自定义包全就绪** ⇒ `drawActor(octx, M.cam.x + M.pos.x, M.cam.y + M.pos.y, LOOK_SCALE, LOOK_DY)`；
    **无装备/坐骑 / 缺自定义包 ⇒ 仍画黄点**（SWF 路基线不变）。
  - 坐标不需要新通道：`MapRunner.as:610` 每 6 帧 `post({type:"mapState", x:ax, y:ay, camX:world.x, camY:world.y, moving})`，
    `mapScene.js` 已把它存进 `M.pos` / `M.cam`；黄点今天就是这么画的，叠层照用。
  - `mapState.moving` 驱动叠层 `run/stand`；朝向按 4Hz 位移首版推断。`mapWalk` 的 x/y 是**目标点**
    （`MapRunner.as:532`）⇒ 叠层激活时不写 `M.pos`（否则整只角色先闪到终点），无叠层时保留旧行为。
- 第一版边界：
  - **帧动画**：`ALQ7` 已由 A 改 B（JS 路 `MDB8-b2` 已按 24fps 播放）⇒ SWF 叠层复用同一 `drawActor`；位置仍跟 `mapState`（约 4Hz），朝向首版为位移推断；
  - 只做**本机玩家**；其他玩家 / 正式面板不在本批（`ALQ6`）；
  - 缺包 ⇒ **不叠**、保留黄点 + 日志（`ALI6`），不崩、不伪造；
  - **非蓝/红颜色单独切换**（无装备/坐骑）在 SWF 路仍不叠层（本批 `hasCustomLook` 口径；有自定义外观时整只角色按该色绘制）。
- **已知缺陷（如实登记、人眼校）**：
  1. **双角色**：底层 SWF 的裸装角色仍在走/动，我们的整只角色盖在上面；锚点/尺寸不齐会**露边** ⇒
     ✅ **已由 `MDB8-f2` 修复（2026-10-20 人类拍板「修」）**：`MapRunner.as` 加 `actorVisible` 回调，
     canvas 叠层**真正画出**时隐藏底层裸装角色，回退黄点/无装备/缺包时恢复（as-built = `map-impl §7.3.25`）；
  2. **遮挡穿帮**：`front_mc` 的前景遮不住 `#ov`（`z-index:2`）—— 与 B3 SWF 路 NPC 同族缺陷；
  3. **走位位置不同步**：位置 4Hz 回报；快速走动时可能看出拖影/跳格 ⇒
     ✅ **已由 f2 同日手测修补 ① 处理（2026-10-20 人类反馈「移动一抖一抖」）**：`draw()` 的 SWF 叠层分支改走
     `swfFollowPoint()` **指数平滑跟随**（τ≈55ms；大跳 >80px / 到站 / 首帧吸附），**不碰 `MapRunner.as`**（as-built = `map-impl §7.3.25` 修补段、手测 = `§8.20` 第 7 条）；
  4. **朝向滞后**：位移推断在拐角/小步时可能慢半拍。
  脚底/大小对齐用 `LOOK_DY` / `LOOK_SCALE`（默认 0 / 1）人眼校，**不动 MapRunner**。
- 选项 C（改 `MapRunner.as` / `ActorView.as`）**已部分采纳**：`MDB8-f2` 只加 `actorVisible` 显隐开关（人类 2026-10-20 拍板，围栏授权例外之二），
  不改外观合成/相机/走位；若日后要让装备进 SWF 内部（顺带解决前景遮挡）再另议。

### 8.5 会话 / 存档（`ALQ1=A` · 人类 2026-10-20 拍板）

> ✅ **as-built（2026-10-20，`MDB8-c`）**：`session` 已有 `equipVec`/`mountEquipId`/`ridingPetInfo`/`actorColor`/`actorSex`/`groundMode`；
> `adopt` 从 `data.equip` 读（旧档无该块 ⇒ 恒缺省）。详见 `map-impl §7.3.20`。
> ✅ **写盘（2026-10-20，`MDB8-g`）**：`mergeBack` 把会话态写回根级 `<equip>`（空 = `null` ⇒ 整段省略）；
> `equip/unequip/ride/unride` 变更即 `session.save()`。详见 `map-impl §7.3.24`、手测 `§8.19`。

- `game/app/session.js` 目前没有 `equipVec` / `ridingPetInfo` / `mountEquipId` / `actorColor` / `actorSex`；
  A2b 的颜色来自 DOM `#avSel`，不进会话；`gender` 本来就在存档根节点。
- **决策 A**：存档 XML **新增我方扩展块 `<equip>`**，记**已装备物品 ID 列表 + 坐骑装备 ID**。
  - **schema 正本 = `docs/save/save-xml-spec.md §2.22`**（本份只引用，不另立一套）：
    `<equip><items><int>100577</int>…</items><mountEquipId>101020</mountEquipId></equip>`；
    `mountEquipId=0` = 未骑乘；旧档缺整块 ⇒ 视为“无装备 / 未骑乘”。
  - 读：登录/进图装配 `session.equipVec` / `session.mountEquipId`；默认装仍由 L1 `mergeDefaultEquip(color, equipVec)` 补齐。
  - 写：`equip` / `unequip` / `ride` / `unride` 成功后经**存档线唯一写盘口 repository** 落盘（`docs/save/save-impl.md` 纪律）。
  - **兼容风险**：上游客户端不认识 `<equip>`（会忽略）；若上游重写该档，这一块会丢 —— **复刻档不得喂回官方服**。
    我们自己的 round-trip 必须**原样保留**（`save-xml-spec §6` 既有规则）。
- **不要**把装备状态藏进 `activityStorage`（活动袋）——语义不同，会污染存档。
- **`color` / `sex` 不在本次决定内**：`gender` 已在存档；角色颜色仍由 DOM `#avSel` 决定。
  若日后要“重开还保持红/蓝”，需另立决策（可加进 `<equip>` 或 settings，别顺手塞）。

### 8.6 面板 / 预览 / 图标

- `preview/` 与 `icon/` 是真 CWS，适合背包/图鉴/商店面板；**不要**拿 `swf/` 包喂 Ruffle（它不是 SWF）。
- 装备图标 URL 用**物品 ID**；预览 URL 用**资源标识**（§5.1）——面板线接的时候注意。
- 第一批 M8 不做正式装备面板；只做调试入口。正式 UI 归 C1/C2（`ALQ6`）。

---

## 9. 施工批草案（`MDB8-a…i` + `f2`）

> 批号是本份局部编号；**`a`–`d` 已落+手测通过 · `e`/`f`/`g`/`f2` 代码已落（2026-10-20）· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**。
> **拍板记录（人类 2026-10-20）**：`ALQ1=A`（存档加 `<equip>`）、`ALQ2=B`（SWF 图叠 canvas 角色）；
> `ALQ3–ALQ8` **按本份建议默认**（人类复核未提出异议，可随时改）。
> 原则：一次只落一个可独立验收的批，每批停下等人手测（`AGENTS §1`）。

| 批 | 内容 | 验收面 | 依赖 |
|---|---|---|---|
| **MDB8-a** | ✅ **已落（2026-10-20）** · **数据桥 + 纯计划**：`actor-look.js` 的 `resourceIdOf` / `defaultRefsOf` / `mergeDefaultEquip` / `mountEquipIdOf` / `buildLookPlan`；数据源吃小表 `game/data/equip-index.json`（`ALQ4=A`） | 控制台可打印 3 组计划（裸装、穿 `100577`〔资源 `120301`〕、骑 `101020`〔资源 `136403`〕）；**不改画面、不新增测试脚本**。as-built = `map-impl §7.3.15`、手测 = `§8.11` | — |
| **MDB8-b** | ✅ **已落（2026-10-20）** · **JS 路 11 槽渲染**：`loadLookParts` 按计划装包 + fallback 链；`drawActor` 11 槽合成；缺包退默认/跳过；裸装逐像素回归；`M8-I2`（坐骑缺包不进入骑乘态）提前守住 | 进 JS 图 ⇒ 裸装与今天逐像素一致；`APP.actorLook.preview({equipVec/mountEquipId/color})` 逐件穿/卸、层序正确、缺包不崩。as-built = `map-impl §7.3.17`、手测 = `§8.13` | `MDB8-a` |
| **MDB8-b2** | ✅ **已落（2026-10-20；人类点名要动画，`ALQ7` 由 A 改 B）** · **帧动画 + 4 向**：L1 `cycleFrame`/`labelOf`/`stepDirection`；L4 常驻 24fps rAF、`run/stand × Up/Down` 循环、切标签各回 `start`、**各层同 tick 但按自己的标签区间循环**（上游实况，ALC3 空操作）、`UP_ORDER`、**整体镜像翻转**（`ctx.scale(flip,1)`）。⚠️ 2026-10-20 手测两轮修补：第一轮「idle 有停顿 / 朝左不翻」⇒ 各层各自区间 + 整体变换；第二轮「光轮闪阴影 / 套装站立射箭」⇒ 阴影恒 `local` 帧（ALC14）+ 装备层站立只取首帧（ALC13），见 as-built §7.3.18 | 进 JS 图 ⇒ 站立循环动画；点地走 ⇒ `runDown/runUp` + **整体**左右翻转（含坐骑/装备/影子）；停下保留朝向；朝上层序正确；坐骑 idle 连续不冻结；**脚下只有静止阴影（无光轮闪烁）**；**穿射手套站立不射箭**。as-built = `map-impl §7.3.18`、手测 = `§8.14` | `MDB8-b` |
| **MDB8-b3** | ✅ **已落（2026-10-20；人类点名「想要光轮」）** · **地面特效切换（阴影 ↔ 光轮）**：L1 `vipShadowFrame`（`UI_ActorShadow` 的 `vip` 标签 3–39 循环）；L4 `GROUND_MODE` + `groundElapsed` 独立时钟（不随角色 stand/run 归零）、`APP.actorLook.ground('halo'\|'shadow')`。默认 `shadow`；`halo` 与角色 idle 各自循环、互斥不交替 | 穿套装/骑坐骑：`ground('halo')` ⇒ 脚下黄色光轮**连续旋转**、角色 idle 照常；`ground('shadow')` ⇒ 回静止灰影；`clear()` 回裸装 + 阴影。as-built = `map-impl §7.3.19`、手测 = `§8.14` 第 15–16 条 | `MDB8-b2` |
| **MDB8-c** | ✅ **已落并手测通过（2026-10-20）**：`session` 加 `equipVec`/`mountEquipId`/`ridingPetInfo`/`actorColor`/`actorSex` + `groundMode`；`window.APP.actorLook.equip/unequip/ride/unride/color/dump`；换装重绘、缓存清理 | 连穿多件、换件、卸件；换图回图状态还在（会话内）；**本批仍不写盘**。as-built = `map-impl §7.3.20`、手测 = `§8.15` | `MDB8-b` |
| **MDB8-d** | ✅ **已落并手测通过（2026-10-20，人类「it worked good」）**：slot 3 包；`offsetY=-50`；藏 2/6/9/10；速度 25/20；13 个浮动 ID = `-50±5`/3s 正弦 + 动态骑上 2s 升起（M8-I5 改口径） | 骑 `100582`（资源 `120403`，本机唯一已缓存坐骑且为浮动）⇒ 2s 升起、持续上下浮动、跑速 ×1.25；`unride` 即时恢复；缺包退裸装 + 日志。⚠️ `101020`（`136403`）未缓存，只验降级；固定坐骑“不浮动”等 `e` 补素材 | `MDB8-c`；as-built = `map-impl §7.3.21` |
| **MDB8-e** | ✅ **已结账（2026-10-20）** · **素材补齐 + 清单**：29 张坐骑 ×2 包、10 色默认装、常用装备样本；`manifest.json` 增 `url`/`cachedAt`/`parsePack` 字段，缺包日志改为**每签名一行**。**缺件 108 = 定向拉取全量补齐（`MDB8-e2`，人类拍板 B，as-built `map-impl §7.3.28`）⇒ manifest missing=0** | 清单与缓存对账（不误报已有包）；缺包一行日志；采集后新包上屏。as-built = `map-impl §7.3.22`/`§7.3.28`、手测 = `§8.17`；**遍历禁令仍在、采集单点名定向拉取已批准（人类 2026-10-20 B，见 §5.5）** | `ALQ5=A`（默认） |
| **MDB8-f** | ✅ **代码已落（2026-10-20）** · **SWF 路叠层**（`ALQ2=B`）：`draw()` 的 SWF 分支由黄点改为整只 canvas 角色（有装备/坐骑且自定义包齐时）；位置吃 `mapState`（含 `moving`）；缺包/无装备仍黄点；本批不碰 `game/maprunner/**`（显隐修复见 `f2`）。as-built = `map-impl §7.3.23`、手测 = `§8.18` | 进 SWF 图（如 `10017`/`100`/`151`）穿装备/骑 `100582` ⇒ 角色可见、位置跟走位；无装备时仍是今天画面；`101020` 缺包 ⇒ 黄点降级；人眼校双角色/遮挡/跳格/脚底 | `MDB8-d` |
| **MDB8-g** | ✅ **代码已落（2026-10-20）** · **存档接线**（`ALQ1=A`）：codec 根级末块 `EquipLook` + `schema.fresh/validate` + `mergeBack` 写回；读档灌 `session.equipVec`/`mountEquipId`（`c` 已备）；换装/骑乘后经 repository 写 `<equip>`（schema = `save-xml-spec §2.22`）。as-built = `map-impl §7.3.24`、手测 = `§8.19` | 穿装备骑行 → **关浏览器重开** ⇒ 外观还在；XML 有 `<equip>`、空外观整段省略；导出/导入 round-trip 不丢块；旧档（无 `<equip>`）正常进游戏 | `MDB8-c` + 存档线评审 |
| **MDB8-f2** | ✅ **代码已落（2026-10-20，人类拍板「修」双角色）** · **SWF 裸装角色显隐**：`MapRunner.as` 加 `ExternalInterface.addCallback("actorVisible")`（**只拨 `actor.visible`**）+ 重编译 `mapRunner.swf`；`mapScene.js` 的 `draw()` 在 canvas 叠层**真正画出**的那一帧把底层 ActorView 隐藏、回退黄点/无装备/缺包时恢复（`swfActorHidden` 缓存，新播放器/卸载归零）；**同日手测修补 ①** = `swfFollowPoint()` 叠层位置**指数平滑跟随**（修人类反馈「移动一抖一抖」= 4Hz 回报台阶；τ≈55ms、大跳/到站/首帧吸附；**不碰 `MapRunner.as`**）。as-built = `map-impl §7.3.25`、手测 = `§8.20` | 进 SWF 图穿装备/骑 `100582` ⇒ **只有一只角色**（不再露裸装边）、**连续走动平滑不抖**；`unequip`/`unride`/`clear()` 回黄点 + 原 SWF 角色；换图/传送后仍一只、落位瞬时；走位/光口/NPC/野怪/相机行为不变 | `MDB8-f` |
| **MDB8-h** | ✅ **已落并手测通过（2026-10-21，人类「ok, done good」；`ALQ10=A`/`ALQ11=A`）** · **玩家面缺件过滤 + 「颜色」组**：L1 导出 `COLOR_ITEM_IDS`（36 件颜色装，由 `DEFAULT_COLORS` 展平 = 单一真值）+ `packRefOf`（包名/后缀唯一口径）；L4 `listCatalog` 按「槽位 → 剔颜色件 → 剔清单未登记的包」筛 + 末位「颜色」组（12 钮、`onPickColor` → `APP.actorLook.color(n)`、**不落盘**）+ 清单预热 `PIF_MANIFEST`。as-built = `map-impl §7.3.30`、手测 = `§8.24` ✅ | 六组 **1701 → 1666**；11 件无包件不再露出；「颜色」组即时换色、重开面板保持、`<equip>` 不含颜色；调试面 `APP.actorLook.equip(101737)` 仍可穿 | `MDB8-e`（清单） |
| **MDB8-i** | ✅ **已落并手测通过（2026-10-21，人类「ok, done good」；`ALQ12`/`ALQ13`/`ALQ14`）** · **表情组 + 空件不列 + 裁帧图标**：L1 `isEmptySuitItem`（`suit===0`）；L4 `PI_GROUPS` 插「表情」（槽 8，排坐骑后、阴影前）+ `listCatalog` 第四条筛；新工具 `tools/pack-icon-stills.mjs` 生成 5 张图标静图。as-built = `map-impl §7.3.31`、手测 = `§8.25` ✅ | 组标签 **9 个**；表情 **20 格**、点即换脸且**落盘**；头 **346**（无「默认头顶」）；旗帜×2 + 公仔×3 的格子从色块变部件裁帧图 | `MDB8-h` |

**建议顺序**：`a → b → c → d`（先把“穿、换、骑”跑通），随后 `f`（SWF 路可见）与 `g`（写盘）可并行，`e`（素材）与 `d` 并行；`f2` 收 `f` 的双角色尾巴。当前 `a`–`i` + `f2` 已全部落码；`a`–`d` 手测通过，`e`/`f`/`g`/`f2` 分别等 §8.17/§8.18/§8.19/§8.20 ⇒ **e/g（§8.17 / §8.19）✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过）；f/f2（§8.18 / §8.20）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**；**`h`/`i`（2026-10-21 两批玩家面收口）已落码并手测通过（2026-10-21，人类「ok, done good」⇒ §8.24/§8.25 已结账）**；M8 手测全清 = **§8.17**（e · 补齐的部件包在新图上屏）✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过） / **§8.19**（g · 换装后存盘重载、`<equip>` 空时整段消失）✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过） ⇒ **M8 全线收口**。
**其他玩家外观 / 正式装备面板**不在 `MDB8-*`：分别归 A 组（联机）与 C1/C2（`ALQ6=A`）。**追记（2026-10-20）**：PlayerInfo（View 线 C4）已内嵌最小装备/坐骑两栏（`playerinfo-design.md §3.8` + 施工批 PI-f）⇒ 本线调试入口 `APP.actorLook.*` 自此有了正式消费面；独立正式装备/骑乘面板仍归 C1/C2。

---

## 10. 请人拍板（`ALQ`）

> 按 `AGENTS §1.2`：先用人话说明“是什么 / 为什么现在问 / 选项与后果 / 建议”，编号只当附注。

**拍板记录（人类 2026-10-20）**

| 项 | 结论 |
|---|---|
| **`ALQ1`** | ✅ **A** —— 存档 XML 新增我方扩展 `<equip>`（schema = `save-xml-spec §2.22`） |
| **`ALQ2`** | ✅ **B** —— SWF 图叠一层 canvas 角色，不碰 `game/maprunner/**` |
| **`ALQ3–ALQ8`** | 按各条「建议」**默认采用**（人类复核未反对，可随时改） |
| **`ALQ7`（改判）** | ✅ **B（2026-10-20）** —— 人类实测 `MDB8-b` 静态画面后点名要动画 ⇒ 显式帧同步 + 4 向，落插入批 `MDB8-b2` |
| **`ALQ9`** | ✅ **2026-10-20 人类点名** —— 光轮/阴影**可手动切换**（默认阴影；`APP.actorLook.ground('halo'\|'shadow')`）；光轮 = `vip` 3–39 独立循环、角色各自 idle；落 `MDB8-b3`，会话态/正式入口 = `MDB8-c`（`session.groundMode`，跨图保持） |
| **`ALQ10`** | ✅ **2026-10-21 人类拍板 A** —— 官服无美术包的 11 件（§5.7）**只从玩家面部件目录剔除**；调试入口与存档里的 ID 不屏蔽、照常画 fallback、不静默改档 |
| **`ALQ11`** | ✅ **2026-10-21 人类拍板 A** —— 12 色 36 件（手/身/脚）**退出部件目录**，颜色单开**面板「颜色」组**（走 `APP.actorLook.color(n)`、不落盘） |
| **`ALQ12`** | ✅ **2026-10-21 人类点名**（「更改角色表情未添加」）—— 面板补**「表情」组 = 装备槽 8**（素材 21/21 全齐、L1 早已支持）；表情是装备件 ⇒ **落盘**（与颜色/阴影不同） |
| **`ALQ13`** | ✅ **2026-10-21 人类点名**（「默认头顶不就是没有头顶吗」）—— 上游 `suit=0` 的**默认/空件**（默认头顶 100001 / 默认眼睛 100003 / 透明替身 100002）**不列玩家面**；只筛显示、不筛调试入口与存档 |
| **`ALQ14`** | ✅ **2026-10-21 人类问「能不能从部件 swf 生成图标」⇒ 答复"能"并采用** —— 新工具 `tools/pack-icon-stills.mjs` 从部件包内嵌 PNG 裁 `standDown` 首帧 ⇒ `png/item/equip/icon/{id}.png`（兜底链第①级、**运行时零改动**、产物不入库）；当前命中 **5 件** |

### ALQ1 · 装备/坐骑状态存在哪里？（**✅ 已拍板 A · 2026-10-20**）

- **是什么**：玩家穿了哪些装备、骑的哪只坐骑——今天只存在运行内存/服务端，**存档里没有**。
- **为什么现在问**：如果不决定，第一批只能做“会话态”（重开游戏就回裸装）；做了写盘又要改存档线。
- **选项**：
  - **A（建议）**：存档 XML 新增一小块 `<equip>`（装备物品 ID 列表 + 骑乘芯片/装备 ID），由存档线加字段；
    后果 = 重开仍保持，需改 `save-xml-spec` 与 round-trip。
  - **B**：只做会话态，重开回裸装；最快，但不能真正“玩”装备。
  - **C**：从背包物品的 `isEquiped` 标记推导；不加新块，但要给每件物品加“已装备”状态，改动面更大。
- **建议**：A；这是“能玩”与“只看一眼”的分水岭。
- **✅ 结论（A）**：存档 XML 加 `<equip>`；落点 = `save-xml-spec §2.22` + 施工批 `MDB8-g`。
  兼容口径：上游忽略该块、复刻档不喂回官方服；我们 round-trip 原样保留（§8.5）。

### ALQ2 · SWF 地图要不要显示装备/坐骑？（**✅ 已拍板 B · 2026-10-20**）

- **是什么**：现在约 170 张图走 Ruffle + `MapRunner.as`，里面的角色只有裸装 7 件；JS 回退图才走我们的 `drawActor`。
- **为什么现在问**：如果不决定，M8 第一批只覆盖 JS 图；玩家在 SWF 图里穿装备会“看不见”。
- **选项**：
  - **A（建议第一版）**：SWF 图保持裸装；先把 JS 图 + 数据链跑通。后果 = SWF 图暂时看不到装备/坐骑。
  - **B**：SWF 图上叠一层 canvas 角色（不碰 `MapRunner`）；后果 = 可能双角色/遮挡穿帮/走位不同步，需要人眼校。
  - **C**：改 `MapRunner.as`/`ActorView.as`；后果 = 破 no-modify 围栏，工作量最大，不建议本阶段。
- **建议**：A → 后续再评估 B。
- **✅ 结论（B）**：SWF 图也显示装备/坐骑 = 在 `#ov` 叠整只 canvas 角色（§8.4）；
  代价（双角色 / 遮挡穿帮；帧动画已在 `MDB8-b2` 落地、f 批已复用）**如实登记、人眼校**，不进第一版修复范围；施工批 = `MDB8-f`（✅ **代码已落 2026-10-20**，as-built = `map-impl §7.3.23`）。

### ALQ3 · 12 种颜色支持到什么程度？（默认采用建议 B）

- **是什么**：原版默认裸装有 12 色；`UI.swf` 只带蓝/红两套，其余 10 色要取装备包。
- **为什么现在问**：不决定的话，`avSel` 只能留蓝/红；切其它颜色会缺件。
- **选项**：
  - **A**：只支持蓝/红（现状）；最省素材。
  - **B（建议）**：12 色全支持，缺包时退蓝/红 + 日志；需要补 10 色默认包。
  - **C**：按 `color` 从服务端/缓存按需取，不预置；与 B 类似但更依赖网络。
- **建议**：B；支持多少算多少，但**不静默画错颜色**。

### ALQ4 · 装备数据从哪读？（默认采用建议 A）

- **是什么**：需要 `ItemConfig` 的 1,864 条装备定义 + `PetRideShopConfig` 的 29 条骑乘映射。
- **为什么现在问**：运行时每次读 1.6MB XML 慢；生成小 JSON 又多一个产物。
- **选项**：
  - **A（建议）**：一次性从 XML 生成本地小表（`game/data/equip-index.json`），运行时只读小表；XML 仍是真值源。
  - **B**：运行时直接解析 XML（不新增产物，但首屏慢、路径依赖 vendor）。
  - **C**：手写常量表（快但会漂移，不可取）。
- **建议**：A；与现有“数据桥”口径一致。

### ALQ5 · 素材怎么落？（默认采用建议 A）

- **是什么**：29 张坐骑 ×2 包 + 10 色默认装 + 常用装备样本，是否放进仓库。
- **为什么现在问**：不决定，复刻换台机器就没素材；全放仓库又有版权/体积问题。
- **选项**：
  - **A（建议）**：仓库只放 `manifest.json`（URL/大小/归属），实际包留在本地缓存；启动时按清单提示缺件。
  - **B**：把选定包放进 `game/data/actor/equip/`（可复现，但仓库变大、版权边界要注意）。
  - **C**：运行时直接从线上取（需要网络/启动器，不适合离线）。
- **建议**：A；只把**已入库的默认裸装包（8 槽 / 15 个 `.bin`）**与少量测试样本留在仓库，坐骑包走清单。

### ALQ6 · 第一批的入口形态？（默认采用建议 A）

- **是什么**：装备/坐骑要“怎么点出来”。
- **为什么现在问**：正式面板归 C1/C2；M8 只做外观，不该顺手做面板。
- **选项**：
  - **A（建议）**：只给 `window.APP.actorLook.*` 调试入口 + 日志；人测用手敲。
  - **B**：做一个最小 DOM 装备面板（像 MB6 对话浮层）；更快看到效果，但会扩围栏。
  - **C**：直接做正式装备面板；跨线，不建议。
- **建议**：A；若要 B，需按 `AGENTS §4.12` 先登记围栏扩展。

### ALQ7 · 帧同步要不要修？（✅ **2026-10-20 人类改判 A→B**）

- **是什么**：原版 `gotoAndPlay` 忽略参数，部件各自走帧；静止时看不出来，换装/动画时可能错帧。
- **为什么现在问**：如果 M8 只做静态站立，可以先不修；要做走位动画就必须修。
- **选项**：
  - **A（建议）**：第一版静态站立，用 BODY 的 `standDown.start` 统一取帧；不假装同步。
  - **B**：实现显式同步（每件设到 BODY 当前帧）；为后续动画铺路。
  - **C**：照搬上游的空操作；不推荐。
- **建议**：A；动画阶段再 B。
- ✅ **改判记录（2026-10-20）**：`MDB8-b` 手测时人类看到静态站立，明确要求播放动画 ⇒ **采用 B**，
  并入插入批 `MDB8-b2`：24fps 循环，朝向 = `run/stand × Up/Down` + 整体镜像 `flip`。
  ⚠️ **同日手测修补**：首版「所有层共用 BODY 帧号」会让坐骑 idle（25–60）被装备件（`120301` 头，25–97）拖住、
  每圈末尾冻结 ≈1.5s ⇒ 改为**同一 tick、每层按自己的标签区间循环**（这才是上游 `MultipleEquipPlayer` 的实况，
  `gotoAndPlay(bodyFrame)` 是空操作）；修 `ALC3` 的「同 tick」保留，但不强并帧号。
  ⚠️ **同日第二轮手测修补**：① 脚下光轮/阴影交替闪 ⇒ 阴影不再跟 BODY 帧，恒取 `UI_ActorShadow` 的 `local` 帧
  （ALC14）；② 射手套装站立时无限射箭 ⇒ 装备层 stand 只取标签首帧、坐骑/裸装仍循环（ALC13）。
  ⚠️ **同日第三轮（新需求）**：人类问「想要光轮怎么办」⇒ 地面特效加手动切换（`MDB8-b3`，见 `ALQ9`）。

### ALQ8 · 第一批覆盖哪些槽？（默认采用建议 A）

- **是什么**：11 槽中哪些先做。
- **为什么现在问**：全做要更多包/更多手测；分批可以更早看到效果。
- **选项**：
  - **A（建议）**：头/眼/身/手/脚（5 个常用槽）+ 坐骑（3 号槽）先做；腰带/翅膀随后。
  - **B**：11 槽全做；需要补齐腰带/翅膀样本。
  - **C**：只做坐骑；最快看到“骑”，但穿装备仍不可见。
- **建议**：A；`MDB8-b` 先覆盖 5 槽 + 已缓存的腰带/翅膀样本，`MDB8-d` 上坐骑。

### ALQ9 · 光轮 / 阴影能不能切换？（**✅ 已由人类点名 · 2026-10-20**）

- **是什么**：角色脚下的地面特效——普通玩家是灰色静止椭圆阴影；VIP 是黄色旋转光轮
  （两者在同一素材包 `UI_ActorShadow`：1 = 本机阴影、2 = 远程、3–39 = 光轮）。
- **为什么现在问**：第二轮修补后本机恒画 `local` 阴影，人类问「想要光轮怎么办」；
  若只按身份自动二选一，现阶段没有用户信息，就永远看不到光轮。
- **选项与后果**：
  - **A（本次落地）**：加调试开关 `APP.actorLook.ground('halo'|'shadow')`，两态**互斥**；
    光轮按自己的 24fps 时钟循环、角色照常播自己的 idle；不写盘，刷新回阴影。
  - **B**：按用户 VIP 身份自动二选一——需要用户信息（本批没有），且无法手动切。
  - **C**：固定光轮——普通玩家也一直有光轮，不符合默认观感。
- **结论 = A**：先给手动切换（`MDB8-b3`），正式入口/会话态并入 `MDB8-c`；身份自动分支留后续。

### ALQ10 · 官服没有美术包的装备，游戏里怎么处置？（**✅ 已由人类拍板 · 2026-10-21**）

- **是什么**：§5.7 那 11 件（五周年冠军坐骑、回忆录、5 件背装、3 件手/武器、渡鸦战靴）在官方配置表里有名字、
  但官服上连图标带部件包全都 404 ⇒ 复刻里穿上它们只能画兜底图（fallback），格子上是个色块。
- **为什么现在问**：人类查五周年冠军坐骑时发现"点了也没东西"，问是不是我们找错路；查清后必须定"看得见但画不出"的东西要不要继续摆着。
- **选项与后果**：
  - **A（人类所选）**：**只玩家面剔除** —— 面板装备/坐骑目录不再列出这 11 件，文档写清缺失（§5.7）；
    调试入口 `APP.actorLook.equip/ride` 仍可穿任意 ID，存档里已有的 ID 也照常画 fallback、**不静默改档**。
  - **B**：调试入口也拒绝 —— 代价 = 将来官方/改服补到货时，得先改代码才能验，也挡掉"看兜底画成什么样"的手测。
  - **C**：读档时把这些 ID 从档里摘掉 —— 代价 = 改动玩家档内容、复刻档与真机档行为分叉，最不建议。
- **✅ 结论 = A**：落点 = `mapScene.js` 的 `listCatalog` 过滤 + `playerinfo-design.md §3.8`；施工批 = `map-impl §7.3.30` / `playerinfo-impl.md PI-j`。

### ALQ11 · 12 种颜色还摆在部件目录里吗？（**✅ 已由人类拍板 · 2026-10-21**）

- **是什么**：默认裸装的 12 色在物品表里是 36 件"手/身/脚"物品（`100004–100033`、`100143–100148`），
  今天和真正的装扮件平铺在同一个目录里，手部/脚部组各掺了 12 件颜色货。
- **为什么现在问**：颜色本质是**换色**、不是"穿某件"（蓝/红走仓库 `.bin`、其余 10 色走 suit 包，见 §2.4）；
  摆在部件表里既误导人，又与既有 `color()` 入口重复。
- **选项与后果**：
  - **A（人类所选）**：**36 件从玩家面部件目录剔除 + 面板单开「颜色」组**（12 个色块、当前高亮、点击走 `APP.actorLook.color(n)`，与会话态 `session.actorColor` 一致、**不落盘**，同「阴影/光轮」那个非物品组的先例）。
  - **B**：只剔除、不单开 —— 面板里就没有换色入口了，只剩地图 HUD 的 `#avSel` 与控制台。
- **✅ 结论 = A**：颜色 = 独立换色功能（§2.4 已改写）；红 suit7 的三个 equip 包**不需要抓**（`.bin` 已承担，官服虽有货也不取）。

### ALQ12 · 表情（槽 8）进不进玩家面目录？（**✅ 人类点名 · 2026-10-21**）

- **是什么**：装备槽 8 = 上游 `EYE`「表情」，21 件（星星点点/爱心满满/泪奔/白眼表情…），**素材全齐**（包 21/21、图标 21/21），
  L1 也早就支持（`PART_OF_SLOT[8]='EYE'`、层序 `DOWN_ORDER` 含 8、`LOOK_EQUIP_SLOTS` 含 8）——**只差面板组里那一行**，
  所以人在面板上找不到"换表情"。
- **✅ 结论**：面板末位件物组补「表情」（排在坐骑之后、阴影之前）；机械件全按 `g.slot` 通用 ⇒ **L3 视图零改动**。
  表情是**装备件** ⇒ 与「颜色/阴影」不同，**要落盘**（走既有 `APP.actorLook.equip` → `persistLook` → `<equip>`）。
- **落点** = `mapScene.js` 的 `PI_GROUPS` + `listCatalog`；施工批 = `map-impl §7.3.31` / `playerinfo-impl.md PI-k`。

### ALQ13 · 「默认头顶」这类空件还摆在部件目录里吗？（**✅ 人类点名 · 2026-10-21**）

- **是什么**：上游把"这一槽没穿东西"也做成了物品 —— `suit = 0` 的三件：默认头顶 `100001`（槽 1）、透明替身 `100002`（槽 4）、默认眼睛 `100003`（槽 8）。
  它们不是装扮，包名走 `resourceIdOf(0, slot)` 落回仓库裸装 ⇒ 摆在列表里等于摆一个"空"。
- **✅ 结论**：判据 = **`suit === 0` 一律不列玩家面**（L1 导出 `ACTOR_LOOK.isEmptySuitItem`，与 `COLOR_ITEM_IDS` 同口径 = 单一真值在 L1）。
  实测面板槽位里恰好只影响两件：头 **347→346**、表情组不露 `100003`；`100002` 在槽 4、本来不列。
  **边界**：只筛目录显示 —— 调试入口 `APP.actorLook.equip(100001)` 照旧能穿、存档里已有的不动。

### ALQ14 · 图标 404 但部件包在的装备，图标能不能自己生成？（**✅ 人类问、答复"能"并采用 · 2026-10-21**）

- **是什么**：人问"蓝队旗帜/红队旗帜、阿卡/迪迪兰/咻休公仔没有图标素材，可以从部件 swf 中生成吗？"
- **答复**：**能**。部件包文件本身就带**一整张内嵌 PNG spritesheet + 裁帧表**（§5.3，L1 `parsePack` 已能零拷贝取出），
  取 `standDown` 首帧的裁帧矩形切下来就是一张静图；落到 `png/item/equip/icon/{id}.png` = `item-art.js` 四级兜底的**第①级** ⇒ **运行时零改动**即亮起。
  实测 48 件图标缺件里**只有这 5 件**同时满足"在玩家面可见 + 包已缓存"（三分见 §5.7②-b）。
- **✅ 结论**：新增离线工具 `tools/pack-icon-stills.mjs`（素材生成、不是验收脚本）；
  如实登记 = **产物是"部件美术"、不是官服图标原画**，且**不入库**（新克隆重跑工具）。

---

## 11. 请人测清单（**发码后**再执行）

> ⚠️ **★M9-a 口径更新（2026-10-20，puppet 默认开、已过手测 `map-impl §8.21`）**：下列各条里的**「黄点」与 `actorVisible` 结算面**曾仅存在于旧链 `#/map?…&puppet=0`；
> puppet 路角色**一律 canvas（含裸装/换色/缺包 fallback）、SWF 自带裸装恒隐**，puppet 路验收 = `map-impl §8.21`（已过）+ `§8.22`（b 回归，✅ 已过 2026-10-20「都过」）。本份其余口径（外观计划/槽序/素材/浮动/速度）两路共用、不变。
> ⚠️ **★M9-c 再更新（人类 2026-10-20 拍板 A·退役）**：`&puppet=0` 旧链已退役（JS 侧 f2 补丁删除、入口移除，as-built `map-impl §7.3.27`）⇒ 上述旧链面**不再可测**，
> 黄点只剩「外观计划未就绪的顶到位」；SWF 图判据统一并入 `map-impl §8.23`（puppet 单通路回归，✅ 已过手测 2026-10-20「整体结账」）。

> ✅ **`MDB8-a` 已落并手测通过（2026-10-20）**：该批手测 = `await APP.actorLook.dump()` 打印 3 组计划（判据 = `docs/map/map-impl.md §8.11`；人类：“目前一切正常”）。
> ✅ **`MDB8-b` 已落并手测通过（2026-10-20）**：**手测 = `map-impl §8.13`** —— 裸装回归 + `APP.actorLook.preview` 穿头/成套/缺包/坐骑；
> ✅ **`MDB8-b2` 已落并手测通过（2026-10-20；人类点名要动画）**：动画手测 = `map-impl §8.14`（站立循环 / 走位 run / 朝向 / 层序 / 同步），见下方第 13–19 条；
> ✅ **`MDB8-b3` 已落并手测通过（2026-10-20；人类点名「想要光轮」）**：地面特效切换手测 = `map-impl §8.14` 第 15–16 条 / 下方第 20 条；
> ✅ **`MDB8-c` 已落并手测通过（2026-10-20）= 会话态 + 正式调试入口**：手测 = `map-impl §8.15`（下方第 2–6、10 条 + 会话/非法参数/切图保持项），**本批仍不写盘**；
> ✅ **`MDB8-d` 已落并手测通过（2026-10-20，人类「it worked good」）= 坐骑速度 + 浮动**：手测 = `map-impl §8.16`；
> ✅ **`MDB8-e` 代码已落（2026-10-20）= 素材清单 + 缺包日志**：手测 = `map-impl §8.17` **✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过）**；**缺件 108 已按 §5.5 通道一定向拉取补齐（`MDB8-e2`，`node tools/fetch-actor-packs.mjs`）⇒ 重开游戏即有新画面**；
> ✅ **`MDB8-f` 代码已落（2026-10-20）= SWF 图叠层（`ALQ2=B`）**：手测 = `map-impl §8.18` / 下方第 11、17、20 条 = 已随 ★M9-c 退役、不可测（等价判据 = `map-impl §8.23` ✅）；**只叠本机玩家、不碰 `game/maprunner/**`**；
> ✅ **`MDB8-g` 代码已落（2026-10-20）= 存档 `<equip>`（`ALQ1=A`）**：手测 = `map-impl §8.19` / 下方第 12 条 **✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过）**；
> ✅ **`MDB8-f2` 代码已落（2026-10-20）= SWF 裸装角色显隐（修「双角色」，唯一授权例外之二 = `MapRunner.as` 的 `actorVisible`）**：手测 = `map-impl §8.20` / 下方第 21 条 = 已随 ★M9-c 退役、不可测（等价判据 = `map-impl §8.23` ✅）；
> 下面 12 条 + 动画/光轮专项 + `c` 的会话项（`map-impl §8.15`）+ `d` 的坐骑项（`§8.16`）+ `e` 的清单项（`§8.17`）+ `f` 的叠层项（`§8.18`）+ `g` 的存档项（`§8.19`）+ `f2` 的显隐项（`§8.20`）是整条 M8 的验收脚本（正式 `equip/ride` 入口自 `c` 起可用），按批执行、**不要一次全测**。
> 主验收 = 人类手动测试（`AGENTS §1.1` / 决议 ⑦）。

1. **裸装回归**：进 JS 图（如 `1010`/`50000`，`map_swf.csv` 里无 swf 映射）⇒ 角色与今天**逐像素一致**（蓝/红、阴影、位置）。
2. **穿头**：`APP.actorLook.equip(100577)`（射手守护头盔，资源 `120301`）⇒ 头顶换头盔，**不遮眼/不悬空**；卸下回默认头。
3. **穿手/脚**：`equip(100578)`（弓）/`equip(100580)`（战靴）⇒
   左右手/脚**成对出现**，层序正确（武器在身前/身后按朝向）。
4. **腰带/翅膀**：`equip(100579)` / `equip(100581)` ⇒ 腰带在身体层、翅膀在朝下时最底/朝上时最顶，符合 §6.2。
5. **换装**：同一槽连续换两件 ⇒ 旧包不残留、不闪黑、内存不涨（连续 20 次）。
6. **卸装**：`unequip(refId)` ⇒ 该槽回默认件；若默认件缺失 ⇒ 不画该槽、日志一行、不崩。
7. **坐骑**：`APP.actorLook.ride(100582)`（星空追猎者，本机唯一已缓存坐骑包）⇒ 角色整体抬起约 50px、**手脚消失**、跑速变快；
   `unride()` ⇒ y 回 0、手脚恢复、速度恢复。（`101020` 迈巴赫本机未缓存 ⇒ 只验 M8-I2 降级；固定坐骑的静态偏移等 `e` 补素材）
8. **浮动坐骑**：骑 `100582`（在 `_floatList`）⇒ **2s 升起**后持续上下浮动 ±5px（3s 一圈）；`unride` **即时**落回地面；
   非浮动坐骑为直接偏移、不浮动（待 `e` 补包后验）。
9. **缺包降级**：挡掉 `136403_0.bin` ⇒ 坐骑槽不画/退默认，角色仍可走可传，日志一行。
10. **编号陷阱**：用物品 `100102`（巨星头盔）测试 ⇒ 必须显示**头盔**（suit 27 / slot 1），
    不能误取同名的 `100102_0`（蓝色手部）。
11. **SWF 叠层（`ALQ2=B` · `MDB8-f` 已落）**：进 `swfOk===true` 的图（如 `10017`/`100`/`151`）⇒ 穿装备/骑 `100582`（本机唯一已缓存坐骑包；`101020` 未缓存 ⇒ 只验降级）：
    **角色位置跟得上走位、装备/坐骑可见**；`f2` 起**双角色应消失**（第 21 条 / `§8.20`）、`f2` 同日修补 ① 起**走动应平滑不抖**（第 21b 条 / `§8.20` 第 7 条）；仍人眼校 = 是否**压过前景遮挡**。
    **不穿装备/不骑时** ⇒ 仍是今天的黄点 + 原 SWF 角色（**SWF 基线不变**）；**自定义包缺**（如骑 `101020`）⇒ 不叠层、保留黄点 + 日志一行。
    细节与已知缺陷见 `map-impl §7.3.23` / 手测项 `§8.18`。
12. **存档（`ALQ1=A` · `MDB8-g` 已落）**：穿装备/骑坐骑 → **关浏览器重进同一槽** ⇒ 外观保持；存档 XML 有 `<equip>` 块
    （空外观 ⇒ 整段省略）；导出→导入 round-trip **不丢块**；旧档（无 `<equip>`）能正常进游戏（视为无装备/未骑乘）。
    ⚠️ 复刻档**不要喂回官方服**（上游不认该扩展块）。细则/坏块拒写 = `map-impl §8.19`。

**动画专项（`MDB8-b2`，2026-10-20 插入）**

13. **站立循环**：进 JS 图静止不动 ⇒ 角色按 24fps 循环。⚠️ **裸装 idle 的可见动效 = 眼睛每圈眨一次**（`UI_DEFAULT_EYE` key 43/45/47/49，41 帧 ≈ 1.7s；身体/头/手/脚在该区间是静态图）—— 素材原样，不是定格/丢帧。**装备层站立为静姿**（ALC13），坐骑仍连续播 idle。
14. **走位 run + 朝向**：点地向上走 ⇒ `runUp`、深度序换 `UP_ORDER`；向下 ⇒ `runDown`；向左 ⇒ **整个角色（含坐骑/装备/影子）水平镜像**；
    停止 ⇒ 保留最后朝向的 `standUp/standDown`（不强制回朝下）。
15. **同步**：穿全套装备再走 ⇒ 头/身/手/脚/腰带/翅膀的 **`run` 段**都按 24fps 动；站立时装备层停在静姿（ALC13），裸装体/眼与坐骑仍按自己区间循环；不要求不同标签区间的层显示同一帧号（上游各层各自循环，`gotoAndPlay(bodyFrame)` 是空操作 ALC3），但**同一 tick、无 ±1 错帧**。
16. **坐骑动画**：骑 `100582` ⇒ 站立时坐骑 idle（25–60，36 帧）**一圈接一圈连续播、圈间不冻结**（2026-10-20 修补点）；走动 ⇒ 坐骑 `run` 与角色同 tick 播放；浮动 ±5 / 速度 25/20 = `MDB8-d`（`§8.16` 验）。
17. **回归**：SWF 图**无自定义外观时**仍黄点 + 原 SWF 动画（**基线不变**）；`MDB8-f` 起**有自定义外观时**改叠 canvas 角色（第 11 条），`f2` 起叠层时隐藏底层裸装角色（第 21 条）；JS 路点 NPC/光口/野怪行为不变。
18. **阴影不闪光轮（2026-10-20 第二轮修补复测）**：站立/骑坐骑观察脚下 ⇒ **始终是静止的普通阴影**，
    不出现黄色旋转光轮、也不在「光轮 ↔ 阴影」之间交替；走位时阴影跟着角色（仍 `local` 帧）。
19. **套装站立不射箭（2026-10-20 第二轮修补复测）**：`preview({equipVec:[100577,100578,100580,100579,100581]})` 站立 ⇒
    弓保持**举弓待机姿势**（`120302_1` 首帧），**不自动拉弦/射箭**；点地走位时 `run` 段正常播放，到位回静姿。
20. **光轮 / 阴影切换（`MDB8-b3`）**：穿套装或骑坐骑 ⇒ `APP.actorLook.ground('halo')` ⇒ 脚下黄色光轮
    **连续旋转、不夹阴影**，角色 idle 照常播（光轮与角色各自循环）；`ground('shadow')` ⇒ 回静止灰影；
    `clear()` ⇒ 回裸装 + 阴影。`MDB8-f` 起 SWF 图也会叠层（第 11 条）。
21. **SWF 双角色修复（`MDB8-f2` 已落）**：进 SWF 图（如 `10017`/`100`/`151`）穿装备/骑 `100582` ⇒
    **画面上只有一只角色**（`#ov` 的 canvas 角色），不再从背后/边缘露出底层裸装 SWF 角色；
    `unequip`/`unride`/`clear()` ⇒ 恢复黄点 + 原 SWF 角色（**基线不变**）；换图/传送/昼夜镜像后仍一只；
    走位/光口/NPC/野怪/相机行为不变。细则 = `map-impl §8.20` / as-built `§7.3.25`。
21b. **SWF 叠层移动平滑（f2 同日修补 ① 已落）**：同上场景**连续走动** ⇒ 角色**平滑移动、不再一抖一抖**（修补前 = 每 ~100ms 跳一步）；
    到站干净停住（不回弹/不余滑）、传送/换图瞬时落位；JS 路与黄点基线不受影响。细则 = `map-impl §8.20` 第 7 条。
> ⚠️ **穿套装看不到阴影的说明**：射手弓 `120302_1` 的待机帧自带一大片青色弧光，画在角色层、会盖住脚下的小阴影；
> 骑乘时 `offsetY=-50` 把角色抬起才露出来。这不是阴影丢失；切到光轮后光轮较大，通常能从弧光边缘看到。

---

## 12. 证据与参考索引

### 12.1 本份引用的源码

- `vendor/seer2-origin-as3/src/com/taomee/seer2/app/actor/constant/EquipSlot.as`
- `.../app/actor/constant/EquipSlotDepth.as`
- `.../app/actor/equip/ActorEquipHelper.as`
- `.../app/actor/equip/MultipleEquipPlayer.as`
- `.../app/actor/equip/EquipPlayer.as`
- `.../app/actor/util/ActorEquipAssembler.as`
- `.../app/inventory/item/EquipItem.as`
- `.../core/utils/URLUtil.as`
- `.../core/animation/FramePlayer.as`
- `.../core/animation/frame/FrameSequence.as`
- `.../core/animation/frame/FrameSheet.as`
- `.../app/actor/Actor.as`
- `.../app/net/helper/UserInfoParseHelper.as`
- `.../app/pet/data/PetInfo.as`
- `.../app/config/ItemConfig.as`
- `.../app/config/PetRideShopConfig.as`
- `.../app/lobby/messageHandler/MessageHandlerEquipChange.as`
- `.../app/lobby/messageHandler/MessageHandlerSetPetFollow.as`
- `.../app/actor/data/UserInfo.as`
- `.../app/actor/events/UserInfoEvent.as`

### 12.2 本份引用的数据 / 素材

- `vendor/seer2-origin-as3/src/_assets/2_com.taomee.seer2.app.config.ItemConfig__itemXmlClass.xml`（9,630 `<Item>` / 1,864 装备）
- `vendor/seer2-origin-as3/src/_assets/56_com.taomee.seer2.app.config.ItemConfig__suitXmlClass.xml`（302 `<Suit>`；suit 204 缺）
- `vendor/seer2-origin-as3/src/_assets/65_com.taomee.seer2.app.config.PetRideShopConfig__setting.xml`（48 `<pet>` / 29 distinct equipId）
- `~/.cache/seer2-live/game-cache/http_seer2.61.com/res/item/equip/swf/`（18 包）
- `.../preview/`（37 个 CWS）、`.../icon/`（23 个 CWS；快照 2026-10-20，缓存按需增长）
- `game/data/actor/*.bin`（15 个裸装/阴影/问号包）
- `tools/extract-actor-packs.mjs`（默认裸装抽取器；头注已过时，见 ALC11）

### 12.3 本份引用的我方案头

- `game/logic/map/actor-view.js`（A2b L1）
- `game/app/scenes/mapScene.js`（A2b L4）
- `game/maprunner/ActorView.as`（SWF 路裸装合成员；no-modify）
- `game/maprunner/MapRunner.as`（SWF 路宿主；no-modify）
- `docs/map/map-impl.md §7.3.8`（A2b as-built）
- `docs/view/scene/room/view-scene-map-content.md §2.2`（B3 角色设计）
- `tools/seer2-live/README.md §5`（素材缓存口径）

---

> **最后一句**：本份是**资料与设计**，不是实现；`MDB8-*` 按 `docs/map/map-impl.md §3.10` 的批序逐批落码，**每批停下等人手测**。
> **`ALQ1=A`/`ALQ2=B` 已拍板（2026-10-20）**，`ALQ3–ALQ8` 按建议默认，`ALQ9` = 光轮/阴影可手动切换，**`ALQ10=A`/`ALQ11=A` + `ALQ12`/`ALQ13`/`ALQ14`（人类 2026-10-21 三条指令 + 四条反馈）**；
> 现阶段 = **`MDB8-b`/`b2`/`b3` 已落且手测通过（2026-10-20，as-built `map-impl §7.3.17` / `§7.3.18` / `§7.3.19`）**；**`MDB8-c` 已落且手测通过（as-built `§7.3.20`）**；**`MDB8-d` 已落且手测通过（as-built `§7.3.21`，人类「it worked good」）**；**`MDB8-e` 代码已落（as-built `§7.3.22`）· §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」= 一揽子通过）（游戏内素材采集已随 `MDB8-e2` 补齐）**；**`MDB8-f` 代码已落（as-built `§7.3.23`）· §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**；**`MDB8-g` 代码已落（as-built `§7.3.24`）· §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」）**；**`MDB8-f2` 代码已落（as-built `§7.3.25`，修「双角色」= `MapRunner.as` 的 `actorVisible` + 重编译；**同日手测修补 ①** = 叠层位置平滑跟随，修「移动一抖一抖」）· §8.20 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**（M8 `a`–`g`+`f2` 代码已全落、手测全清）。
