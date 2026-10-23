# totalk.md —— 等待讨论台账（不是决议，不是设计）

> **本文件只装一件事**：**还没谈完、需要人类一起来谈**的问题。
> 每条**只写问题 + 已核实的事实 + 指针**，**不写结论**。
> 谈定之后：结论写进**对应线的文档**，本文件这一条**压成一行**「已决 ⇒ 见 `docs/…/….md §x`」，不删（留"当初为什么挂起"）。
>
> ⚠️ **编号**：本文件条目用 **T1–Tn**（**本文件本地编号，不是**全局「人类决议」①–⑧；决议索引 = `AGENTS.md §5`，编号纪律 = `docs/arch-docs.md §7`）。
> **T2 内部**另有一套子编号 **T2·1–T2·21**（功能缺口号）——引用时**必须带 `T2·` 前缀**，不许简写成 `G1`/`N1`（那些是域线的不变量/登记号）。
> ⚠️ **不装什么**：各线**已经写好、只等人点头**的清单**不搬进来**（避免双份真值），只在这里**指一下**：
> 运行时线 **Q1–Q5**（`docs/runtime/runtime-components-design.md §8`）· 引擎 E6 **PD1–PD3**（`docs/engine/battle-engine-session.md`）·
> D7 **本族待拍板 ①**（`docs/domain/domain-info.md §8` 末）· D0 跨线 **W1–W5**（`docs/domain/domain-design.md`）。
> **T2 是另一回事**：它装的是**连文档都还没有**的功能面 ⇒ 那是**范围问题**（要不要做），不是评审点头的活。


---

## T1 · 宠物羁绊（`PetKizunaInfo`）到底归谁 —— **等待讨论**（挂起于 2026-10-17）

### 一句话

羁绊这套东西，**行为代码**要三种我们手上没有的别的东西（地图 NPC、道具系统、存档写入），而它的**数据文件在发行版本里根本不存在** —— 所以今天要定的不是"怎么搬"，是**"这个类到底算谁的"**，甚至**"要不要为一条没有数据的规则专门留一个文件"**。

### 已核实的事实（可核，别重新查）

| 事实 | 证据 | 备注 |
|---|---|---|
| 羁绊数据**发行版不存在**：`SaveSystem.LoadXML<PetKizunaInfo>("Resources/Pets/kizuna/{id}")` 该目录没有 ⇒ `PetInfo.kizuna` **恒 null**、`pets.json` **没有 kizuna 这一件** | 【实测】`docs/domain/domain-info.md:379`（表行） | ⚠️ 这是本条讨论的地基：**没有一条真数据能落地** |
| XML shape 是**明确的**：`[XmlAttribute] id` + `[XmlArray] tagList/dialog/gift` | 上游 `Assets/Scripts/MVC/Model/Basic/Info/PetKizunaInfo.cs:11-22` | 纯契约，可搬 |
| 行为**三支跨三条线**：`GetKizunaDialog` / `PetKizunaDialog.GetCondition` / `PetKizunaGift.Gifts·Condition·Apply` | 上游 `PetKizunaInfo.cs:24-99`；登记见 `docs/domain/domain-info.md:71` | 【源码】分别要吃 **Map 线**（`NpcButtonHandler`、`NpcHandler`）· **Item 线**（`new Item(id,count)`、`Item.OpenHintbox`）· **Save 线**（`pet.record` + `SetRecord`） |
| **Item 线还没立族** | `docs/domain/domain-info.md:280`（B7「等别的族」） | ⇒ 三支里至少一支**当下无宿主** |
| 现行登记 = **只出 shape，三支行为不搬** | `docs/domain/domain-info.md:70`（接缝表）、`§5` **G11**（`:358`）、`§3.3` **B7**（`:280`）、`§6` **N9**（`:395`）、`§8` 末 **本族待拍板 ③**（`:466`） | 也就是说"临时答案"已经写在 D7 里了，本条是去**确认或推翻**它 |

### 要谈的三件事

1. **shape 归 D7 还是归 Save 线？**
   `docs/save/save-xml-spec.md` **本来就是 XML 契约的正本**，而且 `docs/domain/domain-info.md:456` 已经承认「`PetKizunaInfo` 的 XML 管道要同步到那里」。
   ⇒ 留在 D7 = **两条线各抄一份 `[XmlAttribute]` 表**（同一事实散两处，必过期 —— 这条正是 `docs/domain/domain-design.md §5` 立的「不重抄」纪律要防的）。
   给 Save 线 ⇒ D7 这边只剩一句「`pets.json` 无 kizuna 件 = V5 null 省略」（V5 = `docs/domain/domain-design.md §1 V5`）。
