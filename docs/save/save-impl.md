# 重启存档系统 · 实现文档（save-impl.md）

> 上游真相见 `docs/save/save-design.md`（**设计文档**）；节点树详见 `docs/save/save-xml-spec.md`。
> 接口/函数/参数/返回与 mermaid 图见子文档 **`docs/save/save-code-map.md`**。本文只讲**我们**怎么把它落到代码。
> 决策（已拍板 · ⚠️ 本线编号，**不是**全局「人类决议」，后者索引 `AGENTS.md §5`）：**S-决策 1** = **XML 真档取代 v3 JSON**；**S-决策 2** = **引第三方 XML 库**。
> 本文随实现更新；「as-built」以 §9 为准（与前面冲突以 §9 为准）。
> 目标口径：**忠实 XML、可互通** —— 能逐字段读写真 `save{id}.xml`，写回不损坏未识别的字段。

---

## 0. 前提（先立，再谈设计）

> **澄清（勿再踩）**：本项目**没有**"不许用第三方库"的规矩。项目已在用 `@ruffle-rs/ruffle`、`pngjs`、
> `maxrects-packer`、`puppeteer-core`。文档里的"零构建 / 手写"是**分线作用域**的：内核线的
> 「零构建、源码即产物」只管 `game/core/**`；UI 线的 D2「逐面板手写」是**反对 prefab→DOM 转换器**，
> 不是反对库。**存档模块大方用库 —— 手写 XML 解析器没有任何理由。**

1. **加载方式**（不是"要不要库"）：库须能以 ESM（或单文件 script）被浏览器 `import`。照
   `ruffle -> node_modules/@ruffle-rs/ruffle` 软链先例接入（如新增软链 `fxml -> node_modules/fast-xml-parser`）。
2. **round-trip 不丢字段**：上游 `GameData` 远大于我们要用的子集。**写回必须原样保留不理解的字段**，
   否则一存就把玩家存档改坏。→ 策略 = **全量建模 + 未知节点保留（双保险）**。

---

## 1. 模块划分（MVC 视角：这一刀全在 Model）

```
game/logic/save/
  schema.js      // 真档数据形状（纯数据 + defaults + 常量），零 XML 知识
  codec.js       // XML 字符串 ⇄ schema 对象；字节级保真 writer + 宽容 parser
  newgame.js     // 初始档生成（设计 §5 的 GetDefaultData + GameLogin 修饰）
  storage.js     // 落点：localStorage 键 + 文件导入/导出（浏览器不能直接写文件）
  repository.js  // app 的唯一入口：load()/save()/newGame()/import()/export()
```

- **纯函数优先**：`codec` / `schema` / `newgame` 零 DOM、零 app import，`storage` 注入（与现有
  `restartSession.js` 的 `storage` 注入同纪律），便于 node 单测与差分测试。
- **repository 是唯一写盘口**：场景（Controller）只调 `repository`，不直接碰 `codec`/`storage`。
- **退役**：**两套旧 JSON 档都退役** —— v3 `game/logic/restartSession.js`（`rocoshowdown.restart.v3`）与
  v2 `game/logic/session.js`（`rocoshowdown.save.v2`/`.v1`）**在 app 侧零引用**（**人类 2026-10-18 拍板 ⇒ 编排线 ORP3**：
  "**v2/v3 直接废弃，采用 XML 档**"，不再只是"v3 退役"）；**不写任何 v2/v3 → XML 迁移**（见 §6）。
  ⚠️ **文件不删**（`image`：既有测试/工具仍 import 它们 —— `game/logic/restartSession.test.js`、`tools/rbag-restart-hud-bag-test.mjs` 等）
  ⇒ **保留但断链**，退役账见 `docs/orchestration/orchestration-impl.md §3.2 ④/§5`。其 `storage`/`auth` 注入模式被 `repository` 沿用。
- **不设 `migrate` 模块**：本轮**无存量档要迁**（冷启动即新建 XML 档），故不需要"v3 JSON → `GameData`"这一步。

---

## 2. 用库到什么程度（分工：库管 XML，我们管领域）

> ⚠️ **2026-10-18 实况**：**只有"读侧"用库**（`XMLParser` 收词法/容错），**写侧自己按描述子表发射文本**
> （理由与实测见 **§9.3 偏差①**）。下表是**原计划**，保留作对照。

**解析与构建都用库**，我们只写库替不了的那部分。

| 交给库 | 换任何库都要我们做（领域建模，不是"手写 XML"）|
|---|---|
| 词法/语法解析、实体转义、命名空间、CDATA | **schema 映射**：`GameData` 树 ⇄ 我们的对象模型 |
| 树 → 文本（缩进、标签、属性）| **值文本口径**：`DateTime` round-trip、**中文枚举名**、`float` 最短往返 |
| 空节点 / 自闭合开关 | **上下文元素名**：`Item`(itemStorage) vs `item`(Mail.gift) |
| | 少数**格式旋钮**：CRLF、末尾无换行 |

- 选型：**`fast-xml-parser`（MIT）** —— 解析 + 构建都用它。
- 若某旋钮它不给（如自闭合空格、末尾换行）：**薄适配 / 后处理补**，**不因此**重写成手写解析器。

---

## 3. 目标格式（对齐设计 §1；由库 + 薄适配产出）

下表是上游 `XmlSerializer` 的输出口径。我们**优先级递减**：先保证"真游戏能读我们的档、我们能读它的档"
（**语义等价** = 互通所需），再谈"逐字节相同"（回归测试的**加成**，非硬性）。

| 项 | 上游输出 |
|---|---|
| 首行 | `<?xml version="1.0"?>`（无 encoding、无 BOM）|
| 根 | `<gameData xmlns:xsd="…" xmlns:xsi="…">` |
| 缩进 / 换行 | 2 空格 / **CRLF** / **末尾无换行** |
| 空元素 | `<x />`（`/` 前一个空格）|
| null 单引用 | 整段省略 |
| 数组 | `<field><Elem>…`；空槽 `<Elem xsi:nil="true" />` |
| 属性 | `id=`/`num=`/`baseId=`/`checkpoint=`/`done=` 等按 schema 标 |
| 枚举 | 名字（`Personality` = **中文名**）|
| 日期 | round-trip `yyyy-MM-ddTHH:mm:ss.fffffff±hh:mm` |
| float | 最短往返文本（整数不带 `.0`）|

