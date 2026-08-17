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
import CompanionDock from '@/components/ui/CompanionDock.vue'

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
  { to: '/communities', label: '社群' },
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
    const [notif, chat] = await Promise.all([
      get<{ count: number }>('/notifications/unread-count'),
      get<{ count: number }>('/chat/unread-count'),
    ])
    unread.value = (notif?.count ?? 0) + (chat?.count ?? 0)
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
    'forgot-password': '找回密码',
    'self-coaching': '自我教练',
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

/* 全屏沉浸式页面：不显示 Footer 和底部导航 */
const isFullScreenPage = computed(() => {
  return ['/self-coaching'].some(p => route.path.startsWith(p)) ||
         route.path.startsWith('/chat/')
})

/* ===== 日 / 夜 主题切换（静谧紫夜模式）===== */
const theme = ref<'light' | 'dark'>('light')
function applyTheme() {
  const t = theme.value
  document.documentElement.setAttribute('data-theme', t)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#1a1722' : '#ebe9e2')
  try {
    localStorage.setItem('mb-theme', t)
  } catch {
    /* ignore */
  }
}
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme()
}
onMounted(() => {
  // 与 index.html 防闪烁脚本保持一致：以 DOM 上的 data-theme 为准
  const current = document.documentElement.getAttribute('data-theme')
  if (current === 'dark' || current === 'light') theme.value = current
  applyTheme()
})
</script>

<template>
  <div class="min-h-[100dvh] flex flex-col overflow-x-clip">
    <!-- 全局氛围：呼吸涟漪（签名符号）+ 缓慢呼吸的暖光球，给页面一层被环抱的安定感（纯装饰） -->
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <svg class="ripple-mark absolute -left-10 -bottom-10 w-[34rem] h-[34rem]" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="42" stroke="currentColor" stroke-width="1.2" />
        <circle cx="100" cy="100" r="66" stroke="currentColor" stroke-width="1" opacity="0.7" />
        <circle cx="100" cy="100" r="90" stroke="currentColor" stroke-width="0.9" opacity="0.5" />
      </svg>
      <div class="breath-orb w-[42rem] h-[42rem] -left-24 -top-32 opacity-40"></div>
      <div class="breath-orb slow w-[30rem] h-[30rem] right-[-7rem] top-1/3 opacity-30"></div>
    </div>
    <header class="hidden md:block border-b border-hairline bg-paper/90 backdrop-blur sticky top-0 z-40">
      <div class="max-w-[1080px] mx-auto px-6 h-16 flex items-center justify-between">
          <RouterLink to="/" class="flex items-center gap-2.5">
            <span class="brand-mark brand-mark-lg" aria-hidden="true">
              <span class="dot"></span>
            </span>
            <span class="font-semibold tracking-tight">MindBasic</span>
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
        <button
          class="theme-toggle"
          type="button"
          @click="toggleTheme"
          :aria-label="theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="label">{{ theme === 'dark' ? '日间' : '夜间' }}</span>
        </button>
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
              class="cta-gold text-sm font-medium text-card bg-pine hover:bg-pine-deep rounded-full px-4 py-2 transition-colors"
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
            <span class="brand-mark brand-mark-sm" aria-hidden="true">
              <span class="dot"></span>
            </span>
            {{ pageTitle }}
          </RouterLink>
        <button
          class="theme-toggle !h-8 !px-3 !text-xs"
          type="button"
          @click="toggleTheme"
          :aria-label="theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'"
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="label">{{ theme === 'dark' ? '日间' : '夜间' }}</span>
        </button>
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
      v-if="platform && route.path === '/'"
      class="bg-card border-t border-hairline"
    >
      <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-8 md:py-10 pb-24 md:pb-10">
        <div class="flex items-start gap-6 flex-wrap">
          <div class="flex items-center gap-3">
            <span class="brand-mark brand-mark-lg" aria-hidden="true">
              <span class="dot"></span>
            </span>
            <div>
              <p class="font-semibold tracking-tight">{{ platform.platformName }}</p>
              <p class="mt-0.5 text-[12px] text-ink-faint font-serif tracking-wide">
                心理教练成长服务平台
              </p>
            </div>
          </div>
          <div class="flex-1 min-w-[240px]">
            <p class="text-xs text-ink-faint leading-relaxed">
              <span class="font-medium text-ink-soft">心理援助热线</span>：{{ platform.hotline }}
            </p>
            <p class="mt-1 text-xs text-ink-faint leading-relaxed">{{ platform.emergencyHint }}</p>
            <p class="mt-2 text-[11.5px] text-ink-faint leading-relaxed opacity-80">
              {{ platform.disclaimer }}
            </p>
          </div>
        </div>
      </div>
    </footer>

    <nav
      v-if="!isFullScreenPage"
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

    <!-- 右下角陪伴坞（全局悬浮交互区，沉浸页面由页面内角色接管） -->
    <CompanionDock v-if="!isFullScreenPage" />
  </div>
</template>