2. **三支行为什么时候有宿主？** 羁绊的礼物要发道具、对话要认 NPC、进度要写存档。Item 族没立 ⇒ 这条**注定躺着**。要谈的是**要不要给它排一个"永远等"的正式状态**，而不是每轮评审重新问一遍。
3. **没有数据 ⇒ 要不要为它写任何验收？** 按 **人类决议 ⑦**（主验收 = 人类手测，`AGENTS.md §1.1`），一条落不了地的契约**人手测也测不到**。⇒ 只能靠**往返断言**（shape 编回来 == 编出去）自证，要不要这一层。

### 我先前给过的建议（不算结论）

**归 Save 线**，但**排期仍挂在 D7 B7** 直到 Map/Item 线立起来。
理由：shape 的唯一真值来源是 XML 序列化规格；今天 `PetInfo`/`pets.json` 靠 V5 null 省略已经完备，不缺这一族也能验收。
⚠️ **本条不阻塞任何施工批**（B7 原文就写着"等别的族"）⇒ 可以晚点定，但**别在 impl 阶段临时决定**（impl 会把它写死成文件位置）。

---

## T2 · 还有哪些功能**连 design 都没有** —— 等待讨论（挂起于 2026-10-17）

### 一句话

我们现在的全部设计，只覆盖了上游 **442 个 C# 文件 / 69,879 行**里的**战斗 + 宠物静态数据 + 存档 + 运行时能力**这一块；
**其余约 3.6 万行（≈ 全仓 52%）既没有一份 design，也没有任何一条线认领它** —— 最大的单块是**工坊**（16,694 行，一个文件都没写）。
⇒ 要谈的**不是"这些文档什么时候补"**，而是**"这些功能到底在不在我们要做的游戏里"**。范围不拍，写了也是白写。

### 口径（怎么算"欠账"）

一条功能**同时**满足两条才算欠账：**①** 没有任何 design 文档覆盖它；**②** 没有任何一条线（引擎 / 域 / Save / 运行时 / View）**认领**它。
- 只满足 ①（自家地图已画圈待写）⇒ 记在 **清单 A**，那是**写文档的活**，不是范围问题。
- **不算欠账**（明确排除，别混）：各线 `impl` / `code-map` 配对 = `AGENTS.md §1` 的**阶段一续**；
  已写好待点头的 **Q1–Q5 / PD1–PD3 / D7 本族待拍板 ① / W1–W5** = **评审欠账**（见本文件头部「不装什么」）；
  **Mod 装载/导出**（上游 `System/SaveSystem.cs:605-690/737-790`）**已被 D7 §1 认领** ⇒ 不是缺口。

### 已核实的事实（可核，别重新查）

