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
  min-height: 100vh;
  background-color: #f5f7fa;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
}
</style>
