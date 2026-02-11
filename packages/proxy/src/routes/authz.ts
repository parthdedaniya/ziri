import { Router, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import { internalAuthorizationService } from '../services/internal/internal-authorization-service.js'
import { internalEntityStore } from '../services/internal/internal-entity-store.js'

const router: Router = Router()

router.post('/check', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { action, resourceType, context } = req.body

    if (!action) {
      res.status(400).json({
        error: 'action is required',
        code: 'MISSING_ACTION'
      })
      return
    }

    const userId = req.admin!.userId

    const entity = await internalEntityStore.getEntity(userId)
    if (!entity) {
      res.status(403).json({
        error: 'User entity not found',
        code: 'ENTITY_NOT_FOUND'
      })
      return
    }

    const principal = `DashboardUser::"${userId}"`
    const actionUid = `Action::"${action}"`

    const result = await internalAuthorizationService.authorize({
      principal,
      action: actionUid,
      resourceType: resourceType || 'dashboard',
      context: context || {}
    })

    res.json({
      allowed: result.allowed,
      reason: result.reason
    })
  } catch (error: any) {
    console.error('[AUTHZ] Authorization check error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    })
  }
})

router.post('/check-batch', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { actions } = req.body

    if (!Array.isArray(actions)) {
      res.status(400).json({
        error: 'actions must be an array',
        code: 'INVALID_ACTIONS'
      })
      return
    }

    const userId = req.admin!.userId

    const entity = await internalEntityStore.getEntity(userId)
    if (!entity) {
      res.status(403).json({
        error: 'User entity not found',
        code: 'ENTITY_NOT_FOUND'
      })
      return
    }

    const principal = `DashboardUser::"${userId}"`

    const results = await Promise.all(
      actions.map(async (actionItem: { action: string; resourceType?: string }) => {
        const actionUid = `Action::"${actionItem.action}"`
        const result = await internalAuthorizationService.authorize({
          principal,
          action: actionUid,
          resourceType: actionItem.resourceType || 'dashboard',
          context: {}
        })

        return {
          action: actionItem.action,
          allowed: result.allowed
        }
      })
    )

    res.json({
      results
    })
  } catch (error: any) {
    console.error('[AUTHZ] Batch authorization check error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error.message
    })
  }
})

export default router