| 事实 | 证据 |
|---|---|
| 上游真值规模 = **442 个 `.cs` / 69,879 行**；本清单 B 的**净缺口 ≈ 36,168 行** | 【实测】`find projects/Seer2-Restart-Lite-main/Assets/Scripts -name '*.cs' -print0 \| xargs -0 cat \| wc -l`（2026-10-17） |
| ⚠️ **上面那条只是 `Assets/Scripts/` 的口径 —— 上游第一方代码不止这么多**：`Assets/Resources/**` 另有 **47 文件 / 3,257 行**（面板自带脚本 **43/2,881** + 小游戏 3/237 + `Prefabs/Player/RobotView.cs` 139），`Assets/**/*.cs` 合计 **950 文件 / 178,929 行**（含 Plugins 则是 73 文件 / 11,068 行的非 `Scripts` 部分）。**面板脚本这一族从来没进过本清单 B 的行数表**；`PetBagPanel` 与 `PetBagMode` enum 就住在这个盲区里（`grep -rn "enum PetBagMode" Assets/Scripts` ⇒ **0 命中**）。⇒ 本清单 B 的**行数只当"量级"用，别当总数**；判据"档 2 / 档 3"不受影响（这些面板同样**没有 design**）。 | 【实测】2026-10-17，由 `docs/view/panel/petbag/restart-petbag-panel.md §1.1` 报出 |
| **有 design 的五块**：引擎 **E1–E7**（design 已齐）· 域 **D0+D1–D7**（已齐）· Save **4 份** · 运行时 **R1–R7** · View（总设计 + P0 五份 + hud/battle-scene 配对 + ui-handoff） | `docs/arch-docs.md §6` 索引 + 【实测】`docs/` 共 44 个 `.md` |
| ⚠️ **三份现有文档把东西推给一条不存在的线**：`docs/domain/domain-design.md:63`、`docs/domain/domain-skill.md:367`、`docs/engine/battle-engine-effects.md:159/397` **都写着"→ Save 线 / 编排线"** | 【实测】`grep -rn 编排线 docs/` ⇒ **4 处命中、0 份文档**。✅ **已解决（2026-10-17）⇒ 编排线已立**，见下「已决」 |
| 引擎线**已经明确画围栏**，但**围栏外面没有人住**：`docs/engine/battle-engine-session.md §S13` 列出**① Photon/网络 ② 卡牌模式 ③ YiTeRogue ④ SceneLoader ⑤ Item.Remove ⑥ Pet.Add** | 【源码】同文档 `:474` |
| **真正的 0 命中**（全 `docs/` 一次都找不到这些词）：**「联网」「牧场」「融合」「音频/AudioSystem」** | 【实测】`grep -rl` 逐词，2026-10-17 |
| 其余功能词（工坊/剧情/道具/卡牌/任务/邮件/图鉴/活动/肉鸽）**在 docs 里只以「围栏 / 长尾 / 顺嘴一提」出现**，不是覆盖 | 例：`docs/view/ui-handoff.md:145`「只做可玩必需的面板，**工坊/活动等长尾按需**」；`docs/view/scene/battle/view-scene-battle-design.md:223`「手牌/牌库…**本文不覆盖**」；「肉鸽」二字在 docs 里**只**出现在两份**代码分析报告**（`docs/view/panel/petbag/restart-secret-skill-learning.md`、`docs/view/panel/petbag/restart-petbag-panel.md`）里，**没有任何 design 认领** ⇒ 即本清单 **T2·9** |
| 六场景与 `BattleMode` 全集：`{Record=-1, Normal=0, SelfSimulation=1, PVP=2, SPT=3, Special=4, YiTeRogue=5, Card=6}` ⇒ 我们**只设计并实现了 Normal/SelfSimulation 那一支** | 【源码】`docs/save/save-xml-spec.md:247` |

### 清单 A · 自家地图**已画圈**、design 待写（= 写文档的活，不涉及范围决定）

**9 份**全在 `docs/view/view-design.md §8`（编号**沿用**该表，本处不重描述内容）：
**C1 `docs/view/panel/view-panels-pet.md` · C2 `docs/view/panel/view-panels-item.md` · C3 `docs/view/panel/view-panels-map.md` · C4 `docs/view/panel/view-panels-social.md` · C5 `docs/view/panel/view-panels-system.md`**（均 P1）·
**B5 ✅ `docs/view/scene/start/view-scene-start-design.md`（2026-10-18 已成文 + 归位）· B6 `docs/view/scene/view-room.md` · D1 `docs/view/story/view-story.md`**（均 P2）· **B7 `docs/view/scene/view-minigame.md`**（P3）。
⚠️ **进度更新（2026-10-18）**：**B5 已成文**（`docs/view/scene/start/` 下分析报告 + 设计 + impl 三份；人类 2026-10-18 拍板把 `Title`/`Login` 从 A 组移出）⇒ 清单 A 待写剩 **7 份**（C2–C5 / B6 / B7 / D1）。
⚠️ **进度更新（2026-10-17）**：**C1 已成文** ⇒ 待写剩 **8 份**。但 C1 只把**背包 + 仓库**深写，其余 11 个精灵 Panel 只定了归属；C1 的**本地待拍板 VP1–VP8 已由人类全部拍板**（决议表见 `docs/view/panel/view-panels-pet.md §11`，含跨线影响），其中**规则那一半**仍挂在清单 B（道具 → **T2·5**、肉鸽 → **T2·9**、PVP 房间 → **T2·7**）。
另两份挂名未写：`docs/common-questions.md`、`docs/formats/jpeg.txt`（登记于 `docs/arch-docs.md §8` 的"已被引用但尚未成文"列表）。
⚠️ **2026-10-17 更新**：原第三份 `docs/view/battle-split.md`（战斗数值拆分 · View 侧正本）**已成文** ⇒ 从本行移出；且经查 **`common-questions.md` / `formats/jpeg.txt` 两份没有任何入向引用**（只在台账与 §8 列表里挂名）⇒ 它们**不是**"悬空箭头"，属**低优先级备忘**，等真有消费者再写。
⚠️ **C1 的证据底座已就绪**（2026-10-17）：`docs/view/panel/petbag/restart-petbag-panel.md` 把上游背包面板查完并登记了 **A1–A16** ⇒ 写 C1 时**不用再回去读 C#**，但**规则那一半仍在清单 B**（同上面那条进度更新）。
⚠️ **注意**：清单 A 的 C2/C3/B5/B6/D1 **只画了界面那一半** —— 它们背后的**规则**（道具怎么用、NPC 怎么触发、剧情怎么跑、房间怎么联机）在**清单 B** 里，两份要一起谈，不然会写出"面板有按钮但没有可点的东西"的 design。

