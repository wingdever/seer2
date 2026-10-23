# C4·个人信息 设计：PlayerInfo 面板（昵称两拍 / 称号下拉 / 装备·坐骑两栏 / 货币活读数）

> **文档类别**：**design**（目标行为真值；`docs/arch-docs.md §1/§2`）。
> **线/族**：View 线 **C4 社交信息族**第二份 = **PlayerInfo**（人类 2026-10-20 点名"实现 HUD 底栏『信息』图标按钮 → PlayerInfo 面板"；同族首份 Activity 已落，`Mailbox/News/SignReward/Noob` 仍 ⬜）。
> **需求源**：人类 2026-10-20 点名 + 本份 §8 **PIQ1–4**（**已由人类 2026-10-20 全部拍板 = A**，**不是**全局决议 ①–⑨）；**PI-equip 扩格** = 人类 2026-10-20 再点名「让装备、坐骑适配个人信息面板，分成左右两侧，左侧显示角色形象和装配组件，右侧显示可更换装配的组件（头部/手部/脚部/腰部/背部/坐骑/阴影）」⇒ 新增 **§3.8** + **PIQ5–7**（§8，已拍板）；**PI-g 再扩格** = 同日手测后人类点名「图标纳入采集单、右栏换真图标（B）+ 滚动列表改分页网格」⇒ **§3.8 改版 + PIQ8**（已拍板，施工批 = impl PI-g）；**PI-static** = 同日人类再点名「装备和坐骑图标应当改为调用相应的 svg 或 png」⇒ §3.8 加**「图标画面源 = 离线静图优先」**条（施工批 = impl **PI-i**）；**PI-j**（人类 2026-10-21 两条 ⇒ `ALQ10/ALQ11`）= 目录**剔无包件 + 剔 12 色件**、末位加**「颜色」组**；**PI-k**（人类 2026-10-21 四条反馈 ⇒ `ALQ12/ALQ13/ALQ14`）= 补**「表情」组（槽 8）** + 剔 **`suit=0` 空件**（默认头顶/默认眼睛）+ **图标 404 者从部件包裁静图兜底**（新工具 `tools/pack-icon-stills.mjs`，视图与装载器零改动）。
> **父 / 邻**：证据底座 = **`docs/view/panel/playerinfo/restart-playerinfo-panel.md`**（下称**报告**，A1–A15 在那份 §7）；面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**（`openPanel` 同名去重）；道具背包 = **U4 `restartItemBagView`**（Bag 钮的对位子层，PIQ1）；提示框 = **U0 `hintbox.js`**（空名提示 / Follow·Home 诚实提示）；货币图标先例 = **`game/app/view/shop/shopPanel.js` 的 `currencyChip`**（同 `item-art.js` `makeItemIcon`）；面板形状范本 = 同族 **`activity/activityPanel.js`**（L3 `buildXxxPanel(ctx)` + `index.js` `create` 装配口 + `rb-*` CSS 族）。
> **路径口径**：上游相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **证据标注**：【报告】= 报告实测；【源码】/【样本】直引；【设计】= 本份定的目标。
> **编号纪律**：本份本地 = 不变量 **PI1–PI9** / 待拍板 **PIQ1–PIQ8** —— **不是**人类决议 ①–⑨（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design）；**PIQ1–4 已由人类 2026-10-20 全部拍板 = A**；已转入阶段二落码（impl = `playerinfo-impl.md`，as-built §7 已补）。**与 activity 先例不同 —— 本份先停下等人类拍板 PIQ1–4，拍板后才落码**（该顺序已走完）。**PI-equip（装备/坐骑两栏，§3.8）= 2026-10-20 追加；PIQ5–8 已拍板；施工批与 as-built 见 impl §2/§7.4/§7.5。**

---

## 0. 一句话目标

**在 `#/map` 点 HUD 底栏"信息"钮 ⇒ 弹自绘最小个人信息面板（PI-equip 起 640 宽居中框、中部左右两栏）：左栏 = canvas 实时角色形象预览 + 当前已装配 9 组条（可卸下）；右栏 = 9 组标签 + 分页图标网格（头/手/脚/腰/背/坐骑/表情 = equip-index 全目录（剔颜色件 / `suit=0` 空件 / 无包件）、每页 36 格、**离线静图真图标（PI-static：`/png/item/equip/icon/<id>.png`，缺件才落 Ruffle）**，PI-g；阴影 = 阴影⇄光轮两态按钮；颜色 = 12 色钮）；昵称两拍改名（空名提示不退出编辑、落盘）/ 称号·装备下拉（只列**拥有**的三族道具，选定落盘）/ 赛尔豆·星钻活读数 / Shoot 射击模式翻转（不落盘）/ Bag 开道具背包 / Follow·Home 诚实"待建"提示；第二入口（点地图玩家角色）不接、如实登记。旧立绘三态（robot/装备图标/Nono PNG）与 Change 钮已随 PIQ7 退役（§3.4 留档）。**

## 1. 范围与边界

