 
 

import { Router, type Request, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/jwt-auth.js'
import { getDatabase } from '../db/index.js'
import { decrypt } from '../utils/encryption.js'
import { serviceFactory } from '../services/service-factory.js'

const router: Router = Router()

 
router.use(requireAuth)

 
router.get('/', (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(req.userId) as any
    
    if (!user) {
      res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      })
      return
    }
    
 
    let decryptedEmail: string
    try {
      decryptedEmail = decrypt(user.email)
    } catch (error: any) {
      decryptedEmail = user.email // Fallback to plain text
    }
    
    res.json({
      userId: user.id,
      email: decryptedEmail,
      name: user.name || '',
      role: user.id === 'admin' ? 'admin' : 'user',
      status: user.status, // INTEGER: 0=inactive, 1=active, 2=revoked
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_sign_in || null
    })
  } catch (error: any) {
    console.error('[ME] Get user error:', error)
    res.status(500).json({
      error: 'Failed to get user info',
      code: 'GET_ERROR'
    })
  }
})

 
router.get('/keys', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({
        error: 'User ID not found in token',
        code: 'INVALID_TOKEN'
      })
      return
    }
    
 
    const entityStore = serviceFactory.getEntityStore()
    const allEntitiesResult = await entityStore.getEntities()
    const allEntities = allEntitiesResult.data
    
 
    const userKeyEntity = allEntities.find(e =>
      e.uid.type === 'UserKey' &&
      (e.attrs as any).user &&
      (e.attrs as any).user.__entity &&
      (e.attrs as any).user.__entity.id === userId
    )
    
    if (!userKeyEntity) {
      res.json({
        data: []
      })
      return
    }
    
 
    const db = getDatabase()
    const dbKey = db.prepare('SELECT key_value FROM user_agent_keys WHERE auth_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) as { key_value: string } | undefined
    
    let decryptedKey: string | null = null
    if (dbKey) {
      try {
        decryptedKey = decrypt(dbKey.key_value)
      } catch (error: any) {
        console.warn('[ME] Failed to decrypt API key:', error.message)
      }
    }
    
    res.json({
      data: [{
        ...userKeyEntity,
        apiKey: decryptedKey
      }]
    })
  } catch (error: any) {
    console.error('[ME] Get keys error:', error)
    res.status(500).json({
      error: 'Failed to get user keys',
      code: 'GET_KEYS_ERROR'
    })
  }
})

 
router.get('/usage', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      res.status(401).json({
        error: 'User ID not found in token',
        code: 'INVALID_TOKEN'
      })
      return
    }
    
 
    const entityStore = serviceFactory.getEntityStore()
    const allEntitiesResult = await entityStore.getEntities()
    const allEntities = allEntitiesResult.data
    
 
    const userKeyEntity = allEntities.find(e =>
      e.uid.type === 'UserKey' &&
      (e.attrs as any).user &&
      (e.attrs as any).user.__entity &&
      (e.attrs as any).user.__entity.id === userId
    )
    
    if (!userKeyEntity) {
      res.json({
        currentDailySpend: 0,
        dailySpendLimit: 0,
        currentMonthlySpend: 0,
        monthlySpendLimit: 0,
        totalRequests: 0,
        totalTokens: 0
      })
      return
    }
    
 
    const parseDecimal = (value: any): number => {
      if (typeof value === 'number') return value
      if (typeof value === 'string') return parseFloat(value) || 0
      if (value && typeof value === 'object' && value.__extn && value.__extn.fn === 'decimal') {
        return parseFloat(value.__extn.arg) || 0
      }
      return 0
    }
    
    const attrs = userKeyEntity.attrs || {}
    
 
 
    res.json({
      currentDailySpend: parseDecimal(attrs.current_daily_spend),
      dailySpendLimit: 0, // TODO: Fetch from User entity if limits are needed
      currentMonthlySpend: parseDecimal(attrs.current_monthly_spend),
      monthlySpendLimit: 0, // TODO: Fetch from User entity if limits are needed
      totalRequests: 0, // TODO: Implement when logging is added
      totalTokens: 0 // TODO: Implement when logging is added
    })
  } catch (error: any) {
    console.error('[ME] Get usage error:', error)
    res.status(500).json({
      error: 'Failed to get usage stats',
      code: 'GET_USAGE_ERROR'
    })
  }
})

export default router
