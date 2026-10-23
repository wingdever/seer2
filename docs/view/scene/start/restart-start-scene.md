# 代码分析：重启的上游是怎么实现"开始场景 / 选择角色场景"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；现住**所在场景的子目录** `docs/view/scene/start/`，落位口径见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C# + Unity 场景资产**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、场景/预制里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **B5 设计 `docs/view/scene/start/view-scene-start-design.md`**（本文件的下游 · 已写）· B5 配对 impl `docs/view/scene/start/view-scene-start-impl.md` ·
> A1 `docs/view/mech/view-shell.md`（舞台 / 参考分辨率 / 加载层）· A2 `docs/view/mech/view-panel-stack.md`（面板栈 / `Hintbox`）· A3 `docs/view/mech/view-overlays.md`（浮层原语）·
> **编排线** `docs/orchestration/orchestration-design.md`（`SceneLoader` / `GameManager` 6 状态机 / `Player` 会话单例 —— 本报告 §4 只记"这两场景怎么调它"，宿主形状以那份为准）·
> **Save 线** `docs/save/save-design.md`（`GameData` XML / 3 槽 `save0/1/2.xml` / 初始档生成）· 域线 D7 `docs/domain/domain-info.md`（表）· 台账 `totalk.md` **T2·6**（登录 / 建号 / 改名 / 玩家档案）。
> **路径口径**：脚本路径相对 `projects/Seer2-Restart-Lite-main/Assets/Scripts/`；场景资产相对 `projects/Seer2-Restart-Lite-main/Assets/`；数据/素材相对 `projects/Seer2-Restart-Lite-main/`。**全路径** = 上述前缀 + 文中相对路径。
> **证据标注**：【实测】= 本文件里可复算的数字或可复跑的命令；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。优先级 **样本 > 源码 > 推断**（`AGENTS.md §2`）。
> **状态**：**2026-10-18 成文**（随人类拍板"开始 / 选择角色场景纳入范围"，`docs/architecture.md §1.1` 已相应改表）。
> ⚠️ **本报告 §5 的怪癖登记用 `A\<n\>`**（类别纪律：每份分析报告各起一套，**不占**人类决议圆号，见 `docs/arch-docs.md §0.1`）；本文是 **A1–A22**。引用**必带文件名**。

---

## 1. 这份报告回答什么 / 体量

**回答三件事**：
1. 上游"开始场景"（Unity **`Title`**）**画面由什么组成、入场怎么演**（§2）；
2. 上游"选择角色场景"（Unity **`Login`**）**3 个角色格 + 建号 + 导入存档怎么走**（§3）；
3. 这两场景背后的**基础设施**（`SceneLoader` / `GameManager` / `SaveSystem` / `RequestManager` / 文件浏览器 / `Hintbox`）与**上游怪癖**（§4、§5）。

**体量【实测】**（`wc -l`，脚本侧）：

| 部分 | 文件 | 行 |
|---|---|---|
| 开始场景脚本 | `Scene Specific/Title/{TitleManager 844, StartButton 73, TitleToolbarButtonHoverFeedback 82, TitleBackgroundMotion 78}` | **1,077** |
| 选择角色场景脚本 | `Scene Specific/Login/LoginManager.cs` | **68** |
| 选择角色控制器族 | `MVC/Controller/Player`(8 文件) + `MVC/Model/Player`(5) + `MVC/View/Player`(5) | **≈1,424**（与 `docs/architecture.md §1.1` 一致） |
| 场景资产 | `Assets/Scenes/Title.unity` **13,107 行** / `Assets/Scenes/Login.unity` **4,564 行** | — |

⚠️ **归属澄清**（防下一轮读歪）：**"改名"与"音量"不在开始/选择角色这两场景里**。它们住在同一个 `MVC/**/Player/` 目录，但只被**局内面板**引用：
`ChangeNameController` 只被 `Resources/Panels/PlayerInfo/Panel.prefab` 引用、`VolumeSettingController` 只被 `Resources/Panels/Settings/Panel.prefab` 引用【实测：脚本 guid 全仓反查场景/预制引用，登录场景 0 命中】。
⇒ 本报告**只把 `Login` 场景真值写全**，"改名/音量"只在 §3.4 记一句漂清归属（面板正本归 **C5 系统族 / C1 玩家信息**，不在本份）。

---

## 2. 开始场景（`Title`）

### 2.1 场景资产与接线

