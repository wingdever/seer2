# 地图线 · M2 —— NPC 事件模型（map-npc.md）

> **定位**：本份写地图线**基石对象** `NpcButtonHandler`（**条件 → 动作**）与它的**调度器** `NpcHandler`：
> 两张词表、两个枚举、**五种 UI 事件与另外十种"标签"**的真实分布、**射击模式门**、
> **`auto` 按钮的执行时机**、**18 种动作各自的 `param` 形状**（本份最长的一节），以及动作**怎么"只出决议不执行"**（MQ4）。
>
> **父文档** = `docs/map/map-design.md`（边界 / **MP1–MP8** / **MC1–MC8** / **MQ1–MQ8 决议表**）—— 本份**只细化不重复**；
> 冲突以本份为准（更细 ⇒ `docs/arch-docs.md §3`）。
> **同线兄弟**：**M1** `docs/map/map-data.md`（数据形状与桥）· **M3** `docs/map/map-condition.md`（`<condition>` 怎么求值）·
> **M4** `docs/map/map-dialog.md`（`openDialog` 之后）· **M6** `docs/map/map-battle-trigger.md`（`battle` 之后与 `winHandler`）·
> **M5** `docs/map/map-teleport.md`（`teleport` 之后）· **M7** `docs/map/map-move.md`。
>
> **真值源**：`Assets/Scripts/Scene Specific/Map/Entities/Npc/NpcButtonHandler.cs`（115）· `NpcHandler.cs`（114）·
> `NpcActionHandler.cs`（**481**）· `MVC/View/Map/MapSceneView.cs`（消费侧 :275-292 / :495-525）·
> `MVC/Controller/Utility/Dialog/NpcController.cs`（`Shoot()` :143-152）· `MVC/View/Utility/Dialog/NpcView.cs`（挂事件 :330-331）·
> `Resources/Data/Maps/*.xml`（272 张）【样本】。
>
> **证据标注**（`docs/arch-docs.md §4`）：【样本】>【源码】>【推断】。
> **编号纪律**：本份本地清单 = **MNI1–MNI**（不变量/契约）/ **MNC1–MNC**（上游代码 bug 与危险设计，按 `AGENTS.md §2` **声明 + 不照搬**）/
> **MNQ1–MNQ**（待拍板，附建议）—— **全是本线局部编号**，**不是**「人类决议 ①–⑧」（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design），**待人类评审**。

---

## 0. 这份文档回答什么

1. **基石对象的完整形状**（§2.1）—— `NpcButtonHandler` 的 7 个成员 + **拷贝构造与 `Callback` 工厂**（父文档 §2.5 没写的两半）。
2. **词表 ≠ 事件**（§2.2 = 本份第一号修正）—— `buttonEventTypeDict` 有 **5 条**，而 `GetButtonEvent` 的 switch **只映射 4 种**；`auto` **不是 UI 事件**。
3. **同一个 `type` 属性在两个容器里是两套取值**（§2.3）—— 实测 `eventHandler` **5 种**、`callbackHandler` **10 种**（把父文档 **MC2** 的双重的语义**用数字钉死**）。
   ⚠️ **M4 报了第三个切片**：对话的 `functionHandler`/`replyHandler` 里 **`type` 只剩"是否 `branch`"有意义**（`DialogView` 不查事件名表）⇒ 见 `docs/map/map-dialog.md §2.3`。
4. **调度器的四步**（§2.4）—— 装配 → 取事件 → 条件 → 动作，以及**射击模式门为什么在条件之前**（MC3）。
5. **`auto` 按钮的执行时机**（§2.5 = 本份第二号发现）—— **进图即执行一遍**，且**先写 `mapNpcList` 键袋再执行**。
6. **18 种动作的 `param` 形状逐条**（§2.6，本份最长）—— 每条给：`param` 合同 + 上游行号 + 越界点 + 我们的目标形状（`ActionIntent`）。
7. **消费方清单**（§2.7）—— `GetNpcEntity` 的 **6 个调用点**，它们决定"一个对象走遍全图"这句话的**全部落点**。
8. **目标契约**（§3）—— `core/map/button.ts` + `core/map/action.ts` 的**决议式**形状与执行器的接缝表。

---

## 1. 范围与边界

| 圈里（本份） | 圈外 → 归谁 |
|---|---|
| `NpcButtonHandler` 类型、两张词表、两个枚举 | `<condition>` 串的**求值**（算子/命名空间/`MapEnv`）⇒ **M3** |
| `NpcHandler` 的四步调度 + 模式门 + `auto` 时机 | `<dialog>` 内部（分支/对白/`<func>`）⇒ **M4** |
| **18 种动作的 `param` 合同**（形状，不是执行） | 战斗分支的**阵容与胜负** ⇒ **M6**；传送的**走位与切图** ⇒ **M5** |
| `callbackHandler` 的**标签匹配**机制 | 提示盒/面板**长什么样、怎么渲染** ⇒ **C2 / A3**（`docs/view/mech/view-overlays.md`、`docs/view/panel/*`） |
| `ActionIntent` 的**决议形状**（MQ4） | 执行副作用（写盘/弹窗/发宠）⇒ **L1/L4 + R4/R5**（决议 ③） |
| 上游代码 bug 的登记（MNC） | 道具/宠的**域语义** ⇒ `docs/item/item-design.md`、`docs/domain/domain-pet.md` |

---

## 2. 上游真值

### 2.1 `NpcButtonHandler`（`NpcButtonHandler.cs:8-40`）【源码】

| 成员 | XML | 行 | 备注 |
|---|---|---|---|
| `description: string` | **元素**（无属性名） | :10 | 按钮文案（**中文** ⇒ MP4 归 DOM） |
| `typeId: string` | `@type` | :12 | ⚠️ **原串才是真值**，派生 `type` 会把它降级 |
| `type`（派生） | —— | :13 | `typeId?.ToButtonEventType() ?? None` ⇒ **未登记的一律 `None`** |
| `actionType: string` | `<action>` | :15 | 同上，`ToNpcAction()` |
| `action`（派生） | —— | :16 | 未登记 ⇒ `NpcAction.None` |
| `condition: List<string>` | `<condition>` | :18 | **多元素 = AND**；串内 `\|` = OR（`NpcHandler.cs:47-69`）⇒ 求值归 **M3** |
| `param: List<string>` | `<param>` | :19 | **动作的参数**（§2.6） |
| `callback: List<Action>` | `[XmlIgnore]` | :21 | **不进 XML**，运行时挂上（`null` 是默认，不是空表） |

