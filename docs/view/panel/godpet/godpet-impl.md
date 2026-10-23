# C1·灵兽 实现计划与 as-built（`godpet-impl.md`）

> **文档类别**：**impl**（落地计划 + as-built；配对 design = **`docs/view/panel/godpet/godpet-design.md`**（GP1–9 / GPQ1–3 人类 2026-10-19 已拍板）；证据底座 = **`docs/view/panel/godpet/restart-godpet-panel.md`**（A1–A8））。
> **状态**：✅ 已写 + **已落码（2026-10-19）**，as-built 见 §7；**等人类手测**（§8）。
> **编号纪律**：施工批 **GP-a…GP-e**、偏差 **GPD1–GPDn**（本份局部编号，**不是**人类决议 ①–⑨）。
> **验收口径**（决议 ⑦）：本份不发测试脚本；验收 = 人类把游戏跑起来按 §8 清单手测；静态自检（`--check`/分层 grep/资源可达）见 §7 末，**不替代**手测。

---

## 1. 范围

灵兽/精灵王面板闭环（design §0）：HUD「灵兽」钮 ⇒ 面板（3×3 灯位 / 领取约瑟 / 兑换商店 / 规则浮层 / 三档挑战诚实提示）+ `soul` 袋读写落盘 + 商店顶栏希望之光。
**不做**：6v6/2v2/1v1 的战斗（A 组围栏）、`OnFightWin` 点灯闭环、前置 8 兽挑战、约瑟参战/等级钳放开、未接线素材、像素级美术。

## 2. 文件落位与施工批

| 批 | 文件 | 内容 |
|---|---|---|
| **GP-a 面板视图** | `game/app/view/godpet/godpetPanel.js` | L3/L4 DOM 纯视图：`buildGodpetPanel(ctx)` → `{ render }`；`SOUL_PET_IDS=[981,982,983,984,990,985,986,987,988]`（`:9`）；几何抄 SpriteKing 预制（Unity 中心系 ⇒ CSS `480+cx−w/2`、`270−cy−h/2`：Light 400×400@CSS(60,70) 格 100×100 间距 150 / Challenge 四钮 160×50 / 底栏 GetKing+Rule 165×65 / Help 350×180@CSS(545,300) 默认隐）；`HELP_HTML`（`:12-16`）照抄 TMP 两色；`ctx={root,state()→{light,kingAcquired,hope},onFight(type),onShop,onGetKing,onClose}`；亮格 `mountImg(petIconUrl)`、灭格暗空盒不伪造（`:82-90`） |
| | `game/app/view/godpet/index.js` | `create(container, opts)` → `{update:ctrl.render, destroy}`（同 `view/spt/index.js` 形状） |
| **GP-b 数据口/袋** | `game/app/scenes/mapScene.js` | 顶部 `import * as GODPET`（`:42`）+ `import * as RST from '../../logic/restartSession.js'`（`:43`）；模块级单例 `GODPET_PANEL`（并入 `:199` 那行）；灵兽常量 `SOUL_ITEM_ID=400016` / `SOUL_KING_ID=990,SOUL_KING_LEVEL=105` / `SOUL_SHOP_IDS=[500811,490990,21013..21020]` / `SOUL_SHOP_LIMITS=[1,1,-1×8]`（`:371-374`）；`soulRich`（`:375` HTML 转义 + `<color=#hex>`→span）；`soulGet/soulSet`（`:377-392`，读写 `session.data.activityStorage` 的 `id==='soul'` 袋、值恒 `String()`）；`openRestartGodpet()`（`:393-446` 单例守卫 + `state=soulState`） |
| **GP-c 装配 opts** | `game/app/scenes/mapScene.js` | `onFight`=`openHintbox` 诚实提示（`:406-408`）；`onShop`=先关面板再 `openRestartShop({mode:'buy',title:'精灵王兑换商店',itemIds,limit,currency:{coin:400016,diamond:2}})`（`:411-418`）；`onGetKing`=design GP3 全路（判重 / 全亮免扣 或 扣 50 / `syncUidSeq`+`makeRestartPet(990,105)`+`addPet` / 队满回滚 50 / `soulSet` 全亮+done / `A.save()` / `refreshHud()` / 提示）（`:420-442`）；`onClose`=`GODPET_PANEL=null;api.close()`（`:443`） |
| **GP-d 接线** | `game/app/scenes/mapScene.js` | `handlePanelLink` 加 `if(base==='SoulPet') return openRestartGodpet()`（`:467`）+ `ACT_UNBUILT` 摘 `'SoulPet'`（`:457` 名单现 = `Noob/SignReward/Mailbox/Workshop/Fusion/Mission`）；NPC/活动 openPanel sink 加 `/SoulPet/` 分支（`:1261`）；`mountRestartHud` handlers `onGodpet:()=>openRestartGodpet()`（`:267`）；`unmount` 作废 `GODPET_PANEL=null`（`:1935`） |
| | `game/app/view/hud/restartHudView.js` | `godpet` MENU 行加 `handler:'onGodpet'`（`:78`，box `[410,502.5,40,30]` 不动；「面板待建」title 自动消失） |
| **GP-e 周边** | `game/app/view/shop/shopPanel.js` | `CURRENCY_PNG_OK=new Set([1,2,400016])` + `currencyChip` 改走"任一有 PNG 的货币道具"查表（`:43-47`）；顶栏当 `open.currency.coin>2` 补第三颗、余额现读 `state.items`（`:236-247`） |
| | `game/app/view/panels/hintbox.js` | 新增 `contentHtml` 富文本口（`:39/66`）：给了就 `innerHTML`、否则 `textContent`（调用方**必须已转义**）—— 供灵兽"两色希望之光"文案 |
| | `game/app/ui.css` | `rb-godpet-*` 段（`:1044-1072`）：960×540 盒 + 背景 + 灯位格 `--on` 青晕 + 挑战/底栏钮 + Help 浮层（同 `rb-act-*`/`rb-spt-*` 口径，遮罩复用 `rb-scrim`） |

