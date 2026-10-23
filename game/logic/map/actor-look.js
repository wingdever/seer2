// L1 · 小赛尔外观计划（纯）：物品 ID / 骑乘态 → 11 槽分层计划。
// 血统 = AS3：EquipSlot.as（槽位）、EquipSlotDepth.as（层序）、ActorEquipAssembler.as（默认装合并）、
//        Actor.addDogz（坐骑三视觉量）。**只算计划**：取包（.bin / 本地缓存）与绘制全在 L4 `mapScene.js`。
// 分层（M-5）：本件无 DOM / 无 fetch / 无 app 依赖；idle 数据由 L4 注入（equip-index 的 items/ride）。
// 正本 = `docs/map/map-actor-look.md §2/§6`；落地计划 = `docs/map/map-impl.md §3.10.2`。

// ── 11 槽（EquipSlot.as:6-26）───────────────────────────────────────────────
export const SLOT = {
  HEAD: 1,
  HAND_R: 2,
  DOGZ_RIGHT: 3,
  BODY: 4,
  BELT: 5,
  FOOT_R: 6,
  WING: 7,
  EYE: 8,
  FOOT_L: 9,
  HAND_L: 10,
  DOGZ_LEFT: 11,
};

// 左槽不是独立物品：镜像层只借右槽的包（`_1`），物品 ID 与主件相同（ALI3/ALC4）。
export const MIRROR_TO = { 10: 2, 9: 6, 11: 3 };

export const PART_OF_SLOT = {
  1: 'HEAD', 2: 'HAND_R', 3: 'DOGZ_RIGHT', 4: 'BODY', 5: 'BELT', 6: 'FOOT_R', 7: 'WING', 8: 'EYE',
  9: 'FOOT_L', 10: 'HAND_L', 11: 'DOGZ_LEFT',
};
const SLOT_OF_PART = Object.fromEntries(Object.entries(PART_OF_SLOT).map(([slot, part]) => [part, Number(slot)]));

// 坐骑态藏起的槽（Actor.addDogz）：双手 + 双脚。
export const MOUNT_HIDDEN_SLOTS = [SLOT.HAND_R, SLOT.FOOT_R, SLOT.FOOT_L, SLOT.HAND_L];
export const MOUNT_OFFSET_Y = -50;
export const MOUNT_SPEED_FACTOR = 25 / 20;

// 浮动坐骑（Actor.as:215 `_floatList`）：骑上后基础 -50 上下 ±5 浮动（运动全在 L4）。
export const FLOAT_MOUNT_IDS = [
  100324, 100377, 100393, 100394, 100419, 100439, 100464,
  100512, 100582, 100568, 100569, 100595, 100690,
];

// 朝下 / 朝上深度表（EquipSlotDepth.as:6-8；自底向上）。第一版只消费 down。
export const DOWN_ORDER = [7, 2, 6, 9, 4, 5, 8, 1, 10, 3, 11];
export const UP_ORDER = [3, 11, 8, 2, 6, 9, 4, 5, 10, 1, 7];

// ── 12 色默认装（ActorEquipAssembler.as:49-60；正本 = M8 §2.4）──────────────
// 头/眼两件 12 色共用（物品 100001 / 100003）；手/身/脚随颜色换 suit。
// ⚠️ 颜色 10/11 的 suit 是 39/40，**不按“颜色+1”硬算**（ALC6）。
export const DEFAULT_COLORS = [
  { name: '蓝', hand: 100004, body: 100005, foot: 100006, suit: 1 },
  { name: '绿', hand: 100007, body: 100008, foot: 100009, suit: 2 },
  { name: '紫', hand: 100010, body: 100011, foot: 100012, suit: 3 },
  { name: '黄', hand: 100013, body: 100014, foot: 100015, suit: 4 },
  { name: '紫罗兰', hand: 100016, body: 100017, foot: 100018, suit: 5 },
  { name: '橙', hand: 100019, body: 100020, foot: 100021, suit: 6 },
  { name: '红', hand: 100022, body: 100023, foot: 100024, suit: 7 },
  { name: '粉', hand: 100025, body: 100026, foot: 100027, suit: 8 },
  { name: '白', hand: 100028, body: 100029, foot: 100030, suit: 9 },
  { name: '黑', hand: 100031, body: 100032, foot: 100033, suit: 10 },
  { name: '深蓝', hand: 100143, body: 100144, foot: 100145, suit: 39 },
  { name: '咖啡', hand: 100146, body: 100147, foot: 100148, suit: 40 },
];

