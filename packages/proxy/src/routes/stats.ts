import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { getDatabase } from '../db/index.js'

const router: Router = Router()
router.use(requireAdmin)

router.get('/overview', (req: Request, res: Response) => {
  try {
    const db = getDatabase()
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined

    // build WHERE fragments shared across both tables
    const auditFilters: string[] = []
    const auditArgs: any[] = []
    const costFilters: string[] = []
    const costArgs: any[] = []

    if (startDate) {
      auditFilters.push('request_timestamp >= ?'); auditArgs.push(startDate)
      costFilters.push('request_timestamp >= ?');  costArgs.push(startDate)
    }
    if (endDate) {
      auditFilters.push('request_timestamp <= ?'); auditArgs.push(endDate)
      costFilters.push('request_timestamp <= ?');  costArgs.push(endDate)
    }

    const aw = auditFilters.length ? auditFilters.join(' AND ') : '1=1'
    const cw = costFilters.length ? costFilters.join(' AND ') : '1=1'

    const total   = (db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE ${aw}`).get(...auditArgs) as any).n || 0
    const permits = (db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE ${aw} AND decision = ?`).get(...auditArgs, 'permit') as any).n || 0
    const forbids = (db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE ${aw} AND decision = ?`).get(...auditArgs, 'forbid') as any).n || 0
    const cost    = (db.prepare(`SELECT SUM(total_cost) as n FROM cost_tracking WHERE ${cw}`).get(...costArgs) as any).n || 0

    res.json({ totalRequests: total, permitCount: permits, forbidCount: forbids, totalCost: cost })
  } catch (err: any) {
    console.error('stats overview failed:', err)
    res.status(500).json({ error: 'Could not load stats' })
  }
})

export default router