### 清单 B · **design = 0 且没有线认领**的功能面（按上游体量排序）

> ✅ **2026-10-17 全表已决**：**T2·4 编排线** 与 **T2·5 道具线**已立；**其余十九条的范围全表拍板** ⇒
> 结论 = `docs/architecture.md §1.1 范围记账`（**A 出局 12 / B 并线 3 / C 需立线 5**；⚠️ **2026-10-18 修订**：`Title`/`Login` 从 A 组移入 C 组）。
> ⚠️ 下表各行保留**上游实测行数**（"暂不做"是**记账**不是销毁）。

路径一律相对 `projects/Seer2-Restart-Lite-main/Assets/`；「行」= 【实测】`.cs` 行数合计。

| # | 功能 | 上游位置 | 文件 / 行 | 内容表 | 现状（谁把它推走了 / 围栏在哪） |
|---|---|---|---|---|---|
| **T2·1** | **工坊 Workshop** | `Scripts/MVC/{Model,View,Controller}/Workshop` | **45 / 16,694**（Model 7,337 + View 7,721 + Controller 1,636） | 未见专属表 | 全仓**最大非战斗块**（≈24%）；docs 里只被当"长尾"提过一次（`docs/view/ui-handoff.md:145`） |
| **T2·2** | **地图 / NPC / 对话 / 传送** | `Scripts/Scene Specific/Map/**`(23/4,211) + `MVC/Controller/Map`(9/716) + `MVC/View/Map`(8/1,094) | **40 / 6,021** | `Resources/Data/Maps/*.xml` **272 张** | `docs/domain/domain-design.md:63` 把写侧推给"**编排线**"；`docs/view/scene/room/view-scene-map-content.md`(B3) 只覆盖**渲染**那一半。✅ **已立（2026-10-17）⇒ `docs/map/map-design.md`**（C 组排期 ①；⚠️ 实测**两套血统**：AS3 爬取件 **259 张** vs 重启 Unity 件 **272 张** —— 后者 `246 张含 NPC / 198 张含 <battle> / 1996 条 <condition> / 4355 条 <action>`〔解析口径；grep 口径 252/199/2023/4429〕） |
| **T2·3** | **剧情 Story** | `MVC/Model/Basic/Story`(13/2,892) + `MVC/View/Story`(3/2,186) | **16 / 5,078** | **只有 1 个** `Resources/Data/Stories/Side/fala_intro.json` | 无归属；`view-design §8` 的 D1 只认领**舞台绘制** |
| **T2·4** | **底座 / 场景生命周期**（建议立**「编排线」**） | `Scripts/System/{GameManager 175, SceneLoader 110, Player 96, Timer 80, RequestManager 161, Singleton 58, AudioSystem 250}` | **~930**（**净缺口**：已剔除被 Save 线/D7 覆盖的 `SaveSystem` 1,073 + `Database` 232 + `ResourceManager` 1,307） | 无 | ⚠️ **本条是唯一"结构性"缺口** —— 三条现有文档的箭头指到这里就断（见上事实表）。✅ **已立（2026-10-17）⇒ `docs/orchestration/orchestration-design.md`** |
| **T2·5** | **道具 / 背包 / 商店** | `MVC/Model/Basic/Item`(5/752，含 `ItemEffectHandler`/`ItemUseCountHandler`) + `ItemShopController`(139) | **~891** | `Resources/Data/Items/{info,effect}.csv` 各 **612 行** | `battle-engine-session.md §S13 ⑤` **围栏** `Item.Remove`；`docs/view/ui-handoff.md` U4 只落了**只读**背包，**"使用"按钮灰化正卡在这条线不存在**。✅ **已立（2026-10-17）⇒ `docs/item/item-design.md`**（⚠️ 数据桥 `game/data/unity/items.json` **612 条**其实**早已建好**，缺的只是规则与归属） |
| **T2·6** | **登录 / 建号 / 改名 / 玩家档案** | `MVC/Controller/Player`(8/537) + `MVC/Model/Player`(5/363) + `MVC/View/Player`(5/456) + `Scene Specific/Login/LoginManager`(68) | **~1,424** | 无 | ✅ **已认领（2026-10-18）⇒ `docs/view/scene/start/`**（View 线 **B5**：开始/选择角色；⚠️ **改名/音量不属这两场景**，是局内面板 → C1/C5；3 槽存档 → Save 线） |
| **T2·7** | **PVP / 房间 / 联机** | `Scene Specific/Room/RoomManager`(351) + Room MVC(**8 / 542**) + `System/NetworkManager`(161) | **~1,054** | 无 | `§S13 ①` **围栏**；⚠️ **「联网」二字在全 `docs/` 里 0 命中**。⚠️ 新增证据：`RoomManager.cs:40-99` **赛前把每只出战宠做副本并满配**（`Pet.ToBestPet`，`iv` 按房间 buff 取 31/120，且整块换新 `record`）⇒ 秘技第 7 条入口 + **A16**，见 `docs/view/panel/petbag/restart-petbag-panel.md §8 A10/A11/A16` |
| **T2·8** | **牧场 Farm** | `MVC/Model/Basic/Farm`（Animal 407 / Plant 333） | **2 / 740** | 无（`Resources/Data/Farm` **目录不存在**） | 【实测】docs **0 命中**；`Panels/Pond` prefab **没有同名 Controller** |
| **T2·9** | **伊特肉鸽 YiTeRogue** | `MVC/Model/Basic/YiTeRogue`(2/484) + `YiteRogueData`(177) | **~661** | 无专属表 | `§S13 ③` **围栏**；⚠️ "开局直接全学全部秘技"（`docs/view/panel/petbag/restart-secret-skill-learning.md §5` 路径 5）**至今无 design 提过**；背包面板的 `YiTeRogueData.instance.petBag` 分支见 `docs/view/panel/petbag/restart-petbag-panel.md §2.1` |
| **T2·10** | **邮件 Mailbox** | `MVC/Model/Basic/Mail`(94) + Mailbox MVC(240) + `MVC/View/Mail`(93) | **~427** | 无 | 无归属；⚠️ **上游没有好友系统**（别按常识补） |
| **T2·11** | **设置 / 音频** | `SettingsData` + `VolumeSetting`×3 + `System/AudioSystem`(250) | **~400** | 存档字段（归 Save 线） | 【实测】「音频」「AudioSystem」在 docs **0 命中**；`Panels/Settings` prefab **没有同名 Controller** |
| **T2·12** | **加载屏 / 新手引导** | `Scene Specific/Loading/**`(5/318) + `Panels/Noob` + `Panels/GuideLine` | **~380** | 无 | `§S13 ④` 围栏 `SceneLoader` |
| **T2·13** | **门 Door** | `MVC/Model/Panel/DoorModel`(189) + Controller(89) + View(31) | **~309** | 无 | 无归属 |
| **T2·14** | **卡牌模式** | `Scene Specific/Battle/UnitComponent/UnitCardSystem.cs`(252) + `BattleCardDeckView`/`BatttleCardHandView` | **252 + 2 view** | `Resources/Data/Pets/card.csv`（**宠表六张之一，已被 D6 B1 认领**） | `§S13 ②` 围栏（`RoundStart/RoundEnd` 由 View 直接构造）；`docs/view/scene/battle/view-scene-battle-design.md:223`「本文不覆盖」 |
| **T2·15** | **融合 Fusion** | `MVC/Model/Basic/Pet/System/PetFusionSystem`(97，含 `FusionRecipe`) + `FusionModel`(113) + `FusionView`(38) | **~248** | 无表 | 【实测】docs **「融合」0 命中**；`docs/domain/domain-info.md §3.3 B7` 推给"**等 Item 族**" ⇒ 即 **T2·5** |
| **T2·16** | **任务 Mission** | `MVC/Model/Basic/Mission`(2/241) | **241** | `Resources/Data/Missions/*.xml` **8 张** | 无归属 |
| **T2·17** | **活动 Activity** | `MVC/Model/Basic/Activity`(2/188) | **188** | `Resources/Data/Activities/info.csv` **135 行** | 无归属 |
| **T2·18** | **SPT / `Special` 模式** | `Panels/SPTBoss` + `MapMenuController.OpenSPTPanel`；`BattleMode.SPT=3`、`Special=4` | 面板**没有同名 Controller/Model** | 无 | 引擎只设计 `Normal`/`SelfSimulation` ⇒ **两个模式的规则没人写** |
| **T2·19** | **皮肤 / 打击音 / 变身 的「消费侧」** | `System/ResourceManager.cs:821-835`（注掉了 `LoadCSV`，改从 `persistentDataPath/PetAnimation/pet/{hit,sound,transform}.csv` 读）；`:859` kizuna 目录**不存在** | 行数住在 `ResourceManager` 内（已在 T2·4 剔除） | 三张 CSV | ⚠️ **人类决议 ④ 只定了"要建数据桥"**，**D7 B5 只认领数据侧** ⇒ **"谁在战斗里用这三张表"无文档**（本条与 T2·4 一起谈最省） |
| **T2·20** | **图鉴** | `PetDictInfoController`(71) + `PetDictInfoView`(99) | **~170** | 无 | `docs/view/ui-handoff.md` 标"**待补**" |
| **T2·21** | **小游戏** | `Scene Specific/Game/{MiniGameManager 13, PlayerController 47}` | **~60** | `Resources/Games/{BrushTeeth,FlappyBird}` | `view-design §8` **B7 只认领界面** ⇒ **玩法逻辑无归属** |
| — | **羁绊 PetKizunaInfo** | `MVC/Model/Basic/Pet/Info/PetKizunaInfo.cs` | ~99 | **发行版无 `Resources/Pets/kizuna`** ⇒ 恒 null | **已单独在本文件挂为 T1**，此处不重复 |

