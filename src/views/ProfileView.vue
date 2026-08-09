<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  PhSignOut as SignOut,
  PhCardsThree as CardsThree,
  PhClock as Clock,
} from '@phosphor-icons/vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError, get } from '@/api/client'
import type { CoachProfile } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import FieldInput from '@/components/FieldInput.vue'

const auth = useAuthStore()
const router = useRouter()
const nickname = ref(auth.user?.nickname ?? '')
const error = ref('')
const saving = ref(false)
const coachStatus = ref<'none' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'loading'>('loading')

onMounted(async () => {
  try {
    const profile = await get<CoachProfile>('/coach/profile')
    coachStatus.value = profile.auditStatus
  } catch (e) {
    coachStatus.value = e instanceof ApiError && e.status === 404 ? 'none' : 'none'
  }
})

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

    <section class="card mt-4 p-6">
      <div class="flex items-center gap-3">
        <span class="w-10 h-10 rounded-full bg-pine-soft text-pine flex items-center justify-center">
          <CardsThree :size="20" weight="duotone" />
        </span>
        <div>
          <p class="font-medium">教练入驻</p>
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
        <p class="text-sm text-ink-soft leading-relaxed">
          入驻资料审核中，通过后会在这里显示工作台入口。
        </p>
        <RouterLink to="/coach" class="mt-3 inline-block text-sm text-pine font-medium hover:underline">
          查看审核状态
        </RouterLink>
      </div>

      <div v-else-if="coachStatus === 'REJECTED'" class="mt-4">
        <p class="text-sm text-red-800 leading-relaxed">资料被驳回，请查看原因并修改后重新提交。</p>
        <RouterLink to="/coach" class="mt-3 inline-block text-sm text-pine font-medium hover:underline">
          去修改并重新提交
        </RouterLink>
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

    <button
      type="button"
      @click="logout"
      class="mt-6 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-red-800 pressable"
    >
      <SignOut :size="17" /> 退出登录
    </button>
  </div>
</template>
