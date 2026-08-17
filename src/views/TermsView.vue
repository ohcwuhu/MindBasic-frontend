<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhArrowLeft as ArrowLeft } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { AgreementInfo } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'
import { renderMarkdown } from '@/utils/markdown'

const data = ref<AgreementInfo | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    data.value = await get<AgreementInfo>('/platform/agreement')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '协议加载失败'
  }
})
</script>

<template>
  <div class="max-w-[720px] mx-auto px-4 md:px-6 py-10 md:py-16">
    <RouterLink to="/register" class="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft :size="16" /> 返回注册
    </RouterLink>

    <p class="catalog-tab mt-8">SERVICE AGREEMENT · v{{ data?.version ?? '—' }}</p>
    <h1 class="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">服务协议与免责声明</h1>
    <p class="mt-2 text-sm text-ink-soft">请在使用 MindBasic 前仔细阅读。</p>

    <ErrorBanner v-if="error" :message="error" class="mt-6" />

    <div v-if="!data && !error" class="mt-8 h-64 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    <article v-else-if="data" class="agreement-body mt-6" v-html="renderMarkdown(data.content)"></article>
  </div>
</template>

<style scoped>
.agreement-body {
  font-size: 15px;
  line-height: 1.8;
  color: var(--color-ink);
}
.agreement-body h2 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1.5rem 0 0.5rem;
  color: var(--color-ink);
}
.agreement-body p {
  margin: 0.5rem 0;
}
.agreement-body ul {
  margin: 0.5rem 0;
  padding-left: 1.25rem;
  list-style: disc;
}
.agreement-body li {
  margin: 0.35rem 0;
}
.agreement-body strong {
  color: var(--color-pine-deep);
}
</style>