> **出处 = 真机真档实测**（夹具 `tools/fixtures/save-lite4.9.2-played.xml` / `-default.xml`，见 `docs/save/save-xml-spec.md §6.1/§6.2`）。
> ⚠️ 上游有**两条写侧**（存档 `SaveXML` vs 导出 `TrySaveXML`，字节不同）—— **我们两边都照"存档"口径**，见 spec §6.3；
> 流传/改档工具产出的档**不可当基准**（spec §6.2）。
> 差异容忍：空白、自闭合的写法差异（`<x/>` vs `<x />`）**不影响互通**；是否追求"逐字节相等"见 §7。

---

## 4. round-trip 保真策略

- **全量建模**：按设计 §2–§5 把每个字段都进 `schema.js`（含 `settingsData`/`yiteRogueData`/`Mail`/`Mission`/`Activity`/`BattleRecord`，以及**我方扩展** `equip` = spec §2.22）。
- **未知节点保留**：parser 把未建模的元素/属性塞进一个 `__unknown` 旁路（保持原始文本与位置），
  writer 再原样吐回。这样即便上游加了新字段（或我们 §8 还没挖完），也不会损坏存档。
- **不变量**：`serialize(parse(x)) === x`（对未改动的档成立）。

---

## 5. 初始存档生成（实现）

`newgame.js` 精确实现设计 §5：

```js
// 1) 设计 §5 的 GetDefaultData(2000, 0)
const g = schema.fresh();                    // ≈ InitGameData()：version=''、first=lastLoginDate=now、各存储空
for (const id of [1,4,7,10001,10004,10007])
  g.petBag[idx++] = petFactory(id, 10);      // new Pet(id, 10)：随机身高/体重/性格(0..25)/iv(0..32)、hasEmblem=true、currentStatus=normalStatus
g.itemStorage.push({id:1,num:2000}, {id:2,num:0}, {id:10237,num:1});
g.missionStorage.push({id:1, checkpoint:'default', done:false});
// 2) 模拟 GameManager.GameLogin() 的"修饰"
applyVersionUpdates(g, from='');             // 版本不一致 → Mail/Mission/Pet/BattleRecord/Activity.VersionUpdate
g.version = CURRENT_VERSION;                 // = 当前资源版本（样本 lite_4.9.2）
if (g.petBag.length < 12) resizePetBag(g);
maybeDailyLogin(g);                          // 跨天 → 登录邮件/任务/活动
g.lastLoginDate = now();
```

- `petFactory` 的随机性与上游同为"造宠即掷点"，**不追求与样本同值**（样本是历史掷点结果），
  但**结构必须逐字段同形**（判据：与夹具 `tools/fixtures/save-lite4.9.2-default.xml` **逐字段比对**，见 §7）。
- "造初始档"是 `repository.load()` 在缺档时的分支（对应上游 `LoadData` 的 null 回退）。

---

## 6. 落点（工程目录）与导入导出

- **真存储 = 源码工程目录内**：`<repo>/saves/save{id}.xml`（`{id}=0..2`）。**文件名与上游一致** →
  我们的档与真档可直接互换（这就是"可互通"在落点层的实现）。【已拍板：`saves/`】
  ⚠️ **我方扩展 `<equip>`（spec §2.22）上游不认**：读档可忽略，但上游重写会丢块 ⇒ **复刻档别喂回官方服**；
  我们自己的 round-trip 必须原样保留（§4）。
- **`storage.js` 适配器**（同一 `Storage` 接口，注入给 `repository`）：

  | 适配器 | 用于 | 读写 |
  |---|---|---|
  | `fsStorage`（经写端点 `GET/PUT /saves/*`） | 开发 / 运行 | 真文件 |
  | `localStorageAdapter`（键 `seer2.save{n}.xml`） | 无写端点的**降级** | 浏览器本地 |
  | `memStorage` | node 单测 / 差分 | 内存 |

  ⚠️ **键 = `schema.keyOf(gid)` = `saves/save{gid}.xml`（仓库相对路径）**；`fsStorage` 的 `base` 是**站点根前缀**
  （默认 `''` = 同源根）⇒ 浏览器里就是 `fetch('/saves/save0.xml')`。三个适配器**都返回 Promise** ⇒ 调用方一律 `await`。
  细则与「防双前缀」见 §9.4 (4) ①。
- **互通**：`export()` = 触发下载 `save{id}.xml`；`import()` = 读文件 → 校验（设计 §1）→ 写入 `saves/`。
  **导出必须字节级保真**（§3），这样导出的档能被真游戏直接读。
- **gid**：0..2（`MAX_SAVE_COUNT=3`）；web 端可先只支持单档。

### 6.1 写端点：`tools/serve.mjs`（✅ **人类 2026-10-18 拍板要做**；**已落地 2026-10-18 = 批 B**）

- **方案**：加 `tools/serve.mjs` —— 静态服务 + `GET/PUT /saves/<file>`，落 `<repo>/saves/`；开发起服务用它
- **适配器映射**：`fsStorage` 读 = `fetch('/saves/save{id}.xml')`；写 = `fetch(url, { method:'PUT', body })`。
- **版本管理**：`saves/` 属**运行时数据**，建议 `.gitignore`；固定夹具另放 `tools/fixtures/`
  （✅ **已入库 2026-10-18**：`save-lite4.9.2-played.xml` / `save-lite4.9.2-default.xml`，清单见 `docs/save/save-xml-spec.md §6.1`）。
  ✅ `/saves/` 已写进 `.gitignore`。
- **装配点**：`storage` 适配器**谁 new** —— ✅ **人类 2026-10-18 已决：归编排线装配点**
  （`docs/orchestration/orchestration-design.md §6`）；本模块只出 `storage.js` 的适配器实现，**不自己选环境**。
  ✅ **落点已定（2026-10-18）**：`game/app/runtime/bootstrap.js` —— 见 `docs/orchestration/orchestration-impl.md §2.6/§3.3`（**D3** + 判据"`createFsStorage` 全仓 app 侧仅 1 处"）；
  会话经 `session.storage` 持有它，B5 批 C 从会话取（**不**各自 `createFsStorage()`）。

