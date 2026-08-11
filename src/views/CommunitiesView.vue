<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { PhUsers as UsersIcon, PhMagnifyingGlass as MagnifyingGlass } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { CommunityBrief } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import EmptyState from '@/components/EmptyState.vue'

const keyword = ref('')
const mineOnly = ref(false)
const communities = ref<CommunityBrief[]>([])
const loading = ref(true)
const error = ref('')

const coverGradients = [
  'linear-gradient(135deg, #1f6b52 0%, #7fb096 100%)',
  'linear-gradient(135deg, #7a5c1f 0%, #c4b183 100%)',
  'linear-gradient(135deg, #4b5563 0%, #98a1ab 100%)',
  'linear-gradient(135deg, #9a3b2e 0%, #d6a49c 100%)',
  'linear-gradient(135deg, #5b5b54 0%, #a9a59d 100%)',
]

function coverStyle(id: number) {
  return { background: coverGradients[id % coverGradients.length] }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    if (mineOnly.value) {
      const data = await get<{ items: CommunityBrief[] }>('/communities/mine')
      communities.value = data.items
    } else {
      const params = new URLSearchParams({ page: '1', pageSize: '50' })
      if (keyword.value) params.set('keyword', keyword.value)
      const data = await get<{ items: CommunityBrief[] }>(`/communities?${params.toString()}`)
      communities.value = data.items
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '社群加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">CM 社群</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">找到同路的伙伴</h1>
    <p class="mt-3 text-sm md:text-[15px] text-ink-soft leading-relaxed max-w-[52ch]">
      主题社群由已审核教练带队或自由运营，大家在这里分享经验、互相陪伴。
    </p>

    <div class="mt-8 flex items-center gap-2 max-w-[560px] mx-auto">
      <label class="relative flex-1">
        <MagnifyingGlass :size="18" class="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索社群"
          class="w-full h-11 pl-11 pr-4 rounded-full bg-paper border border-hairline text-sm outline-none focus:border-pine"
          @keyup.enter="mineOnly = false; load()"
        />
      </label>
      <button
        type="button"
        class="h-11 px-5 rounded-full text-sm font-medium pressable"
        :class="mineOnly ? 'bg-pine text-card' : 'bg-paper border border-hairline text-ink-soft'"
        @click="mineOnly = !mineOnly; load()"
      >
        我加入的
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />

    <div v-if="loading" class="mt-6 space-y-3">
      <div v-for="i in 4" :key="i" class="h-28 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <div v-else-if="communities.length" class="mt-6 space-y-3">
      <RouterLink
        v-for="community in communities"
        :key="community.id"
        :to="`/communities/${community.id}`"
        class="card p-4 flex items-center gap-3 pressable group"
      >
        <span
          class="w-12 h-12 rounded-2xl text-card text-lg font-semibold flex items-center justify-center shrink-0"
          :style="coverStyle(community.id)"
        >
          {{ community.name.slice(0, 1) }}
        </span>
        <div class="flex-1 min-w-0">
          <p class="font-semibold tracking-tight">{{ community.name }}</p>
          <p class="mt-0.5 text-sm text-ink-soft leading-relaxed line-clamp-1">{{ community.description }}</p>
          <p class="catalog-tab mt-1 inline-flex items-center gap-1">
            <UsersIcon :size="13" /> {{ community.memberCount }} 人
            <span v-if="community.coachNickname"> · {{ community.coachNickname }} 带队</span>
          </p>
        </div>
        <span
          v-if="community.joined"
          class="shrink-0 text-xs px-2.5 py-1 rounded-full bg-pine-soft text-pine-deep"
        >
          已加入
        </span>
      </RouterLink>
    </div>
    <EmptyState
      v-else
      class="mt-6"
      title="没有找到社群"
      :hint="mineOnly ? '加入感兴趣的社群后会出现在这里。' : '换个关键词试试。'"
    />
  </div>
</template>
