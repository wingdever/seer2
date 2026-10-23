# 图鉴面板 · impl（配对 `dex-design.md`）

> **类别**：impl（`docs/arch-docs.md §2` 配对纪律）。父文档 = **`docs/view/panel/dex/dex-design.md`**（目标行为 **DX1–DX12** / 不变量 **DXI1–DXI6** / 决案 **DXQ1–6 全 = A**）；证据底座 = **`docs/view/panel/dex/restart-dex-panel.md`**（怪癖 **A1–A14**，引用一律带文件名）。
> **本份只放"怎么落"**：文件 / 函数 / 行号 / 施工顺序 / 自检 / as-built。**目标行为一律只链接不复述**（冲突时以 design 为准，落码后以本份 as-built 为准）。
> **编号**：施工批 **DX-a → DX-d**（顺序固定）；as-built 条目 **DXB1–DXBn**；请人测条目直接借 design **§5 的 1–18**。
> **状态**：⬜ **待施工**（判据 = `AGENTS.md §1`：design **与** impl 双过人类评审才可写码）。§7 as-built 目前为空。

---

## 0. 动工前的三条硬前提（缺一不许开第一行码）

| # | 前提 | 现状 | 谁做 |
|---|---|---|---|
| **P1** | **本份 + `dex-design.md` 经人类评审通过** | ⬜ 待审（DXQ1–6 已定 = A，剩全文过审） | 人类 |
| **P2** | **不新增任何测试 / 探针 / 截图脚本**（`AGENTS.md §1.1` 决议 ⑦ 加严）；验收 = 人手测 + 我在交付回复里写"测什么、看哪里" | ✅ 口径既定 | AI |
| **P3** | **生成物纪律**：改 `tools/build-unity-data.mjs` 必须**重跑生成**、**不手改** `game/data/unity/*.json`（`AGENTS.md §3`） | ✅ 口径既定 | AI |

⚠️ 本份**不涉及** `game/core/**/*.ts` ⇒ **不需要** `node tools/build-core.mjs`（分层里 L1/L3 都是手写 JS）。
⚠️ 本份**不碰**：`MapRunner.as` / AS3、`#/battle`、A 组 11 项、`walk`/`geometry`（MB8）、图鉴存档字段（**DX0-b**）。

---

## 1. DX-a · 数据面与逻辑面（无 DOM，可独立验一眼）

### 1.1 数据桥：把 `topicPetId` 带出来（**DXQ2 = A**）

| 步 | 文件:行 | 动作 |
|---|---|---|
| a | `tools/build-unity-data.mjs:527-529` | 现在只读 `<gameVersion>` / `<releaseDate>` ⇒ **加一条**：读 `Resources/Data/System/version.xml:51` 的 **`<topicPetId>`（单数、一行逗号分隔 9 个 id）**，拆成**数字数组** |
| b | `tools/build-unity-data.mjs:568` | `emit('pets.json', { pets: petInfos })` ⇒ **改 emit 形状** = `{ pets: petInfos, topicPetIds: [...] }`（⚠️ `pets` 是**数组**、键不是对象 —— 别按"对象键"写代码） |
| c | 重跑生成 | `node tools/build-unity-data.mjs` ⇒ 复跑 `game/data/unity/pets.json`（**勿手改产物**；改前先看该脚本头部有没有别的 emit 依赖同一常量） |

**实测基准（供人眼核对，不写断言）**：`pets` 数组 **838** 条；`ui.hide === true` **50** 条 ⇒ 可见 **788**；`topicPetIds` = `20016,14415,969,531,493,10904,376,752,114764`（第 9 个 `114764 瑶光桂影·琉梦` 是 hide ⇒ Topic 档 **8 只** = design **DX6**/修 **A6**）。

### 1.2 L2 `game/app/content.js`：两只 getter（**VP5 反转的唯一数据面代价**）

| 落点 | 签名（照现有风格，点名导出） | 说明 |
|---|---|---|
| `:39-40` 附近（`R.pets` / `R.petById` 建好之后） | `export const restartAllPets = () => (R.pets?.pets || []).slice()` | **原始行数组的浅拷贝**（838 行；不排序、不滤 hide —— hide 过滤是 L1 的事） |
| 同段 | `export const restartTopicPetIds = () => (R.pets?.topicPetIds || []).slice()` | 新字段；缺字段 ⇒ 空数组（**V2 静默兜底**口径，不抛） |
| 同段 | `export const restartEvolveTargetsOf = (petId) => (R.growthById?.get(Number(petId))?.evolvePetIds || []).map(Number)` | **原始链**（含 `evolveLevels=0` 的道具/特殊进化）⇒ **不许**复用 `restartEvolveOf()`（`:198` 它 `filter(at>0)`，谓词不同 = design **DX4** 第 2 条） |

