<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhWallet as Wallet, PhArrowLeft as ArrowLeft, PhPlus as Plus } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { WalletInfo, WalletTransactionItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const wallet = ref<WalletInfo | null>(null)
const items = ref<WalletTransactionItem[]>([])
const loading = ref(true)
const topping = ref(false)
const error = ref('')
const topupAmount = ref(9900)
const presetAmounts = [5000, 9900, 19900, 49900]

const bizLabel: Record<string, string> = {
  TOPUP: '充值',
  APPOINTMENT_PAY: '预约支付',
  REFUND: '退款',
  ADMIN_GRANT: '平台发放',
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [w, txs] = await Promise.all([
      get<WalletInfo>('/wallet'),
      get<{ items: WalletTransactionItem[] }>('/wallet/transactions?page=1&pageSize=50'),
    ])
    wallet.value = w
    items.value = txs.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function topup() {
  if (topping.value || topupAmount.value < 100) return
  topping.value = true
  error.value = ''
  try {
    const data = await post<{ balanceInCents: number }>('/wallet/topup', {
      amountInCents: topupAmount.value,
    })
    wallet.value = { balanceInCents: data.balanceInCents }
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '充值失败'
  } finally {
    topping.value = false
  }
}

function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

onMounted(load)
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/my" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回我的成长
    </RouterLink>

    <div v-if="loading" class="mt-8 h-72 rounded-[14px] bg-hairline/60 animate-pulse"></div>

    <template v-else>
      <ErrorBanner v-if="error" :message="error" class="mt-8" />

      <section class="card mt-8 p-8 md:p-10">
        <div class="flex items-center gap-3">
          <span class="w-12 h-12 rounded-full bg-pine-soft text-pine flex items-center justify-center">
            <Wallet :size="24" weight="duotone" />
          </span>
          <div>
            <p class="catalog-tab">我的余额</p>
            <p class="mt-1 text-3xl font-semibold tracking-tight">
              ¥{{ money(wallet?.balanceInCents ?? 0) }}
            </p>
          </div>
        </div>
      </section>

      <section class="card mt-6 p-6">
        <p class="catalog-tab">余额充值</p>
        <p class="mt-1 text-sm text-ink-soft">
          阶段一为模拟充值，直接到账；接入真实支付后改为线上支付。
        </p>
        <div class="mt-5 grid grid-cols-4 gap-2">
          <button
            v-for="amount in presetAmounts"
            :key="amount"
            type="button"
            class="h-10 rounded-[10px] border text-sm pressable"
            :class="topupAmount === amount ? 'border-pine bg-pine-soft text-pine-deep font-medium' : 'border-hairline bg-card text-ink-soft'"
            @click="topupAmount = amount"
          >
            ¥{{ money(amount) }}
          </button>
        </div>
        <div class="mt-4 flex gap-3">
          <input
            v-model.number="topupAmount"
            type="number"
            min="100"
            class="flex-1 h-11 rounded-[10px] border border-hairline bg-card px-4 text-sm outline-none focus:border-pine"
            placeholder="自定义金额（分）"
          />
          <button
            type="button"
            class="h-11 px-7 rounded-full bg-pine text-card text-sm font-medium pressable disabled:opacity-50"
            :disabled="topping || topupAmount < 100"
            @click="topup"
          >
            {{ topping ? '充值中…' : '立即充值' }}
          </button>
        </div>
      </section>

      <section class="mt-8">
        <p class="catalog-tab">余额流水</p>
        <div v-if="items.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
          <div v-for="item in items" :key="item.createdAt + item.bizType + item.changeInCents" class="py-4">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="font-medium">{{ bizLabel[item.bizType] ?? item.bizType }}</p>
                <p v-if="item.note" class="mt-0.5 text-sm text-ink-soft truncate">{{ item.note }}</p>
                <p class="catalog-tab mt-1">{{ fmtTime(item.createdAt) }}</p>
              </div>
              <div class="text-right shrink-0">
                <p class="font-medium" :class="item.changeInCents >= 0 ? 'text-pine' : 'text-ink'">
                  {{ item.changeInCents >= 0 ? '+' : '' }}{{ (item.changeInCents / 100).toFixed(2) }}
                </p>
                <p class="catalog-tab mt-0.5">余额 {{ (item.balanceAfter / 100).toFixed(2) }}</p>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else class="mt-4" title="还没有流水" hint="充值、预约支付和退款都会记录在这里。" />
      </section>
    </template>
  </div>
</template>
