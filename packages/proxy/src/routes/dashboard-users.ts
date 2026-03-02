import { Router, type Request, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import * as dashboardUserService from '../services/dashboard-user-service.js'
import * as keyService from '../services/key-service.js'
import { internalEntityStore } from '../services/internal/internal-entity-store.js'
import { authorizeInternalAdminAction, logAdminRouteAction } from './shared/internal-admin-route-helpers.js'

const router: Router = Router()

const DASHBOARD_ROLES = ['admin', 'viewer', 'user_admin', 'policy_admin'] as const

type DashboardRole = typeof DASHBOARD_ROLES[number]

router.use(requireAdmin)

function isDashboardRole(value: unknown): value is DashboardRole {
  return typeof value === 'string' && DASHBOARD_ROLES.includes(value as DashboardRole)
}

function auditAction(req: AdminRequest, res: Response, action: string, resourceId: string, startedAt: number): void {
  logAdminRouteAction({
    req,
    res,
    action,
    resourceType: 'dashboard_user',
    resourceId,
    startedAt
  })
}

function denySelfAction(res: Response, message: string): void {
  res.status(403).json({
    error: message,
    code: 'SELF_MODIFICATION_FORBIDDEN'
  })
}

function denyEntityNotFound(res: Response): void {
  res.status(403).json({
    error: 'User entity not found',
    code: 'ENTITY_NOT_FOUND'
  })
}

function denyDashboardUserNotFound(res: Response): void {
  res.status(404).json({
    error: 'Dashboard user not found',
    code: 'USER_NOT_FOUND'
  })
}

async function getTargetDashboardEntity(res: Response, userId: string) {
  const targetEntity = await internalEntityStore.getEntity(userId)
  if (!targetEntity) {
    denyDashboardUserNotFound(res)
    return null
  }
  return targetEntity
}

async function requireAdminOnlyAction(
  req: AdminRequest,
  res: Response,
  action: string,
  deniedMessage: string
): Promise<boolean> {
  const principalUserId = req.admin!.userId
  if (principalUserId === 'ziri') {
    return true
  }

  if (!(await internalEntityStore.getEntity(principalUserId))) {
    denyEntityNotFound(res)
    return false
  }

  const authzResult = await authorizeInternalAdminAction({
    adminUserId: principalUserId,
    action,
    resourceType: 'dashboard_users',
    context: {}
  })

  if (!authzResult.allowed) {
    res.status(403).json({
      error: deniedMessage,
      code: 'ADMIN_ONLY_ACTION'
    })
    return false
  }

  return true
}

async function getTargetForMutation(
  req: AdminRequest,
  res: Response,
  userId: string,
  selfActionMessage: string
) {
  if (req.admin!.userId === userId) {
    denySelfAction(res, selfActionMessage)
    return null
  }
  return getTargetDashboardEntity(res, userId)
}

async function requireAdminOnlyIf(
  req: AdminRequest,
  res: Response,
  shouldRequire: boolean,
  action: string,
  deniedMessage: string
): Promise<boolean> {
  if (!shouldRequire) {
    return true
  }
  return requireAdminOnlyAction(req, res, action, deniedMessage)
}

async function requireKeysDeletionPermission(req: AdminRequest, res: Response): Promise<boolean> {
  const authzResult = await authorizeInternalAdminAction({
    adminUserId: req.admin!.userId,
    action: 'Action::"delete_keys_by_user"',
    resourceType: 'keys',
    context: {}
  })

  if (!authzResult.allowed) {
    res.status(403).json({
      error: 'Access denied',
      code: 'ACCESS_DENIED',
      reason: authzResult.reason
    })
    return false
  }

  return true
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const { search, limit, offset, sortBy, sortOrder } = req.query

    const result = dashboardUserService.listDashboardUsers({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder as 'asc' | 'desc' : undefined
    })

    res.json({
      users: result.data,
      total: result.total
    })
  } catch (error: any) {
    console.error('dashboard users list failed:', error)
    res.status(500).json({ error: 'Failed to list dashboard users' })
  }
})

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const user = dashboardUserService.getDashboardUser(userId)

    if (!user) {
      denyDashboardUserNotFound(res)
      return
    }

    res.json({ user })
  } catch (error: any) {
    console.error('dashboard user get failed:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard user' })
  }
})

router.post('/', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { email, name, role } = req.body

    if (!email || !name || !role) {
      res.status(400).json({
        error: 'email, name, and role are required',
        code: 'MISSING_FIELDS'
      })
      return
    }

    if (!isDashboardRole(role)) {
      res.status(400).json({
        error: 'Invalid role. Must be one of: admin, viewer, user_admin, policy_admin',
        code: 'INVALID_ROLE'
      })
      return
    }

    if (role === 'admin') {
      const allowed = await requireAdminOnlyAction(
        req,
        res,
        'Action::"create_admin_dashboard_user"',
        'Only ziri can create admin dashboard users'
      )
      if (!allowed) return
    }

    const result = await dashboardUserService.createDashboardUser({ email, name, role })

    res.status(201).json({
      user: result.user,
      password: result.emailSent ? undefined : result.password,
      message: result.emailSent
        ? 'Dashboard user created. Credentials sent via email.'
        : 'Dashboard user created. Save the password — it won\'t be shown again.'
    })

    auditAction(req, res, 'create_dashboard_user', result.user.userId, actionStart)
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message })
      return
    }
    console.error('dashboard user create failed:', error)
    res.status(500).json({ error: 'Failed to create dashboard user' })
  }
})

