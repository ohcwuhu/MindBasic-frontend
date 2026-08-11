<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  PhCheck as Check,
  PhX as X,
  PhPlus as Plus,
  PhTrash as Trash,
  PhCalendarCheck as CalendarCheck,
  PhCardsThree as CardsThree,
  PhClock as Clock,
  PhSparkle as Sparkle,
  PhUsers as UsersIcon,
  PhChatCircleText as ChatIcon,
} from '@phosphor-icons/vue'
import { ApiError, del, get, patch, post, put, uploadFile } from '@/api/client'
import type {
  CaseRecord,
  CaseStats,
  CoachAppointment,
  CoachProfile,
  CoachService,
  CoachSlotItem,
  Client,
  Phrase,
  PlatformPhrase,
  Tag,
} from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'
import EmptyState from '@/components/EmptyState.vue'

type WorkTab = 'appointments' | 'cases' | 'services' | 'slots' | 'clients' | 'phrases' | 'profile'

const loading = ref(true)
const error = ref('')
const errorDetails = ref<{ field: string; message: string }[]>([])
const profile = ref<CoachProfile | null>(null)
const mode = ref<'form' | 'status' | 'workbench'>('form')
const submitting = ref(false)

// ---------- 入驻表单 ----------
const form = reactive({
  realName: '',
  bio: '',
  trainingExp: '',
  serviceConcept: '',
  yearsOfExperience: '',
})
const credentialFiles = ref<{ url: string; name: string }[]>([])
const idCardFile = ref<{ url: string; name: string } | null>(null)
const uploadingFile = ref(false)
const tags = ref<Tag[]>([])
const selectedTagIds = ref<number[]>([])
const serviceRows = ref<
  { name: string; serviceType: 'SINGLE' | 'PACKAGE'; durationMin: string; priceInCents: string; description: string }[]
>([])

async function fetchTags() {
  try {
    const data = await get<{ items: Tag[] }>('/tags')
    tags.value = data.items
  } catch {
    tags.value = []
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    profile.value = await get<CoachProfile>('/coach/profile')
    mode.value = profile.value.auditStatus === 'APPROVED' ? 'workbench' : 'status'
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      mode.value = 'form'
      await fetchTags()
    } else {
      error.value = e instanceof Error ? e.message : '加载失败'
      mode.value = 'form'
    }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function toggleTag(id: number) {
  selectedTagIds.value = selectedTagIds.value.includes(id)
    ? selectedTagIds.value.filter((t) => t !== id)
    : [...selectedTagIds.value, id]
}

function showError(e: unknown) {
  error.value = e instanceof Error ? e.message : '操作失败'
  errorDetails.value = e instanceof ApiError && e.errors?.length ? e.errors : []
}

function addServiceRow() {
  serviceRows.value.push({
    name: '',
    serviceType: 'SINGLE',
    durationMin: '60',
    priceInCents: '9900',
    description: '',
  })
}

async function onCredentialsChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploadingFile.value = true
  error.value = ''
  try {
    for (const file of files) {
      const result = await uploadFile(file, 'credential')
      credentialFiles.value.push({ url: result.url, name: result.originalName || file.name })
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    uploadingFile.value = false
    input.value = ''
  }
}

async function onIdCardChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingFile.value = true
  error.value = ''
  try {
    const result = await uploadFile(file, 'idcard')
    idCardFile.value = { url: result.url, name: result.originalName || file.name }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '上传失败'
  } finally {
    uploadingFile.value = false
    input.value = ''
  }
}

function fileName(url: string): string {
  const parts = url.split('/')
  return parts[parts.length - 2] ?? url
}

async function submitProfile() {
  error.value = ''
  errorDetails.value = []
  const years = Number(form.yearsOfExperience)
  if (!Number.isInteger(years) || years < 0 || years > 60) {
    error.value = '从业年限需为 0-60 之间的整数'
    return
  }
  const badService = serviceRows.value.find(
    (s) => s.name.trim() && (Number(s.priceInCents) <= 0 || Number(s.durationMin) < 15),
  )
  if (badService) {
    error.value = `服务「${badService.name}」价格需大于 0，时长至少 15 分钟`
    return
  }
  submitting.value = true
  try {
    profile.value = await post<CoachProfile>('/coach/profile', {
      realName: form.realName,
      bio: form.bio || null,
      trainingExp: form.trainingExp || null,
      serviceConcept: form.serviceConcept || null,
      yearsOfExperience: Number(form.yearsOfExperience) || 0,
      credentialUrls: credentialFiles.value.map((f) => f.url),
      idCardUrl: idCardFile.value?.url ?? null,
      tagIds: selectedTagIds.value,
      services: serviceRows.value
        .filter((s) => s.name.trim())
        .map((s) => ({
          name: s.name.trim(),
          serviceType: s.serviceType,
          durationMin: Number(s.durationMin) || 60,
          priceInCents: Number(s.priceInCents) || 0,
          description: s.description || null,
        })),
    })
    mode.value = 'status'
  } catch (e) {
    showError(e)
  } finally {
    submitting.value = false
  }
}

