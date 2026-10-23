// EffectDatabase.cs 的移植: 四张 原始串 ↔ 枚举 的词表, 加 EffectTiming.IsAttackPhase。
//
// 两件事必须照搬、不能"顺手统一":
//   1) **反向查表返回的是插入序第一个匹配键** (`First(x => x.Value == v).Key`, EffectDatabase.cs:97/105/113/121)。
//      今天四张表里每个枚举值都只有一个键, 所以看不出差别; 但只要重启以后往表里加一个别名键
//      (例如给 OnTurnEnd 加个 "on_end"), 正向和反向就会各自选中不同的字符串 —— 用 Map 而不是数组
//      就会把这个顺序语义丢掉, 所以这里用 [ [raw, value], … ] 的**有序数组**表达同一件事。
//   2) **未知键走 Get 的默认值 None, 未知值反向走 "none"** —— 都不抛。这是上游的静默兜底,
//      重启表里确实有拼错的 timing (见 game/data/unity/manifest.json 的 silentFallbackQuota),
//      所以移植体也得静默, 否则"表里那一条"在两边行为不同。
//
// 枚举值取自 EffectDatabase.cs:142-202 的字面量 (不是声明顺序): EffectTiming 有 -999/999/-1…-11 这些
// 故意跳出去的值, 相克与排序逻辑直接拿这些**整数**比较 (IsAttackPhase 就是 `>`/`<`), 所以值错一个都不行。

import { conv } from '../vocab.ts'

export const EffectTiming = {
  All: -999,
  None: 0, Resident: 1, OnBattleStart: 2,
  OnTurnStart: 3, OnTurnReady: 4, OnDecidePriority: 5, OnBeforeAttack: 6, OnAttackStart: 7,
  OnDamageParamCalculate: 8, OnBeforeDamageCalculate: 9, OnDamageCalculate: 10, OnAfterDamageCalculate: 11, OnFinalDamageCalculate: 12,
  OnAttackReady: 13, OnAttack: 14, OnAfterAttack: 15, OnAttackEnd: 16, OnTurnEnd: 17, OnAfterTurnEnd: 18, OnBattleEnd: 999,
  OnPassivePetChange: -1, OnSelectTarget: -2, OnAddBuff: -3, OnRemoveBuff: -4,
  OnBeforePetChange: -5, OnAfterPetChange: -6, OnRoundStart: -7, OnRoundEnd: -8,
  OnBeforeEffect: -9, OnEffect: -10, OnAfterEffect: -11,
} as const
export type EffectTiming = (typeof EffectTiming)[keyof typeof EffectTiming]

export const EffectTarget = {
  None: 0, CurrentState: 1, CurrentItem: 2, CurrentSkill: 3, CurrentBuff: 4, CurrentPet: 5, CurrentPetBag: 6, CurrentToken: 7,
} as const
export type EffectTarget = (typeof EffectTarget)[keyof typeof EffectTarget]

export const EffectCondition = {
  None: 0, CurrentUnit: 1, CurrentPet: 2, CurrentToken: 3, CurrentStatus: 4, CurrentSkill: 5, CurrentBuff: 6, LastSkill: 7, Poker: 8,
} as const
export type EffectCondition = (typeof EffectCondition)[keyof typeof EffectCondition]

export const EffectAbility = {
  None: 0, Win: 1, Escape: 2, Capture: 3, PetChange: 4, Heal: 5, Rage: 6, Powerup: 7, AddStatus: 8,
  BlockBuff: 9, AddBuff: 10, RemoveBuff: 11, CopyBuff: 12, SetBuff: 13, SetDamage: 14, SetSkill: 15,
  SetPet: 16, SetWeather: 17, SetPlayer: 18, Poker: 19, SetPetBag: 20, Card: 21,
} as const
export type EffectAbility = (typeof EffectAbility)[keyof typeof EffectAbility]

// 表的顺序 = EffectDatabase.cs:8-90 的书写顺序, 一个键都不许调。
const TIMING: [string, EffectTiming][] = [
  ['all', EffectTiming.All], ['none', EffectTiming.None], ['resident', EffectTiming.Resident],
  ['on_battle_start', EffectTiming.OnBattleStart], ['on_turn_start', EffectTiming.OnTurnStart],
  ['on_turn_ready', EffectTiming.OnTurnReady], ['on_decide_pri', EffectTiming.OnDecidePriority],
  ['on_before_attack', EffectTiming.OnBeforeAttack], ['on_attack_start', EffectTiming.OnAttackStart],
  ['on_dmg_param_cal', EffectTiming.OnDamageParamCalculate], ['on_before_dmg_cal', EffectTiming.OnBeforeDamageCalculate],
  ['on_dmg_cal', EffectTiming.OnDamageCalculate], ['on_after_dmg_cal', EffectTiming.OnAfterDamageCalculate],
  ['on_final_dmg_cal', EffectTiming.OnFinalDamageCalculate], ['on_attack_ready', EffectTiming.OnAttackReady],
  ['on_attack', EffectTiming.OnAttack], ['on_after_attack', EffectTiming.OnAfterAttack],
  ['on_attack_end', EffectTiming.OnAttackEnd], ['on_turn_end', EffectTiming.OnTurnEnd],
  ['on_after_turn_end', EffectTiming.OnAfterTurnEnd], ['on_battle_end', EffectTiming.OnBattleEnd],
  ['on_passive_pet_change', EffectTiming.OnPassivePetChange], ['on_select_target', EffectTiming.OnSelectTarget],
  ['on_add_buff', EffectTiming.OnAddBuff], ['on_remove_buff', EffectTiming.OnRemoveBuff],
  ['on_before_pet_change', EffectTiming.OnBeforePetChange], ['on_after_pet_change', EffectTiming.OnAfterPetChange],
  ['on_round_start', EffectTiming.OnRoundStart], ['on_round_end', EffectTiming.OnRoundEnd],
  ['on_before_effect', EffectTiming.OnBeforeEffect], ['on_effect', EffectTiming.OnEffect],
  ['on_after_effect', EffectTiming.OnAfterEffect],
]

