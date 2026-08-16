<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowRight as ArrowRight } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { ArticleCategory, ArticleListItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const categories = ref<ArticleCategory[]>([])
const articles = ref<ArticleListItem[]>([])
const activeCategory = ref<number | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const [categoryData, articleData] = await Promise.all([
      get<{ items: ArticleCategory[] }>('/article-categories'),
      get<{ items: ArticleListItem[] }>('/articles?page=1&pageSize=50'),
    ])
    categories.value = categoryData.items
    articles.value = articleData.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '文章加载失败'
  } finally {
    loading.value = false
  }
})

async function filter(categoryId: number | null) {
  activeCategory.value = categoryId
  loading.value = true
  try {
    const data = await get<{ items: ArticleListItem[] }>(
      `/articles?page=1&pageSize=50${categoryId ? `&categoryId=${categoryId}` : ''}`,
    )
    articles.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '文章加载失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">科普中心</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">成长技巧、教练故事与常见困惑</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      所有内容都采用"问题、资源、行动"的结构，不学术、不说教。
    </p>

    <div class="mt-8 flex flex-wrap gap-2">
      <button
        type="button"
        class="h-9 px-4 rounded-full border text-sm transition-colors pressable"
        :class="activeCategory === null ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="filter(null)"
      >
        全部
      </button>
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        class="h-9 px-4 rounded-full border text-sm transition-colors pressable"
        :class="activeCategory === category.id ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="filter(category.id)"
      >
        {{ category.name }}
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <div v-else-if="articles.length" class="mt-8 divide-y divide-hairline border-y border-hairline">
      <RouterLink
        v-for="article in articles"
        :key="article.id"
        :to="`/articles/${article.id}`"
        class="group py-5 flex items-start justify-between gap-6"
      >
        <div>
          <div class="flex items-center gap-2">
            <p class="font-medium group-hover:text-pine transition-colors">{{ article.title }}</p>
            <span
              v-if="article.isPinned"
              class="text-[11px] px-2 py-0.5 rounded-full bg-pine-soft text-pine"
            >
              置顶
            </span>
          </div>
          <p v-if="article.summary" class="mt-1.5 text-sm text-ink-soft line-clamp-2">
            {{ article.summary }}
          </p>
          <p class="catalog-tab mt-2">
            {{ article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('zh-CN') : '' }}
          </p>
        </div>
        <ArrowRight :size="18" class="text-ink-faint mt-1 shrink-0 group-hover:text-pine" />
      </RouterLink>
    </div>
    <div v-else class="mt-8">
      <EmptyState title="这个分类还没有文章" hint="内容正在准备中，敬请期待。" />
    </div>
  </div>
</template>
