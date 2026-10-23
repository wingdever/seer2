// 一次性问真二进制几个问题 —— 移植遇到"上游到底怎么想"的分歧时用它, 而不是靠读源码猜。
// 用法: node tools/ask-oracle.mjs '[{"kind":"buffid","id":1008,"turn":-1,"op":"value"}]'
//       node tools/ask-oracle.mjs vectors.json          # 同 difftest 的向量文件格式
// 输出每行一条结果, 与输入同序。它只读、不写任何产物。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ORACLE = join(import.meta.dirname, 'oracle-cs/bin/Debug/net9.0/oracle.dll')
const arg = process.argv[2]
if (!arg) { console.error('用法: node tools/ask-oracle.mjs <json-inline|json-file> [-q]'); process.exit(2) }
const quiet = process.argv.includes('-q')
const vectors = JSON.parse(arg === '-' ? readFileSync(0, 'utf8') : arg.trimStart().startsWith('[') ? arg : readFileSync(arg, 'utf8'))

const dir = mkdtempSync(join(tmpdir(), 'oracle-'))
writeFileSync(join(dir, 'in.json'), JSON.stringify(vectors))
const outPath = join(dir, 'out.json')
execFileSync('dotnet', [ORACLE, join(dir, 'in.json'), outPath], { stdio: quiet ? ['ignore', 'ignore', 'inherit'] : 'inherit' })
const results = JSON.parse(readFileSync(outPath, 'utf8'))
results.forEach((r, i) => console.log(`${i}\t${JSON.stringify(r)}`))
