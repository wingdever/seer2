# 代码分析：重启的上游是怎么实现"疑难指引面板（GuideLine / OpenPanel("GuideLine")）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；住本面板子目录 `docs/view/panel/guide/`，落位口径见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制/复用 MVC**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **C3 地图/世界族**（`docs/view/view-design.md §8` 把 `GuideLine` 与 WorldMap/MiniMap/SPTBoss/Door/Mission 同列）；面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**（`openPanel` 同名去重）；入口钮 = **B1 `docs/view/scene/room/view-scene-hud-design.md`** 的底栏「指引」字形钮（本仓 `game/app/view/hud/restartHudView.js:82`）；性格数据 = 域模型 **D6 `docs/domain/domain-pet.md` / `domain-info.md`**（55 性格 + `getPersonalityBuff`）；属性表 = 引擎/域模型既有 23×23 相克表（`game/core/pet/element.ts`）。
> **路径口径**：上游代码/资产路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【源码】= 直接引用 `路径:行`；【实测】= 本次可复算（读预制 / 目录清点 / 数值统计）；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §8 逐条登记（本报告内部编号 **A1–A14**，引用**必须带文件名**）；目标行为未定的写"待定 + 指针到 design"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；配对设计 = `docs/view/panel/guide/guide-design.md`（GD1–GD10 / GDQ1–GDQ3）→ `guide-impl.md`（as-built）→ 代码（`AGENTS.md §1`；本线为人类 2026-10-20 点名"完成主场景 HUD 的指引图标面板"特例，代码与 impl 同批落地）。

---

## 0. 一句话结论

**「疑难指引」上游 = 一个 570×400 的查询板：四个页签（新手指引 / 属性攻击 / 属性防守 / 性格查询），三个可切换页 + 一个跳往另一个面板的跳转钮。**
面板脚本 `Resources/Panels/GuideLine/Scripts/GuideLinePanel.cs` **一共 8 行、类体为空**【源码 `:5-8`】—— 没有一行运行期逻辑。真值全在 **`Resources/Panels/GuideLine/Panel.prefab` + 被复用的 MVC 组件**里：

- **属性攻击 / 属性防守** = 两个独立的 `PetElementController`，各自 23 个属性按钮 + 3 个关系区（克制/微弱/无效 或 被克制/被微弱/被无效）；点属性 ⇒ 查 23×23 表并重填三区【源码 `PetElementView.cs:33-48`】。
- **性格查询** = `PetPersonalityController` 把 `Personality` 枚举 **0..54 全量**铺成 55 行滚动表；但发行版里 **只保留 `List` 这一块**，图形关系（`Relation`）、25 格 `Table`、底部 `Note` **全部 `m_IsActive: 0`**，`personalityText`/`noteText` 绑定为 0 ⇒ 玩家看到的只是"性格名 + 5 列百分比数字"的裸表【源码 `PetPersonalityView.cs` + 预制实测】。
- **新手指引** 页签不是第四页：它绑 `Module.OpenPanel("Noob")` + `Panel.ClosePanel`，即**关掉本面板、另开 `Noob` 面板**；`Noob` 是独立面板线（读 `Activity.Noob` 四步进度 + `Player.IsNoob()`），`OptionSelectModel` 的 3 格 `storage` 与 `CursorOptionSelectView.optionRects` 里**都没有它**【源码 `NoobController.cs` + 预制 `:3301/:3313`】。

我方对应物今天（本批前）= **占位**：HUD `restartHudView.js:82` 的 `guide` 行没有 `handler` ⇒ 点击落「指引：面板待建」；`mapScene.js` 也没有任何 `GuideLine` 入口。**钮在、链缺面板本体**。

---

## 1. 入口与打开【源码/实测】

- **底栏入口**：`Scenes/Map.unity:12150` 的 `onPointerClickEvent` 绑 `MapMenuController.OpenPanel`，`m_StringArgument: GuideLine`。对应 HUD 节点 = 底栏第 10 颗字形钮「指引」，`box [665,505,30,25]`、标签 `['指引',15,-2.5]`（本仓 `game/app/view/hud/restartHudView.js:82`）。
- **面板加载**：`OpenPanel("GuideLine")` ⇒ `Resources/Panels/GuideLine/Panel.prefab` + `GuideLinePanel`（空壳，见 §2）。
- **数据/活动入口**：`game/data/unity/activities.json` 135 条活动里 **没有 `linkId = GuideLine` 的记录**【实测】 ⇒ 上游/发行数据里本面板的入口**只有 HUD 这一颗**；NPC 运行期 `openPanel` 若指向 `GuideLine` 属可能的第二入口（本仓分派器需要一条分支，见 design §4）。
- **关闭**：`Esc Button` 绑 `Panel.ClosePanel`（另有 `Sound_BtnClick`）；根遮罩 `Panel` 也是全屏 Image，按面板栈口径点遮罩关闭【源码 预制 `:3704` + 本仓 `rb-scrim` 惯例】。

