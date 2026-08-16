<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    status: string
    map?: Record<string, string>
  }>(),
  { map: () => ({}) },
)

const tone: Record<string, string> = {
  APPROVED: 'bg-pine-soft text-pine-deep',
  ENABLED: 'bg-pine-soft text-pine-deep',
  PUBLISHED: 'bg-pine-soft text-pine-deep',
  PENDING: 'bg-amber-100 text-amber-900',
  CONFIRMED: 'bg-amber-100 text-amber-900',
  DRAFT: 'bg-paper text-ink-soft border border-hairline',
  REJECTED: 'bg-red-100 text-red-800',
  DISABLED: 'bg-red-100 text-red-800',
  OFFLINE: 'bg-paper text-ink-soft border border-hairline',
  CANCELLED: 'bg-paper text-ink-soft border border-hairline',
  COMPLETED: 'bg-pine-soft text-pine-deep',
}

const label = (key: string) => props.map[key] ?? key
</script>

<template>
  <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full whitespace-nowrap" :class="tone[status] ?? 'bg-paper text-ink-soft border border-hairline'">
    <span class="w-1.5 h-1.5 rounded-full bg-current opacity-70" aria-hidden="true"></span>
    {{ label(status) }}
  </span>
</template>