`Title.unity` 是**构建序 0**（`ProjectSettings/EditorBuildSettings.asset:7-9`；与 `SceneId.Title = 0` 对上）。顶层对象（【源码】`Title.unity`）：

| 字段（`TitleManager`） | 目标 GameObject | 备注 |
|---|---|---|
| `videoPlayer` / `videoRenderImage` | VideoPlayer / `"My Video Render"`（RawImage） | Mod 首屏 mp4 |
| `backgroundImage` | `"Background Image"`（Image；**同对象挂 `TitleBackgroundMotion`**） | 首屏底图 |
| `backgroundGadgetObjectList` | `"Game Icon"` / `"Title Text"` / `"Title Image"` / `"Title Image (1)"` | 4 件；后三件**场景里就是停用态**（怪癖 A15） |
| `startButton` | `"Start Button"`（`StartButton` 组件） | **场景里有两只**同名 `"Start Button"`，都接了 `GameStart`（怪癖 A12） |
| `versionDateText` / `versionStringText` | `"Versioin Date"` / `"Versioin String"` | ⚠️ 对象名拼错 `Versioin`（怪癖 A13） |
| `toolBarObject` / `resourceOperateObject` / `modOperateObject` / `helpObject` | `"Tool"` / `"Resource"` / `"Mod"` / `"Help Panel"` | 工具条三个子面板 |
| （工具条容器） | `"Start Toolbar"`，其下 `"Tool"` 容 `Resource`/`Mod`/`Help` | 悬停反馈挂这里 |

- **两个入场目标在场景里都留空**：`gameIconEntranceTarget: {fileID: 0}` / `toolbarEntranceTarget: {fileID: 0}` ⇒ 真跑的是 **按名字找** `"Game Icon"` / `"Start Toolbar"` 的兜底分支（怪癖 A11）。
- 场景里被接线到 `TitleManager` 的方法（UnityEvent，【源码】`Title.unity`）：`GameStart`（开始钮）、`SetAnimActive`（进入/离开）、`OnOperateResources`/`OnImportResources`/`OnUpdateResources`（资源区）、`OnOperateMod`/`OnImportMod`/`OnUpdateMod`/`OnExportMod`（Mod 区）、`OnHelp(true/false)`（帮助钮 + Esc 钮）、`GetVersion(true)`（唯一联网入口 `"Button (Legacy)"`）。**`OnDeleteMod` 接不到**（怪癖 A7）。
- **离线版本档**：`Resources/Data/System/version.xml` → `gameVersion/buildVersion/resourceVersion = lite_4.9.2`、`releaseDate 2026-09-25+08:00`【实测】。

### 2.2 `TitleManager` 生命周期

- `class TitleManager : Manager<TitleManager>`【源码】`:10`。`Manager<T>` **不是** `Singleton<T>` ⇒ **不做 `DontDestroyOnLoad`**（`System/Singleton.cs:8-22` vs `:24-40`）⇒ 切场景即销毁（怪癖 **A21**，见 §5）。
- `Awake()` `:62-68`：`PrepareGameIconEntrance()` → `PrepareToolbarEntrance()` → `ConfigureToolbarButtonHover()`。
- `Start()` `:70-77`：`GetVersion()`（**离线**，`onlineMode=false`）→ `FileBrowser.AddQuickLink("默认存档位置", persistentDataPath)` → `SetBackgroundPageImage()` → `SetBackgroundPageVideo()` → `PlayGameIconEntrance()` → `PlayToolbarEntrance()`。
  ⇒ **注意**：背景是**异步**载的，图标入场在背景**还没回来时**就开演（怪癖 A10）。

### 2.3 入场动画（Game Icon / Toolbar）

**Game Icon 入场**（`:79-287`）：
- `Prepare`：目标须 `activeInHierarchy`（`:88`）；若有 `Image` ⇒ 切成 `Image.Type.Filled` + `FillMethod.Horizontal` + `fillOrigin=0` + `fillClockwise=true` + `fillAmount=0`（`:107-120`，原值先存）；初值 = 横向 `scale.x × 0.08`（`:123`）+ alpha 用目标色（`:124`）；建扫描线子体（`:250-268`）。
- `Play/Animate`：`WaitForSecondsRealtime(delay=0.05)`；`duration = Mathf.Max(0.2, 1)`（场景把 `gameIconEntranceDuration` 存成 **1**，不是代码默认 `0.45`【源码】`Title.unity`）；逐帧 `Time.unscaledDeltaTime` **钳到 1/30**（`:186`）；曲线取 `AnimationCurve.EaseInOut`，缺省退 smoothstep `p²(3−2p)`（`:196-202`）。
- `Apply`：scale 做 `LerpUnclamped(start, target, eased)`；**有 Image 就 `fillAmount = progress`（横向擦出）**，**没 Image 才改 alpha**（`:233-248`）；扫描线 x 随 `rect.width × progress`、alpha = `色.a × sin(progress·π)`（`:270-279`）。
- `Finish`：还原 pos/scale/color 与 Image 原 type/fill（`:204-224`），关掉扫描线。