**落地实况（批 B · 2026-10-18）**：

```bash
node tools/serve.mjs                 # 默认 127.0.0.1:8090
node tools/serve.mjs --port=8091     # 换端口
```

| 路由 | 行为 |
|---|---|
| `GET/HEAD /` | 302 → `/game/index.html` |
| `GET/HEAD /<静态文件>` | 仓库根直服（含 `/node_modules/**` —— 浏览器 import map 要它）；支持单段 `Range`；目录无 `index.html` 时给**清单**（看 `saves/` 里有什么） |
| `GET/HEAD /saves/<name>.xml` | 存档读；**不存在 = 404**（`fsStorage` 把 404 读成「无档」，不是错误） |
| `PUT /saves/<name>.xml` | 存档写（**原样字节**落盘：不加 BOM、不补末尾换行 ⇒ 口径见 `docs/save/save-xml-spec.md §6.2`） |
| `DELETE /saves/<name>.xml` | 存档删（不存在也算成功） |

- **写侧只认 `/saves/<name>.xml` 一层**、名字限 `[A-Za-z0-9._-]+`（`PUT /saves/sub/x.xml` 与 `PUT /game/x.js` 都 403）
  ⇒ 不会有 `saves/saves/` 这种嵌套目录被悄悄造出来；静态侧 `..` 逃逸 403。
- 端口占用时**明说**并退出（不静默换端口）。**没做**：HTTPS / 多线程 / 断点续传的多段 Range。

---

## 7. 验收（**人手测为主** · 决议 ⑦）

> **决议 ⑦（2026-10-17）**：**不写测试代码**（不新增 `tools/*-test.mjs`、`tools/verify-*.mjs`、`tools/probes/**` 等，
> **也不为验收去跑**它们）；验收 = **人类把游戏跑起来手测 + 反馈**。本节按此改写（原文的"断言/harness 改造"口径**作废**）。

**手上有的比对材料（不是脚本，是文件）**：

| 材料 | 用途 |
|---|---|
| `tools/fixtures/save-lite4.9.2-default.xml` | **初始档 golden**：`defaultGameData()` 的输出应**逐字段同形**（日期/随机掷点允许不同，见 §5） |
| `tools/fixtures/save-lite4.9.2-played.xml` | **round-trip 对手**：读→写→再读，**语义必须等价**（满结构：28 件道具 / 8 封邮件 / 10 个 Activity / 2 个 Mission） |
| 真机 `LocalLow/Helios/Seer2 Restart Lite/save{0,1,2}.xml` | **互通终检**：把我们写出的档丢回真游戏目录，看能不能读（⚠️ 会覆盖真机档，**先备份**） |

**请人手测的事（逐条交反馈）**：
0. **批 B 阶段先能测的三条**（不依赖 app 接线）在 **§9.4 (3)**：起 `tools/serve.mjs` → node 里 `newGame/load` 落 `saves/save{id}.xml` → 把**生成档放回真游戏目录**（= 下面第 4 条，**批 B 就能做**）。
1. 在浏览器里建号 → 看 `saves/save{id}.xml` 是否生成、`<nickname>`/`<gender>` 是否对。
2. 把 `save-lite4.9.2-played.xml` 拷成 `saves/save0.xml` → 游戏内读档 → 昵称/道具/邮件/宠是否都在。
3. 导出一次 → 与夹具**逐字节 diff**（能过则最好；过不了就把 diff 贴回来，我们按真值改口径）。
4. 把导出的档**放回真游戏目录**（先备份）→ 真游戏能否进游戏（**这才是"可互通"的验收**，脚本给不了这个结论）。

> 既有脚本（`tools/difftest.mjs`、`node --test game/core/`）**保留但与本线无关**；本线**不新增**任何测试文件。


---

## 8. 风险 / 缺口（**2026-10-18 三条已决，仅剩一条待定**）

- **设计 §8 三项已挖清**：`BattleSettings`/`YiTeRogueEvent`/`BattleResultState` 逐字段见
  `docs/save/save-xml-spec.md` §2.19–§2.21（⚠️ 三者**仍无样本**：真机档里 `battleRecordStorage` 是空的，见 spec §6.4）。
- ✅ **图鉴（dex）/ web 私有字段 ⇒ 直接丢**（**人类 2026-10-18 拍板**）：上游 `GameData` **无** `dex`/`evolve`/`battle` 三样
  ⇒ 本线忠实 XML 档**不写**它们；v3 那三样随 v3 一起退役（§1 的"不做迁移"）。图鉴若要重建，是**另一条线**的事
  （备选：塞进 `Activity` 的 kv 扩展点，但那会是**上游不认识的额外内容**，本轮不采纳）。
- ✅ **库接入方式 ⇒ 照 `ruffle` 先例软链**（如 `fxml -> node_modules/fast-xml-parser`），跟 `@ruffle-rs/ruffle` 同款；
  不复制到 `vendor/`。（这是"怎么加载"的问题，§0 已澄清"要不要库"不是问题。）
- ⚠️ **已实测（2026-10-18，见 §9.3 偏差①）：`fast-xml-parser` 当"写侧"做不到逐字节**（它的 builder 在自闭合/缩进/属性序/`xsi:nil`/命名空间属性上都要另配，且把领域模型映射成它的通用节点树比自己发射还长）
  ⇒ **不能**"薄适配补一补"就了事；改为**读侧用库、写侧自拼**（`docs/save/save-xml-spec.md §6.2` 的口径当唯一真值）。**没有换库**。
- ⚠️ **"软链"这条要改**（2026-10-18 实况）：库是**裸说明符** `import 'fast-xml-parser'`，`node` 原生解析即可；**浏览器**要靠
  **import map**（`game/index.html`）把裸名映到 `/node_modules/...` —— 且要把它**整个裸依赖闭包**（7 个）都映上，
  否则 ESM 链接期直接抛（= 那个"载入中…黑屏"的坑）。逐条配方与复算命令见 **§9.3 偏差②**。`fxml` 软链**不需要**了。
