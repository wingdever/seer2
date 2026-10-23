# 重启主场景 HUD 复刻 · 实现文档

> 上游 = `docs/view/scene/room/view-scene-hud-design.md`（设计已定稿）。本文把设计落成**逐文件、逐函数、逐类名**的施工图；两者冲突以设计文档的**口径**为准、以本文的**具体做法**为准。
> 权威视觉目标 = `/home/wing/Pictures/Screenshots/seer2/mainHud.png`（1920×1080 = 960×540 设计空间 ×2）。

## 0. 铁律（实现期逐条自检）

1. **面板零算数**：名字/上限/元素/等级一律现读 `A.*` 与 `content` getter；面板只做 `x/y` 比值与字符串拼接。
2. **只读 `A.*` / `content`（地图经 `content.loadMap`）**，**不碰 `game/core/**`**、不碰 `tools/difftest.mjs`、不碰 `session.js/stats.js/settle.js/phases/**`。
3. **AS3/SWF 线逐字节不变**：本 HUD 只在 `A.isRestart` 分支挂；`pushHud()` / `togglePetBag()` / `hud=0` 门 / v2 存档零改动。
4. **两条真值树不合并**（`game/data/*.json` vs `game/data/unity/*.json`）。
5. **不伪造内容**：无后端的按钮 → 诚实「待建」（tooltip + 一行 log），**绝不画假子面板**；无数据的槽位 → 不画或占位 + 说明。
6. 非 git 仓库 ⇒ 改文件前留底 `/tmp/hud-bak/`。

---

## 1. 变更文件清单

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| F1 | `game/app/view/panels/battle/_kit.js` | **微增** | 导出 `mapSprite(file)` / `mapBg(file)`（`StaticResources/Sprites/Map` 根，空格 `%20`），复用现 `sprite()` 口径 |
| F2 | `game/app/view/hud/restartPortrait.js` | **新建** | 宠物头像迷你 Ruffle 常驻 Loader（§4） |
| F3 | `game/app/view/hud/restartHudView.js` | **整体重写** | 8 区 DOM（§3） |
| F4 | `game/app/ui.css` | **替换 `.rbh-*` 段 + 新增** | 保留 `.rbh-spacer`（被 `game/app/view/petbag/storagePanel.js` 复用；原 `restartPetBagView.js` 已退役） |
| F5 | `game/app/scenes/mapScene.js` | **仅重启分支** | `mountRestartHud` 多传 `onTodo`；`as3` 分支/`pushHud()` 零改动 |
| F6 | `tools/rbag-restart-hud-bag-test.mjs` | **改 1 条断言** | 见 §8 裁决（顶栏 profile 条删除的对账） |
| F7 | `tools/rbattle-hud-layout-test.mjs` | **新建** | 8 区布局 + 13 钮点击回归（§9） |
| F8 | `swf/pet/icon/*.swf` | **续抓** | 分批 ≤80/次（§7） |
| F9 | `docs/view/scene/room/view-scene-hud-design.md` / `docs/view/ui-handoff.md` / `RESUME.md` | **收尾更新** | 状态与门禁数字 |

**不改**：`host.js`（`openPanel/ensureLayer` 机制沿用）、`restartItemBagView.js`、`game/core/**`。
> ⚠️ 原列的 `restartPetBagView.js` **已退役**（背包面板后期按 C1 搬到 `game/app/view/petbag/**`，见 `docs/view/panel/petbag-impl.md`）⇒ 本条**不含**它。

---

## 2. 素材访问口径（本轮坐实的新事实）

### 2.1 两类按钮美术（**别画重标签**）

逐个开图核实后，底栏图标分两族：

| 族 | 尺寸 | 内容 | 画法 |
|---|---|---|---|
| **A 整图钮** | 150×128 / 209×179 | **中文标签与 NEW 角标已烘进 PNG**（实测 `menu/news.png` = 「新闻」+红 NEW；`challenge/spt.png` = 「SPT」；`menu/event.png` = 「活动」） | 只放 `background-image`（`contain`），**不再加 DOM 文字、不再加 DOM 角标** |
| **B 纯字形** | 20–41px | 只有图形（实测 `menu/dict.png` = 黄底图鉴形、`menu/mail.png` = 青信封、`menu/settings.png` = 青齿轮） | 图形 + **DOM 中文标签**（+ 需要时 DOM NEW 角标） |

⇒ A 族的「NEW」是素材自带的，**不要**再叠 DOM NEW 角标（会重影）。B 族里 `mail.png` 无 NEW ⇒ 信箱的 NEW 角标要 DOM 画。

### 2.2 已坐实的其它素材

| 元素 | 素材 | 实测 |
|---|---|---|
| 队首卡「HP」标签 | `Resources/Sprites/Fight/hp indicator.png` | **就是绿色「HP」二字的美术** ⇒ 用图，不用 DOM 文字 |
| 血条填充 | `Fight/hp color.png`（CSS 已在用） | 沿用 `bar()` |
| 性别符号 | `Resources/Sprites/Game/Genders/{0,1,2,3}.png` | 0=♂青、1=♀粉 ⇒ **都不是红的**（见 §10 待辨收窄） |
| 地图名横幅底 | `Map/map title.png`（151×36） | 真图 |
| 返回绿圆钮 | `Map/recover.png`（21×20） | 真图 |
| 地球钮 / 罗盘 | `Map/world button.png`（512×512）/ `Map/compass.png`（15×18） | 真图 |
| 设定齿轮 | `menu/settings.png`（29×29） | 真图 |
| 墓地 | 无 | 缺 ⇒ DOM 字形「墓」+ tooltip「图标缺素材」 |

### 2.3 上游 HP 文本格式（照抄，不发明）

`PetSelectBlockView.SetHp()`：`hpText = currentHp + " / " + normalHp`（**斜杠两侧有空格**），条宽 = `initHpBarLength * cur / max`。
⇒ 本 HUD 的 `.rbh-hptxt` 采用 `lead.hp + ' / ' + Math.round(A.hpMax(lead))`。
`SetLevel()` 证明确有等级文本 ⇒ **保留 `.rbh-lead-lv`**（设计 §4.1「默认不画」在此让位于上游事实 + harness 断言，见 §8）。

---

## 3. F3 `restartHudView.js` 施工图

### 3.1 契约（不变）

```js
export function create(container, A, handlers = {}) → { update(), setMapTitle(name), destroy() }
// handlers: { onPetBag, onItemBag, onDex, onMap, onSystem, onTodo }   ← 新增 onTodo(label)
```
`onTodo(label)` 由 `mapScene.js` 提供（logLine + 无副作用）；本模块**不认识**任何面板实现，只回调。

### 3.2 DOM 树（类名即 CSS 契约，harness 按此断言）

