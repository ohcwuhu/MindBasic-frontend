<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { io, type Socket } from 'socket.io-client'
import {
  PhArrowLeft,
  PhChatCircleText,
  PhPaperPlaneRight,
  PhUserCircle,
} from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import { useAuthStore } from '@/stores/auth'

interface Conversation {
  id: number
  coachId: number
  peerNickname: string
  peerAvatar: string | null
  lastMessagePreview: string
  lastMessageAt: string | null
  unreadCount: number
}

interface ChatMsg {
  id: number
  conversationId: number
  senderId: number
  senderRole: 'USER' | 'COACH'
  content: string
  readAt: string | null
  createdAt: string
}

const route = useRoute()
const auth = useAuthStore()
const isCoach = computed(() => route.name === 'coach-messages')

const conversations = ref<Conversation[]>([])
const activeId = ref<number | null>(null)
const messages = ref<ChatMsg[]>([])
const input = ref('')
const loading = ref(true)
const sending = ref(false)
const errorMsg = ref('')
const showList = ref(true)
const chatBodyRef = ref<HTMLElement | null>(null)

let socket: Socket | null = null

const activeConv = computed(() => conversations.value.find((c) => c.id === activeId.value) ?? null)

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return fmtTime(iso)
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function scrollBottom() {
  nextTick(() => {
    if (chatBodyRef.value) chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  })
}

async function loadConversations() {
  loading.value = true
  errorMsg.value = ''
  try {
    conversations.value = await get<Conversation[]>('/chat/conversations')
  } catch (e: any) {
    errorMsg.value = e?.message || '会话加载失败'
  } finally {
    loading.value = false
  }
}

async function openConversation(id: number) {
  activeId.value = id
  showList.value = false
  messages.value = []
  socket?.emit('chat:join', { conversationId: id })
  try {
    const data = await get<{ items: ChatMsg[] }>(`/chat/conversations/${id}/messages`)
    messages.value = data.items
    scrollBottom()
    await markRead(id)
  } catch (e: any) {
    errorMsg.value = e?.message || '消息加载失败'
  }
}

async function ensureConversationWithCoach(coachId: number) {
  try {
    const conv = await post<{ id: number }>('/chat/conversations', { coachId })
    await loadConversations()
    await openConversation(conv.id)
  } catch (e: any) {
    errorMsg.value = e?.message || '发起会话失败'
  }
}

async function markRead(id: number) {
  try {
    await post(`/chat/conversations/${id}/read`)
  } catch {
    // 忽略已读失败
  }
  socket?.emit('chat:read', { conversationId: id })
  const conv = conversations.value.find((c) => c.id === id)
  if (conv) conv.unreadCount = 0
}

async function send() {
  const content = input.value.trim()
  if (!content || !activeId.value || sending.value) return
  input.value = ''
  sending.value = true
  try {
    if (socket && socket.connected) {
      socket.emit('chat:send', { conversationId: activeId.value, content })
    } else {
      const msg = await post<ChatMsg>(`/chat/conversations/${activeId.value}/messages`, { content })
      applyMessage(msg)
    }
  } catch (e: any) {
    errorMsg.value = e?.message || '发送失败'
    input.value = content
  } finally {
    sending.value = false
  }
}

function applyMessage(msg: ChatMsg) {
  if (messages.value.some((m) => m.id === msg.id)) return
  messages.value.push(msg)
  const conv = conversations.value.find((c) => c.id === msg.conversationId)
  if (conv) {
    conv.lastMessagePreview = msg.content
    conv.lastMessageAt = msg.createdAt
  }
  if (activeId.value === msg.conversationId) {
    scrollBottom()
    void markRead(msg.conversationId)
  } else if (conv && msg.senderId !== auth.user?.id) {
    conv.unreadCount += 1
  }
}

