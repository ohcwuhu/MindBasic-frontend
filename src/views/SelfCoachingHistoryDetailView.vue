<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { PhArrowLeft as ArrowLeft } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { AiConversationItem, AiMessageItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

const route = useRoute()
const conversation = ref<AiConversationItem | null>(null)
const messages = ref<AiMessageItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await get<{ conversation: AiConversationItem; messages: AiMessageItem[] }>(
      `/ai-conversations/${route.params.id}`,
    )
    conversation.value = data.conversation
    messages.value = data.messages
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function emotionLabel(emotion: Record<string, unknown> | null): string {
  const cn = emotion?.fusion_emotion_cn
  return typeof cn === 'string' && cn ? cn : ''
}
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/self-coaching/history" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回记录列表
    </RouterLink>

    <div v-if="loading" class="mt-8 h-64 rounded-[14px] bg-hairline/60 animate-pulse"></div>

    <template v-else>
      <ErrorBanner v-if="error" :message="error" class="mt-6" />

      <template v-else-if="conversation">
        <p class="catalog-tab mt-8">SELF-COACHING · CONVERSATION</p>
        <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">{{ conversation.title }}</h1>
        <p class="mt-2 text-sm text-ink-soft">
          {{ fmtTime(conversation.createdAt) }} · {{ conversation.messageCount }} 条消息
        </p>

        <div v-if="messages.length" class="mt-8 space-y-5">
          <div v-for="m in messages" :key="m.id" class="flex" :class="m.role === 'USER' ? 'justify-end' : 'justify-start'">
            <div class="max-w-[78%]">
              <div
                class="rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap"
                :class="
                  m.role === 'USER'
                    ? 'bg-pine text-card rounded-br-md'
                    : 'bg-card border border-hairline text-ink rounded-bl-md'
                "
              >
                {{ m.content }}
              </div>
              <div class="mt-1 flex items-center gap-2" :class="m.role === 'USER' ? 'justify-end' : 'justify-start'">
                <span v-if="m.role === 'ASSISTANT'" class="text-[10px] font-semibold text-pine-deep bg-pine-soft rounded-full px-2 py-0.5">
                  AI 生成
                </span>
                <span v-if="emotionLabel(m.emotion)" class="text-[11px] text-ink-faint">{{ emotionLabel(m.emotion) }}</span>
                <span class="text-[11px] text-ink-faint">{{ fmtTime(m.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="mt-8 text-sm text-ink-soft">这条记录还没有消息。</p>
      </template>
    </template>
  </div>
</template>
