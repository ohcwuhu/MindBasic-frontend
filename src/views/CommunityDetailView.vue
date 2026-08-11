<!--
  CommunityDetailView: 社群详情（加入/退出、帖子流、点赞、评论、教练置顶治理）
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowLeft as ArrowLeft,
  PhChatCircleText as ChatIcon,
  PhHeart as Heart,
  PhImage as ImageIcon,
  PhPushPin as Pin,
  PhTrash as Trash,
  PhUsers as UsersIcon,
} from '@phosphor-icons/vue'
import { del, get, patch, post, uploadFile } from '@/api/client'
import type { CommunityComment, CommunityDetail, CommunityPost } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const communityId = Number(route.params.id)

const detail = ref<CommunityDetail | null>(null)
const posts = ref<CommunityPost[]>([])
const loading = ref(true)
const error = ref('')
const joining = ref(false)
const submittingPost = ref(false)
const uploadingImage = ref(false)
const postContent = ref('')
const postImage = ref('')
const comments = ref<Record<number, CommunityComment[]>>({})
const expandedPosts = ref<Set<number>>(new Set())
const commentInputs = ref<Record<number, string>>({})
const commenting = ref<number | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [info, list] = await Promise.all([
      get<CommunityDetail>(`/communities/${communityId}`),
      get<{ items: CommunityPost[] }>(`/communities/${communityId}/posts?page=1&pageSize=50`),
    ])
    detail.value = info
    posts.value = list.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleJoin() {
  if (!auth.isLoggedIn) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  if (!detail.value) return
  joining.value = true
  error.value = ''
  try {
    const action = detail.value.joined ? 'leave' : 'join'
    await post(`/communities/${communityId}/${action}`)
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    joining.value = false
  }
}

async function pickImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingImage.value = true
  error.value = ''
  try {
    const result = await uploadFile(file, 'general')
    postImage.value = result.url
  } catch (e) {
    error.value = e instanceof Error ? e.message : '图片上传失败'
  } finally {
    uploadingImage.value = false
    input.value = ''
  }
}

async function createPost() {
  if (!postContent.value.trim()) return
  submittingPost.value = true
  error.value = ''
  try {
    await post(`/communities/${communityId}/posts`, {
      content: postContent.value.trim(),
      imageUrl: postImage.value || null,
    })
    postContent.value = ''
    postImage.value = ''
    const list = await get<{ items: CommunityPost[] }>(`/communities/${communityId}/posts?page=1&pageSize=50`)
    posts.value = list.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发布失败'
  } finally {
    submittingPost.value = false
  }
}

