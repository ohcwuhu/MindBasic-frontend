<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { PhBell as Bell, PhChatCircleText as ChatIcon, PhCheckCircle as CheckCircle } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { Notification } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

interface ConversationBrief {
  id: number
  coachId: number
  peerNickname: string
  peerAvatar: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  unreadCount: number
}

const router = useRouter()
const tab = ref<'notifications' | 'messages'>('notifications')
const items = ref<Notification[]>([])
const conversations = ref<ConversationBrief[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await get<{ items: Notification[] }>('/notifications?page=1&pageSize=50')
    items.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '通知加载失败'
  } finally {
    loading.value = false
  }
}

async function loadConversations() {
  loading.value = true
  error.value = ''
  try {
    conversations.value = await get<ConversationBrief[]>('/chat/conversations')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '消息加载失败'
  } finally {
    loading.value = false
  }
}

function switchTab(next: 'notifications' | 'messages') {
  if (tab.value === next) return
  tab.value = next
  if (next === 'messages') {
    void loadConversations()
  } else {
    void load()
  }
}

function openChat(coachId: number) {
  router.push({ path: '/messages', query: { coachId: String(coachId) } })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

onMounted(load)

async function markAll() {
  try {
    await post('/notifications/read-all')
    items.value = items.value.map((n) => ({ ...n, isRead: true }))
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function markOne(item: Notification) {
  if (item.isRead) return
  try {
    await post(`/notifications/${item.id}/read`)
    item.isRead = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

const unreadCount = () => items.value.filter((n) => !n.isRead).length
</script>

<template>
  <div class="max-w-[640px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <component :is="tab === 'notifications' ? Bell : ChatIcon" :size="22" weight="duotone" class="text-pine" />
        <h1 class="text-2xl font-semibold tracking-tight">{{ tab === 'notifications' ? '通知' : '消息' }}</h1>
      </div>
      <button
        v-if="tab === 'notifications' && unreadCount() > 0"
        type="button"
        class="h-10 px-5 rounded-full border border-pine text-pine text-sm pressable"
        @click="markAll"
      >
        全部已读
      </button>
    </div>

    <div class="mt-6 flex gap-2" role="tablist" aria-label="消息中心分类">
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'notifications'"
        class="h-9 px-4 rounded-full border text-sm pressable"
        :class="tab === 'notifications' ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab('notifications')"
      >
        通知
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="tab === 'messages'"
        class="h-9 px-4 rounded-full border text-sm pressable"
        :class="tab === 'messages' ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab('messages')"
      >
        消息
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />

    <div v-if="loading" class="mt-6 space-y-3">
      <div v-for="i in 5" :key="i" class="h-20 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else-if="tab === 'notifications'">
      <div v-if="items.length" class="mt-6 divide-y divide-hairline border-y border-hairline">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="w-full py-4 text-left pressable"
          :class="item.isRead ? 'opacity-60' : ''"
          @click="markOne(item)"
        >
          <div class="flex items-start gap-3">
            <span
              class="mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              :class="item.type === 'AUDIT' ? 'bg-amber-100 text-amber-900' : 'bg-pine-soft text-pine'"
            >
              <CheckCircle :size="16" weight="duotone" />
            </span>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-medium">{{ item.title }}</p>
                <span v-if="!item.isRead" class="w-2 h-2 rounded-full bg-pine shrink-0" aria-label="未读"></span>
              </div>
              <p class="mt-1 text-sm text-ink-soft leading-relaxed">{{ item.content }}</p>
              <p class="catalog-tab mt-2">{{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}</p>
            </div>
          </div>
        </button>
      </div>
      <EmptyState v-else class="mt-6" title="还没有通知" hint="预约确认和审核结果会出现在这里。" />
    </template>

    <template v-else>
      <div v-if="conversations.length" class="mt-6 divide-y divide-hairline border-y border-hairline">
        <button
          v-for="c in conversations"
          :key="c.id"
          type="button"
          class="w-full py-4 text-left pressable"
          @click="openChat(c.coachId)"
        >
          <div class="flex items-start gap-3">
            <span class="mt-0.5 w-9 h-9 rounded-full bg-pine-soft text-pine flex items-center justify-center shrink-0">
              <ChatIcon :size="17" weight="duotone" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-3">
                <p class="font-medium truncate">{{ c.peerNickname }}</p>
                <span v-if="c.lastMessageAt" class="shrink-0 text-xs text-ink-faint">{{ fmtTime(c.lastMessageAt) }}</span>
              </div>
              <p class="mt-1 text-sm text-ink-soft truncate">{{ c.lastMessagePreview || '开始你们的沟通吧' }}</p>
            </div>
            <span
              v-if="c.unreadCount > 0"
              class="shrink-0 mt-1 min-w-[18px] h-[18px] px-1 rounded-full bg-pine text-card text-[10px] flex items-center justify-center"
            >
              {{ c.unreadCount }}
            </span>
          </div>
        </button>
      </div>
      <EmptyState v-else class="mt-6" title="还没有会话" hint="在教练详情页发起在线沟通，消息会出现在这里。" />
    </template>
  </div>
</template>
