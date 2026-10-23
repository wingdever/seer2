// EffectAbilityHandler.cs:2031-2073 (Poker) —— 批五算子长尾。
// 扑克牌小游戏：用**印记**当牌（buff id 3200~3204 = 花色，value = 点数，group=="poker" 且 turn<0 才是手里的牌）。
// 走 buffController（不是 cardSystem，那个在围栏外），所以本支**可移植、可无头**。
//
// 必须照搬的上游形状：
//   · cards 在**进 switch 之前**取一次（group==poker && turn<0）；refresh 的补牌张数 count 用的是这个**旧**快照。
//   · GetCard：color=3200+Random.Range(0,4)、point=Random.Range(1,14) —— Unity 的 Range(int,int) 是**闭区间**
//     （rng.ts 的 nextInt 同口径），抽到已在手（同 id 同 value 同 turn<0）就**重抽**（while 循环）。
//   · AddBuff 传的是 (buff, lhsUnit, invokeUnit, state)。
//   · refresh：先 RemoveRangeBuff 摘掉所有手里的牌，再按**旧** count 张 GetCard；`&=` 不短路 ⇒ 每次都真的补。
//   · type 未认（default）⇒ 直接 return false；get ⇒ 返回单次 GetCard。
//   · 整算子 return true 之外，get/refresh 的返回值才是 isSuccess（default 是 false）。
//
// headless：GetCard 的两次 Random.Range 走 OPS_RNG 注入缝（未注入显式抛 ⇒ 不可比, 留 R1 + 手测）；
// 不可比的只有"抽到什么牌"，摘牌/张数/分发形状仍可比。

import type { Effect } from './effect.ts'
import type { BattleState, Unit } from '../battle/state.ts'
import type { Buff } from '../buff/buff.ts'
import type { Rng } from '../rng.ts'
import { Buff as BuffClass } from '../buff/buff.ts'
import { dictGet, isEmpty } from '../collections.ts'

// native UnityEngine.Random 的注入点（GetCard 的 Random.Range）。
let OPS_RNG: Rng | null = null
export const setOpsPokerRng = (r: Rng | null): void => { OPS_RNG = r }
const rng = (min: number, max: number): number => {
  if (OPS_RNG === null) throw new Error('NOT_PORTED: Poker GetCard 要 native Random.Range ⇒ 不可比, 用 setOpsPokerRng 注入')
  return OPS_RNG.nextInt(min, max)
}

// group=="poker" 且 turn<0 才是"手里的牌"（info.options 是 Map，用 dictGet 读）。
const isHandCard = (x: Buff): boolean => dictGet(x.info.options, 'group') === 'poker' && x.turn < 0

/** EffectAbilityHandler.cs:2031-2073 —— 抽牌 / 换牌（扑克小游戏，印记实现）。 */
export function poker(effect: Effect, state: BattleState | null): boolean {
  const st = state as BattleState
  const who = dictGet(effect.abilityOptionDict, 'who', 'me')!
  const type = dictGet(effect.abilityOptionDict, 'type', 'get')!

  const invokeUnit = effect.invokeUnit as Unit
  const lhsUnit = ((who === 'me') ? st.getUnitById(invokeUnit.id) : st.getRhsUnitById(invokeUnit.id)) as Unit
  const rhsUnit = st.getRhsUnitById(lhsUnit.id) as Unit
  const buffController = lhsUnit.pet!.buffController

  // :2041 —— 进 switch 前取一次手里的牌；refresh 的张数用这个旧快照。
  const cards = buffController.getRangeBuff(isHandCard)
  const count = cards.length

  const getCard = (): boolean => {
    if (cards.length >= 52) return false
    let color = 3200 + rng(0, 4)
    let point = rng(1, 14)
    // 抽到已在手（同 id 同 value 同 turn<0）就重抽。
    while (!isEmpty(buffController.getRangeBuff((x) => x.id === color && x.value === point && x.turn < 0))) {
      color = 3200 + rng(0, 4)
      point = rng(1, 14)
    }
    const buff = new BuffClass(color, -1, point)
    return buffController.addBuff(buff, lhsUnit, invokeUnit, st)
  }

  let isSuccess = true
  switch (type) {
    default:
      return false
    case 'get':
      return getCard()
    case 'refresh':
      // 先摘掉所有手里的牌（& 初始 true ⇒ 结果就是 RemoveRangeBuff 的返回值）。
      isSuccess = buffController.removeRangeBuff(isHandCard, lhsUnit, st)
      for (let i = 0; i < count; i++) {
        const got = getCard()
        isSuccess = isSuccess && got
      }
      return isSuccess
  }
}
