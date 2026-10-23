# 重启战斗场景（Fight）复刻 · 实现文档

> 上游 = `docs/view/scene/battle/view-scene-battle-design.md`（设计已定稿）。本文把设计落成**逐文件、逐函数、逐类名**的施工图；两者冲突时以设计文档的**口径**为准、以本文的**具体做法**为准；实现结束后另起 §14 As-built，**冲突以 As-built 为准**（沿用 `docs/view/scene/room/view-scene-hud-design.md` / `docs/view/scene/room/view-scene-hud-impl.md` 那套纪律）。
> **状态：B1–B5 已落地并全绿（2026-10-16）** ⇒ §3–§13 是蓝图原样（保留不改，供对账「当初怎么判断的」），**最终口径看 §14**。B6 缺件未做。**§14 之后再补 §15 = 底栏「逃跑」接线（2026-10-19）**，逃跑一格最终口径以 §15 为准。
> 权威视觉目标 = `/home/wing/Pictures/Screenshots/seer2/battle.png`（1920×1032）。

## 0. 铁律（实现期逐条自检）

1. **不碰 `game/core/**`**。所有缺口只在 `coreBattleDriver.js` 加**只读出口**（§9）。`corrupt` 内核没建模 ⇒ **本轮不画腐蚀条**，不为 UI 改 core。
2. **面板零算数**：名字/等级/属性/可用性/怒气口径一律现读 driver；view 里只允许**比例（条宽）、颜色插值、字符串拼接、过滤+排序**（后两者是上游 `BattlePetBuffView` 的 view 侧行为，读的是 core 的 `hide`/`sortPriority` 字段，不是本地规则）。
3. **AS3/SWF 线逐字节不变**：`#/battle`、`fightUI.swf`、`battleScene.js`、`battle-kernel.js`、`index.html` 的 `#wrap` 内联样式，零改动。新 HUD 只挂 `#/rbattle`，全屏化只由 `body.rbb-full` 这一个 class 触发（§3.3）。
4. **两条数据血统不合并**：只读 `game/data/unity/**` 经 driver 投影，不引 `game/data/*.json` 的官方数值。
5. **不伪造内容**：无后端的页签（道具/逃跑/对方/手牌）→ 灰化 + tooltip 说明缺口，**绝不画假子面板**；缺素材 → CSS 矩形兜底 + `data-asset-missing="…"`，**绝不静默换成别的图**。
6. **可见性靠截图**（项目既定裁决）：截图那一格是空的 ⇒ 不画。本条最典型的落点 = **无天气时 `.rbb-statebuffs` 不产出任何节点**（§6.3）。
7. 战斗期间**内核时序不动**：`STEP_MS=650` 的逐动作演出与 `driver.onRender` 的整回合同步是两套节奏，本轮 HUD 只做**瞬时态**（§6.9 动画门控推到 B5）。
8. **非 git 仓库 ⇒ 改文件前留底**：`mkdir -p /tmp/rbbattle-bak && cp -a game/app/view/panels/battle game/app/ui.css game/app/scenes/rbattleScene.js game/app/view/panels/host.js game/app/view/battle/restartFighterStage.js tools /tmp/rbbattle-bak/`

---

## 1. 变更文件清单

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| F1 | `game/app/view/panels/host.js` | **微增** | 画布模式 `fixed` / `match`（按宽缩放、**高度可变**），解决 `EDGE=6` 裁切与贴边血牌/底栏的冲突（§3） |
| F2 | `game/app/view/panels/battle/_kit.js` | **微增** | `petIcon()` / `buffIcon()` / `elementIcon()` / `fitBar()` / `anch()`；`bar()` **保留**（地图线在用） |
| F3 | `game/app/view/panels/battle/fightPlateView.js` | **新建** | R1 血牌（我/敌同一模块、`side` 镜像），**替换 `resourceView.js`** |
| F4 | `game/app/view/panels/battle/roundPlateView.js` | **新建** | R2 回合板（上游 `Weather` 节点） |
| F5 | `game/app/view/panels/battle/buffGridView.js` | **新建** | R3 buff 网格（宠侧印记 + 全局/天气两用法），**替换 `buffView.js` + `weatherView.js`** |
| F6 | `game/app/view/panels/battle/bottomBarView.js` | **新建** | R4 底栏：页签簇 + 内容互斥 + 必杀槽 + 自动战斗 + 绿圆钮 |
| F7 | `game/app/view/panels/battle/skillCardView.js` | **新建** | R6 技能卡行（4 槽 pitch 175），**替换 `skillView.js`** |
| F8 | `game/app/view/panels/battle/petChangeView.js` | **新建** | 换宠页 6 钮（上游 `BattlePetChangeView`），**吃掉头上的 `openSwitchPicker` 弹层** |
| F9 | `game/app/view/panels/battle/itemBoardView.js` | **新建** | 捕捉/道具页 8 格（上游 `BattlePetItemController`），**替换 `captureView.js`** |
| F10 | `game/app/view/panels/battle/recordPanelView.js` | **新建** | R5 记录面板 + 骑沿把手，**替换 `recordView.js`** |
| F11 | `game/app/ui.css` | **替换 `.rbb-*` 段 + 新增 `body.rbb-full` 段** | **删 `:87` 与 `:230` 的 `hp color.png`**；`@font-face` 引本地字体 |
| F12 | `game/app/scenes/rbattleScene.js` | **重写面板装配段** | （`:200-260`）+ 全屏开关；`selftest` 分支与内核调用面零改动 |
| F13 | `game/app/battle/driver/coreBattleDriver.js` | **微增** | 只读出口（§9） |
| F14 | `game/app/view/battle/restartFighterStage.js` | **微增** | 三层包进 `#rb-stage` 并按视口宽缩放，全屏下不成比例错位（§3.4）；演出逻辑/锚点值不动 |
| F15 | `tools/rbattle-fight-layout-test.mjs` | **新建** | 逐盒断言 + 三条结构性回归（钉死 S1/S2/S3） |
| F16 | `tools/rbattle-hudtest.mjs` | **断言重写** | 现断言的 6 槽几何 / 「无操作卡」是旧 IA，必须按新版式改（§11 迁移表） |
| F17 | `tools/rbattle-{capture,switch,encounter}-test.mjs` | **各改 1–2 条选择器** | 类名搬家，断言语义不降级（§11 迁移表） |
| F18 | `docs/view/scene/battle/view-scene-battle-design.md` / `ui-handoff.md` / `RESUME.md` / 本文 §14 | **收尾更新** | 状态、待核关闭情况、门禁数字 |

**不改**：`host.js` 的 `openPanel/closePanel/panelStack` 语义与调用契约、`hintbox.js`、`restartFighterStage` 的 clip 词表与 `STEP_MS`、`resultView.js`（B5 前沿用）、`game/core/**`、`game/logic/**`、`tools/difftest.mjs`、地图 HUD（`view/hud/**`、`.rbh-*`）。

---

## 2. 本轮坐实的新事实（关掉设计 §10 三项，改判一项）

### 2.1 buff 图标路由 = `Resources/Buffs/{resId}.png`（**设计 §10 #3 关闭**）

链路（全部实读）：
`BattlePetBuffBlockView.cs:26` → `button.SetSprite(buff?.info?.icon ?? SpriteSet.GetDefaultIconSprite(true))`
→ `BuffInfo.cs:40 icon => GetIcon()` → `GetIcon()` 里 `RM.GetLocalAddressables<Sprite>("Buffs/" + resId, IsMod(resId))`
→ `HelperUI.cs:200` 缺省图标 = `Panels/OldPetBag/Sprites/{bold?87:85}`。

`resId` 在 core 有现成只读字段：`buff-info.ts:134 this.resId = parseIntOrThrow(dictGet(o,'res', String(this.id)))` ⇒ **`res` option 覆盖、缺省 = buffId**。

在盘实测：`projects/Seer2-Restart-Lite-main/Resources/Buffs/` = **1012 张 PNG，100×100 源**；抽样 `1 / 61 / 500001(晴天) / 500002(雨天) / -10(命中弱化)` 全在 ⇒ 设计里那颗「星形徽章包宠脸」的疑问解除：**就是 buff 图标本身**，格子底另用 `85.png`。

URL 根与头像同规（`restartPortrait.js:8` 已验证的挂载点）：
```
/projects/Seer2-Restart-Lite-main/Resources/Buffs/{resId}.png
```

### 2.2 敌方底板 = `Player hp bar.png` 镜像（**设计 §10 #2 关闭**）

`Fight.unity` 的 `m_Sprite` GUID 反查（脚本化跑过一遍）：**`Player hp bar.png` 恰好被 2 个 `Status Bar Bg` 引用**，而 `hp bar.png`（271×19）与 `Boss hp bar.png`（**实测 798×128，不是设计表里的「—」**）在场景里**零引用**。
⇒ 我/敌两块共用同一张 381×110，敌方靠 RectTransform 镜像；**本轮不做 BOSS 战换底**（`Boss hp bar.png` 的引用点未坐实，登记 B6）。
另坐实：`Status indicator.png` 被 6 个 `Status Indicator` 引用、`hp bar mask.png` 被 6 个 `Hp Bar` + 6 个 `Corrupt Bar` 引用 ⇒ 场景里有 **3 倍于可见两块** 的模板节点（未激活的变体：替身/2v2/BOSS）。**本轮只画 driver 真给的两块**。

### 2.3 记录把手 = 骑在面板沿上、随折叠位移 ±180（**设计 §10 #1 关闭**）

`BattleOptionView.cs:46-61`：
```
isOn = isRecordPanelActive
recordExtendButton.image.rectTransform.anchoredPosition.y += (isOn ? -1 : 1) * 180
recordExtendButton.SetMode(isOn)
recordScrollRect.verticalNormalizedPosition = 0
recordPanel.SetActive(!isOn)
```
⇒ 把手**不是**固定在底栏角的独立件，而是跟着面板走的沿贴件：展开态贴面板**上沿**（设计 y≈241）、收起态贴**下沿**（y≈421）。截图量测把手 `56×15 @ (552..608, 421..436)` ⇒ 与收起态吻合，`x` 固定在 552（面板 280..640 内偏右）。
`Awake`（`:39-43`）里 `isRecordPanelActive` 为真就 `Toggle` ⇒ **默认收起**，与「截图那一格是空的 ⇒ 不画」一致。
**唯一残留待核**：`ExtendButton.cs` 的 `openSprite/closeSprite` GUID 在 `Fight.unity` 里没直读到（可能经 PrefabInstance 覆盖）⇒ 先按 **收起态 = `Map/up.png`（向上拉出）/ 展开态 = `Map/down.png`** 实现并记 `data-tbd="handle-sprite"`，B5 实测定案。

### 2.4 条是**一层**：`hp bar mask.png` 自己按宽缩放 + 被染色（不是渐变、不是 `fillAmount`、也没有独立轨道）

`BattlePetStatusView.cs:55-62`：被 `SetSizeWithCurrentAnchors(Horizontal, percent × hpBarLength)` 改尺寸的那个 RectTransform，**就是持有 `hp bar mask.png` 的那张 `Image` 本身**（`hpBarImage.color` 同体染色）。`hpBarLength=260 / angerBarLength=246`（`:9`）。
⇒ 上游没有「轨道 + 填充」两层：槽形画在 **`Player hp bar.png` 底板**里，条只有**一条**。
⇒ CSS 等价 = **`mask-image` + `background-color`**（正是 Unity `sprite × m_Color` 的语义）：
```
.rbb-hp-fill    { width = frac × 260; height:18; background-color: hpColor(frac);
                  -webkit-mask: url(hp bar mask.png) 0 0 / 100% 100% no-repeat }
.rbb-anger-fill { width = frac × 246; height:12; 固定红; mask: url(anger bar mask.png) … }
```
遮罩 PNG 实测 **282×18 / 261×18**，比轨长多 22 / 15（两端斜切帽）⇒ 满血时**被压到 260 / 246**，这是上游既有行为，别"修"成原尺寸显示。
起点：我方左对齐、敌方右对齐（`.rbb-plate--op … { left:auto; right:0 }`）—— 截图坐实敌怒 20/100 的红段贴右。
**harness 判据 4 直接量这条的 `width`**（±1px），并量 `getComputedStyle().backgroundColor`。

### 2.5 HP/怒数字：上游是**两个独立 Text**，斜杠是静态节点

`BattlePetStatusView.cs:12-13 + :50-52 / :93-95`：`currentHpText.text = hp`、`maxHpText.text = maxHp`，**代码从不写 `/`**。
⇒ 斜杠是场景里的静态文本/图形节点。DOM 侧照抄三段式：`.rbb-hp-cur`（右对齐）+ `.rbb-hp-sep`（固定居中）+ `.rbb-hp-max`（左对齐），数字字体 Mini Diamond，`/` 用同字体字符（不引图）。怒条同构。

### 2.6 字体：TTF 直引，TTC 只取首字面（诚实降级）

`Assets/Resources/Fonts/` 在盘：`Mini Diamond.TTF` / `Zongyi.TTF` / `MSJH.TTC` / `Simsun.TTC`（各自另有 `*.SDF.asset`，那是 TextMeshPro 用的，Web 侧无关）。
⇒ `@font-face` 直接引 TTF（同源静态服务，无授权外的网络请求）：**B1 只引 `RbbNum`（Mini Diamond）与 `RbbUi`（Zongyi）**，两款是数字/LV/页签的命脉；`MSJH/Simsun` 是 **TTC 集合**，Chrome 只认首字面且子集不明 ⇒ **不引**，名牌/战报继续系统 CJK，打 `data-font-fallback="cjk"`（设计 §10 #5 按此收口）。

---

## 3. F1 `host.js` 施工图（本轮唯一动宿主的理由）

### 3.1 问题

地图 HUD 靠 `EDGE=6` 补偿活下来了（`docs/view/scene/room/view-scene-hud-impl.md §12.2`）：`#wrap` 固定 1200×660、画布固定 960×540、`scale = 1200/960 = 1.25` ⇒ 画布高 675 > 660，上下各被 `overflow:hidden` 裁 6 设计 px。
战斗版式的**血牌贴在 y=0、底栏贴在 y=540** ⇒ 那 6px 会直接削掉顶带和底栏。Unity 靠**高度随窗口变**（`m_MatchWidthOrHeight = 0` 纯按宽）消化，我们得把这条口径真正落地。

### 3.2 契约（新增，不破坏既有导出）

```js
export function setCanvasMode(mode)   // 'fixed'（默认，地图 HUD）| 'match'（战斗）
export function getCanvasInfo()       // { scale, refW:960, refH, mode }  ← harness 量盒时先读 scale
```

