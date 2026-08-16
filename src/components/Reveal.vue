<script setup lang="ts">
import { onMounted, ref } from 'vue'

const el = ref<HTMLElement | null>(null)
const visible = ref(false)

onMounted(() => {
  const node = el.value
  if (!node) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    visible.value = true
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          visible.value = true
          observer.disconnect()
        }
      })
    },
    { threshold: 0.12 },
  )
  observer.observe(node)
})
</script>

<template>
  <div ref="el" class="reveal" :class="{ 'is-visible': visible }">
    <slot />
  </div>
</template>
