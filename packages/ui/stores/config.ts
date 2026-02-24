import { defineStore } from 'pinia'
import type { GatewayConfig } from '~/types/config'
import { defaultConfig } from '~/types/config'
import { extractApiErrorMessage } from '~/composables/useApiError'

const STORAGE_KEY = 'llm-gateway-config'

 
const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return null
}

const setCookie = (name: string, value: string, days: number = 365) => {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000)
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`
}

const removeCookie = (name: string) => {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`
}

export const useConfigStore = defineStore('config', {
    state: () => ({
        ...defaultConfig
    }),

    getters: {
        isConfigured: (state) => {
 
 
            return !!(state.server?.port || state.port)
        }
    },

    actions: {
        async loadFromStorage() {
            if (!import.meta.client) {
                return
            }

 
            try {
                const { useAdminAuthStore } = await import('~/stores/admin-auth')
                const adminAuthStore = useAdminAuthStore()
                const authHeader = adminAuthStore.accessToken ? `Bearer ${adminAuthStore.accessToken}` : null
                const headers: Record<string, string> = {}
                if (authHeader) headers['Authorization'] = authHeader

                const response = await fetch('/api/config', { headers })
                if (response.ok) {
                    const config = await response.json()
 
                    const uiConfig: GatewayConfig = {
                        mode: config.mode || 'local',
                        server: config.server || {
                            host: config.host || '127.0.0.1',
                            port: config.port || config.server?.port || 3100
                        },
                        publicUrl: config.publicUrl || '',
                        email: config.email || {
                            enabled: false,
                            provider: 'manual'
                        },
 
                        projectId: config.projectId || '',
                        orgId: config.orgId || '',
                        clientId: config.clientId || '',
                        clientSecret: config.clientSecret || '',
                        pdpUrl: config.pdpUrl || '',
                        proxyUrl: config.proxyUrl || '',
                        port: config.port || config.server?.port || 3100,
                        logLevel: config.logLevel || 'info'
                    }
                    this.$patch(uiConfig)
 
                    setCookie(STORAGE_KEY, JSON.stringify(this.$state), 365)
                    return
                }
            } catch (error) {
 
            }

 
            const stored = getCookie(STORAGE_KEY)
            if (stored) {
                try {
                    const parsed = JSON.parse(stored)
 
                    this.$patch({
                        mode: parsed.mode || 'local',
                        server: parsed.server || {
                            host: parsed.host || '127.0.0.1',
                            port: parsed.port || parsed.server?.port || 3100
                        },
                        publicUrl: parsed.publicUrl || '',
                        email: parsed.email || {
                            enabled: false,
                            provider: 'manual'
                        },
 
                        projectId: parsed.projectId || '',
                        orgId: parsed.orgId || '',
                        clientId: parsed.clientId || '',
                        clientSecret: parsed.clientSecret || '',
                        pdpUrl: parsed.pdpUrl || '',
                        proxyUrl: parsed.proxyUrl || '',
                        port: parsed.port || parsed.server?.port || 3100,
                        logLevel: parsed.logLevel || 'info'
                    })
                } catch (e) {
 
                }
            }
        },

        async saveToStorage() {
            if (!import.meta.client) return

 
            const configToSave = {
                mode: this.mode || 'local',
                server: this.server || {
                    host: '127.0.0.1',
                    port: this.port || 3100
                },
                publicUrl: this.publicUrl || '',
                email: this.email || {
                    enabled: false,
                    provider: 'manual'
                },
                logLevel: this.logLevel || 'info'
            }

 
            const stateToSave = {
                server: this.server || {
                    host: '127.0.0.1',
                    port: this.port || 3100
                },
                publicUrl: this.publicUrl || '',
                email: this.email || {
                    enabled: false,
                    provider: 'manual'
                },
                proxyUrl: this.proxyUrl || '',
                port: this.port || this.server?.port || 3100,
                logLevel: this.logLevel || 'info'
            }
            setCookie(STORAGE_KEY, JSON.stringify(stateToSave), 365)

 
 
            try {
                const { useAdminAuthStore } = await import('~/stores/admin-auth')
                const adminAuthStore = useAdminAuthStore()
                const authHeader = adminAuthStore.accessToken ? `Bearer ${adminAuthStore.accessToken}` : null
                
                if (!authHeader) {
                    return
                }

                const response = await fetch('/api/config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': authHeader
                    },
                    body: JSON.stringify(configToSave)
                })

                if (!response.ok) {
                    const error = await response.json().catch(() => ({ error: response.statusText }))
                    throw new Error(extractApiErrorMessage({ data: error }, 'Failed to save configuration'))
                }
            } catch (error) {
                throw error
            }
        },

        async updateConfig(config: Partial<GatewayConfig>) {
            this.$patch(config)
            if (config.email) {
                this.email = JSON.parse(JSON.stringify(config.email)) as typeof this.email
            }
            await this.saveToStorage()
            await new Promise(resolve => setTimeout(resolve, 50))
        },

        async resetToDefaults() {

            this.$patch(defaultConfig)
            await this.saveToStorage()
        }
    }
})