**父文档没写的两半**【源码】：
- **静态工厂** `NpcButtonHandler.Callback(Action)`（:23-27）⇒ 代码里可以**手搓一个按钮**（只带回调、无 `type`/`action`/`condition`）—— 这是 `_ => handler.callback?.ForEach(...)`（`NpcHandler.cs:95`）**存在的理由**：**非数据按钮也走同一条链**。
- **拷贝构造** `NpcButtonHandler(NpcButtonHandler rhs)`（:31-40）⇒ `condition`/`param` **深拷**（`.ToList()`），但 **`callback` 是引用共享**（:39）⇒ 拷出来的按钮**改一个动另一个**（**MNC1**）。

### 2.2 ★词表 ≠ 事件：`auto` **不是** UI 事件（本份第一号修正）【源码】

`buttonEventTypeDict`（:43-50）**5 条**：`auto`→`Auto`、`click`→`OnPointerClick`、`enter`→`OnPointerEnter`、`exit`→`OnPointerExit`、`hover`→`OnPointerOver`。

但 `GetButtonEvent(IButton, handler)`（`NpcHandler.cs:35-44`）的 switch **只有四个 case**：
`OnPointerClick` / `OnPointerEnter` / `OnPointerExit` / `OnPointerOver` ⇒ **`Auto` 落进 `_ => null`**。

> ⚠️ **对父文档的修正**：`docs/map/map-design.md §2.4` 的表行写"**只有 5 种**映射到 UI 事件"—— 实测口径应是
> **词表 5 条、UI 事件 4 种、`auto` 归"进图批处理"（§2.5）**。已同步修订父文档（见 §9）。

另有 **5 个枚举值根本没有词表入口**：`ButtonEventType.None`（未登记）与 `NpcAction` 的 `None`；
**`hover` 在发行数据里 0 次出现**（§2.3 实测两个容器的 `type` 取值表里都没有 `hover`）⇒ **登记为死条目**（**MNQ1**）。

### 2.3 ★同一个 `type` 属性、两个容器、两套取值（把 MC2 用数字钉死）【样本】

> 口径：`awk` 按 `<eventHandler>…</eventHandler>` / `<callbackHandler>…</callbackHandler>` 分段后取 `<button type=>`。

| **`eventHandler` 里的 `type`**（出现次数） | **`callbackHandler` 里的 `type`**（出现次数） |
|---|---|
| `click` **682** | `evolve` **128** |
| `auto` **66** | `choose` **35** |
| `shoot` **25** ⚠️（**不在词表** ⇒ `None`） | `miracle` **24** |
| `exit` **4** | `teleport` **11** |
| `enter` **4** | `miracle_choose` **8** |
| `hover` **0** | `win` **4** · `gacha_10` **4** · `gacha` **4** |
| | `get_pet` **3** · `battle` **2** |
| **合计 785** | **合计 223** |

⇒ **三条硬结论**：
1. **`eventHandler` 只用了 5 种取值**，其中 **`shoot` 不在词表**（⇒ `type == None`）却**仍然生效** —— 它由 `NpcController.Shoot()`（:143-152）按 **`typeId == "shoot"`** 原串认领（`Where(x => x.typeId == "shoot")`）。
2. **`callbackHandler` 的 10 种全是"标签"**，靠 `param` 里的 `callback=<标签>` 或 `[expr]` 求值结果**做字符串相等匹配**（`NpcActionHandler.cs:134` / `:467-475`）。
3. ⚠️ **`type` 的语义由"它在哪个容器里"决定**，不由它自己的值决定 ⇒ **MNI2**。

### 2.4 `NpcHandler` —— 调度器四步（`NpcHandler.cs`）【源码】

| 步 | 函数 | 行 | 语义与坑 |
|---|---|---|---|
| ① 装配 | `CreateNpc` / `CreateFarm` / `CreateAnimal` | 11/19/27 | 三件事：`SetActive(info.active)` → `SetNpcInfo(info)` → `SetXxxAction(...)` → **`npcList.Add(info.id, npc)`**（⚠️ **`Dictionary.Add` 撞重复键即抛**：**MNC2**） |
| ② 取事件 | `GetButtonEvent` | 35 | 四种 UI 事件（§2.2） |
| ③ 条件 | `GetNpcCondition` | 47 | **无 `<condition>` ⇒ 恒 `() => true`**；逐元素 **AND**、`\|` 内 **OR**；⚠️ 调 `Operator.SplitCondition(..., **toHalf: false**)`（:60）⇒ **全角 `＜＞＝` 在 NPC 这条链上不转换**（**MNC3**，父文档 MC1 的补刀） |
| ④ 动作 | `GetNpcAction` | 71 | 18 个 case + **`_ => handler.callback?.ForEach(x => x?.Invoke())`**（:95，MC8 的原文） |
| 合 | `GetNpcEntity` | 98 | `if (Player.instance.isShootMode ^ (handler.typeId == "shoot")) return;` **在条件之前**（:104）→ 条件 → 动作 |

**模式门的两半**【源码】：`GetNpcEntity` 的 XOR 让**射击模式下只有 `type=="shoot"` 的按钮能过**、**非射击模式下所有 `shoot` 按钮都不能过**；
而 `NpcController.Shoot()` 只把 `shoot` 按钮交给 `PlayerController.Shoot(...)`。⇒ **同一个 `shoot` 按钮有两条入口，两条都要门**（**MNI4**）。

### 2.5 ★★`auto` 按钮的时机：进图即执行（`MapSceneView.cs:275-292`）【源码】—— 本份第二号发现

```csharp
public void SetNpc(List<NpcInfo> infos) {                        // :275
    foreach (var npcInfo in infos) { ... NpcHandler.CreateNpc(...); TryStartWildNpcBehaviour(...); }
    Player.SetSceneData("mapNpcList", npcDict);                   // :285  ★先写键袋
    foreach (var npcInfo in infos) {                              // :287  ★再跑 auto
        var autoActionList = npcInfo.eventHandler.Where(x => x.type == ButtonEventType.Auto)
            .Select(x => NpcHandler.GetNpcEntity(npcDict.Get(npcInfo.id), x, npcDict)).ToList();
        autoActionList.ForEach(x => x?.Invoke());                 // :291
    }
}
```

- **`auto` = "进入这张图时对每个 NPC 求值一次并执行"** ⇒ 它**不是** UI 事件（§2.2 的另一面）。
- ⚠️ **执行顺序有讲究**：`SetSceneData("mapNpcList", …)` **在前**、`auto` **在后** ⇒
  而 `NpcController.Shoot()` 与 `data.` 系条件都**从这个键袋取 NPC 总表**（:151）⇒ **"先登记、后触发"是隐式依赖**（**MNI5**）。
