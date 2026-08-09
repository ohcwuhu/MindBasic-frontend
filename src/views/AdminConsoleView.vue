<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  PhChartBar as ChartBar,
  PhUsers as Users,
  PhClipboardText as ClipboardText,
  PhArticle as Article,
  PhFolderSimple as Folder,
  PhImages as Images,
  PhTag as Tag,
  PhChatCircleText as Chat,
  PhPlus as Plus,
  PhTrash as Trash,
  PhCheck as Check,
  PhX as X,
  PhEye as Eye,
} from '@phosphor-icons/vue'
import { ApiError, del, get, patch, post } from '@/api/client'
import type {
  AdminStats,
  AdminUser,
  ArticleAdmin,
  AuditDetail,
  AuditItem,
  BannerAdmin,
  CategoryAdmin,
  FeedbackAdmin,
  TagAdmin,
} from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'
import EmptyState from '@/components/EmptyState.vue'

type AdminTab =
  | 'overview'
  | 'users'
  | 'audits'
  | 'articles'
  | 'categories'
  | 'banners'
  | 'tags'
  | 'feedback'

const activeTab = ref<AdminTab>('overview')
const error = ref('')
const loading = ref(false)

async function run(task: () => Promise<void>) {
  error.value = ''
  loading.value = true
  try {
    await task()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    loading.value = false
  }
}

// ---------- 概览 ----------
const stats = ref<AdminStats | null>(null)

async function loadStats() {
  stats.value = await get<AdminStats>('/admin/stats')
}

// ---------- 用户 ----------
const users = ref<AdminUser[]>([])
const userKeyword = ref('')
const userStatus = ref('')

async function loadUsers() {
  const params = new URLSearchParams({ page: '1', pageSize: '50' })
  if (userKeyword.value) params.set('keyword', userKeyword.value)
  if (userStatus.value) params.set('status', userStatus.value)
  const data = await get<{ items: AdminUser[] }>(`/admin/users?${params.toString()}`)
  users.value = data.items
}

async function toggleUser(user: AdminUser) {
  await run(async () => {
    await patch(`/admin/users/${user.id}/status`, { status: user.isDisabled ? 'ENABLED' : 'DISABLED' })
    await loadUsers()
  })
}

// ---------- 教练审核 ----------
const audits = ref<AuditItem[]>([])
const auditStatus = ref('PENDING')
const auditDetail = ref<AuditDetail | null>(null)
const expandedAuditId = ref<number | null>(null)
const rejectReason = ref('')

async function loadAudits() {
  const data = await get<{ items: AuditItem[] }>(
    `/admin/coach-audits?status=${auditStatus.value}&page=1&pageSize=50`,
  )
  audits.value = data.items
}

async function expandAudit(id: number) {
  if (expandedAuditId.value === id) {
    expandedAuditId.value = null
    auditDetail.value = null
    return
  }
  expandedAuditId.value = id
  auditDetail.value = null
  await run(async () => {
    auditDetail.value = await get<AuditDetail>(`/admin/coach-audits/${id}`)
  })
}

async function approveAudit(id: number) {
  await run(async () => {
    await post(`/admin/coach-audits/${id}/approve`)
    expandedAuditId.value = null
    auditDetail.value = null
    await loadAudits()
  })
}

async function rejectAudit(id: number) {
  if (!rejectReason.value.trim()) {
    error.value = '请填写驳回理由'
    return
  }
  await run(async () => {
    await post(`/admin/coach-audits/${id}/reject`, { reason: rejectReason.value.trim() })
    rejectReason.value = ''
    expandedAuditId.value = null
    auditDetail.value = null
    await loadAudits()
  })
}

async function previewFile(url: string) {
  try {
    const token = localStorage.getItem('mb_access_token')
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!resp.ok) throw new Error()
    const blob = await resp.blob()
    window.open(URL.createObjectURL(blob), '_blank')
  } catch {
    error.value = '文件预览失败'
  }
}

// ---------- 文章 ----------
const articles = ref<ArticleAdmin[]>([])
const articleFilter = ref('')
const articleForm = ref({
  id: 0,
  title: '',
  summary: '',
  content: '',
  coverUrl: '',
  categoryId: '' as string,
  isPinned: false,
  status: 'DRAFT' as 'PUBLISHED' | 'DRAFT' | 'OFFLINE',
})
const categories = ref<CategoryAdmin[]>([])

