# 代码分析：重启的上游是怎么实现"精灵背包面板"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住**本面板的子目录** `docs/view/panel/petbag/`，见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、发行数据/预制里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **C1 设计 `docs/view/panel/view-panels-pet.md`**（本文件的下游 · 已成文，**A1–A16 的目标行为在那份 §2.2**）+ 地图 `docs/view/view-design.md §8` + `docs/view/mech/view-panel-stack.md`(A2，面板栈/`OpenPanel`/`SetPanelIdentifier`/`onCloseEvent` 的真值) ·
> 域线 D6 `docs/domain/domain-pet.md`（`Pet` 对象）· D7 `docs/domain/domain-info.md`（表与 identifier）· Save 线 `docs/save/save-design.md`（`petBag`/`petStorage`）·
> 引擎线 E6 `docs/engine/battle-engine-session.md §S13`（`Pet.Add` 围栏）· 台账 `totalk.md` **T2·4 编排线** / **T2·5 Item 线** / **T1 羁绊**。
> 同族报告：`docs/view/panel/petbag/restart-secret-skill-learning.md`（**秘技学习**；本报告 §8 **A10** 已为其 §5 补出第 7 条入口）。
> ⚠️ **别和同名旧档搞混**：`docs/legacy/petbag-handoff.md`（**精灵背包复刻 · 交接文档**）是 **AS3 / Ruffle 素材线**的资产盘点与实现步骤，
> **不是**对本文件这套重启版 C# 的认领 ⇒ 本文件仍是 View **C1** 的唯一证据底座。
> **路径口径**：上游代码路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；预制/场景路径同前（**本文件的证据有一半在 `Assets/Resources/` 和 `Assets/Scenes/` 里，不在 `Assets/Scripts/`**）。
> **证据标注**：【实测】= 可复算的数字或可复跑的 grep；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**，`docs/arch-docs.md §4.1`）⇒ §8 逐条登记；目标行为未定的写"待定 + 指针"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。

---

## 0. 一句话结论

**"精灵背包面板"不是一个面板，是一个被复用了四次的机器**。
它的本体 `PetBagPanel`（267 行）**不住在 `Assets/Scripts/`**，而住在 `Assets/Resources/Panels/OldPetBag/Scripts/`；
同一份预制被 **背包（Normal）· PVP 房间（PVP）· 图鉴（Dictionary）· 异界肉鸽（YiTeRogue）** 四个宿主用序列化字段 `mode` 区分（【实测】四路 mode 值 = `0/1/2/3`，见 §1.2）。
它背后的"网格机器"是泛型基类 `SelectModel<T>` + `ISelectableArray<T>` + `IFilter<T>`（**分页 6 格、单选、三种互斥筛选、两种排序**），整个 `Pet*{Controller,Model,View,Panel}` 家族 = **【实测】83 个文件 / 6,494 行**。

而**这一族的正确性几乎全押在一个前提上：`mode` 决定"背包"这三个字指的是哪个数组**。
上游把这个前提**抄了三遍**（`PetBagPanel.cs:221-230`、`PetBagModel.cs:15-24`、`PetBagController.cs:41-50`），
并且有 **9 个操作里有 6 个把"整个背包"当成了"当前这一页"**（§4、§8 **A2/A3/A4**）。

---

## 1. 本体的位置与四路复用

### 1.1 三层分布：面板脚本**在 `Assets/Scripts/` 之外**

| 位置 | 内容 | 【实测】规模 |
|---|---|---|
| `Scripts/MVC/**` | 常规 MVC 三层 | **442 文件 / 69,879 行**（= 我们一直引用的那个基线） |
| `Resources/Panels/**/Scripts/*.cs` + 直接躺在面板目录的 `.cs` | **面板自带脚本**（`<Name>Panel : Panel`） | **43 文件 / 2,881 行** |
| `Resources/Games/**`（小游戏）+ `Resources/Prefabs/Player/RobotView.cs` | 同族"寄生在资源里"的代码 | 4 文件 / 376 行 |
| `Plugins/**`、`Photon/**`、`Spine/**`、`FlashTools/**` | 第三方 | 不算 |

⇒ ⚠️ **结构性事实**：`Assets/**/*.cs` 共 **950 文件 / 178,929 行**，其中**第一方但不在 `Scripts/` 的 = 47 文件 / 3,257 行**。
`PetBagPanel` 与 `PetBagMode` 枚举（`Resources/Panels/OldPetBag/Scripts/PetBagPanel.cs:260-268`）**正好落在我们所有既有统计的盲区里**
⇒ 本条已连带修正 `totalk.md` **T2** 的口径（见其"已核实的事实"表下方注）。

> 顺带一条命名现实：脚本文件在 **`OldPetBag/`** 目录，但**活跃预制是 `PetBag/Panel.prefab`**（`OldPetBag/Panel.prefab` 也还在引用它）。
> 而 `docs/view/mech/view-panel-stack.md:35` 写的规则是"`OpenPanel` 名 = 类名去 `Panel` 后缀 = `Resources/Panels/<Name>/` 目录名" ⇒ `PetBagPanel` → `PetBag/` ✅ 成立，**目录名 `OldPetBag` 只是历史遗留**。

### 1.2 四路复用的真值（prefab / scene 里的序列化值，非推断）

| 宿主 | 引用方式 | `PetBagPanel.mode` | 证据（【实测】YAML 行号） |
|---|---|---|---|
| **精灵背包**（地图角落按钮） | 自有组件 | **0 = `Normal`** | `Resources/Panels/PetBag/Panel.prefab:1256`（组件）·`:1263 mode: 0` |
| **PVP 房间** | 嵌套预制 + override | **1 = `PVP`** | `Scenes/Room.unity:3490-3492`（target fileID `7486340245330173395`） |
| **图鉴** | 嵌套预制 + override | **2 = `Dictionary`** | `Resources/Panels/PetDictionary/Panel.prefab:13634-13636` |
| **异界肉鸽** | 嵌套预制 + override | **3 = `YiTeRogue`** | `Resources/Panels/YiTeRogue/Panel.prefab:5505-5507` |
| （遗留副本，仍引用同一脚本） | 自有组件 | 0 | `Resources/Panels/OldPetBag/Panel.prefab:6800` |

⇒ 组件 fileID `7486340245330173395` 是**同一段 YAML 在四个宿主里被覆盖**，不是四份代码。
⇒ 代码里的注释原话（【源码】`PetBagPanel.cs:7-8`）：*"Pet Bag Panel are in 4 places: Prefab, PVP Room, Pet Dictionary Example, YiTeRogue / Every revise with pet bag should check all these places."* —— **上游自己承认改这一族要跑四个宿主验**。

### 1.3 `PetBagMode` 的六个值，实际分住在两个面板

```
Mod = -1   Normal = 0   PVP = 1   Dictionary = 2   YiTeRogue = 3   Elite = 4     // PetBagPanel.cs:260-268
```

- 背包面板（`PetBagPanel`）只用 **Normal / PVP / Dictionary / YiTeRogue**（§1.2 实测）；
- 仓库面板只用 **Normal / Mod / Elite / PVP**（`Resources/Panels/PetStorage/Scripts/PetStoragePanel.cs:38-42` 的 `IsNormalStorageMode` 白名单 = `{Normal, Elite, Mod}`）；
- `PetTeamController.cs:12` 另有一个 `mode` 字段默认 **PVP**。
⇒ 【推断】一套枚举三个消费者、取值集合互不相同 ⇒ **"这个 mode 是谁的 mode"在代码里不可读**，只能靠注释行号对齐。

