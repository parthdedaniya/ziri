import { randomBytes, createHash } from 'crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'

interface AuditLogEntry {
  requestId: string
  principal: string
  principalType: string
  authId?: string
  apiKeyId?: string
  action: string
  resource: string
  provider?: string
  model?: string
  decision: 'permit' | 'forbid'
  decisionReason?: string
  policiesEvaluated?: string[]
  determiningPolicies?: string[]
  requestIp?: string
  userAgent?: string
  requestMethod?: string
  requestPath?: string
  requestBodyHash?: string
  cedarContext?: object
  entitySnapshot?: object
  requestTimestamp: string
  authStartTime?: string
  authEndTime?: string
  authDurationMs?: number
}

export class AuditLogService {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`
  }

  hashRequestBody(body: any): string {
    return createHash('sha256').update(typeof body === 'string' ? body : JSON.stringify(body)).digest('hex')
  }

  async log(entry: AuditLogEntry): Promise<number> {
    let authName: string | null = null
    if (entry.authId) {
      try {
        authName = (this.db.prepare('SELECT name FROM auth WHERE id = ?').get(entry.authId) as any)?.name ?? null
      } catch {}
    }

    const r = this.db.prepare(`
      INSERT INTO audit_logs (
        request_id, principal, principal_type, auth_id, auth_name, api_key_id,
        action, resource, provider, model,
        decision, decision_reason, policies_evaluated, determining_policies,
        request_ip, user_agent, request_method, request_path, request_body_hash,
        cedar_context, entity_snapshot,
        request_timestamp, auth_start_time, auth_end_time, auth_duration_ms
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      entry.requestId, entry.principal, entry.principalType,
      entry.authId || null, authName, entry.apiKeyId || null,
      entry.action, entry.resource, entry.provider || null, entry.model || null,
      entry.decision, entry.decisionReason || null,
      entry.policiesEvaluated ? JSON.stringify(entry.policiesEvaluated) : null,
      entry.determiningPolicies ? JSON.stringify(entry.determiningPolicies) : null,
      entry.requestIp || null, entry.userAgent || null,
      entry.requestMethod || null, entry.requestPath || null, entry.requestBodyHash || null,
      entry.cedarContext ? JSON.stringify(entry.cedarContext) : null,
      entry.entitySnapshot ? JSON.stringify(entry.entitySnapshot) : null,
      entry.requestTimestamp,
      entry.authStartTime || null, entry.authEndTime || null, entry.authDurationMs || null
    )
    return r.lastInsertRowid as number
  }

  async updateWithProviderResponse(requestId: string, providerRequestId: string, costTrackingId: number) {
    this.db.prepare(`UPDATE audit_logs SET provider_request_id = ?, cost_tracking_id = ? WHERE request_id = ?`)
      .run(providerRequestId, costTrackingId, requestId)
  }

  async query(params: {
    authId?: string; apiKeyId?: string; provider?: string; model?: string
    decision?: 'permit' | 'forbid'; startDate?: string; endDate?: string
    search?: string; limit?: number; offset?: number
    sortBy?: string | null; sortOrder?: 'asc' | 'desc' | null
  }): Promise<{ data: any[]; total: number }> {
    const filters: string[] = []
    const args: any[] = []

    if (params.authId)    { filters.push('audit_logs.auth_id = ?');           args.push(params.authId) }
    if (params.apiKeyId)  { filters.push('audit_logs.api_key_id = ?');        args.push(params.apiKeyId) }
    if (params.provider)  { filters.push('audit_logs.provider = ?');          args.push(params.provider) }
    if (params.model)     { filters.push('audit_logs.model = ?');             args.push(params.model) }
    if (params.decision)  { filters.push('audit_logs.decision = ?');          args.push(params.decision) }
    if (params.startDate) { filters.push('audit_logs.request_timestamp >= ?');args.push(params.startDate) }
    if (params.endDate)   { filters.push('audit_logs.request_timestamp <= ?');args.push(params.endDate) }
    if (params.search) {
      const p = `%${params.search}%`
      filters.push('(audit_logs.auth_id LIKE ? OR audit_logs.model LIKE ? OR audit_logs.request_id LIKE ?)')
      args.push(p, p, p)
    }

    const where = filters.length ? filters.join(' AND ') : '1=1'
    const total = (this.db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE ${where}`).get(...args) as any).n

    const SORT_COLS: Record<string, string> = {
      request_timestamp: 'audit_logs.request_timestamp',
      auth_id: 'audit_logs.auth_id', provider: 'audit_logs.provider',
      model: 'audit_logs.model', decision: 'audit_logs.decision',
      auth_duration_ms: 'audit_logs.auth_duration_ms', request_id: 'audit_logs.request_id',
      spend: 'COALESCE(cost_tracking.total_cost, 0)'
    }
    let orderBy = 'ORDER BY request_timestamp DESC'
    if (params.sortBy && params.sortOrder) {
      const col = SORT_COLS[params.sortBy]
      if (col) orderBy = `ORDER BY ${col} ${params.sortOrder.toUpperCase()}`
    }

    const data = this.db.prepare(
      `SELECT audit_logs.*, COALESCE(cost_tracking.total_cost, 0) AS spend
       FROM audit_logs LEFT JOIN cost_tracking ON audit_logs.cost_tracking_id = cost_tracking.id
       WHERE ${where} ${orderBy} LIMIT ? OFFSET ?`
    ).all(...args, params.limit || 100, params.offset || 0)

    return { data, total }
  }

  async getStatistics(startDate?: string, endDate?: string) {
    const filters: string[] = []
    const args: any[] = []
    if (startDate) { filters.push('request_timestamp >= ?'); args.push(startDate) }
    if (endDate)   { filters.push('request_timestamp <= ?'); args.push(endDate) }
    const where = filters.length ? filters.join(' AND ') : '1=1'

    return this.db.prepare(`
      SELECT COUNT(*) as total_requests,
        SUM(CASE WHEN decision = 'permit' THEN 1 ELSE 0 END) as permit_count,
        SUM(CASE WHEN decision = 'forbid' THEN 1 ELSE 0 END) as forbid_count,
        AVG(auth_duration_ms) as avg_auth_duration_ms,
        provider, model
      FROM audit_logs WHERE ${where} GROUP BY provider, model
    `).all(...args)
  }
}

export const auditLogService = new AuditLogService()