⚠️ 三只都是**读表**、零算数、零 DOM ⇒ 归 L2 无疑；`R.growthById` 已在 `content.js` 里建好（`restartEvolveOf` 就是用它）。

### 1.3 L1 新建 `game/logic/dex/`（**纯**：无 DOM、无 fetch、不 import `content.js`）

| 文件 | 导出 | 职责（一句话） | 关键不变量 |
|---|---|---|---|
| `entries.js` | `buildDexEntries(rows, { mode, topicIds })` | hide 过滤 + 选档 + **默认序**（`All` 档 = `ui.defaultId` 升 → 同值再 `ui.subId` 升；`Topic` 档 = **保持 `topicIds` 原序**、不排） | 两档**都**滤 hide（修 **A6**）；行对象**原样透传**（视图零算数 V-2 的前提） |
| `own.js` | `isOwned(entry, ownedIds, evolveTargetsOf)` | 沿 `evolvePetIds` **DFS**：`D.id ∈ owned` 或**链上任一目标 ∈ owned** ⇒ 亮（**方向不对称 = 照上游 A8**）；**链上出现表里没有的目标 ⇒ 视为链断、返回当前结果、不抛**（上游 `Pet.GetPetInfo` 无空判断会 NRE = 报告 §4；本发行数据悬空 0 条，纯防未来） | 无环保护（`seen` 集）——`evolvePetIds` 里 `2→1` 之类的回边不能死循环 |
| `own.js` | `buildOwnedIds(petBag, petStorage)` | 把背包 12 + 仓库投影成 `Set<petId>`（null 槽跳过） | 只认 `petId` 字段（装配层给的投影形状见 §4.2） |
| `predicates.js` | `elementPredicate(elemId)` / `nameOrIdPredicate(query)` / `sorterOf(option)` | 谓词与比较器**工厂**（L3 只产函数、DOM 不筛数据 = design **DX7** 第 4 条） | 元素谓词 = `elementId===E \|\| (subElementId===E && subElementId!==0)`；查询**纯数字 ⇒ 行 `id` 精确**、否则 `name` **子串（区分大小写）**；`sorterOf('star')` = **真按 `ui.star` 降序、同星按 `defaultId` 升**（修 **A3**） |
| `predicates.js` | `combineAnd(fns)` | 两谓词 **AND 叠加**（**VP1**，不照搬上游"互斥"） | 空谓词集 ⇒ 返回 `null`（= `grid.setFilter(null)` 的"全部"语义） |

**分层自查**：`game/logic/**` 里**不得**出现 `document` / `fetch` / `import '../..'` 到 `game/app/**`（`docs/arch-code.md §3` 规则，人肉 grep，不写门禁脚本）。

---

## 2. DX-b · 面板骨架（L3 + CSS，先让框能开能关能翻页）

### 2.1 文件表（新建 4 个，照 `game/app/view/activity/` 的两件式再细分）

| 文件 | 导出 | 内容 |
|---|---|---|
| `game/app/view/dex/index.js` | `create(container, opts={})` → `{ update, destroy }` | **装配口**：`opts.logic` 缺失 ⇒ **大声抛**（照 `view/petbag/index.js:55` 的口径写一句同类信息）；opts 其余键见 §2.2 |
| `game/app/view/dex/dexPanel.js` | `buildDexPanel(ctx)` | 760×480 **正居中**框 + 标题 + ✕ + **页签两颗** + **9 格容器** + 分页条 + 左元素栏 + 顶栏筛选（排序下拉 / 搜索框 / `Search` 钮）+ 展示台壳 `.rb-dex-stage`；一切读数从 `ctx` 拿 |
| `game/app/view/dex/cells.js` | `DEX_CELL_SLOTS`（9 项 `{x,y,w,h}`）、`DEX_PAGE_SIZE = 9` | **格位表**（下面 §2.3 的抄表结果，同 `minimap/blocks.js` 的做法：**数据表、不是散在各处的魔法数**） |
| `game/app/view/dex/infoPane.js` | `buildInfoPane(ctx)` | 六行 + 六维 + 三颗动作钮（DX **§DX9 / DX12** 口径；本批先占位、读数在 DX-c 填） |

**`opts` 形状（装配层 → L3，全部注入、L3 零 import `game/logic/**` = DXI5）**：

```js
{ logic: { buildDexEntries, buildOwnedIds, isOwned, elementPredicate, nameOrIdPredicate, sorterOf, combineAnd, createGrid, DEX_PAGE_SIZE },
  rows,              // content.restartAllPets() 的原始 838 行
  topicIds,          // content.restartTopicPetIds()
  ownedIds,          // buildOwnedIds 结果（Set）
  evolveTargetsOf,   // (petId) => number[]（原始链）
  read:   { nameOf, swfIdOf, elementNameOf, iconUrl, elementIcon, panelSprite, mapSprite, mountImg },   // L2/_kit 的读数与 URL（视图零算数）
  onClose, onLink, showHint, askHint, playCry }
```

