import { useUnifiedAuth } from '~/composables/useUnifiedAuth'

export interface InternalAuditLog {
  id: number
  dashboard_user_id: string
  dashboard_user_name: string | null
  dashboard_user_role: string | null
  action: string
  resource_type: string
  resource_id: string | null
  decision: 'permit' | 'forbid'
  decision_reason: string | null
  auth_duration_ms: number | null
  request_timestamp: string
  action_duration_ms: number | null
  outcome_status: string | null
  created_at: string
}

export interface ListInternalAuditLogsParams {
  search?: string
  userId?: string
  action?: string
  resourceType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
}

export function useInternalAuditLogs() {
  const { getAuthHeader } = useUnifiedAuth()

  const listInternalAuditLogs = async (params: ListInternalAuditLogsParams) => {
    const authHeader = getAuthHeader()
    if (!authHeader) {
      throw new Error('Not authenticated')
    }

    const searchParams = new URLSearchParams()
    if (params.search) searchParams.set('search', params.search)
    if (params.userId) searchParams.set('userId', params.userId)
    if (params.action) searchParams.set('action', params.action)
    if (params.resourceType) searchParams.set('resourceType', params.resourceType)
    if (params.from) searchParams.set('from', params.from)
    if (params.to) searchParams.set('to', params.to)
    if (params.limit != null) searchParams.set('limit', String(params.limit))
    if (params.offset != null) searchParams.set('offset', String(params.offset))
    if (params.sortBy) searchParams.set('sortBy', params.sortBy)
    if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder)

    const response = await fetch(`/api/internal-audit-logs?${searchParams.toString()}`, {
      headers: {
        Authorization: authHeader
      }
    })

    if (!response.ok) {
      throw new Error('Failed to load internal audit logs')
    }

    const data = await response.json()
    return {
      items: (data.items || []) as InternalAuditLog[],
      total: (data.total ?? 0) as number
    }
  }

  return {
    listInternalAuditLogs
  }
}

