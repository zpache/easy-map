/**
 * 生成园区演示楼栋数据（确定性伪随机，布局贴近规划园区）。
 * 用法：node scripts/generate-demo-data.mjs
 * 输出格式与 fetch-buildings.mjs 完全一致，可直接被页面消费。
 * 当 OSM 数据可用时（npm run fetch:data），同名文件会被真实数据覆盖。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, 'public', 'data')

const CAMPUSES = [
  { id: 'zgc-sfp', name: '中关村软件园', bbox: [40.03, 116.285, 40.058, 116.325], seed: 20261101 },
  { id: 'szwanke', name: '深圳湾科技生态园', bbox: [22.518, 113.938, 22.54, 113.968], seed: 20261102 }
]

const NAMES = [
  '研发楼A1', '研发楼A2', '研发楼A3', '研发楼A4',
  '研发楼B1', '研发楼B2', '研发楼B3', '研发楼B4',
  '研发楼C1', '研发楼C2', '研发楼C3',
  '研发楼D1', '研发楼D2',
  '展示中心', '会议中心', '员工餐厅', '体育馆',
  '数据中心', '实验楼', '人才公寓1', '人才公寓2',
  '人才公寓3', '行政楼', '接待中心'
]

const LEVEL_HEIGHT = 3.2

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function generate(campus) {
  const rng = mulberry32(campus.seed)
  const [s, w, n, e] = campus.bbox
  const latC = (s + n) / 2
  const mLat = 110540
  const mLng = 111320 * Math.cos((latC * Math.PI) / 180)

  const rows = 4
  const cols = 5
  const cellW = 120
  const cellH = 105
  const totalW = cols * cellW
  const totalH = rows * cellH
  const originLng = (w + e) / 2 - totalW / 2 / mLng
  const originLat = latC - totalH / 2 / mLat

  const features = []
  let nameIdx = 0

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng() < 0.14) continue
      const cxM = (c + 0.5) * cellW + (rng() - 0.5) * 14
      const cyM = (r + 0.5) * cellH + (rng() - 0.5) * 14
      const isTower = rng() < 0.16
      const wM = isTower ? 48 + rng() * 30 : 34 + rng() * 44
      const hM = isTower ? 40 + rng() * 24 : 26 + rng() * 34
      const rot = (rng() - 0.5) * 0.28
      const levels = isTower ? 12 + Math.floor(rng() * 9) : 3 + Math.floor(rng() * 5)
      const name = nameIdx < NAMES.length ? NAMES[nameIdx++] : `楼宇${++nameIdx}`
      const type = isTower ? 'office' : rng() < 0.12 ? 'commercial' : 'office'

      const cos = Math.cos(rot)
      const sin = Math.sin(rot)
      const corners = [
        [-wM / 2, -hM / 2],
        [wM / 2, -hM / 2],
        [wM / 2, hM / 2],
        [-wM / 2, hM / 2]
      ]
      const ring = corners.map(([dx, dy]) => {
        const rx = cxM + dx * cos - dy * sin
        const ry = cyM + dx * sin + dy * cos
        return [+(originLng + rx / mLng).toFixed(6), +(originLat + ry / mLat).toFixed(6)]
      })
      ring.push(ring[0])

      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {
          osmId: `demo/${campus.id}/${String(features.length + 1).padStart(3, '0')}`,
          name,
          type,
          height: Math.round(levels * LEVEL_HEIGHT * 10) / 10,
          levels,
          heightSrc: 'demo',
          area: Math.round(wM * hM)
        }
      })
    }
  }
  return features
}

mkdirSync(OUT_DIR, { recursive: true })
for (const campus of CAMPUSES) {
  const features = generate(campus)
  const fc = {
    type: 'FeatureCollection',
    meta: {
      campus: campus.id,
      name: campus.name,
      source: 'demo',
      fetchedAt: new Date().toISOString()
    },
    features
  }
  const out = join(OUT_DIR, `${campus.id}.geojson`)
  writeFileSync(out, JSON.stringify(fc))
  console.log(`${campus.name}: ${features.length} 栋 → ${out}`)
}
console.log('完成。')
