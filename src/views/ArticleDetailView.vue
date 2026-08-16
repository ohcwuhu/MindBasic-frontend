<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowLeft as ArrowLeft,
  PhBookmark as Bookmark,
  PhBookmarkSimple as BookmarkSimple,
  PhShareNetwork as ShareNetwork,
} from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { ArticleDetail } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import ErrorBanner from '@/components/ErrorBanner.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const articleId = Number(route.params.id)
const article = ref<ArticleDetail | null>(null)
const loading = ref(true)
const error = ref('')

const favoriteBusy = ref(false)
const shareBusy = ref(false)
const shareMsg = ref('')

onMounted(async () => {
  try {
    article.value = await get<ArticleDetail>(`/articles/${articleId}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '文章加载失败'
  } finally {
    loading.value = false
  }
})

async function toggleFavorite() {
  if (!article.value || !auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  favoriteBusy.value = true
  try {
    const data = await post<{ isFavorite: boolean }>(`/articles/${articleId}/favorite`)
    article.value.isFavorite = data.isFavorite
  } catch {
    error.value = '操作失败，请重试'
  } finally {
    favoriteBusy.value = false
  }
}

const isFavorite = computed(() => article.value?.isFavorite ?? false)

async function shareArticle() {
  if (!article.value) return
  const url = window.location.href
  const title = article.value.title
  shareBusy.value = true
  error.value = ''
  try {
    if (navigator.share) {
      await navigator.share({ title, text: `${title}\n${url}`, url })
      return
    }
    await navigator.clipboard.writeText(url)
    shareMsg.value = '链接已复制'
    setTimeout(() => (shareMsg.value = ''), 2500)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    error.value = '分享失败，请重试'
  } finally {
    shareBusy.value = false
  }
}
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/articles" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回科普中心
    </RouterLink>

    <div v-if="loading" class="mt-8 space-y-4">
      <div class="h-8 w-3/4 rounded bg-hairline/60 animate-pulse"></div>
      <div class="h-4 w-1/3 rounded bg-hairline/60 animate-pulse"></div>
      <div class="h-72 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <ErrorBanner v-else-if="error" :message="error" class="mt-8" />

    <article v-else-if="article" class="mt-8">
      <p class="catalog-tab">{{ article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('zh-CN') : '' }} · {{ article.viewCount }} 次阅读</p>
      <h1 class="mt-3 text-2xl md:text-[2rem] font-semibold tracking-tight leading-snug">
        {{ article.title }}
      </h1>
      <p v-if="article.summary" class="mt-4 text-[15px] text-ink-soft leading-relaxed">
        {{ article.summary }}
      </p>
      <div class="mt-8 flex items-center justify-between">
        <span class="catalog-tab">AR-{{ String(article.id).padStart(2, '0') }}</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="shareBusy"
            class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable disabled:opacity-60"
            @click="shareArticle"
          >
            <ShareNetwork :size="17" /> 分享
          </button>
          <button
            type="button"
            :disabled="favoriteBusy"
            class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-hairline bg-card text-sm pressable disabled:opacity-60"
            :class="isFavorite ? 'text-pine border-pine' : 'text-ink-soft'"
            @click="toggleFavorite"
          >
            <Bookmark v-if="isFavorite" :size="17" weight="fill" />
            <BookmarkSimple v-else :size="17" />
            {{ isFavorite ? '已收藏' : '收藏' }}
          </button>
        </div>
      </div>
      <p v-if="shareMsg" class="mt-2 text-sm text-pine-deep">{{ shareMsg }}</p>
      <div
        class="article-body mt-8"
        v-html="article.content"
      ></div>
    </article>
  </div>
</template>

<style scoped>
.article-body {
  max-width: 720px;
}
.article-body :deep(p) {
  margin: 1.1em 0;
  line-height: 1.85;
  color: #5b5b54;
  font-size: 15px;
}
.article-body :deep(h2) {
  margin: 1.6em 0 0.6em;
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #1c1c1a;
}
.article-body :deep(ul),
.article-body :deep(ol) {
  margin: 1em 0;
  padding-left: 1.4em;
  line-height: 1.85;
  color: #5b5b54;
}
.article-body :deep(blockquote) {
  margin: 1.4em 0;
  padding: 0.8em 1.2em;
  background: #e4efe9;
  color: #17533f;
  border-radius: 0 10px 10px 0;
  border: 1px solid #cfe3d8;
}
</style>