### 要谈的三件事

1. ✅ **范围：这些功能到底做不做？ —— 已决（2026-10-17）：人类拍板"按建议即拍" ⇒ 清单 B 全部有主。**
   结论 = `docs/architecture.md §1.1 范围记账`**三组表**：**A. 出局 13 项**（`Title`/`Login`/`Room`/`Game`/联机 + **工坊**（全仓 ≈24%）· 剧情 · 牧场 · 肉鸽 · 邮件 · 卡牌 · 任务 · 活动 · SPT）、
   （⚠️ **2026-10-18 修订**：`Title`/`Login` 已移出 A 组 ⇒ 本段为 10-17 **原文留档**，**现行口径**看 `docs/architecture.md §1.1`。）
   **B. 并线 3 项**（加载屏 → A1 + 编排线 · 设置/音频 → 编排线 · 皮肤打击音消费侧 → D7 B5 + 引擎/View）、
   **C. 需立线 4 项**（**地图/NPC/对话/传送**（最大可玩缺口）· 图鉴 · 门 · 融合，含**建议排期**）。以下原文留档：
   T2·1 工坊 = **全仓 24% 的代码**、T2·7 PVP/联机、T2·14 卡牌模式、T2·9 肉鸽 —— 这四块任何一块"要做"，都**不是补一份文档**的量级，而是**多一条产品线的量级**。
   如果**不做**，需要的是**一句明确的"出局"声明**并写进 `docs/architecture.md` —— 做法 = **不做的项各占一行**（项 + 上游位置 + 结论 + 依据），已照此填满。
