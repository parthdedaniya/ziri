// Unified authentication composable (works for both admin and user)
// This allows admins to access /me/* pages using their admin token

import { useUserAuthStore } from '~/stores/user-auth'
import { useAdminAuthStore } from '~/stores/admin-auth'
import { computed } from 'vue'

export function useUnifiedAuth() {
  const userAuthStore = useUserAuthStore()
  const adminAuthStore = useAdminAuthStore()

  // Load auth from storage on init
  if (process.client) {
    userAuthStore.loadFromStorage()
    adminAuthStore.loadFromStorage()
  }

  const getAuthHeader = (): string | null => {
    // Try user auth first
    if (userAuthStore.isAuthenticated && userAuthStore.accessToken) {
      return `Bearer ${userAuthStore.accessToken}`
    }
    // Fallback to admin auth
    if (adminAuthStore.isAuthenticated && adminAuthStore.accessToken) {
      return `Bearer ${adminAuthStore.accessToken}`
    }
    return null
  }

  const isAuthenticated = computed(() => {
    return userAuthStore.isAuthenticated || adminAuthStore.isAuthenticated
  })

  const isAdmin = computed(() => {
    return userAuthStore.isAdmin || adminAuthStore.isAuthenticated
  })

  const user = computed(() => {
    return userAuthStore.user || adminAuthStore.user
  })

  return {
    getAuthHeader,
    isAuthenticated,
    isAdmin,
    user
  }
}