⚠️ `_kit.js` 的 helper（`petIconUrl:45` / `elementIcon:47` / `panelSprite:40` / `mapSprite` / `mountImg:50` / `elementName` / `elementColor`）**住在 `view/panels/battle/_kit.js`，是 L3 ⇒ L3 之间可直接 import**（先例 = 各面板都这么用）；**不要**把它们搬进 L1。

### 2.2 机器复用（一台都不新写 = DXI3）

| 用途 | 复用 | 本面板的传参（⚠️ 两处易错） |
|---|---|---|
| 分页 / 游标 / 筛选 / 排序 | `game/logic/petbag/grid.js:8 createGrid({ capacity=null, items, pageSize=PAGE_SIZE, pageMode='NewPage' })` | **`pageSize: 9`**；**绝不传 `capacity`**（G1 校验 `items.length !== capacity` ⇒ 立刻抛 `grid G1: … 拒绝 resize`）；`items` 必须是数组（否则抛 `grid: items 必须是数组`） |
| 页码显示 | `grid.page()` / `grid.pageCount()` | **显示 1 基**（内部 0 基）⇒ `page()+1 + '/' + pageCount()` = `1/88` |
| 置灰 | `Prev/Next` 用 `page()===0` / `page()===pageCount()-1` 判 | 到头**置灰**、不循环 |
| 跳页 | `grid.setPage(n)` | 输入**非数字或空 ⇒ 不动**（照上游语义 = design **DX5**）；合法 ⇒ **夹到 `[1, pageCount]`** |
| 筛选 | `grid.setFilter(fn)`（叠加后单函数）+ `grid.resetFilters()` | **换页签 ⇒ `resetFilters()` + `setPage(0)` + `select(0)`**（design **DX6** 末条，含排序一起清 = 修 **A5**） |
| 排序 | `grid.setSorter(fn)` | 比较器由 `predicates.sorterOf(option)` 产出；**默认 = 一般** |
| 面板入栈 | `game/app/view/panels/host.js openPanel(cls, build)` | 单例：`if (DEX) { DEX.update(); return }`（照 `openRestartActivity` 写法） |
| 提示 | `game/app/view/panels/hintbox.js openHintbox(...)` | 「测」未接、「分布待建」都走它（A3/R5 口径） |
| 展示台 | `game/app/view/petbag/idleStage.js mountIdle(stage, {petId, swfId, fallbackUrl}):50` / `clearIdle():96` | 返回 `null` ⇒ 已自动退静态头像（**三种降级文案现成**）；壳只建**一次**（播放器脱离 DOM 即销毁） |

### 2.3 格位表（【实测】从 `Panel.prefab` 的 `Pets`（`:2561`，`330×340`，pivot 左上、`anchoredPosition (30,0)`）9 个实例的 override 抄出）

| 序 | 预制 GO 名 | `x` | `y` | 换算（左上原点，格 `75×75`） |
|---|---|---|---|---|
| 0 | `Pet (0)` | 20 | −15 | col0 row0 |
| 1 | `Pet (1)` | 125 | −15 | col1 row0 |
| 2 | `Pet (2)` | 230 | −15 | col2 row0 |
| 3 | `Pet (3)` | 20 | −125 | col0 row1 |
| 4 | `Pet (4)` | 125 | −125 | col1 row1 |
| 5 | `Pet (5)` | 230 | −125 | col2 row1 |
| 6 | `Pet (6)` | 20 | −235 | col0 row2 |
| 7 | `Pet (7)` | 125 | −235 | col1 row2 |
| 8 | `Pet (8)` | 230 | −235 | col2 row2 |

⇒ **规律**：`x = 20 + 105·col`、`y = −(15 + 110·row)`（步进 **105 / 110**，格 75 ⇒ 横向留白 30、纵向留白 35）。`cells.js` 里**既写死这张表、也写这条规律注释**（改表就改表，不许在视图里现算 = V-2）。

**格子本体的正本**（【实测】`PetDictionary/Prefabs/DictPetSelectButton.prefab`）：根 `m_SizeDelta {75, 75}`、`have` 角标 `{50, 32}`、内层 `-10 × -10`（= 四边各缩 10）、文本条 `160×25` ⇒ 我方 `.rb-dex-cell` = **75×75**、角标 = **50×32**（`panelSprite('TwelveRound/Sprites/have.png')`）。⚠️ 这张 `Dict*` 预制是**图鉴专用**（与背包的 `Pet Select Button` 不同件）⇒ 报告 §6"图鉴格没有等级/血条接线"的可见来源就是它。

### 2.4 页签两颗的画法（⚠️ 盘上无专属 PNG，实测已核）

