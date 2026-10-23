# 文档架构（arch-docs.md）

> 子文档 of `docs/architecture.md`。本文说明**文档系统本身**：有哪些文档、怎么配对与命名、父子如何链接、
> 怎么标注证据、as-built 纪律，以及**每线文档索引**。
> 代码结构面见 `docs/arch-code.md`。

---

## 0. 一句话

文档 = **每线一对 `<线>-design.md` + `<线>-impl.md`**，专题细节下沉为 `<线>-<专题>.md` 子文档；
**父文档只链接不重复** —— 这是 README「约定」的原文纪律：
> 一条线的废弃/状态声明，只写在该线**自己的入口文档**里一次；其余文档只链接、不重复。

### 0.1 目录结构（按「线」分子目录）

> 顶层留**跨线件**（总览 + 两个结构面 + 状态台账 + 跨线专题件）；其余按**线**入子目录。**文件名保留 `<线>-<类>.md` 前缀**（全局唯一、便于 grep），子目录只做**归类**。
> ⚠️ 顶层的**跨线专题件**（`asset-inventory.md`，同类另有 `external-refs.md`）**有意不带 `<线>-` 前缀** ⇒ 例外登记见 §7。
> ⚠️ `external-refs.md` 自己的 §9 挂着「待人类把它收进本树与 §6」⇒ **本树暂未列它**（那四处结账仍归人类）。

