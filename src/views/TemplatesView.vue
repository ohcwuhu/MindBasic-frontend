<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowRight as ArrowRight } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { CoachingTemplate } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

const templates = ref<CoachingTemplate[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const data = await get<{ items: CoachingTemplate[] }>('/self-coaching/templates')
    templates.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '模板加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-[760px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">SF 自我教练</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">选择一个此刻的场景</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      每个模板走同样的四步：现状、理想、资源、行动。不评判，不贴标签，只陪你把下一步想清楚。
    </p>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-4">
      <div v-for="i in 3" :key="i" class="h-32 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <div v-else class="mt-8 divide-y divide-hairline border-y border-hairline">
      <RouterLink
        v-for="(template, i) in templates"
        :key="template.id"
        :to="`/self-coaching/${template.id}`"
        class="group flex items-center justify-between gap-6 py-5"
      >
        <div class="flex items-start gap-4">
          <span
            class="mt-0.5 w-9 h-9 shrink-0 rounded-full flex items-center justify-center font-mono text-sm"
            :class="i % 2 === 0 ? 'bg-pine text-card' : 'bg-pine-soft text-pine'"
          >
            {{ String(i + 1).padStart(2, '0') }}
          </span>
          <div>
            <p class="font-medium group-hover:text-pine transition-colors">{{ template.name }}</p>
            <p v-if="template.description" class="mt-1 text-sm text-ink-soft">
              {{ template.description }}
            </p>
            <p class="catalog-tab mt-2">{{ template.steps.length }} 步流程</p>
          </div>
        </div>
        <ArrowRight :size="18" class="text-ink-faint shrink-0 group-hover:text-pine" />
      </RouterLink>
    </div>
  </div>
</template>