2. ✅ **结构：T2·4「编排线」要不要立刻立？ —— 已决（2026-10-17）：人类拍板"先立"。**
   结论已落到 `docs/orchestration/orchestration-design.md`（+ 已登记 `docs/arch-docs.md §0.1/§6/§8`、`docs/architecture.md §2/§4`、`AGENTS.md §4`，**4 处悬空箭头均已补指针**）。以下原文留档：
   这一条**与范围无关** —— 无论做不做工坊/PVP，`GameManager`/`SceneLoader`/`Player`/`Timer`/`RequestManager` 都**必须存在**（游戏得能启动、得能换场景、得能存盘）。
   而且**今天已经有 4 处文档箭头指向这条不存在的线** ⇒ 它属于**"不立就会继续产生悬空引用"**那一类，优先级明显高于其余条目。
3. ✅ **依赖顺序：T2·5 Item 线是四件事的公共前置。 —— 已决（2026-10-17）：人类拍板"按建议来" ⇒ 立线。**
   结论已落到 `docs/item/item-design.md`（+ 已登记 `docs/arch-docs.md §0.1/§6/§8`、`docs/architecture.md §4`、`docs/arch-code.md §2`、`AGENTS.md §4`，**4 处下游箭头均已补指针**）。以下原文留档：
   `T2·15 融合`（推给"等 Item 族"）· `docs/view/ui-handoff.md` U4 的**道具使用**· `§S13 ⑤` 围栏的 `Item.Remove`· **T1 羁绊**的礼物支（`new Item(id,count)`）—— **四条都卡在同一个不存在的族上**。
   ⇒ 谈范围之前先谈这个：**Item 线体量只有 ~891 行 + 两张 612 行的表**，是清单 B 里**性价比最高的一块**。

