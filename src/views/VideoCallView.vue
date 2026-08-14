<script setup lang="ts">
import VideoCallPanel from '@/components/ai-lab/VideoCallPanel.vue'
</script>

<template>
  <div class="video-call-page">
    <VideoCallPanel />
  </div>
</template>

<style scoped>
.video-call-page {
  min-height: calc(100dvh - 64px);
  background-color: var(--color-paper);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
  box-sizing: border-box;
}
@media (max-width: 640px) {
  .video-call-page {
    min-height: calc(100dvh - 56px);
    padding: 14px;
  }
}
</style>