- 底 = **纯色块 + 文字描边**（我方 CSS），**不伪造第五张 PNG**：`120×30`、底色取 Unity 内置 `UISprite` 涂黑 ⇒ DOM 等价 = `background:#000`；文字 = 青色描边（上游 TMP `m_EffectColor rgba(0.32,0.90,0.98)`、`m_EffectDistance (2,−2)`），与 minimap 热区那层乘色同值。
- **左右序照搬**：左颗 = **「最新精灵」**、右颗 = **「精灵列表」**；默认高亮**右颗**（design **DX6**：修 **A1**，不照搬"默认落 Topic"）。

### 2.5 CSS

`game/app/ui.css` 追加一段 **`rb-dex-*`**（口径同 `rb-act-*` = `:674-711`；**追加位置 = 文件末**，现末行 ≈ `:858`）。类名清单（impl 落码后本表转 as-built）：
`rb-dex`（框）/ `-title` / `-close` / `-tabs` `-tab` `-tab.on` / `-element` `-element-btn` `-element-page` / `-list` `-cell` `-cell.on` `-cell-icon` `-cell-no` `-cell-have` / `-filter` `-sort` `-search` `-search-btn` `-count` / `-pager` `-page` `-jump` / `-info` `-row` `-row-label` `-row-value` / `-status` `-status-cell` / `-stage` `-stage-note` / `-cry` `-test`。

---

## 3. DX-c · 信息区读数 + 展示台 + 叫声

| # | 落点 | 动作 | 对应 design |
|---|---|---|---|
| c1 | `infoPane.js` | 六行读数**全部由注入的 `read`/行字段给**：**序号** = `{ui.defaultId}` +（`ui.subId>0 ⇒ "-{subId}"`）+ ` (★{ui.star})`（**小数原样**，`5.5` 不四舍五入）；**身高/体重** = `{base} – {base+5}`（区间串在 L3 现拼一次即可，值来自表字段）；**分布** = `linkId==='none'` ⇒ `habitat` 文本，否则画 `go.png` 钮（悬停 = `habitat`）；**特性** = `feature.name` **全文**（修 **A11**，无特性 ⇒ `—`）；**简介** = `description` | **DX9** |
| c2 | `infoPane.js` | 六维 = 行 `baseStatus` 的 `atk/mat/def/mdf/spd/hp`，标签**物攻/魔攻/物防/魔防/速度/体力**（顺序正本 = `Status.cs:12-24`）⇒ ⚠️ **不是** `content.normalStatusOf` 的 Lv100 值 | **DX9** 末行 |
| c3 | `dexPanel.js` / `infoPane.js` | **未选中 ⇒ 六行一律 `—`、页码 `1/88`**（绝不出现预制烘焙的 `39 - 44 cm` / 简介两遍 / `物攻 80`） | **DX9** 末条（报告 §13 末） |
| c4 | `dexPanel.js` | 展示台：选中 ⇒ `mountIdle(stage,{petId:row.id, swfId:read.swfIdOf(row.id), fallbackUrl:read.iconUrl(row.id)})`；台子常驻、换宠只换素材；覆盖 **489/788**，缺的自动静态头像 + 一行提示 | **DX10** |
| c5 | `index.js` + 装配层 + `_kit.js` | **叫声**（**DXQ6 = A**）：`playCry(petId)` = 就地 `<audio src="/projects/Seer2-Restart-Lite-main/Resources/BGM/pet/{petId}.mp3">`（⚠️ **根 = `Resources/` 镜像**、与头像 `Resources/Pets/icon` 同根，**不是** `Assets/Resources/`；【实测】该目录 3371 个文件、覆盖可见宠 **667/788**），**按 petId 不是 skinId**；缺素材 ⇒ **不响 + 一行 `logLine`**，**不许**播别人的声音。⇒ **本批在 `_kit.js` 加 `petCryUrl(petId)`**（唯一新增的 URL 常量，非 sprite）。⚠️ 编排线 `services/audio.js`（**ORB4-b**）落地时**回头替换这一处**，本份登记一条 TODO | **DX12** 行 1 + design §4 末"两套根"注 |
| c6 | `infoPane.js` | 「测」画出来（`PetStorage/Sprites/163.png`）但只弹提示（取背包既有文案 `bag.battleTestPending`）；「改」**不画** | **DX12** 行 2/3（修 **A14**） |

---

## 4. DX-d · 装配与接线（L4 `mapScene.js`，五处改动）

### 4.1 逐处清单

