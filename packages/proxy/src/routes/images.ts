import { Router, type Request, type Response } from 'express'
import { extractUserIdFromApiKey, validateApiKeyFormat, hashApiKey } from '../utils/api-key.js'
import * as keyService from '../services/key-service.js'
import { serviceFactory } from '../services/service-factory.js'
import * as llmService from '../services/llm-service.js'
import { getDatabase } from '../db/index.js'
import { auditLogService } from '../services/audit-log-service.js'
import { costTrackingService } from '../services/cost-tracking-service.js'
import { spendResetService } from '../services/spend-reset-service.js'
import { rateLimiterService } from '../services/rate-limiter-service.js'
import { queueManagerService } from '../services/queue-manager-service.js'
import { eventEmitterService } from '../services/event-emitter-service.js'
import { spendReservationService } from '../services/spend-reservation-service.js'
import { modelCapabilityService } from '../services/model-capability-service.js'

const router: Router = Router()

router.post('/generations', async (req: Request, res: Response) => {
  const requestStartTime = Date.now()
  let requestId: string | null = null
  let auditLogId: number | null = null
  let userKeyId: string | null = null
  let slotAcquired = false
  let costReserved = false
  let reservedAmount = 0

  try {
    requestId = auditLogService.generateRequestId()

    const apiKey = req.headers['x-api-key'] as string
    if (!apiKey) {
      res.status(400).json({
        error: 'API key required. Include X-API-Key header.',
        code: 'API_KEY_REQUIRED',
        requestId
      })
      return
    }

    if (!validateApiKeyFormat(apiKey)) {
      res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT',
        requestId
      })
      return
    }

    const userId = extractUserIdFromApiKey(apiKey)
    if (!userId) {
      res.status(401).json({
        error: 'Invalid API key format',
        code: 'INVALID_API_KEY_FORMAT',
        requestId
      })
      return
    }

    const keyHash = hashApiKey(apiKey)
    const db = getDatabase()

    const dbKey = db.prepare("SELECT id, auth_id FROM user_agent_keys WHERE key_hash = ? AND status = 'active'").get(keyHash) as { id: string; auth_id: string } | undefined
    if (!dbKey || dbKey.auth_id !== userId) {
      res.status(403).json({
        error: 'API key not found or invalid',
        code: 'API_KEY_INVALID',
        requestId
      })
      return
    }

    const authRow = db.prepare('SELECT role, status FROM auth WHERE id = ?').get(userId) as { role: string | null; status: number } | undefined
    if (authRow?.role != null && authRow.status === 2) {
      res.status(403).json({
        error: 'Dashboard user account is disabled. API key is not valid.',
        code: 'DASHBOARD_USER_DISABLED',
        requestId
      })
      return
    }

    const apiKeyId = dbKey.id

    const foundUserKeyId = await keyService.getUserKeyIdForUser(userId)
    if (!foundUserKeyId) {
      res.status(403).json({
        error: 'UserKey entity not found for user',
        code: 'USER_KEY_NOT_FOUND',
        requestId
      })
      return
    }
    userKeyId = foundUserKeyId

    const entityStore = serviceFactory.getEntityStore()
    const allEntitiesResult = await entityStore.getEntities()
    const allEntities = allEntitiesResult.data
    const userKeyEntity = allEntities.find(e =>
      e.uid.type === 'UserKey' &&
      e.uid.id === userKeyId
    )

    if (!userKeyEntity) {
      res.status(403).json({
        error: 'UserKey entity not found',
        code: 'USER_KEY_NOT_FOUND',
        requestId
      })
      return
    }

    const keyStatus = (userKeyEntity.attrs as any).status
    if (keyStatus === 'disabled' || keyStatus === 'deleted') {
      res.status(403).json({
        error: 'API key is disabled or has been deleted',
        code: 'API_KEY_REVOKED_OR_DISABLED',
        requestId
      })
      return
    }

    const { provider, model, prompt, n, size, quality, response_format, ...otherParams } = req.body

    if (!provider || !model || !prompt) {
      res.status(400).json({
        error: 'provider, model, and prompt are required',
        code: 'MISSING_FIELDS',
        requestId
      })
      return
    }

    const numImages = typeof n === 'number' && n > 0 ? n : 1
    const imageSize = size || '1024x1024'
    const imageQuality = quality || 'standard'

    const userEntity = allEntities.find(e =>
      e.uid.type === 'User' &&
      e.uid.id === userId
    )

    if (!userEntity) {
      res.status(403).json({
        error: 'User entity not found',
        code: 'USER_ENTITY_NOT_FOUND',
        requestId
      })
      return
    }

    const limitRequestsPerMinute = (userEntity.attrs as any).limit_requests_per_minute ?? null
    const effectiveLimit = limitRequestsPerMinute === 0 ? null : limitRequestsPerMinute

    const rateLimitResult = await rateLimiterService.checkRateLimit(
      'api_key',
      apiKeyId,
      { requestsPerMinute: effectiveLimit }
    )

    res.set('X-RateLimit-Limit', String(rateLimitResult.limit))
    res.set('X-RateLimit-Remaining', String(rateLimitResult.remaining))
    res.set('X-RateLimit-Reset', String(Math.floor(rateLimitResult.resetAt.getTime() / 1000)))

    if (!rateLimitResult.allowed) {
      res.set('Retry-After', String(rateLimitResult.retryAfterSeconds))
      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        requestId,
        retryAfter: rateLimitResult.retryAfterSeconds,
        resetAt: rateLimitResult.resetAt.toISOString(),
      })
      return
    }

    const capability = modelCapabilityService.checkModelAction(provider, model, 'image_generation')
    if (!capability.supported) {
      res.status(400).json({
        error: capability.error?.message || 'Model does not support image generation',
        code: capability.error?.code || 'ACTION_NOT_SUPPORTED',
        requestId
      })
      return
    }

    const pricingRow = db.prepare(`
      SELECT price_per_image, max_images_per_request
      FROM image_pricing
      WHERE provider = ? AND model = ? AND quality = ? AND size = ?
      ORDER BY effective_from DESC
      LIMIT 1
    `).get(provider, model, imageQuality, imageSize) as { price_per_image: number; max_images_per_request: number } | undefined

    if (!pricingRow) {
      res.status(400).json({
        error: `Image pricing not configured for model '${model}' (${imageQuality}, ${imageSize})`,
        code: 'IMAGE_CONFIG_NOT_FOUND',
        requestId
      })
      return
    }

    if (numImages > (pricingRow.max_images_per_request || 1)) {
      res.status(400).json({
        error: `Requested number of images (${numImages}) exceeds maximum allowed (${pricingRow.max_images_per_request})`,
        code: 'IMAGE_REQUEST_TOO_LARGE',
        requestId
      })
      return
    }

    const estimatedCost = numImages * pricingRow.price_per_image

    try {
      await queueManagerService.acquireSlot(
        userKeyId,
        requestId,
        {
          requestId,
          userKeyId,
          authId: userId,
          apiKeyId,
          provider,
          model,
          requestBody: req.body,
          estimatedCost,
        }
      )
    } catch (error: any) {
      if (error.message.includes('Queue full')) {
        return res.status(503).json({
          error: 'Server busy - queue full',
          code: 'QUEUE_FULL',
          requestId,
        })
      }
      throw error
    }

    slotAcquired = true

    const spendResetResult = await spendResetService.checkAndResetSpend(userKeyEntity as any)
    const activeEntity = spendResetResult.updatedEntity || userKeyEntity

    await spendReservationService.reserveEstimatedSpend(
      activeEntity as any,
      userKeyId,
      estimatedCost
    )
    costReserved = true
    reservedAmount = estimatedCost

    const principal = `UserKey::"${userKeyId}"`
    const action = 'Action::"image_generation"'
    const resource = `Resource::"${model}"`

    const toIp = (ip: string) => ({
      __extn: {
        fn: 'ip',
        arg: ip
      }
    })

    const now = new Date()
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()]
    const hour = now.getUTCHours()
    const ipAddress = req.ip || '127.0.0.1'

    const context = {
      day_of_week: dayOfWeek,
      hour,
      ip_address: toIp(ipAddress),
      is_emergency: false,
      model_name: model,
      model_provider: provider,
      request_time: now.toISOString()
    }

    const authStartTime = Date.now()
    const authService = serviceFactory.getAuthorizationService()
    const authResult = await authService.authorize({
      principal,
      action,
      resource,
      context
    })
    const authEndTime = Date.now()
    const authDurationMs = authEndTime - authStartTime

    const decisionReason = authResult.diagnostics?.reason?.[0] || authResult.diagnostics?.errors?.[0] || undefined
    const policiesEvaluated = authResult.diagnostics?.reason || []
    const determiningPolicies = authResult.decision === 'Allow' ? policiesEvaluated : []

    auditLogId = await auditLogService.log({
      requestId,
      principal,
      principalType: 'UserKey',
      authId: userId,
      apiKeyId,
      action: 'image_generation',
      resource,
      provider,
      model,
      decision: authResult.decision === 'Allow' ? 'permit' : 'forbid',
      decisionReason,
      policiesEvaluated: policiesEvaluated as string[],
      determiningPolicies: determiningPolicies as string[],
      requestIp: ipAddress,
      userAgent: req.headers['user-agent'],
      requestMethod: req.method,
      requestPath: req.path,
      requestBodyHash: auditLogService.hashRequestBody(req.body),
      cedarContext: context,
      entitySnapshot: activeEntity.attrs,
      requestTimestamp: now.toISOString(),
      authStartTime: new Date(authStartTime).toISOString(),
      authEndTime: new Date(authEndTime).toISOString(),
      authDurationMs,
    })

    eventEmitterService.emitEvent('audit_log_created', {
      auditLogId,
      requestId,
      timestamp: new Date().toISOString(),
      decision: authResult.decision === 'Allow' ? 'permit' : 'forbid',
      provider,
      model
    })

    if (authResult.decision !== 'Allow') {
      if (slotAcquired) {
        queueManagerService.releaseSlot(userKeyId, requestId)
        slotAcquired = false
      }
      res.status(403).json({
        error: `Authorization denied: ${decisionReason || 'Authorization denied'}`,
        code: 'AUTHORIZATION_DENIED',
        reason: decisionReason,
        requestId
      })
      return
    }

    const llmRequestStartTime = Date.now()
    let llmResponse: any
    try {
      llmResponse = await llmService.createImages({
        provider,
        model,
        prompt,
        n: numImages,
        size: imageSize,
        quality: imageQuality,
        response_format,
        ...otherParams
      })
    } catch (llmError: any) {
      if (costReserved && userKeyId) {
        await spendReservationService.releaseReservedSpend(userKeyId, reservedAmount)
        costReserved = false
      }
      if (slotAcquired) {
        queueManagerService.releaseSlot(userKeyId, requestId)
        slotAcquired = false
      }
      throw llmError
    }
    const llmResponseTime = Date.now()

    const totalCost = estimatedCost

    const costTrackingId = await costTrackingService.trackImageCost({
      requestId,
      executionKey: apiKeyId,
      auditLogId,
      provider,
      providerRequestId: llmResponse.id,
      modelRequested: model,
      modelUsed: model,
      totalCost,
      numImages,
      imageQuality,
      imageSize,
      requestTimestamp: new Date(llmRequestStartTime).toISOString(),
      responseTimestamp: new Date(llmResponseTime).toISOString(),
      latencyMs: llmResponseTime - llmRequestStartTime,
      status: 'completed',
    })

    eventEmitterService.emitEvent('cost_tracked', {
      costTrackingId,
      requestId,
      timestamp: new Date().toISOString(),
      provider,
      model,
    })

    await auditLogService.updateWithProviderResponse(requestId, llmResponse.id, costTrackingId)

    if (slotAcquired) {
      queueManagerService.releaseSlot(userKeyId, requestId)
      slotAcquired = false
    }

    res.json({
      ...llmResponse,
      _meta: {
        requestId,
        cost: {
          estimated: estimatedCost,
          actual: totalCost,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          totalCost,
        },
        timing: {
          totalMs: Date.now() - requestStartTime,
          authMs: authDurationMs,
          llmMs: llmResponseTime - llmRequestStartTime,
        },
      },
    })
  } catch (error: any) {
    if (requestId && userKeyId && costReserved) {
      try {
        await spendReservationService.releaseReservedSpend(userKeyId, reservedAmount)
      } catch {
      }
    }
    if (requestId && slotAcquired && userKeyId) {
      try {
        queueManagerService.releaseSlot(userKeyId, requestId)
      } catch {
      }
    }

    console.error('[IMAGES] Generation error:', error)

    if (requestId && auditLogId) {
      try {
        await auditLogService.updateWithProviderResponse(requestId, '', 0)
      } catch {
      }
    }

    if (error.message?.includes('not configured')) {
      res.status(404).json({
        error: error.message,
        code: 'PROVIDER_NOT_FOUND',
        requestId: requestId || undefined
      })
      return
    }

    if (error.message?.includes('API key not found')) {
      res.status(500).json({
        error: error.message,
        code: 'PROVIDER_KEY_MISSING',
        requestId: requestId || undefined
      })
      return
    }

    if (error.message?.includes('LLM provider')) {
      res.status(502).json({
        error: error.message,
        code: 'LLM_PROVIDER_ERROR',
        requestId: requestId || undefined
      })
      return
    }

    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: requestId || undefined
    })
  }
})

export default router

