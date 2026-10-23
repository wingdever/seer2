// 地图场景 = 原 game/map.html 的脚本原样搬进 SPA (表现层与规则层都没动)。
// 图层分工照旧:
//   表现 = 原版地图 SWF 的固定图层 (far_mc/ground_mc/content_mc/front_mc/path_mc/size_mc)
//   规则 = MapAssetExtractor(path_mc 栅格: 10px/格, 填充=阻挡, 透明=可走)
//          + PathScene(ground_mc 点击行走) + AStar(8 邻域, 禁穿角)
//   栅格主路径 = MapRunner.as 内逐行照搬的原版 extractPath() (BitmapData.draw)
//   旁路校验 = 宿主侧直接解析 SWF 矢量记录 (game/swfshape.mjs), 回灌 setWalkGrid 只报差异
//   世界连通 = config XML 的 <teleport pos targetMapId>: 点它 → 寻路走过去 → 抵达后 loadWorld 换图,
//              角色落在目标图的 <initialPoint> (单向图用「返回上一图」栈兜底)
//   容器 = game/maprunner/mapRunner.swf (AS3, tools/build-maprunner.sh)
//   裸装小赛尔部件包 (game/data/actor/) 的性别色: BLUE=男 / RED=女
// 场景约定: mount(query) 建 #bar/#wrap 并接线, unmount() 摘 message 监听 + 清空舞台
//           (ruffle-player 脱离 DOM 即 destroy), 战果从 APP.lastResult 取 (原 sessionStorage)
import { APP } from '../state.js'
import { go } from '../router.js'
import { session, ensureLoaded, readRandom, writeRandom, petSkillsOf, applyPetSkills, save as saveSession } from '../session.js'
// ⚠️ **字段 vs 动作**（2026-10-18 踩过两次）：`game/app/session.js` 的 `session` 对象只装**字段**
//    （`gid`/`active`/`storage`/`state`/`random`…），动作是**并列的模块导出函数**。所以这里：
//    **点名 import 对象**（`session.*` 读字段）+ **点名 import 函数**（`ensureLoaded(...)` 直接调）。
//    ⚠️ 千万别用 `import * as session` 再去读 `session.active`/`session.gid` —— 命名空间的
//    `session.active` 是那个**同名导出函数**，读出来是函数不是对象（`rbattleScene` 就这么黑过屏）。
import * as CONTENT from '../content.js'
// 性格中文名（L1 codec 出口；档里 basic.personality 是索引 0..54，中文名在 codec 转）；加成说明走 CONTENT
import { personalityName } from '../../logic/save/codec.js'
import { openPanel, closePanel } from '../view/panels/host.js'
import * as RESTART_HUD from '../view/hud/restartHudView.js'
import * as PBAG from '../view/petbag/index.js'
// petbag 的**逻辑件（L1）在装配层注入**：`view/petbag/index.js` 是 L3，**不 import** `game/logic/**`
// （`docs/arch-code.md §3` 硬规则 #3；人类 2026-10-18 拍板「收敛成注入」⇒ 四个件从这里经 `opts.logic` 交进去）。
import { createPetBagSource } from '../../logic/petbag/source.js'
import { createGrid } from '../../logic/petbag/grid.js'
import * as PETBAG_ACTIONS from '../../logic/petbag/actions.js'
// 精灵技能面板的 L1（换位纯函数）同族注入；读写真档经 session 的 petSkillsOf/applyPetSkills（SF3/SF4）。
import * as PETBAG_SKILL from '../../logic/petbag/skill-ops.js'
import { BAG_SIZE as PETBAG_BAG_SIZE, PAGE_SIZE as PETBAG_PAGE_SIZE } from '../../logic/petbag/constants.js'
import * as RESTART_ITEMBAG from '../view/panels/restartItemBagView.js'
import * as SHOPVIEW from '../view/shop/index.js'
import * as SHOP_LOGIC from '../../logic/item/shop.js'
import * as WORLDMAP from '../view/worldmap/index.js'   // ★C3·WorldMap（大地图面板，2026-10-19）
import * as MINIMAP from '../view/minimap/index.js'     // ★C3·MiniMap（小地图面板一族 11 块，2026-10-19）
import * as ACTIVITY from '../view/activity/index.js'   // ★C4·Activity（活动面板，2026-10-19，A 组已移出）
import * as DEXVIEW from '../view/dex/index.js'         // ★C1·Dex 精灵图鉴（2026-10-19，VP5 反转正本 = docs/view/panel/dex/）
import * as SPT from '../view/spt/index.js'             // ★C3·SPTBoss（SPT 老大面板，2026-10-19，正本 = docs/view/panel/spt/）
import * as GODPET from '../view/godpet/index.js'       // ★C1·灵兽/精灵王（HUD「灵兽」钮 = 上游 OpenPanel(SoulPet) → SpriteKing，2026-10-19，正本 = docs/view/panel/godpet/）
import * as PINFO_VIEW from '../view/playerinfo/index.js'   // ★C4·PlayerInfo（HUD 底栏「信息」钮 = 上游 OpenPanel(PlayerInfo)，2026-10-20，正本 = docs/view/panel/playerinfo/）
import * as GUIDE from '../view/guide/index.js'         // ★C3·疑难指引（HUD「指引」钮 = 上游 OpenPanel(GuideLine) → Panels/GuideLine，2026-10-20，正本 = docs/view/panel/guide/）
import * as RST from '../../logic/restartSession.js'    // ★C1·灵兽：领取约瑟 = makeRestartPet/addPet（与 rbattleScene 收宠同一件）
// 图鉴的 L1 纯件（同 petbag 口径：L3 不 import game/logic/** ⇒ 由本装配层经 opts.logic 注入）
import { buildDexEntries, DEX_PAGE_SIZE } from '../../logic/dex/entries.js'
import { buildOwnedIds, isOwned } from '../../logic/dex/own.js'
import { elementPredicate, nameOrIdPredicate, sorterOf, combineAnd } from '../../logic/dex/predicates.js'
import { openHintbox } from '../view/panels/hintbox.js'
// ── 地图线 MB5（会话 + 传送接线）：L1 决议/实体装配 + L0 规则件（本批只接**光口传送 / 昼夜 / auto 进图触发**）──
// 依赖方向（`docs/map/map-code-map.md` M-5：`logic/**` 不 import `app/**`，反向由本 L4 层装配）：
//   entity.js（XML片段→ButtonSpec + buildEntities）· session.js（传送/昼夜/落点纯决议）·
//   condition-host.js（createMapEnv/mapViewOf）· action-runner.js（决议→副作用）· core/map/action.js（resolve）。
import * as MAP_ENTITY from '../../logic/map/entity.js'
import * as MAP_SESSION from '../../logic/map/session.js'
import * as MAP_HOST from '../../logic/map/condition-host.js'
import * as JS_VIEW from '../../logic/map/js-view.js'           // ★A2：JS 路（★分流反转后=默认通路，背景=Unity PNG）的纯数学 L1
import * as ACTOR_VIEW from '../../logic/map/actor-view.js'     // ★A2b：JS 回退图角色 sprite —— 原版小赛尔部件包 .bin 的**纯解析** L1（无 DOM/fetch）
import * as ACTOR_LOOK from '../../logic/map/actor-look.js'     // ★M8-a：外观计划 L1 —— 11 槽 / 默认装 / 坐骑态（纯，无 DOM/fetch）
import * as NPC_ART from '../../logic/map/npc-art.js'           // ★B3：NPC 真美术上屏 —— resId→取图 URL 三类映射 + size 换算 + 锚点（L1 纯，无 DOM/fetch）
import * as PET_VIEW from '../../logic/map/pet-view.js'         // ★MDB12：野怪帧包（`/swf/pet/normal/*`）的标签/动作/帧号/锚点纯换算（L1，相对路径 ⇒ import map 零增项）
import * as WANDER from '../../logic/map/wander.js'             // ★MB9：野怪漫游 —— 纯步进 + 注入随机/时钟（L1 无 DOM/fetch）
import * as TALK from '../../logic/map/talk.js'                 // ★MDB10：野怪 talk 气泡调度 —— 纯调度（图+文同池）、两条渲染路共用
import { resolve as resolveAction } from '../../core/map/action.js'
import { readMapValue } from '../../core/map/condition.js'   // ★B3 `[expr]` 写回求值（`DLI7` 同一张前缀表）
import * as MAP_RUN from '../../logic/map/action-runner.js'
import * as MAP_DIALOG from '../../logic/map/dialog-host.js'   // ★MB6：对话宿主（lex `<branch>` + `{expr:}` + 可见性/点击）
// ★MB7：地图战斗**触发**（L0 纯件）—— `buildSpec`（配方→决议）+ `canStartBattle`（开工三门）+ `makeBattleView`（`battle.` 键表读快照）
import { buildSpec, canStartBattle } from '../../core/map/battle-spec.js'
import { makeBattleView } from '../../core/map/keys-battle.js'

const COLORS = { BLUE: '小赛尔·蓝', RED: '小赛尔·红' }

const M = { player: null, info: null, grid: null, cam: { x: 0, y: 0 }, pos: null, mapUrl: '', map: null, spots: [], hist: [], hudTexts: [],
  // ── MB5：Unity 血统的规则侧（与 `M.map`=AS3 画面侧**并存**，`map-impl.md D2/D3`）──
  unity: null,      // content.loadMap(id) 的现场解析记录（落点/昼夜/NPC 实体都读它）
  npcs: [],         // entity.buildEntities(unity) 的实体表（先登记、后 auto，MNI5）
  npcById: {},      // String(id) → entity（喂 env 的 sceneData['mapNpcList'] 键袋）
  env: null,        // 当前图的 MapEnv（condition-host 拼一次）
  dialogNpc: null,  // ★MB6：当前**开着对话**的那只 NPC 实体（对话翻页/选项点击都认它；关对话即清）
  spawn: null,      // changeScene('map',{spawn}) 的一次性落点（消费即清，TPQ5）
  // ── A2：JS 渲染态（★分流反转 2026-10-19：**默认通路**，除 `SWF_ANNOTATED_IDS` 注明的图外都走这里；SWF 路代码本身逐字节不变）──
  jsMode: false,    // true ⇒ 本图无 Ruffle，角色/光口/走位由本层驱动（M.cam 恒 0）
  jsView: null,     // { rect:fitBg 矩形, flipY } —— bg 绘制矩形（Unity 坐标归一化的目标）
  walkTarget: null, // { x, y, hit } —— rAF 自由走的目标（hit=命中的光口；null=停）
  // ── ★M9 SWF 路角色提线（`docs/map/map-swf-puppet.md`）：puppet 位 = 走位/朝向/绘制全交 JS，Flash 退为背景 + 相机从者 ──
  puppet: false,    // true ⇒ 本图走 puppet 协议（SWF 图；`mapReady.puppet` 回报后置位）
  swfStage: null,   // { sw, sh } —— AS3 `stage.stageWidth/Height`（JS 本地相机钳位的舞台尺寸输入）
  wantWalk: false,  // puppet：野怪 `mapWantWalk` 请求走到点 ⇒ 到站调 `player.walkReached()`
  bgImg: null,      // JS 路的底图 Image（loaded 后用于绘制；随 leaveJsMode 清）
  bgRect: null,     // JS 路底图的 contain 绘制矩形（= jsView.rect，另存供调试）
  npcMarkers: [],   // ★MB6 增补（人类选 A）：仅 JS 路 —— `draw()` 每帧按 M.npcs + jsView.rect 投出的**可点占位标记** `{id,name,x,y}`（jsClick 命中即 onNpcClick；SWF 路恒空）
  npcHit: [],       // ★B3 / ★MDB12：**JS 路 + SWF 路都投** —— `draw()` 每帧投出的**真 sprite 命中矩形** `{id,name,x,y,w,h,ax,ay,…}`；
                    //   两条支路共用这一个数组：**帧包项**（带 `bitmap/pack/flip/label`，`ax/ay` = 包锚点）与 **PNG 项**（`img`，`ax/ay` 缺省 = `NPC_ANCHOR` 左下角）；
                    //   缺图/`none` 者退回 `npcMarkers` 占位橙点。旧注释"仅 JS 路 / SWF 路恒空"自 B3 §7.1 起就不成立（`:1314` 的 SWF 路点击一直在读它）
}
let byId = new Map()
const nameOf = id => (byId.get(id) || {}).name || ('图' + id)
const labelOf = id => (((byId.get(id) || {}).swfOk === false ? '⚠' : '') + nameOf(id)).replace(/[|;]/g, '')
// MapRunner 的出口记录 = "x|y|targetMapId|出口名", 用 ';' 分隔 (XML 里 pos 是 "x,y")。
// 出口名 = <teleport name> 自己 (原版 Teleport.as: this.name = @name, 悬浮说明与抵达日志都用它);
// 缺 name 的旧清单才退回目标图名 —— 308 条里 25 条与目标图名不同、1 条为空 (tools/build-map-index.mjs)。
const spotNameOf = (t) => String((t.name ?? '') || '').replace(/[|;]/g, '') || labelOf(t.target)
// ★MB5（D3）：光口**位置/出口名 = AS3**（喂 SWF 的舞台坐标），**目标图 = Unity `targetMapId`**（按 id 匹配）。
//   两套坐标系**不可嫁接**（TPQ1）⇒ 交给 L1 `MAP_SESSION.mergePortals` 逐条取列；畸形 pos 不产出该条 + 登记（TPC8）。
// ★A2（obs-3）：额外把 Unity 光口按**整舞台矩形**归一化传第 4 参，补"AS3 无、Unity 有"的光口（如 `990` 的 AS3 `teleports=[]`、Unity 有 3 条）。
const JS_FULL_RECT = { dx: 0, dy: 0, dw: 1200, dh: 660 }
function normalizeUnityTeleports(unityTeleports) {
  const out = []
  for (const t of unityTeleports || []) {
    const p = t && t.pos
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue      // 畸形 pos ⇒ 跳过（TPC8）
    const s = JS_VIEW.unityToStage(p.x, p.y, JS_FULL_RECT)
    out.push({ id: t.id, x: s.x, y: s.y, name: t.name, targetMapId: t.targetMapId })
  }
  return out
}
const spotsOf = m => MAP_SESSION
  .mergePortals((m && m.teleports) || [], (M.unity && M.unity.entities && M.unity.entities.teleports) || [],
    (reason, raw) => logLine('光口登记: ' + reason + (raw && raw.id != null ? ' id=' + raw.id : '')),
    normalizeUnityTeleports(M.unity && M.unity.entities && M.unity.entities.teleports))
  .map(p => [p.x, p.y, p.target, spotNameOf(p)].join('|')).join(';')
// 传送点"光口": 重启导出件 teleport.png = 原版 UI_hud.swf 符号 UI_Teleport 的位图 (80x62 白径向光)。
// 配准点用原版符号自己的轮廓包围盒 (game/swfshape.mjs 量得 x∈[-39.65,40.35] y∈[-40.65,21.35]) ——
// XML 的 pos 就是按这个配准点标的 (原版 Teleport.as 直接 this.x/this.y = pos), 故光口压在 pos 上偏下 1/3 处。
// ⚠️ 重启的 Map/Teleport.prefab 把 pivot 归一到左下角 (0,0) 再 anchoredPosition=pos ⇒ 它比这里偏右 39.65、偏下 21.35;
//    我们的地图素材 = 原版 SWF, 因此照原版配准点, 不照重启的归一化 pivot。
const PORTAL_SRC = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Map/teleport.png'
const PORTAL_W = 80, PORTAL_H = 62, PORTAL_OX = -39.65, PORTAL_OY = -40.65
// 重启 prefab 的 image.color = (1,1,1,0.502), 而 TeleportInfo.rgba 默认 "255,255,255,128" 且 308 条 XML 无一带 @color
// ⇒ 重启线恒为半透明。原版 AS3 不加色 (全不透明), 两条血统在此不同, 先跟重启; 人手测定夺。
const PORTAL_ALPHA = 0.5
// 悬浮判定 = 光口自己的矩形 (原版是 sprite 上的 ROLL_OVER; 重启是 IButton 的 onPointerEnter/Exit)
const portalHit = (s, x, y) => x >= s.x + PORTAL_OX && x <= s.x + PORTAL_OX + PORTAL_W && y >= s.y + PORTAL_OY && y <= s.y + PORTAL_OY + PORTAL_H
// ★MDB11（人类 2026-10-21）：野怪分布**单一来源 = Unity XML 的 `<npc><wild>`** ⇒ 我方合成的 `game/data/wild.json`
//   （`tools/build-wild-index.mjs`：原版清单一来自服务端 socket 1103、不可得 ⇒ hash 合成、**非真值**）**已断粮**：
//   不再 fetch、不再喂 AS3（`MapRunner.as:192-206 setWild("")` ⇒ 一只 `WildPet` 都不生成、不重编译）。
//   野怪的**画**与**点击开战**由此前 B3/MB7 那条路独扛：`#npc` 叠加 sprite + `onNpcClick → resolve→run → startMapBattle`（吃 `<battle>`）。

let ov, octx, hctx, tipEl, portalEl, pctx, promptEl, portalImg
// ★A2：JS 回退渲染的运行时件（动态建，仅 swfOk=false 图在用；随 unmount / enterSwfMode 拆净）
let bgc = null, bgctx = null          // 底图 canvas（z-index 0，压在所有叠加层之下）
let npcEl = null, npctx = null        // ★B3：NPC 真美术 canvas（z-index 1，DOM 序在 #portal 之后、#ov 之前 ⇒ sprite 压在角色/调试栅格之下）；仅 JS 路动态建、随 leaveJsMode 拆
let jsClickHandler = null             // #wrap 上的点击→走位/进图处理（换模式/卸载时摘掉）
let rafHandle = 0                      // rAF 句柄（空闲即取消，避免空转泄漏）
let dialogEl = null                    // ★MB6：自绘的最小对话浮层（NPC 未上屏 ⇒ 调试 `onNpcClick` 驱动；正式排版归 A3）
// ★A2b/M8-b：JS 回退图把"角色黄点"换成原版小赛尔 —— 外观计划（L1 `actor-look.js`）+ 11 槽部件包。
//   §4.9 的"进过的图不缓存"只针对**地图**，不针对部件包；先例 = portalImg 的 <img> 缓存。
//   ImageBitmap 与 canvas 无关 ⇒ 跨 unmount 存活（换图/重挂复用，不再重取）；`lookGen` = 竞态守卫（换图/卸载/换计划递增）。
let LOOK = null                        // { plan, sourcePlan, resolved:[{layer,asset}], shadow, body, ready, signature }
let LOOK_PARTS = new Map()             // assetKey(`source:pack:suffix`) → { key, pack, bitmap, source, packId, suffix, url }
let LOOK_LOADING = new Map()           // assetKey → Promise（并发去重；失败即摘，允许下次重试）
let LOOK_OVERRIDE = null               // 调试直通 {color,equipVec,mountEquipId}；正式入口 = session 外观字段 + equip/unequip/ride/unride/color
let lookGen = 0                        // 换图/卸载/换计划递增 ⇒ 作废在飞的装载
const LOOK_LOGGED = new Set()          // 缺包/坐骑降级日志去重（每个键只打一行）
const ACTOR_SCALE = 1                  // 第二个"靠人眼校"常量（接 flipY 先例）：默认 1 守 AS3 原生尺寸；大 bg 图若显大可改 M.bgRect.dw/1200 —— 人测定夺
const LOOK_SCALE = 1                   // ★M8-f：SWF 叠层的缩放常量（与 ACTOR_SCALE 分开 ⇒ 只校叠层、不动 JS 路）
const LOOK_DY = 0                      // ★M8-f：SWF 叠层的垂直微调（px；脚底不齐只调这里，不动 MapRunner）
// ★M8-b2：帧动画状态（仅 JS 路；24fps = game/maprunner/build-config.xml 的 default-frame-rate）。
//   ACTOR_ANIM 吃上游 Mobile.direction 位语义：right=bit1、up=bit2；停止时保留朝向（PathMobile.stand）。
const ANIM_FRAME_MS = 1000 / 24
const ACTOR_ANIM = { right: true, up: false, moving: false }
let animRaf = 0                        // 常驻动画 rAF（独立于 rafHandle/wanderRaf；leaveJsMode/unmount 取消）
let animLastTs = 0
let animElapsed = 0                    // 当前标签内的累计毫秒（切标签归零）
let animTick = 0
let animLabel = ''
// ★M8-b3/c：地面特效模式归会话（`session.groundMode`：'shadow' = 本机静止阴影 / 'halo' = VIP 光轮）。
//   光轮用 `UI_ActorShadow` 的 `vip` 标签（3–39）；自己的时钟不随角色 stand/run 切换归零，
//   否则每次起停/转向光轮都会跳回第一帧（与角色 idle 各自循环 = 上游 ActorShadow 的独立 FramePlayer）。
let groundElapsed = 0                  // 光轮自己的累计毫秒（只随 rAF 前进；startActorAnim 重置）
// ★M8-d：坐骑浮动（L1 `mount.float`，13 只 `_floatList`）—— 基础 -50 上叠 ±5px、3s 正弦；
//   动态换乘的浮动坐骑先 2s 升起（Actor.checkAddFloat 的 TweenMax Back.easeIn 近似），换图/读档 = 直接浮动。
//   相位用 performance.now()，与 24fps 动画 tick 无关；卸下即时归零（同 Actor.removeDogz）。
const MOUNT_FLOAT_AMP = 5
const MOUNT_FLOAT_PERIOD_MS = 3000
const MOUNT_RISE_MS = 2000
const MOUNT_BACK_S = 1.70158
let mountMotion = null                 // { key(refId:resourceId), startTs, fromY, riseMs }；坐骑变化时重建（懒建）
let pendingMountRise = null            // ride() 在 syncLook 前记下当前抬升量（仅动态换乘做升起）
// ★B3：NPC sprite 素材缓存（仿 `LOOK_PARTS` / portalImg：按 URL 键、跨图/跨卸载复用；**地图线"进过的图不缓存"只针对地图、不针对素材**）。
//   每项 = { state:'loading'|'ok'|'err', img }；`null` URL（none）根本不进缓存 ⇒ L4 直接画占位。npcGen = 竞态守卫（换图/卸载递增）。
let NPC_CACHE = new Map()
let npcGen = 0
// ★MDB12：野怪**帧包**按 `swfId` 缓存（`/swf/pet/normal/<n>.swf` → `parsePack` + `createImageBitmap`）；口径与 `NPC_CACHE` 同 =
//   **按素材键、跨图复用**（"地图不缓存"只针对地图）。值 = `{state:'loading'|'ok'|'err', pack, bitmap}`。
let PET_CACHE = new Map()
const PET_FPS = 12                 // 帧包动画帧率（**人眼校常量**，与 `NPC_ANCHOR`/`LOOK_SCALE`/`flipY` 同族 `AGENTS §4.10`）；
                                   // 上游 = 每舞台帧进一格（`WildPet.as:274-291`），我们**不复刻舞台帧率** ⇒ 自定 12Hz 起判
// ★MDB13-a：野怪**脚下阴影** = 上游 `WildPet.as:169-187` 的 canvas 等价（借 `UI_ActorShadow` 的 `local` 首帧压黑）。
//   `SHADOW_ALPHA` = 上游 `ColorTransform` 的 alpha 乘子 0.45（人眼校族同 `PET_FPS`）；缩放分母 40 在 L1 `SHADOW_BASE_W`。
const SHADOW_ALPHA = 0.45
// ★MDB13-b：`personal` 每次驻停播一次的**时长上限**（格数，按 `PET_FPS=12` ⇒ 48 格 ≈ 4s；人眼校族同 `PET_FPS`）。
//   实测段长跨 4–233 格 ⇒ 不设上限的话 `122`/`135`/`138` 那几只每次停站要钉住 8–19s 才回站立。
const PERSONAL_MAX = 48
// ★MDB13-c：野怪**脚下等级脚标**（人类拍板 ②「整串移到脚下、撤头顶名」）。三个数都是**人眼校族**（`AGENTS §4.10`）：
//   `LV_LBL_DY` = sprite 下边到文字基线；`LV_LBL_LW` = 白描边宽度（上游 `LabelRenderer` 是 1px 白边，canvas 侧 1px 压不住底图）；
//   `LV_LBL_COLOR` = 上游 `setLabelStyle(13395456)` = `#CC9900` 金字。
const LV_LBL_DY = 13
const LV_LBL_LW = 2
const LV_LBL_COLOR = '#CC9900'
// ★MDB13-d：惊讶特效（头顶「!」）帧率 = **我们自己的常数**（同 `PET_FPS` 一族、不复刻舞台帧率）；`UI_SurpriseMark` 实测 23 帧 ⇒ ≈0.77s 播完。
//   人类拍板 ① =「点了**先播完**再开战」⇒ 这个环同时是**开战的延迟闸**（末帧才 `onNpcClick`），所以**不寄生**在漫游环（`stepWanderLoop` 只在有漫游者时转）。
const PET_MARK_FPS = 30
let markRaf = 0
let markLastTs = 0
const LOOK_SHARED_STARTED = new Set()   // 已发起装载的共享裸装包（`UI_ActorShadow`/`UI_SurpriseMark`）⇒ 失败也**不每帧重试**（`LOOK_LOADING` 会结算后自删）
const NPC_FALLBACK_SCALE = 1           // 缺 `size` 时 = PNG natural × 此系数（第二条人眼校常量，接 ACTOR_SCALE/flipY 先例；默认 1 守原尺寸）
// ★MB9：野怪漫游循环句柄（★`MDB11` 起 = **JS 路 + SWF 路都转**；仿 stepJs 的 `rafHandle`/`jsLastTs` 口径，但独立句柄，避免与走位循环互抢）。
let wanderRaf = 0
let wanderLastTs = 0
// ★MDB10：talk **表情气泡**素材缓存 + 调度循环句柄（**两条路都转**，与只走 JS 路的 `wanderRaf` 不同）。
//   缓存仿 `NPC_CACHE`（按 URL 键、跨图复用；`npcGen` 同一套竞态守卫）。
let TALK_CACHE = new Map()
let talkRaf = 0
let talkLastTs = 0
const TALK_EMOJI_MAX = 120             // 表情图**边长上限**（= 上游 `imageMaxSize 120×120`，`map-move §2.7`；实测素材 30–60px ⇒ 基本不触发）
const TALK_EMOJI_SCALE = 1             // 表情整体倍率（**人眼校常量**，与 `NPC_FALLBACK_SCALE`/`LOOK_SCALE`/`NPC_ANCHOR` 同族，`AGENTS §4.10`；嫌小就调这里）
let showGrid = false
let P = new URLSearchParams()

function logLine(s) { console.log(s) }

// ---- HUD 数据源 (主界面面板本体在 maprunner/HudRunner.as 里, 这里只喂内容) ----
// 原版这些数值全部来自服务端 socket (CLI_MONEY_COUNT_1253 / ActorManager.actorInfo /
// PetInfoManager.getAllBagPetInfo)。单机复刻就存在浏览器里, 首次进图用一份默认存档。
// 物品背包: {id, count} —— id 就是原版 ItemConfig 的 ItemID, 名字/描述/图标全从 items.json 查
const STARTER_ITEMS = [
  { id: 200001, count: 5 }, { id: 200002, count: 3 }, { id: 200003, count: 1 },
  { id: 200011, count: 8 }, { id: 200012, count: 5 }, { id: 200013, count: 2 },
  { id: 200021, count: 6 }, { id: 200022, count: 3 }, { id: 200031, count: 4 },
  { id: 300001, count: 1 }, { id: 300003, count: 1 },
  { id: 400001, count: 12 }, { id: 400002, count: 7 }, { id: 500001, count: 1 },
  { id: 102001, count: 1 },
]
let SAVE = null
// ---- 存档：**XML 单一血统**（编排线 ORP3，人类 2026-10-18）----
// 活跃档只在会话里（`game/app/session.js`）：地图场景**不读也不写 localStorage**，只读 `A`、写 `A.save()`。
// A = activeStore 视图: { isRestart, state, save(), hpMax(pet), nameOf(pet), swfIdOf(pet), consumeItem, addItem }
//   渲染层只认 A.*（形状与改造前一致；值来自 `saves/save{id}.xml` 的双向投影，见编排线 impl §3.2 ①④）。
let A = null
const sessionGid = () => { const s = Number(P?.get?.('slot')); return Number.isInteger(s) && s >= 0 && s < 3 ? s : 0 }
// 重启原生常驻 HUD 层 + 模态背包面板 (U3/U4)
let HUD = null, BAG = null, ITEMBAG = null, SHOP = null, ACTIVITY_PANEL = null, DEX_PANEL = null, SPT_PANEL = null, GODPET_PANEL = null, PINFO = null, GUIDE_PANEL = null
/** 幂等：同一槽已载入就直接复用（战斗刚改过的是同一份内存态）。
 *  槽位来自路由（`#/map?slot=2`；无参 ⇒ 0）——批 C 的登录场景选定后同样走这条。 */
