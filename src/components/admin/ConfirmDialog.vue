<script setup lang="ts">
import { PhWarning as Warning } from '@phosphor-icons/vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmText?: string
    danger?: boolean
  }>(),
  { confirmText: '确认', danger: false },
)

const emit = defineEmits<{ (e: 'confirm'): void; (e: 'cancel'): void }>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <div class="absolute inset-0 bg-ink/40" @click="emit('cancel')"></div>
      <div class="relative w-full max-w-[380px] bg-card rounded-[14px] border border-hairline p-6 shadow-lg">
        <span
          class="w-11 h-11 rounded-full flex items-center justify-center"
          :class="danger ? 'bg-red-100 text-red-800' : 'bg-pine-soft text-pine'"
        >
          <Warning :size="22" weight="duotone" />
        </span>
        <h2 class="mt-4 text-lg font-semibold tracking-tight">{{ title }}</h2>
        <p class="mt-2 text-sm text-ink-soft leading-relaxed">{{ message }}</p>
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="h-10 px-5 rounded-full border border-hairline bg-card text-sm text-ink-soft pressable"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            type="button"
            class="h-10 px-5 rounded-full text-sm font-medium text-card pressable"
            :class="danger ? 'bg-red-800 hover:bg-red-900' : 'bg-pine hover:bg-pine-deep'"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