`fit()` 改为分模式：
```
s = wrap.clientWidth / REF_W
fixed:  refH = REF_H; y = (wrap.clientHeight - REF_H*s)/2;  shell.transform = translateY(y) scale(s)
match:  refH = wrap.clientHeight / s; y = 0;                 shell.transform = scale(s)
        root.style.setProperty('--rv-h', refH + 'px')       // .rv-panel 高度吃这个变量
```
`ensureLayer()` 每帧重算 + `ResizeObserver` 的现有行为不变（那两个坑已经踩过一次，别回退）。
`openPanel/closePanel/panelStack` 签名与语义**零改动**。

对应 CSS：
```css
#rv .rv-panel { position:absolute; left:0; top:0; width:960px; height:var(--rv-h,540px); pointer-events:none; }
```
⇒ 地图 HUD 的 `--rv-h` 未定义 ⇒ 回落到 540px，**逐字节同今天**。

### 3.3 全屏舞台（设计 §2.3）

战斗 HUD 模式下 `#wrap` 铺满视口，页面 chrome（`h1 / #rvbar / #bar / #log`）隐藏但**不删**（`display:none` 保 `textContent` 可读，selftest 与两个 harness 仍在读 `#log`）。全部收在 `ui.css` 的新段里，`index.html` **零改动**：

```css
body.rbb-full          { overflow:hidden; }
body.rbb-full h1, body.rbb-full #rvbar,
body.rbb-full #bar     { display:none; }
body.rbb-full #log     { display:none; }              /* 读数搬家到 data-*，见 §8.4 */
body.rbb-full #wrap    { position:fixed; inset:0; width:100vw; height:100vh; margin:0; }
body.rbb-full #rv      { width:100%; height:100%; }
```
`body.rbb-full #wrap` 的特异度 (1,1,1) 压过 `index.html` 内联的 `#wrap` (1,0,0) —— 已核。
**AS3 线永不加这个 class ⇒ 那条线逐像素不变**（铁律 3）。

### 3.4 F14 舞台层跟随（不能拖后腿的最小改动）

`.rb-stage-box` 今天硬编 1200×660。全屏下必须跟着视口宽缩放，否则背景只占左上角。
改法（**演出逻辑、`offsetX/offsetY`、`STEP_MS`、clip 词表全不动**）：三层 `#rb-bg/#rb-fL/#rb-fR` 包进一个 `#rb-stage`，`transform-origin:0 0`、`transform: scale(wrapW/1200)`，随 `ResizeObserver` 重算。
- 1200 宽时 `scale = 1` ⇒ `rbattle-stage-test.mjs` 的几何判据逐字节同今天。
- 1920 宽时 `scale = 1.6`（舞台）vs `2.0`（chrome）—— 两套缩放系数的差 = 设计 §10 #7「宠站位换算」，**登记为已知近似**，B5 与 U5 时序合流时一并校。

---

## 4. F2 `_kit.js` 施工图

现状已有 `sprite/bg/mapSprite/mapUrl/el/text/elementName/elementColor/bar` —— **全部保留**（`bar()` 被 `restartHudView`/`resourceView`/`restartItemBagView` 复用，删不得）。新增：

```js
const BUFF  = '/projects/Seer2-Restart-Lite-main/Resources/Buffs'
const PETIC = '/projects/Seer2-Restart-Lite-main/Resources/Pets/icon'
const ELEM  = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Elements'   // 实测 26 张 0..25
export const buffIconUrl  = (resId) => `${BUFF}/${resId}.png`          // resId 读 core 的 BuffInfo.resId
export const petIconUrl   = (petId) => `${PETIC}/${petId}.png`         // 990 张，U3 既定路线
export const elementIcon  = (elemId) => `${ELEM}/${Number(elemId)}.png` // 0..25 在盘（实测 26 个）

// 挂载图片并自陈缺失：拿不到就不画，DOM 上留痕，绝不换图（铁律 5）
export function mountImg(node, url, { onError } = {}) { ... node.dataset.assetMissing = file ... }

// 血条：外层遮罩原尺寸、内层轨长 × 比例、纯色分段（§6.2）
export function fitBar({ trackCls, maskUrl, trackLen, barH }) → { track, fill, set(frac, colorCss) }

// 锚定盒：top/bottom 两态，替代旧 slot()
export function anch(cls, box, edge = 'top')   // box=[l,t,w,h]; edge='bottom' ⇒ bottom = refH-(t+h)
```

`elementName/elementColor` 保留给降级色块与 tooltip，但**主呈现改 PNG**（不再拿 CSS 色当属性图标）。

---

## 5. 类名契约表（DOM ↔ CSS ↔ harness；改这表必须同步 F15/F16）

| 类名 | 区 | 谁建 | harness 断言点 |
|---|---|---|---|
| `.rbb-topband` | 容器 | F12 场景 | 存在；盒 `(0,0,960,110)` |
| `.rbb-plate` `--my` `--op` | R1 | F3 | 两块同在 `y[0..110]`；x `[0..400]` / `[560..960]` |
| `.rbb-plate-bg` | R1 | F3 | 背景 = `Player hp bar.png`（**断言 CSS 无 `hp color.png`**） |
| `.rbb-portrait` | R1 | F3 | `data-portrait ∈ {png,fb}`；无空图 |
| `.rbb-numlabel` | R1 | F3 | `Status indicator.png`，**无 DOM 文字** |
| `.rbb-hp` / `.rbb-hp-fill` | R1 | F3 | `fill.width == round(hp/maxHp×260)` ±1 |
| `.rbb-anger` / `.rbb-anger-fill` | R1 | F3 | `fill.width == round(anger/maxAnger×246)` ±1 |
| `.rbb-hp-cur` `.rbb-hp-sep` `.rbb-hp-max` | R1 | F3 | 三段文本 == `hp` `/` `maxHp` |
| `.rbb-anger-cur` `.rbb-anger-sep` `.rbb-anger-max` | R1 | F3 | 同上 |
| `.rbb-lvlabel` `.rbb-lvnum` `.rbb-elem` | R1 | F3 | LV 数字 == `pet.level`；`.rbb-elem` 有 `data-elem-id` |
| `.rbb-name` | R1 | F3 | `pet.name`；`data-fit` ∈ `{12,10}` |
| `.rbb-petnum` / `.rbb-bead` | R1 | F3 | 恰 6 颗；`data-state ∈ {has,has-dead,no}`；pitch 13 |
| `.rbb-buffs` / `.rbb-buff` | R1 | F5 | 格 32×32；`.rbb-buff[data-buff-id]`；`value==0` 时无 `.rbb-buff-val` |
| `.rbb-round` / `.rbb-round-txt` | R2 | F4 | 文本 `/回合\n\d+/`；盒 `(430,10,100,50)` |
| `.rbb-statebuffs` / `.rbb-buff` | R2 | F5 | **无天气且无全局 buff ⇒ 子节点数 0**；有天气 ⇒ 首格 `data-buff-id == weatherBuff.id` |
| `.rbb-bottombar` | R4 | F6 | 盒 `(0,425,960,115)`，`bottom:0` 贴边 |
| `.rbb-superskill` / `.rbb-super-layer` | R4 | F6 | 3 层；`data-ready ∈ {0,1}`；`1` 时 `.rbb-super-layer--shine` |
| `.rbb-content` / `.rbb-page--*` | R4 | F6 | **同屏只有一个 `.rbb-page` 非 `hidden`**（钉死 S3） |
| `.rbb-options` / `.rbb-option[data-mid]` | R4 | F6 | 恰 5 张；字标是 PNG；选中 `.rbb-option--on` |
| `.rbb-option--live` | R4 | F6 | 可点判据（**替代旧 `--active`**，F17） |
| `.rbb-skills` / `.rbb-skill[data-skill-id]` | R6 | F7 | ≤4 张、pitch 175、卡 `155×82`；**无「无操作」文本**（钉死 S2） |
| `.rbb-skill--off` | R6 | F7 | 不可用置灰，读 `skillList().usable` |
| `.rbb-auto` / `.rbb-auto-check` | R4 | F6 | 仅 `settings.isAutoOK` 才建 |
| `.rbb-noop` | R4 | F6 | `flip.png` 40×40；`disabled` == 「有可用技能」 |
| `.rbb-record` / `.rbb-record-body` / `.rbb-line` | R5 | F10 | 收起态 `display:none`；展开后行序 == `reports()` |
| `.rbb-extend` | R5 | F10 | 骑沿、`--up/--down` 两态 |
| `.rbb-result` | 结算 | `resultView.js`（沿用） | F16/F17 继续按它判收尾 |

**退役**：`.rbb-hud` `--player` `--enemy`、`.rbb-slot-{weather,record,skill,option}`、`.rbb-head`、`.rbb-hprow` `.rbb-angerrow`、`.rbb-angertxt` `.rbb-hptxt`、`.rbb-buffwrap`、`.rbb-weather`、`.rbb-skill--super`（必杀改走独立槽）、`.rbb-skill-name`/`.rbb-skill-cost`（换成 §5 表内新名）、`.rbb-option-label`、`.rbb-picker*`（弹层改页面）。
`.rbb-bar-fill` **保留**（`.rbh-hp`、`.rbp-hp` 两条地图/背包规则在用），但战斗内不再产出这个类。

---

## 6. 逐模块施工图

### 6.1 F3 `fightPlateView.js`（R1，替 `resourceView.js`）

```js
export function create(container, side, A) → { update(driver, pet) }
// side ∈ 'my'|'op'；A = 内容 getter 集合（driver + content 只读投影），模块不认识任何面板
```

DOM（全部 `anch(..., 'top')`，盒相对 `.rbb-plate` 的 `(0,0,400,110)`，取设计 §4.1 表）：

```
.rbb-plate .rbb-plate--my
├ .rbb-plate-bg              (0,0,381,110)   Player hp bar.png
├ .rbb-portrait              (4,5,75,75)     petIconUrl(pet.baseId ?? pet.id)  ← 见下「键」
├ .rbb-numlabel              (85,10,26,38)   Status indicator.png（无文字）
├ .rbb-hp                    (111,10,260,18)  ← 就是条本身（mask-image + 染色），无独立轨道
│ └ .rbb-hp-fill                            width = frac × 260, background-color = hpColor(frac)
├ .rbb-hp-cur/.rbb-hp-sep/.rbb-hp-max       压在 .rbb-hp 上居中（Mini Diamond 14 白 + 黑描边）
├ .rbb-anger                 (111,32,246,12) 同构，轨长 246，固定红
├ .rbb-anger-cur/.rbb-anger-sep/.rbb-anger-max
├ .rbb-lvlabel               (85,52,27,13)   Level indicator.png
├ .rbb-lvnum                 (109,52,30,20)  Zongyi 16 白 = pet.level
├ .rbb-elem                  (145,54,12,16)  elementIcon(pet.battleElement)
├ .rbb-name                  (6,85,70,20)    青 #52E5F9，fit = name.length<6 ? 12 : 10
├ .rbb-petnum                (5,113,85,20)   6 颗 .rbb-bead，pitch 13
└ .rbb-buffs                 (175,52,225,95) F5 网格（我方左起、敌方右起）
```

**镜像**：`side === 'op'` ⇒ 容器 `transform: scaleX(-1)` 只作用于 `.rbb-plate-bg` 与两条 `.rbb-*bar` 的**起点方向**（CSS 变量 `--rbb-origin: right`），**文字与头像不镜像**（否则数字反写）。
⇒ 实现口径：`.rbb-plate--op` 加 `data-side="op"`，CSS 用 `.rbb-plate--op .rbb-hp-fill { left:auto; right:0 }`（截图坐实：敌怒 20/100 的红段贴右）。六珠双方**都从左往右数**，不镜像。

**头像键**：设计表写 `pet.baseId`。实测 `hostPetView.js` 同时填 `this.id = cfg.petId` 与 `_baseId = cfg.baseId`，而 `Resources/Pets/icon/` 是 **petId 命名**（`100010.png` 等 990 张）⇒ **取 `pet.id ?? pet.baseId`**，缺位走元素色块 + 名首字（同 `restartPortrait.js` 的降级纪律）。这条是设计表的一处笔误，登记 §14。

**`update()` 零算数清单**：只有两处算数 —— `frac = hp/maxHp`（§2.4 轨宽）与 `hpColor(frac)`（§6.2）；其余全是读数。

### 6.2 HP 色（上游逐字搬，不发明）

`BattlePetStatusView.cs:59-62`：
```
p >= 0.5 ? lerp(#FFFF00, #77E20C, (p-0.5)*2) : lerp(#FF0000, #FFFF00, p*2)
```
CSS 侧写成 `hpColor(p)` 返回 `rgb(...)`，**满血必须恰好 `rgb(119,226,12)`**（harness 判据 4）。怒条固定红 = 场景 `m_Color`，取 `#FF3B30` 系（**B2 实读该节点 m_Color 后定值**，不许拍脑袋当 golden）。

### 6.3 F4 `roundPlateView.js` + F5 `buffGridView.js`

回合板（上游 `UI Layer/Weather` 节点，只管文本）：黑底 = 内置白图染黑 + Outline ⇒ CSS `background:#000; box-shadow:0 0 0 2px rgba(255,255,255,.85); border-radius:6px`；文本 `回合\n` + `driver.turn()`，16px Bold、`#52E5F9`、`line-height:1.1`、居中。盒 `(430,10,100,50)`。
**不用** `battle indicator.png`（场景零引用，设计 §4.2 已判）。

`buffGridView.js`（**一个模块两种用法**，上游 `BattlePetBuffView` 本来就只有一份逻辑）：
```js
export function create(container, { layout = 'left' }) → { update(buffs) }
// buffs = 已投影的 [{id,name,resId,value,turn,hide,sortPriority}]；过滤与排序在模块内做（§0.2 允许项）
```
- 过滤 `hide`、按 `sortPriority` **排序**（上游 view 行为）。
- 格 32×32、pitch 32、一行 7；超过 7 格追加「展开」虚拟格（B3 先不接，超过就裁掉并 `data-truncated`）。
- 格内：`85.png` 底 + `buffIconUrl(resId)`（缺 → `data-asset-missing` + 名首字）+ 右下 `value`（**`value === 0` ⇒ 不建该节点**，`BattlePetBuffBlockView.cs:33-37` 权威）。
- `title` = `name` + 剩余回合（现读 `buff.turn`；**上游是 view 直读，不本地倒数** —— core 未接 RoundStart 倒数，静态初值口径沿用 `buffView.js` 头注那句）。
- **天气 = 首格**（`BattleSystemView.cs:123-137` 权威）：`stateBuffs = [weatherBuff, ...state.stateBuffs]`，`weather === 0` ⇒ 不插 ⇒ **`无天气` 四个字彻底不出现**，`.rbb-statebuffs` 可以为空（设计 §6.6 的裁决落地）。

### 6.4 F6 `bottomBarView.js`（R4，本轮最重的一个）

```js
export function create(container, { driver, pages, onAuto, onNoop, onSuper }) → { update(), select(i) }
// pages = { 0:skillPage, 1:changePage, 2:capturePage, 3:itemPage, 4:escapePage, 5:opChangePage }
```
底栏盒 `(0,425,960,115)` `bottom:0`，底图 `Bottom bar.png`（960×115，原尺寸）。

