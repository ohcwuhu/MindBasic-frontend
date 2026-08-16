<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { post } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useCountdown } from '@/utils/useCountdown'
import FieldInput from '@/components/FieldInput.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import WarmMotif from '@/components/WarmMotif.vue'
import QuoteBlock from '@/components/QuoteBlock.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

type LoginMode = 'password' | 'email'
const mode = ref<LoginMode>('password')

const phone = ref('')
const password = ref('')
const email = ref('')
const code = ref('')
const error = ref('')
const loading = ref(false)
const sendingCode = ref(false)
const { remaining, start: startCountdown } = useCountdown()

async function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.push(redirect)
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'password') {
      await auth.login(phone.value, password.value)
    } else {
      await auth.loginByEmail(email.value.trim(), code.value)
    }
    await redirectAfterLogin()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function sendCode() {
  if (!email.value.trim()) {
    error.value = '请先输入邮箱'
    return
  }
  sendingCode.value = true
  error.value = ''
  try {
    await post('/auth/email-code', { email: email.value.trim(), purpose: 'LOGIN' })
    startCountdown()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '发送失败，请稍后重试'
  } finally {
    sendingCode.value = false
  }
}
</script>

<template>
  <div class="relative max-w-[440px] mx-auto px-4 py-12 md:py-20">
    <WarmMotif name="moon" class="absolute right-0 top-2 w-16 h-16 text-lilac opacity-40 hidden sm:block" />
    <p class="catalog-tab">登录</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">欢迎回来</h1>
    <p class="mt-2 text-sm text-ink-soft">继续你的成长记录。</p>

    <div class="mt-8 flex gap-1 p-1 rounded-full bg-paper border border-hairline">
      <button
        type="button"
        class="flex-1 h-10 rounded-full text-sm font-medium pressable transition-colors"
        :class="mode === 'password' ? 'bg-card text-ink shadow-sm' : 'text-ink-soft'"
        @click="mode = 'password'"
      >
        密码登录
      </button>
      <button
        type="button"
        class="flex-1 h-10 rounded-full text-sm font-medium pressable transition-colors"
        :class="mode === 'email' ? 'bg-card text-ink shadow-sm' : 'text-ink-soft'"
        @click="mode = 'email'"
      >
        邮箱验证码
      </button>
    </div>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <template v-if="mode === 'password'">
        <FieldInput
          v-model="phone"
          label="手机号"
          type="tel"
          placeholder="请输入 11 位手机号"
          autocomplete="username"
        />
        <div>
          <FieldInput
            v-model="password"
            label="密码"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
          <div class="mt-2 text-right">
            <RouterLink to="/forgot-password" class="text-sm text-pine pressable">忘记密码？</RouterLink>
          </div>
        </div>
      </template>

      <template v-else>
        <FieldInput
          v-model="email"
          label="邮箱"
          type="email"
          placeholder="请输入绑定账号的邮箱"
          autocomplete="email"
        />
        <div>
          <span class="text-sm font-medium text-ink">验证码</span>
          <div class="mt-1.5 flex gap-2">
            <input
              v-model="code"
              inputmode="numeric"
              maxlength="6"
              placeholder="6 位验证码"
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
      </template>

      <ErrorBanner v-if="error" :message="error" />
      <button
        type="submit"
        :disabled="loading"
        class="cta-gold w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors disabled:opacity-60 pressable"
      >
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <p class="mt-6 text-sm text-ink-soft text-center">
      还没有账号？
      <RouterLink to="/register" class="text-pine font-medium hover:underline">免费注册</RouterLink>
    </p>
    <QuoteBlock
      label="今日一句"
      text="无论今天怎样，愿意停下来照顾自己，就很好。"
      tone="lilac"
      align="center"
      class="mt-10"
    />
  </div>
</template>
