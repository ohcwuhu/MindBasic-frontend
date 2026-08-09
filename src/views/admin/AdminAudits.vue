<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhCaretDown as CaretDown, PhEye as Eye } from '@phosphor-icons/vue'
import { get, post } from '@/api/client'
import type { AuditDetail, AuditItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'
import StatusBadge from '@/components/admin/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'

const rows = ref<AuditItem[]>([])
const statusFilter = ref('PENDING')
const loading = ref(false)
const error = ref('')
const success = ref('')
const expandedId = ref<number | null>(null)
const detail = ref<AuditDetail | null>(null)
const rejectReason = ref('')
const rejectTarget = ref<number | null>(null)
const approveTarget = ref<number | null>(null)

const statusMap = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await get<{ items: AuditItem[] }>(
      `/admin/coach-audits?status=${statusFilter.value}&page=1&pageSize=50`,
    )
    rows.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function toggleExpand(audit: AuditItem) {
  if (expandedId.value === audit.id) {
    expandedId.value = null
    detail.value = null
    return
  }
  expandedId.value = audit.id
  detail.value = null
  try {
    detail.value = await get<AuditDetail>(`/admin/coach-audits/${audit.id}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '详情加载失败'
  }
}

async function confirmApprove() {
  if (!approveTarget.value) return
  const id = approveTarget.value
  approveTarget.value = null
  try {
    await post(`/admin/coach-audits/${id}/approve`)
    flash('已通过该入驻申请')
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function confirmReject() {
  if (!rejectTarget.value) return
  if (!rejectReason.value.trim()) {
    error.value = '请填写驳回理由'
    return
  }
  const id = rejectTarget.value
  rejectTarget.value = null
  try {
    await post(`/admin/coach-audits/${id}/reject`, { reason: rejectReason.value.trim() })
    rejectReason.value = ''
    flash('已驳回该申请')
    await load()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

function flash(message: string) {
  success.value = message
  setTimeout(() => (success.value = ''), 2500)
}

async function previewFile(url: string) {
  try {
    const token = localStorage.getItem('mb_access_token')
    const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!resp.ok) throw new Error()
    window.open(URL.createObjectURL(await resp.blob()), '_blank')
  } catch {
    error.value = '文件预览失败'
  }
}

function shortFile(url: string): string {
  const parts = url.split('/')
  return parts[parts.length - 2]?.slice(0, 12) ?? '文件'
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="s in ['PENDING', 'APPROVED', 'REJECTED'] as const"
        :key="s"
        type="button"
        class="h-9 px-4 rounded-full border text-sm pressable"
        :class="statusFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
        @click="statusFilter = s; load()"
      >
        {{ statusMap[s] }}
      </button>
    </div>

    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine-deep">{{ success }}</p>

    <div class="mt-6 bg-card border border-hairline rounded-[14px] overflow-hidden">
      <div v-if="loading" class="space-y-3 p-5">
        <div v-for="i in 5" :key="i" class="h-12 rounded-[10px] bg-hairline/60 animate-pulse"></div>
      </div>
      <template v-else>
        <div v-if="rows.length" class="divide-y divide-hairline">
          <div v-for="audit in rows" :key="audit.id" class="border-b border-hairline last:border-0">
            <button
              type="button"
              class="w-full px-5 py-4 flex items-center justify-between gap-4 text-left pressable"
              @click="toggleExpand(audit)"
            >
              <div class="min-w-0">
                <p class="font-medium truncate">
                  {{ audit.coachName }}
                  <span class="catalog-tab">第 {{ audit.submitVersion }} 次提交</span>
                </p>
                <p class="mt-1 text-sm text-ink-soft">
                  {{ new Date(audit.submittedAt).toLocaleString('zh-CN', { hour12: false }) }}
                </p>
                <p v-if="audit.remark" class="mt-1 text-sm text-red-800">驳回：{{ audit.remark }}</p>
              </div>
              <span class="flex items-center gap-2 shrink-0">
                <StatusBadge :status="audit.status" :map="statusMap" />
                <CaretDown :size="16" class="text-ink-faint" :class="expandedId === audit.id ? 'rotate-180' : ''" />
              </span>
            </button>

            <div
              v-if="expandedId === audit.id && detail"
              class="px-5 pb-5 -mt-1 grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm"
            >
              <p><span class="catalog-tab">真实姓名</span><br />{{ detail.snapshot.realName }}</p>
              <p><span class="catalog-tab">从业年限</span><br />{{ detail.snapshot.yearsOfExperience }} 年</p>
              <p class="md:col-span-2"><span class="catalog-tab">培训经历</span><br />{{ detail.snapshot.trainingExp || '未填写' }}</p>
              <p class="md:col-span-2"><span class="catalog-tab">服务理念</span><br />{{ detail.snapshot.serviceConcept || '未填写' }}</p>
              <p class="md:col-span-2">
                <span class="catalog-tab">服务项目</span><br />
                {{
                  (detail.snapshot.services ?? [])
                    .map((s) => `${s.name}（¥${(s.priceInCents / 100).toFixed(0)}）`)
                    .join('、') || '未设置'
                }}
              </p>
              <div class="md:col-span-2">
                <span class="catalog-tab">资料文件</span>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    v-for="url in detail.snapshot.credentialUrls ?? []"
                    :key="url"
                    type="button"
                    class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-pine inline-flex items-center gap-1.5 pressable"
                    @click="previewFile(url)"
                  >
                    <Eye :size="15" /> 证书 {{ shortFile(url) }}
                  </button>
                  <button
                    v-if="detail.snapshot.idCardUrl"
                    type="button"
                    class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-pine inline-flex items-center gap-1.5 pressable"
                    @click="previewFile(detail.snapshot.idCardUrl)"
                  >
                    <Eye :size="15" /> 身份证
                  </button>
                </div>
              </div>
              <div v-if="audit.status === 'PENDING'" class="md:col-span-2 flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  class="h-10 px-5 rounded-full bg-pine text-card text-sm font-medium pressable"
                  @click="approveTarget = audit.id"
                >
                  通过
                </button>
                <input
                  v-model="rejectReason"
                  class="h-10 flex-1 min-w-[220px] px-4 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine"
                  placeholder="驳回理由（必填）"
                />
                <button
                  type="button"
                  class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
                  @click="rejectTarget = audit.id"
                >
                  驳回
                </button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else title="这个状态没有审核记录" />
      </template>
    </div>

    <ConfirmDialog
      :open="!!approveTarget"
      title="通过入驻申请"
      message="通过后该用户将获得教练工作台权限，资料对外可见。"
      confirm-text="通过"
      @confirm="confirmApprove"
      @cancel="approveTarget = null"
    />
    <ConfirmDialog
      :open="!!rejectTarget"
      title="驳回入驻申请"
      message="驳回后该用户可在个人中心修改并重新提交。"
      confirm-text="驳回"
      danger
      @confirm="confirmReject"
      @cancel="rejectTarget = null"
    />
  </div>
</template>