页签簇 `(773,429.5,185,110)` 内 5 张字标（设计 §4.4 表逐格搬），**字标全 PNG、无 DOM 文本**：
`精灵 pet normal/chosen.png` · `捕捉 catch normal/chosen.png` · `战斗 battle normal.png`（选中叠 `battle outline.png` + `battle split line.png`）· `道具 Item normal/chosen.png` · `逃跑 escape normal/chosen.png`。
> `battle chosen.png` **实测不存在** ⇒ 「战斗」选中态 = `normal` + `outline`（设计 §4.4 已写对，这里只是把它钉死，别写出不存在的文件）。

互斥（`BattleOptionView.cs:34` `options[i].SetActive(i == index)` 的 DOM 等价）：`.rbb-content` 下每页一个 `.rbb-page--*`，`select(i)` 只把第 i 页 `hidden=false`，其余 `hidden=true`。

可用性与 gating（**读数全在 driver**，§9）：
| 页 | 可点判据 | 不满足时 |
|---|---|---|
| 0 战斗 | 恒可点（`defaultOptionIndex`） | — |
| 1 精灵 | `myBag()` 里有第二个活宠 | `--off` + tooltip |
| 2 捕捉 | `settings.isCaptureOK` 且重启态且当前宠在场是野怪（**内核判**，UI 只读 `driver.settingsView().isCaptureOK`） | `--off` + tooltip「PVP/BOSS 不开放」 |
| 3 道具 | `settings.isItemOK`（当前 settings 传 `false`） | `--off` + tooltip「道具支未接（BeforeAttack.addReport NOT_PORTED）」 |
| 4 逃跑 | `settings.isEscapeOK`（**as-built：缺省已放开 = `true`**，见 §15） | `--off` + tooltip「本局设置不允许逃跑」 |
| 5 对方 | `settings.isReveal`，否则**不切页**并弹 Hintbox「当前模式下，对手阵容不公开！」（`:63-` 权威） | 同文案 |
手牌（6）本轮不建（`mode !== Card` ⇒ 上游也不建）。
`setInteractable(false)` ⇒ 全簇 `--off` + `select(0)`（回合结算中/动画未完；B5 才真接）。

必杀槽 `(1,431,70,105)`：3 层 `.rbb-super-layer` 叠同一张 `Super skill indicator.png`（53×77 居中）。
`data-ready = super.usable ? 1 : 0`；`1` ⇒ 第 0 层加 `--shine`（CSS `filter: drop-shadow + animation` 近似 `ParticleAfterburner.mat`，登记为**近似**）。
**按钮永远可点**（`BattlePetSkillView.SetSuperSkillInteractable` 权威：`clickable` 为假时点击 return，不是灰化），点击只在 `usable` 时 `onSuper(skillId)`。

自动战斗 `.rbb-auto` `(788,390,110,30)`：**仅当 `driver.settingsView().isAutoOK` 才建**（`:37` 权威）。黄 Outline 胶囊 + `check.png` 25×19 勾选框 + Zongyi 16 `#FFCC33`「自动战斗」。本轮只做**开关态呈现**，出招顺序输入推到 B6（点了以后弹 Hintbox 的占位文案照抄设计 §4.4）。

绿圆钮 `.rbb-noop` `(908,382.5,40,40)` = `Map/flip.png`（54×54 源）。语义 = **无操作/跳过本轮**。
`disabled == driver.hasUsableSkill()` —— 上游 `interactable = (mode == Card) || 没有任何可用技能`，**我们照抄这条反向逻辑**（有可用技能时它不该抢主路径）。点击 ⇒ `onNoop()` ⇒ `driver.pass()` + `nextRound()`。

### 6.5 F7 `skillCardView.js`（R6）

`.rbb-skills` 在 `.rbb-page--skill` 内。4 固定槽，**空槽不建节点**（上游 `SetActive(false)`）。
卡盒 `155×82`，`x_i = 80 + 175*i`（**pitch 175 权威 = `BattlePetSkillView.ShowNormalSkillInfo` 的 `80 + 175*index`**），卡顶 ≈ 447（Content 中心 487.5 垂直居中）。
底 `Skill normal.png`；**可用性只读 `driver.skillList().usable`**；不可用 ⇒ `.rbb-skill--off`（`filter:grayscale(.6)`）。
卡内：属性徽章 `elementIcon(skill.elementId)`（左圆环内）· 技能名 **`font-size = 20 − max(name.length,6)`** · `威力: {power}` · 左下分类 · 右下消耗（`rule === PP` ⇒ `PP: {pp}/{maxPP}`，否则 `怒气: {anger}`）。
`type === 被动` 的卡：不绑 `onclick`、`cursor:default`（上游 `SelectNormalSkill` 直接 return）。
**删除**常驻「无操作」卡（`skillView.js` 里那一行）—— 它现在是 §6.4 的绿圆钮。
必杀**不进**这个网格（它在 `.rbb-superskill`）。

### 6.6 F8 `petChangeView.js` / F9 `itemBoardView.js`

换宠页：6 个 `Pet change option.png`（88×93）槽，数据 = `driver.myBag()`；在场宠叠 `current fight.png`（53×39）；`isDead` ⇒ `--off`；点 ⇒ `onSwitch(index)` ⇒ **内核 `driver.switchPet()` 真结算**（`rbattle-switch-test.mjs` 的语义不变）。
⇒ 头注里那句「`openSwitchPicker` 弹层」作废：换宠从**模态弹层**改成**底栏页**。这是 IA 的正解，也是 F17 要改选择器的原因。

捕捉/道具页：8 个 62×62 格（底 `OldPetBag/87.png`，源 89×89 ⇒ 缩放画），数据 = 存档胶囊列表（现 `ownedCapsules()`，读数不动）；`count === 0` ⇒ `--off`；点 ⇒ `driver.useCapture(row)` **真结算**（`rbattle-capture-test.mjs` 语义不变）。
道具页 `isItemOK === false` ⇒ 建页但整页空态一行「道具支未接」，**不画假物品**（铁律 5）。

### 6.7 F10 `recordPanelView.js`（R5）

面板盒 `(280,245,360,180)`，**默认收起**（§2.3）。正文 12px 白、SIMSUN→系统 CJK 降级、`white-space:pre-wrap`、宽 350、贴顶左；每次刷新后 `scrollTop = scrollHeight`（上游 `verticalNormalizedPosition = 0`）。
战报**剥富标签**沿用 `recordView.js` 那句 `replace(/<[^>]*>/g,'')`（表现层，不动数值）。
把手 `.rbb-extend` `(552,421,56,15)`，`--up`（收起）/ `--down`（展开），点击 ⇒ 面板显隐 + 把手沿 `y ± 180`（**位移 180 是代码权威**）。
`.rbb-record` 收起态 = `display:none` ⇒ harness 判据「收起态与截图一致」。

### 6.8 结算层

`resultView.js` **本轮不动**（`rbattle-{encounter,restart-save,stage}-test` 都在断 `.rbb-result`）。B5 再按 `BattleResultView` 的盒重排（`fight result back.png` 961×319 原尺寸居中）。

### 6.9 时序与动画门控（推到 B5）

本轮 HUD 全部**瞬时态**：`driver.onRender` → `renderAll()` 一次画完。
上游 `isHpDone/isAngerDone/isCorruptDone` 三闸门 + `speed = 0.005 + 0.01×max(0,(Δ%−30)/70)×battleAnimSpeed` 的逐帧逼近，**必须与 U5 舞台的 `STEP_MS=650` 一起设计**，否则两条时间线互相插队。B5 做时把闸门放 view 侧（`isDone` 是呈现态，不是业务判定）。

---

## 7. F11 CSS 施工图

几何全部取设计 §4 / 本文 §6 的盒，960 设计 px、`#rv` 前缀（特异度纪律同 `hud-impl §5`）。要点清单：

| 选择器 | 要点 |
|---|---|
| `body.rbb-full *` | §3.3 那 6 条，**只此一处**动页面 chrome |
| `#rv .rv-panel` | `height:var(--rv-h,540px)`（§3.2） |
| `.rbb-topband` | `left:0 top:0 width:960 height:110; pointer-events:none` |
| `.rbb-plate--my` / `--op` | `top:0; left:0` / `right:0; width:400 height:110` |
| `.rbb-plate-bg` | `Player hp bar.png` `background-size:100% 100%`；`--op` 用 `transform:scaleX(-1)` 单独翻底图 |
| `.rbb-hp` / `.rbb-anger` | 条的容器 = 轨长盒（`260×18` / `246×12`），**底色透明**（槽形在底板 `Player hp bar.png` 里） |
| `.rbb-hp-fill` | `position:absolute; left:0; top:0; height:18px; width = frac×260`；`background-color` 分段；`-webkit-mask:url(hp bar mask.png) 0 0/100% 100%`；`--op` ⇒ `left:auto; right:0` |
| `.rbb-anger-fill` | 同构，`width = frac×246`、`height:12`、`anger bar mask.png`、固定红 |
| `.rbb-hp-cur/.rbb-hp-sep/.rbb-hp-max` | 绝对居中于 `.rbb-hp`，`font-family:"RbbNum",...; font-size:14px; color:#fff; text-shadow:0 1px 0 #000, 0 0 3px #000`；三段各自 `text-align` |
| `.rbb-bead` | `14×19`，`--has`= `Pet yes.png`、`--no`= `Pet no.png`；`data-dead` ⇒ `filter:grayscale(1) brightness(.75)`（对应上游 `Color.gray`） |
| `.rbb-buffs` / `.rbb-statebuffs` | `top:0; left:175`（我）/ `right:175`（敌）/ 全局 `(432,65,100,110)`；格 `32×32` `85.png` 底 |
| `.rbb-round` | `(430,10,100,50)` 黑底 + 白 Outline + `#52E5F9` 文本 |
| `.rbb-bottombar` | `left:0 bottom:0 width:960 height:115`，`Bottom bar.png` `background-size:960px 115px` |
| `.rbb-superskill` | `left:1px bottom:4px 70×105`（内置白图染黑）+ 三层 `Super skill indicator.png` |
| `.rbb-option` | 4 小 `84×32` + 1 大 `180×103`；**无 DOM 文本**；`--on` 换 `chosen` 图（战斗页用 `outline` 叠层）；`--off` `opacity:.45` |
| `.rbb-skill` | `155×82`，`background:Skill normal.png`；`left = 80 + 175*i`；`--off` 灰化 |
| `.rbb-record` | `(280,245,360,180)`；收起 `display:none` |
| `.rbb-extend` | `56×15`，`--up/--down` 两图，`transition` 无（点击瞬时） |
| `.rbb-auto` / `.rbb-noop` | 按 §6.4 盒 |
| `@font-face` | `RbbNum` ← `Mini Diamond.TTF`、`RbbUi` ← `Zongyi.TTF`（**§2.6**） |

**删除（本轮必须见到 diff 里有这两行的移除）**：
- `ui.css:87` `#rv .rbb-hp .rbb-bar-fill { background-image:url("…/Fight/hp%20color.png") }`
- `ui.css:230` `#rv .rbp-hp .rbb-bar-fill { background-image:url("…/Fight/hp%20color.png") }`
  ⇒ 背包血条改 `background:#77e20c`（同 `.rbh-hp`，`docs/view/scene/room/view-scene-hud-impl.md §10` 那句「地图线纯绿、战斗线渐变」是误记，顺带在 `docs/view/scene/room/view-scene-hud-design.md:10` 修正）。
  已核：`rbag-restart-hud-bag-test.mjs` **不**断 `.rbp-hp` 的背景图/色 ⇒ 这处改动不牵动地图线 harness；若实现期发现新依赖，按 §11 口径改断**颜色**而非删断言。

---

## 8. F12 `rbattleScene.js` 接线（最小 diff）

### 8.1 装配段重写（`:200-260` 一带）

删掉 `slot(root, cls, …)` 那个局部 helper 与六槽声明，换成按 §3 节点树建层：

```js
const band = anch(root, 'rbb-topband', [0, 0, 960, 110])
const myPlate = anch(band, 'rbb-plate rbb-plate--my', [0, 0, 400, 110])
const opPlate = anch(band, 'rbb-plate rbb-plate--op', [560, 0, 400, 110])
const roundBox = anch(band, 'rbb-round', [430, 10, 100, 50])
const stateBox = anch(band, 'rbb-statebuffs', [432, 65, 100, 110])
const record = anch(root, 'rbb-record', [280, 245, 360, 180])
const bar = anch(root, 'rbb-bottombar', [0, 425, 960, 115], 'bottom')
```
`updXxx` 闭包集合与 `renderAll()` 的形状**保持不变**（`driver.onRender(() => renderAll())` 那条线不动，U5 的 `clipActions` 也不动）⇒ `window.__battle.render` 仍是 harness 的稳定抓手。

`renderAll()` 新增两行：`updState(driver.stateBuffsView(), driver.weatherBuffView())` 与 `updBar(driver)`；`updPlate` 从 `(driver, pet)` 改签名后仍逐字调 `driver.myPet()/opPet()`。

### 8.2 页签内容接线

`pages` 用**回调表**注入，场景不认识面板实现（同 `hud-impl §3.1` 的口径）：

```js
pages = {
  0: skillCardView.create(...),          // onSelect → act(id)
  1: petChangeView.create(..., { onSwitch: doSwitch }),
  2: itemBoardView.create(..., { onPick: doCapture, kind: 'capture' }),
  3: itemBoardView.create(..., { kind: 'item' }),        // isItemOK=false → 空态
}
onNoop = () => { driver.pass(); const r = driver.nextRound(); if (r.over) settleAndExit() }
```
`doCapture` / `doSwitch` / `advanceNoAction` / `settleAndExit` / `ownedCapsules` / `switchCandidates` **函数体不改**（它们是内核真结算 + save-side 落档，与版式无关）；只把「弹层」调用点改成「页」。

### 8.3 全屏与画布模式

```js
async function mountHud(query) {
  document.body.classList.add('rbb-full')
  setCanvasMode('match')
  …
}
export function unmount() {
  document.body.classList.remove('rbb-full')
  setCanvasMode('fixed')      // ← 必须还回给地图 HUD，否则 #/map 顶栏被拉高
  …
}
```
`mountSelftest()` **不加**全屏（它不建 HUD，且 `rbattle-selftest.mjs` 要读 `#log`）。
`exitToMap()` 与 hash 路由不变。

### 8.4 调试读数搬家

`#log` 隐藏后不删读数：`window.__battle.debug()` 返回 `{ engine:'restart', enc, isRestart, stageReady, turn, over }`，并把 `stage` 的 `[stage] op 动画状态…` 落进 `.rbb-plate--op` 的 `data-anim-states`。`rbattle-stage-test.mjs` 现在从 `stage` 对象直读，不受影响（已核）。

