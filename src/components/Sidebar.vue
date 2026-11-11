<script setup lang="ts">
import { computed } from 'vue'
import { selectBuilding, store } from '@/store'
import type { BuildingFeature } from '@/types'
import { effectiveFloors, tenantsFromFloors } from '@/utils/mockData'

const filtered = computed(() => {
  const q = store.searchText.trim().toLowerCase()
  if (!q) return store.buildings
  return store.buildings.filter(
    (f) =>
      (f.properties.name ?? '').toLowerCase().includes(q) ||
      tenantsFromFloors(effectiveFloors(f, store.overrides[f.properties.osmId]?.floors)).some((t) =>
        t.name.toLowerCase().includes(q)
      )
  )
})

const stats = computed(() => {
  const bs = store.buildings
  const gfa = bs.reduce((s, f) => s + f.properties.area * f.properties.levels, 0)
  const tallest = bs.reduce<BuildingFeature | null>(
    (m, f) => (!m || f.properties.height > m.properties.height ? f : m),
    null
  )
  return {
    count: bs.length,
    gfaWan: (gfa / 10000).toFixed(1),
    tallest: tallest ? `${tallest.properties.name ?? '未命名'} ${tallest.properties.height}m` : '—',
    source: store.dataMeta?.source === 'demo' ? '演示数据' : (store.dataMeta?.source ?? '—')
  }
})
</script>

<template>
  <aside class="sidebar">
    <div class="side-stats">
      <div class="stat"><b>{{ stats.count }}</b><span>楼栋数</span></div>
      <div class="stat"><b>{{ stats.gfaWan }}</b><span>总建面（万m²）</span></div>
      <div class="stat wide"><b class="small">{{ stats.tallest }}</b><span>最高楼</span></div>
      <div class="stat wide"><b class="small">{{ stats.source }}</b><span>数据源</span></div>
    </div>
    <input v-model="store.searchText" class="side-search" placeholder="搜索楼栋名称或入驻企业…" />
    <div class="bldg-list">
      <button
        v-for="f in filtered"
        :key="f.properties.osmId"
        class="bldg-item"
        :class="{ active: store.selectedId === f.properties.osmId }"
        @click="selectBuilding(f.properties.osmId, true)"
      >
        <span class="bldg-name">{{ f.properties.name ?? '未命名建筑' }}</span>
        <span class="bldg-meta">{{ f.properties.levels }}F · {{ f.properties.height }}m</span>
      </button>
      <div v-if="!filtered.length" class="empty">无匹配楼栋</div>
    </div>
  </aside>
</template>