router.put('/:userId', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const { email, name, role } = req.body
    const targetEntity = await getTargetForMutation(
      req,
      res,
      userId,
      'You cannot modify your own account'
    )
    if (!targetEntity) return

    const isUpdatingToAdmin = role === 'admin'
    const isTargetAdmin = targetEntity.attrs.role === 'admin'
    const canProceed = await requireAdminOnlyIf(
      req,
      res,
      isTargetAdmin || isUpdatingToAdmin,
      'Action::"update_admin_dashboard_user"',
      'Only ziri can modify admin dashboard users or promote users to admin'
    )
    if (!canProceed) return

    if (email !== undefined) {
      res.status(400).json({
        error: 'Email cannot be changed for dashboard users',
        code: 'EMAIL_IMMUTABLE'
      })
      return
    }

    const updates: { name?: string; role?: DashboardRole } = {}
    if (name !== undefined) updates.name = name
    if (role !== undefined) {
      if (!isDashboardRole(role)) {
        res.status(400).json({
          error: 'Invalid role. Must be one of: admin, viewer, user_admin, policy_admin',
          code: 'INVALID_ROLE'
        })
        return
      }
      updates.role = role
    }

    const user = await dashboardUserService.updateDashboardUser(userId, updates)
    res.json({ user })

    auditAction(req, res, 'update_dashboard_user', user.userId, actionStart)
  } catch (error: any) {
    if (error.message === 'Dashboard user not found') {
      res.status(404).json({ error: error.message })
      return
    }
    if (error.message.includes('already in use')) {
      res.status(409).json({ error: error.message })
      return
    }
    console.error('dashboard user update failed:', error)
    res.status(500).json({ error: 'Failed to update dashboard user' })
  }
})

router.delete('/:userId', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const targetEntity = await getTargetForMutation(
      req,
      res,
      userId,
      'You cannot delete your own account'
    )
    if (!targetEntity) return

    const canProceed = await requireAdminOnlyIf(
      req,
      res,
      targetEntity.attrs.role === 'admin',
      'Action::"delete_admin_dashboard_user"',
      'Only ziri can delete admin dashboard users'
    )
    if (!canProceed) return

    const hadKeys = keyService.getKeysByUserId(userId).length > 0
    if (hadKeys) {
      const canDeleteKeys = await requireKeysDeletionPermission(req, res)
      if (!canDeleteKeys) return
    }

    await dashboardUserService.deleteDashboardUser(userId)
    res.json({ success: true })

    auditAction(req, res, 'delete_dashboard_user', userId, actionStart)
    if (hadKeys) {
      logAdminRouteAction({
        req,
        res,
        action: 'delete_keys',
        resourceType: 'api_key',
        resourceId: userId,
        startedAt: actionStart
      })
    }
  } catch (error: any) {
    if (error.message === 'Dashboard user not found' || error.message.includes('Cannot delete')) {
      res.status(400).json({ error: error.message })
      return
    }
    console.error('dashboard user delete failed:', error)
    res.status(500).json({ error: 'Failed to delete dashboard user' })
  }
})

router.post('/:userId/disable', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const targetEntity = await getTargetForMutation(
      req,
      res,
      userId,
      'You cannot disable your own account'
    )
    if (!targetEntity) return

    const canProceed = await requireAdminOnlyIf(
      req,
      res,
      targetEntity.attrs.role === 'admin',
      'Action::"update_admin_dashboard_user"',
      'Only ziri can disable admin dashboard users'
    )
    if (!canProceed) return

    const user = await dashboardUserService.disableDashboardUser(userId)
    res.json({ user })

    auditAction(req, res, 'disable_dashboard_user', user.userId, actionStart)
  } catch (error: any) {
    if (error.message === 'Dashboard user not found' || error.message.includes('Cannot disable')) {
      res.status(400).json({ error: error.message })
      return
    }
    console.error('dashboard user disable failed:', error)
    res.status(500).json({ error: 'Failed to disable user' })
  }
})

router.post('/:userId/enable', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const targetEntity = await getTargetForMutation(
      req,
      res,
      userId,
      'You cannot enable your own account (it should already be enabled)'
    )
    if (!targetEntity) return

    const canProceed = await requireAdminOnlyIf(
      req,
      res,
      targetEntity.attrs.role === 'admin',
      'Action::"update_admin_dashboard_user"',
      'Only ziri can enable admin dashboard users'
    )
    if (!canProceed) return

    const user = await dashboardUserService.enableDashboardUser(userId)
    res.json({ user })

    auditAction(req, res, 'enable_dashboard_user', user.userId, actionStart)
  } catch (error: any) {
    if (error.message === 'Dashboard user not found') {
      res.status(404).json({ error: error.message })
      return
    }
    console.error('dashboard user enable failed:', error)
    res.status(500).json({ error: 'Failed to enable user' })
  }
})

router.post('/:userId/reset-password', async (req: AdminRequest, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const target = await getTargetForMutation(
      req,
      res,
      userId,
      'You cannot reset your own password'
    )
    if (!target) return

    const canProceed = await requireAdminOnlyIf(
      req,
      res,
      target.attrs.role === 'admin',
      'Action::"reset_admin_dashboard_user_password"',
      'Only ziri can reset an admin dashboard user\'s password'
    )
    if (!canProceed) return

    const result = await dashboardUserService.resetDashUserPw(userId)
    res.json({
      password: result.emailSent ? undefined : result.password,
      message: result.emailSent
        ? 'Password reset. New password sent via email.'
        : 'Password reset. Save the password below — email was not sent.'
    })

    auditAction(req, res, 'reset_dashboard_user_password', userId, actionStart)
  } catch (error: any) {
    if (error.message === 'Dashboard user not found' || error.message.includes('Cannot reset')) {
      res.status(400).json({ error: error.message })
      return
    }
    console.error('dashboard user pw reset failed:', error)
    res.status(500).json({ error: 'Password reset failed' })
  }
})

export default router
