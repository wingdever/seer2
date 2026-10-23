// MVC/Model/Basic/Effect/EffectHandler.cs 的逐行移植 —— 「一次时机里排队等判定的效果集合」。
//
// 这个类薄得很 (75 行), 但它定义了 S3 后面每一批算子的**执行序**, 所以队列语义比判定本身更要紧:
//   · queue 是 List<KeyValuePair<object, Effect>>, **插入序**就是配对序。Concat 直接把 rhs.queue
//     整段 AddRange 进来 (共享同一批 Effect 引用), 所以 BattleState.GetEffectHandler(null) 那条
//     「master 的 handler Concat client 的 handler」的结果是 [master…, client…] —— 顺序不能反。
//   · Condition 会**原地重排** queue (OrderBy(priority)), 然后 Apply 用**同一份**重排后的序去对齐
//     checkList。这两步之间没有任何同步, 谁把 OrderBy 抄成"返回新表不改原表", 谁就拿到错位的效果。
//   · whosTurn==0 时 Condition 先把状态快照一份、分别按 -1 与 1 各跑一遍再逐位 OR (EffectHandler.cs:45-52)
//     —— 这是「双方任一触发即触发」的实现, 而它跑的是**同一份 queue**, 排序因此做了两遍 (第二遍已有序)。
//   · Apply 的 `checkList.Count < queue.Count` 在 checkList 为 null 时**先 NRE** —— C# 把 null 检查写在
//     解引用之后 (EffectHandler.cs:62-66), 那个 `checkList == null ||` 默认值是够不着的死分支。照炸不修。
//
// headless 纪律: Effect.Condition/Apply (Effect.cs:224-344 + EffectConditionHandler.cs) 要吃
// Unit/BattlePet/Skill 全套, 属本批之后的算子面。这里只留一个显式接缝, 未注入时**抛**而不是放行 ——
// 静默 true 会让"接缝没接"伪装成"这条效果判定通过", 对拍里表现为只有 TS 侧多跑了一段结算。

import type { Effect } from '../effect/effect.ts'
import { atIndex } from '../collections.ts'

/** BattleState 在本文件里的最小视图 —— 只用到 whosTurn 与"把自己拷一份"。 */
export interface EffectStateView {
  whosTurn: number
  snapshot(): EffectStateView
}

/** 效果判定/执行的接缝 (Effect.cs:224 与 :295)。invokeUnit 上游是 object, 实为 Unit。 */
export interface EffectJudgement {
  condition(effect: Effect, invokeUnit: unknown, state: EffectStateView | null, checkPhase: boolean, checkTurn: boolean): boolean
  apply(effect: Effect, invokeUnit: unknown, state: EffectStateView | null): boolean
}

const NOT_PORTED: EffectJudgement = {
  condition: () => { throw new Error('Effect.Condition 未移植 (Effect.cs:224 + EffectConditionHandler.cs) —— 见 docs/engine/port-map.md 的 S3 顺序') },
  apply: () => { throw new Error('Effect.Apply 未移植 (Effect.cs:295) —— 算子按频次逐个搬') },
}

let JUDGE: EffectJudgement = NOT_PORTED
export const setEffectJudgement = (j: Partial<EffectJudgement>): void => { JUDGE = { ...JUDGE, ...j } }

export class EffectHandler {
  private queue: [unknown, Effect][] = []

  clear(): void { this.queue = [] }

  // EffectHandler.cs:20-23 —— 就地接上 rhs 的队列并返回 this (调用点靠这个链式串 handler)。
  concat(rhs: EffectHandler): EffectHandler {
    this.queue.push(...rhs.queue)
    return this
  }

  // EffectHandler.cs:25-30 —— effects 为 null 直接 return (技能/印记没配效果时是常态, 不是异常)。
  addEffects(invokeUnit: unknown, effects: Effect[] | null): void {
    if (effects === null) return
    for (const x of effects) this.queue.push([invokeUnit, x])
  }

  // EffectHandler.cs:32-34 —— 滤的是 pair.Value, 但 predicate 拿到的是**当前 queue 的活引用**;
  // 这里同样按 queue 顺序逐个问 (上游 RemoveAll 就是这个顺序, 且 filter 只收 Effect)。
  removeEffects(filter: (effect: Effect) => boolean): void {
    this.queue = this.queue.filter(([, effect]) => !filter(effect))
  }

  // EffectHandler.cs:36-42 —— 两个 GetEffects 重载: 带下标那个的 i 是**queue 里的位置**
  // (Select 之后 Where 的下标仍是原序下标), BattleState.GetEffectsByTiming 靠它与 checkList 对齐。
  getEffects(filter: (effect: Effect, index: number) => boolean): Effect[] {
    return this.queue.map(([, effect]) => effect).filter((effect, i) => filter(effect, i))
  }

  // EffectHandler.cs:44-59 —— 排序 → 逐条判定。state 为 null (常驻) 或 whosTurn 非 0 时走单遍。
  condition(state: EffectStateView | null, checkPhase = true): boolean[] {
    if (state !== null && state.whosTurn === 0) {
      const tempState = state.snapshot()
      tempState.whosTurn = -1
      const clientCheckList = this.condition(tempState, checkPhase)
      tempState.whosTurn = 1
      const masterCheckList = this.condition(tempState, checkPhase)
      // 上游 `masterCheckList.Select((x, i) => x || clientCheckList[i])` —— 下标越界即抛, 用 atIndex 建模。
      return masterCheckList.map((x, i) => x || atIndex(clientCheckList, i, 'EffectHandler.Condition'))
    }

    const checkList: boolean[] = []
    // LINQ OrderBy 稳定, JS 的 Array.sort 自 ES2019 起同样稳定 ⇒ 并列 priority 保持插入序。
    this.queue.sort((a, b) => a[1].priority - b[1].priority)
    for (let i = 0; i < this.queue.length; i++) {
      const [invokeUnit, effect] = this.queue[i]!
      checkList.push(JUDGE.condition(effect, invokeUnit, state, checkPhase, true))
    }
    return checkList
  }

  // EffectHandler.cs:61-70 —— 见文件头那条 null 解引用: checkList 缺省时先抛。
  apply(state: EffectStateView | null, checkList: boolean[] | null = null): void {
    if (checkList === null) throw new TypeError('NullReferenceException: EffectHandler.Apply 的 checkList.Count 在 null 判定之前被解引用 (EffectHandler.cs:62)')
    if (checkList.length < this.queue.length) return

    for (let i = 0; i < this.queue.length; i++) {
      if (checkList[i]) {
        const [invokeUnit, effect] = this.queue[i]!
        JUDGE.apply(effect, invokeUnit, state)
      }
    }
  }

  checkAndApply(state: EffectStateView | null, checkPhase = true): void {
    this.apply(state, this.condition(state, checkPhase))
  }
}
