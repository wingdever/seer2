# C1·灵兽 设计：灵兽/精灵王面板（3×3 头像灯位 + 领取约瑟 + 兑换商店 + 规则）

> **文档类别**：**design**（目标行为真值；`docs/arch-docs.md §1/§2`）。
> **线/族**：View 线 **C1 精灵面板族**（`docs/view/view-design.md §8` 表把 `SoulPet`/`SpriteKing` 列入 C1；`docs/view/panel/view-panels-pet.md §64` 原判 `SoulPet`"不在本份 ⇒ 先补代码分析报告"，本线即人类 2026-10-19 点名开工把它立为 C1 的又一深写子面板；同族先例 = 背包/仓库 + 调整技能盖板 + 图鉴第三份 `docs/view/panel/dex/`）。
> **需求源**：人类 2026-10-19 点名"实现 HUD 中'灵兽'图标的面板" + 同日两项拍板（本份 §7 **GPQ1/GPQ2**、形状 GPQ3，**不是**全局决议 ①–⑨）。
> **父 / 邻**：证据底座 = **`docs/view/panel/godpet/restart-godpet-panel.md`**（下称**报告**，A1–A8 在那份 §7）；面板宿主 = **A2 `docs/view/mech/view-panel-stack.md`**（`openPanel` 同名去重）；消费端 = **C4 `docs/view/panel/activity/`**（`handlePanelLink` 的 `SoulPet` 分支）+ **图鉴 `docs/view/panel/dex/`**（10 只灵兽"分布"具名终点 = 同一台分派器）；商店注入端 = **`docs/view/panel/shop/shop-impl.md`**（`ItemShopPanel` 被注入 `itemIds/limit/currency`）；存档袋 = Save 线 `activityStorage` 通用 `<Activity>` 键值袋（地图线 + 限购已透传落盘）；入口钮 = **B1 `docs/view/scene/room/view-scene-hud-design.md`** R6「灵兽」钮。
> **路径口径**：上游相对 `projects/Seer2-Restart-Lite-main/Assets/`；我方相对仓库根。
> **证据标注**：【报告】= 报告实测；【源码】/【样本】直引；【设计】= 本份定的目标。
> **编号纪律**：本份本地 = 不变量 **GP1–GPn** / 已拍板 **GPQ1–GPQ3** —— **不是**人类决议 ①–⑨（`AGENTS.md §5`）。
> **状态**：✅ 已写（阶段一 · design；本线为人类点名开工特例，代码与 impl **同批**落地，as-built = `godpet-impl.md §7`），**待人类评审**。

---

## 0. 一句话目标

**在 `#/map` 点 HUD 底栏「灵兽」钮 ⇒ 弹自绘最小灵兽面板：3×3 头像灯位（读 `soul` 袋 `light[north]`，亮 = 真头像 / 灭 = 暗空格不伪造）+ 三档挑战钮（6v6/2v2/1v1 = 诚实"待建"提示，A 组围栏）+ 兑换商店（复用现有商店、注入 10 件货 + 限购 + 希望之光货币）+ 领取约瑟（全亮免扣 或 扣 50 希望之光 ⇒ 约瑟 990/Lv105 入包）+ 规则浮层；把 `light[north]`/`done[north][10]` 经既有 `activityStorage` 袋落盘。**

**灵兽面板解决的是"集精灵王、领约瑟、换奖励"的收集看板**；打不打得赢 6v6/2v2/1v1、`BattleMode.SPT/Special` 规则怎么写，是**引擎侧、留 A 组围栏**（报告 A6），本批不碰。

## 1. 范围与边界

