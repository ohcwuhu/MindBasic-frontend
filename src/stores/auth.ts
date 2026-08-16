import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { post, get, patch } from '@/api/client'
import type { AuthOut, User } from '@/api/types'
import { useCompanion } from '@/composables/useCompanion'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('mb_access_token'))
  const user = ref<User | null>(null)
  const initialized = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  async function login(phone: string, password: string): Promise<User> {
    const data = await post<AuthOut>('/auth/login', { phone, password })
    applyAuth(data)
    return data.user
  }

  async function loginByEmail(email: string, code: string): Promise<User> {
    const data = await post<AuthOut>('/auth/email-login', { email, code })
    applyAuth(data)
    return data.user
  }

  async function register(
    phone: string,
    password: string,
    nickname: string,
    gender: 'boy' | 'girl',
  ): Promise<User> {
    const data = await post<AuthOut>('/auth/register', {
      phone,
      password,
      nickname,
      gender,
      privacyAgreed: true,
    })
    applyAuth(data)
    return data.user
  }

  function applyAuth(data: AuthOut) {
    token.value = data.accessToken
    user.value = data.user
    localStorage.setItem('mb_access_token', data.accessToken)
    // 根据账户性别自动匹配陪伴角色（小男孩/小女孩）
    if (data.user?.gender === 'boy' || data.user?.gender === 'girl') {
      useCompanion().setGender(data.user.gender)
    }
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      const u = await get<User>('/users/me')
      user.value = u
      // 刷新页面后用账户性别重新匹配陪伴角色
      if (u?.gender === 'boy' || u?.gender === 'girl') {
        useCompanion().setGender(u.gender)
      }
    } catch {
      logout()
    }
  }

  async function updateProfile(payload: { nickname?: string; avatarUrl?: string | null; gender?: 'boy' | 'girl' }): Promise<void> {
    user.value = await patch<User>('/users/me', payload)
    // 如果更新了性别，同步到陪伴角色
    if (payload.gender === 'boy' || payload.gender === 'girl') {
      useCompanion().setGender(payload.gender)
    }
  }

  async function logout(): Promise<void> {
    try {
      await post('/auth/logout')
    } catch {
      // 忽略登出接口异常
    }
    token.value = null
    user.value = null
    localStorage.removeItem('mb_access_token')
  }

  return {
    token,
    user,
    initialized,
    isLoggedIn,
    login,
    loginByEmail,
    register,
    fetchMe,
    updateProfile,
    logout,
  }
})