- **随机数一致性**：`petFactory` 用 `game/logic/rng.js`（确定性）而非 `Math.random` ⇒ 便于复现（非"与上游逐值一致"，决议 ①）。

---

## 9. as-built（随实现填；与上文冲突以本节为准）

### 9.1 2026-10-18 · 本轮只做「真值锁定」，**未落一行代码**

| 项 | 结果 |
|---|---|
| **夹具入库** | ✅ `tools/fixtures/save-lite4.9.2-played.xml`（sha256 `a65719403a3296952caaf310c3c6511f1927daf2af39e59379e27c4e4d68695a`）、`save-lite4.9.2-default.xml`（sha256 `9df916b99c354174d49d9f4f18a22cbd708ea352359bf6e3fb764039c2ff2f44`）—— 快照自真机 `LocalLow/Helios/Seer2 Restart Lite/save0.xml` / `save1.xml` |
| **字节口径** | ✅ **真机实测确认为准**（无 BOM / 无 `encoding=` / CRLF / 末尾无换行）⇒ 设计 §1 与本文 §3 的原判断**成立、不改** |
| **收到的反例** | 一份流传档 `projects/Seer2-Restart-Lite-main/萌新专用护肝存档.xml`（`lite_3.7`、`num=99999999`）：字节（BOM / LF / `encoding=`）与形状（`petBag` 6 槽）都不符 ⇒ **判定为传输/改档工具产物，未入夹具**（登记在 `docs/save/save-xml-spec.md §6.2`） |
| **文档订正** | 新增 `docs/save/save-xml-spec.md §6`（样本实证登记）；`docs/save/save-design.md` §1/§5/§7/§8/§10 同步；本文 §3/§6.1/§7/§8 同步（**§7 按决议 ⑦ 重写**：删掉"写断言/改造 harness"口径） |
| **待人类手测** | §7 的四条（建号写档 / 读真档 / 导出 diff / **放回真游戏**）—— 但**得先有码** |
| **未落** | `game/logic/save/**` 五个文件**仍不存在**；`tools/serve.mjs` **未写**；`saves/` 目录未建 |

### 9.2 下一步（阶段二 · 建议批序）
1. ✅ **批 A（无 I/O，最易对拍）**：`schema.js` + `codec.js` + `newgame.js` —— **已落码，见 §9.3**。
2. ✅ **批 B（I/O）**：`tools/serve.mjs` + `storage.js` + `repository.js` + `game/index.html` 的 importmap
   —— **已落码，见 §9.4**。
3. **批 C（接线）**：View B5 的 **STB-d/e**（`docs/view/scene/start/view-scene-start-impl.md §6`）—— ✅ **已落 2026-10-18**：3 格投影（`load`）/ 建号（`load`+改两字段+`save`）/ 导入（`importXML`）/ 进图（`load({login:true})` → 会话导出 `adopt()`）全在 `game/app/scenes/loginScene.js`；实况见该 impl **§9.2 偏差 10–23**。

---

### 9.3 2026-10-18 · 批 A 落地（`schema.js` + `codec.js` + `newgame.js`）

#### (1) 落地清单

| 文件 | 行 | 内容 | 真值 | 外部操作 |
|---|---|---|---|---|
| `game/logic/save/schema.js` | 304 | 常量（`PET_BAG_SIZE=12` / `MAX_SAVE_COUNT=3` / `COIN_ID` / `DIAMOND_ID` / `DEFAULT_VERSION` / `STATUS_COLS` / `STARTER_PET_IDS` / `PERSONALITIES`(55) / `SETTINGS_FIELDS`）+ 默认值工厂（`zeroStatus`/`defaultSettingsData`/`defaultYiteRogueData`/`defaultPetFeature`/`defaultPetRecord`/`defaultPetResist`）+ `fresh`/`clone`/`validate`/`keyOf`/`isEmpty` + **日期文本口径**（`formatDateTime`/`parseDateTime`） | spec §1/§2 · code-map §2.2 · design §5/§7 | `纯` |
| `game/logic/save/codec.js` | 495 | 描述子表（`TYPES`/`ATTRS`，**顺序 = XML 顺序**）→ **写侧自拼文本** + **读侧用 `fast-xml-parser`**；值格式器 `formatNumber`/`personalityName`/`personalityIndex`/`elementNameFor` | spec §1–§4、§6.2 | `纯` |
| `game/logic/save/newgame.js` | 319 | `unityTables`（内容表注入）+ `defaultGameData` + `compareVersion` + `applyVersionUpdates` + `maybeDailyLogin` + `finishNewGame` + **临时** `makeRefPet` | design §5/§6 | `纯`（全部就地突变 `g`） |

依赖方向：`newgame → {schema, ../stats.js, ../../core/pet/status.js, ../rng.js}`、`codec → {schema, fast-xml-parser}`。**没有反向 import**，`game/app/**` 一个都不认识它。

#### (2) 实测（**开发期自检，不是验收** —— 验收按 §7 = 人手测）

| 检查 | 结果 |
|---|---|
| `serialize(parse(夹具)) === 夹具`（**两份**） | ✅ **逐字节相同**（14106 / 20008 字节，含 CRLF/无 BOM/末尾无换行） |
| 生成默认档 vs `save-lite4.9.2-default.xml` | ✅ **归一化（只比结构、屏蔽值）后 533 行逐行一致**；未归一化的值差异 **64/533 行**，全部落在**随机掷点**（性格/身高/体重/iv/currentStatus）与**时间戳**上 —— 正是设计允许不同的项 |
| 生成档自洽 | ✅ `parse(serialize(g))` 再 `serialize` 相同；`validate(g).ok === true` |
| 宽容读 ① 删掉整个 `<settingsData>` | ✅ 保住**构造器默认**（`useRobotAsPlayer=true`/`BGMVolume=10`/`initMapId=-70`），不变成 0 |
| 宽容读 ② 短 `petBag` | ✅ 读成 6；`validate` 报 `petBag 长度应为 12，实为 6`；`finishNewGame` resize 回 12 后 `validate.ok` |
| 宽容读 ③ BOM + LF（= 流传档那套字节） | ✅ 读得动，且**再写出自动回到真档口径**（无 BOM / CRLF） |
| `lv10` 的 `totalExp` | ✅ `1250`（与夹具**逐值相同**）—— `game/logic/stats.js` 的曲线在这一点上就是上游值 |
| `currentStatus`（物种 1 / iv 0 / 性格 13） | ✅ `28/30/30/26/28/37`（与夹具**逐值相同**）—— 用的是 `game/core/pet/status.js` 的移植公式 |
| `defaultGameData()` 不给 `tables` | ✅ **抛错**（不静默造一份没宠的假默认档） |