```text
docs/
├─ architecture.md       # 跨线总览（不变量 / 分层 / 指针）
├─ arch-code.md          # 代码结构面
├─ arch-docs.md          # 文档结构面（本文）
├─ status.md             # 全局状态台账（唯一状态源；各线进度 / 待拍板 / 风险；规则见 `AGENTS.md §4`）
├─ asset-inventory.md    # 素材台账（仓内运行时素材与数据桥：路径 · 作用 · 获取方法 · 入库状态；编号 AS/ASG/ASQ）
├─ playtest.md           # 人类手测清单（请人测唯一正本：A 战斗演出 / B 地图野怪 / C 面板 / D 存档成长 / E 眼检 + 判据正本指针；2026-10-24 立档）
├─ engine/               # 战斗引擎线
│   ├─ battle-engine-overview.md   # 导读（构成与机制）
│   ├─ battle-engine-design.md     # 总设计（+ §8 子设计地图 + §8.4 边界真值）
│   ├─ battle-engine-{state,phases,units,effects,judge,session,views}.md  # 子设计 E1–E7（**E1–E7 全已成文**）
│   ├─ battle-engine-impl.md       # 配对 impl（落地计划 / 施工批 ✅ 成文待评审）
│   ├─ battle-engine-code-map.md   # 配对 code-map（文件/接口/依赖/grep 门禁）
│   ├─ kernel-handoff.md           # 移植路线 / 落点
│   ├─ port-map.md                 # 移植事实集
│   └─ oracle-playbook.md          # 对拍操作手册
├─ domain/               # 域模型与求值线（2026-10-17 立）
│   ├─ domain-design.md            # 总设计兼导读（+ §4 接缝清单 + §6 子地图）
│   ├─ domain-{base,status,effect,buff,skill,pet,info}.md   # 子设计 D1–D7（**全部成文**）
│   └─ domain-pet-impl.md          # ✅ D6 施工 impl（B1–B7；S5/S6/set_pet/set_player 前置；**待人类评审**）
├─ runtime/              # 运行时功能组件线（2026-10-17 立；**线名 `runtime-components`，目录有意省略 `-components`**）
│   ├─ runtime-components-design.md  # 七件外部能力（R1 随机源 … R7 内容表注册）的**一件一缝**契约
│   └─ runtime-components-impl.md    # 待阶段一续
├─ orchestration/        # 编排线（2026-10-17 立，随人类拍板 `totalk.md` T2·4；**线名 = 目录名**）
│   ├─ orchestration-design.md      # 总设计兼导读（**L4 编排**：会话 / 场景切换器 / 服务三件 + 启动顺序；OR1–OR8 / ORQ1–ORQ7 / ORC1–ORC5）
│   ├─ orchestration-impl.md        # ✅ 落地计划（**第一刀 = ORB1 × ORB4-a 合并** · ORB3 作废 · ORP1–ORP6 ✅ 已拍板 · as-built 留位）
│   └─ orchestration-code-map.md    # ✅ 代码地图（文件/接口/依赖规则 L4-1…L4-7/人工核对清单）
├─ item/                 # 道具线（2026-10-17 立，随 `totalk.md` T2·5；**线名 = 目录名**）
│   ├─ item-design.md               # 总设计兼导读（表层 + 背包 API + 使用规则 + 买卖；IT1–IT8 / ITC1–ITC5 / ITQ1–ITQ8 / ITB1–ITB5）
│   └─ item-impl.md / item-code-map.md   # 待阶段一续
├─ map/                  # 地图线（2026-10-17 立，随 `totalk.md` T2·2 · C 组排期 ①；**线名 = 目录名**）
│   ├─ map-design.md                # 总设计兼导读（两套血统 · 七类实体 · **条件→动作** · 对话 · 传送 · 战斗触发 · 几何寻路 · 漫游 NPC；MP1–MP8 / MC1–MC8 / MQ1–MQ8 / MB1–MB5〔impl 执行序 MB1…MB10〕）
│   ├─ map-{data,npc,condition,dialog,teleport}.md   # 子设计 **M1–M5 ✅ 已成文（待评审）**
│   ├─ map-{battle-trigger,move}.md                  # 子设计 **M6 / M7 ✅ 已成文（待评审）**
│   ├─ map-actor-look.md             # **M8** 角色外观（穿戴装备 / 骑乘坐骑）**资料索引 · 📝 design 已成文（2026-10-20）· `ALQ1=A`/`ALQ2=B` 已拍板 · impl 计划 = `map-impl §3.10` · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**
│   └─ map-impl.md / map-code-map.md    # ✅ 已成文（2026-10-18）
├─ save/                 # 存档线
│   └─ save-design.md / save-xml-spec.md / save-impl.md / save-code-map.md
├─ view/                 # View 线
│   ├─ view-design.md                     # 总设计（**§8 子文档地图** = A/B/C/D 四根拆轴）
│   ├─ view-impl.md                       # 配对 impl（待写 · 阶段一续）
│   ├─ ui-handoff.md                      # 线入口 / 交接（U0–U5）
│   ├─ mech/                              # **A 族 · 机制层**（横切）A1–A3
│   │   ├─ view-shell.md                          # A1 舞台 / 坐标口径 / 缩放 / 层栈 z 序
│   │   ├─ view-panel-stack.md                    # A2 Panel 模态栈机制
│   │   └─ view-overlays.md                       # A3 浮层原语
│   ├─ scene/                             # **B 族 · 场景层**（按场景分两支）
│   │   ├─ room/                          # 房间（大地图）场景 —— B1 + B3
│   │   │   ├─ view-scene-hud-design.md / view-scene-hud-impl.md        # B1 房间 HUD + 角标
│   │   │   ├─ view-scene-map-content.md                                # B3 房间内容层（design）
│   │   │   └─ view-scene-map-content-impl.md                           # B3 配对 impl（2026-10-19 新立，✅ 已落码；NPC 真美术上屏）
│   │   ├─ battle/                        # 战斗场景 —— B2 + B4
│   │   │   ├─ view-scene-battle-design.md / view-scene-battle-impl.md  # B2 战斗 HUD + 底栏 + 结算
│   │   │   └─ view-scene-battle-stage.md                               # B4 战斗舞台与动画
│   │   └─ start/                         # 开始 / 选择角色场景 —— B5（2026-10-18 归位）
│   │       ├─ start-scene-desc.md                    # ⚠️ 人类实测版面正本（非我们撰写，保持原名/原样）
│   │       ├─ restart-start-scene.md                 # 代码分析报告 · Title+Login（怪癖 **A1–A22**）
│   │       ├─ view-scene-start-design.md             # B5 设计（待评审）
│   │       └─ view-scene-start-impl.md               # B5 配对 impl（待施工）
│   ├─ panel/                             # **C 族 · 面板族**（2026-10-17 下沉；**人类实测 desc 与代码分析报告同住面板名子目录**）
│   │   ├─ view-panels-pet.md (C1)        # 精灵面板族（13 个 Panel）；本篇 = 背包/仓库深写
│   │   ├─ petbag-impl.md                 # C1 配对 impl（由 `view/` 根**归位**到这里）
│   │   ├─ petbag/                        # 面板名子目录（非设计件：人类 desc + 代码分析报告）
│   │   │   ├─ petbag-panel-desc.md               # ⚠️ 人类对照重启实测的版面正本（非我们撰写，保持原名/原样）
│   │   │   ├─ restart-petbag-panel.md            # 代码分析报告 · 背包面板（四路复用 / 网格机器 / 怪癖 **A1–A16**）
│   │   │   ├─ restart-secret-skill-learning.md   # 代码分析报告 · 秘技学习（12 臂谓词 / 学习入口 / 怪癖 **A1–A9**）
│   │   │   ├─ skill-panel-design.md              # 精灵技能面板（更换技能）· 设计（不照搬 **SKB1–SKB5** / 本批默认 **SPQ1–SPQ6**）
│   │   │   └─ skill-panel-impl.md                # 精灵技能面板 · 配对 impl（**2026-10-19 已落码** · 请人测 §8）
│   │   ├─ shop/                          # 道具商店面板（C2 物品/商店族）：人类 desc + 分析报告 + 设计 + impl（已落码）
│   │   │   ├─ shop-panel-desc.md / restart-shop-panel.md
│   │   │   └─ shop-design.md / shop-impl.md
│   │   ├─ worldmap/                      # 世界地图面板（**C3 地图/世界族首份** · 2026-10-19 已落码）：分析报告 **A1–A11** + 设计（WMQ1–4 全决）+ impl（as-built §7 / 请人测 §8）
│   │   │   ├─ restart-world-map-panel.md
│   │   │   └─ worldmap-design.md / worldmap-impl.md
│   │   ├─ minimap/                       # 小地图面板一族 11 块（**C3 地图/世界族第二份** · 2026-10-19 已落码）：分析报告 **A1–A12** + 设计（MQ0-a…d 已拍板 + MQ1–4）+ impl（as-built §7 / 请人测 §8）
│   │   │   ├─ restart-mini-map-panel.md
│   │   │   └─ minimap-design.md / minimap-impl.md
│   │   ├─ spt/                           # SPT Boss 面板（**C3 地图/世界族第三份** · 2026-10-19 人类点名 ⇒ SPT **面板半边**出 A 组、战斗规则仍留 A 组）：分析报告 **A1–A8** + 设计（SPQ1–6 **待拍板**）+ impl（批 SP-a/SP-b，**施工未放行**）
│   │   │   ├─ restart-spt-panel.md
│   │   │   └─ spt-design.md / spt-impl.md
│   │   ├─ activity/                      # 活动面板（**C4 社交信息族首份** · 2026-10-19 已落码）：分析报告 **A1–A11** + 设计（本份已拍板 ACQ1–4）+ impl（as-built §7 / 请人测 §8）
│   │   │   ├─ restart-activity-panel.md
│   │   │   └─ activity-design.md / activity-impl.md
│   │   ├─ dex/                           # 精灵图鉴面板（**C1 精灵面板族第三份** · 2026-10-19 ⇒ **本份是 `view-panels-pet.md` VP5「本代不做图鉴宿主」的反转正本**）：分析报告 **A1–A14** + 设计（DX0-a…d + **DXQ1–6 已全决 = A**）+ impl（✅ **四批 DX-a…DX-d 已落码 · as-built §7 DXB1–DXB14**）；**design+impl 已于 2026-10-19 经"开工"放行 ⇒ 当前停点 = 等人类手测反馈**
│   │   │   ├─ restart-dex-panel.md
│   │   │   ├─ dex-design.md
│   │   │   └─ dex-impl.md
│   │   ├─ playerinfo/                    # 玩家信息面板（**C4 社交信息族第二份** · 2026-10-20 人类点名"信息"图标）：分析报告 **A1–A15** + 设计（PI1–PI9 / **PIQ1–4 已拍板全 A**）+ impl（批 PI-a…PI-e，**✅ 已落码 2026-10-20 · 待手测**）
│   │   │   ├─ restart-playerinfo-panel.md
│   │   │   └─ playerinfo-design.md / playerinfo-impl.md
│   │   └─ petstorage/.gitkeep            # 仓库面板 desc 待补（⚠️ 空目录 git 不跟踪 ⇒ 必须留占位文件）
│   └─ story/.gitkeep                     # **D 族 · 剧情**（D1 `view-story.md` 待写 · 同上的占位理由）
└─ legacy/               # AS3 网页线 + SWF/素材研究线
    ├─ web-client-notes.md / petbag-handoff.md / petbag-symbols.txt
    └─ m0-findings.md / swf-ir-plan.md
```