### 1.4 打开面板的三个入口

| 入口 | 代码 | 备注 |
|---|---|---|
| 地图角落按钮 | `Scripts/MVC/Controller/Map/Components/MapPetCornerController.cs:21-24` | `Panel.OpenPanel<PetBagPanel>()` + **`onCloseEvent` 里重读 `Player.instance.petBag?.FirstOrDefault()`** |
| 门（爬层）面板内 | `Scripts/MVC/Controller/Panel/DoorController.cs:78-88` | 关面板回调 `petBagPanel.petBag.Take(doorModel.petNum)` ⇒ **门用"背包前 N 只"当出战阵容** |
| 剧情 | `Scripts/MVC/View/Story/StoryPanel.cs:485` | 剧情脚本可直接开背包面板 |
| （PVP）房间 | `Scripts/Scene Specific/Room/RoomManager.cs:49-50`（先 `SetActive(true)` 再 `SetActive(false)` 预热）·`:96-97` `SetPetBag/SetItemBag` | ⚠️ `PetBagPanel` **没有 `SetMode`** ⇒ PVP 的数据只能靠 `RoomManager` 事后灌进去 |

---

### 1.5 活跃 prefab 的分区真值（【实测】2026-10-17 · 新查）

**方法**：`Resources/Panels/PetBag/Panel.prefab` 里的 `--- !u!1001` 块 = 嵌套 prefab 实例；取每块的 `m_SourcePrefab` guid ⇒ 用 guid 反查 `Assets/**/*.meta` 解回文件名；块的 `m_SizeDelta` / `m_AnchoredPosition` 取 `m_Modification` 里的 `propertyPath` 覆盖值（锚点在父中心）。
**结果**：**9 个块全部直接挂在根 `Panel` 下**（`m_TransformParent` 均解到 `Panel`），没有第二层分组：

| 块（prefab 文件） | 覆盖后 size | 覆盖后 pos | 内含（块 prefab 的子物体名 + size） |
|---|---|---|---|
| `Prefabs/Pet Bag Storage` | `-12 × 125`（⇒ 宽 ≈ 948） | `(0, 5)` | `Pets 948×124` · `Page 728×124` · `First 90×55` · `Prev`/`Next 22×30` ⇒ **一行网格 + 分页** |
| `Prefabs/Pet Detail` | `603 × 325` | `(-25, -20)` | `Basic 510×264` · `Filter 203×33`（含 `InputField 125×30`）· `Element Background 100×440` · `Bottom Info` 高 50 · `Data` · `Confirm` ⇒ **筛选栏长在详情区里** |
| `Prefabs/Pet Bag Button Group` | `85 × 340` | `(0, 0)` | **8 个 64×32 竖排钮**：`Fight First Follow Heal Home Item Storage Train` |
| `Prefabs/Pet Personality` | `600 × 360` | `(0, 0)` | 自带**全屏遮罩** `Background Cover 960×550` + `Esc Button 35×35` + `List 520×290` + `Table 260×230` + 垂直滚动 |
| `Prefabs/Pet Buff` | `300 × 340` | `(20, -80)` | `Default 225×110` · `Afterward 225×110` |
| `Prefabs/Pet Demo` | `300 × 340` | `(310, -2)` | `Change Name` · `Element` · `Gender` · `Emblem` · `Feature` · `Feature 7 star` · `Individual Value` |
| `Prefabs/Pet Battle Test` | —— | —— | 战斗测试 |
| `Resources/Prefabs/Info Prompt` | `95 × 30` | `(700, 475)` | 悬浮说明 |
| `Panels/SelectNumHintbox/Panel` | `-1138 × 547` | `(12.5, 0)` | 数量选择浮层 |

**另有两个块 prefab 存在于 `Prefabs/` 但不在这 9 个实例里**：`Pet Data`（12 行字段：`Id Level Personality Evolve Level Height Weight Get Pet Date`…）、`Pet Status`（六维 + `EV Box 180×35` + `Max EV Box` + `Adjust Button`）、`Pet Item`（`510×264` + `Box 384×192` + 页签 `All Grow Battle Emblem Skin` 各 `131×64` + `Prev/Next`）
⇒ 【推断】它们由上面某个块**再嵌套**：人类实测（`docs/view/panel/petbag/petbag-panel-desc.md`）已确认就是 `Pet Detail` 的**基础信息子面板**（= `Pet Data` + `Pet Status`）与 **技能 / 抗性 / 道具**子面板（= `Pet Current Skill` / `Pet Resistance` / `Pet Item`）⇒ **这层嵌套关系成立**（子块尺寸与 `Pet Detail` 的 `Basic 510×264` 对齐）。

⚠️ **二次校正（2026-10-17，人类对照重启实际渲染）**：初版曾据上表推出"~~网格是顶部一整条横排（948×124 里放 6 格）、详情在下面偏左、按钮列在右边竖排~~" —— **这条推断作废**：上表的 `m_AnchoredPosition` 是**中心 / 自适应锚**（**不是屏幕坐标**），逐块解锚点**解不出真实版面**。
人类给出的分区是**上中下三层** ⇒ **① 标题层**（标题「精灵背包」居中 + ❌ 贴右）→ **② 内容层**（左右：**显示区** ｜ **信息区** = **操作列** + **信息面板**）→ **③ 队伍区**（左箭头 + 6 只 + 右箭头 + 刷新）；正本 = **`docs/view/panel/petbag/petbag-panel-desc.md`**。
⇒ 块 **尺寸**仍是硬事实（`Pet Bag Storage -12×124`、`Pet Detail 603×325`、`Button Group 85×340`、`Pet Demo`/`Pet Buff 300×340`）；但**层级与相对位置以人类实测为准**，下游 = `docs/view/panel/view-panels-pet.md §4.1`。

### 1.6 按钮组的绑定真值（8 钮 · 判据 = prefab 的 `m_MethodName`）

> ⚠️ **判据纪律**：按钮接线住在 **prefab 的 `m_MethodName`**（自定义 PointerClick 组件的 `onPointerClickEvent`），**不在** Controller 目录的字符串里。
> ⇒ 按**脚本目录** `grep` 钮名字串**会漏**（初版就因此在 `Follow` 上栽了跟头，见下"更正 1"），必须解 prefab。

【实测】`Resources/Panels/PetBag/Prefabs/Pet Bag Button Group.prefab`（逐 `m_GameObject` 归位到 `m_MethodName`）：

| 钮（子物体名） | `m_MethodName`（真值） | 目标脚本 | 说明 |
|---|---|---|---|
| `Fight` | `SetPetFight` | `PetBagController` | 上阵 |
| `First` | `SetPetFirst` | 同上 | 首发 |
| `Follow` | **`SetPetAnim`** | 同上（`:121-124` 切预览动画模式） | **人称「动画」** —— ⚠️ 初版误判"无绑定"。**我们的落地**：真 Flash idle 台 + 切演出状态（`view/petbag/idleStage.js`，`待机/被打/胜利/必杀`；素材 = `swf/fight/{swfId}.swf`，C1 §4.1 更正 3） |
| `Heal` | `SetPetHeal` | 同上 | 恢复体力 |
| `Home` | `SetPetHome` | 同上 | 入库 |
| `Item` | `OpenPetStoragePanel`（**嵌套 prefab 自带值，已过时**） | 同上 | ⚠️ **活跃 `Panel.prefab:5325` 覆盖成 `TogglePetItemPanel`**（另加一条 `OptionSelectController.Select`）⇒ 真行为 = 开合内嵌道具子面板 |
| `Storage` | `OpenPetStoragePanel` | 同上 | 开仓库面板 |
| `Train` | `SetPetTrain` | 同上（`:126-131` 在"默认精灵面板 ↔ 加成面板"两块之间互换显隐，**不动存档**） | **人称「加成」** |

