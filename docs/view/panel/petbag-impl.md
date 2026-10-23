# 重启精灵背包/仓库面板 · 实现文档（C1 配对 impl）

> 上游设计 = **`docs/view/panel/view-panels-pet.md`（C1）**（设计已定稿 · **VP1–VP8 全部拍板 2026-10-17**）。
> 本文把 C1 落成**逐文件、逐函数、逐类名、逐坐标**的施工图；**两者冲突**：口径（目标行为/编号/边界）以 C1 为准，**具体做法与坐标**以本文为准。
> **本份的成色 = 设计态施工图 + 本轮 as-built（2026-10-17）**：`game/app/view/petbag/**`（12 文件）与 `game/logic/petbag/**`（4 文件 + 3 单测，30 条）**本轮已落地**（阶段二·本模块；过渡件 `restartPetBagView.js` 已删；idle 台已由静态占位升级为**真 Flash 动画** `idleStage.js`，版式三修）；**但** `game/logic/save/repository.js` 与 R4/R5 接缝**仍未落地** ⇒ 装配处仍走 v3 stub（§11）⇒ §12「as-built」**已按现状回填**，与 §1–§11 的目标态并列，**冲突以 §12 为准**。
> **不在本文重述**：目标行为/不照搬清单（C1 §2.2、§6）、上游 bug 逐条证据（`docs/view/panel/petbag/restart-petbag-panel.md §8` A1–A16）、面板入栈机制（`docs/view/mech/view-panel-stack.md` A2）、浮层原语（`docs/view/mech/view-overlays.md` A3）、存档字段形状（`docs/save/save-design.md`/`save-xml-spec.md`）、`Pet`/内容表（D6/D7）。本文**只写怎么落地**。
> **路径口径**：我们的路径相对仓库根；上游相对 `projects/Seer2-Restart-Lite-main/Assets/`。
> **编号纪律**：本文引用 C1 的本地号写 `C1 §11 VPn`、分析报告的号写 `restart-petbag-panel.md §8 A<n>`；施工步用 **B1–Bn**、文件用 **F1–Fn**（本文本地），**不许**借用圆圈数字 ①–⑧（那是 `AGENTS.md §5` 的人类决议）。

**表 0 · C1 §13 的八条 impl 义务 ↔ 本文节号**

| C1 §13 义务 | 本文节号 |
|---|---|
| ① §4.3 目录搬家 `panels/restartPetBagView.js` → `view/petbag/**` | §1、§10 |
| ② v3 `team/box` → `petBag[12]/petStorage` 的**迁移与兼容** | **§2（更正：无迁移，见下）** |
| ③ `game/logic/petbag/{source,grid,actions}.js` 签名与单测 | §3 |
| ④ R4/R5 接上第一个消费者 | §7 |
| ⑤ as-built 偏差（`docs/arch-docs.md §5`） | §12 |
| ⑥ §4.1 分区表的**逐区像素** | §5 |
| ⑦ A2 同名去重（VP3）的落地与 `host.js` 改造 | §6 |
| ⑧ record 偏移换算放 Save 线（VP6，View 只认百分比） | §8 |

---

## 0. 铁律（实现期逐条自检）

1. **面板零算数**：`game/app/view/petbag/**` 里**不得**出现 `hp/`、`maxHp`、`slice(`、`sort(` 之类的数值/集合运算；血条只许 `style.width = f(比例)`，比例由 L1 注入（C1 §9 V-2）。
2. **L1 无 DOM、无 fetch、无存档知识**：`game/logic/petbag/**` 不得 import `game/core/`、`game/app/`，不得出现 `document`、`localStorage`（C1 §9 V-1/V-3）。
3. **写盘只在动作返回值里**：View 内 `grep requestSave` 计数 **0**；L1 `actions.js` 返回 `write:'bag'|null`，**装配层（mapScene）执行** `requestSave`（C1 §9 V-5、决议 ③）。
4. **不建死按钮**：`Follow`、`Train`、`Lock/UnLock` 三个在 `game/**` 里**应当 0 命中**（C1 §9 V-4、§10、A6/A10）。
5. **存档单一入口**：背包经 `repository` 拿 `petBag/petStorage`，**绝不直接碰 `localStorage`**（C1 §7.3、`docs/arch-code.md §3` #5）。
6. **表只经 L2 出口**：View 读名字/元素/技能/进化一律走 `game/app/content.js`（唯一允许的跨层 import，C1 §9 图 + `docs/arch-code.md §3` #4）；L1 需要表数据 ⇒ 由装配层**注入 `describePet`**，L1 **不 import content**。
7. **过渡件是终点不是起点**：现 `game/app/view/panels/restartPetBagView.js` 是 U4 过渡件（C1 §3、`docs/view/ui-handoff.md` D1）⇒ 搬家完成后**删除**，不留兼容壳。**（本轮已删，见 §12 as-built。）**
8. 非 git 仓库 ⇒ 动任何在盘文件前先备份到 `/tmp/petbag-bak/`。

---

## 1. 变更文件清单（F1–F9）

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| F1 | `game/logic/petbag/constants.js` | **新建** | `BAG_SIZE=12 · TEAM_SIZE=6 · PAGE_SIZE=6`（C1 §5.3；权威 = `docs/save/save-design.md §7`）+ 空槽常量 `EMPTY = null` |
| F2 | `game/logic/petbag/source.js` | **新建** | `createPetBagSource({host,bag,storage,persist})` —— 单一真值代替三份 `switch`（C1 §5.1，解 A5） |
| F3 | `game/logic/petbag/grid.js` | **新建** | `createGrid({capacity,items,pageSize,pageMode})` —— 分页/游标/筛选/排序/换位/删格退页（C1 §5.2 G1–G8） |
| F4 | `game/logic/petbag/actions.js` | **新建** | 九件背包 + 仓库四件，每个返回 `{ok,nextBag,write,hint}`（C1 §6.1） |
| F5 | `game/app/view/petbag/**`（12 文件） | **新建** | 见 §4 逐文件；`index.js/bagPanel/storagePanel/gridView/cellView/displayPane/idleStage/detailPane/itemPane/filterBar/sortBar/personalityPane` |
| F6 | `game/app/view/panels/host.js` | **改造**（或随 A2 搬家落 `view/panelstack/`） | `openPanel` 加**同名去重**（VP3）；见 §6 |
| F7 | `game/app/ui.css` | **续段 + 启用新前缀** | `rbp-*` 续名（现 `:310-353` 只覆盖过渡件）+ **启用 `rbs-*`（仓库）、`rbg-*`（网格外壳）**（C1 §4.2，两者【实测】0 命中 ⇒ 本份启用）；**删**过渡件专用且搬家后无人复用的 `rbp-*` 声明（保留 `.rbh-spacer`，`docs/view/scene/room/view-scene-hud-impl.md` F4 同理） |
| F8 | `game/app/scenes/mapScene.js` | **改重启分支接线** | `openRestartPetBag` 改指向 `view/petbag/index.js` 的 `openPetBag(A,opts)`；装配 `describePet` 注入 + `requestSave`/`showHint` sink 挂接（§7）；**as3 分支 / `pushHud` / `togglePetBag` 逐字节不动** |
| F9 | `game/app/view/panels/restartPetBagView.js` | **删除**（**本轮已删**） | 过渡件退役；`restartItemBagView.js` 本份**不动**（道具线 T2·5 的账） |

