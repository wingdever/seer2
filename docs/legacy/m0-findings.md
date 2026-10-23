# M0 内核探针结论 (2026-10-13)

验证脚本: `node tools/verify-kernel-ops.mjs` (M0 ALL PASS)。内核源快照 `vendor/arcadia-eternity-src-snap.tar.gz` (commit 见 `vendor/arcadia-commit.txt`), /tmp/arcadia 丢失后解包重装依赖即可重建。

## 内核交互规则(已实测)
- **主动换宠占本回合行动**: `switch-pet` 与 `use-skill` 并列出现在 available; 提交后需敌方也提交、整回合才结算 (turn.handler.ts 排序 switch first)。
- **濒死窗口**: 宠物被击杀后, 该侧 `getAvailableSelection` 仅返回 `switch-pet` / `surrender`。
- **强制换宠结算滞后**: 在濒死窗口提交 `switch-pet` 后, `activePet` 不一定立即更新——需推进一次双方动作才落到快照。UI 层表现换宠动画时不要同步等 activePet, 监听 `PET_SWITCH` 事件即可。
- **回合外直改 world 可行**: `BattleKernel.hp(petId)` / `setHp(petId, v)` 经 `attrSystem.get/setBaseValue(world, petId, 'currentHp')`, 不经 `submitAction`, 钳制到 [0,maxHp]。道具回血/抓捕扣血判定可走此通道。
- **selection.skill 是技能实例 id**, 非配置 base id。glue 的 `available()` 现已同时返回 `skill`(实例)与 `baseId`; `playSkill` 两种 id 都接受, 找不到时**报错不兜底**(怒气不足的技能不会出现实例选择 → UI 应据此置灰按钮)。
- 事件名: `PET_SWITCH / FAINT_SWITCH / FORCED_SWITCH / PET_DEFEATED / BATTLE_END(reason: all_pet_fainted|surrender)`。

## BattleKernel 对外 API (glue.ts)
`start({seed, left, right})` — 每侧支持 `pets: [petcfg...]` (首个=首发), 兼容旧单宠字段; 返回 `{players:[{side,id,name,activePet,team:[{petId,name,swfId,level,index}]}]}`。
`snapshot / available(side) / playSkill(side, base|instanceId) / switchPet(side, petId) / submit(selection) / hp(petId) / setHp(petId,v) / petMeta(petId) / sideOfPet / events / cleanup / battleRef()`

## 跨页战果回传契约 (battle.html → map.html)
 sessionStorage(同源自动共享, 关闭标签即清):
- key: `roco.battle.result.v1`
- 写方 battle.html 在战斗终点写入 JSON:
  `{ ts, wild: {petId, level, slot, back, map}, outcome: 'capture'|'win'|'lose'|'escape'|'surrender', captured: {petId, level}|null, left: {hp:[各宠当前/最大], pets:[swfId...]} }`
- 读方 map.html `load` 时 `getItem` 立即 `removeItem`, 交给 `game/logic/session.js` 结算(经验/图鉴/仓库入档), 失败留 `roco.battle.result.v1.retry` 一次性重试。
- URL query 仅保留**进战斗方向** (?wild=&level=&slot=&map=&back=), 回传一律走 sessionStorage。

## M3 期间新实测 (battle.html 接线)
- **do-nothing 不在常规选择阶段提供**: `getAvailableSelection` 常规阶段只有 use-skill/switch-pet(/team-selection), 濒死窗口才有 surrender。道具/抓捕/逃跑失败因此**不消耗内核回合** (logic 层仍计 turns 并扣道具), 与原版有偏差, 已在 UI 日志标注。
- **怒气不够时技能不出现在选择列表**: 指定 baseId 的 playSkill 会抛 "no use-skill selection"。takeTurn 捕获后退化为任一可用 use-skill, 仍失败才走 maybeSurrenderIfStuck; 这是 C1(打赢) 40 回合卡死的根因 (Lv60 首发技 20 怒/回合回 15)。
- **PET_SWITCH 载荷键是 `toPet`** (fromPet/toPet), 不是 pet。
- **战败兜底**: 我方全灭待换宠窗口只有 switch-pet/surrender; 若驱动循环不提交, 战斗永不 BATTLE_END → maybeSurrenderIfStuck 在无可行动时提交 surrender (reason=surrender 即战败语义)。
