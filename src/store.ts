import { reactive } from 'vue'
import { CAMPUSES } from '@/config/campuses'
import type { BuildingCollection, BuildingFeature, Bbox } from '@/types'

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

export interface CustomCampus {
  id: string
  name: string
  features: BuildingFeature[]
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
  flyTarget: null as FlyTarget | null,
  customCampuses: [] as CustomCampus[],
  drawMode: false,
  drawnBbox: null as Bbox | null,
  drawMsg: ''
})

export interface CampusOption {
  id: string
  name: string
  custom: boolean
}

export function campusOptions(): CampusOption[] {
  return [
    ...CAMPUSES.map((c) => ({ id: c.id, name: c.name, custom: false })),
    ...store.customCampuses.map((c) => ({ id: c.id, name: `${c.name}（自定义）`, custom: true }))
  ]
}

export function campusName(id: string): string {
  return campusOptions().find((c) => c.id === id)?.name ?? id
}

export function selectedBuilding(): BuildingFeature | null {
  return store.buildings.find((f) => f.properties.osmId === store.selectedId) ?? null
}

export function addCustomCampus(name: string, features: BuildingFeature[]): CustomCampus {
  const campus: CustomCampus = { id: `custom-${Date.now()}`, name, features }
  store.customCampuses.push(campus)
  return campus
}

export function switchCampus(id: string): void {
  const custom = store.customCampuses.find((c) => c.id === id)
  if (custom) {
    store.campusId = id
    store.selectedId = null
    store.dataMeta = {
      campus: custom.id,
      name: custom.name,
      source: 'OpenStreetMap',
      fetchedAt: new Date().toISOString()
    }
    store.buildings = custom.features
    store.flyTarget = { osmId: '__fit__', ts: Date.now() }
    return
  }
  const builtin = CAMPUSES.find((c) => c.id === id)
  if (!builtin) return
  void loadBuiltinCampus(builtin)
}

async function loadBuiltinCampus(campus: (typeof CAMPUSES)[number]): Promise<void> {
  store.campusId = campus.id
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