**新增测试**：`game/logic/petbag/{source,grid,actions}.test.js`（§3.4，`node --test`）。
**三层 IA 正本** = `docs/view/panel/petbag/petbag-panel-desc.md`（人类实测）⇒ 外壳按 ① 标题层 / ② 内容层（左显示区 + 右信息区）/ ③ 队伍区分区（§4/§5）。
**操作列 = 8 钮**（首发/出战/恢复/动画/加成/入库/仓库/道具）：`动画`=`Follow`→`SetPetAnim` 语义、`加成`=`Train`→`SetPetTrain` 语义（C1 §4.1 更正 1/2）；**改性格**在基础信息里、**一键换队**在队伍区「刷新」。
⚠️ **本份如实登记两处占位**（C1 §8）：HUD 的**特性/性别/纹章/个体值**画「—」、**抗性页签空置 + 道具网格空壳**。
⚠️ **idle 动画台 2026-10-17 手测后改判为「真动画」**（C1 §4.1 更正 3）：装载原版 `swf/fight/{swfId}.swf`（`petContainer.root.swf` + Ruffle，**与战斗舞台同一条桥**）；**无 Ruffle / 素材 404 才**降级静态 PNG。新增 `idleStage.js`。

---

## 2. 数据源搬家：`team/box` → `petBag[12]/petStorage`

### 2.1 更正 C1 §13②（一条跨线冲突，先摆平）

C1 §13② 把本份写成「v3 `team/box` → `petBag[12]/petStorage` 的**迁移与兼容**」。**这与 Save 线的已决冲突**：
`docs/save/save-impl.md §6` 拍板 —— **`game/logic/restartSession.js`（v3）直接删除、不做 v3→XML 迁移**（本轮**冷启动即新建 XML 档**，无存量档要迁，故不设 `migrate` 模块）。

⇒ **本份按 Save 线为准**（`docs/arch-docs.md §1`：冲突以更细/更专者为准，存档形状归 Save 线）：

- **View 侧没有"迁移代码"这回事**。要做的不是把 `team/box` 搬进 `petBag/petStorage`，而是
  **把面板的数据源从 `A.state.team` / `A.state.box` 换成 `repository` 交出的 `petBag[12]`（定长、空槽 `null`）与 `petStorage`（List）**，
  并删掉对 `restartSession` 的 `swapTeamBox/releasePet/TEAM_MAX/BOX_MAX` 依赖（`game/logic/restartSession.js:8-9,73-88`）。
- 兼容 = **不需要**（无旧档）。冷启动首档形状见 `docs/save/save-design.md §7`：`petBag[0..5]` 六只初始宠（id `1,4,7,10001,10004,10007` @Lv10）+ `[6..11]` 六槽 `null`、`petStorage` 空。
- ⚠️ **形状差异要点**：v3 `team`/`box` 是**两个变长数组**（team 上限 6、box 上限 240）；上游是**一个定长 12（前 6 应战 / 后 6 候选）+ 一个无限仓库**。
  定长 ⇒ 换位/入队/入库全是**下标交换**（`petBag[i]↔petBag[j]`，空槽是合法下标），不是 v3 的 push/splice。grid 的 `capacity=BAG_SIZE=12`、`pageSize=PAGE_SIZE=6`，**灌入长度≠12 ⇒ 抛**（G1，不 `Array.Resize`）。

### 2.2 面板读写的对象（目标态）

```
repository.load()  → GameData { petBag:Pet[12], petStorage:Pet[], trainer{coins,diamonds}, … }
        │
        ├─ host='normal' 的 source：bag=petBag(引用) storage=petStorage persist='repository'
        ├─ 写：actions 返回 nextBag/nextStorage（就地改引用本身，S4）+ write:'bag'
        └─ 落盘：装配层收到 write:'bag' → requestSave('bag')（R4，见 §7）；面板不碰 repository/storage/localStorage
```

**满 12 溢出进仓库不在本份**（VP8 已决 ⇒ `docs/save/save-design.md §7`，由 Save 线获得/写入入口执行；`Pet.cs:148-157` 是真值来源）。背包面板只做**已有 `petBag`/`petStorage` 之间的搬动**。

---

## 3. L1 · `game/logic/petbag/**` 的签名与单测

> 全部**纯函数/纯对象**、零 DOM 零 fetch（铁律 2）。表数据（名字/元素/星级/进化）经装配层注入的 `describePet(pet)` 取，L1 **不 import content**（铁律 6）。

### 3.1 `source.js`

```js
export function createPetBagSource({ host, bag, storage, persist, describePet })
  → {
      host(),                 // 'normal'|'pvp'|'dictionary'|'yiterogue'|'door'|'story'
      bag(), storage(),       // 数组引用（只读透传；写回经 actions）
      canPersist(),         // persist === 'repository'  ⇒ 唯一决定"能不能写盘"（S2，修 A1）
      readOnly(),           // door/story/dictionary ⇒ true
      setBag(next),         // host 给定候选后灌数据（S3：构造必须给 host，事后只 setBag，无 SetMode）
      describePet,          // 注入的取表器（L1 不碰 content）
    }
```
- **S5**：`host==='dictionary'` 的**接口位保留**在联合类型里，但**本代不实现**（VP5）——构造时传 `'dictionary'` 应抛 `NotImplemented`，而不是静默返回空。

### 3.2 `grid.js`

```js
export function createGrid({ capacity, items, pageSize, pageMode = 'NewPage' })
  → {
      items(), page(), pageCount(), cursor(), selectedItem(),
      select(i), setFilter(fn), setSorter(fn), resetFilters(),
      swap(from, to), remove(i), setPage(n), next(), prev(), refresh(),
    }
```
| 不变量（C1 §5.2） | 落地要点 |
|---|---|
| **G1** | `items.length !== capacity` ⇒ 构造即 `throw`；全程不 resize（解 A7） |
| **G2** | `cursor` 是**页内下标**；全局下标 = `page*pageSize + cursor`，**只在内部换算**，对外只经 `selectedItem()` 给对象（解 A4：不提供 `petBag[cursor]` 那种混用属性） |
| **G3** | 视图序列 = `sorter` **先**、`filter` **后**（顺序固定，否则分页边界抖） |
| **G4** | 再点同一格**不取消**选中（`select(i)` 幂等置位；详情区恒有内容） |
| **G5** | 翻页**不清**选中；选中被筛掉才回落 `select(0)` |
| **G6** | `remove(i)` 后若 `count % pageSize === 1` ⇒ `refresh()` 退一页（照搬 `SelectModel.cs:137-141`） |
| **G7** | `swap` 两端任一为 `null` ⇒ no-op（空格不许拖，`PetSelectModel.cs:31-37`） |
| **G8** | 末页空槽照画（不压缩，否则换位下标漂） |
| `pageMode` | **只实现 `NewPage`**（背包只用它，`Pet Bag Storage.prefab:419-421`）；`Indent/Scroll` 不建分支（C1 §10） |

### 3.3 `actions.js`

