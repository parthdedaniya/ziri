 

import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import * as keyService from '../services/key-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'

const router: Router = Router()

 
router.use(requireAdmin)

 
router.get('/', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const keys = keyService.listKeys()
    
    res.json({ keys })
  } catch (error: any) {
    
    console.error('[KEYS] List error:', error)
    res.status(500).json({
      error: 'Failed to list keys',
      code: 'LIST_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })
  }
})

 
router.get('/user/:userId', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    const keys = keyService.getKeysByUserId(userId)
    
    res.json({ keys })
  } catch (error: any) {
    
    console.error('[KEYS] Get user keys error:', error)
    res.status(500).json({
      error: 'Failed to get user keys',
      code: 'GET_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })
  }
})

 
router.post('/', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.body
    
    if (!userId) {
      res.status(400).json({
        error: 'userId is required',
        code: 'MISSING_USER_ID'
      })
      return
    }
    
    const result = await keyService.createKey({ 
      userId
 
    })
    
    res.status(201).json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'API key created successfully. Save the key - it won\'t be shown again!'
    })

    logInternalAction(req, {
      action: 'create_key',
      resourceType: 'api_key',
      resourceId: result.userId,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[KEYS] Create error:', error)
    
    if (error.message === 'User not found') {
      res.status(404).json({
        error: error.message,
        code: 'USER_NOT_FOUND'
      })

      return
    }
    
    if (error.message.includes('Backend API')) {
      res.status(502).json({
        error: error.message,
        code: 'BACKEND_API_ERROR'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to create key',
      code: 'CREATE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

 
router.post('/:userId/rotate', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    
    const result = await keyService.rotateKey(userId)
    
    res.json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'API key rotated successfully. Save the new key - it won\'t be shown again!'
    })

    logInternalAction(req, {
      action: 'rotate_key',
      resourceType: 'api_key',
      resourceId: result.userId,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[KEYS] Rotate error:', error)
    
    if (error.message === 'User not found') {
      res.status(404).json({
        error: error.message,
        code: 'USER_NOT_FOUND'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to rotate key',
      code: 'ROTATE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

 
router.delete('/:userId', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { userId } = req.params
    await keyService.deleteKeysByUserId(userId)
    
    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_keys',
      resourceType: 'api_key',
      resourceId: userId,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[KEYS] Delete error:', error)
    
    if (error.message === 'No keys found for user') {
      res.status(404).json({
        error: error.message,
        code: 'KEY_NOT_FOUND'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to delete key',
      code: 'DELETE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

 
router.delete('/id/:keyId', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { keyId } = req.params
    await keyService.deleteKeyById(keyId)
    
    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_key',
      resourceType: 'api_key',
      resourceId: keyId,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[KEYS] Delete by ID error:', error)
    
    if (error.message === 'API key not found') {
      res.status(404).json({
        error: error.message,
        code: 'KEY_NOT_FOUND'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to delete key',
      code: 'DELETE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

export default router