```
.rbh-root                              (960×540, pointer-events:none)
├─ .rbh-card                           R1 队首卡  x5 y4  w147 h71
│  ├─ .rbh-portrait--lead              (头像槽, 内挂 restartPortrait)
│  ├─ .rbh-card-main
│  │  ├─ .rbh-headrow
│  │  │  ├─ .rbh-lead-name             A.nameOf(lead)
│  │  │  ├─ .rbh-lead-lv               'Lv'+lead.level
│  │  │  └─ .rbh-elem-dot              elementName(elemId) 上色 elementColor
│  │  ├─ .rbh-hprow
│  │  │  ├─ .rbh-hplabel               <img> hp indicator.png
│  │  │  ├─ .rbh-hp                    bar('rbh-hp', 96, 12) → .rbb-bar-fill
│  │  │  ├─ .rbh-hptxt                 '37 / 37'
│  │  │  └─ .rbh-status                小红位（§10 待辨；占位 + title）
│  └─ (点卡) → handlers.onPetBag()
├─ .rbh-rail                           R2 队伍栏 x8 y98 pitch68 tile58
│  ├─ .rbh-rail-cell ×N                team.slice(1) —— 队首已在 R1，栏画其余 5 格
│  │  ├─ .rbh-portrait                 头像槽
│  │  └─ .rbh-rail-lv                  'Lv'+p.level
│  └─ .rbh-rail-item                   ~~「道具」小字钮（§3.5 例外说明）→ onItemBag~~ **已摘除**（人类 2026-10-19，入口随信箱钮承担，§12.10）
├─ .rbh-return                         R3 recover.png 圆钮 → onTodo('精灵恢复')
├─ .rbh-title                          R4 map title.png 底 + .rbh-maptitle 文本
├─ .rbh-globe                          R5 world button.png + .rbh-compass 角标 → onMap
├─ .rbh-menu                           R6+R7 底栏（flex 一行，左组 + spacer + 右组）
│  └─ .rbh-menu-btn ×13                （+ .rbh-menu-btn--art / --glyph 两态）
│     ├─ .rbh-menu-icon                A 族 = 纯背景图；B 族 = 背景图
│     ├─ .rbh-menu-label               仅 B 族有
│     └─ .rbh-badge                    仅 B 族且 NEW 未烘进素材时
└─ .rbh-gear                           R8 settings.png → onSystem
```

几何 = 设计 §2 近似盒；`left/top/width/height` 全写死在 CSS（960×540 空间，`host.js` 统一 scale）。

### 3.3 MENU 描述表（数据驱动，13 钮一屏看全）

> ⚠️ 下表 `handler` 列是**设计期快照**（当时除图鉴外全 `todo`）。落地后的真实路由以 **§12.7 / §12.8 / §12.9 / §12.10 / §12.11** 为准：
> 活动/图鉴/SPT/灵兽/**指引**/商店/要塞/炼狱/基地 **九颗已接后端**（要塞/炼狱/基地 = 跳转、不是面板；灵兽的 6v6/2v2/1v1 挑战钮仍诚实待建 = A 组围栏，见 `docs/view/panel/godpet/`），其余**三颗**（新闻/任务/信息）仍是诚实「待建」。
> **追记（人类 2026-10-19）**：「信箱」钮已**改接道具背包**（`handler:'onItemBag'`，见 **§12.10**）。
> **追记（人类 2026-10-20）**：「指引」钮已接**疑难指引面板**（`handler:'onGuide'`，见 **§12.11**）⇒ 诚实待建的剩**三颗**（新闻/任务/信息）。
> 同理第 12 行的 `墓地` 是看图误读 —— 节点是 `Home`、中文「基地」、素材 `menu/home.png`（本份 §10 追记 ①）。

```js
const MAP = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map'
const art = f => `${MAP}/${f.replace(/ /g, '%20')}`
// kind: 'art'=整图钮(标签已烘进素材) | 'glyph'=纯字形(需 DOM 标签)
// handler: 'todo' → onTodo(label)；其余走 handlers[...]
const MENU = [
  { id:'news',    label:'新闻', kind:'art',   icon:art('menu/news.png'),            handler:'todo' },
  { id:'event',   label:'活动', kind:'art',   icon:art('menu/event.png'),           handler:'todo' },
  { id:'mission', label:'任务', kind:'art',   icon:art('challenge/mission.png'),    handler:'todo' },
  { id:'station', label:'要塞', kind:'art',   icon:art('challenge/station.png'),    handler:'todo' },
  { id:'spt',     label:'SPT',  kind:'art',   icon:art('challenge/spt.png'),        handler:'todo' },
  { id:'godpet',  label:'灵兽', kind:'art',   icon:art('challenge/god pet.png'),    handler:'todo' },
  { id:'hell',    label:'炼狱', kind:'art',   icon:art('challenge/hell.png'),       handler:'todo' },
  { id:'info',    label:'信息', kind:'glyph', icon:art('menu/info.png'),            handler:'todo' },
  { id:'dict',    label:'图鉴', kind:'glyph', icon:art('menu/dict.png'),            handler:'onDex' },
  { id:'guide',   label:'指引', kind:'glyph', icon:art('menu/guide.png'),           handler:'todo' },
  { id:'mail',    label:'信箱', kind:'glyph', icon:art('menu/mail.png'),  badge:'NEW', handler:'todo' },
  { id:'grave',   label:'墓地', kind:'glyph', icon:null,                 glyph:'墓', handler:'todo',
    title:'图标缺素材' },
  { id:'shop',    label:'商店', kind:'glyph', icon:art('menu/shop.png'),            handler:'todo' },
]
```
- `kind:'art'` ⇒ **不建** `.rbh-menu-label`、**不建** `.rbh-badge`（标签/NEW 在素材里）。
- 每个钮 `title` = 无后端者的说明（`'<标签>：面板待建'`），`dataset.mid = id` 供 harness 逐个点。
- 缺图（墓地）⇒ `.rbh-menu-icon--miss` 画 DOM 字形，`title` 标「图标缺素材」。

### 3.4 `update()` 流程（零算数）

```
1. lead = A.state.team[0]
   无 → .rbh-card 内 .rbh-empty '队伍为空'（保留卡壳），头像槽置空
   有 → name/Lv/elem 现读；bar.set(lead.hp / Math.max(1, A.hpMax(lead)))   ← 唯一算数是比值
        hptxt = lead.hp + ' / ' + Math.round(A.hpMax(lead))
        portrait.set(A.swfIdOf(lead), {elemId, name})
2. rail 格数 = A.state.team.slice(1, TEAM_MAX)   ← TEAM_MAX 读 A.RST.TEAM_MAX，不写字面量
   每格 diff uid：变了才 portrait.set(...)（省 Ruffle 重载）
3. 货币/图鉴：不画（§8 裁决）
```
`setMapTitle(name)` → `.rbh-maptitle` 文本（不变）。
`destroy()` → `root.remove()` + 逐个 `portrait.destroy()`（释放 Ruffle）。

### 3.5 一处对设计的显式偏离（登记，不偷偷做）

设计 §4.7 删顶栏 profile 条后，**道具背包在 HUD 上失去入口**（截图底栏 13 钮没有「道具」）。
裁决 = 沿用 §4.7 开的「另议一个截图未覆盖的角落」口子：在 **R2 队伍栏底部**放一个小字 `.rbh-rail-item`「道具」钮 → `onItemBag`。
理由：`openRestartItemBag` 是已落地的 U4 功能，入口不能凭空消失；放栏尾既不动截图主体，也不伪造任何面板内容。
（`精灵背包` 入口改为点队首卡 / 点队伍栏格 —— 对齐上游 `MapPetCornerView`→`PetSelectBlockView` 的按钮语义。）
> **追记（人类 2026-10-19）：本偏离已作废** —— 信箱钮改接道具背包（§12.10）后，栏底「道具」格由人类点名摘除，DOM + CSS 均已删。

---

## 4. F2 `restartPortrait.js`（头像管线，独立模块便于降级与复用）

```js
export function createPortrait(slot, opts = {}) → { set(swfId, fb), destroy() }
// slot: 容器元素（.rbh-portrait）；opts.size 只影响降级色块字号
```

**行为**
1. 构造时**建一次** Ruffle player 常驻（`window.RufflePlayer.newest().createPlayer()`），**永不 `innerHTML=''`**。
   ⇒ 规避 `petbag-handoff.md:34` 的 Error #2069（载入对象不能从 Loader 摘出）：我们不摘对象，只往**同一个 player** 再 `load()`。
2. `set(swfId, fb)`：
   - `swfId == null` 或已画同一 id → 直接返回（幂等，省重载）。
   - 无 Ruffle → 降级色块（§4.3），记 `slot.dataset.portrait='noruffle'`。
   - 有 Ruffle → `player.ruffle().load({ url:`/swf/pet/icon/${swfId}.swf`, autoplay:'on',
     unmuteOverlay:'hidden', scale:'showAll', background:'transparent', menu:false, warnOnUnsupportedContent:false })`
     `.catch()` → 降级色块 + `dataset.portrait='miss'`。**不抛、不 console.error**（harness 要 0 错）。
   - 成功 → `dataset.portrait='swf'`。
