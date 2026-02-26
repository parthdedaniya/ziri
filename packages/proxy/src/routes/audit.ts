import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { auditLogService } from '../services/audit-log-service.js'
import { wrap } from '../utils/route.js'

const router: Router = Router()
router.use(requireAdmin)

router.get('/', wrap(async (req: Request, res: Response) => {
  const { authId, apiKeyId, provider, model, decision, startDate, endDate, search, limit = '10', offset = '0', sortBy, sortOrder } = req.query

  const result = await auditLogService.query({
    authId: authId as string,
    apiKeyId: apiKeyId as string,
    provider: provider as string,
    model: model as string,
    decision: decision as 'permit' | 'forbid',
    startDate: startDate as string,
    endDate: endDate as string,
    search: search as string,
    limit: parseInt(limit as string, 10),
    offset: parseInt(offset as string, 10),
    sortBy: sortBy ? sortBy as string : null,
    sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : null
  })

  res.json({ data: result.data, count: result.data.length, total: result.total })
}))

router.get('/statistics', wrap(async (req: Request, res: Response) => {
  const stats = await auditLogService.getStatistics(
    req.query.startDate as string,
    req.query.endDate as string
  )
  res.json({ data: stats })
}))

export default router