// EffectTarget 的声明顺序与词表顺序**不一致** (enum 里 None,CurrentState,CurrentItem,CurrentSkill,CurrentBuff,CurrentPet,CurrentPetBag,CurrentToken;
// 词表里 pet 在 pet_bag 之前) —— 但枚举的**数值**只由声明顺序决定, 词表顺序只影响反查命中谁。
const TARGET: [string, EffectTarget][] = [
  ['none', EffectTarget.None], ['state', EffectTarget.CurrentState], ['pet', EffectTarget.CurrentPet],
  ['pet_bag', EffectTarget.CurrentPetBag], ['token', EffectTarget.CurrentToken], ['skill', EffectTarget.CurrentSkill],
  ['item', EffectTarget.CurrentItem], ['buff', EffectTarget.CurrentBuff],
]

const CONDITION: [string, EffectCondition][] = [
  ['none', EffectCondition.None], ['unit', EffectCondition.CurrentUnit], ['pet', EffectCondition.CurrentPet],
  ['token', EffectCondition.CurrentToken], ['status', EffectCondition.CurrentStatus], ['buff', EffectCondition.CurrentBuff],
  ['skill', EffectCondition.CurrentSkill], ['last_skill', EffectCondition.LastSkill], ['poker', EffectCondition.Poker],
]

const ABILITY: [string, EffectAbility][] = [
  ['none', EffectAbility.None], ['win', EffectAbility.Win], ['escape', EffectAbility.Escape],
  ['capture', EffectAbility.Capture], ['pet_change', EffectAbility.PetChange], ['heal', EffectAbility.Heal],
  ['rage', EffectAbility.Rage], ['powerup', EffectAbility.Powerup], ['add_status', EffectAbility.AddStatus],
  ['block_buff', EffectAbility.BlockBuff], ['add_buff', EffectAbility.AddBuff], ['remove_buff', EffectAbility.RemoveBuff],
  ['copy_buff', EffectAbility.CopyBuff], ['set_buff', EffectAbility.SetBuff], ['set_damage', EffectAbility.SetDamage],
  ['set_skill', EffectAbility.SetSkill], ['set_pet', EffectAbility.SetPet], ['set_weather', EffectAbility.SetWeather],
  ['set_player', EffectAbility.SetPlayer], ['poker', EffectAbility.Poker], ['set_pet_bag', EffectAbility.SetPetBag],
  ['card', EffectAbility.Card],
]

// EffectDatabase.cs:92-122 —— 四个方向写成一对工厂, 免得四处各抄一遍兜底 (工厂本体在 core/vocab.ts,
// BuffDatabase.cs 的 type/copy 两张表结构一字不差, 共用它)。
const TIMING_C = conv(TIMING, EffectTiming.None)
const TARGET_C = conv(TARGET, EffectTarget.None)
const COND_C = conv(CONDITION, EffectCondition.None)
const ABILITY_C = conv(ABILITY, EffectAbility.None)

export const toEffectTiming = TIMING_C.from
export const timingToRaw = TIMING_C.to
export const toEffectTarget = TARGET_C.from
export const targetToRaw = TARGET_C.to
export const toEffectCondition = COND_C.from
export const conditionToRaw = COND_C.to
export const toEffectAbility = ABILITY_C.from
export const abilityToRaw = ABILITY_C.to

// EffectDatabase.cs:134-139 —— 注意是**数值比较**, 不是"名字属于攻击阶段"这种查表:
// (6 < t < 16) && !(8 <= t <= 12)。OnPassivePetChange 那批负值因此天然不是攻击阶段。
export const isAttackPhase = (timing: EffectTiming): boolean => {
  const atk = timing > EffectTiming.OnBeforeAttack && timing < EffectTiming.OnAttackEnd
  const dmg = timing >= EffectTiming.OnDamageParamCalculate && timing <= EffectTiming.OnFinalDamageCalculate
  return atk && !dmg
}
