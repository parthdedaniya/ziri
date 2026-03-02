import { defineStore } from 'pinia'
import { getCookie, removeCookie, setCookie } from '~/utils/cookies'

interface AuthUser {
  userId: string
  email: string
  role: string
  name: string
}

const COOKIE_NAME = 'user-auth'

export const useUserAuthStore = defineStore('userAuth', {
  state: () => ({
    accessToken: null as string | null,
    refreshToken: null as string | null,
    tokenExpiry: null as Date | null,
    user: null as AuthUser | null,
    isLoading: false,
    error: null as string | null
  }),

  getters: {
    isAuthenticated: (state) => {
      if (!state.accessToken || !state.tokenExpiry || !state.user) return false
      return new Date() < state.tokenExpiry
    },
    isAdmin: (state) => {
      return state.user?.role === 'admin'
    },
    isUser: (state) => {
      return state.user?.role === 'user' || state.user?.role === undefined
    }
  },

  actions: {
    setTokens(accessToken: string, refreshToken: string, expiresIn: number, user: AuthUser) {
      this.accessToken = accessToken
      this.refreshToken = refreshToken
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 60) * 1000)
      this.user = user
      this.error = null

      if (process.client) {
        const authData = {
          accessToken,
          refreshToken,
          tokenExpiry: this.tokenExpiry.toISOString(),
          user
        }
        setCookie(COOKIE_NAME, JSON.stringify(authData), 30)
      }
    },

    clearAuth() {
      this.accessToken = null
      this.refreshToken = null
      this.tokenExpiry = null
      this.user = null
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
    }
  }
})