#### (3) 请人测什么（**按 §1.1 决议 ⑦：AI 不写测试脚本，下面这三条是给人粘贴的**）

> 前提：仓库根、`node` 可用（≥18）。**三条都应看到 ✅**；有任何 ❌ 把输出贴给我。

```bash
# ① 读两份夹具 → 写回：应与原文件逐字节相同（diff 无输出）
node --input-type=module -e "
import {readFileSync} from 'node:fs'; import {parse,serialize} from './game/logic/save/codec.js'
for (const f of ['tools/fixtures/save-lite4.9.2-default.xml','tools/fixtures/save-lite4.9.2-played.xml']) {
  const src = readFileSync(f,'utf8'), out = serialize(parse(src))
  console.log(f, out === src ? '✅ 逐字节相同' : '❌ 不同')
}"
```

```bash
# ② 造一份默认档并写出来（与 default 夹具比结构；值应只差随机掷点/时间）
node --input-type=module -e "
import {readFileSync} from 'node:fs'; import {serialize} from './game/logic/save/codec.js'
import {validate} from './game/logic/save/schema.js'
import {defaultGameData,unityTables,finishNewGame} from './game/logic/save/newgame.js'
const J=(p)=>JSON.parse(readFileSync(p,'utf8'))
const tables = unityTables({pets:J('game/data/unity/pets.json'),growth:J('game/data/unity/growth.json'),rules:J('game/data/rules.json')})
const g = defaultGameData({ tables })
console.log('validate:', JSON.stringify(validate(g)))
console.log(serialize(g))"
```
—— **人看三处**：①`validate` 是否 `ok:true`；②宠物块里 6 只初始宠 id 是否 `1/4/7/10001/10004/10007` 且 `totalExp=1250`、`superSkillId=0`；③`itemStorage` 是否 `Item(1,2000)+Item(2,0)+Item(10237,1)`、`missionStorage` 是否 `Mission(1)`、`petBag` 是否 12 槽（后 6 槽 `xsi:nil`）。

```bash
# ③ 版本迁移 + 跨天（用真档当输入）
node --input-type=module -e "
import {readFileSync} from 'node:fs'; import {parse,serialize} from './game/logic/save/codec.js'
import {finishNewGame} from './game/logic/save/newgame.js'
const g = parse(readFileSync('tools/fixtures/save-lite4.9.2-played.xml','utf8'))
const ev = []
finishNewGame(g, { version:'lite_4.9.2', now:new Date('2026-12-31T23:59:00'), events:ev })
console.log('事件:', JSON.stringify(ev))"
```
—— **人看**：`battleRecordStorage` 是否被清空、`version` 是否写成 `lite_4.9.2`、跨天事件是否因"夹具最后登录 2026-10-18"而触发，以及**跳过的项都带 `reason`**（不许静默）。

**④ 真机真档回灌（最有价值的一条，等批 B 的 `tools/serve.mjs` 到位再做）**：把生成档放到上游 `LocalLow/.../save1.xml`，开游戏看能否读得进去。**本轮做不到**（没有写端点）。

#### (4) 偏差登记（对 `docs/save/save-code-map.md §2` 与本文 §2/§8）

| # | 偏差 | 理由 |
|---|---|---|
| ① | **写侧不用库的 builder，自己按描述子表发射文本** | 目标是**逐字节同形**（`docs/save/save-xml-spec.md §6.2`）：自闭合空格 / CRLF / 末尾无换行 / 属性序 / `xsi:nil` / `xmlns:` 属性 全是"我们的真值"。实测**一次通过两份夹具**，而配 builder 还得先造它的通用节点树 ⇒ 更短更可控。**读侧照旧用库** |
| ② | 库接入 = **`node` 裸说明符 + 浏览器 import map**（不是 `fxml` 软链） | 库是纯 ESM 裸依赖；浏览器必须映**整个裸依赖闭包**。实测闭包（`grep -rh "^import .* from ['\"][^./]" node_modules/fast-xml-parser/src node_modules/fast-xml-builder/src`）= 7 项（⚠️ **项数订正：实为 8 项，见 §9.4 (4) ①**），8 条 URL 全部 `200`（`/node_modules/`，不需要软链）：<br>`fast-xml-parser`→`/node_modules/fast-xml-parser/src/fxp.js`、`strnum`→`/node_modules/strnum/strnum.js`、`anynum`→`/node_modules/anynum/anynum.js`、`@nodable/entities`→`/node_modules/@nodable/entities/src/index.js`、`xml-naming`→`/node_modules/xml-naming/src/index.js`、`path-expression-matcher`→`/node_modules/path-expression-matcher/src/index.js`、`is-unsafe`→`/node_modules/is-unsafe/src/index.js`、`fast-xml-builder`→`/node_modules/fast-xml-builder/src/fxb.js`。<br>⚠️ **批 B/C 第一步**就是在 `game/index.html` 里加这个 importmap（**本轮没动 app 文件**） |
| ③ | `defaultGameData` 加 `tables` / `petFactory` / `now` | 6 只初始宠的构造**必须**有物种基表（技能学习等级、baseHeight/Weight、genderList、ui 皮肤）⇒ 否则只能造"没有宠的假默认档"。`petFactory` 是**域线 D6 的注入点**（code-map §2.4 原签名只有 `{coin,diamond,rng}`） |
| ④ | `newgame.js` 内**临时** `makeRefPet`（`new Pet(id,level)` 的参考实现） | 让"造默认档"当下可跑可测。**正式归属 = D6**；本文件头已写明"D6 落地后改注入、本函数删"。已知 4 处不忠实（性格只落 0..24、不滤必杀、superSkillId 恒 0、exp 用 `stats.js` 曲线）都逐条写在函数注释里 |
| ⑤ | `finishNewGame(g, opts)` 加 `opts.events`（出参数组） | code-map §2.4 的返回是 `GameData`（`突变`）⇒ 事件没处去。给一个**可选出参**：不传 = 行为不变；传了就拿得到"升级/跨天/跳过"清单（`repository` 报提示要用） |
| ⑥ | `formatDateTime`/`parseDateTime` **实现在 `schema.js`**，`codec.js` 原样再导出 | 日期是**字段形状**（且 `fresh()` 自己就要造）而 schema 不许 import 本目录其余文件；对外面（code-map §2.3）没变 |
| ⑦ | `fresh(now = new Date())` 加可选参 | code-map §2.2 写的是 `fresh()`；不加就只能造 `new Date()`，默认档的 `firstLoginDate` 没法测 |
| ⑧ | 属性值里的空白转义（`&#xD;`/`&#xA;`/`&#x9;`）按 `XmlWriter` 口径写 | **无样本**（真档里没有带换行的属性值）；先按上游口径，出现真档反例再改 |

