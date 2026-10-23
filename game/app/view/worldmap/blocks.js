// 世界地图面板块表（C3·WorldMap · L4 静态数据）。
// 唯一真值 = docs/view/panel/worldmap/restart-world-map-panel.md §3（上游手摆预制实测），
// 逐行照搬、减 Mod 行（WMD1，design §1 边界）；改表先改报告/设计，不许运行时现编目的地（WM2）。
// 字段：page=页(0 阿卡迪亚星/1 新世界) group=组 mapId=传送目标(0=未开放) name=显示名(WM2 单通道) label=目标图 xml 真名。

export const WORLD_MAP_PAGES = ['阿卡迪亚星', '新世界']

export const WORLD_MAP_GROUPS = {
  north: '北域', south: '南域', edge: '边栏',
  ship: '飞船舱', planet: '星球', station: '太空站',
}

// 每页组的渲染顺序
export const WORLD_MAP_PAGE_GROUPS = [['north', 'south', 'edge'], ['ship', 'planet', 'station']]

export const WORLD_MAP_BLOCKS = [
  // —— 页 0 · 阿卡迪亚星 ——
  { page: 0, group: 'north', mapId: 420, name: '飞翼氏族', label: '空港' },
  { page: 0, group: 'north', mapId: 470, name: '地月氏族', label: '地月氏族主城' },
  { page: 0, group: 'north', mapId: 990, name: '普兰特山麓', label: '普兰特山脚' },
  { page: 0, group: 'north', mapId: 160, name: '水脉氏族', label: '水脉氏族主城' },
  { page: 0, group: 'north', mapId: 230, name: '火幻氏族', label: '火幻氏族主城' },
  { page: 0, group: 'north', mapId: 401, name: '冰沁氏族', label: '冰之谷' },
  { page: 0, group: 'north', mapId: 90, name: '草目氏族', label: '草目氏族主城' },
  { page: 0, group: 'north', mapId: 790, name: '能源之树', label: '微光湖畔' },
  { page: 0, group: 'north', mapId: 540, name: '禁食山', label: '禁食山脚' },
  { page: 0, group: 'north', mapId: 320, name: '沙爪氏族', label: '沙爪氏族主城' },
  { page: 0, group: 'south', mapId: 0, name: '神醚氏族', label: '未开放' },
  { page: 0, group: 'south', mapId: 0, name: '战武氏族', label: '未开放' },
  { page: 0, group: 'south', mapId: 0, name: '萨伦帝国', label: '未开放' },
  { page: 0, group: 'south', mapId: 0, name: '雷鸣氏族', label: '未开放' },
  { page: 0, group: 'south', mapId: 900, name: '风刃氏族', label: '风刃氏族主城' },
  { page: 0, group: 'south', mapId: 1210, name: '虫蚀氏族', label: '虫蚀氏族主城' },
  { page: 0, group: 'south', mapId: 1290, name: '超源氏族', label: '超源氏族主城' },
  { page: 0, group: 'edge', mapId: -70, name: '夜间传送舱', label: '传送室' },   // WMD2：上游匿名块
  { page: 0, group: 'edge', mapId: 81, name: '英格瓦要塞', label: '英格瓦要塞' }, // WMD2
  // —— 页 1 · 新世界 ——
  { page: 1, group: 'ship', mapId: 10001, name: '传送仓', label: '传送仓' },
  { page: 1, group: 'ship', mapId: 10002, name: '资料室', label: '资料室' },
  { page: 1, group: 'ship', mapId: 10003, name: '瞭望露台', label: '瞭望露台' },
  { page: 1, group: 'ship', mapId: 10004, name: '瞭望仓', label: '瞭望仓' },
  { page: 1, group: 'ship', mapId: 10005, name: '发明室', label: '发明室' },
  { page: 1, group: 'ship', mapId: 10006, name: '动力室', label: '动力室' },
  { page: 1, group: 'ship', mapId: 10007, name: '船长室', label: '船长室' },
  { page: 1, group: 'ship', mapId: 10008, name: '机械室', label: '机械室' },
  { page: 1, group: 'ship', mapId: 10009, name: '教官室', label: '教官室' },
  { page: 1, group: 'ship', mapId: 10010, name: '精灵中心', label: '精灵中心' },
  { page: 1, group: 'planet', mapId: 10015, name: '火山星', label: '火山星山脚下' },
  { page: 1, group: 'planet', mapId: 10020, name: '海洋星', label: '海洋星浅水区' },
  { page: 1, group: 'planet', mapId: 10025, name: '云霄星', label: '云霄星地面层' },
  { page: 1, group: 'planet', mapId: 10030, name: '赫尔卡星', label: '赫尔卡星建筑区' },
  { page: 1, group: 'planet', mapId: 10036, name: '克洛斯星', label: '克洛斯星草原' },
  { page: 1, group: 'planet', mapId: 10040, name: '塞西利亚星', label: '塞西利亚星冰原' },
  { page: 1, group: 'station', mapId: 10081, name: '精灵太空站', label: '精灵太空站' },
]
