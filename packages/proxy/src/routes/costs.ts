import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { costTrackingService } from '../services/cost-tracking-service.js'
import { wrap } from '../utils/route.js'

const router: Router = Router()
router.use(requireAdmin)

router.get('/summary', wrap(async (req: Request, res: Response) => {
  const { executionKey, provider, model, startDate, endDate, groupBy } = req.query

  const summary = await costTrackingService.getCostSummary({
    executionKey: executionKey as string,
    provider: provider as string,
    model: model as string,
    startDate: startDate as string,
    endDate: endDate as string,
    groupBy: groupBy as 'day' | 'week' | 'month' | 'provider' | 'model' | 'user',
  })

  res.json({ data: summary })
}))

export default router
