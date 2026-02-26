import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { serviceFactory } from '../services/service-factory.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'
import { wrap } from '../utils/route.js'

const router: Router = Router()

router.get('/', requireAdmin, wrap(async (req: Request, res: Response) => {
  const store = serviceFactory.getSchemaStore()
  const wantCedar = req.query.format === 'cedar'

  if (wantCedar) {
    if (!store.getSchemaAsCedarText) {
      res.status(500).json({ error: 'Cedar text not supported by this store' })
      return
    }
    const [cedarText, schema] = await Promise.all([store.getSchemaAsCedarText(), store.getSchema()])
    res.json({ data: { schema: cedarText, schemaJson: schema.schema, version: schema.version, format: 'cedar' } })
  } else {
    const schema = await store.getSchema()
    res.json({ data: { schema: schema.schema, version: schema.version, format: 'json' } })
  }
}))

router.post('/', requireAdmin, wrap(async (req: Request, res: Response) => {
  const t0 = Date.now()
  const { schema } = req.body
  if (!schema) {
    res.status(400).json({ error: 'Schema is required' })
    return
  }

  const store = serviceFactory.getSchemaStore()
  const updated = await store.updateSchema(schema)

  let cedarText: string | undefined
  if (typeof schema === 'string') {
    cedarText = schema
  } else if (store.getSchemaAsCedarText) {
    try { cedarText = await store.getSchemaAsCedarText() } catch { /* fall through to JSON */ }
  }

  res.json({
    success: true,
    data: {
      schema: cedarText || updated.schema,
      schemaJson: updated.schema,
      version: updated.version,
      format: cedarText ? 'cedar' : 'json'
    }
  })

  logInternalAction(req, {
    action: 'update_schema', resourceType: 'schema', resourceId: 'schema',
    decisionReason: res.locals.decisionReason ?? null,
    actionDurationMs: Date.now() - t0
  })
}))

export default router