async function loadArticles() {
  const params = new URLSearchParams({ page: '1', pageSize: '50' })
  if (articleFilter.value) params.set('status', articleFilter.value)
  const data = await get<{ items: ArticleAdmin[] }>(`/admin/articles?${params.toString()}`)
  articles.value = data.items
}

async function loadCategories() {
  const data = await get<{ items: CategoryAdmin[] }>('/admin/article-categories')
  categories.value = data.items
}

function resetArticleForm() {
  articleForm.value = {
    id: 0,
    title: '',
    summary: '',
    content: '',
    coverUrl: '',
    categoryId: '',
    isPinned: false,
    status: 'DRAFT',
  }
}

function editArticle(article: ArticleAdmin) {
  articleForm.value = {
    id: article.id,
    title: article.title,
    summary: article.summary ?? '',
    content: article.content,
    coverUrl: article.coverUrl ?? '',
    categoryId: article.categoryId ? String(article.categoryId) : '',
    isPinned: article.isPinned,
    status: article.status,
  }
}

async function saveArticle() {
  if (!articleForm.value.title.trim() || !articleForm.value.content.trim()) {
    error.value = '标题和正文不能为空'
    return
  }
  const payload = {
    title: articleForm.value.title.trim(),
    summary: articleForm.value.summary || null,
    content: articleForm.value.content,
    coverUrl: articleForm.value.coverUrl || null,
    categoryId: articleForm.value.categoryId ? Number(articleForm.value.categoryId) : null,
    isPinned: articleForm.value.isPinned,
    status: articleForm.value.status,
  }
  await run(async () => {
    if (articleForm.value.id) {
      await patch(`/admin/articles/${articleForm.value.id}`, payload)
    } else {
      await post('/admin/articles', payload)
    }
    resetArticleForm()
    await loadArticles()
  })
}

async function removeArticle(id: number) {
  await run(async () => {
    await del(`/admin/articles/${id}`)
    await loadArticles()
  })
}

// ---------- 分类 ----------
const newCategory = ref('')

async function createCategory() {
  if (!newCategory.value.trim()) return
  await run(async () => {
    await post('/admin/article-categories', { name: newCategory.value.trim() })
    newCategory.value = ''
    await loadCategories()
  })
}

async function toggleCategory(category: CategoryAdmin) {
  await run(async () => {
    await patch(`/admin/article-categories/${category.id}`, { isEnabled: !category.isEnabled })
    await loadCategories()
  })
}

async function removeCategory(id: number) {
  await run(async () => {
    await del(`/admin/article-categories/${id}`)
    await loadCategories()
  })
}

// ---------- 轮播图 ----------
const banners = ref<BannerAdmin[]>([])
const bannerForm = ref({ title: '', imageUrl: '', linkType: 'NONE' as string, linkValue: '', sortOrder: '0' })

async function loadBanners() {
  const data = await get<{ items: BannerAdmin[] }>('/admin/banners')
  banners.value = data.items
}

async function createBanner() {
  if (!bannerForm.value.title.trim() || !bannerForm.value.imageUrl.trim()) {
    error.value = '标题与图片地址必填'
    return
  }
  await run(async () => {
    await post('/admin/banners', {
      title: bannerForm.value.title.trim(),
      imageUrl: bannerForm.value.imageUrl.trim(),
      linkType: bannerForm.value.linkType,
      linkValue: bannerForm.value.linkValue || null,
      sortOrder: Number(bannerForm.value.sortOrder) || 0,
    })
    bannerForm.value = { title: '', imageUrl: '', linkType: 'NONE', linkValue: '', sortOrder: '0' }
    await loadBanners()
  })
}

async function toggleBanner(banner: BannerAdmin) {
  await run(async () => {
    await patch(`/admin/banners/${banner.id}`, { isEnabled: !banner.isEnabled })
    await loadBanners()
  })
}

async function removeBanner(id: number) {
  await run(async () => {
    await del(`/admin/banners/${id}`)
    await loadBanners()
  })
}

// ---------- 标签 ----------
const tags = ref<TagAdmin[]>([])
const tagType = ref('')
const newTag = ref('')

async function loadTags() {
  const data = await get<{ items: TagAdmin[] }>(`/admin/tags${tagType.value ? `?type=${tagType.value}` : ''}`)
  tags.value = data.items
}

