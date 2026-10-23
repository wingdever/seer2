# 开始场景 / 选择角色场景 · 实现文档（view-scene-start-impl.md）

> 上游 = `docs/view/scene/start/view-scene-start-design.md`（设计）。本文把设计落成**逐文件、逐函数、逐类名**的施工图；两者冲突时以设计的**口径**为准、以本文的**具体做法**为准；实现结束后另起 **§9 As-built**，**冲突以 As-built 为准**（沿 `docs/view/scene/battle/view-scene-battle-impl.md` 那套纪律）。
> **状态：STB-a/b/c 已落（2026-10-18）**，**等人类手测**；口径以 **§9 As-built** 为准。
> ⚠️ 记号：`[待建]` = 尚未编码；`[已建]` = 已落地（见 §9.1）。STB-d/e 仍卡 **Save 线**（`game/logic/save/**` 不存在）。
> 权威视觉目标 = 人类实测版面正本 `docs/view/scene/start/start-scene-desc.md`（**非我们撰写，保持原样**）。
> ⚠️ **验收口径**（`AGENTS.md §1.1` / 决议 ⑦）：**不新写测试/探针脚本**；验收 = **人类把游戏跑起来手测 + 反馈**（看 §8）。

---

## 0. 铁律（实现期逐条自检）

1. **不碰 `game/core/**` 与 `game/logic/**` 内部**（STI6）。start 场景只经 **`game/logic/save/repository.js`**（§6.2）取数/写档，view 不碰 `localStorage`、不解析 XML（决议 ③）。
2. **零算数**（STI3）：view 只做取数 / 拼接 / 显隐 / 纯 CSS 动效，不自己算版本比较与槽位。
3. **不伪造内容**（STI2）：**资源包 / Mod 无浏览器后端 ⇒ 灰化 + 说明**，绝不画假子面板；**导入存档是真功能**（XML 文件 + Save 线校验 + 失败说明），缺素材打 `data-asset-missing="…"`。
4. **两套血统不合并**（STI4）：素材只取重启 `Assets/StaticResources/Sprites/Title/**`；AS3/Ruffle 线零改动。
5. **入场动效忠实但不复现上游竞态**（STI9）：背景先到位，图标/工具条后演。
6. **弹窗走 A3/Hintbox**（STI10）：不自造对话框。
7. **改完 JS/CSS 硬刷新再验**（`AGENTS.md §3` / `docs/arch-code.md §7.1`）：dev server 不发 `Cache-Control`，给共享模块加新导出后**旧缓存会炸链接期**。

---

## 1. 变更文件清单（`[待建]`）

| # | 文件 | 动作 | 内容 |
|---|---|---|---|
| **S1** | `game/app/router.js` | **微增** | `SCENES` 加 `title` / `login`；`import` 两场景（§2.1） |
| **S2** | `game/app/main.js` | **微增** | 无 hash 时默认进 `#/title`（STQ4；`#/map` 直进保留） |
| **S3** | `game/app/scenes/titleScene.js` | **新建** | 开始场景壳：`mount/unmount` + 挂 `titleView`（§3） |
| **S4** | `game/app/scenes/loginScene.js` | **新建** | 选择角色场景壳：`mount/unmount` + 挂 `loginView`（§4） |
| **S5** | `game/app/view/start/titleView.js` | **新建** | 开始场景 DOM（背景 / 图标 / **底部 HUD**：版本占位 + 开始钮 + 三钮）+ 入场动效 + 悬停（§3、§7） |
| **S6** | `game/app/view/start/loginView.js` | **新建** | 选择角色 DOM（标题 / 3 格 / 导入钮 / **建号面板**）+ 状态机（普通 / 导入态 / 建号态）（§4） |
| **S7** | `game/app/ui.css` | **新增 `.rst-*` 段** | 版式、背景层、动效 keyframe、悬停过渡（§5） |
| **S8** | ~~`game/app/content.js`（L2 版本出口）~~ | **取消** | **STQ5 = 暂不处理** ⇒ 版本两行恒显占位，不建 L2 出口 |
| **S9** | ~~`game/logic/saveSlots.js`~~ | **取消** | ⚠️ 我先前发明的槽位 API 与 Save 线冲突（见 §6.2 留档）：**3 槽与 XML 档 Save 线早已定**，入口 = `game/logic/save/repository.js`，**本份不新建** |
| **S10** | `game/app/view/start/saveFiles.js` | **新建** | 文件选择/下载的**薄壳**（§6.3）：读 `save{id}.xml` 文本喂 `importXML`、`exportXML` 结果落盘；**不解析 XML** |
| **S11** | ~~`game/app/scenes/mapScene.js`~~ | **取消（改归编排线）** | ⚠️ **2026-10-18 订正**：原计划的"`APP.gid` 临时桥"**不做了** —— 编排线**第一刀**（`ORB1 × ORB4-a`，`docs/orchestration/orchestration-impl.md §3.2`）把地图场景的存档载入**整段**搬进 `session.js`，**地图场景不再自己载档**（也不再有 `loadRestartSession`）。B5 只做"选定槽位 ⇒ 交会话"（§6.4） |
| **S12** | `game/logic/save/**`（**归 Save 线**） | **依赖（不在本份）** | B5 的选档/建号/导入全靠它 ⇒ **Save 线未落码前，STB-d 起不来**（§8.3 回执 ①） |
| **S13** | `docs/view/view-design.md §8` / `docs/arch-docs.md §0.1` / `docs/architecture.md §1.1` / `docs/save/save-design.md` | **收尾更新** | B5 行归位、目录树、范围记账（**已随设计一并改**，见 §9）、Save 线回执 |

