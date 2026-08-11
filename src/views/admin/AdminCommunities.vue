<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get, patch } from '@/api/client'
import type { CommunityBrief } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import PaginationBar from '@/components/admin/PaginationBar.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'

type AdminCommunity = CommunityBrief & { status: 'ACTIVE' | 'DISABLED'; createdAt: string }

const rows = ref<AdminCommunity[]>([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: '10' })
    if (keyword.value) params.set('keyword', keyword.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    const data = await get<{ items: AdminCommunity[]; pagination: { totalItems: number } }>(
      `/admin/communities?${params.toString()}`,
    )
    rows.value = data.items
    total.value = data.pagination.totalItems
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleStatus(community: AdminCommunity) {
  try {
    const target = community.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
    await patch(`/admin/communities/${community.id}/status`, { status: target })
    success.value = target === 'DISABLED' ? '已下架社群' : '已上架社群'
    setTimeout(() => (success.value = ''), 2500)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="flex flex-col md:flex-row md:items-end gap-3">
      <div class="flex-1 md:max-w-xs">
        <label class="block">
          <span class="text-sm font-medium text-ink">搜索</span>
          <input
            v-model="keyword"
            type="search"
            class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine"
            placeholder="社群名称"
            @keyup.enter="page = 1; load()"
          />
        </label>
      </div>
      <select
        v-model="statusFilter"
        class="h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine"
        @change="page = 1; load()"
      >
        <option value="">全部状态</option>
        <option value="ACTIVE">已上架</option>
        <option value="DISABLED">已下架</option>
      </select>
      <button type="button" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable" @click="page = 1; load()">
        查询
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine-deep">{{ success }}</p>

    <div class="mt-6 bg-card border border-hairline rounded-[14px] overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[640px]">
          <thead>
            <tr class="text-left text-ink-faint border-b border-hairline">
              <th class="px-5 py-3 font-normal">社群</th>
              <th class="px-5 py-3 font-normal">带队教练</th>
              <th class="px-5 py-3 font-normal">成员</th>
              <th class="px-5 py-3 font-normal">状态</th>
              <th class="px-5 py-3 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody v-if="!loading">
            <tr v-for="community in rows" :key="community.id" class="border-b border-hairline last:border-0">
              <td class="px-5 py-4">
                <p class="font-medium max-w-[280px] truncate">{{ community.name }}</p>
                <p class="mt-0.5 text-xs text-ink-faint max-w-[280px] truncate">{{ community.description }}</p>
              </td>
              <td class="px-5 py-4 text-ink-soft">{{ community.coachNickname ?? '—' }}</td>
              <td class="px-5 py-4 text-ink-soft">{{ community.memberCount }}</td>
              <td class="px-5 py-4">
                <StatusBadge :status="community.status" :map="{ ACTIVE: '已上架', DISABLED: '已下架' }" />
              </td>
              <td class="px-5 py-4 text-right">
                <button
                  type="button"
                  class="h-9 px-4 rounded-full border text-sm pressable"
                  :class="community.status === 'ACTIVE' ? 'border-hairline bg-card text-ink-soft' : 'bg-pine-soft border-pine-soft text-pine-deep'"
                  @click="toggleStatus(community)"
                >
                  {{ community.status === 'ACTIVE' ? '下架' : '上架' }}
                </button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="5" class="px-5 py-12 text-center text-ink-faint">没有匹配的社群</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loading" class="space-y-3 p-5">
        <div v-for="i in 5" :key="i" class="h-10 rounded-[10px] bg-hairline/60 animate-pulse"></div>
      </div>
      <PaginationBar v-model:page="page" :page-size="10" :total="total" @update:page="load" />
    </div>
  </div>
</template>