---

## 9. F13 `coreBattleDriver.js` 只读出口增补

全部是**转发**，无一条本地判定（新增代码只许读 `battle.currentState` / `settings` / `UnitPetSystem` 既有 getter）：

```js
settingsView() { const s = battle.currentState.settings; return {
  mode: s.mode, rule: s.rule, isReveal: s.isReveal, isAutoOK: s.isAutoOK,
  isCaptureOK: s.isCaptureOK, isItemOK: s.isItemOK, isEscapeOK: s.isEscapeOK,
  parallelCount: s.parallelCount, petCount: s.petCount } }
stateBuffs()   { return battle.currentState.stateBuffs.map(([, b]) => b) }        // [string,Buff] → Buff[]
weatherBuff()  { return battle.currentState.weatherBuff ?? null }                  // 天气即首格 buff（§6.3）
opBag()        { return battle.currentState.clientUnit.petSystem.petBag }
opCursor()     { return battle.currentState.clientUnit.petSystem.cursor }
bagCounts(side){ const ps = psOf(side); return { petNum: ps.petNum, aliveNum: ps.alivePetNum } }  // 六珠（§6.3 上游口径）
hasUsableSkill(pet) { return driver.availableSkills(pet).length > 0 }              // 绿圆钮可用性
```
- `buffsOf(side)` 已返回 `Buff[]` 原始对象 ⇒ **不改签名**，view 侧读 `b.info.resId / b.info.sortPriority / b.hide / b.value`（全 core 字段）。
- `opBag()/opCursor()/bagCounts()` 一律走 `masterUnit/clientUnit`（与既有 `myBag()`、`setBagStartHp()` 同源，`state.ts:539-540`）；**不用** `myUnit/opUnit` 那对 PVP 感知 getter（`state.ts:603-604` 在 `mode==PVP` 时要问 `NET.isMasterClient()`，UI 侧无谓引入那条分支）。
- `weatherInfo()` **保留**（`restart-save`/`encounter` harness 与地图线可能引用），新增 `weatherBuff()` 供图标/`value`。
- **不新增任何写操作**；`corrupt` 无出口 ⇒ 腐蚀条不画（§0.1）。
- 新增出口必须**逐个被至少一个 view 用到**，否则不加（防长出第二套“视图专用内核”）。

---

## 10. 退役与对账

| 旧件 | 处置 | 理由 |
|---|---|---|
| `resourceView.js` | **删** | 被 F3 取代；`grep -rn resourceView game/` 必须归零再删 |
| `weatherView.js` | **删** | 天气并入 F5 网格首格；「无天气」文案作废 |
| `buffView.js` | **删** | 被 F5 取代（底件 + `value` + 图标路由三条都变） |
| `skillView.js` | **删** | 被 F7 取代（常驻「无操作」卡是 IA 错） |
| `optionView.js` | **删** | 被 F6 取代（7 平铺槽是 IA 错，页签簇 + 互斥才是上游） |
| `recordView.js` | **删** | 被 F10 取代 |
| `captureView.js` | **删** | 被 F9 取代（弹层 → 底栏页） |
| `resultView.js` | **留** | §6.8，B5 再排 |
| `_kit.js` | **留 + 微增** | 地图 HUD 复用 `bar()`/`el()`/`text()` |
| `hp color.png` 两处 CSS | **删** | 场景零引用（设计 §5） |
| `.rbb-hud/.rbb-slot-*/.rbb-weather/.rbb-picker*` | **随模块删** | CSS 段同步清 |

删文件前跑一次静态引用扫描，避免留下 import 悬空：
```bash
grep -rn "resourceView\|weatherView\|buffView\|skillView\|optionView\|recordView\|captureView" game/ tools/
```

---

## 11. harness 迁移表（改选择器，不降断言）

| 文件 | 现断言 | 改成 | 语义 |
|---|---|---|---|
| `rbattle-hudtest.mjs` | `.rbb-hud--player/enemy` `.rbb-slot-*` 存在 | `.rbb-plate--my/--op` `.rbb-bottombar` `.rbb-options` `.rbb-skills` | 整件重写（设计 §11 已判旧 IA 不能当护栏） |
| ↑ | `.rbb-skill` 数 ≥ 1 且排除「无操作」文本 | `.rbb-skill[data-skill-id]` 数 == `skillList().normals.filter(Boolean).length`，**且断言无「无操作」节点** | 加强 |
| ↑ | `.rbb-bar-fill` 宽随伤害下降 | `.rbb-hp-fill` 宽 == `frac×260`（§2.4） | 换成绝对判据，比「下降」更强 |
| `rbattle-capture-test.mjs` | `.rbb-option` 含「捕捉」且 `rbb-option--active` | `[data-mid="capture"]` 且 `--live`，点它 → 页可见 → 点格 → `driver.useCapture` 真结算 | 只换选择器 |
| `rbattle-switch-test.mjs` | 同上「换宠」 | `[data-mid="change"]` + `--live`，页内 `.rbb-change-btn[data-index]` | 只换选择器；`switchCandidates` 语义不变 |
| `rbattle-encounter-test.mjs` | `panels == .rbb-hud 数` | `.rbb-plate` 数 == 2 | 等价 |
| `rbattle-{restart-save,stage}-test.mjs` | `.rbb-result` / `stage.*` | **不动** | 结算与舞台未改 |
| `rbattle-selftest.mjs` | `window.__rbattle` | **不动** | 无 HUD |
| `rbag-restart-hud-bag-test.mjs` | （已核：无 `.rbp-hp` 背景断言） | **不动** | §7 那处 CSS 变更不牵动它；21 条须保持全绿 |

---

## 12. 门禁与回归

```bash
node tools/rbattle-fight-layout-test.mjs      # 新建，F15
node tools/rbattle-hudtest.mjs                # 重写后全绿
node tools/rbattle-{capture,switch,encounter,restart-save,stage,selftest}-test.mjs   # 六个功能测试保持全绿
node tools/rbag-restart-hud-bag-test.mjs      # 21 条（地图 HUD，本轮不该动）
node tools/rbattle-hud-layout-test.mjs        # 27 条（地图 HUD 布局，本轮不该动）
node --test game/core/                        # 272/272  ← UI 线没越界的证据
node tools/difftest.mjs                       # 30316/29827/0/0/0 ← 同上
```
**每步必跑**，不是最后跑一次。后两条**不是本轮改动对象**：数字一旦变化 = 越界，立刻回滚查因。
截图留档：`node tools/rbattle-shot.mjs 0 /tmp/rb-fight-b<期>.png`，与 `battle.png` 并排目测；布局 harness 的 viewport 一律 **1920×1080**（⇒ `scale=2`、画布高恰 540，所有盒可直接按绝对值比，绕开 §3.1 的变量高度；地图 HUD 的两个 harness 保持 1200×720 不动）。

---

## 13. 构建顺序（每步可独立验，别一口气写完）

| 步 | 内容 | 自检 |
|---|---|---|
| **B1 版式归位** | F1 画布模式 + F11 全屏段 + F3/F4/F6/F7 骨架（底板/字标用真 PNG，读数先接名/级/HP） + F12 装配段 + F13 出口 + F14 舞台跟随 | `rbattle-fight-layout-test` 判据 1/2/3 绿；S1/S2/S3 三条钉子绿；截图与 `battle.png` 并排**不再出现斜对角血牌** |
| **B2 条与色** | §2.4 单层条（`mask-image` + 染色）、数字压条内三段式、敌方从右起算；删 `ui.css:87/230` | 满血 `rgb(119,226,12)`、50% 黄、10% 红；`fill.width == round(frac×{260,246})` ±1；`grep -rn "hp color.png" game/` 归零 |
| **B3 buff / 天气** | F5 网格（`85.png` 底 + `Buffs/{resId}.png` + `value`）；天气插首格；删「无天气」横幅；`.rbb-statebuffs` | 无天气且无全局 buff ⇒ **该区子节点数 0**；有天气 ⇒ 首格 `data-buff-id == weatherBuff.id`；`value==0` 无数字节点 |
| **B4 页签互斥 + 必杀 + 无操作 + 自动** | F6 `select()` 互斥、F8/F9 两页、绿圆钮可用性、必杀 `--shine`、`.rbb-auto` 仅 `isAutoOK` | 同屏只有一个 `.rbb-page` 可见；`select(5)` 在不公开时**不切页且弹 Hintbox**；capture/switch 两个 harness 全绿 |
| **B5 记录面板 + 把手 + 时序** | F10（默认收起、±180 骑沿、滚到底）；条动画 + `isDone` 与 U5 `STEP_MS` 合流；宠站位换算（§10 #7） | 收起态与截图一致；展开行序 == `reports()`；stage-test 仍全绿；pageerror 0 |
| **B6 缺件** | 副属性块、出招气泡、伤害/治疗/KO 数字层、专属动作、分身、双打、卡牌模式、BOSS 底板、腐蚀条 | 各自另立设计段，本文不承诺 |

---

## 14. As-built（B1–B5 落地后的实际口径，与 §3–§13 冲突时**以本节为准**）

### 14.1 几何：最终绝对盒（设计空间 960×540，与 §4/§5 逐格吻合，无一格跑偏）

harness `tools/rbattle-fight-layout-test.mjs` 里的 `WANT` 表就是本节的权威副本，**不另抄第二遍**；这里只留结构，加粗项另见下文：

| 件 | 盒 | 说明 |
|---|---|---|
| `.rbb-topband` | `[0,0,960,110]` | `pointer-events:none`，只当定位面 |
| `.rbb-plate--my` / `--op` | `[0,0,400,110]` / `[560,0,400,110]` | 同一模块 `fightPlateView.js`，`side` 只改镜像 |
| `.rbb-round` | `[430,10,100,50]` | 回合板，16px `#52E5F9` |
| `.rbb-statebuffs` | `[432,65,100,110]` | 天气占首格；无天气且无全局 buff ⇒ **子节点数 0**（不画「无天气」） |
| `.rbb-bottombar` | `[0,425,960,115]` | 底栏整条 |
| `.rbb-content` / `.rbb-options` | `[71.5,437.5,700,100]` / `[773,429.5,185,110]` | 内容区与页签簇互斥，同屏只 1 页可见 |
| `.rbb-super` / `.rbb-noop` | `[1,431,70,105]` / `[908,382.5,40,40]` | 必杀 3 层 + `data-ready`；绿圆钮 = `flip.png`，`disabled ⇔ 无可用技能` |
| `.rbb-extend` | `[552,421,56,15]`（收起）→ y=241（展开） | 骑面板沿 ±180，见 §14.2 ⑥ |
| HP / 怒（我方） | `[111,10,260,18]` / `[111,32,246,12]` | 敌方按 `x' = 400 − (x + w)` 镜像 |

### 14.2 被实测坐实/改判的施工图条目

| # | 施工图原说 | As-built | 证据 |
|---|---|---|---|
| ① | 设计 §4.1 头像键写 `baseId` | **`pet.id ?? pet.baseId`**（`_kit.js:44` `petIconUrl`） | `icon/` 那 990 张按 **petId** 命名，`baseId` 键大面积缺图 |
| ② | 「敌方 = 镜像」笼统一句 | **只有三件事镜像**：盒位 `mb()`、底板 `scaleX(-1)`、条起点 `left:auto; right:0`。文字与头像**不翻**（否则数字反写）；名牌另用 `text-align:right` 贴合右锚 | `fightPlateView.js:26` + `ui.css:97/107/124`；harness 用 `wantAnchor` 逐规则断言 |
| ③ | 怒条固定红待实读 `m_Color` | **`rgb(204,0,0)`** | `Fight.unity` 那张 Anger Bar `r:.8 g:0 b:0` ⇒ 0.8×255=204；不是 `#FF3B30` |
| ④ | `battle split line.png` 是 110×4 **横线** | **竖线**：SizeDelta (110,4) 但 `m_LocalRotation z=0.7071068` ⇒ 落屏 4×110 居中 | `ui.css:160` 注释 + `bottomBarView.js:78` |
| ⑤ | 页签选中态 = 字标 + outline + split line（未定叠序） | 叠序权威 = `Fight.unity` 该页签节点 `m_Children: [split line, outline, normal]`，**后建的盖在上面** ⇒ `normal` 字标压在 `outline` 之上 | 反过来的话 182×105 的青边暗底会把「战斗」两字糊掉 |
| ⑥ | §2.3 把手 `openSprite/closeSprite` 留 `data-tbd` | 按 **收起=`Map/up.png` / 展开=`Map/down.png`** 落地，`dataset.tbd='handle-sprite'` **保留不删**（GUID 在 `Fight.unity` 里确实直读不到，可能经 PrefabInstance 覆盖 ⇒ 诚实留痕，不算已证） | `recordPanelView.js:33-35`；B5 目测与截图同向 |
| ⑦ | §2.6 字体只引两款 | 实况照抄：`@font-face` 引 `RbbNum`(Mini Diamond) / `RbbUi`(Zongyi)，`MSJH/Simsun` 是 TTC、Chrome 只认首字面 ⇒ **不引**，CJK 继续走系统字 | `ui.css:88-90` |

### 14.3 度量学三条坑（harness 写法，下一期别再踩）

- **`getComputedStyle` 对绝对定位返回的是「用值」**：`left/right` 永远是具体 px，拿不到 `auto`。⇒ 方向（从哪边填充）**只能读声明的规则**，走 `document.styleSheets` 扫 `cssRules`（`fightPlate-test` 的 `anchoring` 段）。且基线规则不写 `right` 时 `r.style.right === ''`，**`'' ≡ 'auto'`**，不归一会全线假红。
- **`display:none` 的件量不到盒**（rect 全 0）。记录面板的默认收起态因此**不进静态盒表**，改走公共出口 `record.toggle()` 量开→收一个来回，并在断言末尾还原成 `none`（别把测试态留给下一个 harness）。
- **视口 1920×1080 是刻意的**：`match` 模式下 ⇒ `scale=2`、逻辑高恰好 540 ⇒ 所有盒可按绝对设计值直接比（`÷ scale`），绕开 §3.1 的变量高度。地图 HUD 那两个 harness 保持 1200×720 不动。
- **留档截图要等形象层**：舞台装载是异步的（`petContainer` 外层 200 → 内层 `{swfId}.swf` → 首帧），判据跑完立刻拍会留一张**场上没有宠**的图（DOM chrome 全在、形象层空 ⇒ 目测时会误判成回归）。⇒ 截图前 `waitForFunction` 两侧 `#rb-f*` 的 shadowRoot 里出现 `canvas` + 1.5s 定帧。**只影响留档，不影响判据**。

### 14.4 `router.js` 异步 mount 竞态（✅ **已修 · 2026-10-24**，as-built 见本节末）

