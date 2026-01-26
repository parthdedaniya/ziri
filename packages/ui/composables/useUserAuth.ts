 

import { useUserAuthStore } from '~/stores/user-auth'
import { useToast } from './useToast'

export function useUserAuth() {
  const userAuthStore = useUserAuthStore()
  const toast = useToast()

 
  if (process.client) {
    userAuthStore.loadFromStorage()
  }

  const login = async (userId: string, password: string): Promise<boolean> => {
    userAuthStore.setLoading(true)
    userAuthStore.setError(null)
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId, password })
      })
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(error.error || 'Login failed')
      }
      
      const data = await response.json()
      
      userAuthStore.setTokens(
        data.accessToken,
        data.refreshToken,
        data.expiresIn,
        data.user
      )
      
      toast.success('Login successful!')
      
 
      if (process.client) {
        if (data.user.role === 'admin') {
          await navigateTo('/config')
        } else {
          await navigateTo('/me')
        }
      }
      
      return true
    } catch (error: any) {
      userAuthStore.setError(error.message || 'Login failed')
      toast.error(error.message || 'Login failed')
      return false
    } finally {
      userAuthStore.setLoading(false)
    }
  }

  const logout = async () => {
    userAuthStore.clearAuth()
    toast.info('Logged out successfully')
    
 
    if (process.client) {
      await navigateTo('/login')
    }
  }

  const getAuthHeader = (): string | null => {
    if (userAuthStore.isAuthenticated && userAuthStore.accessToken) {
      return `Bearer ${userAuthStore.accessToken}`
    }
    return null
  }

  const refreshToken = async (): Promise<boolean> => {
    if (!userAuthStore.refreshToken) {
      return false
    }
    
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refreshToken: userAuthStore.refreshToken
        })
      })
      
      if (!response.ok) {
 
        userAuthStore.clearAuth()
        return false
      }
      
      const data = await response.json()
      
 
      userAuthStore.accessToken = data.accessToken
      userAuthStore.tokenExpiry = new Date(Date.now() + (data.expiresIn - 60) * 1000)
      
 
      if (process.client && userAuthStore.user && userAuthStore.refreshToken) {
        userAuthStore.setTokens(
          data.accessToken,
          userAuthStore.refreshToken,
          data.expiresIn,
          userAuthStore.user
        )
      }
      
      return true
    } catch (error: any) {
      userAuthStore.clearAuth()
      return false
    }
  }

  return {
    login,
    logout,
    getAuthHeader,
    refreshToken,
    isAuthenticated: computed(() => userAuthStore.isAuthenticated),
    isAdmin: computed(() => userAuthStore.isAdmin),
    isUser: computed(() => userAuthStore.isUser),
    isLoading: computed(() => userAuthStore.isLoading),
    error: computed(() => userAuthStore.error),
    user: computed(() => userAuthStore.user)
  }
}
