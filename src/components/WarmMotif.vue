<script setup lang="ts">
// 手绘风线条母题：每个核心场景一个安静的小符号，用 feDisplacementMap 轻微抖动，
// 像被手画过、有呼吸感。纯装饰（aria-hidden），不带动任何文字。
// 颜色由父级 text-* 类控制（stroke=currentColor），透明度由 opacity-* 控制。
defineProps<{
  name: 'sprout' | 'weather' | 'listen' | 'path' | 'moon'
}>()
</script>

<template>
  <svg class="warm-motif" viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <defs>
      <filter id="wm-sketch" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    <g filter="url(#wm-sketch)" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <!-- 成长：被托住的嫩芽 -->
      <g v-if="name === 'sprout'">
        <path d="M24 84 C40 96 80 96 96 84" />
        <path d="M60 84 C58 60 60 46 60 32" />
        <path d="M60 50 C46 46 36 50 32 62 C44 64 56 60 60 52" />
        <path d="M60 44 C74 38 86 42 90 54 C76 58 64 54 60 46" />
      </g>
      <!-- 情绪：会经过的天气（云后探出的暖阳） -->
      <g v-if="name === 'weather'">
        <circle cx="60" cy="46" r="12" />
        <path d="M60 26 V32" />
        <path d="M44 32 L48 38" />
        <path d="M76 32 L72 38" />
        <path d="M38 86 C24 86 18 72 32 67 C30 54 50 50 58 59 C66 49 88 53 88 68 C98 68 98 86 84 86 Z" />
      </g>
      <!-- 陪伴：我在这里听你（呼吸回声） -->
      <g v-if="name === 'listen'">
        <circle cx="60" cy="60" r="14" />
        <circle cx="60" cy="60" r="27" opacity="0.65" />
        <circle cx="60" cy="60" r="5" fill="currentColor" stroke="none" />
      </g>
      <!-- 一步步：被托着的踏石小径 -->
      <g v-if="name === 'path'">
        <path d="M28 86 L48 70 L66 54 L86 38" stroke-dasharray="2 7" opacity="0.55" />
        <circle cx="28" cy="86" r="8" />
        <circle cx="48" cy="70" r="8" />
        <circle cx="66" cy="54" r="8" />
        <circle cx="86" cy="38" r="8" />
      </g>
      <!-- 入口：被环抱的弯月与一点微光 -->
      <g v-if="name === 'moon'">
        <path d="M68 28 A32 32 0 1 0 68 92 A24 24 0 1 1 68 28 Z" />
        <path d="M92 36 L94 44 L102 46 L94 48 L92 56 L90 48 L82 46 L90 44 Z" fill="currentColor" stroke="none" />
      </g>
    </g>
  </svg>
</template>
