<!--
  EmotionJournalView: Mooda 式情绪记录
  既有 MindBasic 世界内的局部改版（pine 主色 / card 面板 / pill 控件继承不变）：
  表情选择 + 月度心情日历 + 按天筛选记录 + 近 30 天分布。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  PhCheck as Check,
  PhTrash as Trash,
  PhCaretLeft as CaretLeft,
  PhCaretRight as CaretRight,
} from '@phosphor-icons/vue'
import { del, get, post } from '@/api/client'
import type { EmotionCalendar, EmotionJournal, EmotionTrend } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const moods = [
  { key: 'CALM', label: '平静', emoji: '😌', color: '#1f6b52' },
  { key: 'HAPPY', label: '开心', emoji: '😄', color: '#b06a1f' },
  { key: 'ANXIOUS', label: '焦虑', emoji: '😟', color: '#7a5c1f' },
  { key: 'DOWN', label: '低落', emoji: '😢', color: '#4b5563' },
  { key: 'IRRITATED', label: '烦躁', emoji: '😠', color: '#9a3b2e' },
  { key: 'OTHER', label: '其他', emoji: '🙂', color: '#5b5b54' },
] as const

type MoodKey = (typeof moods)[number]['key']

const selectedMood = ref<MoodKey | null>(null)
const content = ref('')
const journals = ref<EmotionJournal[]>([])
const trend = ref<EmotionTrend | null>(null)
const calendar = ref<EmotionCalendar | null>(null)
const calYear = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth() + 1)
const selectedDate = ref<string | null>(null)
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const lastFeedback = ref('')

const monthTitle = computed(() => `${calYear.value} 年 ${calMonth.value} 月`)
const todayKey = computed(() => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
})

const calendarGrid = computed<Array<string | null>>(() => {
  if (!calendar.value) return []
  const leading = new Date(calYear.value, calMonth.value - 1, 1).getDay()
  return [
    ...Array(leading).fill(null),
    ...calendar.value.days.map((day) => day.date),
  ]
})

const filteredJournals = computed(() => {
  if (!selectedDate.value) return journals.value
  return journals.value.filter((journal) => {
    const date = new Date(journal.createdAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return key === selectedDate.value
  })
})

const trendMax = computed(() => {
  if (!trend.value) return 0
  return Math.max(1, ...Object.values(trend.value.summary))
})

const hasTrendData = computed(() =>
  Object.values(trend.value?.summary ?? {}).some((count) => count > 0),
)

async function fetchAll() {
  const [list, trendData, calData] = await Promise.all([
    get<{ items: EmotionJournal[] }>('/emotion-journals?page=1&pageSize=50'),
    get<EmotionTrend>('/emotion-journals/trend?days=30'),
    get<EmotionCalendar>(`/emotion-journals/calendar?month=${calYear.value}-${String(calMonth.value).padStart(2, '0')}`),
  ])
  journals.value = list.items
  trend.value = trendData
  calendar.value = calData
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    await fetchAll()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '日记加载失败'
  } finally {
    loading.value = false
  }
}

