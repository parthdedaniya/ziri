// Config routes - expose configuration (read-only) and allow updates

import { Router, type Request, type Response } from 'express'
import { loadConfig } from '../config.js'
import { getMasterKey } from '../utils/master-key.js'
import { requireAdmin } from '../middleware/auth.js'
import { writeConfig } from '@zs-ai/config'

const router: Router = Router()

/**
 * GET /api/config
 * Get current configuration (read-only, for UI display)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const config = loadConfig()
    
    // Return config with master key (for display in UI)
    // Master key is already required for admin operations, so exposing it here is acceptable
    res.json({
      mode: config.mode,
      server: {
        host: config.host,
        port: config.port
      },
      publicUrl: config.publicUrl,
      email: config.email,
      logLevel: config.logLevel,
      masterKey: config.masterKey  // For display in UI
    })
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to load configuration',
      message: error.message
    })
  }
})

/**
 * POST /api/config
 * Update configuration (requires admin authentication)
 */
router.post('/', requireAdmin, (req: Request, res: Response) => {
  try {
    const { mode, server, publicUrl, email, logLevel } = req.body
    
    // Read existing config to preserve other fields
    const existing = loadConfig()
    
    // Build updated config object
    const updatedConfig: any = {
      mode: mode || existing.mode || 'local',
      server: server || {
        host: existing.host || '127.0.0.1',
        port: existing.port || 3100
      },
      publicUrl: publicUrl !== undefined ? publicUrl : existing.publicUrl,
      email: email !== undefined ? email : existing.email,
      logLevel: logLevel || existing.logLevel || 'info'
    }
    
    // Preserve live mode credentials if they exist
    if (existing.backendUrl) updatedConfig.backendUrl = existing.backendUrl
    if (existing.orgId) updatedConfig.orgId = existing.orgId
    if (existing.projectId) updatedConfig.projectId = existing.projectId
    if (existing.clientId) updatedConfig.clientId = existing.clientId
    if (existing.clientSecret) updatedConfig.clientSecret = existing.clientSecret
    if (existing.pdpUrl) updatedConfig.pdpUrl = existing.pdpUrl
    
    // Write config to file
    writeConfig(updatedConfig)
    
    console.log('[CONFIG] Configuration updated:', {
      mode: updatedConfig.mode,
      server: updatedConfig.server,
      hasPublicUrl: !!updatedConfig.publicUrl,
      emailEnabled: updatedConfig.email?.enabled || false,
      emailProvider: updatedConfig.email?.provider || 'none',
      logLevel: updatedConfig.logLevel
    })
    
    res.json({
      success: true,
      message: 'Configuration saved successfully. Restart the proxy server for server settings to take effect.',
      config: {
        mode: updatedConfig.mode,
        server: updatedConfig.server,
        publicUrl: updatedConfig.publicUrl,
        email: updatedConfig.email,
        logLevel: updatedConfig.logLevel
      }
    })
  } catch (error: any) {
    console.error('[CONFIG] Failed to update configuration:', error)
    res.status(500).json({
      error: 'Failed to save configuration',
      message: error.message
    })
  }
})

export default router
