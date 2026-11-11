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

/** 地址搜索（Photon/OSM，无需 key）。返回候选地点与范围框 */
export async function geocode(query: string): Promise<GeoResult[]> {
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5&lang=default`
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { features?: PhotonFeature[] }
      return (json.features ?? [])
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
    } catch (err) {
      lastErr = err
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('地址搜索服务不可达')
}
