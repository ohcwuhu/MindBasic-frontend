<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhChartBar as ChartBar,
  PhUsers as Users,
  PhClipboardText as ClipboardText,
  PhArticle as Article,
  PhGridFour as GridFour,
  PhGearSix as GearSix,
  PhArrowLeft as ArrowLeft,
} from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import AdminOverview from './AdminOverview.vue'
import AdminUsers from './AdminUsers.vue'
import AdminAudits from './AdminAudits.vue'
import AdminArticles from './AdminArticles.vue'
import AdminContent from './AdminContent.vue'
import AdminConfig from './AdminConfig.vue'

type AdminTab = 'overview' | 'users' | 'audits' | 'articles' | 'content' | 'config'
const activeTab = ref<AdminTab>('overview')
const auth = useAuthStore()
const router = useRouter()

const navItems = [
  { key: 'overview', label: '概览', icon: ChartBar },
  { key: 'users', label: '用户管理', icon: Users },
  { key: 'audits', label: '教练审核', icon: ClipboardText },
  { key: 'articles', label: '文章管理', icon: Article },
  { key: 'content', label: '内容管理', icon: GridFour },
  { key: 'config', label: '平台配置', icon: GearSix },
] as const

const titles: Record<AdminTab, string> = {
  overview: '概览',
  users: '用户管理',
  audits: '教练审核',
  articles: '文章管理',
  content: '内容管理',
  config: '平台配置',
}
</script>

<template>
  <div class="min-h-[100dvh] md:grid md:grid-cols-[220px_1fr]">
    <aside class="hidden md:flex flex-col bg-card border-r border-hairline sticky top-16 h-[calc(100dvh-4rem)]">
      <div class="px-6 pt-8 pb-4">
        <p class="font-semibold tracking-tight">管理后台</p>
        <p class="catalog-tab mt-1">MindBasic Console</p>
      </div>
      <nav class="flex-1 px-3 space-y-1" aria-label="管理后台导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="w-full h-10 px-3 rounded-[10px] flex items-center gap-2.5 text-sm text-left pressable"
          :class="activeTab === item.key ? 'bg-pine-soft text-pine-deep font-medium' : 'text-ink-soft hover:bg-paper'"
          @click="activeTab = item.key"
        >
          <component :is="item.icon" :size="18" weight="duotone" />
          {{ item.label }}
        </button>
      </nav>
      <div class="p-4 border-t border-hairline">
        <button
          type="button"
          class="w-full h-10 px-3 rounded-[10px] flex items-center gap-2.5 text-sm text-ink-soft hover:bg-paper pressable"
          @click="router.push('/')"
        >
          <ArrowLeft :size="18" /> 返回前台
        </button>
        <p class="catalog-tab mt-3 px-3">{{ auth.user?.nickname }}</p>
      </div>
    </aside>

    <main class="min-w-0">
      <div class="md:hidden sticky top-14 z-30 bg-paper/95 backdrop-blur border-b border-hairline px-4 py-3 overflow-x-auto">
        <div class="flex gap-2 w-max">
          <button
            v-for="item in navItems"
            :key="item.key"
            type="button"
            class="h-9 px-4 rounded-full border text-sm whitespace-nowrap pressable"
            :class="activeTab === item.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
            @click="activeTab = item.key"
          >
            {{ item.label }}
          </button>
        </div>
      </div>

      <div class="max-w-[1000px] mx-auto px-4 md:px-8 py-8 md:py-12">
        <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">{{ titles[activeTab] }}</h1>
        <div class="mt-6">
          <AdminOverview v-if="activeTab === 'overview'" :go="(tab) => (activeTab = tab as AdminTab)" />
          <AdminUsers v-else-if="activeTab === 'users'" />
          <AdminAudits v-else-if="activeTab === 'audits'" />
          <AdminArticles v-else-if="activeTab === 'articles'" />
          <AdminContent v-else-if="activeTab === 'content'" />
          <AdminConfig v-else />
        </div>
      </div>
    </main>
  </div>
</template>
