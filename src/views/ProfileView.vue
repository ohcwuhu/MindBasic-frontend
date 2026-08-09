<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhSignOut as SignOut,
  PhCardsThree as CardsThree,
  PhClock as Clock,
  PhCamera as Camera,
  PhShieldWarning as ShieldWarning,
} from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError, get, post, uploadFile } from '@/api/client'
import type { CoachProfile } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue'

const auth = useAuthStore()
const router = useRouter()

const nickname = ref(auth.user?.nickname ?? '')
const error = ref('')
const saving = ref(false)
const savingProfile = ref(false)
const uploadingAvatar = ref(false)
const success = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)

const coachStatus = ref<'none' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'loading'>('loading')

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const deactivateOpen = ref(false)

function flash(message: string) {
  success.value = message
  setTimeout(() => (success.value = ''), 3000)
}

onMounted(async () => {
  try {
    const profile = await get<CoachProfile>('/coach/profile')
    coachStatus.value = profile.auditStatus
  } catch (e) {
    coachStatus.value = e instanceof ApiError && e.status === 404 ? 'none' : 'none'
  }
})

const roleLabel: Record<string, string> = { USER: '普通用户', COACH: '教练', ADMIN: '管理员' }

async function saveProfile() {
  if (!nickname.value.trim()) {
    error.value = '昵称不能为空'
    return
  }
  savingProfile.value = true
  error.value = ''
  try {
    await auth.updateProfile({ nickname: nickname.value.trim() })
    flash('资料已保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    savingProfile.value = false
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
    error.value = e instanceof Error ? e.message : '头像上传失败'
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
  saving.value = true
  try {
    await post('/users/me/password', {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    })
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    flash('密码已修改，其他设备需要重新登录')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '修改失败'
  } finally {
    saving.value = false
  }
}

async function deactivate() {
  deactivateOpen.value = false
  try {
    await post('/users/me/deactivate')
    await auth.logout()
    router.push({ name: 'login' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注销失败'
  }
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="max-w-[860px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <h1 class="text-2xl md:text-3xl font-semibold tracking-tight">个人资料</h1>
    <p class="mt-2 text-sm text-ink-soft">管理你的头像、昵称与账号安全。</p>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />
    <p v-if="success" class="mt-6 text-sm text-pine-deep">{{ success }}</p>

    <div class="mt-8 grid md:grid-cols-[1fr_1.15fr] gap-6 items-start">
      <!-- 左列 -->
      <div class="space-y-6">
        <section class="bg-card border border-hairline rounded-[14px] p-6">
          <h2 class="text-lg font-semibold tracking-tight">头像与昵称</h2>
          <div class="mt-5 flex items-center gap-4">
            <button
              type="button"
              class="relative w-20 h-20 rounded-full overflow-hidden bg-pine-soft text-pine flex items-center justify-center text-2xl font-semibold pressable"
              :aria-label="`上传头像`"
              :disabled="uploadingAvatar"
              @click="avatarInput?.click()"
            >
              <img
                v-if="auth.user?.avatarUrl"
                :src="auth.user.avatarUrl"
                :alt="`${auth.user.nickname} 的头像`"
                class="w-full h-full object-cover"
              />
              <span v-else>{{ (auth.user?.nickname ?? '我').slice(0, 1) }}</span>
              <span class="absolute inset-0 bg-ink/30 flex items-center justify-center text-card opacity-0 hover:opacity-100 transition-opacity">
                <Camera :size="22" weight="fill" />
              </span>
            </button>
            <input
              ref="avatarInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              @change="onAvatarChange"
            />
            <div>
              <p class="font-medium">{{ auth.user?.nickname }}</p>
              <p class="mt-1 text-sm text-ink-soft">{{ uploadingAvatar ? '上传中…' : '点击头像可更换' }}</p>
            </div>
          </div>
          <div class="mt-5">
            <FieldInput v-model="nickname" label="昵称" maxlength="20" />
            <button
              type="button"
              :disabled="savingProfile"
              class="mt-4 h-11 px-6 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-60 pressable"
              @click="saveProfile"
            >
              {{ savingProfile ? '保存中…' : '保存昵称' }}
            </button>
          </div>
        </section>

        <section class="bg-card border border-hairline rounded-[14px] p-6">
          <div class="flex items-center gap-3">
            <span class="w-10 h-10 rounded-full bg-pine-soft text-pine flex items-center justify-center">
              <CardsThree :size="20" weight="duotone" />
            </span>
            <div>
              <h2 class="font-semibold">教练入驻</h2>
              <p class="text-sm text-ink-faint">服务他人，先从一份经审核的资料开始</p>
            </div>
          </div>

          <div v-if="coachStatus === 'none'" class="mt-4">
            <p class="text-sm text-ink-soft leading-relaxed">
              提交培训经历、服务项目与擅长标签，审核通过后即可在平台接单。
            </p>
            <RouterLink
              to="/coach"
              class="mt-4 inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-pine text-card font-medium pressable"
            >
              申请成为教练
            </RouterLink>
          </div>

          <div v-else-if="coachStatus === 'PENDING'" class="mt-4">
            <p class="text-sm text-ink-soft leading-relaxed">入驻资料审核中，通过后会在这里显示工作台入口。</p>
            <RouterLink to="/coach" class="mt-3 inline-block text-sm text-pine font-medium hover:underline">查看审核状态</RouterLink>
          </div>

          <div v-else-if="coachStatus === 'REJECTED'" class="mt-4">
            <p class="text-sm text-red-800 leading-relaxed">资料被驳回，请查看原因并修改后重新提交。</p>
            <RouterLink to="/coach" class="mt-3 inline-block text-sm text-pine font-medium hover:underline">去修改并重新提交</RouterLink>
          </div>

          <div v-else-if="coachStatus === 'APPROVED'" class="mt-4">
            <p class="text-sm text-pine-deep font-medium">已通过审核</p>
            <RouterLink
              to="/coach"
              class="mt-3 inline-flex items-center gap-1.5 h-11 px-6 rounded-full border border-pine text-pine font-medium pressable"
            >
              进入教练工作台
            </RouterLink>
          </div>

          <div v-else class="mt-4 h-11 rounded-[10px] bg-hairline/50 animate-pulse"></div>
        </section>
      </div>

      <!-- 右列 -->
      <div class="space-y-6">
        <section class="bg-card border border-hairline rounded-[14px] p-6">
          <h2 class="text-lg font-semibold tracking-tight">账号信息</h2>
          <dl class="mt-5 space-y-4 text-sm">
            <div class="flex items-center justify-between">
              <dt class="text-ink-soft">手机号</dt>
              <dd class="font-medium">{{ auth.user?.phone }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink-soft">角色</dt>
              <dd class="font-medium">{{ roleLabel[auth.user?.role ?? 'USER'] }}</dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-ink-soft">注册时间</dt>
              <dd class="font-medium">
                {{ auth.user?.createdAt ? new Date(auth.user.createdAt).toLocaleDateString('zh-CN') : '—' }}
              </dd>
            </div>
          </dl>
          <RouterLink
            v-if="auth.user?.role === 'ADMIN'"
            to="/admin"
            class="mt-5 inline-flex h-11 px-6 rounded-full border border-hairline items-center justify-center text-sm text-ink font-medium pressable"
          >
            进入管理后台
          </RouterLink>
        </section>

        <section class="bg-card border border-hairline rounded-[14px] p-6">
          <h2 class="text-lg font-semibold tracking-tight">修改密码</h2>
          <form class="mt-5 space-y-4" @submit.prevent="changePassword">
            <FieldInput v-model="oldPassword" label="原密码" type="password" autocomplete="current-password" />
            <FieldInput v-model="newPassword" label="新密码" type="password" placeholder="至少 8 位，包含字母与数字" autocomplete="new-password" />
            <FieldInput v-model="confirmPassword" label="确认新密码" type="password" autocomplete="new-password" />
            <button
              type="submit"
              :disabled="saving"
              class="w-full h-11 rounded-full bg-pine text-card text-sm font-medium disabled:opacity-60 pressable"
            >
              {{ saving ? '提交中…' : '修改密码' }}
            </button>
            <p class="text-xs text-ink-faint leading-relaxed">修改后，其他设备的登录将失效。</p>
          </form>
        </section>

        <section class="bg-card border border-hairline rounded-[14px] p-6">
          <h2 class="text-lg font-semibold tracking-tight">会话与账号</h2>
          <div class="mt-5 space-y-3">
            <button
              type="button"
              class="w-full h-11 rounded-full border border-hairline flex items-center justify-center gap-2 text-sm text-ink pressable"
              @click="logout"
            >
              <SignOut :size="17" /> 退出登录
            </button>
            <div class="pt-3 border-t border-hairline">
              <p class="flex items-center gap-1.5 text-sm text-red-800">
                <ShieldWarning :size="16" weight="duotone" /> 注销账号
              </p>
              <p class="mt-1.5 text-xs text-ink-faint leading-relaxed">
                注销后账号将被停用，手机号可重新注册。此操作不可自行恢复。
              </p>
              <button
                type="button"
                class="mt-3 h-10 px-5 rounded-full bg-red-50 border border-red-200 text-sm text-red-800 pressable"
                @click="deactivateOpen = true"
              >
                注销我的账号
              </button>
            </div>
          </div>
        </section>
      </div>
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