`game/app/router.js route()` 不串接 `mount()`：`if (current) current.mod.unmount?.()` 之后才 `await scene.mount(query)`，而 `mapScene.mount` 自己是 async 的。
**复现**：停在 `#/map` 后**立刻**改 hash 到 `#/rbattle`（无停顿）⇒ `mapScene.unmount()` 已做完 `#wrap.innerHTML=''`，但那张挂在途中的地图 HUD Promise 随后才 resolve，把 `.rbh-*` 整棵树**追加回 `#rv`**，并留下一个游离 `RUFFLE-PLAYER` ⇒ 两张 chrome 叠加。加 2500ms 停顿则 DOM 干净。
**为什么不在这轮动它**：`router.js` 与 AS3 血线共用，超出 §1 声明的 blast radius。
**harness 侧绕法**（F15）：播种走**未知场景**地址 `${base}#/seed` —— `route()` 的 `if (!scene) return` 发生在 `lastHash` 赋值**之前**，一帧 HUD 都不挂；写完档再 `goto` 战斗地址。
**⇒ 建议**：`route()` 改成串行（`pending = (pending ?? Promise.resolve()).then(() => mount())`）或给场景 mount 加令牌号，`unmount` 后丢弃迟到的 resolve。任何一期做这件事时，**必须**同步删掉 F15 的 `#/seed` 绕行并让「战斗 HUD 独占画布」那条护栏改回真跳 `#/map → #/rbattle`。

**✅ as-built（2026-10-24，「继续优化和完善」批）**：`route()` 改为**串行链**（`routeChain = routeChain.then(doRoute).catch(...)`，原逻辑整体搬进 `doRoute`；`game/app/router.js`）—— 上一次 `mount` 完成前不开始下一次 `unmount/mount`，竞态从根上消除；`sceneLoader.js:29` 的 `await route()` 语义不变（仍等首次 mount 完成）。**与上段"必须同步删 F15"的偏差，如实登记**：F15 的 `#/seed` 绕行**原样保留** —— 串行化后未知场景仍在 `doRoute` 内早退、`lastHash` 不受影响，绕行继续可用；**删除它需要同步改护栏并复跑 `rbattle-fight-layout-test`**，而决议 ⑦ 不许 AI 主动跑测试脚本 ⇒ 留给人类下次点名跑该测试时一并收口。请人测 = `docs/status.md §2`「路由串行化回归」条。

### 14.5 门禁数字快照（B5 收口，2026-10-16）

```
rbattle-fight-layout-test   59 / 0   ← 新建（F15）
rbattle-hudtest             17 / 0   ← 整件重写（F16）
rbattle-capture-test        19 / 0   ┐
rbattle-switch-test         13 / 0   ├ 选择器迁移，断言未降级（F17）
rbattle-encounter-test      14 / 0   ┘
rbattle-stage-test          23 / 0      未动
rbattle-restart-save-test   21 / 0      未动
rbattle-selftest            14 / 0      未动
rbag-restart-hud-bag-test   21 / 0      地图 HUD，未动
rbattle-hud-layout-test     27 / 0      地图 HUD，未动
node --test game/core/     272 / 272    ⇒ UI 线没越界
node tools/difftest.mjs   30316 向量 / 29827 可比 / 0 / 0 / 0   ⇒ 同上
```

F15 的结构护栏口径记一笔：**「不该在的东西」才判 0**。地图 HUD 节点（`.rbh-*`）必须一个不出现；Ruffle 播放器只许待在 `#rb-stage` 里 —— 背景 + 两侧宠本来就是 **3 个** `ruffle-player`（stage 的合法产物），拿裸 `ruffle-player` 计数会天天假红。

### 14.6 本轮没做（不是漏）

§13 B6 的九件缺项（副属性块、出招气泡、伤害/治疗/KO 数字层、专属动作、分身、双打、卡牌模式、BOSS 底板、腐蚀条）按设计**继续不画**；场景有节点而截图那一格是空的，同样不画（铁律 6）。

## 15. As-built · 底栏「逃跑」接线（2026-10-19，人类点名实现）

蓝图（§6.4 gating 表 4 行、§2 铁律 5）把逃跑记成**灰化占位**（「内核 Escape 支未移植」）。该前提已过时：S6 批四把 `escape(2)` 搬进 `game/core/effect/ops-state.ts`（`EffectAbilityHandler.cs:54-65`），工厂技也在 `views.ts#escapeSkill()`（`Skill.cs:302-309`）⇒ 本批只**接线**，零 core 改动。

**真值口径（上游 = 无掷点、必成功）**：逃跑技只挂效果 `-4`（`effects.json`：`timing=on_before_attack`、`ability=escape`、`conditionRaw=none`、`options=[]`）⇒ 确认即成功。⚠️ 与 v2 旧线 `game/logic/settle.js#escapeChance`（成功率公式）**不是一个口径**，旧线已废弃（§4 围栏 2），不许把概率公式搬回来。

**四处接线**（全在 L2/L4，`game/core/**` 未动）：

| 落点 | 改动 |
|---|---|
| `game/app/battle/driver/coreBattleDriver.js` | ① `isEscapeOK` 缺省 `false` → **`opts.isEscapeOK ?? true`**（= 上游 `BattleSettings.cs` 缺省「宽松」、`map-battle-trigger`：全库 `@escape` 0 次 ⇒ 实际生效值 = 缺省 `true`）；② `pickSkill` 认 `id === -4` ⇒ 返回 `escapeSkill()`（工厂技不在宠的技能表里，原逻辑会回落成无操作） |
| `game/app/view/panels/battle/bottomBarView.js` | 门禁 `why` 改「本局设置不允许逃跑」；点击分支不再自开占位 Hintbox，改调场景注入的 **`onEscape`** 回调（确认框归场景，底栏不认识结算） |
| `game/app/scenes/rbattleScene.js` | `onEscape` = `openHintbox(确定要逃跑离开战斗吗？)` → 确认 → `doEscape()` = `act(-4)`；`window.__battle.escape()` 同入口（调试直调面，与 `capture/switch` 同口径） |
| 结算 | **零改动**：`result.state=MyEscape(3)` ⇒ `isMyWin=false / isOpWin=true` ⇒ `settleAndExit` 按 `'lose'` 回写（`map-battle-trigger`：我方逃跑算输、敌方逃跑算赢）⇒ 落盘 + `session.lastBattle` 快照 + `winHandler` 链照旧 |

**执行序**（内核侧，非本批实现、仅核对）：逃跑技 `priority=6` 压过一切 ⇒ 我方先动；`BeforeAttackPhase` 先 `addReport`（「逃跑了，战斗结束！」）再 `applySkillsAndBuffs`（phase 恰好 = `OnBeforeAttack` ⇒ 效果 `-4` 命中）→ `escape()` 写 `phase=OnBattleEnd` + 双 `isDone` + 游标推队尾 ⇒ 后续 phase 全早退，驱动按 `BattleEndPhase` 哨兵收口。

**已验（开发侧冒烟，不替代人测）**：demo（`#/rbattle?master=1&client=2`）与遇怪闭环（`?encounter=1&gid=2`，用后即删的临时档）各跑一遍：页签亮 → 确认框 → `state=3`、战报「逃跑了，战斗结束！」、`lastBattle={outcome:'lose', result.state:3, isEscape:true}`、回图 `#/map?slot=2&map=10017`。

**等人手测确认项**（登记见 `docs/status.md`「请人测」）：真遇怪点野怪 → 底栏「逃跑」→ 确认 → 结算框「逃跑（我方）」→ 回图后**队伍 hp 已扣、经验不给**；若该场遭遇带 `winHandler`，逃-win 分叉照 `BTI8` 口径（`OpEscape` 才算逃-win，我方逃跑算输）。


## 16. As-built · 阵亡强制换宠（2026-10-19，人类报障「我方精灵死亡后不会强制进入换宠界面」）

**症状**：`#/rbattle` 里我方精灵被打到 0 血后，底栏「精灵」页签**变灰**（旧门禁 `bagCounts('my').aliveNum > 1` —— 一只刚死 `aliveNum` 掉到 1 ⇒ 恰好把最需要换的场景挡死），战斗继续空转，玩家只能眼看着死宠被反复判「不能出招」。

**真值口径（三条，缺一条就不对）**：

1. **强制跳页 + 锁其余页签**（上游 `BattleManager.ProcessQuery`：`SelectOption(myUnit.pet.isDead ? 1 : 0)` + `SetOptionActive` 关 战斗(0)/捕捉(2)/道具(3)）⇒ 我方在场宠倒下且袋里还有活宠时，**自动切到「精灵」页**，战斗/捕捉/道具三页签锁死。
2. **回合不推进**（上游 `Battle.cs:348-359`：`parallelCount<=1 && isAnyPetDead` ⇒ `unit.SetSkill(null)` + 插 `PassivePetChangePhase`、`return false`，主相位链压根不走）⇒ 换完宠之前点任何招都只是弹回换宠页。**本仓对应物 = `driver.nextRound()` 首行的 `mustChangePet()` 闸门**（内核 `PassivePetChangePhase` 齐备但驱动层未接，见 `battle-engine-session.md §6` 的 🟡 简化版登记）。
3. **死宠不可换上**（上游 `BattlePetChangeBlockView.SetPet` → `SetInteractable(!pet.isDead)`；换宠技 `Skill.GetSelectableTarget` 同为 `isTarget = !isDead`）⇒ UI 灰化 + **驱动层也拒**（内核 `petChange()` 的字面 `target_index` 支**不**校验目标死活，只有 `random` 支才滤 ⇒ 守在 `switchPet`）。

**没有精灵 ⇒ 战败**（无需新代码）：`mustChangePet()` 的第二个条件是 `alivePetNum > 0` ⇒ 全灭时它为 false、闸门不拦，回合一路走到 `TurnEndPhase.checkBattleEnd`（`phase.ts:42-51`）判 `Lose` ⇒ `BattleEndPhase` 哨兵 → `settleAndExit` 的 lose 分支。**这条是既有能力，本批只是别把它挡掉。**

**四处改动**（全在 L2/L4，`game/core/**` 零改动）：

| 落点 | 改动 |
|---|---|
| `coreBattleDriver.js` | ① `switchPet` 加目标校验（null / 就是当前 / 已死 ⇒ `switched:false, reason:'dead-or-absent'`）；② 新增 `mustChangePet()` / `canChangePet()` 两个只读投影；③ `nextRound()` 首行闸门（拦下时清掉 `pendingMasterSkillId` 并回报 `needSwitch`）；④ 回合跑完也回报 `needSwitch`（我方宠可能在敌方那一手被打死） |
| `bottomBarView.js` | 换宠门禁 `aliveNum > 1` → `canChangePet()`；战斗/捕捉/道具三页签加 `mustChangePet()` 锁；绿圆钮（无操作）同锁。**逃跑页签不锁** —— 上游被动换宠只关 0/2/3，真拦截在 `SetSkill`（逃跑技同样先撞 `isAnyPetDead`），本仓对应物就是 `nextRound` 闸门 ⇒ 点它会弹换宠页而不是死按钮 |
| `petChangeView.js` | tooltip 文案「阵亡」优先于「在场」（cursor 停在死宠上的那一瞬就是这个状态）；死宠仍不可点（既有行为，补注释指回上游） |
| `rbattleScene.js` | 新增 `forceChangePet()`（跳 `change` 页 + `flashNotice`）；`act`/`onNoop`/`advanceNoAction` 三条推进路径统一 **先判 `over` 再判 `needSwitch`**；`doSwitch` 区分强制/主动 —— **强制换宠不额外吃一回合**（上游换宠是玩家「这一手」选的东西，`PassivePetChangePhase` 把选好的招存着、换完再照打），换完跳回「战斗」页 |

**已知取舍（如实登记）**：`nextRound` 是在**回合粒度**上拦的，而上游拦在**选招粒度**上 ⇒ 差别是「死宠仍占着 cursor 直到玩家换」，以及强制换宠那一次**敌方不会多打一下**（上游是换宠后照打玩家原本选的那一招，本仓是换完重新选招）。**双打 / `parallelCount>1` 的另一条 `isAllUnitReady` 分支不移植**（同 `battle-engine-session.md §6` 既有登记）。

**等人手测确认项**（登记见 `docs/status.md`）：两只宠 ⇒ 打死一只 ⇒ 自动跳「精灵」页 + 提示，战斗/捕捉/道具全灰、无操作也点不动 ⇒ 点死宠**点不动**（title 写「已倒下，不可换上」）⇒ 点活宠换上、跳回「战斗」页、**这回合敌方没白打一下** ⇒ 再被打死一只 ⇒ 跳结算「失败」框。
## 17. As-built · 伤害飘字层（DB 批 · 2026-10-19，人类点名「战斗中某一方对另一方造成伤害时增加伤害飘字的特效」）

**设计正本 = `docs/view/scene/battle/view-scene-battle-stage.md §9`**（上游真值 + 目标行为 DB1–DB6 + 不做项 + 有意偏差登记）。
本节只记**我们怎么落的**与 as-built 事实。**`game/core/**` 零改动** —— 内核 `Unit` 不建 `hudSystem`（`state.ts` 文件头围栏），
所以表现信号由**驱动层只读投影**补齐（§17.1），这正是 `view-scene-battle-stage.md §9.6 DB1` 的口径。

### 17.1 DB1 · 信号层（`coreBattleDriver.js` + `phaseUi.js`）

上游 `DamageInfo`/`HealInfo` 是 `AttackPhase` 在 UI 帧上调 `atkUnit.hudSystem.OnHit(...)` 造出来的（`AttackPhase.cs:101-102`）。
我们改成：`phaseUi` 的 `setState` 多挂一个 `onFrame` 旁路（**只读，不改内核**），驱动层在**每一帧**上照同一套算法重算：

| 环节 | 落法 |
|---|---|
| 触发 | `phaseUi.setState(last, cur)` ⇒ 先 `onFrame(cur)` 再 `onState`（`onState` 仍只留最后一帧给 HUD） |
| 去重 | 键 = `(turn, actionCursor, whosTurn)` —— 一次出手唯一确定；同键后到的帧覆盖先到的（`skillSystem` 在出手结束前不被重置，两帧同源同值） |
| 抹键 | 算出 `null` 时**删键**：`isAttackLegal()` 判非法（目标已死 / 自己不能动 / PP 不够 / `chain<=0`）时 `AttackPhase` 在 `applyAttackDamage` 之前就早退，之前留下的「攻击技 ⇒ 先记一条 0 伤」占位必须抹掉，否则会冒一个 absorb 空泡 |
| 红伤 | `redDamage = totalSkillDamage − (属性+粉+白)`，`redHeal = heal − (属性+粉+白治疗)`（照 `AttackPhase.onHit/applyAttackDamage`） |
| 建条件 | `isAttackSkill(skill.type) || !isHit || redDamage > 0`（`UnitHudSystem.OnHit` 同句）；另有 `specials` 时也产事件 |
| 彩色文字 | `HealInfo` 是**单槽**：红血先写，之后每跑一次 `ApplySpecialHit` 就被 `OnHitUndo` 两侧清空，只有最后一次跑的赋值活下来 ⇒ 照抄这个「后写覆盖」形状，每侧最多一条 |
| 连击 | `evenComboDamage()` 照 `UnitHudSystem.cs:137-160`：均摊成 ≤30 段整数、余数给前几段各 +1、段暴击 = 覆盖的原始段任一暴击 |
| 重试围栏 | `nextRound` 的 `attempt()` 开头 `damageByKey.clear()` —— NOT_PORTED 重试时上一次半途的账整段丢掉 |

