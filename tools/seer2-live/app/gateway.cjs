// 复用春树启动器网络层 core-net.js 的网关（Electron 主进程内运行）。
// 与启动器 main.js:12200-12310 的接法一致：
//   setGameBackend → setCacheDir → setLocalGameIndex → startInterceptProxy →
//   protocol.interceptStreamProtocol('http', → 127.0.0.1:<port> 绝对形式转发)
// core-net 不是 HTTP CONNECT 代理，而是一个「带虚拟域名路由的源服务器」，
// 必须靠 interceptStreamProtocol 把 Chromium 的 http 请求灌进去。
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { Readable, PassThrough } = require('stream');

const { createFullCache } = require('../lib/full-cache.cjs');

const FLASH_POLICY_DATA =
  '<?xml version="1.0"?>' +
  '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">' +
  '<cross-domain-policy><allow-access-from domain="*" to-ports="*" /></cross-domain-policy>';

const BLOOM_PATH = '/config/bloom-path.data';
const LOCAL_HOSTNAME = 'seer2.chunshu';

function bufferToStream(buf) {
  return Readable.from([Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''))]);
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if ((res.statusCode || 0) >= 400) reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
          else resolve(Buffer.concat(chunks).toString('utf8'));
        });
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function install(opts) {
  const { backend, protocol, log = () => {}, repoRoot, cacheRoot } = opts;
  const root = repoRoot || process.env.SEER2_REPO_ROOT || path.resolve(__dirname, '..', '..', '..');
  const commonDir = path.join(root, 'projects', 'seer2-chunshu-launcher', 'src', 'common');
  const indexRaw =
    process.env.SEER2_LOCAL_INDEX ||
    path.join(root, 'projects', 'seer2-chunshu-launcher', 'src', 'variants', 'normal', 'local-game-index.normal.html');
  // Electron 的 cwd 是 runtime 目录，相对路径必须按仓库根解析，否则静默回落。
  const indexHtml = path.isAbsolute(indexRaw) ? indexRaw : path.resolve(root, indexRaw);

  const coreNet = require(path.join(commonDir, 'core-net.js'));
  coreNet.setBaseDir(commonDir);
  coreNet.setGameBackend(backend);

  try {
    coreNet.setLocalGameIndex(fs.readFileSync(indexHtml));
    log('local-index', indexHtml);
  } catch (e) {
    log('local-index-missing', e.message, '（将回落到服务端 play-local.html）');
  }

  const cacheDir = cacheRoot || path.join(process.env.HOME || '/tmp', '.cache', 'seer2-live', 'game-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  coreNet.setCacheDir(cacheDir);
  coreNet.setUserReplaceRules([]);

  // core-net 只缓存二进制白名单；其余静态资源由这层补进同一个目录树。
  let fullCache = null;
  if (process.env.SEER2_CACHE_ALL !== '0') {
    let backendHost = '';
    try { backendHost = new URL(backend).hostname; } catch (_) {}
    fullCache = createFullCache({ cacheDir, gameHosts: [backendHost], log });
  } else {
    log('cache-all-disabled', 'SEER2_CACHE_ALL=0');
  }

  // 端口在 startInterceptProxy() 里才确定，必须延迟读取
  const getPort = () => coreNet.getProxyPort();

  protocol.interceptStreamProtocol('http', (request, callback) => {    let replied = false;
    const reply = (payload) => {
      if (replied) return;
      replied = true;
      try { callback(payload); } catch (_) {}
    };

    let urlObj;
    try {
      urlObj = new URL(request.url);
    } catch (e) {
      reply({ statusCode: 400, data: bufferToStream('invalid url') });
      return;
    }

    if (urlObj.pathname === '/crossdomain.xml' && urlObj.hostname === LOCAL_HOSTNAME) {
      reply({
        statusCode: 200,
        headers: {
          'content-type': 'text/x-cross-domain-policy',
          'cache-control': 'no-cache',
          'access-control-allow-origin': '*',
        },
        data: bufferToStream(FLASH_POLICY_DATA),
      });
      return;
    }

    if (urlObj.hostname === '127.0.0.1' || urlObj.hostname === 'localhost') {
      const h = Object.assign({}, request.headers || {});
      delete h['proxy-connection'];
      const dReq = http.request(
        {
          hostname: urlObj.hostname,
          port: parseInt(urlObj.port, 10) || 80,
          path: urlObj.pathname + (urlObj.search || ''),
          method: request.method || 'GET',
          headers: h,
        },
        (dRes) => {
          reply({ statusCode: dRes.statusCode || 200, headers: dRes.headers || {}, data: dRes });
          dRes.on('error', (e) => reply({ statusCode: 502, data: bufferToStream('local-err: ' + e.message) }));
        }
      );
      dReq.on('error', (e) => reply({ statusCode: 502, data: bufferToStream('local-conn: ' + e.message) }));
      if (request.uploadData && request.uploadData[0]) dReq.write(request.uploadData[0].bytes);
      dReq.end();
      return;
    }

    const isVirtual = urlObj.hostname === LOCAL_HOSTNAME;
    const hostHdr = isVirtual ? LOCAL_HOSTNAME : urlObj.hostname + (urlObj.port ? ':' + urlObj.port : '');
    const proxyPath = 'http://' + hostHdr + urlObj.pathname + (urlObj.search || '');
    const method = request.method || 'GET';

    if (fullCache && fullCache.tryServe(proxyPath, method, reply)) return;

    const pH = Object.assign({}, request.headers || {});
    pH['host'] = hostHdr;
    delete pH['proxy-connection'];

    const pReq = http.request(
      { hostname: '127.0.0.1', port: getPort(), path: proxyPath, method, headers: pH },
      (pRes) => {
        // 先 tee 到 PassThrough：Electron 消费副本，全量捕获消费原始流，互不抢块。
        const out = new PassThrough();
        out.on('error', () => {});
        pRes.pipe(out);
        if (fullCache) fullCache.capture(proxyPath, method, pRes);
        reply({ statusCode: pRes.statusCode || 200, headers: pRes.headers || {}, data: out });
        log('gw', pRes.statusCode || 200, proxyPath);
        pRes.on('error', (e) => {
          try { out.destroy(e); } catch (_) {}
          reply({ statusCode: 502, data: bufferToStream('proxy-res: ' + e.message) });
        });
      }
    );
    pReq.setTimeout(30000, () => {
      pReq.destroy();
      reply({ statusCode: 504, data: bufferToStream('timeout') });
    });
    pReq.on('error', (e) => reply({ statusCode: 502, data: bufferToStream('proxy-conn: ' + e.message) }));
    if (request.uploadData && request.uploadData[0]) pReq.write(request.uploadData[0].bytes);
    pReq.end();
  });

  let ready = false;
  coreNet
    .startInterceptProxy()
    .then(() => httpGetText(backend + BLOOM_PATH))
    .then((bloomText) => {
      coreNet.setBloomRoutes(backend, bloomText);
      ready = true;
      log('gateway-ready', 'bloom bytes=' + bloomText.length, 'entry=http://' + LOCAL_HOSTNAME + '/seer2/');
    })
    .catch((e) => log('gateway-error', e.message));

  return { getPort, coreNet, isReady: () => ready };
}

module.exports = { install };
