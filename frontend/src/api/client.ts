import axios, { AxiosError } from 'axios'

/** 后端返回的错误体 */
export interface ApiErrorBody {
  detail?: string
}

/** 统一请求异常：携带 HTTP 状态码，便于判断是否需要降级到 Mock */
export interface ApiError extends Error {
  status?: number
  isNetworkError: boolean
}

/**
 * 统一 axios 实例。
 * 开发环境 baseURL = /api，由 Vite 代理转发到 http://127.0.0.1:8000。
 */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  // Dify Workflow 同步分析耗时较长，超时设置得宽裕一些
  timeout: 180000,
})

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const status = error.response?.status
    const message =
      error.response?.data?.detail || error.message || '网络请求失败，请稍后重试'
    return Promise.reject(
      Object.assign(new Error(message), {
        status,
        isNetworkError: !error.response,
      }) as ApiError,
    )
  },
)

/**
 * 是否应该降级到本地 Mock：
 * 仅在「后端不可用（无响应）」或「服务端错误 5xx」时降级；
 * 4xx 属于请求本身的问题（如文件类型不支持），必须如实报错。
 */
export function shouldFallbackToMock(error: unknown): boolean {
  const err = error as ApiError
  if (!err || err.isNetworkError) return true
  return typeof err.status === 'number' && err.status >= 500
}