async function createTag() {
  if (!newTag.value.trim() || !tagType.value) {
    error.value = '请选择标签类型并填写名称'
    return
  }
  await run(async () => {
    await post('/admin/tags', { name: newTag.value.trim(), type: tagType.value })
    newTag.value = ''
    await loadTags()
  })
}

async function removeTag(id: number) {
  await run(async () => {
    await del(`/admin/tags/${id}`)
    await loadTags()
  })
}

// ---------- 话术库 ----------
const feedbackItems = ref<FeedbackAdmin[]>([])
const feedbackMood = ref('')
const newFeedback = ref('')

async function loadFeedback() {
  const data = await get<{ items: FeedbackAdmin[] }>(
    `/admin/feedback-lib${feedbackMood.value ? `?moodType=${feedbackMood.value}` : ''}`,
  )
  feedbackItems.value = data.items
}

async function createFeedback() {
  if (!newFeedback.value.trim() || !feedbackMood.value) {
    error.value = '请选择情绪并填写话术'
    return
  }
  await run(async () => {
    await post('/admin/feedback-lib', { moodType: feedbackMood.value, content: newFeedback.value.trim() })
    newFeedback.value = ''
    await loadFeedback()
  })
}

async function toggleFeedback(item: FeedbackAdmin) {
  await run(async () => {
    await patch(`/admin/feedback-lib/${item.id}`, { isEnabled: !item.isEnabled })
    await loadFeedback()
  })
}

async function removeFeedback(id: number) {
  await run(async () => {
    await del(`/admin/feedback-lib/${id}`)
    await loadFeedback()
  })
}

const moodLabels: Record<string, string> = {
  CALM: '平静',
  HAPPY: '开心',
  ANXIOUS: '焦虑',
  DOWN: '低落',
  IRRITATED: '烦躁',
  OTHER: '其他',
}

const statusLabel: Record<string, string> = {
  PUBLISHED: '已发布',
  DRAFT: '草稿',
  OFFLINE: '已下线',
}

async function switchTab(tab: AdminTab) {
  activeTab.value = tab
  error.value = ''
  await run(async () => {
    if (tab === 'overview') await loadStats()
    else if (tab === 'users') await loadUsers()
    else if (tab === 'audits') await loadAudits()
    else if (tab === 'articles') {
      await Promise.all([loadArticles(), loadCategories()])
    } else if (tab === 'categories') await loadCategories()
    else if (tab === 'banners') await loadBanners()
    else if (tab === 'tags') await loadTags()
    else await loadFeedback()
  })
}

onMounted(() => switchTab('overview'))
</script>

