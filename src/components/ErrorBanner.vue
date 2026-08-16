<script setup lang="ts">
withDefaults(
  defineProps<{
    message: string
    details?: { field: string; message: string }[]
  }>(),
  { details: () => [] },
)
</script>

<template>
  <div
    role="alert"
    class="rounded-[10px] border border-red-300 bg-red-50 text-red-900 text-sm px-4 py-3"
  >
    <p>{{ message }}</p>
    <ul v-if="details.length" class="mt-2 space-y-1 text-[13px]">
      <li v-for="item in details" :key="item.field">{{ item.field }}：{{ item.message }}</li>
    </ul>
  </div>
</template>