- **`Item` 的证据**：`Scripts/MVC/Controller/Panel/PetBagController.cs:185 TogglePetItemPanel()` → `buttonView.TogglePetItemPanel()`；View 侧字段 `PetBagView.cs:8 [SerializeField] private GameObject itemPanelObject` ⇒ **背包内嵌一个道具子面板**，由这个钮开合 ⇒ 九件事表（§4）**没有收它**，因为它是"开另一个面板的开关"而不是改存档的操作。

⚠️ **两处对初版的更正**（回写 `docs/view/panel/view-panels-pet.md §4.1`）：
1. **`Follow` 有绑定，不是装饰钮**：`Prefabs/Pet Bag Button Group.prefab:1316-1317  m_MethodName: SetPetAnim` ⇒ 它 = 人称「动画」钮（`PetBagController.cs:121-124`）。
   初版【实测】`grep -rn "Follow" Assets/Scripts/MVC/View/Panel/ …/Controller/Panel/ …/Resources/Panels/PetBag/**` **无命中** ⇒ 误判"装饰/未接线"。**根因**：绑定住在 prefab 的 `m_MethodName` 里，**不在**脚本字符串里。
   （`Player.instance.follower` 是牧场 `Animal`（`PlayerController.cs:169-178`）这条事实**仍成立**，但与这颗钮**无关**。）
2. **`Item` 以活跃 prefab 为准**：嵌套 prefab 自带 `OpenPetStoragePanel`（= 与 `Storage` 钮**重复**），在 `Resources/Panels/PetBag/Panel.prefab:5325` 被 override 成 `TogglePetItemPanel` ⇒ **只有覆盖后的活跃 prefab 才是真值**（与 §1.2"序列化覆盖"同族：`m_Modification` 覆盖优先）。

---

## 2. 数据层：面板看的到底是哪个数组

### 2.1 四个 mode 各自的"背包"

【源码】三份**逐字同构**的 switch（这是本族最大的重复）：

| 复制点 | `Normal` | `YiTeRogue` | `PVP` | `_`（Dictionary/Elite/Mod） |
|---|---|---|---|---|
| `PetBagPanel.cs:221-230` | `Player.instance.petBag` | `YiTeRogueData.instance.petBag` | `selectController?.GetPetStorage().ToArray()` | `selectController?.GetPetSelections()` |
| `PetBagModel.cs:15-24` | `Player.instance.gameData.petBag` | 同上 | `selectModel.storage.ToArray()` | `selectModel.selections` |
| `PetBagController.cs:41-50` | 同上 | 同上 | 同上 | 同上 |

⇒ 【实测】三个"背包"是**同一个数组**：`Player.cs:14-18` 的 `petBag { get => gameData.petBag; set => gameData.petBag = value; }` 只是转发 ⇒ 两种写法混用不会出错，但**读代码的人无法看出它是同一个**（§8 **A5**）。
⇒ ⚠️ **第四个 arm（`_`）返回的是"当前这一页的 6 格"，不是全 storage** ⇒ 同一函数在四个 mode 下返回**三种不同长度**（12 / 全 storage / 6）。§8 **A4** 的错位就从这里来。

### 2.2 12 格 = 常量 + 三处 `Array.Resize`

| 事实 | 证据 |
|---|---|
| `PetInfo.PET_BAG_SIZE = 12` | 【源码】`Scripts/MVC/Model/Basic/Pet/PetInfo.cs:9` |
| 存档字段本体就是定长数组 `public Pet[] petBag = new Pet[12]` | `Scripts/System/Data/GameData.cs:45`（同文件 `:90` 重置时再 new 一次） |
| 启动时兜底补长 | `Scripts/System/GameManager.cs:104-106` |
| **卸载 Mod 时背包会被压缩前移** | `Scripts/System/SaveSystem.cs:372-380`：`Where(非 mod)` → `ToArray()` → `Array.Resize(…, 12)` |
| 满 12 只后新宠进仓库 | `Pet.cs:148-157 Pet.Add`：`IndexOf(null) == -1 ⇒ petStorage.Add(pet)` |

⇒ ⚠️ `Player.petBagCursor`（`Player.cs:19`）**在上述压缩前后没有任何调整** ⇒ 【推断】卸 Mod 后"当前出战位"可能指向另一只宠（§8 **A12** 一并登记）。

### 2.3 仓库（`petStorage`）是一个**筛选视图**，不是第三个数组

【源码】`PetStoragePanel.cs:44-70`：先 `Player.instance.gameData.petStorage.Where(x => x != null)`，再按 mode 三分：

```
Normal =>  !IsMod(id) && !record.elite      // 普通仓库
Mod    =>   IsMod(id) && !record.elite      // Mod 仓库
Elite  =>   record.elite                    // 精英（收藏）仓库
```

⇒ **"精英仓库"不是容器，是一个存档标记位** `record.GetRecord("elite", false)`（写入见 `PetStorageModel.cs:75-107`）；同一只宠在三个页签里**只会出现一个**（互斥谓词），删掉标记即"搬家"。
⇒ 图鉴/仓库/PVP 三处都用 `PetInfo.IsMod(id)` 分流（`PetStoragePanel.cs:64-66`），**Mod 判定 = id 段**（域线 D7 已认领 `IsMod`）。

---

## 3. 网格机器：`SelectModel<T>` + `ISelectableArray<T>` + `IFilter<T>`

【实测】背包网格的序列化配置：`Resources/Panels/PetBag/Prefabs/Pet Bag Storage.prefab:419-421` ⇒ **`selectCount: 1`、`capacity: 6`、`pageMode: 0`**。
⇒ 12 格宠 = **2 页 × 6 格**，且**单选**；`Pet Team.prefab:1206-1207` = `capacity: 1`（队伍页签只选 1 格）、`Pet Detail.prefab` 里两套网格 = `capacity: 8` 与 `capacity: 6`。

| 机制 | 上游 | 关键点 |
|---|---|---|
| 每页取哪些 | `Scripts/MVC/Model/Utility/SelectModel.cs:52-56 SetPage` → `:58-70 PageFilter/GetResultStorageIndex` | `NewPage` ⇒ `page * selectableArray.capacity + i`；`Indent` ⇒ `page + i`（滑窗式，**背包不用**） |
| 末尾页数 | `:42-50 GetLastPage` | `NewPage` ⇒ `(count - 1) / capacity`（**注意 `-1`**：满页时末尾页 = 页内第一格的页号） |
| 排序先于筛选 | `:16-17`：`sortedStorage => filter.Sort(storage)`、`resultStorage => filter.Filter(sortedStorage)` | 【源码】`IFilter.cs:44-56`：排序 = `OrderBy/OrderByDescending(sorter)`，**sorter 为 null 时保持原序** |
| 选中状态 | `IClass/ISelectableArray.cs:99-115 Select` | `selectCount == 1` 时：重复点同格 ⇒ **直接 return**（不取消选择！）；否则清掉旧的再点新的 |
| 游标 | `SelectModel.cs:25-26`：`cursor => currentSelectIndex`、`globalCursor => page * capacity + x` | ⚠️ 这里用的是**序列化字段 `capacity`**，分页用的是 **`selectableArray.capacity`** ⇒ 两套（§8 **A7**） |
| 换页丢选中 | `PetSelectModel.cs:13-17 SetSelections`（`Array.Resize(ref selections, capacity)`）→ `SelectModel.cs:94-97`（`keepSelected = selections == this.selections`，新建数组恒 false） | ⇒ 换页 ⇒ 选中清空 ⇒ `PetSelectController.cs:80-105` 的 `Prev/Next/SetPage` 全部补一句 `if (cursor.Length <= 0) Select(0)` ⇒ **自动选中本页第一格** |
| 删格后翻页 | `SelectModel.cs:137-141 GetRefreshPageAfterRemoved` | `isIsolated = count % capacity == 1` ⇒ "本页只剩 1 格"时往前退一页 |
| 拖拽换位 | `PetSelectModel.cs:19-37`（`StartDrag/EndDrag/Drop`）+ `PetSelectController.cs:141-155` | `EndDrag` 把 `anchoredPosition` **复位**（拖不成的视觉回弹）；`Drop` 任一格为 null ⇒ **什么都不做**（不能拖进空格！） |

