# 道具类面板族（view 线 C2）

> 父文档：本族覆盖「道具」相关的重启线模态面板。子文档只链接、不重复（arch-docs 3）。
> 本族目前两员：道具背包（只读，已落）、商店（本轮新做）。

## 成员与指针

| 面板 | 状态 | 设计 | 实现 | 分析底座 | 版面正本 |
|---|---|---|---|---|---|
| 道具背包 restartItemBagView | 已落（只读 U4） | — | — | — | — |
| 商店 ItemShop | 本轮新做 | shop/shop-design.md | shop/shop-impl.md | shop/restart-shop-panel.md | shop/shop-panel-desc.md（待人手测回填） |

## 边界（属本族 / 不属本族）

- 属本族：道具的「查看 / 购买 / 出售」面板交互与目录。
- 不属本族：道具「使用/丢弃」执行（U2/S6，内核未移植，背包只读不伪造）；伊特肉鸽背包（重启线无，待建）；道具图标 SWF（Ruffle，待建）。

## 与商店支的关系

商店面板（shop/shop-design.md）复用道具背包（restartItemBagView.js）的色块 tile 渲染与面板壳约定（.rb-scrim / .rv-panel / host.openPanel 同名去重），但增加了「购买/出售/限购/货币」交易逻辑（logic/item/shop.js，经 opts.logic 注入，L3 不直连 game/logic）。
