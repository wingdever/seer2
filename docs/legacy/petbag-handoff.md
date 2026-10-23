# 精灵背包（PetBagPanel）复刻 — 交接文档

下一轮会话冷启动用。物品背包（ItemBagPanel）已完工并浏览器验证，本轮的全部可复用结论都在下面。

## 0. 长期约束（不可协商）

- 个人学习研究用途；不二次分发版权素材；不做压力测试。**不要把图鉴发布到 Qoder Sites。**
- 爬取必须有界：并发 3、120–150ms 间隔、显式请求预算、不做无边界 ID 扫描。
- 素材处理走**图像/数据模型本身**，不要渲染截屏烘焙管线。任务 #5（finalize 烘焙）保持暂停，除非用户明确要求否则不要恢复。
  （用 puppeteer 截图来**验证我们自己写的 UI 行为**属于正常流程，不算烘焙。）
- 终极目标：用这些素材复刻一个单机版对战游戏，先 1:1 复刻原游戏的战斗场景。

## 1. 关键路线：ApplicationDomain（这条是本轮最大的发现）

`Loader` 载入的 SWF 导出的类**不在** `ApplicationDomain.currentDomain` 里（这就是当初 HUD 记下 #1065 的原因，那条负结果**已被推翻**，见 docs/legacy/web-client-notes.md「主界面 HUD」），但在**那个 SWF 自己的 domain** 里：

```as3
var l:Loader = new Loader();
l.contentLoaderInfo.addEventListener(Event.COMPLETE, function(e:Event):void {   // 实测用 COMPLETE 就够
    var src:MovieClip = e.target.content as MovieClip;
    if (src == null) { debug("根为空"); onDone(false); return; }
    var dom:ApplicationDomain = src.loaderInfo.applicationDomain;   // ← 关键: 用它自己的 domain
    var cls:Class = dom.getDefinition("starPanel1") as Class;       // 类名照 SymbolClass 清单原样传
    panel = new cls() as MovieClip;                                 // 等价于原版 UIManager.getMovieClip() + new UI_Xxx()
});
l.contentLoaderInfo.addEventListener(IOErrorEvent.IO_ERROR, ...);
l.load(new URLRequest(MODULE_URL));   // 绝不接它的返回值, 也绝不在 l.load() 返回值上加监听
```

物品背包就是靠这条路走的，精灵背包照抄即可。**HUD 仍然用注入路线**（`tools/inject-ui-panels.mjs`），因为它已经跑通了，没必要改。

## 2. Ruffle / AVM2 的四个硬坑（都踩过，别再踩）

1. **`Error #2069: The Loader class does not implement this method`** — 载入的显示对象不能从它的 `Loader` 里摘出来（`content.parent.removeChild(content)` 直接抛）。图标必须常驻在**每格自己的 Loader** 里，换东西就往同一个 Loader 重新 `load()`。这就是原版 `IconDisplayer` 的模型。
2. **`Loader.load()` 在 Ruffle 里可能返回 `null`** — 千万别 `var info:* = ld.load(...)` 再链式加监听；一个 TypeError 会在 `show()` 之前把整个刷新打挂，表现是「面板打不开」。监听一律挂 `ld.contentLoaderInfo`。
3. **符号的注册点 ≠ 美术位置** — 页签/按钮的 `x/y` 是注册点，绘制却在负偏移上（实测 `equip@47,37 38x49 盒-37,-50 40x51`）。只靠美术命中会点空，必须用 `getBounds` 量出盒再钉一块 `hitArea`：
   ```as3
   var tb:Rectangle = t.getBounds(t)
   var th:Sprite = new Sprite(); th.graphics.beginFill(0); th.graphics.drawRect(tb.x, tb.y, tb.width, tb.height); th.graphics.endFill()
   Sprite(t).hitArea = th      // hitArea 在 playerglobal 11.1 里声明于 Sprite，不是 DisplayObject/InteractiveObject
   ```
4. **`BitmapData.draw` 在 Ruffle canvas 后端不存在**（抛异常且逃出 AVM2 的 try/catch）。DefineFont2 是子集字体，**新增中文文本在 SWF 内没有墨**（ASCII 如 `x5`、`5000` 可以）→ 中文提示一律走 DOM 覆盖层。

