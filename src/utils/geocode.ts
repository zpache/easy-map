export interface GeoResult {
  name: string
  detail: string
  lng: number
  lat: number
  /** [南, 西, 北, 东] */
  bbox?: [number, number, number, number]
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    district?: string
    city?: string
    state?: string
    extent?: [number, number, number, number]
  }
}

const GEO_CACHE_PREFIX = 'easy-map-geocode-'
const GEO_CACHE_TTL = 7 * 24 * 3600 * 1000
const GEO_CACHE_MAX = 50

function geoCacheKey(query: string): string {
  return GEO_CACHE_PREFIX + encodeURIComponent(query)
}

function readGeoCache(query: string): GeoResult[] | null {
  try {
    const raw = localStorage.getItem(geoCacheKey(query))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { ts: number; results: GeoResult[] }
    if (Date.now() - parsed.ts > GEO_CACHE_TTL) {
      localStorage.removeItem(geoCacheKey(query))
      return null
    }
    return parsed.results
  } catch {
    return null
  }
}

function writeGeoCache(query: string, results: GeoResult[]): void {
  try {
    localStorage.setItem(geoCacheKey(query), JSON.stringify({ ts: Date.now(), results }))
    const entries: { key: string; ts: number }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(GEO_CACHE_PREFIX)) continue
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? '{}') as { ts?: number }
        entries.push({ key: k, ts: v.ts ?? 0 })
      } catch {
        entries.push({ key: k, ts: 0 })
      }
    }
    entries.sort((a, b) => b.ts - a.ts)
    for (const e of entries.slice(GEO_CACHE_MAX)) localStorage.removeItem(e.key)
  } catch {
    /* 配额不足时忽略 */
  }
}

/** 地址搜索（Photon/OSM，无需 key）。结果本地缓存 7 天，请求 6s 超时重试一次 */
export async function geocode(query: string): Promise<GeoResult[]> {
  const cached = readGeoCache(query)
  if (cached) return cached
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=default`
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { features?: PhotonFeature[] }
      const results = (json.features ?? [])
        .filter((f) => f.geometry?.coordinates)
        .map((f) => {
          const p = f.properties ?? {}
          const [lng, lat] = f.geometry!.coordinates as [number, number]
          const detail = [...new Set([p.district, p.city, p.state].filter(Boolean))].join(' · ')
          const e = p.extent
          return {
            name: p.name ?? query,
            detail,
            lng,
            lat,
            bbox: e ? ([e[3], e[0], e[1], e[2]] as [number, number, number, number]) : undefined
          }
        })
      writeGeoCache(query, results)
      return results
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('地址搜索服务不可达')
}