function connectSocket() {
  const token = localStorage.getItem('mb_access_token')
  if (!token) return
  socket = io('/chat', {
    auth: { token },
    transports: ['websocket', 'polling'],
  })
  socket.on('chat:message', (msg: ChatMsg) => applyMessage(msg))
  socket.on('chat:read', (data: { conversationId: number; userId: number }) => {
    const conv = conversations.value.find((c) => c.id === data.conversationId)
    if (conv) conv.unreadCount = 0
    messages.value = messages.value.map((m) =>
      m.conversationId === data.conversationId && m.senderId !== data.userId
        ? { ...m, readAt: new Date().toISOString() }
        : m,
    )
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void send()
  }
}

function backToList() {
  showList.value = true
}

onMounted(async () => {
  connectSocket()
  await loadConversations()
  const coachId = Number(route.query.coachId)
  if (coachId) {
    await ensureConversationWithCoach(coachId)
  } else if (conversations.value.length > 0) {
    await openConversation(conversations.value[0].id)
  }
})

onUnmounted(() => {
  socket?.removeAllListeners()
  socket?.close()
  socket = null
})
</script>

<template>
  <div class="chat-page">
    <!-- 会话列表 -->
    <aside class="conv-list" :class="{ hidden: !showList }">
      <div class="list-header">
        <span class="list-title">
          <PhChatCircleText :size="18" weight="duotone" />
          {{ isCoach ? '用户消息' : '我的消息' }}
        </span>
        <span v-if="loading" class="list-loading">加载中…</span>
      </div>

      <p v-if="errorMsg" class="page-error" role="alert">{{ errorMsg }}</p>

      <div v-if="!loading && conversations.length === 0" class="list-empty">
        <p>{{ isCoach ? '还没有用户发来消息' : '还没有会话，去教练详情页发起在线咨询吧' }}</p>
      </div>

      <button
        v-for="conv in conversations"
        :key="conv.id"
        class="conv-item"
        :class="{ active: conv.id === activeId }"
        @click="openConversation(conv.id)"
      >
        <span class="conv-avatar">
          <img v-if="conv.peerAvatar" :src="conv.peerAvatar" alt="" />
          <PhUserCircle v-else :size="22" weight="duotone" />
        </span>
        <span class="conv-main">
          <span class="conv-name">{{ conv.peerNickname }}</span>
          <span class="conv-preview">{{ conv.lastMessagePreview || '暂无消息' }}</span>
        </span>
        <span class="conv-side">
          <span class="conv-time">{{ fmtDate(conv.lastMessageAt) }}</span>
          <span v-if="conv.unreadCount > 0" class="conv-badge">{{ conv.unreadCount }}</span>
        </span>
      </button>
    </aside>

    <!-- 对话区 -->
    <section class="thread" :class="{ hidden: showList }">
      <div class="thread-header">
        <button class="back-btn" aria-label="返回列表" @click="backToList">
          <PhArrowLeft :size="20" weight="bold" />
        </button>
        <span class="thread-title">
          <span class="thread-avatar">
            <PhUserCircle :size="16" weight="duotone" />
          </span>
          {{ activeConv?.peerNickname || (isCoach ? '用户' : '教练') }}
        </span>
      </div>

      <div v-if="!activeConv" class="thread-empty">
        选择左侧会话开始聊天
      </div>

      <template v-else>
        <div ref="chatBodyRef" class="thread-body">
          <div
            v-for="m in messages"
            :key="m.id"
            class="msg-row"
            :class="m.senderRole === 'COACH' ? (isCoach ? 'mine' : 'peer') : isCoach ? 'peer' : 'mine'"
          >
            <div class="bubble">{{ m.content }}</div>
            <span class="msg-time">{{ fmtTime(m.createdAt) }}</span>
          </div>
        </div>

        <div class="thread-input">
          <textarea
            v-model="input"
            class="input-box"
            rows="1"
            placeholder="输入消息，Enter 发送"
            :disabled="sending"
            @keydown="onKeydown"
          ></textarea>
          <button class="send-btn" :disabled="sending || !input.trim()" @click="send">
            <PhPaperPlaneRight :size="18" weight="bold" />
          </button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.chat-page {
  position: fixed;
  left: 0;
  right: 0;
  top: 64px;
  bottom: 0;
  padding: 16px;
  display: flex;
  gap: 12px;
  box-sizing: border-box;
  background: var(--color-paper);
}

/* 会话列表 */
.conv-list {
  width: 320px;
  flex-shrink: 0;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-hairline);
}
.list-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink);
}
.list-loading {
  font-size: 12px;
  color: var(--color-ink-soft);
}
.page-error {
  margin: 10px 14px 0;
  color: #c2402f;
  font-size: 12.5px;
  background: #fbeae6;
  border-radius: 10px;
  padding: 8px 12px;
}
.list-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-faint);
  font-size: 13px;
  text-align: center;
  padding: 24px;
  line-height: 1.7;
}
.conv-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid var(--color-hairline);
  background: transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.conv-item:hover {
  background: var(--color-paper);
}
.conv-item.active {
  background: var(--color-pine-soft);
}
.conv-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--color-paper);
  border: 1px solid var(--color-hairline);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-soft);
  flex-shrink: 0;
  overflow: hidden;
}
.conv-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.conv-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.conv-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-ink);
}
.conv-preview {
  font-size: 12.5px;
  color: var(--color-ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.conv-time {
  font-size: 11px;
  color: var(--color-ink-faint);
}
.conv-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--color-pine);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 对话区 */
.thread {
  flex: 1;
  min-width: 0;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.thread-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-hairline);
}
.back-btn {
  display: none;
  border: none;
  background: transparent;
  color: var(--color-ink-soft);
  cursor: pointer;
  padding: 4px;
}
.thread-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--color-ink);
}
.thread-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-pine-soft);
  color: var(--color-pine);
  display: flex;
  align-items: center;
  justify-content: center;
}
.thread-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-faint);
  font-size: 13px;
}
.thread-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-paper);
}
.msg-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-width: 76%;
}
.msg-row.mine {
  align-self: flex-end;
  align-items: flex-end;
}
.msg-row.peer {
  align-self: flex-start;
  align-items: flex-start;
}
.bubble {
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.mine .bubble {
  background: var(--color-pine);
  color: #fff;
  border-top-right-radius: 4px;
}
.msg-row.peer .bubble {
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  color: var(--color-ink);
  border-top-left-radius: 4px;
}
.msg-time {
  font-size: 11px;
  color: var(--color-ink-faint);
}
.thread-input {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--color-hairline);
}
.input-box {
  flex: 1;
  resize: none;
  border: 1px solid var(--color-hairline);
  border-radius: 12px;
  padding: 9px 12px;
  font-size: 14px;
  line-height: 1.6;
  font-family: inherit;
  outline: none;
  color: var(--color-ink);
  background: var(--color-card);
}
.input-box:focus {
  border-color: var(--color-pine);
}
.send-btn {
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 12px;
  background: var(--color-pine);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease, background 0.2s ease;
}
.send-btn:hover:not(:disabled) {
  background: var(--color-pine-deep);
}
.send-btn:active {
  transform: scale(0.96);
}
.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.send-btn:focus-visible,
.input-box:focus-visible,
.back-btn:focus-visible {
  outline: 2px solid var(--color-pine);
  outline-offset: 2px;
}

@media (max-width: 820px) {
  .chat-page {
    flex-direction: column;
  }
  .conv-list {
    width: 100%;
    flex: 1;
  }
  .conv-list.hidden {
    display: none;
  }
  .thread {
    flex: 1;
  }
  .thread.hidden {
    display: none;
  }
  .back-btn {
    display: inline-flex;
  }
}
@media (max-width: 640px) {
  .chat-page {
    top: 56px;
    bottom: 64px;
    padding: 10px;
  }
}
</style>
