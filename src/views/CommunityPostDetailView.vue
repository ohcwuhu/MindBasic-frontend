<!--
  CommunityPostDetailView: 帖子详情（正文 + 评论），米游社式单列阅读。
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowLeft as ArrowLeft,
  PhChatCircleText as ChatIcon,
  PhHeart as Heart,
  PhPushPin as Pin,
} from '@phosphor-icons/vue'
import { del, get, patch, post as postApi } from '@/api/client'
import type { CommunityComment, CommunityDetail, CommunityPost } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const communityId = Number(route.params.communityId)
const postId = Number(route.params.postId)

const community = ref<CommunityDetail | null>(null)
const post = ref<CommunityPost | null>(null)
const comments = ref<CommunityComment[]>([])
const loading = ref(true)
const error = ref('')
const commentInput = ref('')
const submittingComment = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [info, data] = await Promise.all([
      get<CommunityDetail>(`/communities/${communityId}`),
      get<{ post: CommunityPost; comments: CommunityComment[] }>(
        `/communities/${communityId}/posts/${postId}`,
      ),
    ])
    community.value = info
    post.value = data.post
    comments.value = data.comments
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleLike() {
  if (!post.value) return
  try {
    const data = await postApi<{ liked: boolean; likeCount: number }>(
      `/communities/${communityId}/posts/${postId}/like`,
    )
    post.value.liked = data.liked
    post.value.likeCount = data.likeCount
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function addComment() {
  const content = commentInput.value.trim()
  if (!content) return
  submittingComment.value = true
  error.value = ''
  try {
    const comment = await postApi<CommunityComment>(
      `/communities/${communityId}/posts/${postId}/comments`,
      { content },
    )
    comments.value = [...comments.value, comment]
    commentInput.value = ''
    if (post.value) post.value.commentCount += 1
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评论失败'
  } finally {
    submittingComment.value = false
  }
}

async function togglePin() {
  if (!post.value) return
  try {
    const data = await patch<{ isPinned: boolean }>(
      `/communities/${communityId}/posts/${postId}/pin`,
    )
    post.value.isPinned = data.isPinned
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function removePost() {
  try {
    await del(`/communities/${communityId}/posts/${postId}`)
    router.push(`/communities/${communityId}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink :to="`/communities/${communityId}`" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> {{ community?.name ?? '返回社群' }}
    </RouterLink>

    <div v-if="loading" class="mt-6 space-y-3">
      <div v-for="i in 4" :key="i" class="h-28 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <ErrorBanner v-else-if="error" :message="error" class="mt-6" />

    <template v-else-if="post">
      <article class="card mt-6 p-5">
        <div class="flex items-center gap-2.5">
          <span class="w-10 h-10 rounded-full bg-pine-soft text-pine-deep text-sm flex items-center justify-center shrink-0">
            {{ post.nickname.slice(0, 1) }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="font-medium">{{ post.nickname }}</p>
            <p class="catalog-tab mt-0.5">
              {{ new Date(post.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
          </div>
          <span
            v-if="post.isPinned"
            class="inline-flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-pine-soft text-pine-deep shrink-0"
          >
            <Pin :size="10" weight="fill" /> 置顶
          </span>
        </div>
        <p class="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap">{{ post.content }}</p>
        <img
          v-if="post.imageUrl"
          :src="post.imageUrl"
          alt="帖子配图"
          class="mt-4 w-full rounded-[12px] border border-hairline object-cover"
        />
        <div class="mt-5 flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border text-sm pressable"
            :class="post.liked ? 'text-pine border-pine' : 'border-hairline bg-card text-ink-soft'"
            @click="toggleLike"
          >
            <Heart :size="15" :weight="post.liked ? 'fill' : 'regular'" /> {{ post.likeCount }}
          </button>
          <span class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft">
            <ChatIcon :size="15" /> {{ post.commentCount }}
          </span>
          <div v-if="community?.canManage" class="flex-1 flex justify-end gap-1">
            <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="togglePin">
              {{ post.isPinned ? '取消置顶' : '置顶' }}
            </button>
            <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-red-800 pressable" @click="removePost">
              删除
            </button>
          </div>
        </div>
      </article>

      <section class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">评论 {{ comments.length }}</h2>
        <div v-if="comments.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
          <div v-for="comment in comments" :key="comment.id" class="py-4 flex gap-3">
            <span class="w-8 h-8 rounded-full bg-paper text-ink-soft text-xs flex items-center justify-center shrink-0">
              {{ comment.nickname.slice(0, 1) }}
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-medium">{{ comment.nickname }}</p>
                <span class="catalog-tab">{{ new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
              </div>
              <p class="mt-1 text-[15px] leading-relaxed">{{ comment.content }}</p>
            </div>
          </div>
        </div>
        <EmptyState v-else class="mt-4" title="还没有评论" hint="来抢沙发，说点什么。" />

        <div class="mt-6 flex gap-2">
          <input
            v-model="commentInput"
            placeholder="写下你的回应…"
            class="flex-1 h-11 px-4 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine"
            @keyup.enter="addComment"
          />
          <button
            type="button"
            :disabled="submittingComment || !commentInput.trim()"
            class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-50 pressable"
            @click="addComment"
          >
            评论
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
