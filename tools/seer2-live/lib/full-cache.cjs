// 全量资源归档层：core-net 的 Smart Cache 只覆盖 swf/png/jpg/jpeg/mp3/ogg，
// 这里把其余非页面/动态端点响应（xml/json/js/css/txt/dat/data 等）按同一目录树补进 game-cache。
// 只抓 GET 200；只有 res/module/dll/version/static 下的非二进制资源会回放，
// config/ 与动态接口只归档不回放，避免旧数据卡住登录/进服。
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CORE_BINARY_EXTS = new Set(['swf', 'png', 'jpg', 'jpeg', 'mp3', 'ogg']);
const SKIP_EXTS = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'do', 'action']);
// 只有这些前缀下的非二进制资源会回放；其余（含动态接口）只归档。
const SERVE_PREFIXES = ['res/', 'module/', 'dll/', 'version/', 'static/'];
const DEFAULT_GAME_HOSTS = ['43.138.190.6', 'o1.733702.xyz', 'seer2.chunshu'];

const MIME_BY_EXT = {
  swf: 'application/x-shockwave-flash',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  xml: 'text/xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
  js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  ttf: 'font/ttf',
  fnt: 'application/octet-stream',
  woff: 'font/woff',
  woff2: 'font/woff2',
  dat: 'application/octet-stream',
  data: 'application/octet-stream',
  bin: 'application/octet-stream',
};

function mimeFor(ext, stored) {
  return MIME_BY_EXT[ext] || (stored ? String(stored).split(';')[0] : '') || 'application/octet-stream';
}

function hasPrefix(rel, prefixes) {
  for (let i = 0; i < prefixes.length; i++) {
    if (rel.indexOf(prefixes[i]) === 0) return true;
  }
  return false;
}

