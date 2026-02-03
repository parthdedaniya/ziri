 

import { useAdminAuthStore } from '~/stores/admin-auth'
import { useUserAuthStore } from '~/stores/user-auth'
import { useToast } from './useToast'

export function useAuth() {
  const adminAuthStore = useAdminAuthStore()
  const userAuthStore = useUserAuthStore()
  const toast = useToast()

 
  if (process.client) {
    adminAuthStore.loadFromStorage()
    userAuthStore.loadFromStorage()
  }

  const login = async (username: string, password: string): Promise<boolean> => {
    adminAuthStore.setLoading(true)
    userAuthStore.setLoading(true)
    adminAuthStore.setError(null)
    userAuthStore.setError(null)
    
    try {
      // 1) Try admin/dashboard login first (for any username).
      // This covers:
      // - Built-in admin (ziri, root key)
      // - New dashboard users (admin, viewer, user_admin, policy_admin)
      try {
        const adminResponse = await fetch('/api/auth/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          // Backend accepts either id or email via "username" or "email" (we pass both as username)
          body: JSON.stringify({ username, email: username, password })
        })
        
        if (adminResponse.ok) {
          const adminData = await adminResponse.json()
          
          adminAuthStore.setTokens(
            adminData.accessToken,
            adminData.refreshToken,
            adminData.expiresIn,
            adminData.user
          )
          
          toast.success('Admin login successful!')
          
          if (process.client) {
            await navigateTo('/config')
          }
          
          return true
        } else {
          // If it's a hard admin failure (e.g. disabled account), surface that and don't fall back.
          const errorBody = await adminResponse.json().catch(() => ({}))
          const code = errorBody.code as string | undefined
          if (adminResponse.status === 403 || code === 'ACCOUNT_DISABLED') {
            throw new Error(errorBody.error || 'Admin account is disabled')
          }
          // For 401 INVALID_CREDENTIALS and other soft failures, we fall through to user login.
        }
      } catch (error: any) {
        // Network or unexpected error during admin login: fall through to user login,
        // unless you want to treat it as fatal. For now, we just log and continue.
        console.error('[AUTH] Admin login attempt failed:', error)
      }
      
      // 2) Fallback: gateway user login (access-management users).
      const userResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: username, password })
      })
      
      if (!userResponse.ok) {
        const error = await userResponse.json().catch(() => ({ error: userResponse.statusText }))
        throw new Error(error.error || 'Invalid credentials')
      }
      
      const userData = await userResponse.json()
      
 
      if (!userData.user) {
        throw new Error('Invalid response: user information missing')
      }
      
 
      userAuthStore.setTokens(
        userData.accessToken,
        userData.refreshToken,
        userData.expiresIn,
        userData.user
      )
      
      toast.success('Login successful!')
      
 
      if (process.client) {
        if (userData.user.role === 'admin') {
          await navigateTo('/config')
        } else {
          await navigateTo('/me')
        }
      }
      
      return true
    } catch (error: any) {
      const errorMessage = error.message || 'Login failed. Please check your credentials.'
      adminAuthStore.setError(errorMessage)
      userAuthStore.setError(errorMessage)
      toast.error(errorMessage)
      return false
    } finally {
      adminAuthStore.setLoading(false)
      userAuthStore.setLoading(false)
    }
  }

  const logout = async () => {
 
    adminAuthStore.clearAuth()
    userAuthStore.clearAuth()
    toast.info('Logged out successfully')
    
 
    if (process.client) {
      await navigateTo('/login')
    }
  }

  const getAuthHeader = (): string | null => {
 
    if (adminAuthStore.isAuthenticated && adminAuthStore.accessToken) {
      return `Bearer ${adminAuthStore.accessToken}`
    }
 
    if (userAuthStore.isAuthenticated && userAuthStore.accessToken) {
      return `Bearer ${userAuthStore.accessToken}`
    }
    return null
  }

  return {
    login,
    logout,
    getAuthHeader,
    isAuthenticated: computed(() => adminAuthStore.isAuthenticated || userAuthStore.isAuthenticated),
    isAdmin: computed(() => adminAuthStore.isAdmin || userAuthStore.isAdmin),
    isLoading: computed(() => adminAuthStore.isLoading || userAuthStore.isLoading),
    error: computed(() => adminAuthStore.error || userAuthStore.error),
    user: computed(() => adminAuthStore.user || userAuthStore.user)
  }
}
