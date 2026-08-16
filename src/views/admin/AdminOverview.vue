<!--
  AdminOverview: 运营概览（KPI 主区 + 今日/待办 + 快捷操作 + 待审核队列）
  既有 MindBasic 世界内重构：pine 主色、hairline 分割、卡片仅用于信息分组。
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get } from '@/api/client'
import type { AdminStats, AuditItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

defineProps<{ go?: (tab: string) => void }>()

const stats = ref<AdminStats | null>(null)
const pending = ref<AuditItem[]>([])
const pendingAuditTotal = ref(0)
const loading = ref(true)
const error = ref('')

const todayText = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

onMounted(async () => {
  try {
    const [s, audits] = await Promise.all([
      get<AdminStats>('/admin/stats'),
      get<{ items: AuditItem[]; pagination: { totalItems: number } }>(
        '/admin/coach-audits?status=PENDING&page=1&pageSize=5',
      ),
    ])
    stats.value = s
    pending.value = audits.items
    pendingAuditTotal.value = audits.pagination.totalItems
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

const kpis = () => [
  {
    label: '注册用户',
    value: stats.value?.userCount ?? 0,
    sub: `今日 +${stats.value?.todayUserCount ?? 0}`,
    to: 'users',
  },
  {
    label: '已审核教练',
    value: stats.value?.approvedCoachCount ?? 0,
    sub: `教练总数 ${stats.value?.coachCount ?? 0}`,
    to: 'audits',
  },
  {
    label: '预约单',
    value: stats.value?.appointmentCount ?? 0,
    sub: `待处理 ${stats.value?.pendingAppointmentCount ?? 0}`,
    to: '',
  },
  {
    label: '已发布文章',
    value: stats.value?.articleCount ?? 0,
    sub: '科普中心内容',
    to: 'articles',
  },
]

const quickActions = [
  { label: '发布文章', to: 'articles' },
  { label: '审核入驻', to: 'audits' },
  { label: '社群管理', to: 'communities' },
  { label: '平台配置', to: 'config' },
]
</script>

<template>
  <div>
    <ErrorBanner v-if="error" :message="error" />

    <div v-if="loading" class="space-y-4">
      <div class="bg-card border border-hairline rounded-[14px] grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-hairline md:divide-x">
        <div v-for="i in 4" :key="i" class="p-5 md:p-6">
          <div class="h-4 w-16 rounded bg-hairline/60 animate-pulse"></div>
          <div class="mt-3 h-8 w-20 rounded bg-hairline/60 animate-pulse"></div>
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-3">
        <div v-for="i in 2" :key="i" class="h-40 rounded-[14px] bg-hairline/60 animate-pulse"></div>
      </div>
      <div class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-14 rounded-[12px] bg-hairline/60 animate-pulse"></div>
      </div>
    </div>

    <template v-else-if="stats">
      <div class="bg-card border border-hairline rounded-[14px] grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 divide-hairline md:divide-x">
        <template v-for="kpi in kpis()" :key="kpi.label">
          <button
            v-if="kpi.to"
            type="button"
            class="p-5 md:p-6 text-left pressable hover:bg-paper/60 transition-colors"
            @click="go?.(kpi.to)"
          >
            <p class="text-sm text-ink-soft">{{ kpi.label }}</p>
            <p class="mt-2 text-3xl font-semibold tracking-tight text-pine">{{ kpi.value }}</p>
            <p class="mt-1.5 text-xs text-ink-faint">{{ kpi.sub }}</p>
          </button>
          <div v-else class="p-5 md:p-6">
            <p class="text-sm text-ink-soft">{{ kpi.label }}</p>
            <p class="mt-2 text-3xl font-semibold tracking-tight text-ink">{{ kpi.value }}</p>
            <p class="mt-1.5 text-xs text-ink-faint">{{ kpi.sub }}</p>
          </div>
        </template>
      </div>

      <div class="mt-4 grid md:grid-cols-2 gap-3">
        <div class="card p-5">
          <p class="catalog-tab">今日 · {{ todayText }}</p>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p class="text-2xl font-semibold text-pine">{{ stats.todayUserCount }}</p>
              <p class="mt-1 text-sm text-ink-soft">今日新增用户</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-pine">{{ stats.todayAppointmentCount }}</p>
              <p class="mt-1 text-sm text-ink-soft">今日新增预约</p>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <div class="flex items-center justify-between gap-3">
            <p class="catalog-tab">待办</p>
            <span
              v-if="pendingAuditTotal > 0"
              class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900"
            >
              {{ pendingAuditTotal }} 条待审核
            </span>
          </div>
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p class="text-2xl font-semibold" :class="pendingAuditTotal > 0 ? 'text-amber-900' : 'text-ink'">
                {{ pendingAuditTotal }}
              </p>
              <p class="mt-1 text-sm text-ink-soft">待审核入驻</p>
            </div>
            <div>
              <p class="text-2xl font-semibold" :class="stats.pendingAppointmentCount > 0 ? 'text-amber-900' : 'text-ink'">
                {{ stats.pendingAppointmentCount }}
              </p>
              <p class="mt-1 text-sm text-ink-soft">待处理预约</p>
            </div>
          </div>
          <div class="mt-5 pt-4 border-t border-hairline flex flex-wrap gap-x-5 gap-y-2">
            <button
              v-for="action in quickActions"
              :key="action.to"
              type="button"
              class="text-sm text-pine pressable"
              @click="go?.(action.to)"
            >
              {{ action.label }}
            </button>
          </div>
        </div>
      </div>

      <section v-if="pending.length" class="mt-8">
        <div class="flex items-baseline justify-between">
          <h2 class="text-lg font-semibold tracking-tight">待审核入驻</h2>
          <button type="button" class="text-sm text-pine pressable" @click="go?.('audits')">全部</button>
        </div>
        <div class="mt-4 divide-y divide-hairline border-y border-hairline">
          <button
            v-for="audit in pending"
            :key="audit.id"
            type="button"
            class="w-full py-4 flex items-center justify-between text-left pressable group"
            @click="go?.('audits')"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="w-9 h-9 rounded-full bg-pine-soft text-pine-deep text-sm flex items-center justify-center shrink-0">
                {{ audit.coachName.slice(0, 1) }}
              </span>
              <div class="min-w-0">
                <p class="font-medium group-hover:text-pine transition-colors">{{ audit.coachName }}</p>
                <p class="mt-1 text-sm text-ink-soft">
                  第 {{ audit.submitVersion }} 次提交 · {{ new Date(audit.submittedAt).toLocaleString('zh-CN', { hour12: false }) }}
                </p>
              </div>
            </div>
            <span class="shrink-0 text-sm text-pine">去审核</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