⇒ **"拖拽换位"与"点选换位"是两套并存**：拖拽走 `PetSelectModel.Drop`（`:31-37`，要求两端非 null），
点击链路走 `PetBagController.SetPetDrop` → `buttonModel.SetPetDrop(dropIndex)` → `PetBagModel.cs:51-54`（用 `selectModel.startDragIndex`）。
⇒ 网格上任何一次"改位置"最终都落到 `Helper/HelperCollections.cs:159-163 Swap` / `:199-207 MoveRangeTo`（**手写、无越界检查**）。

---

## 4. 操作层：面板上的九件事【源码逐条】

| # | 按钮/操作 | Controller → Model | 生效范围 | 写盘？ | 备注（门的形状） |
|---|---|---|---|---|---|
| 1 | **换位**（拖/点） | `PetBagController.cs:79-85 SetPetDrop` → `PetBagModel.cs:51-54` → `:31-49 SetPetSwap` | 页内下标 + `page * selectionCapacity` ⇒ **换算成全局下标** | `Normal/YiTeRogue` 才 `SaveData`（`:42`） | 非 Normal 走 `selectModel.Swap`（只动 storage 顺序，不动数组本体） |
| 2 | **设为首发** | `:87-91 SetPetFirst` → `PetBagModel.cs:56-62` | 与**页内第 0 格**换 | 同上（借道 `SetPetSwap`） | ⚠️ "首发"是**页内第 0 格**，不是全局 0 号位 ⇒ 在第 2 页点"首发"只把该宠挪到第 6 格 |
| 3 | **上阵** | `:93-112 SetPetFight` → `PetBagModel.cs:64-89` | 有空位 ⇒ 与**第一个 null** 换；无空位 ⇒ 弹 `PetSelectHintbox` 选一只换 | ✅（`SetPetTake` 内 `:82`） | 门：`if (!petBag.Take(6).Contains(null)) return false` ⇒ **只看前 6 格**；按钮本身**只在第 2 页可点**（`PetBagController.cs:38` → `PetBagView.cs:10-13`） |
| 4 | **一键换队**（前 6 ↔ 后 6） | `:58-77 SwapPetTeam`（**不经 Model**，Controller 直接改数组） | `Player.instance.petBag` 全 12 | ✅ `:75` | 仅 `Normal`；备用区全空 ⇒ 弹"当前备用背包没有任何精灵"；**硬编码 6** |
| 5 | **恢复体力** | `:114-119 SetPetHeal` → `PetBagModel.cs:91-101` | ⚠️ **只有当前页 `selections`** | 仅 `Normal`（`:99-100`） | 文案却报"你的精灵已完全恢复！"（`PetBagView.cs:25-30`）⇒ **A2** |
| 6 | **满配**（`ToBestPet`，当前**没有按钮**） | `PetBagController.cs:133-142 ToBestPet(Personality)` → `PetBagModel.cs:103-114 SetPetTrain` → `Pet.cs:130-146 ToBestPet` | 当前选中那一只（**若这条链被接上**） | 仅 `Normal`（`:110`） | `GainExp(maxExp)` + `hasEmblem=true` + `AddEVStorage(510)` + `iv=31` + **学会进化链全部技能** ⇒ **A10/A11**（⚠️ 这条链在发行版里**无人调用**） |
| 7 | **入库** | `:170-177 SetPetHome` → `PetBagModel.cs:116-147` | 当前选中；**保护判据看的是本页** | 仅 `Normal`（`:143-144`） | `petStorage.Add(pet)` 后把 `[index+1, stop)` 前移、末格置 null（`:134-135`）⇒ **A3** |
| 8 | **改性格** | `:144-168 SetPetPersonality` → `PersonalityController` 选择 → `ToPersonalityPet` | 选中宠 | `PVP`/`Dictionary` **不写盘**（`:164-166`） | 两个快捷筛选 `-1 ⇒ 性格 ∈ [0,25)`、`-2 ⇒ [25,55)`（`IsInRange` 上界排除，`HelperMath.cs:23-27`）⇒ 【推断】性格值 ≥ 55 的**不在这两档里** |
| 9 | **开仓库** | `:179-183 OpenPetStoragePanel` | —— | 关面板回调 `RefreshPetBag` | 仓库侧操作见 §5 |

**另有三件不是"背包操作"但挂在同一个 Controller 上**：
`SetPetAnim`（`:121-124` 切预览动画模式，**= prefab 上 `Follow` 钮的绑定**，§1.6）· **"锻炼/加成"按钮的实际行为**（`SetPetTrain` `:126-131` = **"默认精灵面板 / 加成面板"两块 UI 互换显隐**，
**不做任何数值修改**；prefab 绑定见 `Assets/Resources/Panels/PetBag/Prefabs/Pet Bag Button Group.prefab:932` ⇒ **A10**）·
`OpenBattleTestPanel`/`TestBattle`（`:190-216` 战斗测试；门 = `Activity.Noob.GetData("battle") != "done"` ⇒ **新手引导没走完不许测**，写盘位：无）。

⚠️ **本表数的是"改存档的九件事"，不是"按钮组上的全部钮"**：§1.6 实测那颗 8 钮里另有几件本表没收 ——
**`Item`** = `PetBagController.cs:185 TogglePetItemPanel()` 开合背包内嵌的道具子面板（**开另一个面板的开关**，不是改存档的操作；活跃 prefab 侧的覆盖见 §1.6），内容表在 C2/T2·5；
**`Follow`（= 人称「动画」）** 与 **`Train`（= 人称「加成」）** = `SetPetAnim` / `SetPetTrain`（§1.6），也只改 UI 显示、**不动存档**。
⚠️ **别照初版误读**：初版把 `Follow` 写成"无绑定 = 装饰钮"（只在脚本目录 grep、漏了 prefab 的 `m_MethodName`）⇒ **已在 §1.6 更正**；初版据 `m_AnchoredPosition` 推的"~~横排网格条 + 下方左详情 + 右侧竖排按钮列~~"**也作废**（中心/自适应锚**不是**屏幕坐标）。
人类实测的版面是**上中下三层**（① 标题层 → ② 内容层：左显示区｜右信息区 = 操作列 + 信息面板 → ③ 队伍区），正本 = `docs/view/panel/petbag/petbag-panel-desc.md`（§1.5 二次校正）。

---