- ⚠️ **`auto` 每次进图都会跑**（含**同一次会话内重复进出**）⇒ 带 `random[new]` 的 `auto` 按钮**每次进出都重摇**（实测样本：`100.xml` 的 `10002` 野怪 `setNpcParam 10002 active=true` + `condition=random[new]LTE5`）⇒ **MC5 的最典型受害者**（求值写回存档 + 每次进图改变世界状态）。
- ⚠️ `TryStartWildNpcBehaviour` 在 `CreateNpc` **之后、`auto` 之前**（:283）⇒ 漫游 NPC 的**存在**先于**条件**（M7 注）。

### 2.6 十八种动作的 `param` 合同（`NpcActionHandler.cs` 481 行 · 逐条）【源码】

> **列说明**：**形状** = 我们对 `param` 的解析合同；**上游越界点** = 数据不合格时**实际会抛**的位置（**MNC** 家族的逐条落点）；
> **频次** = 发行数据里 `<action>` 出现数（父文档 §2.1 实测）；**目标** = `ActionIntent.action` + 我们的执行接缝。

| # | 动作（`NpcAction`） | 行 | 频次 | **`param` 形状** | 上游越界点 / 坑 | 归属 |
|---|---|---|---:|---|---|---|
| 1 | `setNpcParam` | 9-74 | 91 | `param[0]` = **目标 NPC id** 或 **`"animal"`**；`param[1..]` = `key=value`，**key ∈ 13 个**：`active` `target` `name` `namePos` `nameSize` `nameColor` `nameFont` `sprite` `anim` `gif` `color` `bgm` `pos` | ⚠️ `int.Parse(param[0])` 非数即抛（:20）；⚠️ `option[1]` 无 `=` 时越界（全表通用）；⚠️ `bool.Parse` 只认 `true/false`；⚠️ **`sprite` 用 `.TrimEnd(".png")`**（:53）⇒ **C# 的 `TrimEnd(charset)` 不是去后缀**（**MNC4**）；⚠️ `nameSize` 走 `Identifier.GetNumIdentifier`、`sprite` 段支持 `[expr]` ⇒ **运行时求值**；⚠️ **`param[0]=="animal"` ⇒ 开动物面板 = A 组出局** | **item/D6 无关**；本线的**实体运行时参数写侧** |
| 2 | `openHintbox` | 103-144 | **941** | `param[0]` **必须** `type=<X>`（`Item` / `PetSelect` / 其他 ⇒ 普通盒）；`param[1..]` = `key=value`（⚠️ **这里用 `Split('=', 2)`**，其余动作全用无限制 `Split('=')` —— **MNC5**）；**`callback=<标签>`** 特例 ⇒ 去 `callbackHandler` 找 `typeId==标签`（支持 `[expr]` 先求值成整数串） | ⚠️ `type[1]`：`param[0]` 不含 `=` 即越界（:110）；`PetSelect` 会 `SetStorage(Player.instance.petBag.ToList())`（:118）⇒ **吃当前队** | **A3/C2**（`docs/view/mech/view-overlays.md`） |
| 3 | `openPanel` | 146-161 | 140 | `param[0]` = **面板名**（实测 Top：`ItemShop` **65** · `TwelveRound` 13 · **`Door` 12** · `MiniMap100` 6 · **`Mod[data=MainPetWakeup/main]` 6** ⇒ `param[0]` 自己就带 `[...]` 形态）；`param[1..]` = `key=value` → `SetPanelIdentifier`（实测：`mode=buy` 35 / `type=honor` 14 / **`currency=3/0` 14** / `mode=sell` 8 / `mode=easy` 6 / `type=mine` 5） | ⚠️ `Panel.OpenPanel(string)` 是**字符串查表**（`MVC/View/Basic/Panel.cs:123`）⇒ 拼错**静默** | **C2**（`docs/view/panel/*`）；⚠️ **`Door` 12 处 = C 组排期 ④「门」的真实入口** |
| 4 | `openDialog` | 163-186 | **1243** | `param[0]` = **`<dialog>` 分支 id**（★作用域 = **当前 NPC** 的 `dialogHandler`，:173），⚠️ **或字面量 `"null"` ⇒ 关对话**（:168-172，实测 **533** 条 ⇒ "关"比"翻页"多 3 倍）；`param` 为空 ⇒ **直接 return**（:165-166，实测 **2** 项 ⇒ 点了没反应） | ⚠️ **剧情走"内容前缀"约定**：`dialogInfo.content.StartsWith("story=")` ⇒ **就地改写 `rawContent`** 后走 `OpenStoryDialog`（:176-180）⇒ ⚠️ **非幂等**（第二次打开不再走剧情层 = **M4/DLC1**）；实测 **59 条 content / 5 张图**（`540` `50016` `50019` `50023` `50024`；第 6 个含 `story=` 的文件 `10083.xml` 落点在 `<condition>` ⇒ 归 M3） | **M4** `docs/map/map-dialog.md §2.5`；剧情半边 = A 组（M4 **DLQ1** 已记：那 5 张图全不在第一批 134 内） |
| 5 | `teleport` | 188-200 | **106**（grep 107，差 1 在注释）| `param[0]` = **目标图 id**（`int.Parse`）；`param[1]`（可选）= `"x,y"` 落点 ⇒ ★**实测 106 条全部只有 1 个 `param`**（`param[1]` 分支 **0 命中**，M5 §2.4）⇒ **传送永不带落点**，落点恒 = 目标图 `initialPoint`。⚠️ **它的宿主不止按钮**：`eventHandler>button` **65** · `callbackHandler>button` **11** · `dialog>branch>replyHandler>reply` **25** · `dialog>branch>functionHandler>func` **5**（= M4 的"对话里 30 条传送出路"）⇒ **同一份 param 合同要能被四个宿主复用**（基石对象走遍全图的又一例）。★**这 106 条同时是"入口图"的第二张边表**：272 张里 **95** 张零光口入边、**54** 张在光口图上两头皆空，其中 **26** 张（`10012`…`10043` 整批 + `50001`/`50006`/`50008`/`-30`/`-50`）**唯一的出边就在这张表里** ⇒ **本条不落码 ⇒ 那批图在我们这侧全是"死图"**（M5 **TPI9** / §2.10） | ⚠️ 非数即抛（**TPC2**：`int.Parse` 无 `TryParse`）；`Teleport(mapId)` 与 `Teleport(mapId,pos)` **两条重载** | **M5** `docs/map/map-teleport.md §2.2/§3.3` |
| 6 | `setItem` | 202-223 | 418 | `param[0]` ∈ `{add, add_with_hint, remove, add_to_yite, remove_from_yite}`；`param[1..]` = `"id,num"`（`ToIntList`） | ⚠️ 未知 op ⇒ `itemFunc = null` ⇒ **整批静默不执行**（`?.Invoke`）；`add_with_hint` = 加 + 弹盒两件事 | **道具线** `docs/item/item-design.md`；`_yite` = 肉鸽袋（A 组） |
| 7 | `getPet` | 225-251 | 132 | `param[i]` 两态：**`"id[,level[,emblem]]"`**（⇒ `new Pet(id, level??1, emblem??true)` 并 `gameData.petStorage.Add`）或 **`key=value`**（⇒ 给**上一个**造出来的 `pet` 调 `SetPetIdentifier`） | ⚠️ **首条若是 `key=value`，`pet` 还是 `null` ⇒ NRE**（:247）；⚠️ **函数尾部无条件 `SaveSystem.SaveData()`**（:250）；⚠️ `new Pet(...)` **内部掷随机**（D6 ⇒ 决议 ① 的 RNG 注入） | **D6** + **R4 写盘** |
| 8 | `removePet` | 253-272 | —— | `param[0]` 可选 = **`index=N`**（`Parser.ParseOperation`） | ⚠️ **缺省 ⇒ `index = 0`**（:255）⇒ **不带参数就是删队首**；⚠️ 边界用 `IsInRange(0, petBag.Length)` **含右端**（:262）⇒ 能选到越界位；删完 `Add(null)` **保长度** | **D6** |
| 9 | `setPet` | 274-298 | 64 | `param[i]` = `index=N` / `key=value` | ⚠️⚠️ **边界检查用 `Player.instance.petBag`（:289）而写入用 `Player.instance.gameData.petBag[index]`（:295）** ⇒ **两个数组不同一**（**MNC6**，与 `docs/view/panel/petbag/restart-petbag-panel.md` 的"背包到底指哪个数组"同族） | **D6** |
| 10 | `evolvePet` | 300-318 | 84 | `param[0]` = `index=N`（可选，占 `paramOffset`）；**余下第一条 = `evolveId`**（`Identifier.GetNumIdentifier`） | ⚠️ `index` 缺省时 `param[0]` 既当 index 检查又当 evolveId（:307-315）；同样**两个数组**（写 `gameData.petBag[index]`） | **D6** |
| 11 | `setMission` | 320-339 | 30 | `param[0]` = 任务 id；`param[1]` ∈ `{start, complete, checkpoint}`；`checkpoint` 时 `param[2]` = 检查点名 | ⚠️ `param[2]` 无长度检查 | **A 组出局**（记账） |
| 12 | `setActivity` | 341-353 | **606** | `param[0]` = 活动 id；`param[1..]` = `key=value` → `activity.SetData` | ⚠️ `option[1]` 无 `=` 越界；尾部 `SaveSystem.SaveData()`；⚠️ **条件里也读 `activity[<id>].<key>`**（M3）⇒ 动作与条件**共用同一张活动表** | ⚠️ **本体属 A 组出局，但有一条例外（人类 2026-10-18 拍板 ①）= 只写袋**（写存档既有的 `<activityStorage>` + 日志，**不做活动玩法**）⇒ 见 **MNQ2**；它解掉 **122 条以上** `winHandler` 依赖它的那件事 |
| 13 | `battle` | 355-377 | **559** | `param[0]` = **`<battle>` 分支 id**；`param[1]`（可选）= **"找不到分支时弹的提示文案"** | ⚠️ `npcInfo.battleHandler.Find(...)`（:362）**没有空值保护** ⇒ 无 `<battle>` 的 NPC 上挂 `battle` 动作即 NRE（**MNC7**）；⚠️ **副作用**：先 `Player.instance.currentNpcId = npcInfo.id`（:361）⇒ **胜负链靠它找回 NPC** | **M6** + **E6** |
| 14 | `player` | 77-101 | 4 | `param[i]` = **`data.<key>=<表达式>`**（⇒ `Player.SetSceneData(key, Parser.ParseOperation(v))`）或 `sprite=<名>` | ⇒ 这是 **MC6「键袋」的写侧**（读侧在 M3） | **编排线**（会话） |
| 15 | `mail` | 379-412 | **0** | `from` `title` `content` `item=id/num/id/num` | ⚠️ `DateTime.Now`（决议 ① 的时钟面 R2）；**死枚举**（实测 0 次调用） | **A 组出局** |
| 16 | `fish` | 414-447 | 4 | **无参数**！ | ⚠️ **玩法硬编码在代码里**：按 `currentMap.categoryId ∈ {4, 9, 其他}` 三档 + **成就门槛 `7004/7005/7008`**（不满足 `goto default`）+ 硬编概率表 `{25,40,15,10,7,3}` / `{15,25,20,15,12,8,5}` + 产物 `1005..1010` / `1011..1016` / 追加 `22032` ⇒ **不是数据驱动**（**MNC8**） | **A 组出局**（T2·21 族） |
| 17 | `miniGame` | 449-456 | 2 | `param[0]` = 活动 id ⇒ `Player.currentMiniGame = new Activity(id)` + `ChangeScene(SceneId.Game)` | ⚠️ **切的是"小游戏场景"**（我们无此场景 ⇒ `§1.1` A 组） | **A 组出局** |
| 18 | `callback` | 458-480 | 2 | `param[]` = **一组标签**（每条可写 `[expr]` ⇒ 先求值成整数串） | ⇒ 在 `callbackHandler` 里 `FindAll(x => callbackIds.Contains(x.typeId))` 后**递归 `GetNpcEntity`** ⇒ **按钮链跳转**（可**自我指回**，无深度上限 ⇒ **MNC9**） | **本线**（链式） |