3. 换宠 = 往同一 player 再 `load()`；若 Ruffle 拒绝二次 load（实测才知道），退路 = **仅该格**重建 player（销毁旧 player 是允许的，#2069 说的是 SWF 内部 DisplayObject 摘除）。

**降级色块（§4.3）**：`el('rbh-portrait-fb', { background: elementColor(elemId) })` + 名首字；`title` = 「头像素材缺失」。

**性能预算**：同时最多 6 个 player（1 队首 + 5 栏），icon SWF ~2.4KB 单帧 ⇒ 实测若卡，B4 再上「构建期烘 PNG」优化（不承诺）。

---

## 5. F4 CSS 施工图

新增/替换（960×540 绝对定位，全部 `#rv` 前缀）：

| 类 | 几何/样式要点 |
|---|---|
| `.rbh-root` | 保留：960×540、`pointer-events:none` |
| `.rbh-card` | `left:5 top:4 w:147 h:71`；青边近似 `border:1px solid #3fd0e0; border-radius:6px; box-shadow:0 0 0 1px rgba(63,208,224,.25), inset 0 0 12px rgba(0,0,0,.6); background:rgba(8,12,20,.72); pointer-events:auto` |
| `.rbh-portrait` / `--lead` | 槽位 `overflow:hidden`；`ruffle-player{width:100%;height:100%}`；lead 56×56、rail 52×52 |
| `.rbh-portrait-fb` | 圆角色块 + 居中首字（降级） |
| `.rbh-hplabel` | `width:22px` 用 `hp indicator.png`（`background-size:contain`），**不写文字** |
| `.rbh-hp` | 96×12；`.rbb-bar-fill` 沿用现 `hp color.png` 规则（**别删这条现有声明**） |
| `.rbh-status` | 10×10 红点占位 + `title`（§10 待辨） |
| `.rbh-rail` | `left:8 top:98`，`display:flex; flex-direction:column; gap:10px` |
| `.rbh-rail-cell` | 58×58 青边盒 + 元素色描边（`border-color` 内联） + `.rbh-rail-lv` 右下小字；`pointer-events:auto; cursor:pointer` |
| `.rbh-rail-item` | ~~栏尾小字钮（§3.5）~~ **已摘除**（人类 2026-10-19，§12.10）：DOM 与 CSS 均已删 |
| `.rbh-return` | `left:352 top:2 36×36`；`recover.png` contain；圆钮 `border-radius:50%` |
| `.rbh-title` | `left:415 top:4 w:130 h:26`；`map title.png` `background-size:100% 100%`；`.rbh-maptitle` 居中白字 13px（**类名沿用，harness 依赖**） |
| `.rbh-globe` | `left:5 bottom:12 71×76`；`world button.png` contain；`.rbh-compass` 右上 15×18 绝对角标 |
| `.rbh-menu` | `left:88 right:75 bottom:12 height:48`；`display:flex; align-items:flex-end; gap:2px`；`.rbh-spacer` 撑开左右组 |
| `.rbh-menu-btn` | `pointer-events:auto; cursor:pointer`；`--art` 52×44（整图 contain，无文字）；`--glyph` 44×46（图 28×28 居中 + 下方 11px 标签） |
| `.rbh-menu-btn--miss` | 灰底 + DOM 字形 |
| `.rbh-badge` | 红底白字 9px，绝对右上（仅 `mail`） |
| `.rbh-gear` | `right:5 bottom:10 50×63`；`settings.png` contain |

**保留**：`.rbh-spacer`（`game/app/view/petbag/storagePanel.js` 在用；原 `restartPetBagView.js` 已退役）。
**删除**：`.rbh-top/.rbh-profile/.rbh-trainer/.rbh-coin/.rbh-diam/.rbh-party/.rbh-lead/.rbh-tools/.rbh-tool*/.rbh-mini/.rbh-bottom`（顶栏 profile 条与旧工具条整体退役；`.rbh-dex`/`.rbh-coin` 见 §8）。
`.rbh-empty`、`.rbh-hprow`、`.rbh-headrow`、`.rbh-elem-dot`、`.rbh-lead-name`、`.rbh-lead-lv`、`.rbh-hptxt`、`.rbh-hp` 保留（harness 依赖 + 上游有对应物）。

---

## 6. F5 `mapScene.js` 接线（最小 diff）

```js
HUD = RESTART_HUD.create(root, A, {
  onPetBag: openRestartPetBag, onItemBag: openRestartItemBag,
  onDex: () => logLine('图鉴重启原生面板待建'),
  onMap: () => logLine('世界地图面板待建'),
  onSystem: () => logLine('系统面板待建'),
  onTodo: (label) => logLine(`${label}：面板待建（重启线未实现，不伪造内容）`),   // ← 新增
})
```
- `mountRestartHud` / `refreshHud` / `openRestartPetBag` / `openRestartItemBag` 的**签名与调用点不变**（`mapReady` 后喂 `setMapTitle`）。
- **`as3` 分支、`pushHud()`、`bagRecords()`、`togglePetBag()`、`HUD_TODO` 逐字节不动。**
- 无需新增 `window` 导出（`getHud`/`openRestartPetBag`/`openRestartItemBag` 已在）。

---

## 7. F8 素材续抓（B0，与代码并行）

```bash
# 差集 = unity/pets.json 的 petId → swfIdOf 去重 − 已存在
node -e '...' > /tmp/need-ids.txt          # 每批 80 个
node tools/fetch-pet-icons.mjs --ids="$(head -80 /tmp/need-ids.txt | tr '\n' ' ')"
```
- 预算/并发/间隔用工具默认（`--budget=80 --conc=2 --spacing=160`）；**不压测、不二次分发、仅本地学习**。
- 每批后核对：`ls swf/pet/icon | wc -l` + 计数 404/失败；缺位者 HUD 自动走色块降级（不阻塞实现）。
- 当前状态：128 支在盘（首批 80 已抓，0 失败），剩约 717。

---

## 8. 门禁与回归（含设计 §4.7 冲突的裁决）

**冲突**：设计 §4.7 删顶栏 profile 条，但 `tools/rbag-restart-hud-bag-test.mjs:74` 断言 `#rv .rbh-coin` / `#rv .rbh-dex`。

**裁决 = 改 harness，不违设计。**
- 该 harness 是**重启线自有 UI** 的回归，不是「逐字节不变」守护对象（那条铁律保护 **AS3/SWF 线与 v2 存档**）。
- F6 具体改动：
  1. 删 `.rbh-coin`/`.rbh-dex` 读取；
  2. 该条断言改为：**「货币读数仍在（搬家到精灵背包头部）」** —— 开 `openRestartPetBag()` 后断 `.rbp-money` 含 `1234`；
  3. **新增防回归断言**：HUD 内不存在 `.rbh-coin` / `.rbh-dex` / `.rbh-top`（顶栏 profile 条已按截图退役）。
- 其余 19 条断言（`hud=none`、`.rbh-root`、`.rbh-hp` 比值、cap≠40、`Lv10`、`.rbp-*`、`.rbi-*`、v2 未写）**必须保持绿** —— 故 §2.3 决定保留 `.rbh-lead-lv` 与 `.rbh-hp`/`.rbh-hptxt` 类名。

**每步必跑**：
```bash
node tools/rbag-restart-hud-bag-test.mjs          # 20 条 + 页面 0 错
node tools/rbattle-hud-layout-test.mjs            # 新 harness
node --test game/core/                            # 272/272（应不动）
node tools/difftest.mjs                           # 30316/29827/0/0/0（应不动）
```
（后两条是「UI 线没越界」的证据，不是本任务的改动对象。）

