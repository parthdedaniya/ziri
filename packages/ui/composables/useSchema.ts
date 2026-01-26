import { useSchemaStore } from '~/stores/schema'
import { useToast } from './useToast'
import { useAdminAuth } from './useAdminAuth'
import type { SchemaApiResponse } from '~/types/api'

export function useSchema() {
    const schemaStore = useSchemaStore()
    const toast = useToast()
    const { getAuthHeader } = useAdminAuth()

    const getSchema = async (format: 'json' | 'cedar' = 'json') => {
        schemaStore.loading = true
        schemaStore.error = null
        try {
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
 
            const url = format === 'cedar' ? '/api/schema?format=cedar' : '/api/schema'
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to load schema')
            }
            
            const data: SchemaApiResponse = await response.json()

            
 
            if (format === 'cedar') {
 
                schemaStore.schemaCedarText = typeof data.data.schema === 'string' 
                    ? data.data.schema 
                    : (data.data.schemaJson ? null : JSON.stringify(data.data.schema, null, 2))
                schemaStore.schema = data.data.schemaJson || (typeof data.data.schema === 'object' ? data.data.schema : null)
            } else {
 
                schemaStore.schema = typeof data.data.schema === 'object' ? data.data.schema : (data.data.schemaJson || null)
                schemaStore.schemaCedarText = typeof data.data.schema === 'string' ? data.data.schema : null
            }
            
            schemaStore.version = data.data.version
            schemaStore.lastSyncedAt = new Date()
            return {
                schema: data.data.schema, // Cedar text if format=cedar, JSON otherwise
                schemaJson: data.data.schemaJson || (typeof data.data.schema === 'object' ? data.data.schema : null),
                schemaCedarText: typeof data.data.schema === 'string' ? data.data.schema : null,
                version: data.data.version,
                format: data.data.format || format
            }
        } catch (e: any) {
            schemaStore.error = e.message
            toast.error('Failed to load schema')
            throw e
        } finally {
            schemaStore.loading = false
        }
    }

    const refreshSchema = async () => {
        await getSchema()
        toast.success('Schema refreshed')
    }

    const updateSchema = async (schemaInput: string | object, format: 'json' | 'cedar' = 'json') => {
        schemaStore.loading = true
        schemaStore.error = null
        try {
            const authHeader = getAuthHeader()
            if (!authHeader) {
                throw new Error('Please login first')
            }
            
 
            const url = format === 'cedar' ? '/api/schema?format=cedar' : '/api/schema'
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({ schema: schemaInput })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(error.error || 'Failed to update schema')
            }
            
            const data: SchemaApiResponse = await response.json()
            
 
            if (data.data.schemaJson) {
                schemaStore.schema = data.data.schemaJson
            } else {
                schemaStore.schema = typeof data.data.schema === 'object' ? data.data.schema : null
            }
            
 
            if (typeof data.data.schema === 'string') {
                schemaStore.schemaCedarText = data.data.schema
            } else if (data.data.format === 'cedar' && data.data.schemaJson) {
 
 
                schemaStore.schemaCedarText = null
            } else {
                schemaStore.schemaCedarText = null
            }
            
            schemaStore.version = data.data.version
            schemaStore.lastSyncedAt = new Date()
            
            toast.success('Schema updated successfully')
            return {
                schema: data.data.schema, // Cedar text if format=cedar, JSON otherwise
                schemaJson: data.data.schemaJson || (typeof data.data.schema === 'object' ? data.data.schema : null),
                schemaCedarText: typeof data.data.schema === 'string' ? data.data.schema : null,
                version: data.data.version,
                format: data.data.format || format
            }
        } catch (e: any) {
            schemaStore.error = e.message
            toast.error('Failed to update schema')
            throw e
        } finally {
            schemaStore.loading = false
        }
    }

    return {
        getSchema,
        refreshSchema,
        updateSchema,
        loading: computed(() => schemaStore.loading),
        error: computed(() => schemaStore.error),
        schema: computed(() => schemaStore.schema),
        schemaString: computed(() => schemaStore.schemaString),
        version: computed(() => schemaStore.version),
        lastSyncedAt: computed(() => schemaStore.lastSyncedAt)
    }
}
