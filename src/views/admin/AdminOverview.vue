<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get } from '@/api/client'
import type { AdminStats, AuditItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

defineProps<{ go?: (tab: string) => void }>()

const stats = ref<AdminStats | null>(null)
const pending = ref<AuditItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const [s, audits] = await Promise.all([
      get<AdminStats>('/admin/stats'),
      get<{ items: AuditItem[] }>('/admin/coach-audits?status=PENDING&page=1&pageSize=5'),
    ])
    stats.value = s
    pending.value = audits.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

const kpis = () => [
  { label: '注册用户', value: stats.value?.userCount ?? 0, to: 'users' },
  { label: '教练总数', value: stats.value?.coachCount ?? 0, to: 'audits' },
  { label: '已审核教练', value: stats.value?.approvedCoachCount ?? 0, to: 'audits' },
  { label: '预约单', value: stats.value?.appointmentCount ?? 0, to: '' },
  { label: '待处理预约', value: stats.value?.pendingAppointmentCount ?? 0, to: '' },
  { label: '已发布文章', value: stats.value?.articleCount ?? 0, to: 'articles' },
]
</script>

<template>
  <div>
    <ErrorBanner v-if="error" :message="error" />
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div v-for="i in 6" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>
    <div v-else-if="stats" class="grid grid-cols-2 md:grid-cols-3 gap-3">
      <button
        v-for="kpi in kpis()"
        :key="kpi.label"
        type="button"
        class="bg-card border border-hairline rounded-[14px] p-5 text-left pressable"
        :class="kpi.to ? 'hover:border-pine' : 'cursor-default'"
        :disabled="!kpi.to"
        @click="kpi.to && go?.(kpi.to)"
      >
        <p class="text-3xl font-semibold tracking-tight text-pine">{{ kpi.value }}</p>
        <p class="mt-1.5 text-sm text-ink-soft">{{ kpi.label }}</p>
      </button>
    </div>

    <section v-if="pending.length" class="mt-10">
      <div class="flex items-baseline justify-between">
        <h2 class="text-lg font-semibold tracking-tight">待审核入驻</h2>
        <button type="button" class="text-sm text-pine hover:underline" @click="go?.('audits')">全部</button>
      </div>
      <div class="mt-4 divide-y divide-hairline border-y border-hairline">
        <button
          v-for="audit in pending"
          :key="audit.id"
          type="button"
          class="w-full py-4 flex items-center justify-between text-left pressable"
          @click="go?.('audits')"
        >
          <div>
            <p class="font-medium">{{ audit.coachName }}</p>
            <p class="mt-1 text-sm text-ink-soft">
              第 {{ audit.submitVersion }} 次提交 · {{ new Date(audit.submittedAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
          </div>
          <span class="text-sm text-pine">去审核</span>
        </button>
      </div>
    </section>
  </div>
</template>
