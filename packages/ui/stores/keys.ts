import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'
import { useConfigStore } from './config'
import { parseDecimal, parseIp } from '~/utils/cedar'
import type { Key, CreateKeyInput, Entity } from '~/types/entity'
import type { EntitiesResponse } from '~/types/api'

export const useKeysStore = defineStore('keys', {
    state: () => ({
        keys: [] as Key[],
        currentKey: null as Key | null,
        loading: false,
        error: null as string | null
    }),

    getters: {
        activeKeys: (state) => state.keys.filter(k => k.status === 'active'),
        revokedKeys: (state) => state.keys.filter(k => k.status === 'revoked'),
        totalDailySpend: (state) => state.keys.reduce((acc, k) => acc + k.currentDailySpend, 0)
    },

    actions: {
        mapEntityToKey(entity: Entity): Key {
            const attrs = entity.attrs
            return {
                userId: attrs.user_id as string,
                name: attrs.name as string,
                email: attrs.email as string,
                role: attrs.role as 'engineer' | 'senior_engineer' | 'manager',
                department: attrs.department as string,
                apiKey: 'hidden', // API key not returned in list
                currentDailySpend: parseDecimal(attrs.current_daily_spend),
                dailySpendLimit: parseDecimal(attrs.daily_spend_limit),
                currentMonthlySpend: parseDecimal(attrs.current_monthly_spend),
                monthlySpendLimit: parseDecimal(attrs.monthly_spend_limit),
                status: attrs.status as 'active' | 'revoked',
                createdAt: attrs.created_at as string,
                lastUsedAt: attrs.last_daily_reset as string // Using reset time as proxy for now
            }
        },

        async fetchKeys() {
            this.loading = true
            this.error = null

            try {
                const configStore = useConfigStore()
                const { apiCall } = useApi()

                const response = await apiCall<EntitiesResponse>(
                    `/api/v2025-01/projects/${configStore.projectId}/entities`
                )

                this.keys = response.data.map(this.mapEntityToKey)
            } catch (e: any) {
                this.error = e.message
                throw e
            } finally {
                this.loading = false
            }
        },

        async fetchKey(userId: string) {
            this.loading = true
            this.error = null

            try {
                const configStore = useConfigStore()
                const { apiCall } = useApi()

                const encodedUid = encodeURIComponent(`User::"${userId}"`)
                const response = await apiCall<EntitiesResponse>(
                    `/api/v2025-01/projects/${configStore.projectId}/entities?uid=${encodedUid}`
                )

                if (response.data && response.data.length > 0) {
                    this.currentKey = this.mapEntityToKey(response.data[0])
                } else {
                    throw new Error('Key not found')
                }
            } catch (e: any) {
                this.error = e.message
                throw e
            } finally {
                this.loading = false
            }
        },

        async createKey(input: CreateKeyInput): Promise<{ apiKey: string }> {
            this.loading = true
            try {
                const configStore = useConfigStore()
                const { apiCall } = useApi()

 
                const entityBody = {
                    entity: {
                        uid: {
                            type: "User",
                            id: input.userId
                        },
                        attrs: {
                            user_id: input.userId,
                            name: input.name,
                            email: input.email,
                            role: input.role,
                            department: input.department,
                            daily_spend_limit: {
                                __extn: {
                                    fn: "decimal",
                                    arg: input.dailySpendLimit.toFixed(2)
                                }
                            },
                            monthly_spend_limit: {
                                __extn: {
                                    fn: "decimal",
                                    arg: input.monthlySpendLimit.toFixed(2)
                                }
                            },
                            current_daily_spend: {
                                __extn: {
                                    fn: "decimal",
                                    arg: "0.00"
                                }
                            },
                            current_monthly_spend: {
                                __extn: {
                                    fn: "decimal",
                                    arg: "0.00"
                                }
                            },
 
                            security_clearance: 1,
                            training_completed: false,
                            years_of_service: {
                                __extn: { fn: "decimal", arg: "0.00" }
                            },
                            last_daily_reset: new Date().toISOString(),
                            last_monthly_reset: new Date().toISOString(),
                            allowed_ip_ranges: [
                                { __extn: { fn: "ip", arg: "0.0.0.0/0" } }
                            ],
                            status: "active",
                            created_at: new Date().toISOString()
                        },
                        parents: []
                    },
                    status: 1
                }

                await apiCall(
                    `/api/v2025-01/projects/${configStore.projectId}/entity`,
                    {
                        method: 'POST',
                        body: entityBody
                    }
                )

                await this.fetchKeys()

 
 
 
 
 
 
 
 
                return { apiKey: `sk-${Math.random().toString(36).substring(2)}...` }

            } catch (e: any) {
                this.error = e.message
                throw e
            } finally {
                this.loading = false
            }
        },

        async revokeKey(userId: string) {
            this.loading = true
            try {
 
                await this.fetchKey(userId)
                if (!this.currentKey) throw new Error('Key not found')

                const configStore = useConfigStore()
                const { apiCall } = useApi()

 
 
 

 
 
 
 

 
 
 

 
                const entityBody = {
                    entity: {
                        uid: { type: "User", id: userId },
                        attrs: {
 
 
 
                            status: "revoked"
                        },
                        parents: []
                    },
                    status: 1
                }

 
 

                await apiCall(
                    `/api/v2025-01/projects/${configStore.projectId}/entity`,
                    {
                        method: 'PUT',
                        body: entityBody
                    }
                )

                await this.fetchKeys()
            } catch (e: any) {
                this.error = e.message
                throw e
            } finally {
                this.loading = false
            }
        }
    }
})
