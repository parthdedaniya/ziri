import type { Request } from 'express'
import { toIp } from '../../utils/cedar.js'

type SpendReservationLike = {
  releaseReservedSpend: (userKeyId: string, amount: number) => Promise<void>
}

type QueueManagerLike = {
  releaseSlot: (userKeyId: string, requestId: string) => void
}

export function buildAuthorizationContext(
  req: Request,
  params: {
    model: string
    provider: string
    isEmergency: boolean
  }
) {
  const now = new Date()
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()]
  const hour = now.getUTCHours()
  const ipAddress = req.ip || '127.0.0.1'
  const context = {
    day_of_week: dayOfWeek,
    hour,
    ip_address: toIp(ipAddress),
    is_emergency: params.isEmergency,
    model_name: params.model,
    model_provider: params.provider,
    request_time: now.toISOString()
  }
  return { now, ipAddress, context }
}

export async function releaseAfterProviderFailure(params: {
  costReserved: boolean
  userKeyId: string | null
  reservedAmount: number
  slotAcquired: boolean
  requestId: string | null
  spendReservationService: SpendReservationLike
  queueManagerService: QueueManagerLike
}): Promise<{ costReserved: boolean; slotAcquired: boolean }> {
  let costReserved = params.costReserved
  let slotAcquired = params.slotAcquired

  if (costReserved && params.userKeyId) {
    const released = await releaseReservedSpendOrLog({
      userKeyId: params.userKeyId,
      requestId: params.requestId,
      amount: params.reservedAmount,
      spendReservationService: params.spendReservationService,
      reason: 'provider failure'
    })
    costReserved = !released
  }

  if (slotAcquired && params.userKeyId && params.requestId) {
    const released = releaseQueueSlotOrLog({
      userKeyId: params.userKeyId,
      requestId: params.requestId,
      queueManagerService: params.queueManagerService,
      reason: 'provider failure'
    })
    slotAcquired = !released
  }

  return { costReserved, slotAcquired }
}

export async function releaseReservedSpendOrLog(params: {
  requestId: string | null
  userKeyId: string | null
  amount: number
  spendReservationService: SpendReservationLike
  reason: string
}): Promise<boolean> {
  if (!params.requestId || !params.userKeyId) return false
  try {
    await params.spendReservationService.releaseReservedSpend(params.userKeyId, params.amount)
    return true
  } catch (error) {
    console.warn(`failed to release spend for ${params.userKeyId} (${params.reason}) [${params.requestId}]:`, (error as Error).message)
    return false
  }
}

export function releaseQueueSlotOrLog(params: {
  requestId: string | null
  userKeyId: string | null
  queueManagerService: QueueManagerLike
  reason: string
}): boolean {
  if (!params.requestId || !params.userKeyId) return false
  try {
    params.queueManagerService.releaseSlot(params.userKeyId, params.requestId)
    return true
  } catch (error) {
    console.warn(`failed to release queue slot for ${params.userKeyId} (${params.reason}) [${params.requestId}]:`, (error as Error).message)
    return false
  }
}