| # | 位置（现行号） | 改动 |
|---|---|---|
| d1 | `:39` import 段 | 加 `import * as DEXVIEW from '../view/dex/index.js'` + L1 三件的点名 import（`'../../logic/dex/{entries,own,predicates}.js'`） |
| d2 | `:254` `onDex: () => logLine('图鉴：重启原生面板待建')` | ⇒ **`onDex: () => openRestartDex()`**（HUD 钮 `restartHudView.js:81` 的 `handler:'onDex'` 已就位、**不改 HUD**） |
| d3 | 新函数 `openRestartDex()`（放在 `openRestartActivity` 旁，同一段风格） | ① 单例：`if (DEX) { DEX.update(); return }`；② 数据 = `CONTENT.restartAllPets()` + `restartTopicPetIds()`；③ `ownedIds = buildOwnedIds(petBag, petStorage)`（来自 `projectBagView(A.state)` `:340` 的 12+仓库投影，取每只的 `petId`）；④ `evolveTargetsOf = CONTENT.restartEvolveTargetsOf`；⑤ `onLink` ⇒ `handlePanelLink`（§4.3）；⑥ `showHint/askHint` ⇒ 现成 `openHintbox` |
| d4 | `:312-321` `ACT_UNBUILT` + `handleActivityLink` | **改名 `handlePanelLink`**（**DXQ4 = A**），调用点 = 活动面板 `onLink`（`:330`）+ 图鉴 `onLink`；⚠️ **同时往名单补两项 `'Fusion'`、`'Mission'`**（现名单没有它们 ⇒ 图鉴的 22+1 只会落到"未识别"而不是"待建"）；文案里"活动"改中性词（两条面板共用） |
| d5 | `game/app/ui.css` 末段 | `rb-dex-*`（DX-b §2.5；若 DX-b 已加则本批只补 §DX-c 新增类） |

### 4.2 投影细节（照抄用，别二次发明）

`projectBagView(st)`（`:340`，`PBAG_TEAM=6`、`PBAG_SIZE=12`）返回 `{ petBag: 长度12的数组(元素是宠对象或 null), petStorage: box.slice(6) }` ⇒ 已获得集合 =
`[...petBag, ...petStorage].filter(Boolean).map(p => Number(p.petId))`。
⚠️ `petStorage` 与 `petBag` 后 6 槽**是同一批对象的重复**（上游语义 = 前 6 进背包、其余也进仓库）⇒ 用 `Set` 去重即可，**不影响**"拥有与否"的判定。

### 4.3 跳转链路（只此一条 = DXI3）

`handlePanelLink(linkId)`：剥 `[...]` ⇒ 纯数字（含负）⇒ `runTeleport(Number(base))`（`:268`）；`WorldMap` ⇒ `openRestartWorldMap()`；`PetBag` ⇒ `openRestartPetBag()`；`ItemShop` ⇒ `openRestartShop()`；`ACT_UNBUILT.includes(base)` ⇒ `logLine('跳转终点面板待建: ' + base)`；其余 ⇒ `logLine('未识别的跳转: ' + raw)`。
⚠️ **面板先撤、再跳转**（照 `openRestartActivity` 的 `onLink` 写法：先 `DEX=null; api.close()`，再调 sink）。

### 4.4 明确**不做**（越界即回炉）

- **不加** NPC `openPanel PetDictionary[...]` 支（【实测】发行数据 `Resources/Data/Maps/` 出现 **0 次** = design **DX1** 第 1 条）。
- **不改** `game/logic/petbag/source.js` 的行为（`host='dictionary'` **照旧抛**；注释已在 2026-10-19 指向本份）。
- **不开**图鉴存档字段 / 战争迷雾（**DX0-b**、**DXQ3 = A**）。
- **不做**示例宠背包、测试对战、Mod 分支、PVP 禁选、工坊档（design §1、**DX3** 第 5 条、**DX12**、**VP7**）。

---

## 5. 施工顺序与"做完一眼看什么"

```
DX-a（桥 + 重生成 + content 三 getter + L1 三件）  →  DX-b（L3 骨架 + 格位表 + CSS）
   →  DX-c（信息区 + 展示台 + 叫声）  →  DX-d（mapScene 五处 + 分派器改名 + 名单补两项）
```

**每批落完自查（人肉 grep / 眼看，不新增脚本）**：
1. `grep -rn "game/logic" game/app/view/dex/` ⇒ **零命中**（DXI5）。
2. `grep -rn "document\|fetch" game/logic/dex/` ⇒ **零命中**（L1 纯）。
3. `grep -rn "capacity" game/app/view/dex/` ⇒ **零命中**（G1 陷阱）。
4. `game/data/unity/pets.json` 的改动**只来自重跑** `tools/build-unity-data.mjs`（`git diff --stat` 里它的变化应是"多了一个 `topicPetIds` 字段"，行数据不动）。
5. `grep -rn "restartEvolveOf" game/logic/dex/ game/app/view/dex/` ⇒ **零命中**（谓词不同，必须用原始链）。

