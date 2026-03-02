import type { Request, Response } from 'express'
import { internalAuthorizationService } from '../../services/internal/internal-authorization-service.js'
import { logInternalAction } from '../../utils/internal-audit-helpers.js'

type InternalAuthorizationResult = Awaited<ReturnType<typeof internalAuthorizationService.authorize>>

export async function authorizeInternalAdminAction(params: {
  adminUserId: string
  action: string
  resourceType: string
  context?: Record<string, any>
}): Promise<InternalAuthorizationResult> {
  return internalAuthorizationService.authorize({
    principal: `DashboardUser::"${params.adminUserId}"`,
    action: params.action,
    resourceType: params.resourceType,
    context: params.context || {}
  })
}

export function logAdminRouteAction(params: {
  req: Request
  res: Response
  action: string
  resourceType: string
  resourceId?: string | null
  startedAt: number
}): void {
  logInternalAction(params.req, {
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    decisionReason: params.res.locals.decisionReason ?? null,
    actionDurationMs: Date.now() - params.startedAt
  })
}
