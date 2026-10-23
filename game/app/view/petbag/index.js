// L3 · 精灵背包/仓库面板装配入口。把 L1（source/grid/actions）与视图构件接起来，
// 对外只暴露 create(container, A, opts)（沿用 mapScene 的 openPanel 接线口径）。
// opts 由装配层 mapScene 注入：
//   { host, petBag, petStorage, describePet, onWrite, showHint, askHint, onClose,
//     logic: { createPetBagSource, createGrid, actions, BAG_SIZE, PAGE_SIZE } }
// ⚠️ **L3 纪律（2026-10-18 收敛）**：本文件**不 import** `game/logic/**`（`docs/arch-code.md §3` 硬规则 #3）。
//    2026-10-17 首版曾直接 import `logic/petbag/{source,grid,actions,constants}`（4 行，未登记）；
//    人类 2026-10-18 拍板「收敛成注入」⇒ 四个逻辑件改由**装配层** `mapScene` 经 `opts.logic` 交进来。
// 铁律：视图不碰存档面；落盘只发**信号** opts.onWrite（R4 由装配层实现）；取词(key→文案)归 View。
import * as CONTENT from '../../content.js'
import { elementName } from '../panels/battle/_kit.js'
import { openPanel, closePanel } from '../panels/host.js'
import { buildBagPanel } from './bagPanel.js'
import { buildStoragePanel } from './storagePanel.js'
import { openPersonality } from './personalityPane.js'
import { createSkillOverlay } from './skillPane.js'

// R5 取词：把 action/提示的 key 换成中文串（上游 openHintbox 传字串 ⇒ 改造点，View 侧集中一处映射）
const TEXT = {
  'bag.setFirst': (a) => `已把 ${a[0] || ''} 设为首发`,
  'bag.healAll': () => '全队体力已恢复',
  'bag.stored': (a) => `${a[0] || ''} 已入仓库`,
  'bag.pickReplace': () => '出战已满：请先换下一只再上阵',
  'bag.swapEmpty': () => '换位两端都要有精灵',
  'bag.teamEmpty': () => '备用区是空的，无可换队伍',
  'bag.needOneProtect': () => '至少要保留一只精灵',
  'bag.skinPending': (a) => `${a[0] || ''} 皮肤：三表数据桥（决议 ④）已建、消费端属 T2·19（待接）`,
  'bag.battleTestPending': () => '测试对战：属 R6 判定宿主（面板不带后门，待接）',
  'bag.animOn': (a) => `预览动画：${a[0] || '待机'}`,
  'bag.animPending': () => '预览动画：无播放器（Ruffle 未载 / 素材缺失）',
  // 技能换位取词（真值 docs/view/panel/petbag/skill-panel-design.md §7.3）
  'skill.swapped': (a) => `已把「${a[1] || ''}」换上「${a[0] || '空'}」`,
  'skill.superSwapped': (a) => `必杀技：${a[1] || ''} → ${a[0] || '无'}`,
  'skill.notLearned': () => '这个技能还没学会，换不了',
  'skill.notSuper': () => '行为技/必杀技不能放进常规技能位',
  'skill.sameSlot': () => '已经在这一格了',
  'skill.pickFirst': () => '四个技能位都满了：先点一个要换掉的当前技能',
  'bag.secretSkillPending': () => '隐藏技能：面板归 D7 / 秘技分析报告（登记 impl §11）',
  'storage.released': (a) => `${a[0] || ''} 已放生`,
  'storage.favorited': (a) => `${a[0] || ''} 已收藏`,
  'storage.unfavorited': (a) => `${a[0] || ''} 取消收藏`,
  'storage.releaseReadOnly': () => '该宿主的仓库只读，不能放生',
  'storage.releaseFavorited': () => '收藏中的精灵不能放生',
  'storage.releaseConfirm': () => '确定放生这只精灵？此操作不可撤销',
  'storage.pickReplace': () => '背包已满：先腾一个位置再取出',
}
const textOf = (h) => (h && TEXT[h.key] ? TEXT[h.key](h.args || []) : (h ? h.key : ''))