| 归本份 | 不归本份 | 支点 |
|---|---|---|
| 面板形状 / 昵称两拍 / 称号下拉 / 立绘三态 + Change / 货币活读数 / Shoot 翻转 / Bag 复用 / Follow·Home 诚实提示 | **上游 Item Bag 子层**（面板内 `SetActive` 的含货币子视图）——PIQ1 定为**不新造**，Bag 钮复用既有道具背包模态 | 报告 §5（`GameData.itemBag` = 全 itemStorage 按 id 排序**含货币**，与我方 `A.state.items` 口径差） |
| 读 `session.data` 三字段（`nickname`/`achievement`/`settingsData.useRobotAsPlayer`）+ 写后 `A.save()` 落盘 | **进程级 `session.isShootMode` 不入档**（PIQ3；同上游 `Player.sceneData` static 同行为） | 报告 §2/§6 |
| **PI-equip（§3.8）**：PlayerInfo 内嵌的最小装备/坐骑两栏视图（**9 组**、全目录可换、canvas 预览、复用 `APP.actorLook.*` 与 `<equip>` 落盘）——人类 2026-10-20 点名并入 C4 | **独立正式装备/骑乘面板**（suits 套装展示、slot4 BODY 换装、商店经济联动）仍归 **C1/C2**（`AGENTS.md §4.17④` 收窄后口径）。⚠️ **表情（slot 8 EYE）自 PI-eye（人类 2026-10-21）已并入本面板** ⇒ 不再是 C1/C2 的缺口 | `docs/map/map-actor-look.md` + `docs/save/save-xml-spec.md §2.22` |
| 底栏 `info` 钮接入（`handler:'onInfo'`） | **第二入口（点玩家角色）`PlayerView.OpenPlayerInfoPanel`** —— 我方角色 sprite 非可点目标 ⇒ **不实现** | 报告 §1 通道② + A15 |
| `handlePanelLink` / NPC openPanel sink 加 `PlayerInfo` 防未来兜底行（桥数据现零 `openPanel PlayerInfo` intent） | 地图角色头顶名/称号文本（上游 `PlayerController.SetPlayerName/SetPlayerAchievement` = 面板改名顺手改地图头顶字；我方**无此消费面**，只需同步 `state.trainer.name`，见 PI4） | 报告 §2 `InitChangeNameSubscriptions` |
| 自绘最小 UI（`rb-pif-*` CSS 族，同 activity 范本） | **像素级美术**（上游预制的借用 sprite 全家：PetBag/OldPetBag/Hint Box/Mailbox/Map 素材）—— A12 不搬 | §4.11/§4.12/§4.13 自绘先例 |
| | 上游 `SetSceneData("shootMode")` 的**鼠标光标 Aim** 与 **`mapId==990` 清 seed 特例** —— 不接、如实登记（A7） | 报告 §2/§7 A7 |

## 2. 上游真值摘要（细节不重复，见报告）

- 入口 = Map HUD 底栏 `Bag` 节点（场景 GO 名与面板名不一致 = A15 命名陷阱，23×25）→ `OpenPanel("PlayerInfo")`【报告 §1】；我方 `restartHudView.js:80` `info` 钮**同几何**、现无 handler（点了走 `todo('信息')`），本份加 `handler:'onInfo'`。
- 面板机 = MVC 五件（`PlayerInfoPanel/Controller/Model/View`）+ 借来改名三件（`ChangeName*`）【报告 §2】。
- 昵称两拍 = `ChangeNameController.OnChangeName`（第 1 拍只翻编辑态；第 2 拍空 ⇒ 提示不退出、非空 ⇒ 落盘）【报告 §2】。
- 称号下拉 = `ChangeNameModel.Init`（拥有道具里 `IsInCategory(Achievement)` = **三类型 {23, 24, 25}**，`type` 降序 `id` 升序；选项 0 = 「无」；回填查无 = 显「无」只动显示 = A1）【报告 §2/§3】。
- 立绘 = `SetPlayerSprite`（`useRobotAsPlayer ? robot : (装备图标 ?? nono)`；**仅 `type==Equipment(25)` 算装备**；高 100/150，宽按 `GetResizedWidth` 等比）【报告 §2/A8】。
- 货币 = `Item.Find(1/2)?.num ?? 0`（与存档 itemStorage 同源 = A9 已核清）；图标运行时 = `ItemInfo.GetIcon`【报告 §2/A5】。
- Shoot = 翻 `isShootMode` **不落盘**（进程级；消费面全仓仅 4 处：`session.js:35/:452` + `mapScene.js:1105/:1268`）【报告 §6】。
- Item Bag 子层 = 初始关、Bag/Esc 双向 `SetActive`、喂**含货币**全列表【报告 §5】。
- 面板自有素材 8 张 + robotSprite（`Prefabs/Player/idle_1/idle_1_0001.png`）+ 称号 18 条图标 18/18 在盘（**按 resId 查**）+ 货币 `Items/1.png`/`2.png` 在盘【报告 §3/§4，实测】。
- **⚠️ 双资源树**：称号/货币图标走 `Resources/`（`item-art` 的 `ART_ROOT`），本面板 `Nono.png` + robotSprite 走 `Assets/Resources/` ⇒ 取图根照抄双根，不挪树（报告 §3）。

## 3. 目标行为（真值）

### 3.1 面板生命周期（PI1）

1. **开**：`#/map` 内点 HUD `info` 钮 ⇒ `openPanel('rb-pinfo', …)`（宿主同名去重）；防未来兜底 = `handlePanelLink` / NPC openPanel sink 的 `PlayerInfo` 分支走同一入口（桥数据现零 intent，纯兜底）。
2. **单例刷新**：面板已在 ⇒ 再点 `update()` 重绘（昵称/下拉/立绘/货币全刷 = 活读数），不叠层。
3. **关**：✕ / 遮罩点击 ⇒ 销毁、单例引用置 null。
4. **栈纪律**：弹层**不改 URL、不进历史**（同 activity 口径）；ESC 无全局键层（不私加）。
5. **写盘边界（PI3）**：开/关/翻页/编辑昵称**未提交**都不落盘；本线落盘点 = ② 昵称第 2 拍非空、③ 下拉选定、④ Change 翻转 —— 全经 L4 装配点（**视图零写**，PI2）。

### 3.2 昵称两拍（PI4 · = PIQ4 建议 A）

- **显示态**：名字行 = `session.data.nickname` 现值（夹具档 = `Linux`）+ Edit 图标钮（20×20 位）。
- **第 1 拍**（点 Edit 图标）：InputField 激活、**placeholder = 旧名**（上游 `ChangeNameView:38-43` 同形）、名字文本隐藏、图标 Edit→Mark。
- **第 2 拍**（再点图标）：
  - **空 ⇒ Hintbox「提示 / 昵称不能空白」（20px、1 键）+ 不退出编辑**（上游 `PlayerInfoView.OnChangeNameEmpty:38-43` 同形；提示关掉后仍停在编辑态，可继续改）；
  - **非空 ⇒** L4 写 `session.data.nickname = 新名` **+ 同步 `session.state.trainer.name`**（`stateFromData:226` 是读档投影、消费面 = `mapScene.js:206-209` HUD 名 + 战斗左名）+ `A.save()` + `refreshHud()` + 翻回显示态。