| 归本份 | 不归本份 | 支点 |
|---|---|---|
| 面板形状 / 3×3 灯位 / 领取约瑟 / 兑换商店 / 规则浮层 的目标行为 | **三档挑战的战斗**：`Battle.StartBattle(mode=SPT/Special)` + `OnFightWin` 点灯闭环（报告 §2.4/A6） | **A 组围栏**（`AGENTS.md §4.1` 第 1 条 / `docs/architecture.md §1.1` T2·18）—— GPQ1 = 诚实提示 |
| 读 `soul` 袋灯位 + 领取位、写回落盘（经既有 `activityStorage`） | 前置 8 兽挑战门 `done[north][1..8]`（非本面板产出） | 报告 §4；只读展示不判定 |
| 兑换商店 = **注入现有 `ItemShopPanel`**（10 件货/限购/货币，商品自带 `currencyType:400016`） | `ItemShopPanel` 自身的买卖/限购逻辑改 | `shop-impl.md`：**逻辑层零改动**（GPQ2） |
| 领取约瑟 = 加宠 `makeRestartPet(990,105)` + `addPet` | 精灵王约瑟的**参战/等级钳放开**（Lv105 越 1..100） | 报告 A7：只入包、不参战 |
| 版式 = **自绘 DOM**（背景 jpg + 摆位，§4.10 人眼校口径） | 像素级正式美术、`MapRunner.as`/AS3 | 正式排版归 A 组口径（§4.11 先例） |
| 灯位/领取/商店/规则的**如实接线** | `mega background.png`/`Btn*.png` 未接线素材 | 报告 A8：不使用 |

## 2. 上游真值摘要（细节不重复，见报告）

- 入口 = Map HUD 底栏「灵兽」钮（`challenge/god pet.png`）→ `OpenPanel("SoulPet")` → 加载 `Panels/SpriteKing/`【报告 §1】；类名 `SpriteKing` ≠ 标识符 `SoulPet`（A1）。
- 脚本 273 行 = 常量 + `ShowLight`（灯位显影，灭 = `null` 不伪造）+ `GetKing`（领约瑟，全亮免扣 / 非全亮扣 50）+ `Fight/OnConfirmFight/OnFightWin`（多老大战斗 + 点灯闭环）+ `Shop`（注入 ItemShop）【报告 §2】。
- 状态袋 = 两只 `Activity`：`soul`（`light[north]`/`done[north][10]`/`done[north][1..8]`）、`30001`（`done[6v6/2v2/1v1]`）【报告 §4】。
- 几何 = 预制 960×540、Light 400×400、Challenge 四钮 160×50、GetKing/Rule 165×65、Help 350×180【报告 §3】。
- 素材 = 9 头像 9/9 在盘、兑换 10 货 + 400016 全在 items.json 且自带 `currencyType:400016`、背景 jpg 在盘【报告 §5】。

## 3. 目标行为（真值）

### 3.1 面板生命周期（GP1）

1. **开**：`#/map` 内点 HUD `godpet` 钮 ⇒ `openPanel('rb-godpet', …)`（A2 同名去重）；活动/图鉴经 `handlePanelLink('SoulPet')` ⇒ 同一入口。
2. **单例刷新**：面板已在 ⇒ 再点只 `update()` 重绘（重读袋），不叠层。
3. **关**：✕ / 遮罩点击 ⇒ `onClose` 清引用 + `api.close()`；**兑换商店触发时面板先关再开商店**（同活动/SPT"执行前撤浮层"口径）。
4. **栈纪律**：弹层**不改 URL、不进历史**；ESC 无全局键层（同 worldmap/spt/activity 先例，不私加）。
5. **零副作用浏览**：开/关/看灯/看规则**不落盘**；唯一写盘 = 领取约瑟成功那一次（§3.3，经既有 `A.save()` 链，面板不直接碰）。

### 3.2 灯位显示（GP2 · = 照搬 ShowLight）

- 数据 = `soul` 袋 `light[north]`（9 字符 '0'/'1'，缺省全 '0'）；宠序 `SOUL_PET_IDS = [981,982,983,984,990,985,986,987,988]`（990 居中，行主序）。
- **亮格（'1'）⇒ `mountImg(petIconUrl(petId))` 真头像**；**灭格（'0'）⇒ 暗空盒**（对位上游 `SetPet(null)`），**绝不伪造换图**（缺图 = `mountImg` 自陈 `asset-missing`，9/9 实测在盘 ⇒ 正常不缺）。
- 每格 `title` 给宠名 + 亮/灭态（可读性，零新逻辑）。
- **本批不产出灯位**（点灯闭环属战斗，围栏）⇒ 面板**只读展示**当前袋值（调试台手改 `light[north]` 即可看到亮格，见 §5 请人测）。

