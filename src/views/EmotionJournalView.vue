<!--
  EmotionJournalView v2 — 温暖·呼吸感·情绪记录空间
  设计理念：像和一个懂你的朋友聊天——不拥挤、不评判、有足够的空间安放情绪。
  参考：Daylio / Reflectly / Moodflow 的视觉语言——大圆点表情、柔和卡片、充足留白。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PhCheck as Check,
  PhTrash as Trash,
  PhCaretLeft as CaretLeft,
  PhCaretRight as CaretRight,
  PhHeartStraight,
} from '@phosphor-icons/vue'
import { del, get, post } from '@/api/client'
import type { EmotionCalendar, EmotionJournal, EmotionTrend } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'
import MoodFace from '@/components/MoodFace.vue'
import QuoteBlock from '@/components/QuoteBlock.vue'

const route = useRoute()
const router = useRouter()

const moods = [
  { key: 'CALM', label: '平静', color: '#9cae8e', bg: 'rgba(156,174,142,0.12)' },
  { key: 'HAPPY', label: '开心', color: '#e0a14c', bg: 'rgba(224,161,76,0.12)' },
  { key: 'ANXIOUS', label: '焦虑', color: '#d9a441', bg: 'rgba(217,164,65,0.12)' },
  { key: 'DOWN', label: '低落', color: '#c08aa6', bg: 'rgba(192,138,166,0.12)' },
  { key: 'IRRITATED', label: '烦躁', color: '#c97a5b', bg: 'rgba(201,122,91,0.12)' },
  { key: 'OTHER', label: '其他', color: '#b5a392', bg: 'rgba(181,163,146,0.12)' },
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
const pendingSource = ref<{ source: string; conversationId: number } | null>(null)

onMounted(() => {
  const mood = String(route.query.mood ?? '')
  const text = String(route.query.content ?? '')
  const convId = Number(route.query.conversationId || 0)
  if (mood && moods.some((m) => m.key === mood)) {
    selectedMood.value = mood as MoodKey
  }
  if (text) content.value = text
  if (convId) pendingSource.value = { source: 'SELF_COACHING', conversationId: convId }
})

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
  if (month < 1) { month = 12; year -= 1 }
  else if (month > 12) { month = 1; year += 1 }
  calYear.value = year
  calMonth.value = month
  selectedDate.value = null
  loadCalendar()
}

function toggleDay(date: string) {
  selectedDate.value = selectedDate.value === date ? null : date
}

