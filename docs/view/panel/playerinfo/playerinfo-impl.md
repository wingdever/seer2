# C4·个人信息 实现计划与 as-built（`playerinfo-impl.md`）

> **文档类别**：**impl**（落地计划 + as-built；配对 design = **`docs/view/panel/playerinfo/playerinfo-design.md`**（**PIQ1–4 已由人类 2026-10-20 全部拍板 = A**）；证据底座 = **`docs/view/panel/playerinfo/restart-playerinfo-panel.md`**（A1–A15））。
> **状态**：✅ 已写（施工计划）；**✅ 已落码（PIQ1–4 全 A，2026-10-20）**；as-built 见 §7（含偏差 **PID1–PID6**）、请人测见 §8。**PI-equip（装备/坐骑两栏，施工批 PI-f）= 计划已登 §2/§3.11、§8.10–15；落码与 as-built 见 §7.4。**PI-g/PI-h 已结账（§7.5/§7.6，手测 #16–18 ✅）；PI-i（图标画面源 = 离线静图，人类点名 PI-static）= 已落码、as-built §7.7、**#19 ✅ 追认通过（2026-10-21，间接证据）**。PI-j（缺件过滤 + 「颜色」组，人类 2026-10-21 三条指令）= 已落码、as-built §7.8、**#20 ✅ 手测通过（2026-10-21「ok, done good」）**。PI-k（「表情」组 + `suit=0` 空件不列 + 部件包裁 5 张图标静图，人类 2026-10-21 四条反馈 ⇒ `ALQ12`/`ALQ13`/`ALQ14`）= 已落码、as-built §7.9（偏差 **PID17**）、**#21 ✅ 手测通过（同日同一句回报）** ⇒ **C4 面板 PI-f…PI-k 全部结账，下一批待人类点名。**
> **编号纪律**：施工批 **PI-a…PI-k**、偏差 **PID1–PIDn**（本份局部编号，**不是**人类决议 ①–⑨）。
> **验收口径**（决议 ⑦）：本份不发测试脚本；验收 = 人类把游戏跑起来按 §8 清单手测；静态自检（`--check` / 分层 grep）见 §7 末，**不替代**手测。

---

## 1. 范围

个人信息面板闭环（design §0）：HUD「信息」钮 ⇒ 自绘最小面板（昵称两拍 / 称号·装备下拉（仅拥有）/ ~~立绘三态 + Change~~ **PI-f 起 = 装备/坐骑两栏 + canvas 预览（design §3.8）** / 赛尔豆·星钻活读数 / Shoot 翻转 / Bag 开道具背包 / Follow·Home 诚实提示）；三字段读写经 **L4 装配点闭包**注入（`session.js` 一行不改）；`PlayerInfo` 防未来兜底进分派器 + NPC sink。
**不做**（design §1 + PIQ 已决全 A ⇒ 以拍板为准）：Item Bag 含货币子层（PIQ1 建议 A = 不造）、点玩家第二入口（A15）、地图头顶名/称号文本（无消费面）、光标 / 990 清 seed 特例（A7）、YiTe 换袋支（A9）、像素级美术（A12）、`session.js` 新桥。

## 2. 文件落位与施工批

| 批 | 文件 | 内容 |
|---|---|---|
| **PI-a 面板视图** | `game/app/view/playerinfo/playerInfoPanel.js`（新） | L3 DOM 纯视图：`buildPlayerInfoPanel(ctx)` → `{ update }`；480×320 居中框 + scrim 点关 + ✕（`activityPanel.js` 范本）；**昵称两拍**（名字文本 ⇄ InputField、placeholder = 旧名、Edit/Mark 图标钮、第 2 拍空 ⇒ `ctx.showHint` 且不退出编辑）；**称号下拉** = 原生 `<select>`（「无」+ `ctx.listAchievements()`，回填 `ctx.getAchievement()` 查无 = 选「无」）；**立绘三态**（robot PNG / 装备 `makeItemIcon(resId)` / nono PNG，高 100/150、宽等比、`mountImg` 缺图自陈）；**货币行**（`makeItemIcon(1/2)` + `ctx.getCoins()/getDiamonds()`，同 shop `currencyChip` 惯例）；**五钮**全发信号（`onSubmitName/onPickAchievement/onToggleRobot/onToggleShoot/onOpenItemBag/onFollow/onHome`），视图**零查表零写档**（只 import `../panels/battle/_kit.js` + `../item-art.js`，连 `content` 都不 import） |
| **PI-b 装配口** | `game/app/view/playerinfo/index.js`（新） | `create(container, ctx)` → `{ update, destroy }`（同 `activity/index.js` 9 行形） |
| **PI-c 样式** | `game/app/ui.css` | `rb-pif-*` 族：480×320@240,110 居中框（深蓝系同 `rb-act-*`）、名字行 / 下拉 / 立绘格 / 货币行 / 五钮 / 编辑态；**插在 `rb-act-go--off`（`:706`）之后、演出期锁注释（`:708`）之前** |
| **PI-d L4 装配** | `game/app/scenes/mapScene.js` | ① import `* as PINFO_VIEW from '../view/playerinfo/index.js'`（`:42` 灵兽 import 后）；② 单例行 `:199` 加 `PINFO = null`；③ `mountRestartHud` handlers 袋加 `onInfo: openRestartPlayerInfo`（`onEvent` 行 `:265` 旁）；④ 新 `openRestartPlayerInfo()`（`openRestartActivity:471-481` 范式照抄 + **ctx 读写闭包** = design §4 契约表：`getNickname/setNickname`（写时同步 `session.state.trainer.name`）、`getAchievement/setAchievement`、`listAchievements`（`session.data.itemStorage` 过滤 `typeId∈{23,24,25}`、`typeId` 降序 `id` 升序、名字/resId 查 `CONTENT.restartItemOf`）、`getUseRobot/setUseRobot`（`session.data.settingsData.useRobotAsPlayer`，**settingsData 缺失时先补空对象**）、`getCoins/getDiamonds`（`A.state.trainer.*`）、`getShootMode/toggleShoot`（`session.isShootMode`，**不 save**）、`onSave`（`A.save(); refreshHud()`）、`openItemBag`（`PINFO=null; api.close(); openRestartItemBag()`）、`showHint`（`openHintbox` 1 键）、`onClose`）；⑤ 分派器 `handlePanelLink` 加 `if (base === 'PlayerInfo') return openRestartPlayerInfo()`（`SoulPet` 行 `:467` 后、`ACT_UNBUILT` 判 `:468` 前；**`ACT_UNBUILT` 名单不加**）；⑥ NPC openPanel sink 加 `else if (/PlayerInfo/.test(intent.panel)) openRestartPlayerInfo()`（`SoulPet` 行 `:1263` 后、兜底 `:1264` 前）；⑦ unmount 作废行 `:1938` 加 `PINFO = null`（该行现缺 SHOP/SPT_PANEL = **既有遗漏，不顺手补**） |
| **PI-e HUD 接线** | `game/app/view/hud/restartHudView.js` | `info` 行（`:80`）加 `handler: 'onInfo'`（box/图标/label 均不动；title 自动变 tip「信息」= `:220` 规则） |
| **PI-f 装备/坐骑两栏**（PI-equip · design §3.8；PIQ5=全目录 / PIQ6=两态钮 / PIQ7=canvas 预览） | `playerInfoPanel.js` + `mapScene.js` + `ui.css` | **L3**：装配行 `portrait` → `split`（`rb-pif-split` = flex row）；左 `rb-pif-left` = `<canvas class="rb-pif-canvas">` 预览 + `rb-pif-equipped` 已装配 7 格条（图标+名+「卸下」钮；阴影格无卸下）；右 `rb-pif-right`（滚动）= 固定 7 组 `rb-pif-group`（头1/手2/脚6/腰5/背7/坐骑3 **名字牌格子**——⚠️ 落码时实测**装备图标素材盘上无**（`swf/item/equip/` 镜像不存在、Unity 树无 10xxxx 段、上游 find 零命中）⇒ 不摆假图标、名字牌先行，`makeItemIcon(id,_,false,'装备')` 留作素材到位后的自动升级位；现装格 `rb-pif-cell--on`；点击 → `ctx.onPickEquip(id, slot)`；阴影组 = 两互斥钮 `rb-pif-groundbtn(--on)` → `ctx.onPickGround(mode)`）；**三态立绘 + Change 钮 + `fitImg`/ROBOT/NONO PNG 删除**（PIQ7）；建面板时 `ctx.setPreviewCanvas(canvas)`。**L4**（`openRestartPlayerInfo` ctx 扩，design §4 契约表）：`listCatalog()`（`CONTENT.loadEquipIndex()` 开面板前 await 预载缓存，按 slot∈{1,2,3,5,6,7} 分组 `{id,name}`）、`getEquippedSummary()`（`equipVec` 反查目录 + `mountEquipId` + `groundMode`）、`getGroundMode()`、`onPickEquip/onUnequipSlot/onPickGround`（全路由既有 `APP.actorLook.equip/unequip/ride/unride/ground`，自带 syncLook+persistLook 落 `<equip>`；阴影不落盘）、`refreshPanel()`（`PINFO.update()` + 预览补帧）；**预览喂帧** = 新 `renderPreviewTo(canvas)`（`drawActor` 旁；dpr 定 backing store、clear、`drawActor(c, cx, cy, PREVIEW_SCALE, dy)`，`LOOK.ready===false` 早退不崩）+ 模块变量 `PI_PREVIEW`（`setPreviewCanvas` 登记 + 立即补帧；`stepActorAnim` 画完地图后若在册则逐帧补绘 = **零新增 rAF**、与地图同 LOOK 同时钟；`onClose`/`unmount` 置 null）。**CSS**：`.rb-pif-box` 480→640、left 240→160；`.rb-pif-portrait` 删；新增 split/left/canvas/equipped/right/group(-title/-cells)/cell(--on)/groundbtn(--on)。**纪律**：L3 零查表（目录/名字/分组全 ctx 递现值）、不 import `game/logic/**`、`session.js` 不改、不碰 `game/maprunner/**`。 |

