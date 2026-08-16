<!--
  GrowthAssessmentView: 成长测评（资源导向，不诊断、不贴标签）
  五维度自评 → 个性化报告 → 推荐自我教练模板与教练方向。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowRight as ArrowRight, PhChartBar as ChartBar, PhNotePencil as NotePencil } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { AssessmentHistoryItem, AssessmentResult, GrowthAssessmentTemplate } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

type Phase = 'intro' | 'quiz' | 'result'

const template = ref<GrowthAssessmentTemplate | null>(null)
const history = ref<AssessmentHistoryItem[]>([])
const phase = ref<Phase>('intro')
const answers = ref<Record<string, number>>({})
const result = ref<AssessmentResult | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')

const dimensions = computed(() => {
  const map = new Map<string, { key: string; name: string; questions: GrowthAssessmentTemplate['questions'] }>()
  for (const q of template.value?.questions ?? []) {
    const group = map.get(q.dimensionKey) ?? { key: q.dimensionKey, name: q.dimensionName, questions: [] }
    group.questions.push(q)
    map.set(q.dimensionKey, group)
  }
  return [...map.values()]
})

const answeredCount = computed(() => Object.keys(answers.value).length)
const totalCount = computed(() => template.value?.questions.length ?? 0)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [tpl, list] = await Promise.all([
      get<GrowthAssessmentTemplate>('/growth-assessments/template'),
      get<{ items: AssessmentHistoryItem[] }>('/growth-assessments?page=1&pageSize=10'),
    ])
    template.value = tpl
    history.value = list.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '测评加载失败'
  } finally {
    loading.value = false
  }
}

function start() {
  answers.value = {}
  phase.value = 'quiz'
}

function selectOption(questionId: number, value: number) {
  answers.value[String(questionId)] = value
}

