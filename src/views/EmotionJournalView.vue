<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhCheck as Check, PhTrash as Trash } from '@phosphor-icons/vue'
import { del, get, post } from '@/api/client'
import type { EmotionJournal } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const moods = [
  { key: 'CALM', label: '平静', color: '#1f6b52' },
  { key: 'HAPPY', label: '开心', color: '#b06a1f' },
  { key: 'ANXIOUS', label: '焦虑', color: '#7a5c1f' },
  { key: 'DOWN', label: '低落', color: '#4b5563' },
  { key: 'IRRITATED', label: '烦躁', color: '#9a3b2e' },
  { key: 'OTHER', label: '其他', color: '#5b5b54' },
] as const

type MoodKey = (typeof moods)[number]['key']

const selectedMood = ref<MoodKey | null>(null)
const content = ref('')
const journals = ref<EmotionJournal[]>([])
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const lastFeedback = ref('')

async function load() {
  try {
    const data = await get<{ items: EmotionJournal[] }>('/emotion-journals?page=1&pageSize=50')
    journals.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '日记加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

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
    journals.value = [journal, ...journals.value]
    content.value = ''
    selectedMood.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败，请重试'
  } finally {
    submitting.value = false
  }
}

async function removeJournal(id: number) {
  try {
    await del(`/emotion-journals/${id}`)
    journals.value = journals.value.filter((j) => j.id !== id)
  } catch {
    error.value = '删除失败，请重试'
  }
}

function moodLabel(key: string): string {
  return moods.find((m) => m.key === key)?.label ?? key
}
</script>

<template>
  <div class="max-w-[680px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">EJ 情绪日记</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">把此刻写下来</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      选择一种感受，写一句话。我们会回你一句资源导向的回应，不评判，也不定义。
    </p>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <form class="card mt-8 p-5 md:p-8" @submit.prevent="submit">
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="选择情绪">
        <button
          v-for="mood in moods"
          :key="mood.key"
          type="button"
          class="h-10 px-4 rounded-full border text-sm transition-colors pressable"
          :class="
            selectedMood === mood.key
              ? 'border-transparent text-card'
              : 'border-hairline bg-card text-ink-soft hover:border-ink-faint'
          "
          :style="selectedMood === mood.key ? { backgroundColor: mood.color } : undefined"
          @click="selectedMood = mood.key"
        >
          {{ mood.label }}
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
      <h2 class="text-lg font-semibold tracking-tight">我的记录</h2>
      <div v-if="loading" class="mt-5 space-y-3">
        <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
      </div>
      <div v-else-if="journals.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="journal in journals" :key="journal.id" class="py-4 flex gap-4">
          <span
            class="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: moods.find((m) => m.key === journal.moodType)?.color }"
            :aria-label="`情绪：${moodLabel(journal.moodType)}`"
          ></span>
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
        <EmptyState title="还没有日记" hint="写下第一条，观察自己的情绪变化。" />
      </div>
    </section>
  </div>
</template>
