import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { serviceFactory } from '../services/service-factory.js'
import { getDatabase } from '../db/index.js'
import { getPolicyTemplates } from '../services/policy-template-service.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'
import { parsePolicyId } from '../utils/cedar-policy.js'

const router: Router = Router()

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      search,
      limit,
      offset,
      effect,
      sortBy,
      sortOrder
    } = req.query

    const db = getDatabase()

    let whereClause = "WHERE obj_type = 'policy'"
    const args: any[] = []

    let orderByClause = 'ORDER BY created_at ASC'
    if (sortBy && sortOrder && (sortOrder === 'asc' || sortOrder === 'desc')) {
      const columnMap: Record<string, string> = {
        'description': 'description',
        'status': 'status',
        'effect': 'content',
        'createdAt': 'created_at',
        'updatedAt': 'updated_at'
      }
      const dbColumn = columnMap[sortBy as string]
      if (dbColumn) {
        const order = sortOrder.toUpperCase()
        orderByClause = `ORDER BY ${dbColumn} ${order}`
      }
    }

    let countSql = `SELECT COUNT(*) as total FROM schema_policy ${whereClause}`
    const countResult = db.prepare(countSql).get(...args) as { total: number }
    let total = countResult.total

    const limitValue = limit ? parseInt(limit as string, 10) : 100
    const offsetValue = offset ? parseInt(offset as string, 10) : 0
    const dataSql = `
      SELECT content, description, status, created_at, updated_at
      FROM schema_policy 
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `
    const rows = db.prepare(dataSql).all(...args, limitValue, offsetValue) as { content: string; description: string | null; status: number; created_at: string; updated_at: string }[]

    let policies = rows.map(row => ({
      policy: row.content,
      description: row.description || '',
      isActive: row.status === 1,
      effect: row.content.toLowerCase().includes('permit(') ? 'permit' : 'forbid' as 'permit' | 'forbid'
    }))

    if (search) {
      const searchLower = (search as string).toLowerCase()
      policies = policies.filter(p =>
        p.description.toLowerCase().includes(searchLower) ||
        p.policy.toLowerCase().includes(searchLower)
      )

      const allRows = db.prepare(`
        SELECT content, description, status 
        FROM schema_policy 
        ${whereClause}
        ORDER BY created_at ASC
      `).all(...args) as { content: string; description: string | null; status: number }[]
      const allPolicies = allRows.map(row => ({
        policy: row.content,
        description: row.description || '',
        isActive: row.status === 1,
        effect: row.content.toLowerCase().includes('permit(') ? 'permit' : 'forbid' as 'permit' | 'forbid'
      }))
      const filtered = allPolicies.filter(p =>
        p.description.toLowerCase().includes(searchLower) ||
        p.policy.toLowerCase().includes(searchLower)
      )
      total = filtered.length
    }

    if (effect && (effect === 'permit' || effect === 'forbid')) {
      policies = policies.filter(p => p.effect === effect)
      if (search) {
        const allRows = db.prepare(`
          SELECT content, description, status 
          FROM schema_policy 
          ${whereClause}
          ORDER BY created_at ASC
        `).all(...args) as { content: string; description: string | null; status: number }[]
        const allPolicies = allRows.map(row => ({
          policy: row.content,
          description: row.description || '',
          isActive: row.status === 1,
          effect: row.content.toLowerCase().includes('permit(') ? 'permit' : 'forbid' as 'permit' | 'forbid'
        }))
        const searchLower = (search as string).toLowerCase()
        const filtered = allPolicies.filter(p =>
          (p.description.toLowerCase().includes(searchLower) ||
            p.policy.toLowerCase().includes(searchLower)) &&
          p.effect === effect
        )
        total = filtered.length
      } else {
        const allRows = db.prepare(`
          SELECT content, description, status 
          FROM schema_policy 
          ${whereClause}
          ORDER BY created_at ASC
        `).all(...args) as { content: string; description: string | null; status: number }[]
        const allPolicies = allRows.map(row => ({
          policy: row.content,
          description: row.description || '',
          isActive: row.status === 1,
          effect: row.content.toLowerCase().includes('permit(') ? 'permit' : 'forbid' as 'permit' | 'forbid'
        }))
        const filtered = allPolicies.filter(p => p.effect === effect)
        total = filtered.length
      }
    }

    if (sortBy === 'effect' && sortOrder && (sortOrder === 'asc' || sortOrder === 'desc')) {
      policies.sort((a, b) => {
        const comparison = a.effect.localeCompare(b.effect)
        return sortOrder === 'asc' ? comparison : -comparison
      })
    }

    res.json({
      data: {
        policies
      },
      total
    })
  } catch (error: any) {

    res.status(500).json({
      error: 'Failed to get policies',
      code: 'POLICIES_GET_ERROR',
    })
  }
})

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { policy, description } = req.body

    if (!policy || !description) {
      res.status(400).json({
        error: 'Policy and description are required',
        code: 'POLICY_MISSING_FIELDS'
      })
      return
    }

    if (!parsePolicyId(policy)) {
      res.status(400).json({
        error: 'Policy must include @id("your-id") at the start.',
        code: 'POLICY_ID_REQUIRED'
      })
      return
    }

    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.createPolicy(policy, description)
    const policyId = parsePolicyId(policy)

    res.json({ success: true })

    logInternalAction(req, {
      action: 'create_policy',
      resourceType: 'policy',
      resourceId: policyId ?? undefined,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    if (error.message?.includes('Policy ID already exists')) {
      res.status(409).json({
        error: 'This Policy ID is already in use.',
        code: 'POLICY_ID_EXISTS'
      })
      return
    }
    res.status(500).json({
      error: 'Failed to create policy',
      code: 'POLICY_CREATE_ERROR',
    })
  }
})

