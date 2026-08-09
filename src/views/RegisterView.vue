<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import FieldInput from '@/components/FieldInput.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'

const auth = useAuthStore()
const router = useRouter()

const phone = ref('')
const nickname = ref('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = '密码至少需要 8 位，且包含字母与数字'
    return
  }
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    await auth.register(phone.value, password.value, nickname.value)
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-[420px] mx-auto px-4 py-12 md:py-20">
    <p class="catalog-tab">AUTH-02 注册</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">创建你的成长账户</h1>
    <p class="mt-2 text-sm text-ink-soft">记录会保存在你的账户里，随时可以回看。</p>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <FieldInput v-model="phone" label="手机号" type="tel" placeholder="请输入 11 位手机号" />
      <FieldInput v-model="nickname" label="昵称" placeholder="怎么称呼你" maxlength="20" />
      <FieldInput
        v-model="password"
        label="密码"
        type="password"
        placeholder="至少 8 位，包含字母与数字"
        autocomplete="new-password"
      />
      <FieldInput
        v-model="confirm"
        label="确认密码"
        type="password"
        placeholder="再输入一次密码"
        autocomplete="new-password"
      />
      <ErrorBanner v-if="error" :message="error" />
      <button
        type="submit"
        :disabled="loading"
        class="w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors disabled:opacity-60 pressable"
      >
        {{ loading ? '注册中…' : '注册并开始' }}
      </button>
      <p class="text-xs text-ink-faint leading-relaxed">
        注册即表示你同意隐私政策：我们仅收集提供服务所需的信息，不会对内容做诊断或评价。
      </p>
    </form>
  </div>
</template>