## 5. 仓库面板：取出 / 交换 / 放生 / 收藏

| 操作 | Controller | Model | View 的门 | 备注 |
|---|---|---|---|---|
| **取出（有空位直接拿）** | `PetStorageController.cs:53-67 OnPetTake` | `PetStorageModel.cs:27-43` | —— | 门 = `petBag.Contains(null)` ⇒ **看全 12 格**（与背包侧"上阵"只看前 6 **不同**） |
| **取出（满了要换）** | 同上 `:61-66` | `:45-62 SetPetTake` | `PetStorageView.cs:44-52` 弹"请选择要交换的精灵" | ⚠️ 会先 `demoController.SetPetAnimationActive(false)` 关掉预览动画，成功回调里**没有再开回来**（只在 `onFailCallback` 开，`:66`）⇒ 【推断】取出成功后预览动画停住 |
| **放生** | `:75-84`（二次确认） | `:64-73 SetPetRelease` | `PetStorageView.cs:54-61` "此动作无法复原！" | Model 只判 `IsNormalStorageMode`，**不判 `elite`** ⇒ §8 **A13** |
| **收藏 / 取消收藏** | `:86-98` | `:75-90` / `:92-107` | `PetStorageView.cs:22-25` 按 `record.elite` 三选一灰化 | 收藏位 = 存档 `record` 的一个 bool 键，**不是容器**（§2.3） |
| **进入时排序** | `PetStoragePanel.cs:28` | —— | —— | `Sort(x => (x == null) ? DateTime.MinValue : x.basic.getPetDate)`（默认 `desc=true` ⇒ **最新获得在前**）；⚠️ `:61` 已经 `Where(x => x != null)` ⇒ null 那支是**死分支** |
| **刷新时保页号** | `PetStorageController.cs:44-51` | `PetStorageModel.cs:17-20` | —— | 非 PVP 用 `GetRefreshPageAfterRemoved()`（§3 末行）；PVP 用当前页 |

---

## 6. 筛选与排序：三个筛选**互斥**，且第三个是表达式 DSL

【源码】接线在 `Scripts/MVC/Controller/Pet/Storage/PetFilterController.cs:21-52`：**每个筛选器触发时，把另两个 reset**。

| 筛选 | 实现 | 谓词 | 备注 |
|---|---|---|---|
| **属性（元素）** | `Model/Pet/Storage/PetElementFilterModel.cs:47-56` | `x.element == element \|\| (x.subElement == element && x.subElement != 普通)` | 元素多于 20 个才分页（`:8` `elementNumInOnePage = 20`）；`Element.全部` ⇒ 恒真 |
| **星级** | `Controller/Pet/Storage/PetStarFilterController.cs:19-22` | `star <= 0 \|\| pet.info.star.IsInRange(star, star + 1)` ⇒ **恰好 N 星** | ⚠️ 视觉是"点亮前 N 颗星"（`:39-43`），谓词却是 `== N` 不是 `>= N` ⇒ 容易读错（§9 手测项） |
| **名字 / ID / 表达式** | `Model/Pet/Storage/PetNameFilterModel.cs:8-33` + 基类 `Model/Utility/FilterModel.cs:14-33` | 输入纯数字 ⇒ `x.id == int`；含 `(`…`)` ⇒ **`Parser.ParseConditionFilter` DSL**；否则 `x.name.Contains(input)` | DSL 的取值面 = `pet.TryGetPetIdentifier(id, out var value)` 兜底 `Identifier.GetNumIdentifier(id)` ⇒ **与域线 D7 的 identifier 家族是同一套**（`docs/domain/domain-info.md`） |

| 排序 | 实现 | 备注 |
|---|---|---|
| 两种类型 | `Model/Pet/Storage/PetSortingModel.cs:14-23` | `Storage` ⇒ `(PetSortingOptions)(dropdown.value + 1)`；`Dict` ⇒ `((value + 1) * Mathf.Sign(value - 2))` |
| 五个键 | `:32-46 GetSorter` | `NegativeId=-2 / PositiveId=-1 / None=0 / Date=1 / Level=2 / Star=3`（`:49-56`）；ID 两支用 `(id>0) ? (int.MaxValue - id, -subId) : …` 的**元组把 Mod 宠（负 id）分组排到另一端** |
| 兜底 | `:34-35 default:` 落 `PositiveId` | 非法枚举 ⇒ 静默变"正序 ID"（与秘技分析报告 §2 的兜底臂同味道） |

⇒ **`Reset()` 漏了星级**：`PetFilterController.cs:60-64` 只 `ResetElementController() + ResetNameController()` ⇒ §8 **A8**。

---

## 7. 呈现层：一格头像的三层素材 + 开面板的预取

### 7.1 一格（`PetSelectBlockView`，195 行）

| 层 | 素材来源 | 证据 |
|---|---|---|
| 头像 | `currentPet.ui.icon` ⇒ `PetUISystem.GetPetIcon(petId)` ⇒ `GetLocalAddressables<Sprite>("Pets/icon/{id}", IsMod)` | `View/Pet/Basic/Button/PetSelectBlockView.cs:126-130` · `Model/Basic/Pet/System/PetUISystem.cs:7-10` |
| **头像框** | `record.GetRecord("iconFrame", 0)` ⇒ `Item.GetItemInfo(itemId)?.icon`；尺寸偏移 `record["iconFrameSizeOffset"]`，公式 `initButtonSize + offset / 90 * initButtonSize` | `:86-91` |
| **遮罩** | `record.GetRecord("iconMask", frameId)`（**默认回退成框 id**）；偏移除数是 **80** 不是 90 | `:104-124`（`:119` `iconSizeOffset / 80`） |
| 等级/名字/血量条 | `pet.level` / `pet.name`（null 格显示 **"未知"**）/ `currentStatus.hp` vs `normalStatus.hp` 百分比宽 | `:132-157`（`:156` 条宽 = `initHpBarLength * currentHp / normalHp` ⇒ **`normalHp == 0` 时 NaN**） |
| 性别 | `genderObjects[i].SetActive(showGender && i == currentPet.basic.gender)` | `:164-173` |
| 角标 | `SetGetMark`（图鉴"已获得"）`:59-62` · `SetBanPick(ban, pick)`（PVP 禁选/首发）`:181-194` | 后者吃 `RoomManager` 的 ban/pick 列表 ⇒ **PVP 线（T2·7）** |

⚠️ **两层素材（框/遮罩）完全住在 `Item` 上** ⇒ 这一格的渲染依赖 **`totalk.md` T2·5「Item 线」**；图鉴与 PVP 复用时同样依赖。

> ⚠️ **本表是上游事实；我们的目标版式与它有一处差异（人类 2026-10-17 二轮实测拍板）**：
> 人类给出的**队伍格**版式 = **头像构成背景图**（铺满整格）+ **底部信息条：等级 / 血条** —— 正本 `docs/view/panel/petbag/petbag-panel-desc.md:37-40`（人类本人补写）。
> ⇒ 我们**不画**名字（上游 `:132-157` 那一行的 `pet.name`；退为整格 `title`），血条从"名字那行旁边的小条"改为**占满信息条宽度的弹性条**。
> 归属与落地 = **View 线**（C1 `docs/view/panel/view-panels-pet.md §4.1 更正 5` + `docs/view/panel/petbag-impl.md §4/§12.3`），本报告只登记"与上游的差"。

### 7.2 打开面板 = 一次动画预取 + 一个超时兜底

【源码】`PetBagPanel.cs:48` 用协程包住**整个 `InitMode` 回调**：`:72-102`

