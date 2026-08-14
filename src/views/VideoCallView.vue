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
  position: fixed;
  left: 0;
  right: 0;
  top: 64px;
  bottom: 0;
  background: var(--color-paper);
  padding: 16px;
  box-sizing: border-box;
}
@media (max-width: 640px) {
  .video-call-page {
    top: 56px;
    bottom: 64px;
    padding: 10px;
  }
}
</style>
