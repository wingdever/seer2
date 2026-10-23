# 战斗引擎线代码地图（battle-engine-code-map.md）

> **配对 impl**：`docs/engine/battle-engine-impl.md`（落地计划 / 施工批 / 验收）。
> **真值（架构）**：`docs/engine/battle-engine-design.md §3`（模块图）/ `docs/arch-code.md §3`（依赖规则）。
> 本份是 **`game/core/**` 内战斗相关文件的逐文件清单**：职责 / 依赖方向 / oracle kind / 状态 / grep 门禁。
> ⚠️ 凡是「数据模型归属域模型线」的文件（`effect/*`、`buff/*`），本份只列物理位置与依赖，归属真值见 `battle-engine-design.md §8.4`。
> ⚠️ **`game/core/map/*`（map-table/condition/button/action）属地图线，本份不列**（见 `docs/map/map-impl.md`）。

---

## 1. 文件清单（按层，对应 design §3.2 / kernel-handoff §3）

### 1.1 求值层（S1）
| 文件 | 职责 | 依赖 | oracle kind |
|---|---|---|---|
| `parser/parser.ts` | DSL 解析主入口 | operator/identifier | `parse/operate` |
| `parser/operator.ts` | 运算符表 | — | `opknown/operate` |
| `parser/identifier.ts` | 标识符（含 R3 接缝 `IdentifierHost`） | — | `ident/condknown` |
| `parser/identifier-effect.ts` | 带 effect 上下文的标识符链 + `ParseEffectOperation` | identifier | `effectident` |
| `strutil.ts` / `numutil.ts` / `mathf.ts` / `vocab.ts` / `collections.ts` | 字符串/数值/数学/词表/容器工具 | — | `numid/msign/mabs/…` |

### 1.2 数值层（S2）
| 文件 | 职责 | 依赖 | oracle kind |
|---|---|---|---|
| `pet/status.ts` | `getPetNormalStatus` 等属性权威 | linear/element | `normalstatus/statusop` |
| `pet/status-controller.ts` | 战斗内状态控制器（7 突变器） | status | `statusctrl/petmut` |
| `pet/element.ts` / `pet/linear.ts` | 元素关系 / 线性曲线 | — | `elemrel/elemname` |
| `battle/damage.ts` | 伤害公式 | status/element | `m*/orderby/roundi/…` |
| `rng.ts` | R1 随机源算法（种子可复现） | — | （注入，不进 golden） |

### 1.3 效果 / 印记层（S3 一/二/三 + E4/E5）
| 文件 | 职责 | 依赖 | oracle kind |
|---|---|---|---|
| `effect/effect.ts` / `effect/effect-database.ts` | 效果数据模型（**归属域模型线**） | parser | `effectparse` |
| `buff/buff.ts` / `buff/buff-info.ts` / `buff/buff-database.ts` / `buff/buff-refer-data.ts` | Buff 数据模型（**归属域模型线**） | — | `buffinfo/buffid/buffdesc/refer` |
| `battle/effect-handler.ts` | 效果队列消费 | effect-judge | `effectq` |
| `effect/effect-judge.ts` | **判定面（Condition）+ Apply 外壳 + dispatch**；生产 `JUDGE=NOT_PORTED`，按 kind 注入 | effect/target | `effectcond/effectapply` |
| `battle/target.ts` | `getBattlePetTargetList` | — | `target` |
| `effect/ops-basic.ts` | `set_damage(14)` + `add_status(8)` | damage/statusctrl | `effectapply` |
| `effect/ops-buff.ts` | `add_buff(10)` + `remove_buff(11)` | buff-controller | `effectapply` |
| `effect/ops-heal.ts` | `heal(5)` | status | `effectapply` |
| `effect/ops-powerup.ts` | `powerup(7)`（进不了 golden，函数体照搬） | — | `effectapply` |
| `effect/ops-capture.ts` | `capture(3)` | target | `effectapply` |
| `effect/ops-pet.ts` | `pet_change(4)` | target/buff | `effectapply` |
| `effect/ops-skill.ts` | `set_skill(15)` | skill-table | `effectapply` |
| `effect/ops-block.ts` | `block_buff(9)` | buff | `effectapply` |
| `effect/ops-state.ts` | `set_weather(17)` + 状态类 | — | `effectapply` |

