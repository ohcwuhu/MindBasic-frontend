<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhArrowLeft as ArrowLeft,
  PhArrowRight as ArrowRight,
  PhCheck as Check,
  PhImageSquare as ImageSquare,
  PhShareNetwork as ShareNetwork,
  PhSparkle as Sparkle,
} from '@phosphor-icons/vue'
import { toPng } from 'html-to-image'
import { get, post, patch } from '@/api/client'
import type { ActionCard, CoachingTemplate, SelfCoachingRecord } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

const route = useRoute()
const router = useRouter()
const templateId = Number(route.params.id)

const template = ref<CoachingTemplate | null>(null)
const answers = ref<Record<string, string>>({})
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const recordId = ref<number | null>(null)
const actionCard = ref<ActionCard | null>(null)
const cardEl = ref<HTMLElement | null>(null)
const shareMsg = ref('')

const stepKeys = ['STATUS', 'IDEAL', 'RESOURCES', 'ACTION'] as const
const stepIndex = ref(0)

const currentStep = computed(() => template.value?.steps[stepIndex.value])
const isLast = computed(() => stepIndex.value === stepKeys.length - 1)
const allAnswered = computed(() =>
  template.value ? template.value.steps.every((s) => (answers.value[s.stepKey] ?? '').trim()) : false,
)

