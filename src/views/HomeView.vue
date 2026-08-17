<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PhArrowRight as ArrowRight,
  PhCardsThree as CardsThree,
  PhBookOpenText as BookOpenText,
  PhNotePencil as NotePencil,
  PhSparkle as Sparkle,
} from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { HomeOut } from '@/api/types'
import Reveal from '@/components/Reveal.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const data = ref<HomeOut | null>(null)
const loading = ref(true)
const error = ref('')

const entries = [
      { key: 'self_coaching', title: '自我教练', desc: '和 AI 教练视频对话，边聊边梳理', to: '/self-coaching', icon: Sparkle },
  { key: 'emotion_journal', title: '情绪日记', desc: '写一句话，收到一句资源导向的回应', to: '/emotion-journal', icon: NotePencil },
  { key: 'coaches', title: '找教练', desc: '找到经审核、可信任的教练', to: '/coaches', icon: CardsThree },
  { key: 'science', title: '科普中心', desc: '成长技巧、教练故事、常见困惑', to: '/articles', icon: BookOpenText },
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
</script>

<template>
  <div class="max-w-[1100px] mx-auto px-4 md:px-6">
    <section class="grid md:grid-cols-[1.1fr_0.9fr] gap-10 md:gap-14 pt-10 md:pt-20 pb-14 md:pb-24 items-center">
      <Reveal>
        <p class="catalog-tab mb-4">MindBasic · 心理教练成长服务平台</p>
        <h1 class="text-[2.5rem] md:text-[3.4rem] leading-[1.08] font-semibold tracking-[-0.02em] max-w-[14ch]">
          成长不是被定义，而是被看见、被陪伴
        </h1>
        <p class="mt-5 text-[15px] md:text-base text-ink-soft leading-relaxed max-w-[46ch]">
          从一张行动卡开始。先借助自助教练工具安顿此刻，再按需找到经审核的真人教练。
        </p>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <RouterLink
            to="/self-coaching"
            class="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors pressable"
          >
            开始自我教练
            <ArrowRight :size="18" weight="bold" />
          </RouterLink>
          <RouterLink
            to="/coaches"
            class="inline-flex items-center gap-2 h-12 px-6 rounded-full border border-hairline bg-card text-ink hover:border-pine hover:text-pine transition-colors pressable"
          >
            看看有哪些教练
          </RouterLink>
        </div>
      </Reveal>

      <Reveal>
        <div class="relative" aria-hidden="true">
          <div class="card p-6 rotate-[-2deg]">
            <p class="catalog-tab">SF-01 考前焦虑调节</p>
            <p class="mt-3 font-medium">今日行动卡</p>
            <p class="mt-2 text-sm text-ink-soft leading-relaxed">
              睡前做一次深呼吸练习，并把"我已经准备好"写在便签上。
            </p>
            <span class="mt-4 inline-flex items-center gap-1.5 text-pine text-sm font-medium">
              <Sparkle :size="16" weight="fill" /> 已盖章 · 完成
            </span>
          </div>
          <div class="card p-6 rotate-[1.5deg] mt-4 ml-8 md:ml-14">
            <p class="catalog-tab">EJ-03 情绪日记</p>
            <p class="mt-3 text-sm text-ink-soft leading-relaxed">
              "你愿意把这份不安写下来，本身就很有勇气。"
            </p>
          </div>
          <span
            class="absolute -top-3 right-6 w-16 h-16 rounded-full bg-pine-soft text-pine flex items-center justify-center"
          >
            <Sparkle :size="28" weight="fill" />
          </span>
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
          class="card p-5 md:p-6 pressable group"
        >
          <span class="w-10 h-10 rounded-full bg-pine-soft text-pine flex items-center justify-center">
            <component :is="entry.icon" :size="22" weight="duotone" />
          </span>
          <p class="mt-4 font-medium">{{ entry.title }}</p>
          <p class="mt-1 text-sm text-ink-soft leading-relaxed">{{ entry.desc }}</p>
          <span
            class="mt-4 inline-flex items-center gap-1 text-sm text-pine group-hover:gap-2 transition-all"
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