## 3. 行为规格（对位 design §3）

1. **开/关**：`godpet` 钮 ⇒ `openRestartGodpet()`；已开 ⇒ `GODPET_PANEL.update()` 重绘不叠层；✕/遮罩 ⇒ `onClose` 清引用 + `api.close()`；不改 URL、不进历史。
2. **灯位**：`soulGet('light[north]','0'.repeat(9))` 9 字符；逐格 `'1'⇒mountImg(petIconUrl(id))`（9/9 在盘）、`'0'⇒` 暗空盒；每格 title 宠名 + 亮/灭。
3. **领取约瑟**：`done[north][10]` 已领 ⇒ 提示返回；`allLit=!light.includes('0')`；非全亮且 `itemCount(400016)<50` ⇒ 提示返回；非全亮 ⇒ `consumeItem(400016,50)`；`makeRestartPet(A,990,105)`+`addPet`；`'full'`⇒回滚 50 + 提示；否则 `soulSet({'light[north]':'1'.repeat(9), 'done[north][10]':'true'})`+`A.save()`+`refreshHud()`+提示（入队/入仓）+logLine。
4. **兑换商店**：先撤灵兽面板 ⇒ `openRestartShop` 注入 10 货 + `limit=[1,1,-1×8]` + `currency`；买卖计价靠商品自带 `currencyType:400016`（`shop.js:23` 道具当钱）；顶栏第三颗 = 希望之光余额。
5. **三档挑战**：`onFight(type)` ⇒ `openHintbox` 诚实提示（A 组围栏、不开战、不写灯）。
6. **规则浮层**：本地 `helpOn` 开关 ⇒ `render()` 里 `help.style.display` 切换（对位上游 SetActive）。
7. **落盘**：`soul` 袋经 `session.data.activityStorage` + 既有 `A.save()` ⇒ XML `<Activity>`（与限购/地图线同通路、值 string）。

**纪律核对**：`game/app/view/godpet/` 仅相对 import（`../panels/battle/_kit.js`、`../../content.js`、`./godpetPanel.js`），**零 import `game/logic/**`/`session`**（GP6，实测 grep 见 §7）；跳转/领取/落盘动作全在 L4 `mapScene.js`；面板零算数；`#rv` DOM 层 ⇒ SWF/JS 两路画面逐字节不变（GP9）。

## 4. 不做清单（防"顺手实现"）