function initSession() {
  if (A && session.gid === sessionGid()) return Promise.resolve(A)
  return ensureLoaded({ gid: sessionGid() }).then((act) => {
    A = act
    SAVE.name = A.state.trainer.name || SAVE.name
    SAVE.level = A.state.trainer.level || SAVE.level
    SAVE.coins = A.state.trainer.coins
    SAVE.diamonds = A.state.trainer.diamonds
    return A
  })
}
function applyBattleResult() {
  const raw = APP.lastResult
  APP.lastResult = null
  if (!raw) return
  let R = null
  try { R = typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { logLine('战果解析失败: ' + e); return }
  const CN = { capture: '抓到', win: '打赢', lose: '战败', escape: '逃脱', surrender: '撤退' }
  const wname = A && A.isRestart ? (CONTENT.restartNameOf(R.wild && R.wild.petId) || (R.wild && R.wild.petId))
    : ((PETDB && PETDB.monsters[R.wild.petId] || {}).name || R.wild.petId)
  const w = R.wild ? ' 野怪 ' + wname + ' Lv' + R.wild.level : ''
  const c = R.captured ? ' → 新成员入' + (R.captured.where === 'box' ? '仓库' : '队伍') : ''
  logLine(`✦ 战果: ${CN[R.outcome] || R.outcome || '?'}${w}${c}`)
}
let PETDB = null
async function petDB() {
  if (!PETDB) PETDB = await (await fetch('/game/data/pets.json')).json()
  return PETDB
}
// 背包格记录 = "swfId|名字|等级|hp|hpMax" (HudRunner.fillCell 的解析格式) — 数据源 = 活跃宇宙出战队
async function bagRecords() {
  if (!A) return []
  return A.state.team.slice(0, 8).map(p => {
    const hpMax = Math.round(A.hpMax(p))
    return [A.swfIdOf(p), String(A.nameOf(p)).replace(/[|;]/g, ''), p.level, Math.max(0, p.hp), hpMax].join('|')
  })
}
async function pushHud() {
  const p = M.player
  if (!p) return
  // 播放器元素的 hudProfile/hudBag/hudTitle 是 SWF 里 ExternalInterface.addCallback 挂上去的
  // (maprunner/MapRunner.as:112)。loadMapRunner 的 25s 兜底超时会在它挂上之前就走到这里。
  if (typeof p.hudProfile !== 'function') { logLine('HUD 暂缓: 播放器回调未挂, 等 hudBind/mapReady'); return }
  try {
    if (!A) await initSession()
    p.hudProfile(SAVE.name, 'Lv' + SAVE.level, String(SAVE.coins), String(SAVE.diamonds))
    p.hudBag(await bagRecords())
    p.hudTitle(M.map ? String(M.map.name).replace(/[|;]/g, '') : '')
  } catch (e) { logLine('HUD 喂数据失败: ' + e) }
}

// ---- 重启原生常驻 HUD 层 (U3) + 模态背包面板 (U4) ----
// 两宇宙纪律: 全在 A.isRestart 分支里; as3 线不建 DOM HUD、走上面的 SWF pushHud/togglePetBag, 逐字节同旧。
function mountRestartHud() {
  if (HUD) { HUD.destroy(); HUD = null; delete window.__rbHud }
  openPanel('rb-hud', (root) => {
    HUD = RESTART_HUD.create(root, A, {
      onPetBag: openRestartPetBag,
      onItemBag: openRestartItemBag,
      onShop: openRestartShop,
      onDex: openRestartDex,                       // ★C1·Dex 图鉴面板（HUD 底栏「图鉴」钮，2026-10-19 = VP5 反转落地）
      onMap: () => openRestartWorldMap(),
      onMiniMap: () => openRestartMiniMap(),               // ★C3·MiniMap（HUD 右上角小地图钮，2026-10-19）
      onEvent: openRestartActivity,                 // ★C4·活动面板（HUD 底栏「活动」钮）
      onInfo: openRestartPlayerInfo,                // ★C4·PlayerInfo（HUD 底栏「信息」钮 = 上游 OpenPanel(PlayerInfo)，2026-10-20）
      onSpt: () => openRestartSPT(),                // ★C3·SPT 老大面板（HUD 底栏「SPT」钮，2026-10-19）
      onGodpet: () => openRestartGodpet(),          // ★C1·灵兽面板（HUD 底栏「灵兽」钮 = 上游 OpenPanel(SoulPet)，2026-10-19）
      onGuide: () => openRestartGuide(),            // ★C3·疑难指引面板（HUD 底栏「指引」钮 = 上游 OpenPanel(GuideLine)，2026-10-20）
      onStation: () => goToStation(),               // ★HUD 底栏「要塞」钮 = 上游 GoToStation()：跳本星球要塞（非面板）
      onHell: () => goToHudMap('炼狱', 1080),        // ★上游 `Hell` 节点 = GoToMap(1080)「炼狱入口」（定值跳转、非面板）
      onHome: () => goToHudMap('基地', 50000),       // ★上游 `Home` 节点 = GoToMap(50000)「小屋」（mod_home 覆盖位按围栏不接）
      onSystem: () => logLine('设定：系统面板待建'),
      onTodo: (label) => logLine(`${label}：面板待建（重启线未实现, 不伪造内容）`),
    })
    if (M.map) HUD.setMapTitle(String(M.map.name || ''), M.map.weather)
    window.__rbHud = HUD                     // 同 __rbattle 口径: 留给 puppeteer 判据驱动
  }, { scrim: false })                       // 常驻 HUD 非模态：遮罩会让地图/角色点不动
}

// ---- ★C3·WorldMap（世界地图面板，2026-10-19）：HUD 地球图标 → 面板 → 传送，复用 MB5 同一台决议机 ----
// 链侧 notOpen 仍只 logLine（TPQ4 语义不动）；面板灰块自走 onLocked→提示盒（WMQ1=A，两条独立语义，见 docs/view/panel/worldmap/worldmap-impl.md §7 WMD5）。
function runTeleport(mapId) {
  const d = MAP_SESSION.decideTeleport(mapId)
  if (d.kind === 'notOpen') { logLine('地图暂未开放: ' + mapId); return }   // TPQ4：链侧只记日志
  closeDialogBox()                                             // ★OR8：切图前撤对话浮层（对话里 30 条 teleport 出路）
  gotoMap(String(d.mapId), true)
}
// ---- ★HUD 底栏「要塞」钮 = 上游 `MapMenuController.GoToStation()`（**不是面板，是跳转**，2026-10-19）----
// 正本 `Assets/Scripts/MVC/Controller/Map/Components/MapMenuController.cs:34-37` ⇒ `GoToMap(currentMap.worldId*10000 + 81)`；
// `worldId = (categoryId-1)/100`（`Map.cs:22`，Mod 图 `id<-50000 || id==0` ⇒ 0）—— 与 `parse-map.js:297` 同一条。
// 发行数据实测只有两档要塞：**world 0 → `81`「英格瓦要塞」(category 100) / world 1 → `10081`「精灵太空站」(category 200)**。
// 传送链复用 `runTeleport`（= 光口/大地图/小地图/SPT 那台决议机，不新开第二条路）。
function goToStation() {
  const u = M.unity || {}
  const worldId = Number.isFinite(u.worldId) ? Number(u.worldId) : 0
  const target = worldId * 10000 + 81
  logLine(`要塞 → 星球 ${worldId} 的要塞图 ${target}`)
  runTeleport(target)
}
// ---- ★HUD 底栏「炼狱」/「基地」钮 = 上游同两颗：`Assets/Scenes/Map.unity` 的 `Hell`/`Home` 节点绑
//   `MapMenuController.GoToMap(int)`（**定值跳转、不是面板**；持久化实参 = `Hell→1080`、`Home→50000`）
//   ⇒ `Module.cs:10 GoToMap` → `TeleportHandler.Teleport(mapId)`。链仍走 `runTeleport`（不新开第二条路）。
// ⚠️ 上游 `Teleport(50000)` 里还读一格 `Activity.Find("mod_home").GetData("map_id")` **覆盖位**（存档侧；发行数据从不写该键）
//   ⇒ 按 **ACQ3 / TPC6**（`docs/architecture.md:72`、`docs/view/panel/activity/activity-design.md §8`）**仍不接线**，恒跳 `50000`「小屋」。
//   登记 = `docs/view/scene/room/view-scene-hud-impl.md §12.8`。
function goToHudMap(label, mapId) {
  logLine(`${label} → 地图 ${mapId}`)
  runTeleport(mapId)
}
function openRestartWorldMap() {
  const cur = Number(session.currentMapId) || 0
  const worldId = (M.unity && Number.isFinite(M.unity.worldId)) ? M.unity.worldId : 0   // 初始页 = 当前图的 world（A1 口径；无 Unity 记录 ⇒ 页 0）
  openPanel('rb-worldmap', (root, api) => {
    WORLDMAP.create(root, {
      currentMapId: cur, worldId,
      onClose: () => api.close(),
      onGo: (mapId) => { api.close(); runTeleport(mapId) },     // WM3：面板先撤，再走同一台 teleport 决议
      onLocked: () => openHintbox({ title: '提示', content: '地图暂未开放', contentSize: 16, optionNum: 1 }),   // WMQ1=A：弹提示、面板不关
    })
  })
}
// ---- ★C3·MiniMap（小地图面板一族，2026-10-19）：HUD 右上角 25×25 钮 → 按当前图 `category` 弹对应面板 ----
// 上游 `MapWorldController.cs:23-34` 是"预制不存在 ⇒ 一律回退飞船图 MiniMap1"（272 张图里 77 张 = 28%），
// 那是 bug（报告 A1）⇒ 决议 ② **声明 + 不照搬**：缺类目只提示、不弹面板（人类 2026-10-19 拍板，design MQ0-c）。
// 传送链复用 `runTeleport`（= 光口/NPC/对话出路/大地图那台决议机，MM3 不新开第二条路）。
function openRestartMiniMap() {
  const cat = Number(M.unity && M.unity.category) || 0
  if (!MINIMAP.has(cat)) {
    logLine('小地图：类目 ' + cat + ' 无面板（该区域暂无小地图）')
    openHintbox({ title: '提示', content: '该区域暂无小地图', contentSize: 16, optionNum: 1 })
    return
  }
  openPanel('rb-minimap', (root, api) => {
    MINIMAP.create(root, {
      category: cat, currentMapId: Number(session.currentMapId) || 0,
      onClose: () => api.close(),
      onGo: (mapId) => { api.close(); runTeleport(mapId) },   // MM3：面板先撤，再走同一台 teleport 决议
      onLocked: () => openHintbox({ title: '提示', content: '地图暂未开放', contentSize: 16, optionNum: 1 }),   // MQ4=A：弹提示、面板不关
    })
  })
}
// ---- ★C3·SPTBoss（SPT 老大面板，2026-10-19 · docs/view/panel/spt/）：HUD 底栏「SPT」钮 / NPC `openPanel SPTBoss[page=N]` ----
// 初始页 = design §3.2 照搬上游规则（page=worldId+1；≤1 ⇒ category≤10 北 / 否则 南；SPQ3=A 要塞/门落南页照此）。
// SPQ4=A：`[page=N]` 越界 ⇒ 夹紧到 [0,2]；非法/缺失 ⇒ 按初始页规则（修上游 A5 白板 / A6 抛，决议 ② 不照搬）。
// 传送链复用 `runTeleport`（SP4：面板先撤再走同一台决议机；SP5=A：18 图零门禁全直点，未验图照样过 decideTeleport）。
function sptInitialPage() {
  const u = M.unity || {}
  const worldId = Number.isFinite(u.worldId) ? Number(u.worldId) : 0
  const cat = Number(u.category) || 0
  const p = worldId + 1
  if (p > 1) return Math.min(p, 2)
  return cat <= 10 ? 0 : 1
}
function openRestartSPT(open = {}) {
  if (SPT_PANEL) { SPT_PANEL.update(); return }
  if (!A || !A.isRestart) { logLine('SPT：仅重启宇宙接管'); return }
  const raw = Number(open.page)
  const page = Number.isFinite(raw) ? Math.max(0, Math.min(2, Math.trunc(raw))) : sptInitialPage()
  openPanel('rb-spt', (root, api) => {
    SPT_PANEL = SPT.create(root, {
      page,
      onClose: () => { SPT_PANEL = null; api.close() },
      onGo: (mapId) => { SPT_PANEL = null; api.close(); runTeleport(mapId) },   // SP4：关板 → 传送（A1 双跳已修=单跳）
    })
  })
}
// ── ★C1·灵兽/精灵王（HUD「灵兽」钮 = 上游 MapMenuController.OpenPanel("SoulPet") → Panels/SpriteKing）──────
// 正本 = docs/view/panel/godpet/。状态袋 = 存档 `<activityStorage>` 的 'soul'（上游 Activity.Find("soul") 的对等物，
// 与地图线 setActivity 同一只袋、同"值恒 string"口径 ⇒ 随 A.save() 落盘，无需 session.js 新桥）。
// 人类 2026-10-19 拍板：三颗挑战钮 = 诚实待建（多 boss SPT/Special 战斗规则仍留 A 组，AGENTS.md §4.1）；
// 兑换商店 = 接现有商店面板（open.itemIds/limit + 商品自带 currencyType 400016）；灯位/领取/规则 = 真实现。
const SOUL_ITEM_ID = 400016            // 希望之光（上游 SpriteKingPanel.cs:17 ITEM_ID）
const SOUL_KING_ID = 990, SOUL_KING_LEVEL = 105   // 约瑟（cs:46 new Pet(990,105)）；上游 Lv105 ⇒ 不过 rbattleScene 的 1..100 钳
const SOUL_SHOP_IDS = [500811, 490990, ...Array.from({ length: 8 }, (_, i) => 21013 + i)]   // cs:269
const SOUL_SHOP_LIMITS = [1, 1, ...Array(8).fill(-1)]                                        // cs:270
const soulRich = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/&lt;color=#([0-9a-fA-F]{3,8})&gt;/g, '<span style="color:#$1">').replace(/&lt;\/color&gt;/g, '</span>')
function soulGet(key, def) {
  const v = activityGet('soul', key)
  return v === undefined ? def : v
}
function soulSet(entries) {
  if (!session.data) { logLine('soulSet 但无 session.data'); return }
  const list = session.data.activityStorage || (session.data.activityStorage = [])
  let a = list.find((x) => x && x.id === 'soul')
  if (!a) { a = { id: 'soul', data: [] }; list.push(a) }
  if (!Array.isArray(a.data)) a.data = []
  for (const [key, val] of Object.entries(entries)) {
    const e = a.data.find((x) => x && x.key === key)
    if (e) e.value = String(val)
    else a.data.push({ key, value: String(val) })
  }
}
function openRestartGodpet() {
  if (GODPET_PANEL) { GODPET_PANEL.update(); return }
  if (!A || !A.isRestart) { logLine('灵兽：仅重启宇宙接管'); return }
  const soulState = () => ({
    light: String(soulGet('light[north]', '0'.repeat(9))),
    kingAcquired: soulGet('done[north][10]', 'false') === 'true',
    hope: itemCount(SOUL_ITEM_ID),
  })
  const showHint = (spec) => openHintbox({ title: '提示', contentHtml: soulRich(spec.content), contentSize: 16, optionNum: 1 })
  openPanel('rb-godpet', (root, api) => {
    GODPET_PANEL = GODPET.create(root, {
      state: soulState,
      // 挑战：上游 = Battle.StartBattle(多 boss, mode=SPT/Special) ⇒ 引擎侧仍留 A 组围栏，本批诚实弹提示、不开战、不写灯。
      onFight: (type) => showHint({
        content: `灵兽挑战（${type}）待建：多老大 SPT/Special 战斗规则仍属 A 组围栏（AGENTS.md §4.1），\n解锁后才会「通关 → 随机点亮３个头像 + 得３个希望之光」。`,
      }),
      // 兑换商店 = 上游 Shop()：同一台 ItemShop，注入 10 件货 + 限购；货币 400016 由商品 currencyType 驱动。
      // 面板先撤再开（与活动/SPT 同口径，避免两层面板叠着）。
      onShop: () => {
        GODPET_PANEL = null; api.close()
        openRestartShop({
          mode: 'buy', title: '精灵王兑换商店',
          itemIds: SOUL_SHOP_IDS, limit: SOUL_SHOP_LIMITS,
          currency: { coin: SOUL_ITEM_ID, diamond: 2 },
        })
      },
      // 领取约瑟 = 上游 GetKing()（SpriteKingPanel.cs:26-55；上游"先全亮再领仍扣 50"的分支按决议②不照搬 ⇒ 全亮免扣）。
      onGetKing: () => {
        const st = soulState()
        if (st.kingAcquired) { showHint({ content: '你已经获得过约瑟了哦！\n查看精灵背包或仓库吧！' }); return }
        const allLit = !st.light.includes('0')
        if (!allLit && !(st.hope >= 50)) {
          showHint({ content: '头像全部点亮或集齐50个<color=#ffbb33>【希望之光】</color>才能获得约瑟！请查看<color=#ffbb33>【挑战规则】</color>！' })
          return
        }
        if (!allLit && !A.consumeItem(SOUL_ITEM_ID, 50)) { showHint({ content: '希望之光不够 50 个了，请重新查看持有数。' }); return }
        RST.syncUidSeq(A.state)
        const pet = RST.makeRestartPet(A, SOUL_KING_ID, SOUL_KING_LEVEL)
        const where = RST.addPet(A.state, pet)
        if (where === 'full') {
          if (!allLit) A.addItem(SOUL_ITEM_ID, 50)   // 回滚本局已扣的 50，宠没领走不许扣钱
          showHint({ content: '背包已满，放不下约瑟。请先腾出位置再来领取。' })
          return
        }
        soulSet({ 'light[north]': '1'.repeat(9), 'done[north][10]': 'true' })
        A.save()
        refreshHud()
        showHint({ content: `获得精灵王【${A.nameOf(pet)}】Lv${SOUL_KING_LEVEL}！（已放入${where === 'team' ? '出战编队' : '精灵仓库'}）` })
        logLine(`灵兽: 领取约瑟 uid=${pet.uid} → ${where}；light[north]=111111111`)
      },
      onClose: () => { GODPET_PANEL = null; api.close() },
    })
  })
}

// ── ★C3·疑难指引（HUD「指引」钮 = 上游 MapMenuController.OpenPanel("GuideLine") → Panels/GuideLine）──────
// 正本 = docs/view/panel/guide/。只读查表面板：23×23 相克表 + 55 性格表；零写盘、零 L1。
// 「新手指引」是上游的跳转钮（关本面板开 Noob）；Noob 面板未建 ⇒ 弹诚实提示，本面板不关（design GDQ1）。
function openRestartGuide() {
  if (GUIDE_PANEL) { GUIDE_PANEL.update(); return }
  openPanel('rb-guide', (root, api) => {
    GUIDE_PANEL = GUIDE.create(root, {
      onClose: () => { GUIDE_PANEL = null; api.close() },
      onNoob: () => openHintbox({
        title: '提示',
        content: '新手指引面板（Noob）待建：它读取新手四步进度与新手判定，属独立面板线；疑难指引不受影响。',
        contentSize: 16, optionNum: 1,
      }),
    })
  })
}
// ── ★C4·Activity + ★C1·Dex 共用的**面板终点分派器**（DXQ4=A：由 handleActivityLink 提升而来，正本 = 活动 impl + dex-impl §4.3）──
// 入口 = HUD 底栏「活动」钮 + NPC `openPanel Activity[...]`；图鉴右栏那颗「分布」go 钮 = 同一台机器。
// "去参加 / 去这张图" = 照上游 Activity.cs:48 Link(id)→Panel.Link(linkId)：
//   linkId 数值（含负）⇒ 走**同一台** teleport 决议机（runTeleport，与光口/世界地图无别）；
//   已落码面板 PetBag/WorldMap/ItemShop/SPTBoss ⇒ 开对应面板；
//   已知终点但未落码面板 ⇒ 如实 logLine，不伪造；`none`/无法识别 ⇒ logLine。
// ⚠️ `WorldMap[world=1]`/`SignReward[activity=…]` 的**方括号参数本轮剥除**（世界页选择/签到活动号 = 已登记未细化）。
// ⚠️ 名单 = **全仓唯一一份**（dex-design DXI4：图鉴不许复制第二张表）；2026-10-19 补 `Fusion`/`Mission`
//    两项 = 图鉴分布实测缺口（具名终点 44 只里 22 只是 Fusion、1 只是 Mission，之前会落到"未识别"）。
//    2026-10-19 `SoulPet` 已落码（★C1 灵兽面板）⇒ 移出名单、进下方分派。
//    2026-10-20 `GuideLine` 已落码（★C3 疑难指引）⇒ 同上。
const ACT_UNBUILT = ['Noob', 'SignReward', 'Mailbox', 'Workshop', 'Fusion', 'Mission']
function handlePanelLink(linkId) {
  const raw = String(linkId || '')
  const base = raw.replace(/\[[^\]]*\]/, '').trim()
  if (!base || base === 'none') { logLine('无跳转入口: ' + raw); return }
  if (/^-?\d+$/.test(base)) { logLine('跳转 → 地图 ' + base); runTeleport(Number(base)); return }
  if (base === 'PetBag') return openRestartPetBag()
  if (base === 'WorldMap') return openRestartWorldMap()
  if (base === 'ItemShop') return openRestartShop()
  if (base === 'SPTBoss') return openRestartSPT()
  if (base === 'SoulPet') return openRestartGodpet()      // ★C1：活动 `soul`（精灵王之路）linkId=SoulPet → 灵兽面板
  if (base === 'GuideLine') return openRestartGuide()     // ★C3：疑难指引（HUD 钮之外的 NPC/活动第二入口）
  if (base === 'PlayerInfo') return openRestartPlayerInfo()   // ★C4：防未来兜底（现桥数据零 openPanel PlayerInfo intent；ACT_UNBUILT 不加它 = 它已建）
  if (ACT_UNBUILT.includes(base)) return logLine('跳转终点面板待建: ' + base)
  logLine('未识别的跳转: ' + raw)
}
function openRestartActivity() {
  if (ACTIVITY_PANEL) { ACTIVITY_PANEL.update(); return }
  if (!A || !A.isRestart) { logLine('活动：仅重启宇宙接管'); return }
  openPanel('rb-activity', (root, api) => {
    ACTIVITY_PANEL = ACTIVITY.create(root, {
      onClose: () => { ACTIVITY_PANEL = null; api.close() },
      // 面板先撤（api.close）再执行跳转，避免活动层压在目标面板/传送之下；单例引用同步清掉。
      onLink: (info) => { ACTIVITY_PANEL = null; api.close(); handlePanelLink(info.linkId) },
    })
  })
}
// ── ★C4·PlayerInfo 个人信息面板（2026-10-20 · docs/view/panel/playerinfo/，PIQ1–4 全 A；PI-equip ⇒ PIQ5–7，design §3.8）───
// 两字段（nickname / achievement）读写经**本层闭包**注入 ctx（PI2：A 不暴露 session.data ⇒
// 同 soulSet:381 的既有口径，session.js 一行不改）；mergeBack 只回写 petBag/petStorage/itemStorage/activityStorage ⇒ 直写字段落盘无碍。
// 落盘点：昵称第 2 拍非空 / 下拉选定（全经 onSave）；Shoot 翻转**不落盘**（PIQ3）；~~Change 翻转~~ 随 PIQ7 退役。
// ★PI-f 装备两栏：穿/卸/骑/下马**复用 `APP.actorLook.*`**（自带 syncLook + persistLook 落 `<equip>`），阴影两态不落盘（同 MDB8-b3）；
//   目录读数 = `CONTENT.loadEquipIndex()` 缓存预热 ⇒ `listCatalog()` 同步产出；预览画布 = `PI_PREVIEW` 登记 + `stepActorAnim` 逐帧补绘（零新增 rAF）。
// 称号/装备三族 = 上游 ChangeNameModel.IsInCategory(Achievement) 的三个 typeId（23/24/25）；
// 视图件不认（选项由 ctx.listAchievements() 递现值，L3 零查表零算数 = PI2）。
const PIF_TYPES = new Set([23, 24, 25])
// ★PI-f：组固定序（人类点名序；阴影 = slot 0 ⇒ 非装备物品、`groundMode` 两态开关 = PIQ6）
// ★PI-j（ALQ11 · 人类 2026-10-21）：末位追加「颜色」组 = 又一个**非装备物品组**（照 ground 先例，追加在尾不打乱组序）
// ★PI-k（ALQ12 · 人类 2026-10-21「更改角色表情未添加」）：补「表情」组 = 装备槽 8（`EYE`），排在件物组末、非物品组之前
const PI_GROUPS = [
  { key: 'head', label: '头部', slot: 1 },
  { key: 'hands', label: '手部', slot: 2 },
  { key: 'feet', label: '脚部', slot: 6 },
  { key: 'waist', label: '腰部', slot: 5 },
  { key: 'back', label: '背部', slot: 7 },
  { key: 'mount', label: '坐骑', slot: 3 },
  { key: 'eye', label: '表情', slot: 8 },
  { key: 'ground', label: '阴影', slot: 0, ground: true },
  { key: 'color', label: '颜色', slot: 0, color: true },
]
let PIF_EQUIP_IDX = null    // equip-index 目录缓存（首次开面板 loadEquipIndex 预热；未就绪 ⇒ listCatalog 出空组、不崩）
let PIF_MANIFEST = null     // ★PI-j：本地素材清单缓存（同预热口径；未就绪 ⇒ 件物组出空、走既有空组提示，不崩）
let PI_PREVIEW = null       // 面板预览画布登记（开面板 setPreviewCanvas 登记 / onClose·unmount 置 null；stepActorAnim 逐帧补绘）
const PI_PREVIEW_SCALE = 2  // 预览缩放（人眼校常量，同 ACTOR_SCALE/LOOK_SCALE 族；小框里 2× 起步）
function openRestartPlayerInfo() {
  if (PINFO) { PINFO.update(); return }
  if (!A || !A.isRestart) { logLine('个人信息：仅重启宇宙接管'); return }
  const showHint = (msg) => openHintbox({ title: '提示', content: msg, contentSize: 20, optionNum: 1 })
  // 三字段读写全在本层闭包（PI2：A 不暴露 session.data ⇒ 同 soulSet:381 的既有口径，session.js 一行不改）；
  // mergeBack 只回写 petBag/petStorage/itemStorage/activityStorage ⇒ 直写三字段后 A.save() 落盘无碍。
  const getNickname = () => (session.data ? String(session.data.nickname || '') : '')
  const setNickname = (v) => { if (!session.data) return; session.data.nickname = v; if (session.state?.trainer) session.state.trainer.name = v }   // 写时同步消费投影（PIQ4）
  const getAchievement = () => (session.data ? Math.trunc(Number(session.data.achievement) || 0) : 0)
  const setAchievement = (id) => { if (!session.data) return; session.data.achievement = Math.trunc(Number(id) || 0) }
  const listAchievements = () => (session.data?.itemStorage || [])
    .filter((x) => PIF_TYPES.has(Number(x?.id)))
    .map((x) => { const info = CONTENT.restartItemOf(Number(x.id)); return { id: Number(x.id), name: info?.name, resId: info?.resId, typeRaw: info?.typeRaw, typeId: info?.typeId } })
    .sort((a, b) => (b.typeId - a.typeId) || (a.id - b.id))   // 上游 LINQ 同形：typeId 降序、id 升序
  const onSave = () => { A.save(); refreshHud() }   // 写后统一落盘 + HUD 名/币刷新（视图零写档，PI2）
  // ★PI-f 装备两栏读数/动作（全在本层闭包 = PI2；动作一律路由既有 APP.actorLook.*，自带 syncLook+persistLook）
  CONTENT.loadEquipIndex().then((idx) => { PIF_EQUIP_IDX = idx; if (PINFO) PINFO.update() })   // 目录预热（缓存 promise、幂等）
  CONTENT.loadActorManifest().then((mf) => { PIF_MANIFEST = mf; if (PINFO) PINFO.update() })    // ★PI-j 素材清单预热（缺件过滤判据；失败兜成空清单 ⇒ 组出空不崩）
  const pifItem = (id) => (PIF_EQUIP_IDX && PIF_EQUIP_IDX.items && PIF_EQUIP_IDX.items[String(id)]) || null
  // ★PI-j 玩家面四重筛：① 槽位匹配 → ② 剔 12 色颜色件（ALQ11，颜色走「颜色」组）→ ③ 剔 `suit=0` 默认/空件（ALQ13：默认头顶/默认眼睛 = 「没穿」不是装扮）→ ④ 只留**本地清单已登记到部件包**的件（ALQ10，官服 404 的 11 件不露出）。
  //   边界（人类 2026-10-21 拍板）= **只剔玩家面**：调试入口 `APP.actorLook.equip/ride` 照旧可穿任意 ID、存档里的无包件照常画 fallback、不静默改档。
  //   ⚠️ 包名/后缀**不在本层重拼** = 走 L1 `ACTOR_LOOK.packRefOf`（单一真值）；**图标缺不作剔除条件**（图标仍走 `item-art.js` 四级兜底）。
  const listCatalog = () => PI_GROUPS.map((g) => ((g.ground || g.color) ? { ...g, items: [] } : {
    ...g,
    assetReady: !!(PIF_MANIFEST && PIF_MANIFEST.packs && Object.keys(PIF_MANIFEST.packs).length),   // 清单未就绪/取回空 ⇒ 空组提示要与「这组真的没件」区分开
    items: Object.entries((PIF_EQUIP_IDX && PIF_EQUIP_IDX.items) || {})
      .filter(([k, v]) => {
        if (Math.trunc(Number(v.slot) || 0) !== g.slot) return false
        if (ACTOR_LOOK.COLOR_ITEM_IDS.has(Math.trunc(Number(k)))) return false
        if (ACTOR_LOOK.isEmptySuitItem(v)) return false
        const { pack, suffix } = ACTOR_LOOK.packRefOf(v)
        return !!((PIF_MANIFEST && PIF_MANIFEST.packs && PIF_MANIFEST.packs[pack] && PIF_MANIFEST.packs[pack].files && PIF_MANIFEST.packs[pack].files[suffix]))
      })
      .map(([k, v]) => ({ id: Number(k), name: v.name || '' }))
      .sort((a, b) => a.id - b.id),
  }))
  const equippedIdOfSlot = (slot) => {
    if (slot === 3) return Math.trunc(Number(session.mountEquipId) || 0)
    return (session.equipVec || []).find((id) => Math.trunc(Number(pifItem(id)?.slot) || 0) === slot) || 0
  }
  // ★PI-j ALQ11 换色读数（索引口径同 buildLookPlan 的 `session.actorColor ?? #avSel`，非法 ⇒ 0 蓝兜底）
  const getColorMode = () => { const i = ACTOR_LOOK.colorIndexOf(session.actorColor ?? currentActorColor()); return i < 0 ? 0 : i }
  const listColors = () => ACTOR_LOOK.DEFAULT_COLORS.map((c, n) => ({ n, name: c.name }))   // 视图零知识（12 色表只在 L1）
  const getEquippedSummary = () => PI_GROUPS.map((g) => (g.ground
    ? { ...g, itemId: 0, name: session.groundMode === 'halo' ? '光轮' : '阴影' }
    : g.color
      ? { ...g, itemId: 0, name: ACTOR_LOOK.DEFAULT_COLORS[getColorMode()].name }
      : (() => { const id = equippedIdOfSlot(g.slot); return { ...g, itemId: id, name: id ? (pifItem(id)?.name || '#' + id) : '' } })()))
  const getGroundMode = () => (session.groundMode === 'halo' ? 'halo' : 'shadow')
  const refreshPanel = () => { if (PINFO) PINFO.update(); if (PI_PREVIEW) renderPreviewTo(PI_PREVIEW) }
  const pifAct = (p) => { Promise.resolve(p).then(refreshPanel) }   // actorLook 各入口 = async ⇒ 完成后再拉活读数
  const onPickEquip = (id, slot) => {
    if (slot === 3) { pifAct(session.mountEquipId === id ? APP.actorLook.unride() : APP.actorLook.ride(id)); return }
    pifAct(equippedIdOfSlot(slot) === id ? APP.actorLook.unequip(id) : APP.actorLook.equip(id))
  }
  const onUnequipSlot = (slot) => {
    if (slot === 3) { pifAct(APP.actorLook.unride()); return }
    const id = equippedIdOfSlot(slot)
    if (id) pifAct(APP.actorLook.unequip(id))
  }
  const onPickGround = (mode) => { APP.actorLook.ground(mode); refreshPanel() }   // 只改会话态、不落盘（PIQ6/ MDB8-b3）
  const onPickColor = (n) => { pifAct(APP.actorLook.color(n)) }   // ★PI-j ALQ11：换色只改会话态（`color()` 内不 persistLook）⇒ 不落 `<equip>`，与 ground 同口径
  const setPreviewCanvas = (canvas) => {
    PI_PREVIEW = canvas
    renderPreviewTo(canvas)                                        // 立即一帧（防两 tick 间开屏空白）
    Promise.resolve(syncLook()).then(() => { if (PI_PREVIEW === canvas) renderPreviewTo(canvas) })   // 计划未就绪 ⇒ 就绪后补帧
  }
  openPanel('rb-pinfo', (root, api) => {
    PINFO = PINFO_VIEW.create(root, {
      // 读：视图 render() 现读（活读数）
      getNickname,
      getAchievement,
      listAchievements,
      getCoins: () => A.state.trainer?.coins ?? 0,       // 同源投影（上游 Item.Find(1/2) = stateFromData 的 trainer.coins/diamonds）
      getDiamonds: () => A.state.trainer?.diamonds ?? 0,
      getShootMode: () => !!session.isShootMode,
      // 写/动作：视图只发信号，落档落盘全在这里（~~onToggleRobot~~ 随 PIQ7 退役）
      onSubmitName: (v) => { setNickname(v); onSave() },
      onPickAchievement: (id) => { setAchievement(id); onSave() },
      onToggleShoot: () => { session.isShootMode = !session.isShootMode },   // PIQ3：进程级翻布尔、**不落盘**（重开回 false，同上游 static；消费面 = 下次进图 env.mode）
      onOpenItemBag: () => { PI_PREVIEW = null; PINFO = null; api.close(); openRestartItemBag() },   // PIQ1=A：面板先撤再开既有道具背包模态（口径差已登记）
      onFollow: () => showHint('该功能尚未实装，敬请期待！'),               // PIQ2=A：上游 TakeFollower 自己就恒弹这句（A3）
      onHome: () => showHint('当前没有跟随中的精灵或动物哦！'),             // PIQ2=A：本仓无 follower ⇒ 只走无跟随者支（A4）
      showHint,
      // ★PI-f 装备两栏（design §3.8 / §4 契约表新行；动作 = APP.actorLook.* 复用，落盘走 persistLook→<equip>）
      listCatalog,
      getEquippedSummary,
      getGroundMode,
      onPickEquip,
      onUnequipSlot,
      onPickGround,
      // ★PI-j 颜色组（ALQ11 · design §4 契约表；读数现取、视图零表 = PI2）
      listColors,
      getColorMode,
      onPickColor,
      setPreviewCanvas,
      onClose: () => { PI_PREVIEW = null; PINFO = null; api.close() },
    })
  })
}
// ── ★C1·Dex 精灵图鉴（2026-10-19 · docs/view/panel/dex/，**VP5 反转的落地格**）────────────────────
// 只读面板：数据 = content 全表 838 行（L2 新 getter），"已获得"角标 = 当场投影 petBag12 + 仓库沿进化链反查。
// ⚠️ **零写盘**（DXI1）：本函数不接 onWrite、不碰 repository —— 开/关/翻页/筛选/点格/听叫声都不落盘。
// 逻辑件经 opts.logic 注入（L3 不许 import game/logic/**）；跳转经**共用**分派器 handlePanelLink（DXI3/DXI4）。
const DEX_HINT_TEXT = { 'bag.battleTestPending': '测试对战属战斗线，本代未接（面板不带后门）' }
function openRestartDex() {
  if (DEX_PANEL) { DEX_PANEL.update(); return }
  if (!A || !A.isRestart) { logLine('图鉴：仅重启宇宙接管'); return }
  const model = projectBagView(A.state)
  openPanel('rb-dex', (root, api) => {
    DEX_PANEL = DEXVIEW.create(root, {
      rows: CONTENT.restartAllPets(),
      topicIds: CONTENT.restartTopicPetIds(),
      evolveTargetsOf: CONTENT.restartEvolveTargetsOf,
      // 角标是**活读数**：每次构页现算 ⇒ 换宠上阵/入仓后重开图鉴（或翻一次页）跟着变（design §5 第 5 条）
      ownedIds: () => buildOwnedIds(model.petBag, model.petStorage),
      logic: { buildDexEntries, buildOwnedIds, isOwned, createGrid, elementPredicate, nameOrIdPredicate, sorterOf, combineAnd, DEX_PAGE_SIZE },
      showHint: (spec) => openHintbox({ title: '提示', content: DEX_HINT_TEXT[spec?.key] || spec?.key || '', contentSize: 16, optionNum: 1 }),
      onNote: (s) => logLine(s),
      // 面板先撤再跳转（与活动同一口径）；单例引用同步清掉。
      onLink: (linkId) => { DEX_PANEL = null; api.close(); handlePanelLink(linkId) },
      onClose: () => { DEX_PANEL = null; api.close() },
    })
  })
}
// ── petbag 装配 stub (B3/B7)：repository.js 未落地 ⇒ 从 v3 A.state.team/box 现算成 petBag[12]/petStorage 引用。
//    这是「数据源搬家」不是迁移 (docs/save/save-impl.md §6 无旧档)。面板只在 petBag/petStorage 之间搬已有宠
//    (满 12 溢出不归本份 = VP8)。describePet 在此算 hpFrac/hpLabel (比例，视图零算数 V-2)；
//    requestSave 写回 A.state 再 A.save (R4 在装配层执行，V-5)；askHint 借现成 openHintbox (R5 未建档的临时壳)。
const PBAG_TEAM = 6, PBAG_SIZE = 12
function projectBagView(st) {
  const team = st.team || [], box = st.box || []
  const petBag = new Array(PBAG_SIZE).fill(null)
  for (let i = 0; i < PBAG_TEAM; i++) petBag[i] = team[i] ?? null
  for (let i = 0; i < PBAG_TEAM; i++) petBag[PBAG_TEAM + i] = box[i] ?? null
  return { petBag, petStorage: box.slice(PBAG_TEAM) }
}
function writeBackBag(st, petBag, petStorage) {
  st.team = petBag.slice(0, PBAG_TEAM).filter(p => p != null)
  st.box = [...petBag.slice(PBAG_TEAM).filter(p => p != null), ...petStorage]
}
const bagConfirmText = (key) => (key === 'storage.releaseConfirm' ? '确定放生这只精灵？此操作不可撤销。' : (key || '请确认'))
function openRestartPetBag() {
  if (BAG) { BAG.update(); return }
  if (!A || !A.isRestart) { logLine('背包：仅重启宇宙接管 (as3 线走 SWF togglePetBag)'); return }
  const model = projectBagView(A.state)
  const describePet = (p) => {
    if (!p) return null
    // 上限吃**档里真个体值**（iv/ev/性格；中性口径留给 HUD/战斗线 —— petbag 面板对齐上游 normalStatus，
    // 真机档 6/6 只宠的 currentStatus 就是用真值算的）。heal 的恢复目标随这个走。
    const hpMax = Math.round(CONTENT.maxHpOf(p.petId, p.level, A.petProfile(p))) || 1
    const hp = Math.max(0, p.hp | 0)
    return { name: A.nameOf(p), hpMax, hp, hpFrac: Math.max(0, Math.min(1, hp / hpMax)), hpLabel: `${hp}/${hpMax}` }
  }
  // ── 数据显示注入（P2 批）：视图挂钩早在 view/petbag/index.js 的 ctxBase，装配层喂真值 ──
  // HUD 六项：特性/纹章走 content 表桥（featureId/emblemId=0 ⇒ 种族默认），性别/个体值走读数。
  const hudReadout = (p) => {
    const r = A.petReadout(p)
    const cfg = CONTENT.petConfig(p.petId, p.level) || {}
    const rank = CONTENT.restartIvRankOf(r.iv)
    const feat = CONTENT.restartFeatureOf(p.petId, r.featureId) || {}
    const emb = r.hasEmblem ? (CONTENT.restartEmblemOf(p.petId, r.emblemId) || {}) : {}
    return {
      element: CONTENT.elementNameOf(cfg.elementId ?? 0),
      name: A.nameOf(p),
      feature: feat.name || '—',
      featureDesc: feat.rawDescription || '',
      gender: CONTENT.restartGenderName(r.gender),
      emblem: r.hasEmblem ? (emb.name || '—') : '未佩戴',
      emblemDesc: r.hasEmblem ? (emb.rawDescription || '') : '',
      emblemIcon: r.hasEmblem ? (emb.baseId || 0) : 0,   // 纹章图标 baseId ⇒ Emblems/{baseId}.png（_kit.js:emblemIconUrl）
      iv: r.iv + (rank ? '（' + rank + '）' : ''),
    }
  }
  const requestSave = () => { writeBackBag(A.state, model.petBag, model.petStorage); A.save(); refreshHud() }
  // 性格索引（内存宠上的 live 值；改性格后不等存盘即生效）
  const persOf = (p) => (p && Number.isFinite(p.personality) ? p.personality : 0)
  const showHint = (spec) => { logLine('背包提示 [' + ((spec && spec.key) || '') + ']') }
  const askHint = (spec) => new Promise(res => openHintbox({
    content: bagConfirmText(spec && spec.key), optionNum: 2,
    onConfirm: () => res('ok'), onCancel: () => res('cancel'),
  }))
  openPanel('rb-petbag', (root, api) => {
    BAG = PBAG.create(root, A, {
      host: 'normal', petBag: model.petBag, petStorage: model.petStorage,
      describePet, onWrite: requestSave, showHint, askHint,   // 视图发 onWrite 信号；R4 落盘在这层执行（V-5）
      logic: { createPetBagSource, createGrid, actions: PETBAG_ACTIONS, skillOps: PETBAG_SKILL, BAG_SIZE: PETBAG_BAG_SIZE, PAGE_SIZE: PETBAG_PAGE_SIZE },
      // 技能换位的两条存档接缝（只碰 __xml.skills 的三个字段）+ 落盘仍走 onWrite ⇒ requestSave
      petSkills: (p) => petSkillsOf(p),
      setPetSkills: (p, s) => applyPetSkills(p, s),
      // 能力区六维用真 iv/ev/性格（petConfig 默认中性 = 显示错数）；性格读内存索引（改完即时生效）
      petProfileOf: (p) => A.petProfile(p),
      hudOf: (p) => hudReadout(p),
      expToNext: (p) => {
        const e = A.petExpInfo(p)
        return e.level >= e.maxLevel ? '--' : String(e.expToNext)
      },
      personalityName: (p) => personalityName(persOf(p)),
      personalityBonus: (p) => CONTENT.personalityBuffDescription(persOf(p), ' '),
      evLabel: (p) => {
        const r = A.petReadout(p)
        return r.ev.join('/') + '（余 ' + r.evStorage + '）'
      },
      kizunaLabel: (p) => String(A.petReadout(p).kizuna),
      // 身高/体重/相遇时间等基础信息读数（P2 批：detailPane 的「基础」左栏靠它画真值，之前漏接 ⇒ 全显「—」）
      petReadout: (p) => A.petReadout(p),
      onClose: () => { BAG = null; api.close() },
    })
  }, { scrim: false })
}
// 商店面板（重启线 U·商店支）：HUD「商店」钮 / NPC openPanel ItemShop 都走这。
// 解析 NPC 动作参数（SetPanelIdentifier 同款：mode/type/currency/item/limit/title/desc）
function applyShopArg(open, k, v) {
  if (k === 'item') open.itemIds = String(v).split('/').map(Number).filter(n => n > 0)
  else if (k === 'limit') open.limit = (String(v).indexOf('/') >= 0) ? String(v).split('/').map(Number) : Number(v)
  else if (k === 'currency') { const p = String(v).split('/').map(Number); open.currency = { coin: p[0], diamond: p[1] } }
  else open[k] = v
}
function parseShopArgs(intent) {
  const open = {}
  let panel = intent.panel || ''
  const m = panel.match(/\[([^\]]*)\]/)
  if (m) {
    panel = panel.replace(m[0], '')
    for (const kv of m[1].split(',')) {
      const idx = kv.indexOf('=')
      if (idx < 0) continue
      applyShopArg(open, kv.slice(0, idx).trim(), kv.slice(idx + 1).trim())
    }
  }
  for (const kv of (intent.args || [])) applyShopArg(open, kv[0], kv[1])
  return open
}
function openRestartShop(open = {}) {
  if (SHOP) { SHOP.update(); return }
  if (!A || !A.isRestart) { logLine('商店：仅重启宇宙接管'); return }
  const requestSave = () => { A.save(); refreshHud() }
  openPanel('rb-shop', (root, api) => {
    SHOP = SHOPVIEW.create(root, A, {
      logic: SHOP_LOGIC,
      open,
      onWrite: requestSave,
      onClose: () => { SHOP = null; api.close() },
    })
  })
}

