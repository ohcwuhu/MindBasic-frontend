<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhArrowLeft as ArrowLeft, PhChatCircleDots as ChatDots } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { AiConversationItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const items = ref<AiConversationItem[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await get<{ items: AiConversationItem[] }>(
      '/ai-conversations?page=1&pageSize=50',
    )
    items.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
})

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/self-coaching" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回自我教练
    </RouterLink>

    <p class="catalog-tab mt-8">SELF-COACHING · HISTORY</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">对话记录</h1>
    <p class="mt-2 text-sm text-ink-soft">每次自我教练通话都会自动保存，随时回看。</p>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />

    <div v-if="loading" class="mt-6 space-y-3">
      <div v-for="i in 4" :key="i" class="h-20 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <div v-else-if="items.length" class="mt-6 divide-y divide-hairline border-y border-hairline">
      <RouterLink
        v-for="item in items"
        :key="item.id"
        :to="`/self-coaching/history/${item.id}`"
        class="group py-5 flex items-center gap-4 pressable"
      >
        <span class="w-10 h-10 rounded-full bg-pine-soft text-pine flex items-center justify-center shrink-0">
          <ChatDots :size="20" weight="duotone" />
        </span>
        <span class="flex-1 min-w-0">
          <span class="block font-medium truncate group-hover:text-pine transition-colors">{{ item.title }}</span>
          <span class="block mt-1 text-sm text-ink-soft">
            {{ fmtTime(item.createdAt) }} · {{ item.messageCount }} 条消息
          </span>
        </span>
        <span
          class="shrink-0 text-xs px-2.5 py-1 rounded-full"
          :class="item.status === 'ENDED' ? 'bg-paper text-ink-faint border border-hairline' : 'bg-amber-100 text-amber-900'"
        >
          {{ item.status === 'ENDED' ? '已结束' : '进行中' }}
        </span>
      </RouterLink>
    </div>

    <EmptyState
      v-else
      class="mt-6"
      title="还没有对话记录"
      hint="完成一次自我教练通话后，记录会自动保存在这里。"
    />
  </div>
</template>