- 死绑定 `IInputField`（预制绑了空实现，A14）**不照搬**：我方"第 2 拍"由 Change 钮触发，不走 InputField 回调。

### 3.3 称号/装备下拉（PI5/PI6）

- **选项** = `session.data.itemStorage` 里 `typeId ∈ {23, 24, 25}` 的条目，**`typeId` 降序、`id` 升序**（上游 LINQ 同形，`ChangeNameModel:19-20`）；选项 0 = 「无」。全表 18 条都在 `items.json`（报告 §3 全表），**但只列拥有的**。
- **回填**（PI6 = A1 行为照搬）：当前 `session.data.achievement` 在列表里 ⇒ 选中对应项；**查无（含 0 / 已不在包里的 id）⇒ 显「无」，只动显示、不改档值**。
- **选定** ⇒ L4 写 `session.data.achievement = (选中「无」)? 0 : 该条 id` + `A.save()` + ~~**重绘立绘**（上游 `onChangeAchievementSuccessEvent → SetPlayerSprite` 同链）~~ **PIQ7 后立绘退役 ⇒ 选定只落盘、不再驱动形象**（25 族装备图标不再上屏；`§3.8` 的 canvas 预览吃的是 `equipVec`/坐骑，与称号无关）。
- **三类都进下拉、~~立绘只认 25~~**（PI7；23/24 选了只当称号、~~立绘退 nono~~ ⇒ PIQ7 后称号三族行为一致 = 只落 `achievement` 字段）。

### 3.4 立绘三态 + Change（PI7 · A8 照搬）【⚠️ 已随 PIQ7 退役（2026-10-20），留档作上游真值对照；面板改 = §3.8 canvas 预览】

- ~~`useRobotAsPlayer === true`（默认，夹具档 `true`）⇒ **robot**（`Assets/Resources/Prefabs/Player/idle_1/idle_1_0001.png`），框高 100；~~
- ~~`false` 且当前称号 `achievement` 对应条目 `typeId === 25`（Equipment）⇒ **该装备图标**（`item-art` 双 resId 路由，按 **resId** 不是 id），框高 150；~~
- ~~其余 ⇒ **nono**（`Assets/Resources/Panels/PlayerInfo/Sprites/Nono.png`），框高 100。~~
- ~~宽 = 等比（`GetResizedWidth(height)` 同形：按图实际宽高比缩到高，上限不溢出框）；**缺图 `mountImg` 自陈 asset-missing、不伪造**（A13 口径）。~~
- ~~**Change 钮**（30×30 位，tooltip「改变形象 (下次进入地图适用)」）⇒ 翻 `session.data.settingsData.useRobotAsPlayer` + 重绘 + **`A.save()` 落盘**（`ChangePlayerRobot:72-77` 同行为）。~~
- **退役口径（PIQ7 = 彻底换成 canvas 预览）**：`useRobotAsPlayer` **存档字段留档不动**（`schema.js` 默认值 + `codec` bool 回写照旧 round-trip、旧档值照读），但面板与 L4 读写闭包一并删除（全仓再无消费面）；robot/nono 两张 PNG、`fitImg` 与 Change 钮从视图删除。

### 3.5 货币活读数（PI8 · A5/A9）

- `coin = A.state.trainer.coins`、`diamond = A.state.trainer.diamonds`（= 上游 `Item.Find(1/2)` 的同源投影；夹具档 47000 / 100）。
- 图标 = `makeItemIcon(resId 1/2, …)`（`item-art.js:68`，同 shop `currencyChip` 惯例）——**不用**预制 `Coin.png`/`Diamond.png`（那两张只是编辑期占位，运行时上游也被 `GetIcon` 覆盖 = A5）。
- 单例 `update()` 时重读 ⇒ 买东西/战斗扣币后重开面板跟着变（活读数、视图零算数）。

### 3.6 五个功能钮（PI9 · = PIQ1/PIQ2/PIQ3 建议）

| 钮（位） | 行为 | 支点 |
|---|---|---|
| **Shoot**（45×45 位，tooltip「射击模式」） | 翻 `session.isShootMode`（**不落盘**、重开进程回 false，同上游 `Player.sceneData` static）；**按钮视觉态**亮/灭自陈；tooltip 追加一句"下次进入地图适用"（本仓消费面 = 下次进图的 `env.mode`，`mapScene.js:1268`）；**光标 / 990 清 seed 特例不接**（A7 登记） | PIQ3 |
| **Bag**（50×25 位，tooltip「物品背包」） | **面板先撤（`api.close()`）再 `openRestartItemBag()`**（复用既有道具背包模态、`openPanel` 同名去重）；**不新造**面板内含货币子层（口径差见 PIQ1） | PIQ1 |
| **Follow**（50×25 位，tooltip「选择跟随的精灵」） | Hintbox 诚实提示「该功能尚未实装，敬请期待！」（**上游 `TakeFollower:84-87` 自己就恒弹这句** = A3，不伪造跟随者 UI） | PIQ2 |
| **Home**（50×25 位，tooltip「使精灵或动物取消跟随」） | Hintbox 诚实提示「当前没有跟随中的精灵或动物哦！」（本仓无 follower，`Player.follower` 恒 null ⇒ 只走"无跟随者"支 = A4） | PIQ2 |
| **Change**（30×30 位） | ~~见 §3.4（翻 `useRobotAsPlayer` 落盘）~~ **PI-equip 起退役**（PIQ7：立绘三态换 canvas 预览，此钮随之删除；字段读写留档不删） | — |