function openRestartItemBag() {
  if (ITEMBAG) { ITEMBAG.update(); return }
  openPanel('rb-itembag', (root, api) => {
    ITEMBAG = RESTART_ITEMBAG.create(root, A, { onClose: () => { ITEMBAG = null; api.close() } })
  })
}
// HUD 刷新统一入口: 重启线走 DOM, as3 线喂 SWF
function refreshHud() {
  if (A && A.isRestart) {
    if (!HUD) mountRestartHud()
    else { HUD.update(); if (M.map) HUD.setMapTitle(String(M.map.name || ''), M.map.weather) }
  } else {
    pushHud()
  }
}

// ---- 物品背包数据源 (面板本体在 maprunner/ItemBagRunner.as, 素材是原版 module/app/ItemBagPanel.swf) ----
let ITEMDB = null
async function itemDB() {
  if (!ITEMDB) ITEMDB = await (await fetch('/game/data/items.json')).json()
  if (SAVE.items == null) SAVE.items = STARTER_ITEMS.map(r => ({ ...r }))   // 仅“未载入”时的显示兜底（真档道具见 A.state.items）
  return ITEMDB
}
// 喂给 ItemBagRunner 的行 = 原版 ItemManager.getItemArr() 里那些字段的等价物
async function itemRows() {
  const db = await itemDB()
  const list = A ? A.state.items : SAVE.items
  return list.map(r => {
    const d = db.items[r.id]
    if (!d) return null
    return { id: d.id, name: d.name, count: r.count, tip: d.tip || '', price: d.price || 0, sell: d.sellprice || 0, icon: d.icon, vip: Number(d.viponly) || 0 }
  }).filter(Boolean)
}
async function toggleBag() {
  const p = M.player
  if (!p) return
  try {
    p.bagItems(await itemRows())
    p.bagMoney(String(SAVE.coins), String(SAVE.diamonds))
    p.bagOpen()
  } catch (e) { logLine('背包喂数据失败: ' + e) }
}
function showBagTip(d) {
  if (!d.show) { tipEl.style.display = 'none'; return }
  const it = d.item || {}
  tipEl.textContent = ''
  const t = document.createElement('b'); t.textContent = String(it.name || '')
  const s = document.createElement('span'); s.textContent = String(it.tip || '')
  const f = document.createElement('i'); f.textContent = '售价 ' + (Number(it.sell) || 0) + ' · 持有 ' + (Number(it.count) || 1)
  tipEl.append(t, s, f)
  tipEl.style.display = 'block'
  // 原版 toolTip 贴在格子右下; 靠边就翻到左边, 别出画面
  const x = Number(d.x) + Number(d.w) + 6
  tipEl.style.left = (x + 250 > 1200 ? Math.max(4, Number(d.x) - 254) : x) + 'px'
  tipEl.style.top = Math.max(4, Math.min(600, Number(d.y) - 6)) + 'px'
}
function useItem(id, name) {
  if (A) {
    if (!A.consumeItem(id)) { logLine(`${name}: 数量不足`); return }
    A.save()
    logLine(`使用 ${name} ×1 (地图上使用效果未实装, 战斗内已接药剂/胶囊)`)
  } else {
    const rec = (SAVE.items || []).find(r => r.id === id)
    if (!rec) return
    rec.count = Math.max(0, rec.count - 1)
    if (rec.count === 0) SAVE.items = SAVE.items.filter(r => r.id !== id)
    logLine(`使用 ${name} ×1 (单机版只扣数量, 效果还没接)`)
  }
  toggleRefresh()
}
async function toggleRefresh() {                    // 只灌数据, 不动开关状态
  const p = M.player
  if (!p) return
  try { p.bagItems(await itemRows()) } catch (e) { logLine('背包刷新失败: ' + e) }
}

// ---- 精灵背包数据源 (面板本体在 maprunner/PetBagRunner.as, 素材是原版 module/app/PetBagPanel.swf) ----
// 行结构对齐原版 PetInfo 的最小集: 出战前 5 行, 其后 12 行/页进背包格, 再往后铺仓库 18 格。
async function petRows() {
  const db = await petDB()
  if (!A) return []
  // 出战顺序 = team, 其后 = 仓库; 等级/血量都来自活跃宇宙 (v2 存 name/swfId; v3 现算)
  return [...A.state.team, ...A.state.box].map(p => {
    const m = db.monsters[p.petId]
    if (!m && !A.isRestart) return null
    const hpMax = Math.round(A.hpMax(p))
    const swfId = A.swfIdOf(p)
    return {
      id: p.uid, swfId, name: String(A.nameOf(p)).replace(/[|;]/g, ''), type: String((m && m.type) || ''),
      level: p.level, hp: Math.max(0, Math.min(p.hp, hpMax)), hpMax,
      icon: '/swf/pet/icon/' + swfId + '.swf'
    }
  }).filter(Boolean)
}
async function togglePetBag() {
  const p = M.player
  if (!p) return
  try {
    p.petBagItems(await petRows())
    p.petBagMoney(String(SAVE.coins), String(SAVE.diamonds))
    p.petBagOpen()
  } catch (e) { logLine('精灵背包喂数据失败: ' + e) }
}
function showPetTip(d) {                            // 中文进 DOM (SWF 子集字体没墨), textContent only
  if (!d.show) { tipEl.style.display = 'none'; return }
  const it = d.pet || {}
  tipEl.textContent = ''
  const t = document.createElement('b'); t.textContent = String(it.name || '')
  const s = document.createElement('span'); s.textContent = (String(it.type || '')) + ' · Lv' + (Number(it.level) || 1)
  const f = document.createElement('i'); f.textContent = 'HP ' + (Number(it.hp) || 0) + '/' + (Number(it.hpMax) || 0)
  tipEl.append(t, s, f)
  tipEl.style.display = 'block'
  const x = Number(d.x) + Number(d.w) + 6
  tipEl.style.left = (x + 250 > 1200 ? Math.max(4, Number(d.x) - 254) : x) + 'px'
  tipEl.style.top = Math.max(4, Math.min(600, Number(d.y) - 6)) + 'px'
}
// HUD 点击 → 有对应实现的就动, 没有的只报一行 (原版这些按钮各自开一个 app/processor 面板模块)
const HUD_TODO = {
  actorBag: '角色背包', petBag: '精灵背包', teamBtn: '战队', buddyBtn: '好友', homePanel: '家园',
  trainerBtn: '训练师', shootBtn: '射击', shipmapBtn: '星际地图', systemPanel: '系统',
  shouyouBtn: '手游推广', nonoPanel: 'NONO', emotionBtn: '表情', userUp: '升级信息',
  yueseNono: '角色NONO', skyBtn: '天空', sptBtn: 'SPT', monsterBtn: '怪物', copyBtn: '副本',
  fortressBtn: '要塞', questBtn: '任务', dicPanel: '图鉴', mapBtn: '地图'
}
function onHudClick(what) {
  if (what === 'actorBag') { toggleBag(); return }     // 原版 ActorBagWidgetClick → toggleModule(ItemBagPanel)
  if (what === 'petBag') { togglePetBag(); return }    // 原版 PetBagWidgetClick → toggleModule(PetBagPanel)
  logLine('HUD 点击 ' + what + (HUD_TODO[what] ? ' · ' + HUD_TODO[what] + ' 面板未复刻' : ''))
}

// HUD 里 TextField 的中文字形落不到墨: UI_hud.swf 的 DefineFont2 只按设计期文本做了子集,
// 我们换上去的「小赛尔 / 监狱 / 精灵名」不在子集里 → 只有 ASCII (Lv1 / 5000 / 728/728) 有墨。
// 所以 HudRunner 每次 flushTexts 把舞台坐标报过来 (hudTexts), 含非 ASCII 的那几条在 #hudtxt 补描。
// 位置/字号取自 TextField 自己的包围盒, 不动版面上的任何东西。
function drawHudTexts(list) {
  hctx.clearRect(0, 0, 1200, 660)
  for (const s of list || []) {
    const splt = s.split('|')
    if (splt.length < 5) continue
    const [key, x, y, box] = splt
    const text = splt.slice(4).join('|')
    if (!/[^\x00-\x7f]/.test(text)) continue            // ASCII 那几条 SWF 自己画得出, 别描两遍
    const hm = /^(\d+)x(\d+)$/.exec(box || '') || []
    const size = Math.max(11, (Number(hm[2]) || 16) - 4)
    hctx.font = (key === 'mapTitle' ? 'bold ' : '') + size + 'px system-ui,sans-serif'
    hctx.textAlign = 'left'
    hctx.textBaseline = 'top'
    if (key === 'mapTitle') {                            // 地图名压在场景上, 沿用原版 LabelRenderer 的五遍描边
      hctx.fillStyle = '#1b2733'
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) hctx.fillText(text, Number(x) + dx, Number(y) + 1 + dy)
    }
    hctx.fillStyle = key.startsWith('petName') ? '#ffe066' : '#ffffff'
    hctx.fillText(text, Number(x), Number(y) + 1)
  }
}

function updateHint() {
  const d = M.info || {}
  const dex = A ? ` · 图鉴 ${Object.values(A.state.dex || {}).filter(x => x.caught).length} 抓到` : ''
  document.getElementById('hint').textContent =
    `${M.map ? M.map.name + ' · ' : ''}地图就绪 · ${Math.round(d.mapW) || '?'}x${Math.round(d.mapH) || '?'} · `
    + `${d.freeRoam ? '整图可走（栅格极性存疑，仅作调试叠加）' : '正在解析 path_mc…'} · ${M.spots.length} 个传送点 · `
    + `${(M.npcs || []).filter(n => n.wild).length} 只野怪 · 点击地面行走, 点击野怪开战${dex}`
}

async function onMessage(e) {
  const d = e.data || {}
  const t = String(d.type || '')
  if (!d.type || (!t.startsWith('map') && !t.startsWith('hud') && !t.startsWith('bag') && !t.startsWith('petBag')) || d.instanceId !== 'map') return
  if (d.type === 'hudBind') { logLine(`HUD ${d.ok ? '✓' : '✗'} ${d.info}`); if (d.ok) pushHud(); return }
  if (d.type === 'hudClick') { onHudClick(d.what); return }
  if (d.type === 'bagBind') { logLine(`背包 ${d.ok ? '✓' : '✗'} ${d.info}`); return }
  if (d.type === 'bagInfo') { logLine(`背包 ${d.tab} · 第 ${d.page} 页 · ${d.shown} 件`); return }
  if (d.type === 'bagTip') { showBagTip(d); return }
  if (d.type === 'bagUse') { useItem(Number(d.id), String(d.name)); return }
  if (d.type === 'petBagBind') { logLine(`精灵背包 ${d.ok ? '✓' : '✗'} ${d.info}`); return }
  if (d.type === 'petBagInfo') { logLine(`精灵背包 ${d.tab} · 第 ${d.page} 页 · ${d.pets} 只`); return }
  if (d.type === 'petBagTip') { showPetTip(d); return }
  if (d.type === 'petBagSelect') { logLine(`选中精灵 ${d.name} Lv${d.level} (${d.zone} · swfId ${d.swfId})`); return }
  if (d.type === 'petBagTodo') { logLine(`精灵背包按钮 ${d.name} 未接`); return }
  if (d.type === 'hudTexts') { M.hudTexts = d.list || []; drawHudTexts(M.hudTexts); return }
  if (d.type === 'hudRetract') { logLine(`HUD 收起 ${d.panel} = ${d.hidden}`); return }
  if (d.type === 'mapReady') {
    M.info = d
    // ★M9：puppet 位 = 逐帧走位的初始化 —— 记住提线开关 + 舞台尺寸 + 出生位，本地钳位算初始相机；此后 JS 是唯一位置源。
    M.puppet = !!d.puppet
    if (M.puppet) {
      M.swfStage = { sw: d.sw || 0, sh: d.sh || 0 }
      M.pos = { x: d.x, y: d.y }
      M.walkTarget = null; M.wantWalk = false
      const c0 = puppetCam(d.x, d.y); M.cam.x = c0.x; M.cam.y = c0.y
      if (ov) draw()
      // ★M9：puppet 叠层常开 ⇒ 部件计划必须就绪（裸装 = 小赛尔默认件）；`enterSwfMode` 已兜首次，这里补 worldLoad/回图等**不经它的入口**。
      if (!LOOK || !LOOK.ready) syncLook().catch(e => logLine('外观计划装载失败（puppet）: ' + e.message))
    }
    updateHint()
    refreshHud()                    // 换图后地图名要跟着走 (重启线 DOM HUD / as3 线 SWF MapTitlePanel)
    if (!d.freeRoam) sendWalkGrid()
  }
  if (d.type === 'mapWorld') { M.spots = d.spots || []; draw(); return }
  // ★MDB11：`mapWild` / `mapPets` / `mapWildFight` 三个消费端**随合成野怪表一起退役**
  //   （`wild: ''` ⇒ AS3 一只 `WildPet` 都不生成；它仍会回报一次 `mapWild{count:0}`，此处无人认领 ⇒ 静默忽略，`onMessage` 无兜底日志）。
  if (d.type === 'mapFail') { await restoreAfterFail(d.url); return }
  if (d.type === 'mapEnter') { gotoMap(d.target, true); return }
  if (d.type === 'mapGridNative') { logLine(`原版 extractPath (BitmapData.draw): 可走 ${d.walkable}/${d.total} = ${(d.walkable * 100 / d.total).toFixed(1)}%`); return }
  if (d.type === 'mapGrid') {
    logLine(`✓ 可走栅格 ${d.gw}x${d.gh} cell=${d.cell} 阻挡 ${(d.ratio * 100).toFixed(1)}%`)
    draw()
  }
  if (d.type === 'mapState') {
    // ★M9-c（人类 2026-10-20 拍板 A·退役）：puppet 是唯一 SWF 通路 —— 只吃**相机校准**（camX/camY，每 6 帧一报，
    //   兜住舞台尺寸假设/resize 漂移）；位置/moving 由 JS 逐帧自给，**绝不**被 4Hz 回报覆写。旧链（puppet=0）消费已删。
    if (M.puppet) { M.cam.x = d.camX; M.cam.y = d.camY; draw(); return }
  }
  // ★M9-c（A·退役）：`mapWalk`/`mapArrive` 是旧链（AS3 内部走位）的回报，puppet 恒真后 AS3 不再发 ⇒ 两个消费端一并退役。
  // ★M9 puppet 协议（AS3 上报意图、JS 逐帧执行）：地面点击 = 走位目标 + 光口判定（照抄 JS 路 spotAt 圆 HOT_R=26）；野怪请求 = 走到脚下、到站 walkReached 触发开战
  if (d.type === 'mapClickWant') {
    if (!M.puppet || !M.pos) return
    let hit = null, bd = Infinity
    for (const s of M.spots) { const dd = Math.hypot(d.x - s.x, d.y - s.y); if (dd <= 26 && dd < bd) { bd = dd; hit = s } }
    M.wantWalk = false
    M.walkTarget = { x: hit ? hit.x : d.x, y: hit ? hit.y : d.y, hit }
    logLine(`→ 提线走 (${Math.round(M.walkTarget.x)},${Math.round(M.walkTarget.y)})${hit ? ' ⤷ 传送目标 ' + nameOf(hit.target) : ''}`)
    startJsLoop()
    return
  }
  if (d.type === 'mapWantWalk') {
    if (!M.puppet || !M.pos) return
    M.wantWalk = true
    M.walkTarget = { x: d.x, y: d.y, hit: null }
    logLine(`→ 提线走·野怪召唤 (${Math.round(d.x)},${Math.round(d.y)})`)
    startJsLoop()
    return
  }
  if (d.type === 'mapLog') logLine(`! ${d.msg}`)
}

