export interface RasterTile {
  url: string
  maxZoom?: number
  paint?: Record<string, unknown>
}

export interface BasemapDef {
  id: string
  label: string
  coord: 'wgs84' | 'gcj02'
  tiles: RasterTile[]
}

function expandSubdomains(url: string): string[] {
  const m = /\{(\d)-(\d)\}/.exec(url)
  if (!m) return [url]
  const a = Number(m[1])
  const b = Number(m[2])
  return Array.from({ length: b - a + 1 }, (_, i) => url.replace(m[0], String(a + i)))
}

/** 高德路网瓦片加暗化滤镜，充当深色底图（避免依赖需 API key 的 CARTO） */
const DARK_PAINT = {
  'raster-brightness-max': 0.45,
  'raster-saturation': 0.5,
  'raster-contrast': 0.08
}

export const BASEMAPS: BasemapDef[] = [
  {
    id: 'gaode-satellite',
    label: '卫星',
    coord: 'gcj02',
    tiles: [
      { url: 'https://webst0{1-4}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}' },
      { url: 'https://webst0{1-4}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}' }
    ]
  },
  {
    id: 'gaode-dark',
    label: '深色',
    coord: 'gcj02',
    tiles: [
      {
        url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
        paint: DARK_PAINT
      }
    ]
  },
  {
    id: 'gaode-street',
    label: '街道',
    coord: 'gcj02',
    tiles: [
      { url: 'https://webrd0{1-4}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}' }
    ]
  }
]

export function getBasemap(id: string): BasemapDef {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]
}

/** 构造 MapLibre raster 样式（不依赖 glyphs，楼名用 HTML Marker 标注） */
export function buildStyle(bm: BasemapDef): Record<string, unknown> {
  const groups = bm.tiles.map((t, i) => {
    const source: Record<string, unknown> = {
      type: 'raster',
      tiles: expandSubdomains(t.url),
      tileSize: 256
    }
    if (t.maxZoom) source.maxzoom = t.maxZoom
    return { id: `base-${i}`, source, paint: t.paint }
  })
  return {
    version: 8,
    sources: Object.fromEntries(groups.map((g) => [g.id, g.source])),
    layers: groups.map((g) => ({
      id: g.id,
      type: 'raster',
      source: g.id,
      ...(g.paint ? { paint: g.paint } : {})
    }))
  }
}
