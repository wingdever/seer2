// 选择角色场景（重启血统 Login）的画面与状态机 —— 设计 docs/view/scene/start/view-scene-start-design.md §3.2/§4
// 施工图 docs/view/scene/start/view-scene-start-impl.md §4（**STB-c 落版式 · STB-d/e 接线已落 2026-10-18**）
// 血统纪律 STI4 / 零算数 STI3 / 不伪造 STI2。
//
// ⚠️ **本文件不 import 存档层**（`game/logic/` 下的存档模块）**也不 import 会话**（`game/app/session.js`）：
//    `game/app/view/**` 是 L3（`docs/arch-code.md §3` 第 3 条，唯一登记例外 = view → `content.js`）。
//    存档读写与值转换全在 **`game/app/scenes/loginScene.js`**，本视图只做「取数 + 拼接 + 显隐」，
//    经 `opts` 收 `slots`（3 格的投影结果）与三个回调（`onCreate` / `onImport` / `onEnterMap`）。
import { openHintbox } from '../panels/hintbox.js'

const SPRITE = '/projects/Seer2-Restart-Lite-main/Assets/StaticResources/Sprites/Title'
const asset = (file) => `${SPRITE}/${file.replace(/ /g, '%20')}`
const url = (file) => `url("${asset(file)}")`

// 每格的"小赛尔"机器人（上游 `Login.unity` 的 `Seer Robot`：`Robot/7001.png`，96×149，中锚 y=−35，三格同一张）。
// ⚠️ 素材不在 Title 目录下 ⇒ 另起一条基址（`Assets/Resources/Sprites/Game/Robot/`，人类 2026-10-18 拍板"格子加"）。
const ROBOT_SPRITE = '/projects/Seer2-Restart-Lite-main/Assets/Resources/Sprites/Game/Robot'
const robotUrl = (file) => `url("${ROBOT_SPRITE}/${file}")`

const mk = (cls, tag = 'div') => {
  const el = document.createElement(tag)
  el.className = cls
  return el
}