```js
// 每个动作：纯函数，返回新状态 + 是否写盘 + 该弹什么
action(source, grid, args) → { ok, nextBag?, nextStorage?, write: 'bag'|null, hint?: {key,args,level} }
```
| 导出 | 对应操作 | 门/规则要点（目标行为见 C1 §6.1，此处只写"代码怎么写才不踩 bug"） |
|---|---|---|
| `swapCells` | 1 换位 | 下标交换；`write = source.canPersist() ? 'bag' : null`（解 A1 的条件写盘） |
| `setFirst` | 2 设为首发 | **挪到全局 0 位**（`swap(globalCursor, 0)`），不是页内 0（修 C1 §6.1②；上游手感待手测） |
| `deploy` | 3 上阵 | 空位 = `petBag.slice(0,TEAM_SIZE).indexOf(null)`；满 ⇒ 返回 `hint:{key:'bag.pickReplace'}`（走 R5 `askHint` 选一只换），不静默失败 |
| `swapTeam` | 4 一键换队 | 前 6 ↔ 后 6，规模取 `constants.js`（不写死 6）；备用区全空 ⇒ `hint:'bag.teamEmpty'` |
| `heal` | 5 恢复体力 | 恢复**整个 `petBag[12]`**（解 A2：不是当前页）；文案 `bag.healAll` 与范围一致 |
| `store` | 7 入库 | 保护判据 = **`petBag` 全长非空计数 > 1**（解 A3：不是本页筛选后计数）；成功后该页尾格补 `null` |
| `personality` | 8 改性格 | `host∈{pvp,dictionary}` ⇒ `write:null`（照搬上游"这两路不落盘"，它是对的）；其余按 canPersist |
| `takeOut` | R1 取出 | 门 = **`petBag` 有任意空槽（看全 12）**，与背包侧"上阵只看前 6"是两条规则（照搬，不合并） |
| `takeSwap` | R2 交换取出 | 满位 ⇒ `hint:'storage.pickReplace'`（R5）；**不动预览动画**（上游关了没开回来，C1 §5 行 2 注） |
| `release` | R3 放生 | **门在 L1**：`host==='normal'` 且 `record.elite !== true` 才 `ok`（解 A13；View 灰化只是表现） |
| `favorite` | R4 收藏 | 只写 `record` 的**一个键** `elite`（不是容器）⇒ 键清单/落盘形状归 Save 线 + D7，本份只 `nextBag` 里带上改过的 `record` |

⚠️ **不导出**：`train`（锻炼，A10 死链）、`lock`/`unlock`（A6 写反）—— 名字在 `game/**` 应当 0 命中（V-4）。

### 3.4 单测（`node --test game/logic/petbag/`）

纯逻辑 ⇒ 完全可 node 测，是本份**唯一"可比"的自动化验收**（决议 ⑦ 下它只兜"逻辑没写错"，不代替 **C1 §12 的 21 项**人手测（那 21 项问"我们拍板后的目标行为对不对"，与 `docs/view/panel/petbag/restart-petbag-panel.md §9` 的 13 项上游确认是两份表））：

- `source.test.js`：`canPersist()` 只在 `persist='repository'` 为真；`'dictionary'` 抛 `NotImplemented`；`setBag` 不改 host。
- `grid.test.js`：G1（长度≠capacity 抛）· G2（页内/全局换算，`selectedItem` 给对象）· G3（sorter 先 filter 后，构造一组"排序前/筛选后顺序不同"的用例钉住）· G4（重点不取消）· G5（翻页保选中，被筛掉才回落 0）· G6（`count%6==1` 退页）· G7（拖空格 no-op）· G8（末页空槽照画）。
- `actions.test.js`：A2（heal 覆盖 12 格）· A3（筛到剩 1 只仍可 store）· A13（`elite=true` 时 release `ok:false`，绕过 UI 直调也被拦）· 上阵满位返回 `pickReplace` hint 而非静默 · `write` 随 `canPersist()`（pvp 路一切动作 `write:null`）。

---

## 4. L3 · `game/app/view/petbag/**` 的 DOM 与类名

> 只画 DOM、只发意图事件（C1 §7.1）。**三层 IA 的正本 = `docs/view/panel/petbag/petbag-panel-desc.md`**（人类实测）；坐标 = §5。
> 类名前缀见 C1 §4.2：`rbp-*` 背包（其中 `.rbp-item-*` = 精灵道具面板）、`rbs-*` 仓库、`rbg-*` 网格构件（背包/仓库共用）、`rbp-pers-*` 性格层。

```
create(container, A, opts)         ← index.js（mapScene 装配入口）
  │  opts = { host='normal', petBag, petStorage, describePet, hudOf?, buffsOf?,
  │           onWrite, showHint, askHint, onClose }（装配层注入；面板不认识 repository/localStorage）
  ▼
openPanel('rb-petbag', build, {scrim:true})      ← A2 panelstack；同名去重见 §6
```

**外壳（bagPanel.js）** —— ① 标题层 / ② 内容层（左显示区 ｜ 右信息区）/ ③ 队伍区：

```
.rbp-box
├─ .rbp-head                ① 标题层：.rbp-money(左) ｜ .rbp-title「精灵背包」(居中) ｜ .rbp-close ❌(右)
├─ .rbp-main                ② 内容层（左右）
│  ├─ .rbp-display          左 · 显示区（可换内容）
│  │  ├─ .rbp-stage            idle 动画台（**跨 render 常驻壳**：真 Ruffle 播放器 `ruffle-player` 住这；无 Ruffle/素材 ⇒ 静态 PNG + .rbp-stage-note）
│  │  ├─ .rbp-demo             默认精灵面板（HUD 部分）
│  │  │  ├─ .rbp-hud            HUD 六项：属性/名称/特性/性别/纹章/个体值（.rbp-hud-item > .rbp-hud-k + .rbp-hud-v）
│  │  │  └─ .rbp-hud-acts       皮肤 / 测试对战（.rbp-hud-btn ×2，只发提示）
│  │  └─ .rbp-buff             加成面板（先天加成 + 后天加成，各 .rbp-buff-sec > .rbp-buff-list）
│  └─ .rbp-info             右 · 信息区（左右）
│     ├─ .rbp-acts            操作列 8 钮（.rbp-act：首发/出战/恢复/动画/加成/入库/仓库/道具）
│     └─ .rbp-ipanel          信息面板（可换内容）
│        ├─ .rbp-tabs           页签 基础 / 技能 / 抗性（.rbp-tab）
│        ├─ .rbp-basic          基础信息子面板 = 左 .rbp-binfo（.rbp-brow ×8 + .rbp-kizuna）
│        │                                            + 右 .rbp-stats（.rbp-stat 六维 + .rbp-pers-adj 性格加成 + .rbp-ev 分配学习力）
│        ├─ .rbp-skill          技能信息子面板（.rbp-skills 4 常规 + 必杀；.rbp-skill-acts = 调整技能/隐藏技能）
│        ├─ .rbp-resist         抗性信息子面板（**空置占位**）
│        └─ .rbp-item-*         精灵道具面板（道具钮切出）：.rbp-item-tabs（全部/培养/纹章/战斗/其他）
│                                + .rbp-item-grid（3 行 6 列 = 18 个 .rbp-item-cell）+ .rbp-item-pend
├─ .rbp-team                ③ 队伍区：.rbg-pagebtn ◀ ｜ .rbg-cells > .rbg-cell ×6 ｜ .rbg-pagebtn ▶ ｜ .rbp-team-refresh「刷新」
│  └─ .rbg-cell（×6）          一格 = .rbg-bg[ .rbg-frame > .rbg-mask > .rbg-icon ]（**头像构成背景图**，撑满整格）
│                              + .rbg-elem（元素点）+ .rbg-mark（首发，条件）+ .rbg-strip[ .rbg-lv + .rbg-hp ]（**底部信息条：等级 + 血条**）
│                              （空槽 = .rbg-cell--empty 只画边框，不画上面这些；名字退为整格 `title`）
├─ .rbp-note                提示行
```