## 2. 本体脚本（8 行）逐段【源码】

```csharp
// Resources/Panels/GuideLine/Scripts/GuideLinePanel.cs:1-8
public class GuideLinePanel : Panel
{
    
}
```

- **零字段、零方法、零生命周期覆写**。`Panel` 基类只负责加载/显示/关闭，故本面板所有行为都来自预制上挂的组件。
- 预制上挂的组件（按 `m_Name` / 序列化值）【源码 `Panel.prefab`】：
  - `OptionSelectController`（`defaultSelect: 1`，`:2023`）+ `OptionSelectModel`（`selectCount:1 / capacity:3 / pageMode:0 / storage: 3 项`，`:5940-5946`）+ `CursorOptionSelectView`（`optionRects` **3 项**，`:4432-4435`）。
  - **两套独立** `PetElementController / PetElementModel / PetElementView / PageView`：属性攻击页 `isAttackRelation: 1`（`:6286`），属性防守页 `isAttackRelation: 0`（`:5998`）；两页 `elementNumInOnePage: 23`（`:4072`、`:7169`）。
  - `PetPersonalityController / PetPersonalityModel / PetPersonalityView`（后者 `personalityCellPrefab` 指向 `Workshop/Prefabs/List/Personality Cell.prefab`，`:5449`；`relationGraph` 指向 `Graph`，`personalityText/noteText` 为 0）。
  - `PageView` ×2：`currentPageText/lastPageText/jumpPageInputField` **全为 0**（`:224-228`、`:5169-5173`），只剩 `prevButton/nextButton`。

## 3. 预制几何【源码 `Panel.prefab` + 实测换算】

坐标 = 960×540 逻辑像素、左上原点（Unity 中心系已换算；与本仓 `ui.css` 口径一致）。

| 节点 | 盒 `[left,top,w,h]` | 素材/备注 |
|---|---|---|
| 根遮罩 `Panel` | `[-5,-5,970,550]` | 内置 UISprite 黑 α0.5 |
| 窗 `Panel`（GuideLinePanel） | `[195,70,570,400]` | — |
| `Background` | `[195,70,570,400]` | 内置 UISprite 黑 **α1** |
| `Title line` | `[195,90,570,23]` | `Panels/ItemShop/Sprites/title line.png` |
| `Esc Button` | `[725,75,35,35]` | `Sprites/Game/Hint Box/Green Esc.png` |
| `Title` / TMP | `[195,70,570,50]` / `[300,67,360,50]` | 「疑难指引」24px，TMP 色 `#52e5f9` |
| `Menu` | `[195,120,570,50]` | — |
| `Noob` 页签 | `[250,130,100,30]` | 「新手指引」18px，黑底 |
| `Element Attack` 页签 | `[370,130,100,30]` | 「属性攻击」18px |
| `Element Defense` 页签 | `[490,130,100,30]` | 「属性防守」18px |
| `Personality` 页签 | `[610,130,100,30]` | 「性格查询」18px |
| 游标 `Bg` | `[370,129,100,32]` | `Panels/OldPetBag/Sprites/269.png`，画在最后（盖住页签） |
| `Module` | `[195,170,570,300]` | 三页容器 |
| 属性页 `Table` / 属性格 | `[200,200,190,220]` / `Element Button` 40×40，5 列 ×5 行 | 格位 `x=208+44c, y=200+44r`（23 格：5×4 + 末行 3） |
| 属性页 `Page` | `[350,375,60,40]` | Prev `[345,385,20,20]`、Next `[395,386,20,20]`，`151.png` |
| `Relation.Title` | `[435,180,310,40]` | 属性图标 40×40 @ `(400,180)`（相对 Title 左 −35）；名称 TMP `[555,180,100,40]` 16px |
| `Weak` / `Resist` / `Zero` | `[435,220,120,190]` / `[565,220,120,190]` / `[695,220,50,190]` | 标题 18px（防守页 16px）；Area `[*,260,*,150]` |
| 关系区按钮 | 40×40，`x={8,44,80}`、`y={-5,-41,-77,-113}`（相对 Area） | 3 列 ×4 行 = **12 槽**；`Zero` 只有 **1 槽** |
| `Note` | `[195,420,570,50]` | 18px，`<color=red>克制表示伤害2倍</color=red>  微弱表示伤害0.5倍` |
| 性格页 `Table` | `[210,180,260,230]` | **`m_IsActive: 0`**，25 个 IButton 无绑定 |
| 性格页 `Relation` | `[485,180,260,230]` | **`m_IsActive: 0`**，`Graph` 引 `Personality/Relation/{id}` |
| 性格页 `Note` | `[195,420,570,50]` | **`m_IsActive: 0`**，文案「红色箭头表示增强10%」 |
| 性格页 `List` | `[220,180,520,280]` | 唯一激活块 |
| `Scroll View` | `[227,220,510,230]` | 黑底；`Viewport`/`Content` 全拉伸；竖向滚动条 `[727,220,10,230]` 青色 Handle |
| `Personality Cell` 模板 | 590×35 @ `(7,-4)` | 见 §6 |

