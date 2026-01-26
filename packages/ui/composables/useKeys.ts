import { computed } from 'vue'
import { useAdminAuth } from './useAdminAuth'
import { useKeysStore } from '~/stores/keys'
import { useToast } from './useToast'
import type { Key, Entity, CreateKeyInput } from '~/types/entity'
import type { EntitiesResponse } from '~/types/api'
import { parseDecimal } from '~/utils/cedar'

export function useKeys() {
    const keysStore = useKeysStore()
    const toast = useToast()

    const mapEntityToKey = (entity: Entity & { apiKey?: string | null; userKeyId?: string; executionKey?: string | null }, allEntities?: Entity[]): Key => {
        const userKeyId = entity.uid.type === 'UserKey' ? entity.uid.id : (entity as any).userKeyId
        const userEntityRef = entity.attrs.user && (entity.attrs.user as any).__entity ? (entity.attrs.user as any).__entity : null
        const userId = userEntityRef ? userEntityRef.id : (entity.attrs as any).user_id || ''
        
        const apiKey = entity.apiKey || `sk-zs-${userId}-...`
        
        let userEntity: Entity | null = null
        if (allEntities && userEntityRef) {
            userEntity = allEntities.find(e => 
                e.uid.type === userEntityRef.type && 
                e.uid.id === userEntityRef.id
            ) || null
        }
        
        const name = userEntity ? (userEntity.attrs as any).name || '' : ''
        const email = userEntity ? (userEntity.attrs as any).email || '' : ''
        const department = userEntity ? (userEntity.attrs as any).department || '' : ''
        const isAgent = userEntity ? (userEntity.attrs as any).is_agent || false : false
        const limitRequestsPerMinute = userEntity ? (userEntity.attrs as any).limit_requests_per_minute || 0 : 0
        
        return {
            userId: userId,
            userKeyId: userKeyId,
            executionKey: (entity as any).executionKey || undefined,
            name: name,
            email: email,
            department: department,
            isAgent: isAgent,
            limitRequestsPerMinute: limitRequestsPerMinute,
            apiKey: apiKey,
            currentDailySpend: parseDecimal(entity.attrs.current_daily_spend),
            currentMonthlySpend: parseDecimal(entity.attrs.current_monthly_spend),
            lastDailyReset: entity.attrs.last_daily_reset as string | undefined,
            lastMonthlyReset: entity.attrs.last_monthly_reset as string | undefined,
            status: (entity.attrs.status as 'active' | 'revoked' | 'disabled') || 'active',
            createdAt: new Date().toISOString()
        }
    }

    const listKeys = async (params?: {
        search?: string
        limit?: number
        offset?: number
        sortBy?: string | null
        sortOrder?: 'asc' | 'desc' | null
    }) => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const queryParams = new URLSearchParams()
            queryParams.set('includeApiKeys', 'true')
            queryParams.set('entityType', 'UserKey')
            if (params?.search) queryParams.set('search', params.search)
            if (params?.limit) queryParams.set('limit', params.limit.toString())
            if (params?.offset) queryParams.set('offset', params.offset.toString())
            if (params?.sortBy) queryParams.set('sortBy', params.sortBy)
            if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder)
            
            const url = `/api/entities?${queryParams.toString()}`
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to load entities')
            }
            
            const data: EntitiesResponse = await response.json()
            const userKeyEntities = data.data.filter(e => e.uid.type === 'UserKey')
            
            const allEntitiesResponse = await fetch('/api/entities', {
                headers: {
                    'Authorization': authHeader
                }
            })
            const allEntitiesData: EntitiesResponse = await allEntitiesResponse.json()
            
            const keys = userKeyEntities.map(e => mapEntityToKey(e, allEntitiesData.data))
            keysStore.keys = keys
            return { keys, total: data.total || 0 }
        } catch (e: any) {
            keysStore.error = e.message
            toast.error('Failed to load keys')
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    const getKey = async (userKeyId: string) => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const uid = encodeURIComponent(`UserKey::"${userKeyId}"`)
            const response = await fetch(`/api/entities?uid=${uid}&includeApiKeys=true`, {
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to load entity')
            }
            
            const data: EntitiesResponse = await response.json()
            if (data.data.length > 0) {
                const allEntitiesResponse = await fetch('/api/entities', {
                    headers: {
                        'Authorization': authHeader
                    }
                })
                const allEntitiesData: EntitiesResponse = await allEntitiesResponse.json()
                const key = mapEntityToKey(data.data[0], allEntitiesData.data)
                keysStore.currentKey = key
                return key
            }
            throw new Error('Key not found')
        } catch (e: any) {
            keysStore.error = e.message
            toast.error('Failed to load key details')
            throw e
        } finally {
            keysStore.loading = false
        }
    }
    
    const getKeyByUserId = async (userId: string) => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const response = await fetch(`/api/entities?includeApiKeys=true`, {
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to load entities')
            }
            
            const data: EntitiesResponse = await response.json()
            const userKeys = data.data
                .filter(e => {
                    if (e.uid.type !== 'UserKey') return false
                    const userRef = (e.attrs as any).user?.__entity
                    return userRef && userRef.id === userId
                })
                .map(e => mapEntityToKey(e, data.data))
            
            if (userKeys.length > 0) {
                keysStore.currentKey = userKeys[0]
                return userKeys[0]
            }
            throw new Error('Key not found for user')
        } catch (e: any) {
            keysStore.error = e.message
            toast.error('Failed to load key details')
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    const createKey = async (input: CreateKeyInput) => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const response = await fetch('/api/keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    userId: input.userId
                })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to create key')
            }
            
            const result = await response.json()
            
            await listKeys()
            
            return { userId: result.userId, apiKey: result.apiKey }
        } catch (e: any) {
            keysStore.error = e.message
            toast.error(`Failed to create key: ${e.message}`)
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    const deleteKey = async (userId: string) => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const response = await fetch(`/api/keys/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to delete key from proxy')
            }

            await listKeys()
            toast.success('Keys deleted successfully')
        } catch (e: any) {
            keysStore.error = e.message
            toast.error('Failed to delete key')
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    const rotateKey = async (userId: string): Promise<{ apiKey: string }> => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const response = await fetch(`/api/keys/${userId}/rotate`, {
                method: 'POST',
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to rotate key')
            }
            
            const result = await response.json()
            
            await listKeys()
            
            return { apiKey: result.apiKey }
        } catch (e: any) {
            keysStore.error = e.message
            toast.error(`Failed to rotate key: ${e.message}`)
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    const updateKey = async (userKeyId: string, entity: Entity): Promise<void> => {
        keysStore.loading = true
        try {
            const { getAuthHeader } = useAdminAuth()
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
            const statusValue = entity.attrs.status === 'active' ? 1 : 
                               entity.attrs.status === 'revoked' ? 2 : 0
            const response = await fetch('/api/entities', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    entity,
                    status: statusValue
                })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to update entity')
            }
            
            await listKeys()
            toast.success('Key updated successfully')
        } catch (e: any) {
            keysStore.error = e.message
            toast.error(`Failed to update key: ${e.message}`)
            throw e
        } finally {
            keysStore.loading = false
        }
    }

    return {
        listKeys,
        getKey,
        getKeyByUserId,
        createKey,
        deleteKey,
        rotateKey,
        updateKey,
        loading: computed(() => keysStore.loading),
        error: computed(() => keysStore.error),
        keys: computed(() => keysStore.keys),
        currentKey: computed(() => keysStore.currentKey)
    }
}
