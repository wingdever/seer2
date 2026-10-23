// Linux 承载端主进程。
//   SEER2_TARGET_URL   要加载的页面（默认改服直连入口，用于最低成本判活）
//   SEER2_GATEWAY      =1 时先拉起春树 core-net 网关，再加载 http://seer2.chunshu/seer2/
//   SEER2_BACKEND      网关使用的私有服根 URL
//   SEER2_FLASH_PLUGIN / SEER2_FLASH_VERSION
//   SEER2_SHOT / SEER2_SHOT_AT   截图判定（headless 自证）
//   SEER2_FLAGS        追加的 chromium 开关，空格分隔
'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const TARGET_URL = process.env.SEER2_TARGET_URL || 'http://43.138.190.6/seer2/play-local.html';
const FLASH_PLUGIN = process.env.SEER2_FLASH_PLUGIN || '';
const FLASH_VERSION = process.env.SEER2_FLASH_VERSION || '34.0.0.330';
const SHOT = process.env.SEER2_SHOT || '';
const SHOT_AT = Number(process.env.SEER2_SHOT_AT || 12000);
const USE_GATEWAY = process.env.SEER2_GATEWAY === '1';
const BACKEND = process.env.SEER2_BACKEND || 'http://43.138.190.6/seer2';

const say = (...a) => console.log('[live]', ...a);

if (!FLASH_PLUGIN || !fs.existsSync(FLASH_PLUGIN)) {
  console.error('[live] FATAL: Flash 插件不存在:', FLASH_PLUGIN || '(未设置 SEER2_FLASH_PLUGIN)');
  app.exit(2);
}

// 登录态全在 userData 下：Cookies / Local Storage 由 Chromium 管，
// PPAPI 的 SharedObject 落在 <userData>/Pepper Data/Shockwave Flash/WritableRoot/#SharedObjects/<域>/。
// 不固定 userData 就会跟着默认路径（本例是 ~/.config/seer2-live-app）走，换宿主即丢登录态。
const USER_DATA = process.env.SEER2_USER_DATA || '';
if (USER_DATA) {
  fs.mkdirSync(USER_DATA, { recursive: true });
  app.setPath('userData', USER_DATA);
}

app.commandLine.appendSwitch('ppapi-flash-path', FLASH_PLUGIN);
app.commandLine.appendSwitch('ppapi-flash-version', FLASH_VERSION);
app.commandLine.appendSwitch('enable-plugins');
app.commandLine.appendSwitch('allow-outdated-plugins');
for (const f of (process.env.SEER2_FLAGS || '').split(' ').filter(Boolean)) {
  if (f.includes('=')) app.commandLine.appendSwitch(f.split('=')[0], f.split('=').slice(1).join('='));
  else app.commandLine.appendSwitch(f);
}

say('electron', process.versions.electron, 'chrome', process.versions.chrome, 'node', process.versions.node);
say('plugin', FLASH_PLUGIN, 'version', FLASH_VERSION);
say('gateway', USE_GATEWAY, 'backend', BACKEND);
say('userData', app.getPath('userData'));

let gatewayInfo = null;
let win = null;

function attachObservers(wc) {
  wc.on('console-message', (e, level, message, line, sourceId) => {
    say('console', message, sourceId ? `@${sourceId}:${line}` : '');
  });
  wc.on('did-fail-load', (e, code, desc, url) => say('did-fail-load', code, desc, url));
  wc.on('did-finish-load', () => say('did-finish-load', wc.getURL()));
  wc.on('plugin-crashed', (e, info) => say('plugin-crashed', JSON.stringify(info)));
  wc.on('render-process-gone', (e, d) => say('render-process-gone', JSON.stringify(d)));
  wc.on('unresponsive', () => say('unresponsive'));
}

const SKIP = /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|mp3|mp4)(\?|$)/i;
const WATCH = process.env.SEER2_LOG_ALL ? (u) => !SKIP.test(u) : (u) => /\.(swf|xml|dll|json|html|txt|data|php|js)(\?|$)/i.test(u);
const WR_FILTER = { urls: ['http://*/*', 'https://*/*'] };
function attachNetworkLog() {
  const ses = session.defaultSession;
  ses.webRequest.onBeforeRequest(WR_FILTER, (details, cb) => {
    if (WATCH(details.url)) say('req', details.method, details.url);
    cb({});
  });
  ses.webRequest.onCompleted(WR_FILTER, (details) => {
    if (WATCH(details.url)) say('res', details.statusCode, details.url);
  });
  ses.webRequest.onErrorOccurred(WR_FILTER, (details) => {
    if (WATCH(details.url)) say('res-err', details.error, details.url);
  });
}

