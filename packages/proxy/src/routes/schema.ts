// Schema routes - manage Cedar schema (local mode)

import { Router, type Request, type Response } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import { serviceFactory } from '../services/service-factory.js'

const router: Router = Router()

/**
 * GET /api/schema
 * Get current schema (returns JSON format)
 * Query param ?format=cedar returns Cedar text format
 */
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const schemaStore = serviceFactory.getSchemaStore()
    const format = req.query.format as string | undefined
    
    if (format === 'cedar') {
      // Return Cedar text format (retrieved directly from DB)
      if (!schemaStore.getSchemaAsCedarText) {
        res.status(500).json({
          error: 'Cedar text format not supported by this schema store'
        })
        return
      }
      
      // Get Cedar text directly from DB (source of truth)
      const cedarText = await schemaStore.getSchemaAsCedarText()
      
      // Also get JSON format for convenience (converts Cedar → JSON)
      const schema = await schemaStore.getSchema()
      
      res.json({
        data: {
          schema: cedarText, // Cedar text string (from DB)
          schemaJson: schema.schema, // JSON format (converted from Cedar)
          version: schema.version,
          format: 'cedar'
        }
      })
    } else {
      // Return JSON format (default) - converts Cedar text to JSON
      const schema = await schemaStore.getSchema()
      
      res.json({
        data: {
          schema: schema.schema, // JSON format
          version: schema.version,
          format: 'json'
        }
      })
    }
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get schema',
      message: error.message
    })
  }
})

/**
 * POST /api/schema
 * Update schema
 * Accepts either Cedar text (string) or JSON (object)
 * Query param ?format=cedar indicates Cedar text format
 */
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { schema } = req.body
    const format = req.query.format as string | undefined
    
    if (!schema) {
      res.status(400).json({
        error: 'Schema is required'
      })
      return
    }
    
    const schemaStore = serviceFactory.getSchemaStore()
    
    // If format=cedar or schema is a string, treat as Cedar text
    // Otherwise treat as JSON
    const schemaInput = format === 'cedar' || typeof schema === 'string' 
      ? schema 
      : schema
    
    const updated = await schemaStore.updateSchema(schemaInput)
    
    // Return both Cedar text and JSON formats for UI
    // IMPORTANT: Use the original input if it was Cedar text, don't reconvert
    // because reconversion can lose fields (like request_cost)
    let cedarText: string | undefined
    if (typeof schemaInput === 'string') {
      // Input was Cedar text - use it directly (this is what was stored in DB)
      cedarText = schemaInput
    } else {
      // Input was JSON - need to get Cedar text from DB
      // But we can't easily get it back, so convert JSON to Cedar text
      // This should match what was stored
      if (schemaStore.getSchemaAsCedarText) {
        try {
          cedarText = await schemaStore.getSchemaAsCedarText()
        } catch (e) {
          console.warn('[SCHEMA ROUTE] Failed to get Cedar text, will use JSON:', e)
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        schema: cedarText || updated.schema, // Cedar text if available, otherwise JSON
        schemaJson: updated.schema, // Always include JSON format
        version: updated.version,
        format: cedarText ? 'cedar' : 'json'
      }
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to update schema',
      message: error.message
    })
  }
})

export default router
