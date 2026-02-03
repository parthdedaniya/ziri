import type { Request, Response, NextFunction } from 'express'
import { type AdminRequest } from './auth.js'
import { internalAuthorizationService } from '../services/internal/internal-authorization-service.js'
import { internalEntityStore } from '../services/internal/internal-entity-store.js'

// Route → action mapping (from DESIGN doc Section 8)
// Maps (method, path) to { action, resourceType }
// Path is relative to route mount (e.g., /api/users mounted at /api/users, so path '/' means /api/users)
const routeActionMap: Record<string, { action: string; resourceType: string }> = {
  // /api/users
  'GET:/api/users': { action: 'list_users', resourceType: 'users' },
  'GET:/api/users/:userId': { action: 'get_user', resourceType: 'users' },
  'POST:/api/users': { action: 'create_user', resourceType: 'users' },
  'PUT:/api/users/:userId': { action: 'update_user', resourceType: 'users' },
  'DELETE:/api/users/:userId': { action: 'delete_user', resourceType: 'users' },
  'POST:/api/users/:userId/reset-password': { action: 'reset_user_password', resourceType: 'users' },
  
  // /api/keys
  'GET:/api/keys': { action: 'list_keys', resourceType: 'keys' },
  'GET:/api/keys/user/:userId': { action: 'get_keys_by_user', resourceType: 'keys' },
  'POST:/api/keys': { action: 'create_key', resourceType: 'keys' },
  'POST:/api/keys/:userId/rotate': { action: 'rotate_key', resourceType: 'keys' },
  'DELETE:/api/keys/:userId': { action: 'delete_keys_by_user', resourceType: 'keys' },
  'DELETE:/api/keys/id/:keyId': { action: 'delete_key_by_id', resourceType: 'keys' },
  
  // /api/config
  'GET:/api/config': { action: 'get_config', resourceType: 'config' },
  'POST:/api/config': { action: 'update_config', resourceType: 'config' },
  
  // /api/schema
  'GET:/api/schema': { action: 'view_schema', resourceType: 'schema' },
  'POST:/api/schema': { action: 'update_schema', resourceType: 'schema' },
  
  // /api/policies
  'GET:/api/policies': { action: 'list_policies', resourceType: 'policies' },
  'GET:/api/policies/templates': { action: 'get_policy_templates', resourceType: 'policies' },
  'POST:/api/policies': { action: 'create_policy', resourceType: 'policies' },
  'PUT:/api/policies': { action: 'update_policy', resourceType: 'policies' },
  'PATCH:/api/policies/status': { action: 'patch_policy_status', resourceType: 'policies' },
  'DELETE:/api/policies': { action: 'delete_policy', resourceType: 'policies' },
  
  // /api/entities
  'GET:/api/entities': { action: 'list_entities', resourceType: 'entities' },
  'PUT:/api/entities': { action: 'update_entities', resourceType: 'entities' },
  
  // /api/ai-policy
  'POST:/api/ai-policy/generate': { action: 'generate_policy_with_ai', resourceType: 'policies' },
  
  // /api/providers
  'GET:/api/providers': { action: 'list_providers', resourceType: 'providers' },
  'GET:/api/providers/:name': { action: 'get_provider', resourceType: 'providers' },
  'POST:/api/providers': { action: 'create_provider', resourceType: 'providers' },
  'DELETE:/api/providers/:name': { action: 'delete_provider', resourceType: 'providers' },
  'POST:/api/providers/:name/test': { action: 'test_provider', resourceType: 'providers' },
  
  // /api/audit
  'GET:/api/audit': { action: 'view_audit', resourceType: 'audit' },
  'GET:/api/audit/statistics': { action: 'view_audit', resourceType: 'audit' },
  
  // /api/stats
  'GET:/api/stats/overview': { action: 'view_stats', resourceType: 'dashboard' },
  
  // /api/costs
  'GET:/api/costs/summary': { action: 'view_costs', resourceType: 'analytics' },
  
  // /api/events
  'GET:/api/events': { action: 'view_events', resourceType: 'dashboard' },
  
  // /api/dashboard-users
  'GET:/api/dashboard-users': { action: 'list_dashboard_users', resourceType: 'dashboard_users' },
  'GET:/api/dashboard-users/:userId': { action: 'get_dashboard_user', resourceType: 'dashboard_users' },
  'POST:/api/dashboard-users': { action: 'create_dashboard_user', resourceType: 'dashboard_users' },
  'PUT:/api/dashboard-users/:userId': { action: 'update_dashboard_user', resourceType: 'dashboard_users' },
  'DELETE:/api/dashboard-users/:userId': { action: 'delete_dashboard_user', resourceType: 'dashboard_users' },
  'POST:/api/dashboard-users/:userId/disable': { action: 'update_dashboard_user', resourceType: 'dashboard_users' },
  'POST:/api/dashboard-users/:userId/enable': { action: 'update_dashboard_user', resourceType: 'dashboard_users' }
}