出口：`emitRender()` 的第三个参数从 `{last, cur}` 变成 `{last, cur, damage:[…]}`（插入序 = 出手先后）。

### 17.2 DB2–DB5 · 舞台层（`restartFighterStage.js` + `ui.css`）

`#rb-stage` 里新建第四层 `#rb-dmg`（`z-index:3`，在 `#rb-fL/#rb-fR` 之上、`#rv`(z60) 之下）。`showDamage(ev)` 是舞台新增出口：

| 环节 | 落法（尺寸/曲线逐项照上游，常量集中在 `restartFighterStage.js` 顶部） |
|---|---|
| 底图 | `Fight/damage {normal,weak,resist,miss,absorb}.png`，框尺寸 225×158 / 128×43 / 116×60（`HelperUI.SetDamageBackgroundSprite`）；`elementRelation>1→weak`、`<1→resist`（名字与直觉相反，照搬） |
| 数字 | `Numbers/Damage/{%,0..9}.png` 逐字拼；字距 45、数字框 36×39×1.5、偶数位数整体右移 22.5 才居中（`BattleDamageBackgroundView.InstantiateDamageNum` 逐字照搬） |
| 暴击 | `Fight/critical.png`，框 37.2361×21.5647×2.7，随位数左移 `25×(len−4)` 让位；终击且（暴击或 >500）时峰值缩放 ×1.2（`SetFinalDamageEffects`） |
| 曲线 | `@keyframes rb-dmg-pop` = scale `.6→1.4`（20%）、alpha `.157→1→1(65%)→0`、位移 `--x0→--x1`，总 0.92s；absorb 单独一支（只有 y 上浮 120px、0.5s、无 alpha 曲线），照 `Damage Bubble Absorb Me/Op.anim` |
| 彩色文字 | `element #ed780e` / `pink #ff40ff` / `white #ffffff` / 治疗绿 `#77e20c` / 负值红；普通治疗与 item 向下沉、属性三色先沉后上浮（`SetHealAnim` 的 dir 实参）。**落点用 `UNIT_ANCHOR`**（记在哪个 unit 就画在哪个 unit 上） |
| 连击 | 逐段冒泡、段间 `180ms`（= `comboDamagePreviewInterval`），用 `animation-delay` 表达、不占 `STEP_MS` 节奏；**不出总数**（= C# 缺省 `comboDamageDisplayMode=0 AllComboOnly`） |
| 缩放旋钮 | 单一常数 `DMG_SCALE = 0.9` 统一乘（上游是 1920 画布，我们是 1200×660 舞台 ⇒ 逐项换算无意义，靠人眼校，同 `AGENTS §4.10` 路线 A） |
| 锚点 | **两套**。气泡（伤害）用 `DMG_ANCHOR`：**起点 = 出手方的宠朝被打方的宠走 `DMG_BIAS`(0.62) 段**，位移照抄上游两个 clip 的相对量（Me `+170` / Op `−30`）× `1200/1920` ⇒ 我方出手 x≈715→821（压在敌方宠那侧）、敌方出手 x≈485→466（压在我方宠那侧）⇒ **落在挨打那只身上，再朝它飘一点**。本单位数字（治疗 / 属性三色）用 `UNIT_ANCHOR`（bias=0，就在该单位自己正上方），**不跟着气泡跑到对面** |

### 17.3 DB6 · 接线（`rbattleScene.js`）

- `clipActions(driver, prevLines, damages)` 增补**没命中**那行（`但是没有命中【X】！`，上游 `AttackPhase.cs:676`）⇒ 以前未命中不产生「被击」动作，现在产生了。
- **同序 zip**：一次出手在内核里产**恰好一条**伤害事件、战报里也产**恰好一行**，两者都按出手先后排列 ⇒ 把事件逐个挂到同序的「被击」动作上（`a.dmg`）；领不到就不飘（宁可少飘，不飘错位置）。
- `playRound(actions)` 播到带 `dmg` 的动作时调 `showDamage`，飘字跟着「被击」clip 一起出。

### 17.4 本批**不做**（与设计 §9.7 一致，不是漏）

相机屏震/闪白、暴击贴图（`critical_effect.csv` 配置驱动）、技能气泡、单双打站位、动画速度设置。

⚠️ **回合末 buff 掉血/回血不飘字**：上游走 `UnitHudSystem.OnTurnEnd` 另一条信号，而我们的 `TurnEndPhase.doWork` 开头就把
`whosTurn` 置 0，这一帧**无法归位到出手方** ⇒ 本批不猜。要做需要给内核补一个显式的「回合末结算」信号，属引擎线改动。
副作用 = 用到**每回合持续掉血的 buff**（中毒/灼烧一类）时，那部分掉血**没有飘字**（战报数字仍然正确）。**请人测时留意。**

### 17.5 门禁

本批**未改 `game/core/**`** ⇒ 不需要 `node tools/build-core.mjs`。既有门禁复跑见 `docs/status.md §0`。

### 17.6 等人手测确认项（登记见 `docs/status.md §2`）

见 `docs/status.md §2` 的「DB 伤害飘字手测」与「DB2 · 屏震/闪白/技能气泡/暴击贴图/回合末 buff 手测」两条。















### 17.21 As-built 补 · 暴击贴图 / 合体攻击 / 变身效果（2026-10-19，人类「那就处理一下暴击贴图和合体攻击/变身效果吧」）

| 件 | 结论 | 处置 |
|---|---|---|
| **暴击贴图** | ✅ 机制**已完整**，数据**只有 1 条**。全盘 `Assets/Resources/**` 搜 `CriticalEffect` 只有 1 张 `JoseCritical.png`，`critical_effect.csv` 只有表头 + **1 行**（`anim,990,critical,poster,JoseCritical,100,-200,0.5,2,80,0`）。该行 ownerId=990，而我们表里 `ui.defaultAnimId==990` 的恰好 1 只宠（**约瑟**，`baseId` 也是 990）⇒ 键能命中 | 无可补。加两个直调口免得为验收去打约瑟：`stage.showCriticalPoster('my', 990)`（直接按 swfId 查表播）/ `stage.criticalPosterFor(990)`（只查配置不播） |
| **合体攻击** | ✅ **触发器可用**（此前判「没有」是查得不够）。`合体攻击` ≡ 上游 `PetAnimationType.SecondSuper`：两条血统的出伤帧表都把 SecondSuper 绑在 **`fit` 列**（`PetHitInfo.fit => GetHitFrameByType(SecondSuper)`、`AnimiationHitInfo.fit => INTERCOURSE`）。判据 = 技能 **`isSecondSuper`**，我们表里 **11 条**（迪休拉之怒/雷鸣炎破斩/联盟的审判/伊特大乱斗/光影幻象/特鬼异星劫…，全 `anger=100`） | `petAnimKindOf(skill)`（由收 `type` 改为收整个 `skill`）在 `必杀\|连携` 分支上按 `skill.isSecondSuper ? 'intercourse' : 'super'` 分流。链首 `合体攻击`，没有该 clip 的宠退回 `必杀`。⚠️ `type=3 连携` 那 12 条**全部 `isSecondSuper=false`** ⇒ 仍走普通 `super` |
| **变身效果** | ⚠️ **本血统仍无触发器，不编**。AS3 靠服务端 `Command(19, "变身精灵")`（`arena/processor/Processor_19.cs` → `isChangeStatus=1` → `Fighter.disappear` 播 `CHANGE_STATUS`）；Unity 的 `PetAnimationType.Morph` 是**从没赋值的死枚举**；`Assets/Scripts` 与 `Resources/Data` 搜 `morph`/`change_status`/`transform`/`shape` **零命中** | 链留着 + 直调口 `stage.showChange('my')` 让素材可见、可验收 |

另加 `stage.showIntercourse('my')`、`stage.swfIdOf('my')` 两个直调口。
⚠️ AS3 侧「合体」本体是**双精灵合体玩法**（`ErrorMap`「合体失败，精灵身上星魂未移除」、UI「双精灵对战情况下无法完成合体！」），
我们是单打、无星魂 ⇒ 只能借 `SecondSuper` 这批技触到 clip，**这不是完整的合体玩法**（要双打布局 = §7 缺口 3）。
### 17.20 As-built 补 · 第一次打击帧两侧血条同时结算（2026-10-19，人类自查定位）

**根因：`onContact` 只给被打方写覆盖。** 内核是**回合粒度** —— `nextRound()` 返回时**两只宠的血都已经是回合末的值**。
于是第一次打击帧：

```
我方出手 → 打击帧 → hpOv.op = 敌方血     ✅ 敌方那格对了
                    我方那格没有覆盖 → 读真身 → 已经是回合末的血  ❌ 跟着一起掉
```

| 项 | 落法 |
|---|---|
| 行动方快照 | 驱动层 `attackEventOf` 增 `atkHp` / `atkAnger`（该帧上**行动方自己**的 hp/anger）。它在自己这一手开打时的 hp，正是它此刻该显示的值：先手方 = 本回合起始值，后手方 = 已吃过对方那下的值 |
| 场景 | `onContact` **两侧都写**：`hpOv[atkSide]` + `hpOv[defSide]`。每个打击帧都把两块血牌定住 |
| 舞台 | `onContact` 从「只在有 `st.dmg` 时调」改成「只要有 `st.skill` 就调」⇒ **零伤害的属性技（洒水）也刷**，且 `st.dmg` 为空时不会去播不存在的受击动画 |
| 收尾 | `playRound` 结束后清空 `hpOv` 并按权威状态重画一次（回合末 buff 掉血/阵亡/胜利等无逐拍快照的部分由它覆盖） |

**为什么此前没在日志里看出来**：`__battle.debug().timing` 只记节奏，不记血牌；本轮新增 `[stage] 打击帧 <行动方> 出手 ⇒ <side> hp=<n> / <side> hp=<n>`，
两格数值一目了然。
### 17.19 As-built 补 · 血条结算时刻错位的两个根因（2026-10-19，人类日志复现：「op physic 1159ms / my special 1009ms」两次飘字都对，但血条时刻不对）

**根因 1（严重）：血牌「覆盖视图」根本不隔离，改的是活对象。**
`BattlePet` 的 `hp` / `anger` 是**原型 accessor**（`get hp() { return this.statusController.hp }` / `set hp(v) { this.statusController.hp = v }`）。
我们用 `Object.create(pet)` + `v.hp = ov.hp` 做演出期的血牌覆盖 ⇒ 赋值**沿原型链命中那个 setter，把真身的血改了**。
表现上「看起来对了」（同一个对象被改了），但：① 覆盖与权威状态**不再分离**，收尾那次「贴回权威」贴的其实是被改过的值；
② `settleAndExit` 用 `driver.myBag()[i].hp` 落盘 ⇒ **可能存进一个被演出改坏的 hp**。
修法：`Object.create(pet)` 保留原型（`maxHp`/`name`/`battleElement` 都是原型 getter，浅拷贝会丢），
但 hp/anger 必须用 **`Object.defineProperty`** 以「自有数据属性遮蔽原型 accessor」，不再触发 setter。

**根因 2：`AfterAttackPhase` 的帧会写「下一个行动」的占位事件。**
该相位是 `applySkillsAndBuffs → raiseAnger → giveTurnToNextUnit → setUIState`，**`giveTurnToNextUnit` 已经把 `whosTurn`/`actionCursor` 推进到下一位**
（上游 `AttackPhase.cs:15-19` 同形状）。于是那一帧会被记成「下一手」的事件：`atkUnit` 已是对方、账全零、`defHp` 是对方当前血。
平时靠「同键后写覆盖」蒙混过去，但只要那个行动**自己没产出事件**（出手被判非法 / 非攻击技 / 零伤害），占位就会被 zip 认领 ⇒
**把上一手的结果安到下一头上** —— 正是「血条结算时刻不对」。
修法：`harvestFrame` 只采 **`phase === EffectTiming.OnAttack`** 的帧（`AttackPhase.doWork` 在 `applySkillsAndBuffs` 之后、
`consumeAnger`/`onHit` 之前设的就是它），把 `DamageCalculatePhase` 与 `AfterAttackPhase` 一并挡在门外。副作用是顺带少画一个 absorb 空泡。

**顺带加了可观测**：`[stage] 打击帧 contact <defSide> hp=<n> anger=<n>（← <side> 的这一手）`，
下次若还不对，这行能直接看出「哪一手把谁的血压在了什么时候」。
### 17.18 As-built 补 · 演出改成「一次行动自包含」（2026-10-19，人类定模型：「开始演出时一次行动一次行动地演出，上一次演完下一次才开始、之间没有关系；单看一次行动 = 播行动方动画 → 对方在出伤帧开始播效果（动画+飘字+血条）」）

**你说得对，而且指出了我实现里的一个真耦合。** 此前 `clipActions` 产出的是**片段级**动作（一条「出手」+ 一条「受击」），
两者靠 `playRound` 里一个跨条目的 `pendingAttack` 粘起来 —— 那就是「行动之间有 association」。

| 项 | 落法 |
|---|---|
| 产出改成**行动级** | `clipActions` 现在返回 `steps`：每条战报行 = **一次行动** `{type:'act', side, attack, kind, skill, dmg, defSide, reaction, hasDamageLine}`。非行动条目（登场/回合末 buff/濒死/阵亡/胜利）走 `type:'fx'` |
| 一次行动四步（自包含） | `runAction(st)`：① 播**行动方**动画（段位取内核 `skillKind`，拿不到才按物攻兜底）→ ② 等**出伤帧** → ③ **对方在同一帧**播受击/闪避动画 + 伤害飘字 + 血牌掉落 → ④ 等**双方**都演完 |
| 行动之间**零耦合** | 删掉 `pendingAttack` 与 `ATTACK_KINDS`/`REACTION_KINDS` 两个集合。`runAction` 内所有 clip 句柄都是局部变量，一次行动结束即丢弃 |
| 一次行动 = 一行战报 | `AttackPhase.addReport` 把「【X】使用了…對【Y】…造成了 N 點傷害！」写进**同一行**，所以行与行动天然 1:1；未命中那行（`但是没有命中【Y】！`）同样是一条完整行动（reaction=`miss`） |
| 非攻击行动 | `空过了本次行动` / `主动更换出战精灵` / `逃跑了` 也占一条 `act`，但 `attack:false` ⇒ 不播攻击动画、对方无反应、只走一个短节拍 |
| 零伤害的属性技 | 战报里**没有**「造成了」那一行 ⇒ `hasDamageLine:false` ⇒ `dmg` 不挂 ⇒ 对方不反应（照上游，见 §17.14） |
### 17.17 As-built 补 · 「第一回合立刻结算」的第二个成因（2026-10-19，人类复现：迪迪兰 vs 水墨点点，第一回合水墨点点先出手、攻击完立即结算，之后正常）