router.put('/', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { oldPolicy, policy, description } = req.body

    if (!oldPolicy || !policy || !description) {
      res.status(400).json({
        error: 'oldPolicy, policy, and description are required',
        code: 'POLICY_UPDATE_MISSING_FIELDS'
      })
      return
    }

    if (!parsePolicyId(policy)) {
      res.status(400).json({
        error: 'Policy must include @id("your-id") at the start.',
        code: 'POLICY_ID_REQUIRED'
      })
      return
    }

    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.updatePolicy(oldPolicy, policy, description)
    const policyId = parsePolicyId(policy)

    res.json({ success: true })

    logInternalAction(req, {
      action: 'update_policy',
      resourceType: 'policy',
      resourceId: policyId ?? undefined,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    if (error.message?.includes('Policy ID already exists')) {
      res.status(409).json({
        error: 'This Policy ID is already in use.',
        code: 'POLICY_ID_EXISTS'
      })
      return
    }
    res.status(500).json({
      error: 'Failed to update policy',
      code: 'POLICY_UPDATE_ERROR',
    })
  }
})

router.patch('/status', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { policy, isActive } = req.body as { policy?: string; isActive?: boolean }

    if (!policy || typeof isActive !== 'boolean') {
      res.status(400).json({
        error: 'policy and isActive (boolean) are required',
        code: 'POLICY_STATUS_MISSING_FIELDS'
      })
      return
    }

    const db = getDatabase()

    const existing = db.prepare(`
      SELECT id FROM schema_policy 
      WHERE obj_type = 'policy' AND content = ?
    `).get(policy) as { id: string } | undefined

    if (!existing) {
      res.status(404).json({
        error: 'Policy not found',
        code: 'POLICY_NOT_FOUND'
      })

      return
    }

    const newStatus = isActive ? 1 : 0
    const result = db.prepare(`
      UPDATE schema_policy
      SET status = ?, updated_at = datetime('now')
      WHERE obj_type = 'policy' AND content = ?
    `).run(newStatus, policy)

    if (result.changes === 0) {
      res.status(404).json({
        error: 'Policy not found',
        code: 'POLICY_NOT_FOUND'
      })

      return
    }

    res.json({
      success: true,
      message: `Policy ${isActive ? 'activated' : 'deactivated'} successfully`
    })

    const policyId = parsePolicyId(policy)
    logInternalAction(req, {
      action: 'patch_policy_status',
      resourceType: 'policy',
      resourceId: policyId ?? undefined,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to update policy status',
      code: 'POLICY_STATUS_ERROR',
    })

  }
})

router.delete('/', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { policy } = req.body

    if (!policy) {
      res.status(400).json({
        error: 'Policy is required',
        code: 'POLICY_REQUIRED'
      })

      return
    }

    const policyStore = serviceFactory.getPolicyStore()
    await policyStore.deletePolicy(policy)
    const policyId = parsePolicyId(policy)

    res.json({ success: true })

    logInternalAction(req, {
      action: 'delete_policy',
      resourceType: 'policy',
      resourceId: policyId ?? undefined,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to delete policy',
      code: 'POLICY_DELETE_ERROR',
    })

  }
})

router.get('/templates', requireAdmin, async (req: Request, res: Response) => {
  try {
    const templates = getPolicyTemplates()

    res.json({
      templates
    })
  } catch (error: any) {

    res.status(500).json({
      error: 'Failed to get policy templates',
      code: 'POLICY_TEMPLATES_ERROR',
    })
  }
})

export default router
