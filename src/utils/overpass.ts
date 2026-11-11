import type { BuildingFeature, Bbox, Coord } from '@/types'

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
  type: 'way' | 'relation'
  id: number
  tags?: Record<string, string>
  geometry?: OverpassGeometry[]
  members?: { type: string; role: string; geometry?: OverpassGeometry[] }[]
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

/** 运行时从 Overpass API 抓取 bbox 内建筑（多端点重试） */
export async function fetchBuildingsByBbox(bbox: Bbox): Promise<BuildingFeature[]> {
  const q = `[out:json][timeout:60];(way["building"](${bbox.join(',')});relation["building"](${bbox.join(',')}););out geom qt;`
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
      return (json.elements ?? [])
        .map(featureFromElement)
        .filter((f): f is BuildingFeature => f !== null)
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 1200))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass API 不可达')
}