⚠️ **`view/` 的三层下沉口径**（2026-10-17 三次定稿）：View 线的子设计按 **`view-design.md §8` 的四根拆轴**分层 ——
**A 族 · 机制层** → `view/mech/`（`view-{shell,panel-stack,overlays}`，3 份）；**B 族 · 场景层** → `view/scene/`，且**再按场景分三支**：
`scene/room/`（房间/大地图：B1 HUD + B3 内容层）、`scene/battle/`（战斗：B2 HUD/底栏/结算 + B4 舞台动画）与 `scene/start/`（开始/选择角色：**B5**，2026-10-18 归位）；
**C 族 · 面板族** → `view/panel/`（C1 及后续 C2–C5；**C1 的配对 impl `petbag-impl.md` 也归此处** —— 修掉了「设计与配对 impl 分居两处」这个文档自己承认过的补丁）；
**D 族 · 剧情** → `view/story/`（D1 待写）。
⚠️ **B 族各份一律改名 `view-scene-*`**（`view-scene-hud-{design,impl}`、`view-scene-map-content`、`view-scene-battle-{design,impl}`、`view-scene-battle-stage`、**B5 `view-scene-start-{design,impl}`**）——
子目录只做**归类**、文件名仍须**全局唯一可 grep**（§2）。⚠️ **B6/B7**（PVP 房间 / 小游戏）不属 room/battle/start 三支，**暂记 `scene/` 根、归属待定**。
⚠️ **空目录 git 不跟踪**：`story/`、`panel/petstorage/` 都靠 `.gitkeep` 占位（否则别人的克隆里那格根本不存在）。
逐面板的**人类实测版面正本**（如 `petbag/petbag-panel-desc.md`）住**面板名子目录**，且**不套 `<线>-<类>.md` 前缀**（它们是**人类对照重启实际渲染写的**、不是我们编写的设计 ⇒ 保持原文件名与原文，只做引用）。
`view/` 根仍留跨族的总设计（`view-design.md`）、其配对 impl（`view-impl.md`，待写）与线入口 `ui-handoff.md`。

⚠️ **分析报告（类别 · 非线）的落位**（2026-10-18）：**不再独立成 `docs/analysis/` 目录**，改为住**它服务的面板 / 场景的子目录**
（`docs/view/panel/<面板>/restart-*.md` 或 `docs/view/scene/<场景>/restart-*.md`，与「人类实测版面正本」同处一格）—— 现存**十二份**：
`docs/view/panel/petbag/restart-petbag-panel.md`、`docs/view/panel/petbag/restart-secret-skill-learning.md`、`docs/view/scene/start/restart-start-scene.md`、
`docs/view/panel/shop/restart-shop-panel.md`、`docs/view/panel/worldmap/restart-world-map-panel.md`、`docs/view/panel/minimap/restart-mini-map-panel.md`、`docs/view/panel/activity/restart-activity-panel.md`、**`docs/view/panel/dex/restart-dex-panel.md`**、**`docs/view/panel/spt/restart-spt-panel.md`**、**`docs/view/panel/playerinfo/restart-playerinfo-panel.md`**、**`docs/view/panel/godpet/restart-godpet-panel.md`**、**`docs/view/panel/guide/restart-guide-panel.md`**。
⚠️ **命名口径**（**有意**不套 `<线>-<类>.md`）：分析报告按**主题**命名，血统用 `restart-` / `as3-` 前缀区分
⇒ 便于 `grep restart-petbag` 一类主题词一次命中。例外性质同 `runtime/` 的短目录（见 §7）。
⚠️ **本类别的编号纪律**：报告内部的怪癖登记用 **A\<n\>**，且**每份报告各自从 A1 起**（现各份：`restart-secret-skill-learning.md` **A1–A9**、`restart-petbag-panel.md` **A1–A16**、`restart-start-scene.md` **A1–A22**、`restart-world-map-panel.md` **A1–A11**、`restart-mini-map-panel.md` **A1–A12**、`restart-activity-panel.md` **A1–A11**、**`restart-dex-panel.md` A1–A14**、**`restart-spt-panel.md` A1–A8**、**`restart-playerinfo-panel.md` A1–A15**、**`restart-godpet-panel.md` A1–A8**、**`restart-guide-panel.md` A1–A14**）
⇒ 引用时**必须带文件名**（写作 `docs/view/panel/petbag/restart-petbag-panel.md §8 A3`），裸写「A3」有歧义；**不许**把 A\<n\> 读成人类决议。

- **`engine/` 为何含"移植线"三件套**：`kernel-handoff` / `port-map` / `oracle-playbook` 与 `battle-engine-*` 是**同一台引擎**的两类文档（移植 vs 设计），归一处便于对照（见 `battle-engine-design.md §9`）。
- **`domain/` 为何单独立线**：`Pet`/`Skill`/`Status`/`Buff`/`Effect` 数据模型与求值 DSL 是**引擎的下层**（依赖单向：引擎 → 域模型 → 底座），
  且**六成未落地**（3381 / 5718 行），体量与评审节奏都与引擎线不同。见 `docs/domain/domain-design.md §3/§6.1`。
- **新增一条线**：建 `docs/<线>/`，文件用 `<线>-<类>.md`；在 §6 索引加一行；先在 `architecture.md §4` 挂指针。

---

## 1. 文档类别

| 类 | 作用 | 例 |
|---|---|---|
| **总览 / 索引** | 跨线入口、不变量 | `docs/architecture.md` |
| **设计（design）** | 上游真值 / 目标口径 | `docs/save/save-design.md`、`docs/view/scene/battle/view-scene-battle-design.md`、`docs/view/scene/room/view-scene-hud-design.md`、`docs/view/view-design.md`、`docs/engine/battle-engine-design.md` |
| **实现（impl）** | 我们怎么落到代码 + as-built | `docs/save/save-impl.md`、`docs/view/scene/battle/view-scene-battle-impl.md`、`docs/view/scene/room/view-scene-hud-impl.md` |
| **交接 / 研究（handoff / notes）** | 路线、研究结论 | `docs/engine/kernel-handoff.md`、`docs/view/ui-handoff.md`、`docs/legacy/web-client-notes.md`、`docs/legacy/petbag-handoff.md`、`docs/engine/port-map.md`、`docs/engine/oracle-playbook.md`、`docs/legacy/swf-ir-plan.md` |
| **专题子文档** | 细则下沉 | `docs/save/save-xml-spec.md`、`docs/save/save-code-map.md`、`docs/arch-docs.md`、`docs/arch-code.md` |
| **代码分析报告（住面板 / 场景子目录）** | **只读分析上游源码**：把"上游到底怎么写 + 发行数据里能观察到什么"查清并钉死；**不发代码、不定目标行为**（决策仍归各线 design） | `docs/view/panel/petbag/restart-secret-skill-learning.md`、`docs/view/panel/petbag/restart-petbag-panel.md`、`docs/view/scene/start/restart-start-scene.md` |