**Toolbar 入场**（`:289-384`）：目标 `"Start Toolbar"` ⇒ 拿/补一个 `CanvasGroup`；起点 = 目标位 `+(0,−36)`、alpha 0、**禁点+禁穿射线**（`:289-313`）；`duration = Mathf.Max(0.2, 0.42)`、`delay=0.16`；逐帧 lerp 位置与 alpha；结束后还原 `interactable`/`blocksRaycasts`（`:378-384`）。

### 2.4 悬停反馈

- `StartButton : IButton`（`StartButton.cs`）：`Update` 用 `1−exp(−12·unscaledDt)` 做 **指数缓动**的放大 `×1.06` + 上浮 `4px`（`:27-39`）；`OnPointerEnter` 先查 `button.interactable`（`:43`）再 `SetAnimActive(true)` → `Animator.SetBool("OnPointerEnter", …)`（`:70`）。`OnDisable` 复位（`:56-65`）。
- `TitleToolbarButtonHoverFeedback : MonoBehaviour`（82 行）：同款放大缓动，但多一个 **pivot 补偿**（`:71-81`）好让按钮"看起来不乱跳"。⚠️ **它场景里根本没有**（GUID 全仓 0 命中），是 `TitleManager.ConfigureToolbarButtonHover` **运行时 add** 的（`:400-403`；怪癖 A14）。只给名字 ∈ {`Resource`,`Mod`,`Help`} 的子体挂（`:425-428`）。
- `TitleBackgroundMotion`：背景的"呼吸"（`cycleDuration=8`、`scaleAmount=0.015`、`positionOffset=(4,3)`、`useUnscaledTime`），`Update` 里对 scale 与 offset 各叠一组**不同频**的正弦（`TitleBackgroundMotion.cs:28-45`）。

### 2.5 背景（图 / 视频 / 动画）

- `SetBackgroundPageImage()` `:430-451`：先试 `ResourceManager.instance.GetMapAnimPrefab(0, "0-idle")`（**地图 0 的精灵动画**）。为空 ⇒ 退化路径：载 `GetLocalAddressables<Sprite>("Activities/FirstPage")` + BGM `"BGM/FirstPage"`，拼一个 `Map{ id:0, resources }` 调 `SetBackground(map, hideGameIcon:true)`。
- `SetBackgroundPageVideo()` `:453-462`：`{persistentDataPath}/Mod/Activities/FirstPage.mp4` 存在就播（`videoPlayer.url` + `videoRenderImage.color=white`）。⚠️ **只查存在、不查更晚到的文件**（Mod 导入后需重启才生效）。
- `SetBackground(Map[, hideGameIcon])` `:464-489`：播 BGM `AudioSystem.instance.PlayMusic(res.bgm, AudioVolumeType.None)`；有 `res.bg` ⇒ `backgroundImage.SetSprite(res.bg)` + 全白 + **按 `hideGameIcon` 隐藏 gadget**；有 `res.anim` ⇒ 把动画实例挂到 `Camera.main`、按 `map.anim.AnimScale/AnimPos` 摆、**关掉 `backgroundImage`**。⚠️ **anim 分支不调 `HideBackgroundGadgets`**（怪癖 A16）。
- `HideBackgroundGadgets(hideGameIcon)` `:491-503`：把 `backgroundGadgetObjectList` 逐个停用，`hideGameIcon=false` 时**跳过** Game Icon。

### 2.6 版本与"开始游戏"