**不改**：`game/core/**`、`game/app/scenes/{map,battle,rbattle}Scene.js`（存档载入归编排线第一刀）、`game/app/view/panels/host.js` 的 `openPanel/closePanel` 契约、AS3 线（`game/maprunner/**`、`#/battle`）。
`game/app/scenes/mapScene.js` **本份一行都不改**（S11 已取消，改归编排线第一刀）。
`game/logic/**` **本份一行都不动**（含 `restartSession.js`：按 S-决策 1 由 Save 线退役，**不迁移**）。

---

## 2. 骨架施工图

### 2.1 `router.js`（S1）

```js
// 现有: const SCENES = { map, battle, rbattle }
import * as titleScene from './scenes/titleScene.js'
import * as loginScene from './scenes/loginScene.js'
const SCENES = { title: titleScene, login: loginScene, map: mapScene, battle: battleScene, rbattle: rbattleScene }
```
- `parseHash` 的默认名 `'map'`（`router.js:14`）**保持**（`main.js` 负责"无 hash ⇒ 先落到 title"，不在这里改默认，避免 `#/` 空 hash 与"未进入"混淆）。
- `go('login')` / `go('map')` 复用现有出口（`router.js:32`）。

### 2.2 `main.js`（S2）

```js
// 现: route()   ——  改为缺省入口
if (!location.hash) location.hash = '#/title'   // STQ4：正式开始流程；#/map 仍是直进捷径
route()
```
- **不动** `#rvDemo` 那段（仍导到 `#/rbattle`）。

---

## 3. `titleScene.js` + `titleView.js`（S3、S5）

**场景壳**（S3）：`mount(query)` 建 `#wrap` 内容（或交给 view）→ `titleView.mount(el)`；`unmount()` → `titleView.unmount()`（清 DOM / 摘监听 / 停 `<video>`）。

**view**（S5）——DOM = 设计 §3.1 的树。关键点：

| 件 | 做法 |
|---|---|
| `.rst-bg` | `<img src="/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Title/FirstPage.jpg">`（STQ6）；铺满 + `object-fit:cover`；可加 `TitleBackgroundMotion` 的"呼吸"（scale 0.015 / offset(4,3) / cycle 8s，纯 CSS 或 rAF） |
| `.rst-icon` | `Seer2 New Icon.png`；入场 = **横向擦出**（`clip-path: inset(0 100% 0 0)` → `inset(0)`）+ `scaleX 0.08→1`（对应上游 `fillAmount` + `scale`） |
| `.rst-toolbar` | **底部 HUD 右区**（人类 desc：三钮在右下）；`StartToolbar.png` 作底；内含 `.rst-tool[data-tool=resource|mod|help]`；入场 = `translateY(36px)` + `opacity 0→1`（delay 0.16s） |
| `.rst-version` | 左：`.rst-version-date` + `.rst-version-string`；**恒占位** `----/--/--` / `----` + `data-version-missing`（STQ5 = 暂不处理，**不编造数字**） |
| `.rst-startbtn` | 中：`StartButton.png`；点击 ⇒ `go('login')`（**必进**，不复制上游"版本不符禁用"） |
| 工具三钮 | `resource`/`mod` → **灰化**（`.is-disabled`）+ 点击走 A3 说明（STQ3）；`help` → 弹帮助文案（A3） |

- 悬停反馈：`.rst-tool` / `.rst-startbtn` 用 CSS `transition: transform`（放大 1.06 + 上浮 4px）+ `transform-origin` 补偿（对应上游 `TitleToolbarButtonHoverFeedback.GetPivotCompensation`）。

---

## 4. `loginScene.js` + `loginView.js`（S4、S6）

**场景壳**（S4）：同 S3 形制。

**view**（S6）——DOM = 设计 §3.2：

| 件 | 做法 |
|---|---|
| `.rst-login-bg` | `Login Background.png`（+ 可选 `-Noise`/`-Stripe` 层） |
| `.rst-login-title` | `Choose Role.png`（或文本"选择角色"），居中 |
| `.rst-roles` | **3** 个 `.rst-role[data-slot][data-empty]`；`repository.load(storage,{gid})` 的投影 ⇒ 昵称 / 性别图标 / "空"（昵称空） |
| **点格（普通态）** | 满档 ⇒ 置 `.is-chosen` ⇒ **建立会话** + `go('map')`（§6.4）；空档 ⇒ 开建号面板（§4.1） |
| **点格（导入态）** | ⇒ 打开文件选择（§4.2） |
| `.rst-import` | `Other User Login.png`；点击切 `is-importing`（文案→"选择要覆盖的存档"），**再点一次取消** |
| `.rst-create` | 建号面板：昵称 `<input maxlength=?>` + 男/女 + 确认/取消（§4.1） |

### 4.1 建号（STQ7 = 要做）

```
点空档 ⇒ .rst-create 显示（记住 gid），焦点进昵称输入
确认   ⇒ 昵称 trim 为空 ? 就地红字"昵称不能空白"（不关面板）
        : g = repository.load(storage, { gid })
          g.nickname = name; g.gender = gender
          repository.save(storage, gid, g)      // ⚠️ 不是 newGame（那会重置宠/币）
          ⇒ 刷新该格 ⇒ 立即进入（等价于点该格满档路径）
取消   ⇒ 隐藏面板、清空输入
```

- **默认性别**：`male`（上游建号也是先给一个默认值再让玩家点）。
- **昵称长度**：按上游输入框口径取上限（若上游未限 ⇒ 本份限 12 字符，登记 `data-*` 说明）。
- **新档内容**：**Save 线的事**（上游 `GameData.GetDefaultData(2000, 0)` = 6 只初始宠 + 2000 币 + 1 道具）——
  本份**一个数值都不写**：默认档由 `repository.load` 按上游口径生成（`newgame.js`），我们只**覆盖昵称/性别**。

