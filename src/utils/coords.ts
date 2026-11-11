import type { BuildingFeature, Coord } from '@/types'

const PI = Math.PI
const A = 6378245.0
const EE = 0.00669342162296594323

function outOfChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

/** WGS-84 转 GCJ-02（火星坐标），用于对齐高德底图 */
export function wgs84ToGcj02(lng: number, lat: number): Coord {
  if (outOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lng + dLng, lat + dLat]
}

function transformRing(ring: Coord[]): Coord[] {
  return ring.map(([lng, lat]) => wgs84ToGcj02(lng, lat))
}

/** 将楼栋要素从 WGS-84 转到 GCJ-02 */
export function transformFeature(f: BuildingFeature): BuildingFeature {
  if (f.geometry.type === 'Polygon') {
    return { ...f, geometry: { type: 'Polygon', coordinates: f.geometry.coordinates.map(transformRing) } }
  }
  return {
    ...f,
    geometry: { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map((p) => p.map(transformRing)) }
  }
}

/** 要素外接框 [minLng, minLat, maxLng, maxLat] */
export function bboxOf(f: BuildingFeature): [number, number, number, number] {
  let minLng = 180
  let minLat = 90
  let maxLng = -180
  let maxLat = -90
  const walk = (ring: Coord[]) => {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
  }
  if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach(walk)
  else f.geometry.coordinates.forEach((poly) => poly.forEach(walk))
  return [minLng, minLat, maxLng, maxLat]
}
