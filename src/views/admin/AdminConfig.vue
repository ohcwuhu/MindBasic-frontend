<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { get, put } from '@/api/client'
import type { SystemConfigItem } from '@/api/types'
import ErrorBanner from '@/components/ErrorBanner.vue'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

const form = ref<Record<string, string>>({
  platform_name: '',
  hotline: '',
  emergency_hint: '',
  disclaimer: '',
})

const fields: { key: string; label: string; hint: string; multiline?: boolean }[] = [
  { key: 'platform_name', label: '平台名称', hint: '展示在前台页脚等位置' },
  { key: 'hotline', label: '心理援助热线', hint: '全国心理援助热线号码（如 12356）' },
  { key: 'emergency_hint', label: '紧急求助说明', hint: '心理危机状态下的求助指引，展示给所有用户', multiline: true },
  { key: 'disclaimer', label: '免责声明', hint: '平台服务边界声明，展示给所有用户', multiline: true },
]

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await get<{ items: SystemConfigItem[] }>('/admin/system-configs')
    for (const item of data.items) {
      if (item.key in form.value) form.value[item.key] = item.value
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.value.platform_name.trim() || !form.value.hotline.trim()) {
    error.value = '平台名称与心理援助热线不能为空'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await put('/admin/system-configs', {
      items: fields.map((f) => ({ key: f.key, value: form.value[f.key].trim() })),
    })
    success.value = '平台配置已保存'
    setTimeout(() => (success.value = ''), 2500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <ErrorBanner v-if="error" :message="error" class="mt-4" />
    <p v-if="success" class="mt-4 text-sm text-pine-deep">{{ success }}</p>

    <div v-if="loading" class="mt-6 space-y-3">
      <div v-for="i in 4" :key="i" class="h-24 rounded-[14px] bg-hairline/60 animate-pulse"></div>
    </div>

    <form v-else class="mt-6 bg-card border border-hairline rounded-[14px] p-6 space-y-5" @submit.prevent="save">
      <p class="text-sm text-ink-soft leading-relaxed">
        以下信息会展示给所有用户（页脚等位置）。心理援助热线与免责声明属于平台合规信息，请谨慎维护。
      </p>
      <label v-for="field in fields" :key="field.key" class="block">
        <span class="text-sm font-medium text-ink">{{ field.label }}</span>
        <input
          v-if="!field.multiline"
          v-model="form[field.key]"
          class="mt-1.5 w-full h-11 px-4 rounded-[10px] border border-hairline bg-card text-[15px] outline-none focus:border-pine"
        />
        <textarea
          v-else
          v-model="form[field.key]"
          rows="3"
          class="mt-1.5 w-full rounded-[10px] border border-hairline bg-paper/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-pine resize-y"
        ></textarea>
        <span class="catalog-tab mt-1.5 block">{{ field.hint }}</span>
      </label>
      <div class="flex gap-2 pt-1">
        <button
          type="submit"
          :disabled="saving"
          class="h-11 px-6 rounded-full bg-pine text-card text-sm font-medium pressable disabled:opacity-50"
        >
          {{ saving ? '保存中…' : '保存配置' }}
        </button>
      </div>
    </form>
  </div>
</template>
