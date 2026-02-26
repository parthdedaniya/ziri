import { Router, type Request, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import * as userService from '../services/user-service.js'
import * as dashboardUserService from '../services/dashboard-user-service.js'
import * as keyService from '../services/key-service.js'
import { internalAuthorizationService } from '../services/internal/internal-authorization-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'
import { wrap } from '../utils/route.js'
import type { User } from '../services/user-service.js'

const router: Router = Router()

router.use(requireAdmin)

router.get('/', wrap(async (req: Request, res: Response) => {
  const { search, limit, offset, sortBy, sortOrder, forApiKeys } = req.query

  let result: { data: User[]; total: number }

  if (forApiKeys === 'true') {
    // merge access + dashboard users for the API keys view
    const [accessResult, dashboardResult] = await Promise.all([
      userService.listUsers({
        search: search as string | undefined,
        limit: 1000, offset: 0,
        sortBy: sortBy as string | undefined || null,
        sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : null
      }),
      dashboardUserService.listDashboardUsers({
        search: search as string | undefined,
        limit: 1000, offset: 0,
        sortBy: sortBy as string | undefined || null,
        sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : null
      })
    ])

    const dashAsUsers: User[] = dashboardResult.data.map(d => ({
      id: d.userId, userId: d.userId,
      email: d.email, name: d.name,
      tenant: undefined, isAgent: false,
      status: d.status, createdAt: d.createdAt,
      updatedAt: d.updatedAt, lastSignIn: d.lastSignIn
    }))

    const merged = [...accessResult.data, ...dashAsUsers]
    const lim = limit ? parseInt(limit as string, 10) : 100
    const off = offset ? parseInt(offset as string, 10) : 0
    result = { data: merged.slice(off, off + lim), total: merged.length }
  } else {
    result = userService.listUsers({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as string | undefined || null,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : null
    })
  }

  const usersWithRole = await Promise.all(
    result.data.map(async (u) => ({
      ...u,
      roleId: await userService.getRoleIdForUser(u.userId)
    }))
  )
  res.json({ users: usersWithRole, total: result.total })
}))

router.get('/:userId', wrap(async (req: Request, res: Response) => {
  const user = userService.getUserById(req.params.userId)
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  const roleId = await userService.getRoleIdForUser(req.params.userId)
  res.json({ user: { ...user, roleId } })
}))

router.post('/', async (req: AdminRequest, res: Response) => {
  const t0 = Date.now()
  try {
    const { email, name, tenant, isAgent, limitRequestsPerMinute, createApiKey, roleId } = req.body

    if (!email || !name) {
      res.status(400).json({ error: 'email and name are required' })
      return
    }

    const wantsKey = createApiKey === true || createApiKey === 'true'

    if (wantsKey && req.admin) {
      const principal = `DashboardUser::"${req.admin.userId}"`
      const authzResult = await internalAuthorizationService.authorize({
        principal,
        action: 'Action::"create_key"',
        resourceType: 'keys',
        context: {}
      })
      if (!authzResult.allowed) {
        res.status(403).json({ error: 'Access denied', reason: authzResult.reason })
        return
      }
    }

    const result = await userService.createUser({
      email, name, tenant,
      isAgent: isAgent ?? false,
      limitRequestsPerMinute: limitRequestsPerMinute || 100,
      createApiKey: wantsKey,
      roleId: roleId || undefined
    })

    const msg = result.emailSent
      ? 'User created. Credentials sent via email.'
      : 'User created. Save the password — it won\'t be shown again.'

    res.status(201).json({
      user: result.user,
      password: result.emailSent ? undefined : result.password,
      apiKey: result.apiKey,
      message: msg
    })

    logInternalAction(req, {
      action: 'create_user', resourceType: 'user',
      resourceId: result.user.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - t0
    })
    if (result.apiKey) {
      logInternalAction(req, {
        action: 'create_key', resourceType: 'api_key',
        resourceId: result.user.userId,
        decisionReason: res.locals.decisionReason ?? null,
        actionDurationMs: Date.now() - t0
      })
    }
  } catch (err: any) {
    if (err.message?.startsWith('Role not found')) {
      res.status(400).json({ error: err.message })
      return
    }
    if (err.message?.includes('already exists')) {
      res.status(409).json({ error: err.message })
      return
    }
    console.error('user creation failed:', err)
    res.status(500).json({ error: 'Failed to create user' })
  }
})

router.put('/:userId', async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const { email, name, tenant, isAgent, limitRequestsPerMinute, roleId } = req.body
    const user = await userService.updateUser(req.params.userId, {
      email, name, tenant, isAgent, limitRequestsPerMinute, roleId
    })
    res.json({ user })

    logInternalAction(req, {
      action: 'update_user', resourceType: 'user',
      resourceId: user.userId,
      actionDurationMs: Date.now() - t0
    })
  } catch (err: any) {
    if (err.message?.startsWith('Role not found')) {
      res.status(400).json({ error: err.message })
    } else if (err.message === 'User not found') {
      res.status(404).json({ error: err.message })
    } else if (err.message?.includes('already in use')) {
      res.status(409).json({ error: err.message })
    } else {
      console.error('user update failed:', err)
      res.status(500).json({ error: 'Failed to update user' })
    }
  }
})

router.delete('/:userId', async (req: AdminRequest, res: Response) => {
  const t0 = Date.now()
  try {
    const { userId } = req.params
    const hadKeys = keyService.getKeysByUserId(userId).length > 0

    if (hadKeys && req.admin) {
      const principal = `DashboardUser::"${req.admin.userId}"`
      const authzResult = await internalAuthorizationService.authorize({
        principal,
        action: 'Action::"delete_keys_by_user"',
        resourceType: 'keys',
        context: {}
      })
      if (!authzResult.allowed) {
        res.status(403).json({ error: 'Access denied', reason: authzResult.reason })
        return
      }
    }

    await userService.deleteUser(userId)
    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_user', resourceType: 'user', resourceId: userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - t0
    })
    if (hadKeys) {
      logInternalAction(req, {
        action: 'delete_keys', resourceType: 'api_key', resourceId: userId,
        decisionReason: res.locals.decisionReason ?? null,
        actionDurationMs: Date.now() - t0
      })
    }
  } catch (err: any) {
    if (err.message === 'User not found') {
      res.status(404).json({ error: err.message })
    } else {
      console.error('user deletion failed:', err)
      res.status(500).json({ error: 'Failed to delete user' })
    }
  }
})

router.post('/:userId/reset-password', wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  const result = await userService.resetUserPassword(req.params.userId)

  res.json({
    password: result.emailSent ? undefined : result.password,
    emailSent: result.emailSent,
    message: result.emailSent
      ? 'Password reset. New password sent via email.'
      : 'Password reset. Save the password — it won\'t be shown again.'
  })

  logInternalAction(req, {
    action: 'reset_password', resourceType: 'user',
    resourceId: req.params.userId,
    decisionReason: res.locals.decisionReason ?? null,
    actionDurationMs: Date.now() - t0
  })
}))

export default router