**保留不变的**：`keyOf(gid) = saves/save{gid}.xml` · `MAX_SAVE_COUNT=3` · `PET_BAG_SIZE=12` · `STORAGE` 装配点归编排线 · `repository.js` 六函数契约（批 B）。

#### (5) 明确"未做 / 跳过"（**不许静默**）

- **需要内容表**（`applyVersionUpdates` 里 `skipped:true` + `reason`）：`Mail.VersionUpdate`（版本更新邮件）、`Mission.VersionUpdate`（补支线/日常）、`Pet` 的 `lite_3.7.1` 性别修正（需标识符路由 `GetPetIdentifier("baseId[704]")`）、`CheckNewSkill`（需 `learnInfoList`）。
- **跨天的内容**：`maybeDailyLogin` 只判"跨天"并报事件；三条 `*.DailyLogin()` 的**内容**（登入奖励邮件 / 日常任务 / 活动刷新）**归内容线**——所以 `save-lite4.9.2-played.xml` 里那 8 封邮件**本批造不出来**（能造的是 `default` 那份）。
- **无样本项**：`battleRecordStorage`（含 `BattleRecord`/`BattleSettings`/`actionList`）、`pvpPetTeam`、`YiTeRogueData.itemBag`/`eventMap`/`trace`、`PetRecord.recordDict` —— 真档里都空（`docs/save/save-xml-spec.md §6.4`）⇒ 本文只按**源码形状**实现，**等真档出现内容再以真档为准**（`docs/save/save-xml-spec.md §4` 的规则）。
- **未落**：`storage.js` / `repository.js`（批 B）、`tools/serve.mjs`（批 B）、`saves/` 目录、app 侧任何接线（批 C）、`game/index.html` 的 importmap（见偏差②）。
  ⇒ **批 B 已全部落码（2026-10-18），见 §9.4**；本行只当批 A 当时的留档。



---

### 9.4 2026-10-18 · 批 B 落地（`tools/serve.mjs` + `storage.js` + `repository.js` + importmap）

#### (1) 落地清单

| 文件 | 行 | 内容 | 真值 | 外部操作 |
|---|---|---|---|---|
| `tools/serve.mjs` | 234 | 开发用本地服务：静态（仓库根 / 单段 Range / 目录清单 / **一切 no-store**）+ **存档写端点** `GET/PUT/DELETE /saves/<name>.xml` | 本文 §6.1 | 进程外（本机 HTTP） |
| `game/logic/save/storage.js` | 126 | 三个适配器 `createFsStorage` / `createLocalStorageAdapter` / `createMemStorage`（同一 `Storage` 形状） | `save-code-map.md §2.1` | `IO` |
| `game/logic/save/repository.js` | 190 | **app 唯一入口**六函数 `load`/`save`/`newGame`/`exportXML`/`importXML`/`clear` + 再导出 `isEmpty`/`MAX_SAVE_COUNT` | `save-code-map.md §2.5`、§4 | `IO` + `突变` + `纯` |
| `game/index.html` | +18 | `<script type="importmap">`：**8 项**裸依赖闭包（见 (4) ①） | 批 A 偏差② | — |
| `.gitignore` | +5 | `/saves/`（运行时数据） | 本文 §6.1 | — |
| `game/logic/save/{schema,codec,newgame}.js` | 0 | **未动**（批 A 的产物原样） | — | — |

依赖方向：`repository → {schema, codec, newgame}` · `storage → 无`。**`game/app/**` 一个都不碰**
（`storage` 装配点归编排线 ⇒ 本批**只出实现与接口**，不在任何地方 `new`）。

#### (2) 实测（**开发期自检，不是验收** —— 验收按 §7 = 人手测）

