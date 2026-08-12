// src/services/api.ts
import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { ElNotification } from 'element-plus'

const VITE_API_BASE_URL = import.meta.env.VITE_API_BASE_URL

const apiClient: AxiosInstance = axios.create({
  baseURL: VITE_API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
    'X-AccessPoint': 'mobile'
  }
})

// Request Interceptor
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    console.log('🚀 REQUEST')
    console.log('URL:', config.url)
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Status codes that should NEVER trigger an error notification toast.
// 401 -> handled silently via the refresh-token flow below
// 403 -> usually a permissions/redirect case, not something to toast
// 422 -> validation errors are typically rendered inline on the form
// 499 -> client-cancelled request (e.g. component unmounted, user navigated away)
// Add/remove codes here as your app's needs change.
const SILENT_STATUS_CODES = [401, 403, 404, 499]

// URLs that should also be silenced regardless of status code
const SILENT_URLS = ['/get-client-profile', '/refresh-token']

// Cancelled requests (axios abort/cancel) don't always carry one of the
// statuses above, so we check for them separately.
const isCancelledRequest = (error: any) => axios.isCancel?.(error) || error?.code === 'ERR_CANCELED'

let isRefreshing = false
let failedQueue: any[] = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })

  failedQueue = []
}

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,

  async (error) => {
    const originalRequest = error.config

    console.error('🚨 API Error:', error?.response || error)

    const status = error?.response?.status

    const errorMessage =
      error?.response?.data?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'Something went wrong'

    const isSilentUrl = SILENT_URLS.some((url) => error.config?.url?.includes(url))

    // AVOID notification spam for statuses we handle elsewhere (silently
    // refreshed, shown inline on a form, etc.), for specific silent endpoints,
    // and for cancelled requests.
    const shouldNotify =
      !isCancelledRequest(error) && !SILENT_STATUS_CODES.includes(status) && !isSilentUrl

    if (shouldNotify) {
      ElNotification({
        message: errorMessage,
        type: 'error',
        duration: 8000
      })
    }

    // TOKEN EXPIRED
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = localStorage.getItem('refresh_token')

      // NO REFRESH TOKEN
      if (!refreshToken) {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')

        return Promise.reject(error)
      }

      // PREVENT MULTIPLE REFRESH CALLS
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`

            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      isRefreshing = true

      try {
        const response = await axios.post(
          `${VITE_API_BASE_URL}a1b72088-14dc-4c75-b7ff-0acb4e30fa5e/client/refresh-token`,
          {
            refresh_token: refreshToken
          }
        )

        const newToken = response.data.data.token
        const newRefreshToken = response.data.data.refresh_token

        // SAVE NEW TOKENS
        localStorage.setItem('token', newToken)
        localStorage.setItem('refresh_token', newRefreshToken)

        // UPDATE DEFAULT HEADER
        apiClient.defaults.headers.common.Authorization = `Bearer ${newToken}`

        processQueue(null, newToken)

        // RETRY ORIGINAL REQUEST
        originalRequest.headers.Authorization = `Bearer ${newToken}`

        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)

        // REFRESH FAILED => FORCE LOGOUT
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')

        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

const ApiService = {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.get(url, config).then((res) => res.data)
  },

  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.post(url, data, config).then((res) => res.data)
  },

  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.put(url, data, config).then((res) => res.data)
  },

  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.delete(url, config).then((res) => res.data)
  },

  upload<T = any>(url: string, payload: FormData): Promise<T> {
    return apiClient
      .post(url, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      .then((res) => res.data)
  }
}

export default ApiService
