<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get } from '@/api/client'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

interface AuditLogItem {
  id: number
  actorUserId: number | null
  actorRole: string
  actorNickname: string
  action: string
  targetType: string
  targetId: number | null
  detail: Record<string, unknown> | null
  ip: string | null
  createdAt: string
}

const rows = ref<AuditLogItem[]>([])
const actionFilter = ref('')
const actorFilter = ref('')
const loading = ref(false)
const error = ref('')

const actionLabel: Record<string, string> = {
  USER_DATA_EXPORT: '用户导出数据',
  USER_DELETE: '注销删除',
  ADMIN_ORDER_REFUND: '订单退款',
  ADMIN_WALLET_GRANT: '余额发放',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' })
    if (actionFilter.value.trim()) params.set('action', actionFilter.value.trim())
    if (actorFilter.value.trim()) params.set('actorUserId', actorFilter.value.trim())
    const data = await get<{ items: AuditLogItem[] }>(`/admin/audit-logs?${params.toString()}`)
    rows.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '审计日志加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <ErrorBanner v-if="error" :message="error" class="mt-4" />

    <div class="mt-4 flex flex-wrap gap-2">
      <input
        v-model="actionFilter"
        type="text"
        placeholder="操作类型（如 USER_DELETE）"
        class="h-9 w-56 px-3 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
        @keydown.enter="load"
      />
      <input
        v-model="actorFilter"
        type="number"
        placeholder="操作人用户 ID"
        class="h-9 w-36 px-3 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
        @keydown.enter="load"
      />
      <button
        type="button"
        class="h-9 px-4 rounded-full bg-pine text-card text-sm pressable"
        @click="load"
      >
        筛选
      </button>
    </div>

    <div v-if="loading" class="mt-4 space-y-3">
      <div v-for="i in 5" :key="i" class="h-16 rounded-[10px] bg-hairline/60 animate-pulse"></div>
    </div>
    <div v-else-if="rows.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
      <div v-for="item in rows" :key="item.id" class="py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-medium">
              {{ actionLabel[item.action] ?? item.action }}
              <span class="text-ink-faint text-sm">#{{ item.id }}</span>
            </p>
            <p class="mt-0.5 text-sm text-ink-soft">
              {{ item.actorNickname || (item.actorRole === 'SYSTEM' ? '系统' : `用户#${item.actorUserId ?? ''}`) }}
              · {{ item.targetType }} #{{ item.targetId ?? '—' }}
              <span v-if="item.ip" class="text-ink-faint"> · {{ item.ip }}</span>
            </p>
            <p class="catalog-tab mt-1">
              {{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
          </div>
          <span class="shrink-0 text-xs px-2.5 py-1 rounded-full bg-paper border border-hairline text-ink-soft">
            {{ item.actorRole }}
          </span>
        </div>
      </div>
    </div>
    <EmptyState v-else class="mt-4" title="暂无审计日志" hint="敏感操作会记录在这里。" />
  </div>
</template>