async function resubmit() {
  submitting.value = true
  error.value = ''
  try {
    profile.value = await post<CoachProfile>('/coach/profile/submit-audit')
    mode.value = 'status'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '提交失败，请重试'
  } finally {
    submitting.value = false
  }
}

// ---------- 工作台 ----------
const activeTab = ref<WorkTab>('appointments')
const statusFilter = ref('PENDING')

// 预约
const appointments = ref<CoachAppointment[]>([])
const cancelReasons = ref<Record<number, string>>({})

async function loadAppointments() {
  try {
    const data = await get<{ items: CoachAppointment[] }>(
      `/coach/appointments?status=${statusFilter.value}&page=1&pageSize=50`,
    )
    appointments.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '预约加载失败'
  }
}

async function confirmAppointment(id: number) {
  try {
    await post(`/coach/appointments/${id}/confirm`)
    await loadAppointments()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function cancelAppointment(id: number) {
  const reason = cancelReasons.value[id]?.trim()
  if (!reason) {
    error.value = '请填写取消原因'
    return
  }
  try {
    await post(`/coach/appointments/${id}/cancel`, { cancelReason: reason })
    delete cancelReasons.value[id]
    await loadAppointments()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

async function completeAppointment(id: number) {
  try {
    await post(`/coach/appointments/${id}/complete`)
    await loadAppointments()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

// 个案
const cases = ref<CaseRecord[]>([])
const caseStats = ref<CaseStats | null>(null)
const caseForm = reactive({
  appointmentId: '',
  clientNickname: '',
  keyPoints: '',
  userGains: '',
  followupAdvice: '',
  durationMin: '60',
})

async function loadCases() {
  try {
    const [list, stats] = await Promise.all([
      get<{ items: CaseRecord[] }>('/coach/cases?page=1&pageSize=50'),
      get<CaseStats>('/coach/cases/stats'),
    ])
    cases.value = list.items
    caseStats.value = stats
  } catch (e) {
    error.value = e instanceof Error ? e.message : '个案加载失败'
  }
}

async function exportCases() {
  const token = localStorage.getItem('mb_access_token')
  try {
    const resp = await fetch('/api/v1/coach/cases/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) {
      error.value = '导出失败，请重试'
      return
    }
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `个案记录_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    error.value = '导出失败，请重试'
  }
}

async function createCase() {
  try {
    await post('/coach/cases', {
      appointmentId: caseForm.appointmentId ? Number(caseForm.appointmentId) : null,
      clientNickname: caseForm.clientNickname || null,
      keyPoints: caseForm.keyPoints || null,
      userGains: caseForm.userGains || null,
      followupAdvice: caseForm.followupAdvice || null,
      durationMin: Number(caseForm.durationMin) || 0,
    })
    Object.assign(caseForm, {
      appointmentId: '',
      clientNickname: '',
      keyPoints: '',
      userGains: '',
      followupAdvice: '',
      durationMin: 60,
    })
    await loadCases()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  }
}

async function removeCase(id: number) {
  try {
    await del(`/coach/cases/${id}`)
    await loadCases()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

// 服务
const services = ref<CoachService[]>([])
const serviceForm = reactive({
  name: '',
  serviceType: 'SINGLE' as 'SINGLE' | 'PACKAGE',
  durationMin: '60',
  priceInCents: '9900',
  description: '',
})

// ---------- 客户管理 ----------
const clients = ref<Client[]>([])
const clientKeyword = ref('')
const clientRemarks = ref<Record<number, string>>({})

async function loadClients() {
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' })
    if (clientKeyword.value) params.set('keyword', clientKeyword.value)
    const data = await get<{ items: Client[] }>(`/coach/clients?${params.toString()}`)
    clients.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '客户加载失败'
  }
}

async function saveClientRemark(client: Client) {
  try {
    await patch(`/coach/clients/${client.id}`, { remark: clientRemarks.value[client.id] ?? null })
    client.remark = clientRemarks.value[client.id] ?? null
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

// ---------- 话术库 ----------
const platformPhrases = ref<PlatformPhrase[]>([])
const phraseCategory = ref('')
const myPhrases = ref<Phrase[]>([])
const phraseForm = reactive({ category: 'OPENING' as string, content: '' })

async function loadPhrases() {
  try {
    const [platform, mine] = await Promise.all([
      get<{ items: PlatformPhrase[] }>(`/phrase-library${phraseCategory.value ? `?category=${phraseCategory.value}` : ''}`),
      get<{ items: Phrase[] }>('/coach/phrases'),
    ])
    platformPhrases.value = platform.items
    myPhrases.value = mine.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '话术加载失败'
  }
}

async function savePlatformPhrase(id: number) {
  try {
    await post('/coach/phrases/save', { phraseId: id })
    await loadPhrases()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '收藏失败'
  }
}

async function createCustomPhrase() {
  if (!phraseForm.content.trim()) return
  try {
    await post('/coach/phrases', { category: phraseForm.category, content: phraseForm.content.trim() })
    phraseForm.content = ''
    await loadPhrases()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

async function removePhrase(id: number) {
  try {
    await del(`/coach/phrases/${id}`)
    await loadPhrases()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

async function loadServices() {
  try {
    const data = await get<{ items: CoachService[] }>('/coach/services')
    services.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '服务加载失败'
  }
}

async function createService() {
  if (!serviceForm.name.trim()) return
  try {
    await post('/coach/services', {
      name: serviceForm.name.trim(),
      serviceType: serviceForm.serviceType,
      durationMin: Number(serviceForm.durationMin) || 60,
      priceInCents: Number(serviceForm.priceInCents) || 0,
      description: serviceForm.description || null,
    })
    serviceForm.name = ''
    serviceForm.description = ''
    await loadServices()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '创建失败'
  }
}

async function toggleService(service: CoachService) {
  try {
    await patch(`/coach/services/${service.id}`, { isEnabled: !service.isEnabled })
    await loadServices()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  }
}

const editingService = ref<CoachService | null>(null)
const serviceEditForm = reactive({ name: '', serviceType: 'SINGLE' as 'SINGLE' | 'PACKAGE', durationMin: '60', priceInCents: '9900', description: '' })

function startEditService(service: CoachService) {
  editingService.value = service
  serviceEditForm.name = service.name
  serviceEditForm.serviceType = service.serviceType
  serviceEditForm.durationMin = String(service.durationMin)
  serviceEditForm.priceInCents = String(service.priceInCents)
  serviceEditForm.description = service.description ?? ''
}

async function saveServiceEdit() {
  if (!editingService.value || !serviceEditForm.name.trim()) return
  try {
    await patch(`/coach/services/${editingService.value.id}`, {
      name: serviceEditForm.name.trim(),
      serviceType: serviceEditForm.serviceType,
      durationMin: Number(serviceEditForm.durationMin) || 60,
      priceInCents: Number(serviceEditForm.priceInCents) || 0,
      description: serviceEditForm.description || null,
    })
    editingService.value = null
    await loadServices()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

// 时段
const slots = ref<CoachSlotItem[]>([])
const weekdays = ref([1, 2, 3, 4, 5])
const slotStart = ref('10:00')
const slotEnd = ref('11:00')
const timeOptions = Array.from({ length: 25 }, (_, i) => {
  const h = String(Math.floor(i / 2) + 8).padStart(2, '0')
  const m = i % 2 === 0 ? '00' : '30'
  return `${h}:${m}`
}).filter((t) => t >= '08:00' && t <= '20:30')

async function loadSlots() {
  try {
    const data = await get<{ items: CoachSlotItem[] }>('/coach/slots')
    slots.value = data.items
  } catch (e) {
    error.value = e instanceof Error ? e.message : '时段加载失败'
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function buildSlotList(): { date: string; startTime: string; endTime: string }[] {
  const list: { date: string; startTime: string; endTime: string }[] = []
  const today = new Date()
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    if (weekdays.value.includes(d.getDay())) {
      list.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        startTime: slotStart.value,
        endTime: slotEnd.value,
      })
    }
  }
  return list
}

async function saveSlots() {
  const list = buildSlotList()
  if (!list.length) {
    error.value = '请至少选择一个星期'
    return
  }
  try {
    await put('/coach/slots', { slots: list })
    await loadSlots()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  }
}

// 资料
function fillFormFromProfile() {
  if (!profile.value) return
  form.realName = profile.value.realName
  form.bio = profile.value.bio ?? ''
  form.trainingExp = profile.value.trainingExp ?? ''
  form.serviceConcept = profile.value.serviceConcept ?? ''
  form.yearsOfExperience = String(profile.value.yearsOfExperience)
  credentialFiles.value = (profile.value.credentialUrls ?? []).map((url) => ({ url, name: fileName(url) }))
  idCardFile.value = profile.value.idCardUrl ? { url: profile.value.idCardUrl, name: fileName(profile.value.idCardUrl) } : null
  selectedTagIds.value = profile.value.tags.map((t) => t.id)
}

async function saveProfile() {
  submitting.value = true
  error.value = ''
  try {
    profile.value = await patch<CoachProfile>('/coach/profile', {
      realName: form.realName,
      bio: form.bio || null,
      trainingExp: form.trainingExp || null,
      serviceConcept: form.serviceConcept || null,
      yearsOfExperience: Number(form.yearsOfExperience) || 0,
      credentialUrls: credentialFiles.value.map((f) => f.url),
      idCardUrl: idCardFile.value?.url ?? null,
      tagIds: selectedTagIds.value,
    })
    mode.value = profile.value.auditStatus === 'APPROVED' ? 'workbench' : 'status'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}

async function switchTab(tab: WorkTab) {
  activeTab.value = tab
  error.value = ''
  if (tab === 'appointments') await loadAppointments()
  else if (tab === 'cases') await loadCases()
  else if (tab === 'services') await loadServices()
  else if (tab === 'slots') await loadSlots()
  else if (tab === 'clients') await loadClients()
  else if (tab === 'phrases') await loadPhrases()
  else fillFormFromProfile()
}

const phraseCategoryLabel: Record<string, string> = {
  OPENING: '开场',
  RESOURCE: '资源问句',
  FUTURE: '未来导向',
  ACTION: '行动引导',
  OTHER: '其他',
}

const statusLabel: Record<string, string> = { PENDING: '待确认', CONFIRMED: '已确认', COMPLETED: '已完成', CANCELLED: '已取消' }
const priceText = (cents: number) => (cents % 100 === 0 ? `¥${cents / 100}` : `¥${(cents / 100).toFixed(2)}`)
const auditText = computed(() =>
  profile.value?.auditStatus === 'APPROVED'
    ? '已通过审核'
    : profile.value?.auditStatus === 'REJECTED'
      ? '被驳回，请修改后重新提交'
      : '审核中',
)
</script>

<template>
  <div class="max-w-[880px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">COACH 教练工作台</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">教练工作台</h1>

    <ErrorBanner v-if="error" :message="error" :details="errorDetails" class="mt-8" />

    <div v-if="loading" class="mt-8 h-96 rounded-[14px] bg-hairline/60 animate-pulse"></div>

    <!-- 入驻表单 -->
    <form v-else-if="mode === 'form'" class="mt-8 space-y-6" @submit.prevent="submitProfile">
      <section class="card p-6 md:p-8">
        <p class="catalog-tab">基本信息</p>
        <div class="mt-5 grid md:grid-cols-2 gap-5">
          <FieldInput v-model="form.realName" label="真实姓名" placeholder="用于后台审核" />
          <FieldInput v-model="form.yearsOfExperience" label="从业年限" type="number" />
        </div>
        <div class="mt-5 space-y-5">
          <label class="block">
            <span class="text-sm font-medium text-ink">个人简介</span>
            <textarea v-model="form.bio" rows="3" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine" placeholder="一句话介绍你自己…"></textarea>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">培训经历</span>
            <textarea v-model="form.trainingExp" rows="3" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine" placeholder="培训、认证与督导经历…"></textarea>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">服务理念</span>
            <input v-model="form.serviceConcept" class="mt-2 w-full h-12 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine" placeholder="赋能、陪伴、资源导向" />
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">资质证书 / 照片（支持多张）</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              :disabled="uploadingFile"
              class="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-pine file:px-4 file:text-card file:text-sm file:font-medium file:cursor-pointer"
              @change="onCredentialsChange"
            />
            <ul v-if="credentialFiles.length" class="mt-2 space-y-1">
              <li v-for="(file, i) in credentialFiles" :key="file.url" class="flex items-center justify-between gap-3 text-sm bg-paper border border-hairline rounded-[10px] px-3 py-2">
                <span class="truncate">{{ file.name }}</span>
                <button type="button" class="text-ink-faint hover:text-red-800 pressable" :aria-label="`移除第 ${i + 1} 个文件`" @click="credentialFiles.splice(i, 1)">
                  <X :size="16" />
                </button>
              </li>
            </ul>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">身份证扫描件（仅后台可见）</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="uploadingFile"
              class="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-pine file:px-4 file:text-card file:text-sm file:font-medium file:cursor-pointer"
              @change="onIdCardChange"
            />
            <div v-if="idCardFile" class="mt-2 flex items-center justify-between gap-3 text-sm bg-paper border border-hairline rounded-[10px] px-3 py-2">
              <span class="truncate">{{ idCardFile.name }}</span>
              <button type="button" class="text-ink-faint hover:text-red-800 pressable" aria-label="移除身份证文件" @click="idCardFile = null">
                <X :size="16" />
              </button>
            </div>
          </label>
          <p v-if="uploadingFile" class="text-sm text-pine">正在上传…</p>
        </div>
      </section>

      <section class="card p-6 md:p-8">
        <p class="catalog-tab">擅长标签</p>
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="tag in tags"
            :key="tag.id"
            type="button"
            class="h-9 px-4 rounded-full border text-sm pressable"
            :class="selectedTagIds.includes(tag.id) ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
            @click="toggleTag(tag.id)"
          >
            {{ tag.name }}
          </button>
        </div>
      </section>

      <section class="card p-6 md:p-8">
        <div class="flex items-center justify-between">
          <p class="catalog-tab">服务项目</p>
          <button type="button" class="inline-flex items-center gap-1 text-sm text-pine pressable" @click="addServiceRow">
            <Plus :size="16" weight="bold" /> 添加服务
          </button>
        </div>
        <div v-for="(row, i) in serviceRows" :key="i" class="mt-4 grid md:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <FieldInput v-model="row.name" label="服务名称" placeholder="如：单次咨询" />
          <label class="block">
            <span class="text-sm font-medium text-ink">类型</span>
            <select v-model="row.serviceType" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
              <option value="SINGLE">单次</option>
              <option value="PACKAGE">套餐</option>
            </select>
          </label>
          <FieldInput v-model="row.durationMin" label="时长(分钟)" type="number" />
          <FieldInput v-model="row.priceInCents" label="价格(分)" type="number" />
          <button type="button" class="h-12 w-10 flex items-center justify-center text-ink-faint hover:text-red-800 pressable" :aria-label="`删除服务 ${i + 1}`" @click="serviceRows.splice(i, 1)">
            <Trash :size="18" />
          </button>
        </div>
      </section>

      <button
        type="submit"
        :disabled="submitting || !form.realName.trim()"
        class="w-full md:w-auto h-12 px-8 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-50 pressable"
      >
        {{ submitting ? '提交中…' : '提交入驻申请' }}
      </button>
    </form>

    <!-- 审核状态 -->
    <section v-else-if="mode === 'status'" class="card mt-8 p-8 md:p-10 text-center">
      <span class="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
        :class="profile?.auditStatus === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-pine-soft text-pine'">
        <Clock :size="26" weight="duotone" />
      </span>
      <h2 class="mt-4 text-xl font-semibold tracking-tight">{{ auditText }}</h2>
      <p v-if="profile?.auditStatus === 'REJECTED' && profile.auditRemark" class="mt-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-[10px] px-4 py-3">
        驳回原因：{{ profile.auditRemark }}
      </p>
      <p v-else class="mt-3 text-sm text-ink-soft leading-relaxed">
        资料已提交，管理员审核通过后即可使用教练工作台。
      </p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <button v-if="profile?.auditStatus === 'REJECTED'" type="button" :disabled="submitting" class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium pressable" @click="resubmit">
          {{ submitting ? '提交中…' : '修改并重新提交' }}
        </button>
        <RouterLink to="/my" class="inline-flex items-center gap-1.5 h-11 px-6 rounded-full border border-hairline bg-card text-ink pressable">返回我的成长</RouterLink>
      </div>
    </section>

    <!-- 工作台 -->
    <template v-else>
      <div class="mt-8 flex flex-wrap gap-2">
        <button v-for="tab in [
          { key: 'appointments', label: '预约管理', icon: CalendarCheck },
          { key: 'cases', label: '个案记录', icon: CardsThree },
          { key: 'services', label: '服务项目', icon: Plus },
          { key: 'slots', label: '时段设置', icon: Clock },
          { key: 'clients', label: '客户管理', icon: UsersIcon },
          { key: 'phrases', label: '话术库', icon: ChatIcon },
          { key: 'profile', label: '资料设置', icon: Sparkle },
        ] as const" :key="tab.key" type="button" class="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border text-sm pressable"
          :class="activeTab === tab.key ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
          @click="switchTab(tab.key)">
          <component :is="tab.icon" :size="16" weight="duotone" /> {{ tab.label }}
        </button>
      </div>

      <!-- 预约 -->
      <section v-if="activeTab === 'appointments'" class="mt-8">
        <div class="flex flex-wrap gap-2">
          <button v-for="s in ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED']" :key="s" type="button" class="h-8 px-3 rounded-full border text-xs pressable"
            :class="statusFilter === s ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'" @click="statusFilter = s; loadAppointments()">
            {{ statusLabel[s] }}
          </button>
        </div>
        <div v-if="appointments.length" class="mt-4 divide-y divide-hairline border-y border-hairline">
          <div v-for="item in appointments" :key="item.id" class="py-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="font-medium">{{ item.user.nickname }}（{{ item.user.phone }}）</p>
                <p class="mt-1 text-sm text-ink-soft">{{ item.service.name }} · {{ item.slot.date }} {{ item.slot.startTime }}</p>
                <p class="mt-1 text-sm text-ink-soft">需求：{{ item.needDesc }}</p>
              </div>
              <span class="shrink-0 text-xs px-2.5 py-1 rounded-full bg-paper border border-hairline text-ink-soft">{{ statusLabel[item.status] }}</span>
            </div>
            <div v-if="item.status === 'PENDING' || item.status === 'CONFIRMED'" class="mt-4 flex flex-wrap items-center gap-2">
              <button v-if="item.status === 'PENDING'" type="button" class="h-9 px-4 rounded-full bg-pine text-card text-sm pressable" @click="confirmAppointment(item.id)">确认</button>
              <input v-model="cancelReasons[item.id]" class="h-9 flex-1 min-w-[180px] px-3 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine" placeholder="取消原因（必填）" />
              <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="cancelAppointment(item.id)">取消</button>
              <button v-if="item.status === 'CONFIRMED'" type="button" class="h-9 px-4 rounded-full bg-pine-soft text-pine-deep text-sm pressable" @click="completeAppointment(item.id)">标记完成</button>
            </div>
            <p v-if="item.cancelReason" class="mt-2 text-sm text-ink-soft">取消原因：{{ item.cancelReason }}</p>
          </div>
        </div>
        <EmptyState v-else title="这个状态暂时没有预约" hint="切换到其他状态看看。" />
      </section>

      <!-- 个案 -->
      <section v-else-if="activeTab === 'cases'" class="mt-8">
        <div v-if="caseStats" class="grid grid-cols-3 gap-3">
          <div class="card p-4 text-center">
            <p class="text-2xl font-semibold text-pine">{{ caseStats.totalCases }}</p>
            <p class="catalog-tab mt-1">个案总数</p>
          </div>
          <div class="card p-4 text-center">
            <p class="text-2xl font-semibold text-pine">{{ caseStats.serviceMinutes }}</p>
            <p class="catalog-tab mt-1">服务分钟</p>
          </div>
          <div class="card p-4 text-center">
            <p class="text-2xl font-semibold text-pine">{{ caseStats.clientCount }}</p>
            <p class="catalog-tab mt-1">客户数</p>
          </div>
        </div>

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
            @click="exportCases"
          >
            导出 CSV
          </button>
        </div>

        <div class="card mt-4 p-6">
          <p class="catalog-tab">新建个案记录</p>
          <div class="mt-4 grid md:grid-cols-2 gap-4">
            <FieldInput v-model="caseForm.clientNickname" label="客户称呼" placeholder="如：小满（不填真实姓名）" />
            <FieldInput v-model="caseForm.appointmentId" label="关联预约 ID（可选）" type="number" />
          </div>
          <div class="mt-4 space-y-4">
            <label class="block"><span class="text-sm font-medium text-ink">对话核心要点</span>
              <textarea v-model="caseForm.keyPoints" rows="2" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine"></textarea></label>
            <label class="block"><span class="text-sm font-medium text-ink">用户收获</span>
              <textarea v-model="caseForm.userGains" rows="2" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine"></textarea></label>
            <label class="block"><span class="text-sm font-medium text-ink">后续跟进建议</span>
              <textarea v-model="caseForm.followupAdvice" rows="2" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine"></textarea></label>
          </div>
          <button type="button" class="mt-5 h-10 px-5 rounded-full bg-pine text-card text-sm pressable" @click="createCase">保存个案</button>
        </div>

        <div v-if="cases.length" class="mt-6 divide-y divide-hairline border-y border-hairline">
          <div v-for="record in cases" :key="record.id" class="py-4 flex gap-4">
            <div class="flex-1 min-w-0">
              <p class="font-medium">{{ record.clientNickname || '未命名客户' }}</p>
              <p v-if="record.keyPoints" class="mt-1 text-sm text-ink-soft line-clamp-2">{{ record.keyPoints }}</p>
              <p class="catalog-tab mt-2">{{ record.durationMin }} 分钟 · {{ new Date(record.createdAt).toLocaleDateString('zh-CN') }}</p>
            </div>
            <button type="button" class="self-start p-2 text-ink-faint hover:text-red-800 pressable" @click="removeCase(record.id)"><Trash :size="17" /></button>
          </div>
        </div>
        <EmptyState v-else class="mt-4" title="还没有个案记录" hint="服务完成后在这里沉淀你的专业积累。" />
      </section>

      <!-- 服务 -->
      <section v-else-if="activeTab === 'services'" class="mt-8">
        <div v-if="editingService" class="card p-6 mb-6">
          <p class="catalog-tab">编辑服务项目</p>
          <div class="mt-4 grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3 items-end">
            <FieldInput v-model="serviceEditForm.name" label="名称" />
            <label class="block">
              <span class="text-sm font-medium text-ink">类型</span>
              <select v-model="serviceEditForm.serviceType" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
                <option value="SINGLE">单次</option>
                <option value="PACKAGE">套餐</option>
              </select>
            </label>
            <FieldInput v-model="serviceEditForm.durationMin" label="时长(分钟)" type="number" />
            <FieldInput v-model="serviceEditForm.priceInCents" label="价格(分)" type="number" />
          </div>
          <FieldInput v-model="serviceEditForm.description" label="说明（可选）" class="mt-4" />
          <div class="mt-5 flex gap-2">
            <button type="button" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable" @click="saveServiceEdit">保存</button>
            <button type="button" class="h-11 px-6 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable" @click="editingService = null">取消</button>
          </div>
        </div>
        <div class="card p-6">
          <p class="catalog-tab">新增服务项目</p>
          <div class="mt-4 grid md:grid-cols-[2fr_1fr_1fr_1fr] gap-3 items-end">
            <FieldInput v-model="serviceForm.name" label="名称" placeholder="如：单次咨询" />
            <label class="block">
              <span class="text-sm font-medium text-ink">类型</span>
              <select v-model="serviceForm.serviceType" class="mt-2 w-full h-12 px-3 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine">
                <option value="SINGLE">单次</option>
                <option value="PACKAGE">套餐</option>
              </select>
            </label>
            <FieldInput v-model="serviceForm.durationMin" label="时长(分钟)" type="number" />
            <FieldInput v-model="serviceForm.priceInCents" label="价格(分)" type="number" />
          </div>
          <button type="button" class="mt-5 h-10 px-5 rounded-full bg-pine text-card text-sm pressable" @click="createService">新增服务</button>
        </div>
        <div v-if="services.length" class="mt-6 divide-y divide-hairline border-y border-hairline">
          <div v-for="service in services" :key="service.id" class="py-4 flex items-center justify-between gap-4">
            <div>
              <p class="font-medium">{{ service.name }}</p>
              <p class="mt-1 text-sm text-ink-soft">{{ service.serviceType === 'SINGLE' ? '单次' : '套餐' }} · {{ service.durationMin }} 分钟 · {{ priceText(service.priceInCents) }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button type="button" class="h-9 px-4 rounded-full border border-hairline bg-card text-sm pressable" @click="startEditService(service)">编辑</button>
              <button type="button" class="h-9 px-4 rounded-full border text-sm pressable"
                :class="service.isEnabled ? 'bg-pine-soft border-pine-soft text-pine-deep' : 'bg-paper border-hairline text-ink-faint'"
                @click="toggleService(service)">
                {{ service.isEnabled ? '已上架' : '已下架' }}
              </button>
            </div>
          </div>
        </div>
        <EmptyState v-else class="mt-6" title="还没有服务项目" hint="添加第一个服务，用户才能预约。" />
      </section>

      <!-- 时段 -->
      <section v-else-if="activeTab === 'slots'" class="mt-8">
        <div class="card p-6">
          <p class="catalog-tab">生成未来 14 天时段</p>
          <div class="mt-4 flex flex-wrap items-center gap-4">
            <div class="flex flex-wrap gap-2">
              <button v-for="(label, idx) in ['日', '一', '二', '三', '四', '五', '六']" :key="idx" type="button"
                class="w-10 h-10 rounded-full border text-sm pressable"
                :class="weekdays.includes(idx) ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
                @click="weekdays = weekdays.includes(idx) ? weekdays.filter((w) => w !== idx) : [...weekdays, idx].sort()">
                周{{ label }}
              </button>
            </div>
            <label class="flex items-center gap-2 text-sm text-ink-soft">
              开始
              <select v-model="slotStart" class="h-10 px-3 rounded-[10px] border border-hairline bg-card outline-none focus:border-pine">
                <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="flex items-center gap-2 text-sm text-ink-soft">
              结束
              <select v-model="slotEnd" class="h-10 px-3 rounded-[10px] border border-hairline bg-card outline-none focus:border-pine">
                <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <button type="button" class="h-10 px-5 rounded-full bg-pine text-card text-sm pressable" @click="saveSlots">保存时段</button>
          </div>
          <p class="catalog-tab mt-5">已设置的时段（已预约的不会被覆盖）</p>
          <div v-if="slots.length" class="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <div v-for="slot in slots" :key="slot.id" class="card px-3 py-2.5 text-center"
              :class="slot.status === 'BOOKED' ? 'opacity-60' : ''">
              <p class="text-sm font-medium">{{ slot.date.slice(5) }} {{ slot.startTime }}</p>
              <p class="catalog-tab mt-0.5">{{ slot.status === 'BOOKED' ? '已预约' : slot.status === 'OFF' ? '已关闭' : '可约' }}</p>
            </div>
          </div>
          <EmptyState v-else class="mt-3" title="还没有时段" hint="选择星期与时间后保存。" />
        </div>
      </section>

      <!-- 客户管理 -->
      <section v-else-if="activeTab === 'clients'" class="mt-8">
        <form class="flex gap-2 max-w-lg" @submit.prevent="loadClients">
          <input
            v-model="clientKeyword"
            class="h-11 flex-1 px-4 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
            placeholder="搜索客户昵称"
          />
          <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable">查询</button>
        </form>
        <div v-if="clients.length" class="mt-5 bg-card border border-hairline rounded-[14px] divide-y divide-hairline">
          <div v-for="client in clients" :key="client.id" class="px-5 py-4">
            <div class="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p class="font-medium">{{ client.nickname }} <span class="text-sm text-ink-faint">{{ client.phone }}</span></p>
                <p class="mt-1 text-sm text-ink-soft">
                  最近服务：{{ client.lastAppointmentAt ? new Date(client.lastAppointmentAt).toLocaleDateString('zh-CN') : '—' }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <input
                  v-model="clientRemarks[client.id]"
                  :placeholder="client.remark ?? '备注（可选）'"
                  class="h-9 w-44 px-3 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine"
                />
                <button
                  type="button"
                  class="h-9 px-4 rounded-full bg-pine-soft text-pine-deep text-sm pressable"
                  @click="saveClientRemark(client)"
                >
                  保存备注
                </button>
              </div>
            </div>
          </div>
        </div>
        <EmptyState v-else class="mt-5" title="还没有客户" hint="服务完成后，客户会自动出现在这里。" />
      </section>

      <!-- 话术库 -->
      <section v-else-if="activeTab === 'phrases'" class="mt-8">
        <div class="card p-6">
          <p class="catalog-tab">新增自定义话术</p>
          <form class="mt-4 flex flex-wrap gap-2" @submit.prevent="createCustomPhrase">
            <select v-model="phraseForm.category" class="h-11 px-3 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine">
              <option v-for="(label, key) in phraseCategoryLabel" :key="key" :value="key">{{ label }}</option>
            </select>
            <input
              v-model="phraseForm.content"
              class="h-11 flex-1 min-w-[220px] px-4 rounded-[10px] border border-hairline bg-card text-sm outline-none focus:border-pine"
              placeholder="写下你的话术"
            />
            <button type="submit" class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable">保存</button>
          </form>
        </div>

        <div class="mt-6">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold tracking-tight">我的话术</h2>
            <span class="catalog-tab">{{ myPhrases.length }} 条</span>
          </div>
          <div v-if="myPhrases.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
            <div v-for="phrase in myPhrases" :key="phrase.id" class="py-4 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm leading-relaxed">{{ phrase.content }}</p>
                <p class="catalog-tab mt-1">{{ phraseCategoryLabel[phrase.category] ?? phrase.category }} · {{ phrase.source === 'saved' ? '收藏' : '自定义' }}</p>
              </div>
              <button type="button" class="h-9 w-9 rounded-full border border-hairline flex items-center justify-center text-ink-faint pressable shrink-0" @click="removePhrase(phrase.id)">
                <Trash :size="16" />
              </button>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-ink-soft">还没有话术，可以从平台话术库收藏或自建。</p>
        </div>

        <div class="mt-8">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold tracking-tight">平台话术库</h2>
            <select v-model="phraseCategory" class="h-9 px-3 rounded-full border border-hairline bg-card text-sm outline-none focus:border-pine" @change="loadPhrases">
              <option value="">全部分类</option>
              <option v-for="(label, key) in phraseCategoryLabel" :key="key" :value="key">{{ label }}</option>
            </select>
          </div>
          <div v-if="platformPhrases.length" class="mt-3 divide-y divide-hairline border-y border-hairline">
            <div v-for="phrase in platformPhrases" :key="phrase.id" class="py-4 flex items-center justify-between gap-4">
              <div class="min-w-0">
                <p class="text-sm leading-relaxed">{{ phrase.content }}</p>
                <p class="catalog-tab mt-1">{{ phraseCategoryLabel[phrase.category] ?? phrase.category }}</p>
              </div>
              <button type="button" class="h-9 px-4 rounded-full border border-pine text-pine text-sm pressable shrink-0" @click="savePlatformPhrase(phrase.id)">收藏</button>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-ink-soft">这个分类暂时没有平台话术。</p>
        </div>
      </section>

      <!-- 资料 -->
      <section v-else class="mt-8">
        <div class="rounded-[10px] bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          审核通过后修改资料会触发重新审核，期间资料对外下架。
        </div>
        <form class="card mt-4 p-6 space-y-5" @submit.prevent="saveProfile">
          <div class="grid md:grid-cols-2 gap-5">
            <FieldInput v-model="form.realName" label="真实姓名" />
            <FieldInput v-model="form.yearsOfExperience" label="从业年限" type="number" />
          </div>
          <label class="block"><span class="text-sm font-medium text-ink">个人简介</span>
            <textarea v-model="form.bio" rows="3" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine"></textarea></label>
          <label class="block"><span class="text-sm font-medium text-ink">培训经历</span>
            <textarea v-model="form.trainingExp" rows="3" class="mt-2 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] outline-none focus:border-pine"></textarea></label>
          <FieldInput v-model="form.serviceConcept" label="服务理念" />
          <label class="block">
            <span class="text-sm font-medium text-ink">资质证书 / 照片</span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              :disabled="uploadingFile"
              class="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-pine file:px-4 file:text-card file:text-sm file:font-medium file:cursor-pointer"
              @change="onCredentialsChange"
            />
            <ul v-if="credentialFiles.length" class="mt-2 space-y-1">
              <li v-for="(file, i) in credentialFiles" :key="file.url" class="flex items-center justify-between gap-3 text-sm bg-paper border border-hairline rounded-[10px] px-3 py-2">
                <span class="truncate">{{ file.name }}</span>
                <button type="button" class="text-ink-faint hover:text-red-800 pressable" @click="credentialFiles.splice(i, 1)">
                  <X :size="16" />
                </button>
              </li>
            </ul>
          </label>
          <label class="block">
            <span class="text-sm font-medium text-ink">身份证扫描件</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="uploadingFile"
              class="mt-2 block w-full text-sm text-ink-soft file:mr-3 file:h-10 file:rounded-full file:border-0 file:bg-pine file:px-4 file:text-card file:text-sm file:font-medium file:cursor-pointer"
              @change="onIdCardChange"
            />
            <p v-if="idCardFile" class="mt-2 text-sm text-ink-soft">已上传：{{ idCardFile.name }}</p>
          </label>
          <div>
            <p class="text-sm font-medium text-ink">擅长标签</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button v-for="tag in tags" :key="tag.id" type="button" class="h-8 px-3 rounded-full border text-xs pressable"
                :class="selectedTagIds.includes(tag.id) ? 'bg-pine border-pine text-card' : 'border-hairline bg-card text-ink-soft'"
                @click="toggleTag(tag.id)">{{ tag.name }}</button>
            </div>
          </div>
          <button type="submit" :disabled="submitting" class="h-12 px-8 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-60 pressable">
            {{ submitting ? '保存中…' : '保存资料' }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>
