<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhCaretDown as CaretDown } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

interface CrisisFollowUp {
  id: number
  actorId: number | null
  actorRole: string
  actorName: string
  action: string
  note: string | null
  createdAt: string
}

interface CrisisItem {
  id: number
  user: { id: number; nickname: string; phone: string }
  source: string
  level: string
  content: string
  status: 'OPEN' | 'FOLLOWING' | 'RESOLVED'
  assignedAdminId: number | null
  assignedAdminName: string
  resolvedAt: string | null
  createdAt: string
}

const rows = ref<CrisisItem[]>([])
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')
const expandedId = ref<number | null>(null)
const followUps = ref<CrisisFollowUp[]>([])
const note = ref('')
const acting = ref(false)

const statusMap: Record<string, string> = { OPEN: '待处理', FOLLOWING: '跟进中', RESOLVED: '已结案' }
const sourceMap: Record<string, string> = {
  CHAT: '在线聊天',
  EMOTION_JOURNAL: '情绪日记',
  COMMUNITY: '社群内容',
  AI_COACH: 'AI 教练',
  OTHER: '其他',
}
const actionMap: Record<string, string> = {
  DETECT: '系统检测',
  ASSIGN: '接管',
  FOLLOW_UP: '跟进',
  RESOLVE: '结案',
  REOPEN: '重新开启',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = statusFilter.value ? `?status=${statusFilter.value}&page=1&pageSize=50` : '?page=1&pageSize=50'
    const data = await get<{ items: CrisisItem[] }>(`/admin/crisis-flags${query}`)
    rows.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '危机记录加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function toggleExpand(item: CrisisItem) {
  if (expandedId.value === item.id) {
    expandedId.value = null
    followUps.value = []
    return
  }
  expandedId.value = item.id
  followUps.value = []
  note.value = ''
  try {
    const data = await get<{ flag: CrisisItem; followUps: CrisisFollowUp[] }>(
      `/admin/crisis-flags/${item.id}`,
    )
    followUps.value = data.followUps
  } catch (e) {
    error.value = e instanceof Error ? e.message : '详情加载失败'
  }
}

async function act(item: CrisisItem, action: 'assign' | 'follow-up' | 'resolve') {
  if (acting.value) return
  if (action !== 'assign' && !note.value.trim()) {
    error.value = '请填写处理说明'
    return
  }
  acting.value = true
  error.value = ''
  try {
    const url = `/admin/crisis-flags/${item.id}/${action}`
    const body = action === 'assign' ? {} : { note: note.value.trim() }
    await post(url, body)
    note.value = ''
    await load()
    await toggleExpand(item)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    acting.value = false
  }
}
</script>

<template>
  <div>
    <ErrorBanner v-if="error" :message="error" class="mt-4" />

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        v-for="s in ['', 'OPEN', 'FOLLOWING', 'RESOLVED']"
        :key="s"
        type="button"
        class="h-8 px-3 rounded-full border text-xs pressable"
        :class="statusFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="statusFilter = s; load()"
      >
        {{ s === '' ? '全部' : statusMap[s] }}
      </button>
    </div>

    <div v-if="loading" class="mt-4 space-y-3">
      <div v-for="i in 4" :key="i" class="h-20 rounded-[10px] bg-hairline/60 animate-pulse"></div>
    </div>
    <div v-else-if="rows.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
      <div v-for="item in rows" :key="item.id" class="py-4">
        <button type="button" class="w-full text-left pressable" @click="toggleExpand(item)">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-medium">
                {{ item.user.nickname }}（{{ item.user.phone }}）
                <span class="text-ink-faint text-sm">· {{ sourceMap[item.source] ?? item.source }}</span>
              </p>
              <p class="mt-1 text-sm text-ink-soft leading-relaxed line-clamp-2">{{ item.content }}</p>
              <p class="catalog-tab mt-1">
                {{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
                <span v-if="item.assignedAdminName"> · 值班：{{ item.assignedAdminName }}</span>
              </p>
            </div>
            <span
              class="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
              :class="
                item.status === 'OPEN'
                  ? 'bg-red-100 text-red-800'
                  : item.status === 'FOLLOWING'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-pine-soft text-pine-deep'
              "
            >
              {{ statusMap[item.status] }}
              <CaretDown :size="12" :class="expandedId === item.id ? 'rotate-180' : ''" />
            </span>
          </div>
        </button>

        <div v-if="expandedId === item.id" class="mt-3 rounded-[10px] bg-paper/70 border border-hairline p-4">
          <div v-if="followUps.length" class="space-y-2">
            <div v-for="f in followUps" :key="f.id" class="flex items-start gap-3 text-sm">
              <span class="shrink-0 text-xs px-2 py-0.5 rounded-full bg-card border border-hairline text-ink-soft">
                {{ actionMap[f.action] ?? f.action }}
              </span>
              <div class="min-w-0">
                <p class="text-ink">{{ f.note }}</p>
                <p class="catalog-tab mt-0.5">{{ f.actorName }} · {{ new Date(f.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</p>
              </div>
            </div>
          </div>

          <div v-if="item.status !== 'RESOLVED'" class="mt-3 flex flex-wrap items-center gap-2">
            <input
              v-model="note"
              type="text"
              placeholder="处理说明（跟进/结案必填）"
              class="h-9 flex-1 min-w-[200px] px-3 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine"
            />
            <button
              v-if="item.status === 'OPEN'"
              type="button"
              class="h-9 px-4 rounded-full border border-pine text-pine text-sm pressable disabled:opacity-50"
              :disabled="acting"
              @click="act(item, 'assign')"
            >
              我接管
            </button>
            <button
              type="button"
              class="h-9 px-4 rounded-full bg-pine text-card text-sm pressable disabled:opacity-50"
              :disabled="acting"
              @click="act(item, 'follow-up')"
            >
              记录跟进
            </button>
            <button
              type="button"
              class="h-9 px-4 rounded-full bg-red-800 text-card text-sm pressable disabled:opacity-50"
              :disabled="acting"
              @click="act(item, 'resolve')"
            >
              结案
            </button>
          </div>
          <p v-else class="mt-2 text-sm text-ink-soft">已结案，留痕如下。</p>
        </div>
      </div>
    </div>
    <EmptyState v-else class="mt-4" title="没有危机记录" hint="聊天、情绪日记、社群内容命中关键词后会自动建档。" />
  </div>
</template>