---

## 2. 配对与命名

- **design / impl 成对**：`<线>-design.md` + `<线>-impl.md`。design = 权威 / 真值；impl = 落地 + as-built。
- **专题子文档**：`<线>-<专题>.md`（如 `save-xml-spec.md`、`save-code-map.md`），从属于某 design 或 impl。
- **架构轴子文档**：`arch-docs.md`（文档面）/ `arch-code.md`（代码面），从属于 `architecture.md`。
- **目录归线**：文件放 `docs/<线>/`（见 §0.1）；文件**名**保留 `<线>-` 前缀 ⇒ **引用一律写全路径** `docs/<线>/<文件>`，不写相对路径。

---

## 3. 父子链接纪律

- **父文档只链接不重复**（见 §0 的 README 约定）。
- **冲突时以更细 / 更专者为准**：如存档细则以 `save-xml-spec.md` 为准；impl 以 as-built 为准（§5）。
- **文档头块契约**（每份文档开头应声明）：范围 / 真值源 / 子文档链接 / 证据标注口径 / 已拍板决策 / as-built 指针。

---

## 4. 证据标注（可审计）

| 标 | 含义 |
|---|---|
| 【样本】 | 真档 / 真产物里**实证** |
| 【源码】 | 从上游源码读出（样本里未出现） |
| 【推断】 | 由序列化 / 运行规则**推出、未实证** |

**冲突优先级：样本 > 源码 > 推断。** 所有结构性断言尽量标 `路径` 或 `路径:函数`，读自真实代码 / 上游。

### 4.1 上游 bug 的处理政策（人类 2026-10-17 拍板 ⇒ **人类决议 ②**，索引 `AGENTS.md §5`）

| 对象 | 政策 | 写在哪 |
|---|---|---|
| **上游代码逻辑 bug**（写反的判断、漏掉的 fallthrough、误当哨兵的返回值、只对某条语法成立的巧合） | **声明 + 不照搬**：在相关文档的**怪癖/缺口登记**节里写明（`路径:行` + 症状 + 发行数据里的可观察后果），然后 `design` 文档**写"没有该 bug"的目标行为**，代码按目标实现 | 各子设计的「怪癖登记 / 待核」节，如 `docs/domain/domain-pet.md §7` |
| **发行数据里的拼写 / 水印**（例如重启内容表里真有一条写错的 `timing`） | **照搬** —— 静默兜底是**行为**不是 bug，两边行为必须一致 | `docs/domain/domain-design.md §1 V2`、`§7` 第 5 条 |

- 登记时**两条都要写**：①「上游怎么写」②「我们怎么写、为什么」。只写"照搬"或只写"修了"都不算登记完。
- ⚠️ 二者是**不同判据**，别拿 V2 给代码 bug 开脱，也别拿本政策去"修"数据表的兜底。

### 4.2 验收口径（同一轮拍板 ⇒ **人类决议 ⑦**）

- **对拍不是唯一验收手段，也不是主要手段**；**主要手段 = 人类手动测试并反馈**（原文见 `AGENTS.md §1.1`）。
- 因此文档里**不许**把"这条对拍不可比"记成死账；要写成**等人手测确认的具体项**（随机臂的目标口径见 `docs/runtime/runtime-components-design.md §7`）。

---

## 5. as-built 纪律

- 每份 impl 文档末尾保留 **as-built** 节：`docs/save/save-impl.md §9`、`docs/view/scene/battle/view-scene-battle-impl.md §14`、`docs/view/scene/room/view-scene-hud-impl.md §10/§12`。
- **与上文冲突时以 as-built 为准**（先如实记录的现状，再谈理想设计）。

---

## 6. 每线文档索引