- 逐只 `pet.ui.PreloadPetAnimAsync(...)` ⇒ `PetUISystem.cs:67-70` ⇒ `ResourceManager.GetPetAnimAssetBundleAsync`；
- 加载屏文案 **"正在加载精灵背包 (n/12)"**（`:80/95`）+ 进度 = 各宠进度**算术平均**（`:94`）；
- ⚠️ `timeout = 5`（`:78`）**秒后不管加载完没完都放行**（`:92-98` while 条件里 `timeout > 0`）；
- ⚠️ `ListHelper.IsNullOrEmpty(preloadPetBag)` ⇒ **`yield break` 且不回调 `onFinishCallback`**（`:74-76`）⇒ 【推断】PVP 房间在 `RoomManager.cs:96` 灌数据**之前**打开背包（storage 为空 List ⇒ `!list.Any()` 为真）⇒ **`InitMode` 整段不跑**（含 §8 **A1** 那次写盘）。

### 7.3 预览（3D/动画台）与页签

- 子预制 19 件（【实测】`Resources/Panels/PetBag/Prefabs/`）：Pet Data / Detail / Status / Team / Demo / Feature / Item / Current Skill / Backup Skill / Swap Skill / Special Skill / Resistance / Skin / Personality / Buff / Battle Test / Bag Storage / Bag Button Group / Pet Anim Camera；
- `PetDetail.prefab` 里有**两块网格**（`capacity: 8` 与 `capacity: 6`，`:2537-2538`/`:3708-3709`）⇒ 【推断】"详情"页内嵌了一个 8 格容器（技能/道具选择）；
- 动画类型枚举 **17 值**（`PetUISystem.cs:90-109`：`None/Idle/Dying/Win/Lose/CaptureSuccess/CaptureFail/Hurt/Evade/Physic/Special/Property/Super/SecondSuper/BeCriticalStruck/Morph/Present`）⇒ 与引擎 E7 的 views 侧同源；
- ⚠️ **上游是 Unity 3D 动画台（17 值），我们只有原版 Flash**：`swf/fight/{swfId}.swf` 的 timeline 标签是**另一套词表**（`待机/物理攻击/属性攻击/特殊攻击/被打/被暴击/胜利/失败/闪避/必杀/合体攻击/空`，【实测】`getAvailableStates()`）。本代显示区取**这一套**里有的那几个（`待机` 默认循环），**不假装**有 Unity 17 值动画（`docs/view/panel/view-panels-pet.md §4.1 更正 3`）；跨参考价 = vendored `vendor/seer2-pet-animator`（同 `petContainer.swf` 同法）；
- 数值页签的图标路径直接写死成 **`Panels/PetBag/Sprites/petValue/{属性名}`**（`:72-75`）⇒ 面板目录同时是**资源命名空间**（`docs/view/ui-handoff.md` 的素材清单口径要收这一条）。

---

## 8. 怪癖 / bug 登记（**声明**；目标行为另议）

> 政策 = **人类决议 ②**：本节只写"上游怎么写 + 可观察后果"；目标行为未拍的指向未决项（`totalk.md` T2 / View **C1**），**不记死账**。
> ⚠️ 与 **V2**（数据错字 ⇒ **照搬**）分工：本节**全是代码逻辑类**（判断写反 / 范围搞错 / 门只在一层）⇒ **声明 + 不照搬**。