- **一格（cellView.js）** 版式（**人类 2026-10-17 二轮实测** = desc 1.3 补「头像构成背景图 / 底部信息条：等级 / 底部信息条：血条」⇒ C1 §4.1 更正 5）：
  · **背景层 `.rbg-bg`**（`position:absolute; inset:0`，撑满整格）= 三层素材顺序 `frame`（头像框）→ `mask`（遮罩）→ `icon`（本地 PNG `Resources/Pets/icon/{petId}.png`，C1 §8；SWF 路线作废）。
  · **底部信息条 `.rbg-strip`**（高 `17px`、底半透明渐变，`z-index:2`）= `lv`（`.rbg-lv`，`Lv<n>`）+ `hp`（`.rbg-hp`，**弹性宽度**，填充按 `m.hpFrac` 走**百分比** —— `_kit.barFlex`）。
  · **角标** = `elem`（元素点）+ `mark`（新获得/首发）。**名字不再常驻格内** ⇒ 整格 `title`（hover）；旧 `.rbg-name` 已删。
  · 血条分母 0 ⇒ `width:0`（**不出现 NaN**，修 A15）。 · `frame/mask` 尺寸偏移读的是**百分比**（`1.0` 原尺寸），见 §8（VP6）。 · **不画 `ban/pick` 禁选角标**（VP7）。
  · ⚠️ `.rbg-cell` 由**队伍区与仓库共用** ⇒ 两处同构；`.rbg-hp` 的弹性百分比用 `cellView.js` 内的局部 `hpBar()`（**刻意不往共享 `_kit.js` 加新导出**，理由见 §12.3 缓存坑），`bar()` 的 px 口径未动（地图 HUD / 详情血条逐像素不变）。
- **显示区（displayPane.js + idleStage.js）**：`displayMode ∈ {demo, buff}`（由操作列「加成」钮切）。
  ⚠️ `.rbp-display` 的三兄弟 `[.rbp-stage | .rbp-demo | .rbp-buff]` 里 **`.rbp-stage` 壳跨 render 常驻**（Ruffle 播放器**一脱离 DOM 即销毁**，实测 ⇒ 不能每次 render 重建），每次 render 只重建 demo/buff 的**内部**。
  · `demo` = `.rbp-stage`（**真 idle 动画**，`idleStage.js` 装载原版 `swf/fight/{swfId}.swf`，口径同 `restartFighterStage.js`；**无 Ruffle/素材 ⇒ 静态 PNG + 提示**）+ `.rbp-hud` 六项（**特性/性别/纹章/个体值拿不到 ⇒ 画「—」**，不伪造）+ `.rbp-hud-acts` 的「皮肤/测试对战」（**只发提示**，§11）。
  · `buff` = 先天加成 + 后天加成两段；数据经装配层注入的 `buffsOf(pet)`，**无数据即空态**（D2/D4 待接）。
- **idle 动画台（idleStage.js）**：`mountIdle(stage,{petId,swfId,fallbackUrl})` / `clearIdle()` / `cycleIdleState()`。
  装载 = `/game/petContainer.root.swf?url=/swf/fight/{swfId}.swf&scale=showAll&scaleX/Y=1.9` + `petRenderCallbacksReady` 握手（超时 8s ⇒ 降级）；
  就绪后 `setOffset(宽/2, 高×0.46)` 摆位（`ResizeObserver` 跟随），默认 `setState('待机')`。
  「动画」钮 = `cycleIdleState()` 在 `待机/被打/胜利/必杀`（取该 SWF 实有的）里轮换。`swfId` 由装配层注入的 `ctx.swfIdOf(pet)`（= `content.swfIdOf`，与战斗/头像同一桥）。
- **操作列（bagPanel.js）**：8 个 `.rbp-act`（顺序照 desc 1.2.2.1）。**只画存在实现的钮**（无 `Lock`/`Follow`/`Train` 标识符，V-4）；国家钮 = `首发/出战/恢复/动画/加成/入库/仓库/道具`。
- **信息面板（detailPane.js）**：页签 `基础/技能/抗性`。基础 = 左信息区（8 行 + 好感度图标，**「性格」行可点**触发性格层）+ 右能力区（六维 + 性格加成 + 分配学习力，**编辑未定 ⇒ 只读**）；技能 = 4 常规 + 必杀 + [调整技能][隐藏技能]（**面板入口，目标面板另属**）；抗性 = **空置占位**。
- **精灵道具面板（itemPane.js）**：标签行 `全部/培养/纹章/战斗/其他` + **3 行 6 列**网格；**内容 = 空壳**（等 C2 / **T2·5 已立** ⇒ `docs/item/item-design.md` ⇒ 空白是**已知前置**，不是本份 bug，§11）。
  ⚠️ 前缀用 `.rbp-item-*`（挂在信息面板里），**不占用** `rbi-*`（那是独立「道具背包」模态，C1 §4.2）。
- **筛选栏 / 排序（filterBar.js / sortBar.js）**：**只服务仓库**（C1 §6.3）。三条谓词**叠加 AND**（VP1）、`Reset` → `grid.resetFilters()`（三项全清，修 A8）；排序键集合含显式 `none`（修 A14），**比较器先滤空槽再排**。都只**发事件**，**不在 DOM 里筛数据**。
- **仓库（storagePanel.js）**：复用 `.rbg-*` 构件，另一入口 `openPanel('rb-petstorage', …)`；`.rbs-filter`/`.rbs-sort` + 取出/交换/放生/收藏走 R1–R4 actions；关闭回调里背包 `refresh()`（不"重灌整个数组"）。
- **性格层（personalityPane.js）**：`.rbp-pers-*` 全屏遮罩 + 滚动列表；由**基础信息里的「性格」行**触发（不是操作列）。

---

## 5. 逐区像素（把三层 IA 落成 960×540 坐标）

> **方法学**（承 `docs/view/scene/room/view-scene-hud-impl.md §10/§12.1`）：**尺寸 = prefab 硬事实**（`m_SizeDelta`），**位置 = 我们的布局决定**。
> ⚠️ **初版的"横排网格在上 / 详情左下 / 按钮右"作废**：那是按 `m_AnchoredPosition`（中心/自适应锚，**不是屏幕坐标**）误推的；正文以人类实测的三层 IA 为准（C1 §4.1 二次校正）。
> 换算：Unity 中心锚点 → CSS `left = 480 + x − w/2`、`top = 270 − y − h/2`（y 上正）。全部落 `#rv` 的 960×540 空间，`panelstack` 统一 scale（`host.js`）。
> ⚠️ **EDGE=6 坑沿用**（`docs/view/scene/room/view-scene-hud-impl.md §12.2`）：scale 后画布会溢出舞台被 `overflow:hidden` 裁，贴边节点按可见带 `[6,534]` 调。

外壳 `.rbp-box` = `[6, 8, 948, 524]`（**2026-10-17 手测后由 `472` 改吃满画布**），CSS grid 四行：`32px / 1fr / 122px / 18px`（标题 / 内容 / 队伍 / 提示），内边距 8、行距 6。⚠️ ⇒ ② 内容层高 = `524 − 16 − 32 − 122 − 18 − 3×6 = 318px`（原 264）。