---

## 9. F7 `tools/rbattle-hud-layout-test.mjs` 判据草案

puppeteer + `--enable-unsafe-swiftshader`，`localStorage` 播 `restart` 引擎开关 + 一份可控 v3（队首 id1@Lv10 + 5 只队伍），进 `#/map`，断：

1. 8 区 DOM 齐：`.rbh-card` / `.rbh-rail-cell`（数 = `team.length-1`）/ `.rbh-return` / `.rbh-title` / `.rbh-globe` / `.rbh-menu-btn`（**恰 13**）/ `.rbh-gear`。
2. 底栏 13 钮逐个 `click()`：`console 0 错`、`pageerror 0`；`dict` 触发 `onDex` 占位、其余走 `onTodo`；点完不崩、面板栈不脏（`panelStack()` 回到 `['rb-hud']`）。
3. A 族钮**不得**有 DOM 子标签（防重影）：`.rbh-menu-btn--art .rbh-menu-label` 计数 = 0。
4. 队首卡 HP 分数 == `lead.hp / A.hpMax(lead)`（±0.02），文本 == `hp + ' / ' + round(hpMax)`。
5. 头像：队首格 `dataset.portrait` ∈ `{swf,miss,noruffle}` 且**非空图**（有 player 或有 `.rbh-portrait-fb`）；`swfIdOf(1)===1` 时断 `swf/pet/icon/1.swf` 在盘（B0 已抓）。
6. 地图名 == `maps.json` 当前图名（`M.map.name`）。
7. 顶栏 profile 条已退役：`.rbh-coin`/`.rbh-dex`/`.rbh-top` 均不存在。
8. 隔离：全程 v2 存档未被写；`hudStatus()==='hud=none'`。
9. 截图 `/tmp/rbhud-layout.png` 供与 `mainHud.png` 并排比。

---

## 10. 待辨 → 已坐实（B4 收口；权威 = `Map.unity` + `Assets/Scripts/**`，截图只裁「运行时画不画」）

> 方法学（这轮反复用到，值得写死）：**几何 / 资产 / 路由 = 源码权威**（`Map.unity` 的 `RectTransform`、
> `m_LocalScale`、`m_Color`、sprite GUID 经 `.meta` 反查、每个按钮内嵌的
> `onPointerClickEvent → MapMenuController.OpenPanel(...)` 与 `onPointerOverEvent → SetInfoPromptText(...)`、
> `Assets/Scripts/MVC/**` 的 C#）；**可见性 = 截图权威**（源码答不了运行时到底 SetActive 了没有）。
> 两者冲突时按「**场景有节点、截图那一格是空的 ⇒ 不画**」裁决，读数改挂 `data-*` + tooltip，不丢信息。

| 项 | 结论（源码出处） | 落地 |
|---|---|---|
| 队首卡右侧小红位 | **不是状态位，是 Recover**：`MapPetCornerView` 的 `Recover` 节点 → `PetCorner.Heal()`（`OnAfterHeal` 提示「你的精灵已完全恢复！」）。素材 `StaticResources/Sprites/Map/recover.png`，盒 `[127.2, 42.4, 15, 15]`（卡内相对） | `.rbh-recover`，点击 `onTodo('恢复')` —— 治疗是内核事务，UI 不越界执行 |
| 顶中绿圆钮 | **不是「返回」**：节点 `Day Night`，`flip.png`，`SwitchDayNight()`，场景 tooltip = 「切换地图」 | `.rbh-daynight`，盒 `[345, 0, 50, 35]` |
| 天气钮 | 节点 `Weather`，盒 `[565, 0, 50, 35]`。**上游 `MapInfoView.SetWeather`: `weather == 0` ⇒ `weatherBackground.SetActive(false)`** ⇒ 参考截图（新手任务传送室，`maps.json weather=null`）那一格确实是空的 | 默认 `display:none`；`setMapTitle(name, weather)` 才决定显隐；名字/描述直读 `unity/buffs.json` 的 `500000 + weather`（上游 `Buff.GetWeatherBuff` 的 id 口径）。天气**图标**上游是 `Buff.icon` 运行时 `SetSprite`，仓库里查不到按天气分表的素材 ⇒ 暂用战斗线 `Fight/Weather Test.png`，登记为**近似** |
| 底栏第 12 钮 | 中文是「**基地**」不是「墓地」（场景 `Home` 节点 + `SetInfoPromptText`）；设计文档 §1/§2 的「墓地 + 缺图」是**看图误读**，图标 `menu/home.png` 一直在（GUID 反查：`Home` 的 Image → `StaticResources/Sprites/Map/menu/home.png`） | `.rbh-menu-btn[data-mid="home"]` = 基地 |
| 商店图标 | 场景里 Shop 节点挂的是 `menu/guild.png` 系（不是 `menu/shop.png`） | 按场景 GUID 反查取用 |
| 队首卡 Lv | 场景有 `Level Indicator/Text`（盒 `[9, 50.7, 51, 10.8]`，压在头像下半），但**截图那一格是空的** ⇒ 运行时没显示 | 卡面**不画** Lv，读数走 `.rbh-card[data-lv]` + tooltip |
| 队伍栏 Lv 角标 | 栏格不在场景里（运行时预制体），截图量测得 5 格 `60×50 @ left 6.5 / 顶 97.5 + 69.5k`，**格面上没有 Lv** | 同样不画，走 `.rbh-rail-cell[data-lv]` + tooltip |
| 血条填充 | 场景 `Hp Bar`: `m_Sprite = 0`（Unity **内建白图**）+ `m_Color = #77E20C` ⇒ 主场景是**纯绿条**。战斗线那张 `Fight/hp color.png` 是渐变，按宽度切片会变色，**与截图不符** | `.rbh-hp .rbb-bar-fill { background:#77e20c }`，不用 hp color.png |
| 「HP」二字 | `Resources/Sprites/Fight/hp indicator.png` 就是绿色「HP」标签美术 | `.rbh-hplabel` 画美术，DOM 不写 HP 字样 |
| 顶栏货币/图鉴读数 | 截图无对应 | 已删；货币搬家到背包头部（`A.state.trainer` 直读） |
| 6 个头像实例性能 | 头像走**本地 PNG 路由**（`Resources/Pets/icon/{petId}.png`，见 §12），不是 Ruffle ⇒ 无 6 实例问题。设计期定的 `res/pet/icon/*.swf` 路线**作废**（SWF 定帧在 HUD 小格上渲染空白） | 缺位才降级元素色块 + 名首字 |

**一处显式偏离（保留，但必须看着就不像原版）**：栏底「道具」格在**截图、`Map.unity`、`Assets/Scripts/**`、
所有 Prefab 里都零出现**（上游道具走 商店 → `OpenPanel(ItemShop)`，该面板未建）。它是 U4 已落道具背包的唯一
HUD 入口，删了就把整个面板 strand 住。处理：CSS 故意**不套上游青边盒**，改 `1px dashed` + 半透明底 +
弱化字色，一眼能看出是后加的；tooltip 自陈「截图未覆盖的额外入口」。
> **追记（人类 2026-10-19）：该格已摘除** —— 道具背包入口改由底栏「信箱」钮承担（§12.10），这处偏离随之关闭，HUD 不再有原版没有的「道具」格。

---

## 11. 构建顺序（每步可独立验，别一口气写完）