### 4.2 导入存档（STQ3 + STQ8 = **XML**）

```
点 .rst-import            ⇒ 视图 is-importing（格子显示 .rst-role-cover）
点某格                    ⇒ <input type="file" accept=".xml,text/xml"> .click()
onchange                  ⇒ FileReader.readAsText(file) → xml 文本
                            → repository.importXML(storage, gid, xml)   // 解析/校验全在 Save 线
成功 (ok=true)            ⇒ A3 "导入成功"（1 钮）→ 重载该格（不 reload 整页）
失败 (ok=false / 读取异常)⇒ A3 "导入失败：<errors 或原因>"（列出，不吞）
always                    ⇒ 退出 is-importing；input.value = ''（同一文件能再选）
```

- ⚠️ **格式就是上游那个**（`save{id}.xml`）⇒ **原版存档应能直接导入**，不需要映射（STQ8 修正后）。
- **不损坏原档**：`importXML` 先解析校验、**ok 才写**（`docs/save/save-code-map.md §2.5`）；失败路径不触碰存储。

---

## 5. `ui.css`（S7）

- 新增 `.rst-*` 段（**不改** `.rv-*` / `.rbh-*` / `.rbb-*`）。
- 逻辑坐标 960×540（`match` 模式，A1 `host.js`）；背景/大图用 `object-fit` 而非拉伸（禁止非等比拉伸，A1 §3.2）。
- 动效优先 **CSS `@keyframes` / `transition`**（零 JS 计时）；需要与上游参数对齐的（delay 0.05/0.16、duration 0.45/0.42）写死常量并注释来源。
- `@font-face`：**沿用**战斗版式已引入的 `RbbUi`(Zongyi) / `RbbNum`，start 屏不新增字体（`docs/view/scene/battle/view-scene-battle-impl.md §2.6`）。

---

## 6. 接线

### 6.1 版本（**STQ5 = 暂不处理 ⇒ 本节无施工**）

- 版本两行**恒占位** `----/--/--` / `----` + `data-version-missing="1"`；**不建** L2 出口、**不** fetch `version.xml`（view 读原始数据 = 破层）。
- ⚠️ **不做**上游的 `CheckBuildVersion`/`CheckResourceVersion`（含编造大小，怪癖 A3/A4）——我方"开始游戏"**不做版本门**。

### 6.2 3 槽存档（**Save 线早已定 · 本份只调** · STQ2）

> ⚠️ **留档：本节我先写错过。** 我原先在 `game/logic/saveSlots.js` 里发明了 `listSlots/loadSlot/createSlot/overwriteSlot/exportSlot`
> 和"v3 单档迁移"，**全与 Save 线冲突**（人类 2026-10-18 指出）：存档是 **XML**（**S-决策 1**，`docs/save/save-impl.md:5`），
> 3 槽是 **`gid 0..2`**（`docs/save/save-code-map.md §4`），入口是 **`repository.js`**（同文档 §2.5），v3 **退役不迁移**。
> ⇒ **本份不新建任何存档模块**。下面就是全部接线。

```js
// ⚠️ 落码时这条**搬到了场景壳**（`game/app/scenes/loginScene.js`）——L3 不许 import L1/L4，见 **§9.2 偏差 10**。
import * as repo from '../../../logic/save/repository.js'   // 设计 §4.1

// ① 3 格投影（忠实上游 LoginManager 也是循环 LoadData(0..2)；缺档由 load 自动造，见 STI11）
const roles = [0, 1, 2].map(gid => {
  const g = repo.load(storage, { gid })
  return { gid, nickname: g.nickname, gender: g.gender, isEmpty: !g.nickname }
})

// ② 建号（§4.1）
const g = repo.load(storage, { gid }); g.nickname = name; g.gender = gender
repo.save(storage, gid, g)

// ③ 选档进图
const g = repo.load(storage, { gid })   // → 交会话（§6.4）
```

- ⚠️ **没有 `createSlot` / `listSlots`**（我先前发明的）：建号 = `load` + 改两字段 + `save`；预览 = `load` 的投影。
- ⚠️ **`storage` 从哪来** ⇒ ✅ **已决（人类 2026-10-18）：由编排线装配点注入**（`docs/orchestration/orchestration-design.md §6`）——
  B5 **不自建 storage**、不自己选 `fsStorage`/`localStorageAdapter`，只从装配点取（§8.3 ①′）。
  ✅ **落点（2026-10-18）**：`game/app/runtime/bootstrap.js` 创建 ⇒ 挂在会话上（`session.storage`），B5 从会话取
  （`docs/orchestration/orchestration-impl.md §2.6/§3.3`）。
- ⚠️ **不写迁移**：S-决策 1 = v3 退役、**不迁移**（§8.3 ②）。

### 6.3 导入 / 导出（S10 · STQ3 + STQ8 = **XML**）

- 导入：`repo.importXML(storage, gid, xmlText)` → `{ ok, errors, data? }`；**view 不解析 XML**（STI7）。
- 导出：`repo.exportXML(g)` → `Blob([xml], {type:'text/xml'})` → `<a download="save{gid}.xml">`。
  **文件名与上游一致** ⇒ 导出的档真游戏/另一格都能直接吃（**可互通**，`docs/save/save-impl.md §6`）。
- 文件选择器：`accept=".xml,text/xml"`。

### 6.4 会话与切场景（STI5）

