<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { PhSignOut as SignOut } from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'

const auth = useAuthStore()
const router = useRouter()
const nickname = ref(auth.user?.nickname ?? '')
const error = ref('')
const saving = ref(false)

async function save() {
  saving.value = true
  error.value = ''
  try {
    await auth.updateProfile({ nickname: nickname.value })
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function logout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="max-w-[480px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <p class="catalog-tab">ME-02 个人资料</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">个人资料</h1>

    <div class="card mt-8 p-6">
      <div class="flex items-center gap-4">
        <span class="w-14 h-14 rounded-full bg-pine-soft text-pine flex items-center justify-center text-xl font-semibold">
          {{ (auth.user?.nickname ?? '我').slice(0, 1) }}
        </span>
        <div>
          <p class="font-medium">{{ auth.user?.nickname }}</p>
          <p class="text-sm text-ink-faint">{{ auth.user?.phone }}</p>
        </div>
      </div>
    </div>

    <form class="card mt-4 p-6 space-y-5" @submit.prevent="save">
      <FieldInput v-model="nickname" label="昵称" maxlength="20" />
      <ErrorBanner v-if="error" :message="error" />
      <button
        type="submit"
        :disabled="saving"
        class="w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep disabled:opacity-60 pressable"
      >
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </form>

    <button
      type="button"
      @click="logout"
      class="mt-6 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-red-800 pressable"
    >
      <SignOut :size="17" /> 退出登录
    </button>

    <RouterLink
      to="/coach"
      class="mt-8 block w-full h-12 rounded-full border border-hairline bg-card text-ink font-medium flex items-center justify-center pressable"
    >
      进入教练工作台
    </RouterLink>
  </div>
</template>
