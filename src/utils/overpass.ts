import type { BuildingFeature, Bbox, Coord } from '@/types'
import { bboxOf } from '@/utils/coords'

const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

const LEVEL_HEIGHT = 3.2
const MIN_AREA_M2 = 80

interface OverpassGeometry {
  lat: number
  lon: number
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: OverpassGeometry[]
  members?: { type: string; role: string; geometry?: OverpassGeometry[] }[]
}

interface PoiPoint {
  lng: number
  lat: number
  name: string
  prio: number
}

function poiPriority(tags: Record<string, string>): number {
  if (tags.office || tags.company || tags.building) return 3
  if (tags.shop || tags.amenity || tags.tourism || tags.craft) return 2
  return 1
}

function parseNum(raw: unknown): number | null {
  const m = /([\d.]+)/.exec(String(raw ?? ''))
  return m ? parseFloat(m[1]) : null
}

function estimateLevels(area: number): number {
  if (area < 300) return 3
  if (area < 800) return 5
  if (area < 2000) return 8
  if (area < 6000) return 12
  return 16
}

function ringAreaM2(ring: Coord[]): number {
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

function closedRing(geometry: OverpassGeometry[] | undefined): Coord[] | null {
  if (!geometry || geometry.length < 4) return null
  const a = geometry[0]
  const b = geometry[geometry.length - 1]
  if (a.lat !== b.lat || a.lon !== b.lon) return null
  return geometry.map((p) => [p.lon, p.lat])
}

function elementToPolygon(el: OverpassElement): Coord[][] | null {
  if (el.type === 'way') {
    const ring = closedRing(el.geometry)
    return ring ? [ring] : null
  }
  const outers = (el.members ?? [])
    .filter((m) => m.type === 'way' && m.role === 'outer')
    .map((m) => closedRing(m.geometry))
    .filter((r): r is Coord[] => r !== null)
  return outers.length ? outers : null
}

function featureFromElement(el: OverpassElement): BuildingFeature | null {
  const rings = elementToPolygon(el)
  if (!rings) return null
  const tags = el.tags ?? {}
  const isMulti = el.type === 'relation' && rings.length > 1
  const geometry = isMulti
    ? { type: 'MultiPolygon' as const, coordinates: rings.map((r) => [r]) }
    : { type: 'Polygon' as const, coordinates: [rings[0]] }

  const area = Math.round(rings.reduce((s, r) => s + ringAreaM2(r), 0))
  if (area < MIN_AREA_M2) return null

  let height = parseNum(tags.height)
  let heightSrc: BuildingFeature['properties']['heightSrc'] = 'osm-height'
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

function pointInRing(lng: number, lat: number, ring: Coord[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function pointInFeature(lng: number, lat: number, f: BuildingFeature): boolean {
  if (f.geometry.type === 'Polygon') {
    return f.geometry.coordinates.some((r) => pointInRing(lng, lat, r))
  }
  return f.geometry.coordinates.some((poly) => poly.some((r) => pointInRing(lng, lat, r)))
}

/** 未命名楼栋：用落在其轮廓内的命名 POI 回填名称（公司/办公优先） */
function enrichNames(features: BuildingFeature[], pois: PoiPoint[]): void {
  for (const f of features) {
    if (f.properties.name) continue
    const [minLng, minLat, maxLng, maxLat] = bboxOf(f)
    let best: PoiPoint | null = null
    for (const p of pois) {
      if (p.lng < minLng || p.lng > maxLng || p.lat < minLat || p.lat > maxLat) continue
      if (!pointInFeature(p.lng, p.lat, f)) continue
      if (!best || p.prio > best.prio) best = p
    }
    if (best) {
      f.properties.name = best.name
      f.properties.nameSrc = 'poi'
    }
  }
}

/**
 * 运行时从 Overpass API 抓取 bbox 内建筑（多端点重试）。
 * 同时抓取范围内带名称的 POI 节点，用于给无名楼栋回填名称。
 */
export async function fetchBuildingsByBbox(bbox: Bbox): Promise<BuildingFeature[]> {
  const b = bbox.join(',')
  const q =
    `[out:json][timeout:60];(way["building"](${b});relation["building"](${b});` +
    `node["name"]["office"](${b});node["name"]["company"](${b});node["name"]["shop"](${b});` +
    `node["name"]["amenity"](${b});node["name"]["building"](${b});node["name"]["tourism"](${b});` +
    `node["name"]["craft"](${b}););out geom qt;`
  let lastErr: unknown
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { elements?: OverpassElement[] }
      const elements = json.elements ?? []
      const pois: PoiPoint[] = elements
        .filter((e) => e.type === 'node' && e.tags?.name && e.lat != null && e.lon != null)
        .map((e) => ({ lng: e.lon as number, lat: e.lat as number, name: e.tags?.name ?? '', prio: poiPriority(e.tags ?? {}) }))
        .filter((p) => p.name)
      const features = elements
        .map(featureFromElement)
        .filter((f): f is BuildingFeature => f !== null)
      enrichNames(features, pois)
      return features
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass API 不可达')
}