- 选满档 ⇒ 交 **编排线会话**（上游 `Player.instance.gameData` + `GameState.Login`）⇒ `changeScene('map')`。
  **调用形状（2026-10-18 定）**：
  ```js
  const g = await repo.load(session.storage, { gid, login: true, tables: await ensureTables() })   // 登录那一次才 login:true（§9.6 第 2/6 条）
  adopt({ gid, data: g })                                      // ← 编排线唯一入口（不新建第二套会话）；⚠️ 是 session.js 的**模块导出**，不写成 session.adopt（§9.2 偏差 20）
  go('map', { slot: gid })                                     // ✅ 落码：槽位随路由走（§9.2 偏差 11）；⚠️ 不用 sceneLoader（会循环 import）
  ```
- ⚠️ **原先的"`APP.gid` 兜底"（S11）已取消**：编排线**第一刀**（`ORB1 × ORB4-a`）把"地图场景自己载档"整段收进会话
  （`docs/orchestration/orchestration-impl.md §3.2`）⇒ 本份**不再碰 `mapScene.js`**，也不需要跨场景 handoff 的临时桥。
- ⚠️ **开工前提 = 编排线第一刀落码**（该文件 §3.1 的批序表；**不含** ORB2 —— `changeScene` 可由 `router.go('map')` 顶替，接口名以落地为准）。

---

## 7. 入场动效小结（S5 · STI9）

| 元素 | 上游参数 | 我方 |
|---|---|---|
| Game Icon | delay 0.05s / dur 1s（场景值） / scaleX 0.08→1 / 横向擦出 | CSS 同参；**背景先到位再演**（不复现 A10） |
| Toolbar | delay 0.16s / dur 0.42s / 上浮 36px / alpha 0→1 | CSS 同参 |
| 悬停 | 放大 1.06 / 上浮 4px / 指数缓动 | CSS `transition`（近似），pivot 补偿 |

---

## 8. 验收（**人手测** · 决议 ⑦）

> **不新写脚本**。以下由**人类把游戏跑起来**确认（对应设计 §8.2）：

1. 直接开游戏 ⇒ 落在**开始场景**（STQ4）；`#/map` 直进仍可用。
2. 开始屏：背景 → 图标擦出 → 工具条上浮，**顺序对、不闪、图标不被遮**（STI9）；版本两行显 `----/--/--` / `----` 且**不像是坏了**（STQ5）。
3. 三钮悬停可感；`resource` / `mod` **灰化**且点击有说明、**不出假面板**（STI2）。
4. 点"开始游戏" ⇒ **必进**选择角色（无版本门）。
5. 选择角色：标题居中、**3 格**；点满档进图；**点空档开建号**；昵称留空被挡；建完**直接进游戏**，回来该格显示昵称 + 性别（STQ7）。
6. **多档**：槽 1 建号后槽 2/3 仍空；分别进入**互不串档**（宠/道具各归各）（STQ2）。
7. **导入**：点"导入其他存档" ⇒ 文案变"选择要覆盖的存档" ⇒ 点格选 `save{id}.xml`（**上游真档也应能直接吃**）⇒ 覆盖成功；选乱文件 ⇒ **明确说明且原档不坏**（STQ3/STQ8）。
8. **导出→导入互喂**：导出某格 → 把该 `save{id}.xml` 导回另一格 ⇒ 内容一致（§6.3）。
9. **老档**：⚠️ 人类 2026-10-18 已决 = 照 Save 线 **S-决策 1** 旧 v3 进度**原样丢弃、不迁移** ⇒ 旧进度**不再出现是预期**，不是 bug。

---

## 9. As-built（**STB-a/b/c/d/e 已落 · 2026-10-18**）

> 实际落地文件、与蓝图的偏差、`data-*` 标记、待办关闭情况记在此处；**冲突以本节为准**。
> **已落批次 = STB-a（骨架）+ STB-b（开始屏视觉）+ STB-c（选角屏视觉）+ STB-d（槽位/建号/进图接线）+ STB-e（导入）**；
> **STB-f 未落**（资源包/Mod 的灰化与帮助文案收尾）。
> ⚠️ 本节**不含验收结论**（`AGENTS.md §1.1` 决议 ⑦：验收 = 人类手测）—— 只记"做了什么 / 与蓝图差在哪"。

### 9.1 落地的文件（`[已建]`）

| # | 文件 | 动作 | 实况 |
|---|---|---|---|
| S1 | `game/app/router.js` | 改 | `SCENES` 加 `title` / `login`（`parseHash` 的缺省名仍 `map`，同蓝图） |
| S2 | `game/app/main.js` | 改 | 无 hash ⇒ `#/title`；`#rvDemo` 那段未动 |
| S3 | `game/app/scenes/titleScene.js` | 建 | `setCanvasMode('match')` + `openPanel('rst-title')` + 退出还 `fixed` |
| S4 | `game/app/scenes/loginScene.js` | 建→**改（STB-d/e）** | 同上（面板名 `rst-login`）；**存档读写全在本壳**：`projectSlots()`（3 格投影）· `onCreate()`（建号）· `onImport()`（导入）· `onEnterMap()`（`login:true` → 会话导出 `adopt()` → `go('map',{slot})`） |
| S5 | `game/app/view/start/titleView.js` | 建 | 背景 / 图标 / 底部 HUD（版本占位 + 开始钮 + 三钮）+ 入场 / 悬停 |
| S6 | `game/app/view/start/loginView.js` | 建→**改（STB-d/e）** | 标题 / 3 格 / 导入钮 + 两段式导入态 + 建号面板；**只收数据与回调**（`slots` / `onCreate` / `onImport` / `onEnterMap`），**不 import 存档层与会话**（L3 纪律，见 §9.2 新偏差 10）；导出 `mount(el,opts) → {el, update(slots), destroy()}` |
| S8 | `game/app/ui.css` | 改（STB-d/e，**再改 2026-10-18**） | `.rst-role-gender` 改成 18×18 方徽章（裁 `Male.png`/`Female.png` 的符号本体）；新增 `.rst-role.is-chosen`；**新增 `.rst-role-robot`（机器人，与光柱同款、只满档显示）**（§9.2 偏差 23） |
| S7 | `game/app/ui.css` | 改 | 追加 `/* ---- 开始场景 / 选择角色场景（B5 · rst-*）---- */` 段（**只加不删**） |