async function sendWalkGrid() {
  try {
    const swfshape = await import('/game/swfshape.mjs')
    const swf = await swfshape.fetchSwf(M.mapUrl)
    const w = swfshape.walkGridOf(swf, 10)
    M.grid = w
    M.player.setWalkGrid(w.ox, w.oy, w.cell, w.gw, w.gh, w.ascii)
    logLine(`解析 path_mc: ${w.contours} 轮廓 / ${w.segments} 段 → ${w.gw}x${w.gh} 栅格`)
    draw()
  } catch (e) { logLine('栅格解析失败: ' + e.message) }
}

// 覆盖层: 绿=可走, 红=阻挡 (按相机偏移对齐舞台)
function draw() {
  octx.clearRect(0, 0, ov.width, ov.height)
  const g = M.grid
  if (g && showGrid) {
    octx.save(); octx.translate(M.cam.x + g.ox, M.cam.y + g.oy)
    for (let j = 0; j < g.gh; j++) for (let i = 0; i < g.gw; i++) {
      octx.fillStyle = g.ascii[j * g.gw + i] === '1' ? 'rgba(230,60,60,.34)' : 'rgba(60,230,140,.22)'
      octx.fillRect(i * g.cell, j * g.cell, g.cell, g.cell)
    }
    octx.restore()
  }
  if (M.pos) {
    // ★A2b/M8-b：JS 路且外观计划就绪时画原版小赛尔；计划未就绪 ⇒ 仍黄点顶到位，syncLook() 装完再 draw() 补机器人。
    // ★M9-c（A·退役）：SWF 路 = puppet 唯一通路，角色**一律 canvas**（黄点只剩「计划未就绪/绘制失败」的顶到位，不再是外观基线）。
    let drewActor = false
    if (canDrawActor()) {
      const p = { x: M.cam.x + M.pos.x, y: M.cam.y + M.pos.y }
      drewActor = drawActor(octx, p.x, p.y, M.jsMode ? ACTOR_SCALE : LOOK_SCALE, M.jsMode ? 0 : LOOK_DY)
    }
    if (!drewActor) {
      octx.fillStyle = '#ffe066'
      octx.beginPath(); octx.arc(M.cam.x + M.pos.x, M.cam.y + M.pos.y, 4, 0, 7); octx.fill()
    }
  }
  // 传送点热区: 青色圈 + 出口名 (半透明判定半径 = MapRunner.HOT_R)
  // ⚠️ 已收进「显示可走栅格」这个调试开关: 光口美术 (#portal) + 悬浮说明 (#prompt) 才是常态表现,
  //    调试圈留着只为核对判定半径与配准点 (判定仍走 MapRunner.spotAt 的圆, 与这里的圈同源)。
  if (showGrid) for (const s of M.spots) {
    const x = M.cam.x + s.x, y = M.cam.y + s.y
    octx.strokeStyle = 'rgba(90,220,255,.55)'; octx.lineWidth = 1
    octx.beginPath(); octx.arc(x, y, 26, 0, 7); octx.stroke()
    octx.fillStyle = 'rgba(90,220,255,.9)'; octx.font = 'bold 14px system-ui'
    octx.beginPath(); octx.arc(x, y, 7, 0, 7); octx.fill()
    octx.strokeStyle = '#5adcff'
    octx.beginPath(); octx.moveTo(x - 3, y); octx.lineTo(x + 3, y); octx.moveTo(x + 1, y - 3); octx.lineTo(x + 3, y); octx.lineTo(x + 1, y + 3); octx.stroke()
    octx.fillStyle = '#bdeaff'; octx.font = '12px system-ui'
    octx.fillText('⇒ ' + s.label, x + 12, y - 10)
  }
  // ★B3（含 §7.1 SWF-路扩展）：**JS 路 + SWF 路都投 NPC**（每只 **active** 且 `pos` 合法的 NPC）：
  //   有真图且已加载 ⇒ 投进 `M.npcHit`（由 `drawNpcs()` 画到 `#npc` 层的真 sprite）；
  //   `none`（无图源）/ 在装 / 失败 ⇒ 退回 `M.npcMarkers` **占位橙点**（画在 `#ov`，沿用 MB6 增补，非正式美术）。
  //   坐标 = Unity `pos` 经 `npcOverlayRect()`（JS=bg 矩形 / SWF=`mapReady` 世界界）走 `JS_VIEW.unityToStage`、再 `+M.cam`（与光口同一套换算）；`active===false`（实测 43 条）不画。
  M.npcMarkers = []; M.npcHit = []
  const nRect = npcOverlayRect()
  if (nRect) {
    ensureNpcLayer()
    for (const n of M.npcs) {
      if (n.active === false) continue
      // ★MB9：漫游中的野怪取**实时位**（`_wander.pos`），静态 NPC / SWF 路（无 `_wander`）取原始 `pos`；畸形 pos ⇒ 跳过。
      const p = (n._wander && n._wander.pos) || (n && n.pos)
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue      // 畸形 pos ⇒ 跳过
      const s = JS_VIEW.unityToStage(p.x, p.y, nRect)
      const x = M.cam.x + s.x, y = M.cam.y + s.y
      // ★MDB12：**素材支路顺序** = 帧包优先（判据链 `n.wild` → 形象 id → `pet_appearance_swf.csv` → 包就绪，全在 `petHitOf` 里）
      //   ⇒ 命中项自带 `pack/bitmap/ax/ay/label/pet`；**否则原 PNG 支路逐字节不变**（非 wild / 无 Flash 对应物 / 在装 / 失败都落这里 ⇒ 画面不会空一格）。
      //   顺序要紧：帧包命中时**不去起 PNG 的 fetch**（否则会白拉一张用不到的立绘）。
      const pet = petHitOf(n, x, y)
      if (pet) { M.npcHit.push(pet); continue }
      const url = NPC_ART.npcArtUrl(n)
      const rec = url ? ensureNpcSprite(url) : null
      if (rec && rec.state === 'ok') {
        const sz = NPC_ART.npcSizeInStage(n, nRect)
          || { w: rec.img.naturalWidth * NPC_FALLBACK_SCALE, h: rec.img.naturalHeight * NPC_FALLBACK_SCALE }   // 缺 size ⇒ natural×人眼校常量
        M.npcHit.push({ id: n.id, name: n.name, x, y, w: sz.w, h: sz.h, img: rec.img, nameColor: n.nameColor, namePos: n.namePos,
          // ★MDB13-c：脚标载荷**两条支路都要**（`lvText` 纯吃 `<battle>`/名字、与素材无关）⇒ PNG 野怪同样移到脚下
          wild: !!n.wild, lvText: n.wild ? PET_VIEW.petLabelText(n) : '', mark: n._mark,   // ★MDB13-d：惊讶标记**两条支路都挂**（与素材无关）
          // ★MDB10：气泡负载从 `string` 改成 `{text,image}`（唯一消费者 = `drawNpcs`；命中面不读 `bubble` ⇒ 点击不受影响）
          bubble: n._talk && n._talk.timer > 0 ? { text: n._talk.text, image: n._talk.image } : null })
      } else {
        M.npcMarkers.push({ id: n.id, name: n.name, x, y })
      }
    }
  }
  drawNpcs()
  // 占位橙点（仅 `M.npcMarkers`：none/在装/失败者）——画在 `#ov`（有真图者已走 `#npc`，不重叠）。
  for (const m of M.npcMarkers) {
    octx.fillStyle = 'rgba(255,150,60,.95)'
    octx.beginPath(); octx.arc(m.x, m.y, 9, 0, 7); octx.fill()
    octx.lineWidth = 2; octx.strokeStyle = '#fff'
    octx.beginPath(); octx.arc(m.x, m.y, 9, 0, 7); octx.stroke()
    octx.fillStyle = '#ffd9b3'; octx.font = 'bold 12px system-ui'
    octx.fillText(String(m.name || ('NPC#' + m.id)), m.x + 12, m.y - 8)
  }
  drawPortals()
}

// 传送点光口 (#portal): 每个出口画一份 teleport.png, 按相机偏移贴到舞台上 (与 #ov 同一套 camX/camY)。
function drawPortals() {
  if (!pctx) return
  pctx.clearRect(0, 0, portalEl.width, portalEl.height)
  const img = portalImg
  if (!img || !img.complete || !img.naturalWidth) return          // 图还没到: 等 onload 自己再画一次
  pctx.globalAlpha = PORTAL_ALPHA
  for (const s of M.spots) pctx.drawImage(img, M.cam.x + s.x + PORTAL_OX, M.cam.y + s.y + PORTAL_OY, PORTAL_W, PORTAL_H)
  pctx.globalAlpha = 1
}

// ★B3：NPC 真 sprite —— 素材按 URL 缓存（仿 `LOOK_PARTS`/`portalImg`：跨图/跨卸载复用，**地图线"不缓存"只针对地图**）。
/**
 * 取/起一张 NPC sprite：缓存命中即返 `{state,img}`；缺 ⇒ 建 `new Image()` 后台装载，`onload/onerror` 后**gen 守卫**重绘（仿 `loadLookAsset`）。
 * ⚠️ `onerror`（404）⇒ `state='err'`、L4 退回占位橙点（`§0` 铁律 4：不伪造）；实测 584 条真图 0 缺盘，`err` 只在 dev 路径异常时出现。
 */
function ensureNpcSprite(url) {
  let rec = NPC_CACHE.get(url)
  if (rec) return rec
  rec = { state: 'loading', img: null }
  NPC_CACHE.set(url, rec)
  const gen = npcGen
  const img = new Image()
  img.onload = () => { rec.img = img; rec.state = 'ok'; if (M.jsMode && gen === npcGen) draw() }
  img.onerror = () => { rec.state = 'err'; logLine('NPC 素材缺图（走占位）: ' + url); if (M.jsMode && gen === npcGen) draw() }
  img.src = url
  return rec
}

/**
 * ★MDB12：取/起一个**野怪帧包**（`/swf/pet/normal/<swfId>.swf`）：`fetch` → `ACTOR_VIEW.parsePack` → `createImageBitmap`。
 * 形状照 `ensureNpcSprite`/`ensureTalkSprite` = `{state,pack,bitmap}` + `npcGen` 竞态守卫 + 装载完补画一次。
 * ⚠️ 与 `ensureNpcSprite` 的唯一差别 = 到位后**两条路都补画**（SWF 路没有怪挪动时不重绘 ⇒ 不补画就永远不露脸）。
 * ⚠️ 失败（404 / 解析抛）⇒ `state='err'` + **每 id 一行日志**，该野怪退回**重启 PNG 支路**（`AGENTS §4.19`：不伪造、不留白）。
 */
function ensurePetPack(swfId) {
  const key = Number(swfId)
  let rec = PET_CACHE.get(key)
  if (rec) return rec
  rec = { state: 'loading', pack: null, bitmap: null }
  PET_CACHE.set(key, rec)
  const gen = npcGen
  const url = '/swf/pet/normal/' + key + '.swf'
  const again = () => { if (gen === npcGen) draw() }
  fetch(url)
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer() })
    .then((buf) => {
      const pack = ACTOR_VIEW.parsePack(new Uint8Array(buf))
      return createImageBitmap(new Blob([pack.png], { type: 'image/png' }))
        .then((bitmap) => { rec.pack = pack; rec.bitmap = bitmap; rec.state = 'ok' })
    })
    .then(again)
    .catch((e) => { rec.state = 'err'; logLookOnce('petpack:' + key, '野怪帧包不可用（退重启 PNG）: ' + url + ' — ' + e.message); again() })
  return rec
}

/**
 * ★MDB13-a：同步取/起一个**共享裸装包**（`UI_ActorShadow` 阴影、`UI_SurpriseMark` 惊讶 = 上游野怪借的两张，都在 `game/data/actor/*.bin`）。
 * 装载**复用 M8 的 `loadLookAsset`**（`source:'naked'` ⇒ 不需要装备清单），键与玩家角色**同一份** `LOOK_PARTS`
 *   ⇒ 角色已经装过阴影包时野怪**零额外 fetch**；没装过 ⇒ 后台起一次、`npcGen` 守卫后补画。
 * ⚠️ 未就绪 ⇒ `null`（这帧不画该特效、不伪造）；失败 ⇒ 每包**一行日志**且**不再重试**（`LOOK_SHARED_STARTED`，防 `draw()` 刷屏/狂拉 fetch）。
 */
function lookSharedOf(packName) {
  const desc = { source: 'naked', pack: packName, suffix: '' }
  const hit = LOOK_PARTS.get(assetKeyOf(desc))
  if (hit) return hit
  if (!LOOK_SHARED_STARTED.has(packName)) {
    LOOK_SHARED_STARTED.add(packName)
    const gen = npcGen
    loadLookAsset(desc, null)
      .then(() => { if (gen === npcGen) draw() })
      .catch((e) => { logLookOnce('shared:' + packName, `野怪共享素材不可用（该特效不出）: ${packName} — ${e.message}`) })
  }
  return null
}

/**
 * ★MDB13-a：把阴影包的 `local` 首帧**一次性**压成黑色剪影（上游 = `ColorTransform(0,0,0,.45)`；canvas 侧**逐帧** `ctx.filter` 太贵 ⇒ 离屏预渲染一张、82 包共用）。
 * 产物缓在共享包条目上（跨图复用）；`dx/dy` = 上游 `addShadow:185-186` 的 `ox-anchorX / oy-anchorY`（**不乘 scale**，与上游同式，走 L1 `petDrawShift`）。
 */
function shadowSilhouette(entry) {
  if (!entry) return null
  if (entry.sil !== undefined) return entry.sil
  const rec = ACTOR_VIEW.pickFrame(entry.pack, ACTOR_VIEW.localShadowFrame(entry.pack))
  if (!rec || rec.w <= 1 || rec.h <= 1) { entry.sil = null; return null }
  const r = ACTOR_VIEW.frameRect(entry.pack, rec)
  const c = document.createElement('canvas')
  c.width = r.sw; c.height = r.sh
  const g = c.getContext('2d')
  g.drawImage(entry.bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = '#000'
  g.fillRect(0, 0, r.sw, r.sh)
  const d = PET_VIEW.petDrawShift(entry.pack, rec)
  entry.sil = { img: c, w: rec.w, h: rec.h, dx: d.dx, dy: d.dy }
  return entry.sil
}

/**
 * ★MDB13-a：画一只**帧包野怪**脚下的阴影 = 上游 `addShadow` 的 canvas 等价式。
 * ⚠️ **只给帧包支路**（PNG 支路的尺寸来自重启 `@size`、锚点不同族 ⇒ 不硬套，`AGENTS §4.19` 的"不做"里这条保留）。
 * ⚠️ 调用点在 `drawPetFrame` **之前**、且**在 `flip` 变换之外**（上游阴影不镜像：`addChildAt(shadow,0)` + `scale=frameW/40`，没有 `scaleX=flip` 那一步）。
 */
function drawPetShadow(ctx, h) {
  const sil = shadowSilhouette(lookSharedOf('UI_ActorShadow'))
  if (!sil) return
  const s = PET_VIEW.petShadowScale(h.pack)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.scale(s, s)
  ctx.globalAlpha = SHADOW_ALPHA
  ctx.drawImage(sil.img, sil.dx, sil.dy, sil.w, sil.h)
  ctx.restore()
}

/**
 * ★MDB13-d：惊讶标记的**当前帧号**（上游 `update:279-284` 的 `++markIdx`，越界即 `recycleMark`）：`ms` → `1 + ⌊ms·FPS/1000⌋`。
 * ⚠️ 本件**只出换算**，帧推进/收尾在 `stepMarkLoop`（每个 `_mark` 自带 `frames` = 装载时从包读取的总帧数 ⇒ 不猜）。
 */
const markFrameOf = (ms) => 1 + Math.floor((Math.max(0, ms) * PET_MARK_FPS) / 1000)

/**
 * ★MDB13-d：画一只野怪头顶的「!」= 上游 `WildPet.as:231-238 drawMark` 的 canvas 等价（**不镜像、不缩放、原生像素**，
 *   顶边基准 `petMarkTop(height)`、偏移走 L1 `petDrawShift`）。素材未就绪 ⇒ 不画（`lookSharedOf` 已打过一行日志）。
 * `height` = 该支路的**实际显示高度**（帧包项 = 包帧格高 `h.h`、PNG 项 = 缩放宽 `h.h`）⇒ 两条支路都能挂（拍板范围 = 全部野怪）。
 */
function drawPetMark(ctx, h) {
  if (!h.mark) return
  const entry = lookSharedOf('UI_SurpriseMark')
  if (!entry) return
  const rec = ACTOR_VIEW.pickFrame(entry.pack, Math.min(markFrameOf(h.mark.ms), h.mark.frames))
  if (!rec || rec.w <= 1 || rec.h <= 1) return
  const r = ACTOR_VIEW.frameRect(entry.pack, rec)
  const d = PET_VIEW.petDrawShift(entry.pack, rec)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.drawImage(entry.bitmap, r.sx, r.sy, r.sw, r.sh, d.dx, PET_VIEW.petMarkTop(h.h) + d.dy, rec.w, rec.h)
  ctx.restore()
}

/**
 * ★MDB13-d（人类拍板 ①「点了**先播完**再开战」）：野怪点击的唯一入口 = **起惊讶标记 + 吞重复点**，开战推迟到 `stepMarkLoop` 播完末帧。
 * 语义照上游 `onClick:204-212`（`frozen=true` + `stopAction()` 站定 + `playSurpriseEffect()`）—— 但**不复刻** `actorMoveClose:248-254`
 *   的"叫角色走过来 ±20px 取点"（我们的点击一直是"点了就打"，本批只加特效；要复刻走过去 = 另开一批，`AGENTS §4.19`）。
 * ⚠️ **非野怪 NPC 逐字节不变**（直接 `onNpcClick`）；⚠️ 惊讶素材未就绪 ⇒ **不播也不延迟**（不伪造一段空等）。
 * ⚠️ 站定 = 清掉它的漫游态目标（上游 `stopAction` 的 `walking=false`）⇒ `w.phase` 归 `idle`，怪停在原地。
 */
function petClick(id) {
  const n = M.npcById && M.npcById[String(id)]
  if (!n || !n.wild) { onNpcClick(id, 'click'); return }
  if (n._frozen) return                                     // 吞重复点（上游 `frozen` + `stopImmediatePropagation`）
  const entry = lookSharedOf('UI_SurpriseMark')
  if (!entry || !(entry.pack.totalFrames > 0)) { onNpcClick(id, 'click'); return }
  n._frozen = true
  n._mark = { ms: 0, frames: entry.pack.totalFrames }
  if (n._wander) n._wander.phase = 'idle'
  startMarkLoop()
  draw()
}

/**
 * ★MDB13-d：**惊讶标记环**（独立 rAF、自起自停，形状照 `startTalkLoop`）。存在的理由 = 它同时是**开战的延迟闸**，
 *   而漫游环只在图里有漫游者时才转（`mode="stationary"` 3 只 + PNG 支路的野怪也得能播）。
 * 收尾：末帧之后 ⇒ 摘 `mark`/`frozen` ⇒ **这时才** `onNpcClick`（走同一台 `resolve→run → startMapBattle`，不另开通路）。
 * ⚠️ 取消 = `stopMarkLoop()`（`leaveJsMode()` 调、`unmount()` 经它调）⇒ **不留**"过 0.8s 自己跳进战斗"的挂账；
 *   停环时**必须同时摘掉** `mark`/`frozen`，否则那只怪会永久吞点击（`petClick` 的 `n._frozen` 闸在前、环却已不再推进）。
 */
function startMarkLoop() {
  if (markRaf) return
  markLastTs = 0
  markRaf = requestAnimationFrame(stepMarkLoop)
}
function stopMarkLoop() {
  if (markRaf) cancelAnimationFrame(markRaf)
  markRaf = 0
  markLastTs = 0
  for (const n of M.npcs) { if (n._mark || n._frozen) { n._mark = null; n._frozen = false } }
}
function stepMarkLoop(ts) {
  markRaf = 0
  const dt = markLastTs ? Math.min(100, ts - markLastTs) : 16     // 切后台回来夹上限（与漫游/气泡环同口径）
  markLastTs = ts
  let any = false, changed = false
  const fire = []
  for (const n of M.npcs) {
    const mk = n._mark
    if (!mk) continue
    any = true
    const before = markFrameOf(mk.ms)
    mk.ms += dt
    const f = markFrameOf(mk.ms)
    if (f > mk.frames) {                                          // 上游 `recycleMark:241-245` ⇒ 摘掉 + 交还交互（`openInteraction`）
      n._mark = null; n._frozen = false
      fire.push(n.id)
    } else if (f !== before) changed = true
  }
  if (changed || fire.length) draw()                              // SWF 路"换帧才重绘"的同一套省烧法
  if (any) markRaf = requestAnimationFrame(stepMarkLoop)          // 本轮全播完 ⇒ 下一轮 `any=false` 自然自停（不空跑）
  for (const id of fire) onNpcClick(id, 'click')                   // 播完 ⇒ 才开战（**排期在触发之前**：`onNpcClick` 会导航→卸载→`stopMarkLoop`，反过来会把环重新点亮）
}

/**
 * ★MDB12：一只**野怪**的帧包命中项（`M.npcHit` 的一项）；不该走帧包路 ⇒ `null`（交回 PNG 支路）。
 * 判据链 = `n.wild` → 形象 id（`NPC_ART.petAppearanceId`）→ `swf` 序号（**L2 唯一入口** `CONTENT.swfIdOf`，不在桥表 = `null`）→ 包已就绪。
 * 动画态 = `n._pet = {tick, acc, flip, up}`（**L4 私有装饰**，与 `_wander`/`_talk` 同列；`_wander` 是 L1 纯态、不往里塞画的东西）。
 * ⚠️ 朝向照上游「**最后一次方向保持**」（`WildPet.as:329-331`）⇒ 近零增量不改判据。
 * ⚠️ 我们的坐标是 **Unity y 向上**（AS3 舞台 y 向下）⇒ `up = dy > 0` 是 AS3 `dy < -1` 的等价式；左右只靠镜像（上游只有上下两套包）。
 */
function petHitOf(n, x, y) {
  if (!n.wild) return null
  const app = NPC_ART.petAppearanceId(n)
  if (app == null) return null
  const seq = CONTENT.swfIdOf(app)
  if (!seq) return null                                     // 无 Flash 对应物（实测 15 种 / 30 只 / 15 图）⇒ 退重启 PNG
  const rec = ensurePetPack(seq)
  if (rec.state !== 'ok') return null                        // 在装 / 失败 ⇒ 这帧先按 PNG 画（包到位会自己补画）
  const hit = PET_VIEW.petHitRect(rec.pack)
  if (!hit) return null
  if (!n._pet) n._pet = { tick: 0, acc: 0, flip: 1, up: false, pRange: null, pStart: -1, wasMoving: false }
  const p = n._pet
  const w = n._wander
  const moving = !!w && w.phase === 'move'
  if (w && moving) {
    const dx = w.target.x - w.pos.x
    const dy = w.target.y - w.pos.y
    if (dy > 0.01) p.up = true; else if (dy < -0.01) p.up = false
    if (dx > 0.01) p.flip = 1; else if (dx < -0.01) p.flip = -1
  }
  // ★MDB13-b：`personal`（待机小动作）= **每次驻停播一次**（人类拍板 ③；上游是"久站才播" `checkIdleState:293-299` ⇒ **有意偏离**、如实登记）。
  //   触发 = `moving` 由真变假那一帧；再开走 ⇒ 立刻**打断**（上游 `stopAction:214-220` 的 `personaling=false` 同语义）。
  //   帧号照 `p.tick`（★同一个 `PET_FPS` 累加器、**不另开时钟**）⇒ `pStart` 记起点，`tick-pStart` = 本段第几格。
  if (moving) { p.pRange = null; p.pStart = -1 }
  else if (p.wasMoving) { const pr = PET_VIEW.personalRange(rec.pack); if (pr) { p.pRange = pr; p.pStart = p.tick } }   // 缺 `personal`/`free` ⇒ 不播（不兜底成走路）
  p.wasMoving = moving
  return {
    id: n.id, name: n.name, x, y, w: hit.w, h: hit.h, ax: hit.ax, ay: hit.ay,
    pack: rec.pack, bitmap: rec.bitmap, label: PET_VIEW.petAction(moving, p.up), pet: p,
    wild: true, lvText: PET_VIEW.petLabelText(n), mark: n._mark,   // ★MDB13-c：`lvText` = 脚下脚标（头顶名不再画）；⚠️ 与动画标签 `label` 是两回事，别撞名。★MDB13-d：`mark` = 惊讶标记态
    nameColor: n.nameColor, namePos: n.namePos,
    bubble: n._talk && n._talk.timer > 0 ? { text: n._talk.text, image: n._talk.image } : null,
  }
}

/**
 * ★MDB12：把一个帧包的**当前帧**画到 `#npc` 层 = `WildPet.as:337-348 render` 的 canvas 等价式
 * （锚点 `(anchorX,anchorY)` 钉在野怪位置点、原生像素、`flip` 用 `translate+scale` 做整体水平镜像）。
 * ⚠️ 1×1「隐藏」裁帧 ⇒ 不画（`actor-view.js:96` 同口径）；帧号/区间取不到 ⇒ 也不画（不抛、不伪造）。
 */
function drawPetFrame(ctx, h) {
  let f = null
  if (h.pet.pRange) {                                     // ★MDB13-b：驻停小动作 = 播**一遍**（不循环、夹 `PERSONAL_MAX`）；末帧即摘 ⇒ 下一格回站立循环（照上游 `update:283-286`）
    const one = PET_VIEW.petFrameOnce(h.pet.pRange, h.pet.tick - h.pet.pStart, PERSONAL_MAX)
    if (one) f = one.frame
    if (!one || one.done) { h.pet.pRange = null; h.pet.pStart = -1 }
  }
  if (f == null) f = PET_VIEW.petFrame(h.pack, h.label, h.pet.tick)
  const rec = ACTOR_VIEW.pickFrame(h.pack, f)
  if (!rec || rec.w <= 1 || rec.h <= 1) return
  const s = ACTOR_VIEW.frameRect(h.pack, rec)
  const d = PET_VIEW.petDrawShift(h.pack, rec)
  ctx.save()
  ctx.translate(h.x, h.y)
  ctx.scale(h.pet.flip, 1)
  ctx.drawImage(h.bitmap, s.sx, s.sy, s.sw, s.sh, d.dx, d.dy, rec.w, rec.h)
  ctx.restore()
}

/** 把 `M.npcHit` 的真 sprite 画到 `#npc` 层 + 头顶**中文名字**（BCQ2·A：canvas 直书、不受 SWF 字体子集限制）；`npctx` 为 null（层未建）⇒ 直接退。
 * ★MDB12：一个数组**两种素材支路** ⇒ 锚点**每项自带** `ax/ay`（帧包项 = 包锚点 `anchorX/frameW`、`NPC_ANCHOR` 只服务 PNG 项）；
 *   名字/气泡的几何（顶边 `y-ay*h`、中心 `x-ax*h+w/2`）**两条支路共用**，不另开一套。 */
function drawNpcs() {
  if (!npctx) return
  npctx.clearRect(0, 0, npcEl.width, npcEl.height)
  const anch = NPC_ART.NPC_ANCHOR
  npctx.textAlign = 'center'
  npctx.textBaseline = 'bottom'
  // ★MDB10：**两遍绘制** —— 第一遍全部 sprite + 名字，第二遍全部气泡 ⇒ 顺带修掉一条旧毛病：
  //   单遍时"后画的邻居 sprite 盖掉前一只已画的气泡"（MB9 文本气泡今天就有这现象）。
  for (const h of M.npcHit) {
    const ax = h.ax ?? anch.ax, ay = h.ay ?? anch.ay
    if (h.pack) { drawPetShadow(npctx, h); drawPetFrame(npctx, h) }                          // ★MDB12：帧包项 = 锚点钉位 + 原生像素 + `flip` 镜像（`drawPetFrame`）；★MDB13-a：先铺脚下阴影（在镜像之外）
    else npctx.drawImage(h.img, h.x - ax * h.w, h.y - ay * h.h, h.w, h.h)
    if (h.mark) drawPetMark(npctx, h)                             // ★MDB13-d：头顶「!」（画在 sprite 之上、气泡之下；上游 `mark` 也是挂在容器末位）
    const cx = h.x - ax * h.w + h.w / 2               // 精灵几何中心 x（pos=左下角：上游 pivot=(0,0)）
    // ★MDB13-c（人类拍板 ②「整串移到脚下、撤头顶名」）：野怪**不画头顶名**，改画脚下 `Lv13 奇鲁`
    //   = 上游 `SpawnedPet` 的 `"Lv"+level+" "+name` + `UNDER_FEET`（金字 `#CC9900` + 白描边）；文本已在 L1 剥过名字里的 `Lv` 前缀。
    //   ⚠️ **非野怪 NPC 的头顶名逐字节不变**；⚠️ 气泡基线**本来就挂在 sprite 顶边**（不依赖名字）⇒ 撤名不影响气泡位置。
    if (h.wild) {
      const t = String(h.lvText || '')
      if (!t) continue
      npctx.font = 'bold 12px system-ui,sans-serif'
      npctx.lineWidth = LV_LBL_LW; npctx.strokeStyle = '#fff'
      const by = h.y - ay * h.h + h.h + LV_LBL_DY
      npctx.strokeText(t, cx, by)
      npctx.fillStyle = LV_LBL_COLOR
      npctx.fillText(t, cx, by)
      continue
    }
    const nm = String(h.name || '')
    if (!nm) continue
    const off = npcVec2(h.namePos)                    // `<npc @namePos>` "x,y" → 头顶文字的微偏移（人眼校项）
    const ny = h.y - ay * h.h - 3 + off.y
    npctx.font = 'bold 12px system-ui,sans-serif'
    npctx.lineWidth = 3; npctx.strokeStyle = 'rgba(0,0,0,.75)'   // 暗底描边：中文立在任意底图上都读得出（同光口出口名思路）
    npctx.strokeText(nm, cx + off.x, ny)
    npctx.fillStyle = npcColorCss(h.nameColor)
    npctx.fillText(nm, cx + off.x, ny)
  }
  for (const h of M.npcHit) {
    if (!h.bubble) continue
    const ax = h.ax ?? anch.ax, ay = h.ay ?? anch.ay
    const off = npcVec2(h.namePos)
    const ny = h.y - ay * h.h - 3 + off.y
    const cx = h.x - ax * h.w + h.w / 2
    if (h.bubble.image) {                             // ★MDB10：`{image}` ⇒ 表情图（上游口径：取不到图**不退回文本**）
      const url = NPC_ART.talkImageUrl(h.bubble.image)
      if (!url) { logLookOnce('talk:bad:' + h.bubble.image, `表情气泡 id 畸形（不出泡）: ${h.bubble.image}`); continue }
      const rec = ensureTalkSprite(url)               // `loading` ⇒ 这帧不出、onload 自己补画；`err` ⇒ 已记一行日志、不出
      if (rec.state === 'ok') drawNpcImageBubble(npctx, cx + off.x, ny - 16, rec.img)
    } else if (h.bubble.text) {
      drawNpcBubble(npctx, cx + off.x, ny - 16, String(h.bubble.text))
    }
  }
}

/**
 * ★MDB10：取/起一张**表情气泡**图（照 `ensureNpcSprite` 的形状：`{state,img}` + `npcGen` 竞态守卫 + 装载完补画一次）。
 * ⚠️ `err`（404）⇒ **不出泡 + 一行日志**（照上游 `TryShowTalk`"取不到图 ⇒ LogWarning、不退回文本"）；
 *   失败的 rec **留在缓存**里 ⇒ 每 URL 只吵一次，不随 `draw()` 刷屏。
 */
function ensureTalkSprite(url) {
  let rec = TALK_CACHE.get(url)
  if (rec) return rec
  rec = { state: 'loading', img: null }
  TALK_CACHE.set(url, rec)
  const gen = npcGen
  const img = new Image()
  img.onload = () => { rec.img = img; rec.state = 'ok'; if (gen === npcGen) draw() }
  img.onerror = () => { rec.state = 'err'; logLine('表情气泡缺图（不出泡）: ' + url); if (gen === npcGen) draw() }
  img.src = url
  return rec
}

/** 野怪头顶的**图像气泡**（MDB10）：复用文本气泡那套圆角框 + 下指小尖，内嵌表情图（原生尺寸、上限 `TALK_EMOJI_MAX` 等比缩、外裹 `padX/padY`）。 */
function drawNpcImageBubble(ctx, cx, bottomY, img) {
  const nw = img.naturalWidth || 32, nh = img.naturalHeight || 32
  const long = Math.max(nw, nh) * TALK_EMOJI_SCALE
  const k = long > TALK_EMOJI_MAX ? TALK_EMOJI_MAX / long : TALK_EMOJI_SCALE   // 只在超上限时缩，否则按原生（人眼不满意就调 `TALK_EMOJI_SCALE`）
  const sw = nw * k, sh = nh * k
  const padX = 7, padY = 7, tail = 5
  const bw = sw + padX * 2, bh = sh + padY * 2
  const bx = cx - bw / 2, by = bottomY - bh - tail
  ctx.fillStyle = 'rgba(20,20,28,.82)'
  roundRectPath(ctx, bx, by, bw, bh, 6); ctx.fill()
  ctx.beginPath()                                        // 下指小尖，对准名字（与文本气泡同一锚）
  ctx.moveTo(cx - tail, by + bh); ctx.lineTo(cx, by + bh + tail); ctx.lineTo(cx + tail, by + bh); ctx.closePath(); ctx.fill()
  ctx.drawImage(img, bx + padX, by + padY, sw, sh)
}

/** 野怪头顶的**文本气泡**（最小自绘，同"本线零像素"口径）：圆角框 + 下指小尖 + 白字暗描边；宽度按量词。超 30 字截断（§8.8 原口径）。 */
function drawNpcBubble(ctx, cx, bottomY, text) {
  const label = text.length > 30 ? text.slice(0, 29) + '…' : text
  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  const tw = ctx.measureText(label).width
  const padX = 7, padY = 4, bh = 18, tail = 5
  const bw = tw + padX * 2
  const bx = cx - bw / 2, by = bottomY - bh - tail
  ctx.fillStyle = 'rgba(20,20,28,.82)'
  roundRectPath(ctx, bx, by, bw, bh, 5); ctx.fill()
  ctx.beginPath()                                        // 下指小尖，对准名字
  ctx.moveTo(cx - tail, by + bh); ctx.lineTo(cx, by + bh + tail); ctx.lineTo(cx + tail, by + bh); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.fillText(label, cx, by + bh - padY - 1)
}

/** 圆角矩形路径（不依赖 `roundRect`，兼容旧浏览器）。 */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** `"R,G,B,A"`（缺省 "0,64,255,255"，A 取 0–255）→ CSS 色；畸形 ⇒ 退回默认蓝（`nameColor` 上游原样串）。 */
function npcColorCss(s) {
  const m = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+))?\s*$/.exec(String(s ?? ''))
  if (!m) return 'rgba(0,64,255,1)'
  const a = m[4] != null ? Math.min(1, Number(m[4]) / 255) : 1
  return `rgba(${m[1]},${m[2]},${m[3]},${a})`
}
/** `"x,y"`（`<npc @namePos>` 缺省 "0,5"）→ `{x,y}`；畸形 ⇒ `{0,0}`。 */
function npcVec2(s) {
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(String(s ?? ''))
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 0, y: 0 }
}

