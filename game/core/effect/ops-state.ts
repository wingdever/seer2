// EffectAbilityHandler.cs:38-53 (Win) / :54-65 (Escape) / :1969-1983 (SetWeather)
// —— 第八段·批四「A 档」三支: 零内容表、零存档。
// ⚠️ 但**不是**"零 native": Win/Escape 的**结果面**都过 `Unit.IsMyUnit()` ⇒ `PhotonNetwork.IsConnected`
//    ⇒ 无头 oracle 里 Photon 静态构造抛 ECall ⇒ 那半边**不可对拍**(单向闸门, 见 oracle-playbook §6)。
//    golden 只覆盖 `state==null ⇒ false` 与 Escape 在 `:60` 处的 `atkUnit==null` NRE; 结果面靠单测。
//    SetWeather 是真·全可比 (不碰任何 native)。
//
// 三支的 `state == null` 语义**各不相同**, 照搬, 不许统一 (E4 A3 那条):
//   · Win(:41) / Escape(:57) 判 null ⇒ return false;
//   · SetWeather(:1969) **不判** ⇒ state 为 null 时在 `state.masterUnit` 上 NRE (与 block_buff 同)。
//
// 三处必须照搬的怪处:
//   · Win 用 `lhsUnit.IsMyUnit()` (:48), 而 Escape 用 **`state.atkUnit.IsMyUnit()`** (:60) ——
//     `atkUnit` 在 `whosTurn == 0` 时是 null (state.ts:605) ⇒ Escape 那一支会 NRE。别顺手改成 myUnit。
//   · 两支都写四笔: `phase = OnBattleEnd` → `result.state` → **两个 unit 的 isDone** (上游是链式赋值
//     `a = b = true`) → `actionCursor = actionOrder.Count` (队尾, 不是 whosTurn)。
//   · SetWeather 的 `int.TryParse` (:1973) 是**字面**解析 (不认表达式 / 标识符 / 小数), 且**排在两处**
//     `IsBuffTypeBlocked` **之前** ⇒ 畸形串先干净 return false (连 state 都不碰)。两处免疫检查是 **||**。

import type { Effect } from './effect.ts'
import { EffectTiming } from './effect-database.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import { BuffType } from '../buff/buff-database.ts'
import { BattleResultState } from '../battle/result.ts'
import { dictGet } from '../collections.ts'
import { tryParseInt } from '../strutil.ts'

/** EffectAbilityHandler.cs:38-53 —— 立即终结战斗并按 `who` 选出的 unit 落胜负。 */
export function win(effect: Effect, state: BattleState | null): boolean {
  // :41 —— 常驻壳 (state==null) 直接不算。
  if (state === null) return false
  const st = state

  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = (who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)

  st.phase = EffectTiming.OnBattleEnd
  // :48 —— 判的是**选中 unit** 属不属于「我方」(离线接缝下即 IsMasterUnit, 见 state.ts:343)。
  st.result.state = (lhsUnit as Unit).isMyUnit() ? BattleResultState.Win : BattleResultState.Lose
  // :49 —— 上游是链式赋值 `state.myUnit.isDone = state.opUnit.isDone = true`: 两个 unit 都置位。
  st.myUnit.isDone = true
  st.opUnit.isDone = true
  // :50 —— 行动游标推到**队尾**。
  st.actionCursor = st.actionOrder.length
  return true
}

/** EffectAbilityHandler.cs:54-65 —— 逃跑。胜负判的 unit 与 Win **不同** (atkUnit, 不是 who)。 */
export function escape(_effect: Effect, state: BattleState | null): boolean {
  // :57 —— 常驻壳直接不算。
  if (state === null) return false
  const st = state

  st.phase = EffectTiming.OnBattleEnd
  // :60 —— `state.atkUnit` 在 `whosTurn == 0` 时是 null (state.ts:605) ⇒ 这里 NRE (上游形状, 照搬)。
  st.result.state = (st.atkUnit as Unit).isMyUnit() ? BattleResultState.MyEscape : BattleResultState.OpEscape
  st.myUnit.isDone = true
  st.opUnit.isDone = true
  st.actionCursor = st.actionOrder.length
  return true
}

/** EffectAbilityHandler.cs:1969-1983 —— 设置天气; 两侧任一被 weather 型印记屏蔽即拒。 */
export function setWeather(effect: Effect, state: BattleState | null): boolean {
  const weatherId = dictGet(effect.abilityOptionDict, 'weather', '0')!
  const weather = tryParseInt(weatherId)
  // :1973-1974 —— 字面 int.TryParse (不认标识符), 且**早于**解引用 state ⇒ 畸形串在 state==null 下同样干净 false。
  if (weather === null) return false

  // :1969 —— 本支**不判 state == null** (与 Win/Escape 相反): state 为 null 时在这里 NRE。
  const st = state as BattleState
  if (st.masterUnit.pet!.buffController.isBuffTypeBlocked(BuffType.Weather) ||
    st.clientUnit.pet!.buffController.isBuffTypeBlocked(BuffType.Weather)) return false

  // :1981 —— 只有两处检查都放行才落地。
  st.weather = weather
  return true
}
