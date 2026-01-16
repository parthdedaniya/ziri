// Role-based authentication middleware

import type { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '../utils/jwt.js'
import type { AuthenticatedRequest } from './jwt-auth.js'

/**
 * Middleware to require user authentication (any role)
 */
export function requireUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    })
    return
  }
  
  const token = authHeader.substring(7)
  
  try {
    const payload = verifyAccessToken(token)
    req.userId = payload.userId
    req.user = payload
    next()
  } catch (error: any) {
    if (error.message === 'Token expired') {
      res.status(401).json({
        error: 'Token expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED'
      })
      return
    }
    
    res.status(401).json({
      error: 'Invalid token. Please login again.',
      code: 'INVALID_TOKEN'
    })
  }
}

/**
 * Middleware to require admin role specifically
 */
export function requireAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  requireUser(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({
        error: 'Admin access required',
        code: 'ADMIN_ACCESS_REQUIRED'
      })
      return
    }
    next()
  })
}