// ── ★B3 SWF-路扩展（impl §7.1，人类 2026-10-19 追认：SWF 图也画 NPC）────────────────
// 盖顶层近似版：JS 路 + SWF 路**共用同一片 `#npc` 叠加层**；换算复用 `unityToStage`/`npcSizeInStage`（同一 flipY）。
// 不碰 `MapRunner.as`：SWF 路的世界界 `mapX/mapY/mapW/mapH` 由 `mapReady` 已回报、滚动相机 `M.cam` 由 `mapState` 已回报，
// 换算与旧的合成野怪脚标 `wx=mapX+fx*mapW`（`MapRunner.as:231`）同源 —— 那条脚标已随 ★MDB11 退役（`setWild("")` ⇒ 不再生成 `WildPet`）。
// 已知缺陷 = 前景遮挡穿帮 / `content_mc` 烘焙怪双绘 = 留后续 B 批。

/** `#npc` 层的**幂等建层**（两种渲染通路都用）：DOM 序插在 `#ov` 之前 ⇒ sprite 压在角色/调试栅格之下、与光口同 z。 */
function ensureNpcLayer() {
  if (npcEl && npctx) return
  const wrap = document.getElementById('wrap')
  if (!wrap) return
  npcEl = document.createElement('canvas')
  npcEl.id = 'npc'; npcEl.width = 1200; npcEl.height = 660
  npcEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none'
  wrap.insertBefore(npcEl, document.getElementById('ov') || wrap.firstChild)
  npctx = npcEl.getContext('2d')
  bindSwfNpcClick(wrap)                        // SWF 路 NPC 点击 capture（JS 路仍走 jsClick 的 bubble）
}

/** 当前该用哪张矩形把 Unity 960×540→像素：JS 路 = bg 绘制矩形（舞台、`M.cam` 恒 0）；SWF 路 = `mapReady` 的世界界（再 `+M.cam`）。缺 ⇒ `null`（不投 NPC）。 */
function npcOverlayRect() {
  if (M.jsMode) return (M.jsView && M.jsView.rect) || null
  const i = M.info
  if (i && Number.isFinite(i.mapW) && Number.isFinite(i.mapH)) return { dx: i.mapX || 0, dy: i.mapY || 0, dw: i.mapW, dh: i.mapH }
  return null
}

let swfNpcClickBound = false
function bindSwfNpcClick(wrap) {
  if (swfNpcClickBound || !wrap) return
  wrap.addEventListener('click', onSwfNpcCapture, true)   // capture：命中 NPC 即在 Ruffle 之前吞掉
  swfNpcClickBound = true
}
/** SWF 路点击：仅**非 JS 路**（JS 路由 `jsClick` 负责）且命中 `M.npcHit` sprite 矩形时 ⇒ `onNpcClick` + `stopPropagation`（不让 MapRunner 走位/穿光口）。不中 ⇒ 什么都不做、事件照常落 Ruffle（走位/光口逐字节不变）。 */
function onSwfNpcCapture(ev) {
  if (ev.target?.closest?.('#rv')) return   // 面板（在 #rv 内）打开时，点击应落面板而非穿透到身后 NPC（与 onStageMove/jsClick 同口径）
  if (M.jsMode || !npctx || !M.npcHit.length || !ov) return
  const r = ov.getBoundingClientRect()
  if (!r.width || !r.height) return
  const mx = (ev.clientX - r.left) * ov.width / r.width
  const my = (ev.clientY - r.top) * ov.height / r.height
  const anch = NPC_ART.NPC_ANCHOR
  let hit = null, bd = Infinity
  for (const s of M.npcHit) {
    // ★MDB12：命中矩形**每项自带** `ax/ay`（帧包项 = 包锚点、照上游 `drawHot` 的整格热区；PNG 项缺省 = `NPC_ANCHOR` 左下角）
    const l = s.x - (s.ax ?? anch.ax) * s.w, t = s.y - (s.ay ?? anch.ay) * s.h
    if (mx >= l && mx <= l + s.w && my >= t && my <= t + s.h) {
      const cx = l + s.w / 2, cy = t + s.h / 2
      const d = Math.hypot(mx - cx, my - cy)              // 重叠取离 sprite 中心最近者
      if (d < bd) { bd = d; hit = s }
    }
  }
  if (!hit) return
  ev.stopPropagation(); if (typeof ev.preventDefault === 'function') ev.preventDefault()
  petClick(hit.id)                                                // ★MDB13-d：SWF 路同一套「先播惊讶、播完才开战」（非野怪 NPC 内部透传 = 行为不变）
}

// 鼠标靠近光口 → 悬浮说明 = 出口名 (重启 InfoPrompt 的血统: 黑底白字 14px, 跟光标 +10,+2)。
// 原版是 TooltipManager.addCommonTip(teleport, this.name); 中文进 DOM 是既定处置 (SWF 字体子集没有 CJK 字形)。
function onStageMove(ev) {
  if (!promptEl) return
  // 面板浮层挡住的地方不出说明 (重启: InfoPrompt 只在 IButton 收到进入事件时才显示, 上面的浮层会挡掉射线)。
  // 我们的面板族按 ui.css 的口径 "容器放行 pointer-events" ⇒ ev.target 落到面板里的真控件上时才算被挡;
  // 落在面板镂空处 = 与重启一样把事件放给下层舞台, 此时照常提示。
  if (ev.target?.closest?.('#rv')) { promptEl.style.display = 'none'; return }
  const r = ov.getBoundingClientRect()
  if (!r.width || !r.height) { promptEl.style.display = 'none'; return }
  const mx = (ev.clientX - r.left) * ov.width / r.width, my = (ev.clientY - r.top) * ov.height / r.height
  const hit = (mx >= 0 && mx <= ov.width && my >= 0 && my <= ov.height)
    ? M.spots.find(s => portalHit(s, mx - M.cam.x, my - M.cam.y))
    : null
  if (!hit || !hit.label) { promptEl.style.display = 'none'; return }
  promptEl.textContent = hit.label
  promptEl.style.display = 'block'
  promptEl.style.left = Math.max(2, Math.min(mx + 10, ov.width - promptEl.offsetWidth - 2)) + 'px'
  promptEl.style.top = Math.max(2, my - 2 - promptEl.offsetHeight) + 'px'
}

// ───────────────── MB5：Unity 记录 / 实体登记 / auto 触发 / 传送决议 ─────────────────
// 真值：`docs/map/map-teleport.md §3.2/§3.3/§3.4`（决议族/落点/昼夜）· `docs/map/map-impl.md §3.5`（MB5 蓝图，D5 过渡期口径）
//       `docs/map/map-npc.md §2.5`（auto = 进图批处理）· `§5 MNI1/MNI5`（词表≠事件 / 先登记后 auto）

/** `"x,y"` → `[x,y]`（changeScene 入参的一次性落点；缺 ⇒ null）。 */
function parseSpawnParam(s) {
  if (!s) return null
  const m = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(String(s))
  return m ? [Number(m[1]), Number(m[2])] : null
}
/** 读一次性落点并**消费即清**（TPQ5：`spawn` 只来自 `changeScene` 入参、不是键袋）。 */
function consumeSpawn() { const s = M.spawn; M.spawn = null; return s }

/** Unity 记录到位后的**表现侧收尾**：`@switch` 越界被收窄成 0（TPC5，如 71）⇒ 登记 + 昼夜按钮刷新。SWF/JS 两路都调它。 */
function finishUnityChrome(u) {
  const swRaw = u && u.switchRaw
  if (swRaw != null && swRaw !== 0 && swRaw !== 1 && swRaw !== -1) logLine('解析登记: invalid-switch: ' + swRaw + '（归 0，昼夜按钮不出现）')
  updateDayNightBtn()
}

/** 现场解析当前图的 Unity 记录（方案 C，不缓存）；存进 `M.unity` 供 spotsOf/落点/昼夜/实体用（与 AS3 画面侧并存，D2/D3）。 */
async function loadUnityInto(as3Rec) {
  const id = String((as3Rec && as3Rec.id != null ? as3Rec.id : document.getElementById('mapSel')?.value) || '')
  // ★A2：`renderMap` 已对本图取过一次 `loadMap` ⇒ 同 id 直接复用（仍**每次进图一次**，不缓存，§4.9），避免二次 fetch。
  let u = (M.unity && String(M.unity.id) === id) ? M.unity : null
  if (!u) { try { u = await CONTENT.loadMap(id) } catch (e) { logLine('Unity 现场解析失败: ' + e) } }
  M.unity = u
  finishUnityChrome(u)
  return u
}

/** 现算道具持有数（`A.state.items` = `{id,count}` 数组；非货币）。缺 A ⇒ `'unknown'`（不是 0，`CSI4`）。 */
function itemCount(id, bag) {
  if (bag === 'yite') return 'unknown'   // yite 袋无运行时存储（实测）⇒ 登记、不伪造
  if (!A) return 'unknown'
  const hit = (A.state.items || []).find((x) => Number(x.id) === id)
  return hit ? Math.max(0, Math.trunc(Number(hit.count) || 0)) : 0
}

/** 读存档 `<activityStorage>` 的平键（`session.data` = GameData，条目 `{id:string, data:[{key,value}]}`；值恒 string）。 */
function activityGet(id, key) {
  const list = (session.data && session.data.activityStorage) || []
  const a = list.find((x) => x && x.id === id)
  if (!a) return undefined
  const e = (a.data || []).find((x) => x && x.key === key)
  return e ? e.value : undefined
}

/** `MapEnv` 的来源拼装（`M-5`：L4 是**唯一**填 `MapEnvSource` 的地方）。缺来源的面（petBag/battle）走 `createMapEnv` 的保守兜底 ⇒ `'unknown'`。 */
function buildMapEnv(unity, npcById) {
  return MAP_HOST.createMapEnv({
    map: MAP_HOST.mapViewOf(unity),
    // ★MNI5：env 的 `sceneData['mapNpcList']` 指向**已登记**的实体表（先登记、后跑 auto）
    sceneData: { get: (k) => (k === 'mapNpcList' ? npcById : undefined) },
    player: { shoot: session.isShootMode ? 1 : 0, achievement: Math.trunc(Number(session.data && session.data.achievement) || 0) },
    // ★MB7（BTI9）：`battle.` 命名空间的读窗口 = 会话里的**上一场快照**（`lastBattle`）。战斗外也注入
    //   （`50004` 那两条对话条件靠它）；无上一场 ⇒ `makeBattleView(null)` ⇒ 一切键 `FLOAT_MIN`（统一 BTC11，无 NRE 面）。
    battleState: makeBattleView(session.lastBattle),
    // ★B1（前缀表变活）：items / activities 从只读兜底接成**真状态** ⇒ 对话 `{expr:item[..].num}`、
    //   条件 A8/A5 当场从 `'unknown'` 变真值。petBag（`firstPet.`/`petBag.`）的宠标识符键集归 **D6**、
    //   本批未就绪 ⇒ **保留 `createMapEnv` 的 `[UNIMPLEMENTED_PET]` 兜底**（不传 ⇒ 一切键 `'unknown'`、如实登记）。
    items: { count: (id, bag) => itemCount(id, bag) },
    activities: { get: (id, key) => activityGet(id, key) },
    // R1 RNG 的精确序列属运行时线；本批给一条会话回填的近似（够 auto 求值 + 观测"每次进图重摇"）
    rng: {
      read: () => Number(readRandom()) || 0,
      consume: () => { const v = Math.floor(Math.random() * 10); writeRandom(v); return v },
      roll: (lo, hi) => Math.floor(lo + Math.random() * ((hi - lo) + 1)),
      emblem: () => false,
    },
    log: { unknown: (why) => logLine('条件 unknown: ' + why) },
  })
}

/**
 * 富文本白名单（`map-dialog.md §3.1`：实测只 `color` / `b` 两种）⇒ 转 DOM：**先整段转义**，再放
 * `<color=#hex>…</color>` → `<span style="color:…">`、`<b>…</b>` → `<b>`。其余标签一律留在转义后的文本里（不解析）。
 * ⚠️ 正式排版仍归 **A3**（`docs/view/mech/view-overlays.md`）；本函数只是**自绘最小框**能让人读到中文 + 不甩出裸标签。
 */
