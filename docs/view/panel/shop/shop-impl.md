# 商店面板 · 实现文档（重启线 U·商店支）

> 配对设计 = shop-design.md；分析底座 = restart-shop-panel.md；版面正本 = shop-panel-desc.md（待人测回填）。
> 章节模板对照 petbag-impl.md。

## 0. 铁律

- L3（game/app/view/shop/**）不 import 任何 game/logic/**（arch-code 3 规则 #3）；L1 交易函数经 opts.logic 注入。
- 视图零算术：扣/加货币、加/扣背包、限购计数全在 logic/item/shop.js；视图只传 state 与 item 记录。
- 落盘只发信号 opts.onWrite（R4/V-5），由 mapScene requestSave（A.save + refreshHud）执行。
- 图标沿用色块 tile，不渲染 SWF（待建）。

## 1. 变更文件清单

| 文件 | 动作 | 说明 |
|---|---|---|
| game/logic/item/shop.js | 新增 | L1 交易逻辑：priceInfo / afford / remaining / buy / sell |
| game/app/view/shop/index.js | 新增 | L3 装配入口 create(container, A, opts) |
| game/app/view/shop/shopPanel.js | 新增 | L3 渲染 buildShopPanel(ctx) + 目录 catalogOf |
| game/app/content.js | 改 | 新增导出 restartAllItems() |
| game/logic/restartSession.js | 改 | freshState 加 shop:{bought:{}} 默认 |
| game/app/scenes/mapScene.js | 改 | import shop.js；新增 openRestartShop；HUD handlers 加 onShop；makeRunCtx 加 openPanel sink |
| game/app/view/hud/restartHudView.js | 改 | MENU 'shop' 加 handler:'onShop' |
| game/app/ui.css | 改 | 新增 .rb-shop-* 样式块 |
| docs/view/panel/view-panels-item.md | 新增 | 道具类面板族父文档（C2） |

## 2. 数据源搬家

- 物品目录：PetPotion/Honor/Sign/YiTe 四者 = 分析 1.2 逐字静态表（源码权威），落 shopPanel.js 常量 SHOP_IDS。
- Mine/Farm/Achievement = content.restartAllItems() 按 typeRaw 过滤（忠实上游 LINQ）。
- 综合 tab = 全库 price>0 且 currencyType in {1,2}。
- 物品记录现读 content.restartItemOf(id)（不搬 items.json 字段，content 已解析 price/currencyType）。

## 3. L1 签名与单测

game/logic/item/shop.js（纯函数，不 import content）：

- priceInfo(item) -> { currency, amount }：currency = item.currencyType（1=赛尔豆 / 2=星钻 / >2=道具 id）；amount = item.price。
- remaining(state, itemId, limit) -> number：limit<0 ? Infinity : max(0, limit - (state.shop.bought[itemId]||0))。
- afford(state, item, qty, limit) -> { ok, reason }：reason in {null,'limit','balance'}。先查 remaining（limit 分支），再查货币（currencyType 1/2 比 trainer，>2 比 countItem）。
- buy(state, item, qty, {limit}) -> { ok, reason, write }：ok 时 addItem(item.id, qty) + 扣货币（1/2 改 trainer，>2 consumeItem）+ state.shop.bought[item.id]+=qty；write=true。
- sell(state, item, qty) -> { ok, reason }：ok 时 consumeItem(item.id, qty) + 加货币（按 currencyType）；reason='empty' 当持有不足。

（按 1.1 决议⑦：本仓不新写单测；数字正确性靠人手测 + 现有门禁。函数签名即为验收口径。）

## 4. L3 DOM 与类名

见 shop-design.md 3。全部 .rb-shop-* 类在 ui.css 新增块定义（定位/配色沿用 rbi-* 同族）。视图用 _kit.js 的 el/text 构造，类名走短前缀 rb-shop-。

## 5. 逐区像素

- 容器：left 110 top 34 w 740 h 462（2026-10-19 由 120/50/720/430 调大，给三行网格腾地方）。
- 头：标题（左，黄）、货币（**右，蓝，货币道具图标 + 数额**，不用 ◈/✦ 符号）、关闭（✕，红底）。
- 类型 tab 行：8 钮横排，选中黄边（高亮由 render() 统一回写）。
- 购买/出售切换：头下两钮。
- 列表：左 300px **定页网格**（3 列 × 3 行 = 9 个/页，**左下‹ 右›箭头翻页**，不再整列滑动），cell = 道具图标 + 名称（锁两行高）+ 价格/持有。
- 详情：右区，**56px 加框大图示** + 名称/类型/价格/持有/限购 + 说明 + 效果 + 步进器 + 购买或出售钮（禁用态灰）。
- 底部 note 行：提示文案。
- 像素权威（人测回填）记入 shop-panel-desc.md；本批先按 rbi-* 同款近似，不追求逐像素。

## 6. 同名去重落地

复用 host.openPanel 的 VP3 同名去重：面板名固定 'rb-shop'，重复打开先关旧层再建新（与 petbag/itembag 同口径）。HUD 商店钮防连点：openRestartShop 内若已开（SHOP 非空）则 update 返回，不叠层。

## 7. R4 / R5 接消费者

- R4 落盘：视图 ctx.run('buy'/'sell') 内 L1 改完 state 后返回 write=true；视图发 opts.onWrite(true)；mapScene requestSave = () => { A.save(); refreshHud() }（refreshHud 让 HUD 货币同步）。
- R5 取词/提示：note 文案由视图本地 TEXT 表映射（shop.bought/shop.nomoney/shop.sold/shop.limit 等），不依赖 openHintbox；购买确认不弹二次确认（原版直接买，保持）。

## 8. record 偏移口径

不适用（商店不产生战报 record 偏移；无对应上游存档段）。

## 9. 门禁与回归

- grep 门禁（arch-code 3）：game/app/view/shop/ 下不得直连 game/logic/**（L1 经注入，不直连）。
- 既有门禁不回归：node tools/difftest.mjs、node --test game/core/ 与本批无关（未动 core）；改 ui.css 不改逻辑。
- 手测回归：HUD 商店钮打开、购买扣币加包、出售加币减包、限购置灰、关闭无残留层。

## 10. 构建顺序

1. content.restartAllItems 导出（L2）。
2. restartSession.freshState 加 shop 默认（L1 状态）。
3. game/logic/item/shop.js（L1 交易）。
4. game/app/view/shop/shopPanel.js + index.js（L3）。
5. ui.css .rb-shop-*。
6. mapScene 接线（import/openRestartShop/HUD handler/openPanel sink）。
7. restartHudView MENU 'shop' 加 handler。

## 11. 落地前置 / 已知空壳

- 前置：content 已就绪；restartSession 已就绪；host 面板栈已就绪；HUD 商店钮已留 panel 占位。无阻塞。
- 已知空壳：伊特分支（buy_yite/sell_yite 打开给提示，不接肉鸽背包）；过滤器形式 item=(...)（CB5 待建）；currency 参数仅记录不重定向（4.5 待核）。（图标已实现 Ruffle 渲染 + tile 兜底，资产集待补全。）

## 12. as-built（回填）

实际落码（2026-10-19）：

- 文件清单同 1。L1 game/logic/item/shop.js 导出 priceInfo / remaining / afford / buy / sell（纯函数，import restartSession 的 addItem/consumeItem/countItem，不 import content）。
- L3 game/app/view/shop/{index.js, shopPanel.js}：index 校验 opts.logic 缺件即抛错（不静默）；shopPanel 内含 SHOP_IDS（分析 1.2 逐字）、SHOP_TABS、catalogOf、typeColor、currencyChip（原 currencyLabel，2026-10-19 改为返回货币道具图标节点）、buildShopPanel。
- 装配：mapScene openRestartShop（HUD onShop + NPC openPanel sink 共用）；parseShopArgs 解析 mode/type/currency/item/limit/title；makeRunCtx 新增 openPanel sink（NPC openPanel ItemShop 不再 no-sink）。
- 基建：content.restartAllItems 导出；restartSession.freshState 加 shop:{bought:{}}；ui.css 新增 .rb-shop-* 整块；restartHudView MENU 'shop' 加 handler:'onShop'。

与设计的偏差 / 留口：

- descMode（desc/descSize 参数）本批未单独处理：详情同时展示「说明」与「效果」两节（更全），参数暂忽略 => 列待核。
- 过滤器形式 item=(...)（CB5）未接：只接清单形式 id/id/...；NPC 若带过滤器形式会落到默认目录。
- 伊特分支（buy_yite/sell_yite）打开正常但按普通背包结算，并显式提示「肉鸽背包未接入（待建）」，不崩溃。
- 售价全额（CB2）、HUD 默认综合店、限购默认值 均按声明实现，等人类手测确认（见分析 6）。
- 图标渲染（2026-10-19 补；**2026-10-20 PI-static 改版 = 四级**）：`makeItemIcon(resId, size, useRuffle, typeRawHint)` 四级兜底 ——
  ① 离线静图镜像 `/png/<与 swf 同路径>`（`tools/swf2svg.mjs` 产物）⇒ ② 同目录 `.swf`（Ruffle 播，仅①缺件且 `useRuffle=true`）⇒ ③ 同 id 的 Unity `Resources` `.png` ⇒ ④ 色块 tile + `assetMissing` 自陈。
  正本 = `docs/view/panel/playerinfo/playerinfo-design.md §3.8`（PI-static）+ `docs/item/item-design.md §3.1`。
- **面板打磨四修（2026-10-19 人类反馈，已落码）**：
  ① **标签高亮**：旧版只在建钮时加一次 `rb-shop-tab--on`、`render()` 从不回头同步 ⇒ 高亮永远钉在初始那张。
     现在 tabBtns 引用留手，`render()` 用 `classList.toggle('rb-shop-tab--on', key===st.type)` 统一回写（购买/出售钮同理）。
  ② **货币标识**：旧 `currencyLabel()` 返回纯文本 `'◈ '+n` / `'✦ '+n`，看不出是啥。**赛尔豆/星钻本身就是道具**
     （`unity/items.json` id 1 / id 2，typeRaw=currency，两颗 PNG 在盘）⇒ 改成 `currencyChip()` 返回 DOM：
     `makeItemIcon + 数额`，顶栏/列表价格/详情价格三处统一；currencyType>2（拿道具当钱，CB4）画不出专属图标就如实写名字。
  ③ **翻页**：列表列从 `overflow-y:auto` 整列滑动改成定页网格 + `‹ 页/总 ›` 箭头（PAGE_SIZE=9）；切标签/切买卖时 `st.page` 归零。
  ④ **详情图示**：放大到 56px 并加框。**真正让它出图的根因在 `item-art.js`**：`itemPngUrl()` 把路径型 resId
     （`Buffs/400001`，实测 612 条里占 230 条）也当文件名拼成 `Items/Buffs/400001.png` ⇒ 永远 404、只剩色块。
     改为路径型拼 `Resources/Buffs/400001.png` 后，**PNG 命中 381/612 ⇒ 611/612**（唯一缺 290008，如实退色块并在宿主上留 `data-asset-missing`）。
     同时路径型 resId 直接跳过 Ruffle（`/swf/item/**/icon/` 下只有 `1.swf`，注定失败还白挡一帧），列表/详情一律 `useRuffle=false`。
     此修**同时点亮道具背包面板**（共用 item-art.js）。

手测结论：待人类浏览器手测（见状态台账「请人测」）。