- `GetVersion(bool onlineMode)` `:512-520`：联网时先弹 Hintbox"正在联网获取版本档案（没梯子会不稳定）"（`SetOptionNum(0)`），设 `GameManager.instance.onlineMode`，再 `GameManager.instance.GetVersionData(cb)`。**默认离线**。
- `CheckVersion()` `:537-553`：`versionData == null` ⇒ `RequestManager.OnRequestFail("正在获取版本档案，请稍候再试")`；`IsEmpty()` ⇒ 版本文本置 `"----/--/--"`/`"----"` + 失败提示；否则写 `releaseDate("yyyy/MM/dd")` 与 `gameVersion`；返回 `CheckBuildVersion() && CheckResourceVersion()`（**短路**）。
- `CheckBuildVersion()` `:555-564`：`buildVersion == Application.version` 才过；否则 `startButton.SetInteractable(false,false)` + `OpenUpdateBuildHintbox(150×1,000,000)`（**写死 1.5 亿字节**，真读数 `GetDownloadSize` 被注释掉；怪癖 A3/A4）。
- `CheckResourceVersion()` `:566-581`：`SaveSystem.GetResourceVersion()` ≥ `versionData.resourceVersion` 才过；否则**联网下载那个 Hintbox 被整段注释**，直接 `OnResourceFail()`（引导手动导入资源包）。
- `GameStart()` `:505-510`：`CheckVersion()` 过 ⇒ `SceneLoader.instance.ChangeScene(SceneId.Login)`。**这是"开始游戏"唯一的去处**。

### 2.7 资源包区（`#region resource`，`:627-746`）

`OnOperateResources`（显资源子面板、隐工具条）→ `OnImportResources` / `OnUpdateResources`（各开一次 `FileBrowser.ShowLoadDialog`，`overwrite=false/true`）→ `OnResourceSuccess(paths, overwrite)` `:670-704`：
- 先拒 `paths[0]` == `persistentDataPath` 或其子路径（`:671-675`）；
- `.zip`：`TryGetZipFileEntry(zip,"Resources/")` ⇒ `TryUnzipFile(zip, persistentDataPath, "Resources", overwrite)`；否则试 `"PetAnimation/"`；都不是 ⇒ "读取压缩档发生错误"；
- 非 `.zip`：`SaveSystem.TryImportResources(path, out error, overwrite)`。
`OnResourceFail()` `:706-714`：一屏"请到群内下载基础资源包…手动导入 Resources 文件夹"指引。
另有两段**联网下载**（`OnDownloadBasicResources` `:629-640` / `OnDownloadPetAnimationResources` `:642-652`，下 `BasicResources.zip` / `PetAnimation.zip` 再解压），⚠️ **没有任何按钮接它们**（怪癖 A8），只有 `OnUnzipBasicResources` 成功链到 `OnUnzipPetAnimationResources`。

### 2.8 Mod 区（`#region mod`，`:748-835`）

`OnOperateMod`（显 Mod 子面板）→ `OnImportMod` / `OnUpdateMod` / `OnExportMod`（各带一次确认 Hintbox 再开文件对话框）→ 落到 `SaveSystem.TryDeleteMod()` / `TryImportMod(path)` / `TryExportMod(path)`。导入/更新/删除**成功后弹"请重新启动游戏"并回调用 `Application.Quit`**（`:776,818,831`）。`OnDeleteMod` 声明了但**场景没接**（怪癖 A7）。

### 2.9 帮助（`#region help`，`:837-843`）

`OnHelp(bool active)`：`helpObject.SetActive(active)`。帮助钮传 `true`、Esc 钮传 `false`（【源码】`Title.unity`）。

---

## 3. 选择角色场景（`Login`）

### 3.1 场景资产与接线

`Login.unity`（构建序 1；【源码】`EditorBuildSettings.asset`）。`Login Manager` 对象挂 `LoginManager`，三个 SerializeField 指到：
`loginController`（`LoginController`）、`createController`（`CreateRoleController`）、`importController`（`ImportRoleController`）。
- **每个角色格**（共 3）的按钮**同时**接两条：`LoginManager.Login(int id)`（`m_IntArgument` = 0/1/2）与 `ImportRoleController.Cover(int id)`（同 0/1/2）；另有 `LoginRoleController.SetChosen(bool)` 挂在进入/离开（`Login.unity`）。
  ⇒ **同一个按钮身兼两用**，靠 `isImporting` 互斥（怪癖 **A19**，见 §5）。
- `LoginController.roleControllers` = 3 个 `LoginRoleController`；每格一个 `LoginRoleModel{ id=0/1/2 }`。
- 底部 `"Other User Login Button"` → `LoginManager.ImportRole`；`CreateRoleController.SetActive(false)` / `SetGender(bool)` 接在建号 UI 的按钮上。
- `ImportRoleController.otherUserLoginText` = 那一行"导入其他存档"文字。