> 注：属性格的 5 列总宽 216，比 `Table` 名义宽 190 宽 26px（无 Mask，不裁剪）；最后一列落在 `x=384..424`，仍在 `Relation` 左缘 435 之前。属预制摆位事实，不是遮挡 bug。

## 4. 页签机器：3 页选择 + 1 个跳转【源码/实测】

- `OptionSelectModel` 的 `storage` 只有 **3 项**：`Element Attack`、`Element Defense`、`Personality`（`:5943-5946`）；`capacity: 3`。
- `OptionSelectController.defaultSelect: 1`（bool true）⇒ `Init()` 里 `Select(0)` ⇒ **默认选中第 0 项 = 属性攻击**；游标 `Bg` 的初始位置 `x=370` 正是属性攻击页签【源码 `OptionSelectController.cs:12-18` + 预制实测】。
- `CursorOptionSelectView.optionRects` 只有 **3 个矩形**（`:4432-4435`，对应三个可切换页签）；`Noob` **不在** `optionRects` 里。`SetCursorImagePosition` 有 `index.IsInRange(0, optionRects.Count)` 守卫 ⇒ 即使 Select 到 Noob 也不会把游标移过去【源码 `CursorOptionSelectView.cs:17-22`】。
- 页签点击绑定（4 条中的 3 条）：`Element Attack → Select(0)`、`Element Defense → Select(1)`、`Personality → Select(2)`；`Noob → Module.OpenPanel("Noob")` + `Panel.ClosePanel`（预制 `:3301/:3313`）。
- ⇒ **`Noob` 是"跳转钮"，不是第四页**。点它 = 关闭本面板 + 打开独立 `Noob` 面板；本面板的三个页签状态不保留（面板已销毁）。

## 5. 属性攻击 / 属性防守页【源码 + 实测】

### 5.1 左格与选择

- 23 个 `Element Button`（`PetStorage/Prefabs/Element Button.prefab`：40×40 按钮 + 30×30 `Icon` 子节点），5 列 ×5 行；`PetElementView.SetPage(0)` 逐格 `SetElement((Element)i)`【源码 `PetElementView.cs:21-31`】。
- 点击某格 ⇒ `PetElementController.Select(index)` ⇒ `elementModel.GetElementId(index)=page*23+index` ⇒ `SetElement`（模型 + 视图）【源码 `:17-25`】。
- 两页各自一份 controller/model/view，**各自保留自己的选中属性**；切页再切回不会重置（除非面板重开）。

### 5.2 关系谓词

`PetElementView.SetElement`【源码 `:33-48`】：

```csharp
Func<Element, Func<float,bool>, List<Element>> RelationFunc = isAttackRelation
    ? PetElementSystem.GetAttackRelation
    : PetElementSystem.GetDefenseRelation;

var weakElements   = RelationFunc(element, x => x > 1);
var resistElements = RelationFunc(element, x => (x > 0) && (x < 1));
var zeroElements   = RelationFunc(element, x => x == 0);
```

`PetElementSystem`【源码 `:177-197`】：