| # | 上游怎么写 | 可观察后果 | 类型 | 我们怎么写 |
|---|---|---|---|---|
| **A1** | `Init()` 无条件 `SetSkillRule(settingsData.rule)`（`PetBagPanel.cs:68`），而 `SetSkillRule` 末尾 `SaveSystem.SaveData()`（`:244-250`） | **打开一次背包 = 写一次存档**；四路复用（背包/PVP/图鉴/肉鸽）**全中** | 代码逻辑（副作用放错层） | 目标：打开面板**不写盘**；规则变更才写 ⇒ 归 View C1 + **T2·4 编排线**（写盘 sink = `docs/runtime/runtime-components-design.md` **R4**） |
| **A2** | "恢复体力"遍历 `selectModel.selections`（`PetBagModel.cs:91-101`）= **当前页 6 格**；文案写"你的精灵已完全恢复！"（`PetBagView.cs:29`）；对照：地图角落的 `Heal()` 遍历 `player.petBag` **全 12 格**（`Model/Map/Components/MapPetCornerModel.cs:15-23`） | 第 2 页的伤宠**没被恢复**，但弹窗说"完全恢复" | **代码逻辑 bug**（范围搞错） | 目标：恢复**整个背包**（与地图角落同一谓词） |
| **A3** | "入库"的保护判据是 `selectModel.selections`（本页 + **当前筛选后**）的计数（`PetBagModel.cs:118-120`），拒绝条件 = `count == 0 \|\| (count == 1 && page == 0)` | 筛选/翻页状态下 **该放行却被拦**（明明 12 只宠，筛完本页只剩 1 只 ⇒ 报"你至少需要一只精灵保护自己"） | **代码逻辑 bug**（判据取错集合） | 目标：判据 = **真实宠袋非空计数**；文案随之改 |
| **A4** | `public Pet pet => petBag?[selectController.GetCursor()[0]]`（`PetBagPanel.cs:15`）—— 用**页内游标**去索引**全长数组**（Normal 下 12） | 【实测】当前**没有任何调用方**读 `petBagPanel.pet`（grep 空）⇒ 未爆的地雷：第 2 页读到的会是第 1 页那只 | **代码逻辑 bug**（同一族里 `globalCursor` 存在却没用） | 目标：**删掉这个属性**（无消费者），或改成走 `globalCursor`；不许照搬 |
| **A5** | 同一段 `mode switch` **抄了三遍**（`PetBagPanel.cs:221-230` / `PetBagModel.cs:15-24` / `PetBagController.cs:41-50`），且第四 arm 语义不同（12 / storage / 6） | 改一处忘改另两处 ⇒ 面板与按钮组读到**不同集合**，表现为"点了没反应/换位错位" | 脆弱结构（三处真值） | 目标：**一个 `PetBagSource` 选择器**注入一次，三处共享（同族先例 = `docs/arch-code.md §3.1` 的"单一出口"） |
| **A6** | `ISelectableArray.Lock/UnLock` 写成 `if (id <= locks.Length) continue;`（`IClass/ISelectableArray.cs:59-77`）⇒ **合法下标全部被跳过**，只有越界下标会进 `locks[id] = true`（那正是越界） | 【实测】`Lock/UnLock` **全仓零调用方** ⇒ 死代码；一旦启用即 `IndexOutOfRangeException` | **代码逻辑 bug**（判断写反，应为 `id >= length`） | 目标：**要么删干净，要么修成"锁定格不可选"**（PVP 禁选/房间锁位场景本来就缺这一层） |
| **A7** | 两套 `capacity`：序列化字段 `SelectModel.cs:13`（用于 `Select/Remove/Replace/Swap` 的界校验与 `globalCursor :26`）vs `ISelectableArray.capacity`（`SetArray :41` 取 `Mathf.Max(array.Length, capacity)`，**只增不减**；分页 `GetResultStorageIndex :66` 用它） | 只要塞进来的数组比面板格数长 ⇒ 分页与游标**各算各的**；当前**只靠** `PetSelectModel.SetSelections :15` 的 `Array.Resize(…, capacity)` 兜住 | 脆弱结构 | 目标：**一个容量真值**；`SetSelections` 不许静默截断（截断即报错/列人手测项） |
| **A8** | `PetFilterController.Reset()` 只重置元素 + 名字，**没重置星级**（`Controller/Pet/Storage/PetFilterController.cs:60-64`；对照 `:43-51` 三个筛选互为 reset） | 点"重置"后星级筛选**仍生效**，列表看起来"少了宠" | **代码逻辑 bug**（漏一项） | 目标：`Reset()` = 三项全清 |
| **A9** | 预取协程两处旁路：① `timeout = 5` 秒后**不检查 done** 就放行（`PetBagPanel.cs:78/92-98`）；② `IsNullOrEmpty(preloadPetBag)` ⇒ `yield break`，**`onFinishCallback` 不调用**（`:74-76`） | ① 慢盘首开可能带着**未就绪动画**进面板；② PVP 房间在 `RoomManager.cs:96` 之前开面板 ⇒ `InitMode` 整段跳过 | 代码逻辑（超时当完成 / 空集当异常） | 目标：超时 ⇒ 记为"部分就绪"并可重跑；空集 ⇒ **仍要跑 Init** |
| **A10** | **"锻炼"这条链在发行版里根本没接上**：真做满配的 `Pet.ToBestPet`（`Pet.cs:130-146`：`GainExp(maxExp)` + `hasEmblem=true` + `AddEVStorage(510)` + `iv=31` + **`info.skills.skillList` 全部未学者逐条 `LearnNewSkill`**）只被 `PetBagController.cs:133-142 ToBestPet(Personality)` 调用，而后者**既没被 prefab 绑定、也没被 `onSelectPersonalityEvent +=` 订阅**【实测：全仓 grep `ToBestPet` 只剩定义处】；prefab 上那颗按钮绑的是同名的 `SetPetTrain`（`:126-131`，只换 UI 显隐） | ① 玩家点"锻炼"**不会**得到满配宠，"锻炼成功！请自行分配学习力"弹窗（`PetBagView.cs:32-37`）**永远不弹**；② `skillList` 是进化链全集 ⇒ **含秘技**，一旦接上就是无条件全学。⚠️ 同一函数在**PVP 里是活的**：`Scene Specific/Room/RoomManager.cs:65-94` 对出战宠的**副本**逐个 `Pet.ToBestPet(副本, iv)` ⇒ 这是秘技的**第 7 条学习入口**（已回写 `docs/view/panel/petbag/restart-secret-skill-learning.md §5` 表第 7 行） | 事实修正 + 命名撞车（两个 `SetPetTrain` 语义不同） | 目标：面板**不留死链**（要么接上要么删）；`ToBestPet` 归到"内容表/调试注入"面，PVP 侧改由**规则面**声明"出战宠满配"；产品口径 = **待定**（决议 ② 不适用） |
| **A11** | `ToBestPet` 若把宠练到进化：内部 `GainExp` → `Evolve()` 的**写回目标硬编码**成 `Player.instance.petBag`（`Pet.cs:549/589/603-604`），而 `RoomManager.cs:87` 在调用前已把副本 `record` 换成空的 `new PetRecord()` ⇒ **`evolveBan` 标记被抹掉** | 【实测】PVP 路径**恰好没错**：`ToBestPet` 返回进化体、`RoomManager.cs:94` 用的是返回值 ⇒ 房间面板与出战都是进化体。但**两条副作用是真的**：① `Evolve`/`GainExp` 各自 `SaveSystem.SaveData()`（`Pet.cs:552/564`）⇒ **准备一场 PVP = 写一次真实存档**（A1 同族，缺 R4 接缝）；② `RoomManager.cs:87` 先把副本 `record` 整块换新 ⇒ **锁进化标记失效**（详见 **A16**）。若走那条死链（Controller 丢弃返回值、`RefreshPetBag` 重读原数组），则表现为"面板形态不变、进化体丢在废弃对象上" | **代码逻辑 bug**（写回目标硬编码） | 目标：**写回"来源集合"本身**（注入 bag 面），不许硬编码 `Player.instance.petBag`（决议 ③ 的接缝纪律）；`record` 的重置要**逐键**而非整块换新 |
| **A12** | 队规模硬编码三处各一份：`PetBagController.cs:63/69-74`（`TakeLast(6)` + 6 次循环）、`PetBagModel.cs:69`（`Take(6)`）、`PetTeamController.cs:20`（PVP 从房间属性 `count` 读，否则 6） | 改队伍规模要动三处；且 `Player.petBagCursor` 在 `SaveSystem.cs:372-380` 压缩背包后**不调整** ⇒ 【推断】卸 Mod 后出战位可能指向别的宠 | 脆弱结构 + 待判 | 目标：**一个队伍规模常量**（`PET_BAG_SIZE` 已在 `PetInfo.cs:9`，队规模却没有）；`petBagCursor` 随压缩重算 ⇒ 列人手测（§9） |
| **A13** | 放生/收藏的门**只在 View 的可交互性**（`PetStorageView.cs:22-25` 按 `record.elite` 灰化），Model `SetPetRelease` 只判 `IsNormalStorageMode`（`PetStorageModel.cs:64-73`） | 绕过 UI（Mod/调试/自动化）即可**放生收藏中的宠** | 分层缺陷 | 目标：**规则回 Model**（View 只负责灰化），与 D 族"面板零算数"口径一致（`docs/view/ui-handoff.md`） |
| **A14** | `PetSortingModel.GetSortingOptions` 用 `(dropdown.value + 1) * Mathf.Sign(value - 2)`（`:20`）；Unity `Mathf.Sign(0f) == 1` ⇒ 中间项不自洽；`GetSorter` 的 `default:` 落 `PositiveId`（`:34-35`） | 下拉越界 ⇒ **静默变"正序 ID"**（不报错、不提示） | 脆弱结构（同 V2 的"静默兜底"家族） | 目标：显式 `None` ⇒ 保持原序（`IFilter.cs:49-50` 已支持 `sorter == null`），非法值 ⇒ 声明为**人手测/内容表确认项** |
| **A15** | `PetSelectBlockView.SetHp`：`initHpBarLength * currentHp / normalHp`（`:156`） | `normalStatus.hp == 0` 的宠（异常数据/退化边界）⇒ **NaN 宽度**的条 | 待判（数据可否为 0） | 目标：分母 0 ⇒ 条宽 0；列为**等人手测确认**的具体项 |
| **A16** | PVP 赛前准备把每只出战宠的 `record` **整块换新**：`RoomManager.cs:87` `x.record = new PetRecord()`（`PetRecord.cs:12-14` = 空 `recordDict` + 胜负计数 0） | 副本上**所有 record 键一起丢**：`evolveBan`（锁进化 = 道具 **20002 神秘果实** 写入，`Assets/Resources/Data/Items/effect.csv:153` `type=record[evolveBan]&op=SET&value=1`；描述"压制体内的进化能量…仍可以透过其他方式进化"）⇒ **一进房间就强制进化**；`elite`（收藏标记）⇒ 仓库/面板的收藏状态在 PVP 里看不见；`iconFrame`/`iconMask`/`iconSizeOffset` ⇒ **§7 的三层头像素材在 PVP 面板里全平**（`PetSelectBlockView.cs:86/104-124` 读不到键）；`winFightNum`/`loseFightNum` ⇒ 依赖胜场数的秘技条件（`docs/view/panel/petbag/restart-secret-skill-learning.md §4`）在 PVP 里从 0 起算 | **代码逻辑 bug**（用"清空"表达"重置若干字段"） | 目标：**逐键重置**（要洗什么写什么），或给 PVP 一个显式的"出战快照"结构；`record` 的键清单归 **Save 线**（`docs/save/save-xml-spec.md`）+ **D7**，本文件只登记后果 |