### 3.7 入口（PI1 附）

- **只接底栏 `info` 钮**（`restartHudView.js:80` 加 `handler:'onInfo'` ⇒ title 自动变 tip「信息」，`:220` 规则）。
- **第二入口（点玩家角色）不接**：我方角色 = canvas sprite/占位点、非可点目标（A15 如实登记）。
- **分派器兜底**：`handlePanelLink` 加 `PlayerInfo` 分支（`SoulPet` 行后、`ACT_UNBUILT` 判前）+ NPC openPanel sink 加一行（`SoulPet` 行后、兜底行前）= **防未来**（现桥数据零 `openPanel PlayerInfo` intent，`ACT_UNBUILT` 名单**不加** `PlayerInfo`，它不是"未建"）。

### 3.8 装备/坐骑两栏视图（PI-equip · 人类 2026-10-20 点名；PIQ5=全目录随便换 / PIQ6=两态按钮 / PIQ7=canvas 预览 / **PI-color = 人类 2026-10-21 点名「颜色单出一个换色功能」** / **PI-eye = 人类 2026-10-21 点名「更改角色表情未添加」⇒ 补「表情」组**）

**布局**：面板中部（原立绘位置）改为 `split` 一行两栏 —— 左 = 形象与已装配，右 = 可更换装配的 9 组；框宽 480→640（960×540 逻辑画布内仍居中）。

**9 组 → 槽位映射**（真值 = `game/logic/map/actor-look.js:8–28` 槽枚举 + 上游 `EquipSlot.as:6–26`）：

| 组 | 槽 | 数据源 | 动作 | 落盘 |
|---|---|---|---|---|
| 头部 | slot 1 | `session.equipVec` 中 `equip-index.items[id].slot===1` 者 | 点格 = 穿（同槽自动替换）；「卸下」= 移除 | `APP.actorLook.equip/unequip` → `persistLook()` → `<equip>`（`save-xml-spec §2.22`） |
| 手部 | slot 2 | 同上 slot===2 | 同上 | 同上 |
| 脚部 | slot 6 | 同上 slot===6 | 同上 | 同上 |
| 腰部 | slot 5 | 同上 slot===5 | 同上 | 同上 |
| 背部 | slot 7 | 同上 slot===7 | 同上 | 同上 |
| 坐骑 | slot 3 | `session.mountEquipId`（0 = 未骑；slot3 **恒不进** `equipVec`，`actor-look.js:292–301`） | 点格 = 骑上（`ride(id)`）；骑中再点同格 / 「卸下」= `unride()` | 同上 |
| **表情** | **slot 8**（上游 `EquipSlot.as:18` `EYE`；PI-eye · 人类 2026-10-21 点名） | `session.equipVec` 中 `slot===8` 者（目录 21 件、**素材包 21/21 + 图标 21/21 全齐**） | 同「头部」那支（点格 = 穿、同槽自动替换；「卸下」= 移除） | **同上 —— 表情是装备件 ⇒ 要落盘**（与下面两个"非物品组"不同） |
| 阴影 | ——（**非装备物品**，PIQ6） | `session.groundMode`（'shadow'/'halo' 两态互斥） | 两个按钮（阴影/光轮）拨开关 | **不落盘**（同 MDB8-b3 口径：`ground` 只改会话态，重开回阴影） |
| **颜色** | ——（**非装备物品**，PI-color · 人类 2026-10-21） | `session.actorColor`（`null` = 跟随 `#avSel`）⇒ 当前色索引 0–11 | **12 个色钮**（蓝/绿/紫/黄/紫罗兰/橙/红/粉/白/黑/深蓝/咖啡），点 = `APP.actorLook.color(n)`，当前色高亮 | **不落盘**（与 `ground` 同口径：`<equip>` 不含颜色；重开图仍保持会话内） |

- **右栏来源 = equip-index 全目录（PIQ5，拍板理由 = 夹具档拥有数 ∩ 目录 = 0，"只列拥有"右栏全空测不动）**：目录 1864 件（`game/data/equip-index.json`，`{items:{id:{name,slot,suit}},ride:{…}}`）按 `slot ∈ {1,2,5,6,7,3}` 过滤分组；**拥有与否不置灰、点了即穿**（复刻开发期无商店经济；`<equip>` 里存未"拥有"的 id 与我方档自洽，上游不认该块、不影响喂档围栏——`AGENTS.md §4.17①` 复刻档不得喂回官方服仍成立）。
- **⚠️ 目录另加三道剔除（人类 2026-10-21 三条点名 ⇒ `map-actor-look` 的 `ALQ10=A`/`ALQ11=A`/`ALQ13`）**：
  - **① 颜色件**（`actor-look.js` 导出的 `COLOR_ITEM_IDS` = 12 色 × 手/身/脚 **36 件**）⇒ **不进部件目录**，颜色改由「颜色」组承担；
  - **② 本机无美术包的件** = 包不在 `game/data/actor/equip/manifest.json` 的 `packs[包].files[后缀]` 里（**判据复用 L1 `packRefOf(item)`，不许在 L4 重拼包名**）⇒ **不进目录**，实名表 = `docs/map/map-actor-look.md §5.7` ① 共 **11 件**（五周年冠军坐骑 101737、回忆录 101740〔手部件〕、葛蕾芬手套/兵团长拳套/兵团长的剑、渡鸦战靴、5 件背装）。
  - **③ `suit=0` 的默认/空件**（L1 `ACTOR_LOOK.isEmptySuitItem`；PI-empty · 人类 2026-10-21 点名「默认头顶不就是没有头顶吗？感觉没有必要显示在部件列表里」）⇒ **不进目录**。上游把"这一槽没穿东西"也做成了物品 = 默认头顶 `100001`（槽 1）/ 透明替身 `100002`（槽 4，本就不列）/ 默认眼睛 `100003`（槽 8，PI-eye 后若不筛就会露出）⇒ **面板槽位里实测只影响两件**。
  - **过滤后的实测条数**（人测判据）：头 **346** / 手 **375** / 坐骑 **95** / 腰 **305** / 脚 **304** / 背 **240** / **表情 20**（七组合计 **1685**；演进 = 原始 1701 →（剔颜色 + 无包）1666 →（再剔空件 + 补表情）**1685**）。身体（槽 4）本就不在面板组里。
  - **屏蔽只到玩家面**：调试入口 `APP.actorLook.equip/ride` 仍可穿任意 ID（含 `100001`/`101737`）、存档 `<equip>` 里已有的无包件**照常画 fallback、不静默改档**；**图标缺失不作为剔除条件**（仍走 ④ 级兜底 + `assetMissing`）。清单未就绪（`loadActorManifest` 失败兜成空）⇒ 各组出空、显示「目录里这组是空的」，不崩、不伪造。
