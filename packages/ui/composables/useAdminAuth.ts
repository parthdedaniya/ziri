 

import { useAdminAuthStore } from '~/stores/admin-auth'
import { useToast } from './useToast'
import { extractApiErrorMessage } from './useApiError'

export function useAdminAuth() {
  const adminAuthStore = useAdminAuthStore()
  const toast = useToast()

 
  if (process.client) {
    adminAuthStore.loadFromStorage()
  }

  const login = async (username: string, password: string): Promise<boolean> => {
    adminAuthStore.setLoading(true)
    adminAuthStore.setError(null)
    
    try {
      const response = await fetch('/api/auth/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(extractApiErrorMessage({ data: error }, 'Login failed'))
      }
      
      const data = await response.json()
      
      adminAuthStore.setTokens(
        data.accessToken,
        data.refreshToken,
        data.expiresIn,
        data.user
      )
      
 
      try {
        const healthResponse = await fetch('/api/health')
        if (healthResponse.ok) {
          const healthData = await healthResponse.json()
          if (healthData.sessionId) {
            adminAuthStore.setServerSessionId(healthData.sessionId)
          }
        }
      } catch (error) {
        console.warn('[AUTH] Failed to get server session ID:', error)
      }
      
      toast.success('Login successful!')
      
 
      if (process.client) {
        await navigateTo('/')
      }
      
      return true
    } catch (error: any) {
      const errorMessage = extractApiErrorMessage(error, 'Login failed')
      adminAuthStore.setError(errorMessage)
      toast.error(errorMessage)
      return false
    } finally {
      adminAuthStore.setLoading(false)
    }
  }

  const logout = async () => {
    adminAuthStore.clearAuth()
    toast.info('Signed out')
    
 
    if (process.client) {
      await navigateTo('/login')
    }
  }

  const getAuthHeader = (): string | null => {
    if (adminAuthStore.isAuthenticated && adminAuthStore.accessToken) {
      return `Bearer ${adminAuthStore.accessToken}`
    }
    return null
  }

  const refreshToken = async (): Promise<boolean> => {
    if (!adminAuthStore.refreshToken) {
      return false
    }
    
 
    const sessionValid = await adminAuthStore.checkServerSession()
    if (!sessionValid) {
 
      return false
    }
    
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: adminAuthStore.refreshToken
        })
      })
      
      if (!response.ok) {
 
        adminAuthStore.clearAuth()
        return false
      }
      
      const data = await response.json()
      
 
      adminAuthStore.accessToken = data.accessToken
      adminAuthStore.tokenExpiry = new Date(Date.now() + (data.expiresIn - 60) * 1000)
      
 
      if (process.client && adminAuthStore.user && adminAuthStore.refreshToken) {
        adminAuthStore.setTokens(
          data.accessToken,
          adminAuthStore.refreshToken,
          data.expiresIn,
          adminAuthStore.user
        )
      }
      
      return true
    } catch (error: any) {
      adminAuthStore.clearAuth()
      return false
    }
  }

  return {
    login,
    logout,
    getAuthHeader,
    refreshToken,
    isAuthenticated: computed(() => adminAuthStore.isAuthenticated),
    isLoading: computed(() => adminAuthStore.isLoading),
    error: computed(() => adminAuthStore.error),
    user: computed(() => adminAuthStore.user)
  }
}
