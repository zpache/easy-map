import { reactive } from 'vue'
import { CAMPUSES } from '@/config/campuses'
import type { BuildingCollection, BuildingFeature } from '@/types'

interface FlyTarget {
  osmId: string | '__fit__'
  ts: number
}

export interface DataMeta {
  campus: string
  name: string
  source: string
  fetchedAt: string
}

export const store = reactive({
  campusId: CAMPUSES[0].id,
  basemapId: CAMPUSES[0].defaultBasemap,
  showLabels: true,
  buildings: [] as BuildingFeature[],
  dataMeta: null as DataMeta | null,
  searchText: '',
  loading: false,
  selectedId: null as string | null,
  flyTarget: null as FlyTarget | null
})

export function selectedBuilding(): BuildingFeature | null {
  return store.buildings.find((f) => f.properties.osmId === store.selectedId) ?? null
}

export async function switchCampus(id: string): Promise<void> {
  const campus = CAMPUSES.find((c) => c.id === id)
  if (!campus) return
  store.campusId = id
  store.basemapId = campus.defaultBasemap
  store.loading = true
  store.selectedId = null
  try {
    const res = await fetch(campus.dataPath)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const gj: BuildingCollection = await res.json()
    store.dataMeta = gj.meta ?? null
    store.buildings = gj.features
    store.flyTarget = { osmId: '__fit__', ts: Date.now() }
  } finally {
    store.loading = false
  }
}

export function selectBuilding(osmId: string | null, fly = false): void {
  store.selectedId = osmId
  if (osmId && fly) store.flyTarget = { osmId, ts: Date.now() }
}
