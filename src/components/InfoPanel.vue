<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  applyBuildingOverride,
  resetBuildingOverride,
  selectBuilding,
  setFloorTenants,
  store,
  type BuildingOverride
} from '@/store'
import type { BuildingFeature } from '@/types'
import { effectiveFloors, tenantsFromFloors } from '@/utils/mockData'

const props = defineProps<{ feature: BuildingFeature }>()

const SRC_LABEL: Record<string, string> = {
  'osm-height': 'OSM 实测',
  'osm-levels': 'OSM 层数推算',
  estimated: '面积估算',
  demo: '演示数据',
  manual: '人工修正'
}

const osmId = computed(() => props.feature.properties.osmId)
const override = computed(() => store.overrides[osmId.value])
const effFloors = computed(() => effectiveFloors(props.feature, override.value?.floors))
const effTenants = computed(() => tenantsFromFloors(effFloors.value))
const gfa = computed(() => Math.round(props.feature.properties.area * props.feature.properties.levels))
const srcLabel = computed(
  () => SRC_LABEL[props.feature.properties.heightSrc] ?? props.feature.properties.heightSrc
)
const vacant = computed(() => {
  const fl = effFloors.value
  return fl.length ? Math.round((fl.filter((x) => !x.tenant).length / fl.length) * 100) : 0
})

const editing = ref(false)
const draft = ref({ name: '', height: '', levels: '' })

function startEdit() {
  draft.value = {
    name: props.feature.properties.name ?? '',
    height: String(props.feature.properties.height),
    levels: String(props.feature.properties.levels)
  }
  editing.value = true
}

function saveEdit() {
  const p = props.feature.properties
  const patch: BuildingOverride = {}
  const nm = draft.value.name.trim()
  if ((p.name ?? '') !== nm) patch.name = nm || null
  const h = parseFloat(draft.value.height)
  const lv = parseInt(draft.value.levels, 10)
  if (Number.isFinite(h) && h > 0 && Math.abs(h - p.height) > 0.05) patch.height = h
  else if (Number.isFinite(lv) && lv > 0 && lv !== p.levels) patch.levels = lv
  applyBuildingOverride(p.osmId, patch)
  editing.value = false
}

const floorEditing = ref(false)
const floorDraft = ref<Record<number, string>>({})

function toggleFloorEdit() {
  const d: Record<number, string> = {}
  effFloors.value.forEach((fl) => {
    d[fl.floor] = fl.tenant ?? ''
  })
  floorDraft.value = d
  floorEditing.value = true
}

function saveFloors() {
  const patch: Record<number, string | null> = {}
  for (const fl of effFloors.value) {
    const v = (floorDraft.value[fl.floor] ?? '').trim()
    if ((fl.tenant ?? '') !== v) patch[fl.floor] = v || null
  }
  if (Object.keys(patch).length) setFloorTenants(osmId.value, patch)
  floorEditing.value = false
}
</script>

<template>
  <div class="card">
    <div class="card-head">
      <input v-if="editing" v-model="draft.name" class="edit-name" placeholder="楼栋名称" />
      <h3 v-else>{{ feature.properties.name ?? '未命名建筑' }}</h3>
      <button class="card-close" @click="editing ? (editing = false) : selectBuilding(null)">×</button>
    </div>
    <div class="tags">
      <span class="tag">{{ effTenants.length ? '在用' : '未录入' }}</span>
      <span v-if="feature.properties.nameSrc === 'poi'" class="tag ghost">名称取自 POI</span>
      <span v-if="override" class="tag ghost">已人工修正</span>
    </div>
    <div class="grid">
      <div class="cell">
        <span class="k">高度</span>
        <span v-if="!editing" class="v">{{ feature.properties.height }} m</span>
        <input v-else v-model="draft.height" class="edit-num" type="number" step="0.1" min="1" />
      </div>
      <div class="cell">
        <span class="k">楼层</span>
        <span v-if="!editing" class="v">{{ feature.properties.levels }} F</span>
        <input v-else v-model="draft.levels" class="edit-num" type="number" step="1" min="1" />
      </div>
      <div class="cell"><span class="k">占地面积</span><span class="v">{{ feature.properties.area }} m²</span></div>
      <div class="cell"><span class="k">建筑面积</span><span class="v">{{ gfa }} m²</span></div>
      <div class="cell"><span class="k">入驻企业</span><span class="v">{{ effTenants.length }} 家</span></div>
      <div class="cell"><span class="k">空置率</span><span class="v">{{ vacant }}%</span></div>
    </div>
    <div v-if="editing" class="btn-row">
      <button class="btn primary" @click="saveEdit">保存</button>
      <button v-if="override" class="btn" @click="resetBuildingOverride(osmId); editing = false">恢复原始</button>
      <button v-else class="btn" @click="editing = false">取消</button>
    </div>
    <button v-else class="btn edit-btn" @click="startEdit">编辑名称 / 高度</button>
    <div class="sec-title">入驻企业</div>
    <div class="tenants">
      <span v-for="t in effTenants" :key="t.name" class="tenant">
        <b>{{ t.name }}</b><i>{{ t.industry }}</i>
      </span>
      <span v-if="!effTenants.length" class="empty-inline">暂无，可在楼层明细中录入</span>
    </div>
    <div class="sec-title sec-flex">
      <span>楼层明细</span>
      <span v-if="floorEditing" class="row-btns">
        <button class="mini-btn primary" @click="saveFloors">保存</button>
        <button class="mini-btn" @click="floorEditing = false">取消</button>
      </span>
      <button v-else class="mini-btn" @click="toggleFloorEdit">编辑租户</button>
    </div>
    <div class="floors">
      <div v-for="fl in effFloors" :key="fl.floor" class="floor">
        <span class="f-no">F{{ fl.floor }}</span>
        <input
          v-if="floorEditing"
          v-model="floorDraft[fl.floor]"
          class="edit-floor"
          placeholder="留空表示空置"
        />
        <span v-else class="f-tenant" :class="{ vacant: !fl.tenant }">{{ fl.tenant ?? '空置' }}</span>
      </div>
    </div>
    <p class="tip">编号 {{ feature.properties.osmId }} · 高度来源：{{ srcLabel }}</p>
  </div>
</template>
