// 在 Ruffle 画布的像素里找"小黄点"的位置 (舞台坐标), 用来定位面板上那粒来历不明的点
import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader'] })
const p = await b.newPage()
await p.setViewport({ width: 1260, height: 1000 })
await p.goto('http://127.0.0.1:8090/game/index.html#/map?renderer=canvas', { waitUntil: 'domcontentloaded' })
await p.waitForFunction(() => document.getElementById('hint').textContent.includes('点击地面行走'), { timeout: 90000 })
const box = await (await p.$('#wrap')).boundingBox()
await p.mouse.click(box.x + 340, box.y + 620)
await new Promise(r => setTimeout(r, 3500))
const hits = await p.evaluate(() => {
  const cv = document.querySelector('#wrap canvas')
  const tmp = document.createElement('canvas')
  tmp.width = cv.width; tmp.height = cv.height
  tmp.getContext('2d').drawImage(cv, 0, 0)
  const d = tmp.getContext('2d').getImageData(0, 0, tmp.width, tmp.height).data
  const out = []
  for (let y = 0; y < tmp.height; y++) for (let x = 0; x < tmp.width; x++) {
    const i = (y * tmp.width + x) * 4
    if (d[i] > 170 && d[i+1] > 130 && d[i+2] < 120 && (d[i]-d[i+2]) > 70 && d[i + 3] > 200) out.push([x, y])
  }
  return { cw: tmp.width, ch: tmp.height, n: out.length, pts: out.slice(0, 400) }
})
const sx = 1200 / hits.cw, sy = 660 / hits.ch
const stage = hits.pts.map(([x, y]) => [Math.round(x * sx), Math.round(y * sy)])
const uniq = [...new Set(stage.map(p => p.join(',')))].slice(0, 60)
console.log('画布', hits.cw + 'x' + hits.ch, '黄像素', hits.n)
console.log('舞台坐标样本:', uniq.join(' '))
await b.close()