// 36 件颜色默认装（手/身/脚 × 12 色）= **独立换色功能的身份表**，不是装扮件（ALQ11 · 人类 2026-10-21 拍板）。
// 由 DEFAULT_COLORS 展平 = 单一真值（玩家面目录据此把这 36 件剔出部件表；正本 `docs/map/map-actor-look.md §2.4`）。
export const COLOR_ITEM_IDS = new Set(DEFAULT_COLORS.flatMap((c) => [c.hand, c.body, c.foot]));

export const DEFAULT_HEAD_REF = 100001;
export const DEFAULT_EYE_REF = 100003;

// 上游 `suit = 0` 的件 = **默认/空件**（默认头顶 100001 / 透明替身 100002 / 默认眼睛 100003，另加 129 件 NONO 装在槽 9）：
// 它们表示「这一槽没穿东西」，包名走 `resourceIdOf(0, slot)` 落回仓库裸装，不是装扮 ⇒ **玩家面目录不列**
// （ALQ13 · 人类 2026-10-21：「默认头顶不就是没有头顶吗？感觉没有必要显示在部件列表里」；正本 `docs/map/map-actor-look.md §8`）。
// ⚠️ 只筛目录显示：调试入口 `APP.actorLook.equip` 照旧接受这些 ID，存档里已有的也不动。
export function isEmptySuitItem(item) {
  return Math.trunc(Number(item?.suit) || 0) === 0;
}

const COLOR_KEY = { BLUE: 0, RED: 6 };
const NAKED_PACK_KEY = { 0: 'BLUE', 6: 'RED' };

// 颜色源：数字 0..11 / 'BLUE' / 'RED' / 数字字符串；非法 ⇒ -1（调用方登记）。
export function colorIndexOf(color) {
  if (typeof color === 'number' && Number.isInteger(color) && color >= 0 && color < DEFAULT_COLORS.length) return color;
  const s = String(color ?? '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(COLOR_KEY, s)) return COLOR_KEY[s];
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 0 && n < DEFAULT_COLORS.length) return n;
  }
  return -1;
}

// 资源标识 = "1" + pad3(suit) + pad2(slot)；左槽先映射右槽号（M8-P1）。
// ⚠️ 结果 **6 位**（1+3+2），例：suit 203 / slot 1 ⇒ `120301`；suit 364 / slot 3 ⇒ `136403`。
export function resourceIdOf(suitId, slot) {
  const suit = Math.max(0, Math.trunc(Number(suitId) || 0));
  const s = MIRROR_TO[slot] ?? slot;
  return '1' + String(suit).padStart(3, '0') + String(s).padStart(2, '0');
}

// 自定义装备包后缀：右槽 2/6/3 主件 `_0`、镜像 `_1`；其它槽无后缀。
export function packSuffixOf({ slot, isAccessory = false } = {}) {
  const raw = Number(slot);
  const base = MIRROR_TO[raw] ?? raw;
  if (!(base === SLOT.HAND_R || base === SLOT.FOOT_R || base === SLOT.DOGZ_RIGHT)) return '';
  return isAccessory ? '_1' : '_0';
}

// 一件 equip-index 记录 → 它的部件包坐标 `{pack, suffix}`（查 `actor-manifest.packs[pack].files[suffix]`）。
// 单一真值：包名与后缀公式只此一份，L4 不许重拼（ALQ10 的玩家面过滤据此判「官服有没有这个包」）。
export function packRefOf(item) {
  const slot = Number(item?.slot);
  return {
    pack: resourceIdOf(item?.suit, slot),
    suffix: packSuffixOf({ slot, isAccessory: Object.prototype.hasOwnProperty.call(MIRROR_TO, slot) }),
  };
}