function dayMoodKey(date: string): string | null {
  const day = calendar.value?.days.find((item) => item.date === date)
  if (!day || !Object.keys(day.moods).length) return null
  const top = moods
    .map((mood) => ({ mood, count: day.moods[mood.key] ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)[0]
  return top ? top.mood.key : null
}

function moodLabel(key: string): string {
  return moods.find((mood) => mood.key === key)?.label ?? key
}

function moodColor(key: string): string {
  return moods.find((mood) => mood.key === key)?.color ?? '#5b5b54'
}

function moodBg(key: string): string {
  return moods.find((mood) => mood.key === key)?.bg ?? 'rgba(0,0,0,0.06)'
}

function barWidth(count: number): string {
  return `${Math.round((count / (trendMax.value || 1)) * 100)}%`
}

async function submit() {
  if (!selectedMood.value || !content.value.trim()) return
  submitting.value = true
  error.value = ''
  try {
    const payload: Record<string, unknown> = {
      moodType: selectedMood.value,
      content: content.value.trim(),
    }
    if (pendingSource.value) {
      payload.source = pendingSource.value.source
      payload.sourceConversationId = pendingSource.value.conversationId
    }
    const journal = await post<EmotionJournal>('/emotion-journals', payload)
    lastFeedback.value = journal.feedback ?? ''
    content.value = ''
    selectedMood.value = null
    if (pendingSource.value) {
      pendingSource.value = null
      router.replace({ path: '/emotion-journal' })
    }
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
  <div class="ej-page">
    <!-- 装饰光晕 -->
    <div class="ej-glow ej-glow-1" aria-hidden="true"></div>
    <div class="ej-glow ej-glow-2" aria-hidden="true"></div>

    <div class="ej-inner">
      <!-- ===== 页头 ===== -->
      <header class="ej-header">
        <p class="ej-label">情绪日记</p>
        <h1 class="ej-title">把此刻写下来</h1>
        <p class="ej-subtitle">选一个表情，写一句话。我们会回你一句资源导向的回应，不评判，也不定义。</p>
      </header>

      <ErrorBanner v-if="error" :message="error" class="mt-6" />

      <!-- ===== 记录区：情绪选择 + 文字输入 ===== -->
    <div
      v-if="pendingSource"
      class="mt-6 rounded-[10px] bg-pine-soft/70 text-pine-deep px-4 py-3 text-sm leading-relaxed"
    >
      这条内容来自「自我教练」对话总结，可以直接提交，也可以修改后再提交。
    </div>

    <form class="ej-write-card" @submit.prevent="submit">
        <!-- 情绪选择器：横向大圆点 + 标签 -->
        <fieldset class="ej-mood-fieldset">
          <legend class="ej-mood-legend">此刻的感觉</legend>
          <div class="ej-mood-bar" role="radiogroup" aria-label="选择情绪">
            <button
              v-for="mood in moods"
              :key="mood.key"
              type="button"
              role="radio"
              :aria-checked="selectedMood === mood.key"
              class="ej-mood-pill"
              :class="{ 'ej-mood-active': selectedMood === mood.key }"
              :style="{
                '--mood-color': mood.color,
                '--mood-bg': mood.bg,
                ...(selectedMood === mood.key ? { boxShadow: `0 0 0 2px ${mood.color}40, 0 4px 16px ${mood.color}22` } : {})
              }"
              @click="selectedMood = mood.key"
            >
              <span class="ej-mood-icon-wrap">
                <MoodFace :mood="mood.key" class="ej-mood-icon" aria-hidden="true" />
              </span>
              <span class="ej-mood-label">{{ mood.label }}</span>
              <span v-if="selectedMood === mood.key" class="ej-mood-check" aria-hidden="true">
                <Check :size="11" weight="bold" />
              </span>
            </button>
          </div>
        </fieldset>

        <!-- 输入区 -->
        <div class="ej-input-wrap">
          <textarea
            v-model="content"
            rows="3"
            placeholder="用一句话描述此刻的感受…"
            class="ej-textarea"
          ></textarea>
          <div class="ej-input-footer">
            <span class="ej-char-count">{{ content.length }} / 500</span>
            <button
              type="submit"
              :disabled="submitting || !selectedMood || !content.trim()"
              class="ej-submit-btn"
            >
              <PhHeartStraight :size="15" weight="fill" />
              {{ submitting ? '记录中…' : '记录此刻' }}
            </button>
          </div>
        </div>
      </form>

      <!-- AI 回应 -->
      <div v-if="lastFeedback" class="ej-feedback">
        <p class="ej-feedback-text">{{ lastFeedback }}</p>
      </div>

      <!-- ===== 心情月历 ===== -->
      <section class="ej-section">
        <div class="ej-section-head">
          <div>
            <p class="ej-section-label">月历</p>
            <h2 class="ej-section-title">心情轨迹</h2>
          </div>
          <div class="ej-month-nav">
            <button type="button" class="ej-nav-btn" aria-label="上个月" @click="shiftMonth(-1)">
              <CaretLeft :size="14" />
            </button>
            <span class="ej-month-label">{{ monthTitle }}</span>
            <button type="button" class="ej-nav-btn" aria-label="下个月" @click="shiftMonth(1)">
              <CaretRight :size="14" />
            </button>
          </div>
        </div>

        <div class="ej-calendar-card">
          <div v-if="loading && !calendar" class="ej-cal-skeleton">
            <div v-for="i in 35" :key="i" class="ej-cal-dot-skel"></div>
          </div>
          <template v-else>
            <div class="ej-cal-weekdays">
              <span v-for="wd in ['日','一','二','三','四','五','六']" :key="wd" class="ej-cal-wd">{{ wd }}</span>
            </div>
            <div class="ej-cal-grid">
              <template v-for="(cell, idx) in calendarGrid" :key="idx">
                <span v-if="!cell" class="ej-cal-cell ej-cal-empty"></span>
                <button
                  v-else
                  type="button"
                  class="ej-cal-cell"
                  :class="{
                    'ej-cal-today': cell === todayKey && selectedDate !== cell,
                    'ej-cal-selected': selectedDate === cell,
                  }"
                  :aria-label="`${cell} 的心情`"
                  @click="toggleDay(cell)"
                >
                  <span v-if="dayMoodKey(cell)" class="ej-cal-mood-dot" :style="{ backgroundColor: moodColor(dayMoodKey(cell)!) }"></span>
                  <span class="ej-cal-day-num">{{ Number(cell.slice(8)) }}</span>
                </button>
              </template>
            </div>
            <p class="ej-cal-hint">点击某一天可查看当天的记录</p>
          </template>
        </div>
      </section>

      <!-- ===== 记录列表 ===== -->
      <section class="ej-section">
        <div class="ej-section-head">
          <div>
            <p class="ej-section-label">记录</p>
            <h2 class="ej-section-title">{{ selectedDate ? `${selectedDate} 的记录` : '心情记录' }}</h2>
          </div>
          <button v-if="selectedDate" type="button" class="ej-clear-btn" @click="selectedDate = null">
            清除筛选
          </button>
        </div>

        <!-- 骨架屏 -->
        <div v-if="loading" class="ej-list-skeleton">
          <div v-for="i in 3" :key="i" class="ej-card-skel"></div>
        </div>

        <!-- 日记卡片 -->
        <div v-else-if="filteredJournals.length" class="ej-journal-list">
          <article
            v-for="journal in filteredJournals"
            :key="journal.id"
            class="ej-journal-card"
          >
            <div class="ej-card-left">
              <div class="ej-card-mood-orb" :style="{ '--mc': moodColor(journal.moodType), '--mb': moodBg(journal.moodType) }">
                <MoodFace :mood="journal.moodType" class="ej-card-mood-face" aria-hidden="true" />
              </div>
            </div>
            <div class="ej-card-body">
              <p class="ej-card-text">{{ journal.content }}</p>
              <div v-if="journal.feedback" class="ej-card-feedback">
                "{{ journal.feedback }}"
              </div>
              <div class="ej-card-meta">
                <span class="ej-card-tag" :style="{ '--tc': moodColor(journal.moodType), '--tb': moodBg(journal.moodType) }">
                  <span class="ej-tag-dot" :style="{ backgroundColor: moodColor(journal.moodType) }"></span>
                  {{ moodLabel(journal.moodType) }}
                </span>
                <span
                  v-if="journal.source === 'SELF_COACHING'"
                  class="ej-card-tag"
                  style="--tc:#1f6b52;--tb:rgba(31,107,82,0.12)"
                >
                  自我教练
                </span>
                <time class="ej-card-time">{{ new Date(journal.createdAt).toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }) }}</time>
              </div>
            </div>
            <button
              type="button"
              class="ej-card-delete"
              :aria-label="`删除这条日记`"
              @click="removeJournal(journal.id)"
            >
              <Trash :size="14" />
            </button>
          </article>
        </div>

        <div v-else class="ej-empty">
          <EmptyState
            :title="selectedDate ? '这一天还没有记录' : '还没有日记'"
            :hint="selectedDate ? '换一天看看，或写下这一天的感受。' : '写下第一条，观察自己的情绪变化。'"
          />
        </div>
      </section>

      <!-- ===== 近 30 天分布 ===== -->
      <section v-if="trend" class="ej-section">
        <div class="ej-section-head">
          <div>
            <p class="ej-section-label">统计</p>
            <h2 class="ej-section-title">近 30 天分布</h2>
          </div>
        </div>
        <div class="ej-trend-card">
          <div v-if="hasTrendData" class="ej-trend-list">
            <div v-for="mood in moods" :key="mood.key" class="ej-trend-row">
              <span class="ej-trend-name">
                <MoodFace :mood="mood.key" class="ej-trend-icon" />
                {{ mood.label }}
              </span>
              <div class="ej-trend-bar-wrap">
                <div class="ej-trend-bar-track">
                  <div class="ej-trend-bar-fill" :style="{ width: barWidth(trend.summary[mood.key] ?? 0), backgroundColor: mood.color }"></div>
                </div>
              </div>
              <span class="ej-trend-count">{{ trend.summary[mood.key] ?? 0 }}</span>
            </div>
          </div>
          <p v-else class="ej-trend-empty">近 30 天还没有记录，写下第一条开始观察变化。</p>
        </div>
      </section>

      <QuoteBlock
        label="今日一句"
        text="你愿意把情绪写下来，就已经在好好照顾自己了。"
        tone="gold"
        align="center"
        class="ej-quote"
      />
    </div>
  </div>