### 3.2 `LoginManager`

`class LoginManager : Manager<LoginManager>`【源码】`:6`（**同样不做 `DontDestroyOnLoad`**）。`Start → Init` `:12-20`：
- `SetAllGameData()` `:22-26`：**硬编码 `for i in 0..2`**，`loginController.SetData(i, SaveSystem.LoadData(i))`。
- `InitCreateRoleController()` `:28-31`：**`SetActive(true)` 紧跟 `SetActive(false)`**（净效果 = 藏起来；像"强制初始化 View"的写法，怪癖 **A20**）。
- `Login(int id)` `:33-54`：`if (importController.isImporting) return;` → `if (!id.IsInRange(0,3)) return;`（**max 开区间** ⇒ 合法 0/1/2；`HelperMath.cs:23-28`）→ `Player.instance.gameDataId = id` → `loginController.Login(id, out error)`：
  - 成功 ⇒ `Player.instance.currentMapId = Player.instance.gameData.initMapId` + `SceneLoader.ChangeScene(SceneId.Map)`；
  - `error` 为空 ⇒ `createController.SetActive(true)`（空档 ⇒ 开建号）；
  - 否则 `Hintbox.OpenHintboxWithContent(error, 16)`。
- `CreateRole()` `:56-62`：`createController.CreateRole()` 成功 ⇒ `loginController.SetData(gameDataId, gameData)` 再 `Login(gameDataId)`。
- `ImportRole()` `:64-66`：`importController.Import()`。

### 3.3 三槽模型与四个控制器

- `LoginController`（`MVC/Controller/Player/LoginController.cs`）：`LoginRoleController[3]`；`SetData(id,data)` 越界即返回；`Login(id, out error)` 越界 ⇒ `error="角色数量不足"`。
- `LoginRoleController`：`Login(out error)` ⇒ `error=""`；`data.IsEmpty()` ⇒ `return false`（**空档测试**）；否则 `Player.instance.gameData = data` + `GameManager.instance.ChangeState(GameState.Login)` + `true`。
- `CreateRoleController.CreateRole()`：空昵称 ⇒ `createView.OnSetPlayerNameEmpty()`（弹"昵称不能空白"）；否则 `Player.instance.gameData = GameData.GetDefaultData(2000, 0)` + 设 `gender`/`nickname` + **`Mail.DailyLogin()`** + `SaveSystem.SaveData()`（落 `Player.gameDataId` 那槽）。
- `ImportRoleController`：`Import()` 只翻 `isImporting=true` 并把那行文字改成"选择要覆盖的存档"（**不开对话框**）；`Cover(id)` 才开 `.xml` 选择器（`PickMode.Files`，起点 `persistentDataPath + "/../"`）；`OnSuccess` ⇒ `TryLoadXML<GameData>` + `SaveData(importData, importId)` ⇒ 成功弹"导入成功，请重新启动游戏" + 回调 `Application.Quit`。

### 3.4 `Player` 会话单例 + `GameData`（3 槽的"存哪"）

- `class Player : Singleton<Player>`（`System/Player.cs:9`，**是** `DontDestroyOnLoad`）：`gameDataId`（`:11`，**槽选择器**）、`gameData`（`:12`）、`currentMapId = 70`（`:23`）等。
- `GameData`（`System/Data/GameData.cs`）：`[XmlRoot("gameData")]`；`IsEmpty() ⇒ nickname 空`（`:128-131`）；`GetDefaultData(initCoin=2000, initDiamond=0)`（`:103-126`，6 只初始宠 + 2000 币 + 1 个道具 + `new Mission(1)`）；`initMapId`（`:67-74`，`[XmlIgnore]`）按 `noobCheckPoint` 换算 ⇒ **新档 `71`**，`NoobCheckPoint.Max` 才落 `settingsData.initMapId`（默认 `-70`）。
- **存档槽 API**（`System/SaveSystem.cs`）：`MAX_SAVE_COUNT = 3`（`:15`）；`LoadData(int id=0)`（`:77-91`）读 `save{id}.xml`，**缺档就 `GetDefaultData` 落盘再返回**（⇒ **进一次选择角色就生成 3 个档**；见 §5 末"另有两条同族真值"）；`SaveData(data, id=-1)`（`:70-75`）`id=-1` 时用 `Player.gameDataId`。**没有 `HasData`/`DeleteData`**（【实测】grep 0 命中）。
- **"改名/音量"不在这里**：`ChangeNameController` / `VolumeSettingController` 分别只被 `Panels/PlayerInfo/Panel.prefab` / `Panels/Settings/Panel.prefab` 引用 ⇒ 是**局内面板**，正本归 C1/C5（见 §1 归属澄清）。