// 裸装包名（仓库 `game/data/actor/*.bin`；只有蓝/红两套，ALC6）。
function nakedPackOf(part, colorIdx) {
  const key = NAKED_PACK_KEY[colorIdx] ?? 'BLUE';
  switch (part) {
    case 'HEAD': return 'UI_DEFAULT_HEAD';
    case 'EYE': return 'UI_DEFAULT_EYE';
    case 'BODY': return `UI_${key}_BODY`;
    case 'HAND_R': return `UI_${key}_RGIHT_HAND`;
    case 'HAND_L': return `UI_${key}_LEFT_HAND`;
    case 'FOOT_R': return `UI_${key}_RGIHT_FOOT`;
    case 'FOOT_L': return `UI_${key}_LEFT_FOOT`;
    default: return null;
  }
}

// 默认 5 件（头/眼/手/身/脚）。蓝/红走仓库裸装包；其余 10 色手/身/脚走 equip-index 的资源标识。
export function defaultRefsOf(color) {
  const idx = colorIndexOf(color);
  const c = DEFAULT_COLORS[idx < 0 ? 0 : idx];
  const naked = idx === 0 || idx === 6;
  const colorSource = naked ? 'naked' : 'equip';
  return [
    { refId: DEFAULT_HEAD_REF, slot: SLOT.HEAD, suit: 0, source: 'naked', isDefault: true },
    { refId: DEFAULT_EYE_REF, slot: SLOT.EYE, suit: 0, source: 'naked', isDefault: true },
    { refId: c.hand, slot: SLOT.HAND_R, suit: c.suit, source: colorSource, isDefault: true },
    { refId: c.body, slot: SLOT.BODY, suit: c.suit, source: colorSource, isDefault: true },
    { refId: c.foot, slot: SLOT.FOOT_R, suit: c.suit, source: colorSource, isDefault: true },
  ];
}

function indexEntry(itemIndex, refId) {
  if (!itemIndex) return null;
  return itemIndex[refId] ?? itemIndex[String(refId)] ?? null;
}

// 按槽位合并默认装：自定义优先；坏 ID / 9/10/11 槽（NONO 服装）跳过并登记。
// 返回 `{refs, warnings}`；refs 顺序 = 默认表顺序（头/眼/手/身/脚），额外的腰带/翅膀追加在后。
export function mergeDefaultEquip(color, equipVec, itemIndex) {
  const idx = colorIndexOf(color);
  const warnings = [];
  const customBySlot = new Map();
  const list = Array.isArray(equipVec) ? equipVec : [];

  if (list.length && !itemIndex) warnings.push('item-index-missing');

  for (const raw of list) {
    const refId = Number(raw);
    if (!Number.isInteger(refId) || refId <= 0) { warnings.push(`bad-item:${raw}`); continue; }
    const item = indexEntry(itemIndex, refId);
    if (!item) { if (itemIndex) warnings.push(`unknown-item:${refId}`); continue; }
    const slot = Number(item.slot);
    if (!(slot >= 1 && slot <= 8)) {
      warnings.push(`bad-slot:${refId}:${Number.isFinite(slot) ? slot : '?'}`);
      continue;
    }
    if (customBySlot.has(slot)) warnings.push(`duplicate-slot:${slot}:${refId}`);
    customBySlot.set(slot, {
      refId,
      slot,
      suit: Number(item.suit) || 0,
      source: 'equip',
    });
  }

  const refs = defaultRefsOf(idx < 0 ? 0 : idx);
  for (const [slot, ref] of customBySlot) {
    const at = refs.findIndex((r) => r.slot === slot);
    if (at >= 0) refs[at] = ref;
    else refs.push(ref);
  }
  return { refs, warnings };
}

// 骑乘映射（ALC2）：先 pet 的 resourceId，再 petRideChipId；不二次反查。
export function mountEquipIdOf(ridingPetInfo, rideTable) {
  if (!ridingPetInfo || !rideTable) return 0;
  const byPet = rideTable.byPetResourceId || {};
  const byChip = rideTable.byChipBackId || {};
  const rid = Number(ridingPetInfo.resourceId);
  if (Number.isFinite(rid) && byPet[String(rid)] != null) return Number(byPet[String(rid)]) || 0;
  const chip = Number(ridingPetInfo.petRideChipId);
  if (Number.isFinite(chip) && byChip[String(chip)] != null) return Number(byChip[String(chip)]) || 0;
  return 0;
}

