// SPT Boss 面板静态表（L4 · C3·SPT · 真值 = restart-spt-panel.md §3.1–3.3 三张 18 行表，逐行手抄自 Unity prefab）。
// 口径：page = 页序（0 北半球 / 1 南半球 / 2 派诺星系）；parent/btn = Unity 局部坐标（y 上正）；size = 按钮盒 w×h。
// 坐标换算与画法规格见 docs/view/panel/spt/spt-impl.md §3（cx = 400 + 父x + 按钮x；cy = 250 − (页偏移 + 父y + 按钮y)）。
export const SPT_PAGES = [
  { name: '北半球', bg: 'SPTBoss/Sprites/520.png', offset: -60 },
  { name: '南半球', bg: 'SPTBoss/Sprites/524.png', offset: -60 },
  { name: '派诺星系', bg: 'SPTBoss/Sprites/线路.png', offset: -30 },
]
// 面板底图（盒内通底，非页 bg）。
export const SPT_BOX_BG = 'SPTBoss/Sprites/背景.png'

// 18 行：bossId = Resources/Pets/icon/{id}.png 的键；mapId 0 不存在于本表（全部可点，SPQ5=A 不灰显）。
export const SPT_BOSSES = [
  // ── 页 0 · 北半球 ──
  { page: 0, bossId: 17, name: '布鲁托', mapId: 142, label: '巨石洞穴', parent: [-120, 105], btn: [20, 60], size: [176, 144] },
  { page: 0, bossId: 31, name: '阿卡纳斯', mapId: 193, label: '悲伤残骸', parent: [-260, 30], btn: [30, 70], size: [242, 176] },
  { page: 0, bossId: 38, name: '霍克努尔', mapId: 270, label: '魅罗门', parent: [-260, -110], btn: [-20, 30], size: [128, 125] },
  { page: 0, bossId: 57, name: '麦麦迪', mapId: 152, label: '水仙溪口', parent: [-95, -130], btn: [0, 60], size: [160, 130] },
  { page: 0, bossId: 80, name: '巨锤莫古', mapId: 530, label: '黑岩旋梯', parent: [30, -90], btn: [0, 50], size: [129, 84] },
  { page: 0, bossId: 82, name: '沙皇鸟', mapId: 370, label: '海市蜃楼', parent: [145, -150], btn: [0, 50], size: [88, 120] },
  { page: 0, bossId: 127, name: '卡尼娅', mapId: 404, label: '冰晶矿场', parent: [265, -85], btn: [15, 40], size: [110, 133] },
  { page: 0, bossId: 157, name: '菲亚斯', mapId: 423, label: '遗忘之岛', parent: [245, 75], btn: [0, 25], size: [147, 125] },
  { page: 0, bossId: 215, name: '艾丽希斯', mapId: 790, label: '微光湖畔', parent: [85, 120], btn: [0, 40], size: [207, 222] },
  // ── 页 1 · 南半球 ──
  { page: 1, bossId: 248, name: '卡多斯', mapId: 910, label: '神风祭台', parent: [-260, 60], btn: [0, 60], size: [114, 154] },
  { page: 1, bossId: 401, name: '特米提', mapId: 1220, label: '虫穴地牢', parent: [-170, -110], btn: [-40, 30], size: [200, 150] },
  { page: 1, bossId: 895, name: '梵尔尼', mapId: 1290, label: '超源氏族主城', parent: [-60, 0], btn: [80, 50], size: [214, 180] },
  // ── 页 2 · 派诺星系 ──
  { page: 2, bossId: 10047, name: '蘑菇怪', mapId: 10038, label: '克洛斯星林间', parent: [-310, 20], btn: [0, 50], size: [128, 140] },
  { page: 2, bossId: 10034, name: '钢牙鲨', mapId: 10022, label: '海洋星海底', parent: [-260, -100], btn: [0, 50], size: [140, 120] },
  { page: 2, bossId: 10042, name: '里奥斯', mapId: 10017, label: '火山星深处', parent: [-175, -9], btn: [0, 70], size: [142, 165] },
  { page: 2, bossId: 10069, name: '提亚斯', mapId: 10027, label: '云霄星最高层', parent: [-90, 80], btn: [0, 70], size: [158, 207] },
  { page: 2, bossId: 10070, name: '雷伊', mapId: 10032, label: '赫尔卡星荒地', parent: [15, 25], btn: [5, 100], size: [134, 256] },
  { page: 2, bossId: 10050, name: '阿克希亚', mapId: 10040, label: '塞西利亚星冰原', parent: [115, 50], btn: [0, 100], size: [141, 184] },
]
