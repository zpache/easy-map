<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { buildStyle, getBasemap } from '@/config/basemaps'
import { selectBuilding, store } from '@/store'
import type { BuildingFeature } from '@/types'
import { bboxOf, transformFeature } from '@/utils/coords'

let map: maplibregl.Map | null = null
let pendingFit = false
let pendingSync = false
let markers: maplibregl.Marker[] = []
const containerEl = ref<HTMLDivElement | null>(null)
const hoverId = ref<string | null>(null)

function currentBasemap() {
  return getBasemap(store.basemapId)
}

function transformed(f: BuildingFeature): BuildingFeature {
  return currentBasemap().coord === 'gcj02' ? transformFeature(f) : f
}

function currentData() {
  return { type: 'FeatureCollection', features: store.buildings.map(transformed) }
}

function applyFilters() {
  if (!map) return
  if (map.getLayer('bldg-hover')) {
    map.setFilter('bldg-hover', ['==', ['get', 'osmId'], hoverId.value ?? '__none__'])
  }
  if (map.getLayer('bldg-selected')) {
    map.setFilter('bldg-selected', ['==', ['get', 'osmId'], store.selectedId ?? '__none__'])
  }
}

function syncAll() {
  if (!map) return
  if (!map.isStyleLoaded()) {
    pendingSync = true
    map.once('idle', () => syncAll())
    return
  }
  pendingSync = false
  const fc = currentData()
  if (!map.getSource('buildings')) {
    map.addSource('buildings', { type: 'geojson', data: fc as never })
  } else {
    ;(map.getSource('buildings') as maplibregl.GeoJSONSource).setData(fc as never)
  }
  if (!map.getLayer('bldg-base')) {
    map.addLayer({
      id: 'bldg-base',
      type: 'fill-extrusion',
      source: 'buildings',
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['get', 'height'],
          0,
          '#dce8f5',
          24,
          '#c2d5e8',
          50,
          '#9cb7d4',
          90,
          '#7a9cc1',
          140,
          '#5c80ad'
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92
      }
    } as never)
  }
  if (!map.getLayer('bldg-hover')) {
    map.addLayer({
      id: 'bldg-hover',
      type: 'fill-extrusion',
      source: 'buildings',
      filter: ['==', ['get', 'osmId'], '__none__'],
      paint: {
        'fill-extrusion-color': '#69d2ff',
        'fill-extrusion-height': ['+', ['get', 'height'], 0.4],
        'fill-extrusion-opacity': 0.95
      }
    } as never)
  }
  if (!map.getLayer('bldg-selected')) {
    map.addLayer({
      id: 'bldg-selected',
      type: 'fill-extrusion',
      source: 'buildings',
      filter: ['==', ['get', 'osmId'], '__none__'],
      paint: {
        'fill-extrusion-color': '#ffb04d',
        'fill-extrusion-height': ['+', ['get', 'height'], 0.6],
        'fill-extrusion-opacity': 0.98
      }
    } as never)
  }
  applyFilters()
}

/** 根据外接框计算适合的 center/zoom，再以固定俯仰角飞行 */
function viewBbox(
  b: [number, number, number, number],
  pad: { left: number; right: number; top: number; bottom: number }
) {
  if (!map) return
  const vw = map.getContainer().clientWidth
  const vh = map.getContainer().clientHeight
  const availW = Math.max(120, vw - pad.left - pad.right)
  const availH = Math.max(120, vh - pad.top - pad.bottom)
  const latC = (b[1] + b[3]) / 2
  const wM = (b[2] - b[0]) * 111320 * Math.cos((latC * Math.PI) / 180)
  const hM = (b[3] - b[1]) * 110540
  const mpp = Math.max(wM / availW, hM / availH)
  const zoom = Math.min(17.5, Math.max(3, Math.log2((156543.03392 * Math.cos((latC * Math.PI) / 180)) / mpp)))
  map.flyTo({
    center: [(b[0] + b[2]) / 2, latC],
    zoom,
    pitch: 55,
    bearing: -20,
    duration: 1200,
    essential: true
  })
}

function fitAll() {
  if (!store.buildings.length) return
  let bb: [number, number, number, number] = [180, 90, -180, -90]
  for (const f of store.buildings) {
    const b = bboxOf(transformed(f))
    bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]
  }
  viewBbox(bb, { left: 330, right: 60, top: 70, bottom: 70 })
}

function flyToBuilding(f: BuildingFeature) {
  viewBbox(bboxOf(transformed(f)), { left: 340, right: 360, top: 80, bottom: 80 })
}

function syncLabels() {
  if (!map) return
  markers.forEach((m) => m.remove())
  markers = []
  if (!store.showLabels || map.getZoom() < 14.5) return
  for (const f of store.buildings) {
    if (!f.properties.name) continue
    const b = bboxOf(transformed(f))
    const el = document.createElement('div')
    el.className = 'bldg-label'
    el.textContent = f.properties.name
    markers.push(
      new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])
        .addTo(map)
    )
  }
}

function maybeFit() {
  if (map && map.isStyleLoaded() && pendingFit) {
    pendingFit = false
    fitAll()
  }
}

onMounted(() => {
  if (!containerEl.value) return
  map = new maplibregl.Map({
    container: containerEl.value,
    style: buildStyle(currentBasemap()) as never,
    center: [116.305, 40.045],
    zoom: 14,
    pitch: 55,
    bearing: -20
  })
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__easyMap = map
  }
  map.on('style.load', () => {
    syncAll()
    maybeFit()
    syncLabels()
  })
  map.on('moveend', syncLabels)
  map.on('mousemove', (e) => {
    if (!map || !map.getLayer('bldg-base')) return
    const feats = map.queryRenderedFeatures(e.point, { layers: ['bldg-base'] })
    const id = (feats[0]?.properties as { osmId?: string } | undefined)?.osmId ?? null
    if (id !== hoverId.value) {
      hoverId.value = id
      map.getCanvas().style.cursor = id ? 'pointer' : ''
    }
  })
  map.on('click', (e) => {
    if (!map || !map.getLayer('bldg-base')) return
    const feats = map.queryRenderedFeatures(e.point, { layers: ['bldg-base'] })
    const id = (feats[0]?.properties as { osmId?: string } | undefined)?.osmId ?? null
    selectBuilding(id)
  })
})

onBeforeUnmount(() => {
  markers.forEach((m) => m.remove())
  markers = []
  map?.remove()
  map = null
})

watch(() => store.basemapId, () => map?.setStyle(buildStyle(currentBasemap()) as never))
watch(
  () => store.buildings,
  () => {
    pendingFit = true
    syncAll()
    maybeFit()
    syncLabels()
  }
)
watch(() => store.showLabels, syncLabels)
watch(hoverId, applyFilters)
watch(() => store.selectedId, applyFilters)
watch(
  () => store.flyTarget,
  (t) => {
    if (!t || !map) return
    if (t.osmId === '__fit__') fitAll()
    else {
      const f = store.buildings.find((x) => x.properties.osmId === t.osmId)
      if (f) flyToBuilding(f)
    }
  }
)
</script>

<template>
  <div ref="containerEl" class="map-wrap"></div>
</template>