function richToHtml(s) {
  const esc = String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .replace(/&lt;color=#([0-9a-fA-F]{3,8})&gt;/g, '<span style="color:#$1">')
    .replace(/&lt;\/color&gt;/g, '</span>')
    .replace(/&lt;b&gt;/g, '<b>').replace(/&lt;\/b&gt;/g, '</b>')
}

/** 关对话：撤浮层 + 清 `M.dialogNpc`（幂等）。 */
function closeDialogBox() {
  if (dialogEl) { dialogEl.remove(); dialogEl = null }
  M.dialogNpc = null
}

/**
 * 渲染/翻页一屏对话（决策一 A = 本线自绘最小 UI）。选项点击 ⇒ `MAP_DIALOG.clickChoice` 出**全部满足者**的决议
 * （`DLI5` 不短路）⇒ 交**同一台** `resolve→run` 机（于是对话里的 `battle`/`teleport`/`setItem`/`openDialog` 真跑）。
 */
function renderDialogBox(payload) {
  const wrap = document.getElementById('wrap')
  if (!wrap) return
  closeDialogBox()
  const { branch, choices, npcId } = payload
  M.dialogNpc = (M.npcById && M.npcById[String(npcId)]) || null   // 翻页/选项都认这只 NPC
  dialogEl = document.createElement('div')
  dialogEl.id = 'dialog'
  // z 必须压在重启 HUD 宿主 #rv(z=60, ui.css) 与 #prompt(z=70) 之上，否则被底部 HUD 遮挡。
  dialogEl.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:72%;' +
    'max-width:820px;background:rgba(20,24,40,.94);border:2px solid #f5ed69;border-radius:8px;padding:12px 16px;' +
    'color:#fff;font-size:16px;line-height:1.5;z-index:80;box-shadow:0 4px 18px rgba(0,0,0,.5)'
  const head = document.createElement('div')
  head.style.cssText = 'display:flex;align-items:center;gap:10px;color:#f5ed69;font-weight:700;margin-bottom:6px'
  // ★A2：说话人头像（`<branch @icon>` → `npc-art.iconUrl`）；`none`/缺图/畸形 ⇒ `onerror` 直接摘掉、**不伪造占位**（与 B3 占位同口径），只显名字。
  const iconUrl = branch.icon && NPC_ART.iconUrl(branch.icon.resId)
  if (iconUrl) {
    const img = document.createElement('img')
    img.src = iconUrl
    img.alt = ''
    img.style.cssText = 'width:48px;height:48px;object-fit:contain;flex:0 0 auto;background:rgba(255,255,255,.06);border-radius:4px'
    img.onerror = () => img.remove()                                  // 盘上没这张 ⇒ 退化成纯名字
    head.appendChild(img)
  }
  const nameSpan = document.createElement('span')
  nameSpan.textContent = branch.speakerName || ('#' + branch.id)
  head.appendChild(nameSpan)
  const body = document.createElement('div')
  body.style.cssText = 'margin-bottom:10px;white-space:pre-wrap'
  body.innerHTML = richToHtml(branch.contentText)                    // 白名单已在 richToHtml 转义
  dialogEl.appendChild(head); dialogEl.appendChild(body)
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px'
  for (const cv of choices) {
    const btn = document.createElement('button')
    btn.textContent = cv.description || '（空选项）'
    btn.style.cssText = 'cursor:pointer;background:#2b3457;color:#fff;border:1px solid #7e8bd6;border-radius:5px;padding:6px 12px;font-size:15px'
    btn.onclick = async () => {
      const intents = MAP_DIALOG.clickChoice(cv.choice, M.env)       // 点击期全跑不短路（DLI5）
      if (!intents.length) { logLine('对话选项无满足的出路（可见但不可点，DLQ5/unknown 已记）'); return }
      const base = makeRunCtx()
      await MAP_RUN.run(intents, { ...base, npc: M.dialogNpc })       // 同一台机器；openDialog 出路 ⇒ 就地翻页
    }
    row.appendChild(btn)
  }
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '关闭'
  closeBtn.style.cssText = 'cursor:pointer;background:#57303b;color:#fff;border:1px solid #d67e8b;border-radius:5px;padding:6px 12px;font-size:15px'
  closeBtn.onclick = () => closeDialogBox()                          // 测试用显式关闭（背景能否关 = DLQ4，归 A3）
  row.appendChild(closeBtn)
  dialogEl.appendChild(row)
  wrap.appendChild(dialogEl)
  logLine(`对话打开: ${branch.id}（NPC ${npcId}），可见选项 ${choices.length} 个`)
}

/** 一批决议的执行上下文（本批 sinks：`teleport` + ★MB6 `openDialog` + ★MB7 `battle`；其余 ⇒ `no-sink`）。 */
function makeRunCtx() {
  return {
    sinks: {
      // ★M5 决议族在 L4 落地：`mapId==0` ⇒ notOpen（链侧不弹窗，TPQ4）；否则切图（两步走的"抵达"仍由 SWF/`worldLoad` 承担，D5）
      // ★C3·WorldMap：面板与链侧**共用**同一台决议机（runTeleport；面板灰块自己走 onLocked→提示盒 = 故意两条语义，见 worldmap-impl.md §7 WMD5）
      teleport: (intent) => runTeleport(intent.mapId),
      // ★MB6：`openDialog{branch}` —— `branch='close'|'null'` ⇒ 撤浮层；否则就地翻页/打开（`param0` = branch id）
      openDialog: (intent, api) => {
        const npc = (api && api.npc) || M.dialogNpc
        if (!npc) { logLine('openDialog 但无当前 NPC（B3 未上屏 ⇒ 请用 onNpcClick 驱动）'); return }
        const env = (api && api.env) || M.env
        const payload = MAP_DIALOG.openDialog(npc, intent.branch, env, (r, d) => logLine('对话登记: ' + r + (d ? ' — ' + d : '')))
        if (payload.kind === 'close') { closeDialogBox(); return }
        if (payload.kind === 'missing') { logLine('对话翻页目标缺失，保持当前对话: ' + payload.wanted); return }   // DLC3：不关
        renderDialogBox(payload)
      },
      // ★MB7：`battle{branch}` —— 开工三门过 ⇒ 写 battleOrigin + 打单敌遭遇；不过 ⇒ 三门自己出 hint（见下）
      battle: (intent, api) => startMapBattle(intent, api),
      // ★B3（写回半边 · 人类 2026-10-19 拍板 setItem + setActivity 都接）：`setItem{op,items}` ——
      //   `add`/`add_with_hint` ⇒ `A.addItem`；`remove` ⇒ `A.consumeItem`（不足 ⇒ 返回 false、**不扣成负**）；
      //   `add_to_yite`/`remove_from_yite` ⇒ yite 袋无运行时存储 ⇒ **登记、不伪造**。落盘由 runner 收口一次（`MNI8`）。
      setItem: (intent) => {
        if (!A) { logLine('setItem 但无活跃存档（A=null）'); return }
        for (const [id, n] of intent.items || []) {
          if (intent.op === 'add' || intent.op === 'add_with_hint') A.addItem(id, n)
          else if (intent.op === 'remove') { if (!A.consumeItem(id, n)) logLine(`setItem remove 不足: 道具 ${id} ×${n}`) }
          else if (intent.op === 'add_to_yite' || intent.op === 'remove_from_yite') logLine(`setItem ${intent.op} 未接（yite 袋无运行时存储）: 道具 ${id} ×${n}`)
        }
        refreshHud()
        logLine(`setItem ${intent.op}: ${(intent.items || []).map(([i, c]) => i + '×' + c).join(', ') || '（空）'}`)
      },
      // ★B3：`setActivity{id,entries}` —— 逐条写进存档既有的 `<activityStorage>`（`D9`：袋 = 既有字段、不开新键）。
      //   值以 `[expr]` 开头 ⇒ 现剥前缀走 `readMapValue(…, M.env)`（`DLI7`）；取不到 ⇒ 跳过该条 + 登记（**不写半条错的**）。
      //   ⚠️ 写进袋的**值必须是 string**（否则 `schema` walk 拒整棵 `SAVE_INVALID`）。落盘仍由 runner 收口一次。
      setActivity: (intent) => {
        if (!session.data) { logLine('setActivity 但无 session.data'); return }
        const list = session.data.activityStorage || (session.data.activityStorage = [])
        let a = list.find((x) => x && x.id === intent.id)
        if (!a) { a = { id: intent.id, data: [] }; list.push(a) }
        if (!Array.isArray(a.data)) a.data = []
        for (const [key, raw] of intent.entries || []) {
          let val = raw
          if (typeof raw === 'string' && raw.startsWith('[expr]')) {
            const num = readMapValue(raw.slice('[expr]'.length), M.env)
            if (num === null) { logLine(`setActivity [expr] 取不到，跳过: ${intent.id}.${key} = ${raw}`); continue }
            val = String(num)
          }
          const e = a.data.find((x) => x && x.key === key)
          if (e) e.value = String(val)
          else a.data.push({ key, value: String(val) })
        }
        logLine(`setActivity ${intent.id}: ${(intent.entries || []).map(([k, v]) => k + '=' + v).join(', ') || '（空）'}`)
      },
      // ★商店支：NPC openPanel ItemShop[...] => 打开商店面板（HUD 钮也走 openRestartShop）
      openPanel: (intent) => {
        if (/ItemShop/.test(intent.panel)) openRestartShop(parseShopArgs(intent))
        else if (/Activity/.test(intent.panel)) openRestartActivity()   // ★C4：NPC openPanel Activity[...] → 活动面板
        else if (/SPTBoss/.test(intent.panel)) openRestartSPT(parseShopArgs(intent))   // ★C3·SPT：NPC openPanel SPTBoss[page=N] → 面板（SPQ4 夹紧在 openRestartSPT 内）
        else if (/SoulPet/.test(intent.panel)) openRestartGodpet()   // ★C1·灵兽：NPC/活动 openPanel SoulPet → 灵兽面板
        else if (/GuideLine/.test(intent.panel)) openRestartGuide()   // ★C3·指引：NPC openPanel GuideLine → 疑难指引面板
        else if (/PlayerInfo/.test(intent.panel)) openRestartPlayerInfo()   // ★C4·PlayerInfo：防未来兜底（现桥零 intent）
        else logLine('openPanel 未接面板: ' + intent.panel)
      },
    },
    env: M.env,
    mode: session.isShootMode ? 'shoot' : 'normal',
    save: () => { if (A && A.save) A.save() },   // MNI8 收口：runner 每批只调一次
    log: (reason, intent) => logLine('动作登记: ' + reason + (intent && intent.name ? ' [' + intent.name + ']' : '')),
  }
}

/**
 * ★MB10「记录最后所在的房间 + 位置」：切战斗场景**之前**写一笔 `session.lastPos = {mapId,x,y}`（舞台坐标，
 *   与 `spawn` 一次性落点同一套系，TPQ5）。战后 `rbattleScene.exitToMap` 若回的就是这个房间 ⇒ 把坐标原样送回
 *   （`#/map?…&spawn=x,y`），人不用再从房间入口重跑到刚才那只野怪那儿。
 *   房间号本身不在这里取 —— 它的真值是 `session.currentMapId`（由 `renderMap` 每次进图写）。
 */
function rememberRoom() {
  const p = M.pos
  session.lastPos = p ? { mapId: String(session.currentMapId), x: Math.round(p.x), y: Math.round(p.y) } : null
}

/**
 * ★MB7 `battle{branch}` 的 sink（决策二 = **地图侧全落 + 复用现有单敌遭遇**）。
 * ① `buildSpec` 在本 NPC 的 `battles[]` 里按 `branchId` 选一支（找不到 ⇒ 门 ① 出文案，不静默 = **BTC8** 修法）；
 * ② `canStartBattle` 跑开工三门（今天 probe 一律 `'unknown'` ⇒ ②③放行；配方空敌 ⇒ ①拦）；
 * ③ 门过 ⇒ 写 `session.battleOrigin` + 用 `#/rbattle` 把 **`spec.enemy[0]`** 当单敌遭遇打出去（板凳敌/多宠带 settings
 *    的正式规格 = **E6** 结账，本批不伪造）；门不过 ⇒ `openHintbox` 给文案、**不切场景**。
 * ⚠️ `@time`/倒计时/`Timeout` 不接（**BTQ4**）；遭遇沿用现机制（**BTI5** 时钟归编排层，本处不新增时钟）。
 */
function startMapBattle(intent, api) {
  const npc = (api && api.npc) || M.dialogNpc
  if (!npc) { logLine('battle 但无当前 NPC（B3 未上屏 ⇒ 请用 onNpcClick 驱动）'); return }
  const mapId = Number(session.currentMapId)
  const spec = buildSpec(npc, intent.branch, Number.isFinite(mapId) ? mapId : null)
  // 门 ①：配方不存在（`buildSpec` 返回 null）⇒ 用 intent 带的 hintIfMissing，否则缺省文案
  const probe = { firstPetAlive: () => 'unknown', isFirstPetMod: () => 'unknown', firstPetStar: () => 'unknown' }
  const gate = spec ? canStartBattle(spec, probe) : { ok: false, hint: intent.hintIfMissing || '战斗配置不存在。' }
  if (!gate.ok) {
    logLine('开工门未过: ' + gate.hint)
    openHintbox({ content: gate.hint })
    return
  }
  const enemy = spec.enemy[0]
  if (!enemy || enemy.id == null) { logLine('战斗配方缺敌方首只，已放弃'); return }
  // ★先装配 origin，再切场景（BTI7：战后链要能在回图时就近取到 npc/branch）
  session.battleOrigin = { mapId: session.currentMapId, npcId: npc.id, branchId: spec.branchId }
  rememberRoom()                                               // ★MB10：记下「回原房间 + 原位置」
  closeDialogBox()                                              // 开战前撤对话浮层（同 OR8 口径）
  const m = byId.get((M.map && M.map.id) || '') || {}
  const fm = spec.settings && m.fightMapOk ? m.fightMap : null   // 舞台背景沿用现图 fightMap（缺则 rbattle 用缺省）
  const rq = { client: enemy.id, level: enemy.level ?? 1, slot: 0, gid: sessionGid(), back: String(session.currentMapId), encounter: 1 }
  if (fm) rq.map = fm
  logLine(`⚔ [地图战斗] ${npc.name || npc.id} #${spec.branchId} → 敌 id=${enemy.id} Lv${rq.level} · origin 已写 ⇒ #/rbattle`)
  setTimeout(() => go('rbattle', rq), 300)
}

/**
 * ★MB7 战后链（回图后接着办事；`R-1` / **BTI9** / **BTI8**）。在 `registerAndRunAuto` 末尾、实体登记完之后跑。
 *  · **同图判定**（**BTQ1**：删上游 `[50000,50100]` 号段护栏 ⇒ 只要回的是同一张图就接，剧情图不排除）；
 *  · `env.battleState` 已在 `buildMapEnv` 里从 `lastBattle` 填好（供 handler 里的 `battle.` 条件读）；
 *  · **`isMyWin→winHandler` / `isOpWin→loseHandler` / 其余 ⇒ 显式第四支**登记 `result-state-unhandled`（**BTC3** 修法：不静默、不误当胜/负）；
 *  · 每个 handler 的原始按钮片段 → `ButtonSpec` → **同一台** `resolve→run`（含 `battle.` 条件、`teleport`/`setItem`/`openDialog` 出路）；
 *  · 用完**清 `battleOrigin`**（一次性）；`lastBattle` **保到下次开工**才覆盖（**BTI10**）；**绝不重播 RNG**（**BTC7**）。
 */
async function runPostBattleChain() {
  const origin = session.battleOrigin
  if (!origin) return
  if (String(origin.mapId) !== String(session.currentMapId)) { session.battleOrigin = null; return }  // 换图 ⇒ 弃这次战后链
  const last = session.lastBattle
  const npc = M.npcById && M.npcById[String(origin.npcId)]
  session.battleOrigin = null                                   // 一次性：无论成败都消费掉（不重跑）
  if (!last) { logLine('战后链：会话无 lastBattle 快照，跳过'); return }
  if (!npc || !M.env) { logLine('战后链：原 NPC/环境不在本图，跳过'); return }
  const spec = buildSpec(npc, origin.branchId, Number(session.currentMapId))
  if (!spec) { logLine('战后链：找不到原战斗配方（NPC/分支已变），跳过'); return }
  const r = last.result || {}
  let frags = null, label = ''
  if (r.isMyWin) { frags = spec.onWin; label = 'winHandler' }
  else if (r.isOpWin) { frags = spec.onLose; label = 'loseHandler' }
  else { logLine(`战后链：result.state=${last.state} 既非胜也负 ⇒ 登记 result-state-unhandled（Timeout/Error，BTC3）`); return }
  if (!frags || !frags.length) { logLine(`战后链：${label} 为空，无后续动作`); return }
  const base = makeRunCtx()
  const specs = MAP_ENTITY.parseHandlerFrags(frags, 'winHandler')
  const intents = []
  for (const b of specs) { const it = resolveAction(b, M.env, { mode: base.mode }); if (it) intents.push(it) }
  logLine(`战后链：${label}（state=${last.state}）→ ${specs.length} 按钮 / ${intents.length} 决议`)
  if (intents.length) await MAP_RUN.run(intents, { ...base, npc })
}

/**
 * 进图后：**先登记实体表**（写 `M.npcs`/`M.npcById`/`M.env`）→ **再跑每只 NPC 的 `auto`**（`MNI1`/`MNI5`，`map-npc.md §2.5`）
 *   → **再跑战后链**（★MB7：回图命中同图 ⇒ 读 `lastBattle` 跑 win/loseHandler）。
 * ⚠️ `auto` 每次进图都跑 ⇒ 带 `random[new]` 的按钮每次进出重摇（MC5 受害者，本批如实照做 + 观测）。
 */
async function registerAndRunAuto() {
  const u = M.unity
  if (!u) { M.npcs = []; M.npcById = {}; M.env = null; return }
  const npcs = MAP_ENTITY.buildEntities(u)
  M.npcs = npcs
  const byId = {}
  for (const e of npcs) byId[String(e.id)] = e
  M.npcById = byId
  M.env = buildMapEnv(u, byId)              // ★先登记（env 的键袋指向 byId；battleState 从 lastBattle 填）
  // ★MB9 + ★MDB11（人类 2026-10-21 点名 ③「两条路都走」）：给带 `<wild><movement mode="wander">` 的野怪建漫游初态 —— **JS 路 + SWF 路都播**。
  //   旧口径「SWF 路野怪照 `MapRunner.as` 自己溜达、不叠游荡」已随合成野怪表断粮而**作废**（不再生成 `WildPet` ⇒ SWF 路的野怪只有我们这一份）。
  //   画环取 `_wander.pos ?? pos` ⇒ 有 `_wander` 者实时飘；点击命中面（`M.npcHit`）每帧随位重算。3 只 `mode="stationary"` 由 `seedWander` 返回 `null`（判据不动）。
  let seeded = 0
  for (const e of npcs) { const w = WANDER.seedWander(e, Math.random); if (w) { e._wander = w; seeded++ } }
  if (seeded) { startWanderLoop(); logLine(`MB9 漫游: ${seeded} 只野怪已播态（无碰撞、radius 内、JS/SWF 两条路）`) }
  // ★MDB10：talk **气泡调度 = 两条路都播**（人类 2026-10-21 点名范围；实测 110 条 `<talk>` 分布在 53 张图 = JS 路 11 张 / SWF 路 42 张）。
  //   与上面的 `_wander` 不同：气泡与走位无关 ⇒ 挂独立的 `e._talk`；`canStart` 仍要求驻停才起新泡（上游 `OnRestStarted`）。
  let talked = 0
  for (const e of npcs) { const t = TALK.seedTalk(e, Math.random); if (t) { e._talk = t; talked++ } }
  if (talked) { startTalkLoop(); logLine(`MDB10 气泡: ${talked} 只野怪挂上 talk 调度（图+文同池、JS/SWF 两条路）`) }
  updateHint()                       // ★MDB11：顶栏那句「N 只野怪」改成吃现图 Unity 真值 ⇒ 必须**实体登记之后**刷一次（旧刷新点 `mapWild` 已退役）
  const base = makeRunCtx()
  let fired = 0
  for (const e of npcs) {
    const autos = MAP_ENTITY.autoSpecsOf(e)
    if (!autos.length) continue
    const intents = []
    for (const b of autos) { const it = resolveAction(b, M.env, { mode: base.mode }); if (it) intents.push(it) }
    if (intents.length) { fired++; await MAP_RUN.run(intents, { ...base, npc: e }) }
  }
  if (fired) logLine(`auto 触发: ${fired} 只 NPC 的进图按钮已求值（先登记后执行，MNI5）`)
  await runPostBattleChain()                // ★MB7：实体/env 就位后接战后链
}

/**
 * NPC 点击派发（**建好、待 B3 把 NPC 画上屏才测得了**：本批无 DOM 命中面，守"本线零像素"）。
 * B3 上屏后：`window.onNpcClick(npcId, 'click')` ⇒ 走同一条 `resolve → run` 链（含模式门/条件门）。
 */
async function onNpcClick(entityId, typeId) {
  const e = M.npcById && M.npcById[String(entityId)]
  if (!e || !M.env) { logLine('NPC 点击但实体/环境未就绪: ' + entityId); return }
  const want = typeId == null ? 'click' : String(typeId)
  const specs = e.eventHandler.filter((b) => b.typeId === want)
  if (!specs.length) { logLine('NPC ' + entityId + ' 无 type=' + want + ' 的按钮'); return }
  const base = makeRunCtx()
  const intents = []
  for (const b of specs) { const it = resolveAction(b, M.env, { mode: base.mode }); if (it) intents.push(it) }
  if (intents.length) await MAP_RUN.run(intents, { ...base, npc: e })
}

/** 昼夜按钮：仅当当前图 `switch === ±1` 才显示（TPC5 收窄后；`switch=0` 或畸形归 0 ⇒ 不出现）。 */
function updateDayNightBtn() {
  const btn = document.getElementById('dayNightBtn')
  if (!btn) return
  const sw = M.unity && M.unity.switch
  // ★A2（obs-2 诊断）：昼夜按钮该不该出现 = 当前图 `switch`；把这行打进 `#log` 供人测定位（`131` 应 `switch=1`）
  logLine('昼夜检查 switch=' + sw + ' id=' + (M.unity && M.unity.id))
  btn.style.display = (sw === 1 || sw === -1) ? '' : 'none'
}

/** 点昼夜按钮 → 镜像决议（§3.4）：目标 = `-currentMapId`，仍校验存在（= Unity 现场解析得到记录）；不存在 ⇒ `missingMirror`。 */
async function onMirrorClick() {
  const u = M.unity
  if (!u) return
  const wanted = -Number(u.id)
  let twin = null
  try { twin = await CONTENT.loadMap(String(wanted)) } catch (e) { logLine('镜像图解析失败: ' + e) }
  const d = MAP_SESSION.decideMirror(u, () => !!twin)
  if (d.kind === 'mirror') { logLine('昼夜 → 镜像图 ' + d.targetMapId); gotoMap(String(d.targetMapId), true) }
  else if (d.kind === 'missingMirror') logLine('缺孪生昼夜图: ' + d.wanted)
  else logLine('本图无昼夜')
}

// 重建播放器进图（首帧 / 重载 / 从 JS 图切回 SWF 图都要走这条 —— 角色部件包重新装配）。
// ★A2：先 `leaveJsMode()` 拆掉可能的 JS 层；`id` 可显式传（renderMap 传入），缺省读下拉。
async function loadMapRunner(id) {
  leaveJsMode()
  const wrap = document.getElementById('wrap')
  wrap.querySelectorAll('ruffle-player').forEach(n => n.remove())
  M.player = null; M.grid = null; M.pos = null; M.info = null; M.spots = []; M.cam = { x: 0, y: 0 }
  // ★M9：新播放器 ⇒ 提线态从头由 `mapReady.puppet` 置位；走位目标/野怪请求一并作废
  M.puppet = false; M.swfStage = null; M.wantWalk = false; M.walkTarget = null
  // ★M9-c（A·退役）：f2 旧链补丁（`swfFollowPoint` 平滑 + `actorVisible` 显隐同步）已随旧链退役删除。
  drawHudTexts(null)
  draw()
  const p = window.RufflePlayer.newest().createPlayer()
  wrap.appendChild(p)
  let readyVia = 'swf'
  const ready = new Promise(r => {
    const h = e => { if (e.data?.type === 'mapReady' && e.data?.instanceId === 'map') { removeEventListener('message', h); r() } }
    addEventListener('message', h)
    setTimeout(() => { removeEventListener('message', h); readyVia = 'timeout'; r() }, 25000)
  })
  const mid = String(id ?? document.getElementById('mapSel').value)
  const selEl = document.getElementById('mapSel')
  if (selEl && [...selEl.options].some(o => o.value === mid)) selEl.value = mid   // SWF 图必在下拉里；同步选中值（返回/传送后一致）
  M.map = byId.get(mid) || null
  M.mapUrl = '/swf/map/' + ((M.map && M.map.swf) || mid + '.swf')
  await loadUnityInto(M.map || { id: mid })          // ★MB5：现场取 Unity 记录（spotsOf 目标图 / 落点 / 昼夜 / 实体都要它）
  // ★A2（obs-1-a）：SWF 路落点**必须喂 AS3 舞台坐标**（`initAs3`），不是 Unity `init`（960×540）—— 否则角色被丢进错位、落地即撞野怪。
  //   `landingSpot` 是内核规则、只读 Unity `init`，故这里**在 L4** 改取 `initAs3`（`spawn ?? AS3 init`），绝不喂 Unity 坐标给 SWF。
  const sp = consumeSpawn()                            // 一次性落点是 `[x,y]`（changeScene 入参），归一成对象再喂 SWF 的 initX/initY
  const init = (sp && { x: sp[0], y: sp[1] }) || (M.unity && M.unity.initAs3) || (M.map && M.map.init) || {}   // 落点 = spawn ?? AS3 initAs3 ?? maps.json init
  const q = new URLSearchParams({
    mapUrl: M.mapUrl, actorColor: document.getElementById('avSel').value, instanceId: 'map',
    spots: spotsOf(M.map || {}), initX: init.x ?? -1, initY: init.y ?? -1,
    wild: '',   // ★MDB11：**主动喂空** —— 合成野怪表已断粮 ⇒ `setWild("")` ⇒ AS3 一只 `WildPet` 都不生成（键名留着，让"我们喂了空"在 URL 上看得见；不碰 `MapRunner.as`、不重编译）
    hud: restartOn() ? '0' : '1',   // 重启线: SWF 整块常驻 HUD 不建, 由 DOM 常驻层接管
    // ★M9-c（A·退役）：不再透传 `&puppet=0` 调试入口 —— AS3 参数缺省即 "1"，puppet 是唯一 SWF 走位通路（旧走位段成惰性死码，不重编译）。
  })
  let loadErr = null
  await p.ruffle().load({
    url: '/game/maprunner/mapRunner.swf?' + q,
    // webgl 后端下 BitmapData.draw 的 readPixels 回读在软件 GPU 上会抖到几十秒, 默认走 canvas
    renderer: P.get('renderer') || 'canvas',
    allowScriptAccess: true, autoplay: 'on', unmuteOverlay: 'hidden',
    scale: 'noScale', menu: false, warnOnUnsupportedContent: false,
  }).catch(e => { loadErr = e; logLine('load failed: ' + e) })
  await ready
  if (loadErr || readyVia === 'timeout') {
    // ★2026-10-20 选项 C：SWF 画面加载失败 / 25s 未回 mapReady ⇒ 退回 Unity PNG/JS 路，绝不黑屏。
    logLine('SWF 地图不可用（' + (loadErr ? '加载失败' : '25s 超时') + '），回退 Unity PNG: ' + mid)
    await enterJsMode(mid, M.unity)
    return
  }
  M.player = p
  refreshHud()     // 重启线挂 DOM 常驻 HUD; as3 线喂 SWF (hudBind 可能先到, 这里补一次)
  draw()
  syncBackBtn()
  await registerAndRunAuto()   // ★MB5：player 就位后跑 auto（teleport sink 需要 M.player）
}

// 换图但不重建播放器: 角色部件包 (8 个 .bin) 只加载一次
async function worldLoad(id) {
  // ★A2：本函数**只服务 SWF 路**（`enterSwfMode` 判 `swfOk!==false` 才走这里）。无 AS3 记录 / 缺画面的图不再从此处被拒 ——
  //   它们由 `renderMap` 分流进 `enterJsMode`（JS 回退渲染）。故这里的 `!m` 只剩"SWF 路不该缺记录"的防御位。
  const m = byId.get(id)
  if (!m) { logLine('SWF 路缺 AS3 记录（不该发生，应已被 renderMap 分去 JS 路）: ' + id); return }
  if (!M.player?.loadWorld) { await loadMapRunner(id); return }
  M.map = m
  M.mapUrl = '/swf/map/' + m.swf
  M.grid = null; M.spots = []
  draw()                                          // 旧图的光口/调试圈立刻下台, 等新图的 mapWorld 重画
  document.getElementById('mapSel').value = id
  document.getElementById('hint').textContent = `传送至 ${m.name}…`
  await loadUnityInto(m)                          // ★MB5：换血统 —— 昼夜/实体读 Unity（画面仍用 AS3 swf）
  // ★A2（obs-1-a）：SWF 路落点喂 **AS3 舞台坐标**（`initAs3`），绝不喂 Unity `init`（960×540）。
  const sp = consumeSpawn()
  const init = (sp && { x: sp[0], y: sp[1] }) || (M.unity && M.unity.initAs3) || m.init || {}
  try { M.player.loadWorld(M.mapUrl, init.x ?? -1, init.y ?? -1, spotsOf(m), '') }   // ★MDB11：野怪位**喂空串**（合成表已断粮，见 `loadMapRunner` 的 `wild: ''`）
  catch (e) { logLine('loadWorld 失败, 重建容器: ' + e); await loadMapRunner(id); return }
  syncBackBtn()
  await registerAndRunAuto()   // ★MB5：进新图 → 先登记实体、后跑 auto
}
// ★A2（单一入口）：每次进图都经 `renderMap` —— **现场取一次 Unity 记录**（不缓存，§4.9），按**分流反转**（人类 2026-10-19，`map-code-map §2.4` / `map-impl §7.3.13`）分流：
  // ★2026-10-20：有 swf 映射（u.swfOk）⇒ enterSwfMode（Ruffle/AS3 画面，逐字节不变）；否则 ⇒ enterJsMode（JS 路 · 背景 = Unity PNG）；SWF 加载失败/超时兜底退回 JS 路。
//   `enterSwfMode`（Ruffle/AS3 画面，路本身逐字节不变）；注明了但盘上无可玩 SWF（`swfOk===false`）⇒ 退回 JS 路 + 日志一行。
//   取不到记录 ⇒ 只登记一行、**不切图**（旧图留在屏上，绝不黑屏静默）。`pushHist` 时先压回当前 `M.map.id`（"返回上一图"用）。
// ★MB10：返回**布尔**（是否真切了图）—— 回图入口要靠它判断 `map=` 那张能不能进、要不要退回下拉当前项。
// ★分流反转 · "注明采用 swf"名单：图 id（字符串）进名单 = 注明走 SWF 画面路；**名单为空 ⇒ 全部图默认吃 Unity PNG**。
// ★2026-10-20：分流改由 map_swf.csv 驱动（swf 优先，见 renderMap）；SWF_ANNOTATED_IDS 名单退役。
async function renderMap(id, opts) {
  const pushHist = opts && opts.pushHist
  if (pushHist && M.map) M.hist.push(M.map.id)
  const mid = String(id)
  let u = null
  try { u = await CONTENT.loadMap(mid) } catch (e) { logLine('目标地图解析失败: ' + e) }
  if (!u) { logLine('目标地图无 Unity 记录（不切图）: ' + mid); return false }
  // ★MB10「记录最后所在的房间」：这里是 `session.currentMapId` 的**唯一写者** —— 取到记录才换
  //   （照搬上游 `NormalLoadingScreen.cs:41`：「成功则 lastMapId←当前、currentMapId←新；失败则换图中止」）。
  //   战后回图（`#/rbattle` → `#/map?map=…`）与面板（世界图/小地图的「当前位置」）都读这一格。
  if (String(session.currentMapId) !== mid) session.lastMapId = session.currentMapId
  session.currentMapId = mid
  M.unity = u
  // ★2026-10-20：swf 优先（CSV map_swf.csv 驱动）；无 swf 映射 ⇒ Unity PNG/JS 路；SWF 加载失败/超时由 enterSwfMode 兜底退回。
  if (u.swfOk) await enterSwfMode(mid, u)
  else await enterJsMode(mid, u)
  return true
}
async function gotoMap(id, pushHist) { await renderMap(id, { pushHist }) }
function syncBackBtn() { document.getElementById('backBtn').disabled = M.hist.length === 0 }

// ───────────────── A2：SWF / JS 两条渲染通路（★2026-10-20 swf 优先：有 swf 映射走 SWF 路、无 swf 走 JS/PNG 路；反向推翻 2026-10-19「分流反转」）─────────────────
// 围栏：JS 路**只画 bg + 角色 sprite + 光口**（`#bgc`/`#ov`/`#portal` 三张既有 canvas；A2b 把"角色点"升级成原版小赛尔部件包 JS 合成、静态站立朝右），**不碰 `MapRunner.as`**；
//       NPC / 野怪 / 农场 / 动物 sprite **一律不画**（A 组子系统 + B3 实体美术围栏）。坐标 = 路线 A（Unity 960×540→舞台，Y 翻转）。

/** SWF 路：拆掉可能的 JS 层后，沿用既有 `worldLoad`（复用播放器）或 `loadMapRunner`（重建容器）。 */
async function enterSwfMode(id, u) {
  leaveJsMode()
  const mid = String(id)
  // `worldLoad` 依赖 `byId`（AS3 画面记录）；缺记录的 swfOk=true 图退回 `loadMapRunner`（它容忍 `M.map=null`、用 `mid.swf` 兜底）
  if (M.player && typeof M.player.loadWorld === 'function' && byId.get(mid)) await worldLoad(mid)
  else await loadMapRunner(mid)
  // ★M8-f：SWF 旧路只在有自定义外观时才装叠层部件；无装备 ⇒ 不取包、不改变 SWF 基线。
  //   ★M9 puppet 位：叠层**常开**（裸装也画小赛尔）⇒ 无论有无装备都要 syncLook（此时 M.puppet 已由 mapReady 置位）。
  //   （loadMapRunner 的选项 C 兜底可能已切 JS 路并 syncLook 过；再调一次命中签名复用，幂等。）
  if (M.puppet || hasCustomLook()) {
    try { await syncLook() } catch (e) { logLine('外观计划装载失败（SWF 叠层）: ' + e.message) }
  }
}

/** 拆净 JS 回退层：取消 rAF、摘 `#wrap` 点击、移走 `#bgc`、清 JS 态。（SWF 路进图前也调，幂等。） */
function leaveJsMode() {
  if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0 }
  if (wanderRaf) { cancelAnimationFrame(wanderRaf); wanderRaf = 0 }   // ★MB9：停野怪漫游循环（换图/卸载/退 JS 路）
  stopTalkLoop()                                                       // ★MDB10：停 talk 气泡循环（换图/卸载；新图由 registerAndRunAuto 重新起）
  stopMarkLoop()                                                       // ★MDB13-d：停惊讶环 = **取消待发的开战**（拍板 ①：不许留"过 0.8s 自己跳战斗"的挂账）
  stopActorAnim()                                                      // ★M8-b2：停帧动画循环
  ACTOR_ANIM.moving = false; ACTOR_ANIM.right = true; ACTOR_ANIM.up = false
  animLabel = ''; animElapsed = 0; animTick = 0
  const wrap = document.getElementById('wrap')
  if (jsClickHandler && wrap) { wrap.removeEventListener('click', jsClickHandler); jsClickHandler = null }
  if (bgc) { bgc.remove(); bgc = null; bgctx = null }
  if (npcEl) { npcEl.remove(); npcEl = null; npctx = null }   // ★B3：拆掉 #npc 层（sprite 素材缓存 NPC_CACHE **留下次复用**，仿 LOOK_PARTS；仅递增 gen 作废在飞装载）
  lookGen++                                  // ★M8-b：作废在飞的外观装载（syncLook 装回前校验 gen）；**LOOK_PARTS 位图缓存留下次复用**，不清
  npcGen++                                   // ★B3：作废在飞的 NPC sprite 装载（ensureNpcSprite 的 onload/onerror 装回前校验 gen）
  M.jsMode = false; M.jsView = null; M.walkTarget = null; M.bgImg = null; M.bgRect = null
}

/**
 * JS 进图（★分流反转 2026-10-19：**默认通路** = 所有未"注明采用 swf"的图；背景加载 Unity 目录 PNG `Resources/Maps/bg`，272/272 覆盖）：无 Ruffle ⇒ 本层驱动 bg / 角色 sprite（原版小赛尔，A2b）/ 光口 / 自由走 / 点击传送。
 * 相机恒 `{0,0}`（contain 已把整图放进 1200×660）⇒ 既有 `draw()/drawPortals()/onStageMove/portalHit` 原样可用。
 */
