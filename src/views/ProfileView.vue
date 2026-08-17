<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhCaretDown as CaretDown,
  PhCaretRight as CaretRight,
  PhCamera as Camera,
} from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import { useCompanion } from '@/composables/useCompanion'
import { ApiError, get, post, uploadFile } from '@/api/client'
import type { CoachProfile, WalletInfo } from '@/api/types'
import { useCountdown } from '@/utils/useCountdown'
import ErrorBanner from '@/components/ErrorBanner.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'

const auth = useAuthStore()
const router = useRouter()

const nickname = ref(auth.user?.nickname ?? '')
const error = ref('')
const errorDetails = ref<{ field: string; message: string }[]>([])
const success = ref('')
const savingNickname = ref(false)
const uploadingAvatar = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const showPassword = ref(false)
const savingPassword = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const deactivateOpen = ref(false)
const showEmail = ref(false)
const bindEmail = ref('')
const bindCode = ref('')
const savingEmail = ref(false)
const sendingEmailCode = ref(false)
const coachStatus = ref<'none' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'loading'>('loading')
const walletBalance = ref<number | null>(null)
const { remaining, start: startCountdown } = useCountdown()

// 性别选择
const { gender: companionGender, setGender } = useCompanion()
const selectedGender = ref<(typeof companionGender)['value']>((auth.user?.gender as any) || companionGender.value)
const savingGender = ref(false)

function flash(message: string) {
  success.value = message
  setTimeout(() => (success.value = ''), 3000)
}

function showError(e: unknown) {
  error.value = e instanceof Error ? e.message : '操作失败'
  errorDetails.value = e instanceof ApiError && e.errors?.length ? e.errors : []
}

async function sendEmailCode() {
  if (!bindEmail.value.trim()) {
    error.value = '请先输入邮箱'
    return
  }
  sendingEmailCode.value = true
  error.value = ''
  try {
    await post('/auth/email-code', { email: bindEmail.value.trim(), purpose: 'BIND' })
    startCountdown()
  } catch (e) {
    showError(e)
  } finally {
    sendingEmailCode.value = false
  }
}

async function saveEmail() {
  if (!bindEmail.value.trim() || !bindCode.value.trim()) {
    error.value = '请填写邮箱与验证码'
    return
  }
  savingEmail.value = true
  error.value = ''
  try {
    const user = await post<typeof auth.user>('/users/me/email', {
      email: bindEmail.value.trim(),
      code: bindCode.value,
      purpose: 'BIND',
    })
    auth.user = user
    showEmail.value = false
    bindCode.value = ''
    flash('邮箱已绑定')
  } catch (e) {
    showError(e)
  } finally {
    savingEmail.value = false
  }
}

onMounted(async () => {
  try {
    const profile = await get<CoachProfile>('/coach/profile')
    coachStatus.value = profile.auditStatus
  } catch (e) {
    coachStatus.value = e instanceof ApiError && e.status === 404 ? 'none' : 'none'
  }
  try {
    const wallet = await get<WalletInfo>('/wallet')
    walletBalance.value = wallet.balanceInCents
  } catch {
    walletBalance.value = null
  }
})

const roleLabel: Record<string, string> = { USER: '普通用户', COACH: '教练', ADMIN: '管理员' }
const coachAction: Record<string, string> = {
  none: '申请成为教练',
  PENDING: '审核中，查看',
  REJECTED: '被驳回，去修改',
  APPROVED: '进入工作台',
}

async function saveNickname() {
  if (!nickname.value.trim()) {
    error.value = '昵称不能为空'
    return
  }
  savingNickname.value = true
  error.value = ''
  try {
    await auth.updateProfile({ nickname: nickname.value.trim() })
    flash('已保存')
  } catch (e) {
    showError(e)
  } finally {
    savingNickname.value = false
  }
}

async function saveGender() {
  savingGender.value = true
  error.value = ''
  try {
    await auth.updateProfile({ gender: selectedGender.value })
    flash('陪伴角色已更新')
  } catch (e) {
    showError(e)
  } finally {
    savingGender.value = false
  }
}

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadingAvatar.value = true
  error.value = ''
  try {
    const result = await uploadFile(file, 'general')
    await auth.updateProfile({ avatarUrl: result.url })
    flash('头像已更新')
  } catch (e) {
    showError(e)
  } finally {
    uploadingAvatar.value = false
    input.value = ''
  }
}

async function changePassword() {
  error.value = ''
  if (newPassword.value.length < 8) {
    error.value = '新密码至少 8 位，且包含字母与数字'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }
  savingPassword.value = true
  try {
    await post('/users/me/password', { oldPassword: oldPassword.value, newPassword: newPassword.value })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    showPassword.value = false
    flash('密码已修改')
  } catch (e) {
    showError(e)
  } finally {
    savingPassword.value = false
  }
}

