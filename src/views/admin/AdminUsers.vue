<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get, patch } from '@/api/client'
import type { AdminUser } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import PaginationBar from '@/components/admin/PaginationBar.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'

const rows = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const statusFilter = ref('')
const createdFrom = ref('')
const createdTo = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const target = ref<AdminUser | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: '10' })
    if (keyword.value) params.set('keyword', keyword.value)
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (createdFrom.value) params.set('createdFrom', createdFrom.value)
    if (createdTo.value) params.set('createdTo', createdTo.value)
    const data = await get<{ items: AdminUser[]; pagination: { totalItems: number } }>(
      `/admin/users?${params.toString()}`,
    )
    rows.value = data.items
    total.value = data.pagination.totalItems
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function askToggle(user: AdminUser) {
  target.value = user
}

async function confirmToggle() {
  if (!target.value) return
  const user = target.value
  target.value = null
  try {
    await patch(`/admin/users/${user.id}/status`, { status: user.isDisabled ? 'ENABLED' : 'DISABLED' })
    success.value = user.isDisabled ? '已启用账号' : '已禁用账号'
    setTimeout(() => (success.value = ''), 2500)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}
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
            placeholder="手机号或昵称"
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
        <option value="ENABLED">正常</option>
        <option value="DISABLED">已禁用</option>
      </select>
      <label class="block">
        <span class="text-sm font-medium text-ink">注册从</span>
        <input
          v-model="createdFrom"
          type="date"
          class="mt-1.5 h-11 px-3 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
          @change="page = 1; load()"
        />
      </label>
      <label class="block">
        <span class="text-sm font-medium text-ink">到</span>
        <input
          v-model="createdTo"
          type="date"
          class="mt-1.5 h-11 px-3 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
          @change="page = 1; load()"
        />
      </label>
      <button
        type="button"
        class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"
        @click="page = 1; load()"
      >
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
              <th class="px-5 py-3 font-normal">用户</th>
              <th class="px-5 py-3 font-normal">手机号</th>
              <th class="px-5 py-3 font-normal">角色</th>
              <th class="px-5 py-3 font-normal">注册时间</th>
              <th class="px-5 py-3 font-normal">状态</th>
              <th class="px-5 py-3 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody v-if="!loading">
            <tr v-for="user in rows" :key="user.id" class="border-b border-hairline last:border-0">
              <td class="px-5 py-4 font-medium">{{ user.nickname }}</td>
              <td class="px-5 py-4 text-ink-soft">{{ user.phone }}</td>
              <td class="px-5 py-4"><span class="catalog-tab">{{ user.role }}</span></td>
              <td class="px-5 py-4 text-ink-soft">{{ new Date(user.createdAt).toLocaleDateString('zh-CN') }}</td>
              <td class="px-5 py-4">
                <StatusBadge :status="user.isDisabled ? 'DISABLED' : 'ENABLED'" :map="{ DISABLED: '已禁用', ENABLED: '正常' }" />
              </td>
              <td class="px-5 py-4 text-right">
                <button
                  type="button"
                  class="h-9 px-4 rounded-full border text-sm pressable"
                  :class="user.isDisabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'border-hairline bg-card text-ink-soft'"
                  @click="askToggle(user)"
                >
                  {{ user.isDisabled ? '启用' : '禁用' }}
                </button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="6" class="px-5 py-12 text-center text-ink-faint">没有匹配的用户</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loading" class="space-y-3 p-5">
        <div v-for="i in 5" :key="i" class="h-10 rounded-[10px] bg-hairline/60 animate-pulse"></div>
      </div>
      <PaginationBar v-model:page="page" :page-size="10" :total="total" @update:page="load" />
    </div>

    <ConfirmDialog
      :open="!!target"
      :title="target?.isDisabled ? '启用账号' : '禁用账号'"
      :message="`确认${target?.isDisabled ? '启用' : '禁用'}「${target?.nickname}」？`"
      :confirm-text="target?.isDisabled ? '启用' : '禁用'"
      :danger="!target?.isDisabled"
      @confirm="confirmToggle"
      @cancel="target = null"
    />
  </div>
</template>