| 步 | 内容 | 自检 |
|---|---|---|
| **B0** | §7 续抓 2–3 批 icon（含早期队伍可能出现的宠） | `ls swf/pet/icon \| wc -l`、404 计数 |
| **B1** | F1 `_kit.js` 加 `mapSprite` + F3 重写 8 区 DOM（头像先全走色块） + F4 CSS | 起服务截图，与 `mainHud.png` 并排比 |
| **B2** | 读数接线（队首卡/栏/地图名）、删顶栏 profile 条、`onTodo` 统一 | `rbag-restart-hud-bag-test` 先跑（预期仅 §8 那条红） |
| **B3** | F2 `restartPortrait.js` 接上（常驻 Loader + 降级） | 断言 5 绿；console 0 错；肉眼见真宠脸 |
| **B4** | F6 harness 对账 + F7 新 harness | 两个 harness 全绿 |
| **B5** | F9 文档收尾（`view-scene-hud-design.md` 状态、`ui-handoff.md` U3、`RESUME.md` 门禁数字） | 四件套门禁（§8）全绿 |

> **B0/B3 已作废**（头像改走本地 PNG 路由，见 §12.3），其余按序走完。

---

## 12. As-built（B4 落地后的实际口径，与 §3–§9 施工图冲突时**以本节为准**）

### 12.1 几何：`Map.unity` 绝对盒（设计空间 960×540）

Unity → CSS 换算：`size = (anchorMax − anchorMin) × parentLocalSize + sizeDelta`；
`m_LocalScale` 同时缩放该节点**及其子树**（`PetSelectBlock` / `Pet Shortcut` 那一族是 `0.6`，
所以 90×90 落屏 54×54）；`CSS top = 540 − unityY − h`。

| 节点 | 盒 `[left, top, width, height]` | 锚边 |
|---|---|---|
| `.rbh-card` (PetCorner) | `[0, 2, 150, 70]` | top |
| `.rbh-portrait--lead` | `[7.5, 10.5, 54, 54]`（卡内相对） | — |
| `.rbh-lead-name` | `[66, 15.6, 69, 18]`（卡内相对） | — |
| `.rbh-hplabel` | `[72, 36.6, 16.2, 10.2]`（卡内相对） | — |
| `.rbh-hp` | `[72, 48, 51, 9]`（卡内相对） | — |
| `.rbh-recover` | `[127.2, 44.4, 15, 15]`（卡内相对） | — |
| `.rbh-daynight` / `.rbh-weather` | `[345, 0, 50, 35]` / `[565, 0, 50, 35]` | top |
| `.rbh-title` (Map Name) | `[400, −5, 160, 40]` | top |
| `.rbh-corner` (Map Corner) | `[5, 470, 70, 70]` | bottom |
| `.rbh-globe` / `.rbh-minimap` / `.rbh-compass` | `[15,481,50,50]` / `[60,460,25,25]` / `[66.5,465,12,15]` | bottom |
| `.rbh-gear` (Settings Area) | `[895, 480, 60, 60]` | bottom |
| 底栏 13 钮 | 见 `restartHudView.js` 的 `MENU` 第 4 位（harness 复用同一张表，不抄第二遍） | bottom |
| `.rbh-menu-label` ×6 | `30×30`，盒左上 = 图标盒左上 + `MENU` 的 `label[1],label[2]` | — |
| `.rbh-rail-cell` ×5 | `[6.5, 97.5 + 69.5k, 60, 50]` —— **截图量测**（运行时预制体，不在场景里） | — |
| `.rbh-toggle`（R9 箭头） | `[154, 25, 24, 24]` —— **上游无此节点**，盒 = 卡右缘 +4、垂直居中（见 §12.6） | top |

### 12.1b G 族六个中文标签：右下角对齐（人类 2026-10-19 拍板）

**场景真值**（`Assets/Scenes/Map.unity` → `Menu Area` 的六个 `Text (Legacy)` 子节点，逐节点抄）：

| 节点 | 图标盒 | Text 盒 `anchoredPosition` | `m_FontSize` | `m_Alignment` | `m_Color` |
|---|---|---|---|---|---|
| `Bag`（信息） | `[550,505,23,25]` | `(15, −2.5)` | 13 | **8 = LowerRight** | `#52e5f9` |
| `Dict`（图鉴） | `[605,505,30,25]` | `(15, −2.5)` | 13 | 8 | `#ffcc33` |
| `Guide`（指引） | `[665,505,30,25]` | `(15, −2.5)` | 13 | 8 | `#52e5f9` |
| `Mail`（信箱） | `[730,507.5,25,20]` | `(15, −5)` | 13 | 8 | `#52e5f9` |
| `Home`（基地） | `[770,487.5,55,60]` | **`(5, 15)`** | 13 | 8 | `#52e5f9` |
| `Shop`（商店） | `[840,501.5,36,32]` | **`(7.5, 1)`** | 13 | 8 | `#52e5f9` |

六个节点的 `anchorMin/Max = (1,0)` + `pivot = (1,0)` ⇒ **Text 盒的右下角**钉在「图标盒右下角 + anchoredPosition」，
盒本身 `sizeDelta = 30×30`。⇒ CSS 反解（`ap.y` 是 Unity 向上坐标）：

```
left = 图标宽 + ap.x − 30        top = 图标高 − ap.y − 30
```

代入上表 ⇒ **六个盒的绝对顶边全等于 `502.5`**（同一条基线），盒右缘 = 图标右缘 + `ap.x`。
这就是「标签贴着各自图标的右下角、六个齐平」的实现口径。

**⚠️ 基地/商店 的 `ap` 与其余四个不同**（`(5,15)` / `(7.5,1)` vs `(15,−2.5)` / `(15,−5)`）——
不是抄错，是场景如此（旧 as-built 把这两格记成 `−5`，导致它们脱线约 20px，本轮按场景改正）。

**CSS**（`ui.css` `.rbh-menu-label`）：盒 `30×30` + `display:flex; align-items:flex-end; justify-content:flex-end`
= 复刻 `Alignment 8 (LowerRight)`；`font-size:13px`（= 场景 `m_FontSize`）；
**`font-weight:700` 是我们自己的取舍**（场景 `m_FontStyle:0` = 常规）—— 人类 2026-10-19 要求「加粗一点」，
小字在 960×540 按舞台宽缩放后偏细，加粗一档 + 双层描边阴影（`0 1px 2px #000, 0 0 2px #000`）提升可读性。

**人测确认项**：六个标签是否齐平、`基地`/`商店` 是否已归位、加粗后 13px 是否在 1200 宽舞台下不发糊。

---

### 12.2 `EDGE = 6`：可见带补偿（这条最容易踩，务必留着）

`host.js` 按舞台宽缩放：`scale = wrap.clientWidth / 960`。1200 宽 ⇒ `scale = 1.25`，
960×540 画布落屏 **1500×675**，而 `#wrap` 只有 **660** 高 ⇒ 上下各溢 7.5 屏 px = **6 设计 px**，
`overflow:hidden` 静默裁掉。**可见带 = 设计 y ∈ [6, 534]**。

⇒ 所有**根级**节点用 `rbox(cls, box, anchor)` 而不是 `box()`：贴顶的 `top = 6 + t`，
贴底的 `bottom = 6 + (540 − t − h)`。判据 9c 独立按「相对 `#wrap` 可见带的贴边距离」再量一遍 ——
判据 9a 是「相对 `.rbh-root`」的量法，宿主整体跑偏时它跟着一起偏，**抓不到居中错误**（踩过）。

两个同源坑（都在 `host.js`）：
- `#wrap` 在建层那一刻若有横向滚动条，`clientHeight` 少 ~18px，缓存下来的 `translateY` 是 −16.5 而不是 −7.5，
  底栏整排被削掉 9px ⇒ `fit()` 每次 `ensureLayer()` 都重算，另挂 `ResizeObserver` 跟手。
- puppeteer 的 `click` 会对目标 `scrollIntoViewIfNeeded`，而 `#wrap` 虽是 `overflow:hidden`
  浏览器**照样能改它的 `scrollTop`**（实测被滚了 9px）⇒ 量贴边距离前先归零 `scrollTop/scrollLeft`。