**没进 switch 的 `<action>` 取值**：实测数据里有 **`none` 2 次** ⇒ 不在 `npcActionDict` ⇒ `NpcAction.None` ⇒ 落 `_ => callback` 分支 ⇒ **等价于"什么都不做，但可能执行回调"**（MC8 的实证）。

### 2.7 ★`GetNpcEntity` 的六个消费点（"一个对象走遍全图"的**全部落点**）【源码】

| 消费点 | 行 | 喂的是什么 | 归线 |
|---|---|---|---|
| `NpcView`（挂 UI 事件） | `NpcView.cs:330-331` | `eventHandler`（4 种指针事件） | B3 + 本线 |
| `MapSceneView.SetNpc` | `MapSceneView.cs:289-291` | `eventHandler` 里 `type=="auto"` 的全部 | **本线**（§2.5） |
| **战斗胜利链** | `MapSceneView.cs:508` | `battleInfo.winHandler` | **M6** + E6 |
| **战斗失败链** | `MapSceneView.cs:521` | `battleInfo.loseHandler` | **M6** + E6 |
| `DialogView` ×4 | `DialogView.cs:869/885/920/942` | `<func type="click">` 与 `<func type="branch">` | **M4** |
| `NpcController.Shoot` | `NpcController.cs:151` | `eventHandler` 里 `typeId=="shoot"` | **本线** + A 组小游戏 |
| `YiTeRogueChoice` | `YiTeRogueChoice.cs:223` | 肉鸽的 `replyHandler` 切片（⚠️ **`npc=null`、`npcList=null`** 直接喂进 `GetNpcEntity`） | **A 组出局** |
| （递归）`Callback` / `OpenHintbox` | `NpcActionHandler.cs:136/479` | `callbackHandler` | **本线** |

