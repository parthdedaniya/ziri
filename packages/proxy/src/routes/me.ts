import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/jwt-auth.js'
import { getDatabase } from '../db/index.js'
import { decrypt } from '../utils/encryption.js'
import { serviceFactory } from '../services/service-factory.js'
import * as keyService from '../services/key-service.js'
import { wrap } from '../utils/route.js'

const router: Router = Router()

function parseDecimal(value: any): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value) || 0
  if (value?.__extn?.fn === 'decimal') return parseFloat(value.__extn.arg) || 0
  return 0
}

function findUserKey(entities: any[], userId: string) {
  return entities.find(e =>
    e.uid.type === 'UserKey' &&
    (e.attrs as any).user?.__entity?.id === userId
  )
}

router.use(requireAuth)

router.get('/', (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase()
  const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(req.userId) as any

  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  let email: string
  try { email = decrypt(user.email) } catch { email = user.email }

  res.json({
    userId: user.id,
    email,
    name: user.name || '',
    role: user.id === 'ziri' ? 'admin' : 'user',
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLogin: user.last_sign_in || null
  })
})

router.get('/keys', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Missing user ID in token' }); return }

  const allEntities = (await serviceFactory.getEntityStore().getEntities()).data
  const userKey = findUserKey(allEntities, userId)

  if (!userKey) {
    res.json({ data: [] })
    return
  }

  const db = getDatabase()
  const dbKey = db.prepare(
    `SELECT key_value FROM user_agent_keys WHERE auth_id = ? AND status IN ('active','disabled') ORDER BY created_at DESC LIMIT 1`
  ).get(userId) as { key_value: string } | undefined

  const kv = dbKey?.key_value
  const keySuffix = kv && kv.length <= 5 ? kv : (dbKey ? '-----' : null)
  const attrs = userKey.attrs || {}

  res.json({
    data: [{
      ...userKey,
      apiKey: null,
      keySuffix,
      currentDailySpend: parseDecimal(attrs.current_daily_spend),
      currentMonthlySpend: parseDecimal(attrs.current_monthly_spend),
      lastDailyReset: attrs.last_daily_reset || '',
      lastMonthlyReset: attrs.last_monthly_reset || ''
    }]
  })
}))

router.get('/usage', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Missing user ID in token' }); return }

  const db = getDatabase()
  const allEntities = (await serviceFactory.getEntityStore().getEntities()).data
  const userKey = findUserKey(allEntities, userId)

  if (!userKey) {
    res.json({
      currentDailySpend: 0, dailySpendLimit: 0,
      currentMonthlySpend: 0, monthlySpendLimit: 0,
      totalRequests: 0, totalTokens: 0,
      lastDailyReset: '', lastMonthlyReset: ''
    })
    return
  }

  const attrs = userKey.attrs || {}
  const execKeys = (db.prepare('SELECT id FROM user_agent_keys WHERE auth_id = ?').all(userId) as { id: string }[]).map(k => k.id)

  let totalRequests = 0
  let totalTokens = 0

  if (execKeys.length) {
    totalRequests = (db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE auth_id = ? AND decision = 'permit'`).get(userId) as any)?.n || 0
    try {
      const ph = execKeys.map(() => '?').join(',')
      totalTokens = (db.prepare(`SELECT COALESCE(SUM(total_tokens),0) as n FROM cost_tracking WHERE execution_key IN (${ph})`).get(...execKeys) as any)?.n || 0
    } catch { /* cost_tracking might not exist yet */ }
  }

  res.json({
    currentDailySpend: parseDecimal(attrs.current_daily_spend),
    dailySpendLimit: 0,
    currentMonthlySpend: parseDecimal(attrs.current_monthly_spend),
    monthlySpendLimit: 0,
    totalRequests,
    totalTokens,
    lastDailyReset: attrs.last_daily_reset || '',
    lastMonthlyReset: attrs.last_monthly_reset || ''
  })
}))

router.post('/rotate', wrap(async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId
  if (!userId) { res.status(401).json({ error: 'Missing user ID in token' }); return }

  try {
    const result = await keyService.rotateKey(userId)
    res.json({
      apiKey: result.apiKey,
      userId: result.userId,
      message: 'Key rotated. Save the new key — you won\'t see it again.'
    })
  } catch (err: any) {
    if (err.message === 'User not found') {
      res.status(404).json({ error: err.message })
      return
    }
    if (err.message.includes('UserKey entity not found')) {
      res.status(404).json({ error: 'No API key found for your account. Contact your admin.' })
      return
    }
    throw err
  }
}))

export default router
