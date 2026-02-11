 

import { Router, type Request, type Response } from 'express'
import { loadConfig } from '../config.js'
import { getRootKey } from '../utils/root-key.js'
import { requireAdmin } from '../middleware/auth.js'
import { writeConfig } from '../config/index.js'
import { logInternalAction } from '../utils/internal-audit-helpers.js'

const router: Router = Router()

 
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const config = loadConfig()
    
 

    res.json({
      mode: config.mode,
      server: {
        host: config.host,
        port: config.port
      },
      publicUrl: config.publicUrl,
      email: config.email,
      logLevel: config.logLevel
    })
  } catch (error: any) {

    res.status(500).json({
      error: 'Failed to load configuration',
      code: 'CONFIG_LOAD_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })
  }
})

 
router.post('/', requireAdmin, (req: Request, res: Response) => {
  const actionStart = Date.now()
  try {
    const { mode, server, publicUrl, email, logLevel } = req.body
    
 
    const existing = loadConfig()
    
 
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
    
 
    if (existing.backendUrl) updatedConfig.backendUrl = existing.backendUrl
    if (existing.orgId) updatedConfig.orgId = existing.orgId
    if (existing.projectId) updatedConfig.projectId = existing.projectId
    if (existing.clientId) updatedConfig.clientId = existing.clientId
    if (existing.clientSecret) updatedConfig.clientSecret = existing.clientSecret
    if (existing.pdpUrl) updatedConfig.pdpUrl = existing.pdpUrl
    
 
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

    logInternalAction(req, {
      action: 'update_config',
      resourceType: 'config',
      resourceId: 'global',
      actionDurationMs: Date.now() - actionStart
    })
  } catch (error: any) {
    console.error('[CONFIG] Failed to update configuration:', error)
    res.status(500).json({
      error: 'Failed to save configuration',
      code: 'CONFIG_SAVE_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
    })

  }
})

export default router
