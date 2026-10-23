// L1 · 野怪**漫游**（施工批 **MB9** / `docs/map/map-impl.md §3.9`，蓝图 `§7.3.11`）。
//
// 只做**纯步进**：给一只带 `<wild><movement mode="wander">` 的野怪 NPC 维护一个"在家附近溜达"的
//   初态（`seedWander`）+ 每帧推进一步（`stepWander`）。画布 / 装载 / rAF / 点击命中全在 **L4 `app/scenes/mapScene.js`**。
//
// ⚠️ **无碰撞、无寻路、不吃 `nav.ts`/`geometry.ts`**（`map-impl §3.9` D5 / 人类 2026-10-18 裁定"哪里都能走"）⇒
//    野怪可能**穿过墙/遮挡**（已登记为等人眼确认项，`map-impl §8.8` / `AGENTS §4.15`）；
//    ⚠️ **JS 路 + SWF 路都走**（施工批 **`MDB11`** · 人类 2026-10-21 点名 ③「两条路都走」⇒ 原「仅 JS 路、SWF 路照 `MapRunner.as`
//    自己溜达」的口径**作废**：合成野怪表断粮后 AS3 不再生成 `WildPet`，SWF 图上的野怪只有我们叠加层这一份）。
// ⚠️ **随机 / 时钟由外部注入**（决议 ① R1/R2）：`rand: () => [0,1)`、`dtSec`（真实 deltaTime）由 L4 传进来，本件**不自带**
//    `Math.random` / `Date.now`（可离线复算、可测）。卡住检测按 `deltaTime`（`MWI6`，**不照搬**累加 `moveTick` 的假时间）。
// ⚠️ 半径 = 数据侧 `movement.radius`（缺省 120，`WILD_MOVE_DEFAULT`）；速度 = `movement.speed` px/s；
//    `idle`/`step` = `"min,max"` 秒 / 像素（`parse-map.js` 的 `wild.movement` 原样透传）。`snap`/`moveTick` **本件忽略**（连续 dt，非网格 tick）。
// ⚠️ **talk 气泡已迁出**（施工批 **MDB10** / 人类 2026-10-21）：本件**只管走位** ⇒ 气泡调度住在
//    `game/logic/map/talk.js`（`seedTalk`/`stepTalk`）。迁出的原因 = 气泡**两条渲染路都要出**（SWF 路的野怪不漫游、JS 侧没有 `_wander`），
//    为了一个气泡去伪造 `_wander` 是错的耦合。旧 `state.bubble` 字段与 `stepWander` 的 `talk` 形参**一并删除**（不留兼容垫片）。
//
// 真值：`docs/map/map-impl.md §3.9`（MB9 蓝图）· `docs/map/map-move.md §7.3` 第 4/5/6 条 · `AGENTS §4.7/§4.15`

/** `"min,max"` → `[min,max]`（切不出 ⇒ `null`）。 */
function range(s) {
  if (typeof s !== 'string') return null
  const p = s.split(',').map((x) => Number(x.trim()))
  return p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null
}

/** 在 `[min,max]` 里按注入的 `rand` 取一个数（`max<min` 时自动交换；空 ⇒ 0）。 */
function pick(s, rand) {
  const r = range(s)
  if (!r) return 0
  const lo = Math.min(r[0], r[1])
  const hi = Math.max(r[0], r[1])
  return lo + rand() * (hi - lo)
}

/**
 * 给一只 NPC 建**漫游初态**；非 `wander` / 无 `pos` ⇒ `null`（照旧静态画）。
 * @param {object} npc `entity.buildEntities` 的一条（含 `wild.movement` 与 `pos={x,y}`）
 * @param {() => number} rand 注入的随机源（`[0,1)`）
 * @returns {{home:{x:number,y:number}, pos:{x:number,y:number}, target:{x:number,y:number},
 *            phase:'idle'|'move', timer:number, bobPhase:number, face:number} | null}
 */
export function seedWander(npc, rand = Math.random) {
  const mv = npc?.wild?.movement
  if (!mv || mv.mode !== 'wander') return null
  const p = npc?.pos
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
  const home = { x: p.x, y: p.y }
  return {
    home,
    pos: { x: home.x, y: home.y },
    target: { x: home.x, y: home.y },
    phase: 'idle',
    timer: pick(mv.idle, rand),                    // 首次待机时长
    bobPhase: 0,                                   // 待机上下浮（cosmetic）
    face: mv.originalFacesRight ? 1 : 1,           // 朝向（静帧不翻，本批仅记录）
  }
}

/**
 * 推进一步（就地更新并返回 `state`，供 L4 存回 `npc._wander`）。
 * ⚠️ `dtSec` 由调用方**夹好上限**（建议 ≤ 0.05~0.1，防切后台回来瞬移）；本件不再夹。
 * @param {object} state `seedWander` 的产物
 * @param {object} movement `npc.wild.movement`
 * @param {number} dtSec 真实 deltaTime（秒）
 * @param {() => number} rand 注入的随机源（`[0,1)`）
 */
export function stepWander(state, movement, dtSec, rand = Math.random) {
  if (!state || !movement) return state
  const dt = Number(dtSec)
  if (!Number.isFinite(dt) || dt <= 0) return state
  const radius = Math.max(0, Number(movement.radius) || 0)
  const speed = Math.max(0, Number(movement.speed) || 0)

  if (state.phase === 'idle') {
    // 待机：按 `bobSpeed` 给一点上下浮（cosmetic，`bob="x"` 时生效）——画环仍取 `state.pos`，bob 只进 `bobPhase`。
    if (Number(movement.bob) > 0) {
      state.bobPhase += dt * (Number(movement.bobSpeed) || 2)
    }
    state.timer -= dt
    if (state.timer > 0) return state
    // 到点 ⇒ 选一个新 `target`：方向随机、距离 = `step` px，钳在 `home` 半径 `radius` 内。
    const dir = rand() * Math.PI * 2
    const dist = pick(movement.step, rand)
    let tx = state.home.x + Math.cos(dir) * dist
    let ty = state.home.y + Math.sin(dir) * dist
    const hx = tx - state.home.x
    const hy = ty - state.home.y
    const hd = Math.hypot(hx, hy)
    if (radius > 0 && hd > radius) {              // 越界 ⇒ 拉回半径边
      tx = state.home.x + (hx / hd) * radius
      ty = state.home.y + (hy / hd) * radius
    }
    state.target = { x: tx, y: ty }
    state.phase = 'move'
    return state
  }

  // move：按 `speed` px/s 直线挪向 `target`（无碰撞 ⇒ 直线可穿墙）。
  const dx = state.target.x - state.pos.x
  const dy = state.target.y - state.pos.y
  const d = Math.hypot(dx, dy)
  const stepLen = speed * dt
  if (d <= stepLen || d === 0) {
    state.pos = { x: state.target.x, y: state.target.y }
    state.phase = 'idle'
    state.timer = pick(movement.idle, rand)
  } else {
    state.pos = { x: state.pos.x + (dx / d) * stepLen, y: state.pos.y + (dy / d) * stepLen }
  }
  return state
}