| 区（`.rbp-*`/`.rbg-*`） | 上游块尺寸（prefab，权威） | 本文盒 `[left, top, w, h]`（位置=决定） |
|---|---|---|
| `.rbp-head` ① 标题层 | 根 `Panel`：`Background` + `Esc Button 40×40` | `[14, 16, 932, 32]`（标题居中 / ❌ 右 / 货币左） |
| `.rbp-main` ② 内容层 | —— | `[14, 54, 932, 318]`（左右：显示区 ｜ 信息区） |
| `.rbp-display` 显示区 | `Pet Demo 300×340` | `[14, 54, 300, 318]`（左；三兄弟 `[.rbp-stage｜.rbp-demo｜.rbp-buff]`） |
| └ `.rbp-stage` | `Pet 960×540`（idle 台） | 显示区上部（**真 Ruffle 播放器** `ruffle-player`；缺 Ruffle/素材才静态 PNG） |
| └ `.rbp-hud` / `.rbp-hud-acts` | `Demo Group` / `Tool Group`（`Skin`·`Test ±2`） | 显示区下部（六项 + 皮肤/测试对战） |
| `.rbp-info` 信息区 | `Pet Detail 603×325`（`Top Bar 510×40`） | `[322, 54, 624, 318]`（右） |
| └ `.rbp-acts` 操作列 | `Pet Bag Button Group 85×340`，每钮 `64×32` | `[322, 54, 84, 318]`（**8 钮竖排**，实高 ~271 ⇒ **不越界**） |
| └ `.rbp-ipanel` 信息面板 | `Pet Detail` 主体（`Basic 510×264` / `Skill` / `Resistance` / `Item`） | `[414, 54, 532, 318]`（页签 + 子面板） |
| — `.rbp-buff` 加成面板 | `Pet Buff 300×340`（`Default` / `Afterward` 各 `225×110`） | 与 `.rbp-demo` **同框互斥**（显示区切内容） |
| — `.rbp-item-*` 精灵道具面板 | `Pet Item 510×264`（`Box 384×192` = 3×6 格 + 页签 ×5 `131×64`） | 与 `.rbp-basic` **同框互斥**（信息面板切内容） |
| `.rbp-team` ③ 队伍区 | `Pet Bag Storage -12×124` + 根 `Swap 40×40` | `[14, 378, 932, 122]`（左箭头 + 6 格 + 右箭头 + 刷新） |
| └ `.rbg-cells` | `Pets 948×124`（一行 6 格） | 队伍区内满幅，pitch ≈ 932/6 |
| └ `.rbg-pagebtn` ×2 | `Prev`/`Next 22×30` | 队伍区两端 |
| └ `.rbg-cell` 一格 ×6 | `Pet Bag Storage` 的 6 格之一 | 格高 `106px`；**背景 = 头像铺满整格**（`.rbg-bg` ≡ `frame>mask>icon`，`inset:0`）+ 角标 `elem`/`mark` + **底部信息条 `.rbg-strip`（`17px`）= `.rbg-lv`（`Lv<n>`）+ `.rbg-hp`（弹性宽度，填充走百分比）**（**2026-10-17 二轮**，C1 §4.1 更正 5） |
| └ `.rbp-team-refresh` | `Swap 40×40`（`StaticResources/Sprites/Map/flip.png`） | 队伍区右端 |
| `.rbp-note` | —— | `[14, 506, 932, 18]` |
| `.rbp-pers-*` 性格层 | `Pet Personality 600×360` + 自带全屏遮罩 `960×550` + `Esc 35×35` | 「性格」行触发时盖全屏（遮罩/ESC 走 A2/A3 原语，非常驻） |

- **✅ 已由 ⛔/🔶 改 ✅**：`Pet Demo 300×340`（改名/元素/性别/纹章/IV 演示台）现在**要画**（显示区默认面板，**动画台 = 真 Flash idle**，`idleStage.js`）；`Pet Buff 300×340` 现在**要画**（显示区加成面板）。**初版把它们整体省略 = 错**（C1 §4.1 二次校正 / §10）。
- **🔶 只登记**：`Info Prompt`/`SelectNumHintbox`（消费 A3）。
- 上表**位置**若手测发现贴边裁切/重叠，按 `docs/view/scene/room/view-scene-hud-impl.md §12.2` 的 EDGE 补偿调 CSS，不调上游尺寸事实。

---

## 6. A2 同名去重（VP3）落地与 `host.js` 改造

**正本在 A2**（`docs/view/mech/view-panel-stack.md §4`，本文只落地消费）。目标：`openPanel(name, …)` 若栈内已有同名 entry ⇒ **先关旧的、只留最新一层**（旧 DOM + 回调一并销毁，**不是隐藏**）。

现 `game/app/view/panels/host.js` 只有 `stack.filter(e => e.el.isConnected)` 的清理，**没有 name→entry 去重**（`openPanel` 无条件 `push`）。落地最小改：

```js
export function openPanel(name, build, opts = {}) {
  const host = ensureLayer()
  // VP3 同名去重：命中同名 entry ⇒ 走完整 close（触发 onClose + remove），再开新的
  for (const e of stack.filter(x => x.name === name)) closePanel(e)
  const el = document.createElement('div')
  el.className = 'rv-panel'
  host.append(el)
  const entry = { name, el, opts }
  stack.push(entry)
  build(el, { close: () => closePanel(entry) })
  return entry
}
```
- `closePanel(entry)` 里补 `entry.opts?.onClose?.()`（A2 §4 契约要求的关闭回调），现版本只 `top.el.remove()`。
- **背包/仓库/性格层各自唯一 name**（`'rb-petbag'`/`'rb-petstorage'`/`'rb-personality'`）⇒ 连点两次背包入口只剩一个（C1 §12 手测 11）。
- 参数化双实例需求（如 `WorldMap[world=3]`）走 `opts.params`，**仍算同名**、不叠两层；确需并存必须换 name。
- ⚠️ **完整搬家**（`panels/host.js` → `view/panelstack/`，见 `docs/view/mech/view-panel-stack.md §6` 缺口 6）由 **A2 的 impl 认领**；本份只在其落地前，就地给 `host.js` 打这段去重补丁，让背包先能用。**搬家后这段随栈迁到 `panelstack/index.js`**，本份不重复维护两份。

---

## 7. R4/R5 接上第一个消费者（决议 ③）

背包面板是 **R4 `requestSave` / R5 `showHint·askHint` 的**第一个 View 消费者**（`docs/runtime/runtime-components-design.md §5`）。接缝签名以运行时线为准：

| 接缝 | 运行时线契约 | 本份调用点 |
|---|---|---|
| **R4** | `requestSave(reason:'battleEnd'\|'petChange'\|'bag'\|string): void`（fire-and-forget，不返回不抛） | 装配层：动作返回 `write:'bag'` ⇒ `requestSave('bag')`。**View 内 0 次**（V-5） |
| **R5** | `showHint({key,args,level})` · `askHint(spec):'ok'|'cancel'` | 满位换宠 `askHint({key:'bag.pickReplace'})`、放生二次确认 `askHint({key:'storage.releaseConfirm',level:'warn'})`、成功提示 `showHint({key:'bag.healAll'})`。**文案传 key+args，取词归 View**（现 `openHintbox` 传中文字串，改造点） |

**落地前置**（§11）：运行时线 **RB3** 要为 R4/R5 **建档**（今天要新建，不是整理现成的，`runtime-components-design.md §121`）。建档前，装配层可临时用 **stub**：`requestSave = reason => A.save()`、`showHint = spec => openHintbox(...)`，但**必须写在装配层 `mapScene.js`，不写进 `view/petbag/**`**（否则破 V-5）。