async function toggleLike(item: CommunityPost) {
  try {
    const data = await post<{ liked: boolean; likeCount: number }>(
      `/communities/${communityId}/posts/${item.id}/like`,
    )
    item.liked = data.liked
    item.likeCount = data.likeCount
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function toggleComments(item: CommunityPost) {
  if (expandedPosts.value.has(item.id)) {
    expandedPosts.value.delete(item.id)
    return
  }
  try {
    const data = await get<{ post: CommunityPost; comments: CommunityComment[] }>(
      `/communities/${communityId}/posts/${item.id}`,
    )
    comments.value[item.id] = data.comments
    expandedPosts.value.add(item.id)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评论加载失败'
  }
}

async function addComment(item: CommunityPost) {
  const content = commentInputs.value[item.id]?.trim()
  if (!content) return
  commenting.value = item.id
  error.value = ''
  try {
    const comment = await post<CommunityComment>(
      `/communities/${communityId}/posts/${item.id}/comments`,
      { content },
    )
    comments.value[item.id] = [...(comments.value[item.id] ?? []), comment]
    commentInputs.value[item.id] = ''
    item.commentCount += 1
  } catch (e) {
    error.value = e instanceof Error ? e.message : '评论失败'
  } finally {
    commenting.value = null
  }
}

async function togglePin(item: CommunityPost) {
  try {
    const data = await patch<{ isPinned: boolean }>(
      `/communities/${communityId}/posts/${item.id}/pin`,
    )
    item.isPinned = data.isPinned
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function removePost(postId: number) {
  try {
    await del(`/communities/${communityId}/posts/${postId}`)
    posts.value = posts.value.filter((p) => p.id !== postId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-[720px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/communities" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回社群广场
    </RouterLink>

    <div v-if="loading" class="mt-8 space-y-4">
      <div v-for="i in 4" :key="i" class="h-28 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <ErrorBanner v-else-if="error && !detail" :message="error" class="mt-8" />

    <template v-else-if="detail">
      <section class="card mt-8 p-6 md:p-8">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="catalog-tab">CM-{{ String(detail.id).padStart(2, '0') }}</p>
            <h1 class="mt-2 text-2xl font-semibold tracking-tight">{{ detail.name }}</h1>
            <p class="mt-3 text-[15px] text-ink-soft leading-relaxed">{{ detail.description }}</p>
            <p class="catalog-tab mt-4 inline-flex items-center gap-1">
              <UsersIcon :size="14" /> {{ detail.memberCount }} 人
              <span v-if="detail.coachNickname"> · {{ detail.coachNickname }} 带队</span>
            </p>
          </div>
          <button
            type="button"
            :disabled="joining"
            class="shrink-0 h-11 px-6 rounded-full text-sm font-medium pressable disabled:opacity-60"
            :class="detail.joined ? 'border border-hairline bg-card text-ink-soft' : 'bg-pine text-card'"
            @click="toggleJoin"
          >
            {{ detail.joined ? '退出社群' : '加入社群' }}
          </button>
        </div>
      </section>

      <ErrorBanner v-if="error && detail" :message="error" class="mt-4" />

      <section v-if="detail.joined" class="card mt-5 p-5">
        <p class="catalog-tab">分享此刻</p>
        <textarea
          v-model="postContent"
          rows="3"
          placeholder="写下你的经验、打卡或问题…（支持 Markdown）"
          class="mt-3 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-pine resize-y"
        ></textarea>
        <div class="mt-3 flex items-center justify-between">
          <label class="inline-flex items-center gap-1.5 text-sm text-ink-soft pressable">
            <ImageIcon :size="17" />
            <span v-if="postImage" class="text-pine">已选择图片</span>
            <span v-else>配图</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" class="hidden" :disabled="uploadingImage" @change="pickImage" />
          </label>
          <button
            type="button"
            :disabled="submittingPost || !postContent.trim()"
            class="h-10 px-6 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-50 pressable"
            @click="createPost"
          >
            {{ submittingPost ? '发布中…' : '发布' }}
          </button>
        </div>
      </section>

      <section class="mt-8">
        <h2 class="text-lg font-semibold tracking-tight">社群动态</h2>
        <div v-if="posts.length" class="mt-4 space-y-3">
          <article
            v-for="post in posts"
            :key="post.id"
            class="card p-5"
            :class="post.isPinned ? 'border-pine/40' : ''"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="font-medium text-sm">{{ post.nickname }}</p>
              <div class="flex items-center gap-2">
                <span v-if="post.isPinned" class="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-pine-soft text-pine-deep">
                  <Pin :size="12" weight="fill" /> 置顶
                </span>
                <span class="catalog-tab">{{ new Date(post.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
              </div>
            </div>
            <p class="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{{ post.content }}</p>
            <img
              v-if="post.imageUrl"
              :src="post.imageUrl"
              alt="帖子配图"
              class="mt-3 max-h-72 rounded-[10px] border border-hairline object-cover"
            />
            <div class="mt-4 flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-hairline bg-card text-sm pressable"
                :class="post.liked ? 'text-pine border-pine' : 'text-ink-soft'"
                @click="toggleLike(post)"
              >
                <Heart :size="15" :weight="post.liked ? 'fill' : 'regular'" /> {{ post.likeCount }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                @click="toggleComments(post)"
              >
                <ChatIcon :size="15" /> {{ post.commentCount }}
              </button>
              <div v-if="detail.canManage" class="flex-1 flex justify-end gap-2">
                <button
                  type="button"
                  class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                  @click="togglePin(post)"
                >
                  {{ post.isPinned ? '取消置顶' : '置顶' }}
                </button>
                <button
                  type="button"
                  class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-red-800 pressable"
                  @click="removePost(post.id)"
                >
                  删除
                </button>
              </div>
            </div>

            <div v-if="expandedPosts.has(post.id)" class="mt-4 border-t border-hairline pt-4 space-y-3">
              <div v-for="comment in comments[post.id] ?? []" :key="comment.id" class="text-sm">
                <p><span class="font-medium">{{ comment.nickname }}</span>
                  <span class="text-ink-faint ml-2">{{ new Date(comment.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</span>
                </p>
                <p class="mt-1 text-ink-soft leading-relaxed">{{ comment.content }}</p>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="commentInputs[post.id]"
                  placeholder="说点什么…"
                  class="flex-1 h-10 px-4 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine"
                  @keyup.enter="addComment(post)"
                />
                <button
                  type="button"
                  :disabled="commenting === post.id || !commentInputs[post.id]?.trim()"
                  class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-50 pressable"
                  @click="addComment(post)"
                >
                  评论
                </button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="mt-4">
          <EmptyState title="还没有动态" :hint="detail.joined ? '来发布第一条吧。' : '加入社群后参与讨论。'" />
        </div>
      </section>
    </template>
  </div>
</template>
