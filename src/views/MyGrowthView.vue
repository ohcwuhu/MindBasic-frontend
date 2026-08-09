<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  PhCalendarCheck as CalendarCheck,
  PhCardsThree as CardsThree,
  PhBookmarkSimple as BookmarkSimple,
  PhShareNetwork as ShareNetwork,
} from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { Appointment, ArticleListItem, SelfCoachingRecord } from '@/api/types'
import EmptyState from '@/components/EmptyState.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'

type Tab = 'appointments' | 'records' | 'favorites'
const activeTab = ref<Tab>('appointments')
const appointments = ref<Appointment[]>([])
const records = ref<SelfCoachingRecord[]>([])
const favorites = ref<ArticleListItem[]>([])
const loading = ref(true)
const error = ref('')
const cancelTarget = ref<Appointment | null>(null)
const shareMsg = ref('')

const statusLabel: Record<string, string> = {
  PENDING: '待确认',
  CONFIRMED: '已确认',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
}

async function load(tab: Tab) {
  loading.value = true
  error.value = ''
  try {
    if (tab === 'appointments') {
      const data = await get<{ items: Appointment[] }>('/appointments/mine?page=1&pageSize=50')
      appointments.value = data.items
    } else if (tab === 'records') {
      const data = await get<{ items: SelfCoachingRecord[] }>('/self-coaching/records?page=1&pageSize=50')
      records.value = data.items
    } else {
      const data = await get<{ items: ArticleListItem[] }>('/users/me/favorites?page=1&pageSize=50')
      favorites.value = data.items
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => load(activeTab.value))

async function confirmCancel() {
  if (!cancelTarget.value) return
  const id = cancelTarget.value.id
  cancelTarget.value = null
  try {
    await post(`/appointments/${id}/cancel`)
    await load(activeTab.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '取消失败，请重试'
  }
}

async function shareRecord(record: SelfCoachingRecord) {
  if (!record.actionCard) return
  const text = `${record.actionCard.title}\n\n${record.actionCard.content}`
  try {
    if (navigator.share) {
      await navigator.share({ title: record.actionCard.title, text })
      return
    }
    await navigator.clipboard.writeText(text)
    shareMsg.value = '已复制到剪贴板'
    setTimeout(() => (shareMsg.value = ''), 3000)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return
    error.value = '分享失败，请重试'
  }
}

function switchTab(tab: Tab) {
  activeTab.value = tab
  load(tab)
}
</script>

<template>
  <div class="max-w-[820px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">ME 我的成长</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">你走过的每一步</h1>

    <div class="mt-8 flex gap-2" role="tablist" aria-label="成长记录分类">
      <button
        v-for="tab in [
          { key: 'appointments', label: '我的预约', icon: CalendarCheck },
          { key: 'records', label: '自我教练记录', icon: CardsThree },
          { key: 'favorites', label: '我的收藏', icon: BookmarkSimple },
        ] as const"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm transition-colors pressable"
        :class="activeTab === tab.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="switchTab(tab.key)"
      >
        <component :is="tab.icon" :size="16" weight="duotone" />
        {{ tab.label }}
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-8" />

    <div v-if="loading" class="mt-8 space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <template v-else>
      <section v-if="activeTab === 'appointments'" class="mt-8">
        <div v-if="appointments.length" class="divide-y divide-hairline border-y border-hairline">
          <div v-for="item in appointments" :key="item.id" class="py-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-medium">{{ item.coach.nickname }} · {{ item.service.name }}</p>
                <p class="mt-1 text-sm text-ink-soft">
                  {{ item.slot.date }} {{ item.slot.startTime }}（{{ item.needDesc }}）
                </p>
              </div>
              <span
                class="shrink-0 text-xs px-2.5 py-1 rounded-full"
                :class="
                  item.status === 'COMPLETED'
                    ? 'bg-pine-soft text-pine-deep'
                    : item.status === 'CANCELLED'
                      ? 'bg-paper text-ink-faint border border-hairline'
                      : item.status === 'CONFIRMED'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-amber-100 text-amber-900'
                "
              >
                {{ statusLabel[item.status] }}
              </span>
            </div>
            <div v-if="item.canCancel" class="mt-3">
              <button
                type="button"
                class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                @click="cancelTarget = item"
              >
                取消预约
              </button>
            </div>
            <p v-if="item.cancelReason" class="mt-2 text-sm text-ink-soft">取消原因：{{ item.cancelReason }}</p>
          </div>
        </div>
        <div v-else class="py-16 text-center">
          <p class="font-medium text-ink">还没有预约</p>
          <p class="mt-2 text-sm text-ink-soft">
            去 <RouterLink to="/coaches" class="text-pine font-medium hover:underline">找教练</RouterLink> 看看吧。
          </p>
        </div>
      </section>

      <section v-else-if="activeTab === 'records'" class="mt-8">
        <div v-if="records.length" class="divide-y divide-hairline border-y border-hairline">
          <div v-for="record in records" :key="record.id" class="py-5">
            <div class="flex items-center justify-between gap-4">
              <p class="font-medium">模板 #{{ record.templateId }}</p>
              <div class="flex items-center gap-2">
                <button
                  v-if="record.actionCard"
                  type="button"
                  class="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-hairline bg-card text-xs text-ink-soft pressable"
                  :aria-label="`分享记录 ${record.id}`"
                  @click="shareRecord(record)"
                >
                  <ShareNetwork :size="14" /> 分享
                </button>
                <span
                  class="text-xs px-2.5 py-1 rounded-full"
                  :class="record.status === 'COMPLETED' ? 'bg-pine-soft text-pine-deep' : 'bg-paper text-ink-faint border border-hairline'"
                >
                  {{ record.status === 'COMPLETED' ? '已生成行动卡' : '草稿' }}
                </span>
              </div>
            </div>
            <p v-if="shareMsg" class="mt-2 text-sm text-pine-deep">{{ shareMsg }}</p>
            <p class="mt-2 text-sm text-ink-soft">
              {{ new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false }) }}
            </p>
            <pre
              v-if="record.actionCard"
              class="mt-3 text-sm leading-relaxed whitespace-pre-wrap font-sans text-ink-soft bg-paper rounded-[10px] p-4 border border-hairline"
            >{{ record.actionCard.content }}</pre>
          </div>
        </div>
        <EmptyState v-else title="还没有自我教练记录" hint="从一张行动卡开始。" />
      </section>

      <section v-else class="mt-8">
        <div v-if="favorites.length" class="divide-y divide-hairline border-y border-hairline">
          <RouterLink
            v-for="article in favorites"
            :key="article.id"
            :to="`/articles/${article.id}`"
            class="group py-4 block"
          >
            <p class="font-medium group-hover:text-pine transition-colors">{{ article.title }}</p>
            <p v-if="article.summary" class="mt-1 text-sm text-ink-soft line-clamp-1">{{ article.summary }}</p>
          </RouterLink>
        </div>
        <EmptyState v-else title="还没有收藏" hint="在科普中心收藏感兴趣的文章。" />
      </section>
    </template>

    <ConfirmDialog
      :open="!!cancelTarget"
      title="取消预约"
      :message="`确认取消与「${cancelTarget?.coach.nickname ?? ''}」的预约？取消后时段将释放。`"
      confirm-text="取消预约"
      danger
      @confirm="confirmCancel"
      @cancel="cancelTarget = null"
    />
  </div>
</template>