**验收口径**：`grep -c requestSave game/app/view/petbag/**` ⇒ **0**（V-5）；`grep -rn localStorage game/app/view/petbag` ⇒ 空（V-3）。

---

## 8. record 偏移口径：View 只认百分比（VP6）

上游 `PetSelectBlockView.cs:90` 把 record 的 `"x,y"` 像素字符串**除以 90（按钮）/80（图标）**再放大（两个键 `iconFrameSizeOffset`/`iconSizeOffset`）。**这两个除数不继承**（C1 §8 VP6）。

- **本份口径 = 百分比**：`1.0` = 原尺寸，`1.12` = 放大 12%。`cellView.js` 读 `record.iconFrameSizeOffset` 时**当作百分比直接用**，代码里**不得出现 `/90`、`/80`**（V-2 精神 + 手测 C1 §12 项 9）。
- **像素→百分比的换算发生在 Save 线**（`docs/save/save-xml-spec.md` 键清单 + D7 `docs/domain/domain-info.md`）：若将来要吃上游存档，`repository`/codec 在**加载时**把 `"x,y"` 换算成百分比再交给上层；**View 永远只认百分比**。
- ⚠️ 这是**有意偏离上游数据口径**（**不是** V2「数据错字静默照搬」家族，`docs/domain/domain-design.md §1 V2`）⇒ 存档 impl 需在键清单里写明这条换算归属，别让"View 不除 90"被误读成漏搬。

---

## 9. 门禁与回归

| 门 | 期望 | 说明 |
|---|---|---|
| `node --test game/logic/petbag/` | 全绿（§3.4） | L1 的**唯一可比**自动化验收（30 条） |
| `node --test game/core/` | **数量/通过率不变**（背包不该动 core） | 动了 = 越界 |
| `node tools/difftest.mjs` | **基线零漂移**（背包不碰战斗数值） | 若向量/可比数变了 = 越界 |
| `node tools/rbag-restart-hud-bag-test.mjs` | 判据全绿（DOM 契约/装配接线的 smoke） | 只断言**三层 IA 结构、8 钮、页签、事务能否闭合**，**不答"对不对"**；换掉 v3 stub 后应仍绿 |
| V-1 分层 | `grep -E "require\|import" game/logic/petbag/**` 无 `game/core/`、`game/app/`、`localStorage`、`document` | C1 §9 |
| V-2 零算数 | `game/app/view/petbag/**` 无 `hp/`、`maxHp`、`slice(`、`sort(` | 血条只许比例 |
| V-3 存档单点 | `grep -rn localStorage game/app/view/petbag` ⇒ 空 | `docs/arch-code.md §3` #5 |
| V-4 无死 API | **口径收窄到本线**：`grep -rnE "Lock\|UnLock\|SetPetTrain\|ToBestPet\|Follow" game/app/view/petbag/ game/logic/petbag/` ⇒ 空 | A6/A10。⚠️ **不许拿全 `game/**` 当门**：`battle-kernel.js` 的 `PackLock*`、`ops-buff.js` 的 `isFieldLocked` 是**无关同名词**，全文 grep 恒非空。`Follow`/`Train` 的**语义**已落到「动画/加成」（C1 §4.1 更正 1/2），故标识符本身不建 |
| V-5 写盘只在动作 | `grep -c requestSave game/app/view/petbag/**` ⇒ 0 | 装配层执行 |

**人手测（主验收 · 决议 ⑦）** = C1 §12 的 **22 项**（第 1–18 项 + 2026-10-17 手测反馈新增 19/20/21/22），本份不复制；§3.4 单测只兜"逻辑没写反"，不能替代。

---

## 10. 构建顺序（每步可独立验，别一口气写完）

| 步 | 内容 | 自检 |
|---|---|---|
| **B1** | F1–F4 L1：`constants/source/grid`（纯逻辑）+ `grid.test.js` `source.test.js` | `node --test game/logic/petbag/` 绿；V-1 grep 干净 |
| **B2** | F4 `actions.js` + `actions.test.js`（A2/A3/A13/write 条件各钉一条） | 单测绿；不依赖任何 DOM |
| **B3** | **数据源切档**：装配层改从 `repository` 取 `petBag[12]/petStorage`，删对 `restartSession` 的调用 | 冷启动首档形状对（前 6 有宠 + 6 空槽）；无旧档可迁 = 符合 Save §6 |
| **B4** | F5 外壳 `bagPanel`（**三层 IA**：① 标题层 / ② 内容层 / ③ 队伍区）+ `displayPane`（显示区·默认精灵面板 = idle 动画台 + HUD 六项 + 皮肤/测试对战）+ `idleStage`（真 Ruffle idle 台，§4）+ `gridView/cellView` + F7 CSS（`rbp-*`/`rbg-*`）；先接 `normal` 单宿主 | 起服务截图：**版面与 `petbag-panel-desc.md` 逐区对上**（标题居中/❌ 贴右、左显示区、右操作列 8 钮、底部队伍区 6 格 + 刷新）+ 空格照画；**面板吃满画布 + 操作列不越界**；EDGE 不裁。手测 **C1 §12 项 1/2/18/19/20/21/22** |
| **B5** | `detailPane`（页签 基础/技能/抗性 + 基础子面板〔左信息 8 行 / 右能力六维〕）+ `personalityPane`（由**「性格」行**触发）+ `itemPane`（道具面板标签行 + 3×6 网格**空壳**）；`filterBar/sortBar` 只挂**仓库** | 手测 **C1 §12 项 4/5/13/14** 手感（筛选/星级在**仓库**里测） |
| **B6** | `actions` 接线九件 + 仓库四件 + `storagePanel`；F6 `host.js` 同名去重；F9 删过渡件 | 连点两次只剩一个背包（**§12 项 17**）；V-4/V-5 grep 干净 |
| **B7** | §7 R4/R5 stub 挂装配层（RB3 未建档时）；**加成/动画/道具**三钮接线（加成 = 显示区切加成面板、**动画 = `cycleIdleState()` 真切演出状态**、道具 = 信息区切道具面板） | 开面板零写盘（**§12 项 15**）；**C1 §12 项 11/12/13** |
| **B8** | 文档收尾：回填 §12 as-built、更新 C1 §13 的 `view-impl.md`→本文件名指针、门禁数字 | 全部门禁绿 |

> ⚠️ **B1–B3 的前置不在本份**：`repository.js`（Save 线）、R4/R5 建档（运行时 RB3）**今天都不存在**。若这两块没落地，本份只能做到 **B3 用临时装配壳** + **B7 用 stub**，面板整体仍是"接在过渡存档形状上的准终局件"，不能宣称完工 —— 按 §11 诚实登记，**不以"对拍不可比"为由跳过**（决议 ⑦）。

---

## 11. 落地前置 / 已知空壳（登记，不偷偷做）

