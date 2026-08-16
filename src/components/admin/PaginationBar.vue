<script setup lang="ts">
import { PhCaretLeft as CaretLeft, PhCaretRight as CaretRight } from '@phosphor-icons/vue'

const props = defineProps<{ page: number; pageSize: number; total: number }>()
const emit = defineEmits<{ (e: 'update:page', value: number): void }>()

const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize))
</script>

<template>
  <div class="flex items-center justify-between gap-4 py-4 text-sm text-ink-soft">
    <p>共 {{ total }} 条</p>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="w-9 h-9 rounded-full border border-hairline bg-card flex items-center justify-center pressable disabled:opacity-40"
        :disabled="page <= 1"
        :aria-label="`上一页`"
        @click="emit('update:page', page - 1)"
      >
        <CaretLeft :size="16" />
      </button>
      <span class="px-3">{{ page }} / {{ totalPages }}</span>
      <button
        type="button"
        class="w-9 h-9 rounded-full border border-hairline bg-card flex items-center justify-center pressable disabled:opacity-40"
        :disabled="page >= totalPages"
        :aria-label="`下一页`"
        @click="emit('update:page', page + 1)"
      >
        <CaretRight :size="16" />
      </button>
    </div>
  </div>
</template>