// 返回 null 表示不归档；否则给出 relPath / ext / 是否回放。
function classify(urlStr, gameHosts) {
  let u;
  try { u = new URL(urlStr); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = (u.hostname || '').toLowerCase();
  if (!host || host === '127.0.0.1' || host === 'localhost') return null;

  const scheme = u.protocol === 'https:' ? 'https' : 'http';
  const isGameHost = gameHosts.has(host);
  const isGameHttp = isGameHost && scheme === 'http';
  const rawPath = (u.pathname || '/').replace(/^\/+/, '');
  const rel = isGameHttp ? rawPath.replace(/^seer2\//, '') : rawPath;
  if (!rel) return null;

  const base = rel.split('/').pop() || '';
  const extMatch = /\.([a-z0-9]{1,8})$/i.exec(base);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  if (!ext || SKIP_EXTS.has(ext)) return null;
  if (base.toLowerCase() === 'crossdomain.xml') return null;

  let relPath;
  if (isGameHttp) {
    relPath = rel;
  } else if (host === 'seer2.61.com' && scheme === 'http') {
    relPath = 'http_seer2.61.com/' + rawPath;
  } else {
    const folder = scheme + '_' + host + (u.port ? '_' + u.port : '');
    relPath = folder + '/' + rawPath;
  }
  if (!relPath) return null;

  return {
    url: scheme + '://' + u.host + u.pathname,
    relPath: relPath,
    ext: ext,
    binary: CORE_BINARY_EXTS.has(ext),
    serve: !CORE_BINARY_EXTS.has(ext) && hasPrefix(rel, SERVE_PREFIXES),
  };
}

function insideDir(dir, abs) {
  if (abs === dir) return true;
  const withSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return abs.indexOf(withSep) === 0;
}

function createFullCache(opts) {
  const cacheDir = path.resolve(opts.cacheDir);
  const log = typeof opts.log === 'function' ? opts.log : function () {};
  const serveEnabled = opts.serve !== false;
  const gameHosts = new Set(DEFAULT_GAME_HOSTS);
  (opts.gameHosts || []).forEach(function (h) {
    if (h) gameHosts.add(String(h).toLowerCase());
  });

  const indexPath = path.join(cacheDir, 'index-extra.json');
  const index = new Map();
  try {
    const arr = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (Array.isArray(arr)) {
      arr.forEach(function (e) {
        if (e && e.relPath) index.set(e.relPath, e);
      });
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') log('cache-all-index-read-error', e.message);
  }

  let indexDirty = false;
  let indexTimer = null;
  let tmpSeq = 0;

  function scheduleSave() {
    indexDirty = true;
    if (indexTimer) return;
    indexTimer = setTimeout(function () {
      indexTimer = null;
      if (!indexDirty) return;
      indexDirty = false;
      const tmp = indexPath + '.' + process.pid + '.tmp';
      try {
        fs.writeFileSync(tmp, JSON.stringify(Array.from(index.values())));
        fs.renameSync(tmp, indexPath);
      } catch (e) {
        log('cache-all-index-write-error', e.message);
      }
    }, 1000);
  }

  function infoFor(urlStr) {
    const info = classify(urlStr, gameHosts);
    if (!info) return null;
    const abs = path.resolve(cacheDir, info.relPath);
    if (!insideDir(cacheDir, abs)) return null;
    info.absPath = abs;
    return info;
  }

  function fileHasContent(absPath) {
    try { return fs.statSync(absPath).size > 0; } catch (e) { return false; }
  }

  function store(info, buf, contentType) {
    fs.mkdirSync(path.dirname(info.absPath), { recursive: true });
    const tmp = info.absPath + '.seer2live-' + process.pid + '-' + (++tmpSeq) + '.tmp';
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, info.absPath);
    const prev = index.get(info.relPath);
    index.set(info.relPath, {
      url: info.url,
      relPath: info.relPath,
      ext: info.ext,
      size: buf.length,
      contentType: contentType || '',
      cachedAt: Date.now(),
      hitCount: prev && prev.hitCount ? prev.hitCount : 0,
    });
    scheduleSave();
  }

  function tryServe(urlStr, method, reply) {
    if (!serveEnabled || method !== 'GET') return false;
    const info = infoFor(urlStr);
    if (!info || !info.serve) return false;
    let stat;
    try { stat = fs.statSync(info.absPath); } catch (e) { return false; }
    if (!stat.isFile() || stat.size <= 0) return false;

    const entry = index.get(info.relPath);
    if (entry) {
      entry.hitCount = (entry.hitCount || 0) + 1;
      entry.lastHitAt = Date.now();
      scheduleSave();
    }

    const stream = fs.createReadStream(info.absPath);
    stream.on('error', function () { try { stream.destroy(); } catch (_) {} });
    reply({
      statusCode: 200,
      headers: {
        'Content-Type': mimeFor(info.ext, entry && entry.contentType),
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        'Cache-Control': 'public,max-age=86400',
        'X-Cache': 'HIT-EXTRA',
        'Connection': 'close',
      },
      data: stream,
    });
    log('extra-hit', info.relPath, stat.size);
    return true;
  }

  function capture(urlStr, method, res) {
    if (method !== 'GET') return;
    const info = infoFor(urlStr);
    if (!info) return;
    if ((res.statusCode || 0) !== 200) return;
    const contentType = String((res.headers && res.headers['content-type']) || '').toLowerCase();
    if (contentType.indexOf('text/html') === 0) return; // 200 的 HTML 通常是错误页/入口页
    if (info.binary && fileHasContent(info.absPath)) return; // core-net 已缓存，别再整块收集

    const chunks = [];
    res.on('data', function (chunk) {
      if (chunk && chunk.length) chunks.push(Buffer.from(chunk));
    });
    res.on('end', function () {
      if (!chunks.length) return;
      let buf = Buffer.concat(chunks);
      const encoding = String((res.headers && res.headers['content-encoding']) || '').toLowerCase();
      try {
        if (encoding === 'gzip') buf = zlib.gunzipSync(buf);
        else if (encoding === 'br') buf = zlib.brotliDecompressSync(buf);
        else if (encoding === 'deflate') buf = zlib.inflateSync(buf);
      } catch (e) {
        log('cache-all-decode-error', info.relPath, e.message);
        return;
      }
      if (!buf.length) return;
      // 二进制白名单由 core-net 负责；已经有文件就不重复写。
      if (info.binary && fileHasContent(info.absPath)) return;
      try {
        const prev = index.get(info.relPath);
        const changed = !prev || prev.size !== buf.length || prev.ext !== info.ext;
        store(info, buf, res.headers && res.headers['content-type']);
        if (changed) log('cache-all', info.relPath, buf.length);
      } catch (e) {
        log('cache-all-write-error', info.relPath, e.message);
      }
    });
    res.on('error', function () {});
  }

  log('cache-all-ready', 'dir=' + cacheDir, 'index=' + index.size,
    'mode=' + (serveEnabled ? 'archive+serve-static' : 'archive-only'));

  return {
    tryServe: tryServe,
    capture: capture,
    size: function () { return index.size; },
  };
}

module.exports = { createFullCache: createFullCache, classify: classify };