| **PI-g 图标采集 + 右栏分页网格**（design §3.8 改版；PIQ8=B + 人类点名分页） | `tools/fetch-actor-packs.mjs` + `swf/item/equip/icon/`（新镜像件）+ `playerInfoPanel.js` + `ui.css` | **采集**：工具加 `--icons` 模式 = 按 equip-index `slot∈{1..8}`（1735 件、点名清单）拉 `res/item/equip/icon/<id>.swf` ⇒ 落**仓库镜像** `swf/item/equip/icon/`（`item-art.js` 的 `itemSwfUrl` 路由逐字对上）；已存在跳过、404 记「未采集」清单（`map-actor-look §5.5` 图标采集单）。**L3**：右栏从「7 组连续滚动 + 名字牌」改为**组标签行（7 个 tab）+ 当前组分页网格**（每行 6 列 × 6 行 = 36 格/页，翻页条 `‹ 页 x/y ›`；阴影组不分页）；格子 = `makeItemIcon(id, 44, true, '装备')` **Ruffle 真图标**（在册播放器 ≤36 ⇒ 换页/换组整体重建当前页、旧播放器随 DOM 移除）；名字进 `title` 悬浮、现装格 `--on` 不变；**分页/页码 = L3 局部显示态，不进 ctx**（ctx 契约零变化）。**CSS**：`.rb-pif-tabs/-tab(--on)/-grid/-pager` 新增，`.rb-pif-right` 去 overflow 滚动。**纪律**：L3 仍零查表、不 import logic；本批不碰 `mapScene.js`（ctx 不变）。 |

| **PI-h 图标播放时序修复**（人类报障「装备的icon显示不出来」；根因 = `item-art.js` 全仓唯一「先 load 后入 DOM」写法，Ruffle 对 detached 元素忽略 play 且不重试） | `game/app/view/item-art.js`（**仅此一处**） | `makeItemIcon` Ruffle 支：`p.ruffle().load(...)` 挪进 `queueMicrotask` + `p.isConnected` 卫兵（微任务时仍未入 DOM ⇒ 走 `fail()` 兜底、不留挂死播放器），对齐仓内「先 append 后 load」既有序（`battleScene/mapScene/restartFighterStage/idleStage` 同形）。面板/L4/CSS/工具零改动。as-built = **§7.6**，手测 = **§8 #18**。 |

| **PI-i 图标画面源改离线静图**（人类 2026-10-20 点名「装备和坐骑图标应当改为调用相应的 svg 或 png」⇒ design §3.8 **PI-static** 条） | `game/app/view/item-art.js`（**仅此一处**；面板/L4/CSS/工具零改动） | 新增 `itemStaticUrl(resId)` = swf 路由**同路径**换前缀与扩展名（`/swf/…` ⇒ `/png/….png`，`tools/swf2svg.mjs` 产物；路径型 resId 无 swf 源 ⇒ 返回 `null` 不排进静图层）；`makeItemIcon` 从「三级」重写为**四级链**：① 静图 `<img>` → ② Ruffle 播 swf（仅①缺件且 `useRuffle=true`）→ ③ Unity `Resources` PNG → ④ 色块 tile + `assetMissing` 自陈。逐层 = 失败摘掉自己再交棒（`imgStep(url,next,last)` / `swfStep(url,next)`），PI-h 的 `queueMicrotask` + `isConnected` 卫兵在②内**逐字保留**。选 png 不选 svg 的理由见 design §3.8。**副作用**（实测消费面 = `makeItemIcon` 三家）：商店 `shopPanel.js`（3 处，`useRuffle=false`）、道具背包 `restartItemBagView.js`（1 处，同 `false`）、本面板（`iconEl` + 已装配条 22 + 网格 44）一并换源；`panels/battle/itemBoardView.js` **不**经本装载器（零影响）。as-built = **§7.7**，手测 = **§8 #19**。 |

| **PI-j 缺件过滤 + 「颜色」组**（人类 2026-10-21 三条指令：① 官服无包件**不进游戏内**（文档登记缺失）② 表情素材疑似没抓 ③ 12 色**单出换色功能**、不进角色部件表 ⇒ `map-actor-look` **ALQ10=A / ALQ11=A**、design §3.8） | `game/logic/map/actor-look.js` + `game/app/scenes/mapScene.js` + `game/app/view/playerinfo/playerInfoPanel.js` + `game/app/ui.css`（4 处 = 计划 3 件 + 新 class 的样式落点，登记为 **PID16**） | **L1（`actor-look.js`，纯）**：新增导出 **`COLOR_ITEM_IDS`**（`Set`，由既有 `DEFAULT_COLORS:49` 的 `hand/body/foot` 三字段展平 ⇒ 36 个物品 ID，**单一真值、不新抄表**）+ **`packRefOf(item)`** → `{pack, suffix}`（复用 `resourceIdOf:84` + `packSuffixOf:91` ⇒ **不许**在 L4 重拼包名）。**L4（`mapScene.js`）**：`PIF_MANIFEST` 预热并列 `PIF_EQUIP_IDX`（`CONTENT.loadActorManifest()`）；`listCatalog` 三重过滤 = 槽位匹配 → `!COLOR_ITEM_IDS.has(id)` → 该件部件包**已在清单登记**（`manifest.packs[pack]?.files?.[suffix]`）；`PI_GROUPS` 末位加 `{key:'color',label:'颜色',slot:0,color:true}`（照 `ground` 非物品组先例、追加在尾不打乱组序）；`listCatalog`/`getEquippedSummary` 各加 `g.color` 分支；新 ctx 三件 `listColors()` / `getColorMode()` / `onPickColor(n)`（`n` → 既有 `APP.actorLook.color(n)`，**不落盘**，与 `ground` 同口径）。**L3（`playerInfoPanel.js`）**：仿 `active.ground` 分支加 `active.color` = 12 个色块钮 + 色名 + 当前高亮、**不分页**；点击 = `ctx.onPickColor(n)` 后 `render()`；视图**不 import** actor-look（守 PI2）。**边界（人 2026-10-21 拍板）**：只剔**玩家面**；调试入口 `APP.actorLook.equip/ride` 照旧可穿任意 ID、存档里已有的无包件照常画 fallback、**不静默改档**；**图标缺不作剔除条件**（图标仍走 `item-art.js` 四级兜底）。**零 L0/L2 改动** ⇒ 不需 `node tools/build-core.mjs`。as-built = **§7.8**，手测 = **§8 #20**。 |

**素材取图根（双树照抄，不挪树）**：robot = `/projects/Seer2-Restart-Lite-main/Assets/Resources/Prefabs/Player/idle_1/idle_1_0001.png`；nono = `/projects/Seer2-Restart-Lite-main/Assets/Resources/Panels/PlayerInfo/Sprites/Nono.png`；装备/货币图标 = `item-art.js`（`ART_ROOT = …/Resources`，双 resId 路由）。

## 3. 行为规格（对位 design §3）