6v6/2v2/1v1 战斗（`BattleMode.SPT=3`/`Special=4` + 写死 boss 表，报告 §2.4）；`OnFightWin` 随机 3 灯翻转 + 得 3 希望之光 + `done[6v6/2v2/1v1]` 记录闭环；`Fight` 的前置 8 兽门 / 今日门 / debugMode 后门（A5）；`30001` 袋写入（本批只碰 `soul`）；约瑟参战/等级钳；`mega background.png`/`Btn*.png`；像素级正式排版。

## 5. 数据验证（构建期，非验收）

- 9 张灵兽头像 `Resources/Pets/icon/{981..988,990}.png` **9/9 在盘**（实测），`petIconUrl` 路由可达。
- 兑换 10 件货 + 希望之光 `400016` 全在 `game/data/unity/items.json`，且件件 `currencyType:400016`（实测：500811/490990/21013/21020… 价格 20/10/8/8）。
- 背景 `Panels/SpriteKing/Sprites/background.jpg` 在盘（实测）。
- 本批**零新裸依赖** ⇒ `game/index.html` import map **不需增项**（新文件全相对 import）。

## 6. 手测前置

无新表/生成物；`soul` 袋缺省 ⇒ `soulGet` 给全 '0'（面板开局 9 暗格）；想验证"亮格出真图"可在调试台 `session.data.activityStorage` 里把 `soul/light[north]` 改含 '1' 后重开面板，或 `A.addItem(400016,50)` 验领取。

## 7. as-built（GP-a…GP-e · 2026-10-19）

- 落位与 §2 计划**一致**；相对计划**新增 1 件**（hintbox `contentHtml`，见 GPD2）、**未动 1 件**（session.js，见 GPD1）。静态自检（编译级，不构成验收，决议 ⑦）：新增/改动 `.js` 过 `node --check`（临时 `.mjs`，因 package.json 是 commonjs）；import 闭包遍历"ALL IMPORTS RESOLVE"；分层 grep `from '..*logic/` 在 `game/app/view/godpet/` 零命中；新文件仅相对 import；`tools/serve.mjs` 起后 `godpetPanel.js`/`index.js`/`background.jpg`/`Pets/icon/990.png`/`items.json` 均 HTTP 200。

| # | as-built（实现实况，与上文计划的差异如实登记） |
|---|---|
| **GPD1** | **`game/app/session.js` 一行未改**（计划原 §3 写了"session.js soul 袋回写"）：查明 `soul` 袋 = `session.data.activityStorage` 里 `id==='soul'` 的通用键值袋，既有 `A.save()` 已把它随 XML `<Activity>` 落盘（与限购 `writeShopToData`/地图线 `setActivity` 同通路）。⇒ 改在 `mapScene.js` 用 `soulGet/soulSet`（`:377-392`）**就地读写**，无需新开 session.js 桥。design GP7 已据此写"不新开桥"。 |
| **GPD2** | **`hintbox.js` 加 `contentHtml` 富文本口**（计划未列）：上游 GetKing/挑战提示用 TMP `<color=#ffbb33>` 两色，纯 `textContent` 会把标签当字面显示。⇒ 新增可选 `contentHtml`（给了走 `innerHTML`、否则 `textContent`），灵兽侧配 `soulRich`（`:375`）先 HTML 转义再 `<color=#hex>`→`<span>`，保证只放白名单标签。 |
| **GPD3** | **`shopPanel.js` 货币查表放宽**：原 `currencyChip` 只认 1/2（赛尔豆/星钻）。⇒ 换成 `CURRENCY_PNG_OK=new Set([1,2,400016])` + 按 `restartItemOf(cur)` 取图标/名，顶栏在 `open.currency.coin>2` 时补第三颗、余额现读 `state.items`（零算数）。这是"道具当钱"商店（GP4）的显示侧配套，**买卖计价仍全在 `shop.js`、未改**。 |
| **GPD4** | **几何 = 人眼校常量族**：CSS 摆位按 SpriteKing 预制中心系换算硬编在 `godpetPanel.js`/`ui.css`；Help 浮层用本地 `helpOn`+`render()` 切 `display`（非上游 `SetActive` 节点）。偏了回改常量，不改 `SOUL_PET_IDS` 数据（真值只在报告/design）。 |
| **GPD5** | `HELP_HTML` 落码时订正一处上游 TMP 富文本串里的 `style="color=#00ffff>` 缺引号 typo ⇒ 写合法内联 `style="color:#00ffff"`（行为 = 青色说明，不照搬坏标记；决议 ②声明）。 |
| **GPD6** | **族标签 = C1**：初版代码注释误标 `★C5`（C5 = 系统族 `view-panels-system.md` Settings/Mod/…）；`SoulPet`/`SpriteKing` 在 `view-design.md §8` 与 `view-panels-pet.md §64` 均列 **C1 精灵面板族** ⇒ 已全部改回 `★C1·灵兽`（与 `★C1·Dex` 同族同标）。 |
| **GPD7** | `SOUL_SHOP_LIMITS=[1,1,...Array(8).fill(-1)]`（`:374`）作为 `open.limit` 透传；`-1` = 不限（对位 `Shop()` 的 `-1×8`），由 `shopPanel` 既有 `limitFor/remaining` 消费，灵兽侧零限购算术。 |
| **GPD8** | 领取 `addPet` 返回 `'full'`（队满 + 仓满）⇒ **回滚本局已扣的 50**（`:433` 仅 `!allLit` 时）再提示"背包已满"，不吞道具、不吞宠。 |

