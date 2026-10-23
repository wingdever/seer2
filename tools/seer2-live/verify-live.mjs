// seer2-live 启动阶梯回归：把承载端拉起来，按日志与 X11 像素判定每一级是否通过。
// 用法: node tools/seer2-live/verify-live.mjs            只跑自动档（到登录页为止）
//       node tools/seer2-live/verify-live.mjs --login    等真人输完凭据，判到进游戏（VERIFY_LOGIN_WAIT 毫秒）
//       node tools/seer2-live/verify-live.mjs --keep     判完保留窗口，直接玩
// 改服没有游客登录：无人值守时客户端会停在登录页，所以登录之后的三格必须 --login/--keep 才判。
//
// 为什么不用 capturePage：PPAPI 是独立进程绘制，Chromium 合成层里没有它，
// capturePage 抓到的两张不同状态的图会逐像素相同。视觉判据只能走 X11（见 README）。
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const KEEP = process.argv.includes('--keep')
const TIMEOUT = Number(process.env.VERIFY_TIMEOUT || 120000)
let failures = 0
const ok = (cond, name, extra = '') => {
  console.log((cond ? '✔ ' : '✖ ') + name + (extra ? '  ' + extra : ''))
  if (!cond) failures++
}

const repoRoot = path.resolve(import.meta.dirname, '../..')
const profile = mkdtempSync(path.join(tmpdir(), 'seer2-verify-'))

const child = spawn(process.execPath, [path.join(repoRoot, 'tools/seer2-live/run.mjs')], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SEER2_GATEWAY: '1',
    SEER2_LOG_ALL: '1',
    SEER2_USER_DATA: profile,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const lines = []
let dead = ''
const waiters = []
const onData = (buf) => {
  for (const line of buf.toString().split('\n')) {
    if (!line.trim()) continue
    lines.push(line)
    noteCrash(line)
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].test(line)) { waiters[i].res(line); waiters.splice(i, 1) }
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code, sig) => {
  dead = `exit code=${code} signal=${sig}`
  for (const w of waiters.splice(0)) w.res(null)
})

function waitFor(test, label, budget = TIMEOUT) {
  if (dead) return Promise.resolve(null)
  const hit = lines.find(test)
  if (hit) return Promise.resolve(hit)
  return new Promise((res) => {
    const timer = setTimeout(() => {
      const i = waiters.findIndex((w) => w.label === label)
      if (i >= 0) waiters.splice(i, 1)
      res(null)
    }, budget)
    waiters.push({ test, label, res: (v) => { clearTimeout(timer); res(v) } })
  })
}

const gw200 = (re) => (l) => l.includes('[live] gw 200') && re.test(l)
const misc = (sstid) => (l) => l.includes('sstid=' + sstid)

// —— 判死信号：记下第一条，最后统一报告 ——
let crash = ''
const noteCrash = (l) => { if (!crash && /plugin-crashed|render-process-gone|\[live\] FATAL/.test(l)) crash = l }

// pgrep 会把开头带 `--` 的 pattern 当成自己的选项，所以去掉前导破折号。
const flashProc = () => spawnSyncLines('pgrep', ['-f', 'type=ppapi']).length > 0

// (a) Flash 载体收到并加载了 Client.swf
// 注意：春树的 local-game-index 里 flashUrl 是 "http://"+location.host+"/Client.swf"，
// 挂在虚拟域名根路径而不是 /seer2/ 下，所以这里不能带 /seer2 前缀。
const clientSwf = await waitFor(gw200(/\/Client\.swf(\?|$)/), 'client-swf')
ok(!!clientSwf, 'a) Client.swf 经网关 200', clientSwf ? 'PPAPI 进程存活=' + flashProc() : '没拿到 Client.swf')

// (b) 登录模块下发
const loginModule = await waitFor(gw200(/dll\/LoginModule\.swf/), 'login-module', 60000)
ok(!!loginModule, 'b) LoginModule.swf 下发')

