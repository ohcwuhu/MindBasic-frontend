<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PhWarningCircle as WarningCircle } from '@phosphor-icons/vue'
import { get } from '@/api/client'
import type { PublicPlatformConfig } from '@/api/types'
import VideoCallPanel from '@/components/ai-lab/VideoCallPanel.vue'

const AI_ACK_KEY = 'mb_ai_ack_v1'

const platform = ref<PublicPlatformConfig | null>(null)
const showAck = ref(false)

onMounted(async () => {
  try {
    platform.value = await get<PublicPlatformConfig>('/platform/config')
  } catch {
    platform.value = null
  }
  showAck.value = !localStorage.getItem(AI_ACK_KEY)
})

function ack() {
  try {
    localStorage.setItem(AI_ACK_KEY, '1')
  } catch {
    /* ignore */
  }
  showAck.value = false
}
</script>

<template>
  <div class="video-call-page">
    <div v-if="platform?.aiDisclaimer" class="ai-banner">
      <span class="ai-badge">AI 生成</span>
      <span class="ai-text">{{ platform.aiDisclaimer }}</span>
    </div>

    <div class="panel-wrap">
      <VideoCallPanel />
    </div>

    <Teleport to="body">
      <div
        v-if="showAck"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="AI 自我教练说明"
      >
        <div class="absolute inset-0 bg-ink/40" @click="ack"></div>
        <div class="relative w-full max-w-[420px] bg-card rounded-[14px] border border-hairline p-6">
          <span class="w-11 h-11 rounded-full bg-pine-soft text-pine flex items-center justify-center">
            <WarningCircle :size="22" weight="duotone" />
          </span>
          <h2 class="mt-3 text-lg font-semibold tracking-tight">AI 自我教练说明</h2>
          <p class="mt-2 text-sm text-ink-soft leading-relaxed">
            本功能由人工智能生成回复，非人工心理服务，内容仅供参考，不提供诊断或治疗。
          </p>
          <p class="mt-2 text-sm text-ink-soft leading-relaxed">
            如处于心理危机或紧急状态，请立即拨打心理援助热线
            <span class="font-semibold text-pine">{{ platform?.hotline ?? '12356' }}</span>
            或前往就近医疗机构。
          </p>
          <RouterLink to="/terms" class="mt-3 inline-block text-sm text-pine underline underline-offset-2">
            查看《服务协议与免责声明》
          </RouterLink>
          <div class="mt-6 flex justify-end">
            <button
              type="button"
              class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable"
              @click="ack"
            >
              我已知晓，开始使用
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.video-call-page {
  position: fixed;
  left: 0;
  right: 0;
  top: 64px;
  bottom: 0;
  background: var(--color-paper);
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-card);
  border: 1px solid var(--color-hairline);
  border-radius: 10px;
}
.ai-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-pine-deep);
  background: var(--color-pine-soft);
  border-radius: 999px;
  padding: 3px 8px;
}
.ai-text {
  font-size: 12px;
  color: var(--color-ink-soft);
  line-height: 1.5;
}
.panel-wrap {
  flex: 1;
  min-height: 0;
}
@media (max-width: 640px) {
  .video-call-page {
    top: 56px;
    bottom: 64px;
    padding: 10px;
  }
}
</style>