## 8. 请人测（= design §5；交付时随回复同发）

1. **开面板**：`#/map?slot=0&…` 点 HUD 底栏「灵兽」钮 ⇒ 面板弹出：左侧 3×3 暗格（开局全 '0'）、右侧「6v6/2v2/1v1 挑战」+「兑换商店」、底栏「领取约瑟」+「挑战规则」、右上 ✕；再点一次「灵兽」不叠层（重绘）。
2. **规则浮层**：点「挑战规则」⇒ 右下方弹出两色规则（希望之光橙、说明青）；再点收起。
3. **三档挑战 = 诚实**：点 6v6/2v2/1v1 ⇒ 弹提示盒说明"属 A 组围栏、待建"，**不发生战斗、不点亮、道具数不变**。
4. **亮格出真图**：调试台把 `soul` 袋 `light[north]` 改成含 '1'（如 `'110000000'`）后重开面板 ⇒ 对应格显示精灵王真头像（981/982…），其余仍暗格；**缺图应画虚线占位、不冒充别的图**（正常 9/9 在盘不该缺）。
5. **领取约瑟（攒钱路）**：`A.addItem(400016,50)` ⇒ 点「领取约瑟」⇒ 扣 50、提示"获得约瑟 Lv105"、9 灯**全亮**、约瑟入队（队满入仓）；关游戏重开同档 ⇒ 灯仍全亮、背包里有约瑟、再点领取 ⇒「你已经获得过约瑟了哦」。
6. **领取约瑟（免扣路）**：`light[north]` 设全 '1' ⇒ 点领取 ⇒ **不扣希望之光**直接得约瑟（验 A3 全亮免扣）；持有 <50 且灯未全亮 ⇒ 提示"集齐50个…"、领不到。
7. **背包满回滚**：把队+仓塞满 ⇒ 非全亮路点领取 ⇒ 提示"背包已满"、**50 希望之光退回**、未多出一只约瑟。
8. **兑换商店**：点「兑换商店」⇒ 灵兽面板先关、弹出「精灵王兑换商店」10 件货（500811/490990 限购 1、21013..21020 不限）；顶栏三颗货币含**希望之光余额**；持有 400016 时买计价货 ⇒ 扣希望之光、限购品余量跨档成立（重开不归零）。
9. **活动/图鉴入口同板**：活动面板「去参加」`soul`(精灵王之路) 行、或图鉴里任一灵兽"去这张图"`SoulPet` ⇒ 都开本面板（不再"待建"日志；`ACT_UNBUILT` 已摘 `SoulPet`）。
10. **SWF/JS 两路一致**：注明图（如 `100`）与 JS 回退图各点一遍「灵兽」⇒ 面板行为一致（DOM 常驻层，与画面通路无关）；✕/遮罩关闭后**无残留层**、可重复开。

> 挑战（6v6/2v2/1v1）的"通关点灯 + 得 3 希望之光"闭环 = **A 组围栏、本批不可测**（GPQ1/报告 A6）：手测只确认"诚实提示、不开战"，待引擎侧 SPT/Special 规则解锁后再补第 11 条闭环测项。