| 关注 | 入口文档 |
|---|---|
| 内核移植目标 / 路线 / S1–S6 | `docs/engine/kernel-handoff.md` |
| **战斗引擎线** | **总设计** `docs/engine/battle-engine-design.md`（**§8 子设计地图 + §8.4 域模型边界真值**）；**导读** `docs/engine/battle-engine-overview.md`；子设计 **E1** `docs/engine/battle-engine-state.md`、**E2** `docs/engine/battle-engine-phases.md`、**E3** `docs/engine/battle-engine-units.md`、**E4** `docs/engine/battle-engine-effects.md`、**E5** `docs/engine/battle-engine-judge.md`、**E6** `docs/engine/battle-engine-session.md`、**E7** `docs/engine/battle-engine-views.md`（**出口契约**：内核 → 表现的唯一接缝）。**E1–E7 齐**，配对 `battle-engine-impl.md` + `battle-engine-code-map.md` ✅ 成文（待评审） |
| 移植事实 / 对拍 | `docs/engine/port-map.md`（逐算子实测）、`docs/engine/oracle-playbook.md`（操作手册 + 陷阱登记） |
| **域模型与求值线** | **总设计兼导读** `docs/domain/domain-design.md`（**§1 V1–V7 不变量 + §4 接缝清单 + §6 子地图**）；子设计 **D1** `docs/domain/domain-base.md`、**D2** `docs/domain/domain-status.md`、**D3** `docs/domain/domain-effect.md`、**D4** `docs/domain/domain-buff.md`、**D5** `docs/domain/domain-skill.md`（**技能数据模型**：逐臂归属 + **DTO↔真字段对齐合同** + 施工批 B1–B5）、**D7** `docs/domain/domain-info.md`（**宠静态表与派生**：`Info/*` 十件 + `PetInfo` 组装合同 + 三套 key 空间 + Exp/IV 算式精度 + 施工批 B1–B7）、**D6** `docs/domain/domain-pet.md`（**宠聚合与组件**：`Pet` + `Components/*` ×8 + `pet.` 标识符穿层的**五层拆解与逐臂归属** + 构造家族的决定性分级（**随机/时钟臂归 `docs/runtime/runtime-components-design.md`，不再记作"永久不可比"**）+ 写侧上移 + 施工批 B1–B7）；**D1–D7 全部成文**。**配对 impl**：**D6 `docs/domain/domain-pet-impl.md` ✅ 已写（已过审；B1 ✅ 六张宠表已进 oracle 解锁 S6，PetExpSystem 公式体已 golden；B2/B3 待落）**，其余 `impl` 待阶段一续。边界真值 = `docs/engine/battle-engine-design.md §8.4` |
| **运行时功能组件线**（2026-10-17 立） | `docs/runtime/runtime-components-design.md` —— 核心层需要的**外部能力**七件（**R1 随机源 · R2 时钟 · R3 存档读写面 · R4 写盘 sink · R5 提示/弹窗 sink · R6 判定与战斗宿主 · R7 内容表注册**），**一件一缝** + 装配点 + 默认行为 + 验收口径；含 §3 **21 个现状缝的实测普查**（其中 8 个全仓无调用方）。配对 `docs/runtime/runtime-components-impl.md` 待阶段一续 |
| **编排线**（2026-10-17 立） | `docs/orchestration/orchestration-design.md` —— **L4 编排层**（`docs/arch-code.md §2` 那一行）的总设计兼导读：上游 `Scripts/System/**` 七件（`GameManager` 6 状态机 / `SceneLoader` 场景切换 / **`Player` 全局会话单例（251 处调用）** / `Timer` / `RequestManager` / `Singleton` 三基类 / `AudioSystem`）+ 我们的现状（会话住在地图场景里、音频 0 行、无时钟/无请求层）。含**边界三则**（加载层视觉归 A1、`GameData` 修饰归 Save 线、本线是运行时线 §6 **装配点的宿主**）、**不变量 OR1–OR8**（⚠️ **OR8 = 模态处置**，随 M4 报入）、**待拍板 ORQ1–ORQ7**（✅ 全决）、**上游怪癖 ORC1–ORC5**（含"那个状态机在空转"、`DialogManager` 的跨层副作用 **ORC4**、`MapManager` 进图复位射击态 **ORC5**）、施工批草案 **ORB1–ORB5**。**立线依据 = `totalk.md` T2·4**（结构性缺口：4 处文档箭头曾指向这条不存在的线）。✅ **配对已成文并已评审（2026-10-18，阶段一续第一份；ORP1–ORP6 全部拍板）**：`docs/orchestration/orchestration-impl.md`（落地计划：**第一刀 = `ORB1 × ORB4-a` 合并**〔会话 = **XML 单一血统** + `storage` 归属 + R3 的值 ⇒ 解锁 View B5 批 C〕、**ORB3 作废**（v2/v3 直接废弃）、决策 D1–D9）+ `docs/orchestration/orchestration-code-map.md`（文件/接口/依赖规则 L4-1…L4-7） |
| **道具线**（2026-10-17 立） | `docs/item/item-design.md` —— **道具的"名词"与"动词"**：`ItemInfo` 静态行（7 列 + option 派生的 `resId`/`getId`/`removable`）+ `ItemDatabase` **三张词表 / 两个枚举** + `Item` 实例与**背包 API** + **使用规则**（`IsUsable` / `GetMaxUseCount` / 两个 handler）+ **买/卖**（币种 = **另一件道具的 id**）。**边界支点**：道具的效果**就是** D3 的 `Effect` ⇒ 本线**不建第二套效果引擎**（执行归 E4/E5），**写盘归编排线**（决议 ③）。含**不变量 IT1–IT8**、**上游怪癖 ITC1–ITC5**、**待拍板 ITQ1–ITQ8**、施工批 **ITB1–ITB5**。**立线依据 = `totalk.md` T2·5**（结构性：四条下游等它）。配对 `docs/item/item-impl.md` / `docs/item/item-code-map.md` 待阶段一续 |
| **地图线**（2026-10-17 立，C 组排期 ①） | `docs/map/map-design.md` —— **地图的"名词"与"会发生什么"**。★**两套血统**：**AS3 爬取件**（`swf/map/config/*.xml` **259 张**，6 个具名 handler，**0 条 `<battle>`**）vs **重启 Unity 件**（`Resources/Data/Maps/*.xml` **272 张**，**246 张含 NPC / 198 张含 `<battle>` / 1996 条 `<condition>` / 4355 条 `<action>`**〔解析口径；grep 口径 252/199/2023/4429〕）⇒ **MQ1 = 写侧以重启为准**、**MQ2 = 素材对齐规则**。★**基石对象 = `NpcButtonHandler`（条件 → 动作）**，它同时是 NPC 事件 / 对话 `<func>` / **战斗胜负链 `winHandler`**（**一个对象走遍全图**）。含七类实体、**14 种条件的命名空间表**（`random`/`map.`/`npc()`/`firstPet.`/`player.`/`data.`/`petBag`/`item[]`/`activity[]`/`mission()`/`battle.`/`yite_rogue.`/`plant.`/`animal.`）、**18 种动作**、对话、传送（**两步走位 + 昼夜镜像图 + `mapId==0/50000` 三特例**）、**地图战斗触发（`BattleSpec` → E6）**、几何寻路（path 纹理 + 多边形 + A*）、漫游 NPC。**边界**：画面 = B3、打起来 = E 线、会话宿主 = 编排线、面板 = C2；**不变量 MP1–MP8** + **上游怪癖 MC1–MC8** + ✅ **MQ1–MQ8 已拍板（§7 = 决议表，人类 2026-10-17）** + 子设计 **M1–M8** + 施工批 **MB1–MB5**。**立线依据 = `totalk.md` T2·2**（`docs/architecture.md §1.1` C 组「最大可玩缺口」；`docs/domain/domain-design.md:63` 的那个悬空箭头 = **本份的着落**）。配**M8** = `docs/map/map-actor-look.md`（📝 2026-10-20 成文 · **`ALQ1=A`/`ALQ2=B` 已拍板 · impl 计划 = `map-impl §3.10` · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20（e = 素材清单 + 缺包日志；f = SWF 叠层，as-built `map-impl §7.3.23`；g = 存档 `<equip>`，as-built `§7.3.24`）· e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）**：**11 槽分层装备** / 两套数字空间 / 部件包格式 / **坐骑 = 槽 3** / 素材清单与采集 / `ALC1–ALC14` / `MDB8-a…g`；存档 `<equip>` 正本 = `save-xml-spec §2.22`）。配对 `docs/map/map-impl.md` / `docs/map/map-code-map.md` ✅ **已成文（2026-10-18）** |
| UI 面板线（U0–U5） | `docs/view/ui-handoff.md` |
| 战斗场景版式 | `docs/view/scene/battle/view-scene-battle-design.md` + `docs/view/scene/battle/view-scene-battle-impl.md`（as-built §14） |
| 主场景 HUD | `docs/view/scene/room/view-scene-hud-design.md` + `docs/view/scene/room/view-scene-hud-impl.md`（as-built §10/§12） |
| 精灵背包/仓库（C1） | `docs/view/panel/view-panels-pet.md` + **`docs/view/panel/petbag-impl.md`**（独立施工图，as-built §12 **占位待回填 · 设计态**） |
| **精灵技能面板（更换技能 · C1 的一块）** | **`docs/view/panel/petbag/skill-panel-design.md`**（设计 · 2026-10-19 新立：不照搬 **SKB1–SKB5** / 本批默认 **SPQ1–SPQ6**）+ **`skill-panel-impl.md`**（配对 impl · **✅ 已落码**，请人测 §8） |
| 重启存档（XML） | `docs/save/save-design.md` + `docs/save/save-xml-spec.md`；实现 `docs/save/save-impl.md` + `docs/save/save-code-map.md` |
| **View 层总设计**（场景/层栈/面板栈） | `docs/view/view-design.md`（**§8 子文档地图**）＋子设计：`docs/view/mech/view-shell.md`(A1)、`docs/view/mech/view-panel-stack.md`(A2)、`docs/view/mech/view-overlays.md`(A3)、`docs/view/scene/room/view-scene-map-content.md`(B3)、**其配对 impl 已独立成文** `docs/view/scene/room/view-scene-map-content-impl.md`（B3 · 2026-10-19 新立 · **✅ 已落码 2026-10-19**：NPC 真美术上屏 = canvas 自绘 `#npc` 层 + L1 `npc-art.js` 三类映射，只 JS 路；as-built 见该份 §10）、`docs/view/scene/battle/view-scene-battle-stage.md`(B4)、**`docs/view/panel/view-panels-pet.md`(C1，2026-10-17 新立：精灵面板族 13 个 Panel 的归属表 + 背包/仓库深写；本地待拍板 **VP1–VP8 已全部拍板（2026-10-17，决议表见该文件 §11）**，与 `docs/view/panel/petbag/restart-petbag-panel.md` 的 **A1–A16** 两套编号，别混)**；**B5 `docs/view/scene/start/view-scene-start-design.md`（2026-10-18 新立：开始/选择角色场景，`Title`+`Login`；不变量 **STI1–STI11** / 待拍板 **STQ1–STQ8（2026-10-18 全决）** / 施工批 **STB-a…f**；证据底座 `docs/view/scene/start/restart-start-scene.md` 的 **A1–A22**；配对 impl `docs/view/scene/start/view-scene-start-impl.md`）**；配对 C1 的 impl **已独立成文** `docs/view/panel/petbag-impl.md`（见 `docs/view/panel/view-panels-pet.md §13`）；`docs/view/view-impl.md` 仍待写（只留给 `panelstack`/`battle-stage` 两节） |
| AS3 网页线（本线外） | `docs/legacy/web-client-notes.md`、`docs/legacy/petbag-handoff.md` |
| **「人类决议 ①–⑨」索引** | **`AGENTS.md §5`**（本文件 §7 的编号约定 + `§4.1` bug 政策 + `§4.2` 验收口径） |
| **等待讨论台账**（跨线 · **非决议非设计**） | **`totalk.md`**（仓库根，与 `AGENTS.md` 同级）—— 只装**还没谈完**的问题（条目号 **T1–Tn**，本文件本地编号）；已写清单式待拍板（Q/PD/本族/W）**不搬进来**，只指过去。谈定 ⇒ 结论归各线文档，本文件压成一行留档。<br>**T2** = **design 欠账总账**（清单 A = `docs/view/view-design.md §8` **已画圈的 9 份**，其中 **C1 已成文 ⇒ 待写 8 份**；清单 B = **`T2·1–T2·21`：上游里 design=0 且无任何线认领的功能面**，附【实测】行数）。⚠️ **T2·4 编排线已决（2026-10-17）** ⇒ 见 `docs/orchestration/orchestration-design.md`。⚠️ 子编号 **`T2·n` 是 T2 本地号**，引用必须带前缀（**不许**写成 `Gn`/`Nn` —— 那是域线的不变量/登记号） |
| **代码分析报告集合**（类别 · 非线） | 住**其服务的面板 / 场景的子目录**（`docs/view/panel/<面板>/` 或 `docs/view/scene/<场景>/`，落位口径见 §0.1）—— 只读分析上游源码的报告：<br>**`docs/view/panel/petbag/restart-secret-skill-learning.md`**（**秘技 / 隐藏技能学习**：数据层 `learnLevel` 编码 + 12 臂谓词 + **学习入口只有一条判谓词** + 怪癖登记 **A1–A9** + 人手测清单）<br>**`docs/view/panel/petbag/restart-petbag-panel.md`**（**重启精灵背包面板**：**一个机器被复用四次**（Normal / PVP / Dictionary / YiTeRogue，`mode` 序列化在 prefab/scene 里）+ "背包到底指哪个数组"的 switch **抄了三遍** + 网格机器 `SelectModel<T>`/`ISelectableArray<T>`/`IFilter<T>` + 九件操作逐条 + 仓库面板 + 三筛选互斥（含一个**括号表达式 DSL**）+ 一格头像三层素材 + 怪癖登记 **A1–A16** + 人手测清单 13 项）<br>**`docs/view/scene/start/restart-start-scene.md`**（**开始 / 选择角色场景** = 上游 `Title` + `Login`：`TitleManager` 844 行四件（入场擦出/工具条浮入/悬停/背景呼吸）+ 资源·Mod 两条文件流程 + `LoginManager` 68 行 + 3 槽 `save{0,1,2}.xml` + 建号/导入覆盖 + `Player` 会话单例；怪癖登记 **A1–A22** + 人手测清单 6 项；**明确澄清「改名 / 音量」不属这两个场景**）<br>⚠️ **三份各有一套 A\<n\>**，引用必带文件名（见 §0.1 编号纪律）。类别定义见本文件 §1，命名例外见 §0.1 |
| **素材台账**（跨线专题件 · **非线** · 2026-10-20 新立） | **`docs/asset-inventory.md`** —— 仓内**运行时真会读的素材与数据桥**逐件登记：**存储路径 · 是什么（体量/格式）· 干什么（消费点 `路径:行`）· 怎么获得（命令或人工步骤）· 丢了怎么办（入库状态）**。四张表 = **AS1–AS8 + AS37–AS41 上游发行件** / **AS9–AS20 `swf/**` 抓取件** / **AS21–AS36 我方生成件** / **AS-D1–D7 运行期与仓外件**，外加 §5 **开机取数顺序①–⑨**、§7 缺口 **ASG1–ASG8**（含"新克隆会挂"的 boot 硬缺口与"六棵上游图不在库里"的 ASG8）、§8 待拍板 **ASQ1–ASQ2**。**边界**：`vendor/**`、`projects/**` 整树与**仓外硬依赖**（0827 / Flex / Ruffle / CDN）的正本 = **`docs/external-refs.md`**，本份**只链接不重复**；静图提取细则正本 = `docs/item/item-design.md §3.1`。⚠️ 编号 **AS/ASG/ASQ 是本份本地号**，引用必须带文件名，**不许**读成人类决议 |
| 代码结构面 | `docs/arch-code.md` |

