<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import CustomCampusModal from '@/components/CustomCampusModal.vue'
import InfoPanel from '@/components/InfoPanel.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import Sidebar from '@/components/Sidebar.vue'
import { BASEMAPS } from '@/config/basemaps'
import { campusOptions, selectBuilding, selectedBuilding, store, switchCampus } from '@/store'

const sel = computed(() => selectedBuilding())
const showCustom = ref(false)

function onCampusChange(e: Event) {
  switchCampus((e.target as HTMLSelectElement).value)
}

function closeCustom() {
  showCustom.value = false
  store.drawMode = false
}

onMounted(() => switchCampus(store.campusId))
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">EasyMap<span>园区三维地图</span></div>
      <select :value="store.campusId" @change="onCampusChange">
        <option v-for="c in campusOptions()" :key="c.id" :value="c.id">{{ c.name }}</option>
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
      <button class="tb-btn" @click="showCustom ? closeCustom() : (showCustom = true)">
        {{ showCustom ? '收起面板' : '＋ 自定义园区' }}
      </button>
      <label class="check"><input v-model="store.showLabels" type="checkbox" />楼名标注</label>
    </header>
    <main class="main">
      <Sidebar />
      <div class="map-area">
        <MapCanvas />
        <InfoPanel v-if="sel && !showCustom" :feature="sel" />
        <CustomCampusModal v-if="showCustom" @close="closeCustom" />
        <div v-if="store.loading" class="loading">楼栋数据加载中…</div>
      </div>
    </main>
  </div>
</template>