| 项 | 状态 | 归属 |
|---|---|---|
| `game/logic/save/repository.js` 交出 `petBag/petStorage` | **未落地**（设计态，`save-code-map.md:182`） | Save 线 impl |
| R4 `requestSave` / R5 `showHint·askHint` 建档 | **未落地**（全仓 0 定义） | 运行时线 **RB3** |
| A2 `panelstack` 完整搬家（ESC/遮罩统一/`setPanelIdentifier`） | 未落地 ⇒ 本份 §6 先就地打去重补丁 | A2 impl（`docs/view/mech/view-panel-stack.md §6/§8`） |
| idle 动画台（`Pet 960×540`）的**动画素材** | ✅ **有素材、真动画**（2026-10-17 手测后改判，C1 §4.1 更正 3）：装载原版 `swf/fight/{swfId}.swf`（`petContainer` + Ruffle，同战斗舞台的桥）；**只有**无 Ruffle / 素材 404 才降级静态 PNG + 提示 | View 线（`idleStage.js`）；旁证 vendored `vendor/seer2-pet-animator` |
| idle 台的**逐宠相机/缩放**（`PetTransformInfo`：逐宠逐动画 `pos`/`scale`） | **固定** `scaleX/Y=1.9` + `offset(宽/2, 高×0.46)` ⇒ 小体型宠偏小、大体型宠贴底（实测三档体型均不裁切，作用有限）；**正解 = 吃 D7 的 `PetTransformInfo` 数据桥**（上游数据 = 运行时下载 `PetAnimation/pet/transform.csv`，本仓没有） | D7 `docs/domain/domain-info.md`（B5 数据桥同族）；登记 C1 §4.1 更正 3 |
| HUD 的**特性 / 性别 / 纹章 / 个体值**（`Feature`/`Gender`/`Emblem`/`Individual Value`） | **画「—」**（v3 宠形 `{uid,petId,level,exp,hp}` 里**没有**这些字段；**不伪造**） | D6/D7 + Save 线的宠形补全；登记 C1 §8 |
| **抗性信息子面板**（`Pet Resistance 510×264`） | **空置占位**（人类：目前无内容） | 内容/内核；登记 C1 §8 |
| `Item` 子面板**内容**（用什么道具/效果；网格 = 3 行 6 列**空壳**） | **空壳**（本份只做开合接线 + 页签/网格外壳） | C2 / **T2·5**（已立：`docs/item/item-design.md`） |
| `Pet Status` 的 **EV 编辑钮**（`Adjust 90×25`） | 做不做**未拍板**（学习力分配规则未定） | 待 C1/内核；本份先只读展示六维 |
| 图鉴宿主 `dictionary` / PVP 禁选 `ban/pick` / 满 12 溢出 | **有意不做**（VP5/VP7/VP8） | C1 §10/§11 |
| 首发是否算上游 bug（页内 vs 全局 0） | 目标取**全局 0**，等手测确认上游手感 | C1 §12 的「拍板后需顺带确认」段 |
| 本代**不接拖拽换位** UI（desc 没提） | `grid.swap` 能力在 L1、UI 暂不挂 | C1 §6.1 行 A；登记 C1 §10 |
| Q2 `requestSave` 节流 / Q3 `askHint` 是否回调 | 运行时线**未决** | `runtime-components-design.md §Q2/Q3` |

---

## 12. as-built（**本轮已回填** · 2026-10-17）

> 依据 `docs/arch-docs.md §5`：记录**与 §1–§11 施工图冲突的实际口径**，**以本节为准**。
> ⚠️ **仍未"完工"**：`repository.js`/R4/R5 未接 ⇒ 面板仍接在 **v3 stub 存档形状**上；**人类手测（C1 §12 的 21 项）尚未跑** ⇒ **不许据此宣称验收通过**（决议 ⑦）。
> ⚠️ **2026-10-17 一轮人类手测后的修订已并入本节**：① idle 台由静态 PNG 升级为**真动画**（新增 `idleStage.js`）；② 版式三修（面板吃满画布 / 内容层更高 / 操作列不越界）。

### 12.1 落地盘点（对照 §1）
- **F5 已落**：`game/app/view/petbag/**` **12 文件**齐（`index/bagPanel/displayPane/idleStage/detailPane/itemPane/gridView/cellView/storagePanel/filterBar/sortBar/personalityPane`）。
  ⚠️ 与 §1 两处差异：**`itemToggle.js` 未建** —— 道具面板的开合并入 `bagPanel.js` 的 `infoMode` 切换 + `itemPane.js`（§4/§10 B7 写的 `itemToggle` 作废）；**`idleStage.js` 为 2026-10-17 手测后新增**（idle 台真动画，见 §12.2/§12.3）。
- **F9 已删**：`game/app/view/panels/restartPetBagView.js` **本轮已删除**；`mapScene.js` 的对外导出面（`window.openRestartPetBag` 等）**未变**（入口照旧，内部改指 `view/petbag/index.js`）。
- **L1 已落**：`game/logic/petbag/{constants,source,grid,actions}.js` + `{source,grid,actions}.test.js`（**30 单测全绿**）。
- **F6 已落（就地）**：`game/app/view/panels/host.js` 的 `openPanel` **已加 VP3 同名去重** + `closePanel` 补 `opts.onClose?.()`；**未搬家**到 `view/panelstack/`（仍由 A2 impl 认领，§6）。
- **F7 CSS 已落**：`ui.css` 的 `rbp-*/rbg-*/rbs-*/rbp-item-*` 段按新 IA 重写（`rbs-*`/`rbg-*` 本份首次启用）。

### 12.2 与施工图目标态**冲突 / 未接**的实际口径（以本节为准）
- **⚠️ 视角层不再 import L1（2026-10-18 收敛）**：`game/app/view/petbag/index.js` 原直接 import `game/logic/petbag/{source,grid,actions,constants}`
  （4 行，违反 `docs/arch-code.md §3` 硬规则 #3）。**人类 2026-10-18 拍板"收敛成注入"** ⇒ 四个件由**装配层** `mapScene` 经
  `opts.logic = { createPetBagSource, createGrid, actions, BAG_SIZE, PAGE_SIZE }` 交进来；`index.js` 里 `createPetBagSource`/`createGrid`/`ACTIONS`/`BAG_SIZE`/`PAGE_SIZE`
  全改成读 `opts.logic`（缺项**抛错**，不静默降级）。**§3/§7 的其余口径不变**（仍只发 `onWrite` 信号、取词在 View）。
- **数据源仍是 v3 stub，不是 `repository`**：`mapScene.projectBagView(st)` 把 `A.state.team/box` 现算成 `petBag[12]/petStorage` 交给面板，`writeBackBag` 把结果写回 `A.state.team/box` 再 `A.save()`。⇒ §2.2/§7 的 `repository` + R4/R5 真接缝**未接**（§11 前两行）。
- **`createPetBagSource` 实际签名**：`{ host, bag, storage=null, describePet=null }` + `setBag/setStorage`。§3.1 写的独立 `persist` 参数**没有**——`persist` 由 `host` 经内部 `POLICY` 表派生，`canPersist()` 只在 `host==='normal'` 为真。**以代码/本节为准**。
- **`grid` 实际 API**：多出 `cells()`（返回 `[{slot,pet}]`）、`selectedSlot()`、`removeAtSlot()`、`refresh()`；`selectedItem()` 仍在。**以代码为准**。
- **R5 取词在 View**：`index.js` 的 `TEXT` 表把 hint key → 中文串（§7"取词归 View"已落）；`askHint` 借 `mapScene` 的 `openHintbox` 临时壳。
- **「性格」/「刷新」的落点**：改性格由 `bagPanel` 的 `rbp-brow--act`（基础信息「性格」行）触发 `personalityPane`；队伍区右端 `rbp-team-refresh` 调 `actions.swapTeam`（前 6↔后 6）。
- **`requestSave(reason)` 忽略 reason**：`mapScene` 的临时 `requestSave` 只 `writeBackBag + A.save`；真接缝建档后按 R4 契约收 reason。
- **遮罩是面板自建，不是 A2 原语**：`bagPanel/storagePanel` 各自 `el('rb-scrim')` + 点击关闭（§7.2 写的 `opts.scrim` 原语**未落地**）；ESC/统一遮罩归 **A2 impl**。
- **显示区 DOM 结构（2026-10-17 改）**：`.rbp-display` 现在是三兄弟 `[.rbp-stage | .rbp-demo | .rbp-buff]`，**`.rbp-stage` 跨 render 常驻**（Ruffle 播放器一脱离 DOM 即销毁 ⇒ 不能随 `render()` 重建）；§4 原写的"`.rbp-demo` 里含 `.rbp-stage`"**作废**。`renderDisplay` 不再 `host.textContent=''` 整清，只重建 demo/buff 内部 + 按 `displayMode` 切显隐。
- **「动画」钮真接线**：`bagPanel` 直接 import `idleStage.cycleIdleState()`（不再走 `ctx.notify` 的占位提示）；`index.js` 的 TEXT 表加 `bag.animOn`，`bag.animPending` 语义改为"无播放器"。`ctx` 新增 `swfIdOf(pet)`。