- **右栏形态 = 组标签 + 分页网格（PI-g · 人类 2026-10-20 点名「滚动列表改分页网格」）**：顶部 **9** 个组标签（头/手/脚/腰/背/坐骑/**表情**/阴影/颜色；**件物组相邻、两个非物品组恒在末位**），**一次只显示一组**；组内 = 网格（每行 6 格 × 6 行 = **每页 36**）+ 翻页条（`‹ 页 x/y ›`）。**换页/换组 = 重建当前页格子 ⇒ 同时在册的 Ruffle 播放器 ≤36**（当初"滚动列表 + 逐格 Ruffle"会挂上千个播放器，分页把量钉死）。阴影组与颜色组不分页（就两态钮 / 12 色钮）。**分页/页码是纯显示状态，住在 L3，不进 ctx。**
  - **【2026-10-20 PI-static 后】**：静图命中的格子**根本不挂播放器** ⇒ 在册 Ruffle 数实际降到 **0**（只有缺件格才挂）；分页仍把**最坏情况**钉在 ≤36（+ 已装配条 ≤9，PID12）。
- **格子 = 真图标（PIQ8=B · 人类 2026-10-20 拍板「图标纳入采集单」）**：落码时曾实测**本地盘**无装备图标（名字牌过渡，impl PID7）；2026-10-20 定向拉取政策（`docs/map/map-actor-look.md §5.5` 通道一）试出**服务器有**：`res/item/equip/icon/<id>.swf` ⇒ 已按采集单全量拉进仓库镜像 `swf/item/equip/icon/`（与 `item-art.js` 的 `itemSwfUrl` 路由逐字对上，`makeItemIcon(id,_,true,'装备')` 直接可播）。404 的件（实测默认色身体等）**登记未采集**、格子退色块 tile + `assetMissing` 自陈（不摆假图）。图标缺失时**名字仍进 title 悬浮**。
- **图标画面源 = 离线静图优先（PI-static · 人类 2026-10-20 点名「信息面板中的装备和坐骑图标使用的当前素材 `/swf/item/equip/icon/*.swf` 应当改为调用相应的 svg 或 png」）**：共享装载器 `game/app/view/item-art.js` 的 `makeItemIcon` 取图顺序改为
  **① 离线静图 `/png/<与 swf 同路径、仅前缀与扩展名替换>` → ② Ruffle 播 `swf`（仅当①缺件/404）→ ③ Unity `Resources/` PNG → ④ 色块 tile**。
  - **产物出处** = `tools/swf2svg.mjs`（正本 `docs/item/item-design.md §3.1`）：`swf/item/**` + `swf/pet/icon` + `swf/nono` **1831 个**已镜像到 `svg/` 与 `png/`，**路径逐字对齐**（装备 id ⇒ `png/item/equip/icon/<id>.png`，实测 1687 件全覆盖）。
  - **选 png 不选 svg 的理由**：面板同时在册 ≤45 格（PID12），png 均值 ~13KB vs svg ~34KB ⇒ 流量与解码都轻；png 已 **@2x**（约 200px 对 22/44 CSS px 的格子 ⇒ HiDPI 够锐）。**`svg/` 仍是可放大的真值层**（要详情大图/矢量缩放时改走那一路）。
  - **产物不入库**（`.gitignore:51-55`，人类 2026-10-20 拍板）⇒ 新克隆没有 `png/` ⇒ ① **404 ⇒ 自动落回 ② Ruffle**，画面不许空 —— 这条兜底链是"产物可丢、重跑即可"的**前提**，不是可选装饰。
  - **已知画面差 = 都不补（人类 2026-10-20 拍板）**：静图缺**外发光/投影**（装备图标实测 136 个文件带滤镜）、缺 **`clipDepth` 掩膜**（129 个）、解析抛出的件（`101622` 等 4 件）= 空图 ⇒ 格子退色块 tile。
  - **图标 404、但部件包在盘 ⇒ 可从包里裁一张（PI-icon-crop · 人类 2026-10-21 问「可以从部件 swf 中生成吗」⇒ `map-actor-look ALQ14`）**：部件包文件本身内嵌一整张 PNG spritesheet + 裁帧表 ⇒ 离线工具 `tools/pack-icon-stills.mjs` 取 `standDown` 首帧裁出来、放大居中贴 120×120，落进**同一个** `png/item/equip/icon/<id>.png` ⇒ 视图与装载器**零改动**（就是第①级命中）。当前受益 **5 件**：蓝队旗帜 `100106` / 红队旗帜 `100107` / 阿卡·迪迪兰·咻休公仔 `100242–100244`。⚠️ **那是"穿戴美术"、不是官服图标原画**（小图放大有块感）⇒ 属**兜底**，不满意删掉那 5 个 png 即回色块；产物同属"不入库"支 ⇒ 新克隆重跑工具。
  - **副作用（如实登记）**：本条改的是**共享 helper** ⇒ `makeItemIcon` 的另外两家消费者一并换成静图 = **商店**（`shopPanel.js` 3 处，`useRuffle=false`）、**道具背包**（`restartItemBagView.js` 1 处，同 `false`）；对它们**只可能变好**（原先大列表传 `useRuffle=false`，装备 id 在 Unity `Resources/Items/` 里根本没有 ⇒ 落色块；现在静图镜像命中就出图）。**战斗道具板 `panels/battle/itemBoardView.js` 不经本装载器 ⇒ 零影响**（实测 grep 无 `item-art` 引用）。
