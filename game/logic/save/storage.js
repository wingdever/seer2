// 存档存储适配器 —— 三个实现同形（fs / localStorage / mem），由外部**注入**给 repository。
//
// 真值：docs/save/save-code-map.md §2.1（`createFsStorage` / `createLocalStorageAdapter` / `createMemStorage`）
//       docs/save/save-impl.md §6（落点 = `saves/save{id}.xml`；`localStorage` 只当**无写端点时的降级**）
//
// ⚠️ **本文件不自己选环境、不自己 new 到任何地方用**（人类 2026-10-18 已决：`storage` 装配点归编排线；
//    见 docs/save/save-impl.md §6.1）。这里只出适配器实现 + 一个接口形状。
//
// ⚠️ 口径两处（与 code-map §2.1 的表面差异，已在 docs/save/save-impl.md §9.4 登记）：
//   ① **键 = 仓库相对路径**（`schema.keyOf(gid)` = `saves/save0.xml`），**不是**裸文件名
//      ⇒ `createFsStorage(base)` 的 `base` 是**站点根前缀**（默认 `''` = 同源根），
//      于是 `keyOf` 的键直接拼出 `/saves/save0.xml`。code-map §2.1 的示例把 base 写成 `'/saves'`，
//      照抄会拼成 `/saves/saves/save0.xml` ⇒ 本文件**显式吃掉重复的那一段**（见 joinBase）。
//   ② 三个实现**都返回 Promise**（IO 天然异步；fs 必须异步）⇒ 调用方一律 `await`。
//      为了兼容"骗人"的同步适配器（`localStorage`/`mem` 是同步的），`await` 对裸值同样成立。
//
// 本模块**零 DOM**、零 `window`（`localStorage` 走 `globalThis` 取，取不到就抛错，不去摸 document）。

/** 键 → storage 键名：三个实现都只认「最后一段文件名」（`saves/save0.xml` 与 `save0.xml` 同义）。 */
const baseName = (k) => String(k).replace(/\/+$/, '').split('/').pop()

const assertStr = (v, what) => {
  if (typeof v !== 'string') throw new Error(`${what} 应为 string（给的是 ${v === null ? 'null' : typeof v}）`)
}

/**
 * `base` 与仓库相对键拼成 URL/路径。
 * `base` 可空串（= 站点根，浏览器里就是同源）、`/`、`/saves`、`http://127.0.0.1:8090/saves` 都行。
 * ⚠️ 防双前缀：`base` 已以 `/saves` 结尾时，键里的前导 `saves/` 被吃掉（详见文件头 ①）。
 */
function joinBase(base, key) {
  const b = String(base ?? '').replace(/\/+$/, '')
  let k = String(key).replace(/^\/+/, '')
  if (b.endsWith('/saves') && k.startsWith('saves/')) k = k.slice('saves/'.length)
  return `${b}/${k}`
}

// ─────────────────────────── 1. 真文件（经写端点 tools/serve.mjs） ───────────────────────────

/**
 * 真存储适配器：`GET/PUT/DELETE <base>/saves/save{id}.xml`。
 * 读：200 = 文本；**404 = `null`（"这个槽还没有档"，不是错误）**；其余状态码抛错（不静默当空档）。
 * 写：非 2xx 抛错 —— 静态服务器对 PUT 回 405，调用方据此**降级**到 localStorage。
 *
 * @param {string} [base=''] 站点根前缀（默认同源根；node 里给完整 URL 如 `http://127.0.0.1:8090`）
 */
export function createFsStorage(base = '') {
  return {
    kind: 'fs',
    base,
    url: (k) => joinBase(base, k),

    async getItem(k) {
      assertStr(k, 'getItem(k) 的 k')
      if (typeof globalThis.fetch !== 'function') throw new Error('createFsStorage 需要 fetch（浏览器，或 node ≥ 18）')
      const url = this.url(k)
      const res = await globalThis.fetch(url, { cache: 'no-store' })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`存档读失败 ${url} → HTTP ${res.status}`)
      return await res.text()
    },

    async setItem(k, v) {
      assertStr(k, 'setItem(k) 的 k')
      assertStr(v, 'setItem(k, v) 的 v（XML 文本）')
      if (typeof globalThis.fetch !== 'function') throw new Error('createFsStorage 需要 fetch（浏览器，或 node ≥ 18）')
      const url = this.url(k)
      const res = await globalThis.fetch(url, {
        method: 'PUT',
        body: v,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        cache: 'no-store',
      })
      if (!res.ok) throw new Error(`存档写失败 ${url} → HTTP ${res.status}（没起 tools/serve.mjs？它才支持 PUT）`)
    },

    async removeItem(k) {
      assertStr(k, 'removeItem(k) 的 k')
      const url = this.url(k)
      const res = await globalThis.fetch(url, { method: 'DELETE', cache: 'no-store' })
      if (!res.ok && res.status !== 404) throw new Error(`存档删失败 ${url} → HTTP ${res.status}`)
    },
  }
}

// ─────────────────────────── 2. 降级（无写端点时的浏览器本地存储） ───────────────────────────

/**
 * 降级适配器：浏览器 `localStorage`，键 = `prefix + 文件名`（默认 `seer2.save0.xml`，见 save-impl §6）。
 * ⚠️ 与真档**不互通**（真游戏读不到 `localStorage`）⇒ 只当"没有写端点"时的临时落点，导出走 `exportXML`。
 *
 * @param {string} [prefix='seer2.']
 */
export function createLocalStorageAdapter(prefix = 'seer2.') {
  const ls = globalThis.localStorage
  if (!ls) throw new Error('createLocalStorageAdapter：localStorage 不可用（node 环境，或浏览器隐私模式）')
  const keyFor = (k) => prefix + baseName(k)
  return {
    kind: 'localStorage',
    prefix,
    keyFor,
    async getItem(k) { assertStr(k, 'getItem(k) 的 k'); return ls.getItem(keyFor(k)) }, // 无 → null，与 fs 同形
    async setItem(k, v) { assertStr(v, 'setItem(k, v) 的 v（XML 文本）'); ls.setItem(keyFor(k), v) },
    async removeItem(k) { assertStr(k, 'removeItem(k) 的 k'); ls.removeItem(keyFor(k)) },
  }
}

// ─────────────────────────── 3. 内存（node 手测 / 差分） ───────────────────────────

/**
 * 内存适配器。`init` 是初值（键 = 仓库相对路径，如 `{'saves/save0.xml': xml}`）。
 * `keys()` / `dump()` 是给手测看一眼的**追加**便利方法（不参与 Storage 接口）。
 *
 * @param {Record<string,string>} [init]
 */
export function createMemStorage(init = {}) {
  const map = new Map(Object.entries(init))
  return {
    kind: 'mem',
    async getItem(k) { assertStr(k, 'getItem(k) 的 k'); return map.has(k) ? map.get(k) : null },
    async setItem(k, v) { assertStr(v, 'setItem(k, v) 的 v（XML 文本）'); map.set(k, v) },
    async removeItem(k) { assertStr(k, 'removeItem(k) 的 k'); map.delete(k) },
    keys: () => [...map.keys()],
    dump: () => Object.fromEntries(map),
  }
}
