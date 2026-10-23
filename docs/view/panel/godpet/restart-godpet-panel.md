# 代码分析：重启的上游是怎么实现"灵兽 / 精灵王面板（SpriteKing / OpenPanel("SoulPet")）"的

> **文档类别**：**代码分析报告**（类别定义见 `docs/arch-docs.md §1`；住本面板子目录 `docs/view/panel/godpet/`，落位口径见 `docs/arch-docs.md §0.1`）。
> **性质**：**只读分析上游 C#/预制**。本文件**不是 design、不是 impl、不发代码、不定目标行为** —— 只把"上游到底怎么写、预制/场景/发行数据里能观察到什么"查清并钉死。
> **父 / 邻**：View 线 **C1 精灵面板族**（`docs/view/view-design.md §8` 表把 `SoulPet`/`SpriteKing` 都列进 C1 精灵 13 项；`docs/view/panel/view-panels-pet.md §64` 早把 `SoulPet` 判为"⛔ 不在本份、无分析底座 ⇒ 先补一份代码分析报告（住本面板子目录）"——**本文件即那份底座**）+ 面板栈 **A2 `docs/view/mech/view-panel-stack.md`**（`OpenPanel`/`SetPanelIdentifier`）+ 底栏入口钮 = **B1 `docs/view/scene/room/view-scene-hud-design.md`**（R6 底栏左组「灵兽」钮，`challenge/god pet.png`）+ 消费端 = **C4 `docs/view/panel/activity/`**（活动 `soul` 行 `linkId=SoulPet`"去参加"跳本面板）+ **图鉴 `docs/view/panel/dex/`**（10 只灵兽的"分布"具名终点 = `SoulPet`）；**挑战战斗侧**（`BattleMode.SPT=3` / `Special=4`）**不在本份**（引擎线 + 地图线口径，见 §7 A6）。
> **路径口径**：上游代码/资产路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`（运行期 `Resources/` 走 `game/app/view/panels/battle/_kit.js:36` 的 `PETIC='/projects/Seer2-Restart-Lite-main/Resources/…'` 服务前缀）；我方相对仓库根。
> **证据标注**（`docs/arch-docs.md §4`）：【实测】= 本次可复算（读源 / 目录清点 / `items.json` 查表）；【源码】= 直接引用 `路径:行`；【推断】= 由前两者导出、**明确标出**。
> **优先级**：样本 > 源码 > 推断（`AGENTS.md §2`）。
> **上游 bug 政策**：**声明 + 不照搬**（**人类决议 ②**）⇒ §7 逐条登记（本报告内部编号 **A1–A8**，引用**必须带文件名**）；目标行为未定的写"待定 + 指针到 design"，**不许记成死账**（`AGENTS.md §1.1` / 决议 ⑦）。
> **状态**：✅ 已写（阶段一 · 证据），**待人类评审**；配对设计 = `docs/view/panel/godpet/godpet-design.md`（GP1–4 / 已拍板 GPQ1–3）→ `godpet-impl.md`（as-built）→ 代码（`AGENTS.md §1`；本线为人类 2026-10-19 点名开工特例，代码与 impl 同批落地）。

---

## 0. 一句话结论

**灵兽面板 = 一台"3×3 头像灯位 + 三档多 boss 挑战 + 精灵王兑换商店 + 领最终宠"的收集板**，脚本 273 行、真相全在这一份 C# 与 `Panel.prefab` 里。
脚本 `Resources/Panels/SpriteKing/Scripts/SpriteKingPanel.cs` 的类叫 **`SpriteKingPanel`**，但**开面板的标识符是 `"SoulPet"`**（HUD 底栏「灵兽」钮绑 `MapMenuController.OpenPanel("SoulPet")` ⇒ 加载 `Panels/SpriteKing/Panel.prefab`）—— **同一个面板、两个名字**（资源夹 = `SpriteKing`、面板 id = `SoulPet`，见 §7 A1）。
玩法闭环 = **打挑战 → 随机点亮 3 个头像 + 得 3 个「希望之光」(400016) → 头像全亮 **或** 攒够 50 个希望之光 → 领精灵王约瑟 (990, Lv105)**；另有一条**兑换商店**支线（用希望之光买 10 件货）。
挑战本身走 `Battle.StartBattle(BattleInfo{mode=SPT/Special, 多 BossInfo})`（6v6/2v2/1v1 三档、写死 boss 宠/等级/HP/技能循环）——**这套多老大战斗规则属引擎侧、留 A 组围栏**（`AGENTS.md §4.1` 第 1 条 / `docs/architecture.md §1.1` T2·18），**不是本面板的东西**（§7 A6）。

我方对应物今天（本批前）= **占位**：HUD `restartHudView.js:78` 的 `godpet` 行（原 `handler:'todo'` ⇒ 落「面板待建」logLine）、`mapScene.js` `ACT_UNBUILT` 名单里的 `'SoulPet'`、活动/图鉴"去参加/去这张图"跳到 `SoulPet` 时只 logLine。**钮在、名单在、链在 —— 缺面板本体与其灯位/领取/商店逻辑**。

---

## 1. 入口与打开【源码/实测】

- **底栏入口**：Map HUD 底栏左组（玩法）第 6 颗「灵兽」= `StaticResources/Sprites/Map/challenge/god pet.png`（`view-scene-hud-design.md §R6` 表 + §56 素材清单，真图已核实）→ `MapMenuController.OpenPanel("SoulPet")`。
- **活动入口**：`game/data/unity/activities.json` 里 `soul` 行（"精灵王之路"，`kingActivity=30001`）的 `linkId = "SoulPet"` ⇒ 活动面板"去参加"经 `handlePanelLink` 到达本面板（`docs/view/panel/activity/restart-activity-panel.md §4` linkId 分桶：命名面板 38 只里 `SoulPet` 占 1）。
- **图鉴入口**：`game/data/unity/pets.json` 里 10 只灵兽的具名分布终点 = `SoulPet`（`docs/view/panel/dex/restart-dex-panel.md §` 实测：具名去重含 `SoulPet`）⇒ 图鉴"去这张图"经**同一台**分派器到达。
- 面板类 `SpriteKingPanel : Panel`（`:8`）——`Panel` 基类的 `Init()` 生命周期；我方对应 `host.openPanel` 单例（A2）。

## 2. 本体脚本（273 行）逐段【源码】

### 2.1 常量与两只活动袋（`:10-17`）
```csharp
kingActivityId = "30001", soulActivityId = "soul";        // :10  两只 Activity 键
kingActivity => Activity.Find(kingActivityId);            // :13  30001 = 挑战进度（done[6v6/2v2/1v1]）
soulActivity => Activity.Find(soulActivityId);            // :14  soul   = 头像灯位 + 领取位 + 前置 8 兽位
soulPetId = {981,982,983,984,990,985,986,987,988};        // :15  9 格宠序（990 约瑟居中，行主序）
light => soulActivity.GetData("light[north]", "0"×9);     // :16  9 字符 '0'/'1' 串，缺省全灭
ITEM_ID = 400016;                                          // :17  希望之光（货币/收集品）
```
- **两只袋分工**：`soul`（`light[north]` 9 位灯串、`done[north][10]` 领取位、`done[north][1..8]` 前置 8 兽挑战门）；`30001`（`done[6v6/2v2/1v1]` 三档挑战今日完成位）。
- `Activity.Find(id)` = 上游"读即建档"语义（`docs/view/panel/activity/restart-activity-panel.md §3` A1）：`GetData(key, def)` 缺键回缺省、不抛。

### 2.2 `Init()` / `ShowLight()`（`:19-24` / `:57-64`）—— 灯位显影
- `Init` → `selectBlockViews.ForEach(InitButtonAndIconSize)` + `ShowLight`。
- `ShowLight`：逐格 i 读 `light[north]` 第 i 字符 ⇒ `selectBlockViews[i].SetPet(l=='0' ? null : GetExamplePet(soulPetId[i]))`【源码 `:61-62`】。
  ⇒ **点亮 = 显示对应精灵王示例宠，熄灭 = `null`（空/暗格）**，**不伪造**（我方 `godpetPanel.js:82-90` 同口径：亮格 `mountImg(petIconUrl)`、暗格留空盒）。

### 2.3 `GetKing()`（`:26-55`）—— 领约瑟
1. `done[north][10]` 已 true ⇒ hint「你已经获得过约瑟了哦！…」（`:28-31`）。
2. 若 `light` 仍含 '0'（**未全亮**）⇒ 查 `Item.Find(400016).num ≥ 50`？不够 ⇒ hint「头像全部点亮或集齐50个希望之光…请查看挑战规则！」；够 ⇒ `Item.Remove(400016, 50)` 扣 50（`:34-44`）。
   - ⚠️ 关键读法：**全亮分支跳过整个 `if` ⇒ 不扣 50**（免扣），非全亮才走"扣 50 换领"这条路。我方 design 目标 = **同一行为**（§7 不把它当 bug）。
3. `new Pet(990, 105)` + `Pet.Add` + `Pet.OpenHintbox`（`:46-48`）—— 约瑟 Lv105 入包。
4. `SetData("light[north]", "1"×9)` + `SetData("done[north][10]", "true")` + `SaveSystem.SaveData()` + `ShowLight()`（`:50-54`）。

### 2.4 `Fight(type)` / `OnConfirmFight` / `OnFightWin`（`:66-144`）—— 挑战与点灯闭环
- `Fight("6v6"|"2v2"|"1v1")`（`:66`）：
  1. `debugMode` ⇒ 直接 `OnConfirmFight`（`:69-73`，绕过所有门 —— 上游自留的后门，§7 A5）。
  2. 门 1：`done[north][1..8]` 任一未真 ⇒ hint「先战胜所有灵兽再来挑战吧！」（`:75-79`）—— 需先打完 8 只散落在世界各图的"灵兽"。
  3. 门 2：`kingActivity done[type]` 今日已过 ⇒ hint「今日已通过此关卡，确定要再次挑战吗？每日仅首次通关有奖励！」+ 2 选项确认（`:82-88`）。
- `OnConfirmFight`（`:93-109`）按 type 分派 `Fight6v6/Fight2v2/Fight1v1`。
- `Fight6v6`（`:146-191`）/ `Fight2v2`（`:193-232`）/ `Fight1v1`（`:234-264`）：各写死 `BattleSettings{petCount, mode=SPT|SPT|Special, starLimit}` + 一批 `BossInfo{petId, level=105, hp, initBuffIds, loopSkillIds, superSkillId}` + `Battle.StartBattle`：
  - 6v6：boss 宠 `{981,982,983,984,987,988}`，HP `{30000,25000,25000,25000,65000,30000}`；
  - 2v2：`{985,986}` 各 35000；1v1：`990` 135000、`mode=Special`、`filterLimit="(uid>0)"`「不能使用 Mod 精灵」。
  - **`winHandler = OnFightWin(type)`**（战斗胜利回调）。
- `OnFightWin`（`:111-144`）：`done[type]` 已真则直接 return；否则 `light` 含 '0' 时 `Random(3, false)` 取 3 格**逐格翻转**（'0'→'1' 点亮 / '1'→'0' 熄灭，`:120-132`）+ 汇总 hint「点亮/熄灭了【宠名】！」；`Item.Add(new Item(400016, 3))` 得 3 希望之光；`SetData("30001", done[type], true)`；`Save`。
  ⇒ **"通关 → 随机 3 灯翻转 + 3 希望之光 + 记今日完成"闭环**，**全押在 `Battle.StartBattle` 能打赢上**（§7 A6：围栏）。

### 2.5 `Shop()`（`:266-272`）—— 兑换商店
```csharp
var panel = Panel.OpenPanel<ItemShopPanel>();
panel.SetPanelIdentifier("item",     "500811/490990/" + Range(21013,8));   // 500811/490990/21013..21020
panel.SetPanelIdentifier("limit",    "1/1/" + Repeat("-1",8));             // 限购 1/1/不限×8
panel.SetPanelIdentifier("currency", "400016/2");                          // 货币 = 希望之光 400016 / 星钻 2
```
⇒ 复用的就是**那台通用 `ItemShopPanel`**（我方 = `game/app/view/shop/`），只是用 `SetPanelIdentifier` 注入 10 件货 + 限购 + 货币。（`docs/view/panel/shop/shop-impl.md` = 被注入端。）

## 3. 预制几何【源码 · `Panel.prefab`】

面板根 960×540（Unity 中心锚、y 向上；换算 CSS = `480+cx−w/2`、`270−cy−h/2`，我方 `godpetPanel.js` 头注记此式）：
- 背景 = `Sprites/background.jpg`（盘上有，实测；`mega background.png`/`Btn.png`/`Btn_1.png` **脚本零引用 ⇒ 未接线素材**，§7 A8）。
- `Light Panel` 400×400 @(-220,0) —— 9 格 `selectBlockViews`（`PetSelectBlockView`），格 100×100、间距 150，行主序 = `soulPetId` 序（990 居中）。
- `Challenge Panel` 400×200 @(240,100)：6v6/2v2/1v1/Shop 四钮 160×50（6v6@(-100,50)、2v2@(100,50)、1v1@(-100,-50)、Shop@(100,-50)）。
- `Get King` 165×65、`Rule` 165×65 贴底；`Help Panel` 350×180 @(240,-120)（默认隐藏，Rule 钮 `SetActive` 开关）；Esc 钮右上 45×45。
- 规则文案（TMP `m_text`，`<color=#hex>` 两色富文本）——我方照抄进 `godpetPanel.js` 的 `HELP_HTML`。

