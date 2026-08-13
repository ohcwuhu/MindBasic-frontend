import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue') },
    { path: '/register', name: 'register', component: () => import('@/views/RegisterView.vue') },
    { path: '/forgot-password', name: 'forgot-password', component: () => import('@/views/ForgotPasswordView.vue') },
    { path: '/self-coaching', name: 'templates', component: () => import('@/views/TemplatesView.vue'), meta: { auth: true } },
    { path: '/self-coaching/:id', name: 'coach-flow', component: () => import('@/views/CoachFlowView.vue'), meta: { auth: true } },
    { path: '/self-coaching/records/:id', name: 'self-coaching-record', component: () => import('@/views/SelfCoachingRecordDetailView.vue'), meta: { auth: true } },
    { path: '/emotion-journal', name: 'emotion-journal', component: () => import('@/views/EmotionJournalView.vue'), meta: { auth: true } },
    { path: '/coaches', name: 'coaches', component: () => import('@/views/CoachesView.vue') },
    { path: '/coaches/:id', name: 'coach-detail', component: () => import('@/views/CoachDetailView.vue') },
    { path: '/coaches/:id/book', name: 'booking', component: () => import('@/views/BookingView.vue'), meta: { auth: true } },
    { path: '/articles', name: 'articles', component: () => import('@/views/ArticlesView.vue') },
    { path: '/articles/:id', name: 'article-detail', component: () => import('@/views/ArticleDetailView.vue') },
    { path: '/my', name: 'my', component: () => import('@/views/MyGrowthView.vue'), meta: { auth: true } },
    { path: '/profile', name: 'profile', component: () => import('@/views/ProfileView.vue'), meta: { auth: true } },
    { path: '/notifications', name: 'notifications', component: () => import('@/views/NotificationsView.vue'), meta: { auth: true } },
    { path: '/growth-assessment', name: 'growth-assessment', component: () => import('@/views/GrowthAssessmentView.vue'), meta: { auth: true } },
    { path: '/communities', name: 'communities', component: () => import('@/views/CommunitiesView.vue') },
    { path: '/communities/:id', name: 'community-detail', component: () => import('@/views/CommunityDetailView.vue') },
    { path: '/communities/:communityId/posts/:postId', name: 'community-post-detail', component: () => import('@/views/CommunityPostDetailView.vue'), meta: { auth: true } },
    { path: '/coach', name: 'coach-workbench', component: () => import('@/views/CoachWorkbenchView.vue'), meta: { auth: true } },
    { path: '/ai-lab', name: 'ai-lab', component: () => import('@/views/AiLabView.vue') },
    { path: '/admin', name: 'admin', component: () => import('@/views/admin/AdminConsoleView.vue'), meta: { auth: true, admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) {
    await auth.fetchMe()
    auth.initialized = true
  }
  if (to.meta.auth && !auth.isLoggedIn) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && auth.user?.role !== 'ADMIN') {
    return { name: 'home' }
  }
  return true
})
