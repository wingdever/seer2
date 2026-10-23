# 当前主线指针（冷启动入口）

> **本文件只做一件事**：把新会话/新人 30 秒内送到正确的入口。
> **不装状态**（各线到哪了 ⇒ `docs/status.md` 唯一状态台账）、**不装规则**（`AGENTS.md`）、**不装 as-built**（各线 impl 文档）。
> 旧版（2026-10-16 战斗内核/UI 线长叙事与基线数字）已被上述正本取代，勿再引用。

## 读的顺序

1. `AGENTS.md` —— 工作方式（**文档先行、全局先行**，阶段一 design → impl → 阶段二逐模块落码停等人测）与围栏禁令（§4）。
2. `docs/status.md` —— **唯一状态台账**：各线进度 / 待拍板 / 请人测 / 已知风险。
3. 按你要做的线进各线入口文档（目录树 = `docs/arch-docs.md §0.1`）：
   - 战斗内核 = `docs/engine/kernel-handoff.md`（路线图/下一件事/门禁）+ `port-map.md` + `oracle-playbook.md`
   - 地图 = `docs/map/map-impl.md`（as-built §7）· View 面板族 = `docs/view/` · 存档 = `docs/save/` · 域模型 = `docs/domain/`
   - 素材与数据件台账、新克隆 bootstrap = `docs/asset-inventory.md`

## 快照事实（只是防迷路，细节以上面为准）

- 本仓 = 纯本地 git 仓库（2026-10-21 对象库损坏后以工作区重置为单一初始提交）；**2026-10-24 拍板推 Gitee 私有仓**（瘦身 A 档先行，出库件拉回脚本 = `docs/asset-inventory.md §5`）。
- 既有门禁（人类偶尔复跑，不新增）：`node tools/difftest.mjs` / `node --test game/core/` / `docs/arch-code.md §3` grep 门禁。
- 改 `game/core/**/*.ts` 后**必须** `node tools/build-core.mjs` 重生成 `.js`（浏览器只加载 `.js`）。

## 已登记未修的产品缺陷（指针）

- ~~`game/app/router.js route()` 异步 mount 竞态~~ **已修（2026-10-24，串行链方案，等人类手测）**：as-built =
  `docs/view/scene/battle/view-scene-battle-impl.md §14.4` 末段；请人测 = `docs/status.md §2`「路由串行化回归」。
- 烘焙线的目标快照 = `projects/bake/RESUME.md`（该线已废弃冻结）。