## 4. 状态袋 schema【源码】

| 袋 | 键 | 形状 | 谁读 | 谁写 |
|---|---|---|---|---|
| `soul` | `light[north]` | 9 字符 '0'/'1' | ShowLight/GetKing | OnFightWin 翻转 / GetKing 全置 1 |
| `soul` | `done[north][10]` | bool（存 "true"） | GetKing 判重 | GetKing |
| `soul` | `done[north][1..8]` | bool ×8 | Fight 门 1 | （前置 8 兽挑战产出，非本面板） |
| `30001` | `done[6v6]`/`done[2v2]`/`done[1v1]` | bool | Fight 门 2 / OnFightWin 判重 | OnFightWin |

⇒ 落盘 = 通用 `<Activity>` 键值袋（`docs/view/panel/activity/` 已透传：地图线 + 商店限购 `writeShopToData` 同一条 `activityStorage` 通路，值恒 string）。本面板只写 `soul` 两键（`light[north]` / `done[north][10]`）。

## 5. 素材与发行数据实测（盘上清点）

- **9 张灵兽头像** = `Resources/Pets/icon/{981,982,983,984,985,986,987,988,990}.png` —— **9/9 在盘**（实测），`petIconUrl(990)` 路由可达 ⇒ 点亮格能出真图。
- **约瑟宠 990** = pets.json 在册（Lv105 越我方 `rbattleScene` 的 1..100 钳 —— 仅领取入包、不参战，故无碍；§7 A7）。
- **兑换 10 件货** = `items.json` 实测全在：`500811`(价 20) / `490990`(10) / `21013..21020`(各 8) —— **且件件自带 `currencyType:400016`** ⇒ `game/logic/item/shop.js:23` 的 `balanceOf = countItem(state, currency)`「道具当钱」分支自动成立，**逻辑层零改**。
- **希望之光 400016** = items.json 在册（`currencyType:400016`、price 1）。
- **背景** = `Panels/SpriteKing/Sprites/background.jpg` 在盘（实测）。