### 12.3 逐区坐标、版式与头像偏移（§5 的最终值）
- **2026-10-17 手测后版式三修**（C1 §4.1 更正 4，人类反馈「面板可以更高 / 内容层要更高 / 操作列越界」）：
  · `.rbp-box` = `[6, 8, 948, 524]`（原 `472` 高 → **吃满 960×540 画布**，上下各留 8px）；CSS grid 四行 `32px / 1fr / 122px / 18px` + 行距 6 ⇒ ② 内容层 = **318px**（原 264）。
  · 操作列 `.rbp-acts` 行距 `5px → 4px`；8 钮实高 ~271px ≤ 318px ⇒ **不再越界**（e2e 有"末钮底 ≤ 操作列底 ≤ 内容层底"判据）。
  · 实机 A/B 依据 = e2e `① boxFrac=0.970 / ② mainFrac=0.581 / ③ actsFits=true`。
- **2026-10-17 二轮手测后「队伍格」重排**（C1 §4.1 更正 5，人类反馈「6只构成队伍 every-icon / 头像构成背景图 / 底部信息条：等级 / 底部信息条：血条」；正本 desc 1.3 由人类本人补写）：
  · **旧格（本轮前）→ 现格**：旧 = `64×64` 头像框居中 + 名字一行 + `Lv` + `84px` 定宽居中血条（`.rbg-name`）；**现版** = `.rbg-bg` **头像铺满整格作背景**（`inset:0`）+ **底部信息条 `.rbg-strip`**（高 `17px`，底半透明渐变）= `Lv<n>` + **弹性血条**（`.rbg-hp` 由 flex 给宽，填充按 `m.hpFrac` 走**百分比**）。
  · 新增局部 `hpBar()`（在 `cellView.js` 内，百分比口径）；**`bar()` 的 px 口径未动** ⇒ 地图 HUD（`rbh-hp`）与详情血条（`rbp-hp`）**逐像素不变**。
  · ⚠️ **缓存坑（本轮踩到，人类反馈「一直载入中 + 黑屏」的真因）**：**不发 `Cache-Control`/`ETag`**（实测只有 `Last-Modified` + `Content-Length`）⇒ 浏览器按启发式把 JS 模块**缓存很久且可能不复查**。
    本轮我一度**往共享的 `_kit.js` 加了新导出 `barFlex`**，于是「浏览器里缓存的旧 `_kit.js` + 新 `cellView.js`」这一组合在 **ESM 链接期**直接抛
    `does not provide an export named 'barFlex'` ⇒ **整条 import 图挂掉、`main.js` 根本没跑** ⇒ 页面停在 `#hint`「载入中…」、`#wrap` 空 ⇒ **黑屏**（已本地复现，逐字症状一致）。
    ⇒ 两条纪律：① **不轻易给共享模块（`_kit.js` 等）加新导出**，新东西优先放本线模块（本轮已把 `hpBar()` 收回 `cellView.js`，`_kit.js` 回到改动前逐字节同形）；
    ② 改完 JS/CSS 请**硬刷新**（Ctrl+Shift+R）再测，否则可能拿到旧模块。
  · **名字退为整格 `title`（hover 提示）**；旧 `.rbg-name` 规则在 `ui.css` **整条删除**（全仓 `rbg-name` = 0 命中）。
  · ⚠️ `.rbg-cell` **背包与仓库共用** ⇒ 两处同构（仓库同此版式）；`.rbg-bg`/`.rbg-elem`/`.rbg-strip`/`.rbg-mark` **一律不加 `z-index`**（同层靠 DOM 顺序压叠即可；加 `z-index:2` 会让它们跳出 `.rv-panel` 的层叠上下文、在大面板切换时盖住后开的模态 —— 实测过，已回退）。
- **idle 动画台摆位**（`idleStage.js`，实测定值）：装载 `scale=showAll` + `scaleX/Y=1.9`；`setOffset(台宽/2, 台高×0.46)`（水平居中、脚落在台底上方一点，给大体型留余量），`ResizeObserver` 跟随；`swfId` 经 `ctx.swfIdOf`（= `content.swfIdOf`）。⚠️ 台宽≈298、台高≈214（318 − HUD − 行距）。**实测校准**（petId 1/300/500）：三档体型均完整落在 298×214 台内、不裁切。
  ⚠️ **登记缺口 = 逐宠相机/缩放**：上游用**逐宠逐动画的 pos/scale 表**（`PetTransformInfo`，`Scripts/MVC/Model/Basic/Pet/Info/PetTransformInfo.cs:13`；数据 = 运行时下载的 `PetAnimation/pet/transform.csv`，本仓**没有**）⇒ 本代只能用**固定** `scale/offset`（小体型宠会偏小、大体型宠贴底）。**正解 = D7 的 `PetTransformInfo` 数据桥**（未落地）。
- **未做 EDGE 实测补偿**；`.rbp-box` 与三层分区按 §5 表落 `ui.css`。骨架层经 e2e 断言（DOM 层级对），**像素级仍待人类手测**（C1 §12 项 1/19/20/21）。
- 头像三层百分比：`cellView.js` 直接把 `m.off.frame/icon` 当 `scale()`（**无 `/90` `/80`**，V-2 干净）；`m.off` 由装配层注入，**v3 stub 目前不产出 `off`** ⇒ 实际不缩放（§8 的口径未变）。

### 12.4 门禁数字（本轮复跑）
| 门 | 结果 |
|---|---|
| `node --test game/logic/petbag/` | **30 pass / 0 fail** |
| `node --test game/core/` | **304 pass / 0 fail**（未动 core，与基线一致） |
| `node tools/difftest.mjs` | `向量=30431 可比=29935 native不可比=0 架子没对上=0 不一致=0`（**基线零漂移**） |
| `node tools/rbag-restart-hud-bag-test.mjs` | **49 判据 / 0 失败 / 0 页面错误**（新 IA：三层 IA / 8 钮 / **真 idle 动画** / **版式三修** / **队伍格版式**〔头像铺满作背景 + 底部信息条 = 等级 + 血条〕 / 页签 / 加成 / 道具 / 事务闭合） |
| V-1 分层 | 空 ✔ |
| V-2 零算数 | 空 ✔ |
| V-3 `localStorage` | 空 ✔ |
| V-4 无死 API（**本线口径**） | 空 ✔ |
| V-5 `requestSave`（View 内） | 0 ✔ |