- `GetAttackRelation(e, filter)`：遍历 **23 个防守方**，取 `elementDefenseRelation[防守方][e]`（**列**），满足 filter 的防守方入列。
- `GetDefenseRelation(e, filter)`：直接筛 `elementDefenseRelation[e]` 这一**行**，返回攻击方 id。
- 即：攻击页回答"我打谁克制/微弱/无效"；防守页回答"谁打我克制/微弱/无效"。

### 5.3 关系区槽位与真实数据上限（**关键缺口**）

- 槽位：`weakArea 12`、`resistArea 12`、`zeroArea 1`（两页各一套，预制列表逐项计数【实测】）。
- `SetElementRelation` 对 `i >= result.Count` 的槽位 `SetActive(false)`，**多余的返回项直接丢弃、不提示**【源码 `:50-59`】。
- 用仓库内 23×23 表逐属性统计【实测】（`game/core/pet/element.ts`，与上游 `PetElementSystem.cs:66-90` 同表）：

| 方向 | 克制/微弱/无效 的最大数量 | 超出槽位的属性 |
|---|---|---|
| 攻击（列） | **22 / 12 / 1** | `精灵王` 攻击克制 **22** 个 ⇒ 只显示前 12 个，**丢 10 个** |
| 防守（行） | **10 / 21 / 1** | `精灵王` 防守被微弱 **21** 个 ⇒ 只显示前 12 个，**丢 9 个** |

除 `精灵王` 外，其余 22 个属性均在槽位内。⇒ 这是发行数据里**真实可观察**的截断（选「精灵王」页即触发），按决议 ② 登记为 **A5**，目标行为由 design 定（GD7）。

### 5.4 翻页 = 死 UI

- `PetElementModel.elementNumInOnePage = 23`、`lastPage = (23-1)/23 = 0`【源码 `PetElementModel.cs:7-9`】；两页都只有 1 页。
- `PageView.SetPage(0,0)` ⇒ `prevButton.SetInteractable(false)`、`nextButton.SetInteractable(false)`；`currentPageText/lastPageText` 在预制里为 0 ⇒ 页码也不显示【源码 `PageView.cs:17-26` + 预制】。
- Prev/Next 仍绑 `PrevPage/NextPage`（预制 `:2468/:4724/:529/:5719`），但模型 clamp 在 0，**点了永远无变化**。⇒ A4。

### 5.5 标题与脚注

- 标题：图标 + `element.GetElementName()`。预制占位文本是「普通系」，但运行期 `SetText` 写入的是 **`GetElementName()` = 「普通」（无「系」字）**【源码 `PetElementSystem.cs:117-125` + `PetElementView.cs:35`】⇒ A7。
- 脚注（攻击页）：`<color=red>克制表示伤害2倍</color=red>  微弱表示伤害0.5倍`，18px【源码 `:2735`】。
- 脚注（防守页）：**逐字同一句**（`:7051`），但三个区标题已换成「被克制 / 被微弱 / 被无效」；「克制表示伤害2倍」在防守语境下**语义不对**（应是"被克制表示受到伤害2倍"）⇒ A6。

## 6. 性格查询页【源码 + 预制实测】

### 6.1 数据与生命周期

- `PetPersonalityController.personalityList` = `Enumerable.Range(0, Enum.GetNames(typeof(Personality)).Length)` ⇒ **0..54 共 55 条**，顺序 = 枚举声明顺序【源码 `PetPersonalityController.cs:9`；仓库 `game/core/pet/basic.ts:10-33` 同序】。
- `Init()` 用协程 `CreatePersonalityList` 逐条实例化 `Personality Cell`（每次 ≥100 条；55 条 = 一次），并显示加载屏「正在加载性格」【源码 `PetPersonalityView.cs:23-49`】。
- 点击某行的**姓名格** ⇒ `Select(id)` ⇒ `SetPersonality`：写模型、`SetPersonalityText`、`SetNote(Status.GetPersonalityBuffDescription(p))`、`SetRelationGraph(p)`【源码 `PetPersonalityController.cs:41-51`】。
- 但 `PetPersonalityView` 的 `personalityText`、`noteText` 序列化值均为 **0**；`Relation` 节点 `m_IsActive: 0` ⇒ **点击唯一可见变化 = 无**（名/注/图都不显示）。模型 `SetPersonality` 在 `currentPet == null` 时直接返回，本面板也没有 `SetPet` 调用 ⇒ 无写档副作用【源码 `PetPersonalityModel.cs:16-22`】。