### 1.4 状态快照 / 驱动 / 单位（S3 三/四段 + E1/E2/E3）
| 文件 | 职责 | 依赖 | oracle kind |
|---|---|---|---|
| `battle/state.ts` | `BattleState`（值拷贝构造）+ `Unit` + `PetSystem` | — | `statecopy/stateset/stateflag/giveturn/gofirst/petbag` |
| `battle/settings.ts` | `BattleSettings` | — | `settings` |
| `battle/result.ts` | `BattleResult`（ProcessResult **未搬**，见 impl D4） | — | `result`（部分） |
| `battle/phase.ts` | 14 相位流水线 + 时机队列（47KB） | state/effect-handler | `phaseq/phasedrive` |
| `battle/unit-skill-system.ts` | `UnitSkillSystem` | skill-table | `skillsys` |
| `battle/skill-table.ts` | 5340 张真技表接口（宠表仍围栏） | — | `skilltable` |
| `battle/views.ts` | **出口 DTO（E7 只读契约）** | state | —（pull DTO） |

### 1.5 战斗宠组件（E3，⚠️ 位置待迁 battle/，impl D3）
| 文件 | 职责 | 依赖 | oracle kind |
|---|---|---|---|
| `pet/buff-controller.ts` | 战斗宠 buff 控制器（9 方法已补完） | buff | `buffinfo` + `SigPet` 五段 |
| `pet/skill-controller.ts` | 宠技能容器四袋 | — | （容器，接 D5 B1–B3） |

---

## 2. 依赖方向（硬规则，承接 `arch-code.md §3`）

    L1 会话(logic/**)  →  L0 引擎(core/**)  →  域模型与求值线(被消费)
       │                        │
       │                        └→ 内容桥 content.js（注入）
       └→ 存档 Save 线（回写）
    L3/L4 表现  ←  引擎出口 views.ts（只读 DTO）

- **引擎不得认识表现层**；表现层不得直接 `import game/core/**`（经 L2 内容桥）。
- **L0 对上层不可见**：core 不 `import game/logic/**`、不碰 DOM / `UnityEngine` / `Player.instance` / `Photon` / `Database.instance`。
- **域模型线单向**：引擎消费 `effect/*`、`buff/*`，禁反向依赖（design §8.4）。

---

## 3. grep / 回归门禁（每次落码必跑；现状基线见 impl §3.1）

    node tools/difftest.mjs      # 向量/可比/不一致=0；架子没对上=0
    node --test game/core/       # pass 不降（现 304）
    node tools/build-core.mjs    # 改了 .ts 必跑，勿手改 .js
    # 无头门禁（E1）：core 不得认识引擎/平台
    grep -E "UnityEngine|Player.instance|Photon|Database.instance" game/core/**   # 期望：空输出

---

## 4. 人工核对清单（迁移 / 改名安全）

- **D3 `pet/*` → `battle/` 迁移**（S5 时做）：先出 old→new 映射表 → 全仓机械替换（含 `import` 路径与注释断言）→ `git mv` 保历史 → 复跑 §3 门禁。迁移后 `pet/` 只留**域模型线**真身（`status/element/linear` 等通用件）。
- **D4 `logic/settle.js` 去手炒**（S5 时做）：删手炒前先确认 `core/battle/result.ts` 已接 oracle 并绿；改完后 `grep -rn "settle.js" game/` 仅剩 import core 的引用。
- **新增算子（批五）**：每支落地后 `PortedAbilities` 白名单扩 + 对应 `ops-*.ts` 接 `applyAbility` case + 复跑 §3 门禁；随机臂按 D2 发合成向量、断言同 seed 复现。
- **任何 `core/**/*.ts` 改动**后必须 `build-core.mjs`，否则浏览器加载旧 `.js` ⇒ ESM 链接期黑屏（`arch-code.md §7.1`）。
