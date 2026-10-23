// L1 · 野怪**对话气泡调度**（施工批 **MDB10** / `docs/map/map-impl.md §7.3.32`，蓝图 `docs/map/map-move.md §2.7`）。
//
// 从 **MB9** 的 `wander.js` 里**独立出来**的一件：气泡调度**不依赖走位** ⇒ 挂独立的 `e._talk`，
//   与漫游态 `_wander` 各走各的循环 ⇒ **两条路都出**（人类 2026-10-21 点名范围，`AGENTS §4.15` ⑤）。
//   ⚠️ **`MDB11` 更正**：本件当初独立的理由之一「SWF 路的野怪走位归 `MapRunner.as`、JS 侧没有 `_wander`」已不成立 ——
//   合成野怪表断粮后 **SWF 路的野怪也由 JS 漫游**（人类同日点名 ③）；但**调度器仍分开**（气泡不该被走位循环绑住，两件事两种节奏）。
//   本件只管**什么时候冒、冒哪一条、冒多久**；画布 / 装载 / URL / rAF 全在 **L4 `app/scenes/mapScene.js`**。
//
// ⚠️ **`image` 与 `text` 进同一个池子、均匀随机**（人类 2026-10-21 点名口径 = **照上游**）：
//    上游 `TryShowTalk`（正本 `docs/map/map-move.md §2.7`）在**全部有效** `self` 里随机取**一条** ⇒
//    **有 `image` 就 `ShowImage`、否则 `ShowText`**。实测池子 = 3,520 条（2,682 图 + 838 文）⇒ 约 **3/4 出表情、1/4 出台词**
//    （文本条目**不删**、只是被稀释）。⚠️ **本件只写"原样 id"**（`st.image = 'emoji/toon/angry'`），
//    **不拼 URL** —— URL 属美术件那一族 ⇒ 交 L4 经 `logic/map/npc-art.js` 的 `talkImageUrl()` 解析。
// ⚠️ **随机 / 时钟由外部注入**（决议 ① R1/R2，与 `wander.js` 同口径）：`rand: () => [0,1)`、`dtSec` 由 L4 传进来。
// ⚠️ **只在"驻停"时起新泡**（`canStart()` ⇒ 上游 `OnRestStarted` 口径，`map-impl §8.8`"驻停时冒"）；
//    已在显的那条**跨相位**继续存在到 `duration` 结束（不因为开始走路就掐掉）。
// ⚠️ `interval` 缺省 ⇒ `pick` 返回 0 ⇒ **挂载即到点**（第一帧就摇一次 `chance`），与 `wander.js` 旧行为一致。
//
// 真值：`docs/map/map-move.md §2.7`（上游 `TalkScheduler`）· `docs/map/map-impl.md §3.9`（MB9 蓝图尾步）· `AGENTS §4.15` ⑤

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

/** `self` 条目是否**有效**：`text` 非空 或 `image` 非空（上游 `NpcInfo.GetRandomSelf` 的"有效"判据）。 */
function valid(e) {
  if (!e) return false
  if (typeof e.image === 'string' && e.image.trim()) return true
  return typeof e.text === 'string' && !!e.text.trim()
}

/**
 * 给一只 NPC 建**气泡调度初态**；无 `wild.talk` 或 `self` 里**一条有效都没有** ⇒ `null`（L4 不画气泡）。
 * @param {object} npc `entity.buildEntities` 的一条（含 `wild.talk`）
 * @param {() => number} rand 注入的随机源（`[0,1)`）
 * @returns {{text:string|null, image:string|null, timer:number, next:number} | null}
 */
export function seedTalk(npc, rand = Math.random) {
  const talk = npc?.wild?.talk
  if (!talk) return null
  if (!(talk.self || []).some(valid)) return null
  return { text: null, image: null, timer: 0, next: pick(talk.interval, rand) }
}

/**
 * 推进一步（就地更新并返回 `st`，供 L4 存回 `npc._talk`）。
 * ⚠️ `dtSec` 由调用方**夹好上限**（建议 ≤ 0.05~0.1，防切后台回来跳档）；本件不再夹。
 * @param {object} st `seedTalk` 的产物
 * @param {object} talk `npc.wild.talk`（`interval`/`chance`/`duration`/`self`）
 * @param {number} dtSec 真实 deltaTime（秒）
 * @param {() => number} rand 注入的随机源（`[0,1)`）
 * @param {() => boolean} [canStart] 起新泡的闸门（缺省 = 一直可以）；MB9 口径 = 只在驻停时起新
 * @returns {object | null} 就地更新的 `st`
 */
export function stepTalk(st, talk, dtSec, rand = Math.random, canStart) {
  if (!st || !talk) return st
  const dt = Number(dtSec)
  if (!Number.isFinite(dt) || dt <= 0) return st

  if (st.timer > 0) {                               // 正在显 ⇒ 只倒计时，到点把图与文一起清空
    st.timer -= dt
    if (st.timer <= 0) { st.timer = 0; st.text = null; st.image = null }
    return st
  }
  if (canStart && !canStart()) return st            // 非驻停 ⇒ 不起新泡（已在显的那条上面已跨相位走完）
  st.next -= dt
  if (st.next > 0) return st
  st.next = pick(talk.interval, rand)               // 到点 ⇒ 先重排下一轮
  if (rand() >= (Number(talk.chance) || 0)) return st
  const pool = (talk.self || []).filter(valid)      // ★图与文同一池（删 MB9 的"只筛文本"）
  if (!pool.length) return st
  const e = pool[Math.floor(rand() * pool.length) % pool.length]
  const img = typeof e.image === 'string' ? e.image.trim() : ''
  if (img) st.image = img                           // 上游口径：有 image 就走 ShowImage，**不退回文本**
  else st.text = e.text
  st.timer = Number(talk.duration) || 1.8
  return st
}