### 6.2 激活的只有 `List`

- `Table`（25 个 IButton，5×5、x={20,65,110,155,200}、y={0,-45,-90,-135,-180}）、`Relation`（Graph 背景）、`Note`（「红色箭头表示增强10%」）**三块全部 `m_IsActive: 0`**；`Table` 的 25 个按钮没有任何点击绑定【预制实测】。
- `List/Scroll View`：510×230 视口，`Content` 用 `VerticalLayoutGroup`（spacing 0）+ `ContentSizeFitter`（vertical=2）自动堆高；滚动条 10px、Handle 青色。
- 因此发行版**实际可见**的性格页 = 55 行裸表，没有表头、没有图、没有说明。

### 6.3 `Personality Cell` 布局与格式

模板 = `Resources/Panels/Workshop/Prefabs/List/Personality Cell.prefab`（590×35 @ `(7,-4)`）：

| 子格 | x | 宽 | 备注 |
|---|---|---|---|
| `Name` | 0 | 100 | 青色 `#52e5f9`；点击回调挂在这里 |
| `Atk` | 100 | 80 | — |
| `Mat` | 180 | 80 | — |
| `Def` | 260 | 80 | — |
| `Mdf` | 340 | 80 | — |
| `Spd` | 420 | 80 | — |
| `Hp` | **5** | 80 | **`m_IsActive: 0`**（且 x 与 Name 重叠） |

- `PersonalityCell.SetPersonality`：`buff = Status.GetPersonalityBuff(p)`；`buff[i] == 1` ⇒ 文本 `-`、白色；否则 `buff[i].ToString()`、`>1` 绿 / `<1` 红【源码 `PersonalityCell.cs:16-30`】。⇒ 实际显示的是**乘数原值** `1.1` / `0.9`，不是 `+10%` / `-10%` ⇒ A10。
- `Hp` 列被隐藏**不丢信息**：`getPersonalityBuff` 的加/减索引只落在 0..4，**体力永远不变**（`Status.cs:325-361`，仓库 `status.ts:217-235` 同）⇒ 隐藏列即使显示也恒为 `-`。⇒ A9/A11。
- 590 宽 vs 510 视口：右缘 80px 被裁；因为 `Hp` 不激活，可见最右列 `Spd` 在 420..500，正好落在视口内 ⇒ **当前无可见裁切**；若 `Hp` 激活则会被裁掉。⇒ A11。
- 性格关系图 `Resources/Sprites/Game/Personality/Relation/{0..34}.png` 盘上只有 **35/55** 张【实测】；`Relation` 节点本身不激活 ⇒ A12。

## 7. 素材与数据实测【实测】

| 件 | 结果 |
|---|---|
| 属性图标 `Sprites/Game/Elements/0..22.png` | 23/23 在盘（`_kit.elementIcon` 路由可达） |
| 页签游标 `Panels/OldPetBag/Sprites/269.png` | 在盘 |
| 翻页箭头 `Panels/OldPetBag/Sprites/151.png` | 在盘（本批不使用，见 A4） |
| 标题线 `Panels/ItemShop/Sprites/title line.png` | 在盘 |
| Esc `Sprites/Game/Hint Box/Green Esc.png` | 在盘 |
| 窗背景 | 预制内置黑图（无外部素材） |
| 性格关系图 `Personality/Relation/0..34.png` | 35/55（本批不画，A12） |
| 23×23 关系表 | 仓库 `game/core/pet/element.ts` 已移植；与上游逐格同表 |
| 55 性格表 | 仓库 `game/core/pet/basic.ts:10-33` 已移植；`getPersonalityBuff` 已移植 |
| `activities.json` 的 `GuideLine` linkId | **0 条**（HUD 是唯一数据侧入口） |

## 8. 怪癖/缺口登记（A1–A14 · 决议 ②：声明 + 处置指 design）

