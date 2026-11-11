export interface CampusDef {
  id: string
  name: string
  dataPath: string
  defaultBasemap: string
}

export const CAMPUSES: CampusDef[] = [
  {
    id: 'zgc-sfp',
    name: '中关村软件园（北京）',
    dataPath: '/data/zgc-sfp.geojson',
    defaultBasemap: 'gaode-satellite'
  },
  {
    id: 'szwanke',
    name: '深圳湾科技生态园（深圳）',
    dataPath: '/data/szwanke.geojson',
    defaultBasemap: 'gaode-satellite'
  }
]
