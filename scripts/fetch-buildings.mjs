/**
 * 从 Overpass API 抓取指定园区的 OSM 建筑轮廓，归一化高度后输出 GeoJSON。
 * 用法：node scripts/fetch-buildings.mjs [campusId ...]
 * 数据默认写入 public/data/<campusId>.geojson
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(ROOT, 'public', 'data')

const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

const CAMPUSES = [
  { id: 'zgc-sfp', name: '中关村软件园', bbox: [40.03, 116.285, 40.058, 116.325] },
  { id: 'szwanke', name: '深圳湾科技生态园', bbox: [22.518, 113.938, 22.54, 113.968] }
]

const LEVEL_HEIGHT = 3.2
const MIN_AREA_M2 = 80

function parseNum(raw) {
  const m = /([\d.]+)/.exec(String(raw ?? ''))
  return m ? parseFloat(m[1]) : null
}

function estimateLevels(area) {
  if (area < 300) return 3
  if (area < 800) return 5
  if (area < 2000) return 8
  if (area < 6000) return 12
  return 16
}

function ringAreaM2(ring) {
  const latRef = ring.reduce((s, p) => s + p[1], 0) / ring.length
  const kx = 111320 * Math.cos((latRef * Math.PI) / 180)
  const ky = 110540
  let s = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = ring[i][0] * kx
    const y1 = ring[i][1] * ky
    const x2 = ring[i + 1][0] * kx
    const y2 = ring[i + 1][1] * ky
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

function closedRing(geometry) {
  if (!geometry || geometry.length < 4) return null
  const a = geometry[0]
  const b = geometry[geometry.length - 1]
  if (a.lat !== b.lat || a.lon !== b.lon) return null
  return geometry.map((p) => [p.lon, p.lat])
}

function elementToPolygon(el) {
  if (el.type === 'way') {
    const ring = closedRing(el.geometry)
    return ring ? [ring] : null
  }
  if (el.type === 'relation') {
    const outers = (el.members ?? [])
      .filter((m) => m.type === 'way' && m.role === 'outer')
      .map((m) => closedRing(m.geometry))
      .filter(Boolean)
    return outers.length ? outers : null
  }
  return null
}

function featureFromElement(el) {
  const rings = elementToPolygon(el)
  if (!rings) return null
  const tags = el.tags ?? {}
  const isMulti = el.type === 'relation' && rings.length > 1
  const geometry = isMulti
    ? { type: 'MultiPolygon', coordinates: rings.map((r) => [r]) }
    : { type: 'Polygon', coordinates: [rings[0]] }

  const area = Math.round(rings.reduce((s, r) => s + ringAreaM2(r), 0))
  if (area < MIN_AREA_M2) return null

  let height = parseNum(tags.height)
  let heightSrc = 'osm-height'
  let levels = parseNum(tags['building:levels'])
  if (height == null && levels != null) {
    height = levels * LEVEL_HEIGHT
    heightSrc = 'osm-levels'
  }
  if (height == null) {
    levels = estimateLevels(area)
    height = levels * LEVEL_HEIGHT
    heightSrc = 'estimated'
  }
  if (levels == null) levels = Math.max(1, Math.round(height / LEVEL_HEIGHT))

  return {
    type: 'Feature',
    geometry,
    properties: {
      osmId: `${el.type}/${el.id}`,
      name: tags.name ?? null,
      type: tags.building ?? 'yes',
      height: Math.round(height * 10) / 10,
      levels,
      heightSrc,
      area
    }
  }
}

async function queryOverpass(bbox) {
  const q = `[out:json][timeout:90];(way["building"](${bbox.join(',')});relation["building"](${bbox.join(',')}););out geom qt;`
  let lastErr
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'easy-map-demo/0.1 (contact: dev@localhost)',
          Accept: 'application/json'
        },
        body: 'data=' + encodeURIComponent(q)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()).elements ?? []
    } catch (err) {
      lastErr = err
      console.warn(`  ${endpoint} 失败: ${err.message}`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  throw lastErr
}

async function fetchCampus(campus) {
  console.log(`抓取 ${campus.name} (bbox=${campus.bbox.join(',')}) ...`)
  const elements = await queryOverpass(campus.bbox)
  const features = elements.map(featureFromElement).filter(Boolean)
  const fc = {
    type: 'FeatureCollection',
    meta: { campus: campus.id, name: campus.name, source: 'OpenStreetMap', fetchedAt: new Date().toISOString() },
    features
  }
  mkdirSync(OUT_DIR, { recursive: true })
  const out = join(OUT_DIR, `${campus.id}.geojson`)
  writeFileSync(out, JSON.stringify(fc))
  const withName = features.filter((f) => f.properties.name).length
  const withOsmH = features.filter((f) => f.properties.heightSrc === 'osm-height').length
  console.log(`  ${campus.name}: ${features.length} 栋（有名字 ${withName}，有 OSM 高度 ${withOsmH}）→ ${out}`)
}

const args = process.argv.slice(2)
const opts = {}
const positional = []
for (const a of args) {
  const m = /^--(\w+)=(.*)$/.exec(a)
  if (m) opts[m[1]] = m[2]
  else positional.push(a)
}

let targets
if (opts.bbox) {
  const bbox = String(opts.bbox)
    .split(',')
    .map(Number)
  if (bbox.length !== 4 || bbox.some((n) => Number.isNaN(n))) {
    console.error('--bbox 需要逗号分隔的 4 个数字：南,西,北,东')
    process.exit(1)
  }
  targets = [{ id: opts.id || 'custom', name: opts.name || '自定义园区', bbox }]
} else {
  targets = positional.length ? CAMPUSES.filter((c) => positional.includes(c.id)) : CAMPUSES
}
if (!targets.length) {
  console.error(`未找到园区，可用: ${CAMPUSES.map((c) => c.id).join(', ')}，或用 --bbox=南,西,北,东 指定范围`)
  process.exit(1)
}
for (const campus of targets) {
  await fetchCampus(campus)
}
console.log('完成。')
