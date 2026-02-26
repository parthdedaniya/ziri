import { Router, type Request, type Response } from 'express'
import { serviceFactory } from '../services/service-factory.js'
import * as llmService from '../services/llm-service.js'
import { auditLogService } from '../services/audit-log-service.js'
import { costTrackingService } from '../services/cost-tracking-service.js'
import { costEstimatorService } from '../services/cost-estimator-service.js'
import { spendResetService } from '../services/spend-reset-service.js'
import { spendReservationService } from '../services/spend-reservation-service.js'
import { queueManagerService } from '../services/queue-manager-service.js'
import { eventEmitterService } from '../services/event-emitter-service.js'
import { enforceUserRateLimit, runLlmPreflight } from './shared/llm-preflight.js'
import {
  buildAuthorizationContext,
  releaseQueueSlotOrLog,
  releaseReservedSpendOrLog
} from './shared/llm-route-helpers.js'
import { mapChatRouteError } from './shared/llm-error-mapping.js'

const router: Router = Router()

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  'openai', 'google', 'xai', 'mistral', 'moonshot', 'deepseek', 'dashscope', 'openrouter', 'vertex_ai'
])

router.post('/completions', async (req: Request, res: Response) => {
  const requestStartTime = Date.now()
  let requestId: string | null = null
  let auditLogId: number | null = null
  const resourceTracker = new RequestResourceTracker(queueManagerService, spendReservationService)

  try {
    const preflight = await runLlmPreflight(req, res)
    if (!preflight) return
    requestId = preflight.requestId

    const { userId, apiKeyId, allEntities, userKeyEntity, userKeyId } = preflight
    const { provider, model, messages, ...otherParams } = req.body

    if (!provider || !model || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'provider, model, and messages are required',
        code: 'MISSING_FIELDS',
        requestId
      })
      return
    }

    const userEntity = await enforceUserRateLimit(res, { userId, apiKeyId, allEntities, requestId })
    if (!userEntity) return

    const costEstimate = await estimateChatCost(provider, model, messages, req.body?.max_tokens)

    await acquireQueueSlot({
      userKeyId,
      requestId,
      userId,
      apiKeyId,
      provider,
      model,
      requestBody: req.body,
      estimatedCost: costEstimate.estimatedCost
    })
    resourceTracker.holdQueue(userKeyId, requestId)

    const activeEntity = await refreshUserKeyEntity(userKeyEntity)
    await spendReservationService.reserveEstimatedSpend(
      activeEntity as any,
      userKeyId,
      costEstimate.estimatedCost
    )
    resourceTracker.holdSpend(userKeyId, requestId, costEstimate.estimatedCost)

    const principal = `UserKey::"${userKeyId}"`
    const action = 'Action::"completion"'
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
      action: 'completion',
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
      await resourceTracker.releaseQueue('authorization denied')
      await resourceTracker.releaseSpend('authorization denied')
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
      llmResponse = await llmService.chatCompletions({
        provider,
        model,
        messages,
        ...otherParams
      })
    } catch (llmError: any) {
      await resourceTracker.releaseAll('provider failure')
      throw llmError
    }
    const llmResponseTime = Date.now()

    const usage = extractUsage(llmResponse, provider)

    const costTrackingId = await costTrackingService.trackCost({
      requestId,
      executionKey: apiKeyId,
      auditLogId,
      provider,
      providerRequestId: llmResponse.id,
      modelRequested: model,
      modelUsed: llmResponse.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      cachedTokens: usage.cachedTokens,
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
      model: llmResponse.model || model
    })

    await auditLogService.updateWithProviderResponse(requestId, llmResponse.id, costTrackingId)

    const { pricingService } = await import('../services/pricing-service.js')
    const costCalc = await pricingService.calculateCost(
      provider,
      llmResponse.model || model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cachedTokens
    )

    await resourceTracker.releaseQueue('response sent')

    res.json({
      ...llmResponse,
      _meta: {
        requestId,
        cost: {
          estimated: costEstimate?.estimatedCost || 0,
          actual: costCalc.totalCost,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cachedTokens: usage.cachedTokens,
          totalCost: costCalc.totalCost,
          estimation: costEstimate ? {
            estimatedInputTokens: costEstimate.estimatedInputTokens,
            estimatedOutputTokens: costEstimate.estimatedOutputTokens,
            confidence: costEstimate.confidence,
          } : undefined,
        },
        timing: {
          totalMs: Date.now() - requestStartTime,
          authMs: authDurationMs,
          llmMs: llmResponseTime - llmRequestStartTime,
        },
      },
    })
  } catch (error: any) {
    await resourceTracker.releaseAll('route error')

    if ((error as any)?.status) {
      res.status(error.status).json({
        error: error.message,
        code: error.code || 'REQUEST_FAILED',
        requestId: requestId || undefined
      })
      return
    }

    console.error('completion error:', error)

    if (requestId && auditLogId) {
      try {
        await auditLogService.updateWithProviderResponse(requestId, '', 0)
      } catch (updateError) {
        console.warn('failed to update audit log:', (updateError as Error).message)
      }
    }

    const mappedError = mapChatRouteError(error.message)
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

function extractUsage(response: any, provider: string): {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
} {
  if (provider === 'anthropic') {
    return {
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      cachedTokens: response.usage?.cache_read_input_tokens || 0,
    }
  }
  if (provider === 'vertex_ai' || provider === 'google') {
    const usage = response.usageMetadata || response.usage
    const input = usage?.promptTokenCount ?? usage?.inputTokenCount ?? usage?.prompt_tokens ?? 0
    const output = usage?.candidatesTokenCount ?? usage?.outputTokenCount ?? usage?.completion_tokens ?? 0
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: (usage?.totalTokenCount ?? 0) || usage?.total_tokens || input + output,
      cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    }
  }
  if (OPENAI_COMPATIBLE_PROVIDERS.has(provider)) {
    return {
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      totalTokens: response.usage?.total_tokens || 0,
      cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens || 0,
    }
  }
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, cachedTokens: 0 }
}