⚠️ **两条要写进目标的观察**：
1. **胜负链在 `MapSceneView` 里、还叠了一段硬编码活动**：`map.id ∈ [82,90]` 且 `npc.id >= 8200` ⇒ 送 `new Item(7, Random.Range(1,5))`（`MapSceneView.cs:511-516`，注释原文"**1周年争霸赛特殊活動**"）⇒ **数据之外的隐藏规则**（**MNC10**）。
2. **`YiTeRogueChoice.cs:223` 用 `null` 的 npc/npcList 调同一条链** ⇒ 任何"`handler.action` 里拿 `npc?.GetInfo()`"的动作在那条路上都会**静默失效** ⇒ 我们的 `ActionIntent` **必须允许 `npc: null`**（**MNI7**）。

---

## 3. 目标结构与契约

### 3.1 形状：`core/map/button.ts`（L0 · 纯数据）

```ts
export type ButtonEventType = 'None'|'Auto'|'OnPointerClick'|'OnPointerEnter'|'OnPointerExit'|'OnPointerOver'
export type NpcAction = 'None'|'SetNpcParam'|'OpenHintbox'|'OpenPanel'|'OpenDialog'|'Teleport'|'SetItem'|
  'GetPet'|'RemovePet'|'SetPet'|'EvolvePet'|'SetMission'|'SetActivity'|'Battle'|'Player'|'SetMail'|
  'Fish'|'MiniGame'|'Callback'                                    // 18 + None，**照录**（MP7）
export type ButtonSpec = {                                        // 一条 `<button>` / `<func>` / `<reply>`
  typeId: string; type: ButtonEventType;                          // ★原串与派生值都留（MNI2）
  description?: string; actionType?: string; action: NpcAction;
  condition: string[]; param: string[];
  source: 'eventHandler'|'callbackHandler'|'functionHandler'|'replyHandler'|'winHandler'|'loseHandler';
}
export const BUTTON_EVENT_TYPE: Readonly<Record<string, ButtonEventType>>   // 5 条
export const NPC_ACTION:      Readonly<Record<string, NpcAction>>           // 18 条
export const PET_ACTIONS:     readonly NpcAction[]                          // 3 条（上游 petActionList，D6 接缝用）
export function uiEventOf(b: ButtonSpec): ButtonEventType | null            // ★Auto ⇒ null（MNI1）
```

✅ **已落码（MB2，2026-10-18）**：as-built 见 `docs/map/map-impl.md §7.3.3`；
⚠️ `ButtonSpec` 的**构造**（XML 片段串 → 对象）**不在 L0**（L0 零第三方依赖，不能带 XML 库）⇒ 归 L1 `game/logic/map/entity.js`（MB5）。

### 3.2 决议：`core/map/action.ts`（L0 · **只出决议**，MQ4）

```ts
export type ActionIntent =                                    // 纯数据、可序列化、可日志（MP2）
  | { action:'setNpcParam'; target: 'animal'|number; writes: [key,value][] }
  | { action:'openHintbox'; kind:'Item'|'PetSelect'|'plain'; fields: [key,value][]; callbackTag?: string }
  | { action:'openPanel'; panel: string; args: [key,value][] }
  | { action:'openDialog'; branch: 'close'|string }
  | { action:'teleport'; mapId: number; spawn?: [x,y] }   // ★决议的正本 = **M5 §3.2**：`mapId===0` ⇒ 出 `notOpen` 而非本条；`spawn` 实测 **0 命中**（106 条全 1 param）⇒ 保留形状、数据永不填
  | { action:'setItem'; op: 'add'|'add_with_hint'|'remove'|'add_to_yite'|'remove_from_yite'; items: [id,num][] }
  | { action:'setActivity'; id: string; entries: [key,value][] }     // ★**A 组的唯一例外**（人类 2026-10-18 拍板 ①）：**只写袋**（= 存档里既有的 `<activityStorage>`）+ 日志，**不做活动玩法**（无开放时间/无奖励/无 UI）⇒ 见 **MNQ2**
  | { action:'getPet'|'removePet'|'setPet'|'evolvePet'; ... }        // D6 接缝
  | { action:'battle'; branch: string; hintIfMissing?: string }      // ⇒ M6 ⇒ E6
  | { action:'player'; sceneWrites: [key, expr][]; sprite?: string } // ⇒ 编排线键袋
  | { action:'callback'; tags: string[] }                            // ⇒ 链式再入
  | { action:'unimplemented'; name: string; params: string[] }       // ★A 组六类（MP7/MQ6）
export function resolve(handler: ButtonSpec, env: MapEnv): ActionIntent | null   // 条件不过 ⇒ null
```

✅ **已落码（MB4，2026-10-18）**：as-built 见 `docs/map/map-impl.md §7.3.5`。⚠️ **两处与上面代码块的偏差**（以 as-built 为准）：
① **`resolve` 多一个可选第三参 `opts = { mode?, conditions? }`** —— `MNI3`（门序不许倒）+ `MNI4`（`shoot` 两条入口）要求"**模式门在条件之前**"，而**模式不在 `MapEnv` 里**（`MapEnv` 是**条件**的注入面）⇒ 用抽象位 `MapMode` 把门序**在一处强制**；两参调用（`resolve(handler, env)`）**照旧合法**。
② **`unimplemented` 多一个 `reason` 字段**（机器可读因由，**23** 个名字可 grep）。
另：`removePet`（实测 0 命中）与 `player`（编排线键袋）**本批未发**（`MNQ4` 未列）⇒ 出 `unimplemented`。

⚠️ **解析纪律**：**上游"数据不合格就抛"的十四处（`int.Parse` / `option[1]` / `bool.Parse`）一律改成"不合格 ⇒ `unimplemented` + 登记"**（MP7 + 决议 ②：**声明 + 不照搬**）——
`docs/map/map-design.md §6 MC8` 要求"未知动作加一头登记"，本份把它扩成"**畸形参数**也要登记"（**MNI6**）。

### 3.3 执行接缝（L1/L4 · 副作用在这层）

