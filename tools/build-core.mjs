// game/core/**/*.ts → 同目录 .js —— 浏览器不能执行 .ts 
// 模块脚本要求 JavaScript MIME), 而这套内核纪律是「零构建、源码即产物」, 所以只借用 Node 自带的
// 实验性类型剥离做一层**机械转写**: 不打包、不降语法、不做 tree-shaking, 只把 `import x from './y.ts'`
// 改写成 './y.js'。因此 .js 与 .ts 一一同名并列, .ts 永远是权威源, .js 是可随时重生成的产物。
// 用法: node tools/build-core.mjs
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { stripTypeScriptTypes } from 'node:module'

const ROOT = join(import.meta.dirname, '..', 'game', 'core')

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) yield p
  }
}

// 只改写**相对**且以 .ts 结尾的说明符; 裸模块与 .js 一律不动。
function rewriteSpecifiers(src) {
  return src.replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.\.?\/[^'"]*?)\.ts\2/g, (m, pre, q, path) => `${pre}${q}${path}.js${q}`)
}

let n = 0
for (const file of walk(ROOT)) {
  const out = file.slice(0, -3) + '.js'
  const js = rewriteSpecifiers(stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' }))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, js)
  n++
}
console.log(`[build-core] ${n} 个 .ts → .js @ ${relative(process.cwd(), ROOT)}`)