### 9.2 与蓝图的偏差（逐条）

1. **view 接口 = `mount(el, opts) → handle{el, destroy()}`**（蓝图 §3/§4 写的是 `view.mount(el)` + 模块级 `unmount()`）。改成返回 handle：避免模块级单例，场景退出时 `destroy()` 明确摘监听/拆 DOM。
2. **两个场景都用 `openPanel` 挂进宿主逻辑画布**（蓝图的 mermaid 已指向 `host.js`，此处把它定死）：960×refH 逻辑坐标与缩放全由 A1 的 host 提供，view 不自算几何。
3. **`.rst-bottom` 是一个整体**（蓝图 §3 只画了树）：底 = `StartToolbar.png`（实测 1493×346；条带 y 177..258、中心球 r=86 @ (746,174)）。**开始钮是叠在条带中心球上的 `StartButton.png`**（实测球体 bbox 174px ⇒ 目标 110.6px，缩放 0.6356）。版本 = 条带左段、三钮 = 条带右段。
4. **版本两行恒占位**（`----/--/--` / `----` + `data-version-missing="1"`）—— STQ5 = 暂不处理，**不 fetch `version.xml`**。
5. **导入钮不覆盖文案**：`Other User Login.png` 里"用其他角色登录"是**烤死在图上**的 ⇒ 上游那句"文字改成『选择要覆盖的存档』"改成**按钮上方一行提示**（`.rst-import-hint`，仅导入态显示）。**这是对上游行为的有意让步**，请人测确认可接受。
6. **建号面板的坐标是从 `Nickname Field.png` 量的**：底图 1202×663 → 画布 ×0.8 ⇒ 输入框 `(392,370,188,32)`；性别两钮放进底图自带的银色框体（画布 x 364..604 ⇒ 两枚 114×55）。**确认/取消不在底图里**（推断位置 y≈470）。
7. **格子的外观是 CSS 画的**；`Login Effect.png`（490×404）与 `Robot/7001.png`（96×149）的用法见 **偏差 21 / 23**（原记"`Login Effect.png` 未使用"已作废）。
8. **`.rst-title` 未做"全屏去页面 chrome"**（战斗线有 `body.rbb-full`）：start 两屏仍画在 1200×660 的 `#wrap` 舞台上，页面 h1/日志框照旧可见。若要与战斗一样全屏，另开一批。
9. **入场门 = 背景图 load 完**（`.is-ready`）：动效全在 CSS，JS 只等图（无计时器）⇒ 满足 STI9"背景先到位"。
10. **⚠️ 接线落在"场景壳"而不是 view 里**（**STB-d/e，2026-10-18**；覆盖 §6.2 那句"view 里唯一的存档依赖"）：
    `game/app/view/**` 是 **L3**，**不许** import L1 `game/logic/**` 或 L4 `session.js`（`docs/arch-code.md §3` 第 3 条，唯一登记例外 = view → `content.js`）。
    ⇒ `repository.load/save/importXML` 与会话导出 `adopt()` **全在 `loginScene.js`**；view 经 `opts` 收 `slots`（投影结果）与三个回调（零算数 STI3 照旧：view 只做取数与显隐）。
11. **槽位随路由走**：进图 = `go('map', { slot: gid })`（`#/map?slot=N`），**不是** §6.4 写的裸 `changeScene('map')` ——
    因为**编排线第一刀**把"地图场景自己按路由槽位读档"定死了（`docs/orchestration/orchestration-impl.md §3.2 ③`）；
    不带 `slot` 时地图场景会按 `gid = 0` 取会话（本份不引入第二个"当前槽位"的隐式状态）。
    ⚠️ 也因此**没走** `sceneLoader.changeScene()`：`sceneLoader → router → scenes/loginScene → sceneLoader` 会成**循环 import**
    （`docs/arch-code.md §7.1` 那个"链接期抛错 = 载入中黑屏"的坑）⇒ 用已 import 的 `router.go`。ORB2 落地时再统一。
12. **`load` 必须带 `tables`**：Save 线的 `load` 对**缺档**走 `newGame`，而 `newGame` 要 `opts.tables`（否则抛）⇒
    会话新导出 **`ensureTables()`**（`game/app/session.js` 的**模块导出**，见偏差 20），本场景每次 `load` 都传它。
    ⇒ **副作用（预期，STI11 口径）**：**首次进选角屏会给 3 个缺槽各造一份默认档并落盘**（`saves/save{0,1,2}.xml`），与上游"缺档 ⇒ 默认档、昵称为空"同形。
    ✅ **人类 2026-10-18 复核拍板 = "首次进入选择的角色就造出新档，没错，这就是我要的，而且符合上游行为"** ⇒ **保持现状**（不改惰性造档）。
13. **建号只覆盖两个字段**：`load`（缺档已造好默认档）→ 改 `nickname`/`gender` → `save`，**不调 `newGame`**（避免二次掷宠/币）。
    ⚠️ 与上游 `CreateRoleController.CreateRole()` 的差别：上游是 `GetDefaultData(2000,0)` **重建**一份再填两字段 + `Mail.DailyLogin()`；我们复用已造的默认档（等值，且不重掷）。`Mail.DailyLogin()` = Save 线 `finishNewGame` 的跨天登录（已落）。
