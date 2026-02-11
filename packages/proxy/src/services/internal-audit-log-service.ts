import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'
import { eventEmitterService } from './event-emitter-service.js'

export interface InternalAuditLogEntry {
  dashboardUserId: string
  dashboardUserName?: string | null
  dashboardUserRole?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  decision?: 'permit' | 'forbid'
  decisionReason?: string | null
  authDurationMs?: number | null
  actionDurationMs?: number | null
  outcomeStatus?: 'success' | 'failed'
  requestTimestamp?: string
}

export interface InternalAuditLogQueryParams {
  search?: string
  userId?: string
  action?: string
  resourceType?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
}

export class InternalAuditLogService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  logInternalAction(entry: InternalAuditLogEntry): void {
    try {
      const requestTimestamp = entry.requestTimestamp ?? new Date().toISOString()
      const decision = entry.decision ?? 'permit'
      const outcomeStatus = entry.outcomeStatus ?? 'success'

      const stmt = this.db.prepare(`
        INSERT INTO internal_audit_logs (
          dashboard_user_id,
          dashboard_user_name,
          dashboard_user_role,
          action,
          resource_type,
          resource_id,
          decision,
          decision_reason,
          auth_duration_ms,
          request_timestamp,
          action_duration_ms,
          outcome_status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)

      const result = stmt.run(
        entry.dashboardUserId ?? 'unknown',
        entry.dashboardUserName ?? null,
        entry.dashboardUserRole ?? null,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        decision,
        entry.decisionReason ?? null,
        entry.authDurationMs ?? null,
        requestTimestamp,
        entry.actionDurationMs ?? null,
        outcomeStatus
      )

      const id = result.lastInsertRowid as number

      eventEmitterService.emitEvent('internal_audit_log_created', {
        internalAuditLogId: id,
        dashboardUserId: entry.dashboardUserId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcomeStatus,
        decision
      })
    } catch (error: any) {
      console.error('[INTERNAL AUDIT] Failed to log action:', error?.message || error)
    }
  }

  query(params: InternalAuditLogQueryParams): { data: any[]; total: number } {
    let whereClause = "WHERE internal_audit_logs.outcome_status = 'success'"
    const args: any[] = []

    if (params.userId) {
      whereClause += ' AND internal_audit_logs.dashboard_user_id = ?'
      args.push(params.userId)
    }

    if (params.action) {
      whereClause += ' AND internal_audit_logs.action = ?'
      args.push(params.action)
    }

    if (params.resourceType) {
      whereClause += ' AND internal_audit_logs.resource_type = ?'
      args.push(params.resourceType)
    }

    if (params.from) {
      whereClause += ' AND internal_audit_logs.request_timestamp >= ?'
      args.push(params.from)
    }

    if (params.to) {
      whereClause += ' AND internal_audit_logs.request_timestamp <= ?'
      args.push(params.to)
    }

    if (params.search) {
      const searchPattern = `%${params.search}%`
      whereClause +=
        ' AND (internal_audit_logs.dashboard_user_id LIKE ? OR internal_audit_logs.dashboard_user_name LIKE ? OR internal_audit_logs.action LIKE ? OR internal_audit_logs.resource_type LIKE ? OR internal_audit_logs.resource_id LIKE ?)'
      args.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern)
    }

    const countSql = `SELECT COUNT(*) as total FROM internal_audit_logs ${whereClause}`
    const countResult = this.db.prepare(countSql).get(...args) as { total: number }
    const total = countResult.total

    let orderByClause = 'ORDER BY internal_audit_logs.request_timestamp DESC'
    if (params.sortBy && params.sortOrder) {
      const columnMap: Record<string, string> = {
        request_timestamp: 'internal_audit_logs.request_timestamp',
        dashboard_user_id: 'internal_audit_logs.dashboard_user_id',
        action: 'internal_audit_logs.action',
        resource_type: 'internal_audit_logs.resource_type',
        resource_id: 'internal_audit_logs.resource_id',
        auth_duration_ms: 'internal_audit_logs.auth_duration_ms',
        action_duration_ms: 'internal_audit_logs.action_duration_ms'
      }
      const dbColumn = columnMap[params.sortBy]
      if (dbColumn) {
        const order = params.sortOrder.toUpperCase()
        orderByClause = `ORDER BY ${dbColumn} ${order}`
      }
    }

    const limit = params.limit || 50
    const offset = params.offset || 0

    const dataSql = `
      SELECT internal_audit_logs.*
      FROM internal_audit_logs
      ${whereClause}
      ${orderByClause}
      LIMIT ? OFFSET ?
    `

    const data = this.db.prepare(dataSql).all(...args, limit, offset) as any[]

    return { data, total }
  }
}

export const internalAuditLogService = new InternalAuditLogService()
