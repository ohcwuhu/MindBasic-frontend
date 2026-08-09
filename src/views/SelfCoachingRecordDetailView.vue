<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PhArrowLeft as ArrowLeft, PhShareNetwork as ShareNetwork, PhNotePencil as NotePencil } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { CoachingTemplate, SelfCoachingRecord } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const recordId = Number(route.params.id)

const record = ref<SelfCoachingRecord | null>(null)
const template = ref<CoachingTemplate | null>(null)
const loading = ref(true)
const error = ref('')
const shareMsg = ref('')

onMounted(async () => {
  try {
    record.value = await get<SelfCoachingRecord>(`/self-coaching/records/${recordId}`)
    template.value = await get<CoachingTemplate>(`/self-coaching/templates/${record.value.templateId}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '记录加载失败'
  } finally {
    loading.value = false
  }
})

async function share() {
  if (!record.value?.actionCard) return
  const text = `${record.value.actionCard.title}\n\n${record.value.actionCard.content}`
  try {
    if (navigator.share) {
      await navigator.share({ title: record.value.actionCard.title, text })
      return
    }
    await navigator.clipboard.writeText(text)
    shareMsg.value = '已复制到剪贴板'
    setTimeout(() => (shareMsg.value = ''), 3000)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    error.value = '分享失败，请重试'
  }
}

function stepQuestion(stepKey: string): string {
  return template.value?.steps.find((s) => s.stepKey === stepKey)?.question ?? stepKey
}
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/my" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回我的成长
    </RouterLink>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-4">
      <div class="h-8 w-1/2 rounded bg-hairline/60 animate-pulse"></div>
      <div class="h-64 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else-if="record && template">
      <div class="mt-8 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">{{ template.name }}</h1>
          <p class="mt-2 text-sm text-ink-soft">
            {{ new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
          </p>
        </div>
        <StatusBadge :status="record.status" :map="{ DRAFT: '草稿', COMPLETED: '已完成' }" />
      </div>

      <section class="mt-8 divide-y divide-hairline border-y border-hairline">
        <div v-for="step in template.steps" :key="step.stepKey" class="py-6">
          <p class="catalog-tab">{{ step.stepName }}</p>
          <p class="mt-2 text-sm text-ink-soft leading-relaxed">{{ step.question }}</p>
          <p class="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap">{{ record.answers[step.stepKey] || '（未填写）' }}</p>
        </div>
      </section>

      <section v-if="record.actionCard" class="card mt-8 p-6 md:p-8">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-lg font-semibold tracking-tight">{{ record.actionCard.title }}</h2>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
            @click="share"
          >
            <ShareNetwork :size="16" /> 分享
          </button>
        </div>
        <pre class="mt-4 text-[15px] leading-relaxed whitespace-pre-wrap font-sans text-ink-soft">{{ record.actionCard.content }}</pre>
        <p v-if="shareMsg" class="mt-3 text-sm text-pine-deep">{{ shareMsg }}</p>
      </section>

      <div v-if="record.status === 'DRAFT'" class="mt-8">
        <RouterLink
          :to="`/self-coaching/${record.templateId}`"
          class="inline-flex items-center gap-1.5 h-12 px-6 rounded-full bg-pine text-card font-medium pressable"
        >
          <NotePencil :size="17" weight="bold" /> 继续完成
        </RouterLink>
      </div>
    </template>
  </div>
</template>