1. **开/关**：`info` 钮 ⇒ `openRestartPlayerInfo()`；已开 ⇒ `PINFO.update()` 重绘不叠层；✕/遮罩 ⇒ `onClose` 清引用 + `api.close()`；不改 URL、不进历史。
2. **昵称两拍**：显示态 = `getNickname()`（夹具 = `Linux`）+ Edit 钮；第 1 拍 InputField 激活（placeholder = 旧名）+ 名隐藏 + 图标翻 Mark；第 2 拍 空 ⇒ `showHint('昵称不能空白')`（1 键）**且留在编辑态**；非空 ⇒ `setNickname(新名)`（L4 写 `session.data.nickname` + **同步 `session.state.trainer.name`**）+ `onSave()` + 翻回显示态。
3. **称号下拉**：选项 = 「无」+ `listAchievements()`（夹具档包内**无**称号族 ⇒ 仅「无」）；回填 = 当前 `getAchievement()` 在选项里则选中、否则「无」（A1 只动显示）；选定 ⇒ `setAchievement(id|0)` + `onSave()` + 重绘立绘（25 ⇒ 装备图标、23/24 ⇒ nono、机器人态不受称号影响）。
4. **立绘**：`getUseRobot()` true ⇒ robot PNG（高 100）；false 且当前称号 `typeId===25` ⇒ `makeItemIcon(该条 resId)`（高 150）；否则 nono PNG（高 100）；宽按图宽高比等比（`GetResizedWidth` 同形）；缺图 `mountImg` 自陈。
5. **Change**：`setUseRobot(!getUseRobot())` + `onSave()` + 重绘（落盘，重开保持）。
6. **货币**：`makeItemIcon(1/2)` + 活读数（夹具 47000 / 100）；`update()` 重读。
7. **Shoot**：`toggleShoot()` 翻 `session.isShootMode`（**不落盘**）+ 按钮视觉态亮/灭（title = 「射击模式（下次进入地图适用）」）；重开进程回 false（预期）。
8. **Bag**：面板先撤再 `openItemBag()` ⇒ 既有道具背包模态（PIQ1 建议 A）。
9. **Follow / Home**：`showHint('该功能尚未实装，敬请期待！')` / `showHint('当前没有跟随中的精灵或动物哦！')`（A3/A4 同款文案）。
10. **分派兜底**：`handlePanelLink('PlayerInfo')` / NPC `openPanel PlayerInfo` ⇒ 同一面板（现桥零 intent，纯防未来）。
11. **（PI-f）两栏与目录**：面板中部 = 左右两栏；右栏固定 7 组（头部/手部/脚部/腰部/背部/坐骑 = equip-index 全目录按 slot 过滤分组、点了即穿无拥有校验 = PIQ5；阴影 = 两态互斥钮 = PIQ6）；~~slot4/8 不成组不显示~~【**已被后续批次取代**：`PI-j` 加「颜色」组、`PI-k` 加**「表情」组 = 槽 8**（`ALQ12`）⇒ 现 = **9 组标签**，仍不成组的只有 **slot 4 BODY**（其本色由「颜色」组驱动）】。
12. **（PI-f）左栏与预览**：左 = canvas 实时形象（与地图同一 LOOK/动画时钟，蹭 `stepActorAnim` 补帧、零新增 rAF）+ 已装配 7 格条（图标+名+卸下；坐骑格卸下=下马、阴影格显示当前态无卸下）。三态立绘与 Change 钮退役（PIQ7），称号下拉选定不再驱动形象。
13. **（PI-f）写链**：点格/卸下/切态 ⇒ L4 路由 `APP.actorLook.*`（穿/卸/骑/下马自带 `syncLook`+地图重绘+`persistLook` 落 `<equip>`；阴影只改会话态**不落盘**，重开回阴影）⇒ `PINFO.update()` 重建两栏 + 预览即刻补画一帧。
14. **（PI-g）右栏分页网格**：组标签 **8 个**（头/手/脚/腰/背/坐骑/阴影/**颜色**；**PI-j 起**），一次一组；网格每页 36 格、翻页条上下页 + 「页 x/y」；格 = **真图标**（**PI-i 起画面源 = 离线静图 `/png/…` 优先，缺件才 Ruffle 播 swf**；两级都缺 ⇒ 退色块 + `assetMissing` 自陈、名字 title 悬浮）；换页/换组 = 只挂当前页（静图齐时**在册播放器 = 0**，最坏情况仍 ≤36）；分页态在 L3、`update()` 重绘保持当前组与页。**阴影组与颜色组不分页**。
15. **（PI-g）图标采集**：`node tools/fetch-actor-packs.mjs --icons` 按采集单（slot 1–8 共 1735 件）拉 `res/item/equip/icon/<id>.swf` ⇒ `swf/item/equip/icon/`；404 逐件登记未采集、不伪造。
16. **（PI-j）目录只列「有包件」**：右栏六件物组各先按槽筛，再剔两类 —— ① **12 色颜色件**（`COLOR_ITEM_IDS`，指令③）② **官服无部件包**（`manifest.packs[pack].files[suffix]` 未登记，指令①）。实测条数（头 347 / 手 375 / 坐骑 95 / 腰 305 / 脚 304 / 背 240，六组合计 **1701 → 1666**）落 design §3.8；缺件实名表 = `docs/map/map-actor-look.md §5.7`。清单未就绪 ⇒ 该组出空、走既有 `items:[]` 提示支不崩。
17. **（PI-j）「颜色」组**：组标签末位 = 12 个色块钮（色名 + 当前高亮、不分页）；点 = `ctx.onPickColor(n)` → 既有 `APP.actorLook.color(n)`，预览与地图即时换色、重开面板/进图仍生效；**不落盘**（`<equip>` 不含颜色，与 `ground` 同口径）。左栏已装配条对应格 = 色名、**无「卸下」钮**。
18. **（PI-j）边界**：屏蔽**只作用于玩家面目录**；调试入口 `APP.actorLook.equip/ride(任意ID)` 照旧可穿（画 fallback + 一行缺包日志）、存档里已有的无包件**不静默改档**；**图标缺不作剔除条件**（图标仍走 `item-art.js` 四级兜底）。

**纪律核对**：视图件不 import `game/logic/**`（`grep "from '..*logic/" game/app/view/` 零命中，实测于 §7）；面板零算数、零查表；`session.js` **一行不改**（三字段读写全在 `mapScene.js` 闭包，同 `soulSet` 口径）；`#rv` DOM 层 ⇒ SWF/JS 两路画面逐字节不变（PI1）；写盘点只有昵称第 2 拍非空 / 下拉选定 / Change 三处，全经 `onSave()`。

## 4. 不做清单（防"顺手实现"）

Item Bag 含货币子层（PIQ1 建议 A 不造）；点玩家第二入口（A15）；地图头顶名/称号文本订阅（无消费面，只同步 `state.trainer.name`）；鼠标光标 Aim / `mapId==990` 清 seed（A7）；YiTe `itemBag` 换袋（A9）；`IInputField` 死桥（A14）；预制借用 sprite（A12）；三张统计 PNG（A6）；`ACT_UNBUILT` 加 `PlayerInfo`（它不是未建）；unmount 行补 SHOP/SPT_PANEL（既有遗漏、防顺手实现）；`session.js` 新桥/新导出。

## 5. 数据验证（构建期，非验收）

无新生成物（`items.json` 既有；称号 18 条 / 货币图标 18/18+2/2 在盘 = 报告 §3 已实测）。落码后静态自检口径：新/改 `.js` 过 `node --input-type=module --check`；分层 grep 门禁 `from '..*logic/` 在 `game/app/view/playerinfo/` 零命中；新文件仅相对 import（无新裸依赖 ⇒ `game/index.html` import map 不需增项）。

## 6. 手测前置

无新裸依赖 ⇒ import map 不动；无新生成物；前置 = 真机夹具档（`#/map?slot=0&map=100` 任意图）。

## 7. as-built（PI-a…PI-k · 2026-10-20 / 10-21 落码）

> PIQ1–4 全 A（人类 2026-10-20 拍板）；PIQ5–7 同拍板（A/A/A）；**PIQ8 = B（图标纳入采集单 + 右栏真图标 + 分页网格，人类同日点名）**。逐批复述 + 静态自检数字 + 偏差 **PID1–PID13**（本份局部编号，非人类决议 ①–⑨）。

### 7.1 逐批 as-built

- **PI-a 面板视图** `game/app/view/playerinfo/playerInfoPanel.js`（新，201 行）：`buildPlayerInfoPanel(ctx)` → `{ update }`；scrim 点关 + ✕（`activityPanel.js` 范本）；昵称两拍（名字文本 ⇄ `<input>`、placeholder = 旧名、Edit/Mark 图标钮、第 2 拍空 ⇒ `ctx.showHint` 且不退出编辑）；称号下拉 = 原生 `<select>`（「无」+ `ctx.listAchievements()`，回填查无 = 选「无」只动显示 = A1）；立绘三态（robot PNG 高 100 / 装备 `makeItemIcon(resId)` 高 150 / nono PNG 高 100，宽等比内联写死、缺图 `dataset.assetMissing` 自陈）；货币行（`makeItemIcon(1/2)` + 活读数）；五钮全发信号。只 import `../panels/battle/_kit.js` + `../item-art.js`（**连 `content` 都不 import** = PI2）。
- **PI-b 装配口** `game/app/view/playerinfo/index.js`（新，9 行）：`create(container, ctx)` → `{ update, destroy }`（同 `activity/index.js` 形）。
- **PI-c 样式** `game/app/ui.css` `rb-pif-*` 族（`:708-735` 块，`rb-act-go--off` 后、演出期锁注释前）：480 宽居中框、名字行/下拉/立绘格/货币行/五钮/编辑态。
- **PI-d L4 装配** `game/app/scenes/mapScene.js`：① `:43` import `PINFO_VIEW`；② `:201` 单例行加 `PINFO = null`；③ `:268` handlers 袋加 `onInfo: openRestartPlayerInfo`；④ `:512-552` 新 `PIF_TYPES` 常量 + `openRestartPlayerInfo()`（ctx 读写全闭包：三字段读写 + `setNickname` 同步 `session.state.trainer.name` + `onSave = A.save(); refreshHud()` + `toggleShoot` 不 save + `onOpenItemBag` 先撤再开）；⑤ `:491` 分派器加 `PlayerInfo` 行（`GuideLine` 行后、`ACT_UNBUILT` 判前；名单不加）；⑥ `:1336` NPC openPanel sink 加 `/PlayerInfo/` 行（兜底前）；⑦ `:2011` unmount 行加 `PINFO = null`。
- **PI-e HUD 接线** `game/app/view/hud/restartHudView.js` `:80`：`info` 行加 `handler: 'onInfo'`（box/图标/label 不动；title 自动变 tip「信息」= `:220` 规则）。

### 7.2 静态自检数字

- `node --input-type=module --check`：`playerInfoPanel.js` / `index.js` / `mapScene.js` / `restartHudView.js` **4/4 过**。
- 分层门禁：`grep "from '.*logic/" game/app/view/playerinfo/` = **零命中**（L3 不 import `game/logic/**`）。
- 无新裸依赖（新文件仅相对 import）⇒ `game/index.html` import map **零增项**。
- `session.js` **一行未改**（三字段读写全在 `mapScene.js` 闭包，同 `soulSet` 口径）。
- 落盘点只有三处（昵称第 2 拍非空 / 下拉选定 / Change 翻转），全经 `onSave()`；Shoot 翻转**不落盘**（PIQ3）。

### 7.3 偏差登记（PID1–PID6 · 相对 design/impl 计划，均非行为偏离真值）

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID1** | box 高 = **内容自适应**（`height:auto; min-height:320px`），非 design 字面"480×320 固定高" | 固定 320 放不下 150 立绘框 + 五行（实际 ≈365）⇒ 会裁掉底部按钮行；内容自适应 = 默认态 ≈320、立绘框恒 150（box 不随 Change 跳高）。框宽 480 不变、视觉同构。 |
| **PID2** | 立绘 img 高/宽**内联**写死（`fitImg` 设 `style.height/width`），不用 CSS class 定高 | 避免 class 高度与内联等比宽打架；框 `.rb-pif-portrait` 仍 `height:150; align-items:flex-end`（脚踩底）。 |
| **PID3** | 空位用自有类 **`rb-pif-spacer`**（`flex:1`），不复用 `rbh-spacer` | `rbh-spacer` 全仓**只有使用、无 CSS 定义**（shop/activity/itembag/petbag 四既有面板也在用 = 同为 no-op 空盒）；本面板自给一类不碰既有面板。 |
| **PID4** | `iconEl` 宽度**不另算**（`makeItemIcon` 内部已建 `size×size` 方块 tile + `object-fit:contain`） | 初版在宿主上再算一次等比宽会与内部 tile 打架；保留 item-art 自带方块 tile（同 shop 惯例），只给等高宿主。 |
| **PID5** | `state.trainer.name` 同步的**可见消费面**比 design 描述窄：DOM HUD **不显示**训练家名（`SAVE.name` 仅 `initSession` 时读一次喂 SWF `hudProfile`；`#/rbattle` 战斗左名不消费此字段，消费它的是搁置的 AS3 `#/battle` 线） | 同步仍照做（PIQ4 = A，一行、无害、为搁置/未来消费面）；**本批"改名同步"的可见验收 = 重开后面板名字保持新名**（`session.data.nickname` 落盘），详见 §8 #3 订正。 |
| **PID6** | 视图 `fitImg` 缺图自陈用 `dataset.assetMissing`（自定义），未走 `mountImg` | `mountImg` 口径是 Ruffle/PNG 双路；本面板立绘是纯 PNG 双树直引，`img.onerror` 自陈更直接（同铁律 5：缺件自陈、不静默换图）。 |

### 7.4 批 PI-f as-built（PI-equip 两栏改造 · 2026-10-20 落码，PIQ5–7 全 A）

**逐处复述**：

- **L3** `game/app/view/playerinfo/playerInfoPanel.js`（重写，220 行）：`box.append(head, nameRow, achRow, **split**, coinRow, btnRow)`；`split` = 左 `rb-pif-left`（`<canvas class="rb-pif-canvas">` + `rb-pif-equipped` 已装条：每组一格 标签+名+「卸下」钮 → `ctx.onUnequipSlot(slot)` 并乐观 `render()`）+ 右 `rb-pif-right`（滚动，`ctx.listCatalog()` 逐组建 `rb-pif-group`；普通组格 = **名字牌** `rb-pif-cell`（当前装配加 `--on`）点击 → `ctx.onPickEquip(id, slot)`；阴影组 = `GROUND_MODES` 两颗互斥钮 `rb-pif-groundbtn`（`--on` 读 `ctx.getGroundMode()`）→ `ctx.onPickGround(mode)`）。构建时 `ctx.setPreviewCanvas(canvas)` 把画布交 L4。零查表零算数不变（组名/slot/目录/现值全由 ctx 递现值，PI2）；`makeItemIcon` 只剩货币行两处。
- **L4** `game/app/scenes/mapScene.js`：① `:551` 模块常量 `PI_GROUPS`（7 组：head1/hands2/feet6/waist5/back7/mount3/ground 哨兵 slot0）+ `PIF_EQUIP_IDX`/`PI_PREVIEW`/`PI_PREVIEW_SCALE=2`；② `openRestartPlayerInfo`（`:570–`）内新闭包族：`loadEquipIndex()` 预热（resolve 后 `PINFO.update()` 补渲染，预热前 `listCatalog` 出空组不崩）、`listCatalog`（按 `items[id].slot` 分组升序）、`equippedIdOfSlot`（slot3 读 `session.mountEquipId`，余查 `session.equipVec` 反查目录 slot）、`getEquippedSummary`（7 格现值，阴影格名 = 光轮/阴影）、`refreshPanel`（`PINFO.update()` + `renderPreviewTo` 立即一帧）、`pifAct`（actorLook promise resolve 后才 refresh，不抢跑）、`onPickEquip`（slot3 → ride/unride 二选一；余 → 同 id 卸下、异 id 穿/替换）、`onUnequipSlot`、`onPickGround`（`APP.actorLook.ground`，只改会话态不落盘 = PIQ6）、`setPreviewCanvas`（登记 + 立即一帧 + `syncLook()` 就绪后补帧）；③ ctx 键增删：加上述七项，**删** `getUseRobot`/`setUseRobot`/`onToggleRobot`（PIQ7，见 PID8）；④ `onClose` 与 `onOpenItemBag` 均先 `PI_PREVIEW = null`；⑤ `stepActorAnim` tick 变化块（`:2061`）：画完地图 `draw()` 后 `if (PI_PREVIEW) renderPreviewTo(PI_PREVIEW)`（**蹭既有 24fps 单 rAF，零新增循环**）；⑥ `drawActor` 之后新函数 `renderPreviewTo`（`:2152`：dpr=2 backing store、`clearRect`、`drawActor(c, w/2, h-26, 2)`，`canDrawActor()` 假或画失败 ⇒ 画占位文案「形象未就绪」）；⑦ `unmount`（`:2658`）加 `PI_PREVIEW = null`。
- **CSS** `game/app/ui.css` `.rb-pif-*` 块重写：box 480→**640 宽、left 240→160、top 104→64**；新增 `rb-pif-split`（270px 定高 flex row）/`-left`（236px）/`-canvas`（200×190）/`-equipped/-eqcell/-eqslot/-eqname/-eqoff`/`-right`（overflow-y:auto）/`-group/-grouptitle/-groupcells/-grouphint`/`-cell`（名字牌 56–96px 省略号）/`-cell--on`/`-groundbtn(--on)`；**删** `.rb-pif-portrait`/`.rb-pif-portrait-img`（三态退役）。总高 ≈ 464 ≤ 540 逻辑画布，HUD 顶栏仍可读。

**静态自检（PI-f）**：`node --input-type=module --check` 过 `playerInfoPanel.js` + `mapScene.js`；`grep "from '.*logic/" game/app/view/playerinfo/` 零命中；`git diff --check`（本批文件范围）干净；`session.js` 仍一行未改；不碰 `game/maprunner/**`（无需重编译）。

**PI-f 偏差登记（PID7–PID10 · 均非行为偏离真值）**：

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID7** | 右栏格子 = **名字牌**（文字 chip），非计划字面的图标格（`makeItemIcon(id,_,false,'装备')`） | 落码前核查：装备图标素材**盘上任何格式都不存在**（SWF 镜像 `swf/item/` 下只有 collection/emblem/icon(仅 1.swf)/medal/pet；Unity `Resources/Items/` 302 个文件全是 1xxxx 货币/道具 id；全仓 find 装备 id 如 100577/101020 = 0 命中）⇒ 图标格会发起上千次注定失败的请求、还伪造画面。名字牌为正路；素材采集到位后换 `makeItemIcon` 即自动升级、不动逻辑（design §3.8 已登记）。**【已被 PI-g 兑现换代：服务器实测有图标 ⇒ 采集单已拉齐 ⇒ 格子换 Ruffle 真图标，见 §7.5】** |
| **PID8** | 旧立绘三态退役的处置比计划字面「按钮退役」更彻底：`useRobotAsPlayer` 的 **L4 读写闭包（getUseRobot/setUseRobot/onToggleRobot）与 ctx 键全删**，非留空引用 | 全仓 grep 证明该字段唯一消费者就是这块立绘；按「确定无用即整体删除」纪律收掉。**存档字段本身不动**（schema/codec 仍原样 round-trip `useRobotAsPlayer`，重开档不丢）。 |
| **PID9** | 预览几何参数 = **人眼校常量**：`PI_PREVIEW_SCALE=2`、脚基线 `h-26`、canvas 200×190 | 与 `ACTOR_SCALE`/`LOOK_SCALE`/`LOOK_DY` 同族（§4.10 人眼校口径）；初值按 100px 角色 ×2 估，手测 §8.11 若偏大偏小只改这三个数。 |
| **PID10** | 全目录渲染（PIQ5=A）意味着手部组一次建 **391** 个 cell、七组合计 ≈1690 个 DOM 节点，无虚拟滚动 | 面板打开时一次性建、`update()` 全量重建（现状规模可接受）；若手测感到开板卡顿，后续批可做「组内折叠/分页」——**不阻塞本批**，登记为观察项。**【已由 PI-g「组标签 + 每页 36」分页钉死，见 §7.5】** |

### 7.5 批 PI-g as-built（右栏分页网格 + Ruffle 真图标 · 2026-10-20 落码，PIQ8=B）

**逐处复述**（本批**只动 L3 + CSS + 工具**：`mapScene.js` 闭包与 ctx 契约**零改动** = 分页/页码是纯显示态住 L3，design §3.8）：

- **图标采集** `tools/fetch-actor-packs.mjs --icons`：按采集单（equip-index slot 1–8 = **1735 件**）拉 `res/item/equip/icon/<id>.swf` → 仓库镜像 `swf/item/equip/icon/`（与 `item-art.js:32 itemSwfUrl` 路由逐字对上 ⇒ **运行时零管道改动**；**PI-i 起该路由还派生出静图路径 `itemStaticUrl`**）。**结果 = 落仓 1687 / 未采集 48**（404，含默认色身体 100001–100008 等；逐件登记 `game/data/actor/equip/icon-missing.json`，不伪造）。校验 = FWS/CWS/ZWS magic；串行 + 120ms 间隔 + 有界名单（定向拉取政策 = `docs/map/map-actor-look.md §5.5` 通道一，人类 2026-10-20 拍板 B）。
- **L3** `game/app/view/playerinfo/playerInfoPanel.js`（245 行）：右栏从「7 组连续滚动名字牌」改「**标签行 + 当前页网格 + 翻页条**」——① `tabsRow rb-pif-tabs`（7 标签，`--on` = 当前组；点标签 ⇒ `st.group` 换 + `st.page=0`）；② `bodyBox rb-pif-rbody`（普通组 = `rb-pif-grid` **6 列 × 36 格/页**，格 = `makeItemIcon(id, 44, true, '装备')` **Ruffle 真图标**、名进 `title` 悬浮、当前装配 `--on`、点击仍 `ctx.onPickEquip`；阴影组 = 原两颗互斥钮不分页）；③ `pager rb-pif-pager`（`‹ 页 x/y ›`，越界钮 `--off`）。显示态 `st = {group, page, pages, built, cellRefs}`；**`update()` 保持当前组与页**；换组/换页/目录到位 = 整页重建（旧 ≤36 播放器随 DOM 移除），**穿/卸只翻 `--on` 高亮不重建**（签名缓存 `st.built`，见 PID11）；左栏已装配条加 `makeItemIcon(itemId, 22, true, '装备')` 小图标（见 PID12）。目录未预热 = 空组提示文案不变。
- **CSS** `game/app/ui.css` `.rb-pif-*` 段：`.rb-pif-right` 去整栏滚动；新 `rb-pif-tabs/-tab(--on)`、`rb-pif-rbody`（唯一滚动位）、`rb-pif-grid`（`repeat(6, 48px)`）、`rb-pif-pager/-pagebtn(--off)/-pageinfo`；`.rb-pif-cell` 从名字牌改 **48×48 图标格**（`--on` 去底色只留描边光，图标不被高亮块盖死）；`.rb-pif-group/-grouptitle` 随 PI-f 旧结构删除。Ruffle 库 `index.html:80` 全局加载 ⇒ JS/SWF 两路地图上图标都可播。

**静态自检（PI-g）**：`node --input-type=module --check` 过 `playerInfoPanel.js`（mapScene.js 本批未动）；`grep "from '.*logic/" game/app/view/playerinfo/` 零命中；`git diff --check`（本批文件范围）干净；`session.js`/`mapScene.js` 零改动；不碰 `game/maprunner/**`；未新增测试/探针脚本（`--icons` = 人类点名 B 的采集工具，非验收脚本）。

**PI-g 偏差登记（PID11–PID12 · 均非行为偏离真值）**：

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID11** | 计划字面「换页/换组 = 重建当前页」之外，**穿/卸动作也走 `update()` 全量 render** ⇒ 若照字面重建，每点一件就把 36 个 Ruffle 播放器全部拆掉重载（闪白 + 重拉 36 个 swf） | 加当前页签名缓存 `st.built`（组 key + 页 + 目录长度 + 首件 id）：签名未变 ⇒ 只按新装配态翻 `--on` 高亮，格子与播放器**原地不动**；签名变了（换组/换页/目录预热到位）才整页重建。显示态仍在 L3，ctx 契约不破。 |
| **PID12** | design §3.8 字面「在册 Ruffle 播放器 ≤36」指**网格**；手测项 #16 要求左栏已装配条也带小图标 ⇒ 实际在册上限 = 网格 36 + 已装配条 ≤7 ≈ **43** | 已装配条每件恒 ≤1（7 组各一格），量级仍被钉死、不构成风险；如实登记口径差（不是「滚动列表挂上千」的老问题）。 |

### 7.6 批 PI-h as-built（图标「彩色色块」根因修复 · 2026-10-20，人类报障「装备的icon显示不出来」）

- **人证三连（人类浏览器观察回报）**：① 格子 = **彩色色块**（tile 底色露出）；② console 红警告 **`Ignoring attempt to play a disconnected or suspended Ruffle element`**；③ `document.querySelectorAll('.rb-pif-cell ruffle-player').length = 36`（播放器**装了**）且首格 `.rb-shop-ico` 的 `dataset.assetMissing = undefined`（**没走**兜底链）。⇒ 症状 = 「播放器在场但永不播放」，不是 404、不是缺素材。
- **静态排除（本会话逐一核）**：图标文件在仓（1687 件）、`serve.mjs` 对该 URL 实测 **200 且字节与仓库一致**（`Content-Type: application/x-shockwave-flash`）；`itemSwfUrl` 路由逐字命中（装备 id 不在 `unity/items.json` ⇒ 走路由兜底 = 设计内）；文件本身 = **合法 AS3 CWS SWF**（逐标签走流通：FileAttributes(AS3 旗标 `0x08`) → 美术（DefineFont3 字形 + DefineText + 2×DefineSprite + PlaceObject2）→ DoABC2(280B, 类 `item`) → SymbolClass → ShowFrame → **End 恰落文件尾**）；骨架与**已确认能播**的 `mapRunner.swf` 同款（Metadata/SymbolClass 等锚点逐一对上）⇒ 格式嫌疑排除。（⚠️ 过程教训：SWF 标签码 = **高 10 位是 tag id、低 6 位是长度（63=u32 转义）**，首轮按反的位段解读曾把一切看成乱码——纠正后四文件全部严丝合缝。）
- **根因（代码对照）**：`game/app/view/item-art.js` 的 Ruffle 支是**全仓唯一「先 `p.ruffle().load()`、后（由调用方）入 DOM」**的写法（旧 :83–84）；仓内其余播放器全部是「先 append 后 load」模式（`battleScene.js:80→:83`、`:547→:548`、`mapScene.js:1695`、`restartFighterStage.js:404→:405`、`idleStage.js:75`）。Ruffle 对 load 时未连接的元素直接忽略 play 且**不重试** ⇒ 36 个挂死播放器盖在 tile 上 = 人类看到的「彩色色块 + assetMissing 无痕」。PI-g 是该 Ruffle=true 路径的**第一个消费者**，所以这潜伏 bug 首次引爆。
- **修复（只动共享 helper 一处，L3，零契约变化）**：`makeItemIcon` 把 `load()` 挪进 `queueMicrotask`，并加 `p.isConnected` 卫兵（微任务时仍未入 DOM = 视同装载失败走 `fail()`→PNG→tile 兜底，不留挂死播放器）。`openPanel` 是**先 `host.append(el)` 后 `build()`**（`panels/host.js:69→72`）⇒ 面板内所有格子的 wrap 在同一个同步批次尾部必已连接 ⇒ 让出一个微任务即命中「先入 DOM、再 load」的既有序。Ruffle 支其余参数（wmode/scale/autoplay）逐字不变。
- **门禁**：`node --input-type=module --check` 过 `item-art.js`；`git diff --check` 干净；本批**只动** `game/app/view/item-art.js`（面板/L4/CSS/采集工具零改动）；不碰 `game/maprunner/**`；未新增测试/探针脚本（决议⑦，诊断经人类三点观察完成）。
- **结账**：手测 = §8 **#18 ✅（人类 2026-10-20「很好，ok了」）** ⇒ PI-g 欠的「真图标」最后一格补齐。

**⇒ 请人测 = §8「PI-h 追加（#18）」。**

### 7.7 批 PI-i as-built（图标画面源 = 离线静图优先 · 2026-10-20 落码，人类点名 PI-static）

**逐处复述（只动共享 helper 一处 + 面板注释，零契约变化）**：

- **L3** `game/app/view/item-art.js`：① 新增导出 `itemStaticUrl(resId)` = 取 `itemSwfUrl(resId)` 后**同路径**换前缀与扩展名（`/swf/…` ⇒ `/png/….png`）；两种情形返回 `null` 不排进静图层：路径型 resId（无 swf 源 ⇒ 必然无镜像）、`itemSwfUrl` 不落在 `/swf/` 下。② `makeItemIcon` 从「三级 if/else」重写为**四级链**：拆出 `imgStep(url, next, last)`（`<img>` 支：`error` 时摘掉自己、`last` 才写 `dataset.assetMissing`，再 `next()` 交棒）与 `swfStep(url, next)`（Ruffle 支，**PI-h 的 `queueMicrotask` + `p.isConnected` 卫兵逐字保留**）；`steps[]` 按 ①静图 → ②Ruffle（`canRuffle` = `useRuffle && 纯数字 && window.RufflePlayer?.newest`）→ ③Unity PNG（末层）装配，`run(k)` 递归交棒。③ 文件头注释由「三级」改写为「四级」并列产物出处。
- **L3** `game/app/view/playerinfo/playerInfoPanel.js`：**只有注释**改动（`:11`/`:16–19` 说明静图优先链、`:25` 三级→四级）；调用点字面不变（`makeItemIcon(g.itemId, 22, true, '装备')` / `makeItemIcon(it.id, 44, true, '装备')`）⇒ 换源发生在 helper 内，面板零逻辑改动。
- **路由实测（装备 id）**：装备 id 不在 `unity/items.json` ⇒ `itemSwfUrl` 走 `ICON_BASES` 路由 = `/swf/item/equip/icon/<id>.swf` ⇒ `itemStaticUrl` = `/png/item/equip/icon/<id>.png`；dev server 上该 URL 实测 **200 / `image/png` / 10980 B**（基准件 `100206`）。镜像覆盖 = **1687 / 1687**（`swf/item/equip/icon` ⇄ `png` ⇄ `svg` 三树逐一对齐；`png/` 25M、`svg/` 62M）。
- **在册播放器口径变化**：静图命中的格子**不创建 Ruffle 播放器** ⇒ 网格 + 已装配条的在册数从 PI-g 的 ≤36（+≤7，PID12）**实际降到 0**，只有缺件格才挂；分页仍是"最坏情况"的钉死手段。
- **`useRuffle=false` 两家消费者**（商店 3 处 / 道具背包 1 处）：**静图层不受该参数影响** ⇒ 它们此前注定落色块的装备 id（Unity `Resources/Items/` 里没有 10xxxx 段）现在能出图 = 只可能变好；`panels/battle/itemBoardView.js` 不经本装载器（实测零引用）。
- **`png/item/icon/` 的 302 条不是产物** = 2026-10-19 建、**已入库**的软链（指向 `Resources/Items/`）；`.gitignore` 逐层例外放行，`tools/swf2svg.mjs` 侧加「软链拒写」卫兵防覆盖原图。
- **门禁（静态自检，不替代手测）**：ESM 语法 = `cp <file> /tmp/check-*.mjs && node --check` 过 `item-art.js` 与 `playerInfoPanel.js`（仓 `package.json` `type=commonjs`，浏览器 ESM 只能经 `.mjs` 副本检）；空白 = 本批两文件 `grep -P '[ \t]+$'` 零命中（两文件在 git 里仍是**未跟踪新增** ⇒ `git diff --check` 对它们无输出；仓内既有空白告警 = `view-scene-battle-*.md`、`game/core/battle/views.js`，与本批无关、不顺手改）；分层 = `item-art.js` 仍只 import `_kit.js` + `content.js`（**零 `game/logic/**`**，arch-code 规则 3 例外内）；本批**未新增**测试/探针/截图脚本（决议 ⑦）；不碰 `game/maprunner/**`、不碰 L4 `mapScene.js`、无新生成物。

**PI-i 偏差登记（PID13 · 非行为偏离真值）**：

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID13** | 静图产物**不入库**（人类 2026-10-20 拍板「3662 个产物不要入库」，`.gitignore:51-55`）⇒ 换机 / 新克隆没有 `png/` ⇒ ① 层必然 404，图标**自动落回 ② Ruffle 播 swf**（PI-h 时序已修） | 与 PI-static 的设计口径一致（design §3.8：兜底链是"产物可丢、重跑即可"的前提）。**后果如实登记 = 同一件在两种机器上画面可能不同**：静图缺外发光/`clipDepth` 掩膜（136 + 129 个文件，人类拍板「都不补」），Ruffle 路有 ⇒ 比对图标时先确认本机跑没跑 `node tools/swf2svg.mjs swf/item swf/pet/icon swf/nono --out=svg --png=2`。 |

**⇒ 请人测 = §8「PI-i 追加（#19）」** —— ✅ **追认通过**（2026-10-21；**间接证据**：人未逐条复述 ①–⑦，但其后三轮反馈均建立在"看得见格子图标"之上；登记见文末）。

### 7.8 批 PI-j as-built（缺件过滤 + 「颜色」组 · 2026-10-21 落码，人类三条指令 ⇒ `ALQ10=A / ALQ11=A`）

**逐处复述（3 个代码文件 + 1 份 CSS；零 L0/L2 改动 ⇒ 不需 `node tools/build-core.mjs`）**：

- **L1** `game/logic/map/actor-look.js`：① `:66` 新导出 **`COLOR_ITEM_IDS`** = `new Set(DEFAULT_COLORS.flatMap(c => [c.hand, c.body, c.foot]))` ⇒ **36** 件（实测 `size=36`；`100004` 蓝手 = `true`、`100001` 默认头 = `false`，头/眼 12 色共用、本就不是颜色件）。**由 `DEFAULT_COLORS` 展平 = 单一真值，没有第二张表**。② `:104` 新导出 **`packRefOf(item)`** → `{pack, suffix}`：`pack = resourceIdOf(item.suit, item.slot)`、`suffix = packSuffixOf({slot, isAccessory: slot ∈ MIRROR_TO})`（镜像槽 `_1`、基准 2/6/3 主件 `_0`、其余 `''`）。实测：`{suit:570,slot:3}` ⇒ **`157003_0`**（正是官服 404 那只坐骑的包）、`{suit:364,slot:3}` ⇒ `136403_0`（对照件，200）、`{suit:203,slot:1}` ⇒ `120301''`。**L4 零重拼包名**。
- **L4** `game/app/scenes/mapScene.js`：① `:560` `PI_GROUPS` 末位追加 `{key:'color', label:'颜色', slot:0, color:true}`（照 `ground` 非物品组先例，**追加在尾 ⇒ 既有组序不动**）；② `:563` + `:583` 新 `PIF_MANIFEST` 模块变量 + 与 `PIF_EQUIP_IDX` **并列预热**（`CONTENT.loadActorManifest().then(...)`，`PINFO` 在册则 `update()` 重绘）；③ `:588-600` `listCatalog` 改**三重筛**（顺序 = 槽位 → `!COLOR_ITEM_IDS.has(id)` → `PIF_MANIFEST.packs[pack]?.files?.[suffix]` 已登记）；④ `:590` 每组另带只读 `assetReady`（清单未就绪 / 取回空 `{packs:{}}` 时区分空提示，见 **PID15**）；⑤ `:606-607` + `:611` 新 `getColorMode()`（口径 = `buildLookPlan` 的 `session.actorColor ?? currentActorColor()`，非法索引 ⇒ 0 蓝兜底）/ `listColors()`（12 条 `{n,name}`）/ `getEquippedSummary` 的 `g.color` 支（`itemId:0`、name = 当前色名）；⑥ `:626` `onPickColor(n)` = `pifAct(APP.actorLook.color(n))`（`color()` 内**不调 `persistLook`** ⇒ **不落 `<equip>`**）；⑦ `:657-659` ctx 三件挂上（`listColors / getColorMode / onPickColor`）。
- **L3** `game/app/view/playerinfo/playerInfoPanel.js`：`:203-218` 新 `active.color` 分支（**紧挨 `active.ground`、形状照抄**：不分页、`pager` 隐藏、点 = `ctx.onPickColor(c.n)` 后 `renderEquip()`、当前索引高亮）；`:27-30` 视图本地 `COLOR_SWATCH`（12 条 色名→CSS 色值，**只当瓦片底色**，见 **PID14**）；`:235` 空组提示分两支。视图**不 import** `game/logic/**`（PI2 不破：12 色表 / 索引 / 缺件判据全在 L4，视图只收 `{n,name}` 现值）。
- **CSS** `game/app/ui.css` `:764-768`：`.rb-pif-colorbtn(-hover/--on)` + `.rb-pif-colorchip`（14px 方块、底色吃 `var(--pif-color)`）+ `.rb-pif-colorname`，配色逐字沿用同族 `.rb-pif-groundbtn`（深蓝底 + 亮蓝高亮）。

**过滤效果实测（数据口径核对，非验收）**：equip-index 六组 before → after = **头 347→347 / 手 391→375 / 脚 317→304 / 腰 305→305 / 背 245→240 / 坐骑 96→95 ⇒ 合计 1701→1666（−35 = 24 件颜色手脚 + 11 件无包）**，与 design §3.8 预算**逐组对上**。剔掉的实名 = 手 100233/100253/100254/101740、坐骑 101737、脚 100770、背 100337/101191/101335/101493/101537（对照表 = `docs/map/map-actor-look.md §5.7`）；12 色手脚件不再出现在任何部件组。

**门禁（静态自检，不替代手测）**：`node --input-type=module --check` = `actor-look.js` / `mapScene.js` / `playerInfoPanel.js` **3/3 过**；分层 = `grep "from '.*logic/" game/app/view/playerinfo/` **零命中**；空白 = 三个改动文件 `grep -P '[ \t]+$'` 零命中 + `git diff --check` 无输出；无新裸依赖（零新增 import）⇒ `game/index.html` import map **零增项**；`session.js` **一行未改**；本批**未新增**测试/探针脚本（决议 ⑦）；不碰 `game/maprunner/**`、无 `game/core/**` 改动 ⇒ 无重生成物。

**PI-j 偏差登记（PID14–PID16 · 均为显示层 / 落点面，不改真值判定）**：

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID14** | 计划写「12 个**色块**钮」⇒ 落码 = **色名钮 + 一小块底色瓦片**，色值来自视图本地 `COLOR_SWATCH`（12 条 名→CSS 色） | 仓内**没有** 12 色的色值真值（`DEFAULT_COLORS` 只有中文名 + 物品 ID；`#avSel` 只有「小赛尔·蓝/·红」两项文字），要画"真色"得从包体像素取色（本批不做、也不伪造）。该表**纯装饰**：不参与任何判定、不进 ctx、未知色名退中性灰 ⇒ 真画面仍以左栏 canvas 预览 + 地图角色为准（手测 #20 ④） |
| **PID15** | ctx 契约另多一个**只读字段** `assetReady`（计划未列） | 落地点 = 计划 Context 自己要求的「清单未就绪 ⇒ 目录退化成空列表，需在空提示里区分」。实现为组对象上的布尔字段（**不新增 ctx 函数**），视图只在 `items.length===0` 时读它换文案 ⇒ 契约面最小扩张（design §4 表已同步该字段） |
| **PID16** | 计划列 3 个代码文件 ⇒ 实到 **4 个**（多 `game/app/ui.css`） | 新 class（`rb-pif-colorbtn/--on/-chip/-name`）必须有样式落点，同族先例 = PI-g/PI-f 都在 `ui.css` 追加 `rb-pif-*`；**未新增文件**、未碰其它样式族 |

**⇒ 请人测 = §8「PI-j 追加（#20）」** —— ✅ **手测通过（2026-10-21，人类「ok, done good」）**，与同盘面 PI-k 一揽子确认（回报见文末 #21 之后）。

### 7.9 批 PI-k as-built（「表情」组 + `suit=0` 空件不列 + 裁帧图标 · 2026-10-21 落码，人类四条反馈 ⇒ `ALQ12` / `ALQ13` / `ALQ14`）

**逐处复述（2 个代码文件 + 1 个新工具；L3 视图与 CSS 零改动；零 L0/L2 ⇒ 不需 `node tools/build-core.mjs`）**：

- **L1** `game/logic/map/actor-look.js` `:75`：新导出 **`isEmptySuitItem(item)`** = `Math.trunc(Number(item?.suit)||0) === 0`（上游把"这一槽没穿东西"也做成物品 ⇒ `suit=0` 三件：默认头顶 `100001` / 透明替身 `100002` / 默认眼睛 `100003`；包名走 `resourceIdOf(0,slot)` 落回仓库裸装）。判据放 L1 = 与 `COLOR_ITEM_IDS`（`:66`）同口径 ⇒ **单一真值在 L1、L4 只装配**。
- **L4** `game/app/scenes/mapScene.js`：① `:560` `PI_GROUPS` 在 `mount` 后、`ground` 前插 `{key:'eye', label:'表情', slot:8}` ⇒ **件物组相邻、两个非物品组恒在末位**（共 **9** 个标签）；② `:597` `listCatalog` 三重筛改**四重** = 槽位 → 剔 `COLOR_ITEM_IDS` → **剔 `isEmptySuitItem`** → 只留清单已登记包。
- **L3** `playerInfoPanel.js` / `ui.css`：**零改动**。槽 8 走的是既有通用机械 —— `equippedIdOfSlot(slot)` / `getEquippedSummary` / `onPickEquip` / `onUnequipSlot` 全按 `g.slot` 数据驱动（只有 slot 3 坐骑有特例），`.rb-pif-tabs` 早就是 `flex-wrap`（ui.css:750）⇒ 多一个标签不需要新样式。**表情 = 装备件** ⇒ 点格走 `APP.actorLook.equip` → `persistLook()` → **落盘 `<equip>`**（与「颜色/阴影」两个非物品组恰好相反，本批没碰这条链，`MDB8-g` 通路原样）。
- **新工具** `tools/pack-icon-stills.mjs`（**素材生成、不是验收脚本**，决议 ⑦ 不破）：默认扫描 = `icon-missing.json` ∩ 玩家面可见（槽 ∈{1,2,3,5,6,7,8}、非颜色件、非空件）∩ 包已缓存 ⇒ 命中 **5 件**；逐件 `packRefOf` → 读登录器缓存包 → L1 `parsePack` / `labelStartFrame('standDown')` / `pickFrame` / `frameRect` → `PNG.sync.read(pack.png)` 切子矩形 → 「最长边 ≈ 112」最近邻放大 → 居中贴 **120×120 RGBA** → 写 `png/item/equip/icon/{id}.png`（= `item-art.js` 兜底链**第①级**，运行时零改动）。实测输出：`100106` 裁 52×54 ×2.07、`100107` 54×62 ×1.81、`100242–100244` 17×19 ×5.89。守卫 = **目标已存在即跳过** + **是软链则拒绝覆盖**（抄 `tools/swf2svg.mjs:195-198` 的 `isSymlink` 纪律）；`--cache=` / `--ids=` 可指。
- **表情组素材实测（预算）**：`equip-index` 槽 8 = **21 件**、包 **21/21**、图标 **21/21**（`png/item/equip/icon/` 全在）⇒ 过筛后 **20 格**（− 默认眼睛 `100003`）。

**过滤效果实测（数据口径核对，非验收）**：七组 = 头 **346** / 手 **375** / 脚 **304** / 腰 **305** / 背 **240** / 坐骑 **95** / **表情 20** ⇒ 合计 **1685**（PI-j 的 1666 −1 空件 +20 表情）。头部 −1 = **默认头顶**；其余五组数字与 PI-j 完全一致（`suit=0` 在面板槽位里只命中槽 1 与槽 8 两件）。

**门禁（静态自检，不替代手测）**：`node --check`（ESM 副本）= `actor-look.js` / `mapScene.js` / `playerInfoPanel.js` / `pack-icon-stills.mjs` **4/4 过**；分层 = `grep "from '.*logic/" game/app/view/playerinfo/` **零命中**（PI2 不破，本批视图一行未动）；`session.js` 一行未改；无新裸依赖 ⇒ import map 零增项；`game/core/**` 零改动 ⇒ 无重生成物；`game/maprunner/**` 零改动；产物 `png/**` 仍**不入库**（`.gitignore` 不变）。

**PI-k 偏差登记（PID17 · 显示层，不改真值判定）**：

| # | 偏差 | 处置与理由 |
|---|---|---|
| **PID17** | 计划把「表情」组的图标当既有能力（图标 21/21 已在盘）⇒ 落码时**顺带**为满足条件的 5 件图标缺件生成裁帧静图（人问的②③两条） | 不是新功能、是**离线产物补齐**：`item-art.js` 的四级兜底第①级本来就查这个路径 ⇒ **运行时零改动**；产物不入库 ⇒ 新克隆自动退回原色块，行为不倒退。同时如实登记 = **裁出来的是穿戴美术、不是官服图标原画**（小图放大带块感，人若不满意删那 5 个 png 即回原状） |

**⇒ 请人测 = §8「PI-k 追加（#21）」（地图侧同批清单 = `docs/map/map-impl.md §8.25`）** —— ✅ **手测通过（2026-10-21，人类「ok, done good」）**；PI-j/PI-k 两批就此收口，**当前停点 = 停下等人类点名下一批**。

## 8. 请人测（= design §6；交付时随回复同发；夹具档基线 = 昵称 `Linux` / 下拉仅「无」/ 立绘机器人 / 47000·100）

1. **开面板**：`#/map?slot=0&…` 点 HUD 底栏「信息」钮 ⇒ **640 宽居中框**（高度内容自适应 ≥320，as-built PID1；PI-f 起含左右两栏，见 #10–15）弹出：名字「Linux」、称号下拉**仅「无」**（夹具无称号族道具）、~~立绘 = **机器人**（`useRobotAsPlayer=true`）~~ **PIQ7 后立绘退役 ⇒ 左栏 = canvas 角色形象**、赛尔豆 **47000** / 星钻 **100**（图标 = `Items/1.png`/`2.png`，不是预制 Coin/Diamond 图）；再点一次「信息」= **刷新不叠层**；有 swf 映射的图（走 SWF 路）与无映射的图（JS 路）各开一遍行为一致（`AGENTS §4.16` swf 优先分流；面板在 `#rv` DOM 层、不随分流变，此项 = 两路都点得开）；
2. **昵称两拍**：点 Edit 图标 ⇒ 出输入框（placeholder = 旧名 `Linux`）、名字文本隐藏、图标换 Mark；**直接再点（空）⇒ 弹「提示/昵称不能空白」、且仍停在编辑态**（关掉提示还能继续改）；改成 `TestName` 再点 ⇒ 翻回显示态、名字变 `TestName`；
3. **改名落盘**：改完名 **关游戏重开同存档** ⇒ 名字保持（`session.data.nickname` 落盘，重开后面板名 = 新名）；`state.trainer.name` 同步为**搁置/未来消费面**（DOM HUD 现不显示训练家名，消费它的是搁置的 AS3 `#/battle` 线 = 见 as-built PID5）⇒ 本条**可见验收 = 重开后面板名保持**，不要求当前会话里别处名字跟着变；
4. ~~**Change 立绘**：点 Change ⇒ 立绘 机器人 ⇄ nono（夹具无装备，`false` 态 = nono 高 100）、**落盘**（重开保持）；⚠️ 测装备态（高 150 装备图标）需先让玩家**拥有**一条 25 族道具（如 `7001 潜水服`，调试台 `A.addItem(7001,1)`）再在下拉里选它 ⇒ 立绘换成**潜水服图标**、选回「无」⇒ 退 nono（23/24 族选了立绘不变 = 只认 25）；~~ **【PI-equip 起整条退役**（PIQ7：立绘三态 + Change 钮删除；称号下拉选定仍落盘但不再驱动形象，23/24/25 行为一致）**】**；
5. **下拉回填（A1）**：用调试台把存档 `achievement` 改成包里**没有**的 id（如 `7001` 但包里没有）⇒ 重开面板显「无」、**档值不被改**（再改回 0 即可）；
6. **Shoot**：点 Shoot ⇒ 按钮视觉态翻转、**不落盘**（重开回灭）；**下次进图** `env.mode` = `shoot`（消费面 `mapScene.js:1176` SWF adopt `player.shoot` / `:1341` JS 路 env.mode），重开进程 = `normal`；⚠️ 面板内**无即时画面变化**（预期，消费面在进图 env）；
7. **Bag**：点 Bag ⇒ 本面板**先关**、弹既有道具背包模态（**不含**两枚货币行 = PIQ1 口径差，货币在面板 Currency Bar 已活读数）；
8. **Follow / Home**：点 Follow ⇒ 提示「该功能尚未实装，敬请期待！」；点 Home ⇒ 提示「当前没有跟随中的精灵或动物哦！」（1 键、不崩、无伪造 UI）；
9. **关闭回归**：✕ 与遮罩关闭后**无残留层**、可重复开；开过面板后 HUD 顶栏名/币仍正确（`onSave` 的 `refreshHud` 没把别的弄脏）。

**PI-equip 追加（#10–15）**

10. **两栏布局**：面板中部 = 左（canvas 形象 + 已装配条）/ 右（~~7 组滚动列表~~ **⚠️ 本条为 PI-f 当时口径，现 = 组标签 + 分页网格（PI-g）、并已有 9 组（PI-j 颜色 / PI-k 表情）⇒ 组数判据以 #20/#21 为准**）；框 640 宽居中、右栏可滚动、7 组齐全（头部/手部/脚部/腰部/背部/坐骑/阴影）；
11. **左栏预览**：canvas 显示当前装配形象（裸装 + 身体颜色正确、阴影在地面），站立动画在走（与地图角色同一时钟）；调试台 `APP.actorLook.equip(某id)` 后不关面板再点「信息」⇒ 预览同步（单例 `update()` 活读数）；
12. **换装闭环**：右栏点头部组任一格 ⇒ 左栏形象即时戴帽 + 该格高亮 + 已装配条头部格出现该件 + **地图上的角色同步变**（同一 LOOK）；同组再点另一件 = 替换不叠加；点已装件本身 = 卸下（或点已装配条「卸下」钮）；
13. **坐骑**：坐骑组点一格 ⇒ 骑上（预览+地图角色上坐骑）；骑中再点同格或「卸下」⇒ 下马；骑乘中头/手等外观仍正常叠画；
14. **阴影两态**：点「光轮」⇒ 阴影消失、脚下出光圈且随动画转；点「阴影」⇒ 复原；**关面板重开游戏回阴影**（不落盘 = 既有 MDB8-b3 口径，属预期非 bug）；
15. **落盘回归**：穿/卸/骑/下马若干次 ⇒ **同存档重开游戏** ⇒ 已装配条与形象保持（`<equip>` 块，`save-xml-spec §2.22`）；关面板后地图交互无残留异常（角色可继续走位、点击 NPC 正常）。

**PI-g 追加（#16–17）**

16. **（PI-g）分页网格与图标**：右栏变「7 个组标签 + 一次一组 + 每页 36 图标格 + 翻页条」；点标签换组回到第 1 页、`›` 翻页流畅（数百件的大组不卡）；格子里是**真图标**（~~Flash 图标经 Ruffle 播~~ **【PI-i 起 = 离线静图 `/png/item/equip/icon/<id>.png`，缺件才落 Ruffle，见 #19】**），鼠标悬浮出名字；个别格只有色块无图 = 该件 404「未采集」（对照采集登记，属预期）；左栏已装配条也带小图标。
17. **（PI-g）闭环回归**：网格上点一件 ⇒ 高亮/左栏形象/地图角色同步（= #12 闭环不破）；翻页后再回来 ⇒ 当前装配仍高亮；换页后关面板重开 ⇒ 无播放器残留（不越开越卡）。

**PI-h 追加（#18）**

18. **（PI-h）图标真身**：**硬刷新**（图标管线未变、只是播放时序）⇒ 开「信息」面板右栏 ⇒ 格子里应出现**真装备图标**（不再是纯色块）；翻页/换组后新页图标同样亮起；左栏已装配条小图标也亮；个别件仍是色块 = 404「未采集」件（对照 `game/data/actor/equip/icon-missing.json` 48 件，预期）；console 不应再刷 `Ignoring attempt to play a disconnected…` 警告。
   **✅ 手测回报（人类 2026-10-20）**：「很好，ok了」⇒ #18 达成、**PI-h 结账**（真图标 = PI-g 遗留最后一格补齐）。

**PI-i 追加（#19 · ✅ 追认通过，见文末登记）**

19. **（PI-i）图标画面源 = 离线静图**：**硬刷新**（`Ctrl+Shift+R`，别让浏览器吃旧缓存）⇒ 开「信息」面板 ⇒
   ① **右栏 44px 网格**与**左栏已装配条 22px 小图**都应是**同一批装备图标**、但**由图片直接画出**（不再经 Flash 播放器）；
   ② F12 **Network** 里这些格子的请求应是 `/png/item/equip/icon/<id>.png`（`image/png`），**不该再出现** `/swf/item/equip/icon/<id>.swf`；
   ③ F12 **Console** 敲 `document.querySelectorAll('.rb-pif-cell ruffle-player').length` ⇒ 静图齐的组应为 **0**（PI-g 时代是 36）；
   ④ **翻页 / 换组**后新页图标照常亮起、无闪烁空帧；关面板重开不越开越卡；
   ⑤ **预期差异，不是新 bug**（人类 2026-10-20 已拍板「都不补」）：静图**没有外发光/投影**（装备图标实测 136 件带滤镜）、**没有 `clipDepth` 掩膜**（129 件）⇒ 个别图标比 Ruffle 播出来**朴素一点 / 边缘方一点**；`101622`（画空）、`100701`/`101651`/`101738`（缺一层）等解析不出的件**仍是色块 tile** = 预期；
   ⑥ **顺带回归**（同一改动波及的另外两家）：开**商店**与**道具背包** ⇒ 列表/详情里的装备类图标应**从色块变成出图**（这两家原先 `useRuffle=false`，装备 id 在 Unity 树里根本没有 PNG）；货币两枚（赛尔豆/星钻）画面不变；
   ⑦ 想看兜底是否工作：临时把 `png/item/equip/icon/` 里任一件改名（或整体挪走该目录）再硬刷新 ⇒ 该格应自动落回 Ruffle 播 swf、**不许黑屏或空白**。
   **请人回报 = 「哪些件画面不对 / Network 里有没有漏 `.swf` / ③ 的数字是不是 0」**；以人手测为准，本批不附脚本（决议 ⑦）。

**PI-j 追加（#20 · 缺件过滤 + 「颜色」组，人类 2026-10-21 三条指令 · ✅ 手测通过 2026-10-21）**

20. **（PI-j）玩家面只列有包件 + 独立换色**：**硬刷新** ⇒ 开「信息」面板 ⇒
    ① **组标签应是 8 个**（头/手/脚/腰/背/坐骑/阴影/**颜色**），「颜色」在**末位**（不打乱既有组序）；⚠️ 本条数字随同日 **PI-k** 过时 = 现为 **9 个**（表情插入坐骑后、阴影前），回归以 **#21 ①** 为准；
    ② **实测条数**（数格子总数或看页码 × 36 反推）：**头部 347**（不动）／**手部 375**／**坐骑 95**／**腰部 305**（不动）／**脚部 304**／**背部 240**，六组合计 **1666**（过滤前 1701，−35 = 24 件颜色手/脚 + 11 件无包）；**身体组（槽 4）与 12 件颜色身体件本就不在面板组里**；页码应随条数自动收缩；
    ③ **被剔掉的应当正是这些名字**（可反查 `docs/map/map-actor-look.md §5.7` 缺件实名表）：手部少 **葛蕾芬手套 100233 / 兵团长拳套 100253 / 兵团长的剑 100254 / 回忆录 101740**（⚠️ 回忆录是**手部件**、不是坐骑）；坐骑少 **五周年冠军坐骑 101737**；脚部少 **渡鸦战靴 100770**；背部少 **雷电电闪 100337 / 战魔武煞背甲 101191 / 上古战神背装 101335 / 张飞盔甲背装 101493 / 鬼瞳背装 101537**；12 色手/脚件**全部不再出现**在部件网格里；
    ④ **「颜色」组** = 12 个色块钮 + 色名、**不分页**、当前色高亮；点任意色 ⇒ 左栏预览与**地图上的角色即时换色**；**关面板再重开、切图都仍生效**（会话态 `session.actorColor`）；**刷新/重开游戏会回到调试页 `#avSel` 的选择**（**不落盘** = 与阴影两态同口径 ⇒ 存档 `<equip>` 里**不应**多出颜色字段）；
    ⑤ **左栏已装配条**的「颜色」格应显示**当前色名**、**没有「卸下」钮**（阴影格同样无卸下，属既有先例）；
    ⑥ **调试面不受影响**（边界确认）：F12 Console 敲 `APP.actorLook.equip(101737)` ⇒ **仍能穿上**，角色画 fallback 并在 `#log` 打一行 `外观缺包（…）: 157003_0（每签名一行；有 fallback 的已用 fallback 绘制）`（`mapScene.js:2053` 口径）；存档里若已存着无包件，进图照常画 fallback ⇒ **不静默改档**；
    ⑦ **表情组（槽 8）不进面板**（本就不是面板组）：其实测**包 21/21、图标 21/21 齐全**，指令②里"表情疑似没抓"指的是另一支 = **对话气泡 `emoji/toon/*`**，本批**不做图像气泡**（现状 = 只文本）；
      ⚠️ **本条已被同日 PI-k 推翻（人类点名「更改角色表情未添加」⇒ `ALQ12`）**：表情组**已进面板**（槽 8、20 格、落盘），见 **#21**；对话气泡那一支的结论不变 —— **素材在盘且已入库**（`Assets/StaticResources/Sprites/Map/talk bubble/emoji/toon/` **24 png** + `meme/` **7 jpg**，见 `docs/asset-inventory.md` **AS42** 与正本 `docs/map/map-move.md:319/:324`）⇒ 未做的原因是**运行时还没接这条读取路**，**不是缺素材**（先前的"盘上为空"是我看错了树）；
    ⑧ **图标缺不作剔除条件**（回归 PI-i）：过滤只看**部件包**，因此有些在册格子仍是**色块** = 图标 404 的 48 件（对照 `game/data/actor/equip/icon-missing.json`），属预期。
    **请人回报 = 「②的六个数字对不对 / ③的件名是否已在列表里消失 / ④换色是否即时且重开保持 / ⑥调试台能不能穿」**；以人手测为准，本批不附脚本（决议 ⑦）。

**PI-k 追加（#21 · 「表情」组 + 空件不列 + 裁帧图标，人类 2026-10-21 四条反馈 · ✅ 手测通过 2026-10-21）**

21. **（PI-k）表情组 + 空件 + 五张裁帧图标**：**先跑** `node tools/pack-icon-stills.mjs`（生成图标静图，产物不入库）→ **硬刷新** ⇒ 开「信息」面板 ⇒
    ① **组标签 = 9 个**（头/手/脚/腰/背/坐骑/**表情**/阴影/颜色；表情排在坐骑后、阴影前，两个非物品组仍在末位）；
    ② **表情组 = 20 格、图标全是真图**（不是色块；这一组素材最齐 = 包 21/21、图标 21/21，20 = 21 减默认眼睛）；点任意表情 ⇒ 左栏预览与**地图角色脸部即时变化**、当前格高亮、左栏「表情」格出现该件名**并带「卸下」钮**（表情是装备件，与颜色格/阴影格无卸下不同）；
    ③ **表情要落盘**（与颜色相反）：换表情 → 关浏览器 → 重开同一存档槽 ⇒ **表情还在**，存档 XML `<equip>` 里应有该 ID；
    ④ **空件不再露出**：头部组 **346**（原 347）且**搜不到「默认头顶」**；表情组里**没有「默认眼睛」**；
    ⑤ **五张裁帧图标**：背部 **蓝队旗帜 100106 / 红队旗帜 100107**、手部 **阿卡 100242 / 迪迪兰 100243 / 咻休 100244 公仔** ⇒ 从色块**变成图**（旗帜 = 旗面 + 旗杆；公仔 = 小玩偶）。⚠️ 那是**从部件包裁的穿戴美术、不是官服图标原画**，小图放大会带块感 ⇒ 请人判"认不认得出、别扭不别扭"；不满意就删那 5 个 png 回色块；
    ⑥ **不可补的仍看不到**（边界）：`100233 葛蕾芬手套 / 100337 雷电电闪 / 101335 上古战神背装 / 101493 张飞盔甲背装 / 101737 五周年冠军坐骑`（部件包也 404）；
    ⑦ **调试面不受屏蔽**（边界）：`await APP.actorLook.equip(100001)` ⇒ **仍能穿上**默认头顶（只是目录不列）；
    ⑧ **回归**：其余六组条数不变（手 375 / 脚 304 / 腰 305 / 背 240 / 坐骑 95）、换装/骑乘/卸下/翻页/换色照常。
    **请人回报 = 「②表情能不能换 / ③重开还在不在 / ④默认头顶是否消失 / ⑤五张图认不认得出」**；以人手测为准，本批不附脚本（决议 ⑦）。