// 11 槽深度表：返回**槽号**（按自底向上）。
export function slotOrder(direction = 'down') {
  return String(direction).toLowerCase() === 'up' ? UP_ORDER.slice() : DOWN_ORDER.slice();
}

// 某个部件的“同色默认件”兜底描述（M8-I3）：5 个默认槽有，腰带/翅膀/坐骑没有。
// 非蓝/红颜色的默认手/身/脚本身也是 equip 包；其 fallback 再退蓝/红裸装（M8 §6.3）。
function nakedFallbackOf(part, colorIdx) {
  const naked = nakedPackOf(part, colorIdx);
  return naked ? { source: 'naked', pack: naked, suffix: '' } : null;
}

function defaultFallbackOf(part, colorIdx) {
  const nakedDesc = nakedFallbackOf(part, colorIdx);
  if (!nakedDesc) return null;
  if (colorIdx === 0 || colorIdx === 6) return nakedDesc;
  if (part === 'HEAD' || part === 'EYE') return nakedDesc;
  const slot = SLOT_OF_PART[part];
  return {
    source: 'equip',
    pack: resourceIdOf(DEFAULT_COLORS[colorIdx].suit, slot),
    suffix: packSuffixOf({ slot, isAccessory: slot === SLOT.HAND_L || slot === SLOT.FOOT_L }),
    fallback: nakedDesc,
  };
}

function nakedLayer(part, ref, colorIdx) {
  const slot = SLOT_OF_PART[part];
  return {
    part,
    slot,
    refId: ref.refId,
    resourceId: resourceIdOf(ref.suit, slot),
    pack: nakedPackOf(part, colorIdx),
    suffix: '',
    source: 'naked',
    mirror: false,
    fallback: null,
    freezeStand: false,
  };
}

function equipLayer(part, slot, ref, colorIdx, isMirror) {
  const resourceId = resourceIdOf(ref.suit, slot);
  // 默认装备本身就是“同色默认”，不存在再退自己 ⇒ 直接退蓝/红裸装；自定义件才退同色默认（M8-I3）。
  const fallback = ref.isDefault ? nakedFallbackOf(part, colorIdx) : defaultFallbackOf(part, colorIdx);
  return {
    part,
    slot,
    refId: ref.refId,
    resourceId,
    pack: resourceId,
    suffix: packSuffixOf({ slot, isAccessory: isMirror }),
    source: 'equip',
    mirror: isMirror,
    fallback,
    // 装备层的 stand 区间可能是“展示动作”（ALC13）；站立只取首帧，跑动照常整段循环。
    freezeStand: true,
  };
}

// 一件 ref → 1..2 层（手/脚是主件 + 镜像；其余单层）。
function layersOfRef(ref, colorIdx) {
  if (ref.source === 'naked') {
    switch (ref.slot) {
      case SLOT.HEAD: return [nakedLayer('HEAD', ref, colorIdx)];
      case SLOT.EYE: return [nakedLayer('EYE', ref, colorIdx)];
      case SLOT.BODY: return [nakedLayer('BODY', ref, colorIdx)];
      case SLOT.HAND_R: return [nakedLayer('HAND_R', ref, colorIdx), nakedLayer('HAND_L', ref, colorIdx)];
      case SLOT.FOOT_R: return [nakedLayer('FOOT_R', ref, colorIdx), nakedLayer('FOOT_L', ref, colorIdx)];
      default: return [];
    }
  }
  switch (ref.slot) {
    case SLOT.HEAD: return [equipLayer('HEAD', SLOT.HEAD, ref, colorIdx, false)];
    case SLOT.EYE: return [equipLayer('EYE', SLOT.EYE, ref, colorIdx, false)];
    case SLOT.BODY: return [equipLayer('BODY', SLOT.BODY, ref, colorIdx, false)];
    case SLOT.BELT: return [equipLayer('BELT', SLOT.BELT, ref, colorIdx, false)];
    case SLOT.WING: return [equipLayer('WING', SLOT.WING, ref, colorIdx, false)];
    case SLOT.HAND_R: return [
      equipLayer('HAND_R', SLOT.HAND_R, ref, colorIdx, false),
      equipLayer('HAND_L', SLOT.HAND_L, ref, colorIdx, true),
    ];
    case SLOT.FOOT_R: return [
      equipLayer('FOOT_R', SLOT.FOOT_R, ref, colorIdx, false),
      equipLayer('FOOT_L', SLOT.FOOT_L, ref, colorIdx, true),
    ];
    default: return [];
  }
}

