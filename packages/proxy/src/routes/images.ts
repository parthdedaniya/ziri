import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { extractUserIdFromApiKey } from '../utils/api-key.js'
import * as keyService from '../services/key-service.js'
import { serviceFactory } from '../services/service-factory.js'
import * as llmService from '../services/llm-service.js'
import { auditLogService } from '../services/audit-log-service.js'
import { costTrackingService } from '../services/cost-tracking-service.js'
import { spendResetService } from '../services/spend-reset-service.js'
import { queueManagerService } from '../services/queue-manager-service.js'
import { eventEmitterService } from '../services/event-emitter-service.js'
import { spendReservationService } from '../services/spend-reservation-service.js'
import { modelCapabilityService } from '../services/model-capability-service.js'
import { enforceUserRateLimit, runLlmPreflight } from './shared/llm-preflight.js'
import {
  buildAuthorizationContext,
  releaseAfterProviderFailure,
  releaseReservedSpendOrLog,
  releaseQueueSlotOrLog
} from './shared/llm-route-helpers.js'
import { mapStandardLlmRouteError } from './shared/llm-error-mapping.js'
import { getDatabase } from '../db/index.js'

const router: Router = Router()

router.post('/', async (req: Request, res: Response) => {
  const requestStartTime = Date.now()
  let requestId: string | null = null
  let auditLogId: number | null = null
  let userKeyId: string | null = null
  let slotAcquired = false
  let costReserved = false
  let reservedAmount = 0

  try {
    const preflight = await runLlmPreflight(req, res)
    if (!preflight) return
    requestId = preflight.requestId
    const { userId, apiKeyId, allEntities, userKeyEntity } = preflight
    userKeyId = preflight.userKeyId

    const {
      provider,
      model,
      prompt,
      n = 1,
      size: imageSize = '1024x1024',
      quality: imageQuality = 'standard',
      ...otherParams
    } = req.body

    if (!provider || !model || !prompt) {
      res.status(400).json({
        error: 'provider, model, and prompt are required',
        code: 'MISSING_FIELDS',
        requestId
      })
      return
    }

    const userEntity = await enforceUserRateLimit(res, { userId, apiKeyId, allEntities, requestId })
    if (!userEntity) return

    const capability = modelCapabilityService.checkModelAction(provider, model, 'image_generation')
    if (!capability.supported) {
      res.status(400).json({
        error: capability.error?.message || 'Model does not support image generation',
        code: capability.error?.code || 'ACTION_NOT_SUPPORTED',
        requestId
      })
      return
    }

    const db = getDatabase()
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

    if (n > (pricingRow.max_images_per_request || 1)) {
      res.status(400).json({
        error: `Requested number of images (${n}) exceeds maximum allowed (${pricingRow.max_images_per_request})`,
        code: 'IMAGE_REQUEST_TOO_LARGE',
        requestId
      })
      return
    }

    const estimatedCost = n * pricingRow.price_per_image

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

    const { now, ipAddress, context } = buildAuthorizationContext(req, {
      model,
      provider,
      isEmergency: otherParams.isEmergency || false
    })

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
      await releaseReservedSpendOrLog({
        requestId,
        userKeyId,
        amount: reservedAmount,
        spendReservationService,
        reason: 'authorization denied'
      })
      costReserved = false
      if (slotAcquired && userKeyId && requestId) {
        releaseQueueSlotOrLog({
          requestId,
          userKeyId,
          queueManagerService,
          reason: 'authorization denied'
        })
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
        n,
        size: imageSize,
        quality: imageQuality,
        ...otherParams
      })
    } catch (llmError: any) {
      const cleanup = await releaseAfterProviderFailure({
        costReserved,
        userKeyId,
        reservedAmount,
        slotAcquired,
        requestId,
        spendReservationService,
        queueManagerService
      })
      costReserved = cleanup.costReserved
      slotAcquired = cleanup.slotAcquired
      throw llmError
    }
    const llmResponseTime = Date.now()

    const providerRequestId = llmResponse.id || randomUUID()
    const totalCost = estimatedCost

    const costTrackingId = await costTrackingService.trackCost({
      requestId,
      executionKey: apiKeyId,
      auditLogId,
      provider,
      providerRequestId,
      modelRequested: model,
      modelUsed: llmResponse.model || model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      requestTimestamp: new Date(llmRequestStartTime).toISOString(),
      responseTimestamp: new Date(llmResponseTime).toISOString(),
      latencyMs: llmResponseTime - llmRequestStartTime,
      status: 'completed',
      action: 'image_generation',
    })

    eventEmitterService.emitEvent('cost_tracked', {
      costTrackingId,
      requestId,
      timestamp: new Date().toISOString(),
      provider,
      model: llmResponse.model || model,
    })

    await auditLogService.updateWithProviderResponse(requestId, providerRequestId, costTrackingId)

    if (slotAcquired && userKeyId && requestId) {
      releaseQueueSlotOrLog({
        requestId,
        userKeyId,
        queueManagerService,
        reason: 'response sent'
      })
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
    if (costReserved) {
      await releaseReservedSpendOrLog({
        requestId,
        userKeyId,
        amount: reservedAmount,
        spendReservationService,
        reason: 'route error'
      })
      costReserved = false
    }
    if (requestId && slotAcquired) {
      const resolvedKeyId = await resolveUserKeyId(userKeyId, req)
      if (resolvedKeyId) {
        releaseQueueSlotOrLog({
          requestId,
          userKeyId: resolvedKeyId,
          queueManagerService,
          reason: 'route error'
        })
        slotAcquired = false
      }
    }

    console.error('image generation error:', error)

    if (requestId && auditLogId) {
      try {
        await auditLogService.updateWithProviderResponse(requestId, '', 0)
      } catch {
      }
    }

    const mappedError = mapStandardLlmRouteError(error.message)
    if (mappedError) {
      res.status(mappedError.status).json({
        error: error.message,
        code: mappedError.code,
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

async function resolveUserKeyId(existingId: string | null, req: Request): Promise<string | null> {
  if (existingId) {
    return existingId
  }
  try {
    const headerKey = req.headers['x-api-key'] as string | undefined
    const fallbackUserId = headerKey ? extractUserIdFromApiKey(headerKey) : null
    if (!fallbackUserId) return null
    return await keyService.getUserKeyIdForUser(fallbackUserId)
  } catch (error) {
    console.warn('failed to resolve user key id for image cleanup:', (error as Error).message)
    return null
  }
}
