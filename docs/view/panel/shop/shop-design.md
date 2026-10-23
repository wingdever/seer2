# 商店面板 · 设计文档（重启线 U·商店支）

> 配对：分析 = restart-shop-panel.md；实现 = shop-impl.md；版面正本 = shop-panel-desc.md（待人测回填）。
> 父文档 = view-panels-item.md（C2）。本文严格按 view-design.md 8 的 9 点骨架。

---

## 1. 范围 / 边界

- 属本文：重启宇宙（v3）下的「商店」模态面板：商品目录（八类型 + 综合）、购买、出售、限购、货币（赛尔豆/星钻/道具当钱）、HUD 入口、NPC openPanel 触发。
- 不属本文：道具「使用/丢弃」逻辑（属 U2/S6，道具背包只读，不在此）；伊特肉鸽背包（本批落「待建」）；物品图标 SWF 渲染（Ruffle，待建）；过滤器形式 item=(...) 参数（CB5 待建）。
- 与 A 组围栏无关：商店不在 AGENTS 4 的 12 项围栏内，可自由实现。

## 2. 上游真值（源码路径 + 层栈）

- 真值来源：ItemShopPanel.cs（见 restart-shop-panel.md 1）；Controller 缺失 => 目标行为见分析 4（决议 ② 声明，不照搬）。
- 层栈（mermaid）：

    graph TD
      HUD[restartHudView 商店钮 onShop] --> openRestartShop
      NPC[NPC openPanel ItemShop] --> resolve_run[resolve to run sinks.openPanel]
      resolve_run --> openRestartShop
      openRestartShop --> host[host.js 面板栈 openPanel rb-shop]
      host --> view[app/view/shop/index.js + shopPanel.js L3 DOM]
      view --> content[content.js L2 单出口 restartItemOf/All]
      view --> run[ctx.run buy/sell]
      run --> logic[logic/item/shop.js L1 交易]
      logic --> state[restartSession.js 状态 addItem/consumeItem/trainer/shop.bought]
      view --> onwrite[opts.onWrite]
      onwrite --> save[mapScene requestSave => A.save + refreshHud]

## 3. DOM 与类名契约

沿用重启线面板约定（与 rbi-* 同族，色块 tile 不渲染 SWF 图标）：

- .rb-scrim（复用全局遮罩，点击关闭）
- .rb-shop-box（容器，定位同 rbi-box：left 120 top 50 w 720 h 430）
- .rb-shop-head：标题 .rb-shop-title、货币 .rb-shop-money、关闭 .rb-shop-close
- .rb-shop-tabs：八类型按钮 .rb-shop-tab（选中加 .rb-shop-tab--on）
- .rb-shop-mode：购买/出售切换 .rb-shop-modebtn（选中加 .rb-shop-modebtn--on）
- .rb-shop-body（flex）：.rb-shop-lists + .rb-shop-detail
- .rb-shop-cell（选中加 .rb-shop-cell--on）：.rb-shop-tile + .rb-shop-cell-name + .rb-shop-cell-sub（价格/持有）
- .rb-shop-dh（详情头）、.rb-shop-sect、.rb-shop-desc、.rb-shop-eff
- .rb-shop-qty（步进器：- 数字 +）
- .rb-shop-buy / .rb-shop-sell（动作钮，禁用加 .rb-shop-buy--off / .rb-shop-sell--off）
- .rb-shop-note（底部提示行）

## 4. 数据接线（零算数）

- 目录：视图层用 content.restartAllItems() 按 typeRaw 过滤得到八类型 id 清单（PetPotion/Honor/Sign/YiTe 用分析 1.2 逐字静态表；Mine/Farm/Achievement 用 content 过滤）；综合 tab = 全库 price>0 且 currencyType 属于 {1,2}。
- 商品记录：content.restartItemOf(id) 拿 name/price/currencyType/typeRaw/removable/说明/效果。
- 购买校验与扣减：全部交给注入的 L1 shop.buy(state, item, qty, {limit})；视图只传 state 与 item 记录，不在视图里做算术。
- 货币读数：A.state.trainer.coins / diamonds，显示用；扣加在 L1。
- 落盘：视图只发 opts.onWrite(r.write) 信号，由 mapScene requestSave（A.save + refreshHud）落盘（R4/V-5）。

## 5. 资产权威

- 物品数据权威 = game/data/unity/items.json（content 单出口读取）。
- 标题/类型中文 = 分析 1.1 的 shopNameDict + content.ITEM_TYPE_CN。
- 图标：**四级兜底**（2026-10-20 PI-static 改版，正本 = `docs/view/panel/playerinfo/playerinfo-design.md §3.8` 的「图标画面源」条 + `docs/item/item-design.md §3.1`）—— **离线静图（`/png/<与 swf 同路径>`，`tools/swf2svg.mjs` 产物）→ SWF（Ruffle 播，仅当静图缺件）→ Unity `Resources/` PNG → 色块 tile**；resId 为 0 退回 id；大列表跳过 Ruffle（`useRuffle=false`）**但静图照用**（一张 `<img>`，不挂播放器）⇒ 装备/坐骑这类 id 段在 Unity 树里本就没有 PNG、从前只剩色块，现在出真图。

## 6. 依赖方向

- 单向：mapScene（装配）-> view(shop) -> content（L2）/ host；view 经 opts.logic 反向收 L1 shop.js 注入。
- 硬规则：game/app/view/shop/** 不得 import 任何 game/logic/**（arch-code 3 规则 #3）。L1 交易函数由 mapScene 注入。L3 仅允许 import content.js（arch-code 3 例外）。
- game/logic/item/shop.js 自身不 import content（与 game/logic 其他件一致），item 记录由视图传入。

## 7. 交互 / 事件契约

- 打开：HUD 商店钮 -> onShop -> openRestartShop()（默认综合购买）；NPC openPanel ItemShop[...] -> sink 解析参数 -> 同函数。
- 切换类型 tab -> 重渲染列表；切换 购买/出售 -> 重渲染（购买列目录、出售列背包）。
- 点 cell -> 选中 -> 渲染详情（说明/效果/价格/持有/限购余量 + 步进器）。
- 步进器改 qty（1..余量或持有上限）。
- 购买钮 -> ctx.run('buy', {itemId, qty})；失败 -> note 提示（余额不足/已售罄/超出限购）；成功 -> 刷新列表+详情+货币，note「已购买 N 个 X」。
- 出售钮 -> ctx.run('sell', {itemId, qty})；成功 -> note「已出售 N 个 X」。
- 关闭：.rb-scrim 点击 / .rb-shop-close -> opts.onClose -> api.close()。

## 8. 缺口 / 待核

- 售价口径（CB2）：卖出全额还是打折？本批全额，等人手测确认。
- HUD 默认目录：综合店是否即原版 HUD 商店？待确认。
- 限购默认值：HUD 打开不限购；原版分店是否自带？待确认。
- 伊特分支（CB1 余）：buy_yite/sell_yite 打开给提示而非崩溃，待接肉鸽背包。
- 过滤器形式 item=(...)（CB5）：本批只接清单，待建。
- 图标 SWF：待建。

## 9. 配对 impl 指针

- 实现文档 = shop-impl.md（变更文件清单、L1 签名、L3 DOM、同名去重、R4/R5 接消费者、门禁）。
- 代码分析底座 = restart-shop-panel.md（CB1-CB5 缺口登记）。
- 版面正本 = shop-panel-desc.md（人手测回填的像素/排版权威）。
