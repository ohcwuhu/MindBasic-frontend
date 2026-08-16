<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import FieldInput from '@/components/FieldInput.vue'
import ErrorBanner from '@/components/ErrorBanner.vue'
import QuoteBlock from '@/components/QuoteBlock.vue'

const auth = useAuthStore()
const router = useRouter()

const phone = ref('')
const nickname = ref('')
const gender = ref<'' | 'boy' | 'girl'>('')
const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (!gender.value) {
    error.value = '请选择陪伴你的角色性别'
    return
  }
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
    await auth.register(phone.value, password.value, nickname.value, gender.value as 'boy' | 'girl')
    router.push('/')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '注册失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-[440px] mx-auto px-4 py-12 md:py-20">
    <p class="catalog-tab">注册</p>
    <h1 class="mt-3 text-2xl font-semibold tracking-tight">创建你的成长账户</h1>
    <p class="mt-2 text-sm text-ink-soft">记录会保存在你的账户里，随时可以回看。</p>

    <form class="mt-8 space-y-5" @submit.prevent="submit">
      <FieldInput v-model="phone" label="手机号" type="tel" placeholder="请输入 11 位手机号" />
      <FieldInput v-model="nickname" label="昵称" placeholder="怎么称呼你" maxlength="20" />

      <div>
        <label class="block text-sm font-medium text-ink">陪伴你的角色</label>
        <p class="mt-1 text-xs text-ink-soft">选择你的性别，我们会为你匹配对应的小男孩 / 小女孩</p>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            @click="gender = 'boy'"
            :class="gender === 'boy' ? 'border-pine bg-pine/5 ring-2 ring-pine/30' : 'border-black/10 hover:border-black/20'"
            class="flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors"
          >
            <img src="/companion/boy.png" alt="小男孩" class="h-24 w-auto object-contain" />
            <span class="text-sm font-medium text-ink">小男孩</span>
          </button>
          <button
            type="button"
            @click="gender = 'girl'"
            :class="gender === 'girl' ? 'border-pine bg-pine/5 ring-2 ring-pine/30' : 'border-black/10 hover:border-black/20'"
            class="flex flex-col items-center gap-2 rounded-2xl border p-3 transition-colors"
          >
            <img src="/companion/girl.png" alt="小女孩" class="h-24 w-auto object-contain" />
            <span class="text-sm font-medium text-ink">小女孩</span>
          </button>
        </div>
      </div>
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
        class="cta-gold w-full h-12 rounded-full bg-pine text-card font-medium hover:bg-pine-deep transition-colors disabled:opacity-60 pressable"
      >
        {{ loading ? '注册中…' : '注册并开始' }}
      </button>
      <p class="text-xs text-ink-faint leading-relaxed">
        注册即表示你同意隐私政策：我们仅收集提供服务所需的信息，不会对内容做诊断或评价。
      </p>
    </form>
    <QuoteBlock
      label="今日一句"
      text="慢慢来，你的成长不必和任何人比。"
      tone="gold"
      align="center"
      class="mt-10"
    />
  </div>
</template>