### 12.3 头像路由（改判）

**权威 = 重启客户端自己的本地 PNG**：`Resources/Pets/icon/{petId}.png`（`PetUISystem.GetPetIcon` 口径）。
设计期定的官方 `res/pet/icon/{swfId}.swf` + 迷你 Ruffle 路线**作废** —— icon SWF 是容器，
在 54×54 的小格上定帧渲染空白，且每格常驻一个 Loader 不值当。缺位才降级元素色块 + 名首字（诚实不空图）。
`.rbh-portrait[data-portrait]` ∈ `{png, fb}`，harness 判据 5a/5b 断言无空图。

### 12.4 门禁数字（本轮全绿）

| 门 | 结果 |
|---|---|
| `node tools/rbattle-hud-layout-test.mjs` | **27 条全绿**，page/console 0 错 |
| `node tools/rbag-restart-hud-bag-test.mjs` | **21 条全绿**（Lv 断言改走 `data-lv`） |
| `node --test game/core/` | **272 pass / 0 fail** |
| `node tools/difftest.mjs` | 基线不动：向量 30316 / 可比 29827 / native不可比 0 / 架子没对上 0 / 不一致 0 / 分歧族 `{}` |

新增判据：4e（栏格不画 Lv）、11a–11d（天气钮显隐 / 名字描述直读 buffs.json / 盒 `[565,0,50,35]` / 点击打诚实日志）。

### 12.5 测试面

`mapScene.js` 在重启分支挂 HUD 后写 `window.__rbHud`（对齐 `rbbattleScene.js` 的 `window.__rbattle` 先例），
harness 用它驱动 `setMapTitle(name, weather)` 验「有天气」态。**只在 `A.isRestart` 分支内**，as3 线不写。

### 12.6 R9 收起/唤出 HUD 的箭头（as-built · 人类 2026-10-19 要求，设计 = `view-scene-hud-design.md §4.9`）

**这是上游 `Map.unity` 里没有的一钮**（第 8 条边界登记），借原版素材 `StaticResources/Sprites/Map/arrow.png`（24×24 青三角）画，
方向用 CSS `transform:rotate()` 得到（上游没有左右向两张图）。

| 件 | 落点 |
|---|---|
| DOM | `restartHudView.js` 的 `toggle = rbox('rbh-toggle', [154, 25, 24, 24])`（**根级**、`anchor='top'` ⇒ 落屏 top 31 = 卡 [0,2,150,70] 的垂直中心 43）；子节点 `.rbh-toggle-icon` = `paint(…, 'arrow', [0,0,24,24])`；`data-mid="hudToggle"`、`data-state ∈ {shown,hidden}` |
| 状态 | 模块级 `let hudHidden`（**不是实例级**）：`mountRestartHud()` 换图会 `destroy()`+重建，存实例上 ⇒ 收着传送一次就自己弹回。`setHudHidden(v)` 只在 `root` 上切一个类名 |
| CSS | `ui.css` R9 段：`.rbh-root--hidden > :not(.rbh-toggle) { display:none }`（**整块 R1–R8 收走、只留箭头**）+ `.rbh-toggle-icon` 指左 / `--hidden` 时指右（`.12s` 旋转过渡） |
| 契约 | `create()` 返回值多两个：`toggleHud()`、`isHudHidden()`（`window.__rbHud` 可直接驱动）；`handlers` 不变、`mapScene.js` **零改动** |

**边界**：只动 `#rv` 里 HUD 这一层 DOM ⇒ 地图画面、光口/角色/NPC canvas 层（`#portal`/`#npc`/`#ov`）、
以及已开的模态面板（背包/商店/活动/大小地图）**都不受影响** —— 收起的是 chrome，不是场景。

**等人手测确认项**：① 箭头是否**压在卡右缘外侧、不遮卡面文字**（盒 `[154,25,24,24]` 是照卡盒算的，没在真机上校过）；
② 点一下是否 R1–R8 **全消失**、再点是否**全回来**（含底栏 13 钮、齿轮、地图角标）；③ 收起态下**换图/传送**后箭头是否仍在、
HUD 是否保持收起（模块级状态）；④ 指左/指右的方向语义是否读得懂（读不懂就换文字标签，人类说了算）；
⑤ 收起后点箭头之外区域**不应**有任何响应（`root` 是 `pointer-events:none`，只有箭头可点）。


### 12.7 底栏「要塞」钮 = 跳转（as-built · 人类 2026-10-19 要求完成其功能）

**上游没有要塞面板**：`Assets/Scenes/Map.unity:5109` 那颗钮的 onClick 绑的是 `MapMenuController.GoToStation()`，
正本 `MapMenuController.cs:34-37` 只有一行 —— `GoToMap(Player.instance.currentMap.worldId * 10000 + 81)`。
所以本钮**不是**「待建面板」，而是一条**星球要塞跳转**；§3.3/§4.5 表里那句「待建」是设计期漏查场景绑定，现予更正
（design §4.5 该行 + §8 第 3 条同步）。

| 件 | 落点 |
|---|---|
| 视图 | `restartHudView.js` `MENU` 的 `station` 行加 `handler: 'onStation'`（几何/素材/`data-mid="station"` 不变 ⇒ harness 仍逐个点得动） |
| 接线 | `mapScene.js` 的 `goToStation()`：`worldId = M.unity.worldId`（缺记录 ⇒ 0）→ `target = worldId*10000 + 81` → `logLine` 一行 → **`runTeleport(target)`**（= 光口/大地图/小地图/SPT 那台 `decideTeleport` 决议机，**不新开第二条路**） |
| handlers | `mountRestartHud` 的 `RESTART_HUD.create(...)` 多传 `onStation`（仅 `A.isRestart` 分支；as3 线与 `pushHud()` 零改动） |

**worldId 口径核对**：上游 `Map.cs:22` `worldId => IsMod(id) ? 0 : (categoryId-1)/100`；我们的 `parse-map.js:297`
是**同一条**（`Math.trunc((category-1)/100)`，Mod 图同判据）。发行数据实测**要塞只有两座**【样本 `Data/Maps/*.xml`】：

| 星球 | 成员（按 `category`） | 本钮跳 | 该图实测 |
|---|---|---|---|
| world **0** | `category 1–100`（221 张：普兰特/海洋星等老星球 + `81` 自己 + `-70`「传送室」`cat=1`） | **`81`「英格瓦要塞」**（`cat=100`） | 光口 1 条 → `-70`；AS3 `maps.json` 有记录（`10008_1.swf`、`swfOk=true`） |
| world **1** | `category 101–200`（51 张：新星球 `101–105` + 站内/小屋 `200`） | **`10081`「精灵太空站」**（`cat=200`） | **光口 0 条**、4 只 NPC 全是 `openPanel CreateRoom`（联机 = 仍在 A 组围栏）；`maps.json` **无 AS3 记录**（`swfOk` 无从谈起） |

⚠️ **两张都是 JS 路**：分流反转（`AGENTS §4.16`）后 `SWF_ANNOTATED_IDS` **名单为空** ⇒ 背景一律吃 Unity 目录 PNG，
`81` 虽有可玩 SWF 也不进 SWF 路（要原画面就得把它逐个写进名单）。

⇒ 星球 0 的任意图点要塞 = `81`；星球 1 的任意图（例：`10017`「火山星深处」`cat=102`、`50000`「小屋」`cat=200`）= `10081`；
`M.unity` 取不到时退回 world 0 ⇒ `81`，**不猜**。⚠️ 易错一条：`-70`「传送室」是 `cat=1` ⇒ **world 0**，它点要塞进 `81`（不是 `10081`）。

