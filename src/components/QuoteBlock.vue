<script setup lang="ts">
// 手写感引语：今日一句 / 情感收尾。温润半手写的霞鹜文楷，配一截银线起笔与极缓淡入。
withDefaults(
  defineProps<{
    text: string
    attribution?: string
    tone?: 'gold' | 'lilac' | 'clay' | 'ink'
    align?: 'left' | 'center'
    size?: 'sm' | 'md' | 'lg'
    label?: string
  }>(),
  { tone: 'gold', align: 'left', size: 'md' },
)
</script>

<template>
  <figure class="quote-block" :class="[`q-${tone}`, `q-${align}`, `q-${size}`]">
    <span v-if="label" class="quote-label">{{ label }}</span>
    <blockquote class="quote-text">{{ text }}</blockquote>
    <figcaption v-if="attribution" class="quote-attr">{{ attribution }}</figcaption>
  </figure>
</template>
