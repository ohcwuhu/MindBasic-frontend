<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhPlus as Plus, PhTrash as Trash } from '@phosphor-icons/vue'
import { del, get, patch, post } from '@/api/client'
import type { BannerAdmin, CategoryAdmin, FeedbackAdmin, TagAdmin } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

type ContentTab = 'categories' | 'banners' | 'tags' | 'feedback'
const activeTab = ref<ContentTab>('categories')
const error = ref('')
const success = ref('')
const deleteTarget = ref<{ kind: string; id: number; name: string } | null>(null)

function flash(message: string) {
  success.value = message
  setTimeout(() => (success.value = ''), 2500)
}

async function run(task: () => Promise<void>) {
  error.value = ''
  try {
    await task()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

// 分类
const categories = ref<CategoryAdmin[]>([])
const newCategory = ref('')

async function loadCategories() {
  const data = await get<{ items: CategoryAdmin[] }>('/admin/article-categories')
  categories.value = data.items
}

async function createCategory() {
  if (!newCategory.value.trim()) return
  await run(async () => {
    await post('/admin/article-categories', { name: newCategory.value.trim() })
    newCategory.value = ''
    flash('分类已新增')
    await loadCategories()
  })
}

async function toggleCategory(category: CategoryAdmin) {
  await run(async () => {
    await patch(`/admin/article-categories/${category.id}`, { isEnabled: !category.isEnabled })
    await loadCategories()
  })
}

// 轮播
const banners = ref<BannerAdmin[]>([])
const bannerForm = ref({ title: '', imageUrl: '', linkType: 'NONE', linkValue: '', sortOrder: '0' })

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
    flash('轮播图已新增')
    await loadBanners()
  })
}

async function toggleBanner(banner: BannerAdmin) {
  await run(async () => {
    await patch(`/admin/banners/${banner.id}`, { isEnabled: !banner.isEnabled })
    await loadBanners()
  })
}

// 标签
const tags = ref<TagAdmin[]>([])
const tagType = ref('FIELD')
const newTag = ref('')

async function loadTags() {
  const data = await get<{ items: TagAdmin[] }>(`/admin/tags?type=${tagType.value}`)
  tags.value = data.items
}

async function createTag() {
  if (!newTag.value.trim()) return
  await run(async () => {
    await post('/admin/tags', { name: newTag.value.trim(), type: tagType.value })
    newTag.value = ''
    flash('标签已新增')
    await loadTags()
  })
}

// 话术
const feedback = ref<FeedbackAdmin[]>([])
const feedbackMood = ref('CALM')
const newFeedback = ref('')
const moodLabels: Record<string, string> = { CALM: '平静', HAPPY: '开心', ANXIOUS: '焦虑', DOWN: '低落', IRRITATED: '烦躁', OTHER: '其他' }

async function loadFeedback() {
  const data = await get<{ items: FeedbackAdmin[] }>(`/admin/feedback-lib?moodType=${feedbackMood.value}`)
  feedback.value = data.items
}

async function createFeedback() {
  if (!newFeedback.value.trim()) return
  await run(async () => {
    await post('/admin/feedback-lib', { moodType: feedbackMood.value, content: newFeedback.value.trim() })
    newFeedback.value = ''
    flash('话术已新增')
    await loadFeedback()
  })
}

async function toggleFeedback(item: FeedbackAdmin) {
  await run(async () => {
    await patch(`/admin/feedback-lib/${item.id}`, { isEnabled: !item.isEnabled })
    await loadFeedback()
  })
}

async function switchTab(tab: ContentTab) {
  activeTab.value = tab
  error.value = ''
  if (tab === 'categories') await loadCategories()
  else if (tab === 'banners') await loadBanners()
  else if (tab === 'tags') await loadTags()
  else await loadFeedback()
}

onMounted(() => switchTab('categories'))

