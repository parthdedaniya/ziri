// Spend update service - updates UserKey entity spend values after successful requests

import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'

interface CedarDecimalValue {
  __extn: {
    fn: 'decimal'
    arg: string
  }
}

interface UserKeyEntity {
  uid: {
    type: 'UserKey'
    id: string
  }
  attrs: {
    current_daily_spend: CedarDecimalValue | string
    current_monthly_spend: CedarDecimalValue | string
    last_daily_reset: string
    last_monthly_reset: string
    status: string
    user: {
      __entity: {
        type: 'User'
        id: string
      }
    }
    [key: string]: any
  }
  parents: any[]
}

export class SpendUpdateService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  /**
   * Update the UserKey entity's spend values after a successful request.
   * Calculates spend from cost_tracking table with full precision, then rounds to 4 decimals for entity.
   * This ensures small costs accumulate properly without being lost to rounding.
   * 
   * @param userKeyId - The UserKey entity ID (e.g., "uk-c07c98871ecfe27f")
   * @param cost - The calculated cost in USD (full precision, already stored in cost_tracking)
   */
  async addSpend(userKeyId: string, cost: number): Promise<void> {
    // Get the execution keys (user_agent_keys.id) for this UserKey
    // First, get the user ID from the UserKey entity
    const entityStmt = this.db.prepare(`
      SELECT ejson FROM entities 
      WHERE etype = 'UserKey' AND eid = ?
    `)
    const entityRow = entityStmt.get(userKeyId) as { ejson: string } | undefined

    if (!entityRow) {
      throw new Error(`UserKey entity not found: ${userKeyId}`)
    }

    const entity: UserKeyEntity = JSON.parse(entityRow.ejson)
    const userId = entity.attrs.user?.__entity?.id

    if (!userId) {
      throw new Error(`UserKey entity missing user reference: ${userKeyId}`)
    }

    // Get all execution keys for this user
    const executionKeys = this.db.prepare(`
      SELECT id FROM user_agent_keys WHERE auth_id = ?
    `).all(userId) as { id: string }[]

    const executionKeyIds = executionKeys.map(k => k.id)

    if (executionKeyIds.length === 0) {
      console.warn(`[SPEND_UPDATE] No execution keys found for user ${userId}`)
      return
    }

    // Get last reset times from entity (used to calculate period spend)
    const parseDecimal = (value: CedarDecimalValue | string | undefined): number => {
      if (!value) return 0
      if (typeof value === 'string') return parseFloat(value) || 0
      if (value.__extn && value.__extn.arg) return parseFloat(value.__extn.arg) || 0
      return 0
    }

    const lastDailyResetStr = entity.attrs.last_daily_reset
    const lastMonthlyResetStr = entity.attrs.last_monthly_reset

    // Calculate daily spend: sum all costs since last daily reset (or today if no reset)
    const now = new Date()
    let dailyStartISO: string
    if (lastDailyResetStr) {
      const lastDailyReset = new Date(lastDailyResetStr)
      // Get UTC midnight of the reset day
      const resetDate = new Date(Date.UTC(
        lastDailyReset.getUTCFullYear(),
        lastDailyReset.getUTCMonth(),
        lastDailyReset.getUTCDate()
      ))
      dailyStartISO = resetDate.toISOString()
    } else {
      // No reset yet, use today's UTC midnight
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      dailyStartISO = todayStart.toISOString()
    }

    // Calculate monthly spend: sum all costs since last monthly reset (or month start if no reset)
    let monthlyStartISO: string
    if (lastMonthlyResetStr) {
      const lastMonthlyReset = new Date(lastMonthlyResetStr)
      // Get UTC first day of the reset month
      const resetMonth = new Date(Date.UTC(
        lastMonthlyReset.getUTCFullYear(),
        lastMonthlyReset.getUTCMonth(),
        1
      ))
      monthlyStartISO = resetMonth.toISOString()
    } else {
      // No reset yet, use current month start
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      monthlyStartISO = monthStart.toISOString()
    }

    // Build IN clause for execution keys
    const placeholders = executionKeyIds.map(() => '?').join(',')
    
    // Get daily spend total (full precision from database)
    const dailySpendResult = this.db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM cost_tracking
      WHERE execution_key IN (${placeholders})
        AND request_timestamp >= ?
        AND status = 'completed'
    `).get(...executionKeyIds, dailyStartISO) as { total: number }

    // Get monthly spend total (full precision from database)
    const monthlySpendResult = this.db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM cost_tracking
      WHERE execution_key IN (${placeholders})
        AND request_timestamp >= ?
        AND status = 'completed'
    `).get(...executionKeyIds, monthlyStartISO) as { total: number }

    const dailySpendFullPrecision = dailySpendResult.total || 0
    const monthlySpendFullPrecision = monthlySpendResult.total || 0

    console.log(`[SPEND_UPDATE] Calculated from cost_tracking - userKeyId: ${userKeyId}`)
    console.log(`[SPEND_UPDATE]   Daily period: ${dailyStartISO} to now, total (full precision): ${dailySpendFullPrecision}`)
    console.log(`[SPEND_UPDATE]   Monthly period: ${monthlyStartISO} to now, total (full precision): ${monthlySpendFullPrecision}`)
    console.log(`[SPEND_UPDATE]   Adding cost: ${cost} (already stored in cost_tracking)`)

    // Round to 4 decimal places only when updating entity
    const dailySpendRounded = parseFloat(dailySpendFullPrecision.toFixed(4))
    const monthlySpendRounded = parseFloat(monthlySpendFullPrecision.toFixed(4))

    console.log(`[SPEND_UPDATE] Rounded for entity - dailySpend: ${dailySpendRounded}, monthlySpend: ${monthlySpendRounded}`)

    // Update entity with rounded values
    entity.attrs.current_daily_spend = this.createDecimalValue(dailySpendRounded.toFixed(4))
    entity.attrs.current_monthly_spend = this.createDecimalValue(monthlySpendRounded.toFixed(4))

    // Save back to database
    const updateStmt = this.db.prepare(`
      UPDATE entities 
      SET ejson = ?, updated_at = datetime('now')
      WHERE etype = 'UserKey' AND eid = ?
    `)

    const result = updateStmt.run(JSON.stringify(entity), userKeyId)
    
    // Verify the update
    const verifyStmt = this.db.prepare(`
      SELECT ejson FROM entities 
      WHERE etype = 'UserKey' AND eid = ?
    `)
    const verifyRow = verifyStmt.get(userKeyId) as { ejson: string } | undefined
    if (verifyRow) {
      const verifyEntity: UserKeyEntity = JSON.parse(verifyRow.ejson)
      const verifyDailySpend = parseDecimal(verifyEntity.attrs.current_daily_spend)
      const verifyMonthlySpend = parseDecimal(verifyEntity.attrs.current_monthly_spend)
      console.log(`[SPEND_UPDATE] Verified after update - dailySpend: ${verifyDailySpend}, monthlySpend: ${verifyMonthlySpend}, changes: ${result.changes}`)
    }
  }

  private createDecimalValue(value: string): CedarDecimalValue {
    return {
      __extn: {
        fn: 'decimal',
        arg: value,
      },
    }
  }
}

// Export singleton instance
export const spendUpdateService = new SpendUpdateService()