async function estimateChatCost(provider: string, model: string, messages: any[], maxTokens?: number) {
  try {
    return await costEstimatorService.estimateCost(provider, model, messages, maxTokens)
  } catch {
    return {
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCost: 0,
      confidence: 'low' as const
    }
  }
}

async function acquireQueueSlot(params: {
  userKeyId: string
  requestId: string
  userId: string
  apiKeyId: string
  provider: string
  model: string
  requestBody: Request['body']
  estimatedCost: number
}): Promise<void> {
  try {
    await queueManagerService.acquireSlot(
      params.userKeyId,
      params.requestId,
      {
        requestId: params.requestId,
        userKeyId: params.userKeyId,
        authId: params.userId,
        apiKeyId: params.apiKeyId,
        provider: params.provider,
        model: params.model,
        requestBody: params.requestBody,
        estimatedCost: params.estimatedCost,
      }
    )
  } catch (error: any) {
    if (error.message.includes('Queue full')) {
      throw Object.assign(new Error('Server busy - queue full'), {
        status: 503,
        code: 'QUEUE_FULL'
      })
    }
    throw error
  }
}

async function refreshUserKeyEntity(userKeyEntity: any) {
  const spendResetResult = await spendResetService.checkAndResetSpend(userKeyEntity as any)
  return spendResetResult.updatedEntity || userKeyEntity
}

class RequestResourceTracker {
  private queueHold: { userKeyId: string; requestId: string } | null = null
  private spendHold: { userKeyId: string; requestId: string; amount: number } | null = null

  constructor(
    private readonly queueManager: typeof queueManagerService,
    private readonly spendReservation: typeof spendReservationService
  ) {}

  holdQueue(userKeyId: string, requestId: string): void {
    if (!userKeyId || !requestId) return
    this.queueHold = { userKeyId, requestId }
  }

  holdSpend(userKeyId: string, requestId: string, amount: number): void {
    if (!userKeyId || !requestId || amount <= 0) return
    this.spendHold = { userKeyId, requestId, amount }
  }

  async releaseQueue(reason: string): Promise<void> {
    if (!this.queueHold) return
    releaseQueueSlotOrLog({
      requestId: this.queueHold.requestId,
      userKeyId: this.queueHold.userKeyId,
      queueManagerService: this.queueManager,
      reason
    })
    this.queueHold = null
  }

  async releaseSpend(reason: string): Promise<void> {
    if (!this.spendHold) return
    await releaseReservedSpendOrLog({
      requestId: this.spendHold.requestId,
      userKeyId: this.spendHold.userKeyId,
      amount: this.spendHold.amount,
      spendReservationService: this.spendReservation,
      reason
    })
    this.spendHold = null
  }

  async releaseAll(reason: string): Promise<void> {
    await this.releaseSpend(reason)
    await this.releaseQueue(reason)
  }
}
