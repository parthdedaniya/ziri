// Chat completions route (end-user)
// NOTE: This endpoint uses API key authentication ONLY (no JWT required)
// API key is passed via X-API-Key header

import { Router, type Request, type Response } from 'express'
import { extractUserIdFromApiKey, validateApiKeyFormat } from '../utils/api-key.js'
import * as keyService from '../services/key-service.js'
import { serviceFactory } from '../services/service-factory.js'
import * as llmService from '../services/llm-service.js'
import { getDatabase } from '../db/index.js'

const router: Router = Router()

/**
 * POST /api/chat/completions
 * Make LLM chat completion request
 * 
 * Authentication: API key only (via X-API-Key header)
 * No JWT token required - API key is the only authentication mechanism
 */
router.post('/completions', async (req: Request, res: Response) => {
  try {
    // Get API key from header
    const apiKey = req.headers['x-api-key'] as string
    
    if (!apiKey) {
      res.status(400).json({
        error: 'API key required. Include X-API-Key header.',
        code: 'API_KEY_REQUIRED'
      })
      return
    }
    
    // Validate API key format
    if (!validateApiKeyFormat(apiKey)) {
      res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT'
      })
      return
    }
    
    // Extract userId from API key
    const userId = extractUserIdFromApiKey(apiKey)
    if (!userId) {
      res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT'
      })
      return
    }
    
    // Validate API key exists and get userKeyId
    const { hashApiKey } = await import('../utils/api-key.js')
    const keyHash = hashApiKey(apiKey)
    const db = getDatabase()
    
    // Get key from user_agent_keys table
    const dbKey = db.prepare('SELECT auth_id, key_hash FROM user_agent_keys WHERE key_hash = ?').get(keyHash) as { auth_id: string; key_hash: string } | undefined
    if (!dbKey || dbKey.auth_id !== userId) {
      res.status(403).json({
        error: 'API key not found or invalid',
        code: 'API_KEY_INVALID'
      })
      return
    }
    
    // Get userKeyId from UserKey entity (find by user reference)
    const userKeyId = await keyService.getUserKeyIdForUser(userId)
    if (!userKeyId) {
      res.status(403).json({
        error: 'UserKey entity not found for user',
        code: 'USER_KEY_NOT_FOUND'
      })
      return
    }
    
    // Get request body
    const { provider, model, messages, ...otherParams } = req.body
    
    if (!provider || !model || !messages) {
      res.status(400).json({
        error: 'provider, model, and messages are required',
        code: 'MISSING_FIELDS'
      })
      return
    }
    
    // Authorize request using PDP
    // Format principal, action, and resource as Cedar entity UIDs based on schema
    // Principal is now UserKey::"userKeyId" (not Key::"keyHash")
    const principal = `UserKey::"${userKeyId}"`
    const action = 'Action::"completion"' // Based on schema: "completion" action
    const resource = `Resource::"${model}"` // Format: Resource::"modelName"
    
    // Cedar extension type helpers
    const toIp = (ip: string) => ({
      __extn: {
        fn: 'ip',
        arg: ip
      }
    })
    
    // Build context according to RequestContext schema (order: day_of_week, hour, ip_address, is_emergency, model_name, request_time)
    const now = new Date()
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()]
    const hour = now.getUTCHours()
    const ipAddress = req.ip || '127.0.0.1'
    
    const context = {
      day_of_week: dayOfWeek,
      hour,
      ip_address: toIp(ipAddress),
      is_emergency: otherParams.isEmergency || false,
      model_name: model,
      request_time: now.toISOString()
    }
    
    console.log('[CHAT] Authorization request:', {
      principal,
      action,
      resource,
      context,
      userId,
      model
    })
    
    // Authorize via IAuthorizationService (local or live based on mode)
    const authService = serviceFactory.getAuthorizationService()
    const authResult = await authService.authorize({
      principal,
      action,
      resource,
      context
    })
    
    if (authResult.decision !== 'Allow') {
      const errorReason = authResult.diagnostics?.errors?.[0] || 'Authorization denied'
      res.status(403).json({
        error: `Authorization denied: ${errorReason}`,
        code: 'AUTHORIZATION_DENIED',
        reason: errorReason
      })
      return
    }
    
    console.log('[CHAT] Authorization passed, making LLM request:', {
      userId,
      provider,
      model,
      messageCount: messages?.length || 0
    })
    
    // Make LLM request
    const llmResponse = await llmService.chatCompletions({
      provider,
      model,
      messages,
      ...otherParams
    })
    
    res.json(llmResponse)
  } catch (error: any) {
    console.error('[CHAT] Completion error:', error)
    
    if (error.message.includes('not configured')) {
      res.status(404).json({
        error: error.message,
        code: 'PROVIDER_NOT_FOUND'
      })
      return
    }
    
    if (error.message.includes('API key not found')) {
      res.status(500).json({
        error: error.message,
        code: 'PROVIDER_KEY_MISSING'
      })
      return
    }
    
    if (error.message.includes('PDP')) {
      res.status(503).json({
        error: error.message,
        code: 'PDP_UNAVAILABLE'
      })
      return
    }
    
    if (error.message.includes('LLM provider')) {
      res.status(502).json({
        error: error.message,
        code: 'LLM_PROVIDER_ERROR'
      })
      return
    }
    
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

export default router
