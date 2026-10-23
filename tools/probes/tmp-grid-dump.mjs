// 全分辨率打印 path_mc 栅格 (cell 可调), 并检查 path 轮廓结构
import fs from 'node:fs'
import zlib from 'node:zlib'
import { parseSwf, findInstance, geometryOf, walkGridOf } from '../../game/swfshape.mjs'
const f = process.argv[2] || 'swf/map/1.swf'
const buf = fs.readFileSync(f)
const body = buf.toString('latin1',0,3) === 'FWS' ? new Uint8Array(buf.subarray(8)) : new Uint8Array(zlib.inflateSync(buf.subarray(8)))
const swf = parseSwf(body)
const path = findInstance(swf, 'path_mc')
const g = geometryOf(swf, path)
g.contours.forEach((c,i)=>{
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,area=0
  for(let k=0;k<c.length;k++){const [x,y]=c[k], [nx,ny]=c[(k+1)%c.length]; x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);area+=x*ny-nx*y}
  console.log(`c${i} pts=${c.length} bbox=${x0.toFixed(0)},${y0.toFixed(0)} ${x1.toFixed(0)}x${y1.toFixed(0)} signedArea=${(area/2).toFixed(0)} closed=${JSON.stringify(c[0])===JSON.stringify(c[c.length-1])}`)
})
const cell = +(process.env.CELL||10)
const w = walkGridOf(swf, cell)
console.log(`grid ${w.gw}x${w.gh} cell=${cell} blocked=${(w.blockedRatio*100).toFixed(1)}% nonzero=${w.nonzero}`)
const step = Math.max(1, Math.round(w.gw/110))
for(let j=0;j<w.gh;j+=Math.max(1,Math.round(step/2))){
  let s=''
  for(let i=0;i<w.gw;i+=step) s+=w.ascii[j*w.gw+i]
  console.log(s)
}