async function enterJsMode(id, u) {
  leaveJsMode()
  const wrap = document.getElementById('wrap')
  wrap.querySelectorAll('ruffle-player').forEach(n => n.remove())
  M.player = null; M.grid = null; M.cam = { x: 0, y: 0 }
  M.puppet = false; M.swfStage = null; M.wantWalk = false; M.walkTarget = null   // ★M9：JS 图无提线态（防上一 SWF 图残留）
  drawHudTexts(null)
  // 合成 AS3 记录（`50000/1010/-131` 不在 `byId`）⇒ `nameOf/labelOf/hint` 出真名，不显示"图90"
  M.map = byId.get(id) || { id, name: (u && u.name) || ('图' + id), swfOk: false, teleports: [] }
  const sel = document.getElementById('mapSel')
  if (sel && [...sel.options].some(o => o.value === id)) sel.value = id
  const sp0 = consumeSpawn()                       // 一次性落点（`changeScene('map',{spawn})`，TPQ5）；缺 ⇒ Unity init→stage
  const spawnXY = sp0 && { x: sp0[0], y: sp0[1] }  // 生产侧实测 0 命中；这里当作**舞台像素**（人眼校）

  // 底图 canvas（`#bgc`，压在叠加层最下、`pointer-events:none` 让点击落到 `#wrap`）
  if (!bgc) {
    bgc = document.createElement('canvas')
    bgc.id = 'bgc'; bgc.width = 1200; bgc.height = 660
    bgc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none'
    wrap.insertBefore(bgc, wrap.firstChild)
    bgctx = bgc.getContext('2d')
  }
  bgc.style.display = ''
  // ★B3：NPC 真美术 canvas（`#npc`）—— 幂等建层（JS/SWF 共用；见 `ensureNpcLayer`），DOM 序插在 `#ov` 之下（sprite 压不住角色）。
  ensureNpcLayer()
  npcEl.style.display = ''
  M.jsMode = true
  M.info = { mapW: 1200, mapH: 660, mapX: 0, mapY: 0, freeRoam: true }

  // ★A2b/M8-b：JS 图把角色黄点升级成原版小赛尔。色 = `avSel`；外观 = `buildLookPlan` 的 11 槽计划
  //   （裸装 = 原 7 件 + 阴影 ⇒ 逐像素回归）。计划/位图未就绪 ⇒ 黄点顶上，装完补画；缓存命中 ⇒ 复用。
  syncLook().catch((e) => logLine('外观计划装载失败: ' + e.message))

  // 用给定矩形重投光口/起点（bg 未到先按整舞台铺一版，到了再用 fitBg 矩形重投）
  const applyView = (rect) => {
    const v = JS_VIEW.buildJsView(u, rect, { flipY: true })
    for (const s of v.spots) if (!s.label) s.label = s.target ? labelOf(s.target) : ''   // 无名光口退回目标图名
    M.jsView = { rect, flipY: true }
    M.spots = v.spots
    M.pos = spawnXY || v.start || { x: 600, y: 462 }                                       // 缺 init ⇒ 舞台中下（仿 MapRunner）
    draw()
  }
  applyView(JS_FULL_RECT)
  refreshHud(); syncBackBtn(); updateDayNightBtn()

  const key = JS_VIEW.bgKeyOf(u)
  const img = new Image()
  img.onload = () => {
    const r = JS_VIEW.fitBg(img.naturalWidth, img.naturalHeight)
    paintJs(img, r)
    M.bgImg = img; M.bgRect = r
    applyView(r)                             // 真实矩形到位 ⇒ 重投光口/起点（bg 尺寸非统一，contain letterbox）
  }
  img.onerror = () => { logLine('缺底图（JS 仍可走/可传，位置按整舞台估算）: ' + key) }
  img.src = JS_VIEW.bgUrlOf(u)

  registerAndRunAuto()                       // ★先登记实体、后跑 auto（JS 路不走 loadUnityInto，须显式调；auto 的 teleport 走 renderMap 分流）
  if (M.jsMode) draw()                       // ★MB6 增补（选 A）：实体登记后立即补画一次 ⇒ NPC 占位标记不必等底图 onload
  jsClickHandler = jsClick
  wrap.addEventListener('click', jsClickHandler)
  startJsLoop()
}

/** 把 bg 图按 contain 矩形铺到 `#bgc`（先涂黑补 letterbox）。 */
function paintJs(img, r) {
  if (!bgctx) return
  bgctx.fillStyle = '#000'; bgctx.fillRect(0, 0, bgc.width, bgc.height)
  if (img && img.complete && img.naturalWidth) bgctx.drawImage(img, r.dx, r.dy, r.dw, r.dh)
}

function currentActorColor() {
  return (document.getElementById('avSel') && document.getElementById('avSel').value) || 'BLUE'
}

function assetKeyOf(desc) {
  return `${desc.source}:${desc.pack}:${desc.suffix || ''}`
}

function logLookOnce(key, msg) {
  if (LOOK_LOGGED.has(key)) return
  LOOK_LOGGED.add(key)
  logLine(msg)
}

// 描述子 → 取数 URL：裸装走仓库 .bin；装备/坐骑走本地缓存清单（缺项 ⇒ 抛，由调用侧退下一级 fallback）。
function assetUrlOf(desc, manifest) {
  if (desc.source === 'naked') return '/game/data/actor/' + desc.pack + '.bin'
  const files = manifest && manifest.packs && manifest.packs[desc.pack] && manifest.packs[desc.pack].files
  const file = files && files[desc.suffix || '']
  if (!file || !file.cachePath) throw new Error('包未缓存')
  return '/game-cache/' + file.cachePath
}

/** 按 assetKey 取/装一个包（parsePack + createImageBitmap）；同一包的并发请求共用一次装载。 */
async function loadLookAsset(desc, manifest) {
  const key = assetKeyOf(desc)
  const hit = LOOK_PARTS.get(key)
  if (hit) return hit
  if (LOOK_LOADING.has(key)) return LOOK_LOADING.get(key)
  const p = (async () => {
    const url = assetUrlOf(desc, manifest)
    const res = await fetch(url)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buf = new Uint8Array(await res.arrayBuffer())
    const pack = ACTOR_VIEW.parsePack(buf)
    const bitmap = await createImageBitmap(new Blob([pack.png], { type: 'image/png' }))
    const entry = { key, pack, bitmap, source: desc.source, packId: desc.pack, suffix: desc.suffix || '', url }
    LOOK_PARTS.set(key, entry)
    return entry
  })()
  LOOK_LOADING.set(key, p)
  try { return await p } finally { LOOK_LOADING.delete(key) }
}

// 主件失败 ⇒ 逐级 fallback（自定义 → 同色默认 → 蓝/红裸装）；缺包不在这里逐层打日志，
// 由 loadLookParts 汇总成「每签名一行」（MDB8-e；M8-P5/ALI6）。
async function resolveLookLayer(layer, manifest) {
  let desc = layer
  let mainErr = null
  while (desc) {
    try { return { layer, asset: await loadLookAsset(desc, manifest), mainErr } }
    catch (e) { if (!mainErr) mainErr = e; desc = desc.fallback || null }
  }
  return { layer, asset: null, mainErr }
}

/**
 * ★M8-b：按 `LookPlan` 装包 —— 每层主件 → fallback 链；阴影单独装（不在计划里，每个角色都有）。
 * 竞态：装回前校验 `gen`（换图/卸载/换计划会递增）；`LOOK_PARTS` 留下次复用，装完由 `pruneLookParts` 关掉不再引用的位图。
 */
async function loadLookParts(plan, manifest, gen) {
  const shadowP = loadLookAsset({ source: 'naked', pack: 'UI_ActorShadow', suffix: '' }, manifest)
    .catch((e) => { logLookOnce('shadow', '阴影缺包（UI_ActorShadow）: ' + e.message); return null })

  const items = await Promise.all(plan.layers.map((layer) => resolveLookLayer(layer, manifest)))
  if (gen !== lookGen) return null
  const resolved = items.filter((r) => r.asset)
  // 缺包摘要（MDB8-e）：只报**主件**缺失；`(fallback)` = 该层已用下一级兜底绘制。
  const missingMain = items
    .filter((r) => r.mainErr)
    .map((r) => `${r.layer.part} ${r.layer.pack}${r.layer.suffix || ''}${r.asset ? '(fallback)' : ''}`)
  const shadow = await shadowP
  if (gen !== lookGen) return null

  // M8-I2：坐骑 `_0` 缺包 ⇒ 不进入骑乘视觉态（不抬升、不藏手脚、不变速），按已穿装备画。
  let effectivePlan = plan
  if (plan.mount) {
    const main = plan.layers.find((l) => l.part === 'DOGZ_RIGHT')
    const ok = main && resolved.some((r) => r.layer === main)
    if (!ok) {
      effectivePlan = { ...plan, offsetY: 0, hiddenSlots: [], mount: null, speedFactor: 1 }
      logLookOnce('mount:' + plan.signature, '坐骑包未就绪，按未骑乘绘制（M8-I2）: ' + plan.mount.resourceId)
    }
  }

  const body = resolved.find((r) => r.layer.part === 'BODY') || null
  return {
    plan: effectivePlan,
    sourcePlan: plan,
    resolved,
    shadow,
    body,
    missingMain,
    ready: !!body,          // BODY 缺 ⇒ 调用侧留黄点（裸装/兜底都救不回来）
    signature: plan.signature,
  }
}

function pruneLookParts() {
  if (!LOOK) return
  const keep = new Set()
  for (const r of LOOK.resolved) keep.add(r.asset.key)
  if (LOOK.shadow) keep.add(LOOK.shadow.key)
  for (const [key, entry] of LOOK_PARTS) {
    if (keep.has(key)) continue
    LOOK_PARTS.delete(key)
    try { entry.bitmap.close() } catch (e) {}
  }
}

/** ★M8-f：有自定义外观（装备/坐骑）才算叠层需求；裸装默认（含 12 色默认）不算。`LOOK_OVERRIDE` 是调试直通，优先读。 */
function hasCustomLook() {
  const o = LOOK_OVERRIDE
  const vec = o ? (Array.isArray(o.equipVec) ? o.equipVec : []) : (session.equipVec || [])
  const mount = o ? (Number(o.mountEquipId) || 0) : (Number(session.mountEquipId) || 0)
  return vec.length > 0 || mount !== 0
}

/** 当前是否该画 canvas 角色：JS 路 = 计划就绪即可；★M9 puppet 位（唯一 SWF 通路，`MDB9-c` A·退役后）= 计划就绪即**恒画**（照抄 JS 图，缺包退裸装小赛尔、不是黄点）。 */
function canDrawActor() {
  if (!LOOK || !LOOK.ready) return false
  return true
}

/**
 * ★M8-b/c：重建当前外观计划并装包。输入优先级 = `LOOK_OVERRIDE`（调试直通）> 会话态
 * `session.equipVec`/`mountEquipId`/`actorColor`（null = 跟随 `#avSel`）+ 裸装默认；
 * 计划签名未变且已就绪 ⇒ 直接复用（换图回图不重装）。
 */
async function syncLook() {
  const gen = ++lookGen
  const override = LOOK_OVERRIDE || {}
  const equipVec = override.equipVec ?? session.equipVec ?? []
  const mountEquipId = override.mountEquipId ?? session.mountEquipId ?? 0
  const [idx, manifest] = await Promise.all([CONTENT.loadEquipIndex(), CONTENT.loadActorManifest()])
  if (gen !== lookGen) return null
  const plan = ACTOR_LOOK.buildLookPlan({
    color: override.color ?? session.actorColor ?? currentActorColor(),
    equipVec,
    mountEquipId,
    itemIndex: idx?.items || null,
    rideTable: idx?.ride || null,
  })
  // ★M9-c（A·退役）：旧链的「自定义包缺 ⇒ 退黄点」判定（customRefs/missingCustom）随旧链一并退役；
  //   puppet 位缺包一律走 drawActor 的 fallback 链（缺包摘要仍每签名一行报 `missingMain`）。
  if (LOOK && LOOK.signature === plan.signature && LOOK.ready) {
    startActorAnim(); draw()
    return LOOK.plan
  }
  const look = await loadLookParts(plan, manifest, gen)
  if (!look || gen !== lookGen) return null
  LOOK = look
  pruneLookParts()
  if (look.missingMain.length) {
    logLookOnce('missing:' + plan.signature,
      `外观缺包（${plan.signature}）: ${look.missingMain.join(', ')}（每签名一行；有 fallback 的已用 fallback 绘制）`)
  }
  if (plan.warnings.length) logLookOnce('plan:' + plan.signature, '外观计划提示: ' + [...new Set(plan.warnings)].join(', '))
  startActorAnim(); draw()
  return look.plan
}

/** ★M8-b2/f：常驻帧动画循环（JS 路 + SWF 叠层）。按 24fps 推进 tick，仅当帧号变化时重绘。 */
function startActorAnim() {
  if (animRaf || !canDrawActor()) return
  animLastTs = 0
  groundElapsed = 0
  animRaf = requestAnimationFrame(stepActorAnim)
}
function stopActorAnim() {
  if (animRaf) cancelAnimationFrame(animRaf)
  animRaf = 0
  animLastTs = 0
}
function stepActorAnim(ts) {
  animRaf = 0
  if (!canDrawActor()) return
  const dt = animLastTs ? Math.min(100, ts - animLastTs) : ANIM_FRAME_MS
  animLastTs = ts
  animElapsed += dt
  groundElapsed += dt                   // 光轮时钟独立推进（不随 animElapsed 在切标签时归零）
  const tick = Math.floor(animElapsed / ANIM_FRAME_MS)
  if (tick !== animTick) {
    animTick = tick
    draw()
    // ★PI-f：个人信息面板预览蹭这同一个 24fps 时钟补帧（零新增 rAF；面板开着 ⇒ 地图循环必在）
    if (PI_PREVIEW) renderPreviewTo(PI_PREVIEW)
  }
  animRaf = requestAnimationFrame(stepActorAnim)
}

/**
 * ★M8-d：当前坐骑的垂直偏移（非坐骑 = 0；非浮动坐骑 = 静态 -50；浮动坐骑 = -50 ± 5 正弦）。
 * 懒建运动时钟：坐骑键（refId:resourceId）变了才重建 ⇒ 读档/换图/换装直接进入或延续浮动，`ride()` 动态换乘才走 2s 升起。
 */
function mountVisualOffset(now) {
  const plan = LOOK && LOOK.plan
  if (!plan || !plan.mount) return 0
  const base = plan.offsetY || 0
  if (!plan.mount.float) return base
  const key = plan.mount.refId + ':' + plan.mount.resourceId
  if (!mountMotion || mountMotion.key !== key) {
    const riseFrom = pendingMountRise
    pendingMountRise = null
    mountMotion = {
      key,
      startTs: now,
      fromY: riseFrom == null ? base : riseFrom,
      riseMs: riseFrom == null ? 0 : MOUNT_RISE_MS,
    }
  }
  const t = now - mountMotion.startTs
  if (t < mountMotion.riseMs) {
    const p = Math.max(0, Math.min(1, t / mountMotion.riseMs))
    const back = p * p * ((MOUNT_BACK_S + 1) * p - MOUNT_BACK_S)   // Back.easeIn（起步先微沉再升起）
    return mountMotion.fromY + (base - mountMotion.fromY) * back
  }
  return base + MOUNT_FLOAT_AMP * Math.sin(2 * Math.PI * (t - mountMotion.riseMs) / MOUNT_FLOAT_PERIOD_MS)
}

/**
 * 在 (x,y)（= 角色脚下原点）合成小赛尔：先阴影、后按层序自底向上逐层绘制。
 * 帧号 = 各层在自己的标签（run/stand × Up/Down）区间内按同一 tick 的 24fps 循环帧（上游每只 FramePlayer
 * 各自推进；`gotoAndPlay(body.currentFrameIndex)` 是空操作 ALC3）；切标签各层从自己的 start 起播（gotoLabel）；
 * 装备层站立只取 stand 标签首帧（ALC13：stand 区间可能是“展示动作”，如射手弓 `_1` 的射箭序列）；
 * 层序随上下切换 DOWN_ORDER/UP_ORDER；左右翻转 = 整体 `ctx.scale(flip,1)`（阴影/部件/坐骑同翻）。
 * 地面特效 = `session.groundMode` 二选一：阴影恒取 `localShadowFrame`（ALC14：本机静止帧，不跟 BODY 帧）；
 * 光轮取 `vipShadowFrame`（vip 标签 3–39，按自己的 `groundElapsed` 循环，不随角色标签切换归零）。
 * 跳过 hiddenSlots（坐骑态藏手/脚）与 w<=1||h<=1 的 1×1 隐藏裁帧；地面特效不吃 offsetY（坐骑抬起、特效留地面）。
 * 坐骑垂直偏移走 `mountVisualOffset`（静态 -50 / 浮动坐骑 ±5 正弦 + 动态骑上 2s 升起，M8-d）。
 */
function drawActor(ctx, x, y, scale = ACTOR_SCALE, dy = 0) {
  const look = LOOK
  if (!look || !look.ready || !look.body) return false
  const label = ACTOR_VIEW.labelOf(ACTOR_ANIM.moving, ACTOR_ANIM.up)
  if (label !== animLabel) { animLabel = label; animElapsed = 0; animTick = 0 }
  // 每层在自己的标签区间内循环（同一个 tick）：上游 MultipleEquipPlayer 对每只 EquipPlayer 各自推进帧号，
  // `gotoAndPlay(body.currentFrameIndex)` 实为空操作（ALC3）⇒ 坐骑 120403 的 standDown 25–60 不会被
  // BODY 的 25–97 拖住 37 帧（否则 idle 每圈末尾冻结约 1.5s，表现为「动画之间有停顿」）。
  const order = ACTOR_LOOK.slotOrder(ACTOR_ANIM.up ? 'up' : 'down')
  const layers = look.resolved.slice().sort((a, b) => order.indexOf(a.layer.slot) - order.indexOf(b.layer.slot))
  const flip = ACTOR_ANIM.right ? 1 : -1
  const offsetY = mountVisualOffset(performance.now())
  const hidden = new Set(look.plan.hiddenSlots || [])
  ctx.save()
  ctx.translate(x, y + dy)
  // 整体水平镜像：放变换里（而非逐层负宽 drawImage）⇒ 阴影 / 11 槽 / 坐骑一定同向翻转。
  ctx.scale(flip * scale, scale)
  const sh = look.shadow                      // 地面特效画在最底，自有序号与自有 anchor
  if (sh) {
    const groundFrame = session.groundMode === 'halo'
      ? ACTOR_VIEW.vipShadowFrame(sh.pack, Math.floor(groundElapsed / ANIM_FRAME_MS))
      : ACTOR_VIEW.localShadowFrame(sh.pack)
    const sf = ACTOR_VIEW.pickFrame(sh.pack, groundFrame)
    if (sf && sf.w > 1 && sf.h > 1) {
      const r = ACTOR_VIEW.frameRect(sh.pack, sf)
      ctx.drawImage(sh.bitmap, r.sx, r.sy, r.sw, r.sh,
        sf.ox - sh.pack.anchorX, sf.oy - sh.pack.anchorY, r.sw, r.sh)
    }
  }
  for (const { layer, asset } of layers) {
    if (hidden.has(layer.slot)) continue
    const f = !ACTOR_ANIM.moving && layer.freezeStand
      ? ACTOR_VIEW.labelStartFrame(asset.pack, label)
      : ACTOR_VIEW.cycleFrame(asset.pack, label, animTick)
    const rec = ACTOR_VIEW.pickFrame(asset.pack, f)
    if (!rec || rec.w <= 1 || rec.h <= 1) continue
    const r = ACTOR_VIEW.frameRect(asset.pack, rec)
    ctx.drawImage(asset.bitmap, r.sx, r.sy, r.sw, r.sh,
      rec.ox - asset.pack.anchorX, offsetY + rec.oy - asset.pack.anchorY, r.sw, r.sh)
  }
  ctx.restore()
  return true
}

// ★PI-f：个人信息面板左栏预览 = 同一 `drawActor`、同一 LOOK/ACTOR_ANIM/时钟 ⇒ 面板与地图形象恒一致。
// 画布尺寸按 CSS 盒 × 2 过采样（宿主 `.rv-scale` 缩放不至于 2× 内基本糊不了）；脚底基线留 26px 给阴影/光轮。
function renderPreviewTo(canvas) {
  if (!canvas || !canvas.isConnected) return
  const s = 2
  const w = canvas.clientWidth || 200
  const h = canvas.clientHeight || 210
  if (canvas.width !== w * s || canvas.height !== h * s) { canvas.width = w * s; canvas.height = h * s }
  const c = canvas.getContext('2d')
  c.setTransform(s, 0, 0, s, 0, 0)
  c.clearRect(0, 0, w, h)
  if (!canDrawActor() || !drawActor(c, Math.round(w / 2), h - 26, PI_PREVIEW_SCALE)) {
    c.fillStyle = '#8fb0d8'
    c.font = '12px sans-serif'
    c.textAlign = 'center'
    c.fillText('形象未就绪（外观计划未加载）', w / 2, h / 2)
  }
}

/** `#wrap` 点击 → client→stage 变换（同 `onStageMove`）；命中 26px 内光口 ⇒ 走过去并传送，否则自由走到点。 */
function jsClick(ev) {
  if (!M.jsMode || !ov) return
  if (ev.target && ev.target.closest && ev.target.closest('#rv')) return
  const r = ov.getBoundingClientRect()
  if (!r.width || !r.height) return
  const mx = (ev.clientX - r.left) * ov.width / r.width
  const my = (ev.clientY - r.top) * ov.height / r.height
  if (mx < 0 || mx > ov.width || my < 0 || my > ov.height) return
  // ★B3（VB3-d）：点击优先级 = **真 sprite 矩形** → 占位橙点圆（~16px）→ 光口（HOT_R=26）→ 走位。命中 NPC ⇒ `onNpcClick(id,'click')`（走对话/战斗），不吃走位。
  //   sprite 命中框 = `drawNpcs` 画的同一个矩形（**每项自带 `ax/ay`**：帧包项 = 包锚点 / PNG 项 = `NPC_ANCHOR` 左下角）；重叠取离 sprite 几何中心最近者。
  //   ⚠️ 本数组 **JS 路与 SWF 路都投**（B3 §7.1 起），与 `onSwfNpcCapture` 共用同一份 `M.npcHit` ⇒ 两条路同一套命中数学。
  const anch = NPC_ART.NPC_ANCHOR
  let npcHit = null, nbd = Infinity
  for (const s of M.npcHit) {
    const l = s.x - (s.ax ?? anch.ax) * s.w, t = s.y - (s.ay ?? anch.ay) * s.h
    if (mx >= l && mx <= l + s.w && my >= t && my <= t + s.h) {
      const cx = l + s.w / 2, cy = t + s.h / 2
      const d = Math.hypot(mx - cx, my - cy)              // 到 sprite 中心的距离（几何中心）
      if (d < nbd) { nbd = d; npcHit = s }
    }
  }
  if (npcHit) { petClick(npcHit.id); return }                     // ★MDB13-d：野怪走 `petClick`（先播惊讶、播完才 `onNpcClick`）；非野怪 NPC 内部直接透传，行为不变
  let dot = null, dbd = Infinity
  for (const m of M.npcMarkers) { const d = Math.hypot(mx - m.x, my - m.y); if (d <= 16 && d < dbd) { dbd = d; dot = m } }
  if (dot) { petClick(dot.id); return }                            // ★MDB13-d：占位橙点同样经 `petClick`（野怪在装载中/缺图时点击也先播后打）
  let hit = null, bd = Infinity
  for (const s of M.spots) { const d = Math.hypot(mx - s.x, my - s.y); if (d <= 26 && d < bd) { bd = d; hit = s } }   // HOT_R=26（复刻 MapRunner.spotAt）
  const tx = Math.max(0, Math.min(ov.width, hit ? hit.x : mx))
  const ty = Math.max(0, Math.min(ov.height, hit ? hit.y : my))
  M.walkTarget = { x: tx, y: ty, hit }
  startJsLoop()
}

const JS_SPEED = 0.28   // px/ms ≈ 280px/s 的自由走手感（无寻路，可穿"墙"= MB8/MB9 同口径）
let jsLastTs = 0
function startJsLoop() {
  if (rafHandle || (!M.jsMode && !M.puppet)) return
  jsLastTs = 0
  rafHandle = requestAnimationFrame(stepJs)
}
/** rAF 逐帧把 `M.pos` 定速挪向 `M.walkTarget`；到位且命中光口 ⇒ 传送（`gotoMap`），否则自动停（下次点击再启）。
 *  ★M9 puppet 位复用同一条数学：每帧改走 `puppetSync`（本地算相机 + 喂 AS3 setPos），到站 `wantWalk` ⇒ `walkReached`。 */
function stepJs(ts) {
  rafHandle = 0
  if ((!M.jsMode && !M.puppet) || !M.walkTarget || !M.pos) return   // 无目标 ⇒ 停转（不空跑）
  const dt = jsLastTs ? Math.min(50, ts - jsLastTs) : 16
  jsLastTs = ts
  const dx = M.walkTarget.x - M.pos.x, dy = M.walkTarget.y - M.pos.y
  const d = Math.hypot(dx, dy)
  // ★M8-d：坐骑加速 = 25/20（上游 DOGZ_RUN_SPEED 25 vs NOMARL 20，单位是 AS3 帧速 ⇒ 按比例乘 JS_SPEED，M8-I1）。
  const speedFactor = (LOOK && LOOK.ready && LOOK.plan && LOOK.plan.speedFactor) || 1
  const stepAmt = JS_SPEED * speedFactor * dt
  if (d <= stepAmt || d < 1) {
    M.pos.x = M.walkTarget.x; M.pos.y = M.walkTarget.y
    ACTOR_ANIM.moving = false               // ★M8-b2：停下保留最后朝向（PathMobile.stand）
    if (M.puppet) puppetSync(false)         // ★M9：末帧把最终位喂 AS3（供其 petActorArrived/相机保持）
    else draw()
    const hit = M.walkTarget.hit
    const want = M.wantWalk
    M.walkTarget = null; M.wantWalk = false
    if (want) {                             // ★M9：野怪把角色叫到脚下 ⇒ 回应 walkReached（AS3 状态机触发 startFight）
      try { M.player && M.player.walkReached && M.player.walkReached() }
      catch (e) { logLine('walkReached 调用失败: ' + ((e && e.message) || e)) }
      return
    }
    if (hit && hit.target) { logLine('光口抵达 → ' + nameOf(hit.target) + ' (' + hit.target + ')'); gotoMap(String(hit.target), true); return }
    return                                                   // 走到空地 ⇒ 停（下一次点击重启用循环）
  }
  const dir = ACTOR_VIEW.stepDirection(dx, dy)   // ★M8-b2：方向位（纯水平 ⇒ Down、纯垂直 ⇒ 朝右，同 PathMobile）
  ACTOR_ANIM.right = dir.right
  ACTOR_ANIM.up = dir.up
  ACTOR_ANIM.moving = true
  M.pos.x += dx / d * stepAmt; M.pos.y += dy / d * stepAmt
  if (M.puppet) puppetSync(true)             // ★M9：逐帧本地相机钳位 + 画叠层 + fire-and-forget setPos
  else draw()
  rafHandle = requestAnimationFrame(stepJs)
}

// ★M9：照抄 MapRunner.as:644-653 placeActor 相机钳位（吃 mapReady 的世界界 + 舞台尺寸）⇒ JS 与 AS3 同公式同 ax、每帧自算相机（零桥往返）。
function clampN(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }
function puppetCam(px, py) {
  const i = M.info || {}, s = M.swfStage || {}
  const sw = s.sw || 0, sh = s.sh || 0
  const mapX = i.mapX || 0, mapY = i.mapY || 0, mapW = i.mapW || 1200, mapH = i.mapH || 660
  const x = mapW <= sw ? 0 : clampN(-(px - sw / 2), -(mapX + mapW - sw), -mapX)
  const y = mapH <= sh ? 0 : clampN(-(py - sh / 2), -(mapY + mapH - sh), -mapY)
  return { x, y }
}
/** ★M9 puppet 每帧：本地算相机 → 60fps 画叠层 → `setPos` fire-and-forget 喂 AS3（返回值仅事后校准 `M.cam`，**不 await**、不挂起 rAF）。 */
function puppetSync(moving) {
  const c = puppetCam(M.pos.x, M.pos.y)
  M.cam.x = c.x; M.cam.y = c.y
  draw()
  const p = M.player
  if (!p || typeof p.setPos !== 'function') return
  try {
    const r = p.setPos(M.pos.x, M.pos.y, !!moving)
    if (moving && r && typeof r.then === 'function') r.then(s => {   // 事后校准：防本地舞台尺寸假设错/resize 漂移；仅在行走中、且仍目标态才补画
      const parts = String(s).split(','); const cx = Number(parts[0]), cy = Number(parts[1])
      if (Number.isFinite(cx) && Number.isFinite(cy)) { M.cam.x = cx; M.cam.y = cy; if (M.walkTarget) draw() }
    }).catch(() => {})
  } catch (e) { /* Ruffle 未就绪：下一帧 draw 会再同步，不刷屏 */ }
}

/**
 * ★MB9 + ★MDB11（人类 2026-10-21 点名 ③「两条路都走」）：野怪漫游循环 = **JS 路 + SWF 路都转**。
 * 旧口径「仅 JS 路、SWF 路野怪照 `MapRunner.as` 自己溜达」**已作废** —— 合成野怪表断粮后 AS3 不再生成 `WildPet`，
 *   SWF 图上的野怪只有我们叠加层这一份 ⇒ 漫游也只能由我们推。
 * 只在「有 ≥1 `_wander`」时转；全空 ⇒ 停（不空跑）。竞态：`leaveJsMode()`（两条路进图前都调）`cancelAnimationFrame(wanderRaf)`，新图由 `registerAndRunAuto` 重新播种起环。
 * ⚠️ **成本闸**：JS 路本来就逐帧 `draw()`（与角色走位同口径）；SWF 路**只在这一帧真有怪挪动、或帧包真的跳了一格才画** ——
 *   依据 = `wander.js` 的 `bob` 只推进 `bobPhase`、**从不写 `pos`**（`bobPhase` 全仓零消费者）⇒ 待机帧必然不动，不画不掉信息。
 *   实测怪动窗口 = `step 12~26 / speed 34` ≈ 0.35–0.76s，其余 2–3s 待机不画；puppet 路角色行走时本就逐帧 `draw()` ⇒ **不引入新的成本类别**。
 *   ★MDB12 追加：帧包走/站动画让**驻停也在换帧** ⇒ 判据扩成「挪动 **或** 帧变」；帧变受 `PET_FPS` 夹住 ⇒
 *     待机重绘从旧的 **0Hz** 升到 **≈12Hz**（移动仍 60Hz），**不是** rAF 级的 60Hz。
 */
