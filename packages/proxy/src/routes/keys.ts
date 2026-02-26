import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import * as keyService from '../services/key-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'
import { wrap } from '../utils/route.js'

const router: Router = Router()

router.use(requireAdmin)

router.get('/', wrap(async (req: Request, res: Response) => {
  const keys = keyService.listKeys()
  res.json({ keys })
}))

router.get('/user/:userId', wrap(async (req: Request, res: Response) => {
  const keys = keyService.getKeysByUserId(req.params.userId)
  res.json({ keys })
}))

router.post('/', wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  const { userId } = req.body

  if (!userId) {
    res.status(400).json({ error: 'userId is required' })
    return
  }

  try {
    const result = await keyService.createKey({ userId })

    res.status(201).json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'API key created. Save it now — you won\'t see it again.'
    })

    logInternalAction(req, {
      action: 'create_key',
      resourceType: 'api_key',
      resourceId: result.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - t0
    })
  } catch (err: any) {
    if (err.message === 'User not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message.includes('Backend API')) {
      res.status(502).json({ error: err.message })
      return
    }
    throw err
  }
}))

router.post('/:userId/rotate', wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    const result = await keyService.rotateKey(req.params.userId)

    res.json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'Key rotated. Save the new key — you won\'t see it again.'
    })

    logInternalAction(req, {
      action: 'rotate_key',
      resourceType: 'api_key',
      resourceId: result.userId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - t0
    })
  } catch (err: any) {
    if (err.message === 'User not found') {
      res.status(404).json({ error: err.message })
      return
    }
    throw err
  }
}))

router.delete('/:userId', wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  await keyService.deleteKeysByUserId(req.params.userId)
  res.json({ success: true })

  logInternalAction(req, {
    action: 'delete_keys',
    resourceType: 'api_key',
    resourceId: req.params.userId,
    decisionReason: res.locals.decisionReason ?? null,
    actionDurationMs: Date.now() - t0
  })
}))

router.delete('/id/:keyId', wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  try {
    await keyService.deleteKeyById(req.params.keyId)
    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_key',
      resourceType: 'api_key',
      resourceId: req.params.keyId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - t0
    })
  } catch (err: any) {
    if (err.message === 'API key not found') {
      res.status(404).json({ error: err.message })
      return
    }
    throw err
  }
}))

export default router