async function confirmDelete() {
  if (!deleteTarget.value) return
  const { kind, id } = deleteTarget.value
  deleteTarget.value = null
  await run(async () => {
    await del(`/admin/${kind}/${id}`)
    flash('已删除')
    await switchTab(activeTab.value)
  })
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="tab in [
          { key: 'categories', label: '文章分类' },
          { key: 'banners', label: '轮播图' },
          { key: 'tags', label: '标签' },
          { key: 'feedback', label: '话术库' },
        ] as const"
        :key="tab.key"
        type="button"
        class="h-9 px-4 rounded-full border text-sm pressable"
        :class="activeTab === tab.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine-deep">{{ success }}</p>

    <!-- 分类 -->
    <section v-if="activeTab === 'categories'" class="mt-6">
      <form class="flex gap-2 max-w-lg" @submit.prevent="createCategory">
        <input v-model="newCategory" class="h-11 flex-1 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="分类名称" />
        <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"><Plus :size="16" weight="bold" /> 新增</button>
      </form>
      <div v-if="categories.length" class="mt-4 bg-card border border-hairline rounded-[14px] divide-y divide-hairline">
        <div v-for="category in categories" :key="category.id" class="px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p class="font-medium">{{ category.name }}</p>
            <p class="catalog-tab mt-0.5">排序 {{ category.sortOrder }}</p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
              :class="category.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
              @click="toggleCategory(category)">
              {{ category.isEnabled ? '启用' : '停用' }}
            </button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline flex items-center justify-center text-ink-faint pressable" @click="deleteTarget = { kind: 'article-categories', id: category.id, name: category.name }">
              <Trash :size="16" />
            </button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-4" title="还没有分类" />
    </section>

    <!-- 轮播 -->
    <section v-else-if="activeTab === 'banners'" class="mt-6">
      <form class="bg-card border border-hairline rounded-[14px] p-6 grid md:grid-cols-2 gap-4" @submit.prevent="createBanner">
        <label class="block">
          <span class="text-sm font-medium text-ink">标题</span>
          <input v-model="bannerForm.title" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-ink">图片 URL</span>
          <input v-model="bannerForm.imageUrl" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-ink">跳转类型</span>
          <select v-model="bannerForm.linkType" class="mt-1.5 w-full h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
            <option value="NONE">无</option>
            <option value="ARTICLE">文章</option>
            <option value="ACTIVITY">活动</option>
            <option value="URL">外链</option>
          </select>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-ink">排序（小在前）</span>
          <input v-model="bannerForm.sortOrder" type="number" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
        </label>
        <div class="md:col-span-2">
          <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"><Plus :size="16" weight="bold" /> 新增轮播</button>
        </div>
      </form>
      <div v-if="banners.length" class="mt-4 bg-card border border-hairline rounded-[14px] divide-y divide-hairline">
        <div v-for="banner in banners" :key="banner.id" class="px-5 py-4 flex items-center justify-between gap-4">
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
            <button type="button" class="h-9 w-9 rounded-full border border-hairline flex items-center justify-center text-ink-faint pressable" @click="deleteTarget = { kind: 'banners', id: banner.id, name: banner.title }">
              <Trash :size="16" />
            </button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-4" title="还没有轮播图" />
    </section>

    <!-- 标签 -->
    <section v-else-if="activeTab === 'tags'" class="mt-6">
      <form class="flex flex-wrap gap-2 max-w-lg" @submit.prevent="createTag">
        <select v-model="tagType" class="h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" @change="loadTags">
          <option value="FIELD">擅长领域</option>
          <option value="AUDIENCE">服务人群</option>
        </select>
        <input v-model="newTag" class="h-11 flex-1 min-w-[160px] px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="标签名称" />
        <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"><Plus :size="16" weight="bold" /> 新增</button>
      </form>
      <div v-if="tags.length" class="mt-4 flex flex-wrap gap-2">
        <span v-for="tag in tags" :key="tag.id" class="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-hairline bg-card text-sm">
          {{ tag.name }}
          <button type="button" class="text-ink-faint hover:text-red-800 pressable" @click="deleteTarget = { kind: 'tags', id: tag.id, name: tag.name }">
            <Trash :size="14" />
          </button>
        </span>
      </div>
      <EmptyState v-else class="mt-4" title="还没有标签" />
    </section>

    <!-- 话术 -->
    <section v-else class="mt-6">
      <form class="flex flex-wrap gap-2" @submit.prevent="createFeedback">
        <select v-model="feedbackMood" class="h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" @change="loadFeedback">
          <option v-for="(label, key) in moodLabels" :key="key" :value="key">{{ label }}</option>
        </select>
        <input v-model="newFeedback" class="h-11 flex-1 min-w-[240px] px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="资源导向话术内容" />
        <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"><Plus :size="16" weight="bold" /> 新增</button>
      </form>
      <div v-if="feedback.length" class="mt-4 bg-card border border-hairline rounded-[14px] divide-y divide-hairline">
        <div v-for="item in feedback" :key="item.id" class="px-5 py-4 flex items-center justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm leading-relaxed">{{ item.content }}</p>
            <p class="catalog-tab mt-1">{{ moodLabels[item.moodType] }}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
              :class="item.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
              @click="toggleFeedback(item)">
              {{ item.isEnabled ? '启用' : '停用' }}
            </button>
            <button type="button" class="h-9 w-9 rounded-full border border-hairline flex items-center justify-center text-ink-faint pressable" @click="deleteTarget = { kind: 'feedback-lib', id: item.id, name: '话术' }">
              <Trash :size="16" />
            </button>
          </div>
        </div>
      </div>
      <EmptyState v-else class="mt-4" title="这个情绪还没有话术" />
    </section>

    <ConfirmDialog
      :open="!!deleteTarget"
      :title="`删除${deleteTarget?.kind === 'banners' ? '轮播图' : deleteTarget?.kind === 'tags' ? '标签' : deleteTarget?.kind === 'feedback-lib' ? '话术' : '分类'}`"
      :message="`确认删除「${deleteTarget?.name}」？`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
