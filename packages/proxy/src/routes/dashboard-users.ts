import { Router, type Request, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import * as dashboardUserService from '../services/dashboard-user-service.js'
import * as keyService from '../services/key-service.js'
import { internalEntityStore } from '../services/internal/internal-entity-store.js'
import { internalAuthorizationService } from '../services/internal/internal-authorization-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'

const router: Router = Router()


router.use(requireAdmin)


router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      search,
      limit,
      offset,
      sortBy,
      sortOrder
    } = req.query

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
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
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

    if (!['admin', 'viewer', 'user_admin', 'policy_admin'].includes(role)) {
      res.status(400).json({
        error: 'Invalid role. Must be one of: admin, viewer, user_admin, policy_admin',
        code: 'INVALID_ROLE'
      })
      return
    }


    if (role === 'admin') {
      const principalUserId = req.admin!.userId
      if (principalUserId !== 'ziri') {

        const principal = await internalEntityStore.getEntity(principalUserId)
        if (!principal) {
          res.status(403).json({
            error: 'User entity not found',
            code: 'ENTITY_NOT_FOUND'
          })
          return
        }

        const principalUid = `DashboardUser::"${principalUserId}"`
        const authzResult = await internalAuthorizationService.authorize({
          principal: principalUid,
          action: 'Action::"create_admin_dashboard_user"',
          resourceType: 'dashboard_users',
          context: {}
        })

        if (!authzResult.allowed) {
          res.status(403).json({
            error: 'Only ziri can create admin dashboard users',
            code: 'ADMIN_ONLY_ACTION'
          })
          return
        }
      }
    }

    const result = await dashboardUserService.createDashboardUser({
      email,
      name,
      role
    })

    res.status(201).json({
      user: result.user,
      password: result.emailSent ? undefined : result.password,
      message: result.emailSent
        ? 'Dashboard user created. Credentials sent via email.'
        : 'Dashboard user created. Save the password — it won\'t be shown again.'
    })

    logInternalAction(req, {
      action: 'create_dashboard_user',
      resourceType: 'dashboard_user',
      resourceId: result.user.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
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
    const principalUserId = req.admin!.userId


    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot modify your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }


    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }

    const targetUserRole = targetEntity.attrs.role
    const isUpdatingToAdmin = role === 'admin'
    const isTargetAdmin = targetUserRole === 'admin'


    if (isTargetAdmin || isUpdatingToAdmin) {
      if (principalUserId !== 'ziri') {

        const principal = await internalEntityStore.getEntity(principalUserId)
        if (!principal) {
          res.status(403).json({
            error: 'User entity not found',
            code: 'ENTITY_NOT_FOUND'
          })
          return
        }

        const principalUid = `DashboardUser::"${principalUserId}"`
        const authzResult = await internalAuthorizationService.authorize({
          principal: principalUid,
          action: 'Action::"update_admin_dashboard_user"',
          resourceType: 'dashboard_users',
          context: {}
        })

        if (!authzResult.allowed) {
          res.status(403).json({
            error: 'Only ziri can modify admin dashboard users or promote users to admin',
            code: 'ADMIN_ONLY_ACTION'
          })
          return
        }
      }
    }

    if (email !== undefined) {
      res.status(400).json({
        error: 'Email cannot be changed for dashboard users',
        code: 'EMAIL_IMMUTABLE'
      })
      return
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (role !== undefined) {
      if (!['admin', 'viewer', 'user_admin', 'policy_admin'].includes(role)) {
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

    logInternalAction(req, {
      action: 'update_dashboard_user',
      resourceType: 'dashboard_user',
      resourceId: user.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
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
    const principalUserId = req.admin!.userId


    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot delete your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }


    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }

    const targetUserRole = targetEntity.attrs.role


    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {

        const principal = await internalEntityStore.getEntity(principalUserId)
        if (!principal) {
          res.status(403).json({
            error: 'User entity not found',
            code: 'ENTITY_NOT_FOUND'
          })
          return
        }

        const principalUid = `DashboardUser::"${principalUserId}"`
        const authzResult = await internalAuthorizationService.authorize({
          principal: principalUid,
          action: 'Action::"delete_admin_dashboard_user"',
          resourceType: 'dashboard_users',
          context: {}
        })

        if (!authzResult.allowed) {
          res.status(403).json({
            error: 'Only ziri can delete admin dashboard users',
            code: 'ADMIN_ONLY_ACTION'
          })
          return
        }
      }
    }

    const keysBeforeDelete = keyService.getKeysByUserId(userId)
    const hadKeys = keysBeforeDelete.length > 0

    if (hadKeys && req.admin) {
      const principalUid = `DashboardUser::"${req.admin.userId}"`
      const authzResult = await internalAuthorizationService.authorize({
        principal: principalUid,
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
        return
      }
    }

    await dashboardUserService.deleteDashboardUser(userId)

    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_dashboard_user',
      resourceType: 'dashboard_user',
      resourceId: userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
    if (hadKeys) {
      logInternalAction(req, {
        action: 'delete_keys',
        resourceType: 'api_key',
        resourceId: userId,
        decisionReason: res.locals.decisionReason ?? null,
        actionDurationMs: Date.now() - actionStart
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
    const principalUserId = req.admin!.userId


    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot disable your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }


    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }

    const targetUserRole = targetEntity.attrs.role


    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {

        const principal = await internalEntityStore.getEntity(principalUserId)
        if (!principal) {
          res.status(403).json({
            error: 'User entity not found',
            code: 'ENTITY_NOT_FOUND'
          })
          return
        }

        const principalUid = `DashboardUser::"${principalUserId}"`
        const authzResult = await internalAuthorizationService.authorize({
          principal: principalUid,
          action: 'Action::"update_admin_dashboard_user"',
          resourceType: 'dashboard_users',
          context: {}
        })

        if (!authzResult.allowed) {
          res.status(403).json({
            error: 'Only ziri can disable admin dashboard users',
            code: 'ADMIN_ONLY_ACTION'
          })
          return
        }
      }
    }

    const user = await dashboardUserService.disableDashboardUser(userId)

    res.json({ user })

    logInternalAction(req, {
      action: 'disable_dashboard_user',
      resourceType: 'dashboard_user',
      resourceId: user.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
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
    const principalUserId = req.admin!.userId


    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot enable your own account (it should already be enabled)',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }


    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }

    const targetUserRole = targetEntity.attrs.role


    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {

        const principal = await internalEntityStore.getEntity(principalUserId)
        if (!principal) {
          res.status(403).json({
            error: 'User entity not found',
            code: 'ENTITY_NOT_FOUND'
          })
          return
        }

        const principalUid = `DashboardUser::"${principalUserId}"`
        const authzResult = await internalAuthorizationService.authorize({
          principal: principalUid,
          action: 'Action::"update_admin_dashboard_user"',
          resourceType: 'dashboard_users',
          context: {}
        })

        if (!authzResult.allowed) {
          res.status(403).json({
            error: 'Only ziri can enable admin dashboard users',
            code: 'ADMIN_ONLY_ACTION'
          })
          return
        }
      }
    }

    const user = await dashboardUserService.enableDashboardUser(userId)

    res.json({ user })

    logInternalAction(req, {
      action: 'enable_dashboard_user',
      resourceType: 'dashboard_user',
      resourceId: user.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
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
    const principalId = req.admin!.userId
    if (principalId === userId) {
      res.status(403).json({
        error: 'You cannot reset your own password',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }
    const target = await internalEntityStore.getEntity(userId)
    if (!target) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }
    const targetRole = target.attrs.role
    if (targetRole === 'admin' && principalId !== 'ziri') {
      const principal = await internalEntityStore.getEntity(principalId)
      if (!principal) {
        res.status(403).json({
          error: 'User entity not found',
          code: 'ENTITY_NOT_FOUND'
        })
        return
      }
      const principalUid = `DashboardUser::"${principalId}"`
      const authzResult = await internalAuthorizationService.authorize({
        principal: principalUid,
        action: 'Action::"reset_admin_dashboard_user_password"',
        resourceType: 'dashboard_users',
        context: {}
      })
      if (!authzResult.allowed) {
        res.status(403).json({
          error: 'Only ziri can reset an admin dashboard user\'s password',
          code: 'ADMIN_ONLY_ACTION'
        })
        return
      }
    }
    const result = await dashboardUserService.resetDashUserPw(userId)
    res.json({
      password: result.emailSent ? undefined : result.password,
      message: result.emailSent
        ? 'Password reset. New password sent via email.'
        : 'Password reset. Save the password below — email was not sent.'
    })
    logInternalAction(req, {
      action: 'reset_dashboard_user_password',
      resourceType: 'dashboard_user',
      resourceId: userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
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