### 3.5 登录 / 建号 / 导入 三条流程（串起来）

1. **登录**：点格 → `LoginManager.Login(id)` → 非空档 ⇒ `GameState.Login` ⇒ `GameManager.GameLogin()`（`System/GameManager.cs:90-128`：版本迁移 / `petBag` resize / 跨天每日登录 / 写 `lastLoginDate` / **`debugMode` 白送** / `SaveData()`）→ 回 `Play`；`LoginManager` 再 `ChangeScene(SceneId.Map)`。
2. **建号**：点空档 ⇒ 建号 UI（昵称 + 性别）⇒ `CreateRole()` ⇒ 默认档落盘 ⇒ 立刻走一遍登录。
3. **导入**：`ImportRole()`（翻 `isImporting`）⇒ 再点某格 ⇒ `Cover(id)` 选 `.xml` ⇒ 覆盖该槽 ⇒ 提示重启（`Application.Quit`）。

---

## 4. 基础设施（被这两场景调用；宿主形状以编排线为准）

| 件 | 关键签名 / 事实 | 我们的对应 |
|---|---|---|
| **`SceneId`** | `enum { Title=0, Login=1, Map=2, Battle=3, Room=4, Game=5 }`【源码】`System/SceneLoader.cs:102-110` | 我们 = hash 路由 `#/map`/`#/battle`/`#/rbattle`（`game/app/router.js:8`） |
| **`SceneLoader`** | `Singleton`；`ChangeScene(SceneId, network=false)`（`:29`）、`ShowLoadingScreen(int=0, string=null)`（`:37`）、`HideLoadingScreen()`（`:52`）；`sceneNum=4` 但 6 个场景（见 §5 末"另有两条同族真值"） | 编排线 **ORQ1**："做薄版"加载层（视觉 = A1 `view-shell.md §2.2`） |
| **`GameManager`** | `Singleton`；`onlineMode`（`:10`）、`static versionData`（`:20`）、`GetVersionData(cb)`（`:133`）、`GameState` 6 态（`:167-175`）+ `ChangeState`（`:49-78`）+ `GameLogin`（`:90-128`） | 编排线（`docs/orchestration/orchestration-design.md §2.1`） |
| **`VersionData`** | `System/Data/VersionData.cs`：`gameVersion`/`buildVersion`/`resourceVersion`/`releaseDate`/`releaseNote`；`IsEmpty()`（`:26-29`）；`static Compare(lhs, rhs, bits)`（`:36-64`） | 版本档数据源 = `Resources/Data/System/version.xml`（离线）【实测】 |
| **`RequestManager`** | `Singleton`；`static OnRequestFail(text)`（`:23`）、`Download(uri, path, onSuccess, onFail, onProgress)`（`:89`）、`GetDownloadSize(uri, cb)`（`:56`） | **无**（网络件出局 / 待拍板，见设计 §8） |
| **`ResourceManager`** | `Singleton`；`GetMapAnimPrefab(int, string)`（`:206`）、`GetLocalAddressables<T>(item, isMod, onSuccess, onFail)`（`:115`）、`LoadMap(int, cb, err)`（`:588`）、`LoadMapResources(Map, cb, err)`（`:596`） | L2 内容桥 `game/data/**` + `game/app/content.js`（两套血统不合，见 `ui-handoff.md §3`） |
| **`SaveSystem`** | `static`；3 槽 `LoadData`/`SaveData`；导入导出 `TryGetZipFileEntry`（`:31-47`）、`TryUnzipFile`（`:49-63`）、`TryImportResources`（`:206-229`）、`TryImportMod`/`TryExportMod`/`TryDeleteMod`（`:303-436`）、`GetResourceVersion`（`:195-204`） | Save 线 `docs/save/save-design.md` + 我方 `game/logic/restartSession.js`（`SAVE_KEY_V3`，**单档**） |
| **文件浏览器** | `SimpleFileBrowser.FileBrowser`：`AddQuickLink`/`ShowLoadDialog`/`ShowSaveDialog`/`SetFilters` + `FileBrowserHelpers.{FileExists,IsPathDescendantOfAnother,DeleteFile}` | **无**（浏览器无原生文件对话框；待拍板，见设计 §8） |
| **`Hintbox`** | `Panel` 子类；`OpenHintbox()`/`OpenHintboxWithContent(content, fontsize)` + `SetTitle/SetContent/SetOptionNum/SetOptionCallback/SetSize` | A2/A3；我方样板 `game/app/view/panels/hintbox.js` |
| **`AudioSystem`** | `Singleton`；`PlayMusic(clip, volumeType=BGM)`；`enum {None,BGM,UI,BattleBGM,BattleSE}`（`:248-250`） | 编排线（**ORQ2**："先做缝不做内容"） |

