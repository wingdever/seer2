// EffectAbilityHandler.cs:66-106 (Capture) —— 第七段·批三: 把长尾里唯一一支「概率在算子里」的捕捉搬进内核。
//
// 血线与分档的纯数学早已在 battle/damage.ts 里搬好 (captureValue, 逐点 f() 收窄, 对齐 :79-93);
// 本文件只做「装配 + 上游那条 || 短路 + 成功后的四处突变」，**不重算**。三处必须照搬的怪处:
//   · :95 `(baseId==10) || (value >= lhsUnit.RNG())` —— 短路是**承重的**: baseId==10 时 `Unit.RNG()`
//     根本不取, 于是 `lhsUnit.random` 不被改写。上游是托管的 `||`, 移植体也必须是**惰性** `||`,
//     不能用 battle/damage.ts 里那个把 rngValue 当实参**预先求值**的 isCaptureSuccess —— 那样 baseId==10
//     也会掷一次骰, 把签进 SigUnit 的 `random=` 改掉, 而 oracle 侧那支压根没掷 ⇒ 假红。
//     isCaptureSuccess 只留给单测锁「比较」那一半的纯形状; 生产路径这里手写惰性短路。
//   · :72 `float.TryParse` 是**字面量**解析 (不认表达式), 所以 prob 给 "abc" ⇒ return false; 给 "25|35"
//     这种多段串同样 parse 失败 ⇒ false。damage.ts 的 parseProb (tryParseFloat) 就是这条, 别换成表达式求值。
//   · :79 lostPercent 在 `value<100` 判层**之外**先算, captureValue 已把这条次序搬对;
//     :82 的 debuff 是 **buff(-2)** (异常状态印记), 读的是 rhsUnit.pet.buffController。
//
// headless: state==null 的守卫 (:68) 与 prob 解析失败 (:72) 两支**不掷骰** ⇒ oracle 可比;
// baseId==10 短路支 (:95 左侧) 也不掷骰 ⇒ oracle 可比 (成功后的四处突变全在 SigState/SigResult 面里)。
// 掷点支 (baseId≠10) 走 `Unit.RNG()`→UnityEngine.Random.Range (native ECall) ⇒ oracle 一取就抛,
// 生成阶段不发向量 (powerup 同族口径), 该支的数值/短路形状由本仓 `node --test` 注入 Rng 缝锁死。

import type { Effect } from './effect.ts'
import { EffectTiming } from './effect-database.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { BattlePetView } from '../battle/views.ts'
import { BattleResultState } from '../battle/result.ts'
import { captureValue } from '../battle/damage.ts'
import { dictGet } from '../collections.ts'
import { tryParseFloat } from '../strutil.ts'

/** EffectAbilityHandler.cs:66-106 —— 捕捉一次: 掷点判定 + 成功后终结战斗。 */
export function capture(effect: Effect, state: BattleState | null): boolean {
  // :68 —— 常驻壳 (state==null) 直接不算。
  if (state === null) return false
  const st = state

  // :71-73 —— 字面 float.TryParse **先于**解引用 invokeUnit: 上游 prob 解析失败时整条 return false,
  // 连 `(Unit)effect.invokeUnit` 都不碰。所以这一层守卫必须排在取单位**之前**, 否则 (解析失败 + invokeUnit
  // 为空) 的形状会由「干净 return false」变成「NRE」—— 移植体不能自己造出上游没有的抛出点。
  const prob = dictGet(effect.abilityOptionDict, 'prob', '0')!
  if (tryParseFloat(prob) === null) return false

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = st.getUnitById(invokeUnit.id) as Unit
  const rhsUnit = st.getRhsUnitById((lhsUnit as Unit).id) as Unit
  const targetPet = (rhsUnit as Unit).pet as BattlePetView

  // damage.ts 已把 :79-93 的血线×分档 (含 buff(-2)÷3) 逐点 f() 收窄搬好; 到这里 prob 必解析得过。
  const r = captureValue(prob, targetPet.hp, targetPet.maxHp, targetPet.buffController.getBuff(-2) !== null)

  // :95 —— 惰性 ||: baseId==10 时**不掷** lhsUnit.roll() (见文件头那条承重短路)。
  const baseId = targetPet.baseId ?? 0
  const isSuccess = baseId === 10 || (r.value >= (lhsUnit as Unit).roll())

  // :96 —— 成功与否写回发起方当前技能的 options (不扣血、不进签名, 但上游就是这么记账的)。
  ;(lhsUnit as Unit).skill!.options.set('capture_result', isSuccess ? 'true' : 'false')

  // :98-104 —— 成功即终结: 相位跳到 OnBattleEnd, 结果落 CaptureSuccess, 双方 isDone, 行动游标推到队尾。
  if (isSuccess) {
    st.phase = EffectTiming.OnBattleEnd
    st.result.state = BattleResultState.CaptureSuccess
    st.myUnit.isDone = true
    st.opUnit.isDone = true
    st.actionCursor = st.actionOrder.length
  }
  return true
}