**批间不停（四批是同一模块的施工顺序）**；**DX-d 落完即停**，交 §6 的"请人测"清单，等人类反馈（`AGENTS.md §1` 第 3 条）。

✅ **自查已跑（2026-10-19，DX-d 落完）**：第 1 / 2 / 3 / 5 条 grep **实码零命中**（第 1、3 条仅剩注释与 `createGrid` 传参处的自陈句，第 5 条只在**文档**里出现）；第 4 条 = `pets.json` 的 diff 只多一个 `topicPetIds` 字段、838 行逐条深等（重跑 `tools/build-unity-data.mjs` 生成，未手改产物）。**附加一条本份没列的核对**：全仓 grep `handleActivityLink` ⇒ **代码零残留**（活动 impl / 活动 design / 本报告三处旧名已改指 `handlePanelLink`）。

---

## 6. 请人测（交付时逐条回报；正本 = design **§5** 的 18 条）

**前置**：`#/map?slot=0&map=100` ⇒ 点 HUD 底栏**「图鉴」**钮。design §5 的 1–18 条**逐条**照测，其中**最容易翻车的五条**（我在交付回复里要点名）：

1. 第 **1** 条（未选中六行 = `—`、页码 `1/88`，不许出现烘焙假数据）；
2. 第 **4** 条（**第 88 页只有 5 格**；跳页输空/`abc` **什么都不动**；`999` 夹到末页）；
3. 第 **5** 条（角标**方向不对称**：拥有进化形 ⇒ 祖先一起亮；只拥有初始形 ⇒ 进化形不亮 = **A8 原样**）；
4. 第 **11** 条（**零写盘**：开完图鉴存档文件一字不变）；
5. 第 **12** 条（**两块面板抢一台 Ruffle 播放器** ⇒ 背包台子允许降级成静态头像，但不许报错 / 白屏）。

---

## 7. as-built（2026-10-19 · DX-a→DX-d 落码后回填；本表是"改判的根据"）

> 约定：条目号 **DXB1–**；与 design 冲突的**同时修订 design 与本份**，并在 `docs/status.md` 记一行。

