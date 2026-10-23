# 商店面板 · Unity 端源码分析报告（重启线 U·商店支）

> 本文是代码分析底座（对照 docs/view/panel/petbag/restart-petbag-panel.md 的 A1-A16 体例），同时充当本轮「Unity 端源码分析报告」交付物。
> 证据三级：【源码】= 上游 .cs 直读；【推断】= 由 Panel 对 Controller 的调用反向推断（Controller 不在本快照）；【声明】= 本批按目标行为自写、不照搬（决议 ② 口径）。
> 配对设计 = shop-design.md，配对实现 = shop-impl.md。

---

## 0. 上游真值来源与可得性（【源码】）

| 件 | 路径 | 本快照是否可得 |
|---|---|---|
| ItemShopPanel | projects/Seer2-Restart-Lite-main/Assets/Resources/Panels/ItemShop/Scripts/ItemShopPanel.cs | 已读（本报告 1） |
| ItemShopController | 上游同名 .cs（Panel 经 shopController 字段驱动） | 不在本快照（grep 全 projects/ 零命中） |
| ItemInfo.database | 上游物品库 | 不在；重启线等价物 = game/data/unity/items.json（content.restartItemOf） |
| Item（plantItemDatabase 等） | 上游 | 不在；重启线等价物 = content.restartAllItems() 按 typeRaw 过滤 |
| Activity.Shop | 上游按 key 计数（限购） | 重启宇宙无活动计数机制 => 本批自建 state.shop.bought |
| YiTeRogueData.instance.itemBag | 伊特肉鸽背包 | 重启线不接（本批 IsYite 分支仅保留接口，落「待建」） |

结论：本快照只给了「面板壳」ItemShopPanel。真正的交易逻辑（ItemShopController：加扣货币 / 加扣背包 / 限购计数 / 售价计算）源码缺失。按决议 ②：不照搬（无码可搬），改为声明目标行为并在设计/实现文档写「无该 bug / 按目标实现」，见 5 缺口登记。

---

## 1. ItemShopPanel 行为逐条（【源码】· 直读 ItemShopPanel.cs）

### 1.1 两个枚举

    enum ItemShopMode { Buy, Sell, BuyYiTe, SellYiTe }
    enum ItemShopType { Others=-1, None=0, PetPotion=1, Mine=2, Honor=3, Sign=4, YiTe=5, Farm=6, Achievement=7 }

- IsBuy(mode) = Buy | BuyYiTe；IsSell(mode) = Sell | SellYiTe；IsYite(mode) = BuyYiTe | SellYiTe。
- shopNameDict：类型 -> 中文标题。None=道具商店、PetPotion=精灵道具商店、Mine=矿石回收商店、Honor=荣誉商店、Sign=签到商店、YiTe=伊特商店、Farm=农牧产品出售、Achievement=称号商店。

### 1.2 八个类型的商品 id 清单（【源码】· 逐字抄，作为本批「道具目录」权威）

- PetPotion（精灵道具）：10101,10111,10221,10238,10239,10240,20001,10018,20002,10211,10242,21006,21007,21008,21009,21010,10011,10012,10013,10014,10015,10016,10001,10002,10003,10004,10005,320000,700000,110050
- Mine（矿石）：ItemInfo.database.Where(x=>x.type==ItemType.Mine) => 按 typeRaw==='mine' 过滤全库（重启线等价：content 过滤）。
- Honor（荣誉）：8001,8002,8003,8004,8005,8006,8007,8008,300048,300058,300077,300133,300174,300176
- Sign（签到）：500000,500178,500436,500959,500826,500761,500280,500307,500809,500179,500538,501261,501262,510499,510370,501001,500385,500389,500492,500808,500347,500459,500797,501003,500222,500697,501005,500703,500911,500752
- YiTe（伊特）：500091,24000,320757,320092,320093,320094,320095,320096,320097,320098,320099,320100,320101,320102,320103,320104,320105,320106,320107,320108,320741,320810,320967,320968,320969
- Farm（农牧）：Item.plantItemDatabase ∪ animalItemDatabase ∪ animalProductItemDatabase => 重启线等价：content 过滤 typeRaw in {plant,animal,animal_product,seed,animal_child,animal_action,fertilizer}。
- Achievement（称号）：Item.achievementItemDatabase.Where(x=>x.info.price>0) => 重启线等价：content 过滤 typeRaw==='achievement' && price>0。
- None / Others：None 默认空清单；Others 由 SetPanelIdentifier("item",…) 现场灌入。