| `ActionIntent` | 执行者 | 接缝 |
|---|---|---|
| `openHintbox` / `openPanel` | C2 + A3 | `docs/view/mech/view-overlays.md`（`InfoPrompt` / 提示盒）、`docs/view/panel/*` |
| `teleport` | `logic/map/session.js` | **M5** |
| `setItem` / `getPet` / `removePet` / `setPet` / `evolvePet` | 域线 | `docs/item/item-design.md`、`docs/domain/domain-pet.md`（**写侧上移 = 决议 ③**） |
| `battle` | **M6** → E6 | `docs/engine/battle-engine-session.md` |
| `player`（`data.` 写） | 编排线会话 | `docs/orchestration/orchestration-design.md` |
| `setActivity`（**只写袋**） | 会话/存档（`<activityStorage>`） | 人类 2026-10-18 拍板 ①（**MNQ2**）⇒ 落在**会话的键值袋**上（**不是**新引擎）；⚠️ 写盘仍走下面那条"收口一次" |
| 一切"存档变了" | **R4** | `docs/runtime/runtime-components-design.md §5`（⚠️ **上游每个动作自带 `SaveSystem.SaveData()` ⇒ 我们改成执行器**收口一次，**不在 core**） |
| `unimplemented` | 日志 | **不动状态**（MP7）；✅ **已落（MB4）**：载荷带 `reason`（机器可读因由）= `action-runner` 的登记键（`docs/map/map-impl.md §7.3.5` 改判表） |

✅ **已落码（MB4，2026-10-18）**：接缝实现 = `game/logic/map/action-runner.js` 的 `run(intents, ctx)`（`ctx.sinks` 一张表，**按 `intent.action` 取名**）。
⚠️ **载荷 = `ActionIntent` 本身**（`(intent, api) => …`）—— 上表"接缝"列指的是**消费者**（A3/C2/…）**在自己的渲染形状里**取字段（**MQ7**：出结构化规格即收口）；
`openHintbox` 的 `callbackTag` ⇒ 消费者调 **`api.runCallbackTags([tag])`** 再入链（`MDB2-e`）。
⚠️ `ctx.save`（写盘）**缺省不落** ⇒ 今天各接缝**多数还没有消费者**时，决议只到"**能出、能到接缝**"（端到端随 MB5–MB7）。

### 3.4 施工切法（父文档 **MB2/MB4** 的本族展开）

| 批 | 内容 | 请人测什么 |
|---|---|---|
| **MDB2-a** | `button.ts`：两词表 + 两枚举 + `uiEventOf` | —— |
| **MDB2-b** | `resolve()` 的**条件门前置**（模式门 → 条件 → 决议） | 一张有 `<condition>` 的图：**不满足点了没反应**（父文档 §8 第 3 条） |
| **MDB2-c** | **`auto` 批处理器**（进图 = 先登记 `mapNpcList` 再跑 auto） | `100.xml` 的 `10002` 野怪：**反复进出图 100**，看它是否按 `random[new]LTE5` **有的次出现有的次不出现**（**不许**每次都一样、也不许崩） |
| **MDB2-d** | `action.ts` 的 18 条 + `unimplemented` 兜底 | 遇到 `setMission`/`fish`/`miniGame` ⇒ **不崩、日志有"未实现"**（父文档 §8 第 6 条） |
| **MDB2-e** | `callbackHandler` 标签链 + **深度上限** | 对话里带"回调"的分支能走完、**不会自旋**（**MNQ3** 的上限口径） |

✅ **`MDB2-b…e` 已一次落齐（MB4，2026-10-18）**：`MDB2-b`/`MDB2-d`/`MDB2-e` 落 `action.ts` + `action-runner.js`；
⚠️ **`MDB2-c`（`auto` 批处理器）的"登记先于 `auto`"（`MNI5`）落在 MB5 的 `entity.js`/`session.js`**（本批只提供 `resolve` 与"`auto` 不进词表"的形状，`MNI1`）。
⚠️ 表中"请人测什么"三列**都要等 MB5 接线**（今天点不到 NPC），且 `MDB2-c` 依赖 `100.xml` 的 `random[new]` 现场摇 —— 见 `docs/map/map-impl.md §8.4`。

---

## 4. 一条链的形状

```text
              ┌── 进图（MapSceneView.SetNpc）──► 先 SetSceneData("mapNpcList") ──► 跑所有 type=="auto"   [§2.5]
              │
 <button> ────┼── 指针（click/enter/exit/hover）──► uiEventOf(handler) ──┐
              │                                                        │
              ├── 射击（typeId=="shoot"）──► NpcController.Shoot() ─────┤
              │                                                        ▼
              └── 回调标签（callbackHandler）◄── action:callback ──► GetNpcEntity  [递归，§2.7]
                                                                          │
                                             模式门(isShootMode XOR shoot) [MC3]
                                                                          ▼
                                             条件（AND 元素 / OR '|'）      [M3]
                                                                          ▼
                                             resolve() ⇒ ActionIntent      [§3.2]
                                                                          ▼
                     执行器（L1/L4）：面板 C2 · 提示 A3 · 传送 M5 · 道具 · 宠 D6 · 战斗 M6/E6 · 键袋 · **写盘 R4**
```

---

## 5. 不变量与围栏（**MNI1–MNI8**）

- **MNI1 · 词表 ≠ 事件**：`uiEventOf` 对 `auto` **返回 `null`**；`auto` 只由**进图批处理**消费。（照抄上游的四个 case，**不是**五个。）
- **MNI2 · `typeId` 原串是合同的一部分**：`type` 的**语义由容器决定**（`eventHandler` = UI 事件或 `auto` 或 `shoot`；`callbackHandler` = 标签）⇒ **`ButtonSpec.source` 必填**，禁止"只看 `type` 值"来判断。
- **MNI3 · 门在条件之前**：模式门（或我们的等价物）**先判**、条件**后判**、动作**最后**（`NpcHandler.cs:98-112` 的顺序**不许倒**）——倒置会让"不满足条件的按钮在非本模式下被误触发"。
- **MNI4 · `shoot` 有两条入口**：XOR 门 + `Where(typeId=="shoot")` 过滤，**两条都要在**；我们的等价建模 = **显式 mode 标志**（MC3 的目标形状），并且 `shoot` **不进词表**这一事实要保留（它 `type == None`）。
- **MNI5 · "先登记、后触发"**：进图序列固定 = 装配实体 → **登记实体总表**（我们的会话状态，非键袋）→ 跑 `auto` ⇒ **`auto` 动作能读到全部实体**。
- **MNI6 · 畸形参数不抛**：所有 `int.Parse` / `option[1]` / `bool.Parse` 类的上游越界点 ⇒ 一律**降级为 `unimplemented` + 一条登记**（决议 ② + MP7）。
- **MNI7 · `npc` 可空**：`resolve` 的入参允许 `npc: null`（`YiTeRogueChoice.cs:223` 的上游先例）⇒ 依赖 NPC 的动作在空 npc 时**只登记不执行**。
- **MNI8 · 写盘收口一次**：core **不出**任何"保存"语义；上游 6 个动作各自 `SaveSystem.SaveData()`（`getPet:250` / `removePet:271` / `setPet:297` / `evolvePet:317` / `setMission:338` / `setActivity:352`）⇒ 我们的执行器**在一批决议落地后收口一次**（决议 ③ + R4）。