**先手是随机的，不是成因。** `DecidePriorityPhase.getActionOrder` 六级稳定排序，末级 tiebreak 是 `rng.nextInt(0,100)` 升序 +
`order.direction < 0` 时 `reverse()` ⇒ 速度/优先级相同时纯掷骰子，敌方先完全正常。两次出手走**同一条** `runRound` 路径，先手不影响时序。

**「第一次早、之后正常」有两个成因，都符合该现象：**

| # | 成因 | 状态 |
|---|---|---|
| 1 | 出伤帧表**异步**加载，`hitDelayMsSync` 在 `table === null` 时静默退回 `STEP_MS=650`（而多数真值 1009~3364ms） | ✅ 已在 §17.16 修（`hitDelayMsForShow` = await 后再查） |
| 2 | **该宠该列配的是 0** | ✅ 本条修 |

**成因 2 的查证**：水墨点点 `id=41`，表内 `{physics:58, attribute:19, special:36, **critical:0**, fit:0}`。
**AS3 表与 Unity 表对 id=41 的 `critical` 都是 0** ⇒ 是设计值、不是数据缺失。全盘 **1016 只里有 300 只 `critical=0`**。
上游怎么处理 0：`time = getHitValue(label) * timeRate` = `0 × 40` = 0 ⇒ `setTimeout(dispatchHitEvent, 0)` ⇒ **下一 tick 就触发**。
Unity 侧同理（`SetDelayCallback(hitFrame * 1000 / (24 * animSpeed))`，hitFrame=0 ⇒ 立即）。
⇒ **上游把「出伤帧 0」实现为「命中在 clip 起始」**，也就是「立刻结算」—— 正是人类看到的现象。

**修法（第二版）：取同一行已配置列的中位数当代理。** 第一版改成「等整段动画演完」，人类反馈**「还不如之前」** —— 方向对（不提前）但必杀那种长动画会拖成好几秒。
于是改成 `hitDelayMsForShow` 返回 `{ms, proxy}`：该列配 0 时取**同一行其它已配列的中位数**（同一只宠其它攻击段的打击点是最贴近的现成依据）。
水墨点点 `{physics:58, attribute:19, special:36}` ⇒ 中位数 36 ⇒ **1346ms**（对比：原兜底 650ms 太早、等整段太重）。日志标「（代理…）」。
⇒ 保证**不提前**，且随每只宠的动画长度自适应。日志会打 `[stage] op super 出伤帧 等动画演完（该宠该列未配 ⇒ 不猜常数）`，
`__battle.debug().timing` 的 `ms` 为 `null`、`fallback: true`。

> ⚠️ 这是**有意偏离两条上游**（它们都是「立即」），登记在 stage §9.9 偏差 7。偏离理由：立刻结算会让「伤害先于挥击出现」，
> 而玩家对该 pet 的出伤帧没有任何可依据的配置；等演完至少是**自洽**的。
### 17.16 As-built 补 · 出伤帧表异步加载导致节奏回退（2026-10-19，人类报障「迪迪兰的特攻动画还没有播放到出伤帧，就已经出现伤害飘字和血条变化」）

**根因 = 查表用的是同步读，而表是异步取的。** `hitDelayMsSync()` 在 `table === null` 时返回 null ⇒ 静默退回 `STEP_MS = 650ms`。
而 650 **比多数真实出伤帧短**：迪迪兰 特殊 = 27 帧 → `27/1.07×40` = **1009ms**；迪兰 属性 = 63 帧 → **2355ms**。
⇒ 飘字与掉血提前 350ms+ ⇒ 观感就是「还没挥到就被打了」。**只会发生在每场的头几次出手**（表 fetch 148KB 尚未 resolve），所以看起来「似乎」时有时无。

已排除的假设（都查过）：

| 假设 | 结论 |
|---|---|
| 出伤帧表键错了（swfId ≠ 表的 id 空间） | **排除** —— `game/data/pets.json` 1016 条 `swfId` **逐条等于** `id`（实测 0 条不等），AS3 表的 id 就是这个空间 |
| 迪迪兰的 special 列算错 | **排除** —— 表内 `id=2 → special=27`，`27/1.07×40 = 1009ms`，与上游 `AnimiationHitInfo.getHitValue` 同式 |
| 一回合两次行动导致顺序错位 | **排除** —— 攻击动作等打击帧、受击动作出飘字，两条动作在 `acts` 里按战报序相邻，回合内两次出手各走一遍同一条路径 |
| 伤害数字早于血条 | **排除** —— 两者同走 `onContact`（血条）与紧随的受击动作（飘字），在打击帧之后 |

| 项 | 落法 |
|---|---|
| 修 | 新增 `hitDelayMsForShow(swfId, kind)` = `await ensure()` 后再同步查。演出路径**改用它** ⇒ 表没到就等，不拿兜底冒充出伤帧 |
| 兜底 | 只有**确实查不到这一行**（该宠该列没配）才回退 `STEP_MS`，并在日志里标「（兜底 650）」 |
| 可观测 | 每次攻击打一行 `[stage] <side> <kind> 出伤帧 <n>ms`；另加 `__battle.stage.timing` / `__battle.debug().timing` 数组（`{side, kind, swfId, ms, fallback}`）⇒ 一场打完就能确认每次用了哪档 |

> 若日志显示 `出伤帧 无ms（兜底 650）`，说明**该 swfId 在表里真的没有这一行**（不是加载问题），那就是数据缺口，需要单独登记。
### 17.15 As-built 补 · 血牌落在出伤帧（2026-10-19，人类「血条开始变化的时刻应当和伤害飘字一样发生在出伤帧，对吗？」）

**对。** 上游用一个 UI 帧机制保证原子同步：`BattlePetAnimView.OnPetHit()`（`SetDelayCallback(hitFrame * 1000 / (24 * animSpeed))` 在出伤帧触发）
→ `UI.ProcessQuery(true)` → `SetCurrentUIState(newState)` ⇒ `statusView.SetPet`（血牌）与 `SetDamage`（伤害气泡）**在同一次调用里**。
（同一段代码里还有 `ProcessQuery` 队列空时的 `SetBottomBarInteractable(true)` —— 与 §17.13 的底栏锁同源。）

**我们此前是错的**：`onRender` 里直接 `renderAll()`，而 `onRender` 是 `nextRound()` 内同步触发的 ⇒ 血牌在动画开演前就掉了，与飘字错开 1~2.4 秒。

| 项 | 落法 |
|---|---|
| 逐拍快照 | 驱动层 `attackEventOf` 增 `defSide` / `defHp` / `defAnger`（该次出手的帧上对方的 hp/anger） |
| 演出钩子 | `playRound(actions, opts)`：攻击动作**等到打击帧后**回调 `opts.onContact(ev)`（拿不到快照时回调 `null`） |
| 场景 | `onRender` **不再**直接 `renderAll()`；改传 `onContact` 逐拍刷 + `playRound(...).then()` 收尾时清覆盖并按权威状态重画一次 |
| 覆盖实现 | `petOf(side)` 用 **`Object.create(pet)`** 再改 `hp`/`anger` —— ⚠️ 不能用 `{...pet}`：`maxHp`/`name`/`battleElement` 都是**原型 getter**，浅拷贝会丢（`fightPlateView` 正是读这几个字段） |
| 无舞台 | `!STAGE` 时仍立即 `renderAll()`（没演出就没有时序问题） |
| 收尾覆盖范围 | 回合末 buff 掉血/回血、阵亡、胜利这些**没有逐拍快照**的部分，由演完那次收尾的权威重画覆盖 |
### 17.14 As-built 补 · 属性技不给对方播受击/闪避（2026-10-19，人类提问「我方施加属性技能，对方应当也可以播放对应的受击或闪避动画，且播放时刻在效果作用的帧，对吗？」）

**结论：一半对一半不对。** 「播放时刻在效果作用的帧」**我们已经是对的**（出伤帧表有 `attribute` 列，攻击动作等到打击帧才播下一条）。
「对方播受击/闪避」**上游两个血统都不播** —— 已查实（设计 §3 有对照表）。

**我们此前多画了一个东西**：属性技**有伤害**时战报里也有「對…造成了 N點傷害！」⇒ `spawnBubble` 因 `damage === 0` 画了一个**空的 absorb 气泡**。上游没有这个气泡（`DamageInfo` 压根没建）。

**随后按决议②加了有意偏差**（人类 2026-10-19 拍板「加：对方也播受击」）：属性技**也给对方播受击/闪避**，落在出伤帧那一拍。理由 = 属性技在出伤帧表里**有** `attribute` 列（Unity `hit.csv` **293 行全有值**、AS3 xml **1698 条有值**），打击点是设计出来的，对方毫无反应会让这一拍看着像打空了。**这是偏离两条上游**，登记在 stage §9.9 偏差 6；偏离范围**仅此一项** —— 气泡仍不出。

| 项 | 落法 |
|---|---|
| 判据上抛 | 驱动层把 `UnitHudSystem.OnHit` 那三个条件的结论作为 `showBubble` 挂到伤害事件上（它同时决定对方受击动作与气泡） |
| 场景 | zip 到受击动作时，`showBubble === false` ⇒ 把该动作降级成 `noop`（不在 `CHAIN` 里 ⇒ 不换 clip） |
| 舞台 | `showDamage` 里 `showBubble === false` 时**跳过 `spawnBubble`**，specials（彩色数字）照出 |

**没变的**：物攻/特殊/必杀**打中了但 0 伤**（全被护盾吃掉）仍是 `absorb` 底、无数字、对方播 `被打` —— 那是上游的 `isDamage = isHit && damage != 0` 分支，与属性技是两回事。
物攻/特殊/必杀**没命中**仍播 `miss` 底 + 对方 `闪避`。
### 17.13 As-built 补 · 演出期锁底栏（2026-10-19，人类「在本回合动画播放时间里，战斗场景的 HUD 应当是不可操作的」）

**同意，而且这不是手感问题，是正确性问题。** 上游本来就有这个接缝 —— `PassivePetChangePhase.cs:81` 的 `UI.SetBottomBarInteractable(...)`，
我们把它照搬进了 `PhaseUI` 接口（`phase.ts:46`，标注「上游是 HUD 条的展示开关, 不进快照; 本段按 no-op 口径为可选方法」）但 `phaseUi.js` 一直是 no-op。

不锁的具体后果：内核 `nextRound()` **同步**推进、舞台 `playRound` **异步**播出 ⇒ 演出中途再点一次就是**两条演出序列交叠**
（`seqToken` 只挡得住旧序列的末尾复位，挡不住它已经发出的 `applyState`）—— 正是「双方一起出手」那类毛病的自伤版；
而且点击落在**已经推进过**的状态上，玩家看到的效果与内核算出的结果对不上。

| 项 | 落法 |
|---|---|
| 锁的边界 | = **本轮演出窗口**：`advanceRound(run)` 先上锁 → 推进 → `STAGE.whenIdle()` resolve 才解锁。上游是「相位/动画期间不接受输入」，同一件事 |
| 场景侧 | 新增 `busy` / `setBusy` / `forceUnlock` / `advanceRound`。三条推进路径（`act`、`onNoop`、`advanceNoAction`）全部改走 `advanceRound`；五个入口（`act`/`onNoop`/`doCapture`/`doSwitch`/`doEscape`）加 `busy` 判据 |
| 视图侧 | `bottomBarView` 新增 `setBusy(on)` / `get busy()`：`select()`、`绿圆钮`、`自动战斗`、`必杀槽` 四条点击路径全部判 `busy`；对外只暴露一个开关，场景不认识任何页面实现 |
| 表现 | CSS `.rbb-bottombar--busy`：`pointer-events:none`（挡鼠标）+ 内容 `grayscale/brightness` 压暗 + 冒一个「演出中…」小签。**用 filter 不用 opacity** —— 只压内容、保住底图，免得像面板坏了 |
| 双保险 | `pointer-events` 只是鼠标层的挡，**不是逻辑保障**（`bar.select(...)` 这类程序化调用照样进）⇒ 每个 handler 另有 `busy` 判据 |
| 世代号 | `busySeq`：`whenIdle()` 的解锁回调要确认自己仍是最新一代，否则「阵亡强制换宠 → 立刻解锁 → 玩家点下一回合 → 上一回合的回调回头误解锁」。`forceUnlock()` 会作废在途回调 |
| 例外 | **阵亡强制换宠**是**流程跳转**不是玩家操作 ⇒ `forceChangePet()` 里先 `forceUnlock()` 再 `bar.select('change')`，否则玩家看着提示却点不动（锁是给「演出中」用的，不该锁流程） |
| 战斗结束 | `over` 为真时解锁回调不执行 ⇒ 底栏一直锁着，交给结算框接管（结算框本身已是模态） |
### 17.12 As-built 补 · 结算等本轮演出收尾（2026-10-19，人类「战斗胜利或失败的本场战斗结束的，应当在本回合动画播放完毕再弹出」）

**根因**：`driver.nextRound()` 是**同步**跑完整回合并立刻返回的，而舞台的 `playRound(actions)` 是 fire-and-forget（`onRender` 不 await 它）。
场景在 `nextRound()` 返回后**同步**调 `settleAndExit()` ⇒ 结算框压在死亡/胜利动画上弹出来，玩家还没看清谁赢。

| 项 | 落法 |
|---|---|
| 舞台侧 | `playRound` 拆成「薄壳 + `runRound`」：壳把当前这一轮的 promise 存进 `playing`，新增出口 `whenIdle()`。`onRender` 的调用方式不变（不 await），语义不变 |
| 场景侧 | `settleAndExit()` 改成 `async`，开头 `await STAGE.whenIdle()`（带 try/catch —— 舞台已卸载/无 Ruffle 时按无演出处理），之后才 `resultView.showResult(...)` |
| 调用点 | 五条推进路径（`act` / `onNoop` / `doCapture` / `doEscape` / 调试 `runUntilOver`）都是先置 `over = true` 再调，**天然互斥**，等待期间玩家点不动（`act`/`onNoop`/`doCapture`/`doSwitch`/`doEscape` 都判 `over`），不会重复结算 |
| STICKY 节拍 | `濒死/阵亡/胜利` 停末帧**不发** `animationComplete`（`Fight.as` 的 `isStopLastFrame` 分支直接 `stop()`），所以收尾只能给固定节拍：新增 `STICKY_MS = 900`（此前复用 650）。**是猜的旋钮**，嫌短就拧它 |