### 1.3 面板参数面（SetPanelIdentifier(id, param)）—— 面板与调用方的唯一契约

| id | param 语义 | 重启线处理 |
|---|---|---|
| title | 覆盖标题（shopNameDict[Others]=param） | 接 title |
| mode | buy/sell/buy_yite/sell_yite -> SetShopMode | 接 mode |
| desc | "effect" => 显示效果描述，否则显示说明 | 接 descMode |
| descSize | 描述字号 | 接 descSize（暂落默认） |
| type | pet_potion/mine/honor/sign/yite/farm/achievement/others -> SetShopType | 接 type |
| currency | coinType/diamondType（斜杠分隔两整数） | 接 currency（见 4.3） |
| item | 形如 id/id/id 的清单，或 (条件过滤器) => Parser.ParseConditionFilter | 接 item（清单形式；过滤器形式本批落「待建」） |
| limit | id 数/id 数/… 每商品限购上限（负数 = 不限） | 接 limit（支持单值全局 / 数组逐商品） |

### 1.4 取数流程（【源码】）

- SetStorage()：idList = shopItemIdDict[shopType]；itemList = idList.Select((x,i)=> new Item(x, GetStorageItemCount(x,i)))。-1 表示「无限库存（购买项）」，非负表示「持有数（出售项）」。
- GetStorageItemCount(id, index)：
  - 有 itemNumLimit => limit<0 ? -1 : max(0, limit - Activity.Shop.GetData(id,"0"))。
  - IsYite => 读 YiTeRogueData.instance.itemBag。
  - IsSell => Item.Find(id, storage)?.num ?? 0（玩家持有）。
  - 否则（购买）=> -1（不限量展示）。

### 1.5 事件

- Awake：shopController.onItemBuyEvent += SetStorage；onItemSellEvent += SetStorage（买/卖后刷新库存显示）。

---

## 2. ItemShopController 契约推断（【推断】· 因源码缺失）

从 Panel 对其调用反推 Controller 必须提供的成员：

- 事件：onItemBuyEvent(item)、onItemSellEvent(item)，触发 SetStorage 重渲染。
- 设置类：SetShopMode(mode)、SetDescriptionMode(bool)、SetDescriptionFontSize(int)、SetCurrencyType(coinType, diamondType)、SetTitle(string)、SetStorage(List<Item>)。
- 内部职责（本批按目标行为自写，见 4/5）：读价（item.price + currencyType）、扣/加货币、加/扣背包、写限购计数（Activity.Shop 等价物）、售价（卖出价，上游未给 => 5 声明）。

---

## 3. 重启宇宙等价基建对照（【源码】· 已落）

| 上游概念 | 重启线落点 | 备注 |
|---|---|---|
| ItemInfo.database / Item.* | content.restartItemOf(id) / content.restartAllItems() | 单件取 + 全库枚举（本批新增 restartAllItems） |
| 物品记录字段 | { id,name,typeRaw,typeId,price,currencyType,resId,removable,itemDescription,effectDescription,effects[] } | price 已解析为整数；currencyType：1=赛尔豆 / 2=星钻 / >2=某道具 id |
| 背包 | state.items = [{id,count}] | restartSession.countItem/addItem/consumeItem |
| 货币 | state.trainer.coins / state.trainer.diamonds | 无 getter，直接读写 |
| 面板栈 | host.openPanel(name, build, opts) / closePanel | 同名去重（VP3） |
| HUD 商店钮 | restartHudView.js MENU 中 {id:'shop', panel:'ItemShop'} | 当前 -> todo('商店')（面板未建）=> 本批接 onShop |
| NPC openPanel | action.ts parseOpenPanel -> action-runner sinks.openPanel | 当前无 sink => no-sink；本批补 sink |

---

## 4. 目标行为声明（【声明】· 本批实现口径）

### 4.1 目录（catalog）

- 八类型 id 清单：PetPotion/Honor/Sign/YiTe 逐字抄 1.2（源码权威）；Mine/Farm/Achievement 按 typeRaw 过滤全库（忠实上游 LINQ 语义，等价物是 content）。
- None/Others/HUD 默认：本批加一个「全部可购买」tab = 全库 price>0 && currencyType in {1,2}，标题「道具商店」。

### 4.2 购买（BUY）

- 单价 = item.price；支付源按 item.currencyType：1->trainer.coins、2->trainer.diamonds、>2->consumeItem(currencyType, n)（用该道具当钱，忠实上游多货币）。
- 校验：balance >= price*qty；否则拒绝并给提示。
- 成功：addItem(id, qty) + 扣货币 + 限购计数 state.shop.bought[id] += qty + 触发 onWrite（落盘信号）。