---

## 7. 命名卫生（已登记更正）

- **`rocoshowdown.*` 是第三方参考站 `rocoshowdown.cn` 的名字**，与约瑟传说 / 重启无关。
  早期照镜像建模时带进了 localStorage 键；存档新键改为本项目命名空间 `seer2.save{n}.xml`（见 `docs/save/save-impl.md §6`）。
- **真档文件名**仍是上游的 `save{id}.xml`（`id`=`gameDataId`），不随本地键改名。
- 前端展示名统一：**约瑟传说 / 重启**（不写"Seer2"[除仓库路径]），文档不引镜像站品牌。
- **`docs/runtime/` 的目录名比线名短**：线名 `runtime-components`（文件全名 `runtime-components-{design,impl}.md` 仍合规 §2），
  目录省略 `-components`。这是**有意**的（与 `save-xml-spec.md` 同类的短目录），不是命名违规；引用仍须写全路径 `docs/runtime/runtime-components-design.md`。
- **⚠️ 顶层的「跨线专题件」不带 `<线>-` 前缀**（2026-10-20 随 `docs/asset-inventory.md` 立此登记）：它们**不属任何一条线**（不产 design/impl 对），
  只服务**全仓**的一个横切问题 ⇒ 名字按**主题**取，落位 = `docs/` 根，与 `architecture.md`/`arch-code.md`/`arch-docs.md`/`status.md` 并列。
  现存三件：**`asset-inventory.md`**（素材的存储路径 / 作用 / 获取方法 / 入库状态）、**`external-refs.md`**（外部仓与仓外硬依赖；⚠️ 后者**尚未**被收进 §0.1/§6，其结账仍挂在该份 §9 归人类）、**`playtest.md`**（人类手测清单 = 请人测唯一正本，2026-10-24 立档；`status.md §2` 只留指针；条目无本地编号，按 A–E 分组引用）。
  例外性质同 `runtime/` 短目录与分析报告的主题命名（§0.1）；**引用仍须写全路径**，且各份**自带前缀**的本地编号（AS*/ERG*/T*）**不许**跨文档串号。