---

## 6. 现状与缺口（实测 2026-10-17）

| 面 | 现状 |
|---|---|
| `NpcButtonHandler` 的等价类型 | **0 行**（`game/core/**` 无 `button.ts`；`game/app/scenes/mapScene.js` 里只有**野怪点击**与**传送光口**） |
| 事件模型 | 今天**没有"条件 → 动作"这条链**；地图交互 = SWF 内 `MapRunner.as` 的 `spots` 点击 + 宿主 `mapScene.js` 的野怪点击（⚠️ 旧指针 `:617 startWildFight` **已随 `MDB11`（2026-10-21）退役** ⇒ 现在那台机 = `onNpcClick → resolve→run → startMapBattle`，正本 `docs/map/map-impl.md §7.3.33`） |
| `auto` 语义 | **完全没有**（等价物缺失 ⇒ 野怪开关、活动计数、`setNpcParam` 全都不存在） |
| 动作执行 | **0 / 18**；其中 `openDialog` `openHintbox` `setActivity` `battle` **四条占了 3,349 次**（父文档 §2.1 频次）⇒ **做完这四条 = 覆盖 ~75% 的 `<action>`**（施工优先级依据，**MNQ4**） |
| 词表/枚举 | 未落（但**都是 15 行以内的静态件**，MDB2-a 即可清） |
| **`<wild @visual>` = 死数据**（`MDB12` 顺手核，2026-10-21） | 数据里 **裸 93 + `animation` 14 + `embedded` 3 = 110**（正好 = 全部野怪数）。上游 `NpcInfo.cs:116` 只**声明**了字段、**全仓零消费者**；我们的桥接层 `game/logic/map/parse-map.js:107 wildOf()` **把它原样透传成 `wild.visual`（缺省 `'auto'`），但下游没人读**（`mapScene.js` / `entity.js` / `npc-art.js` 三处 grep 零命中） ⇒ **运行时读不到、也没人读**。**结论 = 不是规格、本批不据它分流**（野怪**素材**支路由 `resId`→形象 id→`pet_appearance_swf.csv` 决定，见 `docs/map/map-move.md §3.4` 与 as-built `docs/map/map-impl.md §7.3.34`）。⚠️ 别把它误读成"`animation` = 会动、`embedded` = 内嵌影片"——**上游从未按它画过任何东西** |

---

## 7. 怪癖登记（**MNC1–MNC10** · 声明 + 不照搬）与待拍板（**MNQ**）

### 7.1 上游代码 bug / 危险设计

- **MNC1 · 拷贝构造共享 `callback` 引用**（`NpcButtonHandler.cs:39`）而 `condition`/`param` 是深拷 ⇒ 同形不同纪律。目标：**要么全深拷、要么不暴露拷贝构造**。
- **MNC2 · `npcList.Add(id, npc)` 撞重复键即抛**（`NpcHandler.cs:16/24/32`）⇒ **七类实体共用一张 `npcList`**（M1 §2.3 的六类同形状）而 `id` 只在**各自列表内**唯一 ⇒ 两张不同类的实体同 id ⇒ **运行期 `ArgumentException`**。目标：**`set`（覆盖）+ 冲突登记**，或键改为 `(kind, id)`。
- **MNC3 · NPC 条件不走全角转换**：`NpcHandler.cs:60` 传 `toHalf: false`，而 `Operator.ToHalfCondition` 的存在（父文档 §2.6）说明**别处会转** ⇒ 同一份数据里 `＜`/`＝` 的可用面**取决于调用方**。目标：**统一转**，并在 M3 里写明差异。
- **MNC4 · `TrimEnd(".png")` 当"去后缀"用**（`NpcActionHandler.cs:53`）⇒ C# 的 `TrimEnd(string)` 是**字符集合**语义 ⇒ `"dog.png"` → `"do"`、`"fig.png"` → `"fi"`。症状：`sprite` 换图**偶发指错素材**。**目标**：`removeSuffix(".png")` 语义（决议 ②：**声明 + 修**）。
- **MNC5 · 同一个 `key=value` 在两类动作里切法不同**：`openHintbox` 用 `Split('=', 2)`（:125，值里可含 `=`）而 `setNpcParam`/`player`/`setPet`/`setActivity`/`mail` 用 `Split('=')`（**值里的 `=` 被截断**）。目标：**统一 = 只切第一个**，并登记"上游有 5 处会截断值"。
- **MNC6 · `setPet` / `evolvePet` 的边界检查与写入用两个不同数组**：检查 `Player.instance.petBag`（`NpcActionHandler.cs:289/311`）、写入 `Player.instance.gameData.petBag[index]`（:295/316）。⇒ **两个"背包"不同一时，越界判断保护不了写入**。目标：**只有一个真背包**（口径归 `docs/domain/domain-pet.md`；本线只调接口）。同族现象已见于 `docs/view/panel/petbag/restart-petbag-panel.md`（"背包到底指哪个数组"的 switch 抄了三遍）。
- **MNC7 · `battle` 动作对 `battleHandler` 无空值保护**（:362 `npcInfo.battleHandler.Find(...)`）⇒ 无 `<battle>` 的 NPC 挂 `battle` ⇒ NRE。目标：**缺表 ⇒ 走 `hintIfMissing`**（数据里已有这条兜底路径，只是走不到）。
- **MNC8 · `fish` 把玩法硬编码在动作里**（:414-447：按 `categoryId` 三档 + 成就门槛 + 两张概率表 + 三个产物区间）⇒ **"未实现"记一条就够，但别把它当数据驱动**（A 组出局）。
- **MNC9 · `callback` 与 `openHintbox(callback=…)` 是**无上限递归****（:136/:479 → `GetNpcEntity` → 又可能出 `callback`）⇒ 数据里写一个自指标签就**死循环**。目标：**链深上限 + 超限登记**（**MNQ3**）。
- **MNC10 · 胜负链里夹一段硬编码活动**（`MapSceneView.cs:511-516`：`map.id ∈ [82,90] ∧ npc.id ≥ 8200` ⇒ 送 `Item(7, Random.Range(1,5))`）⇒ **画面层藏着规则**。目标：**规则一律回数据/域**，View **不判 id 区间**（B3 与本线的边界纪律；此处 = 声明上游有、我们不照搬）。

### 7.2 待拍板（**MNQ1–MNQ4** · 每条附建议；依人类常设指示「都按你的建议来吧」）

