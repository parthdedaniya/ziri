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

export class RateLimiterService {
  private db: Database.Database
  private limiters: Map<string, RateLimiterSQLite> = new Map()
  private readonly WINDOW_SIZE_SECONDS = 60

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  private async getLimiter(keyType: 'user' | 'api_key' | 'ip', keyId: string, limit: number): Promise<RateLimiterSQLite> {
    const cacheKey = `${keyType}:${limit}`
    const keyPrefix = `rl_${keyType}`
    
    if (!this.limiters.has(cacheKey)) {
      try {
        const tableExists = this.db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='rate_limit_buckets'
        `).get()
        
        if (!tableExists) {
          console.warn(`[RATE_LIMITER] Table rate_limit_buckets does not exist, creating it...`)
          const { up: migrationUp } = await import('../db/migrations/004_rate_limiting.js')
          migrationUp(this.db)
          console.log(`[RATE_LIMITER] ✅ Created rate_limit_buckets table`)
        }
      } catch (error: any) {
        console.error(`[RATE_LIMITER] Error ensuring table exists:`, error.message)
        try {
          const { up: migrationUp } = await import('../db/migrations/004_rate_limiting.js')
          migrationUp(this.db)
          console.log(`[RATE_LIMITER] ✅ Created rate_limit_buckets table (fallback)`)
        } catch (migrationError: any) {
          console.error(`[RATE_LIMITER] Failed to create table via migration:`, migrationError.message)
          throw new Error(`Failed to create rate_limit_buckets table: ${migrationError.message}`)
        }
      }
      
      const limiter = new RateLimiterSQLite({
        storeClient: this.db,
        storeType: 'better-sqlite3',
        keyPrefix: keyPrefix,
        points: limit,
        duration: this.WINDOW_SIZE_SECONDS,
        tableName: 'rate_limit_buckets',
        tableCreated: true,
      })
      
      this.limiters.set(cacheKey, limiter)
    }
    
    return this.limiters.get(cacheKey)!
  }

  async checkRateLimit(
    keyType: 'user' | 'api_key' | 'ip',
    keyId: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    console.log(`[RATE_LIMITER] checkRateLimit START: keyType=${keyType}, keyId=${keyId}, config.requestsPerMinute=${config.requestsPerMinute}`)
    
    if (config.requestsPerMinute === null || config.requestsPerMinute === undefined || config.requestsPerMinute === 0) {
      console.log(`[RATE_LIMITER] Unlimited requests allowed (limit is ${config.requestsPerMinute})`)
      return {
        allowed: true,
        remaining: Infinity,
        limit: Infinity,
        resetAt: new Date(Date.now() + this.WINDOW_SIZE_SECONDS * 1000),
      }
    }

    const limit = config.requestsPerMinute
    const keyPrefix = `rl_${keyType}`
    const expectedStoredKey = `${keyPrefix}_${keyId}`
    
    console.log(`[RATE_LIMITER] Rate limiting enabled: limit=${limit}, keyPrefix=${keyPrefix}, expectedStoredKey=${expectedStoredKey}`)
    
      try {
        const expectedKey = `${keyPrefix}_${keyId}`
        const dbEntryBefore = this.db.prepare(`
          SELECT key, points, expire 
          FROM rate_limit_buckets 
          WHERE key = ?
        `).get(expectedKey)
        
        console.log(`[RATE_LIMITER] Database entry BEFORE consume (key=${expectedKey}):`, JSON.stringify(dbEntryBefore, null, 2))
        
        const allEntriesWithPrefix = this.db.prepare(`
          SELECT key, points, expire 
          FROM rate_limit_buckets 
          WHERE key LIKE ? || '%'
          ORDER BY key
          LIMIT 20
        `).all(keyPrefix)
        
        console.log(`[RATE_LIMITER] All database entries with prefix ${keyPrefix}%:`, JSON.stringify(allEntriesWithPrefix, null, 2))
      } catch (dbError: any) {
        console.error(`[RATE_LIMITER] Error checking database before consume:`, dbError.message)
      }
    
    const limiter = await this.getLimiter(keyType, keyId, limit)
    
    try {
      const currentState = await limiter.get(keyId)
      console.log(`[RATE_LIMITER] Current state from limiter.get(${keyId}):`, JSON.stringify(currentState, null, 2))
    } catch (getError: any) {
      console.log(`[RATE_LIMITER] limiter.get(${keyId}) returned error (expected if no previous requests):`, getError.message)
    }

    try {
      console.log(`[RATE_LIMITER] Calling limiter.consume(${keyId})...`)
      const result = await limiter.consume(keyId)
      
      console.log(`[RATE_LIMITER] consume() SUCCESS:`, {
        remainingPoints: result.remainingPoints,
        msBeforeNext: result.msBeforeNext,
        result: JSON.stringify(result),
      })
      
      try {
        const expectedKey = `${keyPrefix}_${keyId}`
        const dbEntryAfter = this.db.prepare(`
          SELECT key, points, expire 
          FROM rate_limit_buckets 
          WHERE key = ?
        `).get(expectedKey)
        
        console.log(`[RATE_LIMITER] Database entry AFTER consume (key=${expectedKey}):`, JSON.stringify(dbEntryAfter, null, 2))
      } catch (dbError: any) {
        console.error(`[RATE_LIMITER] Error checking database after consume:`, dbError.message)
      }
      
      const resetAt = new Date(Date.now() + (result.msBeforeNext || 0))
      
      return {
        allowed: true,
        remaining: result.remainingPoints,
        limit,
        resetAt,
      }
    } catch (rejRes: any) {
      console.error(`[RATE_LIMITER] consume() FAILED (rate limit exceeded):`, {
        message: rejRes.message,
        msBeforeNext: rejRes.msBeforeNext,
        remainingPoints: rejRes.remainingPoints,
        error: JSON.stringify(rejRes),
      })
      
      try {
        const expectedKey = `${keyPrefix}_${keyId}`
        const dbEntryAfter = this.db.prepare(`
          SELECT key, points, expire 
          FROM rate_limit_buckets 
          WHERE key = ?
        `).get(expectedKey)
        
        console.error(`[RATE_LIMITER] Database entry AFTER failed consume (key=${expectedKey}):`, JSON.stringify(dbEntryAfter, null, 2))
      } catch (dbError: any) {
        console.error(`[RATE_LIMITER] Error checking database after failed consume:`, dbError.message)
      }
      
      const resetAt = new Date(Date.now() + (rejRes.msBeforeNext || this.WINDOW_SIZE_SECONDS * 1000))
      const retryAfterSeconds = Math.ceil((rejRes.msBeforeNext || this.WINDOW_SIZE_SECONDS * 1000) / 1000)
      
      console.error(`[RATE_LIMITER] Rate limit exceeded for ${keyType}:${keyId}. Limit: ${limit}, Remaining: 0, Retry after: ${retryAfterSeconds}s`)
      
      return {
        allowed: false,
        remaining: 0,
        limit,
        resetAt,
        retryAfterSeconds,
      }
    }
  }

  async getRateLimitStatus(
    keyType: 'user' | 'api_key' | 'ip',
    keyId: string,
    limit: number | null
  ): Promise<{ current: number; limit: number | null; remaining: number | null }> {
    if (limit === null) {
      return { current: 0, limit: null, remaining: null }
    }

    const limiter = await this.getLimiter(keyType, keyId, limit)
    
    try {
      const result = await limiter.get(keyId)
      return {
        current: limit - (result?.remainingPoints || limit),
        limit,
        remaining: result?.remainingPoints || limit,
      }
    } catch {
      return {
        current: limit,
        limit,
        remaining: 0,
      }
    }
  }

  cleanup(): number {
    const cutoff = Date.now()
    
    const stmt = this.db.prepare(`
      DELETE FROM rate_limit_buckets WHERE expire IS NOT NULL AND expire < ?
    `)
    
    const result = stmt.run(cutoff)
    return result.changes
  }

  clearKey(keyType: 'user' | 'api_key' | 'ip', keyId: string): number {
    const expectedKey = `rl_${keyType}_${keyId}`
    
    const stmt = this.db.prepare(`
      DELETE FROM rate_limit_buckets 
      WHERE key = ?
    `)
    
    const result = stmt.run(expectedKey)
    return result.changes
  }

  async debugKey(keyType: 'user' | 'api_key' | 'ip', keyId: string, limit: number | null): Promise<any> {
    if (limit === null || limit === 0) {
      return { message: 'Unlimited - no rate limiting applied' }
    }

    const limiter = await this.getLimiter(keyType, keyId, limit)
    const keyPrefix = `rl_${keyType}`
    const fullKey = `${keyPrefix}_${keyId}`
    
    try {
      const result = await limiter.get(keyId)
      
      const expectedKey = `${keyPrefix}_${keyId}`
      const dbCheck = this.db.prepare(`
        SELECT key, points, expire 
        FROM rate_limit_buckets 
        WHERE key = ?
      `).all(expectedKey)
      
      return {
        limiterResult: result,
        databaseEntries: dbCheck,
        keyPrefix,
        fullKey,
        limit,
      }
    } catch (error: any) {
      return {
        error: error.message,
        keyPrefix,
        fullKey,
        limit,
      }
    }
  }
}

export const rateLimiterService = new RateLimiterService()