function startWanderLoop() {
  if (wanderRaf) return
  if (!M.npcs.some((n) => n._wander)) return                 // 无漫游者 ⇒ 不起环
  wanderLastTs = 0
  wanderRaf = requestAnimationFrame(stepWanderLoop)
}
function stepWanderLoop(ts) {
  wanderRaf = 0
  const dt = wanderLastTs ? Math.min(100, ts - wanderLastTs) : 16   // 切后台回来夹上限（≤100ms ⇒ 不瞬移）
  wanderLastTs = ts
  const dtSec = dt / 1000
  let any = false, moved = false
  for (const n of M.npcs) {
    const w = n._wander
    if (!w) continue
    any = true
    const bx = w.pos.x, by = w.pos.y                          // ★MDB11：SWF 路的"怪动才重绘"闸 —— 步进前后各读一次 `pos`
    WANDER.stepWander(w, n.wild.movement, dtSec, Math.random)   // 无碰撞直线挪（可穿墙=已定，§8.8 等人眼）；★MDB10：气泡调度已迁出本循环
    if (w.pos.x !== bx || w.pos.y !== by) moved = true
  }
  if (!any) return                                              // 全部没了 ⇒ 停转
  // ★MDB12：帧包**走/站循环**的推进 —— 累加器按 `PET_FPS`（12Hz，人眼校常数）进 `tick`，**只有真的跳了一格**才算"帧变"。
  //   无 `_wander` 的帧包野怪（`mode="stationary"` 3 只）也顺带拿到 tick ⇒ 只要本图还有漫游者把环养着就动。
  let frameChanged = false
  for (const n of M.npcs) {
    const p = n._pet
    if (!p) continue
    const adv = Math.floor((p.acc += dt * PET_FPS / 1000))
    if (adv > 0) { p.acc -= adv; p.tick += adv; frameChanged = true }
  }
  if (moved || frameChanged) draw()                             // ★MDB11：JS 路本来逐帧画 ⇒ 这条闸对它是同一帧再画一次（等价）；SWF 路省掉待机帧的整层重绘
  wanderRaf = requestAnimationFrame(stepWanderLoop)
}

/**
 * ★MDB10：野怪 **talk 气泡调度循环**（★两条渲染路都转：JS 路与 SWF 路的 `_wander` 都能冒泡；★`MDB11` 起 SWF 路的怪同日也由 JS 播态）。
 * 与 `stepWanderLoop` 分开的理由 = 气泡**不依赖走位**（两个独立生命周期）；SWF 路的漫游循环**只在怪真挪动那帧**才 `draw()` ⇒ 本环**另在"气泡出现/消失"的跳变帧** `draw()`
 *   （无条件 60fps 重绘整张 `#npc` 是白烧；JS 路的 `stepWanderLoop` 本来就逐帧画，跳变多画一次无害）。
 * 停环：`M.npcs` 里没有 `_talk` 者 ⇒ 自然停转（不空跑）；换图/卸载经 `leaveJsMode()` 调 `stopTalkLoop()`。
 */
function startTalkLoop() {
  if (talkRaf) return
  if (!M.npcs || !M.npcs.some((n) => n._talk)) return             // 无说话者 ⇒ 不起环
  talkLastTs = 0
  talkRaf = requestAnimationFrame(stepTalkLoop)
}
function stopTalkLoop() {
  if (talkRaf) cancelAnimationFrame(talkRaf)
  talkRaf = 0
}
function stepTalkLoop(ts) {
  talkRaf = 0
  const dt = talkLastTs ? Math.min(100, ts - talkLastTs) : 16     // 切后台回来夹上限（与漫游循环同口径）
  talkLastTs = ts
  const dtSec = dt / 1000
  let any = false, toggled = false
  for (const n of M.npcs) {
    const st = n._talk
    if (!st) continue
    any = true
    const shown = st.timer > 0
    // `canStart` = 驻停才起新泡（上游 `OnRestStarted` 口径）：SWF 路没有 `_wander` ⇒ 恒可（照该路野怪由 MapRunner 自行驻停）。
    TALK.stepTalk(st, n.wild && n.wild.talk, dtSec, Math.random, () => !n._wander || n._wander.phase === 'idle')
    if ((st.timer > 0) !== shown) toggled = true
  }
  if (!any) return
  if (toggled) draw()
  talkRaf = requestAnimationFrame(stepTalkLoop)
}

// 目标图缺场景资源 (maps.json.swfOk=false 的 4 张): 老图还在屏幕上, 退回上一图恢复出口表
async function restoreAfterFail(url) {
  logLine('✗ 场景资源缺失 ' + url + (M.player ? ' → 退回上一图' : ''))
  if (!M.player) return
  const prev = M.hist.pop()
  if (prev) await worldLoad(prev)
}

// **单血统（编排线 ORP3，人类 2026-10-18）**：v2 官方线 / AS3 战斗线废弃 ⇒ 遇怪一律走重启内核 #/rbattle
// （读 game/core/** 内核 + `saves/save{id}.xml` 的队首）。原 `roco.battle.engine` 开关与其 localStorage 键已删。
// `restartOn()` 保留为常真 —— 既有工具/判据仍在调它（`tools/rbattle-*-test.mjs` 等）。
const restartOn = () => true
// ★MDB11（人类 2026-10-21）：`numericIdOfWild()` + `startWildFight()` **已随合成野怪表退役删除** ——
//   那条链是「AS3 `WildPet` → 走到脚下 → `mapWildFight` → 按槽位反查 `wild.json` 的数值 id → 开战」，
//   而现在不再生成 `WildPet` ⇒ 无对象。野怪遭遇的**唯一通路** = `onNpcClick → resolve→run → startMapBattle`（MB7，吃 Unity `<battle>`，与渲染路无关）。

// 地图清单 = tools/build-map-index.mjs 从爬取的 res/map/config/*.xml 生成
const FALLBACK_MAPS = ['1.swf', '100002.swf', '1000000.swf']
async function initMaps() {
  let list = []
  try {
    const r = await fetch('/game/data/maps.json')
    if (r.ok) list = (await r.json()).filter(m => m.swf)
  } catch { /* 无清单 */ }
  if (!list.length) list = FALLBACK_MAPS.map(s => ({ id: s.replace('.swf', ''), name: s.replace('.swf', ''), swf: s }))
  byId = new Map(list.map(m => [m.id, m]))
  M.hist = []
  await CONTENT.loadContent()          // 内容/宠表缓存预热（会话与战斗侧都依赖；★MDB11：与合成野怪表无关，原先挤在同一个 try 里）
  // ★MDB11（人类 2026-10-21）：**不再 fetch `/game/data/wild.json`** —— 那张表是我方合成（`build-wild-index.mjs` 头注：
  //   原版野怪清单来自服务端 socket 1103、不可得 ⇒ `hash(mapId)` 定数量、非真值）⇒ 文件留盘、**运行时零引用**；
  //   野怪分布**单一来源** = 地图 XML 的 `<npc><wild>`（110 只 / 53 张图），由 `registerAndRunAuto` 播种。
  try {
    await initSession()
    applyBattleResult()
    const st = A.state
    const dk = Object.keys(st.dex || {})
    const seen = dk.filter(k => st.dex[k].seen).length
    const caught = dk.filter(k => st.dex[k].caught).length
    logLine(`图鉴: 见过 ${seen} · 抓到 ${caught} · 队伍 ${st.team.length} 只 / 仓库 ${st.box.length} 只` + (A.isRestart ? ' · [v3 重启原生]' : ''))
  } catch (e) { logLine('会话载入失败: ' + e) }
  document.getElementById('mapSel').innerHTML = list
    .map(m => `<option value="${m.id}"${m.swfOk === false ? ' disabled' : ''}>${m.name || m.id} · ${m.id}${m.swfOk === false ? ' ⚠缺图' : ''}${(m.teleports || []).length ? ' ⇄' + m.teleports.length : ''}</option>`).join('')
  // ★MDB11：下拉项尾的 `⚔N`（这张图几只怪）**计数已移除** —— 旧数据源是合成表（当场可得），
  //   而 Unity 真值要**逐张 `loadMap` 才知道**、构建下拉时拿不到 ⇒ **不伪造**一个数（进图后看顶栏那句「N 只野怪」）。
  // 战斗场景「返回地图」带 map=; 启动直落仍只认下拉里可选的 SWF 图（缺画面的 JS 图经传送进入，见 renderMap）
  const want = P.get('map')
  if (want && byId.has(want) && byId.get(want).swfOk !== false) document.getElementById('mapSel').value = want
  // ★A2：所有入口统一走 `renderMap`（现场取图 → swfOk 分流 SWF/JS）
  document.getElementById('mapSel').onchange = () => { M.hist = []; renderMap(document.getElementById('mapSel').value) }
  // ★MB10「回原房间」：路由带了 `map=` 就**优先回那张图** —— 不管它在不在下拉里、`swfOk` 是不是 false
  //   （分流反转后 JS 路才是默认通路，那批图既不在下拉里、又带 `swfOk===false`；从前只认「下拉里可选的」
  //   ⇒ 战后回图被丢回下拉首项 = 进游戏的第一张图，也就是人话里的「出生点」）。进不去才退回下拉当前项。
  const entry = want || document.getElementById('mapSel').value
  if (!(await renderMap(entry)) && entry !== document.getElementById('mapSel').value) await renderMap(document.getElementById('mapSel').value)
}

const BAR = `<label>地图 <select id="mapSel"></select></label>
  <label>角色 <select id="avSel"></select></label>
  <button id="reloadBtn">重载</button>
  <button id="backBtn" disabled>↩ 返回上一图</button>
  <button id="dayNightBtn" style="display:none">☀⇄☾ 昼夜</button>
  <button id="gridBtn">显示可走栅格</button>
  <button id="walkBtn">走向测试点</button>
  <button id="statusBtn">状态</button>
  <span id="stat" style="color:#8b93a7"></span>`
// 图层顺序 = 原版固定图层之上叠我们的调试/中文补描层, Ruffle 播放器由 loadMapRunner append 在最前
// #portal = 传送点光口 (重启导出件), #prompt = 悬浮说明 (出口名)
const STAGE = `<canvas id="portal" width="1200" height="660"></canvas><canvas id="ov" width="1200" height="660"></canvas><canvas id="hudtxt" width="1200" height="660"></canvas><div id="bagtip"></div><div id="prompt"></div>`

// ★M8-a/c：外观调试入口 —— `dump`（只读计划）+ 正式会话入口 `equip/unequip/ride/unride/color` + b3 的 `ground`。
//   所有入口只改会话态（`session.equipVec`/`mountEquipId`/`actorColor`/`groundMode`）；
//   ★M8-g 起 `equip/unequip/ride/unride` **变更即经 repository 落 `<equip>`**（其余入口仍不写盘）；
//   非法参数 ⇒ 一行日志、不改状态。
//   参数一律是**物品 ID**（如 100577），不是资源标识（120301）/chipBackId（900011）。
const LOOK_EQUIP_SLOTS = [1, 2, 4, 5, 6, 7, 8]   // 可进 equipVec 的槽；3 = 坐骑（走 ride），9+ = NONO 服装（不支持）
function installActorLookDebug() {
  const itemOf = (idx, refId) => {
    const items = idx && idx.items
    return items ? (items[refId] ?? items[String(refId)] ?? null) : null
  }
  const swfNote = () => {
    if (M.jsMode) return ''
    if (canDrawActor()) return '（SWF 图：提线叠层已开）'
    return '（SWF 图：外观计划未就绪 ⇒ 暂黄点顶到位）'
  }
  const planNote = (plan) => (plan ? plan.signature : '未就绪（缺包/取数失败，见控制台）')
  // ★M8-g：外观变更即落盘（唯一写盘口 = `session.save` → repository，写根级 `<equip>`）。
  //   失败只记日志、**不回滚会话态**（与既有保存口径一致）；未登录/无会话时 save 自己空转。
  const persistLook = () => {
    saveSession().catch((e) => {
      console.error('[actorLook] 外观落盘失败', e)
      logLine('[actorLook] 外观落盘失败（见控制台）')
    })
  }
  APP.actorLook = {
    async dump() {
      const [idx, manifest] = await Promise.all([CONTENT.loadEquipIndex(), CONTENT.loadActorManifest()])
      if (!idx) console.warn('[actorLook] equip-index 未加载：自定义件/坐骑计划只能退默认裸装')
      const itemIndex = idx?.items || null
      const rideTable = idx?.ride || null
      const packs = manifest?.packs || {}
      const nakedProbe = new Map()
      const probe = (url) => {
        if (!nakedProbe.has(url)) {
          nakedProbe.set(url, fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false))
        }
        return nakedProbe.get(url)
      }
      const currentColor = session.actorColor ?? currentActorColor()
      const scenarios = [
        [`⓪ 当前会话（color=${currentColor}, equip=${session.equipVec.length} 件, mount=${session.mountEquipId || '—'}）`,
          { color: currentColor, equipVec: session.equipVec.slice(), mountEquipId: session.mountEquipId }],
        ['① 裸装（蓝）', { color: 'BLUE' }],
        ['② equipVec=[100577]（头，资源 120301）', { color: 'BLUE', equipVec: [100577] }],
        ['③ mountEquipId=101020（坐骑，资源 136403）', { color: 'BLUE', mountEquipId: 101020 }],
      ]
      for (const [label, opts] of scenarios) {
        const plan = ACTOR_LOOK.buildLookPlan({ itemIndex, rideTable, ...opts })
        const rows = []
        for (const l of plan.layers) {
          const status = l.source === 'naked'
            ? ((await probe(`/game/data/actor/${l.pack}.bin`)) ? 'ok' : 'missing')
            : (packs[l.pack]?.files?.[l.suffix] ? 'ok' : 'missing')
          rows.push({
            part: l.part, slot: l.slot, refId: l.refId, resourceId: l.resourceId,
            asset: l.source === 'naked' ? `${l.pack}.bin` : `${l.pack}${l.suffix}`,
            source: l.source, mirror: l.mirror ? 'Y' : '', status,
          })
        }
        console.group(`[actorLook] ${label}  signature=${plan.signature}`)
        console.table(rows)
        console.log(`mount=${plan.mount ? `${plan.mount.refId}/${plan.mount.resourceId}` : 'null'} ` +
          `offsetY=${plan.offsetY} hiddenSlots=[${plan.hiddenSlots.join(',')}] ` +
          `speedFactor=${plan.speedFactor} float=${plan.mount ? (plan.mount.float ? 'Y' : 'N') : '-'}`)
        if (plan.warnings.length) console.warn('warnings:', plan.warnings)
        console.groupEnd()
      }
      logLine('[actorLook] 已打印 4 组外观计划到控制台（dump 只读，不改画面）')
    },
    // ★M8-b3/c：光轮 / 阴影互斥切换（会话态 `session.groundMode`，默认 `shadow`；不写盘，刷新即回默认）。
    //   `halo` = `UI_ActorShadow` 的 `vip` 标签（3–39）连续循环，角色照常播自己的 idle；
    //   `shadow` = `local` 静止帧（ALC14）。SWF 图自 M8-f 起在叠层开启时同样生效（无自定义外观仍黄点基线）。
    ground(mode) {
      session.groundMode = (mode === 'halo' || mode === 'vip' || mode === '光轮') ? 'halo' : 'shadow'
      if (canDrawActor()) { startActorAnim(); draw() }
      logLine(`[actorLook] 地面特效: ${session.groundMode === 'halo' ? '光轮（VIP，循环）' : '阴影（本机，静止）'}${swfNote()}`)
      return session.groundMode
    },
    /** 穿/换一件装备（物品 ID）：同槽替换、保留原位置；槽 3 请用 `ride()`。 */
    async equip(refId) {
      const id = Math.trunc(Number(refId))
      if (!(id > 0)) { logLine('[actorLook] equip: 非法物品 ID ' + refId); return null }
      const idx = await CONTENT.loadEquipIndex()
      const item = itemOf(idx, id)
      if (!item) { logLine(`[actorLook] equip: 物品索引里没有 ${id}（索引未就绪？确认经 tools/serve.mjs）`); return null }
      const slot = Math.trunc(Number(item.slot) || 0)
      if (slot === ACTOR_LOOK.SLOT.DOGZ_RIGHT) { logLine(`[actorLook] equip: ${id} 是坐骑（slot 3），请用 ride(${id})`); return null }
      if (!LOOK_EQUIP_SLOTS.includes(slot)) { logLine(`[actorLook] equip: ${id} 的槽位 ${slot} 不支持（1/2/4–8；9+ = NONO 服装）`); return null }
      const vec = session.equipVec.slice()
      // 同槽替换（ALI5：按槽位去重、自定义优先；保留原位置 ⇒ 保存顺序稳定）
      const at = vec.findIndex((v) => {
        const cur = itemOf(idx, v)
        return cur && Math.trunc(Number(cur.slot) || 0) === slot
      })
      if (at >= 0) vec[at] = id
      else vec.push(id)
      session.equipVec = vec
      LOOK_OVERRIDE = null                   // 正式入口接管画面（防止遗留的 preview 覆盖把改动藏住）
      const plan = await syncLook()
      persistLook()
      logLine(`[actorLook] equip: ${id}（${item.name || '?'}，slot ${slot}）⇒ ${planNote(plan)}${swfNote()}`)
      return plan
    },
    /** 卸一件装备（物品 ID）；默认装由 L1 `mergeDefaultEquip` 自动补。 */
    async unequip(refId) {
      const id = Math.trunc(Number(refId))
      if (!(id > 0)) { logLine('[actorLook] unequip: 非法物品 ID ' + refId); return null }
      if (!session.equipVec.includes(id)) { logLine(`[actorLook] unequip: ${id} 不在已装备列表里`); return null }
      session.equipVec = session.equipVec.filter((v) => v !== id)
      LOOK_OVERRIDE = null
      const plan = await syncLook()
      persistLook()
      logLine(`[actorLook] unequip: ${id} ⇒ ${planNote(plan)}${swfNote()}`)
      return plan
    },
    /** 骑上坐骑（**装备物品 ID**，如 101020；不是 chipBackId 900011）：校验 slot 3。 */
    async ride(equipId) {
      const id = Math.trunc(Number(equipId))
      if (!(id > 0)) { logLine('[actorLook] ride: 非法装备 ID ' + equipId); return null }
      const idx = await CONTENT.loadEquipIndex()
      const item = itemOf(idx, id)
      if (!item) { logLine(`[actorLook] ride: 物品索引里没有 ${id}（索引未就绪？确认经 tools/serve.mjs）`); return null }
      if (Math.trunc(Number(item.slot) || 0) !== ACTOR_LOOK.SLOT.DOGZ_RIGHT) {
        logLine(`[actorLook] ride: ${id} 不是坐骑（slot ${item.slot}，坐骑 = slot 3）`)
        return null
      }
      session.mountEquipId = id
      session.ridingPetInfo = null
      LOOK_OVERRIDE = null
      // ★M8-d：浮动坐骑动态换乘 ⇒ 从当前抬升量起做 2s 升起（原本没骑 ⇒ 从 0）；非浮动坐骑不消费。
      pendingMountRise = LOOK && LOOK.plan && LOOK.plan.mount ? mountVisualOffset(performance.now()) : 0
      const plan = await syncLook()
      if (pendingMountRise !== null) pendingMountRise = null   // 未消费（SWF 路/计划未就绪）⇒ 丢弃，别留给下次进图
      persistLook()
      logLine(`[actorLook] ride: ${id}（${item.name || '?'}）⇒ ${planNote(plan)}${swfNote()}`)
      return plan
    },
    async unride() {
      session.mountEquipId = 0
      session.ridingPetInfo = null
      LOOK_OVERRIDE = null
      mountMotion = null                     // ★M8-d：卸下即时归零（同 Actor.removeDogz，无降下 tween）
      pendingMountRise = null
      const plan = await syncLook()
      persistLook()
      logLine(`[actorLook] unride ⇒ ${planNote(plan)}${swfNote()}`)
      return plan
    },
    /** 角色颜色（0..11，或 BLUE/RED；`null` = 回跟随 `#avSel`）。只改会话态，不改 SWF 的 actorColor 入参（M8-I6）。 */
    async color(n) {
      if (n == null) {
        session.actorColor = null
        LOOK_OVERRIDE = null
        const plan = await syncLook()
        logLine(`[actorLook] color: 跟随 #avSel（${currentActorColor()}）⇒ ${planNote(plan)}${swfNote()}`)
        return plan
      }
      const idx = ACTOR_LOOK.colorIndexOf(n)
      if (idx < 0) { logLine(`[actorLook] color: 非法颜色 ${n}（0..11 或 BLUE/RED）`); return null }
      session.actorColor = idx
      LOOK_OVERRIDE = null
      const plan = await syncLook()
      logLine(`[actorLook] color: ${idx}（${ACTOR_LOOK.DEFAULT_COLORS[idx].name}）⇒ ${planNote(plan)}${swfNote()}`)
      return plan
    },
    // ★M8-b 手测直通：临时套用一组外观（**不改会话态**；preview/clear 成对用）。
    //   正式入口 = 上面的 equip/unequip/ride/unride/color；preview 保留给"整组对照"调试。
    async preview(opts = {}) {
      LOOK_OVERRIDE = {
        color: opts.color ?? currentActorColor(),
        equipVec: Array.isArray(opts.equipVec) ? opts.equipVec.slice() : [],
        mountEquipId: Number(opts.mountEquipId) || 0,
      }
      const plan = await syncLook()
      logLine(`[actorLook] preview: ${planNote(plan)}${swfNote()}`)
      return plan
    },
    /** 全清：撤调试覆盖 + 清空会话外观（裸装 + 阴影 + 颜色回跟随 #avSel）。 */
    async clear() {
      LOOK_OVERRIDE = null
      session.equipVec = []
      session.mountEquipId = 0
      session.ridingPetInfo = null
      session.actorColor = null
      session.groundMode = 'shadow'
      mountMotion = null
      pendingMountRise = null
      const plan = await syncLook()
      logLine('[actorLook] 已清除外观（会话态清空 ⇒ 裸装 + 阴影）')
      return plan
    },
  }
}

export async function mount(query) {
  P = query || new URLSearchParams()
  document.getElementById('ctrlButtons').innerHTML = BAR
  const wrap = document.getElementById('wrap')
  wrap.innerHTML = STAGE
  dialogEl = null; M.dialogNpc = null          // ★MB6：#wrap 重建 ⇒ 旧浮层引用作废（防重挂泄漏）
  npcEl = null; npctx = null                   // ★B3：#wrap innerHTML 重写 ⇒ 旧 `#npc` 节点已脱离 DOM，作废引用让 `ensureNpcLayer` 在新 DOM 上重建
  ov = document.getElementById('ov'); octx = ov.getContext('2d')
  hctx = document.getElementById('hudtxt').getContext('2d')
  tipEl = document.getElementById('bagtip')
  portalEl = document.getElementById('portal'); pctx = portalEl.getContext('2d')
  promptEl = document.getElementById('prompt')
  portalImg = new Image()
  portalImg.onload = () => drawPortals()     // 图到之前 #portal 是空的, 到了补画一次
  portalImg.src = PORTAL_SRC
  document.getElementById('avSel').innerHTML = Object.entries(COLORS).map(([v, k]) => `<option value="${v}">${k}</option>`).join('')
  // 战斗刚改过的是**同一份内存态**（会话单例）⇒ 回图直接复用；档在 `saves/save{id}.xml`
  A = (session.active && session.gid === sessionGid()) ? session.active : null
  SAVE = Object.assign({ name: '小赛尔', level: 1, coins: 5000, diamonds: 0, bag: [], items: null })
  showGrid = false
  M.spawn = parseSpawnParam(P.get('spawn'))   // ★MB5：一次性落点入参（changeScene('map',{spawn})，TPQ5；消费即清）
  document.getElementById('reloadBtn').onclick = () => { document.getElementById('hint').textContent = '载入中…'; M.hist = []; renderMap((M.map && M.map.id) || document.getElementById('mapSel').value) }
  document.getElementById('backBtn').onclick = () => { const prev = M.hist.pop(); if (prev) renderMap(prev) }
  document.getElementById('dayNightBtn').onclick = () => { onMirrorClick() }   // ★MB5：昼夜镜像（仅 switch===±1 时可见）
  document.getElementById('gridBtn').onclick = ev => {
    showGrid = !showGrid; ev.target.classList.toggle('on', showGrid)
    if (showGrid && !M.grid) sendWalkGrid(); else draw()
  }
  document.getElementById('statusBtn').onclick = () => {
    try { document.getElementById('stat').textContent = M.player?.getStatus?.() || 'no player' } catch (e) { document.getElementById('stat').textContent = 'err ' + e }
  }
  document.getElementById('walkBtn').onclick = async () => {
    if (!M.info) return
    const t = (loadMapRunner.n = (loadMapRunner.n || 0) + 1) % 4
    const fx = [0.25, 0.75, 0.6, 0.3][t], fy = [0.55, 0.75, 0.9, 0.65][t]
    if (M.jsMode) { M.walkTarget = { x: M.info.mapW * fx, y: M.info.mapH * fy, hit: null }; startJsLoop(); return }   // ★A2：JS 路无寻路，直接给自由走目标
    try { M.player.walkTo(M.info.mapX + M.info.mapW * fx, M.info.mapY + M.info.mapH * fy) } catch (e) { logLine('walkTo err ' + e) }
  }
  addEventListener('message', onMessage)
  addEventListener('mousemove', onStageMove)     // 光口悬浮说明 (只判不点; 点击仍由 SWF 的 spotAt 接管)
  // 这些在旧 map.html 里是 classic script 的全局, 搬进模块就成了模块作用域 —— 显式挂回 window,
  // 供 tools/verify-*.mjs 与调试控制台直接调用 (战斗侧的同类入口是 window.battleApp)。
  Object.assign(window, {
    M, nameOf, labelOf, SAVE, logLine, updateHint, pushHud, applyBattleResult,
    petDB, itemDB, bagRecords, itemRows, petRows, toggleBag, togglePetBag, toggleRefresh,
    useItem, showBagTip, showPetTip, onHudClick, loadMapRunner, worldLoad, gotoMap, sendWalkGrid, draw, drawPortals,
    restartOn, initSession, getActiveStore: () => A,
    mountRestartHud, openRestartPetBag, openRestartItemBag, refreshHud, getHud: () => HUD, getBag: () => BAG, getItemBag: () => ITEMBAG,
    // ★MB5：Unity 侧数据与派发入口（`onNpcClick` 供 B3 把 NPC 画上屏后接线；本批无 DOM 命中面）
    onNpcClick, registerAndRunAuto, loadUnityInto, onMirrorClick, getUnity: () => M.unity, getNpcs: () => M.npcs, getMapEnv: () => M.env,
    // ★A2：单一渲染入口 + JS 回退通路（供调试台直接切图 / 观察 JS 态）
    renderMap, enterJsMode, enterSwfMode, leaveJsMode,
    // ★A2b/M8-b：JS 图角色（外观计划 + 11 槽合成）供调试台直接观察/重取
    syncLook, drawActor, getLook: () => LOOK,
  })
  installActorLookDebug()                        // ★M8-a：APP.actorLook.dump()（只读计划）
  initMaps()
}

export function unmount() {
  removeEventListener('message', onMessage)
  removeEventListener('mousemove', onStageMove)
  leaveJsMode()                                  // ★A2：取消 rAF、摘 #wrap 点击、移走 #bgc、清 JS 态（防重挂泄漏）
  document.getElementById('wrap').innerHTML = ''   // ruffle-player 脱离 DOM 即 destroy; #rv 常驻层随之清空
  M.player = null
  // ★M9-c（A·退役）：f2 显隐缓存/平滑跟随已随旧链删除
  portalEl = pctx = promptEl = portalImg = null    // 图层随 #wrap 一起没了
  HUD = null; BAG = null; ITEMBAG = null; ACTIVITY_PANEL = null; DEX_PANEL = null; GODPET_PANEL = null; GUIDE_PANEL = null; PINFO = null   // DOM HUD/背包/活动/图鉴/灵兽/指引/个人信息随 #wrap 一起没了, 作废引用 (下次 mount 重建)
  PI_PREVIEW = null                            // ★PI-f：面板预览画布随 #wrap 一起没（防悬挂引用）
  delete APP.actorLook                           // ★M8-a：调试入口随场景卸载作废（下次 mount 重装）
  groundElapsed = 0                              // ★M8-b3/c：光轮相位是场景局部量（模式本身在 session.groundMode，切图保持）
  mountMotion = null; pendingMountRise = null    // ★M8-d：坐骑浮动/升起是场景局部量（坐骑本身在 session.mountEquipId）
  // ★MB5：Unity 侧是**场景局部数据**（光口/实体/键袋随 `unmount` 生灭，**不建死键 `mapTeleportList`**，TPC9/OR1）
  M.unity = null; M.npcs = []; M.npcById = {}; M.env = null; M.spawn = null
  dialogEl = null; M.dialogNpc = null          // ★MB6：对话浮层随 #wrap 一起没 ⇒ 作废引用
}