| # | 症状（可观察） | 证据 | 本报告处置 / design 指针 |
|---|---|---|---|
| **A1** | `GuideLinePanel.cs` 空壳，零逻辑 | 源码 `:5-8` | 真值 = 预制 + 复用 MVC；design 直接按预制 + 组件源码定目标 |
| **A2** | 「新手指引」不是页签，而是关本面板开 `Noob`；`Noob` 依赖 `Activity.Noob` 四步进度 + `Player.IsNoob()`，属另一条面板线 | 源码 `NoobController.cs:17-37`；预制 `:3301/:3313` | 本批不实现 `Noob`；design GDQ1 定"保留钮 + 诚实提示"（建议默认） |
| **A3** | 游标只有 3 个 `optionRects`，`Noob` 不在其中；默认选中的是第 0 项「属性攻击」 | 预制 `:4432-4435`、`:2023`；源码 `CursorOptionSelectView.cs:17-22` | design 照搬"3 页 + 1 跳转"结构；游标只在三页间移动 |
| **A4** | 翻页是死 UI：23/页 ⇒ `lastPage=0`，Prev/Next 都不可交互，页码文本未绑 | 源码 `PetElementModel.cs:7-9`、`PageView.cs:17-26`；预制 `:224-228` | design 目标 = **不画死箭头**（GD4），避免伪造可翻页 |
| **A5** | 关系区槽位 12/12/1；`精灵王` 攻击克制 22、防守被微弱 21 ⇒ 上游静默丢 10 / 9 项 | 预制列表计数；23×23 表实测 | 决议 ② **不照搬截断**；design GD7 定"区内滚动 + 计数"（建议默认） |
| **A6** | 防守页脚注逐字复制攻击页（「克制表示伤害2倍」），与「被克制」标题语义冲突 | 预制 `:7051` vs `:6917/:797/:4175` | design 目标 = 防守页写「被克制表示受到伤害2倍 / 被微弱表示受到伤害0.5倍」（GD9） |
| **A7** | 预制占位「普通系」，运行期 `SetText(GetElementName())` 写成「普通」（无「系」） | 源码 `PetElementView.cs:35`、`PetElementSystem.cs:117-125` | design 取可读目标「普通系」（GD5），登记为显示层偏差 |
| **A8** | 性格页只激活 `List`；`Table`/`Relation`/`Note` 三块 `m_IsActive: 0`；`personalityText`/`noteText` 未绑 | 预制实测；源码 `PetPersonalityView.cs:11-18`、`PetPersonalityController.cs:46-51` | design 目标 = 只做列表 + 自补表头/脚注（GD8），**不复活死图/死格** |
| **A9** | `Hp` 列 x=5（与 Name 重叠）且 `m_IsActive: 0` | `Personality Cell.prefab` 修改项 | 因性格永不加成体力，目标 = **不画体力列**（GD8），不修预制摆位 |
| **A10** | 性格格显示乘数原值 `1.1`/`0.9`，非 `+10%`/`-10%` | 源码 `PersonalityCell.cs:20-29` | design 目标 = 显示 `+10%`/`-10%`/`-`，颜色不变（GD8） |
| **A11** | Cell 590 宽 > 视口 510；当前因 `Hp` 不激活而无可见裁切，激活则右裁 80px | 预制实测 | 目标 = 只用 Name + 5 列（500px）放进视口（GD8） |
| **A12** | 性格关系图只有 0..34（35/55）在盘 | 目录实测 | 本批不画图（节点本就不激活）；如实登记缺 20 张 |
| **A13** | 点「新手指引」会**先关掉本面板**，再开 `Noob`（`Panel.ClosePanel`） | 预制 `:3301/:3313` | 本批 `Noob` 未建 ⇒ 不关本面板，弹诚实提示（GD3/GDQ1） |
| **A14** | 性格列表无表头、无脚注、无选中反馈 | 预制实测 | design 目标 = 补固定表头 + 选中行 + 底部说明（GD8/GDQ3） |

## 9. 请人测口径（本报告只给"该测什么"，清单正本在 impl §8）

1. HUD 点「指引」⇒ 弹出 570×400「疑难指引」窗；默认停在「属性攻击」；Esc / 遮罩可关；再点不叠层。
2. 属性攻击页点 23 个属性（尤其 `精灵王`）⇒ 三区图标与数量符合 23×23 表；`精灵王` 的 22 个克制目标**全部可达**（不丢 10 个）。
3. 属性防守页点 `精灵王` ⇒ 21 个「被微弱」**全部可达**（不丢 9 个）；脚注是"被克制/被微弱"语境。
4. 性格查询页 ⇒ 55 行、表头 6 列（性格 + 物攻/特攻/物防/特防/速度）；点任一行有选中反馈与底部说明；绿色/红色/`-` 与 `getPersonalityBuff` 一致。
5. 点「新手指引」⇒ 诚实提示 `Noob` 面板待建；**本面板不消失、不崩**。