// (c) 登录页资源齐 —— 这是自动档能走到的最后一格：
// 改服没有游客/快速自动登录，实测无人值守时客户端就停在这里等人输凭据。
// 服务器列表页资源名有两种：serverPage.swf / serverPage1.swf（同一客户端不同次启动会走不同分支）。
const pageAssets = [
  ['firstPage', /firstPage\.swf/],
  ['moreUserLogin', /moreUserLogin\.swf/],
  ['serverPage', /serverPage\d*\.swf/],
  ['createRole', /createRole\.swf/],
]
for (const [name, re] of pageAssets) {
  const hit = await waitFor(gw200(new RegExp('res/login/' + re.source)), 'page-' + name, 30000)
  ok(!!hit, `c) 登录页资源 ${name}.swf`)
}

// —— 人工档：只有 --login 时才等真人输完账号密码点开始 ——
const manual = KEEP || process.argv.includes('--login')
const MBUDGET = Number(process.env.VERIFY_LOGIN_WAIT || 300000)
const skip = (name) => console.log('– ' + name + '  (未加 --login，需真人输凭据)')

if (!manual) {
  skip('d) fGetLoginSucc 登录成功'); skip('e) fSend1001Req 在线服 TCP'); skip('f) 已进入游戏世界')
} else {
  // (d) 登录腿：密码验证走的是到登录服的 TCP，HTTP 侧只留下埋点
  const loginSucc = await waitFor(misc('fGetLoginSucc'), 'login', MBUDGET)
  const uid = loginSucc ? (loginSucc.match(/uid=(\d+)/) || [])[1] : ''
  ok(!!loginSucc, 'd) fGetLoginSucc 登录成功', 'uid=' + (uid || '-'))

  // (e) socket 腿：1001 登陆协议发出去 = flash.net.Socket 到在线服成立
  const req1001 = await waitFor(misc('fSend1001Req'), '1001', MBUDGET)
  ok(!!req1001, 'e) fSend1001Req 在线服 TCP 成立')
  const online = await waitFor(gw200(/sstid=fSendOnlineReq/), 'online-ip', 15000)
  ok(!!online, '   在线服地址已下发', online ? (decodeURIComponent(online).match(/IP_[^&]*/) || [''])[0] : '-')

  // (f) 进世界：地图资源开始取
  const mapAsset = await waitFor(gw200(/res\/map\//), 'map', MBUDGET)
  ok(!!mapAsset, 'f) 已进入游戏世界', mapAsset ? mapAsset.replace(/^\[live\] gw 200 /, '') : '-')
}

// (g) 视觉判据：X11 直接抓我们自己的窗口，确认画面非空且有色差
const shot = await x11Shot(path.join(profile, 'verify.png'))
ok(!!shot, 'g) X11 抓到游戏窗口', shot ? `${shot.size} 亮度σ=${shot.stddev}` : '窗口未出现或 import 失败')
if (shot) ok(shot.stddev > 0.02, '   画面非纯色', 'σ=' + shot.stddev)

// (h) 全程不能出现判死信号
ok(!crash, 'h) 无插件崩溃 / 渲染进程消失', crash || 'clean')

if (failures) {
  console.log('\n[verify] 失败诊断 —— 末尾 15 条网关请求：')
  for (const l of lines.filter((x) => x.includes('[live] gw ')).slice(-15)) console.log('  ' + l)
}

if (KEEP) {
  console.log('\n[verify] --keep：窗口保留，profile 在 ' + profile)
} else {
  child.kill('SIGTERM')
  console.log('\n[verify] 日志 ' + lines.length + ' 行，profile 留在 ' + profile)
}
process.exit(failures ? 1 : 0)

// —— 工具 ——
function spawnSyncLines(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return (r.stdout || '').split('\n').filter(Boolean)
}

async function x11Shot(file) {
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0' }
  const tree = spawnSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8', env })
  const m = (tree.stdout || '').match(/(0x[0-9a-f]+)\s+"[^"]*":\s*\("seer2-live-app"/)
  if (!m) return null
  const imp = spawnSync('magick', ['import', '-window', m[1], file], { env })
  if (imp.status !== 0 || !existsSync(file)) return null
  const id = spawnSync('magick', ['identify', '-format', '%wx%h', file], { encoding: 'utf8' })
  const st = spawnSync('magick', [file, '-format', '%[fx:standard_deviation]', 'info:'], { encoding: 'utf8' })
  return { size: (id.stdout || '').trim(), stddev: Number(st.stdout || 0) }
}