export function create(container, A, opts = {}) {
  // 逻辑件由装配层注入（L1 不许被 L3 直接 import）—— 缺了就**大声报**，不静默降级
  const L = opts.logic
  if (!L || typeof L.createPetBagSource !== 'function' || typeof L.createGrid !== 'function'
      || !L.actions || !Number.isFinite(L.BAG_SIZE) || !Number.isFinite(L.PAGE_SIZE)
      || !L.skillOps || typeof L.skillOps.buildModel !== 'function') {
    throw new Error('petbag 视图缺少逻辑件：装配层须传 opts.logic = { createPetBagSource, createGrid, actions, skillOps, BAG_SIZE, PAGE_SIZE }（L3 不许直接 import game/logic/**，见 docs/arch-code.md §3）')
  }
  const src = L.createPetBagSource({
    host: opts.host || 'normal',
    bag: opts.petBag,
    describePet: opts.describePet,
  })
  src.setStorage(opts.petStorage || [])
  const bagGrid = L.createGrid({ capacity: L.BAG_SIZE, items: src.bag(), pageSize: L.PAGE_SIZE })
  const storageGrid = L.createGrid({ items: src.storage(), pageSize: L.PAGE_SIZE })

  // 背包操作走 bagGrid（宠袋收缩时它退页），仓库操作走 storageGrid
  const STORAGE_OPS = new Set(['takeOut', 'release', 'favorite'])

  let noteSink = () => {}
  let bagCtrl = null, storageCtrl = null, skillEntry = null, skillCtrl = null
  // 技能调整盖板 = **第二层面板**（design §4.2 / SPQ8）：叠在背包面板之上；关背包 ⇒ 先关盖板
  const closeSkillPanel = () => {
    if (skillEntry) { const e = skillEntry; skillEntry = null; skillCtrl = null; closePanel(e) }
  }
  const openSkillPanel = () => {
    if (skillEntry) { skillCtrl?.render(); return }
    // openPanel 返回它自己的栈项 ⇒ 关闭时按项关，不会误关栈顶的别的面板
    skillEntry = openPanel('rb-skillpanel', (root) => {
      skillCtrl = createSkillOverlay(root, {
        getPet: () => (bagCtrl ? src.bag()[bagCtrl.sel()] : null),
        skillModelOf: ctxBase.skillModelOf,
        runSkill: ctxBase.runSkill,
        notify: ctxBase.notify,
        onClose: () => { closeSkillPanel(); bagCtrl?.render() },
        // 盖板右上角 ✕ = 关掉整个背包面板（盖板已盖住背包面板自己那颗 ✕，故这里自带一颗）
        onCloseBag: () => { closeSkillPanel(); opts.onClose ? opts.onClose() : {} },
      })
    })
  }

  // 六维吃**档里真个体值**（iv/ev/性格；petConfig 默认中性 iv0/p0 = 显示错数，真机档 currentStatus 即真值算的）。
  // 性格读**内存索引**（改性格后即时生效，不等存盘）。
  const cfg = (pet) => (pet ? CONTENT.petConfig(pet.petId, pet.level, opts.petProfileOf ? opts.petProfileOf(pet) : undefined) || {} : {})
  const ctxBase = {
    root: container,
    src, bagGrid, storageGrid,
    describePet: opts.describePet,
    cfg,
    elementName,
    nameOf: (pet) => (pet ? (opts.describePet?.(pet)?.name || CONTENT.restartNameOf(pet.petId) || ('#' + pet.petId)) : ''),
    statsOf: (pet) => cfg(pet).stats || {},
    evolve: (pet) => CONTENT.restartEvolveOf(pet.petId),
    evoName: (id) => CONTENT.restartNameOf(id),
    allPets: () => src.bag().filter((p) => p != null),
    // idle 动画台的素材指针（原版 fight SWF 的 swfId，与战斗/头像同一桥：content.swfIdOf）
    swfIdOf: (pet) => CONTENT.swfIdOf(pet.petId),
    money: () => ({ coins: A.state.trainer?.coins || 0, diamonds: A.state.trainer?.diamonds || 0 }),
    // 显示区 HUD / 信息面板的**注入读数**（v3 宠形状只有 {uid,petId,level,exp,hp} ⇒ 缺的画 —，不伪造）
    hudOf: (pet) => (opts.hudOf ? opts.hudOf(pet) : {}),
    buffsOf: (pet) => (opts.buffsOf ? opts.buffsOf(pet) : { innate: [], acquired: [] }),
    expToNext: (pet) => (opts.expToNext ? opts.expToNext(pet) : '—'),
    evolveLevel: (pet) => {
      const ev = CONTENT.restartEvolveOf(pet.petId) || []
      return ev.length ? ev[0].at : '—'
    },
    personalityName: (pet) => (opts.personalityName ? opts.personalityName(pet) : String(pet.personality ?? 0)),
    personalityBonus: (pet) => (opts.personalityBonus ? opts.personalityBonus(pet) : '—'),
    evLabel: (pet) => (opts.evLabel ? opts.evLabel(pet) : '未接'),
    // 显示读数（HUD 六项 + 基础信息行的档里原值；表 lookup 归装配层）
    petReadout: (pet) => (opts.petReadout ? opts.petReadout(pet) : {}),
    kizunaLabel: (pet) => (opts.kizunaLabel ? opts.kizunaLabel(pet) : '—'),
    confirm: (spec) => (opts.askHint ? opts.askHint(spec) : Promise.resolve('ok')),
    notify: (h) => { opts.showHint?.(h); noteSink(textOf(h)) },
    openPersonality: (args) => openPersonality(args),
    run: (name, args) => {
      const grid = STORAGE_OPS.has(name) ? storageGrid : bagGrid
      const fn = L.actions[name]
      if (!fn) return { ok: false, write: null }
      const r = fn(src, grid, args)
      if (r.hint) { opts.showHint?.(r.hint); noteSink(textOf(r.hint)) }
      if (r.write) opts.onWrite?.(r.write)   // 只发"已改"信号，落盘动作在装配层（V-5）
      return r
    },
    // ── 精灵技能面板（skillPane.js 只发意图；过滤/守卫/分页在 L1 skill-ops）────────────
    // 归一化模型 = 档里的三个字段 + 等级 + 技能表（design §5.1/§5.2）；表只经 L2 content.skillLearnOf。
    skillModelOf: (pet) => L.skillOps.buildModel(
      opts.petSkills ? opts.petSkills(pet) : { own: [], normal: [], super: 0 },
      pet.level | 0,
      CONTENT.skillLearnOf(pet.petId),
      CONTENT.skillView, // 进化后旧招不在本形态技能表里 ⇒ 用全局表兜底取名字/类型（skill-ops ①b）
    ),
    runSkill: (op, pet, args) => {
      const fn = L.skillOps[op]
      if (!fn) return { ok: false, skills: null }
      const r = fn(ctxBase.skillModelOf(pet), args)
      if (r.hint) { opts.showHint?.(r.hint); noteSink(textOf(r.hint)) }
      if (r.ok && r.skills) {
        opts.setPetSkills?.(pet, r.skills)      // 就地改真档子树（会话层）
        opts.onWrite?.('skill')                 // 只发信号，落盘在装配层（V-5）
      }
      return r
    },
    openStorage: () => openStorage(),
    openSkillPanel,
    onPetChange: () => skillCtrl?.render(),
    onClose: () => { closeSkillPanel(); return opts.onClose ? opts.onClose() : {} },
  }

  function openStorage() {
    openPanel('rb-petstorage', (root, api) => {
      const sctx = { ...ctxBase, root, onClose: () => { api.close(); if (bagCtrl) bagCtrl.render() } }
      storageCtrl = buildStoragePanel(sctx)
      noteSink = storageCtrl.setNote
    })
  }

  bagCtrl = buildBagPanel(ctxBase)
  noteSink = bagCtrl.setNote
  bagCtrl.render()

  return {
    update: () => bagCtrl.render(),
    destroy: () => { scrimRemove(container) },
    get selectedSlot() { return bagCtrl.sel() },
  }
}

function scrimRemove(root) { root.textContent = '' }