14. **`gender` 的布尔口径**：`GameData.gender` 是 **bool 且 `false` = 男**（证据见 `loginScene.js` 的 `genderOf` 注释：`CreateRoleModel.gender` 初值 `false` + `CreateRoleView` 取 `gender ? 1 : 0` 高亮 `genderImage[chosen]`，而 `Login.unity` 的 `genderImage[0]` GameObject 名 = `Male`）。
15. **角色格的性别图标改成方徽章**：原 CSS 是 26×14 拉伸整张 `Male.png`（156×84）⇒ 小到看不清；
    改为 18×18，取符号本体窗口（`background-size:70.2px 37.8px; background-position:-21.6px -13.5px`，实测符号 bbox 男 `55..78×33..63` / 女 `50..68×38..64`）。
16. **`.rst-role.is-chosen` 是新增样式**（设计 §3.2 提了"先置选中态"，但 §7 的 CSS 清单没给样式）：与 `:hover` 同款高亮，进入失败时移除。
17. **`loginView` 不再导出 `SLOT_COUNT`**（格数现在 = `opts.slots.length` = Save 线 `MAX_SAVE_COUNT`）——本份不自己硬写 3（§9.6 第 3 条的纪律）。
18. **取数失败不留黑屏**：`projectSlots()` 抛错时 **照样挂出画面**（3 格按"空"画），再用 A3 把原因与"手测请用 `node tools/serve.mjs`"说清 —— 不静默、也不留白屏。
19. **文件选择器还有 `oncancel`**：新版浏览器"取消选文件"触发的是 `cancel` 而非 `change` ⇒ 两条都用来退出导入态（老浏览器没有该事件时退化为"停在导入态"，不影响正确性）。
20. **⚠️ 修一处落码错误（2026-10-18 手测首报）**：`game/app/scenes/loginScene.js` 原写 `session.adopt({gid,data})` ⇒
    进图抛 **`session.adopt is not a function`**。根因 = `adopt`/`ensureTables` 是 `game/app/session.js` 的**模块级导出**，
    **不是** `session` 对象上的方法（对象上只有 `gid/storage/data/state/active/random/...` 这些字段）。
    ⇒ 改成 `import { session, adopt, ensureTables }` 后**直接调 `adopt(...)`**；同一类错误在 `state.js` 的注释里也埋过一句
    （已改成"会话的 `takeResult()`（模块导出，不是对象方法）"）。**教训（2026-10-18 一天内踩了两次，第二次见编排线 impl §7.1 偏差 12）**：
    本仓 `session.js` = 「**一个 `session` 对象（只装字段）** + **一批并列的模块级导出函数**」混合形状 ⇒
    ① 读/写**字段**用点名 `import { session } from '../session.js'`（`session.gid`/`session.active`…）；
    ② 调**动作**用点名 import 函数（`adopt(...)`/`ensureLoaded(...)`）；
    ③ ⚠️ **别用 `import * as session` 去读字段** —— 命名空间里只有**导出名**：`session.active` 曾因同名导出函数
    `active = () => session.active` 而读到**函数**（真值 ⇒ 跳过读档、`.state` 为 `undefined` ⇒ 黑屏）；
    该别名**已删**，`session.js` 尾部与 `orchestration-code-map.md §4` 都写死了这条纪律。
21. **角色格改用 `Login Effect.png`（人类 2026-10-18 拍板"先选用"）**：满档格加一层 `.rst-role-effect`（`inset:0`、`background-size:contain`、居中），
    **空档格照旧**是虚线框 + 斜纹占位 + "空档"字样（满档时占位底纹 `display:none` 让位）。
    真值（`Login.unity` 实测）：每格容器 GameObject 名 = **`Character`**，尺寸 **490×404**（= `Login Effect.png` 原尺寸），
    三格中心 x = **0 / ±325**（间隔 **160**），y = **−5（中格）/ +30（左右两格）**；参考分辨率 1920×1080 ⇒ 换到本画布 960×540 要**减半**。
    ⚠️ **没有照搬 490×404**：本格仍维持 STB-c 已手测通过的 **200×240**（左 140 / 上 96 / 间隔 40），图按 `contain` 居中塞进去。
    ⚠️ **上游是"三格都挂着这张图"**（`m_Enabled: 1`，与档空不空无关；只由 `Name Text` 是否为空区分）⇒ 我们**只在满档格显示**，
    好让空档的虚线框 + "空档"字样仍可读。**想改回"三格都亮"**：把 CSS 里 `.rst-role[data-empty="false"] .rst-role-effect` 的选择器去掉即可（一行）。
    ✅ **人类 2026-10-18 复核拍板 = "只在满档显示光柱即可"** ⇒ **保持现状**（不改"三格都亮"）。