- **⚠️ 「引用一律写全路径」的边界**（2026-10-17 随 `view/` 三次下沉收紧）：**跨线**（不同 `docs/<线>/`）与**跨子目录**
  （如 `docs/view/panel/` → `docs/view/scene/battle/`）引用**必须**写全路径 `docs/<线>/<子目录>/<文件>`；
  只有**真同目录**的兄弟文档允许写短名，且**必须**在该目录 / 该表旁声明短名约定
  （如 `docs/view/view-design.md §8` 的表 = **相对 `docs/view/` 的路径** ⇒ 跨子目录时带 `mech/`、`scene/room/`、`scene/battle/`、`panel/`、`story/` 前缀；
  `docs/view/mech/`、`scene/room/`、`scene/battle/` **各自内部**互引可写纯名如 `view-scene-hud-impl.md`）。
  ⚠️ **窄例外**：**图表（ASCII / mermaid）里的节点标签**允许写**纯文件名**（受宽度所限）——但必须是**当前文件名**；
  能落地的引用（`docs/…` 路径 + `§n`）一律全路径。
- **⚠️ 圆圈数字 `①–⑨` 只指「人类决议」**（全局索引 = **`AGENTS.md §5`**；正文可简写「决议 ③」）。
  各文档**本地清单一律另起一套带前缀的号**，不许借用圆圈数字：D7 **本族待拍板 ①②③**（引用必带「本族」）、D5 **本份已拍板 ①②**、
  施工批 **B1–Bn**、上游代码 bug **CB1–CBn**、不变量 **G/P/S/U/V/A/J\<n\>**、运行时线 **RT1–RT7 / RB1–RB6 / Q1–Q5**、
  引擎 E6 待拍板 **PD1–PD3**（⚠️ 与 E2 不变量 `P1–P8` 不同套）、Save 线 **S-决策 1/2**、D0 跨线待拍板 **W1–W5**、View 的 `P0/P1/P2/P3` = **子文档优先级**、
  编排线 **OR1–OR8 / ORQ1–ORQ7 / ORC1–ORC5 / ORB1–ORB5**、道具线 **IT1–IT8 / ITC1–ITC5 / ITQ1–ITQ8 / ITB1–ITB5**、
  战斗数值拆分 **SP1–SP8 / SPC1–SPC4 / SPQ1–SPQ3 / SPB1–SPB4**（`docs/view/battle-split.md`）、
  地图线 **MP1–MP8 / MC1–MC8 / MQ1–MQ8 / MB1–MB5**（子设计地图 = **M1–M8**，`docs/map/map-design.md`；impl 执行序 = `MB1…MB10`）；
  ⚠️ 地图线**子设计各自另起前缀**（`docs/map/map-<专题>.md` 头部已声明）：**M1 `MDI/MDC/MDQ`** · **M2 `MNI/MNC/MNQ`** · **M3 `CSI/CSC/CSQ`** · **M4 `DLI/DLC/DLQ`** · **M5 `TPI/TPC/TPQ` + 施工批 `MDB5-a…e`**。
  ⚠️ **顶层跨线专题件另起前缀**：**`docs/asset-inventory.md` = 素材条目 `AS1–AS41` / 运行期与仓外件 `AS-D1–D7` / 缺口 `ASG1–ASG8` / 待拍板 `ASQ1–ASQ2`**，
  **`docs/external-refs.md` = 缺口 `ERG1–ERG5` / 待拍板 `ERQ1–ERQ3`** ⇒ 两套互不相干，引用**必须带文件名**。
  ⇒ 新增本地清单时**先选一个不撞的前缀**，并在文档头声明；表格内部自解的枚举（如 View 分层图 ①–④）可以留，但**不许**跨文档当决议引用。

