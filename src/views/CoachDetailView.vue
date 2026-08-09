<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { PhArrowRight as ArrowRight } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { CoachDetail, CoachSlot, ReviewItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { PhStar as Star } from '@phosphor-icons/vue'

const route = useRoute()
const coachId = Number(route.params.id)
const coach = ref<CoachDetail | null>(null)
const slots = ref<CoachSlot[]>([])
const reviews = ref<ReviewItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const [detail, slotData, reviewData] = await Promise.all([
      get<CoachDetail>(`/coaches/${coachId}`),
      get<{ items: CoachSlot[] }>(`/coaches/${coachId}/slots`),
      get<{ items: ReviewItem[] }>(`/coaches/${coachId}/reviews?page=1&pageSize=20`),
    ])
    coach.value = detail
    slots.value = slotData.items
    reviews.value = reviewData.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '教练信息加载失败'
  } finally {
    loading.value = false
  }
})

function priceText(cents: number): string {
  return cents % 100 === 0 ? `¥${cents / 100}` : `¥${(cents / 100).toFixed(2)}`
}
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <ErrorBanner v-if="error" :message="error" />

    <div v-if="loading" class="space-y-6">
      <div class="h-40 rounded-[14px] bg-hairline/60 animate-pulse"></div>
      <div class="h-64 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else-if="coach">
      <section class="flex flex-col md:flex-row md:items-start gap-6">
        <span
          class="w-20 h-20 rounded-full bg-pine-soft text-pine flex items-center justify-center text-2xl font-semibold shrink-0"
        >
          {{ coach.nickname.slice(0, 1) }}
        </span>
        <div class="flex-1">
          <p class="catalog-tab">CO-{{ String(coach.id).padStart(2, '0') }} 教练档案</p>
          <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ coach.nickname }}</h1>
          <p class="mt-1 text-sm text-ink-faint">{{ coach.yearsOfExperience }} 年从业经验</p>
          <div v-if="coach.tagNames.length" class="mt-4 flex flex-wrap gap-1.5">
            <span
              v-for="tag in coach.tagNames"
              :key="tag"
              class="text-xs px-2.5 py-1 rounded-full bg-paper border border-hairline text-ink-soft"
            >
              {{ tag }}
            </span>
          </div>
          <p class="mt-4 text-sm">
            <span class="text-pine font-semibold text-lg">{{ coach.rating.toFixed(1) }}</span>
            <span class="text-ink-faint"> 分 · {{ coach.reviewCount }} 条评价</span>
          </p>
        </div>
      </section>

      <section v-if="coach.serviceConcept || coach.bio" class="card mt-8 p-6 md:p-8">
        <p class="catalog-tab">服务理念</p>
        <p class="mt-3 text-[15px] leading-relaxed">{{ coach.serviceConcept }}</p>
        <p v-if="coach.bio" class="mt-4 text-[15px] leading-relaxed text-ink-soft">{{ coach.bio }}</p>
      </section>

      <section class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">服务项目</h2>
        <div class="mt-4 divide-y divide-hairline border-y border-hairline">
          <div v-for="service in coach.services" :key="service.id" class="py-4 flex items-center justify-between gap-6">
            <div>
              <p class="font-medium">{{ service.name }}</p>
              <p class="mt-1 text-sm text-ink-soft">
                {{ service.serviceType === 'SINGLE' ? '单次' : '套餐' }} · {{ service.durationMin }} 分钟
              </p>
            </div>
            <p class="font-semibold text-pine">{{ priceText(service.priceInCents) }}</p>
          </div>
        </div>
      </section>

      <section class="mt-8">
        <div class="flex items-baseline justify-between">
          <h2 class="text-lg font-semibold tracking-tight">可预约时段</h2>
          <p class="text-sm text-ink-faint">未来 14 天</p>
        </div>
        <div v-if="slots.length" class="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <RouterLink
            v-for="slot in slots"
            :key="slot.id"
            :to="`/coaches/${coach.id}/book?slotId=${slot.id}&serviceId=${coach.services[0]?.id ?? ''}`"
            class="card px-4 py-3 text-center pressable hover:border-pine"
          >
            <p class="text-sm font-medium">{{ slot.date.slice(5) }}</p>
            <p class="mt-1 text-sm text-pine">{{ slot.startTime }}</p>
          </RouterLink>
        </div>
        <div v-else class="mt-4 card p-8 text-center text-sm text-ink-soft">
          教练暂时没有开放的时段，请稍后再来看看。
        </div>
      </section>

      <section v-if="reviews.length" class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">用户评价</h2>
        <div class="mt-4 divide-y divide-hairline border-y border-hairline">
          <div v-for="review in reviews" :key="review.id" class="py-4">
            <div class="flex items-center gap-2">
              <span class="font-medium text-sm">{{ review.nickname }}</span>
              <span class="flex gap-0.5">
                <Star
                  v-for="n in 5"
                  :key="n"
                  :size="14"
                  weight="fill"
                  :class="n <= review.rating ? 'text-pine' : 'text-hairline'"
                />
              </span>
            </div>
            <p v-if="review.content" class="mt-2 text-sm text-ink-soft leading-relaxed">{{ review.content }}</p>
            <p class="catalog-tab mt-2">{{ new Date(review.createdAt).toLocaleDateString('zh-CN') }}</p>
          </div>
        </div>
      </section>

      <div class="mt-10">
        <RouterLink
          v-if="coach.services.length && slots.length"
          :to="`/coaches/${coach.id}/book?serviceId=${coach.services[0].id}`"
          class="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-pine text-card font-medium hover:bg-pine-deep pressable"
        >
          预约咨询 <ArrowRight :size="18" weight="bold" />
        </RouterLink>
      </div>
    </template>
  </div>
</template>
