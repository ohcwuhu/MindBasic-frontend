<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhWallet as Wallet } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { AdminOrderItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import EmptyState from '@/components/EmptyState.vue'

const rows = ref<AdminOrderItem[]>([])
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const refundTarget = ref<AdminOrderItem | null>(null)
const refunding = ref(false)

// 余额发放
const grantUserId = ref<number | null>(null)
const grantAmount = ref<number>(10000)
const granting = ref(false)

const statusMap: Record<string, string> = {
  CREATED: '待支付',
  PAID: '已支付',
  CLOSED: '已关闭',
  REFUNDED: '已退款',
}

const typeMap: Record<string, string> = {
  APPOINTMENT: '预约订单',
  TOPUP: '充值单',
}

async function load() {
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    const query = statusFilter.value ? `?status=${statusFilter.value}&page=1&pageSize=50` : '?page=1&pageSize=50'
    const data = await get<{ items: AdminOrderItem[] }>(`/admin/orders${query}`)
    rows.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '订单加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function doRefund() {
  const item = refundTarget.value
  if (!item || refunding.value) return
  refundTarget.value = null
  refunding.value = true
  try {
    await post(`/admin/orders/${item.id}/refund`, { reason: '管理员退款' })
    success.value = `订单 ${item.orderNo} 已退款到用户余额`
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '退款失败'
  } finally {
    refunding.value = false
  }
}

async function grant() {
  if (granting.value || !grantUserId.value || grantAmount.value <= 0) return
  granting.value = true
  error.value = ''
  success.value = ''
  try {
    await post('/admin/wallet/grant', {
      userId: grantUserId.value,
      amountInCents: grantAmount.value,
      note: '管理后台发放',
    })
    success.value = `已为用户 #${grantUserId.value} 发放 ¥${(grantAmount.value / 100).toFixed(2)}`
    grantUserId.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发放失败'
  } finally {
    granting.value = false
  }
}

function money(cents: number): string {
  return (cents / 100).toFixed(2)
}
</script>

<template>
  <div class="space-y-6">
    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine bg-pine-soft/60 border border-pine/30 rounded-[10px] px-4 py-3">
      {{ success }}
    </p>

    <section class="card p-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="font-semibold">订单管理</p>
        <div class="flex gap-2">
          <button
            v-for="s in ['', 'CREATED', 'PAID', 'REFUNDED', 'CLOSED']"
            :key="s"
            type="button"
            class="h-8 px-3 rounded-full border text-xs pressable"
            :class="statusFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
            @click="statusFilter = s; load()"
          >
            {{ s === '' ? '全部' : statusMap[s] }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="mt-4 space-y-3">
        <div v-for="i in 4" :key="i" class="h-16 rounded-[10px] bg-hairline/60 animate-pulse"></div>
      </div>
      <div v-else-if="rows.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
        <div v-for="item in rows" :key="item.id" class="py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-medium">{{ item.user.nickname }}（{{ item.user.phone }}）</p>
              <p class="mt-0.5 text-sm text-ink-soft">{{ item.orderNo }} · {{ typeMap[item.type] ?? item.type }}</p>
              <p class="catalog-tab mt-1">
                {{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
              </p>
            </div>
            <div class="text-right shrink-0">
              <p class="font-semibold">¥{{ money(item.amountInCents) }}</p>
              <span class="mt-1 inline-block text-xs px-2.5 py-1 rounded-full"
                :class="
                  item.status === 'PAID'
                    ? 'bg-pine-soft text-pine-deep'
                    : item.status === 'CREATED'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-paper text-ink-faint border border-hairline'
                "
              >
                {{ statusMap[item.status] }}
              </span>
              <button
                v-if="item.status === 'PAID'"
                type="button"
                class="mt-2 block ml-auto h-8 px-3 rounded-full border border-red-200 text-red-800 text-xs pressable"
                @click="refundTarget = item"
              >
                退款
              </button>
            </div>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-4" title="没有符合条件的订单" />
    </section>

    <section class="card p-6">
      <div class="flex items-center gap-2">
        <Wallet :size="18" weight="duotone" class="text-pine" />
        <p class="font-semibold">余额发放</p>
      </div>
      <p class="mt-1 text-sm text-ink-soft">给指定用户发放余额（用于测试充值或补偿）。</p>
      <div class="mt-4 flex flex-wrap gap-3">
        <input
          v-model.number="grantUserId"
          type="number"
          min="1"
          class="h-11 w-36 rounded-[10px] border border-hairline bg-card px-4 text-sm outline-none focus:border-pine"
          placeholder="用户 ID"
        />
        <input
          v-model.number="grantAmount"
          type="number"
          min="1"
          class="h-11 w-36 rounded-[10px] border border-hairline bg-card px-4 text-sm outline-none focus:border-pine"
          placeholder="金额（分）"
        />
        <button
          type="button"
          class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable disabled:opacity-50"
          :disabled="granting || !grantUserId || grantAmount <= 0"
          @click="grant"
        >
          {{ granting ? '发放中…' : '发放' }}
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="!!refundTarget"
      title="确认退款"
      :message="`确认将订单「${refundTarget?.orderNo ?? ''}」全额退款到用户余额？`"
      confirm-text="确认退款"
      danger
      @confirm="doRefund"
      @cancel="refundTarget = null"
    />
  </div>
</template>