| # | 实际落成 | 与计划之差（**如实登记，不追认成"本来就这样"**） |
|---|---|---|
| **DXB1** | `DEX_PAGE_SIZE = 9` 住在 **L1** `game/logic/dex/entries.js`，经 `opts.logic` 注入 | §2.1 文件表把这一格挂在 `view/dex/cells.js`，而 §1.3 / §8 R1 说它是 **L1 导出** ⇒ **impl 自己两处打架**（且 §2.1 那格还把 `createGrid` 也列进 `logic`）。落成取 L1：页大小是 grid 的**逻辑参数**，`cells.js` 只交**格位表**（纯 DOM 度量） |
| **DXB2** | `opts.ownedIds` = **取集合的函数**（面板每次现算），不是 L4 算好的 `Set` | §4.1 d3 写"投影成 `ownedPetIds`"（一个静态集合）⇒ 那样**翻页/重开时角标不会跟着袋子变**（design §5 第 5 条测不出来）。改成 getter 后：换页 / 换筛选 / 换排序 / 换档 / `update()` 五处把 `haveCache` 作废（DX4.5 的"只在换页时重算"仍在） |
| **DXB3** | `sorterOf('normal')` **返回 `null`**（= 不挂比较器） | §1.3 只说"一般 = 默认序"。若给 `normal` 也造一个 defaultId 升序比较器，**最新精灵档（Topic）的 8 只 XML 顺序就被重排**（Topic 的真值 = 照 `resources.xml` 出现顺序）⇒ 默认序交给 `buildDexEntries`（All 档排好、Topic 档不排） |
| **DXB4** | 选中态 = **换框**，照 design **DX5 第 3 条**（`OldPetBag/Sprites/87.png` 选中 / `85.png` 未选，两张实测盘上都有）；格内头像按 prefab 的**内层 −10×−10** 缩进（`inset:10px`） | 无偏差。⚠️ 但**本份 §2 原来没写这一步**（§2.1/§2.3 只说"9 格 + 格位表"）⇒ 补一句 as-built：CSS 侧不再有黄边描边，"高亮"完全是素材语言（人测第 2 条要看的就是换框跟不跟手） |
| **DXB5** | 格子内容 = 头像 + **序号文字**（底部）+ `have` 角标；**名字挂 `title`**（hover） | prefab 里另有一条 `160×25` 文本条（报告 §5）⇒ 我们把它**用作序号**（上游格内文本到底写什么，报告未证实）。这是**我方解释**，不是实测的照搬；人测若发现格内该写名字 ⇒ 按 §7 改判 |
| **DXB6** | ✕ 那颗 = `Green Esc.png`，走**面板自带的 `HINTBOX` 根**（`Assets/Resources/Sprites/Game/Hint Box`） | **本份 §2 没规定 ✕ 用哪张图**（只在 §2.1 列了"标题 + ✕"）⇒ 落成补上素材，且**不能**用 `panelSprite`（它的根 = `Panels/`，这张不在那儿；实测 `hintbox.js:7` 与 minimap 各有一条自己的根） |
| **DXB7** | `read` 读数袋（`nameOf/iconUrl/elementName/swfIdOf/haveOf/noOf`）由 **`view/dex/index.js` 本地组装**；`opts` 收窄成 `rows / topicIds / ownedIds() / evolveTargetsOf / logic / onLink / onClose / showHint / onNote` | §2.1 的 `opts` 形状把 `read: {…}`（连 `panelSprite/mapSprite/mountImg` 这些 `_kit` helper）和 `playCry`、`askHint` 都列成**装配层注入**⇒ 不必：`_kit` 本来就是 L3，L3 之间直接 import（§2.1 底下那句"不要把它们搬进 L1"就是这个意思）；叫声只有面板自己用 ⇒ 收进面板。**L4 的注入面少 4 格** |
| **DXB8** | 叫声 `playCry` 住 **L3** `index.js`（就地一个 `<audio>` + `onerror` 与 `play().catch` 各回一行 `opts.onNote`） | 与 §3 c5 计划一致；⚠️ **临时灯**照登：**ORB4-b**（`game/app/services/audio.js`）落地时替换这一处（代码里有 TODO 注释锚点，§8 R6） |
| **DXB9** | 换档（All↔Topic）= **重建 `entries` + 重建 grid**（不是调 `resetFilters()`） | §2.2 表"筛选"行写「换页签 ⇒ `resetFilters()` + `setPage(0)` + `select(0)`」⇒ 只复位不够：换档**行集本体**就变了（788 ↔ 8），旧 grid 里包的是旧数组引用。落成口径 = 换档后**页码 / 游标 / 筛选 / 排序四项全清**（DX6、修 A5 的结果与计划一致，手段不同） |
| **DXB10** | `onPick` 走 `render()`（重画 9 格 + 右栏），**不是只刷右栏** | design **DX9** `:158` 写"一次点击只刷这两块（右栏 + 台子）"⇒ 那样**换框不跟手**（选中态由 `grid.cursor()` 决定，只有重画格子才移动）。**"不重算角标"仍成立**：`select()` 不动 `haveCache`。格子重画 = 9 个 DOM，代价可忽略；**台子不受影响**（`mountIdle` 同 stage 同 petId 早退，不重建 Ruffle 播放器） |
| **DXB11** | 计数行 = `共 N 只` / 谓词生效时换 `筛出 N 只`，数字在 `index.js` 的 `ctx.countText()` 里算（视图零算数） | 计划只说"顶栏要有计数"；**上游这一格没接线**（报告 §13 A4）⇒ 我方让它真说话，并把"筛选中"换词（**我方加法**） |
| **DXB12** | 分派器改名落地 = `handlePanelLink`，`ACT_UNBUILT` 同时补 `'Fusion'`、`'Mission'`，日志文案改中性（`无跳转入口 / 跳转 → 地图 N / 跳转终点面板待建: X / 未识别的跳转: raw`） | 与 §4.1 d4 一致；⚠️ **文档同步**：活动线两份文档（`docs/view/panel/activity/activity-impl.md` `:27/:34/:56`、`activity-design.md:85`）里的旧名 `handleActivityLink` 已一并改指新名 |
| **DXB13** | 未选中态 = `（未选中）` + 六行 `—` + 六维 `—`；`feature`/`habitat`/`description` 空值也走 `—` | 与 §3 c1 一致（**零烘焙假默认值** = design DX9 末条、人测第 1 条的判据） |
| **DXB14** | 面板壳 = `.rb-dex` **正居中**（`left:100px / top:30px`，760×480），CSS 在 `ui.css` 末段（`:860` 起，858 → 942 行） | 与 design **DX2** 一致：上游 `anchoredPosition(50,0)` 的右偏**刻意不照搬**（那条已记在 design 里，本份只链接不重复） |
| **DXB15** | **关面板只有 ✕ 与遮罩两条路**；`mount` 的 `unmount` 里把 `DEX_PANEL` 与其余面板引用一起作废（`mapScene.js:1770`） | design **§5 第 17 条**原句写了"✕ / 遮罩 / **ESC** 三种都关得掉"⇒ **落码核对：本仓没有任何面板接 ESC**（grep `keydown`/`Esc` = 只有图鉴自己的两个输入框吃 Enter）⇒ 已把 §5 第 17 条订正成"两种 + ESC 明确不做"。**要 ESC ⇒ 先立全局面板键位（A2 面板栈），不由单面板私开** |

---

## 8. 风险登记（动手前就知道的坑）