async function shot(tag) {
  if (!SHOT || !win || win.isDestroyed()) return;
  try {
    const img = await win.webContents.capturePage();
    const out = SHOT.replace(/\.png$/, '') + '-' + tag + '.png';
    fs.writeFileSync(out, img.toPNG());
    say('shot', out, img.getSize().width + 'x' + img.getSize().height);
  } catch (e) {
    say('shot-failed', tag, e.message);
  }
}

// Flash 舞台固定 1200x660，页面可能把它缩放居中；把舞台坐标映射成窗口坐标后注入。
async function stageToWindow(wc, sx, sy) {
  const box = await wc.executeJavaScript(`(function(){
    var e = document.querySelector('embed#Client') || document.querySelector('object#Client') || document.querySelector('embed');
    if (!e) return null;
    var r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  if (!box) throw new Error('找不到 Flash embed 元素');
  const kx = box.width / 1200, ky = box.height / 660;
  return { x: Math.round(box.left + sx * kx), y: Math.round(box.top + sy * ky), kx, ky, box };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickStage(wc, sx, sy) {
  const p = await stageToWindow(wc, sx, sy);
  wc.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y });
  await sleep(60);
  wc.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, clickCount: 1 });
  await sleep(60);
  wc.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, clickCount: 1 });
  say('click', sx + ',' + sy, '->', p.x + ',' + p.y);
}

async function typeStage(wc, sx, sy, text) {
  if (sx >= 0) await clickStage(wc, sx, sy);
  await sleep(120);
  for (const ch of String(text)) {
    wc.sendInputEvent({ type: 'char', keyCode: ch });
    await sleep(35);
  }
  say('type', JSON.stringify(String(text)));
}

async function runSteps(wc) {
  const raw = process.env.SEER2_INPUT;
  if (!raw) return;
  let steps;
  try {
    steps = JSON.parse(raw);
  } catch (e) {
    say('input-bad-json', e.message);
    return;
  }
  await sleep(Number(process.env.SEER2_INPUT_DELAY || 8000));
  for (const s of steps) {
    try {
      if (s.wait) await sleep(s.wait);
      else if (s.click) await clickStage(wc, s.click[0], s.click[1]);
      else if (s.type) await typeStage(wc, s.at ? s.at[0] : -1, s.at ? s.at[1] : -1, s.type);
      else if (s.key) {
        wc.sendInputEvent({ type: 'keyDown', keyCode: s.key });
        wc.sendInputEvent({ type: 'keyUp', keyCode: s.key });
        say('key', s.key);
      } else if (s.shot) await shot(s.shot);
      else if (s.rect) say('rect', JSON.stringify(await stageToWindow(wc, 0, 0)));
      else say('input-skip', JSON.stringify(s));
    } catch (e) {
      say('input-error', e.message, JSON.stringify(s));
    }
  }
  await shot('after-input');
}

app.on('ready', async () => {
  attachNetworkLog();
  if (USE_GATEWAY) {
    const { protocol } = require('electron');
    gatewayInfo = require('./gateway.cjs').install({ backend: BACKEND, protocol, log: say });
    setTimeout(() => say('gateway-proxy-port', gatewayInfo.getPort(), 'ready=' + gatewayInfo.isReady()), 3000);
  }

  win = new BrowserWindow({
    title: 'seer2-live',
    useContentSize: true,
    width: 1200,
    height: 660,
    webPreferences: {
      plugins: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.setMenuBarVisibility(false);
  attachObservers(win.webContents);

  // SEER2_ENTRY_URL 用来在网关模式下换承载页（例如改服自己的 play-local.html，wmode=opaque）。
  const url = process.env.SEER2_ENTRY_URL || (USE_GATEWAY ? 'http://seer2.chunshu/seer2/' : TARGET_URL);
  say('load', url);
  win.loadURL(url)
    .then(() => runSteps(win.webContents))
    .catch((e) => say('load-error', e.message));

  setTimeout(() => shot('t' + SHOT_AT), SHOT_AT);
  if (process.env.SEER2_SHOT_AT2) {
    setTimeout(() => shot('t' + process.env.SEER2_SHOT_AT2), Number(process.env.SEER2_SHOT_AT2));
  }
});

app.on('window-all-closed', () => app.quit());