配套 mxmlc 严格类型注意：`import flash.utils.Dictionary` / `getQualifiedClassName`；`InteractiveObject(x).mouseEnabled`；两个 DisplayObject 之间不能写 `||`。

## 3. 精灵背包资产盘点

模块：`swf/module/app/PetBagPanel.swf`（1432969 B，已在本仓库）。完整符号清单见 **`docs/legacy/petbag-symbols.txt`**（119 条 SymbolClass 绑定 + 46 个有命名子对象的 sprite）。

重新生成：
```
BAG_N=200 BAG_SPRITES=46 node tools/probes/tmp-bag-dump.mjs swf/module/app/PetBagPanel.swf
node tools/probes/tmp-petbag-slot.mjs swf/module/app/PetBagPanel.swf 1256 1286 1297   # 定点查未导出的符号
```

| 组件 | 导出名 | 怎么拿到 |
|---|---|---|
| 面板本体 | `starPanel1` | **裸名、无包前缀** → `getDefinition("starPanel1")` |
| 页签条 | `TabUI` | 同样是裸名 |
| 技能格 | `NormalSkillCellUI` / `BasePetAblilityUI` / `SetQualityUI` | 裸名 |
| 部分子面板 | `com.taomee.seer2.module.app.appraisal.AppraisalPanelUI` | **全限定名** |

⇒ **不要照抄物品背包的 `PKG` 常量做法。** `ItemBagRunner.as:33` 里有
`private static const PKG = "com.taomee.seer2.module.app.itemBag."`，`def()` 会把它拼在类名前 —— 那套前缀在 ItemBagPanel.swf 里成立。
PetBagPanel.swf 的 SymbolClass 是**混合的**：同一个文件里既有 `starPanel1`（裸名，清单第 62 行）又有
`com.taomee.seer2.module.app.appraisal.AppraisalPanelUI`（全限定，第 2 行）。**必须按 `docs/legacy/petbag-symbols.txt` 第 1 列逐字传入**；
若沿用 `PKG + name` 会 `getDefinition` 抛错（`def()` 吞掉后返回 null，表现为「面板安静地不出现」）。

主面板 = **`sprite1377`（1 帧，73 个子对象）**，即上表的 `starPanel1`。

命名子对象分类：

| 组 | 实例名 | 说明 |
|---|---|---|
| 背包格 | `bag0..bag11` | 12 格，全部是 **id1256** 的实例 |
| 仓库格 | `depot0..depot17` | 18 格，同样是 id1256 |
| 出战位 | `pet0..pet4` | 5 位，同样是 id1256 |
| VIP/星标 | `vip0..vip4`（**不是同一族**：id1263/1265/421/423/1267，各指不同符号）、`starText0..4`（id1300-1302）、`pethead0..pethead5`（id1286，每个前面还挂着未命名的 id1254/1255/128x） | 别按名字批量取，逐个核对 id |
| 按钮 | `closeBtn` `pageUp` `pageDown` `petBtn` `bagBtn` `depotBtn` `yiJianBtn` `getStarHun` `tuJianBtn` `heChenMc` `zhezhuMc` | |
| 货币 | `smoney` `money` `starmoney` | |
| 其他 | `pet` `chooseShow` `showMc` `name1` `newShow1/3/4` `__id2_` | |

**id1256 未被 SymbolClass 导出**（本轮定点确认）：

```
=== sprite1256 frames=1 导出名=(未导出) ===
  帧0: ?(d1,id1254) ?(d3,id1255)
```
两个子对象都**没有实例名**；再往里 `id1254 → id613`、`id1255 → id615`（各 1 层，是底板与图标托底）。

⇒ 结论：**精灵格子不能 `new`，只能从面板上 `getChildByName("bagN")` 摘现成的实例**（物品背包的 `ItemBagCellUI` 是可导出的，两边不一样）。格子内部只能用 `getChildAt(0)`=底板 / `getChildAt(1)`=图标位 按下标取，靠名字取不到。

其它未导出的分组符号（`newShow*`/`btn*` 复合体）：
- `sprite1319` = `btn0(d1,id1307) btn1 btn2 btn3 newShow2`
- `sprite1323` = `btn0 btn1`
- `sprite1327` = `btn0 btn1 btn2 newShow5 newShow6`
- `sprite1318` = 30 帧的动画符号（`newShow*` 都指向它，多半是引导/闪光特效），逐帧内容相同：`id1314 id1315 id1316`。

