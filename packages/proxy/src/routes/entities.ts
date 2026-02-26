import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { serviceFactory } from '../services/service-factory.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'

const router: Router = Router()

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const uid = req.query.uid as string | undefined
    const includeApiKeys = req.query.includeApiKeys === 'true'
    const {
      search,
      limit,
      offset,
      entityType,
      sortBy,
      sortOrder
    } = req.query

    const entityStore = serviceFactory.getEntityStore()
    const result = await entityStore.getEntities(uid, {
      search: search as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      entityType: entityType as string | undefined,
      sortBy: sortBy as string | undefined || null,
      sortOrder: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder as 'asc' | 'desc' : null
    })

    const entities = result.data

    if (includeApiKeys) {
      const { getDatabase } = await import('../db/index.js')
      const db = getDatabase()
      const entitiesWithKeys = await Promise.all(entities.map(async entity => {
        if (entity.uid.type === 'UserKey') {
          const userKeyId = entity.uid.id
          const userEntityId = (entity.attrs as any).user?.__entity?.id
          if (userEntityId) {
            const dbKey = db.prepare(`
              SELECT id, key_value, key_hash FROM user_agent_keys
              WHERE auth_id = ? AND status IN ('active', 'disabled')
              ORDER BY created_at DESC LIMIT 1
            `).get(userEntityId) as { id: string; key_value: string; key_hash: string } | undefined
            if (dbKey) {
              const keySuffix = (dbKey.key_value && dbKey.key_value.length <= 5) ? dbKey.key_value : '-----'
              return {
                ...entity,
                apiKey: null,
                keySuffix,
                keyHash: dbKey.key_hash,
                executionKey: dbKey.id,
                userKeyId: userKeyId
              }
            }
          }
          return {
            ...entity,
            apiKey: null,
            keySuffix: null,
            keyHash: null,
            executionKey: null,
            userKeyId: userKeyId
          }
        }
        return entity
      }))
      const filtered = entitiesWithKeys.filter(e => {
        if (e.uid.type === 'UserKey' && (e as any).executionKey == null && (e as any).keySuffix == null) {
          return false
        }
        return true
      })
      res.json({
        data: filtered,
        total: result.total
      })
    } else {
      res.json({
        data: entities,
        total: result.total
      })
    }
  } catch (err: any) {
    console.error('entity fetch failed:', err)
    res.status(500).json({ error: 'Failed to get entities' })
  }
})

router.put('/', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { entity, status } = req.body

    if (!entity) {
      res.status(400).json({
        error: 'Entity is required',
        code: 'ENTITY_REQUIRED'
      })
      return
    }

    if (!entity.uid || !entity.uid.type || !entity.uid.id) {
      res.status(400).json({
        error: 'Entity must have uid with type and id',
        code: 'ENTITY_INVALID_UID'
      })
      return
    }

    if (entity.uid.type === 'UserKey' && entity.attrs?.user?.__entity?.id) {
      const authId = entity.attrs.user.__entity.id
      const entityStatus = entity.attrs.status
      if (entityStatus === 'active' || entityStatus === 'disabled') {
        const { getDatabase } = await import('../db/index.js')
        const db = getDatabase()
        db.prepare(`
          UPDATE user_agent_keys SET status = ?, updated_at = datetime('now')
          WHERE auth_id = ? AND status IN ('active', 'disabled')
        `).run(entityStatus, authId)
      }
    }

    const entityStore = serviceFactory.getEntityStore()
    const entityStatus = status !== undefined ? status : 1

    await entityStore.updateEntity(entity, entityStatus)

    const resourceId = entity?.uid?.id ? `${entity.uid.type}::${entity.uid.id}` : null
    logInternalAction(req, {
      action: 'update_entity',
      resourceType: 'entity',
      resourceId,
      decisionReason: res.locals.decisionReason ?? null,
      actionDurationMs: Date.now() - actionStart
    })

    res.json({ success: true })
  } catch (err: any) {
    console.error('entity update failed:', err)
    res.status(500).json({ error: 'Failed to update entity' })
  }
})

export default router
