<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhPlus as Plus, PhX as X } from '@phosphor-icons/vue'
import { del, get, patch, post } from '@/api/client'
import type { ArticleAdmin, CategoryAdmin } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const rows = ref<ArticleAdmin[]>([])
const categories = ref<CategoryAdmin[]>([])
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')
const editing = ref(false)
const deleteTarget = ref<number | null>(null)

const form = ref({
  id: 0,
  title: '',
  summary: '',
  content: '',
  coverUrl: '',
  categoryId: '' as string,
  isPinned: false,
  status: 'DRAFT' as 'PUBLISHED' | 'DRAFT' | 'OFFLINE',
})

const statusMap = { PUBLISHED: '已发布', DRAFT: '草稿', OFFLINE: '已下线' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' })
    if (statusFilter.value) params.set('status', statusFilter.value)
    const [list, cats] = await Promise.all([
      get<{ items: ArticleAdmin[] }>(`/admin/articles?${params.toString()}`),
      get<{ items: CategoryAdmin[] }>('/admin/article-categories'),
    ])
    rows.value = list.items
    categories.value = cats.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

function resetForm() {
  form.value = { id: 0, title: '', summary: '', content: '', coverUrl: '', categoryId: '', isPinned: false, status: 'DRAFT' }
  editing.value = false
}

function edit(article: ArticleAdmin) {
  form.value = {
    id: article.id,
    title: article.title,
    summary: article.summary ?? '',
    content: article.content,
    coverUrl: article.coverUrl ?? '',
    categoryId: article.categoryId ? String(article.categoryId) : '',
    isPinned: article.isPinned,
    status: article.status,
  }
  editing.value = true
}

async function save() {
  if (!form.value.title.trim() || !form.value.content.trim()) {
    error.value = '标题与正文不能为空'
    return
  }
  const payload = {
    title: form.value.title.trim(),
    summary: form.value.summary || null,
    content: form.value.content,
    coverUrl: form.value.coverUrl || null,
    categoryId: form.value.categoryId ? Number(form.value.categoryId) : null,
    isPinned: form.value.isPinned,
    status: form.value.status,
  }
  try {
    if (form.value.id) await patch(`/admin/articles/${form.value.id}`, payload)
    else await post('/admin/articles', payload)
    flash('文章已保存')
    resetForm()
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const id = deleteTarget.value
  deleteTarget.value = null
  try {
    await del(`/admin/articles/${id}`)
    flash('文章已删除')
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

function flash(message: string) {
  success.value = message
  setTimeout(() => (success.value = ''), 2500)
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in ['', 'PUBLISHED', 'DRAFT', 'OFFLINE'] as const"
          :key="s"
          type="button"
          class="h-9 px-4 rounded-full border text-sm pressable"
          :class="statusFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
          @click="statusFilter = s; load()"
        >
          {{ s === '' ? '全部' : statusMap[s] }}
        </button>
      </div>
      <button
        type="button"
        class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium inline-flex items-center gap-1.5 pressable"
        @click="resetForm(); editing = true"
      >
        <Plus :size="16" weight="bold" /> 新建文章
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine-deep">{{ success }}</p>

    <form
      v-if="editing"
      class="mt-6 bg-card border border-hairline rounded-[14px] p-6"
      @submit.prevent="save"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold tracking-tight">{{ form.id ? '编辑文章' : '新建文章' }}</h2>
        <button type="button" class="w-9 h-9 rounded-full border border-hairline flex items-center justify-center text-ink-faint pressable" @click="resetForm()">
          <X :size="16" />
        </button>
      </div>
      <div class="mt-5 grid md:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-sm font-medium text-ink">标题</span>
          <input v-model="form.title" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
        </label>
        <label class="block">
          <span class="text-sm font-medium text-ink">封面图 URL（可选）</span>
          <input v-model="form.coverUrl" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
        </label>
      </div>
      <div class="mt-4 grid md:grid-cols-3 gap-4">
        <label class="block">
          <span class="text-sm font-medium text-ink">分类</span>
          <select v-model="form.categoryId" class="mt-1.5 w-full h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
            <option value="">无分类</option>
            <option v-for="c in categories" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="text-sm font-medium text-ink">状态</span>
          <select v-model="form.status" class="mt-1.5 w-full h-11 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">发布</option>
            <option value="OFFLINE">下线</option>
          </select>
        </label>
        <label class="flex items-end gap-2 pb-3 text-sm text-ink-soft">
          <input v-model="form.isPinned" type="checkbox" class="accent-pine w-4 h-4" /> 置顶
        </label>
      </div>
      <label class="block mt-4">
        <span class="text-sm font-medium text-ink">摘要（可选）</span>
        <input v-model="form.summary" class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" />
      </label>
      <label class="block mt-4">
        <span class="text-sm font-medium text-ink">正文（支持基础 HTML）</span>
        <textarea v-model="form.content" rows="10" class="mt-1.5 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] font-mono outline-none focus:border-pine"></textarea>
      </label>
      <div class="mt-5 flex gap-2">
        <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable">保存</button>
        <button type="button" class="h-11 px-6 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="resetForm()">取消</button>
      </div>
    </form>

    <div class="mt-6 bg-card border border-hairline rounded-[14px] overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm min-w-[680px]">
          <thead>
            <tr class="text-left text-ink-faint border-b border-hairline">
              <th class="px-5 py-3 font-normal">标题</th>
              <th class="px-5 py-3 font-normal">分类</th>
              <th class="px-5 py-3 font-normal">状态</th>
              <th class="px-5 py-3 font-normal">阅读</th>
              <th class="px-5 py-3 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody v-if="!loading">
            <tr v-for="article in rows" :key="article.id" class="border-b border-hairline last:border-0">
              <td class="px-5 py-4">
                <p class="font-medium max-w-[320px] truncate">{{ article.title }}</p>
                <p v-if="article.isPinned" class="mt-0.5 text-xs text-pine">置顶</p>
              </td>
              <td class="px-5 py-4 text-ink-soft">{{ categories.find((c) => c.id === article.categoryId)?.name ?? '—' }}</td>
              <td class="px-5 py-4"><StatusBadge :status="article.status" :map="statusMap" /></td>
              <td class="px-5 py-4 text-ink-soft">{{ article.viewCount }}</td>
              <td class="px-5 py-4 text-right whitespace-nowrap">
                <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm pressable mr-2" @click="edit(article)">编辑</button>
                <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-red-800 pressable" @click="deleteTarget = article.id">删除</button>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td colspan="5" class="px-5 py-12 text-center text-ink-faint">还没有文章</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loading" class="space-y-3 p-5">
        <div v-for="i in 5" :key="i" class="h-10 rounded-[10px] bg-hairline/60 animate-pulse"></div>
      </div>
    </div>

    <ConfirmDialog
      :open="!!deleteTarget"
      title="删除文章"
      message="删除后前台将不再展示该文章，此操作可恢复性有限。"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleteTarget = null"
    />
  </div>
</template>
