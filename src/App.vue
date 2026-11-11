<script setup lang="ts">
import { computed, onMounted } from 'vue'
import InfoPanel from '@/components/InfoPanel.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import Sidebar from '@/components/Sidebar.vue'
import { BASEMAPS } from '@/config/basemaps'
import { CAMPUSES } from '@/config/campuses'
import { selectBuilding, selectedBuilding, store, switchCampus } from '@/store'

const sel = computed(() => selectedBuilding())

function onCampusChange(e: Event) {
  switchCampus((e.target as HTMLSelectElement).value)
}

onMounted(() => switchCampus(store.campusId))
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">EasyMap<span>园区三维地图</span></div>
      <select :value="store.campusId" @change="onCampusChange">
        <option v-for="c in CAMPUSES" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="seg">
        <button
          v-for="b in BASEMAPS"
          :key="b.id"
          :class="{ active: store.basemapId === b.id }"
          @click="store.basemapId = b.id"
        >
          {{ b.label }}
        </button>
      </div>
      <div class="spacer"></div>
      <label class="check"><input v-model="store.showLabels" type="checkbox" />楼名标注</label>
    </header>
    <main class="main">
      <Sidebar />
      <div class="map-area">
        <MapCanvas />
        <InfoPanel v-if="sel" :feature="sel" />
        <div v-if="store.loading" class="loading">楼栋数据加载中…</div>
      </div>
    </main>
  </div>
</template>
