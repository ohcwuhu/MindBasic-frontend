<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PhCalendarCheck as CalendarCheck,
  PhCardsThree as CardsThree,
  PhBookmarkSimple as BookmarkSimple,
  PhShareNetwork as ShareNetwork,
  PhCheckCircle as CheckCircle,
  PhTrophy as Trophy,
  PhStar as Star,
  PhSmiley as Smiley,
  PhChartLineUp as ChartLineUp,
  PhArrowRight as ArrowRight,
} from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type {
  Appointment,
  ArticleListItem,
  Badge,
  CheckInItem,
  CheckInStats,
  EmotionJournal,
  LeaderboardItem,
  SelfCoachingRecord,
  WalletInfo,
} from '@/api/types'
import EmptyState from '@/components/EmptyState.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'

type Tab = 'appointments' | 'records' | 'journals' | 'checkins' | 'favorites'
const activeTab = ref<Tab>('appointments')
const appointments = ref<Appointment[]>([])
const records = ref<SelfCoachingRecord[]>([])
const favorites = ref<ArticleListItem[]>([])
const journals = ref<EmotionJournal[]>([])
const loading = ref(true)
const error = ref('')
const cancelTarget = ref<Appointment | null>(null)
const shareMsg = ref('')

// 打卡
const checkins = ref<CheckInItem[]>([])
const checkinStats = ref<CheckInStats | null>(null)
const badges = ref<Badge[]>([])
const leaderboard = ref<LeaderboardItem[]>([])
const leaderboardPeriod = ref('month')
const checkinContent = ref('')
const newBadges = ref<Badge[]>([])

// 评价
const reviewTarget = ref<Appointment | null>(null)
const reviewRating = ref(5)
const reviewContent = ref('')

// 支付
const payTarget = ref<Appointment | null>(null)
const payMethod = ref<'BALANCE' | 'MOCK'>('BALANCE')
const payWallet = ref<WalletInfo | null>(null)
const payingId = ref<number | null>(null)
const payError = ref('')

const statusLabel: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  NO_SHOW: '未赴约',
  RESCHEDULED: '已改期',
}

const paymentLabel: Record<string, string> = {
  CREATED: '待支付',
  PAID: '已支付',
  REFUNDED: '已退款',
  CLOSED: '已关闭',
}

const paymentClass: Record<string, string> = {
  CREATED: 'bg-amber-100 text-amber-900',
  PAID: 'bg-pine-soft text-pine-deep',
  REFUNDED: 'bg-paper text-ink-faint border border-hairline',
  CLOSED: 'bg-paper text-ink-faint border border-hairline',
}

const moodEmoji: Record<string, string> = {
  CALM: '😌',
  HAPPY: '😄',
  ANXIOUS: '😟',
  DOWN: '😢',
  IRRITATED: '😠',
  OTHER: '🙂',
}

const moodLabel: Record<string, string> = {
  CALM: '平静',
  HAPPY: '开心',
  ANXIOUS: '焦虑',
  DOWN: '低落',
  IRRITATED: '烦躁',
  OTHER: '其他',
}