async function loadCalendar() {
  try {
    calendar.value = await get<EmotionCalendar>(
      `/emotion-journals/calendar?month=${calYear.value}-${String(calMonth.value).padStart(2, '0')}`,
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : '日历加载失败'
  }
}

function shiftMonth(delta: number) {
  let month = calMonth.value + delta
  let year = calYear.value
  if (month < 1) {
    month = 12
    year -= 1
  } else if (month > 12) {
    month = 1
    year += 1
  }
  calYear.value = year
  calMonth.value = month
  selectedDate.value = null
  loadCalendar()
}

function toggleDay(date: string) {
  selectedDate.value = selectedDate.value === date ? null : date
}

function dayMoodEmoji(date: string): string {
  const day = calendar.value?.days.find((item) => item.date === date)
  if (!day || !Object.keys(day.moods).length) return ''
  const top = moods
    .map((mood) => ({ mood, count: day.moods[mood.key] ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)[0]
  return top ? top.mood.emoji : ''
}

function moodLabel(key: string): string {
  return moods.find((mood) => mood.key === key)?.label ?? key
}

function moodColor(key: string): string {
  return moods.find((mood) => mood.key === key)?.color ?? '#5b5b54'
}

function barWidth(count: number): string {
  return `${Math.round((count / (trendMax.value || 1)) * 100)}%`
}

async function submit() {
  if (!selectedMood.value || !content.value.trim()) return
  submitting.value = true
  error.value = ''
  try {
    const journal = await post<EmotionJournal>('/emotion-journals', {
      moodType: selectedMood.value,
      content: content.value.trim(),
    })
    lastFeedback.value = journal.feedback ?? ''
    content.value = ''
    selectedMood.value = null
    await fetchAll()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
  } finally {
    submitting.value = false
  }
}

async function removeJournal(id: number) {
  try {
    await del(`/emotion-journals/${id}`)
    await fetchAll()
  } catch {
    error.value = '删除失败，请重试'
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">EJ 情绪日记</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">把此刻写下来</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      选一个表情，写一句话。我们会回你一句资源导向的回应，不评判，也不定义。
    </p>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <form class="card mt-8 p-5 md:p-8" @submit.prevent="submit">
      <div class="grid grid-cols-6 gap-2" role="radiogroup" aria-label="选择情绪">
        <button
          v-for="mood in moods"
          :key="mood.key"
          type="button"
          role="radio"
          :aria-checked="selectedMood === mood.key"
          class="flex flex-col items-center gap-1.5 rounded-2xl border py-3.5 pressable transition-colors"
          :class="
            selectedMood === mood.key
              ? 'border-transparent bg-pine-soft ring-2 ring-pine/40'
              : 'border-hairline bg-card hover:border-ink-faint'
          "
          @click="selectedMood = mood.key"
        >
          <span class="text-2xl leading-none" aria-hidden="true">{{ mood.emoji }}</span>
          <span
            class="text-xs font-medium"
            :class="selectedMood === mood.key ? 'text-pine-deep' : 'text-ink-soft'"
          >
            {{ mood.label }}
          </span>
        </button>
      </div>
      <textarea
        v-model="content"
        rows="3"
        placeholder="用一句话描述此刻的感受…"
        class="mt-5 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-pine resize-none"
      ></textarea>
      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs text-ink-faint">{{ content.length }} / 500</p>
        <button
          type="submit"
          :disabled="submitting || !selectedMood || !content.trim()"
          class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-50 pressable"
        >
          <Check :size="16" weight="bold" /> {{ submitting ? '记录中…' : '记录' }}
        </button>
      </div>
    </form>

    <div
      v-if="lastFeedback"
      class="mt-4 rounded-[10px] bg-pine-soft text-pine-deep px-5 py-4 text-[15px] leading-relaxed"
      role="status"
    >
      {{ lastFeedback }}
    </div>

    <section class="mt-12">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold tracking-tight">心情月历</h2>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="w-9 h-9 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-soft pressable"
            aria-label="上个月"
            @click="shiftMonth(-1)"
          >
            <CaretLeft :size="16" />
          </button>
          <span class="w-28 text-center text-sm font-medium">{{ monthTitle }}</span>
          <button
            type="button"
            class="w-9 h-9 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-soft pressable"
            aria-label="下个月"
            @click="shiftMonth(1)"
          >
            <CaretRight :size="16" />
          </button>
        </div>
      </div>

      <div class="card mt-4 p-4 md:p-5">
        <div v-if="loading && !calendar" class="grid grid-cols-7 gap-1.5">
          <div v-for="i in 35" :key="i" class="aspect-square rounded-xl bg-hairline/60 animate-pulse"></div>
        </div>
        <template v-else>
          <div class="grid grid-cols-7 text-center text-xs text-ink-faint">
            <span v-for="weekday in ['日', '一', '二', '三', '四', '五', '六']" :key="weekday" class="py-1">
              {{ weekday }}
            </span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1.5">
            <template v-for="(cell, index) in calendarGrid" :key="index">
              <span v-if="!cell" class="aspect-square"></span>
              <button
                v-else
                type="button"
                class="relative aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 pressable transition-colors"
                :class="
                  selectedDate === cell
                    ? 'bg-pine'
                    : cell === todayKey
                      ? 'bg-pine-soft hover:bg-pine-soft/70'
                      : 'hover:bg-paper'
                "
                :aria-label="`${cell} 的心情`"
                :aria-pressed="selectedDate === cell"
                @click="toggleDay(cell)"
              >
                <span class="text-base leading-none" aria-hidden="true">{{ dayMoodEmoji(cell) }}</span>
                <span
                  class="text-[10px] leading-none"
                  :class="selectedDate === cell ? 'text-card' : 'text-ink-faint'"
                >
                  {{ Number(cell.slice(8)) }}
                </span>
              </button>
            </template>
          </div>
          <p class="catalog-tab mt-3">点击某一天可查看当天的记录</p>
        </template>
      </div>
    </section>

    <section class="mt-12">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold tracking-tight">{{ selectedDate ? `${selectedDate} 的记录` : '记录' }}</h2>
        <button
          v-if="selectedDate"
          type="button"
          class="text-sm text-pine font-medium pressable"
          @click="selectedDate = null"
        >
          清除筛选
        </button>
      </div>
      <div v-if="loading" class="mt-5 space-y-3">
        <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
      </div>
      <div v-else-if="filteredJournals.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="journal in filteredJournals" :key="journal.id" class="py-4 flex gap-4">
          <span class="mt-1 text-xl leading-none shrink-0" aria-hidden="true">
            {{ moods.find((mood) => mood.key === journal.moodType)?.emoji }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-[15px] leading-relaxed">{{ journal.content }}</p>
            <p v-if="journal.feedback" class="mt-2 text-sm text-ink-soft leading-relaxed">
              {{ journal.feedback }}
            </p>
            <p class="catalog-tab mt-2">
              {{ moodLabel(journal.moodType) }} · {{ new Date(journal.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
          </div>
          <button
            type="button"
            class="self-start p-2 text-ink-faint hover:text-red-800 rounded-full pressable"
            :aria-label="`删除这条日记`"
            @click="removeJournal(journal.id)"
          >
            <Trash :size="17" />
          </button>
        </div>
      </div>
      <div v-else class="mt-5">
        <EmptyState
          :title="selectedDate ? '这一天还没有记录' : '还没有日记'"
          :hint="selectedDate ? '换一天看看，或写下这一天的感受。' : '写下第一条，观察自己的情绪变化。'"
        />
      </div>
    </section>

    <section v-if="trend" class="mt-12">
      <h2 class="text-lg font-semibold tracking-tight">近 30 天分布</h2>
      <div class="card mt-4 p-5 md:p-6">
        <div v-if="hasTrendData" class="space-y-2.5">
          <div v-for="mood in moods" :key="mood.key" class="flex items-center gap-3 text-sm">
            <span class="w-8 shrink-0 text-ink-soft">{{ mood.emoji }} {{ mood.label }}</span>
            <div class="flex-1 h-2 rounded-full bg-paper overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :style="{ width: barWidth(trend.summary[mood.key] ?? 0), backgroundColor: mood.color }"
              ></div>
            </div>
            <span class="w-7 text-right text-ink-soft">{{ trend.summary[mood.key] ?? 0 }}</span>
          </div>
        </div>
        <p v-else class="text-sm text-ink-soft">近 30 天还没有记录，写下第一条开始观察变化。</p>
      </div>
    </section>
  </div>
</template>