---

## 9. 待人手测确认的具体项（不许记死账 —— `AGENTS.md §1.1` / 决议 ⑦）

1. **A2**：背包两页各有受伤宠，只开面板点"恢复体力" ⇒ 第 2 页的 HP 有没有变？（预期：没变 = 上游行为）
2. **A3**：先按属性筛一只宠出来，再点"入库" ⇒ 有没有被"你至少需要一只精灵保护自己"误拦？
3. **星级筛选语义**：点亮 3 颗星 ⇒ 列表里是"**恰好 3 星**"还是"**≥3 星**"？（谓词是 `IsInRange(3, 4)` ⇒ 恰好 3）
4. **A8**：叠加元素 + 星级筛选，点"重置" ⇒ 星级按钮变灰但列表**是否仍被筛掉**？
5. **表达式筛选**：输入 `(level>50)` 之类括号条件 ⇒ 能不能用、报错时表现是什么？（DSL 在 `Parser.ParseConditionFilter`）
6. **A1**：只打开背包、什么都不点 ⇒ 存档文件的 mtime/内容有没有变？（PVP/图鉴/肉鸽三路各测一次）
7. **A10**：在背包里选中一只**未满 100 级、未学全技能**的宠，点那颗"锻炼/加成"按钮 ⇒ 有没有出现"锻炼成功！请自行分配学习力"弹窗、这只宠的技能数/学习力/性格有没有变？（预期：**数值什么都没变**；面板只是在**「默认精灵面板」与「加成面板」之间切换显隐**。人类实测已确认此读数 —— 见 `docs/view/panel/petbag/petbag-panel-desc.md`）
8. **A11/A16**：给一只宠挂上**道具 20002 神秘果实**（锁进化），组一间 PVP 房间并把它带上出战 ⇒ 在房间面板里它**有没有直接变成进化形态**？头像框/收藏角标还在不在？（预期：上游行为 = 都丢了）
9. **A12**：装一个 Mod 宠进背包 → 卸载该 Mod → 出战位（`petBagCursor`）指向的宠还是不是原来那只？
10. **A9**：冷启动（动画 AssetBundle 未缓存）第一次开背包 ⇒ 有没有出现"面板已可点但头像是空的"？
11. **首发语义**：在第 2 页点"设为首发" ⇒ 这只宠是变成**全局第 0 位**还是**第 6 位**？（代码：与页内第 0 格换位）
12. **A15**：背包里有没有 `normalStatus.hp == 0` 的宠（退化/异常数据）？若有，它的血条是不是整条消失或画满？
13. **`Follow`（人称「动画」）钮**：点它 ⇒ 精灵预览有没有切到"动画模式"（`PetBagController.SetPetAnim` → `demoController.TogglePetAnimationMode()`）？（⚠️ 初版误判它"无绑定 = 装饰"，见 §1.6 更正 1；此钮在**真游戏**里应是**活的**）— 我们的实现：`idleStage.js` 真实切 `swf/fight` 的演出状态（`待机→被打/胜利/必杀`）；上游的"动画模式"若含**动作幅度/镜头**等 Flash 没有的维度，属**上游 17 值 3D 动画**，本代不做（C1 §4.1 更正 3）。

---

## 10. 对移植的影响（只指路，不在此定案）

- **界面与面板族** = **`docs/view/panel/view-panels-pet.md`（C1，2026-10-17 已成文 · 待人类评审）**。本文件 §1/§1.5/§1.6/§4/§7 是它的**证据底座**；
  目标行为（含 **A1–A16 每一条的不照搬写法**，在 C1 **§2.2 不照搬清单**）→ 去那一份看，**本文件不改口**。
  C1 自己的待拍板 **VP1–VP8 已于 2026-10-17 由人类全部拍板**（决议表见 C1 **§11**；两套编号 VP\<n\> 与本文件的 A\<n\> 别混）。
  面板栈 / `OpenPanel` / `SetPanelIdentifier` / `onCloseEvent` 的真值**不在此重复**，见 `docs/view/mech/view-panel-stack.md`（A2）。
- **"背包"这个词的归属** = 状态面归 **Save 线**（`petBag`/`petStorage`/`record.elite` 见 `docs/save/save-design.md` 与 `docs/save/save-xml-spec.md`），
  规则面（12 格、队 6、换位合法性）**已由 C1 认领**（`docs/view/panel/view-panels-pet.md §5.1/§5.2/§5.3`：源规则 **S1–S5** + 网格不变量 **G1–G8** + 常量表），
  落在 **L1 `game/logic/petbag/`** 而非 `game/core/**`（判据 = `docs/arch-code.md §3.1`）。⇒ 上面那句"没有任何 design 认领"**已过期**。
- **写盘与弹窗** = `docs/runtime/runtime-components-design.md` **R4/R5**（决议 ③）：A1「开面板即写盘」在目标设计里是**接缝缺失**的表现，不是要照搬的行为。
- **框 / 遮罩 / 角标素材** 依赖 `Item` ⇒ **`totalk.md` T2·5**；**ban/pick** 依赖房间 ⇒ **T2·7**；
  **`YiTeRogueData.instance.petBag`** 分支 ⇒ **T2·9**（该模式至今只有引擎侧围栏，没有功能文档）。
- **identifier / DSL**（名字筛选的括号那一支）= 域线 **D7** `docs/domain/domain-info.md`；`pet.info.star` / `element` / `subElement` = **D6** `docs/domain/domain-pet.md`。
- **`Pet.Add` 满 12 进仓库**（`Pet.cs:148-157`）与引擎 **E6 §S13 ⑥** 的围栏是同一条副作用（注入的 item/pet 面），移植时**不许**直调静态。
- **回写别处（已执行）**：A10 使 `docs/view/panel/petbag/restart-secret-skill-learning.md §5` 的"六条学习入口"**不完整** ⇒
  该表已补第 **7** 行（**PVP 赛前满配** = `RoomManager.cs:65-94` 对出战宠**副本** `Pet.ToBestPet`），
  该文件 §0 / §5 标题 / §5 结论里的计数同步改成**七条**，并在 §5 表下方留了一段勘误说明（记录"面板锻炼按钮实为死链"）。
- ⚠️ **A16 的下游**：`record` 的**键清单**（`evolveBan` / `elite` / `iconFrame` / `iconMask` / `winFightNum`…）目前没有一份文档逐键登记过 ⇒
  归 **Save 线**（`docs/save/save-xml-spec.md`）与 **D7**（`docs/domain/domain-info.md`）；道具 **20002 神秘果实** 是 `evolveBan` 的**唯一写入方**（`Assets/Resources/Data/Items/effect.csv:153`）⇒ 属 **`totalk.md` T2·5 Item 线**（未立）。
- ⚠️ **口径修正（连带影响 `totalk.md` T2）**：本文件的 §1.1 证明**上游第一方代码不止 `Assets/Scripts/` 的 69,879 行** ——
  `Assets/Resources/**` 另有 **47 文件 / 3,257 行**（面板自带脚本 2,881 + 小游戏 237 + `RobotView` 139），
  其中**面板脚本这一族从来没有进过 T2 的行数表**。T2 的"档 2/档 3"判据不受影响（这些面板同样**没有 design**），但**总数要加一句注**。
