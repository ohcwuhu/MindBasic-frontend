<script setup lang="ts">
defineProps<{ message: string }>()
</script>

<template>
  <div
    role="alert"
    class="rounded-[10px] border border-red-300 bg-red-50 text-red-900 text-sm px-4 py-3"
  >
    {{ message }}
  </div>
</template>