</template>

<style scoped>
/* ===== 布局容器 ===== */
.ej-page {
  position: relative;
  max-width: 1080px;
  margin: 0 auto;
  padding: 2.5rem 1rem;
}
@media (min-width: 768px) {
  .ej-page { padding: 4rem 1.5rem; }
}
.ej-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  opacity: 0.35;
}
.ej-glow-1 { width: 320px; height: 320px; right: -4rem; top: 0; background: radial-gradient(circle, #e7e2f1 0%, transparent 70%); }
.ej-glow-2 { width: 240px; height: 240px; left: -2rem; bottom: 10%; background: radial-gradient(circle, #f0e6f0 0%, transparent 70%); opacity: 0.25; }

.ej-inner { position: relative; z-index: 1; }

/* ===== 页头 ===== */
.ej-header { margin-bottom: 2rem; }
@media (min-width: 768px) { .ej-header { margin-bottom: 2.5rem; } }
.ej-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-pine); }
.ej-title { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; margin-top: 0.35rem; }
@media (min-width: 768px) { .ej-title { font-size: 2.25rem; } }
.ej-subtitle { font-size: 0.9rem; color: var(--color-ink-soft); line-height: 1.65; margin-top: 0.6rem; max-width: 46ch; }

/* ===== 记录卡 ===== */
.ej-write-card {
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 18px;
  padding: 1.75rem;
  box-shadow: 0 2px 20px rgba(107,91,149,0.04);
}
@media (min-width: 768px) { .ej-write-card { padding: 2rem; } }

/* 情绪选择器 */
.ej-mood-fieldset { border: none; padding: 0; margin: 0; }
.ej-mood-legend { font-size: 0.78rem; font-weight: 600; color: var(--color-ink-faint); margin-bottom: 0.85rem; letter-spacing: 0.03em; }
.ej-mood-bar { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.ej-mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  border: 1.5px solid transparent;
  background: var(--mood-bg, rgba(0,0,0,0.04));
  cursor: pointer;
  transition: all 0.22s ease;
  font-family: inherit;
}
.ej-mood-pill:hover { transform: translateY(-1px); box-shadow: 0 3px 12px rgba(0,0,0,0.06); }
.ej-mood-active { border-color: var(--mood-color); background: var(--mood-bg); }
.ej-mood-icon-wrap { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; }
.ej-mood-icon { width: 22px; height: 22px; }
.ej-mood-label { font-size: 0.82rem; font-weight: 600; color: var(--color-ink-soft); }
.ej-mood-active .ej-mood-label { color: var(--color-ink); }
.ej-mood-check { width: 17px; height: 17px; border-radius: 50%; background: var(--mood-color); color: #fff; display: flex; align-items: center; justify-content: center; margin-left: 2px; }

/* 输入区 */
.ej-input-wrap { margin-top: 1.25rem; }
.ej-textarea {
  width: 100%;
  min-height: 88px;
  padding: 0.9rem 1.1rem;
  border: 1.5px solid var(--color-hairline);
  border-radius: 13px;
  background: var(--color-paper);
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--color-ink);
  resize: none;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.ej-textarea::placeholder { color: var(--color-ink-faint); }
.ej-textarea:focus { border-color: var(--color-pine); box-shadow: 0 0 0 3px rgba(107,91,149,0.1); }
.ej-input-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 0.7rem; }
.ej-char-count { font-size: 0.75rem; color: var(--color-ink-faint); }
.ej-submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 38px;
  padding: 0 1.25rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #6b5b95, #7d6ba8);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 650;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  letter-spacing: 0.01em;
}
.ej-submit-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(107,91,149,0.3); }
.ej-submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* AI 回应 */
.ej-feedback {
  margin-top: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 13px;
  background: linear-gradient(135deg, rgba(107,91,149,0.07), rgba(107,91,149,0.03));
  border-left: 1px solid var(--color-pine);
}
.ej-feedback-text { font-size: 0.92rem; line-height: 1.68; color: var(--color-pine-deep); font-style: italic; }