## 6. 出路【源码】

`GetKing` / `Shop` / `Fight` 三类动作；`Fight` 的 `Battle.StartBattle`（多老大 SPT/Special）与 `OnFightWin` 点灯闭环 = **战斗侧围栏**；`Shop` = 复用 `ItemShopPanel`；`GetKing` = 纯数据写 + 加宠。
⇒ 我方本批：**灯位显示 + GetKing + Shop + Rule** 真做；**Fight 三钮 = 诚实待建提示**（人类 2026-10-19 拍板，见 design GPQ1）。

## 7. 怪癖/缺口登记（A1–A8 · 决议 ②：声明 + 处置指 design）

| # | 现象（源码/实测） | 可观察后果 | 本线处置（→ design） |
|---|---|---|---|
| **A1** | 面板**类名 `SpriteKing` ≠ 打开标识符 `"SoulPet"`**（`:8` vs HUD `OpenPanel("SoulPet")`）；`view-design.md §8` 把 `SoulPet`、`SpriteKing` 分列 C1 两行 | 跨文档易误读成"两个面板" | 声明：同一面板；正本命名一律写"灵兽/SpriteKing(id=SoulPet)"，我方目录名取 HUD 语义 = `godpet` |
| **A2** | `view-panels-pet.md §64` 曾把 `SoulPet` 记为"⛔ 不在本份、无分析底座" | 家族地图上的过时断言 | 本份即其要求的"代码分析报告"；impl 交付时把 §64 行订正为"已立底座/设计/impl" |
| **A3** | 全亮领约瑟**仍会**——`GetKing` 的 `if(light.Contains('0'))` 守卫使"全亮"分支**跳过扣 50**（`:34` 仅非全亮才走扣费） | 玩家全亮后可**免扣 50** 直接领 | **非 bug、行为照搬**（对齐 V2/§2 分工）：我方 `onGetKing` 同样"全亮免扣、非全亮扣 50"（design GP3） |
| **A4** | `GetKing` 成功后把 `light[north]` 强制全 '1'（`:50`），即便之前是靠"攒 50 希望之光"而非"全亮"领的 | 领一次 ⇒ 9 灯**全亮**（覆盖真实点灯进度） | 照搬（这是"已集齐"的表达），impl 登记 |
| **A5** | `Fight` 顶的 `if(GameManager.debugMode) 直放`（`:69`）—— 绕过前置 8 兽门 + 今日门 | 上游自留后门 | **不照搬**：我方无 debugMode 分支；挑战钮本批一律走"诚实待建"提示，不开战（design GP2/GPQ1） |
| **A6** | 挑战 = `BattleMode.SPT=3`/`Special=4` 多老大战斗（`:151/199/239` + 写死 boss 表） | 打赢才有 `OnFightWin` 点灯闭环 | **A 组围栏**（`AGENTS.md §4.1` / `docs/architecture.md §1.1` T2·18）：本批**不碰引擎战斗规则**；挑战钮诚实提示；点灯闭环（`OnFightWin`）随之**不实现**，面板只读展示 `light`（design §不做清单） |
| **A7** | 约瑟 Lv105（`:46`）越我方 `rbattleScene` 等级钳 1..100 | 若参战可能被钳级 | 本批只**领取入包**（`makeRestartPet(A,990,105)` 不跑战斗钳），如实登记；是否放开钳级属战斗侧另账 |
| **A8** | `Sprites/{mega background.png, Btn.png, Btn_1.png}` 脚本零引用 | 未接线素材 | 不使用（design §不做清单） |

## 8. 请人测口径

见 `godpet-impl.md §8`（同一张清单，不重复维护）。**验收主口径 = 人类把游戏跑起来手测**（决议 ⑦），本报告不发测试脚本。
