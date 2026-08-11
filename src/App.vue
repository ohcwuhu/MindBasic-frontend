<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { get } from '@/api/client'
import type { PublicPlatformConfig } from '@/api/types'
import {
  PhHouse as House,
  PhCardsThree as CardsThree,
  PhChartLineUp as ChartLineUp,
  PhBookOpenText as BookOpenText,
  PhUserCircle as UserCircle,
  PhBell as Bell,
} from '@phosphor-icons/vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const unread = ref(0)
const platform = ref<PublicPlatformConfig | null>(null)

const navLinks = [
  { to: '/', label: '首页' },
  { to: '/self-coaching', label: '自我教练' },
  { to: '/emotion-journal', label: '情绪日记' },
  { to: '/coaches', label: '找教练' },
  { to: '/articles', label: '科普' },
]

const tabItems = [
  { to: '/', label: '首页', icon: House },
  { to: '/coaches', label: '教练', icon: CardsThree },
  { to: '/my', label: '我的成长', icon: ChartLineUp },
  { to: '/articles', label: '科普', icon: BookOpenText },
]

const isActive = (to: string) => route.path === to || (to !== '/' && route.path.startsWith(to))

function onLogoutEvent() {
  auth.logout()
  router.push({ name: 'login' })
}

async function refreshUnread() {
  if (!auth.isLoggedIn) {
    unread.value = 0
    return
  }
  try {
    unread.value = (await get<{ count: number }>('/notifications/unread-count')).count
  } catch {
    unread.value = 0
  }
}

onMounted(() => {
  window.addEventListener('mb:logout', onLogoutEvent)
  refreshUnread()
  get<PublicPlatformConfig>('/platform/config')
    .then((data) => (platform.value = data))
    .catch(() => (platform.value = null))
})
onUnmounted(() => window.removeEventListener('mb:logout', onLogoutEvent))
watch(() => route.fullPath, refreshUnread)

const pageTitle = computed(() => {
  const map: Record<string, string> = {
    home: 'MindBasic',
    login: '登录',
    register: '注册',
    templates: '自我教练',
    'coach-flow': '自我教练',
    'emotion-journal': '情绪日记',
    coaches: '找教练',
    'coach-detail': '教练详情',
    booking: '预约教练',
    articles: '科普中心',
    'article-detail': '文章',
    my: '我的成长',
    profile: '个人资料',
  }
  return map[String(route.name)] ?? 'MindBasic'
})
</script>

<template>
  <div class="min-h-[100dvh] flex flex-col">
    <header class="hidden md:block border-b border-hairline bg-paper/90 backdrop-blur sticky top-0 z-40">
      <div class="max-w-[1100px] mx-auto px-6 h-16 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-full bg-pine flex items-center justify-center">
            <span class="w-2.5 h-2.5 bg-card rounded-[2px]" aria-hidden="true"></span>
          </span>
          <span class="font-semibold tracking-tight">MindBasic</span>
          <span class="catalog-tab hidden lg:inline">成长服务目录</span>
        </RouterLink>
        <nav class="flex items-center gap-6" aria-label="主导航">
          <RouterLink
            v-for="item in navLinks"
            :key="item.to"
            :to="item.to"
            class="text-sm transition-colors"
            :class="isActive(item.to) ? 'text-pine font-medium' : 'text-ink-soft hover:text-ink'"
          >
            {{ item.label }}
          </RouterLink>
        </nav>
        <div class="flex items-center gap-3">
          <template v-if="auth.isLoggedIn">
            <RouterLink to="/my" class="text-sm text-ink-soft hover:text-ink">我的成长</RouterLink>
            <RouterLink v-if="auth.user?.role === 'ADMIN'" to="/admin" class="text-sm text-ink-soft hover:text-ink">
              管理后台
            </RouterLink>
            <RouterLink to="/notifications" class="relative text-ink-soft hover:text-ink" aria-label="通知">
              <Bell :size="20" weight="duotone" />
              <span
                v-if="unread > 0"
                class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-pine text-card text-[10px] flex items-center justify-center"
              >
                {{ unread > 99 ? '99+' : unread }}
              </span>
            </RouterLink>
            <RouterLink
              to="/profile"
              class="w-8 h-8 rounded-full bg-pine-soft text-pine flex items-center justify-center"
              :aria-label="`个人资料：${auth.user?.nickname ?? ''}`"
            >
              <UserCircle :size="20" weight="duotone" />
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/login" class="text-sm text-ink-soft hover:text-ink">登录</RouterLink>
            <RouterLink
              to="/register"
              class="text-sm font-medium text-card bg-pine hover:bg-pine-deep rounded-full px-4 py-2 transition-colors"
            >
              免费注册
            </RouterLink>
          </template>
        </div>
      </div>
    </header>

    <header class="md:hidden sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-hairline">
      <div class="h-14 px-4 flex items-center justify-between">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold tracking-tight">
          <span class="w-6 h-6 rounded-full bg-pine flex items-center justify-center">
            <span class="w-2 h-2 bg-card rounded-[2px]" aria-hidden="true"></span>
          </span>
          {{ pageTitle }}
        </RouterLink>
        <RouterLink
          v-if="auth.isLoggedIn"
          to="/notifications"
          class="relative w-8 h-8 rounded-full flex items-center justify-center text-ink-soft"
          aria-label="通知"
        >
          <Bell :size="20" weight="duotone" />
          <span
            v-if="unread > 0"
            class="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-pine text-card text-[10px] flex items-center justify-center"
          >
            {{ unread > 99 ? '99+' : unread }}
          </span>
        </RouterLink>
        <RouterLink
          v-if="auth.isLoggedIn"
          to="/profile"
          class="w-8 h-8 rounded-full bg-pine-soft text-pine flex items-center justify-center"
          aria-label="个人资料"
        >
          <UserCircle :size="20" weight="duotone" />
        </RouterLink>
        <RouterLink v-else to="/login" class="text-sm text-pine font-medium">登录</RouterLink>
      </div>
    </header>

    <main class="flex-1 pb-20 md:pb-0">
      <RouterView />
    </main>

    <footer
      v-if="platform"
      class="bg-card border-t border-hairline"
    >
      <div class="max-w-[1100px] mx-auto px-4 md:px-6 py-6 md:py-8 pb-24 md:pb-8">
        <p class="text-sm font-medium text-ink-soft">{{ platform.platformName }}</p>
        <p class="mt-2 text-xs text-ink-faint leading-relaxed">
          心理援助热线：{{ platform.hotline }} —— {{ platform.emergencyHint }}
        </p>
        <p class="mt-1.5 text-xs text-ink-faint leading-relaxed">{{ platform.disclaimer }}</p>
      </div>
    </footer>

    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-hairline"
      aria-label="底部导航"
    >
      <div class="grid grid-cols-4 h-16">
        <RouterLink
          v-for="item in tabItems"
          :key="item.to"
          :to="item.to"
          class="flex flex-col items-center justify-center gap-1"
          :class="isActive(item.to) ? 'text-pine' : 'text-ink-faint'"
        >
          <component :is="item.icon" :size="22" weight="duotone" />
          <span class="text-[11px]">{{ item.label }}</span>
        </RouterLink>
      </div>
    </nav>
  </div>
</template>