- **不显示的槽**：只有 **slot 4 BODY** 不进右栏（不在人类点名的组里；本色由「颜色」组决定）；**slot 8 EYE 自 PI-eye（2026-10-21）起已成「表情」组**，旧口径「EYE 恒默认、不进面板」作废。镜像位 slot 9–11 由 L1 计划自动生成，不单独成组。
  - **换色的正式入口** = 面板「颜色」组（PI-color；旧口径「颜色只走调试台 `APP.actorLook.color`」已作废，`#avSel` 与控制台仍是并列入口）。
- **左栏 = 当前已装配条**：**9** 格（头/手/脚/腰/背/坐骑/**表情**/阴影/颜色），**图标（有素材时）+ 名字**（阴影格显当前态名「阴影」或「光轮」；**颜色格显当前色名、无卸下钮**，同阴影格的「非物品组」支；**表情格照常带「卸下」** = 装备件）；有装配的格带「卸下」小钮（坐骑 = 下马）。数据 = `session.equipVec` + `mountEquipId` + `groundMode` + `actorColor` 现值。
- **左栏预览 = canvas 实时形象（PIQ7）**：`<canvas>` 直用 L4 `drawActor(c, cx, cy, PREVIEW_SCALE, dy)`（`mapScene.js:2050` 族）画**与地图同一个 LOOK**（同一 `syncLook` 计划、同一动画时钟 ⇒ 面板与地图形象恒一致）；喂帧 = 蹭地图单 rAF（`stepActorAnim` 每帧画完地图后，若面板在册则重绘预览画布），**零新增 rAF**；开面板先 `syncLook` 再立即一帧；`LOOK.ready === false` ⇒ 画布留占位提示、不崩。
- **刷新链**：点格/卸下/切阴影 ⇒ L4 调 `APP.actorLook.*`（自带 syncLook+地图重绘+persistLook）⇒ `PINFO.update()` 重建左右两栏 + 预览即刻补画一帧。
- **单例 `update()`**（PI1.2）重读全部现值 ⇒ 调试台改外观后再开面板同步。
- **纪律不变**：L3 零查表零算数（目录/槽位/名字全由 ctx 回调递现值，PI2）；L3 不 import `game/logic/**`；写动作全在 L4 闭包。

## 4. 落点与分层（框；细节与 as-built 归 impl）

| 件 | 层 | 内容 |
|---|---|---|
| `game/app/view/playerinfo/playerInfoPanel.js` | L3 | `buildPlayerInfoPanel(ctx)` → `{ update }`；昵称两拍 UI / 原生 `<select>` 下拉 / 立绘三态 / 货币行 / 五钮信号；scrim 点关 + ✕（activity 范本） |
| `game/app/view/playerinfo/index.js` | L3→L4 装配口 | `create(container, ctx)` → `{ update, destroy }`（同 `activity/index.js` 9 行形） |
| `game/app/ui.css` | L4 | `rb-pif-*` 族（深蓝系同 `rb-act-*`；插在 `rb-act-go--off` 段后、演出期锁注释前）；**PI-equip 起框宽 480→640、`split/left/canvas/equipped/right/group/cell/groundbtn` 子族，`.rb-pif-portrait` 随立绘退役删除** |
| `game/app/scenes/mapScene.js` | **L4 装配** | `openRestartPlayerInfo`（单例 `PINFO` + ctx 读写闭包注入 + `A.save()`）+ `mountRestartHud` 加 `onInfo` + import + 单例行 + unmount 作废行加 `PINFO` + 分派器 / NPC sink 各加 `PlayerInfo` 兜底行；**PI-equip 加**：ctx 契约表新增行的闭包实现 + `renderPreviewTo()`（`drawActor` 旁）+ `stepActorAnim` 尾挂 `PI_PREVIEW` 补帧 + `PI_PREVIEW` 生命周期（`setPreviewCanvas` 登记 / `onClose`·`unmount` 置 null） |
| `game/app/view/hud/restartHudView.js` | L4 | `info` 行加 `handler:'onInfo'`（box/图标/label 均不动） |
| `game/app/session.js` | — | **不改**（读写 `session.data` 一律经 L4 闭包，同 `soulSet` 口径，不开新桥） |

**分层纪律（PI2）**：

