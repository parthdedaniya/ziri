import { RateLimiterSQLite } from 'rate-limiter-flexible'
import type Database from 'better-sqlite3'
import { getDatabase } from '../db/index.js'

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: Date
  retryAfterSeconds?: number
}

interface RateLimitConfig {
  requestsPerMinute: number | null
}

const WINDOW_SECONDS = 60

export class RateLimiterService {
  private db: Database.Database
  private limiters = new Map<string, RateLimiterSQLite>()

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private async getLimiter(keyType: string, limit: number): Promise<RateLimiterSQLite> {
    const cacheKey = `${keyType}:${limit}`

    if (!this.limiters.has(cacheKey)) {
      // make sure the table exists before we hand it off to the limiter
      try {
        const exists = this.db.prepare(
          `SELECT 1 FROM sqlite_master WHERE type='table' AND name='rate_limit_buckets'`
        ).get()
        if (!exists) {
          const { up } = await import('../db/migrations/004_rate_limiting.js')
          up(this.db)
        }
      } catch {
        const { up } = await import('../db/migrations/004_rate_limiting.js')
        up(this.db)
      }

      this.limiters.set(cacheKey, new RateLimiterSQLite({
        storeClient: this.db,
        storeType: 'better-sqlite3',
        keyPrefix: `rl_${keyType}`,
        points: limit,
        duration: WINDOW_SECONDS,
        tableName: 'rate_limit_buckets',
        tableCreated: true,
      }))
    }

    return this.limiters.get(cacheKey)!
  }

  async checkRateLimit(
    keyType: 'user' | 'api_key' | 'ip',
    keyId: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    if (!config.requestsPerMinute) {
      return { allowed: true, remaining: Infinity, limit: Infinity, resetAt: new Date(Date.now() + WINDOW_SECONDS * 1000) }
    }

    const limit = config.requestsPerMinute
    const limiter = await this.getLimiter(keyType, limit)

    try {
      const res = await limiter.consume(keyId)
      return {
        allowed: true,
        remaining: res.remainingPoints,
        limit,
        resetAt: new Date(Date.now() + (res.msBeforeNext || 0)),
      }
    } catch (rej: any) {
      const msLeft = rej.msBeforeNext || WINDOW_SECONDS * 1000
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetAt: new Date(Date.now() + msLeft),
        retryAfterSeconds: Math.ceil(msLeft / 1000),
      }
    }
  }

  async getRateLimitStatus(
    keyType: 'user' | 'api_key' | 'ip',
    keyId: string,
    limit: number | null
  ): Promise<{ current: number; limit: number | null; remaining: number | null }> {
    if (limit === null) return { current: 0, limit: null, remaining: null }

    const limiter = await this.getLimiter(keyType, limit)
    try {
      const res = await limiter.get(keyId)
      return { current: limit - (res?.remainingPoints || limit), limit, remaining: res?.remainingPoints || limit }
    } catch {
      return { current: limit, limit, remaining: 0 }
    }
  }

  cleanup(): number {
    return this.db.prepare(`DELETE FROM rate_limit_buckets WHERE expire IS NOT NULL AND expire < ?`).run(Date.now()).changes
  }

  clearKey(keyType: 'user' | 'api_key' | 'ip', keyId: string): number {
    return this.db.prepare(`DELETE FROM rate_limit_buckets WHERE key = ?`).run(`rl_${keyType}_${keyId}`).changes
  }

  async debugKey(keyType: 'user' | 'api_key' | 'ip', keyId: string, limit: number | null): Promise<any> {
    if (!limit) return { message: 'Unlimited — no rate limiting' }

    const limiter = await this.getLimiter(keyType, limit)
    const fullKey = `rl_${keyType}_${keyId}`

    try {
      const result = await limiter.get(keyId)
      const dbRows = this.db.prepare(`SELECT key, points, expire FROM rate_limit_buckets WHERE key = ?`).all(fullKey)
      return { limiterResult: result, dbRows, fullKey, limit }
    } catch (err: any) {
      return { error: err.message, fullKey, limit }
    }
  }
}

export const rateLimiterService = new RateLimiterService()
