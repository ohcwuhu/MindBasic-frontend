<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    modelValue: string
    type?: string
    placeholder?: string
    error?: string
    autocomplete?: string
    maxlength?: number | string
  }>(),
  { type: 'text', placeholder: '', error: '', autocomplete: 'off', maxlength: undefined },
)

defineEmits<{ (e: 'update:modelValue', value: string): void }>()
</script>

<template>
  <label class="block">
    <span class="text-sm font-medium text-ink">{{ label }}</span>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :maxlength="maxlength"
      class="mt-2 w-full h-12 px-4 rounded-[10px] bg-card border text-[15px] outline-none transition-colors"
      :class="error ? 'border-red-700 focus:border-red-700' : 'border-hairline focus:border-pine'"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="mt-1.5 block text-[13px] text-red-800">{{ error }}</span>
  </label>
</template>
