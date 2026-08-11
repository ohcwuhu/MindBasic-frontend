import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { post, get, patch } from '@/api/client'
import type { AuthOut, User } from '@/api/types'

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

  async function register(phone: string, password: string, nickname: string): Promise<User> {
    const data = await post<AuthOut>('/auth/register', {
      phone,
      password,
      nickname,
      privacyAgreed: true,
    })
    applyAuth(data)
    return data.user
  }

  function applyAuth(data: AuthOut) {
    token.value = data.accessToken
    user.value = data.user
    localStorage.setItem('mb_access_token', data.accessToken)
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      user.value = await get<User>('/users/me')
    } catch {
      logout()
    }
  }

  async function updateProfile(payload: { nickname?: string; avatarUrl?: string | null }): Promise<void> {
    user.value = await patch<User>('/users/me', payload)
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