// 主入口：合并默认装 → 展开镜像 → 算包 → 坐骑态 → 签名/告警。L4 只读结果。
export function buildLookPlan(opts = {}) {
  const warnings = [];
  const direction = String(opts.direction || 'down').toLowerCase() === 'up' ? 'up' : 'down';
  let colorIdx = colorIndexOf(opts.color ?? 0);
  if (colorIdx < 0) { warnings.push(`bad-color:${opts.color}`); colorIdx = 0; }

  const itemIndex = opts.itemIndex || null;
  const rideTable = opts.rideTable || null;
  const equipVec = Array.isArray(opts.equipVec) ? opts.equipVec.slice() : [];

  // 坐骑：显式 mountEquipId > ridingPetInfo 映射 > equipVec 里误带的 slot 3（兼容旧档）。
  let mountRef = Number(opts.mountEquipId) || 0;
  if (!mountRef && opts.ridingPetInfo) {
    const fromPet = mountEquipIdOf(opts.ridingPetInfo, rideTable);
    if (fromPet) mountRef = fromPet;
  }
  const rest = [];
  for (const raw of equipVec) {
    const refId = Number(raw);
    const item = indexEntry(itemIndex, refId);
    if (item && Number(item.slot) === SLOT.DOGZ_RIGHT) {
      warnings.push(`slot3-in-equipVec:${refId}`);
      if (!mountRef) mountRef = refId;
      continue;
    }
    rest.push(raw);
  }

  let mount = null;
  if (mountRef) {
    const item = indexEntry(itemIndex, mountRef);
    if (!item) {
      warnings.push(itemIndex ? `unknown-mount:${mountRef}` : `mount-index-missing:${mountRef}`);
      mountRef = 0;
    } else if (Number(item.slot) !== SLOT.DOGZ_RIGHT) {
      warnings.push(`mount-not-dogz:${mountRef}:${item.slot}`);
      mountRef = 0;
    } else {
      const resourceId = resourceIdOf(item.suit, SLOT.DOGZ_RIGHT);
      mount = {
        refId: mountRef, resourceId, readyOffsetY: MOUNT_OFFSET_Y,
        float: FLOAT_MOUNT_IDS.indexOf(mountRef) >= 0,
      };
    }
  }

  const merged = mergeDefaultEquip(colorIdx, rest, itemIndex);
  warnings.push(...merged.warnings);

  const layers = [];
  for (const ref of merged.refs) layers.push(...layersOfRef(ref, colorIdx));
  if (mount) {
    // 坐骑的 stand 区间是真正的 idle（悬浮/扇翅），不冻结（ALC13 只针对 11 槽装备层）。
    layers.push({
      part: 'DOGZ_RIGHT', slot: SLOT.DOGZ_RIGHT, refId: mount.refId, resourceId: mount.resourceId,
      pack: mount.resourceId, suffix: '_0', source: 'equip', mirror: false, fallback: null, freezeStand: false,
    });
    layers.push({
      part: 'DOGZ_LEFT', slot: SLOT.DOGZ_LEFT, refId: mount.refId, resourceId: mount.resourceId,
      pack: mount.resourceId, suffix: '_1', source: 'equip', mirror: true, fallback: null, freezeStand: false,
    });
  }

  const order = slotOrder(direction);
  layers.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));

  const refIds = merged.refs.map((r) => r.refId).join(',');
  return {
    signature: [direction, colorIdx, refIds, mountRef].join('|'),
    direction,
    color: colorIdx,
    layers,
    hiddenSlots: mount ? MOUNT_HIDDEN_SLOTS.slice() : [],
    mount,
    offsetY: mount ? MOUNT_OFFSET_Y : 0,
    speedFactor: mount ? MOUNT_SPEED_FACTOR : 1,
    warnings: [...new Set(warnings)],
  };
}