---

## 8. 待补

- **已被引用但尚未成文**：`docs/view/view-impl.md` + `docs/view/view-code-map.md`（View 配对实现）、
  `docs/domain/domain-impl.md` + `docs/domain/domain-code-map.md`（域线配对）、
  `docs/engine/battle-engine-impl.md` + `docs/engine/battle-engine-code-map.md`（引擎配对）、
  `docs/runtime/runtime-components-impl.md`（运行时功能组件配对）、
  ~~`docs/orchestration/orchestration-impl.md`（编排线配对）~~ ⇒ ✅ **已成文（2026-10-18）**：`docs/orchestration/orchestration-impl.md` + `docs/orchestration/orchestration-code-map.md`（**阶段一续从此开始**），
  `docs/item/item-impl.md` + `docs/item/item-code-map.md`（道具线配对）、
  `docs/map/map-impl.md` + `docs/map/map-code-map.md`（地图线配对；⚠️ **地图线子设计 M1–M8 已成文 ⇒ 已从本表移出**：`map-data.md` / `map-npc.md` / `map-condition.md` / `map-dialog.md` / `map-teleport.md` / `map-battle-trigger.md` / `map-move.md` / **`map-actor-look.md`（M8，资料索引 · `ALQ1=A`/`ALQ2=B` 已拍板 · impl 计划 = `map-impl §3.10` · `MDB8-a`–`d` 手测通过 · `MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20 · e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅） · g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅））**）、
  `docs/common-questions.md`、`docs/formats/jpeg.txt`（⚠️ **经查这两份没有任何入向引用** —— 不属"悬空箭头"，只是挂名备忘，等真有消费者再写）。
  > **View 线 §8 表里「已画圈待写」的 7 份子设计**（同样已引用、尚未成文；成文时按 §0.1 的 `view/` 口径落位）：
  > B6 `docs/view/scene/view-room.md`、B7 `docs/view/scene/view-minigame.md`（⚠️ 这两份**不属 `room/`/`battle/`/`start/` 三支，归属待定**）、
  > C2 `docs/view/panel/view-panels-item.md`、C3 `…/view-panels-map.md`、C4 `…/view-panels-social.md`、C5 `…/view-panels-system.md`、D1 `docs/view/story/view-story.md`。
  > ⚠️ **B5 已于 2026-10-18 成文并归位** ⇒ `docs/view/scene/start/`（分析报告 `restart-start-scene.md` + 设计 `view-scene-start-design.md` + impl `view-scene-start-impl.md`），从本表移出。
  > ⚠️ **B3 的配对 impl 已于 2026-10-19 独立成文（✅ 已落码 2026-10-19）** ⇒ `docs/view/scene/room/view-scene-map-content-impl.md`（NPC 真美术上屏施工图，as-built 见 §10）；`docs/view/view-impl.md` 的 `map-content` 节 ⇒ **因此不再预留**，该文件仍只留给 `panelstack`/`battle-stage` 两节。
  > 三条线的「配对 impl + code-map」都在**阶段一续**（全部 `design` 定稿后）统一编，见 `AGENTS.md §1`。
  > **引擎线 `design` 已齐**（E1–E7）；**域线 `design` 已齐（D1–D7，含 `docs/domain/domain-pet.md`）**；
  > **运行时功能组件线 `design` 已成文**；**编排线 `design` 已成文**（`docs/orchestration/orchestration-design.md`，2026-10-17 随 `totalk.md` T2·4 立线）；
  > **道具线 `design` 已成文**（`docs/item/item-design.md`，2026-10-17 随 `totalk.md` T2·5 立线）；
  > **地图线 `design` 已齐**（`docs/map/map-design.md`，2026-10-17 随 `totalk.md` T2·2 立线 = **C 组排期 ①**；子设计 **M1–M8 已成文（`map-data` / `map-npc` / `map-condition` / `map-dialog` / `map-teleport` / `map-battle-trigger` / `map-move` / `map-actor-look`，均待评审；M8 = 资料索引、`ALQ1=A`/`ALQ2=B` 已拍板、impl 计划 = `map-impl §3.10`、`MDB8-a`–`d` 手测通过、`MDB8-e`/`f`/`g`/`f2` 代码已落 2026-10-20、e §8.17 ✅ 已通过（人类 2026-10-21「全部测试通过」）、f 的 §8.18 已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅）、g §8.19 ✅ 已通过（人类 2026-10-21「全部测试通过」） · f2 的 §8.20（修「双角色」）已随 ★M9-c 退役、不可测（等价判据 = `§8.23` ✅））**）；
  > **`docs/view/battle-split.md` 已成文**（连击均分 / 伤害拆分 的 **View 侧跨族正本**，2026-10-17 ⇒ 已从上面"尚未成文"移出）；`docs/save/*` 四份已成文。
- 通用「文档模板」尚未抽出单文件；如需可增 `docs/_template-*.md`（暂不强制）。
- **目录迁徙已做**（2026-10-17 · 三轮）：
  **第一轮**按线入子目录、全仓引用同步；**第二轮** `view/` 内部二次下沉（B 族 → `view/scene/`、C1 配对 impl → `view/panel/`；A/C 之外暂留根），
  含 4 处**跨线裸名补成全路径**与 `petstorage/` 补 `.gitkeep`；
  **第三轮**（本轮）`view/` 第三层下沉 + 改名：**A 族 → `view/mech/`**、**D 族 → `view/story/`**（`.gitkeep` 占位）、
  **B 族 6 份改名 `view-scene-*` 并按场景分 `scene/room/`（B1+B3）与 `scene/battle/`（B2+B4）**，
  另把 C2–C5/B5–B7/D1 的**短名补成各自子目录前缀**、10 处跨子目录/跨线**裸名或简称补成全路径**（含 2 处代码注释里的 `hud-impl §3.1`）。
  三轮的「旧路径零残留 + 人工核对存在性」都是**人肉 grep**（口径见 `AGENTS.md §2`）——见 §0.1。