### 4.3 出售（SELL）

- 仅显示玩家持有的 state.items 项。
- 售价 = item.price（全价回购，【声明】——上游控制器缺失，未见卖出价字段；等人类手测确认是否应打折，见 5 CB2）。
- 成功：consumeItem(id, qty) + 加回对应货币 + onWrite。

### 4.4 限购（limit / Activity.Shop 等价）

- state.shop = { bought:{} }（重启线新建，freshState 加默认 + 读档懒初始化）。
- remaining(id) = limit<0 ? Infinity : max(0, limit - (state.shop.bought[id]||0))；remaining<=0 => 购买按钮禁用并显示「已售罄」。

### 4.5 货币覆盖（currency 参数）

- 上游 SetCurrencyType(coinType, diamondType) 允许把「金币列/钻石列」映射到别的货币类型 id。重启线只实装 coins/diamonds，故：currencyType 仍是每件物品自带口径；currency 参数本批接受但仅记录，不额外重定向余额（等价默认行为）。列为「待核」。

### 4.6 伊特分支（IsYite）

- 接口保留（mode=buy_yite/sell_yite 仍可打开），但库存/背包走 YiTeRogueData 的部分本批不接（重启线无肉鸽背包），落「待建」，打开时给提示而非崩溃。

---

## 5. 上游缺口 / 怪癖登记（决议 ② 口径）

| 编号 | 性质 | 上游现象 | 本批处置（声明 + 不照搬） |
|---|---|---|---|
| CB1 | 代码逻辑缺口（非 bug，是缺失） | ItemShopController 不在快照，交易逻辑无源码 | 按 4 目标行为自写 game/logic/item/shop.js；不照搬（无码） |
| CB2 | 数据/口径缺失 | 上游无「卖出价」字段（在缺失的 Controller 里） | 声明售价 = item.price（全价），等人手测确认是否折扣 |
| CB3 | 机制缺失 | 重启宇宙无 Activity.Shop 计数 | 自建 state.shop.bought 实现限购（4.4）；**2026-10-19 已被 C4 活动线收编**：`state.shop.bought` 改由存档 `Activity("shop")` 袋投影/回写（**落盘、跨档不归零**），`shop.js` 本身不改 ⇒ 见 `docs/view/panel/activity/activity-impl.md §2 AC-c` |
| CB4 | 多货币 | currencyType>2 用道具当钱 | 忠实实现（consumeItem），非 bug |
| CB5 | 过滤器形式 item=(...) | 上游 Parser.ParseConditionFilter | 本批只接清单形式 id/id/...；过滤器形式落「待建」（不影响 HUD/常路径） |

注：V2「发行数据拼写/水印静默兜底」口径（domain-design 7）不适用——本批面对的是代码缺口，不是数据错字。

---

## 6. 等人手测确认项（非死账）

1. 售价口径（CB2）：卖出是全额还是打折？本批按全额实现，需人确认。
2. HUD「商店」默认目录：本批默认「道具商店 = 全部可购买」。原版 HUD 商店是否就是综合店、还是进特定分店？需人确认。
3. 图标：本批已实现三级兜底 —— ① SWF（Ruffle 播 /swf/item/icon/{resId}.swf）；② 无 SWF / 加载失败 => 同目录 .png（<img>）；③ 都没有 => 色块 tile（与 restartItemBagView 同款）。注意：本快照仅 1.swf（resId=1）资产，PNG 集也未入仓；把 /swf/item/icon/{resId}.png 放齐后即全亮。
   **【2026-10-20 已改版为四级 = PI-static】**：静图离线产物优先 ⇒ ① `/png/<与 swf 同路径>`（`tools/swf2svg.mjs`）→ ② Ruffle 播 swf（仅①缺件）→ ③ Unity `Resources` PNG → ④ 色块 tile + `assetMissing`。正本 = `docs/view/panel/playerinfo/playerinfo-design.md §3.8` + `docs/item/item-design.md §3.1`；商店/道具背包/战斗用药板随共享装载器一起换。
4. 限购默认值：HUD 打开不传 limit => 不限购。原版各分店是否自带限购？需人确认。
5. NPC openPanel ItemShop 接线：本批补 openPanel sink，但需真实 NPC 数据带该动作才能手测（B3 实体未上屏前只能靠 onNpcClick 驱动）。
