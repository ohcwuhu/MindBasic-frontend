<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { PhChatCircleDots as ChatDots, PhWarningCircle as WarningCircle } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { PublicPlatformConfig } from '@/api/types'
import VideoCallPanel from '@/components/ai-lab/VideoCallPanel.vue'
import { composeClosingJournal } from '@/utils/journalAction'

const AI_ACK_KEY = 'mb_ai_ack_v1'

/** 一次通话的收束卡：四行都由用户确认或修改后才落库。 */
interface ClosingCard {
  status: string
  ideal: string
  resources: string
  action: string
  when: string
  condition: string
}

interface SummaryDraft {
  moodType: string
  content: string
  conversationId: number
  turnCount?: number
  stageDraft?: string | null
}

interface ConversationDetail {
  conversation: { id: number; title?: string }
  messages: Array<{ role: string; content: string; stage?: string | null }>
}

interface SummaryConfirm {
  conversationId: number
  summary: string
  journalId: number
}

const MOODS: Array<{ key: string; label: string }> = [
  { key: 'ANXIOUS', label: '焦虑' },
  { key: 'DOWN', label: '低落' },
  { key: 'IRRITATED', label: '烦躁' },
  { key: 'CALM', label: '平静' },
  { key: 'HAPPY', label: '开心' },
  { key: 'OTHER', label: '说不上来' },
]

function emptyCard(): ClosingCard {
  return { status: '', ideal: '', resources: '', action: '', when: '今天睡前', condition: '写下来就算完成' }
}

const platform = ref<PublicPlatformConfig | null>(null)
const showAck = ref(false)
const endedConv = ref<number | null>(null)
const summarizing = ref(false)
const dialogError = ref('')
const ackDialog = ref<HTMLElement | null>(null)
const journalDialog = ref<HTMLElement | null>(null)
const card = ref<ClosingCard>(emptyCard())
const moodType = ref('OTHER')
const draftLoading = ref(false)
const savedJournalId = ref<number | null>(null)
let previousFocus: HTMLElement | null = null
let inertElements: Array<{ element: HTMLElement; inert: boolean }> = []

/** 保存前必须齐的几项：这次谈到的事、我的一小步，以及这一步的时间与完成条件 */
const canSave = computed(() => {
  const c = card.value
  return Boolean(c.status.trim() && c.action.trim() && c.when.trim() && c.condition.trim())
})

/** 送给后端的日记正文：用户确认过的四行，行动那行带时间与完成条件 */
function composeJournal(c: ClosingCard): string {
  return composeClosingJournal(c)
}

function restoreBackground() {
  inertElements.forEach(({ element, inert }) => { element.inert = inert })
  inertElements = []
}

watch(() => showAck.value || endedConv.value !== null, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const dialog = showAck.value ? ackDialog.value : journalDialog.value
    if (!dialog) return
    inertElements = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== dialog && !element.contains(dialog))
      .map(element => ({ element, inert: element.inert }))
    inertElements.forEach(({ element }) => { element.inert = true })
    /* 收束卡里第一个能改的是输入框，光标落在那儿比落在按钮上顺手 */
    dialog.querySelector<HTMLElement>('textarea, input, button:not([disabled]), a[href]')?.focus()
  } else {
    restoreBackground()
    if (previousFocus?.isConnected) previousFocus.focus()
    previousFocus = null
  }
}, { flush: 'post' })

function trapDialogFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const dialog = event.currentTarget as HTMLElement
  const targets = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'))
    .filter(element => element.getClientRects().length > 0)
  const first = targets[0]
  const last = targets[targets.length - 1]
  if (!first) { event.preventDefault(); dialog.focus(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

function closeJournal() {
  if (!summarizing.value) endedConv.value = null
}

onUnmounted(restoreBackground)

onMounted(async () => {
  try {
    platform.value = await get<PublicPlatformConfig>('/platform/config')
  } catch {
    platform.value = null
  }
  try {
    showAck.value = !localStorage.getItem(AI_ACK_KEY)
  } catch {
    showAck.value = true
  }
})

function ack() {
  try {
    localStorage.setItem(AI_ACK_KEY, '1')
  } catch {
    /* ignore */
  }
  showAck.value = false
}

function askJournal(conversationId: number) {
  endedConv.value = conversationId
  dialogError.value = ''
  savedJournalId.value = null
  card.value = emptyCard()
  moodType.value = 'OTHER'
  void loadClosingDraft(conversationId)
}

/** 打开收束卡时先取草稿：情绪类型由后端判定；四行里能填的，都用用户自己说过的话填上。 */
async function loadClosingDraft(conversationId: number) {
  draftLoading.value = true
  try {
    const draft = await post<SummaryDraft>(`/ai-conversations/${conversationId}/summary`)
    moodType.value = draft.moodType || 'OTHER'
    let messages: ConversationDetail['messages'] = []
    try {
      const detail = await get<ConversationDetail>(`/ai-conversations/${conversationId}`)
      messages = detail.messages || []
    } catch {
      /* 逐句消息读不到也不挡事：四行留空让用户自己写 */
    }
    const mine = messages.filter((message) => message.role === 'USER' && (message.content || '').trim())
    const atStage = (stage: string) => {
      const hit = [...mine].reverse().find((message) => (message.stage || '') === stage)
      return (hit?.content || '').trim().slice(0, 90)
    }
    card.value = {
      status: (mine[0]?.content || '').trim().slice(0, 90),
      ideal: atStage('goal_setting'),
      resources: '',
      action: atStage('action_planning') || (draft.stageDraft || '').trim().slice(0, 90),
      when: '今天睡前',
      condition: '写下来就算完成',
    }
  } catch (e) {
    dialogError.value = e instanceof Error ? e.message : '这次对话的草稿没取到，可以直接在下面写。'
  } finally {
    draftLoading.value = false
  }
}

async function confirmJournal() {
  const cid = endedConv.value
  if (!cid || summarizing.value) return
  if (!canSave.value) {
    dialogError.value = '还差一点：「这次谈到的事」和「我的一小步」（含时间与完成条件）都要写上。'
    return
  }
  summarizing.value = true
  dialogError.value = ''
  try {
    const result = await post<SummaryConfirm>(`/ai-conversations/${cid}/summary/confirm`, {
      content: composeJournal(card.value),
      moodType: moodType.value,
    })
    savedJournalId.value = result.journalId
  } catch (e) {
    dialogError.value = e instanceof Error ? e.message : '保存失败，请稍后重试'
  } finally {
    summarizing.value = false
  }
}
</script>

<template>
  <div class="video-call-page">
    <div class="flex justify-end shrink-0">
      <RouterLink
        to="/self-coaching/history"
        class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-pine pressable"
      >
        <ChatDots :size="16" weight="duotone" />
        历史记录
      </RouterLink>
    </div>

    <div v-if="platform?.aiDisclaimer" class="ai-banner">
      <span class="ai-badge">AI 生成</span>
      <span class="ai-text">{{ platform.aiDisclaimer }}</span>
    </div>

    <div class="panel-wrap">
      <VideoCallPanel @conversation-ended="askJournal" />
    </div>

    <Teleport to="body">
      <div
        v-if="endedConv !== null"
        ref="journalDialog"
        tabindex="-1"
        @keydown="trapDialogFocus"
        @keydown.esc="closeJournal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="收束这次对话"
      >
        <div class="absolute inset-0 bg-ink/40" @click="closeJournal"></div>
        <div class="relative w-full max-w-[520px] bg-card rounded-[14px] border border-hairline p-6">
          <template v-if="savedJournalId !== null">
            <h2 class="text-lg font-semibold tracking-tight">这次聊的已经收好尾了</h2>
            <p class="mt-2 text-sm text-ink-soft leading-relaxed">
              已经记进你的情绪日记。里面的「我的一小步」同时成了「我的成长」里的下一步行动——
              明天回到那儿，可以告诉我它做没做完。
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <RouterLink
                to="/my"
                class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable closing-card__link"
              >
                去我的成长
              </RouterLink>
              <RouterLink
                :to="{ path: '/emotion-journal', query: { journalId: savedJournalId } }"
                class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium pressable closing-card__link"
              >
                看这条日记
              </RouterLink>
            </div>
          </template>

          <template v-else>
            <h2 class="text-lg font-semibold tracking-tight">把这次聊的收个尾</h2>
            <p class="mt-2 text-sm text-ink-soft leading-relaxed">
              下面几行是用你自己说过的话起头的初稿，每一条都能改。<strong>以你确认为准</strong>：AI
              替你整理，但不替你下结论，也不给你贴标签。
            </p>

            <p v-if="draftLoading" class="mt-3 text-sm text-ink-soft" role="status">
              正在整理这次对话…
            </p>
            <div v-else class="closing-card">
              <label class="closing-card__field">
                <span class="closing-card__name">这次谈到的事</span>
                <textarea
                  v-model="card.status"
                  rows="2"
                  maxlength="90"
                  class="closing-card__input"
                  placeholder="用你刚才的话，一句就够"
                ></textarea>
              </label>
              <label class="closing-card__field">
                <span class="closing-card__name">你希望的变化</span>
                <textarea
                  v-model="card.ideal"
                  rows="2"
                  maxlength="90"
                  class="closing-card__input"
                  placeholder="如果好一点，会是什么样子（可以不填）"
                ></textarea>
              </label>
              <label class="closing-card__field">
                <span class="closing-card__name">你已经有的</span>
                <textarea
                  v-model="card.resources"
                  rows="2"
                  maxlength="90"
                  class="closing-card__input"
                  placeholder="你用过的办法、能帮上你的人（可以不填）"
                ></textarea>
              </label>
              <label class="closing-card__field">
                <span class="closing-card__name">我的一小步</span>
                <textarea
                  v-model="card.action"
                  rows="2"
                  maxlength="90"
                  class="closing-card__input"
                  placeholder="小到今晚就能做完的那种"
                ></textarea>
                <span class="closing-card__hint">用一句话描述；换行会在保存时合并，时间和完成条件不会丢。</span>
              </label>

              <div class="closing-card__row">
                <label class="closing-card__field">
                  <span class="closing-card__name">什么时候做</span>
                  <input v-model="card.when" maxlength="20" class="closing-card__input" placeholder="今晚睡前" />
                </label>
                <label class="closing-card__field">
                  <span class="closing-card__name">怎么算完成</span>
                  <input
                    v-model="card.condition"
                    maxlength="24"
                    class="closing-card__input"
                    placeholder="三件事都写下来"
                  />
                </label>
              </div>

              <label class="closing-card__field closing-card__field--mood">
                <span class="closing-card__name">这次更接近哪种感受</span>
                <select v-model="moodType" class="closing-card__input">
                  <option v-for="mood in MOODS" :key="mood.key" :value="mood.key">{{ mood.label }}</option>
                </select>
              </label>
            </div>

            <p v-if="dialogError" role="alert" class="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
              {{ dialogError }}
            </p>
            <p class="closing-card__note">
              确认后会记进情绪日记；「我的一小步」会出现在「我的成长」的下一步行动里，明天可以回访。
            </p>

            <div class="mt-6 flex justify-end gap-2">
              <button
                type="button"
                class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                :disabled="summarizing"
                @click="closeJournal"
              >
                暂不记录
              </button>
              <button
                type="button"
                class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium pressable disabled:opacity-50"
                :disabled="summarizing || draftLoading || !canSave"
                @click="confirmJournal"
              >
                {{ summarizing ? '正在记…' : '确认并记进情绪日记' }}
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="showAck"
        ref="ackDialog"
        tabindex="-1"
        @keydown="trapDialogFocus"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="AI 自我教练说明"
      >
        <div class="absolute inset-0 bg-ink/40"></div>
        <div class="relative w-full max-w-[420px] bg-card rounded-[14px] border border-hairline p-6">
          <span class="w-11 h-11 rounded-full bg-pine-soft text-pine flex items-center justify-center">
            <WarningCircle :size="22" weight="duotone" />
          </span>
          <h2 class="mt-3 text-lg font-semibold tracking-tight">AI 自我教练说明</h2>
          <p class="mt-2 text-sm text-ink-soft leading-relaxed">
            本功能由人工智能生成回复，非人工心理服务，内容仅供参考，不提供诊断或治疗。
          </p>
          <p class="mt-2 text-sm text-ink-soft leading-relaxed">
            如处于心理危机或紧急状态，请立即拨打心理援助热线
            <span class="font-semibold text-pine">{{ platform?.hotline ?? '12356' }}</span>
            或前往就近医疗机构。
          </p>
          <RouterLink to="/terms" class="mt-3 inline-block text-sm text-pine underline underline-offset-2">
            查看《服务协议与免责声明》
          </RouterLink>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"
              @click="ack"
            >
              我已知晓，开始使用
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.video-call-page {
  position: fixed;
  left: 0;
  right: 0;
  top: 64px;
  bottom: 0;
  background: var(--color-paper);
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 10px;
}
.ai-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-pine-deep);
  background: var(--color-pine-soft);
  border-radius: 999px;
  padding: 3px 8px;
}
.ai-text {
  font-size: 12px;
  color: var(--color-ink-soft);
  line-height: 1.5;
}
.panel-wrap {
  flex: 1;
  min-height: 0;
}
/* 收束卡：四行都能改，行动那行带时间与完成条件 */
.closing-card {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 46vh;
  overflow-y: auto;
  padding-inline-end: 2px;
}
.closing-card__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.closing-card__name {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-ink-soft);
}
.closing-card__hint {
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-ink-soft);
}
.closing-card__input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-ink);
  background: var(--color-paper);
  border: 1px solid var(--color-hairline);
  border-radius: 10px;
  padding: 8px 10px;
  resize: vertical;
}
.closing-card__input:focus-visible {
  outline: 2px solid var(--color-pine);
  outline-offset: 1px;
}
.closing-card__row {
  display: flex;
  gap: 10px;
}
.closing-card__row > .closing-card__field {
  flex: 1;
  min-width: 0;
}
.closing-card__field--mood {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.closing-card__field--mood .closing-card__input {
  width: auto;
  min-width: 120px;
}
.closing-card__note {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-ink-soft);
}
.closing-card__link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}
@media (max-width: 640px) {
  .video-call-page {
    top: 56px;
    bottom: 64px;
    padding: 10px;
  }
  .closing-card__row,
  .closing-card__field--mood {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