- L3 **不 import** `game/logic/**`；本面板连 `content` 都不需（称号名/图标名全是 ctx 递进来的现值，视图零查表、零算数）。
- `A`（`makeActive`，`session.js:416-432`）**不暴露 `session.data`** ⇒ 读写三字段**必须**经 L4 装配点闭包注入 ctx（同 `soulSet:381-392` 直写 `session.data` 袋 + 调用方 `A.save()` 的既有口径）。**ctx 契约**（L4 提供、L3 只调）：

  | ctx 键 | 方向 | L4 实现（`openRestartPlayerInfo` 闭包内） |
  |---|---|---|
  | `getNickname()` / `setNickname(name)` | R / W | 读 / 写 `session.data.nickname` + **同步** `session.state.trainer.name` |
  | `getAchievement()` / `setAchievement(id)` | R / W | 读 / 写 `session.data.achievement` |
  | `listAchievements()` | R | `session.data.itemStorage` 里 `typeId∈{23,24,25}` 按 `typeId` 降序、`id` 升序，投影 `{id,name,resId,typeRaw}`（名字/resId 查 `CONTENT.restartItemOf`） |
  | ~~`getUseRobot()` / `setUseRobot(v)`~~ | R / W | ~~`session.data.settingsData.useRobotAsPlayer`~~ **PIQ7 退役**：闭包随 Change 钮删除（存档字段仍由 schema/codec round-trip） |
  | `getCoins()` / `getDiamonds()` | R | `A.state.trainer.coins/diamonds` |
  | `getShootMode()` / `toggleShoot()` | R / W | `session.isShootMode` 读 / 翻（**不 `save`**） |
  | `onSave()` | 动作 | `A.save(); refreshHud()`（写后统一落盘 + HUD 名/币刷新） |
  | `openItemBag()` | 动作 | 关本面板（`api.close()` + `PINFO=null`）再 `openRestartItemBag()` |
  | `showHint(spec)` | 动作 | `openHintbox({title:'提示', content, contentSize, optionNum:1})`（空名 / Follow / Home 三处共用） |
  | `onClose` | 动作 | `PINFO = null; api.close()`（PI-equip 起**另置预览画布登记 `PI_PREVIEW = null`**） |
  | **`listCatalog()`**（PI-equip） | R | equip-index 全目录按 `slot ∈ {1,2,5,6,7,3,8}` 分组：`{1:[{id,name},…], 2:…, 3:…(坐骑), 5:…, 6:…, 7:…, 8:…(表情)}`（`CONTENT.loadEquipIndex()` 预载缓存后同步产出）；**PI-color 起另过三道**：剔 `COLOR_ITEM_IDS`（36 颜色件）+ 剔 `ACTOR_LOOK.isEmptySuitItem`（`suit=0` 默认/空件，PI-empty）+ 剔无包件（`ACTOR_LOOK.packRefOf(item)` 查 `loadActorManifest()` 的 `packs[p].files[s]`）⇒ 见 §3.8 的实测条数。每组对象另带只读布尔 **`assetReady`**（清单是否已到位）⇒ 视图用它把「这组真的没件」与「清单还没到」两种空列表分开（PID15） |
  | **`getEquippedSummary()`**（PI-equip） | R | 8 组现值：`equipVec` 按槽反查目录 + `mountEquipId`（0 = 无）+ `groundMode` + `actorColor` ⇒ `[{group, itemId?, name?, ground?, color?}]` |
  | **`getGroundMode()`**（PI-equip） | R | `session.groundMode` |
  | **`listColors()`**（PI-color） | R | `ACTOR_LOOK.DEFAULT_COLORS` 投影成 `[{n, name}]`（12 项，**视图零查表**：色名由 L4 递给 L3） |
  | **`getColorMode()`**（PI-color） | R | `ACTOR_LOOK.colorIndexOf(session.actorColor ?? <#avSel 现值>)`（`null` = 跟随 HUD，同 `mapScene.js:2012` 口径；**非法索引 ⇒ 0 蓝兜底**，视图不认负数） |
  | **`onPickColor(n)`**（PI-color） | 动作 | `APP.actorLook.color(n)`（**不落盘**，同 `ground`）⇒ `PINFO.update()` + 预览补帧 |
  | **`onPickEquip(id, slot)`**（PI-equip） | 动作 | slot3 → `mountEquipId===id ? unride() : ride(id)`；其余 → 现装即 id 则 `unequip`、否则 `equip(id)`；随后 `PINFO.update()` + 预览补帧 |
  | **`onUnequipSlot(slot)`**（PI-equip） | 动作 | 左栏「卸下」：3 → `unride()`；其余 → `unequip(该槽现装 id)` |
  | **`onPickGround(mode)`**（PI-equip） | 动作 | `APP.actorLook.ground(mode)`（不落盘） |
  | **`setPreviewCanvas(canvas)`**（PI-equip） | 装配 | 建面板时把画布元素交 L4 登记 `PI_PREVIEW`（开 = 登记 + syncLook + 补帧；关/unmount = 置 null） |

  视图**只发信号**（"提交新名 X" / "选定 id Y" / ~~"翻机器人"~~ Change 已退役 ⇒ "点格子 id Z 槽 S" / "卸下槽 S" / "切阴影态 M"），写档与落盘动作全在 L4。

## 5. 怪癖处置回执（决议 ②：声明 + 不照搬；A1 按行为照搬）

| 报告 # | 本设计处置 |
|---|---|
| A1（回填查无 ⇒ 显「无」只动显示） | **行为照搬**（PI6）；只有用户主动选定才落盘 |
| A2（Item Bag 子层喂含货币全列表） | **不造子层**；Bag 钮复用既有道具背包模态（PIQ1 建议 A） |
| A3（`TakeFollower` 上游恒弹未实装） | Follow 钮 = **同款**诚实提示（PIQ2） |
| A4（Home 的"有跟随者"支永不可达） | Home 钮只走无跟随者提示（PIQ2） |
| A5（货币图标运行时被 `GetIcon` 覆盖） | 图标走 `makeItemIcon(1/2)`（同 shop 惯例），不用预制 Coin/Diamond.png |
| A6（三张统计 PNG 遗留未引用） | 不搬、不接（上游自己没用） |
| A7（`isShootMode` 不落盘 + 光标 / 990 特例） | 只翻布尔不落盘（PIQ3）；光标/990 **不接、如实登记** |
| A8（立绘 100/150 + 仅 25 算装备） | **照搬**（PI7） |
| A9（YiTe 换袋支 / 常规支同源已核清） | YiTe 不接；货币 = `state.trainer.*` 同源投影（PI8） |
| A10（`ShowCurrency` 死参 / `GetPlayerEquiment` 拼写） | 不照搬（无对应死参；方法名不沿用拼写错误） |
| A11（预制占位文本「约瑟传说永不言败」/「名字」） | 占位文本不上屏（placeholder 只取旧名，PI4） |
| A12（按钮 sprite 全借自他面板） | 自绘最小 UI、不搬（像素级美术归正式美术批） |
| A13（robotSprite 在 `Prefabs/Player/idle_1/`） | 立绘机器人态取这张；缺图自陈不伪造 |
| A14（`IInputField` 空实现死绑定） | 不照搬；第 2 拍由 Change 钮触发（PI4） |
| A15（场景 GO 名 `Bag` ≠ 面板名 / 双入口） | 命名陷阱只登记；第二入口不接（§3.7） |

