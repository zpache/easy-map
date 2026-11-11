import { reactive } from 'vue'
import { CAMPUSES } from '@/config/campuses'
import type { BuildingCollection, BuildingFeature, BuildingProps, Bbox } from '@/types'

const LS_KEY = 'easy-map-overrides-v1'

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

export interface BuildingOverride {
  name?: string | null
  height?: number
  levels?: number
  /** 楼层租户人工修正：楼层号（字符串）→ 企业名，null=空置 */
  floors?: Record<string, string | null>
  orig?: Pick<BuildingProps, 'name' | 'height' | 'levels' | 'heightSrc' | 'nameSrc'>
}

function loadOverrides(): Record<string, BuildingOverride> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveOverrides(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store.overrides))
  } catch {
    /* 存储不可用时静默降级为会话级 */
  }
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
  overrides: loadOverrides(),
  drawMode: false,
  drawnBbox: null as Bbox | null,
  drawMsg: '',
  locateTarget: null as { lng: number; lat: number; bbox?: Bbox; ts: number } | null
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
    applyStoredOverrides(custom.features)
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
    applyStoredOverrides(gj.features)
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

/** 统一的修正应用规则：层数↔高度按 3.2m/层联动换算（保存与回放共用） */
function resolveOverrideProps(f: BuildingFeature, rec: BuildingOverride): void {
  if (rec.levels !== undefined) {
    f.properties.levels = rec.levels
    f.properties.height = Math.round(rec.levels * 3.2 * 10) / 10
    f.properties.heightSrc = 'manual'
  }
  if (rec.height !== undefined) {
    f.properties.height = rec.height
    f.properties.heightSrc = 'manual'
    f.properties.levels = Math.max(1, Math.round(rec.height / 3.2))
  }
  if (rec.name !== undefined) {
    f.properties.name = rec.name
    f.properties.nameSrc = 'osm'
  }
}

/** 人工修正楼栋属性（名称/高度/层数），写入 localStorage 持久化 */
export function applyBuildingOverride(osmId: string, patch: BuildingOverride): void {
  const f = store.buildings.find((x) => x.properties.osmId === osmId)
  if (!f) return
  const rec = store.overrides[osmId] ?? {}
  if (!rec.orig) {
    rec.orig = {
      name: f.properties.name,
      height: f.properties.height,
      levels: f.properties.levels,
      heightSrc: f.properties.heightSrc,
      nameSrc: f.properties.nameSrc
    }
  }
  const merged: BuildingOverride = { ...rec, ...patch }
  resolveOverrideProps(f, merged)
  store.overrides[osmId] = merged
  saveOverrides()
  store.buildings = store.buildings.slice()
}

/** 撤销某栋楼的人工修正，恢复到抓取时的原始值 */
export function resetBuildingOverride(osmId: string): void {
  const rec = store.overrides[osmId]
  const f = store.buildings.find((x) => x.properties.osmId === osmId)
  if (!rec?.orig || !f) return
  Object.assign(f.properties, rec.orig)
  delete store.overrides[osmId]
  saveOverrides()
  store.buildings = store.buildings.slice()
}

/** 楼层租户人工修正（读取时与演示数据合并，持久化到 localStorage） */
export function setFloorTenants(osmId: string, floors: Record<number, string | null>): void {
  const rec = store.overrides[osmId] ?? {}
  const merged: Record<string, string | null> = { ...(rec.floors ?? {}) }
  for (const [k, v] of Object.entries(floors)) merged[k] = v
  store.overrides[osmId] = { ...rec, floors: merged }
  saveOverrides()
  store.buildings = store.buildings.slice()
}

/** 数据加载后回放已保存的修正（刷新后/重新抓取后生效） */
export function applyStoredOverrides(features: BuildingFeature[]): void {
  for (const f of features) {
    const rec = store.overrides[f.properties.osmId]
    if (!rec) continue
    resolveOverrideProps(f, rec)
  }
}