### 已导出的可用类（`docs/legacy/petbag-symbols.txt` 摘录）

- `TabUI → id83`：`abilityTabBtn magicTabBtn infoTabBtn itemTabBtn introduceBtn skillTabBtn newGuideMc`
  ⚠️ **`TabUI`(id83) 并没有被放在主面板 `sprite1377` 的时间轴上**（本轮逐帧核对：1377 帧0 的 73 个子对象里没有 id83 的实例）。
  所以要显示这套页签，得走 `getDefinition("TabUI") → new` 自己挂上去 —— 这跟物品背包不同（那边页签条也是 `new` 出来的，可以照抄）。
- `PetItemBagUI → id349`：`pageBar qualityItemNum recovery searchTxt searchBtn tab0..tab6`
- `bagShowPanel → id660`：`money goBag pet bagBtn pet0..pet4 _btnShow starUpdateTip`
- 详情/技能：`sprite759`（`petName heightTxt weightTxt getWayTxt introduceTxt star0..3 catchTimeTxt`）、`NormalSkillCellUI`（`background annimation nameTxt powerTxt angerTxt categoryTxt hideTips`）、`sprite438`（`bgCell openStateMC selector levelBg levelTxt HP hpText light`）、`BasePetAblilityUI`（`studyPointN propN charactorN potentionN barN addHpTxt…`）、`SetQualityUI`、`sprite1552`（`num0..6 allNum0..6 expBar curExpTxt starTxt level levelTxt emblem0..1 funcUp0..5`）
- 其余：`AppraisalPanelUI→245`、`starPanel2→1149`、`PetBagBgUI→1242`、`ItemCellUI→1221`、`PetCellResUI→444`、`PetSkillUI→1411`、`PetListUI→698`、`SelectSkillUI→1216`、`CandidateSkillUI→962`、`CriticalSkillCellUI→196`、`AvailableSkillUI→200`、`CurePetsTipPanelUI→586`、`GotExpPanelUI→411`、`starLevelUpPanel→1006`、`StarPicture→378`、`GetBackButton→460`

⚠️ `annimation` 是原版拼错的符号名，照抄别改。

## 4. 数据来源

- `game/data/pets.json`：`{ _src, types(23), skills, monsters(1016) }`；monster 条目形状
  `{id, name, swfId, type, element, stats:{hp,atk,def,spa,spd,spe}, skillIds}`。
- `game/data/items.json`：2.24 MB / 9629 条（物品背包在用）。
- 存档：`SAVE = {name, level, coins, diamonds, bag:[], items:null}`（现行 SPA 宿主 `game/app/scenes/mapScene.js`）。
  - `pushHud()` 会在 `SAVE.bag` 为空时从 `M.wild.pool` 播种。
  - `bagRecords()` 已产出 `"swfId|名字|等级|hp|hpMax"` 字符串数组，取 `SAVE.bag.slice(0,8)`，`hpMax = Math.max(1, Math.round(m.stats.hp * 3))`。
    **这条格式就是给精灵背包准备的接口**，`PetBagRunner` 直接吃同样的记录串即可，不必新造数据通道。
- 精灵头像：原版是 `res/pet/icon/{resourceId}.swf`，**这份本地没有镜像**。已有的是动作帧包
  `/swf/pet/normal/{swfId}.swf`（本地只抓到 48 个，与野怪同一份原版美术）。
  `HudRunner.as:430-431` 已经用「拿动作帧包顶上」的办法解决过一次，精灵背包照抄那套即可。
- 物品图标路由是**按 ID 区间**（`ItemConfig.getItemIconUrl` + `ItemIdRange` + `URLUtil`），不是 XML 的 `Cat` 字段。

## 5. 实现步骤（照着物品背包抄）

