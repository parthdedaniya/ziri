 

import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import * as keyService from '../services/key-service.js'

const router: Router = Router()

 
router.use(requireAdmin)

 
router.get('/', (req: Request, res: Response) => {
  try {
    const keys = keyService.listKeys()
    res.json({ keys })
  } catch (error: any) {
    console.error('[KEYS] List error:', error)
    res.status(500).json({
      error: 'Failed to list keys',
      code: 'LIST_ERROR'
    })
  }
})

 
router.get('/user/:userId', (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    const keys = keyService.getKeysByUserId(userId)
    res.json({ keys })
  } catch (error: any) {
    console.error('[KEYS] Get user keys error:', error)
    res.status(500).json({
      error: 'Failed to get user keys',
      code: 'GET_ERROR'
    })
  }
})

 
router.post('/', async (req: Request, res: Response) => {
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
      code: 'CREATE_ERROR'
    })
  }
})

 
router.post('/:userId/rotate', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    
    const result = await keyService.rotateKey(userId)
    
    res.json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'API key rotated successfully. Save the new key - it won\'t be shown again!'
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
      code: 'ROTATE_ERROR'
    })
  }
})

 
router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params
    await keyService.deleteKeysByUserId(userId)
    
    res.json({ success: true })
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
      code: 'DELETE_ERROR'
    })
  }
})

 
router.delete('/id/:keyId', async (req: Request, res: Response) => {
  try {
    const { keyId } = req.params
    keyService.deleteKeyById(keyId)
    
    res.json({ success: true })
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
      code: 'DELETE_ERROR'
    })
  }
})

export default router
