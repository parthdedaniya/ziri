import { Router, type Request, type Response } from 'express'
import { requireAdmin, type AdminRequest } from '../middleware/auth.js'
import * as dashboardUserService from '../services/dashboard-user-service.js'
import { internalEntityStore } from '../services/internal/internal-entity-store.js'
import { internalAuthorizationService } from '../services/internal/internal-authorization-service.js'

const router: Router = Router()

// All routes require admin authentication
router.use(requireAdmin)

// List all dashboard users
router.get('/', (req: Request, res: Response) => {
  try {
    const {
      search,
      limit,
      offset
    } = req.query
    
    const result = dashboardUserService.listDashboardUsers({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined
    })
    
    res.json({
      users: result.data,
      total: result.total
    })
  } catch (error: any) {
    console.error('[DASHBOARD USERS] List error:', error)
    res.status(500).json({
      error: 'Failed to list dashboard users',
      code: 'LIST_ERROR'
    })
  }
})

// Get single dashboard user
router.get('/:userId', (req: Request, res: Response) => {
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
    console.error('[DASHBOARD USERS] Get error:', error)
    res.status(500).json({
      error: 'Failed to get dashboard user',
      code: 'GET_ERROR'
    })
  }
})

// Create dashboard user
router.post('/', async (req: AdminRequest, res: Response) => {
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
    
    // Check admin-only restriction: only ziri can create admin users
    if (role === 'admin') {
      const principalUserId = req.admin!.userId
      if (principalUserId !== 'ziri') {
        // Also check via Cedar policy for consistency
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
    
    if (result.emailSent) {
      res.status(201).json({
        user: result.user,
        message: 'Dashboard user created successfully. Credentials have been sent to the user\'s email address.'
      })
    } else {
      res.status(201).json({
        user: result.user,
        password: result.password,
        message: 'Dashboard user created successfully. Save the password - it won\'t be shown again! Email was not sent (email service not configured or failed).'
      })
    }
  } catch (error: any) {
    console.error('[DASHBOARD USERS] Create error:', error)
    
    if (error.message.includes('already exists')) {
      res.status(409).json({
        error: error.message,
        code: 'USER_EXISTS'
      })
      return
    }
    
    res.status(500).json({
      error: 'Failed to create dashboard user',
      code: 'CREATE_ERROR',
      message: error.message
    })
  }
})

// Update dashboard user
router.put('/:userId', async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params
    const { email, name, role } = req.body
    const principalUserId = req.admin!.userId
    
    // Check self-modification restriction
    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot modify your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }
    
    // Load target user entity to check their current role
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
    
    // Check admin-only restriction: only ziri can modify admin users or promote to admin
    if (isTargetAdmin || isUpdatingToAdmin) {
      if (principalUserId !== 'ziri') {
        // Also check via Cedar policy for consistency
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
    
    const updates: any = {}
    if (email !== undefined) updates.email = email
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
  } catch (error: any) {
    console.error('[DASHBOARD USERS] Update error:', error)
    
    if (error.message === 'Dashboard user not found') {
      res.status(404).json({
        error: error.message,
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
    if (error.message.includes('already in use')) {
      res.status(409).json({
        error: error.message,
        code: 'EMAIL_EXISTS'
      })
      return
    }
    
    res.status(500).json({
      error: 'Failed to update dashboard user',
      code: 'UPDATE_ERROR',
      message: error.message
    })
  }
})

// Delete dashboard user
router.delete('/:userId', async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params
    const principalUserId = req.admin!.userId
    
    // Check self-modification restriction
    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot delete your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }
    
    // Load target user entity to check their role
    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
    const targetUserRole = targetEntity.attrs.role
    
    // Check admin-only restriction: only ziri can delete admin users
    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {
        // Also check via Cedar policy for consistency
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
    
    await dashboardUserService.deleteDashboardUser(userId)
    
    res.json({ success: true })
  } catch (error: any) {
    console.error('[DASHBOARD USERS] Delete error:', error)
    
    if (error.message === 'Dashboard user not found' || error.message.includes('Cannot delete')) {
      res.status(400).json({
        error: error.message,
        code: error.message.includes('Cannot delete') ? 'CANNOT_DELETE' : 'USER_NOT_FOUND'
      })
      return
    }
    
    res.status(500).json({
      error: 'Failed to delete dashboard user',
      code: 'DELETE_ERROR',
      message: error.message
    })
  }
})

// Disable dashboard user
router.post('/:userId/disable', async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params
    const principalUserId = req.admin!.userId
    
    // Check self-modification restriction
    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot disable your own account',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }
    
    // Load target user entity to check their role
    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
    const targetUserRole = targetEntity.attrs.role
    
    // Check admin-only restriction: only ziri can disable admin users
    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {
        // Also check via Cedar policy for consistency
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
  } catch (error: any) {
    console.error('[DASHBOARD USERS] Disable error:', error)
    
    if (error.message === 'Dashboard user not found' || error.message.includes('Cannot disable')) {
      res.status(400).json({
        error: error.message,
        code: error.message.includes('Cannot disable') ? 'CANNOT_DISABLE' : 'USER_NOT_FOUND'
      })
      return
    }
    
    res.status(500).json({
      error: 'Failed to disable dashboard user',
      code: 'DISABLE_ERROR',
      message: error.message
    })
  }
})

// Enable dashboard user
router.post('/:userId/enable', async (req: AdminRequest, res: Response) => {
  try {
    const { userId } = req.params
    const principalUserId = req.admin!.userId
    
    // Check self-modification restriction
    if (principalUserId === userId) {
      res.status(403).json({
        error: 'You cannot enable your own account (it should already be enabled)',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      })
      return
    }
    
    // Load target user entity to check their role
    const targetEntity = await internalEntityStore.getEntity(userId)
    if (!targetEntity) {
      res.status(404).json({
        error: 'Dashboard user not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
    const targetUserRole = targetEntity.attrs.role
    
    // Check admin-only restriction: only ziri can enable admin users
    if (targetUserRole === 'admin') {
      if (principalUserId !== 'ziri') {
        // Also check via Cedar policy for consistency
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
  } catch (error: any) {
    console.error('[DASHBOARD USERS] Enable error:', error)
    
    if (error.message === 'Dashboard user not found') {
      res.status(404).json({
        error: error.message,
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
    res.status(500).json({
      error: 'Failed to enable dashboard user',
      code: 'ENABLE_ERROR',
      message: error.message
    })
  }
})

export default router