1. **`game/maprunner/PetBagRunner.as`** — 用 §1 的 domain 路线载入 `/swf/module/app/PetBagPanel.swf`，
   `getDefinition("starPanel1")` → `new` 出面板；摆位常量参照物品背包的写法（从实测几何反推，不要猜）。
   - 格子：`panel.getChildByName("bag"+i)`，**不要** `new`；内部 `getChildAt(1)` 放头像 `Loader`（每格常驻一个，理由见 §2.1）。
   - 页签/按钮：`getBounds` + `Sprite().hitArea`（§2.3）。
   - 中文文本：一律 DOM（§2.4），格子数量/等级用 ASCII TextField。
   - 建好之后照 `ItemBagRunner` 那样 `debug()` 一份层清单（`面板层 N: 名字:类@x,y wxh`），后续定位全靠它。
2. **`game/maprunner/MapRunner.as`** — 加回调，照物品背包那四个一模一样：
   注册在 `MapRunner.as:113-116`（`bagOpen / bagItems / bagMoney / bagStatus`），
   实现在 `MapRunner.as:672-707`（`jsBagOpen / jsBagItems / jsBagMoney / jsBagStatus`）。
   → 新增 `petBagOpen / petBagItems / petBagSelect / petBagStatus`。
3. **`game/app/scenes/mapScene.js`** — HUD 的 `petBag` 点击现在还在 `HUD_TODO` 里；接成 `togglePetBag()`，把 `bagRecords()` 喂给 runner；提示框复用 `showBagTip` 那套 DOM（`textContent` only，别 `innerHTML`）。
4. 构建：`bash tools/build-maprunner.sh`（Flex 4.16 mxmlc，`JAVA_HOME=/usr/lib/jvm/java-8-openjdk`，playerglobal 11.1 external，`-target-player=11.1.0 -swf-version=14`，`-load-config=game/maprunner/build-config.xml` = 1200×660 @24fps）。

## 6. 验证脚本
。
浏览器：puppeteer-core + `/usr/bin/chromium --no-sandbox --disable-gpu --use-gl=swiftshader`。

| 脚本 | 用途 |
|---|---|
| `tools/probes/tmp-bag-shot.mjs` | 打开面板、逐个点页签并截图。**注意它重试点击**（HUD 是异步绑定的，一次点空会假报 `bag=none`）；页签坐标用的是**实测美术中心**：`equip 563,133 / petRelate 630,140 / collection 700,141 / vip 768,141 / element 837,141 / petSpirtTrain 908,142` |
| `tools/probes/tmp-bag-icons.mjs` | 打印 `bagStatus()` 前后差 + 过滤 `/图标\|格子\|背包\|bag/` 的日志尾 12 行 + Ruffle console 报错 |
| `tools/probes/tmp-bag-zoom.mjs` | deviceScaleFactor=3 裁切某块格子区域放大截图 |
| `tools/probes/tmp-bag-pix.mjs` | 回读 Ruffle canvas 像素（`drawImage` 进 2D canvas + `getImageData`），把命中色映射回舞台坐标 |
| `tools/probes/tmp-bag-dump.mjs` / `tools/probes/tmp-petbag-slot.mjs` | SWF 符号普查（整份 / 定点） |

**踩过的工具坑**：页面里的 `#log` 是**倒序（最新在上）**，`slice(0, N)` 拿到的是最老的行 —— 曾因此误判过一次「没有图标日志」。要过滤+取尾。

## 7. 物品背包的当前实测结果（作为复刻基准）

从工具栏「背包」按钮打开；六页签过滤正确：equip 1 / petRelate 9 / collection 2 / vip 1 / element 2 / petSpirtTrain 0；30 格显示原版矢量图标 + 数量角标；悬停 DOM 中文提示；点击消耗 1 个；货币栏 0/5000；页码 "1"；关闭按钮生效；无素材 404。
`vipFlag` 符号默认是**可见**的，必须在建格时按 `viponly` 驱动，否则空格也挂 VIP 角标。
面板半透明格栅底下透出来的地图黄点是**地图本体**，不是面板残留（已用 `tmp-bag-pix.mjs` 证明：面板关闭时舞台 596–603 × 466–473 同样有这个点）。

## 8. 未结的其它任务

- #23 HUD 缺口：活动栏图标 / ColorEgg / WeatherIcon / 面板点击行为。
- #5 finalize 烘焙扫尾 —— **已暂停**，非用户明确要求不要恢复。
- 推迟：`initialPoint` 极性真值测试跑完之前，不要重新考虑 `USE_GRID=true`。
