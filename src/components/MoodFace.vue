<script setup lang="ts">
// 情绪表情 v4：精致小巧圆润风格
// 每个情绪有独立的柔和填充色 + 细腻表情，适配 24~32px 尺寸
import { computed } from 'vue'

const props = defineProps<{
  mood: 'CALM' | 'HAPPY' | 'ANXIOUS' | 'DOWN' | 'IRRITATED' | 'OTHER'
}>()

const faceColors: Record<typeof props.mood, string> = {
  CALM: '#9cae8e',
  HAPPY: '#e0a14c',
  ANXIOUS: '#d9a441',
  DOWN: '#c08aa6',
  IRRITATED: '#c97a5b',
  OTHER: '#b5a392',
}

const faceFill = computed(() => faceColors[props.mood])
</script>

<template>
  <svg class="mood-face" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <!-- 脸廓：柔和实心圆底 -->
    <circle cx="20" cy="20" r="18" :fill="faceFill" opacity="0.12" />
    <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="1.2" opacity="0.3" />

    <g stroke="currentColor" stroke-linecap="round" fill="none">
      <!-- ===== 眼睛 ===== -->
      <!-- 平静：温柔闭眼 -->
      <template v-if="mood === 'CALM'">
        <path d="M13 18 Q15.5 16.5 18 18" stroke-width="1.8" />
        <path d="M22 18 Q24.5 16.5 27 18" stroke-width="1.8" />
      </template>
      <!-- 开心：笑到眼睛眯合（闭眼弯月 ‿‿）+ 腮红 -->
      <template v-else-if="mood === 'HAPPY'">
        <path d="M12 17 Q16 21 20 17" stroke-width="1.9" />
        <path d="M20 17 Q24 21 28 17" stroke-width="1.9" />
        <ellipse cx="10" cy="22" rx="2.5" ry="1.6" :fill="faceFill" stroke="none" opacity="0.35" />
        <ellipse cx="30" cy="22" rx="2.5" ry="1.6" :fill="faceFill" stroke="none" opacity="0.35" />
      </template>
      <!-- 焦虑：抬眉 + 圆睁眼 + 汗珠 -->
      <template v-else-if="mood === 'ANXIOUS'">
        <path d="M12 16 L16 17.5" stroke-width="1.3" opacity="0.5" />
        <path d="M28 16 L24 17.5" stroke-width="1.3" opacity="0.5" />
        <circle cx="15" cy="20" r="1.6" fill="currentColor" stroke="none" opacity="0.75" />
        <circle cx="25" cy="20" r="1.6" fill="currentColor" stroke="none" opacity="0.75" />
        <circle cx="29" cy="15" r="1" fill="currentColor" stroke="none" opacity="0.25" />
      </template>
      <!-- 低落：垂眼 + 微光泪痕 -->
      <template v-else-if="mood === 'DOWN'">
        <path d="M12 19 Q15 20.5 18 19" stroke-width="1.6" opacity="0.45" />
        <path d="M22 19 Q25 20.5 28 19" stroke-width="1.6" opacity="0.45" />
        <circle cx="15" cy="19.5" r="1.2" fill="currentColor" stroke="none" opacity="0.55" />
        <circle cx="25" cy="19.5" r="1.2" fill="currentColor" stroke="none" opacity="0.55" />
        <path d="M27.5 22 Q28.5 24 27.5 26" stroke-width="0.9" opacity="0.3" />
      </template>
      <!-- 烦躁：倒八字眉 + 怒眼 -->
      <template v-else-if="mood === 'IRRITATED'">
        <path d="M11 18 L16 19.5" stroke-width="1.5" opacity="0.55" />
        <path d="M29 18 L24 19.5" stroke-width="1.5" opacity="0.55" />
        <circle cx="15" cy="21" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="25" cy="21" r="1.4" fill="currentColor" stroke="none" />
      </template>
      <!-- 其他：单边挑眉 + 中性眼 -->
      <template v-else>
        <path d="M12 17.5 L15 18.5" stroke-width="1.3" opacity="0.45" />
        <path d="M28 17 L25 18.5" stroke-width="1.3" opacity="0.45" />
        <circle cx="15" cy="20" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
        <circle cx="25" cy="20" r="1.4" fill="currentColor" stroke="none" opacity="0.7" />
      </template>

      <!-- ===== 嘴巴 ===== -->
      <template v-if="mood === 'HAPPY'">
        <path d="M13 25 Q20 33 27 25" stroke-width="1.9" />
      </template>
      <template v-else-if="mood === 'CALM'">
        <path d="M15 26 Q20 29 25 26" stroke-width="1.7" />
      </template>
      <template v-else-if="mood === 'ANXIOUS'">
        <path d="M16 27 Q20 25 24 27" stroke-width="1.6" />
      </template>
      <template v-else-if="mood === 'DOWN'">
        <path d="M15 28 Q20 24.5 25 28" stroke-width="1.6" opacity="0.7" />
      </template>
      <template v-else-if="mood === 'IRRITATED'">
        <path d="M15 27 L20 26 L25 27" stroke-width="1.6" />
      </template>
      <template v-else>
        <path d="M16 26.5 Q20 25.8 24 26.5" stroke-width="1.5" opacity="0.6" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.mood-face {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
