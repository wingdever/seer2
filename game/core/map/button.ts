// `NpcButtonHandler.cs`（115 行）的**基石类型与两张词表**——地图线的"条件 → 动作"盒子。
// 本件只落四样（施工批 **MB2** / **`MDB2-a`**）：
//   1) **两个枚举** `ButtonEventType` / `NpcAction`（照录上游 `NpcButtonHandler.cs:86-116`，MP7：死条目也建）
//   2) **两张词表** `BUTTON_EVENT_TYPE`（5 条）/ `NPC_ACTION`（18 条）（`NpcActionDatabase`，`:44-71`）
//   3) **`ButtonSpec`** —— 一条 `<button>` / `<func>` / `<reply>`（`docs/map/map-npc.md §3.1`）
//   4) **`uiEventOf(b)`** —— ★`auto` **不是** UI 事件 ⇒ 返回 `null`（**MNI1**）
//
// ⚠️ 本件**不解析** `<button>` 的 XML 片段串 —— 那要 `fast-xml-parser`，而 L0 是**零第三方依赖**。
//    片段串 → `ButtonSpec` 的**构造**归 L1（`game/logic/map/entity.js`，MB5）；本件只声明形状。
//
// 真值：`docs/map/map-npc.md §2.1/§2.2/§3.1`（形状）· `§2.6`（18 动作）· `§5`（MNI1–MNI8）
//       `docs/map/map-code-map.md §2.2`（本件导出）· `§5.2`（接口）
// 纪律：**MNI1**（词表 ≠ 事件）· **MNI2**（`typeId` 原串 + `source` 必填）· **MNI4**（`shoot` 不进词表，`type == None`）

/** 上游 `ButtonEventType`（`NpcButtonHandler.cs:86-93`）。`None` = 未登记（含 `shoot`）。 */
export type ButtonEventType = 'None' | 'Auto' | 'OnPointerClick' | 'OnPointerEnter' | 'OnPointerExit' | 'OnPointerOver'

/**
 * 上游 `NpcAction`（`NpcButtonHandler.cs:95-116`）—— **18 + `None`，照录**（MP7 前提 = 解析面完整）。
 * ⚠️ 建了**不等于**实现：执行侧（`action.ts` / `action-runner.js`）对 A 组出局的动作出 `unimplemented`。
 */
export type NpcAction =
  | 'None'
  | 'SetNpcParam' | 'OpenHintbox' | 'OpenPanel' | 'OpenDialog' | 'Teleport' | 'SetItem'
  | 'GetPet' | 'RemovePet' | 'SetPet' | 'EvolvePet' | 'SetMission' | 'SetActivity'
  | 'Battle' | 'Player' | 'SetMail' | 'Fish' | 'MiniGame' | 'Callback'

/**
 * 这条按钮**从哪个容器来**（**MNI2**：`type` 的语义由容器决定，不由它的值决定）——
 * `eventHandler` = UI 事件 / `auto` / `shoot`；`callbackHandler` = **标签**；
 * 其余三个是 M4/M6 的宿主（`winHandler` / `loseHandler` 的形状在 M6）。
 */
export type ButtonSource =
  | 'eventHandler' | 'callbackHandler' | 'functionHandler' | 'replyHandler' | 'winHandler' | 'loseHandler'

/** 一条按钮（`<button>` / `<func>` / `<reply>`）—— 形状正本 = `docs/map/map-npc.md §3.1`。 */
export interface ButtonSpec {
  /** `@type` 的**原串**（⚠️ 原串才是真值，派生 `type` 会把它降级——`shoot` 就是靠原串认领的，**MNI2/MNI4**）。 */
  typeId: string
  /** 派生值：查 `BUTTON_EVENT_TYPE`，未登记 ⇒ `None`（含 `shoot` / `hover` 之外的未知值）。 */
  type: ButtonEventType
  /** 按钮文案（**中文** ⇒ MP4 归 DOM）。 */
  description?: string
  /** `<action>` 的原串。 */
  actionType?: string
  /** 派生值：查 `NPC_ACTION`，未登记 ⇒ `None`。 */
  action: NpcAction
  /** `<condition>` 串（**多元素 = AND**；串内 `|` = OR）—— 求值归 M3。 */
  condition: string[]
  /** `<param>`（动作的参数；形状见 `docs/map/map-npc.md §2.6`）。 */
  param: string[]
  /** ★**必填**（MNI2）：只看 `type` 的值**不足以**判断语义。 */
  source: ButtonSource
}

/** `NpcActionDatabase.buttonEventTypeDict`（`NpcButtonHandler.cs:44-50`）—— **5 条**。 */
export const BUTTON_EVENT_TYPE: Readonly<Record<string, ButtonEventType>> = {
  auto: 'Auto',
  click: 'OnPointerClick',
  enter: 'OnPointerEnter',
  exit: 'OnPointerExit',
  hover: 'OnPointerOver',
}

/** `NpcActionDatabase.npcActionDict`（`NpcButtonHandler.cs:52-71`）—— **18 条**（插入顺序照录）。 */
export const NPC_ACTION: Readonly<Record<string, NpcAction>> = {
  setNpcParam: 'SetNpcParam',
  openHintbox: 'OpenHintbox',
  openPanel: 'OpenPanel',
  openDialog: 'OpenDialog',
  teleport: 'Teleport',
  setItem: 'SetItem',
  getPet: 'GetPet',
  removePet: 'RemovePet',
  setPet: 'SetPet',
  evolvePet: 'EvolvePet',
  setMission: 'SetMission',
  setActivity: 'SetActivity',
  battle: 'Battle',
  player: 'Player',
  mail: 'SetMail',
  fish: 'Fish',
  miniGame: 'MiniGame',
  callback: 'Callback',
}

/** `NpcActionDatabase.petActionList`（`NpcButtonHandler.cs:73-75`）—— 三个"宠"动作（D6 接缝的分类依据）。 */
export const PET_ACTIONS: readonly NpcAction[] = ['RemovePet', 'SetPet', 'EvolvePet']

/**
 * ★**词表 ≠ 事件**（**MNI1**）—— 照抄上游 `GetButtonEvent`（`NpcHandler.cs:35-44`）的**四个 case**（不是五个）：
 * `OnPointerClick` / `OnPointerEnter` / `OnPointerExit` / `OnPointerOver` ⇒ 原样返回；
 * **`Auto` 落进 `_ => null`**（它是"进图批处理"，`Auto` 的执行时机见 `docs/map/map-npc.md §2.5`）；
 * `None`（未登记，含 `shoot`）同样 ⇒ `null`。
 */
export function uiEventOf(b: ButtonSpec | null | undefined): ButtonEventType | null {
  switch (b?.type) {
    case 'OnPointerClick':
    case 'OnPointerEnter':
    case 'OnPointerExit':
    case 'OnPointerOver':
      return b.type
    default:
      return null
  }
}
