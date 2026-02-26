import { useRulesStore } from '~/stores/rules'
import { useToast } from './useToast'
import { useAdminAuth } from './useAdminAuth'
import { extractApiErrorMessage, useApiError } from './useApiError'
import { runWithAuth } from './useApiCall'
import type { Policy, CreatePolicyInput } from '~/types/cedar'
import type { PoliciesResponse } from '~/types/api'
import { extractPolicyEffect } from '~/utils/cedar'

export function useRules() {
    const rulesStore = useRulesStore()
    const toast = useToast()
    const { getUserMessage } = useApiError()
    const { getAuthHeader } = useAdminAuth()

    const listRules = async (params?: {
        search?: string
        limit?: number
        offset?: number
        effect?: 'permit' | 'forbid'
        sortBy?: string | null
        sortOrder?: 'asc' | 'desc' | null
    }) => {
        try {
            return await runWithAuth({
                setLoading: (value) => { rulesStore.loading = value },
                setError: (value) => { rulesStore.error = value },
                clearErrorOnStart: true,
                getAuthHeader,
                onError: (e) => { toast.error(getUserMessage(e)) }
            }, async (authHeader) => {
            const queryParams = new URLSearchParams()
            if (params?.search) queryParams.set('search', params.search)
            if (params?.limit) queryParams.set('limit', params.limit.toString())
            if (params?.offset) queryParams.set('offset', params.offset.toString())
            if (params?.effect) queryParams.set('effect', params.effect)
            if (params?.sortBy) queryParams.set('sortBy', params.sortBy)
            if (params?.sortOrder) queryParams.set('sortOrder', params.sortOrder)
            
            const url = `/api/policies${queryParams.toString() ? '?' + queryParams.toString() : ''}`
            
 
            const response = await fetch(url, {
                headers: {
                    'Authorization': authHeader
                }
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(extractApiErrorMessage({ data: error }, 'Failed to load policies'))
            }
            
            const data: PoliciesResponse = await response.json()

            const rules: Policy[] = data.data.policies.map(p => ({
                policy: p.policy,
                description: p.description,
                effect: extractPolicyEffect(p.policy),
                isActive: p.isActive
            }))

            rulesStore.rules = rules
            return { rules, total: (data as any).total || rules.length }
            })
        } catch (e: any) {
            throw e
        }
    }

    const createRule = async (input: CreatePolicyInput) => {
        try {
            await runWithAuth({
                setLoading: (value) => { rulesStore.loading = value },
                setError: (value) => { rulesStore.error = value },
                clearErrorOnStart: true,
                getAuthHeader,
                onError: (e) => { toast.error(getUserMessage(e)) }
            }, async (authHeader) => {
            const response = await fetch('/api/policies', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    policy: input.policy,
                    description: input.description
                })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(extractApiErrorMessage({ data: error }, 'Failed to create policy'))
            }

            await listRules()
            toast.success('Rule created')
            })
        } catch (e: any) {
            throw e
        }
    }

    const updateRule = async (oldPolicy: string, input: CreatePolicyInput) => {
        try {
            await runWithAuth({
                setLoading: (value) => { rulesStore.loading = value },
                setError: (value) => { rulesStore.error = value },
                clearErrorOnStart: true,
                getAuthHeader,
                onError: (e) => { toast.error(getUserMessage(e)) }
            }, async (authHeader) => {
            const response = await fetch('/api/policies', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    oldPolicy,
                    policy: input.policy,
                    description: input.description
                })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(extractApiErrorMessage({ data: error }, 'Failed to update policy'))
            }

            await listRules()
            toast.success('Rule saved')
            })
        } catch (e: any) {
            throw e
        }
    }

    const deleteRule = async (policy: string) => {
        try {
            await runWithAuth({
                setLoading: (value) => { rulesStore.loading = value },
                setError: (value) => { rulesStore.error = value },
                clearErrorOnStart: true,
                getAuthHeader,
                onError: (e) => { toast.error(getUserMessage(e)) }
            }, async (authHeader) => {
            const response = await fetch('/api/policies', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({ policy })
            })
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(extractApiErrorMessage({ data: error }, 'Failed to delete policy'))
            }

            await listRules()
            toast.success('Rule removed')
            })
        } catch (e: any) {
            throw e
        }
    }

    const setRuleStatus = async (policy: string, isActive: boolean) => {
        try {
            await runWithAuth({
                setLoading: (value) => { rulesStore.loading = value },
                setError: (value) => { rulesStore.error = value },
                clearErrorOnStart: true,
                getAuthHeader,
                onError: (e) => { toast.error(getUserMessage(e)) }
            }, async (authHeader) => {

            const response = await fetch('/api/policies/status', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({ policy, isActive })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({ error: response.statusText }))
                throw new Error(extractApiErrorMessage({ data: error }, 'Failed to update policy status'))
            }

            await listRules()
            toast.success(`Rule ${isActive ? 'enabled' : 'disabled'}`)
            })
        } catch (e: any) {
            throw e
        }
    }

    return {
        listRules,
        createRule,
        updateRule,
        deleteRule,
        setRuleStatus,
        loading: computed(() => rulesStore.loading),
        error: computed(() => rulesStore.error),
        rules: computed(() => rulesStore.rules)
    }
}