| 检查 | 结果 |
|---|---|
| `memStorage` 全生命周期 | ✅ `newGame` → `load` 字节不变；`save` 后再 `load` 仍不变 |
| **`fsStorage` 经 `tools/serve.mjs`** | ✅ `newGame(gid=0)` 落盘 **14124 字节** → `load` 读回**字节不变**；盘上文件头 = 无 BOM + `<?xml version="1.0"?>` + CRLF，末尾无换行（口径同 §6.2） |
| 真机真档（`played`）当 `gid=1` | ✅ 昵称 `Linux` · 道具 **28** · 邮件 **8** · Mission **2** · Activity **10**；`load` 后 `exportXML` 与夹具**逐字节相同**（`login` 默认 `false` ⇒ 形状正常的档**一个字节都不改**） |
| 缺档自动造档（`gid=2`） | ✅ 昵称空 + 12 槽 + **盘上确实生成了**（= 上游 `LoadData` 的 null 回退，不是故障） |
| 版本不一致回写（`default` 夹具 `version=''`） | ✅ 读成 `lite_4.9.2` 且**已回写**；第二次 `load` 不再改 |
| `login:true`（= 选档进图那一刻） | ✅ 刷 `lastLoginDate` 并回写；事件 = `dailyLogin`（夹具最后登录 2026-10-18 vs now 2026-12-31） |
| `importXML` | ✅ 好档 = `ok:true` 且**落盘字节 == 给进来的字节**；残档 = `ok:false` + `['petBag 长度应为 12，实为 0']`；垃圾 = `ok:false` + `XML 读不动：readTagExp returned undefined …`；**两种失败都不写盘** |
| `clear` + 再 `load` | ✅ `getItem` 回 `null`（404 不是错误）→ `load` 又自动造出来 |
| 入参体检（**不静默**） | ✅ `gid=3` 抛（`MAX_SAVE_COUNT=3`）· 非 storage 对象抛 · 不给 `tables` 造档抛 · `petBag` 短的 `g` **拒绝写盘**（`SAVE_INVALID` + 3 条） |
| `localStorage` 适配器（桩替 `globalThis.localStorage`） | ✅ 键 = `seer2.save1.xml`（与 §6 表一致）；`newGame`/`load`/`clear` 通 |
| **写端点边界** | ✅ `PUT /saves/sub/x.xml` · `PUT /game/x.js` · `PUT /saves/bad name.xml` 全 **403**；`PUT`/`DELETE` **204**；`DELETE` 不存在也 204；`..%2f..%2f..%2fetc/passwd` **403**；`POST` **403**；`Range: bytes=0-9` **206**；`HEAD` **200** |
| **importmap 静态走图**（48 节点 / 8 裸说明符） | ✅ 从 `/game/logic/save/repository.js` 沿**相对 import** 走完整个 `fast-xml-parser` 闭包：8 个裸说明符**全部在 map 里**、8 条目标 URL **全 200** ⇒ 浏览器不会有链接期缺口（浏览器侧的真验证见 (3) ②）。**走图脚本没入库**（住 `/tmp/opencode/`，按决议 ⑦ 不新增测试文件） |

#### (3) 请人测什么（**按决议 ⑦：AI 不写测试脚本，下面是给人粘贴的**）

> 前提：仓库根、`node` ≥ 18。有 ❌ 把输出贴回来。

```bash
node tools/serve.mjs
```

```bash
# ① 造一份新档 → 经 HTTP 落盘 → 再读回来
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import * as R from './game/logic/save/repository.js'
import {createFsStorage} from './game/logic/save/storage.js'
import {unityTables} from './game/logic/save/newgame.js'
const J=(p)=>JSON.parse(readFileSync(p,'utf8'))
const tables = unityTables({pets:J('game/data/unity/pets.json'),growth:J('game/data/unity/growth.json'),rules:J('game/data/rules.json')})
const st = createFsStorage('http://127.0.0.1:8090')
const g = await R.newGame(st, { gid:0, tables })
const back = await R.load(st, { gid:0 })
console.log('造档→落盘→读回 字节不变:', R.exportXML(back) === R.exportXML(g), '| 空档(昵称空):', R.isEmpty(back))
console.log('盘上文件:', st.url('saves/save0.xml'))"
```
—— **人看**：是否 `字节不变: true | 空档(昵称空): true`，以及仓库里是否出现 `saves/save0.xml`。

```js
// ② 浏览器里 importmap 通不通（DevTools 控制台，F12 → Console；页面先刷新一次再贴）
const R = await import('/game/logic/save/repository.js')
const S = await import('/game/logic/save/storage.js')
const st = S.createFsStorage()
const g = await R.load(st, { gid: 0 })
console.log(g.nickname, g.petBag.length, R.isEmpty(g))
```
—— **人看**：**不许**出现 `Failed to resolve module specifier …` 或链接期报错（这就是 importmap 的验收）；
应打印 `'' 12 true`（档还在空档态）。

```bash
# ③ 真机真档丢进槽位 → 读它 → 导出应与夹具逐字节相同
cp tools/fixtures/save-lite4.9.2-played.xml saves/save1.xml
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import * as R from './game/logic/save/repository.js'
import {createFsStorage} from './game/logic/save/storage.js'
const src = readFileSync('tools/fixtures/save-lite4.9.2-played.xml','utf8')
const st = createFsStorage('http://127.0.0.1:8090')
const g = await R.load(st, { gid:1 })
console.log(g.nickname, g.itemStorage.length, g.mailStorage.length, '导出==夹具:', R.exportXML(g) === src)"
```

**④ 真机真档回灌（最有价值的一条，批 B 现在就能做）**：把 ① 造出来的 `saves/save0.xml` 拷到上游
`LocalLow/Helios/Seer2 Restart Lite/save2.xml`（**先备份原档**）⇒ 开真游戏**选第 3 个槽**，
看能否进游戏、昵称/初始宠/道具对不对。**这才是「可互通」的验收，脚本给不了这个结论。**

#### (4) 偏差 / 订正登记（对 `docs/save/save-code-map.md §2` 与本文 §6）