function getActionForRoute(method: string, path: string): { action: string; resourceType: string } | null {
  // Normalize path: remove trailing slashes
  const normalizedPath = path.replace(/\/$/, '')
  
  // Try exact match first
  const exactKey = `${method}:${normalizedPath}`
  if (routeActionMap[exactKey]) {
    return routeActionMap[exactKey]
  }
  
  // Try pattern matching for routes with parameters
  // Check if we have a pattern match by converting route patterns to regex
  for (const [key, value] of Object.entries(routeActionMap)) {
    const [keyMethod, keyPath] = key.split(':', 2)
    if (keyMethod === method) {
      // Convert keyPath pattern to regex (e.g., /api/users/:userId -> /api/users/[^/]+)
      const keyPattern = keyPath.replace(/\/:[^/]+/g, '/[^/]+')
      const regex = new RegExp(`^${keyPattern}$`)
      if (regex.test(normalizedPath)) {
        return value
      }
    }
  }
  
  return null
}

export function requireInternalAuthz(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  // This middleware should be called after requireAdmin, so req.admin should be set
  if (!req.admin) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    })
    return
  }
  
  const method = req.method
  // Use req.originalUrl or req.baseUrl + req.path to get full path
  // req.path is relative to mount, req.originalUrl is full path
  const fullPath = req.originalUrl?.split('?')[0] || req.baseUrl + req.path
  
  // Get action and resourceType from route mapping
  const routeMapping = getActionForRoute(method, fullPath)
  
  if (!routeMapping) {
    // Route not in mapping - allow for now (some routes like /api/authz/*, /api/auth/*, /api/health don't need internal authz)
    // Only enforce for routes that are in the mapping
    // Skip internal authz for authz endpoints themselves
    if (fullPath.startsWith('/api/authz/')) {
      next()
      return
    }
    console.log(`[INTERNAL AUTHZ] Route not in mapping (allowing): ${method} ${fullPath}`)
    next()
    return
  }
  
  const { action, resourceType } = routeMapping
  
  // Load principal from internal entity store
  const userId = req.admin.userId
  
  // For x-root-key, use ziri
  const principalUserId = userId === 'ziri' ? 'ziri' : userId
  
  // Check authorization asynchronously
  internalEntityStore.getEntity(principalUserId)
    .then(async (entity) => {
      if (!entity) {
        console.warn(`[INTERNAL AUTHZ] Entity not found for user: ${principalUserId}`)
        res.status(403).json({
          error: 'User entity not found',
          code: 'ENTITY_NOT_FOUND'
        })
        return
      }
      
      // Build principal/action UIDs consistent with internal schema:
      // entity DashboardUser; actions declared as plain Action::"name"
      const principal = `DashboardUser::"${principalUserId}"`
      const actionUid = `Action::"${action}"`
      
      // Call authorization service
      const result = await internalAuthorizationService.authorize({
        principal,
        action: actionUid,
        resourceType,
        context: {}
      })
      
      if (!result.allowed) {
        console.log(`[INTERNAL AUTHZ] Denied: ${principalUserId} -> ${action} on ${resourceType}`)
        res.status(403).json({
          error: 'Access denied',
          code: 'ACCESS_DENIED',
          reason: result.reason
        })
        return
      }
      
      // Allowed - proceed
      next()
    })
    .catch((error: any) => {
      console.error('[INTERNAL AUTHZ] Authorization check error:', error)
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      })
    })
}
