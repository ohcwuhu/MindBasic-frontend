<script setup lang="ts">
import { PhNoteBlank as NoteBlank } from '@phosphor-icons/vue'

withDefaults(defineProps<{ title: string; hint?: string }>(), { hint: '' })
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center py-16 px-6">
    <span class="w-12 h-12 rounded-full bg-paper border border-hairline flex items-center justify-center text-ink-faint">
      <NoteBlank :size="24" weight="duotone" />
    </span>
    <p class="mt-4 font-medium text-ink">{{ title }}</p>
    <p v-if="hint" class="mt-1 text-sm text-ink-soft max-w-[36ch]">{{ hint }}</p>
  </div>
</template>