onMounted(async () => {
  try {
    template.value = await get<CoachingTemplate>(`/self-coaching/templates/${templateId}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '模板加载失败'
  } finally {
    loading.value = false
  }
})

async function saveDraft() {
  saving.value = true
  error.value = ''
  try {
    const body = { templateId, answers: answers.value, status: 'DRAFT' as const }
    const record = recordId.value
      ? await patch<SelfCoachingRecord>(`/self-coaching/records/${recordId.value}`, { answers: answers.value })
      : await post<SelfCoachingRecord>('/self-coaching/records', body)
    recordId.value = record.id
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

async function complete() {
  saving.value = true
  error.value = ''
  try {
    const record = recordId.value
      ? await patch<SelfCoachingRecord>(`/self-coaching/records/${recordId.value}`, {
          answers: answers.value,
          status: 'COMPLETED',
        })
      : await post<SelfCoachingRecord>('/self-coaching/records', {
          templateId,
          answers: answers.value,
          status: 'COMPLETED',
        })
    recordId.value = record.id
    actionCard.value = record.actionCard
  } catch (e) {
    error.value = e instanceof Error ? e.message : '生成行动卡失败，请重试'
  } finally {
    saving.value = false
  }
}

function next() {
  if (stepIndex.value < stepKeys.length - 1) stepIndex.value += 1
}

function prev() {
  if (stepIndex.value > 0) stepIndex.value -= 1
}

function flashShare(message: string) {
  shareMsg.value = message
  setTimeout(() => (shareMsg.value = ''), 3000)
}

async function shareCard() {
  if (!actionCard.value) return
  const text = `${actionCard.value.title}\n\n${actionCard.value.content}`
  try {
    if (navigator.share) {
      await navigator.share({ title: actionCard.value.title, text })
      return
    }
    await navigator.clipboard.writeText(text)
    flashShare('已复制到剪贴板')
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    try {
      await navigator.clipboard.writeText(text)
      flashShare('已复制到剪贴板')
    } catch {
      error.value = '分享失败，请重试'
    }
  }
}

async function saveImage() {
  if (!cardEl.value) return
  try {
    const dataUrl = await toPng(cardEl.value, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    })
    const link = document.createElement('a')
    link.download = 'mindbasic-action-card.png'
    link.href = dataUrl
    link.click()
    flashShare('图片已保存')
  } catch {
    error.value = '图片生成失败，请重试'
  }
}
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/self-coaching" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回模板
    </RouterLink>

    <div v-if="loading" class="mt-8 space-y-4">
      <div class="h-8 w-2/3 rounded bg-hairline/60 animate-pulse"></div>
      <div class="h-56 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <ErrorBanner v-else-if="error" :message="error" class="mt-8" />

    <template v-else-if="template">
      <div class="mt-6 flex items-center justify-between">
        <p class="catalog-tab">SF-{{ String(template.id).padStart(2, '0') }} {{ template.name }}</p>
        <p class="text-sm text-ink-faint">第 {{ stepIndex + 1 }} / {{ template.steps.length }} 步</p>
      </div>
      <div class="mt-3 flex gap-1.5" aria-hidden="true">
        <span
          v-for="(step, i) in template.steps"
          :key="step.stepKey"
          class="h-1.5 flex-1 rounded-full transition-colors"
          :class="i <= stepIndex ? 'bg-pine' : 'bg-hairline'"
        ></span>
      </div>

      <section v-if="!actionCard" class="card mt-6 p-6 md:p-10">
        <h1 class="text-xl md:text-2xl font-semibold tracking-tight leading-snug">
          {{ currentStep?.question }}
        </h1>
        <p class="catalog-tab mt-6">{{ currentStep?.stepName }}</p>
        <textarea
          v-model="answers[currentStep!.stepKey]"
          :placeholder="currentStep?.placeholder ?? '写下你的想法…'"
          rows="5"
          class="mt-3 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-pine resize-y"
        ></textarea>
        <div class="mt-6 flex items-center justify-between">
          <button
            v-if="stepIndex > 0"
            type="button"
            @click="prev"
            class="inline-flex items-center gap-1.5 h-11 px-5 rounded-full border border-hairline bg-card text-ink-soft pressable"
          >
            <ArrowLeft :size="16" /> 上一步
          </button>
          <button
            v-else
            type="button"
            @click="saveDraft"
            :disabled="saving"
            class="inline-flex items-center gap-1.5 h-11 px-5 rounded-full border border-hairline bg-card text-ink-soft disabled:opacity-60 pressable"
          >
            保存草稿
          </button>
          <button
            v-if="!isLast"
            type="button"
            @click="next"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium hover:bg-pine-deep pressable"
          >
            下一步 <ArrowRight :size="16" weight="bold" />
          </button>
          <button
            v-else
            type="button"
            @click="complete"
            :disabled="saving || !allAnswered"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-50 pressable"
          >
            <Sparkle :size="16" weight="fill" /> {{ saving ? '生成中…' : '生成行动卡' }}
          </button>
        </div>
        <p v-if="isLast && !allAnswered" class="mt-4 text-sm text-ink-soft">
          完成全部四步后才能生成行动卡。
        </p>
      </section>

      <section ref="cardEl" v-else class="card mt-6 p-6 md:p-10 text-center">
        <span class="w-14 h-14 rounded-full bg-pine-soft text-pine flex items-center justify-center mx-auto">
          <Check :size="28" weight="bold" />
        </span>
        <h1 class="mt-4 text-xl font-semibold tracking-tight">{{ actionCard.title }}</h1>
        <pre class="mt-5 text-left text-[15px] leading-relaxed whitespace-pre-wrap font-sans text-ink-soft">{{ actionCard.content }}</pre>
        <div class="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium pressable"
            @click="shareCard"
          >
            <ShareNetwork :size="17" weight="bold" /> 分享行动卡
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full border border-hairline bg-card text-ink pressable"
            @click="saveImage"
          >
            <ImageSquare :size="17" /> 保存图片
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full border border-hairline bg-card text-ink-soft pressable"
            @click="router.push('/self-coaching')"
          >
            再做一次
          </button>
          <RouterLink to="/my" class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full border border-hairline bg-card text-ink pressable">
            查看我的成长
          </RouterLink>
        </div>
        <p v-if="shareMsg" class="mt-4 text-sm text-pine-deep">{{ shareMsg }}</p>
      </section>
    </template>
  </div>
</template>
