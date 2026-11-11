<script setup lang="ts">
import { computed } from 'vue'
import { selectBuilding } from '@/store'
import type { BuildingFeature } from '@/types'
import { getBuildingInfo } from '@/utils/mockData'

const props = defineProps<{ feature: BuildingFeature }>()

const SRC_LABEL: Record<string, string> = {
  'osm-height': 'OSM 高度',
  'osm-levels': 'OSM 层数推算',
  estimated: '面积估算',
  demo: '演示数据'
}

const info = computed(() => getBuildingInfo(props.feature))
const gfa = computed(() => Math.round(props.feature.properties.area * props.feature.properties.levels))
const srcLabel = computed(
  () => SRC_LABEL[props.feature.properties.heightSrc] ?? props.feature.properties.heightSrc
)
const vacant = computed(() => {
  const fl = info.value.floors
  return fl.length ? Math.round((fl.filter((x) => !x.tenant).length / fl.length) * 100) : 0
})
</script>

<template>
  <div class="card">
    <div class="card-head">
      <h3>{{ feature.properties.name ?? '未命名建筑' }}</h3>
      <button class="card-close" @click="selectBuilding(null)">×</button>
    </div>
    <div class="tags">
      <span class="tag">{{ info.usage }}</span>
      <span class="tag ghost">{{ info.builtYear }} 年建成</span>
    </div>
    <div class="grid">
      <div class="cell"><span class="k">高度</span><span class="v">{{ feature.properties.height }} m</span></div>
      <div class="cell"><span class="k">楼层</span><span class="v">{{ feature.properties.levels }} F</span></div>
      <div class="cell"><span class="k">占地面积</span><span class="v">{{ feature.properties.area }} m²</span></div>
      <div class="cell"><span class="k">建筑面积</span><span class="v">{{ gfa }} m²</span></div>
      <div class="cell"><span class="k">入驻企业</span><span class="v">{{ info.tenants.length }} 家</span></div>
      <div class="cell"><span class="k">空置率</span><span class="v">{{ vacant }}%</span></div>
    </div>
    <div class="sec-title">入驻企业</div>
    <div class="tenants">
      <span v-for="t in info.tenants" :key="t.name" class="tenant">
        <b>{{ t.name }}</b><i>{{ t.industry }}</i>
      </span>
    </div>
    <div class="sec-title">楼层明细</div>
    <div class="floors">
      <div v-for="fl in info.floors" :key="fl.floor" class="floor">
        <span class="f-no">F{{ fl.floor }}</span>
        <span class="f-tenant" :class="{ vacant: !fl.tenant }">{{ fl.tenant ?? '空置' }}</span>
      </div>
    </div>
    <p class="tip">编号 {{ feature.properties.osmId }} · 高度来源：{{ srcLabel }}</p>
  </div>
</template>