22. **`.rst-role.is-chosen` 改成 `transform:scale(1.1)`**（原写 `translateY(-4px)`）：上游 `LoginRoleView.SetChosen(true)` 就是 `roleTransform.localScale *= 1.1f`。
23. **格里的"小赛尔"机器人 ✅ 已加（人类 2026-10-18 拍板）**：
    真值（`Login.unity`）= 每格的 `Seer Robot`，素材 `Assets/Resources/Sprites/Game/Robot/7001.png`（**96×149**，中锚 **y=−35**，三格同一张）。
    落点 = `.rst-role-robot`（`loginView.js` 每格一个 `<div>`）；⚠️ 素材**不在** `Title/` 那套基址下 ⇒ 另起 `ROBOT_SPRITE = .../Resources/Sprites/Game/Robot`。
    尺寸 = **上游数值减半**（本画布 960×540 = 上游参考 1920×1080 的一半）⇒ **48×74.5**、中心**下移 17.5px**（`transform:translate(-50%, calc(-50% + 17.5px))`）。
    ⚠️ **只满档显示**（人类 2026-10-18 第二轮拍板原文："**小赛尔机器人和光柱一样，不在空档添加视图**"）——
    上游其实是"三格都挂"（`m_Enabled: 1`，与档空不空无关），我们**故意收窄**：选择器与 `.rst-role-effect` 同款
    （`.rst-role[data-empty="false"] .rst-role-robot`）⇒ **空档格继续只画虚线框 + 斜纹 + "空档"**，不叠加装饰件。
    ⇒ 于是 `.rst-role-portrait` 的"空档"字样**保持居中**（首版为避让机器人挪到顶部的那一处改动**已撤回**）。
    **想改回"三格都挂"**：去掉选择器的 `.rst-role[data-empty="false"] ` 前缀（一行）。
    另：`Login.unity` 每格还有 `Name Text`（200×60，y=−19）—— 对应我们的 `.rst-role-name`，STB-c 已有。

### 9.3 未落 / 明说（**不静默**）

| 项 | 现状 | 归属 |
|---|---|---|
| 3 格真实数据（昵称 / 性别 / 空档） | ✅ **已落（STB-d）**：`repository.load(storage,{gid,tables})` 的投影 ⇒ `data-empty` / 昵称 / 性别徽章 | — |
| 建号写档 | ✅ **已落（STB-d）**：`load` + 改两字段 + `save` ⇒ 立刻进图（见 §9.2 偏差 13/14） | — |
| 导入存档 | ✅ **已落（STB-e）**：点格 ⇒ `<input type=file accept=.xml>` ⇒ `importXML` ⇒ A3（成功 1 钮 / 失败列 errors） | — |
| 满档进图 | ✅ **已落（STB-d）**：`load({login:true})` → 会话导出 `adopt()` → `#/map?slot=N` | — |
| 资源包 / Mod | **灰化 + A3 说明**（STQ3 已拍）；帮助浮层有文案（**本份自拟，非上游文案**） | STB-f 收尾 |
| 全屏（去页面 chrome） | ✅ **不做（人类 2026-10-18 拍板"暂时不做"）** —— 两屏继续画在 1200×660 的 `#wrap` 舞台里（§9.2 第 8 条） | —（结账） |
| 格里的"小赛尔"机器人 | ✅ **已加（2026-10-18，人类拍板"格子加"）**：`Robot/7001.png`，48×74.5，**只满档显示**（与光柱同款，§9.2 偏差 23） | —（结账） |
| **进图的落点** | 我们落 **`70`（传送室）** = 上游 `Player.currentMapId` 的**默认值**（`System/Player.cs:23`）。上游 `LoginManager.Login` 成功那次会把 `currentMapId` 改写成 `gameData.initMapId` —— **新档算出来 `71`**（`GameData.cs:67-74` 按 `noobCheckPoint` 换算，`[XmlIgnore]` 不入档）、**已玩档**用 `settingsData.initMapId`（两份真机夹具都是 **`-70`**）；两张都**不在**本地地图索引（`game/data/maps.json` 259 张，`id` 是字符串，`70` 有、`71`/`-70` 无）⇒ 照搬会**进不去** | 编排线 / 地图线（本份只登记，不改） |

### 9.6 STB-d/e 的接口细节（**Save 线批 B 已落 ⇒ 本批不再卡**）

> 真值 = `docs/save/save-impl.md §9.4 (4)`（`repository.js` 六函数 + `load` 的 `opts.login`），落点是**唯一入口**
> `game/logic/save/repository.js`（**app 侧只许经它碰存档**：`docs/save/save-code-map.md §5` 规则 4）。三条要点：

1. **槽位预览是只读的**：`load(storage, { gid })` 对**形状正常**的档**一个字节都不改**（批 B 之前的设计没有这条保证，现在有了）。
2. **进图那一次要传 `login: true`**：`load(storage, { gid, login: true })` = 上游 `GameManager.GameLogin` 的登录收尾
   （版本迁移 + `petBag` resize + 跨天 + 刷 `lastLoginDate`）→ 然后才交会话（§6.4）。
3. **空档判据与槽数从 Save 线取**：`repository.isEmpty(g)`（= 昵称空）/ `repository.MAX_SAVE_COUNT`（= 3）——本份**不自己拼** `nickname === ''`、**不硬写 3**。
4. **`storage` 谁给** ⇒ ✅ **落点已定（2026-10-18）**：`game/app/runtime/bootstrap.js`（编排线装配点，见 `docs/orchestration/orchestration-impl.md §2.6/§3.3`），
   由会话暴露为 **`session.storage`**；STB-d/e **从会话取**，不自建、不自己选环境。
   ⚠️ 开工前提 = 编排线**第一刀**（`ORB1 × ORB4-a` **同一批**，该文件 §3.1）落码 —— 在那之前 B5 无 `storage` 可取。
5. **导入落盘**：`importXML(storage, gid, xml)` 成功时**原样字节落盘**（写进去的 == 给进来的）；
   失败时 `{ ok:false, errors }` 且**不写盘** ⇒ B5 用 A3 把 `errors` 明说（§4.2 第 3 步）。
6. ✅ **落码时补的一条（2026-10-18）**：`load` 对**缺档**走 `newGame`，而 `newGame` 要 `opts.tables` ⇒
   会话新增导出 **`ensureTables()`**（`game/app/session.js` 的模块导出；⚠️ **不是** `session.ensureTables()`，见 §9.2 偏差 20），B5 每次 `load` 都传（§9.2 偏差 12）。

