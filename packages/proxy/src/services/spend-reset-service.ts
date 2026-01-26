 

import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'
import type { Entity } from '../types/entity.js'

interface CedarDecimalValue {
  __extn: {
    fn: 'decimal'
    arg: string
  }
}

type UserKeyEntity = Entity & {
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
}

interface SpendResetResult {
  dailyReset: boolean
  monthlyReset: boolean
  updatedEntity: UserKeyEntity | null
}

export class SpendResetService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

   
  async checkAndResetSpend(userKeyEntity: UserKeyEntity): Promise<SpendResetResult> {
    const now = new Date()
    const result: SpendResetResult = {
      dailyReset: false,
      monthlyReset: false,
      updatedEntity: null,
    }

 
    const lastDailyResetStr = userKeyEntity.attrs.last_daily_reset || new Date().toISOString()
    const lastMonthlyResetStr = userKeyEntity.attrs.last_monthly_reset || new Date().toISOString()
    const lastDailyReset = new Date(lastDailyResetStr)
    const lastMonthlyReset = new Date(lastMonthlyResetStr)

 
    const needsDailyReset = this.hasMidnightPassed(lastDailyReset, now)

 
    const needsMonthlyReset = this.hasMonthBoundaryPassed(lastMonthlyReset, now)

    if (needsDailyReset || needsMonthlyReset) {
      const updatedAttrs = { ...userKeyEntity.attrs }
      const currentTimestamp = now.toISOString()

      if (needsDailyReset) {
        updatedAttrs.current_daily_spend = this.createDecimalValue('0.0000')
        updatedAttrs.last_daily_reset = currentTimestamp
        result.dailyReset = true
      }

      if (needsMonthlyReset) {
        updatedAttrs.current_monthly_spend = this.createDecimalValue('0.0000')
        updatedAttrs.last_monthly_reset = currentTimestamp
        result.monthlyReset = true
      }

 
      const updatedEntity = {
        ...userKeyEntity,
        attrs: updatedAttrs,
      }

      await this.updateEntityInDatabase(updatedEntity)
      result.updatedEntity = updatedEntity
    }

    return result
  }

   
  private hasMidnightPassed(lastReset: Date, now: Date): boolean {
 
    const lastResetDate = new Date(Date.UTC(
      lastReset.getUTCFullYear(),
      lastReset.getUTCMonth(),
      lastReset.getUTCDate()
    ))
    
    const nowDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ))

 
    return nowDate.getTime() > lastResetDate.getTime()
  }

   
  private hasMonthBoundaryPassed(lastReset: Date, now: Date): boolean {
    const lastResetYear = lastReset.getUTCFullYear()
    const lastResetMonth = lastReset.getUTCMonth()
    
    const nowYear = now.getUTCFullYear()
    const nowMonth = now.getUTCMonth()

 
    if (nowYear > lastResetYear) {
      return true
    }
    if (nowYear === lastResetYear && nowMonth > lastResetMonth) {
      return true
    }
    return false
  }

   
  private createDecimalValue(value: string): CedarDecimalValue {
    return {
      __extn: {
        fn: 'decimal',
        arg: value,
      },
    }
  }

   
  private async updateEntityInDatabase(entity: UserKeyEntity): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE entities 
      SET ejson = ?, updated_at = datetime('now')
      WHERE etype = 'UserKey' AND eid = ?
    `)

    stmt.run(JSON.stringify(entity), entity.uid.id)
  }
}

 
export const spendResetService = new SpendResetService()