### 我先前给过的建议（不算结论）

- **不要按体量排序开工**（工坊最大 ≠ 最该先写）。按上面的**结构 vs 范围**分开处理：
  **① T2·4 编排线**（✅ 已立，2026-10-17）→ **② T2·5 Item 线**（✅ 已立，2026-10-17：四条下游等它）→ **③ 其余十九项先拍"做 / 不做"**（✅ 已决，2026-10-17 ⇒ `docs/architecture.md §1.1` 三组表）
  → **④ C 组排期第一项 T2·2 地图线**（✅ 已立，2026-10-17 ⇒ `docs/map/map-design.md`；**最大可玩缺口**）。
- 范围拍完之后，**清单 B 的每一"不做"项**都应该在 `docs/architecture.md` 的**不变量**里获得一行「明确不做 + 上游位置」——
  这比留空强：**留空会让下一轮评审重新问一遍**（本条 T2 的存在本身就是这个症状）。
- ⚠️ **本条现已不阻塞**（范围已定）—— `AGENTS.md §1` 的「所有模块」**从此有明确边界** = **已认领各线** + `§1.1` 的 **B/C 两组**。
  阶段一的**完成判据**因此变得可判：**C 组 5 项（地图线 / 图鉴 / 门 / 融合 / 开始·选择角色场景）与 B 组 3 件补完 design** ⇒ 阶段一结束；
  **A 组 12 项按"出局"结账**（无须 design，围栏仍按 `docs/engine/battle-engine-session.md §S13` 执行）。
  ⚠️ **进度（2026-10-17）**：C 组的 **① 地图线 `design` 已齐**（`docs/map/map-design.md`，子设计 **M1–M7 全部已成文（待评审）**）⇒ C 组剩 **② 融合 ③ 图鉴 ④ 门** + B 组 3 件。
  ⚠️ **进度（2026-10-18）**：**开始/选择角色场景**（从 A 组移入，人类拍板）**三份已成文** ⇒ `docs/view/scene/start/`；C 组剩 **② 融合 ③ 图鉴 ④ 门** + B 组 3 件。

---

## 已决（压成一行，留档）

- **T2·4 编排线** —— 已决（2026-10-17）：人类拍板**立线** ⇒ 真值 / 边界三则 / 不变量 **OR1–OR7** / 待拍板 **ORQ1–ORQ7** / 上游怪癖 **ORC1–ORC3** / 施工批草案 **ORB1–ORB5** = `docs/orchestration/orchestration-design.md`。
  挂起理由（留档）：`Scripts/System/**` 七件（≈930 行）**design = 0**，而**4 处现有文档的箭头指向这条不存在的线**（`docs/domain/domain-design.md:63`、`docs/domain/domain-skill.md:367`、`docs/engine/battle-engine-effects.md:159/397`）⇒ 属"不立就继续产生悬空引用"那一类，与范围无关。
  ⚠️ **未决（同一族的工具件）**：`Scripts/Helper/HelperUtility.cs` 的**平台接口**（`Utility.SetCursor` / `InitScreenSizeWithRatio`）今天**随本线登记**在 `docs/orchestration/orchestration-design.md §2.7/§4.1`；若将来要单独立"辅助线"，整块平移（不阻塞）。