### 9.4 请人手测（**决议 ⑦**：以本节为准；判据同设计 §8.2）

> 硬刷新（`Ctrl+Shift+R`）后看 
> ✅ **2026-10-18 起**可用 `node tools/serve.mjs` 当开发服务（一切响应 `Cache-Control: no-store` ⇒ 不必硬刷新，且带存档写端点）。

1. **入口**：直接开 `game/index.html`（无 hash）应落在**开始场景**；`#/map` 直进仍可用。
2. **开始屏版式**（重点看**对齐**，因为都是量出来的）：图标在**上部居中**；底部条带里**左版本 / 中开始球 / 右三钮**是否**都落在条带自己的框里**（不该有错位/重叠）；背景铺满无黑边。
3. **开始屏动效**：背景先出 → 图标**从左往右擦出** → 三钮**上浮淡入**；顺序对、不闪。
4. **悬停**：三钮与开始球放大上浮可感、离开复位。
5. **版本两行**：显 `----/--/--` / `----`，看起来是"暂无数据"而不是坏掉（这是 STQ5 的预期）。
6. **资源包 / Mod**：灰化，点了出 A3 说明；**帮助**：点了出说明。**都不出假面板**。
7. **点开始** ⇒ 进**选择角色**：标题"选择角色"居中；**3 个格子**并排（虚线边 = 空档）。
8. **点空格** ⇒ 开**建号面板**：底图里的"输入昵称"与输入框位置**是否对得上**（差几像素请说）；性别两钮是否落在银色框体里；**昵称留空点确认** ⇒ 就地上红字"昵称不能空白"、面板不关；取消能关。
   ✅ **建号专项（人类 2026-10-18 指定的用例）**：**存档 1 / 昵称「wing」/ 性别 男** ⇒ 确认后应**直接进图**；
   回头再看 `saves/save1.xml` ⇒ `<nickname>wing</nickname>` + `<gender>false</gender>`（**`false` = 男**，见 §9.2 偏差 14），
   其余字段与"默认档"一致（6 只初始宠 / 2000 币 / 1 道具）；再回 `#/login` ⇒ **该格变满档**（实边、昵称 `wing`、右上角**蓝色男徽章**）。
9. **导入**：点底部"用其他角色登录"**下方**应出现黄字"选择要覆盖的存档"，三格浮出"覆盖"角标；点某格 ⇒ **开文件选择器**（只收 `.xml`）；
   选一份真档（`tools/fixtures/save-lite4.9.2-played.xml`）⇒ A3「导入成功」+ 该格立刻变满档（不刷整页）；选一份坏文件 ⇒ A3「导入失败：」**列出原因**、该格不变；**再选同一个文件**应能再触发（`input.value` 已清）。
   ⚠️ 失败路径不许写盘（`saves/save{n}.xml` 的修改时间不变）。
10. **满档格点击** ⇒ 先**放大 1.1 倍**（`.is-chosen`）随即进图；**进图后按 F5** ⇒ 昵称/等级/金币/钻石与那一格一致（槽位不串档）。
11. **角色格外观看一眼**：**满档格** = **Login Effect 的光柱 + 底座** + **"小赛尔"机器人**（约 48×74.5，水平居中、略偏下）+ 昵称 + 性别徽章；**空档格** = 虚线框 + 斜纹 + **居中**"空档"字样（**不叠**光柱/机器人）。
    ⚠️ 机器人是**上游那件**，但**只在满档显示**（人类 2026-10-18："和光柱一样，不在空档添加视图"，§9.2 偏差 23）；**若大小/位置不对手感**，说一句即可（一行 CSS）。
    ⚠️ 光柱是宽图（490×404）塞进竖格（200×240）⇒ 上下会留空；**若你觉得该按上游比例把格子改成宽格（约 245×202、间隔 80）**，说一声我改（那是真值尺寸）。
12. **进图落点**：应落在 **「传送室」（mapId 70）**。⚠️ 上游对**新档**算出来是 `71`、对**已玩档**是 `-70`，两张本地都没有素材 ⇒ 我们**故意**用 70 兜底（§9.3 末行）；若你希望改成"照上游算、落不到就提示"，那是地图线的活。
13. **从选角回地图**：改 hash 到 `#/map` ⇒ 地图 HUD **不留**选角的缩放残留（画布模式已还回 `fixed`）。

### 9.5 台账（随本轮一并改）

- 本轮之前（随设计成文）：`docs/architecture.md §1.1` 已把 `Title`/`Login` 从 **A 组出局**移出、并入**要做**；`docs/view/view-design.md §8` 的 **B5 行**已归位 `docs/view/scene/start/`；`docs/arch-docs.md §0.1` 目录树已加 `scene/start/`。
- 本轮（发码后）：设计 **§9.3 施工批** 的 **STB-a/b/c 标已落**；`AGENTS.md §4` 的 B5 段落改为"**STB-a/b/c 已落，等人类手测**"。
- **2026-10-18 手测复核三条（人类拍板）**：① **格子里加"小赛尔"机器人** —— ✅ **已落**，且**只在满档显示**（与光柱同款选择器；第二轮拍板"不在空档添加视图"）；② **光柱只在满档显示**（保持，§9.2 偏差 21）；③ **首次进选角即造默认档**保持（与上游同形，§9.2 偏差 12）。后两条是**确认现状、无码改动**。
  代码落点：`game/app/view/start/loginView.js`（每格加 `.rst-role-robot` + 机器人基址常量）+ `game/app/ui.css`（新增 `.rst-role-robot`，**只满档显示**）。