| # | 风险 | 处置 |
|---|---|---|
| **R1** | `createGrid` 的 `PAGE_SIZE` 常量 = **6**（`constants.js:8`，背包用）⇒ 图鉴 **9** 必须**显式传 `pageSize: 9`**，漏传就是"6 格/页、132 页" | §1.3 的 L1 导出 `DEX_PAGE_SIZE = 9` 由装配层注入，视图不硬写 |
| **R2** | `ACT_UNBUILT` 现名单**没有 `Fusion`/`Mission`** ⇒ 不补两项的话图鉴 23 只的分布钮点了只说"未识别" | **d4** 明写补两项（同时改活动面板文案为中性） |
| **R3** | 桥 emit 形状改动 = **生成物 diff**（838 行数据若因脚本细节漂移而变化 = 回归风险） | 重跑后**只看 `_version`/新字段**、抽查 3 条行数据不变（迪兰 id 1 / 埃鲁 220 / 昭华 459）；不手改产物 |
| **R4** | `idleStage.js` 的模块级单槽 ⇒ 与背包抢播放器 | 已知、不修（design **DX1** 第 5 条）；登记为人手测第 12 条 |
| **R5** | 展示台覆盖 62%、叫声覆盖 85% ⇒ 玩家可能以为"缺功能" | 降级文案现成（`idleStage`）+ 缺音一行日志；文档已把覆盖率写进 design **§2 / DX10 / DX12** |
| **R6** | 音频服务 **ORB4-b** 未落码 ⇒ 本批就地 `<audio>` 是**临时灯** | 代码注释标 TODO + 本份 §3 c5 登记（替换时回炉本份） |
| **R7** | 9 格坐标吃的是**上游左上原点**的偏移 ⇒ 换算成 CSS 时容易整体偏 15/35px | 按 §2.3 的规律式实现 + `AGENTS.md §4.10` 人眼校（误差人类接受，不追求像素级） |

---

## 9. 文档同步（与本模块同批做完，不许只改代码）

**正本 = `dex-design.md §9` 的 6 条清单**（VP5 反转记账 + 一致性）。执行状态（2026-10-19）：

| 条 | 目标文档 | 状态 |
|---|---|---|
| 1 | `docs/view/panel/view-panels-pet.md`（`§1.2` `dictionary` 行 / `§1.3` `PetDictionary` 行 / `§3` 内容桥行 / `§5.1` **S5** / `§10` 缺口行 / `§11` **VP5** / `§12` 第 15 条 / `§13` 末句） | ✅ **已全部改写为"VP5 于 2026-10-19 被点名反转"**（只反转**图鉴面板**这一格，`host='dictionary'` 支仍不做） |
| 2 | `docs/arch-docs.md §0.1`（树 + "七份→八份" + A 编号纪律） | ✅ 已登记（impl 落码后**在本目录格内补一行** `dex-impl.md`） |
| 3 | `docs/external-refs.md §3` 台账 A（`seer2-pet-preview/` 行 `:45`） | ✅ 已改写（VP5 反转 + 装载口径指针） |
| 4 | `docs/view/view-design.md §8` C1 行 | ✅ 已加"第三份 = `panel/dex/`" |
| 5 | `docs/status.md` | ✅ **已写**（View 行改为"四批已落码 · 停点 = 等人手测"、§2 **待拍板里的 dex 那条已删**、请人测清单新增一条带 ①④⑤⑪⑫ 五条重点） |
| 6 | `game/logic/petbag/source.js` 的注释（行为不变、仍抛） | ✅ 已改指向本份（`DX0-d`） |
| 7 | **本份新增**：`dex-design.md §8 DX11`/`§4 桥行`/`§2` 三句在写 impl 时被实测订正（**`ACT_UNBUILT` 缺 `Fusion`/`Mission`**、**`<topicPetId>` 是单数元素**、**788 的具名终点实测 = `Fusion 22 / SoulPet 10 / WorldMap 6 / SignReward 5 / Mission 1`**） | ✅ 已同步进 design（引用编号不变，避免报告与设计两套号） |
| 8 | **本份新增（DX-d 的改名尾巴）**：分派器 `handleActivityLink` → `handlePanelLink` ⇒ **邻线文档三处**（`activity-impl.md` `:27`/`:34`/ACD3、`activity-design.md:85`、本报告 `:7`/`:309`）+ **`docs/arch-docs.md §0.1` dex 行**（"待评审/未施工"→"已落码"）+ **`dex-design.md §5 DX9` 那句"只刷右栏"**（订正 = **DXB10**） | ✅ 已改；全仓 grep `handleActivityLink` ⇒ 代码零残留（余下命中全是"旧名"注记） |

> ⚠️ 核对方式 = **人肉逐条 grep**（`AGENTS.md §2`：不写 linkcheck 脚本）；核对完在 `docs/status.md` 记一行"旧口径零残留"。
