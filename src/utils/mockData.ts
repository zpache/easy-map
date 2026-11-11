import type { BuildingFeature } from '@/types'

export interface Tenant {
  name: string
  industry: string
}

export interface FloorInfo {
  floor: number
  tenant: string | null
}

export interface BuildingInfo {
  usage: string
  builtYear: number
  tenants: Tenant[]
  floors: FloorInfo[]
}

const COMPANIES: Tenant[] = [
  { name: '星河软件', industry: '软件研发' },
  { name: '云脉科技', industry: '云计算' },
  { name: '慧联智能', industry: '智能硬件' },
  { name: '方寸设计', industry: '数字创意' },
  { name: '启航生物', industry: '生物医药' },
  { name: '氪星游戏', industry: '游戏' },
  { name: '致远咨询', industry: '企业服务' },
  { name: '光年传媒', industry: '数字创意' },
  { name: '深蓝半导体', industry: '集成电路' },
  { name: '晨曦新能源', industry: '新能源' },
  { name: '睿见数据', industry: '大数据' },
  { name: '匠芯微电子', industry: '集成电路' },
  { name: '天工机器人', industry: '智能制造' },
  { name: '朗月医疗', industry: '医疗器械' },
  { name: '青柠网络', industry: '互联网' },
  { name: '巅峰智驾', industry: '自动驾驶' },
  { name: '禾光储能', industry: '新能源' },
  { name: '万象云', industry: '云计算' },
  { name: '灵犀算法', industry: '人工智能' },
  { name: '博闻法务', industry: '专业服务' }
]

const VACANT_RATE = 0.12

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function usageOf(f: BuildingFeature): string {
  const n = f.properties.name ?? ''
  if (n.includes('公寓')) return '人才公寓'
  if (n.includes('餐厅')) return '餐饮配套'
  if (n.includes('体育')) return '体育配套'
  if (n.includes('会议') || n.includes('展示')) return '会议展示'
  if (n.includes('数据')) return '数据中心'
  if (n.includes('实验')) return '研发实验'
  if (n.includes('接待') || n.includes('行政')) return '园区服务'
  if (f.properties.type === 'commercial') return '商业配套'
  return '研发办公'
}

const cache = new Map<string, BuildingInfo>()

/** 按楼栋 ID 确定性生成管理侧演示数据（同一楼栋多次取值一致） */
export function getBuildingInfo(f: BuildingFeature): BuildingInfo {
  const key = f.properties.osmId
  const hit = cache.get(key)
  if (hit) return hit

  const rng = mulberry32(hashCode(key))
  const builtYear = 2008 + Math.floor(rng() * 16)
  const tenantCount = 1 + Math.floor(rng() * 4)
  const start = Math.floor(rng() * COMPANIES.length)
  const tenants = Array.from({ length: tenantCount }, (_, i) => COMPANIES[(start + i * 7) % COMPANIES.length])

  const floors: FloorInfo[] = []
  for (let i = f.properties.levels; i >= 1; i--) {
    const vacant = rng() < VACANT_RATE
    floors.push({
      floor: i,
      tenant: vacant ? null : tenants[Math.floor(rng() * tenants.length)].name
    })
  }

  const info: BuildingInfo = { usage: usageOf(f), builtYear, tenants, floors }
  cache.set(key, info)
  return info
}