| # | 问题 | 建议 |
|---|---|---|
| **MNQ1** | 死条目（`hover` 数据 0 次、`mail` 动作 0 次、`none` 2 次）要不要建？ | **要建，照录枚举**（MP7 的前提是"解析面完整"），但**不实现执行**；`hover` 归 B3 的悬停（与光口同款 `InfoPrompt`，`docs/view/scene/room/view-scene-map-content.md §2.4` 已有先例） |
| **MNQ2** | `setActivity`（606 次）与条件里的 `activity[<id>]`（大量）都属 A 组出局 —— **地图会因此大面积失灵吗？** | ✅ **已拍板（人类 2026-10-18）**：**给 `activity[]` 一个「会话/存档级只存取键值袋」，不是活动系统**（不实现开放时间/奖励/UI ⇒ **不违反 A 组围栏**，只让条件不恒假）。⚠️ **落点已钉**：袋子**就是存档里既有的 `<activityStorage>`**（`docs/save/save-xml-spec.md §2.14`；真机档里 **10 个** `Activity`）⇒ **不开新字段**。**由此导出一条动作侧改动**：`setActivity` 从 MQ6 的 `unimplemented` 改为**"只写袋"**（一次键值写入 + 日志，**仍不做活动玩法**）；条件侧 **A5 纯读袋**（`docs/map/map-condition.md §7.2 CSQ4`）。⚠️ 原诊断仍成立：**`winHandler` 里 132 条 `getPet` 依赖活动条件**（样本 `10009.xml`）⇒ 这条拍板正是解掉它 |
| **MNQ3** | `callback` 链深上限取多少？ | **16**；超限 ⇒ 记一条 `unimplemented`（"回调链过深"）+ **不抛**（MP7）。理由：上游最深业务链（对话→提示→回调→发宠）实测在 **5 层内**，16 有一倍余量且不致栈溢 |
| **MNQ4** | 施工优先级：18 条动作按什么排？ | **按频次 + 按"是否挡住可玩闭环"**：`openDialog`(1243) → `battle`(559) → `openHintbox`(941) → `teleport`(106，解析口径) → `setItem`(418) → `getPet`(132) → `setNpcParam`(91) → `evolvePet`(84) → `setPet`(64) → **其余全部 `unimplemented`**。⚠️ `setActivity`(606) **不实现**（MNQ2 的键值袋已兜住它的读侧） |

### 7.3 等人手测确认项（决议 ⑦）

> ⚠️ **2026-10-18 起本节的前置说明**：`action.ts` + `action-runner.js` **已落码（MB4）**，但**五条都依赖"点得到 NPC"** ⇒
> "点 NPC → `resolve` → `run`"的**接线在 MB5** ⇒ **本节各条今天都还测不了**（与 `docs/map/map-impl.md §8.4` 同一口径）。
> 落地后日志出口 = `action-runner` 的 `log`（默认 `console.warn`，前缀 `[map/action]`）。

1. **`auto` 每次进图重摇**：图 `100` 的 `10002`（`active=false` + `random[new]LTE5`）⇒ **反复进出图 100**，野怪**时有时无**；⚠️ 若"永远不出现"或"永远出现"即实现错。
2. **条件门**：任一 `<condition>` 不满足的按钮 ⇒ **点了没反应、不弹错**（MNI6 + MP7）。
3. **`callback` 标签链**：对话/提示里带回调的分支 ⇒ **能走到终点**（发宠/提示/切图），**不死循环、不闪退**（MNQ3）。
4. **`shoot` 门**：我们**没有射击模式** ⇒ 数据里 25 个 `shoot` 按钮 ⇒ **普通模式下点了没反应**（MNI4 的反面确认）。
5. **畸形参数**：故意在测试档写一个 `<param>active</param>`（无 `=`）⇒ **不崩**、日志出现一条"未实现/畸形参数"登记（MNI6）。

---

## 8. 配对实现（impl）指针

- `docs/map/map-impl.md` / `docs/map/map-code-map.md` —— ✅ **已成文（2026-10-18）** ⚠️ **人类 2026-10-18 已结账四条拍板**（`docs/map/map-impl.md §9`），design 本身仍待评审，见 `docs/map/map-design.md §9.3`；
  本份的 **as-built** 回填到 `map-impl.md §7`（`MDB2-a…e` 对应它 §2 的 **MB2**（`MDB2-a`）与 **MB4**（`MDB2-b…e`））：
  ✅ **`MDB2-a` = §7.3.3**（`button.ts`）· ✅ **`MDB2-b…e` = §7.3.5**（`action.ts` + `action-runner.js`，2026-10-18）。
- **对父文档的修订**（§2.2 与 §2.5 两条发现）已同步进行，见下节。

---

## 9. 本份对父文档的修订（`docs/map/map-design.md`）

| 父文档位置 | 原文 | 改后 | 依据 |
|---|---|---|---|
| §2.4 表 `GetButtonEvent` 行 | "**只有 5 种**映射到 UI 事件；其余 **返回 `null`**" | "**词表 5 条、UI 事件只有 4 种**（`auto` **不**是 UI 事件 ⇒ 进图批处理，见 M2 §2.5）；其余返回 `null`" | 【源码】`NpcHandler.cs:35-44` |
| §2.5 末段 | "同一个 `<button>` 形状出现在三个地方" | **补第四/第五个**：`winHandler`/`loseHandler` 之外还有 **`callbackHandler`（223 条标签）** 与 **肉鸽 `replyHandler`**（A 组）⇒ 见 M2 §2.7 的六消费点表 | 【源码】`MapSceneView.cs:508/521` + `NpcController.cs:151` + `YiTeRogueChoice.cs:223` |
| §6 MC2 | "`GetButtonEvent` 对 10 种取值返回 `null`" | **精确化**：实测 `eventHandler` 5 种（`click 682 / auto 66 / shoot 25 / exit 4 / enter 4`）、`callbackHandler` 10 种（`evolve 128`…）；⚠️ **`shoot` 不在词表** ⇒ `type=None` 但**由 `NpcController.Shoot()` 按原串认领** | 【样本】272 张 awk 分段实测 |
| §6 MC2 | "`GetButtonEvent` 对 10 种取值返回 `null`" | **精确化**：实测 `eventHandler` 5 种（`click 682 / auto 66 / shoot 25 / exit 4 / enter 4`）、`callbackHandler` 10 种（`evolve 128`…）；⚠️ **`shoot` 不在词表** ⇒ `type=None` 但**由 `NpcController.Shoot()` 按原串认领**；⚠️ **`auto` 不是 UI 事件** | 【样本】272 张 awk 分段实测 |
| §6 表头 | MC 家族只有 8 条 | **加一段指针**：子设计各自另立本族怪癖家族（**不占 `MC` 号**）= M1 **MDC1–MDC9** / M2 **MNC1–MNC10** | 本文件 §7.1 |
