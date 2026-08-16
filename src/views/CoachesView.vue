<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useRoute } from 'vue-router'
import { PhMagnifyingGlass as MagnifyingGlass } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { CoachBrief } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const keyword = ref('')
const route = useRoute()
const coaches = ref<CoachBrief[]>([])
const loading = ref(true)
const error = ref('')
const tagNames = ['考前焦虑', '职场压力', '亲子沟通', '情绪低落', '目标规划']
const activeTag = ref('')

const filtered = computed(() => {
  if (!activeTag.value) return coaches.value
  return coaches.value.filter((c) => c.tagNames.includes(activeTag.value))
})

onMounted(async () => {
  if (typeof route.query.tag === 'string') activeTag.value = route.query.tag
  try {
    const data = await get<{ items: CoachBrief[] }>('/coaches?page=1&pageSize=50')
    coaches.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '教练列表加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">找教练</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">找到适合你的教练</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      每位教练都经过平台审核。服务理念以赋能、陪伴、资源导向为准。
    </p>

    <div class="mt-8 flex flex-wrap gap-2">
      <button
        v-for="tag in tagNames"
        :key="tag"
        type="button"
        class="h-9 px-4 rounded-full border text-sm transition-colors pressable"
        :class="activeTag === tag ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="activeTag = activeTag === tag ? '' : tag"
      >
        {{ tag }}
      </button>
    </div>

    <label class="relative block mt-6 max-w-[420px]">
      <MagnifyingGlass
        :size="18"
        class="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
      />
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索教练昵称"
        class="w-full h-12 pl-11 pr-4 rounded-full border border-hairline bg-card text-[15px] outline-none focus:border-pine"
      />
    </label>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 grid md:grid-cols-2 gap-4">
      <div v-for="i in 4" :key="i" class="h-44 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <div v-else-if="filtered.length" class="mt-8 grid md:grid-cols-2 gap-4">
      <RouterLink
        v-for="coach in filtered"
        :key="coach.id"
        :to="`/coaches/${coach.id}`"
        class="card p-5 pressable"
      >
        <div class="flex items-center gap-3">
          <span
            class="w-12 h-12 rounded-full bg-pine-soft text-pine flex items-center justify-center font-semibold text-lg"
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
    <div v-else class="mt-8">
      <EmptyState title="暂时没有匹配的教练" hint="换个标签或关键词试试，也可以稍后再来看看。" />
    </div>
  </div>
</template>