**已知边界（如实登记，不修）**：① 本钮**无门禁**（照上游：`GoToMap` 不查等级/任务/活动，`notOpen` 只在 `mapId==0` 触发）；
② **在要塞图里再点要塞 = 重进同一张图**（上游同行为，`Teleport` 没有 `mapId==currentMapId` 短路）；
③ 跳转前**不寻路**（上游 HUD 侧直接 `TeleportHandler.Teleport`，只有光口那条走 `Transport` 寻路 ⇒ 我们同口径）；
④ **进了 `10081` 出不来（数据侧事实）**：该图光口 0 条、NPC 走未建的联机 ⇒ 只能靠地图下拉/大地图/返回上一图离开。
   同族 `10082`「太空站左翼」（`10082 → 10083`）不是本钮的目标 —— **本钮恒跳 `worldId*10000+81`**（照上游，不扩写）。

**等人手测确认项**：① 在星球 0 的图（`-70` 传送室 / `100` 信奉广场）点要塞 ⇒ 应进 **`81` 英格瓦要塞**，
且进去后**那颗光口能回 `-70`**；
② 在星球 1 的图（`10017` 火山星深处 / `50000` 小屋）点要塞 ⇒ 应进 **`10081` 精灵太空站**（背景 = Unity PNG，
两张要塞今天都是 JS 路）；该图 NPC 占位标记点得动、但出路是 `CreateRoom` ⇒ 如实报「面板/联机待建」，**不该有任何伪造内容**；
③ 日志行读得到「要塞 → 星球 N 的要塞图 M」，且**不弹**任何伪造面板；
④ 从要塞图**再点一次要塞**不应报错（重进同图）；⑤ 这条只加了一条跳转，HUD 收起态 / NPC 层 / 对话浮层 / 大小地图面板**均不受影响**。

### 12.8 底栏「炼狱」/「基地」钮 = 另两颗跳转钮（as-built · 人类 2026-10-19 要求完成，接 §12.7 同一族）

**同样不是面板**。把 `Map.unity` 里 13 颗底栏钮的持久化 onClick 全解析一遍【样本 `Assets/Scenes/Map.unity`】，
`OpenPanel` 与 `GoToMap` 两类是混着的：

| 节点 | 绑定 | 实参 | 语义 |
|---|---|---|---|
| `Hell`（炼狱） | `MapMenuController.GoToMap`（mode=3 = 吃 `m_IntArgument`） | **`1080`** | 跳「炼狱入口」（= 炼狱系列的门图，进去后自己走光口/`S思念体`） |
| `Home`（基地） | `MapMenuController.GoToMap` | **`50000`** | 跳「小屋」 |
| `Station`（要塞） | `MapMenuController.GoToStation` | （场景里那个 `m_IntArgument=81` 是**死数据**：`mode=1` 不吃参数） | 见 §12.7 |

⇒ 本批 = 两颗**定值跳转**（与要塞的"世界相对"跳转同一条链、不同算法），tooltip 照场景 `SetInfoPromptText` 的「炼狱」/「基地」。

| 件 | 落点 |
|---|---|
| 视图 | `restartHudView.js` `MENU` 的 `hell` 行加 `handler:'onHell'`、`home` 行加 `handler:'onHome'`（几何/素材不变） |
| 接线 | `mapScene.js` 的 `goToHudMap(label, mapId)`：一行 `logLine` → **`runTeleport(mapId)`**（同一台 `decideTeleport` 决议机）；`mountRestartHud` 多传这两个 handler |

**两张目标图的实测**（Unity 记录经 `parse-map.js` 现跑【样本 `Data/Maps/{1080,50000}.xml`】）：

| 目标 | `category` → world | 光口 | NPC | bg | AS3 侧（`maps.json`） |
|---|---|---|---|---|---|
| `1080`「炼狱入口」 | `10` → **0** | 1 条 → `1081`「欲望回廊」 | 1 只（`108001` `S思念体`，带 `dialog`） | `Resources/Maps/bg/1080.png` 在盘 | **有记录但名字错位**：AS3 `1080.xml` = 「欲望回廊」（= Unity 的 `1081`） |
| `50000`「小屋」 | `200` → **1** | 1 条 → `-70`「传送室」 | 4 只（`5000001…4`） | `Resources/Maps/bg/50000.png` 在盘 | **无 AS3 记录**（`MAPS` 259 张不含它） |

⚠️ **`50000` 的 `mod_home` 覆盖位 = 按既定口径不接**：上游 `TeleportHandler.Teleport` 在 `mapId==50000` 时读
`Activity.Find("mod_home").GetData("map_id","50000")`（存档侧键袋，**发行数据从不写该键**【样本 `unity/activities.json` 的 `mod_home` 行只有 `hide`】）。
正本 = **ACQ3 / TPC6**（`docs/architecture.md:72`、`docs/view/panel/activity/activity-design.md §8`）⇒ 本钮**恒跳 `50000`**，与本仓其它所有"进小屋"的入口同口径，不是本批新造的偏离。

**登记的既有口径后果（不是本批引入、如实记）**：`D2/D3` 两套血统并存 ⇒ ① **地图名横幅**读 `M.map.name`（AS3 列）
⇒ 点「炼狱」进 `1080` 后横幅写的是 **「欲望回廊」**（AS3 对这张的旧名），而 Unity 侧叫「炼狱入口」；
② **光口名/位置 = AS3、目标 = Unity**（`mergePortals`）⇒ `1080` 那条光口标成「传送室」却真的跳 `1081`。
（全库核过：AS3∩Unity 共 **137** 张同 id，其中 **55 张**两套名字不同 —— 这是地图线 `MDQ4` 合并条件没结完的老账，本批只把撞上的这张标出来。）

**等人手测确认项**：① 任意图点「炼狱」⇒ 应进 `1080`（`S思念体` 在屏上、能点、对话框能弹）、横幅名读到的是「欲望回廊」——**这条名不对是已登记的口径后果**，要改请先拍板；
② 在 `1080` 里点那条光口 ⇒ 落 `1081`（**别被"传送室"这个标签骗了**）；
③ 任意图点「基地」⇒ 应进 `50000`「小屋」，里面的光口能回 `-70`「传送室」（= 与 `990`「基地」光口那条同一条链，`TPQ3` 不弹"暂未开放"）；
④ 两颗钮的日志行分别是「炼狱 → 地图 1080」「基地 → 地图 50000」，**不该弹任何伪造面板**；
⑤ 连续点（`炼狱`→`基地`→`要塞`）不残留、不报错，`#npc`/`#portal`/对话浮层跟着换图干净重建。

### 12.9 底栏「灵兽」钮 = 开面板（as-built · 人类 2026-10-19 点名"实现 HUD 中'灵兽'图标的面板"）

**这颗是真面板**（区别于 §12.7/§12.8 的跳转钮）：`Map.unity` 里 `godpet` 节点绑 `MapMenuController.OpenPanel("SoulPet")` ⇒ 加载 `Resources/Panels/SpriteKing/`（类 `SpriteKingPanel`、面板 id `SoulPet`，同一面板两名 = 报告 A1）。族归属 = **C1 精灵面板族**（`docs/view/view-design.md §8` 把 `SoulPet`/`SpriteKing` 列入 C1；`view-panels-pet.md §64` 原判"⛔ 不在本份、无分析底座" ⇒ 本次补齐底座/设计/impl 三件套并订正该行）。

正本 = **`docs/view/panel/godpet/{restart-godpet-panel.md,godpet-design.md,godpet-impl.md}`**（GP1–9 / GPQ1–3 / as-built GPD1–8）。一句话落点：