### 3.3 领取约瑟（GP3 · = 照搬 GetKing 目标行为，A3/A4 行为照搬）

- 判重：`soul` 袋 `done[north][10]==='true'` ⇒ 提示「你已经获得过约瑟了哦！查看精灵背包或仓库吧！」并返回。
- 达成条件：`light` **全亮**（无 '0'）**或** 持有希望之光(400016) `≥ 50`。
  - 全亮 ⇒ **免扣**（对位 A3：上游 `if(light.Contains('0'))` 守卫跳过扣费分支）；
  - 非全亮 ⇒ 需 50 希望之光，`consumeItem(400016, 50)` 扣 50；不足 ⇒ 提示「头像全部点亮或集齐50个希望之光才能获得约瑟！请查看挑战规则！」并返回。
- 成功：`RST.syncUidSeq` → `makeRestartPet(A, 990, 105)` → `addPet`；队满入仓、仓满 = **回滚已扣 50 + 提示"背包已满"并返回**（不扣钱不吞宠）；否则写 `light[north]="1"×9`（A4 行为照搬）+ `done[north][10]="true"` → `A.save()` → 刷新 HUD → 提示获得约瑟（含入队/入仓）。
- **约瑟 Lv105 只入包、不参战**（A7：越战斗等级钳属战斗侧另账，本份不动）。

### 3.4 兑换商店（GP4 · = GPQ2 接现有面板）

- 点「兑换商店」⇒ **先关灵兽面板**再 `openRestartShop({mode:'buy', title:'精灵王兑换商店', itemIds:[500811,490990,21013..21020], limit:[1,1,-1×8], currency:{coin:400016,diamond:2}})`（对位 `Shop()` 的 `SetPanelIdentifier item/limit/currency`）。
- **逻辑层零改**：10 件货在 `items.json` 均自带 `currencyType:400016` ⇒ `shop.js` 的"道具当钱"分支（`balanceOf=countItem`）自动按希望之光计价/扣减；限购 `1/1/-1×8` 复用既有 `remaining`/`state.shop.bought`（跨档经限购收编，见 `activity-impl.md §3.4`）。
- **顶栏补画第三颗货币 = 希望之光余额**（`shopPanel.js` 当 `open.currency.coin>2` 时，从 `state.items` 现读该道具持有数，零算数）。

### 3.5 三档挑战（GP2′ · = GPQ1 诚实待建）

- 6v6/2v2/1v1 三钮**画出、可点**，点 ⇒ **诚实提示盒**（`openHintbox`）：说明"灵兽挑战待建：多老大 SPT/Special 战斗规则仍属 A 组围栏（`AGENTS.md §4.1`），解锁后才会『通关 → 随机点亮 3 头像 + 得 3 希望之光』"。**不开战、不写灯、不扣/得道具**。
- **不实现** `Fight` 的前置门/今日门/debugMode 后门（A5）与 `OnFightWin` 点灯闭环（A6，随战斗）；面板只读展示 `light`。

### 3.6 规则浮层（GP5）

- 「挑战规则」钮 ⇒ 本地开/关 Help 浮层（对位上游 `SetActive` 开关，默认隐藏）；文案 = 报告 §3 的 TMP 富文本两色（希望之光橙、说明青）逐字照抄。零算术、零写档。

### 3.7 不变量

- **GP6 分层**：面板（L3/L4 视图 `game/app/view/godpet/`）**不 import** `game/logic/**`、**不 import** `session`；读数（灯位/领取位/持有数）与动作（领取/开店/关闭/提示）全经 `opts` 注入到 L4 装配点 `mapScene.js`；面板零算数（只画注入的数）。
- **GP7 落盘经既有通路**：写 `light[north]`/`done[north][10]` 走 `session.data.activityStorage` 的 `soul` 袋（与限购 `writeShopToData`、地图线 `setActivity` 同一只袋、同"值恒 string"schema），再 `A.save()` ⇒ 随 XML `<Activity>` 落盘；**不新开 session.js 桥**（as-built 差异见 impl §7 GPD-）。
- **GP8 缺图不伪造**：`mountImg` 自陈 `asset-missing` ⇒ CSS 画虚线占位盒，**绝不换别的图**。
- **GP9 SWF 路不变**：面板是 `#rv` DOM 常驻层，与 `swfOk` 两路画面无关；HUD 钮接 `onGodpet` **不动** `MapRunner.as`/AS3。