async function deactivate() {
  deactivateOpen.value = false
  try {
    await post('/users/me/deactivate')
    await auth.logout()
    router.push({ name: 'login' })
  } catch (e) {
    showError(e)
  }
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="max-w-[1080px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">个人资料</h1>
    <p class="mt-2 text-sm text-ink-soft">管理你的账号信息。</p>

    <ErrorBanner v-if="error" :message="error" :details="errorDetails" class="mt-6" />
    <p v-if="success" class="mt-6 text-sm text-pine-deep">{{ success }}</p>

    <div class="mt-8 bg-card border border-hairline rounded-[14px] divide-y divide-hairline overflow-hidden">
      <!-- 头像 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">头像</span>
        <button
          type="button"
          class="relative w-14 h-14 rounded-full overflow-hidden bg-pine-soft text-pine flex items-center justify-center text-xl font-semibold pressable"
          :disabled="uploadingAvatar"
          :aria-label="`更换头像`"
          @click="avatarInput?.click()"
        >
          <img
            v-if="auth.user?.avatarUrl"
            :src="auth.user.avatarUrl"
            :alt="`${auth.user.nickname} 的头像`"
            class="w-full h-full object-cover"
          />
          <span v-else>{{ (auth.user?.nickname ?? '我').slice(0, 1) }}</span>
          <span class="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-card border border-hairline flex items-center justify-center text-ink-soft">
            <Camera :size="12" weight="fill" />
          </span>
        </button>
        <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onAvatarChange" />
      </div>

      <!-- 昵称 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">昵称</span>
        <div class="flex items-center gap-2">
          <input
            v-model="nickname"
            maxlength="20"
            class="h-10 w-36 md:w-44 px-3 rounded-[10px] border border-hairline bg-card text-sm text-right outline-none focus:border-pine"
          />
          <button
            type="button"
            :disabled="savingNickname"
            class="h-10 px-4 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-60 pressable"
            @click="saveNickname"
          >
            {{ savingNickname ? '…' : '保存' }}
          </button>
        </div>
      </div>

      <!-- 手机号 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">手机号</span>
        <span class="text-sm font-medium">{{ auth.user?.phone }}</span>
      </div>

      <!-- 邮箱 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">邮箱</span>
        <span class="text-sm font-medium">{{ auth.user?.email ?? '未绑定' }}</span>
        <button
          type="button"
          class="text-sm text-pine pressable shrink-0"
          @click="showEmail = !showEmail"
        >
          {{ auth.user?.email ? '更换' : '绑定' }}
        </button>
      </div>
      <div v-if="showEmail" class="px-6 pb-6 space-y-3">
        <input
          v-model="bindEmail"
          type="email"
          :placeholder="auth.user?.email ?? '邮箱地址'"
          class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine"
        />
        <div class="flex gap-2">
          <input
            v-model="bindCode"
            inputmode="numeric"
            maxlength="6"
            placeholder="6 位验证码"
            class="flex-1 h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine"
          />
          <button
            type="button"
            :disabled="sendingEmailCode || remaining > 0"
            class="shrink-0 h-11 px-4 rounded-[10px] border border-hairline bg-card text-sm text-pine pressable disabled:opacity-50"
            @click="sendEmailCode"
          >
            {{ remaining > 0 ? `${remaining}s` : '获取验证码' }}
          </button>
        </div>
        <button
          type="button"
          :disabled="savingEmail"
          class="w-full h-11 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-60 pressable"
          @click="saveEmail"
        >
          {{ savingEmail ? '提交中…' : '绑定邮箱' }}
        </button>
      </div>

      <!-- 角色 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">角色</span>
        <span class="text-sm font-medium">{{ roleLabel[auth.user?.role ?? 'USER'] }}</span>
      </div>

      <!-- 我的钱包 -->
      <RouterLink to="/wallet" class="px-6 py-5 flex items-center justify-between gap-4 pressable hover:bg-paper/60">
        <span class="text-sm text-ink-soft">我的钱包</span>
        <span class="flex items-center gap-2">
          <span v-if="walletBalance !== null" class="text-sm font-medium text-pine">
            ¥{{ (walletBalance / 100).toFixed(2) }}
          </span>
          <span v-else class="text-sm text-ink-faint">余额与充值</span>
          <CaretRight :size="16" class="text-ink-faint" />
        </span>
      </RouterLink>

      <!-- 陪伴角色性别 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">陪伴角色</span>
        <div class="flex items-center gap-3">
          <!-- 小女孩选项 -->
          <button
            type="button"
            class="gender-card"
            :class="{ active: selectedGender === 'girl', disabled: savingGender }"
            :disabled="savingGender"
            @click="selectedGender = 'girl'"
          >
            <img src="/companion/girl.png" alt="" class="gender-thumb" draggable="false" />
            <span>小女孩</span>
          </button>
          <!-- 小男孩选项 -->
          <button
            type="button"
            class="gender-card"
            :class="{ active: selectedGender === 'boy', disabled: savingGender }"
            :disabled="savingGender"
            @click="selectedGender = 'boy'"
          >
            <img src="/companion/boy.png" alt="" class="gender-thumb" draggable="false" />
            <span>小男孩</span>
          </button>
          <button
            v-if="selectedGender !== auth.user?.gender"
            type="button"
            :disabled="savingGender"
            class="h-8 px-3 rounded-full bg-pine text-card text-xs font-medium disabled:opacity-60 pressable"
            @click="saveGender"
          >
            {{ savingGender ? '…' : '保存' }}
          </button>
        </div>
      </div>

      <!-- 注册时间 -->
      <div class="px-6 py-5 flex items-center justify-between gap-4">
        <span class="text-sm text-ink-soft">注册时间</span>
        <span class="text-sm font-medium">
          {{ auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '—' }}
        </span>
      </div>

      <!-- 教练入驻 -->
      <RouterLink :to="coachStatus === 'loading' ? '/profile' : '/coach'" class="px-6 py-5 flex items-center justify-between gap-4 pressable">
        <span class="text-sm text-ink-soft">教练入驻</span>
        <span v-if="coachStatus !== 'loading'" class="text-sm font-medium text-pine">{{ coachAction[coachStatus] }}</span>
        <span v-else class="h-4 w-16 rounded bg-hairline/60 animate-pulse"></span>
      </RouterLink>

      <!-- 管理后台 -->
      <RouterLink v-if="auth.user?.role === 'ADMIN'" to="/admin" class="px-6 py-5 flex items-center justify-between gap-4 pressable">
        <span class="text-sm text-ink-soft">管理后台</span>
        <span class="text-sm font-medium text-pine">进入</span>
      </RouterLink>

      <!-- 修改密码 -->
      <div>
        <button
          type="button"
          class="w-full px-6 py-5 flex items-center justify-between gap-4 text-left pressable"
          :aria-expanded="showPassword"
          @click="showPassword = !showPassword"
        >
          <span class="text-sm text-ink-soft">修改密码</span>
          <CaretDown :size="16" class="text-ink-faint transition-transform" :class="showPassword ? 'rotate-180' : ''" />
        </button>
        <form v-if="showPassword" class="px-6 pb-6 space-y-3" @submit.prevent="changePassword">
          <input v-model="oldPassword" type="password" placeholder="原密码" class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine" autocomplete="current-password" />
          <input v-model="newPassword" type="password" placeholder="新密码（至少 8 位，含字母数字）" class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine" autocomplete="new-password" />
          <input v-model="confirmPassword" type="password" placeholder="确认新密码" class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-sm outline-none focus:border-pine" autocomplete="new-password" />
          <button type="submit" :disabled="savingPassword" class="w-full h-11 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-60 pressable">
            {{ savingPassword ? '提交中…' : '确认修改' }}
          </button>
        </form>
      </div>

      <!-- 退出登录 -->
      <button type="button" class="w-full px-6 py-5 text-sm font-medium text-red-800 text-center pressable" @click="logout">
        退出登录
      </button>
    </div>

    <div class="mt-8 text-center">
      <button type="button" class="text-xs text-ink-faint underline underline-offset-4 hover:text-red-800 pressable" @click="deactivateOpen = true">
        注销账号
      </button>
    </div>

    <ConfirmDialog
      :open="deactivateOpen"
      title="注销账号"
      message="注销后账号将被停用、登录失效，手机号可重新注册。确认继续？"
      confirm-text="确认注销"
      danger
      @confirm="deactivate"
      @cancel="deactivateOpen = false"
    />
  </div>

</template>

<style scoped>
.gender-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--color-hairline);
  background: var(--color-paper);
  color: var(--color-ink-soft);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}
.gender-card:hover:not(.disabled):not(.active) {
  border-color: var(--color-pine);
  color: var(--color-pine);
  background: rgba(107, 191, 142, 0.04);
}
.gender-card.active {
  border-color: var(--color-pine);
  background: rgba(107, 191, 142, 0.08);
  color: var(--color-pine-deep);
  font-weight: 600;
}
.gender-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.gender-thumb {
  width: 28px;
  height: 28px;
  object-fit: contain;
  border-radius: 6px;
}
</style>