| 件 | 落点 |
|---|---|
| 视图 | 新建 `game/app/view/godpet/{godpetPanel.js,index.js}`（L3/L4 DOM 自绘、零 import `game/logic/**`/`session`，读数与动作全经 `opts` 注入；`SOUL_PET_IDS=[981,982,983,984,990,985,986,987,988]`） |
| 接线 | `mapScene.js` `openRestartGodpet()`（单例 `GODPET_PANEL`）+ `soulGet/soulSet` 读写 `session.data.activityStorage['soul']`（`light[north]`/`done[north][10]`，经既有 `A.save()` 落 XML，**未新开 session.js 桥** = GPD1）+ `handlePanelLink` 加 `SoulPet` 分支、`ACT_UNBUILT` 摘 `SoulPet` + openPanel sink `/SoulPet/` 分支 + `mountRestartHud` 传 `onGodpet` + `unmount` 置 `GODPET_PANEL=null` |
| 周边 | `restartHudView.js` `godpet` 行加 `handler:'onGodpet'`（钮/盒几何不变）；`shopPanel.js` 顶栏「道具当钱」第三颗货币（希望之光 400016 = GPD3）；`hintbox.js` 新增 `contentHtml` 富文本口（两色希望之光文案 = GPD2）；`ui.css` `rb-godpet-*` 段 |

**行为边界（务必守住）**：① 三颗挑战钮（6v6/2v2/1v1）= **诚实"待建"提示**，**不开战、不写灯、不动道具** —— 多老大 `BattleMode.SPT/Special` 引擎规则仍锁 A 组（`AGENTS.md §4.1` / 报告 A6），通关点灯闭环随战斗一起不实现；② 灯位**只读展示** `soul` 袋 `light[north]`，灭格画暗空盒、**不伪造头像**；③ 兑换商店 = **注入现有 `ItemShopPanel`**（`item/limit/currency` = `Shop()` 那三行），商品自带 `currencyType:400016` ⇒ `shop.js` 逻辑层零改动；④ 领取约瑟 = `makeRestartPet(A,990,105)`+`addPet`，**只入包、Lv105 不参战**（越战斗等级钳属战斗侧另账 = 报告 A7）。

**等人手测确认项**：见 `godpet-impl.md §8` 十条（开板不叠层 / 规则浮层 / 三挑战诚实 / 亮格出真图 / 攒 50 扣 50 领 / 全亮免扣领 / 背包满回滚 / 兑换商店含希望之光余额 / 活动·图鉴 `SoulPet` 入口同板 / SWF·JS 两路一致）。

### 12.10 底栏「信箱」钮 = 开道具背包（as-built · 人类 2026-10-19 要求"把信箱图标的按钮效果改为打开道具背包"）

- **改法（最小 diff）**：`restartHudView.js` MENU 表 `mail` 行加 `handler:'onItemBag'` + `title`（hover 说明改接事实）；`mapScene.js` 的 `handlers.onItemBag` 早已接好 `openRestartItemBag`（U4 道具背包），**装配点零改动**。钮盒几何 `[730,507.5,25,20]`、图标 `menu/mail.png`、DOM 标签「信箱」、NEW 角标 —— 全部不变（人类点的是**这颗钮的效果**，不是重画这颗钮）。
- **上游语义不受影响**：`Map.unity` 里这颗节点仍绑 `OpenPanel("Mailbox")`；Mailbox 面板本身**仍是待建**（`ACT_UNBUILT` 的 `Mailbox` 行不动）。本条 = 重启线把这颗空位钮**借用**为道具背包入口，非"实现了信箱"。
- **与栏底「道具」格的关系**：R2 队伍栏底部那格额外入口（§3.5 登记的"截图未覆盖"）曾与之共用 `onItemBag`；**人类 2026-10-19 追记点名摘除** ⇒ 该格 DOM + CSS 已删（§3.5 偏离关闭），道具背包在 HUD 上的唯一入口 = 这颗信箱钮。
- **已知连带（如实登记）**：既有布局测试 `tools/rbattle-hud-layout-test.mjs` 的判据 9（`.rbh-rail-item` 期望盒）与 10a（点「道具」格开面板）会因这格摘除而**判红**；按 §1.1 不新增/不改测试脚本，人类复跑时把这两条视为**已作废断言**（后续由人类决定是否清理）。
- **待建口径更新**：诚实「待建」的五颗（新闻/任务/信息/指引/信箱）⇒ 剩**三颗**（新闻/任务/信息）—— 信箱本条改接道具背包，指引于 **2026-10-20** 接疑难指引面板（§12.11）。
- **等人手测确认项**：点底栏「信箱」钮 ⇒ 弹出道具背包面板；hover 该钮的提示应说明"信箱钮改开道具背包、Mailbox 仍待建"。

### 12.11 底栏「指引」钮 = 开疑难指引面板（as-built · 人类 2026-10-20 点名"完成主场景 HUD 中的「指引」图标的面板"）

**这颗是真面板**：`Map.unity:12150` 里 `guide` 节点绑 `MapMenuController.OpenPanel("GuideLine")` ⇒ 加载 `Resources/Panels/GuideLine/`（`GuideLinePanel.cs` 8 行空壳，逻辑全在预制 + 复用 MVC）。族归属 = **C3 地图/世界族**（`docs/view/view-design.md §8` 把 `GuideLine` 与 WorldMap/MiniMap/SPTBoss 同列）。

正本 = **`docs/view/panel/guide/{restart-guide-panel.md,guide-design.md,guide-impl.md}`**（报告 A1–A14 / 设计 GD1–GD10 + GDQ1–3 建议默认 / as-built GDD1–GDD10）。一句话落点：

| 件 | 落点 |
|---|---|
| L0 查表 | `game/core/pet/element.ts` 新增 `getAttackRelation`/`getDefenseRelation`（表列 = 我打谁、表行 = 谁打我，对位 `PetElementSystem.cs:177-194`）；`game/core/pet/status.ts` 新增 `getPersonalityBuffDescription`（对位 `Status.cs:363-377`）；`node tools/build-core.mjs` 重生成 |
| L2 出口 | `content.js` `elementRelationLists(id,mode)` / `ELEMENT_COUNT` / `PERSONALITY_STAT_NAMES` / `personalityRows()` / `personalityBuffDescription`（性格名由 `PERSONALITY` 反查，不写第二张表） |
| 视图 | 新建 `game/app/view/guide/{guidePanel.js,index.js}`（L3/L4 DOM 自绘、零 import `game/logic/**`/`session`；窗 570×400、4 页签 + 游标、23 格属性页、55 行性格页） |
| 接线 | `restartHudView.js` `guide` 行加 `handler:'onGuide'`（钮/盒几何不变）；`mapScene.js` `openRestartGuide()`（单例 `GUIDE_PANEL` + Noob 诚实提示）+ `handlePanelLink` 加 `GuideLine` 分支 + openPanel sink `/GuideLine/` + `mountRestartHud` 传 `onGuide` + `unmount` 置 `GUIDE_PANEL=null`；`ui.css` `rb-guide-*` 段 |

**行为边界（务必守住）**：① **只读查表、零写盘**：无领取/购买/存档动作；② 关系区**不照搬上游 12/12/1 截断**（`精灵王` 攻击克制 22、防守被微弱 21 全部可达，区内滚动 + 数量标题）；③ 「新手指引」是上游跳转钮（关本面板开 `Noob`），`Noob` 未建 ⇒ 只弹诚实提示、**本面板不关**（design GDQ1）；④ 不画上游死翻页（`lastPage=0`）、不复活性格页的 `Table`/`Relation`/`Note` 死块、不画恒中性的体力列；⑤ 属性名显示补「系」（上游运行期丢「系」，显示层目标）、防守脚注改为"受到伤害"语境（上游复制粘贴错位 = 报告 A6）。

**等人手测确认项**：见 `guide-impl.md §8` 十条（开板 / 切页与 Noob 诚实提示 / 攻击页查表 / 精灵王 22·21 全可达 / 防守语义 / 55 行性格与选中说明 / 缺图不伪造 / 零写盘 / SWF·JS 两路一致 / NPC 第二入口）。