async function load(tab: Tab) {
  loading.value = true
  error.value = ''
  try {
    if (tab === 'appointments') {
      const data = await get<{ items: Appointment[] }>('/appointments/mine?page=1&pageSize=50')
      appointments.value = data.items
    } else if (tab === 'records') {
      const data = await get<{ items: SelfCoachingRecord[] }>('/self-coaching/records?page=1&pageSize=50')
      records.value = data.items
    } else if (tab === 'journals') {
      const data = await get<{ items: EmotionJournal[] }>('/emotion-journals?page=1&pageSize=50')
      journals.value = data.items
    } else {
      const data = await get<{ items: ArticleListItem[] }>('/users/me/favorites?page=1&pageSize=50')
      favorites.value = data.items
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => load(activeTab.value))

async function confirmCancel() {
  if (!cancelTarget.value) return
  const id = cancelTarget.value.id
  cancelTarget.value = null
  try {
    await post(`/appointments/${id}/cancel`)
    await load(activeTab.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取消失败，请重试'
  }
}

async function openPay(item: Appointment) {
  payTarget.value = item
  payMethod.value = 'BALANCE'
  payError.value = ''
  try {
    payWallet.value = await get<WalletInfo>('/wallet')
  } catch {
    payWallet.value = null
  }
}

async function doPay() {
  const item = payTarget.value
  if (!item?.orderNo || payingId.value) return
  payingId.value = item.id
  payError.value = ''
  try {
    await post(`/orders/${item.orderNo}/pay`, { method: payMethod.value })
    payTarget.value = null
    await load(activeTab.value)
  } catch (e) {
    payError.value = e instanceof Error ? e.message : '支付失败，请重试'
  } finally {
    payingId.value = null
  }
}

async function shareRecord(record: SelfCoachingRecord) {
  if (!record.actionCard) return
  const text = `${record.actionCard.title}\n\n${record.actionCard.content}`
  try {
    if (navigator.share) {
      await navigator.share({ title: record.actionCard.title, text })
      return
    }
    await navigator.clipboard.writeText(text)
    shareMsg.value = '已复制到剪贴板'
    setTimeout(() => (shareMsg.value = ''), 3000)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    error.value = '分享失败，请重试'
  }
}

async function loadCheckins() {
  try {
    const month = new Date().toISOString().slice(0, 7)
    const [list, stats, badgeData, board] = await Promise.all([
      get<{ items: CheckInItem[] }>(`/check-ins?month=${month}`),
      get<CheckInStats>('/check-ins/stats'),
      get<{ items: Badge[] }>('/users/me/badges'),
      get<{ items: LeaderboardItem[] }>(`/check-ins/leaderboard?period=${leaderboardPeriod.value}`),
    ])
    checkins.value = list.items
    checkinStats.value = stats
    badges.value = badgeData.items
    leaderboard.value = board.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '打卡数据加载失败'
  }
}

async function doCheckIn() {
  try {
    const data = await post<{ record: CheckInItem; earnedBadges: Badge[] }>('/check-ins', {
      content: checkinContent.value || null,
    })
    newBadges.value = data.earnedBadges
    checkinContent.value = ''
    await loadCheckins()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '打卡失败'
  }
}

async function submitReview() {
  if (!reviewTarget.value) return
  const id = reviewTarget.value.id
  reviewTarget.value = null
  try {
    await post(`/appointments/${id}/review`, {
      rating: reviewRating.value,
      content: reviewContent.value || null,
    })
    reviewRating.value = 5
    reviewContent.value = ''
    error.value = ''
    await load(activeTab.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评价提交失败'
  }
}

function switchTab(tab: Tab) {
  activeTab.value = tab
  if (tab === 'checkins') loadCheckins()
  else load(tab)
}
</script>

<template>
  <div class="max-w-[820px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">ME 我的成长</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">你走过的每一步</h1>
    <RouterLink
      to="/growth-assessment"
      class="mt-6 group block rounded-[14px] bg-pine text-card p-5 md:p-6 pressable transition-transform active:scale-[0.99]"
    >
      <div class="flex items-center gap-4">
        <span class="w-12 h-12 rounded-full bg-card/20 flex items-center justify-center shrink-0">
          <ChartLineUp :size="24" weight="duotone" />
        </span>
        <span class="flex-1 min-w-0">
          <span class="block font-semibold">成长测评</span>
          <span class="block mt-0.5 text-sm text-card/85">约 10 分钟，看见自己的五个成长方向</span>
        </span>
        <span class="shrink-0 inline-flex items-center gap-1 text-sm font-medium">
          开始测评
          <ArrowRight :size="16" weight="bold" class="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </RouterLink>

    <div class="mt-8 flex gap-2" role="tablist" aria-label="成长记录分类">
      <button
        v-for="tab in [
          { key: 'appointments', label: '我的预约', icon: CalendarCheck },
          { key: 'records', label: '自我教练记录', icon: CardsThree },
          { key: 'journals', label: '情绪日记', icon: Smiley },
          { key: 'checkins', label: '成长打卡', icon: CheckCircle },
          { key: 'favorites', label: '我的收藏', icon: BookmarkSimple },
        ] as const"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm transition-colors pressable"
        :class="activeTab === tab.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab(tab.key)"
      >
        <component :is="tab.icon" :size="16" weight="duotone" />
        {{ tab.label }}
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else>
      <section v-if="activeTab === 'appointments'" class="mt-8">
        <div v-if="appointments.length" class="divide-y divide-hairline border-y border-hairline">
          <div v-for="item in appointments" :key="item.id" class="py-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-medium">{{ item.coach.nickname }} · {{ item.service.name }}</p>
                <p class="mt-1 text-sm text-ink-soft">
                  {{ item.slot.date }} {{ item.slot.startTime }}（{{ item.needDesc }}）
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-1.5">
                <span
                  class="text-xs px-2.5 py-1 rounded-full"
                  :class="
                    item.status === 'COMPLETED'
                      ? 'bg-pine-soft text-pine-deep'
                      : item.status === 'CANCELLED'
                        ? 'bg-paper text-ink-faint border border-hairline'
                        : item.status === 'NO_SHOW'
                          ? 'bg-red-100 text-red-700'
                          : item.status === 'RESCHEDULED'
                            ? 'bg-paper text-ink-faint border border-hairline'
                        : item.status === 'CONFIRMED'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-amber-100 text-amber-900'
                  "
                >
                  {{ statusLabel[item.status] }}
                </span>
                <span
                  v-if="item.paymentStatus !== 'NONE'"
                  class="text-xs px-2.5 py-1 rounded-full"
                  :class="paymentClass[item.paymentStatus]"
                >
                  {{ paymentLabel[item.paymentStatus] }}
                </span>
              </div>
            </div>
            <div v-if="item.paymentStatus === 'CREATED'" class="mt-3">
              <button
                type="button"
                class="h-9 px-4 rounded-full bg-pine text-card text-sm pressable"
                @click="openPay(item)"
              >
                去支付
              </button>
            </div>
            <div v-if="item.canCancel" class="mt-3">
              <button
                type="button"
                class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                @click="cancelTarget = item"
              >
                取消预约
              </button>
            </div>
            <div v-if="item.status === 'COMPLETED'" class="mt-3">
              <button
                v-if="!item.reviewed"
                type="button"
                class="h-9 px-4 rounded-full bg-pine-soft text-pine-deep text-sm pressable"
                @click="reviewTarget = item"
              >
                评价这次服务
              </button>
              <span
                v-else
                class="inline-flex items-center h-9 px-4 rounded-full bg-paper border border-hairline text-ink-faint text-sm"
              >
                已评价
              </span>
            </div>
            <p v-if="item.cancelReason" class="mt-2 text-sm text-ink-soft">取消原因：{{ item.cancelReason }}</p>
          </div>
        </div>
        <div v-else class="py-16 text-center">
          <p class="font-medium text-ink">还没有预约</p>
          <p class="mt-2 text-sm text-ink-soft">
            去 <RouterLink to="/coaches" class="text-pine font-medium hover:underline">找教练</RouterLink> 看看吧。
          </p>
        </div>
      </section>

      <section v-else-if="activeTab === 'records'" class="mt-8">
        <div v-if="records.length" class="divide-y divide-hairline border-y border-hairline">
          <RouterLink :to="`/self-coaching/records/${record.id}`" v-for="record in records" :key="record.id" class="py-5 block group">
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium group-hover:text-pine transition-colors">模板 #{{ record.templateId }}</p>
              <div class="flex items-center gap-2">
                <button
                  v-if="record.actionCard"
                  type="button"
                  class="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-hairline bg-card text-xs text-ink-soft pressable"
                  :aria-label="`分享记录 ${record.id}`"
                  @click.prevent="shareRecord(record)"
                >
                  <ShareNetwork :size="14" /> 分享
                </button>
                <span
                  class="text-xs px-2.5 py-1 rounded-full"
                  :class="record.status === 'COMPLETED' ? 'bg-pine-soft text-pine-deep' : 'bg-paper text-ink-faint border border-hairline'"
                >
                  {{ record.status === 'COMPLETED' ? '已生成行动卡' : '草稿' }}
                </span>
              </div>
            </div>
            <p v-if="shareMsg" class="mt-2 text-sm text-pine-deep">{{ shareMsg }}</p>
            <p class="mt-2 text-sm text-ink-soft">
              {{ new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
            <pre
              v-if="record.actionCard"
              class="mt-3 text-sm leading-relaxed whitespace-pre-wrap font-sans text-ink-soft bg-paper rounded-[10px] p-4 border border-hairline"
            >{{ record.actionCard.content }}</pre>
          </RouterLink>
        </div>
        <EmptyState v-else title="还没有自我教练记录" hint="从一张行动卡开始。" />
      </section>

      <section v-else-if="activeTab === 'checkins'" class="mt-8">
        <div class="card p-6">
          <div class="grid grid-cols-3 gap-3 text-center">
            <div>
              <p class="text-2xl font-semibold text-pine">{{ checkinStats?.streakDays ?? 0 }}</p>
              <p class="catalog-tab mt-1">连续天数</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-pine">{{ checkinStats?.monthCount ?? 0 }}</p>
              <p class="catalog-tab mt-1">本月打卡</p>
            </div>
            <div>
              <p class="text-2xl font-semibold text-pine">{{ checkinStats?.totalCount ?? 0 }}</p>
              <p class="catalog-tab mt-1">累计打卡</p>
            </div>
          </div>
          <form class="mt-5 flex gap-2" @submit.prevent="doCheckIn">
            <input
              v-model="checkinContent"
              class="h-11 flex-1 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine"
              placeholder="写下今天的小行动（可选）"
            />
            <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable">打卡</button>
          </form>
          <div v-if="newBadges.length" class="mt-4">
            <p class="text-sm text-pine-deep font-medium">获得新勋章</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span v-for="badge in newBadges" :key="badge.id" class="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-pine-soft text-pine-deep text-sm">
                <Trophy :size="15" weight="fill" /> {{ badge.name }}
              </span>
            </div>
          </div>
        </div>

        <div class="mt-6">
          <div class="flex items-center gap-2">
            <Trophy :size="18" weight="duotone" class="text-pine" />
            <h2 class="text-lg font-semibold tracking-tight">我的勋章</h2>
          </div>
          <div v-if="badges.length" class="mt-3 flex flex-wrap gap-2">
            <span v-for="badge in badges" :key="badge.id" class="px-3 py-2 rounded-full border border-hairline bg-card text-sm" :title="badge.description">
              <Trophy :size="15" weight="fill" class="inline text-pine mr-1" />{{ badge.name }}
            </span>
          </div>
          <p v-else class="mt-3 text-sm text-ink-soft">还没有勋章，先完成一次打卡吧。</p>
        </div>

        <div class="mt-8">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <Trophy :size="18" weight="duotone" class="text-pine" />
              <h2 class="text-lg font-semibold tracking-tight">打卡排行榜</h2>
            </div>
            <div class="flex gap-1">
              <button
                v-for="p in ['week', 'month']"
                :key="p"
                type="button"
                class="h-8 px-3 rounded-full border text-xs pressable"
                :class="leaderboardPeriod === p ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
                @click="leaderboardPeriod = p; loadCheckins()"
              >
                {{ p === 'week' ? '本周' : '本月' }}
              </button>
            </div>
          </div>
          <div v-if="leaderboard.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
            <div v-for="item in leaderboard" :key="item.rank" class="py-3 flex items-center gap-3">
              <span class="w-7 text-center font-mono text-sm" :class="item.rank <= 3 ? 'text-pine font-semibold' : 'text-ink-faint'">{{ item.rank }}</span>
              <span class="flex-1 text-sm font-medium">{{ item.nickname }}</span>
              <span class="text-sm text-ink-soft">{{ item.count }} 天</span>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-ink-soft">本期还没有人打卡。</p>
        </div>
      </section>

      <section v-else-if="activeTab === 'journals'" class="mt-8">
        <div v-if="journals.length" class="divide-y divide-hairline border-y border-hairline">
          <div v-for="journal in journals" :key="journal.id" class="py-4 flex gap-4">
            <span class="mt-1 text-xl leading-none shrink-0" aria-hidden="true">
              {{ moodEmoji[journal.moodType] }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-[15px] leading-relaxed">{{ journal.content }}</p>
              <p v-if="journal.feedback" class="mt-2 text-sm text-ink-soft leading-relaxed">
                {{ journal.feedback }}
              </p>
              <p class="catalog-tab mt-2">
                {{ moodLabel[journal.moodType] }} ·
                {{ new Date(journal.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
              </p>
            </div>
          </div>
        </div>
        <EmptyState v-else title="还没有情绪日记" hint="在情绪日记里写下第一条感受。" />
      </section>

      <section v-else class="mt-8">
        <div v-if="favorites.length" class="divide-y divide-hairline border-y border-hairline">
          <RouterLink
            v-for="article in favorites"
            :key="article.id"
            :to="`/articles/${article.id}`"
            class="group py-4 block"
          >
            <p class="font-medium group-hover:text-pine transition-colors">{{ article.title }}</p>
            <p v-if="article.summary" class="mt-1 text-sm text-ink-soft line-clamp-1">{{ article.summary }}</p>
          </RouterLink>
        </div>
        <EmptyState v-else title="还没有收藏" hint="在科普中心收藏感兴趣的文章。" />
      </section>
    </template>

    <Teleport to="body">
      <div
        v-if="payTarget"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="确认支付"
      >
        <div class="absolute inset-0 bg-ink/40" @click="payTarget = null"></div>
        <div class="relative w-full max-w-[380px] bg-card rounded-[14px] border border-hairline p-6">
          <h2 class="text-lg font-semibold tracking-tight">确认支付</h2>
          <p class="mt-1 text-sm text-ink-soft">
            {{ payTarget.coach.nickname }} · {{ payTarget.service.name }}
          </p>
          <p class="mt-2 text-2xl font-semibold tracking-tight text-pine">
            ¥{{ ((payTarget.amountInCents ?? 0) / 100).toFixed(2) }}
          </p>
          <p class="mt-1 text-sm text-ink-soft">支付成功后教练即可确认预约</p>

          <div class="mt-4 space-y-2">
            <button
              type="button"
              class="w-full h-11 px-4 rounded-[10px] border text-sm text-left pressable"
              :class="payMethod === 'BALANCE' ? 'border-pine bg-pine-soft text-pine-deep font-medium' : 'border-hairline bg-card text-ink-soft'"
              @click="payMethod = 'BALANCE'"
            >
              <span class="inline-flex items-center gap-2">
                <Wallet :size="17" weight="duotone" />
                余额支付{{ payWallet ? `（¥${(payWallet.balanceInCents / 100).toFixed(2)}）` : '' }}
              </span>
            </button>
            <button
              type="button"
              class="w-full h-11 px-4 rounded-[10px] border text-sm text-left pressable"
              :class="payMethod === 'MOCK' ? 'border-pine bg-pine-soft text-pine-deep font-medium' : 'border-hairline bg-card text-ink-soft'"
              @click="payMethod = 'MOCK'"
            >
              模拟支付（演示）
            </button>
          </div>

          <RouterLink
            v-if="payMethod === 'BALANCE' && payWallet && payWallet.balanceInCents < (payTarget.amountInCents ?? 0)"
            to="/wallet"
            class="mt-3 inline-block text-sm text-pine hover:underline"
            @click="payTarget = null"
          >
            余额不足，去充值
          </RouterLink>

          <p v-if="payError" class="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
            {{ payError }}
          </p>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
              @click="payTarget = null"
            >
              取消
            </button>
            <button
              type="button"
              class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium pressable disabled:opacity-50"
              :disabled="
                payingId !== null ||
                (payMethod === 'BALANCE' &&
                  payWallet !== null &&
                  payWallet.balanceInCents < (payTarget.amountInCents ?? 0))
              "
              @click="doPay"
            >
              {{ payingId === payTarget.id ? '支付中…' : '确认支付' }}
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="reviewTarget"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="评价这次服务"
      >
        <div class="absolute inset-0 bg-ink/40" @click="reviewTarget = null"></div>
        <div class="relative w-full max-w-[380px] bg-card rounded-[14px] border border-hairline p-6">
          <h2 class="text-lg font-semibold tracking-tight">评价这次服务</h2>
          <p class="mt-1 text-sm text-ink-soft">
            {{ reviewTarget.coach.nickname }} · {{ reviewTarget.service.name }}
          </p>
          <div class="mt-4 flex gap-1">
            <button
              v-for="n in 5"
              :key="n"
              type="button"
              class="pressable"
              :aria-label="`${n} 星`"
              @click="reviewRating = n"
            >
              <Star :size="28" weight="fill" :class="n <= reviewRating ? 'text-pine' : 'text-hairline'" />
            </button>
          </div>
          <textarea
            v-model="reviewContent"
            rows="3"
            class="mt-4 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-sm outline-none focus:border-pine resize-none"
            placeholder="写几句真实感受（可选）"
          ></textarea>
          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
              @click="reviewTarget = null"
            >
              取消
            </button>
            <button
              type="button"
              class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium pressable"
              @click="submitReview"
            >
              提交评价
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog
      :open="!!cancelTarget"
      title="取消预约"
      :message="`确认取消与「${cancelTarget?.coach.nickname ?? ''}」的预约？取消后时段将释放。`"
      confirm-text="取消预约"
      danger
      @confirm="confirmCancel"
      @cancel="cancelTarget = null"
    />
  </div>
</template>
