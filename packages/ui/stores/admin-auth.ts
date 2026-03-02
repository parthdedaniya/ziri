import { defineStore } from 'pinia'
import { getCookie, removeCookie, setCookie } from '~/utils/cookies'

export interface AdminUser {
  userId: string
  email: string
  role: string
  name: string
}

const COOKIE_NAME = 'admin-auth'

function persistAdminAuthCookie(payload: {
  accessToken: string
  refreshToken: string
  tokenExpiry: Date
  user: AdminUser
  serverSessionId: string | null
}) {
  if (!process.client) return
  setCookie(COOKIE_NAME, JSON.stringify({
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    tokenExpiry: payload.tokenExpiry.toISOString(),
    user: payload.user,
    serverSessionId: payload.serverSessionId
  }), 30)
}

export const useAdminAuthStore = defineStore('adminAuth', {
  state: () => ({
    accessToken: null as string | null,
    refreshToken: null as string | null,
    tokenExpiry: null as Date | null,
    user: null as AdminUser | null,
    serverSessionId: null as string | null,
    isLoading: false,
    error: null as string | null
  }),

  getters: {
    isAuthenticated: (state) => {
      if (!state.accessToken || !state.tokenExpiry || !state.user) return false
      return new Date() < state.tokenExpiry
    }
  },

  actions: {
    setTokens(accessToken: string, refreshToken: string, expiresIn: number, user: AdminUser) {
      this.accessToken = accessToken
      this.refreshToken = refreshToken
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 60) * 1000)
      this.user = user
      this.error = null

      persistAdminAuthCookie({
        accessToken,
        refreshToken,
        tokenExpiry: this.tokenExpiry,
        user,
        serverSessionId: this.serverSessionId
      })
    },

    clearAuth() {
      this.accessToken = null
      this.refreshToken = null
      this.tokenExpiry = null
      this.user = null
      this.serverSessionId = null
      this.error = null

      if (process.client) {
        removeCookie(COOKIE_NAME)
      }
    },

    loadFromStorage() {
      if (!process.client) return

      try {
        const stored = getCookie(COOKIE_NAME)
        if (stored) {
          const data = JSON.parse(stored)
          const expiry = new Date(data.tokenExpiry)

          if (expiry > new Date()) {
            this.accessToken = data.accessToken
            this.refreshToken = data.refreshToken
            this.tokenExpiry = expiry
            this.user = data.user
            this.serverSessionId = data.serverSessionId || null
          } else {
            this.clearAuth()
          }
        }
      } catch (error) {
        this.clearAuth()
      }
    },

    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setServerSessionId(sessionId: string | null) {
      this.serverSessionId = sessionId

      if (this.accessToken && this.refreshToken && this.tokenExpiry && this.user) {
        persistAdminAuthCookie({
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          tokenExpiry: this.tokenExpiry,
          user: this.user,
          serverSessionId: sessionId
        })
      }
    },

    async checkServerSession(): Promise<boolean> {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) {
          return false
        }
        const data = await response.json()
        const currentSessionId = data.sessionId

        if (this.serverSessionId && currentSessionId && this.serverSessionId !== currentSessionId) {
          console.warn('[AUTH] Server session changed - server restarted, logging out')
          this.clearAuth()
          return false
        }

        if (currentSessionId && (!this.serverSessionId || this.serverSessionId !== currentSessionId)) {
          this.setServerSessionId(currentSessionId)
        }

        return true
      } catch (error) {
        console.error('[AUTH] Failed to check server session:', error)
        return false
      }
    }
  }
})