- **T2·5 Item 线** —— 已决（2026-10-17）：人类拍板**立线**（"都按你的建议来吧，不断去完善本项目的设计文档"）⇒
  真值 / 边界 / 不变量 **IT1–IT8** / 上游怪癖 **ITC1–ITC5** / 待拍板 **ITQ1–ITQ8** / 施工批草案 **ITB1–ITB5** = `docs/item/item-design.md`。
  立线依据（留档）：`docs/domain/domain-info.md §3.3 B7`（融合"等 Item 族"）· `docs/view/ui-handoff.md` U4 的**道具「使用」灰化** ·
  `docs/engine/battle-engine-session.md §S13 ⑤`（`Item.Remove` 围栏）· **T1 羁绊的礼物支** —— **四条下游等同一个不存在的族**。
  ⚠️ **本线的意外收获**：上游 ~891 行**design 全仓 0 命中**，但**数据桥早已建好**（`game/data/unity/items.json` 612 条、`effects[]` 已内嵌）
  ⇒ 本线缺的只是**规则与归属**，仍是"性价比最高的一块"。
- **T2·2 地图线** —— 已决（2026-10-17）：人类拍板**立线**（"都按你的建议来吧，不断去完善本项目的设计文档"）⇒
  真值 / 边界 / 不变量 **MP1–MP8** / 上游怪癖 **MC1–MC8** / ✅ **决议表 MQ1–MQ8（已拍板 2026-10-17）** / 子设计 **M1–M7** / 施工批草案 **MB1–MB5** = `docs/map/map-design.md`。
  立线依据（留档）：`docs/architecture.md §1.1` C 组「**最大可玩缺口**」（40 文件 / 6,021 行）+ `docs/domain/domain-design.md:63` 的**悬空箭头**（写侧曾推给编排线，而编排线只管**宿主**）+ B3 只覆盖**渲染那一半**。
  **本线的意外收获（实测）**：**两套血统**（AS3 爬取件 **259** vs 重启 Unity 件 **272**）—— 后者**数据远比前者完整**（**246 张含 NPC / 198 张含 `<battle>` / 1996 条 `<condition>` / 4355 条 `<action>`**〔解析口径；grep 口径 252/199/2023/4429〕，而 AS3 侧 **0 条 `<battle>`**、事件模型只有 **6 个具名 handler**）
  ⇒ **MQ1 定为"写侧以重启为准、渲染素材按 AS3/同名 swf 对齐"**；**AS3∩Unity 137 张里 134 张有本地 swf** ⇒ **先做这 134 张**，其余记账。
- **T2 的范围（全表）** —— ✅ 已决（2026-10-17）：人类拍板"**按建议即拍**" ⇒ **清单 B 十九条全部有主**，落 `docs/architecture.md §1.1 范围记账` **三组表**：
  **A 出局 12**（`Room`/`Game`/联机 + 工坊 · 剧情 · 牧场 · 肉鸽 · 邮件 · 卡牌 · 任务 · 活动 · SPT）；
  **B 并线 3**（加载屏 · 设置/音频 · 皮肤打击音消费侧 —— 不新立线）；**C 需立线 5**（**地图/NPC/对话/传送** · 图鉴 · 门 · 融合 · **开始/选择角色场景** —— 含**建议排期**：**①地图（✅ 已立 2026-10-17 ⇒ `docs/map/map-design.md`）** → **✅ 开始/选择角色（2026-10-18 ⇒ `docs/view/scene/start/`）** → ②融合 → ③图鉴 → ④门 → ⑤–⑦并线）。
  ⚠️ **2026-10-18 修订**：`Title`/`Login` **从 A 组移入 C 组**（人类拍板）⇒ A 由 13→**12**、C 由 4→**5**。
  ⇒ 阶段一的「所有模块」**边界由此确定**（= 已认领各线 + B/C 两组）。⚠️ **A 组不许被别的线顺手实现**（要做得先改 `§1.1`）。