## 6. 请人测（验收主口径 = 决议 ⑦；同 `playerinfo-impl.md §8`，交付时随回复同发）

见 impl §8 —— 两份同一张清单，不重复维护。真机夹具基线（`tools/fixtures/save-lite4.9.2-played.xml`）：昵称 `Linux`、`achievement=0`、`useRobotAsPlayer=true`、coin `47000`、diamond `100`、包内**无**称号族道具 ⇒ 默认态 = 下拉仅「无」+ 立绘机器人 + 47000/100。

## 7. 交 impl 的判据

本份 + 报告经人类评审、**PIQ1–4 拍板后**按 `playerinfo-impl.md` 落码并复述 as-built；落码完成再停下等人类手测（§6 清单随交付回复同发）。

## 8. 本份待拍板（PIQ1–PIQ4 · **已由人类 2026-10-20 全部拍板 = A**；解说不占正文篇幅，交付回复里按决议 ⑧ 人话四件说清）

> **拍板回执（2026-10-20）**：PIQ1=A / PIQ2=A / PIQ3=A / PIQ4=A（人类原话「PIQ1:A PIQ2:A PIQ3:A PIQ4:A」）。四条全按建议落地，下方各行的 **A 列即最终行为**。

| # | 问题 | 建议 |
|---|---|---|
| **PIQ1** | 面板里的 **Bag 钮**（tooltip「物品背包」）开什么？上游 = 面板内一个 `SetActive` 的子层，喂**全 itemStorage 按 id 排序、含两枚货币**（报告 §5）；我方既有道具背包模态 `openRestartItemBag` 列的是 `A.state.items`（**不含**货币） | **A = 复用既有道具背包模态**（面板先撤再开；口径差 = 上游子层多两枚货币行，我方货币本来就在 HUD 顶栏与面板自己的 Currency Bar 活读数，不缺信息）；B = 新造面板内含货币子层（多一套 DOM + 与 `restartItemBagView` 功能重叠） |
| **PIQ2** | **Follow / Home 两钮**做什么？上游 `TakeFollower` **自己**恒弹「该功能尚未实装，敬请期待！」（A3）；`SetFollowerHome` 的"有跟随者"支在本仓永不可达（A4，无 follower 系统） | **A = 诚实提示**（Follow 弹上游同款"尚未实装"、Home 弹「当前没有跟随中的精灵或动物哦！」）；B = 死钮不接（点无反应 = 上游行为都不如，不建议） |
| **PIQ3** | **Shoot 钮**翻什么、落不落盘？上游翻 `Player.isShootMode` = **进程级 static、不落盘**（重开回 false）；附带改鼠标光标 + `mapId==990` 清 seed 特例（A7） | **A = 只翻 `session.isShootMode` + 按钮视觉态自陈、不落盘**（与上游同行为；消费面 = 下次进图 `env.mode`，tooltip 自陈"下次进入地图适用"）；光标/990 特例**不接**（如实登记，不是死账） |
| **PIQ4** | **昵称**照不照搬上游两拍（第 1 拍进编辑、第 2 拍取值；**空名弹「昵称不能空白」且不退出编辑**）？我方特有的一步 = 提交时**同步 `session.state.trainer.name`**（HUD 名 / 战斗左名的消费投影，上游没有这一层） | **A = 照搬两拍 + state 同步**（两拍结构天然后面拦空名，`GameData.IsEmpty` 判据不用另造）；B = 单拍直改（少一次交互，但偏离上游真值、空名拦截要另写） |

**PIQ5–7（PI-equip · 已由人类 2026-10-20 全部拍板 = 各"推荐"支）**

> **拍板回执（2026-10-20）**：PIQ5 = 全目录随便换 / PIQ6 = 两态按钮切换 / PIQ7 = 彻底换成 canvas 预览（AskUserQuestion 三问全选推荐）。

| # | 问题 | 已决 |
|---|---|---|
| **PIQ5** | 右栏「可更换装配的组件」列哪些装备？核实事实 = **夹具档拥有道具 ∩ equip-index 1864 件 = 0** ⇒ "只列拥有"右栏 7 组全空、没法点任何东西 | **全目录随便换**（点了即穿、无拥有校验；复刻开发期无商店经济，先保证每个槽位手测得到。备选 = 只列拥有 / 全列未拥有置灰） |
| **PIQ6** | 「阴影」组怎么做？核实事实 = **阴影不是装备物品**（目录查不到），角色恒有阴影，只有两态（普通阴影/光轮），由 `session.groundMode` 开关控制（MDB8-b3 已实现） | **两态按钮切换**（阴影 ⇄ 光轮互斥钮，接 `APP.actorLook.ground()`，不落盘。备选 = 硬造假物品列表） |
| **PIQ7** | 旧立绘三态（robot/装备图标/Nono PNG + Change 钮）去留？人类要求左栏显示"角色形象"= 带装备坐骑的 canvas 实时形象 | **彻底换成 canvas 预览**（三态与 Change 钮退役；`useRobotAsPlayer` 字段留档不动、面板不再暴露。备选 = 立绘小框保留另加预览） |
| **PIQ8** | 右栏格子形态？核实事实（PI-g 时点）= **装备图标在服务器上存在**（`res/item/equip/icon/<id>.swf` 定向试探 = 200），本地盘缺只是"没采"；而图标是 Flash 格式、逐格 Ruffle 渲染，滚动全目录会挂上千播放器 | **图标纳入采集单 + 右栏换真图标**（人类 2026-10-20 点名 B），并**同日点名「滚动列表改分页网格」**把在册播放器钉在 ≤36（组标签 + 每页 36 + 翻页条，= §3.8 改版；备选 = 维持名字牌 / 图标+滚动+懒加载） |
