<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowLeft as ArrowLeft,
  PhCheck as Check,
  PhLightning as Bolt,
  PhWallet as Wallet,
} from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { Appointment, CoachDetail, CoachSlot, WalletInfo } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'

const route = useRoute()
const router = useRouter()
const coachId = Number(route.params.id)
const presetSlotId = route.query.slotId ? Number(route.query.slotId) : null

const coach = ref<CoachDetail | null>(null)
const slots = ref<CoachSlot[]>([])
const serviceId = ref<number | null>(route.query.serviceId ? Number(route.query.serviceId) : null)
const slotId = ref<number | null>(presetSlotId)
const needDesc = ref('')
const contact = ref('')
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const success = ref<Appointment | null>(null)
const paying = ref(false)
const payError = ref('')
const paid = ref(false)
const wallet = ref<WalletInfo | null>(null)
const remainSec = ref(0)
let timer: number | undefined

const selectedService = computed(() => coach.value?.services.find((s) => s.id === serviceId.value) ?? null)

onMounted(async () => {
  try {
    const [detail, slotData] = await Promise.all([
      get<CoachDetail>(`/coaches/${coachId}`),
      get<{ items: CoachSlot[] }>(`/coaches/${coachId}/slots`),
    ])
    coach.value = detail
    slots.value = slotData.items
    if (!serviceId.value && detail.services.length) serviceId.value = detail.services[0].id
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

async function submit() {
  if (!serviceId.value || !slotId.value || !needDesc.value.trim()) return
  submitting.value = true
  error.value = ''
  try {
    success.value = await post<Appointment>('/appointments', {
      coachId,
      serviceId: serviceId.value,
      slotId: slotId.value,
      needDesc: needDesc.value.trim(),
    })
    void loadWallet()
    startCountdown(success.value.payExpireAt)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '预约提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

async function loadWallet() {
  try {
    wallet.value = await get<WalletInfo>('/wallet')
  } catch {
    wallet.value = null
  }
}

function startCountdown(expireAt: string | null) {
  stopCountdown()
  if (!expireAt) return
  const deadline = new Date(expireAt).getTime()
  const tick = () => {
    remainSec.value = Math.max(0, Math.round((deadline - Date.now()) / 1000))
    if (remainSec.value <= 0) stopCountdown()
  }
  tick()
  timer = window.setInterval(tick, 1000)
}

function stopCountdown() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

async function pay(method: 'BALANCE' | 'MOCK') {
  if (!success.value?.orderNo || paying.value || remainSec.value <= 0) return
  paying.value = true
  payError.value = ''
  try {
    await post(`/orders/${success.value.orderNo}/pay`, { method })
    paid.value = true
    stopCountdown()
  } catch (e) {
    payError.value = e instanceof Error ? e.message : '支付失败，请重试'
    if (payError.value.includes('超时')) {
      stopCountdown()
      remainSec.value = 0
    }
  } finally {
    paying.value = false
  }
}

const payExpireText = computed(() => {
  const s = Math.max(0, remainSec.value)
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
})

function priceText(cents: number): string {
  return cents % 100 === 0 ? `¥${cents / 100}` : `¥${(cents / 100).toFixed(2)}`
}

onUnmounted(stopCountdown)
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink :to="`/coaches/${coachId}`" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回教练档案
    </RouterLink>

    <div v-if="loading" class="mt-8 h-96 rounded-[14px] bg-hairline/60 animate-pulse"></div>

    <ErrorBanner v-else-if="error && !success" :message="error" class="mt-8" />

    <section v-else-if="success" class="card mt-8 p-8 md:p-10 text-center">
      <template v-if="paid">
        <span class="w-14 h-14 rounded-full bg-pine-soft text-pine flex items-center justify-center mx-auto">
          <Check :size="28" weight="bold" />
        </span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight">支付成功</h1>
        <p class="mt-3 text-[15px] text-ink-soft leading-relaxed">
          预约单号 {{ success.appointmentNo }} 已完成支付，等待教练确认。
        </p>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            @click="router.push('/my')"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium pressable"
          >
            查看我的预约
          </button>
        </div>
      </template>

      <template v-else>
        <span class="w-14 h-14 rounded-full bg-pine-soft text-pine flex items-center justify-center mx-auto">
          <Wallet :size="28" weight="duotone" />
        </span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight">确认支付</h1>
        <p class="mt-2 text-sm text-ink-soft">预约单号 {{ success.appointmentNo }}</p>
        <p class="mt-1 text-2xl font-semibold tracking-tight text-pine">
          {{ priceText(success.amountInCents ?? 0) }}
        </p>
        <p class="mt-2 text-sm text-ink-soft">支付成功后教练即可确认预约</p>

        <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-pine text-card font-medium pressable disabled:opacity-50"
            :disabled="
              paying ||
              remainSec <= 0 ||
              (wallet !== null && (wallet.balanceInCents < (success.amountInCents ?? 0)))
            "
            @click="pay('BALANCE')"
          >
            <Wallet :size="18" weight="duotone" />
            余额支付{{ wallet ? `（¥${(wallet.balanceInCents / 100).toFixed(2)}）` : '' }}
          </button>
          <RouterLink
            v-if="wallet && wallet.balanceInCents < (success.amountInCents ?? 0)"
            to="/wallet"
            class="inline-flex items-center justify-center h-12 px-6 rounded-full border border-hairline bg-card text-ink-soft text-sm pressable"
          >
            去充值
          </RouterLink>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full border border-hairline bg-card text-ink pressable disabled:opacity-50"
            :disabled="paying || remainSec <= 0"
            @click="pay('MOCK')"
          >
            <Bolt :size="18" weight="duotone" />
            模拟支付（演示）
          </button>
        </div>

        <p
          v-if="payError"
          class="mt-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3"
        >
          {{ payError }}
        </p>

        <p class="mt-5 text-sm" :class="remainSec <= 0 ? 'text-red-800 font-medium' : 'text-ink-soft'">
          <template v-if="remainSec <= 0">支付超时，时段已释放，请重新预约</template>
          <template v-else>
            请在 <span class="font-semibold text-ink tabular-nums">{{ payExpireText }}</span> 内完成支付，超时时段自动释放
          </template>
        </p>
        <div class="mt-6">
          <RouterLink to="/my" class="text-sm text-ink-soft hover:text-ink">稍后支付，去我的预约</RouterLink>
        </div>
      </template>
    </section>

    <form v-else class="mt-8 space-y-6" @submit.prevent="submit">
      <section class="card p-6">
        <p class="catalog-tab">预约信息</p>
        <p class="mt-2 font-medium">{{ coach?.nickname }}</p>
        <div class="mt-4 space-y-2">
          <label v-for="service in coach?.services ?? []" :key="service.id" class="flex items-center gap-3">
            <input
              type="radio"
              :checked="serviceId === service.id"
              class="accent-[#1f6b52] w-4 h-4"
              @change="serviceId = service.id"
            />
            <span class="text-sm flex-1">{{ service.name }}</span>
            <span class="text-sm font-medium text-pine">{{ priceText(service.priceInCents) }}</span>
          </label>
        </div>
      </section>

      <section class="card p-6">
        <p class="catalog-tab">选择时段</p>
        <div class="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button
            v-for="slot in slots"
            :key="slot.id"
            type="button"
            class="rounded-[10px] border px-3 py-2.5 text-center text-sm pressable"
            :class="slotId === slot.id ? 'border-pine bg-pine-soft text-pine-deep font-medium' : 'border-hairline bg-card text-ink-soft'"
            @click="slotId = slot.id"
          >
            {{ slot.date.slice(5) }} {{ slot.startTime }}
          </button>
        </div>
        <p v-if="!slots.length" class="mt-4 text-sm text-ink-soft">教练暂时没有可预约时段。</p>
      </section>

      <section class="card p-6">
        <p class="catalog-tab">预约需求</p>
        <div class="mt-4 space-y-5">
          <FieldInput v-model="contact" label="联系方式（用于教练联系你）" placeholder="手机号或微信号" />
          <label class="block">
            <span class="text-sm font-medium text-ink">你希望通过这次对话收获什么？</span>
            <textarea
              v-model="needDesc"
              rows="4"
              class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-pine resize-y"
              placeholder="写下你的期待，帮助教练提前准备…"
            ></textarea>
          </label>
        </div>
      </section>

      <ErrorBanner v-if="error" :message="error" />

      <button
        type="submit"
        :disabled="submitting || !serviceId || !slotId || !needDesc.trim() || !contact.trim()"
        class="w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-50 pressable"
      >
        {{ submitting ? '提交中…' : '提交预约申请' }}
      </button>
      <p class="text-xs text-ink-faint leading-relaxed">
        提交后教练会尽快确认。MVP 阶段不涉及在线支付，具体付款方式由教练与你沟通。
      </p>
    </form>
  </div>
</template>
