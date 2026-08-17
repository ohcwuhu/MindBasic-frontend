<script setup lang="ts">
// ChatAvatar — AI 心理教练中性小头像（无性别、无 boy/girl 区分）
// 设计：暖陶肤色圆脸 + 中性短发 + 柔雾紫衣领 + 温和笑眼 + 微笑
// 坐在 38px 圆形容器内，自带极轻微呼吸，桌宠式"活着"感
</script>

<template>
  <svg class="chat-avatar" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <defs>
      <!-- 脸：暖陶肤色，左上柔光 -->
      <radialGradient id="caFace" cx="46%" cy="40%" r="62%">
        <stop offset="0%" stop-color="#fff3ec" />
        <stop offset="58%" stop-color="#fbe0cf" />
        <stop offset="100%" stop-color="#f6cdb6" />
      </radialGradient>
      <!-- 头发：中性暖棕短发 -->
      <linearGradient id="caHair" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bd9e89" />
        <stop offset="100%" stop-color="#9c7e6a" />
      </linearGradient>
      <!-- 衣领：柔雾紫（AI 陪伴身份色） -->
      <linearGradient id="caCloth" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cdbce8" />
        <stop offset="100%" stop-color="#a892d4" />
      </linearGradient>
    </defs>

    <g class="ca-body">
      <!-- 衣领 / 肩膀 -->
      <path d="M14 64 Q14 50 32 50 Q50 50 50 64 Z" fill="url(#caCloth)" />
      <!-- 头 -->
      <circle cx="32" cy="28" r="19" fill="url(#caFace)" />
      <!-- 脸颊柔光 -->
      <ellipse cx="24" cy="22" rx="9" ry="6" fill="#fff" opacity="0.25" />
      <!-- 头发（中性短刘海，盖住头顶） -->
      <path
        d="M12 30 Q12 8 32 8 Q52 8 52 30 Q44 21 32 21 Q20 21 12 30 Z"
        fill="url(#caHair)"
      />
      <!-- 腮红 -->
      <ellipse cx="21" cy="33" rx="4" ry="2.6" fill="#ffb0c0" opacity="0.5" />
      <ellipse cx="43" cy="33" rx="4" ry="2.6" fill="#ffb0c0" opacity="0.5" />
      <!-- 眼睛：温和笑眼（闭眼弯月 ^ ^） -->
      <path d="M22 27 Q26 23 30 27" stroke="#5a4636" stroke-width="2.4" stroke-linecap="round" fill="none" />
      <path d="M34 27 Q38 23 42 27" stroke="#5a4636" stroke-width="2.4" stroke-linecap="round" fill="none" />
      <!-- 微笑嘴 -->
      <path d="M27 36 Q32 41 37 36" stroke="#c8778f" stroke-width="2.2" stroke-linecap="round" fill="none" />
    </g>
  </svg>
</template>

<style scoped>
.chat-avatar {
  width: 100%;
  height: 100%;
  display: block;
}
.ca-body {
  transform-box: fill-box;
  transform-origin: 50% 82%;
  animation: ca-breathe 3.6s ease-in-out infinite;
}
@keyframes ca-breathe {
  0%, 100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-0.6px) scale(1.015);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ca-body {
    animation: none;
  }
}
</style>