---

## 5. 怪癖 / bug / 死代码登记（**A1–A22**）

> 逐条给**症状 + `路径:行` + 发行数据里能观察到什么**。上游**代码逻辑 bug** 的目标行为按 `AGENTS.md §2`（决议 ②）**"声明 + 不照搬"**，由设计文档写"没有该 bug"的目标；**数据错字照搬**（V2）。

| # | 症状 | 位置 | 可观察后果 |
|---|---|---|---|
| **A1** | `using FTRuntime;` 全文件**用不到** | `Title/TitleManager.cs:8` | 死引用 |
| **A2** | `CheckBuildVersion` 里 Start 钮 `SetInteractable(false)` 后，被 `OpenUpdateBuildHintbox` 第一行**又设回 true** | `TitleManager.cs:559` + `:588` | 版本不符时开始钮**并无可见禁用** |
| **A3** | 更新包大小**写死 `150×1,000,000`**，真读数 `GetDownloadSize` 被注释 | `TitleManager.cs:560-562` | 提示里的"建议预留 150MB"是**编造值** |
| **A4** | 资源版本不足时，**联网下载那个 Hintbox 整段注释**，直接走手动导入 | `TitleManager.cs:571-579` | 只能靠"到群里下资源包" |
| **A5** | `OnGetVersionSuccess` 用 `onlineMode` 选文案，但**只有联网调用时才会带 hintbox** ⇒ 离线分支文案不可达 | `TitleManager.cs:514-517,524-525,532` | 死分支 |
| **A6** | **`OnCancel()` 空实现**，却是每个文件对话框的取消回调 | `TitleManager.cs:583` + 调用点 `:609,662,667,760,782,802` | 取消后资源/Mod 子面板**卡在那**，无反馈 |
| **A7** | `OnDeleteMod()` 声明了但**场景未接**（`m_MethodName: OnDeleteMod` 0 命中） | `TitleManager.cs:821` | 删 Mod 无入口 |
| **A8** | `OnDownloadBasicResources` / `OnDownloadPetAnimationResources` / `OnResourceFail` **没有任何按钮事件接** | `TitleManager.cs:629,642,706` | 唯一触发是代码内链（`:731`）与被注释的 Hintbox |
| **A9** | `AudioVolumeType.None` **不是静音**，`getVolume` switch 落到 `_ => 10f`（满） | `System/AudioSystem.cs:37-43` + 调用 `TitleManager.cs:473` | 首屏 BGM 满音量 |
| **A10** | 背景**异步**载，图标入场**同步**开演；FirstPage 兜底路径会 `HideBackgroundGadgets(true)` **停用 Game Icon** | `TitleManager.cs:73-75,439,491-503` | 图标入场可能**演到一半被停用** |
| **A11** | 两个入场目标在场景里 `{fileID: 0}` ⇒ 真跑的是**按名字找**分支（`"Game Icon"` / `"Start Toolbar"`） | `TitleManager.cs:129-141,315-339`；`Title.unity` | 改名即失效 |
| **A12** | **两只** `"Start Button"`，都接 `GameStart`；另有停用的 `"Start Toolbar Old"` / 重复 `Resource`/`Mod` | `Title.unity` | 有重复体 |
| **A13** | 版本文本对象名拼错 **`"Versioin Date"` / `"Versioin String"`** | `Title.unity` ↔ `TitleManager.cs:544-551` | 只能按拼错名对 |
| **A14** | `TitleToolbarButtonHoverFeedback` **场景里不存在**（GUID 0 命中），运行时 `AddComponent` | `TitleManager.cs:400-403` | 悬停反馈纯动态 |
| **A15** | `backgroundGadgetObjectList` 里 `"Title Text"` / `"Title Image"` / `"Title Image (1)"` **场景里就是停用态** | `Title.unity` | `HideBackgroundGadgets` 对它们等于空操作 |
| **A16** | `SetBackground` 的 **anim 分支不调 `HideBackgroundGadgets`** | `TitleManager.cs:482-488` | 用地图 0 动画做底时，图标/标题**压在动画上** |
| **A17** | `OnSelectDownloadPositionSuccess` **无视用户选的路径**，仍下 `GameManager.gameDownloadUrl` 到 `paths[0]`；过滤器用平台后缀（Android = `.apk`） | `TitleManager.cs:607-618` | 下载目标与文件名不可控 |
| **A18** | `ImportRoleController.OnSuccess` **失败也弹窗**（只改文案、不退出），且末尾无条件 `OnCancel()` | `MVC/Controller/Player/ImportRoleController.cs:33-49` | 失败时窗口照弹 |
| **A19** | `ImportRoleController.cover` 与 `Login.id` **同钮双接、靠 `isImporting` 互斥** | `LoginManager.cs:34-35` + `ImportRoleController.cs:23` | 跨对象隐式耦合，改一处即坏 |
| **A20** | `LoginManager.InitCreateRoleController` 的 **`SetActive(true)`→`SetActive(false)`** 连跳 | `LoginManager.cs:29-30` | 净隐藏（疑似 view 初始化） |
| **A21** | `LoginManager`/`TitleManager` 是 `Manager<T>`（**不跨场景**），却驱动 `Singleton` 的 `Player`/`GameManager` | `Singleton.cs:8-22` vs `LoginManager.cs:6` | 场景销毁 vs 会话留存的不对称 |
| **A22** | `GameManager.debugMode = true` **默认开** ⇒ `GameLogin` **白送**满道具/满币/全宠 | `GameManager.cs:9,117-124` | 一登录就"作弊档" |