## 4. 落点与分层（框；细节与 as-built 归 impl）

| 件 | 层 | 内容 |
|---|---|---|
| `game/app/view/godpet/{godpetPanel.js,index.js}` | L3/L4 | DOM 面板 + 装配口 `create(container, opts)`（形状照 `view/spt`）；`SOUL_PET_IDS` 常量 + 几何 + `HELP_HTML` |
| `game/app/scenes/mapScene.js` | L4 装配 | `openRestartGodpet()`（单例守卫）；`soulGet/soulSet`（读写 `activityStorage['soul']`）；`onGetKing`/`onShop`/`onFight`/`onClose` 装配；`handlePanelLink` 的 `SoulPet` 分支 + `ACT_UNBUILT` 摘 `'SoulPet'`；NPC/活动 openPanel sink `/SoulPet/` 分支；`unmount` 作废 `GODPET_PANEL` |
| `game/app/view/hud/restartHudView.js` | L4 | `godpet` 行加 `handler:'onGodpet'`（title「面板待建」自动消失） |
| `game/app/view/shop/shopPanel.js` | L3 | 顶栏当 `open.currency.coin>2` 补第三颗货币（希望之光余额，现读 `state.items`） |
| `game/app/ui.css` | L4 | `rb-godpet-*` 段（960×540、背景、灯位格 `--on` 青晕、挑战/底栏钮、Help 浮层） |

**零新 L0/L1**：宿主复用 `panels/host.js`；头像复用 `_kit.petIconUrl`+`mountImg`；提示复用 `panels/hintbox.js`；商店复用 `view/shop`；落盘复用 `A.save()` + `activityStorage`。

## 5. 请人测（= impl §8；验收主口径 = 决议 ⑦；交付时随回复同发）

见 `godpet-impl.md §8` —— 两份同一张清单，不重复维护。

## 6. 怪癖处置回执（决议 ②：声明 + 处置）

| 报告 # | 本设计处置 |
|---|---|
| A1（类名 SpriteKing ≠ id SoulPet） | 声明为同一面板；目录取 HUD 语义 `godpet`，文档处处并注"灵兽/SpriteKing(id=SoulPet)" |
| A2（§64 记"无底座"） | 本份 + 报告即其底座；impl 交付时订正 `view-panels-pet.md §64` |
| A3（全亮免扣 50） | **行为照搬**（非 bug）：GP3 全亮免扣、非全亮扣 50 |
| A4（领取后强制全亮） | 行为照搬：GP3 成功后 `light[north]="1"×9` |
| A5（debugMode 后门） | **不照搬**：无 debugMode 分支；挑战一律诚实提示 |
| A6（SPT/Special 战斗 + 点灯闭环） | **不实现**（A 组围栏）：GP2′ 只画钮 + 提示；只读 `light` |
| A7（约瑟 Lv105 越钳） | 只入包不参战；等级钳放开属战斗侧另账 |
| A8（未接线素材） | 不使用 |

## 7. 本份已拍板（GPQ1–GPQ3 · 人类 2026-10-19）

| # | 问题 | **决议** |
|---|---|---|
| **GPQ1** | 三颗挑战钮（6v6/2v2/1v1）怎么处理？（多老大 SPT/Special 战斗规则仍锁在 A 组） | ✅ **诚实待建提示**：钮画出、可点、点开给围栏说明，不开战不写灯 |
| **GPQ2** | 兑换商店怎么落？ | ✅ **接现有商店面板**：注入 10 件货 + 限购 1/1/不限 + 希望之光货币（商品自带 `currencyType:400016`），逻辑层零改动 |
| **GPQ3** | 版式 | ✅ 自绘 DOM 最小 UI（抄 SpriteKing 预制几何：3×3 灯位 + 右侧挑战 + 底栏领取/规则 + Help 浮层），非像素级美术 |

## 8. 交 impl 的判据

本份 + 报告过人类评审后按 `godpet-impl.md` 复述 as-built；本线特例 = 人类点名开工、GPQ1–3 已拍板，代码已同批落地。
