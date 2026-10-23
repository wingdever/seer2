// 那两个非 SWF 的 fight 文件 (1055/3055) 到底是什么容器?
// 按 onesrc 日记5 的 DLL 方案 (舍弃前 N 字节 + zlib) 暴力试一遍:
// 对每个偏移试 inflate/inflateRaw/gunzip, 成功且解出 FWS/CWS/ZWS 即命中。
import fs from 'node:fs'
import zlib from 'node:zlib'

const files = process.argv.slice(2)
for (const f of files) {
  const raw = fs.readFileSync(f)
  console.log(`\n=== ${f} ${raw.length}B head=${raw.subarray(0, 16).toString('hex')}`)
  let hit = false
  for (let off = 0; off < 64 && !hit; off++) {
    for (const [name, fn] of [['inflate', zlib.inflateSync], ['inflateRaw', zlib.inflateRawSync], ['gunzip', zlib.gunzipSync]]) {
      try {
        const out = fn(raw.subarray(off))
        const sig = out.subarray(0, 3).toString('latin1')
        console.log(`  HIT ${name} @${off} -> ${out.length}B sig=${JSON.stringify(sig)}`)
        if (/[F CZ]WS/.test(sig)) { hit = true; fs.writeFileSync(f.replace(/\.swf$/, '') + '.dec.swf', out); console.log(`  写出 ${f}.dec.swf`); break }
      } catch { /* 该偏移/算法不成, 试下一个 */ }
    }
  }
  if (!hit) {
    const uniq = new Set(raw).size
    const zeros = [...raw].filter(b => b === 0).length
    console.log(`  无 zlib 命中。字节值种类=${uniq}/256 零字节=${(zeros * 100 / raw.length).toFixed(1)}%`)
    console.log(`  前 48 字节: ${raw.subarray(0, 48).toString('hex').match(/../g).join(' ')}`)
  }
}
