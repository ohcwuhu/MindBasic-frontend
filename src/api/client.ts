import axios, { AxiosError } from 'axios'

export interface ApiEnvelope<T> {
  code: string
  message: string
  data: T
  traceId: string | null
}

export interface Paginated<T> {
  items: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasMore: boolean
  }
}

export class ApiError extends Error {
  code: string
  status: number
  errors?: { field: string; message: string }[]

  constructor(code: string, message: string, status: number, errors?: { field: string; message: string }[]) {
    super(message)
    this.code = code
    this.status = status
    this.errors = errors
  }
}

const client = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  timeout: 15000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mb_access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  try {
    const resp = await axios.post<ApiEnvelope<{ accessToken: string }>>(
      '/api/v1/auth/refresh',
      {},
      { withCredentials: true },
    )
    const token = resp.data.data.accessToken
    localStorage.setItem('mb_access_token', token)
    return token
  } catch {
    localStorage.removeItem('mb_access_token')
    return null
  }
}

client.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope<unknown>
    if (body && typeof body === 'object' && 'code' in body && body.code !== 'OK') {
      const errors = (body.data as { errors?: { field: string; message: string }[] } | null)?.errors
      return Promise.reject(new ApiError(body.code, body.message || '请求失败', response.status, errors))
    }
    return response
  },
  async (error: AxiosError<ApiEnvelope<unknown>>) => {
    const original = error.config
    const body = error.response?.data
    const status = error.response?.status ?? 0
    const code = body?.code ?? 'NETWORK_ERROR'
    const message = body?.message ?? (status === 0 ? '网络连接失败，请稍后重试' : '请求失败，请稍后重试')
    const errors = (body?.data as { errors?: { field: string; message: string }[] } | null)?.errors

    if (code === 'TOKEN_EXPIRED' && original && !(original.headers as Record<string, unknown>)._retried) {
      ;(original.headers as Record<string, unknown>)._retried = true
      refreshing = refreshing ?? refreshAccessToken()
      const token = await refreshing
      refreshing = null
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      }
      window.dispatchEvent(new CustomEvent('mb:logout'))
    }
    if (status === 401 && code !== 'TOKEN_EXPIRED') {
      window.dispatchEvent(new CustomEvent('mb:logout'))
    }
    return Promise.reject(new ApiError(code, message, status, errors))
  },
)

export async function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const resp = await client.get<ApiEnvelope<T>>(url, { params })
  return resp.data.data
}

export async function post<T>(url: string, data?: unknown): Promise<T> {
  const resp = await client.post<ApiEnvelope<T>>(url, data)
  return resp.data.data
}

export async function patch<T>(url: string, data?: unknown): Promise<T> {
  const resp = await client.patch<ApiEnvelope<T>>(url, data)
  return resp.data.data
}

export async function put<T>(url: string, data?: unknown): Promise<T> {
  const resp = await client.put<ApiEnvelope<T>>(url, data)
  return resp.data.data
}

export async function del(url: string): Promise<void> {
  await client.delete(url)
}

export async function uploadFile(
  file: File,
  usage: string,
): Promise<{ fileId: string; url: string; isPrivate: boolean; originalName: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('usage', usage)
  const resp = await client.post<
    ApiEnvelope<{ fileId: string; url: string; isPrivate: boolean; originalName: string }>
  >('/files', form)
  return resp.data.data
}

export default client
