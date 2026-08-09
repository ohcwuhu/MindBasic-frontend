<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import FieldInput from '@/components/FieldInput.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const phone = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login(phone.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '登录失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-[420px] mx-auto px-4 py-12 md:py-20">
    <p class="catalog-tab">AUTH-01 登录</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">欢迎回来</h1>
    <p class="mt-2 text-sm text-ink-soft">继续你的成长记录。</p>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <FieldInput
        v-model="phone"
        label="手机号"
        type="tel"
        placeholder="请输入 11 位手机号"
        autocomplete="username"
      />
      <FieldInput
        v-model="password"
        label="密码"
        type="password"
        placeholder="请输入密码"
        autocomplete="current-password"
      />
      <ErrorBanner v-if="error" :message="error" />
      <button
        type="submit"
        :disabled="loading"
        class="w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors disabled:opacity-60 pressable"
      >
        {{ loading ? '登录中…' : '登录' }}
      </button>
    </form>

    <p class="mt-6 text-sm text-ink-soft text-center">
      还没有账号？
      <RouterLink to="/register" class="text-pine font-medium hover:underline">免费注册</RouterLink>
    </p>
  </div>
</template>