> **✅ 手测回报（人类 2026-10-21）**：「ok, done good」⇒ **#20（PI-j）与 #21（PI-k）两批同盘面一并确认**（PI-j 的三条指令反馈正是催生 PI-k 的四条 ⇒ 面板改动整体通过）。**未逐条拆分回报**：#20 ② 的六个数字按当时口径登记（头部现已 = **346**，非 347 —— 同日 PI-k 剔了默认头顶），#21 的 9 组 / 表情 20 格 / 五张裁帧图标按整体通过登记。**#21 ⑤ 是可逆项**：不满意删 `png/item/equip/icon/{100106,100107,100242,100243,100244}.png` 即回色块（产物不入库）。⇒ **C4 面板（PI-f…PI-k）就此收口，下一批待人类点名**。
>
> **✅ 追认通过（间接证据，2026-10-21）= #19（PI-i · 图标画面源改离线静图）**：本条**没有**正式的逐条回报（①–⑦ 未复述、Network/Console 数字未查），但人类这三轮的反馈**全部建立在"看得见格子图标"之上**（先问「蓝队旗帜/红队旗帜没有图标素材」⇒ 前提 = 格子上别的有图；后确认「从部件 swf 生成」可行并要求裁帧）⇒ #19 的主判据（格子由 `/png/item/equip/icon/<id>.png` **直接画出**、不再挂 Ruffle）**已被同盘面间接证明**。**如实登记 = 这是追认、不是人逐条测过**；若人类要求保留待测，把本条改回待测即可。