// mount(el, opts) → handle{el, update(slots), destroy()}。el = 面板宿主给的 960×refH 逻辑画布（host.js）。
// opts.slots[]   = [{gid, nickname, gender:'male'|'female', isEmpty}]（`repository.load` 的投影，见场景壳）
// opts.onCreate  = async ({gid, nickname, gender}) → {ok, errors?}
// opts.onImport  = async (gid, file) → {ok, errors?}
// opts.onEnterMap= async (gid) → void（满档进图；建号成功后也走这条）
export function mount(el, opts = {}) {
  const root = mk('rst-scene rst-login')
  root.id = 'rst-login'

  const bg = mk('rst-login-bg')
  bg.style.backgroundImage = url('Login Background.png')
  const noise = mk('rst-login-noise')
  noise.style.backgroundImage = url('Login Background Noise.png')

  // 标题：Choose Role.png 实测 431×609，内容只有左上 286×40 那块（"选择角色" + 装饰线）⇒ 按内容裁切。
  const title = mk('rst-login-title')
  title.style.backgroundImage = url('Choose Role.png')

  // ── 3 个角色格（数量 = slots.length = Save 线 MAX_SAVE_COUNT；值由场景壳投影）──
  const slots = Array.isArray(opts.slots) ? opts.slots : []
  const roles = mk('rst-roles')
  const cells = []
  for (const s of slots) {
    const cell = mk('rst-role')
    cell.dataset.slot = String(s.gid)
    cell.setAttribute('role', 'button')
    cell.tabIndex = 0

    const effect = mk('rst-role-effect')       // 上游 Login.unity 每格的 "Login Info" = Login Effect.png（490×404 铺满整格）
    effect.style.backgroundImage = url('Login Effect.png')
    const portrait = mk('rst-role-portrait')   // 空档占位底纹（满档由 .rst-role-effect 顶掉）
    const robot = mk('rst-role-robot')         // 上游每格的 "Seer Robot"（装饰件；人类 2026-10-18 拍板 = 与光柱一致、只满档显示）
    robot.style.backgroundImage = robotUrl('7001.png')
    const name = mk('rst-role-name')
    const gender = mk('rst-role-gender')
    const cover = mk('rst-role-cover')
    cover.textContent = '覆盖'                  // 仅 .is-importing 时可见

    cell.append(effect, portrait, robot, name, gender, cover)   // 装饰件（effect/robot）只在满档显示（CSS 选择器控制）
    roles.append(cell)
    cells.push({ gid: s.gid, cell, portrait, name, gender })
  }

  // ── 底部：导入其他存档（上游 ImportRoleController；"用其他角色登录" 是素材里烤死的文案）──
  const hint = mk('rst-import-hint')
  hint.textContent = '选择要覆盖的存档'      // 上游 ImportRole() 把那行文字改成这句（怪癖 A19 的两段式）
  const importBtn = mk('rst-import', 'button')
  importBtn.type = 'button'
  importBtn.style.backgroundImage = url('Other User Login.png')
  importBtn.title = '导入其他存档'

  // 文件选择器（§4.2）：只在导入态点格时打开；`value` 每次清空 ⇒ 同一个文件能再选
  const fileInput = mk('rst-file', 'input')
  fileInput.type = 'file'
  fileInput.accept = '.xml,text/xml'
  fileInput.hidden = true

  // ── 建号面板（STQ7 = 要做；底图 Nickname Field.png 自带 "输入昵称" 与输入框框体）──
  const create = mk('rst-create')
  create.hidden = true
  const createBg = mk('rst-create-bg')
  createBg.style.backgroundImage = url('Nickname Field.png')
  const createErr = mk('rst-create-error')
  const input = mk('rst-create-input', 'input')
  input.type = 'text'
  input.maxLength = 12
  input.autocomplete = 'off'
  input.spellcheck = false
  input.setAttribute('aria-label', '昵称')
  const genders = mk('rst-create-genders')
  const genderBtns = []
  for (const [g, file, pos, size] of [
    ['male', 'Male.png', '-11px -14px', '129px 70px'],
    ['female', 'Female.png', '-4px -17px', '128px 70px'],
  ]) {
    const b = mk('rst-create-gender', 'button')
    b.type = 'button'
    b.dataset.gender = g
    b.style.backgroundImage = url(file)
    b.style.backgroundPosition = pos
    b.style.backgroundSize = size
    genderBtns.push(b)
    genders.append(b)
  }
  const actions = mk('rst-create-actions')
  const ok = mk('rst-create-ok', 'button')
  ok.type = 'button'
  ok.textContent = '确认'
  const cancel = mk('rst-create-cancel', 'button')
  cancel.type = 'button'
  cancel.textContent = '取消'
  actions.append(ok, cancel)
  create.append(createBg, createErr, input, genders, actions)

  root.append(bg, noise, title, roles, hint, importBtn, fileInput, create)
  el.append(root)

  // ───────────────────────── 显隐：3 格（空档 / 满档） ─────────────────────────
  function renderCell(ref, s) {
    const empty = !!s.isEmpty
    ref.cell.dataset.empty = String(empty)
    ref.cell.classList.remove('is-chosen')
    ref.cell.setAttribute('aria-label', `存档 ${s.gid + 1}：${empty ? '空档' : (s.nickname || '—')}`)
    ref.portrait.textContent = empty ? '空档' : ''                 // 满档位不留"空档"字样（改由 .rst-role-effect 顶位）
    ref.name.textContent = empty ? '—' : (s.nickname || '—')       // 设计 §3.2：空槽昵称显示 "—"
    ref.gender.hidden = empty
    if (!empty) {
      ref.gender.dataset.gender = s.gender
      ref.gender.style.backgroundImage = url(s.gender === 'female' ? 'Female.png' : 'Male.png')
    }
  }
  function update(list) {
    if (!Array.isArray(list)) return
    for (const ref of cells) {
      const s = list.find((x) => Number(x.gid) === ref.gid)
      if (s) renderCell(ref, s)
    }
  }
  update(slots)

  // ───────────────────────── 状态机（普通 / 导入态 / 建号态） ─────────────────────────
  let creatingSlot = null
  let importingSlot = null
  let busy = false
  let gender = 'male'                       // 默认值（上游 CreateRoleModel.gender 初值 false = 男）

  const setGender = (g) => {
    gender = g
    for (const b of genderBtns) b.classList.toggle('is-on', b.dataset.gender === g)
  }
  setGender('male')

  function openCreate(slot) {
    creatingSlot = slot
    create.hidden = false
    createErr.textContent = ''            // 上游 OnSetPlayerNameEmpty() 的原地提示位
    input.value = ''
    root.classList.add('is-creating')
    input.focus()
  }
  function closeCreate() {
    creatingSlot = null
    create.hidden = true
    root.classList.remove('is-creating')
  }
  function toggleImport(force) {
    const on = force ?? !root.classList.contains('is-importing')
    root.classList.toggle('is-importing', on)
    importBtn.title = on ? '选择要覆盖的存档' : '导入其他存档'
    if (!on) importingSlot = null
  }

  /** 满档进图（建号成功后也走这条；上游同一次点击就 Login）。 */
  async function enter(gid) {
    if (busy) return
    busy = true
    const ref = cells.find((c) => c.gid === Number(gid))
    ref?.cell.classList.add('is-chosen')
    try {
      await opts.onEnterMap?.(gid)
    } catch (e) {
      ref?.cell.classList.remove('is-chosen')
      openHintbox({ content: `进入失败：${(e && e.message) || e}`, optionNum: 1 })
    } finally {
      busy = false
    }
  }

  function onCell(ref) {
    const slot = ref.gid
    if (root.classList.contains('is-importing')) {              // 导入态：点格 = 选文件覆盖该槽（§4.2）
      importingSlot = slot
      fileInput.value = ''
      fileInput.click()
      return
    }
    if (ref.cell.dataset.empty === 'true') { openCreate(slot); return }   // 空档 ⇒ 建号（上游 CreateRoleController）
    enter(slot)                                                          // 满档 ⇒ 进图
  }

  for (const ref of cells) {
    ref.cell.onclick = () => onCell(ref)
    ref.cell.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCell(ref) } }
  }
  importBtn.onclick = () => toggleImport()

  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0]
    const gid = importingSlot
    fileInput.value = ''                                        // 同一文件能再选（§4.2 always 段）
    toggleImport(false)                                         // always：退出导入态
    if (!file || gid == null) return
    const r = (await opts.onImport?.(gid, file)) || { ok: true }
    const errors = (r.errors && r.errors.length) ? r.errors : ['未知原因']
    openHintbox({                                                // A3：成功 1 钮 / 失败列出 errors（不吞）
      content: r.ok ? '导入成功' : `导入失败：\n- ${errors.join('\n- ')}`,
      optionNum: 1,
    })
  }
  fileInput.oncancel = () => toggleImport(false)                 // 取消选文件（新版浏览器）也退出导入态

  ok.onclick = async () => {
    if (busy) return
    const nickname = input.value.trim()
    if (!nickname) {                       // 上游：CreateRoleController 空昵称 ⇒ OnSetPlayerNameEmpty()
      createErr.textContent = '昵称不能空白'
      input.focus()
      return
    }
    const slot = creatingSlot
    busy = true
    let r
    try {
      r = (await opts.onCreate?.({ gid: slot, nickname, gender })) || { ok: true }
    } finally {
      busy = false
    }
    if (!r.ok) { createErr.textContent = (r.errors || ['写入失败']).join('；'); return }   // 不关面板、不静默
    closeCreate()
    await enter(slot)                      // §4.1：刷新该格 ⇒ 立即进入（等价于点该格满档路径）
  }
  cancel.onclick = closeCreate
  input.onkeydown = (e) => { if (e.key === 'Enter') ok.click() }
  for (const b of genderBtns) b.onclick = () => setGender(b.dataset.gender)

  return { el: root, update, destroy() { root.remove() } }
}
