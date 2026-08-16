<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PhArrowRight as ArrowRight,
  PhSparkle as Sparkle,
} from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { HomeOut } from '@/api/types'
import Reveal from '@/components/Reveal.vue'
import QuoteBlock from '@/components/QuoteBlock.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const data = ref<HomeOut | null>(null)
const loading = ref(true)
const error = ref('')

const entries = [
  { key: 'ai_chat', title: 'AI 对话', desc: '随时倾诉，AI 教练全天候陪伴你', to: '/ai-chat' },
  { key: 'emotion_journal', title: '情绪日记', desc: '写一句话，收到一句资源导向的回应', to: '/emotion-journal' },
  { key: 'video_call', title: '视频通话', desc: '面对面交流，像打电话一样聊聊状态', to: '/video-call' },
  { key: 'science', title: '科普中心', desc: '成长技巧、教练故事、常见困惑', to: '/articles' },
]

onMounted(async () => {
  try {
    data.value = await get<HomeOut>('/home')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '首页加载失败'
  } finally {
    loading.value = false
  }
})

function priceText(cents: number): string {
  return `¥${(cents / 100).toFixed(0)}`
}

// 今日一句：手写感引语做情感落点，按日期轮换，文案均为原创安抚语句（非产品原文）
const dailyQuotes = [
  '慢慢来，你已经做得很好了。',
  '今天，也辛苦你了。',
  '把不安写下来，它就没那么重了。',
  '你不需要立刻变好，只走最小的一步。',
  '深呼吸一次，此刻你在这里，就很好。',
  '允许自己停下来，也是一种成长。',
  '被看见，本身就是一种治愈。',
]
const todayQuote = dailyQuotes[new Date().getDate() % dailyQuotes.length]
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <section class="relative grid md:grid-cols-[1.1fr_0.9fr] gap-10 md:gap-14 pt-0 pb-16 md:pb-28 items-center">
      <div class="breath-orb w-[18rem] h-[18rem] right-4 top-16 opacity-60" aria-hidden="true"></div>
      <div class="breath-orb lilac w-40 h-40 right-20 bottom-16 opacity-45" aria-hidden="true"></div>
      <svg class="ripple-mark absolute right-6 top-24 w-56 h-56" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <circle cx="100" cy="100" r="42" stroke="currentColor" stroke-width="1.2" />
        <circle cx="100" cy="100" r="66" stroke="currentColor" stroke-width="1" opacity="0.7" />
        <circle cx="100" cy="100" r="90" stroke="currentColor" stroke-width="0.9" opacity="0.5" />
      </svg>
      <Reveal class="relative z-10">
        <QuoteBlock label="今日一句" :text="todayQuote" tone="gold" class="mb-6" />
        <h1 class="text-[2.5rem] md:text-[3.4rem] leading-[1.08] font-semibold tracking-[-0.02em] max-w-[14ch]">
          成长不是被定义，而是被看见、被陪伴
        </h1>
        <p class="mt-5 text-[15px] md:text-base text-ink-soft leading-relaxed max-w-[46ch]">
          从一次对话开始。先用 AI 教练安顿此刻，再按需开启视频通话深度交流。
        </p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <RouterLink
            to="/ai-chat"
            class="hero-cta-primary inline-flex items-center gap-2 h-12 px-7 rounded-full font-semibold hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 pressable shadow-cta"
          >
            开始 AI 对话
            <ArrowRight :size="17" weight="bold" />
          </RouterLink>
          <RouterLink
            to="/video-call"
            class="hero-cta-secondary inline-flex items-center gap-2 h-12 px-7 rounded-full font-medium hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 pressable"
          >
            <span class="w-5 h-5 rounded-full bg-pine/15 flex items-center justify-center">
              <PhSparkle :size="13" weight="fill" class="text-pine" />
            </span>
            找教练 · 视频通话
          </RouterLink>
        </div>
      </Reveal>

      <Reveal class="relative z-10">
        <div class="relative" aria-hidden="true">
          <div class="card gold-edge p-6 rotate-[-2deg]">
            <p class="mt-3 font-medium">今日行动卡</p>
            <p class="mt-2 text-sm text-ink-soft leading-relaxed">
              睡前做一次深呼吸练习，并把"我已经准备好"写在便签上。
            </p>
            <span class="mt-4 inline-flex items-center gap-1.5 text-pine text-sm font-medium">
              <Sparkle :size="16" weight="fill" /> 已盖章 · 完成
            </span>
          </div>
          <div class="card p-6 rotate-[1.5deg] mt-4 ml-8 md:ml-14">
            <QuoteBlock
              text="你愿意把这份不安写下来，本身就很有勇气。"
              tone="clay"
              size="sm"
              class="mt-1"
            />
          </div>
        </div>
      </Reveal>
    </section>

    <ErrorBanner v-if="error" :message="error" class="mb-8" />

    <section v-if="loading" aria-label="加载中" class="grid grid-cols-2 md:grid-cols-4 gap-4 pb-16">
      <div v-for="i in 4" :key="i" class="h-40 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </section>

    <section v-else-if="data" class="pb-16">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <RouterLink
          v-for="entry in entries"
          :key="entry.key"
          :to="entry.to"
          class="card p-5 md:p-6 pressable group flex flex-col"
        >
          <p class="font-medium">{{ entry.title }}</p>
          <p class="mt-1 text-sm text-ink-soft leading-relaxed flex-1">{{ entry.desc }}</p>
          <span
            class="mt-3 inline-flex items-center gap-1 text-sm text-pine group-hover:gap-2 transition-all"
          >
            打开 <ArrowRight :size="15" weight="bold" />
          </span>
        </RouterLink>
      </div>
    </section>

    <section v-if="data && data.featuredArticles.length" class="pb-16">
      <div class="flex items-baseline justify-between mb-6">
        <h2 class="text-xl font-semibold tracking-tight">最近的文章</h2>
        <RouterLink to="/articles" class="text-sm text-pine hover:underline">全部文章</RouterLink>
      </div>
      <div class="divide-y divide-hairline border-y border-hairline">
        <RouterLink
          v-for="article in data.featuredArticles"
          :key="article.id"
          :to="`/articles/${article.id}`"
          class="py-4 flex items-start justify-between gap-6 group"
        >
          <div>
            <p class="font-medium group-hover:text-pine transition-colors">{{ article.title }}</p>
            <p v-if="article.summary" class="mt-1 text-sm text-ink-soft line-clamp-1">{{ article.summary }}</p>
          </div>
          <ArrowRight :size="18" class="text-ink-faint mt-1 shrink-0 group-hover:text-pine" />
        </RouterLink>
      </div>
    </section>

    <section v-if="data && data.recommendedCoaches.length" class="pb-20">
      <div class="flex items-baseline justify-between mb-6">
        <h2 class="text-xl font-semibold tracking-tight">推荐教练</h2>
        <RouterLink to="/coaches" class="text-sm text-pine hover:underline">全部教练</RouterLink>
      </div>
      <div class="grid md:grid-cols-3 gap-4">
        <RouterLink
          v-for="coach in data.recommendedCoaches"
          :key="coach.id"
          :to="`/coaches/${coach.id}`"
          class="card p-5 pressable"
        >
          <div class="flex items-center gap-3">
            <span
              class="w-11 h-11 rounded-full bg-pine-soft text-pine flex items-center justify-center font-semibold"
            >
              {{ coach.nickname.slice(0, 1) }}
            </span>
            <div>
              <p class="font-medium">{{ coach.nickname }}</p>
              <p class="text-xs text-ink-faint">{{ coach.yearsOfExperience }} 年从业经验</p>
            </div>
          </div>
          <div v-if="coach.tagNames.length" class="mt-4 flex flex-wrap gap-1.5">
            <span
              v-for="tag in coach.tagNames"
              :key="tag"
              class="text-xs px-2.5 py-1 rounded-full bg-paper border border-hairline text-ink-soft"
            >
              {{ tag }}
            </span>
          </div>
          <p v-if="coach.serviceConcept" class="mt-4 text-sm text-ink-soft line-clamp-2">
            {{ coach.serviceConcept }}
          </p>
          <p class="mt-4 text-sm">
            <span class="text-pine font-semibold">{{ coach.rating.toFixed(1) }}</span>
            <span class="text-ink-faint"> 分 · {{ coach.reviewCount }} 条评价</span>
          </p>
        </RouterLink>
      </div>
    </section>

    <section v-if="!loading && !error" class="pb-20">
      <EmptyState
        v-if="!data?.featuredArticles.length && !data?.recommendedCoaches.length"
        title="内容正在整理中"
        hint="科普文章与教练资料准备好后会出现在这里。"
      />
    </section>
  </div>
</template>
