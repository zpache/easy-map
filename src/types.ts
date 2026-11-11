export interface BuildingProps {
  osmId: string
  name: string | null
  type: string | null
  height: number
  levels: number
  heightSrc: 'osm-height' | 'osm-levels' | 'estimated' | 'demo'
  area: number
}

export type Coord = [number, number]

export interface BuildingFeature {
  type: 'Feature'
  geometry:
    | { type: 'Polygon'; coordinates: Coord[][] }
    | { type: 'MultiPolygon'; coordinates: Coord[][][] }
  properties: BuildingProps
}

export interface BuildingCollection {
  type: 'FeatureCollection'
  meta?: { campus: string; name: string; source: string; fetchedAt: string }
  features: BuildingFeature[]
}