async function submit() {
  if (!template.value || answeredCount.value !== totalCount.value) return
  submitting.value = true
  error.value = ''
  try {
    result.value = await post<AssessmentResult>('/growth-assessments', { answers: answers.value })
    phase.value = 'result'
    const list = await get<{ items: AssessmentHistoryItem[] }>('/growth-assessments?page=1&pageSize=10')
    history.value = list.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

async function viewHistory(id: number) {
  try {
    result.value = await get<AssessmentResult>(`/growth-assessments/${id}`)
    phase.value = 'result'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  }
}

function levelClass(level: string): string {
  if (level === 'HAS_STRENGTH') return 'bg-pine-soft text-pine-deep'
  if (level === 'GROWING') return 'bg-amber-100 text-amber-900'
  return 'bg-paper text-ink-faint border border-hairline'
}

function levelColor(level: string): string {
  if (level === 'HAS_STRENGTH') return '#9cae8e'
  if (level === 'GROWING') return '#b06a1f'
  return '#5b5b54'
}

onMounted(load)
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">成长测评</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">看见自己的成长方向</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      从觉察、资源、目标、行动与情绪五个方向自评。结果用于自我了解，不做任何诊断。
    </p>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else-if="template">
      <section v-if="phase === 'intro'" class="card mt-8 p-8 text-center">
        <span class="w-14 h-14 rounded-full bg-pine-soft text-pine flex items-center justify-center mx-auto">
          <ChartBar :size="28" weight="duotone" />
        </span>
        <h2 class="mt-4 text-xl font-semibold tracking-tight">5 个维度 · 15 道题 · 约 3 分钟</h2>
        <p class="mt-3 text-[15px] text-ink-soft leading-relaxed max-w-[42ch] mx-auto">
          {{ template.description }}
        </p>
        <button
          type="button"
          class="mt-8 inline-flex items-center gap-1.5 h-12 px-8 rounded-full bg-pine text-card font-medium pressable"
          @click="start"
        >
          开始测评 <ArrowRight :size="17" weight="bold" />
        </button>
      </section>

      <form v-else-if="phase === 'quiz'" class="mt-8 space-y-6" @submit.prevent="submit">
        <div class="flex items-center justify-between text-sm">
          <span class="text-ink-soft">进度 {{ answeredCount }} / {{ totalCount }}</span>
          <div class="flex-1 mx-4 h-2 rounded-full bg-paper overflow-hidden">
            <div
              class="h-full rounded-full bg-pine transition-all"
              :style="{ width: `${(answeredCount / totalCount) * 100}%` }"
            ></div>
          </div>
        </div>

        <section v-for="dim in dimensions" :key="dim.key" class="card p-6">
          <p class="catalog-tab">{{ dim.name }}</p>
          <div v-for="q in dim.questions" :key="q.id" class="mt-5">
            <p class="text-[15px] leading-relaxed">{{ q.question }}</p>
            <div class="mt-3 grid grid-cols-5 gap-2">
              <button
                v-for="opt in q.options"
                :key="opt.value"
                type="button"
                class="h-11 rounded-[10px] border text-sm pressable transition-colors"
                :class="
                  answers[String(q.id)] === opt.value
                    ? 'bg-pine border-pine text-card'
                    : 'border-hairline bg-card text-ink-soft hover:border-ink-faint'
                "
                :aria-pressed="answers[String(q.id)] === opt.value"
                @click="selectOption(q.id, opt.value)"
              >
                {{ opt.value }}<span class="block text-[10px] opacity-70">{{ opt.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <button
          type="submit"
          :disabled="submitting || answeredCount !== totalCount"
          class="w-full h-12 rounded-full bg-pine text-card font-medium disabled:opacity-50 pressable"
        >
          {{ submitting ? '生成报告中…' : '生成我的成长报告' }}
        </button>
      </form>

      <section v-else-if="result" class="mt-8">
        <div class="card p-6 md:p-8">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="catalog-tab">{{ result.templateName }}</p>
              <h2 class="mt-2 text-xl font-semibold tracking-tight">我的成长报告</h2>
            </div>
            <button
              type="button"
              class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
              @click="start"
            >
              重新测评
            </button>
          </div>
          <p class="mt-4 text-[15px] leading-relaxed">{{ result.report.summary }}</p>

          <div class="mt-6 space-y-3">
            <div v-for="dim in result.report.dimensions" :key="dim.dimensionKey" class="text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium">{{ dim.dimensionName }}</span>
                <span class="inline-flex items-center gap-2">
                  <span class="text-ink-soft">{{ dim.score }} 分</span>
                  <span class="text-xs px-2 py-0.5 rounded-full" :class="levelClass(dim.level)">
                    {{ dim.levelLabel }}
                  </span>
                </span>
              </div>
              <div class="mt-2 h-2 rounded-full bg-paper overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :style="{ width: `${(dim.score / 5) * 100}%`, backgroundColor: levelColor(dim.level) }"
                ></div>
              </div>
              <p class="mt-2 text-ink-soft leading-relaxed">{{ dim.interpretation }}</p>
            </div>
          </div>

          <div class="mt-8 border-t border-hairline pt-6">
            <p class="catalog-tab">给你的下一步</p>
            <div v-if="result.report.recommendations.selfCoaching.length" class="mt-3 flex flex-wrap gap-2">
              <RouterLink
                v-for="item in result.report.recommendations.selfCoaching"
                :key="item.id"
                to="/self-coaching"
                class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-pine-soft text-pine-deep text-sm pressable"
              >
                <NotePencil :size="15" /> {{ item.name }}
              </RouterLink>
            </div>
            <div v-if="result.report.recommendations.coachTags.length" class="mt-3 flex flex-wrap gap-2">
              <RouterLink
                v-for="tag in result.report.recommendations.coachTags"
                :key="tag.id"
                :to="`/coaches?tag=${encodeURIComponent(tag.name)}`"
                class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
              >
                看看「{{ tag.name }}」方向的教练
              </RouterLink>
            </div>
            <p v-if="!result.report.recommendations.selfCoaching.length && !result.report.recommendations.coachTags.length" class="mt-3 text-sm text-ink-soft">
              各方面都很稳，继续保持你的节奏，也可以去自我教练里试试新的场景。
            </p>
          </div>
        </div>

        <section class="mt-10">
          <h2 class="text-lg font-semibold tracking-tight">测评历史</h2>
          <div v-if="history.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
            <button
              v-for="item in history"
              :key="item.id"
              type="button"
              class="w-full text-left py-4 flex items-center justify-between gap-3 pressable"
              @click="viewHistory(item.id)"
            >
              <span class="text-sm font-medium">{{ item.templateName }}</span>
              <span class="text-sm text-ink-soft">
                {{ new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
              </span>
            </button>
          </div>
          <EmptyState v-else class="mt-4" title="还没有测评记录" />
        </section>
      </section>
    </template>
  </div>
</template>
