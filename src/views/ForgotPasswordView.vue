<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { post } from '@/api/client'
import { useCountdown } from '@/utils/useCountdown'
import ErrorBanner from '@/components/ErrorBanner.vue'

const router = useRouter()
const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref('')
const sendingCode = ref(false)
const submitting = ref(false)
const { remaining, start: startCountdown } = useCountdown()

async function sendCode() {
  if (!email.value.trim()) {
    error.value = '请先输入邮箱'
    return
  }
  sendingCode.value = true
  error.value = ''
  try {
    await post('/auth/email-code', { email: email.value.trim(), purpose: 'RESET' })
    startCountdown()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送失败，请稍后重试'
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  error.value = ''
  if (newPassword.value.length < 8) {
    error.value = '新密码至少 8 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的新密码不一致'
    return
  }
  submitting.value = true
  try {
    await post('/auth/reset-password', {
      email: email.value.trim(),
      code: code.value,
      newPassword: newPassword.value,
    })
    success.value = '密码已重置，请用新密码重新登录'
    setTimeout(() => router.push('/login'), 1200)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '重置失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="max-w-[420px] mx-auto px-4 py-12 md:py-20">
    <p class="catalog-tab">AUTH-02 找回密码</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">重置密码</h1>
    <p class="mt-2 text-sm text-ink-soft">通过已绑定账号的邮箱接收验证码。</p>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />
    <p v-if="success" class="mt-6 rounded-[10px] bg-pine-soft text-pine-deep px-5 py-4 text-sm">{{ success }}</p>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <div>
        <span class="text-sm font-medium text-ink">邮箱</span>
        <div class="mt-1.5 flex gap-2">
          <input
            v-model="email"
            type="email"
            placeholder="已绑定账号的邮箱"
            class="flex-1 h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine"
          />
          <button
            type="button"
            :disabled="sendingCode || remaining > 0"
            class="shrink-0 h-11 px-4 rounded-[10px] border border-hairline bg-card text-sm text-pine pressable disabled:opacity-50"
            @click="sendCode"
          >
            {{ remaining > 0 ? `${remaining}s` : '获取验证码' }}
          </button>
        </div>
      </div>
      <input
        v-model="code"
        inputmode="numeric"
        maxlength="6"
        placeholder="6 位验证码"
        class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine"
      />
      <input
        v-model="newPassword"
        type="password"
        placeholder="新密码（至少 8 位，含字母数字）"
        class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-[15px] outline-none focus:border-pine"
        autocomplete="new-password"
      />
      <input
        v-model="confirmPassword"
        type="password"
        placeholder="确认新密码"
        class="w-full h-11 px-4 rounded-[10px] border border-hairline bg-paper/60 text-[15px] outline-none focus:border-pine"
        autocomplete="new-password"
      />
      <button
        type="submit"
        :disabled="submitting"
        class="w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors disabled:opacity-60 pressable"
      >
        {{ submitting ? '提交中…' : '重置密码' }}
      </button>
    </form>

    <p class="mt-6 text-sm text-ink-soft text-center">
      <RouterLink to="/login" class="text-pine font-medium hover:underline">返回登录</RouterLink>
    </p>
  </div>
</template>