<template>
  <div class="max-w-[1000px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">ADMIN 管理后台</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">管理后台</h1>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />

    <div class="mt-6 flex flex-wrap gap-2">
      <button
        v-for="tab in [
          { key: 'overview', label: '概览', icon: ChartBar },
          { key: 'users', label: '用户管理', icon: Users },
          { key: 'audits', label: '教练审核', icon: ClipboardText },
          { key: 'articles', label: '文章管理', icon: Article },
          { key: 'categories', label: '分类', icon: Folder },
          { key: 'banners', label: '轮播图', icon: Images },
          { key: 'tags', label: '标签', icon: Tag },
          { key: 'feedback', label: '话术库', icon: Chat },
        ] as const"
        :key="tab.key"
        type="button"
        class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm pressable"
        :class="activeTab === tab.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab(tab.key)"
      >
        <component :is="tab.icon" :size="16" weight="duotone" /> {{ tab.label }}
      </button>
    </div>

    <div v-if="loading" class="mt-8 h-72 rounded-[14px] bg-hairline/60 animate-pulse"></div>

    <!-- 概览 -->
    <section v-else-if="activeTab === 'overview' && stats" class="mt-8">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="item in [
          { label: '用户数', value: stats.userCount },
          { label: '教练数', value: stats.coachCount },
          { label: '已审核教练', value: stats.approvedCoachCount },
          { label: '预约数', value: stats.appointmentCount },
          { label: '待处理预约', value: stats.pendingAppointmentCount },
          { label: '已发布文章', value: stats.articleCount },
          { label: '今日新增用户', value: stats.todayUserCount },
          { label: '今日新增预约', value: stats.todayAppointmentCount },
        ]" :key="item.label" class="card p-4">
          <p class="text-2xl font-semibold text-pine">{{ item.value }}</p>
          <p class="catalog-tab mt-1">{{ item.label }}</p>
        </div>
      </div>
    </section>

    <!-- 用户 -->
    <section v-else-if="activeTab === 'users'" class="mt-8">
      <div class="flex flex-wrap gap-2 items-end">
        <div class="w-full md:w-64">
          <FieldInput v-model="userKeyword" label="搜索（手机号/昵称）" placeholder="输入关键词" />
        </div>
        <select v-model="userStatus" class="h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" @change="loadUsers">
          <option value="">全部状态</option>
          <option value="ENABLED">正常</option>
          <option value="DISABLED">已禁用</option>
        </select>
        <button type="button" class="h-12 px-6 rounded-full bg-pine text-card text-sm pressable" @click="loadUsers">查询</button>
      </div>
      <div v-if="users.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="user in users" :key="user.id" class="py-4 flex items-center justify-between gap-4">
          <div>
            <p class="font-medium">{{ user.nickname }} <span class="catalog-tab">{{ user.role }}</span></p>
            <p class="mt-1 text-sm text-ink-soft">{{ user.phone }} · 注册于 {{ new Date(user.createdAt).toLocaleDateString('zh-CN') }}</p>
          </div>
          <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
            :class="user.isDisabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
            @click="toggleUser(user)">
            {{ user.isDisabled ? '启用' : '禁用' }}
          </button>
        </div>
      </div>
      <EmptyState v-else class="mt-5" title="没有匹配的用户" />
    </section>

    <!-- 教练审核 -->
    <section v-else-if="activeTab === 'audits'" class="mt-8">
      <div class="flex flex-wrap gap-2">
        <button v-for="s in ['PENDING', 'APPROVED', 'REJECTED']" :key="s" type="button"
          class="h-8 px-3 rounded-full border text-xs pressable"
          :class="auditStatus === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
          @click="auditStatus = s; loadAudits()">
          {{ s === 'PENDING' ? '待审核' : s === 'APPROVED' ? '已通过' : '已驳回' }}
        </button>
      </div>
      <div v-if="audits.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="audit in audits" :key="audit.id" class="py-4">
          <button type="button" class="w-full text-left flex items-center justify-between gap-4" @click="expandAudit(audit.id)">
            <div>
              <p class="font-medium">{{ audit.coachName }} <span class="catalog-tab">第 {{ audit.submitVersion }} 次提交</span></p>
              <p class="mt-1 text-sm text-ink-soft">{{ new Date(audit.submittedAt).toLocaleString('zh-CN', { hour12: false }) }}</p>
              <p v-if="audit.remark" class="mt-1 text-sm text-red-800">驳回：{{ audit.remark }}</p>
            </div>
            <span class="text-xs px-2.5 py-1 rounded-full bg-paper border border-hairline text-ink-soft">{{ audit.status }}</span>
          </button>
          <div v-if="expandedAuditId === audit.id && auditDetail" class="mt-4 bg-paper border border-hairline rounded-[14px] p-5">
            <div class="grid md:grid-cols-2 gap-4 text-sm">
              <p><span class="catalog-tab">真实姓名</span> {{ auditDetail.snapshot.realName }}</p>
              <p><span class="catalog-tab">从业年限</span> {{ auditDetail.snapshot.yearsOfExperience }} 年</p>
              <p class="md:col-span-2"><span class="catalog-tab">培训经历</span> {{ auditDetail.snapshot.trainingExp || '未填写' }}</p>
              <p class="md:col-span-2"><span class="catalog-tab">服务理念</span> {{ auditDetail.snapshot.serviceConcept || '未填写' }}</p>
              <p class="md:col-span-2"><span class="catalog-tab">服务项目</span> {{ (auditDetail.snapshot.services ?? []).map((s) => `${s.name}（${s.priceInCents / 100}元）`).join('、') || '未设置' }}</p>
              <div class="md:col-span-2 flex flex-wrap gap-2">
                <span class="catalog-tab self-center">资料文件</span>
                <button v-for="url in auditDetail.snapshot.credentialUrls ?? []" :key="url" type="button"
                  class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-pine inline-flex items-center gap-1.5 pressable"
                  @click="previewFile(url)">
                  <Eye :size="15" /> 证书 {{ url.split('/').slice(-2, -1)[0].slice(0, 8) }}
                </button>
                <button v-if="auditDetail.snapshot.idCardUrl" type="button"
                  class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-pine inline-flex items-center gap-1.5 pressable"
                  @click="previewFile(auditDetail.snapshot.idCardUrl)">
                  <Eye :size="15" /> 身份证
                </button>
              </div>
            </div>
            <div v-if="audit.status === 'PENDING'" class="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" class="h-10 px-5 rounded-full bg-pine text-card text-sm pressable" @click="approveAudit(audit.id)">通过</button>
              <input v-model="rejectReason" class="h-10 flex-1 min-w-[200px] px-3 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine" placeholder="驳回理由（必填）" />
              <button type="button" class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="rejectAudit(audit.id)">驳回</button>
            </div>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-5" title="这个状态没有审核记录" />
    </section>

    <!-- 文章 -->
    <section v-else-if="activeTab === 'articles'" class="mt-8">
      <div class="card p-6">
        <p class="catalog-tab">{{ articleForm.id ? '编辑文章' : '新建文章' }}</p>
        <div class="mt-4 grid md:grid-cols-2 gap-4">
          <FieldInput v-model="articleForm.title" label="标题" />
          <FieldInput v-model="articleForm.coverUrl" label="封面图 URL（可选）" />
        </div>
        <div class="mt-4 grid md:grid-cols-3 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-ink">分类</span>
            <select v-model="articleForm.categoryId" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
              <option value="">无分类</option>
              <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">状态</span>
            <select v-model="articleForm.status" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
              <option value="DRAFT">草稿</option>
              <option value="PUBLISHED">发布</option>
              <option value="OFFLINE">下线</option>
            </select>
          </label>
          <label class="flex items-end gap-2 pb-3 text-sm text-ink-soft">
            <input v-model="articleForm.isPinned" type="checkbox" class="accent-[#1f6b52] w-4 h-4" /> 置顶
          </label>
        </div>
        <FieldInput v-model="articleForm.summary" label="摘要（可选）" />
        <label class="block mt-4">
          <span class="text-sm font-medium text-ink">正文（支持基础 HTML）</span>
          <textarea v-model="articleForm.content" rows="8" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine font-mono"></textarea>
        </label>
        <div class="mt-4 flex gap-2">
          <button type="button" class="h-11 px-6 rounded-full bg-pine text-card text-sm pressable" @click="saveArticle">保存</button>
          <button v-if="articleForm.id" type="button" class="h-11 px-6 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="resetArticleForm">取消编辑</button>
        </div>
      </div>
      <div class="mt-6 flex flex-wrap gap-2">
        <button v-for="s in ['', 'PUBLISHED', 'DRAFT', 'OFFLINE']" :key="s" type="button"
          class="h-8 px-3 rounded-full border text-xs pressable"
          :class="articleFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
          @click="articleFilter = s; loadArticles()">
          {{ s === '' ? '全部' : statusLabel[s] }}
        </button>
      </div>
      <div v-if="articles.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
        <div v-for="article in articles" :key="article.id" class="py-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-medium truncate">{{ article.title }}</p>
            <p class="mt-1 text-sm text-ink-soft">{{ statusLabel[article.status] }} · {{ article.viewCount }} 阅读</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm pressable" @click="editArticle(article)">编辑</button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline bg-card text-ink-faint flex items-center justify-center pressable" :aria-label="`删除文章 ${article.id}`" @click="removeArticle(article.id)"><Trash :size="16" /></button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-4" title="还没有文章" />
    </section>

    <!-- 分类 -->
    <section v-else-if="activeTab === 'categories'" class="mt-8">
      <div class="card p-6">
        <p class="catalog-tab">新增分类</p>
        <div class="mt-4 flex gap-2">
          <input v-model="newCategory" class="h-12 flex-1 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="分类名称" />
          <button type="button" class="h-12 px-6 rounded-full bg-pine text-card text-sm pressable" @click="createCategory"><Plus :size="16" weight="bold" /> 新增</button>
        </div>
      </div>
      <div v-if="categories.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="category in categories" :key="category.id" class="py-4 flex items-center justify-between gap-4">
          <p class="font-medium">{{ category.name }}</p>
          <div class="flex gap-2">
            <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
              :class="category.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
              @click="toggleCategory(category)">
              {{ category.isEnabled ? '启用' : '停用' }}
            </button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline bg-card text-ink-faint flex items-center justify-center pressable" @click="removeCategory(category.id)"><Trash :size="16" /></button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-5" title="还没有分类" />
    </section>

    <!-- 轮播图 -->
    <section v-else-if="activeTab === 'banners'" class="mt-8">
      <div class="card p-6">
        <p class="catalog-tab">新增轮播图</p>
        <div class="mt-4 grid md:grid-cols-2 gap-4">
          <FieldInput v-model="bannerForm.title" label="标题" />
          <FieldInput v-model="bannerForm.imageUrl" label="图片 URL" />
        </div>
        <div class="mt-4 grid md:grid-cols-3 gap-4">
          <label class="block">
            <span class="text-sm font-medium text-ink">跳转类型</span>
            <select v-model="bannerForm.linkType" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
              <option value="NONE">无</option>
              <option value="ARTICLE">文章</option>
              <option value="ACTIVITY">活动</option>
              <option value="URL">外链</option>
            </select>
          </label>
          <FieldInput v-model="bannerForm.linkValue" label="跳转值（可选）" />
          <FieldInput v-model="bannerForm.sortOrder" label="排序（小在前）" type="number" />
        </div>
        <button type="button" class="mt-4 h-11 px-6 rounded-full bg-pine text-card text-sm pressable" @click="createBanner">新增</button>
      </div>
      <div v-if="banners.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="banner in banners" :key="banner.id" class="py-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="font-medium truncate">{{ banner.title }}</p>
            <p class="mt-1 text-sm text-ink-soft truncate">{{ banner.imageUrl }}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
              :class="banner.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
              @click="toggleBanner(banner)">
              {{ banner.isEnabled ? '上架' : '下架' }}
            </button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline bg-card text-ink-faint flex items-center justify-center pressable" @click="removeBanner(banner.id)"><Trash :size="16" /></button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-5" title="还没有轮播图" />
    </section>

    <!-- 标签 -->
    <section v-else-if="activeTab === 'tags'" class="mt-8">
      <div class="card p-6">
        <p class="catalog-tab">新增标签</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <select v-model="tagType" class="h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
            <option value="">选择类型</option>
            <option value="FIELD">擅长领域</option>
            <option value="AUDIENCE">服务人群</option>
          </select>
          <input v-model="newTag" class="h-12 flex-1 min-w-[160px] px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="标签名称" />
          <button type="button" class="h-12 px-6 rounded-full bg-pine text-card text-sm pressable" @click="createTag">新增</button>
        </div>
      </div>
      <div class="mt-5 flex flex-wrap gap-2">
        <button v-for="t in ['', 'FIELD', 'AUDIENCE']" :key="t" type="button"
          class="h-8 px-3 rounded-full border text-xs pressable"
          :class="tagType === t ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
          @click="tagType = t; loadTags()">
          {{ t === '' ? '全部' : t === 'FIELD' ? '擅长领域' : '服务人群' }}
        </button>
      </div>
      <div v-if="tags.length" class="mt-4 flex flex-wrap gap-2">
        <span v-for="tag in tags" :key="tag.id" class="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-hairline bg-card text-sm">
          {{ tag.name }}
          <button type="button" class="text-ink-faint hover:text-red-800 pressable" :aria-label="`删除标签 ${tag.name}`" @click="removeTag(tag.id)"><X :size="14" /></button>
        </span>
      </div>
      <EmptyState v-else class="mt-5" title="还没有标签" />
    </section>

    <!-- 话术库 -->
    <section v-else-if="activeTab === 'feedback'" class="mt-8">
      <div class="card p-6">
        <p class="catalog-tab">新增话术</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <select v-model="feedbackMood" class="h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
            <option value="">选择情绪</option>
            <option v-for="(label, key) in moodLabels" :key="key" :value="key">{{ label }}</option>
          </select>
          <input v-model="newFeedback" class="h-12 flex-1 min-w-[220px] px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="资源导向话术内容" />
          <button type="button" class="h-12 px-6 rounded-full bg-pine text-card text-sm pressable" @click="createFeedback">新增</button>
        </div>
      </div>
      <div v-if="feedbackItems.length" class="mt-5 divide-y divide-hairline border-y border-hairline">
        <div v-for="item in feedbackItems" :key="item.id" class="py-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm leading-relaxed">{{ item.content }}</p>
            <p class="catalog-tab mt-1">{{ moodLabels[item.moodType] ?? item.moodType }}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
              :class="item.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
              @click="toggleFeedback(item)">
              {{ item.isEnabled ? '启用' : '停用' }}
            </button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline bg-card text-ink-faint flex items-center justify-center pressable" @click="removeFeedback(item.id)"><Trash :size="16" /></button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-5" title="这个情绪还没有话术" />
    </section>
  </div>
</template>
