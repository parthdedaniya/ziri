import type { Request } from 'express'
import { internalAuditLogService } from '../services/internal-audit-log-service.js'

export interface LogInternalActionPayload {
  action: string
  resourceType: string
  resourceId?: string | null
  actionDurationMs?: number
  authDurationMs?: number
}

export function logInternalAction(req: Request, payload: LogInternalActionPayload): void {
  try {
    const admin = (req as any).admin
    const userId = admin?.userId ?? 'unknown'
    const role = admin?.role ?? null
    const name = admin?.name ?? null

    internalAuditLogService.logInternalAction({
      dashboardUserId: userId,
      dashboardUserName: name,
      dashboardUserRole: role,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId ?? null,
      decision: 'permit',
      authDurationMs: payload.authDurationMs ?? null,
      actionDurationMs: payload.actionDurationMs ?? null,
      outcomeStatus: 'success',
      requestTimestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('[INTERNAL AUDIT] Failed to log action:', error?.message || error)
  }
}