| # | 偏差 / 订正 | 理由 |
|---|---|---|
| ① | **importmap 项数订正：7 项 → 8 项**（§9.3 偏差② 的计数偏少） | 批 A 那次数的是 `grep` 源码的结果；这次按**浏览器真实解析路径**走了一遍模块图（`repository.js` → `codec.js` → `fast-xml-parser` 闭包 = **48 个节点**）⇒ 可达裸说明符 = **8 项**（多出的那个是 `fast-xml-builder`）。已按 8 项写进 `game/index.html`；§9.3 偏差② 的清单照旧有效、只是**数目**需订正 |
| ② | `load` 追加 `opts.login`（**默认 `false`**） | `save-code-map.md §2.5` 的三条契约没说"命中的档要不要走登录收尾"。**默认 false** = 形状正常的档**一个字节都不改**（Login 场景要连读 3 个槽画格子，不能读一次就写坏一次）；`login:true` 留给"选档进图"那一刻（= 上游 `GameManager.GameLogin`：版本迁移 + resize + 跨天 + 刷 `lastLoginDate`）。⚠️ **B5 接线时"进图"那次要传 `login:true`**（`docs/view/scene/start/view-scene-start-design.md §4.1` 那一行） |
| ③ | `load` / `newGame` 透传 `tables` / `petFactory` / `rng` / `events` | 槽位预览与"缺档造档"都要造宠 ⇒ 必须能把内容表（或 D6 的真工厂）递到 `newgame`（与批 A 偏差③⑤ 同因） |
| ④ | `repository` **再导出** `isEmpty` / `MAX_SAVE_COUNT` | B5 的"空档判据（昵称空）"与"3 槽"是 Save 线的规则，**不许 view 自己拼字符串判断、不许自己写 3**（`save-code-map.md §5` 规则 4）⇒ 从唯一入口给出去。**不是新函数** |
| ⑤ | `importXML` **原样字节落盘**（不重排 / 不归一化 / 不 trim） | "导入"的语义 = 把玩家给的档放进这个槽 ⇒ 写进去的字节 == 给进来的字节（也因此 `importXML` **拒绝**形状不对的档：失败**不写盘**，`errors` 交回 B5 用 A3 明说） |
| ⑥ | `storage` 的**键 = `keyOf(gid)` 的仓库相对路径**；`fsStorage` 的 `base` = 站点根前缀（默认 `''`）；且 `base` 以 `/saves` 结尾时**吃掉键里的前导 `saves/`** | `save-code-map.md §2.1` 的两个示例照抄会拼成 `/saves/saves/save0.xml`（静默 404 ⇒ **会被误判成缺档并造新档**）。已在 `storage.js` 显式吃掉重复段；写端点又**只认一层** `/saves/<name>.xml` ⇒ 万一漏了也是 403，而不是悄悄造出嵌套目录 |
| ⑦ | 三个适配器**统一返回 Promise**（`localStorage`/`mem` 本能同步） | IO 天然异步、`fs` 必须异步 ⇒ 同一接口只能这样；`await` 对裸值同样成立，所以同步实现也骗得过调用方 |
| ⑧ | `memStorage` 多出 `keys()` / `dump()`；`fsStorage` 多出 `url()` | 手测看一眼用（不参与 `Storage` 接口）；`url()` 是给人贴 URL 的 |

**保留不变的**：六函数契约（含 `load` 缺档自动造档）· `keyOf` / `MAX_SAVE_COUNT` · `saves/save{id}.xml` 落点与文件名 ·
**`storage` 装配点归编排线**（本批**不接线**，只出实现 + 接口）· `repository` 零 `game/app/**` 依赖。

#### (5) 明确"未做 / 跳过"（**不许静默**）

- **app 侧一行未接**：`game/app/runtime/bootstrap.js`（编排线 ORB4 的装配点）**不存在** ⇒ 今天浏览器里只能像 (3) ② 那样
  **手动 import**；真正的"建号 / 选档 / 进图"是**批 C**（View B5 的 STB-d/e，✅ **已于 2026-10-18 落码**）。
  ✅ **落点/批序已定（2026-10-18）**：该文件 = 编排线 **ORB4-a** 的产物（`docs/orchestration/orchestration-impl.md §2.6/§3.3`），
  它建 `createFsStorage()` 并挂到会话上（`session.storage`）⇒ 批 C 从会话取，不再各自 `new`。
- **`serve.mjs` 没做**：HTTPS · 多段 Range · 写的原子替换（直接 `writeFile`，非 tmp+rename）· 任何鉴权（**只给本机开发**）。
- **两条老账未变**：`applyVersionUpdates` 的四项 `skipped:true`（要内容表 / 标识符路由）；`maybeDailyLogin` 只有跨天判定、
  没有内容 ⇒ `played` 那 8 封邮件**本批仍造不出来**（**能读不能造**）。

### 9.5 2026-10-20 · 地图线 `MDB8-g` 追加：我方扩展 `<equip>` 落码

> 正本（节点树）= `docs/save/save-xml-spec.md §2.22`；落地计划 / 手测 = `docs/map/map-impl.md §3.10.8` / `§7.3.24` / `§8.19`。
> 本节只登记**存档线自身的改动**（map 线的渲染/会话细节不在此重复）。

#### (1) 改动

| 文件 | 内容 |
|---|---|
| `game/logic/save/codec.js` | `TYPES.root` **末尾**追加 `{ n:'equip', o:'EquipLook', omitNull:true }`（根级最后一块，顺序不可乱）；新增 `TYPES.EquipLook = [{ n:'items', p:'int' }, { n:'mountEquipId', v:'int' }]`。写：`<equip><items><int>…</int></items><mountEquipId>…</mountEquipId></equip>`（空 items = `<items />`）；`equip == null` ⇒ **整段省略**。读：旧档缺块 ⇒ `equip = null`；块内缺项宽容（`items=[]`、`mountEquipId=0`）。 |
| `game/logic/save/schema.js` | `fresh()` 增 `equip: null`（新档/空档不带块）；`validate()` 增形状体检 —— `null` 合法，否则必须是对象、`items` 为整数数组、`mountEquipId` 为整数（坏形状由 repository 拒写）。 |
| `game/app/session.js` | `mergeBack()` 末尾按会话态写回 `data.equip = (equipVec.length \|\| mountEquipId) ? { items, mountEquipId } : null` ⇒ **空外观 = `null` = 整段省略**（旧档 round-trip 不凭空多块）。`adopt()` 的读侧在 `MDB8-c` 已落。 |
| `game/app/scenes/mapScene.js` | `APP.actorLook.equip/unequip/ride/unride` 在 `syncLook()` 后调用 `session.save()`（named import `save as saveSession`）；失败只 `console.error` + 一行 `外观落盘失败`，**不回滚会话态**。`clear/preview/color/ground` 不写盘。 |

#### (2) 兼容与边界

- **上游不认 `<equip>`**：读档忽略、重写会丢块 ⇒ **复刻档不得喂回官方服**；我们自己的 round-trip 必须保留（`docs/save/save-xml-spec.md §2.22`）。
- 块内**只存物品 ID**（槽位由物品表反推）+ 坐骑装备 ID（`0` = 未骑乘）；`actorColor`/`groundMode`/`actorSex` **不入档**。
- `equip` 入口**不校验背包持有量**（调试入口；正式装备面板 C1/C2 再补）。
- **未新写测试/探针脚本**（决议 ⑦）；门禁 = `node --input-type=module --check`（codec/schema/session/mapScene）+ scoped `git diff --check`。