⚠️ 等待不会挂死：`runRound` 里每个 `await` 都有上限（`animationComplete` 有自适应超时、其余是固定 sleep），`whenIdle()` 必然 resolve。
### 17.11 As-built 补 · 攻击语义与伤害信号拆成两条通道（2026-10-19，人类报障「迪兰用属性技·洒水播的是物攻」）

**根因**：我们把「攻击动画/技能气泡」和「伤害气泡」并成了一条通道 —— 技能类型是从**伤害事件**上取的。
而 `BattleAnimView` 上游是两条互不相干的通道（`SetPet` 走 skill、`SetDamage` 走 `CurDamageInfo`）。

`洒水(id=10006)`：`type=0`（属性）、`power=0`、唯一效果 `powerup / who=op / mat=-1`（纯减魔攻、**零伤害**）。
`AttackPhase.addReport` 只在 `skill.type > 属性 || totalSkillDamage > 0` 时写「對…造成了 N 點傷害！」⇒ 洒水两条件都不成立
⇒ 战报里没有这一行 ⇒ 场景没有「被击」动作 ⇒ zip 挂不上 ⇒ 出手动作停在默认的物攻。

| 项 | 落法 |
|---|---|
| 新通道 | 驱动层 `attackEventOf(st)`：只看「这一手是不是攻击技」（`petAnimKindOf(type) !== null`），与伤害无关；键仍是 `(turn, actionCursor, whosTurn)`，非法出手同样删键。`emitRender` 的第三个参数变成 `{last, cur, damage:[…], attack:[…]}` |
| 场景 zip | 通道一：攻击语义按序 1:1 挂到「出手」动作（战报每个攻击技恰好一行「使用了…」）⇒ 定 `kind` 与 `skill`。通道二：伤害按序 1:1 挂到「被击/被暴击/闪避」动作 ⇒ 定 `dmg`。两条互不依赖 |
| 技能气泡兜底 | 若因异常找不到出手动作，气泡退回挂在受击动作上（`skillName: null` ⇒ 不画，不会凭空多个空条） |
| 顺带修 | **不再为「激活了专属动作」建动作** —— 它只是战报文案（技能带 `evolve` option），上游 `SetPet` 只按 `skill.petAnimType` 出**一次**动画 ⇒ 此前会给带 `evolve` 的技能多播一段多余的 clip |
| 伤害事件瘦身 | `skillKind`/`skillName`/`skillCombo`/`isSuperSkill` 全部搬到攻击事件；伤害事件只留飘字/屏震/闪白/暴击贴图要用的字段 |
### 17.10 As-built 补 · 一方打完另一方再动（2026-10-19，人类报障「播放精灵动画似乎是双方一起出手的」）

**根因 = 固定 `STEP_MS = 650` 是猜的，比真实打击帧短一大截。** 出伤帧表实测：迪兰 物理 1047ms / 属性 2355ms / 必杀 3364ms。
于是「我方挥击(0ms) → 对方挨打(650ms，我方还在挥) → 对方还手(1300ms，我方还在挨打动画里)」—— 两侧动画交叠。

| 项 | 落法 |
|---|---|
| 等一段演完 | 监听 `Fight.as` 已有的 `postMessage {type:'animationComplete', state, duration, instanceId}`（`duration` 是**秒**）。`playClip(side, chain)` = **先注册等待再 `setState`** → 拿到 `{name, done}`。`isStopLastFrame` 三种与 `待机` 不发这条 ⇒ 对它们只等短兜底 |
| 等打击帧 | 新建 L1 `game/logic/battle-hit-info.js`：懒取 + 解析上游内嵌的 `HitInfoConfig__hitData.xml`（**1711 行**，键 = swfId），`ms = 表值 / 1.07 × 40`（照 `AnimiationHitInfo.getHitValue` + `ClientConfig.timeRate`）。表在 `create()` 里 `preloadHitInfo()` 预热，失败不阻塞 |
| 三类时序 | **攻击类**（`physic/special/property/super/intercourse/change`）切 clip 后只 `await sleep(打击帧)`；**受击类**（`hit/crit/miss`）与飘字同帧出，再 `await 受击段.done` **并 `await 挥击段.done`** ⇒ 严格一方打完另一方再动；**其它**播完即止 |
| 兜底 | `STEP_MS` 保留但降级：仅在「无出伤帧数据 / 该 clip 不存在 / 停末帧段」时用 |
| 顺带 | `sides[side].swfId` 记下来供出伤帧表查表（`loadFighter` 里写）；`swfId` 换宠后会变，下一次攻击自动查新表 |

⚠️ **一个结构性事实（如实登记）**：内核 `nextRound()` 是**同步跑完整整一个回合**（双方出手 + 回合末 buff + 下一回合开始），
表现层拿到的只是一份**报告增量**，所以时序只能在这一层「重放」排对，**做不到像上游那样逐动作让内核等表现层**。
本批把这一层的重放对齐了，但内核↔表现的双向握手没做（那要改 `game/core/**`，属引擎线）。
### 17.9 As-built 补 · 濒死 / 合体攻击 / 变身效果（2026-10-19，人类「合体攻击、变身效果、濒死补上」）

| 项 | 落法 | as-built |
|---|---|---|
| **濒死** `dying` | ✅ **完整实现**。驱动层新增 `turnStartStatesOf(st)`：活着且 `hp/maxHp < 0.2` ⇒ 发一条 `{side, kind:'dying', turnStart:true}`。采集点 = `whosTurn===0` 且 `state.phase === EffectTiming.OnTurnStart` 的那一帧（`TurnStartPhase` ctor 把相位设成它，见 `phase.ts:307-311`），键 `${turn}\|start\|${side}` ⇒ 天然排在同回合出手与回合末之后 | 血量口径照上游 `(float)pet.hp / pet.maxHp < 0.2f`（`UnitHudSystem.OnTurnStart`），与 AS3 `Fighter.playDefAction` 同。链 `['濒死','失败']` —— 照 AS3 `FighterAnimation.adjustCurrentLabel`「没有『濒死』标签就退回『失败』」 |
| **合体攻击** `intercourse` | ⚠️ **只接链，无触发器**。链 `['合体攻击','必杀','物理攻击']` 已接；调试直调 `__battle.stage.setState('my','intercourse')` 可看实际素材 | 查证结论见设计 §3：AS3 触发是技能 `category==81`（`SkillCategoryValue.POW_INTERCOURSE_VALUE`），重启表**没有这个类别**（`SkillType` 只有 属性0/物理1/特殊2/连携3/必杀100，5340 条实测），Unity 侧 `PetAnimationType` 连 `Intercourse` 都没有。**不编触发器** |
| **变身效果** `change` | ⚠️ **只接链，无触发器**。链 `['变身效果','被打']` 已接；调试直调同上 | AS3 由**服务端 opcode 19** 下发（`arena/processor/Processor_19.cs` → `fighterInfo.isChangeStatus = 1` → `Fighter.disappear` 播 `CHANGE_STATUS`）；Unity 侧 `PetAnimationType.Morph = 15` **从没被赋值**（`UnitHudSystem.petAnimType` 只写 Lose/Dying/Idle/skill.petAnimType/Win）⇒ 死枚举 |

**顺带修的一个真 bug**：回合尾部复位待机**无条件**把两侧打回 `待机`，所以此前 `ko`（失败）与 `victory`（胜利）播完立刻被抹掉 = **等于没播**。
现在按上游 `isStopLastFrame = [ABOUT_TO_DIE, DEAD, WIN]`（AS3 同 `MODE_STOP_LAST_FRAME`）引入 `STICKY = {dying, ko, victory}`，
复位待机时跳过「该侧最后一个动作属 STICKY」的情形。`present` 链也补了上游的降级：无 `个性出场` 标签 ⇒ 退 `待机`。
### 17.8 As-built 补 · 攻击/受击分语义播动画（2026-10-19，人类「物攻技能、特殊技能、属性技能应当播放不同的动画对吧，请确认此实现」）

**结论：此前没有实现，而且旧实现是错的**（不是「没区分」而已）。设计正本 = `view-scene-battle-stage.md §3`。

| 项 | 落法 |
|---|---|
| 词表 | 换成**封闭白名单**（15 个 clip 名，来自 `vendor/seer2-pet-animator/actionscript/FighterActionType.as`）。`Fight.as` 的 `getAvailableStates()` 只回白名单里且该 SWF 真有的 label ⇒ 匹配改成**精确相等**，不再做子串试探 |
| 语义 | `physic` / `special` / `property` / `super` 四条攻击链各自独立，另加 `hit` / `crit` / `miss` 三条受击链 + `ko` / `victory` / `present` / `idle` |
| 语义来源 | 驱动层 `petAnimKindOf(skill.type)`（照 `Skill.cs:513-526` 的 `GetPetAnimationType` 逐条照搬）⇒ 事件上的 `skillKind`。场景在 zip 到伤害事件时把「出手」动作的 kind 换成它 |
| 兜底 | 「使用了」战报行只带技能名不带类型 ⇒ 建动作时先按 `DEFAULT_ATTACK_KIND='physic'` 兜底，拿到真类型再覆盖。**拿不到真类型时演物攻**（出现率最高、最不容易出戏），已在代码注释与 §3 登记 |
| 受击语义 | 照 `UnitHudSystem.OtherSidePetReactionInfo`：命中且暴击→`crit`、命中→`hit`、没命中→`miss`。战报对应「打出了致命一击，」「但是没有命中…！」（`phase.ts:673-676`）。**此前未命中与暴击都播 `被打`，等于没反应** |
| 走空处理 | 整条候选链都没命中 ⇒ 保持当前 clip + `[stage] <side> 无匹配动画（候选 …）` 一行 |

**修掉的两个真 bug**（旧 `KIND` 表）：① `'攻击'` 是 `物理攻击`/`属性攻击`/`特殊攻击`/`合体攻击` 的**共同子串** ⇒ 打出哪一段全看 `getAvailableStates()` 的数组顺序，**等于随机**；② 表里 `魔法`/`技`/`被击`/`死亡`/`倒下`/`win`/`idle`/`stand`/`die`/`death`/`登场`/`出场`/`专属`/`大招` **一个都不在白名单**，永远匹配不到。

⚠️ **`合体攻击` / `变身效果` 两个 clip 本批没接**（上游对应连携/变身两条独立演出，`parallelCount` 恒 1 且变身是 E6 的事）。**`濒死`（ABOUT_TO_DIE）也没接** —— 上游在 `hp/maxHp < 0.2` 时会切过去，我们没有这一动作。如实登记，非死账。
### 17.7 As-built 补 · 第二批四件（DB2 批 · 2026-10-19，人类「相机屏震/闪白、暴击大贴图、技能气泡、回合末 buff 也实现吧」）

设计正本 = `docs/view/scene/battle/view-scene-battle-stage.md §9.7`（DB7–DB11 + 触发阈值表 + 新偏差 4/5）。**仍然 `game/core/**` 零改动。**

| 件 | 落点 | as-built 要点 |
|---|---|---|
| **DB7 屏震** | `restartFighterStage.js screenShake()` + `ui.css #rb-shake` | 上游协程（0.1s × 18 步、`e = -e*decay`、相机 `(e,-e/3)` + UI `(30e,-10e)`）原样搬成定时器；玩家看到的净位移 `(-78e, +26e)` px × `1200/1920`。新层 `#rb-shake` 包住 bg/fL/fR/dmg，**overscan 缩放**写在 JS 的 transform 里（位移多大就放大多少）⇒ 震动时舞台边缘不露黑边。`shakeToken` 让同一次伤害里的二次触发顶掉前一次。**两条触发**：① 伤害侧（终击暴击 / >400 / 连击段暴击）；② **出招侧**（`BattlePetAnimView.ScreenShake`：必杀(100) 或 连携(3) 的技在动画起点震一下，参数同为 `0.4`，判据 `skill.isSuperSkill` 由驱动层给） |
| **DB8 闪白** | `restartFighterStage.js screenFlash()` + `ui.css #rb-flash` | 全窗口纯色 div 挂 **`#wrap`**（不是 `#rb-stage`：后者只按宽缩放、高度未必铺满 `rbb-full` 的 100vh），`z-index:90` 盖过 `#rv`(60)。`Flash.anim` 逐点：0→红、33%→白、67%→浅黄、100%→黄，0.12s。`void offsetWidth` 强制重排让重复触发能重放 |
| **DB9 技能气泡** | `spawnSkillBubble()` + `ui.css .rb-skillbar` | 底图 `Fight/Skill name bar.png`（292×26，字号 15、`#00fff5`、居中），2.5s 自隐。文案 `技能名` / `技能名（N连击）`。判据 `!isActionSkill(type) && type != 被动`。**时机**：场景把气泡回挂到同一条**出手**动作（`kind==='attack'\|\|'super'` 且同侧），不是等「被击」；找不到就退回挂在被击上 |
| **DB10 暴击贴图** | `content.js parseCriticalEffects/criticalPosterOf/criticalPosterUrl` + `spawnCriticalPoster()` | 表按上游 11 列定长扫、靠 `Number.isInteger(cells[i+1])` 甩掉表头那一_stride。落盘 `Sprites/<resolvedAssetKey>.png`。播放：`anchor` 居中、`尺寸 × scale`、偏移 `(x·dir, y)`、`scaleX(dir)` 翻转、rAF 逐帧 `EaseOut` 位移 + 三段 alpha。⚠️ **全盘只有 1 条**（`anim/990 → JoseCritical`），查不到就静默不画 |
| **DB11 回合末 buff** | `coreBattleDriver.js turnEndEventsOf()` + `rbattleScene.js clipActions()` | 内核 `TurnEndPhase` 开头 `whosTurn=0` ⇒ 这路帧走 `whosTurn===0` 分支；两侧 buff 账同帧可读。键 `${turn}|end|${side}`。上游「气泡数字取对方、治疗取自己」的换边照搬。`DamageType=false` ⇒ 屏震/闪白/暴击贴图整段跳过、1.2 放大仍做。场景侧：这路**没有战报行** ⇒ 回合末尾单挂一条 `kind:'buff'` 动作（不在 `KIND` 里，只冒泡不换 clip） |

**新增/改动文件**：`game/app/content.js`（表解析）、`game/app/battle/driver/{coreBattleDriver.js,phaseUi.js}`、`game/app/view/battle/restartFighterStage.js`、`game/app/scenes/rbattleScene.js`、`game/app/ui.css`、`tools/serve.mjs`（补 `.csv` MIME）。

**素材可达性已验**（`node tools/serve.mjs` + curl 三条全 200）：`Fight/Skill name bar.png`(693B)、`Data/Battle/critical_effect.csv`(137B)、`Sprites/Battle/CriticalEffects/JoseCritical.png`(209KB)。

**请人测新增条目**见 `docs/status.md §2`「DB2 · 屏震/闪白/技能气泡/暴击贴图/回合末 buff 手测」。

