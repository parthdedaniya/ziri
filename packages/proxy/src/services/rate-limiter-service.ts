// Rate limiter service using rate-limiter-flexible with SQLite adapter

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
  requestsPerMinute: number | null // null = unlimited
}

export class RateLimiterService {
  private db: Database.Database
  private limiters: Map<string, RateLimiterSQLite> = new Map()
  private readonly WINDOW_SIZE_SECONDS = 60 // 1 minute window

  constructor(db?: Database.Database) {
    this.db = db || getDatabase()
  }

  /**
   * Get or create rate limiter for a key
   * Creates limiters per limit value (not per keyId) to allow sharing limiters across keys with same limits
   */
  private async getLimiter(keyType: 'user' | 'api_key' | 'ip', keyId: string, limit: number): Promise<RateLimiterSQLite> {
    // Cache key is based on keyType and limit only (not keyId)
    // This allows one limiter instance to handle multiple keys with the same limit
    const cacheKey = `${keyType}:${limit}`
    const keyPrefix = `rl_${keyType}`
    
    if (!this.limiters.has(cacheKey)) {
      console.log(`[RATE_LIMITER] Creating new limiter: cacheKey=${cacheKey}, keyPrefix=${keyPrefix}, limit=${limit}, duration=${this.WINDOW_SIZE_SECONDS}s`)
      
      // Ensure table exists before creating limiter
      // Check if table exists, if not create it
      try {
        const tableExists = this.db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='rate_limit_buckets'
        `).get()
        
        if (!tableExists) {
          console.warn(`[RATE_LIMITER] Table rate_limit_buckets does not exist, creating it...`)
          // Import and run migration directly
          const { up: migrationUp } = await import('../db/migrations/004_rate_limiting.js')
          migrationUp(this.db)
          console.log(`[RATE_LIMITER] ✅ Created rate_limit_buckets table`)
        }
      } catch (error: any) {
        console.error(`[RATE_LIMITER] Error ensuring table exists:`, error.message)
        // Try to create table anyway
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
        keyPrefix: keyPrefix, // Common prefix for all keys of this type
        points: limit, // Number of requests
        duration: this.WINDOW_SIZE_SECONDS, // Per duration (seconds)
        tableName: 'rate_limit_buckets',
        tableCreated: true, // We create the table in migration
      })
      
      this.limiters.set(cacheKey, limiter)
      console.log(`[RATE_LIMITER] Limiter created and cached: ${cacheKey}`)
    }
    
    return this.limiters.get(cacheKey)!
  }

  /**
   * Check if request is allowed under rate limits
   * @param keyType - Type of rate limit key ('user', 'api_key', 'ip')
   * @param keyId - The actual key value
   * @param config - Rate limit configuration
   * @returns Rate limit result
   */
  async checkRateLimit(
    keyType: 'user' | 'api_key' | 'ip',
    keyId: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    console.log(`[RATE_LIMITER] checkRateLimit START: keyType=${keyType}, keyId=${keyId}, config.requestsPerMinute=${config.requestsPerMinute}`)
    
    // If limit is null, undefined, or 0, allow unlimited requests
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
    
      // Check database state BEFORE consume
      try {
        const expectedKey = `${keyPrefix}_${keyId}`
        const dbEntryBefore = this.db.prepare(`
          SELECT key, points, expire 
          FROM rate_limit_buckets 
          WHERE key = ?
        `).get(expectedKey)
        
        console.log(`[RATE_LIMITER] Database entry BEFORE consume (key=${expectedKey}):`, JSON.stringify(dbEntryBefore, null, 2))
        
        // Also check all entries with the keyPrefix to see what's stored
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
    
    // Try to get current state before consuming
    try {
      const currentState = await limiter.get(keyId)
      console.log(`[RATE_LIMITER] Current state from limiter.get(${keyId}):`, JSON.stringify(currentState, null, 2))
    } catch (getError: any) {
      console.log(`[RATE_LIMITER] limiter.get(${keyId}) returned error (expected if no previous requests):`, getError.message)
    }

    try {
      console.log(`[RATE_LIMITER] Calling limiter.consume(${keyId})...`)
      // Pass keyId to consume - it will be combined with keyPrefix internally
      const result = await limiter.consume(keyId)
      
      console.log(`[RATE_LIMITER] consume() SUCCESS:`, {
        remainingPoints: result.remainingPoints,
        msBeforeNext: result.msBeforeNext,
        result: JSON.stringify(result),
      })
      
      // Check database state AFTER consume
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
      // Rate limit exceeded
      console.error(`[RATE_LIMITER] consume() FAILED (rate limit exceeded):`, {
        message: rejRes.message,
        msBeforeNext: rejRes.msBeforeNext,
        remainingPoints: rejRes.remainingPoints,
        error: JSON.stringify(rejRes),
      })
      
      // Check database state AFTER failed consume
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

  /**
   * Get current rate limit status for a key (for monitoring/debugging)
   */
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

  /**
   * Clean up old rate limit buckets
   * Run periodically (e.g., every 5 minutes)
   */
  cleanup(): number {
    // Clean up expired entries (expire is Unix timestamp in milliseconds)
    const cutoff = Date.now()
    
    const stmt = this.db.prepare(`
      DELETE FROM rate_limit_buckets WHERE expire IS NOT NULL AND expire < ?
    `)
    
    const result = stmt.run(cutoff)
    return result.changes
  }

  /**
   * Clear rate limit data for a specific key (for debugging/admin)
   */
  clearKey(keyType: 'user' | 'api_key' | 'ip', keyId: string): number {
    // The key stored in the database will be prefixed with rl_${keyType}
    const expectedKey = `rl_${keyType}_${keyId}`
    
    const stmt = this.db.prepare(`
      DELETE FROM rate_limit_buckets 
      WHERE key = ?
    `)
    
    const result = stmt.run(expectedKey)
    return result.changes
  }

  /**
   * Get current rate limit status for debugging
   */
  async debugKey(keyType: 'user' | 'api_key' | 'ip', keyId: string, limit: number | null): Promise<any> {
    if (limit === null || limit === 0) {
      return { message: 'Unlimited - no rate limiting applied' }
    }

    const limiter = await this.getLimiter(keyType, keyId, limit)
    const keyPrefix = `rl_${keyType}`
    const fullKey = `${keyPrefix}_${keyId}`
    
    try {
      const result = await limiter.get(keyId)
      
      // Also check database directly
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

// Export singleton instance
export const rateLimiterService = new RateLimiterService()