> **素材结账（2026-10-20，随本批手测反馈）**：**角色包采集单已扩成全目录推导并补拉 2390 件**（as-built `map-impl §7.3.29` `MDB8-e3`）⇒ 重开游戏后脚/坐骑/其余件应有真画面；**例外 = 14 个包服务器真无（404 登记 `pack-missing.json`）**，对位件 = 五周年冠军坐骑 101737、葛蕾芬手套/兵团长拳套、兵团长的剑、回忆录、渡鸦战靴、雷电电闪与战魔/上古战神/张飞/鬼瞳背装 ⇒ 这些件**继续 fallback/未骑绘制 = 预期**，测坐骑请换别的件。
>
> **✅ 手测回报（人类 2026-10-20）**：「现在可以更换其他的装备了」⇒ **换装/坐骑闭环（#12/#13）+ 分页网格（#16 布局/翻页部分）**确认达成、换装主线结账；**五周年冠军坐骑 101737 维持未骑绘制 = 预期降级（包 404 已登记）**。⚠️ **修正登记（同日 PI-h）**：本条先前把「#16 真图标」也记成达成 = **过头**——人类随后报「装备的icon显示不出来」⇒ 图标渲染并未达成，根因与修复见 **§7.6**。非换装条目（#1–9 昵称/称号/货币/Shoot/Bag/Follow/Home 与 #14 阴影不落盘、#15 `<equip>` 重开保持、#17 关面板无残留）**尚未逐条回报**，留作后续随手观察、不阻塞。