**另有两条同族真值（不细列，见 §3.4/§4）**：`SaveSystem.LoadData` **读档即写盘**（缺档生成 3 个档）、`sceneNum=4` 但 6 场景（后两场景静默用默认加载屏）。

---

## 6. 等人手测确认项（**决议 ⑦**：不许记成死账）

> 本报告是**分析件**，不产出我方行为。下列是"读上游时能观察到、但**要不要在我方复现**属设计/手测范畴"的项，交设计 §8 与人类手测定夺（此处**只登记**）：
> ⚠️ **2026-10-18 更新**：除**第 5 条**（`debugMode` 白送，牵 Save 线）外，其余各项人类**已拍板** ⇒ 结论见 `docs/view/scene/start/view-scene-start-design.md §8.1`（决议表 **STQ1–STQ8**）。

1. **开始钮禁用**（A2/A3）：版本不符时是否**真的**要禁用开始钮、更新提示要不要出现。
2. **Update/Import/Mod 三条文件流程**（A6/A7/A8/A17）：浏览器里没有原生文件对话框 —— 是**整条砍掉**、还是给个"待建"占位。
3. **首屏 BGM 音量**（A9）：`None` = 满音量这条要不要照搬。
4. **图标入场与背景的竞态**（A10/A16）：上游是"演到一半被停用"，我方要不要复现这个**时序**。
5. **`debugMode` 白送**（A22）：我方存档要不要也来一份"白送"，还是保持素档（**这条同时牵动 Save 线**）。
6. **3 槽 vs 我方单档**（§3.4）：上游 3 个 `save0/1/2.xml`，我方 `SAVE_KEY_V3` **单档** ⇒ 3 个角色格怎么落。

---

## 7. 未挖 / 已知边界

- **`Title.unity` / `Login.unity` 的像素级版式**（`RectTransform` 锚点/尺寸）**未逐条量**：本报告只钉"有哪些件、怎么接、怎么动"。逐区几何量测属**设计文档**（B5 设计 §3，手法沿 B1 `view-scene-hud-design.md`）。
- **改名 / 音量两面板**（`PlayerInfo` / `Settings`）**不在本份**（§1 归属澄清）⇒ 分别归 C1 / C5。
- **`Mail.DailyLogin` / `Mission` / `Activity` 的规则**：归 Save 线（`docs/save/save-design.md §5`）与 `totalk.md` **T2·10/T2·16/T2·17**；本报告只记"`GameLogin` 会调它们"（§3.5）。
- **联机分流**（`PhotonNetwork.AutomaticallySyncScene`）：`ChangeScene(_, network)` 有参数，但本场景恒 `false`（`LoginManager.cs:44` / `TitleManager.cs:509`）⇒ 与联机无关。
