import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import * as providerService from '../services/provider-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'

const router: Router = Router()

router.use(requireAdmin)

router.get('/', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const {
      search,
      limit,
      offset,
      sortBy,
      sortOrder
    } = req.query
    
    const result = providerService.listProviders({
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      sortBy: sortBy as string | undefined || null,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder as 'asc' | 'desc' : null
    })
    
    res.json({
      providers: result.data,
      total: result.total
    })
  } catch (error: any) {
    
    console.error('[PROVIDERS] List error:', error)
    res.status(500).json({
      error: 'Failed to list providers',
      code: 'LIST_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })
  }
})

router.get('/:name', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { name } = req.params
    const provider = providerService.getProvider(name)
    
    if (!provider) {
      res.status(404).json({
        error: 'Provider not found',
        code: 'PROVIDER_NOT_FOUND'
      })
      return
    }
    
    res.json({ provider })
  } catch (error: any) {
    console.error('[PROVIDERS] Get error:', error)
    res.status(500).json({
      error: 'Failed to get provider',
      code: 'GET_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })
  }
})

router.post('/', (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { name, apiKey, metadata } = req.body
    
    if (!name || !apiKey) {
      res.status(400).json({
        error: 'name and apiKey are required',
        code: 'MISSING_FIELDS'
      })
      return
    }
    
    const provider = providerService.createOrUpdateProvider({ name, apiKey, metadata })
    
    res.json({ provider })

    logInternalAction(req, {
      action: 'create_provider',
      resourceType: 'provider',
      resourceId: provider.name,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[PROVIDERS] Create/Update error:', error)
    
    if (error.message.includes('Invalid API key')) {
      res.status(400).json({
        error: error.message,
        code: 'INVALID_API_KEY'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to create/update provider',
      code: 'CREATE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

router.delete('/:name', (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { name } = req.params
    providerService.deleteProvider(name)
    
    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_provider',
      resourceType: 'provider',
      resourceId: name,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[PROVIDERS] Delete error:', error)
    
    if (error.message === 'Provider not found') {
      res.status(404).json({
        error: error.message,
        code: 'PROVIDER_NOT_FOUND'
      })

      return
    }
    
    res.status(500).json({
      error: 'Failed to delete provider',
      code: 'DELETE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

router.post('/:name/test', async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { name } = req.params
    const result = await providerService.testProviderApiKey(name)
    
    if (result.success) {
      res.json({ success: true, message: 'Provider connection successful' })

      logInternalAction(req, {
        action: 'test_provider',
        resourceType: 'provider',
        resourceId: name,
        actionDurationMs: Date.now() - actionStart
      })
    } else {
      res.status(400).json({
        error: result.error || 'Provider connection failed',
        code: 'CONNECTION_FAILED'
      })

    }
  } catch (error: any) {
    console.error('[PROVIDERS] Test error:', error)
    res.status(500).json({
      error: 'Failed to test provider',
      code: 'TEST_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

export default router
