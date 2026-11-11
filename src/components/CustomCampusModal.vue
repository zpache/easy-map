<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { addCustomCampus, selectBuilding, store, switchCampus } from '@/store'
import { geocode, type GeoResult } from '@/utils/geocode'
import { fetchBuildingsByBbox } from '@/utils/overpass'

const emit = defineEmits<{ close: [] }>()

const name = ref('')
const status = ref<'idle' | 'drawing' | 'fetching' | 'done' | 'error'>('idle')
const errorMsg = ref('')
const result = ref<{ id: string; count: number } | null>(null)

const query = ref('')
const searching = ref(false)
const geoResults = ref<GeoResult[]>([])
const searchError = ref('')

async function doSearch() {
  const q = query.value.trim()
  if (!q || searching.value) return
  searching.value = true
  searchError.value = ''
  try {
    geoResults.value = await geocode(q)
    if (!geoResults.value.length) searchError.value = '未找到该地址，换个关键词试试'
  } catch (e) {
    searchError.value = e instanceof Error ? e.message : String(e)
  } finally {
    searching.value = false
  }
}

function pickResult(r: GeoResult) {
  geoResults.value = []
  query.value = r.name
  store.locateTarget = { lng: r.lng, lat: r.lat, bbox: r.bbox, ts: Date.now() }
}

const bboxText = computed(() => {
  const b = store.drawnBbox
  return b ? b.map((n) => n.toFixed(5)).join(', ') : '未框选'
})

const bboxCmd = computed(() => (store.drawnBbox ? store.drawnBbox.join(',') : 'S,W,N,E'))

function startDraw() {
  store.drawnBbox = null
  store.drawMsg = ''
  store.drawMode = true
  status.value = 'drawing'
}

async function doFetch() {
  if (!store.drawnBbox || !name.value.trim()) return
  status.value = 'fetching'
  errorMsg.value = ''
  try {
    const features = await fetchBuildingsByBbox(store.drawnBbox)
    if (!features.length) throw new Error('该范围内没有找到建筑物数据')
    const campus = addCustomCampus(name.value.trim(), features)
    result.value = { id: campus.id, count: features.length }
    status.value = 'done'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e)
    status.value = 'error'
  }
}

function useCampus() {
  if (!result.value) return
  selectBuilding(null)
  switchCampus(result.value.id)
  emit('close')
}

function downloadGeojson() {
  const campus = store.customCampuses.find((c) => c.id === result.value?.id)
  if (!campus) return
  const fc = {
    type: 'FeatureCollection',
    meta: {
      campus: campus.id,
      name: campus.name,
      source: 'OpenStreetMap',
      fetchedAt: new Date().toISOString()
    },
    features: campus.features
  }
  const blob = new Blob([JSON.stringify(fc)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${campus.id}.geojson`
  a.click()
  URL.revokeObjectURL(a.href)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && store.drawMode) {
    store.drawMode = false
    if (status.value === 'drawing') status.value = 'idle'
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  store.drawMode = false
})
</script>

<template>
  <div class="custom-panel">
    <div class="card-head">
      <h3>自定义园区</h3>
      <button class="card-close" @click="emit('close')">×</button>
    </div>

    <template v-if="status === 'done' && result">
      <p class="ok">已获取 {{ result.count }} 栋建筑，已加入园区列表。</p>
      <div class="btn-row">
        <button class="btn primary" @click="useCampus">立即查看</button>
        <button class="btn" @click="downloadGeojson">下载 GeoJSON</button>
      </div>
      <p class="hint">
        该园区暂存于当前会话。要持久化：把下载的 GeoJSON 放到 public/data/，在
        src/config/campuses.ts 中加一项配置；或直接运行：<br />
        <code>npm run fetch:data -- --bbox={{ bboxCmd }} --id=my-campus --name={{ name }}</code>
      </p>
    </template>

    <template v-else>
      <div class="fld">
        <span>地址定位</span>
        <div class="search-row">
          <input
            v-model="query"
            placeholder="输入地址或地标，如：望京 SOHO"
            @keyup.enter="doSearch"
          />
          <button class="btn search-btn" :disabled="searching || !query.trim()" @click="doSearch">
            {{ searching ? '搜索中…' : '搜索' }}
          </button>
        </div>
        <div v-if="geoResults.length" class="geo-results">
          <button v-for="(r, i) in geoResults" :key="i" class="geo-item" @click="pickResult(r)">
            <b>{{ r.name }}</b><i>{{ r.detail }}</i>
          </button>
        </div>
        <p v-if="searchError" class="err">{{ searchError }}</p>
      </div>
      <label class="fld">
        <span>园区名称</span>
        <input v-model="name" placeholder="例如：望京研发园" />
      </label>
      <div class="fld">
        <span>范围（南, 西, 北, 东）</span>
        <div class="bbox-line">{{ bboxText }}</div>
      </div>
      <div class="btn-row">
        <button class="btn" :class="{ active: status === 'drawing' }" @click="startDraw">
          {{ status === 'drawing' ? '正在框选…' : '① 框选范围' }}
        </button>
        <button
          class="btn primary"
          :disabled="!store.drawnBbox || !name.trim() || status === 'fetching'"
          @click="doFetch"
        >
          {{ status === 'fetching' ? '抓取中…' : '② 获取建筑' }}
        </button>
      </div>
      <p v-if="status === 'drawing'" class="hint">在地图上按住左键拖拽画矩形，松开完成；按 Esc 取消。</p>
      <p v-if="store.drawMsg" class="err">{{ store.drawMsg }}</p>
      <p v-if="status === 'error'" class="err">抓取失败：{{ errorMsg }}</p>
      <p class="hint">
        建筑数据来自 OpenStreetMap（Overpass API，多端点自动重试）。当前网络不可达时，请在能连通的环境用抓取命令预先获取。
      </p>
    </template>
  </div>
</template>