/* ===== 区块通用 ===== */
.ej-section { margin-top: 2.5rem; }
@media (min-width: 768px) { .ej-section { margin-top: 3rem; } }
.ej-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.ej-section-label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-pine); opacity: 0.7; }
.ej-section-title { font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; margin-top: 0.2rem; }
@media (min-width: 768px) { .ej-section-title { font-size: 1.35rem; } }

/* 月历导航 */
.ej-month-nav { display: flex; align-items: center; gap: 0.35rem; }
.ej-nav-btn {
  width: 30px; height: 30px;
  border-radius: 50%;
  border: 1px solid var(--color-hairline);
  background: var(--color-card);
  display: flex; align-items: center; justify-content: center;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: all 0.15s;
}
.ej-nav-btn:hover { border-color: var(--color-pine); color: var(--color-pine); }
.ej-month-label { font-size: 0.82rem; font-weight: 600; min-width: 6rem; text-align: center; color: var(--color-ink); }

/* 日历卡片 */
.ej-calendar-card { background: var(--color-card); border: 1px solid var(--color-hairline); border-radius: 16px; padding: 1.25rem; }
@media (min-width: 768px) { .ej-calendar-card { padding: 1.5rem; } }
.ej-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; margin-bottom: 0.4rem; }
.ej-cal-wd { font-size: 0.72rem; font-weight: 600; color: var(--color-ink-faint); padding-bottom: 0.35rem; }
.ej-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.ej-cal-cell {
  aspect-ratio: 1;
  border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid transparent;
  position: relative;
  background: transparent;
  font-family: inherit;
}
.ej-cal-empty { background: none; }
.ej-cal-cell:hover:not(.ej-cal-empty) { background: var(--color-paper); }
.ej-cal-today { background: var(--color-pine-soft); }
.ej-cal-selected { background: var(--color-pine); box-shadow: 0 2px 8px rgba(107,91,149,0.2); }
.ej-cal-selected .ej-cal-day-num { color: #fff; }
.ej-cal-selected .ej-cal-mood-dot { opacity: 0.7; }
.ej-cal-mood-dot { width: 6px; height: 6px; border-radius: 50%; }
.ej-cal-day-num { font-size: 0.7rem; color: var(--color-ink-faint); line-height: 1; font-weight: 550; }
.ej-cal-today .ej-cal-day-num { color: var(--color-pine); font-weight: 700; }
.ej-cal-hint { margin-top: 0.75rem; font-size: 0.72rem; color: var(--color-ink-faint); text-align: center; }
.ej-cal-skeleton { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.ej-cal-dot-skel { aspect-ratio: 1; border-radius: 10px; background: var(--color-hairline); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }

.ej-clear-btn { font-size: 0.82rem; font-weight: 600; color: var(--color-pine); cursor: pointer; background: none; border: none; padding: 0.3rem 0.6rem; border-radius: 8px; transition: background 0.15s; }
.ej-clear-btn:hover { background: var(--color-pine-soft); }

/* ===== 日记卡片列表 ===== */
.ej-list-skeleton { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
.ej-card-skel { height: 120px; border-radius: 16px; background: var(--color-hairline); animation: pulse 1.4s ease-in-out infinite; }

.ej-journal-list { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.25rem; }

.ej-journal-card {
  display: flex; gap: 1.1rem; padding: 1.4rem;
  background: var(--color-card); border: 1px solid var(--color-hairline); border-radius: 16px;
  transition: box-shadow 0.2s, transform 0.2s; position: relative;
}
.ej-journal-card:hover { box-shadow: 0 4px 20px rgba(107,91,149,0.06); transform: translateY(-1px); }

.ej-card-left { flex-shrink: 0; }
.ej-card-mood-orb {
  width: 52px; height: 52px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--mb, rgba(0,0,0,0.04));
  border: 1.5px solid transparent;
  border-color: color-mix(in srgb, var(--mc, #6b5b95) 25%, transparent);
}
.ej-card-mood-face { width: 32px; height: 32px; }

.ej-card-body { flex: 1; min-width: 0; }
.ej-card-text { font-size: 0.94rem; line-height: 1.75; color: var(--color-ink); }
.ej-card-feedback { margin-top: 0.7rem; padding-left: 0.85rem; border-left: 2.5px solid var(--color-gold); font-size: 0.84rem; line-height: 1.62; color: var(--color-ink-soft); font-style: italic; opacity: 0.85; }
.ej-card-meta { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.85rem; flex-wrap: wrap; }
.ej-card-tag { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; background: var(--tb, rgba(0,0,0,0.04)); color: var(--tc, var(--color-ink)); }
.ej-tag-dot { width: 6px; height: 6px; border-radius: 50%; }
.ej-card-time { font-size: 0.72rem; color: var(--color-ink-faint); letter-spacing: 0.02em; }
.ej-card-delete { position: absolute; top: 0.85rem; right: 0.85rem; width: 28px; height: 28px; border-radius: 50%; border: none; background: transparent; color: var(--color-ink-faint); opacity: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.ej-journal-card:hover .ej-card-delete { opacity: 1; }
.ej-card-delete:hover { color: #dc2626; background: rgba(220,38,38,0.08); }

.ej-empty { margin-top: 2rem; }

/* ===== 分布图 ===== */
.ej-trend-card { background: var(--color-card); border: 1px solid var(--color-hairline); border-radius: 16px; padding: 1.4rem; }
.ej-trend-list { display: flex; flex-direction: column; gap: 0.85rem; }
.ej-trend-row { display: flex; align-items: center; gap: 0.75rem; font-size: 0.84rem; }
.ej-trend-name { width: 72px; flex-shrink: 0; display: flex; align-items: center; gap: 0.4rem; color: var(--color-ink-soft); font-weight: 550; }
.ej-trend-icon { width: 18px; height: 18px; }
.ej-trend-bar-wrap { flex: 1; }
.ej-trend-bar-track { height: 8px; border-radius: 999px; background: var(--color-paper); overflow: hidden; }
.ej-trend-bar-fill { height: 100%; border-radius: 999px; transition: transform 0.5s ease; transform-origin: left; }
.ej-trend-count { width: 24px; text-align: right; font-weight: 650; color: var(--color-ink-soft); font-size: 0.8rem; }
.ej-trend-empty { font-size: 0.86rem; color: var(--color-ink-soft); text-align: center; padding: 1.5rem 0; }

.ej-quote { margin-top: 2.5rem; }

@media (max-width: 640px) {
  .ej-mood-bar { gap: 0.4rem; }
  .ej-mood-pill { padding: 0.45rem 0.7rem; }
  .ej-mood-icon-wrap { width: 22px; height: 22px; }
  .ej-mood-icon { width: 18px; height: 18px; }
  .ej-journal-card { flex-direction: column; gap: 0.85rem; }
  .ej-card-delete { position: static; align-self: flex-end; opacity: 0.6; }
  .ej-trend-name { width: 60px; font-size: 0.78rem; }
}
</style>
