import { Router, type Request, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import * as userService from '../services/user-service.js'
import * as dashboardUserService from '../services/dashboard-user-service.js'
import * as keyService from '../services/key-service.js'
import { wrap } from '../utils/route.js'
import { authorizeInternalAdminAction, logAdminRouteAction } from './shared/internal-admin-route-helpers.js'
import type { User } from '../services/user-service.js'

const router: Router = Router()

router.use(requireAdmin)

function parseSortOrder(value: unknown): 'asc' | 'desc' | null {
  return value === 'asc' || value === 'desc' ? value : null
}

async function requireAdminPermission(
  req: AdminRequest,
  res: Response,
  action: string,
  resourceType: string
): Promise<boolean> {
  const authzResult = await authorizeInternalAdminAction({
    adminUserId: req.admin!.userId,
    action,
    resourceType,
    context: {}
  })
  if (!authzResult.allowed) {
    res.status(403).json({ error: 'Access denied', reason: authzResult.reason })
    return false
  }
  return true
}

router.get('/', wrap(async (req: Request, res: Response) => {
  const { search, limit, offset, sortBy, sortOrder, forApiKeys } = req.query
  const parsedSortOrder = parseSortOrder(sortOrder)

  let result: { data: User[]; total: number }

  if (forApiKeys === 'true') {
    // merge access + dashboard users for the API keys view
    const [accessResult, dashboardResult] = await Promise.all([
      userService.listUsers({
        search: search as string | undefined,
        limit: 1000, offset: 0,
        sortBy: sortBy as string | undefined || null,
        sortOrder: parsedSortOrder
      }),
      dashboardUserService.listDashboardUsers({
        search: search as string | undefined,
        limit: 1000, offset: 0,
        sortBy: sortBy as string | undefined || null,
        sortOrder: parsedSortOrder
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
      sortOrder: parsedSortOrder
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
      const allowed = await requireAdminPermission(req, res, 'Action::"create_key"', 'keys')
      if (!allowed) return
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

    logAdminRouteAction({
      req,
      res,
      action: 'create_user',
      resourceType: 'user',
      resourceId: result.user.userId,
      startedAt: t0
    })
    if (result.apiKey) {
      logAdminRouteAction({
        req,
        res,
        action: 'create_key',
        resourceType: 'api_key',
        resourceId: result.user.userId,
        startedAt: t0
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

    logAdminRouteAction({
      req,
      res,
      action: 'update_user',
      resourceType: 'user',
      resourceId: user.userId,
      startedAt: t0
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
      const allowed = await requireAdminPermission(req, res, 'Action::"delete_keys_by_user"', 'keys')
      if (!allowed) return
    }

    await userService.deleteUser(userId)
    res.json({ success: true })

    logAdminRouteAction({
      req,
      res,
      action: 'delete_user',
      resourceType: 'user',
      resourceId: userId,
      startedAt: t0
    })
    if (hadKeys) {
      logAdminRouteAction({
        req,
        res,
        action: 'delete_keys',
        resourceType: 'api_key',
        resourceId: userId,
        startedAt: t0
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

  logAdminRouteAction({
    req,
    res,
    action: 'reset_password',
    resourceType: 'user',
    resourceId: req.params.userId,
    startedAt: t0
  })
}))

export default router
