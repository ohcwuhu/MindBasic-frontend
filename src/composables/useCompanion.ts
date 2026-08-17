import { ref } from 'vue'

// ================================================================
//  useCompanion — 虚拟陪伴角色的全局偏好（单例）
//  · gender: 'girl' | 'boy'  —— 用户选择的陪伴角色性别
//  · 持久化到 localStorage，刷新后仍保留
// ================================================================

export type CompanionGender = 'girl' | 'boy'

const STORAGE_KEY = 'mb_companion_gender'

const gender = ref<CompanionGender>('girl')

// 初始化：从本地存储读取上次选择
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'boy' || saved === 'girl') gender.value = saved
} catch {
  /* localStorage 不可用时忽略，使用默认值 */
}

export function useCompanion() {
  function setGender(next: CompanionGender) {
    gender.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* 忽略写入失败 */
    }
  }
  return { gender, setGender }
}
